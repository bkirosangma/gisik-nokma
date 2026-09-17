import { describe, expect, it } from 'vitest';
import type { FieldClaim, TicketState } from '@gisik-nokma/domain';
import { matchesFilter } from '../../src/filter/matches-filter.js';
import { matchesListRow, type ListFilterSpec } from '../../src/filter/list-filter.js';
import type { BoardFilterSpec } from '../../src/filter/board-filter.js';
import type { ListRow } from '../../src/view-types.js';

function claim(value: unknown): FieldClaim {
  return { value, actorId: 'u1', clientTime: '', serverTime: '' };
}
const provenance = { actorId: 'u1', actorName: 'Ada', clientTime: '', serverTime: '' };

/** The same ticket as the list renders it — every axis a ListRow can answer is populated. */
const row: ListRow = {
  ticketId: 't1', title: 'Ship the board', typeId: 'task', typeRank: 3,
  parentId: null, epicId: null,
  stateId: 's-doing', stateName: 'Doing', stateCategory: 'active',
  stateProvenance: provenance,
  assignee: { id: 'u1', name: 'Ada' }, assignedProvenance: provenance,
  dueDate: { date: '2026-09-20', claim: provenance },
  fields: { title: claim('Ship the board'), amount: claim(4200), priority: claim('high') },
  rollup: null, hasRestrictedParent: false, pending: false, closed: null,
};

/** The same row, closed — for the `closed` axis pair below (backlog/closed spec §4, 2026-09-17). */
const closedRow: ListRow = { ...row, closed: { actorId: 'u1', at: '2026-09-17T00:00:00.000Z' } };

/** …and as `matchesFilter` sees it. */
const equivalent: TicketState = {
  kind: 'ticket', id: 't1', workspaceId: 'w1', projectId: 'p1', typeId: 'task',
  parentId: null, workflowId: 'wf1', workflowVersion: 1,
  stateId: 's-doing', stateCategory: 'active',
  assigneeId: 'u1', collaboratorIds: [],
  fields: {
    title: claim('Ship the board'),
    dueDate: claim({ date: '2026-09-20' }),
    amount: claim(4200),
    priority: claim('high'),
  },
  transitions: [],
  // No `closed` key at all — `TicketState.closed?` predates the flag on 441
  // fixtures, and this one is the LEGACY case: `state.closed ?? null` reads
  // it as not closed, same as an explicit `closed: null`.
};

/** The same ticket, closed — `TicketState.closed?` is optional, this fixture sets it. */
const closedEquivalent: TicketState = { ...equivalent, closed: { actorId: 'u1', at: '2026-09-17T00:00:00.000Z' } };

/**
 * 13.542 — the list predicate agrees with `matchesFilter` on every axis it
 * serves (exclude-mode spec §2), including the two the board cannot answer —
 * due bounds and field clauses — and the exclude half.
 */
describe('13.542 matchesListRow agrees with matchesFilter on every axis it serves', () => {
  const cases: Array<[string, ListFilterSpec]> = [
    ['empty spec', {}],
    ['matching assignee', { assigneeIds: ['u1'] }],
    ['non-matching assignee', { assigneeIds: ['u2'] }],
    ['matching type', { typeIds: ['task'] }],
    ['non-matching type', { typeIds: ['bug'] }],
    ['matching state', { stateIds: ['s-doing'] }],
    ['non-matching state', { stateIds: ['s-done'] }],
    ['matching category', { stateCategories: ['active'] }],
    ['non-matching category', { stateCategories: ['terminal'] }],
    ['matching project', { projectIds: ['p1'] }],
    ['non-matching project', { projectIds: ['p2'] }],
    ['matching text', { text: 'board' }],
    ['non-matching text', { text: 'zzz' }],
    ['dueBefore inclusive, on the day', { dueBefore: '2026-09-20' }],
    ['dueBefore, too early', { dueBefore: '2026-09-19' }],
    ['dueAfter inclusive, on the day', { dueAfter: '2026-09-20' }],
    ['dueAfter, too late', { dueAfter: '2026-09-21' }],
    ['field clause, string match', { fields: { priority: 'high' } }],
    ['field clause, number rendered as text', { fields: { amount: '4200' } }],
    ['field clause, mismatch', { fields: { priority: 'low' } }],
    ['field clause, unknown field', { fields: { nope: 'x' } }],
    ['excluded assignee', { exclude: { assigneeIds: ['u1'] } }],
    ['excluded other assignee', { exclude: { assigneeIds: ['u2'] } }],
    ['excluded type', { exclude: { typeIds: ['task'] } }],
    ['excluded state', { exclude: { stateIds: ['s-doing'] } }],
    ['excluded category', { exclude: { stateCategories: ['active'] } }],
    ['excluded project', { exclude: { projectIds: ['p1'] } }],
    ['included and excluded on one axis', { assigneeIds: ['u1'], exclude: { assigneeIds: ['u1'] } }],
    ['closed:false matches a row that is not closed', { closed: false }],
    ['closed:true rejects a row that is not closed', { closed: true }],
  ];

  for (const [name, spec] of cases) {
    it(`${name}: both sides decide alike`, () => {
      expect(matchesListRow(row, 'p1', spec)).toBe(matchesFilter(equivalent, spec));
    });
  }

  it('the corpus contains a rejection, so agreement is not vacuous', () => {
    const anyRejected = cases.some(([, spec]) => !matchesListRow(row, 'p1', spec));
    expect(anyRejected, 'every case matched — the agreement proves nothing').toBe(true);
  });

  it('an undated row is excluded by a due bound, as the server would exclude SQL NULL', () => {
    const undated: ListRow = { ...row, dueDate: null };
    expect(matchesListRow(undated, 'p1', { dueBefore: '2026-12-31' })).toBe(false);
    expect(matchesListRow(undated, 'p1', { dueAfter: '2026-01-01' })).toBe(false);
    expect(matchesListRow(undated, 'p1', {})).toBe(true);
  });

  it('an unassigned row never matches an assignee include and is never out on an assignee exclude', () => {
    const unassigned: ListRow = { ...row, assignee: null };
    expect(matchesListRow(unassigned, 'p1', { assigneeIds: ['u1'] })).toBe(false);
    expect(matchesListRow(unassigned, 'p1', { exclude: { assigneeIds: ['u1'] } })).toBe(true);
  });
});

