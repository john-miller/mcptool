import { useMemo, useState } from 'react';
import { formatMs } from '../frames';
import { estimateTokens, lintTools, LOG_LEVELS, toolsForLlm, type LlmFormat } from '../mcp';
import { connect, newConnection, rpc, select, selectTap } from '../sessions';
import { setState, useStore, type SessionState } from '../store';
import { KEYS, plural } from '../hooks';
import { Mark } from './CaptureBar';
import { HostSnippet } from './Crafter';
import { Icon } from './Icon';
import { CopyButton, JsonView } from './Json';

// Centre-column pages other than the stream: the start page, the server overview,
// and the model view (what an LLM is given).

/** The start page: the saved servers as capture interfaces, ready to start on. */
export function Welcome() {
  const connections = useStore((s) => s.connections);
  const sessions = useStore((s) => s.sessions);
  const taps = useStore((s) => s.taps);
  const shim = useStore((s) => s.shimPath);
  const apiUrl = useStore((s) => s.apiUrl);
  const rt = useStore((s) => s.runtime);
  const lite = rt?.label === 'lite';
  return (
    <section className="welcome">
      <div className="welcome-inner">
        <div className="welcome-head">
          <Mark size={40} />
          <div>
            <h1>
              mcptool {lite && <span className="badge">lite</span>}
            </h1>
            <p className="muted">
              A protocol analyzer for MCP. Start a capture on a server, watch every JSON-RPC frame land, and play the model's part by hand: call its tools, read its resources, answer its questions.
            </p>
          </div>
        </div>
        {lite && (
          <p className="lite-note muted small">
            Lite runs entirely in this page: it reaches Streamable HTTP and SSE servers that allow cross-origin requests from {location.origin}, signs in with OAuth, and keeps connections in this browser. Local stdio servers, taps of a real host, and sessions that survive a reload need the full version: <span className="mono">npx mcptool</span> or the desktop app. To try it here, run <span className="mono">npx tsx examples/demo-http-server.ts</span> and connect to <span className="mono">http://localhost:3838/mcp</span>.
          </p>
        )}
        <h4>servers</h4>
        {connections.length === 0 && <p className="muted small">No connections yet.</p>}
        <div className="interfaces">
          {connections.map((c) => {
            const st = sessions[c.id]?.status ?? 'idle';
            return (
              <button key={c.id} className="interface-row" onClick={() => (st === 'connected' ? select(c.id) : connect(c.id))}>
                <span className={`led led-${st}`} />
                <span className="strong ellipsis">{c.name}</span>
                <span className="mono muted ellipsis">{c.transport === 'stdio' ? [c.command, ...(c.args ?? [])].join(' ') : c.url}</span>
                <span className="interface-go mono">
                  {st === 'connected' ? 'show' : 'connect'} <Icon name="arrow-right" size={12} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="welcome-actions">
          <button className="btn btn-sm" onClick={() => newConnection()}>
            <Icon name="plus" /> New connection
          </button>
          <button className="btn btn-sm" onClick={() => setState({ importOpen: true })}>
            <Icon name="import" /> Import from a host config
          </button>
        </div>

        {rt?.taps && (
          <>
        <h4>taps · watch a real host use your server</h4>
        {taps.length > 0 && (
          <div className="interfaces">
            {taps.map((t) => (
              <button key={t.id} className="interface-row" onClick={() => selectTap(t.id)}>
                <span className={`led led-${t.live ? 'tapping' : 'closed'}`} />
                <span className="strong ellipsis">
                  <Icon name="tap" size={12} /> {t.name}
                </span>
                <span className="mono muted ellipsis">
                  {t.command} {t.args.join(' ')}
                </span>
                <span className="interface-go mono">
                  {t.live ? 'live' : 'closed'} <Icon name="arrow-right" size={12} />
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="muted small welcome-tap-note">
          Point Claude Desktop, Cursor or Claude Code at the shim instead of the server. It passes every byte through and mirrors the session here, pairing and all, the moment the host starts it.
        </p>
        <HostSnippet name="my-server" command="npx" args={['-y', 'my-mcp-server']} shim={shim} apiUrl={apiUrl} />
          </>
        )}
        <p className="welcome-keys muted">
          <kbd>{KEYS.palette}</kbd> palette · <kbd>/</kbd> display filter · <kbd>j</kbd> <kbd>k</kbd> frames · <kbd>{KEYS.enter}</kbd> pair · <kbd>{KEYS.send}</kbd> send
        </p>
      </div>
    </section>
  );
}

function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="page-head">
      <button className="btn btn-ghost btn-sm" onClick={() => setState({ center: 'stream' })}>
        <Icon name="arrow-left" /> Stream
      </button>
      <h2>{title}</h2>
      {sub && <span className="muted">{sub}</span>}
    </header>
  );
}

export function Overview({ session }: { session: SessionState }) {
  const [ping, setPing] = useState<string | null>(null);
  const [logLevel, setLogLevel] = useState('');
  const [logStatus, setLogStatus] = useState<string | null>(null);
  const info = session.info!;
  const caps = info.capabilities ?? {};
  const doPing = async () => {
    const res = await rpc(session.connectionId, 'ping');
    setPing(res.ok ? `pong in ${formatMs(res.durationMs)}` : `failed: ${res.error?.message}`);
  };
  const setLevel = async (level: string) => {
    setLogLevel(level);
    const res = await rpc(session.connectionId, 'logging/setLevel', { level });
    setLogStatus(res.ok ? `level set to ${level}` : `failed: ${res.error?.message}`);
  };
  const offered = [
    caps.tools ? plural(session.lists.tools.length, 'tool') : 'no tools',
    caps.resources ? `${plural(session.lists.resources.length, 'resource')}, ${plural(session.lists.templates.length, 'template')}` : 'no resources',
    caps.prompts ? plural(session.lists.prompts.length, 'prompt') : 'no prompts',
  ].join(' · ');
  return (
    <section className="page">
      <PageHead title={info.serverInfo?.title ?? info.serverInfo?.name ?? 'Server'} sub={`v${info.serverInfo?.version} · protocol ${info.protocolVersion} · ${offered}`} />
      <div className="page-body">
        <section className="card">
          <h3>Instructions</h3>
          <p className="muted small">Hosts typically add these to the model's system prompt.</p>
          {info.instructions ? <pre className="text-content">{info.instructions}</pre> : <div className="muted">The server sent no instructions.</div>}
        </section>
        {!session.tap && (
        <section className="card">
          <h3>Actions</h3>
          <div className="row">
            <button className="btn btn-sm" onClick={doPing}>
              Ping
            </button>
            {ping && <span className="muted mono">{ping}</span>}
          </div>
          {!!caps.logging && (
            <div className="row">
              <span>Log level</span>
              <select className="input input-sm input-auto" value={logLevel} onChange={(e) => setLevel(e.target.value)}>
                <option value="" disabled>
                  choose…
                </option>
                {LOG_LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              {logStatus && <span className="muted mono">{logStatus}</span>}
            </div>
          )}
        </section>
        )}
        <section className="card">
          <h3>Server capabilities</h3>
          <JsonView value={caps} openDepth={3} />
        </section>
      </div>
    </section>
  );
}

/** What a model is given when a host loads this server, and what it costs. */
export function ModelView({ session }: { session: SessionState }) {
  const { tools, prompts, resources, templates } = session.lists;
  const [format, setFormat] = useState<LlmFormat>('anthropic');
  const payload = useMemo(() => toolsForLlm(tools, format), [tools, format]);
  const issues = useMemo(() => lintTools(tools), [tools]);
  const sizes = useMemo(
    () => tools.map((t) => ({ name: t.name, tokens: estimateTokens(toolsForLlm([t], format)[0]) })).sort((a, b) => b.tokens - a.tokens),
    [tools, format],
  );
  const toolTokens = estimateTokens(payload);
  const instructionTokens = session.info?.instructions ? estimateTokens(session.info.instructions) : 0;
  const maxTokens = sizes[0]?.tokens ?? 1;

  return (
    <section className="page">
      <PageHead title="Model view" sub="what an LLM is given when a host loads this server" />
      <div className="page-body">
        <p className="muted page-lede">
          Tools are model-controlled: their names, descriptions and schemas ride along with every request and the model decides when to call them. Prompts are user-controlled (slash commands) and resources are application-controlled, so they are not in the model's context unless the host attaches them.
        </p>
        <p className="readouts">
          <span className="readout">
            <span className="readout-value">≈{(toolTokens + instructionTokens).toLocaleString()}</span> context tokens per request
          </span>
          <span className="readout">
            <span className="readout-value">{tools.length}</span> tool definitions
          </span>
          <span className="readout">
            <span className="readout-value">≈{instructionTokens.toLocaleString()}</span> instruction tokens
          </span>
          <span className={`readout ${issues.some((i) => i.level === 'warn') ? 'is-warn' : ''}`}>
            <span className="readout-value">{issues.filter((i) => i.level === 'warn').length}</span> warnings
          </span>
        </p>
        <p className="muted small">Token counts are an estimate (about four characters per token); real tokenizers differ.</p>

        {issues.length > 0 && (
          <section className="card">
            <h3>Model-readiness checks</h3>
            <ul className="issues">
              {issues.map((issue, i) => (
                <li key={i} className={`issue issue-${issue.level}`}>
                  <span className="tag">{issue.level}</span>
                  <span className="mono">{issue.tool}</span>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sizes.length > 0 && (
          <section className="card">
            <h3>Context cost by tool</h3>
            <div className="bars">
              {sizes.map((s) => (
                <div key={s.name} className="bar-row">
                  <span className="mono bar-label ellipsis">{s.name}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ transform: `scaleX(${s.tokens / maxTokens})` }} />
                  </span>
                  <span className="mono muted bar-value">≈{s.tokens}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <div className="card-head">
            <h3>Tool definitions as sent to the model</h3>
            <span className="spacer" />
            <div className="tabs tabs-sm">
              {(['anthropic', 'openai', 'mcp'] as const).map((f) => (
                <button key={f} className={format === f ? 'is-active' : ''} onClick={() => setFormat(f)}>
                  {f === 'anthropic' ? 'Anthropic' : f === 'openai' ? 'OpenAI' : 'MCP raw'}
                </button>
              ))}
            </div>
            <CopyButton text={() => JSON.stringify(payload, null, 2)} label="Copy JSON" />
          </div>
          <JsonView value={payload} openDepth={2} copy={false} />
        </section>

        {session.info?.instructions && (
          <section className="card">
            <h3>System prompt addition</h3>
            <pre className="text-content">{session.info.instructions}</pre>
          </section>
        )}

        {(prompts.length > 0 || resources.length > 0 || templates.length > 0) && (
          <section className="card">
            <h3>Offered to the user, not the model</h3>
            <p className="muted small">
              {prompts.length} prompt(s), {resources.length} resource(s) and {templates.length} resource template(s). They are in the tree on the left.
            </p>
          </section>
        )}
      </div>
    </section>
  );
}
