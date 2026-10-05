import { describe, expect, it } from 'vitest';
import {
  applyTicketEvent,
  DECISION_TYPE_ID,
  flowCauseSchema,
  isFlowCause,
  isSystemActor,
  makeEnvelope,
  SYSTEM_ACTOR_FLOW,
  SYSTEM_ACTOR_NAMES,
  ticketClosedPayload,
  ticketReopenedPayload,
  ticketTransitionedPayloadSchema,
  ULID_REGEX,
  viewerSafeCause,
  type TicketState,
  type TicketStateDeps,
} from '../src/index.js';

/** wtg2 T8 (spec AP-2, PS-2, PS-11): the three flow causes, the reserved flow actor, and the reducer arms that read them. */

const SRC = '01J9GSRC000000000000000000';
const DEC = '01J9GDEC000000000000000000';
const WHO = '01J9GACT000000000000000001';
const EV = '01J9GEVT000000000000000001';
const TICKET = '01J9GTKT000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';

const reopenedByFlow = { kind: 'reopened-by-flow', decisionTicketId: DEC, outcome: 'No', pass: 2, decidedBy: WHO, decisionEventId: EV };
const notTaken = { ...reopenedByFlow, kind: 'branch-not-taken' };
const ledTo = { kind: 'led-to', sourceTicketId: SRC, label: 'Yes', triggeredBy: WHO };

// The one-workflow world `decision-event.test.ts` folds in (T5); only `ticket.created` and `ticket.transitioned` read it.
const deps: TicketStateDeps = {
  getTicketType: (id) =>
    id === 'task' ? { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] } : undefined,
  getWorkflow: (id) =>
    id === 'wf-basic'
      ? {
          id: 'wf-basic',
          version: 1,
          name: 'Basic',
          initialStateId: 'todo',
          states: [{ id: 'todo', name: 'To do', category: 'open' }],
          transitions: [{ from: '*', to: 'todo', rules: [] }],
        }
      : undefined,
};

function bornState(): TicketState {
  return applyTicketEvent(
    undefined,
    makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: TICKET },
      payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Ship or redo' },
    }),
    deps,
  );
}

describe('29.200 the flow causes', () => {
  it('29.200 the causes are strict and discriminated; isFlowCause and viewerSafeCause', () => {
    for (const c of [reopenedByFlow, notTaken, ledTo, { ...ledTo, label: undefined }]) expect(flowCauseSchema.safeParse(c).success).toBe(true);
    expect(flowCauseSchema.safeParse({ ...ledTo, extra: 1 }).success).toBe(false);
    expect(flowCauseSchema.safeParse({ ...notTaken, extra: 1 }).success).toBe(false); // each arm is strict on its own
    expect(flowCauseSchema.safeParse({ ...reopenedByFlow, extra: 1 }).success).toBe(false);
    expect(flowCauseSchema.safeParse({ ...notTaken, pass: 0 }).success).toBe(false);
    expect(flowCauseSchema.safeParse({ ...notTaken, pass: 1 }).success).toBe(true); // control: the boundary pass parses
    expect(flowCauseSchema.safeParse({ ...notTaken, decisionTicketId: 'nope' }).success).toBe(false);
    // Every id member is a ULID, on each arm (control: the fixtures above parse with real ULIDs).
    for (const key of ['decidedBy', 'decisionEventId'] as const) expect(flowCauseSchema.safeParse({ ...notTaken, [key]: 'nope' }).success, key).toBe(false);
    for (const key of ['sourceTicketId', 'triggeredBy'] as const) expect(flowCauseSchema.safeParse({ ...ledTo, [key]: 'nope' }).success, key).toBe(false);
    // The outcome and the label are non-empty: '' is refused, one character is the boundary that parses.
    expect(flowCauseSchema.safeParse({ ...notTaken, outcome: '' }).success).toBe(false);
    expect(flowCauseSchema.safeParse({ ...notTaken, outcome: 'Y' }).success).toBe(true);
    expect(flowCauseSchema.safeParse({ ...ledTo, label: '' }).success).toBe(false);
    expect(flowCauseSchema.safeParse({ ...ledTo, label: 'Y' }).success).toBe(true);
    expect(flowCauseSchema.safeParse({ kind: 'led-to', sourceTicketId: SRC }).success).toBe(false); // triggeredBy required
    expect(isFlowCause(ledTo)).toBe(true);
    expect(isFlowCause({ kind: 'reopened-for-child', childTicketId: SRC })).toBe(false); // control
    expect(isFlowCause(null)).toBe(false);
    expect(viewerSafeCause(notTaken as never)).toEqual({ kind: 'branch-not-taken' });
    expect(JSON.stringify(viewerSafeCause(ledTo as never))).not.toContain(SRC);
  });
});

