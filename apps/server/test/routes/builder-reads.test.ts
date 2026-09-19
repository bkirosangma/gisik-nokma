import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  membershipId,
  newUlid,
  type MemberListResponse,
  type StateOccupancyResponse,
  type TicketCountsResponse,
  type TicketTypeListResponse,
  type TypePopulationResponse,
  type WorkflowListResponse,
  type WorkflowResponse,
} from '@gisik-nokma/domain';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
import { INVALID_VERSION_BODY } from '../../src/routes/builder-reads.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * Plan 5 Task 9b — the BUILDER read surface, and the bulk rebind beside it.
 *
 * ## What is different about this surface, and therefore about this file
 *
 * Tasks 8 and 9 serve WORK: a board and a list of tickets, filtered by what the
 * caller may see. This task serves the SHAPE of the workspace — which workflows
 * exist, what states they carry, which ticket types are bound to them, who is
 * on the roster, and how much live work sits in each state. None of that passes
 * through `visibleTicketsWhere`, so "an empty answer is the visibility
 * predicate speaking" is NOT available here as it was there. Every refusal on
 * this surface is the door, and the door is therefore the whole subject.
 *
 * ## The access decision, route by route — the plan's, not this file's
 *
 * | route | who | where it is decided |
 * |---|---|---|
 * | `/workflows` | any member, GUESTS INCLUDED | plan: a guest's shared ticket cannot render its status without the definition |
 * | `/workflows/:id` | same | same |
 * | `/ticket-types` | same | same argument, one step along: a shared ticket renders its type's name and icon |
 * | `/members` | any NON-GUEST member — and GUESTS ARE WITHHELD from non-admin callers | plan for the withholding: the roster is not a directory of who else the workspace is talking to. That a guest may not CALL it is an EXECUTOR RULING (case 7.91) taken where the plan is silent |
 * | `/workflows/:id/state-occupancy` | owner/admin ONLY | plan: the honest number is the whole workspace's, so there is no per-viewer variant |
 * | `/ticket-types/:id/population` | owner/admin ONLY | plan: "on state-occupancy's exact terms and for its exact reason" |
 * | `POST …/migrate` | owner/admin ONLY | NOT in the plan text — see the migrate describe block |
 *
 * The admin-only refusal is **404 and never 403**, exactly as `requireMember`'s
 * is, and for the same reason: a 403 tells somebody a workflow exists. So a
 * plain member and a total stranger get the same bytes, and the case below
 * compares them rather than checking one status twice.
 *
 * ## One database, one seed, and the mutating cases go LAST
 *
 * `seedReadScenario` refuses a second seed into one database, so this file takes
 * one `createTestDatabase` and seeds once through `buildReadTestApp`. The cases
 * that WRITE to the ledger all sit at the END, and each states what it leaves
 * behind where it sits: the migrate block (which moves live tickets between
 * workflows), the revocation (7.87, which removes `member`'s workspace grant),
 * and the two prototype-key blocks (7.88 and 7.89, which each seed a workflow,
 * a type and tickets of their own). Everything above them is read-only and
 * order-independent. 7.90 sits among the read-only cases deliberately: its one
 * write-shaped call is a migration refused on the merits, and it asserts the
 * ledger row count is unchanged across the whole case.
 *
 * ## Nothing here moves with `TZ`
 *
 * Stated rather than skipped, as `board.test.ts` does. Not one field on any of
 * these seven responses is a time: a definition, a type, a roster row and a
 * count carry no clock, so a `TZ`-varying case here would be a check that
 * cannot fail. Task 12's attention windows are where that discipline belongs.
 */

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let read: ReadWorld;

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
}, 60_000);

afterAll(async () => {
  await read.app.close();
  await db.drop();
});

/** A GET under some workspace's builder surface, as one of the six real sessions. */
function get(role: ReadRole, path: string, workspaceId = read.world.workspaceId): Promise<InjectResponse> {
  return read.app.inject({
    method: 'GET',
    url: `/v1/workspaces/${workspaceId}${path}`,
    headers: read.authOf(role),
  });
}

async function okJson<T>(role: ReadRole, path: string, workspaceId?: string): Promise<T> {
  const response = await get(role, path, workspaceId);
  expect(response.statusCode).toBe(200);
  return response.json() as T;
}

/**
 * Every response header except `date`, which is a clock reading and differs
 * between two requests for reasons unrelated to what is being compared.
 * `content-length` above all must match: a length that differed would itself be
 * the oracle even if both bodies parsed equal. (`board.test.ts`'s precedent.)
 */
/** How many events the ledger holds — the oracle for "nothing was appended". */
async function ledgerRows(): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM events');
  return rows[0]?.n ?? 0;
}

function comparableHeaders(response: InjectResponse): Record<string, unknown> {
  const { date: _date, ...rest } = response.headers;
  return rest;
}

describe('GET /v1/workspaces/:workspaceId/workflows', () => {
  it('7.36 answers the latest definition of EVERY workflow in the workspace, with its states and initialStateId', async () => {
    const body = await okJson<WorkflowListResponse>('member', '/workflows');
    expect(body.workspaceId).toBe(read.world.workspaceId);
    // TWO workflows, not one: `read-app.ts` defines `wf-second` on the sibling
    // project precisely so a roster that answered "the workflow this caller's
    // tickets are on" would be indistinguishable from one that answered "every
    // workflow defined here". The plan's snippet expects one and predates it.
    expect(body.workflows.map((def) => [def.id, def.version, def.name])).toEqual([
      ['wf-errands', 1, 'Errands'],
      ['wf-second', 1, 'Second flow'],
    ]);
    expect(body.workflows[0]?.states.map((state) => state.id)).toEqual(['todo', 'doing', 'waiting', 'done']);
    expect(body.workflows[0]?.initialStateId).toBe('todo');
    expect(body.workflows[1]?.states.map((state) => state.id)).toEqual(['todo', 'waiting', 'done']);
    expect(body.workflows[1]?.initialStateId).toBe('todo');
    // The neighbour's definition is not here, and its ABSENCE is only evidence
    // beside the presence of two that are — see 7.86 for the executable half.
    expect(body.workflows.map((def) => def.id)).not.toContain(read.neighbour.workflowId);
  });

  it('7.36 reaches a guest too — a shared ticket cannot render its status without its definition', async () => {
    const body = await okJson<WorkflowListResponse>('guest', '/workflows');
    expect(body.workflows.map((def) => def.id)).toEqual(['wf-errands', 'wf-second']);
  });

  it('7.36 a non-member, a neighbour and an unknown workspace all get the same 404; no session and a forged bearer are 401', async () => {
    const entitled = await get('member', '/workflows');
    expect(entitled.statusCode).toBe(200);

    const stranger = await get('stranger', '/workflows');
    const neighbour = await get('neighbour', '/workflows');
    const unknown = await get('member', '/workflows', newUlid());
    for (const refusal of [stranger, neighbour, unknown]) {
      expect(refusal.statusCode).toBe(404);
      expect(refusal.json()).toEqual(READ_NOT_FOUND_BODY);
    }
    expect(comparableHeaders(unknown)).toEqual(comparableHeaders(stranger));
    expect(comparableHeaders(neighbour)).toEqual(comparableHeaders(stranger));

    // The neighbour is not refused everywhere — their OWN workspace answers
    // them. Without this the 404 above would also pass for a route that 404s
    // every caller it has never seen.
    const own = await okJson<WorkflowListResponse>('neighbour', '/workflows', read.neighbour.workspaceId);
    expect(own.workflows.map((def) => def.id)).toEqual([read.neighbour.workflowId]);

    const anonymous = await read.app.inject({
      method: 'GET',
      url: `/v1/workspaces/${read.world.workspaceId}/workflows`,
    });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual(UNAUTHENTICATED_BODY);

    const forged = await read.app.inject({
      method: 'GET',
      url: `/v1/workspaces/${read.world.workspaceId}/workflows`,
      headers: { authorization: `Bearer ${newUlid()}` },
    });
    expect(forged.statusCode).toBe(401);
    expect(forged.json()).toEqual(UNAUTHENTICATED_BODY);
  });
});

describe('GET /v1/workspaces/:workspaceId/workflows/:workflowId', () => {
  it('7.37 answers the latest version by default and the exact version on request', async () => {
    const latest = await okJson<WorkflowResponse>('member', '/workflows/wf-errands');
    expect(latest.workspaceId).toBe(read.world.workspaceId);
    expect(latest.workflow.id).toBe('wf-errands');
    expect(latest.workflow.version).toBe(1);
    expect(latest.workflow.states.map((s) => s.id)).toEqual(['todo', 'doing', 'waiting', 'done']);
    const pinned = await okJson<WorkflowResponse>('member', '/workflows/wf-errands?version=1');
    expect(pinned.workflow).toEqual(latest.workflow);
  });

  it('7.37 refuses a malformed or non-positive version with 400, and 404s a version never published and a workflow that does not exist', async () => {
    for (const bad of ['one', '0', '-1', '1.5', '', ' ']) {
      const response = await get('member', `/workflows/wf-errands?version=${encodeURIComponent(bad)}`);
      expect([bad, response.statusCode]).toEqual([bad, 400]);
      expect(response.json()).toEqual(INVALID_VERSION_BODY);
    }
    // A version that was never published is a 404 and not an empty body.
    expect((await get('member', '/workflows/wf-errands?version=7')).statusCode).toBe(404);
    expect((await get('member', '/workflows/wf-ghost')).statusCode).toBe(404);
    // Positive control: the same route, same caller, a version that exists.
    expect((await get('member', '/workflows/wf-errands?version=1')).statusCode).toBe(200);
  });

  it('7.86 a workflow id that belongs to the NEIGHBOUR resolves nowhere from this workspace — `proj_workflows` is keyed globally', async () => {
    // Ruling P14, as a route case. `proj_workflows`' primary key is
    // `(workflow_id, version)` with `workspace_id` a plain column, so a lookup
    // by id ALONE answers with another tenant's row. The neighbour's workflow
    // is the row that would come back.
    const foreign = await get('owner', `/workflows/${read.neighbour.workflowId}`);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual(READ_NOT_FOUND_BODY);

    // POSITIVE CONTROL, and it is what makes the 404 above a refusal rather
    // than an id nobody ever published: the same id, asked for by the person
    // whose workspace it is, answers 200 with the definition.
    const own = await okJson<WorkflowResponse>(
      'neighbour',
      `/workflows/${read.neighbour.workflowId}`,
      read.neighbour.workspaceId,
    );
    expect(own.workflow.id).toBe(read.neighbour.workflowId);
    expect(own.workflow.name).toBe('Next Door flow');

    // And the same id is refused on the occupancy route, which resolves a
    // definition of its own through a different call.
    const occupancy = await get('owner', `/workflows/${read.neighbour.workflowId}/state-occupancy`);
    expect(occupancy.statusCode).toBe(404);
    expect((await get('neighbour', `/workflows/${read.neighbour.workflowId}/state-occupancy`, read.neighbour.workspaceId)).statusCode).toBe(200);
  });

  it('7.85 the door answers BEFORE the version is parsed — an unauthorised caller never reaches the parser', async () => {
    // Task 9's deviation (case 7.83) made the convention on this branch: the
    // tenancy gate runs first, so a stranger sending a malformed query gets the
    // 404 and not the 400 that would tell them the workspace is real.
    const stranger = await get('stranger', '/workflows/wf-errands?version=one');
    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual(READ_NOT_FOUND_BODY);

    // POSITIVE CONTROL: the identical URL from a member IS parsed, and refused
    // as a bad request. Without this the 404 above would pass for a route that
    // never validates the version at all.
    const member = await get('member', '/workflows/wf-errands?version=one');
    expect(member.statusCode).toBe(400);
    expect(member.json()).toEqual(INVALID_VERSION_BODY);
  });
});

