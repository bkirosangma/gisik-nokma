# Hosted (remote) MCP server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A non-technical member pastes `https://pm-api.artsourced.in/mcp` into Claude or ChatGPT, signs in with their usual Gisik Nokma login, clicks Allow, and their assistant can use the nine gisik-nokma tools as them — no install, no config, no token copied by hand.

**Architecture:** A small OAuth 2.1 authorization server (RFC 8414/9728 metadata, RFC 7591 public-client registration, authorization code + PKCE S256, rotating refresh tokens, RFC 7009 revoke) and a stateless MCP Streamable HTTP endpoint, both as Fastify plugins on the existing `server` service. Sign-in reuses better-auth through a new web page `/mcp/connect`. The `/mcp` route runs the **same nine tools** as the stdio server by building the package's `Session` over an in-process `fetch` that calls the API's own routes through `app.inject` with the caller's access token.

**Tech Stack:** Fastify 5 + better-auth 1.7 (`apps/server`), `@modelcontextprotocol/sdk@1.30.0` (`WebStandardStreamableHTTPServerTransport`), Postgres, Next 15 (`apps/web`), vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-remote-mcp-server-design.md` (owner-approved 2026-09-30). Executors read both.

**Branch:** one task branch per task (or one lane branch run task by task), cut from `origin/release/2026-09-30`; PR `--base release/2026-09-30`. Never `main`.

## Global Constraints

- Day-one clients: **Claude (claude.ai web/mobile, Claude Desktop, Claude Code) and ChatGPT**; registration open to any standards-following client, only these two promised (D1).
- **Both doors stay**: stdio + device flow untouched in behaviour (D2). Local `mcp_tokens` rows keep `expires_at NULL` forever.
- Access token **1 hour**; refresh token **rotates on every use**; a dead refresh token presented again **revokes the whole connection**; a connection expires after **90 days without a refresh**, sliding (D3).
- Reach: everything the person can do in every workspace; **one scope `gisik:act`**; no workspace picker, no read-only mode (D4).
- Built inside the existing `server` service; **no better-auth upgrade**; no new DO component (D5).
- **PKCE S256 required**; plain/absent refused. **Exact** redirect-URI match. Redirects `https://…` or loopback `http://127.0.0.1:*` / `http://localhost:*` only.
- Authorization code: **single-use, 60 s**, bound to client + redirect URI + PKCE challenge, stored as a hash.
- All tokens and codes: 32 random bytes base64url, **sha256 at rest** (`hashCredential`, `apps/server/src/mcp/token-store.ts:29`), **never logged**.
- Consent copy (spec §4) is pinned verbatim; the redirect URI's host is ALWAYS shown beside the self-reported client name.
- Writes keep `origin: 'mcp'` (`packages/mcp-server/src/tools/write-tools.ts:61`).
- A registered client with no live connection and no pending authorization is removed after **30 days**.
- Case ids for this plan: the block **14.200–14.299** in `test-cases/14-mcp-server.md` (free: the file's highest ids are `14.113` and the allocated B09 block `14.150`–`14.159`, measured with a numeric sort on the release base).

## Spec corrections found on reading (FD — the plan wins where these differ)

- **FD1 — The API has no configured public URL, and `BETTER_AUTH_URL` is the WEB origin in production.** `deploy/do/app.yaml:136-137` sets `BETTER_AUTH_URL=https://pm.artsourced.in`; `index.ts:118` passes it as `baseUrl`. The issuer / resource URL must be `https://pm-api.artsourced.in`, so a new server env var **`MCP_PUBLIC_URL`** is added (`apps/server/src/config.ts`, optional `httpUrl()`). **Unset ⇒ the hosted plugins are not registered at all** (404 on `/mcp`, `/oauth/*`, `/.well-known/oauth-*`). That doubles as the "production behind a switch" the spec's §10 real-client step may need. The DO spec gets `MCP_PUBLIC_URL=https://pm-api.artsourced.in` on the `server` component — applied from the LIVE spec with `doctl apps update` at release time (memory: the spec is not applied on push). No other DO change.
- **FD2 — Access tokens rotate hourly, so the "Connected assistants" list cannot be a list of `mcp_tokens` rows for hosted connections** (it would grow a row an hour; `listMcpTokens` returns one row per token, `token-store.ts:198-217`). A new table **`oauth_connections`** is the durable identity (the refresh "family"): one row per consent, holding `client_id`, `last_used`, `idle_expires_at`. `mcp_tokens` gains `kind` (`local`|`hosted`), `expires_at`, and `connection_id` (FK → `oauth_connections` ON DELETE CASCADE) instead of the spec's `client_id`/`family_id` columns. Deleting a connection deletes its access and refresh tokens in one statement.
- **FD3 — CORS needs no change for the day-one clients.** The server's CORS admits only `WEB_ORIGIN` (`apps/server/src/app.ts:750-755`). Claude's and ChatGPT's remote connectors call the MCP and token endpoints from the vendors' servers, not from a browser page, and `/oauth/authorize` is a top-level browser navigation (no CORS). The plan adds **no** CORS rule; the real-client check (Task 11) is where a missing one would show, and the fix would be a scoped predicate for `/mcp` + `/oauth/*` only.
- **FD4 — Framing is already refused on every web page**: `apps/web/next.config.ts` sends `x-frame-options: DENY` for `/:path*` (the `always` headers). The consent page needs no new header; a CSP `frame-ancestors` would contradict the owner's 2026-09-08 CSP deferral pinned by `test/next-config.test.ts`. A case pins that `/mcp/connect` is covered.
- **FD5 — Request-log redaction already covers the OAuth query parameters**: `CREDENTIAL_PARAMS` holds `token, code, state, access_token, refresh_token, id_token` (`apps/server/src/http/redact-url.ts:9-16`), and Fastify does not log bodies. No code change; cases pin `/oauth/authorize?…&state=…` and the redirect back.
- **FD6 — The package does not export the tool registration today**: `packages/mcp-server/src/index.ts` exports config, token-cache, http-client, device-login, session — NOT `registerTools` (`tools/register.ts:39`) or `lazySession` (`lazy-session.ts:31`). Task 6 adds both exports. The seam is `createGisikClient(serverUrl, fetchImpl)` (`http-client.ts:36`): its `fetchImpl` parameter takes an in-process fetch over `app.inject`.
- **FD7 — In-process calls must carry the caller's network identity**: every `app.inject` request runs the rate-limit `onRequest` hook (`app.ts:547` ff., keyed by `rateLimitKeyFor(x-forwarded-for, ip, trustProxy)`). Without care, every hosted user would share `127.0.0.1`'s `/v1/events` bucket. The in-process fetch passes the OUTER request's `remoteAddress` and `x-forwarded-for` to `inject`.
- **FD8 — The consent decision is a cookie-session POST from the web host** (like `/v1/mcp/device/approve`, `routes/mcp-device.ts:37-70`), so it joins `HTTP_ORIGIN_PROTECTED_ROUTES` (`http/http-origin.ts`) and refuses an MCP-token caller (`request.authKind === 'mcp-token'`, the E6-16 precedent at `mcp-device.ts:55-60`).
- **FD9 — Stateless transport choice**: the SDK's Node `StreamableHTTPServerTransport` wraps the web-standard one via `@hono/node-server`; the route uses **`WebStandardStreamableHTTPServerTransport`** directly (`handleRequest(Request, {parsedBody, authInfo}) → Response`), with `sessionIdGenerator: undefined` and `enableJsonResponse: true`, a fresh `McpServer` + transport per request (the SDK's stateless pattern). No `reply.hijack()`. `GET` and `DELETE /mcp` answer **405** with `Allow: POST` (no server-initiated stream in stateless mode).

## Review Focus

1. **A person who clicks Allow twice, or reloads `/mcp/connect` after deciding** — expect the second decision to be refused plainly ("This request has already been answered") and no second code minted. → Task 3, case 14.226.
2. **Two refreshes racing with the same refresh token** (a client retry) — expect exactly one to win and the other to be treated as reuse (connection revoked), never two live families. → Task 5, case 14.246.
3. **A person removed from every workspace (R5) whose connection is still live** — expect `/mcp` to authenticate but every tool to return the REST API's refusal / empty lists, never data. → Task 7, case 14.266.
4. **A client that registers the same redirect with a trailing slash or different case and then authorizes with the other spelling** — expect refusal before any redirect (exact match), and an error page on the API, never a redirect to the unregistered URI. → Task 3, case 14.222.
5. **The server restarting between authorize and token exchange** — expect the pending authorization and code (Postgres, not memory) to survive, so a person mid-consent still completes. → Task 5, case 14.247.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/server/migrations/1790800000000_mcp-oauth.sql` (create) | the five OAuth tables + three `mcp_tokens` columns |
| `apps/server/src/mcp/oauth-store.ts` (create) | every SQL statement for clients, pending authorizations, codes, connections, refresh tokens |
| `apps/server/src/mcp/token-store.ts` (modify) | `resolveMcpToken` honours `expires_at` and stamps the connection; `listMcpTokens` lists local rows only |
| `apps/server/src/mcp/pkce.ts` (create) | `verifyPkceS256(verifier, challenge)` |
| `apps/server/src/routes/mcp-oauth.ts` (create) | metadata, register, authorize, decision API, token, revoke |
| `apps/server/src/mcp/in-process-fetch.ts` (create) | `inProcessFetch(app, outer)` — a `typeof fetch` over `app.inject` |
| `apps/server/src/routes/mcp-http.ts` (create) | `POST /mcp` (+405s), Origin check, 401 `WWW-Authenticate`, per-call log line |
| `apps/server/src/routes/mcp-connections.ts` (create) | `GET/DELETE /v1/me/mcp-connections` |
| `apps/server/src/config.ts`, `app.ts`, `index.ts`, `http/http-origin.ts`, `purge/table-rules.ts` (modify) | wiring |
| `packages/mcp-server/src/index.ts` (modify) | export `registerTools`, `lazySession` |
| `apps/server/package.json` (modify) | `"@gisik-nokma/mcp-server": "workspace:*"` |
| `apps/web/app/mcp/connect/page.tsx`, `apps/web/app/mcp/connect/layout.tsx` (create) | sign-in round trip + consent |
| `apps/web/src/mcp-tokens-screen.tsx` (modify) | hosted connections + "Connect an assistant" panel |
| `docs/manual.md` (modify) | new `## §16 — Connecting Claude or ChatGPT` |
| `Features.md` §14, `test-cases/14-mcp-server.md` (modify) | catalogue, every task |

Test files: `apps/server/test/mcp/oauth-store.test.ts`, `oauth-metadata.test.ts`, `oauth-authorize.test.ts`, `oauth-token.test.ts`, `mcp-http.test.ts`, `mcp-connections.test.ts`, `mcp-remote-e2e.test.ts`; `packages/mcp-server/test/exports.test.ts`; `apps/web/test/mcp-connect-page.test.tsx`; `apps/web/test/mcp-tokens-page.test.tsx` (extend).

A shared test helper is created in Task 2 and used by Tasks 3–10: `apps/server/test/helpers/oauth.ts` (below).

---

### Task 1: The storage — five OAuth tables, three `mcp_tokens` columns, expiring resolution

**Files:**
- Create: `apps/server/migrations/1790800000000_mcp-oauth.sql`
- Create: `apps/server/src/mcp/oauth-store.ts`
- Modify: `apps/server/src/mcp/token-store.ts:198-217` (`listMcpTokens`), `:286-296` (`resolveMcpToken`)
- Modify: `apps/server/src/purge/table-rules.ts:127-128` (five new rows beside `mcp_tokens`)
- Test: `apps/server/test/mcp/oauth-store.test.ts`; `apps/server/test/purge/table-rules.test.ts` (runs unchanged — it fails on an unruled table)

