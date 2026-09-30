import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Board, DRAG_CARD_MARKER, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardCard, BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * Board drag fixes D1 + D2 (owner, 2026-09-30; supersedes plan D25) — cases
 * 20.106–20.110 (§20.10). A drop on the card's OWN column is a no-op, and the
 * column under the drag shows a same-size placeholder at the card's TRUE landing
 * slot (a legal target) or a "can't drop here" state (an illegal one).
 *
 * jsdom drags nothing and measures nothing: the fake `DataTransfer` records what
 * `dragstart` writes (as a browser's does, live `types`), the card's height is
 * PLANTED on its element, and the landing index is read off the children order.
 * The real drag across To do / Doing / Done, in hig/minimal/neo, is 20.123 (🧪).
 */

let scrollIntoView: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  document.querySelectorAll('.gn-board-drag-image').forEach((node) => node.remove());
});

const CURRENT_USER = 'user_kiro';
const PLACEHOLDER_ID = (stateId: string) => `board-drop-placeholder-${stateId}`;
const SOURCE_PLACEHOLDER = 'gn-board__card-slot--placeholder';
const REFUSED = 'gn-board__column--drop-refused';
const CARD_HEIGHT = 132;

const card = (ticketId: string): BoardCard => boardCardSeed({ ticketId, title: `Ticket ${ticketId}` });

/**
 * `WF_ERRAND`: from `todo` the only move is `doing`; `done` and `waiting` are
 * refused. Ticket ids sort as text (they are ULIDs on the wire): a < b < c < d < z.
 */
function group(): BoardGroup {
  return {
    workflowId: 'wf-errand',
    workflowVersion: 1,
    workflowName: 'Errand',
    columns: [
      { stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards: [card('tk_a'), card('tk_c'), card('tk_z')] },
      { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: [card('tk_b'), card('tk_d')] },
      { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: false, cards: [] },
    ],
  };
}

const board = (): BoardView => ({ projectId: 'prj_1', groups: [group()] });

async function mount(workflow: WorkflowDef = WF_ERRAND) {
  const onMoved = vi.fn();
  const source = createFakeDataSource({ getWorkflowDef: async () => workflow });
  const moves: BoardMoveCapability = { dataSource: source, workspaceId: WS, currentUserId: CURRENT_USER, onMoved };
  render(<Board board={board()} onOpenTicket={() => {}} moves={moves} />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0));
  return { source, onMoved };
}

/** A recording `DataTransfer`: `setData` appends to the live `types`, `dropEffect` is writable. */
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

const slotOf = (ticketId: string) => screen.getByTestId(`ticket-card-${ticketId}`);
const columnOf = (stateId: string) => screen.getByTestId(`board-column-${stateId}`);
const listOf = (stateId: string) => within(columnOf(stateId)).getByRole('list');
const placeholderIn = (stateId: string) => within(columnOf(stateId)).queryAllByTestId(PLACEHOLDER_ID(stateId));
const allDropPlaceholders = () => document.querySelectorAll('[data-testid^="board-drop-placeholder-"]');
const orderOf = (stateId: string) =>
  [...listOf(stateId).children].map((child) => child.getAttribute('data-testid') ?? '');

/** Plant the card's measured height, then start the drag — the height is captured at `dragstart`. */
function startDrag(ticketId: string, height = CARD_HEIGHT): DataTransfer {
  const dataTransfer = dragData();
  const cardElement = slotOf(ticketId).firstElementChild as HTMLElement;
  cardElement.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 288, height, right: 288, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  fireEvent.dragStart(slotOf(ticketId), { dataTransfer });
  return dataTransfer;
}

const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });

describe('20.106 a drop on the dragged card’s OWN column is a no-op', () => {
  it('20.106 no refusal, no move, default prevented — while a drop on a different legal column still moves', async () => {
    const { source, onMoved } = await mount();
    const dataTransfer = startDrag('tk_c');

    const notCancelled = fireEvent.drop(columnOf('todo'), { dataTransfer });
    await act(async () => {});
    expect(screen.queryByText(/Can.t move there/)).toBeNull();
    expect(source.ingested).toHaveLength(0);
    expect(onMoved).not.toHaveBeenCalled();
    // `preventDefault` still ran: the browser is not told to navigate to the dropped text.
    expect(notCancelled).toBe(false);
    fireEvent.dragEnd(slotOf('tk_c'), { dataTransfer });

    // CONTROL — same test, same card: a drop on a DIFFERENT legal column still moves it.
    const second = startDrag('tk_c');
    fireEvent.drop(columnOf('doing'), { dataTransfer: second });
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(source.ingested[0]![0]!.payload).toEqual({ to: 'doing' });
  });

  it('20.106 a drop with no dragstart behind it still finds the card’s own column from the board data', async () => {
    const { source, onMoved } = await mount();
    const dataTransfer = dragData();
    dataTransfer.setData('text/plain', 'tk_c');
    fireEvent.drop(columnOf('todo'), { dataTransfer });
    await act(async () => {});
    expect(screen.queryByText(/Can.t move there/)).toBeNull();
    expect(source.ingested).toHaveLength(0);
    expect(onMoved).not.toHaveBeenCalled();
  });
});

