import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { createClientStateCache } from '../../src/cache.js';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardCard, BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, ticketStateSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * Smoothness T12 (audit SM-10) — a board of hundreds of cards re-renders ONE slot when one card is grabbed, not all of
 * them. Case 25.201. The count is read where a render reads it: each card's `title` is a counting getter, so a slot
 * that re-renders (and re-renders its `BoardCardView`) shows up as a read, and nothing in the product is stamped for
 * the test's sake.
 */

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  document.querySelectorAll('.gn-board-drag-image').forEach((node) => node.remove());
});

const CARDS = 300;
const reads = new Map<string, number>();

function countedCard(index: number): BoardCard {
  const ticketId = `tk_${String(index).padStart(3, '0')}`;
  const card = boardCardSeed({ ticketId });
  Object.defineProperty(card, 'title', {
    enumerable: true,
    get() {
      reads.set(ticketId, (reads.get(ticketId) ?? 0) + 1);
      return `Ticket ${ticketId}`;
    },
  });
  return card;
}

function bigBoard(): BoardView {
  const cards = Array.from({ length: CARDS }, (_, index) => countedCard(index));
  const group: BoardGroup = {
    workflowId: 'wf-errand',
    workflowVersion: 1,
    workflowName: 'Errand',
    columns: [
      { stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards },
      { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: [] },
      { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: false, cards: [] },
    ],
  };
  return { projectId: 'prj_1', groups: [group] };
}

function dragData(): DataTransfer {
  const store = new Map<string, string>();
  const types: string[] = [];
  return {
    setData: (format: string, data: string) => {
      store.set(format, data);
      if (!types.includes(format)) types.push(format);
    },
    getData: (format: string) => store.get(format) ?? '',
    effectAllowed: 'uninitialized',
    dropEffect: 'move',
    types,
  } as unknown as DataTransfer;
}

/** The page hands `Board` a NEW `moves` object and a NEW `onOpenTicket` on every one of its renders; so does this. */
function pageOf(board: BoardView, moves: () => BoardMoveCapability) {
  return <Board board={board} onOpenTicket={() => {}} moves={moves()} />;
}

