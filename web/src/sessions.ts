import type { ConnectionConfig, RpcResponse, ServerRequestAnswer, SessionEvent, SessionInfo, TapInfo } from '../../shared/types';
import type { Prompt, Resource, ResourceTemplate, Tool } from './mcp';
import { initRuntime, NeedsAuth, runtime } from './runtime';
import type { BrowserRuntime } from './runtime-browser';
import { EMPTY_LISTS, emptySession, getState, isTapKey, setState, tapKey, updateSession, type Craft, type Lists, type SessionState } from './store';

// Everything that drives sessions. Components call these and read the results from the
// store; the Runtime (full server, or the lite in-page client) does the talking.

const MAX_EVENTS = 5000;
const streams = new Map<string, () => void>();

// ---------------------------------------------------------------- bootstrap

export async function bootstrap() {
  try {
    const rt = await initRuntime();
    const [{ connections: saved, location, demo }, live, { taps, shim, apiUrl }] = await Promise.all([rt.listConnections(), rt.listSessions(), rt.listTaps()]);
    let connections = saved;
    if (connections.length === 0 && demo) {
      // First run: offer the bundled demo server so there's something to explore.
      connections = [{ id: crypto.randomUUID(), name: 'mcptool demo server', transport: 'stdio', command: demo.command, args: demo.args, cwd: demo.cwd, env: demo.env }];
      void rt.saveConnections(connections);
    }
    const sessions: Record<string, SessionState> = {};
    for (const info of live) {
      if (!info.live || !connections.some((c) => c.id === info.connectionId)) continue;
      sessions[info.connectionId] = { ...emptySession(info.connectionId), sessionId: info.id, status: 'connected', info };
    }
    const liveIds = Object.keys(sessions);
    for (const tap of taps) sessions[tapKey(tap.id)] = tapSession(tap);
    const liveTaps = taps.filter((t) => t.live).map((t) => tapKey(t.id));
    setState({
      loaded: true,
      runtime: rt.capabilities,
      connections,
      storeLocation: location,
      taps,
      shimPath: shim,
      apiUrl,
      sessions,
      activeId: liveIds[0] ?? liveTaps[0] ?? connections[0]?.id,
      center: liveIds.length || liveTaps.length ? 'stream' : 'welcome',
    });
    for (const id of liveIds) {
      openStream(id, { sessionId: sessions[id].sessionId! });
      void refreshLists(id).then(() => {
        const st = getState();
        if (st.activeId === id && st.craft.kind === 'none') setState({ craft: firstCraft(st.sessions[id].lists) });
      });
    }
    for (const tap of taps) openStream(tapKey(tap.id), { tapId: tap.id });
    if (rt.capabilities.taps) watchTaps();

    // Lite: a sign-in round trip may have just brought the page back.
    if (rt.capabilities.label === 'lite') {
      const { connectionId, error } = (rt as BrowserRuntime).takeConnectAfterAuth();
      if (error) setState({ banner: { kind: 'error', text: `Sign-in failed: ${error}` } });
      if (connectionId && connections.some((c) => c.id === connectionId)) void connect(connectionId, true);
    }
  } catch (err) {
    setState({ loaded: true, banner: { kind: 'error', text: `Could not start: ${(err as Error).message}` } });
  }
}

// ---------------------------------------------------------------- connections (saved configs)

export function saveConnections(next: ConnectionConfig[]) {
  setState({ connections: next });
  runtime()
    .saveConnections(next)
    .catch((err) => setState({ banner: { kind: 'error', text: `Saving failed: ${err.message}` } }));
}

export function upsertConnection(c: ConnectionConfig) {
  const { connections } = getState();
  const exists = connections.some((x) => x.id === c.id);
  saveConnections(exists ? connections.map((x) => (x.id === c.id ? c : x)) : [...connections, c]);
}

export function newConnection(partial: Partial<ConnectionConfig> = {}): ConnectionConfig {
  const stdio = runtime().capabilities.stdio;
  const c: ConnectionConfig = {
    id: crypto.randomUUID(),
    name: 'New connection',
    ...(stdio ? { transport: 'stdio', command: '', args: [] } : { transport: 'streamable-http', url: '' }),
    ...partial,
  };
  saveConnections([...getState().connections, c]);
  select(c.id);
  setState({ craft: { kind: 'settings' }, center: 'stream' });
  return c;
}

export function deleteConnection(id: string) {
  void disconnect(id);
  const connections = getState().connections.filter((c) => c.id !== id);
  saveConnections(connections);
  setState((s) => {
    const sessions = { ...s.sessions };
    delete sessions[id];
    const activeId = s.activeId === id ? connections[0]?.id : s.activeId;
    return { sessions, activeId, center: connections.length ? s.center : 'welcome', craft: s.activeId === id ? { kind: 'none' } : s.craft };
  });
}

