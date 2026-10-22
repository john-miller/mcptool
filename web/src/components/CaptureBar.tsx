import { useEffect, useMemo, useRef } from 'react';
import { frameMatches, parseFilter } from '../frames';
import { KEYS, NARROW, useFrames, useViewportWidth } from '../hooks';
import { Icon } from './Icon';
import { connect, disconnect, forgetTap, restart, select, selectTap } from '../sessions';
import { isTapKey, setState, tapKey, useStore, type SessionStatus } from '../store';

export const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: 'not connected',
  connecting: 'connecting',
  auth: 'waiting for sign-in',
  connected: 'connected',
  tapping: 'live tap',
  error: 'failed',
  closed: 'closed',
};

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className="mark">
      <rect width="32" height="32" rx="6" className="mark-tile" />
      <path d="M6 22V10l5 7 5-7v12" className="mark-m" />
      <path d="M20 16h6M23 13l3 3-3 3" className="mark-arrow" />
    </svg>
  );
}

export function CaptureBar() {
  const connections = useStore((s) => s.connections);
  const taps = useStore((s) => s.taps);
  const sessions = useStore((s) => s.sessions);
  const activeId = useStore((s) => s.activeId);
  const filter = useStore((s) => s.filter);
  const theme = useStore((s) => s.theme);
  const layout = useStore((s) => s.layout);
  const railDrawer = useStore((s) => s.railDrawer);
  const lite = useStore((s) => s.runtime?.label === 'lite');
  const narrow = useViewportWidth() < NARROW;
  const frames = useFrames(activeId);
  const active = activeId ? sessions[activeId] : undefined;
  const status: SessionStatus = active?.status ?? 'idle';
  const filterRef = useRef<HTMLInputElement>(null);

  const matchCount = useMemo(() => {
    if (!filter.trim()) return undefined;
    const f = parseFilter(filter);
    return frames.filter((fr) => frameMatches(fr, f)).length;
  }, [frames, filter]);

  // "/" focuses the filter from anywhere that isn't an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        filterRef.current?.focus();
        filterRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cycleTheme = () => setState({ theme: theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system' });

  return (
    <header className="capbar">
      <button className="brand" onClick={() => setState({ center: 'welcome' })} title="Start page">
        <Mark />
        <span>mcptool</span>
        {lite && (
          <span className="badge" title="Lite: runs in this page; HTTP servers with CORS only">
            lite
          </span>
        )}
      </button>

      <div className="chips" role="tablist" aria-label="Servers">
        {connections.map((c) => {
          const s = sessions[c.id];
          const st = s?.status ?? 'idle';
          const unseen = s ? s.events.filter((e) => e.seq > s.seenSeq && e.type === 'message').length : 0;
          const pending = s?.pending.length ?? 0;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === activeId}
              className={`chip ${c.id === activeId ? 'is-active' : ''}`}
              title={`${c.name} · ${STATUS_LABEL[st]}${c.id === activeId ? '' : ' · click to show'}\nDouble-click to ${st === 'connected' ? 'restart' : 'connect'}`}
              onClick={() => select(c.id)}
              onDoubleClick={() => (st === 'connected' ? restart(c.id) : connect(c.id))}
            >
              <span className={`led led-${st}`} />
              <span className="chip-name">{c.name}</span>
              {pending > 0 && <span className="chip-badge is-alert" title="Waiting for your reply">{pending}</span>}
              {pending === 0 && unseen > 0 && c.id !== activeId && <span className="chip-badge">{unseen}</span>}
            </button>
          );
        })}
        {taps.map((t) => {
          const key = tapKey(t.id);
          const s = sessions[key];
          const st = s?.status ?? (t.live ? 'tapping' : 'closed');
          const unseen = s ? s.events.filter((e) => e.seq > s.seenSeq && e.type === 'message').length : 0;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={key === activeId}
              className={`chip chip-tap ${key === activeId ? 'is-active' : ''}`}
              title={`Tap: ${t.command} ${t.args.join(' ')}${t.pid ? ` (pid ${t.pid})` : ''} · ${t.live ? 'a host is driving this' : t.closedReason ?? 'closed'}`}
              onClick={() => selectTap(t.id)}
            >
              <span className={`led led-${st}`} />
              <Icon name="tap" size={12} />
              <span className="chip-name">{t.name}</span>
              {unseen > 0 && key !== activeId && <span className="chip-badge">{unseen}</span>}
            </button>
          );
        })}
        <button className="chip chip-add" title="New connection (or import)" onClick={() => setState({ center: 'welcome' })}>
          <Icon name="plus" />
        </button>
      </div>

      <div className="dfilter">
        <span className="dfilter-icon">
          <Icon name="search" />
        </span>
        <input
          ref={filterRef}
          className="dfilter-input mono"
          placeholder="display filter · method:tools/call dir:in kind:req,res error text"
          value={filter}
          spellCheck={false}
          onChange={(e) => setState({ filter: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setState({ filter: '' });
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {matchCount !== undefined && (
          <span className="dfilter-count mono">
            {matchCount}/{frames.length}
          </span>
        )}
        {filter && (
          <button className="dfilter-clear" onClick={() => setState({ filter: '' })} title="Clear filter (Esc)">
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      <div className="capbar-actions">
        {activeId && isTapKey(activeId) && active?.tap && (
          <>
            {active.tap.live ? (
              <span className="muted small capbar-note">
                <Icon name="tap" /> live tap · pid {active.tap.pid}
              </span>
            ) : (
              <button className="btn btn-sm" onClick={() => forgetTap(active.tap!.id)} title="Remove this capture">
                <Icon name="close" /> <span className="btn-label">Forget</span>
              </button>
            )}
          </>
        )}
        {activeId && !isTapKey(activeId) && (
          <>
            {status === 'connected' ? (
              <>
                <button className="btn btn-sm" onClick={() => restart(activeId)} title="Restart: disconnect and connect again, e.g. after rebuilding your server">
                  <Icon name="restart" /> <span className="btn-label">Restart</span>
                </button>
                <button className="btn btn-sm" onClick={() => disconnect(activeId)} title="Disconnect">
                  <Icon name="stop" /> <span className="btn-label">Disconnect</span>
                </button>
              </>
            ) : status === 'connecting' || status === 'auth' ? (
              <button className="btn btn-sm" disabled>
                <span className="spinner" /> {status === 'auth' ? 'Waiting for sign-in…' : 'Connecting…'}
              </button>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={() => connect(activeId)} title="Connect">
                <Icon name="play" /> <span className="btn-label">Connect</span>
              </button>
            )}
          </>
        )}
        <span className="capbar-sep" />
        <button className="btn btn-ghost btn-sm" onClick={() => setState({ palette: true })} title={`Command palette (${KEYS.palette})`}>
          <Icon name="search" /> <kbd className="btn-label">{KEYS.palette}</kbd>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setState({ jwt: { token: '' } })} title="Decode a JSON Web Token">
          <Icon name="key" /> <span className="btn-label">JWT</span>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={cycleTheme} title={`Theme: ${theme} (click to change)`}>
          <Icon name={theme === 'system' ? 'auto' : theme === 'light' ? 'sun' : 'moon'} />
        </button>
        <button
          className={`btn btn-ghost btn-sm ${(narrow ? railDrawer : layout.railOpen) ? '' : 'is-off'}`}
          onClick={() => (narrow ? setState({ railDrawer: !railDrawer }) : setState({ layout: { ...layout, railOpen: !layout.railOpen } }))}
          title={(narrow ? railDrawer : layout.railOpen) ? 'Hide the tree' : 'Show the tree'}
        >
          <Icon name="panel-left" />
        </button>
        <button
          className={`btn btn-ghost btn-sm ${layout.crafterOpen ? '' : 'is-off'}`}
          onClick={() => setState({ layout: { ...layout, crafterOpen: !layout.crafterOpen } })}
          title={layout.crafterOpen ? 'Hide the crafter' : 'Show the crafter'}
        >
          <Icon name="panel-right" />
        </button>
      </div>
    </header>
  );
}
