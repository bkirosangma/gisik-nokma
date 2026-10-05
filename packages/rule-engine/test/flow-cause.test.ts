import { describe, expect, it } from 'vitest';
import { makeEnvelope, SYSTEM_ACTOR_FLOW, type EventEnvelope, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { evaluateEvent } from '../src/evaluate.js';
import { flowExemptEdge } from '../src/index.js';
import { PROJECT, TASK, WS, typeDefined } from '../src/checks/test-support.js';

/**
 * wtg2 T8 (spec AP-2, PS-11): the forgery guard (`cause.forged`) at the transition, close and reopen doors, and the flow's
 * synthetic edges. World and `WF_STRICT` copied from `transition-backlog.test.ts`: no wildcard edges, `todo → doing → done`
 * only, so `todo → done` and `done → todo` are undeclared.
 */

const T = '01J9GTKT000000000000000000';
const P = '01J9GPAR000000000000000000';
const C = '01J9GTKC000000000000000000';
const D = '01J9GDEC000000000000000000';
const EV = '01J9GEVT000000000000000001';
const FLOW = SYSTEM_ACTOR_FLOW;
const PERSON = '01J9GACT000000000000000001';

const WF_STRICT: PublishedWorkflowDef = {
  id: 'wf-basic', version: 1, name: 'Strict', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'doing', rules: [] }, { from: 'doing', to: 'done', rules: [] }],
};
/** `WF_STRICT` with a SECOND terminal state declared after `done`: "the first terminal" is `done`, never `dropped`. */
const WF_TWO_TERMINALS: PublishedWorkflowDef = {
  ...WF_STRICT,
  states: [...WF_STRICT.states, { id: 'dropped', name: 'Dropped', category: 'terminal' }],
};

const on = (id: string, actorId: string, type: string, payload: unknown): EventEnvelope =>
  makeEnvelope({ type, entity: { kind: 'ticket', id }, workspaceId: WS, payload, actorId });
const by = (actorId: string, type: string, payload: unknown): EventEnvelope => on(T, actorId, type, payload);
/** A `ticket.created` envelope (the `created` builder of `checks/test-support.ts`, with a start and a parent). */
const createdIn = (start: 'backlog' | 'focus', parentId: string | null = null, id: string = T): EventEnvelope =>
  makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS,
    payload: { typeId: 'task', projectId: PROJECT, parentId, title: 't', start } });
/** The two declared moves that put `id` in `done`. */
const finish = (id: string): EventEnvelope[] =>
  [on(id, PERSON, 'ticket.transitioned', { to: 'doing' }), on(id, PERSON, 'ticket.transitioned', { to: 'done' })];
/** An open child of `parent`, in To do. */
const childOf = (parent: string): EventEnvelope => createdIn('focus', parent, C);

const ctx = (start: 'backlog' | 'focus', ...after: EventEnvelope[]) =>
  buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn(start), ...after]);
const atDone = (def: PublishedWorkflowDef = WF_STRICT) =>
  buildMemoryContext([def], [typeDefined(TASK), createdIn('focus'), ...finish(T)]);

const notTaken = { kind: 'branch-not-taken', decisionTicketId: D, outcome: 'No', pass: 1, decidedBy: PERSON, decisionEventId: EV };
const reopened = { ...notTaken, kind: 'reopened-by-flow' };
const ledTo = { kind: 'led-to', sourceTicketId: D, triggeredBy: PERSON };
const FORGED = 'Only the flow can record that a ticket was led here, reopened or passed over by a decision.';

describe('29.203 the forgery guard', () => {
  it('29.203 a flow cause from a person is cause.forged at all three doors, before any other rule; the flow actor passes', async () => {
    const w = (...after: EventEnvelope[]) => buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn('focus'), ...after]);
    const forged = { refused: true, rule: 'cause.forged', reason: FORGED };
    expect(await evaluateEvent(by(PERSON, 'ticket.transitioned', { to: 'done', cause: notTaken }), w())).toEqual(forged);
    expect(await evaluateEvent(by(PERSON, 'ticket.transitioned', { to: 'doing', cause: ledTo }), w())).toEqual(forged); // forged even though the edge is declared
    expect(await evaluateEvent(by(PERSON, 'ticket.closed', { cause: notTaken }), w(...finish(T)))).toEqual(forged); // a closable ticket: without the guard this close is accepted
    expect(await evaluateEvent(by(PERSON, 'ticket.closed', { cause: notTaken }), w())).toEqual(forged); // a ticket in To do: a guard placed after the terminal check would answer close-requires-terminal
    expect(await evaluateEvent(by(PERSON, 'ticket.reopened', { cause: reopened }), w())).toEqual(forged); // before the not-closed check
    // control: the flow's led-to on a declared edge. From Backlog (the universal Start edge), so a later rule that a
    // led-to must start from Backlog (spec AP-1) would not answer first.
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: ledTo }), ctx('backlog'))).toEqual({ refused: false });
    expect(await evaluateEvent(by(PERSON, 'ticket.transitioned', { to: 'doing', cause: { kind: 'reopened-for-child', childTicketId: D } }), w())).toEqual({ refused: false }); // control: a person's old cause
    // control: the flow's close and reopen with their own causes pass the guard (a closable ticket, then a closed one)
    expect(await evaluateEvent(by(FLOW, 'ticket.closed', { cause: notTaken }), w(...finish(T)))).toEqual({ refused: false });
    expect(await evaluateEvent(by(FLOW, 'ticket.reopened', { cause: reopened }), w(...finish(T), by(PERSON, 'ticket.closed', {})))).toEqual({ refused: false });
  });
});

