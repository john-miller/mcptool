---
name: mcptool
description: A protocol analyzer for MCP; cool graphite, one amber, two direction hues, one red.
colors:
  graphite-0: "#0f1216"
  graphite-1: "#141821"
  graphite-2: "#1a1f2a"
  graphite-3: "#212735"
  line: "rgb(255 255 255 / 0.08)"
  line-strong: "rgb(255 255 255 / 0.15)"
  ink: "#e6e9ef"
  ink-2: "#a9b1bf"
  ink-3: "#8891a1"
  amber: "#f2b33d"
  amber-text: "#f2b33d"
  amber-ink: "#1a1200"
  amber-soft: "rgb(242 179 61 / 0.14)"
  amber-select: "rgb(242 179 61 / 0.22)"
  out-blue: "#74abff"
  out-soft: "rgb(116 171 255 / 0.09)"
  in-green: "#5fcf9e"
  in-soft: "rgb(95 207 158 / 0.1)"
  error-red: "#ff7272"
  error-soft: "rgb(255 114 114 / 0.13)"
  graphite-0-light: "#e8ebef"
  graphite-1-light: "#f4f6f8"
  graphite-2-light: "#eceff3"
  graphite-3-light: "#ffffff"
  line-light: "rgb(16 22 30 / 0.1)"
  line-strong-light: "rgb(16 22 30 / 0.2)"
  ink-light: "#171b22"
  ink-2-light: "#4b5563"
  ink-3-light: "#5f6875"
  amber-light: "#d08a14"
  amber-text-light: "#8a5a00"
  amber-soft-light: "rgb(208 138 20 / 0.14)"
  amber-select-light: "rgb(208 138 20 / 0.24)"
  out-blue-light: "#2b66d1"
  out-soft-light: "rgb(43 102 209 / 0.08)"
  in-green-light: "#178a5d"
  in-soft-light: "rgb(23 138 93 / 0.09)"
  error-red-light: "#cf2f2f"
  error-soft-light: "rgb(207 47 47 / 0.1)"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.45
  title:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.4
  protocol:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.06em"
  tag:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.04em"
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  pill: "12px"
  full: "50%"
spacing:
  "1": "2px"
  "2": "4px"
  "3": "6px"
  "4": "8px"
  "5": "10px"
  "6": "12px"
  "7": "14px"
  "8": "16px"
  "12": "24px"
components:
  button:
    backgroundColor: "{colors.graphite-3}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "30px"
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.amber-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "30px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "30px"
  button-ghost-hover:
    backgroundColor: "{colors.graphite-2}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error-red}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "30px"
  button-sm:
    padding: "0 9px"
    height: "26px"
  button-xs:
    padding: "0 7px"
    height: "22px"
  input:
    backgroundColor: "{colors.graphite-3}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "5px 9px"
    height: "30px"
  display-filter:
    backgroundColor: "{colors.graphite-0}"
    textColor: "{colors.ink}"
    typography: "{typography.protocol}"
    rounded: "{rounded.sm}"
    padding: "0 8px 0 10px"
    height: "30px"
    width: "680px"
  server-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "28px"
  server-chip-active:
    backgroundColor: "{colors.graphite-3}"
    textColor: "{colors.ink}"
  tag:
    backgroundColor: "{colors.graphite-3}"
    textColor: "{colors.ink-2}"
    typography: "{typography.tag}"
    rounded: "{rounded.xs}"
    padding: "1px 6px"
  kind-tag:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.tag}"
    rounded: "{rounded.xs}"
    padding: "1px 6px"
  stream-row:
    backgroundColor: "{colors.graphite-0}"
    textColor: "{colors.ink-2}"
    typography: "{typography.protocol}"
    padding: "0 12px"
    height: "24px"
  stream-row-selected:
    backgroundColor: "{colors.amber-select}"
    textColor: "{colors.ink}"
  stream-row-new:
    backgroundColor: "{colors.amber-soft}"
  nav-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
  nav-row-active:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.graphite-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  dialog:
    backgroundColor: "{colors.graphite-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
    width: "720px"
  kbd:
    backgroundColor: "{colors.graphite-3}"
    textColor: "{colors.ink-2}"
    typography: "{typography.tag}"
    rounded: "{rounded.xs}"
    padding: "1px 5px"
