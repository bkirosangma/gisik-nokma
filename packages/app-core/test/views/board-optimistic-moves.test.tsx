import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, WorkflowDef } from '@gisik-nokma/domain';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import type { BoardCard, BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * Optimistic, animated board moves (owner, 2026-10-01) — cases 20.125–20.131 and 20.133, 20.138.
 *
 * The owner's words: *"the dropped card briefly jumps back to the original column before being instantly
 * moved to the dropped column … assume it is already a success and show the card to move to the new column,
 * if it fails for some reason, move it back."* Every case here holds the write OPEN (a deferred promise) and
 * reads where the card is while it is open; the real network's feel is 20.144 (🧪).
 */

let scrollIntoView: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => vi.restoreAllMocks());

const CURRENT_USER = 'user_kiro';
const card = (ticketId: string): BoardCard => boardCardSeed({ ticketId, title: `Ticket ${ticketId}` });

/** From `todo` the only move is `doing` (rules-free); `doing` → `done` requires a comment. */
function group(cardsByState: Record<string, string[]> = { todo: ['tk_a', 'tk_c', 'tk_z'], doing: ['tk_b', 'tk_d'], done: [] }): BoardGroup {
  const col = (stateId: string, name: string, category: 'open' | 'active' | 'terminal') => ({
    stateId,
    name,
    category,
    blocked: false,
    creatable: true,
    cards: (cardsByState[stateId] ?? []).map(card),
  });
  return {
    workflowId: 'wf-errand',
    workflowVersion: 1,
    workflowName: 'Errand',
    columns: [col('todo', 'To do', 'open'), col('doing', 'Doing', 'active'), col('done', 'Done', 'terminal')],
  };
}
const board = (cardsByState?: Record<string, string[]>): BoardView => ({ projectId: 'prj_1', groups: [group(cardsByState)] });

