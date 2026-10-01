import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult } from '@gisik-nokma/domain';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * Board — the drag placeholder and every glide respect VARIABLE card heights (owner, 2026-10-01: "yes, add it as
 * recommended") — cases 20.410–20.414 (§20.41). Every other board suite mocks ALL its cards at ONE height
 * (`board-drag-lift.test.tsx` plants 120), so a fixed-height or wrong-card-height bug would pass them; 20.123 stays 🟡
 * for the same reason.
 *
 * The fixture is a small LAYOUT ENGINE, not a table of rects: a card's top is where the cards before it in ITS list
 * end (`COLUMN_TOP` plus each earlier card's own height plus `GAP`), a card's height follows the TICKET (never its
 * index), and the drop placeholder is as tall as its inline `style.height` says. So when the board re-renders — the
 * mover leaves its column, a placeholder opens, a refusal puts it back — the next measurement is what a browser would
 * have drawn, and the glides read it. Every expectation below is built from `HEIGHT` and `GAP`, the two fixture values.
 */

let scrollIntoView: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => vi.restoreAllMocks());

const CURRENT_USER = 'user_kiro';
const FLIGHT = 'gn-board__card-slot--flight';
const PLACEHOLDER_OF = (stateId: string) => `board-drop-placeholder-${stateId}`;

/** The measured height of each card, in px. All six differ, so no constant and no neighbour's height can stand in for one. */
const HEIGHT: Record<string, number> = { tk_a: 96, tk_c: 180, tk_m: 120, tk_z: 110, tk_b: 130, tk_d: 150 };
/** The space between two stacked cards, as the fixture lays them out. */
const GAP = 8;
const COLUMN_TOP = 100;
const COLUMN_LEFT: Record<string, number> = { todo: 0, doing: 300, done: 600 };

/** Ticket ids sort as text, so To do's order is a < c < m < z and a card lands in Doing by that order (b, d there). */
const TODO = ['tk_a', 'tk_c', 'tk_m', 'tk_z'];
const DOING = ['tk_b', 'tk_d'];

function group(): BoardGroup {
  const col = (stateId: string, name: string, category: 'open' | 'active' | 'terminal', ids: string[]) => ({
    stateId,
    name,
    category,
    blocked: false,
    creatable: true,
    cards: ids.map((ticketId) => boardCardSeed({ ticketId, title: `Ticket ${ticketId}` })),
  });
  return {
    workflowId: 'wf-errand',
    workflowVersion: 1,
    workflowName: 'Errand',
    columns: [col('todo', 'To do', 'open', TODO), col('doing', 'Doing', 'active', DOING), col('done', 'Done', 'terminal', [])],
  };
}
const board = (): BoardView => ({ projectId: 'prj_1', groups: [group()] });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
const refused = (events: { id: string }[]): IngestResult[] =>
  events.map((event) => ({ status: 'refused' as const, eventId: event.id, rule: 'some-rule', reason: 'Not allowed right now.' }));
const never = () => new Promise<IngestResult[]>(() => {});

async function mount(ingest: IngestScript) {
  const onMoved = vi.fn();
  const source = createFakeDataSource({ getWorkflowDef: async () => WF_ERRAND }, ingest);
  const moves: BoardMoveCapability = { dataSource: source, workspaceId: WS, currentUserId: CURRENT_USER, onMoved };
  render(<Board board={board()} onOpenTicket={() => {}} moves={moves} />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0));
}

const ticketOf = (element: Element): string | undefined => {
  const id = element.getAttribute('data-testid') ?? '';
  return id.startsWith('ticket-card-') ? id.slice('ticket-card-'.length) : undefined;
};

/** What a list child takes up: a card its own height, the drop placeholder what its inline style asks for. */
function extentOf(child: Element): number {
  const ticket = ticketOf(child);
  if (ticket !== undefined) return HEIGHT[ticket] ?? 0;
  if (child.classList.contains('gn-board__drop-placeholder')) return parseFloat((child as HTMLElement).style.height);
  return 0;
}

/** Where a list child is drawn: the cards (and placeholder) before it in ITS list, each with the gap after it. */
function topOf(child: HTMLElement): number {
  let top = COLUMN_TOP;
  for (const sibling of Array.from(child.parentElement!.children)) {
    if (sibling === child) break;
    top += extentOf(sibling) + GAP;
  }
  return top;
}

