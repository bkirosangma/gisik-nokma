import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import type { InviteEmail, InviteMailer } from '../../src/invites/invite-mailer.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithEmail, signInWithPhone } from '../helpers/session.js';

/**
 * **A second invitation to an address that already has a pending one ROTATES
 * that invitation's token instead of minting another** (fix-now batch S4, owner
 * rulings 2026-09-29 evening; spec §7).
 *
 * Tokens are stored HASHED, so the original link cannot be re-emailed:
 * "re-send" means a fresh token on the existing invite, and the old link stops
 * opening anything. The dedupe runs only after the SAME gate `invite.sent`
 * meets in ingest (a dry `checkPermission`), and only one request at a time per
 * (workspace, channel, address) may be inside the check-and-mint.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let magic: LogMagicLinkSender;
const mailed: InviteEmail[] = [];
const recordingMailer: InviteMailer = {
  send: async (mail) => {
    mailed.push(mail);
  },
};

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db, { inviteMailer: recordingMailer });
  app = built.app;
  otp = built.otp;
  magic = built.magic;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

type Caller = { userId: string; headers: { authorization: string }; phone: string };
let phoneCounter = 0;

async function signedIn(): Promise<Caller> {
  phoneCounter += 1;
  const phone = `+9190024${String(phoneCounter).padStart(5, '0')}`;
  const user = await signInWithPhone(app, otp, phone);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` }, phone };
}

async function found(owner: Caller): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: owner.headers, payload: { name: 'Dedupe' } });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

type MintBody = { address?: string; channel?: string; role?: string; projectIds?: string[] };
type Minted = { inviteId: string; url: string; expiresAt: string; emailSent: boolean };

function mint(caller: Caller, workspaceId: string, body: MintBody = {}) {
  return app.inject({
    method: 'POST',
    url: `/v1/workspaces/${workspaceId}/invites`,
    headers: caller.headers,
    payload: { address: 'accountant@example.com', channel: 'email', role: 'member', ...body },
  });
}

async function mintOk(caller: Caller, workspaceId: string, body: MintBody = {}): Promise<Minted & { token: string }> {
  const res = await mint(caller, workspaceId, body);
  expect(res.statusCode, res.body).toBe(201);
  const json = res.json() as Minted;
  return { ...json, token: json.url.slice(`${TEST_WEB_ORIGIN}/invite/`.length) };
}

async function joinAs(owner: Caller, workspaceId: string, role: string): Promise<Caller> {
  const joiner = await signedIn();
  // R4: the acceptor is the addressed account — invite the phone the joiner signed in with.
  const { token } = await mintOk(owner, workspaceId, { role, channel: 'phone', address: joiner.phone });
  const res = await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: joiner.headers });
  expect(res.statusCode, res.body).toBe(200);
  return joiner;
}

async function tokenHash(inviteId: string): Promise<string | null> {
  const { rows } = await db.pool.query<{ token_hash: string }>('SELECT token_hash FROM invite_tokens WHERE invite_id = $1', [inviteId]);
  return rows[0]?.token_hash ?? null;
}

async function pendingFor(workspaceId: string, address: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ invite_id: string }>(
    `SELECT invite_id FROM proj_invites WHERE workspace_id = $1 AND lower(address) = lower($2) AND status = 'pending' ORDER BY invited_at`,
    [workspaceId, address],
  );
  return rows.map((row) => row.invite_id);
}

async function sentEvents(workspaceId: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM events WHERE workspace_id = $1 AND type = 'invite.sent'`,
    [workspaceId],
  );
  return rows[0]?.n ?? 0;
}

const openable = async (token: string) => (await app.inject({ method: 'GET', url: `/v1/invites/${token}` })).statusCode === 200;

async function foundProject(owner: Caller, workspaceId: string, name: string): Promise<string> {
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

describe('6.222 a repeat invitation rotates the token on the existing invite', () => {
  it('6.222 same inviteId, no new invite.sent, a new working link, the old one opens nothing, the letter is sent again; CONTROL: the first mint created exactly one invite', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const first = await mintOk(owner, workspaceId, { address: 'Ana@Example.com' });
    expect(await pendingFor(workspaceId, 'ana@example.com')).toEqual([first.inviteId]);
    const sentBefore = await sentEvents(workspaceId);
    const hashBefore = await tokenHash(first.inviteId);
    mailed.length = 0;

    // Same address in a different case: still the same person.
    const second = await mintOk(owner, workspaceId, { address: 'ana@example.com' });

    expect(second.inviteId).toBe(first.inviteId);
    expect(Object.keys(second).sort()).toEqual(['emailSent', 'expiresAt', 'inviteId', 'token', 'url']);
    expect(second.emailSent).toBe(true);
    expect(second.token).not.toBe(first.token);
    expect(await sentEvents(workspaceId)).toBe(sentBefore);
    expect(await pendingFor(workspaceId, 'ana@example.com')).toEqual([first.inviteId]);
    expect(await tokenHash(first.inviteId)).not.toBe(hashBefore);
    // The old link is dead and the new one opens.
    expect(await openable(first.token)).toBe(false);
    expect(await openable(second.token)).toBe(true);
    // The email carried the NEW link.
    expect(mailed).toHaveLength(1);
    expect(mailed[0]?.url).toBe(second.url);
  });
});

describe('6.223 the dedupe answers to the same gate as a fresh mint', () => {
  it('6.223 a plain member, a guest and a non-member are refused with the ingest layer’s 422 and the stored hash is unchanged; CONTROL: an admin rotates it', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const member = await joinAs(owner, workspaceId, 'member');
    const guest = await joinAs(owner, workspaceId, 'guest');
    const outsider = await signedIn();
    const victim = await mintOk(owner, workspaceId, { address: 'victim@example.com' });
    const hash = await tokenHash(victim.inviteId);
    const sent = await sentEvents(workspaceId);

    for (const [label, caller] of [
      ['member', member],
      ['guest', guest],
      ['non-member', outsider],
    ] as const) {
      const res = await mint(caller, workspaceId, { address: 'victim@example.com' });
      expect(res.statusCode, label).toBe(422);
      const refusal = res.json() as { status: string; rule: string; reason: string };
      expect(refusal.status, label).toBe('refused');
      // The same body a fresh (non-matching) address gets from the same caller.
      const fresh = (await mint(caller, workspaceId, { address: `fresh-${label}@example.com` })).json() as typeof refusal;
      expect({ rule: refusal.rule, reason: refusal.reason }, label).toEqual({ rule: fresh.rule, reason: fresh.reason });
      expect(await tokenHash(victim.inviteId), label).toBe(hash);
    }
    expect(await sentEvents(workspaceId)).toBe(sent);
    expect(await openable(victim.token)).toBe(true);

    // CONTROL: an admin's identical request succeeds and the hash changes.
    const admin = await joinAs(owner, workspaceId, 'admin');
    const rotated = await mintOk(admin, workspaceId, { address: 'victim@example.com' });
    expect(rotated.inviteId).toBe(victim.inviteId);
    expect(await tokenHash(victim.inviteId)).not.toBe(hash);
  });
});

describe('6.224 two simultaneous identical requests make ONE invite', () => {
  it('6.224 20 trials, a fresh address each: two 201s, one pending row, one invite.sent; CONTROL: the two answers name the same invite', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    for (let trial = 0; trial < 20; trial += 1) {
      const address = `race-${trial}@example.com`;
      const sentBefore = await sentEvents(workspaceId);
      const [a, b] = await Promise.all([mint(owner, workspaceId, { address }), mint(owner, workspaceId, { address })]);
      expect([a.statusCode, b.statusCode], `trial ${trial}`).toEqual([201, 201]);
      const rows = await pendingFor(workspaceId, address);
      expect(rows, `trial ${trial}`).toHaveLength(1);
      expect((a.json() as Minted).inviteId, `trial ${trial}`).toBe((b.json() as Minted).inviteId);
      expect(await sentEvents(workspaceId), `trial ${trial}`).toBe(sentBefore + 1);
    }
  });
});

describe('6.225 what is and is not a match', () => {
  it('6.225 an expired token is rotated (new expiry), not duplicated; CONTROL: the row count stays one', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const first = await mintOk(owner, workspaceId, { address: 'lapsed@example.com' });
    await db.pool.query(`UPDATE invite_tokens SET expires_at = now() - interval '1 day' WHERE invite_id = $1`, [first.inviteId]);
    expect(await openable(first.token)).toBe(false);

    const second = await mintOk(owner, workspaceId, { address: 'lapsed@example.com' });
    expect(second.inviteId).toBe(first.inviteId);
    expect(Date.parse(second.expiresAt)).toBeGreaterThan(Date.now());
    expect(await openable(second.token)).toBe(true);
    expect(await pendingFor(workspaceId, 'lapsed@example.com')).toHaveLength(1);
  });

  it('6.225 a swept token row (none at all) is recreated by the rotation', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const first = await mintOk(owner, workspaceId, { address: 'swept@example.com' });
    await db.pool.query('DELETE FROM invite_tokens WHERE invite_id = $1', [first.inviteId]);
    const second = await mintOk(owner, workspaceId, { address: 'swept@example.com' });
    expect(second.inviteId).toBe(first.inviteId);
    expect(await openable(second.token)).toBe(true);
  });

  it('6.225 an ACCEPTED or REVOKED invite for the address is not matched — a fresh invite is minted; CONTROL: the pending one still is', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const accepted = await mintOk(owner, workspaceId, { address: 'gone@example.com' });
    // R4: the acceptor is the addressed account.
    const joinerUser = await signInWithEmail(app, magic, 'gone@example.com');
    const joiner = { headers: { authorization: `Bearer ${joinerUser.token}` } };
    expect((await app.inject({ method: 'POST', url: `/v1/invites/${accepted.token}/accept`, headers: joiner.headers })).statusCode).toBe(200);
    const afterAccept = await mintOk(owner, workspaceId, { address: 'gone@example.com' });
    expect(afterAccept.inviteId).not.toBe(accepted.inviteId);

    const revokedInvite = await mintOk(owner, workspaceId, { address: 'withdrawn@example.com' });
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
    expect((revoke.json() as { results: Array<{ status: string }> }).results[0]?.status).toBe('committed');
    const afterRevoke = await mintOk(owner, workspaceId, { address: 'withdrawn@example.com' });
    expect(afterRevoke.inviteId).not.toBe(revokedInvite.inviteId);

    // Control: the fresh, pending one IS matched by the next request.
    expect((await mintOk(owner, workspaceId, { address: 'gone@example.com' })).inviteId).toBe(afterAccept.inviteId);
  });

  it('6.225 a different channel or workspace is not a match', async () => {
    const owner = await signedIn();
    const one = await found(owner);
    const two = await found(owner);
    const email = await mintOk(owner, one, { address: '+919812345678', channel: 'email' });
    const phone = await mintOk(owner, one, { address: '+919812345678', channel: 'phone' });
    const other = await mintOk(owner, two, { address: '+919812345678', channel: 'email' });
    expect(new Set([email.inviteId, phone.inviteId, other.inviteId]).size).toBe(3);
  });
});

describe('6.226 a different role or project set mints a NEW invite (open question, unchanged behaviour)', () => {
  it('6.226 role differs → new invite; project set differs → new invite; the same set in another order → rotated', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const p1 = await foundProject(owner, workspaceId, 'One');
    const p2 = await foundProject(owner, workspaceId, 'Two');
    const base = await mintOk(owner, workspaceId, { address: 'mixed@example.com', role: 'admin', projectIds: [p1, p2] });

    const otherRole = await mintOk(owner, workspaceId, { address: 'mixed@example.com', role: 'member', projectIds: [p1, p2] });
    expect(otherRole.inviteId).not.toBe(base.inviteId);
    const otherProjects = await mintOk(owner, workspaceId, { address: 'mixed@example.com', role: 'admin', projectIds: [p1] });
    expect(otherProjects.inviteId).not.toBe(base.inviteId);
    const noProjects = await mintOk(owner, workspaceId, { address: 'mixed@example.com', role: 'admin' });
    expect(noProjects.inviteId).not.toBe(base.inviteId);

    // CONTROL: the identical set in a different order is the same invitation.
    const reordered = await mintOk(owner, workspaceId, { address: 'mixed@example.com', role: 'admin', projectIds: [p2, p1] });
    expect(reordered.inviteId).toBe(base.inviteId);
    expect(await pendingFor(workspaceId, 'mixed@example.com')).toHaveLength(4);
  });
});