describe('29.204 the flow moves over undeclared edges', () => {
  it('29.204 the flow moves over undeclared edges, and every invariant still holds', async () => {
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: reopened }), atDone())).toEqual({ refused: false }); // done -> initial
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'backlog', cause: reopened }), atDone())).toEqual({ refused: false }); // done -> backlog (no universal edge from terminal)
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), ctx('focus'))).toEqual({ refused: false }); // todo -> done
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), buildMemoryContext([WF_TWO_TERMINALS], [typeDefined(TASK), createdIn('focus')]))).toEqual({ refused: false });
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'dropped', cause: notTaken }), buildMemoryContext([WF_TWO_TERMINALS], [typeDefined(TASK), createdIn('focus')]))).toMatchObject({ rule: 'illegal-transition' }); // only the FIRST terminal
    // invariants: a closed ticket
    const closed = buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn('focus'), ...finish(T), by(PERSON, 'ticket.closed', {})]);
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: reopened }), closed)).toMatchObject({ rule: 'closed-ticket' });
    // invariants: a child leaving terminal under a terminal parent. P first (no parent, id P), then T under P.
    const underDone = buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn('focus', null, P), createdIn('focus', P), ...finish(T), ...finish(P)]);
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: reopened }), underDone)).toMatchObject({ rule: 'child-open-under-terminal-parent' });
    // invariants: a parent entering terminal over an open child
    const overOpen = buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn('focus'), childOf(T)]);
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), overOpen)).toMatchObject({ rule: 'parent-terminal-with-open-children' });
    // control: led-to opens no edge. From Backlog, so a led-to-only-out-of-Backlog rule (spec AP-1) would not answer first.
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: ledTo }), ctx('backlog'))).toMatchObject({ rule: 'illegal-transition' });
  });
});

describe('29.361 a person gets no exemption', () => {
  it('29.361 a person gets no exemption, with or without a cause', async () => {
    expect(await evaluateEvent(by(PERSON, 'ticket.transitioned', { to: 'done' }), ctx('focus'))).toMatchObject({ rule: 'illegal-transition' });
    expect(await evaluateEvent(by(PERSON, 'ticket.transitioned', { to: 'todo' }), atDone())).toMatchObject({ rule: 'illegal-transition' });
    expect(await evaluateEvent(by(PERSON, 'ticket.transitioned', { to: 'done', cause: notTaken }), ctx('focus'))).toMatchObject({ rule: 'cause.forged' });
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), ctx('focus'))).toEqual({ refused: false }); // control
    // The actor test inside flowExemptEdge, on its own: at the door the forgery guard answers first for a person with a flow
    // cause, so dropping the actor test there changes no evaluateEvent result. Asked directly, it must still say no.
    const done = WF_STRICT.states.find((s) => s.id === 'done')!;
    expect(flowExemptEdge(by(PERSON, 'ticket.transitioned', { to: 'done', cause: notTaken }), WF_STRICT, 'todo', done, notTaken)).toBeNull();
    expect(flowExemptEdge(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), WF_STRICT, 'todo', done, notTaken)).toEqual({ from: 'todo', to: 'done', rules: [] }); // control
  });
});

describe('29.362 the flow actor needs the cause', () => {
  it('29.362 the flow actor needs the cause', async () => {
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done' }), ctx('focus'))).toMatchObject({ rule: 'illegal-transition' });
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo' }), atDone())).toMatchObject({ rule: 'illegal-transition' });
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: reopened }), atDone())).toEqual({ refused: false }); // control
  });
});

describe('29.363 the cause must fit the move', () => {
  it('29.363 the cause must fit the move', async () => {
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: reopened }), ctx('focus'))).toMatchObject({ rule: 'illegal-transition' }); // reopened-by-flow into a terminal
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: notTaken }), atDone())).toMatchObject({ rule: 'illegal-transition' }); // not-taken into the initial state
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'doing', cause: reopened }), ctx('backlog'))).toMatchObject({ rule: 'illegal-transition' }); // neither initial nor backlog
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), atDone())).toMatchObject({ rule: 'illegal-transition' }); // done -> done
    // The same-state clause on its own (plan departure 11): only reopened-by-flow reaches it with a legal target, so these
    // two legs are what fail when `fromStateId === to.id` is dropped. Controls: the same cause from another state passes.
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: reopened }), ctx('focus'))).toMatchObject({ rule: 'illegal-transition' }); // todo -> todo
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: reopened }), ctx('focus', by(PERSON, 'ticket.transitioned', { to: 'doing' })))).toEqual({ refused: false }); // control: doing -> todo
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'backlog', cause: reopened }), ctx('backlog'))).toMatchObject({ rule: 'illegal-transition' }); // backlog -> backlog
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'backlog', cause: reopened }), ctx('focus'))).toEqual({ refused: false }); // control: todo -> backlog (the universal Send-to-backlog edge)
    // not-taken from a terminal ticket: nothing to pass over. From the SECOND terminal state, so the `!== 'terminal'` clause
    // decides, not the same-state test. (`buildMemoryContext` folds history without evaluating it, so the undeclared move
    // to `dropped` is a legal fixture.)
    const atDropped = buildMemoryContext([WF_TWO_TERMINALS], [typeDefined(TASK), createdIn('focus'), by(PERSON, 'ticket.transitioned', { to: 'doing' }), by(PERSON, 'ticket.transitioned', { to: 'dropped' })]);
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), atDropped)).toMatchObject({ rule: 'illegal-transition' });
  });
});
