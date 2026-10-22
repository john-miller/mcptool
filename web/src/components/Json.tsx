import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { Icon } from './Icon';

/** Collapsible, syntax-highlighted JSON tree. */
export function JsonView({ value, openDepth = 2, copy = true }: { value: unknown; openDepth?: number; copy?: boolean }) {
  return (
    <div className="json-view">
      {copy && <CopyButton text={() => JSON.stringify(value, null, 2)} />}
      <JsonNode value={value} depth={0} openDepth={openDepth} last />
    </div>
  );
}

function JsonNode({
  name,
  value,
  depth,
  openDepth,
  last,
}: {
  name?: string;
  value: unknown;
  depth: number;
  openDepth: number;
  last: boolean;
}) {
  const [open, setOpen] = useState(depth < openDepth);
  const comma = last ? '' : ',';
  const label = name !== undefined && <span className="j-key">"{name}"</span>;
  const sep = name !== undefined && <span className="j-punct">: </span>;

  if (value === null || typeof value !== 'object') {
    return (
      <div className="j-line">
        {label}
        {sep}
        <Primitive value={value} />
        <span className="j-punct">{comma}</span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
  const [openCh, closeCh] = isArray ? ['[', ']'] : ['{', '}'];
  if (entries.length === 0) {
    return (
      <div className="j-line">
        {label}
        {sep}
        <span className="j-punct">
          {openCh}
          {closeCh}
          {comma}
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="j-line j-toggle" onClick={() => setOpen(!open)}>
        <span className="j-caret">
          <Icon name={open ? 'caret-down' : 'caret-right'} size={11} />
        </span>
        {label}
        {sep}
        <span className="j-punct">{openCh}</span>
        {!open && (
          <>
            <span className="j-summary">
              {isArray ? `${entries.length} item${entries.length === 1 ? '' : 's'}` : summarizeKeys(entries)}
            </span>
            <span className="j-punct">
              {closeCh}
              {comma}
            </span>
          </>
        )}
      </div>
      {open && (
        <>
          <div className="j-children">
            {entries.map(([k, v], i) => (
              <JsonNode
                key={k}
                name={isArray ? undefined : k}
                value={v}
                depth={depth + 1}
                openDepth={openDepth}
                last={i === entries.length - 1}
              />
            ))}
          </div>
          <div className="j-line">
            <span className="j-punct">
              {closeCh}
              {comma}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function summarizeKeys(entries: readonly (readonly [string, unknown])[]) {
  const keys = entries.slice(0, 4).map(([k]) => k);
  return keys.join(', ') + (entries.length > 4 ? `, … +${entries.length - 4}` : '');
}

function Primitive({ value }: { value: unknown }) {
  if (typeof value === 'string') return <span className="j-str">{JSON.stringify(value)}</span>;
  if (typeof value === 'number') return <span className="j-num">{value}</span>;
  if (typeof value === 'boolean') return <span className="j-bool">{String(value)}</span>;
  if (value === undefined) return <span className="j-null">undefined</span>;
  return <span className="j-null">null</span>;
}

export function CopyButton({ text, label = 'Copy' }: { text: () => string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-xs copy-btn"
      onClick={() => {
        navigator.clipboard.writeText(text()).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

/** Textarea that grows with its content, starting at one line. */
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const { minRows = 1, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={minRows} {...rest} />;
}

/**
 * Text editor bound to a JSON value. Invalid JSON is kept as text and reported,
 * the value only changes when the text parses.
 */
export function JsonEditor({
  value,
  onChange,
  minRows = 6,
  placeholder,
  allowEmpty = true,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  minRows?: number;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const format = (v: unknown) => (v === undefined ? '' : JSON.stringify(v, null, 2));
  const [text, setText] = useState(() => format(value));
  const [error, setError] = useState<string | null>(null);

  // Pick up changes made elsewhere (e.g. the form view) without clobbering in-progress edits.
  useEffect(() => {
    let current: unknown;
    try {
      current = text.trim() ? JSON.parse(text) : undefined;
    } catch {
      current = Symbol('invalid');
    }
    if (JSON.stringify(current) !== JSON.stringify(value)) {
      setText(format(value));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="json-editor">
      <AutoTextarea
        className={`input mono ${error ? 'input-error' : ''}`}
        spellCheck={false}
        minRows={minRows}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (!next.trim()) {
            setError(allowEmpty ? null : 'Required');
            if (allowEmpty) onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(next));
            setError(null);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
