import { describe, expect, it } from 'vitest';
import type { TicketState } from '../src/entity-state.js';
import { makeEnvelope } from '../src/testing.js';
import { applyTicketEvent, type TicketStateDeps } from '../src/ticket-state.js';
import { endedAtOf, hasStarted, notTakenOf, resolutionOf, startedAtOf, ticketRound } from '../src/flow/derive.js';
import { istDayOf } from '../src/ist-day.js';
import type { TicketTypeDef } from '../src/ticket-types.js';
import type { WorkflowDef } from '../src/workflow.js';

const TICKET = '01J9GTKA000000000000000000';
const DECISION = '01J9GDEC000000000000000000';
const ACTOR = '01J9GACT000000000000000000';
const EVT = '01J9GEVT000000000000000000';
const open = (id: string, name: string) => ({ id, name, category: 'open' as const });
const wf = (id: string, initialStateId: string): WorkflowDef => ({
  id, version: 1, name: id, initialStateId,
  states: [open('todo', 'To do'), { id: 'doing', name: 'Doing', category: 'active' }, { id: 'review', name: 'Review', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' }, { id: 'dropped', name: 'Dropped', category: 'terminal' }],
  transitions: ['todo', 'doing', 'review', 'done', 'dropped'].map((to) => ({ from: '*', to, rules: [] })),
});
const WF_OTHER: WorkflowDef = { id: 'wf-other', version: 1, name: 'Other', initialStateId: 'new',
  states: [open('new', 'New'), { id: 'working', name: 'Working', category: 'active' }, { id: 'shut', name: 'Shut', category: 'terminal' }],
  transitions: [{ from: '*', to: 'working', rules: [] }] };
const type = (id: string, workflowId: string): TicketTypeDef => ({ id, name: id, icon: 'check', rank: 3, workflowId, fields: [] });
const deps: TicketStateDeps = {
  getTicketType: (id) => [type('task', 'wf-basic'), type('eager', 'wf-eager')].find((t) => t.id === id),
  getWorkflow: (id) => [wf('wf-basic', 'todo'), wf('wf-eager', 'doing'), WF_OTHER].find((w) => w.id === id),
};
/** Day `n` of September at 10:00Z: two digits, so a history may run past day 9. */
const T = (n: number): string => `2026-09-${String(n).padStart(2, '0')}T10:00:00.000Z`;
const ev = (type: string, payload: unknown, n: number) =>
  makeEnvelope({ type, entity: { kind: 'ticket', id: TICKET }, payload, serverTime: T(n), seq: n });
const created = (n: number, extra: Record<string, unknown> = {}) =>
  ev('ticket.created', { typeId: 'task', projectId: '01J9GPRJ000000000000000000', parentId: null, title: 'T', ...extra }, n);
const to = (state: string, n: number, cause?: unknown) => ev('ticket.transitioned', cause === undefined ? { to: state } : { to: state, cause }, n);
const fold = (events: ReturnType<typeof ev>[]): TicketState =>
  events.reduce<TicketState | undefined>((s, e) => applyTicketEvent(s, e, deps), undefined) as TicketState;
const RESET = { kind: 'reopened-by-flow', decisionTicketId: DECISION, outcome: 'No', pass: 1, decidedBy: ACTOR, decisionEventId: EVT };
const NOT_TAKEN = { ...RESET, kind: 'branch-not-taken', outcome: 'Yes' };

describe('29.167 actual dates', () => {
  it('29.167 first start, last end, on every path', () => {
    const born = fold([created(1, { stateId: 'doing' })]);
    expect([startedAtOf(born), endedAtOf(born), hasStarted(born)]).toEqual([T(1), null, true]);
    const opened = fold([created(1), to('doing', 2)]);
    expect([startedAtOf(opened), endedAtOf(opened)]).toEqual([T(2), null]);
    expect(fold([created(1), to('done', 2)]).periods).toEqual([{ start: T(2), end: T(2), pass: 1 }]);
    const finished = fold([created(1), to('doing', 2), to('done', 3)]);
    expect([startedAtOf(finished), endedAtOf(finished), hasStarted(finished)]).toEqual([T(2), T(3), false]);
    const again = fold([created(1), to('doing', 2), to('done', 3), to('doing', 4)]);
    expect(endedAtOf(again)).toBeNull(); // terminal -> active clears it
    expect([startedAtOf(again), hasStarted(again)]).toEqual([T(2), true]); // the FIRST start; the open LAST period
    // The second element of the fold: the SECOND period closes and the first is untouched, so the end is the last one's.
    const twice = fold([created(1), to('doing', 2), to('done', 3), to('doing', 4), to('done', 5)]);
    expect(twice.periods).toEqual([{ start: T(2), end: T(3), pass: 1 }, { start: T(4), end: T(5), pass: 1 }]);
    expect([startedAtOf(twice), endedAtOf(twice), hasStarted(twice)]).toEqual([T(2), T(5), false]);
    const reopened = fold([created(1), to('doing', 2), to('done', 3), ev('ticket.closed', {}, 4), ev('ticket.reopened', {}, 5)]);
    expect(endedAtOf(reopened)).toBe(T(3)); // a reopen alone leaves it
    const idle = fold([created(1), to('todo', 2)]); // control
    expect([startedAtOf(idle), endedAtOf(idle), 'periods' in idle]).toEqual([null, null, false]);
  });
});

describe('29.168 derived helpers', () => {
  it('29.168 absent members read as none; the IST day of an instant', () => {
    const idle = fold([created(1)]);
    expect([ticketRound(idle), hasStarted(idle), resolutionOf(idle)]).toEqual([1, false, null]);
    expect([startedAtOf(idle), endedAtOf(idle)]).toEqual([null, null]);
    expect(istDayOf('2026-09-02T18:29:59.000Z')).toBe('2026-09-02');
    expect(istDayOf('2026-09-02T18:30:00.000Z')).toBe('2026-09-03'); // control: the boundary
  });
});

describe('29.350 / 29.351 periods', () => {
  it('29.350 closes on terminal or Backlog, not on a move inside the workflow', () => {
    expect(fold([created(1), to('doing', 2), to('review', 3), to('todo', 4)]).periods).toEqual([{ start: T(2), end: null, pass: 1 }]);
    expect(fold([created(1), to('doing', 2), to('backlog', 3)]).periods).toEqual([{ start: T(2), end: T(3), pass: 1 }]); // control
    expect(fold([created(1), to('doing', 2), to('done', 3)]).periods).toEqual([{ start: T(2), end: T(3), pass: 1 }]);
  });
  it('29.351 terminal to active opens period 2; terminal to terminal opens nothing; a rebound opens', () => {
    const two = fold([created(1), to('doing', 2), to('done', 3), to('doing', 4)]);
    expect(two.periods).toEqual([{ start: T(2), end: T(3), pass: 1 }, { start: T(4), end: null, pass: 1 }]);
    expect(fold([created(1), to('doing', 2), to('done', 3), to('dropped', 4)]).periods).toEqual([{ start: T(2), end: T(3), pass: 1 }]); // not re-ended at T(4) either
    // Control: the same terminal move from an OPEN state does open (and close) one.
    expect(fold([created(1), to('todo', 2), to('dropped', 3)]).periods).toEqual([{ start: T(3), end: T(3), pass: 1 }]);
    const rebound = fold([created(1), ev('ticket.workflow_rebound', { toWorkflowId: 'wf-other', toStateId: 'working' }, 2)]);
    expect(rebound.periods).toEqual([{ start: T(2), end: null, pass: 1 }]);
    expect('periods' in fold([created(1), ev('ticket.workflow_rebound', { toWorkflowId: 'wf-other', toStateId: 'new' }, 2)])).toBe(false);
  });
});

describe('29.352 rounds', () => {
  it('29.352 counts reopened-by-flow transitions only', () => {
    const closedAt4 = [created(1), to('doing', 2), to('done', 3), ev('ticket.closed', {}, 4)];
    const reset = fold([...closedAt4, ev('ticket.reopened', { cause: RESET }, 5)]);
    expect(ticketRound(reset)).toBe(1); // the paired reopen adds nothing
    const next = fold([...closedAt4, ev('ticket.reopened', { cause: RESET }, 5), to('todo', 6, RESET), to('doing', 7)]);
    expect(ticketRound(next)).toBe(2);
    expect(next.periods).toEqual([{ start: T(2), end: T(3), pass: 1 }, { start: T(7), end: null, pass: 2 }]);
    // The second reset: round 3, and the third period opens with pass 3 (a fold that only ever set 2 fails here).
    const third = fold([...closedAt4, ev('ticket.reopened', { cause: RESET }, 5), to('todo', 6, RESET), to('doing', 7), to('done', 8),
      to('todo', 9, { ...RESET, pass: 2 }), to('doing', 10)]);
    expect([ticketRound(third), third.rounds]).toEqual([3, 3]);
    expect(third.periods?.[2]).toEqual({ start: T(10), end: null, pass: 3 });
    const child = fold([created(1), to('done', 2, { kind: 'reopened-for-child', childTicketId: DECISION })]);
    expect('rounds' in child).toBe(false); // control
    expect('rounds' in fold([...closedAt4, ev('ticket.reopened', {}, 5), to('doing', 6)])).toBe(false); // control: a person's reopen
    const eager = fold([created(1, { typeId: 'eager' }), to('done', 2), to('doing', 3, RESET)]); // initial state is active
    expect(eager.periods?.[1]).toEqual({ start: T(3), end: null, pass: 2 });
  });
});

describe('29.353 not taken', () => {
  it('29.353 opens and closes no period; a reopen clears the resolution', () => {
    const nt = fold([created(1), to('done', 2, NOT_TAKEN), ev('ticket.closed', { cause: NOT_TAKEN }, 3)]);
    expect('periods' in nt).toBe(false);
    expect(resolutionOf(nt)).toEqual({ kind: 'not-taken', decisionTicketId: DECISION, outcome: 'Yes', pass: 1 });
    expect(resolutionOf(applyTicketEvent(nt, ev('ticket.reopened', { cause: RESET }, 4), deps))).toBeNull();
    const plain = fold([created(1), to('done', 2), ev('ticket.closed', {}, 3)]); // control
    expect(plain.periods).toEqual([{ start: T(2), end: T(2), pass: 1 }]);
    expect(resolutionOf(plain)).toBeNull();
    // `notTakenOf` reads only a well-formed branch-not-taken cause: another flow kind, or the kind without its fields, is none.
    expect([notTakenOf(RESET), notTakenOf({ kind: 'branch-not-taken' }), notTakenOf(null)]).toEqual([null, null, null]);
    expect(notTakenOf(NOT_TAKEN)).toEqual({ kind: 'not-taken', decisionTicketId: DECISION, outcome: 'Yes', pass: 1 }); // control
  });
});
