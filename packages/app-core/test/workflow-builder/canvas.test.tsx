import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no
// default export that survives `verbatimModuleSyntax` — same fix already
// settled at packages/app-core/test/views/board.test.tsx. The plan's Task 5
// snippet still carries the default spelling.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import type { StatePosition } from '../../src/workflow-builder/layout.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.js';
import { WorkflowCanvas } from '../../src/workflow-builder/ui/workflow-canvas.js';
import { ruleExactly, valueOf, readUiCss } from '../../../ui/test/helpers/css-rules.js';

const errand = WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!;

export function testEnv(overrides: Partial<BuilderEnvironment> = {}): BuilderEnvironment {
  return {
    workspaceId: newUlid(),
    session: { userId: newUlid(), role: 'admin' },
    gateway: createFakeGateway(),
    members: [],
    ticketTypes: [],
    canAuthor: true,
    ...overrides,
  };
}

function renderCanvas(store: DraftStore, env = testEnv()) {
  return render(
    <BuilderProvider store={store} env={env}>
      <WorkflowCanvas />
    </BuilderProvider>,
  );
}

describe('WorkflowCanvas', () => {
  /**
   * 10.1 — states render as nodes with name, category, blocked flag, and a start marker.
   */
  it('renders every state as a node with its name', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    for (const name of ['Later', 'Next', 'In progress', 'Waiting', 'Done']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('shows the initial-state marker on the start state only', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    const start = screen.getByTestId('state-node-later');
    expect(within(start).getByText('Start')).toBeInTheDocument();
    expect(within(screen.getByTestId('state-node-done')).queryByText('Start')).not.toBeInTheDocument();
  });

  it('checks the blocked checkbox exactly on blocked-flagged states', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    expect(
      within(screen.getByTestId('state-node-waiting')).getByRole('checkbox', { name: 'Blocked' }),
    ).toBeChecked();
    expect(
      within(screen.getByTestId('state-node-in-progress')).getByRole('checkbox', { name: 'Blocked' }),
    ).not.toBeChecked();
  });

  /**
   * 10.2 — the category picker on a node edits the def.
   */
  /**
   * 10.84 — the canvas node's Category picker renders as the shared Select (button trigger, portal panel) instead of a native `<select>` — the only call site embedded in a React Flow node.
   */
  it('changes a state category through the node picker', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    const node = screen.getByTestId('state-node-done');
    await user.click(within(node).getByRole('button', { name: /Category/ }));
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: 'active' }));
    expect(store.getState().def.states.find((state) => state.id === 'done')?.category).toBe('active');
  });

  /**
   * Canvas-embedding-specific: the Category picker lives inside a React Flow
   * node whose own onClick selects the node. `Select` has no className/onClick
   * passthrough (see state-node.tsx), so nodrag and stopPropagation both move
   * onto a wrapping <div> instead of the interactive element itself. These two
   * tests assert the click that opens the picker, and a click on its label,
   * do not ALSO select the node — mutation-tested (see task report) so each
   * one is pinned to the mechanism it actually exercises, not the one its
   * name suggests:
   *
   * - Clicking the Select's own trigger button: STAYS GREEN with the
   *   wrapper's onClick stopPropagation removed. react-aria's `useSelect`
   *   button already stops propagation of the click it handles by default
   *   (documented behavior: interaction hooks don't bubble unless the handler
   *   calls `continuePropagation()`, which `Select` doesn't). So this case
   *   witnesses react-aria's own isolation, not the wrapper's onClick.
   * - Clicking the "Category" label text instead of the button: this is the
   *   one that actually exercises the wrapper's onClick — plain React
   *   bubbling, no library involved, and REDDENS when that handler is
   *   removed (confirmed by mutation test). `{ selector: 'span' }` is
   *   load-bearing: react-aria's `HiddenSelect` renders its own hidden
   *   `<label>Category</label>` for native-select semantics, and `getByText`
   *   (unlike `getByRole`) doesn't respect that it's inert — same collision
   *   already documented in select.tsx's multi-select branch.
   *
   * Neither test exercises `nodrag` — jsdom does no layout, so no React Flow
   * drag gesture is ever live here. That claim is proven separately: with
   * `nodrag` removed, BOTH these tests still pass, but the REWRITTEN case
   * above ("changes a state category through the node picker") starts
   * failing — `findByRole('listbox')` times out, the picker never opens at
   * all. So `nodrag`'s necessity is real and proven here, just not by either
   * of these two tests: empirically by that mutation, and structurally by
   * reading node_modules/@xyflow/system's hasSelector(), which walks the DOM
   * ancestor chain (parentElement) checking `.matches(selector)` at each
   * level exactly like Element.closest() — so a wrapping-element `nodrag`
   * class is checked the same as one on the exact target. See the task
   * report for exact source lines and the full mutation-test transcript.
   */
  /**
   * 10.85 — clicking the Select's own trigger does not also select the node — driven by react-aria's own default propagation-stopping, not the wrapper's onClick.
   */
  it('clicking the category picker does not also select the node', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    const node = screen.getByTestId('state-node-done');
    await user.click(within(node).getByRole('button', { name: /Category/ }));
    expect(store.getState().selection).toEqual({ kind: 'none' });
  });

  /**
   * 10.86 — clicking the "Category" label text (not the button) does not select the node either — the case that actually proves the wrapping `<div>`'s onClick stopPropagation.
   */
  it('clicking the Category label does not select the node', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    const node = screen.getByTestId('state-node-done');
    await user.click(within(node).getByText('Category', { selector: 'span' }));
    expect(store.getState().selection).toEqual({ kind: 'none' });
  });

  /**
   * 10.3 — the blocked checkbox toggles the amendment-9 flag; unchecking removes the key rather than storing false.
   */
  it('toggles the blocked flag through the node checkbox', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    await user.click(
      within(screen.getByTestId('state-node-in-progress')).getByRole('checkbox', { name: 'Blocked' }),
    );
    expect(store.getState().def.states.find((state) => state.id === 'in-progress')?.blocked).toBe(true);
  });

  /**
   * 10.134 — starting-status design (2026-09-23): unchecking "Tickets can start here" writes `creatable: false` on the state.
   */
  it('unchecking "Tickets can start here" writes creatable: false on the state', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    await user.click(
      within(screen.getByTestId('state-node-next')).getByRole('checkbox', { name: 'Tickets can start here' }),
    );
    expect(store.getState().def.states.find((state) => state.id === 'next')?.creatable).toBe(false);
  });

  /**
   * 10.135 — re-checking "Tickets can start here" removes the key rather than storing creatable: true, mirroring the blocked checkbox's own asymmetry (10.3).
   */
  it('re-checking "Tickets can start here" removes the creatable key rather than storing true', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    store.actions.setStateCreatable('next', false);
    renderCanvas(store);
    await user.click(
      within(screen.getByTestId('state-node-next')).getByRole('checkbox', { name: 'Tickets can start here' }),
    );
    expect('creatable' in (store.getState().def.states.find((state) => state.id === 'next') ?? {})).toBe(false);
  });

  /**
   * 10.136 — "Tickets can start here" is disabled, with a title, on a terminal state — a done state can never be a starting status regardless of the flag.
   */
  it('disables "Tickets can start here" on a terminal state, with an explanatory title', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    const checkbox = within(screen.getByTestId('state-node-done')).getByRole('checkbox', {
      name: 'Tickets can start here',
    });
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAttribute('title', "A done state can't be a starting status");
  });

  /**
   * 10.137 — "Tickets can start here" is disabled, with a title, on the workflow's start state — it always allows new tickets.
   */
  it('disables "Tickets can start here" on the start state, with an explanatory title', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    const checkbox = within(screen.getByTestId('state-node-later')).getByRole('checkbox', {
      name: 'Tickets can start here',
    });
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAttribute('title', 'The start state always allows new tickets');
  });

  /**
   * 10.138 — control for 10.136/10.137: an open, non-start state's "Tickets can start here" checkbox is enabled and carries no title. Without this, a checkbox disabled for EVERY state would satisfy both cases above.
   */
  it('control: "Tickets can start here" is enabled and untitled on an open, non-start state', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    const checkbox = within(screen.getByTestId('state-node-next')).getByRole('checkbox', {
      name: 'Tickets can start here',
    });
    expect(checkbox).toBeEnabled();
    expect(checkbox).not.toHaveAttribute('title');
  });

  /**
   * 10.8 — click node/edge to select; inspectors follow the selection.
   */
  it('selects a state on click', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    await user.click(within(screen.getByTestId('state-node-done')).getByText('Done'));
    expect(store.getState().selection).toEqual({ kind: 'state', stateId: 'done' });
  });

  // The plan's own text (line ~1738) documents that the errand-with-waits
  // template was AMENDED at Plan 11's walk: its original inline payload used
  // require-evidence into `done`, which violated Plan 11's checkErrandTemplate
  // pin and was corrected to require-comment. ERRAND_WITH_WAITS_TEMPLATE as it
  // stands on this branch (packages/domain/src/workflows/errand-with-waits.ts)
  // carries three require-comment rules (transitions 3, 6, 8) and zero
  // require-evidence rules — so the plan's literal Step 6 test text (asserting
  // 'Must carry an attachment as evidence.' and a click landing on index 5)
  // would fail against the real template. Rewritten here to assert what the
  // template as measured actually carries, addressed by the edge's own
  // data-testid rather than by an ambiguous getAllByText[i] ordering guess.
  /**
   * 10.17 — plain-language rule summaries render on edges and in the inspector.
   */
  it('renders rule summaries on edges and selects the transition when a label is clicked', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    expect(screen.getAllByText('Must carry a comment explaining it.')).toHaveLength(3);
    await user.click(screen.getByTestId('transition-label-3'));
    expect(store.getState().selection).toEqual({ kind: 'transition', index: 3 });
  });

  /**
   * 10.6 — the distinguished any-state source renders with its hint.
   */
  it('renders the distinguished any-state source node', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    expect(screen.getByText('Any state')).toBeInTheDocument();
    expect(screen.getByText('drag from here for a from-anywhere move')).toBeInTheDocument();
  });

  // The real subject of this test is packages/app-core/test/setup.ts's
  // `Object.defineProperty` wrapper, not the drag. Measured: with that wrapper
  // deleted, every other test in app-core still passes — d3-drag's
  // `nodrag(event.view)` throws on user-event's `view: null`, jsdom's own
  // dispatch catches and logs the TypeError instead of propagating it, and the
  // only consequence is that the gesture silently never starts. This assertion
  // is the one thing in the package that reddens when that wrapper goes
  // (moveState call count 1 -> 0, with
  // "TypeError: Cannot read properties of null (reading 'document')" at
  // d3-drag/src/nodrag.js:5 logged from `mousedowned`).
  //
  // The assertion is deliberately the CALL, not a coordinate: jsdom has no
  // layout engine, every getBoundingClientRect is 0x0, and the gesture lands a
  // ZERO delta — measured, the position written back equals the one it started
  // from. A test asserting the node moved would fail for a reason that has
  // nothing to do with the wiring under test.
  it('completes a node drag gesture, landing onNodeDragStop in the store', async () => {
    const user = userEvent.setup();
    const real = createDraftStore(draftFromTemplate(errand));
    const moves: [string, StatePosition][] = [];
    const store: DraftStore = {
      getState: () => real.getState(),
      subscribe: (listener) => real.subscribe(listener),
      actions: {
        ...real.actions,
        moveState: (nodeId, position) => {
          moves.push([nodeId, position]);
          real.actions.moveState(nodeId, position);
        },
      },
    };
    renderCanvas(store);
    const node = screen.getByTestId('state-node-done').closest('.react-flow__node') as HTMLElement;
    await user.pointer([
      { keys: '[MouseLeft>]', target: node, coords: { clientX: 10, clientY: 10 } },
      { target: node, coords: { clientX: 70, clientY: 95 } },
      { keys: '[/MouseLeft]', target: node, coords: { clientX: 70, clientY: 95 } },
    ]);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.[0]).toBe('done');
  });

  // MEASUREMENT, not a feature test: Task 5 rendered nodes and drove a drag,
  // but explicitly left open whether a CONNECT gesture (pointerdown on a
  // source Handle through to `onConnect`) completes in this harness at all.
  // React Flow resolves a drop target during a connect drag by hit-testing
  // handle DOM rects against the pointer position via
  // `document.elementFromPoint` — an API jsdom does not implement at all
  // (confirmed by first running this test WITHOUT test/setup.ts's stub: the
  // pointer sequence throws an UNCAUGHT `TypeError: doc.elementFromPoint is
  // not a function` from @xyflow/system's `isValidHandle`, which fails the
  // whole vitest process, not merely this test — worse than the drag
  // gesture's silent no-op). With the stub in place (setup.ts, "nothing is
  // at this point" — honest given every rect here is 0x0), the identical
  // pointer sequence completes without throwing, and:
  //
  // MEASURED RESULT: addTransition is called ZERO times. The connect drag
  // starts but never resolves onto the target handle, so `onConnect` never
  // fires — a connect gesture cannot be driven to completion in this
  // harness, full stop, not merely "landed a zero delta" the way drag did.
  //
  // Per the brief: since the gesture cannot be driven end-to-end here, this
  // is not a gesture assertion that would pass vacuously — it pins the
  // negative result (planted-defect below), and connectionToTransition (the
  // mapping layer `onConnect` actually calls) already has full coverage in
  // flow-graph.test.ts, proven independently of any pointer gesture.
  //
  // Planted-defect check for this test itself, run manually and reverted
  // (`git diff` confirms workflow-canvas.tsx matches committed state):
  // wiring `onConnectStart` to call `store.actions.addTransition('todo',
  // 'FORCED')` unconditionally (bypassing hit-testing) DOES push into
  // `additions` on the same pointer sequence — proving the pointerdown truly
  // lands on the handle and starts a real connection drag, and that it is
  // specifically the move/hit-test resolution this harness cannot complete.
  it('CANNOT drive a connect gesture to completion in jsdom — measured, not assumed', async () => {
    const user = userEvent.setup();
    const real = createDraftStore(draftFromTemplate(errand));
    const additions: [string, string][] = [];
    const store: DraftStore = {
      getState: () => real.getState(),
      subscribe: (listener) => real.subscribe(listener),
      actions: {
        ...real.actions,
        addTransition: (from, to) => {
          additions.push([from, to]);
          real.actions.addTransition(from, to);
        },
      },
    };
    renderCanvas(store);
    const sourceNode = screen.getByTestId('state-node-later').closest('.react-flow__node') as HTMLElement;
    const targetNode = screen.getByTestId('state-node-done').closest('.react-flow__node') as HTMLElement;
    const sourceHandle = sourceNode.querySelector('.react-flow__handle.source') as HTMLElement;
    const targetHandle = targetNode.querySelector('.react-flow__handle.target') as HTMLElement;
    expect(sourceHandle).toBeTruthy();
    expect(targetHandle).toBeTruthy();
    await user.pointer([
      { keys: '[MouseLeft>]', target: sourceHandle, coords: { clientX: 10, clientY: 10 } },
      { target: targetHandle, coords: { clientX: 300, clientY: 300 } },
      { keys: '[/MouseLeft]', target: targetHandle, coords: { clientX: 300, clientY: 300 } },
    ]);
    expect(additions).toHaveLength(0);
    // The mapping layer this gesture would drive IS proven, separately and
    // without a gesture: flow-graph.test.ts's `connectionToTransition`
    // describe block.
  });

  it('disables editing controls when the viewer cannot author', () => {
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store, testEnv({ session: { userId: newUlid(), role: 'member' }, canAuthor: false }));
    expect(
      within(screen.getByTestId('state-node-done')).getByRole('button', { name: /Category/ }),
    ).toBeDisabled();
    expect(
      within(screen.getByTestId('state-node-done')).getByRole('checkbox', { name: 'Blocked' }),
    ).toBeDisabled();
  });

  // The coordination doc
  // (docs/superpowers/plans/2026-08-20-00-series-coordination.md:489, verified
  // at that exact line this session, recorded unfixed) records that
  // transitionSchema admits a dangling `to: '*'` — a DESTINATION that is the
  // literal string '*', naming no real state — and that it publishes clean
  // today. This task's brief asks only that the canvas SURVIVE reading such a
  // def back; fixing the validator is explicitly not Plan 8's job.
  //
  // What this test does and does not witness, established by mutating
  // flow-graph.ts and rerunning with the assertions below already in place
  // (each mutation reverted, the revert checked with `git diff`, never shell
  // `diff`):
  //  - Delete flow-graph.ts's `if (!stateIds.has(transition.to)) return;` so
  //    the dangling edge DOES reach React Flow: every canvas test stayed
  //    GREEN, this one included, while flow-graph.test.ts's "the count says
  //    so" test reddened (11 edges, expected 10). React Flow declines to
  //    render an edge whose target node is absent, so THIS layer cannot
  //    witness that guard at all — flow-graph.test.ts owns the drop property.
  //    An earlier version of this comment claimed this render was the
  //    discriminating one for it; that was wrong, and the assertion it
  //    carried (`getByText('Any state')`) targeted the any-state node
  //    toFlowGraph pushes unconditionally on every render, so it could not
  //    have discriminated anything.
  //  - Retarget the dangling edge at the any-state node instead of dropping
  //    it: also GREEN — AnyStateNode carries only a source Handle, so React
  //    Flow renders no edge into it either.
  //  - Retarget it at a real state (`s:done`): RED, 11 labels against 10. So
  //    the label count below is live. What this test genuinely pins is the
  //    pair React Flow cannot give us for free: the render does not throw on
  //    such a def, and no "repair" quietly materialises the malformed
  //    transition as a real edge somewhere.
  it('survives a def whose transition dangles to the literal state "*", rendering the rest of the graph', () => {
    const draft = draftFromTemplate(errand);
    const realTransitionCount = draft.def.transitions.length;
    draft.def = { ...draft.def, transitions: [...draft.def.transitions, { from: 'later', to: '*', rules: [] }] };
    renderCanvas(createDraftStore(draft));
    for (const name of ['Later', 'Next', 'In progress', 'Waiting', 'Done']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getAllByTestId(/^transition-label-/)).toHaveLength(realTransitionCount);
    expect(screen.queryByTestId(`transition-label-${realTransitionCount}`)).not.toBeInTheDocument();
  });
});

