import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import { verifyProjections } from '../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { testEnvelope } from './helpers/envelope.js';
import { appendTestEvent } from './helpers/ledger.js';
import { applyAll } from './helpers/seed.js';

/**
 * `proj_invites`, and the table beside it that is NOT a projection.
 *
 * The route suite (`test/routes/invites.test.ts`) drives the projection through
 * the product's own doors and covers every state an invitation reaches that
 * way. This file covers the two things those doors cannot reach:
 *
 * 1. **The one-way door.** `pending` is terminal in both directions, and the
 *    ordering that proves it — a revocation arriving AFTER an acceptance — is
 *    unreachable through the routes, because the accept route refuses a
 *    non-pending invitation and the revoke path is an ordinary client event that
 *    could legitimately be in flight when somebody opens their link.
 * 2. **`invite_tokens` surviving a rebuild and a verify.** This is the hazard
 *    the whole two-table design exists to avoid: the credential store is not
 *    derivable from the ledger, so anything that empties it destroys every live
 *    invitation link in the product with no way to put them back. Asserted by
 *    RUNNING the rebuild and the verifier, not by reading `projInvites.tables`
 *    — reading the array back would only prove the array says what it says.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/**
 * `invite_tokens` is emptied between tests; `proj_invites` deliberately is NOT.
 *
 * `events` is append-only and refuses TRUNCATE, so one test's ledger rows
 * outlive it — and the verifier replays the WHOLE ledger. Truncating the
 * projection between tests would therefore make live and the ledger disagree by
 * construction, and `verifyProjections` would report a drift that was the
 * fixture's own doing. Every test below mints its own workspace and its own
 * invitation ids, which is what keeps them apart instead.
 */
beforeEach(async () => {
  await db.pool.query('TRUNCATE invite_tokens');
});

function inviteEvent(
  workspaceId: string,
  inviteId: string,
  type: string,
  payload: Record<string, unknown>,
  actorId: string,
): LedgerEvent {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'invite', id: inviteId },
    type,
    payload: { inviteId, ...payload },
    actorId,
    origin: type === 'invite.accepted' ? 'server' : 'web',
  });
}

async function record(env: LedgerEvent): Promise<LedgerEvent> {
  await appendTestEvent(db.pool, env);
  await applyAll(db.pool, [env]);
  return env;
}

async function statusOf(inviteId: string): Promise<{ status: string; accepted_user_id: string | null } | undefined> {
  const { rows } = await db.pool.query<{ status: string; accepted_user_id: string | null }>(
    'SELECT status, accepted_user_id FROM proj_invites WHERE invite_id = $1',
    [inviteId],
  );
  return rows[0];
}

describe('proj_invites — pending is a one-way door', () => {
  it('a revocation arriving after an acceptance does not undo it', async () => {
    const ws = newUlid();
    const admin = newUlid();
    const joiner = newUlid();
    const inviteId = newUlid();

    await record(inviteEvent(ws, inviteId, 'invite.sent', {
      address: 'a@example.com',
      channel: 'email',
      role: 'member',
    }, admin));
    await record(inviteEvent(ws, inviteId, 'invite.accepted', { userId: joiner }, joiner));
    await record(inviteEvent(ws, inviteId, 'invite.revoked', {}, admin));

    // Without `AND status = 'pending'` on the revoke, the last event wins and a
    // person who genuinely joined finds their acceptance overwritten by the
    // withdrawal of an invitation that no longer existed to withdraw.
    expect(await statusOf(inviteId)).toEqual({ status: 'accepted', accepted_user_id: joiner });
  });

  it('an acceptance arriving after a revocation does not undo it either', async () => {
    const ws = newUlid();
    const admin = newUlid();
    const joiner = newUlid();
    const inviteId = newUlid();

    await record(inviteEvent(ws, inviteId, 'invite.sent', {
      address: 'b@example.com',
      channel: 'email',
      role: 'guest',
    }, admin));
    await record(inviteEvent(ws, inviteId, 'invite.revoked', {}, admin));
    await record(inviteEvent(ws, inviteId, 'invite.accepted', { userId: joiner }, joiner));

    expect(await statusOf(inviteId)).toEqual({ status: 'revoked', accepted_user_id: null });
  });

  /**
   * The positive control for both cases above, and it is what separates
   * "terminal states hold" from "the projection stopped updating at all". Each
   * transition reached from `pending` DOES land.
   */
  it('each terminal state IS reached from pending', async () => {
    const ws = newUlid();
    const admin = newUlid();
    const joiner = newUlid();
    const accepted = newUlid();
    const revoked = newUlid();

    for (const inviteId of [accepted, revoked]) {
      await record(inviteEvent(ws, inviteId, 'invite.sent', {
        address: `${inviteId}@example.com`,
        channel: 'email',
        role: 'member',
      }, admin));
      expect(await statusOf(inviteId)).toEqual({ status: 'pending', accepted_user_id: null });
    }
    await record(inviteEvent(ws, accepted, 'invite.accepted', { userId: joiner }, joiner));
    await record(inviteEvent(ws, revoked, 'invite.revoked', {}, admin));

    expect(await statusOf(accepted)).toEqual({ status: 'accepted', accepted_user_id: joiner });
    expect(await statusOf(revoked)).toEqual({ status: 'revoked', accepted_user_id: null });
  });

  it('a duplicate invite.sent for one invitation does not overwrite the original claim', async () => {
    const ws = newUlid();
    const admin = newUlid();
    const inviteId = newUlid();
    await record(inviteEvent(ws, inviteId, 'invite.sent', {
      address: 'first@example.com',
      channel: 'email',
      role: 'member',
    }, admin));
    await record(inviteEvent(ws, inviteId, 'invite.sent', {
      address: 'second@example.com',
      channel: 'phone',
      role: 'admin',
    }, admin));

    const { rows } = await db.pool.query<{ address: string; role: string }>(
      'SELECT address, role FROM proj_invites WHERE invite_id = $1',
      [inviteId],
    );
    expect(rows).toEqual([{ address: 'first@example.com', role: 'member' }]);
  });
});

