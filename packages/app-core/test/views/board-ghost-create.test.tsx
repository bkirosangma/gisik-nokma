import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult } from '@gisik-nokma/domain';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import { applyPendingCreates, applyPendingMoves, CREATE_TTL_MS, PENDING_TTL_MS, retireAgreed, usePendingCreates, type PendingCreate } from '../../src/views/board-move-state.js';
import type { BoardCard, BoardGroup, BoardView } from '../../src/view-types.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * The ghost card and the optimistic Close (smoothness T7, spec S5, audit SM-03) — cases 25.094 (the ghost card),
 * 25.097 (Close) and 25.102 (the `closes` arms of the move state).
 */

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CURRENT_USER = 'user_kiro';
const card = (ticketId: string, extra: Partial<BoardCard> = {}): BoardCard => boardCardSeed({ ticketId, title: `Ticket ${ticketId}`, ...extra });

function group(cardsByState: Record<string, BoardCard[]> = {}): BoardGroup {
  const col = (stateId: string, name: string, category: 'open' | 'active' | 'terminal') => ({
    stateId,
    name,
    category,
    blocked: false,
    creatable: true,
    cards: cardsByState[stateId] ?? [],
  });
  return {
    workflowId: 'wf-errand',
    workflowVersion: 1,
    workflowName: 'Errand',
    columns: [col('todo', 'To do', 'open'), col('doing', 'Doing', 'active'), col('done', 'Done', 'terminal')],
  };
}
const view = (cardsByState?: Record<string, BoardCard[]>): BoardView => ({ projectId: 'prj_1', groups: [group(cardsByState)] });

const GHOST: PendingCreate = { ticketId: 'tk_new', workflowId: 'wf-errand', stateId: 'todo', title: 'Buy milk', typeId: 'task', priority: 'P1' };

describe('applyPendingCreates (spec S5; audit SM-03)', () => {
  it('25.094 a pending create is a ghost card with the key "…" at the END of its column; the empty list is the identity', () => {
    const base = view({ todo: [card('tk_a')] });
    const next = applyPendingCreates(base, [GHOST]);
    expect(next.groups[0]!.columns[0]!.cards.map((c) => [c.ticketId, c.key, c.title, c.pendingCreate])).toEqual([
      ['tk_a', null, 'Ticket tk_a', undefined],
      ['tk_new', '…', 'Buy milk', true],
    ]);
    // The ghost says what the person asked for, and invents no provenance.
    expect(next.groups[0]!.columns[0]!.cards[1]!.priority.value).toBe('P1');
    expect(next.groups[0]!.columns[0]!.cards[1]!.stateProvenance.actorId).toBe('');
    // The input is untouched, and the same view comes back when nothing applies.
    expect(base.groups[0]!.columns[0]!.cards).toHaveLength(1);
    expect(applyPendingCreates(base, [])).toBe(base);
    expect(applyPendingCreates(base, [{ ...GHOST, workflowId: 'wf-other' }])).toBe(base);
    expect(applyPendingCreates(base, [{ ...GHOST, stateId: 'nowhere' }])).toBe(base);
    // Retired when the read shows the id: the real card wins and no second one is drawn.
    const landed = view({ todo: [card('tk_a'), card('tk_new', { key: 'CC-7' })] });
    expect(applyPendingCreates(landed, [GHOST])).toBe(landed);
  });
});

