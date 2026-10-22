import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OAuthClientProvider, OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { dataDir } from './store.js';

const oauthDir = join(dataDir, 'oauth');
const PORT = Number(process.env.PORT ?? 3737);
export const OAUTH_CALLBACK_PATH = '/oauth/callback';
export const redirectUrl = `http://localhost:${PORT}${OAUTH_CALLBACK_PATH}`;

interface StoredAuth {
  serverUrl: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  tokensSavedAt?: number;
  codeVerifier?: string;
  discovery?: OAuthDiscoveryState;
}

const fileFor = (connectionId: string) => join(oauthDir, `${connectionId.replace(/[^a-zA-Z0-9-]/g, '_')}.json`);

function read(connectionId: string, serverUrl: string): StoredAuth {
  try {
    const stored = JSON.parse(readFileSync(fileFor(connectionId), 'utf8')) as StoredAuth;
    // Credentials belong to one server; a changed URL means starting over.
    if (stored.serverUrl === serverUrl) return stored;
  } catch {
    // No stored credentials yet.
  }
  return { serverUrl };
}

export function authStatus(connectionId: string) {
  try {
    const stored = JSON.parse(readFileSync(fileFor(connectionId), 'utf8')) as StoredAuth;
    const expiresIn = stored.tokens?.expires_in;
    return {
      signedIn: !!stored.tokens?.access_token,
      serverUrl: stored.serverUrl,
      scope: stored.tokens?.scope,
      expiresAt: expiresIn && stored.tokensSavedAt ? stored.tokensSavedAt + expiresIn * 1000 : undefined,
      canRefresh: !!stored.tokens?.refresh_token,
    };
  } catch {
    return { signedIn: false };
  }
}

export function storedAccessToken(connectionId: string): string | undefined {
  try {
    return (JSON.parse(readFileSync(fileFor(connectionId), 'utf8')) as StoredAuth).tokens?.access_token;
  } catch {
    return undefined;
  }
}

export function clearAuth(connectionId: string) {
  rmSync(fileFor(connectionId), { force: true });
}

/**
 * OAuth client for one connection, persisted to disk so sign-ins survive restarts.
 * Instead of opening a browser itself, it hands the authorization URL to
 * `onRedirect` so the UI can open it.
 */
export class StoredOAuthProvider implements OAuthClientProvider {
  readonly stateValue = randomBytes(16).toString('hex');
  authorizationUrl?: URL;
  private data: StoredAuth;

  constructor(
    private connectionId: string,
    readonly serverUrl: string,
  ) {
    this.data = read(connectionId, serverUrl);
  }

  private save(patch: Partial<StoredAuth>) {
    this.data = { ...this.data, ...patch };
    mkdirSync(oauthDir, { recursive: true });
    writeFileSync(fileFor(this.connectionId), JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }

  get redirectUrl() {
    return redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'mcptool',
      redirect_uris: [redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  state() {
    return this.stateValue;
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

  saveDiscoveryState(discovery: OAuthDiscoveryState) {
    this.save({ discovery });
  }

  discoveryState() {
    return this.data.discovery;
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    switch (scope) {
      case 'all':
        this.save({ client: undefined, tokens: undefined, codeVerifier: undefined, discovery: undefined });
        break;
      case 'client':
        this.save({ client: undefined });
        break;
      case 'tokens':
        this.save({ tokens: undefined });
        break;
      case 'verifier':
        this.save({ codeVerifier: undefined });
        break;
      case 'discovery':
        this.save({ discovery: undefined });
        break;
    }
  }
}
