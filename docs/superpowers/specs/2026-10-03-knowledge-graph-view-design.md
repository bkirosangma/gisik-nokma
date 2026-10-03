# Knowledge Graph view (Knowledge Graph spec C) — design

**Date:** 2026-10-03.

**Base:** `release/smoothness` @ `dce9ca61`.

**Target branch:** the next release branch (not cut yet).

**Status:** the owner approved section C in conversation on 2026-10-03, with the rulings below. This file is the written spec for review. The series table is in spec A.

**Mockups** (the bar):
- SVG mockup v4: https://claude.ai/artifact/SN3vBiYHo833KNyDLHgKhB. Owner: "most things worked really well in the old mockup".
- Sigma v4 port: https://claude.ai/artifact/STVAyJj6EFeZTcy3tYdsUy (v3: icons, no hover flicker, semantic-layer switch).
- Sigma v4 check: https://claude.ai/artifact/PdTLuQry9qF9D2bnQTZo87.

**Owner's words and rulings (2026-10-03):**
- **Fog:** "update the mockup with the fog first". Fog is the shape of the view.
- **Scope (C-scope):** the graph defaults to the current workspace, and the viewer can pick several workspaces and one or more projects. Items OUTSIDE the scope are fog dots, never walked past and not clickable. Items the viewer cannot see are left out entirely, never shown as fog.
- **Edges:** "hovering over the graph edges should at least show the label or the name". Clicking an edge opens its details, with provenance.
- **Naming:** "lets call this section Knowledge Graph", everywhere.
- **Zoom and pan:** "zoom in zoom out should be available". Pinch zoom "works well". The page must not scroll under the graph. Dragging to pan must not select text.
- **Renderer ruling A:** Sigma v4, pinned to an exact version, behind a swappable seam.
- **Icons:** "Nodes with icons. like the old ones were good."
- **D6:** "the on off switch is only for app viewing. view it with or without the semantic layer. but changes nothing about the actual data" (§6.4).

**Assumptions** (correct them at review):
- Positions are computed per view and never saved.
- There is no free node dragging in this spec.

## 1. Where it appears

| Surface | Centre | Notes |
|---|---|---|
| Ticket sheet, a fourth tab "Knowledge Graph" beside Details / History / Attachments (`ticket-sheet.tsx:3634-3638` `SegmentedControl`) | the ticket | desktop and phone |
| Note document, a "Knowledge Graph" tab in its side panel | the note | B's "Linked from" stays in Details |
| Home (spec E) | the workspace, or Me | E owns the page; C provides the component |

## 2. Data

### 2.1 Items and edges

| Group (filter chip) | Edge | Source |
|---|---|---|
| Projects | workspace → project → item ("contains" / "is in") | `proj_tickets`, `proj_notes`, projects |
| Parent and subtasks | parent → child | `proj_tickets.parent_id` |
| Blocks / Relates to / Duplicates | spec A | `proj_ticket_links` |
| Attached notes | note ↔ ticket | `proj_note_attachments` |
| Links in text | source → referenced item | spec B `proj_references` (ticket and note targets) |
| People | assignee, mention | `proj_tickets` assignee; spec B person targets |
| Concepts | concept → item | spec D, shown only while the semantic layer is on (§6.4) |

**Items** are tickets, notes, people, projects, workspaces and (D) concepts.

**Edge sentences** are generated from one table, so the tooltip, the inspector and the accessible list read the same. Examples:
- "GN-133 blocks GN-142";
- "Phone pass rulings is attached to GN-142";
- "Ama Rangsa is the assignee of GN-142".

### 2.2 Endpoint: hop by hop

`GET /v1/graph/neighbours?center=<kind>:<id>&hops=<1..4>&ws=<id,…>&proj=<id,…>&groups=<…>&cursor=`

It returns `{ items, edges, frontier, truncated }` for one ring at a time. The client asks for hops 1…n, then one more ring for the fog.

**Visibility** uses the existing helpers:
- `visibleTicketsWhere` / `visibleNotesWhere` (`apps/server/src/read/visible-where.ts:136`, `:294`);
- `visibleProjects` (`read/visible-projects.ts:211`);
- membership, for people.

An item the viewer can't see is never returned, and neither is an edge into it.

**Out-of-scope items** (outside the chosen workspaces or projects) are returned flagged `out:true` and are never expanded. The client draws them as fog.

