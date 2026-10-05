import { describe, expect, it } from 'vitest';
import { DECISION_TYPE_ID, makeEnvelope, SYSTEM_ACTOR_FLOW, type EventEnvelope, type TicketTypeDef } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { checkTicketClosed } from '../src/checks/close.js';
import { checkTicketDecided, decisionOutcomeRequired } from '../src/checks/decision.js';
import { evaluateEvent } from '../src/evaluate.js';
import { AUTHOR, PROJECT, TASK, WF, WS, created, draftCreated, onTicket, typeDefined } from '../src/checks/test-support.js';

/**
 * wtg2 T6 (spec DC-4, DC-5): `ticket.decided`'s engine checks and the close rule at the transition and close doors.
 * `WF` declares `* -> done`, so a move to Done is legal from any authored state and the cases reach the terminal block.
 */

const D = '01J9GDEC000000000000000000';
const NEXT = '01J9GNXT000000000000000001';
const NEXT2 = '01J9GNXT000000000000000002';
const DRAFT = '01J9GDRF000000000000000000';
const DECISION: TicketTypeDef = { id: DECISION_TYPE_ID, name: 'Decision', icon: 'diamond', rank: 3, workflowId: 'wf-basic', fields: [] };
const on = (id: string, type: string, payload: unknown): EventEnvelope =>
  makeEnvelope({ type, entity: { kind: 'ticket', id }, workspaceId: WS, payload });
const leadsTo = (label: string | undefined, target = NEXT, kind = 'leads_to') =>
  on(D, 'ticket.link_added', { kind, targetId: target, ...(label === undefined ? {} : { label }) });
const decided = (outcome: string | null, from?: string | null) =>
  on(D, 'ticket.decided', { outcome, ...(from === undefined ? {} : { from }) });
const move = (to: string) => on(D, 'ticket.transitioned', { to });
const close = () => on(D, 'ticket.closed', {});
/** A Decision with the named branches, then any later history. */
const world = (labels: string[], ...after: EventEnvelope[]) =>
  buildMemoryContext([WF], [typeDefined(TASK), typeDefined(DECISION), created(D, DECISION_TYPE_ID, null, PROJECT), created(NEXT, 'task', null, PROJECT), created(NEXT2, 'task', null, PROJECT),
    ...labels.map((label, i) => leadsTo(label, i === 0 ? NEXT : NEXT2)), ...after]);
/**
 * A DRAFT Decision whose list holds an INCOMING draft-side entry (drafts R42: a link into a draft is filed on the draft's
 * own stream with `from` naming the source), started into To do. `own` adds an outgoing branch of its own.
 */
const draftWorld = (own: boolean, ...after: EventEnvelope[]) =>
  buildMemoryContext([WF], [typeDefined(TASK), typeDefined(DECISION), created(NEXT, 'task', null, PROJECT), created(NEXT2, 'task', null, PROJECT),
    draftCreated(DRAFT, DECISION_TYPE_ID, null),
    onTicket(DRAFT, 'ticket.link_added', { kind: 'leads_to', targetId: DRAFT, from: NEXT, label: 'Yes' }),
    ...(own ? [onTicket(DRAFT, 'ticket.link_added', { kind: 'leads_to', targetId: NEXT2, label: 'Go' })] : []),
    onTicket(DRAFT, 'ticket.transitioned', { to: 'todo' }), ...after]);

describe('29.138 checkTicketDecided: whose it is to judge', () => {
  it('29.138 refuses a Task, an unknown ticket, a misfiled kind and a bad payload; a Decision passes; evaluateEvent reaches it', async () => {
    expect(await checkTicketDecided(decided('Yes'), world(['Yes', 'No']))).toEqual({ refused: false });
    const task = on(NEXT, 'ticket.decided', { outcome: 'Yes' });
    expect(await checkTicketDecided(task, world(['Yes', 'No']))).toEqual({ refused: true, rule: 'decision.not-a-decision', reason: 'This ticket is not a Decision, so it has no outcome to choose.' });
    expect(await checkTicketDecided(on('01J9GGHO000000000000000000', 'ticket.decided', { outcome: 'Yes' }), world([]))).toEqual({ refused: true, rule: 'unknown-ticket', reason: 'This event records a decision on ticket 01J9GGHO000000000000000000, but no such ticket is known.' });
    const note = makeEnvelope({ type: 'ticket.decided', entity: { kind: 'note', id: D }, workspaceId: WS, payload: { outcome: 'Yes' } });
    expect(await checkTicketDecided(note, world([]))).toEqual({ refused: true, rule: 'malformed-payload', reason: 'This ticket.decided event does not point at a ticket; it points at a note.' });
    const bad = await checkTicketDecided(on(D, 'ticket.decided', {}), world([]));
    expect(bad).toMatchObject({ refused: true, rule: 'malformed-payload' });
    expect(bad.refused && bad.reason.startsWith("This ticket.decided event's payload is malformed: at outcome")).toBe(true);
    expect(await evaluateEvent(task, world(['Yes']))).toMatchObject({ rule: 'decision.not-a-decision' }); // dispatch
    expect(await evaluateEvent(decided('Yes'), world(['Yes']))).toEqual({ refused: false });
    // a stranger's event type is not this check's to judge
    expect(await checkTicketDecided(move('done'), world(['Yes']))).toEqual({ refused: false });
  });
});

