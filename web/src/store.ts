import { useSyncExternalStore } from 'react';
import type { ConnectionConfig, RpcResponse, SessionEvent, SessionInfo, TapInfo } from '../../shared/types';
import type { Prompt, Resource, ResourceTemplate, Tool } from './mcp';

// One small external store for the whole workbench. Components read slices with
// useStore(selector); everything that talks to the API lives in sessions.ts.

export type CenterMode = 'welcome' | 'stream' | 'overview' | 'model';

/** What the crafter (right pane) is composing. */
export type Craft =
  | { kind: 'none' }
  | { kind: 'tool'; name: string }
  | { kind: 'resource'; uri: string }
  | { kind: 'template'; uriTemplate: string }
  | { kind: 'prompt'; name: string }
  | { kind: 'raw' }
  | { kind: 'settings' }
  | { kind: 'reply'; rid: string };

export function craftKey(craft: Craft): string {
  switch (craft.kind) {
    case 'tool':
      return `tool:${craft.name}`;
    case 'resource':
      return `resource:${craft.uri}`;
    case 'template':
      return `template:${craft.uriTemplate}`;
    case 'prompt':
      return `prompt:${craft.name}`;
    case 'reply':
      return `reply:${craft.rid}`;
    default:
      return craft.kind;
  }
}

/** 'tapping' is a tap: a real host's live session, watched, never driven. */
export type SessionStatus = 'idle' | 'connecting' | 'auth' | 'connected' | 'tapping' | 'error' | 'closed';

/** Taps are keyed in `sessions` under this prefix; they are not saved connections. */
export const tapKey = (tapId: string) => `tap:${tapId}`;
export const isTapKey = (id: string | undefined) => !!id?.startsWith('tap:');

export interface Lists {
  tools: Tool[];
  resources: Resource[];
  templates: ResourceTemplate[];
  prompts: Prompt[];
}
export const EMPTY_LISTS: Lists = { tools: [], resources: [], templates: [], prompts: [] };

export interface PendingServerRequest {
  rid: string;
  method: string;
  params: any;
  seq: number;
}

export interface Inflight {
  key: string;
  method: string;
  startedSeq: number;
  startedAt: number;
}

export interface SessionState {
  connectionId: string;
  sessionId?: string;
  status: SessionStatus;
  /** Set for taps: who is being watched. */
  tap?: TapInfo;
  info?: SessionInfo;
  error?: string;
  auth?: { authorizationUrl: string; flowId: string };
  events: SessionEvent[];
  lists: Lists;
  listErrors: Partial<Record<keyof Lists, string>>;
  pending: PendingServerRequest[];
  /** Frames with a higher seq are new: tinted until acknowledged. */
  seenSeq: number;
  /** Requests the crafter has in flight, by craft key. */
  inflight: Record<string, Inflight>;
  /** The last answer each craft got, by craft key. */
  results: Record<string, RpcResponse>;
  /** A send whose response frame should be selected once it lands. */
  selectWhenLanded?: { startedSeq: number; method: string };
  subscribed: string[];
}

export function emptySession(connectionId: string): SessionState {
  return {
    connectionId,
    status: 'idle',
    events: [],
    lists: EMPTY_LISTS,
    listErrors: {},
    pending: [],
    seenSeq: 0,
    inflight: {},
    results: {},
    subscribed: [],
  };
}

export interface Banner {
  kind: 'error' | 'info';
  text: string;
  link?: { label: string; href: string };
  action?: { label: string; run: () => void };
}

export interface Layout {
  rail: number;
  crafter: number;
  /** Share of the centre column the stream takes; the detail pane gets the rest. */
  stream: number;
  railOpen: boolean;
  crafterOpen: boolean;
}

export interface Store {
  loaded: boolean;
  /** What the runtime underneath can do; undefined until bootstrap picks one. */
  runtime?: { label: 'full' | 'lite'; stdio: boolean; taps: boolean; persistentSessions: boolean };
  connections: ConnectionConfig[];
  storeLocation?: string;
  projectDir?: string;
  /** Taps the API knows about (live and recently closed). */
  taps: TapInfo[];
  /** Absolute path of bin/tap.mjs, for host configs. */
  shimPath?: string;
  /** Where the shim mirrors to; only shown in snippets when it is not the default port. */
  apiUrl?: string;
  sessions: Record<string, SessionState>;
  activeId?: string;
  center: CenterMode;
  craft: Craft;
  selected?: { connectionId: string; seq: number };
  filter: string;
  /** Drafts by `${connectionId}|${craftKey}`. */
  drafts: Record<string, unknown>;
  theme: 'system' | 'light' | 'dark';
  layout: Layout;
  palette: boolean;
  /** The tree shown as a drawer, at widths where it is not a column. Not persisted. */
  railDrawer: boolean;
  jwt: { token: string } | null;
  importOpen: boolean;
  banner: Banner | null;
}

const PERSIST_KEY = 'mcptool.v2';

function readPersisted(): Partial<Pick<Store, 'theme' | 'layout' | 'drafts' | 'filter'>> {
  try {
    return JSON.parse(localStorage.getItem(PERSIST_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const persisted = readPersisted();

let state: Store = {
  loaded: false,
  connections: [],
  taps: [],
  sessions: {},
  center: 'welcome',
  craft: { kind: 'none' },
  filter: persisted.filter ?? '',
  drafts: persisted.drafts ?? {},
  theme: persisted.theme ?? 'system',
  layout: { rail: 248, crafter: 420, stream: 0.42, railOpen: true, crafterOpen: true, ...persisted.layout },
  palette: false,
  railDrawer: false,
  jwt: null,
  importOpen: false,
  banner: null,
};

const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | undefined;

export function getState(): Store {
  return state;
}

export function setState(patch: Partial<Store> | ((s: Store) => Partial<Store>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  for (const l of listeners) l();
  if ('theme' in next || 'layout' in next || 'drafts' in next || 'filter' in next) {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try {
        const { theme, layout, drafts, filter } = state;
        localStorage.setItem(PERSIST_KEY, JSON.stringify({ theme, layout, drafts, filter }));
      } catch {
        // Storage unavailable: keep the in-memory values.
      }
    }, 200);
  }
}

export function updateSession(connectionId: string, fn: (s: SessionState) => Partial<SessionState>) {
  setState((st) => {
    const current = st.sessions[connectionId] ?? emptySession(connectionId);
    return { sessions: { ...st.sessions, [connectionId]: { ...current, ...fn(current) } } };
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Read one slice of the store. Selectors must return existing references or primitives. */
export function useStore<T>(selector: (s: Store) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export const useActiveSession = () => useStore((s) => (s.activeId ? s.sessions[s.activeId] : undefined));
export const useActiveConnection = () => useStore((s) => s.connections.find((c) => c.id === s.activeId));

export function draftKey(connectionId: string, craft: Craft) {
  return `${connectionId}|${craftKey(craft)}`;
}
