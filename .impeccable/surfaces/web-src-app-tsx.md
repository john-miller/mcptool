---
version: 1
slug: "web-src-app-tsx"
primary_target: "web/src/App.tsx"
related_targets: ["web/src/styles.css"]
---

# Surface: the mcptool workbench (web/src/App.tsx and everything it renders)

Scope: the whole single-page app. Visitor mode: Operate.

Audience: an MCP server developer, beside their editor, in long sessions that alternate editing
server code with exercising it. Job: see what a model is given, call tools by hand, read results,
answer the server's own questions, watch every message. Pains named by the user (2026-10-21): too
many clicks to reach a tool and call it; the traffic log is hard to relate to the request just sent.

Must remain untouched: every protocol feature already built (stdio/HTTP/SSE, OAuth, sampling,
elicitation, progress, logging, resources, templates, prompts, raw JSON-RPC, JWT decoder,
model-readiness checks, import of host configs), the backend's API shape, Ctrl+Enter to send.

## Direction contract

THESIS: mcptool is a protocol analyzer for MCP. The live JSON-RPC stream is the main pane; choosing
a tool, filling its arguments, reading a result and answering a server's question are all composing
or dissecting a frame in that stream. It refuses the category's arrangement: document tabs over a
request/response split with the log folded away at the bottom.

OWN-WORLD: a cool graphite neutral scale, dark-first with a light sibling. One amber accent, spent
only on selection, the primary action and a change held until seen. Two direction hues (client to
server blue, server to client green) and one error red; nothing else is coloured. Hairline rules,
dense rows, tabular figures, LED status dots. Atkinson Hyperlegible Next for the interface and
Atkinson Hyperlegible Mono for everything the protocol says. Two type sizes inside a pane; rank is
weight and case. A new frame flashes once and keeps its tint until acknowledged.

STORY: connect (one chip per server, several live at once), watch the handshake land, pick a tool in
the left tree, fill its parameter table on the right, Ctrl+Enter, see request and response land as
a bracketed pair, read the dissected result below. When the server asks something, the question
arrives as a flagged frame and is answered in the same right pane. Restart is one gesture and the
stream keeps going.

FIRST VIEWPORT: 1440x900. A 44px capture bar: mark and name, server chips with LEDs, the display
filter centred in mono, Connect/Restart, palette, theme. Below it three columns: a 260px rail
(server header; Overview and Model view; Tools, Resources, Prompts with counts and a filter), the
centre column (stream rows on top at ~40%, the dissected frame or pair below at ~60%, a drag
handle between), a 440px crafter on the right (tool reference and parameter-table form, Send in
amber at the form's foot). A 26px status bar: frames, pending replies, average latency, stderr
count, shortcut hints. The eye lands on the stream filling with the handshake; the primary action is
Send. Signature interaction: Send flashes the request out, the response lands auto-selected, the
pair is bracketed in the stream; j/k walk frames. Motion 150-200ms; the held tint has no timer and
decays only on acknowledgement; reduced motion drops the flash and keeps the tint.

FORM: Protocol analyzer (Wireshark's grammar), #4 on the ordered list; seed key af3c4f0a. Raises:
held alert (gate board), accent budget (monochrome canon), request and response on one registered
grid (botanical folio), two-size scale ranked by weight (timetable), one frame under the keyboard
(vertical feed), mono readouts on a strict grid (type specimen).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.
