# Workflow canvas (G-9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In the gisik orchestration, every task is ONE lane session. Follow `gisik-nokma-lanes/STEPS-common-2026-10-03.md`: numbered steps, each ending with a pushed commit + `CHECKPOINT task/<branch> <sha40> step <n>/<N>` + `HANDOFF-<branch>.md`; the sweep list + your own mutation pass before DONE.

**Goal:** a workflow-builder canvas where a dragged state moves live under the pointer with its arrows, stops at other states Knowledgebase-style, snaps to guides and a grid, and the whole editor can run full-window with a floating toolbar and panel.

**Architecture:**
- Live drag comes from handling React Flow's `onNodesChange` into a working copy of the nodes, committed to the draft store on drop.
- Collision and snapping are pure modules (`collision.ts`, `snap.ts`), applied to every position change before it is applied.
- Full screen is a CSS-fixed layout of the existing `WorkflowBuilderScreen`, with a toolbar and a floating panel that reuse the existing editors.
- A new private package runs Playwright against a Vite harness of the builder, so real-browser canvas behaviour is on the gate.

**Tech stack:** React 19, `@xyflow/react` 12.11.6, TypeScript, vitest 3 (jsdom), Playwright 1.62 (Chromium), Vite 6 (harness only), turbo.

**Spec:** `docs/superpowers/specs/2026-10-03-workflow-canvas-design.md`. Read it first; its section numbers (§) are cited below.

## Global Constraints

**Release and identity**
- **Release:** `release/smoothness`. Every task branch is cut from `origin/release/smoothness`, and its PR is based on it. Never `main`.
- **Case ids:** `25.500`–`25.559` only, in `test-cases/25-smoothness.md` § "25.39". Each task owns a sub-block (listed per task). Test names or comments carry the id.

**Numbers, copied verbatim from the spec**
- `NODE_GAP = 8` (flow px).
- `GRID = 16` (flow px).
- Guide threshold: 6 screen px (`6 / zoom` flow px).
- Drag threshold: `nodeDragThreshold={4}`.
- Lifted scale: `1.02`.
- Tidy undo window: 10 s.
- Panel width: 280–480 px.

**What must not change**
- Positions stay session-only. Case `10.53` stays 🚫.
- No change to `WorkflowDef`, rules or publish.
- The existing editors (`StateInspector`, `TransitionInspector`, `BuilderPanels`, `SystemRulesPanel`, `IssuesPanel`, `PublishControls`, `WorkflowNameField`, `AddStateButton`) are reused unchanged in behaviour.

**Copy rules** (exact strings)
- Full screen, Exit full screen, Add transition, Tidy, Undo tidy, From, To, Any state, Issues, More.
- `Blocked by <state name>`.
- The full-screen region label: `Workflow editor, full screen`.

**Tests and tooling**
- Node 22. vitest `--maxWorkers=2`. Never pipe a test run into `head`.
- **Browser cases** live ONLY in `packages/workflow-canvas-browser` (new), never in `apps/web/e2e`. That suite boots `pnpm dev` on :3001, which is the dev stack's port.
- **Gate:** the gate runs `turbo run build test typecheck` (`scripts/ctl/test/lib.test.sh:141-143`). The new package declares `test` and `typecheck` and no `build`, so it adds TWO tasks: the gate asserts `36 successful, 36 total` after Task 1 (it was 34). Task 1 COUNTS the number from a local `pnpm turbo run build test typecheck --dry=json` before pinning it.
- **CSS:** shared CSS goes in the pre-seeded `/* G-9: <task> */` blocks in `packages/ui/src/ui.css` (Task 1 seeds them). Never EOF appends.

## Review Focus

1. **A draft change mid-drag**, for example the Publish refusal resetting `selection`, or a sessionStorage re-hydrate. The dragged node must keep its live position and must not snap back. Pinned by 25.503 (Task 1).
2. **A state dragged while the canvas is zoomed out to 0.25.** Guides must still trigger at 6 *screen* px, and the dashed outline must sit under the pointer. Pinned by 25.512 (Task 2) and 25.523 (Task 3).
3. **A drag that starts on a control inside the node** (the Category select, the checkboxes, which carry `nodrag`). It must not move the node, and the control must still work. Pinned by 25.504 (Task 1).
4. **Escape pressed while the floating panel holds a focused rule editor's open menu.** Only the menu closes. Neither the panel nor full screen closes. Pinned by 25.548 (Task 5).
5. **A read-only viewer (`canAuthor` false):**
   - may drag (layout is personal and session-only, as today);
   - sees no Add state, Add transition or Tidy in either toolbar;
   - can still enter full screen.

   Pinned by 25.538 (Task 4) and 25.552 (Task 5).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `packages/workflow-canvas-browser/` (new: `package.json`, `playwright.config.ts`, `vite.config.ts`, `harness/index.html`, `harness/main.tsx`, `tests/*.spec.ts`, `tsconfig.json`) | Real-browser canvas suite on the gate | 1 |
| `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx` | Working copy, `onNodesChange`, Escape-cancel, then snapping, collision, guides, outline, nudge | 1, 3 |
| `packages/app-core/src/workflow-builder/ui/use-working-nodes.ts` (new) | Pure-ish reducer: draft → working nodes, merging the in-flight drag | 1 |
| `packages/app-core/src/workflow-builder/ui/state-node.tsx`, `any-state-node.tsx` | `memo`, lifted look class | 1 |
| `packages/app-core/src/workflow-builder/collision.ts` (new) | `Rect`, `rectsOverlap`, `clampToAvoidOverlap` | 2 |
| `packages/app-core/src/workflow-builder/snap.ts` (new) | `snapPosition` pipeline: guides → grid → collision | 2 |
| `packages/app-core/src/workflow-builder/draft-store.ts` | `setPositions`; `addState` free placement | 3, 4 |
| `packages/app-core/src/workflow-builder/ui/canvas-overlays.tsx` (new) | Guide lines and the blocked outline | 3 |
| `packages/app-core/src/workflow-builder/ui/tidy-control.tsx` (new) | Tidy + Undo tidy | 4 |
| `packages/app-core/src/workflow-builder/ui/add-transition-form.tsx` (new) | The From/To popover | 4 |
| `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx` | Header buttons, full screen, toolbar, floating panel, Escape ladder | 4, 5 |
| `packages/app-core/src/workflow-builder/ui/floating-panel.tsx` (new) | Tabbed panel / phone bottom sheet | 5 |
| `packages/app-core/src/workflow-builder/ui/use-escape-ladder.ts` (new) | One owner of Escape | 5 |
| `packages/ui/src/ui.css` | G-9 blocks | 1, 3, 4, 5 |
| `scripts/ctl/verbs/gate.sh`, `scripts/ctl/test/lib.test.sh`, `docs/lanes/gate-lock/README.md`, `.github/workflows/ci.yml` | 34 → 36 tasks; Chromium in CI's test job | 1 |
| `test-cases/25-smoothness.md`, `Features.md` §22, `docs/manual.md` | Catalogue and help | each task its own lines; manual in 5 |

**Parallelism:**
- **Tasks 1 and 2** are independent (different files) and can run in parallel lanes.
- **Task 3** needs 1 and 2.
- **Task 4** needs 1 (the harness). It can run in parallel with 3: they touch different functions in `draft-store.ts` (Task 3 `addState`, Task 4 `setPositions`) and different blocks in `ui.css`.
- **Task 5** needs 3 and 4.

---

### Task 1: The browser harness on the gate, and live drag (cases 25.500–25.504)

**Files:**
- Create:
  - `packages/workflow-canvas-browser/package.json`
  - `packages/workflow-canvas-browser/tsconfig.json`
  - `packages/workflow-canvas-browser/vite.config.ts`
  - `packages/workflow-canvas-browser/playwright.config.ts`
  - `packages/workflow-canvas-browser/harness/index.html`
  - `packages/workflow-canvas-browser/harness/main.tsx`
  - `packages/workflow-canvas-browser/tests/helpers.ts`
  - `packages/workflow-canvas-browser/tests/drag.spec.ts`
  - `packages/app-core/src/workflow-builder/ui/use-working-nodes.ts`
  - `packages/app-core/test/workflow-builder/working-nodes.test.ts`
- Modify:
  - `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx`, the `CanvasInner` body (at `dfe7afe3`: `:35-57` and the `<ReactFlow>` props `:79-96`)
  - `packages/app-core/src/workflow-builder/ui/state-node.tsx` (wrap in `memo`)
  - `packages/app-core/src/workflow-builder/ui/any-state-node.tsx` (wrap in `memo`)
  - `packages/ui/src/ui.css`: seed the G-9 blocks after `.gn-state-node {` (`:3908` at `dfe7afe3`; re-read)
  - `scripts/ctl/verbs/gate.sh`: the `'34 successful, 34 total'` line
  - `scripts/ctl/test/lib.test.sh` and `docs/lanes/gate-lock/README.md`: every `34` that means the gate's task count
  - `.github/workflows/ci.yml`: before `pnpm turbo run test --filter='!@gisik-nokma/server'` (`:543`), add a Chromium install for the new package
  - `test-cases/25-smoothness.md` (new section `## 25.39 Workflow canvas: live drag, collisions, full-screen editing (G-9)` + 25.500–25.504)
  - `Features.md` §22 (one bullet)

**Interfaces:**
- **Produces:**
  - `useWorkingNodes(draftNodes: Node[]): { nodes: Node[]; onNodesChange: (changes: NodeChange[]) => void; beginDrag(id: string): void; cancelDrag(): Node | null; endDrag(): void }`;
  - the harness URL `http://localhost:3190/?seed=<name>&phone=0|1`;
  - the helpers `openHarness(page, opts)`, `nodeBox(page, stateName)`, `edgePath(page, index)`, `dragBy(page, stateName, dx, dy, { steps, release })`, `readDraftPositions(page)`.