describe('GET /v1/workspaces/:workspaceId/ticket-types', () => {
  it('7.38 answers every type defined in the workspace, with its name, icon, rank and workflow binding', async () => {
    const body = await okJson<TicketTypeListResponse>('member', '/ticket-types');
    expect(body.workspaceId).toBe(read.world.workspaceId);
    // Ordered by rank then type_id, so `chore` (rank 3, defined on the sibling
    // project against `wf-second`) sits between `epic` and `task`. The plan's
    // snippet expects two types and predates the sibling.
    expect(body.ticketTypes.map((type) => [type.id, type.rank, type.workflowId])).toEqual([
      ['epic', 1, 'wf-errands'],
      ['chore', 3, 'wf-second'],
      ['task', 3, 'wf-errands'],
    ]);
    expect(body.ticketTypes.map((type) => [type.name, type.icon])).toEqual([
      ['Epic', 'flag'],
      ['Chore', 'broom'],
      ['Task', 'check'],
    ]);
    expect(body.ticketTypes.map((type) => type.fields)).toEqual([[], [], []]);
    // The neighbour's `nb-task` is defined in another workspace and must not be
    // here; the three above are the positive control that makes its absence a
    // scope and not an empty table.
    expect(body.ticketTypes.map((type) => type.id)).not.toContain('nb-task');
  });

  it('7.38 a guest reads them too, and a stranger gets the tenancy 404', async () => {
    const guest = await okJson<TicketTypeListResponse>('guest', '/ticket-types');
    expect(guest.ticketTypes.map((type) => type.id)).toEqual(['epic', 'chore', 'task']);
    const stranger = await get('stranger', '/ticket-types');
    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual(READ_NOT_FOUND_BODY);
  });
});

describe('GET /v1/workspaces/:workspaceId/members', () => {
  it('7.39 answers userId, displayName and role, and the displayName is the vendor column verbatim', async () => {
    const body = await okJson<MemberListResponse>('owner', '/members');
    expect(body.workspaceId).toBe(read.world.workspaceId);
    // A MAP, never an array order: `user_id` is a ULID whose low bits are
    // random, so an ordered assertion would be a coin flip.
    const byUser = Object.fromEntries(body.members.map((m) => [m.userId, m.role]));
    expect(byUser).toEqual({
      [read.userIds.owner]: 'owner',
      [read.userIds.admin]: 'admin',
      [read.userIds.member]: 'member',
      [read.userIds.outsider]: 'member',
      [read.userIds.projectLead]: 'member',
      [read.userIds.guest]: 'guest',
    });
    // All four `WorkspaceRole` values travel, which is what `seedRoleAxis`
    // exists for: before it, `admin` appeared nowhere in the world and the role
    // column could have been a two-valued field for all this case knew.
    expect(new Set(Object.values(byUser))).toEqual(new Set(['owner', 'admin', 'member', 'guest']));
    // The neighbour is a member of a different workspace and appears nowhere.
    expect(byUser[read.userIds.neighbour]).toBeUndefined();
    expect(byUser[read.userIds.stranger]).toBeUndefined();

    // `typeof displayName === 'string'` would pass for a route that invented
    // one. The contract is that better-auth's `"user"."name"` TRAVELS, so the
    // expectation is read out of that column rather than restated here.
    const { rows } = await db.pool.query<{ id: string; name: string }>(
      'SELECT "id", "name" FROM "user" WHERE "id" = ANY ($1::text[])',
      [body.members.map((m) => m.userId)],
    );
    const vendorNames = Object.fromEntries(rows.map((row) => [row.id, row.name]));
    expect(Object.fromEntries(body.members.map((m) => [m.userId, m.displayName]))).toEqual(vendorNames);
    expect(Object.values(vendorNames).every((name) => typeof name === 'string' && name.length > 0)).toBe(true);
  });

  it('7.39 PLANTED DEFECT: a plain member never sees the guest — not the row, not the id — while an owner AND an admin do', async () => {
    const nonGuestRoster = {
      [read.userIds.owner]: 'owner',
      [read.userIds.admin]: 'admin',
      [read.userIds.member]: 'member',
      [read.userIds.outsider]: 'member',
      [read.userIds.projectLead]: 'member',
    };
    for (const role of ['member', 'outsider', 'projectLead'] as const) {
      const withheld = await get(role, '/members');
      expect([role, withheld.statusCode]).toEqual([role, 200]);
      // Not the id anywhere in the bytes, which also covers a route that
      // withheld the ROLE but kept the row.
      expect([role, withheld.body.includes(read.userIds.guest)]).toEqual([role, false]);
      const roster = withheld.json() as MemberListResponse;
      expect(roster.members.map((m) => m.role)).not.toContain('guest');
      // POSITIVE CONTROL: the roster is not empty — the other five are all
      // there, so the guest's absence is a withholding and not a broken read.
      expect(Object.fromEntries(roster.members.map((m) => [m.userId, m.role]))).toEqual(nonGuestRoster);
    }

    // `projectLead` above is the cell that makes the withholding a WORKSPACE
    // role question: they are project admin of the sibling project, and they
    // are still refused the guest. Both admin-shaped callers below see them.
    for (const role of ['owner', 'admin'] as const) {
      const privileged = await get(role, '/members');
      expect([role, privileged.statusCode]).toEqual([role, 200]);
      expect([role, privileged.body.includes(read.userIds.guest)]).toEqual([role, true]);
      expect([
        role,
        (privileged.json() as MemberListResponse).members.find((m) => m.userId === read.userIds.guest)?.role,
      ]).toEqual([role, 'guest']);
    }
  });

  it('7.91 EXECUTOR RULING: a guest may not call the roster at all, and gets the surface’s ordinary 404', async () => {
    // The plan settles who is HIDDEN from this listing and never says who may
    // CALL it, so a guest passed `requireMember` and received the workspace's
    // whole non-guest staff directory — ids and display names, none of it about
    // the one ticket they were invited to. Conservative default taken where the
    // plan is silent; cheap to reverse. Recorded in the coordination doc.
    const guest = await get('guest', '/members');
    expect(guest.statusCode).toBe(404);
    expect(guest.json()).toEqual(READ_NOT_FOUND_BODY);
    // The refusal is the SAME one every other refusal on this prefix answers —
    // headers included, so nobody learns the roster exists by being refused
    // differently from a stranger.
    const stranger = await get('stranger', '/members');
    expect(stranger.statusCode).toBe(404);
    expect(comparableHeaders(guest)).toEqual(comparableHeaders(stranger));
    // No id of anybody's leaks in the refusal body.
    for (const id of [read.userIds.owner, read.userIds.member, read.userIds.outsider]) {
      expect(guest.body).not.toContain(id);
    }

    // POSITIVE CONTROL, and it is what stops this passing for a broken guest
    // session: the SAME guest, the SAME workspace, still reads the two surfaces
    // the plan does give them — a shared ticket cannot render without these.
    expect((await get('guest', '/workflows')).statusCode).toBe(200);
    expect((await get('guest', '/ticket-types')).statusCode).toBe(200);
    // And a non-guest member still gets the roster, so the 404 is about being a
    // guest and not about the route.
    expect((await get('member', '/members')).statusCode).toBe(200);
  });
});

