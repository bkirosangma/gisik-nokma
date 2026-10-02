import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult } from '@gisik-nokma/domain';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import { applyPendingCreates, applyPendingMoves, CREATE_TTL_MS, retireAgreed, usePendingCreates, type PendingCreate } from '../../src/views/board-move-state.js';
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

  it('25.094 S-R1: the ghost names no fill of its own, and none is the well', () => {
    const css = readUiCss();
    const rules = [...css.matchAll(/\.gn-board__card-slot--creating[^{]*\{([^}]*)\}/g)].map((m) => m[1]!);
    expect(rules.length).toBeGreaterThan(0);
    for (const body of rules) {
      expect(body).not.toMatch(/background|neo-well|well|surface-track|gn-surface/i);
      expect(body).toMatch(/opacity/);
    }
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

  it('25.097 Close takes the card off the board at once and keeps it off while the write is open; a commit reloads; the refusal puts it back with the reason', async () => {
    const open = deferred<IngestResult[]>();
    const { onMoved, rerender } = await mount(() => open.promise);
    const closeButton = screen.getByRole('button', { name: 'Close Ticket tk_x' });
    expect(screen.getByTestId('ticket-card-tk_x')).toBeInTheDocument();
    await userEvent.click(closeButton);
    // Gone this frame; the neighbour stays; the write is still open.
    expect(screen.queryByTestId('ticket-card-tk_x')).toBeNull();
    expect(screen.getByTestId('ticket-card-tk_y')).toBeInTheDocument();
    expect(onMoved).not.toHaveBeenCalled();
    // The refusal: the card is back where the data says it is, with the server's words.
    open.resolve([{ status: 'refused', eventId: 'e', rule: 'close-requires-terminal', reason: 'Close the subtasks first.' } as IngestResult]);
    await waitFor(() => expect(screen.getByTestId('ticket-card-tk_x')).toBeInTheDocument());
    expect(screen.getByText(/Close the subtasks first\./)).toBeInTheDocument();
    expect(onMoved).not.toHaveBeenCalled();
    rerender(<Board board={TERMINAL} onOpenTicket={() => {}} />);
  });

  it('25.097 a committed Close keeps the card off, reloads the board, and the entry retires when a read no longer holds the card', async () => {
    const { onMoved, rerender } = await mount(() => [{ status: 'committed', eventId: 'e', seq: 4, serverTime: '2026-10-02T09:00:00.000Z' } as IngestResult]);
    await userEvent.click(screen.getByRole('button', { name: 'Close Ticket tk_x' }));
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('ticket-card-tk_x')).toBeNull();
    // A STALE read (still holding the card) does not bring it back.
    rerender(<Board board={{ ...TERMINAL }} onOpenTicket={() => {}} />);
    expect(screen.queryByTestId('ticket-card-tk_x')).toBeNull();
  });
});

describe('the closes arms of the move state (spec S5)', () => {
  const entry = { ticketId: 'tk_x', workflowId: 'wf-errand', fromStateId: 'done', toStateId: 'done', phase: 'writing' as const, closes: true as const };

  it('25.102 a closing entry HIDES the card; it retires when the read no longer holds it, and a read that still holds it retires nothing', () => {
    const held = view({ done: [card('tk_x'), card('tk_y')] });
    const hidden = applyPendingMoves(held, { tk_x: entry });
    expect(hidden.groups[0]!.columns[2]!.cards.map((c) => c.ticketId)).toEqual(['tk_y']);
    expect(held.groups[0]!.columns[2]!.cards).toHaveLength(2);
    // Control: the same entry WITHOUT `closes` is a no-op (a card already in its target), which is the plan's shape this replaces.
    const { closes: _closes, ...asMove } = entry;
    expect(applyPendingMoves(held, { tk_x: asMove })).toBe(held);
    const pending = { tk_x: entry };
    expect(retireAgreed(held, pending, 0)).toBe(pending);
    expect(retireAgreed(view({ done: [card('tk_y')] }), pending, 0)).toEqual({});
    // A committed close the read never confirms still expires.
    const committed = { tk_x: { ...entry, phase: 'committed' as const, settledAt: 0 } };
    expect(retireAgreed(held, committed, 30_000)).toEqual({});
  });
});

function readUiCss(): string {
  return readFileSync(resolve(process.cwd(), '../ui/src/ui.css'), 'utf8');
}