- **Consumes:** `toFlowGraph`, `createDraftStore`, `createFakeGateway`, `WORKFLOW_TEMPLATES` / `draftFromTemplate`, `WorkflowBuilderScreen` (all exported from `@gisik-nokma/app-core`'s workflow-builder index).

- [ ] **Step 1: Seed the shared regions (plan item #21)**

  1. Append `## 25.39 Workflow canvas: live drag, collisions, full-screen editing (G-9)` to `test-cases/25-smoothness.md`, followed by five anchor lines:
     `<!-- G-9 T1 -->`, `<!-- G-9 T2 -->`, `<!-- G-9 T3 -->`, `<!-- G-9 T4 -->`, `<!-- G-9 T5 -->`.
     Each task writes its cases directly below its own anchor.
  2. In `Features.md` §22, under the existing `<!-- smoothness bullets … -->` line's list, add one bullet line `<!-- G-9 bullet -->`.
  3. In `packages/ui/src/ui.css`, directly after the `.gn-state-node { … }` rule, add five empty comment blocks:
     `/* G-9: T1 dragging */`, `/* G-9: T3 guides+outline */`, `/* G-9: T4 tidy+add-transition */`, `/* G-9: T5 fullscreen */`, `/* G-9: end */`.

  Commit: `G-9 T1: seed per-task regions (catalogue, Features, ui.css)`.

- [ ] **Step 2: Create the harness package**

  `packages/workflow-canvas-browser/package.json`:
  ```json
  {
    "name": "@gisik-nokma/workflow-canvas-browser",
    "version": "0.0.0",
    "private": true,
    "type": "module",
    "scripts": {
      "test": "playwright test",
      "typecheck": "tsc -p tsconfig.json --noEmit"
    },
    "dependencies": {
      "@gisik-nokma/app-core": "workspace:*",
      "@gisik-nokma/ui": "workspace:*",
      "@gisik-nokma/domain": "workspace:*",
      "react": "<same range as packages/app-core/package.json>",
      "react-dom": "<same range as packages/app-core/package.json>"
    },
    "devDependencies": {
      "@playwright/test": "<same range as apps/web/package.json (^1.50.0)>",
      "vite": "^6.4.3",
      "typescript": "<same range as packages/app-core/package.json>"
    }
  }
  ```
  - Copy the three `<same range…>` values literally from the named files. Do not invent versions.
  - `vite` is already in the lockfile at 6.4.3.

  `vite.config.ts`:
  ```ts
  import { defineConfig } from 'vite';
  export default defineConfig({
    root: 'harness',
    esbuild: { jsx: 'automatic' },
    server: { port: 3190, strictPort: true },
  });
  ```

  `playwright.config.ts`:
  ```ts
  import { defineConfig, devices } from '@playwright/test';
  export default defineConfig({
    testDir: './tests',
    timeout: 30_000,
    workers: 1,
    use: { baseURL: 'http://localhost:3190', ...devices['Desktop Chrome'] },
    webServer: { command: 'vite --config vite.config.ts', url: 'http://localhost:3190', reuseExistingServer: false, timeout: 60_000 },
  });
  ```

  `harness/index.html`:
  ```html
  <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>canvas harness</title></head>
  <body><div id="root" style="height:100vh"></div><script type="module" src="./main.tsx"></script></body></html>
  ```

  `harness/main.tsx`:
  - renders `WorkflowBuilderScreen` with `createFakeGateway({ members: [], ticketTypes: [] })`, `session = { userId: 'u1', role: url.searchParams.get('role') ?? 'owner' }`, `workspaceId = 'ws1'`;
  - its `initialDraft` is `draftFromTemplate(WORKFLOW_TEMPLATES[0])`, or the template named by `?seed=`;
  - imports `@gisik-nokma/ui/ui.css`;
  - exposes `window.__draftPositions = () => JSON.parse(sessionStorage.getItem(<draftStorageKey>) ?? 'null')?.positions`.

  Read `draftStorageKey` in `workflow-builder-screen.tsx` and import it if exported. If it is not exported, export it in this task: it is a one-line `export`.

  `tsconfig.json`: extend the repo's base tsconfig like `packages/app-core/tsconfig.json` does, with `"jsx": "react-jsx"`, `include: ["harness", "tests", "*.ts"]`.

  Then run `pnpm install` (Node 22).

  Run: `pnpm --filter @gisik-nokma/workflow-canvas-browser exec vite --config vite.config.ts` and open `http://localhost:3190`.
  Expected: the builder renders with the template's states. Stop the server.

  Commit.

- [ ] **Step 3: Write the RED browser test 25.500 + its control**

  `tests/helpers.ts`:
  ```ts
  import type { Page } from '@playwright/test';
  export async function openHarness(page: Page, opts: { phone?: boolean; role?: string; seed?: string } = {}) {
    const q = new URLSearchParams({ phone: opts.phone ? '1' : '0', role: opts.role ?? 'owner', seed: opts.seed ?? '' });
    if (opts.phone) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?${q}`);
    await page.locator('.react-flow__node').first().waitFor();
  }
  export const node = (page: Page, name: string) => page.locator('.react-flow__node', { has: page.locator('.gn-state-node__name', { hasText: name }) });
  export async function nodeBox(page: Page, name: string) { return (await node(page, name).boundingBox())!; }
  export async function edgePath(page: Page, index: number) { return page.locator(`[data-testid="rf__edge-t:${index}"] path`).first().getAttribute('d'); }
  export async function dragBy(page: Page, name: string, dx: number, dy: number, o: { steps?: number; release?: boolean } = {}) {
    const b = await nodeBox(page, name);
    const x = b.x + b.width / 2, y = b.y + 12; // the header, never a nodrag control
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: o.steps ?? 10 });
    if (o.release !== false) await page.mouse.up();
  }
  export async function readDraftPositions(page: Page) { return page.evaluate(() => (window as any).__draftPositions()); }
  ```
  Before using `edgePath`, re-read React Flow's edge `data-testid` at its node_modules source. If it differs, select the edge by its source and target instead, via `.react-flow__edge` with `data-id`.

  `tests/drag.spec.ts`:
  ```ts
  import { expect, test } from '@playwright/test';
  import { dragBy, edgePath, node, nodeBox, openHarness, readDraftPositions } from './helpers';

  test('25.500/25.501 a dragged state moves live under the pointer and its arrow follows, before release; control: a press-release without movement selects and does not move', async ({ page }) => {
    await openHarness(page);
    const name = await page.locator('.gn-state-node__name').first().innerText();
    const before = await nodeBox(page, name);
    const pathBefore = await edgePath(page, 0);
    // control first (25.501): no movement → selected, not moved
    await dragBy(page, name, 0, 0, { steps: 1 });
    expect(Math.abs((await nodeBox(page, name)).x - before.x)).toBeLessThan(1);
    await expect(node(page, name).locator('.gn-state-node')).toHaveClass(/gn-state-node--selected/);
    // the case (25.500)
    await dragBy(page, name, 200, 0, { steps: 10, release: false });
    const during = await nodeBox(page, name);
    expect(during.x - before.x).toBeGreaterThan(196);
    expect(during.x - before.x).toBeLessThan(204);
    expect(await edgePath(page, 0)).not.toBe(pathBefore);
    await page.mouse.up();
    const positions = await readDraftPositions(page);
    expect(Object.keys(positions).length).toBeGreaterThan(0);
  });
  ```
  Edge 0 must touch the dragged state. Pick the first edge whose source or target is that node; read `toFlowGraph`'s edge ids (`t:<index>`).

- [ ] **Step 4: Run the browser suite. It must FAIL on 25.500 (the proof of the cause)**

  Run: `pnpm --filter @gisik-nokma/workflow-canvas-browser test > /tmp/g9-t1-red.log 2>&1; tail -30 /tmp/g9-t1-red.log`
  Expected:
  - 25.500/25.501 FAILS at `during.x - before.x` (a delta of ~0, because the node does not move before release) AFTER its control assertions passed; quote both lines of the log.

  Quote both in the step's commit message.

  Commit the spec + helpers (RED).

- [ ] **Step 5: Write the failing unit test for the working-copy reducer (25.502, 25.503)**

  `packages/app-core/test/workflow-builder/working-nodes.test.ts` tests a pure function, which `use-working-nodes.ts` will export alongside the hook:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { mergeDraftNodes } from '../../src/workflow-builder/ui/use-working-nodes.js';
  const n = (id: string, x: number, y = 0) => ({ id, type: 'state', position: { x, y }, data: {} });

  describe('25.502 the working copy follows the draft', () => {
    it('re-derives positions and membership from the draft when no drag is in flight', () => {
      expect(mergeDraftNodes([n('a', 0), n('b', 10)], [n('a', 5)], null).map((m) => [m.id, m.position.x])).toEqual([['a', 0], ['b', 10]]);
    });
  });
  describe('25.503 a draft change mid-drag keeps the dragged node where the pointer has it', () => {
    it('keeps the in-flight position for the dragged id, still adds a state created meanwhile, and carries measured sizes; control: without an in-flight drag the draft position wins', () => {
      const measuredA = { ...n('a', 120), measured: { width: 210, height: 118 } };
      const merged = mergeDraftNodes([n('a', 0), n('c', 50)], [measuredA, n('b', 10)], 'a');
      expect(merged.map((m) => [m.id, m.position.x])).toEqual([['a', 120], ['c', 50]]);
      expect(merged[0].measured).toEqual({ width: 210, height: 118 });
      expect(mergeDraftNodes([n('a', 0)], [measuredA], null)[0].position.x).toBe(0);      // control
      expect(mergeDraftNodes([n('a', 0)], [measuredA], null)[0].measured).toEqual({ width: 210, height: 118 }); // measured survives either way
    });
  });
  ```
  Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/working-nodes.test.ts --maxWorkers=2 > /tmp/g9-wn.log 2>&1; tail -15 /tmp/g9-wn.log`
  Expected: FAIL (the module does not exist).

- [ ] **Step 6: Implement `use-working-nodes.ts`**

  ```ts
  import { useCallback, useEffect, useRef, useState } from 'react';
  import { applyNodeChanges, type Node, type NodeChange } from '@xyflow/react';

  /**
   * The draft is the source of truth; only the node under an in-flight drag keeps the pipeline's position (spec §2.1).
   * `measured` (written by React Flow's dimension changes) is carried from the working copy, because T3's obstacles read it.
   */
  export function mergeDraftNodes(draftNodes: Node[], working: Node[], draggingId: string | null): Node[] {
    const byId = new Map(working.map((candidate) => [candidate.id, candidate]));
    return draftNodes.map((candidate) => {
      const live = byId.get(candidate.id);
      const measured = live?.measured ? { measured: live.measured } : {};
      if (candidate.id === draggingId && live) return { ...candidate, ...measured, position: live.position, dragging: true };
      return { ...candidate, ...measured };
    });
  }

  type Point = { x: number; y: number };
  /** `last` is written SYNCHRONOUSLY inside `onNodesChange`: React Flow emits the drag-end change and calls `onNodeDragStop` in the SAME pointer-up handler, before React re-renders, so anything read from rendered state there is one step stale (reviewer C, 2026-10-03). */
  type Gesture = { id: string; start: Point; last: Point; cancelled: boolean };

  /**
   * Owns the dragged id's position from drag start until `onNodeDragStop` returns (spec §2.1), and nothing else of React Flow's.
   * `onNodesChange` is an ALLOW-LIST (planner ruling 2026-10-03, F1): `select` and `dimensions` changes always, `position`
   * changes only for the active, un-cancelled gesture's id. Every other change is dropped, because the draft owns membership
   * and placement: `remove` (React Flow's Backspace default), `add`, `replace`, and a `position` with no gesture or for another id
   * (an arrow-key nudge, a box-select move) would otherwise change the canvas and leave the draft behind, a delete or a move
   * that never happened. T4's nudge commits through the draft store, outside this filter.
   * React Flow keeps emitting position changes for the id until pointer-up, and its last one (`dragging: false`)
   * carries the RAW pointer position (`@xyflow/system` :2330-2331); after a cancel every change for the id is dropped.
   */
  export function useWorkingNodes(draftNodes: Node[]) {
    const [nodes, setNodes] = useState<Node[]>(draftNodes);
    const gesture = useRef<Gesture | null>(null);
    useEffect(() => {
      setNodes((working) => mergeDraftNodes(draftNodes, working, gesture.current?.id ?? null));
    }, [draftNodes]);
    const onNodesChange = useCallback((changes: NodeChange[]) => {
      const g = gesture.current;
      const kept = changes.filter(
        (change) => change.type === 'select' || change.type === 'dimensions' || (change.type === 'position' && g !== null && !g.cancelled && change.id === g.id),
      );
      if (g && !g.cancelled) {
        for (const change of kept) if (change.type === 'position' && change.id === g.id && change.position) g.last = change.position; // live, pre-render
      }
      if (kept.length > 0) setNodes((working) => applyNodeChanges(kept, working));
    }, []);
    const beginDrag = useCallback((id: string) => {
      const found = draftNodes.find((candidate) => candidate.id === id);
      gesture.current = found ? { id, start: found.position, last: found.position, cancelled: false } : null;
    }, [draftNodes]);
    /** Escape: restore the start position and keep the gesture ACTIVE but cancelled, so later changes are dropped and the nudge guard cannot fire. */
    const cancelDrag = useCallback((): void => {
      const g = gesture.current;
      if (g === null) return;
      g.cancelled = true;
      setNodes((working) => working.map((candidate) => (candidate.id === g.id ? { ...candidate, position: g.start, dragging: false } : candidate)));
    }, []);
    /** Called from `onNodeDragStop`. Returns the position to commit, or null after a cancel. */
    const endDrag = useCallback((): { id: string; position: Point } | null => {
      const g = gesture.current;
      gesture.current = null;
      if (g === null || g.cancelled) return null;
      return { id: g.id, position: g.last }; // the live ref, never rendered state (one step stale in the same pointer-up handler)
    }, []);
    const draggingId = useCallback(() => gesture.current?.id ?? null, []);
    return { nodes, setNodes, onNodesChange, beginDrag, cancelDrag, endDrag, draggingId };
  }
  ```
  Add a unit case **25.518** (from T1's reserved tail) in `working-nodes.test.ts` that drives the hook through `renderHook`: begin → a `dragging: true` change → `cancelDrag()` → another `dragging: true` change and a `dragging: false` change → `endDrag()` returns `null` and `nodes` shows the start position; control, same `it`: the same sequence without `cancelDrag()` returns the last applied position. Same `it`, the staleness pin: call `onNodesChange([positionChange])` and `endDrag()` inside ONE `act()` with no render between them; `endDrag()` returns that change's position. Mutation: `endDrag` reads from rendered `nodes` instead of the gesture's `last` → red.

  Run the unit test. Expected: PASS (25.502, 25.503).

  Commit.

- [ ] **Step 7: Wire it into `CanvasInner`**

  In `workflow-canvas.tsx`, replace `const { nodes, edges } = useMemo(...)` with:
  ```tsx
  const graph = useMemo(() => toFlowGraph(draft, summaryCtx), [draft, summaryCtx]);
  const working = useWorkingNodes(graph.nodes);
  const cancelled = useRef(false);
  ```
  Then:
  - `onNodeDragStart={(_e, n) => working.beginDrag(n.id)}`;
  - `onNodesChange={working.onNodesChange}`;
  - `onNodeDragStop`: `const done = working.endDrag(); if (done === null) return; store.actions.moveState(keyOf(done.id), done.position);`. **Never read the handler's `node.position`**: it is React Flow's raw pointer position (`@xyflow/system` :2094/:2108), and T3 makes the working copy the clamped one. `keyOf` is the existing `node.id === ANY_STATE_NODE_ID ? node.id : node.id.slice('s:'.length)`.
  - Drop the `cancelled` ref: the hook owns that state.
  - A window `keydown` listener registered on drag start and removed in `onNodeDragStop`. On `Escape`: `working.cancelDrag(); event.stopPropagation();`.

    React Flow's drag continues until pointer-up (its only abort is internal, `@xyflow/system` :2293). After the cancel the hook drops every further position change for that id, including the final `dragging: false` one, so the node stays at its start whether or not the pointer keeps moving, and `endDrag()` returns null so nothing is committed.
  - Pass `nodes={working.nodes}`, `edges={graph.edges}`, `nodeDragThreshold={4}`.

  Wrap `StateNode` and `AnyStateNode` in `memo(...)`. Keep the names: export `const StateNode = memo(function StateNode(props) {...})`.

- [ ] **Step 8: Lifted look (CSS, in the `/* G-9: T1 dragging */` block)**

  ```css
  .react-flow__node.dragging { z-index: 1000 !important; cursor: grabbing; }
  .react-flow__node.dragging .gn-state-node,
  .react-flow__node.dragging .gn-any-state-node { transform: scale(1.02); box-shadow: var(--gn-shadow-raised); }
  .react-flow__node-state, .react-flow__node-anyState { cursor: grab; }
  ```
  Before writing, grep `packages/ui/src/tokens.ts` for the elevation one step above the node's resting shadow. Use that token name if `--gn-shadow-raised` does not exist, and record the choice in DONE.

  React Flow sets the `dragging` class on the node wrapper; confirm it in the node_modules source at `@xyflow/react` (`'dragging'` in the NodeWrapper class list).

- [ ] **Step 9: Add 25.504 and run the browser suite GREEN**

  Append to `drag.spec.ts`:
  ```ts
  test('25.504 a drag that starts on a nodrag control (the Category select) does not move the state; the control still opens', async ({ page }) => {
    await openHarness(page);
    const name = await page.locator('.gn-state-node__name').first().innerText();
    const before = await nodeBox(page, name);
    const select = node(page, name).locator('.gn-state-node__category [aria-label="Category"]');
    const s = (await select.boundingBox())!;
    await page.mouse.move(s.x + 5, s.y + 5); await page.mouse.down(); await page.mouse.move(s.x + 150, s.y + 5, { steps: 8 }); await page.mouse.up();
    expect(Math.abs((await nodeBox(page, name)).x - before.x)).toBeLessThan(1);
  });
  ```
  Also add an Escape case to 25.500's file as **25.517** (borrowed from T2's reserved tail; suffixed ids are not policed by `check-case-ids`, so none are used), ONE `it`:
  - drag 150 px without releasing, press `Escape`; the node's box is back at `before` (±1 px) while the button is still down;
  - move the pointer a further 80 px (React Flow is still emitting moves); the box is STILL at `before` (±1 px);
  - release; the box is at `before` (±1 px) and `readDraftPositions` equals what it was before the drag.

  Run: `pnpm --filter @gisik-nokma/workflow-canvas-browser test > /tmp/g9-t1.log 2>&1; tail -20 /tmp/g9-t1.log`
  Expected: all PASS.

  Commit.

- [ ] **Step 10: Put the package on the gate and in CI**

  1. COUNT first: `pnpm turbo run build test typecheck --dry=json > /tmp/g9-dry.json 2>/dev/null; python3 -c "import json;print(len(json.load(open('/tmp/g9-dry.json'))['tasks']))"`. Expected **36** (34 + the package's `test` and `typecheck`; it has no `build`). Pin THAT number, whatever it prints, and quote it in DONE.
  2. `scripts/ctl/verbs/gate.sh`: `'34 successful, 34 total'` → `'36 successful, 36 total'` (or the counted number). Grep `scripts/ctl/test/lib.test.sh` and `docs/lanes/gate-lock/README.md` for the gate count `34`, and update each (do not touch unrelated 34s; read each hit).
  3. `turbo.json`: if `test` has per-package `inputs`, add `"@gisik-nokma/workflow-canvas-browser#test"` with inputs `["tests/**", "harness/**", "*.config.ts", "$TURBO_ROOT$/packages/app-core/src/workflow-builder/**", "$TURBO_ROOT$/packages/ui/src/ui.css"]` and `dependsOn: ["^build"]`.
  4. `.github/workflows/ci.yml`: in the job whose step is `pnpm turbo run test --filter='!@gisik-nokma/server'` (`:543`), add before it:
     ```yaml
           - run: pnpm --filter @gisik-nokma/workflow-canvas-browser exec playwright install --with-deps chromium
     ```
  5. `apps/server/test/ci/ci-trigger.test.ts` pins the workflow's triggers. Run it to confirm it is unaffected.

  Run: `pnpm turbo run build test typecheck --filter=@gisik-nokma/workflow-canvas-browser... > /tmp/g9-turbo.log 2>&1; tail -12 /tmp/g9-turbo.log`
  Expected: success.

  Commit.

- [ ] **Step 11: Catalogue + mutation pass + DONE**

  Under `<!-- G-9 T1 -->` in `test-cases/25-smoothness.md`, write ✅ lines for 25.500/25.501 (one `it`), 25.517, 25.502, 25.503, 25.518 and 25.504, each with its test file and its named mutation:

  | Case | Mutation | Expected |
  |---|---|---|
  | 25.500 | remove `onNodesChange` | red |
  | 25.517 | remove the Escape listener; separately, `onNodeDragStop` reads `node.position` instead of `endDrag()` | red both ways |
  | 25.518 | `cancelDrag` clears the gesture instead of marking it cancelled; separately, `endDrag` reads rendered `nodes` | red both ways |
  | 25.502 | `mergeDraftNodes` returns `working` | red |
  | 25.503 | ignore `draggingId` | red |
  | 25.504 | remove `nodrag` from the Category wrapper | red |

  - Run each mutation once (revert after each), and quote it in DONE.
  - Replace `<!-- G-9 bullet -->` in Features §22 with a ✅ bullet for live drag and the browser suite on the gate, keeping the anchor line below it for later tasks.
  - Run the sweep list for your paths (`ui.css` ⇒ ui + app-core + web WHOLE, `--maxWorkers=2`) and `check:citations`, `check-case-ids`, `check:help`.

  Push, then `DONE task/g9-t1-live-drag <sha40>` + one REVIEW line (`NEEDS: browser`).

---

### Task 2: Collision and snapping, as pure modules (cases 25.505–25.519)

**Files:**
- Create:
  - `packages/app-core/src/workflow-builder/collision.ts`
  - `packages/app-core/src/workflow-builder/snap.ts`
  - `packages/app-core/test/workflow-builder/collision.test.ts`
  - `packages/app-core/test/workflow-builder/snap.test.ts`
- Modify:
  - `packages/app-core/src/workflow-builder/index.ts` (export both)
  - `test-cases/25-smoothness.md` (under `<!-- G-9 T2 -->`)

**Interfaces:**
- **Produces:**
  - `type Rect = { x: number; y: number; width: number; height: number }`;
  - `NODE_GAP = 8`;
  - `rectsOverlap(a: Rect, b: Rect, gap: number): boolean`;
  - `clampToAvoidOverlap(target: {x;y}, size: {width;height}, obstacles: Rect[], lastValid: {x;y}, gap = NODE_GAP): {x;y}`;
  - `GRID = 16`, `GUIDE_SCREEN_PX = 6`;
  - `type Guide = { axis: 'x' | 'y'; at: number }`;
  - `snapPosition(raw: {x;y}, size: {width;height}, others: Rect[], opts: { zoom: number; alt: boolean; lastValid: {x;y} }): { position: {x;y}; guides: Guide[]; blocked: boolean; target: {x;y} }`.
- **Consumes:** nothing.

- [ ] **Step 1: Write the failing collision tests**

  `collision.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { clampToAvoidOverlap, rectsOverlap, NODE_GAP } from '../../src/workflow-builder/collision.js';
  const size = { width: 100, height: 60 };
  const ob = { x: 200, y: 0, width: 100, height: 60 };
  describe('collision (spec §3.1)', () => {
    it('25.505 a free target is returned unchanged', () => {
      expect(clampToAvoidOverlap({ x: 0, y: 200 }, size, [ob], { x: 0, y: 0 })).toEqual({ x: 0, y: 200 });
    });
    it('25.506 overlap honours the gap: touching within 8 px counts, 9 px apart does not', () => {
      expect(rectsOverlap({ x: 0, y: 0, ...size }, { ...ob, x: 107 }, NODE_GAP)).toBe(true);
      expect(rectsOverlap({ x: 0, y: 0, ...size }, { ...ob, x: 109 }, NODE_GAP)).toBe(false);
    });
    it('25.507 dragging into an obstacle from the left stops at its left edge minus the gap (slides, does not jump past)', () => {
      expect(clampToAvoidOverlap({ x: 150, y: 0 }, size, [ob], { x: 0, y: 0 })).toEqual({ x: 92, y: 0 });
    });
    it('25.508 the nearest valid candidate wins: approaching from above stops above it', () => {
      expect(clampToAvoidOverlap({ x: 200, y: -20 }, size, [ob], { x: 200, y: -200 })).toEqual({ x: 200, y: -68 });
    });
    it('25.509 a corner between two obstacles picks the closest free spot', () => {
      const ob2 = { x: 200, y: 68, width: 100, height: 60 };
      const out = clampToAvoidOverlap({ x: 150, y: 40 }, size, [ob, ob2], { x: 0, y: 40 });
      for (const o of [ob, ob2]) expect(rectsOverlap({ ...out, ...size }, o, NODE_GAP)).toBe(false);
      expect(out.x).toBe(92);
    });
    it('25.510 a target inside a stack of obstacles still lands on a free spot', () => {
      const ring = [ob, { x: 200, y: 68, width: 100, height: 60 }, { x: 200, y: -68, width: 100, height: 60 }];
      const out = clampToAvoidOverlap({ x: 210, y: 0 }, size, ring, { x: 0, y: 0 });
      for (const o of ring) expect(rectsOverlap({ ...out, ...size }, o, NODE_GAP)).toBe(false);
    });
  });
  ```
  The arithmetic was checked by hand (planner, 2026-10-03): left edge 200 − gap 8 − width 100 = 92; top 0 − gap 8 − height 60 = −68; 25.509's nearest free candidate is (92, 40). The binary-search fallback is defence in depth, ported for parity: with edge candidates, a free combination exists in every layout these tests build. Do not write a test claiming to reach it unless you construct a layout that does, and prove it reaches it with a counter.

  Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/collision.test.ts --maxWorkers=2 > /tmp/g9-col.log 2>&1; tail -15 /tmp/g9-col.log`
  Expected: FAIL (module missing).

