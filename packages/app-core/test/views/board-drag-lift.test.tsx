import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Board, DRAG_CARD_MARKER, DRAG_TICKET_FORMAT, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * Styling refresh Plan A Task 5A — cases 20.101, 20.102, 20.104, 20.105
 * (§20.10). The lift is painted on a `setDragImage` clone, the source slot
 * becomes the placeholder one frame later, and the column under the pointer is
 * outlined (plan D25/D26). jsdom implements no `DragEvent` and drags nothing,
 * so this file proves the WIRING — what is handed to `setDragImage`, which
 * classes come and go on which events — not the pixels; the browser check
 * (20.121, Task 8) measures those.
 */

let scrollIntoView: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  document.querySelectorAll('.gn-board-drag-image').forEach((node) => node.remove());
});

const CURRENT_USER = 'user_kiro';
const SECOND_TICKET = 'tkt_second';

function group(): BoardGroup {
  return {
    workflowId: 'wf-errand',
    workflowVersion: 1,
    workflowName: 'Errand',
    columns: [
      { stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards: [boardCardSeed()] },
      {
        stateId: 'doing',
        name: 'Doing',
        category: 'active',
        blocked: false,
        creatable: true,
        cards: [boardCardSeed({ ticketId: SECOND_TICKET, title: 'Renew the licence' })],
      },
      { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: false, cards: [] },
    ],
  };
}

function board(): BoardView {
  return { projectId: 'prj_1', groups: [group()] };
}

function movesFor(workflow: WorkflowDef = WF_ERRAND) {
  const onMoved = vi.fn();
  const source = createFakeDataSource({ getWorkflowDef: async () => workflow });
  const moves: BoardMoveCapability = { dataSource: source, workspaceId: WS, currentUserId: CURRENT_USER, onMoved };
  return { source, moves, onMoved };
}

async function mount() {
  const harness = movesFor();
  render(<Board board={board()} onOpenTicket={() => {}} moves={harness.moves} />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0));
  return harness;
}

function liftingDataTransfer(types: string[] = []): DataTransfer & { setDragImage: ReturnType<typeof vi.fn> } {
  const store = new Map<string, string>();
  const setDragImage = vi.fn();
  return {
    setData: (format: string, data: string) => {
      store.set(format, data);
      if (!types.includes(format)) types.push(format);
    },
    getData: (format: string) => store.get(format) ?? '',
    effectAllowed: 'uninitialized',
    types,
    setDragImage,
  } as unknown as DataTransfer & { setDragImage: ReturnType<typeof vi.fn> };
}

/** The `DataTransfer` shape `board-drag-drop.test.tsx` uses: no `setDragImage`, no `types`. */
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

const slotOf = (ticketId: string) => screen.getByTestId(`ticket-card-${ticketId}`);
const columnOf = (stateId: string) => screen.getByTestId(`board-column-${stateId}`);
const TICKET = boardCardSeed().ticketId;
const PLACEHOLDER = 'gn-board__card-slot--placeholder';
const DROP_TARGET = 'gn-board__column--drop-target';

/** jsdom has no `DragEvent`, so `clientX`/`clientY` cannot ride in the init: define them on the event. */
function dragStartAt(slot: Element, dataTransfer: DataTransfer, clientX: number, clientY: number): void {
  const event = createEvent.dragStart(slot, { dataTransfer });
  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'clientY', { value: clientY });
  fireEvent(slot, event);
}

const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });

describe('20.101 a dragged card hands the browser a lifted image', () => {
  it('20.101 one setDragImage call: a stripped, inert, card-width clone at the pointer offset plus padding', async () => {
    await mount();
    const slot = slotOf(TICKET);
    const card = slot.firstElementChild as HTMLElement;
    card.getBoundingClientRect = () =>
      ({ left: 10, top: 10, width: 288, height: 120, right: 298, bottom: 130, x: 10, y: 10, toJSON: () => ({}) }) as DOMRect;
    const dataTransfer = liftingDataTransfer();
    dragStartAt(slot, dataTransfer, 30, 20);

    expect(dataTransfer.setDragImage).toHaveBeenCalledTimes(1);
    const [wrapper, offsetX, offsetY] = dataTransfer.setDragImage.mock.calls[0] as [HTMLElement, number, number];
    expect(offsetX).toBe(20 + 48);
    expect(offsetY).toBe(10 + 24);
    expect(wrapper.parentElement).toBe(document.body);
    expect(wrapper.classList.contains('gn-board-drag-image')).toBe(true);
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
    expect(wrapper.hasAttribute('inert')).toBe(true);
    const clone = wrapper.firstElementChild as HTMLElement;
    expect(clone.classList.contains('gn-board-card')).toBe(true);
    expect(clone.style.width).toBe('288px');
    expect(wrapper.querySelectorAll('[id], [data-testid]')).toHaveLength(0);
    // CONTROL — the clone did not steal the test id: the real card is still the only one.
    expect(screen.getAllByTestId(`ticket-card-${TICKET}`)).toHaveLength(1);
    // The wrapper goes on the next task, after the browser's snapshot.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(wrapper.isConnected).toBe(false);
  });
});