---

# Design System: mcptool

## Overview

**Creative North Star: "The Protocol Analyzer"**

mcptool borrows Wireshark's grammar and nothing of its skin. The live JSON-RPC stream is the main pane; every other surface (the tree of offerings on the left, the dissected frame below, the crafter on the right) is a way of composing or taking apart a frame in that stream. The world is a cool graphite neutral scale, dark first with a light sibling that follows the OS preference, drawn with hairline rules, dense 24px rows, tabular figures and LED status dots. Nothing is decorative; a line exists because two things need separating, and a tint exists because a frame has a direction.

Colour is a budget, not a palette. One amber is spent on exactly four things: the selection, the primary action, the focus ring, and a change held until it is seen. Two direction hues (blue for client to server, green for server to client) and one error red are the only other chroma on screen, and they appear only where direction or failure is the fact being shown. JSON, JWT parts and readouts rank by weight and ink level, never by hue.

Type is Atkinson Hyperlegible Next for the interface and Atkinson Hyperlegible Mono for everything the protocol says (methods, ids, latencies, JSON, the display filter, key legends). Inside any one pane there are two sizes; hierarchy is weight and case. The rejected arrangement is the category's own: document tabs over a request/response split with the log folded away at the bottom.

**Key Characteristics:**
- Stream-first three-column workbench under a 44px capture bar and over a 26px mono status bar.
- Flat tonal layering on four graphite steps; hairlines at 8% and 15% white (10% and 20% near-black in light).
- Amber budget: selection, primary action, focus, held-until-seen. Blue out, green in, red error. Nothing else coloured.
- Two sizes per pane (13 / 11.5; protocol mono 12); rank by weight (400 / 500 / 600 / 700) and uppercase.
- One drawn inline-SVG icon set on a 16-unit grid at stroke 1.75, always currentColor.
- Motion is 150 to 200ms and state-bound; a landed frame flashes once and holds its tint until acknowledged.

## Colors

A cool graphite scale carries the whole interface; chroma is rationed to amber, a blue and a green that mean direction, and a red that means failure. The dark theme is canonical; each token has a light sibling under the same name (frontmatter keys with the `-light` suffix) and the light theme uses a darker amber for text so it still clears 4.5:1.

### Primary
- **Amber** (`amber`, light `amber-light`): the single accent. Fills the primary action (Send, Connect, Call tool, the jump-to-latest pill), the focus ring, the selected stream row's 1px outline, the alert badge on a server chip, the active tree row's 2px inset edge, the connecting LED, the progress fill and the checkbox accent.
- **Amber Text** (`amber-text`, light `amber-text-light`): amber used as text or a tinted border on a neutral ground: "awaiting your reply", the required-parameter mark, the status-bar alert, the active-toggle button, the ask-kind tag. In light it is a darker amber so it reads at AA.
- **Amber Ink** (`amber-ink`): the near-black text placed on a solid amber fill.
- **Amber Soft / Amber Select** (`amber-soft`, `amber-select`): translucent amber at 14% and 22% (24% in light). Soft is the held tint of an unacknowledged frame, the active nav row, the active palette item, the reply crafter's head, the resizer on hover, and the info banner. Select is the selected stream row and text selection.

### Secondary
- **Out Blue** (`out-blue`, `out-soft`): client to server. Appears only on the direction arrow, the `d-out` kind tag's text and 45% border, the row tint of outbound frames, the REQ tag, the user message in a sampling transcript, and the context-cost bar fill.
- **In Green** (`in-green`, `in-soft`): server to client. Appears only on the direction arrow, the `d-in` and response kind tags, the row tint of inbound frames, the RES tag, the OK status, the connected LED (with a 2px soft halo), the assistant message, and the mark's arrow.

### Tertiary
- **Error Red** (`error-red`, `error-soft`): failures only. Error rows' method, info, kind and arrow; the error banner and error box; the danger button; the failed or closed LED; the field error; the warn readout value; the issue tag.

