import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { INVALID_NAME_BODY } from '../../src/routes/workspaces.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { revokeMember, seedGuest } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Plan 4 Task 13 — the founding route `POST /v1/workspaces`, and the directory
 * `GET /v1/me/workspaces` that answers it.
 *
 * ## The real app, and the real founding sequence
 *
 * `buildTestApp` is `buildApp` with the real auth, the real GATED ingest and
 * the real projection registry. Nothing here hand-appends a `workspace.created`
 * envelope — which is what every other test in this repo has had to do, because
 * until this task the product had no door to found a workspace through. The
 * founding sequence (`bootstrapWorkspace`) fires from inside the ingest path,
 * so these cases exercise the same sequence Plan 11's seed CLIs will.
 *
 * ## Reads go to the ledger and to the projections that exist
 *
 * The plan text's usability case reads `proj_ticket_types`. **That table does
 * not exist on this branch** — Plan 3 Chain B owns it (§8 position 3) — so the
 * four built-in type definitions are read from the LEDGER, which is where the
 * founding sequence actually put them. `proj_workflows` and `proj_memberships`
 * do exist and are read as themselves.
 *
 * ## Every case's earlier guards are made to pass
 *
 * Each caller here really is signed in, over the wire, through the real OTP
 * path (`signInWithPhone`). A 401 case that failed because the route was
 * misspelled, or a 400 that fired because the session was missing, would prove
 * nothing about the check it names — so the refusal cases below each carry a
 * positive control that differs in exactly the one field under test.
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

/** A signed-in caller, real sign-in over the wire. */
async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9190004${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

/** Found a workspace through the product's own door, asserting it worked. */
async function found(
  headers: { authorization: string },
  name = 'Convenience Corner',
): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/v1/workspaces', headers, payload: { name } });
  expect(res.statusCode).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

/** The workspace's whole ledger, in the only order that spans its entity kinds (coordination §18). */
async function workspaceStream(workspaceId: string) {
  const { rows } = await db.pool.query<{ type: string; payload: Record<string, unknown> }>(
    'SELECT type, payload FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
    [workspaceId],
  );
  return rows;
}

/** How many events this person has ever authored, anywhere. The "nothing was appended" instrument. */
async function eventsAuthoredBy(userId: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM events WHERE actor_id = $1',
    [userId],
  );
  return rows[0]?.n ?? 0;
}

