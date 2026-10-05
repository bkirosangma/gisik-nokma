# Knowledge Graph view (spec C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In the gisik orchestration, every task is ONE lane session. Follow `gisik-nokma-lanes/STEPS-common-2026-10-03.md`: numbered steps, each ending with a pushed commit + `CHECKPOINT task/<branch> <sha40> step <n>/<N>` + `HANDOFF-<branch>.md`; the sweep list + your own mutation pass before DONE.

**Goal:** a "Knowledge Graph" view of linked tickets, notes, people, projects and workspaces around a centre item. It has rings by hop, fog past the last clear hop and outside the scope, an inspector for items and edges, an accessible list, the smooth camera, and the semantic-layer viewing switch. It is drawn by Sigma v4 behind a swappable seam and served hop by hop by a visibility-safe endpoint.

**Architecture:**
- **`packages/knowledge-graph` (new)** has four layers:
  - `engine/` is pure TypeScript, unit-tested, and ported from the owner-approved mockup's `makeGraph`: walk, zones, layout, levels, sentences, fit, springs, wheel and glide.
  - `render/renderer.ts` is the `GraphRenderer` seam.
  - `render/sigma/` is the ONLY directory that imports `sigma`, `@sigma/*` or `graphology*`. A test over the TypeScript program's resolved imports enforces this.
  - `react/` holds the `KnowledgeGraph` component, which loads the Sigma adapter with a dynamic `import()`, so Next.js never evaluates WebGL code on the server.
- **The server** answers `GET /v1/graph/neighbours` one ring at a time, from `read/graph-neighbours.ts`. That read applies the existing visibility predicates per workspace, so an item the viewer cannot see is never returned and neither is an edge into it.
- **`packages/knowledge-graph-browser` (new)** runs Playwright against a Vite harness, copying G-9's `packages/workflow-canvas-browser`. Every Sigma trap is measured on the gate.
- **The ticket sheet** gains a fourth tab through a component slot (the `editorSlot` pattern), so `app-core` never depends on the renderer. The note document gains a "Knowledge Graph" side panel (a `Sheet`, like History).

**Tech stack:** React 19, TypeScript, `sigma@4.0.0-beta.7`, `@sigma/node-image@4.0.0-alpha.3`, `graphology@0.26.0` (all exact), Fastify, Postgres, vitest 3 (jsdom), Playwright (Chromium), Vite 6 (harness only), turbo.

**Spec:** `docs/superpowers/specs/2026-10-03-knowledge-graph-view-design.md`. Read it first; its section numbers (§) are cited below. Spec A (`2026-10-03-typed-links-design.md` §2.2, §2.3, §2.5) and spec B (`2026-10-03-reference-index-design.md` §2.1, §2.2) define the two tables this view reads.

**The reference implementation** is the owner-approved single-file mockup `knowledge-graph-sigma.html`. Its published copy is the "Sigma v4 port" artifact in the spec's header. The planner attaches the file to Task 1's lane brief. Its browser probes `kgtest.cjs`, `flick3.cjs`, `semtest.cjs` and `sigtest.cjs` are the measurements reused as browser cases below. Every engine function cites the mockup function it ports, with the mockup line it starts at (for example `bfs` at `knowledge-graph-sigma.html:592`).

## Global Constraints

**Release and identity**
- **Release:** `release/knowledge-graph`, cut from `release/smoothness` after PR #952 lands. Every task branch is cut from `origin/release/knowledge-graph`, and its PR has base `release/knowledge-graph`. Never `main`.
- **Case ids:** `27.200`–`27.349` only, in `test-cases/27-knowledge-graph.md` under the section Task 1 seeds. Each task owns the sub-block in its title. Test names or comments carry the id. Ids are written as id LINES: `- ❌ **27.2xx — …**` (`test-cases/18-notes.md:23` shows the shape).
- **Naming:** "Knowledge Graph", everywhere a person reads it (owner).

**Numbers, copied verbatim from the spec**
- Clear cap `500` items; fog budget `2,000` items (§3.2).
- Default hops: desktop `2`, choices `1`–`4` and Everything (keys `1`–`4`); phone `1`, with no control (§3.1).
- Hover dimming: items to `32%`, edges to `8%`; an edge hover dims nothing (§3.5).
- Camera spring: τ = `85` ms; dt clamped to `100` ms; zoom `0.5×`–`4×` of the fit; rubber band power `0.3`; spring back `160` ms after the last input; glide `320` ms (§3.6).
- Phone tap targets: at least `32` px (§5).
- Ring radii, levels and minimum angles are the mockup's `CFG` (`knowledge-graph-sigma.html:602-606`), copied in Task 2.
- Endpoint: p95 ≤ `150` ms per ring at `500` items (§2.2, §7).
- Desktop frame rate at 500 clear + 2,000 fog + 3,000 edges: ≥ `60` fps, worst frame ≤ `16.7` ms (§7).
- Pinned exactly (no caret): `sigma@4.0.0-beta.7`, `@sigma/node-image@4.0.0-alpha.3`, `graphology@0.26.0` (§4.1).

**Copy rules** (exact strings)
- Knowledge Graph, Hops, Everything, Semantic layer, On, Off, Scope and links, Workspaces, Projects, All projects, Show links.
- Zoom in, Zoom out, Fit to view, Back, Center, From, To, Remove link, Direct links, Retry.
- `+N further out`.
- `N items within H hops, M more in the fog (K outside the scope)`: the fog and scope parts appear only when non-zero, and the singular is `1 hop`.
- `Center on <label>`.
- `Linked to <label>`.
- `Couldn't load the next hop. Retry`.
- `via Claude` (an edge whose `origin` is `mcp`).
- The canvas label: `Knowledge Graph of items linked to <label>`.

**What must not change**
- **No data writes** except spec A's "Remove link" (a `ticket.link_removed` through the existing ingest door). The semantic switch writes no event and no setting (ruling D6, §6.4).
- **Positions** are computed per view and never saved. There is no free node dragging (spec Assumptions).
- **The 16.81 tab contract** keeps its three tabs on every sheet mounted without the new slot; Task 9 amends 16.81 for the slot case only.

**Tests and tooling (house rules)**
- **Node 22** for `pnpm install` in a worktree.
- **Never pipe a test or build run into `head`.** Use `| tail -N` or `> /tmp/x.log 2>&1; tail -N /tmp/x.log`. Vitest runs take `--maxWorkers=2`.
- **Build before suites.** Web and app-core read `dist`: run `pnpm turbo run build --filter=<pkg>...` before a suite that imports a sibling.
- **App-core online changes** (Task 9's `online/graph.ts`) ⇒ also run the server integration files.
- **Every run quoted in a report is named as LOCAL.** CI runs only on the release→main PR.
- **Controls live in the same `it()`** as the case they guard. For example, a refusal also proves the same call with one input changed is accepted.
- **New event types:** this plan adds NONE. Spec A owns `ticket.link_*`; Task 8's "Remove link" only submits A's event. So no vocabulary census changes here, and Task 8 states that it checked.
- **Features.md §24 and `test-cases/27-knowledge-graph.md`** change in the same commit as the code. Cases start ❌ and flip ✅ with their covering test.
- **Browser cases** live ONLY in `packages/knowledge-graph-browser`.
  - It runs Chromium against its own Vite harness on port **3191**. 3190 is G-9's harness, and 3001 is the dev stack.
  - Headless Chrome renders in SwiftShader (about 5 fps), so every browser case waits for the camera to settle (`waitStill`, Task 1), never for a timer (§8).
- **Colours:** every colour is a `packages/ui` token read at mount (§3.7). Task 1 adds `packages/knowledge-graph/src` to the colour scan's `CLIENT_SOURCE_ROOTS` (`packages/ui/test/helpers/colour-scan.ts:24-31`), so a hex literal in the package fails `ui#test`.
- **Gate:**
  - The gate runs `turbo run build test typecheck` (`scripts/ctl/test/lib.test.sh:141-143` at G-9).
  - `packages/knowledge-graph` adds THREE tasks (`build`, `test`, `typecheck`); its `dist` is read by web. `packages/knowledge-graph-browser` adds TWO (`test`, `typecheck`).
  - Task 1 COUNTS the new total with `--dry=json` and pins THAT number everywhere G-9's diff touched. It is 34 + 5 = 39 if G-9 is not in the cut, and 36 + 5 = 41 if it is.

**Dependencies on specs A and B**
- `proj_ticket_links` (spec A §2.5) feeds the Blocks / Relates to / Duplicates groups.
- `proj_references` (spec B §2.1) feeds the Links in text group and the mention half of People.
- Task 6 (the route, and the end of the shim) needs A's and B's migration-and-projection tasks merged into `release/knowledge-graph`.
- **No other task needs A or B.** Task 1 measures the endpoint against a test-only shim that creates both tables `IF NOT EXISTS` with A's and B's DDL, copied byte for byte.
- Task 1 does need A's FIRST task (which creates Features §24 and `test-cases/27-knowledge-graph.md`), because this plan adds a sub-section to both.
- Concepts (spec D) have no table yet. The endpoint returns no concept items. The engine, renderer and view support them fully, and the harness fixture exercises them.

## Review Focus

1. **A hidden ticket in the middle of a chain** (visible A → hidden H → visible B, where B's only path to A is through H). H is absent, the edge A–H is absent, AND B is not returned at hop 2: the walk never steps through an item the viewer cannot see. The case is 27.293 (Task 6).
2. **Two centre changes in quick succession** (double-click X, then double-click Y before X's rings arrive). The view shows Y's rings only, and a late answer for X is dropped rather than drawn under Y's centre. The case is 27.318 (Task 7).
3. **The OS theme flips while the graph is open** (no `data-theme`, `prefers-color-scheme` changes). Card fills, edge colours AND the cached icon textures redraw in the new theme, and no light icon survives on a dark card. The case is 27.287 (Task 5).
4. **Very long names** (a 200-character ticket title, a note title with emoji, a person with one name).
   - The label and second line truncate.
   - The fit still frames every label.
   - The edge tooltip stays inside the canvas at its right and top edges.

   The cases are 27.225 (Task 2), 27.282 (Task 5), and 27.311 and 27.329 (Task 7).
5. **`localStorage` throws** (Safari with site data blocked). The view opens with the semantic layer On, the switch still turns it Off and On for the session, and nothing throws. The case is 27.324 (Task 7).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `packages/domain/src/graph.ts` (new) | Wire types (`GraphItemView`, `GraphEdgeView`, `GraphRingResponse`), the edge-kind → group table, the ring order shared by server and client | 1 |
| `packages/knowledge-graph/` (new: `package.json`, `tsconfig*.json`, `vitest.config.ts`, `src/index.ts`) | The package | 1 |
| `packages/knowledge-graph/src/render/palette.ts` (new) | `ThemePalette` type (colour values, never CSS names) | 1 |
| `packages/knowledge-graph/src/render/sigma/program.ts` (new) | The Sigma settings, primitives and styles (the measured config) | 1, 5 |
| `packages/knowledge-graph/src/render/sigma/icons.ts` (new) | The `layerImage` icon data URIs, per theme | 1 |
| `packages/knowledge-graph/test/seam.test.ts` (new) | Only `render/sigma/` imports sigma/graphology, by resolved imports | 1 |
| `packages/knowledge-graph-browser/` (new: harness, `stress.html`, Playwright config, `tests/*.spec.ts`) | Real-browser suite on the gate; the stress probe | 1, 5, 7, 8 |
| `apps/server/src/read/graph-neighbours.ts` (new) | `readGraphRing`: one ring, visibility per workspace, scope flags, order, page | 1, 6 |
| `apps/server/test/graph/perf.test.ts` (new) | `KG_PERF=1` p95 per ring | 1, 6 |
| `packages/knowledge-graph/src/engine/{model,walk,zones,layout,levels,sentences}.ts` (new) | The pure graph engine | 2 |
| `packages/knowledge-graph/src/engine/{camera,wheel,fit,glide}.ts` (new) | The pure motion engine | 3 |
| `packages/ui/src/tokens.ts`, `packages/ui/test/tokens.test.ts` | 12 roles (the spec's 11 + the card hairline), 10 primitives, contrast pairs | 4 |
| `packages/knowledge-graph/src/render/renderer.ts` (new) | The `GraphRenderer` seam + `RendererProbe` | 5 |
| `packages/knowledge-graph/src/render/sigma/{adapter,camera-driver,rings,attachment-cache}.ts` (new) | The Sigma adapter and every §4.2 trap | 5 |
| `apps/server/src/routes/graph.ts` (new), `apps/server/src/app.ts` | `GET /v1/graph/neighbours` | 6 |
| `apps/server/src/read/notes.ts`, `read/ticket-cards.ts` | Export `NOTE_PROJECT_LIVE_WHERE` and `cardKeysFor` (one-word changes) | 1 |
| `packages/knowledge-graph/src/react/{knowledge-graph,graph-bar,use-graph-rings,semantic-pref,theme}.tsx?` (new) | The view: rings, bar, scope, filters, hops, trail, keys, states, semantic switch, phone bar | 7 |
| `packages/knowledge-graph/src/react/{inspector,edge-inspector,graph-list}.tsx` (new) | Item and edge inspectors, the accessible list | 8 |
| `packages/app-core/src/online/graph.ts` (new), `online/index.ts` | `createHttpGraphGateway` | 9 |
| `packages/app-core/src/views/ticket-sheet.tsx`, `test/views/ticket-sheet.test.tsx` | The fourth tab through `knowledgeGraphSlot` | 9 |
| `apps/web/src/knowledge-graph/{ticket-graph-tab,note-graph-panel}.tsx` (new), `apps/web/src/providers.tsx`, the three `<TicketSheet>` hosts, `apps/web/src/notes/{note-document,note-byline}.tsx` | Wiring | 9 |
| `packages/ui/src/ui.css` (`/* KG: … */` blocks) | Bar, inspector, list, canvas CSS | 1 (seed), 7, 8 |
| `scripts/ctl/verbs/gate.sh`, `scripts/ctl/test/lib.test.sh`, `docs/lanes/gate-lock/README.md`, `test-cases/13-deploy-and-ops.md`, `.github/workflows/ci.yml`, `scripts/check-case-citations.mjs`, `turbo.json`, `packages/ui/test/helpers/colour-scan.ts` | The gate count, Chromium in CI, citations, cache inputs, colour scan | 1 |
| `test-cases/27-knowledge-graph.md`, `Features.md` §24, `docs/manual.md` | Catalogue and help | each task its own lines; manual in 9 |

**Order and parallelism:**
- **Task 1** first. Its two STOP-AND-REPORT bars are reported to the owner before any other task merges.
- **Tasks 2, 3 and 4** are independent (different files) and run in parallel after Task 1.
- **Task 5** needs 2, 3 and 4.
- **Task 6** needs Task 1 and A's and B's table tasks. It can run in parallel with 2–5.
- **Task 7** needs 5.
- **Task 8** needs 7.
- **Task 9** needs 6 and 8.

---

### Task 1: Measure first: the packages, the seam, the stress probe, the endpoint read, and both STOP-AND-REPORT bars (cases 27.200–27.211)

This task builds only what the two bars need, and builds it as the shape that ships:
- **The stress scene** draws through `render/sigma/program.ts`, which IS the shipped Sigma configuration (icons through `layerImage`, label attachments, dashed edges). It is not the mockup's simplified stress styles (`sigma-v4-check.html:458-475`).
- **The endpoint is measured on the real read**, `readGraphRing`, against a test-only shim of A's and B's tables.

Stop after Step 9 and after Step 14, and report each number to the owner. No other task of this plan merges until both reports are answered.

**Depends on:** Plan A's first task merged (it creates Features §24 and `test-cases/27-knowledge-graph.md`). Nothing else from A or B.

**Files:**
- Create:
  - `packages/domain/src/graph.ts`
  - `packages/domain/test/graph.test.ts`
  - `packages/knowledge-graph/package.json`
  - `packages/knowledge-graph/tsconfig.json`
  - `packages/knowledge-graph/tsconfig.typecheck.json`
  - `packages/knowledge-graph/vitest.config.ts`
  - `packages/knowledge-graph/test/setup.ts`
  - `packages/knowledge-graph/src/index.ts`
  - `packages/knowledge-graph/src/render/palette.ts`
  - `packages/knowledge-graph/src/render/node-attributes.ts`
  - `packages/knowledge-graph/src/render/sigma/program.ts`
  - `packages/knowledge-graph/src/render/sigma/icons.ts`
  - `packages/knowledge-graph/src/render/initials.ts`
  - `packages/knowledge-graph/src/render/sigma/stress-scene.ts`
  - `packages/knowledge-graph/test/seam.test.ts`
  - `packages/knowledge-graph-browser/{package.json,tsconfig.json,vite.config.ts,playwright.config.ts}`
  - `packages/knowledge-graph-browser/harness/{index.html,stress.html,stress.ts,mockup-palette.ts}`
  - `packages/knowledge-graph-browser/tests/{helpers.ts,stress.spec.ts}`
  - `apps/server/src/read/graph-neighbours.ts`
  - `apps/server/test/graph/perf.test.ts`
  - `apps/server/test/graph/shim.ts`
- Modify:
  - `packages/domain/src/index.ts` (one `export *` line)
  - `apps/server/src/read/notes.ts:25`: export `NOTE_PROJECT_LIVE_WHERE`
  - `apps/server/src/read/ticket-cards.ts`: export `cardKeysFor` and widen its row type (below)
  - `packages/ui/test/helpers/colour-scan.ts:24-31` (`CLIENT_SOURCE_ROOTS`) and `turbo.json` (`@gisik-nokma/ui#test` inputs): add `packages/knowledge-graph/src`
  - `packages/ui/src/ui.css`: seed the `/* KG: … */` blocks
  - The gate count, everywhere G-9's T1 diff touched it: `scripts/ctl/verbs/gate.sh:50`, `scripts/ctl/test/lib.test.sh` (every fixture `Tasks:` line, the 13.1702 pattern, the 13.1716 arms and control), `docs/lanes/gate-lock/README.md` (the two `Tasks:` lines and "not 36/36"), `test-cases/13-deploy-and-ops.md` (13.1702, 13.1716) and the Features gate bullet
  - `.github/workflows/ci.yml`: the Chromium install line, beside G-9's
  - `scripts/check-case-citations.mjs` `isTestPath`: add `packages/knowledge-graph-browser/tests/`
  - `test-cases/27-knowledge-graph.md`, `Features.md` §24

**Interfaces:**
- **Produces:**
  - `@gisik-nokma/domain` exports:
    - the item and edge types: `GraphItemKind`, `GraphEdgeKind`, `GraphGroup`, `GraphItemView`, `GraphEdgeView`, `GraphRingResponse`;
    - the tables and limits: `GRAPH_ITEM_KINDS`, `GRAPH_EDGE_KINDS`, `GRAPH_GROUPS` (rank order), `GRAPH_CHIP_ORDER` (display order), `GROUP_OF_EDGE_KIND`, `GROUP_RANK`, `GROUP_LABEL`, `GRAPH_MAX_HOPS = 8`, `GRAPH_RING_PAGE = 2000`;
    - the helpers: `graphRef(kind, id)`, `parseGraphRef(ref)`, `compareRingEntries(a, b)`, `type GraphScope`, `inGraphScope(item, scope)`.
  - `@gisik-nokma/knowledge-graph` exports `ThemePalette`, `PALETTE_ROLES`, `Level`, `NodeAttributes`, `EdgeAttributes`. Its `./stress` subpath exports `runStress(container, palette, opts)`.
  - `render/sigma/program.ts` exports:
    - `createSigma(graph, container, palette: () => ThemePalette, flags: ViewFlags)`;
    - `EDGE_ROLE`, `DASH`, `SOLID`.
  - `render/sigma/icons.ts` exports `iconUri(spec: IconSpec, palette: ThemePalette): string`. `IconSpec` lives in `render/node-attributes.ts`, and `initialsOf(name)` in `render/initials.ts`: both are outside the seam because the view uses them.
  - `apps/server/src/read/graph-neighbours.ts` exports:
    - `readGraphRing(db, viewerId, req: GraphRingRequest): Promise<GraphRingResponse | null>`;
    - `type GraphRingRequest`;
    - `createGraphVisibility(db, viewerId)`.
  - The harness URL: `http://localhost:3191/stress.html`.
  - The helper `waitStill(page, read)`.
- **Consumes:**
  - `visibleTicketsWhere`, `visibleNotesWhere`, `LIVE_TICKET_WHERE` (`read/visible-where.ts:136`, `:294`, `:231`);
  - `visibleProjects` (`read/visible-projects.ts:211`);
  - `requireMember` (`read/membership.ts:60`);
  - `readActorNames` / `readActorNamesForGuest` (`routes/builder-reads.ts`), chosen per role exactly as `builder-reads.ts:814-817` chooses;
  - `workspaceIdentityFromLedger` (`workspaces/workspace-name.ts:100`);
  - `SqlParams` (`read/sql-params.ts`).

- [ ] **Step 1: Seed the shared regions**

  1. `test-cases/27-knowledge-graph.md`: re-read it (Plan A created it). After the last existing section, append `## 27.2 Knowledge Graph view (spec C), 27.200–27.349`, followed by nine anchor lines `<!-- KG-C T1 -->` … `<!-- KG-C T9 -->`. Each task writes its cases directly below its own anchor.
  2. `Features.md` §24: append a `### Knowledge Graph view (spec C)` sub-heading and one line `<!-- KG-C bullet -->`.
  3. `packages/ui/src/ui.css`: at the end of the last component section (re-read the file; never an EOF append below a trailing block comment), add four empty blocks: `/* KG: T7 view+bar */`, `/* KG: T8 inspector+list */`, `/* KG: T9 tab+panel */`, `/* KG: end */`.

  Commit: `KG-C T1: seed per-task regions (catalogue, Features, ui.css)`.

- [ ] **Step 2: The wire types in `packages/domain/src/graph.ts`, test first**

  `packages/domain/test/graph.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { GRAPH_EDGE_KINDS, GRAPH_GROUPS, GROUP_OF_EDGE_KIND, GROUP_RANK, compareRingEntries, graphRef, inGraphScope, parseGraphRef } from '../src/graph.js';

  describe('27.200 the graph wire vocabulary', () => {
    it('27.200 every edge kind has a group, refs round-trip, and the ring order is typed links → structure → references → people, newest first; control: an unknown kind and an empty id are refused', () => {
      for (const kind of GRAPH_EDGE_KINDS) expect(GRAPH_GROUPS).toContain(GROUP_OF_EDGE_KIND[kind]);
      expect(parseGraphRef(graphRef('ticket', '01JABC'))).toEqual({ kind: 'ticket', id: '01JABC' });
      expect(parseGraphRef('ticket:a:b')).toEqual({ kind: 'ticket', id: 'a:b' });
      // spec §2.2: typed links first, then structure, then references, then people
      expect(GROUP_RANK.blocks).toBeLessThan(GROUP_RANK.structure);
      expect(GROUP_RANK.structure).toBeLessThan(GROUP_RANK.ref);
      expect(GROUP_RANK.ref).toBeLessThan(GROUP_RANK.people);
      const sorted = [
        { ref: 'ticket:01A', rank: GROUP_RANK.people },
        { ref: 'ticket:01B', rank: GROUP_RANK.blocks },
        { ref: 'note:01C', rank: GROUP_RANK.blocks },
      ].sort(compareRingEntries).map((entry) => entry.ref);
      expect(sorted).toEqual(['note:01C', 'ticket:01B', 'ticket:01A']); // 01C is newer than 01B: newest first within a group
      // control
      expect(parseGraphRef('widget:01A')).toBeNull();
      expect(parseGraphRef('ticket:')).toBeNull();
      expect(parseGraphRef('01A')).toBeNull();
    });
  });

  describe('27.201 C-scope', () => {
    const scope = { workspaceIds: ['w1'], projectIds: ['p1'] };
    const item = (over: Partial<{ kind: 'ticket' | 'note' | 'person' | 'project' | 'workspace' | 'concept'; id: string; workspaceId: string | null; projectId: string | null }>) =>
      ({ kind: 'ticket' as const, id: 'x', workspaceId: 'w1', projectId: 'p1', ...over });
    it('27.201 in scope: a ticket in a chosen project, a workspace-level note, a person anywhere, the workspace itself; control: the same ticket in another project, and in another workspace, is out', () => {
      expect(inGraphScope(item({}), scope)).toBe(true);
      expect(inGraphScope(item({ kind: 'note', projectId: null }), scope)).toBe(true);
      expect(inGraphScope(item({ kind: 'person', workspaceId: null, projectId: null }), scope)).toBe(true);
      expect(inGraphScope(item({ kind: 'workspace', id: 'w1', projectId: null }), scope)).toBe(true);
      expect(inGraphScope(item({ kind: 'project', id: 'p1' }), scope)).toBe(true);
      expect(inGraphScope(item({}), { workspaceIds: ['w1'], projectIds: [] })).toBe(true); // no project chosen = all projects
      // control
      expect(inGraphScope(item({ projectId: 'p2' }), scope)).toBe(false);
      expect(inGraphScope(item({ kind: 'project', id: 'p2' }), scope)).toBe(false);
      expect(inGraphScope(item({ workspaceId: 'w2' }), scope)).toBe(false);
    });
  });
  ```
  Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/graph.test.ts --maxWorkers=2 > /tmp/kg-t1-dom.log 2>&1; tail -15 /tmp/kg-t1-dom.log`
  Expected: FAIL (module not found).

  `packages/domain/src/graph.ts`:
  ```ts
  import type { StateCategory } from './workflow.js';

  /**
   * The Knowledge Graph's wire vocabulary (spec C §2), shared by the server's ring read and the client engine.
   * The ring ORDER lives here for that reason: the server's page cut and the client's 500-item cap must cut
   * by the same order (§2.2, §3.2), so there is one comparator.
   */
  export const GRAPH_ITEM_KINDS = ['ticket', 'note', 'person', 'project', 'workspace', 'concept'] as const;
  export type GraphItemKind = (typeof GRAPH_ITEM_KINDS)[number];

  export const GRAPH_EDGE_KINDS = ['in', 'parent', 'blocks', 'relates', 'duplicates', 'attached', 'ref', 'mention', 'assignee', 'tag'] as const;
  export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number];

  /**
   * The filter groups in RING ORDER (spec §2.2): typed links, then structure (parent, attachments, containment),
   * then references, then people, then concepts. NOT the mockup's `GROUPS_ALL` order
   * (`knowledge-graph-sigma.html:554`, structure before typed links, label order within): the spec rules.
   */
  export const GRAPH_GROUPS = ['blocks', 'relates', 'dup', 'structure', 'attached', 'projects', 'ref', 'people', 'concepts'] as const;
  export type GraphGroup = (typeof GRAPH_GROUPS)[number];

  /** The chips' DISPLAY order, which is the mockup's (`knowledge-graph-sigma.html:554`). */
  export const GRAPH_CHIP_ORDER: readonly GraphGroup[] = ['projects', 'structure', 'blocks', 'relates', 'dup', 'attached', 'ref', 'people', 'concepts'];

  export const GROUP_OF_EDGE_KIND: Record<GraphEdgeKind, GraphGroup> = {
    in: 'projects',
    parent: 'structure',
    blocks: 'blocks',
    relates: 'relates',
    duplicates: 'dup',
    attached: 'attached',
    ref: 'ref',
    mention: 'people',
    assignee: 'people',
    tag: 'concepts',
  };

  export const GROUP_RANK = Object.fromEntries(GRAPH_GROUPS.map((group, index) => [group, index])) as Record<GraphGroup, number>;

  export const GROUP_LABEL: Record<GraphGroup, string> = {
    projects: 'Projects',
    structure: 'Parent and subtasks',
    blocks: 'Blocks',
    relates: 'Relates to',
    dup: 'Duplicates',
    attached: 'Attached notes',
    ref: 'Links in text',
    people: 'People',
    concepts: 'Concepts',
  };

  /** Rings past this are refused by the endpoint. "Everything" stops here too: 7 clear rings and 1 of fog. */
  export const GRAPH_MAX_HOPS = 8;
  /** One page of one ring. The fog budget (§3.2): a ring is never more than this much fog. */
  export const GRAPH_RING_PAGE = 2000;

  export type GraphItemView = {
    ref: string;
    kind: GraphItemKind;
    id: string;
    /** null for a person: people cross workspaces. */
    workspaceId: string | null;
    /** null for a workspace-level note, a workspace, a person or a concept. */
    projectId: string | null;
    /** The ticket key, a note's title, a person's display name, a project's or workspace's name. */
    label: string;
    /** A ticket's or note's title; null otherwise. */
    title: string | null;
    category: StateCategory | null;
    hop: number;
    /** Outside the chosen workspaces/projects: drawn as fog and never walked past (C-scope). */
    out: boolean;
    /** A concept suggestion (spec D); always false until D. */
    suggested: boolean;
  };

  export type GraphEdgeView = {
    /** `${kind}|${from}|${to}`: one edge per kind per ordered pair. */
    id: string;
    kind: GraphEdgeKind;
    /** The source item's ref; the sentence reads from here (§2.1). */
    from: string;
    to: string;
    /** A reference's or mention's snippet, the reference marked `[[…]]` (spec B §2.1). */
    snippet: string | null;
    /** A display name, never a user id. */
    addedBy: string | null;
    addedAt: string | null;
    /** The ledger origin of a typed link (`'mcp'` → "via Claude"); null where the table records none. */
    origin: string | null;
    suggested: boolean;
  };

  export type GraphRingResponse = {
    hop: number;
    items: GraphItemView[];
    edges: GraphEdgeView[];
    /** The refs in this page that may be walked from (in scope). */
    frontier: string[];
    truncated: boolean;
    cursor: string | null;
  };

  export function graphRef(kind: GraphItemKind, id: string): string {
    return `${kind}:${id}`;
  }

  export function parseGraphRef(ref: string): { kind: GraphItemKind; id: string } | null {
    const at = ref.indexOf(':');
    if (at <= 0) return null;
    const kind = ref.slice(0, at);
    const id = ref.slice(at + 1);
    if (id === '' || !(GRAPH_ITEM_KINDS as readonly string[]).includes(kind)) return null;
    return { kind: kind as GraphItemKind, id };
  }

  export type RingEntry = { ref: string; rank: number };

  /** Spec §2.2: by group rank, then newest first (ids are ULIDs, so a larger id is newer), then by ref for a total order. */
  export function compareRingEntries(a: RingEntry, b: RingEntry): number {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const ia = a.ref.slice(a.ref.indexOf(':') + 1);
    const ib = b.ref.slice(b.ref.indexOf(':') + 1);
    if (ia !== ib) return ia < ib ? 1 : -1;
    return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
  }

  export type GraphScope = { workspaceIds: readonly string[]; projectIds: readonly string[] };

  /**
   * C-scope, ported from the mockup's `inScope` (`knowledge-graph-sigma.html:717-718`). ONE rule for the server's `out`
   * flag and the client's re-walk. A person is always in scope (people belong to no workspace); a workspace-level note
   * (projectId null) follows its workspace; a project item is in scope when it is one of the chosen projects.
   */
  export function inGraphScope(item: Pick<GraphItemView, 'kind' | 'id' | 'workspaceId' | 'projectId'>, scope: GraphScope): boolean {
    if (item.kind === 'person') return true;
    if (item.workspaceId === null || !scope.workspaceIds.includes(item.workspaceId)) return false;
    if (item.kind === 'workspace' || item.kind === 'concept' || scope.projectIds.length === 0) return true;
    if (item.kind === 'project') return scope.projectIds.includes(item.id);
    return item.projectId === null || scope.projectIds.includes(item.projectId);
  }
  ```
  Add `export * from './graph.js';` to `packages/domain/src/index.ts` after `export * from './workflow-helpers.js';`.

  Run the test again. Expected: PASS. Commit.

- [ ] **Step 3: Create `packages/knowledge-graph`**

  `package.json`:
  ```json
  {
    "name": "@gisik-nokma/knowledge-graph",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "./stress": { "types": "./dist/render/sigma/stress-scene.d.ts", "default": "./dist/render/sigma/stress-scene.js" }
    },
    "scripts": {
      "build": "tsc -p tsconfig.json",
      "test": "vitest run",
      "typecheck": "tsc -p tsconfig.typecheck.json"
    },
    "peerDependencies": { "react": "^19.0.0", "react-dom": "^19.0.0" },
    "dependencies": {
      "@gisik-nokma/domain": "workspace:*",
      "@gisik-nokma/ui": "workspace:*",
      "@sigma/node-image": "4.0.0-alpha.3",
      "graphology": "0.26.0",
      "sigma": "4.0.0-beta.7"
    },
    "devDependencies": {
      "@testing-library/jest-dom": "^6.6.3",
      "@testing-library/react": "^16.2.0",
      "@testing-library/user-event": "^14.6.1",
      "@types/node": "^22.10.0",
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "graphology-types": "<the exact version graphology@0.26.0's peerDependencies names>",
      "jsdom": "^25.0.1",
      "react": "^19.0.0",
      "react-dom": "^19.0.0",
      "typescript": "^5.6.3",
      "vitest": "^3.1.0"
    }
  }
  ```
  - Every range except the three pins is copied from `packages/ui/package.json`.
  - Read `graphology-types`' version with `pnpm view graphology@0.26.0 peerDependencies` and pin it exactly.
  - The three pins have NO caret (§4.1).

  `tsconfig.json` and `tsconfig.typecheck.json` are `packages/ui`'s two files verbatim (`outDir: dist`, `rootDir: src`, `jsx: react-jsx`, `lib: ES2023 + DOM`; typecheck includes `src` and `test`). `vitest.config.ts` is `packages/ui/vitest.config.ts` verbatim. `test/setup.ts` is `import '@testing-library/jest-dom/vitest';` (copy `packages/ui/test/setup.ts` if it says more).

  `src/render/palette.ts`:
  ```ts
  /**
   * Colour VALUES, read from the app's tokens at mount and on a theme change (spec §3.7). Sigma draws in WebGL and reads
   * values, never CSS variables (`knowledge-graph-sigma.html:460`). The keys ARE `packages/ui` token role names, so the
   * reader is `cssVariableName(role)` (Task 7); Task 4 adds the twelve graph roles.
   */
  export const PALETTE_ROLES = [
    'text', 'textMuted', 'textSubtle', 'surfaceRaised', 'surfaceSunken', 'shadow',
    'categoryOpen', 'categoryActive', 'categoryTerminal',
    'edgeStructure', 'edgeBlocks', 'edgeRelates', 'edgeDuplicates', 'edgeAttached', 'edgeReference', 'edgePeople', 'edgeConcept',
    'conceptFill', 'conceptSoft', 'fogDot', 'graphCardLine',
  ] as const;
  export type PaletteRole = (typeof PALETTE_ROLES)[number];
  export type ThemePalette = Record<PaletteRole, string> & { dark: boolean };
  ```

  `src/render/node-attributes.ts`:
  ```ts
  import type { GraphGroup, GraphItemKind, StateCategory } from '@gisik-nokma/domain';

  /** Levels of detail by hop (spec §3.3). `cardS` is the phone's centre card (`knowledge-graph-sigma.html:604`). */
  export type Level = 'card' | 'cardS' | 'chip' | 'tap' | 'compact' | 'dot';

  /** What a drawn node carries. Sigma's display data keeps only declared style keys (§4.2 trap 4), so these are read through styles. */
  export type NodeAttributes = {
    x: number;
    y: number;
    ref: string;
    kind: GraphItemKind;
    fog: boolean;
    lv: Level | 'fog';
    center: boolean;
    lbl: string;
    sub: string | null;
    image: string;
    sug: boolean;
    cat: StateCategory | null;
  };

  export type EdgeAttributes = { id: string; grp: GraphGroup; fog: boolean; sug: boolean; on: boolean };

  /** A node's icon (spec §3.4), drawn by `layerImage` from `render/sigma/icons.ts`. Declared here, outside the seam, because the view chooses it. */
  export type IconSpec = { kind: 'person'; initials: string } | { kind: 'note' } | { kind: 'folder' };
  ```

  `src/render/sigma/icons.ts` (port of `iconURI`, `knowledge-graph-sigma.html:467-473`; colours from the palette, never literals):
  ```ts
  import type { IconSpec } from '../node-attributes.js';
  import type { ThemePalette } from '../palette.js';
  export { initialsOf } from '../initials.js';

  const cache = new Map<string, string>();
  const escapeXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

  /** One data URI per (icon, palette): a theme change yields NEW URIs, so the texture cache cannot serve a stale theme (Review Focus 3). */
  export function iconUri(spec: IconSpec, P: ThemePalette): string {
    const key = `${spec.kind}|${spec.kind === 'person' ? spec.initials : ''}|${P.textMuted}|${P.surfaceSunken}|${P.surfaceRaised}|${P.text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const stroke = `fill="none" stroke="${P.textMuted}" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"`;
    const body =
      spec.kind === 'person'
        ? `<circle cx="32" cy="32" r="32" fill="${P.surfaceSunken}"/><text x="32" y="40.5" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Helvetica,sans-serif" font-size="23" font-weight="700" fill="${P.text}">${escapeXml(spec.initials)}</text>`
        : spec.kind === 'note'
          ? `<circle cx="32" cy="32" r="32" fill="${P.surfaceRaised}"/><path d="M20 13h16l10 10v28H20z" ${stroke}/><path d="M36 13v10h10" ${stroke}/>`
          : `<circle cx="32" cy="32" r="32" fill="${P.surfaceSunken}"/><path d="M13 21.5a3 3 0 0 1 3-3h9l3.5 4h19.5a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3z" ${stroke}/>`;
    const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${body}</svg>`);
    cache.set(key, uri);
    return uri;
  }
  ```
  `src/render/initials.ts` (the mockup's `initials`, `:474`). It lives outside `render/sigma/` so the view (Task 7) can use it without crossing the seam:
  ```ts
  export function initialsOf(name: string): string {
    return name.split(' ').filter((word) => word !== '').map((word) => [...word][0]).join('').slice(0, 2).toUpperCase();
  }
  ```

  `src/render/sigma/program.ts` is the port of the `new Sigma(...)` block (`knowledge-graph-sigma.html:775-811`). It is the ONE place the Sigma configuration lives: the stress scene measures it here and Task 5's adapter mounts it.
  ```ts
  import Sigma, { DEFAULT_STYLES } from 'sigma';
  import { extremityArrow, layerDashed, layerFill, pathLine, sdfCircle, sdfSquare } from 'sigma/rendering';
  import { layerImage } from '@sigma/node-image';
  import type Graph from 'graphology';
  import type { GraphGroup } from '@gisik-nokma/domain';
  import type { EdgeAttributes, Level, NodeAttributes } from '../node-attributes.js';
  import type { PaletteRole, ThemePalette } from '../palette.js';

  export type ViewFlags = { nodeHovered: () => boolean; highlightOn: () => boolean };

  const big = (lv: Level | 'fog') => lv === 'card' || lv === 'cardS';
  const mid = (lv: Level | 'fog') => lv === 'chip' || lv === 'tap';
  /** Trap 2 (§4.2): a gap of 0 draws nothing, so a SOLID edge is dash 10000 / gap 0.2. */
  export const SOLID: readonly [number, number] = [10000, 0.2];
  export const DASH: Partial<Record<GraphGroup, readonly [number, number]>> = { relates: [7, 5], dup: [2, 5], ref: [1.5, 5] };
  export const EDGE_ROLE: Record<GraphGroup, PaletteRole> = {
    projects: 'textSubtle', structure: 'edgeStructure', blocks: 'edgeBlocks', relates: 'edgeRelates', dup: 'edgeDuplicates',
    attached: 'edgeAttached', ref: 'edgeReference', people: 'edgePeople', concepts: 'edgeConcept',
  };
  const escapeXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

  /** Trap 3: the card's second line is an SVG label attachment; ONE name per theme (`subL` / `subD`) because attachments are cached textures. */
  function subLabel(palette: () => ThemePalette) {
    return ({ attributes }: { attributes: NodeAttributes }) => {
      const text = attributes.sub ?? '';
      const width = Math.ceil(text.length * 6.9) + 6;
      return {
        type: 'svg' as const,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="17"><text x="1" y="13" font-family="-apple-system,BlinkMacSystemFont,Helvetica,sans-serif" font-size="12.5" fill="${palette().textMuted}">${escapeXml(text)}</text></svg>`,
      };
    };
  }

  export function createSigma(
    graph: Graph<NodeAttributes, EdgeAttributes>,
    container: HTMLElement,
    palette: () => ThemePalette,
    flags: ViewFlags,
  ): Sigma {
    const P = palette;
    const sub = subLabel(palette);
    return new Sigma(graph, container, {
      primitives: {
        nodes: {
          variables: { image: { type: 'string', default: '' } }, // trap 4: icons are a declared node variable
          shapes: [sdfCircle(), sdfSquare()],
          layers: [layerFill(), layerImage({ drawingMode: 'image', textureManagerOptions: { size: { mode: 'force', value: 64 }, objectFit: 'contain' } })],
          labelAttachments: { subL: sub, subD: sub },
        },
        edges: {
          variables: { dash: { type: 'number', default: 0 }, gap: { type: 'number', default: 0 } },
          paths: [pathLine()],
          extremities: [extremityArrow()],
          layers: [layerDashed({ dashSize: { attribute: 'dash', mode: 'pixels' }, gapSize: { attribute: 'gap', mode: 'pixels' }, gapColor: 0, align: 0, solidExtremities: true })],
        },
      },
      customNodeState: { isNb: false, isSel: false, isHl: false },
      customEdgeState: { isNb: false, isSel: false },
      styles: {
        nodes: [
          DEFAULT_STYLES.nodes,
          {
            shape: (a: NodeAttributes) => ((a.kind === 'note' || a.kind === 'workspace' || a.kind === 'project') && !a.fog && !a.image ? 'square' : 'circle'),
            // trap 10: the centre card is size 1, label OVER it, so arrows into it stay visible
            size: (a: NodeAttributes) =>
              a.center && a.kind !== 'person' ? 1 : a.fog ? 3 : a.kind === 'person' ? (a.lv === 'dot' ? 5 : big(a.lv) || mid(a.lv) ? 16 : 12)
              : a.lv === 'dot' ? 3.5 : a.image ? (big(a.lv) || mid(a.lv) ? 9.5 : 8) : a.kind === 'workspace' ? 7 : big(a.lv) ? 5.5 : 4.5,
            color: (a: NodeAttributes) =>
              a.fog ? P().fogDot : a.image ? (a.kind === 'note' ? P().surfaceRaised : P().surfaceSunken) : a.kind === 'person' ? P().edgePeople
              : a.kind === 'note' || a.kind === 'workspace' || a.kind === 'project' ? P().textSubtle : a.kind === 'concept' ? P().edgeConcept
              : a.cat === 'terminal' ? P().categoryTerminal : a.cat === 'active' ? P().categoryActive : P().categoryOpen,
            // trap 9: only an ITEM hover dims (our flag); an edge hover just thickens the edge
            opacity: (a: NodeAttributes, s: { isHovered: boolean; isNb: boolean; isHl: boolean }) =>
              a.fog ? 0.9 : flags.highlightOn() ? (s.isHl ? 1 : 0.25) : flags.nodeHovered() && !s.isHovered && !s.isNb ? 0.32 : 1,
            label: (a: NodeAttributes) => a.lbl,
            labelPosition: (a: NodeAttributes) => (a.kind === 'person' ? 'below' : a.center ? 'over' : 'right'),
            labelVisibility: (a: NodeAttributes) => (a.lbl ? 'visible' : 'hidden'),
            labelColor: () => P().text,
            labelSize: (a: NodeAttributes) => (a.center ? 15 : 12.5),
            labelFont: '-apple-system,BlinkMacSystemFont,"SF Pro Text",Helvetica,sans-serif',
            image: (a: NodeAttributes) => a.image || '',
            labelAttachment: (a: NodeAttributes) => (a.sub ? (P().dark ? 'subD' : 'subL') : null),
            labelAttachmentPlacement: 'below',
            backdropVisibility: (a: NodeAttributes, s: { isHovered: boolean; isSel: boolean }) => (!a.fog && a.lv !== 'dot' && (a.kind !== 'person' || s.isHovered || s.isSel) ? 'visible' : 'hidden'),
            backdropArea: 'both',
            // 'tap' is 10, not the mockup's 7 (`:791`): 12.5 px text + 2 × 7 = 26.5 px, under spec §5's 32 px target; + 2 × 10 = 32.5
            backdropPadding: (a: NodeAttributes) => (big(a.lv) || a.lv === 'tap' ? 10 : a.lv === 'compact' ? 4 : 7),
            backdropCornerRadius: (a: NodeAttributes) => (a.kind === 'concept' ? 16 : big(a.lv) ? 12 : 9),
            backdropColor: (a: NodeAttributes) => (a.kind === 'concept' ? (a.sug ? P().conceptSoft : P().conceptFill) : a.kind === 'workspace' || a.kind === 'project' ? P().surfaceSunken : P().surfaceRaised),
            backdropBorderColor: (a: NodeAttributes, s: { isSel: boolean; isHl: boolean }) =>
              s.isSel || (s.isHl && flags.highlightOn()) || a.center ? P().text : a.kind === 'concept' ? P().edgeConcept : P().graphCardLine,
            backdropBorderWidth: (a: NodeAttributes, s: { isSel: boolean; isHl: boolean }) => (s.isSel ? 3 : s.isHl && flags.highlightOn() ? 2.5 : a.center ? 2 : 1),
            backdropShadowColor: () => P().shadow,
            backdropShadowBlur: (a: NodeAttributes) => (a.center ? 18 : 6),
            cursor: (a: NodeAttributes) => (a.fog ? 'default' : 'pointer'),
            zIndex: (a: NodeAttributes, s: { isSel: boolean }) => (s.isSel || a.center ? 3 : a.fog ? 0 : 1),
          },
        ],
        edges: [
          DEFAULT_STYLES.edges,
          {
            color: (a: EdgeAttributes) => P()[EDGE_ROLE[a.grp]],
            dash: (a: EdgeAttributes) => (a.fog ? 2 : a.sug ? 3 : (DASH[a.grp] ?? SOLID)[0]),
            gap: (a: EdgeAttributes) => (a.fog ? 4 : a.sug ? 4 : (DASH[a.grp] ?? SOLID)[1]),
            size: (a: EdgeAttributes, s: { isHovered: boolean; isSel: boolean }) =>
              s.isHovered || s.isSel ? 3.4 : a.on ? 3 : a.fog ? 1.2 : a.grp === 'blocks' || a.grp === 'ref' ? 2.2 : a.grp === 'people' ? 1.3 : a.grp === 'projects' ? 1.1 : 1.7,
            opacity: (a: EdgeAttributes, s: { isHovered: boolean; isSel: boolean; isNb: boolean }) =>
              s.isHovered || s.isSel ? 1 : a.fog ? 0.22 : flags.highlightOn() ? 0.12 : flags.nodeHovered() ? (s.isNb ? 1 : 0.08) : a.grp === 'projects' ? 0.55 : a.on ? 1 : a.sug ? 0.6 : 0.45,
            head: (a: EdgeAttributes) => (!a.fog && (a.grp === 'blocks' || a.grp === 'ref') ? 'arrow' : 'none'),
            label: '',
            labelVisibility: 'hidden', // trap 11: Sigma draws edge labels rotated, so the sentence is a DOM tooltip
            cursor: (a: EdgeAttributes) => (a.fog ? 'default' : 'pointer'),
            zIndex: (a: EdgeAttributes, s: { isHovered: boolean; isSel: boolean }) => (s.isHovered || s.isSel || a.on ? 2 : 0),
          },
        ],
      },
      settings: {
        itemSizesReference: 'screen', // trap 5: sizes in screen pixels
        zoomToSizeRatioFunction: () => 1,
        autoRescale: false,
        enableEdgeEvents: true,
        nodeLabelEvents: 'extend', // trap 6: the label is clickable, not only the dot
        renderEdgeLabels: false,
        labelRenderedSizeThreshold: 0,
        labelDensity: 10,
        stagePadding: 0,
        zoomDuration: 250,
        doubleClickZoomingRatio: 2,
      },
    });
  }
  ```
  **Typing rule.** The beta's style typings are generic over the primitives. If `tsc` rejects one style's parameter types, cast THAT property, with a comment naming `sigma@4.0.0-beta.7`. Never cast the whole options object to `any`; record each cast in DONE.

  **The sizes table.** Copy the `size` expression from `knowledge-graph-sigma.html:782` character for character, and diff it against the line above.

  `src/render/sigma/stress-scene.ts` (port of `stress()`, `sigma-v4-check.html:458-475`, but drawn through `createSigma`, so it carries the shipped styles, icons and attachments):
  ```ts
  import Graph from 'graphology';
  import type { EdgeAttributes, NodeAttributes } from '../node-attributes.js';
  import type { ThemePalette } from '../palette.js';
  import { iconUri } from './icons.js';
  import { initialsOf } from '../initials.js';
  import { createSigma } from './program.js';

  export type StressResult = { cards: number; fog: number; edges: number; fps: number; worstMs: number; renderer: string };

  /** 500 clear + 2,000 fog + 3,000 edges (spec §7), moved for `durationMs` while every frame is timed. */
  export async function runStress(
    container: HTMLElement,
    palette: ThemePalette,
    opts: { cards?: number; fog?: number; edges?: number; durationMs?: number } = {},
  ): Promise<StressResult> {
    const cards = opts.cards ?? 500, fog = opts.fog ?? 2000, edgeCount = opts.edges ?? 3000, durationMs = opts.durationMs ?? 2000;
    const graph = new Graph<NodeAttributes, EdgeAttributes>({ multi: true });
    for (let i = 0; i < cards; i += 1) {
      const a = i * 2.399, r = 40 * Math.sqrt(i);
      const kind = i % 3 === 0 ? 'note' : i % 7 === 0 ? 'person' : 'ticket';
      const image = kind === 'note' ? iconUri({ kind: 'note' }, palette) : kind === 'person' ? iconUri({ kind: 'person', initials: initialsOf(`Person ${i}`) }, palette) : '';
      graph.addNode(`c${i}`, {
        x: r * Math.cos(a), y: r * Math.sin(a), ref: `ticket:c${i}`, kind, fog: false, lv: i < 25 ? 'chip' : 'compact', center: i === 0,
        lbl: `GN-${100 + i}`, sub: i < 25 ? `Ticket ${i} with a title long enough to wrap` : null, image, sug: false, cat: (['open', 'active', 'terminal'] as const)[i % 3],
      });
    }
    for (let i = 0; i < fog; i += 1) {
      const a = i * 2.399, r = 40 * Math.sqrt(cards) + 12 * Math.sqrt(i + 1) * 3;
      graph.addNode(`f${i}`, { x: r * Math.cos(a), y: r * Math.sin(a), ref: `ticket:f${i}`, kind: 'ticket', fog: true, lv: 'fog', center: false, lbl: '', sub: null, image: '', sug: false, cat: null });
    }
    const nodes = graph.nodes();
    const groups = ['structure', 'blocks', 'relates', 'dup', 'attached', 'ref', 'people'] as const;
    for (let i = 0, k = 0; k < edgeCount; i += 1) {
      const a = nodes[(i * 7919) % nodes.length]!, b = nodes[(i * 104729 + 13) % nodes.length]!;
      if (a === b) continue;
      graph.addEdgeWithKey(`x${k}`, a, b, { id: `x${k}`, grp: groups[k % groups.length]!, fog: a.startsWith('f') || b.startsWith('f'), sug: false, on: false });
      k += 1;
    }
    const sigma = createSigma(graph, container, () => palette, { nodeHovered: () => false, highlightOn: () => false });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const camera = sigma.getCamera();
    let frames = 0, worst = 0, last = performance.now();
    const t0 = last;
    await new Promise<void>((done) => {
      const frame = (now: number) => {
        frames += 1; worst = Math.max(worst, now - last); last = now;
        const t = (now - t0) / durationMs;
        camera.setState({ x: 0.5 + 0.15 * Math.sin(t * 6.28), y: 0.5 + 0.1 * Math.cos(t * 6.28), ratio: 0.6 + 0.4 * Math.abs(Math.sin(t * 3.14)), angle: 0 });
        if (now - t0 < durationMs) requestAnimationFrame(frame); else done();
      };
      requestAnimationFrame(frame);
    });
    const gl = (sigma.getCanvases?.().stage ?? container.querySelector('canvas'))?.getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    const result = { cards, fog, edges: graph.size, fps: +(frames / (durationMs / 1000)).toFixed(1), worstMs: +worst.toFixed(1), renderer };
    sigma.kill();
    return result;
  }
  ```
  If `getCanvases` is not on the beta's `Sigma` type, keep the `container.querySelector('canvas')` arm only, and record it.

  `src/index.ts` (Task 1's content; later tasks add lines):
  ```ts
  export { PALETTE_ROLES, type PaletteRole, type ThemePalette } from './render/palette.js';
  export type { EdgeAttributes, IconSpec, Level, NodeAttributes } from './render/node-attributes.js';
  export { initialsOf } from './render/initials.js';
  ```
  It deliberately does NOT re-export anything from `render/sigma/`. The adapter is reached only through a dynamic `import()` (Task 7) or the `./stress` subpath, so Next.js never evaluates WebGL code on the server.

  Run `pnpm install` (Node 22), then `pnpm --filter @gisik-nokma/knowledge-graph build > /tmp/kg-t1-build.log 2>&1; tail -20 /tmp/kg-t1-build.log`.
  Expected: exit 0, and `dist/render/sigma/stress-scene.js` exists.
  - **If `@sigma/node-image@4.0.0-alpha.3` declares a peer range that refuses `sigma@4.0.0-beta.7`,** record pnpm's warning in DONE and keep both pins: the mockup ran exactly this pair.
  - **If the beta's types or its ESM entry refuse to compile or resolve under this repo's `moduleResolution`,** STOP and report. The seam allows a swap (§4.1), but that is the owner's call.

  Commit.

- [ ] **Step 4: The seam check (27.202, 27.203), RED first**

  `packages/knowledge-graph/test/seam.test.ts`:
  ```ts
  import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { dirname, join, relative, resolve, sep } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import ts from 'typescript';
  import { describe, expect, it } from 'vitest';

  const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const FORBIDDEN = /^(sigma(\/|$)|@sigma\/|graphology)/;
  const ALLOWED_DIR = join(PKG, 'src', 'render', 'sigma') + sep;

  /** The PROGRAM's files (from tsconfig.typecheck.json), not a directory walk: what tsc compiles is what is checked. */
  function programFiles(): { files: string[]; options: ts.CompilerOptions } {
    const configPath = join(PKG, 'tsconfig.typecheck.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, PKG);
    return { files: parsed.fileNames, options: parsed.options };
  }

  /**
   * Every import the TypeScript pre-processor sees (static, `export … from`, side-effect `import 'x'`, dynamic `import('x')`,
   * `require`), RESOLVED with the program's options. A regex walker misses side-effect imports (spec §4.1).
   */
  export function forbiddenImports(files: readonly string[], options: ts.CompilerOptions): string[] {
    const host = ts.createCompilerHost(options);
    const hits: string[] = [];
    for (const file of files) {
      const info = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
      for (const imported of info.importedFiles) {
        const resolved = ts.resolveModuleName(imported.fileName, file, options, host).resolvedModule;
        const name = resolved?.packageId?.name ?? imported.fileName;
        if (FORBIDDEN.test(name) || FORBIDDEN.test(imported.fileName)) hits.push(`${relative(PKG, file)} → ${imported.fileName}`);
      }
    }
    return hits;
  }

  describe('the renderer seam (spec §4.1)', () => {
    it('27.202 no file outside src/render/sigma/ imports sigma, @sigma/* or graphology*; control: the detector does see program.ts\'s imports', () => {
      const { files, options } = programFiles();
      const outside = files.filter((file) => !file.startsWith(ALLOWED_DIR));
      const inside = files.filter((file) => file.startsWith(ALLOWED_DIR));
      expect(forbiddenImports(outside, options)).toEqual([]);
      // control: the same detector over the allowed directory reports sigma and graphology, so an empty answer above is evidence
      const seen = forbiddenImports(inside, options).join('\n');
      expect(seen).toContain('→ sigma');
      expect(seen).toContain('→ graphology');
    });

    it('27.203 a side-effect import and a dynamic import are caught; control: a relative import is not', () => {
      const dir = mkdtempSync(join(tmpdir(), 'kg-seam-'));
      const bad = join(dir, 'bad.ts');
      writeFileSync(bad, "import 'sigma';\nexport const later = () => import('graphology');\n");
      const ok = join(dir, 'ok.ts');
      writeFileSync(ok, "import './bad.js';\nexport {};\n");
      const { options } = programFiles();
      expect(forbiddenImports([bad], options)).toHaveLength(2);
      expect(forbiddenImports([ok], options)).toEqual([]);
    });
  });
  ```
  - Before `program.ts` exists, 27.202's control FAILS. That is the RED: quote it.
  - With Step 3 in place, run `pnpm --filter @gisik-nokma/knowledge-graph exec vitest run test/seam.test.ts --maxWorkers=2 > /tmp/kg-seam.log 2>&1; tail -15 /tmp/kg-seam.log`. Expected: PASS.
  - **Mutation:** add `import 'sigma';` as the first line of `src/render/palette.ts`. 27.202 is RED, naming `src/render/palette.ts → sigma`. Revert.

  Commit.

- [ ] **Step 5: The browser package and the stress page**

  Copy G-9's package shape (`origin/task/g9-t1-live-drag:packages/workflow-canvas-browser/`), with these differences:
  - **`package.json`:** the name is `@gisik-nokma/knowledge-graph-browser`. Its dependencies are `@gisik-nokma/knowledge-graph`, `@gisik-nokma/domain`, `@gisik-nokma/ui`, `react` and `react-dom`. The devDependencies are G-9's exactly.
  - **`vite.config.ts`:** `server: { port: 3191, strictPort: true }`, and `build.rollupOptions.input` names `harness/index.html` and `harness/stress.html`. Keep G-9's `optimizeDeps.include: ['react/jsx-dev-runtime']` line and its comment.
  - **`playwright.config.ts`:** G-9's, with port 3191.
    - `projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } } }]`.
    - Those args are `kgtest.cjs:3`'s: without them, headless Chromium may refuse WebGL2.

  `harness/mockup-palette.ts` is the mockup's light values (`knowledge-graph-sigma.html:6-15`) under the `PALETTE_ROLES` keys. It is the stress probe's palette until Task 4's tokens exist; this package is not in the colour scan.
  ```ts
  import type { ThemePalette } from '@gisik-nokma/knowledge-graph';
  export const MOCKUP_LIGHT: ThemePalette = {
    dark: false, text: '#202b49', textMuted: '#3c3c43', textSubtle: '#5e5e62', surfaceRaised: '#fbf7f3', surfaceSunken: '#e4d8cc', graphCardLine: '#d9d6cf', shadow: '#273a6329',
    categoryOpen: '#6c6c70', categoryActive: '#33629f', categoryTerminal: '#1e7a34',
    edgeStructure: '#5e5e62', edgeBlocks: '#d70015', edgeRelates: '#8944ab', edgeDuplicates: '#b25000', edgeAttached: '#33629f', edgeReference: '#d30f45', edgePeople: '#a8a49a', edgeConcept: '#0b7285',
    conceptFill: '#d6e7e5', conceptSoft: '#e8f0ee', fogDot: '#b9b2a6',
  };
  ```
  `harness/stress.html`: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>KG stress</title></head><body style="margin:0"><div id="sg" style="width:100vw;height:80vh"></div><button id="run" style="font-size:20px;padding:12px 20px">Run 500 cards + 2,000 fog</button><pre id="out" style="font-size:18px"></pre><script type="module" src="./stress.ts"></script></body></html>`

  `harness/stress.ts`:
  ```ts
  import { runStress } from '@gisik-nokma/knowledge-graph/stress';
  import { MOCKUP_LIGHT } from './mockup-palette.js';
  const out = document.getElementById('out')!;
  async function go() {
    out.textContent = 'running…';
    const r = await runStress(document.getElementById('sg')!, MOCKUP_LIGHT);
    (window as unknown as { __stress: unknown }).__stress = r;
    out.textContent = `${r.cards} cards, ${r.fog} fog dots, ${r.edges} edges: ${r.fps} frames a second, slowest frame ${r.worstMs} ms\n${r.renderer}\n${navigator.userAgent}`;
  }
  document.getElementById('run')!.addEventListener('click', () => void go());
  if (new URLSearchParams(location.search).has('auto')) void go();
  ```
  `harness/index.html` is G-9's file with `<title>Knowledge Graph harness</title>` and `./main.tsx`. Task 5 writes `main.tsx`; until then it renders `<p>harness</p>`.

  `tests/helpers.ts`:
  ```ts
  import type { Page } from '@playwright/test';
  /** Waits until `read()` returns the same JSON twice 250 ms apart (≤ 10 s). SwiftShader runs at about 5 fps, so a timer is never the wait (§8). */
  export async function waitStill(page: Page, read: () => Promise<unknown>): Promise<void> {
    let a = '', b = '-';
    for (let i = 0; i < 40 && a !== b; i += 1) {
      a = b;
      await page.waitForTimeout(250);
      b = JSON.stringify(await read());
    }
  }
  ```

  Then run `pnpm install`.

- [ ] **Step 6: The stress cases (27.204, 27.205, 27.206)**

  `tests/stress.spec.ts`:
  ```ts
  import { expect, test } from '@playwright/test';

  type Stress = { cards: number; fog: number; edges: number; fps: number; worstMs: number; renderer: string };
  async function stress(page: import('@playwright/test').Page): Promise<Stress> {
    await page.goto('/stress.html?auto=1');
    await page.waitForFunction(() => (window as unknown as { __stress?: unknown }).__stress !== undefined, null, { timeout: 60_000 });
    return page.evaluate(() => (window as unknown as { __stress: Stress }).__stress);
  }

  test('27.204 the stress scene draws 500 clear + 2,000 fog + 3,000 edges through the shipped program and reports its frame rate', async ({ page }) => {
    const r = await stress(page);
    console.log(`kg-stress (LOCAL, headless): ${JSON.stringify(r)}`);
    expect(r.cards).toBe(500);
    expect(r.fog).toBe(2000);
    expect(r.edges).toBe(3000);
    expect(r.fps).toBeGreaterThan(0); // a floor: SwiftShader is not a GPU number
  });

  test('27.205 desktop bar (spec §7): ≥ 60 fps and worst frame ≤ 16.7 ms on a GPU (KG_GPU=1)', async ({ browser }) => {
    test.skip(process.env['KG_GPU'] !== '1', 'kg-stress: set KG_GPU=1 to launch Chromium on the GPU (--use-angle=metal) and assert spec §7: ≥ 60 fps, worst ≤ 16.7 ms');
    const context = await browser.browserType().launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] }).then((b) => b.newContext({ viewport: { width: 1280, height: 1000 } }));
    const page = await context.newPage();
    const r = await stress(page);
    console.log(`kg-stress (LOCAL, GPU): ${JSON.stringify(r)}`);
    expect(r.renderer).not.toMatch(/SwiftShader/i);
    expect(r.fps).toBeGreaterThanOrEqual(60);
    expect(r.worstMs).toBeLessThanOrEqual(16.7);
    await context.close();
  });

  test('27.206 phone proxy: Pixel 7 emulation with a 4× CPU throttle, measured and printed (recorded, not asserted)', async ({ browser }) => {
    const { devices } = await import('@playwright/test');
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const r = await stress(page);
    console.log(`kg-stress (LOCAL, Pixel 7 emulation, CPU ×4, ${r.renderer}): ${r.fps} fps, worst ${r.worstMs} ms`);
    expect(r.edges).toBe(3000);
    await context.close();
  });
  ```
  - If `browser.browserType().launch` is unavailable inside a test, run 27.205 in its own `test.describe` with `test.use({ launchOptions: { args: [...] } })`, and record the shape.
  - Run: `pnpm --filter @gisik-nokma/knowledge-graph-browser test > /tmp/kg-t1-stress.log 2>&1; tail -20 /tmp/kg-t1-stress.log`. Expected: 27.204 and 27.206 PASS, and 27.205 is skipped with its printed reason.
  - Then run with `KG_GPU=1` on the M2 Pro and quote the line. Expected: ≥ 60 fps. The spec measured 121 fps with a 9.4 ms worst frame for the mockup's lighter scene.

  Commit.

- [ ] **Step 7: The phone measurement on a real mid-range phone (27.207)**

  1. Run: `pnpm --filter @gisik-nokma/knowledge-graph-browser exec vite --config vite.config.ts --host`.
  2. Note the LAN URL Vite prints (`http://<lan-ip>:3191/`).
  3. Message the owner: *"Please open `http://<lan-ip>:3191/stress.html` on a mid-range phone on the same Wi-Fi (for example a Pixel 6a or a Galaxy A54), tap Run, and send me the text under the button."* The page prints fps, the slowest frame, the WebGL renderer and the user agent.
  4. Stop the server once the number is back.
  5. Run the stress page three times and quote all three.

- [ ] **Step 8: Catalogue lines for the frame-rate half**

  Under `<!-- KG-C T1 -->`:
  - ✅ 27.200 and 27.201 (domain);
  - ✅ 27.202 and 27.203 (seam);
  - ✅ 27.204 (stress draws);
  - ✅ 27.205 (`KG_GPU=1`), with the LOCAL GPU number quoted;
  - ✅ 27.206 (proxy), number quoted;
  - 🟡 27.207: *"owner's mid-range phone, `stress.html`: <fps> fps, worst <ms> ms, <device> — manual, recorded 2026-10-xx; no automated test can hold a real phone"*.

- [ ] **Step 9: STOP AND REPORT: frame rate**

  Send the owner:
  - the GPU desktop line (27.205);
  - the phone proxy line (27.206);
  - the real phone's three runs (27.207).

  **Proposed phone bar** (the spec gives none, §7): ≥ 30 fps sustained while the camera moves, worst frame ≤ 50 ms.
  - **Phone below it:** propose the remedies already in the spec's hands, measured first. Two are available:
    - the phone's cap at its own lower number (its clear hop is 1, so the 500-card case is rare on a phone);
    - `layerImage` off on the phone.

    Wait for the owner's word.
  - **Desktop below 60:** STOP (§7: "the plan stops and asks the owner, and the seam allows a swap").

- [ ] **Step 10: The ring read, `apps/server/src/read/graph-neighbours.ts`**

  First make the two one-word exports:
  - **`read/notes.ts:25`:** `const NOTE_PROJECT_LIVE_WHERE` → `export const NOTE_PROJECT_LIVE_WHERE` (its docblock already says what it is).
  - **`read/ticket-cards.ts`, `async function cardKeysFor(db, rows: readonly ProjTicketRow[])`** → `export async function cardKeysFor(db: Queryable, rows: readonly Pick<ProjTicketRow, 'ticket_id' | 'workspace_id' | 'project_id'>[])`. The body reads only those three columns: re-read it and confirm.

  ```ts
  import {
    GRAPH_RING_PAGE, GROUP_OF_EDGE_KIND, GROUP_RANK, compareRingEntries, graphRef, inGraphScope, parseGraphRef,
    type GraphEdgeKind, type GraphEdgeView, type GraphGroup, type GraphItemKind, type GraphItemView, type GraphRingResponse, type StateCategory,
  } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import type { EffectiveRole } from '../permissions/effective-role.js';
  import { readActorNames, readActorNamesForGuest } from '../routes/builder-reads.js';
  import { workspaceIdentityFromLedger } from '../workspaces/workspace-name.js';
  import { requireMember } from './membership.js';
  import { NOTE_PROJECT_LIVE_WHERE } from './notes.js';
  import { SqlParams } from './sql-params.js';
  import { cardKeysFor } from './ticket-cards.js';
  import { visibleProjects } from './visible-projects.js';
  import { LIVE_TICKET_WHERE, visibleNotesWhere, visibleTicketsWhere } from './visible-where.js';

  /**
   * ONE RING of the Knowledge Graph around a centre (spec C §2.2): the items at exactly `hops` steps, the edges from the
   * previous ring into them, and the edges among them. Stateless: the walk is recomputed from the centre on every call,
   * so a client can ask for any ring and the server holds nothing between calls.
   *
   * ## Visibility is decided per WORKSPACE, by the predicates every other read uses
   *
   * A ring can span workspaces (a person connects them), so each item is resolved in its own workspace with the viewer's
   * effective role THERE (`requireMember`), through `visibleTicketsWhere` / `visibleNotesWhere` / `visibleProjects`.
   * Nothing here restates who may see what.
   *
   * ## An item the viewer cannot see is never returned, never walked THROUGH, and no edge into it is returned
   *
   * `expand` reads the link tables raw, but an edge is kept only when BOTH ends resolved, and only resolved items join the
   * next frontier. So for visible A → hidden H → visible B, H is absent, A–H is absent, and B is not reached via H
   * (case 27.293). A "1 hidden link" count would leak H's existence (spec A §2.4), so there is none.
   *
   * ## Out of scope = fog, never walked past
   *
   * An item outside the chosen workspaces/projects is returned with `out: true` and is not put in the next frontier (C-scope).
   * The centre is always walked, whatever its scope. People are always in scope (they belong to no workspace).
   */
  export type GraphRingRequest = {
    center: { kind: GraphItemKind; id: string };
    hops: number;
    workspaceIds: readonly string[];
    projectIds: readonly string[];
    groups: ReadonlySet<GraphGroup>;
    offset: number;
    /** Tests only (27.297); the route never sets it. */
    pageSize?: number;
  };

  type Resolved = Omit<GraphItemView, 'hop' | 'out'>;
  type RawEdge = { id: string; kind: GraphEdgeKind; from: string; to: string; snippet: string | null; addedById: string | null; addedAt: Date | null; origin: string | null };

  export function createGraphVisibility(db: Queryable, viewerId: string) {
    const roles = new Map<string, EffectiveRole | null>();
    const names = new Map<string, Map<string, string>>();

    async function roleIn(workspaceId: string): Promise<EffectiveRole | null> {
      if (!roles.has(workspaceId)) roles.set(workspaceId, await requireMember(db, viewerId, workspaceId));
      return roles.get(workspaceId) ?? null;
    }
    /** The label read every "who" in the app uses (owner ruling 2026-09-29: names are not the sensitive part); a guest gets the people on their own tickets, as `builder-reads.ts:814-817` decides. */
    async function namesIn(workspaceId: string): Promise<Map<string, string>> {
      const cached = names.get(workspaceId);
      if (cached !== undefined) return cached;
      const eff = await roleIn(workspaceId);
      const rows = eff === null ? [] : eff.workspaceRole === 'guest' ? await readActorNamesForGuest(db, workspaceId, eff, viewerId) : await readActorNames(db, workspaceId);
      const map = new Map(rows.map((row) => [row.userId, row.displayName]));
      names.set(workspaceId, map);
      return map;
    }
    async function nameOf(userId: string): Promise<string | null> {
      for (const [workspaceId, eff] of roles) {
        if (eff === null) continue;
        const found = (await namesIn(workspaceId)).get(userId);
        if (found !== undefined) return found;
      }
      return null;
    }
    async function groupByWorkspace(table: string, idColumn: string, ids: readonly string[]): Promise<Map<string, string[]>> {
      const grouped = new Map<string, string[]>();
      if (ids.length === 0) return grouped;
      const { rows } = await db.query<{ id: string; workspace_id: string }>(
        `SELECT ${idColumn} AS id, workspace_id FROM ${table} WHERE ${idColumn} = ANY ($1::text[])`,
        [ids],
      );
      for (const row of rows) grouped.set(row.workspace_id, [...(grouped.get(row.workspace_id) ?? []), row.id]);
      return grouped;
    }

    async function resolve(refs: readonly string[]): Promise<Map<string, Resolved>> {
      const out = new Map<string, Resolved>();
      const ids: Record<GraphItemKind, string[]> = { ticket: [], note: [], person: [], project: [], workspace: [], concept: [] };
      for (const ref of new Set(refs)) {
        const parsed = parseGraphRef(ref);
        if (parsed !== null) ids[parsed.kind].push(parsed.id);
      }

      for (const [workspaceId, ticketIds] of await groupByWorkspace('proj_tickets', 'ticket_id', ids.ticket)) {
        const eff = await roleIn(workspaceId);
        if (eff === null) continue;
        const params = new SqlParams();
        const { rows } = await db.query<{ ticket_id: string; workspace_id: string; project_id: string; state_category: StateCategory; title: string | null }>(
          `SELECT t.ticket_id, t.workspace_id, t.project_id, t.state_category, t.fields -> 'title' ->> 'value' AS title
             FROM proj_tickets t JOIN proj_visibility v ON v.ticket_id = t.ticket_id
            WHERE t.workspace_id = ${params.add(workspaceId)} AND t.ticket_id = ANY (${params.add(ticketIds)}::text[])
              AND ${LIVE_TICKET_WHERE} AND ${visibleTicketsWhere(eff, viewerId, params)}`,
          params.toArray(),
        );
        const keys = await cardKeysFor(db, rows);
        for (const row of rows) {
          const ref = graphRef('ticket', row.ticket_id);
          out.set(ref, { ref, kind: 'ticket', id: row.ticket_id, workspaceId: row.workspace_id, projectId: row.project_id, label: keys.get(row.ticket_id) ?? row.title ?? '', title: row.title, category: row.state_category, suggested: false });
        }
      }

      for (const [workspaceId, noteIds] of await groupByWorkspace('proj_notes', 'note_id', ids.note)) {
        const eff = await roleIn(workspaceId);
        if (eff === null) continue;
        const params = new SqlParams();
        const { rows } = await db.query<{ note_id: string; workspace_id: string; home_project_id: string; title: string }>(
          `SELECT n.note_id, n.workspace_id, n.home_project_id, n.title FROM proj_notes n
            WHERE n.workspace_id = ${params.add(workspaceId)} AND n.note_id = ANY (${params.add(noteIds)}::text[])
              AND n.deleted = FALSE AND ${visibleNotesWhere(eff, viewerId, params)} AND ${NOTE_PROJECT_LIVE_WHERE}`,
          params.toArray(),
        );
        for (const row of rows) {
          const ref = graphRef('note', row.note_id);
          out.set(ref, { ref, kind: 'note', id: row.note_id, workspaceId: row.workspace_id, projectId: row.home_project_id === '' ? null : row.home_project_id, label: row.title, title: row.title, category: null, suggested: false });
        }
      }

      for (const [workspaceId, projectIds] of await groupByWorkspace('proj_projects', 'project_id', ids.project)) {
        const eff = await roleIn(workspaceId);
        if (eff === null) continue;
        const wanted = new Set(projectIds);
        for (const project of await visibleProjects(db, eff, workspaceId)) {
          if (!wanted.has(project.projectId)) continue;
          const ref = graphRef('project', project.projectId);
          out.set(ref, { ref, kind: 'project', id: project.projectId, workspaceId, projectId: project.projectId, label: project.name, title: null, category: null, suggested: false });
        }
      }

      for (const workspaceId of ids.workspace) {
        if ((await roleIn(workspaceId)) === null) continue;
        const ref = graphRef('workspace', workspaceId);
        out.set(ref, { ref, kind: 'workspace', id: workspaceId, workspaceId, projectId: null, label: (await workspaceIdentityFromLedger(db, workspaceId)).name ?? '', title: null, category: null, suggested: false });
      }

      for (const userId of ids.person) {
        const name = await nameOf(userId);
        if (name === null) continue; // a person no workspace of the viewer's names is not drawn
        const ref = graphRef('person', userId);
        out.set(ref, { ref, kind: 'person', id: userId, workspaceId: null, projectId: null, label: name, title: null, category: null, suggested: false });
      }
      return out; // concepts: spec D adds a resolver; until then none resolve
    }

    return { roleIn, resolve, nameOf };
  }

  const edgeId = (kind: GraphEdgeKind, from: string, to: string) => `${kind}|${from}|${to}`;

  /** Every edge touching `frontier` in the enabled groups, UNFILTERED by visibility: the caller keeps an edge only when both ends resolved. */
  async function expand(db: Queryable, frontier: readonly string[], groups: ReadonlySet<GraphGroup>): Promise<RawEdge[]> {
    const ids: Record<GraphItemKind, string[]> = { ticket: [], note: [], person: [], project: [], workspace: [], concept: [] };
    for (const ref of frontier) {
      const parsed = parseGraphRef(ref);
      if (parsed !== null) ids[parsed.kind].push(parsed.id);
    }
    const t = ids.ticket, n = ids.note, p = ids.person, pr = ids.project, w = ids.workspace;
    const edges = new Map<string, RawEdge>();
    const add = (kind: GraphEdgeKind, from: string, to: string, extra: Partial<RawEdge> = {}) => {
      const id = edgeId(kind, from, to);
      if (!edges.has(id)) edges.set(id, { id, kind, from, to, snippet: null, addedById: null, addedAt: null, origin: null, ...extra });
    };
    const sourceRef = (kind: string, id: string, sourceTicket: string | null) => (kind === 'comment' ? graphRef('ticket', sourceTicket ?? '') : graphRef(kind as GraphItemKind, id));

    if (groups.has('structure') && t.length > 0) {
      const { rows } = await db.query<{ ticket_id: string; parent_id: string }>(
        `SELECT ticket_id, parent_id FROM proj_tickets WHERE parent_id IS NOT NULL AND (ticket_id = ANY ($1::text[]) OR parent_id = ANY ($1::text[]))`, [t]);
      for (const r of rows) add('parent', graphRef('ticket', r.parent_id), graphRef('ticket', r.ticket_id));
    }
    const linkKinds = (['blocks', 'relates', 'duplicates'] as const).filter((kind) => groups.has(GROUP_OF_EDGE_KIND[kind]));
    if (linkKinds.length > 0 && t.length > 0) {
      const { rows } = await db.query<{ source_id: string; target_id: string; kind: 'blocks' | 'relates' | 'duplicates'; created_by: string; created_at: Date; origin: string }>(
        `SELECT source_id, target_id, kind, created_by, created_at, origin FROM proj_ticket_links
          WHERE kind = ANY ($2::text[]) AND (source_id = ANY ($1::text[]) OR target_id = ANY ($1::text[]))`, [t, linkKinds]);
      for (const r of rows) add(r.kind, graphRef('ticket', r.source_id), graphRef('ticket', r.target_id), { addedById: r.created_by, addedAt: r.created_at, origin: r.origin });
    }
    if (groups.has('attached') && (t.length > 0 || n.length > 0)) {
      const { rows } = await db.query<{ note_id: string; ticket_id: string; attached_at: Date }>(
        `SELECT note_id, ticket_id, attached_at FROM proj_note_attachments WHERE note_id = ANY ($1::text[]) OR ticket_id = ANY ($2::text[])`, [n, t]);
      for (const r of rows) add('attached', graphRef('note', r.note_id), graphRef('ticket', r.ticket_id), { addedAt: r.attached_at });
    }
    const refRows = async (targetKinds: string[], extraTarget: string[]) =>
      (await db.query<{ source_kind: string; source_id: string; source_ticket: string | null; target_kind: GraphItemKind; target_id: string; snippet: string; updated_by: string; updated_at: Date }>(
        `SELECT source_kind, source_id, source_ticket, target_kind, target_id, snippet, updated_by, updated_at FROM proj_references
          WHERE target_kind = ANY ($4::text[]) AND (
                (target_kind = 'ticket' AND target_id = ANY ($1::text[])) OR (target_kind = 'note' AND target_id = ANY ($2::text[]))
             OR (target_kind = 'person' AND target_id = ANY ($3::text[]))
             OR (source_kind = 'ticket' AND source_id = ANY ($1::text[])) OR (source_kind = 'comment' AND source_ticket = ANY ($1::text[]))
             OR (source_kind = 'note' AND source_id = ANY ($2::text[])))
          ORDER BY source_kind, source_id, ordinal`, [t, n, extraTarget, targetKinds])).rows;
    if (groups.has('ref') && (t.length > 0 || n.length > 0)) {
      for (const r of await refRows(['ticket', 'note'], [])) add('ref', sourceRef(r.source_kind, r.source_id, r.source_ticket), graphRef(r.target_kind, r.target_id), { snippet: r.snippet, addedById: r.updated_by, addedAt: r.updated_at });
    }
    if (groups.has('people')) {
      if (t.length > 0 || p.length > 0) {
        const { rows } = await db.query<{ ticket_id: string; assignee_id: string }>(
          `SELECT ticket_id, assignee_id FROM proj_tickets WHERE assignee_id IS NOT NULL AND (ticket_id = ANY ($1::text[]) OR assignee_id = ANY ($2::text[]))`, [t, p]);
        for (const r of rows) add('assignee', graphRef('person', r.assignee_id), graphRef('ticket', r.ticket_id));
      }
      if (t.length > 0 || n.length > 0 || p.length > 0) {
        for (const r of await refRows(['person'], p)) add('mention', sourceRef(r.source_kind, r.source_id, r.source_ticket), graphRef('person', r.target_id), { snippet: r.snippet, addedById: r.updated_by, addedAt: r.updated_at });
      }
    }
    if (groups.has('projects')) {
      if (t.length > 0 || pr.length > 0) {
        const { rows } = await db.query<{ ticket_id: string; project_id: string }>(
          `SELECT ticket_id, project_id FROM proj_tickets WHERE ticket_id = ANY ($1::text[]) OR project_id = ANY ($2::text[])`, [t, pr]);
        for (const r of rows) add('in', graphRef('project', r.project_id), graphRef('ticket', r.ticket_id));
      }
      if (n.length > 0 || pr.length > 0) {
        const { rows } = await db.query<{ note_id: string; home_project_id: string }>(
          `SELECT note_id, home_project_id FROM proj_notes WHERE home_project_id <> '' AND (note_id = ANY ($1::text[]) OR home_project_id = ANY ($2::text[]))`, [n, pr]);
        for (const r of rows) add('in', graphRef('project', r.home_project_id), graphRef('note', r.note_id));
      }
      if (pr.length > 0 || w.length > 0) {
        const { rows } = await db.query<{ project_id: string; workspace_id: string }>(
          `SELECT project_id, workspace_id FROM proj_projects WHERE project_id = ANY ($1::text[]) OR workspace_id = ANY ($2::text[])`, [pr, w]);
        for (const r of rows) add('in', graphRef('workspace', r.workspace_id), graphRef('project', r.project_id));
      }
    }
    return [...edges.values()];
  }

  export async function readGraphRing(db: Queryable, viewerId: string, req: GraphRingRequest): Promise<GraphRingResponse | null> {
    const vis = createGraphVisibility(db, viewerId);
    for (const workspaceId of req.workspaceIds) if ((await vis.roleIn(workspaceId)) === null) return null; // same 404 as an unknown id
    const centerRef = graphRef(req.center.kind, req.center.id);
    const known = await vis.resolve([centerRef]);
    if (!known.has(centerRef)) return null;

    const dist = new Map<string, number>([[centerRef, 0]]);
    const rank = new Map<string, number>();
    let frontier = [centerRef];
    let ring: string[] = [];
    let intoRing: RawEdge[] = [];
    for (let hop = 1; hop <= req.hops && frontier.length > 0; hop += 1) {
      const raw = await expand(db, frontier, req.groups);
      const unseen = [...new Set(raw.flatMap((edge) => [edge.from, edge.to]))].filter((ref) => !known.has(ref));
      for (const [ref, item] of await vis.resolve(unseen)) known.set(ref, item);
      const inFrontier = new Set(frontier);
      const next: string[] = [];
      const edgesIn: RawEdge[] = [];
      for (const edge of raw) {
        if (!known.has(edge.from) || !known.has(edge.to)) continue; // an invisible end: no edge, and no step through it
        if (inFrontier.has(edge.from) === inFrontier.has(edge.to)) continue; // both in the frontier (the previous ring's own edge) or neither
        const far = inFrontier.has(edge.from) ? edge.to : edge.from;
        if (!dist.has(far)) {
          dist.set(far, hop);
          next.push(far);
        }
        if (dist.get(far) !== hop) continue; // an edge back to an earlier ring was returned with that ring
        rank.set(far, Math.min(rank.get(far) ?? Number.POSITIVE_INFINITY, GROUP_RANK[GROUP_OF_EDGE_KIND[edge.kind]]));
        edgesIn.push(edge);
      }
      ring = next;
      intoRing = edgesIn;
      frontier = next.filter((ref) => inGraphScope(known.get(ref)!, req)); // never walk past an out-of-scope item
      if (hop < req.hops && frontier.length === 0) ring = [];
    }
    if (dist.size === 1 || ring.length === 0 || ![...dist.values()].includes(req.hops)) {
      return { hop: req.hops, items: [], edges: [], frontier: [], truncated: false, cursor: null };
    }

    const ordered = ring.map((ref) => ({ ref, rank: rank.get(ref) ?? 0 })).sort(compareRingEntries).map((entry) => entry.ref);
    const size = req.pageSize ?? GRAPH_RING_PAGE;
    const upTo = new Set(ordered.slice(0, req.offset + size));
    const page = ordered.slice(req.offset, req.offset + size);
    const onPage = new Set(page);
    const among = (await expand(db, ring, req.groups)).filter((edge) => upTo.has(edge.from) && upTo.has(edge.to) && (onPage.has(edge.from) || onPage.has(edge.to)));
    const raw = [...intoRing.filter((edge) => onPage.has(edge.from) || onPage.has(edge.to)), ...among];

    const edges: GraphEdgeView[] = [];
    const seen = new Set<string>();
    for (const edge of raw) {
      if (seen.has(edge.id)) continue;
      seen.add(edge.id);
      edges.push({
        id: edge.id, kind: edge.kind, from: edge.from, to: edge.to, snippet: edge.snippet,
        addedBy: edge.addedById === null ? null : await vis.nameOf(edge.addedById),
        addedAt: edge.addedAt === null ? null : edge.addedAt.toISOString(),
        origin: edge.origin, suggested: false,
      });
    }
    edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const items: GraphItemView[] = page.map((ref) => ({ ...known.get(ref)!, hop: req.hops, out: !inGraphScope(known.get(ref)!, req) }));
    const truncated = ordered.length > req.offset + size;
    return {
      hop: req.hops,
      items,
      edges,
      frontier: items.filter((item) => !item.out).map((item) => item.ref),
      truncated,
      cursor: truncated ? String(req.offset + size) : null,
    };
  }
  ```
  Note the loop's empty-ring rule: when a ring before `hops` has no walkable item, the requested ring is empty. The final guard returns an empty ring when nothing reached distance `hops`.

  Commit.

- [ ] **Step 11: The A/B shim and two smoke cases (27.208, 27.209)**

  `apps/server/test/graph/shim.ts`. A's and B's DDL is copied byte for byte from spec A §2.5 and spec B §2.1, with `IF NOT EXISTS` added. Task 6 deletes this file once A's and B's migrations are on the release branch.
  ```ts
  import type { Pool } from 'pg';
  export async function ensureLinkAndReferenceTables(pool: Pool): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proj_ticket_links (
        workspace_id text NOT NULL,
        source_id    text NOT NULL,
        target_id    text NOT NULL,
        kind         text NOT NULL CHECK (kind IN ('blocks','relates','duplicates')),
        created_by   text NOT NULL,
        created_at   timestamptz NOT NULL,
        origin       text NOT NULL,
        seq          bigint NOT NULL,
        PRIMARY KEY (source_id, target_id, kind)
      );
      CREATE INDEX IF NOT EXISTS proj_ticket_links_target_idx ON proj_ticket_links (target_id);
      CREATE INDEX IF NOT EXISTS proj_ticket_links_ws_idx ON proj_ticket_links (workspace_id);
      CREATE TABLE IF NOT EXISTS proj_references (
        workspace_id  text NOT NULL,
        source_kind   text NOT NULL CHECK (source_kind IN ('ticket','comment','note')),
        source_id     text NOT NULL,
        source_ticket text,
        target_kind   text NOT NULL CHECK (target_kind IN ('ticket','note','person')),
        target_id     text NOT NULL,
        ordinal       int  NOT NULL,
        snippet       text NOT NULL,
        updated_by    text NOT NULL,
        updated_at    timestamptz NOT NULL,
        seq           bigint NOT NULL,
        PRIMARY KEY (source_kind, source_id, ordinal)
      );
      CREATE INDEX IF NOT EXISTS proj_references_target_idx ON proj_references (target_kind, target_id);
      CREATE INDEX IF NOT EXISTS proj_references_ws_idx ON proj_references (workspace_id);
    `);
  }
  ```

  The two smoke cases go at the top of `apps/server/test/graph/perf.test.ts`. They run on every server suite, gated by nothing:
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { graphRef, membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
  import { readGraphRing } from '../../src/read/graph-neighbours.js';
  import { applyCommitted, makeCommitted } from '../helpers/apply.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { ensureLinkAndReferenceTables } from './shim.js';

  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
    await ensureLinkAndReferenceTables(db.pool);
  }, 600_000);
  afterAll(async () => {
    await db.drop();
  });

  const all = new Set(['blocks', 'relates', 'dup', 'structure', 'attached', 'projects', 'ref', 'people'] as const);

  describe('27.208–27.209 the ring read, smoke', () => {
    it('27.208 ring 1 of a parent holds its child and the parent edge; control: ring 2 holds the grandchild and not the child', async () => {
      const world = await seedSmall(db);
      const r1 = await readGraphRing(db.pool, world.member, { center: { kind: 'ticket', id: world.parent }, hops: 1, workspaceIds: [world.ws], projectIds: [], groups: all, offset: 0 });
      expect(r1?.items.map((i) => i.ref)).toEqual([graphRef('ticket', world.child)]);
      expect(r1?.edges.map((e) => e.kind)).toEqual(['parent']);
      const r2 = await readGraphRing(db.pool, world.member, { center: { kind: 'ticket', id: world.parent }, hops: 2, workspaceIds: [world.ws], projectIds: [], groups: all, offset: 0 });
      expect(r2?.items.map((i) => i.ref)).toEqual([graphRef('ticket', world.grandchild)]);
    });

    it('27.209 a centre the viewer cannot see answers null (the route turns it into 404); control: the owner reads it', async () => {
      const world = await seedSmall(db);
      const req = { center: { kind: 'ticket' as const, id: world.hidden }, hops: 1, workspaceIds: [world.ws], projectIds: [], groups: all, offset: 0 };
      expect(await readGraphRing(db.pool, world.member, req)).toBeNull();
      expect(await readGraphRing(db.pool, world.owner, req)).not.toBeNull();
    });
  });
  ```
  `seedSmall(db)` lives in the same file. It is a NEW world each call, so the cases do not share state:
  - `newUlid()` ids;
  - `workspace.created`, `membership.granted` (owner, member), `project.created`;
  - the scenario workflow and ticket type (copy the two `makeCommitted` blocks from `test/helpers/read-scenario.ts:150-174`, with this world's workflow id);
  - `ticket.created` parent → child → grandchild (`parentId`);
  - a `hidden` ticket with `visibility.set { mode: 'explicit', userIds: [owner] }`.

  The two users are inserted into `"user"` exactly as `test/ops/e2e-teardown.test.ts:15` does. It returns `{ ws, owner, member, parent, child, grandchild, hidden }`.

  Run: `pnpm --filter @gisik-nokma/server exec vitest run test/graph/perf.test.ts --maxWorkers=2 > /tmp/kg-t1-smoke.log 2>&1; tail -20 /tmp/kg-t1-smoke.log`. Expected: 27.208 and 27.209 PASS. The perf block below skips with its printed reason.

  Commit.

- [ ] **Step 12: The perf case (27.210, `KG_PERF=1`)**

  Append to `perf.test.ts`, shaped like `apps/server/test/search/perf.test.ts:36-60` (gated, and printing what it would measure when skipped):
  ```ts
  const ENABLED = process.env['KG_PERF'] === '1';
  function percentile(sorted: number[], fraction: number): number {
    if (sorted.length === 0) return 0;
    return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1))] as number;
  }

  describe('27.210 p95 per ring at 500 items (spec §2.2, §7)', () => {
    if (!ENABLED) {
      console.log('kg-perf: SKIPPED — set KG_PERF=1 to seed the corpus and measure p95 per ring (target ≤ 150 ms at 500 items).');
      it.skip('seeds and measures (set KG_PERF=1)', () => undefined);
      return;
    }
    it('27.210 / 27.305 p95 ≤ 150 ms for every ring of the hub ticket, as a MEMBER (the predicates do work; an owner compiles to TRUE)', async () => {
      const corpus = await seedGraphCorpus(db, { tickets: 10_000, notes: 2_500, people: 12, links: 3_000, references: 6_000 });
      for (const hops of [1, 2, 3]) {
        const req = { center: { kind: 'ticket' as const, id: corpus.hub }, hops, workspaceIds: [corpus.ws], projectIds: [], groups: all, offset: 0 };
        const first = await readGraphRing(db.pool, corpus.member, req); // warm
        const timings: number[] = [];
        for (let i = 0; i < 100; i += 1) {
          const started = process.hrtime.bigint();
          await readGraphRing(db.pool, corpus.member, req);
          timings.push(Number(process.hrtime.bigint() - started) / 1e6);
        }
        timings.sort((a, b) => a - b);
        const p95 = percentile(timings, 0.95);
        console.log(`kg-perf (LOCAL) on ${process.platform}/${process.arch}: ring ${hops}: ${first?.items.length} items, ${first?.edges.length} edges, p95 ${p95.toFixed(1)} ms (target 150)`);
        expect(p95, `spec §7, ring ${hops}`).toBeLessThanOrEqual(150);
      }
      // the shape the bar is about: some ring holds at least 500 items
      const r2 = await readGraphRing(db.pool, corpus.member, { center: { kind: 'ticket', id: corpus.hub }, hops: 2, workspaceIds: [corpus.ws], projectIds: [], groups: all, offset: 0 });
      expect(r2!.items.length).toBeGreaterThanOrEqual(500);
    }, 3_600_000);
  });
  ```
  `seedGraphCorpus(db, size)` is in the same file and is deterministic: a fixed-seed LCG, `next = (a * 1103515245 + 12345) % 2 ** 31`. Through `applyCommitted` it writes:
  - **The world:** one workspace, 4 projects, the owner, a member viewer, and `size.people` members, all inserted into `"user"` with names (`Person 1`, …).
  - **Tickets:** 40 roots, each later ticket's `parentId` = ticket `⌊(i − 40) / 8⌋`.
    - Project `i % 4`.
    - 10% get `visibility.set { mode: 'explicit', userIds: [owner] }`, so the member's predicate excludes real rows.
    - Every ticket is assigned (`ticket.assigned { assigneeId: people[i % people] }`).
  - **Notes:** `note.created { scope: { mode: 'workspace' }, homeProjectId: projects[j % 4], attachTicketId: tickets[(j * 7) % N] }`.

  Then plain `INSERT`s into the shimmed tables:
  - `size.links` typed links with kind `j % 3`;
  - `size.references` references (ticket and note sources, ticket and note targets, ordinals per source), of which a quarter are person mentions.

  **The hub** is ticket 0, and the generator guarantees its rings:
  - it gets 24 direct subtasks (in addition to the tree), 8 attached notes, 6 typed links and 4 references;
  - each of those 42 neighbours gets ≥ 12 more neighbours, so ring 2 is ≥ 500.

  The 10,000 / 2,500 sizes are this plan's stand-in for "a prod-sized copy". Before running, read prod's counts from the owner's last ops report if one exists. If prod's largest workspace is larger, scale the constants and record both.

  Run: `KG_PERF=1 pnpm --filter @gisik-nokma/server exec vitest run test/graph/perf.test.ts --maxWorkers=2 > /tmp/kg-t1-perf.log 2>&1; grep "kg-perf" /tmp/kg-t1-perf.log; tail -5 /tmp/kg-t1-perf.log`.

- [ ] **Step 13: Gate, CI, citations, colour scan, cache inputs**

  1. **COUNT first:** `pnpm turbo run build test typecheck --dry=json > /tmp/kg-dry.json 2>/dev/null; python3 -c "import json;print(len(json.load(open('/tmp/kg-dry.json'))['tasks']))"`. Expected: the old count + 5. Pin THAT number and quote it in DONE.
  2. **Every place G-9's T1 diff touched for the count** (`git diff origin/release/smoothness...origin/task/g9-t1-live-drag -- scripts/ctl docs/lanes/gate-lock test-cases/13-deploy-and-ops.md Features.md`): read that diff and change the same lines from the current count to the new one:
     - `gate.sh`;
     - every fixture `Tasks:`/`Cached:` line in `lib.test.sh`;
     - the 13.1702 grep, and the 13.1716 failure arms (`35 of 36` becomes `<n−1> of <n>`) and its control;
     - the README's two lines;
     - the 13.1702 and 13.1716 case prose, with a note "(… until KG-C T1 put `knowledge-graph`'s build/test/typecheck and `knowledge-graph-browser`'s test/typecheck on the gate)";
     - the Features gate bullet's count.
  3. **`scripts/check-case-citations.mjs` `isTestPath`:** add `if (/^packages\/knowledge-graph-browser\/tests\//.test(relPath)) return true;` beside G-9's line, with a one-line comment.
  4. **`.github/workflows/ci.yml`:** beside G-9's install line, add `- run: pnpm --filter @gisik-nokma/knowledge-graph-browser exec playwright install --with-deps chromium`. Run `apps/server/test/ci/ci-trigger.test.ts` to confirm the triggers are unaffected.
  5. **`packages/ui/test/helpers/colour-scan.ts` `CLIENT_SOURCE_ROOTS`:** add `'packages/knowledge-graph/src'`.
  6. **`turbo.json`, `@gisik-nokma/ui#test` inputs:** add `"$TURBO_ROOT$/packages/knowledge-graph/src/**"`.
  7. **`turbo.json`, a task for the browser package** (`dependsOn: ["^build"]`):
     ```json
     "@gisik-nokma/knowledge-graph-browser#test": {
       "dependsOn": ["^build"],
       "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/packages/knowledge-graph/src/**", "$TURBO_ROOT$/packages/ui/src/ui.css"]
     },
     ```
  8. **Run:** `pnpm --filter @gisik-nokma/ui exec vitest run --maxWorkers=2 > /tmp/kg-ui.log 2>&1; tail -8 /tmp/kg-ui.log`. Expected: PASS, so the new root holds no colour literal.
  9. **Mutation:** put `color: '#ff0000'` in `program.ts`. `ui#test`'s colour scan is RED and names the file. Revert.
  10. **Run:** `pnpm check:ctl > /tmp/kg-ctl.log 2>&1; tail -5 /tmp/kg-ctl.log`. Expected: PASS.

  Commit.

- [ ] **Step 14: STOP AND REPORT: the endpoint, then catalogue + DONE**

  Send the owner:
  - the three `kg-perf (LOCAL)` lines;
  - the corpus size.

  **If any ring's p95 is over 150 ms,** STOP. Propose the measured remedy and wait for the owner's word. The candidates, in order:
  1. an index the plan shows was missing, measured;
  2. one SQL round trip per table per hop instead of per kind;
  3. caching `resolve` across the hop loop's calls.

  Then, under `<!-- KG-C T1 -->`:
  - ✅ 27.208 and 27.209;
  - ✅ 27.210, with the LOCAL p95 numbers quoted;
  - 27.211 stays unallocated: no line (`scripts/check-case-ids.mjs` counts declared id LINES and accepts gaps, so unused ids get no line; never write a range as one line).

  Replace `<!-- KG-C bullet -->` with a ⚙️ bullet naming:
  - the two packages and their gate tasks;
  - the seam check;
  - the stress probe;
  - the ring read.

  Keep the anchor below it.

  **Sweeps:**
  - `domain` (whole), `knowledge-graph` (whole), `ui` (whole);
  - the server's `test/graph/` and `test/routes/notes.test.ts` (it imports `read/notes.ts`), and `test/routes/my-work.test.ts` (it uses `ticket-cards.ts`);
  - `pnpm check:citations`, `node scripts/check-case-ids.mjs`, `pnpm check:tasks`.

  Push, then `DONE task/kg-c-t1-measure <sha40>` and one REVIEW line (`NEEDS: browser, GPU, a phone`).

---

### Task 2: The graph engine: ring store, walk, zones, layout, levels, sentences (cases 27.212–27.239)

**Depends on:** Task 1 (the package, the domain vocabulary). It does NOT depend on A or B.

**Files:**
- Create:
  - `packages/knowledge-graph/src/engine/model.ts`
  - `packages/knowledge-graph/src/engine/walk.ts`
  - `packages/knowledge-graph/src/engine/zones.ts`
  - `packages/knowledge-graph/src/engine/layout.ts`
  - `packages/knowledge-graph/src/engine/levels.ts`
  - `packages/knowledge-graph/src/engine/sentences.ts`
  - `packages/knowledge-graph/src/ids.ts`
  - `packages/knowledge-graph/test/engine/fixture.ts`
  - `packages/knowledge-graph/test/engine/{model,walk,zones,layout,levels,sentences}.test.ts`
- Modify:
  - `packages/knowledge-graph/src/index.ts`
  - `package.json` `exports`: add `"./ids"`
  - `test-cases/27-knowledge-graph.md` (under `<!-- KG-C T2 -->`)
  - Features §24 bullet

**Interfaces:**
- **Consumes:** the domain `graph.ts` exports (Task 1).
- **Produces:**
  - `ids.ts` (no React, no Sigma: Home's server code and tests import it from `@gisik-nokma/knowledge-graph/ids`):
    - `kgNodeId(kind: GraphItemKind, id: string): string`, which is `graphRef`;
    - `parseKgNodeId(ref)`, which is `parseGraphRef`.
  - `model.ts`:
    - `type GraphStore = { items: ReadonlyMap<string, GraphItemView>; edges: ReadonlyMap<string, GraphEdgeView>; adj: ReadonlyMap<string, readonly AdjEntry[]>; rings: number; exhausted: boolean }`;
    - `type AdjEntry = { to: string; edge: GraphEdgeView }`;
    - `emptyStore()`;
    - `mergeRing(store, ring): GraphStore`.
  - `walk.ts`:
    - `type Walk = { dist: Map<string, number>; parent: Map<string, { from: string; edge: GraphEdgeView }>; kids: Map<string, string[]>; order: string[]; out: Set<string> }`;
    - `walk(store, center, on, reach, inScope, gone?)`.
  - `zones.ts`:
    - `type Zones = { reach: number; walk: Walk; clear: string[]; clearSet: Set<string>; fog: string[]; fogSet: Set<string>; capped: boolean; beyond: number; clearHop: number; outN: number }`;
    - `zones(store, opts: ZoneOptions)`;
    - `CLEAR_CAP = 500`, `FOG_BUDGET = 2000`.
  - `layout.ts`:
    - `type RingConfigName = 'desktop' | 'phone' | 'home'`;
    - `RING_CONFIGS`;
    - `radius(R, h)`;
    - `layoutRings(walk, center, cfg, ringOf): Map<string, { x: number; y: number }>`.
  - `levels.ts`:
    - `levelOf(cfg, dist, fog)`;
    - `nodeLabel(item, lv, phone)`, `nodeSub(item, lv, phone)`;
    - `truncate(text, max)`.
  - `sentences.ts`:
    - `relation(edge, fromRef)`, `edgeSentence(edge, labelOf)`;
    - `howText(edge)`, `provenanceLine(edge)`;
    - `formatGraphDate(iso)`.

The engine is plain data in, plain data out: no DOM, no Sigma, no React. It is unit-tested in Node (`// @vitest-environment node` at the top of each engine test). This is spec §2.3's "client graph", held as plain maps rather than graphology: §4.1 allows graphology only under `render/sigma/` (see the Self-review's spec gaps). The adapter builds its graphology `Graph` from these maps.

- [ ] **Step 1: The test fixture.** `test/engine/fixture.ts` builds a store from a small, readable world. Every engine test uses it; none hand-builds maps.
  ```ts
  import { GROUP_OF_EDGE_KIND, graphRef, type GraphEdgeKind, type GraphEdgeView, type GraphItemKind, type GraphItemView, type GraphRingResponse } from '@gisik-nokma/domain';
  import { emptyStore, mergeRing, type GraphStore } from '../../src/engine/model.js';

  type ItemSpec = { kind?: GraphItemKind; label?: string; title?: string | null; ws?: string | null; project?: string | null; cat?: 'open' | 'active' | 'terminal' | null };
  export function item(id: string, spec: ItemSpec = {}): GraphItemView {
    const kind = spec.kind ?? 'ticket';
    return {
      ref: graphRef(kind, id), kind, id,
      workspaceId: spec.ws === undefined ? (kind === 'person' ? null : 'w1') : spec.ws,
      projectId: spec.project === undefined ? (kind === 'ticket' || kind === 'note' ? 'p1' : null) : spec.project,
      label: spec.label ?? id.toUpperCase(), title: spec.title === undefined ? (kind === 'ticket' || kind === 'note' ? `Title of ${id}` : null) : spec.title,
      category: spec.cat === undefined ? (kind === 'ticket' ? 'open' : null) : spec.cat,
      hop: 0, out: false, suggested: false,
    };
  }
  export function edge(kind: GraphEdgeKind, from: string, to: string, extra: Partial<GraphEdgeView> = {}): GraphEdgeView {
    return { id: `${kind}|${from}|${to}`, kind, from, to, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false, ...extra };
  }
  /** One "ring" holding everything: the engine never needs the server's ring split to walk. */
  export function storeOf(items: GraphItemView[], edges: GraphEdgeView[]): GraphStore {
    const ring: GraphRingResponse = { hop: 1, items, edges, frontier: items.map((i) => i.ref), truncated: false, cursor: null };
    return mergeRing(emptyStore(), ring);
  }
  export const T = (id: string) => graphRef('ticket', id);
  export const N = (id: string) => graphRef('note', id);
  export const P = (id: string) => graphRef('person', id);
  export const ALL_GROUPS = new Set(Object.values(GROUP_OF_EDGE_KIND));
  ```

- [ ] **Step 2: `ids.ts` and `model.ts`, test first (27.212)**

  `test/engine/model.test.ts`:
  ```ts
  // @vitest-environment node
  import { describe, expect, it } from 'vitest';
  import { emptyStore, mergeRing } from '../../src/engine/model.js';
  import { edge, item, T } from './fixture.js';
  import { kgNodeId } from '../../src/ids.js';

  describe('the ring store (spec §2.3)', () => {
    it('27.212 merging rings unions items and edges and indexes both ends; control: the same edge in a second ring is not added twice', () => {
      const r1 = { hop: 1, items: [item('a'), item('b')], edges: [edge('parent', T('a'), T('b'))], frontier: [T('b')], truncated: false, cursor: null };
      const r2 = { hop: 2, items: [item('c')], edges: [edge('blocks', T('b'), T('c')), edge('parent', T('a'), T('b'))], frontier: [T('c')], truncated: false, cursor: null };
      const s = mergeRing(mergeRing(emptyStore(), r1), r2);
      expect([...s.items.keys()].sort()).toEqual([T('a'), T('b'), T('c')]);
      expect(s.adj.get(T('b'))?.map((x) => x.to).sort()).toEqual([T('a'), T('c')]);
      expect(s.rings).toBe(2);
      // control
      expect(s.edges.size).toBe(2);
      expect(s.adj.get(T('a'))).toHaveLength(1);
      expect(kgNodeId('ticket', 'a')).toBe(T('a'));
    });
  });
  ```

  `src/ids.ts`:
  ```ts
  /** Node ids are `kind:id` (spec C §2.2's `center=<kind>:<id>`). This entry imports neither React nor Sigma, so a server or a test can build one. */
  export { graphRef as kgNodeId, parseGraphRef as parseKgNodeId } from '@gisik-nokma/domain';
  ```

  `src/engine/model.ts`:
  ```ts
  import type { GraphEdgeView, GraphItemView, GraphRingResponse } from '@gisik-nokma/domain';

  export type AdjEntry = { to: string; edge: GraphEdgeView };
  /**
   * The union of the rings fetched for one centre (spec §2.3), as plain maps. graphology lives only in `render/sigma/`
   * (§4.1), so the engine walks these maps and the adapter mirrors what is drawn. `exhausted` = the last ring came back
   * empty: "Everything" has reached the end.
   */
  export type GraphStore = {
    items: ReadonlyMap<string, GraphItemView>;
    edges: ReadonlyMap<string, GraphEdgeView>;
    adj: ReadonlyMap<string, readonly AdjEntry[]>;
    rings: number;
    exhausted: boolean;
  };

  export function emptyStore(): GraphStore {
    return { items: new Map(), edges: new Map(), adj: new Map(), rings: 0, exhausted: false };
  }

  export function mergeRing(store: GraphStore, ring: GraphRingResponse): GraphStore {
    const items = new Map(store.items);
    for (const it of ring.items) if (!items.has(it.ref)) items.set(it.ref, it);
    const edges = new Map(store.edges);
    const adj = new Map<string, AdjEntry[]>([...store.adj].map(([k, v]) => [k, [...v]]));
    for (const e of ring.edges) {
      if (edges.has(e.id)) continue;
      edges.set(e.id, e);
      adj.set(e.from, [...(adj.get(e.from) ?? []), { to: e.to, edge: e }]);
      adj.set(e.to, [...(adj.get(e.to) ?? []), { to: e.from, edge: e }]);
    }
    return { items, edges, adj, rings: Math.max(store.rings, ring.hop), exhausted: store.exhausted || (ring.items.length === 0 && ring.cursor === null) };
  }
  ```
  Run: `pnpm --filter @gisik-nokma/knowledge-graph exec vitest run test/engine/model.test.ts --maxWorkers=2 > /tmp/kg-t2.log 2>&1; tail -12 /tmp/kg-t2.log`. Expected: FAIL first, then PASS. Commit.

- [ ] **Step 3: The walk, test first (27.213–27.218).** This is a port of `bfs` (`knowledge-graph-sigma.html:592-600`). One change from the mockup: the neighbour order is the SPEC's ring order (§2.2, through `compareRingEntries`), not the mockup's `cmp` (`:591`, structure first, by label). That way the client's 500-item cap cuts exactly where the server's page does.

  `test/engine/walk.test.ts`:
  ```ts
  // @vitest-environment node
  import { describe, expect, it } from 'vitest';
  import { inGraphScope } from '@gisik-nokma/domain';
  import { walk } from '../../src/engine/walk.js';
  import { ALL_GROUPS, edge, item, N, P, storeOf, T } from './fixture.js';

  const everyone = () => true;

  describe('the walk (port of bfs, knowledge-graph-sigma.html:592)', () => {
    it('27.213 distances and parents by breadth; control: a cycle does not re-visit', () => {
      const s = storeOf([item('a'), item('b'), item('c')], [edge('parent', T('a'), T('b')), edge('parent', T('b'), T('c')), edge('relates', T('c'), T('a'))]);
      const w = walk(s, T('a'), ALL_GROUPS, 5, everyone);
      expect(w.dist.get(T('b'))).toBe(1);
      expect(w.dist.get(T('c'))).toBe(1); // a–c relates: one step, not two
      expect(w.parent.get(T('c'))?.edge.kind).toBe('relates');
      expect(w.order).toEqual([T('a'), T('c'), T('b')]); // relates (a typed link) ranks before structure
      expect(new Set(w.order).size).toBe(w.order.length);
    });

    it('27.214 a hidden group is not walked; control: switched on, the same item is reached', () => {
      const s = storeOf([item('a'), item('b'), item('c')], [edge('blocks', T('a'), T('b')), edge('parent', T('b'), T('c'))]);
      expect(walk(s, T('a'), new Set(['structure'] as const), 5, everyone).dist.has(T('c'))).toBe(false);
      expect(walk(s, T('a'), new Set(['blocks', 'structure'] as const), 5, everyone).dist.get(T('c'))).toBe(2);
    });

    it('27.215 an out-of-scope item is reached, marked out and never walked past; control: an in-scope item at the same place is walked past', () => {
      const s = storeOf(
        [item('a'), item('x', { project: 'p2' }), item('y'), item('b'), item('c')],
        [edge('relates', T('a'), T('x')), edge('relates', T('x'), T('y')), edge('relates', T('a'), T('b')), edge('relates', T('b'), T('c'))],
      );
      const scope = { workspaceIds: ['w1'], projectIds: ['p1'] };
      const w = walk(s, T('a'), ALL_GROUPS, 5, (ref) => inGraphScope(s.items.get(ref)!, scope));
      expect(w.out.has(T('x'))).toBe(true);
      expect(w.dist.has(T('y'))).toBe(false);
      expect(w.dist.get(T('c'))).toBe(2);
    });

    it('27.216 an edge to an item the store does not hold (the server withheld it) is not followed; control: once the item arrives it is', () => {
      const s = storeOf([item('a')], [edge('relates', T('a'), T('h'))]);
      expect(walk(s, T('a'), ALL_GROUPS, 5, everyone).order).toEqual([T('a')]);
      const s2 = storeOf([item('a'), item('h')], [edge('relates', T('a'), T('h'))]);
      expect(walk(s2, T('a'), ALL_GROUPS, 5, everyone).order).toEqual([T('a'), T('h')]);
    });

    it('27.217 ring order is spec §2.2: typed links, structure, references, people; newest first within a group; control: the mockup label order would put b01 first', () => {
      const s = storeOf(
        [item('a'), item('b01'), item('b02'), item('n1', { kind: 'note' }), item('u1', { kind: 'person' })],
        [edge('parent', T('a'), T('b01')), edge('blocks', T('a'), T('b02')), edge('ref', N('n1'), T('a')), edge('assignee', P('u1'), T('a'))],
      );
      expect(walk(s, T('a'), ALL_GROUPS, 1, everyone).order).toEqual([T('a'), T('b02'), T('b01'), N('n1'), P('u1')]);
      const s2 = storeOf([item('a'), item('b01'), item('b02')], [edge('parent', T('a'), T('b01')), edge('parent', T('a'), T('b02'))]);
      expect(walk(s2, T('a'), ALL_GROUPS, 1, everyone).order).toEqual([T('a'), T('b02'), T('b01')]); // newest (larger ULID) first
    });

    it('27.218 a rejected concept (the `gone` set) is skipped; control: without it, it is reached', () => {
      const s = storeOf([item('a'), item('c1', { kind: 'concept', ws: 'w1', project: null })], [edge('tag', 'concept:c1', T('a'))]);
      expect(walk(s, T('a'), ALL_GROUPS, 2, everyone, new Set(['concept:c1'])).order).toEqual([T('a')]);
      expect(walk(s, T('a'), ALL_GROUPS, 2, everyone).order).toEqual([T('a'), 'concept:c1']);
    });
  });
  ```

  `src/engine/walk.ts`:
  ```ts
  import { GROUP_OF_EDGE_KIND, GROUP_RANK, compareRingEntries, type GraphEdgeView, type GraphGroup } from '@gisik-nokma/domain';
  import type { GraphStore } from './model.js';

  export type Walk = {
    dist: Map<string, number>;
    parent: Map<string, { from: string; edge: GraphEdgeView }>;
    kids: Map<string, string[]>;
    order: string[];
    out: Set<string>;
  };

  /**
   * Breadth-first from `center` over the loaded rings (port of `bfs`, `knowledge-graph-sigma.html:592-600`).
   * - Only edges in an enabled group are followed (§3.5 "Hidden groups are not walked").
   * - An item outside the scope is reached, marked `out`, and never walked past (§2.2, §3.1).
   * - An edge whose far end the store does not hold is ignored: the server never sends an item the viewer cannot see.
   * - Neighbours are taken in the spec's ring order (§2.2), not the mockup's `cmp` (`:591`).
   * `reach` is the last distance walked FROM; pass `reach + 1` to include the fog ring.
   */
  export function walk(
    store: GraphStore,
    center: string,
    on: ReadonlySet<GraphGroup>,
    reach: number,
    inScope: (ref: string) => boolean,
    gone: ReadonlySet<string> = new Set(),
  ): Walk {
    const dist = new Map<string, number>([[center, 0]]);
    const parent = new Map<string, { from: string; edge: GraphEdgeView }>();
    const kids = new Map<string, string[]>([[center, []]]);
    const order = [center];
    const out = new Set<string>();
    let queue = [center];
    while (queue.length > 0) {
      const next: string[] = [];
      for (const u of queue) {
        if ((dist.get(u) ?? 0) >= reach) continue;
        const around = (store.adj.get(u) ?? [])
          .filter((x) => on.has(GROUP_OF_EDGE_KIND[x.edge.kind]) && !gone.has(x.to) && store.items.has(x.to))
          .map((x) => ({ ...x, ref: x.to, rank: GROUP_RANK[GROUP_OF_EDGE_KIND[x.edge.kind]] }))
          .sort(compareRingEntries);
        for (const { to, edge } of around) {
          if (dist.has(to)) continue;
          dist.set(to, (dist.get(u) ?? 0) + 1);
          parent.set(to, { from: u, edge });
          kids.get(u)!.push(to);
          kids.set(to, []);
          order.push(to);
          if (inScope(to)) next.push(to);
          else out.add(to);
        }
      }
      queue = next;
    }
    return { dist, parent, kids, order, out };
  }
  ```
  Run as in Step 2. Expected: FAIL, then PASS. Commit.

- [ ] **Step 4: Zones, test first (27.219–27.224).** A port of `zones()` (`knowledge-graph-sigma.html:898-912`).

  `test/engine/zones.test.ts`:
  ```ts
  // @vitest-environment node
  import { describe, expect, it } from 'vitest';
  import { CLEAR_CAP, FOG_BUDGET, zones } from '../../src/engine/zones.js';
  import { ALL_GROUPS, edge, item, storeOf, T } from './fixture.js';

  /** A star: the centre with `n` children, each with one grandchild. */
  function star(n: number) {
    const items = [item('c')], edges = [];
    for (let i = 0; i < n; i += 1) {
      const k = `k${String(i).padStart(5, '0')}`, g = `g${String(i).padStart(5, '0')}`;
      items.push(item(k), item(g));
      edges.push(edge('parent', T('c'), T(k)), edge('parent', T(k), T(g)));
    }
    return storeOf(items, edges);
  }
  const base = { center: T('c'), on: ALL_GROUPS, inScope: () => true, semantic: true };

  describe('zones (port of zones(), knowledge-graph-sigma.html:898)', () => {
    it('27.219 clear = within the hops, fog = the next ring; control: one hop more moves the fog ring into the clear', () => {
      const z = zones(star(3), { ...base, reach: 1 });
      expect(z.clear).toHaveLength(4);
      expect(z.fog).toHaveLength(3);
      expect(z.clearHop).toBe(1);
      const z2 = zones(star(3), { ...base, reach: 2 });
      expect(z2.clear).toHaveLength(7);
      expect(z2.fog).toHaveLength(0);
    });

    it('27.220 the cap: 500 clear at most, the rest go to fog, `beyond` counts what is past both; control: 499 candidates are not capped', () => {
      const z = zones(star(600), { ...base, reach: 1 });
      expect(CLEAR_CAP).toBe(500);
      expect(z.clear).toHaveLength(500);
      expect(z.capped).toBe(true);
      expect(z.clearHop).toBe(1);
      expect(z.fog.length + z.beyond + z.clear.length).toBeGreaterThanOrEqual(601);
      const z2 = zones(star(498), { ...base, reach: 1 }); // 1 centre + 498 = 499
      expect(z2.capped).toBe(false);
      expect(z2.clear).toHaveLength(499);
    });

    it('27.221 the fog budget: 2,000 fog items at most; control: exactly 2,000 candidates are all kept', () => {
      expect(FOG_BUDGET).toBe(2000);
      const big = zones(star(2001), { ...base, reach: 0 }); // centre clear, 2,001 children fog
      expect(big.fog).toHaveLength(2000);
      const exact = zones(star(2000), { ...base, reach: 0 });
      expect(exact.fog).toHaveLength(2000);
    });

    it('27.222 an out-of-scope item is fog only beside a clear parent, and counted as outside; control: an in-scope one at the same place is clear', () => {
      const s = storeOf([item('c'), item('x', { project: 'p2' }), item('b')], [edge('relates', T('c'), T('x')), edge('relates', T('c'), T('b'))]);
      const z = zones(s, { ...base, reach: 2, inScope: (r) => r !== T('x') });
      expect(z.fogSet.has(T('x'))).toBe(true);
      expect(z.outN).toBe(1);
      expect(z.clearSet.has(T('b'))).toBe(true);
    });

    it('27.223 Everything (reach Infinity): the clear hop is the farthest clear item; control: a fixed reach reports itself', () => {
      const z = zones(star(3), { ...base, reach: Number.POSITIVE_INFINITY });
      expect(z.clearHop).toBe(2);
      expect(zones(star(3), { ...base, reach: 4 }).clearHop).toBe(4);
    });

    it('27.224 semantic layer Off: concepts are neither drawn nor walked; control: On, they are', () => {
      const s = storeOf([item('c'), item('k1', { kind: 'concept', project: null }), item('t')], [edge('tag', 'concept:k1', T('c')), edge('tag', 'concept:k1', T('t'))]);
      const off = zones(s, { ...base, reach: 2, semantic: false });
      expect(off.clear).toEqual([T('c')]);
      const on = zones(s, { ...base, reach: 2, semantic: true });
      expect(on.clearSet.has('concept:k1')).toBe(true);
      expect(on.clearSet.has(T('t'))).toBe(true);
    });
  });
  ```

  `src/engine/zones.ts`:
  ```ts
  import type { GraphGroup } from '@gisik-nokma/domain';
  import type { GraphStore } from './model.js';
  import { walk, type Walk } from './walk.js';

  export const CLEAR_CAP = 500;
  export const FOG_BUDGET = 2000;

  export type ZoneOptions = {
    center: string;
    on: ReadonlySet<GraphGroup>;
    /** Clear hops; `Infinity` = Everything. */
    reach: number;
    inScope: (ref: string) => boolean;
    semantic: boolean;
    gone?: ReadonlySet<string>;
    cap?: number;
  };
  export type Zones = { reach: number; walk: Walk; clear: string[]; clearSet: Set<string>; fog: string[]; fogSet: Set<string>; capped: boolean; beyond: number; clearHop: number; outN: number };

  /** What is clear, what is fog (past the hops, or outside the scope), what is further out. Port of `zones()` (`knowledge-graph-sigma.html:898-912`). */
  export function zones(store: GraphStore, opts: ZoneOptions): Zones {
    const cap = opts.cap ?? CLEAR_CAP;
    const on = opts.semantic ? opts.on : new Set([...opts.on].filter((g) => g !== 'concepts'));
    const res = walk(store, opts.center, on, opts.reach === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : opts.reach + 1, opts.inScope, opts.gone);
    let clear = res.order.filter((id) => !res.out.has(id) && (res.dist.get(id) ?? 0) <= opts.reach);
    if (!opts.semantic) clear = clear.filter((id) => !id.startsWith('concept:'));
    let capped = false;
    if (clear.length > cap) {
      clear = clear.slice(0, cap);
      capped = true;
    }
    const clearSet = new Set(clear);
    const lastD = res.dist.get(clear[clear.length - 1]!) ?? 0;
    const clearHop = capped ? lastD : opts.reach === Number.POSITIVE_INFINITY ? Math.max(...clear.map((id) => res.dist.get(id) ?? 0)) : opts.reach;
    const fogLimit = clearHop + 1;
    const fogAll = res.order.filter((id) => {
      if (clearSet.has(id)) return false;
      const from = res.parent.get(id)?.from;
      if (from === undefined || !clearSet.has(from)) return false;
      return res.out.has(id) || (res.dist.get(id) ?? 0) <= fogLimit;
    });
    const fog = fogAll.slice(0, FOG_BUDGET);
    const fogSet = new Set(fog);
    const beyond = capped ? res.order.filter((id) => !clearSet.has(id) && !fogSet.has(id)).length : 0;
    const outN = fog.filter((id) => res.out.has(id)).length;
    return { reach: opts.reach, walk: res, clear, clearSet, fog, fogSet, capped, beyond, clearHop, outN };
  }
  ```
  27.221 uses `reach: 0`, where the centre is the only clear item. Check that `walk`'s `reach + 1 = 1` reaches the children. It does.

  Run, then commit.

- [ ] **Step 5: Layout and levels, test first (27.225–27.231).** These port `CFG`/`radius`/`layout` (`knowledge-graph-sigma.html:602-617`), `nodeLabel` (`:760`), `nodeSub` (`:766`), and the `lvOf` line in `render` (`:921`).

  `test/engine/layout.test.ts` and `test/engine/levels.test.ts`:
  ```ts
  // @vitest-environment node
  import { describe, expect, it } from 'vitest';
  import { RING_CONFIGS, layoutRings, radius } from '../../src/engine/layout.js';
  import { levelOf, nodeLabel, nodeSub, truncate } from '../../src/engine/levels.js';
  import { walk } from '../../src/engine/walk.js';
  import { ALL_GROUPS, edge, item, storeOf, T } from './fixture.js';

  describe('levels and labels (port of nodeLabel/nodeSub, knowledge-graph-sigma.html:760-770)', () => {
    it('27.225 long names truncate with an ellipsis by code point, never splitting an emoji; control: a short name is untouched', () => {
      const long = 'x'.repeat(200);
      expect(truncate(long, 34)).toHaveLength(34);
      expect(truncate(long, 34).endsWith('…')).toBe(true);
      const emoji = '🧭🧭🧭🧭🧭🧭🧭🧭🧭🧭🧭🧭🧭🧭';
      expect([...truncate(emoji, 12)]).toHaveLength(12);
      expect(truncate(emoji, 12)).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // no lone high surrogate
      expect(truncate('Short', 12)).toBe('Short');
      expect(nodeSub(item('t', { title: long }), 'card', false)).toHaveLength(34);
    });

    it('27.226 levels by hop: desktop card → chip → compact → dot, phone cardS → tap, fog past the clear hop; control: Home uses desktop levels', () => {
      expect([0, 1, 2, 3, 6].map((d) => levelOf(RING_CONFIGS.desktop, d, false))).toEqual(['card', 'chip', 'compact', 'dot', 'dot']);
      expect([0, 1].map((d) => levelOf(RING_CONFIGS.phone, d, false))).toEqual(['cardS', 'tap']);
      expect(levelOf(RING_CONFIGS.desktop, 1, true)).toBe('fog');
      expect(RING_CONFIGS.home.levels).toEqual(RING_CONFIGS.desktop.levels);
    });

    it('27.227 labels: a ticket shows its key; a note shows "Note" on a card or desktop chip, else its title; a person their first name on a phone or at compact; control: dot and fog have no label', () => {
      const t = item('t1', { label: 'GN-142' }), n = item('n1', { kind: 'note', label: 'Phone pass rulings', title: 'Phone pass rulings' }), p = item('u', { kind: 'person', label: 'Ama Rangsa' });
      expect(nodeLabel(t, 'tap', true)).toBe('GN-142');
      expect(nodeLabel(n, 'chip', false)).toBe('Note');
      expect(nodeLabel(n, 'chip', true)).toBe('Phone pass …');
      expect(nodeLabel(n, 'compact', false)).toBe('Phone pass …');
      expect(nodeLabel(p, 'chip', false)).toBe('Ama Rangsa');
      expect(nodeLabel(p, 'compact', false)).toBe('Ama');
      expect(nodeLabel(p, 'chip', true)).toBe('Ama');
      expect(nodeLabel(t, 'dot', false)).toBe('');
      expect(nodeLabel(t, 'fog', false)).toBe('');
    });

    it('27.228 the second line: the title on a card (34) or desktop chip (24), the phone card (22); none on a phone tap or at compact; control: a person has none', () => {
      const t = item('t1', { title: 'Move sheet loses its scroll position on phone' });
      expect(nodeSub(t, 'card', false)).toBe('Move sheet loses its scroll posit…');
      expect(nodeSub(t, 'chip', false)).toBe('Move sheet loses its sc…');
      expect(nodeSub(t, 'cardS', true)).toBe('Move sheet loses its …');
      expect(nodeSub(t, 'tap', true)).toBeNull();
      expect(nodeSub(t, 'compact', false)).toBeNull();
      expect(nodeSub(item('u', { kind: 'person' }), 'card', false)).toBeNull();
    });
  });

  describe('layout (port of CFG/radius/layout, knowledge-graph-sigma.html:602-617)', () => {
    it('27.229 the centre sits at 0,0 and hop 1 spreads evenly from 12 o\'clock on the first ellipse; control: the radii are the mockup\'s', () => {
      const s = storeOf([item('c'), item('a'), item('b'), item('d'), item('e')], ['a', 'b', 'd', 'e'].map((x) => edge('relates', T('c'), T(x))));
      const w = walk(s, T('c'), ALL_GROUPS, 1, () => true);
      const pos = layoutRings(w, T('c'), RING_CONFIGS.desktop, (id) => w.dist.get(id) ?? 0);
      expect(pos.get(T('c'))).toEqual({ x: 0, y: 0 });
      const first = pos.get(w.order[1]!)!;
      expect(first.x).toBeCloseTo(0, 6);
      expect(first.y).toBeCloseTo(-185, 6); // angle −90°, ry 185
      expect(pos.get(w.order[2]!)!.x).toBeCloseTo(300, 6); // angle 0°, rx 300
      expect(RING_CONFIGS.desktop.R[1]).toEqual([300, 185]);
      expect(RING_CONFIGS.phone.R[1]).toEqual([150, 170]);
      expect(RING_CONFIGS.home.R[1]).toEqual([260, 150]);
    });

    it('27.230 children sit under their parent\'s angle, at least the ring\'s minimum step apart; control: a single child sits exactly on its parent\'s angle', () => {
      // 20 items on hop 1 leave each an 18° wedge, so a's three children (18/3 = 6°) are held apart by min[2] = 13°
      const fillers = Array.from({ length: 18 }, (_, i) => `f${String(i).padStart(2, '0')}`);
      const s = storeOf([item('c'), item('a'), item('k1'), item('k2'), item('k3'), item('b'), item('only'), ...fillers.map((f) => item(f))],
        [edge('relates', T('c'), T('a')), edge('relates', T('c'), T('b')), ...fillers.map((f) => edge('relates', T('c'), T(f))),
          ...['k1', 'k2', 'k3'].map((k) => edge('parent', T('a'), T(k))), edge('parent', T('b'), T('only'))]);
      const w = walk(s, T('c'), ALL_GROUPS, 2, () => true);
      const pos = layoutRings(w, T('c'), RING_CONFIGS.desktop, (id) => w.dist.get(id) ?? 0);
      const angle = (ref: string) => (Math.atan2(pos.get(ref)!.y / 290, pos.get(ref)!.x / 440) * 180) / Math.PI;
      const ks = ['k1', 'k2', 'k3'].map((k) => angle(T(k))).sort((x, y) => x - y);
      expect(ks[1]! - ks[0]!).toBeCloseTo(13, 6); // min[2] = 13°, not the 6° wedge share
      const parentAngle = (Math.atan2(pos.get(T('b'))!.y / 185, pos.get(T('b'))!.x / 300) * 180) / Math.PI;
      expect(angle(T('only'))).toBeCloseTo(parentAngle, 6);
    });

    it('27.231 radius past the table grows by 60 and 40 per hop; control: inside the table it is the table', () => {
      expect(radius(RING_CONFIGS.desktop.R, 7)).toEqual([690 + 120, 445 + 80]);
      expect(radius(RING_CONFIGS.desktop.R, 5)).toEqual([690, 445]);
    });
  });
  ```

  `src/engine/layout.ts`:
  ```ts
  import type { Level } from '../render/node-attributes.js';
  import type { Walk } from './walk.js';

  export type RingConfig = { R: readonly (readonly [number, number])[]; levels: readonly Level[]; min: readonly number[] };
  export type RingConfigName = 'desktop' | 'phone' | 'home';
  /** `CFG`, verbatim (`knowledge-graph-sigma.html:602-606`). */
  export const RING_CONFIGS: Record<RingConfigName, RingConfig> = {
    desktop: { R: [[0, 0], [300, 185], [440, 290], [545, 355], [625, 405], [690, 445]], levels: ['card', 'chip', 'compact', 'dot'], min: [0, 0, 13, 9, 7, 6] },
    phone: { R: [[0, 0], [150, 170], [240, 262], [300, 320], [340, 360], [370, 390]], levels: ['cardS', 'tap'], min: [0, 0, 16, 11, 8, 7] },
    home: { R: [[0, 0], [260, 150], [560, 330], [700, 420], [790, 480], [860, 520]], levels: ['card', 'chip', 'compact', 'dot'], min: [0, 0, 13, 9, 7, 6] },
  };

  /** `radius` (`:607`): past the table, +60 / +40 per hop. */
  export function radius(R: RingConfig['R'], h: number): [number, number] {
    if (h < R.length) return [R[h]![0], R[h]![1]];
    const last = R[R.length - 1]!;
    const extra = h - R.length + 1;
    return [last[0] + 60 * extra, last[1] + 40 * extra];
  }

  /** `layout` (`:608-617`): angles from −90°, hop 1 evenly; children centred on the parent's angle, `min[d+1]` apart. Layout y points DOWN; the adapter flips it. */
  export function layoutRings(w: Walk, center: string, cfg: RingConfig, ringOf: (ref: string) => number): Map<string, { x: number; y: number }> {
    const angle = new Map<string, { a: number; w: number }>([[center, { a: -90, w: 360 }]]);
    const pos = new Map<string, { x: number; y: number }>([[center, { x: 0, y: 0 }]]);
    const h1 = w.kids.get(center) ?? [];
    h1.forEach((id, i) => angle.set(id, { a: -90 + (i * 360) / h1.length, w: 360 / h1.length }));
    for (const id of w.order) {
      if (id === center) continue;
      const p = angle.get(id)!;
      const [rx, ry] = radius(cfg.R, ringOf(id));
      const rad = (p.a * Math.PI) / 180;
      pos.set(id, { x: rx * Math.cos(rad), y: ry * Math.sin(rad) });
      const ks = w.kids.get(id) ?? [];
      if (ks.length === 0) continue;
      const step = Math.max(p.w / ks.length, cfg.min[(w.dist.get(id) ?? 0) + 1] ?? 6);
      ks.forEach((k, j) => angle.set(k, { a: p.a + (j - (ks.length - 1) / 2) * step, w: step }));
    }
    return pos;
  }
  ```
  In 27.229 a value of `0` comes back as `-0` from `Math.cos`. If `toEqual({x:0,y:0})` trips on that for the centre, the centre is set literally, as above, so it does not.

  `src/engine/levels.ts`:
  ```ts
  import type { GraphItemView } from '@gisik-nokma/domain';
  import type { Level } from '../render/node-attributes.js';
  import type { RingConfig } from './layout.js';

  const big = (lv: Level | 'fog') => lv === 'card' || lv === 'cardS';
  const mid = (lv: Level | 'fog') => lv === 'chip' || lv === 'tap';

  /** The mockup's `trunc` (`:562`), by CODE POINT so an emoji is never split (Review Focus 4). */
  export function truncate(text: string, max: number): string {
    const chars = [...text];
    return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : text;
  }

  /** `lvOf` (`render`, `:921`). */
  export function levelOf(cfg: RingConfig, dist: number, fog: boolean): Level | 'fog' {
    return fog ? 'fog' : cfg.levels[Math.min(dist, cfg.levels.length - 1)]!;
  }

  const firstName = (name: string) => name.split(' ')[0] ?? name;

  /** `nodeLabel` (`:760-765`). */
  export function nodeLabel(item: GraphItemView, lv: Level | 'fog', phone: boolean): string {
    if (lv === 'dot' || lv === 'fog') return '';
    switch (item.kind) {
      case 'ticket': return item.label;
      case 'note': return big(lv) || (mid(lv) && !phone) ? 'Note' : truncate(item.title ?? item.label, 12);
      case 'person': return lv === 'compact' || phone ? firstName(item.label) : item.label;
      case 'concept': return truncate(item.label, phone ? 14 : mid(lv) || big(lv) ? 28 : 14);
      default: return truncate(item.label, 20);
    }
  }

  /** `nodeSub` (`:766-770`). Workspace and project counts are not on the wire in C (spec gap 10), so they have no second line. */
  export function nodeSub(item: GraphItemView, lv: Level | 'fog', phone: boolean): string | null {
    if (!(big(lv) || (mid(lv) && !phone))) return null;
    if (item.kind === 'ticket' || item.kind === 'note') return truncate(item.title ?? '', phone ? 22 : mid(lv) ? 24 : 34);
    return null;
  }
  ```
  Run, then commit.

- [ ] **Step 6: The sentences, test first (27.232–27.235).** These port `rel` (`:566-578`), `edgeText` (`:744`) and the `how` table in `edgeInsp` (`:988-991`).

  **Assignee direction.** `assignee` edges run person → ticket, so that the spec's own example reads right (§2.1: "Ama Rangsa is the assignee of GN-142"). The mockup stores them ticket → person (`:543`), with `rel` swapped (`:575`). The plan follows the spec; Task 1's `expand` already writes person → ticket.

  `test/engine/sentences.test.ts`:
  ```ts
  // @vitest-environment node
  import { describe, expect, it } from 'vitest';
  import { GRAPH_EDGE_KINDS } from '@gisik-nokma/domain';
  import { edgeSentence, formatGraphDate, howText, provenanceLine, relation } from '../../src/engine/sentences.js';
  import { edge, N, P, T } from './fixture.js';

  const labels: Record<string, string> = { [T('133')]: 'GN-133', [T('142')]: 'GN-142', [N('n1')]: 'Phone pass rulings', [P('ama')]: 'Ama Rangsa' };
  const labelOf = (ref: string) => labels[ref] ?? ref;

  describe('edge sentences (port of rel, knowledge-graph-sigma.html:566)', () => {
    it('27.232 every edge kind reads both ways; control: relates is symmetric and no kind falls through', () => {
      const table: Record<string, [string, string]> = {
        parent: ['has subtask', 'is a subtask of'], blocks: ['blocks', 'is blocked by'], relates: ['relates to', 'relates to'],
        duplicates: ['duplicates', 'is duplicated by'], attached: ['is attached to', 'has note'], ref: ['links to', 'is linked from'],
        mention: ['mentions', 'is mentioned in'], assignee: ['is the assignee of', 'is assigned to'], tag: ['includes', 'belongs to'], in: ['contains', 'is in'],
      };
      for (const kind of GRAPH_EDGE_KINDS) {
        const e = edge(kind, 'a:1', 'b:2');
        expect([relation(e, 'a:1'), relation(e, 'b:2')], kind).toEqual(table[kind]);
      }
      const sug = edge('tag', 'concept:1', T('1'), { suggested: true });
      expect([relation(sug, 'concept:1'), relation(sug, T('1'))]).toEqual(['may include', 'may belong to']);
    });

    it('27.233 the spec\'s three example sentences, verbatim (§2.1); control: the sentence always reads from the source', () => {
      expect(edgeSentence(edge('blocks', T('133'), T('142')), labelOf)).toBe('GN-133 blocks GN-142');
      expect(edgeSentence(edge('attached', N('n1'), T('142')), labelOf)).toBe('Phone pass rulings is attached to GN-142');
      expect(edgeSentence(edge('assignee', P('ama'), T('142')), labelOf)).toBe('Ama Rangsa is the assignee of GN-142');
      expect(edgeSentence(edge('blocks', T('142'), T('133')), labelOf)).toBe('GN-142 blocks GN-133');
    });

    it('27.234 provenance: who, when (IST, en-GB) and "via Claude" for an MCP origin; control: a web origin has no "via", and no author gives the date alone', () => {
      expect(formatGraphDate('2026-10-01T20:00:00.000Z')).toBe('2 Oct 2026'); // 01:30 IST next day
      expect(provenanceLine(edge('blocks', T('133'), T('142'), { addedBy: 'Bolsrang Momin', addedAt: '2026-10-01T05:00:00.000Z', origin: 'mcp' })))
        .toBe('Added by Bolsrang Momin on 1 Oct 2026, via Claude.');
      expect(provenanceLine(edge('blocks', T('133'), T('142'), { addedBy: 'Bolsrang Momin', addedAt: '2026-10-01T05:00:00.000Z', origin: 'web' })))
        .toBe('Added by Bolsrang Momin on 1 Oct 2026.');
      expect(provenanceLine(edge('attached', N('n1'), T('142'), { addedAt: '2026-09-29T05:00:00.000Z' }))).toBe('Added on 29 Sep 2026.');
      expect(provenanceLine(edge('parent', T('133'), T('142')))).toBeNull();
    });

    it('27.235 how each kind came to be (the mockup\'s `how`); control: every kind has one', () => {
      expect(howText(edge('ref', N('n1'), T('142')))).toBe('Comes from the text: edit the text to change it.');
      expect(howText(edge('assignee', P('ama'), T('142')))).toBe("From the ticket's Assignee field.");
      for (const kind of GRAPH_EDGE_KINDS) expect(howText(edge(kind, 'a:1', 'b:2')).length, kind).toBeGreaterThan(0);
    });
  });
  ```

  `src/engine/sentences.ts`:
  ```ts
  import type { GraphEdgeView } from '@gisik-nokma/domain';

  /** `rel` (`knowledge-graph-sigma.html:566-578`), read from `fromRef`'s side. Assignee is person → ticket here (spec §2.1's example). */
  export function relation(edge: GraphEdgeView, fromRef: string): string {
    const A = fromRef === edge.from;
    switch (edge.kind) {
      case 'parent': return A ? 'has subtask' : 'is a subtask of';
      case 'blocks': return A ? 'blocks' : 'is blocked by';
      case 'relates': return 'relates to';
      case 'duplicates': return A ? 'duplicates' : 'is duplicated by';
      case 'attached': return A ? 'is attached to' : 'has note';
      case 'ref': return A ? 'links to' : 'is linked from';
      case 'mention': return A ? 'mentions' : 'is mentioned in';
      case 'assignee': return A ? 'is the assignee of' : 'is assigned to';
      case 'tag': return A ? (edge.suggested ? 'may include' : 'includes') : edge.suggested ? 'may belong to' : 'belongs to';
      case 'in': return A ? 'contains' : 'is in';
    }
  }

  /** `edgeText` (`:744`): one sentence, read from the source, for the tooltip, the inspector and the list alike (§2.1). */
  export function edgeSentence(edge: GraphEdgeView, labelOf: (ref: string) => string): string {
    return `${labelOf(edge.from)} ${relation(edge, edge.from)} ${labelOf(edge.to)}`;
  }

  const HOW: Record<GraphEdgeView['kind'], string> = {
    parent: "Set from the subtask's Parent field.",
    blocks: 'A typed link.', relates: 'A typed link.', duplicates: 'A typed link.',
    attached: 'The note is attached to the ticket.',
    ref: 'Comes from the text: edit the text to change it.',
    mention: 'An @mention in the text.',
    assignee: "From the ticket's Assignee field.",
    tag: 'Tagged with this concept.',
    in: 'Where the item lives.',
  };
  /** The `how` table in `edgeInsp` (`:988-991`). A suggested tag keeps the mockup's sentence; a confirmed one gets a plain one, because D owns its provenance. */
  export function howText(edge: GraphEdgeView): string {
    if (edge.kind === 'tag' && edge.suggested) return 'Suggested by the model from how close the two are in meaning.';
    return HOW[edge.kind];
  }

  const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  export function formatGraphDate(iso: string): string {
    return DATE.format(new Date(iso));
  }

  /** "Added by X on D, via Claude." (§3.5). Kinds whose table records no author or date (parent, assignee, in) have none. */
  export function provenanceLine(edge: GraphEdgeView): string | null {
    if (edge.addedAt === null && edge.addedBy === null) return null;
    const who = edge.addedBy === null ? 'Added' : `Added by ${edge.addedBy}`;
    const when = edge.addedAt === null ? '' : ` on ${formatGraphDate(edge.addedAt)}`;
    return `${who}${when}${edge.origin === 'mcp' ? ', via Claude' : ''}.`;
  }
  ```
  If Node's ICU prints `Sept` for en-GB (newer ICU does), the test expectation is `29 Sept 2026`. Run once, read the actual output, and pin THAT in both the test and the copy rules. Record which one in DONE.

  Run, then commit.

- [ ] **Step 7: Index, catalogue, sweeps.**

  1. Add the engine exports to `src/index.ts`:
     ```ts
     export * from './engine/model.js';
     export * from './engine/walk.js';
     export * from './engine/zones.js';
     export * from './engine/layout.js';
     export * from './engine/levels.js';
     export * from './engine/sentences.js';
     export { kgNodeId, parseKgNodeId } from './ids.js';
     ```
  2. Add `"./ids": { "types": "./dist/ids.d.ts", "default": "./dist/ids.js" }` to `exports`.
  3. Under `<!-- KG-C T2 -->`, add ✅ 27.212–27.235, one id line each. 27.236–27.239 stay unallocated: no lines.
  4. Extend the Features ⚙️ bullet with "engine: walk, zones, layout, levels, sentences (`packages/knowledge-graph/src/engine/`)".

  **Mutations:**
  - In `walk.ts`, drop `&& store.items.has(x.to)`. 27.216 goes RED.
  - In `zones.ts`, change `clear.length > cap` to `>=`. 27.220's control goes RED.
  - In `layout.ts`, change `cfg.min[... + 1]` to `cfg.min[...]`. 27.230 goes RED.
  - In `sentences.ts`, swap the `assignee` arms. 27.233 goes RED.
  - In `levels.ts`, make `truncate` slice by `text.slice`. 27.225 goes RED.

  **Sweeps:** `pnpm --filter @gisik-nokma/knowledge-graph build`, then the package's whole suite, then `pnpm check:citations`. Push, then DONE.

---

### Task 3: The motion engine: camera spring, wheel, fit, glide, coast (cases 27.240–27.254)

**Depends on:** Task 1. It is parallel with Tasks 2 and 4.

**Files:**
- Create:
  - `packages/knowledge-graph/src/engine/{camera,wheel,fit,glide}.ts`
  - `packages/knowledge-graph/test/engine/{camera,wheel,fit,glide}.test.ts`
- Modify: `src/index.ts`, catalogue (`<!-- KG-C T3 -->`), Features bullet.

**Interfaces:**
- **Produces:**
  - `camera.ts`:
    - `type CameraState = { x: number; y: number; ratio: number }`;
    - `TAU_MS = 85`, `DT_MAX_MS = 100`, `MIN_ZOOM = 0.5`, `MAX_ZOOM = 4`, `SETTLE_MS = 160`, `RUBBER_POWER = 0.3`;
    - `springStep(current, target, dtMs, reduce): { state: CameraState; settled: boolean }`;
    - `clampRatio(r, fitRatio, soft)`;
    - `zoomTarget(base, factor, anchor, fitRatio, soft)`;
    - `settleFactor(target, fitRatio): number | null`;
    - `panTarget(base, dGraph)`.
  - `wheel.ts`:
    - `type WheelIntent = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number }`;
    - `wheelIntent(e)`.
  - `fit.ts`:
    - `type FitItem = { x; y; l; r; t; b }`;
    - `fitItemsFor(...)`, `solveFit(items, k1, viewport, topPx)`;
    - `TOP_PX = { phone: 52, desktop: 40 }`.
  - `glide.ts`:
    - `GLIDE_MS = 320`;
    - `easeOutCubic(k)`, `glideFrame(from, to, elapsedMs, reduce)`.
  - `coast.ts`:
    - `coastOffset(samples, now)`;
    - `COAST_MS = 300`.

All of this is pure. The Sigma adapter (Task 5) owns `requestAnimationFrame` and the coordinate conversions, and calls these each frame.

- [ ] **Step 1: The camera spring, test first (27.240–27.246).** This ports `loop` (`knowledge-graph-sigma.html:823-827`), `zoomAt` (`:831-834`), `settle` (`:835-836`) and `panBy` (`:837-839`).
  ```ts
  // @vitest-environment node
  import { describe, expect, it } from 'vitest';
  import { MAX_ZOOM, MIN_ZOOM, TAU_MS, clampRatio, panTarget, settleFactor, springStep, zoomTarget } from '../../src/engine/camera.js';

  const run = (from: { x: number; y: number; ratio: number }, to: typeof from, ms: number, frame = 16) => {
    let s = from, settled = false, t = 0;
    while (t < ms && !settled) ({ state: s, settled } = springStep(s, to, frame, false)), (t += frame);
    return { s, settled, t };
  };

  describe('the camera spring (port of loop/zoomAt/settle, knowledge-graph-sigma.html:823-836)', () => {
    it('27.240 critically damped, τ = 85 ms: 95% of the way by about 300 ms, and it settles exactly on the target; control: it never overshoots', () => {
      expect(TAU_MS).toBe(85);
      const a = { x: 0, y: 0, ratio: 1 }, b = { x: 1, y: 0, ratio: 1 };
      expect(run(a, b, 300).s.x).toBeGreaterThan(0.95);
      expect(run(a, b, 150).s.x).toBeLessThan(0.95); // "ABOUT 300 ms": 160 ms of 85 ms τ is 0.85; a faster τ (40 ms → 0.98) fails here
      const done = run(a, b, 5000);
      expect(done.settled).toBe(true);
      expect(done.s).toEqual(b);
      let s = a, max = 0;
      for (let i = 0; i < 100; i += 1) ({ state: s } = springStep(s, b, 16, false)), (max = Math.max(max, s.x));
      expect(max).toBeLessThanOrEqual(1);
    });

    it('27.241 dt is clamped to 100 ms (a stalled tab does not jump); control: a 100 ms step and a 1,000 ms step move the same', () => {
      const a = { x: 0, y: 0, ratio: 1 }, b = { x: 1, y: 0, ratio: 1 };
      expect(springStep(a, b, 1000, false).state.x).toBeCloseTo(springStep(a, b, 100, false).state.x, 12);
      expect(springStep(a, b, 50, false).state.x).toBeLessThan(springStep(a, b, 100, false).state.x);
    });

    it('27.242 prefers-reduced-motion makes the move instant; control: without it, one frame is partial', () => {
      const a = { x: 0, y: 0, ratio: 1 }, b = { x: 1, y: 2, ratio: 0.5 };
      expect(springStep(a, b, 16, true)).toEqual({ state: b, settled: true });
      expect(springStep(a, b, 16, false).settled).toBe(false);
    });

    it('27.243 the zoom ratio eases geometrically (equal steps feel equal); control: halfway in time is the geometric mean, not the arithmetic', () => {
      const a = { x: 0, y: 0, ratio: 4 }, b = { x: 0, y: 0, ratio: 1 };
      const k = 1 - Math.exp(-16 / TAU_MS);
      expect(springStep(a, b, 16, false).state.ratio).toBeCloseTo(4 * Math.pow(1 / 4, k), 12);
      // the control the title names: at a = 1/2 (dt = τ·ln 2) the ratio is the geometric mean 2, not the arithmetic 2.5
      expect(springStep(a, b, TAU_MS * Math.LN2, false).state.ratio).toBeCloseTo(2, 9);
    });

    it('27.244 limits 0.5×–4× of the fit; past one, a soft zoom rubber-bands with power 0.3; control: inside the range nothing changes', () => {
      const fit = 1;
      expect([MIN_ZOOM, MAX_ZOOM]).toEqual([0.5, 4]);
      expect(clampRatio(0.1, fit, false)).toBe(0.25); // fit / 4
      expect(clampRatio(5, fit, false)).toBe(2); // fit / 0.5
      expect(clampRatio(0.1, fit, true)).toBeCloseTo(0.25 * Math.pow(0.1 / 0.25, 0.3), 12);
      expect(clampRatio(5, fit, true)).toBeCloseTo(2 * Math.pow(5 / 2, 0.3), 12); // the zoomed-OUT rubber band
      expect(clampRatio(0.7, fit, true)).toBe(0.7);
      // "of the fit": with fit = 1 a limit that ignored fitRatio would pass every leg above
      expect(clampRatio(0.1, 2, false)).toBe(0.5);
      expect(clampRatio(5, 2, false)).toBe(4);
    });

    it('27.245 zoom keeps the anchor fixed: the anchor\'s offset from the camera scales with the ratio; control: zooming about the camera centre leaves x,y alone', () => {
      const base = { x: 0.5, y: 0.5, ratio: 1 }, anchor = { x: 0.8, y: 0.3 };
      const t = zoomTarget(base, 2, anchor, 1, false);
      expect(t.ratio).toBe(0.5);
      expect((anchor.x - t.x) / t.ratio).toBeCloseTo((anchor.x - base.x) / base.ratio, 12);
      expect((anchor.y - t.y) / t.ratio).toBeCloseTo((anchor.y - base.y) / base.ratio, 12);
      const c = zoomTarget(base, 2, { x: 0.5, y: 0.5 }, 1, false);
      expect([c.x, c.y]).toEqual([0.5, 0.5]);
      // the target is clamped, hard or soft as asked: 8× from ratio 1 is past the 4× limit (fit/4 = 0.25)
      expect(zoomTarget(base, 8, anchor, 1, false).ratio).toBe(0.25);
      expect(zoomTarget(base, 8, anchor, 1, true).ratio).toBeCloseTo(0.25 * Math.pow(0.125 / 0.25, 0.3), 12);
    });

    it('27.246 settling after an over-zoom: the factor back to the limit; control: a target inside the limits needs none, and a pan only moves x,y', () => {
      expect(settleFactor({ x: 0, y: 0, ratio: 0.2 }, 1)).toBeCloseTo(0.2 / 0.25, 12);
      expect(settleFactor({ x: 0, y: 0, ratio: 3 }, 1)).toBeCloseTo(3 / 2, 12); // over-zoomed OUT: back to fit/0.5
      expect(settleFactor({ x: 0, y: 0, ratio: 0.6 }, 1)).toBeNull();
      expect(panTarget({ x: 0.5, y: 0.5, ratio: 0.6 }, { x: 0.1, y: -0.2 })).toEqual({ x: 0.6, y: 0.3, ratio: 0.6 });
    });
  });
  ```
  Kills:
  - 27.240: (a) `/ TAU_MS` → `/ 40` in `springStep` (the 150 ms leg) (b) delete the settle snap (`if (Math.abs(n.x - t.x) < 1e-5 …) return { state: { ...t }, settled: true }`): `done.settled` stays false (c) `(t.x - c.x) * a` → `(t.x - c.x) * a * 8` (overshoot leg).
  - 27.241: (a) `Math.min(DT_MAX_MS, …)` → the raw dt (b) `DT_MAX_MS = 100` → `50` (the 50 ms < 100 ms leg).
  - 27.242: (a) delete `if (reduce) return { state: { ...t }, settled: true };`.
  - 27.243: (a) `ratio: c.ratio * Math.pow(t.ratio / c.ratio, a)` → `c.ratio + (t.ratio - c.ratio) * a` (both legs; the τ·ln 2 leg alone reads 2.5).
  - 27.244: (a) `RUBBER_POWER` 0.3 → 1 (b) in the `r > hi` arm, `hi * Math.pow(r / hi, …)` → `hi` (soft ignored on the zoomed-out side) (c) `fitRatio / MAX_ZOOM` → `1 / MAX_ZOOM` (the fit = 2 legs).
  - 27.245: (a) `(base.x - anchor.x) * k` → `* (1 / k)` (b) `const r = clampRatio(base.ratio / factor, fitRatio, soft)` → `base.ratio / factor` (the 8× legs) (c) pass `false` for `soft` inside `zoomTarget` (the soft 8× leg).
  - 27.246: (a) `Math.min(fitRatio / MIN_ZOOM, target.ratio)` → `target.ratio` (the ratio 3 leg) (b) `return r === target.ratio ? null : …` → `… : r / target.ratio` (c) `panTarget` returns `y: base.y - d.y`.
  `src/engine/camera.ts`:
  ```ts
  export type CameraState = { x: number; y: number; ratio: number };
  export const TAU_MS = 85;
  export const DT_MAX_MS = 100;
  export const MIN_ZOOM = 0.5;
  export const MAX_ZOOM = 4;
  export const SETTLE_MS = 160;
  export const RUBBER_POWER = 0.3;

  /** One frame of the critically damped spring (`loop`, `:823-827`). Ratio interpolates geometrically. */
  export function springStep(c: CameraState, t: CameraState, dtMs: number, reduce: boolean): { state: CameraState; settled: boolean } {
    if (reduce) return { state: { ...t }, settled: true };
    const a = 1 - Math.exp(-Math.min(DT_MAX_MS, Math.max(0, dtMs)) / TAU_MS);
    const n = { x: c.x + (t.x - c.x) * a, y: c.y + (t.y - c.y) * a, ratio: c.ratio * Math.pow(t.ratio / c.ratio, a) };
    if (Math.abs(n.x - t.x) < 1e-5 && Math.abs(n.y - t.y) < 1e-5 && Math.abs(n.ratio / t.ratio - 1) < 1e-4) return { state: { ...t }, settled: true };
    return { state: n, settled: false };
  }

  /** The limits of `zoomAt` (`:831-832`): Sigma's ratio is inverse zoom, so 4× = fit/4 and 0.5× = fit/0.5. */
  export function clampRatio(r: number, fitRatio: number, soft: boolean): number {
    const lo = fitRatio / MAX_ZOOM, hi = fitRatio / MIN_ZOOM;
    if (r < lo) return soft ? lo * Math.pow(r / lo, RUBBER_POWER) : lo;
    if (r > hi) return soft ? hi * Math.pow(r / hi, RUBBER_POWER) : hi;
    return r;
  }

  /** `zoomAt` (`:831-834`). `anchor` is the graph point under the pointer, read with `{ cameraState: base }` (§4.2 trap 8). */
  export function zoomTarget(base: CameraState, factor: number, anchor: { x: number; y: number }, fitRatio: number, soft: boolean): CameraState {
    const r = clampRatio(base.ratio / factor, fitRatio, soft);
    const k = r / base.ratio;
    return { x: anchor.x + (base.x - anchor.x) * k, y: anchor.y + (base.y - anchor.y) * k, ratio: r };
  }

  /** `settle` (`:835-836`): the factor that brings an over-zoomed target back inside, or null. */
  export function settleFactor(target: CameraState, fitRatio: number): number | null {
    const r = Math.max(fitRatio / MAX_ZOOM, Math.min(fitRatio / MIN_ZOOM, target.ratio));
    return r === target.ratio ? null : target.ratio / r;
  }

  /** `panBy` (`:837-839`), with the graph delta already converted by the adapter. */
  export function panTarget(base: CameraState, d: { x: number; y: number }): CameraState {
    return { x: base.x + d.x, y: base.y + d.y, ratio: base.ratio };
  }
  ```
  Run, then commit.

- [ ] **Step 2: Wheel classification, test first (27.247, 27.248).** This ports `onWheel` (`:840-846`).
  ```ts
  // @vitest-environment node
  import { describe, expect, it } from 'vitest';
  import { wheelIntent } from '../../src/engine/wheel.js';
  const w = (o: Partial<{ deltaMode: number; deltaX: number; deltaY: number; ctrlKey: boolean }>) => ({ deltaMode: 0, deltaX: 0, deltaY: 0, ctrlKey: false, ...o });

  describe('the wheel (port of onWheel, knowledge-graph-sigma.html:840)', () => {
    it('27.247 ctrl+wheel (and a trackpad pinch) zooms, a notched mouse wheel zooms, a two-finger scroll pans; control: a fractional pixel delta of 39.5 pans', () => {
      expect(wheelIntent(w({ ctrlKey: true, deltaY: 10 }))).toEqual({ kind: 'zoom', factor: Math.exp(-10 * 0.012) });
      expect(wheelIntent(w({ deltaY: 100 }))).toEqual({ kind: 'zoom', factor: Math.exp(-100 * 0.0022) });
      expect(wheelIntent(w({ deltaX: 3, deltaY: 12 }))).toEqual({ kind: 'pan', dx: 3, dy: 12 });
      expect(wheelIntent(w({ deltaY: 39.5 }))).toEqual({ kind: 'pan', dx: 0, dy: 39.5 });
      // 39.5 is refused by BOTH the ≥ 40 and the integer test; each needs its own leg
      expect(wheelIntent(w({ deltaY: 40.5 }))).toEqual({ kind: 'pan', dx: 0, dy: 40.5 }); // big but fractional: a trackpad
      expect(wheelIntent(w({ deltaX: 1, deltaY: 100 }))).toEqual({ kind: 'pan', dx: 1, dy: 100 }); // any sideways component: a trackpad
      expect(wheelIntent(w({ deltaY: -100 }))).toEqual({ kind: 'zoom', factor: Math.exp(100 * 0.0022) }); // a notch the other way
    });
    it('27.248 line and page delta modes scale by 16 and 400 and count as a mouse wheel; control: pixel mode is unscaled', () => {
      expect(wheelIntent(w({ deltaMode: 1, deltaY: 3 }))).toEqual({ kind: 'zoom', factor: Math.exp(-48 * 0.0022) });
      expect(wheelIntent(w({ deltaMode: 2, deltaY: 1 }))).toEqual({ kind: 'zoom', factor: Math.exp(-400 * 0.0022) });
      // 48 and 400 would pass the pixel rule anyway; one line (16 px) does not, so only "a line mode IS a wheel" zooms it
      expect(wheelIntent(w({ deltaMode: 1, deltaY: 1 }))).toEqual({ kind: 'zoom', factor: Math.exp(-16 * 0.0022) });
      expect(wheelIntent(w({ deltaY: 5 }))).toEqual({ kind: 'pan', dx: 0, dy: 5 });
    });
  });
  ```
  Kills:
  - 27.247: (a) drop `&& Number.isInteger(dy)` (the 40.5 leg) (b) drop `dx === 0 &&` (the `deltaX: 1, deltaY: 100` leg) (c) `Math.abs(dy) >= 40` → `dy >= 40` (the −100 leg) (d) swap `0.012` and `0.0022`.
  - 27.248: (a) drop `e.deltaMode !== 0 ||` (the one-line leg) (b) `deltaMode === 1 ? 16` → `? 1` (c) the pixel default `: 1` → `: 16` (the `deltaY: 5` leg turns into an 80 px notch).
  `src/engine/wheel.ts`:
  ```ts
  export type WheelIntent = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number };
  /** `onWheel` (`:840-846`): ctrl (and a trackpad pinch, which arrives as ctrl+wheel) zooms; a notched wheel zooms; a pixel scroll pans. */
  export function wheelIntent(e: { deltaMode: number; deltaX: number; deltaY: number; ctrlKey: boolean }): WheelIntent {
    const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * px, dy = e.deltaY * px;
    const mouseWheel = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 40 && Number.isInteger(dy));
    if (e.ctrlKey) return { kind: 'zoom', factor: Math.exp(-dy * 0.012) };
    if (mouseWheel) return { kind: 'zoom', factor: Math.exp(-dy * 0.0022) };
    return { kind: 'pan', dx, dy };
  }
  ```
  Run, then commit.

- [ ] **Step 3: The fit, test first (27.249, 27.250).** This ports `computeFit` (`:854-863`) and the `fitItems` block in `render` (`:922-927`).
  ```ts
  // @vitest-environment node
  import { describe, expect, it } from 'vitest';
  import { TOP_PX, fitItemsFor, solveFit } from '../../src/engine/fit.js';

  describe('the fit (port of computeFit, knowledge-graph-sigma.html:854)', () => {
    it('27.249 the solved camera frames every item including its label inside the viewport less 8 px a side, under the top bar; control: one item moved far out widens the ratio', () => {
      const items = [{ x: -300, y: 0, l: 16, r: 120, t: 14, b: 14 }, { x: 300, y: 0, l: 16, r: 220, t: 14, b: 14 }, { x: 0, y: -185, l: 16, r: 90, t: 18, b: 36 }];
      const vp = { width: 800, height: 500 };
      // 800 × 500 is WIDTH-bound (the top edge has ~120 px spare, so it cannot see the top bar); 1600 × 300 is HEIGHT-bound
      for (const v of [vp, { width: 1600, height: 300 }]) {
        const f = solveFit(items, 1, v, TOP_PX.desktop);
        const k = 1 / f.ratio;
        const box = items.map((o) => {
          const sx = (o.x - f.cx) * k + v.width / 2, sy = (o.y - f.cy) * k + v.height / 2;
          return { L: sx - o.l, R: sx + o.r, T: sy - o.t, B: sy + o.b };
        });
        const L = Math.min(...box.map((q) => q.L)), R = Math.max(...box.map((q) => q.R));
        const T = Math.min(...box.map((q) => q.T)), B = Math.max(...box.map((q) => q.B));
        expect(L, `${v.width}`).toBeGreaterThanOrEqual(8 - 0.5);
        expect(R, `${v.width}`).toBeLessThanOrEqual(v.width - 8 + 0.5);
        expect(T, `${v.width}`).toBeGreaterThanOrEqual(8 + TOP_PX.desktop - 0.5);
        expect(B, `${v.width}`).toBeLessThanOrEqual(v.height - 8 + 0.5);
        // tight on the bounding axis: the fit does not zoom out further than it must (measured slack: 0.03 px, 0.03 px)
        expect(Math.min(L - 8, v.width - 8 - R, T - 8 - TOP_PX.desktop, v.height - 8 - B), `${v.width}`).toBeLessThan(0.5);
      }
      const f = solveFit(items, 1, vp, TOP_PX.desktop);
      const wider = solveFit([...items, { x: 900, y: 0, l: 16, r: 60, t: 14, b: 14 }], 1, vp, TOP_PX.desktop);
      expect(wider.ratio).toBeGreaterThan(f.ratio);
    });

    it('27.250 the fit holds each label (right of the dot; a person\'s below; the centre\'s over it) and the fog ring at 0.9 (desktop) or 0.82 (phone); control: no fog, no ring points', () => {
      const clear = [
        { ref: 'ticket:c', x: 0, y: 0, kind: 'ticket' as const, label: 'GN-142', sub: 'Move sheet loses its scroll', center: true },
        { ref: 'person:u', x: 300, y: 0, kind: 'person' as const, label: 'Ama Rangsa', sub: null, center: false },
        { ref: 'ticket:a', x: 0, y: 185, kind: 'ticket' as const, label: 'GN-133', sub: null, center: false },
      ];
      const withFog = fitItemsFor(clear, { fogRadius: [440, 290], phone: false });
      expect(withFog).toHaveLength(7);
      expect(withFog[3]).toEqual({ x: 440 * 0.9, y: 0, l: 4, r: 4, t: 4, b: 4 });
      expect(withFog[5]).toEqual({ x: 0, y: 290 * 0.9, l: 4, r: 4, t: 4, b: 4 }); // the VERTICAL radius is the second one
      expect(withFog[1]!.b).toBe(42); // a labelled person: label below
      expect(withFog[2]).toEqual({ x: 0, y: 185, l: 16, r: 6 * 7 + 34, t: 14, b: 14 });
      // the centre's label is OVER it: centred, as wide as its longer line (27 chars × 6.9 + 34), half each side + 8
      expect(withFog[0]).toMatchObject({ x: 0, y: 0, t: 30, b: 30 });
      expect(withFog[0]!.l).toBeCloseTo((27 * 6.9 + 34) / 2 + 8, 9);
      expect(withFog[0]!.r).toBeCloseTo((27 * 6.9 + 34) / 2 + 8, 9);
      expect(fitItemsFor(clear, { fogRadius: [240, 262], phone: true })[3]!.x).toBeCloseTo(240 * 0.82, 9);
      expect(fitItemsFor(clear, { fogRadius: null, phone: false })).toHaveLength(3);
    });
  });
  ```
  Kills:
  - 27.249: (a) delete `T -= topPx;` (the 1600 × 300 run's top edge lands at 8, not 48) (b) `r = r * Math.max(…)` → `r = 2 * r * Math.max(…)` (the tightness leg) (c) `viewport.width - 16` → `viewport.width` (the right-edge leg).
  - 27.250: (a) `b: o.label ? 42 : 18` → `b: 18` (b) `y: b * opts.fogRadius[1] * k` → `* opts.fogRadius[0]` (the `withFog[5]` leg) (c) the centre arm returns the off-centre box `{ l: 16, r: w, … }` (the `withFog[0]` legs) (d) `opts.phone ? 0.82 : 0.9` → `0.9`.
  `src/engine/fit.ts`:
  ```ts
  import type { GraphItemKind } from '@gisik-nokma/domain';

  export type FitItem = { x: number; y: number; l: number; r: number; t: number; b: number };
  export const TOP_PX = { phone: 52, desktop: 40 } as const;

  /** The fit's items (`render`, `:922-927`): each clear item with its label's extent in screen px; 4 points on the fog ring. Layout coords, y down. */
  export function fitItemsFor(
    clear: readonly { x: number; y: number; kind: GraphItemKind; label: string; sub: string | null; center: boolean }[],
    opts: { fogRadius: readonly [number, number] | null; phone: boolean },
  ): FitItem[] {
    const out: FitItem[] = clear.map((o) => {
      if (o.kind === 'person') {
        const w = Math.max((o.label.length * 7) / 2 + 8, 18);
        return { x: o.x, y: o.y, l: w, r: w, t: 18, b: o.label ? 42 : 18 };
      }
      const w = Math.max(o.label.length * (o.center ? 8.4 : 7), (o.sub ?? '').length * 6.9) + (o.label ? 34 : 10);
      if (o.center) return { x: o.x, y: o.y, l: w / 2 + 8, r: w / 2 + 8, t: o.sub ? 30 : 16, b: o.sub ? 30 : 16 };
      return { x: o.x, y: o.y, l: 16, r: w, t: o.sub ? 18 : 14, b: o.sub ? 36 : 14 };
    });
    if (opts.fogRadius !== null) {
      const k = opts.phone ? 0.82 : 0.9;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) out.push({ x: a * opts.fogRadius[0] * k, y: b * opts.fogRadius[1] * k, l: 4, r: 4, t: 4, b: 4 });
    }
    return out;
  }

  /**
   * `computeFit` (`:854-863`), without Sigma: `k1` is screen px per layout unit at ratio 1 (the adapter measures it with
   * `graphToViewport` at a unit camera). Returns the layout-space centre (y down) and the ratio; the adapter normalises
   * the centre with `getNormalizationFunction()({ x: cx, y: -cy })`. Four rounds, because a label's px size does not scale.
   */
  export function solveFit(items: readonly FitItem[], k1: number, viewport: { width: number; height: number }, topPx: number): { cx: number; cy: number; ratio: number } {
    let r = 1;
    let box = { L: 0, R: 0, T: 0, B: 0, k: k1 };
    for (let it = 0; it < 4; it += 1) {
      const k = k1 / r;
      let L = Infinity, R = -Infinity, T = Infinity, B = -Infinity;
      for (const o of items) {
        const x = o.x * k, y = o.y * k;
        L = Math.min(L, x - o.l); R = Math.max(R, x + o.r); T = Math.min(T, y - o.t); B = Math.max(B, y + o.b);
      }
      T -= topPx;
      box = { L, R, T, B, k };
      r = r * Math.max((R - L) / (viewport.width - 16), (B - T) / (viewport.height - 16));
    }
    return { cx: (box.L + box.R) / 2 / box.k, cy: (box.T + box.B) / 2 / box.k, ratio: r };
  }
  ```
  The test's projection treats the ratio as "layout units per px ÷ k1". `k1 = 1` keeps the arithmetic readable. Four rounds converge to within a pixel, so each bound has 0.5 px of slack. If a bound misses by more, the port is wrong: do not widen the slack.

  Run, then commit.

- [ ] **Step 4: Glide and coast, test first (27.251, 27.252).** This ports `glide` (`:890-896`). Coast is new (§3.6 "Momentum after a drag pan"). The mockup relies on whatever Sigma's drag does, and Task 5's 27.285 measures whether Sigma v4 coasts by itself. `coastOffset` is used ONLY if it does not (Task 5, Step 6).
  ```ts
  // @vitest-environment node
  import { describe, expect, it } from 'vitest';
  import { COAST_MS, coastOffset } from '../../src/engine/coast.js';
  import { GLIDE_MS, easeOutCubic, glideFrame } from '../../src/engine/glide.js';

  describe('glide and coast', () => {
    it('27.251 the glide eases out over 320 ms and ends exactly on the new layout; an item that did not move does not tween; control: reduced motion lands at once', () => {
      expect(GLIDE_MS).toBe(320);
      expect(easeOutCubic(0.5)).toBe(0.875);
      // 'n' is NEW (in `to` only): it must start at its target, not fly in
      const from = new Map([['a', { x: 0, y: 0 }], ['s', { x: 5, y: 5 }]]), to = new Map([['a', { x: 100, y: 0 }], ['s', { x: 5, y: 5 }], ['n', { x: 50, y: 50 }]]);
      const half = glideFrame(from, to, 160, false);
      expect(half.positions.get('a')!.x).toBeCloseTo(87.5, 9); // a literal: 100 × (1 − 0.5³), so a linear easeOutCubic fails too
      expect(half.positions.get('s')).toBe(to.get('s')); // the unmoved item is the target ITSELF: the shortcut, not a recomputed copy
      expect(half.positions.get('n')).toEqual({ x: 50, y: 50 });
      expect(half.done).toBe(false);
      expect(glideFrame(from, to, 320, false)).toEqual({ positions: to, done: true });
      expect(glideFrame(from, to, 0, true)).toEqual({ positions: to, done: true });
    });

    it('27.252 a released drag coasts on in its last direction for 300 ms of travel; control: a drag that stopped before release does not coast', () => {
      expect(COAST_MS).toBe(300);
      const moving = [{ t: 0, x: 0, y: 0 }, { t: 50, x: 50, y: 0 }, { t: 100, x: 100, y: 0 }];
      expect(coastOffset(moving, 100)).toEqual({ x: 300, y: 0 }); // 1 px/ms × 300 ms
      expect(coastOffset([...moving, { t: 200, x: 100, y: 0 }], 200)).toEqual({ x: 0, y: 0 });
      // the OTHER "stopped" arm: no new sample, but the pointer rested 50 ms before release
      expect(coastOffset(moving, 150)).toEqual({ x: 0, y: 0 });
    });
  });
  ```
  Kills:
  - 27.251: (a) `from.get(id) ?? t` → `from.get(id) ?? { x: 0, y: 0 }` (the `n` leg) (b) drop the `f.x === t.x && f.y === t.y ? t :` shortcut (the `toBe` leg; it is otherwise invisible) (c) `elapsedMs >= GLIDE_MS` → `elapsedMs > GLIDE_MS` (the 320 ms leg) (d) `easeOutCubic` → `(k) => k`.
  - 27.252: (a) delete `now - last.t >= 50 ||` (the `now = 150` leg) (b) `last.t - s.t <= 100` → `<= 1000` (the `t = 200` leg reads 150) (c) `y: ((last.y - first.y) …` → `((last.x - first.x) …`.
  `src/engine/glide.ts`:
  ```ts
  export const GLIDE_MS = 320;
  export const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);
  type Pt = { x: number; y: number };
  /** `glide` (`:890-896`): items tween from where they were; one with no `from` starts at its target, so it does not fly in. */
  export function glideFrame(from: ReadonlyMap<string, Pt>, to: ReadonlyMap<string, Pt>, elapsedMs: number, reduce: boolean): { positions: Map<string, Pt>; done: boolean } {
    if (reduce || elapsedMs >= GLIDE_MS) return { positions: new Map(to), done: true };
    const e = easeOutCubic(Math.max(0, elapsedMs) / GLIDE_MS);
    const positions = new Map<string, Pt>();
    for (const [id, t] of to) {
      const f = from.get(id) ?? t;
      positions.set(id, f.x === t.x && f.y === t.y ? t : { x: f.x + (t.x - f.x) * e, y: f.y + (t.y - f.y) * e });
    }
    return { positions, done: false };
  }
  ```
  `src/engine/coast.ts`:
  ```ts
  export const COAST_MS = 300;
  type Sample = { t: number; x: number; y: number };
  /** Velocity over the last 100 ms of pointer samples (screen px/ms) × 300 ms (the spring's visible settle, §3.6). Zero if the pointer rested ≥ 50 ms before release. */
  export function coastOffset(samples: readonly Sample[], now: number): { x: number; y: number } {
    const last = samples[samples.length - 1];
    if (last === undefined || now - last.t >= 50) return { x: 0, y: 0 };
    const recent = samples.filter((s) => last.t - s.t <= 100);
    const first = recent[0]!;
    const dt = last.t - first.t;
    if (dt <= 0) return { x: 0, y: 0 };
    return { x: ((last.x - first.x) / dt) * COAST_MS, y: ((last.y - first.y) / dt) * COAST_MS };
  }
  ```
  In 27.252's control, the last sample is at `t = 200` with no movement since `t = 100`. The 100 ms window then holds `{100,100}` and `{200,100}`, so dx is 0. Good.

  Run, then commit.

- [ ] **Step 5: Index, catalogue, sweeps.**
  - Export the four modules and `coast.ts` from `src/index.ts`.
  - Under `<!-- KG-C T3 -->`, add ✅ 27.240–27.252, one id line each. 27.253–27.254 stay unallocated.
  - Extend the Features bullet ("motion engine: spring, wheel, fit, glide, coast").

  **Mutations:**
  - `Math.min(DT_MAX_MS, …)` → the raw dt. 27.241 goes RED.
  - `RUBBER_POWER` 0.3 → 1. 27.244 goes RED.
  - In `zoomTarget`, `(base.x - anchor.x) * k` → `* (1 / k)`. 27.245 goes RED.
  - Delete the `T -= topPx` line. 27.249 goes RED.
  - In `glideFrame`, drop the unchanged-position shortcut AND start a new item at (0,0). 27.251 goes RED.

  (Test-strength pass, 2026-10-04: before that pass two of these could not go RED. 27.249's only viewport was width-bound, with ~120 px spare at the top, so deleting `T -= topPx` stayed green; it now also runs a height-bound 1600 × 300 viewport. 27.251 had no NEW item and its unmoved item was compared by value, so both halves of the glide mutant stayed green; it now has the new item `n` and compares `s` by identity. Run every `Kills:` line above, not only this list.)

  **Prose to sweep:**
  - `Features.md:3767` — the KG-C ⚙️ bullet ends "Cases 27.200–27.211." and names only Task 1's foundations; extending it with the motion engine must also extend the case range (27.240–27.252).

  **Sweeps:** build, the whole package, `check:citations`. Push, then DONE.

---

### Task 4: Graph colour tokens and their contrast guarantees (cases 27.255–27.262)

**Depends on:** Task 1 (the colour-scan root). It is parallel with Tasks 2 and 3.

**Files:**
- Modify:
  - `packages/ui/src/tokens.ts`: ten primitives, twelve roles, and their `themes.light`/`themes.dark` mappings and `CONTRAST_PAIRS` rows.
  - `packages/ui/test/tokens.test.ts`: the new cases.
  - The catalogue (`<!-- KG-C T4 -->`) and the Features bullet.

**Interfaces:**
- **Produces** these `TokenRole`s, emitted as CSS variables by the existing `themeStylesheet`:

  | Role | CSS variable |
  |---|---|
  | `edgeStructure` | `--gn-edge-structure` |
  | `edgeBlocks` | `--gn-edge-blocks` |
  | `edgeRelates` | `--gn-edge-relates` |
  | `edgeDuplicates` | `--gn-edge-duplicates` |
  | `edgeAttached` | `--gn-edge-attached` |
  | `edgeReference` | `--gn-edge-reference` |
  | `edgePeople` | `--gn-edge-people` |
  | `edgeConcept` | `--gn-edge-concept` |
  | `conceptFill` | `--gn-concept-fill` |
  | `conceptSoft` | `--gn-concept-soft` |
  | `fogDot` | `--gn-fog-dot` |
  | `graphCardLine` | `--gn-graph-card-line` |

  These are the twelve names `ThemePalette` (Task 1) already lists. Task 7's `readThemePalette` reads them.

The spec names its tokens `--e-*` (§3.7), but this repo emits every role as `--gn-<kebab>` (`cssVariableName`, `packages/ui/src/tokens.ts:1901`). The roles follow the repo: the spec's names are the mockup's and could never be emitted.

The mockup has twelve colours, not eleven. The cards' hairline is the mockup's `--line` / `field-line` (`knowledge-graph-sigma.html:7`, `:463`). No existing role maps to that primitive: `border` is `grayAccessible`, a much stronger grey (`tokens.ts:974`). So `graphCardLine` maps to the existing `line` / `seam` primitives.

- [ ] **Step 1: The cases, RED first.** Append to `packages/ui/test/tokens.test.ts`:
  ```ts
  /** 27.255–27.260 — the Knowledge Graph's colours (spec C §3.7). Values are the mockup's (knowledge-graph-sigma.html:6-28) except where a measured contrast failure forced a derived value (27.258). */
  describe('the Knowledge Graph colours', () => {
    const GRAPH_ROLES = ['edgeStructure', 'edgeBlocks', 'edgeRelates', 'edgeDuplicates', 'edgeAttached', 'edgeReference', 'edgePeople', 'edgeConcept', 'conceptFill', 'conceptSoft', 'fogDot', 'graphCardLine'] as const;

    it('27.255 twelve roles exist and emit --gn-* variables; control: the spec\'s --e-* names are not emitted', () => {
      for (const role of GRAPH_ROLES) expect(TOKEN_ROLES).toContain(role);
      expect(cssVariableName('edgeDuplicates')).toBe('--gn-edge-duplicates');
      expect(cssVariableName('graphCardLine')).toBe('--gn-graph-card-line');
      const sheet = themeStylesheet();
      expect(sheet).toContain('--gn-edge-blocks: #d70015;');
      // The spec's --e-* names: no code path could ever emit them, so `not.toContain('--e-blocks')` was no evidence. The
      // evidence is that every graph role IS emitted under --gn-*, with a real hex, in all NINE colour blocks
      // (hig, minimal, neo × light, dark media, dark attribute): a role missing from one theme map emits `undefined` there.
      for (const role of GRAPH_ROLES) {
        expect(sheet.match(new RegExp(`${cssVariableName(role)}: #[0-9a-f]{6};`, 'g')), role).toHaveLength(9);
      }
    });

    it('27.256 the mockup values, light and dark, where they pass; control: a value that differs from the mockup is only edgePeople', () => {
      const want: Record<string, [string, string]> = {
        edgeStructure: ['#5e5e62', '#a0a0a5'], edgeBlocks: ['#d70015', '#ff6961'], edgeRelates: ['#8944ab', '#da8fff'], edgeDuplicates: ['#b25000', '#ffb340'],
        edgeAttached: ['#33629f', '#7fa9e4'], edgeReference: ['#d30f45', '#ff6482'], edgeConcept: ['#0b7285', '#5ccfe0'],
        conceptFill: ['#d6e7e5', '#1e4350'], conceptSoft: ['#e8f0ee', '#1c3040'], fogDot: ['#b9b2a6', '#4a5578'], graphCardLine: ['#d9d6cf', '#3a3833'],
      };
      for (const [role, [light, dark]] of Object.entries(want)) {
        expect(colorOf('light', role as TokenRole), role).toBe(light);
        expect(colorOf('dark', role as TokenRole), role).toBe(dark);
      }
      expect(colorOf('light', 'edgePeople')).not.toBe('#a8a49a'); // the mockup's, which is `lineStrong`
      expect(colorOf('dark', 'edgePeople')).not.toBe('#57544c'); // the mockup's, which is `seamStrong`
      // `not.toBe` alone passes on `undefined` (a role with no mapping): pin the derived primitives too
      expect(colorOf('light', 'edgePeople')).toBe(primitives.peopleEdgeLight);
      expect(colorOf('dark', 'edgePeople')).toBe(primitives.peopleEdgeDark);
    });

    it('27.257 the declared pairs: every edge role on surface and surfaceRaised at 3, text on conceptFill and conceptSoft at 4.5 (the loop above measures them); control: a role absent from the array is reported missing', () => {
      const has = (fg: string, bg: string, min: number) => CONTRAST_PAIRS.some((p) => p.fg === fg && p.bg === bg && p.minimum === min);
      for (const role of GRAPH_ROLES.filter((r) => r.startsWith('edge'))) for (const bg of ['surface', 'surfaceRaised']) expect(has(role, bg, 3), `${role} on ${bg}`).toBe(true);
      for (const bg of ['conceptFill', 'conceptSoft']) expect(has('text', bg, 4.5), `text on ${bg}`).toBe(true);
      expect(has('fogDot', 'surface', 3)).toBe(false);
    });

    it('27.258 edgePeople: the mockup\'s grey measured below 3:1 and the derived value clears it, every style and theme; control: the mockup\'s value really fails', () => {
      for (const style of STYLE_NAMES) for (const theme of THEME_NAMES) for (const bg of ['surface', 'surfaceRaised'] as const) {
        expect(contrastRatio(colorOf(theme, 'edgePeople', style), colorOf(theme, bg, style)), `${style}/${theme}/${bg}`).toBeGreaterThanOrEqual(3);
      }
      expect(contrastRatio('#a8a49a', colorOf('light', 'surfaceRaised'))).toBeLessThan(3);
      expect(contrastRatio('#57544c', colorOf('dark', 'surfaceRaised'))).toBeLessThan(3);
    });

    it('27.259 the pairless exemptions: fogDot and graphCardLine are decorative (fog is never interactive, §3.1; a card is told by its fill and text), measured below 3:1, and no CONTRAST_PAIRS row hides them; control: the fog dot is still distinguishable (≥ 1.5:1)', () => {
      const fog = contrastRatio(colorOf('light', 'fogDot'), colorOf('light', 'surface'));
      expect(fog).toBeLessThan(3);
      expect(fog).toBeGreaterThanOrEqual(1.5);
      expect(contrastRatio(colorOf('dark', 'fogDot'), colorOf('dark', 'surface'))).toBeGreaterThanOrEqual(1.5);
      // the hairline is the other exemption the title names: measured below 3:1 too (1.19 light, 1.47 dark while planning)
      expect(contrastRatio(colorOf('light', 'graphCardLine'), colorOf('light', 'surface'))).toBeLessThan(3);
      expect(contrastRatio(colorOf('dark', 'graphCardLine'), colorOf('dark', 'surface'))).toBeLessThan(3);
      expect(CONTRAST_PAIRS.some((p) => p.fg === 'fogDot' || p.bg === 'fogDot' || p.fg === 'graphCardLine' || p.bg === 'graphCardLine')).toBe(false);
    });
  });
  ```
  Kills:
  - 27.255: (a) leave `graphCardLine` out of `TOKEN_ROLES` (b) leave `fogDot` out of `themes.dark` (that role emits `undefined` in the six dark blocks: the count reads 3) (c) `edgeBlocks: 'red600'` → `'red300'` in `themes.light`.
  - 27.256: (a) `edgeConcept: 'teal700'` → `'blue600'` (b) `edgePeople: 'peopleEdgeLight'` → `'lineStrong'` (the mockup's own grey) (c) drop the `edgePeople` row from `themes.dark` (the `primitives.peopleEdgeDark` leg; `not.toBe` alone stayed green).
  - 27.257: (a) drop the `edgeConcept` on `surfaceRaised` row (b) drop the `text` on `conceptSoft` row (c) declare the `edge*` rows at `minimum: 4.5`.
  - 27.258: (a) `peopleEdgeLight` → `'#a8a49a'` (2.03 on `surface`) (b) `peopleEdgeDark` → `'#57544c'`.
  - 27.259: (a) add `{ fg: 'fogDot', bg: 'surface', minimum: 3 }` (b) `fogDot: 'fogDotLight'` → `'grayAccessible'` (≥ 3: the "below 3" leg) (c) `graphCardLine: 'line'` → `'border'`'s `grayAccessible` (the hairline leg).
  27.257 asserts the rows are declared; the existing loop over `CONTRAST_PAIRS` (`tokens.test.ts:103-114`) measures them in every style and theme once Step 2 adds them.

  Run: `pnpm --filter @gisik-nokma/ui exec vitest run test/tokens.test.ts --maxWorkers=2 > /tmp/kg-t4.log 2>&1; tail -15 /tmp/kg-t4.log`. Expected: FAIL (the roles do not exist).

- [ ] **Step 2: The primitives, roles and pairs.**

  **Primitives.** In `primitives` (`tokens.ts:75`), next to the hue family each belongs to, add the following, each with a one-line docblock citing `knowledge-graph-sigma.html:6-28` and spec C §3.7:

  | Primitive | Value |
  |---|---|
  | `teal700` | `'#0b7285'` |
  | `teal300` | `'#5ccfe0'` |
  | `conceptFillLight` | `'#d6e7e5'` |
  | `conceptFillDark` | `'#1e4350'` |
  | `conceptSoftLight` | `'#e8f0ee'` |
  | `conceptSoftDark` | `'#1c3040'` |
  | `fogDotLight` | `'#b9b2a6'` |
  | `fogDotDark` | `'#4a5578'` |
  | `peopleEdgeLight` | `'#88857d'` |
  | `peopleEdgeDark` | `'#777368'` |

  **Roles.** Add the twelve roles to `TOKEN_ROLES`, after `level4`. Their docblock says:
  - what each is drawn on (edges on the graph canvas: `surface` on Home, `surfaceRaised` in a sheet);
  - that `fogDot` and `graphCardLine` are PAIRLESS (27.259), in the shape of `brand`'s docblock (`tokens.ts:871`).

  **Mappings.** `themes.light` and `themes.dark`:

  | Role | Light | Dark |
  |---|---|---|
  | `edgeStructure` | `textSubtleLight` | `textSubtleDark` |
  | `edgeBlocks` | `red600` | `red300` |
  | `edgeRelates` | `violet600` | `violet300` |
  | `edgeDuplicates` | `amber700` | `amber300` |
  | `edgeAttached` | `blue600` | `blue300` |
  | `edgeReference` | `magenta600` | `magenta300` |
  | `edgePeople` | `peopleEdgeLight` | `peopleEdgeDark` |
  | `edgeConcept` | `teal700` | `teal300` |
  | `conceptFill` | `conceptFillLight` | `conceptFillDark` |
  | `conceptSoft` | `conceptSoftLight` | `conceptSoftDark` |
  | `fogDot` | `fogDotLight` | `fogDotDark` |
  | `graphCardLine` | `line` | `seam` |

  `neo` has no override, so `colorOf` falls back to these.

  **The derived people edge.** `peopleEdgeLight` and `peopleEdgeDark` are the mockup hues darkened (light) or lightened (dark) along the same warm-grey line until they reach 3:1 on the WORST surface in any style. Measured while planning:
  - `#88857d`: 3.01 / 3.46 / 3.09;
  - `#777368`: 3.65 / 3.00 / 3.26.

  Re-measure in Step 3. If one lands under 3.0 on a surface added since, step it one notch (±0x080808) and record both numbers.

  **Pairs.** Add to `CONTRAST_PAIRS`, under one comment naming 27.257:
  - each of the eight `edge*` roles on `surface` and on `surfaceRaised` at `3` (non-text marks);
  - `text` on `conceptFill` and on `conceptSoft` at `4.5` (a concept's label sits on its pill).

- [ ] **Step 3: Run, measure, catalogue.**

  1. Run the `ui` suite whole: `pnpm --filter @gisik-nokma/ui exec vitest run --maxWorkers=2 > /tmp/kg-t4-ui.log 2>&1; tail -10 /tmp/kg-t4-ui.log`. Expected: PASS, including every new loop row in every style and theme.
  2. Print the measured ratios: a one-off `node -e` over `colorOf` + `contrastRatio` from `dist`, after `pnpm --filter @gisik-nokma/ui build`. Paste them into the docblock of `peopleEdgeLight` and `peopleEdgeDark`, and into DONE.

  **Mutations:**
  - `peopleEdgeLight` → `'#a8a49a'`. 27.258 goes RED, with 2.03.
  - Add a `{ fg: 'fogDot', bg: 'surface', minimum: 3 }` row. 27.259 goes RED, and so does the loop.

  Then, under `<!-- KG-C T4 -->`:
  - ✅ 27.255–27.259, one id line each;
  - 27.260–27.262 stay unallocated (no lines).

  Add "twelve colour roles (`packages/ui/src/tokens.ts`)" to the bullet.

  **Prose to sweep:**
  - `packages/knowledge-graph/src/render/palette.ts:4` — "Task 4 adds the twelve graph roles." (future tense; after this task they exist, so say they are `packages/ui` roles, 27.255).
  - `Features.md:3767` — the KG-C ⚙️ bullet's "Cases 27.200–27.211." range (add 27.255–27.259 with the roles clause).

  **Sweeps:**
  - `ui` whole, then `pnpm turbo run build --filter=@gisik-nokma/web...`, then the web and app-core suites. A new role can change an emitted stylesheet a snapshot reads: `grep -rn "themeStylesheet" apps/web/test packages/app-core/test` first, and run those files.
  - `check:citations`.

  Push, then DONE.

---

### Task 5: The Sigma adapter: the renderer seam, every §4.2 trap, and their browser cases (cases 27.263–27.289)

**Depends on:** Tasks 2, 3 and 4.

**Files:**
- Create:
  - `packages/knowledge-graph/src/render/renderer.ts`
  - `packages/knowledge-graph/src/render/sigma/adapter.ts`
  - `packages/knowledge-graph/src/render/sigma/camera-driver.ts`
  - `packages/knowledge-graph/src/render/sigma/rings.ts`
  - `packages/knowledge-graph/src/render/sigma/attachment-cache.ts`
  - `packages/knowledge-graph/src/render/sigma/probe.ts`
  - `packages/knowledge-graph/src/theme/read-palette.ts`
  - `packages/knowledge-graph/test/theme.test.ts`
  - `packages/knowledge-graph-browser/harness/{main.tsx,fixture.ts,fixture-source.ts,adapter.html,adapter.ts}`
  - `packages/knowledge-graph-browser/tests/{traps,camera,theme}.spec.ts`
- Modify:
  - `packages/knowledge-graph/src/index.ts`
  - `package.json` `exports`: add `"./sigma"`
  - `render/sigma/program.ts`: export its style functions so the probe can name what it reads
  - the catalogue (`<!-- KG-C T5 -->`) and the Features bullet

**Interfaces:**
- **Consumes:**
  - from Task 1: `createSigma`, `EDGE_ROLE`, `iconUri`, `initialsOf`, `ThemePalette`, `NodeAttributes`, `EdgeAttributes`;
  - from Task 2: `RING_CONFIGS`, `radius`;
  - from Task 3: `springStep`, `zoomTarget`, `settleFactor`, `panTarget`, `wheelIntent`, `solveFit`, `glideFrame`, `coastOffset`, `SETTLE_MS`, `TOP_PX`, `FitItem`, `CameraState`.
- **Produces** `render/renderer.ts`:
  ```ts
  import type { GraphGroup, GraphItemKind, StateCategory } from '@gisik-nokma/domain';
  import type { CameraState } from '../engine/camera.js';
  import type { FitItem } from '../engine/fit.js';
  import type { RingConfig } from '../engine/layout.js';
  import type { IconSpec, Level } from './node-attributes.js';
  import type { ThemePalette } from './palette.js';

  export type DrawNode = { ref: string; kind: GraphItemKind; fog: boolean; lv: Level | 'fog'; center: boolean; lbl: string; sub: string | null; icon: IconSpec | null; sug: boolean; cat: StateCategory | null };
  export type DrawEdge = { id: string; from: string; to: string; grp: GraphGroup; fog: boolean; sug: boolean; on: boolean };
  /** `highlight` (Home's stat filter, spec E) WINS over hover dimming: lit items 100%, the rest 25%, edges 12% (`knowledge-graph-sigma.html:784,795`). */
  export type DrawStates = { selected: string | null; selectedEdge: string | null; highlight: ReadonlySet<string> | null };
  export type DrawView = { fit: readonly FitItem[]; topPx: number; clearHop: number; keepView: boolean };
  export type PickEvent = { kind: 'node'; ref: string; double: boolean } | { kind: 'edge'; id: string } | { kind: 'stage' };
  /** x/y are px inside the mount element. */
  export type HoverEvent = { kind: 'edge'; id: string; x: number; y: number } | { kind: 'edge-leave' } | { kind: 'node'; ref: string } | { kind: 'node-leave' };
  export type MountOptions = { phone: boolean; config: RingConfig; reduceMotion: () => boolean };

  /** The seam (spec §4.1). Everything above it speaks layout coordinates (y down) and refs; nothing above it imports Sigma. */
  export interface GraphRenderer {
    mount(el: HTMLElement, palette: ThemePalette, opts: MountOptions): void;
    setGraph(nodes: readonly DrawNode[], edges: readonly DrawEdge[], positions: ReadonlyMap<string, { x: number; y: number }>, states: DrawStates, view: DrawView): void;
    setStates(states: DrawStates): void;
    setCamera(target: 'fit' | CameraState, opts?: { instant?: boolean }): void;
    zoomBy(factor: number): void;
    onCamera(cb: (state: CameraState) => void): () => void;
    onPick(cb: (event: PickEvent) => void): () => void;
    onHover(cb: (event: HoverEvent) => void): () => void;
    refreshTheme(palette: ThemePalette): void;
    destroy(): void;
    /** Test hook (the browser suite); returns null unless the mount element carries `data-kg-probe`. */
    inspect(): RendererProbe | null;
  }

  export type RendererProbe = {
    camera(): CameraState;
    fitRatio(): number;
    viewportOf(ref: string): { x: number; y: number } | null;
    graphAt(x: number, y: number): { x: number; y: number };
    normalise(p: { x: number; y: number }): { x: number; y: number };
    /** `backdropBorderColor` added by the planner ruling 2026-10-04, so 27.280 can pin the selection ring. */
    nodeDisplay(ref: string): { size: number; opacity: number; image: string; attachment: string | null; color: string; backdropColor: string; backdropBorderColor: string } | null;
    edgeDisplay(id: string): { size: number; opacity: number } | null;
    frames(): number;
    inkLog(): number[];
    clearInk(): void;
    alphaAt(points: readonly { x: number; y: number }[]): number[];
    invalidated(): string[];
    positions(): Record<string, { x: number; y: number }>;
  };

  export type CreateRenderer = () => GraphRenderer;
  ```
- **Also produces:**
  - `render/sigma/adapter.ts`: `createSigmaRenderer: CreateRenderer`, reached ONLY through `@gisik-nokma/knowledge-graph/sigma` (a subpath), so `import()` can split it.
  - `theme/read-palette.ts`:
    - `readThemePalette(el: Element): ThemePalette`;
    - `watchTheme(cb: () => void): () => void`.

- [ ] **Step 1: The theme reader, test first (27.263).**

  `test/theme.test.ts` (jsdom):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { cssVariableName } from '@gisik-nokma/ui/tokens';
  import { PALETTE_ROLES } from '../src/render/palette.js';
  import { readThemePalette, watchTheme } from '../src/theme/read-palette.js';

  describe('the palette is read from the app\'s tokens (spec §3.7)', () => {
    it('27.263 every palette role is read from its --gn-* variable, and dark is read from color-scheme; a data-theme change notifies; control: an unset variable reads as empty, not a fallback colour', async () => {
      const root = document.documentElement;
      for (const role of PALETTE_ROLES) root.style.setProperty(cssVariableName(role), role === 'edgeBlocks' ? '#d70015' : '#010203');
      root.style.setProperty('color-scheme', 'dark');
      const p = readThemePalette(root);
      expect(p.edgeBlocks).toBe('#d70015');
      expect(p.fogDot).toBe('#010203'); // every OTHER role reads its own variable too (a reader keyed on one name fails here or above)
      expect(p.dark).toBe(true);
      root.style.setProperty('color-scheme', 'light');
      expect(readThemePalette(root).dark).toBe(false); // `dark` is READ, not a constant
      let calls = 0;
      const stop = watchTheme(() => (calls += 1));
      root.setAttribute('data-theme', 'dark');
      await new Promise((r) => setTimeout(r, 0));
      expect(calls).toBe(1);
      root.setAttribute('data-style', 'neo'); // the docblock's other attribute
      await new Promise((r) => setTimeout(r, 0));
      expect(calls).toBe(2);
      stop();
      root.setAttribute('data-theme', 'light');
      await new Promise((r) => setTimeout(r, 0));
      expect(calls).toBe(2); // stopped means stopped
      root.removeAttribute('data-theme');
      root.removeAttribute('data-style');
      root.style.removeProperty(cssVariableName('fogDot'));
      expect(readThemePalette(root).fogDot).toBe('');
    });
  });
  ```
  Kills:
  - 27.263: (a) the `dark` threshold inverted (`<` → `>`) (b) `attributeFilter: ['data-theme', 'data-style']` → `['data-theme']` (the `calls` = 2 leg) (c) the returned stop drops `mo.disconnect()` (the stopped leg) (d) `.trim()` → `.trim() || '#000000'` (the unset leg) (e) `dark` read from a token that does not change with the theme (e.g. `edgeBlocks`) (f) the old `color-scheme` read.

  **Planner ruling 2026-10-04 22:25 (KV5), superseding this step's `color-scheme` read.** No app stylesheet sets `color-scheme` (`themeStylesheet()` only uses `prefers-color-scheme` media queries), so a `color-scheme` read leaves `dark` false in the product and the label attachment name never leaves `subL`. `dark` is derived from what is PAINTED: the relative luminance of the resolved card fill (`surfaceRaised`, which the reader already reads) is below `0.5` (`DARK_LUMINANCE`; measured: light fills 0.83–0.94, dark 0.018–0.024). It holds for every `data-theme` / OS-dark / `data-style` combination with no selector copied, and `packages/ui` is untouched. The jsdom case sets the card fill instead of `color-scheme` (a near-black fill is dark, the light fill is light, `#bbbbbb` / `#bcbcbc` either side of the bound, and an inline `color-scheme: dark` decides nothing). The browser legs (same ids, with the REAL `themeStylesheet()` injected and no harness `color-scheme`): (1) `data-theme=dark` → dark, and the attachment name leaves `subL` (27.267); (2) no `data-theme` + emulated `prefers-color-scheme: dark` → dark; (3) `data-theme=light` under emulated OS dark → light (the control that makes (2) non-vacuous); (4) the default light → light (27.287, through `window.__kg.readPalette()`). (jsdom 25 was probed and does keep an inline `color-scheme`; it no longer matters.)

  Check that `@gisik-nokma/ui/tokens` is an existing subpath: G-9's harness imports `themeStylesheet` from it. If `cssVariableName` is not exported there, import it from `@gisik-nokma/ui`.

  `src/theme/read-palette.ts`:
  ```ts
  import { cssVariableName, type TokenRole } from '@gisik-nokma/ui/tokens';
  import { PALETTE_ROLES, type ThemePalette } from '../render/palette.js';

  /** Port of `readPalette` (`knowledge-graph-sigma.html:461-463`), over the app's own variables. Sigma takes values, never `var(--…)`. `dark` is read from the painted card fill (ruling above). */
  export function readThemePalette(el: Element): ThemePalette {
    const cs = getComputedStyle(el);
    const out = {} as ThemePalette;
    for (const role of PALETTE_ROLES) out[role] = cs.getPropertyValue(cssVariableName(role as TokenRole)).trim();
    out.dark = luminance(out.surfaceRaised) < DARK_LUMINANCE; // WCAG relative luminance of `#rrggbb[aa]`, NaN (light) otherwise
    return out;
  }

  /** A theme change is a `data-theme` / `data-style` flip on <html> OR an OS scheme flip under no `data-theme` (Review Focus 3). */
  export function watchTheme(cb: () => void): () => void {
    const mo = new MutationObserver(() => cb());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-style'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => cb();
    mq.addEventListener('change', onMq);
    return () => {
      mo.disconnect();
      mq.removeEventListener('change', onMq);
    };
  }
  ```
  jsdom has no `matchMedia`. The test's setup stubs it the way `packages/ui/test/setup.ts` does, if it does. If not, add `window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;` to `test/setup.ts`.

  Run, then commit.

- [ ] **Step 2: The adapter pieces.** Each piece is a port, and each comment cites the mockup lines.

  `render/sigma/attachment-cache.ts` (trap 1; `knowledge-graph-sigma.html:817-820`):
  ```ts
  import type Sigma from 'sigma';

  type AttachmentManager = { invalidateNode(id: string): void; clear(): void };

  /**
   * §4.2 trap 1. sigma@4.0.0-beta.7 drops EVERY label attachment on each state change and reprocess, then re-rasterises
   * asynchronously, so a card's second line blinked on every hover. Keep the cache; drop a node's entry only when its
   * subtitle really changes or it leaves the graph. `internals` is private in the typings, hence the cast. If an upgrade
   * removes it, mounting FAILS LOUDLY (§10): the case 27.264 would otherwise pass on a blinking build only by luck.
   */
  export function keepAttachmentCache(sigma: Sigma, log: string[]): (ref: string) => void {
    const am = (sigma as unknown as { internals?: { attachmentManager?: AttachmentManager } }).internals?.attachmentManager;
    if (am === undefined) throw new Error('sigma internals.attachmentManager is missing: the label-attachment cache fix (spec C §4.2 trap 1) cannot apply to this Sigma version');
    const drop = am.invalidateNode.bind(am);
    am.invalidateNode = () => undefined;
    am.clear = () => undefined;
    return (ref) => {
      log.push(ref);
      drop(ref);
    };
  }
  ```

  `render/sigma/rings.ts` (the `afterRender` ring layer, `:868-875`):
  ```ts
  import type Sigma from 'sigma';
  import { radius, type RingConfig } from '../../engine/layout.js';

  const SVG = 'http://www.w3.org/2000/svg';
  /** Ring lines ("1 hop", "2 hops") and the soft fog band, redrawn in the SAME frame as the canvas from graphToViewport. */
  export function drawRings(svg: SVGSVGElement, sigma: Sigma, cfg: RingConfig, clearHop: number, phone: boolean, hasFog: boolean): void {
    const c = sigma.graphToViewport({ x: 0, y: 0 });
    const R = (h: number) => {
      const [rx, ry] = radius(cfg.R, h);
      return [sigma.graphToViewport({ x: rx, y: 0 }).x - c.x, c.y - sigma.graphToViewport({ x: 0, y: ry }).y] as const;
    };
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (hasFog) {
      const [fx, fy] = R(clearHop + 1);
      const band = document.createElementNS(SVG, 'ellipse');
      Object.entries({ class: 'gn-kg__fog-band', cx: c.x, cy: c.y, rx: fx * 1.08, ry: fy * 1.08 }).forEach(([k, v]) => band.setAttribute(k, String(v)));
      svg.appendChild(band);
    }
    for (let h = clearHop; h >= 1; h -= 1) {
      const [rx, ry] = R(h);
      const ring = document.createElementNS(SVG, 'ellipse');
      Object.entries({ class: 'gn-kg__ring', cx: c.x, cy: c.y, rx, ry }).forEach(([k, v]) => ring.setAttribute(k, String(v)));
      svg.appendChild(ring);
      if (!phone) {
        const label = document.createElementNS(SVG, 'text');
        label.setAttribute('class', 'gn-kg__ring-label');
        label.setAttribute('x', (c.x + rx * Math.cos(-0.2)).toFixed(1));
        label.setAttribute('y', (c.y + ry * Math.sin(-0.2) - 8).toFixed(1));
        label.setAttribute('text-anchor', 'end');
        label.textContent = `${h} hop${h > 1 ? 's' : ''}`;
        svg.appendChild(label);
      }
    }
  }
  ```
  The fog band's radial mist is CSS (Task 7's `/* KG: T7 view+bar */` block): `.gn-kg__fog-band { fill: url(#gn-kg-mist) }`, or a `radial-gradient` on the canvas wrapper. Use the colour `var(--gn-fog-dot)` at 18% opacity through `color-mix`, as `ui.css` already does for tints. Grep `color-mix` in `ui.css` to confirm it is used, and copy that shape.

  `render/sigma/camera-driver.ts` (port of `loop`/`goTo`/`zoomAt`/`settle`/`panBy`/`onWheel`/gesture handlers, `:821-852`):
  ```ts
  import type Sigma from 'sigma';
  import { SETTLE_MS, panTarget, settleFactor, springStep, zoomTarget, type CameraState } from '../../engine/camera.js';
  import { wheelIntent } from '../../engine/wheel.js';

  type SigmaWheel = { event: { x: number; y: number; original: WheelEvent; preventSigmaDefault(): void } };

  export function createCameraDriver(sigma: Sigma, el: HTMLElement, fitRatio: () => number, reduce: () => boolean, onChange: (s: CameraState) => void) {
    const cam = sigma.getCamera();
    let target: CameraState | null = null, raf = 0, last = 0, idle: ReturnType<typeof setTimeout> | undefined, ours = false;
    const set = (s: CameraState) => {
      ours = true;
      cam.setState({ ...s, angle: 0 });
      ours = false;
      onChange(s);
    };
    // a Sigma drag or touch pinch moved the camera: follow it, never fight it (`:828`)
    cam.on('updated', (s: CameraState) => {
      if (!ours && raf === 0) target = null;
      if (!ours) onChange(s);
    });
    const loop = (now: number) => {
      const dt = last === 0 ? 0 : now - last;
      last = now;
      const { state, settled } = springStep(cam.getState(), target!, dt === 0 ? 16 : dt, reduce());
      set(state);
      if (settled) {
        raf = 0;
        last = 0;
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    const run = () => {
      if (raf === 0) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    const dims = () => ({ width: el.clientWidth, height: el.clientHeight });
    const base = () => target ?? cam.getState();
    function goTo(s: CameraState, instant: boolean): void {
      target = { ...s };
      if (instant || reduce()) {
        cancelAnimationFrame(raf);
        raf = 0;
        set(target);
        return;
      }
      run();
    }
    function zoomAt(factor: number, vx: number, vy: number, soft: boolean): void {
      const b = base();
      const anchor = sigma.viewportToFramedGraph({ x: vx, y: vy }, { cameraState: { ...b, angle: 0 } }); // trap 8
      target = zoomTarget(b, factor, anchor, fitRatio(), soft);
      run();
      clearTimeout(idle);
      idle = setTimeout(settle, SETTLE_MS);
    }
    function settle(): void {
      if (target === null) return;
      const f = settleFactor(target, fitRatio());
      if (f !== null) zoomAt(f, dims().width / 2, dims().height / 2, false);
    }
    function panBy(dx: number, dy: number): void {
      const b = base();
      const a = sigma.viewportToFramedGraph({ x: 0, y: 0 }, { cameraState: { ...b, angle: 0 } });
      const c = sigma.viewportToFramedGraph({ x: dx, y: dy }, { cameraState: { ...b, angle: 0 } });
      target = panTarget(b, { x: c.x - a.x, y: c.y - a.y });
      run();
    }
    // trap 7: cancel Sigma's fixed-step wheel, stop the page scroll, and belt it with a non-passive listener (`:840-848`)
    const onWheel = ({ event }: SigmaWheel) => {
      event.preventSigmaDefault();
      event.original.preventDefault();
      const intent = wheelIntent(event.original);
      if (intent.kind === 'zoom') zoomAt(intent.factor, event.x, event.y, true);
      else panBy(intent.dx, intent.dy);
    };
    sigma.on('wheelStage', onWheel);
    sigma.on('wheelNode', onWheel);
    sigma.on('wheelEdge', onWheel);
    const belt = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', belt, { passive: false });
    // Safari's trackpad pinch (`:849-852`)
    let gs = 1;
    type Gesture = Event & { scale: number; clientX: number; clientY: number };
    const gStart = (e: Event) => { e.preventDefault(); gs = 1; };
    const gChange = (e: Event) => {
      e.preventDefault();
      const g = e as Gesture, r = el.getBoundingClientRect();
      zoomAt(g.scale / gs, g.clientX - r.left, g.clientY - r.top, true);
      gs = g.scale;
    };
    const gEnd = (e: Event) => { e.preventDefault(); settle(); };
    el.addEventListener('gesturestart', gStart);
    el.addEventListener('gesturechange', gChange);
    el.addEventListener('gestureend', gEnd);
    return {
      goTo,
      zoomCentre: (f: number) => zoomAt(f, dims().width / 2, dims().height / 2, false),
      panBy,
      destroy() {
        cancelAnimationFrame(raf);
        clearTimeout(idle);
        el.removeEventListener('wheel', belt);
        el.removeEventListener('gesturestart', gStart);
        el.removeEventListener('gesturechange', gChange);
        el.removeEventListener('gestureend', gEnd);
      },
    };
  }
  ```
  If the beta's `Camera` `updated` listener passes no state, read `cam.getState()` inside it. Its signature is in `node_modules/sigma/dist/declarations/core/camera.d.ts`: read it, and cite the line in a comment.

  `render/sigma/adapter.ts` (port of the rest of `makeGraph`'s Sigma half: `:773-829`, `:855-866`, `:868-896`, and the graph diff in `render`, `:930-948`):
  ```ts
  import Graph from 'graphology';
  import type Sigma from 'sigma';
  import type { CameraState } from '../../engine/camera.js';
  import { solveFit } from '../../engine/fit.js';
  import { glideFrame } from '../../engine/glide.js';
  import { radius, type RingConfig } from '../../engine/layout.js';
  import type { EdgeAttributes, NodeAttributes } from '../node-attributes.js';
  import type { ThemePalette } from '../palette.js';
  import type { CreateRenderer, DrawEdge, DrawNode, DrawStates, DrawView, GraphRenderer, HoverEvent, MountOptions, PickEvent } from '../renderer.js';
  import { keepAttachmentCache } from './attachment-cache.js';
  import { createCameraDriver } from './camera-driver.js';
  import { iconUri } from './icons.js';
  import { createProbe } from './probe.js';
  import { createSigma } from './program.js';
  import { drawRings } from './rings.js';

  export const createSigmaRenderer: CreateRenderer = () => {
    let sigma: Sigma | null = null;
    let graph: Graph<NodeAttributes, EdgeAttributes> | null = null;
    let palette: ThemePalette;
    let opts: MountOptions;
    let host: HTMLElement;
    let stage: HTMLDivElement;
    let ringsSvg: SVGSVGElement;
    let driver: ReturnType<typeof createCameraDriver>;
    let dropSub: (ref: string) => void = () => undefined;
    const invalidated: string[] = [];
    let nodeHovered = false, highlight: ReadonlySet<string> | null = null;
    let fitState: CameraState | null = null, fitPending = true, firstGraph = true, lastView: DrawView | null = null;
    let glideRaf = 0;
    let drawn: DrawNode[] = [];
    let probe: ReturnType<typeof createProbe> | null = null;
    const cams = new Set<(s: CameraState) => void>(), picks = new Set<(e: PickEvent) => void>(), hovers = new Set<(e: HoverEvent) => void>();
    const isFog = (ref: string) => graph!.hasNode(ref) && graph!.getNodeAttribute(ref, 'fog');
    const imageOf = (n: DrawNode) => (n.icon === null ? '' : iconUri(n.icon, palette));

    function computeFit(view: DrawView): CameraState {
      const one = { x: 0.5, y: 0.5, ratio: 1, angle: 0 };
      const k1 = (sigma!.graphToViewport({ x: 100, y: 0 }, { cameraState: one }).x - sigma!.graphToViewport({ x: 0, y: 0 }, { cameraState: one }).x) / 100;
      const { cx, cy, ratio } = solveFit(view.fit, k1, { width: stage.clientWidth, height: stage.clientHeight }, view.topPx);
      const f = sigma!.getNormalizationFunction()({ x: cx, y: -cy });
      return { x: f.x, y: f.y, ratio };
    }

    function applyStates(states: DrawStates): void {
      const s = sigma!, g = graph!;
      highlight = states.highlight;
      s.setNodesState(g.nodes(), { isSel: false, isNb: false, isHl: false });
      s.setEdgesState(g.edges(), { isSel: false, isNb: false });
      if (states.selectedEdge !== null && g.hasEdge(states.selectedEdge)) s.setEdgeState(states.selectedEdge, { isSel: true });
      else if (states.selected !== null && g.hasNode(states.selected)) s.setNodeState(states.selected, { isSel: true });
      if (highlight !== null) s.setNodesState([...highlight].filter((ref) => g.hasNode(ref)), { isHl: true });
      s.refresh();
    }

    const renderer: GraphRenderer = {
      mount(el, pal, o) {
        host = el;
        palette = pal;
        opts = o;
        ringsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ringsSvg.setAttribute('class', 'gn-kg__rings');
        ringsSvg.setAttribute('aria-hidden', 'true');
        stage = document.createElement('div');
        stage.className = 'gn-kg__stage';
        el.append(ringsSvg, stage);
        graph = new Graph<NodeAttributes, EdgeAttributes>({ multi: true });
        sigma = createSigma(graph, stage, () => palette, { nodeHovered: () => nodeHovered, highlightOn: () => highlight !== null });
        const far = radius(o.config.R, 6);
        sigma.setCustomBBox({ x: [-far[0] * 1.25, far[0] * 1.25], y: [-far[1] * 1.25, far[1] * 1.25] }); // glide keeps the frame fixed
        dropSub = keepAttachmentCache(sigma, invalidated);
        driver = createCameraDriver(sigma, stage, () => fitState?.ratio ?? 1, o.reduceMotion, (s) => cams.forEach((cb) => cb(s)));
        sigma.on('afterRender', () => {
          if (lastView === null) return;
          if (fitPending) { // trap 8: the first frame knows the real viewport size
            fitPending = false;
            fitState = computeFit(lastView);
            driver.goTo(fitState, true);
          }
          drawRings(ringsSvg, sigma!, opts.config, lastView.clearHop, opts.phone, drawn.some((n) => n.fog));
        });
        // trap 6: fog fires events; ignore it. Port of `:868-880`.
        sigma.on('clickNode', ({ node }) => { if (!isFog(node)) picks.forEach((cb) => cb({ kind: 'node', ref: node, double: false })); });
        sigma.on('doubleClickNode', ({ node, preventSigmaDefault }) => { preventSigmaDefault(); if (!isFog(node)) picks.forEach((cb) => cb({ kind: 'node', ref: node, double: true })); });
        sigma.on('clickEdge', ({ edge }) => { if (!graph!.getEdgeAttribute(edge, 'fog')) picks.forEach((cb) => cb({ kind: 'edge', id: edge })); });
        sigma.on('clickStage', () => picks.forEach((cb) => cb({ kind: 'stage' })));
        if (!o.phone) {
          // trap 9: dim on an ITEM hover only, through our own flag
          sigma.on('enterNode', ({ node }) => {
            if (isFog(node)) return;
            nodeHovered = true;
            sigma!.setNodesState(graph!.neighbors(node), { isNb: true });
            sigma!.setEdgesState(graph!.edges(node), { isNb: true });
            hovers.forEach((cb) => cb({ kind: 'node', ref: node }));
          });
          sigma.on('leaveNode', () => {
            nodeHovered = false;
            sigma!.setNodesState(graph!.nodes(), { isNb: false });
            sigma!.setEdgesState(graph!.edges(), { isNb: false });
            hovers.forEach((cb) => cb({ kind: 'node-leave' }));
          });
        }
        // trap 11: the sentence is a DOM tooltip the view draws; the adapter reports where
        sigma.on('enterEdge', ({ edge, event }) => { if (!graph!.getEdgeAttribute(edge, 'fog')) hovers.forEach((cb) => cb({ kind: 'edge', id: edge, x: event.x, y: event.y })); });
        sigma.on('leaveEdge', () => hovers.forEach((cb) => cb({ kind: 'edge-leave' })));
        if (el.hasAttribute('data-kg-probe')) probe = createProbe(sigma, graph, stage, invalidated, () => fitState);
      },

      setGraph(nodes, edges, positions, states, view) {
        const g = graph!;
        drawn = [...nodes];
        lastView = view;
        const shown = new Set(nodes.map((n) => n.ref));
        const from = new Map<string, { x: number; y: number }>();
        g.forEachNode((ref, a) => from.set(ref, { x: a.x, y: a.y }));
        g.forEachNode((ref) => { if (!shown.has(ref)) { g.dropNode(ref); dropSub(ref); } });
        g.clearEdges();
        const to = new Map<string, { x: number; y: number }>();
        for (const n of nodes) {
          const p = positions.get(n.ref)!;
          to.set(n.ref, { x: p.x, y: -p.y }); // Sigma's y points up
          const attrs: Omit<NodeAttributes, 'x' | 'y'> = { ref: n.ref, kind: n.kind, fog: n.fog, lv: n.lv, center: n.center, lbl: n.lbl, sub: n.sub, image: imageOf(n), sug: n.sug, cat: n.cat };
          if (g.hasNode(n.ref)) {
            if (g.getNodeAttribute(n.ref, 'sub') !== n.sub) dropSub(n.ref);
            g.mergeNodeAttributes(n.ref, attrs);
          } else {
            // a new item grows out of its parent's old place, if it had one (`:937`)
            const parentFrom = [...edges].find((e) => e.to === n.ref && from.has(e.from)) ?? [...edges].find((e) => e.from === n.ref && from.has(e.to));
            const start = parentFrom === undefined ? to.get(n.ref)! : from.get(parentFrom.from === n.ref ? parentFrom.to : parentFrom.from)!;
            g.addNode(n.ref, { ...attrs, x: start.x, y: start.y });
            from.set(n.ref, { ...start });
          }
        }
        for (const e of edges) if (g.hasNode(e.from) && g.hasNode(e.to)) g.addEdgeWithKey(e.id, e.from, e.to, { id: e.id, grp: e.grp, fog: e.fog, sug: e.sug, on: e.on });
        applyStates(states);
        // glide (`:890-896`): positions tween while the frame stays fixed
        cancelAnimationFrame(glideRaf);
        const t0 = performance.now();
        const step = (now: number) => {
          const { positions: at, done } = glideFrame(from, to, now - t0, opts.reduceMotion());
          g.updateEachNodeAttributes((ref, a) => { const p = at.get(ref); if (p) { a.x = p.x; a.y = p.y; } return a; }, { attributes: ['x', 'y'] });
          if (!done) glideRaf = requestAnimationFrame(step);
        };
        step(opts.reduceMotion() ? t0 + 1e9 : t0);
        if (firstGraph) {
          firstGraph = false;
          fitPending = true; // the first fit waits for the first afterRender
          sigma!.refresh();
          return;
        }
        fitState = computeFit(view);
        if (!view.keepView) driver.goTo(fitState, false);
      },

      setStates: (states) => applyStates(states),
      setCamera(target, o = {}) { if (fitState !== null) driver.goTo(target === 'fit' ? fitState : target, o.instant ?? false); },
      zoomBy: (f) => driver.zoomCentre(f),
      onCamera: (cb) => (cams.add(cb), () => cams.delete(cb)),
      onPick: (cb) => (picks.add(cb), () => picks.delete(cb)),
      onHover: (cb) => (hovers.add(cb), () => hovers.delete(cb)),

      refreshTheme(pal) {
        palette = pal;
        // new palette ⇒ new icon URIs (keys carry the colours), and every subtitle re-rasterised once in the new ink
        graph!.updateEachNodeAttributes((ref, a) => {
          const n = drawn.find((d) => d.ref === ref);
          if (a.sub !== null) dropSub(ref);
          return { ...a, image: n === undefined ? a.image : imageOf(n) };
        });
        sigma!.refresh();
      },

      destroy() {
        cancelAnimationFrame(glideRaf);
        driver?.destroy();
        sigma?.kill();
        host?.replaceChildren();
        sigma = null;
        graph = null;
      },

      inspect: () => probe,
    };
    return renderer;
  };
  ```
  **Performance note.** The `parentFrom` search in `setGraph` is O(nodes × edges). At the stress size it is 2,500 × 3,000. Replace it with one `Map<ref, ref>` built in a single pass over `edges` before the loop: first-seen neighbour already in `from`. Keep the comment. 27.283 measures `setGraph` at the stress size (printed).

  **`render/sigma/probe.ts`** implements `RendererProbe`:
  - `camera()` is `sigma.getCamera().getState()`.
  - `viewportOf(ref)` is `sigma.framedGraphToViewport(sigma.getNodeDisplayData(ref))` (as `sigtest.cjs` did).
  - `graphAt` is `sigma.viewportToGraph`.
  - `normalise` is `sigma.getNormalizationFunction()`.
  - `nodeDisplay` and `edgeDisplay` read `getNodeDisplayData` / `getEdgeDisplayData`. Display data keeps every style key the styles set (trap 4), so `opacity`, `image`, `labelAttachment`, `backdropColor` and `backdropBorderColor` are there (the last one by the planner ruling 2026-10-04, for 27.280); if the beta names one differently, map it here and say so in a comment.
  - `inkLog` and `alphaAt` come from an `afterRender` hook that copies `sigma.getStageCanvas()` into a 2D canvas: quarter scale for the ink count (`flick3.cjs`'s method), full scale only for the frame after `alphaAt` is armed.
  - `invalidated()` returns the attachment-cache log.
  - `positions()` returns the graph's x/y per node.

  It runs ONLY when the mount element has `data-kg-probe`, which only the harness sets. A `test/probe.test.ts` (jsdom, 27.289) asserts that `inspect()` returns null without the attribute, and its control mounts WITH the attribute and gets the probe back.

  (Test-strength pass: the first draft's control, "the same renderer object exposes `inspect`", is true of every `GraphRenderer` by its type, and an UNMOUNTED renderer's `inspect()` is null whatever the attribute says, so that case could not fail. jsdom has no WebGL, so the case mounts the real adapter with Sigma's three collaborators stubbed; graphology is plain JS and runs.)
  ```ts
  // test/probe.test.ts
  import { describe, expect, it, vi } from 'vitest';
  import { RING_CONFIGS } from '../src/engine/layout.js';
  import type { ThemePalette } from '../src/render/palette.js';

  const { probeSentinel } = vi.hoisted(() => ({ probeSentinel: { sentinel: 'probe' } }));
  vi.mock('../src/render/sigma/program.js', () => ({ createSigma: () => ({ on: () => undefined, setCustomBBox: () => undefined, kill: () => undefined }) }));
  vi.mock('../src/render/sigma/attachment-cache.js', () => ({ keepAttachmentCache: () => () => undefined }));
  vi.mock('../src/render/sigma/camera-driver.js', () => ({ createCameraDriver: () => ({ goTo: () => undefined, zoomCentre: () => undefined, panBy: () => undefined, destroy: () => undefined }) }));
  vi.mock('../src/render/sigma/probe.js', () => ({ createProbe: () => probeSentinel }));
  const { createSigmaRenderer } = await import('../src/render/sigma/adapter.js');

  describe('the probe is a test hook only', () => {
    it('27.289 inspect() is null unless the mount element carries data-kg-probe; control: the same mount WITH the attribute returns the probe', () => {
      const opts = { phone: false, config: RING_CONFIGS.desktop, reduceMotion: () => true };
      const plain = createSigmaRenderer();
      plain.mount(document.createElement('div'), {} as ThemePalette, opts);
      expect(plain.inspect()).toBeNull();
      const el = document.createElement('div');
      el.setAttribute('data-kg-probe', '');
      const probed = createSigmaRenderer();
      probed.mount(el, {} as ThemePalette, opts);
      expect(probed.inspect()).toBe(probeSentinel);
    });
  });
  ```
  Kills:
  - 27.289: (a) `if (el.hasAttribute('data-kg-probe')) probe = createProbe(…)` → unconditional (b) `inspect: () => probe` → `inspect: () => null` (the control).

  **Exports.**
  - `package.json` `exports`: `"./sigma": { "types": "./dist/render/sigma/adapter.d.ts", "default": "./dist/render/sigma/adapter.js" }`.
  - `src/index.ts` adds:
    - `export type { CreateRenderer, DrawEdge, DrawNode, DrawStates, DrawView, GraphRenderer, HoverEvent, MountOptions, PickEvent, RendererProbe } from './render/renderer.js';`
    - `export { readThemePalette, watchTheme } from './theme/read-palette.js';`
  - **The seam.** Nothing outside `render/sigma/` imports from inside it statically, not even a type: the seam test reads every `ts.preProcessFile` import, type-only ones included. That is why `IconSpec` and `initialsOf` live outside it (Task 1). The ONE crossing is the view's dynamic `import('../render/sigma/adapter.js')` (Task 7). It names no Sigma module itself, so 27.202 passes, and it is what keeps Sigma out of the server bundle. Run 27.202 to prove the seam still holds.

  Build, then commit.

- [ ] **Step 3: The harness fixture.**

  `harness/fixture.ts` holds the mockup's sample world VERBATIM: `WS`, `N`, `E` and `PROV` (`knowledge-graph-sigma.html:485-549`). Copy the four literals byte for byte, then add the converter below. Refs are `kind:id` over the mockup's ids (`ticket:t142`, `person:pA`, `concept:c1`, …).
  - An assignee row is FLIPPED to person → ticket (spec §2.1; the mockup stores ticket → person, `:543`).
  - Provenance dates `'1 Oct'` become ISO `2026-10-01T05:00:00.000Z`.
  - `origin` is `'web'`, except `relates t142 t160`, which is `'mcp'`: one "via Claude" edge for 27.33x.
  - Ticket `cat: 'done'` becomes `'terminal'`. The domain has no `done` category (`packages/domain/src/workflow.ts:4`); the mockup's `--cat-done` is `categoryTerminal`.
  ```ts
  import { graphRef, type GraphEdgeKind, type GraphEdgeView, type GraphItemKind, type GraphItemView } from '@gisik-nokma/domain';
  // ... WS, N, E (as tuples), PROV pasted here verbatim, with `const` declarations ...

  const kindOf = (id: string): GraphItemKind => (N as Record<string, { k: GraphItemKind }>)[id]!.k;
  const ref = (id: string) => graphRef(kindOf(id), id);
  const projectRef = (ws: string, project: string) => `${ws}|${project}`;
  export function fixtureItems(): GraphItemView[] {
    return Object.entries(N as Record<string, Record<string, string>>).map(([id, n]) => {
      const kind = n['k'] as GraphItemKind;
      const ws = kind === 'person' ? null : n['ws'] ?? 'gn';
      return {
        ref: ref(id), kind, id, workspaceId: ws,
        projectId: kind === 'ticket' || kind === 'note' || kind === 'project' ? projectRef(ws!, n['project']!) : null,
        label: kind === 'ticket' ? n['key']! : kind === 'note' ? n['title']! : n['name']!,
        title: kind === 'ticket' || kind === 'note' ? n['title']! : null,
        category: kind === 'ticket' ? (n['cat'] === 'done' ? 'terminal' : (n['cat'] as 'open' | 'active')) : null,
        hop: 0, out: false, suggested: kind === 'concept' && n['status'] === 'suggested',
      };
    });
  }
  const ISO: Record<string, string> = { '1 Oct': '2026-10-01', '2 Oct': '2026-10-02', '26 Sep': '2026-09-26', '20 Sep': '2026-09-20', '28 Sep': '2026-09-28', '30 Sep': '2026-09-30', '29 Sep': '2026-09-29', '12 Sep': '2026-09-12', '24 Sep': '2026-09-24' };
  export function fixtureEdges(): GraphEdgeView[] {
    return (E as { kind: GraphEdgeKind; a: string; b: string; snip?: string; sug: boolean; by?: string; at?: string }[]).map((e) => {
      const [a, b] = e.kind === 'assignee' ? [e.b, e.a] : [e.a, e.b];
      const from = ref(a), to = ref(b);
      return {
        id: `${e.kind}|${from}|${to}`, kind: e.kind, from, to, snippet: e.snip ?? null,
        addedBy: e.kind === 'parent' ? null : e.by ?? null, addedAt: e.at && e.kind !== 'parent' ? `${ISO[e.at]}T05:00:00.000Z` : null,
        origin: e.kind === 'relates' && a === 't142' && b === 't160' ? 'mcp' : e.by ? 'web' : null, suggested: e.sug,
      };
    });
  }
  ```
  The mockup's `in` edges are generated (`:550-551`): port those two lines into `fixtureEdges` as well, so Home's projects group has data. The project ids use the mockup's `PROJ_NODE` keys (`'gn|Mobile web'` → `project:j_mw`). So `projectId` on items is the PROJECT ITEM's id (`j_mw`); map through `PROJ_NODE`, not the `ws|name` string above. Fix the `projectRef` helper accordingly when pasting.

  `harness/fixture-source.ts` is the in-browser stand-in for `GET /v1/graph/neighbours`. It runs the engine walk over the whole fixture and answers ONE ring the way the server does (out flags, edges into the ring and among it, `frontier`):
  ```ts
  import { GROUP_OF_EDGE_KIND, inGraphScope, type GraphGroup, type GraphRingResponse } from '@gisik-nokma/domain';
  import { mergeRing, emptyStore, walk } from '@gisik-nokma/knowledge-graph';
  import { fixtureEdges, fixtureItems } from './fixture.js';

  const all = mergeRing(emptyStore(), { hop: 1, items: fixtureItems(), edges: fixtureEdges(), frontier: [], truncated: false, cursor: null });
  export type FixtureQuery = { center: string; hops: number; workspaceIds: string[]; projectIds: string[]; groups: GraphGroup[] };
  export const fixtureLog: FixtureQuery[] = [];
  /** Delay per ring (ms), settable from a test to make a race (27.318). */
  export const fixtureDelay = { ms: 0, failHop: 0 };

  export async function fixtureRing(q: FixtureQuery): Promise<GraphRingResponse> {
    fixtureLog.push(q);
    if (fixtureDelay.ms > 0) await new Promise((r) => setTimeout(r, fixtureDelay.ms));
    if (fixtureDelay.failHop === q.hops) throw new Error('fixture: ring failed');
    const scope = { workspaceIds: q.workspaceIds, projectIds: q.projectIds };
    const inScope = (r: string) => inGraphScope(all.items.get(r)!, scope);
    const w = walk(all, q.center, new Set(q.groups), q.hops, (r) => r === q.center || inScope(r));
    const ring = w.order.filter((r) => w.dist.get(r) === q.hops);
    const inRing = new Set(ring), upTo = new Set(w.order);
    const edges = [...all.edges.values()].filter((e) => new Set(q.groups).has(GROUP_OF_EDGE_KIND[e.kind]) && (inRing.has(e.from) || inRing.has(e.to)) && upTo.has(e.from) && upTo.has(e.to));
    const items = ring.map((r) => ({ ...all.items.get(r)!, hop: q.hops, out: !inScope(r) }));
    return { hop: q.hops, items, edges, frontier: items.filter((i) => !i.out).map((i) => i.ref), truncated: false, cursor: null };
  }
  ```
  `harness/adapter.html` + `harness/adapter.ts` mount the adapter directly:
  - the fixture centred on `ticket:t142`, desktop config, 2 clear hops, laid out through the engine (`zones` → `layoutRings` → `levelOf` / `nodeLabel` / `nodeSub` → `DrawNode`s, icons as in the mockup's `iconOf`, `:813-816`);
  - the palette from `readThemePalette(document.documentElement)` after `themeStylesheet()` is injected, as G-9's harness does;
  - `data-kg-probe` set; `window.__kg = { renderer, probe: renderer.inspect(), setCenter, setTheme, readPalette: () => readThemePalette(document.documentElement) }` (`readPalette` by the planner ruling 2026-10-04, for 27.263's browser leg);
  - the page body is `200vh` tall, so a wheel that leaked would scroll it.

  The `iconOf` port belongs in the VIEW (Task 7) as `iconFor(item, lv, center): IconSpec | null` in `src/react/draw-model.ts`. Write it there now and import it into the harness, so the harness and the view share one function:
  ```ts
  import type { GraphItemView } from '@gisik-nokma/domain';
  import type { IconSpec, Level } from '../render/node-attributes.js';
  import { initialsOf } from '../render/initials.js';
  /** `iconOf` (`knowledge-graph-sigma.html:813-816`): no icon in fog, at dot level, or on the centre card (a person's centre keeps its avatar). */
  export function iconFor(item: GraphItemView, lv: Level | 'fog', center: boolean): IconSpec | null {
    if (lv === 'fog' || lv === 'dot' || (center && item.kind !== 'person')) return null;
    if (item.kind === 'person') return { kind: 'person', initials: initialsOf(item.label) };
    if (item.kind === 'note') return { kind: 'note' };
    if (item.kind === 'workspace' || item.kind === 'project') return { kind: 'folder' };
    return null;
  }
  ```
  `initialsOf` is already outside the seam (`render/initials.ts`, Task 1).

- [ ] **Step 4: The trap cases.** `tests/traps.spec.ts`. Every case first waits for the harness (`await page.goto('/adapter.html'); await page.waitForFunction(() => (window as any).__kg?.probe)`), then calls `waitStill(page, () => page.evaluate(() => __kg.probe.camera()))`. Each case is one `test()` with its control inside it.

  - **27.264 (trap 1, still):** `probe.clearInk()`, then call `__kg.renderer.setStates(sameStates)` 10 times (each one a `refresh`) with 30 ms between, then read `inkLog()`. It holds at least 10 counts, each > 0 (an empty log makes "all identical" true of nothing), and all of them are identical (`flick3.cjs` STATIC). **Control:** one `setStates` that selects another item changes the count.
    - Kills: (a) delete `am.invalidateNode = () => undefined; am.clear = () => undefined;` in `keepAttachmentCache` (b) `applyStates` calls `dropSub(ref)` for every node before `refresh()`.
  - **27.265 (trap 1, hover):** hover a hop-1 chip, then leave. `probe.invalidated()` is still `[]`, and the first ink count after leaving (the log is non-empty) equals the count before hovering. **Control:** `setGraph` with that chip's `sub` changed adds exactly its ref to `invalidated()`.
    - Kills: (a) keep the real `am.clear` (delete `am.clear = () => undefined`): the ink leg (b) delete `if (g.getNodeAttribute(n.ref, 'sub') !== n.sub) dropSub(n.ref);` (the control) (c) call `dropSub(n.ref)` unconditionally in that merge branch (the control's "exactly", and the hover leg is untouched: hover never calls `setGraph`).
  - **27.266 (trap 2):** sample `alphaAt` at 9 evenly spaced points along the middle 60% of the `parent` edge `ticket:t118 → ticket:t142`. It returns 9 values and all nine are > 0 (no notch). **Control:** the same sampling along the `relates` edge `t142 → t160` (dash 7 / gap 5) finds at least one 0.
    - Kills: (a) `SOLID` → `[10000, 0]` in `program.ts` (Task 1's constant; this case is its guard) (b) the adapter's `addEdgeWithKey(…, { grp: e.grp, … })` → `grp: 'relates'` (every edge dashed).
  - **27.267 (trap 3):** `nodeDisplay('ticket:t133').attachment === 'subL'` in light. After `__kg.setTheme('dark')` it is `'subD'`. **Control:** a dot-level item's attachment is `null`.
    - Kills: (a) in `refreshTheme`, drop `palette = pal;` (the attachment name stays `subL`) (b) in `setGraph`'s `attrs`, `sub: n.sub` → `sub: null` (every attachment `null`: the first leg).
  - **27.268 (trap 4):** `nodeDisplay('note:n1').image` starts with `data:image/svg+xml`, and so does `nodeDisplay('person:pA').image`. **Control:** a ticket's is `''`.
    - Kills: (a) `imageOf` → `() => ''` (b) `imageOf` ignores `n.icon === null` and calls `iconUri` for every node (the control).
  - **27.269 (trap 5):** `nodeDisplay(..).size` is the style's output (9.5 for `note:n1`), which Sigma scales only when it draws, so "the same size after a zoom" holds with trap 5 unfixed too. Trap 5 is about what reaches the screen. So measure pixels. Pick the fog dot with the smallest `viewportOf().y` (the top of the fog ring, where its radial edges run vertically) and scan `alphaAt` horizontally through its centre, 0.5 px steps out to 12 px each side. Its drawn half-width is the last non-zero offset; it is ≥ 2 px (the dot was found). `renderer.zoomBy(2)`, `waitStill`, re-read its `viewportOf`, and scan again: the half-width is the same within 0.5 px. **Control:** the camera ratio did halve.
    - Kills: (a) delete `zoomToSizeRatioFunction: () => 1` in `program.ts` (Sigma's default √ratio grows a 3 px dot to 4.2 px) (b) `itemSizesReference: 'screen'` → `'positions'`. Both are Task 1's settings; this case is their only guard.
  - **27.270 (trap 6 + label):**
    - Click 30 px right of `viewportOf('ticket:t133')` (on its label). The harness records the pick: `window.__kg.picks` gets `{ kind: 'node', ref: 'ticket:t133' }` (`kgtest.cjs`, "click on a label selects").
    - Then click a fog dot (`positions()` with `nodeDisplay(..).size === 3`; assert one was found). No pick is recorded.
    - **Control:** the fog dot did fire Sigma's own `clickNode`. The harness counts raw `clickNode`s in `__kg.rawClicks`, and that count grew.
    - Kills: (a) drop `if (!isFog(node))` from the `clickNode` handler (b) `nodeLabelEvents: 'extend'` → removed in `program.ts` (the label leg; Task 1's setting).
  - **27.271 (click on the dot):** clicking exactly at `viewportOf('ticket:t160')` picks it. **Control:** clicking 200 px away in empty space picks `{ kind: 'stage' }`.
    - Kills: (a) the `clickNode` handler emits `{ kind: 'stage' }` (b) delete the `clickStage` handler (the control).
  - **27.272 (trap 7):** `scrollY` before the wheel (the page is 200vh, scrolled to 0).
    - Three `mouse.wheel(0, -100)` at 30%/35% of the canvas, with 16 ms between, then `waitStill`.
    - `scrollY` is unchanged.
    - The ratio is < r0 × .75.
    - The graph point under the cursor drifted < 2 graph units (`graphAt` before and after).
    - `probe.frames()` grew by ≥ 8 during the zoom (`sigtest.cjs`, "wheel").
    - **Control:** the same three wheels over the page OUTSIDE the canvas DO scroll it.
    - Kills: (a) delete the `belt` listener (see Step 5's caveat) (b) delete `event.preventSigmaDefault();` in `onWheel` (Sigma's fixed-step zoom then moves the camera too: the drift leg) (c) `zoomAt`'s anchor read without `{ cameraState: … }` (trap 8's stale-camera anchor: the drift leg).
  - **27.273 (two-finger pan):** six `mouse.wheel(14, 9)`. The ratio changes by < 1%, and the centre moves > .01 (`sigtest.cjs`, "pan"). The content moves the way a page scrolls: `viewportOf('ticket:t142')` has a SMALLER x and a SMALLER y afterwards (a distance alone cannot tell a reversed pan). **Control:** `mouse.wheel(0, -100)` at the same spot changes the ratio.
    - Kills: (a) `onWheel`'s `else panBy(…)` → `zoomAt(1, …)` (no pan) (b) `panBy` builds `panTarget(b, { x: a.x - c.x, y: a.y - c.y })` (reversed: the direction leg).
  - **27.274 (pinch and spring-back):**
    - Hold `Control` and five `mouse.wheel(0, -8)`: the ratio shrinks.
    - Then 25 × `wheel(0, -100)`: the peak is below fit/4.
    - After `waitStill`, the ratio is within 1% of `fitRatio()/4` (`sigtest.cjs`, "pinch").
    - **Control:** the peak was really past the limit (the rubber band let it go there).
    - Kills: (a) `onWheel`'s zoom passes `soft: false` (the peak stops AT fit/4) (b) delete `idle = setTimeout(settle, SETTLE_MS)` (no spring-back: the 1% leg) (c) `settle()` passes the factor inverted (`1 / f`).
  - **27.275 (touch pinch):** a CDP `Input.dispatchTouchEvent` spread from 60 → 220 px about the canvas centre (`sigtest.cjs`, "touch"). The ratio is < 0.7 × r0. **Control:** a one-finger drag of the same length does not change the ratio.
    - Kills: none, guards existing behaviour (Sigma v4's own touch captor; no driver code runs on a touch pinch). It is still non-vacuous: a driver that fought Sigma, e.g. the `cam.on('updated')` listener calling `goTo(target!)` when `!ours`, turns it RED.
  - **27.276 (trap 8):** straight after load (`waitStill`), every clear item's `viewportOf` is inside `[0, width] × [0, height]` of the stage; the list checked is every non-fog node of the fixture's 2-hop view (assert its length first, > 0). `fitRatio()` is not 1. **Control:** `__kg.mountWithoutFirstFrameFit()`, a harness variant that fits in `mount` before any frame, puts at least one item outside. (It proves the trap is real; the variant lives in the harness only.)
    - Kills: (a) compute the fit in `mount` (`fitPending = false` + `computeFit` there) (b) `computeFit` solves for a fixed `{ width: 2000, height: 2000 }` instead of `stage.clientWidth` / `clientHeight` (a wrong viewport, which is what trap 8 is).
  - **27.277 (trap 9):** hover `ticket:t142`. A non-neighbour's `nodeDisplay().opacity` is `0.32`, a non-incident edge's opacity is `0.08`, and a neighbour's is `1`. Then hover the midpoint of `blocks t133 → t142`: every NON-FOG node's opacity is `1` (fog nodes are `0.9` by `program.ts:92` in every state), and that edge's size is `3.4`. **Control:** after the mouse leaves, every non-fog node is back to 1.
    - Kills: (a) dim on Sigma's `hasHovered` instead of `nodeHovered` (the edge-hover arm) (b) delete `sigma!.setNodesState(graph!.neighbors(node), { isNb: true })` (the neighbour leg) (c) `leaveNode` leaves `nodeHovered = true` (the control).
  - **27.278 (trap 10):** the arrowhead into the centre card is drawn. A sample ON the line cannot show it (the 2.2 px line itself is there), so sample `alphaAt` 2.5 px to the side of the `blocks t133 → t142` line at 3, 4, … 8 px before the centre: at least one is > 0, where only the arrowhead is wider than the line. **Control:** the same side samples at the edge's midpoint are all 0 (the line alone does not reach 2.5 px). Keep the precondition that the centre's `nodeDisplay().size` is `1`.
    - Kills: (a) `head:` → `'none'` for `blocks` in `program.ts` (b) the centre's size `1` → `16` in `program.ts` (the precondition). Both are Task 1's; this case is their guard.
  - **27.279 (trap 11):** a hover on the midpoint of `blocks t133 → t142` emits `{ kind: 'edge', id: 'blocks|ticket:t133|ticket:t142' }` with x/y within 3 px of the pointer. No text pixel is drawn along the edge: Sigma draws no edge label, and `renderEdgeLabels` is false. Check `alphaAt` 10 px off the line at its midpoint, which is 0. **Control:** the edge's size grew to 3.4.
    - Kills: (a) delete the `enterEdge` handler's `hovers.forEach(…)` (b) emit `x: event.x + 20` (c) `labelVisibility: 'hidden'` → `'visible'` with `label: (a) => a.id` in `program.ts` (the no-text leg; Task 1's).
  - **27.280 (selection and zoom):**
    - Zoom in by 2.
    - `setGraph` the same graph with `selected: 'ticket:t160'` and `keepView: true`. The ratio is unchanged.
    - Then `zoomBy(0.5)`. `nodeDisplay('ticket:t160')!.backdropBorderColor` is `palette.text`, and `nodeDisplay('ticket:t160')!.backdropBorderColor` was `palette.graphCardLine` before the `selected` `setGraph` (the probe field is added by the planner ruling 2026-10-04; the "before" read stops the leg passing on a constant).
    - **Control:** with `keepView: false`, the camera returns to the fit.
    - Kills: (a) `if (!view.keepView) driver.goTo(…)` → unconditional (b) `applyStates` drops the `setNodeState(states.selected, { isSel: true })` arm.
  - **27.281 (glide):**
    - Note `normalise({x:100,y:100})`.
    - Call `__kg.setCenter('ticket:t133')`, and count rAF frames for 340 ms in the page.
    - The normalisation is unchanged (< 1e-9), and frames ≥ 10 (`sigtest.cjs`, "glide").
    - An item whose layout did not change has identical `positions()` in every sampled frame (find one first: assert it exists).
    - **Control:** an item that moved had an intermediate position strictly between its start and end in some frame.
    - Kills: (a) delete `sigma.setCustomBBox(…)` in `mount` (the normalisation leg) (b) `to.set(n.ref, { x: p.x, y: -p.y })` → `y: p.y` (the unmoved item flips: the identical leg) (c) `glideFrame(from, to, now - t0, opts.reduceMotion())` → `…, true)` (the control).
  - **27.282 (long names, Review Focus 4):**
    - `__kg.setFixtureTitle('ticket:t142', 'x'.repeat(200))` re-lays out the view.
    - After `waitStill`, the REAL rendered label box is inside the stage (planner ruling 2026-10-04: geometry measured with the code's own assumed box proves nothing). The stage box is `.gn-kg__mount canvas`'s `getBoundingClientRect()`. Sigma paints labels into the canvas, so there is no label element to measure: the label's real left and right are found by an `alphaAt` scan along the centre card's label row (from `viewportOf('ticket:t142')`, stepping 1 px outwards until the alpha drops to the background's for 3 px). Both ink edges lie within `[rect.left, rect.right]` in page coordinates, with at least 1 px to spare. A precondition asserts the scan found ink (width > 40 px), or the leg holds of an empty row.
    - Structural check only (labelled so in the test): `viewportOf.x` ± the fit item's `r` is inside the stage. It uses the code's own assumed box (`fitItemsFor`), so it can only catch a fit that ignores its own numbers.
    - **Control:** the fit ratio is UNCHANGED from the fixture's own title. Both titles truncate to the same 34-character second line (t142's title, "Move sheet loses its scroll position on phone", is 45 characters, `knowledge-graph-sigma.html:489`), so the card is no wider; a ratio that GREW would mean the second line did not truncate. (The first draft said "the fit ratio grew", which only an untruncated line can do.)
    - Kills: (a) `nodeSub` without `truncate` (Task 2's; the control) (b) `computeFit` builds the fit from `view.fit` minus the centre item (c) `fitItemsFor`'s width estimate for the centre halved (`* 6.9` → `* 3.45`): the real ink overruns the stage while the structural check still passes (planner ruling 2026-10-04: the measured leg is the one that can see it).
  - **27.283 (setGraph at the stress size, printed):** `__kg.stressGraph()` sets 500 clear + 2,000 fog + 3,000 edges. The time `setGraph` takes is printed `kg-setgraph (LOCAL): <ms>`. The case asserts only that all 2,500 nodes are drawn (`Object.keys(positions()).length === 2500`).
    - Kills: (a) the `addEdgeWithKey` loop runs before the nodes exist (edges dropped; assert the 3,000 edges too, through `edgeDisplay` on a sample of 10 ids) (b) `g.forEachNode(… dropNode …)` drops every node not in the PREVIOUS graph.
  - **27.284 (reduced motion):** `page.emulateMedia({ reducedMotion: 'reduce' })`. `zoomBy(2)` lands in ONE frame (`frames()` +1 or +2 at most), and `setCenter` lands without intermediate positions. **Control:** without the emulation, the same zoom takes ≥ 8 frames.
    - Kills: (a) the driver's `loop` calls `springStep(…, false)` (b) `setGraph`'s glide passes `false` for `reduce` (the `setCenter` leg).
  - **27.285 (momentum):**
    - A mouse drag of 200 px over 120 ms, released while still moving.
    - Note the camera at release, then `waitStill`.
    - The camera kept moving AFTER the release in the same direction, by ≥ 20% of the drag.
    - **Control:** the same drag with a 100 ms pause before release does not move after release.
    - **If Sigma v4's own drag coasts,** the case passes with no adapter code: record "Sigma's inertia" in DONE and do not use `coastOffset`.
    - **If it does not,** add pointer sampling to the camera driver (`pointerdown` / `pointermove` / `pointerup` on `stage`). On `pointerup`, `panBy(-coast.x, -coast.y)` with `coastOffset(samples, now)`. Then make the case pass.
    - Kills (adapter path only): (a) delete the `pointerup` `panBy` (b) `panBy(coast.x, coast.y)` (the direction leg). On "Sigma's inertia" it guards existing behaviour.
  - **27.286 (dropped node, trap 1's other half):** `setCenter('ticket:t133')` drops at least one item that had a subtitle (assert the dropped-with-subtitle set is non-empty). Its ref is in `invalidated()`. **Control:** an item kept with an unchanged `sub` (find one; assert it exists) is NOT in it.
    - Kills: (a) delete `dropSub(ref)` from the `forEachNode(… dropNode …)` line (b) `dropSub(n.ref)` unconditionally in the merge branch (the control).
  - **27.287 (Review Focus 3, OS theme flip):**
    - The harness has no `data-theme` and listens with `watchTheme` → `renderer.refreshTheme(readThemePalette(...))`.
    - `page.emulateMedia({ colorScheme: 'dark' })`, then `waitStill`.
    - `nodeDisplay('person:pA').image` CHANGED.
    - The decoded SVG of the new URI contains the dark `surfaceSunken` value (read through `readThemePalette` in the page).
    - `nodeDisplay('ticket:t133').backdropColor` equals the dark `surfaceRaised`.
    - **Control:** flipping back to light restores the first URI exactly (the cache is keyed by palette).
    - Kills: (a) `refreshTheme` keeps `a.image` (b) `watchTheme` without the `matchMedia` listener (c) `refreshTheme` without `palette = pal` (the `backdropColor` leg).
  - **27.288 (destroy):** `renderer.destroy()`. No canvas is left in the mount element, and a wheel over where the canvas was now scrolls the page. **Control:** before destroy, the same wheel did not scroll.
    - Kills: (a) delete `host?.replaceChildren()`. NOT killable here: dropping `el.removeEventListener('wheel', belt)`, because `replaceChildren` detaches the stage the belt sits on, so the page scrolls either way. The first draft's "(the belt listener is gone)" claimed that; it is an equivalent mutant at this level.

  Run: `pnpm turbo run build --filter=@gisik-nokma/knowledge-graph... && pnpm --filter @gisik-nokma/knowledge-graph-browser test > /tmp/kg-t5.log 2>&1; tail -40 /tmp/kg-t5.log`. Expected: all PASS under SwiftShader, LOCAL. Quote the passing count and the 27.283 line.

  **Flakes.** If a case is flaky under SwiftShader, it waits on the wrong thing: replace any fixed timeout with `waitStill` on the probe value the case reads. Do NOT add retries.

- [ ] **Step 5: Mutations (each must turn a case RED, then be reverted).**
  - In `attachment-cache.ts`, keep the real `invalidateNode` (delete the no-op lines). 27.264 or 27.265 goes RED.
  - In `program.ts`, change `SOLID` to `[10000, 0]`. 27.266 goes RED.
  - Delete the `belt` listener. 27.272's `scrollY` check goes RED. If Sigma's own `preventDefault` already holds the page, the belt is untestable here: record that, keep the belt, and say so in DONE.
  - Fit in `mount` instead of the first `afterRender`. 27.276 goes RED.
  - Dim on `hasHovered` instead of `nodeHovered`. 27.277's edge-hover arm goes RED.
  - In `refreshTheme`, do not recompute `image`. 27.287 goes RED.
  - Drop `if (isFog(node)) return` from `clickNode`. 27.270 goes RED.

- [ ] **Step 6: Catalogue, Features, sweeps.**

  Under `<!-- KG-C T5 -->`:
  - ✅ 27.263–27.289. 27.289 is the jsdom probe-off case.
  - 27.283 and 27.285 carry their LOCAL numbers or the "Sigma's inertia" note.

  Bullet: "Sigma v4 adapter behind `GraphRenderer` (`render/sigma/adapter.ts`), every §4.2 trap pinned by a browser case".

  **Prose to sweep:**
  - `packages/knowledge-graph/src/render/palette.ts:3-4` — "the reader is `cssVariableName(role)` (Task 7)": this task writes that reader, `readThemePalette` in `src/theme/read-palette.ts` (27.263).
  - `Features.md:3767` — the KG-C ⚙️ bullet: "`@gisik-nokma/knowledge-graph-browser` is the Playwright stress probe" (it now also carries the adapter's trap suite, `tests/{traps,camera,theme}.spec.ts`) and the "Cases 27.200–27.211." range.

  **Sweeps:**
  - Build; then the `knowledge-graph` suite, whole (the seam check included);
  - the browser package, whole;
  - `ui#test` (the colour scan now walks `render/sigma/`);
  - `check:citations` (the browser `tests/` path is cited through Task 1's `isTestPath` line).

  Push, then DONE, with `NEEDS: browser`.

---

### Task 6: `GET /v1/graph/neighbours`: the route, visibility, scope, order and page on A's and B's real tables (cases 27.290–27.309)

**Depends on:**
- Task 1;
- Plan A's migration-and-projection task (`proj_ticket_links`) and Plan B's migration-and-projection task (`proj_references`), both MERGED into `release/knowledge-graph`.

Before cutting the branch, check: `git grep -n "CREATE TABLE proj_ticket_links\|CREATE TABLE proj_references" origin/release/knowledge-graph -- apps/server/migrations` prints two lines. If it does not, the task waits. This task is parallel with Tasks 2–5.

**Needs (planner ruling 2026-10-04):** typed-links T2, the `proj_ticket_links` migration (`apps/server/migrations/1791400000000_proj-ticket-links.sql`, typed-links plan `:557`, `:622`). It is NOT on `origin/release/knowledge-graph` as of `5414385a0`; only B's `1791500000000_proj-references.sql` is.

- [ ] **Step 0: The migration is there, or STOP (planner ruling 2026-10-04).**
  ```bash
  git ls-tree --name-only origin/release/knowledge-graph apps/server/migrations/ | grep -F -e 1791400000000_proj-ticket-links.sql -e 1791500000000_proj-references.sql
  ```
  Two lines, or STOP: report DONE-blocked with `NEEDS: typed-links T2 (proj_ticket_links migration)` (or `reference-index` for the second file) and write nothing. A renamed migration still counts if `git grep -n "CREATE TABLE proj_ticket_links" origin/release/knowledge-graph -- apps/server/migrations` finds it; say which file in DONE.

**The tests run on the REAL tables (planner ruling, 2026-10-04).** Every Task 6 case, and Task 1's 27.208–27.211 once this task lands, reads `proj_ticket_links` and `proj_references` as A's and B's migrations create them, never as `apps/server/test/graph/shim.ts` creates them. So:
- `neighbours.test.ts` never imports `./shim.js`;
- the shim is DELETED in Step 1, before the cases are written, not after they pass. A missing or renamed table is then a red `relation "proj_ticket_links" does not exist`, never a silent `CREATE TABLE IF NOT EXISTS` with the spec's DDL;
- the column lists in `link()` and in the `proj_references` INSERTs are copied from the migration files, with their `file:line` cited in a comment.

On the ref at planning time (`5414385a0`), only `apps/server/migrations/1791500000000_proj-references.sql:15` exists; `proj_ticket_links` has no migration yet, so the check above prints one line and this task waits for plan A's migration task.

**Files:**
- Create:
  - `apps/server/src/routes/graph.ts`
  - `apps/server/test/graph/neighbours.test.ts`
- Modify:
  - `apps/server/src/app.ts`: register beside `registerMyWorkRoutes` (`app.ts:1031`)
  - `apps/server/test/graph/perf.test.ts`: drop the shim
  - `apps/server/src/read/graph-neighbours.ts`: re-read A's and B's migrations, and adjust the column names in `expand` if they differ from the spec DDL that Task 1 copied
  - the catalogue (`<!-- KG-C T6 -->`) and the Features bullet
- Delete: `apps/server/test/graph/shim.ts`

**Interfaces:**
- **Consumes:** `readGraphRing` and `GraphRingRequest` (Task 1); `READ_NOT_FOUND_BODY` (`read/membership.ts:15`); the `registerMyWorkRoutes` shape (`routes/my-work.ts:586-609`).
- **Produces:**
  - `GET /v1/graph/neighbours?center=<kind>:<id>&hops=<1..8>&ws=<id,…>&proj=<id,…>&groups=<g,…>&cursor=<n>`;
  - `200 GraphRingResponse`;
  - `400 { error: 'invalid_query' }`;
  - `401` (the session preHandler);
  - `404 READ_NOT_FOUND_BODY`;
  - `registerGraphRoutes(app, { pool }, requireSession)`;
  - `parseRingQuery(raw): GraphRingRequest | null`.

**Hops.** `hops` goes to **8** (`GRAPH_MAX_HOPS`), not the spec's `1..4` (§2.2). The client asks for hops 1…n and then "one more ring for the fog" (§2.2), so 4 clear hops already need ring 5. "Everything" (§3.1) walks until a ring comes back empty. The cap of 8 keeps "Everything" bounded: 7 clear rings and a fog ring. This is reported in the reply as a spec contradiction.

- [ ] **Step 1: The shim goes, then the cases, RED first.**
  1. Delete `apps/server/test/graph/shim.ts`, and its import (`perf.test.ts:11`) and call (`perf.test.ts:16`). Run 27.208, 27.209 and 27.211 on the migrated tables: expected PASS. If a column name differs from the shim's, fix `expand` in `read/graph-neighbours.ts` now (this step's commit), and say which.
  2. Then write the cases below.

  `apps/server/test/graph/neighbours.test.ts` is shaped like `test/routes/my-work.test.ts` (imports at `:1-9`). The world is `buildReadTestApp(db)`. Typed links and references are written STRAIGHT into A's and B's projection tables, because the projections' writers are A's and B's tested concern. The column lists are copied from their migration files: re-read them and cite the file:line in a comment. `beforeAll` asserts, right after `createTestDatabase()`, that `SELECT to_regclass('public.proj_ticket_links') IS NOT NULL AND to_regclass('public.proj_references') IS NOT NULL` is true: the migrations made them, since nothing else in this file can.
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { GRAPH_GROUPS, graphRef, newUlid, type GraphRingResponse, type LedgerEvent } from '@gisik-nokma/domain';
  import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
  import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
  import { readGraphRing } from '../../src/read/graph-neighbours.js';
  import { applyCommitted, makeCommitted } from '../helpers/apply.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

  let db: TestDatabase;
  let read: ReadWorld;
  beforeAll(async () => {
    db = await createTestDatabase();
    // the planner ruling: A's and B's MIGRATIONS made these, not test/graph/shim.ts (deleted in this step)
    const { rows } = await db.pool.query<{ ok: boolean }>(`SELECT to_regclass('public.proj_ticket_links') IS NOT NULL AND to_regclass('public.proj_references') IS NOT NULL AS ok`);
    expect(rows[0]?.ok).toBe(true);
    read = await buildReadTestApp(db);
  }, 600_000);
  afterAll(async () => {
    await read.app.close();
    await db.drop();
  });

  const NO_PROJECTS = GRAPH_GROUPS.filter((g) => g !== 'projects' && g !== 'concepts').join(',');
  async function ring(role: ReadRole, q: Record<string, string>): Promise<{ status: number; body: GraphRingResponse & { error?: string } }> {
    const res = await read.app.inject({ method: 'GET', url: `/v1/graph/neighbours?${new URLSearchParams(q)}`, headers: read.authOf(role) });
    return { status: res.statusCode, body: res.json() };
  }
  const ws = () => read.world.workspaceId;
  const refs = (r: GraphRingResponse) => r.items.map((i) => i.ref).sort();

  async function ticket(title: string, opts: { parentId?: string | null; explicit?: string[] } = {}): Promise<string> {
    const id = newUlid();
    const base = { workspaceId: ws(), actorId: read.world.owner };
    const events: LedgerEvent[] = [makeCommitted({ ...base, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: 'task', projectId: read.world.projectId, parentId: opts.parentId ?? null, title } })];
    if (opts.explicit) events.push(makeCommitted({ ...base, entity: { kind: 'ticket', id }, type: 'visibility.set', payload: { ticketId: id, mode: 'explicit', userIds: opts.explicit } }));
    await applyCommitted(db.pool, events);
    return id;
  }
  async function link(kind: 'blocks' | 'relates' | 'duplicates', source: string, target: string, by = read.world.owner, origin = 'web'): Promise<void> {
    // columns: A's migration (cite file:line here)
    await db.pool.query(
      `INSERT INTO proj_ticket_links (workspace_id, source_id, target_id, kind, created_by, created_at, origin, seq) VALUES ($1, $2, $3, $4, $5, '2026-10-01T05:00:00Z', $6, 1)`,
      [ws(), source, target, kind, by, origin],
    );
  }
  ```
  Check `makeCommitted`'s parameter names against `test/helpers/apply.ts` before writing; the read scenario's calls (`read-scenario.ts:135-180`) show them. Copy that spread shape (`{ ...ws, entity, type, payload }`) exactly; the `base` above is the stand-in for it.

  The cases (each `it` named with its id, its control inside). **Groups:** every request below passes `groups: NO_PROJECTS` unless it names its groups. With the default groups the `projects` group's `in` edges join every ticket of the project at hop 2, which would put B in 27.293's ring 2 without H, a project item in 27.296's order, and so on.
  - **27.290** `ring('member', { center: graphRef('ticket', world.epicId), hops: '1', ws: ws(), groups: NO_PROJECTS })` is 200. Its items contain `ticket:<taskInEpicId>`, and its edges contain `parent|ticket:<epicId>|ticket:<taskInEpicId>`. **Control:** the same request with no `authorization` header is 401 with `UNAUTHENTICATED_BODY`.
  - **27.291** Each of these is 400 `{ error: 'invalid_query' }`, each being the 27.290 query with ONE parameter replaced (so each 400 is that parameter's own): `center=widget:1`, `center=ticket:`, `hops=0`, `hops=9`, `hops=1.5`, `ws` missing, `ws=` 21 comma-separated ids, `groups=blocks,colours`, `cursor=-1`. **Control:** the 27.290 request with `cursor=0` is 200.
  - **27.292** A member asking with `ws=<the neighbour workspace id>` (`read.neighbour`) is 404 `READ_NOT_FOUND_BODY`. So is a member asking for `center=ticket:<hiddenTaskId>`, and so is a member asking for `center=ticket:<newUlid()>`. All three bodies are deep-equal. **Control:** the owner's request for the hidden ticket is 200.
  - **27.293** (Review Focus 1) Seed `A = ticket('A')`, `H = ticket('H', { explicit: [owner] })`, `B = ticket('B')` and `V = ticket('V')`, then `link('relates', A, H)`, `link('relates', H, B)` and `link('relates', A, V)`.
    - The member's ring 1 of A is exactly `[ticket:V]`: no `H`, and no edge naming `H`. (V is the member-side control: the member's walk works and reaches A's visible neighbour, so an empty answer below is about H.)
    - The member's ring 2 of A is EMPTY: B is reachable only through H.
    - **Control:** the owner's ring 1 holds H and V, and their ring 2 holds B.
  - **27.294** `link('blocks', sharedTaskId, hiddenTaskId)` and `link('relates', sharedTaskId, V2)` with a fresh visible `V2`. The member's ring 1 of the shared ticket holds `ticket:V2` (non-empty) and has no edge whose `to` or `from` names the hidden ticket. **Control:** the owner's does.
  - **27.295** Out of scope. Use the sibling project (`read.sibling`, `test/helpers/read-app.ts:103`). `link('relates', sharedTaskId, siblingTicket)`, then link the sibling ticket on to a third ticket `S2` in the sibling project.
    - With `proj=<world.projectId>`, ring 1 holds the sibling ticket with `out: true`, and `frontier` excludes it.
    - Ring 2 does NOT contain S2.
    - **Control:** with no `proj`, the sibling ticket is `out: false` and ring 2 holds S2.
  - **27.296** Ring order (§2.2). A fresh centre C gets a child (parent), a `blocks` target, a note that references it (an INSERT into `proj_references`, source note → target C), and an assignee (`ticket.assigned`). Ring 1's item order is exactly: the blocks target, the child, the note, the person. (Before the sort, `expand` emits the child FIRST, so this order is the sort's work.) Newest first: make two `relates` targets, let `[older, newer] = [T1, T2].sort()` BY ID (`newUlid()` is not monotonic within a millisecond, `packages/domain/src/ids.ts:31-33`, so creation order does not decide it), and insert the link to `older` FIRST, then `newer`. Their ring order is `newer` before `older`, the reverse of the insertion order. **Control:** `groups=structure` returns only the child.
  - **27.297** The page cut. Use `readGraphRing` directly with `groups: new Set(['relates'])` and `pageSize: 2` on a centre with five `relates` neighbours.
    - Page 1 has 2 items, `truncated: true` and `cursor: '2'`.
    - Page 2 (`offset: 2`) has the next 2, with `truncated: true` and `cursor: '4'`.
    - Page 3 (`offset: 4`) has 1, with `truncated: false` and `cursor: null`.
    - Pages 1 + 2 + 3, concatenated, EQUAL the refs of the same read with no `pageSize`, in order (all five, no repeats, and the cut follows the ring order).
    - **Control:** a ring of exactly 2 with `pageSize: 2` is not truncated.
  - **27.298** People. The member's ring 1 of `taskInEpicId` holds `person:<member's userId>`, labelled with the member's display name (read from `readActorNames(db.pool, ws())`, not typed), and an edge `assignee|person:<id>|ticket:<id>`. The guest arm, made concrete: INSERT two `proj_references` mention rows on `guestTaskId` (`source_kind` `'ticket'`, `source_id` and `source_parent_id` `guestTaskId`, `source_parent_kind` `'ticket'`, `target_kind` `'person'`), one naming the OWNER (an actor on `guestTaskId`, so the guest may be told the name, `routes/builder-reads.ts:359-377`) and one naming the MEMBER (on no ticket the guest can see). The guest's ring 1 of `guestTaskId` with `groups=people` holds `person:<owner>` and NOT `person:<member>`, and no edge names the member. **Control:** the owner's same ring holds both people.
  - **27.299** References (B). INSERT a `proj_references` row with B's columns (`apps/server/migrations/1791500000000_proj-references.sql:15-29`; the spec's `source_ticket` is `source_parent_kind` + `source_parent_id`, Planner rulings below): `source_kind` `'comment'`, `source_id` a fresh ULID, `source_parent_kind` `'ticket'`, `source_parent_id` `sharedTaskId`, `target_kind` `'ticket'`, `target_id` `taskInEpicId`, `ordinal` 0, snippet `'see [[GN-2]]'` and `updated_by = member`.
    - The member's ring 1 of `taskInEpicId` holds `ticket:<sharedTaskId>`, with an edge `ref|ticket:<shared>|ticket:<taskInEpic>` (the edge starts at the comment's PARENT, not at the comment).
    - Its `snippet` is `'see [[GN-2]]'`, and `addedBy` is the member's display name, not an id.
    - **Control:** a reference whose SOURCE parent is the hidden ticket yields nothing to the member.
  - **27.300** Typed-link provenance. `link('relates', a, b, member, 'mcp')`. The edge's `addedBy` is the member's display name, `addedAt` is `'2026-10-01T05:00:00.000Z'`, and `origin` is `'mcp'`. **Control:** `link(..., owner, 'web')` gives `origin: 'web'`.
  - **27.301** Attached notes. A `note.created` with `attachTicketId: sharedTaskId`, `scope: { mode: 'workspace' }`, and a second note with `scope: { mode: 'private' }` by the OWNER, also attached.
    - The member's ring 1 of the shared ticket holds the first note, with an `attached` edge whose `addedAt` EQUALS that row's `proj_note_attachments.attached_at` as ISO (read it back; "is set" passes for any date) and whose `addedBy` is null (the table has no actor; spec gap 8).
    - The private note is absent.
    - **Control:** the owner sees both.
  - **27.302** The projects group. `groups=projects` on `taskInEpicId` gives ring 1 = `project:<projectId>` (an `in` edge from it). Ring 2 holds `workspace:<ws>` and the project's other visible tickets. A workspace-level note (`homeProjectId: ''`) is NOT in ring 1 of a project. **Control:** a project-homed note (`homeProjectId: <projectId>`) IS in ring 2 of `taskInEpicId`, so notes do travel this group and the workspace-level one's absence is its own; and with `workspace:<ws>` as the centre, ring 1 holds the project and not the workspace-level note (the mockup draws `in` edges only for items with a project, `:550-551`).
  - **27.303** Multi-workspace. The member is also a member of a second workspace: seed with `seedNeighbourWorkspace` if it makes the member a member; otherwise seed a fresh workspace with `membership.granted` for the member. A person assigned in both workspaces connects them.
    - With `ws=<w1>,<w2>`, ring 2 of a w1 ticket holds the w2 ticket, `out: false`.
    - With `ws=<w1>` only, it is `out: true`. The PERSON is never out.
    - **Control:** `ws=<w1>,<a workspace the member is not in>` is 404.
  - **27.304** A deleted ticket (`ticket.deleted`) linked to the centre is absent. **Control:** after `ticket.restored`, it is back.
  - **27.305** The perf case re-runs on the migrated tables. Its `it` is Task 1's 27.210 (`perf.test.ts:161`, named `27.210 p95 ≤ 150 ms …` on the ref); rename it `27.210 / 27.305 …` in this task so the id greps to its test. `KG_PERF=1` only; quote its three lines.
  - **27.306** The centre has a child AND a `blocks` target. `groups=blocks` gives ring 1 = the blocks target only (non-empty) and no `parent` edge. **Control:** `groups=structure` has the child and the `parent` edge.
  - **27.307** A fresh chain C → D → E (`relates`), so with `NO_PROJECTS` it is exactly two rings. `hops=8` returns `{ items: [], edges: [], frontier: [], truncated: false, cursor: null }` (`toEqual`), and so does `hops=3`. **Control:** `hops=2` has exactly `[ticket:E]`.

  Kills (this task's own code is the route and `parseRingQuery`; most cases also guard Task 1's `readGraphRing`, named "T1"):
  - 27.290: (a) do not register the route in `app.ts` (b) `{ preHandler: requireSession }` dropped (the 401 control).
  - 27.291: (a) delete `if (hops > GRAPH_MAX_HOPS) return null;` (`hops=9`) (b) `workspaceIds.length > 20` → `> 200` (the 21-id leg) (c) the cursor pattern → `/^-?(0|[1-9]\d{0,6})$/` (the `-1` leg) (d) `/^(0|[1-9]\d{0,6})$/` → `/^[1-9]\d{0,6}$/` (the `cursor=0` control).
  - 27.292: (a) the route answers `403` for a non-member workspace (b) T1: delete `if (!known.has(centerRef)) return null;` (the hidden and the unknown centre answer an empty 200).
  - 27.293: T1 (a) drop `if (!known.has(edge.from) || !known.has(edge.to)) continue;` (b) the ticket resolve drops `AND ${visibleTicketsWhere(eff, viewerId, params)}` (H resolves for the member).
  - 27.294: T1 (a) the same both-ends check dropped (the unresolved end then crashes the page build: a 500) (b) the same `visibleTicketsWhere` drop.
  - 27.295: (a) the route passes `projectIds: []` to `readGraphRing` (b) T1: `frontier = next.filter(…)` → `frontier = next`.
  - 27.296: T1 (a) delete `.sort(compareRingEntries)` (the child leads) (b) swap `ia < ib ? 1 : -1` (the newer/older leg).
  - 27.297: T1 (a) `page = ordered.slice(req.offset, …)` → `ordered.slice(0, size)` (b) `truncated = ordered.length > …` → `>=` (the control) (c) `cursor: String(req.offset + size)` → `String(size)` (page 2's `'4'`).
  - 27.298: T1 (a) in `namesIn`, always call `readActorNames` (the member mention appears for the guest) (b) delete `if (name === null) continue; // a person no workspace of the viewer's names is not drawn`.
  - 27.299: T1 (a) `sourceRef` → `graphRef(r.source_kind, r.source_id)` (an unresolvable `comment:` ref: the edge is dropped) (b) `addedBy: … await vis.nameOf(…)` → `edge.addedById`.
  - 27.300: T1 (a) `origin: edge.origin` → `null` (b) `addedAt: edge.addedAt.toISOString()` → `String(edge.addedAt)`.
  - 27.301: T1 (a) `addedAt: r.attached_at` dropped from the `attached` add (b) the notes resolve without `visibleNotesWhere` (the private note appears).
  - 27.302: T1 (a) delete the `proj_projects` `in` query (no `workspace:` in ring 2) (b) delete the `proj_notes` `in` query (the project-homed note control). The `home_project_id <> ''` clause is EQUIVALENT here: a workspace-level note's `in` edge would come from `project:` (empty id), which never resolves.
  - 27.303: T1 (a) `out: !inGraphScope(item, req)` → `out: false` (b) delete `for (const workspaceId of req.workspaceIds) if ((await vis.roleIn(workspaceId)) === null) return null;` (the 404 control).
  - 27.304: T1 (a) the ticket resolve drops `AND ${LIVE_TICKET_WHERE}`.
  - 27.305: none, guards existing behaviour (Task 1's p95 bar, now on the real indexes).
  - 27.306: (a) `parseRingQuery` ignores `groups` (`DEFAULT_GROUPS` always) (b) T1: `groups.has('structure')` → `true`.
  - 27.307: (a) `parseRingQuery` clamps `hops` to 2 (`const hops = Math.min(Number(raw.hops), 2)`) (b) T1: the loop bound `hop <= req.hops` → `hop < req.hops` (the control). T1's three empty-answer guards (`ring = []` on an empty frontier, `ring.length === 0`, `includes(req.hops)`) cover for each other on this world: deleting any ONE is equivalent here, so no case claims them.

  Run: `pnpm --filter @gisik-nokma/server exec vitest run test/graph/neighbours.test.ts --maxWorkers=2 > /tmp/kg-t6.log 2>&1; tail -25 /tmp/kg-t6.log`. Expected: FAIL (404 from Fastify: no route).

- [ ] **Step 2: The route.** `apps/server/src/routes/graph.ts`, copied from `routes/my-work.ts:586-609`'s shape:
  ```ts
  import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
  import { GRAPH_GROUPS, GRAPH_MAX_HOPS, parseGraphRef, type GraphGroup } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { READ_NOT_FOUND_BODY } from '../read/membership.js';
  import { readGraphRing, type GraphRingRequest } from '../read/graph-neighbours.js';

  type RawRingQuery = { center?: string; hops?: string; ws?: string; proj?: string; groups?: string; cursor?: string };
  const list = (raw: string | undefined) => (raw === undefined || raw === '' ? [] : raw.split(','));
  const DEFAULT_GROUPS = GRAPH_GROUPS.filter((g) => g !== 'concepts');

  /** Null = 400. Every bound is checked before a query runs. */
  export function parseRingQuery(raw: RawRingQuery): GraphRingRequest | null {
    const center = raw.center === undefined ? null : parseGraphRef(raw.center);
    if (center === null) return null;
    if (!/^[1-9]$/.test(raw.hops ?? '')) return null;
    const hops = Number(raw.hops);
    if (hops > GRAPH_MAX_HOPS) return null;
    const workspaceIds = list(raw.ws);
    if (workspaceIds.length === 0 || workspaceIds.length > 20) return null;
    const projectIds = list(raw.proj);
    const groups = raw.groups === undefined ? DEFAULT_GROUPS : list(raw.groups);
    if (groups.some((g) => !(GRAPH_GROUPS as readonly string[]).includes(g))) return null;
    if (raw.cursor !== undefined && !/^(0|[1-9]\d{0,6})$/.test(raw.cursor)) return null;
    return { center, hops, workspaceIds, projectIds, groups: new Set(groups as GraphGroup[]), offset: raw.cursor === undefined ? 0 : Number(raw.cursor) };
  }

  /**
   * One ring of the Knowledge Graph (spec C §2.2). The viewer is `request.currentUserId`: never a parameter. A workspace
   * the viewer is not in, an unknown centre, and a centre they cannot see are the SAME 404, so the answer does not reveal
   * that an id exists (as every read route here).
   */
  export function registerGraphRoutes(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
    app.get<{ Querystring: RawRingQuery }>('/v1/graph/neighbours', { preHandler: requireSession }, async (request, reply) => {
      const req = parseRingQuery(request.query);
      if (req === null) return reply.status(400).send({ error: 'invalid_query' });
      const ring = await readGraphRing(deps.pool, request.currentUserId, req);
      if (ring === null) return reply.status(404).send(READ_NOT_FOUND_BODY);
      return ring;
    });
  }
  ```
  The `^[1-9]$` check plus the `> GRAPH_MAX_HOPS` check together refuse `9`, `0`, `1.5` and `10`.

  In `app.ts`, directly after `registerMyWorkRoutes(app, { pool: deps.pool }, requireSession);` (`:1031`), add a comment and the registration:
  ```ts
  // The Knowledge Graph's ring read (spec C §2.2): one ring per call, the viewer from the session, visibility per workspace.
  registerGraphRoutes(app, { pool: deps.pool }, requireSession);
  ```

- [ ] **Step 3: Green on the real tables.** (The shim went in Step 1; `git grep -n "shim" apps/server/test/graph` prints nothing.)
  1. Run the file. Expected: PASS.
  2. Run 27.208, 27.209, 27.211 and the perf block. Expected: PASS, on the migrated tables.
  3. Run `KG_PERF=1` and quote the three lines (27.305).
  4. If any ring's p95 is now over 150 ms on the migrated tables (A's and B's real indexes), STOP AND REPORT, as in Task 1 Step 14.

  **Mutations:**
  - In `readGraphRing`, drop the "both ends resolved" check (`if (!known.has(edge.from) || !known.has(edge.to)) continue;`). 27.293 and 27.294 go RED.
  - Make `frontier` use `next` unfiltered by scope. 27.295 goes RED.
  - Swap the `compareRingEntries` id comparison. 27.296 goes RED.
  - In `namesIn`, always call `readActorNames`. 27.298's guest arm goes RED.

- [ ] **Step 4: Catalogue, Features, sweeps.**

  Under `<!-- KG-C T6 -->`:
  - ✅ 27.290–27.307 (27.305 with its LOCAL numbers);
  - 27.308–27.309 stay unallocated (no lines).

  Bullet: "`GET /v1/graph/neighbours` (`apps/server/src/routes/graph.ts`), one ring per call, visibility per workspace, hops 1–8".

  **Prose to sweep:**
  - `apps/server/test/graph/perf.test.ts:3` — "The link and reference tables come from `./shim.ts` until plan A's and plan B's migrations are on the branch."
  - `apps/server/test/graph/perf.test.ts:204-205` — "plus plain INSERTs into the shimmed link and reference tables".
  - `test-cases/27-knowledge-graph.md:89` (27.211) — "(a `proj_ticket_links` shim insert)".
  - `test-cases/27-knowledge-graph.md:87` (27.209) — "Survivors handed to the endpoint task (the smoke world cannot reach them): walking past an out-of-scope item, keeping an edge back to an earlier ring, note visibility dropped." This task kills the first (27.295) and the third (27.301); say so there. The second (`if (dist.get(far) !== hop) continue;`) is still unclaimed: such an edge joins `intoRing` but neither end is on the page, so the `onPage` filter drops it. Record it as equivalent or name the case that kills it; do not leave "handed to the endpoint task".
  - `Features.md:3767` — the KG-C ⚙️ bullet's "Cases 27.200–27.211." range.

  **Sweeps:**
  - the server's `test/graph/`;
  - `test/routes/` (all of it: `app.ts` changed);
  - `test/ci/`;
  - `check:citations`;
  - `check:tasks`.

  **Census.** A new ROUTE has its own census here. Grep `apps/server/test` for a test listing every registered route (`printRoutes` or a route inventory). If one exists, add this route to it in this commit.

  Push, then DONE.

---

### Task 7: The `KnowledgeGraph` view: rings, cache, bar, scope, filters, hops, trail, keys, states, the semantic switch, the phone bar (cases 27.310–27.329)

**Depends on:** Task 5. Invoke `frontend-design` for this task: it is UI work (workspace rule).

**Files:**
- Create:
  - `packages/knowledge-graph/src/react/knowledge-graph.tsx`
  - `packages/knowledge-graph/src/react/graph-bar.tsx`
  - `packages/knowledge-graph/src/react/use-graph-rings.ts`
  - `packages/knowledge-graph/src/react/semantic-pref.ts`
  - `packages/knowledge-graph/src/react/tooltip.ts`
  - `packages/knowledge-graph/src/react/types.ts`
  - `packages/knowledge-graph/test/react/{draw-model,tooltip,semantic-pref,knowledge-graph}.test.ts(x)`
  - `packages/knowledge-graph/test/react/fake-renderer.ts`
  - `packages/knowledge-graph-browser/tests/view.spec.ts`
- Modify:
  - `packages/knowledge-graph/src/react/draw-model.ts` (created in Task 5 with `iconFor`): add `buildDrawModel`
  - `packages/knowledge-graph-browser/harness/main.tsx`: render `KnowledgeGraph` on the fixture
  - `packages/knowledge-graph/src/index.ts`
  - `packages/ui/src/ui.css` (`/* KG: T7 view+bar */`)
  - the catalogue (`<!-- KG-C T7 -->`) and the Features bullet

**Interfaces:**
- **Consumes:**
  - the engine (Tasks 2 and 3);
  - `GraphRenderer`, `CreateRenderer`, `readThemePalette` and `watchTheme` (Task 5);
  - from `@gisik-nokma/ui`: `Select` (`multiple: true`, `packages/ui/src/select/select.tsx:42-67`), `SegmentedControl` (`components/segmented-control.tsx:7`), `SkeletonRegion` / `Skeleton` (`components/skeleton.tsx:11,24`).
- **Produces** (from `src/react/types.ts`; Plan E's Home and Task 9 consume these EXACTLY):
  ```ts
  import type { GraphEdgeView, GraphGroup, GraphItemView, GraphRingResponse } from '@gisik-nokma/domain';
  import type { RingConfigName } from '../engine/layout.js';
  import type { CreateRenderer } from '../render/renderer.js';

  export type HopChoice = 1 | 2 | 3 | 4 | 'all';
  export type GraphRingQuery = { center: string; hops: number; workspaceIds: readonly string[]; projectIds: readonly string[]; groups: readonly GraphGroup[] };
  /** The data door. The web passes app-core's gateway (Task 9); the harness passes the fixture. */
  export type GraphSource = { ring(q: GraphRingQuery): Promise<GraphRingResponse> };
  export type ScopeChoices = { workspaces: readonly { id: string; name: string; projects: readonly { id: string; name: string }[] }[] };
  /** What Home counts from ("N more are further out"). */
  export type GraphZonesSummary = { clear: ReadonlySet<string>; fog: ReadonlySet<string>; beyond: number; clearHop: number; capped: boolean };
  export type KnowledgeGraphProps = {
    /** `kind:id`, built with `kgNodeId` (`@gisik-nokma/knowledge-graph/ids`). A new value resets the trail. */
    centre: string;
    /** Ring radii and levels: `CFG.desktop` / `CFG.phone` / `CFG.home` (`knowledge-graph-sigma.html:602-606`). The host decides (web: `useIsPhone`). */
    config: RingConfigName;
    source: GraphSource;
    scope: ScopeChoices;
    /** Default: the current workspace (§3.5). */
    defaultWorkspaceIds: readonly string[];
    /** The chips offered, in display order. Default: every group but `projects` (the mockup offers Projects only on a workspace centre, `:555`, `:712`). */
    groups?: readonly GraphGroup[];
    /** Controlled hops (Home). Uncontrolled default: 2 on desktop/home; a phone is always 1 (§5). */
    hops?: HopChoice;
    onHopsChange?: (hops: HopChoice) => void;
    /** Home's stat highlight: lit 100%, the rest items 25% / edges 12%; WINS over hover dimming. */
    highlight?: ReadonlySet<string> | null;
    onZones?: (zones: GraphZonesSummary) => void;
    /** The host gets Esc first: return true to consume it (Home clears its highlight); otherwise the view does Back. */
    onEscape?: () => boolean;
    onOpen: (item: GraphItemView) => void;
    /** Kinds the host has no page for get no Open button (a control that cannot be honoured is refused, `ticket-sheet.tsx:340-348`). Default: all. */
    canOpen?: (item: GraphItemView) => boolean;
    /** Spec A's "Add link" for an empty ticket centre (§6.2). Absent = no button. */
    onAddLink?: (centre: GraphItemView) => void;
    /** Task 8: spec A's "Remove link" on a typed link, with Undo. */
    onRemoveLink?: (edge: GraphEdgeView) => Promise<{ undo: () => Promise<void> }>;
    canRemoveLink?: (edge: GraphEdgeView) => boolean;
    /** Hide the bar's Hops control (Home draws its own). */
    showHops?: boolean;
    /** Tests and the harness inject a renderer; default = the Sigma adapter, loaded with `import()`. */
    createRenderer?: () => Promise<CreateRenderer>;
  };
  ```
  `KnowledgeGraph` is CLIENT-ONLY. It touches `window`, `matchMedia`, WebGL and `localStorage`. The web loads it with `next/dynamic(() => import(...), { ssr: false })` (Task 9; Home does the same). Its first line is `'use client';`.

- [ ] **Step 1: The pure view helpers, test first (27.310–27.312).**

  `buildDrawModel` ports the node and edge half of `render` (`knowledge-graph-sigma.html:915-948`):
  ```ts
  // src/react/draw-model.ts (add below iconFor)
  import { GROUP_OF_EDGE_KIND, type GraphGroup, type GraphItemView } from '@gisik-nokma/domain';
  import { fitItemsFor, TOP_PX, type FitItem } from '../engine/fit.js';
  import { layoutRings, radius, RING_CONFIGS, type RingConfigName } from '../engine/layout.js';
  import { levelOf, nodeLabel, nodeSub } from '../engine/levels.js';
  import type { GraphStore } from '../engine/model.js';
  import type { Zones } from '../engine/zones.js';
  import type { DrawEdge, DrawNode } from '../render/renderer.js';

  export type DrawModel = { nodes: DrawNode[]; edges: DrawEdge[]; positions: Map<string, { x: number; y: number }>; fit: FitItem[]; topPx: number; counts: Partial<Record<GraphGroup, number>> };

  export function buildDrawModel(store: GraphStore, z: Zones, o: { config: RingConfigName; centre: string; selected: string | null; selectedEdge: string | null; on: ReadonlySet<GraphGroup> }): DrawModel {
    const cfg = RING_CONFIGS[o.config], phone = o.config === 'phone';
    const res = z.walk;
    const ringOf = (id: string) => (z.fogSet.has(id) ? Math.max(res.dist.get(id) ?? 0, z.clearHop + 1) : res.dist.get(id) ?? 0);
    const positions = layoutRings(res, o.centre, cfg, ringOf);
    const shown = [...z.clear, ...z.fog];
    const shownSet = new Set(shown);
    const nodes: DrawNode[] = shown.map((ref) => {
      const it = store.items.get(ref)!;
      const fog = z.fogSet.has(ref), lv = levelOf(cfg, res.dist.get(ref) ?? 0, fog), center = ref === o.centre;
      return { ref, kind: it.kind, fog, lv, center, lbl: fog ? '' : nodeLabel(it, lv, phone), sub: fog ? null : nodeSub(it, lv, phone), icon: iconFor(it, lv, center), sug: it.suggested, cat: it.category };
    });
    const counts: Partial<Record<GraphGroup, number>> = {};
    const edges: DrawEdge[] = [];
    for (const e of store.edges.values()) {
      const grp = GROUP_OF_EDGE_KIND[e.kind];
      if (!shownSet.has(e.from) || !shownSet.has(e.to) || !o.on.has(grp)) continue;
      const fog = z.fogSet.has(e.from) || z.fogSet.has(e.to);
      if (!fog) counts[grp] = (counts[grp] ?? 0) + 1;
      edges.push({ id: e.id, from: e.from, to: e.to, grp, fog, sug: e.suggested, on: !fog && o.selectedEdge === null && (e.from === o.selected || e.to === o.selected) });
    }
    const fit = fitItemsFor(
      z.clear.map((ref) => { const n = nodes.find((d) => d.ref === ref)!, p = positions.get(ref)!; return { x: p.x, y: p.y, kind: n.kind, label: n.lbl, sub: n.sub, center: n.center }; }),
      { fogRadius: z.fog.length > 0 ? radius(cfg.R, z.clearHop + 1) : null, phone },
    );
    return { nodes, edges, positions, fit, topPx: phone ? TOP_PX.phone : TOP_PX.desktop, counts };
  }
  ```
  The `nodes.find` inside the `fit` map is O(n²) at 500 clear items. Build a `Map` from `nodes` first. The code above shows the shape.

  `src/react/tooltip.ts` ports `placeTip` (`:877`):
  ```ts
  /** The edge sentence follows the pointer and stays inside the canvas (Review Focus 4). */
  export function tooltipPosition(x: number, y: number, tip: { width: number; height: number }, canvasWidth: number): { left: number; top: number } {
    return { left: Math.max(8, Math.min(x + 14, canvasWidth - tip.width - 8)), top: Math.max(8, y - tip.height - 10) };
  }
  ```
  `src/react/semantic-pref.ts` (§6.4; the key follows `gn-theme` / `gn-style`, `apps/web/src/theme-toggle.tsx:57`):
  ```ts
  export const SEMANTIC_KEY = 'gn-kg-semantic';
  /** Default On. A blocked store (it THROWS in Safari with site data blocked) gives the default, and writes are best-effort (Review Focus 5). */
  export function readSemantic(): boolean {
    try {
      return window.localStorage.getItem(SEMANTIC_KEY) !== 'off';
    } catch {
      return true;
    }
  }
  export function writeSemantic(on: boolean): void {
    try {
      window.localStorage.setItem(SEMANTIC_KEY, on ? 'on' : 'off');
    } catch {
      // the session still remembers it in component state
    }
  }
  ```
  The tests:
  - **27.310** (`draw-model.test.ts`, node). The engine fixture (copy `test/engine/fixture.ts`'s helpers) gets a centre, 3 chips and 2 fog.
    - Fog nodes (exactly 2: assert the count before looping) have no label, no sub, no icon, and `lv: 'fog'`.
    - A note at hop 1 has a `note` icon.
    - The centre has no icon. A ticket NEVER has an icon (`iconFor`'s last line), so a ticket centre cannot show this: build a second model centred on a NOTE, whose `icon` is `null` there while the same note at hop 1 has `{ kind: 'note' }`.
    - An edge touching fog is `fog: true` and not counted: `counts` for its group equals the literal number of that group's CLEAR edges in the fixture (not "not more than").
    - The selected item's edges are `on: true`, and an edge that does NOT touch the selected item is `on: false`.
    - **Control:** with `selectedEdge` set, no edge is `on`.
    - Kills: (a) `on: !fog && o.selectedEdge === null && (…)` → `on: !fog && o.selectedEdge === null` (the not-touching leg) (b) `if (!fog) counts[grp] = …` → unconditional (c) `levelOf(cfg, res.dist.get(ref) ?? 0, fog)` → `levelOf(cfg, res.dist.get(ref) ?? 0, false)` (fog nodes get a ring level) (d) delete `|| (center && item.kind !== 'person')` from `iconFor` (the note-centre leg). (`lbl: fog ? '' : …` → `nodeLabel(…)` is EQUIVALENT: `nodeLabel` already answers `''` at `'fog'`, 27.227.)
  - **27.311** (`tooltip.test.ts`, node). At `x = canvasWidth - 20`, `left + tip.width ≤ canvasWidth - 8`. At `y = 5`, `top` is 8. A tip WIDER than the canvas still starts at `left` 8 (`tooltipPosition(5, 100, { width: 2000, height: 28 }, 300).left === 8`). **Control:** in mid-canvas, `{ left: x + 14, top: y - h - 10 }`.
    - Kills: (a) `canvasWidth - tip.width - 8` → `canvasWidth - 8` (b) drop the `Math.max(8, …)` on `top` (c) drop the `Math.max(8, …)` on `left` (the wide-tip leg).
  - **27.312** (`semantic-pref.test.ts`, jsdom). Unset → `true`; `'off'` → `false`; `writeSemantic(false)` then read → `false`. **Control:** a stubbed `localStorage` whose `getItem` and `setItem` THROW gives `true`, and `writeSemantic` does not throw. (This is the unit half of 27.324.)
    - Kills: (a) `!== 'off'` → `=== 'on'` (the unset leg) (b) `on ? 'on' : 'off'` → `String(on)` (the write-then-read leg) (c) `readSemantic` without its `try` (the control).

  Run, then commit.

- [ ] **Step 2: Ring loading with a per-centre cache and a race guard (27.313–27.319).**

  `src/react/use-graph-rings.ts`:
  ```ts
  import { useEffect, useRef, useState } from 'react';
  import { GRAPH_MAX_HOPS, type GraphGroup } from '@gisik-nokma/domain';
  import { emptyStore, mergeRing, type GraphStore } from '../engine/model.js';
  import type { GraphSource } from './types.js';

  type Entry = { store: GraphStore; loaded: number };
  export type RingState = { store: GraphStore; loading: boolean; failedHop: number | null; retry: () => void; key: string };
  // Task 8 adds `forget(edgeId: string): void` and `restore(edge: GraphEdgeView): void` (planner ruling 2026-10-04, Undo restores the edge).

  /**
   * Rings 1…`rings` for one (centre, scope, groups), fetched one at a time (§2.2) and cached for the session per that key
   * (§2.3), so Back is instant. Only the answer for the CURRENT key is ever shown: a late answer for an old centre lands in
   * the cache under its own key and is not drawn (Review Focus 2). "Everything" = `GRAPH_MAX_HOPS`, stopping at the first
   * empty ring. Only a ring's first page is fetched: 2,000 items is already past the 500 cap and the 2,000 fog budget.
   */
  export function useGraphRings(source: GraphSource, q: { centre: string; workspaceIds: readonly string[]; projectIds: readonly string[]; groups: readonly GraphGroup[]; rings: number }): RingState {
    const key = `${q.centre}|${[...q.workspaceIds].sort()}|${[...q.projectIds].sort()}|${[...q.groups].sort()}`;
    const cache = useRef(new Map<string, Entry>());
    const current = useRef(key);
    current.current = key;
    const [, bump] = useState(0);
    const [failed, setFailed] = useState<{ key: string; hop: number } | null>(null);
    const [attempt, setAttempt] = useState(0);
    const want = Math.min(q.rings, GRAPH_MAX_HOPS);

    useEffect(() => {
      let cancelled = false;
      void (async () => {
        let entry = cache.current.get(key) ?? { store: emptyStore(), loaded: 0 };
        cache.current.set(key, entry);
        while (!cancelled && entry.loaded < want && !entry.store.exhausted) {
          const hop = entry.loaded + 1;
          try {
            const ring = await source.ring({ center: q.centre, hops: hop, workspaceIds: q.workspaceIds, projectIds: q.projectIds, groups: q.groups });
            entry = { store: mergeRing(entry.store, ring), loaded: hop };
            cache.current.set(key, entry); // cached even if stale: a later visit reuses it
          } catch {
            if (current.current === key) setFailed({ key, hop });
            return;
          }
          if (current.current === key) bump((n) => n + 1);
        }
      })();
      return () => {
        cancelled = true;
      };
      // q.* are folded into `key`
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, want, attempt, source]);

    const entry = cache.current.get(key);
    const failedHop = failed !== null && failed.key === key ? failed.hop : null;
    return {
      key,
      store: entry?.store ?? emptyStore(),
      loading: failedHop === null && (entry === undefined || (entry.loaded < want && !entry.store.exhausted)),
      failedHop,
      retry: () => {
        setFailed(null);
        setAttempt((n) => n + 1);
      },
    };
  }
  ```
  `cancelled` stops the LOOP for an old key. An answer already in flight still resolves, is cached, and is not drawn, because `bump` is guarded by `current.current === key`. If the repo's eslint config has no `react-hooks` plugin, drop the disable comment. Grep `react-hooks/exhaustive-deps` in `packages/app-core/src` first.

  Mutation (Step 7): remove the `current.current === key` guard on `bump`. 27.318 goes RED.

  (Test-strength pass: that mutant is EQUIVALENT for `setGraph`. A stale `bump` only re-renders; the hook still returns `cache.current.get(key)` for the CURRENT key, so `rings.store`, the memoised `model` and the `setGraph` effect's deps are unchanged and nothing of t118 is drawn. What actually keeps a late answer off the canvas is that it is cached under ITS OWN key. 27.318's `Kills:` names mutants that break that: a key without `q.centre`, or `cache.current.set(current.current, entry)`.)

- [ ] **Step 3: The component.** `src/react/knowledge-graph.tsx`. It is the mockup's `makeGraph` view half (`:709-1080`): state, the bar, `render`'s chrome (`:950-965`), the trail (`:969-975`), `pick` (`:1036`), `centre` (`:1040`), `goTrail` (`:1041`), and the click and key handlers (`:1043-1080`). The inspector and the list come in Task 8; this task renders their two regions empty.
  ```tsx
  'use client';
  import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
  import { GRAPH_CHIP_ORDER, GRAPH_MAX_HOPS, GROUP_LABEL, inGraphScope, type GraphGroup } from '@gisik-nokma/domain';
  import { SkeletonRegion, Skeleton } from '@gisik-nokma/ui';
  import { edgeSentence } from '../engine/sentences.js';
  import { RING_CONFIGS } from '../engine/layout.js';
  import { CLEAR_CAP, zones as computeZones } from '../engine/zones.js';
  import type { GraphRenderer } from '../render/renderer.js';
  import { readThemePalette, watchTheme } from '../theme/read-palette.js';
  import { buildDrawModel } from './draw-model.js';
  import { GraphBar } from './graph-bar.js';
  import { readSemantic, writeSemantic } from './semantic-pref.js';
  import { tooltipPosition } from './tooltip.js';
  import type { HopChoice, KnowledgeGraphProps } from './types.js';
  import { useGraphRings } from './use-graph-rings.js';

  const DEFAULT_GROUPS = GRAPH_CHIP_ORDER.filter((g) => g !== 'projects');
  const reachOf = (h: HopChoice) => (h === 'all' ? Number.POSITIVE_INFINITY : h);
  const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const defaultCreate = () => import('../render/sigma/adapter.js').then((m) => m.createSigmaRenderer); // the ONE seam crossing (§4.1)

  export function KnowledgeGraph(props: KnowledgeGraphProps) {
    const phone = props.config === 'phone';
    const offered = props.groups ?? DEFAULT_GROUPS;
    const [centre, setCentre] = useState(props.centre);
    const [trail, setTrail] = useState<string[]>([]);
    const [selected, setSelected] = useState<string | null>(props.centre);
    const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
    const [status, setStatus] = useState('');
    const [on, setOn] = useState<Set<GraphGroup>>(() => new Set(offered));
    const [workspaceIds, setWorkspaceIds] = useState<string[]>([...props.defaultWorkspaceIds]);
    const [projectIds, setProjectIds] = useState<string[]>([]);
    const [ownHops, setOwnHops] = useState<HopChoice>(2);
    const [semantic, setSemanticState] = useState(true);
    const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
    const hops: HopChoice = phone ? 1 : props.hops ?? ownHops;
    const setHops = (h: HopChoice) => (props.onHopsChange ? props.onHopsChange(h) : setOwnHops(h));
    useEffect(() => setSemanticState(readSemantic()), []);
    useEffect(() => { setCentre(props.centre); setTrail([]); setSelected(props.centre); setSelectedEdge(null); }, [props.centre]); // a new surface centre resets the trail

    const fetchGroups = useMemo(() => (semantic ? offered : offered.filter((g) => g !== 'concepts')), [semantic, offered]);
    const reach = reachOf(hops);
    const rings = useGraphRings(props.source, { centre, workspaceIds, projectIds, groups: fetchGroups, rings: reach === Number.POSITIVE_INFINITY ? GRAPH_MAX_HOPS : reach + 1 });
    const scope = useMemo(() => ({ workspaceIds, projectIds }), [workspaceIds, projectIds]);
    const inScope = useCallback((ref: string) => { const it = rings.store.items.get(ref); return it === undefined || inGraphScope(it, scope); }, [rings.store, scope]);
    const z = useMemo(() => computeZones(rings.store, { center: centre, on, reach, inScope: (r) => r === centre || inScope(r), semantic }), [rings.store, centre, on, reach, inScope, semantic]);
    const model = useMemo(() => buildDrawModel(rings.store, z, { config: props.config, centre, selected, selectedEdge, on }), [rings.store, z, props.config, centre, selected, selectedEdge, on]);
    const label = (ref: string) => rings.store.items.get(ref)?.label ?? '';
    const centreItem = rings.store.items.get(centre);

    // the renderer: loaded once, mounted once, fed every model
    const mountRef = useRef<HTMLDivElement>(null);
    const renderer = useRef<GraphRenderer | null>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
      let dead = false, stopTheme = () => {};
      void (props.createRenderer ?? defaultCreate)().then((create) => {
        if (dead || mountRef.current === null) return;
        const r = create();
        r.mount(mountRef.current, readThemePalette(document.documentElement), { phone, config: RING_CONFIGS[props.config], reduceMotion });
        stopTheme = watchTheme(() => r.refreshTheme(readThemePalette(document.documentElement)));
        r.onPick((e) => {
          if (e.kind === 'stage') return;
          if (e.kind === 'edge') { setSelectedEdge(e.id); setStatus(''); return; }
          if (e.double) centreOn(e.ref); else pick(e.ref);
        });
        r.onHover((e) => {
          if (e.kind === 'edge') { const edge = rings.store.edges.get(e.id); if (edge) setTip({ text: edgeSentence(edge, labelRef.current), x: e.x, y: e.y }); }
          if (e.kind === 'edge-leave') setTip(null);
        });
        renderer.current = r;
        setReady(true);
      });
      return () => { dead = true; stopTheme(); renderer.current?.destroy(); renderer.current = null; };
      // mounted once per config; the model effect below feeds it
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.config]);
    const labelRef = useRef(label);
    labelRef.current = label;
    const keepView = useRef(false);
    useEffect(() => {
      if (!ready || renderer.current === null || rings.store.items.size === 0) return;
      renderer.current.setGraph(model.nodes, model.edges, model.positions, { selected, selectedEdge, highlight: props.highlight ?? null }, { fit: model.fit, topPx: model.topPx, clearHop: z.clearHop, keepView: keepView.current });
      keepView.current = false;
      props.onZones?.({ clear: z.clearSet, fog: z.fogSet, beyond: z.beyond, clearHop: z.clearHop, capped: z.capped });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, model, props.highlight]);

    // `pick` (`:1036`): a fogged item selects its clear neighbour and says why
    function pick(ref: string) {
      keepView.current = true; // selection keeps the zoom (§3.5)
      if (!z.clearSet.has(ref)) {
        const via = (rings.store.adj.get(ref) ?? []).map((x) => x.to).find((t) => z.clearSet.has(t));
        if (via !== undefined) { setSelected(via); setStatus(inScope(ref) ? `${label(ref)} is in the fog. Center on ${label(via)} to reach it.` : `${label(ref)} is outside the scope.`); }
        return;
      }
      setSelected(ref); setSelectedEdge(null); setStatus('');
    }
    // `centre` (`:1040`) and `goTrail` (`:1041`)
    function centreOn(ref: string) {
      setSelectedEdge(null);
      if (ref === centre) return;
      setTrail((t) => (t.length === 0 ? [centre, ref] : [...t, ref]));
      setCentre(ref); setSelected(ref); setStatus('');
    }
    function goTrail(i: number) {
      const to = trail[i]!;
      const next = trail.slice(0, i + 1);
      setTrail(next.length <= 1 ? [] : next);
      setCentre(to); setSelected(to); setStatus('');
    }
    function setSemantic(next: boolean) {
      setSemanticState(next); writeSemantic(next);
      if (!next && centre.startsWith('concept:')) { setCentre(props.centre); setTrail([]); setSelected(props.centre); } // §6.4
      else if (!next && selected?.startsWith('concept:')) setSelected(centre);
      keepView.current = true;
    }
    function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
      if ((e.target as HTMLElement).closest('input, [role="combobox"], [role="listbox"]')) return;
      if (e.key === 'Escape') {
        if (props.onEscape?.() === true) return;
        if (trail.length > 0) goTrail(trail.length - 2);
        return;
      }
      if (phone || props.showHops === false) return;
      if (/^[1-4]$/.test(e.key)) setHops(Number(e.key) as 1 | 2 | 3 | 4);
      else if ((e.key === 'c' || e.key === 'C') && selected !== null) centreOn(selected);
    }

    const n = Math.max(0, z.clear.length - 1), f = z.fog.length;
    const fogTxt = f > 0 ? `, ${f} more in the fog` : '', outTxt = z.outN > 0 ? ` (${z.outN} outside the scope)` : '';
    const count = z.capped ? `The ${CLEAR_CAP} nearest are clear${fogTxt}${outTxt}, ${z.beyond} further out`
      : phone ? `${n} linked${fogTxt}${outTxt}`
      : reach === Number.POSITIVE_INFINITY ? `${n} items, everything connected${fogTxt}${outTxt}`
      : `${n} items within ${reach} hop${reach > 1 ? 's' : ''}${fogTxt}${outTxt}`;
    const firstLoad = rings.loading && rings.store.items.size === 0;
    const empty = !rings.loading && rings.failedHop === null && centreItem !== undefined && z.clear.length === 1 && z.fog.length === 0;
    const tipPos = tip === null || mountRef.current === null ? null : tooltipPosition(tip.x, tip.y, { width: Math.min(320, tip.text.length * 7 + 20), height: 28 }, mountRef.current.clientWidth);

    return (
      <div className={`gn-kg${phone ? ' gn-kg--phone' : ''}`} onKeyDown={onKeyDown}>
        <GraphBar
          phone={phone} scope={props.scope} workspaceIds={workspaceIds} projectIds={projectIds}
          onWorkspaces={(ids) => { setWorkspaceIds(ids); setProjectIds((p) => p.filter((id) => props.scope.workspaces.some((w) => ids.includes(w.id) && w.projects.some((x) => x.id === id)))); }}
          onProjects={setProjectIds}
          hops={props.showHops === false || phone ? null : hops} onHops={setHops}
          semantic={semantic} onSemantic={setSemantic}
          groups={offered.filter((g) => semantic || g !== 'concepts')} on={on} counts={model.counts}
          onToggle={(g) => { keepView.current = true; setOn((s) => { const t = new Set(s); t.has(g) ? t.delete(g) : t.add(g); return t; }); }}
          count={count}
          scopeNote={centreItem !== undefined && !inGraphScope(centreItem, scope) ? `${label(centre)} is outside the projects you picked. It stays in the middle, and its links follow your scope.` : null}
        />
        <div className="gn-kg__canvas">
          <div ref={mountRef} className="gn-kg__mount" role="img" aria-label={`Knowledge Graph of items linked to ${label(centre)}`} data-kg-probe={props.createRenderer ? '' : undefined} />
          {firstLoad && (
            <SkeletonRegion label="Loading the Knowledge Graph" className="gn-kg__skeleton">
              <Skeleton shape="circle" width="6rem" height="6rem" />
            </SkeletonRegion>
          )}
          {empty && (
            <div className="gn-kg__empty">
              <p>{`Nothing is linked to ${label(centre)} yet.`}</p>
              {centreItem?.kind === 'ticket' && props.onAddLink && <button type="button" className="gn-button" onClick={() => props.onAddLink!(centreItem)}>Add link</button>}
            </div>
          )}
          {trail.length > 0 && (
            <div className="gn-kg__trail">
              <button type="button" className="gn-kg__back" aria-label={`Back to ${label(trail[trail.length - 2]!)}`} onClick={() => goTrail(trail.length - 2)}>‹ Back</button>
              {trail.map((ref, i) => (
                <button key={`${ref}-${i}`} type="button" aria-current={i === trail.length - 1} onClick={() => goTrail(i)}>{label(ref)}</button>
              ))}
            </div>
          )}
          {z.beyond > 0 && <button type="button" className="gn-kg__further" onClick={() => setStatus(`${z.beyond} items are further than the ${CLEAR_CAP} nearest. Turn off a link type, or Center closer to them.`)}>{`+${z.beyond} further out`}</button>}
          {rings.failedHop !== null && (
            <p className="gn-kg__error" role="alert">Couldn't load the next hop. <button type="button" onClick={rings.retry}>Retry</button></p>
          )}
          {tip !== null && tipPos !== null && <div className="gn-kg__tip" role="tooltip" style={{ transform: `translate(${tipPos.left}px, ${tipPos.top}px)` }}>{tip.text}</div>}
          <div className="gn-kg__zoom" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom in" onClick={() => renderer.current?.zoomBy(1.5)}>+</button>
            <button type="button" aria-label="Zoom out" onClick={() => renderer.current?.zoomBy(1 / 1.5)}>−</button>
            <button type="button" aria-label="Fit to view" onClick={() => renderer.current?.setCamera('fit')}>⤢</button>
          </div>
        </div>
        {!phone && props.showHops !== false && (
          <p className="gn-kg__keys">Keys: 1–4 hops, C center on the selected item, Esc back. Scroll or pinch to zoom, drag to pan, double-click an item to center on it.</p>
        )}
        <p className="gn-kg__status" aria-live="polite">{status}</p>
      </div>
    );
  }
  ```
  **`data-kg-probe`.** It is set only when a renderer is INJECTED (the harness and tests). Production never injects one, so the probe is off there.

  **The Fit button glyph.** Use the mockup's inline SVG (`:752`) with `stroke="currentColor"`, not `⤢`. It is copied verbatim; `currentColor` is not a literal colour.

  **The renderer callbacks.** Those registered in the mount effect close over the first render's state. Route `pick`, `centreOn` and the hover lookup through refs (`pickRef.current = pick` each render), the same pattern as `labelRef`. Without that, a double-click after a centre change acts on a stale `centre`. The probe case 27.323 catches it.

  `src/react/graph-bar.tsx` ports the mockup's bar (`:722-747`):
  - **Desktop:**
    - `Select multiple` "Workspaces": options from `scope.workspaces`, description `N projects`. At least one stays chosen: refuse the last removal by ignoring an `onChange` that empties it.
    - `Select multiple` "Projects": placeholder `All projects`; options are each chosen workspace's projects, with the workspace name as `description`.
    - `SegmentedControl` "Hops": `1` `2` `3` `4` `Everything`.
    - `SegmentedControl` "Semantic layer": `On` / `Off`.
    - `<p className="gn-kg__count" aria-live="polite">`.
    - `<div role="group" aria-label="Show links">`, with one `<button aria-pressed>` chip per group: a swatch (`<span className="gn-kg__swatch gn-kg__swatch--<group>">`), `GROUP_LABEL[g]`, and the count.
    - The scope note, when given.
  - **Phone (§5):** everything except the count sits inside `<details className="gn-kg__fold"><summary>Scope and links<span>{summary}</span></summary>…</details>`. The summary text is `${workspaces}, ${projects or 'all projects'}; ${on.size} of ${groups.length} link types` (`:956`).

  The swatch styles live in `ui.css`, as `stroke`/`background` from `var(--gn-edge-*)`. Dashes come from `border-top-style` (`dashed` / `dotted`) by group, as in the mockup's `.ed-*` rules: read `knowledge-graph-sigma.html`'s `<style>` block for them and port their geometry, never their colours.

- [ ] **Step 4: The CSS.** Write it in `/* KG: T7 view+bar */` in `packages/ui/src/ui.css`:
  - `.gn-kg__canvas`: `position: relative; height: clamp(26rem, 62vh, 46rem); touch-action: none; overscroll-behavior: contain;` (§5). The canvas keeps its height through loading (§6.1).
  - `.gn-kg__mount`, `.gn-kg__rings`, `.gn-kg__stage`: absolutely filling, with the rings under the stage.
  - `.gn-kg__ring`: `fill: none; stroke: var(--gn-border); stroke-dasharray: 2 6; opacity: .5`.
  - `.gn-kg__ring-label`: `fill: var(--gn-text-subtle); font: 600 .72rem/1 var(--gn-font)`.
  - `.gn-kg__fog-band`: `fill: color-mix(in srgb, var(--gn-fog-dot) 18%, transparent)`.
  - The overlays: `.gn-kg__trail` top-left, `.gn-kg__further` bottom-left, `.gn-kg__zoom` bottom-right (44 px buttons), and `.gn-kg__tip`, absolute at top-left 0 with `pointer-events: none`.
  - `.gn-kg--phone .gn-kg__canvas { height: 70vh }`.

  The button and layout rules follow the repo's styling memory (styling refresh 09-29: shared button classes, never bespoke). Read `ui.css`'s `.gn-button` family and use those classes on every button above. Grep for the existing font variable name (`--gn-font…`) before writing the rules; do not invent one.

  Before moving on: `grep -nE "#[0-9a-fA-F]{3,8}\b" <the new block>` prints nothing.

- [ ] **Step 5: jsdom tests with a fake renderer (27.313–27.324, 27.326).**

  `test/react/fake-renderer.ts` records every `setGraph`, and exposes `pick(e)` and `hover(e)` to fire the registered callbacks:
  ```ts
  import type { CreateRenderer, DrawEdge, DrawNode, GraphRenderer, HoverEvent, PickEvent } from '../../src/render/renderer.js';
  export function fakeRenderer() {
    const calls: { nodes: DrawNode[]; edges: DrawEdge[] }[] = [];
    let onPick: (e: PickEvent) => void = () => {}, onHover: (e: HoverEvent) => void = () => {};
    const zooms: number[] = [];
    const r: GraphRenderer = {
      mount() {}, setGraph(nodes, edges) { calls.push({ nodes: [...nodes], edges: [...edges] }); }, setStates() {},
      setCamera() {}, zoomBy(f) { zooms.push(f); }, onCamera: () => () => {}, onPick: (cb) => ((onPick = cb), () => {}), onHover: (cb) => ((onHover = cb), () => {}),
      refreshTheme() {}, destroy() {}, inspect: () => null,
    };
    const create: CreateRenderer = () => r;
    return { createRenderer: async () => create, calls, zooms, pick: (e: PickEvent) => onPick(e), hover: (e: HoverEvent) => onHover(e), last: () => calls[calls.length - 1]! };
  }
  ```
  The source is `fixtureRing` from the browser package's harness. Do NOT import across packages: copy `fixture.ts` + `fixture-source.ts` into `test/react/fixture/` as test-only copies, and add a header comment naming the original. A source that rejects, or delays per centre, is a ten-line wrapper in the test.

  The cases (React Testing Library, `userEvent`, `await screen.findBy…`):
  - **27.313** With hops 2 (desktop), the source receives hops 1, 2 and 3, in order, with `groups` = every chip but `projects`. **Control:** `hops={1}` receives 1 and 2 only.
    - Kills: (a) `rings: … reach + 1` → `reach` (no fog ring) (b) `DEFAULT_GROUPS` keeps `projects` (c) the loop's `hop = entry.loaded + 1` → `entry.loaded + 2`.
  - **27.314** Double-click a hop-1 item (`fake.pick({ kind: 'node', ref, double: true })`): rings for the new centre are fetched. Then Back: NO new request, and the last `setGraph`'s nodes equal the first centre's. **Control:** a third, new centre fetches.
    - Kills: (a) `let entry = cache.current.get(key) ?? …` → always a fresh `{ store: emptyStore(), loaded: 0 }` (Back refetches) (b) the key built without `q.centre` (the new centre is never fetched: the first leg).
  - **27.315** `hops="all"` fetches until a ring comes back empty. **Control:** the request count equals the fixture's depth + 1. "Never past 8" cannot fail on the fixture (it is shallower than 8), so it gets its own source: a ten-line wrapper whose every ring holds one NEW item never seen before (an endless chain) receives exactly 8 requests, the last with `hops: 8`.
    - Kills: (a) `!entry.store.exhausted` dropped from the loop (fetches past the empty ring) (b) `reach === Number.POSITIVE_INFINITY ? GRAPH_MAX_HOPS` → `? 100` with `Math.min(q.rings, GRAPH_MAX_HOPS)` → `q.rings` (the endless-chain leg).
  - **27.316** Toggling the Blocks chip makes no request. The `setGraph` BEFORE the toggle has at least one `blocks` edge (`blocks|ticket:t133|ticket:t142`); the next `setGraph` has none, and the chip's `aria-pressed` is `false`. **Control:** toggling it back restores the same edges, with no request.
    - Kills: (a) `buildDrawModel` ignores `o.on` (`|| !o.on.has(grp)` dropped) (b) `fetchGroups` follows `on` (the chip toggles refetch: the no-request leg) (c) `aria-pressed` bound to `true`.
  - **27.317** Choosing a project in "Projects" re-requests with `projectIds`. With the centre itself outside the chosen project, the scope note reads `GN-142 is outside the projects you picked. It stays in the middle, and its links follow your scope.` **Control:** clearing the projects removes the note.
    - Kills: (a) `useGraphRings(… projectIds …)` → `projectIds: []` (b) `scopeNote` condition `!inGraphScope(…)` → `inGraphScope(…)`.
  - **27.318** (Review Focus 2) The source delays answers for `ticket:t118` by 300 ms and answers `ticket:t133` at once. Centre t118, then centre t133 within 50 ms. Wait 600 ms.
    - The last `setGraph` holds t133's ring-1 items.
    - No `setGraph` AFTER the t133 one contains an item only t118's rings have. That set is computed from the two fixture walks and asserted NON-EMPTY first (an empty set makes the leg true of anything).
    - Then toggle the Blocks chip off and on (no request, 27.316) to force two more renders from the CURRENT cache: the last `setGraph` still holds t133's ring-1 items and none of the t118-only set. Without this leg a corrupted cache entry is never re-read, because the late answer itself never re-renders.
    - **Control:** with no delay, the t118 → t133 sequence draws t118's rings first.
    - Kills: (a) `const key` built without `q.centre` (t118 and t133 share an entry, and the late answer bumps it) (b) in the loop, `cache.current.set(current.current, entry)` instead of `key` (the late t118 ring overwrites t133's entry; the toggle leg reads it). Removing the `current.current === key` guard on `bump` is EQUIVALENT (Step 2's note).
  - **27.319** The source fails hop 2. Ring 1 stays drawn (the last `setGraph` has ring 1's items). `role="alert"` reads `Couldn't load the next hop. Retry`, and Retry re-requests hop 2. **Control:** after a successful retry, the alert is gone.
    - Kills: (a) the `catch` resets `cache.current.set(key, { store: emptyStore(), loaded: 0 })` (ring 1 vanishes) (b) `retry` without `setAttempt` (no new request).
  - **27.320** Before ring 1 answers, the skeleton region (`role="status"` or the label `Loading the Knowledge Graph`; read `SkeletonRegion` for which) is present, and `.gn-kg__canvas` is in the DOM. **Control:** after the answer, the skeleton is gone. (The browser half, no layout shift, is in Step 6.)
    - Kills: (a) `const firstLoad = rings.loading && rings.store.items.size === 0` → `false` (b) render `.gn-kg__canvas` only when `!firstLoad`.
  - **27.321** A centre with no links shows `Nothing is linked to GN-9 yet.` and an `Add link` button that calls `onAddLink` WITH the centre item (`expect.objectContaining({ ref: <that ticket's ref> })`). **Control:** a NOTE centre with no links shows the sentence and no button.
    - Kills: (a) `centreItem?.kind === 'ticket' &&` dropped (the control) (b) `onClick={() => props.onAddLink!(centreItem)}` → `props.onAddLink!(undefined!)`.
  - **27.322**
    - Pressing `3` on the view sets 3 hops (the source receives ring 4).
    - `c` with a selected hop-1 item centres it.
    - `Escape` calls `onEscape` first: returning `true` stops Back; returning `false` lets Back run. Both arms start with a non-empty trail (centre once first), or "stops Back" holds with no Back to stop.
    - Zoom in / Zoom out / Fit to view call `zoomBy(1.5)`, `zoomBy(1/1.5)` and `setCamera('fit')`.
    - The canvas has `role="img"` named `Knowledge Graph of items linked to GN-142`.
    - **Control:** pressing `3` while focus is in the Workspaces combobox changes nothing.
    - Kills: (a) `if (props.onEscape?.() === true) return;` → `props.onEscape?.();` (b) delete the `closest('input, [role="combobox"], …')` guard (the control) (c) `zoomBy(1 / 1.5)` → `zoomBy(1.5)` on Zoom out.
  - **27.323** The trail. Centre t142 → t133 → t131 shows `‹ Back`, then `GN-142`, `GN-133`, `GN-131`. Clicking `GN-142` goes back two steps and empties the trail. **Control:** a new `centre` PROP resets the trail.
    - Kills: (a) `goTrail`'s `next.length <= 1 ? [] : next` → `next` (b) the props effect without `setTrail([])` (the control) (c) the mount effect's `onPick` calls the FIRST render's `centreOn` (no `pickRef`): the third centre extends a stale trail.
  - **27.324** (Review Focus 5) `localStorage` stubbed to THROW on every access. The view mounts with Semantic layer `On` checked, switching to `Off` hides the Concepts chip, switching back shows it, and no error is thrown (spy on `console.error`: none). **Control:** with a working store, `Off` is written as `gn-kg-semantic` = `off`.
    - Kills: (a) `readSemantic` without its `try` (b) `writeSemantic` without its `try` (c) `setSemantic` skips `writeSemantic` (the control).
  - **27.326** The count line. Every N, M and K below is a LITERAL read off the fixture by hand (or off the mockup's own bar at the same settings), never computed with `zones`, which is the code under test:
    - hops 2 reads `N items within 2 hops, M more in the fog`;
    - with a project chosen, ` (K outside the scope)` is appended;
    - a capped world (`cap` lowered through the fixture's size: a 600-child star) reads `The 500 nearest are clear, …, N further out`, and shows `+N further out`;
    - `config="phone"` reads `N linked…`.
    - **Control:** hops 1 reads `1 hop`, singular.
    - Kills: (a) `hop${reach > 1 ? 's' : ''}` → `hops` (b) `n = Math.max(0, z.clear.length - 1)` → `z.clear.length` (the centre counted) (c) `outTxt` without its `z.outN > 0` test.

  Run: `pnpm --filter @gisik-nokma/knowledge-graph exec vitest run test/react --maxWorkers=2 > /tmp/kg-t7.log 2>&1; tail -30 /tmp/kg-t7.log`.

- [ ] **Step 6: Browser cases (27.320 browser half, 27.325, 27.327–27.329).**

  `harness/main.tsx` renders `<KnowledgeGraph centre="ticket:t142" config={new URLSearchParams(location.search).get('config') ?? 'desktop'} source={{ ring: fixtureRing }} …/>`.
  - It passes `createRenderer` (the Sigma adapter, so the probe is on), and `highlight` from `?hl=` (comma-separated refs).
  - It exposes `window.__kg = { probe }` once the renderer mounts. Read it through a `ref` callback on `.gn-kg__mount`: the adapter's `inspect()` is reachable through a module-level hook the harness passes in `createRenderer`.

  `tests/view.spec.ts`:
  - **27.320** (browser) The `.gn-kg__canvas` bounding box is the same before ring 1 resolves (the fixture is delayed 500 ms through `fixtureDelay`) and after `waitStill`: no layout shift (§6.1). The "before" box is read while the skeleton is still in the DOM (assert it), or both reads can land after the answer.
    - Kills: (a) render `.gn-kg__canvas` only when `!firstLoad` (b) drop `height: clamp(26rem, 62vh, 46rem)` from `.gn-kg__canvas` in the T7 CSS block.
  - **27.325** (`semtest.cjs`) Before the click, at least one `concept:` node and one `tag` edge are drawn (assert both counts > 0, or "gone" holds of nothing). Click `Off`.
    - Every `nodeDisplay` of a `concept:` ref is gone, and every `tag` edge is gone.
    - The Concepts chip is hidden.
    - `localStorage['gn-kg-semantic'] === 'off'`.
    - Reload: still Off.
    - Click `On`: the concepts are back.
    - **Control:** after `On`, `concept:c1` is drawn again.
    - Kills: (a) `fetchGroups` ignores `semantic` (`semantic ? offered : …` → `offered`) (b) `useEffect(() => setSemanticState(readSemantic()), [])` dropped (the reload leg) (c) `setSemanticState(next); writeSemantic(next);` without `writeSemantic` (the storage leg).
  - **27.327** (Home's highlight) `?hl=ticket:t142,ticket:t160`.
    - Those two have opacity 1, another item has 0.25, and an edge has 0.12.
    - Hover a third item: the highlight still wins (its non-neighbours stay at 0.25, not 0.32).
    - `onZones` was called with a `clear` set containing `ticket:t142`. The harness records it on `window.__kg.zones`.
    - **Control:** with no `hl`, the same hover gives 0.32.
    - Kills: (a) `highlight` after hover in `program.ts`'s opacity chain (Step 7's mutant) (b) `highlight: props.highlight ?? null` → `highlight: null` in the `setGraph` call (c) the `props.onZones?.(…)` call dropped (the `window.__kg.zones` leg).
  - **27.328** (§5, `kgtest.cjs`, "phone") Use `devices['Pixel 7']` and `?config=phone`.
    - `document.documentElement.scrollWidth <= innerWidth` (no horizontal scroll).
    - There is no Hops control.
    - `Scope and links` is a `<details>`.
    - The count reads `N linked`.
    - Every clear item is at hop ≤ 1.
    - The canvas computed style has `touch-action: none` and `overscroll-behavior: contain`.
    - A hop-1 item's label backdrop is ≥ 32 px tall. Measure: `alphaAt` scan across the label vertically.
    - "Every clear item is at hop ≤ 1" first asserts at least one clear hop-1 item, or it holds of an empty canvas.
    - **Control:** the desktop page shows the Hops control.
    - Kills: (a) remove `touch-action: none` (Step 7's mutant) (b) `const hops: HopChoice = phone ? 1 : …` → `props.hops ?? ownHops` (hop-2 items clear) (c) `hops={props.showHops === false || phone ? null : hops}` without `|| phone` (d) `backdropPadding`'s `a.lv === 'tap' ? 10` → `7` (26.5 px: the 32 px leg).
  - **27.329** (`kgtest.cjs`, "edge tooltip") Hover the midpoint of `blocks t133 → t142`.
    - `[role="tooltip"]` reads `GN-133 blocks GN-142`, and its box is inside the canvas box.
    - Then hover an edge within 30 px of the canvas's right edge (pan first): the tooltip's right edge is ≤ the canvas right − 8.
    - Leaving hides it.
    - **Control:** the tooltip moved with the pointer between two hover points on the same edge.
    - Kills: (a) `tooltipPosition(…, mountRef.current.clientWidth)` → `Number.POSITIVE_INFINITY` (no right clamp) (b) `if (e.kind === 'edge-leave') setTip(null);` deleted (the leaving leg) (c) `edgeSentence` reads the edge backwards (the text leg).

  Run the browser package. Expected: PASS, LOCAL.

- [ ] **Step 7: Mutations, catalogue, sweeps.**

  **Mutations:**
  - Drop the stale-key guard in `useGraphRings`. 27.318 goes RED. (Test-strength pass: EQUIVALENT, see Step 2's note. Run instead: build `key` without `q.centre`, and separately `cache.current.set(current.current, entry)`. 27.318 goes RED on each.)
  - Make `readSemantic` read without `try`. 27.324 goes RED.
  - Fetch `reach` rings instead of `reach + 1`. 27.313 goes RED (no fog ring).
  - Put `highlight` after hover in `program.ts`'s opacity chain. 27.327 goes RED.
  - Remove `touch-action: none`. 27.328 goes RED.

  **Catalogue:** under `<!-- KG-C T7 -->`, ✅ 27.310–27.329.

  **Features:**
  - A ✅ bullet (user-observable): "Knowledge Graph view: rings by hop, fog, scope pickers, link filters, hops, trail, keys, semantic-layer switch, phone bar (`packages/knowledge-graph/src/react/knowledge-graph.tsx`)".
  - Edit the ⚙️ bullet so it does not duplicate that.

  **Sweeps:**
  - Build, then the `knowledge-graph` suite (whole);
  - the browser package (whole);
  - `ui#test` (the colour scan and the new CSS block);
  - `check:citations`.

  **Prose to sweep:**
  - `Features.md:3767` — the KG-C ⚙️ bullet; T7's ✅ bullet must not repeat it (the Features step says so).
  - `packages/knowledge-graph/src/render/palette.ts:3-4` — "the reader is `cssVariableName(role)` (Task 7)": the reader is Task 5's `readThemePalette`, and Task 5's sweep rewords it. If that sweep was skipped, this task does it: T7 writes no palette reader.
  - Nothing else on the ref names `KnowledgeGraph`, `useGraphRings`, `gn-kg-semantic` or `tooltipPosition` (searched: `git grep` for each on the ref).

  Push, then DONE, with `NEEDS: browser`.

---

### Task 8: The inspector, the edge inspector with provenance and Remove link, and the accessible list (cases 27.330–27.339)

**Depends on:** Task 7. Invoke `frontend-design`.

**Files:**
- Create:
  - `packages/knowledge-graph/src/react/inspector.tsx`
  - `packages/knowledge-graph/src/react/edge-inspector.tsx`
  - `packages/knowledge-graph/src/react/graph-list.tsx`
  - `packages/knowledge-graph/src/react/glyph.tsx`
  - `packages/knowledge-graph/src/react/inspect-model.ts`
  - `packages/knowledge-graph/test/react/{inspect-model,inspector}.test.ts(x)`
  - `packages/knowledge-graph-browser/tests/inspector.spec.ts`
- Modify:
  - `react/knowledge-graph.tsx` (render the three in their regions; pass `onAddScope`)
  - `packages/ui/src/ui.css` (`/* KG: T8 inspector+list */`)
  - the catalogue (`<!-- KG-C T8 -->`) and the Features bullet

**Interfaces:**
- **Consumes:** the engine sentences (`relation`, `edgeSentence`, `howText`, `provenanceLine`); `Walk`/`Zones` (Task 2); `KnowledgeGraphProps.onOpen` / `onRemoveLink` / `canRemoveLink` (Task 7).
- **Produces:**
  - `inspect-model.ts` (pure):
    - `pathTo(walk, ref): { from: string; to: string; edge: GraphEdgeView }[]`;
    - `directLinks(store, ref, on, inScope): { edge; to }[]`, in ring order;
    - `linkedFrom(store, ref, inScope)`;
    - `outsideScope(store, ref, on, inScope, scope)`;
    - `fogNext(store, ref, on, clearSet, inScope)`;
    - `kindWord(item)`, `openLabel(item)`.
  - `Glyph({ item })`: the mockup's `glyph` (`:579-584`) as React SVG, with classes only.
  - Neither the item inspector nor the list adds any new event: the "Remove link" path submits spec A's existing `ticket.link_removed` through the host callback.

  **Census check.** Grep `packages/domain/src` for the event registry (`ENTITY_KINDS` and the payload map). This task adds no entry, so no vocabulary census changes. State that in DONE (Global Constraints).

- [ ] **Step 1: The inspect model, test first (27.330, 27.331).** It ports the computations inside `renderInsp` (`knowledge-graph-sigma.html:998-1027`) and `outsideOf` (`:977-982`).
  ```ts
  // src/react/inspect-model.ts
  import { GROUP_OF_EDGE_KIND, GROUP_RANK, compareRingEntries, type GraphEdgeView, type GraphGroup, type GraphItemView } from '@gisik-nokma/domain';
  import type { GraphStore } from '../engine/model.js';
  import type { Walk } from '../engine/walk.js';

  /** "How it connects to <centre>" (`:1018-1020`): parent links from the item back to the centre. */
  export function pathTo(w: Walk, ref: string): { from: string; to: string; edge: GraphEdgeView }[] {
    const steps: { from: string; to: string; edge: GraphEdgeView }[] = [];
    let cur = ref;
    while (w.dist.get(cur) !== 0) {
      const p = w.parent.get(cur);
      if (p === undefined) return [];
      steps.unshift({ from: p.from, to: cur, edge: p.edge });
      cur = p.from;
    }
    return steps;
  }

  /** "Direct links" (`:1023-1026`): in-scope neighbours in enabled groups, in the spec's ring order. */
  export function directLinks(store: GraphStore, ref: string, on: ReadonlySet<GraphGroup>, inScope: (r: string) => boolean): { edge: GraphEdgeView; to: string }[] {
    return (store.adj.get(ref) ?? [])
      .filter((x) => on.has(GROUP_OF_EDGE_KIND[x.edge.kind]) && inScope(x.to) && store.items.has(x.to))
      .map((x) => ({ ...x, ref: x.to, rank: GROUP_RANK[GROUP_OF_EDGE_KIND[x.edge.kind]] }))
      .sort(compareRingEntries)
      .map(({ edge, to }) => ({ edge, to }));
  }

  /** "Linked from" (`:1021-1022`): references INTO the item, with their snippets. */
  export function linkedFrom(store: GraphStore, ref: string, inScope: (r: string) => boolean): GraphEdgeView[] {
    return [...store.edges.values()].filter((e) => e.kind === 'ref' && e.to === ref && inScope(e.from) && e.snippet !== null);
  }

  /** `outsideOf` (`:977-982`): links that lead outside the scope, grouped by what to add (a workspace, or a project). */
  export function outsideScope(store: GraphStore, ref: string, on: ReadonlySet<GraphGroup>, inScope: (r: string) => boolean, chosenWorkspaces: readonly string[]): { key: { workspaceId: string } | { projectId: string; workspaceId: string }; refs: string[] }[] {
    const groups = new Map<string, { key: { workspaceId: string } | { projectId: string; workspaceId: string }; refs: string[] }>();
    for (const x of store.adj.get(ref) ?? []) {
      const it = store.items.get(x.to);
      if (it === undefined || !on.has(GROUP_OF_EDGE_KIND[x.edge.kind]) || inScope(x.to) || it.workspaceId === null) continue;
      const key = !chosenWorkspaces.includes(it.workspaceId) ? { workspaceId: it.workspaceId } : { projectId: it.projectId ?? '', workspaceId: it.workspaceId };
      const k = JSON.stringify(key);
      groups.set(k, { key, refs: [...(groups.get(k)?.refs ?? []), x.to] });
    }
    return [...groups.values()];
  }

  /** "Center brings N items out of the fog" (`:1012`). */
  export function fogNext(store: GraphStore, ref: string, on: ReadonlySet<GraphGroup>, clearSet: ReadonlySet<string>, inScope: (r: string) => boolean): number {
    return (store.adj.get(ref) ?? []).filter((x) => on.has(GROUP_OF_EDGE_KIND[x.edge.kind]) && !clearSet.has(x.to) && inScope(x.to)).length;
  }

  /** `kindWord` (`:564`) and the Open button's words (`:1011`). */
  export const kindWord = (it: GraphItemView) => (it.kind === 'ticket' ? it.label : ({ note: 'Note', person: 'Person', concept: 'Concept', workspace: 'Workspace', project: 'Project' } as const)[it.kind]);
  export const openLabel = (it: GraphItemView) => ({ ticket: 'Open ticket', note: 'Open note', project: 'Open board', workspace: 'Open workspace', person: 'Show their work', concept: 'Open concept' } as const)[it.kind];
  ```
  The tests (node; engine fixture):
  - **27.330** With the centre `ticket:t118`, `pathTo` for `ticket:t151` (hop 2) returns two steps. Rendered with `relation`, they read `GN-118 has subtask GN-142`, then `GN-142 has subtask GN-151`. The centre's own path is `[]`. **Control:** an item with no parent (not walked) returns `[]`.
    - Kills: (a) `steps.unshift(…)` → `steps.push(…)` (the order leg) (b) `while (w.dist.get(cur) !== 0)` → `while ((w.dist.get(cur) ?? 0) > 1)` (one step, not two). `if (p === undefined) return [];` → `break;` is EQUIVALENT on a consistent walk (an unwalked item has no steps either way), so the control guards existing behaviour.
  - **27.331** (literals from the mockup's `E`, `knowledge-graph-sigma.html:527-545`; `on` = `{ blocks, relates, dup, structure }` unless named)
    - `directLinks(store, 'ticket:t142', on, all)` maps to EXACTLY `['ticket:t133', 'ticket:t160', 'ticket:t139', 'ticket:t151', 'ticket:t149', 'ticket:t118']`. That is NOT `store.adj`'s order (`t118` comes first there), so the sort is observable. "Typed link before structure" alone holds of many wrong orders.
    - `linkedFrom(store, 'note:n1', all)`: the test first adds to its store a `ref` edge `note:n4 → note:n1` with `snippet: null` and a `mention` edge `note:n2 → note:n1` with a snippet. The result is EXACTLY the `t125 → n1` and `n7 → n1` edges (the fixture alone has no edge for `snippet !== null` or `kind === 'ref'` to drop).
    - `outsideScope`, concrete:
      - centre `ticket:t142`, scope = workspace gn + project Mobile web, `chosenWorkspaces` = [gn]: EXACTLY one group, `{ projectId: <Workflows>, workspaceId: <gn> }` with `['ticket:t133']` (people and the concept are in scope by `inGraphScope`);
      - centre `ticket:s15`, scope = workspace gn only, `chosenWorkspaces` = [gn]: EXACTLY `{ workspaceId: <st> }` with `['ticket:s12']`, and no group for `person:pT` (`workspaceId` null).
    - `fogNext(store, 'ticket:t133', DEFAULT_GROUPS, clear, all)`, where `clear` = t142 plus its eleven hop-1 neighbours, is `2` (`t131`, `person:pB`; `t142` is clear). With `people` off it is `1`.
    - **Control:** turning off the item's only group empties `directLinks` and `fogNext`.
    - Kills: (a) `.sort(compareRingEntries)` deleted (the exact-order leg; Step 5's sort-by-label mutant too) (b) `e.snippet !== null` dropped (c) `e.kind === 'ref'` dropped (d) `outsideScope`'s ternary inverted (`!chosenWorkspaces.includes` → `chosenWorkspaces.includes`) (e) `it.workspaceId === null` skip dropped (pT's group appears) (f) `!clearSet.has(x.to)` dropped from `fogNext` (3, not 2) (g) `on.has(…)` dropped from `fogNext` (the people-off leg).

- [ ] **Step 2: The three components.**

  `react/glyph.tsx`:
  ```tsx
  import type { GraphItemView } from '@gisik-nokma/domain';
  /** The list's and inspector's glyphs, the same set as the canvas icons (§3.4); `knowledge-graph-sigma.html:579-584`. Colours come from classes. */
  export function Glyph({ item }: { item: GraphItemView }) {
    if (item.kind === 'ticket') return <span className={`gn-kg-glyph gn-kg-glyph--dot gn-kg-glyph--${item.category ?? 'open'}`} aria-hidden="true" />;
    if (item.kind === 'note') return <svg className="gn-kg-glyph" width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path className="gn-kg-glyph__doc" d="M1 1h6.5L11 4.5V13H1z" /></svg>;
    if (item.kind === 'workspace' || item.kind === 'project') return <svg className="gn-kg-glyph" width="14" height="12" viewBox="0 0 14 12" aria-hidden="true"><path className="gn-kg-glyph__doc" d="M1 2.2A1.2 1.2 0 0 1 2.2 1H5l1.2 1.4h5.6A1.2 1.2 0 0 1 13 3.6v6.2A1.2 1.2 0 0 1 11.8 11H2.2A1.2 1.2 0 0 1 1 9.8Z" /></svg>;
    if (item.kind === 'concept') return <svg className="gn-kg-glyph" width="16" height="12" viewBox="0 0 16 12" aria-hidden="true"><rect className="gn-kg-glyph__concept" x="1" y="1" width="14" height="10" rx="5" /></svg>;
    return <svg className="gn-kg-glyph" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle className="gn-kg-glyph__person" cx="7" cy="7" r="6" /></svg>;
  }
  ```

  **`react/inspector.tsx`** (the item half of `renderInsp`, `:998-1027`). Props: `{ item, centre, store, walk, zones, on, inScope, scopeNames, phone, onCenter, onOpen, onPick, onAddScope, status }`. It renders, in order:
  1. `<div className="gn-kg-insp__head"><Glyph/>{kindWord}</div>`, then `<h3>` with the ticket's title (else its label).
  2. Meta pills: the project's name (`scopeNames.project(id)`) and, for a ticket, a category pill. Read `packages/app-core` for the existing category words; grep `categoryLabel` or `stateCategory` labels. Never invent new words.
  3. Actions:
     - `Center on {truncate(label, 16)}`, unless the item is the centre;
     - `openLabel(item)`, calling `onOpen(item)`, shown only when `canOpen?.(item) !== false`.
  4. The fog hint: `Center brings N item(s) out of the fog.`
  5. The `aria-live` status.
  6. The out-of-scope block: `N link(s) lead(s) outside the scope, so they stay in the fog.`, with one `Add <name> (n)` button per group, calling `onAddScope(key)`.
  7. `How it connects to <centre>`: an `<ol>` of `<b>from</b> relation <b>to</b>`.
  8. Then, desktop only (`:1021`, "if(phone) return"):
     - **`Linked from`** with a count badge. Each snippet is a `<blockquote>` with `In <source long label>`, and the `[[…]]` span is turned into `<mark>`. That is a React split on the regex `/\[\[(.+?)\]\]/`, never `innerHTML`.
     - **`Direct links`** with a count badge: the first 7 rows (glyph via swatch, relation, long label), each a button calling `onPick`. A fogged row carries `data-fog`. Then `N more on the graph`.

  **`react/edge-inspector.tsx`** (`edgeInsp`, `:984-997`). Props: `{ edge, store, onPick, onCenter, onRemoveLink?, canRemoveLink?, status, setStatus }`. It renders:
  1. The swatch + `GROUP_LABEL[group]`, plus `Suggested` when `edge.suggested`.
  2. `<h3>{edgeSentence}</h3>`.
  3. A `From` / `To` list of buttons (`onPick`).
  4. For `ref` and `mention`: the snippet blockquote.
  5. `<p className="gn-kg-insp__prov">{provenanceLine(edge)} {howText(edge)}</p>`.
  6. Actions:
     - `Center on {truncate(label(from), 14)}`;
     - for `blocks` / `relates` / `duplicates` with `onRemoveLink` and `canRemoveLink?.(edge) !== false`: `Remove link`. On click it awaits `onRemoveLink(edge)`. Success sets the status to `Link removed.` and shows an `Undo` button that awaits `undo()` and then sets `Link restored.`. A thrown error sets the status to the error's message (the server's refusal text, A §2.3: "refused by <rule>: <reason>").

  The ring cache holds the REMOVED edge until a refetch. So after success, the view drops the edge from its CURRENT store copy: `useGraphRings` gains a `forget(edgeId)` that removes it from the cached entry and bumps. A test covers it (27.335).

  **Undo restores the edge (planner ruling 2026-10-04).** Nothing refetches a fully loaded entry, so Undo must put the edge back itself, through the SAME door the edge first came in by: `mergeRing`. `RingState` gains `forget` and `restore`, and the view wraps `onRemoveLink` once:
  ```ts
  // use-graph-rings.ts, added to the returned RingState
  forget: (edgeId: string) => {
    const e = cache.current.get(key);
    const gone = e?.store.edges.get(edgeId);
    if (e === undefined || gone === undefined) return;
    const edges = new Map(e.store.edges); edges.delete(edgeId);
    const adj = new Map([...e.store.adj].map(([k, v]) => [k, v.filter((x) => x.edge.id !== edgeId)]));
    cache.current.set(key, { ...e, store: { ...e.store, edges, adj } });
    bump((n) => n + 1);
  },
  restore: (edge: GraphEdgeView) => {
    const e = cache.current.get(key);
    if (e === undefined) return;
    // the add's own door; `exhausted` is kept, because an items-less ring would otherwise read as "the walk ended"
    const merged = mergeRing(e.store, { hop: e.store.rings, items: [], edges: [edge], frontier: [], truncated: false, cursor: null });
    cache.current.set(key, { ...e, store: { ...merged, exhausted: e.store.exhausted } });
    bump((n) => n + 1);
  },

  // knowledge-graph.tsx: what the edge inspector receives as `onRemoveLink`
  const removeLink = props.onRemoveLink === undefined ? undefined : async (edge: GraphEdgeView) => {
    const done = await props.onRemoveLink!(edge);
    rings.forget(edge.id);
    return { undo: async () => { await done.undo(); rings.restore(edge); } };
  };
  ```
  `forget` and `restore` are keyed by the CURRENT `key`; an Undo after the centre changed restores into the current entry only if that entry still holds both ends (`mergeRing` adds the edge, and `buildDrawModel` skips an edge whose ends are not shown).

  **`react/graph-list.tsx`** (`renderList`, `:1029-1035`):
  - `<section aria-labelledby>` headed `Linked to {label(centre)}` with a count badge.
  - A `<ul>` of rows, one per clear item except the centre, in ring order. Each row is a button: `<Glyph/>`, the long label (ticket: key + title), and `{relation(parentEdge, item)} {label(parent)}`. Selected rows carry `aria-current`, and a click calls `onPick`.
  - Then the fog lines: `N more are one step further, in the fog. Select an item and press Center to bring its links in.` and `N are outside the scope. Change it under Scope and links.` (singular forms as in the mockup).
  - This is the keyboard and screen-reader path (§3.5): every row is reachable by Tab.

  **`knowledge-graph.tsx` layout.** Desktop renders `.gn-kg__body` = canvas | `<aside className="gn-kg-insp" aria-label="Inspector">`, with the list under both. Phone renders the inspector as `.gn-kg-insp--card`, a bottom card UNDER the canvas, never overlaying it, so the canvas keeps its size. The list comes last.

  **CSS** goes in `/* KG: T8 inspector+list */`: the inspector column (`min-width: 18rem`), the card on phone, pills, the snippet `mark` (`background: color-mix(in srgb, var(--gn-edge-reference) 18%, transparent)`), the swatch line styles per group, the glyph fills (`.gn-kg-glyph--open { background: var(--gn-category-open) }`, …), and the list rows (44 px minimum height). Shared button classes only.

- [ ] **Step 3: jsdom cases (27.332–27.336).**
  - **27.332** Select `ticket:t133` (`fake.pick`).
    - The inspector heading is its title.
    - `Center on GN-133` and `Open ticket` are present.
    - Clicking `Open ticket` calls `onOpen` with the item.
    - `How it connects to GN-142` lists `GN-133 blocks GN-142`.
    - **Control:** selecting the centre shows no `Center on` button and no path.
    - Kills: (a) the "unless the item is the centre" condition on `Center on` dropped (the control) (b) `onOpen(item)` → `onOpen(centreItem)` (assert the argument's `ref` is `ticket:t133`) (c) the path `<ol>` built from `pathTo(walk, centre)`.
  - **27.333** Select `note:n1` (desktop). `Linked from` shows the snippet from `n7` with `Phone pass rulings` inside a `<mark>`, and no raw `[[`. **Control:** `config="phone"` shows neither `Linked from` nor `Direct links`.
    - Kills: (a) the snippet rendered as plain text (no `<mark>`, raw `[[` present) (b) the `if (phone) return` arm dropped (the control) (c) Step 5's `dangerouslySetInnerHTML` mutant (the `img` leg).
  - **27.334** `fake.pick({ kind: 'edge', id: 'relates|ticket:t142|ticket:t160' })`.
    - The heading reads `GN-142 relates to GN-160`.
    - The provenance reads `Added by Ama Rangsa on 2 Oct 2026, via Claude. A typed link.`
    - `From` / `To` buttons select their ends.
    - **Control:** the `parent` edge `t118 → t142` has no `Added by` and reads `Set from the subtask's Parent field.`
    - Kills: (a) `From` / `To` buttons wired to the same end (assert `From` selects `ticket:t142` and `To` selects `ticket:t160`, not just "their ends") (b) `{provenanceLine(edge)} {howText(edge)}` without `howText` (c) the heading built with `relation` reversed.
  - **27.335** Remove link. With `onRemoveLink` resolving `{ undo }`:
    - first, the last `setGraph` HAS `relates|ticket:t142|ticket:t160` (or "no such edge" holds of a canvas that never drew it);
    - clicking `Remove link` calls it with the edge;
    - the status reads `Link removed.`;
    - the next `setGraph` has no such edge;
    - `Undo` calls `undo`, and the status reads `Link restored.`.
    - (Planner ruling 2026-10-04.) The edge is ABSENT from the `setGraph` after the remove and PRESENT again in the `setGraph` after Undo, with the source's request count unchanged across the Undo (the restore is local, through `mergeRing`, not a refetch). Then switch hops 2 → 3: ring 4 IS requested (the restore did not mark the entry exhausted). The fixture is deep enough for that leg to mean something: ring 3 is not empty (`n3 → n5`, then `n5 → n6` at ring 4, `knowledge-graph-sigma.html:537-538`).

    With `onRemoveLink` rejecting `new Error('refused by may-edit: …')`, the status shows that text and the edge stays. **Control:** a `parent` edge has no `Remove link`.
    - Kills: (a) `forget` dropped after a removal (Step 5's mutant) (b) the `catch` sets a fixed `Couldn't remove the link.` instead of the error's message (c) the kind filter `blocks` / `relates` / `duplicates` dropped (the control) (d) `undo()` not awaited before `Link restored.` (assert `undo` was called BEFORE the status changed, with a deferred `undo`) (e) Undo that skips the restore: `undo: async () => { await done.undo(); }` (the edge stays absent; planner ruling 2026-10-04) (f) `restore` keeps `mergeRing`'s own `exhausted` (drop `exhausted: e.store.exhausted`): no ring-4 request.
  - **27.336** The list. Mounted with `hops={1}` so every count is a hand-checked LITERAL from the mockup's `E` (default groups, workspace gn), never computed with `zones`:
    - Its heading is `Linked to GN-142` with a badge of `11` (t118, t151, t149, t133, t160, t139, n1, n2, pT, pA, c1), and 11 rows.
    - Tabbing reaches every row.
    - Pressing Enter on a row selects it (`aria-current="true"`), and the row selected before loses it.
    - The fog line reads `10 more are one step further, in the fog. …` (t120, t125, t131, pB, n4, c2, n3, n7, pR, t157), and the scope line `2 are outside the scope. …` (s15 through pT, s12 through pA). If the mockup's own list at `?hops=1` disagrees, the mockup wins and the numbers here are corrected.
    - **Control:** with hops 4 and no fog, there is no fog line.
    - Kills: (a) the badge counts the centre (12) (b) the rows include the centre (c) the fog line counts out-of-scope fog items too (12) (d) `aria-current` set on click only, not Enter.

- [ ] **Step 4: Browser cases (27.337, 27.338).** In `tests/inspector.spec.ts`:
  - **27.337** (`kgtest.cjs` / `sigtest.cjs`, "eclick") Click the midpoint of `blocks t133 → t142` on the canvas. The inspector reads `Added by Bolsrang Momin`. **Control:** clicking a fog dot leaves the inspector heading unchanged.
    - Kills: (a) `if (e.kind === 'edge') { setSelectedEdge(e.id); … }` deleted from `onPick` (b) the edge inspector rendered without `provenanceLine` (c) `selectedEdge` not passed to the region (the item inspector stays).
  - **27.338** (`kgtest.cjs`, "double-click centres") Double-click `ticket:t133` on the canvas. The trail shows `‹ Back`, and the inspector heading is GN-133's title. Press `Escape`: the centre is back to GN-142. **Control:** a single click does not change the centre.
    - Kills: (a) `if (e.double) centreOn(e.ref); else pick(e.ref);` → `pick(e.ref)` always (b) the inspector reads `props.centre`, not the state `centre` (heading stays GN-142's).

  27.339 stays unallocated (no line).

- [ ] **Step 5: Mutations, catalogue, sweeps.**

  **Mutations:**
  - Render the snippet with `dangerouslySetInnerHTML` replacing `[[x]]` with `<mark>`. Add a snippet `<img src=x onerror=alert(1)>[[A]]` to the fixture: 27.333's escaping assertion (no `img` element in the DOM) goes RED. Keep that assertion permanently in 27.333.
  - Drop `forget` after a removal. 27.335 goes RED.
  - Undo without `rings.restore(edge)`. 27.335 goes RED (planner ruling 2026-10-04).
  - Sort `directLinks` by label. 27.331 goes RED.

  **Catalogue:** ✅ 27.330–27.338, one id line each.

  **Features:** a ✅ bullet for "Knowledge Graph inspector (items and links, provenance, Remove link with Undo) and the accessible list".

  **Sweeps:**
  - The package (whole), the browser package (whole), and `ui#test`.
  - Confirm no event or census changed: `git diff --stat origin/release/knowledge-graph -- packages/domain/src` shows nothing from this task.
  - `check:citations`.

  **Prose to sweep:**
  - `Features.md:3767` — the KG-C ⚙️ bullet; the new ✅ bullet must not repeat it.
  - None found beyond it (searched on the ref: `git grep -n` for `inspect-model`, `graph-list`, `edge-inspector`, `Linked from`, `Remove link`, `Direct links`; the hits are spec B's note panel, `Features.md:3760`, `docs/runbook.md:51`, and the editor's link popover, `LinkEditorPopover.tsx:307`, none of them about this view).

  Push, then DONE.

---

### Task 9: Wiring: the gateway, the ticket sheet's fourth tab, the note's Knowledge Graph panel, the manual, the Features close (cases 27.340–27.349)

**Depends on:** Tasks 6 and 8 (the route and the finished view). Spec A's UI task supplies the ticket sheet's Links section that "Add link" opens. If it is not merged, `onAddLink` is omitted, and 27.346 says so. Invoke `frontend-design`.

**Files:**
- Create:
  - `packages/app-core/src/online/graph.ts`
  - `packages/app-core/test/online/graph.test.ts`
  - `apps/web/src/knowledge-graph/graph-panel.tsx`
  - `apps/web/src/knowledge-graph/use-graph-scope.ts`
  - `apps/web/src/knowledge-graph/ticket-graph-tab.tsx`
  - `apps/web/test/knowledge-graph/{graph-panel,ticket-graph-tab,note-graph}.test.tsx`
- Modify:
  - `packages/app-core/src/online/index.ts` (beside `:44`)
  - `packages/app-core/src/views/ticket-sheet.tsx`: the prop near `editorSlot` (`:214`); the tab state (`:732`); the `SegmentedControl` (`:3756-3760`); a branch before the attachments branch (`:4538`)
  - `packages/app-core/test/views/ticket-sheet.test.tsx`: amend 16.81 (`:2895-2924`)
  - `apps/web/src/providers.tsx`: `AppServices` (`:73-89`) and `constructed` (`:120`, members at `:180`)
  - every test that builds an `AppServices` literal: `grep -rln "notificationPreferences:" apps/web/test`
  - the three `<TicketSheet>` hosts: `apps/web/app/w/[workspaceId]/my-work/page.tsx:396`, `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3710`, `apps/web/src/notes/note-document.tsx:866`
  - `apps/web/src/notes/note-byline.tsx` (`:87`, `:137`, `:147`) and `apps/web/src/notes/note-document.tsx` (`:602`, `:734`, `:831`)
  - `apps/web/package.json`: add `"@gisik-nokma/knowledge-graph": "workspace:*"`
  - `docs/manual.md`
  - `packages/ui/src/ui.css` (`/* KG: T9 tab+panel */`)
  - `test-cases/16-*.md` (16.81's prose; find the file with `grep -ln "16.81" test-cases/`)
  - the catalogue (`<!-- KG-C T9 -->`) and Features §24 (the close)

**Interfaces:**
- **Consumes:**
  - `KnowledgeGraph`, `KnowledgeGraphProps`, `GraphSource`, `kgNodeId` (Tasks 2 and 7);
  - `HttpClient.get` (`packages/app-core/src/online/http.ts:4`);
  - `makeSubmittedFactory` (as at `apps/web/src/backlog-rank-controls.tsx:135`);
  - `getMyWorkspaces()` (`packages/app-core/src/data-source.ts:247`), whose `WorkspaceRef.projects` is at `view-types.ts:220`;
  - `useIsPhone` (`apps/web/src/use-is-phone.ts:30`).
- **Produces:**
  - `createHttpGraphGateway(http): GraphGateway`, with `type GraphGateway = GraphSource` (a `ring(q)` method);
  - `AppServices.graph`;
  - `TicketSheetProps.knowledgeGraphSlot?: KnowledgeGraphSlotComponent`, with `type KnowledgeGraphSlotComponent = (props: { workspaceId: string; ticketId: string; onOpenTicket?: (id: string) => void; onShowLinks: () => void }) => ReactElement | null`;
  - `GraphPanel({ centre, workspaceId, onOpenTicket?, onShowLinks? })` in web.

- [ ] **Step 1: The gateway, test first (27.340).**
  ```ts
  // packages/app-core/src/online/graph.ts
  import type { GraphRingResponse } from '@gisik-nokma/domain';
  import type { HttpClient } from './http.js';

  export type GraphRingQuery = { center: string; hops: number; workspaceIds: readonly string[]; projectIds: readonly string[]; groups: readonly string[] };
  /** Structurally the Knowledge Graph's `GraphSource`: app-core does not depend on the renderer package. */
  export type GraphGateway = { ring(q: GraphRingQuery): Promise<GraphRingResponse> };

  export function createHttpGraphGateway(http: HttpClient): GraphGateway {
    return {
      async ring(q) {
        const params = new URLSearchParams({ center: q.center, hops: String(q.hops), ws: q.workspaceIds.join(','), groups: q.groups.join(',') });
        if (q.projectIds.length > 0) params.set('proj', q.projectIds.join(','));
        return (await http.get(`/v1/graph/neighbours?${params}`)) as GraphRingResponse;
      },
    };
  }
  ```
  Export it from `online/index.ts`: `export { createHttpGraphGateway, type GraphGateway, type GraphRingQuery } from './graph.js';`.

  `test/online/graph.test.ts` uses a recording `HttpClient` fake. Copy the fake that `test/online/people.test.ts` uses, if it has one; otherwise write a 6-line object.
  - **27.340** `ring({ center: 'ticket:01A', hops: 2, workspaceIds: ['w1', 'w2'], projectIds: [], groups: ['blocks', 'structure'] })` GETs `/v1/graph/neighbours?center=ticket%3A01A&hops=2&ws=w1%2Cw2&groups=blocks%2Cstructure`, with no `proj`, and resolves the body. **Control:** with `projectIds: ['p1']`, `proj=p1` is present.
    - Kills: (a) `if (q.projectIds.length > 0)` dropped (an empty `proj=` appears: the URL is compared EXACTLY, as a string) (b) `ws: q.workspaceIds.join(',')` → `q.workspaceIds[0]` (c) `return … as GraphRingResponse` → `return { …(await http.get(…)), cursor: null }`-style reshaping (assert the resolved value `toBe` the fake's body object).

  **House rule.** An app-core `online/` change means running the server integration files too: `pnpm --filter @gisik-nokma/server exec vitest run test/graph test/routes --maxWorkers=2`. Run it, and quote the result as LOCAL.

- [ ] **Step 2: The ticket sheet's fourth tab, test first (27.341; 16.81 amended).**

  In `ticket-sheet.test.tsx`, amend 16.81 (`:2895-2924`). Its existing assertion (exactly three tabs) stays as written for a sheet with no slot. Add, in the SAME `it`, a second mount WITH `knowledgeGraphSlot={() => <p>graph here</p>}`, which shows four tabs: `Details`, `History`, `Attachments`, `Knowledge Graph`. Rename the `it` to `16.81 / 27.341 …`. Edit 16.81's prose in its `test-cases/16-*.md` file in the same commit: "three tabs; a fourth, Knowledge Graph, when the host mounts the graph slot (27.341)".

  Then **27.341** proper (a new `it`): clicking `Knowledge Graph` renders the slot with `{ workspaceId, ticketId }`, and the slot's `onShowLinks()` returns the sheet to `Details`. **Control:** with no slot, the tablist's options are EXACTLY `['Details', 'History', 'Attachments']` and no element anywhere reads `Knowledge Graph`. ("The tab state cannot reach `'graph'`" is internal state a test cannot observe; the options list and the absent branch are what it can.)
    - Kills: (a) the `...(knowledgeGraphSlot !== undefined ? […] : [])` spread made unconditional (the control) (b) `onShowLinks: () => setTab('details')` → `setTab('history')` (c) `createElement(knowledgeGraphSlot, { workspaceId, ticketId, … })` with `ticketId` dropped (assert the slot's props `toEqual(expect.objectContaining({ workspaceId: <w>, ticketId: <t> }))`).

  The implementation, in `ticket-sheet.tsx`:
  - **Props (`:214`).** Beside `editorSlot?: EditorSlotComponent;`, add `knowledgeGraphSlot?: KnowledgeGraphSlotComponent;`, with a docblock saying:
    - it is a slot, like `editorSlot`, so app-core never depends on the renderer;
    - absent = no tab.

    Define the type next to `EditorSlotComponent` (`views/editor-slot.tsx:249`).
  - **Tab state (`:732`).** `useState<'details' | 'history' | 'attachments' | 'graph'>('details')`.
  - **`SegmentedControl` (`:3756-3760`):**
    ```tsx
    options={[
      { value: 'details', label: 'Details' },
      { value: 'history', label: 'History' },
      { value: 'attachments', label: 'Attachments' },
      ...(knowledgeGraphSlot !== undefined ? [{ value: 'graph' as const, label: 'Knowledge Graph' }] : []),
    ]}
    ```
    Extend the comment above it (`:3750-3755`): "spec C §1: a fourth tab when the host passes `knowledgeGraphSlot`; 16.81 counts both mounts".
  - **The branch.** Before `) : tab === 'attachments' ? (` (`:4538`):
    ```tsx
    ) : tab === 'graph' && knowledgeGraphSlot !== undefined ? (
      <div className="gn-ticket-sheet__graph">
        {createElement(knowledgeGraphSlot, { workspaceId, ticketId, onOpenTicket, onShowLinks: () => setTab('details') })}
      </div>
    ```
    Import `createElement` from `react` if the file does not already. It renders the slot the way `EditorSlot` is rendered: read `:1675`'s neighbourhood and use the same form.

  Run the ticket-sheet suite (build app-core first). Expected: PASS, with 16.81's first arm unchanged.

- [ ] **Step 3: The web panel and the ticket tab (27.342–27.344).**

  `apps/web/src/knowledge-graph/use-graph-scope.ts`:
  ```ts
  import { useEffect, useState } from 'react';
  import type { ScopeChoices } from '@gisik-nokma/knowledge-graph';
  import { useAppServices } from '../providers.js';

  /** The scope pickers' options: the viewer's workspaces and their live projects (`getMyWorkspaces`, `WorkspaceRef.projects`). */
  export function useGraphScope(): ScopeChoices | null {
    const { dataSource } = useAppServices();
    const [scope, setScope] = useState<ScopeChoices | null>(null);
    useEffect(() => {
      let dead = false;
      void dataSource.getMyWorkspaces().then((list) => {
        if (dead) return;
        setScope({ workspaces: list.filter((w) => !w.archived).map((w) => ({ id: w.id, name: w.name, projects: w.projects.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name })) })) });
      });
      return () => { dead = true; };
    }, [dataSource]);
    return scope;
  }
  ```
  `apps/web/src/knowledge-graph/graph-panel.tsx`:
  ```tsx
  'use client';
  import dynamic from 'next/dynamic';
  import { useRouter } from 'next/navigation';
  import { makeSubmittedFactory } from '@gisik-nokma/app-core';
  import { parseGraphRef, type GraphEdgeView, type GraphItemView } from '@gisik-nokma/domain';
  import { useAppServices, useCurrentUser } from '../providers.js';
  import { useIsPhone } from '../use-is-phone.js';
  import { useGraphScope } from './use-graph-scope.js';

  /** Client-only: WebGL, matchMedia and localStorage (spec C §4.1). The Sigma adapter is a further `import()` inside. */
  const KnowledgeGraph = dynamic(() => import('@gisik-nokma/knowledge-graph').then((m) => m.KnowledgeGraph), { ssr: false });

  export function GraphPanel(props: { centre: string; workspaceId: string; onOpenTicket?: (id: string) => void; onShowLinks?: () => void }) {
    const { graph, dataSource } = useAppServices();
    const actorId = useCurrentUser()?.id ?? ''; // `useCurrentUser` (`providers.tsx:233`); the panel only mounts signed in
    const phone = useIsPhone();
    const scope = useGraphScope();
    const router = useRouter();
    if (scope === null) return <div className="gn-kg-panel gn-kg-panel--loading" aria-busy="true" />;
    const onOpen = (item: GraphItemView) => {
      if (item.kind === 'ticket') props.onOpenTicket?.(item.id);
      else if (item.kind === 'note') router.push(`/notes/${item.id}`);
      else if (item.kind === 'project' && item.workspaceId !== null) router.push(`/w/${item.workspaceId}/p/${item.id}`);
      else if (item.kind === 'workspace') router.push(`/w/${item.id}`);
    };
    /** Spec A's removal (A §2.2): `ticket.link_removed` on the SOURCE's stream; Undo writes `ticket.link_added` again (A §3.1). */
    const onRemoveLink = async (edge: GraphEdgeView) => {
      const source = parseGraphRef(edge.from)!, target = parseGraphRef(edge.to)!;
      const make = makeSubmittedFactory({ actorId, origin: 'web' });
      const kind = edge.kind as 'blocks' | 'relates' | 'duplicates';
      const submit = async (type: 'ticket.link_removed' | 'ticket.link_added') => {
        const [result] = await dataSource.ingest([make({ workspaceId: props.workspaceId, entity: { kind: 'ticket', id: source.id }, type, payload: { kind, targetId: target.id } })]);
        // IngestResult (`packages/domain/src/ingest-result.ts:22`): committed | invalid { message } | refused { rule, reason }
        if (result === undefined || result.status === 'committed') return;
        throw new Error(result.status === 'refused' ? `refused by ${result.rule}: ${result.reason}` : result.message);
      };
      await submit('ticket.link_removed');
      return { undo: () => submit('ticket.link_added') };
    };
    return (
      <div className="gn-kg-panel">
        <KnowledgeGraph
          centre={props.centre}
          config={phone ? 'phone' : 'desktop'}
          source={graph}
          scope={scope}
          defaultWorkspaceIds={[props.workspaceId]}
          onOpen={onOpen}
          canOpen={(item) => item.kind !== 'person' && item.kind !== 'concept' && (item.kind !== 'ticket' || props.onOpenTicket !== undefined)}
          onAddLink={props.onShowLinks ? () => props.onShowLinks!() : undefined}
          onRemoveLink={onRemoveLink}
        />
      </div>
    );
  }
  ```
  The names are read, not guessed: `useCurrentUser()` (`apps/web/src/providers.tsx:233`), `dataSource.ingest(events): Promise<IngestResult[]>` (`packages/app-core/src/data-source.ts:457`), and the refusal sentence in A's house shape `refused by <rule>: <reason>` (spec A §2.3). Person and concept have no page, so they get no Open button (`canOpen`).

  `apps/web/src/knowledge-graph/ticket-graph-tab.tsx`:
  ```tsx
  'use client';
  import { kgNodeId } from '@gisik-nokma/knowledge-graph/ids';
  import type { KnowledgeGraphSlotComponent } from '@gisik-nokma/app-core';
  import { GraphPanel } from './graph-panel.js';
  export const TicketGraphTab: KnowledgeGraphSlotComponent = ({ workspaceId, ticketId, onOpenTicket, onShowLinks }) => (
    <GraphPanel centre={kgNodeId('ticket', ticketId)} workspaceId={workspaceId} onOpenTicket={onOpenTicket} onShowLinks={onShowLinks} />
  );
  ```
  Pass `knowledgeGraphSlot={TicketGraphTab}` at all THREE hosts, beside each `editorSlot={TicketEditorSlot}`:
  - `my-work/page.tsx` (after `:413`);
  - `p/[projectId]/page.tsx` (its `<TicketSheet` at `:3710`);
  - `note-document.tsx` (after `:877`).

  Each gets a one-line comment: "spec C §1: the fourth tab".

  In `providers.tsx`, add `graph: GraphGateway;` to `AppServices` with a docblock, `graph: createHttpGraphGateway(http),` to `constructed` after `members`, and the import. Then fix every `AppServices` literal in `apps/web/test`; typecheck finds them all. Each gets `graph: { ring: async () => ({ hop: 1, items: [], edges: [], frontier: [], truncated: false, cursor: null }) }`.

  The tests (`apps/web/test/knowledge-graph/*.test.tsx`; mock `next/dynamic` the way existing web tests do: `grep -rn "next/dynamic" apps/web/test`):
  - **27.342** `GraphPanel` passes `defaultWorkspaceIds=[workspaceId]`, `config='phone'` under the phone query, and `source === services.graph`. **Control:** on desktop, `config='desktop'`.
    - Kills: (a) `config={phone ? 'phone' : 'desktop'}` → `'desktop'` (b) `defaultWorkspaceIds={[props.workspaceId]}` → `[]` (c) `source={graph}` → `source={{ ring: graph.ring }}` (the `toBe` identity leg).
  - **27.343** `onRemoveLink` ingests ONE `ticket.link_removed` on the SOURCE ticket's stream, with `{ kind, targetId }` (A §2.2), and `undo()` ingests `ticket.link_added` with the same payload. A refused ingest throws its reason, so the inspector shows it (27.335). **Control:** removing a link viewed from its TARGET still writes on the source stream.
    - "ONE" is `expect(ingest).toHaveBeenCalledTimes(1)` with a one-event array, and the payload is `toEqual({ kind: 'blocks', targetId: <target id> })` (exact, so an extra field fails).
    - Kills: (a) `entity: { kind: 'ticket', id: target.id }` (Step 6's mutant) (b) `return { undo: () => submit('ticket.link_removed') }` (the undo leg) (c) the refused arm throws `result.reason` alone (assert the full `refused by <rule>: <reason>`) (d) `payload: { kind, targetId: source.id }`.
  - **27.344** All three hosts mount `TicketSheet` with `knowledgeGraphSlot`. Render each host's existing test harness, or grep-assert the prop in each file the way the repo's existing "every host passes X" tests do: `grep -rn "editorSlot" apps/web/test` shows the pattern. **Control:** the assertion fails if one host drops it (prove it by mutation).
    - Kills: drop `knowledgeGraphSlot={TicketGraphTab}` at (a) `my-work/page.tsx` (b) `p/[projectId]/page.tsx` (c) `note-document.tsx` (Step 6's mutant), one at a time. A grep-assert must be scoped to the `<TicketSheet` element's own props, or a comment naming the prop satisfies it.

- [ ] **Step 4: The note's Knowledge Graph panel (27.345, 27.346).**

  The note document has NO tabbed side panel. `notes-page.tsx:465` is the `On this page` table of contents, and History is a `Sheet` opened from the byline (`note-byline.tsx:137`, `:147`; `note-document.tsx:831`). So the note's "Knowledge Graph tab in its side panel" (spec §1) is built as the History pattern: a byline action that opens a `Sheet`. This is reported in the reply as a spec gap.
  - **`note-byline.tsx`.** Add a prop `onOpenGraph: () => void` (`:87`), a `GRAPH_LABEL = 'Knowledge Graph'` constant next to `HISTORY_LABEL` (`:12`), a phone overflow item after History (`:137`), and a desktop `<Button variant="ghost" onClick={onOpenGraph}>{GRAPH_LABEL}</Button>` after the History button (`:147-149`).
  - **`note-document.tsx`.**
    - `const [graphOpen, setGraphOpen] = useState(false);` next to `historyOpen` (`:602`).
    - `onOpenGraph={() => setGraphOpen(true)}` on `<NoteByline` (`:734`).
    - Next to `<HistoryPanel` (`:831`):
      ```tsx
      <Sheet open={graphOpen} title="Knowledge Graph" onClose={() => setGraphOpen(false)}>
        {graphOpen && <GraphPanel centre={kgNodeId('note', note.noteId)} workspaceId={note.workspaceId} onOpenTicket={(id) => { setGraphOpen(false); openTicket(id); }} />}
      </Sheet>
      ```
      `openTicket` is the document's existing open-ticket handler (`:328-329`, `router.push(\`/notes/${noteId}?ticket=${ticketId}\`)`): read its name there. The note's own field for its workspace: read `NoteDetail`.

  The tests:
  - **27.345** Clicking `Knowledge Graph` in the byline opens a dialog titled `Knowledge Graph` that mounts `GraphPanel` with `centre = 'note:<id>'`. Closing it unmounts the graph. **Control:** before the click, no `GraphPanel` is mounted (the graph costs nothing until asked for).
    - Kills: (a) `{graphOpen && <GraphPanel …/>}` → `<GraphPanel …/>` (Step 6's mutant; the control) (b) `kgNodeId('note', note.noteId)` → `kgNodeId('ticket', …)` (c) `onClose={() => setGraphOpen(false)}` → `onClose={() => {}}` (the unmount leg).
  - **27.346** In the ticket tab, an empty ticket's `Add link` returns the sheet to `Details`, where spec A's Links section is. If A's UI task is not merged, `onShowLinks` is still passed and lands on Details; the case asserts the tab switch only. **Control:** a note centre shows no `Add link`.
    - A second leg: a TICKET centre mounted through `GraphPanel` WITHOUT `onShowLinks` (the note panel's shape) shows no `Add link`. The note control alone cannot fail on `onAddLink`'s wiring, because `KnowledgeGraph` already hides the button for any non-ticket centre (T7, 27.321).
    - Kills: (a) `onAddLink={props.onShowLinks ? … : undefined}` → `onAddLink={() => props.onShowLinks?.()}` (the second leg) (b) `TicketGraphTab` drops `onShowLinks` (the tab never switches).

- [ ] **Step 5: The browser end-to-end check on the real stack (27.347), the manual (27.348), the Features close (27.349).**

  **27.347** is MANUAL on the dev stack, recorded 🟡 with the date. Kills: none, a manual check (no automated leg to fail).
  1. `ctl rebuild` the release branch.
  2. Sign in, open a ticket with links, then open `Knowledge Graph`.
  3. Hover an edge: the tooltip shows its sentence.
  4. Double-click a neighbour, then Back.
  5. Switch the theme: icons redraw.
  6. Open a note's Knowledge Graph from its byline.
  7. On the phone width: one clear hop, and `Scope and links`.

  Screenshots go to the lane's handoff. Use the FIRST Chrome tab (browser-measurement memory).

  **27.348:** `docs/manual.md` gets a "Knowledge Graph" section in the voice and heading level of its neighbours (read two sections first). It covers:
  - where it is (the ticket tab, the note byline);
  - what the rings and the fog mean;
  - hops and keys;
  - the filters and scope;
  - the semantic-layer switch (a view switch only);
  - Remove link.

  If a manual-coverage test exists (`grep -rn "manual.md" apps/web/test scripts`), add the section to it; that is the case's test. Otherwise 27.348 is 🟡 "manual prose, reviewed". Kills: none unless the coverage test exists; then deleting the section's heading from `docs/manual.md` turns it RED.

  **27.349: the Features close.**
  1. Re-read the whole `### Knowledge Graph view (spec C)` sub-section and replace the `<!-- KG-C … -->` anchors.
  2. Confirm every bullet still describes reality: the ✅ view bullet, the inspector bullet, the ticket tab and note panel bullet (add it now: "✅ Knowledge Graph tab on the ticket sheet and a Knowledge Graph panel from a note's byline"), and the ⚙️ engine/adapter/endpoint/gate bullets.
  3. Remove every `?` this plan introduced.

  27.349 is ✅ with the test `scripts/check-case-ids.mjs`'s own run cited, or 🚫 "documentation close: no test" if the catalogue checker rejects a ✅ without a test. Run `pnpm check:citations` and choose by its answer. Kills: none, a documentation close (it guards the catalogue's existing checks).

- [ ] **Step 6: Mutations, sweeps, DONE.**

  **Mutations:**
  - Drop `knowledgeGraphSlot` at `note-document.tsx`. 27.344 goes RED.
  - Write `link_removed` on the TARGET's stream. 27.343 goes RED.
  - Mount `GraphPanel` while the Sheet is closed. 27.345's control goes RED.

  **Sweeps** (build first: `pnpm turbo run build --filter=@gisik-nokma/web...`):
  - app-core, whole;
  - web, whole;
  - the server `test/graph` + `test/routes` (app-core `online/` changed);
  - the knowledge-graph package and the browser package;
  - `ui#test`;
  - `check:citations`, `node scripts/check-case-ids.mjs`, `pnpm check:tasks`, `pnpm check:env`.

  **Prose to sweep:**
  - `docs/manual.md:536` — "a panel with three tabs: **Details**, **History** and **Attachments**": four with the graph slot; then regenerate `packages/app-core/src/help/content.generated.ts:3223`, which carries the same sentence.
  - `Features.md:86` — "the authority draws `Details | History | Attachments` as a single segmented control": add the fourth tab when the host passes the slot.
  - `test-cases/16-remaining-doors.md:931` — 16.81's prose (Step 2 already edits it).
  - `packages/app-core/test/views/ticket-sheet.test.tsx:2905-2908` — the comment "⚠ THREE since 2026-09-22 …": still true for the no-slot mount; add a line for the second mount.
  - `packages/app-core/src/views/ticket-sheet.tsx:3750-3755` — "16.81's count moved 2 → 3" (Step 2 already extends it).
  - `Features.md:3767` — the KG-C ⚙️ bullet (the close, 27.349).

  Push, then DONE, with `NEEDS: browser, manual on the dev stack`.

---

## Self-review

**Spec coverage** (spec C section → task):

| Spec | Where |
|---|---|
| §1 ticket tab | T9 (27.341, 16.81 amended) |
| §1 note panel | T9 (27.345); see gap 2 |
| §1 Home component | T7's props for Plan E (27.327, `onZones`, `onEscape`, `hops`, `config: 'home'`, `kgNodeId` from `./ids`) |
| §2.1 groups and sentences | T1 (`GROUP_OF_EDGE_KIND`), T2 (27.232, 27.233) |
| §2.2 endpoint, visibility, out, order, cap cut | T1 (read), T6 (27.290–27.307) |
| §2.2 p95 | T1 (27.210, STOP), T6 (27.305) |
| §2.3 client graph and cache | T2 (`mergeRing`), T7 (27.314) |
| §3.1 rings, fog, band, ring labels | T2 (layout), T5 (`rings.ts`), T7 (CSS) |
| §3.2 cap and fog budget, "+N", count line | T2 (27.220, 27.221), T7 (27.326) |
| §3.3 levels | T2 (27.226–27.228); the tap target is 27.328 |
| §3.4 icons | T1 (`icons.ts`), T5 (27.268, 27.287), T8 (`Glyph`) |
| §3.5 interaction (click, double-click, C, Back, hover, edge tooltip, edge inspector, filters, scope, selection and zoom, list) | T5 (27.270–27.281), T7 (27.316, 27.317, 27.322, 27.323, 27.329), T8 (27.332–27.338) |
| §3.6 spring, wheel, limits, rubber band, fit, glide, reduced motion, zoom buttons | T3 (27.240–27.252), T5 (27.272–27.276, 27.281, 27.284, 27.285), T7 (27.322) |
| §3.7 tokens and contrast | T4 (27.255–27.259); see gap 4 |
| §4.1 package, seam, pins | T1 (27.202, 27.203) |
| §4.2 traps 1–11 | T5: 1 → 27.264/27.265/27.286; 2 → 27.266; 3 → 27.267; 4 → 27.268; 5 → 27.269; 6 → 27.270; 7 → 27.272; 8 → 27.276; 9 → 27.277; 10 → 27.278; 11 → 27.279 |
| §5 phone | T7 (27.328); one hop (27.313's phone arm via `hops` fixed at 1) |
| §6.1–6.3 states | T7 (27.320, 27.321, 27.319) |
| §6.4 semantic switch | T2 (27.224), T7 (27.312, 27.324, 27.325) |
| §7 bars | T1 (27.204–27.207, 27.210), T6 (27.305) |
| §8 gate count | T1 Step 13 |

**Placeholders.** Each task names the few facts its implementer must READ before writing, with the exact grep. They are deliberately not guessed:
- Task 5's Sigma `updated` signature;
- Task 2's ICU `Sep`/`Sept`.

The code shape around each is complete.

**Type consistency.** These names are checked across tasks:
- `GraphItemView` / `GraphEdgeView` / `GraphRingResponse` (T1 → T2, T6, T7, T9);
- `GraphStore` (T2 → T7, T8);
- `Zones` / `Walk` (T2 → T7, T8);
- `DrawNode` / `DrawEdge` / `DrawStates` / `DrawView` (T5 → T7);
- `IconSpec` in `render/node-attributes.ts` (T1 → T5, T7);
- `GraphSource` (T7) and `GraphGateway` (T9), structurally equal;
- `kgNodeId` (T2 `ids.ts` → T9, Plan E);
- `KnowledgeGraphSlotComponent` (T9).

**Review Focus.** Each line has its case in the owning task:
1. → 27.293 (T6);
2. → 27.318 (T7);
3. → 27.287 (T5);
4. → 27.225, 27.282, 27.311, 27.329;
5. → 27.324 (T7).

**Spec gaps and contradictions found in the code** (also in the reply):
1. **A stale citation.** The tabs are at `ticket-sheet.tsx:3756-3760`, not `:3634-3638` (§1).
2. **No note side panel exists.** `notes-page.tsx:447` is the table of contents, and History is a `Sheet` (`history-panel.tsx:117`). The plan adds a byline action that opens a `Sheet`.
3. **graphology placement.** §2.3 says the client graph is graphology, but §4.1 restricts graphology to `render/sigma/`. The engine holds plain maps; graphology exists only in the adapter.
4. **Token names and contrast.** §3.7's `--e-*` names cannot be emitted: the repo emits `--gn-*` (`tokens.ts:1901`).
   - The mockup's people-edge grey measures 2.03:1 (below 3:1), so a value is derived.
   - The fog dot is a recorded pairless exemption.
   - A 12th role (the card hairline) is needed, because `border` is `grayAccessible`.
5. **Hops.** `hops=1..4` (§2.2) contradicts the fog ring and "Everything". The cap is 8.
6. **Ring order.** The mockup's `cmp` (`:591`) puts structure first and sorts by label; §2.2 puts typed links first, newest first. The spec rules, through one shared comparator.
7. **No phone bar.** §7 gives no number. The plan proposes ≥ 30 fps with the worst frame ≤ 50 ms (STOP-AND-REPORT).
8. **Provenance is partial.**
   - `proj_note_attachments` has no actor (`migrations/1790100000000_proj-notes.sql:68-75`).
   - `parent`, `assignee` and `in` have none.
   - B's `proj_references` has no `origin`, so "via Claude" works only on typed links.
9. **Concepts.** D's tables do not exist, so the endpoint returns no concepts (fixture-only until D).
10. **Workspace and project cards** have no counts on the wire.
11. **Assignee direction.** The mockup stores assignee as ticket → person (`:543`), while §2.1's example reads person-first. The spec rules.
12. **Phone tap target.** The mockup's `tap` padding gives 26.5 px, under §5's 32 px. It is raised to 10.
13. **`done` is not a category.** It is `terminal` (`packages/domain/src/workflow.ts:4`).
14. **The Projects chip.** The mockup offers it only on a workspace centre (`:555`, `:712`). C's ticket and note surfaces omit it; Home passes it.

---

## Execution handoff

Plan complete. The planner commits it to `docs/superpowers/plans/2026-10-03-knowledge-graph-view.md` on the release branch.

**Recommended: subagent-driven, one lane per task**, because the tasks hand each other exact interfaces (engine → adapter → view → wiring), two of them stop for the owner's word, and a shipped mistake in the visibility read would leak hidden tickets:
- Tasks 2/3/4 run in parallel, and so does 6 once A and B land.
- Reviewers run the LOCAL battery themselves.
- Task 1's two STOP-AND-REPORT steps go to the owner before anything else merges.

## Ledger rows

```tsv
knowledge-graph-view	1	todo	-	-	not started (needs Plan A T1 for §24 + file 27; STOP-AND-REPORT x2)
knowledge-graph-view	2	todo	-	-	not started (waits for T1)
knowledge-graph-view	3	todo	-	-	not started (waits for T1)
knowledge-graph-view	4	todo	-	-	not started (waits for T1)
knowledge-graph-view	5	todo	-	-	not started (waits for T2 + T3 + T4)
knowledge-graph-view	6	todo	-	-	not started (waits for T1 + Plan A and Plan B table tasks)
knowledge-graph-view	7	todo	-	-	not started (waits for T5)
knowledge-graph-view	8	todo	-	-	not started (waits for T7)
knowledge-graph-view	9	todo	-	-	not started (waits for T6 + T8)
```

## Planner rulings (2026-10-03)

- **`proj_references` columns:** plan B (reference index) governs. It replaced the spec's `source_ticket` with `source_parent_kind` + `source_parent_id`, because comments also live on notes (`vocabulary.ts:282-284`). Task 6 reads B's columns as B's Task 1 creates them. A "Links in text" edge from a comment ends at its parent (ticket or note).
- **Plan E's props:** E's plan records this plan's contract; this plan's code is the source of truth.
- **Every other writer decision stands:** plain maps in the engine, `--gn-*` tokens, the derived people-edge colour, the fog exemption, the hops cap of 8, the spec's ring order over the mockup's `cmp`, `terminal` for "done", the note byline Sheet, and the phone bar of ≥ 30 fps with no frame over 50 ms.
