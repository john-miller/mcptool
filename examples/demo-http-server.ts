// The demo server over Streamable HTTP, with CORS open so the lite (browser-only) mcptool
// can reach it from any origin. Run with: npx tsx examples/demo-http-server.ts [port]
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import express from 'express';
import { createDemoServer } from './demo-server.js';

const port = Number(process.argv[2] ?? process.env.PORT ?? 3838);
const app = express();
app.use(cors({ origin: true, exposedHeaders: ['Mcp-Session-Id'], allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Mcp-Protocol-Version', 'Last-Event-ID'] }));
app.use(express.json({ limit: '4mb' }));

// One transport per session, keyed by the session id the client echoes back.
const transports = new Map<string, StreamableHTTPServerTransport>();

app.all('/mcp', async (req, res) => {
  const sessionId = req.header('mcp-session-id');
  let transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    if (req.method !== 'POST') {
      res.status(400).json({ error: 'No session; POST initialize first' });
      return;
    }
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, transport!);
      },
    });
    transport.onclose = () => {
      if (transport?.sessionId) transports.delete(transport.sessionId);
    };
    await createDemoServer().connect(transport);
  }
  await transport.handleRequest(req, res, req.body);
});

app.listen(port, () => console.error(`demo MCP server over Streamable HTTP at http://localhost:${port}/mcp (CORS open)`));
