import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { newUlid, type LedgerEvent, type MyWorkResponse } from '@gisik-nokma/domain';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * Plan 5 Task 11 — `GET /v1/me/work`, the per-viewer cross-project read.
 *
 * ## What is different about this one, stated before anything is asserted
 *
 * Every read before it answered "what is in this container" — a project's board,
 * a project's list, a workspace's text. The container was named in the URL and
 * the caller's identity only NARROWED the answer. This route answers "what is
 * MINE", so the viewer's identity is the FILTER as well as the security
 * boundary, and the two failure modes that produces are what this file is built
 * around:
 *
 * 1. **The viewer id must come from the session and from nowhere else.** A route
 *    that let a caller name whose work to read would be a read of another
 *    person's queue behind a 200. Nothing in the URL contract offers such a
 *    parameter — but "the route does not declare it" is not the same as "the
 *    route does not read it", and Fastify hands every unknown query parameter to
 *    the handler regardless. So case 7.105 SENDS the parameters a broken
 *    implementation would reach for and pins the answer byte-for-byte against
 *    the request that sends none. MEASURED: `const viewerId = (request.query as
 *    {userId?: string}).userId ?? request.currentUserId` reddens it naming the
 *    owner's ordering fixtures.
 * 2. **Being ASSIGNED a ticket is not being allowed to SEE it.** Assignment is a
 *    claim somebody else can make about you; visibility is Plan 4's decision
 *    table. Four cases separate them, each with the ticket that DID appear
 *    beside the one that did not, because "the invisible one is absent" alone
 *    passes on a route that returns nothing:
 *    - 7.27 the planted hidden ticket, assigned to the member who is not on its
 *      explicit list;
 *    - 7.104 a project-mode ticket assigned to a workspace member who is on no
 *      project (the never-on-the-roster half of "removed from the project");
 *    - 7.107 the other half, executed: `project.member_removed` takes
 *      `projectLead` off the project their assigned ticket lives in, and the
 *      SAME ticket that was in their answer a moment ago is gone from it;
 *    - 7.108 visibility NARROWED after assignment — a `visibility.set` drops the
 *      guest from a list they are still the assignee of.
 *
 * ## The scope is ONE workspace, and the tenancy clause is the only thing holding it
 *
 * `visibleTicketsWhere` compiles to `TRUE` for an owner, so for that caller
 * `t.workspace_id = $n` is the entire boundary — exactly the position
 * `routes/search.ts` is in, and the first route where this is falsifiable was
 * that one. Case 7.106 is the fixture: a ticket in the NEIGHBOUR workspace
 * assigned to the seeded workspace's owner. It is not reachable through the door
 * (the owner is no member there, so that workspace answers them 404), and the
 * only thing keeping it out of the answer they DO get is the workspace clause.
 *
 * Cross-workspace aggregation is deliberately not offered: the response names
 * one `workspaceId` and a client that wants two makes two calls. So there is no
 * case here about "every workspace the session holds" — there is no such
 * answer to get wrong.
 *
 * ## Nothing on this response reads a clock
 *
 * The grouping key is `state_category`, which is a column, not a date. Cards
 * carry a `dueDate` claim and two `timestamptz` provenance columns, both
 * rendered by `toISOString()`, and nothing in this route compares either to
 * `now`. So a `TZ`-varying case here could not fail, and the honest thing is to
 * say so rather than write one — the same statement `search.test.ts`,
 * `board.test.ts` and `list.test.ts` make. `attention.test.ts` (Task 12) is
 * where the IST rules bind.
 *
 * ## Why nearly every fixture id is hand-built
 *
 * `newUlid()` is NOT monotonic inside one millisecond — its leading 48 bits are
 * a clock and the remaining 80 are random — so ids minted in a loop sort roughly
 * in mint order and, within a tick, either way. An exact-array assertion over
 * minted ids is therefore a coin flip that usually lands heads. The hand-built
 * ids below sort in Postgres exactly as they sort here, so every group in this
 * file is asserted as an ORDERED ARRAY rather than a set, and case 7.103 inserts
 * five of them in DESCENDING order so `ORDER BY t.ticket_id` has something to be
 * wrong about.
 *
 * ## One database, one seed, fixtures in `beforeAll`
 *
 * `seedReadScenario` refuses a second seed into one database, so this file takes
 * one `createTestDatabase` and extends the shared world rather than building its
 * own. Nothing here is added to `read-app.ts`: that helper is the world Tasks
 * 8–15 share and every fixture in it is justified for all of them, while these
 * are this task's problem — the rule `list.test.ts` and `search.test.ts` both
 * follow.
 *
 * ## Three cases MUTATE the world, and they are declared last on purpose
 *
 * 7.26's second case transitions the mover, 7.107 removes `projectLead` from a
 * project and 7.108 narrows a guest's list. Each touches only fixtures belonging
 * to the viewer that case asserts on, and each is declared after every case that
 * reads the same rows — vitest runs a file's cases in declaration order.
 */

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let read: ReadWorld;
let fx: MyWorkFixtures;

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  fx = await seedMyWorkFixtures(db.pool, read);
}, 120_000);

