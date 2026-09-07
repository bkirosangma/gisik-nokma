import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Queryable } from '../db/queryable.js';

/** Ten minutes. Long enough to find the browser tab; short enough that an
 *  abandoned grant is not a durable target. */
export const DEVICE_CODE_TTL_SEC = 600;

/** See packages/mcp-server/src/config.ts — the same number, derived from the
 *  auth rate-limit budget, stated on both sides because both sides must agree
 *  and neither owns the other. Task 3's route test pins them equal. */
export const POLL_INTERVAL_SEC = 12;

/**
 * The alphabet a person reads aloud and types. No vowels (so a code can never
 * spell a word somebody misremembers as meaning something), and no 0/O/1/I/5/S
 * (so a code can never be transcribed into a different, valid one).
 */
const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';

export type DeviceCodeGrant = { deviceCode: string; userCode: string; expiresAt: Date };

export type ExchangeOutcome =
  | { status: 'pending' }
  | { status: 'issued'; token: string; userId: string }
  | { status: 'unknown' }
  | { status: 'expired' };

/** sha256, hex. The raw credential is never stored and never logged. */
export function hashCredential(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function newUserCode(): string {
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    if (i === 4) out += '-';
    // `randomInt` rather than `Math.random`: this is a lookup key an attacker
    // would like to guess before its owner approves it, and a CSPRNG costs
    // nothing here.
    out += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  }
  return out;
}

export async function mintDeviceCode(db: Queryable, now: Date): Promise<DeviceCodeGrant> {
  const deviceCode = randomBytes(32).toString('base64url');
  const userCode = newUserCode();
  const expiresAt = new Date(now.getTime() + DEVICE_CODE_TTL_SEC * 1000);
  await db.query(
    `INSERT INTO mcp_device_codes (device_code_hash, user_code, approved_user_id, created_at, expires_at)
     VALUES ($1, $2, NULL, $3, $4)`,
    [hashCredential(deviceCode), userCode, now, expiresAt],
  );
  return { deviceCode, userCode, expiresAt };
}

/**
 * The browser's half. Approval is an UPDATE guarded on `expires_at > $now` and
 * on the row still being unapproved, so a lapsed grant and a grant somebody
 * else already approved both fall through to the same answer rather than
 * silently re-pointing at a second user.
 */
export async function approveDeviceCode(
  db: Queryable,
  userCode: string,
  userId: string,
  now: Date,
): Promise<'approved' | 'unknown' | 'expired'> {
  const { rowCount } = await db.query(
    `UPDATE mcp_device_codes SET approved_user_id = $1
      WHERE user_code = $2 AND approved_user_id IS NULL AND expires_at > $3`,
    [userId, userCode, now],
  );
  if ((rowCount ?? 0) > 0) return 'approved';
  const { rows } = await db.query<{ expires_at: Date }>(
    'SELECT expires_at FROM mcp_device_codes WHERE user_code = $1',
    [userCode],
  );
  const row = rows[0];
  if (row === undefined) return 'unknown';
  return row.expires_at <= now ? 'expired' : 'unknown';
}

/**
 * The CLI's half, and the place single-use is enforced.
 *
 * The grant row is DELETED in the same statement that reads it
 * (`DELETE … RETURNING`), so at most one presentation of a device code can
 * ever mint a token — the same mechanism `invite_tokens` uses, and for the
 * same reason: a SELECT-then-DELETE cannot stop two concurrent presentations,
 * and this repo has already had three concurrent acceptances all commit
 * against a read-shaped guard.
 */
