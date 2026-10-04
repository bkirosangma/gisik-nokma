import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newSubmittedEvent, type LedgerEvent, type TicketLinkKind } from '@gisik-nokma/domain';
import { runSnapshotPass } from '../../src/sync/snapshot-writer.js';
import { visibleEventsFor } from '../../src/visibility/visible-events-for.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * Typed links T4b, the doors (spec A §2.4 on the doors that serve STORED
 * claims): `/events`, the stream, both bootstraps, History's contests and
 * `GET /v1/contests` serve a member a link whose target they cannot see with
 * `targetId: null` at its own seq, and a contest wrapping such a claim with
 * the gate's own cause. Through the REAL routes against a REAL database.
 *
 * ## The world
 *
 * `buildReadTestApp`'s scenario (`read-scenario.ts`): the member sees S
 * (`taskInEpicId`) and SH (`sharedTaskId`), not H (`hiddenTaskId`, explicit
 * owner only, titled "Salary review — keep private"). Seeded on S by the
 * owner: S duplicates H, S blocks SH, and two contests of a refused
 * `link_added`, one naming H (`link.reverse`, its reason naming H's title) and
 * one naming SH.
 *
 * ## Order is load-bearing
 *
 * The `it`s run in file order. 27.085 runs a snapshot pass and then files
 * S relates H, so the bootstrap tail holds a withheld link event; the cases
 * after it read the same world plus that one event.
 */

let db: TestDatabase;
let world: ReadWorld;
let app: FastifyInstance;
let WS: string;
let S: string;
let SH: string;
let H: string;
let owner: string;

const HIDDEN_TITLE = 'Salary review — keep private';
const REWRITTEN = { rule: 'permission.visibility', reason: 'The other ticket does not exist in this workspace, or you cannot see it.' };

const link = (source: string, kind: TicketLinkKind, targetId: string): LedgerEvent =>
  makeCommitted({ workspaceId: WS, actorId: owner, entity: { kind: 'ticket', id: source }, type: 'ticket.link_added', payload: { kind, targetId } });
const contestOn = (target: string, reason: string): LedgerEvent =>
  makeCommitted({
    workspaceId: WS,
    actorId: owner,
    entity: { kind: 'ticket', id: S },
    type: 'claim.contested',
    payload: {
      originalEvent: newSubmittedEvent({
        workspaceId: WS,
        entity: { kind: 'ticket', id: S },
        type: 'ticket.link_added',
        payload: { kind: 'blocks', targetId: target },
        actorId: owner,
        origin: 'web',
      }),
      rule: 'link.reverse',
      reason,
    },
  });

type Payload = Record<string, unknown> & { targetId?: unknown; originalEvent?: { payload: unknown }; rule?: string; reason?: string };
type Ev = { id: string; type: string; seq: number; payload: Payload };

beforeAll(async () => {
  db = await createTestDatabase();
  world = await buildReadTestApp(db);
  app = world.app;
  WS = world.world.workspaceId;
  S = world.world.taskInEpicId;
  SH = world.world.sharedTaskId;
  H = world.world.hiddenTaskId;
  owner = world.userIds.owner;
  await applyCommitted(db.pool, [
    link(S, 'duplicates', H),
    link(S, 'blocks', SH),
    contestOn(H, `"${HIDDEN_TITLE}" already blocks "File the GST return".`),
    contestOn(SH, '"Renew the trade licence" already blocks "File the GST return".'),
  ]);
});

afterAll(async () => {
  await db.drop();
});

const get = async (role: ReadRole, url: string) => {
  const res = await app.inject({ method: 'GET', url, headers: world.authOf(role) });
  expect(res.statusCode).toBe(200);
  return res;
};
const eventsOf = async (role: ReadRole) => ((await get(role, `/v1/workspaces/${WS}/tickets/${S}/events`)).json() as { events: Ev[] }).events;
const historyOf = async (role: ReadRole) => ((await get(role, `/v1/tickets/${S}/history`)).json() as { events: Ev[] }).events;
const contestNaming = (events: Ev[], target: 'hidden' | 'shared') =>
  events.find(
    (e) =>
      e.type === 'claim.contested' &&
      (target === 'hidden' ? (e.payload.reason ?? '').includes(HIDDEN_TITLE) || e.payload.rule === 'permission.visibility' : (e.payload.reason ?? '').includes('Renew')),
  );

describe('typed links T4b, the doors (27.083–27.087)', () => {
  it('27.083 /events serves the member the hidden link withheld at its own seq, ids and seqs equal History; control: the owner gets the id', async () => {
    const member = await eventsOf('member');
    const dup = member.find((e) => e.type === 'ticket.link_added' && e.payload.kind === 'duplicates');
    expect(dup?.payload).toEqual({ kind: 'duplicates', targetId: null });
    const ownerEvents = await eventsOf('owner');
    const ownerDup = ownerEvents.find((e) => e.type === 'ticket.link_added' && e.payload.kind === 'duplicates');
    expect(ownerDup?.payload).toEqual({ kind: 'duplicates', targetId: H }); // control
    expect(dup?.seq).toBe(ownerDup?.seq); // its own seq
    const ids = (events: Ev[]) => events.map((e) => [e.id, e.seq]);
    expect(ids(member)).toEqual(ids(await historyOf('member')));
    expect(ids(member)).toEqual(ids(ownerEvents)); // no gap
    const body = JSON.stringify(member);
    expect(body).not.toContain(H);
    expect(body).not.toContain('Salary review');
    expect(JSON.stringify(ownerEvents)).toContain(H); // control: the haystack holds it for the owner
  });

  it('27.084 the stream yields the member the withheld envelope at the owner seq and workspaceSeq, no gap; control: the owner envelope carries the id', async () => {
    const onS = async (userId: string) => {
      const out: Array<LedgerEvent> = [];
      for await (const item of visibleEventsFor(db.pool, userId, WS, 0)) {
        if ('entity' in item && item.entity.id === S) out.push(item as LedgerEvent);
      }
      return out;
    };
    const member = await onS(world.userIds.member);
    const ownerEnvs = await onS(owner);
    const seqs = (envs: LedgerEvent[]) => envs.map((e) => [e.seq, e.workspaceSeq]);
    expect(member.length).toBeGreaterThan(0); // precondition
    expect(seqs(member)).toEqual(seqs(ownerEnvs));
    const dupOf = (envs: LedgerEvent[]) => envs.find((e) => e.type === 'ticket.link_added' && (e.payload as Payload).kind === 'duplicates');
    expect(dupOf(member)?.payload).toEqual({ kind: 'duplicates', targetId: null });
    expect(dupOf(ownerEnvs)?.payload).toEqual({ kind: 'duplicates', targetId: H }); // control
    expect(JSON.stringify(member)).not.toContain(H);
    expect(JSON.stringify(member)).not.toContain('Salary review');
  });

  it('27.085 both bootstraps serve the member S without H: snapshot links, tail and backfilled contest; control: the owner bodies contain H', async () => {
    await runSnapshotPass(db.pool, { minEvents: 1 });
    await applyCommitted(db.pool, [link(S, 'relates', H)]); // a TAIL link event, after the snapshot
    type Ticket = { ticketId: string; snapshot: { seq: number; state: { links?: unknown } } | null; events: Ev[] };
    const perTicket = async (role: ReadRole) =>
      ((await get(role, `/v1/sync/bootstrap/ticket?workspaceId=${WS}&ticketId=${S}`)).json() as { ticket: Ticket }).ticket;
    const workspace = async (role: ReadRole) =>
      ((await get(role, `/v1/sync/bootstrap?workspaceId=${WS}`)).json() as { tickets: Ticket[] }).tickets.find((t) => t.ticketId === S)!;
    for (const [door, read] of [['per-ticket', perTicket], ['workspace', workspace]] as const) {
      const member = await read('member');
      expect(member.snapshot, door).not.toBeNull(); // precondition: links are in a snapshot
      expect(member.snapshot!.state.links, door).toEqual([{ kind: 'blocks', targetId: SH }]);
      const tail = member.events.find((e) => e.type === 'ticket.link_added' && e.payload.kind === 'relates');
      expect(tail?.payload, door).toEqual({ kind: 'relates', targetId: null });
      const hidden = contestNaming(member.events, 'hidden');
      expect(hidden?.payload, door).toMatchObject(REWRITTEN);
      expect(hidden?.payload.originalEvent?.payload, door).toEqual({ kind: 'blocks', targetId: null });
      expect(contestNaming(member.events, 'shared')?.payload.originalEvent?.payload, door).toEqual({ kind: 'blocks', targetId: SH }); // control
      expect(JSON.stringify(member), door).not.toContain(H);
      expect(JSON.stringify(member), door).not.toContain('Salary review');
      const ownerBody = JSON.stringify(await read('owner'));
      expect(ownerBody, door).toContain(H); // control
      expect(ownerBody, door).toContain('Salary review');
    }
  });

  it('27.086 History serves the hidden-target contest rewritten and withheld; control: the owner History serves it whole', async () => {
    const member = await historyOf('member');
    const hidden = contestNaming(member, 'hidden');
    expect(hidden?.payload).toMatchObject(REWRITTEN);
    expect(Object.keys(hidden!.payload)).toEqual(['originalEvent', 'rule', 'reason']);
    expect(hidden?.payload.originalEvent?.payload).toEqual({ kind: 'blocks', targetId: null });
    expect(JSON.stringify(member)).not.toContain(H);
    expect(JSON.stringify(member)).not.toContain('Salary review');
    expect(contestNaming(member, 'shared')?.payload).toMatchObject({ rule: 'link.reverse', originalEvent: { payload: { kind: 'blocks', targetId: SH } } }); // control
    const ownerHidden = contestNaming(await historyOf('owner'), 'hidden');
    expect(ownerHidden?.payload).toMatchObject({ rule: 'link.reverse', reason: `"${HIDDEN_TITLE}" already blocks "File the GST return".` }); // control
    expect(ownerHidden?.payload.originalEvent?.payload).toEqual({ kind: 'blocks', targetId: H });
  });

  it('27.087 GET /v1/contests serves the member the same rewritten contest; control: the visible-target contest whole, the owner roster whole', async () => {
    type View = { rule: string; reason: string; originalEvent: { payload: unknown } };
    const rosterOf = async (role: ReadRole) => ((await get(role, `/v1/contests?workspaceId=${WS}&ticketId=${S}`)).json() as { contests: View[] }).contests;
    const member = await rosterOf('member');
    expect(member).toHaveLength(2); // precondition: both contests reach the member (S is visible)
    const hidden = member.find((c) => c.rule === 'permission.visibility');
    expect(hidden).toMatchObject({ ...REWRITTEN, originalEvent: { payload: { kind: 'blocks', targetId: null } } });
    expect(JSON.stringify(member)).not.toContain(H);
    expect(JSON.stringify(member)).not.toContain('Salary review');
    expect(member.find((c) => c.reason.includes('Renew'))).toMatchObject({ rule: 'link.reverse', originalEvent: { payload: { kind: 'blocks', targetId: SH } } }); // control
    const ownerRoster = await rosterOf('owner');
    expect(ownerRoster.map((c) => c.rule)).toEqual(['link.reverse', 'link.reverse']); // control: whole
    expect(JSON.stringify(ownerRoster)).toContain(H);
    expect(JSON.stringify(ownerRoster)).toContain('Salary review');
  });
});
