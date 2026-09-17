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
 *      guest from a list they are still the assignee of;
 *    - 7.113 a workspace ADMIN, who gets no read bypass, is the assignee of a
 *      project-mode row in a project they are on — and their whole answer is
 *      three empty groups at 200.
 *
 * ## The three door answers, and which case pins each
 *
 * - **401** `{error:'unauthenticated'}` — no session, and a FORGED bearer alike
 *   (7.110), with the same URL answering 200 once a real session is attached.
 * - **404** — a caller outside the workspace, the owner of a NEIGHBOUR
 *   workspace, and a nonexistent workspace id, byte-identical down to
 *   `content-length` against the frozen `READ_NOT_FOUND_BODY` (7.111).
 * - **200 with an empty result** — a MEMBER who may see nothing (7.113). The
 *   emptiness is the visibility predicate answering, not the door, which is why
 *   that case seeds a row the caller IS the assignee of and reads it back from
 *   `proj_tickets` before asserting it absent. 7.113 also holds the two answers
 *   side by side: the admin's 200-and-empty against the stranger's 404.
 *
 * ## Which role cells this file exercises
 *
 * All eight of the shared world's. `owner` (the visibility predicate compiled to
 * `TRUE`, so the tenancy clause is the only boundary left, 7.103/7.106);
 * `member` (the three-armed disjunction, 7.26/7.27/7.105); `outsider` (a
 * workspace member with an EMPTY `eff.projects`, 7.104); `guest` (the explicit
 * arm alone, and an audience narrowing under it, 7.108); `admin` (the cell that
 * proves an admin shares the MEMBER branch rather than the owner's bypass,
 * 7.113 — MEASURED: adding `case 'admin'` to `visibleTicketsWhere`'s owner arm
 * reddens 7.113 and nothing else); `projectLead` (a plain workspace member whose
 * project roster row is then DELETED, 7.26/7.107); `stranger` and `neighbour`
 * (the two 404s, 7.111).
 *
 * One over-permissive mutation is NOT caught here and is recorded rather than
 * left to look covered: giving the `guest` branch the member clause's project
 * disjunct passes all fourteen cases, because every guest fixture here is
 * explicit-mode and `eff.projects` is empty for a guest anyway. It reddens five
 * of the ten cases in `test/read/visible-where.test.ts`, which is the file that
 * owns the predicate and seeds a guest ON a project roster for exactly this.
 * MEASURED, both halves.
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
 * ## Three cases MUTATE the world, and they are declared after their readers
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
  /**
   * admin, seeded project, project-mode — and `admin` is on NO project, so this
   * is a row they are the assignee of and may not read. It is what makes their
   * empty answer the VISIBILITY PREDICATE answering rather than "nobody gave
   * this person any work".
   */
  adminProjectId: string;
  /**
   * NOBODY's assignee, explicit `[owner, guest]` — the errand HANDED to the
   * guest. Case 13.176's subject: it is in none of the three groups for anybody,
   * so before `shared` existed no read in the product could return it.
   */
  guestSharedParentId: string;
  /**
   * Child of `guestSharedParentId`, authoring NO `visibility.set` of its own —
   * so its audience is INHERITED (`resolved_from` names the parent). Unassigned,
   * for the same reason as its parent.
   */
  guestSharedChildId: string;
  /**
   * Explicit to `[member]` and to NOBODY ELSE — the only audience in the seeded
   * workspace that does not name the owner, and assigned to nobody.
   *
   * It exists because without it 7.262 could not mean what its name says.
   * Every other `explicitTo` here lists the owner, so "the owner's shared holds
   * only what NAMES them" was satisfied by any implementation that returned
   * every `explicit`-mode row — the audience half of the clause had no fixture
   * that could redden it. MEASURED, not suspected: dropping the
   * `= ANY (resolved_user_ids)` test reddens 7.262 only once this row exists.
   */
  memberOnlySharedId: string;
  /**
   * In the SIBLING project, explicit `[owner]`, assigned to NOBODY. The owner's
   * every GROUP card is in the seeded project, so the sibling project's name can
   * reach `projectNames` through a shared card and through nothing else — which
   * is what makes including `shared` in that walk a falsifiable claim rather
   * than a line no fixture could redden.
   */
  ownerSharedSiblingId: string;
  /**
   * In the NEIGHBOUR workspace, explicit `[neighbour, guest]` — the seeded
   * guest is NAMED in an audience one tenancy over, while being a member only
   * here. The tenancy fixture, and it is NOT the one the door already covers:
   * `requireMember` stops the guest ASKING for the neighbour's workspace, and
   * stops nothing about this row arriving inside the answer they may ask for.
   */
  guestNeighbourSharedId: string;
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
  const adminProjectId = myWorkTicketId(10 + OWNER_ORDER_COUNT);
  const guestSharedParentId = myWorkTicketId(11 + OWNER_ORDER_COUNT);
  const guestSharedChildId = myWorkTicketId(12 + OWNER_ORDER_COUNT);
  const guestNeighbourSharedId = myWorkTicketId(13 + OWNER_ORDER_COUNT);
  const ownerSharedSiblingId = myWorkTicketId(14 + OWNER_ORDER_COUNT);
  const memberOnlySharedId = myWorkTicketId(15 + OWNER_ORDER_COUNT);

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

    ...assigned(adminProjectId, 'Audit the petty cash float', world.userIds.admin, projectId),

    // 13.176's errands: HANDED to the guest, assigned to nobody. `assigned()` is
    // deliberately not used — an assignment would put these in a group and make
    // `shared` redundant for exactly the case it exists to serve.
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: guestSharedParentId },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId, parentId: null, title: 'Collect the shop keys' },
    }),
    explicitTo(guestSharedParentId, [owner, guest]),

    // The owner's own handed errand, in the SIBLING project and assigned to
    // nobody — see `ownerSharedSiblingId` for why the project matters.
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: ownerSharedSiblingId },
      type: 'ticket.created',
      payload: {
        typeId: 'task',
        projectId: world.sibling.projectId,
        parentId: null,
        title: 'Countersign the sibling lease',
      },
    }),
    explicitTo(ownerSharedSiblingId, [owner]),

    // The audience that does NOT name the owner — see `memberOnlySharedId`.
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: memberOnlySharedId },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId, parentId: null, title: 'Reconcile the till float' },
    }),
    explicitTo(memberOnlySharedId, [member]),
    // No `visibility.set` of its own: the audience is its parent's, resolved.
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: guestSharedChildId },
      type: 'ticket.created',
      payload: {
        typeId: 'task',
        projectId,
        parentId: guestSharedParentId,
        title: 'Label the spare set',
      },
    }),
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

    // THE TENANCY ROW FOR `shared` (7.261). A ticket next door whose audience
    // NAMES the seeded guest — an id in a `text[]`, which is all
    // `resolved_user_ids` ever holds, so nothing about this is malformed. The
    // guest is a member HERE and a stranger THERE, and the only thing keeping
    // this row out of the answer they are entitled to ask for is the read's own
    // `t.workspace_id` conjunct.
    makeCommitted({
      workspaceId: world.neighbour.workspaceId,
      actorId: world.userIds.neighbour,
      entity: { kind: 'ticket', id: guestNeighbourSharedId },
      type: 'ticket.created',
      payload: {
        typeId: 'nb-task',
        projectId: world.neighbour.projectId,
        parentId: null,
        title: 'Next Door stocktake',
      },
    }),
    makeCommitted({
      workspaceId: world.neighbour.workspaceId,
      actorId: world.userIds.neighbour,
      entity: { kind: 'ticket', id: guestNeighbourSharedId },
      type: 'visibility.set',
      payload: {
        ticketId: guestNeighbourSharedId,
        mode: 'explicit',
        userIds: [world.userIds.neighbour, guest],
      },
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
    adminProjectId,
    guestSharedParentId,
    guestSharedChildId,
    guestNeighbourSharedId,
    ownerSharedSiblingId,
    memberOnlySharedId,
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
    // `sharedTask`'s id and title are NO LONGER checked as body substrings, and
    // that is the SAME correction the epic already carries three lines down
    // rather than a weakening. `sharedTask` is explicit to `[owner, member]`, so
    // since `shared` exists it appears in this member's body legitimately — as a
    // card in the section that says it was handed to them. A body-substring
    // check cannot tell that from a leak; the card-id check above can, and it is
    // the one carrying the claim.
    //
    // The removal is converted into a STRONGER assertion rather than a silence:
    // the row is asserted to be exactly where it now belongs.
    expect(body.shared.map((c) => c.ticketId)).toContain(read.world.sharedTaskId);
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

  it('7.113 a workspace ADMIN gets 200 with three EMPTY groups — an admin has no read bypass, and the emptiness is the predicate rather than the door', async () => {
    const response = await myWork('admin');
    expect(response.statusCode).toBe(200);
    const body = response.json() as MyWorkResponse;

    // The third door answer, and the only all-empty one in this file: the gate
    // asked about the WORKSPACE and this caller is a member of it, so they are
    // let in and then shown nothing.
    expect(body.groups).toEqual({ open: [], active: [], terminal: [] });
    // The envelope still names what was asked, so an empty answer is legible
    // rather than indistinguishable from a route that lost its body.
    expect(body.workspaceId).toBe(read.world.workspaceId);

    // The emptiness is the VISIBILITY PREDICATE, not "nobody gave this person
    // work": there IS a ticket assigned to them, read back from the table to
    // prove the seeder wrote it, and `admin` is on no project so a project-mode
    // row is not theirs to read. An admin gets NO bypass — that is
    // `visibleTicketsWhere`'s member branch, deliberately shared.
    const { rows } = await db.pool.query<{ workspace_id: string; assignee_id: string }>(
      `SELECT workspace_id, assignee_id FROM proj_tickets WHERE ticket_id = $1`,
      [fx.adminProjectId],
    );
    expect(rows).toEqual([
      { workspace_id: read.world.workspaceId, assignee_id: read.userIds.admin },
    ]);
    expect(response.body).not.toContain(fx.adminProjectId);
    expect(response.body).not.toContain('petty cash');

    // Positive control: the SAME url, a caller who may see rows, a non-empty
    // answer — so the three empty arrays are this viewer's answer and not the
    // route's only one.
    expect((await groupIds('member')).open).toEqual([fx.memberOpenId, fx.memberSiblingOpenId]);

    // And the distinction this cell exists for: a member with nothing visible is
    // 200-and-empty, while somebody outside the workspace is 404. Two different
    // answers to two different questions, in one case.
    expect((await myWork('stranger')).statusCode).toBe(404);
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

    // THE CONTROL TWIN, in the same body: `memberOpen` matches the hidden ticket
    // on the four things this route filters by — the same project, the same
    // type, the same state category, the same assignee — and differs in its
    // RESOLVED VISIBILITY MODE. Stated exactly that way rather than as
    // "identical except": the two come from different seeders and the hidden
    // one also carries a comment and a due-date claim, none of which this route
    // reads. It is present, so the absence above is the visibility predicate.
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

describe('GET /v1/me/work — my contested claims (ruling P40)', () => {
  /**
   * The `contested` key is the viewer's OWN refused claims, and both halves of
   * that sentence are gated here: whose claims (7.216) and how much of the
   * ticket they may still be told (7.217).
   *
   * Contests are appended in this describe rather than in the shared seed
   * because they add no ticket rows and move no group's arithmetic — the cases
   * above assert card counts and `ticket_id` order per viewer, and a contest
   * touches neither.
   */
  const contestOn = (ticketId: string, claimantId: string, rule: string, reason: string): LedgerEvent =>
    makeCommitted({
      workspaceId: read.world.workspaceId,
      actorId: read.world.owner,
      entity: { kind: 'ticket', id: ticketId },
      type: 'claim.contested',
      payload: {
        // The REFUSED envelope, whole. `claimant_id` is projected from
        // `originalEvent.actorId` and deliberately NOT from the contest's own
        // actor: the server files the contest, the claimant made the claim.
        originalEvent: {
          id: newUlid(),
          workspaceId: read.world.workspaceId,
          entity: { kind: 'ticket', id: ticketId },
          type: 'ticket.transitioned',
          version: 1,
          payload: { toStateId: 'done' },
          actorId: claimantId,
          origin: 'web',
          clientTime: '2026-08-20T09:00:00.000Z',
        },
        rule,
        reason,
      },
    });

  beforeAll(async () => {
    await applyCommitted(db.pool, [
      // The OWNER's own claim, on a ticket the owner can see.
      contestOn(fx.ownerOrderIds[0] as string, read.world.owner, 'require-field', 'A due date is required before this move.'),
      // The MEMBER's claim, on the ticket the member is ASSIGNED but may NOT
      // SEE — the shared world's planted hidden task, explicit to the owner
      // alone. This is 7.217's whole fixture: a contest that outlives the
      // claimant's sight of its ticket.
      contestOn(read.world.hiddenTaskId, read.userIds.member, 'restrict-to', 'Only the assignee may perform this transition.'),
    ]);
  }, 60_000);

  it('7.216 THE EXCLUSION — a viewer gets their OWN contested claims and never another person’s', async () => {
    const asOwner = await read.app.inject({
      method: 'GET',
      url: `/v1/me/work?workspaceId=${read.world.workspaceId}`,
      headers: read.authOf('owner'),
    });
    const asMember = await read.app.inject({
      method: 'GET',
      url: `/v1/me/work?workspaceId=${read.world.workspaceId}`,
      headers: read.authOf('member'),
    });
    expect(asOwner.statusCode).toBe(200);
    expect(asMember.statusCode).toBe(200);
    const owner = (asOwner.json() as MyWorkResponse).contested;
    const member = (asMember.json() as MyWorkResponse).contested;

    // Each sees exactly one — their own. Both halves in one run, so "the member
    // does not see the owner's" is a distinction this filter really draws
    // rather than an answer that is empty for both.
    expect(owner.map((each) => each.ticketId)).toEqual([fx.ownerOrderIds[0]]);
    expect(member.map((each) => each.ticketId)).toEqual([read.world.hiddenTaskId]);
    // Stated as the exclusion too, because that is the sentence the mutation
    // has to break: dropping `c.claimant_id = $2` puts BOTH rows in BOTH
    // answers, and these two lines are what say so.
    expect(owner.map((each) => each.ticketId)).not.toContain(read.world.hiddenTaskId);
    expect(member.map((each) => each.ticketId)).not.toContain(fx.ownerOrderIds[0]);
    // The claimant on the row is the CLAIMANT, not the contest's actor (the
    // owner filed both through `makeCommitted`).
    expect(member[0]?.claim.actorId).toBe(read.userIds.member);
  });

  it('7.217 the contested title is gated by canSee AT READ TIME — the row survives, the title does not', async () => {
    const res = await read.app.inject({
      method: 'GET',
      url: `/v1/me/work?workspaceId=${read.world.workspaceId}`,
      headers: read.authOf('member'),
    });
    expect(res.statusCode).toBe(200);
    const contested = (res.json() as MyWorkResponse).contested;
    expect(contested).toHaveLength(1);

    // The member made this claim, so the REFUSAL is theirs to see...
    expect(contested[0]?.ticketId).toBe(read.world.hiddenTaskId);
    expect(contested[0]?.rule).toBe('restrict-to');
    expect(contested[0]?.reason).toBe('Only the assignee may perform this transition.');
    // ...and the TICKET is not: it is explicit to the owner alone. Losing the
    // row would lose the record of their own refused claim; carrying the title
    // would disclose a ticket they may not read. So the title is null and the
    // id is kept — the existence-without-title register.
    expect(contested[0]?.title).toBeNull();

    // Positive control, same run, different viewer: the gate really can serve a
    // title, so `null` above is `canSee` answering rather than a route that
    // never joins one.
    const asOwner = await read.app.inject({
      method: 'GET',
      url: `/v1/me/work?workspaceId=${read.world.workspaceId}`,
      headers: read.authOf('owner'),
    });
    const ownerRows = (asOwner.json() as MyWorkResponse).contested;
    // The seeder titles the owner's queue `Owner queue XX`. Asserted by VALUE
    // and against the id, so a route echoing the ticket id into `title` — the
    // exact shape the old refusal warned about ("a title this client made up")
    // — fails here rather than satisfying a non-null check.
    expect(ownerRows[0]?.title).toMatch(/^Owner queue /);
    expect(ownerRows[0]?.title).not.toBe(ownerRows[0]?.ticketId);
  });

  it('7.218 the refused claim carries no serverTime, and contestedAt is the CONTEST’s own instant (P39)', async () => {
    const res = await read.app.inject({
      method: 'GET',
      url: `/v1/me/work?workspaceId=${read.world.workspaceId}`,
      headers: read.authOf('member'),
    });
    const claim = (res.json() as MyWorkResponse).contested[0]?.claim;
    // The three members the type has, and no fourth. `toEqual` on the key list
    // rather than a `toHaveProperty` chain, so a `serverTime` smuggled in is a
    // failure and not an unobserved extra.
    expect(Object.keys(claim ?? {}).sort()).toEqual(['actorId', 'clientTime', 'contestedAt']);
    // `clientTime` is the claimant's DEVICE instant, off the refused envelope,
    // pinned to the literal the fixture sent so a substituted clock is visible.
    expect(claim?.clientTime).toBe('2026-08-20T09:00:00.000Z');
    // `contestedAt` is a real instant and is NOT the claim's — spending one for
    // the other is ruling P36's option 3, refused in writing.
    expect(claim?.contestedAt).toEqual(expect.any(String));
    expect(claim?.contestedAt).not.toBe(claim?.clientTime);
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

  // -------------------------------------------------------------------------
  // `shared` — the errands handed to this viewer BY NAME (case 13.176)
  // -------------------------------------------------------------------------

  it('7.260 an errand SHARED with the guest and assigned to nobody is answered — the read that did not exist', async () => {
    const response = await myWork('guest');
    expect(response.statusCode).toBe(200);
    const body = response.json() as MyWorkResponse;

    // The whole of it, as an exact SET: the two handed errands (parent and the
    // child that inherits its audience), the one that is BOTH assigned to them
    // and shared with them, and the shared world's own `guestTask`. Exact, not a
    // `toContain`, so a predicate that widened fails here rather than passing by
    // inclusion — `guestNarrow`, whose audience was re-set to `[owner]`, is the
    // row this array is missing on purpose.
    //
    // SORTED on both sides because three of the four ids are `newUlid()`s from
    // the shared world, and this file's own docblock records that `newUlid` is
    // not monotonic inside a millisecond. An order assertion over them would be
    // a coin flip that usually lands heads; the ORDER claim is 7.103's, over the
    // hand-built ids that do sort deterministically.
    expect([...body.shared.map((card) => card.ticketId)].sort()).toEqual(
      [
        read.world.guestTaskId,
        fx.guestKeepId,
        fx.guestSharedParentId,
        fx.guestSharedChildId,
      ].sort(),
    );

    // THE POINT OF THE CASE: the handed errands are in NO group, so before this
    // key the guest's answer named neither of them. `guestKeepId` IS in a group,
    // which is what makes this a claim about the other two rather than about an
    // empty response.
    const grouped = [...body.groups.open, ...body.groups.active, ...body.groups.terminal].map(
      (card) => card.ticketId,
    );
    expect(grouped).not.toContain(fx.guestSharedParentId);
    expect(grouped).not.toContain(fx.guestSharedChildId);
    expect(grouped).toContain(fx.guestKeepId);

    // And the overlap is deliberate rather than a bug: a ticket both assigned to
    // and shared with somebody is two claims about one errand, and `shared`
    // keeps the second.
    expect(body.shared.map((card) => card.ticketId)).toContain(fx.guestKeepId);
  });

  it('7.261 THE TENANCY FIXTURE — an audience naming this viewer NEXT DOOR stays next door', async () => {
    const response = await myWork('guest');
    expect(response.statusCode).toBe(200);

    // Not as a card, not as an id, not as a word of its title.
    expect(response.body).not.toContain(fx.guestNeighbourSharedId);
    expect(response.body).not.toContain('Next Door stocktake');

    // The row EXISTS and its audience really does name this viewer — read from
    // the projection directly, so the absence above is the workspace conjunct
    // and not a seeder that wrote nothing. Without it this row is `explicit` and
    // names the guest, so it would satisfy `explicitAudienceWhere` outright.
    const { rows } = await db.pool.query<{ workspace_id: string; resolved_mode: string; resolved_user_ids: string[] }>(
      `SELECT workspace_id, resolved_mode, resolved_user_ids FROM proj_visibility WHERE ticket_id = $1`,
      [fx.guestNeighbourSharedId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.workspace_id).toBe(read.neighbour.workspaceId);
    expect(rows[0]?.resolved_mode).toBe('explicit');
    expect(rows[0]?.resolved_user_ids).toContain(read.userIds.guest);

    // Positive control for the substring checks: the ids that DID come back are
    // in the body, so `not.toContain` is not passing against an error page.
    expect(response.body).toContain(fx.guestSharedParentId);

    // And the door is NOT what covers this: it stops the guest ASKING next door,
    // which is a different question from what may arrive in the answer they are
    // entitled to ask for.
    expect((await request('guest', { workspaceId: read.neighbour.workspaceId })).statusCode).toBe(404);
  });

  it('7.262 an OWNER gets only what NAMES them — reading everything is not being handed anything', async () => {
    const response = await myWork('owner');
    expect(response.statusCode).toBe(200);
    const body = response.json() as MyWorkResponse;
    const sharedIds = body.shared.map((card) => card.ticketId);

    // The owner may read every ticket in the workspace — `visibleTicketsWhere`
    // compiles to `TRUE` for them — so a `shared` built on visibility rather
    // than on the audience would hand them the WHOLE WORKSPACE under a heading
    // that says these were shared with them. Their own five project-mode
    // tickets are the control: visible to them, naming nobody, and absent.
    for (const id of fx.ownerOrderIds) {
      expect(sharedIds, 'a project-mode ticket the owner can read is not one shared WITH them').not.toContain(id);
    }
    expect(sharedIds).not.toContain(fx.memberOpenId);

    // THE AUDIENCE HALF, and this row is why the case can mean what it says.
    // Every OTHER explicit audience in this workspace lists the owner, so
    // "only what NAMES them" was satisfied by any implementation returning
    // every `explicit`-mode row — the `= ANY (resolved_user_ids)` test had no
    // fixture that could redden it. This one is explicit to the MEMBER alone.
    expect(
      sharedIds,
      'an explicit ticket that does NOT name the owner is not shared WITH the owner, however visible it is',
    ).not.toContain(fx.memberOnlySharedId);

    // Read back: the row really is `explicit`, really names the member, and
    // really does not name the owner — so the absence is the audience test and
    // not a seeder that wrote a different mode.
    const audience = await db.pool.query<{ resolved_mode: string; resolved_user_ids: string[] }>(
      `SELECT resolved_mode, resolved_user_ids FROM proj_visibility WHERE ticket_id = $1`,
      [fx.memberOnlySharedId],
    );
    expect(audience.rows[0]?.resolved_mode).toBe('explicit');
    expect(audience.rows[0]?.resolved_user_ids).toEqual([read.userIds.member]);

    // And the MEMBER, who is named, does get it — so the absence above is this
    // viewer not being named rather than the row being unreachable to anybody.
    const memberShared = ((await myWork('member')).json() as MyWorkResponse).shared.map(
      (card) => card.ticketId,
    );
    expect(memberShared).toContain(fx.memberOnlySharedId);

    // Present-sibling: every audience that DOES name the owner is here — the
    // shared world's three plus this file's six — so the absences above are the
    // audience filter answering and not an empty list. Sorted, for the
    // `newUlid` reason given in 7.260.
    expect([...sharedIds].sort()).toEqual(
      [
        read.world.sharedTaskId,
        read.world.hiddenTaskId,
        read.world.guestTaskId,
        fx.outsiderExplicitId,
        fx.guestKeepId,
        fx.guestNarrowId,
        fx.leadExplicitId,
        fx.guestSharedParentId,
        fx.guestSharedChildId,
        fx.ownerSharedSiblingId,
      ].sort(),
    );

    // Read back from the projection: those five really are visible and really
    // are not `explicit`, so this is a fact about the fixture and not about the
    // route agreeing with itself.
    const { rows } = await db.pool.query<{ resolved_mode: string }>(
      `SELECT DISTINCT resolved_mode FROM proj_visibility WHERE ticket_id = ANY ($1::text[])`,
      [fx.ownerOrderIds],
    );
    expect(rows.map((row) => row.resolved_mode)).toEqual(['project']);
  });

  it('7.263 a NARROWED audience drops the row, and its twin that was never narrowed stays', async () => {
    // 7.108's pair, asked of `shared` instead of `groups`. `guestNarrowId` was
    // authored `[owner, guest]` and re-set to `[owner]`; `guestKeepId` never
    // was. Both are the same shape, from the same seeder, in the same project —
    // so the one that leaves is the audience changing and not a fixture that
    // differed.
    const body = (await myWork('guest')).json() as MyWorkResponse;
    const sharedIds = body.shared.map((card) => card.ticketId);
    expect(sharedIds).toContain(fx.guestKeepId);
    expect(sharedIds).not.toContain(fx.guestNarrowId);

    // The owner, still named on BOTH, gets both — so the row did not vanish from
    // the table, it stopped naming this viewer.
    const ownerShared = ((await myWork('owner')).json() as MyWorkResponse).shared.map(
      (card) => card.ticketId,
    );
    expect(ownerShared).toContain(fx.guestNarrowId);
    expect(ownerShared).toContain(fx.guestKeepId);
  });

  it('7.264 an INHERITED audience counts — the child authored no visibility.set of its own', async () => {
    const sharedIds = ((await myWork('guest')).json() as MyWorkResponse).shared.map(
      (card) => card.ticketId,
    );
    expect(sharedIds).toContain(fx.guestSharedChildId);

    // And it is genuinely inherited rather than separately authored — the
    // projection names the PARENT as the ticket whose authored mode won, and the
    // child's own columns claim nothing. Reading `own_user_ids` here is what
    // makes this a case about inheritance: an implementation switched to
    // `own_user_ids` would still pass a test that only asserted presence.
    const { rows } = await db.pool.query<{ resolved_from: string; own_mode: string; own_user_ids: string[] }>(
      `SELECT resolved_from, own_mode, own_user_ids FROM proj_visibility WHERE ticket_id = $1`,
      [fx.guestSharedChildId],
    );
    expect(rows[0]?.resolved_from).toBe(fx.guestSharedParentId);
    expect(rows[0]?.own_mode).toBe('inherit');
    expect(rows[0]?.own_user_ids).toEqual([]);
  });

  it('7.265 stateNames is TOTAL over shared cards, and a withheld project name is ABSENT rather than wrong', async () => {
    const body = (await myWork('guest')).json() as MyWorkResponse;
    expect(body.shared.length).toBeGreaterThan(0);

    // TOTAL: the client's `WorkItem.stateName` is required and its mapper
    // refuses a missing key, so a shared card with no entry here is a body the
    // client cannot parse — the failure would land one layer away from its cause.
    for (const card of body.shared) {
      expect(Object.keys(body.stateNames), `no state name for shared card ${card.ticketId}`).toContain(
        card.ticketId,
      );
      expect(typeof body.stateNames[card.ticketId]).toBe('string');
    }

    // The guest is on NO project (rulings P32/P38), so every shared card's
    // project name is withheld — and withheld means NO ENTRY, never an empty
    // string or the id wearing a name's clothes.
    expect(body.projectNames).toEqual({});
    for (const card of body.shared) {
      expect(card.projectId.length).toBeGreaterThan(0);
    }

    // Positive control for the emptiness: the OWNER, who may be told the names,
    // gets a non-empty map from the same route for overlapping cards — so `{}`
    // above is the rule applying and not the map never being built.
    const ownerBody = (await myWork('owner')).json() as MyWorkResponse;
    expect(Object.keys(ownerBody.projectNames).length).toBeGreaterThan(0);
    expect(ownerBody.projectNames[read.world.projectId]).toBeDefined();

    // And the SHARED cards are genuinely part of that walk rather than riding on
    // the groups' coat-tails. Every one of the owner's GROUP cards is in the
    // seeded project; `ownerSharedSibling` is the only card of theirs in the
    // SIBLING project, and it is a shared one. So this key is in the map because
    // the walk includes `shared`, and dropping `shared` from that walk reddens
    // here and nowhere else.
    expect(ownerBody.groups.open.map((card) => card.projectId)).not.toContain(
      read.sibling.projectId,
    );
    expect(ownerBody.shared.map((card) => card.projectId)).toContain(read.sibling.projectId);
    expect(ownerBody.projectNames[read.sibling.projectId]).toBeDefined();
  });
});

/**
 * 13.576 (backlog/closed spec §3.2, 2026-09-17) — a closed ticket assigned to
 * the caller is gone from every group; a backlog ticket assigned to them is
 * in `open`, exactly where `bucketFor`'s existing `open`/`active`/`terminal`
 * switch already sends every other `open`-category ticket. A closed ticket
 * merely HANDED to the caller (explicit, never assigned) is gone from
 * `shared` too — the second `where` array, `sharedWithMeRows`'s own, carries
 * the identical `t.closed_at IS NULL` conjunct and this is the only case that
 * exercises it.
 *
 * DECLARED LAST and MUTATING, following this file's own rule for cases that
 * change the shared world's assignment state (7.26's second case, 7.107,
 * 7.108): every case above that reads `member`'s groups by an EXACT array has
 * already run by the time this one seeds more tickets assigned to `member`,
 * so neither of those arrays gains an unexpected third element.
 */
describe('GET /v1/me/work — backlog and closed (owner request, 2026-09-17)', () => {
  it('13.576 the closed ticket is in no group and not in `shared`; the backlog ticket is, in `open`', async () => {
    const backlogId = newUlid();
    const closedId = newUlid();
    const sharedClosedId = newUlid();
    const ws = { workspaceId: read.world.workspaceId, actorId: read.world.owner };

    await applyCommitted(db.pool, [
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: backlogId },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: read.world.projectId, parentId: null, title: 'Assigned, still in backlog', start: 'backlog' },
      }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: backlogId }, type: 'ticket.assigned', payload: { assigneeId: read.world.member } }),

      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: closedId },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: read.world.projectId, parentId: null, title: 'Assigned, then closed' },
      }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: closedId }, type: 'ticket.assigned', payload: { assigneeId: read.world.member } }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: closedId }, type: 'ticket.transitioned', payload: { to: 'done' } }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: closedId }, type: 'ticket.closed', payload: {} }),

      // HANDED to the member, never assigned — the `shared` half, exercising
      // `sharedWithMeRows`'s own copy of the `closed_at` conjunct rather than
      // `readMyWork`'s.
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: sharedClosedId },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: read.world.projectId, parentId: null, title: 'Handed, then closed' },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: sharedClosedId },
        type: 'visibility.set',
        payload: { ticketId: sharedClosedId, mode: 'explicit', userIds: [read.world.owner, read.world.member] },
      }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: sharedClosedId }, type: 'ticket.transitioned', payload: { to: 'done' } }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: sharedClosedId }, type: 'ticket.closed', payload: {} }),
    ]);

    // The positive controls, read back before the route is asked anything —
    // the precedent is 7.113, which reads a row out of `proj_tickets` before
    // asserting it absent from an answer.
    const rows = await db.pool.query<{ ticket_id: string; assignee_id: string | null; state_category: string; closed_at: Date | null }>(
      'SELECT ticket_id, assignee_id, state_category, closed_at FROM proj_tickets WHERE ticket_id = ANY ($1::text[])',
      [[backlogId, closedId, sharedClosedId]],
    );
    const byId = new Map(rows.rows.map((row) => [row.ticket_id, row]));
    expect(byId.get(backlogId)).toMatchObject({ assignee_id: read.world.member, state_category: 'open' });
    expect(byId.get(closedId)?.assignee_id).toBe(read.world.member);
    expect(byId.get(closedId)?.closed_at).not.toBeNull();
    expect(byId.get(sharedClosedId)?.assignee_id).toBeNull();
    expect(byId.get(sharedClosedId)?.closed_at).not.toBeNull();

    const groups = await groupIds('member');
    expect(groups.open).toContain(backlogId);
    const everyGroup = [...groups.open, ...groups.active, ...groups.terminal];
    expect(everyGroup).not.toContain(closedId);

    const response = await myWork('member');
    expect(response.statusCode).toBe(200);
    const shared = (response.json() as MyWorkResponse).shared.map((card) => card.ticketId);
    expect(shared).not.toContain(sharedClosedId);
  });
});