/**
 * 10.133 (E4-20, batch B15) — `fitView` never shrinks the canvas below 1:1.
 *
 * NOT a rendered-DOM assertion: React Flow's `fitView` computes its zoom from
 * real `getBoundingClientRect()` measurements, which jsdom reports as all
 * zeros (no layout engine) — the same reason `Features.md`'s case `13.911`
 * states its own sibling canvas-height fix "cannot be a jsdom test". A
 * rendered `.react-flow__viewport` transform in this environment would prove
 * nothing about the real 0.745/0.52 shrink `docs/lanes/review-ui-exec4.md:346`
 * measured in a browser — a real fitView run never happens here to produce
 * one. The instrument is therefore the same shape `builder-css-binding.test.tsx`
 * and `clock-free.test.ts` already use for a property jsdom cannot observe: a
 * source-level read, proven to catch its own removal below.
 */
describe('10.133 the canvas never shrinks a control below its own declared size', () => {
  const SRC_PATH = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../src/workflow-builder/ui/workflow-canvas.tsx',
  );

  // AMENDED 2026-10-02 (23.175): the floor is no longer 1:1 (it cropped wide graphs); the fit still has a declared
  // floor, passed as `fitViewOptions`, and 23.175 below pins its value and the Fit to screen control.
  it('passes a floored fitViewOptions to ReactFlow, checked against the JSX it configures', () => {
    const src = readFileSync(SRC_PATH, 'utf8');
    // Anchored to the SAME `<ReactFlow` element the prop must land on, not a
    // bare substring search: a `minZoom: 1` sitting in a comment or an
    // unrelated object literal would pass a substring check and prove
    // nothing about what React Flow actually receives. The tag's own closing
    // `>` sits alone on its own line (`onPaneClick`'s `() =>` arrow is NOT
    // preceded by a bare newline+whitespace, so it does not match first).
    const opening = /<ReactFlow\b[\s\S]*?\n\s*>/.exec(src)?.[0];
    expect(opening, 'no <ReactFlow ...> opening tag found').toBeDefined();
    expect(opening).toMatch(/fitViewOptions=\{FIT_OPTIONS\}/);
    expect(src).toMatch(/const FIT_OPTIONS = \{\s*minZoom:\s*FIT_MIN_ZOOM/);
    expect(opening).toMatch(/\bfitView\b/);
  });
});

