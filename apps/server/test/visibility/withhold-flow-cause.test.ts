import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newSubmittedEvent, newUlid, SYSTEM_ACTOR_FLOW, type LedgerEvent, type TicketState } from '@gisik-nokma/domain';
import { getTicketStateFromDb } from '../../src/projections/tickets.js';
import { runSnapshotPass } from '../../src/sync/snapshot-writer.js';
import { visibleEventsFor } from '../../src/visibility/visible-events-for.js';
import { targetSight, withholdContest, withholdFlowCause, withholdState } from '../../src/visibility/withhold-link-targets.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * PTR wtg-flow-cause-withhold (planner 2026-10-06 03:37, rulings 03:49): a flow cause names a ticket (`sourceTicketId`,
 * `decisionTicketId`) and a person (`triggeredBy`, `decidedBy`); a viewer who cannot see that ticket is served the cause
 * with both NULLED, their keys kept (T17 AMEND 2's shape, `withholdCauseTicket`), at every door that serves one. The
 * hidden ticket's branch name goes with it (planner ruling 05:46): a withheld `led-to` cause has no `label` key and a
 * withheld Decision's cause no `outcome` key.
 *
 * ## The world
 *
 * `buildReadTestApp`'s scenario: the member sees SH (`sharedTaskId`), not H (`hiddenTaskId`, explicit owner only). Added
 * here: HS, a second ticket only the owner sees, and T, a ticket the member sees, which the flow closed as Not taken
 * because H (the Decision) went the other way, and later moved out of Backlog because HS finished (`led-to`). The
 * decider and the trigger are DEDICATED ids that appear nowhere else in the world, so a `not.toContain` on them can
 * only fail through a cause; so is each cause's branch name (its outcome or label). T2 is the member's control: closed
 * Not taken by SH, which the member can see. H and HS both lead to T, so the owner's flow read reaches them (the
 * member's walk meets two holes). TR (FIX 1) is a ticket the member sees that moved out of Backlog because SH finished
 * (a source the member sees: the control that keeps a label), was closed by the flow, and was then RESET because H
 * chose a loop branch. A flow reset files a `ticket.reopened` beside its transition, both carrying the
 * `reopened-by-flow` cause, so the reopen is served on its own; its decider (REOPENER) is dedicated too.
 *
 * ## Order is load-bearing
 *
 * `beforeAll` files the not-taken pair, runs a snapshot pass (the snapshot holds `closed.cause`), then files the
 * `led-to` move, TR's flow events and two contested claims carrying a forged cause (a close on T, a reset's reopen on
 * TR) as TAIL events, so both bootstraps serve all of them.
 */

let db: TestDatabase;
let world: ReadWorld;
let app: FastifyInstance;
let WS: string;
let SH: string;
let H: string;
let HS: string;
let T: string;
let T2: string;
let TR: string;
let owner: string;
let memberId: string;

const DECIDER = newUlid();
const TRIGGER = newUlid();
const SEEN_DECIDER = newUlid();
const SEEN_TRIGGER = newUlid();
const REOPENER = newUlid();
const DECISION_EVENT = newUlid();
const RESET_EVENT = newUlid();
// One branch name per cause, none a substring of another: a hidden ticket's goes with it (planner ruling 05:46).
const HIDDEN_OUTCOME = 'branch-H-closed-T';
const HIDDEN_LABEL = 'branch-HS-led-T';
const RESET_OUTCOME = 'branch-H-reset-TR';
const SEEN_OUTCOME = 'branch-SH-closed-T2';
const SEEN_LABEL = 'branch-SH-led-TR';

const notTaken = (decisionTicketId: string, decidedBy: string, outcome: string) =>
  ({ kind: 'branch-not-taken', decisionTicketId, outcome, pass: 1, decidedBy, decisionEventId: DECISION_EVENT }) as const;
const ledTo = (sourceTicketId: string, label: string, triggeredBy: string) => ({ kind: 'led-to', sourceTicketId, label, triggeredBy }) as const;
const reset = (decisionTicketId: string, decidedBy: string) =>
  ({ kind: 'reopened-by-flow', decisionTicketId, outcome: RESET_OUTCOME, pass: 1, decidedBy, decisionEventId: RESET_EVENT }) as const;