- [ ] **Step 2: Implement `collision.ts`** (ported from `knowledge-base/src/app/knowledge_base/features/diagram/utils/collisionUtils.ts:16-81`; read that file first and keep the attribution comment)

  ```ts
  export type Rect = { x: number; y: number; width: number; height: number };
  type Point = { x: number; y: number };
  export const NODE_GAP = 8;

  export function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
    return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
  }

  /** Ported from the Knowledgebase diagram's clampToAvoidOverlap (collisionUtils.ts:39-81): fast path, edge candidates, binary search. */
  export function clampToAvoidOverlap(target: Point, size: { width: number; height: number }, obstacles: Rect[], lastValid: Point, gap = NODE_GAP): Point {
    const free = (p: Point) => obstacles.every((o) => !rectsOverlap({ ...p, ...size }, o, gap));
    if (free(target)) return target;
    const xs = new Set<number>([target.x]);
    const ys = new Set<number>([target.y]);
    for (const o of obstacles) {
      xs.add(o.x - gap - size.width); xs.add(o.x + o.width + gap);
      ys.add(o.y - gap - size.height); ys.add(o.y + o.height + gap);
    }
    let best: Point | null = null; let bestD = Infinity;
    for (const x of xs) for (const y of ys) {
      const p = { x, y };
      if (!free(p)) continue;
      const d = (x - target.x) ** 2 + (y - target.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) return best;
    let lo = 0, hi = 1;
    const at = (t: number) => ({ x: lastValid.x + (target.x - lastValid.x) * t, y: lastValid.y + (target.y - lastValid.y) * t });
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (free(at(mid))) lo = mid; else hi = mid; }
    return at(lo);
  }
  ```
  Run. Expected: PASS 25.505–25.510.

  Commit.