describe('invite_tokens is not a projection', () => {
  /**
   * The hazard, run rather than reasoned about: `rebuildProjection` empties what
   * `projInvites.tables` names and replays the ledger into it. If
   * `invite_tokens` were in that array, every live invitation link in the
   * product would be gone and no replay could put one back — the token is not in
   * the ledger, which is the entire design.
   */
  it('rebuilding proj_invites leaves every credential row standing', async () => {
    const ws = newUlid();
    const admin = newUlid();
    const inviteId = newUlid();
    await record(inviteEvent(ws, inviteId, 'invite.sent', {
      address: 'rebuild@example.com',
      channel: 'email',
      role: 'member',
    }, admin));
    await db.pool.query(
      `INSERT INTO invite_tokens (invite_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, now(), now() + interval '14 days')`,
      [inviteId, 'f'.repeat(64)],
    );

    await rebuildProjection('proj_invites', { pool: db.pool, projections: buildProjectionRegistry() });

    // The projection really was rebuilt — the instrument works.
    expect(await statusOf(inviteId)).toEqual({ status: 'pending', accepted_user_id: null });
    // And the credential survived it.
    const { rows } = await db.pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM invite_tokens WHERE invite_id = $1',
      [inviteId],
    );
    expect(rows).toEqual([{ token_hash: 'f'.repeat(64) }]);
  });

  /**
   * The same hazard through the verifier, which is worse than the rebuild: it
   * runs projections with `search_path = verify_shadow, public`, and an
   * unlisted table's unqualified name resolves to the LIVE one. So a projection
   * that so much as NAMED `invite_tokens` would have a verify run — an
   * operation an operator believes is read-only — writing production credential
   * state.
   *
   * The clean report is the second half: it proves `proj_invites` really is
   * derivable from the ledger, which is the claim that justifies rebuilding it
   * at all.
   */
  it('verifyProjections reports clean and never touches the credential store', async () => {
    const ws = newUlid();
    const admin = newUlid();
    const joiner = newUlid();
    const inviteId = newUlid();
    await record(inviteEvent(ws, inviteId, 'invite.sent', {
      address: 'verify@example.com',
      channel: 'email',
      role: 'member',
    }, admin));
    await record(inviteEvent(ws, inviteId, 'invite.accepted', { userId: joiner }, joiner));
    await db.pool.query(
      `INSERT INTO invite_tokens (invite_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, now(), now() + interval '14 days')`,
      [inviteId, 'a'.repeat(64)],
    );

    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report.diffs.map((diff) => diff.table)).not.toContain('proj_invites');
    // `report.clean` is deliberately NOT asserted: `applyAll` seeds four
    // projections by hand and `proj_entity_heads` is not among them, so this
    // fixture drifts there by construction. Asserting cleanliness would make
    // this test about the helper rather than about invitations.

    // THE KILLER, same run: drift `proj_invites` on purpose and the verifier
    // names it. Without this the assertion above would pass equally on a
    // verifier that never compared the table at all — which is exactly what
    // would happen if `projInvites.tables` were empty, the destructive mistake
    // this whole block exists to catch.
    await db.pool.query(
      `INSERT INTO proj_invites
         (invite_id, workspace_id, address, channel, role, status, invited_by, invited_at)
       VALUES ($1, $2, 'ghost@example.com', 'email', 'member', 'pending', $3, now())`,
      [newUlid(), ws, admin],
    );
    const drifted = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    const inviteDiff = drifted.diffs.find((diff) => diff.table === 'proj_invites');
    expect(inviteDiff?.extraInLive).toBe(1);

    const { rows } = await db.pool.query('SELECT token_hash FROM invite_tokens WHERE invite_id = $1', [inviteId]);
    expect(rows).toEqual([{ token_hash: 'a'.repeat(64) }]);
  });
});
