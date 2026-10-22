import { useEffect, useMemo, useRef, useState } from 'react';
import { KEYS } from '../hooks';
import { displayName } from '../mcp';
import { connect, disconnect, restart, select, selectTap, setCraft } from '../sessions';
import { setState, useStore, type Craft } from '../store';

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  mono?: boolean;
  run: () => void;
}

/** Ctrl+K: jump to any tool, resource or prompt on any connected server, or run an action. */
export function Palette() {
  const connections = useStore((s) => s.connections);
  const taps = useStore((s) => s.taps);
  const sessions = useStore((s) => s.sessions);
  const activeId = useStore((s) => s.activeId);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo((): Item[] => {
    const out: Item[] = [];
    const go = (connectionId: string, craft: Craft) => () => {
      select(connectionId);
      setCraft(craft);
    };
    for (const c of connections) {
      const s = sessions[c.id];
      if (s?.status === 'connected') {
        const where = connections.length > 1 ? c.name : '';
        for (const t of s.lists.tools) out.push({ id: `${c.id}:tool:${t.name}`, group: 'Tools', label: t.name, hint: t.description ?? where, mono: true, run: go(c.id, { kind: 'tool', name: t.name }) });
        for (const p of s.lists.prompts) out.push({ id: `${c.id}:prompt:${p.name}`, group: 'Prompts', label: `/${p.name}`, hint: p.description ?? where, mono: true, run: go(c.id, { kind: 'prompt', name: p.name }) });
        for (const r of s.lists.resources) out.push({ id: `${c.id}:res:${r.uri}`, group: 'Resources', label: displayName(r), hint: r.uri, run: go(c.id, { kind: 'resource', uri: r.uri }) });
        for (const t of s.lists.templates) out.push({ id: `${c.id}:tpl:${t.uriTemplate}`, group: 'Resources', label: displayName(t), hint: t.uriTemplate, run: go(c.id, { kind: 'template', uriTemplate: t.uriTemplate }) });
        out.push({ id: `${c.id}:restart`, group: 'Servers', label: `Restart ${c.name}`, run: () => void restart(c.id) });
        out.push({ id: `${c.id}:disconnect`, group: 'Servers', label: `Disconnect ${c.name}`, run: () => void disconnect(c.id) });
      } else {
        out.push({ id: `${c.id}:connect`, group: 'Servers', label: `Connect ${c.name}`, hint: c.transport === 'stdio' ? c.command : c.url, run: () => void connect(c.id) });
      }
      out.push({ id: `${c.id}:show`, group: 'Servers', label: `Show ${c.name}`, run: () => select(c.id) });
    }
    for (const t of taps) out.push({ id: `tap:${t.id}`, group: 'Taps', label: `${t.live ? 'Live tap' : 'Closed tap'}: ${t.name}`, hint: `${t.command} ${t.args.join(' ')}`, run: () => selectTap(t.id) });
    if (activeId && sessions[activeId]?.status === 'connected') {
      out.push({ id: 'overview', group: 'Views', label: 'Server overview', run: () => setState({ center: 'overview' }) });
      out.push({ id: 'model', group: 'Views', label: 'Model view: what the LLM is given', run: () => setState({ center: 'model' }) });
      out.push({ id: 'raw', group: 'Views', label: 'Raw JSON-RPC', run: () => setCraft({ kind: 'raw' }) });
    }
    out.push({ id: 'new', group: 'Actions', label: 'New connection', run: () => setState({ center: 'welcome' }) });
    out.push({ id: 'import', group: 'Actions', label: 'Import servers from a host config', run: () => setState({ importOpen: true }) });
    out.push({ id: 'jwt', group: 'Actions', label: 'Decode a JWT', run: () => setState({ jwt: { token: '' } }) });
    out.push({ id: 'theme', group: 'Actions', label: 'Toggle theme', run: () => setState((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })) });
    return out;
  }, [connections, taps, sessions, activeId]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 60);
    const score = (it: Item) => {
      const l = it.label.toLowerCase();
      if (l === needle) return 0;
      if (l.startsWith(needle)) return 1;
      if (l.includes(needle)) return 2;
      if (it.hint?.toLowerCase().includes(needle)) return 3;
      return -1;
    };
    return items
      .map((it) => ({ it, s: score(it) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s)
      .slice(0, 60)
      .map((x) => x.it);
  }, [items, q]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => setCursor(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const close = () => setState({ palette: false });
  const run = (it: Item) => {
    close();
    it.run();
  };

  let lastGroup = '';
  return (
    <div className="overlay" onClick={close}>
      <div className="palette" role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Jump to a tool, resource, prompt, or action…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setCursor((c) => Math.min(shown.length - 1, c + 1)));
            else if (e.key === 'ArrowUp') (e.preventDefault(), setCursor((c) => Math.max(0, c - 1)));
            else if (e.key === 'Enter' && shown[cursor]) run(shown[cursor]);
            else if (e.key === 'Escape') close();
          }}
        />
        <div className="palette-list" ref={listRef}>
          {shown.length === 0 && <div className="palette-empty muted">Nothing matches.</div>}
          {shown.map((it, i) => {
            const head = it.group !== lastGroup ? <div className="palette-group">{it.group}</div> : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {head}
                <button className={`palette-item ${i === cursor ? 'is-active' : ''}`} onMouseEnter={() => setCursor(i)} onClick={() => run(it)}>
                  <span className={`palette-label ellipsis ${it.mono ? 'mono' : ''}`}>{it.label}</span>
                  {it.hint && <span className="palette-hint ellipsis">{it.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot muted">
          <kbd>↑</kbd>
          <kbd>↓</kbd> move · <kbd>{KEYS.enter}</kbd> open · <kbd>Esc</kbd> close
        </div>
      </div>
    </div>
  );
}
