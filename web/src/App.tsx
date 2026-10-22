import { useEffect } from 'react';
import { CaptureBar } from './components/CaptureBar';
import { ImportDialog } from './components/Connections';
import { Crafter } from './components/Crafter';
import { Detail } from './components/Detail';
import { JwtDecoder, type TokenSource } from './components/JwtDecoder';
import { Palette } from './components/Palette';
import { Rail } from './components/Rail';
import { Stream } from './components/Stream';
import { ModelView, Overview, Welcome } from './components/Views';
import { formatMs } from './frames';
import { KEYS, NARROW, plural, useFrames, useResizer, useResolvedTheme, useViewportWidth } from './hooks';
import { acknowledge, bootstrap, triggerSend } from './sessions';
import { runtime } from './runtime';
import { getState, setState, useStore } from './store';

export function App() {
  const loaded = useStore((s) => s.loaded);
  const center = useStore((s) => s.center);
  const activeId = useStore((s) => s.activeId);
  const session = useStore((s) => (s.activeId ? s.sessions[s.activeId] : undefined));
  const layout = useStore((s) => s.layout);
  const banner = useStore((s) => s.banner);
  const palette = useStore((s) => s.palette);
  const jwt = useStore((s) => s.jwt);
  const importOpen = useStore((s) => s.importOpen);
  const connections = useStore((s) => s.connections);
  const resolvedTheme = useResolvedTheme();
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  // Global keys: Ctrl+K palette, Escape closes overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setState((s) => ({ palette: !s.palette }));
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const s = getState();
        if (!s.palette && !s.jwt && !s.importOpen && s.center === 'stream' && triggerSend()) e.preventDefault();
      } else if (e.key === 'Escape') {
        const s = getState();
        if (s.palette) setState({ palette: false });
        else if (s.jwt) setState({ jwt: null });
        else if (s.importOpen) setState({ importOpen: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onRail = useResizer('x', layout.rail, (rail) => setState({ layout: { ...layout, rail } }), { min: 200, max: () => 480 });
  const onCrafter = useResizer('x', layout.crafter, (crafter) => setState({ layout: { ...layout, crafter } }), { min: 320, max: () => Math.min(760, window.innerWidth * 0.6), invert: true });

  // The columns must always fit: the crafter yields to the centre, and the rail becomes a drawer when narrow.
  const vw = useViewportWidth();
  const narrow = vw < NARROW;
  const railDrawer = useStore((s) => s.railDrawer);
  const showPanes = loaded && center !== 'welcome';
  const railW = showPanes && layout.railOpen && !narrow ? layout.rail : 0;
  const crafterW = showPanes && layout.crafterOpen ? Math.max(300, Math.min(layout.crafter, vw - railW - (railW ? 6 : 0) - 6 - 340)) : 0;

  const tokenSources = (): TokenSource[] => {
    const c = connections.find((x) => x.id === activeId);
    if (!c || c.transport === 'stdio') return [];
    const header = Object.entries(c.headers ?? {}).find(([k]) => k.toLowerCase() === 'authorization');
    if (header) return [{ label: `${c.name}: Authorization header`, load: async () => header[1] }];
    return [{ label: `${c.name}: OAuth access token`, load: () => runtime().accessToken(c.id) }];
  };

  // A tap is "connected" for the pages once the host's handshake has been observed.
  const connected = session?.status === 'connected' || (!!session?.tap && !!session.info);

  return (
    <div className={`app theme-${resolvedTheme}`}>
      <CaptureBar />
      {banner && (
        <div className={`banner banner-${banner.kind}`}>
          <span className="banner-text">{banner.text}</span>
          {banner.action && (
            <button className="btn btn-sm" onClick={banner.action.run}>
              {banner.action.label}
            </button>
          )}
          {banner.link && (
            <a className="btn btn-sm" href={banner.link.href} target="_blank" rel="noreferrer">
              {banner.link.label}
            </a>
          )}
          <button className="btn btn-ghost btn-xs" onClick={() => setState({ banner: null })}>
            Dismiss
          </button>
        </div>
      )}
      <div
        className="work"
        style={{
          // One track per rendered pane: a column for a pane that is not there would swallow the centre.
          gridTemplateColumns: [...(railW ? [`${railW}px`, '6px'] : []), 'minmax(0, 1fr)', ...(crafterW ? ['6px', `${crafterW}px`] : [])].join(' '),
        }}
      >
        {showPanes && !narrow && (
          <>
            <Rail />
            <div className="resizer resizer-x" onPointerDown={onRail} />
          </>
        )}
        {showPanes && narrow && railDrawer && (
          <div
            className="rail-drawer"
            style={{ width: layout.rail }}
            onClick={(e) => {
              // Picking something in the tree is the end of the errand: the drawer goes away.
              if ((e.target as HTMLElement).closest('.tree-row, .nav-row')) setState({ railDrawer: false });
            }}
          >
            <Rail />
          </div>
        )}
        <main className="center">
          {!loaded ? (
            <div className="center-loading muted">
              <span className="spinner" /> Loading…
            </div>
          ) : center === 'welcome' || !activeId ? (
            <Welcome />
          ) : center === 'overview' && connected && session ? (
            <Overview session={session} />
          ) : center === 'model' && connected && session ? (
            <ModelView session={session} />
          ) : (
            <StreamAndDetail connectionId={activeId} />
          )}
        </main>
        {showPanes && crafterW > 0 && (
          <>
            <div className="resizer resizer-x" onPointerDown={onCrafter} />
            <Crafter />
          </>
        )}
      </div>
      <StatusBar connectionId={center !== 'welcome' ? activeId : undefined} />
      {palette && <Palette />}
      {jwt && <JwtDecoder initialToken={jwt.token} sources={tokenSources()} onClose={() => setState({ jwt: null })} />}
      {importOpen && <ImportDialog />}
    </div>
  );
}

function StreamAndDetail({ connectionId }: { connectionId: string }) {
  const layout = useStore((s) => s.layout);
  const onSplit = (e: React.PointerEvent) => {
    const host = (e.currentTarget as HTMLElement).parentElement!;
    const rect = host.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const frac = (ev.clientY - rect.top) / rect.height;
      setState((s) => ({ layout: { ...s.layout, stream: Math.min(0.85, Math.max(0.15, frac)) } }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  };
  return (
    <div className="split" style={{ gridTemplateRows: `minmax(80px, ${layout.stream}fr) 6px minmax(120px, ${1 - layout.stream}fr)` }}>
      <Stream connectionId={connectionId} />
      <div className="resizer resizer-y" onPointerDown={onSplit} />
      <Detail connectionId={connectionId} />
    </div>
  );
}

function StatusBar({ connectionId }: { connectionId?: string }) {
  const frames = useFrames(connectionId);
  const session = useStore((s) => (connectionId ? s.sessions[connectionId] : undefined));
  const responses = frames.filter((f) => f.kind === 'response' && f.latencyMs !== undefined);
  const avg = responses.length ? responses.reduce((a, f) => a + (f.latencyMs ?? 0), 0) / responses.length : undefined;
  const stderr = frames.filter((f) => f.kind === 'stderr').length;
  const errors = frames.filter((f) => f.isError).length;
  const unseen = session ? frames.filter((f) => f.seq > session.seenSeq && f.kind !== 'stderr').length : 0;
  return (
    <footer className="statusbar mono">
      {connectionId && session ? (
        <>
          <span>{plural(frames.length, 'frame')}</span>
          {avg !== undefined && <span>avg {formatMs(avg)}</span>}
          {errors > 0 && <span className="is-error">{plural(errors, 'error')}</span>}
          {stderr > 0 && <span>{stderr} stderr</span>}
          {session.pending.length > 0 && <span className="is-alert">{session.pending.length} awaiting reply</span>}
          {unseen > 0 && (
            <button className="status-link" onClick={() => acknowledge(connectionId)}>
              {unseen} new · mark seen
            </button>
          )}
        </>
      ) : (
        <span className="muted">no capture</span>
      )}
      <span className="spacer" />
      <span className="muted statusbar-keys">
        <kbd>{KEYS.palette}</kbd> palette <kbd>/</kbd> filter <kbd>j</kbd>
        <kbd>k</kbd> frames <kbd>{KEYS.enter}</kbd> pair <kbd>{KEYS.send}</kbd> send
      </span>
    </footer>
  );
}
