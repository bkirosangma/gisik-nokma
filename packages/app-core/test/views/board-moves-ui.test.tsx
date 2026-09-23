import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Board, MoveRefusalNotice, refusalCopy, type BoardMoveCapability } from '../../src/views/board.js';
import { moveOutcome } from '../../src/views/board-moves.js';
import type { BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';
import { SESSION_EXPIRED_COPY, SessionExpiredError } from '../../src/session-expired.js';
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
      { stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards },
      { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: [] },
      { stateId: 'waiting', name: 'Waiting on counterparty', category: 'active', blocked: true, creatable: true, cards: [] },
      { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: false, cards: [] },
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
   * letting the rejection become an unhandled promise rejection.
   *
   * **AMENDED for Ruling 27** (board-prototype-port, 2026-09-16; coordinator
   * review, not caught by this task on its own). Quoting exactly what this
   * case asserted BEFORE the amendment and what it asserts NOW, since a
   * rewritten assertion in a diff says less than the two versions side by
   * side:
   *
   * - BEFORE: `expect(screen.getByRole('alert')).toHaveTextContent('network
   *   unreachable')` — one substring check. It PASSED under the pre-Ruling-27
   *   code, which rendered "Refused by the server — transport: network
   *   unreachable" (a transport failure dressed as the server's own verdict —
   *   exactly Ruling 27's defect), because that sentence also contains the
   *   substring "network unreachable". Measured, not assumed: running this
   *   suite against the pre-amendment source left this case GREEN
   *   (`PASS (29) FAIL (0)` across this file and `transition-dialog.test.tsx`
   *   together) — the assertion never caught the defect because it never
   *   checked for the words the defect actually produced.
   * - NOW: asserts the corrected sentence IS present, the refusal-shaped
   *   sentence and class are ABSENT, and the two original facts (arrows
   *   usable again, something on screen) still hold.
   */
  it('a rejected ingest does not brick the card, and the message never claims to be the server\'s own verdict', async () => {
    const user = userEvent.setup();
    const { moves } = movesFor({}, WF_ERRAND, async () => {
      throw new Error('network unreachable');
    });
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    await user.click(screen.getByRole('button', { name: 'Move to Doing' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('We could not reach the server for this move');
    expect(alert).toHaveTextContent('network unreachable');
    // Ruling 27's own words: a dropped connection must never render through
    // the same sentence, or the same class, a real server refusal uses.
    expect(alert).not.toHaveTextContent('Refused by the server');
    expect(alert).toHaveClass('gn-refusal--transport');
    expect(alert).not.toHaveClass('gn-refusal--server');
    // The bug this case originally guarded: `submitting` left `true` forever
    // disables BOTH arrows permanently. Both must be usable again once the
    // rejection settles — "next" specifically, since that is the one just
    // clicked.
    expect(screen.getByRole('button', { name: 'Move to Doing' })).not.toBeDisabled();
  });

  /**
   * 13.506 — the SIBLING case Ruling 27 also names and this file had zero
   * coverage of before now: `results[0] === undefined` (`ingest` answers with
   * no result at all for this event — "silence", the ruling's own word, as
   * against `13.504`'s "a transport failure"). Both used to funnel into the
   * identical fabricated `{rule: 'no-response'|'transport', reason}` pair;
   * both now render through the same `transportError` channel with their own
   * sentences, neither ever claiming to be the server's own verdict.
   */
  it('an ingest that answers with no result for this event is silence, not a refusal', async () => {
    const user = userEvent.setup();
    const { moves } = movesFor({}, WF_ERRAND, async () => []);
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    await user.click(screen.getByRole('button', { name: 'Move to Doing' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The server did not answer this move.');
    expect(alert).not.toHaveTextContent('Refused by the server');
    expect(alert).toHaveClass('gn-refusal--transport');
    expect(alert).not.toHaveClass('gn-refusal--server');
    expect(screen.getByRole('button', { name: 'Move to Doing' })).not.toBeDisabled();
  });

  /**
   * 13.590a — Ruling 36 (coordinator, 2026-09-17; found reviewing Task 8's
   * `closeCard`, which mirrors `submitDirect` almost exactly and already
   * carried this pairing from Ruling 34, case `13.588c`): `submitDirect`'s
   * `result === undefined` branch never itself cleared `serverRefusal`
   * alongside `transportError`, unlike `closeCard`'s identical branch, so
   * the ruling's own docblock claim ("mirrors `submitDirect` almost
   * exactly") was not quite true and the two were brought back in line.
   * Sequenced through the fake data source's own per-call closure — exactly
   * `ticket-sheet.test.tsx`'s own `13.588c` technique — a `refused` answer
   * on the first ingest, an empty `[]` on the second.
   *
   * **Measured, not assumed, and the measurement corrects the ruling's own
   * predicted mutation**: on THIS component the arrow path is doubly
   * guarded. `submitDirect` has exactly one call site, inside `attemptMove`
   * (`grep -n 'submitDirect('` confirms it), which already runs its own
   * unconditional `setServerRefusal(null)` synchronously, before the new
   * attempt's `await`, on EVERY arrow/drop attempt — a guarantee `closeCard`
   * has no equivalent of, since nothing wraps its `onClick`. Reverting ONLY
   * the new line added for this ruling leaves this case GREEN (measured:
   * `PASS (15) FAIL (0)`, the full file unchanged) because `attemptMove`'s
   * own clear already does the job; reverting ONLY `attemptMove`'s own
   * clear, with the new line left in place, is ALSO green for the identical
   * reason in reverse. The case only reddens when BOTH are absent at once
   * (measured: `PASS (14) FAIL (1)`, this case alone) — meaning the new
   * line is real, correct, and brings `submitDirect` into textual and
   * behavioural agreement with `closeCard`, but is REDUNDANT defense-in-depth
   * on the arrows specifically, not the closing of a live, reachable gap the
   * way the identical-looking line is for `closeCard`/`closeOrReopen`. Kept
   * anyway, for the reason Ruling 36 gave: a future change to `attemptMove`
   * that stops clearing on every attempt would make this the ONLY thing
   * standing between a refused-then-silent sequence and a stale notice, and
   * the two functions reading identically is worth more than the one saved
   * line.
   */
  it('a refused arrow click followed by a silent one shows only the transport notice', async () => {
    const user = userEvent.setup();
    let calls = 0;
    const { moves } = movesFor({}, WF_ERRAND, async (events) => {
      calls += 1;
      if (calls === 1) {
        return events.map((event) => ({
          status: 'refused' as const,
          eventId: event.id,
          rule: 'some-rule',
          reason: 'Not allowed right now.',
        }));
      }
      return [];
    });
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    const moveButton = screen.getByRole('button', { name: 'Move to Doing' });
    await user.click(moveButton);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveClass('gn-refusal--server'));

    await user.click(moveButton);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveClass('gn-refusal--transport'));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The server did not answer this move.');
    // The server notice must be GONE, not merely joined by the new one.
    expect(document.querySelector('.gn-refusal--server')).toBeNull();
    expect(moveButton).not.toBeDisabled();
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
   * **The dialog IS pre-aimed at the arrow's own target since 2026-09-17**
   * (owner request; `13.531` below proves the aim itself, and `13.527`/
   * `13.528` in `transition-dialog.test.tsx` prove the two props that carry
   * it). Before that, this paragraph said the opposite — `MoveArrows`
   * threaded only `(workflow, fromStateId)` and the dialog started on `''`
   * — and this case picked "Doing" from the select because a person had to.
   * The pick is KEPT here, deliberately: it now re-selects the state that is
   * already selected, which proves the select still works over the
   * one-entry offer list rather than being a dead control with a
   * preselected value. What this case proves is unchanged: the dialog opens
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
   * instead of resolving.
   *
   * **AMENDED for Ruling 27** (board-prototype-port, 2026-09-16), the SAME
   * amendment `13.504` got and for the identical reason — quoting before and
   * after:
   *
   * - BEFORE: `expect(within(dialog).getByRole('alert')).toHaveTextContent(
   *   'network unreachable')` — passed under the pre-Ruling-27 code, which
   *   routed this failure through `TransitionDialog`'s `serverRefusal` prop
   *   and rendered "Refused by the server — transport: network unreachable".
   *   Measured, not assumed: this case also stayed GREEN against the
   *   pre-amendment source (see `13.504`'s own note; same suite run,
   *   `PASS (29) FAIL (0)`).
   * - NOW: the alert is read off `TransitionDialog`'s NEW `transportError`
   *   prop (`transition-dialog.tsx`) instead, asserted to carry the corrected
   *   sentence, the `gn-refusal--transport` class, and neither the
   *   refusal-shaped sentence nor its class.
   */
  it('a rejected ingest from the dialog is shown, and never claims to be the server\'s own verdict', async () => {
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
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('We could not reach the server for this move');
    expect(alert).toHaveTextContent('network unreachable');
    expect(alert).not.toHaveTextContent('Refused by the server');
    expect(alert).toHaveClass('gn-refusal--transport');
    expect(alert).not.toHaveClass('gn-refusal--server');
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
   *
   * This is still true only of an ARROW click — it is not a claim that the
   * refused branch is unreachable through the UI at all. Task 14's
   * drag-and-drop reaches it organically (a card can be dropped on ANY
   * column, including one no declared edge reaches), and
   * `board-drag-drop.test.tsx`'s own `13.508` proves the identical
   * `moveOutcome`/`refusalCopy`/`MoveRefusalNotice` pipeline end to end,
   * through a real `dragstart`/`drop` sequence rather than at this seam.
   */
  it('names the REAL available moves by NAME, not merely appearing', () => {
    const outcome = moveOutcome(WF_ERRAND, 'todo', 'waiting', {});
    expect(outcome.kind).toBe('refused');
    if (outcome.kind !== 'refused') throw new Error('expected a refusal');
    // The SHARED gate's answer still names both: `doing` and, since
    // 2026-09-17 (backlog/closed spec §4), the universal `backlog`
    // Send-to-backlog edge (`todo` is non-terminal) — `moveOutcome` is read
    // by the dialog/sheet too, where Backlog is a real, submittable move.
    expect(outcome.available).toEqual(['doing', 'backlog']);

    // The BOARD's own copy never names it (controller ruling, Task 6 fix
    // round 1): Backlog is never a board column, so a drop can never reach
    // it, and `refusalCopy`/`MoveRefusalNotice` filter it out of the
    // alternatives THIS surface offers — `moveOutcome` itself is untouched.
    render(<MoveRefusalNotice workflow={WF_ERRAND} available={outcome.available} />);
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Doing');
    expect(notice).not.toHaveTextContent('Backlog');
    expect(notice).not.toHaveTextContent('doing,'); // no raw, untranslated id leaking through
    expect(refusalCopy(WF_ERRAND, outcome.available)).toBe("Can't move there — try Doing.");
  });

  /**
   * The filter's own edge: when Backlog is the ONLY alternative `moveOutcome`
   * names, filtering it leaves nothing — the pre-existing zero-alternatives
   * sentence applies, not "try ." with a dangling word.
   */
  it('says the ticket cannot move at all when Backlog is the ONLY alternative', () => {
    const onlyBacklog: WorkflowDef = {
      id: 'wf-mini',
      version: 1,
      name: 'Mini',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [],
    };
    expect(refusalCopy(onlyBacklog, ['backlog'])).toBe("This ticket can't move from here.");
  });

  /** 13.503 — the zero-alternatives sentence is still an honest one, not "try ." */
  it('says the ticket cannot move at all when moveOutcome names zero alternatives', () => {
    expect(refusalCopy(WF_ERRAND, [])).toBe("This ticket can't move from here.");
    render(<MoveRefusalNotice workflow={WF_ERRAND} available={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent("This ticket can't move from here.");
  });
});


/**
 * A board with the one seed card in `stateId`'s column instead of `todo` —
 * the cases below need a state with MORE than one declared target in one
 * direction, and in `WF_ERRAND` that is `doing` (forward: `waiting`, `done`)
 * and `done` (backward: `doing`, `todo`).
 */
function errandBoardWithCardIn(stateId: string): BoardView {
  const group = errandGroup([]);
  return {
    projectId: 'prj_1',
    groups: [
      {
        ...group,
        columns: group.columns.map((column) =>
          column.stateId === stateId ? { ...column, cards: [boardCardSeed()] } : column,
        ),
      },
    ],
  };
}

describe('Board move arrows — several declared targets one way open a picker (owner request, 2026-09-17)', () => {
  /**
   * 13.529 — from `doing`, `›` has TWO declared forward targets (`waiting`
   * nearer, `done` further). Before this, the arrow silently took the
   * nearer one and `done` was unreachable by arrow at all. Now: the arrow's
   * own name says there is a choice; the click opens the dialog on "Choose
   * a state"; the select offers EXACTLY the forward pair and NOT `To do`
   * (declared from `doing` via the wildcard, but backward — the negative
   * that proves "only what the gesture meant"); picking the rules-free one
   * and pressing Move submits the shipped `{to}` payload through the same
   * `submitFromDialog` the gated path uses, with no field events.
   */
  it('› with two forward targets opens the dialog offering only those, and a pick submits', async () => {
    const user = userEvent.setup();
    const { source, moves, onMoved } = movesFor();
    render(<Board board={errandBoardWithCardIn('doing')} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    const next = screen.getByRole('button', {
      name: 'Move to next state — Waiting on counterparty or Done',
    });
    expect(next).toBeEnabled();
    await user.click(next);
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(within(dialog).getByRole('button', { name: /Move to/ })).toHaveTextContent('Choose a state');

    await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Waiting on counterparty',
      'Done',
    ]);
    expect(within(listbox).queryByRole('option', { name: 'To do' })).toBeNull();

    await user.click(within(listbox).getByRole('option', { name: 'Waiting on counterparty' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(source.ingested).toHaveLength(1);
    const batch = source.ingested[0]!;
    expect(batch).toHaveLength(1);
    expect(batch[0]!.type).toBe('ticket.transitioned');
    expect(batch[0]!.payload).toEqual({ to: 'waiting' });
  });

  /**
   * 13.530 — `‹` gets the mirror treatment, on a def built so the negative
   * can actually fail. From `WF_ERRAND`'s `done` every declared target is
   * backward, so "the picker offers only the backward ones" would pass even
   * if the offer were ignored — measured: mutation M4 (offer ignored) left
   * the first draft of this case green. This def gives `waiting` one
   * forward edge (`waiting → done`) beside its two backward ones (`doing`
   * exact, `todo` wildcard): the `‹` picker must offer `Doing` and `To do`
   * and NOT `Done`, which `transitionOptions` DOES declare from `waiting`.
   * M4 now kills this case.
   */
  it('‹ with two backward targets opens the dialog offering only those, never the forward one also declared', async () => {
    const user = userEvent.setup();
    const bothWays: WorkflowDef = {
      ...WF_ERRAND,
      transitions: [...WF_ERRAND.transitions, { from: 'waiting', to: 'done', rules: [] }],
    };
    const { moves } = movesFor({}, bothWays);
    render(<Board board={errandBoardWithCardIn('waiting')} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    await user.click(screen.getByRole('button', { name: 'Move to previous state — Doing or To do' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
    const listbox = await screen.findByRole('listbox');
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((option) => option.textContent)
        .sort(),
    ).toEqual(['Doing', 'To do']);
    expect(within(listbox).queryByRole('option', { name: 'Done' })).toBeNull();
  });

  /**
   * 13.531 — ONE forward target that carries a rule: the dialog opens
   * ALREADY AIMED at it. `13.501` reaches the same dialog and then picks
   * "Doing" from the select as a person had to; this case proves that pick
   * is no longer needed — the trigger already reads "Doing" and the comment
   * box is on screen from the first paint. The single-target arrow keeps
   * its plain "Move to Doing" name (no "or", nothing to choose).
   */
  it('one gated forward target opens the dialog already aimed, comment box visible with no pick', async () => {
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
    expect(within(dialog).getByRole('button', { name: /Move to/ })).toHaveTextContent('Doing');
    expect(within(dialog).getByRole('button', { name: /Move to/ })).not.toHaveTextContent(
      'Choose a state',
    );
    const comment = within(dialog).getByLabelText('Comment (required by this transition)');
    await user.type(comment, 'starting');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(source.ingested[0]![0]!.payload).toEqual({ to: 'doing', comment: { text: 'starting' } });
  });

  /**
   * 13.532 — a closed-and-reopened dialog does not remember its last pick.
   * Before this, `TransitionDialog` stayed mounted while closed and its
   * `toStateId` state survived, so cancelling after choosing "Done" and
   * clicking `›` again reopened ON "Done". Now the dialog mounts fresh per
   * open (`MoveArrows` renders it only while its `dialog` state is
   * non-null), so the second open is back on "Choose a state".
   */
  it('cancelling a pick and reopening starts over on "Choose a state"', async () => {
    const user = userEvent.setup();
    const { moves } = movesFor();
    render(<Board board={errandBoardWithCardIn('doing')} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    const next = screen.getByRole('button', {
      name: 'Move to next state — Waiting on counterparty or Done',
    });
    await user.click(next);
    let dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
    expect(within(dialog).getByRole('button', { name: /Move to/ })).toHaveTextContent('Done');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Move ticket' })).toBeNull();

    await user.click(next);
    dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(within(dialog).getByRole('button', { name: /Move to/ })).toHaveTextContent('Choose a state');
  });

  /**
   * E5-25 (round-2 ruling, IMPORTANT) — a move whose session ENDED is not a move
   * the server could not be reached for.
   *
   * The shipped catch painted every thrown cause as *"We could not reach the
   * server for this move — HTTP 401 for /v1/events"*: the server was reached and
   * answered the one thing this product treats as its own category, and the
   * person was given neither the true sentence nor the way back in. The cause
   * arrives here as `SessionExpiredError` — a view may not import `HttpError`
   * at all (`test/no-http-in-views.test.ts`, case 3.35) — so the adapter that
   * has the status is where the classification is made, and
   * `test/online/online-data-source.test.ts` is where a real 401 is proven to
   * become it.
   */
  it('13.1157 E5-25 a move whose session ended says so, and is not painted as a transport failure', async () => {
    const user = userEvent.setup();
    const { moves } = movesFor({}, WF_ERRAND, async () => {
      throw new SessionExpiredError('/v1/events');
    });
    render(<Board board={errandBoard()} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    await user.click(screen.getByRole('button', { name: 'Move to Doing' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SESSION_EXPIRED_COPY);
    expect(alert).not.toHaveTextContent('could not reach the server');
    // The register says the same thing the sentence does — see
    // `writeFailureRefusalClass`'s own docblock.
    expect(alert).toHaveClass('gn-refusal--session');
    expect(alert).not.toHaveClass('gn-refusal--transport');
    // The control that keeps this from passing on a component that simply
    // stopped working: the arrow is usable again afterwards.
    expect(screen.getByRole('button', { name: 'Move to Doing' })).not.toBeDisabled();
  });

});