### Neutral
- **Graphite 0** (`graphite-0`): the canvas; the stream, the detail pane, the centre column, the display filter's well, resizers, and the inner JSON well inside crafter, card and dialog.
- **Graphite 1** (`graphite-1`): the chrome; capture bar, rail, crafter, status bar, sticky stream header, detail and pair heads, send bar, cards, dialog and palette bodies, JSON view in the centre.
- **Graphite 2** (`graphite-2`): hover for rows, chips, ghost buttons and tree rows; the hint box; the system message.
- **Graphite 3** (`graphite-3`): raised controls; buttons, inputs, kbd, tag and badge fills, the active chip, the active tab, progress and bar tracks, the mark tile.
- **Line / Line Strong** (`line`, `line-strong`): 8% and 15% white hairlines (10% and 20% near-black in light). Line divides panes, rows and table cells; Line Strong borders controls, the active chip, dialogs and the capture-bar separator.
- **Ink / Ink 2 / Ink 3** (`ink`, `ink-2`, `ink-3`): three text levels. Ink is methods, keys, values, titles and hovered text; Ink 2 is the default row and body colour, string values, chips and descriptions; Ink 3 is seq, time, id, latency, punctuation, placeholders, section labels and column headers. Ink 3 clears 4.5:1 on Graphite 0 in both themes.

### Named Rules
**The Amber Budget Rule.** Amber is spent on four things only: the selected frame, the primary action, the focus ring, and a change held until it is seen. If a surface needs a fifth, it is wrong.

**The Direction-Only Rule.** Blue and green mean client to server and server to client and appear only on direction marks, kind tags, row tints and REQ/RES tags. They never colour a button, a heading, a link or a JSON token.

**The Rank-By-Weight Rule.** JSON keys, numbers and booleans are Ink at 600; strings are Ink 2; null and punctuation are Ink 3. The JWT's header, payload and signature are 700 Ink, 400 Ink 2, 400 Ink 3. No syntax hue anywhere.

## Typography

**Display Font:** Atkinson Hyperlegible Next (with system-ui, Segoe UI, sans-serif); self-hosted variable woff2, weight 200 to 800, normal and italic.
**Body Font:** Atkinson Hyperlegible Next (same family; there is no separate display face).
**Label/Mono Font:** Atkinson Hyperlegible Mono (with ui-monospace, Cascadia Mono, Consolas, monospace); self-hosted variable woff2.

**Character:** One hyperlegible family in two cuts. The sans is for what the tool says; the mono is for what the protocol says. Both are chosen for 0/O, 1/l/I and punctuation over brand expression; tabular numerals are on everywhere.

### Hierarchy
- **Display** (600, 22px, letter-spacing -0.01em): the start page's single h1 only.
- **Headline** (600, 14px): page heads (Overview, Model view), the palette input, an elicitation message.
- **Title** (600 or 700, 13px): tool and resource titles in the crafter (700), rail server name, card h3, the selected method in the detail head, the brand word.
- **Body** (400, 13px, 1.45): descriptions, parameter tables, form labels, the lede at a 72ch measure. Buttons, nav and tree rows run one half-step down at 12.5px.
- **Body Small** (400, 11.5px, 1.4): sub-lines, types, notes, status bar, detail and pair heads, timeouts, send status, segmented and tab buttons.
- **Protocol** (400, 12px mono, 1.6 in JSON and 1.45 in rows): every stream row, the display filter, ids, latencies, JSON, text content, readouts, error messages, the JWT token (11.5px).
- **Label** (600, 11.5px, 0.06em, uppercase, Ink 3): section labels inside a pane: h4 ("parameters", "arguments", "content · what the model reads"), tree group heads, stream column headers, palette groups, message roles. A label names the block beneath it; it never sits above a title as a kicker.
- **Tag** (600, 11.5px mono, 0.04em, uppercase): TOOL / REQ / RES / OK kind tags, status pills, kbd legends (500), row-action buttons.

### Named Rules
**The Two-Size Rule.** Inside one pane there are two type sizes (13 and 11.5, or mono 12 and 11.5). Anything that needs to stand out does so by weight or by uppercase, not by a third size.

**The Protocol Speaks Mono Rule.** Method names, ids, latencies, JSON, filter syntax, counts in readouts and key legends are set in Atkinson Hyperlegible Mono. The interface's own words stay in the sans.

