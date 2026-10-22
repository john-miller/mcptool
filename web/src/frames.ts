import type { JsonRpcMessage, SessionEvent } from '../../shared/types';

// The stream shows frames: one row per thing that happened on the wire (or beside it:
// stderr, lifecycle). Frames are derived from the session's events and pair every
// response with its request.

export type FrameKind = 'request' | 'response' | 'notification' | 'server-request' | 'stderr' | 'note';

export interface Frame {
  seq: number;
  ts: number;
  kind: FrameKind;
  /** 'out' is client → server, 'in' is server → client. Notes have none. */
  direction?: 'out' | 'in';
  method: string;
  id?: string | number;
  /** For responses: how long after the request it arrived. */
  latencyMs?: number;
  /** The paired frame's seq (request ↔ response). */
  pairSeq?: number;
  summary: string;
  isError: boolean;
  /** A server-initiated request that still needs an answer. */
  awaiting?: boolean;
  message?: JsonRpcMessage;
  text?: string;
  rid?: string;
}

const preview = (value: unknown, max = 200) => {
  if (value === undefined) return '';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? s.slice(0, max) + '…' : s;
};

function requestSummary(m: JsonRpcMessage): string {
  const p = m.params as any;
  switch (m.method) {
    case 'tools/call':
      return `${p?.name} ${preview(p?.arguments ?? {})}`;
    case 'prompts/get':
      return `${p?.name} ${preview(p?.arguments ?? {})}`;
    case 'resources/read':
    case 'resources/subscribe':
    case 'resources/unsubscribe':
      return p?.uri ?? '';
    case 'initialize':
      return `protocol ${p?.protocolVersion} · ${p?.clientInfo?.name} ${p?.clientInfo?.version}`;
    case 'elicitation/create':
      return p?.message ?? '';
    case 'sampling/createMessage':
      return `${p?.messages?.length ?? 0} message(s) · maxTokens ${p?.maxTokens}`;
    default:
      return preview(m.params);
  }
}

/** What a response answers, so the row reads on its own: the tool, prompt or uri it is for. */
function subjectOf(req: JsonRpcMessage | undefined): string {
  const p = req?.params as any;
  switch (req?.method) {
    case 'tools/call':
    case 'prompts/get':
      return p?.name ? `${p.name} → ` : '';
    case 'resources/read':
      return p?.uri ? `${p.uri} → ` : '';
    default:
      return '';
  }
}

function responseSummary(m: JsonRpcMessage, req?: JsonRpcMessage): string {
  const reqMethod = req?.method;
  const subject = subjectOf(req);
  if (m.error) return `${subject}error ${m.error.code}: ${m.error.message}`;
  const r = m.result as any;
  switch (reqMethod) {
    case 'tools/call': {
      const n = r?.content?.length ?? 0;
      const first = r?.content?.[0];
      const head = first?.type === 'text' ? preview(first.text, 120) : first ? `[${first.type}]` : '';
      return `${subject}${r?.isError ? 'isError · ' : ''}${n} block${n === 1 ? '' : 's'}${head ? ` · ${head}` : ''}`;
    }
    case 'tools/list':
      return `${r?.tools?.length ?? 0} tools`;
    case 'resources/list':
      return `${r?.resources?.length ?? 0} resources`;
    case 'resources/templates/list':
      return `${r?.resourceTemplates?.length ?? 0} templates`;
    case 'prompts/list':
      return `${r?.prompts?.length ?? 0} prompts`;
    case 'resources/read':
      return `${subject}${r?.contents?.length ?? 0} content item(s)`;
    case 'prompts/get':
      return `${subject}${r?.messages?.length ?? 0} message(s)`;
    case 'initialize':
      return `${r?.serverInfo?.name} ${r?.serverInfo?.version} · protocol ${r?.protocolVersion}`;
    default:
      return preview(m.result);
  }
}

function notificationSummary(m: JsonRpcMessage): string {
  const p = m.params as any;
  switch (m.method) {
    case 'notifications/progress':
      return `${p?.message ?? 'progress'} · ${p?.progress}${p?.total ? ` / ${p.total}` : ''}`;
    case 'notifications/message':
      return `${p?.level}${p?.logger ? ` [${p.logger}]` : ''} ${preview(p?.data)}`;
    default:
      return preview(m.params);
  }
}

