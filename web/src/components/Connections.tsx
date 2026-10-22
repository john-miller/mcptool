import { useEffect, useState } from 'react';
import type { ConnectionConfig, TransportKind } from '../../../shared/types';
import type { AuthStatus } from '../api';
import { formatArgs, parseArgs } from '../mcp';
import { runtime } from '../runtime';
import { connect, deleteConnection, saveConnections, select, upsertConnection } from '../sessions';
import { getState, setState, useStore } from '../store';
import { Icon } from './Icon';

const TRANSPORTS: { kind: TransportKind; label: string; hint: string }[] = [
  { kind: 'stdio', label: 'stdio', hint: 'Launch a local process and talk over stdin/stdout' },
  { kind: 'streamable-http', label: 'Streamable HTTP', hint: 'Remote server, the current HTTP transport' },
  { kind: 'sse', label: 'SSE (legacy)', hint: 'Remote server using the older HTTP+SSE transport' },
];

/** The connection's settings, shown in the crafter while it is not connected (or on request). */
export function ConnectionEditor({ connection }: { connection: ConnectionConfig }) {
  const status = useStore((s) => s.sessions[connection.id]?.status ?? 'idle');
  const canStdio = useStore((s) => s.runtime?.stdio ?? true);
  const transports = canStdio ? TRANSPORTS : TRANSPORTS.filter((t) => t.kind !== 'stdio');
  const error = useStore((s) => s.sessions[connection.id]?.error);
  const [draft, setDraft] = useState(connection);
  const [argsText, setArgsText] = useState(formatArgs(connection.args));
  const [rootsText, setRootsText] = useState((connection.roots ?? []).map((r) => r.uri).join('\n'));

  const current = (): ConnectionConfig => ({
    ...draft,
    args: parseArgs(argsText),
    roots: rootsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((uri) => ({ uri })),
  });
  const dirty = JSON.stringify(current()) !== JSON.stringify({ ...connection, args: connection.args ?? [], roots: connection.roots ?? [] });
  const set = (patch: Partial<ConnectionConfig>) => setDraft((d) => ({ ...d, ...patch }));
  const isStdio = draft.transport === 'stdio';
  const canConnect = isStdio ? !!draft.command?.trim() : !!draft.url?.trim();
  const busy = status === 'connecting' || status === 'auth';
  const connectNow = () => {
    upsertConnection(current());
    void connect(connection.id);
  };

  return (
    <div
      className="craft"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canConnect && !busy) {
          e.preventDefault();
          e.stopPropagation();
          connectNow();
        }
      }}
    >
      <header className="craft-head">
        <div className="craft-title-row">
          <span className={`kind-tag tag-${isStdio ? 'stdio' : 'http'}`}>{isStdio ? 'stdio' : draft.transport === 'sse' ? 'sse' : 'http'}</span>
          <h2 className="craft-title ellipsis">{draft.name || 'Connection'}</h2>
          {status === 'connected' && <span className="badge badge-ok">connected</span>}
        </div>
        {error && <div className="field-error">{error}</div>}
      </header>

      <div className="craft-body editor">
        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </label>

        <div className="field">
          <span className="label">Transport</span>
          <div className="segmented">
            {transports.map((t) => (
              <button key={t.kind} title={t.hint} className={draft.transport === t.kind ? 'is-active' : ''} onClick={() => set({ transport: t.kind })}>
                {t.label}
              </button>
            ))}
          </div>
          <span className="field-desc">
            {TRANSPORTS.find((t) => t.kind === draft.transport)?.hint}
            {!canStdio && ' · stdio servers need the full mcptool (a local process).'}
          </span>
        </div>

        {isStdio ? (
          <>
            <label className="field">
              <span className="label">Command</span>
              <input className="input mono" placeholder="npx, uvx, node, python…" value={draft.command ?? ''} onChange={(e) => set({ command: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Arguments</span>
              <input className="input mono" placeholder='-y @modelcontextprotocol/server-everything   (quote args with spaces)' value={argsText} onChange={(e) => setArgsText(e.target.value)} />
            </label>
            <label className="field">
              <span className="label">Working directory</span>
              <input className="input mono" placeholder="(where mcptool was started)" value={draft.cwd ?? ''} onChange={(e) => set({ cwd: e.target.value })} />
            </label>
            <div className="field">
              <span className="label">Environment variables</span>
              <span className="field-desc">Added on top of a safe default environment (PATH, HOME, …).</span>
              <KeyValueEditor key={`env-${connection.id}`} value={draft.env ?? {}} onChange={(env) => set({ env })} keyPlaceholder="API_KEY" />
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span className="label">URL</span>
              <input
                className="input mono"
                placeholder={draft.transport === 'sse' ? 'http://localhost:3001/sse' : 'http://localhost:3001/mcp'}
                value={draft.url ?? ''}
                onChange={(e) => set({ url: e.target.value })}
              />
            </label>
            <div className="field">
              <span className="label">Headers</span>
              <span className="field-desc">Sent with every request, e.g. Authorization: Bearer …</span>
              <KeyValueEditor key={`headers-${connection.id}`} value={draft.headers ?? {}} onChange={(headers) => set({ headers })} keyPlaceholder="Authorization" />
            </div>
            <OAuthStatus connectionId={connection.id} manualHeader={Object.keys(draft.headers ?? {}).some((h) => h.toLowerCase() === 'authorization')} />
          </>
        )}

        <details className="advanced">
          <summary>Roots</summary>
          <div className="field">
            <span className="field-desc">
              File URIs returned when the server asks for <span className="mono">roots/list</span>, one per line.
            </span>
            <textarea className="input mono" rows={3} placeholder="file:///C:/projects/my-app" value={rootsText} onChange={(e) => setRootsText(e.target.value)} />
          </div>
        </details>

        <div className="row editor-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const copy = { ...current(), id: crypto.randomUUID(), name: `${current().name} copy` };
            saveConnections([...getState().connections, copy]);
            select(copy.id);
          }}>
            Duplicate
          </button>
          <span className="spacer" />
          <button
            className="btn btn-ghost btn-sm btn-danger-text"
            onClick={() => {
              if (confirm(`Delete connection "${connection.name}"?`)) deleteConnection(connection.id);
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <footer className="sendbar">
        <div className="send-status muted">{dirty ? 'unsaved changes' : 'saved'}</div>
        <span className="spacer" />
        <button className="btn" disabled={!dirty} onClick={() => upsertConnection(current())}>
          Save
        </button>
        <button className="btn btn-primary" disabled={!canConnect || busy} onClick={connectNow}>
          {busy ? 'Connecting…' : status === 'connected' ? 'Reconnect' : 'Connect'}
        </button>
      </footer>
    </div>
  );
}

function OAuthStatus({ connectionId, manualHeader }: { connectionId: string; manualHeader: boolean }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  useEffect(() => {
    runtime().authStatus(connectionId).then(setStatus, () => setStatus(null));
  }, [connectionId]);
  return (
    <div className="field">
      <span className="label">
        OAuth {status?.signedIn && <span className="badge badge-ok">signed in</span>}
      </span>
      {manualHeader ? (
        <span className="field-desc">Off, because you set an Authorization header yourself.</span>
      ) : status?.signedIn ? (
        <div className="row">
          <span className="muted small">
            Token stored{status.scope ? ` (scope: ${status.scope})` : ''}
            {status.expiresAt ? `, ${status.expiresAt > Date.now() ? 'expires' : 'expired'} ${new Date(status.expiresAt).toLocaleString()}` : ''}
            {status.canRefresh ? ', refreshes automatically' : ''}.
          </span>
          <button className="btn btn-sm" onClick={() => runtime().accessToken(connectionId).then((token) => setState({ jwt: { token } }), () => {})}>
            Decode token
          </button>
          <button
            className="btn btn-sm"
            onClick={async () => {
              await runtime().signOut(connectionId);
              setStatus({ signedIn: false });
            }}
          >
            Sign out
          </button>
        </div>
      ) : (
        <span className="field-desc">Not signed in. If the server requires OAuth, mcptool opens its sign-in page when you connect.</span>
      )}
    </div>
  );
}

function KeyValueEditor({ value, onChange, keyPlaceholder }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void; keyPlaceholder: string }) {
  const [rows, setRows] = useState(() => [...Object.entries(value), ['', '']]);
  const update = (next: [string, string][]) => {
    if (next.at(-1)?.[0] || next.at(-1)?.[1]) next = [...next, ['', '']];
    setRows(next);
    onChange(Object.fromEntries(next.filter(([k]) => k.trim())));
  };
  return (
    <div className="kv-editor">
      {rows.map(([k, v], i) => (
        <div key={i} className="kv-row">
          <input className="input input-sm mono" placeholder={keyPlaceholder} value={k} onChange={(e) => update(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)) as [string, string][])} />
          <input className="input input-sm mono" placeholder="value" value={v} onChange={(e) => update(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)) as [string, string][])} />
          {i < rows.length - 1 ? (
            <button className="btn btn-ghost btn-xs" title="Remove" onClick={() => update(rows.filter((_, j) => j !== i) as [string, string][])}>
              <Icon name="close" size={12} />
            </button>
          ) : (
            <span className="kv-spacer" />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Accepts the config formats hosts use: `{"mcpServers": {...}}` (Claude Desktop,
 * Cursor, Claude Code), `{"servers": {...}}` (VS Code) or a single server object.
 */
export function parseImport(text: string): ConnectionConfig[] {
  const json = JSON.parse(text);
  const servers: Record<string, any> = json.mcpServers ?? json.servers ?? (json.command || json.url ? { Imported: json } : json);
  return Object.entries(servers).map(([name, s]) => {
    const base = { id: crypto.randomUUID(), name };
    if (s.command) return { ...base, transport: 'stdio' as const, command: s.command, args: s.args ?? [], env: s.env, cwd: s.cwd };
    if (s.url || s.serverUrl) {
      const type = String(s.type ?? s.transport ?? '').toLowerCase();
      return { ...base, transport: type === 'sse' ? ('sse' as const) : ('streamable-http' as const), url: s.url ?? s.serverUrl, headers: s.headers };
    }
    throw new Error(`Server "${name}" has neither a command nor a url`);
  });
}

export function ImportDialog() {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = () => setState({ importOpen: false });
  return (
    <div className="overlay" onClick={close}>
      <div className="dialog" role="dialog" aria-label="Import servers" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <strong>Import servers</strong>
          <span className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={close}>
            Close
          </button>
        </div>
        <div className="dialog-body">
          <p className="muted small">
            Paste a config from Claude Desktop, Claude Code, Cursor or VS Code (the <span className="mono">mcpServers</span> or <span className="mono">servers</span> object).
          </p>
          <textarea
            className="input mono"
            rows={12}
            autoFocus
            spellCheck={false}
            value={text}
            placeholder={'{\n  "mcpServers": {\n    "everything": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-everything"] }\n  }\n}'}
            onChange={(e) => setText(e.target.value)}
          />
          {error && <div className="field-error">{error}</div>}
        </div>
        <div className="dialog-foot">
          <span className="spacer" />
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              try {
                const imported = parseImport(text);
                saveConnections([...getState().connections, ...imported]);
                if (imported[0]) select(imported[0].id);
                close();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
