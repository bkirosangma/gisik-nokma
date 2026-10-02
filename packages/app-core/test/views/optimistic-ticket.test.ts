import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyOverlay, overlayAgrees, useOptimisticTicket, OVERLAY_TTL_MS } from '../../src/views/optimistic-ticket.js';
import type { LiveQueryResult } from '../../src/views/use-live-query.js';
import type { TicketRead } from '../../src/view-types.js';
import { ticketStateSeed } from '../helpers/seed.js';

/**
 * Optimistic ticket writes (smoothness T7, spec S5; audit SM-03) — cases 25.091 (the overlay) and 25.095
 * (when a write's overlay retires). The sheet's own behaviour is in `ticket-sheet-optimistic.test.tsx`.
 */

const claim = (value: unknown) => ({ value, actorId: 'user_old', clientTime: '2026-08-18T08:00:00.000Z', serverTime: '2026-08-18T08:00:01.000Z' });

function readOf(overrides: Partial<TicketRead> = {}, fields: Record<string, ReturnType<typeof claim>> = {}): TicketRead {
  const ticket = ticketStateSeed({ stateId: 'todo', stateCategory: 'open', assigneeId: 'user_anselma' });
  ticket.fields = { ...ticket.fields, ...fields };
  return { ticket, title: 'Old', ...overrides } as unknown as TicketRead;
}

describe('applyOverlay (spec S5; audit SM-03)', () => {
  it('25.091 an overlay replaces exactly its fields on the REAL shapes and nothing else; an empty overlay returns the same object', () => {
    const read = readOf({}, { priority: claim('P2'), dueDate: claim({ date: '2026-10-05' }) });
    const next = applyOverlay(read, { stateId: 'doing', stateCategory: 'active', title: 'New', priority: 'P0', dueDate: '2026-11-01', assigneeId: null });
    // title is TOP-LEVEL on the read; the state and assignee live on `ticket`; priority and the dates are CLAIMS in `ticket.fields`.
    expect(next.title).toBe('New');
    expect(next.ticket.stateId).toBe('doing');
    expect(next.ticket.stateCategory).toBe('active');
    expect(next.ticket.assigneeId).toBeNull();
    expect(next.ticket.fields['priority']?.value).toBe('P0');
    expect(next.ticket.fields['dueDate']?.value).toEqual({ date: '2026-11-01' });
    // Nothing else moved: the old claim's provenance is carried (no actor or time is invented), the untouched fields are the same objects.
    expect(next.ticket.fields['priority']?.actorId).toBe('user_old');
    expect(next.ticket.fields['title']).toBe(read.ticket.fields['title']);
    expect(next.ticket.projectId).toBe(read.ticket.projectId);
    // The input is never mutated.
    expect(read.title).toBe('Old');
    expect(read.ticket.stateId).toBe('todo');
    expect(read.ticket.fields['priority']?.value).toBe('P2');
    // Control: the same call with an empty overlay is the identity, and a clearing overlay (null date) empties the claim's value.
    expect(applyOverlay(read, {})).toBe(read);
    expect(applyOverlay(read, { dueDate: null }).ticket.fields['dueDate']?.value).toBeNull();
    // A field the read never had gets a claim with NO provenance rather than an invented one.
    const none = applyOverlay(readOf(), { startDate: '2026-10-09' }).ticket.fields['startDate'];
    expect(none?.value).toEqual({ date: '2026-10-09' });
    expect(none?.actorId).toBe('');
  });

  it('25.095 an overlay AGREES with a read per field — a date compares by its day, never by object identity', () => {
    const read = readOf({}, { dueDate: claim({ date: '2026-11-01' }), priority: claim('P0') });
    expect(overlayAgrees(read, 'dueDate', '2026-11-01')).toBe(true); // `{date}` objects are never `===`
    expect(overlayAgrees(read, 'dueDate', '2026-11-02')).toBe(false);
    expect(overlayAgrees(read, 'startDate', null)).toBe(true); // an absent claim agrees with a clear
    expect(overlayAgrees(readOf({}, { dueDate: claim(null) }), 'dueDate', null)).toBe(true);
    expect(overlayAgrees(read, 'priority', 'P0')).toBe(true);
    expect(overlayAgrees(read, 'priority', 'P1')).toBe(false);
    expect(overlayAgrees(read, 'title', 'Old')).toBe(true);
    expect(overlayAgrees(read, 'title', 'New')).toBe(false);
    expect(overlayAgrees(read, 'stateId', 'todo')).toBe(true);
    expect(overlayAgrees(read, 'assigneeId', 'user_anselma')).toBe(true);
    expect(overlayAgrees(read, 'assigneeId', null)).toBe(false);
  });
});

