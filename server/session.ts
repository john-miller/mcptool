import { SseError, SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CoreSession } from '../shared/core-session.js';
import type { ConnectionConfig } from '../shared/types.js';
import { StoredOAuthProvider } from './oauth.js';

// The full runtime's session: everything the core does, plus what only a process can do:
// spawn stdio servers (with their stderr), and keep OAuth credentials on disk.

function createTransport(config: ConnectionConfig, oauth?: StoredOAuthProvider): Transport {
  switch (config.transport) {
    case 'stdio': {
      if (!config.command) throw new Error('A command is required for stdio connections');
      return new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: { ...getDefaultEnvironment(), ...config.env },
        cwd: config.cwd || undefined,
        stderr: 'pipe',
      });
    }
    case 'streamable-http':
    case 'sse': {
      if (!config.url) throw new Error('A URL is required for HTTP connections');
      const url = new URL(config.url);
      const requestInit = { headers: config.headers ?? {} };
      const authProvider = oauth;
      return config.transport === 'sse'
        ? new SSEClientTransport(url, { requestInit, authProvider })
        : new StreamableHTTPClientTransport(url, { requestInit, authProvider });
    }
  }
}

/** Uses OAuth unless the user supplies their own Authorization header. */
export function wantsOAuth(config: ConnectionConfig) {
  if (config.transport === 'stdio' || !config.url) return false;
  return !Object.keys(config.headers ?? {}).some((h) => h.toLowerCase() === 'authorization');
}

/** The SDK's HTTP errors carry the status in `code` but often have an empty message body. */
export function describeError(err: unknown): string {
  if (err instanceof StreamableHTTPError || err instanceof SseError) {
    const status = err.code ? `HTTP ${err.code}` : 'HTTP error';
    const detail = err.message.replace(/^(Streamable HTTP|SSE) error:\s*/, '').replace(/:\s*$/, '');
    const hint =
      err.code === 401
        ? ' (the server requires authorization: add an Authorization header, or remove it to use OAuth)'
        : err.code === 404
          ? ' (check the URL and the transport type)'
          : err.code === 405
            ? ' (the endpoint may expect the other HTTP transport)'
            : '';
    return `${status}: ${detail}${hint}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export class Session extends CoreSession {
  readonly oauth?: StoredOAuthProvider;

  constructor(readonly config: ConnectionConfig) {
    const oauth = wantsOAuth(config) ? new StoredOAuthProvider(config.id, config.url!) : undefined;
    const raw = createTransport(config, oauth);
    super({ connectionId: config.id, connectionName: config.name, transport: raw, roots: config.roots });
    this.oauth = oauth;
    if (raw instanceof StdioClientTransport) {
      raw.stderr?.on('data', (chunk: Buffer) => this.emit({ type: 'stderr', text: chunk.toString() }));
    }
  }

  protected override describeError(error: Error): string {
    return describeError(error);
  }
}