/** Turns a session's events into frames with request/response pairing. */
export function buildFrames(events: SessionEvent[]): Frame[] {
  const frames: Frame[] = [];
  // Requests waiting for their response, by direction + id.
  const open = new Map<string, Frame>();
  const pendingRids = new Map<string, Frame>();
  const resolvedRids = new Set<string>();

  for (const e of events) {
    if (e.type === 'server-request-resolved') {
      resolvedRids.add(e.rid);
      const f = pendingRids.get(e.rid);
      if (f) f.awaiting = false;
      continue;
    }
    if (e.type === 'server-request') {
      // The JSON-RPC frame for this request is also in the stream (direction in); this
      // marker only carries the rid, so fold it onto that frame when we see it.
      const f = frames.findLast((x) => x.direction === 'in' && x.kind === 'request' && x.method === e.method && !x.rid);
      if (f) {
        f.rid = e.rid;
        f.awaiting = !resolvedRids.has(e.rid);
        pendingRids.set(e.rid, f);
      } else {
        pendingRids.set(e.rid, { seq: -1, ts: e.ts, kind: 'server-request', method: e.method, summary: '', isError: false });
      }
      continue;
    }
    if (e.type === 'stderr') {
      frames.push({ seq: e.seq, ts: e.ts, kind: 'stderr', method: '', summary: e.text.trimEnd(), isError: false, text: e.text });
      continue;
    }
    if (e.type === 'error') {
      frames.push({ seq: e.seq, ts: e.ts, kind: 'note', method: 'error', summary: e.text, isError: true, text: e.text });
      continue;
    }
    if (e.type === 'closed') {
      // A session ending is only an error when it was not asked for: a user's disconnect or a clean exit is not.
      const clean = e.reason === 'Disconnected by user' || /exited with code 0$/.test(e.reason);
      frames.push({ seq: e.seq, ts: e.ts, kind: 'note', method: 'closed', summary: e.reason, isError: !clean, text: e.reason });
      continue;
    }
    const m = e.message;
    if (m.method && m.id === undefined) {
      frames.push({
        seq: e.seq,
        ts: e.ts,
        kind: 'notification',
        direction: e.direction,
        method: m.method,
        summary: notificationSummary(m),
        isError: m.method === 'notifications/message' && ['error', 'critical', 'alert', 'emergency'].includes((m.params as any)?.level),
        message: m,
      });
    } else if (m.method) {
      const f: Frame = {
        seq: e.seq,
        ts: e.ts,
        kind: 'request',
        direction: e.direction,
        method: m.method,
        id: m.id,
        summary: requestSummary(m),
        isError: false,
        message: m,
      };
      // A server→client request that the UI must answer (sampling, elicitation, roots).
      if (e.direction === 'in') {
        const placeholder = [...pendingRids.values()].find((p) => p.seq === -1 && p.method === m.method);
        if (placeholder) {
          const rid = [...pendingRids.entries()].find(([, v]) => v === placeholder)![0];
          f.rid = rid;
          f.awaiting = !resolvedRids.has(rid);
          pendingRids.set(rid, f);
        }
      }
      open.set(`${e.direction}:${m.id}`, f);
      frames.push(f);
    } else {
      const reqDir = e.direction === 'in' ? 'out' : 'in';
      const req = open.get(`${reqDir}:${m.id}`);
      if (req) open.delete(`${reqDir}:${m.id}`);
      const f: Frame = {
        seq: e.seq,
        ts: e.ts,
        kind: 'response',
        direction: e.direction,
        method: req?.method ?? 'response',
        id: m.id,
        latencyMs: req ? e.ts - req.ts : undefined,
        pairSeq: req?.seq,
        summary: responseSummary(m, req?.message),
        isError: !!m.error || !!(m.result as any)?.isError,
        message: m,
      };
      if (req) req.pairSeq = f.seq;
      frames.push(f);
    }
  }
  return frames;
}

// ---- Display filter: free text plus `method:`, `dir:`, `kind:`, `id:`, `error` tokens.

export interface DisplayFilter {
  text: string[];
  method?: string;
  dir?: 'in' | 'out';
  kind?: FrameKind[];
  id?: string;
  error?: boolean;
}

const KIND_ALIASES: Record<string, FrameKind[]> = {
  req: ['request'],
  request: ['request'],
  res: ['response'],
  resp: ['response'],
  response: ['response'],
  notif: ['notification'],
  notification: ['notification'],
  stderr: ['stderr'],
  note: ['note'],
  rpc: ['request', 'response', 'notification'],
};

export function parseFilter(input: string): DisplayFilter {
  const f: DisplayFilter = { text: [] };
  for (const raw of input.trim().split(/\s+/).filter(Boolean)) {
    const [k, ...rest] = raw.split(':');
    const v = rest.join(':');
    if (raw === 'error' || raw === 'errors') f.error = true;
    else if (k === 'method' && v) f.method = v.toLowerCase();
    else if (k === 'dir' && (v === 'in' || v === 'out')) f.dir = v;
    else if (k === 'kind' && v) f.kind = v.split(',').flatMap((x) => KIND_ALIASES[x] ?? []);
    else if (k === 'id' && v) f.id = v;
    else f.text.push(raw.toLowerCase());
  }
  return f;
}

export function frameMatches(frame: Frame, f: DisplayFilter): boolean {
  if (f.error && !frame.isError) return false;
  if (f.method && !frame.method.toLowerCase().includes(f.method)) return false;
  if (f.dir && frame.direction !== f.dir) return false;
  if (f.kind && !f.kind.includes(frame.kind)) return false;
  if (f.id && String(frame.id) !== f.id) return false;
  if (f.text.length) {
    const hay = `${frame.method} ${frame.summary} ${frame.message ? JSON.stringify(frame.message) : frame.text ?? ''}`.toLowerCase();
    for (const t of f.text) if (!hay.includes(t)) return false;
  }
  return true;
}

export const formatMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const formatClock = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour12: false }) + '.' + String(ts % 1000).padStart(3, '0');
