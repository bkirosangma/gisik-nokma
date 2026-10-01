import { randomBytes } from 'node:crypto';
import type { Queryable } from '../db/queryable.js';
import { hashCredential } from './token-store.js';

/**
 * Every SQL statement behind the hosted MCP door's OAuth server (remote-MCP
 * plan Task 1). Nothing here decides policy — the routes do; this file is the
 * durable half, so a restart between authorize and token exchange loses nothing
 * (Review Focus 5). Every credential is 32 random bytes, base64url, and only its
 * sha256 is stored (`hashCredential`); the raw value is returned to the caller
 * once and never logged.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const CODE_TTL_MS = 60_000;
export const PENDING_TTL_MS = 10 * MIN;
export const ACCESS_TTL_SEC = 3600;
export const IDLE_TTL_MS = 90 * DAY;
export const STALE_CLIENT_MS = 30 * DAY;

const raw = () => randomBytes(32).toString('base64url');
const id = (prefix: string) => `${prefix}_${randomBytes(16).toString('base64url')}`;

export type Client = { clientId: string; clientName: string; redirectUris: string[] };
export type Pending = {
  requestId: string;
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
};
export type CodeRow = { clientId: string; userId: string; redirectUri: string; codeChallenge: string };
export type ConnectionSummary = {
  id: string;
  clientName: string;
  redirectHost: string;
  createdAt: string;
  lastUsedAt: string | null;
};
export type RefreshOutcome =
  | { status: 'ok'; connectionId: string; userId: string }
  | { status: 'reused' }
  | { status: 'expired' }
  | { status: 'unknown' };

export async function registerClient(
  db: Queryable,
  c: { clientName: string; redirectUris: string[] },
  now: Date,
): Promise<{ clientId: string }> {
  const clientId = id('mcpc');
  await db.query(
    `INSERT INTO oauth_clients (client_id, client_name, redirect_uris, created_at) VALUES ($1, $2, $3, $4)`,
    [clientId, c.clientName, c.redirectUris, now],
  );
  return { clientId };
}

export async function getClient(db: Queryable, clientId: string): Promise<Client | null> {
  const { rows } = await db.query<{ client_id: string; client_name: string; redirect_uris: string[] }>(
    `SELECT client_id, client_name, redirect_uris FROM oauth_clients WHERE client_id = $1`,
    [clientId],
  );
  const r = rows[0];
  return r === undefined ? null : { clientId: r.client_id, clientName: r.client_name, redirectUris: r.redirect_uris };
}

/** A client nobody ever connected through, 30 days on, is removed — registration is open. */
export async function sweepStaleClients(db: Queryable, now: Date): Promise<number> {
  const r = await db.query(
    `DELETE FROM oauth_clients c
      WHERE c.created_at < $1
        AND NOT EXISTS (SELECT 1 FROM oauth_connections k WHERE k.client_id = c.client_id)
        AND NOT EXISTS (SELECT 1 FROM oauth_pending_authorizations p WHERE p.client_id = c.client_id)`,
    [new Date(now.getTime() - STALE_CLIENT_MS)],
  );
  return r.rowCount ?? 0;
}

type PendingRow = {
  request_id: string;
  client_id: string;
  redirect_uri: string;
  state: string | null;
  code_challenge: string;
};
const toPending = (r: PendingRow): Pending => ({
  requestId: r.request_id,
  clientId: r.client_id,
  redirectUri: r.redirect_uri,
  state: r.state,
  codeChallenge: r.code_challenge,
});

export async function createPending(
  db: Queryable,
  p: { clientId: string; redirectUri: string; state: string | null; codeChallenge: string },
  now: Date,
): Promise<{ requestId: string }> {
  const requestId = id('req');
  await db.query(
    `INSERT INTO oauth_pending_authorizations
       (request_id, client_id, redirect_uri, state, code_challenge, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [requestId, p.clientId, p.redirectUri, p.state, p.codeChallenge, now, new Date(now.getTime() + PENDING_TTL_MS)],
  );
  return { requestId };
}

export async function getPending(db: Queryable, requestId: string, now: Date): Promise<Pending | null> {
  const { rows } = await db.query<PendingRow>(
    `SELECT request_id, client_id, redirect_uri, state, code_challenge
       FROM oauth_pending_authorizations WHERE request_id = $1 AND expires_at > $2`,
    [requestId, now],
  );
  return rows[0] === undefined ? null : toPending(rows[0]);
}

/** Single-use: the decision consumes the pending row, so a second click finds nothing. */
export async function takePending(db: Queryable, requestId: string, now: Date): Promise<Pending | null> {
  const { rows } = await db.query<PendingRow>(
    `DELETE FROM oauth_pending_authorizations WHERE request_id = $1 AND expires_at > $2
      RETURNING request_id, client_id, redirect_uri, state, code_challenge`,
    [requestId, now],
  );
  return rows[0] === undefined ? null : toPending(rows[0]);
}

export async function mintCode(
  db: Queryable,
  c: { clientId: string; userId: string; redirectUri: string; codeChallenge: string },
  now: Date,
): Promise<string> {
  const code = raw();
  await db.query(
    `INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [hashCredential(code), c.clientId, c.userId, c.redirectUri, c.codeChallenge, now, new Date(now.getTime() + CODE_TTL_MS)],
  );
  return code;
}

