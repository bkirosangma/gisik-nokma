import { act, cleanup, createEvent, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, WorkflowDef } from '@gisik-nokma/domain';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import { FLIGHT_MAX_AGE_MS } from '../../src/views/board-motion.js';
import { PENDING_TTL_MS, useMoveState, type PendingMove } from '../../src/views/board-move-state.js';
import type { BoardCard, BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * Optimistic, animated board moves (owner, 2026-10-01) — cases 20.125–20.131, 20.133, 20.135 (the board wires the scroller), 20.138, 20.146.
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
    expect(notice).toHaveTextContent('Refused by the server: some-rule: Not allowed right now.');
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

describe('20.130 a dialog closed while its write is open cannot leave the card stuck faded', () => {
  it('20.130 Cancel while the write is in flight, then the write fails: the card returns to To do, no wash, no dialog', async () => {
    const user = userEvent.setup();
    const write = deferred<IngestResult[]>();
    const { source } = await mount(() => write.promise, GATED);
    drag('tk_c', 'doing');
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    await user.type(within(dialog).getByLabelText('Comment (required by this transition)'), 'starting');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(slotOf('tk_c')).toHaveAttribute('data-move-phase', 'writing');

    // The board never passes `submitting` to the dialog, so Cancel stays live while the write is open.
    await user.click(within(screen.getByRole('dialog', { name: 'Move ticket' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(idsIn('doing')).toContain('tk_c'); // CONTROL — the write is still open, the card still drawn in Doing

    await act(async () => write.reject(new Error('network unreachable')));
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']);
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d']);
    expect(slotOf('tk_c')).not.toHaveClass('gn-board__card-slot--waiting');
  });

  it('20.130 the same for a refusal: Cancel mid-write, server refuses — back in To do with the refusal under it', async () => {
    const user = userEvent.setup();
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise, GATED);
    drag('tk_c', 'doing');
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    await user.type(within(dialog).getByLabelText('Comment (required by this transition)'), 'starting');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Move ticket' })).getByRole('button', { name: 'Cancel' }));
    await act(async () => write.resolve(refused([{ id: 'x' }, { id: 'y' }])));
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']);
    expect(within(slotOf('tk_c')).getByRole('alert')).toHaveTextContent('Refused by the server');
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
    // `todo → done` is a LEGAL, rules-free edge here — so only the latch (not the gate) can stop the second drop.
    const OPEN_EDGES: WorkflowDef = { ...WF_ERRAND, transitions: [...WF_ERRAND.transitions, { from: 'todo', to: 'done', rules: [] }] };
    const { source } = await mount(() => write.promise, OPEN_EDGES);
    drag('tk_c', 'doing');
    drag('tk_c', 'done'); // the first write has not answered: the latch ignores this one
    expect(source.ingested).toHaveLength(1);
    expect(idsIn('doing')).toContain('tk_c');
    expect(idsIn('done')).not.toContain('tk_c');
    expect(['todo', 'doing', 'done'].flatMap(idsIn).filter((id) => id === 'tk_c')).toHaveLength(1);
    await act(async () => write.resolve(committed([{ id: 'x' }])));
    expect(source.ingested).toHaveLength(1); // one write in all: the answer did not release a second one either
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

describe('20.135 the board runs the edge scroller for exactly the life of a card drag', () => {
  let frames: Array<FrameRequestCallback | null>;
  let scrollBy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames[id - 1] = null;
    });
    scrollBy = vi.fn();
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
  });
  const runFrame = () => {
    for (const callback of frames.splice(0, frames.length)) callback?.(0);
  };
  const dragOverAt = (y: number) => document.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientX: 300, clientY: y }));

  it('20.135 a card dragstart starts it (a dragover near the top scrolls the page); a drop stops it', async () => {
    await mount(() => new Promise<IngestResult[]>(() => {}));
    // CONTROL — with no drag under way the very same dragover scrolls nothing.
    dragOverAt(10);
    runFrame();
    expect(scrollBy).not.toHaveBeenCalled();

    const dataTransfer = dragData();
    fireAt('dragStart', slotOf('tk_c'), dataTransfer);
    dragOverAt(10);
    runFrame();
    expect(scrollBy).toHaveBeenCalled();
    expect(scrollBy.mock.calls.at(-1)![1]).toBeLessThan(0);

    fireEvent.drop(columnOf('doing'), { dataTransfer });
    const seen = scrollBy.mock.calls.length;
    runFrame();
    runFrame();
    expect(scrollBy.mock.calls.length).toBe(seen);
  });

  it('20.159 a dragstart that is not a card drag (a text or file drag) does not begin it (CONTROL: a card dragstart does)', async () => {
    // Mutation `scroller begun for any drag`: board root `onDragStart` calls `scrollerRef.current?.begin()` without the `isCardDrag(event)` guard.
    await mount(() => new Promise<IngestResult[]>(() => {}));
    const foreign = dragData();
    foreign.setData('text/plain', 'some selected text'); // no DRAG_CARD_MARKER
    fireEvent.dragStart(columnOf('todo'), { dataTransfer: foreign });
    dragOverAt(10);
    runFrame();
    expect(scrollBy).not.toHaveBeenCalled();

    fireAt('dragStart', slotOf('tk_c'), dragData());
    dragOverAt(10);
    runFrame();
    expect(scrollBy).toHaveBeenCalled(); // CONTROL — the very same dragover, once a CARD drag has begun
  });

  it('20.135 unmounting the board mid-drag stops the loop', async () => {
    const onMoved = vi.fn();
    const source = createFakeDataSource({ getWorkflowDef: async () => WF_ERRAND });
    const moves: BoardMoveCapability = { dataSource: source, workspaceId: WS, currentUserId: CURRENT_USER, onMoved };
    const utils = render(<Board board={board()} onOpenTicket={() => {}} moves={moves} />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0));
    fireAt('dragStart', slotOf('tk_c'), dragData());
    dragOverAt(10);
    runFrame();
    const seen = scrollBy.mock.calls.length;
    expect(seen).toBeGreaterThan(0); // CONTROL — it was running
    utils.unmount();
    runFrame();
    dragOverAt(10);
    runFrame();
    expect(scrollBy.mock.calls.length).toBe(seen);
  });
});

