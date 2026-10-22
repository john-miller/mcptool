import type { ConnectionConfig, RpcResponse, ServerRequestAnswer, SessionInfo, TapInfo } from '../../shared/types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const hasBody = init.json !== undefined;
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(init.json) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? res.statusText, body);
  return body as T;
}

export const api = {
  listConnections: () =>
    call<{ connections: ConnectionConfig[]; location: string; projectDir: string; demo?: { command: string; args: string[]; cwd?: string; env?: Record<string, string> } }>('/connections'),
  saveConnections: (connections: ConnectionConfig[]) => call('/connections', { method: 'PUT', json: { connections } }),
  listSessions: () => call<{ sessions: SessionInfo[] }>('/sessions'),
  listTaps: () => call<{ taps: TapInfo[]; shim: string; apiUrl?: string }>('/taps'),
  forgetTap: (id: string) => call(`/taps/${id}`, { method: 'DELETE' }),
  connect: (config: ConnectionConfig) => call<SessionInfo>('/sessions', { method: 'POST', json: config }),
  disconnect: (id: string) => call(`/sessions/${id}`, { method: 'DELETE' }),
  request: (id: string, method: string, params?: unknown, opts: { key?: string; timeoutMs?: number } = {}) =>
    call<RpcResponse>(`/sessions/${id}/request`, { method: 'POST', json: { method, params, ...opts } }),
  cancel: (id: string, key: string) => call(`/sessions/${id}/cancel/${encodeURIComponent(key)}`, { method: 'POST' }),
  notify: (id: string, method: string, params?: unknown) =>
    call(`/sessions/${id}/notify`, { method: 'POST', json: { method, params } }),
  answer: (id: string, rid: string, answer: ServerRequestAnswer) =>
    call(`/sessions/${id}/server-requests/${rid}`, { method: 'POST', json: answer }),
  waitForSignIn: (flowId: string) => call(`/oauth/flows/${encodeURIComponent(flowId)}/wait`, { method: 'POST' }),
  authStatus: (connectionId: string) => call<AuthStatus>(`/oauth/connections/${encodeURIComponent(connectionId)}`),
  accessToken: (connectionId: string) =>
    call<{ accessToken: string }>(`/oauth/connections/${encodeURIComponent(connectionId)}/token`).then((r) => r.accessToken),
  signOut: (connectionId: string) => call(`/oauth/connections/${encodeURIComponent(connectionId)}`, { method: 'DELETE' }),
};

export interface AuthStatus {
  signedIn: boolean;
  scope?: string;
  expiresAt?: number;
  canRefresh?: boolean;
}

