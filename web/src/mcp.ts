// Loose MCP shapes (servers in the wild aren't always conformant) and helpers.

export type JSONSchema = Record<string, any>;

export interface Tool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface Resource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface Prompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: PromptArgument[];
}

export type ContentBlock = { type: string; [key: string]: any };

export interface ResourceContents {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export const displayName = (item: { name: string; title?: string; annotations?: { title?: string } }) =>
  item.title ?? item.annotations?.title ?? item.name;

// ---- URI templates (RFC 6570, the subset MCP servers use in practice) ----

const TEMPLATE_EXPR = /\{([+#./;?&]?)([^}]+)\}/g;

export function templateVariables(template: string): string[] {
  const names = new Set<string>();
  for (const [, , list] of template.matchAll(TEMPLATE_EXPR)) {
    for (const v of list.split(',')) names.add(v.replace(/[:*].*$/, '').trim());
  }
  return [...names];
}

export function expandTemplate(template: string, values: Record<string, string>): string {
  return template.replace(TEMPLATE_EXPR, (_, op: string, list: string) => {
    const names = list.split(',').map((v) => v.replace(/[:*].*$/, '').trim());
    const defined = names.filter((n) => values[n]);
    if (!defined.length) return '';
    const enc = encodeURIComponent;
    switch (op) {
      case '+':
        return defined.map((n) => encodeURI(values[n])).join(',');
      case '#':
        return '#' + defined.map((n) => encodeURI(values[n])).join(',');
      case '?':
      case '&':
        return op + defined.map((n) => `${n}=${enc(values[n])}`).join('&');
      case ';':
        return defined.map((n) => `;${n}=${enc(values[n])}`).join('');
      case '/':
      case '.':
        return defined.map((n) => op + enc(values[n])).join('');
      default:
        return defined.map((n) => enc(values[n])).join(',');
    }
  });
}

// ---- Command-line argument text <-> array ----

export function parseArgs(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let started = false;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) out.push(cur);
      cur = '';
      started = false;
    } else {
      cur += ch;
      started = true;
    }
  }
  if (started) out.push(cur);
  return out;
}

export function formatArgs(args: string[] = []): string {
  return args
    .map((a) => {
      if (a !== '' && !/[\s"']/.test(a)) return a;
      return a.includes('"') ? `'${a}'` : `"${a}"`;
    })
    .join(' ');
}

// ---- How tools look to a model ----

export type LlmFormat = 'mcp' | 'anthropic' | 'openai';

export function toolsForLlm(tools: Tool[], format: LlmFormat): unknown[] {
  switch (format) {
    case 'mcp':
      return tools;
    case 'anthropic':
      return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    case 'openai':
      return tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }));
  }
}

/** Rough token estimate (~4 characters per token for English/JSON). */
export const estimateTokens = (value: unknown) => Math.ceil(JSON.stringify(value ?? '').length / 4);

export interface LintIssue {
  tool: string;
  level: 'warn' | 'info';
  message: string;
}

export function lintTools(tools: Tool[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const seen = new Set<string>();
  for (const t of tools) {
    const add = (level: LintIssue['level'], message: string) => issues.push({ tool: t.name, level, message });
    if (seen.has(t.name)) add('warn', 'Duplicate tool name');
    seen.add(t.name);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(t.name))
      add('warn', 'Name has characters or length (max 64) that some LLM APIs reject');
    if (!t.description?.trim()) add('warn', 'No description: the model has to guess what this tool does');
    else if (t.description.trim().length < 20) add('info', 'Very short description');
    if (t.inputSchema?.type !== 'object') add('warn', 'inputSchema should have type "object"');
    for (const [prop, schema] of Object.entries<JSONSchema>(t.inputSchema?.properties ?? {})) {
      if (!schema?.description && !schema?.$ref) add('info', `Parameter "${prop}" has no description`);
    }
  }
  return issues;
}

export const KNOWN_METHODS = [
  'ping',
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/templates/list',
  'resources/read',
  'resources/subscribe',
  'resources/unsubscribe',
  'prompts/list',
  'prompts/get',
  'completion/complete',
  'logging/setLevel',
];

export const LOG_LEVELS = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'];