/** Per-element rectangles for the survivor cases: tk_c settles at (400,200), tk_a at (40,100), everything else at the origin. */
function plantLandingRects(rects: Record<string, { left: number; top: number }> = { 'ticket-card-tk_c': { left: 400, top: 200 }, 'ticket-card-tk_a': { left: 40, top: 100 } }) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const at = rects[this.getAttribute('data-testid') ?? ''] ?? { left: 0, top: 0 };
    return { left: at.left, top: at.top, right: at.left + 280, bottom: at.top + 120, width: 280, height: 120, x: at.left, y: at.top, toJSON: () => ({}) } as DOMRect;
  });
}

describe('20.149 a dialog confirming a card already drawn in its target leaves no flight behind', () => {
  const move = (overrides: Partial<PendingMove> = {}): PendingMove => ({
    ticketId: 'tk_c',
    workflowId: 'wf-errand',
    fromStateId: 'todo',
    toStateId: 'doing',
    phase: 'awaiting',
    ...overrides,
  });

  it('20.149 re-asserting the entry for the same target sets no flight; aiming it at a NEW column does', () => {
    // Mutation `beginPending always flies`: `if (pendingRef.current[move.ticketId]?.toStateId !== move.toStateId) {` -> `if (true) {`.
    const view = board();
    const { result } = renderHook(() => useMoveState(view));
    result.current.slots.current.set('tk_c', document.createElement('li')); // a measurable slot: the flight has somewhere to start from

    act(() => result.current.beginPending(move(), { left: 10, top: 20, at: Date.now() }));
    expect(result.current.flights.current.has('tk_c')).toBe(true); // CONTROL — the first assertion of a target flies
    result.current.flights.current.delete('tk_c'); // the card's mount in Doing consumed it

    act(() => result.current.beginPending(move({ phase: 'writing' }))); // Confirm: the same card, the same target
    expect(result.current.flights.current.has('tk_c')).toBe(false);

    act(() => result.current.beginPending(move({ toStateId: 'done', phase: 'writing' })));
    expect(result.current.flights.current.has('tk_c')).toBe(true); // a real change of column still flies
  });
});

describe('20.150 a committed move that no read ever confirms releases the card after the TTL, through the real timer', () => {
  afterEach(() => vi.useRealTimers());

  it('20.150 still in Doing one ms before PENDING_TTL_MS, back in To do at it (CONTROL: it was committed and kept)', async () => {
    // Mutation `setPhase committed sets no timestamp`: drop `...(phase === 'committed' ? { settledAt: Date.now() } : {})` from `setPhase`.
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    drag('tk_c', 'doing');
    await act(async () => write.resolve(committed([{ id: 'x' }])));
    expect(slotOf('tk_c')).toHaveAttribute('data-move-phase', 'committed'); // CONTROL — committed, and no rerender ever brings a read that agrees
    await act(async () => void vi.advanceTimersByTime(PENDING_TTL_MS - 1));
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    await act(async () => void vi.advanceTimersByTime(1));
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']);
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d']);
  });
});

describe('20.152 a flight nobody claimed in time is discarded at mount', () => {
  it('20.152 a flight older than FLIGHT_MAX_AGE_MS does not fly (CONTROL: a fresh one, same drop, does)', async () => {
    // Mutation `stale flight still flies`: delete `if (Date.now() - from.at > FLIGHT_MAX_AGE_MS) return;` from the `BoardCardSlot` layout effect.
    await mount(() => new Promise<IngestResult[]>(() => {}));
    plantLandingRects();
    drag('tk_a', 'doing');
    expect(slotOf('tk_a')).toHaveClass('gn-board__card-slot--flight'); // CONTROL

    // Every Date.now() now moves the clock on: the drop stamps the flight, the card's mount reads it a call later.
    let clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += FLIGHT_MAX_AGE_MS + 1));
    drag('tk_c', 'doing');
    expect(idsIn('doing')).toContain('tk_c'); // it still moved at once
    expect(slotOf('tk_c')).not.toHaveClass('gn-board__card-slot--flight');
  });
});

describe('20.153 a flight is consumed by the mount that claims it', () => {
  it('20.153 a SECOND mount of the same ticket within the window does not fly (CONTROL: the first mount did)', async () => {
    // Mutation `flight not consumed`: delete `flights.current.delete(card.ticketId);` from the `BoardCardSlot` layout effect.
    const { rerender } = await mount(() => committed([{ id: 'x' }]));
    plantLandingRects();
    drag('tk_c', 'doing', { x: 600, y: 500 });
    expect(slotOf('tk_c')).toHaveClass('gn-board__card-slot--flight'); // CONTROL — the mount that claimed it flew
    await act(async () => {});
    // A read agrees and the overlay retires; a LATER read has someone else moving the card on to Done: a fresh mount in Done.
    rerender(board({ todo: ['tk_a', 'tk_z'], doing: ['tk_b', 'tk_c', 'tk_d'], done: [] }));
    rerender(board({ todo: ['tk_a', 'tk_z'], doing: ['tk_b', 'tk_d'], done: ['tk_c'] }));
    expect(idsIn('done')).toEqual(['tk_c']);
    expect(slotOf('tk_c')).not.toHaveClass('gn-board__card-slot--flight');
  });
});

describe('20.154 the settle scroll also honours the rail’s own visible box', () => {
  it('20.154 a slot inside the window but past its rail’s edge is scrolled to (CONTROL: inside both, it is left alone)', async () => {
    // Mutation `settle scroll ignores the rail`: `isOffscreen(rect, {...})` called without the third (rail box) argument.
    await mount(() => new Promise<IngestResult[]>(() => {}));
    const box = (left: number, top: number) =>
      ({ left, top, right: left + 280, bottom: top + 120, width: 280, height: 120, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('gn-board__rail')) return { ...box(0, 0), right: 300, bottom: 600, width: 300, height: 600 } as DOMRect; // the rail shows x 0..300
      return this.getAttribute('data-testid') === 'ticket-card-tk_c' ? box(500, 100) : box(10, 100); // tk_c: in the window, past the rail
    });
    drag('tk_a', 'doing'); // inside both
    expect(scrollIntoView.mock.contexts).not.toContain(slotOf('tk_a')); // CONTROL
    drag('tk_c', 'doing');
    expect(scrollIntoView.mock.contexts).toContain(slotOf('tk_c'));
  });
});