describe('GET /v1/workspaces/:workspaceId/workflows/:workflowId/state-occupancy', () => {
  it('7.40 counts the tickets sitting in each state of the workflow, zeroes included', async () => {
    const errands = await okJson<StateOccupancyResponse>('owner', '/workflows/wf-errands/state-occupancy');
    expect(errands.workspaceId).toBe(read.world.workspaceId);
    expect(errands.workflowId).toBe('wf-errands');
    // `done` is 0 AND `todo` is 4 in the same object: the zero has its positive
    // control beside it, so an occupancy that answered nothing at all cannot
    // pass by agreeing about the empty state.
    expect(errands.counts).toEqual({ todo: 4, doing: 1, waiting: 1, done: 0 });

    // The SECOND workflow, whose counts differ — an occupancy blind to the
    // workflow id would answer the same object twice.
    const second = await okJson<StateOccupancyResponse>('owner', '/workflows/wf-second/state-occupancy');
    expect(second.counts).toEqual({ todo: 1, waiting: 0, done: 0 });
  });

  it('7.40 PLANTED DEFECT: the count is the workspace truth, and only an admin may have it', async () => {
    // The hidden ticket — the one the member could never see — is INSIDE this
    // number. An occupancy that quietly dropped it would send a publish mapping
    // into production believing four tickets were three.
    const owner = await okJson<StateOccupancyResponse>('owner', '/workflows/wf-errands/state-occupancy');
    expect(owner.counts.todo).toBe(4);
    const { rows } = await db.pool.query<{ state_id: string }>(
      'SELECT state_id FROM proj_tickets WHERE ticket_id = $1',
      [read.world.hiddenTaskId],
    );
    expect(rows[0]?.state_id).toBe('todo');

    // A member, a guest, an off-project member and a stranger all read alike,
    // and alike means BYTE-IDENTICAL: nobody learns the workflow exists by
    // being refused differently.
    const refusals: InjectResponse[] = [];
    for (const role of ['member', 'guest', 'outsider', 'stranger', 'neighbour'] as const) {
      const response = await get(role, '/workflows/wf-errands/state-occupancy');
      expect([role, response.statusCode]).toEqual([role, 404]);
      expect(response.json()).toEqual(READ_NOT_FOUND_BODY);
      refusals.push(response);
    }
    const unknownWorkflow = await get('owner', '/workflows/wf-ghost/state-occupancy');
    expect(unknownWorkflow.statusCode).toBe(404);
    for (const refusal of refusals) {
      expect(comparableHeaders(refusal)).toEqual(comparableHeaders(unknownWorkflow));
    }
  });
});

describe('GET /v1/workspaces/:workspaceId/ticket-types/:typeId/population', () => {
  function population(role: ReadRole, typeId: string, workflowId: string, workspaceId?: string) {
    return get(role, `/ticket-types/${typeId}/population?workflowId=${encodeURIComponent(workflowId)}`, workspaceId);
  }

  it('7.44 answers how many tickets of the type are PINNED to that workflow, zeroes included', async () => {
    const task = (await population('owner', 'task', 'wf-errands')).json() as TypePopulationResponse;
    expect(task).toEqual({
      workspaceId: read.world.workspaceId,
      typeId: 'task',
      workflowId: 'wf-errands',
      count: 5,
    });

    // The ZERO and its positive control, on the same type: `chore` is bound to
    // `wf-second` and its one ticket sits there, so asking about `wf-errands`
    // is a real pairing that holds nothing. A count that ignored the workflow
    // would answer 1 to both.
    expect(((await population('owner', 'chore', 'wf-errands')).json() as TypePopulationResponse).count).toBe(0);
    expect(((await population('owner', 'chore', 'wf-second')).json() as TypePopulationResponse).count).toBe(1);
    // And one that ignored the TYPE would answer 6 here — every ticket on
    // `wf-errands` — rather than the epic's own 1.
    expect(((await population('owner', 'epic', 'wf-errands')).json() as TypePopulationResponse).count).toBe(1);
  });

  it('7.44 is admin-only on state-occupancy’s exact terms — members, guests and strangers get the same 404', async () => {
    const entitled = await population('owner', 'task', 'wf-errands');
    expect(entitled.statusCode).toBe(200);

    const refusals: InjectResponse[] = [];
    for (const role of ['member', 'guest', 'outsider', 'stranger', 'neighbour'] as const) {
      const response = await population(role, 'task', 'wf-errands');
      expect([role, response.statusCode]).toEqual([role, 404]);
      expect(response.json()).toEqual(READ_NOT_FOUND_BODY);
      refusals.push(response);
    }
    // An unknown type read by the person who IS entitled: the same bytes, so a
    // member cannot tell "not for you" from "no such type".
    const unknownType = await population('owner', 'no-such-type', 'wf-errands');
    expect(unknownType.statusCode).toBe(404);
    for (const refusal of refusals) {
      expect(comparableHeaders(refusal)).toEqual(comparableHeaders(unknownType));
    }
  });

  it('7.86 neither the type id nor the workflow id may resolve out of a neighbouring tenancy', async () => {
    // Both ids exist — in the NEIGHBOUR's workspace — and both are refused from
    // here. `proj_ticket_types` is keyed `(workspace_id, type_id)` so its own
    // key carries the scope, but `proj_workflows` is keyed globally and
    // `proj_tickets` is keyed on `ticket_id` alone, so neither is safe to
    // resolve on an actor-supplied id without a workspace correlation.
    expect((await population('owner', 'nb-task', 'nb-workflow')).statusCode).toBe(404);
    expect((await population('owner', 'task', 'nb-workflow')).statusCode).toBe(404);
    expect((await population('owner', 'nb-task', 'wf-errands')).statusCode).toBe(404);

    // POSITIVE CONTROL: the neighbour's own owner reads the same pairing in
    // their own workspace and gets the count, so the three 404s above are the
    // tenancy scope answering and not a route that refuses these ids to anyone.
    const own = (await population('neighbour', 'nb-task', 'nb-workflow', read.neighbour.workspaceId)).json() as TypePopulationResponse;
    expect(own).toEqual({
      workspaceId: read.neighbour.workspaceId,
      typeId: 'nb-task',
      workflowId: 'nb-workflow',
      count: 1,
    });
  });

  it('7.85 the door answers before `workflowId` is validated, and a missing one is a 400 rather than a guess', async () => {
    // No `workflowId` at all. The route will not fall back to the TYPE's own
    // binding: a ticket pins its workflow at creation, so the type's binding is
    // what NEW tickets get and answering with it would be a different number
    // wearing this one's name.
    const member = await get('owner', '/ticket-types/task/population');
    expect(member.statusCode).toBe(400);
    expect(member.json()).toEqual({ error: 'invalid_workflow_id' });
    expect((await get('owner', '/ticket-types/task/population?workflowId=')).statusCode).toBe(400);

    // The same malformed request from a non-admin gets the tenancy 404, not the
    // 400 — the door runs first, so nobody unauthorised reaches the parser.
    expect((await get('member', '/ticket-types/task/population')).statusCode).toBe(404);
    expect((await get('stranger', '/ticket-types/task/population')).statusCode).toBe(404);
    // POSITIVE CONTROL: the well-formed request from the entitled caller.
    expect((await population('owner', 'task', 'wf-errands')).statusCode).toBe(200);
  });
});

describe('the admin gate — which admin-ness the three admin-only surfaces mean', () => {
  /**
   * The predicate `isWorkspaceAdmin` is `workspaceRole === 'owner' || 'admin'`,
   * and until this case nothing in the suite could tell it from a wider one.
   *
   * MEASURED on this branch: widening it to
   * `owner || admin || [...eff.projects.values()].some((p) => p.projectAdmin)`
   * — a helper of exactly that shape is one import away, `hasProjectAdminRights`
   * in `permissions/effective-role.ts` — passed EVERY case in this file. The
   * reason was the fixture, not the predicate: `read-app.ts` had no plain
   * workspace member who was a project admin, so every project-admin caller in
   * the world was already a workspace owner and the two readings agreed on all
   * of them. `seedRoleAxis` adds that cell (`projectLead`) and this case is
   * where it is spent.
   *
   * The `admin` half is the same argument from the other side: the world held
   * no `admin`-role member at all, so `|| eff.workspaceRole === 'admin'` had no
   * caller that could reach it and "an admin may read the occupancy" was proved
   * only through `owner`. Deleting that disjunct now reddens this case and 7.39,
   * each naming `admin`. MEASURED.
   */
  it('7.90 a project admin who is a plain workspace member is refused all three, and a workspace admin is admitted to all three', async () => {
    // The fixture is what this case claims it is, read from the projection
    // rather than assumed from the seed: a WORKSPACE-scope row saying `member`,
    // and a PROJECT-scope row carrying the admin flag. Without this the refusals
    // below would also pass for a person who was never made a project admin.
    const { rows: cells } = await db.pool.query<{ scope_kind: string; role: string; project_admin: boolean }>(
      `SELECT scope_kind, role, project_admin FROM proj_memberships
        WHERE workspace_id = $1 AND user_id = $2 ORDER BY scope_kind`,
      [read.world.workspaceId, read.userIds.projectLead],
    );
    expect(cells).toEqual([
      { scope_kind: 'project', role: 'member', project_admin: true },
      { scope_kind: 'workspace', role: 'member', project_admin: false },
    ]);

    const before = await ledgerRows();
    // A body that would REACH the handler and be refused by one of its own
    // rules, so the gate is the only thing separating the two callers below —
    // and nothing is appended either way.
    const sameWorkflow = { fromWorkflowId: 'wf-errands', toWorkflowId: 'wf-errands', stateMap: { todo: 'todo' } };
    const migrateAs = (role: ReadRole): Promise<InjectResponse> =>
      read.app.inject({
        method: 'POST',
        url: `/v1/workspaces/${read.world.workspaceId}/ticket-types/task/migrate`,
        headers: read.authOf(role),
        payload: sameWorkflow,
      });

    const refused: InjectResponse[] = [
      await get('projectLead', '/workflows/wf-errands/state-occupancy'),
      await get('projectLead', '/ticket-types/task/population?workflowId=wf-errands'),
      await migrateAs('projectLead'),
    ];
    for (const response of refused) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual(READ_NOT_FOUND_BODY);
    }
    // Byte-identical to what a total stranger draws on the same prefix: project
    // admin-ness buys not even the knowledge that the workflow is there.
    const stranger = await get('stranger', '/workflows/wf-errands/state-occupancy');
    expect(comparableHeaders(refused[0] as InjectResponse)).toEqual(comparableHeaders(stranger));

    // The `admin` role passes all three. The occupancy and population answers
    // are asserted EQUAL TO THE OWNER'S, not merely 200: a gate that admitted
    // an admin to a route which then served them a narrowed number would be a
    // different defect wearing this one's status code.
    const adminOccupancy = await okJson<StateOccupancyResponse>('admin', '/workflows/wf-errands/state-occupancy');
    const ownerOccupancy = await okJson<StateOccupancyResponse>('owner', '/workflows/wf-errands/state-occupancy');
    expect(adminOccupancy).toEqual(ownerOccupancy);
    const adminPopulation = await okJson<TypePopulationResponse>('admin', '/ticket-types/task/population?workflowId=wf-errands');
    expect(adminPopulation).toEqual(
      await okJson<TypePopulationResponse>('owner', '/ticket-types/task/population?workflowId=wf-errands'),
    );
    // Past the migrate gate and into the route's own refusal, which is what a
    // 404 could not tell us: the admin was admitted, then refused on the merits.
    const adminMigrate = await migrateAs('admin');
    expect(adminMigrate.statusCode).toBe(422);
    expect((adminMigrate.json() as { rule: string }).rule).toBe('migration.same-workflow');

    // Nothing this case did wrote anything.
    expect(await ledgerRows()).toBe(before);
  });
});

