import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import {
  INVITE_ADMIN_ONLY_BODY,
  INVITE_NOT_OPENABLE_BODY,
  INVITE_TOKEN_TTL_MS,
  redactInviteToken,
} from '../../src/routes/invites.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Plan 4 Task 14 — invitations: the address-named claim, and the token that is
 * not history.
 *
 * ## The real app, the real doors
 *
 * `buildTestApp` is `buildApp` with the real auth, the real GATED ingest, the
 * real projection registry and the real internal append capability. Every
 * workspace here is founded through `POST /v1/workspaces`, every caller is
 * signed in over the wire through the real OTP path, and every invitation is
 * minted, read and accepted through the routes as they ship. Nothing is stubbed,
 * so a case that passes here passes against the product.
 *
 * ## Every refusal case makes its earlier guards pass
 *
 * A refusal that fires before the interesting code proves nothing. So the
 * member-refused case uses a real member of the real workspace; the
 * client-submitted-acceptance case uses a real ADMIN (a non-member would be
 * answered "you are not a member" and would prove nothing about the acceptance
 * rule); the expired-token case uses a token that was genuinely minted and
 * genuinely worked a moment earlier.
 *
 * ## Positive controls, everywhere a negative is asserted
 *
 * Every "this is refused" sits beside a "this identical thing, differing in the
 * one field under test, is accepted". Every "nothing was appended" sits beside a
 * count of what a successful path DOES append. An exclusion assertion with no
 * positive control passes on an empty result.
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

type Caller = { userId: string; headers: { authorization: string } };

let phoneCounter = 0;

async function signedIn(): Promise<Caller> {
  phoneCounter += 1;
  return withHeaders(await signInWithPhone(app, otp, `+9190014${String(phoneCounter).padStart(5, '0')}`));
}

function withHeaders(user: { userId: string; token: string }): Caller {
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

/** Found a workspace through the product's own door; the founder is its owner. */
async function found(owner: Caller, name = 'Convenience Corner'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: owner.headers, payload: { name } });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

type MintBody = { address?: string; channel?: string; role?: string; projectIds?: string[] };

async function mint(caller: Caller, workspaceId: string, body: MintBody = {}) {
  return app.inject({
    method: 'POST',
    url: `/v1/workspaces/${workspaceId}/invites`,
    headers: caller.headers,
    payload: { address: 'accountant@example.com', channel: 'email', role: 'member', ...body },
  });
}

/** Mint, assert it worked, and hand back the one copy of the raw token. */
async function mintOk(
  caller: Caller,
  workspaceId: string,
  body: MintBody = {},
): Promise<{ inviteId: string; token: string; url: string; expiresAt: string }> {
  const res = await mint(caller, workspaceId, body);
  expect(res.statusCode, res.body).toBe(201);
  const json = res.json() as { inviteId: string; url: string; expiresAt: string };
  const token = json.url.slice(`${TEST_WEB_ORIGIN}/invite/`.length);
  return { ...json, token };
}

/**
 * Put somebody INSIDE a workspace at a chosen role, through the product's own
 * front door: an owner invites them, they accept. No hand-appended
 * `membership.granted`, because the thing under test is what the invite path
 * actually does and a fixture would let it drift.
 */
async function joinViaInvite(owner: Caller, workspaceId: string, role: string): Promise<Caller> {
  const joiner = await signedIn();
  const { token } = await mintOk(owner, workspaceId, { role, address: `${role}-${phoneCounter}@example.com` });
  const res = await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: joiner.headers });
  expect(res.statusCode, res.body).toBe(200);
  return joiner;
}

/** Every event in this workspace, in the workspace's own total order. */
async function workspaceStream(workspaceId: string): Promise<Array<{ type: string; actor_id: string; origin: string; payload: Record<string, unknown> }>> {
  const { rows } = await db.pool.query<{ type: string; actor_id: string; origin: string; payload: Record<string, unknown> }>(
    'SELECT type, actor_id, origin, payload FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
    [workspaceId],
  );
  return rows;
}

async function eventCount(workspaceId: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM events WHERE workspace_id = $1',
    [workspaceId],
  );
  return rows[0]?.n ?? 0;
}

/** Found a project through the product's own door, asserting it committed. */
async function foundProject(owner: Caller, workspaceId: string, name = 'Books'): Promise<string> {
  const projectId = newUlid();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: owner.headers,
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity: { kind: 'project', id: projectId },
          type: 'project.created',
          version: 1,
          payload: { name },
          actorId: owner.userId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  expect((res.json() as { results: Array<{ status: string }> }).results[0]?.status, res.body).toBe('committed');
  return projectId;
}

async function projectRowsOf(workspaceId: string, userId: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ project_id: string }>(
    `SELECT project_id FROM proj_memberships
      WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'project' ORDER BY project_id`,
    [workspaceId, userId],
  );
  return rows.map((row) => row.project_id);
}

async function workspaceRoleOf(workspaceId: string, userId: string): Promise<string | null> {
  const { rows } = await db.pool.query<{ role: string }>(
    `SELECT role FROM proj_memberships
      WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'`,
    [workspaceId, userId],
  );
  return rows[0]?.role ?? null;
}

// ───────────────────────────────────────────────────────────────── issuance ──