const FORGED_REASON = 'Only the flow can record that a ticket was led here, reopened or passed over by a decision.';

beforeAll(async () => {
  db = await createTestDatabase();
  world = await buildReadTestApp(db);
  app = world.app;
  WS = world.world.workspaceId;
  SH = world.world.sharedTaskId;
  H = world.world.hiddenTaskId;
  owner = world.userIds.owner;
  memberId = world.userIds.member;
  HS = newUlid();
  T = newUlid();
  T2 = newUlid();
  TR = newUlid();
  const projectId = world.world.projectId;
  const ws = { workspaceId: WS, actorId: owner };
  const flow = { workspaceId: WS, actorId: SYSTEM_ACTOR_FLOW };
  const created = (id: string, title: string) =>
    makeCommitted({ ...ws, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title } });
  // A person's claim carrying a flow cause, refused as forged and kept as a contest on the ticket's own stream.
  const forgedContest = (id: string, type: string, payload: unknown) =>
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'claim.contested',
      payload: {
        originalEvent: newSubmittedEvent({ workspaceId: WS, entity: { kind: 'ticket', id }, type, payload, actorId: owner, origin: 'web' }),
        rule: 'cause.forged',
        reason: FORGED_REASON,
      },
    });
  await applyCommitted(db.pool, [
    created(HS, 'Board approval — owner only'),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: HS }, type: 'visibility.set', payload: { ticketId: HS, mode: 'explicit', userIds: [owner] } }),
    created(T, 'Rework the pitch'),
    created(T2, 'Second pitch'),
    created(TR, 'Draft the brief'),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: H }, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: T, label: 'No' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: HS }, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: T } }),
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: T }, type: 'ticket.transitioned', payload: { to: 'done', cause: notTaken(H, DECIDER, HIDDEN_OUTCOME) } }),
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: T }, type: 'ticket.closed', payload: { cause: notTaken(H, DECIDER, HIDDEN_OUTCOME) } }),
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: T2 }, type: 'ticket.transitioned', payload: { to: 'done', cause: notTaken(SH, SEEN_DECIDER, SEEN_OUTCOME) } }),
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: T2 }, type: 'ticket.closed', payload: { cause: notTaken(SH, SEEN_DECIDER, SEEN_OUTCOME) } }),
  ]);
  await runSnapshotPass(db.pool, { minEvents: 1 });
  await applyCommitted(db.pool, [
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: T }, type: 'ticket.transitioned', payload: { to: 'doing', cause: ledTo(HS, HIDDEN_LABEL, TRIGGER) } }),
    forgedContest(T, 'ticket.closed', { cause: notTaken(H, DECIDER, HIDDEN_OUTCOME) }),
    // TR (FIX 1): led out of Backlog by SH, closed by the flow, then reset by H's loop branch, a reopen AND its transition.
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: TR }, type: 'ticket.transitioned', payload: { to: 'doing', cause: ledTo(SH, SEEN_LABEL, SEEN_TRIGGER) } }),
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: TR }, type: 'ticket.transitioned', payload: { to: 'done' } }),
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: TR }, type: 'ticket.closed', payload: {} }),
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: TR }, type: 'ticket.reopened', payload: { cause: reset(H, REOPENER) } }),
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: TR }, type: 'ticket.transitioned', payload: { to: 'todo', cause: reset(H, REOPENER) } }),
    forgedContest(TR, 'ticket.reopened', { cause: reset(H, REOPENER) }),
  ]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

