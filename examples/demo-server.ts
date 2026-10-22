// A demo MCP server that exercises most protocol features, for trying out mcptool.
// Over stdio: command `npx`, args `tsx examples/demo-server.ts`. Over HTTP: see demo-http-server.ts.
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

export function createDemoServer(): McpServer {
const server = new McpServer(
  { name: 'mcptool-demo', version: '1.0.0' },
  {
    capabilities: { logging: {} },
    instructions: 'Demo server for mcptool. Use `add` for arithmetic and `search_notes` to look up notes.',
  },
);

const notes = new Map([
  ['1', { title: 'Groceries', body: 'Milk, eggs, coffee' }],
  ['2', { title: 'Ideas', body: 'Build a Postman for MCP' }],
]);

server.registerTool(
  'add',
  {
    title: 'Add numbers',
    description: 'Adds two numbers and returns the sum.',
    inputSchema: { a: z.number().describe('First addend'), b: z.number().describe('Second addend') },
    outputSchema: { sum: z.number() },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ a, b }) => ({
    content: [{ type: 'text', text: String(a + b) }],
    structuredContent: { sum: a + b },
  }),
);

server.registerTool(
  'search_notes',
  {
    description: 'Searches notes by keyword. Supports filters and paging.',
    inputSchema: {
      query: z.string().describe('Text to search for'),
      fields: z.array(z.enum(['title', 'body'])).default(['title', 'body']).describe('Fields to search'),
      limit: z.number().int().min(1).max(50).optional().describe('Maximum results'),
      caseSensitive: z.boolean().optional(),
      filter: z
        .object({ createdAfter: z.string().describe('ISO date'), tags: z.array(z.string()).optional() })
        .optional()
        .describe('Advanced filter'),
    },
  },
  async ({ query, fields, limit, caseSensitive }) => {
    const norm = (s: string) => (caseSensitive ? s : s.toLowerCase());
    const hits = [...notes.entries()]
      .filter(([, n]) => fields.some((f) => norm(n[f]).includes(norm(query))))
      .slice(0, limit ?? 50);
    return {
      content: hits.length
        ? hits.map(([id, n]) => ({
            type: 'resource_link' as const,
            uri: `notes://${id}`,
            name: n.title,
            mimeType: 'text/plain',
          }))
        : [{ type: 'text', text: 'No matching notes.' }],
    };
  },
);

server.registerTool(
  'slow_task',
  {
    description: 'Runs for a few seconds, reporting progress and log messages along the way.',
    inputSchema: { steps: z.number().int().min(1).max(20).default(5) },
  },
  async ({ steps }, extra) => {
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const token = extra._meta?.progressToken;
      if (token !== undefined) {
        await extra.sendNotification({
          method: 'notifications/progress',
          params: { progressToken: token, progress: i, total: steps, message: `Step ${i}/${steps}` },
        });
      }
      await server.sendLoggingMessage({ level: 'info', logger: 'slow_task', data: `Finished step ${i}` });
    }
    return { content: [{ type: 'text', text: `Completed ${steps} steps` }] };
  },
);

server.registerTool(
  'create_note',
  {
    description: 'Creates a note. Asks the user for confirmation details via elicitation.',
    inputSchema: { title: z.string() },
    annotations: { destructiveHint: false },
  },
  async ({ title }) => {
    const answer = await server.server.elicitInput({
      mode: 'form',
      message: `Creating note "${title}". Fill in the details:`,
      requestedSchema: {
        type: 'object',
        properties: {
          body: { type: 'string', title: 'Body', description: 'Note contents' },
          priority: { type: 'string', enum: ['low', 'normal', 'high'], default: 'normal' },
          pinned: { type: 'boolean', title: 'Pin note' },
        },
        required: ['body'],
      },
    });
    if (answer.action !== 'accept') return { content: [{ type: 'text', text: `User chose to ${answer.action}.` }] };
    const id = String(notes.size + 1);
    notes.set(id, { title, body: String(answer.content?.body ?? '') });
    server.sendResourceListChanged();
    return { content: [{ type: 'text', text: `Created note ${id}: ${JSON.stringify(answer.content)}` }] };
  },
);

server.registerTool(
  'summarize_with_llm',
  {
    description: "Asks the client's LLM (via sampling) to summarize some text.",
    inputSchema: { text: z.string() },
  },
  async ({ text }) => {
    const result = await server.server.createMessage({
      messages: [{ role: 'user', content: { type: 'text', text: `Summarize in one sentence:\n\n${text}` } }],
      maxTokens: 200,
    });
    const reply = result.content.type === 'text' ? result.content.text : JSON.stringify(result.content);
    return { content: [{ type: 'text', text: `Summary from ${result.model}: ${reply}` }] };
  },
);

server.registerTool(
  'fail',
  { description: 'Always returns a tool error, to test error rendering.' },
  async () => ({ isError: true, content: [{ type: 'text', text: 'Something went wrong (on purpose).' }] }),
);

server.registerTool(
  'tiny_image',
  { description: 'Returns a small PNG image.' },
  async () => ({
    content: [
      {
        type: 'image',
        mimeType: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIwCAAB7AAHTSNWfAAAAAElFTkSuQmCC',
      },
    ],
  }),
);

server.registerResource(
  'readme',
  'demo://readme',
  { title: 'Readme', description: 'About this demo server', mimeType: 'text/markdown' },
  async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'text/markdown', text: '# Demo\nThis server exists to test mcptool.' }],
  }),
);

server.registerResource(
  'note',
  new ResourceTemplate('notes://{id}', {
    list: async () => ({
      resources: [...notes.entries()].map(([id, n]) => ({ uri: `notes://${id}`, name: n.title, mimeType: 'text/plain' })),
    }),
    complete: { id: (value) => [...notes.keys()].filter((id) => id.startsWith(value)) },
  }),
  { description: 'A note by id', mimeType: 'text/plain' },
  async (uri, { id }) => {
    const note = notes.get(String(id));
    if (!note) throw new Error(`No note ${id}`);
    return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `${note.title}\n\n${note.body}` }] };
  },
);

server.registerPrompt(
  'review_code',
  {
    title: 'Review code',
    description: 'Asks the model to review a code snippet.',
    argsSchema: {
      code: z.string().describe('The code to review'),
      language: z.string().optional().describe('Programming language'),
    },
  },
  ({ code, language }) => ({
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: `Please review this ${language ?? ''} code:\n\n\`\`\`\n${code}\n\`\`\`` },
      },
    ],
  }),
);

return server;
}

// Run directly: serve over stdio.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await createDemoServer().connect(new StdioServerTransport());
  console.error('mcptool demo server running on stdio');
}
