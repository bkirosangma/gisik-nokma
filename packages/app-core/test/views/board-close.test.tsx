import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardCard, BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';
import { TICKET, WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * Backlog/closed spec §5.2 (2026-09-17), task 8 of the
 * `2026-09-17-backlog-and-closed-core` plan — the board's own **Close**
 * button, rendered beside the two move arrows on a card sitting in a
 * **terminal** column. Sibling to `board-moves-ui.test.tsx` (the arrows'
 * write path) rather than an addition to it, following the convention that
 * file's own docblock and `board-drag-drop.test.tsx`/`board-card-click.test.tsx`
 * already set for themselves relative to `board.test.tsx`.
 *
 * `WF_ERRAND`'s only terminal state is `done`; `doing` is the non-terminal
 * fixture for the negative case (verified against `helpers/seed.ts`, not
 * assumed). From `done`, `columnOrder` (`['todo', 'doing', 'waiting',
 * 'done']`) and `WF_ERRAND`'s own declared edges (`done -> doing`, and the
 * universal `* -> todo`) make `arrowTargets(..., 'previous')` answer BOTH
 * `doing` and `todo` — `‹` is a live, two-target picker from this column,
 * never a bare "Move to Doing" — while `arrowTargets(..., 'next')` is
 * structurally empty (`done` is the last column; nothing sits past it), so
 * `›` is permanently disabled REGARDLESS of the `submitting` latch this file
 * exercises. Every assertion below about the latch resetting therefore reads
 * `‹` and **Close**, never `›` — asserting `›` "enabled again" would fail for
 * a reason that has nothing to do with the latch this task is proving.
 */

const CURRENT_USER = 'user_kiro';

/** One `BoardGroup` over `WF_ERRAND`'s four columns, with `cards` seated in `stateId` and every other column empty. */
function errandGroupWithCardIn(stateId: string, cards = [boardCardSeed()]): BoardGroup {
  const cardsFor = (column: string) => (column === stateId ? cards : []);
  return {
    workflowId: 'wf-errand',
    workflowVersion: 1,
    workflowName: 'Errand',
    columns: [
      { stateId: 'todo', name: 'To do', category: 'open', blocked: false, cards: cardsFor('todo') },
      { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, cards: cardsFor('doing') },
      {
        stateId: 'waiting',
        name: 'Waiting on counterparty',
        category: 'active',
        blocked: true,
        cards: cardsFor('waiting'),
      },
      { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, cards: cardsFor('done') },
    ],
  };
}

function errandBoardWithCardIn(stateId: string): BoardView {
  return { projectId: 'prj_1', groups: [errandGroupWithCardIn(stateId)] };
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

/** Mirrors `board-moves-ui.test.tsx`'s own `settled()` — the board is fully painted with arrows/Close only once the workflow read resolves. */
async function settled(): Promise<void> {
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0),
  );
}

