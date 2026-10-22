import { useState, type ReactNode } from 'react';
import { displayName } from '../mcp';
import { connect, openTapAsConnection, refreshLists, setCraft } from '../sessions';
import { craftKey, setState, useActiveConnection, useActiveSession, useStore, type Craft } from '../store';
import { STATUS_LABEL } from './CaptureBar';
import { Icon } from './Icon';

// The dissector tree: what the active server offers, one row per tool, resource,
// template and prompt. Selecting a row loads it into the crafter.

export function Rail() {
  const connection = useActiveConnection();
  const session = useActiveSession();
  const craft = useStore((s) => s.craft);
  const center = useStore((s) => s.center);
  const [filter, setFilter] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const tap = session?.tap;
  if (!connection && !tap) {
    return (
      <aside className="rail">
        <div className="rail-empty muted">No connection selected.</div>
      </aside>
    );
  }

  const status = session?.status ?? 'idle';
  // A tap counts as connected once the host's handshake has been seen.
  const connected = status === 'connected' || (!!tap && !!session?.info);
  const lists = session?.lists;
  const caps = session?.info?.capabilities ?? {};
  const q = filter.trim().toLowerCase();
  const match = (...fields: (string | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q));
  const isCraft = (c: Craft) => craftKey(c) === craftKey(craft) && center === 'stream';
  const toggle = (key: string) => setClosed((c) => ({ ...c, [key]: !c[key] }));

  const section = (key: string, title: string, count: number | undefined, enabled: boolean, rows: ReactNode) => (
    <section className={`tree-section ${closed[key] ? 'is-closed' : ''}`}>
      <button className="tree-head" onClick={() => toggle(key)} disabled={!enabled}>
        <span className="tree-caret">
          <Icon name={closed[key] ? 'caret-right' : 'caret-down'} size={11} />
        </span>
        <span className="tree-title">{title}</span>
        <span className="tree-count mono">{enabled ? count : '–'}</span>
      </button>
      {!closed[key] && enabled && <div className="tree-rows">{rows}</div>}
      {!enabled && <div className="tree-note muted">not offered</div>}
    </section>
  );

  const name = connection?.name ?? tap!.name;
  return (
    <aside className="rail">
      <div className="rail-head">
        <div className="rail-server">
          <span className={`led led-${status}`} />
          {tap && <Icon name="tap" size={12} className="rail-tap-icon" />}
          <span className="rail-name ellipsis" title={name}>
            {session?.info?.serverInfo?.title ?? session?.info?.serverInfo?.name ?? name}
          </span>
          {session?.info?.serverInfo?.version && <span className="mono muted">v{session.info.serverInfo.version}</span>}
        </div>
        <div className="rail-sub muted">
          {tap ? (
            <>
              {tap.live ? 'a host is driving this' : (tap.closedReason ?? 'closed')} ·{' '}
              <span className="mono">
                {tap.command} {tap.args.join(' ')}
              </span>
              {session?.info?.protocolVersion && (
                <>
                  {' '}
                  · protocol <span className="mono">{session.info.protocolVersion}</span>
                </>
              )}
            </>
          ) : connected ? (
            <>
              protocol <span className="mono">{session?.info?.protocolVersion ?? '?'}</span> · via {name}
            </>
          ) : (
            <>
              {STATUS_LABEL[status]}
              {session?.error ? ` · ${session.error}` : ''}
            </>
          )}
        </div>
        {connection && !connected && status !== 'connecting' && status !== 'auth' && (
          <button className="btn btn-primary btn-sm rail-connect" onClick={() => connect(connection.id)}>
            <Icon name="play" /> Connect
          </button>
        )}
        {tap && (
          <button className="btn btn-sm rail-connect" onClick={() => openTapAsConnection(tap)} title="Save this server as a connection you can drive from here">
            <Icon name="play" /> Open as a connection
          </button>
        )}
      </div>

      <nav className="rail-nav">
        <button className={`nav-row ${center === 'overview' ? 'is-active' : ''}`} onClick={() => setState({ center: 'overview' })} disabled={!connected}>
          Overview
        </button>
        <button className={`nav-row ${center === 'model' ? 'is-active' : ''}`} onClick={() => setState({ center: 'model' })} disabled={!connected}>
          Model view
        </button>
        {!tap && (
          <>
            <button className={`nav-row ${isCraft({ kind: 'raw' }) ? 'is-active' : ''}`} onClick={() => setCraft({ kind: 'raw' })} disabled={!connected}>
              Raw JSON-RPC
            </button>
            <button className={`nav-row ${isCraft({ kind: 'settings' }) ? 'is-active' : ''}`} onClick={() => setCraft({ kind: 'settings' })}>
              Connection settings
            </button>
          </>
        )}
      </nav>

      {connected && lists && (
        <>
          <div className="rail-filter">
            <input className="input input-sm" placeholder={tap ? 'Filter what the host saw…' : 'Filter offerings…'} value={filter} onChange={(e) => setFilter(e.target.value)} />
            {connection && (
              <button className="btn btn-ghost btn-xs" title="Re-fetch lists from the server" onClick={() => refreshLists(connection.id)}>
                <Icon name="restart" size={12} />
              </button>
            )}
          </div>
          <div className="tree">
            {section(
              'tools',
              'Tools',
              lists.tools.length,
              !!caps.tools,
              <>
                {session?.listErrors.tools && <div className="tree-note is-error">{session.listErrors.tools}</div>}
                {lists.tools
                  .filter((t) => match(t.name, t.title, t.description))
                  .map((t) => (
                    <button key={t.name} className={`tree-row ${isCraft({ kind: 'tool', name: t.name }) ? 'is-active' : ''}`} onClick={() => setCraft({ kind: 'tool', name: t.name })} title={t.description}>
                      <span className="tree-row-name mono ellipsis">{t.name}</span>
                      {t.annotations?.readOnlyHint && <span className="mini" title="read-only">ro</span>}
                      {t.annotations?.destructiveHint === true && !t.annotations?.readOnlyHint && <span className="mini is-danger" title="destructive">!</span>}
                    </button>
                  ))}
              </>,
            )}
            {section(
              'resources',
              'Resources',
              lists.resources.length + lists.templates.length,
              !!caps.resources,
              <>
                {session?.listErrors.resources && <div className="tree-note is-error">{session.listErrors.resources}</div>}
                {lists.templates
                  .filter((t) => match(t.name, t.uriTemplate, t.description))
                  .map((t) => (
                    <button
                      key={t.uriTemplate}
                      className={`tree-row ${isCraft({ kind: 'template', uriTemplate: t.uriTemplate }) ? 'is-active' : ''}`}
                      onClick={() => setCraft({ kind: 'template', uriTemplate: t.uriTemplate })}
                      title={t.description}
                    >
                      <span className="tree-row-name ellipsis">{displayName(t)}</span>
                      <span className="mini">template</span>
                    </button>
                  ))}
                {lists.resources
                  .filter((r) => match(r.name, r.uri, r.description))
                  .map((r) => (
                    <button key={r.uri} className={`tree-row ${isCraft({ kind: 'resource', uri: r.uri }) ? 'is-active' : ''}`} onClick={() => setCraft({ kind: 'resource', uri: r.uri })} title={r.uri}>
                      <span className="tree-row-name ellipsis">{displayName(r)}</span>
                      {r.mimeType && <span className="mini">{r.mimeType.split('/').pop()}</span>}
                    </button>
                  ))}
              </>,
            )}
            {section(
              'prompts',
              'Prompts',
              lists.prompts.length,
              !!caps.prompts,
              <>
                {session?.listErrors.prompts && <div className="tree-note is-error">{session.listErrors.prompts}</div>}
                {lists.prompts
                  .filter((p) => match(p.name, p.title, p.description))
                  .map((p) => (
                    <button key={p.name} className={`tree-row ${isCraft({ kind: 'prompt', name: p.name }) ? 'is-active' : ''}`} onClick={() => setCraft({ kind: 'prompt', name: p.name })} title={p.description}>
                      <span className="tree-row-name mono ellipsis">/{p.name}</span>
                      {p.arguments?.length ? <span className="mini">{p.arguments.length} args</span> : null}
                    </button>
                  ))}
              </>,
            )}
          </div>
        </>
      )}
    </aside>
  );
}
