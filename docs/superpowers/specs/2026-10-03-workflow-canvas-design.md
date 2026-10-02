# Workflow canvas: live drag, collisions, full-screen editing (G-9) — design

**Date:** 2026-10-03.

**Release:** `release/smoothness` (task G-9; owner: "Join release/smoothness").

**Status:** owner approved the four design sections in conversation on 2026-10-03; this file is the written spec for review.

**Owner's words:**
- "The canvas experience is not really great currently. I cannot see the states being dragged."
- "Check out the Diagram module of the Knowledgebase project of how to handle drags and collisions."
- "Fix on react flow. Also allow for full screen editing of the workflow in the canvas. with adding states, transitions and adding rules, names and all other controls."

**Decisions taken in conversation:**
- **Scope:** "Rework the canvas feel" — free placement and arrows stay.
- **Approach:** fix on React Flow.
- **Full screen:** "Canvas fills the window."
- **Browser tests:** on the local gate.
- **Release:** join `release/smoothness`.

**Assumptions** (not stated by the owner; correct them at review):
- desktop first, phone must work;
- positions stay session-only (case 10.53 stays 🚫);
- no change to the workflow model (states, transitions, rules, publish).

## 1. Root cause (read in the library source; proven by case 25.500 before any fix)

- **How the canvas is built:** `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx` renders `<ReactFlow nodes={nodes} …>`, with `nodes` recomputed from the draft (`useMemo(() => toFlowGraph(draft, summaryCtx), …)`, `:41`).
- **What it listens to:** only `onNodeDragStop` (`:51-57`) → `store.actions.moveState`. There is no `onNodesChange` and no `defaultNodes`.
- **What React Flow does during a drag** (`@xyflow/react` 12.11.6): it reports positions through `updateNodePositions` → `triggerNodeChanges` (`dist/esm/index.mjs:3504-3561`). That function applies the changes only when `hasDefaultNodes`, and otherwise calls `onNodesChange?.(changes)`. With neither present, every position change of the drag is dropped.
- **The result:** the state stays where it was for the whole gesture, the arrows do not follow, and on release the node jumps to the drop point, because `onNodeDragStop` saves it and the draft re-renders.
- **Why no test saw it:**
  - `canvas.test.tsx:268-308` records that jsdom lands a zero-delta drag, and asserts only that `moveState` is called;
  - the only real-browser canvas spec (`apps/web/e2e-stack/builder-canvas.spec.ts`, 13.911) checks visibility, and is not on the local gate.

## 2. Live drag and how it looks

### 2.1 A working copy of the nodes
`WorkflowCanvas` keeps a `workingNodes` state, seeded from `toFlowGraph(draft)`.
- **`onNodesChange`** applies changes with React Flow's `applyNodeChanges`:
  - position changes while `dragging: true`;
  - selection and dimension changes always.
- **When the draft changes** (add, delete, rename, Tidy, publish reset), `workingNodes` is re-derived from it, keeping the in-flight position of the node being dragged, if any. A draft change mid-drag therefore never snaps the dragged node back, and never loses a state added meanwhile.
- **On drop**, the final position, after snapping and the collision check (§3), is committed with `moveState` exactly once. The draft stays the single source of truth for everything except the gesture in progress.