## Layout

The app is a fixed-height column: a 44px capture bar, an optional single-line banner, the work area, and a 26px status bar. The work area is a CSS grid with one track per rendered pane: rail (default 248px, draggable 200 to 480), a 6px resizer, the centre at `minmax(0, 1fr)`, a 6px resizer, the crafter (default 420px, draggable 320 to min(760px, 60vw), clamped so the centre keeps at least 340px). The centre column is itself a two-row grid: the stream at 42% by default (draggable 15% to 85%) over the dissected frame or request/response pair, with a 6px horizontal resizer between them. Panes that are hidden get no track at all.

Rhythm is tight and even: 24px stream rows with a 26px sticky header, 28px chips, 30px controls (26px small, 22px extra-small), 36px detail head, 30px pair heads, 40px page heads. Horizontal padding inside panes is 12 to 16px; gaps between inline items are 4 to 10px; sections in the crafter separate by 14px; cards and page bodies step at 14 / 18 / 22px. The start page centres a 720px column at 48px top padding; dialogs are 720px (960px wide), the palette 640px at 10vh from the top.

Responsive behaviour is viewport-driven for the frame and container-driven for the panes:
- Below 1100px the rail leaves the grid and becomes a drawer over the work area (same width, soft right shadow), opened from the capture bar and closed by picking a row.
- At 820px and below the capture bar keeps only the active server's chip (plus the add chip), drops button labels to their icons, lets the filter shrink to 100px, and hides the status bar's key legends.
- The stream drops columns by its own width: time at 680px and below; id and latency (Δ) at 520px and below. Seq, direction, kind, method and info always remain.
- The detail pane stacks the request/response pair into one column at 560px and below, with a top rule between the two.
- The crafter hides the send shortcut hint at 400px and below.

## Elevation & Depth

