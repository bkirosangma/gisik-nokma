import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { sweepInviteTokens } from '../../src/tools/sweep-invite-tokens.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { applyAll } from '../helpers/seed.js';

/**
 * The sweep that closes case 6.131.
 *
 * `invite_tokens` is server-owned state and NOT a projection, so nothing in the
 * rebuild machinery ever empties it and nothing on the read path clears a dead
 * row: `openableInvite` refuses on status or expiry BEFORE `consumeInviteToken`
 * is reached, so presenting a dead link does not collect it either. Acceptance
 * deletes its own row atomically, which is why the only rows a sweep can ever
 * find are the two this file drives — a LAPSED invitation still `pending`, and
 * a REVOKED one whose token has not lapsed yet.
 *
 * The revoked case is the one 6.131 actually names and it is tested SEPARATELY
 * from the expiry case on purpose: a revocation can land at any moment before
 * natural expiry, so an expiry-only sweep would leave a revoked workspace's
 * credential sitting in the table for the rest of its fortnight and an
 * expiry-only test would never notice.
 *
 * `proj_invites` rows are built through the REAL projection from REAL events,
 * never INSERTed: the sweep decides on `status`, and a fixture that wrote the
 * status by hand could seed a state the product cannot reach.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/**
 * `invite_tokens` is emptied between tests. `proj_invites` deliberately is NOT
 * — `events` is append-only and refuses TRUNCATE, so truncating the projection
 * would make live and the ledger disagree by construction. Every test mints its
 * own workspace and its own invitation ids, which is what keeps them apart.
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

/** Through the real door: the ledger AND the projection, exactly as ingest does. */
async function record(env: LedgerEvent): Promise<void> {
  await appendTestEvent(db.pool, env);
  await applyAll(db.pool, [env]);
}

/**
 * Mint an invitation and its credential row, the way the route does: the
 * `invite.sent` claim through the ledger and the projection, then a token row
 * written straight into `invite_tokens` (which is precisely what
 * `registerInviteRoutes` does — nothing derives that table).
 */
async function seedInvite(args: {
  workspaceId: string;
  inviteId: string;
  expiresAt: Date;
  revoked?: boolean;
}): Promise<void> {
  const admin = newUlid();
  await record(
    inviteEvent(args.workspaceId, args.inviteId, 'invite.sent', {
      address: `${args.inviteId}@example.com`,
      channel: 'email',
      role: 'member',
    }, admin),
  );
  if (args.revoked === true) {
    await record(inviteEvent(args.workspaceId, args.inviteId, 'invite.revoked', {}, admin));
  }
  await db.pool.query(
    `INSERT INTO invite_tokens (invite_id, token_hash, created_at, expires_at)
     VALUES ($1, $2, now(), $3)`,
    [args.inviteId, `hash-${args.inviteId}`, args.expiresAt.toISOString()],
  );
}

async function tokenIds(): Promise<string[]> {
  const { rows } = await db.pool.query<{ invite_id: string }>(
    'SELECT invite_id FROM invite_tokens ORDER BY invite_id',
  );
  return rows.map((row) => row.invite_id);
}

const A_FORTNIGHT_AHEAD = (): Date => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
const AN_HOUR_AGO = (): Date => new Date(Date.now() - 60 * 60 * 1000);