describe('POST /v1/workspaces/:workspaceId/invites — issuance (case 6.32)', () => {
  it('an admin invites by address; the response carries the one copy of the raw token, and nothing else does', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const { inviteId, token, url, expiresAt } = await mintOk(owner, workspaceId, {
      address: 'accountant@example.com',
    });

    expect(url).toBe(`${TEST_WEB_ORIGIN}/invite/${token}`);
    // 32 random bytes, base64url: 43 characters, no padding, url-safe alphabet.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Fourteen days, from the constant rather than from a repeated literal.
    const lapse = Date.parse(expiresAt) - Date.now();
    expect(lapse).toBeGreaterThan(INVITE_TOKEN_TTL_MS - 60_000);
    expect(lapse).toBeLessThanOrEqual(INVITE_TOKEN_TTL_MS);

    // THE LEDGER holds the claim and not the secret.
    const stream = await workspaceStream(workspaceId);
    const sent = stream.filter((row) => row.type === 'invite.sent');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toEqual({
      inviteId,
      address: 'accountant@example.com',
      channel: 'email',
      role: 'member',
    });
    expect(sent[0]?.actor_id).toBe(owner.userId);
    // A person's claim, wearing a person's provenance. Not the server's.
    expect(sent[0]?.origin).toBe('web');
    // The instrument, and the reason it is a whole-ledger scan rather than a
    // look at one payload: the token must be absent from EVERY event, not
    // merely from the one we expected to carry it.
    expect(JSON.stringify(stream)).not.toContain(token);

    // THE PROJECTIONS hold the claim and not the secret.
    const { rows: projected } = await db.pool.query(
      'SELECT * FROM proj_invites WHERE invite_id = $1',
      [inviteId],
    );
    expect(JSON.stringify(projected)).not.toContain(token);
    expect(projected[0]).toMatchObject({
      workspace_id: workspaceId,
      address: 'accountant@example.com',
      channel: 'email',
      role: 'member',
      status: 'pending',
      invited_by: owner.userId,
      project_ids: [],
      accepted_user_id: null,
    });

    // THE CREDENTIAL STORE holds the hash and not the secret.
    const { rows: stored } = await db.pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM invite_tokens WHERE invite_id = $1',
      [inviteId],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]?.token_hash).not.toBe(token);
    expect(stored[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('two invitations to the same address get different tokens — a token is not derived from anything', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const first = await mintOk(owner, workspaceId, { address: 'same@example.com' });
    const second = await mintOk(owner, workspaceId, { address: 'same@example.com' });
    expect(first.token).not.toBe(second.token);
    expect(first.inviteId).not.toBe(second.inviteId);
  });

  it('planted defect: a plain member issuing an invitation is refused permission.role (case 6.33)', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const member = await joinViaInvite(owner, workspaceId, 'member');

    const refused = await mint(member, workspaceId, { address: 'nope@example.com' });
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({
      status: 'refused',
      rule: 'permission.role',
      reason: 'Only a workspace owner or admin can do this. Your role is member.',
    });
    // No credential was minted for a refused claim — asserted rather than
    // assumed, because the route mints the token AFTER the gate answers and a
    // reordering would leave a live link behind a refusal.
    const { rows } = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM invite_tokens');
    const beforeAdmin = rows[0]?.n ?? 0;

    // THE POSITIVE CONTROL, and it is what makes the refusal above about the
    // ROLE: an admin — one role up, everything else identical — is admitted.
    const admin = await joinViaInvite(owner, workspaceId, 'admin');
    const allowed = await mint(admin, workspaceId, { address: 'yes@example.com' });
    expect(allowed.statusCode, allowed.body).toBe(201);
    const { rows: after } = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM invite_tokens');
    expect(after[0]?.n).toBe(beforeAdmin + 1);
  });

  it('planted defect: a guest invitation carrying projectIds is refused at parse, with the remedy named (case 6.33)', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);

    const refused = await mint(owner, workspaceId, { role: 'guest', projectIds: [newUlid()] });
    expect(refused.statusCode).toBe(422);
    const body = refused.json() as { status: string; code: string; message: string };
    expect(body.status).toBe('invalid');
    expect(body.code).toBe('invalid-payload');
    expect(body.message).toContain('cannot put a guest on a project; share tickets with visibility.set instead');

    // Two positive controls, each differing in exactly one field: the same
    // guest invitation WITHOUT projects, and the same project on a MEMBER
    // invitation. Without them the refusal above is equally consistent with
    // "guest invitations are broken" and "projectIds is broken".
    //
    // A REAL project, founded here. It used to be a bare `newUlid()`, which
    // stopped being admissible when the gate began resolving promised projects
    // (case 6.127) — and that is the control doing its job: it went red the
    // moment a second, unrelated refusal could reach the same call, which is
    // exactly when a control that named no project would have started passing
    // for the wrong reason.
    const realProject = await foundProject(owner, workspaceId);
    expect((await mint(owner, workspaceId, { role: 'guest' })).statusCode).toBe(201);
    expect((await mint(owner, workspaceId, { role: 'member', projectIds: [realProject] })).statusCode).toBe(201);
  });

  it('planted defect: an invitation cannot confer ownership', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const refused = await mint(owner, workspaceId, { role: 'owner' });
    expect(refused.statusCode).toBe(422);
    expect((refused.json() as { message: string }).message).toContain(
      "an invite cannot confer ownership",
    );
    // The control: the highest role an invitation CAN carry is admitted.
    expect((await mint(owner, workspaceId, { role: 'admin' })).statusCode).toBe(201);
  });

  it('planted defect: a body naming its own inviteId is refused, not silently ignored', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${workspaceId}/invites`,
      headers: owner.headers,
      payload: { address: 'a@example.com', channel: 'email', role: 'member', inviteId: newUlid() },
    });
    expect(res.statusCode).toBe(400);
  });

  it('an anonymous caller cannot issue an invitation', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${workspaceId}/invites`,
      payload: { address: 'a@example.com', channel: 'email', role: 'member' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ────────────────────────────────────── the credential-separation defect ─────

describe('GET /v1/invites/:token — reading the ledger confers nothing (case 6.35)', () => {
  it('the committed invite.sent event id and the inviteId both 404 as tokens', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const { inviteId, token } = await mintOk(owner, workspaceId);

    // The event id, read the way any member of this workspace could read it.
    const { rows } = await db.pool.query<{ id: string }>(
      "SELECT id FROM events WHERE workspace_id = $1 AND type = 'invite.sent'",
      [workspaceId],
    );
    const eventId = rows[0]?.id;
    expect(eventId).toBeDefined();

    for (const candidate of [eventId as string, inviteId]) {
      const res = await app.inject({ method: 'GET', url: `/v1/invites/${candidate}` });
      expect(res.statusCode, `token candidate ${candidate}`).toBe(404);
      expect(res.json()).toEqual(INVITE_NOT_OPENABLE_BODY);
    }

    // THE POSITIVE CONTROL, and without it the two 404s above are equally
    // consistent with a route that 404s everything: the real token, on the same
    // invitation, in the same test, opens.
    const opened = await app.inject({ method: 'GET', url: `/v1/invites/${token}` });
    expect(opened.statusCode).toBe(200);
    expect(opened.json()).toEqual({
      workspaceId,
      workspaceName: 'Convenience Corner',
      role: 'member',
    });
  });

  it('the summary names the workspace and the role, and never the invited address', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner, 'The Corner');
    const { token } = await mintOk(owner, workspaceId, { address: 'private@example.com', role: 'guest' });
    const res = await app.inject({ method: 'GET', url: `/v1/invites/${token}` });
    expect(res.statusCode).toBe(200);
    // Exactly three fields. A link may have been forwarded; echoing the
    // invitee's address back to whoever holds the URL would turn a bearer
    // credential into a disclosure of somebody's contact details.
    expect(res.json()).toEqual({ workspaceId, workspaceName: 'The Corner', role: 'guest' });
    expect(res.body).not.toContain('private@example.com');
  });

  it('no session is required — a person is told what they are being asked to join before they have an account', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const { token } = await mintOk(owner, workspaceId);
    // No authorization header at all.
    const res = await app.inject({ method: 'GET', url: `/v1/invites/${token}` });
    expect(res.statusCode).toBe(200);
  });
});

