import { randomUUID } from 'node:crypto';
import type { NewSessionEvent, SessionEvent, TapEntry, TapInfo } from '../shared/types.js';

const MAX_BUFFERED_EVENTS = 5000;
const MAX_TAPS = 20;

/**
 * A tap is a stream of frames the shim mirrored from a real host's session with a
 * server. mcptool is not a party to it: nothing can be sent, only watched.
 */
export class Tap {
  readonly id = randomUUID();
  readonly startedAt = Date.now();
  live = true;
  closedReason?: string;
  private events: SessionEvent[] = [];
  private seq = 0;
  private listeners = new Set<(event: SessionEvent) => void>();

  constructor(
    readonly name: string,
    readonly command: string,
    readonly args: string[],
    readonly pid?: number,
  ) {}

  info(): TapInfo {
    return {
      id: this.id,
      name: this.name,
      command: this.command,
      args: this.args,
      pid: this.pid,
      startedAt: this.startedAt,
      live: this.live,
      closedReason: this.closedReason,
    };
  }

  ingest(entries: TapEntry[]) {
    for (const e of entries) {
      if (e.type === 'closed') {
        if (!this.live) continue;
        this.live = false;
        this.closedReason = e.reason;
        this.emit({ type: 'closed', reason: e.reason });
      } else if (e.type === 'stderr') {
        this.emit({ type: 'stderr', text: e.text });
      } else {
        this.emit({ type: 'message', direction: e.direction, message: e.message });
      }
    }
  }

  subscribe(listener: (event: SessionEvent) => void, since = 0): () => void {
    for (const event of this.events) if (event.seq > since) listener(event);
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: NewSessionEvent) {
    const full = { ...event, seq: ++this.seq, ts: Date.now() } as SessionEvent;
    this.events.push(full);
    if (this.events.length > MAX_BUFFERED_EVENTS) this.events.splice(0, this.events.length - MAX_BUFFERED_EVENTS);
    for (const listener of this.listeners) listener(full);
  }
}

/** The taps the API knows about, newest last, plus listeners for the list changing. */
export class TapRegistry {
  private taps = new Map<string, Tap>();
  private listeners = new Set<() => void>();

  list(): TapInfo[] {
    return [...this.taps.values()].map((t) => t.info());
  }

  get(id: string): Tap | undefined {
    return this.taps.get(id);
  }

  add(name: string, command: string, args: string[], pid?: number): Tap {
    // Closed taps are kept so their captures can still be read, but not forever.
    const closed = [...this.taps.values()].filter((t) => !t.live);
    while (this.taps.size >= MAX_TAPS && closed.length) this.taps.delete(closed.shift()!.id);
    const tap = new Tap(name, command, args, pid);
    this.taps.set(tap.id, tap);
    this.changed();
    return tap;
  }

  remove(id: string) {
    if (this.taps.delete(id)) this.changed();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed() {
    for (const l of this.listeners) l();
  }
}