- [ ] **Step 3: Write the failing snap tests**

  `snap.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { snapPosition, GRID } from '../../src/workflow-builder/snap.js';
  const size = { width: 100, height: 60 };
  const other = { x: 400, y: 160, width: 100, height: 60 };
  const base = { zoom: 1, alt: false, lastValid: { x: 0, y: 0 } };
  describe('snapping (spec §3.2)', () => {
    it('25.511 off-guide positions snap to the 16 px grid', () => {
      expect(snapPosition({ x: 37, y: 9 }, size, [other], base).position).toEqual({ x: 32, y: 16 });
    });
    it('25.512 a centre within 6 SCREEN px of another centre snaps to it and reports a guide; at zoom 0.25 the flow threshold is 24', () => {
      const r = snapPosition({ x: 37, y: 163 }, size, [other], base);
      expect(r.position.y).toBe(160); expect(r.guides).toContainEqual({ axis: 'y', at: 190 });
      const z = snapPosition({ x: 37, y: 180 }, size, [other], { ...base, zoom: 0.25 });
      expect(z.position.y).toBe(160);
      expect(snapPosition({ x: 37, y: 180 }, size, [other], base).position.y).toBe(176); // control: at zoom 1, 20 px is beyond the guide → grid
    });
    it('25.513 a guide beats the grid on its axis only', () => {
      const r = snapPosition({ x: 37, y: 163 }, size, [other], base);
      expect(r.position.x % GRID).toBe(0);
    });
    it('25.514 the collision clamp runs last and hides a guide it moved off (the other axis keeps its guide)', () => {
      const aligner = { x: 300, y: 400, width: 100, height: 60 }; // raw x 297 is within 6 px of an x guide (other's left edge via right↔left, d = 3)
      const r = snapPosition({ x: 297, y: 163 }, size, [other, aligner], { ...base, lastValid: { x: 0, y: 163 } });
      expect(r.target).toEqual({ x: 300, y: 160 });             // an x guide + the y guide (centre↔centre)
      expect(r.blocked).toBe(true); expect(r.position).toEqual({ x: 292, y: 160 }); // clamped left of `other`
      expect(r.guides.find((g) => g.axis === 'x')).toBeUndefined();
      expect(r.guides).toContainEqual({ axis: 'y', at: 190 });
    });
    it('25.515 Alt skips guides and grid (the clamp still applies)', () => {
      expect(snapPosition({ x: 37, y: 163 }, size, [other], { ...base, alt: true }).position).toEqual({ x: 37, y: 163 });
    });
    it('25.516 target reports the snapped pre-clamp point (for the dashed outline); unblocked → target equals position', () => {
      const r = snapPosition({ x: 330, y: 163 }, size, [other], { ...base, lastValid: { x: 0, y: 163 } });
      expect(r.target).toEqual({ x: 336, y: 160 }); expect(r.position).toEqual({ x: 292, y: 160 });
      const free = snapPosition({ x: 37, y: 9 }, size, [other], base);
      expect(free.blocked).toBe(false); expect(free.target).toEqual(free.position);
    });
  });
  ```
  The guide `at` for the y-axis is the shared centre line, in flow coordinates: `other.y + other.height / 2 = 190`.

  Run. Expected: FAIL (module missing).

- [ ] **Step 4: Implement `snap.ts`**

  ```ts
  import { clampToAvoidOverlap, type Rect } from './collision.js';
  export const GRID = 16;
  export const GUIDE_SCREEN_PX = 6;
  export type Guide = { axis: 'x' | 'y'; at: number };
  type Point = { x: number; y: number };

  const PAIRS: [number, number][] = [[1, 1], [0, 0], [2, 2], [0, 2], [2, 0]]; // centre↔centre FIRST (ties keep the first), then left↔left, right↔right, left↔right, right↔left

  function guideAxis(start: number, len: number, others: { start: number; len: number }[], threshold: number): { value: number; at: number } | null {
    const mine = [start, start + len / 2, start + len];
    let best: { value: number; at: number; d: number } | null = null;
    for (const o of others) {
      const theirs = [o.start, o.start + o.len / 2, o.start + o.len];
      for (const [i, j] of PAIRS) {
        const d = Math.abs(mine[i] - theirs[j]);
        if (d <= threshold && (best === null || d < best.d)) best = { value: start + (theirs[j] - mine[i]), at: theirs[j], d };
      }
    }
    return best && { value: best.value, at: best.at };
  }

  export function snapPosition(raw: Point, size: { width: number; height: number }, others: Rect[], opts: { zoom: number; alt: boolean; lastValid: Point }) {
    let x = raw.x, y = raw.y; const guides: Guide[] = [];
    if (!opts.alt) {
      const threshold = GUIDE_SCREEN_PX / opts.zoom;
      const gx = guideAxis(raw.x, size.width, others.map((o) => ({ start: o.x, len: o.width })), threshold);
      const gy = guideAxis(raw.y, size.height, others.map((o) => ({ start: o.y, len: o.height })), threshold);
      if (gx) { x = gx.value; guides.push({ axis: 'x', at: gx.at }); } else x = Math.round(raw.x / GRID) * GRID;
      if (gy) { y = gy.value; guides.push({ axis: 'y', at: gy.at }); } else y = Math.round(raw.y / GRID) * GRID;
    }
    const target = { x, y };
    const position = clampToAvoidOverlap(target, size, others, opts.lastValid);
    const kept = guides.filter((g) => (g.axis === 'x' ? position.x === target.x : position.y === target.y));
    return { position, guides: kept, blocked: position.x !== target.x || position.y !== target.y, target };
  }
  ```
  The pairing rule is the explicit `PAIRS` list. The test in 25.512 is centre↔centre.

  Run. Expected: PASS 25.511–25.516.

  Commit.

- [ ] **Step 5: Exports, catalogue, mutations, DONE**

  - Add `export * from './collision.js'; export * from './snap.js';` to `workflow-builder/index.ts`.
  - Under `<!-- G-9 T2 -->`, write ✅ lines for 25.505–25.516 with these mutations:

    | Case | Mutation |
    |---|---|
    | 25.506 | gap ignored |
    | 25.507 | the fast path returns `target` always |
    | 25.509 | `best` chosen by first, not nearest |
    | 25.510 | the `free(p)` check removed from the candidate loop (returns an overlapping spot) |
    | 25.512 | threshold not divided by zoom |
    | 25.514 | guide filtering removed |
    | 25.515 | `alt` ignored |

  - 25.517 and 25.518 are used by Task 1 (the Escape cases). 25.519 is reserved and unused. Leave the numbers unused; do not renumber.
  - Run the mutations, the sweeps (app-core WHOLE) and the checks.

  Push. DONE + REVIEW.

---

### Task 3: Collision and snapping on the canvas, guides, outline, nudge, free placement (cases 25.520–25.534)

**Files:**
- Create:
  - `packages/app-core/src/workflow-builder/ui/canvas-overlays.tsx`
  - `packages/workflow-canvas-browser/tests/collision.spec.ts`
  - `packages/app-core/test/workflow-builder/add-state-placement.test.ts`
- Modify:
  - `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx`
  - `packages/app-core/src/workflow-builder/draft-store.ts` (`addState` only, `:150-165` at `dfe7afe3`)
  - `packages/ui/src/ui.css` (`/* G-9: T3 guides+outline */`)
  - `test-cases/25-smoothness.md` (`<!-- G-9 T3 -->`)

**Interfaces:**
- **Consumes:** `useWorkingNodes`, `snapPosition`, `NODE_GAP`, `GRID`, the T1 helpers.
- **Produces:**
  - `DraftActions.addState(input?: { name?: string; category?: StateCategory; near?: { x: number; y: number }; sizes?: Record<string, { width: number; height: number }> }): string`. `near` defaults to the old `nextFreePosition` behaviour, so templates are unchanged.
  - `CanvasOverlays` props `{ guides: Guide[]; outline: { x: number; y: number; width: number; height: number } | null }`.