Depth is tonal, not cast. Panes sit on Graphite 1 chrome against a Graphite 0 canvas, separated by 1px hairlines; a control is raised by being Graphite 3 with a Line Strong border, and hover is a step up to Graphite 2. Only three things cast a shadow, and all three float above the work: dialogs and the command palette (`--shadow`), the rail drawer, and the jump-to-latest pill. Selection and attention are outlines and tints, never lifts: a selected row has a 1px solid amber outline inset, its pair a 1px dashed amber outline, an active tree row a 2px inset amber edge.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 24px 60px -24px rgb(0 0 0 / 0.7), 0 2px 8px rgb(0 0 0 / 0.3)`; light `0 24px 60px -24px rgb(20 30 50 / 0.35), 0 2px 8px rgb(0 0 0 / 0.08)`): dialogs and the palette.
- **Drawer** (`box-shadow: 16px 0 40px -16px rgb(0 0 0 / 0.6)`): the rail when it is a drawer below 1100px.
- **Pill** (`box-shadow: 0 6px 16px -6px rgb(0 0 0 / 0.5)`): the amber jump-to-latest button floating over the stream.
- **LED halo** (`box-shadow: 0 0 0 2px var(--in-soft)`): the connected dot's 2px soft ring; a glow, not a lift.

### Named Rules
**The Flat Work Rule.** Nothing inside the work area casts a shadow. Only what floats over it (dialog, palette, drawer, jump pill) does.

## Shapes

Corners are small and consistent: 3px on tags, kbd, tabs and row actions; 4px on buttons, inputs, chips, rows, JSON wells and blocks; 6px on cards and the interfaces list; 8px on dialogs and the palette. The jump pill is a 12px capsule, LEDs and spinners are circles, chip badges are 8px capsules. Borders are hairlines: Line for dividers and quiet frames, Line Strong for controls; kind tags carry a 45% mix of their direction colour as border. Side-tab frames have no border at all; an unseen frame is held by its background tint alone. The kbd key is the one three-dimensional shape: a 1px Line Strong border with a 2px bottom edge. The brand mark is a 32-unit rounded tile (rx 6) holding an amber "M" stroke and a green arrow.

## Components

### Buttons
Quiet, instrument-grade controls; the one amber button on a surface is the primary action.
- **Shape:** 4px radius, 30px tall (26px small, 22px extra-small), 12.5px at 500 weight, 1px Line Strong border, 6px gap to a 14px icon.
- **Default:** Graphite 3 fill, Ink text; hover raises the border to Ink 3.
- **Primary:** amber fill and border, Amber Ink text at 600; hover brightens 6%. One per surface (Send / Call tool, Connect).
- **Ghost:** transparent, Ink 2 text; hover Graphite 2 fill, Ink text. Used for the capture bar's palette, JWT, theme and pane toggles; an off toggle drops to Ink 3.
- **Danger:** Error Soft fill, Error Red border and text. A text-only danger variant is Error Red on nothing.
- **On (toggle):** amber border and Amber Text.
- **Disabled:** 45% opacity. **Focus:** 2px amber outline, 1px offset.
- **Row action** (inside a stream row): 18px, amber fill, mono 11.5 at 600, 3px radius.

### Chips
Server chips in the capture bar; the capture always says what it is listening to.
- **Style:** 28px, 4px radius, transparent with a transparent 1px border, Ink 2 text, an 8px LED first (Ink 3 idle, green connected with a 2px soft halo, amber pulsing while connecting or waiting for sign-in, red failed or closed).
- **State:** hover Graphite 2 and Ink; active Graphite 3, Line Strong border, Ink. A badge is an 8px capsule in mono 11.5 at 500: Graphite 3 for unseen frames, amber with Amber Ink at 700 when a reply is awaited. Below 820px only the active chip survives.

### Cards / Containers
- **Corner Style:** 6px for cards and the interfaces list; 4px for blocks, JSON wells, messages, hints.
- **Background:** Graphite 1 on the Graphite 0 canvas; a JSON well nested inside a crafter, card or dialog drops to Graphite 0.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px Line.
- **Internal Padding:** cards 14px 16px; blocks and messages 10px 12px; JSON wells 8px 12px.

### Inputs / Fields
- **Style:** Graphite 3 fill, 1px Line Strong border, 4px radius, 30px minimum (26px small), 5px 9px padding, body 13 (mono 12 when the value is protocol), Ink 3 placeholder.
- **Focus:** the global 2px amber outline, pulled 1px inside the border. The display filter instead turns its border amber on focus-within.
- **Error:** border Error Red; a field error line in Error Red at 11.5.
- **Display filter:** the exception; a Graphite 0 well 30px tall, up to 680px wide, mono input, search icon in Ink 3 on the left, match count in mono Ink 3 and a clear icon on the right. "/" focuses it from anywhere.
- **Tabs / Segmented:** a 2px-padded Graphite 0 trough with a Line border; 22px buttons, 11.5 at 500, Ink 2; the active one is Graphite 3 and Ink. No side-tab borders.

### Navigation
The rail: Graphite 1 with a right hairline. A server head (600 name with LED; 11.5 sub-line), a nav list of 12.5px rows (5px 8px, 4px radius; hover Graphite 2; active Amber Soft with Ink text), a filter row, then the tree. Tree group heads are Label style with a caret and a right-aligned count; tree rows are 12.5px, indented 20px, with hover Graphite 2 and an active state of Amber Soft plus a 2px inset amber left edge. Below 1100px the rail is a drawer over the work area and closes when a row is picked.

### Stream (signature)
The main pane. A sticky 26px header in Label style over 24px mono rows on a 9-column grid (seq 36 / time 84 / direction 14 / kind 40 / method 100 to 170 / id 36 / Δ 54 / info 1fr / action auto), rows divided by a 7% grey hairline. Ink 3 for seq, time, kind, id and latency; Ink 600 for the method; Ink 2 for info. Outbound rows tint Out Soft with a blue arrow; inbound rows tint In Soft with a green arrow; notifications and stderr have no tint (stderr in italic Ink 3). An error row turns its method, info, kind and arrow red. A frame that landed since the stream was last acknowledged holds Amber Soft, entering with a 600ms ease-out from Amber Select; reduced motion drops the flash and keeps the tint. The selected row is Amber Select with a 1px inset amber outline; its pair wears a 1px dashed amber outline. Columns drop by container width (time at 680, id and Δ at 520). A floating 12px amber capsule in the lower right jumps to the latest frame.

### Detail and Pair (signature)
Under the stream. A 36px Graphite 1 head: kind tag, method at 600, id, time, latency and size in mono 11.5; a Pair / Dissected / Raw segmented control on the right. The pair is two equal columns divided by a hairline, each with a 30px head (REQ in blue or RES in green as a kind tag, then latency, id and time), stacking at 560px and below. Sections are Label-style h4s over JSON wells and content blocks; content blocks carry a TEXT tag and the text the model reads.

### Crafter
The right pane on Graphite 1 with a left hairline. A head (TOOL tag, title at 700, annotation tags, mono name), a body with the description and a parameter table (44% name column; names at 600 Ink 2 lifting to Ink once set; required mark in Amber Text; type and description at 11.5), and a send bar on Graphite 1 with a top hairline holding OK/ERR status, latency, the timeout field and the amber primary button. A reply crafter (answering a server's question) tints its head Amber Soft.

### Status bar
A 26px mono readout in Ink 2 at 11.5: frame count, average latency, stderr count on the left; kbd legends from the platform-aware KEYS map on the right (hidden at 820px and below). Alerts are Amber Text at 600; errors Error Red.

### Readouts
Counts are one mono line, not tiles: Ink 3 label beside an Ink 700 value, items spaced 24px; a warning value is Error Red.

### Dialog and Palette
8px radius, Graphite 1, 1px Line Strong border, the Overlay shadow, over a 50% black scrim. Dialogs are 720px (960px wide) with 12px 16px head and foot rules and a 16px body. The palette is 640px at 10vh with a 46px borderless 14px input, Label-style group heads, 4px-radius items whose active state is Amber Soft, and an 11.5 foot.

### Icons
One inline-SVG set (Icon.tsx): 16-unit viewBox, stroke 1.75, round caps and joins, currentColor, default 14px. The set is play, stop, restart, arrows, swap, alert, dot, carets, close, search, plus, panel-left/right, sun, moon, auto, import, key. No icon font, no Unicode glyph icons, no raster.

### Motion
Transitions are 150ms (background, border) to 200ms (progress fill); the landed flash is 600ms ease-out; the LED pulse 1.1s; the spinner 0.7s linear; the indeterminate bar 1.2s. `prefers-reduced-motion` removes every animation and transition and leaves the LED at full opacity.

## Do's and Don'ts

### Do:
- **Do** spend amber only on the selection, the primary action, the focus ring and a change held until seen (The Amber Budget Rule).
- **Do** use blue for client to server and green for server to client, and only on direction marks, kind tags, row tints and REQ/RES tags.
- **Do** set everything the protocol says (methods, ids, latencies, JSON, filter syntax, key legends) in Atkinson Hyperlegible Mono at 12px with tabular figures.
- **Do** keep two type sizes per pane and rank by weight (400 / 500 / 600 / 700) and uppercase.
- **Do** rank JSON and JWT parts by weight and ink level (Ink 600, Ink 2, Ink 3), never by hue.
- **Do** separate with 1px hairlines (Line for dividers, Line Strong for controls) and raise with tone (Graphite 0 → 1 → 2 → 3).
- **Do** show counts as one mono readout line: quiet label, heavy value.
- **Do** hold an unacknowledged frame in Amber Soft with no timer; it cools only when seen.
- **Do** draw every icon from the one inline-SVG set (16-unit grid, stroke 1.75, currentColor).
- **Do** use `--accent-text` for amber as text so the light theme gets its darker amber.

### Don't:
- **Don't** add kickers or eyebrows above a title; a Label-style h4 names the block beneath it and nothing else.
- **Don't** build hero-metric tiles; counts belong on the readout line.
- **Don't** put a border on side tabs or frame an unseen frame; a background tint holds it.
- **Don't** use Unicode glyphs (arrows, bullets, check marks) as icons.
- **Don't** cast a shadow inside the work area; only dialogs, the palette, the drawer and the jump pill float.
- **Don't** colour a button, heading, link or JSON token with blue or green.
- **Don't** introduce a third type size inside a pane or a system display face.
- **Don't** let any text fall below 4.5:1 in either theme; Ink 3 is the floor.