**Interfaces:**
- Produces (all in `oauth-store.ts`; `db: Queryable`, `now: Date`):
  - `registerClient(db, { clientName: string; redirectUris: string[] }, now): Promise<{ clientId: string }>`
  - `getClient(db, clientId): Promise<{ clientId: string; clientName: string; redirectUris: string[] } | null>`
  - `sweepStaleClients(db, now): Promise<number>` — deletes clients older than 30 days with no connection and no pending row
  - `createPending(db, p: { clientId; redirectUri; state: string | null; codeChallenge: string }, now): Promise<{ requestId: string }>` — `expires_at = now + 10 min`
  - `getPending(db, requestId, now): Promise<Pending | null>` (null if expired or absent)
  - `takePending(db, requestId, now): Promise<Pending | null>` — `DELETE … RETURNING`, single-use
  - `mintCode(db, { clientId; userId; redirectUri; codeChallenge }, now): Promise<string>` — raw code; row hashed, `expires_at = now + 60 s`
  - `takeCode(db, rawCode, now): Promise<CodeRow | null>` — `DELETE … WHERE code_hash=$1 AND expires_at > $2 RETURNING`
  - `createConnection(db, { userId; clientId }, now): Promise<{ connectionId: string }>` — `idle_expires_at = now + 90 d`
  - `issueTokens(db, connectionId, userId, now): Promise<{ accessToken: string; refreshToken: string; expiresIn: 3600 }>` — inserts one `mcp_tokens` row (`kind='hosted'`, `expires_at = now + 1 h`, `connection_id`) and one `oauth_refresh_tokens` row
  - `useRefreshToken(db, rawRefresh, now): Promise<{ status: 'ok'; connectionId: string; userId: string } | { status: 'reused' } | { status: 'expired' } | { status: 'unknown' }>` — atomically marks used; on `reused`/`expired` deletes the connection
  - `revokeConnection(db, connectionId, userId | null): Promise<boolean>` (null user = RFC 7009 path, identified by token)
  - `connectionForToken(db, rawToken): Promise<string | null>` — access OR refresh token → connection id
  - `listConnections(db, userId, now): Promise<{ id; clientName; redirectHost; createdAt; lastUsedAt }[]>` (live only)
- Produces (`token-store.ts`): `resolveMcpToken` unchanged signature; `listMcpTokens` now `WHERE kind = 'local'`.

- [ ] **Step 1: Write the cases** in `test-cases/14-mcp-server.md` under a new `## 14.2 Hosted MCP — storage` heading (block 14.200–14.209):

```markdown
- ❌ **14.200 — the migration adds five tables and three `mcp_tokens` columns, and every EXISTING token row reads `kind='local'`, `expires_at NULL`, `connection_id NULL`;** control: a device-flow token minted after the migration still authenticates `/v1/me/workspaces` with no expiry. Mutation: default `kind` to `'hosted'`.
- ❌ **14.201 — a hosted access token past `expires_at` is refused by `requireSession` (401), a live one resolves to its owner;** control: a LOCAL token with `expires_at NULL` resolves at any `now`. Mutation: drop the `expires_at` clause from `resolveMcpToken`.
- ❌ **14.202 — resolving a hosted token stamps its CONNECTION's `last_used`;** control: resolving a local token stamps only `mcp_tokens.last_used`. Mutation: remove the connection update.
- ❌ **14.203 — a code is single-use and dies after 60 s:** `takeCode` returns the row once, `null` the second time, and `null` at `now + 61 s`;** control: at `now + 59 s` the first take succeeds. Mutation: `SELECT` instead of `DELETE … RETURNING`.
- ❌ **14.204 — refresh rotation: `useRefreshToken` succeeds once; presenting the same token again returns `reused` AND deletes the connection with its access tokens;** control: a fresh refresh token issued by the first use still works. Mutation: skip the connection delete on reuse.
- ❌ **14.205 — a connection past `idle_expires_at` refuses refresh (`expired`) and is deleted; a successful refresh slides `idle_expires_at` to `now + 90 d`;** control: at `now + 89 d` refresh succeeds. Mutation: do not slide the window.
- ❌ **14.206 — `sweepStaleClients` deletes a 31-day-old client with no connection and no pending row, and keeps one with a live connection;** control: a 29-day-old unused client survives. Mutation: ignore connections in the sweep.
- ❌ **14.207 — nothing raw is stored:** after `mintCode` + `issueTokens`, no column of `oauth_codes`, `mcp_tokens` or `oauth_refresh_tokens` contains the raw code, access or refresh token;** control: each table holds `hashCredential(raw)`. Mutation: store the raw refresh token.
- ❌ **14.208 — `listMcpTokens` returns local tokens only; hosted access tokens never appear there;** control: a local token still lists with its name. Mutation: drop `WHERE kind = 'local'`.
- ❌ **14.209 — every new table has a purge rule (`not-entity-bearing`)** — the existing guard `table-rules.test.ts` fails without them;** control: the guard's count of ruled tables rises by exactly five. Mutation: remove `oauth_connections` from `table-rules.ts`.
```

- [ ] **Step 2: Write the failing test** `apps/server/test/mcp/oauth-store.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';
import { hashCredential, resolveMcpToken, listMcpTokens } from '../../src/mcp/token-store.js';
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
});
```

- [ ] **Step 3: Run to see it fail.** `cd apps/server && pnpm exec vitest run --no-file-parallelism test/mcp/oauth-store.test.ts > /tmp/t1.log 2>&1; tail -30 /tmp/t1.log` (never `| head` — `CLAUDE.md`). Expected: import error (`oauth-store.js` missing), then every case red.

- [ ] **Step 4: Write the migration** `apps/server/migrations/1790800000000_mcp-oauth.sql` (next free timestamp after `1790700000000_arm-reach-indexes.sql`; if a peer lands a later number first, renumber by MERGE order — memory `dev-stack-traps`):

```sql
-- Up Migration
-- Hosted MCP (spec 2026-09-30-remote-mcp-server-design.md, plan Task 1): five tables.
-- Additive: existing mcp_tokens rows become kind='local', expires_at NULL,
-- connection_id NULL — exactly the device-flow behaviour they have today.

CREATE TABLE oauth_clients (
  client_id       text PRIMARY KEY,
  client_name     text NOT NULL,
  redirect_uris   text[] NOT NULL,
  created_at      timestamptz NOT NULL
);

CREATE TABLE oauth_pending_authorizations (
  request_id      text PRIMARY KEY,
  client_id       text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  redirect_uri    text NOT NULL,
  state           text,
  code_challenge  text NOT NULL,
  created_at      timestamptz NOT NULL,
  expires_at      timestamptz NOT NULL
);

CREATE TABLE oauth_codes (
  code_hash       text PRIMARY KEY,
  client_id       text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  user_id         text NOT NULL,
  redirect_uri    text NOT NULL,
  code_challenge  text NOT NULL,
  created_at      timestamptz NOT NULL,
  expires_at      timestamptz NOT NULL
);

CREATE TABLE oauth_connections (
  id              text PRIMARY KEY,
  user_id         text NOT NULL,
  client_id       text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL,
  last_used       timestamptz,
  idle_expires_at timestamptz NOT NULL
);
CREATE INDEX oauth_connections_user_id_idx ON oauth_connections (user_id);

CREATE TABLE oauth_refresh_tokens (
  token_hash      text PRIMARY KEY,
  connection_id   text NOT NULL REFERENCES oauth_connections (id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL,
  used_at         timestamptz
);

ALTER TABLE mcp_tokens
  ADD COLUMN kind text NOT NULL DEFAULT 'local' CHECK (kind IN ('local', 'hosted')),
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN connection_id text REFERENCES oauth_connections (id) ON DELETE CASCADE;
CREATE INDEX mcp_tokens_connection_id_idx ON mcp_tokens (connection_id);

COMMENT ON TABLE oauth_connections IS 'One row per consent a person gave a hosted MCP client — the refresh FAMILY. Deleting it deletes its access (mcp_tokens) and refresh tokens. Server-owned, never a projection.';

-- Down Migration
ALTER TABLE mcp_tokens DROP COLUMN connection_id, DROP COLUMN expires_at, DROP COLUMN kind;
DROP TABLE oauth_refresh_tokens;
DROP TABLE oauth_connections;
DROP TABLE oauth_codes;
DROP TABLE oauth_pending_authorizations;
DROP TABLE oauth_clients;
```

- [ ] **Step 5: Implement `oauth-store.ts`** (the interfaces above). The load-bearing statements:

```ts
import { randomBytes } from 'node:crypto';
import type { Queryable } from '../db/queryable.js';
import { hashCredential } from './token-store.js';

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const CODE_TTL_MS = 60_000;
export const PENDING_TTL_MS = 10 * MIN;
export const ACCESS_TTL_SEC = 3600;
export const IDLE_TTL_MS = 90 * DAY;
export const STALE_CLIENT_MS = 30 * DAY;
const raw = () => randomBytes(32).toString('base64url');
const id = (prefix: string) => `${prefix}_${randomBytes(16).toString('base64url')}`;

export async function issueTokens(db: Queryable, connectionId: string, userId: string, now: Date) {
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

export async function useRefreshToken(db: Queryable, rawRefresh: string, now: Date) {
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
      `SELECT connection_id FROM oauth_refresh_tokens WHERE token_hash = $1`, [hash]);
    const row = seen.rows[0];
    if (row === undefined) return { status: 'unknown' as const };
    await db.query(`DELETE FROM oauth_connections WHERE id = $1`, [row.connection_id]);
    return { status: 'reused' as const };
  }
  const conn = await db.query<{ user_id: string; idle_expires_at: Date }>(
    `SELECT user_id, idle_expires_at FROM oauth_connections WHERE id = $1`, [winner.connection_id]);
  const c = conn.rows[0];
  if (c === undefined) return { status: 'unknown' as const };
  if (c.idle_expires_at <= now) {
    await db.query(`DELETE FROM oauth_connections WHERE id = $1`, [winner.connection_id]);
    return { status: 'expired' as const };
  }
  await db.query(`UPDATE oauth_connections SET idle_expires_at = $2 WHERE id = $1`,
    [winner.connection_id, new Date(now.getTime() + IDLE_TTL_MS)]);
  return { status: 'ok' as const, connectionId: winner.connection_id, userId: c.user_id };
}

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
```
Write the remaining functions (`registerClient` with `id('mcpc')`, `getClient`, `createPending` with `id('req')`, `getPending`/`takePending` (`DELETE … WHERE request_id=$1 AND expires_at > $2 RETURNING *`), `mintCode`/`takeCode`, `createConnection` with `id('conn')`, `revokeConnection` (`DELETE FROM oauth_connections WHERE id=$1 AND ($2::text IS NULL OR user_id=$2) RETURNING id`), `connectionForToken` (union of `mcp_tokens.connection_id` and `oauth_refresh_tokens.connection_id` by hash), `listConnections` (join `oauth_clients`, `WHERE user_id=$1 AND idle_expires_at > $2 ORDER BY created_at DESC`; `redirectHost = new URL(redirect_uris[0]).host`)) in the same shape.

- [ ] **Step 6: Change `token-store.ts`.** `resolveMcpToken` becomes one CTE so the common path stays one round trip:

```ts
const { rows } = await db.query<{ user_id: string }>(
  `WITH hit AS (
     UPDATE mcp_tokens SET last_used = $2
      WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > $2)
      RETURNING user_id, connection_id
   ), stamp AS (
     UPDATE oauth_connections SET last_used = $2
      WHERE id = (SELECT connection_id FROM hit) RETURNING id
   )
   SELECT user_id FROM hit`,
  [hashCredential(rawToken), now],
);
return rows[0]?.user_id ?? null;
```
`listMcpTokens`: add `AND kind = 'local'` to its `WHERE`. Amend its docblock (`prose is a claim`).

- [ ] **Step 7: Purge rules** — in `table-rules.ts` beside `mcp_tokens`:

```ts
  oauth_clients: { rule: 'not-entity-bearing', why: 'A registered assistant app (name + redirect URIs).' },
  oauth_pending_authorizations: { rule: 'not-entity-bearing', why: 'A consent in flight, ten minutes at most.' },
  oauth_codes: { rule: 'not-entity-bearing', why: 'A person’s one-minute authorization code.' },
  oauth_connections: { rule: 'not-entity-bearing', why: 'A person’s consent to an assistant app.' },
  oauth_refresh_tokens: { rule: 'not-entity-bearing', why: 'A person’s refresh token.' },
```


- [ ] **Step 8: Run to see it pass**, then the whole `apps/server` suite (`> /tmp/s.log 2>&1; tail -20`): `table-rules.test.ts`, `migrations.test.ts`, `test/mcp/*` (14.30–14.35 must stay green — the order test 14.35 is untouched because better-auth is still asked first).

- [ ] **Step 9: Catalogue.** Flip 14.200–14.209. Features.md §14, append:
```markdown
- ⚙️ **Hosted MCP credential store** (remote-MCP plan Task 1; `apps/server/src/mcp/oauth-store.ts`, migration `1790800000000_mcp-oauth.sql`) — registered clients, ten-minute pending consents, one-minute single-use codes, and `oauth_connections` (one row per consent: the refresh family, 90 days idle, sliding). Access tokens live in `mcp_tokens` as `kind='hosted'` with a one-hour `expires_at`; refresh tokens rotate and a reused one deletes the whole connection. Everything hashed at rest. Device-flow tokens are `kind='local'` and never expire, as before. Cases 14.200–14.209.
```

