import type { ReactNode } from 'react';

// One icon set, one stroke weight. 16-unit grid, drawn with currentColor.

export type IconName =
  | 'play'
  | 'stop'
  | 'restart'
  | 'arrow-right'
  | 'arrow-left'
  | 'swap'
  | 'alert'
  | 'dot'
  | 'caret-right'
  | 'caret-down'
  | 'close'
  | 'search'
  | 'plus'
  | 'panel-left'
  | 'panel-right'
  | 'sun'
  | 'moon'
  | 'auto'
  | 'import'
  | 'key'
  | 'tap';

const PATHS: Record<IconName, ReactNode> = {
  play: <path d="M5 3.5v9l8-4.5z" fill="currentColor" stroke="none" />,
  stop: <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" stroke="none" />,
  restart: (
    <>
      <path d="M13 8a5 5 0 1 1-1.5-3.6" />
      <path d="M13.2 2.8v3.2H10" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M3 8h10" />
      <path d="M9 4l4 4-4 4" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M13 8H3" />
      <path d="M7 4L3 8l4 4" />
    </>
  ),
  swap: (
    <>
      <path d="M3 5.5h9.5L10 3" />
      <path d="M13 10.5H3.5L6 13" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.5l6 10.5H2z" />
      <path d="M8 6.5v3" />
      <path d="M8 11.8h.01" />
    </>
  ),
  dot: <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />,
  'caret-right': <path d="M6 4l4 4-4 4" />,
  'caret-down': <path d="M4 6l4 4 4-4" />,
  close: (
    <>
      <path d="M4 4l8 8" />
      <path d="M12 4l-8 8" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10l3.5 3.5" />
    </>
  ),
  plus: (
    <>
      <path d="M8 3v10" />
      <path d="M3 8h10" />
    </>
  ),
  'panel-left': (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M6.5 3v10" />
    </>
  ),
  'panel-right': (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M9.5 3v10" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
    </>
  ),
  moon: <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />,
  auto: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
    </>
  ),
  import: (
    <>
      <path d="M8 2.5v8" />
      <path d="M4.5 7l3.5 3.5L11.5 7" />
      <path d="M3 13h10" />
    </>
  ),
  key: (
    <>
      <circle cx="5.5" cy="8" r="3" />
      <path d="M8.5 8h5l-1.5 1.5M11.5 8v2" />
    </>
  ),
  // A tap on a line: the wire runs through, a branch listens.
  tap: (
    <>
      <path d="M2 6h12" />
      <path d="M8 6v6" />
      <circle cx="8" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <path d="M5.5 12h5" />
    </>
  ),
};

export function Icon({ name, size = 14, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`icon ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
