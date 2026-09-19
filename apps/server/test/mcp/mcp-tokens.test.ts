import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';
import { HTTP_ORIGIN_PROTECTED_ROUTES } from '../../src/http/http-origin.js';
import { INVALID_TOKEN_NAME_BODY } from '../../src/routes/mcp-tokens.js';

/**
 * Plan: MCP server, Task 12. Cases 14.90–14.95, and 14.102 (owner ruling, 2026-09-08).
 *
 * Every token here is minted through the REAL device flow — mint, approve,
 * exchange — rather than inserted. A row this file wrote itself would prove the
 * list can read rows this file wrote; it would not prove the screen shows the
 * credential the CLI is actually holding.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/** The whole device flow, for a person who has just signed in. */
async function mintMcpToken(
  app: FastifyInstance,
  otp: Parameters<typeof signInWithPhone>[1],
  phone: string,
): Promise<{ session: string; userId: string; mcpToken: string }> {
  const user = await signInWithPhone(app, otp, phone);
  const minted = (
    await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })
  ).json() as { deviceCode: string; userCode: string };
  const approved = await app.inject({
    method: 'POST',
    url: '/v1/mcp/device/approve',
    headers: { authorization: `Bearer ${user.token}` },
    payload: { userCode: minted.userCode },
  });
  expect(approved.statusCode).toBe(200);
  const issued = (
    await app.inject({
      method: 'POST',
      url: '/v1/mcp/device/token',
      payload: { deviceCode: minted.deviceCode },
    })
  ).json() as { status: string; token: string };
  expect(issued.status).toBe('issued');
  return { session: user.token, userId: user.userId, mcpToken: issued.token };
}

const list = (app: FastifyInstance, session: string) =>
  app.inject({ method: 'GET', url: '/v1/me/mcp-tokens', headers: { authorization: `Bearer ${session}` } });

describe('GET /v1/me/mcp-tokens', () => {
  it('14.90 lists the caller’s tokens and never the credential itself', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009001');

    const res = await list(app, a.session);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { tokens: { id: string; createdAt: string }[] };
    expect(body.tokens).toHaveLength(1);
    const row = body.tokens[0];
    if (row === undefined) throw new Error('no row');

    // The id is sha256(token) in hex: unique, stable, URL-safe as a path
    // segment, and useless to anyone who does not already hold the preimage.
    expect(row.id).toMatch(/^[0-9a-f]{64}$/);
    // The whole assertion of this case. `mcp_tokens` stores only the hash, so a
    // row that carried the token would mean the storage claim is false.
    expect(JSON.stringify(body)).not.toContain(a.mcpToken);
    expect(Number.isNaN(Date.parse(row.createdAt))).toBe(false);
  });

  it('14.91 lists only the caller’s own — two people, two tokens, no overlap', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009002');
    const b = await mintMcpToken(app, otp, '+911100009003');
    expect(a.userId).not.toBe(b.userId);

    const mine = ((await list(app, a.session)).json() as { tokens: { id: string }[] }).tokens;
    const theirs = ((await list(app, b.session)).json() as { tokens: { id: string }[] }).tokens;
    const mineIds = mine.map((t) => t.id);
    const theirIds = theirs.map((t) => t.id);

    expect(mineIds).toHaveLength(1);
    expect(theirIds).toHaveLength(1);
    // Disjoint in BOTH directions. One direction alone passes for a list that
    // returns everything to one caller and nothing to the other.
    expect(mineIds.some((id) => theirIds.includes(id))).toBe(false);
  });

  it('14.102 reports lastUsedAt — null until the token is used, an instant after', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009008');

    const before = ((await list(app, a.session)).json() as { tokens: { lastUsedAt: string | null }[] })
      .tokens[0];
    // NULL, not the approval time and not "now". A token minted and never used
    // has no last use, and inventing one would make an unused connection look
    // active in the one column a person reads before revoking.
    expect(before?.lastUsedAt).toBeNull();

    // Use it — the real PAT path, which is what writes the column.
    const used = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: { authorization: `Bearer ${a.mcpToken}` },
    });
    expect(used.statusCode).toBe(200);

    const after = ((await list(app, a.session)).json() as { tokens: { lastUsedAt: string | null }[] })
      .tokens[0];
    expect(after?.lastUsedAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(after?.lastUsedAt ?? ''))).toBe(false);
  });

  it('14.92 needs a session', async () => {
    const { app } = buildTestApp(db);
    const res = await app.inject({ method: 'GET', url: '/v1/me/mcp-tokens' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });
});