**Order** within a ring is the server's: typed links first, then structure, then references, then people, and newest first within a group. The cap (§3.2) cuts by this order.

The plan's first task measures the endpoint on a prod-sized copy (p95 per ring). The budget is p95 ≤ 150 ms per ring at 500 items.

### 2.3 The client graph

The client graph is graphology, holding the union of the fetched rings. It is cached per centre for the session, so Back is instant.

## 3. The view

### 3.1 Rings and fog

- **Layout.** Items sit on concentric ellipses by hop distance (radii from the mockup's `CFG.desktop/phone/home.R`). Children are grouped under their parent's angle.
- **Clear hops:**
  - desktop: 1–4 or Everything (control "Hops", keys `1`–`4`), default 2;
  - phone: 1 hop, with no control;
  - Home: per spec E.
- **Fog.** The ring after the last clear hop is fog: small grey dots (a shape per kind) and faint edges. Fog is not clickable, cannot be hovered, and is never walked past.
- **A soft fog band** (radial mist) and labelled ring lines ("1 hop", "2 hops") sit under the graph.

### 3.2 The cap

- At most **500 clear items**; past that, the rest go to fog.
- At most **2,000 fog items**.
- When the cap cuts, a "+N further out" control at the bottom left raises the hop or explains the cut. The count line says "N items within H hops, M more in the fog (K outside the scope)".

### 3.3 Levels of detail (by hop)

| Level | Used at | Shows |
|---|---|---|
| card | the centre | key over title (two lines), 2 px border, shadow |
| chip | desktop hop 1 | icon or status dot; key over title (two lines) |
| compact | hop 2 | icon or status dot, key or short name |
| dot | hop 3+ | the icon or dot only, with the name on hover |
| tap | phone hop 1 | key only, with a 32 px target |

### 3.4 Icons ("like the old ones")

- **Ticket:** its status dot, in the workflow category colour (open / active / done tokens).
- **Note:** the page glyph.
- **Workspace / project:** the folder glyph.
- **Person:** an avatar with initials.
- **Concept:** a teal pill. A suggestion is dashed (spec D).

Fog keeps one small shape per kind. The icon set is the same set as the inspector's and the list's glyphs.

### 3.5 Interaction

- **Click** an item: select it. The inspector opens (desktop side panel; phone bottom card), showing the kind, name, key facts, "Direct links" grouped by edge kind, an Open button, and Center.
- **Double-click**, `C`, or Center: that item becomes the centre. Its links come out of the fog, the old centre goes onto the **trail** (top left), and **Back** / `Esc` returns.
- **Hover an item:** its neighbours and their edges stay, and everything else dims (items to 32%, edges to 8%). Hovering an edge does NOT dim anything.
- **Hover an edge:** a tooltip shows its sentence near the pointer and follows it. The edge thickens. The tooltip stays up while the pointer is on the edge.
- **Click an edge:** the inspector shows:
  - the edge's swatch and sentence;
  - From and To (each one clickable);
  - for references, the snippet;
  - **provenance**: who added it, when, and how ("via Claude" when `origin:'mcp'`);
  - actions "Center on X", and "Remove link" for spec A's typed links (permission per A §2.3, with Undo).
- **Filters.** One chip per group, with a count, toggles that group's edges. Hidden groups are not walked.
- **Scope.** A Workspaces multi-select (default: the current one) and a Projects multi-select (default: all), using the ui `Select` (`packages/ui/src/select/select.tsx:55`).
- **Selection survives zoom**, and zoom survives selection.
- **The accessible list.** Under the canvas, "Linked to X", grouped by hop, with the same glyphs and sentences. Each row selects or opens. This is the keyboard and screen-reader path. The canvas itself is `role="img"` with a summary label.

### 3.6 Motion and camera (the smooth zoom engine)

- **The camera spring.** Our own critically damped spring on Sigma's camera: τ = 85 ms (about 300 ms to settle), and dt clamped to 100 ms.
- **Wheel:**
  - zoom is anchored on the pointer, so the point under the cursor stays put;
  - `ctrl+wheel` (and a trackpad pinch, which arrives as ctrl+wheel) zooms;
  - a pixel-delta wheel without ctrl (two-finger scroll) pans;
  - Safari `gesture*` events zoom.
- **Limits.** Zoom goes from 0.5× to 4× of the fit. Past a limit it rubber-bands (power 0.3), and springs back 160 ms after the last input.
- **Momentum** after a drag pan.
- **Fit** (button and on load) frames every clear item including its label, plus the fog ring.
- **Glide.** When the centre changes, items tween from their old place over 320 ms. Items that did not move do not tween, so edges never flash.
- **`prefers-reduced-motion`** makes every one of these instant.
- **Zoom buttons** (+ / − / Fit) sit at the bottom right.

### 3.7 Theme

Every colour is an app token from `packages/ui`, with new tokens for the seven edge groups and the concept fills, light and dark:
- `--e-structure`, `--e-blocks`, `--e-relates`, `--e-dup`, `--e-attached`, `--e-ref`, `--e-people`, `--e-concept`, `--concept-bg`, `--concept-soft`, `--fog-dot`.

The values are the mockup's. They join `packages/ui/test/tokens.test.ts` `CONTRAST_PAIRS` against the surfaces they are drawn on (edges at 3:1, labels at 4.5:1).

The renderer reads the token values at mount and again on a theme change.

## 4. Renderer: Sigma v4 behind a seam

### 4.1 Package and seam

The new package is `packages/knowledge-graph`:
- `engine/`: pure and unit-tested. It holds the walk (`bfs` with scope and groups), zones (clear / fog / cap), the layout (rings), the fit (label-aware), levels, the sentences, and the springs.
- `render/`: the `GraphRenderer` interface: `mount(el, theme)`, `setGraph(items, edges, positions, states)`, `setCamera` / `onCamera`, `onPick` / `onHover`, `refreshTheme()`, `destroy()`.
- `render/sigma/`: the ONLY files that import `sigma`, `sigma/*`, `@sigma/*` or `graphology*`.

A dependency check fails if any other file imports them. It uses the TypeScript program's resolved imports, not a regex, because a regex walker misses side-effect imports.

**Pinned exactly (no caret):**
- `sigma@4.0.0-beta.7`;
- `@sigma/node-image@4.0.0-alpha.3`;
- `graphology@0.26.0`.

If v4 fails a bar in §7, swapping the adapter (for example to Sigma 3) touches only `render/sigma/`.

### 4.2 Sigma v4 traps the adapter must handle (each measured on 2026-10-03; each gets a case)

1. **Label attachments blink.** Sigma drops every label attachment on each state change and each reprocess, and re-rasterises it asynchronously, so the cards' second line blinked on every hover. This was the owner-reported flicker. The adapter keeps the attachment cache and invalidates a node only when its subtitle text changes. The case: 10 forced redraws with no input give identical frames.
2. **A dash gap of 0 draws nothing.** Solid edges are drawn as dash 10000 / gap 0.2 with `align:0` and `solidExtremities:true`. Otherwise there is a notch at mid-line and the arrowheads come out dashed.
3. **Labels are one line.** The second line is an SVG `labelAttachment`. Attachments are cached textures, so there is one attachment name per theme.
4. **Icons** use `layerImage` from `@sigma/node-image`, declared as a node `variables.image` and set through a style. Display data keeps only declared style keys.
5. **Sizes** are in screen pixels (`itemSizesReference:'screen'`, `zoomToSizeRatioFunction:()=>1`), so icons stay readable at any zoom, as labels do.
6. **Picking.** Sigma has no pickable flag, so fog still fires node events, and the handlers ignore fog. `nodeLabelEvents:'extend'`, or only the dot is clickable.
7. **Wheel.** `preventSigmaDefault()`, `event.original.preventDefault()` AND a non-passive `wheel` listener on the container, or the page scrolls under the graph.
8. **Camera.** Coordinates are read through `{cameraState}` overrides. The first fit runs in the first `afterRender`, because the viewport size is wrong before it.
9. **Dimming.** Dim on item hover only, through our own flag, because `hasHovered` is also true for an edge hover.
10. **Arrows** end at the target's dot. The centre card is drawn `labelPosition:'over'` at size 1, so arrows into it stay visible.
11. **Edge labels** are drawn rotated along the line, so the sentence is a DOM tooltip instead.

## 5. Phone

- **One clear hop.** Hop 2 is fog.
- **Tap targets** are at least 32 px, and labels are key-only (labels have a constant pixel size).
- **Inspector.** A bottom card holds the inspector.
- **Bar.** The scope, filters and semantic-layer switch fold into one "Scope and links" disclosure.
- **Gestures.** A pinch zooms. One finger pans and never scrolls the page (`touch-action:none`, `overscroll-behavior:contain` on the canvas only).

## 6. States

### 6.1 Loading

A skeleton of the rings shows while a ring loads. It follows the smoothness placeholders: no layout shift, and the canvas keeps its size.

### 6.2 Empty

An item with no visible links says so, and offers "Add link" (spec A) on a ticket.

### 6.3 Errors

A failed ring keeps what is drawn, and shows "Couldn't load the next hop. Retry" on the frontier.

### 6.4 The semantic-layer switch (ruling D6)

- **What it is.** A viewing switch on the graph's bar, "Semantic layer: On / Off". The default is On.
- **Off hides:**
  - concepts;
  - concept edges;
  - suggestions;
  - the Concepts filter chip.
- **What it doesn't touch.** It changes nothing in the data: it writes no event and no setting, and it doesn't affect MCP, embedding or other viewers.
- **Storage.** It is remembered per browser (`localStorage`, wrapped in try/catch, so a blocked store gives the default).
- **Turning it Off while centred on a concept** returns to the surface's own centre.

## 7. Bars (measured, not assumed)

| Bar | Target | Measured 2026-10-03 |
|---|---|---|
| Frame rate at 500 clear + 2,000 fog + 3,000 edges (desktop, M2 Pro class) | ≥ 60 fps, worst frame ≤ 16.7 ms | 121 fps, worst frame 9.4 ms (Metal) |
| Hover redraws | identical frames with no input | identical after the trap-1 fix |
| Wheel | the page `scrollY` is unchanged | passes |
| Phone frame rate at the cap | measured in the plan's first task, on a mid-range phone, before building the rest | — |
| Endpoint | p95 ≤ 150 ms per ring at 500 items | plan's first task |

If v4 misses a bar the adapter cannot fix, the plan stops and asks the owner, and the seam allows a swap.

## 8. Testing and proof

**Case block:** 27.200–27.349.

**Unit tests (engine).** One case each, with its control in the same `it`, for:
- the walk with scope and groups;
- out-of-scope fog that is never walked past;
- invisible items that are absent;
- the cap at 500 (and the control at 499);
- the fog budget;
- levels by hop;
- the fit including labels;
- the sentences for every edge kind, both directions;
- the spring settling, the rubber band and its settle.

**Server.** Endpoint visibility (a hidden item is absent, and so is its edge), out-of-scope flags, ring order and the cap cut.

**Browser.** The suite is a private Playwright package, `packages/knowledge-graph-browser`. It follows G-9's `packages/workflow-canvas-browser` (in flight on release/smoothness): a Vite harness on its own port, so it runs on the gate. It covers:
- every trap in §4.2;
- click by label;
- double-click centres, and Back;
- the edge tooltip sentence, and the edge inspector with provenance;
- hover dimming only on items;
- the wheel doesn't scroll the page;
- pinch and ctrl+wheel zoom, and a two-finger scroll pans;
- the phone bar and one clear hop;
- the semantic switch (Off hides concepts and survives a reload, and the control On brings them back);
- the theme switch redraws icons and colours.

Headless Chrome renders in software (SwiftShader, about 5 fps), so each test waits for the camera to settle rather than for a timer.

**Gate.** The browser package adds tasks to the gate count; the plan updates the gate's expected task count in the same change.

## 9. Files (expected)

- `packages/knowledge-graph/` (new): `engine/*`, `render/renderer.ts`, `render/sigma/*`, and a React wrapper `KnowledgeGraph`.
- `packages/knowledge-graph-browser/` (new).
- `apps/server/src/routes/graph.ts` (new), `read/graph-neighbours.ts` (new).
- `packages/app-core/src/views/ticket-sheet.tsx` (tab), `apps/web/src/notes/note-document.tsx` (tab).
- `packages/ui` tokens + `tokens.test.ts`.
- `Features.md` §24, `test-cases/27-knowledge-graph.md`.

## 10. Risks

- **Beta dependencies** (v4 beta, node-image alpha). Pinned exactly, behind the seam. Every trap is pinned by a test, so an upgrade that changes one goes red.
- **The attachment-cache fix** reaches into `sigma.internals.attachmentManager`. It is pinned by trap test 1, and the upgrade path re-checks it first.
- **Phone GPU performance** is unmeasured. That is the plan's first task.
