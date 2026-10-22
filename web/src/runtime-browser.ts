import { auth, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { SseError, SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { CoreSession, uuid } from '../../shared/core-session';
import type { ConnectionConfig, RpcResponse, ServerRequestAnswer, SessionEvent, SessionInfo, TapInfo } from '../../shared/types';
import type { AuthStatus } from './api';
import { NeedsAuth, type Runtime, type RuntimeCapabilities } from './runtime';

// The lite runtime: the MCP client runs in this page. Only HTTP/SSE servers, and only those
// that allow cross-origin requests from wherever this page is served. Connections and OAuth
// credentials live in this browser's storage; sessions live as long as the page.

const CONNECTIONS_KEY = 'mcptool.lite.connections';
const PENDING_AUTH_KEY = 'mcptool.lite.pendingAuth';
const authKey = (connectionId: string) => `mcptool.lite.oauth.${connectionId}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the value lives in memory only.
  }
}

interface StoredAuth {
  serverUrl: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  tokensSavedAt?: number;
  codeVerifier?: string;
  state?: string;
}

/** OAuth client state in localStorage; the sign-in redirect leaves and comes back to this page. */
class BrowserOAuthProvider implements OAuthClientProvider {
  private data: StoredAuth;
  authorizationUrl?: URL;

  constructor(
    private connectionId: string,
    readonly serverUrl: string,
  ) {
    const stored = read<StoredAuth | null>(authKey(connectionId), null);
    this.data = stored && stored.serverUrl === serverUrl ? stored : { serverUrl };
  }

  private save(patch: Partial<StoredAuth>) {
    this.data = { ...this.data, ...patch };
    write(authKey(this.connectionId), this.data);
  }

  get redirectUrl() {
    return location.origin + location.pathname;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'mcptool lite',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }
  state() {
    const s = uuid();
    this.save({ state: s });
    return s;
  }
  clientInformation() {
    return this.data.client;
  }
  saveClientInformation(client: OAuthClientInformationMixed) {
    this.save({ client });
  }
  tokens() {
    return this.data.tokens;
  }
  saveTokens(tokens: OAuthTokens) {
    this.save({ tokens, tokensSavedAt: Date.now() });
  }
  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }
  saveCodeVerifier(codeVerifier: string) {
    this.save({ codeVerifier });
  }
  codeVerifier() {
    if (!this.data.codeVerifier) throw new Error('No PKCE code verifier saved');
    return this.data.codeVerifier;
  }
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'all') this.save({ client: undefined, tokens: undefined, codeVerifier: undefined });
    else if (scope === 'client') this.save({ client: undefined });
    else if (scope === 'tokens') this.save({ tokens: undefined });
    else if (scope === 'verifier') this.save({ codeVerifier: undefined });
  }
  status(): AuthStatus {
    const t = this.data.tokens;
    return {
      signedIn: !!t?.access_token,
      scope: t?.scope,
      expiresAt: t?.expires_in && this.data.tokensSavedAt ? this.data.tokensSavedAt + t.expires_in * 1000 : undefined,
      canRefresh: !!t?.refresh_token,
    };
  }
}

const wantsOAuth = (c: ConnectionConfig) => !!c.url && !Object.keys(c.headers ?? {}).some((h) => h.toLowerCase() === 'authorization');

function createTransport(config: ConnectionConfig, authProvider?: OAuthClientProvider): Transport {
  if (config.transport === 'stdio' || !config.url) throw new Error('Lite mcptool runs in the browser and can only reach HTTP or SSE servers.');
  const url = new URL(config.url);
  const requestInit = { headers: config.headers ?? {} };
  return config.transport === 'sse' ? new SSEClientTransport(url, { requestInit, authProvider }) : new StreamableHTTPClientTransport(url, { requestInit, authProvider });
}

/** Makes the browser's failure modes say what happened: CORS and HTTP status, not "Failed to fetch". */
function describe(err: unknown): string {
  if (err instanceof StreamableHTTPError || err instanceof SseError) {
    const status = err.code ? `HTTP ${err.code}` : 'HTTP error';
    const detail = err.message.replace(/^(Streamable HTTP|SSE) error:\s*/, '').replace(/:\s*$/, '');
    return `${status}${detail ? `: ${detail}` : ''}`;
  }
  const m = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed/i.test(m)) {
    return `The browser could not reach the server (${m}). From a web page this usually means the server does not allow cross-origin requests from ${location.origin} (CORS), or it is not running. The full mcptool connects from a local process and is not subject to this.`;
  }
  return m;
}

class BrowserSession extends CoreSession {
  constructor(
    readonly config: ConnectionConfig,
    readonly oauth?: BrowserOAuthProvider,
  ) {
    super({ connectionId: config.id, connectionName: config.name, transport: createTransport(config, oauth), roots: config.roots });
  }
  protected override describeError(error: Error): string {
    return describe(error);
  }
}

export class BrowserRuntime implements Runtime {
  readonly capabilities: RuntimeCapabilities = { label: 'lite', stdio: false, taps: false, persistentSessions: false };
  private sessions = new Map<string, BrowserSession>();

  /** Finishes a sign-in the page was sent away for, then forgets the leftover query string. */
  async init() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const state = params.get('state');
    const pending = read<{ connectionId: string; state: string } | null>(PENDING_AUTH_KEY, null);
    if (code && state && pending && pending.state === state) {
      localStorage.removeItem(PENDING_AUTH_KEY);
      const config = read<ConnectionConfig[]>(CONNECTIONS_KEY, []).find((c) => c.id === pending.connectionId);
      if (config?.url) {
        const provider = new BrowserOAuthProvider(config.id, config.url);
        try {
          await auth(provider, { serverUrl: config.url, authorizationCode: code });
          sessionStorage.setItem('mcptool.lite.connectAfterAuth', config.id);
        } catch (err) {
          sessionStorage.setItem('mcptool.lite.authError', describe(err));
        }
      }
      history.replaceState(null, '', location.pathname);
    } else if (params.get('error')) {
      sessionStorage.setItem('mcptool.lite.authError', params.get('error_description') ?? params.get('error')!);
      history.replaceState(null, '', location.pathname);
    }
  }

  /** The connection to resume once a sign-in round trip has finished, if any. */
  takeConnectAfterAuth(): { connectionId?: string; error?: string } {
    const connectionId = sessionStorage.getItem('mcptool.lite.connectAfterAuth') ?? undefined;
    const error = sessionStorage.getItem('mcptool.lite.authError') ?? undefined;
    sessionStorage.removeItem('mcptool.lite.connectAfterAuth');
    sessionStorage.removeItem('mcptool.lite.authError');
    return { connectionId, error };
  }

  async listConnections() {
    return { connections: read<ConnectionConfig[]>(CONNECTIONS_KEY, []), location: 'this browser' };
  }
  async saveConnections(connections: ConnectionConfig[]) {
    write(CONNECTIONS_KEY, connections);
  }
  async listSessions(): Promise<SessionInfo[]> {
    return [...this.sessions.values()].filter((s) => !s.closed).map((s) => s.info());
  }

  async connect(config: ConnectionConfig): Promise<SessionInfo> {
    for (const s of this.sessions.values()) if (s.config.id === config.id) void this.disconnect(s.id);
    const oauth = wantsOAuth(config) ? new BrowserOAuthProvider(config.id, config.url!) : undefined;
    const session = new BrowserSession(config, oauth);
    this.sessions.set(session.id, session);
    try {
      return await session.connect();
    } catch (err) {
      if (oauth?.authorizationUrl) {
        // Leaving the page: remember what to resume when the sign-in brings us back.
        write(PENDING_AUTH_KEY, { connectionId: config.id, state: oauth.authorizationUrl.searchParams.get('state') });
        this.sessions.delete(session.id);
        throw new NeedsAuth(oauth.authorizationUrl.href);
      }
      setTimeout(() => this.sessions.delete(session.id), 60_000);
      throw new Error(describe(err));
    }
  }

  private session(id: string): BrowserSession {
    const s = this.sessions.get(id);
    if (!s) throw new Error('Unknown session');
    return s;
  }
  async disconnect(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.sessions.delete(sessionId);
    await s.close().catch(() => {});
  }
  request(sessionId: string, method: string, params?: unknown, opts?: { key?: string; timeoutMs?: number }): Promise<RpcResponse> {
    return this.session(sessionId).request(method, params, opts);
  }
  async cancel(sessionId: string, key: string) {
    this.session(sessionId).cancel(key);
  }
  notify(sessionId: string, method: string, params?: unknown) {
    return this.session(sessionId).notify(method, params);
  }
  async answer(sessionId: string, rid: string, answer: ServerRequestAnswer) {
    this.session(sessionId).answerServerRequest(rid, answer);
  }
  subscribe(source: { sessionId: string } | { tapId: string }, onEvent: (e: SessionEvent) => void, onLost?: () => void): () => void {
    if ('tapId' in source) {
      onLost?.();
      return () => {};
    }
    const s = this.sessions.get(source.sessionId);
    if (!s) {
      onLost?.();
      return () => {};
    }
    return s.subscribe(onEvent, 0);
  }

  async waitForSignIn() {
    // Lite signs in by leaving the page; there is nothing to wait on here.
  }
  async authStatus(connectionId: string): Promise<AuthStatus> {
    const stored = read<StoredAuth | null>(authKey(connectionId), null);
    return stored ? new BrowserOAuthProvider(connectionId, stored.serverUrl).status() : { signedIn: false };
  }
  async accessToken(connectionId: string) {
    const token = read<StoredAuth | null>(authKey(connectionId), null)?.tokens?.access_token;
    if (!token) throw new Error('No stored access token for this connection');
    return token;
  }
  async signOut(connectionId: string) {
    localStorage.removeItem(authKey(connectionId));
  }
  async listTaps() {
    return { taps: [] as TapInfo[] };
  }
  subscribeTaps() {
    return () => {};
  }
  async forgetTap() {}
}
