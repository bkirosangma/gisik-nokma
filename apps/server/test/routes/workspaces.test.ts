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
 * five built-in type definitions are read from the LEDGER, which is where the
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
  /**
   * 6.23 — `POST /v1/workspaces` founds a workspace for any signed-in person and returns its id: a ULID in the Crockford alphabet, and ONLY that.
   */
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

  it('the founded workspace arrives usable — owner, a workflow, and all five built-in types bound to it (29.134)', async () => {
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
      'ticket-type.defined',
      'membership.granted',
    ]);
    // `proj_ticket_types` does not exist on this branch, so the definitions are
    // read where the sequence put them.
    const types = rows.slice(2, 7);
    expect(types.map((row) => row.payload['id'])).toEqual(['epic', 'story', 'task', 'sub-task', 'decision']);
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

  /**
   * 6.106 — planted defect, and the founding route’s own half of 6.52: a body that NAMES the workspace it wants to found is REFUSED rather than ignored, and appends nothing.
   */
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
    // The victim's workspace is untouched: still eight events, still one
    // workspace-scope member, still the founder.
    expect((await workspaceStream(victimWorkspace)).length).toBe(8);
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
    expect((await workspaceStream(first)).map((row) => row.type)).toHaveLength(8);
    expect((await workspaceStream(second)).map((row) => row.type)).toHaveLength(8);
    expect((await workspaceStream(first))[0]?.payload['name']).toBe('One');
    expect((await workspaceStream(second))[0]?.payload['name']).toBe('Two');
  });

  it('a founded workspace holds a ticket immediately — case 6.25, whole at last', async () => {
    // CASE 6.25, and this assertion is INVERTED by Plan 3 Chain B Task 12.
    //
    // It used to expect `refused / ticket.unknown-type`, under a name that said
    // a founded workspace "still cannot hold a ticket on this branch". That was
    // true and was measured rather than promised: `createEngineContext`
    // answered null for every ticket type because nothing wired it to
    // `proj_ticket_types`, so `checkTicketCreated` refused EVERY ticket in EVERY
    // workspace, founded or not. Task 12 wired it, and the reserved text — "a
    // founded workspace accepts a ticket immediately" — is now the true one.
    //
    // The discriminator survives the inversion, pointing the other way: the four
    // type definitions in the ledger are the half Plan 4's founding sequence
    // owns, and the resolution of `task` against them is the half Task 12 owns.
    // A commit here needs both.
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

    // The roster step the reserved text names. AMENDED 2026-09-29, owner ruling
    // (A) and deviation D7: this step USED TO be load-bearing — without it the
    // founder was not ON the project and was refused `NOT_ON_PROJECT_REASON`
    // before the type check the assertion below is about. An owner is on every
    // founded project now, so that refusal is unreachable and the step is no
    // longer needed for the reason it was written; it stays, because the
    // founding form still submits it and this case is about the type check.
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
      results: [{ status: 'committed', eventId: ticket.id }],
    });

    // The premise, still asserted: `task` really is defined in this workspace's
    // ledger, by the founding sequence, bound to the workspace's only workflow.
    // Without those four events the create would be refused `ticket.unknown-type`
    // by a context that reads the table correctly and finds nothing in it — "a
    // context that can read the table is not the same thing as a table with the
    // type in it".
    const rows = await workspaceStream(workspaceId);
    expect(rows.slice(2, 7).map((row) => row.payload['id'])).toEqual(['epic', 'story', 'task', 'sub-task', 'decision']);

    // And the create really resolved that type rather than committing past the
    // check: the projected row carries the workflow the founding sequence bound
    // `task` to, which only `getTicketTypeDef` could have supplied.
    const founded = await db.pool.query<{ workflow_id: string; state_id: string }>(
      'SELECT workflow_id, state_id FROM proj_tickets WHERE ticket_id = $1',
      [ticket.entity.id],
    );
    expect(founded.rows[0]?.workflow_id).toBe(rows[1]?.payload['id']);
    expect(founded.rows[0]?.state_id).toBe(rows[1]?.payload['initialStateId']);
  });
});

