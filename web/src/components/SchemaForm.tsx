import { useEffect, useState } from 'react';
import type { JSONSchema } from '../mcp';
import { Icon } from './Icon';
import { AutoTextarea, JsonEditor } from './Json';

// Builds an input form from a JSON Schema, the same schema an LLM is given to
// produce tool arguments. Anything too exotic falls back to a JSON editor.

type Kind = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'enum' | 'const' | 'json';

function resolvePointer(root: JSONSchema, ref: string): JSONSchema | undefined {
  if (!ref.startsWith('#')) return undefined;
  return ref
    .slice(1)
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p).replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<any>((node, key) => node?.[key], root);
}

/** Resolves $ref / single allOf / nullable unions down to one concrete schema. */
export function unwrap(schema: JSONSchema | undefined, root: JSONSchema): JSONSchema {
  let s: JSONSchema = schema ?? {};
  for (let i = 0; i < 16; i++) {
    if (s.$ref) {
      const target = resolvePointer(root, s.$ref);
      if (!target) return s;
      const { $ref: _, ...rest } = s;
      s = { ...target, ...rest };
    } else if (Array.isArray(s.allOf) && s.allOf.length === 1) {
      const { allOf, ...rest } = s;
      s = { ...allOf[0], ...rest };
    } else if (!s.type && Array.isArray(s.anyOf ?? s.oneOf)) {
      const union: JSONSchema[] = s.anyOf ?? s.oneOf;
      const nonNull = union.filter((u) => u?.type !== 'null');
      if (nonNull.length !== 1) return s;
      const { anyOf: _a, oneOf: _o, ...rest } = s;
      s = { ...nonNull[0], ...rest };
    } else {
      break;
    }
  }
  if (Array.isArray(s.type)) {
    const nonNull = s.type.filter((t: string) => t !== 'null');
    if (nonNull.length === 1) s = { ...s, type: nonNull[0] };
  }
  return s;
}

export function kindOf(s: JSONSchema): Kind {
  if (s.const !== undefined) return 'const';
  if (Array.isArray(s.enum)) return 'enum';
  const type = s.type ?? (s.properties ? 'object' : undefined);
  if (['string', 'number', 'integer', 'boolean', 'array', 'object'].includes(type)) return type;
  return 'json';
}

export function typeLabel(s: JSONSchema, root: JSONSchema): string {
  const kind = kindOf(s);
  if (kind === 'enum') return 'enum';
  if (kind === 'array') {
    const item = unwrap(s.items, root);
    return `${kindOf(item) === 'json' ? 'any' : typeLabel(item, root)}[]`;
  }
  if (kind === 'json') return Array.isArray(s.type) ? s.type.join(' | ') : s.anyOf || s.oneOf ? 'union' : 'any';
  return s.format ? `${kind} · ${s.format}` : kind;
}

export function constraints(s: JSONSchema): string[] {
  const out: string[] = [];
  if (s.minimum !== undefined) out.push(`≥ ${s.minimum}`);
  if (s.exclusiveMinimum !== undefined) out.push(`> ${s.exclusiveMinimum}`);
  if (s.maximum !== undefined) out.push(`≤ ${s.maximum}`);
  if (s.exclusiveMaximum !== undefined) out.push(`< ${s.exclusiveMaximum}`);
  if (s.minLength !== undefined) out.push(`min length ${s.minLength}`);
  if (s.maxLength !== undefined) out.push(`max length ${s.maxLength}`);
  if (s.pattern) out.push(`pattern /${s.pattern}/`);
  if (s.minItems !== undefined) out.push(`min ${s.minItems} items`);
  if (s.maxItems !== undefined) out.push(`max ${s.maxItems} items`);
  if (s.default !== undefined) out.push(`default ${JSON.stringify(s.default)}`);
  return out;
}

