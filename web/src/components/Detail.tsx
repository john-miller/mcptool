import { useState } from 'react';
import { formatBytes, formatClock, formatMs, type Frame } from '../frames';
import { KEYS, useFrames } from '../hooks';
import { Icon } from './Icon';
import { setCraft } from '../sessions';
import { setState, useStore } from '../store';
import { CopyButton, JsonView } from './Json';
import { ContentBlocks, PromptMessages, ResourceContentsView } from './Results';
import { kindLabel } from './Stream';

type Tab = 'pair' | 'dissected' | 'raw';

/** The selected frame, dissected: its request/response pair on one grid, the tree, or the raw JSON. */
export function Detail({ connectionId }: { connectionId: string }) {
  const frames = useFrames(connectionId);
  const selected = useStore((s) => s.selected);
  const [tab, setTab] = useState<Tab>('pair');
  const seq = selected?.connectionId === connectionId ? selected.seq : undefined;
  const frame = seq === undefined ? undefined : frames.find((f) => f.seq === seq);

  if (!frame) {
    return (
      <section className="detail detail-empty">
        <div className="muted">
          Select a frame to dissect it. <kbd>j</kbd>/<kbd>k</kbd> move, <kbd>{KEYS.enter}</kbd> jumps to the pair, <kbd>/</kbd> filters.
        </div>
      </section>
    );
  }

  const pair = frame.pairSeq === undefined ? undefined : frames.find((f) => f.seq === frame.pairSeq);
  const request = frame.kind === 'request' ? frame : pair?.kind === 'request' ? pair : undefined;
  const response = frame.kind === 'response' ? frame : pair?.kind === 'response' ? pair : undefined;
  const hasPair = !!(request && response);
  const effective: Tab = tab === 'pair' && !hasPair ? 'dissected' : tab;
  const size = frame.message ? JSON.stringify(frame.message).length : (frame.text?.length ?? 0);

  return (
    <section className="detail">
      <header className="detail-head">
        <span className={`kind-tag k-${frame.kind} ${frame.direction ? `d-${frame.direction}` : ''}`}>{kindLabel(frame)}</span>
        <span className="detail-method mono">{frame.method}</span>
        {frame.id !== undefined && <span className="mono muted">#{frame.id}</span>}
        <span className="mono muted">{formatClock(frame.ts)}</span>
        {frame.latencyMs !== undefined && <span className="mono muted">{formatMs(frame.latencyMs)}</span>}
        <span className="mono muted">{formatBytes(size)}</span>
        {frame.isError && <span className="status status-err">error</span>}
        {frame.awaiting && frame.rid && (
          <button className="btn btn-sm btn-primary" onClick={() => setCraft({ kind: 'reply', rid: frame.rid! })}>
            Reply in the crafter <Icon name="arrow-right" size={12} />
          </button>
        )}
        <span className="spacer" />
        {pair && (
          <button className="btn btn-ghost btn-xs" onClick={() => setState({ selected: { connectionId, seq: pair.seq } })} title={`Select the paired frame (${KEYS.enter})`}>
            <Icon name="swap" size={12} /> #{pair.seq}
          </button>
        )}
        <div className="tabs">
          <button className={effective === 'pair' ? 'is-active' : ''} disabled={!hasPair} onClick={() => setTab('pair')}>
            Pair
          </button>
          <button className={effective === 'dissected' ? 'is-active' : ''} onClick={() => setTab('dissected')}>
            Dissected
          </button>
          <button className={effective === 'raw' ? 'is-active' : ''} onClick={() => setTab('raw')}>
            Raw
          </button>
        </div>
      </header>
      <div className="detail-body">
        {effective === 'pair' && request && response && <PairView request={request} response={response} />}
        {effective === 'dissected' && <Dissected frame={frame} />}
        {effective === 'raw' && <RawView frame={frame} />}
      </div>
    </section>
  );
}

/** Request and response side by side, on one registered grid: the same header row, bodies aligned at the top. */
function PairView({ request, response }: { request: Frame; response: Frame }) {
  return (
    <div className="pair">
      <div className="pair-col">
        <div className="pair-head mono">
          <span className="kind-tag k-request d-out">{request.direction === 'out' ? 'req' : 'ask'}</span>
          <span>{request.method}</span>
          <span className="muted">#{request.seq} · {formatClock(request.ts)}</span>
        </div>
        <div className="pair-body">
          <RequestBody frame={request} />
        </div>
      </div>
      <div className="pair-col">
        <div className="pair-head mono">
          <span className={`kind-tag k-response ${response.isError ? 'is-error' : ''}`}>{response.message?.error ? 'err' : 'res'}</span>
          <span>{response.latencyMs !== undefined ? formatMs(response.latencyMs) : ''}</span>
          <span className="muted">#{response.seq} · {formatClock(response.ts)}</span>
        </div>
        <div className="pair-body">
          <ResponseBody frame={response} method={request.method} />
        </div>
      </div>
    </div>
  );
}

function RequestBody({ frame }: { frame: Frame }) {
  const m = frame.message!;
  const p = m.params as any;
  if (m.method === 'tools/call') {
    return (
      <div className="stack">
        <div className="kv">
          <span className="kv-k">tool</span>
          <span className="kv-v mono">{p?.name}</span>
        </div>
        <h4>arguments</h4>
        {p?.arguments && Object.keys(p.arguments).length ? <JsonView value={p.arguments} openDepth={4} /> : <div className="muted">none</div>}
      </div>
    );
  }
  if (m.method === 'resources/read') {
    return (
      <div className="kv">
        <span className="kv-k">uri</span>
        <span className="kv-v mono">{p?.uri}</span>
      </div>
    );
  }
  if (m.method === 'prompts/get') {
    return (
      <div className="stack">
        <div className="kv">
          <span className="kv-k">prompt</span>
          <span className="kv-v mono">{p?.name}</span>
        </div>
        <h4>arguments</h4>
        {p?.arguments ? <JsonView value={p.arguments} openDepth={3} /> : <div className="muted">none</div>}
      </div>
    );
  }
  return p === undefined ? <div className="muted">no params</div> : <JsonView value={p} openDepth={4} />;
}

/** A result rendered the way a host hands it onward, by the method that asked for it. */
export function ResponseBody({ frame, method }: { frame: Frame; method: string }) {
  const m = frame.message!;
  if (m.error) {
    return (
      <div className="error-box">
        <div className="error-message">
          {m.error.code}: {m.error.message}
        </div>
        {m.error.data !== undefined && <JsonView value={m.error.data} />}
      </div>
    );
  }
  const r = m.result as any;
  switch (method) {
    case 'tools/call':
      return (
        <div className="stack">
          {r?.isError && <div className="error-box">The tool reported an error (isError). A host passes this back to the model so it can recover.</div>}
          <h4>content · what the model reads</h4>
          <ContentBlocks blocks={r?.content} />
          {r?.structuredContent !== undefined && (
            <>
              <h4>structuredContent</h4>
              <JsonView value={r.structuredContent} openDepth={3} />
            </>
          )}
          {r?._meta && (
            <>
              <h4>_meta</h4>
              <JsonView value={r._meta} />
            </>
          )}
        </div>
      );
    case 'resources/read':
      return <ResourceContentsView contents={r?.contents} />;
    case 'prompts/get':
      return (
        <div className="stack">
          {r?.description && <p className="muted">{r.description}</p>}
          <PromptMessages messages={r?.messages} />
        </div>
      );
    default:
      return <JsonView value={r} openDepth={3} />;
  }
}

function Dissected({ frame }: { frame: Frame }) {
  if (frame.message) return <JsonView value={frame.message} openDepth={5} />;
  return <pre className="text-content">{frame.text}</pre>;
}

function RawView({ frame }: { frame: Frame }) {
  const text = frame.message ? JSON.stringify(frame.message, null, 2) : (frame.text ?? '');
  return (
    <div className="raw-view">
      <CopyButton text={() => text} />
      <pre className="text-content">{text}</pre>
    </div>
  );
}