/** `todo → doing` asks for a comment, so a move there goes through the dialog. */
const GATED: WorkflowDef = {
  ...WF_ERRAND,
  transitions: WF_ERRAND.transitions.map((t) =>
    t.from === 'todo' && t.to === 'doing' ? { ...t, rules: [{ kind: 'require-comment' }] } : t,
  ),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const committed = (events: { id: string }[]): IngestResult[] =>
  events.map((event) => ({ status: 'committed' as const, eventId: event.id, seq: 1, serverTime: '2026-10-01T09:00:00.000Z' }));
const refused = (events: { id: string }[]): IngestResult[] =>
  events.map((event) => ({ status: 'refused' as const, eventId: event.id, rule: 'some-rule', reason: 'Not allowed right now.' }));

async function mount(ingest: IngestScript, workflow: WorkflowDef = WF_ERRAND, view: BoardView = board()) {
  const onMoved = vi.fn();
  const source = createFakeDataSource({ getWorkflowDef: async () => workflow }, ingest);
  const moves: BoardMoveCapability = { dataSource: source, workspaceId: WS, currentUserId: CURRENT_USER, onMoved };
  const utils = render(<Board board={view} onOpenTicket={() => {}} moves={moves} />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0));
  const rerender = (next: BoardView) => utils.rerender(<Board board={next} onOpenTicket={() => {}} moves={moves} />);
  return { source, onMoved, rerender };
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

/** RTL builds a bare `Event` where jsdom has no `DragEvent`, which drops `clientX/Y`; plant them. */
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
    .map((child) => child.getAttribute('data-testid') ?? '')
    .filter((id) => id.startsWith('ticket-card-'))
    .map((id) => id.slice('ticket-card-'.length));

function drag(ticketId: string, toStateId: string, at = { x: 0, y: 0 }) {
  const dataTransfer = dragData();
  fireAt('dragStart', slotOf(ticketId), dataTransfer);
  fireAt('drop', columnOf(toStateId), dataTransfer, at.x, at.y);
  fireEvent.dragEnd(slotOf(ticketId), { dataTransfer });
}

describe('20.125 a legal drop shows the card in its target column at once, before the write answers', () => {
  it('20.125 the card is in Doing between tk_b and tk_d while ingest is still open; it stays there once committed', async () => {
    const write = deferred<IngestResult[]>();
    const { source, onMoved } = await mount(() => write.promise);
    // CONTROL — before the drop the card is in To do, and nothing has been written.
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']);
    expect(source.ingested).toHaveLength(0);

    drag('tk_c', 'doing');

    expect(source.ingested).toHaveLength(1); // the write is in flight and unanswered …
    expect(onMoved).not.toHaveBeenCalled(); // … no reload has happened …
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']); // … yet the card is already where it was dropped,
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_z']); // and its source slot is released.
    expect(slotOf('tk_c')).toHaveAttribute('data-move-phase', 'writing');

    await act(async () => write.resolve([]));
    // (an empty answer is a failure — covered in 20.128 — so settle this case with a real commit instead)
  });

  it('20.125 after the server commits, the card stays put, onMoved reloads, and the phase is committed', async () => {
    const write = deferred<IngestResult[]>();
    const { onMoved } = await mount(() => write.promise);
    drag('tk_c', 'doing');
    await act(async () => write.resolve(committed([{ id: 'x' }])));
    expect(onMoved).toHaveBeenCalledTimes(1);
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    expect(slotOf('tk_c')).toHaveAttribute('data-move-phase', 'committed');
  });
});

describe('20.126 a stale read never flashes the card back; a read that agrees retires the overlay', () => {
  it('20.126 a refetch that still shows tk_c in To do leaves it in Doing; once a read shows it in Doing the overlay is retired', async () => {
    const write = deferred<IngestResult[]>();
    const { rerender } = await mount(() => write.promise);
    drag('tk_c', 'doing');
    await act(async () => write.resolve(committed([{ id: 'x' }])));

    // STALE — a new read object, old data: tk_c is still in To do.
    rerender(board());
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_z']);
    // Even while the write is committed and several stale frames arrive.
    rerender(board());
    rerender(board());
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);

    // CONTROL — the read that AGREES arrives: no visible change …
    rerender(board({ todo: ['tk_a', 'tk_z'], doing: ['tk_b', 'tk_c', 'tk_d'], done: [] }));
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    // … and the overlay is gone: a LATER read that puts tk_c in Done (someone else moved it) is believed.
    rerender(board({ todo: ['tk_a', 'tk_z'], doing: ['tk_b', 'tk_d'], done: ['tk_c'] }));
    expect(idsIn('done')).toEqual(['tk_c']);
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d']);
  });

  it('20.126 a read that lands while the write is STILL in flight and shows the old state does not flash it back either', async () => {
    const write = deferred<IngestResult[]>();
    const { rerender } = await mount(() => write.promise);
    drag('tk_c', 'doing');
    rerender(board());
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    await act(async () => write.resolve(committed([{ id: 'x' }])));
  });
});

describe('20.127 a refused move glides the card back to its source slot, with the refusal copy under it', () => {
  it('20.127 the server refuses: tk_c returns to To do at its old index and the existing notice shows', async () => {
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise);
    drag('tk_c', 'doing');
    expect(idsIn('doing')).toContain('tk_c'); // CONTROL — it really left, optimistically

    await act(async () => write.resolve(refused([{ id: 'x' }])));

    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']);
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d']);
    const notice = within(slotOf('tk_c')).getByRole('alert');
    expect(notice).toHaveTextContent('Refused by the server — some-rule: Not allowed right now.');
    expect(slotOf('tk_c')).not.toHaveAttribute('data-move-phase');
  });

  it('20.127 the card can be moved again after a refusal (the submitting latch is released)', async () => {
    let calls = 0;
    await mount((events) => {
      calls += 1;
      return calls === 1 ? refused(events) : committed(events);
    });
    drag('tk_c', 'doing');
    await waitFor(() => expect(idsIn('todo')).toContain('tk_c'));
    drag('tk_c', 'doing');
    await waitFor(() => expect(calls).toBe(2));
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
  });
});

