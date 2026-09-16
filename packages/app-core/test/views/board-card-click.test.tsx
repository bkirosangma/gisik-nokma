import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { TICKET, WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * The whole card opens the ticket (owner request, 2026-09-17), not only its
 * title. A sibling file, following the convention `board-moves-ui.test.tsx`
 * and `board-drag-drop.test.tsx` each set for themselves relative to
 * `board.test.tsx`: the cases here straddle the READ-ONLY path (no `moves`,
 * where nothing can be dragged) and the write path (arrows, a drag, and the
 * `TransitionDialog` that renders INSIDE the card), so neither existing file
 * is the natural home for all of them.
 *
 * Every negative case here — a click that must NOT open the ticket — is the
 * point of the file. "Clicking the body opens it" is the easy half; the hard
 * half is that the arrows, the provenance toggle, a drag, and the dialog's
 * own scrim all live inside the very element that now listens for clicks.
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

function errandBoard(): BoardView {
  return { projectId: 'prj_1', groups: [errandGroup()] };
}

/**
 * `todo → doing` gated on a comment, so the `›` arrow from `todo` opens the
 * `TransitionDialog` rather than submitting directly — the one way to put a
 * dialog (and its scrim) on screen INSIDE the card from a real click.
 */
const WF_GATED: WorkflowDef = {
  ...WF_ERRAND,
  transitions: [
    { from: 'todo', to: 'doing', rules: [{ kind: 'require-comment' }] },
    { from: 'doing', to: 'done', rules: [] },
  ],
};

function movesFor(workflow: WorkflowDef = WF_ERRAND) {
  const source = createFakeDataSource({ getWorkflowDef: async () => workflow });
  const moves: BoardMoveCapability = {
    dataSource: source,
    workspaceId: WS,
    currentUserId: CURRENT_USER,
    onMoved: vi.fn(),
  };
  return { source, moves };
}

/** Same idiom as `board-moves-ui.test.tsx`'s `settled()` — arrows painted means the workflow read resolved. */
async function settled(): Promise<void> {
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0),
  );
}

/** The `DataTransfer` stand-in `board-drag-drop.test.tsx` documents — jsdom 25 has no `DataTransfer` constructor. */
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

/** The card's own container — the plain `Card` div, no button anywhere on the path from it up to the slot. */
function cardBody(): HTMLElement {
  const body = screen.getByTestId(`ticket-card-${TICKET}`).querySelector<HTMLElement>('.gn-board-card');
  if (body === null) throw new Error('no .gn-board-card rendered inside the slot');
  return body;
}

describe('Board card — clicking anywhere on the card opens the ticket', () => {
  /** 13.518 — the body itself, not a button inside it, with no `moves` wired (the read-only path). */
  it('a click on the card body calls onOpenTicket once with that ticket id', async () => {
    const user = userEvent.setup();
    const onOpenTicket = vi.fn();
    render(<Board board={errandBoard()} onOpenTicket={onOpenTicket} />);

    await user.click(cardBody());

    expect(onOpenTicket).toHaveBeenCalledTimes(1);
    expect(onOpenTicket).toHaveBeenCalledWith(TICKET);
  });

  /**
   * 13.519 — the title stays a real `<button>` (the keyboard path and the
   * accessible name), and its click bubbles up through the card: exactly ONE
   * open, never two. A card-level handler that did not bail on the button
   * would open the sheet twice from one click.
   */
  it('a click on the title button still opens the ticket exactly once', async () => {
    const user = userEvent.setup();
    const onOpenTicket = vi.fn();
    render(<Board board={errandBoard()} onOpenTicket={onOpenTicket} />);

    await user.click(screen.getByRole('button', { name: 'File the GST return' }));

    expect(onOpenTicket).toHaveBeenCalledTimes(1);
  });

  /** 13.520a — the provenance toggle is a control of its own; toggling it is not opening the ticket. */
  it('a click on the provenance toggle unfolds it and does NOT open the ticket', async () => {
    const user = userEvent.setup();
    const onOpenTicket = vi.fn();
    render(<Board board={errandBoard()} onOpenTicket={onOpenTicket} />);

    const toggle = screen.getByRole('button', { name: 'who · when' });
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(onOpenTicket).not.toHaveBeenCalled();
  });

  /** 13.520b — a move arrow (write path) submits a move; it must not ALSO open the ticket. */
  it('a click on a move arrow does NOT open the ticket', async () => {
    const user = userEvent.setup();
    const onOpenTicket = vi.fn();
    const { moves } = movesFor();
    render(<Board board={errandBoard()} onOpenTicket={onOpenTicket} moves={moves} />);
    await settled();

    await user.click(screen.getByRole('button', { name: 'Move to Doing' }));
    await waitFor(() => expect(moves.onMoved).toHaveBeenCalledTimes(1));

    expect(onOpenTicket).not.toHaveBeenCalled();
  });
});