describe('20.102 the drag image is feature-guarded', () => {
  it('20.102 no setDragImage: no throw, no wrapper, the ticket id and marker still travel, the drop still moves', async () => {
    const { source, onMoved } = await mount();
    const dataTransfer = fakeDataTransfer();
    expect(() => fireEvent.dragStart(slotOf(TICKET), { dataTransfer })).not.toThrow();
    expect(document.querySelector('.gn-board-drag-image')).toBeNull();
    expect(dataTransfer.getData(DRAG_TICKET_FORMAT)).toBe(TICKET);
    expect(dataTransfer.getData(DRAG_CARD_MARKER)).toBe('');
    fireEvent.drop(columnOf('doing'), { dataTransfer });
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(source.ingested[0]![0]!.payload).toEqual({ to: 'doing' });
  });
});

describe('20.104 the source slot is the placeholder between one frame after dragstart and dragend', () => {
  it('20.104 absent synchronously, present after the frame, absent after dragend', async () => {
    await mount();
    const slot = slotOf(TICKET);
    fireEvent.dragStart(slot, { dataTransfer: liftingDataTransfer() });
    expect(slot.classList.contains(PLACEHOLDER)).toBe(false);
    await nextFrame();
    expect(slot.classList.contains(PLACEHOLDER)).toBe(true);
    fireEvent.dragEnd(slot);
    expect(slot.classList.contains(PLACEHOLDER)).toBe(false);
  });

  it('20.104 control: a dragend before the frame cancels it, so no placeholder is left behind', async () => {
    await mount();
    const slot = slotOf(TICKET);
    fireEvent.dragStart(slot, { dataTransfer: liftingDataTransfer() });
    fireEvent.dragEnd(slot);
    await nextFrame();
    await nextFrame();
    expect(slot.classList.contains(PLACEHOLDER)).toBe(false);
  });
});

describe('20.105 the column under the drag is highlighted, not given a placeholder', () => {
  it('20.105 marker-gated, depth-counted, cleared by the last leave, a drop or a dragend', async () => {
    await mount();
    const columnB = columnOf('doing');
    const list = () => within(columnB).getByRole('list');
    const before = list().children.length;
    const dataTransfer = liftingDataTransfer([DRAG_CARD_MARKER]);

    fireEvent.dragEnter(columnB, { dataTransfer });
    expect(columnB.classList.contains(DROP_TARGET)).toBe(true);
    // CONTROL — the highlight added no element to the card list.
    expect(list().children.length).toBe(before);

    // Entering a child card, then leaving the column once: still inside it.
    fireEvent.dragEnter(slotOf(SECOND_TICKET), { dataTransfer });
    fireEvent.dragLeave(columnB, { dataTransfer });
    expect(columnB.classList.contains(DROP_TARGET)).toBe(true);
    fireEvent.dragLeave(columnB, { dataTransfer });
    expect(columnB.classList.contains(DROP_TARGET)).toBe(false);

    fireEvent.dragEnter(columnB, { dataTransfer });
    expect(columnB.classList.contains(DROP_TARGET)).toBe(true);
    fireEvent.drop(columnB, { dataTransfer });
    expect(columnB.classList.contains(DROP_TARGET)).toBe(false);

    fireEvent.dragEnter(columnB, { dataTransfer });
    expect(columnB.classList.contains(DROP_TARGET)).toBe(true);
    fireEvent.dragEnd(slotOf(TICKET), { dataTransfer });
    expect(columnB.classList.contains(DROP_TARGET)).toBe(false);
    expect(list().children.length).toBe(before);
  });

  it('20.105 a drag carrying only text/plain (a text selection) never highlights', async () => {
    await mount();
    const columnB = columnOf('doing');
    fireEvent.dragEnter(columnB, { dataTransfer: liftingDataTransfer(['text/plain']) });
    expect(columnB.classList.contains(DROP_TARGET)).toBe(false);
  });
});