describe('20.107 a legal target column holds ONE placeholder, the card’s height, at its landing slot', () => {
  it('20.107 height = the dragged card’s; index = its ticket-id order among the column’s cards (above, between, below)', async () => {
    await mount();
    const expectations: Array<[string, string[]]> = [
      // tk_a sorts before tk_b and tk_d: it lands ABOVE both.
      ['tk_a', [PLACEHOLDER_ID('doing'), 'ticket-card-tk_b', 'ticket-card-tk_d']],
      // tk_c sorts between them.
      ['tk_c', ['ticket-card-tk_b', PLACEHOLDER_ID('doing'), 'ticket-card-tk_d']],
      // tk_z sorts after both: BELOW.
      ['tk_z', ['ticket-card-tk_b', 'ticket-card-tk_d', PLACEHOLDER_ID('doing')]],
    ];
    for (const [ticketId, order] of expectations) {
      const dataTransfer = startDrag(ticketId, CARD_HEIGHT + order.indexOf(PLACEHOLDER_ID('doing')));
      // CONTROL — before the drag reaches the column, the column holds none.
      expect(placeholderIn('doing')).toHaveLength(0);
      fireEvent.dragEnter(columnOf('doing'), { dataTransfer });
      fireEvent.dragOver(columnOf('doing'), { dataTransfer });

      const placeholders = placeholderIn('doing');
      expect(placeholders, `${ticketId}: exactly one placeholder`).toHaveLength(1);
      const [placeholder] = placeholders as [HTMLElement];
      expect(orderOf('doing'), `${ticketId}: landing slot`).toEqual(order);
      expect(placeholder.tagName).toBe('LI');
      expect(placeholder.getAttribute('aria-hidden')).toBe('true');
      expect(placeholder.hasAttribute('tabindex')).toBe(false);
      // Not a card: no `ticket-card-*` id, and it carries no interactive child.
      expect(placeholder.querySelector('button, a, input')).toBeNull();
      const expected = CARD_HEIGHT + order.indexOf(PLACEHOLDER_ID('doing'));
      expect(Math.abs(parseFloat(placeholder.style.height) - expected)).toBeLessThanOrEqual(1);
      fireEvent.dragEnd(slotOf(ticketId), { dataTransfer });
      expect(placeholderIn('doing')).toHaveLength(0);
    }
  });
});

