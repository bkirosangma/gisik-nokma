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
 * with both NULLED, their keys kept (T17 AMEND 2's shape, `withholdCauseTicket`), at every door that serves one.
 *
 * ## The world
 *
 * `buildReadTestApp`'s scenario: the member sees SH (`sharedTaskId`), not H (`hiddenTaskId`, explicit owner only). Added
 * here: HS, a second ticket only the owner sees, and T, a ticket the member sees, which the flow closed as Not taken
 * because H (the Decision) went the other way, and later moved out of Backlog because HS finished (`led-to`). The
 * decider and the trigger are DEDICATED ids that appear nowhere else in the world, so a `not.toContain` on them can
 * only fail through a cause. T2 is the member's control: closed Not taken by SH, which the member can see. H and HS
 * both lead to T, so the owner's flow read reaches them (the member's walk meets two holes).
 *
 * ## Order is load-bearing
 *
 * `beforeAll` files the not-taken pair, runs a snapshot pass (the snapshot holds `closed.cause`), then files the
 * `led-to` move as a TAIL event and a contested claim carrying a forged cause, so both bootstraps serve all of them.
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
let owner: string;
let memberId: string;

const DECIDER = newUlid();
const TRIGGER = newUlid();
const SEEN_DECIDER = newUlid();
const DECISION_EVENT = newUlid();

const notTaken = (decisionTicketId: string, decidedBy: string) =>
  ({ kind: 'branch-not-taken', decisionTicketId, outcome: 'No', pass: 1, decidedBy, decisionEventId: DECISION_EVENT }) as const;
const ledTo = (sourceTicketId: string) => ({ kind: 'led-to', sourceTicketId, label: 'Yes', triggeredBy: TRIGGER }) as const;
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
  const projectId = world.world.projectId;
  const ws = { workspaceId: WS, actorId: owner };
  const flow = { workspaceId: WS, actorId: SYSTEM_ACTOR_FLOW };
  const created = (id: string, title: string) =>
    makeCommitted({ ...ws, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title } });
  await applyCommitted(db.pool, [
    created(HS, 'Board approval — owner only'),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: HS }, type: 'visibility.set', payload: { ticketId: HS, mode: 'explicit', userIds: [owner] } }),
    created(T, 'Rework the pitch'),
    created(T2, 'Second pitch'),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: H }, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: T, label: 'No' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: HS }, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: T } }),
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: T }, type: 'ticket.transitioned', payload: { to: 'done', cause: notTaken(H, DECIDER) } }),
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: T }, type: 'ticket.closed', payload: { cause: notTaken(H, DECIDER) } }),
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: T2 }, type: 'ticket.transitioned', payload: { to: 'done', cause: notTaken(SH, SEEN_DECIDER) } }),
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: T2 }, type: 'ticket.closed', payload: { cause: notTaken(SH, SEEN_DECIDER) } }),
  ]);
  await runSnapshotPass(db.pool, { minEvents: 1 });
  await applyCommitted(db.pool, [
    makeCommitted({ ...flow, entity: { kind: 'ticket', id: T }, type: 'ticket.transitioned', payload: { to: 'doing', cause: ledTo(HS) } }),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: T },
      type: 'claim.contested',
      payload: {
        originalEvent: newSubmittedEvent({
          workspaceId: WS, entity: { kind: 'ticket', id: T }, type: 'ticket.closed', payload: { cause: notTaken(H, DECIDER) }, actorId: owner, origin: 'web',
        }),
        rule: 'cause.forged',
        reason: FORGED_REASON,
      },
    }),
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
const perTicketBoot = async (role: ReadRole) =>
  ((await get(role, `/v1/sync/bootstrap/ticket?workspaceId=${WS}&ticketId=${T}`)).json() as { ticket: Boot }).ticket;
const workspaceBoot = async (role: ReadRole) =>
  ((await get(role, `/v1/sync/bootstrap?workspaceId=${WS}`)).json() as { tickets: Boot[] }).tickets.find((t) => t.ticketId === T)!;