function result(data: TicketRead | null): LiveQueryResult<TicketRead | null> {
  return { data, error: null, settled: true, hasAnswered: true, reload: () => {} };
}

describe('useOptimisticTicket (spec S5)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('25.095 settle keeps the overlay until a read AGREES, then retires it; a read that merely arrives retires nothing', () => {
    let current = result(readOf());
    const { result: hook, rerender } = renderHook(() => useOptimisticTicket(current));
    act(() => hook.current.begin({ dueDate: '2026-11-01' }));
    expect(hook.current.pendingFields.has('dueDate')).toBe(true);
    expect(hook.current.overlaidFields.has('dueDate')).toBe(true);
    act(() => hook.current.settle('dueDate'));
    expect(hook.current.pendingFields.has('dueDate')).toBe(false); // the write is answered…
    expect(hook.current.overlaidFields.has('dueDate')).toBe(true); // …but the value is still the overlay's
    // A STALE read (still the old claim) lands: the overlay stays, so the committed value never flickers back.
    current = result(readOf({}, { dueDate: claim({ date: '2026-10-05' }) }));
    rerender();
    expect(hook.current.ticket?.ticket.fields['dueDate']?.value).toEqual({ date: '2026-11-01' });
    expect(hook.current.overlaidFields.has('dueDate')).toBe(true);
    // The AGREEING read lands: the overlay retires and the read is what is drawn (a `{date}` OBJECT, compared by its day).
    current = result(readOf({}, { dueDate: claim({ date: '2026-11-01' }) }));
    rerender();
    expect(hook.current.overlaidFields.has('dueDate')).toBe(false);
    expect(hook.current.ticket?.ticket.fields['dueDate']?.actorId).toBe('user_old');
  });

  it('25.095 a settled overlay no read ever confirms expires after the TTL, so it can never mask a later server change', () => {
    const current = result(readOf());
    const { result: hook } = renderHook(() => useOptimisticTicket(current));
    act(() => hook.current.begin({ title: 'New' }));
    act(() => hook.current.settle('title'));
    expect(hook.current.ticket?.title).toBe('New');
    act(() => {
      vi.advanceTimersByTime(OVERLAY_TTL_MS - 1);
    });
    expect(hook.current.ticket?.title).toBe('New');
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(hook.current.ticket?.title).toBe('Old');
    expect(hook.current.overlaidFields.size).toBe(0);
  });

  it('25.096 drop removes ONE field at once and leaves every other field\'s overlay (and its pending flag) alone', () => {
    const { result: hook } = renderHook(() => useOptimisticTicket(result(readOf())));
    act(() => hook.current.begin({ title: 'New' }));
    act(() => hook.current.begin({ priority: 'P0' }));
    act(() => hook.current.drop('priority'));
    expect(hook.current.ticket?.ticket.fields['priority']?.value).not.toBe('P0');
    expect(hook.current.ticket?.title).toBe('New');
    expect([...hook.current.pendingFields]).toEqual(['title']);
    // Control: dropping the other one too returns the read itself.
    act(() => hook.current.drop('title'));
    expect(hook.current.ticket?.title).toBe('Old');
    expect(hook.current.overlaidFields.size).toBe(0);
  });

  it('25.095 an agreeing read that arrived BEFORE settle retires the overlay at settle (a stream refetch can beat the answer)', () => {
    const current = result(readOf({ title: 'New' }));
    const { result: hook } = renderHook(() => useOptimisticTicket(current));
    act(() => hook.current.begin({ title: 'New' }));
    act(() => hook.current.settle('title'));
    expect(hook.current.overlaidFields.has('title')).toBe(false);
  });
});
