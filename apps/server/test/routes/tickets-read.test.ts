import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { applyAll, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Plan 4 Task 8 — read enforcement.
 *
 * ## What this file pins, and the shape it pins it in
 *
 * The property is INDISTINGUISHABILITY, not refusal. A 404 on an invisible
 * ticket proves nothing on its own: a route that 404'd everything would pass
 * it. So every refusal case here is asserted against a positive control in the
 * same test — the same viewer, the same route, an id they may see — and the
 * indistinguishability case compares the invisible answer to the NONEXISTENT
 * answer field by field, status, body and headers, rather than checking a
 * status code twice.
 *
 * ## The rows are `proj_visibility`'s
 *
 * `proj_tickets` does not exist on this branch (Plan 3 Task 12 owns it; cases
 * 6.61, 6.66), so no ticket title exists anywhere queryable and the
 * restricted-parent placeholder is measured as EXISTENCE-AND-ID against
 * EXISTENCE-AND-THE-ROW. The plan text's `expect(parent).not.toHaveProperty(
 * 'title')` is deliberately NOT written here: with no title anywhere in the
 * system it would pass for a reason unrelated to the property it names, which
 * is this series' signature defect. `toEqual({ kind: 'restricted', id })` is
 * exact, so any field the restricted branch grew would redden it.
 *
 * ## A fresh workspace per test, and no sequence reset
 *
 * Each test file gets its own database, and the `events` table refuses TRUNCATE
 * (it is append-only), so tests SHARE state within this file. Every test
 * therefore mints its own workspace ULID: an exact-id-set assertion over a
 * shared workspace would break the day someone inserts a test above it, for a
 * reason unrelated to what it names. `resetTestSequences()` is deliberately not
 * called — with rows that are never deleted, restarting the counter would
 * re-mint a `workspace_seq` and collide on `events_workspace_seq_unique`.
 */

/**
 * `app.inject`'s response type, derived from the instance rather than imported
 * from `light-my-request` — that package is a transitive dependency of fastify
 * and is not declared here, so naming it directly does not resolve.
 */
type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

let phoneCounter = 0;

/** A signed-in caller, real sign-in over the wire. `userId` is what their membership is seeded under. */
async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9190000${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

function get(url: string, headers?: Record<string, string>): Promise<InjectResponse> {
  const options: InjectOptions = { method: 'GET', url, ...(headers ? { headers } : {}) };
  return app.inject(options);
}

/**
 * Every response header except `date`, which is a clock reading and differs
 * between two requests for reasons that have nothing to do with what is being
 * compared. Everything else — `content-type` and `content-length` above all —
 * must match, because a length that differed would ITSELF be the oracle even if
 * both bodies parsed to the same object.
 */
function comparableHeaders(res: InjectResponse): Record<string, unknown> {
  const { date: _date, ...rest } = res.headers;
  return rest;
}

describe('GET /v1/workspaces/:workspaceId/tickets/:ticketId — invisible is nonexistent', () => {
  it('a member reading another project’s ticket gets a 404 indistinguishable from a ticket that never existed', async () => {
    // Mutation that reddens it: give the `canSee` refusal any answer of its own
    // — a 403, or a body naming the ticket — and the two responses stop
    // matching. Deleting the `canSee` guard outright reddens it the other way,
    // through the positive control below.
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: mine }]);
    const visible = newUlid();
    const invisibleId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: visible });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: invisibleId });

    // Positive control FIRST: this viewer, this route, an id they may see. It
    // is what stops "404s everything" from passing this test.
    const allowed = await get(`/v1/workspaces/${ws}/tickets/${visible}`, headers);
    expect(allowed.statusCode).toBe(200);

    const invisible = await get(`/v1/workspaces/${ws}/tickets/${invisibleId}`, headers);
    const ghost = await get(`/v1/workspaces/${ws}/tickets/${newUlid()}`, headers);

    expect(invisible.statusCode).toBe(404);
    expect(ghost.statusCode).toBe(404);
    expect(invisible.json()).toEqual({ error: 'not_found' });
    expect(invisible.json()).toEqual(ghost.json());
    expect(comparableHeaders(invisible)).toEqual(comparableHeaders(ghost));
  });

  it('history of an invisible ticket is the same 404, indistinguishable from a ticket that never existed', async () => {
    // The history door is a separate registration and would have to be refused
    // separately. Mutation: drop either guard from the `/events` handler and
    // the invisible read answers 200 with an (empty) event list.
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: mine }]);
    const visible = newUlid();
    const invisibleId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: visible });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: invisibleId });

    const allowed = await get(`/v1/workspaces/${ws}/tickets/${visible}/events`, headers);
    expect(allowed.statusCode).toBe(200);

    const invisible = await get(`/v1/workspaces/${ws}/tickets/${invisibleId}/events`, headers);
    const ghost = await get(`/v1/workspaces/${ws}/tickets/${newUlid()}/events`, headers);
    expect(invisible.statusCode).toBe(404);
    expect(invisible.json()).toEqual({ error: 'not_found' });
    expect(invisible.json()).toEqual(ghost.json());
    expect(comparableHeaders(invisible)).toEqual(comparableHeaders(ghost));
  });

  it('a ticket in another workspace is a 404 through this workspace’s path, though the same viewer reads it through its own', async () => {
    // `canSee` deliberately takes no workspaceId — it resolves the role in the
    // workspace the TICKET names — so nothing in the visibility decision
    // notices a path that names the wrong workspace. The route's own
    // `workspace_id` clause is what does, and this is the only case that walks
    // it. Mutation: delete `AND workspace_id = $2` from `loadTicketRow` and the
    // cross-workspace read answers 200.
    //
    // The viewer is a member of BOTH workspaces, so the refusal cannot be
    // "you are not in workspace A"; and the positive control on the same id
    // through workspace B's path is what makes the 404 attributable to the
    // path rather than to invisibility.
    const wsA = newUlid();
    const wsB = newUlid();
    const prjA = newUlid();
    const prjB = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, wsA, userId, 'member', [{ projectId: prjA }]);
    await seedMember(db.pool, wsB, userId, 'member', [{ projectId: prjB }]);
    const ticketInB = newUlid();
    await seedTicket(db.pool, { workspaceId: wsB, projectId: prjB, ticketId: ticketInB });

    const throughB = await get(`/v1/workspaces/${wsB}/tickets/${ticketInB}`, headers);
    expect(throughB.statusCode).toBe(200);

    const throughA = await get(`/v1/workspaces/${wsA}/tickets/${ticketInB}`, headers);
    expect(throughA.statusCode).toBe(404);
    expect(throughA.json()).toEqual({ error: 'not_found' });

    const historyThroughA = await get(`/v1/workspaces/${wsA}/tickets/${ticketInB}/events`, headers);
    expect(historyThroughA.statusCode).toBe(404);
  });
});

describe('GET /v1/workspaces/:workspaceId/tickets — the viewer’s slice, filtered server-side', () => {
  it('returns only the tickets this viewer may see, and an outsider gets an empty list rather than a refusal', async () => {
    // Mutation: return every row for the workspace instead of
    // `listVisibleTickets`' filtered set and the id-set assertion reddens. The
    // outsider half is the collection-shaped statement of the same honesty rule
    // as the 404 — "you may not see this" and "there is nothing here" must not
    // be tellable apart — so it is a 200 with nothing, never a 403.
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: mine }]);
    const ticketMine = newUlid();
    const ticketTheirs = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: ticketMine });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: ticketTheirs });

    const res = await get(`/v1/workspaces/${ws}/tickets`, headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().tickets.map((t: { ticket_id: string }) => t.ticket_id)).toEqual([ticketMine]);

    const outsider = await signedIn();
    const theirView = await get(`/v1/workspaces/${ws}/tickets`, outsider.headers);
    expect(theirView.statusCode).toBe(200);
    expect(theirView.json()).toEqual({ tickets: [] });
  });

  it('the list row and the single read serve the very same row, so the two halves of this surface cannot drift', async () => {
    // The substitution pin. Both sites serve the same `toTicketView` allow-list
    // over `proj_visibility` today because `proj_tickets` does not exist (cases
    // 6.61, 6.66, 6.72); when it lands, both have to change together or this
    // reddens. Mutation: have the single read return the raw row instead of the
    // mapper's view and the deep-equality fails. (Narrowing the mapper itself
    // no longer reddens this case — both routes go through the one mapper, so
    // they narrow together; that is what 6.72 pins instead.)
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    const ticketId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId });

    const list = await get(`/v1/workspaces/${ws}/tickets`, headers);
    const single = await get(`/v1/workspaces/${ws}/tickets/${ticketId}`, headers);
    expect(list.json().tickets).toHaveLength(1);
    expect(single.json().ticket).toEqual(list.json().tickets[0]);
    expect(single.json().ticket.ticket_id).toBe(ticketId);
    // A root ticket claims no parent, and says so rather than omitting the key.
    expect(single.json().parent).toBeNull();
  });
});

describe('the restricted-parent placeholder — existence, and nothing else', () => {
  it('a visible child under a parent it may not see reports the parent’s existence and its id alone', async () => {
    // Mutation: return the parent's row on the restricted branch (or fall back
    // to `parent: null`) and this reddens — `toEqual` is exact, so a grown
    // field fails, and a null parent fails too. The sibling test below is the
    // control that the visible branch really does carry more, so "existence and
    // nothing else" is a contrast rather than a description of every branch.
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    const parentId = newUlid();
    const childId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parentId });
    await applyAll(db.pool, [setVisibilityEnv(ws, parentId, 'explicit', [newUlid()])]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: childId, parentId });
    // Authored back open: the child inherited the parent's explicit list at
    // creation, so without this the child would be invisible too and the test
    // would be measuring nothing.
    await applyAll(db.pool, [setVisibilityEnv(ws, childId, 'project')]);

    // The parent really is out of reach — asserted, not assumed. Without this
    // the case would pass just as well against a parent the viewer could see
    // if the branch were inverted.
    const parentDirect = await get(`/v1/workspaces/${ws}/tickets/${parentId}`, headers);
    expect(parentDirect.statusCode).toBe(404);

    const res = await get(`/v1/workspaces/${ws}/tickets/${childId}`, headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().parent).toEqual({ kind: 'restricted', id: parentId });
  });

  it('a visible parent comes through as kind ticket carrying the same row a direct read of it serves', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    const parentId = newUlid();
    const childId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parentId });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: childId, parentId });

    const parentDirect = await get(`/v1/workspaces/${ws}/tickets/${parentId}`, headers);
    const res = await get(`/v1/workspaces/${ws}/tickets/${childId}`, headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().parent).toEqual({
      kind: 'ticket',
      id: parentId,
      ticket: parentDirect.json().ticket,
    });
  });

  it('a parent_id naming no ticket at all reports no parent, rather than inventing a restricted one', async () => {
    // The inverse leak, and the one the obvious implementation commits: `canSee`
    // answers `false` for an invisible ticket AND for a ticket with no row, so
    // collapsing the two branches would have this route assert the existence of
    // a ticket the system has no evidence for. `proj_visibility` already
    // resolves such a child as a ROOT (case 6.9), so `null` is also the answer
    // the projection gave.
    // Mutation: drop the `parentRow === undefined` branch and fall through to
    // `{ kind: 'restricted' }` — this reddens naming the dangling id.
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    const childId = newUlid();
    const neverCreated = newUlid();
    await seedTicket(db.pool, {
      workspaceId: ws,
      projectId: prj,
      ticketId: childId,
      parentId: neverCreated,
    });

    const res = await get(`/v1/workspaces/${ws}/tickets/${childId}`, headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().ticket.parent_id).toBe(neverCreated);
    expect(res.json().parent).toBeNull();
  });
});

describe('a served row discloses no ticket the viewer may not see, beyond the one authorized parent', () => {
  it('the authoring ancestor a child inherited from is not on the wire, though the projection stores its id', async () => {
    // `resolved_from` names the nearest AUTHORED ancestor, which is deliberately
    // not the immediate parent (case 6.9), so serving the raw row leaks the
    // existence of a ticket that is neither visible nor the parent — outside the
    // one leak spec §6 authorizes. This is the fixture that reaches it: a child
    // in project R, under a parent in project Q, inheriting a Q grandparent's
    // authored mode. Nothing refuses a cross-project parent today (case 6.57).
    //
    // Mutation: put `resolved_from` back into `toTicketView` and this reddens
    // naming the grandparent's id.
    const ws = newUlid();
    const projectQ = newUlid();
    const projectR = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: projectR }]);

    const grandparent = newUlid();
    const parentId = newUlid();
    const childId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: projectQ, ticketId: grandparent });
    // The grandparent AUTHORS a mode, which is what makes it the ancestor
    // `resolved_from` names rather than leaving the chain at the project default.
    await applyAll(db.pool, [setVisibilityEnv(ws, grandparent, 'project')]);
    await seedTicket(db.pool, {
      workspaceId: ws,
      projectId: projectQ,
      ticketId: parentId,
      parentId: grandparent,
    });
    await seedTicket(db.pool, {
      workspaceId: ws,
      projectId: projectR,
      ticketId: childId,
      parentId,
    });

    // Non-vacuity: the projection really did store the grandparent's id on the
    // child's row. Without this the test would pass just as well against a
    // fixture where `resolved_from` was empty and there was nothing to leak.
    const stored = await db.pool.query<{ resolved_from: string }>(
      'SELECT resolved_from FROM proj_visibility WHERE ticket_id = $1',
      [childId],
    );
    expect(stored.rows[0]?.resolved_from).toBe(grandparent);

    // The two ancestors are both out of reach — asserted, not assumed.
    expect((await get(`/v1/workspaces/${ws}/tickets/${grandparent}`, headers)).statusCode).toBe(404);
    expect((await get(`/v1/workspaces/${ws}/tickets/${parentId}`, headers)).statusCode).toBe(404);

    const res = await get(`/v1/workspaces/${ws}/tickets/${childId}`, headers);
    expect(res.statusCode).toBe(200);
    // The parent IS disclosed — that is the authorized placeholder. The
    // grandparent is not, anywhere in the response.
    expect(res.json().parent).toEqual({ kind: 'restricted', id: parentId });
    expect(res.body).not.toContain(grandparent);

    // And not through the list either, which goes through the same mapper.
    const list = await get(`/v1/workspaces/${ws}/tickets`, headers);
    expect(list.json().tickets.map((t: { ticket_id: string }) => t.ticket_id)).toEqual([childId]);
    expect(list.body).not.toContain(grandparent);

    // The audience roster is not on the wire either — a smaller cut, made here
    // rather than left to the shape of a `SELECT *`.
    expect(res.json().ticket).not.toHaveProperty('resolved_user_ids');
    expect(res.json().ticket).not.toHaveProperty('own_user_ids');
  });
});

describe('provenance is never redacted from someone entitled to the state', () => {
  it('history carries the actor and both clocks untouched, though the actor shares no project — indeed nothing — with the viewer', async () => {
    // Mutation: replace `actor_id` with a placeholder for an actor the viewer
    // shares nothing with, or render either clock any way but the ISO instant
    // (`String(row.client_time)` yields the Asia/Kolkata `+05:30` rendering) —
    // each reddens naming its own field.
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    const ticketId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId });

    const stranger = newUlid();
    const claim = testEnvelope({
      workspaceId: ws,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
      actorId: stranger,
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:02.000Z',
    });
    await appendTestEvent(db.pool, claim);

    const res = await get(`/v1/workspaces/${ws}/tickets/${ticketId}/events`, headers);
    expect(res.statusCode).toBe(200);
    const event = res.json().events.find((e: { id: string }) => e.id === claim.id);
    expect(event).toMatchObject({
      actor_id: stranger,
      client_time: '2026-08-19T10:00:00.000Z',
      server_time: '2026-08-19T10:00:02.000Z',
      origin: 'web',
      type: 'ticket.transitioned',
    });
    // The two clocks are separate facts and both survive: a serializer that
    // dropped one, or collapsed them onto each other, would pass an assertion
    // that only looked at one.
    expect(event.client_time).not.toBe(event.server_time);
  });
});

describe('every door on this surface requires a session', () => {
  it('all three routes answer the generic 401 with no session', async () => {
    // Without this the whole file would prove only that a signed-in caller is
    // filtered: a route registered WITHOUT `requireSession` leaves
    // `request.currentUserId` undefined, which resolves to no role and 404s
    // anyway — so every refusal case above would still pass while the door
    // stood open. Mutation: drop `preHandler: requireSession` from any of the
    // three registrations and its line here answers 404 or 200 instead of 401.
    const ws = newUlid();
    const ticketId = newUlid();
    for (const url of [
      `/v1/workspaces/${ws}/tickets`,
      `/v1/workspaces/${ws}/tickets/${ticketId}`,
      `/v1/workspaces/${ws}/tickets/${ticketId}/events`,
    ]) {
      const res = await get(url);
      expect([url, res.statusCode]).toEqual([url, 401]);
      expect(res.json()).toEqual({ error: 'unauthenticated' });
    }
  });
});