const causeOf = (e: { payload: unknown } | undefined) => (e?.payload as { cause?: Cause } | undefined)?.cause;
const WITHHELD_NOT_TAKEN = { kind: 'branch-not-taken', decisionTicketId: null, outcome: 'No', pass: 1, decidedBy: null, decisionEventId: DECISION_EVENT };
const WITHHELD_LED_TO = { kind: 'led-to', sourceTicketId: null, label: 'Yes', triggeredBy: null };

describe('wtg-flow-cause-withhold, the helper (29.445)', () => {
  it('29.445 a person\'s close, a reopened-for-child cause and a visible cause come back as the same reference; a hidden one keeps every member but the ids and people', async () => {
    const member = targetSight(db.pool, memberId);
    // the hidden cause, nulled with its keys kept and only the keys its kind has
    expect(await withholdFlowCause(notTaken(H, DECIDER), member)).toEqual(WITHHELD_NOT_TAKEN);
    const led = await withholdFlowCause(ledTo(HS), member);
    expect(led).toEqual(WITHHELD_LED_TO);
    expect(Object.keys(led as object).sort()).toEqual(['kind', 'label', 'sourceTicketId', 'triggeredBy']);
    // controls: the same reference back
    const visible = notTaken(SH, SEEN_DECIDER);
    expect(await withholdFlowCause(visible, member)).toBe(visible);
    const child = { kind: 'reopened-for-child', childTicketId: H };
    expect(await withholdFlowCause(child, member)).toBe(child); // not a flow cause: served whole, as it always was (29.207)
    expect(await withholdFlowCause(undefined, member)).toBeUndefined();
    const ownerSight = targetSight(db.pool, owner);
    const hidden = notTaken(H, DECIDER);
    expect(await withholdFlowCause(hidden, ownerSight)).toBe(hidden);

    // withholdState: the close cause, and nothing else of the state
    const stored = await getTicketStateFromDb(db.pool, WS, T);
    expect(stored?.closed?.cause).toEqual(notTaken(H, DECIDER)); // precondition: the projection holds the raw cause
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
      originalEvent: { type: 'ticket.closed', payload: { cause: notTaken(H, DECIDER) } },
    };
    const out = await withholdContest(contest, member);
    expect(out).toEqual({ ...contest, originalEvent: { type: 'ticket.closed', payload: { cause: WITHHELD_NOT_TAKEN } } });
    expect(await withholdContest(contest, ownerSight)).toBe(contest); // control
  });
});