/**
 * `POST /v1/workspaces/:workspaceId/ticket-types/:typeId/migrate` — the bulk
 * rebind, and the only route on this surface that WRITES.
 *
 * ## These cases mutate the world, and they are last for that reason
 *
 * Everything above this point is read-only and order-independent. A successful
 * migration moves live tickets between workflows, which changes what the
 * occupancy and population reads answer, so these cases sit at the end of the
 * file and each states what it left behind. Where a case needs a number it did
 * not seed, it READS it rather than restating a constant that the case above it
 * may have moved.
 *
 * ## The access decision here is MINE, not the plan's — and it is the strict one
 *
 * The plan gives this route two answers, `200` and `422`, and never says what a
 * non-admin gets. `ticket.workflow_rebound` is in Plan 4's `ADMIN_ONLY_TYPES`,
 * so ingest would refuse a member's events anyway — but Task 16's case 7.45
 * requires the refusal to arrive "before a single event is built", which is
 * exactly what deferring to ingest does not do. So the route carries its own
 * gate, and it answers **404** rather than the 403 `GET /v1/workspaces/:id/invites`
 * uses: 404 is what the two sibling admin-only routes on this same path prefix
 * answer, it leaks strictly less, and choosing the permissive reading on a
 * surface that re-homes other people's work is not a call to make silently.
 */
/**
 * Task 8 (settings → workflows) — the ticket-type list's `"N tickets"` count.
 *
 * ## Why this block sits HERE, between the pinned read and the migrate suites
 *
 * It has to run while the world is PRISTINE, and that is a measured constraint
 * rather than a taste. The very first thing this file's migrate suite does is
 * REBIND `chore` onto `wf-errands` (`:699-700` assert the move), and `chore` is
 * the whole distinguishing fixture below: before that rebind its one ticket is
 * on `wf-second`, so the type's own count is 1 while the pinned read for
 * `wf-errands` is 0 — and after the rebind both are 1 and the case proves
 * nothing. Written at the end of the file it failed exactly there.
 *
 * The seeded world this asserts against is the same one `7.44` above measures,
 * read at the same point in the file: `task` 5 on `wf-errands`, `epic` 1 on
 * `wf-errands`, `chore` 1 on `wf-second`.
 */
describe('GET /v1/workspaces/:workspaceId/ticket-counts-by-type', () => {
  it('13.948 answers each type’s own count across the WORKSPACE — a different question from the pinned population', async () => {
    const body = await okJson<TicketCountsResponse>('owner', '/ticket-counts-by-type');

    // The seeded world, counted with no workflow predicate. These three are the
    // same numbers `7.44` asserts a few describes up, reached by a different
    // route — the sum over workflows rather than one workflow's slice.
    expect(body.workspaceId).toBe(read.world.workspaceId);
    expect(body.counts['task']).toBe(5);
    expect(body.counts['epic']).toBe(1);

    // THE DISTINGUISHING PAIR, and the reason this case exists. `chore` is bound
    // to `wf-second` and its one ticket sits there, so the TYPE's own count is 1
    // while the PINNED read for `wf-errands` is 0.
    expect(body.counts['chore']).toBe(1);
    const pinnedElsewhere = await okJson<TypePopulationResponse>(
      'owner',
      '/ticket-types/chore/population?workflowId=wf-errands',
    );
    expect(pinnedElsewhere.count).toBe(0);
    // POSITIVE CONTROL for that pair, in the same invocation: the pinned read
    // DOES hold a number for the workflow the ticket is actually on, so the 0
    // above is the workflow predicate speaking rather than a route that answers
    // 0 to everything. A wide read that was secretly the pinned read for
    // `wf-errands` fails the line above; one that was secretly the pinned read
    // for `wf-second` passes here and fails `epic`'s 1 — `epic`'s ticket is on
    // `wf-errands`, and `wf-second` holds none of it.
    const pinnedHere = await okJson<TypePopulationResponse>(
      'owner',
      '/ticket-types/chore/population?workflowId=wf-second',
    );
    expect(pinnedHere.count).toBe(1);
  });

  it('13.949 reports a type the workspace DEFINES but has never given a ticket as 0 — and `count(*)` would say 1', async () => {
    // The fixture this case exists for. On the LEFT JOIN a ticket-less type has
    // exactly one row — the left row itself — so `count(*)` answers 1 for every
    // empty type: a wrong number that reads exactly like a right one. Nothing
    // else in the suite can tell the two spellings apart, because the shared
    // world has no ticket-less type — `epic`, `chore` and `task` all hold work.
    const typeId = 'countless-type';
    const { rows: seqRows } = await db.pool.query<{ ws_seq: number | null }>(
      'SELECT max(workspace_seq) AS ws_seq FROM events WHERE workspace_id = $1',
      [read.world.workspaceId],
    );
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: read.world.workspaceId,
        actorId: read.userIds.owner,
        entity: { kind: 'ticket-type', id: typeId },
        type: 'ticket-type.defined',
        workspaceSeq: (seqRows[0]?.ws_seq ?? 0) + 1,
        payload: { id: typeId, name: 'Countless', icon: 'inbox', rank: 9, workflowId: 'wf-errands', fields: [] },
      }),
    ]);

    const body = await okJson<TicketCountsResponse>('owner', '/ticket-counts-by-type');
    expect(body.counts[typeId]).toBe(0);
    // POSITIVE CONTROL, same read and same invocation: a type that DOES hold
    // tickets is not collapsed to the same value, so a route answering 0 for
    // every type cannot pass this case either.
    expect(body.counts['task']).toBe(5);
    // And a type this workspace has never heard of is ABSENT rather than 0 —
    // the difference the LEFT JOIN's left side is what buys.
    expect(body.counts['no-such-type-anywhere']).toBeUndefined();
  });

  it('13.950 is admin-only on the pinned read’s exact terms — members, guests and strangers get the same 404', async () => {
    expect((await get('owner', '/ticket-counts-by-type')).statusCode).toBe(200);

    const refusals: InjectResponse[] = [];
    for (const role of ['member', 'guest', 'outsider', 'stranger'] as const) {
      const response = await get(role, '/ticket-counts-by-type');
      expect([role, response.statusCode]).toEqual([role, 404]);
      expect(response.json()).toEqual(READ_NOT_FOUND_BODY);
      refusals.push(response);
    }
    // Every refusal is byte-identical to every other — no role can tell "not for
    // you" from "nothing here", which is the whole point of the door answering
    // 404 rather than 403 on this surface.
    for (const refusal of refusals) {
      expect(comparableHeaders(refusal)).toEqual(comparableHeaders(refusals[0]!));
    }
    // And an unauthenticated read is refused EARLIER, on the session gate, with
    // no workspace resolved — the same 401 every surface here answers.
    const anonymous = await read.app.inject({ method: 'GET', url: '/v1/workspaces/x/ticket-counts-by-type' });
    expect([anonymous.statusCode, anonymous.json()]).toEqual([401, UNAUTHENTICATED_BODY]);
  });

  it('13.951 counts only the caller’s own workspace, and a neighbour’s id answers the tenancy 404', async () => {
    // The neighbour reads their OWN workspace and gets their own number —
    // `nb-task` holds the one ticket `7.86`'s positive control counts.
    const own = await okJson<TicketCountsResponse>(
      'neighbour',
      '/ticket-counts-by-type',
      read.neighbour.workspaceId,
    );
    expect(own.workspaceId).toBe(read.neighbour.workspaceId);
    expect(own.counts['nb-task']).toBe(1);
    // The two workspaces' type sets are disjoint: this workspace's types are
    // ABSENT from the neighbour's answer rather than sitting there at 0. A read
    // that dropped `t.workspace_id` would merge the two sets.
    expect(own.counts['task']).toBeUndefined();
    expect(own.counts['chore']).toBeUndefined();

    // Neither direction resolves across the tenancy, and both are the same 404
    // an unauthorised caller gets.
    expect((await get('owner', '/ticket-counts-by-type', read.neighbour.workspaceId)).statusCode).toBe(404);
    expect((await get('neighbour', '/ticket-counts-by-type')).statusCode).toBe(404);
    // POSITIVE CONTROL: the entitled caller still gets a 200 in their own
    // workspace, so the two 404s are the tenancy answering and not a route that
    // refuses everyone.
    expect((await get('owner', '/ticket-counts-by-type')).statusCode).toBe(200);
  });
});

