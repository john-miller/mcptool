# mcptool

A protocol analyzer for MCP. Connect to any Model Context Protocol server, watch every JSON-RPC frame
land in the stream, and play the model's part by hand: call its tools, read its resources, get its
prompts, and answer the server's own questions (sampling, elicitation) the way a host and its model
would.

**Try the lite version in your browser:** https://john-miller.github.io/mcptool/ (HTTP servers with CORS only;
the full version below does everything).

## Three ways to run it

One codebase, three doors. The UI picks its runtime at startup.

| | Full (CLI) | Full (desktop) | Lite (browser-only) |
|---|---|---|---|
| How | `npm start` → http://localhost:3737 | `npm run electron:build` → installer in `release/` | `npm run build:lite` → static files in `dist-lite/` (GitHub Pages) |
| stdio servers | yes | yes | no (a page can't spawn processes) |
| HTTP / SSE servers | yes | yes | only ones that allow cross-origin requests from the page's origin |
| Taps | yes | yes | no |
| OAuth | yes, tokens in `~/.mcptool/oauth/` | yes | yes, by redirect; tokens in the browser |
| Sessions survive a reload | yes | yes | no |

```sh
npm install
npm run dev            # API on :3737, UI on http://localhost:5173 (or the next free port Vite prints)
npm run build && npm start
npm run electron:dev   # the desktop app from this checkout
npm run build:lite && npm run preview:lite   # the lite build at http://localhost:4173
```

On first launch the full runtime creates a connection to the bundled demo server (`examples/demo-server.ts`).
It exercises tools, structured output, progress, logging, elicitation, sampling, resources, templates with
completion, and prompts. For lite, `npx tsx examples/demo-http-server.ts` serves the same server over
Streamable HTTP with CORS open at `http://localhost:3838/mcp`.

The desktop app is the same Express server inside Electron's main process; it tries port 3737 and falls
back to a free one (the tap snippet then carries `MCPTOOL_URL`). If you launch it from a shell that
inherits `ELECTRON_RUN_AS_NODE=1` (VS Code's extension host does), unset that first: with it set,
`electron.exe` is plain Node and the app cannot start.

## The workbench

```
┌ capture bar: server chips with LEDs · display filter · Connect / Restart · ⌘K · theme ┐
│ rail        │ stream: one row per frame (#, time, →/←, kind, method, id, Δ, info)   │ crafter        │
│ server      │ ───────────────────────────────────────────────────────────────────── │ the tool's     │
│ Overview    │ detail: the selected frame dissected — Pair (request ‖ response),     │ reference and  │
│ Model view  │         Dissected (tree), Raw (JSON)                                   │ parameter-table│
│ Tools …     │                                                                        │ form · Send    │
└ status bar: frames · avg latency · errors · stderr · awaiting replies ─────────────────────────────────┘
```

- **Several servers at once.** Each saved connection is a chip in the capture bar; connect as many as
  you like and switch between their streams. Double-click a chip to connect or restart it.
- **Reaching a tool.** Connecting lands on the first tool with its parameter table ready; pick others
  in the rail tree or with the palette (`Ctrl+K`). `Ctrl+Enter` sends from anywhere.
- **Following traffic.** Sending a request lands it and its response as a bracketed pair, with the
  response auto-selected and dissected. Response rows name what they answer (`add → 1 block · 42`).
  Frames that arrive while you look elsewhere hold an amber tint until acknowledged. The display filter
  takes free text and tokens: `method:tools/call`, `dir:in`, `kind:req,res`, `id:3`, `error`.
- **Server questions inline.** When the server asks for a sampling completion or user input, the frame
  is flagged "awaiting your reply" and the crafter switches to the reply form. No modal.
- **Keyboard.** `/` focuses the filter, `j`/`k` walk frames, `Enter` jumps to the pair, `Space` marks
  the stream seen, `Esc` clears.
- **Survives reloads and restarts.** Reloading the page re-attaches to live sessions with the whole
  stream intact; drafts persist per tool. If the mcptool server itself restarts, the UI tells you and
  offers to reconnect.
- **Model view.** The tool definitions exactly as a model receives them (Anthropic, OpenAI or raw MCP
  format), estimated context cost per tool, and model-readiness checks (missing descriptions, invalid
  names, …).
- **Connections.** stdio (command, args, cwd, env), Streamable HTTP and legacy SSE with custom headers.
  OAuth sign-in is handled automatically (PKCE, dynamic client registration, token refresh); tokens live
  in `~/.mcptool/oauth/`. Import connections from a Claude Desktop / Claude Code / Cursor (`mcpServers`)
  or VS Code (`servers`) config. Saved to `~/.mcptool/connections.json` (override with
  `MCPTOOL_DATA_DIR`).
- **JWT decoder.** Decodes tokens in the browser (header, claims with explanations, expiry), including a
  connection's stored OAuth access token.

Light and dark follow the OS, with a manual override in the capture bar. Type is Atkinson Hyperlegible
Next and Mono, self-hosted, chosen for 0/O and 1/l/I legibility when reading schemas and JSON.

## Taps: watch a real host use your server

Connecting from mcptool shows you *your* session. A **tap** shows you the host's: point Claude Desktop,
Cursor or Claude Code at the shim instead of the server, and every frame they exchange lands in the same
stream, with pairing, filter and dissection, the moment the host starts it.

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["C:\\path\\to\\mcptool\\bin\\tap.mjs", "--name", "my-server", "--", "npx", "-y", "my-mcp-server"]
    }
  }
}
```

The shim (`bin/tap.mjs`, also installed as `mcptool-tap`) spawns the real server, passes every byte through
untouched in both directions, and mirrors each JSON-RPC line plus stderr to a running mcptool
(`MCPTOOL_URL`, default `http://127.0.0.1:3737`). If mcptool isn't running, the mirror is dropped and the
host never notices. A tap is read-only (the host drives it); its tool tree is read off the traffic, and
**Open as a connection** saves the same server so you can drive it yourself too. The start page shows the
snippet with the shim's absolute path. `examples/host-via-tap.ts` plays a host through the shim for trying it.

## Security

The API can start arbitrary local processes and holds OAuth tokens, so it binds to `127.0.0.1` only and
rejects requests whose `Host` or `Origin` is not local (this blocks DNS-rebinding and cross-site
attacks). Don't expose it on a network.

## Layout

```
server/     Express API: one MCP SDK client per session, traffic recording, server-request relay (SSE to the UI), OAuth
shared/     Types shared by server and UI
web/        React UI (Vite): store.ts (state), sessions.ts (API + event streams), frames.ts (stream rows), components/
examples/   Demo MCP server
PRODUCT.md  Product context; .impeccable/ holds the design brief
```