/** Make a connection the active "interface": its stream, tree and crafter show. */
export function select(connectionId: string) {
  const s = getState();
  if (s.activeId === connectionId && s.center !== 'welcome') return;
  const session = s.sessions[connectionId];
  setState({
    activeId: connectionId,
    center: 'stream',
    craft: session?.status === 'connected' ? firstCraft(session.lists) : { kind: 'settings' },
    selected: undefined,
  });
}

function firstCraft(lists: Lists): Craft {
  if (lists.tools[0]) return { kind: 'tool', name: lists.tools[0].name };
  if (lists.prompts[0]) return { kind: 'prompt', name: lists.prompts[0].name };
  if (lists.resources[0]) return { kind: 'resource', uri: lists.resources[0].uri };
  return { kind: 'raw' };
}

export function setCraft(craft: Craft) {
  setState((s) => ({ craft, center: 'stream', layout: { ...s.layout, crafterOpen: true } }));
}

export function openResource(uri: string) {
  setCraft({ kind: 'resource', uri });
}

// ---------------------------------------------------------------- sessions

export async function connect(connectionId: string, afterSignIn = false) {
  const config = getState().connections.find((c) => c.id === connectionId);
  if (!config) return;
  closeStream(connectionId);
  updateSession(connectionId, (s) => ({
    ...emptySession(connectionId),
    // Keep the old stream visible underneath while reconnecting; a note marks the boundary.
    events: s.events,
    seenSeq: s.seenSeq,
    status: 'connecting',
  }));
  setState({ activeId: connectionId, center: 'stream', banner: null });
  try {
    const info = await runtime().connect(config);
    updateSession(connectionId, () => ({ sessionId: info.id, info, status: 'connected', error: undefined, auth: undefined, events: [], seenSeq: 0 }));
    setState((s) => ({ selected: s.selected?.connectionId === connectionId ? undefined : s.selected }));
    openStream(connectionId, { sessionId: info.id });
    await refreshLists(connectionId);
    const st = getState();
    if (st.activeId === connectionId && (st.craft.kind === 'none' || st.craft.kind === 'settings')) {
      setState({ craft: firstCraft(st.sessions[connectionId].lists) });
    }
    // The handshake was the person's own doing: it does not need to be flagged as new.
    setTimeout(() => acknowledge(connectionId), 150);
  } catch (err) {
    if (err instanceof NeedsAuth && !afterSignIn) {
      if (err.sessionId) openStream(connectionId, { sessionId: err.sessionId });
      updateSession(connectionId, () => ({ status: 'auth', auth: { authorizationUrl: err.authorizationUrl, flowId: err.flowId ?? '' } }));
      if (!err.flowId) {
        // Lite: the sign-in happens in this tab; the page comes back and resumes (see bootstrap).
        location.assign(err.authorizationUrl);
        return;
      }
      const tab = window.open(err.authorizationUrl, '_blank');
      setState({
        banner: {
          kind: 'info',
          text: tab ? `Finish signing in to ${config.name} in the new tab; mcptool connects as soon as you're done.` : `${config.name} requires you to sign in.`,
          link: { label: 'Open sign-in page', href: err.authorizationUrl },
        },
      });
      try {
        await runtime().waitForSignIn(err.flowId);
        setState({ banner: null });
        await connect(connectionId, true);
      } catch (e) {
        updateSession(connectionId, () => ({ status: 'error', error: `Sign-in failed: ${(e as Error).message}`, auth: undefined }));
        setState({ banner: null });
      }
      return;
    }
    updateSession(connectionId, () => ({ status: 'error', error: (err as Error).message }));
  }
}

export async function disconnect(connectionId: string) {
  const s = getState().sessions[connectionId];
  closeStream(connectionId);
  if (s?.sessionId) {
    await runtime()
      .disconnect(s.sessionId)
      .catch((err) => setState({ banner: { kind: 'error', text: `Disconnect failed: ${(err as Error).message}` } }));
  }
  updateSession(connectionId, () => ({ status: 'idle', sessionId: undefined, info: undefined, pending: [], inflight: {}, lists: EMPTY_LISTS }));
  setState((st) => (st.activeId === connectionId && st.craft.kind !== 'settings' ? { craft: { kind: 'settings' } } : {}));
}

export async function restart(connectionId: string) {
  await disconnect(connectionId);
  await connect(connectionId);
}

