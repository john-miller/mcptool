import type { ConnectionConfig, RpcResponse, ServerRequestAnswer, SessionEvent, SessionInfo, TapInfo } from '../../shared/types';
import { api, ApiError, type AuthStatus } from './api';

// The UI talks to one Runtime. Full: the local Node server (stdio, taps, OAuth on disk,
// sessions that survive a reload). Lite: the MCP client runs in the page itself, for HTTP
// servers that allow cross-origin requests; nothing else is needed, and nothing else exists.

export interface RuntimeCapabilities {
  /** Human name shown in the UI. */
  label: 'full' | 'lite';
  stdio: boolean;
  taps: boolean;
  /** Sessions live outside the page and can be re-attached after a reload. */
  persistentSessions: boolean;
}

/** Thrown by connect() when the server wants the user to sign in first. */
export class NeedsAuth extends Error {
  constructor(
    readonly authorizationUrl: string,
    /** Full runtime: the flow to wait on; the page stays. Lite: absent; the page navigates. */
    readonly flowId?: string,
    readonly sessionId?: string,
  ) {
    super('Authorization required');
  }
}

export interface DemoLaunch {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface Runtime {
  readonly capabilities: RuntimeCapabilities;
  listConnections(): Promise<{ connections: ConnectionConfig[]; location?: string; demo?: DemoLaunch }>;
  saveConnections(connections: ConnectionConfig[]): Promise<void>;
  listSessions(): Promise<SessionInfo[]>;
  connect(config: ConnectionConfig): Promise<SessionInfo>;
  disconnect(sessionId: string): Promise<void>;
  request(sessionId: string, method: string, params?: unknown, opts?: { key?: string; timeoutMs?: number }): Promise<RpcResponse>;
  cancel(sessionId: string, key: string): Promise<void>;
  notify(sessionId: string, method: string, params?: unknown): Promise<void>;
  answer(sessionId: string, rid: string, answer: ServerRequestAnswer): Promise<void>;
  /** Streams a session's (or tap's) events; `onLost` fires when the source is gone for good. */
  subscribe(source: { sessionId: string } | { tapId: string }, onEvent: (e: SessionEvent) => void, onLost?: () => void): () => void;
  waitForSignIn(flowId: string): Promise<void>;
  authStatus(connectionId: string): Promise<AuthStatus>;
  accessToken(connectionId: string): Promise<string>;
  signOut(connectionId: string): Promise<void>;
  listTaps(): Promise<{ taps: TapInfo[]; shim?: string; apiUrl?: string }>;
  subscribeTaps(onTaps: (taps: TapInfo[]) => void): () => void;
  forgetTap(tapId: string): Promise<void>;
}

/** The full runtime: a thin client of the local server's HTTP API and event streams. */
export class ServerRuntime implements Runtime {
  readonly capabilities: RuntimeCapabilities = { label: 'full', stdio: true, taps: true, persistentSessions: true };

  listConnections = () => api.listConnections();
  saveConnections = (connections: ConnectionConfig[]) => api.saveConnections(connections).then(() => {});
  listSessions = () => api.listSessions().then((r) => r.sessions);

  async connect(config: ConnectionConfig): Promise<SessionInfo> {
    try {
      return await api.connect(config);
    } catch (err) {
      const body = err instanceof ApiError ? err.body : undefined;
      if (body?.needsAuth) throw new NeedsAuth(body.authorizationUrl as string, body.flowId as string, body.sessionId as string | undefined);
      throw err;
    }
  }

  disconnect = (sessionId: string) => api.disconnect(sessionId).then(() => {});
  request = (sessionId: string, method: string, params?: unknown, opts?: { key?: string; timeoutMs?: number }) => api.request(sessionId, method, params, opts);
  cancel = (sessionId: string, key: string) => api.cancel(sessionId, key).then(() => {});
  notify = (sessionId: string, method: string, params?: unknown) => api.notify(sessionId, method, params).then(() => {});
  answer = (sessionId: string, rid: string, answer: ServerRequestAnswer) => api.answer(sessionId, rid, answer).then(() => {});

  subscribe(source: { sessionId: string } | { tapId: string }, onEvent: (e: SessionEvent) => void, onLost?: () => void): () => void {
    const url = 'tapId' in source ? `/api/taps/${source.tapId}/events` : `/api/sessions/${source.sessionId}/events`;
    const es = new EventSource(url);
    es.onmessage = (e) => onEvent(JSON.parse(e.data));
    // EventSource retries on its own; CLOSED means the server refused: the source is gone.
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) onLost?.();
    };
    return () => es.close();
  }

  waitForSignIn = (flowId: string) => api.waitForSignIn(flowId).then(() => {});
  authStatus = (connectionId: string) => api.authStatus(connectionId);
  accessToken = (connectionId: string) => api.accessToken(connectionId);
  signOut = (connectionId: string) => api.signOut(connectionId).then(() => {});
  listTaps = () => api.listTaps();

  subscribeTaps(onTaps: (taps: TapInfo[]) => void): () => void {
    const es = new EventSource('/api/taps/events');
    es.onmessage = (e) => onTaps((JSON.parse(e.data) as { taps: TapInfo[] }).taps);
    return () => es.close();
  }

  forgetTap = (tapId: string) => api.forgetTap(tapId).then(() => {});
}

let current: Runtime | undefined;

export function runtime(): Runtime {
  if (!current) throw new Error('Runtime not initialised');
  return current;
}

/**
 * Picks the runtime: the lite build (VITE_RUNTIME=browser) never looks for a server; otherwise
 * the server is used when it answers, and the page falls back to lite when it does not.
 */
export async function initRuntime(): Promise<Runtime> {
  if (current) return current;
  const forced = import.meta.env.VITE_RUNTIME as string | undefined;
  if (forced !== 'browser') {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 1500);
      const res = await fetch('/api/connections', { signal: controller.signal });
      clearTimeout(t);
      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
        current = new ServerRuntime();
        return current;
      }
    } catch {
      // No server here: lite it is.
    }
    if (forced === 'server') throw new Error('The mcptool server is not reachable');
  }
  const { BrowserRuntime } = await import('./runtime-browser');
  current = new BrowserRuntime();
  await (current as InstanceType<typeof BrowserRuntime>).init();
  return current;
}