- [ ] **Step 10: Commit** `git add apps/server test-cases Features.md && git commit -m "Remote MCP 1: OAuth storage, hosted token expiry (14.200-14.209)"`.

---

### Task 2: Configuration switch, metadata and client registration

**Files:**
- Modify: `apps/server/src/config.ts` (`MCP_PUBLIC_URL: httpUrl().optional()`, surfaced as `mcpPublicUrl: string | null`), `apps/server/src/index.ts` (pass it), `apps/server/src/app.ts` (`AppDeps.mcpPublicUrl?: string | null`; register `registerMcpOAuthRoutes` only when set)
- Create: `apps/server/src/routes/mcp-oauth.ts` (this task: metadata + `POST /oauth/register`)
- Modify: `apps/server/src/app.ts` rate-limit hook (`/oauth/register` charged to the existing `mcpLimiter`, beside `/v1/mcp/device/*` at `:664-671`)
- Create: `apps/server/test/helpers/oauth.ts`
- Test: `apps/server/test/mcp/oauth-metadata.test.ts`

**Interfaces:**
- Consumes: Task 1 `registerClient`, `sweepStaleClients`.
- Produces: `registerMcpOAuthRoutes(app, deps: { pool; webOrigin: string; publicUrl: string; now?: () => Date }, requireSession)`; constants `OAUTH_SCOPE = 'gisik:act'`, `ISSUER(publicUrl)`; test helper `buildOAuthApp(db)` = `buildTestApp(db, { mcpPublicUrl: 'https://api.test' })` and `pkcePair()`.