describe('20.128 a transport failure, an empty answer and an invalid answer all send the card back', () => {
  it('20.128 ingest rejects: back in To do, with the could-not-reach copy', async () => {
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise);
    drag('tk_c', 'doing');
    expect(idsIn('doing')).toContain('tk_c');
    await act(async () => write.reject(new Error('network unreachable')));
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']);
    expect(within(slotOf('tk_c')).getByRole('alert')).toHaveTextContent('We could not reach the server for this move');
  });

  it('20.128 results[0] is undefined (an empty answer): back, with the did-not-answer copy', async () => {
    await mount(() => []);
    drag('tk_c', 'doing');
    await waitFor(() => expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']));
    expect(within(slotOf('tk_c')).getByRole('alert')).toHaveTextContent('The server did not answer this move.');
  });

  it('20.128 an invalid answer is refused the same way', async () => {
    await mount((events) => events.map((event) => ({ status: 'invalid' as const, eventId: event.id, code: 'duplicate-event-id' as const, message: 'Malformed.' })));
    drag('tk_c', 'doing');
    await waitFor(() => expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']));
    expect(within(slotOf('tk_c')).getByRole('alert')).toHaveTextContent('Malformed.');
  });
});

describe('20.129 a move that needs input waits in the landing slot, faded, while its dialog is open', () => {
  it('20.129 the card is in Doing and marked awaiting with the dialog open; Confirm settles it at full strength', async () => {
    const user = userEvent.setup();
    const write = deferred<IngestResult[]>();
    const { source } = await mount(() => write.promise, GATED);
    drag('tk_c', 'doing');

    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(source.ingested).toHaveLength(0);
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    expect(slotOf('tk_c')).toHaveAttribute('data-move-phase', 'awaiting');
    expect(slotOf('tk_c')).toHaveClass('gn-board__card-slot--waiting');
    // The dialog survived the card changing column: it is the same gesture's dialog, now inside the landed card.
    expect(slotOf('tk_c')).toContainElement(dialog);

    await user.type(within(dialog).getByLabelText('Comment (required by this transition)'), 'starting');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    // Written: full strength, still in Doing.
    expect(slotOf('tk_c')).toHaveAttribute('data-move-phase', 'writing');
    expect(slotOf('tk_c')).not.toHaveClass('gn-board__card-slot--waiting');

    await act(async () => write.resolve(committed([{ id: 'x' }, { id: 'y' }])));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    expect(slotOf('tk_c')).toHaveAttribute('data-move-phase', 'committed');
  });

  it('20.129 a refusal from the dialog leaves the card waiting (faded) with the dialog open, to retry or cancel', async () => {
    const user = userEvent.setup();
    await mount((events) => refused(events), GATED);
    drag('tk_c', 'doing');
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    await user.type(within(dialog).getByLabelText('Comment (required by this transition)'), 'starting');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Move ticket' })).toBeInTheDocument();
    expect(slotOf('tk_c')).toHaveAttribute('data-move-phase', 'awaiting');
    expect(idsIn('doing')).toContain('tk_c');
  });
});

describe('20.130 cancelling a dialog-gated move sends the card back', () => {
  it('20.130 Cancel closes the dialog and the card returns to To do (CONTROL: it was in Doing a moment before)', async () => {
    const user = userEvent.setup();
    const { source } = await mount(() => [], GATED);
    drag('tk_c', 'doing');
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(idsIn('doing')).toContain('tk_c'); // CONTROL

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']);
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d']);
    expect(source.ingested).toHaveLength(0);
  });
});

describe('20.131 the ‹ › arrows take the same optimistic path as a drop', () => {
  it('20.131 pressing › moves the card to Doing before the write answers, and a refusal sends it back', async () => {
    const user = userEvent.setup();
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise);
    await user.click(within(slotOf('tk_c')).getByRole('button', { name: 'Move to Doing' }));

    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_z']);

    await act(async () => write.resolve(refused([{ id: 'x' }])));
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']);
    expect(within(slotOf('tk_c')).getByRole('alert')).toHaveTextContent('Refused by the server');
  });
});