describe('29.139 the outcome rules', () => {
  it('29.139 unknown label (listed, or "no outcomes yet"), fold-insensitive match, same, stale and clear', async () => {
    expect(await checkTicketDecided(decided('Maybe'), world(['Yes', 'No']))).toEqual({ refused: true, rule: 'decision.unknown-outcome', reason: '"Maybe" is not one of this decision\'s outcomes: "Yes", "No".' });
    expect(await checkTicketDecided(decided('Yes'), world([]))).toEqual({ refused: true, rule: 'decision.unknown-outcome', reason: 'This decision has no outcomes yet. Link it to the next steps, with a label on each, first.' });
    // a blocks link is not a branch, even with a label-shaped neighbour
    expect(await checkTicketDecided(decided('Yes'), world([], on(D, 'ticket.link_added', { kind: 'blocks', targetId: NEXT })))).toMatchObject({ rule: 'decision.unknown-outcome' });
    expect(await checkTicketDecided(decided('  yes '), world(['Yes', 'No']))).toEqual({ refused: false }); // control: trim and case fold
    const yes = world(['Yes', 'No'], decided('Yes'));
    expect(await checkTicketDecided(decided('yes', 'Yes'), yes)).toEqual({ refused: true, rule: 'decision.same-outcome', reason: 'The decision is already Yes.' });
    expect(await checkTicketDecided(decided('No'), yes)).toEqual({ refused: true, rule: 'decision.stale-from', reason: 'The decision changed to Yes since you looked.' });
    expect(await checkTicketDecided(decided('No', 'Maybe'), yes)).toMatchObject({ rule: 'decision.stale-from' });
    // order: stale-from is judged BEFORE the label (an unknown label AND a stale `from`); every other leg has only one fault
    expect(await checkTicketDecided(decided('Maybe'), yes)).toEqual({ refused: true, rule: 'decision.stale-from', reason: 'The decision changed to Yes since you looked.' });
    expect(await checkTicketDecided(decided('No', 'Yes'), yes)).toEqual({ refused: false }); // control: the right `from`
    expect(await checkTicketDecided(decided('No', ' yes'), yes)).toEqual({ refused: false }); // `from` is folded too
    expect(await checkTicketDecided(decided(null, 'Yes'), yes)).toEqual({ refused: false });
    expect(await checkTicketDecided(decided(null), yes)).toMatchObject({ rule: 'decision.stale-from' });
    const cleared = world(['Yes', 'No'], decided('Yes'), decided(null, 'Yes'));
    expect(await checkTicketDecided(decided(null, null), cleared)).toEqual({ refused: true, rule: 'decision.same-outcome', reason: 'There is no decision to clear.' });
    expect(await checkTicketDecided(decided('Yes', 'Yes'), cleared)).toEqual({ refused: true, rule: 'decision.stale-from', reason: 'The decision was cleared since you looked.' });
    expect(await checkTicketDecided(decided('Yes'), cleared)).toEqual({ refused: false }); // a choice after a clear sends no `from`
    expect(await checkTicketDecided(decided('No', 'Yes'), world(['Yes', 'No'], decided('Yes'), move('done')))).toEqual({ refused: false }); // PS-6: a terminal Decision may be re-decided
    // pass 2: the flow's loop reset releases the outcome (29.206), so the next choice is a FIRST choice again (no `from`)
    const reset = makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: D }, workspaceId: WS, actorId: SYSTEM_ACTOR_FLOW,
      payload: { to: 'todo', cause: { kind: 'reopened-by-flow', decisionTicketId: NEXT2, outcome: 'Back', pass: 1, decidedBy: AUTHOR, decisionEventId: '01J9GEVT000000000000000001' } } });
    const pass2 = world(['Yes', 'No'], decided('Yes'), move('done'), reset);
    expect(await checkTicketDecided(decided('No'), pass2)).toEqual({ refused: false });
    expect(await checkTicketDecided(decided('No', 'Yes'), pass2)).toEqual({ refused: true, rule: 'decision.stale-from', reason: 'The decision was cleared since you looked.' });
    // an INCOMING draft-side entry is not an outcome: only the Decision's own outgoing branches are
    expect(await checkTicketDecided(onTicket(DRAFT, 'ticket.decided', { outcome: 'Yes' }), draftWorld(false))).toEqual({ refused: true, rule: 'decision.unknown-outcome', reason: 'This decision has no outcomes yet. Link it to the next steps, with a label on each, first.' });
    expect(await checkTicketDecided(onTicket(DRAFT, 'ticket.decided', { outcome: 'Go' }), draftWorld(true))).toEqual({ refused: false }); // control: its own branch
  });
});

