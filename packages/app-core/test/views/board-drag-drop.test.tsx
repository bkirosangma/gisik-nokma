import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Board, DRAG_TICKET_FORMAT, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * jsdom (25.0.1, this repo's version) implements NO `scrollIntoView` at
 * all — confirmed empirically before writing this: a bare jsdom `Element`
 * throws `scrollIntoView is not a function` when called. Ruling 28's own
 * effect (`board.tsx`) calls it for real on every drop that renders a
 * notice, so every test in this file needs SOME stand-in or the refusal/
 * dialog drop tests above would throw mid-render. A fresh `vi.fn()` per
 * test, not one shared instance, so a call recorded in one test can never
 * leak into the next — `13.515`, the one case that actually reads this
 * spy's calls, would be a false positive against a stale count otherwise.
 */
let scrollIntoView: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
});

/**
 * board-prototype-port Task 14 — drag-and-drop. `board-moves-ui.test.tsx`
 * covers the `‹ ›` arrows' own write path and is left UNCHANGED by this
 * task (proof the keyboard path still works — see this file's own final
 * describe block for the one case that checks the affordance itself). This
 * file is a sibling, the same convention that file's own docblock already
 * set for itself relative to `board.test.tsx`: every test here drives the
 * board through a REAL `dragstart`/`dragover`/`drop` sequence rather than
 * calling anything drag-specific directly, because the whole point of this
 * task is that a drop and an arrow reach `moveOutcome` through the exact
 * same code, and the only way to prove that honestly is to reach it the way
 * a person actually would — a drag, not a shortcut around one.
 */

const CURRENT_USER = 'user_kiro';

function errandGroup(cards = [boardCardSeed()]): BoardGroup {
  return {
    workflowId: 'wf-errand',
    workflowVersion: 1,
    workflowName: 'Errand',
    columns: [
      { stateId: 'todo', name: 'To do', category: 'open', blocked: false, cards },
      { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, cards: [] },
      { stateId: 'waiting', name: 'Waiting on counterparty', category: 'active', blocked: true, cards: [] },
      { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, cards: [] },
    ],
  };
}

function errandBoard(cards?: ReturnType<typeof boardCardSeed>[]): BoardView {
  return { projectId: 'prj_1', groups: [errandGroup(cards)] };
}

function movesFor(workflow: WorkflowDef = WF_ERRAND, ingestScript?: IngestScript) {
  const onMoved = vi.fn();
  const source = createFakeDataSource({ getWorkflowDef: async () => workflow }, ingestScript);
  const moves: BoardMoveCapability = {
    dataSource: source,
    workspaceId: WS,
    currentUserId: CURRENT_USER,
    onMoved,
  };
  return { source, moves, onMoved };
}

/** Same idiom as `board-moves-ui.test.tsx`'s own `settled()` — the board is fully painted (arrows AND `draggable` cards) only once the workflow read resolves. */
async function settled(): Promise<void> {
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0),
  );
}

/**
 * A hand-rolled `DataTransfer` stand-in — jsdom 25 implements neither
 * `DataTransfer` nor `DragEvent` (confirmed empirically: `new
 * window.DataTransfer()` throws "is not a constructor" under this repo's
 * jsdom), and `@testing-library/dom`'s own `events.js` documents the same
 * gap and works around it by attaching whatever object is passed as
 * `dataTransfer` directly onto the fired event with no `DataTransfer`
 * validation — `packages/editor/test/drive-never-inline.test.ts` already
 * establishes the identical pattern for `ClipboardEvent`/`clipboardData` in
 * this codebase, cast through `as unknown as`, and this mirrors it. `getData`
 * answers only the format that was actually `setData`-populated (never the
 * same value for every format) — the SAME format-awareness that file's own
 * comment insists on, for the identical reason: a sloppier fake would paper
 * over a real bug this component could have.
 *
 * ONE instance is passed to BOTH the `dragStart` and the `drop` fire calls
 * in every test below, never two separate ones — a real browser hands the
 * exact same `DataTransfer` object to every event in one drag gesture, and
 * a test using two would prove nothing about whether `getData` on the DROP
 * side actually reads what `setData` on the DRAG side wrote.
 */
function fakeDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    setData: (format: string, data: string) => {
      store.set(format, data);
    },
    getData: (format: string) => store.get(format) ?? '',
    effectAllowed: 'uninitialized',
  } as unknown as DataTransfer;
}