describe('20.146 quick moves never lose or duplicate a card', () => {
  it('20.146 two different cards moved while the first write is open each appear once in their target', async () => {
    const writes = [deferred<IngestResult[]>(), deferred<IngestResult[]>()];
    let n = 0;
    await mount(() => writes[n++]!.promise);
    drag('tk_a', 'doing');
    drag('tk_z', 'doing');
    expect(idsIn('doing')).toEqual(['tk_a', 'tk_b', 'tk_d', 'tk_z']);
    expect(idsIn('todo')).toEqual(['tk_c']);
    // The first is refused, the second commits: only the first returns.
    await act(async () => {
      writes[0]!.resolve(refused([{ id: 'x' }]));
      writes[1]!.resolve(committed([{ id: 'y' }]));
    });
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c']);
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d', 'tk_z']);
    const all = ['todo', 'doing', 'done'].flatMap(idsIn).sort();
    expect(all).toEqual(['tk_a', 'tk_b', 'tk_c', 'tk_d', 'tk_z']);
  });

  it('20.146 a second move of the same card while the first is pending is ignored by the latch — one card, one write', async () => {
    const write = deferred<IngestResult[]>();
    const { source } = await mount(() => write.promise);
    drag('tk_c', 'doing');
    drag('tk_c', 'done'); // refused by the latch: the first write has not answered
    expect(source.ingested).toHaveLength(1);
    expect(['todo', 'doing', 'done'].flatMap(idsIn).filter((id) => id === 'tk_c')).toHaveLength(1);
    await act(async () => write.resolve(committed([{ id: 'x' }])));
  });
});

describe('20.133 the card flies from the drop point to its landing slot — and does not when motion is reduced or a dialog is open', () => {
  /** Per-element rectangles: the landing slot of tk_c at (400, 200), everything else at the origin. */
  function plantRects(rects: Record<string, { left: number; top: number }> = { 'ticket-card-tk_c': { left: 400, top: 200 } }) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const at = rects[this.getAttribute('data-testid') ?? ''] ?? { left: 0, top: 0 };
      return { left: at.left, top: at.top, right: at.left + 280, bottom: at.top + 120, width: 280, height: 120, x: at.left, y: at.top, toJSON: () => ({}) } as DOMRect;
    });
  }

  it('20.133 the landed card carries the flight class and the offset from the drop point to the slot', async () => {
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise);
    plantRects();
    // The card is grabbed 20px right / 30px down of its corner (corner at 0,0 in this stub; pointer at 20,30) …
    const dataTransfer = dragData();
    fireAt('dragStart', slotOf('tk_c'), dataTransfer, 20, 30);
    // … and dropped with the pointer at (600, 500): the card's corner was at (580, 470).
    fireAt('drop', columnOf('doing'), dataTransfer, 600, 500);

    const landed = slotOf('tk_c');
    expect(landed).toHaveClass('gn-board__card-slot--flight');
    // (580 - 400, 470 - 200): the card starts 180px right of and 270px below where it settles.
    expect(landed.style.getPropertyValue('--gn-flip-x')).toBe('180px');
    expect(landed.style.getPropertyValue('--gn-flip-y')).toBe('270px');
    // CONTROL — a neighbour that did not move carries no flight.
    expect(slotOf('tk_b')).not.toHaveClass('gn-board__card-slot--flight');
    await act(async () => write.resolve(committed([{ id: 'x' }])));
  });

  it('20.133 the flight ends with the animation: animationend removes the class', async () => {
    await mount(() => new Promise<IngestResult[]>(() => {}));
    plantRects();
    const dataTransfer = dragData();
    fireAt('dragStart', slotOf('tk_c'), dataTransfer, 20, 30);
    fireAt('drop', columnOf('doing'), dataTransfer, 600, 500);
    expect(slotOf('tk_c')).toHaveClass('gn-board__card-slot--flight');
    fireEvent.animationEnd(slotOf('tk_c'));
    expect(slotOf('tk_c')).not.toHaveClass('gn-board__card-slot--flight');
  });

  it('20.133 under prefers-reduced-motion the card is placed instantly: no flight class, no offset', async () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      await mount(() => new Promise<IngestResult[]>(() => {}));
      plantRects();
      const dataTransfer = dragData();
      fireAt('dragStart', slotOf('tk_c'), dataTransfer, 20, 30);
      fireAt('drop', columnOf('doing'), dataTransfer, 600, 500);
      expect(idsIn('doing')).toContain('tk_c'); // everything else is identical: it still moves at once
      expect(slotOf('tk_c')).not.toHaveClass('gn-board__card-slot--flight');
      expect(slotOf('tk_c').style.getPropertyValue('--gn-flip-x')).toBe('');
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('20.133 a refused move glides BACK with the same motion: the source card carries a flight from where it was drawn', async () => {
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise);
    // tk_c is drawn at (400,200) while it sits in Doing, and its own slot in To do is at (50,130).
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isC = this.getAttribute('data-testid') === 'ticket-card-tk_c';
      const at = !isC ? { left: 0, top: 0 } : this.closest('[data-testid="board-column-todo"]') !== null ? { left: 50, top: 130 } : { left: 400, top: 200 };
      return { left: at.left, top: at.top, right: at.left + 280, bottom: at.top + 120, width: 280, height: 120, x: at.left, y: at.top, toJSON: () => ({}) } as DOMRect;
    });
    drag('tk_c', 'doing');
    await act(async () => write.resolve(refused([{ id: 'x' }])));
    const back = slotOf('tk_c');
    expect(back).toHaveClass('gn-board__card-slot--flight');
    // From (400,200) to (50,130): it starts 350px right of and 70px below its slot.
    expect(back.style.getPropertyValue('--gn-flip-x')).toBe('350px');
    expect(back.style.getPropertyValue('--gn-flip-y')).toBe('70px');
  });

  it('20.133 no flight while a dialog is open inside the card (a transform would drag the fixed scrim with it)', async () => {
    await mount(() => [], GATED);
    plantRects();
    const dataTransfer = dragData();
    fireAt('dragStart', slotOf('tk_c'), dataTransfer, 20, 30);
    fireAt('drop', columnOf('doing'), dataTransfer, 600, 500);
    await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(slotOf('tk_c')).not.toHaveClass('gn-board__card-slot--flight');
  });
});

