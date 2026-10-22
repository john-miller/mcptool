import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ServerRequestAnswer } from '../../../shared/types';
import { formatMs } from '../frames';
import { KEYS, useFrames, useNow } from '../hooks';
import {
  displayName,
  estimateTokens,
  expandTemplate,
  KNOWN_METHODS,
  templateVariables,
  toolsForLlm,
  type JSONSchema,
  type LlmFormat,
  type Prompt,
  type PromptArgument,
  type Resource,
  type ResourceTemplate,
  type Tool,
} from '../mcp';
import { answer, cancel, notify, openTapAsConnection, registerSend, rpc, send, setCraft, toggleSubscribe } from '../sessions';
import { craftKey, draftKey, setState, useActiveConnection, useActiveSession, useStore, type Craft, type SessionState } from '../store';
import { ConnectionEditor } from './Connections';
import { Icon } from './Icon';
import { AutoTextarea, CopyButton, JsonEditor, JsonView } from './Json';
import { ContentBlockView } from './Results';
import { constraints, Control, kindOf, SchemaForm, typeLabel, unwrap } from './SchemaForm';

// The crafter: compose the next frame. A tool with its parameter table, a resource
// to read, a prompt to get, a raw request, or the reply to a question the server asked.

export function Crafter() {
  const connection = useActiveConnection();
  const session = useActiveSession();
  const craft = useStore((s) => s.craft);

  if (session?.tap) {
    return (
      <aside className="crafter">
        <TapCraft session={session} craft={craft} />
      </aside>
    );
  }
  if (!connection) return <aside className="crafter crafter-empty" />;
  if (craft.kind === 'settings' || !session || session.status !== 'connected') {
    return (
      <aside className="crafter">
        <ConnectionEditor key={connection.id} connection={connection} />
      </aside>
    );
  }

  const key = `${connection.id}:${craftKey(craft)}`;
  let body: ReactNode;
  switch (craft.kind) {
    case 'tool': {
      const tool = session.lists.tools.find((t) => t.name === craft.name);
      body = tool ? <ToolCraft key={key} tool={tool} session={session} /> : <Gone what={`Tool "${craft.name}"`} />;
      break;
    }
    case 'resource':
      body = <ResourceCraft key={key} uri={craft.uri} session={session} />;
      break;
    case 'template': {
      const t = session.lists.templates.find((x) => x.uriTemplate === craft.uriTemplate);
      body = t ? <TemplateCraft key={key} template={t} session={session} /> : <Gone what="That template" />;
      break;
    }
    case 'prompt': {
      const p = session.lists.prompts.find((x) => x.name === craft.name);
      body = p ? <PromptCraft key={key} prompt={p} session={session} /> : <Gone what={`Prompt "${craft.name}"`} />;
      break;
    }
    case 'raw':
      body = <RawCraft key={key} session={session} />;
      break;
    case 'reply': {
      const pending = session.pending.find((p) => p.rid === craft.rid);
      body = pending ? <ReplyCraft key={key} pending={pending} session={session} /> : <Gone what="That server request" />;
      break;
    }
    default:
      body = (
        <div className="crafter-hint muted">
          Pick a tool, resource or prompt in the tree, or press <kbd>{KEYS.palette}</kbd>.
        </div>
      );
  }
  return <aside className="crafter">{body}</aside>;
}

function Gone({ what }: { what: string }) {
  return <div className="crafter-hint muted">{what} is no longer offered by the server.</div>;
}

// ---------------------------------------------------------------- taps