function dragCard(ticketId: string, dataTransfer: DataTransfer): void {
  fireEvent.dragStart(screen.getByTestId(`ticket-card-${ticketId}`), { dataTransfer });
}

function dropOnColumn(stateId: string, dataTransfer: DataTransfer): void {
  fireEvent.drop(screen.getByTestId(`board-column-${stateId}`), { dataTransfer });
}

describe('Board drag-and-drop — the positive control (declared, rules-free edge)', () => {
  /**
   * 13.507 — THE POSITIVE CONTROL Task 14's own brief demands, mirroring
   * `13.498`'s role for the arrows: dragging the card in `todo` and
   * dropping it on the `doing` column must actually transition the ticket,
   * not merely fail to refuse. Proves the drop reaches `moveOutcome`'s
   * `direct` branch through the EXACT same `attemptMove` an arrow click
   * would call — same shipped `{to}` payload, same actor/origin, same
   * `onMoved` call, no client-minted refusal of either kind.
   */
  it('dropping a card on a declared, rules-free column submits the SHIPPED {to} payload and calls onMoved', async () => {
    const { source, moves, onMoved } = movesFor();
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    const dataTransfer = fakeDataTransfer();
    dragCard(boardCardSeed().ticketId, dataTransfer);
    dropOnColumn('doing', dataTransfer);

    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(source.ingested).toHaveLength(1);
    const batch = source.ingested[0]!;
    expect(batch).toHaveLength(1);
    expect(batch[0]!.type).toBe('ticket.transitioned');
    expect(batch[0]!.payload).toEqual({ to: 'doing' });
    expect(batch[0]!.actorId).toBe(CURRENT_USER);
    expect(batch[0]!.origin).toBe('web');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * 13.514 — THE REGISTRY MUST HOLD THE LATEST `attemptMove`, NOT A STALE
   * ONE. Every other case in this file drops exactly once; this is the one
   * case that drags and drops the SAME card TWICE in sequence, proving the
   * `useEffect` that re-registers `attemptMove` on every render actually
   * publishes the fresh closure — the one that sees `submitting` flip back
   * to `false` once `submitDirect`'s own `finally` resets it — rather than a
   * closure captured once (e.g. by an over-eager `useCallback`) that would
   * silently freeze the registry's view of `submitting` and either brick the
   * card after one move or bypass the double-submit latch entirely. Neither
   * bug is hypothetical enough to skip: both are exactly the shape of
   * mistake a well-meaning "let's memoize this" edit could introduce without
   * touching a single line this file's other cases exercise.
   */
  it('a second drop after the first settles still submits — the registry holds the LATEST attemptMove', async () => {
    const { source, moves, onMoved } = movesFor();
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    const first = fakeDataTransfer();
    dragCard(boardCardSeed().ticketId, first);
    dropOnColumn('doing', first);
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));

    const second = fakeDataTransfer();
    dragCard(boardCardSeed().ticketId, second);
    dropOnColumn('doing', second);
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(2));

    expect(source.ingested).toHaveLength(2);
    expect(source.ingested[0]![0]!.payload).toEqual({ to: 'doing' });
    expect(source.ingested[1]![0]!.payload).toEqual({ to: 'doing' });
  });
});

describe('Board drag-and-drop — the refusal path names the real alternatives', () => {
  /**
   * 13.508 — THE CASE AN ARROW CANNOT REACH, and the one Task 13's own
   * refusal path was built for but could only be tested at the pure-gate
   * seam (`board-moves-ui.test.tsx`'s own `13.502`, which feeds
   * `moveOutcome`'s output straight into `MoveRefusalNotice` because "a
   * live arrow click cannot organically reach this branch"). A DROP can: a
   * card may land on any column, including `waiting`, which `todo` has no
   * declared edge to (`WF_ERRAND`'s only declared target from `todo` is
   * `doing` — proven by `moveOutcome`'s own suite and reused verbatim by
   * `13.502`). This is the end-to-end version of that same pipeline,
   * reached the way a person actually would: a real drag, a real drop,
   * asserting the rendered alert NAMES "Doing" — not merely that some alert
   * appeared — and that nothing was ever submitted.
   */
  it('dropping a card on an undeclared column refuses, naming the real alternatives, and submits nothing', async () => {
    const { source, moves } = movesFor();
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    const dataTransfer = fakeDataTransfer();
    dragCard(boardCardSeed().ticketId, dataTransfer);
    dropOnColumn('waiting', dataTransfer);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Doing');
    expect(alert).not.toHaveTextContent('doing,'); // no raw, untranslated id leaking through
    expect(source.ingested).toHaveLength(0);
  });
});