describe('the ghost card on the board', () => {
  it('25.094 the ghost is drawn busy and dimmed with key "…" before the server answers; the real card replaces it with the real key; no arrows, no open', async () => {
    const onOpenTicket = vi.fn();
    const base = view({ todo: [card('tk_a')] });
    const { rerender } = render(<Board board={base} pendingCreates={[GHOST]} onOpenTicket={onOpenTicket} today="2026-10-02" currentUserId={CURRENT_USER} />);
    const slot = screen.getByTestId('ticket-card-tk_new');
    expect(slot).toHaveAttribute('aria-busy', 'true');
    expect(slot.className).toContain('gn-board__card-slot--creating');
    // S-R1 (a): the ghost IS the real card's own container, with its parts inside — no invented container.
    const container = slot.firstElementChild!;
    expect(container.className).toContain('gn-board-card');
    expect(container.querySelector('.gn-board-card__title')?.textContent).toBe('Buy milk');
    expect(container.querySelector('.gn-board-card__key')?.textContent).toBe('…');
    expect(container.querySelector('.gn-board-card__priority')?.textContent).toContain('P1');
    expect(container.querySelector('.gn-board-card__provenance')?.textContent).toBe('Creating…');
    // It is not a ticket yet: it cannot be opened, moved or dragged.
    await userEvent.click(container.querySelector('.gn-board-card__title') as HTMLElement);
    await userEvent.click(slot);
    expect(onOpenTicket).not.toHaveBeenCalled();
    expect(slot.getAttribute('draggable')).not.toBe('true');
    // Control: the same click on a REAL card opens it.
    await userEvent.click(screen.getByTestId('ticket-card-tk_a').querySelector('.gn-board-card__title') as HTMLElement);
    expect(onOpenTicket).toHaveBeenCalledWith('tk_a');
    expect(screen.getByTestId('ticket-card-tk_a')).not.toHaveAttribute('aria-busy');
    // The create lands: the read carries the ticket, so the ghost is gone and the real card has its key.
    const landed = view({ todo: [card('tk_a'), card('tk_new', { key: 'CC-7', title: 'Buy milk' })] });
    rerender(<Board board={landed} pendingCreates={[GHOST]} onOpenTicket={onOpenTicket} today="2026-10-02" currentUserId={CURRENT_USER} />);
    expect(screen.getAllByTestId('ticket-card-tk_new')).toHaveLength(1);
    expect(screen.getByTestId('ticket-card-tk_new')).not.toHaveAttribute('aria-busy');
    expect(screen.getByText('CC-7')).toBeInTheDocument();
    // A refusal: the shell drops the entry and the ghost is gone.
    rerender(<Board board={base} pendingCreates={[]} onOpenTicket={onOpenTicket} today="2026-10-02" currentUserId={CURRENT_USER} />);
    expect(screen.queryByTestId('ticket-card-tk_new')).toBeNull();
  });

  it('25.110 a ghost has NO arrows (Move, ‹ ›, Close): they would write against a ticket that does not exist yet; a real card beside it has them', async () => {
    const source = createFakeDataSource({ getWorkflowDef: async () => WF_ERRAND });
    const moves: BoardMoveCapability = { dataSource: source, workspaceId: WS, currentUserId: CURRENT_USER, onMoved: vi.fn() };
    render(<Board board={view({ todo: [card('tk_a')] })} pendingCreates={[GHOST]} onOpenTicket={() => {}} moves={moves} />);
    // Control: the real card carries its move controls once the workflow has loaded.
    await waitFor(() => expect(screen.getByTestId('ticket-card-tk_a').querySelector('.gn-board-card__moves')).not.toBeNull());
    expect(screen.getByTestId('ticket-card-tk_a').getAttribute('draggable')).toBe('true');
    const ghost = screen.getByTestId('ticket-card-tk_new');
    expect(ghost.querySelector('.gn-board-card__moves')).toBeNull();
    expect(ghost.querySelector('.gn-board-card__move')).toBeNull();
    expect(ghost.getAttribute('draggable')).not.toBe('true');
  });

  it('25.094 S-R1: the ghost names no fill of its own, and none is the well', () => {
    const css = readUiCss();
    const rules = [...css.matchAll(/\.gn-board__card-slot--creating[^{]*\{([^}]*)\}/g)].map((m) => m[1]!);
    expect(rules.length).toBeGreaterThan(0);
    for (const body of rules) {
      expect(body).not.toMatch(/background|neo-well|well|surface-track|gn-surface/i);
      expect(body).toMatch(/opacity/);
    }
    // A card being CLOSED is dimmed by the SAME rule (F2): one opacity rule, never a second one.
    expect(css.match(/\.gn-board__card-slot--closing > \.gn-board-card[^{]*\{[^}]*opacity/g)).toHaveLength(1);
    expect(rules.some((body) => /opacity/.test(body))).toBe(true);
    expect(css).toMatch(/\.gn-board__card-slot--creating > \.gn-board-card,\s*\.gn-board__card-slot--closing > \.gn-board-card \{/);
    // Control: the sweep does find a fill where there is one (the move's waiting wash).
    const waiting = [...css.matchAll(/\.gn-board__card-slot--waiting::after[^{]*\{([^}]*)\}/g)].map((m) => m[1]!).join('');
    expect(waiting).toMatch(/background/);
  });
});

describe('usePendingCreates (spec S5)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('25.094 a ghost is held until a read shows its id, a refusal removes it, and a committed ghost no read shows expires', () => {
    let current: BoardView | null = view({ todo: [card('tk_a')] });
    const { result, rerender } = renderHook(() => usePendingCreates(current));
    act(() => result.current.add(GHOST));
    expect(result.current.creates.map((c) => c.ticketId)).toEqual(['tk_new']);
    // A read that does not carry the id retires nothing.
    rerender();
    expect(result.current.creates).toHaveLength(1);
    // The read that carries it retires the ghost (the real card is drawn instead).
    current = view({ todo: [card('tk_a'), card('tk_new', { key: 'CC-7' })] });
    rerender();
    expect(result.current.creates).toHaveLength(0);
    // A refusal removes it at once; removing an id that is not held changes nothing.
    current = view({ todo: [card('tk_a')] });
    rerender();
    act(() => result.current.add(GHOST));
    act(() => result.current.remove('tk_new'));
    expect(result.current.creates).toHaveLength(0);
    act(() => result.current.remove('tk_new'));
    // Control: an OPEN write never expires; a committed one the read never shows does.
    act(() => result.current.add(GHOST));
    act(() => {
      vi.advanceTimersByTime(CREATE_TTL_MS * 2);
    });
    expect(result.current.creates).toHaveLength(1);
    act(() => result.current.settle('tk_new'));
    act(() => {
      vi.advanceTimersByTime(CREATE_TTL_MS - 1);
    });
    expect(result.current.creates).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(result.current.creates).toHaveLength(0);
  });
});