/** A tap has no client: the host drives. The crafter shows what was observed, and how to drive it yourself. */
function TapCraft({ session, craft }: { session: SessionState; craft: Craft }) {
  const tap = session.tap!;
  const tool = craft.kind === 'tool' ? session.lists.tools.find((t) => t.name === craft.name) : undefined;
  const shim = useStore((s) => s.shimPath);
  const apiUrl = useStore((s) => s.apiUrl);
  if (tool) {
    const a = tool.annotations ?? {};
    return (
      <div className="craft">
        <CraftHead
          tag="tool"
          title={displayName(tool)}
          name={tool.name}
          badges={
            <span className="badges">
              <span className="badge">observed</span>
              {a.readOnlyHint && <span className="badge badge-ok">read-only</span>}
              {a.destructiveHint === true && !a.readOnlyHint && <span className="badge badge-danger">destructive</span>}
            </span>
          }
        />
        <div className="craft-body">
          <Description text={tool.description} />
          <h4>parameters</h4>
          <ParamTable schema={tool.inputSchema ?? {}} value={{}} onChange={() => {}} />
          <ModelSees tool={tool} />
        </div>
        <footer className="sendbar">
          <div className="send-status muted">Observed only; the host drives it.</div>
          <span className="spacer" />
          <button className="btn" onClick={() => openTapAsConnection(tap)}>
            Open as a connection
          </button>
        </footer>
      </div>
    );
  }
  return (
    <div className="craft">
      <CraftHead tag="tap" title={tap.name} name={`${tap.command} ${tap.args.join(' ')}`}>
        <div className="muted small">{tap.live ? `Live · a host is driving this (pid ${tap.pid ?? '?'})` : (tap.closedReason ?? 'Closed')}</div>
      </CraftHead>
      <div className="craft-body">
        <p className="craft-desc">
          Every frame the host and this server exchange is mirrored into the stream: pairing, filter and dissection work as for your own sessions. The tree on the left is what the host was told the server offers.
        </p>
        <h4>how this tap was set up</h4>
        <p className="craft-desc muted">The host's config runs the shim in place of the server:</p>
        <HostSnippet name={tap.name} command={tap.command} args={tap.args} shim={shim} apiUrl={apiUrl} />
        <h4>drive it yourself</h4>
        <p className="craft-desc muted">To call this server's tools from here, open it as a connection of its own (a second process, separate from the host's).</p>
        <button className="btn" onClick={() => openTapAsConnection(tap)}>
          <Icon name="play" /> Open as a connection
        </button>
      </div>
    </div>
  );
}

/** The mcpServers entry a host needs to run a server through the shim. */
export function HostSnippet({ name, command, args, shim, apiUrl }: { name: string; command: string; args: string[]; shim?: string; apiUrl?: string }) {
  const entry: Record<string, unknown> = { command: 'node', args: [shim ?? '<path to mcptool>/bin/tap.mjs', '--name', name, '--', command, ...args] };
  // The shim mirrors to port 3737 unless told otherwise.
  if (apiUrl && apiUrl !== 'http://127.0.0.1:3737') entry.env = { MCPTOOL_URL: apiUrl };
  const text = JSON.stringify({ mcpServers: { [name]: entry } }, null, 2);
  return (
    <div className="snippet">
      <CopyButton text={() => text} />
      <pre className="text-content">{text}</pre>
    </div>
  );
}

// ---------------------------------------------------------------- shared pieces

function useDraft<T>(connectionId: string, craft: Craft, initial: T): [T, (v: T) => void] {
  const key = draftKey(connectionId, craft);
  const value = useStore((s) => s.drafts[key]) as T | undefined;
  const set = (v: T) => setState((s) => ({ drafts: { ...s.drafts, [key]: v } }));
  return [value ?? initial, set];
}

/** The craft's frame; registers its send so Ctrl+Enter works from anywhere. */
function Panel({ onSend, children, className = '' }: { onSend: () => void; children: ReactNode; className?: string }) {
  const latest = useRef(onSend);
  latest.current = onSend;
  useEffect(() => {
    registerSend(() => latest.current());
    return () => registerSend(null);
  }, []);
  return <div className={`craft ${className}`}>{children}</div>;
}

function CraftHead({ tag, title, name, badges, children }: { tag: string; title: string; name?: string; badges?: ReactNode; children?: ReactNode }) {
  return (
    <header className="craft-head">
      <div className="craft-title-row">
        <span className={`kind-tag tag-${tag}`}>{tag}</span>
        <h2 className="craft-title ellipsis" title={title}>
          {title}
        </h2>
        {badges}
      </div>
      {name && name !== title && <div className="mono muted craft-name">{name}</div>}
      {children}
    </header>
  );
}

function Description({ text }: { text?: string }) {
  return text ? <p className="craft-desc">{text}</p> : <p className="craft-desc muted">No description. A model would have to guess what this does.</p>;
}