`apps/server/test/helpers/oauth.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto';
import type { TestDatabase } from './db.js';
import { buildTestApp } from './app.js';
export const PUBLIC_URL = 'https://api.test';
export function buildOAuthApp(db: TestDatabase) { return buildTestApp(db, { mcpPublicUrl: PUBLIC_URL }); }
export function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
```
(`BuildTestAppOverrides` gains `mcpPublicUrl?: string` and passes it into `buildApp`'s deps.)

- [ ] **Step 1: Write the cases** (`## 14.3 Hosted MCP — metadata and registration`, 14.210–14.219):

```markdown
- ❌ **14.210 — with `MCP_PUBLIC_URL` unset, `/mcp`, `/oauth/register` and `/.well-known/oauth-authorization-server` are 404 (the hosted door does not exist);** control: set, the metadata answers 200. Mutation: register the plugin unconditionally.
- ❌ **14.211 — `GET /.well-known/oauth-authorization-server` lists issuer = `MCP_PUBLIC_URL`, the authorize/token/register/revoke endpoints under it, `code_challenge_methods_supported: ["S256"]`, `grant_types_supported: ["authorization_code","refresh_token"]`, `token_endpoint_auth_methods_supported: ["none"]`, `response_types_supported: ["code"]`, `scopes_supported: ["gisik:act"]`;** control: no `plain` anywhere in the document. Mutation: add `"plain"` to the challenge methods.
- ❌ **14.212 — protected-resource metadata is served at BOTH `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`, naming `resource: <public>/mcp` and `authorization_servers: [<public>]`;** control: the two documents are identical. Mutation: serve only the root one.
- ❌ **14.213 — `POST /oauth/register` with `redirect_uris: ["https://claude.ai/api/mcp/auth_callback"]` and `client_name: "Claude"` answers 201 with a `client_id`, `token_endpoint_auth_method: "none"`, and NO `client_secret`;** control: the stored row carries the name and the exact URI. Mutation: return a client secret.
- ❌ **14.214 — registration refuses a non-https, non-loopback redirect (`http://evil.example/cb`) with 400 `invalid_redirect_uri`;** control: `http://127.0.0.1:33418/callback` and `http://localhost:6274/cb` are accepted. Mutation: accept any `http:` URI.
- ❌ **14.215 — registration refuses a redirect with a fragment or userinfo (`https://a.example/cb#x`, `https://u:p@a.example/cb`) and an empty `redirect_uris`;** control: a query string is allowed (`https://chatgpt.com/cb?x=1`). Mutation: drop the fragment check.
- ❌ **14.216 — registration is charged to the MCP rate-limit bucket: the (mcpMax+1)-th registration from one client key in a window answers 429;** control: a different client key still registers. Mutation: remove `/oauth/register` from the bucket.
- ❌ **14.217 — `client_name` is trimmed to 60 characters and a missing name stores the redirect host;** control: a 20-character name is stored as given. Mutation: store the raw 500-character name.
- ❌ **14.218 — registering sweeps stale clients (Task 1's rule) — a 31-day-old unused client is gone after the next registration;** control: the new client exists. Mutation: never call the sweep.
- ❌ **14.219 — a hosted-door request never reaches better-auth's catch-all: `/oauth/token` and `/.well-known/*` are their own routes, not `/api/auth/*`;** control: `/api/auth/get-session` still answers. Mutation: mount the routes under `/api/auth`.
```

- [ ] **Step 2: Write the failing test** `apps/server/test/mcp/oauth-metadata.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';
import { buildOAuthApp, PUBLIC_URL } from '../helpers/oauth.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

const reg = (app: Awaited<ReturnType<typeof buildOAuthApp>>['app'], body: unknown, xff = '203.0.113.9') =>
  app.inject({ method: 'POST', url: '/oauth/register', headers: { 'x-forwarded-for': xff }, payload: body });

describe('hosted MCP metadata and registration', () => {
  it('14.210 the hosted door is off without MCP_PUBLIC_URL', async () => {
    const off = buildTestApp(db).app;
    for (const url of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource']) {
      expect((await off.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
    expect((await off.inject({ method: 'POST', url: '/mcp', payload: {} })).statusCode).toBe(404);
    const on = buildOAuthApp(db).app; // CONTROL
    expect((await on.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' })).statusCode).toBe(200);
  });

  it('14.211 authorization-server metadata', async () => {
    const { app } = buildOAuthApp(db);
    const doc = (await app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' })).json();
    expect(doc).toMatchObject({
      issuer: PUBLIC_URL,
      authorization_endpoint: `${PUBLIC_URL}/oauth/authorize`,
      token_endpoint: `${PUBLIC_URL}/oauth/token`,
      registration_endpoint: `${PUBLIC_URL}/oauth/register`,
      revocation_endpoint: `${PUBLIC_URL}/oauth/revoke`,
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      response_types_supported: ['code'],
      scopes_supported: ['gisik:act'],
    });
    expect(JSON.stringify(doc)).not.toContain('plain');
  });

  it('14.212 protected-resource metadata at both paths', async () => {
    const { app } = buildOAuthApp(db);
    const a = (await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource' })).json();
    const b = (await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource/mcp' })).json();
    expect(a).toEqual({ resource: `${PUBLIC_URL}/mcp`, authorization_servers: [PUBLIC_URL], scopes_supported: ['gisik:act'], bearer_methods_supported: ['header'] });
    expect(b).toEqual(a);
  });

  it('14.213 a public client registers with no secret', async () => {
    const { app } = buildOAuthApp(db);
    const res = await reg(app, { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.client_id).toMatch(/^mcpc_/);
    expect(body.token_endpoint_auth_method).toBe('none');
    expect(body).not.toHaveProperty('client_secret');
    const row = await db.pool.query(`SELECT client_name, redirect_uris FROM oauth_clients WHERE client_id = $1`, [body.client_id]);
    expect(row.rows[0]).toEqual({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
  });

  it('14.214 https or loopback redirects only', async () => {
    const { app } = buildOAuthApp(db);
    const bad = await reg(app, { client_name: 'x', redirect_uris: ['http://evil.example/cb'] });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'invalid_redirect_uri' });
    for (const ok of ['http://127.0.0.1:33418/callback', 'http://localhost:6274/cb']) { // CONTROL
      expect((await reg(app, { client_name: 'x', redirect_uris: [ok] })).statusCode, ok).toBe(201);
    }
  });

  it('14.215 fragments, userinfo and empty lists refused; queries allowed', async () => {
    const { app } = buildOAuthApp(db);
    for (const uris of [['https://a.example/cb#x'], ['https://u:p@a.example/cb'], []]) {
      expect((await reg(app, { client_name: 'x', redirect_uris: uris })).statusCode, JSON.stringify(uris)).toBe(400);
    }
    expect((await reg(app, { client_name: 'x', redirect_uris: ['https://chatgpt.com/cb?x=1'] })).statusCode).toBe(201);
  });
});
```
Cases 14.216–14.219 follow the same shape in this file: 14.216 builds the app with `security: { rateLimit: { …, mcpMax: 2 } }` and registers three times from `x-forwarded-for: 198.51.100.1` (third → 429), then once from `198.51.100.2` (201); 14.217 posts a 500-char name and no name; 14.218 inserts an `oauth_clients` row dated 31 days ago, registers, and asserts it is gone; 14.219 asserts `/api/auth/get-session` answers (not 404) and that `app.printRoutes()` lists `/oauth/token` outside the `/api/auth/*` mount.

- [ ] **Step 3: Run to see it fail.**

- [ ] **Step 4: Implement.** In `mcp-oauth.ts`:

```ts
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import { registerClient, sweepStaleClients } from '../mcp/oauth-store.js';

export const OAUTH_SCOPE = 'gisik:act';

export function isAllowedRedirect(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.hash !== '' || u.username !== '' || u.password !== '') return false;
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
}

export function registerMcpOAuthRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable; webOrigin: string; publicUrl: string; now?: () => Date },
  requireSession: preHandlerHookHandler,
): void {
  const now = deps.now ?? (() => new Date());
  const issuer = deps.publicUrl.replace(/\/$/, '');
  const asMetadata = {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [OAUTH_SCOPE],
  };
  const prMetadata = { resource: `${issuer}/mcp`, authorization_servers: [issuer], scopes_supported: [OAUTH_SCOPE], bearer_methods_supported: ['header'] };
  app.get('/.well-known/oauth-authorization-server', async () => asMetadata);
  app.get('/.well-known/oauth-protected-resource', async () => prMetadata);
  app.get('/.well-known/oauth-protected-resource/mcp', async () => prMetadata);

  app.post('/oauth/register', async (request, reply) => {
    const body = (request.body ?? {}) as { client_name?: unknown; redirect_uris?: unknown };
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
    if (uris.length === 0 || uris.length !== (body.redirect_uris as unknown[]).length || !uris.every(isAllowedRedirect)) {
      return reply.code(400).send({ error: 'invalid_redirect_uri' });
    }
    const named = typeof body.client_name === 'string' && body.client_name.trim() !== ''
      ? body.client_name.trim().slice(0, 60) : new URL(uris[0]!).host;
    const at = now();
    await sweepStaleClients(deps.pool, at);
    const { clientId } = await registerClient(deps.pool, { clientName: named, redirectUris: uris }, at);
    return reply.code(201).send({
      client_id: clientId, client_name: named, redirect_uris: uris,
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    });
  });
  // Task 3 adds authorize + the decision API; Task 5 adds token + revoke — in this same function.
}
```
Register in `app.ts` next to `registerMcpTokenRoutes` (`:1009`): `if (deps.mcpPublicUrl) registerMcpOAuthRoutes(app, { pool: deps.pool, webOrigin: deps.webOrigin, publicUrl: deps.mcpPublicUrl }, requireSession);`. Add `routeUrl === '/oauth/register'` to the `mcpLimiter` condition at `:664-666`.

- [ ] **Step 5: Run to see it pass**; whole `apps/server` suite; `config.test.ts` (add one assertion: `MCP_PUBLIC_URL` optional, rejects a non-URL).

- [ ] **Step 6: Catalogue.** Flip 14.210–14.219. Features.md §14:
```markdown
- ⚙️ **The hosted MCP door's switch, metadata and client registration** (remote-MCP plan Task 2; `apps/server/src/routes/mcp-oauth.ts`) — present only when `MCP_PUBLIC_URL` is set (production: `https://pm-api.artsourced.in`); RFC 8414 authorization-server metadata and RFC 9728 protected-resource metadata (root and `/mcp`-suffixed); `POST /oauth/register` registers PUBLIC clients (no secret), redirect URIs https or loopback only, no fragment/userinfo, rate-limited in the MCP bucket, stale unused clients swept. Cases 14.210–14.219.
```

- [ ] **Step 7: Commit.**

---

### Task 3: Authorize, the pending consent, and the decision API

**Files:**
- Modify: `apps/server/src/routes/mcp-oauth.ts` (`GET /oauth/authorize`, `GET /v1/mcp/oauth/requests/:requestId`, `POST /v1/mcp/oauth/requests/:requestId/decision`)
- Modify: `apps/server/src/http/http-origin.ts` (`HTTP_ORIGIN_PROTECTED_ROUTES` gains `'/v1/mcp/oauth/requests/:requestId/decision'`)
- Test: `apps/server/test/mcp/oauth-authorize.test.ts`

**Interfaces:**
- Consumes: Task 1 `getClient`, `createPending`, `getPending`, `takePending`, `mintCode`; Task 2 `isAllowedRedirect`, `OAUTH_SCOPE`, helpers.
- Produces:
  - `GET /oauth/authorize?response_type=code&client_id&redirect_uri&code_challenge&code_challenge_method=S256&state&scope` → **302** `Location: ${webOrigin}/mcp/connect?request=<requestId>`; invalid client or redirect → **400** JSON `{ error, message }` (NEVER a redirect); other invalid params with a valid redirect → **302** to `redirect_uri?error=invalid_request&state=…`.
  - `GET /v1/mcp/oauth/requests/:requestId` (requireSession) → `{ clientName, redirectHost, requestId }` or 404 `{ error: 'unknown_request' }`.
  - `POST /v1/mcp/oauth/requests/:requestId/decision` body `{ allow: boolean }` (requireSession; cookie callers Origin-checked; `authKind==='mcp-token'` → 403) → `{ redirectTo: string }`; already answered/expired → 409 `{ error: 'already_answered', message: 'This request has already been answered. Go back to your assistant and connect again.' }`.

- [ ] **Step 1: Write the cases** (`## 14.4 Hosted MCP — authorize and consent API`, 14.220–14.229):

```markdown
- ❌ **14.220 — a valid authorize request 302s to `${WEB_ORIGIN}/mcp/connect?request=req_…` and stores a pending row with the challenge, redirect and state;** control: the pending row expires 10 minutes after `now`. Mutation: redirect to the API's own host.
- ❌ **14.221 — PKCE is required: `code_challenge_method=plain` and a missing `code_challenge` are refused (302 to the client with `error=invalid_request`), no pending row;** control: `S256` with a 43-char challenge is accepted. Mutation: accept `plain`.
- ❌ **14.222 — the redirect must equal a registered one EXACTLY: a trailing slash, a different case in the path, or an extra query parameter is refused with a 400 JSON error and NO redirect;** control: the exact string is accepted. Mutation: compare after `new URL().href` normalisation. *(Review Focus 4)*
- ❌ **14.223 — an unknown `client_id` is a 400 JSON error, never a redirect;** control: a known client proceeds. Mutation: redirect to the supplied `redirect_uri` on an unknown client.
- ❌ **14.224 — `GET /v1/mcp/oauth/requests/:id` returns the client's name AND the redirect host (`claude.ai`) to the signed-in person, 401 signed out, 404 for an expired request;** control: a live request answers 200. Mutation: omit `redirectHost`.
- ❌ **14.225 — Allow mints a code for the SIGNED-IN person and answers `redirectTo = <redirect_uri>?code=…&state=<state>`; Deny answers `redirectTo = <redirect_uri>?error=access_denied&state=<state>` and mints nothing;** control: a redirect that already has a query keeps it (`…cb?x=1&code=…`). Mutation: drop `state`.
- ❌ **14.226 — a request is answered once: a second decision (either way) is 409 `already_answered`, and no second code exists;** control: the first decision was 200. Mutation: read the pending row with `getPending` instead of `takePending`. *(Review Focus 1)*
- ❌ **14.227 — the decision refuses a cookie POST whose `Origin` is not `WEB_ORIGIN` (403 via the HTTP-Origin hook);** control: the same POST with `Origin: WEB_ORIGIN` succeeds. Mutation: remove the route from `HTTP_ORIGIN_PROTECTED_ROUTES`.
- ❌ **14.228 — an MCP token (local or hosted) cannot decide a consent (403 `mcp_token_may_not_decide`);** control: a better-auth session can. Mutation: drop the `authKind` fence.
- ❌ **14.229 — `response_type` other than `code` and a `scope` other than `gisik:act` (or absent → defaulted) are handled: `token` → `error=unsupported_response_type`; `admin` → `error=invalid_scope`;** control: an absent scope is accepted as `gisik:act`. Mutation: accept any scope.
```

- [ ] **Step 2: Write the failing test** `apps/server/test/mcp/oauth-authorize.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { buildOAuthApp, pkcePair } from '../helpers/oauth.js';
import { TEST_WEB_ORIGIN } from '../helpers/app.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

type App = ReturnType<typeof buildOAuthApp>['app'];
const CB = 'https://claude.ai/api/mcp/auth_callback';

async function client(app: App, uris = [CB]) {
  return (await app.inject({ method: 'POST', url: '/oauth/register', payload: { client_name: 'Claude', redirect_uris: uris } })).json().client_id as string;
}
function authorizeUrl(q: Record<string, string>) {
  return `/oauth/authorize?${new URLSearchParams({ response_type: 'code', code_challenge_method: 'S256', scope: 'gisik:act', ...q })}`;
}

describe('authorize and the consent API', () => {
  it('14.220 a valid request goes to the web consent page', async () => {
    const { app } = buildOAuthApp(db);
    const id = await client(app);
    const { challenge } = pkcePair();
    const res = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, redirect_uri: CB, code_challenge: challenge, state: 'st1' }) });
    expect(res.statusCode).toBe(302);
    const loc = new URL(res.headers.location as string);
    expect(`${loc.origin}${loc.pathname}`).toBe(`${TEST_WEB_ORIGIN}/mcp/connect`);
    const requestId = loc.searchParams.get('request')!;
    const row = await db.pool.query(`SELECT redirect_uri, state, code_challenge, expires_at - created_at AS ttl FROM oauth_pending_authorizations WHERE request_id = $1`, [requestId]);
    expect(row.rows[0]).toMatchObject({ redirect_uri: CB, state: 'st1', code_challenge: challenge });
    expect(String(row.rows[0].ttl)).toMatch(/00:10:00|10 mins/); // CONTROL
  });

  it('14.222 exact redirect match; a near-miss gets a JSON 400 and no redirect', async () => {
    const { app } = buildOAuthApp(db);
    const id = await client(app);
    const { challenge } = pkcePair();
    for (const near of [`${CB}/`, CB.replace('auth_callback', 'Auth_Callback'), `${CB}?extra=1`]) {
      const res = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, redirect_uri: near, code_challenge: challenge }) });
      expect(res.statusCode, near).toBe(400);
      expect(res.headers.location, near).toBeUndefined();
    }
    const ok = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, redirect_uri: CB, code_challenge: challenge }) });
    expect(ok.statusCode).toBe(302); // CONTROL
  });

  it('14.225 + 14.226 allow mints a code once; the second decision is 409', async () => {
    const { app, otp } = buildOAuthApp(db);
    const u = await signInWithPhone(app, otp, '+911100002225');
    const id = await client(app, [`${CB}?x=1`]);
    const { challenge } = pkcePair();
    const res = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, redirect_uri: `${CB}?x=1`, code_challenge: challenge, state: 's9' }) });
    const requestId = new URL(res.headers.location as string).searchParams.get('request')!;
    const decide = (allow: boolean) => app.inject({
      method: 'POST', url: `/v1/mcp/oauth/requests/${requestId}/decision`,
      headers: { authorization: `Bearer ${u.token}` }, payload: { allow },
    });
    const first = await decide(true);
    expect(first.statusCode).toBe(200);
    const to = new URL(first.json().redirectTo);
    expect(to.searchParams.get('x')).toBe('1'); // CONTROL — existing query kept
    expect(to.searchParams.get('state')).toBe('s9');
    expect(to.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const again = await decide(false);
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('already_answered');
    expect((await db.pool.query(`SELECT count(*)::int n FROM oauth_codes WHERE user_id = $1`, [u.userId])).rows[0].n).toBe(1);
  });
});
```
Write 14.221, 14.223, 14.224, 14.227 (build with `security: { webOrigin: TEST_WEB_ORIGIN, … }` and send `cookie` + a foreign `origin` — mirror `test/http/security-middleware.test.ts`'s device-approve case), 14.228 (mint a local token via the device flow helper from `require-session-pat.test.ts:21-31`, then decide with it → 403) and 14.229 in the same file.

- [ ] **Step 3: Run to see it fail.**

- [ ] **Step 4: Implement** in `mcp-oauth.ts` (inside `registerMcpOAuthRoutes`):

```ts
  const withQuery = (base: string, add: Record<string, string>) => {
    const u = new URL(base);
    for (const [k, v] of Object.entries(add)) u.searchParams.set(k, v);
    return u.toString();
  };

  app.get('/oauth/authorize', async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const client = q.client_id ? await getClient(deps.pool, q.client_id) : null;
    if (client === null) return reply.code(400).send({ error: 'invalid_client', message: 'Unknown assistant app. Go back and connect again.' });
    // EXACT string equality (Review Focus 4) — never URL-normalised.
    if (!q.redirect_uri || !client.redirectUris.includes(q.redirect_uri)) {
      return reply.code(400).send({ error: 'invalid_redirect_uri', message: 'This assistant app sent an address it did not register.' });
    }
    const back = (error: string) => reply.redirect(withQuery(q.redirect_uri!, { error, ...(q.state ? { state: q.state } : {}) }), 302);
    if (q.response_type !== 'code') return back('unsupported_response_type');
    if (q.scope !== undefined && q.scope !== OAUTH_SCOPE) return back('invalid_scope');
    if (q.code_challenge_method !== 'S256' || !q.code_challenge || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge)) return back('invalid_request');
    const { requestId } = await createPending(deps.pool, {
      clientId: client.clientId, redirectUri: q.redirect_uri, state: q.state ?? null, codeChallenge: q.code_challenge,
    }, now());
    return reply.redirect(`${deps.webOrigin}/mcp/connect?request=${encodeURIComponent(requestId)}`, 302);
  });

  app.get<{ Params: { requestId: string } }>('/v1/mcp/oauth/requests/:requestId', { preHandler: requireSession }, async (request, reply) => {
    const p = await getPending(deps.pool, request.params.requestId, now());
    if (p === null) return reply.code(404).send({ error: 'unknown_request' });
    const client = await getClient(deps.pool, p.clientId);
    return { requestId: p.requestId, clientName: client?.clientName ?? 'An assistant app', redirectHost: new URL(p.redirectUri).host };
  });

  app.post<{ Params: { requestId: string }; Body: { allow?: unknown } }>(
    '/v1/mcp/oauth/requests/:requestId/decision',
    { preHandler: requireSession },
    async (request, reply) => {
      if (request.authKind === 'mcp-token') return reply.code(403).send({ error: 'mcp_token_may_not_decide' });
      if (typeof request.body?.allow !== 'boolean') return reply.code(400).send({ error: 'invalid' });
      const p = await takePending(deps.pool, request.params.requestId, now()); // single-use (Review Focus 1)
      if (p === null) return reply.code(409).send({ error: 'already_answered', message: 'This request has already been answered. Go back to your assistant and connect again.' });
      const state = p.state === null ? {} : { state: p.state };
      if (!request.body.allow) return { redirectTo: withQuery(p.redirectUri, { error: 'access_denied', ...state }) };
      const code = await mintCode(deps.pool, { clientId: p.clientId, userId: request.currentUserId, redirectUri: p.redirectUri, codeChallenge: p.codeChallenge }, now());
      return { redirectTo: withQuery(p.redirectUri, { code, ...state }) };
    },
  );
```
Add the decision route to `HTTP_ORIGIN_PROTECTED_ROUTES` with a one-line comment (`// hosted MCP consent decision — a cookie POST from the web host (remote-MCP plan Task 3)`).

- [ ] **Step 5: Run to see it pass**; `test/http/*` must stay green.

- [ ] **Step 6: Catalogue.** Flip 14.220–14.229. Features.md §14:
```markdown
- ⚙️ **Hosted MCP authorize and consent API** (remote-MCP plan Task 3) — `GET /oauth/authorize` validates client, EXACT redirect and PKCE S256, stores a ten-minute pending consent and sends the browser to the web page `/mcp/connect`; an unknown client or unregistered redirect is a JSON 400, never a redirect. `GET/POST /v1/mcp/oauth/requests/:id(/decision)` show the app name + redirect host and record Allow/Deny once (409 after), Origin-checked, refused to MCP tokens. Cases 14.220–14.229.
```

- [ ] **Step 7: Commit.**

---

### Task 4: The web consent page `/mcp/connect`

**Files:**
- Create: `apps/web/app/mcp/connect/page.tsx`, `apps/web/app/mcp/connect/layout.tsx` (server `layout.tsx` sets `metadata.title = 'Connect an assistant'` — memory `ui-and-dom-traps`: titles live in server layouts)
- Test: `apps/web/test/mcp-connect-page.test.tsx`; `apps/web/test/next-config.test.ts` (one added assertion)

**Interfaces:**
- Consumes: Task 3 routes (via `/v1/*` same-origin rewrite); `useSessionStatus` (`apps/web/src/providers.js`, as `app/mcp/authorize/page.tsx` imports it); `createHttpClient` from `@gisik-nokma/app-core/online`; `Button`, `Card` from `@gisik-nokma/ui` (the styling refresh's shared Button — Allow is the ONE primary, Deny the quiet ghost).
- Produces: the page; copy strings used by Task 9's manual (`Connect an assistant`, `Allow`, `Deny`).

Consent copy, verbatim (spec §4), `{name}` and `{host}` from the API:
> **{name}** ({host}) wants to use Gisik Nokma as **you**.
> It will be able to see and change everything you can — read tickets, create them, move them, comment and assign — in all your workspaces.
> You can disconnect it any time from Account → Connected assistants.

- [ ] **Step 1: Write the cases** (`## 14.5 Hosted MCP — the consent page`, 14.230–14.236):

```markdown
- ❌ **14.230 — signed out, `/mcp/connect?request=req_x` shows a Sign in link to `/sign-in?next=%2Fmcp%2Fconnect%3Frequest%3Dreq_x` and no Allow button;** control: signed in, Allow appears. Mutation: link to `/sign-in` without `next`.
- ❌ **14.231 — signed in, the page shows the consent copy verbatim with the app name AND the redirect host from the API;** control: a different name/host pair renders its own values. Mutation: drop the host.
- ❌ **14.232 — Allow POSTs `{ allow: true }` to the decision route and navigates to the returned `redirectTo` (`window.location.assign`);** control: the button is disabled while the POST is in flight (no double submit). Mutation: navigate before the POST resolves.
- ❌ **14.233 — Deny POSTs `{ allow: false }` and navigates to the returned `redirectTo`;** control: Allow is not called. Mutation: Deny posts `allow: true`.
- ❌ **14.234 — a 404 request shows "This connection request has expired. Go back to your assistant and connect again." and no buttons; a 409 shows the server's message verbatim;** control: a live request shows buttons. Mutation: render the buttons on 404.
- ❌ **14.235 — Allow is the page's ONE primary button; Deny is the quiet (ghost) Button;** control: both are real `<button>`s with accessible names "Allow" and "Deny". Mutation: make Deny primary.
- ❌ **14.236 — the page is not frameable: `next.config.ts` headers for `/:path*` (which covers `/mcp/connect`) include `x-frame-options: DENY` (FD4);** control: the pattern matches `/mcp/connect?request=x`. Mutation: scope the header to `/workspaces/:path*`.
```

- [ ] **Step 2: Write the failing test** `apps/web/test/mcp-connect-page.test.tsx` — copy the harness of `apps/web/test/mcp-authorize-page.test.tsx` if present (else `mcp-tokens-page.test.tsx`): mock `next/navigation`'s `useSearchParams` to return `request=req_x`, mock `useSessionStatus`, stub `global.fetch`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('request=req_x') }));
const session = { status: 'signed-in' as 'signed-in' | 'signed-out' };
vi.mock('../src/providers.js', () => ({ useSessionStatus: () => session.status }));

import ConnectPage from '../app/mcp/connect/page.js';

const assign = vi.fn();
beforeEach(() => {
  assign.mockReset();
  Object.defineProperty(window, 'location', { value: { assign }, writable: true });
});

function stubFetch(details: { status: number; body: unknown }, decision?: { status: number; body: unknown }) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const r = url.endsWith('/decision') ? decision! : details;
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

describe('the consent page', () => {
  it('14.230 signed out: sign-in link carries next back here, no Allow', async () => {
    session.status = 'signed-out';
    stubFetch({ status: 401, body: {} });
    render(<ConnectPage />);
    const link = await screen.findByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe('/sign-in?next=%2Fmcp%2Fconnect%3Frequest%3Dreq_x');
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
  });

  it('14.231 + 14.232 consent copy verbatim; Allow posts and navigates', async () => {
    session.status = 'signed-in';
    stubFetch({ status: 200, body: { requestId: 'req_x', clientName: 'Claude', redirectHost: 'claude.ai' } },
              { status: 200, body: { redirectTo: 'https://claude.ai/cb?code=abc&state=s' } });
    render(<ConnectPage />);
    expect(await screen.findByText(/wants to use Gisik Nokma as/)).toBeTruthy();
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('(claude.ai)', { exact: false })).toBeTruthy();
    expect(screen.getByText(/read tickets, create them, move them, comment and assign — in all your workspaces\./)).toBeTruthy();
    expect(screen.getByText(/You can disconnect it any time from Account → Connected assistants\./)).toBeTruthy();
    const allow = screen.getByRole('button', { name: 'Allow' });
    fireEvent.click(allow);
    expect((allow as HTMLButtonElement).disabled).toBe(true); // CONTROL — no double submit
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/cb?code=abc&state=s'));
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([u]) => String(u).endsWith('/decision'))!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ allow: true });
  });
});
```
14.233–14.235 follow in the same file; 14.236 is one assertion added to `apps/web/test/next-config.test.ts` reading the `headers()` result for source `/:path*`.

- [ ] **Step 3: Run to see it fail** (`cd apps/web && pnpm exec vitest run test/mcp-connect-page.test.tsx > /tmp/t4.log 2>&1; tail -30 /tmp/t4.log`).

- [ ] **Step 4: Implement** `page.tsx` (client component wrapped in `Suspense` exactly like `app/mcp/authorize/page.tsx` does for `useSearchParams`): fetch `/v1/mcp/oauth/requests/${request}` on mount when signed in; states `loading | expired (404) | refused (409 → server message) | ready`; Allow/Deny call `http.post(\`/v1/mcp/oauth/requests/${request}/decision\`, { allow })`, set `busy`, then `window.location.assign(redirectTo)`. Signed out: `<Link href={\`/sign-in?next=${encodeURIComponent(\`/mcp/connect?request=${request}\`)}\`}>Sign in</Link>` — `samePathOnly` in `app/sign-in/page.tsx:99-103` accepts it (one leading `/`, keeps the query).

- [ ] **Step 5: Run to see it pass**; the whole `apps/web` suite.

- [ ] **Step 6: Catalogue.** Flip 14.230–14.236. Features.md §14:
```markdown
- ✅ **Connecting an assistant app — the consent page** (remote-MCP plan Task 4; `apps/web/app/mcp/connect/page.tsx`) — the browser lands on `pm.artsourced.in/mcp/connect`; signed out, the usual sign-in returns here; signed in, the app's name AND its web address, what it will be able to do in plain words, one **Allow** and a quiet **Deny**; an expired request says so. Not frameable (`x-frame-options: DENY`). Cases 14.230–14.236.
```

- [ ] **Step 7: Commit.**

---

### Task 5: The token endpoint and revocation

**Files:**
- Create: `apps/server/src/mcp/pkce.ts`
- Modify: `apps/server/src/routes/mcp-oauth.ts` (`POST /oauth/token`, `POST /oauth/revoke`; an `application/x-www-form-urlencoded` content-type parser scoped to these two routes' plugin scope)
- Modify: `apps/server/src/app.ts` rate-limit hook (`/oauth/token`, `/oauth/revoke` into `mcpLimiter`)
- Test: `apps/server/test/mcp/oauth-token.test.ts`

**Interfaces:**
- Consumes: Task 1 `takeCode`, `createConnection`, `issueTokens`, `useRefreshToken`, `revokeConnection`, `connectionForToken`; Task 3 flow; helpers.
- Produces: `verifyPkceS256(verifier: string, challenge: string): boolean`; `POST /oauth/token` (form or JSON) → `{ access_token, token_type: 'Bearer', expires_in: 3600, refresh_token, scope: 'gisik:act' }` or RFC 6749 errors (`400 { error: 'invalid_grant' | 'invalid_request' | 'unsupported_grant_type' }`) with `cache-control: no-store`; `POST /oauth/revoke` → 200 always (RFC 7009).

- [ ] **Step 1: Write the cases** (`## 14.6 Hosted MCP — tokens and revocation`, 14.240–14.249):

```markdown
- ❌ **14.240 — `authorization_code` with the right verifier, client and redirect returns an access + refresh token (`expires_in: 3600`, `token_type: "Bearer"`, `scope: "gisik:act"`, `cache-control: no-store`), and the access token authenticates `GET /v1/me/workspaces` as the consenting person;** control: the response has no `id_token`. Mutation: return `expires_in: 86400`.
- ❌ **14.241 — a wrong `code_verifier` is `invalid_grant` and the code is burnt (a retry with the right verifier also fails);** control: the right verifier on a fresh code succeeds. Mutation: skip `verifyPkceS256`.
- ❌ **14.242 — the code is bound to its client and redirect: another client's id, or a different registered redirect, is `invalid_grant`;** control: the matching pair succeeds. Mutation: ignore `redirect_uri` at the token endpoint.
- ❌ **14.243 — the code is single-use: a second exchange is `invalid_grant`;** control: the first exchange succeeded. Mutation: `getCode` instead of `takeCode`.
- ❌ **14.244 — `refresh_token` returns a NEW access + refresh token, and the old refresh token is dead;** control: the new access token authenticates. Mutation: return the same refresh token.
- ❌ **14.245 — presenting a used refresh token revokes the whole connection: its latest access token stops authenticating (401) and its latest refresh token is refused;** control: another connection of the same person is untouched. Mutation: skip the family revoke.
- ❌ **14.246 — two concurrent refreshes with the same token: exactly one succeeds; the other is treated as reuse and the connection is gone;** control: a single refresh succeeds. Mutation: a read-then-write refresh (SELECT used_at, then UPDATE). *(Review Focus 2)*
- ❌ **14.247 — a pending consent and a minted code survive an app restart (a second `buildOAuthApp` on the same database completes the exchange);** control: the same exchange on the first app also works. Mutation: keep pending rows in a `Map`. *(Review Focus 5)*
- ❌ **14.248 — `/oauth/revoke` with an access OR refresh token deletes the connection (both stop working) and answers 200; an unknown token also answers 200;** control: a different connection keeps working. Mutation: revoke only the presented access token.
- ❌ **14.249 — the token endpoint accepts `application/x-www-form-urlencoded` (what OAuth clients send) and JSON; an unknown `grant_type` is `unsupported_grant_type`;** control: the same exchange in both encodings yields a token. Mutation: accept JSON only.
```

- [ ] **Step 2: Write the failing test** `apps/server/test/mcp/oauth-token.test.ts`. A local helper `consent(app, user, opts)` runs register → authorize → decision(allow) and returns `{ clientId, code, verifier, redirectUri }`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { buildOAuthApp, pkcePair } from '../helpers/oauth.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

type App = ReturnType<typeof buildOAuthApp>['app'];
const CB = 'https://chatgpt.com/connector_platform_oauth_redirect';

async function consent(app: App, bearer: string) {
  const clientId = (await app.inject({ method: 'POST', url: '/oauth/register', payload: { client_name: 'ChatGPT', redirect_uris: [CB] } })).json().client_id as string;
  const { verifier, challenge } = pkcePair();
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: CB, code_challenge: challenge, code_challenge_method: 'S256', state: 'z' });
  const loc = (await app.inject({ method: 'GET', url: `/oauth/authorize?${q}` })).headers.location as string;
  const requestId = new URL(loc).searchParams.get('request')!;
  const to = (await app.inject({ method: 'POST', url: `/v1/mcp/oauth/requests/${requestId}/decision`, headers: { authorization: `Bearer ${bearer}` }, payload: { allow: true } })).json().redirectTo as string;
  return { clientId, verifier, code: new URL(to).searchParams.get('code')! };
}
const form = (o: Record<string, string>) => ({ headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(o).toString() });

describe('token endpoint and revocation', () => {
  it('14.240 code + verifier → tokens that authenticate as the person', async () => {
    const { app, otp } = buildOAuthApp(db);
    const u = await signInWithPhone(app, otp, '+911100002240');
    const c = await consent(app, u.token);
    const res = await app.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'authorization_code', code: c.code, code_verifier: c.verifier, client_id: c.clientId, redirect_uri: CB }) });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const t = res.json();
    expect(t).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'gisik:act' });
    expect(t).not.toHaveProperty('id_token'); // CONTROL
    const me = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: `Bearer ${t.access_token}` } });
    expect(me.statusCode).toBe(200);
  });

  it('14.246 concurrent refreshes: one wins, the connection is revoked by the loser', async () => {
    const { app, otp } = buildOAuthApp(db);
    const u = await signInWithPhone(app, otp, '+911100002246');
    const c = await consent(app, u.token);
    const t = (await app.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'authorization_code', code: c.code, code_verifier: c.verifier, client_id: c.clientId, redirect_uri: CB }) })).json();
    const refresh = () => app.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: c.clientId }) });
    const [a, b] = await Promise.all([refresh(), refresh()]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 400]);
    const winner = (a.statusCode === 200 ? a : b).json();
    const after = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: `Bearer ${winner.access_token}` } });
    expect(after.statusCode).toBe(401); // the loser's reuse revoked the family
  });
});
```
Cases 14.241–14.245 and 14.247–14.249 in the same file, each built on `consent()`; 14.247 builds a second `buildOAuthApp(db)` after `consent()` and exchanges the code there.

- [ ] **Step 3: Run to see it fail.**

- [ ] **Step 4: Implement.** `pkce.ts`:

```ts
import { createHash, timingSafeEqual } from 'node:crypto';
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const derived = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const expected = Buffer.from(challenge);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
```
Token route in `mcp-oauth.ts` — register the two routes inside `app.register(async (scope) => { scope.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_r, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string)))); scope.post('/oauth/token', …); scope.post('/oauth/revoke', …); })`:

```ts
    scope.post('/oauth/token', async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const b = (request.body ?? {}) as Record<string, string | undefined>;
      const bad = (error: string) => reply.code(400).send({ error });
      const at = now();
      if (b.grant_type === 'authorization_code') {
        if (!b.code || !b.code_verifier || !b.client_id || !b.redirect_uri) return bad('invalid_request');
        const row = await takeCode(deps.pool, b.code, at); // burnt whatever happens next (14.241)
        if (row === null || row.clientId !== b.client_id || row.redirectUri !== b.redirect_uri || !verifyPkceS256(b.code_verifier, row.codeChallenge)) {
          return bad('invalid_grant');
        }
        const { connectionId } = await createConnection(deps.pool, { userId: row.userId, clientId: row.clientId }, at);
        const t = await issueTokens(deps.pool, connectionId, row.userId, at);
        return { access_token: t.accessToken, token_type: 'Bearer', expires_in: t.expiresIn, refresh_token: t.refreshToken, scope: OAUTH_SCOPE };
      }
      if (b.grant_type === 'refresh_token') {
        if (!b.refresh_token) return bad('invalid_request');
        const used = await useRefreshToken(deps.pool, b.refresh_token, at);
        if (used.status !== 'ok') return bad('invalid_grant');
        const t = await issueTokens(deps.pool, used.connectionId, used.userId, at);
        return { access_token: t.accessToken, token_type: 'Bearer', expires_in: t.expiresIn, refresh_token: t.refreshToken, scope: OAUTH_SCOPE };
      }
      return bad('unsupported_grant_type');
    });

    scope.post('/oauth/revoke', async (request, reply) => {
      const token = ((request.body ?? {}) as Record<string, string | undefined>).token;
      if (token) {
        const connectionId = await connectionForToken(deps.pool, token);
        if (connectionId !== null) await revokeConnection(deps.pool, connectionId, null);
      }
      return reply.code(200).send({});
    });
```
(The superseded access tokens of a connection stay valid until their own hour runs out — that matches the spec's "revoke stops it within the hour at most" for refresh; explicit revoke deletes them at once through the cascade.)

- [ ] **Step 5: Run to see it pass**; whole server suite.

- [ ] **Step 6: Catalogue.** Flip 14.240–14.249. Features.md §14:
```markdown
- ⚙️ **Hosted MCP tokens and revocation** (remote-MCP plan Task 5; `/oauth/token`, `/oauth/revoke`, `src/mcp/pkce.ts`) — authorization code + PKCE S256 (constant-time compare) for a one-hour access token and a rotating refresh token; the code is burnt on first presentation; a reused refresh token revokes the whole connection, and a race between two refreshes is decided by one UPDATE; RFC 7009 revoke by access or refresh token. Form-encoded or JSON. Cases 14.240–14.249.
```

- [ ] **Step 7: Commit.**

---

### Task 6: One tool code path — package exports and the in-process session

**Files:**
- Modify: `packages/mcp-server/src/index.ts` (add `export * from './lazy-session.js';` and `export { registerTools, allTools } from './tools/register.js';`)
- Modify: `apps/server/package.json` (`"@gisik-nokma/mcp-server": "workspace:*"`), then `pnpm install --frozen-lockfile=false` ONCE to update the lockfile under **Node 22** (memory: Node 24 exits 1 silently)
- Create: `apps/server/src/mcp/in-process-fetch.ts`
- Test: `packages/mcp-server/test/exports.test.ts`; `apps/server/test/mcp/in-process-fetch.test.ts`

**Interfaces:**
- Consumes: `createGisikClient(serverUrl, fetchImpl)` (`packages/mcp-server/src/http-client.ts:36`), `registerTools(server, session)` (`tools/register.ts:39`), `lazySession(open)` (`lazy-session.ts:31`), `Session` (`session.ts:6`).
- Produces: `inProcessFetch(app: FastifyInstance, outer: { ip: string; xff: string | undefined }): typeof fetch`; `hostedSession(app, outer, accessToken: string, userId: string): LazySession`.

- [ ] **Step 1: Write the cases** (`## 14.7 Hosted MCP — one tool code path`, 14.250–14.254):

```markdown
- ❌ **14.250 — `@gisik-nokma/mcp-server` exports `registerTools`, `allTools` and `lazySession`, and `allTools` still yields the nine tools in their pinned order;** control: the existing `register.test.ts` order case is unchanged. Mutation: drop `registerTools` from the index.
- ❌ **14.251 — `inProcessFetch` turns a `fetch('http://in-process/v1/me/workspaces', { headers: { authorization } })` into `app.inject` and returns a real `Response` with the route's status, JSON body and headers;** control: a 404 route comes back as a 404 `Response` (not a throw). Mutation: always return status 200.
- ❌ **14.252 — the in-process request carries the OUTER caller's `remoteAddress` and `x-forwarded-for` (FD7): the rate-limit key seen by the events route is the outer key, not `127.0.0.1`;** control: two different outer callers land in two buckets. Mutation: omit `remoteAddress` from `inject`.
- ❌ **14.253 — a tool run through `hostedSession` writes an event with `origin: 'mcp'` and `actorId` = the token's owner;** control: a read tool returns the same JSON the REST route returns. Mutation: build the session with a different `userId`.
- ❌ **14.254 — the server's build includes the package: `pnpm turbo run build --filter=@gisik-nokma/server...` builds `@gisik-nokma/mcp-server` first, and `apps/server/Dockerfile` needs no change (its manifest COPY already lists `packages/mcp-server/package.json`, line 44);** control: `pnpm deploy --prod --filter=@gisik-nokma/server` output contains `node_modules/@gisik-nokma/mcp-server/dist/index.js`. Mutation: remove the workspace dependency. *(🧪 — a build check, run by the lane and recorded with the command output.)*
```

- [ ] **Step 2: Write the failing tests.** `packages/mcp-server/test/exports.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as pkg from '../src/index.js';
describe('14.250 package exports', () => {
  it('14.250 registerTools, allTools, lazySession are exported', () => {
    expect(typeof pkg.registerTools).toBe('function');
    expect(typeof pkg.allTools).toBe('function');
    expect(typeof pkg.lazySession).toBe('function');
    const fake = { userId: () => 'u', get: async () => ({}), postEvents: async () => ({}) };
    expect(pkg.allTools(fake).map((t) => t.name)).toEqual([
      'list_workspaces', 'list_projects', 'search_tickets', 'list_tickets', 'get_ticket',
      'create_ticket', 'transition_ticket', 'add_comment', 'assign_ticket',
    ]);
  });
});
```
`apps/server/test/mcp/in-process-fetch.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';
import { inProcessFetch } from '../../src/mcp/in-process-fetch.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

describe('in-process fetch', () => {
  it('14.251 a fetch becomes an inject and a real Response', async () => {
    const { app, otp } = buildTestApp(db);
    const u = await signInWithPhone(app, otp, '+911100002251');
    const f = inProcessFetch(app, { ip: '198.51.100.7', xff: undefined });
    const ok = await f('http://in-process/v1/me/workspaces', { headers: { authorization: `Bearer ${u.token}` } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ workspaces: [] });
    const missing = await f('http://in-process/v1/nope', {}); // CONTROL
    expect(missing.status).toBe(404);
  });
});
```
14.252 builds with `security.rateLimit.eventsMax: 1` and posts two `/v1/events` batches through two fetches with different `outer.ip` (both 2xx/4xx-not-429), then a second through the SAME outer ip (429). 14.253 runs `allTools(hostedSession(...))` `create_ticket` against a seeded workspace (`test/helpers/seed.ts`) and reads the ledger row's `origin` and `actor_id`.

- [ ] **Step 3: Run to see them fail.**

- [ ] **Step 4: Implement** `in-process-fetch.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { createGisikClient, lazySession, type LazySession } from '@gisik-nokma/mcp-server';

export function inProcessFetch(app: FastifyInstance, outer: { ip: string; xff: string | undefined }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    if (outer.xff !== undefined) headers['x-forwarded-for'] = outer.xff;
    const res = await app.inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST',
      url: `${url.pathname}${url.search}`,
      headers,
      payload: typeof init?.body === 'string' ? init.body : undefined,
      remoteAddress: outer.ip, // FD7 — the caller's bucket, never 127.0.0.1's
    });
    const out = new Headers();
    for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) out.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    return new Response(res.body === '' ? null : res.body, { status: res.statusCode, headers: out });
  }) as typeof fetch;
}

export function hostedSession(app: FastifyInstance, outer: { ip: string; xff: string | undefined }, accessToken: string, userId: string): LazySession {
  const client = createGisikClient('http://in-process', inProcessFetch(app, outer));
  return lazySession(async () => ({
    userId: () => userId,
    get: (path) => client.get(path, accessToken),
    postEvents: (events) => client.post('/v1/events', { events }, accessToken),
  }));
}
```

- [ ] **Step 5: Run to see them pass**; `packages/mcp-server` suite, server suite; the build check for 14.254 (`pnpm turbo run build --filter=@gisik-nokma/server... > /tmp/b.log 2>&1; tail -15 /tmp/b.log`).

- [ ] **Step 6: Catalogue.** Flip 14.250–14.253, 14.254 🧪 with the command output. Features.md §14 amend the "nine tools" bullet: "…and the same nine tools, the same code, run behind the hosted `/mcp` (Task 7) through `hostedSession` (`apps/server/src/mcp/in-process-fetch.ts`) — the API's own routes called in-process with the caller's token and network identity. Cases 14.250–14.254."

- [ ] **Step 7: Commit.**

---

### Task 7: `POST /mcp` — stateless Streamable HTTP

**Files:**
- Create: `apps/server/src/routes/mcp-http.ts`
- Modify: `apps/server/src/app.ts` (register when `mcpPublicUrl` set; `/mcp` charged to `mcpLimiter`)
- Test: `apps/server/test/mcp/mcp-http.test.ts`

**Interfaces:**
- Consumes: Task 6 `hostedSession`, `registerTools`; `resolveMcpToken` (Task 1); Task 2 `PUBLIC_URL` issuer.
- Produces: `registerMcpHttpRoute(app, deps: { pool; publicUrl: string; allowedOrigins: string[]; now?: () => Date })`. `allowedOrigins` default: `['https://claude.ai', 'https://chatgpt.com', webOrigin]`.

- [ ] **Step 1: Write the cases** (`## 14.8 Hosted MCP — the /mcp endpoint`, 14.260–14.269):

```markdown
- ❌ **14.260 — no bearer → 401 with `WWW-Authenticate: Bearer resource_metadata="<public>/.well-known/oauth-protected-resource/mcp"`;** control: the same header on an expired token. Mutation: answer 401 with no header.
- ❌ **14.261 — a local (device-flow) token is REFUSED at `/mcp` (401): the hosted door takes hosted tokens only;** control: a hosted token is accepted. Mutation: accept any resolvable token. *(Keeps the two doors' credentials apart — a leaked local token cannot be pasted into a remote client.)*
- ❌ **14.262 — `initialize` then `tools/list` return the nine tools with their descriptions, as JSON (`enableJsonResponse`), and NO `mcp-session-id` header (stateless);** control: the stdio registration test's names match. Mutation: set `sessionIdGenerator: () => randomUUID()`.
- ❌ **14.263 — `tools/call list_workspaces` returns the caller's workspaces (same JSON as `GET /v1/me/workspaces`);** control: a second person sees their own. Mutation: build the session from a fixed user.
- ❌ **14.264 — `tools/call create_ticket` writes an event with `origin: 'mcp'`, `actorId` = the token's owner;** control: `transition_ticket` refused by the rule engine returns `isError: true` with the server's own reason text. Mutation: catch and reword the error.
- ❌ **14.265 — `Origin` present and not allowed (`https://evil.example`) → 403 before auth; absent `Origin` (server-to-server connectors) and `https://claude.ai` are admitted;** control: `https://chatgpt.com` admitted. Mutation: skip the Origin check.
- ❌ **14.266 — a person removed from every workspace (R5 `membership.revoked`) with a live connection gets `list_workspaces` → `[]` and a write → the REST refusal, never data;** control: before removal the same calls return data. Mutation: cache the membership on the connection. *(Review Focus 3)*
- ❌ **14.267 — `GET /mcp` and `DELETE /mcp` → 405 with `Allow: POST`;** control: `POST` answers. Mutation: route GET to the transport.
- ❌ **14.268 — every tool call writes one log line `{ msg: 'mcp tool call', tool, outcome: 'ok'|'error', durationMs, userId }` and no token, argument value or result text;** control: the line exists for a failing call with `outcome: 'error'`. Mutation: log the arguments.
- ❌ **14.269 — `/mcp` is charged to the MCP rate-limit bucket keyed by the caller;** control: another caller is unaffected. Mutation: leave `/mcp` unbucketed.
```

- [ ] **Step 2: Write the failing test** `apps/server/test/mcp/mcp-http.test.ts`. A helper `hostedToken(app, user)` runs Task 5's `consent()` + code exchange and returns the access token (import `consent` by extracting it into `test/helpers/oauth.ts` in this task — move it there, update Task 5's file to import it):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { buildOAuthApp, hostedToken, PUBLIC_URL } from '../helpers/oauth.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

const rpc = (method: string, params: unknown = {}, id = 1) => ({ jsonrpc: '2.0', id, method, params });
const INIT = rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
const H = (token?: string, extra: Record<string, string> = {}) => ({
  'content-type': 'application/json', accept: 'application/json, text/event-stream',
  ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra,
});

describe('POST /mcp', () => {
  it('14.260 no bearer → 401 pointing at the metadata', async () => {
    const { app } = buildOAuthApp(db);
    const res = await app.inject({ method: 'POST', url: '/mcp', headers: H(), payload: INIT });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe(`Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"`);
  });

  it('14.262 tools/list: nine tools, JSON, stateless', async () => {
    const { app, otp } = buildOAuthApp(db);
    const u = await signInWithPhone(app, otp, '+911100002262');
    const token = await hostedToken(app, u.token);
    const init = await app.inject({ method: 'POST', url: '/mcp', headers: H(token), payload: INIT });
    expect(init.statusCode).toBe(200);
    expect(init.headers['mcp-session-id']).toBeUndefined();
    const list = await app.inject({ method: 'POST', url: '/mcp', headers: H(token, { 'mcp-protocol-version': '2025-06-18' }), payload: rpc('tools/list', {}, 2) });
    const names = (list.json().result.tools as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(['list_workspaces', 'list_projects', 'search_tickets', 'list_tickets', 'get_ticket', 'create_ticket', 'transition_ticket', 'add_comment', 'assign_ticket']);
  });

  it('14.265 a foreign Origin is refused before auth; absent and allowed origins pass', async () => {
    const { app } = buildOAuthApp(db);
    expect((await app.inject({ method: 'POST', url: '/mcp', headers: H(undefined, { origin: 'https://evil.example' }), payload: INIT })).statusCode).toBe(403);
    for (const origin of [undefined, 'https://claude.ai', 'https://chatgpt.com']) { // CONTROL — reach auth (401)
      const res = await app.inject({ method: 'POST', url: '/mcp', headers: H(undefined, origin ? { origin } : {}), payload: INIT });
      expect(res.statusCode, String(origin)).toBe(401);
    }
  });

  it('14.267 GET and DELETE are 405 Allow: POST', async () => {
    const { app } = buildOAuthApp(db);
    for (const method of ['GET', 'DELETE'] as const) {
      const res = await app.inject({ method, url: '/mcp' });
      expect(res.statusCode).toBe(405);
      expect(res.headers.allow).toBe('POST');
    }
  });
});
```
Write 14.261 (mint a device-flow token as in `require-session-pat.test.ts:21-31`, POST INIT with it → 401), 14.263, 14.264 (seed a workspace with `test/helpers/seed.ts`; call `create_ticket`; assert the ledger row), 14.266 (seed, then append `membership.revoked` through the R5 removal route `POST /v1/workspaces/:workspaceId/members/:userId/remove` as the owner; call again), 14.268 (build with `logStream`, as `invites.test.ts` does; parse lines; `JSON.stringify(lines)` must not contain the token or the created title), 14.269 in the same file.

- [ ] **Step 3: Run to see it fail.**

- [ ] **Step 4: Implement** `mcp-http.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerTools } from '@gisik-nokma/mcp-server';
import type { Queryable } from '../db/queryable.js';
import { hashCredential } from '../mcp/token-store.js';
import { resolveMcpToken } from '../mcp/token-store.js';
import { hostedSession } from '../mcp/in-process-fetch.js';

export function registerMcpHttpRoute(
  app: FastifyInstance,
  deps: { pool: Queryable; publicUrl: string; allowedOrigins: string[]; now?: () => Date },
): void {
  const now = deps.now ?? (() => new Date());
  const challenge = `Bearer resource_metadata="${deps.publicUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource/mcp"`;
  for (const method of ['GET', 'DELETE'] as const) {
    app.route({ method, url: '/mcp', handler: async (_r, reply) => reply.code(405).header('allow', 'POST').send({ error: 'method_not_allowed' }) });
  }
  app.post('/mcp', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin !== undefined && !deps.allowedOrigins.includes(origin)) return reply.code(403).send({ error: 'forbidden_origin' });
    const header = request.headers.authorization;
    const raw = header?.startsWith('Bearer ') ? header.slice(7) : null;
    // Hosted tokens ONLY (14.261): the kind is checked before the resolution stamps anything.
    const kind = raw === null ? null : (await deps.pool.query<{ kind: string }>(
      `SELECT kind FROM mcp_tokens WHERE token_hash = $1`, [hashCredential(raw)])).rows[0]?.kind ?? null;
    const userId = raw !== null && kind === 'hosted' ? await resolveMcpToken(deps.pool, raw, now()) : null;
    if (raw === null || userId === null) return reply.code(401).header('www-authenticate', challenge).send({ error: 'invalid_token' });

    const server = new McpServer({ name: 'gisik-nokma', version: '0.1.0' });
    registerTools(server, hostedSession(app, {
      ip: request.ip,
      xff: typeof request.headers['x-forwarded-for'] === 'string' ? request.headers['x-forwarded-for'] : undefined,
    }, raw, userId), { onCall: (e) => request.log.info({ msg: 'mcp tool call', ...e, userId }) });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const webRequest = new Request(`${deps.publicUrl}/mcp`, {
      method: 'POST',
      headers: Object.entries(request.headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])) as [string, string][],
      body: JSON.stringify(request.body),
    });
    const response = await transport.handleRequest(webRequest, { parsedBody: request.body });
    reply.code(response.status);
    response.headers.forEach((v, k) => { reply.header(k, v); });
    const text = await response.text();
    await transport.close(); await server.close();
    return reply.send(text === '' ? undefined : text);
  });
}
```
**`registerTools` gains an optional third parameter** `hooks?: { onCall?(e: { tool: string; outcome: 'ok' | 'error'; durationMs: number }): void }` in `packages/mcp-server/src/tools/register.ts:39` — called after each handler, with no arguments or result (14.268). The stdio `main.ts` passes nothing; its behaviour is unchanged (`register.test.ts` stays green). Update `register.ts`'s docblock.

- [ ] **Step 5: Run to see it pass**; server + mcp-server suites.

- [ ] **Step 6: Catalogue.** Flip 14.260–14.269. Features.md §14:
```markdown
- ✅ **The hosted MCP endpoint — `POST https://pm-api.artsourced.in/mcp`** (remote-MCP plan Task 7; `apps/server/src/routes/mcp-http.ts`) — MCP Streamable HTTP, stateless (a fresh server + transport per request, JSON responses, no session id); hosted tokens only (a device-flow token is refused here); `401` with `WWW-Authenticate` pointing at the protected-resource metadata so Claude and ChatGPT offer "reconnect"; `Origin` checked (absent, `claude.ai`, `chatgpt.com`, the web origin); `GET`/`DELETE` 405; one log line per tool call with no token or content; the nine tools run as the caller through the API's own routes, so a removed member gets nothing. Cases 14.260–14.269.
```

- [ ] **Step 7: Commit.**

---

### Task 8: Connected assistants — hosted connections, Disconnect, and the Connect panel

**Files:**
- Create: `apps/server/src/routes/mcp-connections.ts` (`GET /v1/me/mcp-connections`, `DELETE /v1/me/mcp-connections/:id`)
- Modify: `apps/server/src/app.ts` (register always — an empty list when the door is off — next to `registerMcpTokenRoutes`), `apps/server/src/http/http-origin.ts` (`'/v1/me/mcp-connections/:id'` joins the set; DELETE is covered since 2026-09-08)
- Modify: `apps/web/src/mcp-tokens-screen.tsx` (a "Hosted connections" list and a "Connect an assistant" panel)
- Modify: `apps/server/src/routes/auth-methods.ts` or add `GET /v1/mcp/public-url` (returns `{ url: '<MCP_PUBLIC_URL>/mcp' } | { url: null }`) so the web screen shows the real URL without a build-time variable — choose the new tiny route; unauthenticated
- Test: `apps/server/test/mcp/mcp-connections.test.ts`; `apps/web/test/mcp-tokens-page.test.tsx` (extend)

**Interfaces:**
- Consumes: Task 1 `listConnections`, `revokeConnection`.
- Produces: `GET /v1/me/mcp-connections` → `{ connections: { id; clientName; redirectHost; createdAt; lastUsedAt | null }[] }`; `DELETE` → 204 / 404; `GET /v1/mcp/public-url` → `{ url: string | null }`.

- [ ] **Step 1: Write the cases** (`## 14.9 Hosted MCP — Connected assistants`, 14.270–14.277):

```markdown
- ❌ **14.270 — `GET /v1/me/mcp-connections` lists the caller's LIVE hosted connections (name, redirect host, connected, last used) and none of another person's; an idle-expired one is absent;** control: local tokens still list under `/v1/me/mcp-tokens`. Mutation: drop the `user_id` filter.
- ❌ **14.271 — Disconnect (`DELETE /v1/me/mcp-connections/:id`) deletes the connection: its access token 401s at `/mcp` and its refresh token is `invalid_grant`;** control: another person's id answers 404 and their connection survives. Mutation: delete by id without the owner check.
- ❌ **14.272 — the DELETE refuses a cookie request with a foreign Origin (403);** control: `Origin: WEB_ORIGIN` succeeds. Mutation: remove the route from the protected set.
- ❌ **14.273 — `GET /v1/mcp/public-url` answers `{ url: "<MCP_PUBLIC_URL>/mcp" }` when the door is on and `{ url: null }` when off;** control: unauthenticated callers get the same answer. Mutation: return the web origin.
- ❌ **14.274 — the Connected assistants screen shows each hosted connection as "{app name} · {host}", "Connected {date}", "Last used {date | never}" and a **Disconnect** button; local tokens keep **Revoke**;** control: a person with neither sees the existing empty state. Mutation: label the hosted button Revoke.
- ❌ **14.275 — Disconnect removes the row after the DELETE resolves and shows the server's reason on failure;** control: the row stays while the request is in flight (button reads "Disconnecting…"). Mutation: remove the row before the DELETE resolves.
- ❌ **14.276 — the "Connect an assistant" panel shows the URL from `/v1/mcp/public-url` with a **Copy** button (writes it to the clipboard, then reads "Copied") and a link "How to connect" to the Help article;** control: with `url: null` the panel is absent. Mutation: hard-code the URL.
- ❌ **14.277 — the list reads `/v1/me/mcp-connections` and `/v1/me/mcp-tokens` independently: a failure of one shows its own failure sentence and still renders the other (the 14.150 rule, extended);** control: both succeed → both lists. Mutation: `Promise.all` that fails both.
```

- [ ] **Step 2: Write the failing tests.** Server (`mcp-connections.test.ts`) in the Task 5 style (`consent()` + exchange → token; list; delete; assert `/mcp` 401 and refresh `invalid_grant`). Web: extend `mcp-tokens-page.test.tsx` — stub `fetch` for the three GETs and the DELETE; `navigator.clipboard.writeText = vi.fn()`; assert text and buttons:

```tsx
it('14.274 hosted rows show app · host and Disconnect; local rows keep Revoke', async () => {
  stubGets({
    '/v1/me/mcp-tokens': { tokens: [{ id: 'h1', name: 'laptop', createdAt: '2026-09-01T00:00:00Z', lastUsedAt: null }] },
    '/v1/me/mcp-connections': { connections: [{ id: 'conn_1', clientName: 'Claude', redirectHost: 'claude.ai', createdAt: '2026-09-30T00:00:00Z', lastUsedAt: '2026-09-30T10:00:00Z' }] },
    '/v1/mcp/public-url': { url: 'https://pm-api.artsourced.in/mcp' },
  });
  render(<McpTokensScreen />);
  expect(await screen.findByText('Claude · claude.ai')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Disconnect/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Revoke/ })).toBeTruthy(); // CONTROL
});
```
(`stubGets` is a 6-line helper in the test file mapping URL → JSON body with status 200.)

- [ ] **Step 3: Run to see them fail.**

- [ ] **Step 4: Implement** the routes (same shape as `routes/mcp-tokens.ts:23-37`) and the screen: a second `useEffect` read, its own `failed` state, a `<section aria-labelledby>` "Assistant apps you connected", and the panel (`<Card>` with the URL in a `<code>` and a ghost `Button` "Copy", `navigator.clipboard.writeText(url)`, then label "Copied" for 2 s; a `<Link href="/help#connecting-claude-or-chatgpt">How to connect</Link>`). Use the styling refresh's shared components only (`ui-ux-pro-max` for the lane's UI pass).

- [ ] **Step 5: Run to see them pass**; web + server suites.

- [ ] **Step 6: Catalogue.** Flip 14.270–14.277. Features.md §14 amend the Connected assistants bullet: "…now also lists the assistant APPS a person connected by URL — name, web address, connected, last used, **Disconnect** (deletes the connection at once) — and a **Connect an assistant** panel with the URL, a Copy button and a How to connect link. Cases 14.270–14.277."

- [ ] **Step 7: Commit.**

---

### Task 9: The member help — manual §16

**Files:**
- Modify: `docs/manual.md` (new `## §16 — Connecting Claude or ChatGPT` after §15)
- Regenerate: `packages/app-core/src/help/content.generated.ts` via `node scripts/help-content.mjs` (never hand-edited)
- Test: `pnpm check:help`; `test-cases/15-in-app-help.md` if it counts sections (read it first)

**Interfaces:**
- Consumes: the UI strings from Tasks 4 and 8 (`Connect an assistant`, `Allow`, `Deny`, `Connected assistants`, `Disconnect`, `Copy`, `How to connect`). `check:help` refuses a quoted string that no longer exists in `apps/` or `packages/` (`scripts/help-content.mjs:721`), so every quoted phrase below must be in the shipped UI.

- [ ] **Step 1: Write the cases** (`## 14.10 Hosted MCP — member help`, 14.280–14.282):

```markdown
- ❌ **14.280 — the manual has a §16 "Connecting Claude or ChatGPT" with, per app, three numbered steps (where to add a connector, paste the URL, press "Allow"), how to disconnect ("Connected assistants" → "Disconnect"), and what a "reconnect" prompt means;** control: `pnpm check:help` exits 0. Mutation: quote a button label that does not exist ("Approve").
- ❌ **14.281 — the Help browser finds §16 by searching "ChatGPT" and "connector";** control: an existing §15 search still finds §15. Mutation: omit the generated file's regeneration.
- ❌ **14.282 — the "How to connect" link on Connected assistants lands on §16's anchor;** control: the anchor id is `connecting-claude-or-chatgpt`. Mutation: link `/help` without the anchor.
```

- [ ] **Step 2: Write the section.** Plain words, no terminal, no jargon. Claude: *Settings → Connectors → Add custom connector*; ChatGPT: *Settings → Connectors → Create* (developer mode) — the lane **checks both apps' current menu names on the day** and writes what it sees (the menus move; say "as of <date>"). Include the URL `https://pm-api.artsourced.in/mcp` and the Copy panel as the easy way to get it.

- [ ] **Step 3: Regenerate and check** — `node scripts/help-content.mjs && pnpm check:help > /tmp/h.log 2>&1; tail -10 /tmp/h.log`; the help search test in `packages/app-core` for 14.281.

- [ ] **Step 4: Catalogue.** Flip 14.280–14.282; Features.md §14: "✅ **How to connect Claude or ChatGPT — manual §16** … Cases 14.280–14.282."

- [ ] **Step 5: Commit.**

---

### Task 10: End-to-end round trip and the log

**Files:**
- Create: `apps/server/test/mcp/mcp-remote-e2e.test.ts`
- No product code (unless the round trip finds a seam the unit cases missed — fix it in the owning task's file and add the case there)

- [ ] **Step 1: Write the cases** (`## 14.11 Hosted MCP — round trip`, 14.290–14.293):

```markdown
- ❌ **14.290 — one test drives the whole door as a client would: fetch protected-resource metadata → AS metadata → register → authorize (302 to `/mcp/connect`) → decision as a signed-in person → token → `initialize` → `tools/list` → `list_workspaces` → `create_ticket` → refresh → the old access token still works until expiry and the new one works → revoke → `/mcp` 401 with `WWW-Authenticate`;** control: the same person's web session still works after revoke. Mutation: have revoke delete the person's better-auth session.
- ❌ **14.291 — the request log over that whole run contains no raw code, access token, refresh token or `state` value (FD5: `redactRequestUrl` covers `code`, `state`, `access_token`, `refresh_token` in query strings, and bodies are not logged);** control: the log does contain the route names `/oauth/authorize` and `/oauth/token`. Mutation: remove `state` from `CREDENTIAL_PARAMS`.
- ❌ **14.292 — the device flow still works end to end after all of this (stdio door unchanged, D2): mint → approve → token → `/v1/me/workspaces`;** control: 14.30 is green in the same run. Mutation: make `resolveMcpToken` require `kind='hosted'`.
- ❌ **14.293 — a hosted access token cannot approve a device code or decide a consent (both 403), so a connected app cannot mint itself more access;** control: a web session can. Mutation: drop either `authKind` fence.
```

- [ ] **Step 2: Write the test** (one `it` per case; 14.290 reuses `consent()`/`hostedToken()` and `rpc()` from the helpers; 14.291 builds with `logStream`, collects lines, and asserts none contains any of the raw values captured during the run).

- [ ] **Step 3: Run** — `cd apps/server && pnpm exec vitest run --no-file-parallelism test/mcp/ > /tmp/e2e.log 2>&1; tail -30 /tmp/e2e.log`. Then the FULL battery: build → `turbo typecheck` → `turbo test --force` → `check:case-ids`, `check:case-citations`, `check:help`, `check:migrations`, `check:env` (add `MCP_PUBLIC_URL` to whatever env inventory `check:env` reads, optional) — all named as a LOCAL run.

- [ ] **Step 4: Catalogue.** Flip 14.290–14.293. Features.md §14: "⚙️ **The hosted door, end to end** — … Cases 14.290–14.293."

- [ ] **Step 5: Commit.**

---

### Task 11: 🧪 Browser pass on the dev stack, and the real-client check

**Files:** `test-cases/14-mcp-server.md` only (evidence). Needs `MCP_PUBLIC_URL` on the dev stack's server (`docker-compose.dev.yml`: `MCP_PUBLIC_URL=http://localhost:3000` — dev is http; the redirect/loopback rules still apply to CLIENT redirects, not to the issuer).

- [ ] **Step 1: Write the cases** (`## 14.12 Hosted MCP — browser and real clients`, 14.295–14.299):

```markdown
- 🧪 **14.295 — dev stack: `curl -X POST localhost:3000/oauth/register` + a hand-built authorize URL in the browser → the consent page on `localhost:3001/mcp/connect` after sign-in, name + host shown, Allow returns to the (loopback) redirect with `code` and `state`; Deny returns `error=access_denied`;** evidence: screenshots + the two redirect URLs (code value redacted).
- 🧪 **14.296 — dev stack: Connected assistants lists the new connection; Disconnect removes it; Copy copies the URL;** evidence: screenshots.
- 🧪 **14.297 — the MCP Inspector (`npx @modelcontextprotocol/inspector`, run by the LANE on the dev machine, not by a member) connects to `http://localhost:3000/mcp` through the full OAuth flow and lists nine tools;** evidence: screenshot.
- 🧪 **14.298 — REAL claude.ai connects to a publicly reachable HTTPS deployment of the release branch, lists the tools, reads a workspace and creates a ticket that the ledger shows with `origin: 'mcp'`;** evidence: screenshots + the ledger row. **⚑ Needs the owner's choice of public HTTPS before it can run** — (a) a temporary tunnel to the dev stack, or (b) production with `MCP_PUBLIC_URL` set (the FD1 switch) on the release deploy. The planner asks; the lane does NOT choose.
- 🧪 **14.299 — REAL ChatGPT does the same;** same evidence, same ⚑.
```

- [ ] **Step 2: Run 14.295–14.297** on the dev stack (`ctl rebuild` from the release branch), recording evidence; flip honestly (🧪 → with evidence, or 🟡 with what was not measured).

- [ ] **Step 3: Hand back** to the planner with 14.298–14.299 open and the ⚑ question. After the owner's answer, the planner (or a lane on the planner's word) runs them. If CORS turns out to be needed (FD3), it is a scoped fix in `app.ts` with its own case in this block's spare ids.

- [ ] **Step 4: Release step (planner, not a lane):** before the release→main merge, add `MCP_PUBLIC_URL=https://pm-api.artsourced.in` to the `server` component from the LIVE DO spec (`doctl apps spec get` → edit → `doctl apps update --spec`), per memory `do-app-spec-not-applied-on-push`.

---

## Self-review

- **Spec coverage:** §2 D1 → Tasks 2/11; D2 → 14.261, 14.292; D3 → Tasks 1/5; D4 → one scope (Tasks 2/3), full tool set (Task 7); D5 → no upgrade, all in `server`; D6 → branch line. §3 A1–A6 → Tasks 2–7 (A4 corrected by FD2, A5 by 14.201/14.261). §4 consent copy → Task 4 verbatim. §5 → Tasks 2/3/5 (every bullet has a case). §6 → 14.260, 14.264, 14.266. §7 → PKCE 14.221/14.241; exact redirect 14.222/14.242; https/loopback 14.214; single-use short codes 14.203/14.243; rotation + reuse 14.204/14.245/14.246; expired hosted vs local 14.201; hashes only 14.207; tokens never logged 14.268/14.291; registration rate limit 14.216; CSRF 14.227/14.272; framing 14.236; Origin 14.265; purge rules 14.209. §8 → FD1/FD3 + Task 11 Step 4; migration Task 1; logs 14.268. §9 → Tasks 8/9. §10 → Tasks 10/11. §11 → nothing built there.
- **Placeholders:** none; the two deliberately open items are the owner's ⚑ (14.298–14.299) and the lane's same-day reading of the two apps' menu names (Task 9 Step 2), both stated as such.
- **Type consistency:** `registerClient`/`getClient`/`createPending`/`getPending`/`takePending`/`mintCode`/`takeCode`/`createConnection`/`issueTokens`/`useRefreshToken`/`revokeConnection`/`connectionForToken`/`listConnections` are defined in Task 1 and used with the same shapes in Tasks 2–8; `hostedSession(app, outer, accessToken, userId)` Task 6 = Task 7; `registerTools(server, session, hooks?)` extended in Task 7 only.
- **Review Focus:** each of the five lines has its test in its owning task (14.226, 14.246, 14.266, 14.222, 14.247).
