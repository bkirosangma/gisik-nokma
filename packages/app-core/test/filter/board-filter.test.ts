import { describe, expect, it } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import { matchesFilter } from '../../src/filter/matches-filter.js';
import { matchesBoardCard, type BoardFilterSpec } from '../../src/filter/board-filter.js';
import type { BoardCard, BoardColumn } from '../../src/view-types.js';

const card: BoardCard = {
  ticketId: 't1', title: 'Ship the board', typeId: 'task',
  assignee: { id: 'u1', name: 'Ada' },
  // ClaimProvenance is an OBJECT (`view-types.ts:85-90`), not a string.
  stateProvenance: { actorId: 'u1', actorName: 'Ada', clientTime: '', serverTime: '' },
  cause: null, rollup: null, pending: false,
};
const column: BoardColumn = {
  stateId: 's-doing', name: 'Doing', category: 'active', blocked: false, cards: [card],
};

/** The same ticket as the list sees it — every field the board's view-model dropped. */
const equivalent: TicketState = {
  kind: 'ticket', id: 't1', workspaceId: 'w1', projectId: 'p1', typeId: 'task',
  parentId: null, workflowId: 'wf1', workflowVersion: 1,
  stateId: 's-doing', stateCategory: 'active',
  assigneeId: 'u1', collaboratorIds: [],
  fields: { title: { value: 'Ship the board', actorId: 'u1', clientTime: '', serverTime: '' } },
  transitions: [],
};

describe('13.433 the board predicate agrees with matchesFilter on every axis it serves', () => {
  const cases: Array<[string, BoardFilterSpec]> = [
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
    ['excluded assignee', { exclude: { assigneeIds: ['u1'] } }],
    ['excluded other assignee', { exclude: { assigneeIds: ['u2'] } }],
    ['excluded type', { exclude: { typeIds: ['task'] } }],
    ['excluded state', { exclude: { stateIds: ['s-doing'] } }],
    ['excluded category', { exclude: { stateCategories: ['active'] } }],
    ['excluded project', { exclude: { projectIds: ['p1'] } }],
    ['included and excluded on one axis', { assigneeIds: ['u1'], exclude: { assigneeIds: ['u1'] } }],
    ['included here, excluded elsewhere', { assigneeIds: ['u1'], exclude: { typeIds: ['bug'] } }],
  ];

  for (const [name, spec] of cases) {
    it(`${name}: both sides decide alike`, () => {
      expect(matchesBoardCard(card, column, 'p1', spec)).toBe(matchesFilter(equivalent, spec));
    });
  }

  // THE CONTROL: agreement alone would pass if both sides answered `true` to
  // everything. At least one case must actually reject.
  it('the corpus contains a rejection, so agreement is not vacuous', () => {
    const anyRejected = cases.some(([, spec]) => !matchesBoardCard(card, column, 'p1', spec));
    expect(anyRejected, 'every case matched — the agreement proves nothing').toBe(true);
  });
});

describe('13.434 axes the board cannot evaluate are unrepresentable', () => {
  it('rejects collaboratorIds at compile time', () => {
    // @ts-expect-error `collaboratorIds` is not in BoardFilterSpec: a BoardCard
    // carries no collaborators, and matchesFilter fails CLOSED on that axis, so
    // allowing it here would empty the board rather than narrow it.
    const spec: BoardFilterSpec = { collaboratorIds: ['u9'] };
    expect(spec).toBeDefined();
  });

  it('rejects dueBefore at compile time', () => {
    // @ts-expect-error same reason: no claimed dates reach a BoardCard.
    const spec: BoardFilterSpec = { dueBefore: '2026-01-01' };
    expect(spec).toBeDefined();
  });
});

describe('13.540 the exclude half is unrepresentable for the axis the board cannot answer', () => {
  it('rejects exclude.collaboratorIds at compile time — a BoardCard has no collaborators to exclude on', () => {
    // @ts-expect-error `collaboratorIds` is not in BoardIdAxes; `excludedBy` would answer
    // `false` (never out) and silently WIDEN the board past what the person asked for.
    const spec: BoardFilterSpec = { exclude: { collaboratorIds: ['u9'] } };
    expect(spec).toBeDefined();
  });
});

/** 13.541 — the corpus's exclude cases contain a rejection, so agreement on them is not vacuous. */
describe('13.541 the exclude corpus rejects something', () => {
  it('at least one exclude case is a rejection on the board side', () => {
    expect(matchesBoardCard(card, column, 'p1', { exclude: { typeIds: ['task'] } })).toBe(false);
  });
});