// ─────────────────────────────────────────────────────── one dead-link body ──

describe('unknown, revoked, spent and lapsed links are indistinguishable (case 6.36)', () => {
  it('all four answer the identical 404 body on GET', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);

    const unknown = 'A'.repeat(43);

    const revokedInvite = await mintOk(owner, workspaceId, { address: 'revoked@example.com' });
    const revoke = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: owner.headers,
      payload: {
        events: [
          {
            id: newUlid(),
            workspaceId,
            entity: { kind: 'invite', id: revokedInvite.inviteId },
            type: 'invite.revoked',
            version: 1,
            payload: { inviteId: revokedInvite.inviteId },
            actorId: owner.userId,
            origin: 'web',
            clientTime: new Date().toISOString(),
          },
        ],
      },
    });
    expect(revoke.statusCode, revoke.body).toBe(200);
    expect((revoke.json() as { results: Array<{ status: string }> }).results[0]?.status).toBe('committed');

    const spentInvite = await mintOk(owner, workspaceId, { address: 'spent@example.com' });
    const acceptor = await signedIn();
    expect(
      (await app.inject({
        method: 'POST',
        url: `/v1/invites/${spentInvite.token}/accept`,
        headers: acceptor.headers,
      })).statusCode,
    ).toBe(200);

    const lapsedInvite = await mintOk(owner, workspaceId, { address: 'lapsed@example.com' });
    // The link genuinely worked a moment ago — proven, so that the 404 below is
    // about the lapse and not about a token that never opened anything.
    expect((await app.inject({ method: 'GET', url: `/v1/invites/${lapsedInvite.token}` })).statusCode).toBe(200);
    await db.pool.query(
      "UPDATE invite_tokens SET expires_at = now() - interval '1 second' WHERE invite_id = $1",
      [lapsedInvite.inviteId],
    );

    for (const [label, token] of [
      ['unknown', unknown],
      ['revoked', revokedInvite.token],
      ['spent', spentInvite.token],
      ['lapsed', lapsedInvite.token],
    ] as const) {
      const res = await app.inject({ method: 'GET', url: `/v1/invites/${token}` });
      expect(res.statusCode, label).toBe(404);
      // The BODY, byte for byte. A status code alone would let one of these
      // grow a distinguishing message and stay green.
      expect(res.json(), label).toEqual(INVITE_NOT_OPENABLE_BODY);
    }

    // The positive control for the whole block: a fifth, untouched invitation,
    // minted in the same workspace by the same owner, still opens.
    const live = await mintOk(owner, workspaceId, { address: 'live@example.com' });
    expect((await app.inject({ method: 'GET', url: `/v1/invites/${live.token}` })).statusCode).toBe(200);
  });

  it('a lapsed link cannot be accepted either, and the sibling minted beside it can', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const lapsed = await mintOk(owner, workspaceId, { address: 'lapse-a@example.com' });
    const fresh = await mintOk(owner, workspaceId, { address: 'lapse-b@example.com' });

    // THE KILLER: one row backdated past `now()`. Its sibling is untouched, so
    // the pair separates "expiry is enforced" from "acceptance is broken".
    await db.pool.query(
      "UPDATE invite_tokens SET expires_at = now() - interval '1 second' WHERE invite_id = $1",
      [lapsed.inviteId],
    );

    const before = await eventCount(workspaceId);
    const one = await signedIn();
    const refused = await app.inject({
      method: 'POST',
      url: `/v1/invites/${lapsed.token}/accept`,
      headers: one.headers,
    });
    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toEqual(INVITE_NOT_OPENABLE_BODY);
    expect(await eventCount(workspaceId)).toBe(before);
    expect(await workspaceRoleOf(workspaceId, one.userId)).toBeNull();

    const two = await signedIn();
    const accepted = await app.inject({
      method: 'POST',
      url: `/v1/invites/${fresh.token}/accept`,
      headers: two.headers,
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(await workspaceRoleOf(workspaceId, two.userId)).toBe('member');
  });

  it('accepting twice appends nothing the second time', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const { token } = await mintOk(owner, workspaceId);
    const acceptor = await signedIn();

    expect(
      (await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: acceptor.headers }))
        .statusCode,
    ).toBe(200);
    const afterFirst = await eventCount(workspaceId);

    const second = await app.inject({
      method: 'POST',
      url: `/v1/invites/${token}/accept`,
      headers: acceptor.headers,
    });
    expect(second.statusCode).toBe(404);
    expect(await eventCount(workspaceId)).toBe(afterFirst);

    // And a DIFFERENT person cannot spend the same link either — which is the
    // case that actually matters, because a forwarded link is held by somebody
    // the first acceptance said nothing about.
    const stranger = await signedIn();
    const third = await app.inject({
      method: 'POST',
      url: `/v1/invites/${token}/accept`,
      headers: stranger.headers,
    });
    expect(third.statusCode).toBe(404);
    expect(await eventCount(workspaceId)).toBe(afterFirst);
    expect(await workspaceRoleOf(workspaceId, stranger.userId)).toBeNull();
  });

  /**
   * The crash this codebase cannot prevent, staged on purpose (case 6.112).
   *
   * The token row is deleted at acceptance, and that deletion cannot be atomic
   * with the events it follows: ingest opens its own connection and transaction
   * and a route cannot enlist in it. So a crash between them leaves a LIVE token
   * row on an already-accepted invitation. This puts the row back by hand and
   * proves both routes still refuse — which is what makes `proj_invites.status`
   * the guard and the deletion mere hygiene.
   *
   * Mutating the DELETE statement away leaves every other case in this file
   * green and reddens exactly this one.
   */
  it('a surviving token row on an accepted invitation opens nothing — the status check is the guard, not the delete', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const { inviteId, token } = await mintOk(owner, workspaceId, { address: 'crash@example.com' });
    const acceptor = await signedIn();

    expect(
      (await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: acceptor.headers }))
        .statusCode,
    ).toBe(200);
    // Gone, as the route intends.
    const { rows: afterAccept } = await db.pool.query('SELECT 1 FROM invite_tokens WHERE invite_id = $1', [inviteId]);
    expect(afterAccept).toHaveLength(0);

    // Stage the crash: the acceptance landed, the deletion did not.
    await db.pool.query(
      `INSERT INTO invite_tokens (invite_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, now(), now() + interval '14 days')`,
      // sha256 hex, computed HERE from the raw token the mint response handed
      // back — the same function the route uses, re-derived independently so
      // the row really is the one that token opens. `pgcrypto` is not installed
      // and must not be added for a test fixture.
      [inviteId, createHash('sha256').update(token).digest('hex')],
    );
    const { rows: restored } = await db.pool.query('SELECT 1 FROM invite_tokens WHERE invite_id = $1', [inviteId]);
    // The stage itself is asserted: if the row were not really there, the two
    // refusals below would prove nothing at all.
    expect(restored).toHaveLength(1);

    const before = await eventCount(workspaceId);
    const stranger = await signedIn();
    expect((await app.inject({ method: 'GET', url: `/v1/invites/${token}` })).statusCode).toBe(404);
    const accept = await app.inject({
      method: 'POST',
      url: `/v1/invites/${token}/accept`,
      headers: stranger.headers,
    });
    expect(accept.statusCode).toBe(404);
    expect(await eventCount(workspaceId)).toBe(before);
    expect(await workspaceRoleOf(workspaceId, stranger.userId)).toBeNull();
  });
});