### 2.2 The lifted look
While a node has `dragging`:
- it renders above every other node (React Flow raises the dragged node's z-index; CSS gives `.react-flow__node.dragging` the highest stacking);
- it gets a deeper shadow (the elevation token one step up);
- it scales to 1.02, with the transform on the inner `.gn-state-node`, so React Flow's positioning transform is untouched;
- the cursor is `grabbing` (`grab` on hover).

Other states and arrows keep full strength (the Knowledgebase module's dimming is not copied).

### 2.3 The gesture
- **Drag threshold:** `nodeDragThreshold={4}` (px), so a click selects without moving.
- **Escape during a drag** restores the node's start position into `workingNodes`, ends the drag and commits nothing. A keydown listener is active only while a drag is in progress.
- **Pointer handling:** pointer events and pointer capture come from React Flow's drag (`XYDrag`), so mouse, pen and touch behave the same, and releasing outside the window ends the drag.
- **Re-renders:** `StateNode` and `AnyStateNode` are memoised on their data, so a drag re-renders only the dragged node and its edges.

## 3. Collisions, snapping, keyboard, Tidy

### 3.1 Collision check
This is a new pure module, `packages/app-core/src/workflow-builder/collision.ts`, ported from the Knowledgebase app (`knowledge-base/src/app/knowledge_base/features/diagram/utils/collisionUtils.ts:16-81`, `rectsOverlap` + `clampToAvoidOverlap`).
- **Rects:** a node's rect is its position plus its measured width and height (React Flow's `node.measured`).
- **Obstacles:** every other node, the any-state node included, inflated by `NODE_GAP = 8`. They are snapshotted at drag start.
- **`clampToAvoidOverlap(target, size, obstacles, lastValid)`** works in three steps:
  1. **Fast path:** if `target` overlaps nothing, return it.
  2. **Edge candidates:** build candidate x values from each obstacle's left/right exclusion edges, and y values likewise. Test every combination, and return the valid one nearest `target`.
  3. **Fallback:** if no combination is valid, binary-search (20 steps) along `lastValid → target` for the furthest valid point.
- **Behaviour:** the dragged state slides along the edge of the one it meets. Neighbours never move.
- **Blocked:** when the clamped position differs from the snapped target, a dashed outline of the state, at 40% opacity and `aria-hidden`, is drawn at the snapped target. It is removed on drop.
- **Arrows** follow the clamped (real) position.

### 3.2 Snapping order (every pointer move)
1. **Raw pointer position.**
2. **Alignment guides.** For each other node, compare the dragged node's left, centre-x and right with that node's, and top, centre-y and bottom likewise. A match within 6 screen px (`6 / zoom` in flow units) snaps that axis. A 1 px guide line is drawn across the visible canvas in the accent colour, at most one vertical and one horizontal guide.
3. **Grid.** On any axis not snapped by a guide, snap to `GRID = 16`.
4. **Collision check** (§3.1). If the check moves an axis off its guide, that guide is hidden.

Holding **Alt** skips steps 2 and 3 for that move. Snapping runs inside `onNodesChange`, on the position change, before it is applied.

### 3.3 Keyboard
- **Moves:** with a state focused, **Arrow** moves it one `GRID` step, and **Alt+Arrow** moves it 1 px. Each nudge goes through the collision check (§3.1), with the obstacles computed fresh, and commits with `moveState`.
- **Blocked nudge:** it leaves the state in place and announces "Blocked by <state name>" in a polite live region.
- **React Flow's own arrow move must not bypass the collision check.** It moves selected nodes by its own step, outside our pipeline.
  - **Requirement:** every arrow nudge, whoever handles the key, ends in a position that passed §3.1 and moved by exactly `GRID` or 1 px.
  - **Left to the plan:** which mechanism, read against the library at plan time. Either intercept the key before React Flow, or route keyboard position changes through the same `onNodesChange` pipeline.
  - **Constraint:** node focus and Enter/Space selection, React Flow's keyboard accessibility, stay.

### 3.4 New states
`addState` places the new state at the nearest free grid point to the centre of the current viewport. It searches outward in grid steps, using the collision check, and replaces `nextFreePosition` for interactive adds. Templates keep `layoutDraft`.

### 3.5 Tidy
- **What it does:** a Tidy button re-runs `layoutDraft(def)` (`layout.ts`) for all states, then passes each position through the collision check (states larger than `COLUMN_WIDTH`/`ROW_HEIGHT` could overlap). It commits the whole result in one store action, `setPositions`.
- **Undo:** an "Undo tidy" button shows for 10 s (an inline toast) and restores the previous `positions` object. It goes away on any other position change.
- **No other undo is added.**

**Out of scope:** multi-state drag, pushing neighbours aside, saving positions across sessions (10.53 stays 🚫), and orthogonal edge routing.

## 4. Full-screen editing

### 4.1 Entering and leaving
- **Where the button is:** a **Full screen** button sits in the builder header actions and in the canvas's corner panel.
- **What full screen is:** `WorkflowBuilderScreen` renders its layout inside `div.workflow-builder-screen[data-fullscreen="true"]`, which CSS fixes at `inset: 0`, above the app shell (`z-index` from the overlay scale, not the modal scale). The app nav and header are covered, not unmounted.
- **What carries over:** `BuilderProvider`, the draft store, selection and the React Flow instance stay mounted. Zoom and pan carry over, and the canvas does not re-fit on entry or exit.
- **Remembered:** the on/off state is kept for the session, in `sessionStorage` under the draft's storage key plus `:fullscreen`.
- **The Escape ladder** (one key press closes one layer):
  1. a drag in progress, cancelled (§2.3);
  2. an open menu, popover or dialog;
  3. the floating panel;
  4. full screen.
- **Focus:** on entering, focus moves to the toolbar's first control. On exiting, it returns to the button that entered.

### 4.2 Floating toolbar
One row, top centre, over the canvas. It uses the existing components:
- the workflow name (`WorkflowNameField`);
- Add state (`AddStateButton`);
- **Add transition** (new, §4.4);
- zoom out, zoom in, Fit to screen;
- Tidy;
- an Issues badge (the error count, opening the panel's Issues tab);
- Publish (`PublishControls`, the state-mapping dialog included);
- **Exit full screen**.

On narrow widths, the zoom controls and Tidy fold into a **More** menu (the shared `Menu`).

### 4.3 Floating panel
- **Where:** a right-hand panel inside the canvas, resizable between 280 and 480 px. Its width is remembered for the session.
- **When it opens:** on selecting a state or transition, or on the Issues badge. It closes with × or Escape.
- **Tabs** (the existing components, unchanged in behaviour):
  - **Selection:**
    - for a state, `StateInspector`: name, Start, Delete;
    - for a transition, `TransitionInspector`: rules (add / edit / remove via `AddRuleMenu` and the rule editors) and Delete.
  - **States & transitions:** `BuilderPanels`, selecting by name.
  - **System rules:** `SystemRulesPanel`.
  - **Issues:** `IssuesPanel`.
- **Accessibility:** a labelled `region`, not a modal, so the canvas stays usable while it is open.

### 4.4 Add transition (new control, in both layouts)
- **The form:** a popover with two `Select`s — From (states plus "Any state") and To (states) — and an Add button. It calls the existing `store.actions.addTransition(from, to)`.
- **When Add is disabled:** when the pair already exists, or when From equals To and self-loops are not allowed (whatever `addTransition`'s validation refuses). The reason is shown inline.
- **After Add:** the new transition is selected, so the panel shows its rules.

### 4.5 Phone (full screen)
- **Toolbar:** name, Add state, Add transition, Publish, More (zoom, fit, Tidy, Issues), Exit.
- **Panel:** a **bottom sheet** with the same tabs. It opens on selection, reusing the phone rule already in `workflow-builder-screen.tsx`, where a selection opens the panels on `PHONE_BOARD_QUERY`.
- **Dragging:** touch drag works as on desktop, through pointer events.

### 4.6 Normal layout
Unchanged, except that the header gains Full screen, Tidy and Add transition.

## 5. Testing and proof

### 5.1 Case block
Cases **25.500–25.559** (G-9), in `test-cases/25-smoothness.md`. 25.500–25.559: G-7 (task/smoothness-g7-phone-editors, FIX 1 5d8907dd) took 25.440–25.442, so G-9 shifted +60 on the orchestrator's grep of every origin task/release/docs branch (25.500–25.599 free, 2026-10-03 01:36). Each case's test carries its id.

### 5.2 RED first: 25.500
- **Suite:** a Playwright spec in `apps/web/e2e` (mock-only, Chromium), `workflow-canvas-drag.spec.ts`.
- **Steps:** press on a state, move 200 px in 10 steps, and **before release** assert:
  - the node's bounding box moved 200 ± 4 px;
  - the attached edge's `d` attribute changed.

  Then release, and assert the position persisted in the draft (`sessionStorage`).
- **Control in the same `it`:** a press-release without movement selects and does not move.
- **Must fail on the current code** before §2 lands.

### 5.3 Browser cases
Same suite; desktop, and a phone viewport with `hasTouch`:
- Escape mid-drag restores the start position;
- a blocked drag stops at the 8 px gap, shows the dashed outline at the pointer, and drops at the clamped spot;
- an alignment guide appears, and the snap is exact;
- Alt-drag places the state unsnapped;
- keyboard nudge, and a blocked nudge announces;
- Tidy, then Undo tidy, restores positions exactly;
- full screen: enter and exit, every toolbar control works, the Escape ladder order, focus on entry and return on exit, the state persisting across a reload in the same session;
- Add transition by form, including from Any state, and refusing a duplicate;
- phone: the collapsed toolbar, the bottom sheet opening on selection, and a live touch drag.

### 5.4 Unit cases (vitest, `packages/app-core/test/workflow-builder/`)
- `collision.ts`: a free target, an edge slide, a corner, the no-candidate binary search, the gap, and that the any-state node counts as an obstacle;
- the snapping pipeline: guide beats grid, the collision check hides the guide, Alt skips snapping, the guide threshold scales with zoom;
- the working-copy reducer: a draft change mid-drag keeps the dragged position and does not lose an added state; commit happens once on drop;
- nudge blocking and its message;
- `addState` free placement;
- Tidy, and Undo tidy within and after 10 s;
- the full-screen state: the Escape ladder, session memory, focus return;
- the Add transition validation mirroring `addTransition`.

### 5.5 On the gate
- The canvas specs (`apps/web/e2e/workflow-canvas-*.spec.ts`, Chromium) become a turbo task (`@gisik-nokma/web#test:e2e:canvas`), added to the local `ctl gate` set (owner: "Yes, on the gate"). Estimated cost: +~1 min and ~300 MB per gate.
- They also run in CI on the release PR.
- Each case gets a named post-commit mutation (e.g. remove `onNodesChange` → 25.500 red; drop the gap → the gap case red; skip Alt → the Alt case red).

### 5.6 Catalogue, review and docs
- **Features.md §22** gets bullets for live drag and its feedback, collision and snapping, keyboard nudge, Tidy, full-screen editing, and Add transition.
- `test-cases/10-workflow-builder.md` 10.53 stays 🚫, with its reason unchanged.
- The help manual's workflow-builder section gains the full-screen and Add-transition steps (`check:help`).
- The reviewer brief carries `NEEDS: browser`. The reviewer measures the paint on desktop and at 390 px.

## 6. Files (expected)

| File | Change |
|---|---|
| `packages/app-core/src/workflow-builder/collision.ts` | new (§3.1) |
| `packages/app-core/src/workflow-builder/snap.ts` | new (§3.2) |
| `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx` | working copy, `onNodesChange`, Escape, nudge, guides, outline (§2–3) |
| `packages/app-core/src/workflow-builder/ui/state-node.tsx`, `any-state-node.tsx` | memoised; lifted look |
| `packages/app-core/src/workflow-builder/draft-store.ts` | `setPositions`; free placement in `addState` |
| `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx` | full screen, toolbar, panel, the Escape ladder |
| `packages/app-core/src/workflow-builder/ui/add-transition-form.tsx` | new (§4.4) |
| `packages/app-core/src/workflow-builder/ui/floating-panel.tsx` | new (§4.3) |
| `packages/ui/src/ui.css` | `[data-fullscreen]`, toolbar, panel, the dragging look, guides, outline (pre-seeded G-9 block, plan #21) |
| `apps/web/e2e/workflow-canvas-*.spec.ts` | new |
| `apps/web/package.json`, `turbo.json`, `scripts/ctl` gate set | the `test:e2e:canvas` task on the gate |
| `test-cases/25-smoothness.md`, `Features.md` §22, `docs/manual.md` | catalogue and help |

## 7. Risks

- **The working copy diverging from the draft.** Mitigation: it is re-derived on every draft change, and the unit cases in §5.4 pin the merge.
- **Escape conflicts with existing handlers** (the panels drawer, dialogs). Mitigation: a single ladder owner in the screen, plus the browser case in §5.3.
- **Gate time and RAM.** Mitigation: Chromium only, mock-only; it runs under the machine-wide test slot once `ctl run-tests` lands.
- **The phone bottom sheet versus the existing drawer.** Mitigation: reuse the drawer's open-on-selection rule; one component for both.