describe('Board card — a drag is not a click', () => {
  /**
   * 13.521 — THE GUARD THIS FILE EXISTS FOR. Native drag-and-drop withholds
   * `click` after a completed drag in every browser this product targets, so
   * in the field this guard is belt-and-braces; in jsdom, which drags
   * nothing, it is the only observable proof that a drag cannot open the
   * sheet. The sequence is a real gesture's: `mousedown` (the press that
   * starts everything), `dragstart` (the browser decided it is a drag), then
   * a stray `click` — which must be swallowed. The SECOND half is the
   * positive control for the first: a fresh `mousedown` clears the flag, so
   * the next plain click opens the ticket as usual. Delete the guard and the
   * first assertion fails; delete the reset and the second does.
   */
  it('a click that follows dragstart is swallowed; the next fresh click opens the ticket', async () => {
    const onOpenTicket = vi.fn();
    const { moves } = movesFor();
    render(<Board board={errandBoard()} onOpenTicket={onOpenTicket} moves={moves} />);
    await settled();

    const slot = screen.getByTestId(`ticket-card-${TICKET}`);
    fireEvent.mouseDown(cardBody());
    fireEvent.dragStart(slot, { dataTransfer: fakeDataTransfer() });
    fireEvent.click(cardBody());
    expect(onOpenTicket).not.toHaveBeenCalled();

    fireEvent.mouseDown(cardBody());
    fireEvent.click(cardBody());
    expect(onOpenTicket).toHaveBeenCalledTimes(1);
  });
});

describe('Board card — the TransitionDialog renders INSIDE the card', () => {
  /**
   * 13.522 — `MoveArrows` mounts `TransitionDialog` under the card, and
   * `Dialog` (`packages/ui`) does not portal. Its scrim closes the dialog on
   * click WITHOUT stopping propagation, so a scrim click bubbles up into the
   * card's own listener. Without a bail-out for the dialog subtree, closing
   * the dialog by clicking outside it would open the ticket sheet in the
   * same gesture. Checked with a REAL dialog reached by a real arrow click,
   * not by rendering the dialog in isolation.
   */
  it('clicking the dialog scrim closes the dialog and does NOT open the ticket', async () => {
    const user = userEvent.setup();
    const onOpenTicket = vi.fn();
    const { moves } = movesFor(WF_GATED);
    render(<Board board={errandBoard()} onOpenTicket={onOpenTicket} moves={moves} />);
    await settled();

    await user.click(screen.getByRole('button', { name: 'Move to Doing' }));
    expect(screen.getByRole('dialog', { name: 'Move ticket' })).toBeInTheDocument();

    await user.click(screen.getByTestId('dialog-scrim'));

    expect(screen.queryByRole('dialog', { name: 'Move ticket' })).not.toBeInTheDocument();
    expect(onOpenTicket).not.toHaveBeenCalled();
  });
});