/** The footer every craft shares: status of the last send, the primary action, cancel while running. */
function SendBar({
  session,
  craftK,
  label,
  onSend,
  disabled,
  children,
}: {
  session: SessionState;
  craftK: string;
  label: string;
  onSend: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const inflight = session.inflight[craftK];
  const result = session.results[craftK];
  const now = useNow(!!inflight);
  const frames = useFrames(session.connectionId);
  const progress = useMemo(() => {
    if (!inflight) return undefined;
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      if (f.seq <= inflight.startedSeq) break;
      if (f.kind === 'notification' && f.method === 'notifications/progress') return f.message?.params as any;
    }
    return undefined;
  }, [frames, inflight]);

  return (
    <footer className="sendbar">
      {inflight ? (
        <div className="send-status">
          <span className="spinner" />
          <span className="mono">{formatMs(now - inflight.startedAt)}</span>
          {progress && (
            <span className="progress-inline" title={progress.message}>
              <span className="progress-track">
                <span
                  className={`progress-fill ${progress.total ? '' : 'indeterminate'}`}
                  style={progress.total ? { transform: `scaleX(${Math.min(1, progress.progress / progress.total)})` } : undefined}
                />
              </span>
              <span className="mono muted">
                {progress.progress}
                {progress.total ? `/${progress.total}` : ''}
              </span>
            </span>
          )}
        </div>
      ) : result ? (
        <div className="send-status">
          <span className={`status ${result.ok && !(result.result as any)?.isError ? 'status-ok' : 'status-err'}`}>
            {result.ok ? ((result.result as any)?.isError ? 'isError' : 'OK') : `error${result.error?.code !== undefined ? ` ${result.error.code}` : ''}`}
          </span>
          <span className="mono muted">{formatMs(result.durationMs)}</span>
          {!result.ok && (
            <span className="send-error ellipsis" title={result.error?.message}>
              {result.error?.message}
            </span>
          )}
        </div>
      ) : (
        <div className="send-status muted send-hint">
          <kbd>{KEYS.send}</kbd> sends
        </div>
      )}
      <span className="spacer" />
      {!inflight && children}
      {inflight ? (
        <button className="btn btn-danger" onClick={() => cancel(session.connectionId, craftK)}>
          Cancel
        </button>
      ) : (
        <button className="btn btn-primary" onClick={onSend} disabled={disabled}>
          {label}
        </button>
      )}
    </footer>
  );
}

function TimeoutInput({ seconds, onChange }: { seconds: number; onChange: (s: number) => void }) {
  return (
    <label className="timeout" title="Request timeout. Resets whenever the server reports progress.">
      <span className="muted">timeout</span>
      <input className="input input-sm mono" type="number" min={1} value={seconds} onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 60))} />
      <span className="muted">s</span>
    </label>
  );
}

// ---------------------------------------------------------------- tools

function ToolCraft({ tool, session }: { tool: Tool; session: SessionState }) {
  const craft: Craft = { kind: 'tool', name: tool.name };
  const craftK = craftKey(craft);
  const [args, setArgs] = useDraft<Record<string, unknown>>(session.connectionId, craft, {});
  const [mode, setMode] = useState<'table' | 'json'>('table');
  const [timeout, setTimeoutS] = useState(300);
  const root = unwrap(tool.inputSchema ?? {}, tool.inputSchema ?? {});
  const required = new Set<string>(root.required ?? []);
  const missing = [...required].filter((k) => args[k] === undefined);
  const a = tool.annotations ?? {};
  const doSend = () => void send(session.connectionId, craftK, 'tools/call', { name: tool.name, arguments: args }, timeout * 1000);

  return (
    <Panel onSend={doSend}>
      <CraftHead
        tag="tool"
        title={displayName(tool)}
        name={tool.name}
        badges={
          <span className="badges">
            {a.readOnlyHint && <span className="badge badge-ok">read-only</span>}
            {a.destructiveHint === true && !a.readOnlyHint && <span className="badge badge-danger">destructive</span>}
            {a.idempotentHint && <span className="badge">idempotent</span>}
            {a.openWorldHint === true && <span className="badge">open world</span>}
          </span>
        }
      />
      <div className="craft-body">
        <Description text={tool.description} />
        <div className="craft-section-head">
          <h4>parameters</h4>
          <span className="spacer" />
          <div className="tabs tabs-sm">
            <button className={mode === 'table' ? 'is-active' : ''} onClick={() => setMode('table')}>
              Table
            </button>
            <button className={mode === 'json' ? 'is-active' : ''} onClick={() => setMode('json')}>
              JSON
            </button>
          </div>
        </div>
        {mode === 'table' ? (
          <ParamTable schema={tool.inputSchema ?? {}} value={args} onChange={(v) => setArgs((v ?? {}) as Record<string, unknown>)} />
        ) : (
          <JsonEditor value={args} onChange={(v) => setArgs((v ?? {}) as Record<string, unknown>)} minRows={8} placeholder="{}" />
        )}
        {missing.length > 0 && (
          <div className="hint">
            Missing required: <span className="mono">{missing.join(', ')}</span>. Sending anyway shows how the server handles invalid input.
          </div>
        )}
        <ModelSees tool={tool} />
      </div>
      <SendBar session={session} craftK={craftK} label="Call tool" onSend={doSend}>
        <TimeoutInput seconds={timeout} onChange={setTimeoutS} />
      </SendBar>
    </Panel>
  );
}