const get = async (role: ReadRole, url: string) => {
  const res = await app.inject({ method: 'GET', url, headers: world.authOf(role) });
  expect(res.statusCode, url).toBe(200);
  return res;
};
type Cause = Record<string, unknown>;
type Detail = { ticketState: { closed: { actorId: string; cause?: Cause } | null } };
const detailOf = async (role: ReadRole, id: string) => (await get(role, `/v1/workspaces/${WS}/tickets/${id}`)).json() as Detail;
const streamOn = async (userId: string, id: string) => {
  const out: LedgerEvent[] = [];
  for await (const item of visibleEventsFor(db.pool, userId, WS, 0)) if ('entity' in item && item.entity.id === id) out.push(item as LedgerEvent);
  return out;
};
type Boot = { ticketId: string; snapshot: { seq: number; state: TicketState } | null; events: Array<{ type: string; payload: { cause?: Cause } }> };
const perTicketBoot = async (role: ReadRole, id: string = T) =>
  ((await get(role, `/v1/sync/bootstrap/ticket?workspaceId=${WS}&ticketId=${id}`)).json() as { ticket: Boot }).ticket;
const workspaceBoot = async (role: ReadRole, id: string = T) =>
  ((await get(role, `/v1/sync/bootstrap?workspaceId=${WS}`)).json() as { tickets: Boot[] }).tickets.find((t) => t.ticketId === id)!;
const causeOf = (e: { payload: unknown } | undefined) => (e?.payload as { cause?: Cause } | undefined)?.cause;
/** The keys themselves: an in-process object can carry `outcome: undefined`, which `toEqual` reads as absent. */
const keysOf = (c: unknown) => Object.keys((c ?? {}) as object).sort();
// Planner ruling 05:46: a withheld cause keeps no branch name, the KEY absent (never an empty string).
const WITHHELD_NOT_TAKEN = { kind: 'branch-not-taken', decisionTicketId: null, pass: 1, decidedBy: null, decisionEventId: DECISION_EVENT };
const WITHHELD_LED_TO = { kind: 'led-to', sourceTicketId: null, triggeredBy: null };
const WITHHELD_RESET = { kind: 'reopened-by-flow', decisionTicketId: null, pass: 1, decidedBy: null, decisionEventId: RESET_EVENT };
const DECISION_KEYS = ['decidedBy', 'decisionEventId', 'decisionTicketId', 'kind', 'pass'];
const LED_TO_KEYS = ['kind', 'sourceTicketId', 'triggeredBy'];

describe('wtg-flow-cause-withhold, the helper (29.445)', () => {
  it('29.445 a person\'s close, a reopened-for-child cause and a visible cause come back as the same reference; a hidden one keeps its kind, pass and decision event id, its ids and people nulled and its branch name gone', async () => {
    const member = targetSight(db.pool, memberId);
    // the hidden cause, nulled with its keys kept and only the keys its kind has; no outcome or label key (planner 05:46)
    const close = await withholdFlowCause(notTaken(H, DECIDER, HIDDEN_OUTCOME), member);
    expect(close).toEqual(WITHHELD_NOT_TAKEN);
    expect(keysOf(close)).toEqual(DECISION_KEYS);
    const led = await withholdFlowCause(ledTo(HS, HIDDEN_LABEL, TRIGGER), member);
    expect(led).toEqual(WITHHELD_LED_TO);
    expect(keysOf(led)).toEqual(LED_TO_KEYS);
    const resetCause = await withholdFlowCause(reset(H, REOPENER), member);
    expect(resetCause).toEqual(WITHHELD_RESET);
    expect(keysOf(resetCause)).toEqual(DECISION_KEYS);
    // controls: the same reference back, so a Decision or a source the member can see keeps its outcome or label
    const visible = notTaken(SH, SEEN_DECIDER, SEEN_OUTCOME);
    expect(await withholdFlowCause(visible, member)).toBe(visible);
    const visibleLed = ledTo(SH, SEEN_LABEL, SEEN_TRIGGER);
    expect(await withholdFlowCause(visibleLed, member)).toBe(visibleLed);
    const visibleReset = reset(SH, SEEN_DECIDER); // the reopened-by-flow arm's own control (planner 06:1x)
    expect(await withholdFlowCause(visibleReset, member)).toBe(visibleReset);
    const child = { kind: 'reopened-for-child', childTicketId: H };
    expect(await withholdFlowCause(child, member)).toBe(child); // not a flow cause: served whole, as it always was (29.207)
    expect(await withholdFlowCause(undefined, member)).toBeUndefined();
    const ownerSight = targetSight(db.pool, owner);
    const hidden = notTaken(H, DECIDER, HIDDEN_OUTCOME);
    expect(await withholdFlowCause(hidden, ownerSight)).toBe(hidden);

    // withholdState: the close cause, and nothing else of the state
    const stored = await getTicketStateFromDb(db.pool, WS, T);
    expect(stored?.closed?.cause).toEqual(notTaken(H, DECIDER, HIDDEN_OUTCOME)); // precondition: the projection holds the raw cause
    const served = await withholdState(stored!, member);
    expect(served.closed).toEqual({ ...stored!.closed, cause: WITHHELD_NOT_TAKEN });
    expect({ ...served, closed: null }).toEqual({ ...stored!, closed: null }); // every other member untouched
    expect(await withholdState(stored!, ownerSight)).toBe(stored); // control: the owner sees H
    const personClose = { ...stored!, closed: { actorId: owner, at: stored!.closed!.at } } as TicketState;
    expect(await withholdState(personClose, member)).toBe(personClose); // a person's close carries no cause
    const open = { ...stored!, closed: null } as TicketState;
    expect(await withholdState(open, member)).toBe(open);
    const seen = await getTicketStateFromDb(db.pool, WS, T2);
    expect(await withholdState(seen!, member)).toBe(seen); // its Decision (SH) is visible to the member
    const linked = { ...stored!, links: [{ kind: 'blocks', targetId: H }] } as TicketState;
    expect('links' in (await withholdState(linked, member))).toBe(false); // withholdLinks still runs

    // a contest of a forged-cause claim: its ids are withheld and its OWN rule and reason kept (not the link sentence)
    const contest = {
      rule: 'cause.forged',
      reason: FORGED_REASON,
      originalEvent: { type: 'ticket.closed', payload: { cause: notTaken(H, DECIDER, HIDDEN_OUTCOME) } },
    };
    const out = await withholdContest(contest, member);
    expect(out).toEqual({ ...contest, originalEvent: { type: 'ticket.closed', payload: { cause: WITHHELD_NOT_TAKEN } } });
    expect(await withholdContest(contest, ownerSight)).toBe(contest); // control
  });
});

