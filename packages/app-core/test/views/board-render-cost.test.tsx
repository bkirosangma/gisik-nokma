import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardCard, BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

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