describe('GET /v1/me/workspaces — the directory', () => {
  /**
   * 6.108 — `GET /v1/me/workspaces` lists this person’s own workspace-scope memberships and nothing else.
   */
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

    // `projects: []` since rulings P32/P38, and empty is the TRUE answer here:
    // `found()` creates a workspace and no project, so there is none to name.
    // Inside the exact `toEqual` rather than omitted — an absent key and an
    // empty list are different claims on this surface.
    // `memberCount: 1` since Task 16 — the founder, alone. Inside the exact
    // `toEqual` for the same reason `projects` is: a count the caller is
    // entitled to and an absent key are different claims, and this caller is an
    // owner, so the key must be here.
    expect(workspaces).toEqual(
      [
        // `nameRestrictedProjectCount: 0` since Task 18, and inside the exact
        // `toEqual` for a third reason on top of the two above: it is the one
        // count served to EVERY caller, so an absent key here would be a route
        // that had started withholding it — which is what a guest-guard copied
        // from `visibleMemberCount` would look like from this door.
        // `prefix` since 2026-09-20: the directory carries the first half of
        // every ticket key in the workspace, and it is a REQUIRED key — an
        // absent one is a route that stopped serving it, which the client's
        // mapper refuses outright. Both are DERIVED here, because `found()`
        // enters no prefix: 'Alpha' -> AL, 'Beta' -> BE.
        { workspaceId: a, name: 'Alpha', prefix: 'AL', role: 'owner', archived: false, memberCount: 1, nameRestrictedProjectCount: 0, projects: [] },
        { workspaceId: b, name: 'Beta', prefix: 'BE', role: 'owner', archived: false, memberCount: 1, nameRestrictedProjectCount: 0, projects: [] },
      ].sort((x, y) => x.workspaceId.localeCompare(y.workspaceId)),
    );
    expect(workspaces.map((w) => w.workspaceId)).not.toContain(theirs);
  });

  /**
   * 6.107 — the directory’s name is a LEDGER FOLD ordered by `workspace_seq`, and there is no `proj_workspaces` table: the name follows a rename because it is the last thing anyone said the workspace is called.
   */
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
    // A PARTIAL WORKSPACE, and ruling P32 says that is the correct answer
    // rather than a defect: this guest holds no project membership, so they are
    // told the workspace they are in and the name of no project in it. The
    // empty list is the rule applying, not a fixture that forgot to seed one.
    expect(res.json()).toEqual({
      // `nameRestrictedProjectCount: 0` and NOT an absent key: this guest is on
      // no project and can see no ticket, so the honest answer is zero — and
      // zero is a claim they are entitled to, unlike `memberCount`, which is
      // absent from this same object one line above. The two sitting side by
      // side is Task 18's ruling stated in the smallest possible fixture.
      workspaces: [
        // `prefix` is served to a GUEST where `memberCount` one line above is
        // withheld, and the difference is real rather than an oversight: a
        // prefix is not a count and not a name of something they cannot see —
        // it is half of every key they will read on a ticket they ARE shown,
        // and a guest holding one ticket needs it to say which ticket it is.
        { workspaceId, name: 'Hosted', prefix: 'HO', role: 'guest', archived: false, nameRestrictedProjectCount: 0, projects: [] },
      ],
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
      archived: false,
      // `toContainEqual` is a DEEP equality on the whole object, so the new
      // fields belong here too — this is not a partial match that would have
      // ignored them.
      //
      // `memberCount: 1` (Task 16) is the owner ALONE, and it is the second
      // reading of this revocation: `revokeMember` deletes the workspace-scope
      // row, so the person who left stops being counted as well as stopping
      // being listed. A 2 here would mean the count reads rows the directory
      // has already stopped believing.
      memberCount: 1,
      nameRestrictedProjectCount: 0,
      // Derived from 'Leaving' — the workspace was founded by `found()` with a
      // name and no prefix.
      prefix: 'LE',
      projects: [],
    });
  });

  it('a request with no session is refused with the generic 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/workspaces' });
    expect(res.statusCode).toBe(401);
  });
});
