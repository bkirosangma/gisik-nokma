import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';
import { hashCredential, resolveMcpToken, listMcpTokens } from '../../src/mcp/token-store.js';
import { PURGE_TABLE_RULES } from '../../src/purge/table-rules.js';
import {
  registerClient, mintCode, takeCode, createConnection, issueTokens,
  useRefreshToken, sweepStaleClients, createPending,
} from '../../src/mcp/oauth-store.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

const T0 = new Date('2026-10-01T00:00:00Z');
const plus = (ms: number) => new Date(T0.getTime() + ms);
const H = 3_600_000, D = 24 * H;

async function user(phone: string) {
  const { app, otp } = buildTestApp(db);
  return { app, ...(await signInWithPhone(app, otp, phone)) };
}

describe('hosted MCP storage', () => {
  it('14.200 existing token rows read local/no-expiry/no-connection', async () => {
    const cols = await db.pool.query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name, column_default FROM information_schema.columns
        WHERE table_name = 'mcp_tokens' AND column_name IN ('kind','expires_at','connection_id')`);
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual(['connection_id', 'expires_at', 'kind']);
    expect(cols.rows.find((r) => r.column_name === 'kind')?.column_default).toContain("'local'");
    // An EXISTING row, written with the column list the pre-migration code used.
    const u = await user('+911100002000');
    await db.pool.query(`INSERT INTO mcp_tokens (token_hash, user_id, created_at) VALUES ($1, $2, $3)`,
      [hashCredential('pre-migration-raw'), u.userId, T0]);
    const old = await db.pool.query<{ kind: string; expires_at: Date | null; connection_id: string | null }>(
      `SELECT kind, expires_at, connection_id FROM mcp_tokens WHERE token_hash = $1`, [hashCredential('pre-migration-raw')]);
    expect(old.rows[0]).toEqual({ kind: 'local', expires_at: null, connection_id: null });
    // CONTROL — that row still authenticates a real route, decades later, no expiry.
    expect(await resolveMcpToken(db.pool, 'pre-migration-raw', plus(3650 * D))).toBe(u.userId);
    const viaRoute = await u.app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: 'Bearer pre-migration-raw' } });
    expect(viaRoute.statusCode).toBe(200);
    for (const t of ['oauth_clients', 'oauth_pending_authorizations', 'oauth_codes', 'oauth_connections', 'oauth_refresh_tokens']) {
      const r = await db.pool.query(`SELECT to_regclass($1) AS t`, [t]);
      expect(r.rows[0].t, t).not.toBeNull();
    }
  });

  it('14.201 an expired hosted access token is refused; a local token never expires', async () => {
    const u = await user('+911100002001');
    const { clientId } = await registerClient(db.pool, { clientName: 'Claude', redirectUris: ['https://claude.ai/cb'] }, T0);
    const { connectionId } = await createConnection(db.pool, { userId: u.userId, clientId }, T0);
    const { accessToken } = await issueTokens(db.pool, connectionId, u.userId, T0);
    expect(await resolveMcpToken(db.pool, accessToken, plus(59 * 60_000))).toBe(u.userId);
    expect(await resolveMcpToken(db.pool, accessToken, plus(H + 1))).toBeNull();
    // CONTROL — a local row (kind default) with expires_at NULL resolves far in the future.
    await db.pool.query(`INSERT INTO mcp_tokens (token_hash, user_id, created_at) VALUES ($1, $2, $3)`,
      [hashCredential('local-raw-2001'), u.userId, T0]);
    expect(await resolveMcpToken(db.pool, 'local-raw-2001', plus(3650 * D))).toBe(u.userId);
  });

  it('14.202 resolving a hosted token stamps its connection', async () => {
    const u = await user('+911100002002');
    const { clientId } = await registerClient(db.pool, { clientName: 'ChatGPT', redirectUris: ['https://chatgpt.com/cb'] }, T0);
    const { connectionId } = await createConnection(db.pool, { userId: u.userId, clientId }, T0);
    const { accessToken } = await issueTokens(db.pool, connectionId, u.userId, T0);
    await resolveMcpToken(db.pool, accessToken, plus(10 * 60_000));
    const r = await db.pool.query<{ last_used: Date }>(`SELECT last_used FROM oauth_connections WHERE id = $1`, [connectionId]);
    expect(r.rows[0]?.last_used.toISOString()).toBe(plus(10 * 60_000).toISOString());
  });

  it('14.203 a code is single-use and lives 60 s', async () => {
    const u = await user('+911100002003');
    const { clientId } = await registerClient(db.pool, { clientName: 'C', redirectUris: ['https://claude.ai/cb'] }, T0);
    const base = { clientId, userId: u.userId, redirectUri: 'https://claude.ai/cb', codeChallenge: 'x'.repeat(43) };
    const a = await mintCode(db.pool, base, T0);
    expect(await takeCode(db.pool, a, plus(59_000))).not.toBeNull(); // CONTROL
    expect(await takeCode(db.pool, a, plus(59_500))).toBeNull();
    const b = await mintCode(db.pool, base, T0);
    expect(await takeCode(db.pool, b, plus(61_000))).toBeNull();
  });

  it('14.204 a reused refresh token revokes the connection', async () => {
    const u = await user('+911100002004');
    const { clientId } = await registerClient(db.pool, { clientName: 'C', redirectUris: ['https://claude.ai/cb'] }, T0);
    const { connectionId } = await createConnection(db.pool, { userId: u.userId, clientId }, T0);
    const first = await issueTokens(db.pool, connectionId, u.userId, T0);
    const ok = await useRefreshToken(db.pool, first.refreshToken, plus(H));
    expect(ok.status).toBe('ok');
    const second = await issueTokens(db.pool, connectionId, u.userId, plus(H));
    expect((await useRefreshToken(db.pool, first.refreshToken, plus(2 * H))).status).toBe('reused');
    const left = await db.pool.query(`SELECT 1 FROM oauth_connections WHERE id = $1`, [connectionId]);
    expect(left.rowCount).toBe(0);
    expect(await resolveMcpToken(db.pool, second.accessToken, plus(H + 60_000))).toBeNull();
  });

  it('14.205 90-day sliding idle expiry', async () => {
    const u = await user('+911100002005');
    const { clientId } = await registerClient(db.pool, { clientName: 'C', redirectUris: ['https://claude.ai/cb'] }, T0);
    const { connectionId } = await createConnection(db.pool, { userId: u.userId, clientId }, T0);
    const t = await issueTokens(db.pool, connectionId, u.userId, T0);
    expect((await useRefreshToken(db.pool, t.refreshToken, plus(89 * D))).status).toBe('ok'); // CONTROL + slides
    const t2 = await issueTokens(db.pool, connectionId, u.userId, plus(89 * D));
    expect((await useRefreshToken(db.pool, t2.refreshToken, plus(89 * D + 89 * D))).status).toBe('ok');
    const t3 = await issueTokens(db.pool, connectionId, u.userId, plus(178 * D));
    expect((await useRefreshToken(db.pool, t3.refreshToken, plus(178 * D + 91 * D))).status).toBe('expired');
  });

  it('14.206 stale unused clients are swept, used ones kept', async () => {
    const u = await user('+911100002006');
    const old = await registerClient(db.pool, { clientName: 'old', redirectUris: ['https://x.example/cb'] }, plus(-31 * D));
    const young = await registerClient(db.pool, { clientName: 'young', redirectUris: ['https://x.example/cb'] }, plus(-29 * D));
    const used = await registerClient(db.pool, { clientName: 'used', redirectUris: ['https://x.example/cb'] }, plus(-40 * D));
    await createConnection(db.pool, { userId: u.userId, clientId: used.clientId }, plus(-40 * D));
    await sweepStaleClients(db.pool, T0);
    const ids = (await db.pool.query<{ client_id: string }>(`SELECT client_id FROM oauth_clients`)).rows.map((r) => r.client_id);
    expect(ids).not.toContain(old.clientId);
    expect(ids).toContain(young.clientId);
    expect(ids).toContain(used.clientId);
  });

  it('14.207 nothing raw is stored', async () => {
    const u = await user('+911100002007');
    const { clientId } = await registerClient(db.pool, { clientName: 'C', redirectUris: ['https://claude.ai/cb'] }, T0);
    const code = await mintCode(db.pool, { clientId, userId: u.userId, redirectUri: 'https://claude.ai/cb', codeChallenge: 'c'.repeat(43) }, T0);
    const { connectionId } = await createConnection(db.pool, { userId: u.userId, clientId }, T0);
    const t = await issueTokens(db.pool, connectionId, u.userId, T0);
    const dump = JSON.stringify((await db.pool.query(
      `SELECT (SELECT json_agg(c) FROM oauth_codes c) a, (SELECT json_agg(m) FROM mcp_tokens m) b, (SELECT json_agg(r) FROM oauth_refresh_tokens r) c`)).rows);
    for (const raw of [code, t.accessToken, t.refreshToken]) expect(dump).not.toContain(raw);
    expect(dump).toContain(hashCredential(t.refreshToken)); // CONTROL
  });

  it('14.208 listMcpTokens lists local tokens only', async () => {
    const u = await user('+911100002008');
    const { clientId } = await registerClient(db.pool, { clientName: 'C', redirectUris: ['https://claude.ai/cb'] }, T0);
    const { connectionId } = await createConnection(db.pool, { userId: u.userId, clientId }, T0);
    await issueTokens(db.pool, connectionId, u.userId, T0);
    await db.pool.query(`INSERT INTO mcp_tokens (token_hash, user_id, created_at, name) VALUES ($1, $2, $3, 'laptop')`,
      [hashCredential('local-2008'), u.userId, T0]);
    const listed = await listMcpTokens(db.pool, u.userId);
    expect(listed.map((t) => t.name)).toEqual(['laptop']);
  });

  it('14.209 every new table has a purge rule', async () => {
    const NEW = ['oauth_clients', 'oauth_pending_authorizations', 'oauth_codes', 'oauth_connections', 'oauth_refresh_tokens'];
    const real = await db.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [NEW]);
    expect(real.rows.map((r) => r.table_name).sort()).toEqual([...NEW].sort()); // CONTROL — they exist to be ruled
    for (const t of NEW) expect(PURGE_TABLE_RULES[t]?.rule, t).toBe('not-entity-bearing');
  });
});