// ──────────────────────────────────────────────────── one token, one winner ──

/**
 * Case 6.128 — N SIMULTANEOUS presentations of one link, and the property no
 * sequential test can see.
 *
 * ## Why the sequential cases above could not find this
 *
 * "Accept, then accept again" passes whether the consume is atomic or not: by
 * the time the second call reads, the first has already appended and the
 * projection already says `accepted`. The defect lives entirely in the window
 * between the read and the append, and only a caller that is INSIDE that window
 * when another caller reads can enter it.
 *
 * MEASURED at `0fd416d`, before the fix, with exactly this test: three parallel
 * accepts on ONE token, three `200`s, three `admin` rows in `proj_memberships`,
 * three `invite.accepted` and three `membership.granted` in the ledger — in 24
 * of 25 trials. And the record concealed it: the projection's `AND status =
 * 'pending'` guard silently drops the 2nd and 3rd `invite.accepted`, so
 * `proj_invites.accepted_user_id` named ONE person while three had joined, and
 * the owner's pending list showed nothing at all.
 *
 * ## What makes these presentations genuinely concurrent
 *
 * `app.inject` returns a promise and the handler awaits the database several
 * times before it appends, so `Promise.all` over three injects really does
 * interleave three handlers in one event loop. They are not sharing one
 * connection either: `createPool` builds a `pg.Pool` with `max: 10`, so the
 * three statements reach Postgres on three separate backends and the winner is
 * decided by a row lock rather than by JavaScript ordering.
 *
 * ## Why a fresh workspace per trial
 *
 * Reusing one workspace would make trial 2 prove nothing: the trial-1 winner is
 * a member by then, and 6.116's rule says an existing member's acceptance
 * appends NO `membership.granted` at all — the grant count would move for a
 * reason that has nothing to do with the race. So the three acceptors are
 * created once (they hold no role in a workspace that did not exist when they
 * signed in) and the WORKSPACE and the INVITATION are fresh every trial.
 *
 * Every trial's outcome is collected and the whole run is asserted at the end,
 * rather than failing on the first breach: a race that fires in 24 of 25 trials
 * and a race that fires in 1 of 25 are different facts about the product, and
 * `expect(breaches).toEqual([])` reports which one it saw.
 */