/** Fetches every page of a paginated list method (tools/list, resources/list, ...). */
async function listAll<T>(sessionId: string, method: string, key: string): Promise<{ items: T[]; error?: string }> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const res = await runtime().request(sessionId, method, cursor ? { cursor } : undefined);
    if (!res.ok) return { items, error: res.error?.message };
    const result = res.result as Record<string, unknown>;
    items.push(...((result[key] as T[]) ?? []));
    cursor = result.nextCursor as string | undefined;
    if (!cursor) break;
  }
  return { items };
}

export async function refreshLists(connectionId: string, which?: (keyof Lists)[]) {
  const s = getState().sessions[connectionId];
  if (!s?.sessionId || !s.info || s.tap) return;
  const caps = s.info.capabilities ?? {};
  const want = (k: keyof Lists) => !which || which.includes(k);
  const sid = s.sessionId;
  const jobs: Promise<void>[] = [];
  const load = <T,>(key: keyof Lists, method: string, field: string) =>
    jobs.push(
      listAll<T>(sid, method, field).then(({ items, error }) => {
        updateSession(connectionId, (cur) => ({
          lists: { ...cur.lists, [key]: items },
          listErrors: { ...cur.listErrors, [key]: error },
        }));
      }),
    );
  if (caps.tools && want('tools')) load<Tool>('tools', 'tools/list', 'tools');
  if (caps.resources && want('resources')) load<Resource>('resources', 'resources/list', 'resources');
  if (caps.resources && want('templates')) load<ResourceTemplate>('templates', 'resources/templates/list', 'resourceTemplates');
  if (caps.prompts && want('prompts')) load<Prompt>('prompts', 'prompts/list', 'prompts');
  await Promise.all(jobs);
}

// ---------------------------------------------------------------- taps

function tapSession(tap: TapInfo): SessionState {
  return { ...emptySession(tapKey(tap.id)), sessionId: tap.id, tap, status: tap.live ? 'tapping' : 'closed' };
}

/** Follows the runtime's list of taps, so a host starting a capture shows up as it happens. */
function watchTaps() {
  runtime().subscribeTaps((taps) => {
    const st = getState();
    const known = new Set(st.taps.map((t) => t.id));
    const sessions = { ...st.sessions };
    for (const tap of taps) {
      const key = tapKey(tap.id);
      const cur = sessions[key];
      if (!cur) {
        sessions[key] = tapSession(tap);
      } else {
        sessions[key] = { ...cur, tap, status: tap.live ? 'tapping' : cur.status === 'tapping' ? 'closed' : cur.status, error: tap.closedReason };
      }
    }
    for (const id of Object.keys(sessions)) {
      if (isTapKey(id) && !taps.some((t) => tapKey(t.id) === id)) {
        delete sessions[id];
        closeStream(id);
      }
    }
    const fresh = taps.filter((t) => !known.has(t.id));
    const active = st.activeId ? sessions[st.activeId] : undefined;
    const idle = !active || !['connected', 'tapping', 'connecting', 'auth'].includes(active.status);
    setState({
      taps,
      sessions,
      ...(fresh.length && (idle || st.center === 'welcome') ? { activeId: tapKey(fresh[0].id), center: 'stream', craft: { kind: 'none' }, selected: undefined } : {}),
      ...(fresh.length && !(idle || st.center === 'welcome')
        ? { banner: { kind: 'info', text: `A host started a capture: ${fresh[0].name}.`, action: { label: 'Show', run: () => selectTap(fresh[0].id) } } }
        : {}),
      // Only a tap can vanish from under the selection; an idle saved connection has no session entry and stays.
      ...(isTapKey(st.activeId) && !sessions[st.activeId!] ? { activeId: st.connections[0]?.id, center: 'welcome' } : {}),
    });
    for (const tap of fresh) openStream(tapKey(tap.id), { tapId: tap.id });
  });
}

export function selectTap(tapId: string) {
  setState({ activeId: tapKey(tapId), center: 'stream', craft: { kind: 'none' }, selected: undefined, banner: null });
}

export async function forgetTap(tapId: string) {
  closeStream(tapKey(tapId));
  await runtime()
    .forgetTap(tapId)
    .catch(() => {});
}

/** Saves the tapped server as a connection of its own, so it can be driven from here too. */
export function openTapAsConnection(tap: TapInfo) {
  const existing = getState().connections.find((c) => c.transport === 'stdio' && c.command === tap.command && JSON.stringify(c.args ?? []) === JSON.stringify(tap.args));
  if (existing) {
    select(existing.id);
    return;
  }
  newConnection({ name: tap.name, transport: 'stdio', command: tap.command, args: tap.args });
}

