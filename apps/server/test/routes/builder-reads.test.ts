import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  newUlid,
  type MemberListResponse,
  type StateOccupancyResponse,
  type TicketTypeListResponse,
  type TypePopulationResponse,
  type WorkflowListResponse,
  type WorkflowResponse,
} from '@gisik-nokma/domain';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
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
 * | `/members` | any member — but GUESTS ARE WITHHELD from non-admin callers | plan: the roster is not a directory of who else the workspace is talking to |
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
 * one `createTestDatabase` and seeds once through `buildReadTestApp`. Two cases
 * at the END of this file DO write to the ledger — the successful migration and
 * the revocation — and they are last on purpose, with the reasons stated where
 * they sit. Everything above them is read-only and order-independent.
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
      expect(response.json()).toEqual({ error: 'invalid_version' });
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
    expect(member.json()).toEqual({ error: 'invalid_version' });
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
      [read.userIds.member]: 'member',
      [read.userIds.outsider]: 'member',
      [read.userIds.guest]: 'guest',
    });
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

  it('7.39 PLANTED DEFECT: a plain member never sees the guest — not the row, not the id — while the owner does', async () => {
    const asMember = await get('member', '/members');
    expect(asMember.statusCode).toBe(200);
    // Not the id anywhere in the bytes, which also covers a route that withheld
    // the ROLE but kept the row.
    expect(asMember.body).not.toContain(read.userIds.guest);
    const memberRoster = asMember.json() as MemberListResponse;
    expect(memberRoster.members.map((m) => m.role)).not.toContain('guest');
    // POSITIVE CONTROL: the member's roster is not empty — the other three are
    // all there, so the guest's absence is a withholding and not a broken read.
    expect(Object.fromEntries(memberRoster.members.map((m) => [m.userId, m.role]))).toEqual({
      [read.userIds.owner]: 'owner',
      [read.userIds.member]: 'member',
      [read.userIds.outsider]: 'member',
    });

    const asOwner = await get('owner', '/members');
    expect(asOwner.body).toContain(read.userIds.guest);
    expect(
      (asOwner.json() as MemberListResponse).members.find((m) => m.userId === read.userIds.guest)?.role,
    ).toBe('guest');
  });

  it('7.39 a guest asking for the roster gets the non-guest members and never their own kind, including themselves', async () => {
    const response = await get('guest', '/members');
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(read.userIds.guest);
    const body = response.json() as MemberListResponse;
    expect(body.members.map((m) => m.role)).not.toContain('guest');
    expect(body.members.map((m) => m.userId).sort()).toEqual(
      [read.userIds.owner, read.userIds.member, read.userIds.outsider].sort(),
    );
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