describe('POST /v1/workspaces/:workspaceId/ticket-types/:typeId/migrate', () => {
  function migrate(
    role: ReadRole,
    typeId: string,
    body: unknown,
    workspaceId = read.world.workspaceId,
  ): Promise<InjectResponse> {
    return read.app.inject({
      method: 'POST',
      url: `/v1/workspaces/${workspaceId}/ticket-types/${typeId}/migrate`,
      headers: read.authOf(role),
      payload: body as Record<string, unknown>,
    });
  }

  async function populationOf(typeId: string, workflowId: string): Promise<number> {
    const body = await okJson<TypePopulationResponse>(
      'owner',
      `/ticket-types/${typeId}/population?workflowId=${workflowId}`,
    );
    return body.count;
  }

  it('7.45 PLANTED DEFECT: a plain member is refused before a single event is built', async () => {
    // A COMPLETE, VALID migration — the same body the owner is about to have
    // accepted — so nothing but the caller distinguishes the refusals below
    // from the acceptance beneath them.
    const request = { fromWorkflowId: 'wf-second', toWorkflowId: 'wf-errands', stateMap: { todo: 'todo' } };
    const before = await ledgerRows();

    const refusals: InjectResponse[] = [];
    for (const role of ['member', 'guest', 'outsider', 'stranger', 'neighbour'] as const) {
      const response = await migrate(role, 'chore', request);
      expect([role, response.statusCode]).toEqual([role, 404]);
      expect(response.json()).toEqual(READ_NOT_FOUND_BODY);
      refusals.push(response);
    }
    for (const refusal of refusals.slice(1)) {
      expect(comparableHeaders(refusal)).toEqual(comparableHeaders(refusals[0] as InjectResponse));
    }
    // Not one event was built.
    //
    // The two assertions in this case catch DIFFERENT things, and an earlier
    // version of this comment (and catalogue entry 7.45) had them the wrong way
    // round — it called the ledger count the load-bearing one and the status
    // assertion the one a missing gate would survive.
    //
    // MEASURED, by widening THIS route's door from `admins-only` to
    // `members-only`: the member's refusal becomes a 422, and the
    // `toEqual([role, 404])` above fails on its FIRST iteration. That is the
    // observed half. The test aborts there, so the ledger assertion below was
    // never reached and its behaviour under that mutation is NOT measured — it
    // is READ OFF `ingest/ingest-service.ts`, which calls `insertEvent` only
    // after a verdict passes, and `ticket.workflow_rebound` from a non-admin
    // never passes one (`ADMIN_ONLY_TYPES`), so the count would have been
    // unchanged. Either way the STATUS assertion is what catches a widened
    // gate; the ledger count says nothing about this route's own gate.
    //
    // What the ledger assertion does prove is the other half of the contract,
    // and no status code can: that a refusal appends NOTHING. It reddens on a
    // route that built the batch and let ingest refuse it one event at a time
    // in a world where some of those events would commit — the partial
    // migration case 7.88 exists for. Both assertions stay; each is now named
    // for what it actually catches.
    expect(await ledgerRows()).toBe(before);

    // POSITIVE CONTROL, in the same test, and the reason the zero above is not
    // free: the identical body from the owner COMMITS, and the ledger moves by
    // exactly the one ticket `chore` has.
    const accepted = await migrate('owner', 'chore', request);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ status: 'migrated', count: 1 });
    expect(await ledgerRows()).toBe(before + 1);
    expect(await populationOf('chore', 'wf-errands')).toBe(1);
    expect(await populationOf('chore', 'wf-second')).toBe(0);
  });

  it('7.86 a migration may not name a workflow or a type from the tenancy next door', async () => {
    const before = await ledgerRows();
    const complete = { fromWorkflowId: 'wf-errands', toWorkflowId: 'wf-second', stateMap: { todo: 'todo', doing: 'waiting', waiting: 'waiting' } };

    // The neighbour's workflow as the DESTINATION — the direction that matters
    // most, because accepting it would bind live tickets to a definition their
    // own workspace cannot see (the exact shape ruling P14 was raised over).
    expect((await migrate('owner', 'task', { ...complete, toWorkflowId: read.neighbour.workflowId })).statusCode).toBe(404);
    // As the SOURCE, and as the TYPE.
    expect((await migrate('owner', 'task', { ...complete, fromWorkflowId: read.neighbour.workflowId })).statusCode).toBe(404);
    expect((await migrate('owner', 'nb-task', complete)).statusCode).toBe(404);
    expect(await ledgerRows()).toBe(before);

    // POSITIVE CONTROL: the same route, same caller, ids that ARE in this
    // workspace — it reaches the domain logic and refuses there instead, so the
    // three 404s above are the tenancy scope and not a route that 404s
    // everything it is sent.
    const inWorkspace = await migrate('owner', 'task', { ...complete, stateMap: { todo: 'todo' } });
    expect(inWorkspace.statusCode).toBe(422);
    expect((inWorkspace.json() as { rule: string }).rule).toBe('migration.unmapped-state');
  });

  it('7.45 refuses up front and appends nothing: an unmapped occupied state, the same workflow twice, a target state the destination has no such state', async () => {
    const before = await ledgerRows();
    const populationBefore = await populationOf('task', 'wf-errands');
    // A NON-ZERO positive control for the "nothing appended" assertions: there
    // really are tickets on the table, so a refusal that appended nothing is a
    // refusal rather than an empty batch.
    expect(populationBefore).toBe(5);

    // `doing` is occupied — the GST task sits there — and the map does not name
    // it. Every occupied state needs a target; that is the dialog's contract.
    const unmapped = await migrate('owner', 'task', {
      fromWorkflowId: 'wf-errands',
      toWorkflowId: 'wf-second',
      stateMap: { todo: 'todo', waiting: 'waiting' },
    });
    expect(unmapped.statusCode).toBe(422);
    const unmappedBody = unmapped.json() as { status: string; rule: string; reason: string };
    expect(unmappedBody.status).toBe('refused');
    expect(unmappedBody.rule).toBe('migration.unmapped-state');
    // The refusal NAMES the state, because a dialog that cannot say which state
    // is unmapped cannot ask the author to map it.
    expect(unmappedBody.reason).toContain('doing');

    // The same workflow twice. The engine refuses `ticket.workflow_rebound` to
    // the workflow a ticket is already on (`ticket.rebound-same-workflow`), so
    // without this the whole batch would be built and refused one at a time.
    const same = await migrate('owner', 'task', {
      fromWorkflowId: 'wf-errands',
      toWorkflowId: 'wf-errands',
      stateMap: { todo: 'todo', doing: 'doing', waiting: 'waiting' },
    });
    expect(same.statusCode).toBe(422);
    expect((same.json() as { rule: string }).rule).toBe('migration.same-workflow');

    // A target the destination workflow does not have. `wf-second` carries
    // todo / waiting / done and no `doing`.
    const unknownTarget = await migrate('owner', 'task', {
      fromWorkflowId: 'wf-errands',
      toWorkflowId: 'wf-second',
      stateMap: { todo: 'todo', doing: 'doing', waiting: 'waiting' },
    });
    expect(unknownTarget.statusCode).toBe(422);
    const unknownBody = unknownTarget.json() as { rule: string; reason: string };
    expect(unknownBody.rule).toBe('migration.unknown-target-state');
    expect(unknownBody.reason).toContain('doing');

    // A malformed body is a 400 and not a refusal, and it too appends nothing.
    expect((await migrate('owner', 'task', { fromWorkflowId: 'wf-errands', toWorkflowId: 'wf-second' })).statusCode).toBe(400);
    expect((await migrate('owner', 'task', { fromWorkflowId: 'wf-errands', toWorkflowId: 'wf-second', stateMap: { todo: 7 } })).statusCode).toBe(400);
    expect((await migrate('owner', 'task', { fromWorkflowId: 'wf-errands', toWorkflowId: 'wf-second', stateMap: {}, extra: 1 })).statusCode).toBe(400);

    expect(await ledgerRows()).toBe(before);
    expect(await populationOf('task', 'wf-errands')).toBe(populationBefore);
  });

  it('7.45 a complete map lands one ticket.workflow_rebound per ticket through ordinary ingest, and the count answered equals the events appended', async () => {
    const before = await ledgerRows();
    const fromBefore = await populationOf('task', 'wf-errands');
    const toBefore = await populationOf('task', 'wf-second');
    expect([fromBefore, toBefore]).toEqual([5, 0]);

    const response = await migrate('owner', 'task', {
      fromWorkflowId: 'wf-errands',
      toWorkflowId: 'wf-second',
      // `doing` has no counterpart in `wf-second`, so the author maps it onto
      // `waiting` — which is the whole reason the dialog exists.
      stateMap: { todo: 'todo', doing: 'waiting', waiting: 'waiting' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'migrated', count: 5 });

    // The count is not a number the route made up: the ledger grew by exactly
    // that many events, and every one of them is the type this route claims to
    // submit — through the ORDINARY ingest path, which is where the honesty
    // already lives.
    expect(await ledgerRows()).toBe(before + 5);
    const { rows } = await db.pool.query<{ type: string; n: number }>(
      `SELECT type, count(*)::int AS n FROM events
        WHERE workspace_id = $1 AND type = 'ticket.workflow_rebound'
        GROUP BY type`,
      [read.world.workspaceId],
    );
    expect(rows[0]?.n).toBe(6); // the five here, plus the one `chore` migration above

    // The populations moved, both ends, and the mapping was applied rather than
    // the state carried across: the GST task was in `doing`, which `wf-second`
    // has no such state, so it must now be in `waiting`.
    expect(await populationOf('task', 'wf-errands')).toBe(0);
    expect(await populationOf('task', 'wf-second')).toBe(5);
    const occupancy = await okJson<StateOccupancyResponse>('owner', '/workflows/wf-second/state-occupancy');
    expect(occupancy.counts).toEqual({ todo: 3, waiting: 2, done: 0 });
    const { rows: gst } = await db.pool.query<{ workflow_id: string; state_id: string }>(
      'SELECT workflow_id, state_id FROM proj_tickets WHERE ticket_id = $1',
      [read.world.taskInEpicId],
    );
    expect(gst[0]).toEqual({ workflow_id: 'wf-second', state_id: 'waiting' });
  });

  /**
   * 13.612 — Ruling 56(b), N2 (opus re-review, final fix wave round 2,
   * 2026-09-17): the mirror of `migration.unknown-target-state` — that rule
   * catches `backlog` named as a stateMap VALUE (`{ todo: 'backlog' }`);
   * this catches it named as a KEY (`{ backlog: 'todo' }`), which the
   * dialog itself can never send (`stateMap` is built from
   * `fromWorkflow.states` only, and backlog is never one of those) but a
   * hand-built request can. Before this fix the key was silently read and
   * then ignored — `toStateIdFor` always answers `BACKLOG_STATE_ID` for a
   * parked row regardless of what the map says for it. Fires before any
   * workspace lookup (it needs nothing but the caller's own body), so the
   * `fromWorkflowId`/`toWorkflowId`/`typeId` below need not even resolve
   * for the assertion to hold — real ones are used anyway so the case
   * reads as an admin's actual mistake rather than an edge case invented
   * for the test.
   */
  it('13.612 refuses migration.backlog-not-mappable when the caller names "backlog" as a stateMap KEY, and appends nothing', async () => {
    const before = await ledgerRows();
    const response = await migrate('owner', 'task', {
      fromWorkflowId: 'wf-second',
      toWorkflowId: 'wf-errands',
      stateMap: { backlog: 'todo', todo: 'todo' },
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { status: string; rule: string; reason: string };
    expect(body.status).toBe('refused');
    expect(body.rule).toBe('migration.backlog-not-mappable');
    expect(body.reason).toBe(
      '"backlog" cannot be a key in the map: parked tickets carry across as parked automatically and need no entry.',
    );
    expect(await ledgerRows()).toBe(before);
  });
});

describe('GET /v1/workspaces/:workspaceId/members — the roster after a revocation', () => {
  /**
   * LAST IN THE FILE, and it writes: it revokes `member`'s workspace grant.
   * Everything above it reads `member` as a current member, so it could not sit
   * anywhere else.
   *
   * The subject is the one thing about `proj_memberships` that a roster query
   * can get wrong in a way no ordinary case would notice. `membership.revoked`
   * deletes the WORKSPACE-scope row only — it may not touch the project roster
   * rows, because those belong to the project entity's stream and a cross-entity
   * delete would make the table's contents depend on arrival interleaving
   * (`projections/proj-memberships.ts`). So a revoked person keeps two
   * project-scope rows in this world, each carrying role `'member'`, and the
   * plan text's roster — a `DISTINCT ON (user_id)` fold across both scopes —
   * would read one of them and hand the revoked person back as a current
   * member of the workspace.
   */
  it('7.87 a revoked member disappears from the roster even though their project rows survive', async () => {
    const beforeRoster = await okJson<MemberListResponse>('owner', '/members');
    // POSITIVE CONTROL first, and it is what makes the absence below a change:
    // this person IS on the roster right now.
    expect(beforeRoster.members.map((m) => m.userId)).toContain(read.userIds.member);

    const { rows: seqRows } = await db.pool.query<{ entity_seq: number | null; ws_seq: number | null }>(
      `SELECT (SELECT max(seq) FROM events WHERE entity_kind = 'membership' AND entity_id = $2) AS entity_seq,
              (SELECT max(workspace_seq) FROM events WHERE workspace_id = $1) AS ws_seq`,
      [read.world.workspaceId, membershipId(read.world.workspaceId, read.userIds.member)],
    );
    // The positions are read from the ledger rather than taken from
    // `makeCommitted`'s process-local counters: the migration cases above
    // appended through REAL ingest, so those counters are behind the database
    // and a stale `workspace_seq` would collide on the ledger's unique index.
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: read.world.workspaceId,
        actorId: read.userIds.owner,
        entity: { kind: 'membership', id: membershipId(read.world.workspaceId, read.userIds.member) },
        type: 'membership.revoked',
        payload: { userId: read.userIds.member },
        seq: (seqRows[0]?.entity_seq ?? 0) + 1,
        workspaceSeq: (seqRows[0]?.ws_seq ?? 0) + 1,
      }),
    ]);

    // The project-scope rows SURVIVED — this is the state the hazard lives in,
    // asserted rather than assumed, so the case below is about the query and
    // not about a projection that happened to clean up.
    const { rows: survivors } = await db.pool.query<{ scope_kind: string; role: string }>(
      'SELECT scope_kind, role FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2 ORDER BY project_id',
      [read.world.workspaceId, read.userIds.member],
    );
    expect(survivors).toEqual([
      { scope_kind: 'project', role: 'member' },
      { scope_kind: 'project', role: 'member' },
    ]);

    const afterRoster = await okJson<MemberListResponse>('owner', '/members');
    expect(afterRoster.members.map((m) => m.userId)).not.toContain(read.userIds.member);
    // And the roster is not merely empty: the other five are all still there.
    expect(Object.fromEntries(afterRoster.members.map((m) => [m.userId, m.role]))).toEqual({
      [read.userIds.owner]: 'owner',
      [read.userIds.admin]: 'admin',
      [read.userIds.outsider]: 'member',
      [read.userIds.projectLead]: 'member',
      [read.userIds.guest]: 'guest',
    });
    // The revoked person's own read is refused too, which is `requireMember`
    // answering rather than this query — included because a roster that still
    // listed them would be the same defect seen from the other side.
    expect((await get('member', '/members')).statusCode).toBe(404);
  });
});

