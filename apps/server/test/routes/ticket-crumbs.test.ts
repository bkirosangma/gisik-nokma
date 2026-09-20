import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { ticketTypesProjection } from '../../src/projections/ticket-types.js';
import { applyAll, seedMember, seedProject, seedTicket, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * The sheet's breadcrumb data — `key` and `epic` — **served by the REAL route
 * against a REAL database**, which is the only evidence this repo accepts for a
 * wire field.
 *
 * ## Why this file exists rather than a case in the client's suite
 *
 * The client's sheet cases (`16.63`–`16.68`) drive the CRUMB and they drive it
 * through a fake data source. A fake is exactly the thing that *"excuses the
 * server from existing"* — this series' signature failure — and neither field
 * had a server-side consumer before 2026-09-20: `ticketNumber` was referenced
 * only by its own tests, and `epicAncestors` was private to the list route. So
 * the two facts the breadcrumb is BUILT on get their own door-proven cases here.
 *
 * ## What a mocked version of this file would have proved
 *
 * Nothing about the composition. `key` is three LEDGER reads joined by
 * `ticketKey`, and each of the three can be wrong independently: the workspace
 * prefix is a fold over `workspace.created`, the project prefix is resolved
 * against EVERY project in the workspace (uniqueness and derivation are
 * workspace-wide rules), and the number is the ticket's position among its
 * project's creations by `workspace_seq`. A fixture that stubbed any one of
 * them would pin the join and nothing else.
 */

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

async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9198000${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

function get(url: string, headers?: Record<string, string>): Promise<{ statusCode: number; json: () => any }> {
  const options: InjectOptions = { method: 'GET', url, ...(headers ? { headers } : {}) };
  return app.inject(options) as never;
}

/**
 * A workspace with a founding claim, so `workspaceIdentityFromLedger` has a NAME
 * and a PREFIX to answer with.
 *
 * ⚠ **`projectPrefixesInWorkspace` resolves against every project in the
 * workspace**, not just this one — the uniqueness rule is workspace-wide and a
 * project that entered nothing still derives a prefix — so a case that wants to
 * pin the project half must control the whole set. One project per case here.
 */
async function seedFounding(workspaceId: string, prefix: string): Promise<void> {
  await appendTestEvent(
    db.pool,
    testEnvelope({
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.created',
      payload: { name: 'Convenience Corner', prefix },
      actorId: newUlid(),
    }),
  );
}

/**
 * A ticket TYPE — the row `proj_ticket_types` folds, and the thing the epic
 * walk resolves its rank against.
 *
 * ⚠ **`seedTicket` deliberately does not write this table** (its own docblock:
 * the founding sequence is not run by these fixtures), so a case that wants an
 * EPIC-rank ancestor must ask for one.
 *
 * ⚠⚠ **AND `applyAll` DOES NOT PROJECT IT.** My first version of this helper
 * called `applyAll` and wrote a comment claiming *"the projection is what
 * writes `proj_ticket_types`"* — which is true of `applyAll`'s four projections
 * and FALSE of this event type. That helper's own docblock says so in as many
 * words (*"FOUR of the registry's projections, and the name does not say so …
 * hand this a `workflow.defined` and it goes NOWHERE and reports nothing"*),
 * and the failure it produces is exactly the quiet one: the event is in the
 * ledger, no row is written, and the case reddens as *"the walk found no epic"*
 * — a green-looking fixture and a red assertion about the wrong thing.
 *
 * So this follows `seedWorkflowDef`'s recorded pattern: append the event AND
 * apply the ONE projection it needs, by hand.
 */
async function seedType(workspaceId: string, id: string, rank: number): Promise<void> {
  const event = testEnvelope({
    workspaceId,
    entity: { kind: 'ticket-type', id },
    type: 'ticket-type.defined',
    payload: { id, name: id, icon: 'flag', rank, workflowId: 'wf-seed', fields: [] },
    actorId: newUlid(),
  });
  await appendTestEvent(db.pool, event);
  const client = await db.pool.connect();
  try {
    await ticketTypesProjection.apply(event, client);
  } finally {
    client.release();
  }
}

describe('16.69 the detail route composes the ticket KEY from three ledger facts', () => {
  it('the bare key reaches the wire, and the NUMBER is the ticket’s position in its project', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    await seedFounding(ws, 'CC');
    await seedProject(db.pool, ws, prj, 'Shop operations', undefined, 'SO');

    const first = newUlid();
    const second = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: first });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: second });

    // BOTH read, in one case, because "the number" is a POSITION and a single
    // read cannot tell a correct position from a constant. A route answering
    // `1` for everything passes the first assertion alone.
    const firstRead = await get(`/v1/workspaces/${ws}/tickets/${first}`, headers);
    expect(firstRead.statusCode).toBe(200);
    expect(firstRead.json().key).toBe('CCSO-1');

    const secondRead = await get(`/v1/workspaces/${ws}/tickets/${second}`, headers);
    expect(secondRead.statusCode).toBe(200);
    expect(secondRead.json().key).toBe('CCSO-2');

    // The WORKSPACE half is the fold, not a constant: a second workspace with a
    // different founding prefix must not answer the same string.
    const otherWs = newUlid();
    const otherPrj = newUlid();
    const { userId: otherUser, headers: otherHeaders } = await signedIn();
    await seedMember(db.pool, otherWs, otherUser, 'member', [{ projectId: otherPrj }]);
    await seedFounding(otherWs, 'ZZ');
    await seedProject(db.pool, otherWs, otherPrj, 'Shop operations', undefined, 'SO');
    const otherTicket = newUlid();
    await seedTicket(db.pool, { workspaceId: otherWs, projectId: otherPrj, ticketId: otherTicket });

    const otherRead = await get(`/v1/workspaces/${otherWs}/tickets/${otherTicket}`, otherHeaders);
    expect(otherRead.json().key).toBe('ZZSO-1');
  });

  it('a workspace with NO founding claim answers key null, and the rest of the read still serves', async () => {
    // The absence half, and the reason it is a CASE rather than a comment:
    // `read/ticket-numbers.ts` rules that a key is not worth refusing a ticket
    // read over, so `null` must reach the wire WITHOUT taking the read down.
    // Asserted beside a field that IS served, so a route that 500'd, or one
    // that answered an empty body, cannot pass this by being empty.
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    await seedProject(db.pool, ws, prj, 'Shop operations', undefined, 'SO');
    const ticketId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId });

    const res = await get(`/v1/workspaces/${ws}/tickets/${ticketId}`, headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().key).toBeNull();
    expect(res.json().title).toBe(`Ticket ${ticketId}`);
  });
});

