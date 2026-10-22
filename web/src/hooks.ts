import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { buildFrames, type Frame } from './frames';
import { useStore } from './store';

const NO_FRAMES: Frame[] = [];

/** The active (or given) session's events as analyzer frames, memoised on the events array. */
export function useFrames(connectionId: string | undefined): Frame[] {
  const events = useStore((s) => (connectionId ? s.sessions[connectionId]?.events : undefined));
  return useMemo(() => (events ? buildFrames(events) : NO_FRAMES), [events]);
}

/** Drag-to-resize for a pane edge. Returns the pointerdown handler. */
export function useResizer(axis: 'x' | 'y', current: number, onChange: (next: number) => void, opts: { min: number; max: () => number; invert?: boolean }) {
  return (e: ReactPointerEvent) => {
    e.preventDefault();
    const start = axis === 'x' ? e.clientX : e.clientY;
    const startValue = current;
    const move = (ev: PointerEvent) => {
      const delta = (axis === 'x' ? ev.clientX : ev.clientY) - start;
      const next = startValue + (opts.invert ? -delta : delta);
      onChange(Math.min(opts.max(), Math.max(opts.min, next)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
}

/** True while the OS prefers dark and the theme is 'system'. */
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useStore((s) => s.theme);
  const [osDark, setOsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setOsDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return theme === 'system' ? (osDark ? 'dark' : 'light') : theme;
}

/** Key legends in the platform's own words: the bindings accept Ctrl and ⌘ alike. */
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const KEYS = {
  mod: isMac ? '⌘' : 'Ctrl',
  palette: isMac ? '⌘ K' : 'Ctrl K',
  send: isMac ? '⌘ ⏎' : 'Ctrl Enter',
  enter: isMac ? '⏎' : 'Enter',
};

/** One noun, counted. */
export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`;

/** Below this width the rail is a drawer, not a column, so the stream keeps room to read. */
export const NARROW = 1100;

export function useViewportWidth(): number {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

/** A ticking "now" for elapsed-time readouts, only while `active`. */
export function useNow(active: boolean, everyMs = 250): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs]);
  return now;
}

/** Latest value in a ref, for callbacks that must not go stale. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
