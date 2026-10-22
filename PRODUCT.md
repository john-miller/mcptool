# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (a local web app: Node API on 127.0.0.1 plus a React UI, opened in the developer's own browser
beside their editor)

## Users

**The MCP server developer.** Someone building or debugging a Model Context Protocol server, who
needs to see exactly what a model is given (tool names, descriptions, schemas, instructions) and to
exercise the server by hand: call a tool with chosen arguments, read a resource, get a prompt, answer
the server's own requests (sampling, elicitation) the way a host and its model would. They know
Postman, browser devtools and their IDE's debugger by heart. Sessions are long and alternate with
editing server code, so "restart and try again" is the most frequent gesture.

*Assumption (from the brief and the one real user so far):* a single developer per install, working on
their own servers plus third-party ones they integrate; no team features, no sharing.

## Product Purpose

mcptool is "Postman for MCP": connect to any MCP server over stdio, Streamable HTTP or SSE, see what it
offers the way an LLM host sees it, drive it manually, and watch the JSON-RPC traffic underneath.
Success is a developer finding and fixing a problem in their server (a missing description, a schema
the model would misuse, a tool error, an auth failure) in one sitting, without writing a throwaway
client.

## Positioning

- **Play the LLM's part.** Tools are shown as a model receives them; the person answers sampling and
  elicitation requests themselves. No other inspector frames the server from the model's seat.
- **Every message visible.** The full JSON-RPC conversation in both directions, plus the server's
  stderr, with latency and pairing.
- **Model-readiness checks.** Lint of tool definitions (missing descriptions, bad names, context
  cost) that the model would otherwise suffer silently.
- Alternatives the user knows: the official MCP Inspector (functional, plain), Postman's MCP support,
  ad-hoc scripts.

## Operating Context

- Runs locally; the API spawns processes and holds OAuth tokens, so it binds to localhost only and
  rejects non-local Host/Origin.
- Typical session: connect (possibly through an OAuth sign-in in a new tab), browse tools, call a few
  with arguments, read the response as content blocks and structured output, watch progress and logs,
  restart the server after a code change, repeat. Several servers may be relevant at once (a local one
  under development and a deployed one to compare against).
- Saved connections live in `~/.mcptool/connections.json`; OAuth credentials in `~/.mcptool/oauth/`.
- A demo server (`examples/demo-server.ts`) exercises every protocol feature for first-run and testing.

## Capabilities and Constraints

- Stack: Express + `@modelcontextprotocol/sdk` (Node), React 19 + Vite, plain CSS with custom
  properties. No component library. Light and dark follow the OS preference today.
- Protocol facts shape the UI: tools (model-controlled), resources and resource templates
  (application-controlled), prompts (user-controlled); server capabilities decide which exist.
  Server-initiated requests (sampling, elicitation, roots) need an answer before the tool call that
  triggered them can finish.
- Sessions live in the API process; the UI must survive its own reload and the API's restart.
- Terminology: *connection* (saved config), *session* (a live connection), *tool / resource /
  template / prompt*, *console* (the traffic log), *server request* (sampling or elicitation).
- *Assumption:* no mobile use; the smallest realistic viewport is a half-width laptop window
  (~700px). Keyboard-heavy users; Ctrl+Enter to send already exists and should stay.

## Brand Commitments

- Name: **mcptool** (lowercase). Mark: an "M" monogram in a rounded tile (current, replaceable).
- Voice (read from existing copy): plain, exact, explains the protocol in passing ("Tools are
  model-controlled: the model decides when to call them"). It never hides a protocol detail behind
  a friendly label; it shows the detail and explains it.
- No pinned palette, typeface or visual world. The current purple-accent look is the thing being
  replaced.

## Evidence on Hand

- The demo server and any real server the developer connects: the UI's content is always real
  protocol data, never marketing claims.
- Nothing to fabricate: no testimonials, logos or usage numbers exist or belong here.

## Product Principles

1. **The server's truth, as the model sees it.** Show real names, descriptions and schemas verbatim;
   explain, never paraphrase away.
2. **Restart is the loop.** Reconnecting after a code change must be one gesture and lose nothing
   (drafts, open tabs, history).
3. **Never block on a dialog when the answer belongs inline.** A server's question arrives where the
   response would.
4. **Dense but legible.** JSON, schemas and logs are the content; typography serves reading them.
5. **Keyboard first, mouse welcome.**

## Accessibility & Inclusion

Target WCAG 2.1 AA: visible focus rings, labelled controls, 4.5:1 text contrast in both themes,
`prefers-reduced-motion` respected. Long sessions of reading code-like text: legibility of
0/O, 1/l/I and punctuation matters more than brand expression.