/**
 * A tap has no client of its own: what the server is and offers is read off the traffic the
 * host exchanged with it (initialize, tools/list, ...).
 */
function deriveFromTraffic(events: SessionEvent[], tap: TapInfo, live: boolean): Pick<SessionState, 'info' | 'lists'> {
  const requests = new Map<string, string>();
  let info: SessionInfo | undefined;
  const lists: Lists = { ...EMPTY_LISTS };
  for (const e of events) {
    if (e.type !== 'message') continue;
    const m = e.message;
    if (m.method && m.id !== undefined) {
      requests.set(`${e.direction}:${m.id}`, m.method);
      continue;
    }
    if (m.method || m.id === undefined || e.direction !== 'in' || !m.result) continue;
    const method = requests.get(`out:${m.id}`);
    const r = m.result as any;
    switch (method) {
      case 'initialize':
        info = { id: tap.id, connectionId: tapKey(tap.id), connectionName: tap.name, live, serverInfo: r.serverInfo, protocolVersion: r.protocolVersion, capabilities: r.capabilities, instructions: r.instructions };
        break;
      case 'tools/list':
        lists.tools = r.tools ?? [];
        break;
      case 'resources/list':
        lists.resources = r.resources ?? [];
        break;
      case 'resources/templates/list':
        lists.templates = r.resourceTemplates ?? [];
        break;
      case 'prompts/list':
        lists.prompts = r.prompts ?? [];
        break;
    }
  }
  return { info, lists };
}

// ---------------------------------------------------------------- event streams

function openStream(connectionId: string, source: { sessionId: string } | { tapId: string }) {
  closeStream(connectionId);
  const sessionId = 'tapId' in source ? source.tapId : source.sessionId;
  let queue: SessionEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = runtime().subscribe(
    source,
    (e) => {
      queue.push(e);
      timer ??= setTimeout(() => {
        const batch = queue;
        queue = [];
        timer = undefined;
        ingest(connectionId, sessionId, batch);
      }, 30);
    },
    () => {
      // The source is gone for good: the session no longer exists where it lived.
      if (streams.get(connectionId) !== unsubscribe) return;
      streams.delete(connectionId);
      const s = getState().sessions[connectionId];
      if (s?.sessionId === sessionId && s.status === 'connected') {
        updateSession(connectionId, () => ({ status: 'closed', error: 'The mcptool server was restarted or stopped.' }));
      }
    },
  );
  streams.set(connectionId, unsubscribe);
}

function closeStream(connectionId: string) {
  streams.get(connectionId)?.();
  streams.delete(connectionId);
}

function ingest(connectionId: string, sessionId: string, batch: SessionEvent[]) {
  const s = getState().sessions[connectionId];
  if (!s || s.sessionId !== sessionId) return;
  let events = s.events.concat(batch);
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
  let pending = s.pending;
  let status = s.status;
  let error = s.error;
  const changed = new Set<keyof Lists>();
  for (const e of batch) {
    if (e.type === 'server-request') pending = [...pending, { rid: e.rid, method: e.method, params: e.params, seq: e.seq }];
    else if (e.type === 'server-request-resolved') pending = pending.filter((p) => p.rid !== e.rid);
    else if (e.type === 'closed' && status === 'connected') {
      status = 'closed';
      error = e.reason === 'Disconnected by user' ? undefined : e.reason;
    } else if (e.type === 'message' && e.direction === 'in') {
      const m = e.message.method;
      if (m === 'notifications/tools/list_changed') changed.add('tools');
      if (m === 'notifications/resources/list_changed') changed.add('resources').add('templates');
      if (m === 'notifications/prompts/list_changed') changed.add('prompts');
    }
  }
  if (s.tap) {
    // Taps learn the server from what the host asked it; nothing to fetch here.
    const derived = deriveFromTraffic(events, s.tap, status === 'tapping');
    updateSession(connectionId, () => ({ events, status, error, info: derived.info ?? s.info, lists: derived.lists }));
    return;
  }
  updateSession(connectionId, () => ({ events, pending, status, error }));
  if (changed.size) void refreshLists(connectionId, [...changed]);

  // A server question arrived: bring the crafter to it if this is the active server.
  const st = getState();
  const newPending = pending.find((p) => !s.pending.some((q) => q.rid === p.rid));
  if (newPending && st.activeId === connectionId) setCraft({ kind: 'reply', rid: newPending.rid });

  // A send is waiting for its response frame to land: select it.
  if (s.selectWhenLanded) {
    const { startedSeq, method } = s.selectWhenLanded;
    let reqId: string | number | undefined;
    for (const e of events) {
      if (e.seq > startedSeq && e.type === 'message' && e.direction === 'out' && e.message.method === method && e.message.id !== undefined) {
        reqId = e.message.id;
        break;
      }
    }
    const resp = reqId === undefined ? undefined : events.find((e) => e.type === 'message' && e.direction === 'in' && !e.message.method && e.message.id === reqId);
    if (resp) {
      updateSession(connectionId, () => ({ selectWhenLanded: undefined }));
      if (getState().activeId === connectionId) setState({ selected: { connectionId, seq: resp.seq } });
    }
  }
}

