import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DECISION_TYPE_ID,
  newUlid,
  planSettle,
  SYSTEM_ACTOR_FLOW,
  type SettleBlockReason,
  type SettlePlan,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable.js';
import { createFlowPromoter, FLOW_SERVER_CAP } from '../../src/flow/promote.js';
import { readFlow } from '../../src/flow/read-flow.js';
import { createFlowSettler } from '../../src/flow/settle.js';
import {
  cascadeBlockedReason,
  makeDecisionGates,
  RULE_DECISION_BAD_CLOSE_STARTED,
  RULE_DECISION_CASCADE_BLOCKED,
} from '../../src/gates/index.js';
import type { AtomicOutcome } from '../../src/ingest/ingest-service.js';
import type { CanSeeFn } from '../../src/notifications/fanout.js';
import { keysForAncestors } from '../../src/read/ancestry.js';
import { canSee } from '../../src/visibility/can-see.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMember, seedProject } from '../helpers/seed.js';
import {
  addTicket, decide, fanIn, gatedIngest, lead, ledger, loopWorld, PERSON, PROJECT, PROJECT2, seedFlowWorld, seedSecondWorkspace, stateOf, WS, WS2,
} from '../flow/flow-world.js';

/**
 * wtg2 T16 (spec PS-9): the two Decision refusals the engine cannot make, because it cannot see a whole flow. Three
 * `ServerGate`s: `decision.bad-close-started` on a `ticket.decided` whose `closeStarted` names a ticket outside this
 * Decision's flow, and `decision.cascade-blocked` on a person's `ticket.decided` and on a Decision's own finishing
 * transition when the cascade that choice would file is blocked. Each returns `null` at once for the Flow actor (the
 * cascade and the promoter file through the same gated door), then makes its cheap type test, and only then reads.
 *
 * ## The world
 *
 * `flow-world.ts`, one database per case, plus a founded workspace and project so a ticket has a key, and PERSON a
 * workspace owner so the REAL `canSee` answers yes for them (OUTSIDER holds no membership and answers no). The gates are
 * called directly with an injected plan where a case needs a block the real planner would not produce; (g) goes through
 * the real gated door with the real planner.
 */

const OUTSIDER = '01J9GXTSDR0000000000000000';
let db: TestDatabase;
let logs: string[];
beforeEach(async () => {
  resetEntitySeqs();
  db = await createTestDatabase();
  await seedFlowWorld(db.pool);
  await applyCommitted(db.pool, [
    makeCommitted({ workspaceId: WS, actorId: PERSON, entity: { kind: 'workspace', id: WS }, type: 'workspace.created', payload: { name: 'Flow Works' } }),
  ]);
  await seedProject(db.pool, WS, PROJECT, 'Flow');
  await seedMember(db.pool, WS, PERSON, 'owner');
  logs = [];
});
afterEach(async () => {
  await db.drop();
});

const sub = (ticketId: string, type: string, payload: Record<string, unknown>, actorId = PERSON, workspaceId = WS): SubmittedEvent => ({
  id: newUlid(), workspaceId, entity: { kind: 'ticket', id: ticketId }, type, version: 1, payload, actorId, origin: 'web', clientTime: new Date().toISOString(),
});
const blockedPlan = (ticketId: string, reason: SettleBlockReason = 'parent-finished') => (): SettlePlan => ({ steps: [], blocked: { ticketId, reason }, started: [], touchesOthers: false });
const clearPlan = (): SettlePlan => ({ steps: [], blocked: null, started: [], touchesOthers: false });
const yes = async () => true;
const no = async () => false;
/** A pool that counts its statements. */
const counted = (n: { v: number }): Queryable =>
  ({ query: (...a: Parameters<typeof db.pool.query>) => { n.v += 1; return db.pool.query(...a); } }) as unknown as Queryable;