- [ ] **Step 1: Failing browser tests** (`collision.spec.ts`)
  - **25.520/25.521** (one `it`): drag state A into state B. Before release, A's box is ≥ 8 px from B's box on the approach side, and an element `.gn-canvas-outline` is visible. Record A's on-screen box, then release: the outline is gone and `readDraftPositions` for A equals that last on-screen (clamped) box converted to flow units, NOT the pointer's drop point. Control, same `it`: dragging A to a free spot shows no outline and lands under the pointer.
  - **25.522:** drag so A's centre-y passes within 4 screen px of B's. `.gn-canvas-guide[data-axis="y"]` is visible, and A's centre-y equals B's exactly.
  - **25.523:** at zoom 0.25 (click zoom-out until the React Flow viewport transform's scale ≤ 0.26), the same guide still appears within 6 screen px.
  - **25.524:** hold Alt (`page.keyboard.down('Alt')`) and drag 37 px. The final x delta is 37 ± 1 in flow units (not a multiple of 16).
  - **25.525:** focus state A (Tab until `.react-flow__node:focus`), press ArrowRight. The draft x increases by exactly 16. Press Alt+ArrowRight: +1. Same `it`: start a drag of A, press Escape, release; the draft x is unchanged (an Escape-cancelled drag must not commit a nudge: React Flow's drag-end change arrives with `dragging: false`).
  - **25.526:** place A one grid step left of B's gap. ArrowRight is blocked: the position is unchanged, and the live region `[aria-live="polite"]` reads `Blocked by <B's name>`.

  The overlay classes must not collide with existing ones. Grep `ui.css` for `gn-canvas-` first, and record that no hit was found.

  Run: `pnpm --filter @gisik-nokma/workflow-canvas-browser test > /tmp/g9-t3-red.log 2>&1; tail -30 /tmp/g9-t3-red.log`
  Expected: 25.520, 25.522, 25.523, 25.524, 25.525 and 25.526 FAIL; 25.521 PASSES.

  Commit (RED).

- [ ] **Step 2: Snapping and collision inside `onNodesChange`**

  In `CanvasInner`:
  1. **Keep Alt state:** `const altDown = useRef(false)`, updated by window `keydown`/`keyup` for `Alt`.
  2. **On drag start, snapshot the obstacles:** `others = working.nodes.filter(n => n.id !== id).map(n => ({ x: n.position.x, y: n.position.y, width: n.measured?.width ?? 208, height: n.measured?.height ?? 120 }))`. Also store `lastValid = node.position`.
  3. **Wrap `onNodesChange`:** for each `{ type: 'position', id, position }` change for the dragged id while `working.draggingId() === id`:
     - if `change.dragging === true`: compute `snapPosition(position, size, others, { zoom: getViewport().zoom, alt: altDown.current, lastValid })`, replace `change.position` with `result.position`, set `lastValid = result.position`, set the `guides` state and `outline = result.blocked ? { ...result.target, ...size } : null`;
     - if `change.dragging === false` (React Flow's drag-end change, which carries the RAW pointer position): replace `change.position` with `lastValid`. This is what makes the working copy's final position the clamped one.
     - Then pass the changes to `working.onNodesChange` (after a cancel the hook drops them, which is correct).
  4. **On drag stop:** clear the guides and the outline. The commit is Task 1's: `working.endDrag()` returns the working copy's position, now equal to `lastValid`, and `moveState` writes it. Never `node.position`.

  `useReactFlow().getViewport` gives the zoom. The `208×120` fallback is the existing `UNMEASURED_NODE` in `flow-graph.ts`. Export it from there and import it; do not duplicate the numbers.

- [ ] **Step 3: `canvas-overlays.tsx`**

  It renders inside `<ReactFlow>` using `ViewportPortal` from `@xyflow/react`, so it is drawn in flow coordinates:
  ```tsx
  import { ViewportPortal } from '@xyflow/react';
  import type { Guide } from '../snap.js';
  export function CanvasOverlays(props: { guides: Guide[]; outline: { x: number; y: number; width: number; height: number } | null }) {
    return (
      <ViewportPortal>
        {props.guides.map((g) => (
          <div key={g.axis} className="gn-canvas-guide" data-axis={g.axis} aria-hidden="true"
            style={g.axis === 'y' ? { transform: `translate(-5000px, ${g.at}px)`, width: 10000 } : { transform: `translate(${g.at}px, -5000px)`, height: 10000 }} />
        ))}
        {props.outline ? (
          <div className="gn-canvas-outline" aria-hidden="true"
            style={{ transform: `translate(${props.outline.x}px, ${props.outline.y}px)`, width: props.outline.width, height: props.outline.height }} />
        ) : null}
      </ViewportPortal>
    );
  }
  ```
  CSS, in `/* G-9: T3 guides+outline */`:
  ```css
  .gn-canvas-guide { position: absolute; left: 0; top: 0; pointer-events: none; background: var(--gn-accent); }
  .gn-canvas-guide[data-axis="y"] { height: 1px; }
  .gn-canvas-guide[data-axis="x"] { width: 1px; }
  .gn-canvas-outline { position: absolute; left: 0; top: 0; pointer-events: none; border: 2px dashed var(--gn-accent); border-radius: var(--gn-radius-md); opacity: 0.4; }
  ```
  Grep `tokens.ts` for the accent and radius token names, and use the real ones.

  Run the T3 browser suite. Expected: 25.520, 25.521, 25.522, 25.523 and 25.524 PASS.

  Commit.

- [ ] **Step 4: Keyboard nudge**

  React Flow moves selected nodes on arrow keys through `updateNodePositions` with `dragging: false`. That arrives in our `onNodesChange` as a position change with `dragging: false` and no active drag.

  The wrapper sits OUTSIDE `useWorkingNodes`: Task 1's hook drops a position change with no active gesture (F1's allow-list), so the nudge must be consumed by the wrapper BEFORE the change reaches the hook; React Flow moves a node on an arrow key only when it is `selected`, so the state must be selected through the draft first (a click, or focus/Enter mapped to `store.actions.select`).

  In the wrapped `onNodesChange`, treat a position change with `dragging === false` when `working.draggingId() === null` as a nudge. The guard holds because Task 1's hook keeps the gesture active (cancelled or not) until `onNodeDragStop` calls `endDrag()`, so React Flow's drag-end change never reaches this branch:
  1. compute `step = alt ? 1 : GRID` along the change's direction (its sign versus the current position);
  2. set `intended = current + step`, and `clamped = clampToAvoidOverlap(intended, size, othersFresh, current)`;
  3. **if `clamped` equals `current`:** drop the change, and announce `Blocked by ${nameOfFirstOverlapping}` in a polite live region rendered by `CanvasInner` (`<div className="gn-visually-hidden" aria-live="polite">`; grep the real visually-hidden class);
  4. **otherwise:** apply `clamped` and commit with `moveState`.

  Before coding, read React Flow's arrow-key handling in node_modules (`moveSelectedNodes`/`updatePositions` in `@xyflow/react` `index.mjs`) to confirm:
  - the change shape;
  - that the final drag-stop change also arrives with `dragging: false` (`@xyflow/system` :2330-2331). That is why the guard is "no active drag", tracked via `beginDrag`/`endDrag`, and why step 2 consumes that change before this branch.

  If React Flow's keyboard step is not 1 unit per press, compute the direction only from the sign, as above.

  Run. Expected: 25.525 and 25.526 PASS.

  Commit.

- [ ] **Step 5: Free placement for Add state (25.527–25.528, unit)**

  `add-state-placement.test.ts`:
  - **25.527/25.528** (one `it`): a draft whose positions fill (0,0)…(16·k) around `near = {x: 0, y: 0}`; `addState({ near: {x: 0, y: 0}, sizes })` puts the new state at a grid point that overlaps no existing rect (with the gap), nearest to `near`. Control, same `it`: `addState()` with no `near` keeps the old `nextFreePosition` result.

  Implementation in `draft-store.ts` `addState`:
  - when `input.near` is given, search grid points in rings of radius r = 0, 1, 2, …, up to 40 around `near` (snapped to `GRID`);
  - return the first point whose rect (size `UNMEASURED_NODE`) is free against all `positions` (sizes from `input.sizes[id] ?? UNMEASURED_NODE`) with `NODE_GAP`;
  - fall back to `nextFreePosition`.

  In `workflow-builder-screen.tsx`, `AddStateButton` passes `near`: the flow-coordinate centre of the current viewport. Expose `getViewportCentre` via a small context or a ref callback from `WorkflowCanvas`: `onReady(api: { centre(): {x;y}; sizes(): Record<string, {width;height}> })`. Prefer a ref callback; there is no new context.

  Run the unit tests and the browser suite. Commit.

- [ ] **Step 6: Catalogue, mutations, DONE**

  Write ✅ lines 25.520–25.528 with these mutations:

  | Case | Mutation |
  |---|---|
  | 25.520 | `snapPosition` bypassed in `onNodesChange`; separately, the drag-end change passed through with its raw position |
  | 25.522 | guides not rendered |
  | 25.523 | zoom fixed at 1 |
  | 25.524 | Alt ref never set |
  | 25.525 | nudge step 5 |
  | 25.526 | the clamp skipped on nudge |
  | 25.527 | the ring search returns `near` |

  - 25.529–25.534 are reserved and unused.
  - Sweeps: ui + app-core + web WHOLE (`ui.css`); checks.

  Push. DONE + REVIEW (`NEEDS: browser`).

---

### Task 4: Tidy and Undo tidy, Add transition, header buttons (cases 25.535–25.544)

**Files:**
- Create:
  - `packages/app-core/src/workflow-builder/ui/tidy-control.tsx`
  - `packages/app-core/src/workflow-builder/ui/add-transition-form.tsx`
  - `packages/app-core/test/workflow-builder/tidy-and-add-transition.test.tsx`
  - `packages/workflow-canvas-browser/tests/tidy-transition.spec.ts`
- Modify:
  - `packages/app-core/src/workflow-builder/draft-store.ts` (add `setPositions` to `DraftActions` and `actions`)
  - `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx` (the header actions `div`, beside `AddStateButton`)
  - `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx` (corner `Panel`: Tidy beside "Fit to screen")
  - `packages/ui/src/ui.css` (`/* G-9: T4 tidy+add-transition */`)
  - `test-cases/25-smoothness.md` (`<!-- G-9 T4 -->`)

**Interfaces:**
- **Produces:**
  - `DraftActions.setPositions(positions: Record<string, StatePosition>): void`;
  - `TidyControl` (no props; reads the store);
  - `AddTransitionForm` props `{ onAdded?: (index: number) => void }`;
  - `transitionExists(def: WorkflowDef, from: string, to: string): boolean`, exported from `add-transition-form.tsx`, reused by Task 5.
- **Consumes:** `layoutDraft`, `clampToAvoidOverlap`, `NODE_GAP`, `UNMEASURED_NODE`.

- [ ] **Step 1: Failing unit tests**
  - **25.535:** `setPositions` replaces all positions in one notify. Subscribe and count the listener calls: exactly 1.
  - **25.536:** Tidy:
    - **sets** `positions` to `layoutDraft(def)`, each passed through `clampToAvoidOverlap` against the already placed ones (no two rects overlap with the gap);
    - **shows** "Undo tidy";
    - **"Undo tidy"** restores the exact previous object (`toEqual`).
  - **25.537:**
    - **after 10 s** (`vi.useFakeTimers()`, advance by 10_000), "Undo tidy" is gone;
    - **control:** at 9_999 it is still there;
    - **a `moveState`** after Tidy also removes it.
  - **25.538:** with `canAuthor` false, no Tidy, no Add transition and no Add state are rendered.

    Read `BuilderProvider`'s env in `builder-context.tsx` for how the existing tests set `canAuthor`. Mirror `canvas.test.tsx`'s render helper.
  - **25.539:** `AddTransitionForm` lists every state plus "Any state" under From, and every state (no "Any state") under To. Add calls `addTransition(from, to)` and selects the new transition (`selection = { kind: 'transition', index: transitions.length - 1 }`).
  - **25.540:** Add is disabled, with an inline reason, when the pair exists (`transitionExists`) or when From === To. The reasons are `That transition already exists` and `Pick two different states`.

    Before fixing the From === To rule, read `validateWorkflowDef`'s codes (`packages/domain/src/validate-workflow.ts`). Self-loops have no issue code there; the form refuses them for clarity. Record that in DONE.

  Run. Expected: FAIL.

- [ ] **Step 2: Implement `setPositions`, `TidyControl` and `AddTransitionForm`**
  - **`setPositions`:** `setPositions(positions) { set({ ...state, positions }); }`.
  - **`TidyControl`:**
    - a `Button` "Tidy";
    - on click, keep `prev = store.getState().positions`, compute the clamped layout, and call `setPositions`;
    - show an inline `Button` "Undo tidy" for 10 s (`setTimeout`, cleared on unmount), calling `setPositions(prev)`;
    - subscribe to the store, and hide "Undo tidy" when `positions` changes to anything but the tidied object.
  - **`AddTransitionForm`:** a `Popover` (grep `packages/ui` for the existing popover or menu component the builder already uses, e.g. in `add-rule-menu.tsx`, and reuse it) with two `Select`s (`@gisik-nokma/ui`), an Add `Button` and the reason text.
  - **Placement:** both go in the header actions after `AddStateButton`, rendered only when `canAuthor`. Tidy also goes in the canvas corner `Panel`, after "Fit to screen".

  Run. Expected: PASS.

  Commit.

- [ ] **Step 3: Browser cases** (`tidy-transition.spec.ts`)
  - **25.541:** drag two states to overlap-adjacent spots, click Tidy. No two `.react-flow__node` boxes overlap. Click Undo tidy, and every box returns (±1 px).
  - **25.542:** Add transition from "Any state" to a state. A new edge appears from the any-state node.
  - **25.543:** the duplicate pair shows the reason and a disabled Add.
  - **25.544:** phone viewport. Tidy and Add transition are reachable (Add transition in the header; Tidy in the canvas corner).

  Run. Expected: PASS.

  Commit.

- [ ] **Step 4: Catalogue, mutations, DONE**

  Write ✅ lines 25.535–25.544 with these mutations:

  | Case | Mutation |
  |---|---|
  | 25.535 | `setPositions` calls `moveState` per id |
  | 25.536 | undo restores `layoutDraft` instead |
  | 25.537 | timer 1 s |
  | 25.538 | the `canAuthor` guard removed |
  | 25.540 | `transitionExists` returns false |

  Sweeps and checks. Push. DONE + REVIEW (`NEEDS: browser`).

---

### Task 5: Full-screen editing, the floating panel, the Escape ladder, phone sheet, help (cases 25.545–25.559)

**Files:**
- Create:
  - `packages/app-core/src/workflow-builder/ui/floating-panel.tsx`
  - `packages/app-core/src/workflow-builder/ui/use-escape-ladder.ts`
  - `packages/app-core/test/workflow-builder/fullscreen.test.tsx`
  - `packages/workflow-canvas-browser/tests/fullscreen.spec.ts`
- Modify:
  - `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx` (the root `div`, the header, the layout)
  - `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx` (corner Full screen button; the drag keeps Task 1's own `useDragEscape` listener, unchanged) (planner ruling 2026-10-04 Q1)
  - `packages/app-core/src/workflow-builder/ui/builder-panels.tsx` (`:21`: `const STACKED_QUERY` → `export const STACKED_QUERY`, the builder's existing narrow query, reused for the toolbar's fold) (planner ruling 2026-10-04 Q2)
  - `packages/workflow-canvas-browser/harness/main.tsx` (`:23`: an opt-in FIXED draft id, so a reload reads the same storage key) (planner ruling 2026-10-04 Q3)
  - `packages/ui/src/ui.css` (`/* G-9: T5 fullscreen */`)
  - `docs/manual.md` (the workflow-builder section: one paragraph on Full screen and one on Add transition; run `check:help`)
  - `test-cases/25-smoothness.md` (`<!-- G-9 T5 -->`)
  - `test-cases/21-mobile-web.md` (`:160`, 21.176: say its desktop-negative leg is OUTSIDE full screen) (planner ruling 2026-10-04 Q5)
  - `Features.md` §22 (the final G-9 bullet: drag, collisions, full screen, Add transition)

**Interfaces:**
- **Produces:**
  - `useEscapeLadder(layers: { open: boolean; close: () => void }[])`, with the layers innermost first (`[panel, fullScreen]`). One `keydown` listener lives in the screen, on `window`, in the BUBBLE phase. On an `Escape` with `!event.defaultPrevented`, it closes the first open layer and calls `event.preventDefault()`. On a prevented `Escape` it does nothing. It never calls `stopPropagation()`. (planner ruling 2026-10-04 Q1: no capture-phase listener, and no push/pop stack.)
  - `FloatingPanel` props `{ open: boolean; tab: 'selection' | 'lists' | 'system' | 'issues'; onTab(t): void; onClose(): void; phone: boolean }`.
- **Consumes:** `TidyControl`, `AddTransitionForm`, the existing panels. The drag's Escape stays Task 1's `useDragEscape` (window capture plus `stopPropagation`, `use-working-nodes.ts:75-93`), so a drag-cancelling Escape never reaches the ladder. (planner ruling 2026-10-04 Q1)

- [ ] **Step 1: Failing unit tests** (`fullscreen.test.tsx`, jsdom, which is fine for state, focus and the DOM)
  Shared setup: render the full `WorkflowBuilderScreen` and `await findByRole('textbox', { name: 'Workflow name' })` first, as `phone-builder-hooks.test.tsx`'s `renderBuilder` does. `beforeEach`: `sessionStorage.clear()` and a `matchMedia` stub (`matches: false` unless a case says otherwise). jsdom applies no CSS, so the left column's `BuilderPanels` (with its inspectors and `IssuesPanel`) stays in the DOM in full screen: **scope every panel query `within(getByRole('region', { name: 'Workflow panel' }))`**, or the left column answers it.

  - **25.545:** clicking "Full screen" sets `data-fullscreen="true"` on `.workflow-builder-screen`, and focus moves to the toolbar's first control (the name field). "Exit full screen" clears it, and focus returns to the "Full screen" button.
    - **Before:** `data-fullscreen="false"` and no `role` on the root (so the "on" leg cannot pass on an attribute that is always there).
    - **On, from the header's button:** `data-fullscreen="true"`, `role="region"`, `aria-label="Workflow editor, full screen"`; the `Workflow name` textbox `toHaveFocus()` (`user.click` left focus on the button, so this leg needs the move).
    - **Off:** "Exit full screen" → `data-fullscreen="false"`; the header's "Full screen" button (re-queried) `toHaveFocus()`.
    - **Return goes to the button that entered:** enter again from the canvas corner's "Full screen" (the one inside `getByRole('region', { name: 'Canvas' })`), exit, and the CORNER button has focus, not the header's.

    Kills: (a) drop the focus move to the toolbar's first control on entry; (b) restore focus to a fixed header-button ref instead of the button that entered (the corner leg); (c) `role` / `aria-label` left off the root in full screen.
  - **25.546:** the choice persists in `sessionStorage` under `<draftStorageKey>:fullscreen`. Remounting restores it. Control: a different draft key does not.
    - Render with a FIXED `workspaceId` and ONE `initialDraft` object for every mount (not `newUlid()` per render, and not a fresh `draftFromTemplate`, which mints a new def id, `templates.ts:69`), or the remount reads another key and the restore leg is red for the wrong reason.
    - **Restore:** enter, unmount, mount again with the same props → `data-fullscreen="true"` before any click.
    - **Control:** mount with a different `workspaceId` (another draft key) → `data-fullscreen="false"`.
    - **Exit is remembered too:** exit, unmount, mount with the first props → `data-fullscreen="false"`.

    Kills: (a) initialise `fullscreen` to `false` instead of reading sessionStorage (restore leg); (b) store under a fixed key such as `'gn-workflow-fullscreen'` instead of `<draftStorageKey>:fullscreen` (control leg); (c) write only when turning on, never on exit (exit leg).
  - **25.547:** the toolbar contains, in order: the name, Add state, Add transition, a zoom group, Tidy, Issues (with the error count from `validateWorkflowDef`), Publish, Exit full screen. A narrow width (mock `matchMedia` true for the exported `STACKED_QUERY`, `builder-panels.tsx:21`, `'(max-width: 64rem)'`; import the CONSTANT, never a literal) moves zoom and Tidy into a "More" menu; the Issues badge stays in the row, and folds into More only at phone width (`PHONE_BOARD_QUERY`, 25.554, spec §4.5). (planner ruling 2026-10-04 Q2)
    - **Order (wide, every query `false`):** take the eight controls `within(.gn-wf-toolbar)` and assert each consecutive pair with `a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING`, so any one swap is red; there is no `More` button.
    - **The count is the validator's:** mount two drafts whose `validateWorkflowDef(def).length` values `a` and `b` differ and are both > 0 (for example one and two extra `addState()` calls on the kanban store, then `select({ kind: 'none' })`, `getState()` as `initialDraft`); preconditions `expect(a).toBeGreaterThan(0)` and `expect(b).not.toBe(a)`; the badge's accessible name contains `String(a)`, then `String(b)`.
    - **Narrow** (stub `matches: query === STACKED_QUERY`, the imported constant; `PHONE_BOARD_QUERY` stays false): `within(toolbar).queryByRole('button', { name: 'Tidy' })` is null and no zoom button is in the row; a `More` button is; after clicking it, the menu holds the zoom buttons and Tidy; the Issues badge IS still in the row. (planner ruling 2026-10-04 Q2)
    - **Phone** (stub `matches` true for `STACKED_QUERY` and `PHONE_BOARD_QUERY`): the Issues badge is NOT in the row and IS in the opened More menu. (planner ruling 2026-10-04 Q2)

    Kills: (a) swap Add state and Add transition in the toolbar; (b) the badge counts `adviseWorkflowDef` or a constant (count leg); (c) always fold into More (wide leg) / never fold (narrow leg); (d) fold Issues at `STACKED_QUERY` (narrow leg) / never fold Issues (phone leg). (planner ruling 2026-10-04 Q2)
  - **25.548:** the Escape ladder.
    - **Order:** with a rule editor's menu open inside the panel, in full screen: one Escape closes only the menu, the next closes the panel, the next exits full screen.
      - Setup: select a transition, then click `Add rule` within the panel region. Precondition, all three present: `role="menu"` `Add rule`, the `Workflow panel` region, `data-fullscreen="true"`.
      - Press with `user.keyboard('{Escape}')` at the focused element, never `fireEvent.keyDown(window, …)`: a window-dispatched event never reaches React's own `onKeyDown` handlers (`add-rule-menu.tsx:46-54`), so it tests a path the user does not take.
      - The real order is innermost first, each layer handling its own key (planner ruling 2026-10-04 Q1): press 1 is `AddRuleMenu`'s own handler (`add-rule-menu.tsx:48-53`, which already calls `preventDefault()` and `stopPropagation()`, so it needs no edit); presses 2 and 3 are the ladder, the panel and then full screen.
      - After press 1: the menu is gone, the region is present, `"true"`. After press 2: the region is gone, `"true"`. After press 3: `"false"`.
      - **Consumed:** a `window` bubble-phase spy, added AFTER the screen mounts (so it runs after the ladder's listener), records `event.defaultPrevented` for each Escape that reaches it. After presses 1–3 and a 4th press with nothing open, the record is exactly `[true, true, false]`. Press 1 never reaches it (the menu stops it); presses 2 and 3 arrive prevented by the ladder; the 4th arrives unprevented. This proves the spy is wired, and that a ladder with nothing open leaves the key alone. (planner ruling 2026-10-04 Q1)
    - **A prevented Escape is ignored** (the `Dialog` path: `dialog.tsx:71-114` closes on a `document` capture listener and calls `preventDefault()` without `stopPropagation()`, so its Escape reaches the ladder prevented): in full screen with the panel open, dispatch `const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); e.preventDefault(); document.body.dispatchEvent(e)`. The region is still present and `"true"`. (planner ruling 2026-10-04 Q1)
    - **A Popover closes alone** (the `Popover` path: react-aria's `useOverlay` Escape shortcut returns `undefined`, so `createKeyboardShortcutHandler` calls `preventDefault()` and does not continue propagation, `react-aria@3.52.1` `dist/private/interactions/createKeyboardShortcutHandler.mjs:110-119`): in full screen with the panel open, open the toolbar's Add transition popover and press Escape. The popover is gone, the region is present, `"true"`. (planner ruling 2026-10-04 Q1)
    - **Control:** with nothing open, a single Escape exits full screen.

    Kills: (a) the ladder lists `[fullScreen, panel]` (outermost first: press 2 exits full screen with the panel up); (b) drop the `!event.defaultPrevented` guard (the prevented-press leg); (c) drop the ladder's `preventDefault()` (the spy record reads `[false, false, false]`); (d) full screen left out of the ladder (the control). (planner ruling 2026-10-04 Q1)
  - **25.549:**
    - **opens on selection:** selecting a state opens the panel on the Selection tab with `StateInspector`; selecting a transition shows `TransitionInspector` (rules);
      - Precondition, in full screen before any selection: no `Workflow panel` region (the template draft's selection is `none`, `draft-store.ts:75`).
      - Click `findByTestId('state-node-doing')`. Within the region: the Selection tab is the current one (`aria-selected="true"` if the shared tab component is used, `aria-pressed="true"` otherwise), and the other three tabs are not; the `State name` textbox has the value `Doing`.
      - Select a transition (its Transitions row). Within the region: the heading `From <from name> to <to name>` of THAT transition (`transition-inspector.tsx:18`).
    - **the Issues badge** opens the Issues tab;
      - After × has closed the panel: the badge brings the region back with the Issues tab current, and `IssuesPanel`'s text inside the region.
    - **× closes it.**
      - × within the region: the region is gone.
    - **Both widths (spec §4.3):** the legs above run on the desktop stub (every query false). Repeat the canvas click with `PHONE_BOARD_QUERY` true: the region opens there too. One subscription serves both. (planner ruling 2026-10-04 Q5)
    - **Control:** outside full screen, the same canvas click renders no `Workflow panel` region (Step 3's rule: the drawer stays as it is). On the desktop stub, the drawer's `aside` keeps `data-open="false"`; this is 21.176's leg, which stays valid because it is outside full screen. (planner ruling 2026-10-04 Q5)

    Kills: (a) the panel open by default (precondition); (b) the Selection tab renders `StateInspector` for the first state rather than the selected one (`Doing`); (c) the badge opens the panel on the Selection tab; (d) `FloatingPanel` rendered outside full screen (control); (e) keep the `matchMedia(PHONE_BOARD_QUERY)` condition (`workflow-builder-screen.tsx:129`) on the full-screen arm too, so the floating panel opens on selection only on a phone (the desktop legs). (planner ruling 2026-10-04 Q5)
  - **25.550:** the panel is a `role="region"` labelled `Workflow panel`, not `dialog`. While it is open, the canvas section stays in the tab order (no `inert` / `aria-hidden` on it).
    - Same `it`: open the panel first (select a state), with the precondition that the region is present; otherwise every leg below passes against a closed panel.
    - `getByRole('region', { name: 'Workflow panel' })` is an `ASIDE` with no `aria-modal`; `queryByRole('dialog', { name: 'Workflow panel' })` is null.
    - `getByRole('region', { name: 'Canvas' }).closest('[inert], [aria-hidden="true"]')` is null. This checks the section AND its ancestors: `inert` on the layout wrapper hides the canvas too. (jsdom does not implement `inert` for focus, so a `.focus()` leg would prove nothing.)

    Kills: (a) `role="dialog"` on the panel; (b) `inert` on the canvas section while the panel is open; (c) `aria-hidden="true"` on `.workflow-builder-screen__layout` while the panel is open.

  Run. Expected: FAIL.

- [ ] **Step 2: Implement the ladder, full screen and the toolbar**
  - **`use-escape-ladder.ts`** (planner ruling 2026-10-04 Q1): one `keydown` listener on `window` in the BUBBLE phase, reading the layers from a ref (innermost first: `[panel, fullScreen]`). On `Escape` with `!event.defaultPrevented`, close the first open layer and call `preventDefault()`. Never `stopPropagation()`. A prevented Escape is left alone.
  - **Each inner layer handles its own Escape and marks it handled** (planner ruling 2026-10-04 Q1). Nothing is wrapped at the panel.
    - **The drag:** Task 1's `useDragEscape` stays as it is (window capture plus `stopPropagation`, `use-working-nodes.ts:75-93`), so the ladder never sees a drag's Escape.
    - **`AddRuleMenu`:** its handler already calls `preventDefault()` and `stopPropagation()` (`add-rule-menu.tsx:48-53`). No edit is needed; the one-line edit the ruling allows is not required on the ref.
    - **`Popover`** (`AddTransitionForm`, the More menu): react-aria's `useOverlay` Escape calls `preventDefault()` and stops propagation (`react-aria@3.52.1` `dist/private/interactions/createKeyboardShortcutHandler.mjs:110-119`).
    - **`Dialog`** (`StateMappingDialog`): closes on a `document` capture listener and calls `preventDefault()` without stopping the event (`packages/ui/src/components/dialog.tsx:71-114`). It reaches the ladder prevented, and the guard ignores it.
    - **The ladder's own layers:** the panel when open, then full screen when on.
  - **The More menu** (planner ruling 2026-10-04 Q6): there is no shared `Menu` component (`packages/ui/src/components` has `dialog`, `popover`, `segmented-control`, … and no menu; spec §4.2's "the shared `Menu`" names nothing real). Build it as the existing `Popover` (`@gisik-nokma/ui`) holding a `role="menu"` list of `role="menuitem"` buttons, following `AddRuleMenu`'s pattern (`add-rule-menu.tsx:46-110`: trigger `aria-expanded`, a named `role="menu"`, arrow-key stepping).
  - **Full screen:**
    - **state:** in `WorkflowBuilderScreen`, `fullscreen` state (initialised from sessionStorage) on the root `div`: `data-fullscreen={fullscreen ? 'true' : 'false'}` and `role={fullscreen ? 'region' : undefined}` with `aria-label="Workflow editor, full screen"`;
    - **header:** when on, the header renders the floating toolbar instead of the title row; when off, as today plus a "Full screen" button;
    - **corner:** a second "Full screen" button in the canvas corner `Panel`.
  - **CSS** (`/* G-9: T5 fullscreen */`):
    ```css
    .workflow-builder-screen[data-fullscreen="true"] { position: fixed; inset: 0; z-index: var(--gn-z-overlay); background: var(--gn-surface); padding: 0; gap: 0; }
    .workflow-builder-screen[data-fullscreen="true"] .workflow-builder-screen__layout { height: 100%; }
    .workflow-builder-screen[data-fullscreen="true"] .workflow-builder-screen__left { display: none; }
    .gn-wf-toolbar { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 5; display: flex; gap: 8px; align-items: center; }
    ```
    Grep `tokens.ts` / `ui.css` for the real overlay z-index and surface tokens; `--gn-z-overlay` is a placeholder name to be replaced by the real one.
    - In full screen the left column is hidden because the floating panel holds those panels.
    - In the normal layout nothing changes.

- [ ] **Step 3: `floating-panel.tsx`**
  - **Desktop:** an `aside` `role="region"` `aria-label="Workflow panel"`, absolutely positioned right, `width` from state (default 360, clamped 280–480). The drag handle on its left edge resizes it, and the width persists in sessionStorage `<key>:panelWidth`.
  - **Tabs:** Selection | States & transitions | System rules | Issues, using the existing tab component if `packages/ui` has one (grep `role="tablist"`); otherwise buttons with `aria-pressed`.
  - **Tab contents:**
    - **Selection:** `<StateInspector stateId>` or `<TransitionInspector index>` from the store's selection, or the text `Select a state or a transition`;
    - **States & transitions:** `<BuilderPanels />`;
    - **System rules:** `<SystemRulesPanel />`;
    - **Issues:** `<IssuesPanel />`.
  - **`phone` true:** the same content in a bottom sheet (fixed bottom, max-height 70vh, rounded top). Reuse the existing phone-drawer open-on-selection subscription in the screen, by moving it into `FloatingPanel`'s parent logic; do not duplicate it.
    - (planner ruling 2026-10-04 Q5, spec §4.3 wins) The one subscription (`workflow-builder-screen.tsx:126-131`) gains a full-screen arm. On a new non-`none` selection: in full screen, open the floating panel on the Selection tab at EVERY width; outside full screen, keep today's phone-only `setPanelsOpen(true)` (`:129`).
    - 21.176's desktop-negative leg (`test-cases/21-mobile-web.md:160`, `phone-builder-hooks.test.tsx`) runs outside full screen, so it stays as it is. T5 adds to that catalogue line that in full screen the floating panel opens at both widths (25.549). This is so the two lines do not read as contradicting each other.
  - **The rule:** in full screen the floating panel replaces the drawer. Outside full screen the existing drawer stays exactly as it is.

  Run the unit tests. Expected: PASS 25.545–25.550.

  Commit.

- [ ] **Step 4: Browser cases** (`fullscreen.spec.ts`)
  - **25.551:** desktop.
    - **Covers the window:** enter full screen; the screen's bounding box equals the viewport (0, 0, w, h).
      - Precondition: before entering, the box is NOT (0, 0, w, h). The harness `body` keeps its default 8 px margin (`harness/index.html`); if a later harness change makes the normal layout cover the window too, this leg proves nothing.
    - **Carries over (spec §4.1, no re-fit):** the `.react-flow__viewport` `transform` read just before entering equals the one read just after (±0.5 px on translate).
    - **Every toolbar control works:**
      - (Each one is clicked inside `.gn-wf-toolbar` and has its own observable.)
      - rename via the name field;
        - The draft in sessionStorage has `def.name` equal to the typed text.
      - Add state adds a node;
        - `.react-flow__node` count is exactly +1.
      - Add transition adds an edge;
        - Use a pair that does not exist yet; `.react-flow__edge` count is exactly +1.
      - zoom in changes the viewport scale;
        - The `scale(...)` in `.react-flow__viewport`'s transform is strictly greater.
      - Tidy;
        - First drag two states onto each other with `dragBy`. After Tidy, "Undo tidy" is visible and no two `.react-flow__node` boxes overlap (25.541's check).
      - the Issues badge opens the Issues tab;
        - The Issues tab is current and `IssuesPanel`'s text is inside the `Workflow panel` region.
      - Publish opens its flow (the fake gateway accepts);
        - The banner reads `Version 1 published.` (`publish-controls.tsx:296`; a template draft has `base === null`).
      - Exit restores the normal layout.
        - `data-fullscreen="false"`, and the box equals the precondition's box (±1).

    Kills: (a) drop `inset: 0` (or `position: fixed`) from the T5 CSS block (cover leg); (b) key the layout on `fullscreen` (`<div key={String(fullscreen)}>`), so the canvas remounts and re-fits (carries-over leg); (c) the toolbar's Tidy wired to nothing (the Undo tidy leg); (d) the badge opens the Selection tab.
  - **25.552:** read-only (`?role=member` or whatever role `canAuthorRole` refuses; read it). Full screen is available, and there is no Add state, Add transition or Tidy.
    - `canAuthorRole` is `owner || admin` (`builder-context.tsx:20-22`), so `openHarness(page, { role: 'member' })` works.
    - **Control first, same `it`:** with `openHarness(page)` (owner) in full screen, `Add state`, `Add transition` and `Tidy` each count ≥ 1, which proves the locators.
    - **Member:** the "Full screen" button exists and clicking it gives `data-fullscreen="true"`. The three locators each count 0 on the whole page: the toolbar, the canvas corner and (when present) the opened More menu.

    Kills: (a) render the Full screen buttons only when `canAuthor`; (b) the toolbar or More menu mounts its own "Tidy" `Button` instead of `TidyControl` (whose guard is `tidy-control.tsx:121`) without a `canAuthor` check.
  - **25.553:** a drag inside full screen works live (25.500's assertion, re-run in full screen).
    - Assert before `mouse.up()`: the box moved 192–204 px, and `edgePath(page, 0)` changed (`drag.spec.ts:26-35`).

    Kills: (a) a full-screen CSS rule that puts `transform` or `zoom` on `.workflow-builder-screen[data-fullscreen="true"]` (the box no longer tracks the pointer 1:1). Otherwise this guards existing behaviour (T1's live drag).
  - **25.554:** phone 390×844 with `hasTouch`.
    - **Toolbar:** it shows name, Add state, Add transition, Publish, More and Exit.
      - Exactly these are visible in `.gn-wf-toolbar`. Tidy, the zoom buttons and the Issues badge are not visible in the row.
      - After tapping More, the opened menu holds the zoom buttons, Tidy and the Issues badge (Issues folds at phone width only, matching 25.547). (planner ruling 2026-10-04 Q2)
    - **Bottom sheet:** a tap on a state opens it with the Selection tab.
      - The `Workflow panel` region's box: its bottom is 844 (±1) and its width is 390 (±1), not the 280–480 aside. Its height is ≤ 0.7 × 844 + 1. The tapped state's `State name` value is inside it.
    - **Touch drag:** a touch drag (`page.touchscreen` cannot drag; use `page.dispatchEvent` pointer events with `pointerType: 'touch'`, or `locator.dispatchEvent('pointerdown'…)` sequences, checking React Flow's handler first) moves the state live.
      - Assert before `pointerup`: the box moved by the dragged distance ±6, and `edgePath(page, 0)` changed.

    Kills: (a) the phone sheet replaced by the desktop aside (width leg); (b) the phone arm does not fold (Tidy visible in the row); (c) the sheet does not open on selection on a phone (the open-on-selection logic not reached under `phone`); (d) Issues not folded at `PHONE_BOARD_QUERY` (the Issues badge stays in the row) (planner ruling 2026-10-04 Q2). The touch-drag leg guards existing behaviour (T1 drag under `pointerType: 'touch'`).
  - **25.555:** the Escape ladder in the real browser: open the More menu, press Escape (only the menu closes), Escape (the panel closes), Escape (full screen exits).
    - The More menu exists only at narrow widths (25.547), so run at a viewport that `STACKED_QUERY` (64rem) matches and `PHONE_BOARD_QUERY` (40rem) does not (for example 700×800). (planner ruling 2026-10-04 Q2)
    - Open the panel first by clicking a state; precondition: the menu, the region and `data-fullscreen="true"` are all present.
    - After each press, assert the layers that must remain are still there. After press 1: the region and `"true"`. After press 2: `"true"`.

    Kills (planner ruling 2026-10-04 Q1): (a) the ladder lists `[fullScreen, panel]` (press 2 exits full screen with the panel up); (b) the More menu built as a bare list without the `Popover` (no Escape handler of its own: press 1 reaches the ladder unprevented, the panel closes and the menu stays); (c) drop the ladder's `!event.defaultPrevented` guard (press 1 closes the menu AND the panel).
  - **25.556:** a reload in the same tab keeps full screen on (sessionStorage).
    - ⚠ The harness mints a fresh def id on every load (`harness/main.tsx:23` → `draftFromTemplate` → `cloneTemplate`'s `newUlid()`, `templates.ts:69`). The screen keys on that id (`workflow-builder-screen.tsx:81`), so as the harness stands, a reload reads a different key and this case cannot pass. See the report's QUESTIONS; the harness needs a stable draft id first.
    - **Harness change, T5** (planner ruling 2026-10-04 Q3): `harness/main.tsx` declares `const HARNESS_DRAFT_ID = 'harness-draft'`. With `?stableDraft=1` it uses `{ ...draft, def: { ...draft.def, id: HARNESS_DRAFT_ID } }` as `initialDraft`; without it, it keeps today's fresh id.
      - It is OPT-IN because an unconditional fixed id would make every second `openHarness` in one test restore the first one's stored draft (E5-41, `workflow-builder-screen.tsx:94-96`). That breaks `collision.spec.ts:285` (25.526, re-opens expecting the seeded layout) and `tidy-transition.spec.ts:65` (25.541, "from a fresh seeded layout", whose control asserts the seeded overlap).
      - 25.556 opens `/?stableDraft=1&…` and `page.reload()` keeps the query.
    - **Control, same `it`:** exit, reload, and full screen is off.

    Kills: (a) initialise from `false` instead of sessionStorage; (b) exit not written (control); (c) the harness ignores `stableDraft` and mints a fresh id on each load (the reload leg reads another key) (planner ruling 2026-10-04 Q3).

  Run. Expected: PASS.

  Commit.

- [ ] **Step 5: Help, catalogue, mutations, DONE**
  - **`docs/manual.md`:** in the workflow-builder section, add "Full screen" and "Add transition" paragraphs in the manual's voice (read the neighbouring paragraphs). Run `pnpm check:help`.
  - **Features §22:** replace `<!-- G-9 bullet -->` with the final ✅ bullet naming every G-9 behaviour and file.
  - **Catalogue:** ✅ lines for 25.545–25.556, with these mutations:

    | Case | Mutation |
    |---|---|
    | 25.545 | focus not moved |
    | 25.546 | storage key not read |
    | 25.548 | the ladder's layers listed outermost first (`[fullScreen, panel]`); the `!event.defaultPrevented` guard dropped (planner ruling 2026-10-04 Q1) |
    | 25.550 | `role="dialog"` |
    | 25.552 | the Full screen buttons rendered only when `canAuthor`; the toolbar or More menu mounting its own "Tidy" `Button` instead of `TidyControl` without a `canAuthor` check (planner ruling 2026-10-04 Q4) |
    | 25.554 | phone sheet replaced by the desktop aside |

  - 25.557–25.559 are reserved and unused.
  - Sweeps (`ui.css` ⇒ ui + app-core + web WHOLE), checks, the browser suite.

  **Prose to sweep:** this task makes these lines false. All were read on `origin/release/knowledge-graph`.
  - `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx:104-106`: the column "is a bottom sheet opened from the "Panels" button. Above 40rem … this state paints nothing". In full screen the floating panel and the phone sheet replace it.
  - `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx:122-125`: "a NEW selection opens the sheet … above 40rem the column is always on screen". The subscription moves (Step 3), and in full screen the column is `display: none` at every width.
  - `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx:216-222`: "The prototype's header is one row carrying the title on the left and the actions on the right". In full screen the header renders the floating toolbar instead.
  - `Features.md:3709`: "Not yet: Tidy, Add transition and full screen (G-9 T4, T5; T5's final G-9 bullet absorbs this one)". It is already stale for Tidy and Add transition (`Features.md:3732`), and false after T5.
  - `Features.md:3731`: the `<!-- G-9 bullet -->` placeholder (Step 5 replaces it).
  - `Features.md:2738`: "the right-hand inspector rail (… the "Select a state or a transition…" hint) is gone". The floating panel is a right-hand panel again, carrying `Select a state or a transition` (Step 3).
  - `Features.md:3618`: "the States / Transitions / System rules / Issues column becomes a bottom sheet opened by a **Panels** button (… above 40rem the column is always on screen …)". In full screen the floating panel or sheet replaces the column.
  - `docs/manual.md:1436-1444`: "The left-hand column lists everything … On a wide screen the column stays beside the canvas". This is false in full screen. Qualify it next to the new Full screen paragraph.
  - `test-cases/25-smoothness.md:359`: the `<!-- G-9 T5 -->` marker; the 25.545–25.556 lines go under it.
  - `test-cases/21-mobile-web.md:160`: 21.176, "with the window above 40rem a canvas selection leaves `panelsOpen` false". This stays true outside full screen, but in full screen the floating panel opens at both widths (25.549). Qualify the line. (planner ruling 2026-10-04 Q5)
  - `docs/superpowers/specs/2026-10-03-workflow-canvas-design.md:127`: "fold into a **More** menu (the shared `Menu`)". There is no shared `Menu`; the More menu is a `Popover` and a `role="menu"` list. (planner ruling 2026-10-04 Q6)
  - (Checked, still true under ruling Q1, so NOT listed: `use-working-nodes.ts:71-73`, where the drag keeps its own capture listener; and `add-rule-menu.tsx:39-45`, where the menu still consumes its own Escape.)

  Push. DONE + REVIEW (`NEEDS: browser`, desktop + 390 px).

---

## Self-review (writing-plans §Self-Review, done 2026-10-03 against the spec)

**1. Spec coverage**

| Spec section | Tasks |
|---|---|
| §1 root cause | T1 steps 3–4 (RED) |
| §2.1 | T1 steps 5–7 |
| §2.2 | T1 step 8 |
| §2.3 threshold, Escape, pointer | T1 steps 7 and 9 |
| §2.3 memoised nodes | T1 step 7 |
| §3.1 | T2 + T3 steps 2–3 |
| §3.2 | T2 + T3 |
| §3.3 | T3 step 4 |
| §3.4 | T3 step 5 |
| §3.5 | T4 |
| §4.1–4.3 | T5 |
| §4.4 | T4 |
| §4.5 | T5 step 3/4 |
| §4.6 | T4 header + T5 normal layout |
| §5.1 | per-task sub-blocks |
| §5.2 | T1 |
| §5.3 | T1/T3/T4/T5 browser specs |
| §5.4 | unit tests in T1–T5 |
| §5.5 | T1 step 10 |
| §5.6 | T1/T5 Features, T5 help |
| §6 | file map |

No gaps.

**2. Placeholders**
- **CSS token names:** marked explicitly as "grep the real token". The plan cannot know them without reading `tokens.ts`, and each step names the grep.
- **Package version ranges:** copied from named files, not invented.
- **No "TBD"** remains.

**3. Type consistency:** these names are used identically across tasks:
- `useWorkingNodes`, `mergeDraftNodes`;
- `snapPosition` and its result shape, `Guide`;
- `clampToAvoidOverlap(target, size, obstacles, lastValid, gap)`;
- `UNMEASURED_NODE` (exported from `flow-graph.ts` in T3);
- `setPositions`, `transitionExists`, `useEscapeLadder`.

**4. Review focus:** each of the five lines has its case in the owning task: 25.503 (T1), 25.512/25.523 (T2/T3), 25.504 (T1), 25.548 (T5), 25.538/25.552 (T4/T5).

## Execution handoff

Execution follows the gisik orchestration: the orchestrator dispatches each task to a lane as one fresh session, with reviewers A/B and `ctl gate`, landing into `release/smoothness`.
- **Order:** T1 ∥ T2 → T3 ∥ T4 → T5.
- **Pointers:** each pointer carries `NEEDS: browser` for T1, T3, T4 and T5.
- **Reviewer focus:** the Review Focus lines.