describe('POST …/migrate — a state id that is also a property of Object.prototype', () => {
  /**
   * LAST, and it seeds a workflow of its own: a state whose id is `toString`.
   *
   * `workflowStateSchema` declares `id: z.string().min(1)` and nothing more, so
   * this is a state an admin can define through the shipped builder, and a
   * ticket can sit in it. The `stateMap` arrives as a plain JSON object, and
   * `stateMap['toString']` is `Object.prototype.toString` — a function, not
   * `undefined`. A coverage check written as `stateMap[stateId] === undefined`
   * therefore reads that state as MAPPED, and the one guarantee this route
   * makes about refusals ("nothing is appended") is walked straight past: the
   * batch is built, the tickets whose states were genuinely mapped COMMIT, and
   * the one carrying a function as its `toStateId` is refused by zod at ingest —
   * a partial migration, which is two populations nobody chose.
   *
   * Two tickets, deliberately: with one the damage is invisible, because the
   * single event is refused and the ledger is unchanged either way. The second
   * ticket is what turns a wrong rule name into a half-migrated type.
   */
  it('7.88 an occupied state named after an Object.prototype member is UNMAPPED, and the batch is refused with nothing appended', async () => {
    const workflowId = 'wf-proto';
    const typeId = 'proto';
    const mappedTicketId = newUlid();
    const prototypeTicketId = newUlid();
    const { rows: seqRows } = await db.pool.query<{ ws_seq: number | null }>(
      'SELECT max(workspace_seq) AS ws_seq FROM events WHERE workspace_id = $1',
      [read.world.workspaceId],
    );
    let workspaceSeq = (seqRows[0]?.ws_seq ?? 0) + 1;
    const ws = { workspaceId: read.world.workspaceId, actorId: read.userIds.owner };
    const next = (): number => workspaceSeq++;

    await applyCommitted(db.pool, [
      makeCommitted({
        ...ws,
        entity: { kind: 'workflow', id: workflowId },
        type: 'workflow.defined',
        workspaceSeq: next(),
        payload: {
          id: workflowId,
          version: 1,
          name: 'Prototype pollution flow',
          initialStateId: 'ok',
          states: [
            { id: 'ok', name: 'Fine', category: 'open' },
            // The whole point. Also a legal state id today.
            { id: 'toString', name: 'Inherited', category: 'open' },
            { id: 'done', name: 'Done', category: 'terminal' },
          ],
          transitions: [
            { from: '*', to: 'ok', rules: [] },
            { from: '*', to: 'toString', rules: [] },
            { from: '*', to: 'done', rules: [] },
          ],
        },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket-type', id: typeId },
        type: 'ticket-type.defined',
        workspaceSeq: next(),
        payload: { id: typeId, name: 'Proto', icon: 'ghost', rank: 5, workflowId, fields: [] },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: mappedTicketId },
        type: 'ticket.created',
        workspaceSeq: next(),
        payload: { typeId, projectId: read.world.projectId, parentId: null, title: 'Stays in a real state' },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: prototypeTicketId },
        type: 'ticket.created',
        workspaceSeq: next(),
        payload: { typeId, projectId: read.world.projectId, parentId: null, title: 'Parked in toString' },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: prototypeTicketId },
        type: 'ticket.transitioned',
        workspaceSeq: next(),
        payload: { to: 'toString' },
      }),
    ]);

    // The world is as described: one ticket in `ok`, one in `toString`.
    const occupancy = await okJson<StateOccupancyResponse>('owner', `/workflows/${workflowId}/state-occupancy`);
    expect(occupancy.counts).toEqual({ ok: 1, toString: 1, done: 0 });

    const before = await ledgerRows();
    const response = await read.app.inject({
      method: 'POST',
      url: `/v1/workspaces/${read.world.workspaceId}/ticket-types/${typeId}/migrate`,
      headers: read.authOf('owner'),
      // `ok` is genuinely mapped. `toString` is NOT in this object — it is only
      // reachable through the prototype chain.
      payload: { fromWorkflowId: workflowId, toWorkflowId: 'wf-errands', stateMap: { ok: 'todo' } },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json() as { status: string; rule: string; reason: string };
    expect(body.status).toBe('refused');
    expect(body.rule).toBe('migration.unmapped-state');
    expect(body.reason).toContain('toString');
    // NOTHING APPENDED — and this is the assertion that fails on a route using
    // `stateMap[stateId] === undefined`, because the genuinely-mapped ticket
    // commits before its neighbour is refused.
    expect(await ledgerRows()).toBe(before);
    const { rows } = await db.pool.query<{ ticket_id: string; workflow_id: string }>(
      'SELECT ticket_id, workflow_id FROM proj_tickets WHERE ticket_id = ANY ($1::text[]) ORDER BY ticket_id',
      [[mappedTicketId, prototypeTicketId].sort()],
    );
    expect(rows.map((row) => row.workflow_id)).toEqual([workflowId, workflowId]);

    // POSITIVE CONTROL: name the state honestly and the same batch commits, so
    // the refusal above is the coverage check answering and not a route that
    // refuses everything with an unusual state id in it.
    const accepted = await read.app.inject({
      method: 'POST',
      url: `/v1/workspaces/${read.world.workspaceId}/ticket-types/${typeId}/migrate`,
      headers: read.authOf('owner'),
      payload: { fromWorkflowId: workflowId, toWorkflowId: 'wf-errands', stateMap: { ok: 'todo', toString: 'doing' } },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ status: 'migrated', count: 2 });
    expect(await ledgerRows()).toBe(before + 2);
  });
});