/**
 * 13.581 (extension) — the `closed` axis over a row/state pair with `closed`
 * SET, the half the shared `cases` corpus above cannot cover with one row: it
 * asserts against `row` (not closed) alone, so `closed: true` matching would
 * go unnoticed there. Same agreement discipline — both sides decide alike —
 * over the pair that actually has something to match.
 */
describe('13.581 (extension) matchesListRow honours closed the same way matchesFilter does', () => {
  const closedCases: Array<[string, ListFilterSpec]> = [
    ['empty spec', {}],
    ['closed:true', { closed: true }],
    ['closed:false', { closed: false }],
  ];

  for (const [name, spec] of closedCases) {
    it(`a closed row/state pair, ${name}: both sides decide alike`, () => {
      expect(matchesListRow(closedRow, 'p1', spec)).toBe(matchesFilter(closedEquivalent, spec));
    });
  }

  it('closed:true matches only the closed row; closed:false matches only the not-closed one', () => {
    expect(matchesListRow(closedRow, 'p1', { closed: true })).toBe(true);
    expect(matchesListRow(row, 'p1', { closed: true })).toBe(false);
    expect(matchesListRow(closedRow, 'p1', { closed: false })).toBe(false);
    expect(matchesListRow(row, 'p1', { closed: false })).toBe(true);
  });

  it('absent closed matches both a closed and a not-closed row', () => {
    expect(matchesListRow(closedRow, 'p1', {})).toBe(true);
    expect(matchesListRow(row, 'p1', {})).toBe(true);
  });

  /** A legacy `TicketState` with no `closed` key at all counts as not closed (`equivalent` carries none). */
  it('a TicketState fixture with no closed field at all counts as not closed', () => {
    expect(matchesFilter(equivalent, { closed: false })).toBe(true);
    expect(matchesFilter(equivalent, { closed: true })).toBe(false);
  });
});

describe('13.543 the axis a ListRow cannot answer is unrepresentable in both halves', () => {
  it('rejects collaboratorIds at compile time', () => {
    // @ts-expect-error a ListRow carries no collaborators.
    const spec: ListFilterSpec = { collaboratorIds: ['u9'] };
    expect(spec).toBeDefined();
  });
  it('rejects exclude.collaboratorIds at compile time', () => {
    // @ts-expect-error same axis, exclude half.
    const spec: ListFilterSpec = { exclude: { collaboratorIds: ['u9'] } };
    expect(spec).toBeDefined();
  });

  /**
   * 13.581 (extension) — `BoardFilterSpec`'s `Pick` does not name `closed`
   * (unlike `ListFilterSpec`'s): a `BoardCard` carries no `closed` field for
   * the same reason it carries no collaborators or claimed dates, so the axis
   * must be a compile error there rather than a silent no-op.
   */
  it('rejects closed on BoardFilterSpec at compile time', () => {
    // @ts-expect-error a BoardCard carries no closed field.
    const spec: BoardFilterSpec = { closed: true };
    expect(spec).toBeDefined();
  });
});