async function keyOf(ticketId: string, workspaceId = WS, projectId = PROJECT): Promise<string> {
  const key = (await keysForAncestors(db.pool, workspaceId, [{ ticketId, projectId }])).get(ticketId);
  expect(key).toMatch(/^[A-Z]+-[0-9]+$/); // precondition: a real key, so "names it" and "does not name it" can both fail
  return key!;
}
/** A Decision `d` with one branch `d -[Ship]-> z` (z in the Backlog); `finished` puts d in Done, `stored` files the choice Ship. */
async function shipWorld(o: { finished: boolean; stored: boolean; zTitle?: string; workspaceId?: string }) {
  const ws = o.workspaceId ?? WS;
  const d = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: o.finished ? ['doing', 'done'] : ['doing'], workspaceId: ws });
  const z = await addTicket(db.pool, { ...(o.zTitle === undefined ? {} : { title: o.zTitle }), workspaceId: ws });
  await lead(db.pool, d, z, 'Ship', ws);
  if (o.stored) await decide(db.pool, d, 'Ship', {}, ws);
  return { d, z };
}
const PARENT_FINISHED = (name: string) => `This choice cannot be applied: ${name} would move back under a finished parent.`;
const HIDDEN = 'This choice cannot be applied: a step you cannot see is blocking it.';