describe('29.140 DC-5: no finishing without an outcome', () => {
  it('29.140 the transition door and the close door refuse; the controls finish freely; an open child is reported first', async () => {
    const outcomeRequired = { refused: true, rule: 'decision.outcome-required', reason: 'Choose an outcome before finishing this decision.' };
    expect(await evaluateEvent(move('done'), world(['Yes', 'No']))).toEqual(outcomeRequired);
    expect(await checkTicketClosed(close(), world(['Yes', 'No'], move('done')))).toEqual(outcomeRequired);
    // controls, same it(): each finishes freely
    expect(await evaluateEvent(move('done'), world(['Yes', 'No'], decided('Yes')))).toEqual({ refused: false });
    expect(await evaluateEvent(move('done'), world([], on(D, 'ticket.link_added', { kind: 'blocks', targetId: NEXT })))).toEqual({ refused: false });
    expect(await evaluateEvent(move('doing'), world(['Yes', 'No']))).toEqual({ refused: false });
    expect(await checkTicketClosed(close(), world(['Yes'], decided('Yes'), move('done')))).toEqual({ refused: false });
    expect(await checkTicketClosed(close(), world([], move('done')))).toEqual({ refused: false }); // no branches: closes freely
    // the branch need not be the first link: a blocks link ahead of it does not hide it
    expect(await evaluateEvent(move('done'), world([], on(D, 'ticket.link_added', { kind: 'blocks', targetId: NEXT2 }), leadsTo('Yes')))).toEqual(outcomeRequired);
    // a TASK with an outgoing leads_to and no outcome: NEXT gets its own branch (D's link is outgoing from D, not from NEXT)
    const taskWithBranch = on(NEXT, 'ticket.transitioned', { to: 'done' });
    expect(await evaluateEvent(taskWithBranch, world(['Yes'], on(NEXT, 'ticket.link_added', { kind: 'leads_to', targetId: NEXT2 })))).toEqual({ refused: false });
    // a cleared decision is outcome-less again
    expect(await evaluateEvent(move('done'), world(['Yes'], decided('Yes'), decided(null, 'Yes')))).toEqual(outcomeRequired);
    // the parent-terminal invariant keeps its place in front
    const CHILD = '01J9GCHD000000000000000000'; // NEXT2 is already created by `world`
    const child = makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: CHILD }, workspaceId: WS, payload: { typeId: 'task', projectId: PROJECT, parentId: D, title: 'child' } });
    expect(await evaluateEvent(move('done'), world(['Yes'], child))).toMatchObject({ rule: 'parent-terminal-with-open-children' });
    expect(await checkTicketClosed(close(), world(['Yes'], move('done'), child))).toMatchObject({ rule: 'parent-terminal-with-open-children' });
  });
  it('29.140 the exemption parameter is off by default and lifts only the outcome rule', () => {
    const state = { kind: 'ticket', typeId: DECISION_TYPE_ID, links: [{ kind: 'leads_to', targetId: NEXT, label: 'Yes' }] } as never;
    expect(decisionOutcomeRequired(state)).toMatchObject({ rule: 'decision.outcome-required' });
    expect(decisionOutcomeRequired(state, true)).toBeNull();
    expect(decisionOutcomeRequired(state, false)).toMatchObject({ rule: 'decision.outcome-required' });
    // an INCOMING draft-side entry (`from`) is not a branch. Only the pure function meets one: the doors never do, because
    // the draft gate refuses every move and close of a draft first, and publishing drops those entries from the list.
    const incoming = { kind: 'ticket', typeId: DECISION_TYPE_ID, links: [{ kind: 'leads_to', targetId: NEXT, from: NEXT2, label: 'Yes' }] } as never;
    expect(decisionOutcomeRequired(incoming)).toBeNull();
  });
});