describe('wtg-flow-cause-withhold, the doors (29.441–29.443)', () => {
  it('29.441 the REST detail serves the blind member the close cause with the Decision and its decider null and no outcome, kind and pass kept; control: the owner and a visible Decision keep the ids and the outcome', async () => {
    const member = await detailOf('member', T);
    expect(member.ticketState.closed?.cause).toEqual(WITHHELD_NOT_TAKEN);
    expect(member.ticketState.closed?.actorId).toBe(SYSTEM_ACTOR_FLOW);
    // control: the owner can see H
    expect((await detailOf('owner', T)).ticketState.closed?.cause).toEqual(notTaken(H, DECIDER, HIDDEN_OUTCOME));
    // control: the same member, a Decision they can see (its outcome kept)
    expect((await detailOf('member', T2)).ticketState.closed?.cause).toEqual(notTaken(SH, SEEN_DECIDER, SEEN_OUTCOME));
  });

  it('29.442 the stream and the snapshot serve the blind member a not-taken close, a led-to move and a flow reset nulled at their own seq, with no outcome or label key; control: the owner gets the ids, and a Decision or source the member can see keeps its outcome or label', async () => {
    const member = await streamOn(memberId, T);
    const ownerEnvs = await streamOn(owner, T);
    expect(member.map((e) => [e.seq, e.workspaceSeq])).toEqual(ownerEnvs.map((e) => [e.seq, e.workspaceSeq])); // no gap
    const of = (envs: LedgerEvent[], type: string) => causeOf(envs.find((e) => e.type === type && causeOf(e) !== undefined));
    expect(of(member, 'ticket.closed')).toEqual(WITHHELD_NOT_TAKEN);
    expect(keysOf(of(member, 'ticket.closed'))).toEqual(DECISION_KEYS); // the outcome KEY is gone, not undefined (planner 05:46)
    const transitions = (envs: LedgerEvent[]) => envs.filter((e) => e.type === 'ticket.transitioned').map(causeOf);
    expect(transitions(member)).toEqual([WITHHELD_NOT_TAKEN, WITHHELD_LED_TO]);
    expect(transitions(member).map(keysOf)).toEqual([DECISION_KEYS, LED_TO_KEYS]);
    expect(of(ownerEnvs, 'ticket.closed')).toEqual(notTaken(H, DECIDER, HIDDEN_OUTCOME)); // control
    expect(transitions(ownerEnvs)).toEqual([notTaken(H, DECIDER, HIDDEN_OUTCOME), ledTo(HS, HIDDEN_LABEL, TRIGGER)]);
    // control in the same it(): a Decision (SH, T2's close) and a source (SH, TR's move) the member can see keep the name
    expect(of(await streamOn(memberId, T2), 'ticket.closed')).toEqual(notTaken(SH, SEEN_DECIDER, SEEN_OUTCOME));
    const tr = await streamOn(memberId, TR);
    const trCauses = (kind: string) => tr.filter((e) => causeOf(e)?.['kind'] === kind).map((e) => [e.type, causeOf(e)]);
    expect(trCauses('led-to')).toEqual([['ticket.transitioned', ledTo(SH, SEEN_LABEL, SEEN_TRIGGER)]]);
    // FIX 1: the reset's reopen is served on its own, beside its transition, and both are withheld
    expect(trCauses('reopened-by-flow')).toEqual([['ticket.reopened', WITHHELD_RESET], ['ticket.transitioned', WITHHELD_RESET]]);
    expect(trCauses('reopened-by-flow').map(([, c]) => keysOf(c))).toEqual([DECISION_KEYS, DECISION_KEYS]);
    const ownerTr = (await streamOn(owner, TR)).filter((e) => causeOf(e)?.['kind'] === 'reopened-by-flow').map((e) => [e.type, causeOf(e)]);
    expect(ownerTr).toEqual([['ticket.reopened', reset(H, REOPENER)], ['ticket.transitioned', reset(H, REOPENER)]]); // control

    for (const [door, read] of [['per-ticket', perTicketBoot], ['workspace', workspaceBoot]] as const) {
      const boot = await read('member');
      expect(boot.snapshot, door).not.toBeNull(); // precondition: the close is in a snapshot
      expect(boot.snapshot!.state.closed?.cause, door).toEqual(WITHHELD_NOT_TAKEN);
      expect(causeOf(boot.events.find((e) => e.type === 'ticket.transitioned')), door).toEqual(WITHHELD_LED_TO); // the tail
      const ownerBoot = await read('owner');
      expect(ownerBoot.snapshot!.state.closed?.cause, door).toEqual(notTaken(H, DECIDER, HIDDEN_OUTCOME)); // control
      expect(causeOf(ownerBoot.events.find((e) => e.type === 'ticket.transitioned')), door).toEqual(ledTo(HS, HIDDEN_LABEL, TRIGGER));
    }
  });

  it('29.443 every door serves the blind member a body with no hidden ticket, no hidden person and no hidden branch name; control: the owner\'s bodies hold them', async () => {
    const body = async (role: ReadRole, url: string) => (await get(role, url)).body;
    const userOf = (role: ReadRole) => (role === 'owner' ? owner : memberId);
    const T_ALL = [H, HS, DECIDER, TRIGGER, HIDDEN_OUTCOME, HIDDEN_LABEL];
    const T_CLOSE = [H, DECIDER, HIDDEN_OUTCOME];
    const TR_RESET = [H, REOPENER, RESET_OUTCOME];
    const doors: Array<{ door: string; read: (role: ReadRole) => Promise<string>; holds: string[]; pending?: string[] }> = [
      { door: 'T detail', read: (r) => body(r, `/v1/workspaces/${WS}/tickets/${T}`), holds: T_CLOSE },
      { door: 'T /events', read: (r) => body(r, `/v1/workspaces/${WS}/tickets/${T}/events`), holds: T_ALL },
      { door: 'T stream', read: async (r) => JSON.stringify(await streamOn(userOf(r), T)), holds: T_ALL },
      { door: 'T bootstrap/ticket', read: async (r) => JSON.stringify(await perTicketBoot(r)), holds: T_ALL },
      { door: 'T bootstrap', read: async (r) => JSON.stringify(await workspaceBoot(r)), holds: T_ALL },
      { door: 'T history', read: (r) => body(r, `/v1/tickets/${T}/history`), holds: T_ALL },
      { door: 'T contests', read: (r) => body(r, `/v1/contests?workspaceId=${WS}&ticketId=${T}`), holds: T_CLOSE },
      // The flow read serves no person; the owner's walk reaches H and HS over their leads_to links. It still serves a
      // hidden Decision's outcome (its automatic moves and the node's resolution): a separate door, PENDING
      // wtg-automoves-outcome-withhold (planner ruling 05:46 (c)), so the outcomes are not asked of it here.
      { door: 'T flow', read: (r) => body(r, `/v1/workspaces/${WS}/tickets/${T}/flow`), holds: [H, HS], pending: [HIDDEN_OUTCOME, RESET_OUTCOME] },
      // FIX 1: TR's reset (a `ticket.reopened` and its transition) and the forged reopen's contest. TR is open again, so
      // its state carries no cause and its detail has nothing to withhold: T's detail is the state door.
      { door: 'TR /events', read: (r) => body(r, `/v1/workspaces/${WS}/tickets/${TR}/events`), holds: TR_RESET },
      { door: 'TR stream', read: async (r) => JSON.stringify(await streamOn(userOf(r), TR)), holds: TR_RESET },
      { door: 'TR bootstrap/ticket', read: async (r) => JSON.stringify(await perTicketBoot(r, TR)), holds: TR_RESET },
      { door: 'TR bootstrap', read: async (r) => JSON.stringify(await workspaceBoot(r, TR)), holds: TR_RESET },
      { door: 'TR history', read: (r) => body(r, `/v1/tickets/${TR}/history`), holds: TR_RESET },
      { door: 'TR contests', read: (r) => body(r, `/v1/contests?workspaceId=${WS}&ticketId=${TR}`), holds: TR_RESET },
    ];
    const hidden = [H, HS, DECIDER, TRIGGER, REOPENER, HIDDEN_OUTCOME, HIDDEN_LABEL, RESET_OUTCOME];
    for (const { door, read, holds, pending = [] } of doors) {
      const ownerBody = await read('owner');
      for (const id of holds) expect(ownerBody, `${door} owner holds ${id}`).toContain(id); // control: the haystack holds its subject
      const memberBody = await read('member');
      expect(memberBody.length, door).toBeGreaterThan(2); // precondition: a body, not an empty answer
      for (const id of hidden.filter((h) => !pending.includes(h))) expect(memberBody, `${door} member must not hold ${id}`).not.toContain(id);
    }
  });
});