describe('29.201 the three payloads', () => {
  it('29.201 the payloads: transitioned takes four causes, closed one, reopened one', () => {
    const t = (cause: unknown) => ticketTransitionedPayloadSchema.safeParse({ to: 'done', cause }).success;
    expect([t({ kind: 'reopened-for-child', childTicketId: SRC }), t(ledTo), t(reopenedByFlow), t(notTaken)]).toEqual([true, true, true, true]);
    expect(t({ kind: 'reopened-by-decree' })).toBe(false);
    expect(ticketClosedPayload.safeParse({}).success && ticketReopenedPayload.safeParse({}).success).toBe(true); // old events still parse
    expect(ticketClosedPayload.safeParse({ cause: notTaken }).success).toBe(true);
    expect(ticketClosedPayload.safeParse({ cause: ledTo }).success).toBe(false);
    expect(ticketClosedPayload.safeParse({ cause: { kind: 'reopened-for-child', childTicketId: SRC } }).success).toBe(false); // control
    expect(ticketReopenedPayload.safeParse({ cause: reopenedByFlow }).success).toBe(true);
    expect(ticketReopenedPayload.safeParse({ cause: notTaken }).success).toBe(false);
  });
});

describe('29.202 the reserved flow actor', () => {
  it('29.202 SYSTEM_ACTOR_FLOW is a reserved ULID named Flow', () => {
    expect(ULID_REGEX.test(SYSTEM_ACTOR_FLOW)).toBe(true);
    expect(ULID_REGEX.test('00000000000000000000SYS0FI')).toBe(false); // negative control: one char off the alphabet
    expect(SYSTEM_ACTOR_NAMES.get(SYSTEM_ACTOR_FLOW)).toBe('Flow');
    expect(isSystemActor(SYSTEM_ACTOR_FLOW)).toBe(true);
  });
});

describe('29.206 the reducer arms', () => {
  it('29.206 reopened-by-flow releases a Decision outcome and keeps passes; Tasks and other causes are untouched; closed carries the cause', () => {
    const decision = {
      ...bornState(),
      typeId: DECISION_TYPE_ID,
      outcome: 'No',
      passes: [{ pass: 1, outcome: 'No', by: WHO, at: '2026-10-03T09:00:00.000Z', revisions: [] }],
    } as TicketState;
    const flowMove = makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: decision.id }, payload: { to: 'todo', cause: reopenedByFlow }, actorId: SYSTEM_ACTOR_FLOW });
    const after = applyTicketEvent(decision, flowMove, deps);
    expect(after.outcome).toBeUndefined();
    expect('outcome' in after).toBe(false); // released, not set to undefined
    expect(after.passes).toEqual(decision.passes);
    expect(after.stateId).toBe('todo'); // the move itself still folds
    expect(applyTicketEvent({ ...decision, typeId: 'task' }, flowMove, deps).outcome).toBe('No'); // control: a Task keeps it
    const personMove = makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: decision.id }, payload: { to: 'todo' } });
    expect(applyTicketEvent(decision, personMove, deps).outcome).toBe('No'); // control: no cause, no release
    // Another flow cause: only reopened-by-flow releases (the person-move control above has NO cause, so "release on any cause" survives it).
    const ledMove = makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: decision.id }, payload: { to: 'todo', cause: ledTo }, actorId: SYSTEM_ACTOR_FLOW });
    expect(applyTicketEvent(decision, ledMove, deps).outcome).toBe('No');
    const closeEv = makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket', id: decision.id }, payload: { cause: notTaken }, actorId: SYSTEM_ACTOR_FLOW });
    const closed = applyTicketEvent(decision, closeEv, deps);
    expect(closed.closed).toMatchObject({ actorId: SYSTEM_ACTOR_FLOW, cause: notTaken });
    const reopen = makeEnvelope({ type: 'ticket.reopened', entity: { kind: 'ticket', id: decision.id }, payload: {} });
    expect(applyTicketEvent(closed, reopen, deps).closed).toBeNull();
    const flowReopen = makeEnvelope({ type: 'ticket.reopened', entity: { kind: 'ticket', id: decision.id }, payload: { cause: reopenedByFlow }, actorId: SYSTEM_ACTOR_FLOW });
    expect(applyTicketEvent(closed, flowReopen, deps).closed).toBeNull(); // a caused reopen drops the close's cause too
    const plain = applyTicketEvent(decision, makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket', id: decision.id }, payload: {} }), deps);
    expect('cause' in (plain.closed ?? {})).toBe(false); // an uncaused close stays {actorId, at}
  });
});