describe('16.70 the grandparent is the nearest PROPER ancestor of EPIC rank', () => {
  it('resolves through an intermediate parent, and is null for the epic itself', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    await seedProject(db.pool, ws, prj, 'Shop operations', undefined, 'SO');
    await seedType(ws, 'epic', 1);
    await seedType(ws, 'story', 2);
    await seedType(ws, 'task', 3);

    const epicId = newUlid();
    const storyId = newUlid();
    const taskId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: epicId, typeId: 'epic' });
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: storyId, typeId: 'story', parentId: epicId,
    });
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: taskId, typeId: 'task', parentId: storyId,
    });

    // THE WALK IS TWO HOPS, which is the whole point: the task's immediate
    // parent is the STORY and must not be reported as the grandparent.
    const taskRead = await get(`/v1/workspaces/${ws}/tickets/${taskId}`, headers);
    expect(taskRead.statusCode).toBe(200);
    expect(taskRead.json().epic).toEqual({ kind: 'ticket', id: epicId, title: `Ticket ${epicId}` });
    expect(taskRead.json().parent).toMatchObject({ kind: 'ticket', id: storyId });

    // ⚠ THE PROPERTY THAT SEPARATES THIS FROM THE BOARD'S GROUPING. The list
    // route resolves the nearest epic-rank ancestor-OR-SELF, because a lane
    // legitimately holds an epic's own card. A CRUMB does not: the epic's own
    // sheet must not draw itself one level above itself. This assertion is what
    // fails on a version that reused `epicAncestorOf` unchanged.
    const epicRead = await get(`/v1/workspaces/${ws}/tickets/${epicId}`, headers);
    expect(epicRead.json().epic).toBeNull();

    // And the control for THAT: a task with no epic above it is also null, so
    // the assertion above is not passing merely because every epic is null.
    const rootTask = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: rootTask, typeId: 'task' });
    const rootRead = await get(`/v1/workspaces/${ws}/tickets/${rootTask}`, headers);
    expect(rootRead.json().epic).toBeNull();
  });

  it('a grandparent the viewer may NOT see is restricted — existence and id, no title', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    await seedProject(db.pool, ws, prj, 'Shop operations', undefined, 'SO');
    await seedType(ws, 'epic', 1);
    await seedType(ws, 'story', 2);
    await seedType(ws, 'task', 3);

    const epicId = newUlid();
    const storyId = newUlid();
    const taskId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: epicId, typeId: 'epic' });
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: storyId, typeId: 'story', parentId: epicId,
    });
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: taskId, typeId: 'task', parentId: storyId,
    });
    // The EPIC alone is put out of reach, and the story is authored back to
    // `project` so the walk has one hop to take before it hits the restriction.
    // Both moves are asserted below rather than assumed.
    await applyAll(db.pool, [
      setVisibilityEnv(ws, epicId, 'explicit', [newUlid()]),
      setVisibilityEnv(ws, storyId, 'project'),
      setVisibilityEnv(ws, taskId, 'project'),
    ]);

    const epicDirect = await get(`/v1/workspaces/${ws}/tickets/${epicId}`, headers);
    expect(epicDirect.statusCode).toBe(404);

    const res = await get(`/v1/workspaces/${ws}/tickets/${taskId}`, headers);
    expect(res.statusCode).toBe(200);
    // EXACT, so a leaked title reddens. The arm structurally has no field for
    // one — `AncestorRef`'s restricted member carries `id` and nothing else.
    expect(res.json().epic).toEqual({ kind: 'restricted', id: epicId });
    expect(JSON.stringify(res.json())).not.toContain(`Ticket ${epicId}`);
    // And the parent is still VISIBLE in the same run, so "restricted" is a
    // contrast between two arms rather than the shape of every ancestor.
    expect(res.json().parent).toMatchObject({ kind: 'ticket', id: storyId });
  });
});
