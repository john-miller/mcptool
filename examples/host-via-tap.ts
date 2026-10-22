// Plays a real host: talks to the demo server THROUGH the tap shim, the way Claude Desktop
// would when its config points at bin/tap.mjs. With mcptool running, the session shows up
// there as a live tap. Run with: npx tsx examples/host-via-tap.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const transport = new StdioClientTransport({
  command: 'node',
  args: [join(root, 'bin', 'tap.mjs'), '--name', 'demo via host', '--', 'npx', 'tsx', join(root, 'examples', 'demo-server.ts')],
  stderr: 'inherit',
});
const client = new Client({ name: 'example-host', version: '1.0.0' });
await client.connect(transport);
console.log('connected to', client.getServerVersion()?.name);

const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));
await client.listResources();
await client.listPrompts();

const sum = await client.callTool({ name: 'add', arguments: { a: 19, b: 23 } });
console.log('add →', JSON.stringify(sum.content));
const notes = await client.callTool({ name: 'search_notes', arguments: { query: 'postman' } });
console.log('search_notes →', JSON.stringify(notes.content));
await client.readResource({ uri: 'demo://readme' });

// Linger so the tap stays live long enough to look at, then hang up like a host would.
await new Promise((r) => setTimeout(r, Number(process.env.LINGER_MS ?? 20_000)));
await client.close();
console.log('closed');