describe('Board Close button — terminal columns only (backlog/closed spec §5.2, 2026-09-17; case 13.589)', () => {
  /**
   * 13.589 — a card in a terminal column (`done`) renders Close beside the
   * arrows, and clicking it submits exactly one `ticket.closed` with the
   * empty payload spec §1.2 gives the envelope-only event, then calls
   * `moves.onMoved()` — the SAME callback `submitDirect`'s own `committed`
   * branch calls, which is `board.reload()` in the real page. The server's
   * own `getBoard` excludes closed tickets (spec §3.2), so what removes the
   * card from the board is that reload seeing a shorter list next time, not
   * anything this component does locally — this test asserts the ingest and
   * the call, not a disappearance `useBoard`'s own live-query hook is what
   * would have to fake.
   */
  it('renders Close on a terminal card and clicking it ingests one ticket.closed and calls onMoved', async () => {
    const user = userEvent.setup();
    const card = boardCardSeed();
    const { source, moves, onMoved } = movesFor();
    render(<Board board={errandBoardWithCardIn('done')} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    const closeButton = screen.getByRole('button', { name: `Close ${card.title}` });
    await user.click(closeButton);

    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(source.ingested).toHaveLength(1);
    const batch = source.ingested[0]!;
    expect(batch).toHaveLength(1);
    expect(batch[0]!.type).toBe('ticket.closed');
    expect(batch[0]!.payload).toEqual({});
    expect(batch[0]!.actorId).toBe(CURRENT_USER);
    expect(batch[0]!.origin).toBe('web');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * 13.589 — the paired negative: `doing` (WF_ERRAND's own non-terminal
   * fixture, `stateCategory: 'active'`) renders no Close button at all, not
   * merely a disabled one — `MoveArrows` derives `category` from
   * `stateCategoryOf(workflow, fromStateId)` and gates the button's
   * existence on `category === 'terminal'`, mirroring the arrows' own
   * "unavailable, not absent" doc EXCEPT in the opposite direction: an arrow
   * always renders and is sometimes disabled, while Close is a control this
   * column genuinely does not offer at all.
   */
  it('renders no Close button on a card in a non-terminal column', async () => {
    const card = boardCardSeed();
    const { moves } = movesFor();
    render(<Board board={errandBoardWithCardIn('doing')} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    expect(screen.queryByRole('button', { name: `Close ${card.title}` })).not.toBeInTheDocument();
  });

  /**
   * 13.589 — Close follows the exact same click-bail path the two arrows
   * already do (`BoardCardSlot`'s `CARD_CLICK_BAIL_SELECTOR` bails on any
   * `button` descendant; `board-card-click.test.tsx`'s own "a click on a
   * move arrow does NOT open the ticket" case proves the mechanism for
   * `.gn-board-card__move`). Proven here rather than assumed, and PAIRED
   * with the positive control in the same test — a click on Close that did
   * nothing at all would also leave `onOpenTicket` uncalled, so the negative
   * alone would not discriminate "correctly bailed" from "button is dead".
   */
  it('a click on Close never opens the ticket, unlike a click on the card body', async () => {
    const user = userEvent.setup();
    const card = boardCardSeed();
    const onOpenTicket = vi.fn();
    const { moves } = movesFor();
    render(<Board board={errandBoardWithCardIn('done')} onOpenTicket={onOpenTicket} moves={moves} />);
    await settled();

    // The positive control: the card's own title button opens the ticket.
    await user.click(screen.getByRole('button', { name: card.title }));
    expect(onOpenTicket).toHaveBeenCalledTimes(1);
    expect(onOpenTicket).toHaveBeenCalledWith(TICKET);
    onOpenTicket.mockClear();

    // The negative: Close, a `button` descendant of the same card slot, bails.
    await user.click(screen.getByRole('button', { name: `Close ${card.title}` }));
    expect(onOpenTicket).not.toHaveBeenCalled();
  });
});

describe('Board Close button — the refusal/transport split (backlog/closed spec §5.2; mirrors 13.504\'s two-branch shape; case 13.590)', () => {
  /**
   * 13.590, branch 1 — a REAL server refusal of `ticket.closed` renders
   * through the existing server-refusal notice (`role="alert"`,
   * `.gn-refusal--server`), the rule and reason carried VERBATIM — the same
   * invariant every other refusal on this board holds. `‹` (a live,
   * two-target picker from `done` — see this file's own top docblock) and
   * Close both re-enable once the answer settles; `›` stays disabled
   * throughout, structurally, since `done` has no declared forward edge at
   * all — asserted here too, so a future reader does not mistake its
   * permanent `disabled` for a latch that failed to clear.
   */
  it('a refused close renders the server notice verbatim, and Close/‹ re-enable (not ›, which has no forward edge)', async () => {
    const user = userEvent.setup();
    const { moves } = movesFor(WF_ERRAND, async (events) =>
      events.map((event) => ({
        status: 'refused' as const,
        eventId: event.id,
        rule: 'close-requires-terminal',
        reason: 'A ticket can only be closed from a terminal state; "Done" is not one.',
      })),
    );
    const card = boardCardSeed();
    render(<Board board={errandBoardWithCardIn('done')} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    await user.click(screen.getByRole('button', { name: `Close ${card.title}` }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('gn-refusal--server');
    expect(alert).toHaveTextContent(
      'Refused by the server — close-requires-terminal: A ticket can only be closed from a terminal state; "Done" is not one.',
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Move to previous state — Doing or To do' })).not.toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: `Close ${card.title}` })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move to next state — unavailable' })).toBeDisabled();
  });

  /**
   * 13.590, branch 2 — a REJECTED `ingest` (transport failure, not a server
   * answer) never claims to be the server's own verdict: Ruling 27's own
   * distinction, mirrored by `closeCard` exactly as `submitDirect` already
   * carries it. Renders through `.gn-refusal--transport` with the "this
   * close" wording, the words "Refused by the server" absent from the
   * document, and Close/‹ re-enable identically to the refused branch above.
   */
  it('a rejected ingest renders the amber transport notice, never "Refused by the server", and Close/‹ re-enable', async () => {
    const user = userEvent.setup();
    const { moves } = movesFor(WF_ERRAND, async () => {
      throw new Error('network unreachable');
    });
    const card = boardCardSeed();
    render(<Board board={errandBoardWithCardIn('done')} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    await user.click(screen.getByRole('button', { name: `Close ${card.title}` }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('gn-refusal--transport');
    expect(alert).not.toHaveClass('gn-refusal--server');
    expect(alert).toHaveTextContent('We could not reach the server for this close — network unreachable');
    expect(document.body.textContent).not.toContain('Refused by the server');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Move to previous state — Doing or To do' })).not.toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: `Close ${card.title}` })).not.toBeDisabled();
  });
});

/** The same four columns, with `cardsByState` deciding which hold cards. */
function errandBoardWith(cardsByState: Record<string, BoardCard[]>): BoardView {
  const base = errandGroupWithCardIn('todo', []);
  return {
    projectId: 'prj_1',
    groups: [
      {
        ...base,
        columns: base.columns.map((column) => ({
          ...column,
          cards: cardsByState[column.stateId] ?? [],
        })),
      },
    ],
  };
}

/** A committed answer for `event`, shaped exactly as the real door answers (results are read BY INDEX). */
function committed(event: { id: string }, seq: number) {
  return {
    status: 'committed' as const,
    eventId: event.id,
    seq,
    serverTime: '2026-09-18T09:00:00.000Z',
  };
}

/**
 * The COLUMN-level bulk close — spec §8.3's "Board" bullet, second wave Task
 * 10 (2026-09-18). Sibling describe to the per-card Close above, in this same
 * file as the plan directs: the two are different surfaces (one card vs. the
 * whole column) sharing one dialog, and reading them together is the point.
 *
 * `WF_ERRAND`'s only terminal state is `done`; `doing` is the non-terminal
 * fixture for the negatives, exactly as in the block above.
 */
describe('Board Close all (N) — a terminal column’s bulk close (spec §8.3, 2026-09-18 second wave; cases 13.789–13.792)', () => {
  /**
   * 13.789 — the action itself. A terminal column holding cards renders one
   * button naming the column and its count; a NON-terminal column holding a
   * card renders none (the gate is `category === 'terminal'`, so this is a
   * control that does not exist, not one that is disabled); and the plain
   * `moves`-less board renders none anywhere, because there is no
   * `dataSource`/`workspaceId`/`currentUserId` to open a dialog with.
   *
   * The `moves`-less half is asserted by an explicit `cleanup()` and a second
   * render rather than assumed from the first: React Testing Library unmounts
   * between TESTS, not within one, so a bare second `render()` would leave both
   * trees mounted and `queryByRole` would be answering about either.
   */
  it('13.789 — a terminal column with cards shows Close all (N), a non-terminal one shows none, and confirming ingests ONE batch and reloads', async () => {
    const user = userEvent.setup();
    const alpha = boardCardSeed({ ticketId: 'tk_alpha', title: 'Alpha' });
    const beta = boardCardSeed({ ticketId: 'tk_beta', title: 'Beta' });
    const doing = boardCardSeed({ ticketId: 'tk_doing', title: 'Doing one' });
    const { source, moves, onMoved } = movesFor();
    render(
      <Board
        board={errandBoardWith({ done: [alpha, beta], doing: [doing] })}
        onOpenTicket={() => {}}
        moves={moves}
      />,
    );
    await settled();

    const action = screen.getByRole('button', { name: 'Close all 2 in Done' });
    expect(action).toHaveTextContent('Close all (2)');
    // The negative that carries the gate: `Doing` HOLDS a card and still offers
    // no action, so this discriminates on the column's category rather than on
    // the column being empty.
    expect(screen.queryByRole('button', { name: /^Close all \d+ in Doing$/ })).not.toBeInTheDocument();

    await user.click(action);
    const dialog = await screen.findByRole('dialog', { name: 'Close 2 tickets' });
    expect(within(dialog).getByText('Alpha')).toBeInTheDocument();
    expect(within(dialog).getByText('Beta')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close 2 tickets' }));

    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(source.ingested).toHaveLength(1);
    const batch = source.ingested[0]!;
    expect(batch).toHaveLength(2);
    expect(batch.map((event) => event.type)).toEqual(['ticket.closed', 'ticket.closed']);
    // In the LISTED order — the dialog reads its answers by index, so the
    // order of the batch is load-bearing rather than cosmetic.
    expect(batch.map((event) => event.entity.id)).toEqual(['tk_alpha', 'tk_beta']);
    expect(batch.every((event) => event.origin === 'web')).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // EVERYTHING committed, so the dialog LEAVES. This is the board clearing
    // its own `bulkClose` in `onClosed`; without it the dialog stays mounted
    // and empty — the failure 13.792 pins from the other side.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    cleanup();
    const { moves: readOnlyMoves } = movesFor();
    render(
      <Board
        board={errandBoardWith({ done: [alpha, beta] })}
        onOpenTicket={() => {}}
        moves={readOnlyMoves}
      />,
    );
    await settled();
    expect(screen.getByRole('button', { name: 'Close all 2 in Done' })).toBeInTheDocument();

    cleanup();
    render(<Board board={errandBoardWith({ done: [alpha, beta] })} onOpenTicket={() => {}} />);
    expect(screen.queryByRole('button', { name: /^Close all/ })).not.toBeInTheDocument();
  });

  /**
   * 13.790 — an EMPTY terminal column offers nothing. The button's count is
   * `column.cards.length`, and `Close all (0)` would be a control whose only
   * possible outcome is a dialog listing nothing; spec §8.3 words the action as
   * "N = cards in the column", so a column with no cards does not have it.
   */
  it('13.790 — an empty terminal column shows no Close all button', async () => {
    const { moves } = movesFor();
    render(
      <Board
        board={errandBoardWith({ doing: [boardCardSeed()] })}
        onOpenTicket={() => {}}
        moves={moves}
      />,
    );
    await settled();

    expect(screen.queryByRole('button', { name: /^Close all/ })).not.toBeInTheDocument();
  });

  /**
   * 13.791 — the action lives in the column `<header>`, OUTSIDE `BoardCardSlot`,
   * so the card-click bail (`CARD_CLICK_BAIL_SELECTOR`) never comes into play
   * here. Asserted anyway, with its positive control in the same test: the
   * card's own title button opens the ticket, and the column action does not.
   * Without the control the negative could not tell "correctly inert" from
   * "the handler is dead".
   */
  it('13.791 — a click on Close all never opens a ticket, unlike a click on the card body', async () => {
    const user = userEvent.setup();
    const onOpenTicket = vi.fn();
    const alpha = boardCardSeed({ ticketId: 'tk_alpha', title: 'Alpha' });
    const { moves } = movesFor();
    render(
      <Board board={errandBoardWith({ done: [alpha] })} onOpenTicket={onOpenTicket} moves={moves} />,
    );
    await settled();

    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(onOpenTicket).toHaveBeenCalledTimes(1);
    onOpenTicket.mockClear();

    await user.click(screen.getByRole('button', { name: 'Close all 1 in Done' }));
    expect(onOpenTicket).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog', { name: 'Close 1 ticket' })).toBeInTheDocument();
  });

  /**
   * 13.792 — THE PARTIAL CLOSE, and the reason the board's clear is
   * CONDITIONAL. Spec §8.3's Board bullet holds both halves in one sentence:
   * *"Per-ticket refusals … stay listed; the rest close and the board
   * reloads."*
   *
   * So `onClosed` fires on a partial too, and the board must reload — but it
   * must NOT clear `bulkClose`, because clearing is what unmounts the dialog
   * and destroys the `Could not close` rows the spec requires it to keep on
   * screen. `closedIds.length === tickets.length` is the full-success test.
   *
   * The controller's dispatch for this task said "clear its own `bulkClose`
   * state inside `onClosed`" without qualification, and the plan's text says
   * nothing at all; an UNCONDITIONAL clear satisfies both and silently deletes
   * this half of §8.3 from the board surface. This case is the witness.
   */
  it('13.792 — a PARTIAL close reloads the board and KEEPS the dialog, with the refusal still listed', async () => {
    const user = userEvent.setup();
    const alpha = boardCardSeed({ ticketId: 'tk_alpha', title: 'Alpha' });
    const beta = boardCardSeed({ ticketId: 'tk_beta', title: 'Beta' });
    const { moves, onMoved } = movesFor(WF_ERRAND, async (events) =>
      events.map((event) =>
        event.entity.id === 'tk_beta'
          ? {
              status: 'refused' as const,
              eventId: event.id,
              rule: 'close-requires-terminal',
              reason: 'Not in a terminal state.',
            }
          : committed(event, 1),
      ),
    );
    render(
      <Board
        board={errandBoardWith({ done: [alpha, beta] })}
        onOpenTicket={() => {}}
        moves={moves}
      />,
    );
    await settled();

    await user.click(screen.getByRole('button', { name: 'Close all 2 in Done' }));
    const dialog = await screen.findByRole('dialog', { name: 'Close 2 tickets' });
    await user.click(within(dialog).getByRole('button', { name: 'Close 2 tickets' }));

    // "the rest close and the board reloads"
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));

    // "Per-ticket refusals … stay listed"
    const stillOpen = await screen.findByRole('dialog', { name: 'Close 2 tickets' });
    expect(within(stillOpen).getByText('Could not close')).toBeInTheDocument();
    expect(within(stillOpen).getByText('Beta — Not in a terminal state.')).toBeInTheDocument();
    // Alpha committed, so it is no longer pending, and nothing is left to try.
    expect(within(stillOpen).queryByText('Alpha')).not.toBeInTheDocument();
    expect(within(stillOpen).queryByRole('button', { name: 'Close 1 ticket' })).not.toBeInTheDocument();
  });

  /**
   * 13.793 — AN OPEN DIALOG'S TICKETS CANNOT BE SWAPPED UNDER IT.
   *
   * `BulkCloseDialog` states its own precondition at the top of its docblock —
   * a parent that swaps `tickets` while the dialog stays OPEN is *not covered
   * by its reset*, and it declares that this "cannot arise" for its two named
   * consumers. For this consumer it could: `open` is `bulkClose !== null`, so
   * writing a second column's tickets into a non-null `bulkClose` is a swap
   * with no `open` transition, the `useEffect(…, [open])` never fires, and the
   * previous opening's `closedIds`/`failures` survive against a list they do
   * not describe. `openBulkClose` now refuses that write — case 13.793 is the
   * witness, and `board.tsx`'s docblock there has the full reasoning, including
   * why a `key` on the dialog (remount) would be WORSE rather than merely
   * different: it re-opens the late-callback defect 13.787 closed.
   *
   * **Reaching the second button with the dialog open is a KEYBOARD path in a
   * browser, not a pointer one** — `Dialog` renders a full-viewport scrim that
   * blocks pointer events, and the button is only reachable if focus escapes
   * the modal (`Dialog` ships no focus trap and no portal; recorded as a named
   * follow-on on the shared component). **jsdom does not hit-test the scrim**,
   * so an ordinary `user.click` here exercises exactly the state transition the
   * escaped-focus path would produce, which is why the invariant is testable at
   * all in this harness. The click is a PROXY for the focus escape, and the
   * docblock says so rather than implying a pointer can do it.
   */
  it('13.793 — an open dialog’s tickets cannot be swapped under it by another column’s action', async () => {
    const user = userEvent.setup();
    const alpha = boardCardSeed({ ticketId: 'tk_alpha', title: 'Alpha' });
    const beta = boardCardSeed({ ticketId: 'tk_beta', title: 'Beta' });
    const gamma = boardCardSeed({ ticketId: 'tk_gamma', title: 'Gamma' });
    const { moves } = movesFor(WF_ERRAND, async (events) =>
      events.map((event) =>
        event.entity.id === 'tk_beta'
          ? {
              status: 'refused' as const,
              eventId: event.id,
              rule: 'close-requires-terminal',
              reason: 'Not in a terminal state.',
            }
          : committed(event, 1),
      ),
    );
    // TWO terminal columns, so there are two live column actions at once. A
    // second `terminal` column is data the component never inspects — the gate
    // reads `column.category` and nothing else — so this needs no new fixture
    // vocabulary.
    const base = errandGroupWithCardIn('todo', []);
    const board: BoardView = {
      projectId: 'prj_1',
      groups: [
        {
          ...base,
          columns: [
            ...base.columns.filter((column) => column.stateId !== 'done'),
            { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, cards: [alpha, beta] },
            {
              stateId: 'archived',
              name: 'Archived',
              category: 'terminal',
              blocked: false,
              cards: [gamma],
            },
          ],
        },
      ],
    };
    render(<Board board={board} onOpenTicket={() => {}} moves={moves} />);
    await settled();

    // Open on Done and drive it to a PARTIAL outcome, which is what leaves the
    // dialog mounted with state that a swap would misdescribe.
    await user.click(screen.getByRole('button', { name: 'Close all 2 in Done' }));
    const dialog = await screen.findByRole('dialog', { name: 'Close 2 tickets' });
    await user.click(within(dialog).getByRole('button', { name: 'Close 2 tickets' }));
    await waitFor(() =>
      expect(within(screen.getByRole('dialog')).getByText('Could not close')).toBeInTheDocument(),
    );

    // The swap attempt. Under the pre-guard code this replaced the dialog's
    // ticket list: the title became `Close 1 ticket`, `Gamma` appeared, and the
    // stale `Beta` refusal stayed pinned beside it.
    await user.click(screen.getByRole('button', { name: 'Close all 1 in Archived' }));

    const unchanged = screen.getByRole('dialog');
    expect(unchanged).toHaveAccessibleName('Close 2 tickets');
    expect(within(unchanged).getByText('Could not close')).toBeInTheDocument();
    expect(within(unchanged).getByText('Beta — Not in a terminal state.')).toBeInTheDocument();
    expect(within(unchanged).queryByText('Gamma')).not.toBeInTheDocument();

    // ...and the refusal did not WEDGE the surface: dismissing and opening the
    // other column then behaves like any first opening.
    await user.click(within(unchanged).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Close all 1 in Archived' }));
    const fresh = await screen.findByRole('dialog', { name: 'Close 1 ticket' });
    expect(within(fresh).getByText('Gamma')).toBeInTheDocument();
    expect(within(fresh).queryByText('Could not close')).not.toBeInTheDocument();
  });
});