describe('POST /v1/workspaces — the founding door', () => {
  it('founds a workspace and returns its id', async () => {
    const { headers } = await signedIn();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers,
      payload: { name: 'Convenience Corner' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { workspaceId: string };
    // Crockford base32, the ULID alphabet: no I, L, O or U.
    expect(body.workspaceId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    // Exactly the one field. A route that grew a second one — the founding
    // event's id, say — would be disclosing server state nobody asked for.
    expect(body).toEqual({ workspaceId: body.workspaceId });
  });

  it('the founded workspace arrives usable — owner, a workflow, and all four built-in types bound to it', async () => {
    const { userId, headers } = await signedIn();
    const workspaceId = await found(headers);

    const role = await db.pool.query<{ role: string }>(
      `SELECT role FROM proj_memberships
        WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'`,
      [workspaceId, userId],
    );
    expect(role.rows).toEqual([{ role: 'owner' }]);

    const workflows = await db.pool.query<{ workflow_id: string }>(
      'SELECT workflow_id FROM proj_workflows WHERE workspace_id = $1',
      [workspaceId],
    );
    expect(workflows.rows).toHaveLength(1);
    const workflowId = workflows.rows[0]?.workflow_id;

    // The whole ledger, in workspace-cursor order — the founding event, then
    // the sequence. Asserted as a sequence rather than as four independent
    // existence checks, because the ORDER is the load-bearing part: a type
    // binding read back at any position must name a workflow that already
    // exists at that position, or a replay describes a workspace that could
    // not have worked (`src/workspaces/bootstrap-workspace.ts`).
    const rows = await workspaceStream(workspaceId);
    expect(rows.map((row) => row.type)).toEqual([
      'workspace.created',
      'workflow.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'membership.granted',
    ]);
    // `proj_ticket_types` does not exist on this branch, so the definitions are
    // read where the sequence put them.
    const types = rows.slice(2, 6);
    expect(types.map((row) => row.payload['id'])).toEqual(['epic', 'story', 'task', 'sub-task']);
    for (const row of types) {
      expect(row.payload['workflowId']).toBe(workflowId);
    }
  });

  it('a request with no session is refused with the generic 401 — founding needs a signed-in person', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/workspaces', payload: { name: 'Nobody' } });
    expect(res.statusCode).toBe(401);
    // The positive control is every other case in this file: the identical
    // request WITH a bearer token answers 201, so this is the session check and
    // not a route that refuses everything.
  });

  it('a nameless workspace is refused, and nothing is appended', async () => {
    const { userId, headers } = await signedIn();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers,
      payload: { name: '   ' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(INVALID_NAME_BODY);
    // Scoped to THIS caller rather than `count(*) FROM events`: the cases above
    // have already founded workspaces in this database, so a global count would
    // be non-zero for reasons that have nothing to do with this request. Zero
    // here is the real claim — this person has authored nothing at all.
    expect(await eventsAuthoredBy(userId)).toBe(0);

    // The positive control, one field apart: the same caller, the same route, a
    // name that is not only spaces. Without it, "refuses every founding" passes.
    const ok = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers,
      payload: { name: ' Corner ' },
    });
    expect(ok.statusCode).toBe(201);
    // The name is stored AS CLAIMED, not trimmed: the ledger records what the
    // actor said (`displayName` in the domain REFUSES a blank rather than
    // trimming, for the same reason).
    const rows = await workspaceStream((ok.json() as { workspaceId: string }).workspaceId);
    expect(rows[0]?.payload['name']).toBe(' Corner ');
  });

  it('planted defect: a body that names the workspace it wants to found is refused, and appends nothing', async () => {
    // THE ROUTE'S HALF OF CASE 6.52. The gate refuses a `workspace.created`
    // naming an already-founded workspace, but that refusal is unreachable from
    // HERE: this route mints the ULID server-side, so a route-originated
    // founding always names a workspace with no ledger. What has to be true at
    // this door is narrower and structural — a client cannot choose which
    // workspace it founds.
    //
    // The plan text's handler destructures `{ name }` off an unschema'd body,
    // under which this request is silently ACCEPTED and the extra key ignored:
    // the right outcome by accident, one refactor away from being the wrong
    // one. `additionalProperties: false` is what makes it a refusal.
    // Mutation: drop `additionalProperties: false` from the body schema and
    // this case is the only one that goes red.
    const victim = await signedIn();
    const victimWorkspace = await found(victim.headers, "Victim's");
    const attacker = await signedIn();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: attacker.headers,
      payload: { name: 'Mine now', workspaceId: victimWorkspace },
    });

    expect(res.statusCode).toBe(400);
    expect(await eventsAuthoredBy(attacker.userId)).toBe(0);
    // The victim's workspace is untouched: still seven events, still one
    // workspace-scope member, still the founder.
    expect((await workspaceStream(victimWorkspace)).length).toBe(7);
    const { rows } = await db.pool.query<{ user_id: string; role: string }>(
      `SELECT user_id, role FROM proj_memberships
        WHERE workspace_id = $1 AND scope_kind = 'workspace'`,
      [victimWorkspace],
    );
    expect(rows).toEqual([{ user_id: victim.userId, role: 'owner' }]);

    // Positive control, one KEY apart: the same attacker, the same route, the
    // same name, without the extra key — 201, and a workspace of their own.
    const ok = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: attacker.headers,
      payload: { name: 'Mine now' },
    });
    expect(ok.statusCode).toBe(201);
    expect((ok.json() as { workspaceId: string }).workspaceId).not.toBe(victimWorkspace);
  });

  it('each call founds a NEW workspace — the same person founding twice gets two ledgers', async () => {
    // Why the gate's second-founding refusal can never fire on this path, said
    // as a measurement rather than as a comment: the id is minted per call.
    // It is also what makes the half-founded residue of case 6.53 harmless
    // through this door — a retry founds a fresh, complete workspace rather
    // than meeting the broken one.
    const { headers } = await signedIn();
    const first = await found(headers, 'One');
    const second = await found(headers, 'Two');

    expect(first).not.toBe(second);
    expect((await workspaceStream(first)).map((row) => row.type)).toHaveLength(7);
    expect((await workspaceStream(second)).map((row) => row.type)).toHaveLength(7);
    expect((await workspaceStream(first))[0]?.payload['name']).toBe('One');
    expect((await workspaceStream(second))[0]?.payload['name']).toBe('Two');
  });

  it("a founded workspace still cannot hold a ticket on this branch — and it is not the founding sequence's fault", async () => {
    // CASE 6.25, HONESTLY. Its reserved text says a founded workspace accepts a
    // ticket immediately. **It does not on this branch, and cannot**:
    // `createEngineContext.getTicketTypeDef` returns null unconditionally
    // because `proj_ticket_types` does not exist (Plan 3 Chain B owns it), so
    // `checkTicketCreated` refuses `ticket.unknown-type` for EVERY ticket in
    // EVERY workspace, founded or not.
    //
    // Writing the reserved case as a passing assertion would therefore have
    // needed the refusal to be the expected answer while the case NAME promised
    // acceptance — the signature defect this branch keeps catching. So the case
    // measures the real state of the world instead, and pins the discriminator:
    // the four type definitions ARE in the ledger, which is the half Task 13
    // owns, and the refusal comes from the half it does not.
    const { userId, headers } = await signedIn();
    const workspaceId = await found(headers);
    const projectId = newUlid();

    const project: SubmittedEvent = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.created',
      version: 1,
      payload: { name: 'Shop floor' },
      actorId: userId,
      origin: 'web',
      clientTime: new Date().toISOString(),
    };
    const projectRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [project] },
    });
    // The founder is `owner`, and `project.created` is admin-only — so this
    // committing is itself proof the grant at the end of the founding sequence
    // reached `proj_memberships` and is being read by the gate.
    expect((projectRes.json() as { results: [{ status: string }] }).results[0]?.status).toBe('committed');

    // The roster step the reserved text names. Without it the founder — owner
    // of the workspace, but not ON the project — is refused
    // `NOT_ON_PROJECT_REASON` by the visibility pass, which would make the
    // assertion below fire before the type check it is about. Every earlier
    // guard is made to pass first, deliberately.
    const roster: SubmittedEvent = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.member_added',
      version: 1,
      payload: { userId, projectAdmin: true },
      actorId: userId,
      origin: 'web',
      clientTime: new Date().toISOString(),
    };
    const rosterRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [roster] },
    });
    expect((rosterRes.json() as { results: [{ status: string }] }).results[0]?.status).toBe('committed');

    const ticket: SubmittedEvent = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'ticket', id: newUlid() },
      type: 'ticket.created',
      version: 1,
      payload: { typeId: 'task', projectId, parentId: null, title: 'First ticket' },
      actorId: userId,
      origin: 'web',
      clientTime: new Date().toISOString(),
    };
    const ticketRes = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [ticket] },
    });
    expect(ticketRes.json()).toMatchObject({
      results: [{ status: 'refused', eventId: ticket.id, rule: 'ticket.unknown-type' }],
    });

    // The discriminator: `task` really is defined in this workspace's ledger,
    // by the founding sequence, bound to the workspace's only workflow. The
    // refusal above is `getTicketTypeDef` answering null, not a missing type.
    const rows = await workspaceStream(workspaceId);
    expect(rows.slice(2, 6).map((row) => row.payload['id'])).toEqual(['epic', 'story', 'task', 'sub-task']);
  });
});