describe('the optimistic Close (spec S5)', () => {
  const TERMINAL = view({ done: [card('tk_x'), card('tk_y')] });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  async function mount(ingest: () => Promise<IngestResult[]> | IngestResult[]) {
    const onMoved = vi.fn();
    const source = createFakeDataSource({ getWorkflowDef: async () => WF_ERRAND }, ingest as never);
    const moves: BoardMoveCapability = { dataSource: source, workspaceId: WS, currentUserId: CURRENT_USER, onMoved };
    const utils = render(<Board board={TERMINAL} onOpenTicket={() => {}} moves={moves} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close Ticket tk_x' })).toBeInTheDocument());
    return { source, onMoved, ...utils };
  }

  /** The card's own slot: busy, dimmed (by its class) and not draggable while its Close is open. */
  const slotOf = (ticketId: string) => screen.getByTestId(`ticket-card-${ticketId}`);
  /** The card's Move button, found inside its own slot (the neighbour has one too). */
  const moveOf = (ticketId: string) => within(slotOf(ticketId)).getByRole('button', { name: 'Move to another state' });

  it('25.097 Close DIMS the card in place while the write is open — busy, not draggable, no second Close; the neighbour is untouched; the refusal undims it and shows the reason', async () => {
    const open = deferred<IngestResult[]>();
    const ingest = vi.fn(() => open.promise);
    const { onMoved } = await mount(ingest);
    // Control: before the click the card is a plain, draggable card with a live Close, and so is its neighbour.
    expect(slotOf('tk_x')).not.toHaveAttribute('aria-busy');
    expect(slotOf('tk_x').className).not.toContain('gn-board__card-slot--closing');
    expect(slotOf('tk_x').getAttribute('draggable')).toBe('true');
    expect(screen.getByRole('button', { name: 'Close Ticket tk_x' })).toBeEnabled();
    expect(moveOf('tk_x')).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Close Ticket tk_x' }));
    // Open: the card is STILL on the board, in its place, dimmed and busy; it cannot be dragged and cannot be closed twice.
    expect(slotOf('tk_x')).toHaveAttribute('aria-busy', 'true');
    expect(slotOf('tk_x').className).toContain('gn-board__card-slot--closing');
    expect(slotOf('tk_x').getAttribute('draggable')).not.toBe('true');
    expect(screen.getByRole('button', { name: 'Close Ticket tk_x' })).toBeDisabled();
    expect(moveOf('tk_x')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Close Ticket tk_x' }));
    expect(ingest).toHaveBeenCalledTimes(1);
    // The neighbour is untouched throughout.
    expect(slotOf('tk_y')).not.toHaveAttribute('aria-busy');
    expect(slotOf('tk_y').getAttribute('draggable')).toBe('true');
    expect(onMoved).not.toHaveBeenCalled();
    // The refusal: undimmed where it always was, with the server's words.
    open.resolve([{ status: 'refused', eventId: 'e', rule: 'close-requires-terminal', reason: 'Close the subtasks first.' } as IngestResult]);
    expect(await screen.findByText(/Close the subtasks first\./)).toBeInTheDocument();
    await waitFor(() => expect(slotOf('tk_x')).not.toHaveAttribute('aria-busy'));
    expect(slotOf('tk_x').className).not.toContain('gn-board__card-slot--closing');
    expect(slotOf('tk_x').getAttribute('draggable')).toBe('true');
    expect(screen.getByRole('button', { name: 'Close Ticket tk_x' })).toBeEnabled();
    expect(moveOf('tk_x')).toBeEnabled();
    expect(onMoved).not.toHaveBeenCalled();
  });

  it.each([
    ['a connection that drops', () => Promise.reject(new Error('offline')), /We could not reach the server for this close/],
    ['silence (no result)', () => Promise.resolve([] as IngestResult[]), /The server did not answer this close\./],
  ])('25.097 %s undims the Close and says so; the card never left', async (_name, ingest, sentence) => {
    await mount(ingest as never);
    // Control: the card starts plain.
    expect(slotOf('tk_x')).not.toHaveAttribute('aria-busy');
    await userEvent.click(screen.getByRole('button', { name: 'Close Ticket tk_x' }));
    expect(await screen.findByText(sentence)).toBeInTheDocument();
    await waitFor(() => expect(slotOf('tk_x')).not.toHaveAttribute('aria-busy'));
    expect(slotOf('tk_x').className).not.toContain('gn-board__card-slot--closing');
    expect(screen.getByRole('button', { name: 'Close Ticket tk_x' })).toBeEnabled();
  });

  it('25.097 a committed Close takes the card off the board, reloads, keeps it off while a stale read still holds it, and gives it back after the TTL', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { onMoved, rerender } = await mount(() => [{ status: 'committed', eventId: 'e', seq: 4, serverTime: '2026-10-02T09:00:00.000Z' } as IngestResult]);
      // Control: the card is on the board until the answer.
      expect(slotOf('tk_x')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Close Ticket tk_x' }));
      await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByTestId('ticket-card-tk_x')).toBeNull());
      expect(slotOf('tk_y')).toBeInTheDocument();
      // A STALE read (still holding the card) does not bring it back…
      rerender(<Board board={{ ...TERMINAL }} onOpenTicket={() => {}} />);
      expect(screen.queryByTestId('ticket-card-tk_x')).toBeNull();
      // …but a committed close no read ever confirms expires: the data says the card is there.
      act(() => {
        vi.advanceTimersByTime(PENDING_TTL_MS + 1);
      });
      expect(slotOf('tk_x')).toBeInTheDocument();
      expect(slotOf('tk_x')).not.toHaveAttribute('aria-busy');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the closes arms of the move state (spec S5)', () => {
  const entry = { ticketId: 'tk_x', workflowId: 'wf-errand', fromStateId: 'done', toStateId: 'done', phase: 'writing' as const, closes: true as const };

  it('25.102 a closing entry keeps the card while it is open and HIDES it once committed; it retires when the read no longer holds it, and a read that still holds it retires nothing', () => {
    const held = view({ done: [card('tk_x'), card('tk_y')] });
    // Open (`writing`, `awaiting`): nothing is hidden — the slot dims the card — and it is the SAME view.
    expect(applyPendingMoves(held, { tk_x: entry })).toBe(held);
    expect(applyPendingMoves(held, { tk_x: { ...entry, phase: 'awaiting' as const } })).toBe(held);
    const committedEntry = { ...entry, phase: 'committed' as const, settledAt: 0 };
    const hidden = applyPendingMoves(held, { tk_x: committedEntry });
    expect(hidden.groups[0]!.columns[2]!.cards.map((c) => c.ticketId)).toEqual(['tk_y']);
    expect(held.groups[0]!.columns[2]!.cards).toHaveLength(2);
    // Control: the same committed entry WITHOUT `closes` is a no-op (a card already in its target), which is the plan's shape this replaces.
    const { closes: _closes, ...asMove } = committedEntry;
    expect(applyPendingMoves(held, { tk_x: asMove })).toBe(held);
    const pending = { tk_x: entry };
    expect(retireAgreed(held, pending, 0)).toBe(pending);
    expect(retireAgreed(view({ done: [card('tk_y')] }), pending, 0)).toEqual({});
    // A committed close the read never confirms still expires.
    expect(retireAgreed(held, { tk_x: committedEntry }, 30_000)).toEqual({});
  });
});

function readUiCss(): string {
  return readFileSync(resolve(process.cwd(), '../ui/src/ui.css'), 'utf8');
}