describe('GET …/state-occupancy — a state id that is an ACCESSOR on Object.prototype', () => {
  /**
   * 7.88's sibling, and the half it did not cover.
   *
   * 7.88 fixed the `stateMap` lookup, where `toString` was the demonstration.
   * `toString` is SAFE in `readStateOccupancy`'s seeded object, and that is why
   * 7.88 is green there: a plain `counts['toString'] = 0` creates an OWN
   * property that shadows the prototype's method, and `JSON.stringify` emits it.
   *
   * `__proto__` is not a method, it is an ACCESSOR PAIR on `Object.prototype`,
   * and its setter silently ignores a value that is neither an object nor null.
   * So `counts['__proto__'] = 0` on a `{}` creates NO own key, writes nothing,
   * throws nothing, and the state — with every live ticket in it — is simply
   * absent from the response. Confirmed in plain node: `c['__proto__']=0;
   * c['toString']=1` leaves `Object.keys(c)` as `['toString']` alone.
   *
   * `workflowStateSchema` is `id: z.string().min(1)` and every other state
   * lookup in the engine and the domain is a `.find`, a `.some` or a `Set`, so
   * `__proto__` is a legal state id everywhere except this one indexed object.
   * Plan 8's publish-mapping dialog is built from exactly this response, so an
   * author would never be shown the state and could delete it believing it
   * empty.
   *
   * ## Why there is no migrate-half control here, unlike 7.88
   *
   * There cannot be one. Fastify parses JSON bodies with `secure-json-parse`,
   * which REFUSES a `__proto__` key outright, so a migration naming this state
   * never reaches the handler — it draws an opaque 400 from the parser. That is
   * asserted below as the consequence it is: a type holding a `__proto__` state
   * is permanently unmigratable through this route, which is precisely why the
   * occupancy read must not also hide it. The controls that make the count
   * evidence are the sibling state in the same response and the `proj_tickets`
   * row read straight out of the database.
   */
  it('7.89 PLANTED DEFECT: a `__proto__` state and the live ticket in it are REPORTED, not silently dropped from the counts object', async () => {
    const workflowId = 'wf-accessor';
    const typeId = 'accessor';
    const okTicketId = newUlid();
    const protoTicketId = newUlid();
    const { rows: seqRows } = await db.pool.query<{ ws_seq: number | null }>(
      'SELECT max(workspace_seq) AS ws_seq FROM events WHERE workspace_id = $1',
      [read.world.workspaceId],
    );
    let workspaceSeq = (seqRows[0]?.ws_seq ?? 0) + 1;
    const ws = { workspaceId: read.world.workspaceId, actorId: read.userIds.owner };
    const next = (): number => workspaceSeq++;

    await applyCommitted(db.pool, [
      makeCommitted({
        ...ws,
        entity: { kind: 'workflow', id: workflowId },
        type: 'workflow.defined',
        workspaceSeq: next(),
        payload: {
          id: workflowId,
          version: 1,
          name: 'Accessor flow',
          initialStateId: 'ok',
          states: [
            { id: 'ok', name: 'Fine', category: 'open' },
            // A legal state id today, and the one an indexed object cannot hold.
            { id: '__proto__', name: 'Inherited accessor', category: 'active' },
            { id: 'done', name: 'Done', category: 'terminal' },
          ],
          transitions: [
            { from: '*', to: 'ok', rules: [] },
            { from: '*', to: '__proto__', rules: [] },
            { from: '*', to: 'done', rules: [] },
          ],
        },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket-type', id: typeId },
        type: 'ticket-type.defined',
        workspaceSeq: next(),
        payload: { id: typeId, name: 'Accessor', icon: 'ghost', rank: 6, workflowId, fields: [] },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: okTicketId },
        type: 'ticket.created',
        workspaceSeq: next(),
        payload: { typeId, projectId: read.world.projectId, parentId: null, title: 'Stays in a real state' },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: protoTicketId },
        type: 'ticket.created',
        workspaceSeq: next(),
        payload: { typeId, projectId: read.world.projectId, parentId: null, title: 'Parked in __proto__' },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: protoTicketId },
        type: 'ticket.transitioned',
        workspaceSeq: next(),
        payload: { to: '__proto__' },
      }),
    ]);

    // The world really is in that shape, read from the table rather than
    // inferred from the seed: the ticket's `state_id` IS the accessor's name.
    const { rows: parked } = await db.pool.query<{ state_id: string }>(
      'SELECT state_id FROM proj_tickets WHERE ticket_id = $1',
      [protoTicketId],
    );
    expect(parked[0]?.state_id).toBe('__proto__');

    const response = await get('owner', `/workflows/${workflowId}/state-occupancy`);
    expect(response.statusCode).toBe(200);
    // The EXPECTED object is built with a computed key on purpose. Written as
    // the literal `{ __proto__: 1 }` this would be the prototype-setter form,
    // which creates no own property — the expectation would collapse to
    // `{ ok: 1, done: 0 }` and pass against the very defect this case exists
    // for. `toEqual` would then be a check that cannot fail.
    expect((response.json() as StateOccupancyResponse).counts).toEqual({
      ok: 1,
      ['__proto__']: 1,
      done: 0,
    });
    // And the SERIALISER is in the proof: the bytes on the wire carry the key.
    // A response object that held it while `JSON.stringify` dropped it would
    // satisfy the assertion above and still ship an occupancy the dialog cannot
    // see.
    expect(response.body).toContain('"__proto__":1');
    // `ok: 1` and `done: 0` in the same object are the positive controls: an
    // occupancy that answered nothing at all cannot pass by agreeing about the
    // accessor.

    // RECORDED, not fixed: the escape hatch is shut. Fastify's body parser
    // refuses a `__proto__` key before the handler runs, so this type cannot be
    // migrated off `wf-accessor` through the bulk rebind at all — an opaque 400
    // from the parser, not one of this route's own named refusals.
    const before = await ledgerRows();
    const blocked = await read.app.inject({
      method: 'POST',
      url: `/v1/workspaces/${read.world.workspaceId}/ticket-types/${typeId}/migrate`,
      headers: read.authOf('owner'),
      payload: { fromWorkflowId: workflowId, toWorkflowId: 'wf-errands', stateMap: { ok: 'todo', ['__proto__']: 'doing' } },
    });
    expect(blocked.statusCode).toBe(400);
    expect(await ledgerRows()).toBe(before);
    // POSITIVE CONTROL for that 400: the same route, same caller, the same body
    // WITHOUT the accessor key reaches the handler and is refused by this
    // route's own rule instead — so the 400 above is the parser and not a
    // migrate endpoint that refuses everything.
    const reached = await read.app.inject({
      method: 'POST',
      url: `/v1/workspaces/${read.world.workspaceId}/ticket-types/${typeId}/migrate`,
      headers: read.authOf('owner'),
      payload: { fromWorkflowId: workflowId, toWorkflowId: 'wf-errands', stateMap: { ok: 'todo' } },
    });
    expect(reached.statusCode).toBe(422);
    expect((reached.json() as { rule: string }).rule).toBe('migration.unmapped-state');
    expect(await ledgerRows()).toBe(before);
  });
});

/**
 * Ruling 52(a), Finding 2 (final whole-branch review, 2026-09-17): the
 * occupied-state check used to demand a target for EVERY occupied state,
 * `backlog` included — but the dialog builds `stateMap` from
 * `fromWorkflow.states` only (spec §1.1: backlog is never one of those), so a
 * type holding even one parked ticket was an unconditional
 * `migration.unmapped-state` with no map the caller could ever have sent to
 * answer it (Amendment 3 forbids mapping anything INTO backlog). Since this
 * plan makes backlog the birth state of every new ticket, that made the bulk
 * rebind a dead end for almost any type actually in use.
 *
 * Own workflow pair and type, in the 7.88/7.89 shape, so this case does not
 * depend on `chore`/`task`'s existing populations and can seed a ticket that
 * is genuinely parked (`ticket.created` then `ticket.transitioned {to:
 * 'backlog'}`, the universal Send-to-backlog edge from a non-terminal
 * declared state).
 */
