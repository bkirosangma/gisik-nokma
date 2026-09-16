import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Board, MoveRefusalNotice, refusalCopy, type BoardMoveCapability } from '../../src/views/board.js';
import { moveOutcome } from '../../src/views/board-moves.js';
import type { BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * board-prototype-port Task 13 — the move arrows' write path. `board.test.tsx`
 * covers the READ-ONLY rendering this file does not touch; every test here
 * needs the `moves` capability wired, which is why it is a separate file
 * rather than an addition to that one.
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

function movesFor(
  overrides: Partial<BoardMoveCapability> = {},
  workflow: WorkflowDef = WF_ERRAND,
  ingestScript?: IngestScript,
) {
  const onMoved = vi.fn();
  const source = createFakeDataSource({ getWorkflowDef: async () => workflow }, ingestScript);
  const moves: BoardMoveCapability = {
    dataSource: source,
    workspaceId: WS,
    currentUserId: CURRENT_USER,
    onMoved,
    ...overrides,
  };
  return { source, moves, onMoved };
}

/**
 * The board is fully painted with arrows only once the workflow read has
 * resolved. `getAllByRole` (not `getByRole`) on purpose: a card in `todo`
 * renders TWO buttons whose accessible names both start with "Move to" (the
 * disabled previous arrow says "Move to previous state — unavailable"), so
 * the singular query would throw on ambiguity before there was anything
 * wrong to report.
 */
async function settled(): Promise<void> {
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0),
  );
}