describe('one token admits exactly one acceptance, under genuine concurrency (case 6.128)', () => {
  const TRIALS = 25;
  const PRESENTERS = 3;

  /** `invite.accepted` / `membership.granted` filed for these people, by type. */
  async function grantsIn(workspaceId: string, userIds: string[]): Promise<{ accepted: number; granted: number }> {
    const { rows } = await db.pool.query<{ type: string; n: number }>(
      `SELECT type, count(*)::int AS n FROM events
        WHERE workspace_id = $1
          AND type IN ('invite.accepted', 'membership.granted')
          AND payload ->> 'userId' = ANY($2::text[])
        GROUP BY type`,
      [workspaceId, userIds],
    );
    const of = (type: string) => rows.find((row) => row.type === type)?.n ?? 0;
    return { accepted: of('invite.accepted'), granted: of('membership.granted') };
  }

  it(`${PRESENTERS} parallel acceptances of one token yield ONE join and ${PRESENTERS - 1} refusals, ${TRIALS} trials`, async () => {
    const owner = await signedIn();
    const presenters: Caller[] = [];
    for (let i = 0; i < PRESENTERS; i += 1) {
      presenters.push(await signedIn());
    }
    const presenterIds = presenters.map((p) => p.userId);

    type Breach = {
      trial: number;
      codes: number[];
      roles: Array<string | null>;
      accepted: number;
      granted: number;
      acceptedUserId: string | null;
      wrongBody: boolean;
    };
    const breaches: Breach[] = [];

    for (let trial = 0; trial < TRIALS; trial += 1) {
      const workspaceId = await found(owner, `Race ${trial}`);
      const { inviteId, token } = await mintOk(owner, workspaceId, {
        address: `race-${trial}@example.com`,
        role: 'admin',
      });

      const responses = await Promise.all(
        presenters.map((presenter) =>
          app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: presenter.headers }),
        ),
      );

      const codes = responses.map((res) => res.statusCode);
      const roles = await Promise.all(presenterIds.map((userId) => workspaceRoleOf(workspaceId, userId)));
      const { accepted, granted } = await grantsIn(workspaceId, presenterIds);
      const { rows: inviteRows } = await db.pool.query<{ status: string; accepted_user_id: string | null }>(
        'SELECT status, accepted_user_id FROM proj_invites WHERE invite_id = $1',
        [inviteId],
      );
      const acceptedUserId = inviteRows[0]?.accepted_user_id ?? null;
      // A refusal must be THE dead-link 404 and not a 500 that happens not to
      // be 200 — a not-200 check would pass on a server that crashed.
      const wrongBody = responses.some(
        (res) =>
          res.statusCode !== 200 &&
          (res.statusCode !== 404 ||
            JSON.stringify(res.json()) !== JSON.stringify(INVITE_NOT_OPENABLE_BODY)),
      );

      const oneWinner =
        codes.filter((code) => code === 200).length === 1 &&
        roles.filter((role) => role !== null).length === 1 &&
        accepted === 1 &&
        granted === 1 &&
        acceptedUserId !== null &&
        roles[presenterIds.indexOf(acceptedUserId)] === 'admin' &&
        !wrongBody;
      if (!oneWinner) {
        breaches.push({ trial, codes, roles, accepted, granted, acceptedUserId, wrongBody });
      }
    }

    const tally = breaches
      .map((b) => `t${b.trial}: ${b.codes.filter((c) => c === 200).length}×200, ` +
        `${b.roles.filter((r) => r !== null).length} roles, ` +
        `${b.accepted}×invite.accepted, ${b.granted}×membership.granted`)
      .join('; ');
    expect(
      breaches,
      `${breaches.length} of ${TRIALS} trials admitted more or fewer than one acceptance — ${tally}`,
    ).toEqual([]);
  }, 300_000);
});

// ─────────────────────────────────────────────────────────────── acceptance ──

