import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { McpError, ResultSchema, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { NewSessionEvent, RpcResponse, ServerRequestAnswer, SessionEvent, SessionInfo } from './types.js';

// The part of a session that is the same wherever it runs: in the Node server (full) or in
// the page (lite). Records every frame, answers server-initiated requests through the UI,
// and exposes the stream to subscribers. Transport creation is the caller's business.

const MAX_BUFFERED_EVENTS = 5000;

export const uuid = () => globalThis.crypto.randomUUID();

/** Wraps a real transport so every JSON-RPC message in either direction is recorded. */
export class RecordingTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  protocolVersion?: string;

  constructor(
    private inner: Transport,
    private record: (direction: 'in' | 'out', message: JSONRPCMessage) => void,
  ) {}

  get sessionId() {
    return this.inner.sessionId;
  }

  async start() {
    this.inner.onmessage = (message) => {
      this.record('in', message);
      this.onmessage?.(message);
    };
    this.inner.onclose = () => this.onclose?.();
    this.inner.onerror = (error) => this.onerror?.(error);
    await this.inner.start();
  }

  async send(message: JSONRPCMessage, options?: Parameters<Transport['send']>[1]) {
    this.record('out', message);
    await this.inner.send(message, options);
  }

  async close() {
    await this.inner.close();
  }

  setProtocolVersion(version: string) {
    this.protocolVersion = version;
    this.inner.setProtocolVersion?.(version);
  }
}

export interface CoreSessionOptions {
  connectionId: string;
  connectionName: string;
  transport: Transport;
  /** Roots advertised to the server when it asks for roots/list. */
  roots?: { uri: string; name?: string }[];
  clientInfo?: { name: string; version: string };
}

interface PendingServerRequest {
  resolve: (answer: ServerRequestAnswer) => void;
}

export class CoreSession {
  readonly id = uuid();
  readonly client: Client;
  readonly connectionId: string;
  readonly connectionName: string;
  protected transport: RecordingTransport;
  private events: SessionEvent[] = [];
  private seq = 0;
  private listeners = new Set<(event: SessionEvent) => void>();
  private pendingServerRequests = new Map<string, PendingServerRequest>();
  private inflight = new Map<string, AbortController>();
  closed = false;
  protected closingByUser = false;

  constructor(opts: CoreSessionOptions) {
    this.connectionId = opts.connectionId;
    this.connectionName = opts.connectionName;
    this.transport = new RecordingTransport(opts.transport, (direction, message) => this.emit({ type: 'message', direction, message: message as never }));

    // Advertise the client-side features so servers can exercise them; the human at the UI
    // plays the part an LLM host would normally play.
    this.client = new Client(opts.clientInfo ?? { name: 'mcptool', version: '0.1.0' }, {
      capabilities: {
        sampling: {},
        elicitation: { form: {}, url: {} },
        roots: { listChanged: true },
      },
    });

    this.client.fallbackRequestHandler = async (request) => {
      if (request.method === 'roots/list') return { roots: opts.roots ?? [] };
      const answer = await this.askUser(request.method, request.params);
      if ('error' in answer) throw new McpError(answer.error.code, answer.error.message);
      return answer.result;
    };
    this.client.onclose = () => this.markClosed(this.closingByUser ? 'Disconnected by user' : 'Connection closed');
    this.client.onerror = (error) => this.emit({ type: 'error', text: this.describeError(error) });
  }

  /** Subclasses can turn transport errors into something more readable. */
  protected describeError(error: Error): string {
    return error.message;
  }

  async connect(): Promise<SessionInfo> {
    await this.client.connect(this.transport);
    return this.info();
  }

  info(): SessionInfo {
    return {
      id: this.id,
      connectionId: this.connectionId,
      connectionName: this.connectionName,
      live: !this.closed,
      serverInfo: this.client.getServerVersion(),
      protocolVersion: this.transport.protocolVersion,
      capabilities: this.client.getServerCapabilities() as Record<string, unknown> | undefined,
      instructions: this.client.getInstructions(),
    };
  }

  /**
   * Sends an arbitrary JSON-RPC request. Results are not validated against typed schemas so
   * that the UI shows exactly what the server returned, even when it is non-conformant.
   */
  async request(method: string, params: unknown, opts: { key?: string; timeoutMs?: number } = {}): Promise<RpcResponse> {
    const started = performance.now();
    const controller = new AbortController();
    if (opts.key) this.inflight.set(opts.key, controller);
    try {
      const result = await this.client.request({ method, params: params as never } as never, ResultSchema, {
        signal: controller.signal,
        timeout: opts.timeoutMs ?? 60_000,
        resetTimeoutOnProgress: true,
        // Supplying onprogress makes the SDK attach a progressToken, so tools can report progress.
        onprogress: method === 'tools/call' ? () => {} : undefined,
      });
      return { ok: true, result, durationMs: performance.now() - started };
    } catch (err) {
      const error =
        err instanceof McpError ? { code: err.code, message: err.message, data: err.data } : { message: err instanceof Error ? this.describeError(err) : String(err) };
      return { ok: false, error, durationMs: performance.now() - started };
    } finally {
      if (opts.key) this.inflight.delete(opts.key);
    }
  }

  cancel(key: string) {
    this.inflight.get(key)?.abort('Cancelled by user');
  }

  async notify(method: string, params?: unknown) {
    await this.client.notification({ method, params: params as never } as never);
  }

  private askUser(method: string, params: unknown): Promise<ServerRequestAnswer> {
    const rid = uuid();
    return new Promise((resolve) => {
      this.pendingServerRequests.set(rid, { resolve });
      this.emit({ type: 'server-request', rid, method, params });
    });
  }

  answerServerRequest(rid: string, answer: ServerRequestAnswer): boolean {
    const pending = this.pendingServerRequests.get(rid);
    if (!pending) return false;
    this.pendingServerRequests.delete(rid);
    pending.resolve(answer);
    this.emit({ type: 'server-request-resolved', rid });
    return true;
  }

  subscribe(listener: (event: SessionEvent) => void, since = 0): () => void {
    for (const event of this.events) if (event.seq > since) listener(event);
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(event: NewSessionEvent) {
    const full = { ...event, seq: ++this.seq, ts: Date.now() } as SessionEvent;
    this.events.push(full);
    if (this.events.length > MAX_BUFFERED_EVENTS) this.events.splice(0, this.events.length - MAX_BUFFERED_EVENTS);
    for (const listener of this.listeners) listener(full);
  }

  protected markClosed(reason: string) {
    if (this.closed) return;
    this.closed = true;
    for (const [rid, pending] of this.pendingServerRequests) {
      pending.resolve({ error: { code: -32000, message: 'Session closed' } });
      this.pendingServerRequests.delete(rid);
    }
    this.emit({ type: 'closed', reason });
  }

  async close() {
    this.closingByUser = true;
    try {
      await this.client.close();
    } finally {
      this.markClosed('Disconnected by user');
    }
  }
}