describe('25.201 one card grabbed re-renders one slot, not the board', () => {
  it('25.201 a drag over another column re-renders no card but the grabbed one; the control proves the section rendered', async () => {
    reads.clear();
    const board = bigBoard();
    const source = createFakeDataSource({ getWorkflowDef: async () => WF_ERRAND });
    const makeMoves = (): BoardMoveCapability => ({ dataSource: source, workspaceId: WS, currentUserId: 'user_kiro', onMoved: () => {} });
    const view = render(pageOf(board, makeMoves));
    // Every slot is draggable once the workflow resolves (the arrows factory is then non-null).
    await waitFor(() => expect(document.querySelectorAll('[draggable="true"]').length).toBe(CARDS));
    // CONTROL 1 — the first mount rendered every slot (the getter is a real measurement, not a silent zero).
    expect(reads.size).toBe(CARDS);

    // A parent render that changes nothing a card can see (the page re-renders for a filter, a toast, a poll):
    // fresh `moves` and `onOpenTicket` objects, the same board.
    reads.clear();
    view.rerender(pageOf(board, makeMoves));
    await act(async () => {});
    expect([...reads.keys()]).toEqual([]);

    reads.clear();
    const dataTransfer = dragData();
    const grabbed = screen.getByTestId('ticket-card-tk_150');
    (grabbed.firstElementChild as HTMLElement).getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 288, height: 132, right: 288, bottom: 132, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.dragStart(grabbed, { dataTransfer });
    fireEvent.dragEnter(screen.getByTestId('board-column-doing'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('board-column-doing'), { dataTransfer });
    await act(async () => {});
    // CONTROL 2 — the section DID render for the drag (its drop placeholder opened in the target column).
    expect(screen.queryByTestId('board-drop-placeholder-doing')).not.toBeNull();
    // THE PROPERTY — none of the 300 cards rendered again for it (the grabbed slot's own render is its next-frame placeholder).
    const rerendered = [...reads.keys()].filter((ticketId) => ticketId !== 'tk_150');
    expect(rerendered).toEqual([]);
  });
});

/**
 * Case 25.205 — the memo does not break drag-and-drop (watch item R-1, early no-op drags). A skipped slot's `MoveArrows`
 * keeps the `attemptMove` it registered at its last render, so the drop must still find it, and must still post exactly ONE
 * event for the grabbed id — also after the page re-rendered (fresh `moves`) between the grab and the drop.
 */
describe('25.205 a memoised slot still drops exactly once, and a same-column drop is still a no-op', () => {
  it('25.205 own-column drop posts nothing; a drop on another column posts one event for the grabbed id, across a page re-render', async () => {
    const board: BoardView = {
      projectId: 'prj_1',
      groups: [
        {
          workflowId: 'wf-errand',
          workflowVersion: 1,
          workflowName: 'Errand',
          columns: [
            {
              stateId: 'todo',
              name: 'To do',
              category: 'open',
              blocked: false,
              creatable: true,
              cards: ['tk_a', 'tk_b', 'tk_c'].map((ticketId) => boardCardSeed({ ticketId, title: `Ticket ${ticketId}` })),
            },
            { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: [] },
            { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: false, cards: [] },
          ],
        },
      ],
    };
    const source = createFakeDataSource({ getWorkflowDef: async () => WF_ERRAND });
    const onMoved = vi.fn();
    const makeMoves = (): BoardMoveCapability => ({ dataSource: source, workspaceId: WS, currentUserId: 'user_kiro', onMoved });
    const view = render(pageOf(board, makeMoves));
    await waitFor(() => expect(document.querySelectorAll('[draggable="true"]').length).toBe(3));

    // Own column: a no-op, and the board re-renders around it.
    const first = dragData();
    fireEvent.dragStart(screen.getByTestId('ticket-card-tk_b'), { dataTransfer: first });
    view.rerender(pageOf(board, makeMoves));
    fireEvent.drop(screen.getByTestId('board-column-todo'), { dataTransfer: first });
    await act(async () => {});
    expect(source.ingested).toHaveLength(0);
    expect(onMoved).not.toHaveBeenCalled();
    fireEvent.dragEnd(screen.getByTestId('ticket-card-tk_b'), { dataTransfer: first });

    // CONTROL — the same card, the same re-render in between, dropped on another column: exactly one move, for that card.
    const second = dragData();
    fireEvent.dragStart(screen.getByTestId('ticket-card-tk_b'), { dataTransfer: second });
    view.rerender(pageOf(board, makeMoves));
    fireEvent.drop(screen.getByTestId('board-column-doing'), { dataTransfer: second });
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(source.ingested).toHaveLength(1);
    expect(source.ingested[0]![0]!.payload).toEqual({ to: 'doing' });
    expect(source.ingested[0]![0]!.entity).toMatchObject({ id: 'tk_b' });
  });
});

/** Three cards in `todo` and the errand columns: the shape 25.205 uses, named once for 25.207 and 25.209. */
function threeCardBoard(): BoardView {
  return {
    projectId: 'prj_1',
    groups: [
      {
        workflowId: 'wf-errand',
        workflowVersion: 1,
        workflowName: 'Errand',
        columns: [
          {
            stateId: 'todo',
            name: 'To do',
            category: 'open',
            blocked: false,
            creatable: true,
            cards: ['tk_a', 'tk_b', 'tk_c'].map((ticketId) => boardCardSeed({ ticketId, title: `Ticket ${ticketId}` })),
          },
          { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: [] },
          { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: false, cards: [] },
        ],
      },
    ],
  };
}

/**
 * Case 25.207 — the page hands `Board` NEW `onOpenTicket` and `onMoved` closures on every render, and a memo-skipped slot
 * must still call the NEWEST one (the latest-ref), never the one it was last rendered with. Each half has its control:
 * before the page re-renders, the FIRST closure is the one that fires (so "the old one is not called" is a measurement).
 */
describe('25.207 a memo-skipped slot calls the newest callbacks the page gave it', () => {
  it('25.207 a click opens through the newest onOpenTicket and a drop reports through the newest onMoved', async () => {
    const board = threeCardBoard();
    const source = createFakeDataSource({ getWorkflowDef: async () => WF_ERRAND });
    const firstOpen = vi.fn();
    const secondOpen = vi.fn();
    const firstMoved = vi.fn();
    const secondMoved = vi.fn();
    const pageOf = (onOpenTicket: (id: string) => void, onMoved: () => void) => (
      <Board
        board={board}
        onOpenTicket={onOpenTicket}
        moves={{ dataSource: source, workspaceId: WS, currentUserId: 'user_kiro', onMoved }}
      />
    );
    const view = render(pageOf(firstOpen, firstMoved));
    await waitFor(() => expect(document.querySelectorAll('[draggable="true"]').length).toBe(3));

    // CONTROL — before any page re-render the first closures are the live ones.
    fireEvent.click(screen.getByText('Ticket tk_a'));
    expect(firstOpen).toHaveBeenCalledWith('tk_a');
    const first = dragData();
    fireEvent.dragStart(screen.getByTestId('ticket-card-tk_a'), { dataTransfer: first });
    fireEvent.drop(screen.getByTestId('board-column-doing'), { dataTransfer: first });
    await waitFor(() => expect(firstMoved).toHaveBeenCalledTimes(1));
    fireEvent.dragEnd(screen.getByTestId('ticket-card-tk_a'), { dataTransfer: first });

    // THE PROPERTY — the page re-renders with NEW closures; the other cards' slots are memo-skipped.
    view.rerender(pageOf(secondOpen, secondMoved));
    await act(async () => {});
    fireEvent.click(screen.getByText('Ticket tk_b'));
    expect(secondOpen).toHaveBeenCalledTimes(1);
    expect(secondOpen).toHaveBeenCalledWith('tk_b');
    expect(firstOpen).toHaveBeenCalledTimes(1);

    const second = dragData();
    fireEvent.dragStart(screen.getByTestId('ticket-card-tk_c'), { dataTransfer: second });
    fireEvent.drop(screen.getByTestId('board-column-doing'), { dataTransfer: second });
    await waitFor(() => expect(secondMoved).toHaveBeenCalledTimes(1));
    expect(firstMoved).toHaveBeenCalledTimes(1);
  });
});

/**
 * Case 25.209 — the capability a slot's `MoveArrows` receives is REBUILT by the board (so it can stay still while the page's
 * `moves` object changes), and the two OPTIONAL fields it carries must still reach the card after a page re-render: the
 * `cache` the instant pre-check reads, and the `uploadEvidence` the Move dialog's file input calls. Both go through a
 * memo-skipped slot; each half has its own control (the same flow without the field shows the absence on screen).
 */
describe('25.209 the rebuilt move capability still carries cache and uploadEvidence to a memo-skipped card', () => {
  const GATED: WorkflowDef = {
    ...WF_ERRAND,
    transitions: WF_ERRAND.transitions.map((transition) =>
      transition.from === 'todo' && transition.to === 'doing' ? { ...transition, rules: [{ kind: 'require-evidence' }] } : transition,
    ),
  };

  function cacheOf(ids: string[]) {
    const cache = createClientStateCache();
    for (const id of ids) {
      cache.upsertTicket(
        ticketStateSeed({
          id,
          stateId: 'todo',
          stateCategory: 'open',
          transitions: [{ toStateId: 'todo', actorId: 'user_anselma', seq: 3, workflowId: 'wf-errand', workflowVersion: 1 }],
        }),
      );
    }
    cache.upsertWorkflowDef(GATED);
    return cache;
  }

  /** Render, re-render the page with a FRESH `moves` object, then open the Move dialog on `tk_b` (a skipped slot). */
  async function moveDialogOnSkippedSlot(extra: () => Partial<BoardMoveCapability>) {
    const board = threeCardBoard();
    const source = createFakeDataSource({ getWorkflowDef: async () => GATED });
    const pageOf = () => (
      <Board
        board={board}
        onOpenTicket={() => {}}
        moves={{ dataSource: source, workspaceId: WS, currentUserId: 'user_kiro', onMoved: () => {}, ...extra() }}
      />
    );
    const view = render(pageOf());
    await waitFor(() => expect(document.querySelectorAll('[draggable="true"]').length).toBe(3));
    view.rerender(pageOf());
    await act(async () => {});
    fireEvent.click(within(screen.getByTestId('ticket-card-tk_b')).getByRole('button', { name: 'Move to Doing' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    return { dialog, view };
  }

  it('25.209 (i) the instant pre-check evaluates against the cache; without one it says nothing', async () => {
    const cache = cacheOf(['tk_a', 'tk_b', 'tk_c']);
    const withCache = await moveDialogOnSkippedSlot(() => ({ cache }));
    // THE PROPERTY — the engine ran against the cache and named the rule the candidate (no evidence) breaks.
    expect(await within(withCache.dialog).findByText(/instant check: require-evidence/)).toBeInTheDocument();
    withCache.view.unmount();

    // CONTROL — the same flow with no cache answers `not-evaluated`, which draws nothing.
    const without = await moveDialogOnSkippedSlot(() => ({}));
    await act(async () => {});
    expect(within(without.dialog).queryByText(/instant check/)).toBeNull();
  });

  it('25.209 (ii) a file attached in a card\'s Move dialog is uploaded for THAT card, through the newest uploader', async () => {
    const file = new File(['receipt'], 'receipt.png', { type: 'image/png' });
    const staleUpload = vi.fn(async () => ({ attachmentId: 'att_stale' }));
    const upload = vi.fn(async () => ({ attachmentId: 'att_1' }));
    let current = staleUpload;
    const first = await moveDialogOnSkippedSlot(() => ({ uploadEvidence: current }));
    first.view.unmount();
    current = upload;
    const { dialog } = await moveDialogOnSkippedSlot(() => ({ uploadEvidence: current }));
    fireEvent.change(within(dialog).getByLabelText(/Evidence/), { target: { files: [file] } });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledWith(file, 'tk_b');
    expect(staleUpload).not.toHaveBeenCalled();
    cleanup();

    // CONTROL — a capability with no uploader says so, and offers no file input.
    const bare = await moveDialogOnSkippedSlot(() => ({}));
    expect(within(bare.dialog).getByText(/Evidence upload is not available/)).toBeInTheDocument();
    expect(within(bare.dialog).queryByLabelText(/Evidence/)).toBeNull();
  });
});