describe('29.370 the Decision gates', () => {
  it('29.370 (a) the cascade gate refuses a finishing transition whose stored choice is blocked; control: an applicable plan, a move that does not finish, no stored choice', async () => {
    const { d, z } = await shipWorld({ finished: false, stored: true, zTitle: 'Ship it' });
    const zKey = await keyOf(z);
    const gates = makeDecisionGates({ plan: blockedPlan(z), canSeeTicket: yes });
    expect(gates.map((g) => g.eventType)).toEqual(['ticket.decided', 'ticket.decided', 'ticket.transitioned']);
    const gate = gates[2]!;
    expect(await gate.check(sub(d, 'ticket.transitioned', { to: 'done' }), db.pool)).toEqual({ rule: RULE_DECISION_CASCADE_BLOCKED, reason: PARENT_FINISHED(`${zKey} Ship it`) });
    expect(RULE_DECISION_CASCADE_BLOCKED).toBe('decision.cascade-blocked');
    // controls in the same world
    expect(await makeDecisionGates({ plan: clearPlan, canSeeTicket: yes })[2]!.check(sub(d, 'ticket.transitioned', { to: 'done' }), db.pool)).toBeNull();
    expect(await gate.check(sub(d, 'ticket.transitioned', { to: 'todo' }), db.pool)).toBeNull();
    expect(await gate.check(sub(d, 'ticket.transitioned', {}), db.pool)).toBeNull();
    expect(await gate.check(sub(newUlid(), 'ticket.transitioned', { to: 'done' }), db.pool)).toBeNull(); // no such ticket
    expect(await gates[1]!.check(sub(newUlid(), 'ticket.decided', { outcome: 'Ship' }), db.pool)).toBeNull(); // nor for a choice
    // finishing with no choice made settles nothing (TicketState.outcome is ABSENT until the first choice)
    const bare = await shipWorld({ finished: false, stored: false });
    expect(await makeDecisionGates({ plan: blockedPlan(bare.z), canSeeTicket: yes })[2]!.check(sub(bare.d, 'ticket.transitioned', { to: 'done' }), db.pool)).toBeNull();
  });

  it('29.370 (a) in a second workspace every read is the event\'s workspace: its ticket, its workflow, its flow, its key', async () => {
    await seedSecondWorkspace(db.pool);
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: WS2, actorId: PERSON, entity: { kind: 'workspace', id: WS2 }, type: 'workspace.created', payload: { name: 'Second Works' } }),
    ]);
    await seedProject(db.pool, WS2, PROJECT2, 'Second');
    await seedMember(db.pool, WS2, PERSON, 'owner');
    const { d, z } = await shipWorld({ finished: false, stored: true, zTitle: 'Ship it', workspaceId: WS2 });
    const zKey = await keyOf(z, WS2, PROJECT2);
    const seen: string[][] = [];
    const recorder = (input: Parameters<typeof planSettle>[0]): SettlePlan => {
      seen.push(input.nodes.map((n) => n.id).sort());
      return blockedPlan(z)();
    };
    const gates = makeDecisionGates({ plan: recorder, canSeeTicket: yes });
    const refusal = { rule: RULE_DECISION_CASCADE_BLOCKED, reason: PARENT_FINISHED(`${zKey} Ship it`) };
    expect(await gates[2]!.check(sub(d, 'ticket.transitioned', { to: 'done' }, PERSON, WS2), db.pool)).toEqual(refusal);
    expect(await gates[1]!.check(sub(d, 'ticket.decided', { outcome: 'Ship' }, PERSON, WS2), db.pool)).toEqual(refusal);
    expect(seen).toEqual([[d, z].sort(), [d, z].sort()]);
    // the close list is judged against this workspace's flow; control: a ticket of the first workspace is outside it
    expect(await gates[0]!.check(sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: [z, d] }, PERSON, WS2), db.pool)).toBeNull();
    const elsewhere = await addTicket(db.pool);
    expect((await gates[0]!.check(sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: [z, elsewhere] }, PERSON, WS2), db.pool))?.rule).toBe(RULE_DECISION_BAD_CLOSE_STARTED);
  });

  it('29.370 (b) the cascade gate refuses a choice whose cascade is blocked, planned with the claimed outcome; a clear and an applicable plan pass', async () => {
    const { d, z } = await shipWorld({ finished: true, stored: false, zTitle: 'Ship it' });
    const zKey = await keyOf(z);
    const seen: Array<{ outcome: string | null; category: string } | undefined> = [];
    const recorder = vi.fn((input: Parameters<typeof planSettle>[0]) => {
      const n = input.nodes.find((x) => x.id === d);
      seen.push(n === undefined ? undefined : { outcome: n.outcome, category: n.category });
      return blockedPlan(z)();
    });
    const gate = makeDecisionGates({ plan: recorder, canSeeTicket: yes })[1]!;
    expect(gate.eventType).toBe('ticket.decided');
    expect(await gate.check(sub(d, 'ticket.decided', { outcome: 'Ship' }), db.pool)).toEqual({ rule: RULE_DECISION_CASCADE_BLOCKED, reason: PARENT_FINISHED(`${zKey} Ship it`) });
    // only the gate's patch can put Ship on the node: nothing is stored
    expect(seen).toEqual([{ outcome: 'Ship', category: 'terminal' }]);
    expect(recorder.mock.calls[0]![0].decisionId).toBe(d);
    // a clear, and a payload with no outcome, plan nothing to refuse
    expect(await gate.check(sub(d, 'ticket.decided', { outcome: null }), db.pool)).toBeNull();
    expect(await gate.check(sub(d, 'ticket.decided', {}), db.pool)).toBeNull();
    expect(recorder).toHaveBeenCalledTimes(1);
    // control: the same choice with an applicable plan
    expect(await makeDecisionGates({ plan: clearPlan, canSeeTicket: yes })[1]!.check(sub(d, 'ticket.decided', { outcome: 'Ship' }), db.pool)).toBeNull();
    // closeStarted reaches the planner (from the claim)
    const withList = vi.fn((_input: Parameters<typeof planSettle>[0]) => clearPlan());
    await makeDecisionGates({ plan: withList, canSeeTicket: yes })[1]!.check(sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: [z] }), db.pool);
    expect(withList.mock.calls[0]![0].closeStarted).toEqual([z]);
  });

  it('29.370 (b) a choice made on a Decision still in Doing is judged as if it finished now (planner ruling 2026-10-06): blocked today → refused; control: unblocked, it commits and nothing moves', async () => {
    const { d, z } = await shipWorld({ finished: false, stored: false, zTitle: 'Ship it' });
    const zKey = await keyOf(z);
    const refusing = gatedIngest(db.pool, makeDecisionGates({ plan: blockedPlan(z), canSeeTicket: yes }));
    const [refused] = await refusing.ingestBatch([sub(d, 'ticket.decided', { outcome: 'Ship' })]);
    expect(refused).toMatchObject({ status: 'refused', rule: RULE_DECISION_CASCADE_BLOCKED, reason: PARENT_FINISHED(`${zKey} Ship it`) });
    // control: the real gates and the real planner; the choice commits and still waits for the finish (planSettle, settle.ts:67)
    const ingest = gatedIngest(db.pool);
    const atomic = vi.fn(async (events: SubmittedEvent[]): Promise<AtomicOutcome> => ingest.ingestAtomic(events));
    const settler = createFlowSettler({ pool: db.pool, ingest: { ingestAtomic: atomic }, log: (m) => logs.push(m) });
    const pending: Promise<void>[] = [];
    ingest.onEventCommitted((e) => {
      pending.push(settler.onCommitted(e));
    });
    const choice = sub(d, 'ticket.decided', { outcome: 'Ship' });
    const [committed] = await ingest.ingestBatch([choice]);
    expect(committed).toMatchObject({ status: 'committed', eventId: choice.id });
    await Promise.all(pending);
    expect(pending).toHaveLength(1); // the listener saw the choice
    expect(atomic).not.toHaveBeenCalled();
    expect([await stateOf(db.pool, d), await stateOf(db.pool, z)]).toEqual(['doing', 'backlog']);
  });

  it('29.370 (c) the transition gate plans with the Decision patched to the claimed terminal state', async () => {
    const { d, z } = await shipWorld({ finished: false, stored: true });
    expect(await stateOf(db.pool, d)).toBe('doing'); // precondition: stored state is not terminal
    const seen: Array<{ outcome: string | null; category: string } | undefined> = [];
    const recorder = (input: Parameters<typeof planSettle>[0]): SettlePlan => {
      const n = input.nodes.find((x) => x.id === d);
      seen.push(n === undefined ? undefined : { outcome: n.outcome, category: n.category });
      return blockedPlan(z)();
    };
    await makeDecisionGates({ plan: recorder, canSeeTicket: yes })[2]!.check(sub(d, 'ticket.transitioned', { to: 'done' }), db.pool);
    expect(seen).toEqual([{ outcome: 'Ship', category: 'terminal' }]);
  });

  it('29.370 (c) the transition gate plans with the close list of the LATEST stored choice', async () => {
    const { d } = await shipWorld({ finished: false, stored: false });
    const y = await addTicket(db.pool, { start: 'focus', moves: ['doing'] });
    await lead(db.pool, d, y, 'Drop');
    await decide(db.pool, d, 'Drop');
    await decide(db.pool, d, 'Ship', { closeStarted: [y] });
    const withList = vi.fn((_input: Parameters<typeof planSettle>[0]) => clearPlan());
    expect(await makeDecisionGates({ plan: withList, canSeeTicket: yes })[2]!.check(sub(d, 'ticket.transitioned', { to: 'done' }), db.pool)).toBeNull();
    expect(withList.mock.calls.map(([input]) => [input.decisionId, input.closeStarted])).toEqual([[d, [y]]]);
  });

  it('29.370 (d) a blocker is named only to a viewer who can see it (the injected and the real canSee); every code reads as a sentence, never the raw code', async () => {
    const { d, z } = await shipWorld({ finished: false, stored: true, zTitle: 'Secret title' });
    const zKey = await keyOf(z);
    const refuse = (canSeeTicket: CanSeeFn | undefined, actorId = PERSON) =>
      makeDecisionGates({ plan: blockedPlan(z, 'parent-finished'), ...(canSeeTicket === undefined ? {} : { canSeeTicket }) })[2]!.check(sub(d, 'ticket.transitioned', { to: 'done' }, actorId), db.pool);
    const hidden = await refuse(no);
    expect(hidden).toEqual({ rule: RULE_DECISION_CASCADE_BLOCKED, reason: HIDDEN });
    expect(hidden!.reason).not.toContain(zKey);
    expect(hidden!.reason).not.toContain('Secret title');
    const shown = await refuse(yes);
    expect(shown).toEqual({ rule: RULE_DECISION_CASCADE_BLOCKED, reason: PARENT_FINISHED(`${zKey} Secret title`) });
    expect(shown!.reason).not.toContain('parent-finished');
    // the REAL canSee (no injection): the owner sees it, an outsider does not
    expect([await canSee(db.pool, PERSON, z), await canSee(db.pool, OUTSIDER, z)]).toEqual([true, false]); // precondition
    expect(await refuse(undefined)).toEqual({ rule: RULE_DECISION_CASCADE_BLOCKED, reason: PARENT_FINISHED(`${zKey} Secret title`) });
    expect(await refuse(undefined, OUTSIDER)).toEqual({ rule: RULE_DECISION_CASCADE_BLOCKED, reason: HIDDEN });
    // a blocker with no row is never named either, even to a viewer the check lets through (unknown and invisible are one answer)
    expect(await makeDecisionGates({ plan: blockedPlan(newUlid()), canSeeTicket: yes })[2]!.check(sub(d, 'ticket.transitioned', { to: 'done' }), db.pool)).toEqual({
      rule: RULE_DECISION_CASCADE_BLOCKED, reason: HIDDEN,
    });
    // the four codes, each a sentence of its own
    const t = { key: 'GNFL-7', title: 'Pay the vendor' };
    expect((['parent-finished', 'child-open', 'outcome-has-no-branch', 'no-terminal-state'] as const).map((code) => cascadeBlockedReason(code, t))).toEqual([
      'GNFL-7 Pay the vendor would move back under a finished parent',
      'GNFL-7 Pay the vendor would be finished while a child of it stays open',
      'the outcome no longer has a branch (GNFL-7 Pay the vendor)',
      "GNFL-7 Pay the vendor's workflow has no finished state to close it in",
    ]);
    // a ticket without a key is named by its title alone
    expect(cascadeBlockedReason('child-open', { key: null, title: 'Pay the vendor' })).toBe('Pay the vendor would be finished while a child of it stays open');
  });

  it('29.370 (e) closeStarted must name only tickets of this flow; the refusal names no id', async () => {
    const { d, z } = await shipWorld({ finished: true, stored: false });
    const other = await addTicket(db.pool); // a real ticket, outside the flow
    const gate = makeDecisionGates({ plan: clearPlan, canSeeTicket: yes })[0]!;
    expect(gate.eventType).toBe('ticket.decided');
    // one id in the flow and one outside: `some` would pass this list, `every` refuses it
    const refused = await gate.check(sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: [z, other] }), db.pool);
    expect(refused).toEqual({ rule: RULE_DECISION_BAD_CLOSE_STARTED, reason: 'Some of the tickets chosen to close are not part of this flow.' });
    expect(RULE_DECISION_BAD_CLOSE_STARTED).toBe('decision.bad-close-started');
    for (const id of [z, other, d]) expect(refused!.reason).not.toContain(id);
    // controls: every id in the flow (the Decision itself is in it), an empty list, none, and a non-string entry ignored
    expect(await gate.check(sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: [z, d] }), db.pool)).toBeNull();
    expect(await gate.check(sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: [] }), db.pool)).toBeNull();
    expect(await gate.check(sub(d, 'ticket.decided', { outcome: 'Ship' }), db.pool)).toBeNull();
    expect(await gate.check(sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: [z, 42] }), db.pool)).toBeNull();
    // a flow too large to judge is not refused for it (both gates)
    const capped = makeDecisionGates({ plan: blockedPlan(z), canSeeTicket: yes, flowCap: 1 });
    expect(await capped[0]!.check(sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: [z, other] }), db.pool)).toBeNull();
    expect(await capped[1]!.check(sub(d, 'ticket.decided', { outcome: 'Ship' }), db.pool)).toBeNull();
    // control: the same capped gates at the default cap refuse
    const uncapped = makeDecisionGates({ plan: blockedPlan(z), canSeeTicket: yes });
    expect((await uncapped[0]!.check(sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: [z, other] }), db.pool))?.rule).toBe(RULE_DECISION_BAD_CLOSE_STARTED);
    expect((await uncapped[1]!.check(sub(d, 'ticket.decided', { outcome: 'Ship' }), db.pool))?.rule).toBe(RULE_DECISION_CASCADE_BLOCKED);
  });

  it('29.370 (e) the server cap (2000), not the read cap (300), bounds the flow both gates judge', async () => {
    const { d, z } = await shipWorld({ finished: true, stored: false });
    const other = await addTicket(db.pool);
    await fanIn(db.pool, d, 301);
    const read = (cap: number) => readFlow(db.pool, { workspaceId: WS, seedId: d, viewerId: null, cap });
    expect([(await read(FLOW_SERVER_CAP)).nodes.length, (await read(FLOW_SERVER_CAP)).truncated, (await read(300)).truncated]).toEqual([303, false, true]); // precondition
    const gates = makeDecisionGates({ plan: blockedPlan(z), canSeeTicket: yes });
    expect((await gates[0]!.check(sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: [z, other] }), db.pool))?.rule).toBe(RULE_DECISION_BAD_CLOSE_STARTED);
    expect((await gates[1]!.check(sub(d, 'ticket.decided', { outcome: 'Ship' }), db.pool))?.rule).toBe(RULE_DECISION_CASCADE_BLOCKED);
  });

  it('29.370 (f) a promotion, a cascade move and a choice with no close list pass without a single query; a non-Decision transition reads one row', async () => {
    const { d, z } = await shipWorld({ finished: false, stored: true });
    const gates = makeDecisionGates({ plan: blockedPlan(z), canSeeTicket: yes });
    const n = { v: 0 };
    for (const gate of gates) {
      expect(await gate.check(sub(d, 'ticket.transitioned', { to: 'done' }, SYSTEM_ACTOR_FLOW), counted(n))).toBeNull();
      expect(await gate.check(sub(d, 'ticket.decided', { outcome: 'Ship', closeStarted: ['x'] }, SYSTEM_ACTOR_FLOW), counted(n))).toBeNull();
    }
    expect(await gates[0]!.check(sub(d, 'ticket.decided', { outcome: 'Ship' }), counted(n))).toBeNull();
    expect(n.v).toBe(0);
    const task = await addTicket(db.pool, { start: 'focus', moves: ['doing'] });
    expect(await gates[2]!.check(sub(task, 'ticket.transitioned', { to: 'done' }), counted(n))).toBeNull();
    expect(n.v).toBe(1); // the ticket row, and no flow read: the cheap test comes first
    n.v = 0;
    expect(await gates[1]!.check(sub(task, 'ticket.decided', { outcome: 'Ship' }), counted(n))).toBeNull();
    expect(n.v).toBe(1);
    n.v = 0;
    expect(await gates[2]!.check(sub(d, 'ticket.transitioned', {}), counted(n))).toBeNull();
    expect(n.v).toBe(1); // a Decision's move with no target is answered from its row alone
    // control: the person's finishing transition of the Decision IS refused
    expect((await gates[2]!.check(sub(d, 'ticket.transitioned', { to: 'done' }), db.pool))?.rule).toBe(RULE_DECISION_CASCADE_BLOCKED);
  });

  it('29.370 (g) through the real gated door: a person\'s choice commits and its cascade commits too; an unrelated finishing transition commits', async () => {
    const { a, d } = await loopWorld(db.pool);
    const ingest = gatedIngest(db.pool);
    const atomic = vi.fn(async (events: SubmittedEvent[]): Promise<AtomicOutcome> => ingest.ingestAtomic(events));
    const settler = createFlowSettler({ pool: db.pool, ingest: { ingestAtomic: atomic }, log: (m) => logs.push(m) });
    const promoter = createFlowPromoter({ pool: db.pool, ingest: { ingestBatch: (e) => ingest.ingestBatch(e) }, log: (m) => logs.push(m) });
    const pending: Promise<unknown>[] = [];
    ingest.onEventCommitted((e) => {
      pending.push(settler.onCommitted(e), promoter.onCommitted(e));
    });
    const [choice] = await ingest.ingestBatch([sub(d, 'ticket.decided', { outcome: 'Redo' })]);
    expect(choice).toMatchObject({ status: 'committed' });
    await vi.waitFor(async () => expect((await ledger(db.pool, a, 'ticket.transitioned')).map((e) => (e.payload.cause as { kind?: string } | undefined)?.kind)).toContain('reopened-by-flow'), { timeout: 5000 });
    while (pending.length > 0) await Promise.all(pending.splice(0));
    expect(atomic).toHaveBeenCalledTimes(1);
    expect([await stateOf(db.pool, a), await stateOf(db.pool, d)]).toEqual(['todo', 'backlog']);
    expect(logs).toEqual([]);
    // control: a person's own finishing transition of an unrelated ticket commits through the same door
    const task = await addTicket(db.pool, { start: 'focus', moves: ['doing'] });
    const [finished] = await ingest.ingestBatch([sub(task, 'ticket.transitioned', { to: 'done' })]);
    expect(finished).toMatchObject({ status: 'committed' });
    while (pending.length > 0) await Promise.all(pending.splice(0));
    expect(await stateOf(db.pool, task)).toBe('done');
  });
});
