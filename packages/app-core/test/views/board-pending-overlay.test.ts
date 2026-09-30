import { describe, expect, it } from 'vitest';
import {
  PENDING_TTL_MS,
  applyPendingMoves,
  retireAgreed,
  type PendingMove,
  type PendingMoves,
} from '../../src/views/board-move-state.js';
import type { BoardCard, BoardColumn, BoardView } from '../../src/view-types.js';
import { boardCardSeed } from '../helpers/seed.js';

/**
 * Optimistic board moves (owner, 2026-10-01) — the PURE half: `applyPendingMoves` lays a pending
 * move over the board view, and `retireAgreed` decides when a pending entry has done its job.
 * Cases 20.132 (placement) and 20.126 (a stale read never retires an entry).
 */

const card = (ticketId: string): BoardCard => boardCardSeed({ ticketId, title: `Ticket ${ticketId}` });
const column = (stateId: string, cards: BoardCard[]): BoardColumn => ({
  stateId,
  name: stateId,
  category: 'open',
  blocked: false,
  creatable: true,
  cards,
});
const view = (): BoardView => ({
  projectId: 'prj_1',
  groups: [
    {
      workflowId: 'wf-errand',
      workflowVersion: 1,
      workflowName: 'Errand',
      columns: [
        column('todo', [card('tk_a'), card('tk_c'), card('tk_z')]),
        column('doing', [card('tk_b'), card('tk_d')]),
        column('done', []),
      ],
    },
  ],
});
const move = (overrides: Partial<PendingMove> = {}): PendingMove => ({
  ticketId: 'tk_c',
  workflowId: 'wf-errand',
  fromStateId: 'todo',
  toStateId: 'doing',
  phase: 'writing',
  ...overrides,
});
const pending = (...moves: PendingMove[]): PendingMoves => Object.fromEntries(moves.map((m) => [m.ticketId, m]));
const idsIn = (v: BoardView, stateId: string) =>
  v.groups[0]!.columns.find((c) => c.stateId === stateId)!.cards.map((c) => c.ticketId);

describe('20.132 applyPendingMoves places the card at the landing index the placeholder showed', () => {
  it('20.132 tk_c leaves todo and lands between tk_b and tk_d (columns are ordered by ticket id)', () => {
    const moved = applyPendingMoves(view(), pending(move()));
    expect(idsIn(moved, 'todo')).toEqual(['tk_a', 'tk_z']);
    expect(idsIn(moved, 'doing')).toEqual(['tk_b', 'tk_c', 'tk_d']);
    // CONTROL — with no pending entry the very same view is returned untouched (same reference).
    const plain = view();
    expect(applyPendingMoves(plain, {})).toBe(plain);
    expect(idsIn(plain, 'todo')).toEqual(['tk_a', 'tk_c', 'tk_z']);
  });

  it('20.132 a card is never lost or duplicated: two moves into one column, a move into an empty one, a move to the end', () => {
    const moved = applyPendingMoves(
      view(),
      pending(move({ ticketId: 'tk_a' }), move({ ticketId: 'tk_z' }), move({ ticketId: 'tk_b', fromStateId: 'doing', toStateId: 'done' })),
    );
    expect(idsIn(moved, 'todo')).toEqual(['tk_c']);
    expect(idsIn(moved, 'doing')).toEqual(['tk_a', 'tk_d', 'tk_z']);
    expect(idsIn(moved, 'done')).toEqual(['tk_b']);
    const all = moved.groups[0]!.columns.flatMap((c) => c.cards.map((x) => x.ticketId)).sort();
    expect(all).toEqual(['tk_a', 'tk_b', 'tk_c', 'tk_d', 'tk_z']);
  });

  it('20.132 an entry that names a ticket or a column the view does not hold changes nothing', () => {
    const plain = view();
    expect(applyPendingMoves(plain, pending(move({ ticketId: 'tk_nope' })))).toBe(plain);
    expect(applyPendingMoves(plain, pending(move({ toStateId: 'nowhere' })))).toBe(plain);
    // An entry whose card already sits in its target is already true: nothing to lay over.
    expect(applyPendingMoves(plain, pending(move({ ticketId: 'tk_b', fromStateId: 'todo', toStateId: 'doing' })))).toBe(plain);
  });
});

describe('20.126 an entry is retired when the read AGREES, never because a read arrived', () => {
  const NOW = 1_000_000;

  it('20.126 a stale read (card still in its source) keeps the entry; a read that agrees retires it', () => {
    const entries = pending(move({ phase: 'committed', settledAt: NOW }));
    // STALE — the refetch landed but still shows tk_c in todo.
    expect(retireAgreed(view(), entries, NOW + 1)).toBe(entries);
    // CONTROL — the read that shows tk_c in doing retires it.
    const agreeing = applyPendingMoves(view(), entries);
    expect(retireAgreed(agreeing, entries, NOW + 1)).toEqual({});
  });

  it('20.126 a write still in flight is held by a stale read too, and retired by an agreeing one', () => {
    const entries = pending(move({ phase: 'writing' }));
    expect(retireAgreed(view(), entries, NOW)).toBe(entries);
    expect(retireAgreed(applyPendingMoves(view(), entries), entries, NOW)).toEqual({});
  });

  it('20.126 a committed entry the read never confirms is retired after the TTL, not before', () => {
    const entries = pending(move({ phase: 'committed', settledAt: NOW }));
    expect(retireAgreed(view(), entries, NOW + PENDING_TTL_MS - 1)).toBe(entries);
    expect(retireAgreed(view(), entries, NOW + PENDING_TTL_MS)).toEqual({});
    // A write in flight or a dialog waiting has no clock: only a committed entry expires.
    expect(retireAgreed(view(), pending(move({ phase: 'awaiting' })), NOW + PENDING_TTL_MS * 10)).toEqual(
      pending(move({ phase: 'awaiting' })),
    );
  });
});