describe('GET /v1/me/workspaces — the directory', () => {
  it('lists the workspaces this person belongs to, with names and roles', async () => {
    const { headers } = await signedIn();
    const a = await found(headers, 'Alpha');
    const b = await found(headers, 'Beta');
    // A workspace someone ELSE founded, to prove the list is scoped to the
    // caller's own memberships rather than to every workspace in the database.
    const stranger = await signedIn();
    const theirs = await found(stranger.headers, 'Not yours');

    const res = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers });
    expect(res.statusCode).toBe(200);
    const { workspaces } = res.json() as {
      workspaces: Array<{ workspaceId: string; name: string | null; role: string }>;
    };

    expect(workspaces).toEqual(
      [
        { workspaceId: a, name: 'Alpha', role: 'owner' },
        { workspaceId: b, name: 'Beta', role: 'owner' },
      ].sort((x, y) => x.workspaceId.localeCompare(y.workspaceId)),
    );
    expect(workspaces.map((w) => w.workspaceId)).not.toContain(theirs);
  });

  it('the name follows a rename — it is the LAST thing anyone said the workspace is called', async () => {
    // The instrument, named: `workspaceNameFromLedger` orders by
    // `workspace_seq`, the workspace's own cursor, and not by the per-entity
    // `seq` and not by a clock. Mutation: order ASC and this reports the
    // founding name for a workspace that has been renamed.
    const { userId, headers } = await signedIn();
    const workspaceId = await found(headers, 'Before');

    const rename: SubmittedEvent = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.renamed',
      version: 1,
      payload: { name: 'After' },
      actorId: userId,
      origin: 'web',
      clientTime: new Date().toISOString(),
    };
    const renamed = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [rename] },
    });
    expect((renamed.json() as { results: [{ status: string }] }).results[0]?.status).toBe('committed');

    const res = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers });
    const { workspaces } = res.json() as { workspaces: Array<{ workspaceId: string; name: string }> };
    expect(workspaces.find((w) => w.workspaceId === workspaceId)?.name).toBe('After');
  });

  it('a guest is told where they are a guest — their own membership, not somebody else’s data', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers, 'Hosted');
    const guest = await signedIn();
    await seedGuest(db.pool, workspaceId, guest.userId);

    const res = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: guest.headers });
    expect(res.json()).toEqual({
      workspaces: [{ workspaceId, name: 'Hosted', role: 'guest' }],
    });
  });

  it('a revoked membership disappears on the next call', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers, 'Leaving');
    const member = await signedIn();
    await seedGuest(db.pool, workspaceId, member.userId);

    // Positive control FIRST, in the same case: the row is there before the
    // revocation, so the empty list afterwards is the revocation and not a
    // directory that never listed this person.
    const before = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: member.headers });
    expect((before.json() as { workspaces: unknown[] }).workspaces).toHaveLength(1);

    await revokeMember(db.pool, workspaceId, member.userId);

    const after = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: member.headers });
    expect(after.json()).toEqual({ workspaces: [] });
    // And the owner still holds theirs — the revocation took one row, not the
    // workspace.
    const ownerRes = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: owner.headers });
    expect((ownerRes.json() as { workspaces: Array<{ workspaceId: string }> }).workspaces).toContainEqual({
      workspaceId,
      name: 'Leaving',
      role: 'owner',
    });
  });

  it('a request with no session is refused with the generic 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/workspaces' });
    expect(res.statusCode).toBe(401);
  });
});