describe('sweepInviteTokens', () => {
  /**
   * THE EXCLUDING FIXTURE. A live invitation's credential is the thing this
   * sweep must never touch — deleting one destroys a link with no way to
   * reissue it, because the token is deliberately absent from the ledger.
   *
   * Driven mutation: widening the predicate to drop the status and expiry
   * conditions reddens this and nothing else in the file.
   */
  it('leaves a pending, unexpired invitation’s token row alone', async () => {
    const ws = newUlid();
    const live = newUlid();
    await seedInvite({ workspaceId: ws, inviteId: live, expiresAt: A_FORTNIGHT_AHEAD() });

    const report = await sweepInviteTokens(db.pool, { dryRun: false });

    expect(report.swept).toEqual([]);
    expect(report.deleted).toBe(0);
    expect(await tokenIds()).toEqual([live]);
  });

  /**
   * Driven mutation: `WHERE false` (a sweep that deletes nothing) reddens this.
   */
  it('sweeps a lapsed invitation’s token row in exactly one run', async () => {
    const ws = newUlid();
    const lapsed = newUlid();
    await seedInvite({ workspaceId: ws, inviteId: lapsed, expiresAt: AN_HOUR_AGO() });

    const report = await sweepInviteTokens(db.pool, { dryRun: false });

    expect(report.swept).toEqual([lapsed]);
    expect(report.deleted).toBe(1);
    expect(await tokenIds()).toEqual([]);
  });

  /**
   * 6.131's ACTUAL defect, and it is not the expiry case wearing a different
   * hat: this row's `expires_at` is a fortnight away, so every expiry test in
   * this file passes with the revocation branch deleted. The withdrawal already
   * happened; the credential has no business outliving it by thirteen more days.
   */
  it('sweeps a REVOKED invitation’s token row though it has not lapsed', async () => {
    const ws = newUlid();
    const revoked = newUlid();
    const expiresAt = A_FORTNIGHT_AHEAD();
    await seedInvite({ workspaceId: ws, inviteId: revoked, expiresAt, revoked: true });

    // Positive control on the fixture: the row really is unexpired, so nothing
    // below can be the expiry branch firing under another name.
    const { rows } = await db.pool.query<{ unexpired: boolean; status: string }>(
      `SELECT t.expires_at > now() AS unexpired, i.status
         FROM invite_tokens t JOIN proj_invites i USING (invite_id)
        WHERE t.invite_id = $1`,
      [revoked],
    );
    expect(rows[0]).toEqual({ unexpired: true, status: 'revoked' });

    const report = await sweepInviteTokens(db.pool, { dryRun: false });

    expect(report.swept).toEqual([revoked]);
    expect(await tokenIds()).toEqual([]);
  });

  it('is idempotent — a second run finds nothing left to do', async () => {
    const ws = newUlid();
    const lapsed = newUlid();
    const revoked = newUlid();
    const live = newUlid();
    await seedInvite({ workspaceId: ws, inviteId: lapsed, expiresAt: AN_HOUR_AGO() });
    await seedInvite({ workspaceId: ws, inviteId: revoked, expiresAt: A_FORTNIGHT_AHEAD(), revoked: true });
    await seedInvite({ workspaceId: ws, inviteId: live, expiresAt: A_FORTNIGHT_AHEAD() });

    const first = await sweepInviteTokens(db.pool, { dryRun: false });
    expect(first.deleted).toBe(2);
    expect([...first.swept].sort()).toEqual([lapsed, revoked].sort());

    const second = await sweepInviteTokens(db.pool, { dryRun: false });
    expect(second.swept).toEqual([]);
    expect(second.deleted).toBe(0);

    expect(await tokenIds()).toEqual([live]);
  });

  /**
   * A dry run REPORTS and does not write. Asserted on the table rather than on
   * the report alone: a report that named the row while the row went anyway is
   * exactly the failure a dry run exists to rule out.
   */
  it('a dry run changes nothing, and the row it named is still there', async () => {
    const ws = newUlid();
    const lapsed = newUlid();
    const live = newUlid();
    await seedInvite({ workspaceId: ws, inviteId: lapsed, expiresAt: AN_HOUR_AGO() });
    await seedInvite({ workspaceId: ws, inviteId: live, expiresAt: A_FORTNIGHT_AHEAD() });

    const before = await tokenIds();
    const report = await sweepInviteTokens(db.pool, { dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.swept).toEqual([lapsed]);
    expect(report.deleted).toBe(0);
    expect(await tokenIds()).toEqual(before);
    expect(await tokenIds()).toContain(lapsed);
  });
});