const rect = (left: number, top: number, height: number) =>
  ({ left, top, right: left + 280, bottom: top + height, width: 280, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

function plantLayout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const column = (element: Element) =>
      element.closest('[data-testid^="board-column-"]')?.getAttribute('data-testid')?.slice('board-column-'.length) ?? '';
    const own = ticketOf(this);
    if (this.tagName === 'LI' && own !== undefined) return rect(COLUMN_LEFT[column(this)] ?? 0, topOf(this), HEIGHT[own] ?? 0);
    // The card inside a slot (what `dragstart` measures for the placeholder): the slot's own box.
    const slot = this.parentElement;
    const inner = slot !== null && ticketOf(slot) !== undefined && slot.firstElementChild === this ? ticketOf(slot) : undefined;
    if (slot !== null && inner !== undefined) return rect(COLUMN_LEFT[column(slot)] ?? 0, topOf(slot), HEIGHT[inner] ?? 0);
    return rect(0, 0, 0);
  });
}

/** A fresh board on the fixture layout — a second scenario in the same `it` is a CONTROL, not a leftover of the first. */
async function scenario(ingest: IngestScript) {
  cleanup();
  vi.restoreAllMocks();
  Element.prototype.scrollIntoView = scrollIntoView;
  await mount(ingest);
  plantLayout();
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

function fireAt(type: 'dragStart' | 'drop', element: Element, dataTransfer: DataTransfer, x = 0, y = 0): void {
  const event = createEvent[type](element, { dataTransfer });
  Object.defineProperty(event, 'clientX', { value: x });
  Object.defineProperty(event, 'clientY', { value: y });
  fireEvent(element, event);
}

const slotOf = (ticketId: string) => screen.getByTestId(`ticket-card-${ticketId}`);
const columnOf = (stateId: string) => screen.getByTestId(`board-column-${stateId}`);
const idsIn = (stateId: string) =>
  [...within(columnOf(stateId)).getByRole('list').children]
    .map(ticketOf)
    .filter((id): id is string => id !== undefined);
const flies = (id: string) => slotOf(id).classList.contains(FLIGHT);
const flipY = (id: string) => slotOf(id).style.getPropertyValue('--gn-flip-y');
const flipX = (id: string) => slotOf(id).style.getPropertyValue('--gn-flip-x');
const px = (value: number) => `${value}px`;

/** The measured height of a card as `dragstart` reads it (the element inside the slot). */
const measuredHeight = (ticketId: string) => (slotOf(ticketId).firstElementChild as HTMLElement).getBoundingClientRect().height;

/** Drop `ticketId` on `toStateId` (a full drag: start, drop, end). */
function drop(ticketId: string, toStateId: string): void {
  const dataTransfer = dragData();
  fireAt('dragStart', slotOf(ticketId), dataTransfer);
  fireAt('drop', columnOf(toStateId), dataTransfer);
  fireEvent.dragEnd(slotOf(ticketId), { dataTransfer });
}

const arrow = (ticketId: string) => userEvent.setup().click(within(slotOf(ticketId)).getByRole('button', { name: 'Move to Doing' }));

/** End every glide now, so the next flight class on a card is a NEW one. */
function settleAll(): void {
  for (const element of document.querySelectorAll('[data-testid^="ticket-card-"]')) fireEvent.animationEnd(element);
}

/** The fixture's own offset for a mover: its height and the gap that follows it. */
const stride = (ticketId: string) => HEIGHT[ticketId]! + GAP;
/** Where the card at `index` of an ordered list of tickets is drawn, from the fixture alone. */
const stackTop = (ids: string[], index: number) =>
  COLUMN_TOP + ids.slice(0, index).reduce((sum, id) => sum + HEIGHT[id]! + GAP, 0);

describe('20.410 the drop placeholder is exactly the DRAGGED card’s measured height', () => {
  it('20.410 each of four cards of four different heights opens a placeholder of ITS OWN height in Doing — never a constant, never a neighbour’s', async () => {
    // Mutations: a constant 120 for the placeholder; the hovered / neighbouring card's height; the source column's first card's height.
    await scenario(never);
    // The fixture discriminates: six heights, all different, so equality below cannot be a coincidence.
    expect(new Set(Object.values(HEIGHT)).size).toBe(Object.keys(HEIGHT).length);
    const landing: Array<[string, number]> = [
      ['tk_c', 1], // 180 between tk_b (130) and tk_d (150)
      ['tk_a', 0], // 96 above tk_b — CONTROL: the same column, a SHORTER card, a shorter placeholder
      ['tk_m', 2], // 120 below tk_d
      ['tk_z', 2], // 110 below tk_d
    ];
    for (const [ticketId, index] of landing) {
      const dataTransfer = dragData();
      fireAt('dragStart', slotOf(ticketId), dataTransfer);
      fireEvent.dragEnter(columnOf('doing'), { dataTransfer });
      fireEvent.dragOver(columnOf('doing'), { dataTransfer });
      const placeholder = screen.getByTestId(PLACEHOLDER_OF('doing'));
      // The expectation reads the card's MEASURED rect, and the fixture agrees with it (so this is not 0 === 0).
      expect(measuredHeight(ticketId)).toBe(HEIGHT[ticketId]);
      expect(placeholder.style.height, `${ticketId}: placeholder height`).toBe(px(measuredHeight(ticketId)));
      expect([...within(columnOf('doing')).getByRole('list').children].indexOf(placeholder), `${ticketId}: landing slot`).toBe(index);
      // The slot it opens is the card's height plus the gap: the next card sits one stride under the placeholder's top.
      const next = placeholder.nextElementSibling as HTMLElement | null;
      if (next !== null) expect(topOf(next) - topOf(placeholder)).toBe(stride(ticketId));
      fireEvent.dragEnd(slotOf(ticketId), { dataTransfer });
      expect(within(columnOf('doing')).queryByTestId(PLACEHOLDER_OF('doing'))).toBeNull();
    }
  });
});

describe('20.411 the cards BELOW a card that leaves glide up by THAT card’s own height plus the gap — drag or arrow', () => {
  it('20.411 the 180px tk_c leaves: tk_m and tk_z start 188px below their slot (CONTROL: tk_a above stays; a 96px mover gives 104px)', async () => {
    // Mutations: a fixed card height in the leaving offset (120); the gap dropped; the offset signed the other way;
    // the NEXT card's height instead of the mover's; cards above the mover glide too.
    for (const via of ['drop', 'arrow'] as const) {
      await scenario(never);
      if (via === 'drop') drop('tk_c', 'doing');
      else await arrow('tk_c');
      expect(idsIn('todo'), `${via}: tk_c left`).toEqual(['tk_a', 'tk_m', 'tk_z']);
      // Each is drawn one stride up from where it was: it flies from stride px BELOW its slot.
      for (const below of ['tk_m', 'tk_z']) {
        expect(flies(below), `${via}: ${below} glides`).toBe(true);
        expect(flipY(below), `${via}: ${below}`).toBe(px(stride('tk_c')));
        expect(flipX(below)).toBe('0px');
      }
      // The numbers are the mover's: 180 + 8, not any card's neighbour and not a fixed 120.
      expect(stride('tk_c')).toBe(188);
      expect(flies('tk_a'), `${via}: above the mover`).toBe(false);
    }

    // CONTROL — the 96px tk_a leaving the same column moves the cards below it by ITS stride, 104, not 188.
    await scenario(never);
    drop('tk_a', 'doing');
    expect(idsIn('todo')).toEqual(['tk_c', 'tk_m', 'tk_z']);
    for (const below of ['tk_c', 'tk_m', 'tk_z']) expect(flipY(below), `tk_a leaving: ${below}`).toBe(px(stride('tk_a')));
    expect(stride('tk_a')).not.toBe(stride('tk_c'));
  });
});

describe('20.412 an ARROW move opens a slot of the ARRIVING card’s height: the cards below the landing index glide down by it', () => {
  it('20.412 › on the 180px tk_c: tk_d starts 188px ABOVE its slot (CONTROL: tk_b above stays; the 96px tk_a gives 104px on both; a card landing last moves none)', async () => {
    // Mutations: the neighbour's height instead of the arriving card's; the source column's card height; a constant 120; the gap dropped; the sign flipped.
    await scenario(never);
    await arrow('tk_c');
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    expect(flies('tk_d')).toBe(true);
    expect(flipY('tk_d')).toBe(px(-stride('tk_c')));
    expect(flipX('tk_d')).toBe('0px');
    expect(flies('tk_b'), 'above the landing slot').toBe(false);

    // CONTROL — a SHORTER card landing FIRST: both cards of Doing are below it, each moves by 96 + 8.
    await scenario(never);
    await arrow('tk_a');
    expect(idsIn('doing')).toEqual(['tk_a', 'tk_b', 'tk_d']);
    expect(flipY('tk_b')).toBe(px(-stride('tk_a')));
    expect(flipY('tk_d')).toBe(px(-stride('tk_a')));
    expect(stride('tk_a')).not.toBe(stride('tk_c'));

    // CONTROL — landing LAST: nothing is below, so nothing glides in the target.
    await scenario(never);
    await arrow('tk_z');
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d', 'tk_z']);
    expect(flies('tk_b') || flies('tk_d')).toBe(false);
  });
});

describe('20.413 a refusal glides every card back by the same MEASURED amounts, each its own', () => {
  /** Press › (or drop) the mover, let the glides end, then have the server refuse. */
  async function refusedMove(ticketId: string, via: 'drop' | 'arrow') {
    const write = deferred<IngestResult[]>();
    await scenario(() => write.promise);
    if (via === 'drop') drop(ticketId, 'doing');
    else await arrow(ticketId);
    settleAll();
    await act(async () => write.resolve(refused([{ id: 'x' }])));
    expect(idsIn('doing'), `${via} ${ticketId}: back out of Doing`).toEqual(DOING);
    expect(idsIn('todo')).toEqual(TODO);
  }

  it('20.413 an ARROW refusal of tk_c: source cards go back DOWN 188, target cards back UP 188, the mover flies home by its own offset (CONTROL: tk_a, above, and tk_b never glide; tk_a’s refusal reverses 104)', async () => {
    // Mutations: the refusal reverses by a fixed amount; source and target offsets swapped; the gap dropped; the mover measured from a sibling's rect.
    await refusedMove('tk_c', 'arrow');
    // tk_m and tk_z were drawn one stride up while tk_c was in Doing, and are back at their slots: they start 188px ABOVE them.
    for (const below of ['tk_m', 'tk_z']) {
      expect(flies(below), below).toBe(true);
      expect(flipY(below), below).toBe(px(-stride('tk_c')));
    }
    // tk_d was pushed down a stride by the arrival and is back at its slot: it starts 188px BELOW it.
    expect(flies('tk_d')).toBe(true);
    expect(flipY('tk_d')).toBe(px(stride('tk_c')));
    expect(flies('tk_a')).toBe(false);
    expect(flies('tk_b')).toBe(false);
    // The mover: drawn in Doing at index 1, home in To do at index 1 — its OWN offset, from the fixture's stacks.
    expect(flies('tk_c')).toBe(true);
    expect(flipX('tk_c')).toBe(px(COLUMN_LEFT.doing! - COLUMN_LEFT.todo!));
    expect(flipY('tk_c')).toBe(px(stackTop(['tk_b', 'tk_c', 'tk_d'], 1) - stackTop(TODO, 1)));

    // CONTROL — a different mover, a different amount: tk_a (96) reverses by 104, and lands at the TOP of Doing.
    await refusedMove('tk_a', 'arrow');
    for (const below of ['tk_c', 'tk_m', 'tk_z']) expect(flipY(below), `tk_a: ${below}`).toBe(px(-stride('tk_a')));
    for (const target of ['tk_b', 'tk_d']) expect(flipY(target), `tk_a: ${target}`).toBe(px(stride('tk_a')));
    expect(flipX('tk_a')).toBe(px(COLUMN_LEFT.doing! - COLUMN_LEFT.todo!));
    expect(flipY('tk_a')).toBe(px(stackTop(['tk_a', 'tk_b', 'tk_d'], 0) - stackTop(TODO, 0)));
  });

  it('20.413 a DROP refusal of tk_c: source cards back DOWN 188 and the mover home by its own offset, no target card glides (CONTROL: the placeholder had already opened the slot)', async () => {
    await refusedMove('tk_c', 'drop');
    for (const below of ['tk_m', 'tk_z']) expect(flipY(below), below).toBe(px(-stride('tk_c')));
    expect(flies('tk_a')).toBe(false);
    expect(flies('tk_b') || flies('tk_d'), 'a drop recorded no target siblings').toBe(false);
    expect(flipX('tk_c')).toBe(px(COLUMN_LEFT.doing! - COLUMN_LEFT.todo!));
    expect(flipY('tk_c')).toBe(px(stackTop(['tk_b', 'tk_c', 'tk_d'], 1) - stackTop(TODO, 1)));
  });
});

describe('20.414 the offsets differ per mover — a test that reuses one number cannot pass', () => {
  it('20.414 the same To do cards glide 188px for the 180px mover and 104px for the 96px one (CONTROL: the two scenarios share one board)', async () => {
    const offsets: Record<string, string> = {};
    for (const mover of ['tk_c', 'tk_a']) {
      await scenario(never);
      await arrow(mover);
      offsets[mover] = flipY('tk_z');
    }
    expect(offsets).toEqual({ tk_c: px(stride('tk_c')), tk_a: px(stride('tk_a')) });
    expect(offsets.tk_c).not.toBe(offsets.tk_a);
  });
});