describe('POST /v1/invites/:token/accept — the grant it promised (case 6.37)', () => {
  it('appends invite.accepted, the grant and the promised project rows, all attributed to the acceptor', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const projectId = await foundProject(owner, workspaceId);

    const { inviteId, token } = await mintOk(owner, workspaceId, {
      address: 'bookkeeper@example.com',
      role: 'member',
      projectIds: [projectId],
    });
    const acceptor = await signedIn();

    const before = await eventCount(workspaceId);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/invites/${token}/accept`,
      headers: acceptor.headers,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ workspaceId });

    // Exactly three events, in this order.
    const appended = (await workspaceStream(workspaceId)).slice(before);
    expect(appended.map((row) => row.type)).toEqual([
      'invite.accepted',
      'membership.granted',
      'project.member_added',
    ]);
    for (const row of appended) {
      // The ACTOR is the accepting person — accepting is their act. The
      // PROVENANCE is the server's, because the server is what recorded it.
      expect(row.actor_id).toBe(acceptor.userId);
      expect(row.origin).toBe('server');
    }
    // The authorization traces through the inviteId to the admin's attributed
    // invite.sent, which is what a history view shows when the grant unfolds.
    expect(appended[0]?.payload).toEqual({ inviteId, userId: acceptor.userId });
    expect(appended[1]?.payload).toEqual({ userId: acceptor.userId, role: 'member' });
    expect(appended[2]?.payload).toEqual({ userId: acceptor.userId, projectAdmin: false });

    expect(await workspaceRoleOf(workspaceId, acceptor.userId)).toBe('member');
    const { rows: roster } = await db.pool.query<{ project_admin: boolean }>(
      `SELECT project_admin FROM proj_memberships
        WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'project' AND project_id = $3`,
      [workspaceId, acceptor.userId, projectId],
    );
    expect(roster).toEqual([{ project_admin: false }]);

    // The projection records the binding, and the invitation is now spent.
    const { rows: projected } = await db.pool.query<{ status: string; accepted_user_id: string }>(
      'SELECT status, accepted_user_id FROM proj_invites WHERE invite_id = $1',
      [inviteId],
    );
    expect(projected).toEqual([{ status: 'accepted', accepted_user_id: acceptor.userId }]);
  });

  it('an accepted GUEST invitation lands the grant alone — no project rows at all', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const { token } = await mintOk(owner, workspaceId, { address: 'guest@example.com', role: 'guest' });
    const guest = await signedIn();

    const before = await eventCount(workspaceId);
    expect(
      (await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: guest.headers }))
        .statusCode,
    ).toBe(200);

    const appended = (await workspaceStream(workspaceId)).slice(before);
    expect(appended.map((row) => row.type)).toEqual(['invite.accepted', 'membership.granted']);
    expect(await workspaceRoleOf(workspaceId, guest.userId)).toBe('guest');
    const { rows: projects } = await db.pool.query(
      `SELECT 1 FROM proj_memberships
        WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'project'`,
      [workspaceId, guest.userId],
    );
    expect(projects).toHaveLength(0);
  });

  /**
   * The escalation this route must not open in the OTHER direction.
   *
   * A link is bearer-authorised — whoever holds it may use it, which is the
   * point, because the address is a claim about where to reach a person and
   * never an assertion about who they are. But `membership.granted` is an UPSERT
   * keyed on the person: an owner who opened a guest link addressed to somebody
   * else would demote themselves out of their own workspace, and no event would
   * look wrong afterwards. Changing an existing member's role is an admin's
   * attributed act, not something a forwarded link may do.
   */
  it('planted defect: an existing member accepting a lower-role invitation keeps the role they had', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    expect(await workspaceRoleOf(workspaceId, owner.userId)).toBe('owner');

    const { inviteId, token } = await mintOk(owner, workspaceId, { address: 'someone@example.com', role: 'guest' });
    const before = await eventCount(workspaceId);
    // The OWNER opens the guest link addressed to somebody else.
    const res = await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: owner.headers });
    expect(res.statusCode, res.body).toBe(200);

    // Still the owner.
    expect(await workspaceRoleOf(workspaceId, owner.userId)).toBe('owner');
    // And the ONLY thing appended is the record that the invitation was
    // consumed — no membership.granted at all, which is the assertion that
    // separates "the role survived" from "the role was re-granted as owner".
    const appended = (await workspaceStream(workspaceId)).slice(before);
    expect(appended.map((row) => row.type)).toEqual(['invite.accepted']);
    expect(appended[0]?.payload).toEqual({ inviteId, userId: owner.userId });

    // THE POSITIVE CONTROL: the same route, the same workspace, a person with
    // no role — the grant does land. Without it, "no membership.granted" is
    // equally consistent with a route that never grants anything.
    const newcomer = await signedIn();
    const second = await mintOk(owner, workspaceId, { address: 'newcomer@example.com', role: 'guest' });
    expect(
      (await app.inject({ method: 'POST', url: `/v1/invites/${second.token}/accept`, headers: newcomer.headers }))
        .statusCode,
    ).toBe(200);
    expect(await workspaceRoleOf(workspaceId, newcomer.userId)).toBe('guest');
  });

  it('an anonymous caller cannot accept — there is no person until somebody has authenticated', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const { token } = await mintOk(owner, workspaceId);
    const before = await eventCount(workspaceId);
    const res = await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept` });
    expect(res.statusCode).toBe(401);
    expect(await eventCount(workspaceId)).toBe(before);
    // And the link is untouched: a 401 must not spend a credential.
    expect((await app.inject({ method: 'GET', url: `/v1/invites/${token}` })).statusCode).toBe(200);
  });

  /**
   * The enumerated NEGATIVE on the purge surface, stated rather than left silent.
   *
   * There are five purge triggers — `visibility.set`, `ticket.reparented`, the
   * inheriting subtree under either, `project.member_removed` and
   * `membership.revoked`. Acceptance appends only GRANTS, and `invite.revoked`
   * withdraws an invitation rather than a membership, so none of the five fires
   * anywhere in this task. Asserted through `visibleEventsFor` itself, with a
   * real revocation beside it as the killer: without that second half, "no purge
   * instructions" would pass equally on a generator that emits none at all.
   */
  it('acceptance emits no purge instruction, and a revocation in the same workspace does', async () => {
    const { visibleEventsFor } = await import('../../src/visibility/visible-events-for.js');
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const joiner = await joinViaInvite(owner, workspaceId, 'member');

    const items = [];
    for await (const item of visibleEventsFor(db.pool, joiner.userId, workspaceId, 0)) {
      items.push(item);
    }
    expect(items.filter((item) => 'kind' in item)).toEqual([]);

    // THE KILLER, same suite, same run: revoke them and the instruction appears.
    const revoke = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: owner.headers,
      payload: {
        events: [
          {
            id: newUlid(),
            workspaceId,
            entity: { kind: 'membership', id: `${workspaceId}:${joiner.userId}` },
            type: 'membership.revoked',
            version: 1,
            payload: { userId: joiner.userId },
            actorId: owner.userId,
            origin: 'web',
            clientTime: new Date().toISOString(),
          },
        ],
      },
    });
    expect((revoke.json() as { results: Array<{ status: string }> }).results[0]?.status).toBe('committed');

    const afterRevoke = [];
    for await (const item of visibleEventsFor(db.pool, joiner.userId, workspaceId, 0)) {
      afterRevoke.push(item);
    }
    expect(afterRevoke.filter((item) => 'kind' in item)).toEqual([{ kind: 'scope-revoked', workspaceId }]);
  });
});

// ────────────────────────────────────────────────────────── the pending list ──