afterAll(async () => {
  await read.app.close();
  await db.drop();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Crockford base32 — the ULID alphabet, `I`, `L`, `O` and `U` absent — in
 * ascending byte order, so a suffix built from it sorts in Postgres exactly as
 * it sorts in JavaScript.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A hand-built ticket id ordered by `index`, valid against `ULID_REGEX`
 * (`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`): `0MW` + twenty-one `0`s + two Crockford
 * digits is twenty-six characters whose first is `0`.
 *
 * The prefix is `0MW` so these cannot be mistaken for the seeded world's minted
 * ids or for `search.test.ts`'s `0SR` ones.
 */
function myWorkTicketId(index: number): string {
  const suffix = `${CROCKFORD[Math.floor(index / CROCKFORD.length)]}${CROCKFORD[index % CROCKFORD.length]}`;
  return `0MW${'0'.repeat(21)}${suffix}`;
}

type MyWorkFixtures = {
  /** member, seeded project, project-mode, `todo`. The CONTROL TWIN of the hidden ticket. */
  memberOpenId: string;
  /** member, the SIBLING project, project-mode, `todo`. The cross-project row. */
  memberSiblingOpenId: string;
  /** member, seeded project, transitioned to `done`. */
  memberTerminalId: string;
  /** outsider, seeded project, project-mode — assigned to somebody on no project. */
  outsiderProjectId: string;
  /** outsider, explicit `[owner, outsider]` — the same person's VISIBLE row. */
  outsiderExplicitId: string;
  /** guest, explicit `[owner, guest]`, never narrowed. */
  guestKeepId: string;
  /** guest, explicit `[owner, guest]`, narrowed to `[owner]` by case 7.108. */
  guestNarrowId: string;
  /** projectLead, the SIBLING project, project-mode. Moves between groups, then vanishes. */
  leadMoverId: string;
  /** projectLead, explicit `[owner, projectLead]` — survives the project removal. */
  leadExplicitId: string;
  /** owner, seeded project, all `todo` — CREATED IN DESCENDING ID ORDER. */
  ownerOrderIds: string[];
  /** owner, but in the NEIGHBOUR workspace. The tenancy row. */
  ownerNeighbourId: string;
};

const OWNER_ORDER_COUNT = 5;

/**
 * Everything this file asserts on, seeded once onto the shared world.
 *
 * Two shared-world rows are also enlisted rather than duplicated: the seeded
 * `taskInEpic` (already assigned to `member`, already in `doing`) is the
 * member's whole `active` group, and the planted `hiddenTask` — explicit to the
 * OWNER alone — is ASSIGNED to the member here, which is the planted defect.
 * Neither is modified in a way another Task 8–15 file could see, because each
 * file holds its own database.
 */
async function seedMyWorkFixtures(pool: Pool, world: ReadWorld): Promise<MyWorkFixtures> {
  const { workspaceId, projectId, owner, member, outsider, guest } = world.world;
  const { projectLead } = world.userIds;
  const ws = { workspaceId, actorId: owner };

  const memberOpenId = myWorkTicketId(0);
  const memberSiblingOpenId = myWorkTicketId(1);
  const memberTerminalId = myWorkTicketId(2);
  const outsiderProjectId = myWorkTicketId(3);
  const outsiderExplicitId = myWorkTicketId(4);
  const guestKeepId = myWorkTicketId(5);
  const guestNarrowId = myWorkTicketId(6);
  const leadMoverId = myWorkTicketId(7);
  const leadExplicitId = myWorkTicketId(8);
  const ownerOrderIds = Array.from({ length: OWNER_ORDER_COUNT }, (_, i) => myWorkTicketId(9 + i));
  const ownerNeighbourId = myWorkTicketId(9 + OWNER_ORDER_COUNT);

  /** `ticket.created` + `ticket.assigned` for one ticket of type `task`. */
  const assigned = (id: string, title: string, assigneeId: string, inProject: string): LedgerEvent[] => [
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId: inProject, parentId: null, title },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'ticket.assigned',
      payload: { assigneeId },
    }),
  ];

  const explicitTo = (id: string, userIds: string[]): LedgerEvent =>
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'visibility.set',
      payload: { ticketId: id, mode: 'explicit', userIds },
    });

  const events: LedgerEvent[] = [
    ...assigned(memberOpenId, 'Reconcile the cash book', member, projectId),
    ...assigned(memberSiblingOpenId, 'Chase the licence renewal fee', member, world.sibling.projectId),
    ...assigned(memberTerminalId, 'Post the June ledger', member, projectId),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: memberTerminalId },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
    }),

    // THE PLANTED DEFECT (7.27): the owner assigns the member to the ticket the
    // member cannot see. `hiddenTask` is explicit to the owner alone, so
    // assignment is the ONLY thing that could put it in the member's answer.
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: world.world.hiddenTaskId },
      type: 'ticket.assigned',
      payload: { assigneeId: member },
    }),

    ...assigned(outsiderProjectId, 'Stocktake the back room', outsider, projectId),
    ...assigned(outsiderExplicitId, 'Countersign the lease', outsider, projectId),
    explicitTo(outsiderExplicitId, [owner, outsider]),

    ...assigned(guestKeepId, 'Send the July invoice pack', guest, projectId),
    explicitTo(guestKeepId, [owner, guest]),
    ...assigned(guestNarrowId, 'Draft the settlement note', guest, projectId),
    explicitTo(guestNarrowId, [owner, guest]),

    ...assigned(leadMoverId, 'Approve the sibling budget', projectLead, world.sibling.projectId),
    ...assigned(leadExplicitId, 'Sign the vendor addendum', projectLead, projectId),
    explicitTo(leadExplicitId, [owner, projectLead]),
  ];

  // DESCENDING, deliberately: created newest-id-first so a route with no
  // `ORDER BY t.ticket_id` has an insertion order to return instead, and case
  // 7.103's ascending array is a claim about the query rather than about the
  // seeder.
  for (const id of [...ownerOrderIds].reverse()) {
    events.push(...assigned(id, `Owner queue ${id.slice(-2)}`, owner, projectId));
  }

  await applyCommitted(pool, events);

  // A second tenancy, written under the NEIGHBOUR's workspace id: a ticket
  // assigned to the SEEDED workspace's owner, in a workspace that owner is not a
  // member of. `visibleTicketsWhere` compiles to `TRUE` for them, so the
  // workspace clause is the only conjunct that excludes this row (7.106).
  await applyCommitted(pool, [
    makeCommitted({
      workspaceId: world.neighbour.workspaceId,
      actorId: world.userIds.neighbour,
      entity: { kind: 'ticket', id: ownerNeighbourId },
      type: 'ticket.created',
      payload: {
        typeId: 'nb-task',
        projectId: world.neighbour.projectId,
        parentId: null,
        title: 'Next Door bookkeeping',
      },
    }),
    makeCommitted({
      workspaceId: world.neighbour.workspaceId,
      actorId: world.userIds.neighbour,
      entity: { kind: 'ticket', id: ownerNeighbourId },
      type: 'ticket.assigned',
      payload: { assigneeId: owner },
    }),
    // The neighbour's OWN assignment, so their own workspace answers them
    // something non-empty — the positive control beside every 404 they get.
    makeCommitted({
      workspaceId: world.neighbour.workspaceId,
      actorId: world.userIds.neighbour,
      entity: { kind: 'ticket', id: world.neighbour.ticketId },
      type: 'ticket.assigned',
      payload: { assigneeId: world.userIds.neighbour },
    }),
  ]);

  return {
    memberOpenId,
    memberSiblingOpenId,
    memberTerminalId,
    outsiderProjectId,
    outsiderExplicitId,
    guestKeepId,
    guestNarrowId,
    leadMoverId,
    leadExplicitId,
    ownerOrderIds,
    ownerNeighbourId,
  };
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/**
 * The URL, with every part OMITTED rather than blanked when it is `undefined` —
 * `?workspaceId=` (present and empty) and no `workspaceId` at all are two
 * different requests and both are refused, so the refusal cases must be able to
 * send each. A repeated key is expressed as an array, which is how a caller
 * sends `?workspaceId=a&workspaceId=b`.
 */