/** The tool's parameters as a reference table whose rows are the inputs. */
function ParamTable({ schema, value, onChange }: { schema: JSONSchema; value: Record<string, unknown>; onChange: (v: unknown) => void }) {
  const root = unwrap(schema, schema);
  if (kindOf(root) !== 'object' || !root.properties) {
    if (kindOf(root) === 'object' && !root.additionalProperties) return <div className="muted">Takes no arguments.</div>;
    return <SchemaForm schema={schema} value={value} onChange={onChange} />;
  }
  const entries = Object.entries<JSONSchema>(root.properties);
  if (entries.length === 0) return <div className="muted">Takes no arguments.</div>;
  const required = new Set<string>(root.required ?? []);
  const set = (k: string, v: unknown) => {
    const next = { ...value };
    if (v === undefined) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  return (
    <table className="params">
      <tbody>
        {entries
          .sort(([a], [b]) => Number(required.has(b)) - Number(required.has(a)))
          .map(([name, raw]) => {
            const s = unwrap(raw, schema);
            const notes = constraints(s);
            return (
              <tr key={name} className={value[name] !== undefined ? 'is-set' : ''}>
                <th scope="row">
                  <div className="param-name mono">
                    {name}
                    {required.has(name) && <span className="param-req" title="Required">*</span>}
                  </div>
                  <div className="param-type mono">{typeLabel(s, schema)}</div>
                  {s.description && <div className="param-desc">{s.description}</div>}
                  {notes.length > 0 && <div className="param-notes">{notes.join(' · ')}</div>}
                </th>
                <td>
                  <Control schema={s} root={schema} required={required.has(name)} value={value[name]} onChange={(v) => set(name, v)} />
                  {value[name] !== undefined && (
                    <button className="btn btn-ghost btn-xs param-clear" onClick={() => set(name, undefined)} title="Remove this argument">
                      clear
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}

function ModelSees({ tool }: { tool: Tool }) {
  const [format, setFormat] = useState<LlmFormat>('anthropic');
  const payload = toolsForLlm([tool], format)[0];
  return (
    <details className="model-sees">
      <summary>
        As the model sees it <span className="mono muted">≈{estimateTokens(payload)} tokens</span>
      </summary>
      <div className="tabs tabs-sm">
        {(['anthropic', 'openai', 'mcp'] as const).map((f) => (
          <button key={f} className={format === f ? 'is-active' : ''} onClick={() => setFormat(f)}>
            {f === 'anthropic' ? 'Anthropic' : f === 'openai' ? 'OpenAI' : 'MCP'}
          </button>
        ))}
      </div>
      <JsonView value={payload} openDepth={3} />
    </details>
  );
}

// ---------------------------------------------------------------- resources

function ResourceCraft({ uri, session }: { uri: string; session: SessionState }) {
  const craft: Craft = { kind: 'resource', uri };
  const craftK = craftKey(craft);
  const resource: Resource | undefined = session.lists.resources.find((r) => r.uri === uri);
  const subscribed = session.subscribed.includes(uri);
  const canSubscribe = !!(session.info?.capabilities?.resources as any)?.subscribe;
  const doSend = () => void send(session.connectionId, craftK, 'resources/read', { uri });
  // Opening a resource reads it straight away, like following a link.
  const readOnce = useRef(false);
  useEffect(() => {
    if (readOnce.current) return;
    readOnce.current = true;
    doSend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Panel onSend={doSend}>
      <CraftHead
        tag="resource"
        title={resource ? displayName(resource) : uri}
        name={resource?.name}
        badges={
          <span className="badges">
            {resource?.mimeType && <span className="badge mono">{resource.mimeType}</span>}
            {resource?.size !== undefined && <span className="badge">{resource.size} B</span>}
          </span>
        }
      >
        <div className="mono craft-uri">{uri}</div>
      </CraftHead>
      <div className="craft-body">
        <Description text={resource?.description} />
        <p className="muted small">Resources are application-controlled: a host attaches them to the conversation; the model doesn't fetch them itself. The result lands in the stream.</p>
      </div>
      <SendBar session={session} craftK={craftK} label="Read" onSend={doSend}>
        {canSubscribe && (
          <button className={`btn ${subscribed ? 'is-on' : ''}`} onClick={() => toggleSubscribe(session.connectionId, uri)} title="Receive notifications/resources/updated">
            {subscribed ? 'Subscribed' : 'Subscribe'}
          </button>
        )}
      </SendBar>
    </Panel>
  );
}

function TemplateCraft({ template, session }: { template: ResourceTemplate; session: SessionState }) {
  const craft: Craft = { kind: 'template', uriTemplate: template.uriTemplate };
  const craftK = craftKey(craft);
  const [values, setValues] = useDraft<Record<string, string>>(session.connectionId, craft, {});
  const vars = templateVariables(template.uriTemplate);
  const uri = expandTemplate(template.uriTemplate, values);
  const doSend = () => void send(session.connectionId, craftK, 'resources/read', { uri });
  return (
    <Panel onSend={doSend}>
      <CraftHead tag="template" title={displayName(template)} name={template.name}>
        <div className="mono craft-uri">{uri || template.uriTemplate}</div>
      </CraftHead>
      <div className="craft-body">
        <Description text={template.description} />
        <h4>uri template</h4>
        <div className="mono template-uri">{template.uriTemplate}</div>
        <h4>variables</h4>
        <ArgInputs session={session} args={vars.map((name) => ({ name, required: true }))} values={values} onChange={setValues} completionRef={{ type: 'ref/resource', uri: template.uriTemplate }} />
      </div>
      <SendBar session={session} craftK={craftK} label="Read" onSend={doSend} disabled={!uri} />
    </Panel>
  );
}

// ---------------------------------------------------------------- prompts

function PromptCraft({ prompt, session }: { prompt: Prompt; session: SessionState }) {
  const craft: Craft = { kind: 'prompt', name: prompt.name };
  const craftK = craftKey(craft);
  const [values, setValues] = useDraft<Record<string, string>>(session.connectionId, craft, {});
  const args = prompt.arguments ?? [];
  const missing = args.filter((a) => a.required && !values[a.name]).map((a) => a.name);
  const doSend = () => void send(session.connectionId, craftK, 'prompts/get', { name: prompt.name, arguments: compact(values) });
  return (
    <Panel onSend={doSend}>
      <CraftHead tag="prompt" title={displayName(prompt)} name={`/${prompt.name}`} />
      <div className="craft-body">
        <Description text={prompt.description} />
        <p className="muted small">Prompts are user-controlled templates, usually offered as slash commands; the host inserts the returned messages into the conversation.</p>
        {args.length ? (
          <>
            <h4>arguments</h4>
            <ArgInputs session={session} args={args} values={values} onChange={setValues} completionRef={{ type: 'ref/prompt', name: prompt.name }} />
          </>
        ) : (
          <div className="muted">Takes no arguments.</div>
        )}
        {missing.length > 0 && (
          <div className="hint">
            Missing required: <span className="mono">{missing.join(', ')}</span>
          </div>
        )}
      </div>
      <SendBar session={session} craftK={craftK} label="Get prompt" onSend={doSend} />
    </Panel>
  );
}

const compact = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== ''));

/** String arguments with server-side completion (completion/complete) when the server offers it. */
function ArgInputs({
  session,
  args,
  values,
  onChange,
  completionRef,
}: {
  session: SessionState;
  args: PromptArgument[];
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  completionRef: Record<string, string>;
}) {
  return (
    <table className="params">
      <tbody>
        {args.map((arg) => (
          <ArgRow key={arg.name} session={session} arg={arg} values={values} completionRef={completionRef} onChange={(v) => onChange({ ...values, [arg.name]: v })} />
        ))}
      </tbody>
    </table>
  );
}

function ArgRow({
  session,
  arg,
  values,
  completionRef,
  onChange,
}: {
  session: SessionState;
  arg: PromptArgument;
  values: Record<string, string>;
  completionRef: Record<string, string>;
  onChange: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const listId = useId();
  const value = values[arg.name] ?? '';
  const canComplete = !!session.info?.capabilities?.completions && !!session.sessionId;

  useEffect(() => {
    if (!canComplete || !focused) return;
    const timer = setTimeout(async () => {
      const others = compact(Object.fromEntries(Object.entries(values).filter(([k]) => k !== arg.name)));
      const res = await rpc(session.connectionId, 'completion/complete', {
        ref: completionRef,
        argument: { name: arg.name, value },
        ...(Object.keys(others).length ? { context: { arguments: others } } : {}),
      });
      if (res.ok) setSuggestions((res.result as any)?.completion?.values ?? []);
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused, canComplete]);

  return (
    <tr className={value ? 'is-set' : ''}>
      <th scope="row">
        <div className="param-name mono">
          {arg.name}
          {arg.required && <span className="param-req">*</span>}
        </div>
        <div className="param-type mono">string{canComplete ? ' · completes' : ''}</div>
        {arg.description && <div className="param-desc">{arg.description}</div>}
      </th>
      <td>
        <input className="input" list={listId} value={value} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(e) => onChange(e.target.value)} />
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- raw

interface RawDraft {
  method: string;
  params: unknown;
  notification?: boolean;
}

function RawCraft({ session }: { session: SessionState }) {
  const craft: Craft = { kind: 'raw' };
  const craftK = craftKey(craft);
  const [d, setD] = useDraft<RawDraft>(session.connectionId, craft, { method: 'tools/list', params: undefined });
  const [timeout, setTimeoutS] = useState(60);
  const [note, setNote] = useState<string | null>(null);
  const listId = useId();
  const doSend = async () => {
    if (!d.method) return;
    if (d.notification) {
      try {
        await notify(session.connectionId, d.method, d.params);
        setNote(`Sent ${d.method} at ${new Date().toLocaleTimeString()}; notifications get no response.`);
      } catch (err) {
        setNote(`Failed: ${(err as Error).message}`);
      }
      return;
    }
    void send(session.connectionId, craftK, d.method, d.params, timeout * 1000);
  };
  return (
    <Panel onSend={doSend}>
      <CraftHead tag={d.notification ? 'notify' : 'rpc'} title="Raw JSON-RPC" />
      <div className="craft-body">
        <p className="craft-desc muted">Any request or notification. The SDK adds the envelope and id; you give the method and params.</p>
        <div className="segmented">
          <button className={!d.notification ? 'is-active' : ''} onClick={() => setD({ ...d, notification: false })}>
            Request
          </button>
          <button className={d.notification ? 'is-active' : ''} onClick={() => setD({ ...d, notification: true })}>
            Notification
          </button>
        </div>
        <h4>method</h4>
        <input className="input mono" list={listId} value={d.method} placeholder="tools/list" onChange={(e) => setD({ ...d, method: e.target.value })} />
        <datalist id={listId}>
          {KNOWN_METHODS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <h4>params</h4>
        <JsonEditor value={d.params} onChange={(params) => setD({ ...d, params })} minRows={8} placeholder="(no params)" />
        {note && <div className="hint">{note}</div>}
      </div>
      <SendBar session={session} craftK={craftK} label="Send" onSend={doSend} disabled={!d.method}>
        {!d.notification && <TimeoutInput seconds={timeout} onChange={setTimeoutS} />}
      </SendBar>
    </Panel>
  );
}

// ---------------------------------------------------------------- replies to the server

function ReplyCraft({ pending, session }: { pending: SessionState['pending'][number]; session: SessionState }) {
  const reply = (a: ServerRequestAnswer) => void answer(session.connectionId, pending.rid, a);
  const queued = session.pending.length - 1;
  // The question's own frame in the stream (the pending marker arrives one event later).
  const frames = useFrames(session.connectionId);
  const frameSeq = frames.find((f) => f.rid === pending.rid)?.seq ?? pending.seq;
  const form =
    pending.method === 'sampling/createMessage' ? (
      <SamplingForm params={pending.params} onAnswer={reply} />
    ) : pending.method === 'elicitation/create' ? (
      <ElicitationForm params={pending.params} onAnswer={reply} />
    ) : (
      <GenericForm params={pending.params} onAnswer={reply} />
    );
  return (
    <div className="craft craft-reply">
      <CraftHead tag="ask" title={pending.method === 'sampling/createMessage' ? 'The server wants a completion' : pending.method === 'elicitation/create' ? 'The server asks the user' : 'The server asks the client'} name={pending.method}>
        <div className="muted small">
          Frame #{frameSeq}. {queued > 0 && `${queued} more waiting.`}
          <button className="btn btn-ghost btn-xs" onClick={() => setState({ selected: { connectionId: session.connectionId, seq: frameSeq } })}>
            show frame
          </button>
        </div>
      </CraftHead>
      {form}
    </div>
  );
}

function SamplingForm({ params, onAnswer }: { params: any; onAnswer: (a: ServerRequestAnswer) => void }) {
  const [text, setText] = useState('');
  const [model, setModel] = useState('human-in-the-loop');
  return (
    <>
      <div className="craft-body">
        <p className="craft-desc muted">A host would show this to the user for approval and send it to its model. Here you write the model's reply yourself.</p>
        {params?.systemPrompt && (
          <div className="message message-system">
            <div className="message-role">system</div>
            <pre className="text-content">{params.systemPrompt}</pre>
          </div>
        )}
        {(params?.messages ?? []).map((m: any, i: number) => (
          <div key={i} className={`message message-${m.role}`}>
            <div className="message-role">{m.role}</div>
            {(Array.isArray(m.content) ? m.content : [m.content]).map((c: any, j: number) => (
              <ContentBlockView key={j} block={c} />
            ))}
          </div>
        ))}
        <div className="mono muted small">
          maxTokens {params?.maxTokens}
          {params?.temperature !== undefined && ` · temperature ${params.temperature}`}
          {params?.modelPreferences && ` · preferences ${JSON.stringify(params.modelPreferences)}`}
        </div>
        <h4>assistant reply</h4>
        <AutoTextarea className="input" minRows={5} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        <h4>model name reported</h4>
        <input className="input mono" value={model} onChange={(e) => setModel(e.target.value)} />
      </div>
      <footer className="sendbar">
        <button className="btn" onClick={() => onAnswer({ error: { code: -1, message: 'User rejected sampling request' } })}>
          Reject
        </button>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => onAnswer({ result: { role: 'assistant', content: { type: 'text', text }, model, stopReason: 'endTurn' } })}>
          Send reply
        </button>
      </footer>
    </>
  );
}

function ElicitationForm({ params, onAnswer }: { params: any; onAnswer: (a: ServerRequestAnswer) => void }) {
  const isUrl = params?.mode === 'url';
  const [content, setContent] = useState<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries<any>(params?.requestedSchema?.properties ?? {})) if (s?.default !== undefined) out[k] = s.default;
    return out;
  });
  return (
    <>
      <div className="craft-body">
        <p className="elicit-message">{params?.message}</p>
        {isUrl ? (
          <a className="btn" href={params.url} target="_blank" rel="noreferrer">
            Open {params.url}
          </a>
        ) : (
          <ParamTable schema={params?.requestedSchema ?? {}} value={content} onChange={(v) => setContent((v ?? {}) as Record<string, unknown>)} />
        )}
      </div>
      <footer className="sendbar">
        <button className="btn" onClick={() => onAnswer({ result: { action: 'cancel' } })}>
          Cancel
        </button>
        <button className="btn" onClick={() => onAnswer({ result: { action: 'decline' } })}>
          Decline
        </button>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => onAnswer({ result: isUrl ? { action: 'accept' } : { action: 'accept', content } })}>
          {isUrl ? 'Accept' : 'Submit'}
        </button>
      </footer>
    </>
  );
}

function GenericForm({ params, onAnswer }: { params: any; onAnswer: (a: ServerRequestAnswer) => void }) {
  const [result, setResult] = useState<unknown>({});
  return (
    <>
      <div className="craft-body">
        <p className="craft-desc muted">mcptool has no special handling for this method. Write the result to send back.</p>
        <h4>params</h4>
        <JsonView value={params} />
        <h4>result</h4>
        <JsonEditor value={result} onChange={setResult} minRows={4} />
      </div>
      <footer className="sendbar">
        <button className="btn" onClick={() => onAnswer({ error: { code: -32601, message: 'Method not supported' } })}>
          Method not found
        </button>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => onAnswer({ result: (result ?? {}) as Record<string, unknown> })}>
          Send result
        </button>
      </footer>
    </>
  );
}

export { setCraft };