describe('wtg-flow-cause-withhold, the ingest door (29.446)', () => {
  it('29.446 a cause with a null id is refused as an invalid payload on all three types; control: real ids pass the parse and meet cause.forged', async () => {
    const submit = async (type: string, payload: unknown) => {
      const event = newSubmittedEvent({ workspaceId: WS, entity: { kind: 'ticket', id: T2 }, type, payload, actorId: memberId, origin: 'web' });
      const res = await app.inject({ method: 'POST', url: '/v1/events', headers: world.authOf('member'), payload: { events: [event] } });
      return (res.json() as { results: Array<{ status: string; code?: string; rule?: string }> }).results[0];
    };
    for (const [type, payload] of [
      ['ticket.closed', { cause: WITHHELD_NOT_TAKEN }],
      ['ticket.transitioned', { to: 'doing', cause: WITHHELD_LED_TO }],
      ['ticket.reopened', { cause: WITHHELD_RESET }],
    ] as const) {
      expect(await submit(type, payload), type).toMatchObject({ status: 'invalid', code: 'invalid-payload' });
    }
    // control: the same close with real ids passes the payload parse and is refused by the flow's own rule
    const real = await submit('ticket.closed', { cause: notTaken(SH, SEEN_DECIDER, SEEN_OUTCOME) });
    expect(real?.status).not.toBe('invalid');
    expect(JSON.stringify(real)).toContain('cause.forged');
  });
});