describe('Board move arrows — the positive control (declared, rules-free edge)', () => {
  /**
   * 13.498 — THE POSITIVE CONTROL the brief itself demands: a move on a
   * declared, rules-free edge must actually transition the ticket, not
   * merely fail to refuse. Asserts the real `dataSource.ingest` call, the
   * SHIPPED payload spelling (`{to}`, never `{toStateId}`), actor/origin,
   * that `onMoved` fires, and that no refusal text of either kind appears.
   */
  it('clicking an available arrow submits the SHIPPED {to} payload and calls onMoved', async () => {
    const user = userEvent.setup();
    const { source, moves, onMoved } = movesFor();
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    await user.click(screen.getByRole('button', { name: 'Move to Doing' }));

    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(source.ingested).toHaveLength(1);
    const batch = source.ingested[0]!;
    expect(batch).toHaveLength(1);
    expect(batch[0]!.type).toBe('ticket.transitioned');
    expect(batch[0]!.payload).toEqual({ to: 'doing' });
    expect(batch[0]!.actorId).toBe(CURRENT_USER);
    expect(batch[0]!.origin).toBe('web');
    expect(Object.keys(batch[0]!.payload as Record<string, unknown>)).not.toContain('toStateId');
    // The two negatives that make the positive mean something: no refusal
    // rendered, client-side or server-side.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * 13.499 — THE PAIRED NEGATIVE CONTROL. `todo` has no declared edge back
   * onto itself in any direction WF_ERRAND declares, so the previous arrow
   * is genuinely disabled (native `disabled`, not merely styled) — and a
   * disabled button's click is inert, so no ingest happens even when fired.
   */
  it('the direction with no declared target is a genuinely disabled button, not merely absent', async () => {
    const { source, moves } = movesFor();
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    const previous = screen.getByRole('button', { name: 'Move to previous state — unavailable' });
    expect(previous).toBeDisabled();
    previous.click();
    expect(source.ingested).toHaveLength(0);
  });

  /**
   * 13.504 — A REJECTED `ingest` (a transport failure, not a server answer)
   * must not brick the card. Caught in review: `submitDirect`'s own
   * `submitting` latch — which has no precedent in `TicketSheet.
   * submitTransition`, that function never disables its Move button while a
   * submit is in flight — was originally reset only after a successful
   * `await`, so a rejection left both arrows `disabled` forever with nothing
   * on screen explaining why. Fixed with a `try/catch/finally`: `finally`
   * always resets `submitting`, and `catch` renders something rather than
   * letting the rejection become an unhandled promise rejection. This test
   * is the proof, not the fix's own reasoning: an `ingestScript` that throws
   * simulates the transport failure, and the assertions are exactly the two
   * facts a bricked card would violate — the arrows are usable again, and a
   * message is on screen.
   */
  it('a rejected ingest does not brick the card — arrows stay usable and something is on screen', async () => {
    const user = userEvent.setup();
    const { moves } = movesFor({}, WF_ERRAND, async () => {
      throw new Error('network unreachable');
    });
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    await user.click(screen.getByRole('button', { name: 'Move to Doing' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('network unreachable');
    // The bug this guards: `submitting` left `true` forever disables BOTH
    // arrows permanently. Both must be usable again once the rejection
    // settles — "next" specifically, since that is the one just clicked.
    expect(screen.getByRole('button', { name: 'Move to Doing' })).not.toBeDisabled();
  });

  /** 13.500 — the capability itself absent ⇒ no move arrows at all, not merely disabled ones. */
  it('renders no move arrows whatsoever when the moves capability is not wired', async () => {
    render(<Board board={errandBoard()} onOpenTicket={() => {}} />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'To do' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Move to/ })).not.toBeInTheDocument();
  });
});

describe('Board move arrows — needs-dialog opens TransitionDialog on the right workflow and state', () => {
  /**
   * 13.501 — a declared edge whose rules are NOT already met opens the
   * dialog rather than submitting blind. Built on a purpose-built def (the
   * same idiom `board-moves.test.ts` and `ticket-sheet.test.tsx` both use)
   * because none of `WF_ERRAND`'s own nearest-declared-target scans land on
   * its one gated edge (`doing -> done`, require-comment) — `waiting` is
   * nearer from `doing` and has no rules. Gating `todo -> doing` instead
   * keeps the SAME nearest-scan result (`doing` is still the only, and
   * therefore nearest, forward target from `todo`) while giving it a rule.
   *
   * **The dialog is NOT pre-aimed at the arrow's own target — say this
   * plainly, since it is easy to assume otherwise.** `MoveArrows` threads
   * only `(workflow, fromStateId)` into `TransitionDialog`; the dialog's own
   * `toStateId` starts at `''` and its `<Select>` re-derives the full option
   * list, exactly as it does when `TicketSheet` opens it from its "Move…"
   * button. This test picks "Doing" from that SAME dropdown a person would —
   * it is not asserting the arrow's computed target reached the dialog,
   * which it does not. What this test actually proves: the dialog opens
   * against the right `(workflow, fromStateId)`, and completing it submits
   * the shipped `{to, comment}` spelling.
   */
  it('opens the dialog for a gated edge, and completing it submits the right move', async () => {
    const user = userEvent.setup();
    const gated: WorkflowDef = {
      ...WF_ERRAND,
      transitions: WF_ERRAND.transitions.map((transition) =>
        transition.from === 'todo' && transition.to === 'doing'
          ? { ...transition, rules: [{ kind: 'require-comment' }] }
          : transition,
      ),
    };
    const { source, moves } = movesFor({}, gated);
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    await user.click(screen.getByRole('button', { name: 'Move to Doing' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });

    // Scoped to `dialog`: the two arrow buttons' own accessible names ("Move
    // to Doing", "Move to previous state — unavailable") also CONTAIN "Move
    // to", but neither one is inside the dialog's own subtree, so scoping
    // (not an exact-vs-regex match — the trigger's real accessible name is
    // "Choose a state Move to", react-aria's own `aria-labelledby` combining
    // the placeholder text with `aria-label="Move to"`) is what keeps this
    // query unambiguous.
    await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
    await user.type(
      within(dialog).getByLabelText('Comment (required by this transition)'),
      'picking this up now',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(source.ingested).toHaveLength(1));
    const batch = source.ingested[0]!;
    expect(batch[0]!.type).toBe('ticket.transitioned');
    expect(batch[0]!.payload).toEqual({ to: 'doing', comment: { text: 'picking this up now' } });
  });

  /**
   * 13.505 — the identical transport-failure fix `13.504` proved for the
   * arrows' own `submitDirect`, now proved for the dialog's `submitFromDialog`.
   * Found in a third-opinion review: `TransitionDialog`'s `onSubmit` prop is
   * `void`-typed and `MoveArrows`' own call site is fire-and-forget
   * (`onSubmit={(submission) => void submitFromDialog(submission)}`), so
   * before this fix a rejected `ingest` here became an unhandled promise
   * rejection — the dialog would stay open with nothing on screen saying it
   * failed. Reuses the same gated-edge setup as the test above so the dialog
   * opens and reaches its own `ingest` call; the `ingestScript` throws
   * instead of resolving. Asserts the SAME two facts `13.504` asserts for the
   * arrows: something is on screen naming the failure, and the control that
   * triggers it is usable again — here, that the dialog's own alert appears
   * (via its existing `serverRefusal` prop, `transition-dialog.tsx:260-262`)
   * and the dialog stays OPEN rather than silently vanishing or bricking.
   */
  it('a rejected ingest from the dialog is shown, not swallowed as an unhandled rejection', async () => {
    const user = userEvent.setup();
    const gated: WorkflowDef = {
      ...WF_ERRAND,
      transitions: WF_ERRAND.transitions.map((transition) =>
        transition.from === 'todo' && transition.to === 'doing'
          ? { ...transition, rules: [{ kind: 'require-comment' }] }
          : transition,
      ),
    };
    const { moves } = movesFor({}, gated, async () => {
      throw new Error('network unreachable');
    });
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    await user.click(screen.getByRole('button', { name: 'Move to Doing' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
    await user.type(
      within(dialog).getByLabelText('Comment (required by this transition)'),
      'picking this up now',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument());
    expect(within(dialog).getByRole('alert')).toHaveTextContent('network unreachable');
    expect(screen.getByRole('dialog', { name: 'Move ticket' })).toBeInTheDocument();
  });
});

describe('Board move arrows — the refusal path names the real alternatives', () => {
  /**
   * 13.502 — THE REFUSAL RENDERING, proven through the REAL pipeline rather
   * than a hand-typed string: the actual `moveOutcome` refusal for an
   * undeclared target, fed into the actual `MoveRefusalNotice` component —
   * the exact same call `MoveArrows` makes. A live arrow click cannot
   * organically reach this branch (see `MoveArrows`'s own docblock in
   * `board.tsx`: both the arrow's target and `moveOutcome`'s own check read
   * `transitionOptions` off the identical `(workflow, fromStateId)`, so a
   * target this component ever actually submits is always declared) — this
   * is therefore the honest seam to test refusal RENDERING at, exercising
   * the real gate and the real renderer without contriving an impossible
   * click. `board-moves.test.ts` already proves `moveOutcome` itself.
   */
  it('names the REAL available moves by NAME, not merely appearing', () => {
    const outcome = moveOutcome(WF_ERRAND, 'todo', 'waiting', {});
    expect(outcome.kind).toBe('refused');
    if (outcome.kind !== 'refused') throw new Error('expected a refusal');
    // The one real alternative from `todo` in WF_ERRAND is `doing` — proven
    // by `moveOutcome`'s own test suite; this test's job is only the copy.
    expect(outcome.available).toEqual(['doing']);

    render(<MoveRefusalNotice workflow={WF_ERRAND} available={outcome.available} />);
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Doing');
    expect(notice).not.toHaveTextContent('doing,'); // no raw, untranslated id leaking through
    expect(refusalCopy(WF_ERRAND, outcome.available)).toBe("Can't move there — try Doing.");
  });

  /** 13.503 — the zero-alternatives sentence is still an honest one, not "try ." */
  it('says the ticket cannot move at all when moveOutcome names zero alternatives', () => {
    expect(refusalCopy(WF_ERRAND, [])).toBe("This ticket can't move from here.");
    render(<MoveRefusalNotice workflow={WF_ERRAND} available={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent("This ticket can't move from here.");
  });
});

