import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { ConnectionConfig, ServerRequestAnswer, SessionEvent, TapEntry } from '../shared/types.js';
import { authStatus, clearAuth, OAUTH_CALLBACK_PATH, storedAccessToken, type StoredOAuthProvider } from './oauth.js';
import { describeError, Session } from './session.js';
import { loadConnections, saveConnections, storeLocation } from './store.js';
import { TapRegistry } from './tap.js';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
export const projectDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/** How to launch the bundled demo server; differs between a checkout (tsx) and a packaged app. */
export interface DemoLaunch {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface ServerOptions {
  port?: number;
  host?: string;
  /** Where the built web UI lives; served when present. */
  webDist?: string;
  demo?: DemoLaunch;
  /** Absolute path of the tap shim, shown to users for host configs. */
  shimPath?: string;
}

export interface RunningServer {
  port: number;
  url: string;
  taps: TapRegistry;
  close(): Promise<void>;
}

/** Builds and starts the API (and the UI when built). Used by `npm start` and by the Electron shell. */
export async function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const HOST = opts.host ?? '127.0.0.1';
  const PORT = opts.port ?? Number(process.env.PORT ?? 3737);
  const webDist = opts.webDist ?? join(projectDir, 'dist');
  const shimPath = opts.shimPath ?? join(projectDir, 'bin', 'tap.mjs');
  const demo: DemoLaunch = opts.demo ?? { command: 'npx', args: ['tsx', 'examples/demo-server.ts'], cwd: projectDir };

  const sessions = new Map<string, Session>();
  const taps = new TapRegistry();
  const app = express();