describe('20.138 after a drop the landing slot scrolls into view — only when it is outside the viewport', () => {
  it('20.138 a slot below the fold is scrolled to (smooth, nearest); one already in view is left alone', async () => {
    await mount(() => new Promise<IngestResult[]>(() => {}));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const below = this.getAttribute('data-testid') === 'ticket-card-tk_c';
      const top = below ? window.innerHeight + 300 : 100;
      return { left: 100, top, right: 380, bottom: top + 120, width: 280, height: 120, x: 100, y: top, toJSON: () => ({}) } as DOMRect;
    });

    drag('tk_a', 'doing'); // lands at y=100: in view
    expect(scrollIntoView.mock.contexts).not.toContain(slotOf('tk_a'));

    drag('tk_c', 'doing'); // lands below the fold
    expect(scrollIntoView.mock.contexts).toContain(slotOf('tk_c'));
    const call = scrollIntoView.mock.calls[scrollIntoView.mock.contexts.indexOf(slotOf('tk_c'))]!;
    expect(call[0]).toEqual({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  });

  it('20.138 under reduced motion the scroll is instant (behavior auto)', async () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      await mount(() => new Promise<IngestResult[]>(() => {}));
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        return { left: 100, top: window.innerHeight + 300, right: 380, bottom: window.innerHeight + 420, width: 280, height: 120, x: 100, y: 0, toJSON: () => ({}) } as DOMRect;
      });
      drag('tk_c', 'doing');
      const call = scrollIntoView.mock.calls[scrollIntoView.mock.contexts.indexOf(slotOf('tk_c'))]!;
      expect(call[0].behavior).toBe('auto');
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });
});