describe('20.108 an illegal target column shows "can’t drop here", never a placeholder', () => {
  it('20.108 dragover sets dropEffect none and the refused class, no placeholder — while the legal column beside it has one', async () => {
    await mount();
    const dataTransfer = startDrag('tk_c');

    fireEvent.dragEnter(columnOf('done'), { dataTransfer });
    fireEvent.dragOver(columnOf('done'), { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('none');
    expect(placeholderIn('done')).toHaveLength(0);
    expect(columnOf('done').classList.contains(REFUSED)).toBe(true);
    fireEvent.dragLeave(columnOf('done'), { dataTransfer });
    expect(columnOf('done').classList.contains(REFUSED)).toBe(false);

    // CONTROL — the same drag over the legal column: a placeholder, an allowed effect, no refused class.
    dataTransfer.dropEffect = 'move';
    fireEvent.dragEnter(columnOf('doing'), { dataTransfer });
    fireEvent.dragOver(columnOf('doing'), { dataTransfer });
    expect(dataTransfer.dropEffect).not.toBe('none');
    expect(placeholderIn('doing')).toHaveLength(1);
    expect(columnOf('doing').classList.contains(REFUSED)).toBe(false);
  });

  it('20.108 a drop that does fire on an illegal column still shows the existing refusal', async () => {
    const { source } = await mount();
    const dataTransfer = startDrag('tk_c');
    fireEvent.dragEnter(columnOf('done'), { dataTransfer });
    fireEvent.drop(columnOf('done'), { dataTransfer });
    expect(await screen.findByText(/Can.t move there/)).toBeTruthy();
    expect(source.ingested).toHaveLength(0);
    expect(columnOf('done').classList.contains(REFUSED)).toBe(false);
  });
});

describe('20.109 the card’s own column gets no second placeholder', () => {
  it('20.109 over its own column: only the source slot is a placeholder, no drop placeholder, no refused state', async () => {
    await mount();
    const dataTransfer = startDrag('tk_c');
    await nextFrame();

    fireEvent.dragEnter(columnOf('todo'), { dataTransfer });
    fireEvent.dragOver(columnOf('todo'), { dataTransfer });
    expect(allDropPlaceholders()).toHaveLength(0);
    expect(document.querySelectorAll(`.${SOURCE_PLACEHOLDER}`)).toHaveLength(1);
    expect(slotOf('tk_c').classList.contains(SOURCE_PLACEHOLDER)).toBe(true);
    expect(columnOf('todo').classList.contains(REFUSED)).toBe(false);
    expect(dataTransfer.dropEffect).not.toBe('none');

    // CONTROL — over the legal column the board holds exactly TWO: the source's and the target's.
    fireEvent.dragLeave(columnOf('todo'), { dataTransfer });
    fireEvent.dragEnter(columnOf('doing'), { dataTransfer });
    expect(allDropPlaceholders()).toHaveLength(1);
    expect(document.querySelectorAll(`.${SOURCE_PLACEHOLDER}`)).toHaveLength(1);
  });
});

describe('20.110 the placeholder goes on the last leave, a drop, a dragend or Esc — and never flickers over a child', () => {
  it('20.110 depth-counted leave, drop, dragend', async () => {
    await mount();
    const dataTransfer = startDrag('tk_c');
    const target = columnOf('doing');

    fireEvent.dragEnter(target, { dataTransfer });
    expect(placeholderIn('doing')).toHaveLength(1);
    // Onto a child card, and out of the column once: still inside it — no flicker.
    fireEvent.dragEnter(slotOf('tk_b'), { dataTransfer });
    fireEvent.dragLeave(target, { dataTransfer });
    expect(placeholderIn('doing')).toHaveLength(1);
    // Onto the placeholder itself (it is a child too), then out of the child.
    fireEvent.dragEnter(placeholderIn('doing')[0]!, { dataTransfer });
    fireEvent.dragLeave(slotOf('tk_b'), { dataTransfer });
    expect(placeholderIn('doing')).toHaveLength(1);
    // The matching final leave: the count is back to zero.
    fireEvent.dragLeave(target, { dataTransfer });
    expect(placeholderIn('doing')).toHaveLength(0);

    // CONTROL — a drop clears it (the card moves), and so does a dragend (Esc, or a drop outside every column).
    const second = startDrag('tk_a');
    fireEvent.dragEnter(target, { dataTransfer: second });
    expect(placeholderIn('doing')).toHaveLength(1);
    fireEvent.drop(target, { dataTransfer: second });
    expect(placeholderIn('doing')).toHaveLength(0);
    fireEvent.dragEnd(slotOf('tk_a'), { dataTransfer: second });

    const third = startDrag('tk_z');
    fireEvent.dragEnter(target, { dataTransfer: third });
    expect(placeholderIn('doing')).toHaveLength(1);
    fireEvent.dragEnd(slotOf('tk_z'), { dataTransfer: third });
    expect(placeholderIn('doing')).toHaveLength(0);
  });

  it('20.110 a drag that carries no card marker (a text selection) never gets a placeholder, and a drag from ANOTHER group shows none here', async () => {
    await mount();
    const selection = dragData();
    selection.setData('text/plain', 'some words');
    fireEvent.dragEnter(columnOf('doing'), { dataTransfer: selection });
    expect(placeholderIn('doing')).toHaveLength(0);

    // A marker with no `dragstart` in this group behind it: the column knows no card, so it draws none.
    const foreign = dragData();
    foreign.setData(DRAG_CARD_MARKER, '');
    fireEvent.dragEnter(columnOf('doing'), { dataTransfer: foreign });
    expect(placeholderIn('doing')).toHaveLength(0);

    // CONTROL — a real drag from this group does draw one.
    const own = startDrag('tk_c');
    fireEvent.dragEnter(columnOf('doing'), { dataTransfer: own });
    expect(placeholderIn('doing')).toHaveLength(1);
  });
});
