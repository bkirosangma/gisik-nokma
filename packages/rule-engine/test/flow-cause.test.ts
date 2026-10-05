import { describe, expect, it } from 'vitest';
import { DECISION_TYPE_ID, makeEnvelope, SYSTEM_ACTOR_FLOW, validateWorkflowDef, type EventEnvelope, type PublishedWorkflowDef, type TicketTypeDef } from '@gisik-nokma/domain';
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
    // A DECLARED edge wins over the synthetic one and keeps its authored rules: the flow's reset over a declared
    // `done -> todo` that requires a comment is refused for the comment (control: the same move with one passes).
    const WF_RESET_DECLARED: PublishedWorkflowDef = { ...WF_STRICT, transitions: [...WF_STRICT.transitions, { from: 'done', to: 'todo', rules: [{ kind: 'require-comment' }] }] };
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: reopened }), atDone(WF_RESET_DECLARED))).toMatchObject({ rule: 'require-comment' });
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'todo', cause: reopened, comment: { text: 'loop' } }), atDone(WF_RESET_DECLARED))).toEqual({ refused: false });
    // "The FIRST-declared terminal" when the terminal state is declared first, a legal shape (validateWorkflowDef finds no
    // issue; control below): the not-taken move lands there. A search that skips index 0 finds no terminal and refuses it.
    const WF_TERMINAL_FIRST: PublishedWorkflowDef = { ...WF_STRICT, states: [WF_STRICT.states[2]!, WF_STRICT.states[0]!, WF_STRICT.states[1]!] };
    expect(validateWorkflowDef(WF_TERMINAL_FIRST)).toEqual([]);
    expect(await evaluateEvent(by(FLOW, 'ticket.transitioned', { to: 'done', cause: notTaken }), buildMemoryContext([WF_TERMINAL_FIRST], [typeDefined(TASK), createdIn('focus')]))).toEqual({ refused: false });
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
    // Asked directly, a cause that is not a well-formed flow cause is no cause (the door's payload schema would refuse it first).
    const todo = WF_STRICT.states.find((s) => s.id === 'todo')!;
    expect(flowExemptEdge(by(FLOW, 'ticket.transitioned', { to: 'todo' }), WF_STRICT, 'done', todo, { kind: 'reopened-by-flow' })).toBeNull();
    expect(flowExemptEdge(by(FLOW, 'ticket.transitioned', { to: 'todo' }), WF_STRICT, 'done', todo, reopened)).toEqual({ from: 'done', to: 'todo', rules: [] }); // control
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

/**
 * wtg2 T8 Step 7 (spec PS-5, DC-5), wired by T6 (AMEND-wtg2-t6-dc5-exemption: T8 landed first): the flow's "Not taken"
 * finishes a Decision that has branches and no outcome, and nothing else lifts DC-5. `T` is a Decision here, created
 * in To do and moved to Doing, so `doing -> done` is WF_STRICT's DECLARED edge: the exemption is DC-5's alone, not the
 * synthetic edge's (29.204).
 */
const DECISION: TicketTypeDef = { id: DECISION_TYPE_ID, name: 'Decision', icon: 'diamond', rank: 3, workflowId: 'wf-basic', fields: [] };
const decisionWorld = (labels: string[], ...after: EventEnvelope[]) =>
  buildMemoryContext([WF_STRICT], [typeDefined(TASK), typeDefined(DECISION), createdIn('focus', null, P), createdIn('focus', null, C),
    makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: { typeId: DECISION_TYPE_ID, projectId: PROJECT, parentId: null, title: 'Go ahead?', start: 'focus' } }),
    ...labels.map((label, i) => by(PERSON, 'ticket.link_added', { kind: 'leads_to', targetId: i === 0 ? P : C, label })),
    by(PERSON, 'ticket.transitioned', { to: 'doing' }), ...after]);

describe('29.205 the DC-5 exemption', () => {
  it('29.205 branch-not-taken exempts DC-5 on both doors; nothing else does', async () => {
    const dec = (actor: string, to: string, cause?: unknown) => by(actor, 'ticket.transitioned', cause === undefined ? { to } : { to, cause });
    const outcomeRequired = { refused: true, rule: 'decision.outcome-required', reason: 'Choose an outcome before finishing this decision.' };
    expect(await evaluateEvent(dec(FLOW, 'done', notTaken), decisionWorld(['Yes', 'No']))).toEqual({ refused: false });
    expect(await evaluateEvent(dec(PERSON, 'done'), decisionWorld(['Yes', 'No']))).toEqual(outcomeRequired); // a person: still DC-5 (control)
    // (planner ruling 2026-10-04, Q6: no `led-to` leg. `doing -> done` is declared on WF_STRICT, so it would answer
    // decision.outcome-required here and cause.led-to-not-backlog after T13; the two legs below carry the case line.)
    expect(await evaluateEvent(dec(FLOW, 'done', reopened), decisionWorld(['Yes', 'No']))).toEqual(outcomeRequired); // the flow with ANOTHER flow cause on the declared doing -> done edge: DC-5 still applies (the case line's and the table's mutant)
    expect(await evaluateEvent(dec(FLOW, 'done'), decisionWorld(['Yes', 'No']))).toEqual(outcomeRequired); // the flow with no cause on the declared edge
    const closing = decisionWorld(['Yes', 'No'], dec(FLOW, 'done', notTaken));
    expect(await evaluateEvent(by(FLOW, 'ticket.closed', { cause: notTaken }), closing)).toEqual({ refused: false });
    expect(await evaluateEvent(by(PERSON, 'ticket.closed', {}), closing)).toEqual(outcomeRequired); // control
    expect(await evaluateEvent(by(FLOW, 'ticket.closed', {}), closing)).toEqual(outcomeRequired); // the flow closing with no cause
    expect(await evaluateEvent(dec(FLOW, 'done', notTaken), decisionWorld(['Yes', 'No'], by(PERSON, 'ticket.decided', { outcome: 'Yes' })))).toEqual({ refused: false }); // control: an outcome never needed the exemption
    // the exemption trusts only a cause the forgery guard has already proved: a PERSON's "Not taken" hears cause.forged
    // at both doors, never the exemption's accept
    expect(await evaluateEvent(dec(PERSON, 'done', notTaken), decisionWorld(['Yes', 'No']))).toEqual({ refused: true, rule: 'cause.forged', reason: FORGED });
    expect(await evaluateEvent(by(PERSON, 'ticket.closed', { cause: notTaken }), closing)).toEqual({ refused: true, rule: 'cause.forged', reason: FORGED });
  });
});