function myWorkUrl(params: Record<string, string | string[] | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(one)}`);
    }
  }
  return `/v1/me/work${parts.length === 0 ? '' : `?${parts.join('&')}`}`;
}

async function request(
  role: ReadRole,
  params: Record<string, string | string[] | undefined>,
): Promise<InjectResponse> {
  return read.app.inject({ method: 'GET', url: myWorkUrl(params), headers: read.authOf(role) });
}

/** My Work in the SEEDED workspace, which is what almost every case wants. */
async function myWork(role: ReadRole): Promise<InjectResponse> {
  return request(role, { workspaceId: read.world.workspaceId });
}

/** The three groups as ticket ids, in the order the route returned them. */
async function groupIds(role: ReadRole): Promise<Record<'open' | 'active' | 'terminal', string[]>> {
  const response = await myWork(role);
  expect(response.statusCode).toBe(200);
  const body = response.json() as MyWorkResponse;
  return {
    open: body.groups.open.map((card) => card.ticketId),
    active: body.groups.active.map((card) => card.ticketId),
    terminal: body.groups.terminal.map((card) => card.ticketId),
  };
}

/**
 * Every response header except `date`, which is a clock reading and differs
 * between two requests for reasons unrelated to what is being compared.
 * `content-length` above all must match: a length that differed would itself be
 * the oracle even if both bodies parsed to the same object.
 */
function comparableHeaders(response: InjectResponse): Record<string, unknown> {
  const { date: _date, ...rest } = response.headers;
  return rest;
}

// ---------------------------------------------------------------------------

describe('GET /v1/me/work — what is mine', () => {
  it('7.26 groups assigned-to-me by state category, across every project in the workspace', async () => {
    const response = await myWork('member');
    expect(response.statusCode).toBe(200);
    const body = response.json() as MyWorkResponse;

    // The envelope names what was asked, so an answer is legible on its own.
    expect(body.workspaceId).toBe(read.world.workspaceId);

    // All THREE groups are non-empty, which is what stops any one of them being
    // read as "the route put everything in one bucket".
    expect(body.groups.open.map((c) => c.ticketId)).toEqual([fx.memberOpenId, fx.memberSiblingOpenId]);
    expect(body.groups.active.map((c) => c.ticketId)).toEqual([read.world.taskInEpicId]);
    expect(body.groups.terminal.map((c) => c.ticketId)).toEqual([fx.memberTerminalId]);

    // CROSS-PROJECT, asserted as a fact about the rows rather than about their
    // ids: the two open cards sit in two DIFFERENT projects. A route that had
    // kept a project scope would answer one of them.
    expect(body.groups.open.map((c) => c.projectId)).toEqual([
      read.world.projectId,
      read.sibling.projectId,
    ]);

    // Every card is one this viewer is the ASSIGNEE of — the filter is the
    // session's user, not "everything they may see". `sharedTask` and the epic
    // are both visible to the member and neither is theirs.
    const everyCard = [...body.groups.open, ...body.groups.active, ...body.groups.terminal];
    expect(everyCard.map((c) => c.assigneeId)).toEqual(everyCard.map(() => read.userIds.member));
    expect(everyCard.map((c) => c.ticketId)).not.toContain(read.world.sharedTaskId);
    expect(everyCard.map((c) => c.ticketId)).not.toContain(read.world.epicId);
    expect(response.body).not.toContain(read.world.sharedTaskId);
    expect(response.body).not.toContain('Renew the trade licence');
    // The EPIC's id is deliberately not checked as a substring, and that is a
    // correction rather than a gap: it is the `parentId` of the card that IS
    // theirs, so it appears in the body as a field OF a card the member owns.
    // A body-substring check cannot tell that from a leak; the card-id check
    // above can, so that is the one that carries the claim. (Measured: the
    // substring form failed on correct code.)
    expect(everyCard.map((c) => c.parentId)).toContain(read.world.epicId);

    // A card, not a stub: the fields a My Work strip actually renders are here.
    const active = body.groups.active[0];
    expect(active?.title).toBe('File the GST return');
    expect(active?.stateId).toBe('doing');
    expect(active?.stateCategory).toBe('active');
    expect(active?.workflowId).toBe(read.world.workflowId);
    expect(active?.stateProvenance.actorId).toBe(read.userIds.member);
    expect(active?.dueDate.state).toBe('claimed');
  });

  it('7.103 cards inside a group are in ticket_id order — five rows created newest-id-first', async () => {
    const groups = await groupIds('owner');

    // Created in DESCENDING id order (see the seeder), asserted ASCENDING. A
    // query with no ORDER BY returns them in whatever order the scan produces,
    // which for a freshly inserted heap is insertion order — the reverse.
    expect(groups.open).toEqual(fx.ownerOrderIds);
    expect(fx.ownerOrderIds).toHaveLength(OWNER_ORDER_COUNT);

    // The two empties stand beside a non-empty group in the same call, so
    // neither is the shape a route emits when it has nothing at all to say.
    expect(groups.active).toEqual([]);
    expect(groups.terminal).toEqual([]);
  });

  it('7.104 a workspace member on NO project does not get the project-mode ticket assigned to them', async () => {
    const response = await myWork('outsider');
    expect(response.statusCode).toBe(200);
    const groups = await groupIds('outsider');

    // The row they may see, assigned to them, IS here — so the absence below is
    // this predicate answering and not an empty route.
    expect(groups.open).toEqual([fx.outsiderExplicitId]);
    expect(groups.active).toEqual([]);
    expect(groups.terminal).toEqual([]);

    // The project-mode one, assigned to the same person by the same seeder in
    // the same project, is absent — id, and title words, from the whole body.
    expect(response.body).not.toContain(fx.outsiderProjectId);
    expect(response.body).not.toContain('Stocktake');

    // Positive control for the substring checks themselves: the id and the title
    // of the row that DID come back are in the body, so `not.toContain` is not
    // passing on an error page or an empty string.
    expect(response.body).toContain(fx.outsiderExplicitId);
    expect(response.body).toContain('Countersign the lease');
  });

  it('7.27 PLANTED DEFECT: the hidden ticket assigned to the member never appears — assignment is not visibility', async () => {
    const response = await myWork('member');
    expect(response.statusCode).toBe(200);

    // Not as a card, not as an id, not as a word of its title or its comment.
    const body = response.json() as MyWorkResponse;
    const everyId = [...body.groups.open, ...body.groups.active, ...body.groups.terminal].map(
      (c) => c.ticketId,
    );
    expect(everyId).not.toContain(read.world.hiddenTaskId);
    expect(response.body).not.toContain(read.world.hiddenTaskId);
    expect(response.body).not.toContain('Salary review');
    expect(response.body).not.toContain('zebra-confidential');

    // THE CONTROL TWIN, in the same body: `memberOpen` is the same project, the
    // same type, the same state, assigned to the same person by the same
    // seeder — everything about it is identical to the hidden ticket EXCEPT its
    // resolved visibility mode. It is present, so the absence above is the
    // visibility predicate and nothing else.
    expect(everyId).toContain(fx.memberOpenId);
    expect(response.body).toContain(fx.memberOpenId);
    expect(response.body).toContain('Reconcile the cash book');

    // And the owner, who IS on that explicit list, is not the assignee — so the
    // hidden ticket is in nobody's My Work, which is the honest statement. The
    // owner's answer is their five ordering rows and nothing else.
    const ownerGroups = await groupIds('owner');
    expect(ownerGroups.open).toEqual(fx.ownerOrderIds);
  });

  it('7.105 the viewer is the SESSION — no query parameter can name somebody else’s work', async () => {
    const plain = await myWork('member');
    expect(plain.statusCode).toBe(200);

    // Every spelling a route reading an actor-supplied identity would reach for,
    // all naming the OWNER, sent by the member.
    const impersonating = await request('member', {
      workspaceId: read.world.workspaceId,
      userId: read.userIds.owner,
      user_id: read.userIds.owner,
      assigneeId: read.userIds.owner,
      viewerId: read.userIds.owner,
      as: read.userIds.owner,
    });
    expect(impersonating.statusCode).toBe(200);

    // BYTE-IDENTICAL to the request that named nobody: same body, same headers,
    // content-length included.
    expect(impersonating.body).toBe(plain.body);
    expect(comparableHeaders(impersonating)).toEqual(comparableHeaders(plain));

    // Said the other way round, so a route that read the parameter cannot pass
    // by coincidentally answering the same rows: the owner's queue is NOT in the
    // member's answer, and the member's answer IS the member's own.
    for (const ownerId of fx.ownerOrderIds) {
      expect(impersonating.body).not.toContain(ownerId);
    }
    expect(impersonating.body).toContain(fx.memberOpenId);

    // And the mirror: the owner naming the member gets the owner's own queue.
    const ownerImpersonating = await request('owner', {
      workspaceId: read.world.workspaceId,
      userId: read.userIds.member,
      assigneeId: read.userIds.member,
    });
    expect(ownerImpersonating.statusCode).toBe(200);
    const ownerBody = ownerImpersonating.json() as MyWorkResponse;
    expect(ownerBody.groups.open.map((c) => c.ticketId)).toEqual(fx.ownerOrderIds);
    expect(ownerImpersonating.body).not.toContain(fx.memberOpenId);
  });

  it('7.106 the answer is ONE workspace — a ticket assigned to the owner next door is not in it', async () => {
    const response = await myWork('owner');
    expect(response.statusCode).toBe(200);

    // For an owner `visibleTicketsWhere` compiles to TRUE, so the workspace
    // clause is the ONLY conjunct standing between this caller and the
    // neighbour's row — which is assigned to them, and would otherwise be an
    // `open` card sorting after all five of theirs.
    expect(response.body).not.toContain(fx.ownerNeighbourId);
    expect(response.body).not.toContain('Next Door bookkeeping');
    const groups = await groupIds('owner');
    expect(groups.open).toEqual(fx.ownerOrderIds);

    // The row EXISTS and is assigned to them — proved by reading it from the
    // table directly, so the absence above is a filter and not a seeder that
    // wrote nothing.
    const { rows } = await db.pool.query<{ workspace_id: string; assignee_id: string }>(
      `SELECT workspace_id, assignee_id FROM proj_tickets WHERE ticket_id = $1`,
      [fx.ownerNeighbourId],
    );
    expect(rows).toEqual([
      { workspace_id: read.neighbour.workspaceId, assignee_id: read.userIds.owner },
    ]);

    // And the owner cannot reach it by asking for that workspace either: the
    // door answers 404 to a caller who is no member there.
    const nextDoor = await request('owner', { workspaceId: read.neighbour.workspaceId });
    expect(nextDoor.statusCode).toBe(404);
  });

  it('7.109 the store cannot hold a fourth group — `state_category` is a CHECK, so an actor-shaped bucket key has no row to arrive on', async () => {
    // The grouping key is read off a database column and used to choose a
    // bucket, which is the shape that makes `__proto__` and `toString` a hazard.
    // Here the column itself refuses them: the answer is not "the route is
    // careful", it is "no such row exists".
    for (const rogue of ['__proto__', 'toString', 'constructor', 'blocked']) {
      await expect(
        db.pool.query(`UPDATE proj_tickets SET state_category = $2 WHERE ticket_id = $1`, [
          fx.memberOpenId,
          rogue,
        ]),
      ).rejects.toThrow(/proj_tickets_state_category_check/);
    }

    // Positive control for the four rejections: the SAME statement with a legal
    // value reaches the row and updates it, so what was refused above is the
    // constraint and not a typo in the SQL or a ticket id that matches nothing.
    const legal = await db.pool.query(
      `UPDATE proj_tickets SET state_category = 'open' WHERE ticket_id = $1`,
      [fx.memberOpenId],
    );
    expect(legal.rowCount).toBe(1);

    // Untouched afterwards, so this case changes nothing for the ones after it.
    expect((await groupIds('member')).open).toEqual([fx.memberOpenId, fx.memberSiblingOpenId]);
  });

  it('7.26 a card MOVES between groups when its state category changes — nothing is stored, the category is read', async () => {
    // `leadMover` sorts before `leadExplicit`, so every step below has a
    // non-empty group beside the one under test.
    expect(await groupIds('projectLead')).toEqual({
      open: [fx.leadMoverId, fx.leadExplicitId],
      active: [],
      terminal: [],
    });

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: read.world.workspaceId,
        actorId: read.userIds.projectLead,
        entity: { kind: 'ticket', id: fx.leadMoverId },
        type: 'ticket.transitioned',
        payload: { to: 'doing' },
      }),
    ]);
    expect(await groupIds('projectLead')).toEqual({
      open: [fx.leadExplicitId],
      active: [fx.leadMoverId],
      terminal: [],
    });

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: read.world.workspaceId,
        actorId: read.userIds.projectLead,
        entity: { kind: 'ticket', id: fx.leadMoverId },
        type: 'ticket.transitioned',
        payload: { to: 'done' },
      }),
    ]);
    expect(await groupIds('projectLead')).toEqual({
      open: [fx.leadExplicitId],
      active: [],
      terminal: [fx.leadMoverId],
    });
  });

  it('7.107 taken OFF the project, the assignee stops seeing their own ticket — the roster is read, not remembered', async () => {
    // Before: the mover is theirs and it is in their answer (case 7.26 left it
    // terminal). The explicit row beside it is the control that survives.
    expect(await groupIds('projectLead')).toEqual({
      open: [fx.leadExplicitId],
      active: [],
      terminal: [fx.leadMoverId],
    });

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: read.world.workspaceId,
        actorId: read.world.owner,
        entity: { kind: 'project', id: read.sibling.projectId },
        type: 'project.member_removed',
        payload: { userId: read.userIds.projectLead },
      }),
    ]);

    const after = await myWork('projectLead');
    expect(after.statusCode).toBe(200);
    expect(await groupIds('projectLead')).toEqual({
      open: [fx.leadExplicitId],
      active: [],
      terminal: [],
    });
    expect(after.body).not.toContain(fx.leadMoverId);
    expect(after.body).not.toContain('Approve the sibling budget');

    // Still assigned to them — the assignment did not move, the roster did.
    const { rows } = await db.pool.query<{ assignee_id: string }>(
      `SELECT assignee_id FROM proj_tickets WHERE ticket_id = $1`,
      [fx.leadMoverId],
    );
    expect(rows).toEqual([{ assignee_id: read.userIds.projectLead }]);
  });

  it('7.108 visibility NARROWED after assignment removes the card — the guest is still the assignee and no longer the audience', async () => {
    // Before: both explicit rows name the guest, both are assigned to them.
    expect(await groupIds('guest')).toEqual({
      open: [fx.guestKeepId, fx.guestNarrowId],
      active: [],
      terminal: [],
    });

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: read.world.workspaceId,
        actorId: read.world.owner,
        entity: { kind: 'ticket', id: fx.guestNarrowId },
        type: 'visibility.set',
        payload: { ticketId: fx.guestNarrowId, mode: 'explicit', userIds: [read.world.owner] },
      }),
    ]);

    const after = await myWork('guest');
    expect(after.statusCode).toBe(200);
    // The other one is untouched — so this is one row leaving an audience and
    // not the guest losing the workspace.
    expect(await groupIds('guest')).toEqual({
      open: [fx.guestKeepId],
      active: [],
      terminal: [],
    });
    expect(after.body).not.toContain(fx.guestNarrowId);
    expect(after.body).not.toContain('Draft the settlement note');
    expect(after.body).toContain(fx.guestKeepId);
  });
});

describe('GET /v1/me/work — the door', () => {
  it('7.110 no session is 401, and so is a forged bearer — the session is resolved, not merely present', async () => {
    const url = myWorkUrl({ workspaceId: read.world.workspaceId });

    const anonymous = await read.app.inject({ method: 'GET', url });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.body).not.toContain(fx.memberOpenId);

    const forged = await read.app.inject({
      method: 'GET',
      url,
      headers: { authorization: 'Bearer not-a-real-session-token' },
    });
    expect(forged.statusCode).toBe(401);
    expect(forged.json()).toEqual(UNAUTHENTICATED_BODY);
    expect(forged.body).not.toContain(fx.memberOpenId);

    // Positive control: the SAME url with a real session is a 200 with rows.
    const real = await read.app.inject({ method: 'GET', url, headers: read.authOf('member') });
    expect(real.statusCode).toBe(200);
    expect(real.body).toContain(fx.memberOpenId);
  });

  it('7.111 a stranger, a neighbour and an unknown workspace id get the SAME 404 — status, body and every header but date', async () => {
    const stranger = await myWork('stranger');
    const neighbour = await myWork('neighbour');
    const unknown = await request('owner', { workspaceId: newUlid() });

    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual(READ_NOT_FOUND_BODY);
    expect(neighbour.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);

    // Indistinguishable, or the route is an existence oracle: a 403 for the
    // neighbour would confirm the workspace exists to somebody with no business
    // knowing it does, and a different body for an unknown id would say which
    // workspace ids are real.
    expect(neighbour.json()).toEqual(stranger.json());
    expect(unknown.json()).toEqual(stranger.json());
    expect(comparableHeaders(neighbour)).toEqual(comparableHeaders(stranger));
    expect(comparableHeaders(unknown)).toEqual(comparableHeaders(stranger));

    // Positive control for all three: the neighbour is a real session that gets
    // 200 WITH A CARD on their own workspace, so their 404 is about tenancy.
    const own = await request('neighbour', { workspaceId: read.neighbour.workspaceId });
    expect(own.statusCode).toBe(200);
    expect((own.json() as MyWorkResponse).groups.open.map((c) => c.ticketId)).toEqual([
      read.neighbour.ticketId,
    ]);
  });

  it('7.112 a missing, empty or repeated workspaceId is the same 400 for a member and a stranger, and still 401 with no session', async () => {
    const malformed: Record<string, string | string[] | undefined>[] = [
      {},
      { workspaceId: '' },
      { workspaceId: [read.world.workspaceId, read.neighbour.workspaceId] },
    ];

    for (const params of malformed) {
      const member = await request('member', params);
      expect(member.statusCode).toBe(400);
      expect(member.json()).toEqual({ error: 'invalid_query' });

      // A request that names NO workspace has no membership question to answer
      // and nothing it could disclose, so the two callers are told the same
      // thing — headers included.
      const stranger = await request('stranger', params);
      expect(stranger.statusCode).toBe(400);
      expect(stranger.body).toBe(member.body);
      expect(comparableHeaders(stranger)).toEqual(comparableHeaders(member));

      // The session check still runs FIRST: a malformed query from nobody is
      // 401, not 400.
      const anonymous = await read.app.inject({ method: 'GET', url: myWorkUrl(params) });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json()).toEqual(UNAUTHENTICATED_BODY);
    }

    // Positive control: the same route with a well-formed workspaceId is a 200,
    // so the three 400s are the refusal and not the route's only answer.
    expect((await myWork('member')).statusCode).toBe(200);
  });
});
