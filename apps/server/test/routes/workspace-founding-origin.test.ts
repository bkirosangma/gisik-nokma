import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * MCP CRUD plan, lane-3 review fix (2026-10-01). Cases 14.313 and 14.315.
 *
 * `POST /v1/workspaces` is the one MCP tool that has a REST door rather than an
 * event, so it was the one write whose envelope origin the route chose for
 * itself — and it chose `'web'` for an assistant's call too. The plan's Global
 * Constraint is that every MCP write carries `origin: 'mcp'`; the route now
 * reads how the request AUTHENTICATED (`request.authKind`) and nothing the
 * request SAYS.
 *
 * The MCP caller here holds a real device-flow token (`mcp_tokens`, kind
 * `local`), minted the way the CLI mints it. A browser-session bearer would
 * authenticate as `'session'` and prove nothing about this branch.
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

/** A person signed in over the wire, plus an MCP token minted for them through the real device flow. */
async function caller(): Promise<{ userId: string; session: string; mcpToken: string }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9190005${String(phoneCounter).padStart(5, '0')}`);
  const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as {
    deviceCode: string;
    userCode: string;
  };
  const approved = await app.inject({
    method: 'POST',
    url: '/v1/mcp/device/approve',
    headers: { authorization: `Bearer ${user.token}` },
    payload: { userCode: minted.userCode },
  });
  expect(approved.statusCode).toBe(200);
  const issued = (
    await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } })
  ).json() as { status: string; token: string };
  expect(issued.status).toBe('issued');
  return { userId: user.userId, session: user.token, mcpToken: issued.token };
}

const found = (bearer: string, payload: Record<string, unknown>, extra: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/v1/workspaces', headers: { authorization: `Bearer ${bearer}`, ...extra }, payload });

/** The origin of every event in the founded workspace's ledger, in order, with its type. */
async function ledger(workspaceId: string): Promise<Array<{ type: string; origin: string }>> {
  const { rows } = await db.pool.query<{ type: string; origin: string }>(
    `SELECT type, origin FROM events WHERE workspace_id = $1 ORDER BY seq`,
    [workspaceId],
  );
  return rows;
}

describe('POST /v1/workspaces — the envelope origin follows how the request authenticated', () => {
  it('14.313 an MCP token founds with origin mcp; a browser session, the CONTROL, founds with origin web', async () => {
    const who = await caller();

    const viaMcp = await found(who.mcpToken, { name: 'Founded by an assistant' });
    expect(viaMcp.statusCode).toBe(201);
    const mcpRows = await ledger((viaMcp.json() as { workspaceId: string }).workspaceId);
    expect(mcpRows.find((r) => r.type === 'workspace.created')?.origin).toBe('mcp');
    // The founding sequence the ingest path appends beside it (`bootstrapWorkspace`: the default workflow, the
    // four built-in types, the founder's owner grant) is the SERVER's own record and stays `server` — the fix
    // moves the caller's act, not the server's seeds.
    expect(mcpRows.length).toBeGreaterThan(1);
    expect(mcpRows.filter((r) => r.type !== 'workspace.created').map((r) => r.origin)).toEqual(
      mcpRows.slice(1).map(() => 'server'),
    );

    // CONTROL, same `it`: the same person, the same body, a browser session — `web`, exactly as before.
    const viaSession = await found(who.session, { name: 'Founded by a person' });
    expect(viaSession.statusCode).toBe(201);
    const sessionRows = await ledger((viaSession.json() as { workspaceId: string }).workspaceId);
    expect(sessionRows.find((r) => r.type === 'workspace.created')?.origin).toBe('web');
    expect(sessionRows.filter((r) => r.type !== 'workspace.created').map((r) => r.origin)).toEqual(
      sessionRows.slice(1).map(() => 'server'),
    );
  });

  it('14.315 neither the body nor a header chooses the origin — only authKind does; origin server is never accepted', async () => {
    const who = await caller();

    // A body naming an origin is refused outright (the schema is closed), for the forged `server`…
    const forged = await found(who.mcpToken, { name: 'Forged', origin: 'server' });
    expect(forged.statusCode).toBe(400);
    // …and for the one a browser session must not claim for itself.
    const claimed = await found(who.session, { name: 'Claimed', origin: 'mcp' });
    expect(claimed.statusCode).toBe(400);
    const { rows: none } = await db.pool.query(`SELECT 1 FROM events WHERE actor_id = $1`, [who.userId]);
    expect(none).toEqual([]);

    // A header cannot choose either: an MCP token keeps `mcp`, a session keeps `web`.
    const headerOnMcp = await found(who.mcpToken, { name: 'Header, token' }, { 'x-origin': 'web', 'x-gisik-origin': 'server' });
    expect(headerOnMcp.statusCode).toBe(201);
    expect((await ledger((headerOnMcp.json() as { workspaceId: string }).workspaceId))[0]?.origin).toBe('mcp');
    const headerOnSession = await found(who.session, { name: 'Header, session' }, { 'x-origin': 'mcp', 'x-gisik-origin': 'server' });
    expect(headerOnSession.statusCode).toBe(201);
    expect((await ledger((headerOnSession.json() as { workspaceId: string }).workspaceId))[0]?.origin).toBe('web');
  });
});