describe('20.161 Confirm takes the card out of the waiting look at once', () => {
  it('20.161 the render right after Confirm has no wash and phase writing, with the ingest still open (CONTROL: before Confirm it was awaiting)', async () => {
    const user = userEvent.setup();
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise, GATED);
    drag('tk_c', 'doing');
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(slotOf('tk_c')).toHaveClass('gn-board__card-slot--waiting'); // CONTROL
    expect(slotOf('tk_c')).toHaveAttribute('data-move-phase', 'awaiting');

    await user.type(within(dialog).getByLabelText('Comment (required by this transition)'), 'starting');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    // No waitFor, no await on the ingest: this is the very next render.
    expect(slotOf('tk_c')).toHaveAttribute('data-move-phase', 'writing');
    expect(slotOf('tk_c')).not.toHaveClass('gn-board__card-slot--waiting');
    await act(async () => write.resolve(committed([{ id: 'x' }, { id: 'y' }])));
  });
});

describe('20.162 the cards below a card that leaves glide up into the gap — the same FLIP as the landing', () => {
  /**
   * A column laid out as a stack: a card's top is 100 + 130 × its index in its list, its left 300 × its column.
   * `drift` also moves tk_a (ABOVE the mover) up by 10px once tk_c has left To do — a card nothing below should glide.
   */
  function plantFlow(drift = false) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      let left = 0;
      let top = 0;
      if (this.tagName === 'LI' && id.startsWith('ticket-card-')) {
        const column = this.closest('[data-testid^="board-column-"]')?.getAttribute('data-testid')?.slice('board-column-'.length) ?? '';
        left = 300 * Math.max(0, ['todo', 'doing', 'done'].indexOf(column));
        top = 100 + 130 * Array.from(this.parentElement!.children).indexOf(this);
        const cLeft = document.querySelector('[data-testid="board-column-todo"] [data-testid="ticket-card-tk_c"]') === null;
        if (drift && id === 'ticket-card-tk_a' && cLeft) top -= 10;
      }
      return { left, top, right: left + 280, bottom: top + 120, width: 280, height: 120, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
  }
  const flies = (id: string) => slotOf(id).classList.contains('gn-board__card-slot--flight');
  const offset = (id: string) => [slotOf(id).style.getPropertyValue('--gn-flip-x'), slotOf(id).style.getPropertyValue('--gn-flip-y')];

  it('20.162 a drop: tk_z slides up from its old offset on the shared flight class (CONTROL: tk_a above, and tk_d in the target, do not glide)', async () => {
    // Mutations: drop the sibling FLIP; cards above glide too (the `after` filter); target-column cards glide; sibling measured from the
    // mover's rect; siblings carry their own timing instead of the token's.
    await mount(() => new Promise<IngestResult[]>(() => {}));
    plantFlow(true);
    drag('tk_c', 'doing');
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_z']);
    // tk_z was drawn at 100 + 130×2 = 360 and now sits at 230: it starts 130px BELOW its slot and glides up.
    expect(flies('tk_z')).toBe(true);
    expect(offset('tk_z')).toEqual(['0px', '130px']);
    // The very machinery of the landing card: one class, the stylesheet's token timing (20.134), nothing inline.
    expect(slotOf('tk_z').className).toBe(slotOf('tk_c').className);
    expect(slotOf('tk_z').style.animation).toBe('');
    expect(slotOf('tk_z').style.animationDuration).toBe('');
    // CONTROL — the landing card flew too, so "does not glide" below is not a harness that never glides.
    expect(flies('tk_c')).toBe(true);
    expect(flies('tk_a')).toBe(false); // above the mover: even though the layout moved it 10px
    expect(flies('tk_d')).toBe(false); // the target column's cards shift for the landing slot (the drop placeholder opened it): they are not glided
    fireEvent.animationEnd(slotOf('tk_z'));
    expect(flies('tk_z')).toBe(false);
  });

  it('20.162 the arrows take the same path: pressing › on tk_c glides tk_z up (CONTROL: tk_a stays)', async () => {
    const user = userEvent.setup();
    await mount(() => new Promise<IngestResult[]>(() => {}));
    plantFlow();
    await user.click(within(slotOf('tk_c')).getByRole('button', { name: 'Move to Doing' }));
    expect(offset('tk_z')).toEqual(['0px', '130px']);
    expect(flies('tk_z')).toBe(true);
    expect(flies('tk_a')).toBe(false);
  });
});

