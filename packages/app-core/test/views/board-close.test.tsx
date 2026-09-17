import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardGroup, BoardView } from '../../src/view-types.js';
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