export async function exchangeDeviceCode(
  db: Queryable,
  deviceCode: string,
  now: Date,
): Promise<ExchangeOutcome> {
  const hash = hashCredential(deviceCode);
  const { rows } = await db.query<{ approved_user_id: string | null; expires_at: Date }>(
    'SELECT approved_user_id, expires_at FROM mcp_device_codes WHERE device_code_hash = $1',
    [hash],
  );
  const row = rows[0];
  if (row === undefined) return { status: 'unknown' };
  if (row.expires_at <= now) return { status: 'expired' };
  if (row.approved_user_id === null) return { status: 'pending' };

  const claimed = await db.query<{ approved_user_id: string }>(
    `DELETE FROM mcp_device_codes
      WHERE device_code_hash = $1 AND approved_user_id IS NOT NULL AND expires_at > $2
      RETURNING approved_user_id`,
    [hash, now],
  );
  const winner = claimed.rows[0];
  if (winner === undefined) return { status: 'unknown' };

  const token = randomBytes(32).toString('base64url');
  await db.query(
    'INSERT INTO mcp_tokens (token_hash, user_id, created_at, last_used) VALUES ($1, $2, $3, NULL)',
    [hashCredential(token), winner.approved_user_id, now],
  );
  return { status: 'issued', token, userId: winner.approved_user_id };
}

/**
 * The caller's own tokens, newest first.
 *
 * ## `id` IS the hash, and that is not a leak
 *
 * `mcp_tokens` has no surrogate key: its primary key is `token_hash`, and
 * inventing an `id` column would mean a migration against a table that already
 * shipped, plus a backfill, to buy a property the hash already has — unique,
 * stable and meaningless to anyone who does not hold the credential.
 *
 * The hash is not the token. `resolveMcpToken` needs the PREIMAGE, which is 32
 * bytes from `randomBytes` and exists only in the response that minted it; a
 * sha256 digest of 256 bits of uniform entropy hands an attacker nothing they
 * can present. This is the same reasoning the migration records for storing a
 * plain hash rather than a password KDF, read in the other direction.
 *
 * `last_used` is NOT selected. The column exists and is written on every
 * resolution, but whether the PRODUCT SURFACES a per-token log of when a
 * person's assistant acted for them is an open owner decision (MCP plan Task 12,
 * the fenced sub-question). Recording it in a server-owned table nobody reads
 * and putting it on a screen are different acts. Adding it here is one column
 * and one cell.
 */
export async function listMcpTokens(
  db: Queryable,
  userId: string,
): Promise<{ id: string; createdAt: string }[]> {
  const { rows } = await db.query<{ token_hash: string; created_at: Date }>(
    'SELECT token_hash, created_at FROM mcp_tokens WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return rows.map((r) => ({ id: r.token_hash, createdAt: r.created_at.toISOString() }));
}

/**
 * Revoke one, scoped to its owner IN THE STATEMENT.
 *
 * `user_id = $2` is part of the DELETE rather than a check around it: there is
 * no window in which the row is found and then authorised, and no code path
 * that could read someone else's row on the way to refusing. A token that is
 * not this caller's simply does not match, so the delete affects zero rows and
 * the route answers the same 404 it answers for one that never existed —
 * without which this route becomes an oracle for which token hashes exist.
 *
 * Deleting the row ends access at the NEXT request, because `resolveMcpToken`
 * then finds nothing. Nothing is killed mid-flight, and the screen says so.
 */
export async function revokeMcpToken(db: Queryable, userId: string, id: string): Promise<boolean> {
  const { rows } = await db.query<{ token_hash: string }>(
    'DELETE FROM mcp_tokens WHERE token_hash = $1 AND user_id = $2 RETURNING token_hash',
    [id, userId],
  );
  return rows.length === 1;
}

/**
 * The whole read path for a personal access token: hash, look up, answer the
 * user id or null. `null` is the answer for a forged token AND for a revoked
 * one, deliberately and identically — every distinction here is an oracle
 * somebody can query, which is the same reasoning `UNAUTHENTICATED_BODY`
 * records for its own contentlessness.
 */
export async function resolveMcpToken(
  db: Queryable,
  rawToken: string,
  now: Date,
): Promise<string | null> {
  const { rows } = await db.query<{ user_id: string }>(
    'UPDATE mcp_tokens SET last_used = $2 WHERE token_hash = $1 RETURNING user_id',
    [hashCredential(rawToken), now],
  );
  return rows[0]?.user_id ?? null;
}