  // This API can spawn arbitrary processes, so only accept requests that are
  // genuinely local: guards against DNS rebinding and cross-site requests.
  app.use((req, res, next) => {
    const hostname = (req.headers.host ?? '').replace(/:\d+$/, '');
    const origin = req.headers.origin;
    const originOk = !origin || (URL.canParse(origin) && LOCAL_HOSTNAMES.has(new URL(origin).hostname));
    if (!LOCAL_HOSTNAMES.has(hostname) || !originOk) {
      res.status(403).json({ error: 'Forbidden: mcptool only accepts local requests' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '20mb' }));

  function getSession(req: Request, res: Response): Session | undefined {
    const session = sessions.get(String(req.params.id));
    if (!session) res.status(404).json({ error: 'Unknown session' });
    return session;
  }

  app.get('/api/connections', async (_req, res) => {
    res.json({ connections: await loadConnections(), location: storeLocation, projectDir, demo });
  });

  app.put('/api/connections', async (req, res) => {
    await saveConnections(req.body.connections as ConnectionConfig[]);
    res.json({ ok: true });
  });

  // Live sessions, so a reloaded UI can re-attach instead of losing them.
  app.get('/api/sessions', (_req, res) => {
    res.json({ sessions: [...sessions.values()].map((s) => s.info()) });
  });

  app.post('/api/sessions', async (req, res) => {
    const config = req.body as ConnectionConfig;
    let session: Session;
    try {
      session = new Session(config);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    // One live session per saved connection: connecting again replaces the old one.
    for (const existing of sessions.values()) {
      if (existing.config.id === config.id) {
        sessions.delete(existing.id);
        void existing.close().catch(() => {});
      }
    }
    sessions.set(session.id, session);
    try {
      res.json(await session.connect());
    } catch (err) {
      // Keep the session around briefly so the UI can still read its stderr/log.
      setTimeout(() => sessions.delete(session.id), 60_000);
      const authorizationUrl = session.oauth?.authorizationUrl;
      if (session.oauth && authorizationUrl) {
        const flowId = startAuthFlow(session.oauth);
        res.status(401).json({
          error: 'Authorization required',
          needsAuth: true,
          authorizationUrl: authorizationUrl.href,
          flowId,
          sessionId: session.id,
        });
        return;
      }
      res.status(502).json({ error: describeError(err), sessionId: session.id });
    }
  });

  // ---- OAuth: the UI opens authorizationUrl, the browser comes back to the callback,
  // the UI long-polls /wait and then connects again with the stored tokens.

  interface AuthFlow {
    provider: StoredOAuthProvider;
    done: Promise<void>;
    resolve: () => void;
    reject: (err: Error) => void;
  }
  const authFlows = new Map<string, AuthFlow>();

  function startAuthFlow(provider: StoredOAuthProvider): string {
    let resolve!: () => void;
    let reject!: (err: Error) => void;
    const done = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    done.catch(() => {}); // Observed via /wait; don't crash if nobody is waiting.
    authFlows.set(provider.stateValue, { provider, done, resolve, reject });
    setTimeout(() => authFlows.delete(provider.stateValue), 15 * 60_000);
    return provider.stateValue;
  }

  app.get(OAUTH_CALLBACK_PATH, async (req, res) => {
    const { code, state, error, error_description } = req.query as Record<string, string | undefined>;
    const flow = state ? authFlows.get(state) : undefined;
    if (!flow) {
      res.status(400).send(callbackPage('Sign-in expired', 'Start the connection again from mcptool.', false));
      return;
    }
    if (error || !code) {
      const message = error_description ?? error ?? 'No authorization code was returned';
      flow.reject(new Error(message));
      res.status(400).send(callbackPage('Sign-in failed', message, false));
      return;
    }
    try {
      const result = await auth(flow.provider, { serverUrl: flow.provider.serverUrl, authorizationCode: code });
      if (result !== 'AUTHORIZED') throw new Error('The authorization server did not issue a token');
      flow.resolve();
      res.send(callbackPage('Signed in', 'You can close this tab and return to mcptool.', true));
    } catch (err) {
      flow.reject(err as Error);
      res.status(502).send(callbackPage('Sign-in failed', (err as Error).message, false));
    }
  });

  app.post('/api/oauth/flows/:flowId/wait', async (req, res) => {
    const flow = authFlows.get(req.params.flowId);
    if (!flow) {
      res.status(404).json({ error: 'Unknown or expired sign-in' });
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out waiting for sign-in')), 10 * 60_000);
    });
    try {
      await Promise.race([flow.done, timeout]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    } finally {
      clearTimeout(timer);
    }
  });

  app.get('/api/oauth/connections/:id', (req, res) => {
    res.json(authStatus(req.params.id));
  });

  // For the UI's JWT decoder. Only reachable from localhost (see the guard at the top).
  app.get('/api/oauth/connections/:id/token', (req, res) => {
    const token = storedAccessToken(req.params.id);
    if (!token) res.status(404).json({ error: 'No stored access token for this connection' });
    else res.json({ accessToken: token });
  });

  app.delete('/api/oauth/connections/:id', (req, res) => {
    clearAuth(req.params.id);
    res.json({ ok: true });
  });

  function callbackPage(title: string, message: string, ok: boolean) {
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    return `<!doctype html><html><head><meta charset="utf-8"><title>mcptool: ${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
  main { max-width: 420px; text-align: center; }
  h1 { font-size: 20px; color: ${ok ? '#1a7f37' : '#cf222e'}; }
</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(message)}</p></main>
${ok ? '<script>setTimeout(() => window.close(), 1500)</script>' : ''}</body></html>`;
  }

  app.delete('/api/sessions/:id', async (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    sessions.delete(session.id);
    await session.close().catch(() => {});
    res.json({ ok: true });
  });

  /** Streams a session's or tap's events as server-sent events, replaying from Last-Event-ID. */
  function streamEvents(req: Request, res: Response, source: { subscribe: (l: (e: SessionEvent) => void, since: number) => () => void }) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const since = Number(req.headers['last-event-id'] ?? 0);
    const unsubscribe = source.subscribe((event) => {
      res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
    }, since);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  }

  app.get('/api/sessions/:id/events', (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    streamEvents(req, res, session);
  });

  // ---- Taps: a real host's traffic, mirrored by bin/tap.mjs.

  // `apiUrl` is where the shim must mirror to; it matters when 3737 was taken and another port won.
  let apiUrl = `http://127.0.0.1:${PORT}`;
  app.get('/api/taps', (_req, res) => {
    res.json({ taps: taps.list(), shim: shimPath, apiUrl });
  });

  // The list of taps as it changes, so the UI shows a new capture the moment a host starts one.
  app.get('/api/taps/events', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = () => res.write(`data: ${JSON.stringify({ taps: taps.list() })}\n\n`);
    send();
    const off = taps.onChange(send);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      off();
    });
  });

  app.post('/api/taps', (req, res) => {
    const { name, command, args, pid } = req.body as { name?: string; command?: string; args?: string[]; pid?: number };
    if (!command) {
      res.status(400).json({ error: 'command is required' });
      return;
    }
    const tap = taps.add(name || command, command, args ?? [], pid);
    res.json({ id: tap.id });
  });

  app.post('/api/taps/:id/entries', (req, res) => {
    const tap = taps.get(String(req.params.id));
    if (!tap) {
      res.status(404).json({ error: 'Unknown tap' });
      return;
    }
    const entries = req.body as TapEntry[];
    tap.ingest(Array.isArray(entries) ? entries : []);
    if (entries.some((e) => e.type === 'closed')) taps.changed();
    res.json({ ok: true });
  });

  app.get('/api/taps/:id/events', (req, res) => {
    const tap = taps.get(String(req.params.id));
    if (!tap) {
      res.status(404).json({ error: 'Unknown tap' });
      return;
    }
    streamEvents(req, res, tap);
  });

  app.delete('/api/taps/:id', (req, res) => {
    taps.remove(String(req.params.id));
    res.json({ ok: true });
  });

  app.post('/api/sessions/:id/request', async (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    const { method, params, key, timeoutMs } = req.body;
    res.json(await session.request(method, params, { key, timeoutMs }));
  });

  app.post('/api/sessions/:id/cancel/:key', (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    session.cancel(req.params.key as string);
    res.json({ ok: true });
  });

  app.post('/api/sessions/:id/notify', async (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    await session.notify(req.body.method, req.body.params);
    res.json({ ok: true });
  });

  app.post('/api/sessions/:id/server-requests/:rid', (req, res) => {
    const session = getSession(req, res);
    if (!session) return;
    const found = session.answerServerRequest(req.params.rid as string, req.body as ServerRequestAnswer);
    res.status(found ? 200 : 404).json({ ok: found });
  });

  // Serve the built web UI from the same origin when it exists.
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: err.message });
  });

  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(PORT, HOST, () => resolve(s));
    s.on('error', reject);
  });
  const port = (server.address() as { port: number }).port;
  apiUrl = `http://127.0.0.1:${port}`;

  return {
    port,
    url: `http://localhost:${port}`,
    taps,
    async close() {
      await Promise.allSettled([...sessions.values()].map((s) => s.close()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// Run directly (`npm start`, `tsx server/index.ts`): start on the default port and log.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const running = await startServer();
  const hasUi = existsSync(join(projectDir, 'dist'));
  console.log(`mcptool API listening on http://127.0.0.1:${running.port}\nUI: ${hasUi ? running.url : 'http://localhost:5173 (run `npm run dev`)'}`);
  const shutdown = async () => {
    await running.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
