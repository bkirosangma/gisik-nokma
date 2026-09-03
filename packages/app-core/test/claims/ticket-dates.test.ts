import { describe, expect, it } from 'vitest';
import type { FieldClaim, TicketState } from '@gisik-nokma/domain';
import {
  customDateClaimsOf,
  dateClaimOf,
  titleOf,
  type TicketDatesInput,
} from '../../src/claims/ticket-dates.js';

function claim(value: unknown, actorId = 'user_kiro'): FieldClaim {
  return {
    value,
    actorId,
    clientTime: '2026-08-19T10:00:00.000Z',
    serverTime: '2026-08-19T10:00:01.000Z',
  };
}

function input(
  fields: TicketState['fields'],
  pendingFieldIds: string[] = [],
  customDateFields: { id: string; name: string }[] = [],
): TicketDatesInput {
  return {
    state: {
      kind: 'ticket',
      id: 't1',
      workspaceId: 'ws_1',
      projectId: 'p1',
      typeId: 'task',
      parentId: null,
      workflowId: 'wf_basic',
      workflowVersion: 1,
      stateId: 'doing',
      stateCategory: 'active',
      assigneeId: null,
      collaboratorIds: [],
      fields,
      transitions: [],
    },
    pendingFieldIds,
    customDateFields,
  };
}

/**
 * These read the claim directly rather than through the month grid, and that
 * is the point. MEASURED: an earlier version of this suite proved the day
 * shape only through `buildCalendarModel`, where a malformed value like
 * `30/08/2026` sorts OUTSIDE the grid's string bounds and disappears for the
 * wrong reason — so dropping the `IST_DAY_REGEX` check left every test green.
 * A malformed day that lands INSIDE the bounds (an unpadded day, or a full
 * instant) is the case that bites, and it is asserted here at the reader.
 */
describe('11.2 the day-claim readers: absence, and no half-parsed day', () => {
  it('reads a well-formed built-in claim with its provenance and its note', () => {
    const claimView = dateClaimOf(
      input({ dueDate: claim({ date: '2026-08-30', note: 'GST filing' }, 'user_anselma') }),
      'dueDate',
    );
    expect(claimView).toEqual({
      date: '2026-08-30',
      note: 'GST filing',
      actorId: 'user_anselma',
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
      pending: false,
    });
  });

  it('an unclaimed field is null — there is no other source of dates', () => {
    expect(dateClaimOf(input({}), 'dueDate')).toBeNull();
    expect(dateClaimOf(input({ dueDate: claim(null) }), 'dueDate')).toBeNull();
    expect(dateClaimOf(input({ dueDate: claim(undefined) }), 'dueDate')).toBeNull();
  });

  it('11.2 PLANTED DEFECT: a value that is not a DAY is refused, including one that sorts into the month', () => {
    // Each of these would land inside a August-2026 grid's string bounds
    // ('2026-07-27' … '2026-09-06') if it were let through.
    expect(dateClaimOf(input({ dueDate: claim({ date: '2026-08-3' }) }), 'dueDate')).toBeNull();
    expect(
      dateClaimOf(input({ dueDate: claim({ date: '2026-08-30T00:00:00.000Z' }) }), 'dueDate'),
    ).toBeNull();
    expect(dateClaimOf(input({ dueDate: claim({ date: '2026-08-300' }) }), 'dueDate')).toBeNull();
    // …and the shapes that are not a day claim at all.
    expect(dateClaimOf(input({ dueDate: claim('2026-08-30') }), 'dueDate')).toBeNull();
    expect(dateClaimOf(input({ dueDate: claim(['2026-08-30']) }), 'dueDate')).toBeNull();
    expect(dateClaimOf(input({ dueDate: claim({ note: 'GST' }) }), 'dueDate')).toBeNull();
  });

  it('a non-string note is dropped rather than coerced', () => {
    const claimView = dateClaimOf(input({ dueDate: claim({ date: '2026-08-30', note: 42 }) }), 'dueDate');
    expect(claimView).not.toBeNull();
    expect(claimView?.note).toBeUndefined();
  });

  it('pending follows the named field, not the ticket', () => {
    const fields = { dueDate: claim({ date: '2026-08-30' }), startDate: claim({ date: '2026-08-24' }) };
    expect(dateClaimOf(input(fields, ['dueDate']), 'dueDate')?.pending).toBe(true);
    expect(dateClaimOf(input(fields, ['dueDate']), 'startDate')?.pending).toBe(false);
  });
});

describe('11.36–11.38 the custom date reader', () => {
  /**
   * DECLARED order is deliberately NOT alphabetical order: with "Filed on"
   * first, a defect that sorted the claims by name would be indistinguishable
   * from the declared order this reader promises. Measured — that exact
   * mutation survived the earlier fixture.
   */
  const FIELDS = [
    { id: 'inspection', name: 'Inspection date' },
    { id: 'filed-on', name: 'Filed on' },
  ];

  it('yields one entry per CLAIMED field, in the declared field order', () => {
    const claims = customDateClaimsOf(
      input(
        { inspection: claim('2026-08-12'), 'filed-on': claim('2026-08-30', 'user_anselma') },
        [],
        FIELDS,
      ),
    );
    expect(claims.map((entry) => entry.fieldId)).toEqual(['inspection', 'filed-on']);
    expect(claims.map((entry) => entry.fieldName)).not.toEqual(['Filed on', 'Inspection date']);
    expect(claims[1]).toEqual({
      fieldId: 'filed-on',
      fieldName: 'Filed on',
      date: '2026-08-30',
      actorId: 'user_anselma',
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
      pending: false,
    });
  });

  it('11.37 an unclaimed field yields nothing at all, and no roster yields nothing', () => {
    expect(customDateClaimsOf(input({}, [], FIELDS))).toEqual([]);
    expect(customDateClaimsOf(input({ 'filed-on': claim('2026-08-30') }))).toEqual([]);
  });

  it('11.37 PLANTED DEFECT: a value that is not a DAY is skipped, including one that sorts into the month', () => {
    expect(customDateClaimsOf(input({ 'filed-on': claim('2026-08-3') }, [], FIELDS))).toEqual([]);
    expect(
      customDateClaimsOf(input({ 'filed-on': claim('2026-08-30T00:00:00.000Z') }, [], FIELDS)),
    ).toEqual([]);
    expect(customDateClaimsOf(input({ 'filed-on': claim(20260830) }, [], FIELDS))).toEqual([]);
    expect(customDateClaimsOf(input({ 'filed-on': claim(true) }, [], FIELDS))).toEqual([]);
    // The built-in's OBJECT shape is not a custom date claim either — this is
    // what makes one claim unable to reach the grid twice.
    expect(customDateClaimsOf(input({ 'filed-on': claim({ date: '2026-08-30' }) }, [], FIELDS))).toEqual([]);
  });

  it('11.8 pending follows the field id', () => {
    const claims = customDateClaimsOf(
      input({ 'filed-on': claim('2026-08-30') }, ['filed-on'], FIELDS),
    );
    expect(claims[0]?.pending).toBe(true);
  });
});

describe('11.2 titleOf', () => {
  it('reads the claimed title', () => {
    expect(titleOf(input({ title: claim('GST return') }).state)).toBe('GST return');
  });

  it('PLANTED DEFECT: an unclaimed title is EMPTY, never the ticket id wearing a title slot', () => {
    const state = input({}).state;
    expect(titleOf(state)).toBe('');
    expect(titleOf(state)).not.toBe(state.id);
    expect(titleOf(input({ title: claim(42) }).state)).toBe('');
  });
});