/**
 * 23.175 (UX fixes T10, WF-02) — AMENDS 10.133: the canvas opens on the WHOLE graph. The 1:1 floor above cropped
 * a graph wider than the canvas, so `minZoom` is LOWERED (on the instance as well, which caps `fitView` at its own
 * default 0.5) and a "Fit to screen" control (44px, named) refits on demand. Same instrument as 10.133 and for the
 * same reason (jsdom has no layout, so a real fit never runs): a source-level read of the JSX it configures.
 */
describe('23.175 the canvas opens fitted to the whole graph, and has a Fit to screen control', () => {
  const SRC_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../src/workflow-builder/ui/workflow-canvas.tsx');

  it('23.175 fitView honours the whole graph (minZoom below 1, on the options AND the instance), Fit to screen is a named button, and a zoom is never re-fitted on an edit', () => {
    const src = readFileSync(SRC_PATH, 'utf8');
    const opening = /<ReactFlow\b[\s\S]*?\n\s*>/.exec(src)?.[0];
    expect(opening, 'no <ReactFlow ...> opening tag found').toBeDefined();
    expect(opening).toMatch(/\bfitView\b/);
    expect(opening).toMatch(/\bminZoom=\{FIT_MIN_ZOOM\}/);
    expect(opening).toMatch(/fitViewOptions=\{FIT_OPTIONS\}/);
    const floor = Number(/const FIT_MIN_ZOOM = ([0-9.]+);/.exec(src)?.[1]);
    expect(floor).toBeGreaterThan(0);
    expect(floor).toBeLessThan(0.5); // below React Flow's own default floor, or the fit could never zoom out further
    // The control, rendered: a button named "Fit to screen".
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    const fit = screen.getByRole('button', { name: 'Fit to screen' });
    expect(fit).toHaveClass('gn-workflow-canvas__fit');
    // …and a 44px target: the stylesheet declares both floors on that one rule (the jsdom render measures nothing).
    const fitRule = ruleExactly(readUiCss(), '.gn-workflow-canvas__fit');
    expect(valueOf(fitRule, 'min-height')).toBe('2.75rem');
    expect(valueOf(fitRule, 'min-width')).toBe('2.75rem');
    // CONTROL — the user's zoom is KEPT after an edit: the one `fitView(` CALL is the button's own handler. No
    // effect refits on a draft change, so nothing re-fits on every change.
    expect(src.match(/\bfitView\(/g)).toHaveLength(1);
    expect(src).toMatch(/onClick=\{\(\) => void fitView\(/);
    expect(src).not.toMatch(/useEffect/);
  });
});

/**
 * 23.176 (UX fixes T10, WF-03) — a state node's option rows are 44px targets with the whole row a <label>, and the
 * reason a row is locked is VISIBLE text, not a hover-only `title`.
 */
describe('23.176 state-node option rows', () => {
  it('23.176 the option rows are ≥44px labels; a locked row shows its reason as text; an unlocked row shows none', async () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../ui/src/ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /\.gn-state-node__blocked,\s*\.gn-state-node__creatable\s*\{([^}]*)\}/.exec(css)?.[1];
    expect(rule, 'no shared rule for the two option rows').toBeDefined();
    expect(rule).toMatch(/min-height:\s*2\.75rem/);
    expect(rule).toMatch(/display:\s*flex/);

    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    const done = screen.getByTestId('state-node-done');
    // The row IS the label: the checkbox sits inside it, so a click on the label text toggles it.
    const checkbox = within(done).getByRole('checkbox', { name: 'Tickets can start here' });
    expect(checkbox.closest('label.gn-state-node__creatable')).not.toBeNull();
    expect(within(done).getByRole('checkbox', { name: 'Blocked' }).closest('label.gn-state-node__blocked')).not.toBeNull();
    // The disabled reason is text on the page, wired to the checkbox it explains.
    const reason = screen.getByTestId('gn-state-reason-done');
    expect(reason).toHaveTextContent("A done state can't be a starting status");
    expect(checkbox.getAttribute('aria-describedby')).toBe(reason.id);
    expect(screen.getByTestId('gn-state-reason-later')).toHaveTextContent('The start state always allows new tickets');

    // CONTROL — an enabled row (an open, non-start state) draws NO reason, so the text above is the lock's, not a constant.
    const next = screen.getByTestId('state-node-next');
    expect(within(next).queryByTestId('gn-state-reason-next')).toBeNull();
    expect(within(next).getByRole('checkbox', { name: 'Tickets can start here' })).not.toHaveAttribute('aria-describedby');
  });
});
