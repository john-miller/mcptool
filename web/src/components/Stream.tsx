import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatClock, formatMs, frameMatches, parseFilter, type Frame } from '../frames';
import { useFrames } from '../hooks';
import { acknowledge, setCraft } from '../sessions';
import { setState, useStore } from '../store';
import { Icon } from './Icon';

const RENDER_LIMIT = 1500;

export function kindLabel(f: Frame) {
  switch (f.kind) {
    case 'request':
      return f.direction === 'in' ? 'ask' : 'req';
    case 'response':
      return f.message?.error ? 'err' : 'res';
    case 'notification':
      return 'notif';
    case 'stderr':
      return 'stderr';
    default:
      return 'note';
  }
}

/** The frame list: one row per message on the wire, newest at the bottom. */
export function Stream({ connectionId }: { connectionId: string }) {
  const frames = useFrames(connectionId);
  const filter = useStore((s) => s.filter);
  const selected = useStore((s) => s.selected);
  const seenSeq = useStore((s) => s.sessions[connectionId]?.seenSeq ?? 0);
  const status = useStore((s) => s.sessions[connectionId]?.status);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [awayCount, setAwayCount] = useState(0);

  const visible = useMemo(() => {
    const f = parseFilter(filter);
    const all = filter.trim() ? frames.filter((fr) => frameMatches(fr, f)) : frames;
    return all.length > RENDER_LIMIT ? all.slice(-RENDER_LIMIT) : all;
  }, [frames, filter]);

  const selectedSeq = selected?.connectionId === connectionId ? selected.seq : undefined;
  const selectedFrame = selectedSeq === undefined ? undefined : frames.find((f) => f.seq === selectedSeq);
  const pairSeq = selectedFrame?.pairSeq;
  const unseen = frames.filter((f) => f.seq > seenSeq && f.kind !== 'stderr').length;

  // Stay pinned to the newest frame unless the user scrolled up to read.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stick.current) {
      el.scrollTop = el.scrollHeight;
      setAwayCount(0);
    } else {
      setAwayCount(unseen);
    }
  }, [visible.length, unseen]);

  // Keep the selected row in view when selection moves by keyboard.
  useEffect(() => {
    if (selectedSeq === undefined) return;
    listRef.current?.querySelector<HTMLElement>(`[data-seq="${selectedSeq}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedSeq]);

  const selectFrame = (seq: number) => {
    setState({ selected: { connectionId, seq } });
    acknowledge(connectionId);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!visible.length) return;
    const idx = visible.findIndex((f) => f.seq === selectedSeq);
    const move = (d: number) => {
      const next = visible[Math.min(visible.length - 1, Math.max(0, (idx < 0 ? (d > 0 ? -1 : visible.length) : idx) + d))];
      if (next) selectFrame(next.seq);
    };
    if (e.key === 'j' || e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'k' || e.key === 'ArrowUp') (e.preventDefault(), move(-1));
    else if (e.key === 'Home') (e.preventDefault(), selectFrame(visible[0].seq));
    else if (e.key === 'End' || e.key === 'G') (e.preventDefault(), selectFrame(visible[visible.length - 1].seq));
    else if (e.key === ' ') (e.preventDefault(), acknowledge(connectionId));
    else if (e.key === 'Enter' && selectedFrame?.pairSeq !== undefined) (e.preventDefault(), selectFrame(selectedFrame.pairSeq));
    else if (e.key === 'Escape') setState({ selected: undefined });
  };

  // Load a request's content back into the crafter so it can be edited and re-sent.
  const loadIntoCrafter = (f: Frame) => {
    const m = f.message;
    if (!m?.method) return;
    const p = m.params as any;
    const put = (key: string, value: unknown) => setState((s) => ({ drafts: { ...s.drafts, [`${connectionId}|${key}`]: value } }));
    if (m.method === 'tools/call') {
      put(`tool:${p?.name}`, p?.arguments ?? {});
      setCraft({ kind: 'tool', name: p?.name });
    } else if (m.method === 'prompts/get') {
      put(`prompt:${p?.name}`, p?.arguments ?? {});
      setCraft({ kind: 'prompt', name: p?.name });
    } else if (m.method === 'resources/read') {
      setCraft({ kind: 'resource', uri: p?.uri });
    } else {
      put('raw', { method: m.method, params: m.params, notification: m.id === undefined });
      setCraft({ kind: 'raw' });
    }
  };

  return (
    <section className="stream" aria-label="Frames">
      <div className="srow shead mono">
        <span className="c-seq">#</span>
        <span className="c-time">time</span>
        <span className="c-dir" />
        <span className="c-kind">kind</span>
        <span className="c-method">method</span>
        <span className="c-id">id</span>
        <span className="c-lat">Δ</span>
        <span className="c-info">info</span>
      </div>
      <div
        className="srows mono"
        ref={listRef}
        tabIndex={0}
        role="listbox"
        aria-label="Frames"
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          stick.current = atBottom;
          if (atBottom) {
            setAwayCount(0);
            acknowledge(connectionId);
          }
        }}
      >
        {frames.length === 0 && (
          <div className="stream-empty">
            {status === 'connected' ? 'Connected. Every JSON-RPC message in either direction lands here.' : status === 'connecting' ? 'Connecting…' : 'Not connected. Press Connect to start capturing.'}
          </div>
        )}
        {visible.length === 0 && frames.length > 0 && <div className="stream-empty">No frames match the display filter.</div>}
        {frames.length > visible.length && !filter.trim() && <div className="stream-empty">Showing the last {RENDER_LIMIT} of {frames.length} frames.</div>}
        {visible.map((f) => (
          <div
            key={f.seq}
            data-seq={f.seq}
            role="option"
            aria-selected={f.seq === selectedSeq}
            className={[
              'srow',
              `k-${f.kind}`,
              f.direction ? `d-${f.direction}` : '',
              f.isError ? 'is-error' : '',
              f.seq > seenSeq && f.kind !== 'stderr' ? 'is-new' : '',
              f.seq === selectedSeq ? 'is-selected' : '',
              f.seq === pairSeq ? 'is-pair' : '',
              f.awaiting ? 'is-awaiting' : '',
            ].join(' ')}
            onClick={() => selectFrame(f.seq)}
            onDoubleClick={() => f.kind === 'request' && f.direction === 'out' && status !== 'tapping' && status !== 'closed' && loadIntoCrafter(f)}
            title={f.kind === 'request' && f.direction === 'out' && status === 'connected' ? 'Double-click to load into the crafter' : undefined}
          >
            <span className="c-seq">{f.seq}</span>
            <span className="c-time">{formatClock(f.ts)}</span>
            <span className="c-dir" aria-label={f.direction === 'out' ? 'client to server' : f.direction === 'in' ? 'server to client' : ''}>
              <Icon size={12} name={f.direction === 'out' ? 'arrow-right' : f.direction === 'in' ? 'arrow-left' : f.kind === 'stderr' ? 'alert' : 'dot'} />
            </span>
            <span className="c-kind">{kindLabel(f)}</span>
            <span className="c-method ellipsis">{f.method}</span>
            <span className="c-id">{f.id !== undefined ? `#${f.id}` : ''}</span>
            <span className="c-lat">{f.latencyMs !== undefined ? formatMs(f.latencyMs) : ''}</span>
            <span className="c-info ellipsis">
              {f.awaiting && <span className="awaiting-tag">awaiting your reply · </span>}
              {f.summary}
            </span>
            {f.rid && f.awaiting && (
              <button
                className="row-action"
                onClick={(e) => {
                  e.stopPropagation();
                  setCraft({ kind: 'reply', rid: f.rid! });
                }}
              >
                Reply
              </button>
            )}
          </div>
        ))}
      </div>
      {awayCount > 0 && (
        <button
          className="stream-jump mono"
          onClick={() => {
            stick.current = true;
            const el = listRef.current;
            if (el) el.scrollTop = el.scrollHeight;
            acknowledge(connectionId);
          }}
        >
          <Icon name="caret-down" size={12} /> {awayCount} new
        </button>
      )}
    </section>
  );
}