export async function takeCode(db: Queryable, rawCode: string, now: Date): Promise<CodeRow | null> {
  const { rows } = await db.query<{ client_id: string; user_id: string; redirect_uri: string; code_challenge: string }>(
    `DELETE FROM oauth_codes WHERE code_hash = $1 AND expires_at > $2
      RETURNING client_id, user_id, redirect_uri, code_challenge`,
    [hashCredential(rawCode), now],
  );
  const r = rows[0];
  return r === undefined
    ? null
    : { clientId: r.client_id, userId: r.user_id, redirectUri: r.redirect_uri, codeChallenge: r.code_challenge };
}

export async function createConnection(
  db: Queryable,
  c: { userId: string; clientId: string },
  now: Date,
): Promise<{ connectionId: string }> {
  const connectionId = id('conn');
  await db.query(
    `INSERT INTO oauth_connections (id, user_id, client_id, created_at, last_used, idle_expires_at)
     VALUES ($1, $2, $3, $4, NULL, $5)`,
    [connectionId, c.userId, c.clientId, now, new Date(now.getTime() + IDLE_TTL_MS)],
  );
  return { connectionId };
}

export async function issueTokens(
  db: Queryable,
  connectionId: string,
  userId: string,
  now: Date,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: 3600 }> {
  const accessToken = raw();
  const refreshToken = raw();
  await db.query(
    `INSERT INTO mcp_tokens (token_hash, user_id, created_at, last_used, kind, expires_at, connection_id)
     VALUES ($1, $2, $3, NULL, 'hosted', $4, $5)`,
    [hashCredential(accessToken), userId, now, new Date(now.getTime() + ACCESS_TTL_SEC * 1000), connectionId],
  );
  await db.query(
    `INSERT INTO oauth_refresh_tokens (token_hash, connection_id, created_at) VALUES ($1, $2, $3)`,
    [hashCredential(refreshToken), connectionId, now],
  );
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SEC as 3600 };
}

export async function useRefreshToken(db: Queryable, rawRefresh: string, now: Date): Promise<RefreshOutcome> {
  const hash = hashCredential(rawRefresh);
  // ONE statement decides the race (Review Focus 2): only the caller whose UPDATE
  // flips used_at from NULL wins; the loser sees the row already used = reuse.
  const won = await db.query<{ connection_id: string }>(
    `UPDATE oauth_refresh_tokens SET used_at = $2 WHERE token_hash = $1 AND used_at IS NULL RETURNING connection_id`,
    [hash, now],
  );
  const winner = won.rows[0];
  if (winner === undefined) {
    const seen = await db.query<{ connection_id: string }>(
      `SELECT connection_id FROM oauth_refresh_tokens WHERE token_hash = $1`,
      [hash],
    );
    const row = seen.rows[0];
    if (row === undefined) return { status: 'unknown' };
    await db.query(`DELETE FROM oauth_connections WHERE id = $1`, [row.connection_id]);
    return { status: 'reused' };
  }
  const conn = await db.query<{ user_id: string; idle_expires_at: Date }>(
    `SELECT user_id, idle_expires_at FROM oauth_connections WHERE id = $1`,
    [winner.connection_id],
  );
  const c = conn.rows[0];
  if (c === undefined) return { status: 'unknown' };
  if (c.idle_expires_at <= now) {
    await db.query(`DELETE FROM oauth_connections WHERE id = $1`, [winner.connection_id]);
    return { status: 'expired' };
  }
  await db.query(`UPDATE oauth_connections SET idle_expires_at = $2 WHERE id = $1`, [
    winner.connection_id,
    new Date(now.getTime() + IDLE_TTL_MS),
  ]);
  return { status: 'ok', connectionId: winner.connection_id, userId: c.user_id };
}

/** `userId = null` is the RFC 7009 path, where the token itself is the proof of ownership. */
export async function revokeConnection(db: Queryable, connectionId: string, userId: string | null): Promise<boolean> {
  const { rows } = await db.query(
    `DELETE FROM oauth_connections WHERE id = $1 AND ($2::text IS NULL OR user_id = $2) RETURNING id`,
    [connectionId, userId],
  );
  return rows.length === 1;
}

/** An access OR a refresh token names its connection; anything else is null. */
export async function connectionForToken(db: Queryable, rawToken: string): Promise<string | null> {
  const hash = hashCredential(rawToken);
  const { rows } = await db.query<{ connection_id: string }>(
    `SELECT connection_id FROM mcp_tokens WHERE token_hash = $1 AND connection_id IS NOT NULL
     UNION
     SELECT connection_id FROM oauth_refresh_tokens WHERE token_hash = $1`,
    [hash],
  );
  return rows[0]?.connection_id ?? null;
}

export async function listConnections(db: Queryable, userId: string, now: Date): Promise<ConnectionSummary[]> {
  const { rows } = await db.query<{
    id: string;
    client_name: string;
    redirect_uris: string[];
    created_at: Date;
    last_used: Date | null;
  }>(
    `SELECT k.id, c.client_name, c.redirect_uris, k.created_at, k.last_used
       FROM oauth_connections k JOIN oauth_clients c ON c.client_id = k.client_id
      WHERE k.user_id = $1 AND k.idle_expires_at > $2
      ORDER BY k.created_at DESC`,
    [userId, now],
  );
  return rows.map((r) => ({
    id: r.id,
    clientName: r.client_name,
    redirectHost: new URL(r.redirect_uris[0] ?? 'https://unknown.invalid').host,
    createdAt: r.created_at.toISOString(),
    lastUsedAt: r.last_used === null ? null : r.last_used.toISOString(),
  }));
}