describe('20.168 a sibling that also shifts sideways flies from its old x as well as its old y', () => {
  it('20.168 tk_z reflowed 25px right as tk_a leaves: --gn-flip-x is old − new (-25px) beside --gn-flip-y 130px (CONTROL: tk_c, shifted only vertically, has x 0)', async () => {
    // Mutation: `dx = from.left - rect.left` → `rect.left - from.left` in the sibling effect (every other sibling test moves vertically only).
    await mount(() => new Promise<IngestResult[]>(() => {}));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      let left = 0;
      let top = 0;
      if (this.tagName === 'LI' && id.startsWith('ticket-card-')) {
        const column = this.closest('[data-testid^="board-column-"]')?.getAttribute('data-testid')?.slice('board-column-'.length) ?? '';
        left = 300 * Math.max(0, ['todo', 'doing', 'done'].indexOf(column));
        top = 100 + 130 * Array.from(this.parentElement!.children).indexOf(this);
        const aLeft = document.querySelector('[data-testid="board-column-todo"] [data-testid="ticket-card-tk_a"]') === null;
        if (aLeft && id === 'ticket-card-tk_z') left += 25; // a reflow: tk_z alone slides 25px right once tk_a has gone
      }
      return { left, top, right: left + 280, bottom: top + 120, width: 280, height: 120, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
    drag('tk_a', 'doing');
    expect(idsIn('todo')).toEqual(['tk_c', 'tk_z']);
    const flip = (id: string) => [slotOf(id).style.getPropertyValue('--gn-flip-x'), slotOf(id).style.getPropertyValue('--gn-flip-y')];
    // tk_z was drawn at (0, 360) and now sits at (25, 230): it starts 25px LEFT of and 130px BELOW its slot.
    expect(flip('tk_z')).toEqual(['-25px', '130px']);
    // CONTROL — tk_c has only the vertical displacement (no horizontal component), and both siblings fly.
    expect(flip('tk_c')).toEqual(['0px', '130px']);
    expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(true);
    expect(slotOf('tk_c').classList.contains('gn-board__card-slot--flight')).toBe(true);
  });
});

describe('20.162 a card with its dialog open is not glided, whichever move shifts it', () => {
  it('20.162 tk_z awaiting in Doing keeps still while tk_b above it leaves; tk_d, with no dialog, glides (CONTROL)', async () => {
    // Mutation: the sibling claim ignores an open dialog (a transform would drag the fixed scrim with it).
    const user = userEvent.setup();
    await mount(() => new Promise<IngestResult[]>(() => {}), GATED);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      const top = this.tagName === 'LI' && id.startsWith('ticket-card-') ? 100 + 130 * Array.from(this.parentElement!.children).indexOf(this) : 0;
      return { left: 0, top, right: 280, bottom: top + 120, width: 280, height: 120, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
    drag('tk_z', 'doing'); // gated: lands in Doing (b, d, z) awaiting, dialog open inside it
    await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d', 'tk_z']);

    await user.click(within(slotOf('tk_b')).getByRole('button', { name: /Move to To do/ })); // tk_b leaves; d and z close up
    expect(idsIn('doing')).toEqual(['tk_d', 'tk_z']);
    expect(slotOf('tk_d').classList.contains('gn-board__card-slot--flight')).toBe(true); // CONTROL
    expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(false);
  });
});

describe('20.163 a refused move reopens the slot: the cards below slide down again', () => {
  it('20.163 tk_z glides up on the drop and back DOWN on the refusal (CONTROL: tk_a, above, never glides; tk_d, in the target, held open by the placeholder, stood still at the drop and glides back UP on the refusal — 20.176)', async () => {
    // Mutation: refusal does not FLIP the siblings back (no sibling record in `dropPending`).
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      const stacked = this.tagName === 'LI' && id.startsWith('ticket-card-');
      const top = stacked ? 100 + 130 * Array.from(this.parentElement!.children).indexOf(this) : 0;
      return { left: 0, top, right: 280, bottom: top + 120, width: 280, height: 120, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
    drag('tk_c', 'doing');
    expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(true); // CONTROL — it closed the gap
    fireEvent.animationEnd(slotOf('tk_z'));
    fireEvent.animationEnd(slotOf('tk_c'));
    expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(false);

    await act(async () => write.resolve(refused([{ id: 'x' }])));
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']);
    // tk_z was at 230 (closed) and is back at 360: it starts 130px ABOVE its slot and slides down.
    expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(true);
    expect(slotOf('tk_z').style.getPropertyValue('--gn-flip-y')).toBe('-130px');
    expect(slotOf('tk_a').classList.contains('gn-board__card-slot--flight')).toBe(false);
    expect(slotOf('tk_d').classList.contains('gn-board__card-slot--flight')).toBe(true); // the placeholder's opening closes smoothly (20.176)
    expect(slotOf('tk_d').style.getPropertyValue('--gn-flip-y')).toBe('130px');
  });
});

describe('20.164 under reduced motion the cards below close the gap instantly', () => {
  it('20.164 no flight class on tk_z with reduced motion on (CONTROL: the same move without it glided, in the same board)', async () => {
    // Mutation: reduced motion not honoured for the siblings.
    let reduce = false;
    window.matchMedia = ((query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      await mount(() => new Promise<IngestResult[]>(() => {}));
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const id = this.getAttribute('data-testid') ?? '';
        const top = this.tagName === 'LI' && id.startsWith('ticket-card-') ? 100 + 130 * Array.from(this.parentElement!.children).indexOf(this) : 0;
        return { left: 0, top, right: 280, bottom: top + 120, width: 280, height: 120, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
      });
      drag('tk_c', 'doing');
      expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(true); // CONTROL
      fireEvent.animationEnd(slotOf('tk_z'));

      reduce = true;
      drag('tk_a', 'doing'); // tk_z closes up under tk_a, 130px, again
      expect(idsIn('todo')).toEqual(['tk_z']);
      expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(false);
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });
});

describe('20.165 a sibling flight is consumed once and goes stale like the landing one', () => {
  const stack = () =>
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      const top = this.tagName === 'LI' && id.startsWith('ticket-card-') ? 100 + 130 * Array.from(this.parentElement!.children).indexOf(this) : 0;
      return { left: 0, top, right: 280, bottom: top + 120, width: 280, height: 120, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });

  it('20.165 a later overlay change (the commit) does not fly tk_z again (CONTROL: it flew once)', async () => {
    // Mutation: the sibling flight is never consumed (no `flights.current.delete` in the sibling claim).
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise);
    stack();
    drag('tk_c', 'doing');
    expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(true); // CONTROL
    fireEvent.animationEnd(slotOf('tk_z'));
    await act(async () => write.resolve(committed([{ id: 'x' }])));
    expect(slotOf('tk_c')).toHaveAttribute('data-move-phase', 'committed'); // the overlay changed, tk_z re-rendered
    expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(false);
  });

  it('20.165 a sibling flight older than FLIGHT_MAX_AGE_MS is ignored (CONTROL: a fresh one, same board, glides)', async () => {
    // Mutation: the sibling claim has no age check.
    await mount(() => new Promise<IngestResult[]>(() => {}));
    stack();
    drag('tk_c', 'doing');
    expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(true); // CONTROL
    fireEvent.animationEnd(slotOf('tk_z'));
    let clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += FLIGHT_MAX_AGE_MS + 1));
    drag('tk_a', 'doing');
    expect(idsIn('todo')).toEqual(['tk_z']);
    expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(false);
  });
});