describe('POST …/migrate — a parked (backlog) row carries across as parked (Ruling 52a)', () => {
  it('13.606 a complete DECLARED-state map does not refuse migration.unmapped-state over a backlog row, and the parked ticket lands in backlog on the new workflow', async () => {
    const workflowId = 'wf-park-src';
    const targetWorkflowId = 'wf-park-dst';
    const typeId = 'park-type';
    const activeTicketId = newUlid();
    const parkedTicketId = newUlid();
    const { rows: seqRows } = await db.pool.query<{ ws_seq: number | null }>(
      'SELECT max(workspace_seq) AS ws_seq FROM events WHERE workspace_id = $1',
      [read.world.workspaceId],
    );
    let workspaceSeq = (seqRows[0]?.ws_seq ?? 0) + 1;
    const ws = { workspaceId: read.world.workspaceId, actorId: read.userIds.owner };
    const next = (): number => workspaceSeq++;

    await applyCommitted(db.pool, [
      makeCommitted({
        ...ws,
        entity: { kind: 'workflow', id: workflowId },
        type: 'workflow.defined',
        workspaceSeq: next(),
        payload: {
          id: workflowId,
          version: 1,
          name: 'Park source',
          initialStateId: 'todo',
          states: [
            { id: 'todo', name: 'To do', category: 'open' },
            { id: 'doing', name: 'Doing', category: 'active' },
            { id: 'done', name: 'Done', category: 'terminal' },
          ],
          transitions: [
            { from: '*', to: 'todo', rules: [] },
            { from: '*', to: 'doing', rules: [] },
            { from: '*', to: 'done', rules: [] },
          ],
        },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'workflow', id: targetWorkflowId },
        type: 'workflow.defined',
        workspaceSeq: next(),
        payload: {
          id: targetWorkflowId,
          version: 1,
          name: 'Park destination',
          initialStateId: 'todo2',
          states: [
            { id: 'todo2', name: 'To do', category: 'open' },
            { id: 'doing2', name: 'Doing', category: 'active' },
            { id: 'done2', name: 'Done', category: 'terminal' },
          ],
          transitions: [
            { from: '*', to: 'todo2', rules: [] },
            { from: '*', to: 'doing2', rules: [] },
            { from: '*', to: 'done2', rules: [] },
          ],
        },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket-type', id: typeId },
        type: 'ticket-type.defined',
        workspaceSeq: next(),
        payload: { id: typeId, name: 'Park type', icon: 'inbox', rank: 5, workflowId, fields: [] },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: activeTicketId },
        type: 'ticket.created',
        workspaceSeq: next(),
        payload: { typeId, projectId: read.world.projectId, parentId: null, title: 'Stays on a declared state' },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: parkedTicketId },
        type: 'ticket.created',
        workspaceSeq: next(),
        payload: { typeId, projectId: read.world.projectId, parentId: null, title: 'Sent to backlog' },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: parkedTicketId },
        type: 'ticket.transitioned',
        workspaceSeq: next(),
        payload: { to: 'backlog' },
      }),
    ]);

    // The world is as described — read from the table, not assumed from the
    // seed: one ticket in `todo`, one parked in `backlog`.
    const { rows: seeded } = await db.pool.query<{ ticket_id: string; state_id: string }>(
      'SELECT ticket_id, state_id FROM proj_tickets WHERE ticket_id = ANY ($1::text[])',
      [[activeTicketId, parkedTicketId]],
    );
    expect(seeded.find((row) => row.ticket_id === activeTicketId)?.state_id).toBe('todo');
    expect(seeded.find((row) => row.ticket_id === parkedTicketId)?.state_id).toBe('backlog');

    const before = await ledgerRows();
    // A COMPLETE map of `workflowId`'s own DECLARED states — exactly what the
    // dialog builds (spec §1.1: backlog is never in `def.states`, so the
    // dialog cannot ask about it and never does).
    const response = await read.app.inject({
      method: 'POST',
      url: `/v1/workspaces/${read.world.workspaceId}/ticket-types/${typeId}/migrate`,
      headers: read.authOf('owner'),
      payload: {
        fromWorkflowId: workflowId,
        toWorkflowId: targetWorkflowId,
        stateMap: { todo: 'todo2', doing: 'doing2', done: 'done2' },
      },
    });
    // Before this fix: 422, `migration.unmapped-state`, naming `backlog` — a
    // state the dialog cannot show a row for and cannot map either way.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'migrated', count: 2 });
    expect(await ledgerRows()).toBe(before + 2);

    const { rows: after } = await db.pool.query<{ ticket_id: string; workflow_id: string; state_id: string }>(
      'SELECT ticket_id, workflow_id, state_id FROM proj_tickets WHERE ticket_id = ANY ($1::text[])',
      [[activeTicketId, parkedTicketId]],
    );
    expect(after.find((row) => row.ticket_id === activeTicketId)).toEqual({
      ticket_id: activeTicketId,
      workflow_id: targetWorkflowId,
      state_id: 'todo2',
    });
    // THE ASSERTION: the parked ticket's state_id is `backlog` — the
    // universal id, not a mapped declared state and not stranded.
    expect(after.find((row) => row.ticket_id === parkedTicketId)).toEqual({
      ticket_id: parkedTicketId,
      workflow_id: targetWorkflowId,
      state_id: 'backlog',
    });
  });
});

/**
 * Ruling 53(ii), Finding 5 (final whole-branch review, 2026-09-17): closed ⇒
 * terminal must survive a bulk migration exactly as it must survive a single
 * `ticket.workflow_rebound` (Ruling 53(i), `checkTicketWorkflowRebound`) — the
 * route's own pre-flight over the whole ticket set, so a refusal here also
 * appends nothing (case 7.45's own contract).
 */
describe('POST …/migrate — a closed ticket may only migrate to a terminal state (Ruling 53(ii))', () => {
  it('13.609 refuses migration.closed-to-non-terminal for a closed row mapped to a non-terminal target, appends nothing, and a terminal target still commits', async () => {
    const workflowId = 'wf-closeguard-src';
    const targetWorkflowId = 'wf-closeguard-dst';
    const typeId = 'closeguard-type';
    const openTicketId = newUlid();
    const closedTicketId = newUlid();
    const { rows: seqRows } = await db.pool.query<{ ws_seq: number | null }>(
      'SELECT max(workspace_seq) AS ws_seq FROM events WHERE workspace_id = $1',
      [read.world.workspaceId],
    );
    let workspaceSeq = (seqRows[0]?.ws_seq ?? 0) + 1;
    const ws = { workspaceId: read.world.workspaceId, actorId: read.userIds.owner };
    const next = (): number => workspaceSeq++;

    await applyCommitted(db.pool, [
      makeCommitted({
        ...ws,
        entity: { kind: 'workflow', id: workflowId },
        type: 'workflow.defined',
        workspaceSeq: next(),
        payload: {
          id: workflowId,
          version: 1,
          name: 'Closeguard source',
          initialStateId: 'todo',
          states: [
            { id: 'todo', name: 'To do', category: 'open' },
            { id: 'doing', name: 'Doing', category: 'active' },
            { id: 'done', name: 'Done', category: 'terminal' },
          ],
          transitions: [
            { from: '*', to: 'todo', rules: [] },
            { from: '*', to: 'doing', rules: [] },
            { from: '*', to: 'done', rules: [] },
          ],
        },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'workflow', id: targetWorkflowId },
        type: 'workflow.defined',
        workspaceSeq: next(),
        payload: {
          id: targetWorkflowId,
          version: 1,
          name: 'Closeguard destination',
          initialStateId: 'todo2',
          states: [
            { id: 'todo2', name: 'To do', category: 'open' },
            { id: 'doing2', name: 'Doing', category: 'active' },
            { id: 'done2', name: 'Done', category: 'terminal' },
          ],
          transitions: [
            { from: '*', to: 'todo2', rules: [] },
            { from: '*', to: 'doing2', rules: [] },
            { from: '*', to: 'done2', rules: [] },
          ],
        },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket-type', id: typeId },
        type: 'ticket-type.defined',
        workspaceSeq: next(),
        payload: { id: typeId, name: 'Closeguard type', icon: 'lock', rank: 5, workflowId, fields: [] },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: openTicketId },
        type: 'ticket.created',
        workspaceSeq: next(),
        payload: { typeId, projectId: read.world.projectId, parentId: null, title: 'Stays open, on a declared state' },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: closedTicketId },
        type: 'ticket.created',
        workspaceSeq: next(),
        payload: { typeId, projectId: read.world.projectId, parentId: null, title: 'Finished and closed' },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: closedTicketId },
        type: 'ticket.transitioned',
        workspaceSeq: next(),
        payload: { to: 'done' },
      }),
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: closedTicketId },
        type: 'ticket.closed',
        workspaceSeq: next(),
        payload: {},
      }),
    ]);

    // The world is as described: the second ticket sits in `done` WITH
    // `closed_at` set — read from the table, not assumed from the seed.
    const { rows: seeded } = await db.pool.query<{ state_id: string; closed_at: Date | null }>(
      'SELECT state_id, closed_at FROM proj_tickets WHERE ticket_id = $1',
      [closedTicketId],
    );
    expect(seeded[0]?.state_id).toBe('done');
    expect(seeded[0]?.closed_at).not.toBeNull();

    const before = await ledgerRows();
    const refused = await read.app.inject({
      method: 'POST',
      url: `/v1/workspaces/${read.world.workspaceId}/ticket-types/${typeId}/migrate`,
      headers: read.authOf('owner'),
      // `done` (the closed ticket's own state) mapped onto `doing2` — ACTIVE,
      // not terminal.
      payload: {
        fromWorkflowId: workflowId,
        toWorkflowId: targetWorkflowId,
        stateMap: { todo: 'todo2', doing: 'doing2', done: 'doing2' },
      },
    });
    expect(refused.statusCode).toBe(422);
    const body = refused.json() as { status: string; rule: string; reason: string };
    expect(body.status).toBe('refused');
    expect(body.rule).toBe('migration.closed-to-non-terminal');
    expect(body.reason).toBe(
      '1 closed ticket is mapped to a non-terminal state ("doing2"); a closed ticket may only migrate to a terminal state.',
    );
    // NOTHING APPENDED, and the closed ticket never moved.
    expect(await ledgerRows()).toBe(before);
    const { rows: unmoved } = await db.pool.query<{ workflow_id: string; state_id: string }>(
      'SELECT workflow_id, state_id FROM proj_tickets WHERE ticket_id = $1',
      [closedTicketId],
    );
    expect(unmoved[0]).toEqual({ workflow_id: workflowId, state_id: 'done' });

    // POSITIVE CONTROL: the identical batch, `done` mapped onto `done2` — a
    // DIFFERENT terminal state — commits, and the ticket stays closed.
    const accepted = await read.app.inject({
      method: 'POST',
      url: `/v1/workspaces/${read.world.workspaceId}/ticket-types/${typeId}/migrate`,
      headers: read.authOf('owner'),
      payload: {
        fromWorkflowId: workflowId,
        toWorkflowId: targetWorkflowId,
        stateMap: { todo: 'todo2', doing: 'doing2', done: 'done2' },
      },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ status: 'migrated', count: 2 });
    const { rows: moved } = await db.pool.query<{ workflow_id: string; state_id: string; closed_at: Date | null }>(
      'SELECT workflow_id, state_id, closed_at FROM proj_tickets WHERE ticket_id = $1',
      [closedTicketId],
    );
    expect(moved[0]?.workflow_id).toBe(targetWorkflowId);
    expect(moved[0]?.state_id).toBe('done2');
    expect(moved[0]?.closed_at).not.toBeNull();
  });
});
