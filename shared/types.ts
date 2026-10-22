// Types shared between the backend and the web UI.

export type TransportKind = 'stdio' | 'streamable-http' | 'sse';

export interface ConnectionConfig {
  id: string;
  name: string;
  transport: TransportKind;
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  // http / sse
  url?: string;
  headers?: Record<string, string>;
  // Roots advertised to the server when it asks for roots/list (file:// URIs).
  roots?: { uri: string; name?: string }[];
}

export interface SessionInfo {
  id: string;
  connectionId: string;
  connectionName: string;
  /** False once the server or the user closed it; the session is kept briefly so its log can be read. */
  live: boolean;
  serverInfo?: { name: string; version: string; title?: string };
  protocolVersion?: string;
  capabilities?: Record<string, unknown>;
  instructions?: string;
}

/** A tap: a real host's traffic to a server, mirrored by the stdio shim (bin/tap.mjs). */
export interface TapInfo {
  id: string;
  name: string;
  command: string;
  args: string[];
  pid?: number;
  startedAt: number;
  live: boolean;
  closedReason?: string;
}

/** What the shim sends the API: one entry per mirrored thing. */
export type TapEntry =
  | { type: 'message'; direction: 'out' | 'in'; message: JsonRpcMessage }
  | { type: 'stderr'; text: string }
  | { type: 'closed'; reason: string };

export type SessionEvent =
  | { seq: number; ts: number; type: 'message'; direction: 'out' | 'in'; message: JsonRpcMessage }
  | { seq: number; ts: number; type: 'stderr'; text: string }
  | { seq: number; ts: number; type: 'server-request'; rid: string; method: string; params: unknown }
  | { seq: number; ts: number; type: 'server-request-resolved'; rid: string }
  | { seq: number; ts: number; type: 'error'; text: string }
  | { seq: number; ts: number; type: 'closed'; reason: string };

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewSessionEvent = DistributiveOmit<SessionEvent, 'seq' | 'ts'>;

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface RpcResponse {
  ok: boolean;
  result?: unknown;
  error?: { code?: number; message: string; data?: unknown };
  durationMs: number;
}

// Answer the UI gives to a pending server-initiated request (sampling, elicitation, ...).
export type ServerRequestAnswer =
  | { result: Record<string, unknown> }
  | { error: { code: number; message: string } };