export function SchemaForm({
  schema,
  value,
  onChange,
}: {
  schema: JSONSchema | undefined;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const root = schema ?? {};
  const s = unwrap(root, root);
  if (kindOf(s) === 'object' && s.properties) {
    if (Object.keys(s.properties).length === 0) return <div className="muted">Takes no arguments.</div>;
    return <ObjectFields schema={s} root={root} value={value} onChange={onChange} />;
  }
  if (kindOf(s) === 'object' && !s.properties && !s.additionalProperties) {
    return <div className="muted">Takes no arguments.</div>;
  }
  return <JsonEditor value={value} onChange={onChange} />;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function ObjectFields({
  schema,
  root,
  value,
  onChange,
}: {
  schema: JSONSchema;
  root: JSONSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const obj = asObject(value);
  const required = new Set<string>(schema.required ?? []);
  const set = (key: string, v: unknown) => {
    const next = { ...obj };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  return (
    <div className="fields">
      {Object.entries<JSONSchema>(schema.properties ?? {}).map(([key, propSchema]) => (
        <Field
          key={key}
          name={key}
          schema={propSchema}
          root={root}
          required={required.has(key)}
          value={obj[key]}
          onChange={(v) => set(key, v)}
        />
      ))}
    </div>
  );
}

function Field({
  name,
  schema,
  root,
  required,
  value,
  onChange,
}: {
  name: string;
  schema: JSONSchema;
  root: JSONSchema;
  required: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const s = unwrap(schema, root);
  const notes = constraints(s);
  return (
    <div className="field">
      <div className="field-head">
        <span className="field-name mono">{name}</span>
        {required && <span className="field-req" title="Required">required</span>}
        <span className="field-type mono">{typeLabel(s, root)}</span>
        {s.title && s.title !== name && <span className="field-title">{s.title}</span>}
        {value !== undefined && (
          <button className="btn btn-ghost btn-xs field-clear" title="Remove this argument" onClick={() => onChange(undefined)}>
            clear
          </button>
        )}
      </div>
      {s.description && <div className="field-desc">{s.description}</div>}
      <Control schema={s} root={root} required={required} value={value} onChange={onChange} />
      {notes.length > 0 && <div className="field-notes">{notes.join(' · ')}</div>}
    </div>
  );
}

export function Control({
  schema: s,
  root,
  required,
  value,
  onChange,
}: {
  schema: JSONSchema;
  root: JSONSchema;
  required: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const placeholder =
    s.default !== undefined
      ? `default: ${typeof s.default === 'string' ? s.default : JSON.stringify(s.default)}`
      : Array.isArray(s.examples) && s.examples.length
        ? `e.g. ${s.examples[0]}`
        : s.format;

  switch (kindOf(s)) {
    case 'const':
      return (
        <div className="const-value mono">
          {JSON.stringify(s.const)}
          {value === undefined && (
            <button className="btn btn-ghost btn-xs" onClick={() => onChange(s.const)}>
              set
            </button>
          )}
        </div>
      );
    case 'enum': {
      const options: unknown[] = s.enum;
      const index = options.findIndex((o) => JSON.stringify(o) === JSON.stringify(value));
      return (
        <select
          className="input"
          value={index}
          onChange={(e) => {
            const i = Number(e.target.value);
            onChange(i < 0 ? undefined : options[i]);
          }}
        >
          <option value={-1}>{required ? '— choose —' : '— not set —'}</option>
          {options.map((o, i) => (
            <option key={i} value={i}>
              {typeof o === 'string' ? o : JSON.stringify(o)}
            </option>
          ))}
        </select>
      );
    }
    case 'string':
      return (
        <AutoTextarea
          className="input"
          value={typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value)}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' && !required ? undefined : e.target.value)}
        />
      );
    case 'number':
    case 'integer':
      return <NumberInput schema={s} value={value} onChange={onChange} placeholder={placeholder} />;
    case 'boolean':
      return (
        <div className="segmented">
          {[true, false].map((b) => (
            <button
              key={String(b)}
              className={value === b ? 'is-active' : ''}
              onClick={() => onChange(value === b ? undefined : b)}
            >
              {String(b)}
            </button>
          ))}
          {value === undefined && <span className="muted segmented-note">not set</span>}
        </div>
      );
    case 'array':
      return <ArrayControl schema={s} root={root} value={value} onChange={onChange} />;
    case 'object':
      if (s.properties && Object.keys(s.properties).length) {
        return (
          <div className="nested">
            <ObjectFields schema={s} root={root} value={value} onChange={(v) => onChange(isEmpty(v) ? undefined : v)} />
          </div>
        );
      }
      return <JsonEditor value={value} onChange={onChange} minRows={2} placeholder="{ }" />;
    default:
      return <JsonEditor value={value} onChange={onChange} minRows={2} placeholder="JSON value" />;
  }
}

const isEmpty = (v: unknown) => v && typeof v === 'object' && Object.keys(v).length === 0;

function NumberInput({
  schema,
  value,
  onChange,
  placeholder,
}: {
  schema: JSONSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    if (text.trim() === '' ? value !== undefined : Number(text) !== value) {
      setText(value === undefined ? '' : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const invalid = text.trim() !== '' && (Number.isNaN(Number(text)) || (schema.type === 'integer' && !Number.isInteger(Number(text))));
  return (
    <>
      <input
        className={`input mono ${invalid ? 'input-error' : ''}`}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (t.trim() === '') onChange(undefined);
          else if (!Number.isNaN(Number(t))) onChange(Number(t));
        }}
      />
      {invalid && <div className="field-error">{schema.type === 'integer' ? 'Must be an integer' : 'Not a number'}</div>}
    </>
  );
}

function ArrayControl({
  schema,
  root,
  value,
  onChange,
}: {
  schema: JSONSchema;
  root: JSONSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = unwrap(schema.items, root);
  const itemKind = kindOf(itemSchema);

  // Arrays of enum values are shown as a checkbox set.
  if (itemKind === 'enum') {
    const options: unknown[] = itemSchema.enum;
    const has = (o: unknown) => items.some((i) => JSON.stringify(i) === JSON.stringify(o));
    return (
      <div className="checks">
        {options.map((o, i) => (
          <label key={i} className="check">
            <input
              type="checkbox"
              checked={has(o)}
              onChange={(e) => {
                const next = e.target.checked
                  ? options.filter((x) => has(x) || x === o)
                  : items.filter((x) => JSON.stringify(x) !== JSON.stringify(o));
                onChange(next);
              }}
            />
            <span className="mono">{typeof o === 'string' ? o : JSON.stringify(o)}</span>
          </label>
        ))}
      </div>
    );
  }

  if (itemKind === 'json') return <JsonEditor value={value} onChange={onChange} minRows={2} placeholder="[ ]" />;

  const setItem = (i: number, v: unknown) => {
    const next = [...items];
    next[i] = v;
    onChange(next);
  };
  return (
    <div className="array">
      {items.map((item, i) => (
        <div key={i} className="array-item">
          <span className="array-index mono">{i}</span>
          <div className="array-control">
            <Control schema={itemSchema} root={root} required value={item} onChange={(v) => setItem(i, v)} />
          </div>
          <button
            className="btn btn-ghost btn-xs"
            title="Remove item"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={() => onChange([...items, defaultFor(itemSchema)])}>
        + Add item
      </button>
    </div>
  );
}

function defaultFor(s: JSONSchema): unknown {
  if (s.default !== undefined) return s.default;
  switch (kindOf(s)) {
    case 'object':
      return {};
    case 'array':
      return [];
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    default:
      return undefined;
  }
}