describe('20.166 nothing below, or nowhere to go: nothing glides and nothing throws', () => {
  it('20.166 the last card of its column leaves: no sibling flies; a drop on its own column moves and animates nothing (CONTROL: the landing card flies)', async () => {
    await mount(() => new Promise<IngestResult[]>(() => {}));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      const top = this.tagName === 'LI' && id.startsWith('ticket-card-') ? 100 + 130 * Array.from(this.parentElement!.children).indexOf(this) : 0;
      const left = this.closest('[data-testid="board-column-doing"]') !== null ? 300 : 0;
      return { left, top, right: left + 280, bottom: top + 120, width: 280, height: 120, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
    const flying = () => document.querySelectorAll('.gn-board__card-slot--flight').length;

    drag('tk_c', 'todo'); // the board has no reorder: a drop on its own column is a no-op
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']);
    expect(flying()).toBe(0);

    expect(() => drag('tk_z', 'doing')).not.toThrow(); // last in To do: nothing below it
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c']);
    expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(true); // CONTROL
    expect(slotOf('tk_a').classList.contains('gn-board__card-slot--flight')).toBe(false);
    expect(slotOf('tk_c').classList.contains('gn-board__card-slot--flight')).toBe(false);
  });
});

describe('20.169 an ARROW move opens the slot in the target column: the cards below the landing index glide down', () => {
  /**
   * A stack layout (top = 100 + 130 × index, left = 300 × column). Once tk_c is drawn in Doing, tk_d — below its landing slot —
   * also reflows 25px right, so the horizontal half of the FLIP is pinned beside the vertical one.
   */
  function plantTarget() {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      let left = 0;
      let top = 0;
      if (this.tagName === 'LI' && id.startsWith('ticket-card-')) {
        const column = this.closest('[data-testid^="board-column-"]')?.getAttribute('data-testid')?.slice('board-column-'.length) ?? '';
        left = 300 * Math.max(0, ['todo', 'doing', 'done'].indexOf(column));
        top = 100 + 130 * Array.from(this.parentElement!.children).indexOf(this);
        const cInDoing = document.querySelector('[data-testid="board-column-doing"] [data-testid="ticket-card-tk_c"]') !== null;
        if (cInDoing && id === 'ticket-card-tk_d') left += 25;
        if (cInDoing && id === 'ticket-card-tk_b') top -= 10; // above the landing slot: nothing makes it glide, whatever the layout does to it
      }
      return { left, top, right: left + 280, bottom: top + 120, width: 280, height: 120, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
  }
  const flies = (id: string) => slotOf(id).classList.contains('gn-board__card-slot--flight');
  const flip = (id: string) => [slotOf(id).style.getPropertyValue('--gn-flip-x'), slotOf(id).style.getPropertyValue('--gn-flip-y')];
  const arrow = async (id: string) => userEvent.setup().click(within(slotOf(id)).getByRole('button', { name: 'Move to Doing' }));

  it('20.169 pressing › on tk_c: tk_d slides down from (-25px, -130px) on the shared flight class (CONTROL: tk_b above stays; a DRAG of the same card records no target sibling; tk_z still closes up)', async () => {
    // Mutations: drop the target-side recording; record target siblings on the drag path too; cards above the landing index glide too;
    // the dx/dy sign flipped for target siblings; measured from the mover's rect; own timing instead of the token's.
    const never = () => new Promise<IngestResult[]>(() => {});
    await mount(never);
    plantTarget();
    drag('tk_c', 'doing');
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    expect(flies('tk_c')).toBe(true); // CONTROL — the harness does fly things
    expect(flies('tk_d')).toBe(false); // the drop placeholder had opened the slot: the drag path records no target sibling
    cleanup();
    vi.restoreAllMocks();
    Element.prototype.scrollIntoView = scrollIntoView;

    await mount(never);
    plantTarget();
    await arrow('tk_c');
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    // tk_d was drawn at (300, 230) and now sits at (325, 360): it starts 25px LEFT of and 130px ABOVE its slot.
    expect(flies('tk_d')).toBe(true);
    expect(flip('tk_d')).toEqual(['-25px', '-130px']);
    expect(slotOf('tk_d').className).toBe(slotOf('tk_c').className);
    expect(slotOf('tk_d').style.animation).toBe('');
    expect(slotOf('tk_d').style.animationDuration).toBe('');
    expect(flies('tk_b')).toBe(false); // above the landing index
    expect(flies('tk_c')).toBe(true);
    // The source column's glide (20.162) is unchanged.
    expect(flip('tk_z')).toEqual(['0px', '130px']);
    expect(flies('tk_a')).toBe(false);
    fireEvent.animationEnd(slotOf('tk_d'));
    expect(flies('tk_d')).toBe(false);
  });
});

describe('20.170 a refused arrow move closes the target slot again: the cards below slide back up', () => {
  it('20.170 tk_d glides down on the press and back UP on the refusal (CONTROL: tk_b, above, never glides; tk_c glides back itself)', async () => {
    // Mutations: refusal does not FLIP the target siblings back (no target record in `dropPending`); the mover is noted as a sibling of its own column.
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise);
    let backHome = false; // once the refusal has put tk_c back in To do, that slot lies far below the window
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      let left = 0;
      let top = 0;
      if (this.tagName === 'LI' && id.startsWith('ticket-card-')) {
        const column = this.closest('[data-testid^="board-column-"]')?.getAttribute('data-testid')?.slice('board-column-'.length) ?? '';
        left = 300 * Math.max(0, ['todo', 'doing', 'done'].indexOf(column));
        top = 100 + 130 * Array.from(this.parentElement!.children).indexOf(this);
        const cInDoing = document.querySelector('[data-testid="board-column-doing"] [data-testid="ticket-card-tk_c"]') !== null;
        if (cInDoing && id === 'ticket-card-tk_d') left += 25;
        if (backHome && id === 'ticket-card-tk_c' && column === 'todo') top = 5000;
        if (cInDoing && id === 'ticket-card-tk_b') top -= 10; // above the landing slot: nothing makes it glide, whatever the layout does to it
      }
      return { left, top, right: left + 280, bottom: top + 120, width: 280, height: 120, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
    await userEvent.setup().click(within(slotOf('tk_c')).getByRole('button', { name: 'Move to Doing' }));
    expect(slotOf('tk_d').classList.contains('gn-board__card-slot--flight')).toBe(true); // CONTROL — it opened the slot
    for (const id of ['tk_d', 'tk_c', 'tk_z']) fireEvent.animationEnd(slotOf(id));
    expect(slotOf('tk_d').classList.contains('gn-board__card-slot--flight')).toBe(false);

    scrollIntoView.mockClear();
    backHome = true;
    await act(async () => write.resolve(refused([{ id: 'x' }])));
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d']);
    // tk_d was drawn at (325, 360) and is back at (300, 230): it starts 25px right of and 130px BELOW its slot.
    expect(slotOf('tk_d').classList.contains('gn-board__card-slot--flight')).toBe(true);
    expect(slotOf('tk_d').style.getPropertyValue('--gn-flip-x')).toBe('25px');
    expect(slotOf('tk_d').style.getPropertyValue('--gn-flip-y')).toBe('130px');
    expect(slotOf('tk_b').classList.contains('gn-board__card-slot--flight')).toBe(false);
    // The mover itself comes home on ITS OWN flight (not noted as a sibling's, which never scrolls): it glides, and since its slot is
    // off-screen it scrolls itself into view like any landing.
    expect(slotOf('tk_c').classList.contains('gn-board__card-slot--flight')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalled();
  });
});

describe('20.171 under reduced motion the target cards open the slot instantly', () => {
  it('20.171 no flight class on tk_d with reduced motion on (CONTROL: the same arrow move without it glided, in the same board)', async () => {
    // Mutation: reduced motion not honoured for the target siblings.
    let reduce = false;
    window.matchMedia = ((query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      await mount(() => new Promise<IngestResult[]>(() => {}));
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const id = this.getAttribute('data-testid') ?? '';
        const column = this.closest('[data-testid^="board-column-"]')?.getAttribute('data-testid')?.slice('board-column-'.length) ?? '';
        const left = 300 * Math.max(0, ['todo', 'doing', 'done'].indexOf(column));
        const top = this.tagName === 'LI' && id.startsWith('ticket-card-') ? 100 + 130 * Array.from(this.parentElement!.children).indexOf(this) : 0;
        return { left, top, right: left + 280, bottom: top + 120, width: 280, height: 120, x: left, y: top, toJSON: () => ({}) } as DOMRect;
      });
      const user = userEvent.setup();
      await user.click(within(slotOf('tk_c')).getByRole('button', { name: 'Move to Doing' }));
      expect(slotOf('tk_d').classList.contains('gn-board__card-slot--flight')).toBe(true); // CONTROL
      for (const id of ['tk_d', 'tk_c', 'tk_z']) fireEvent.animationEnd(slotOf(id));

      reduce = true;
      await user.click(within(slotOf('tk_a')).getByRole('button', { name: 'Move to Doing' })); // lands first in Doing: b, c and d all open the slot
      expect(idsIn('doing')).toEqual(['tk_a', 'tk_b', 'tk_c', 'tk_d']);
      expect(slotOf('tk_d').classList.contains('gn-board__card-slot--flight')).toBe(false);
      expect(slotOf('tk_b').classList.contains('gn-board__card-slot--flight')).toBe(false);
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });
});

describe('20.172 landing at the end, a flight consumed once, a stale flight: the target side behaves like the source side', () => {
  const stack = () =>
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      const column = this.closest('[data-testid^="board-column-"]')?.getAttribute('data-testid')?.slice('board-column-'.length) ?? '';
      const left = 300 * Math.max(0, ['todo', 'doing', 'done'].indexOf(column));
      const top = this.tagName === 'LI' && id.startsWith('ticket-card-') ? 100 + 130 * Array.from(this.parentElement!.children).indexOf(this) : 0;
      return { left, top, right: left + 280, bottom: top + 120, width: 280, height: 120, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
  const flies = (id: string) => slotOf(id).classList.contains('gn-board__card-slot--flight');
  const press = (user: ReturnType<typeof userEvent.setup>, id: string) => user.click(within(slotOf(id)).getByRole('button', { name: 'Move to Doing' }));

  it('20.172 tk_z lands LAST in Doing: no target sibling flies and nothing throws (CONTROL: the landing card flies)', async () => {
    await mount(() => new Promise<IngestResult[]>(() => {}));
    stack();
    await press(userEvent.setup(), 'tk_z');
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d', 'tk_z']);
    expect(flies('tk_z')).toBe(true); // CONTROL
    expect(flies('tk_b')).toBe(false);
    expect(flies('tk_d')).toBe(false);
  });

  it('20.172 a later overlay change (the commit) does not fly tk_d again (CONTROL: it flew once)', async () => {
    // Mutation: the target flight is never consumed.
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise);
    stack();
    await press(userEvent.setup(), 'tk_c');
    expect(flies('tk_d')).toBe(true); // CONTROL
    fireEvent.animationEnd(slotOf('tk_d'));
    await act(async () => write.resolve(committed([{ id: 'x' }])));
    expect(slotOf('tk_c')).toHaveAttribute('data-move-phase', 'committed');
    expect(flies('tk_d')).toBe(false);
  });

  it('20.172 a target flight older than FLIGHT_MAX_AGE_MS is ignored (CONTROL: a fresh one, same board, glides)', async () => {
    // Mutation: the sibling claim has no age check (target side).
    await mount(() => new Promise<IngestResult[]>(() => {}));
    stack();
    const user = userEvent.setup();
    await press(user, 'tk_c');
    expect(flies('tk_d')).toBe(true); // CONTROL
    fireEvent.animationEnd(slotOf('tk_d'));
    let clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += FLIGHT_MAX_AGE_MS + 1));
    await press(user, 'tk_a');
    expect(idsIn('doing')).toEqual(['tk_a', 'tk_b', 'tk_c', 'tk_d']);
    expect(flies('tk_d')).toBe(false);
  });
});

describe('20.173 an arrow move reached through the picker (several targets one way) opens the target slot the same way', () => {
  it('20.173 › offers Doing or Done; confirming Doing glides tk_d down (CONTROL: tk_b above stays)', async () => {
    // Mutation: the picker's confirm lays its entry without the arrow flag (the target siblings snap).
    const user = userEvent.setup();
    const several: WorkflowDef = { ...WF_ERRAND, transitions: [...WF_ERRAND.transitions, { from: 'todo', to: 'done', rules: [] }] };
    await mount(() => new Promise<IngestResult[]>(() => {}), several);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      const column = this.closest('[data-testid^="board-column-"]')?.getAttribute('data-testid')?.slice('board-column-'.length) ?? '';
      const left = 300 * Math.max(0, ['todo', 'doing', 'done'].indexOf(column));
      const top = this.tagName === 'LI' && id.startsWith('ticket-card-') ? 100 + 130 * Array.from(this.parentElement!.children).indexOf(this) : 0;
      return { left, top, right: left + 280, bottom: top + 120, width: 280, height: 120, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
    await user.click(within(slotOf('tk_c')).getByRole('button', { name: 'Move to next state: Doing or Done' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    expect(slotOf('tk_z').classList.contains('gn-board__card-slot--flight')).toBe(true); // CONTROL — the source column closed up, so the harness glides
    expect(slotOf('tk_d').classList.contains('gn-board__card-slot--flight')).toBe(true);
    expect(slotOf('tk_d').style.getPropertyValue('--gn-flip-y')).toBe('-130px');
    expect(slotOf('tk_b').classList.contains('gn-board__card-slot--flight')).toBe(false);
  });
});

describe('20.175 an ARROW move that opens the transition dialog: the target slot opens at once and closes smoothly on Cancel', () => {
  function plant() {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      const column = this.closest('[data-testid^="board-column-"]')?.getAttribute('data-testid')?.slice('board-column-'.length) ?? '';
      const left = 300 * Math.max(0, ['todo', 'doing', 'done'].indexOf(column));
      const top = this.tagName === 'LI' && id.startsWith('ticket-card-') ? 100 + 130 * Array.from(this.parentElement!.children).indexOf(this) : 0;
      return { left, top, right: left + 280, bottom: top + 120, width: 280, height: 120, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
  }
  const flies = (id: string) => slotOf(id).classList.contains('gn-board__card-slot--flight');

  it('20.175 › into a gated target: tk_d opens the slot at once (only a card with its OWN dialog stays still) and Cancel glides it back up (CONTROL: a DRAG into the same dialog records no target flight at begin)', async () => {
    // Mutation: the dialog-awaiting arrow path does not pass the arrow flag to `beginPending` (`attemptMove`, the `'awaiting'` call).
    const never = () => new Promise<IngestResult[]>(() => {});
    const user = userEvent.setup();
    await mount(never, GATED);
    plant();
    // The drag: the drop placeholder opened the slot, so no target sibling is noted at begin (the same layout would show one); Cancel closes it smoothly (20.176).
    drag('tk_c', 'doing');
    let dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(flies('tk_z')).toBe(true); // CONTROL — the source column closed up, so the harness glides
    expect(flies('tk_d')).toBe(false);
    for (const id of ['tk_z', 'tk_c']) fireEvent.animationEnd(slotOf(id));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(idsIn('todo')).toEqual(['tk_a', 'tk_c', 'tk_z']);
    expect(flies('tk_d')).toBe(true);
    cleanup();
    vi.restoreAllMocks();
    Element.prototype.scrollIntoView = scrollIntoView;

    await mount(never, GATED);
    plant();
    await user.click(within(slotOf('tk_c')).getByRole('button', { name: 'Move to Doing' }));
    dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']); // the card waits, faded, in the landing slot
    // tk_d has no dialog of its own: it glides down from (300, 230) to (300, 360), as in 20.162's open-dialog case (the dialog's card is the mover).
    expect(flies('tk_d')).toBe(true);
    expect(slotOf('tk_d').style.getPropertyValue('--gn-flip-y')).toBe('-130px');
    expect(flies('tk_b')).toBe(false);
    for (const id of ['tk_d', 'tk_c', 'tk_z']) fireEvent.animationEnd(slotOf(id));
    expect(flies('tk_d')).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d']);
    // The slot closes smoothly: tk_d was drawn at 360 and is back at 230, so it starts 130px BELOW its slot.
    expect(flies('tk_d')).toBe(true);
    expect(slotOf('tk_d').style.getPropertyValue('--gn-flip-y')).toBe('130px');
    expect(flies('tk_b')).toBe(false);
  });
});

describe('20.176 a REFUSED or CANCELLED drag closes the target slot smoothly: the cards the placeholder held open glide back up', () => {
  /** tk_d, below tk_c's landing slot, also reflows 25px right while tk_c is drawn in Doing; tk_b above drifts 10px (a card nothing may glide). */
  function plant() {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      let left = 0;
      let top = 0;
      if (this.tagName === 'LI' && id.startsWith('ticket-card-')) {
        const column = this.closest('[data-testid^="board-column-"]')?.getAttribute('data-testid')?.slice('board-column-'.length) ?? '';
        left = 300 * Math.max(0, ['todo', 'doing', 'done'].indexOf(column));
        top = 100 + 130 * Array.from(this.parentElement!.children).indexOf(this);
        const cInDoing = document.querySelector('[data-testid="board-column-doing"] [data-testid="ticket-card-tk_c"]') !== null;
        if (cInDoing && id === 'ticket-card-tk_d') left += 25;
        if (cInDoing && id === 'ticket-card-tk_b') top -= 10;
      }
      return { left, top, right: left + 280, bottom: top + 120, width: 280, height: 120, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
  }
  const flies = (id: string) => slotOf(id).classList.contains('gn-board__card-slot--flight');
  const flip = (id: string) => [slotOf(id).style.getPropertyValue('--gn-flip-x'), slotOf(id).style.getPropertyValue('--gn-flip-y')];

  it('20.176 a refused drag: tk_d glides back up from (25px, 130px) on the shared class (CONTROL: nothing flew at the drop; tk_b above never glides; tk_c comes home itself)', async () => {
    // Mutations: the section is not remembered for a drag (the defect); a drag also records target siblings at BEGIN; `dropPending` records
    // nothing for a drag; the refusal records the cards ABOVE too; dx/dy sign flipped; own timing.
    const write = deferred<IngestResult[]>();
    await mount(() => write.promise);
    plant();
    drag('tk_c', 'doing');
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    expect(flies('tk_c')).toBe(true); // CONTROL — the harness flies things
    expect(flies('tk_d')).toBe(false); // the placeholder had opened the slot: nothing is noted at the drop
    expect(flies('tk_b')).toBe(false);
    for (const id of ['tk_c', 'tk_z']) fireEvent.animationEnd(slotOf(id));

    await act(async () => write.resolve(refused([{ id: 'x' }])));
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d']);
    expect(flies('tk_d')).toBe(true);
    expect(flip('tk_d')).toEqual(['25px', '130px']);
    expect(slotOf('tk_d').className).toBe(slotOf('tk_c').className);
    expect(slotOf('tk_d').style.animation).toBe('');
    expect(flies('tk_b')).toBe(false);
    expect(flies('tk_c')).toBe(true);
  });

  it('20.176 a drag whose dialog is CANCELLED: the same glide-up (CONTROL: tk_d stood still while the dialog was open)', async () => {
    // Mutation: as above — the cancel path is `dropPending` too.
    const user = userEvent.setup();
    await mount(() => new Promise<IngestResult[]>(() => {}), GATED);
    plant();
    drag('tk_c', 'doing');
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(flies('tk_z')).toBe(true); // CONTROL — the source column closed up
    expect(flies('tk_d')).toBe(false);
    for (const id of ['tk_z', 'tk_c']) fireEvent.animationEnd(slotOf(id));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d']);
    expect(flip('tk_d')).toEqual(['25px', '130px']);
    expect(flies('tk_b')).toBe(false);
  });
});

describe('20.177 a drag that COMMITS releases its target section: nothing is left to glide', () => {
  it('20.177 committed, then released: no sibling flight is recorded (CONTROL: the same sequence released without the commit records tk_d)', () => {
    // Mutation: a committed drag keeps its section (no `targetSections` delete in `setPhase`), so a later release glides.
    const view: BoardView = { projectId: 'prj_1', groups: [] };
    const { result } = renderHook(() => useMoveState(view));
    const rail = document.createElement('div');
    const section = (id: string, tickets: string[]) => {
      const el = document.createElement('section');
      el.setAttribute('data-testid', `board-column-${id}`);
      const ul = document.createElement('ul');
      for (const t of tickets) {
        const li = document.createElement('li');
        ul.appendChild(li);
        result.current.slots.current.set(t, li);
      }
      el.appendChild(ul);
      rail.appendChild(el);
    };
    section('todo', ['tk_c']);
    section('doing', ['tk_b', 'tk_d']);
    document.body.appendChild(rail);
    try {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 50, right: 1, bottom: 51, width: 1, height: 1, x: 0, y: 50, toJSON: () => ({}) }) as DOMRect);
      const move: PendingMove = { ticketId: 'tk_c', workflowId: 'wf-errand', fromStateId: 'todo', toStateId: 'doing', phase: 'writing' };
      const siblings = () => [...result.current.flights.current.entries()].filter(([, f]) => f.sibling === true).map(([id]) => id);

      act(() => result.current.beginPending(move, { left: 0, top: 0, at: Date.now() })); // a DRAG: from given, no arrow flag
      expect(siblings()).toEqual([]); // nothing at begin
      act(() => result.current.dropPending('tk_c')); // released while still writing (a refusal): tk_d glides
      expect(siblings()).toEqual(['tk_d']); // CONTROL
      result.current.flights.current.clear();

      act(() => result.current.beginPending(move, { left: 0, top: 0, at: Date.now() }));
      act(() => result.current.setPhase('tk_c', 'committed'));
      result.current.flights.current.clear();
      act(() => result.current.dropPending('tk_c'));
      expect(siblings()).toEqual([]);
    } finally {
      rail.remove();
    }
  });
});

describe('20.178 the drag refusal glide honours reduced motion, the end of the column, one claim and the clock', () => {
  const stack = () =>
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-testid') ?? '';
      const column = this.closest('[data-testid^="board-column-"]')?.getAttribute('data-testid')?.slice('board-column-'.length) ?? '';
      const left = 300 * Math.max(0, ['todo', 'doing', 'done'].indexOf(column));
      const top = this.tagName === 'LI' && id.startsWith('ticket-card-') ? 100 + 130 * Array.from(this.parentElement!.children).indexOf(this) : 0;
      return { left, top, right: left + 280, bottom: top + 120, width: 280, height: 120, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
  const flies = (id: string) => slotOf(id).classList.contains('gn-board__card-slot--flight');
  /** Every write waits; `answer(n)` refuses the n-th. */
  function writes() {
    const list: ReturnType<typeof deferred<IngestResult[]>>[] = [];
    return { ingest: () => { const d = deferred<IngestResult[]>(); list.push(d); return d.promise; }, refuse: async (n: number) => { await waitFor(() => expect(list.length).toBeGreaterThan(n)); await act(async () => list[n]!.resolve(refused([{ id: 'x' }]))); } };
  }

  it('20.178 reduced motion: no flight on tk_d when a drag is refused (CONTROL: the same refusal without it glided)', async () => {
    // Mutation: reduced motion not honoured on this path.
    let reduce = false;
    window.matchMedia = ((query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      const w = writes();
      await mount(w.ingest);
      stack();
      drag('tk_c', 'doing');
      await w.refuse(0);
      expect(flies('tk_d')).toBe(true); // CONTROL
      for (const id of ['tk_d', 'tk_c', 'tk_z']) fireEvent.animationEnd(slotOf(id));
      reduce = true;
      drag('tk_a', 'doing'); // lands first: b, d (and c is back in To do) — tk_b and tk_d are below the slot
      await w.refuse(1);
      expect(flies('tk_d')).toBe(false);
      expect(flies('tk_b')).toBe(false);
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('20.178 the card lands LAST and the drag is refused: no sibling flies, nothing throws (CONTROL: the mover comes home)', async () => {
    const w = writes();
    await mount(w.ingest);
    stack();
    drag('tk_z', 'doing');
    expect(idsIn('doing')).toEqual(['tk_b', 'tk_d', 'tk_z']);
    for (const id of ['tk_z']) fireEvent.animationEnd(slotOf(id));
    await w.refuse(0); // (a throw here fails the test)
    expect(flies('tk_z')).toBe(true); // CONTROL
    expect(flies('tk_b')).toBe(false);
    expect(flies('tk_d')).toBe(false);
  });

  it('20.178 the glide-back flight is consumed once: a later overlay change does not fly tk_d again (CONTROL: it flew once)', async () => {
    // Mutation: the target flight is never consumed.
    const w = writes();
    await mount(w.ingest);
    stack();
    drag('tk_c', 'doing');
    await w.refuse(0);
    expect(flies('tk_d')).toBe(true); // CONTROL
    for (const id of ['tk_d', 'tk_c', 'tk_z']) fireEvent.animationEnd(slotOf(id));
    drag('tk_a', 'doing'); // the overlay changes again
    expect(flies('tk_d')).toBe(false);
  });

  it('20.178 a flight older than FLIGHT_MAX_AGE_MS is ignored (CONTROL: a fresh one, same board, glided)', async () => {
    // Mutation: the sibling claim has no age check (drag refusal).
    const w = writes();
    await mount(w.ingest);
    stack();
    drag('tk_c', 'doing');
    await w.refuse(0);
    expect(flies('tk_d')).toBe(true); // CONTROL
    for (const id of ['tk_d', 'tk_c', 'tk_z']) fireEvent.animationEnd(slotOf(id));
    drag('tk_a', 'doing');
    let clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += FLIGHT_MAX_AGE_MS + 1));
    await w.refuse(1);
    expect(flies('tk_d')).toBe(false);
  });
});