describe('Board drag-and-drop — a rules-bearing edge opens the dialog, exactly as the arrow would', () => {
  /**
   * 13.509 — the THIRD outcome the design spec's own Test impact section
   * names for this task ("a drop on a rules-bearing edge opening the
   * dialog") alongside the positive control and the refusal above. Reuses
   * `board-moves-ui.test.tsx`'s own `13.501` gated-edge idiom verbatim
   * (`todo -> doing` regains a `require-comment` rule) so the SAME
   * `moveOutcome` input that opens the dialog for an arrow click opens it
   * for a drop too. Not re-proving `submitFromDialog`'s own mechanics here
   * (payload shape, transport-failure handling, …) — `13.501`/`13.504`/
   * `13.505` already do, over the identical function this drop reaches;
   * this case's whole job is proving the DISPATCH (drop → `needs-dialog` →
   * `TransitionDialog` open), not re-testing what happens after.
   */
  it('dropping a card on a declared, rules-bearing column opens TransitionDialog', async () => {
    const gated: WorkflowDef = {
      ...WF_ERRAND,
      transitions: WF_ERRAND.transitions.map((transition) =>
        transition.from === 'todo' && transition.to === 'doing'
          ? { ...transition, rules: [{ kind: 'require-comment' }] }
          : transition,
      ),
    };
    const { moves } = movesFor(gated);
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    const dataTransfer = fakeDataTransfer();
    dragCard(boardCardSeed().ticketId, dataTransfer);
    dropOnColumn('doing', dataTransfer);

    expect(await screen.findByRole('dialog', { name: 'Move ticket' })).toBeInTheDocument();
  });
});