describe('wtg-flow-cause-withhold, the doors (29.441–29.443)', () => {
  it('29.441 the REST detail serves the blind member the close cause with the Decision and its decider null, kind and outcome kept; control: the owner and a visible Decision keep the ids', async () => {
    const member = await detailOf('member', T);
    expect(member.ticketState.closed?.cause).toEqual(WITHHELD_NOT_TAKEN);
    expect(member.ticketState.closed?.actorId).toBe(SYSTEM_ACTOR_FLOW);
    // control: the owner can see H
    expect((await detailOf('owner', T)).ticketState.closed?.cause).toEqual(notTaken(H, DECIDER));
    // control: the same member, a Decision they can see
    expect((await detailOf('member', T2)).ticketState.closed?.cause).toEqual(notTaken(SH, SEEN_DECIDER));
  });

  it('29.442 the stream and the snapshot serve the blind member a not-taken close and a led-to move nulled at their own seq; control: the owner gets the ids', async () => {
    const member = await streamOn(memberId, T);
    const ownerEnvs = await streamOn(owner, T);
    expect(member.map((e) => [e.seq, e.workspaceSeq])).toEqual(ownerEnvs.map((e) => [e.seq, e.workspaceSeq])); // no gap
    const of = (envs: LedgerEvent[], type: string) => causeOf(envs.find((e) => e.type === type && causeOf(e) !== undefined));
    expect(of(member, 'ticket.closed')).toEqual(WITHHELD_NOT_TAKEN);
    expect(member.filter((e) => e.type === 'ticket.transitioned').map(causeOf)).toEqual([WITHHELD_NOT_TAKEN, WITHHELD_LED_TO]);
    expect(of(ownerEnvs, 'ticket.closed')).toEqual(notTaken(H, DECIDER)); // control
    expect(ownerEnvs.filter((e) => e.type === 'ticket.transitioned').map(causeOf)).toEqual([notTaken(H, DECIDER), ledTo(HS)]);

    for (const [door, read] of [['per-ticket', perTicketBoot], ['workspace', workspaceBoot]] as const) {
      const boot = await read('member');
      expect(boot.snapshot, door).not.toBeNull(); // precondition: the close is in a snapshot
      expect(boot.snapshot!.state.closed?.cause, door).toEqual(WITHHELD_NOT_TAKEN);
      expect(causeOf(boot.events.find((e) => e.type === 'ticket.transitioned')), door).toEqual(WITHHELD_LED_TO); // the tail
      const ownerBoot = await read('owner');
      expect(ownerBoot.snapshot!.state.closed?.cause, door).toEqual(notTaken(H, DECIDER)); // control
      expect(causeOf(ownerBoot.events.find((e) => e.type === 'ticket.transitioned')), door).toEqual(ledTo(HS));
    }
  });

  it('29.443 every door serves the blind member a body with no hidden ticket and no hidden person; control: the owner\'s bodies hold them', async () => {
    const body = async (role: ReadRole, url: string) => (await get(role, url)).body;
    const userOf = (role: ReadRole) => (role === 'owner' ? owner : memberId);
    const doors: Array<{ door: string; read: (role: ReadRole) => Promise<string>; holds: string[] }> = [
      { door: 'detail', read: (r) => body(r, `/v1/workspaces/${WS}/tickets/${T}`), holds: [H, DECIDER] },
      { door: '/events', read: (r) => body(r, `/v1/workspaces/${WS}/tickets/${T}/events`), holds: [H, HS, DECIDER, TRIGGER] },
      { door: 'stream', read: async (r) => JSON.stringify(await streamOn(userOf(r), T)), holds: [H, HS, DECIDER, TRIGGER] },
      { door: 'bootstrap/ticket', read: async (r) => JSON.stringify(await perTicketBoot(r)), holds: [H, HS, DECIDER, TRIGGER] },
      { door: 'bootstrap', read: async (r) => JSON.stringify(await workspaceBoot(r)), holds: [H, HS, DECIDER, TRIGGER] },
      { door: 'history', read: (r) => body(r, `/v1/tickets/${T}/history`), holds: [H, HS, DECIDER, TRIGGER] },
      { door: 'contests', read: (r) => body(r, `/v1/contests?workspaceId=${WS}&ticketId=${T}`), holds: [H, DECIDER] },
      // The flow read serves no person; the owner's walk reaches H and HS over their leads_to links.
      { door: 'flow', read: (r) => body(r, `/v1/workspaces/${WS}/tickets/${T}/flow`), holds: [H, HS] },
    ];
    for (const { door, read, holds } of doors) {
      const ownerBody = await read('owner');
      for (const id of holds) expect(ownerBody, `${door} owner holds ${id}`).toContain(id); // control: the haystack holds its subject
      const memberBody = await read('member');
      expect(memberBody.length, door).toBeGreaterThan(2); // precondition: a body, not an empty answer
      for (const id of [H, HS, DECIDER, TRIGGER]) expect(memberBody, `${door} member must not hold ${id}`).not.toContain(id);
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
    const reopened = { ...WITHHELD_NOT_TAKEN, kind: 'reopened-by-flow' };
    for (const [type, payload] of [
      ['ticket.closed', { cause: WITHHELD_NOT_TAKEN }],
      ['ticket.transitioned', { to: 'doing', cause: WITHHELD_LED_TO }],
      ['ticket.reopened', { cause: reopened }],
    ] as const) {
      expect(await submit(type, payload), type).toMatchObject({ status: 'invalid', code: 'invalid-payload' });
    }
    // control: the same close with real ids passes the payload parse and is refused by the flow's own rule
    const real = await submit('ticket.closed', { cause: notTaken(SH, SEEN_DECIDER) });
    expect(real?.status).not.toBe('invalid');
    expect(JSON.stringify(real)).toContain('cause.forged');
  });
});