/** Mark everything in the stream as seen (clears the held tint). */
export function acknowledge(connectionId: string) {
  const s = getState().sessions[connectionId];
  if (!s) return;
  const last = s.events.at(-1)?.seq ?? 0;
  if (last !== s.seenSeq) updateSession(connectionId, () => ({ seenSeq: last }));
}

// ---------------------------------------------------------------- sending

// The active craft registers its send so Ctrl+Enter works from anywhere, not only
// while focus is inside the crafter.
let currentSend: (() => void) | null = null;
export function registerSend(fn: (() => void) | null) {
  currentSend = fn;
}
export function triggerSend(): boolean {
  if (!currentSend) return false;
  currentSend();
  return true;
}

export async function send(connectionId: string, key: string, method: string, params?: unknown, timeoutMs?: number): Promise<RpcResponse | undefined> {
  const s = getState().sessions[connectionId];
  if (!s?.sessionId || s.inflight[key]) return;
  const inflightKey = crypto.randomUUID();
  const startedSeq = s.events.at(-1)?.seq ?? 0;
  // Sending means the person is watching the stream: what is there now counts as seen.
  acknowledge(connectionId);
  updateSession(connectionId, (cur) => ({
    inflight: { ...cur.inflight, [key]: { key: inflightKey, method, startedSeq, startedAt: Date.now() } },
    selectWhenLanded: { startedSeq, method },
  }));
  let res: RpcResponse;
  try {
    res = await runtime().request(s.sessionId, method, params, { key: inflightKey, timeoutMs });
  } catch (err) {
    const message =
      (err as Error).message === 'Unknown session' ? 'This session no longer exists (the server was probably restarted). Reconnect to continue.' : (err as Error).message;
    res = { ok: false, error: { message }, durationMs: 0 };
  }
  updateSession(connectionId, (cur) => {
    const inflight = { ...cur.inflight };
    delete inflight[key];
    return { inflight, results: { ...cur.results, [key]: res } };
  });
  return res;
}

export function cancel(connectionId: string, key: string) {
  const s = getState().sessions[connectionId];
  const inflight = s?.inflight[key];
  if (s?.sessionId && inflight) runtime().cancel(s.sessionId, inflight.key).catch(() => {});
}

export async function notify(connectionId: string, method: string, params?: unknown) {
  const s = getState().sessions[connectionId];
  if (!s?.sessionId) throw new Error('Not connected');
  await runtime().notify(s.sessionId, method, params);
}

export async function answer(connectionId: string, rid: string, a: ServerRequestAnswer) {
  const s = getState().sessions[connectionId];
  if (!s?.sessionId) return;
  updateSession(connectionId, (cur) => ({ pending: cur.pending.filter((p) => p.rid !== rid) }));
  const st = getState();
  if (st.craft.kind === 'reply' && st.craft.rid === rid) {
    const next = s.pending.find((p) => p.rid !== rid);
    setState({ craft: next ? { kind: 'reply', rid: next.rid } : firstCraft(s.lists) });
  }
  await runtime()
    .answer(s.sessionId, rid, a)
    .catch((err) => setState({ banner: { kind: 'error', text: `Could not answer: ${err.message}` } }));
}

export async function toggleSubscribe(connectionId: string, uri: string) {
  const s = getState().sessions[connectionId];
  if (!s?.sessionId) return;
  const on = s.subscribed.includes(uri);
  const res = await runtime().request(s.sessionId, on ? 'resources/unsubscribe' : 'resources/subscribe', { uri });
  if (res.ok) updateSession(connectionId, (cur) => ({ subscribed: on ? cur.subscribed.filter((u) => u !== uri) : [...cur.subscribed, uri] }));
}

/** A request from a component that is not a craft send (completion, ping, log level). */
export function rpc(connectionId: string, method: string, params?: unknown): Promise<RpcResponse> {
  const s = getState().sessions[connectionId];
  if (!s?.sessionId) return Promise.resolve({ ok: false, error: { message: 'Not connected' }, durationMs: 0 });
  return runtime().request(s.sessionId, method, params);
}