describe('Board drag-and-drop — the mechanism a real browser drop depends on', () => {
  /**
   * 13.510 — `preventDefault()` on `dragover` is invisible to every test
   * above: `fireEvent.drop` dispatches straight to React's listener
   * regardless of what `dragover` did, or whether it ran at all, so a test
   * suite built only from the three cases above could pass in full against
   * an implementation missing this call — and in a REAL browser, a missing
   * `dragover` handler means the browser's own default (disallow dropping)
   * wins and `onDrop` never fires for ANY target. This case pins the
   * mechanism directly: `fireEvent` returns `element.dispatchEvent(event)`,
   * which is `false` exactly when something called `preventDefault()` on a
   * cancelable event — `dragover`'s own default `cancelable: true`
   * (`@testing-library/dom`'s event map). No card need be dragged first;
   * this is a property of the column's own handler, not of any one drop.
   */
  it('dragging over a droppable column calls preventDefault, the call a real drop depends on', async () => {
    const { moves } = movesFor();
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    const result = fireEvent.dragOver(screen.getByTestId('board-column-doing'), {
      dataTransfer: fakeDataTransfer(),
    });
    expect(result).toBe(false);
  });

  /**
   * 13.511 — a `drop` with no real `dragstart` behind it (an empty
   * `DataTransfer`, `getData` answering `''`) is an INERT no-op, not a
   * thrown error and not a refusal: `''` is not a ticket id the registry
   * has ever seen, so `moveRegistry.current.get('')` answers `undefined`
   * and `handleDrop` (`board.tsx`) does nothing further — proven here by
   * asserting no ingest happened and no alert of either kind rendered,
   * distinguishing "the gate ran and refused" from "the handler never
   * found anything to act on" (`MoveRegistry`'s own docblock names this
   * exact case as the one outcome this feature does not narrate).
   */
  it('a drop with no prior dragstart is a silent, inert no-op', async () => {
    const { source, moves } = movesFor();
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    dropOnColumn('doing', fakeDataTransfer());

    expect(source.ingested).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Board drag-and-drop — the affordance is exactly as honest as the capability behind it', () => {
  /**
   * 13.512 — Ruling 15's own words: "a grab cursor on an undraggable card
   * is an affordance claim the product cannot honour." Mirrors `13.500`'s
   * "no arrows at all" proof for the identical `moves` capability being
   * absent, applied to the drag affordance this task adds: the card's own
   * `<li>` must carry NO `draggable="true"` at all when there is no
   * `MoveArrows` instance behind it to register an `attemptMove` — and,
   * belt and braces, a drop aimed at it anyway (an impossible gesture in a
   * real browser, since nothing there is draggable to begin with) is still
   * inert, because `onDropCard` itself is `null` on this path (`Board`'s
   * own `arrows={null}` / `onDropCard={null}` branch) and the column never
   * even gets an `onDrop` handler.
   *
   * AMENDED, Ruling 29 (coordinator, 2026-09-16). Originally asserted the
   * literal `toHaveAttribute('draggable', 'false')` — a SPELLING of how the
   * element fails to be draggable, not the CONTRACT the cursor rule
   * actually depends on. `ui.css`'s `.gn-board__card-slot[draggable="true"]`
   * selector is equally unmatched by an EXPLICIT `draggable="false"` and by
   * the attribute being ABSENT entirely — both mean "not draggable" to a
   * browser. The old assertion would have reddened a future refactor that
   * switched to omitting the attribute rather than setting it `false`
   * (e.g. spreading `{...(arrows !== null && { draggable: true })}`), even
   * though the CSS contract would still hold — a phantom regression. Now
   * asserts the contract directly: `element.matches('[draggable="true"]')`
   * is the identical selector `ui.css` uses, read off the real DOM rather
   * than one particular way of failing to satisfy it.
   */
  it('renders no draggable card at all, and a drop is inert, when the moves capability is not wired', async () => {
    render(<Board board={errandBoard()} onOpenTicket={() => {}} />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'To do' })).toBeInTheDocument());

    const card = screen.getByTestId(`ticket-card-${boardCardSeed().ticketId}`);
    expect(card.matches('[draggable="true"]')).toBe(false);

    dropOnColumn('doing', fakeDataTransfer());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Board drag-and-drop — the notice scrolls into view following a drop, never following an arrow (Ruling 28)', () => {
  /**
   * 13.515 — Ruling 28 (coordinator, 2026-09-16). `.gn-board__rail` is
   * `overflow-x: auto`, and the refusal notice renders where `MoveArrows`
   * already renders it (under the SOURCE card, in its origin column — kept
   * as the ONE rendering site, never a second one nearer the drop point,
   * per the ruling's own instruction). A rightward drag can scroll that
   * origin column out of view before a sighted person reads why their card
   * snapped back. This asserts the fix directly: the wrapper `<div
   * className="gn-board-card__notice">` around the notice receives a real
   * `scrollIntoView({ block: 'nearest', inline: 'nearest' })` call once the
   * refusal renders. `role="alert"` already covers assistive technology
   * regardless of scroll position — this scroll completes the disclosure
   * for sighted users, it is not the whole of it, and this case does not
   * claim otherwise.
   */
  it('scrolls the notice into view when it renders following a drop', async () => {
    const { moves } = movesFor();
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    expect(scrollIntoView).not.toHaveBeenCalled();

    const dataTransfer = fakeDataTransfer();
    dragCard(boardCardSeed().ticketId, dataTransfer);
    dropOnColumn('waiting', dataTransfer); // undeclared from `todo` — the refusal path

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  /**
   * 13.516 — THE PAIRED NEGATIVE: an arrow click that reaches a REAL notice
   * must NOT scroll — "an arrow click never scrolls the origin out of view,
   * so it needs nothing" (Ruling 28's own words). Proves the discrimination
   * itself, not merely the drop side in isolation: `13.515` alone would
   * still pass an implementation that scrolled on EVERY notice regardless
   * of source. Reuses `board-moves-ui.test.tsx`'s own `13.504` fixture (a
   * rejected `ingest`, producing a `transportError` notice) since an arrow
   * click cannot reach the CLIENT-side `refusal` notice at all (Task 13's
   * own, unrelated, constraint) — any real notice reached via an arrow
   * proves the point equally well.
   */
  it('does not scroll when a notice renders following an arrow click', async () => {
    const { moves } = movesFor(WF_ERRAND, async () => {
      throw new Error('network unreachable');
    });
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    fireEvent.click(screen.getByRole('button', { name: 'Move to Doing' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