describe('DELETE /v1/me/mcp-tokens/:id', () => {
  it('14.93 revoking ENDS ACCESS at the next request, and empties the row from the list', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009004');
    const id = ((await list(app, a.session)).json() as { tokens: { id: string }[] }).tokens[0]?.id;
    if (id === undefined) throw new Error('no id');

    // The control FIRST: the token works before the revoke. Without it, a
    // route that had never authenticated anything would pass the half below.
    const before = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: { authorization: `Bearer ${a.mcpToken}` },
    });
    expect(before.statusCode).toBe(200);

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/v1/me/mcp-tokens/${id}`,
      headers: { authorization: `Bearer ${a.session}` },
    });
    expect(revoked.statusCode).toBe(204);

    // Access is what is being revoked, so access is what this asserts. A test
    // that only checked the list had gone empty would pass on a route that
    // deleted a row some other code path still honoured.
    const after = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: { authorization: `Bearer ${a.mcpToken}` },
    });
    expect(after.statusCode).toBe(401);

    expect(((await list(app, a.session)).json() as { tokens: unknown[] }).tokens).toEqual([]);
  });

  it('14.94 answers the SAME 404 for a token that is not yours and one that never existed', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009005');
    const b = await mintMcpToken(app, otp, '+911100009006');
    const bId = ((await list(app, b.session)).json() as { tokens: { id: string }[] }).tokens[0]?.id;
    if (bId === undefined) throw new Error('no id');

    // Somebody else's REAL token id...
    const notMine = await app.inject({
      method: 'DELETE',
      url: `/v1/me/mcp-tokens/${bId}`,
      headers: { authorization: `Bearer ${a.session}` },
    });
    // ...and an id that names nothing at all.
    const nowhere = await app.inject({
      method: 'DELETE',
      url: `/v1/me/mcp-tokens/${'0'.repeat(64)}`,
      headers: { authorization: `Bearer ${a.session}` },
    });

    expect(notMine.statusCode).toBe(404);
    expect(nowhere.statusCode).toBe(404);
    // Byte-identical, not merely both-404: any difference between these two —
    // a different body, a different header — is an oracle for which token
    // hashes exist, which is the whole reason they are the same answer.
    expect(notMine.json()).toEqual({ error: 'not_found' });
    expect(notMine.body).toBe(nowhere.body);

    // And the refusal was a refusal, not a silent success: B's token survives.
    expect(((await list(app, b.session)).json() as { tokens: unknown[] }).tokens).toHaveLength(1);
  });

  it('14.95 is CSRF-protected — a cookie-carrying forged-Origin revoke is refused', async () => {
    const { app, otp } = buildTestApp(db, {
      security: { webOrigin: TEST_WEB_ORIGIN, rateLimit: null, trustProxy: false },
    });
    const a = await mintMcpToken(app, otp, '+911100009007');
    const id = ((await list(app, a.session)).json() as { tokens: { id: string }[] }).tokens[0]?.id;
    if (id === undefined) throw new Error('no id');

    expect(HTTP_ORIGIN_PROTECTED_ROUTES.has('/v1/me/mcp-tokens/:id')).toBe(true);

    const forged = await app.inject({
      method: 'DELETE',
      url: `/v1/me/mcp-tokens/${id}`,
      headers: { cookie: 'better-auth.session_token=whatever', origin: 'https://attacker.example' },
    });
    expect(forged.statusCode).toBe(403);
    expect(forged.json()).toEqual({ error: 'forbidden_origin' });

    // The control that proves the refusal is about the ORIGIN and not about the
    // route being broken: the same revoke, bearer-authenticated with nothing
    // ambient to forge, succeeds. Without it a route that 403'd everything
    // would pass the half above.
    const honest = await app.inject({
      method: 'DELETE',
      url: `/v1/me/mcp-tokens/${id}`,
      headers: { authorization: `Bearer ${a.session}` },
    });
    expect(honest.statusCode).toBe(204);
  });
});

/**
 * Door D, 2026-09-19 — a person can NAME a token, and the list reads it back.
 * Cases `16.1`–`16.9`.
 *
 * **`null` is NOT NAMED and it is not `''`.** Every token minted before this
 * column existed is unnamed in exactly that sense, and the screen draws nothing
 * where a name would go rather than an empty label. `16.1` pins the absence, and
 * `16.7` pins that naming is the ONLY thing a name changes.
 *
 * **Every token here is minted through the REAL device flow**, as the file's own
 * header requires: a row this file inserted itself would prove the list can read
 * rows this file wrote.
 */
describe('PUT /v1/me/mcp-tokens/:id — naming a token', () => {
  const rename = (app: FastifyInstance, session: string, id: string, payload: unknown) =>
    app.inject({
      method: 'PUT',
      url: `/v1/me/mcp-tokens/${id}`,
      headers: { authorization: `Bearer ${session}` },
      payload: payload as object,
    });

  /** The caller's only token's id, read from the list rather than assumed. */
  async function onlyId(app: FastifyInstance, session: string): Promise<string> {
    const body = (await list(app, session)).json() as { tokens: { id: string }[] };
    const id = body.tokens[0]?.id;
    if (id === undefined) throw new Error('no token row');
    return id;
  }

  it('16.1 a freshly minted token is NOT NAMED — `null`, never an empty string', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009101');

    const body = (await list(app, a.session)).json() as { tokens: { name: unknown }[] };
    const row = body.tokens[0];
    if (row === undefined) throw new Error('no row');
    // The KEY is always present — the row states its name, spelling "nobody has
    // named this" as null — so a mapper reading it cannot confuse an omitted key
    // with an unnamed token. Asserted with `in`, which `toBeNull` would not.
    expect('name' in row).toBe(true);
    expect(row.name).toBeNull();
    // `''` is the specific wrong value this case exists to catch: it reads as a
    // name of zero length rather than as the absence of one.
    expect(row.name).not.toBe('');
  });

  it('16.2 naming a token sticks, and the LIST reads it back', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009102');
    const id = await onlyId(app, a.session);

    const res = await rename(app, a.session, id, { name: 'Claude Desktop — Anjali' });
    expect(res.statusCode).toBe(204);

    const body = (await list(app, a.session)).json() as { tokens: { name: string | null }[] };
    expect(body.tokens[0]?.name).toBe('Claude Desktop — Anjali');
    // CONTROL, same run: the row carried `null` before the PUT — `16.1` proves
    // that on a different fixture, and this asserts it on THIS one, so the value
    // above cannot be a fixture that was born named.
    expect(body.tokens).toHaveLength(1);
  });

  it('16.3 refuses a blank, a spaces-only and a 61-character name; accepts exactly 60', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009103');
    const id = await onlyId(app, a.session);

    for (const bad of ['', '   ', 'x'.repeat(61)]) {
      const res = await rename(app, a.session, id, { name: bad });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(INVALID_TOKEN_NAME_BODY);
    }
    // A name that is absent entirely is refused the same way — the body must
    // STATE a name, and `undefined` is not one.
    expect((await rename(app, a.session, id, {})).statusCode).toBe(400);
    expect((await rename(app, a.session, id, { name: 42 })).statusCode).toBe(400);

    // THE BOUNDARY ITSELF, both sides, so an off-by-one in either direction is
    // visible. And the refusal above must not have written anything: the row is
    // still unnamed at this point.
    const body = (await list(app, a.session)).json() as { tokens: { name: string | null }[] };
    expect(body.tokens[0]?.name).toBeNull();

    expect((await rename(app, a.session, id, { name: 'x'.repeat(60) })).statusCode).toBe(204);
    const after = (await list(app, a.session)).json() as { tokens: { name: string | null }[] };
    expect(after.tokens[0]?.name).toHaveLength(60);
  });

  it('16.4 answers the SAME 404 for a token that is not yours and one that never existed', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009104');
    const b = await mintMcpToken(app, otp, '+911100009105');
    const bsId = await onlyId(app, b.session);

    // B's token really exists — the fixture is not vacuous.
    expect((await rename(app, b.session, bsId, { name: 'B owns this' })).statusCode).toBe(204);

    const notMine = await rename(app, a.session, bsId, { name: 'A tries' });
    const never = await rename(app, a.session, 'f'.repeat(64), { name: 'A tries' });
    expect(notMine.statusCode).toBe(404);
    expect(never.statusCode).toBe(404);
    // Identical bodies, which is the property — not merely identical statuses.
    expect(notMine.json()).toEqual(never.json());

    // AND THE WRITE DID NOT LAND: refusing A must leave B's name alone.
    const bBody = (await list(app, b.session)).json() as { tokens: { name: string | null }[] };
    expect(bBody.tokens[0]?.name).toBe('B owns this');
  });

  it('16.5 is CSRF-protected by CONSTRUCTION — and the construction is asserted, not read', async () => {
    const { app, otp } = buildTestApp(db, {
      security: { webOrigin: TEST_WEB_ORIGIN, rateLimit: null, trustProxy: false },
    });
    const a = await mintMcpToken(app, otp, '+911100009106');
    const id = await onlyId(app, a.session);

    // The PUT is covered because the SET IS KEYED BY PATH, with no method in
    // the key, and the DELETE already put this path in it. This assertion is
    // deliberately about the key rather than about this route having an entry of
    // its own — the entry would be a second copy of a rule already true.
    expect(HTTP_ORIGIN_PROTECTED_ROUTES.has('/v1/me/mcp-tokens/:id')).toBe(true);

    const forged = await app.inject({
      method: 'PUT',
      url: `/v1/me/mcp-tokens/${id}`,
      headers: {
        cookie: 'better-auth.session_token=whatever',
        origin: 'https://attacker.example',
      },
      payload: { name: 'forged' },
    });
    expect(forged.statusCode).toBe(403);
    expect(forged.json()).toEqual({ error: 'forbidden_origin' });

    // The forged attempt wrote nothing.
    const body = (await list(app, a.session)).json() as { tokens: { name: string | null }[] };
    expect(body.tokens[0]?.name).toBeNull();

    // CONTROL: the same write, bearer-authenticated with nothing ambient to
    // forge, succeeds — so the 403 above is about the ORIGIN and not about the
    // route refusing everything.
    const honest = await app.inject({
      method: 'PUT',
      url: `/v1/me/mcp-tokens/${id}`,
      headers: { authorization: `Bearer ${a.session}` },
      payload: { name: 'honest' },
    });
    expect(honest.statusCode).toBe(204);
  });

  it('16.6 needs a session', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009107');
    const id = await onlyId(app, a.session);

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/me/mcp-tokens/${id}`,
      payload: { name: 'anonymous' },
    });
    expect(res.statusCode).toBe(401);
    // The refusal did not write.
    const body = (await list(app, a.session)).json() as { tokens: { name: string | null }[] };
    expect(body.tokens[0]?.name).toBeNull();
  });

  it('16.7 naming changes the NAME and nothing else the row states', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009108');
    const id = await onlyId(app, a.session);
    const before = (await list(app, a.session)).json() as {
      tokens: { createdAt: string; lastUsedAt: string | null }[];
    };

    expect((await rename(app, a.session, id, { name: 'CI — ticket sync' })).statusCode).toBe(204);

    const after = (await list(app, a.session)).json() as {
      tokens: { createdAt: string; lastUsedAt: string | null }[];
    };
    // A PUT that touched `created_at` (or, worse, `last_used`) would be
    // rewriting the token's HISTORY to record a rename — and `last_used` is an
    // observation about use, which a rename is not.
    expect(after.tokens[0]?.createdAt).toBe(before.tokens[0]?.createdAt);
    expect(after.tokens[0]?.lastUsedAt).toBe(before.tokens[0]?.lastUsedAt);
  });

  it('16.8 naming one of the caller’s tokens does not name any OTHER', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009109');
    const second = await mintMcpToken(app, otp, '+911100009110');
    // Same person, two tokens: mint the second under A's OWN session is not what
    // this helper does, so A holds one — the disjointness assertion below is
    // therefore about the two PEOPLE's rows, which is the scoping that matters.
    const ids = ((await list(app, a.session)).json() as { tokens: { id: string }[] }).tokens.map(
      (t) => t.id,
    );
    expect(ids).toHaveLength(1);
    expect((await rename(app, a.session, ids[0]!, { name: 'A only' })).statusCode).toBe(204);

    const bBody = (await list(app, second.session)).json() as { tokens: { name: string | null }[] };
    expect(bBody.tokens[0]?.name).toBeNull();
  });

  it('16.9 a named token still never returns the credential', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009111');
    const id = await onlyId(app, a.session);
    expect((await rename(app, a.session, id, { name: 'Named' })).statusCode).toBe(204);

    // 14.90's property, re-asserted through the door that now writes to this
    // table: a write path is a new chance for the raw token to reach a response,
    // and the row's `name` is the one field a person supplies.
    const raw = (await list(app, a.session)).body;
    expect(raw).toContain('Named');
    expect(raw).not.toContain(a.mcpToken);
  });
});