describe('GET /v1/workspaces/:workspaceId/invites — the pending list (case 6.42)', () => {
  it('lists pending invitations with their addresses, and never a token', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const pending = await mintOk(owner, workspaceId, { address: 'pending@example.com', role: 'admin' });
    const accepted = await mintOk(owner, workspaceId, { address: 'accepted@example.com' });
    const revoked = await mintOk(owner, workspaceId, { address: 'revoked@example.com' });

    const acceptor = await signedIn();
    expect(
      (await app.inject({ method: 'POST', url: `/v1/invites/${accepted.token}/accept`, headers: acceptor.headers }))
        .statusCode,
    ).toBe(200);
    await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: owner.headers,
      payload: {
        events: [
          {
            id: newUlid(),
            workspaceId,
            entity: { kind: 'invite', id: revoked.inviteId },
            type: 'invite.revoked',
            version: 1,
            payload: { inviteId: revoked.inviteId },
            actorId: owner.userId,
            origin: 'web',
            clientTime: new Date().toISOString(),
          },
        ],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/invites`,
      headers: owner.headers,
    });
    expect(res.statusCode, res.body).toBe(200);
    const { invites } = res.json() as { invites: Array<Record<string, unknown>> };

    // The pending one, and ONLY it — the accepted and the revoked are gone.
    expect(invites.map((row) => row.inviteId)).toEqual([pending.inviteId]);
    expect(invites[0]).toEqual({
      inviteId: pending.inviteId,
      address: 'pending@example.com',
      channel: 'email',
      role: 'admin',
      projectIds: [],
      invitedBy: owner.userId,
      invitedAt: expect.any(String),
      expiresAt: pending.expiresAt,
    });

    // NEWEST FIRST, and asserted rather than assumed — the mutation sweep found
    // this ordering unpinned (`DESC` → `ASC` killed nothing) and this is the
    // assertion that closes it. An invite-mint screen listing oldest-first
    // shows an admin the invitation they are least likely to be looking for.
    const later = await mintOk(owner, workspaceId, { address: 'later@example.com' });
    const listed = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/invites`,
      headers: owner.headers,
    });
    expect((listed.json() as { invites: Array<{ inviteId: string }> }).invites.map((row) => row.inviteId)).toEqual([
      later.inviteId,
      pending.inviteId,
    ]);

    // A read must never become an issuance. Asserted against the whole body,
    // and against ALL THREE tokens, because the leak worth catching is a list
    // that re-serves a credential for an invitation the reader did not mint.
    for (const token of [pending.token, accepted.token, revoked.token]) {
      expect(res.body).not.toContain(token);
    }
  });

  it('planted defect: a plain member is refused permission.role — the same PII rule as sync-down', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    await mintOk(owner, workspaceId, { address: 'secret@example.com' });
    const member = await joinViaInvite(owner, workspaceId, 'member');

    const refused = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/invites`,
      headers: member.headers,
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual(INVITE_ADMIN_ONLY_BODY);
    // The address never travelled — the point of the refusal, not merely its
    // status code.
    expect(refused.body).not.toContain('secret@example.com');

    // THE POSITIVE CONTROL: an admin, one role up, everything else identical.
    const admin = await joinViaInvite(owner, workspaceId, 'admin');
    const allowed = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/invites`,
      headers: admin.headers,
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body).toContain('secret@example.com');
  });

  it('a non-member of the workspace is refused too, and sees nothing of it', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    await mintOk(owner, workspaceId, { address: 'elsewhere@example.com' });
    const stranger = await signedIn();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/invites`,
      headers: stranger.headers,
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain('elsewhere@example.com');
  });
});

/**
 * The two holes the mutation sweep did not reach, found by inspection and then
 * MEASURED before either fix was written. Both are the same class: a refusal
 * keyed on the wrong subject.
 */
describe('the promised projects (cases 6.126, 6.127)', () => {
  /**
   * 6.126 — `inviteSentPayload` refuses `projectIds` on a GUEST invitation, but
   * that refusal keys on the INVITATION's role. An existing guest accepting a
   * perfectly legal MEMBER invitation carrying a project is a different subject
   * entirely, and it was the way the 2026-08-27 collapse's inert association
   * grew back.
   *
   * MEASURED before the fix: the guest kept their guest role (the no-role-change
   * rule) AND got the project row, with no event looking wrong anywhere.
   */
  it('planted defect: an existing GUEST accepting a member invitation gets no project row', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const projectId = await foundProject(owner, workspaceId);

    const guest = await joinViaInvite(owner, workspaceId, 'guest');
    expect(await workspaceRoleOf(workspaceId, guest.userId)).toBe('guest');

    const upgrade = await mintOk(owner, workspaceId, {
      address: 'upgrade@example.com',
      role: 'member',
      projectIds: [projectId],
    });
    const res = await app.inject({
      method: 'POST',
      url: `/v1/invites/${upgrade.token}/accept`,
      headers: guest.headers,
    });
    expect(res.statusCode, res.body).toBe(200);

    // Still a guest — the no-role-change rule — and therefore holding no
    // project row, which is what the guest-invitation refusal means.
    expect(await workspaceRoleOf(workspaceId, guest.userId)).toBe('guest');
    expect(await projectRowsOf(workspaceId, guest.userId)).toEqual([]);

    // THE POSITIVE CONTROL, same workspace, same project, same invitation
    // shape: a NEWCOMER accepting it does get the row. Without it, "no project
    // row" is equally consistent with acceptance no longer appending any.
    const newcomer = await signedIn();
    const second = await mintOk(owner, workspaceId, {
      address: 'newcomer2@example.com',
      role: 'member',
      projectIds: [projectId],
    });
    expect(
      (await app.inject({ method: 'POST', url: `/v1/invites/${second.token}/accept`, headers: newcomer.headers }))
        .statusCode,
    ).toBe(200);
    expect(await workspaceRoleOf(workspaceId, newcomer.userId)).toBe('member');
    expect(await projectRowsOf(workspaceId, newcomer.userId)).toEqual([projectId]);

    // And an existing plain MEMBER does get it too — the withholding is about
    // being a guest, not about already being in the workspace.
    const member = await joinViaInvite(owner, workspaceId, 'member');
    const third = await mintOk(owner, workspaceId, {
      address: 'existing-member@example.com',
      role: 'member',
      projectIds: [projectId],
    });
    expect(
      (await app.inject({ method: 'POST', url: `/v1/invites/${third.token}/accept`, headers: member.headers }))
        .statusCode,
    ).toBe(200);
    expect(await projectRowsOf(workspaceId, member.userId)).toEqual([projectId]);
  });

  /**
   * 6.127 — a promised project that does not exist in this workspace is refused
   * at ISSUANCE, before a credential is ever minted.
   *
   * MEASURED before the fix, with a project belonging to ANOTHER workspace: the
   * invitation minted cleanly, and acceptance appended `invite.accepted` and
   * `membership.granted`, then hit the entity↔workspace guard on
   * `project.member_added` — through the INTERNAL door, where no gate runs —
   * threw out of the sequence, and answered the joining person **500 after they
   * had already become a member**. The screen said it failed; a retry answered
   * 404, because the invitation's status was already `accepted`.
   *
   * Issuance is the right place and it is sufficient: there is no
   * `project.deleted` event anywhere in the product, so a project that exists
   * when an invitation is minted still exists when it is accepted.
   */
  it('planted defect: an invitation naming a project of ANOTHER workspace is refused at issuance', async () => {
    const ownerA = await signedIn();
    const workspaceA = await found(ownerA, 'A');
    const ownerB = await signedIn();
    const workspaceB = await found(ownerB, 'B');
    const projectInB = await foundProject(ownerB, workspaceB, 'B books');

    const before = await eventCount(workspaceA);
    const refused = await mint(ownerA, workspaceA, { address: 'x@example.com', projectIds: [projectInB] });
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({
      status: 'refused',
      rule: 'project.unknown',
      reason: `There is no project ${projectInB} in this workspace.`,
    });
    // Nothing appended, and — the point — no credential minted for a claim that
    // could not have been honoured.
    expect(await eventCount(workspaceA)).toBe(before);
    const { rows } = await db.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM proj_invites WHERE workspace_id = $1 AND address = 'x@example.com'",
      [workspaceA],
    );
    expect(rows[0]?.n).toBe(0);

    // A never-founded id is refused identically — the check is existence in
    // THIS workspace, which covers both shapes with one question.
    const invented = newUlid();
    const alsoRefused = await mint(ownerA, workspaceA, { address: 'y@example.com', projectIds: [invented] });
    expect(alsoRefused.statusCode).toBe(422);
    expect((alsoRefused.json() as { reason: string }).reason).toBe(
      `There is no project ${invented} in this workspace.`,
    );

    // THE POSITIVE CONTROL: workspace A's OWN project, everything else
    // identical, is admitted.
    const projectInA = await foundProject(ownerA, workspaceA, 'A books');
    expect((await mint(ownerA, workspaceA, { address: 'z@example.com', projectIds: [projectInA] })).statusCode).toBe(201);

    // And the SECOND element is checked too, not only the first — the shape a
    // "checks the head of the list" bug always takes.
    const both = await mint(ownerA, workspaceA, {
      address: 'w@example.com',
      projectIds: [projectInA, invented],
    });
    expect(both.statusCode).toBe(422);
    expect((both.json() as { reason: string }).reason).toBe(
      `There is no project ${invented} in this workspace.`,
    );
  });

  /**
   * The ordering, which is inherited from `checkPermission` rather than decided
   * here: the role gate runs before the project check, so a plain member with a
   * bad project id is told the thing they can actually act on — that they may
   * not issue invitations at all.
   */
  it('a plain member with a bad project id is told they may not invite, not that the project is unknown', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const member = await joinViaInvite(owner, workspaceId, 'member');
    const refused = await mint(member, workspaceId, { address: 'q@example.com', projectIds: [newUlid()] });
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({ rule: 'permission.role' });
  });
});

// ─────────────────────────────────────────────────── the token is not logged ──

describe('the invitation token does not reach the process log (case 6.114)', () => {
  it('redactInviteToken rewrites the token segment and leaves every other path alone', () => {
    expect(redactInviteToken('/v1/invites/SECRETTOKEN')).toBe('/v1/invites/[redacted]');
    expect(redactInviteToken('/v1/invites/SECRETTOKEN/accept')).toBe('/v1/invites/[redacted]/accept');
    expect(redactInviteToken('/v1/invites/SECRETTOKEN?x=1')).toBe('/v1/invites/[redacted]?x=1');
    // Everything else survives verbatim — a serializer that blanked all urls
    // would pass the assertions above and take the operator's logs with it.
    expect(redactInviteToken('/v1/workspaces/W/invites')).toBe('/v1/workspaces/W/invites');
    expect(redactInviteToken('/v1/events')).toBe('/v1/events');
  });

  /**
   * The wiring, OBSERVED. The function above could be perfect and never
   * installed; only a real logger writing a real line can tell the difference.
   *
   * MEASURED before this existed: Fastify's default `info` request line carries
   * `req.url` verbatim, and the token is in that path because
   * `GET /v1/invites/:token` is Plan 6's pinned contract and cannot be renamed.
   * Without the serializer every issued credential lands in the process log of
   * any deployment running at `info` or below.
   */
  it('a real logger writing a real line records the route and not the credential', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const logged = buildTestApp(db, { logStream: stream });
    await logged.app.ready();
    try {
      const owner = withHeaders(
        await signInWithPhone(logged.app, logged.otp, `+919001${String(Date.now() % 100000).padStart(5, '0')}`),
      );
      const created = await logged.app.inject({
        method: 'POST',
        url: '/v1/workspaces',
        headers: owner.headers,
        payload: { name: 'Logged' },
      });
      const workspaceId = (created.json() as { workspaceId: string }).workspaceId;
      const minted = await logged.app.inject({
        method: 'POST',
        url: `/v1/workspaces/${workspaceId}/invites`,
        headers: owner.headers,
        payload: { address: 'logged@example.com', channel: 'email', role: 'member' },
      });
      expect(minted.statusCode, minted.body).toBe(201);
      const url = (minted.json() as { url: string }).url;
      const token = url.slice(`${TEST_WEB_ORIGIN}/invite/`.length);

      lines.length = 0;
      expect((await logged.app.inject({ method: 'GET', url: `/v1/invites/${token}` })).statusCode).toBe(200);

      const written = lines.join('');
      // The instrument works: something was logged about this request at all.
      expect(written).toContain('incoming request');
      expect(written).toContain('/v1/invites/[redacted]');
      // The whole point.
      expect(written).not.toContain(token);
    } finally {
      await logged.app.close();
    }
  });
});
