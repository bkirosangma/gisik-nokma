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
