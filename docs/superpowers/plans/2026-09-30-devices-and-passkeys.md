# Signed-in devices and passkeys — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the controller runs it in lanes (owner, 2026-09-30).

**Goal:** Account → "Sign-in and devices" shows one row per real device (stable id, short tag, honest activity), and "Passkeys" shows each passkey's provider and last use — with the dev tables kept clean.

**Architecture:** A better-auth `databaseHooks.session.create.before` hook reads or mints an httpOnly `gn_device` cookie on every sign-in and writes its value into a new `session."deviceId"` column. `requireSession` stamps a throttled `session."lastSeenAt"`. A new server read `GET /v1/me/devices` groups the caller's live sessions by device (one-way tag, never the raw id) and `POST /v1/me/devices/:key/sign-out` revokes one device's sessions, scoped to the caller. A better-auth `hooks.after` on `/passkey/verify-authentication` stamps `passkey."lastUsedAt"`, and `GET /v1/me/passkeys` serves passkeys with an AAGUID→provider label. The backup worker's scheduler deletes expired sessions daily. The web Account sections regroup on those reads. The e2e-stack run tears down what it created.

**Tech Stack:** Fastify, better-auth 1.7.2 (+ `@better-auth/passkey` 1.7.2), better-call's `ctx.getCookie`/`ctx.setCookie`, Postgres (node-pg-migrate SQL migrations), React (app-core account sections), Vitest, Playwright (e2e-stack).

**Spec:** `docs/superpowers/specs/2026-09-30-devices-and-passkeys-design.md` (owner-approved 2026-09-30). FD1–FD6 below correct it where the code disagrees; **the plan wins**.

## Global Constraints

- Target branch `release/2026-09-30`; task branches off it; PR `--base release/2026-09-30`; never `main`.
- Cookie: `gn_device`, httpOnly, `SameSite=Lax`, `Secure` when the auth base URL is https, `Path=/`, `Max-Age` 31536000 (1 year), value = 32 random bytes base64url.
- The raw device id is NEVER returned to a client, rendered, or logged. The client sees `key` = hex `sha256(deviceId)` and `tag` = first 4 chars of base32(sha256(deviceId)), upper-case.
- "Active now" = `lastSeenAt` within 5 minutes. Relative times: "N minutes/hours/days ago", then the date.
- Passkey "Not used recently" = `lastUsedAt` NULL or older than 90 days.
- Migration `apps/server/migrations/1790900000000_devices-and-passkeys.sql` — additive, safe for the old code.
- Case block **6.300–6.359** in `test-cases/06-auth-visibility.md` (free: highest real §6 id is 6.289; 6.290–6.299 sit in the access plan's reserved range). Every case ❌ first, with a control and a named mutation; flip in the same commit as its covering test.
- Features.md and test-cases in the same change set; `pnpm check:env` stays green (new env var documented in `.env.example`).
- Never pipe a test run into `head`.

## FD — spec corrections found on reading (the plan wins)

- **FD1 — The apps have no sign-in flow to carry a per-install id.** `apps/desktop/src/app.tsx:60` reads `localStorage.getItem('gisik.token')` set by the web sign-in page; `apps/mobile/src/app.tsx:16,36` takes the token from build-time env. Neither app signs in, so spec V1's "the mobile and desktop apps send their own stored id" has nothing to hook into. **Dropped** (no Task 6); their sessions are whatever the web sign-in created.
- **FD2 — `updatedAt` cannot say "Active now".** better-auth's defaults apply (no `session` block in `apps/server/src/auth/auth.ts`): `updateAge` 1 day, `expiresIn` 7 days — `updatedAt` moves at most daily. A new `session."lastSeenAt"` column is stamped by `requireSession`, throttled to one write per 5 minutes per session (Task 2).
- **FD3 — "Inactive (N)" at 30 days can never fill.** A session expires 7 days after its last refresh (FD2 defaults), and expired sessions are hidden (V3) and now deleted daily (V6). A device is listed only while it has an unexpired session, i.e. it was used within ~7 days. The 30-day split is therefore replaced by: **every listed device is signed in; the heading counts them; "Active now" / "Last active …" gives the activity.** **OWNER RULING 2026-09-30 ("A, as recommended") — supersedes the paragraph's last sentence:** the list SPLITS BY RECENT USE — **"Active in the last 24 hours"** (`lastSeenAt` within 24 h, the current device always here) first, then **"Signed in, idle (N)"** (signed in, `lastSeenAt` older than 24 h, collapsed by default), and the heading reads **"Sign-in and devices · N signed in · M active"**. Task 6's cases 6.332 and 6.339 below carry it.
- **FD4 — better-auth's `listSessions` would leak the raw device id** if `deviceId` were a returned additional field, so the web stops using `authClient.listSessions` for this section and reads the new `GET /v1/me/devices` (Task 3). `deviceId` is declared to better-auth with `returned: false`, `input: false`.
- **FD5 — the passkey plugin's schema does not know `lastUsedAt`,** so `authClient.passkey.listUserPasskeys` would not return it. The web reads `GET /v1/me/passkeys` (Task 5); add/delete stay on the plugin.
- **FD6 — the automated writers of the DEV database are the e2e-stack run and hand/controller browser passes,** not the server suite (it uses the test Postgres on 54329, memory `dev-db-is-54330-not-54329`). The e2e-stack signs in by magic link (`apps/web/e2e-stack/global-setup.ts:55-78`) and registers passkeys over a CDP virtual authenticator (`passkey-registration.spec.ts:89`). The hygiene step is a `globalTeardown` for that config plus the daily expired-session delete (Tasks 4, 8).

## Review Focus

1. **A sign-in method that skips the hook** (Google OAuth callback, magic-link verify, passkey, phone OTP) — every method must leave a `deviceId` on its session; Task 1 pins phone, magic link and passkey through real routes and Google through the callback's session creation.
2. **A forged or foreign `key`** in `POST /v1/me/devices/:key/sign-out` — must revoke nothing of anyone else's and answer 404, never 403-with-detail (Task 3).
3. **Signing out the current device from the list** — not offered; the route refuses the caller's current device key with 409 so a stale page cannot sign the person out (Task 3).
4. **Clock edges** — `lastSeenAt` exactly 5 minutes old, `lastUsedAt` exactly 90 days old: boundaries pinned both sides (Tasks 2, 5).
5. **Cookie on a bearer-only request** (the apps / scripts) — the hook must not throw when there is no request cookie jar or when `ctx` is `null`; the session is created with `deviceId` NULL (Task 1).

## File Structure

- `apps/server/migrations/1790900000000_devices-and-passkeys.sql` — the three columns + index.
- `apps/server/src/auth/device-cookie.ts` — NEW: `DEVICE_COOKIE`, `mintDeviceId()`, `deviceKey(id)`, `deviceTag(id)`, `deviceSessionHook(opts)` (the `session.create.before` body).
- `apps/server/src/auth/auth.ts` — wires `session.additionalFields`, `databaseHooks`, `hooks.after` (passkey stamp).
- `apps/server/src/auth/require-session.ts` — `currentSessionId`, throttled `lastSeenAt`.
- `apps/server/src/auth/passkey-providers.ts` — NEW: AAGUID → label table + `providerOf(aaguid)`.
- `apps/server/src/routes/me-devices.ts` — NEW: `GET /v1/me/devices`, `POST /v1/me/devices/:key/sign-out`.
- `apps/server/src/routes/me-passkeys.ts` — NEW: `GET /v1/me/passkeys`.
- `apps/server/src/ops/expired-sessions.ts` — NEW: `deleteExpiredSessions(pool, now)`.
- `apps/server/src/ops/backup-daemon-main.ts` — one more `ScheduledJob`.
- `packages/app-core/src/account/sessions-client.ts`, `sessions-section.tsx` — device model + UI.
- `packages/app-core/src/account/passkey-client.ts`, `passkeys-section.tsx` — provider/lastUsed model + UI.
- `packages/app-core/src/account/relative-time.ts` — NEW: `relativeTime(iso, now)`.
- `apps/web/src/account/account-clients.ts` — clients over the new reads.
- `apps/web/e2e-stack/global-teardown.ts` — NEW; `apps/web/playwright.stack.config.ts` registers it.

---

### Task 1: The device cookie and `session."deviceId"` on every sign-in

**Files:**
- Create: `apps/server/migrations/1790900000000_devices-and-passkeys.sql`
- Create: `apps/server/src/auth/device-cookie.ts`
- Modify: `apps/server/src/auth/auth.ts` (betterAuth config `:92`; add `session`, `databaseHooks` beside `advanced` `:178`)
- Test: `apps/server/test/auth/devices.test.ts` (new; harness copied from `sign-in-flows.test.ts:40-110`)

**Interfaces:**
- Produces: `DEVICE_COOKIE = 'gn_device'`; `mintDeviceId(): string`; `deviceKey(id: string): string` (hex sha256); `deviceTag(id: string): string` (4 chars); `deviceSessionHook(opts: { secure: boolean }): (session, ctx) => Promise<{ data: Record<string, unknown> } | void>`; column `session."deviceId" text NULL`, `session."lastSeenAt" timestamptz NULL`, `passkey."lastUsedAt" timestamptz NULL`.

Cases (`## Devices and passkeys (devices plan, 2026-09-30)` in `test-cases/06-auth-visibility.md`):

```markdown
- ❌ **6.300 — a first sign-in (phone OTP) sets `gn_device` (HttpOnly, SameSite=Lax, Path=/, Max-Age 31536000, not Secure over http) and the new session row's `deviceId` equals the cookie's value;** control: the session cookie is still set as before (6.x sign-in cases stay green). Mutation: stop writing `deviceId` in the hook.
- ❌ **6.301 — a second sign-in from the SAME browser (request carries `gn_device`) reuses that id: no new `gn_device` Set-Cookie, and the second session's `deviceId` equals the first's;** control: a sign-in without the cookie mints a different id. Mutation: always mint a new id.
- ❌ **6.302 — magic-link verify and passkey sign-in also record `deviceId`** (both through their real routes); control: phone OTP (6.300). Mutation: register the hook only for phone.
- ❌ **6.303 — a request cookie that is not 43 base64url characters is ignored and replaced** (a new id minted, Set-Cookie sent); control: a well-formed cookie is kept. Mutation: accept any cookie value.
- ❌ **6.304 — over https the cookie gains `Secure`;** control: over http it does not. Mutation: hard-code `secure: false`.
- ❌ **6.305 — a session created with no endpoint context (`ctx === null`, e.g. an internal `createSession`) is created with `deviceId` NULL and the hook does not throw;** control: with context it is set. Mutation: dereference `ctx` unguarded.
- ❌ **6.306 — the migration is additive: existing `session` rows keep `deviceId` NULL and `lastSeenAt` NULL, and a `passkey` row keeps `lastUsedAt` NULL;** control: new columns exist with those types. Mutation: `NOT NULL DEFAULT ''` on `deviceId`.
```

- [ ] **Step 1: Write the failing tests** — `apps/server/test/auth/devices.test.ts`:

```ts
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

const TEST_SECRET = 'devices-test-secret-devices-test-secret';
let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

function build(baseUrl: string) {
  otp = new LogOtpSender(() => {});
  const magic = new LogMagicLinkSender(() => {});
  const auth = createAuth({ pool: db.pool, otpSender: otp, magicLinkSender: magic, baseUrl, secret: TEST_SECRET, webOrigin: 'http://localhost:3001' });
  const ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
  return buildApp({ db: db.pool, pool: db.pool, ingest, auth, serverAppend: (e) => ingest.ingestBatch(e), webOrigin: 'http://localhost:3001', store: createObjectStoreFromEnv({}) });
}

function cookies(headers: Record<string, unknown>): string[] {
  const raw = headers['set-cookie'];
  return raw === undefined ? [] : Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}
const deviceCookie = (h: Record<string, unknown>) => cookies(h).find((c) => c.startsWith('gn_device='));

async function phoneSignIn(phone: string, cookieHeader?: string) {
  const before = otp.sent.length;
  await app.inject({ method: 'POST', url: '/api/auth/phone-number/send-otp', payload: { phoneNumber: phone } });
  return app.inject({
    method: 'POST',
    url: '/api/auth/phone-number/verify',
    payload: { phoneNumber: phone, code: otp.sent[before]?.code },
    headers: cookieHeader === undefined ? {} : { cookie: cookieHeader },
  });
}

async function deviceIdOfLatestSession(phone: string): Promise<string | null> {
  const r = await db.pool.query(
    `SELECT s."deviceId" FROM session s JOIN "user" u ON u.id = s."userId" WHERE u."phoneNumber" = $1 ORDER BY s."createdAt" DESC LIMIT 1`,
    [phone],
  );
  return r.rows[0]?.deviceId ?? null;
}

beforeAll(async () => { db = await createTestDatabase(); app = build('http://localhost:3000'); await app.ready(); });
afterAll(async () => { await app.close(); await db.drop(); });

describe('6.300 first sign-in sets gn_device and records it', () => {
  it('6.300 cookie attributes and session.deviceId', async () => {
    const res = await phoneSignIn('+919000000301');
    expect(res.statusCode).toBe(200);
    const c = deviceCookie(res.headers);
    expect(c).toBeDefined();
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\//);
    expect(c).toMatch(/Max-Age=31536000/);
    expect(c).not.toMatch(/Secure/i);
    const value = (c as string).split(';')[0]!.slice('gn_device='.length);
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await deviceIdOfLatestSession('+919000000301')).toBe(value);
    // CONTROL — the session cookie is still set.
    expect(cookies(res.headers).some((x) => x.startsWith('better-auth.session_token='))).toBe(true);
  });
});

describe('6.301 the same browser keeps its id', () => {
  it('6.301 reuse, no new Set-Cookie; control: no cookie mints another', async () => {
    const first = await phoneSignIn('+919000000302');
    const value = deviceCookie(first.headers)!.split(';')[0]!.slice('gn_device='.length);
    const second = await phoneSignIn('+919000000302', `gn_device=${value}`);
    expect(deviceCookie(second.headers)).toBeUndefined();
    expect(await deviceIdOfLatestSession('+919000000302')).toBe(value);
    const third = await phoneSignIn('+919000000302');
    const other = deviceCookie(third.headers)!.split(';')[0]!.slice('gn_device='.length);
    expect(other).not.toBe(value);
  });
});

describe('6.303 a malformed cookie is replaced', () => {
  it('6.303 junk → new id; control 6.301 keeps a good one', async () => {
    const res = await phoneSignIn('+919000000303', 'gn_device=not-a-device-id');
    const c = deviceCookie(res.headers);
    expect(c).toBeDefined();
    expect((c as string).split(';')[0]).not.toBe('gn_device=not-a-device-id');
  });
});

describe('6.306 the migration is additive', () => {
  it('6.306 column types, NULL defaults', async () => {
    const cols = await db.pool.query(
      `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
        WHERE (table_name = 'session' AND column_name IN ('deviceId','lastSeenAt')) OR (table_name = 'passkey' AND column_name = 'lastUsedAt')
        ORDER BY table_name, column_name`,
    );
    expect(cols.rows).toEqual([
      { table_name: 'passkey', column_name: 'lastUsedAt', data_type: 'timestamp with time zone', is_nullable: 'YES' },
      { table_name: 'session', column_name: 'deviceId', data_type: 'text', is_nullable: 'YES' },
      { table_name: 'session', column_name: 'lastSeenAt', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    ]);
  });
});
```

Also add, in the same file: 6.302 (magic link — request `/api/auth/sign-in/magic-link` with `Origin: http://localhost:3001`, follow the logged URL from `LogMagicLinkSender.sent`, assert the resulting session's `deviceId` is set; passkey — reuse the unit harness the passkey plugin tests use in `apps/server/test/auth` if present, else assert through a direct `deviceSessionHook` call with a fake ctx carrying the passkey path, and record which in the case), 6.304 (build a second app with `baseUrl: 'https://api.example.test'` and assert `Secure`), 6.305 (call `deviceSessionHook({ secure: false })({ ...fakeSession }, null)` and assert it resolves to `{ data: { ..., deviceId: null } }` without throwing).

- [ ] **Step 2: Run to verify it fails.** `cd apps/server && pnpm exec vitest run test/auth/devices.test.ts > /tmp/dev1.log 2>&1; tail -30 /tmp/dev1.log` — FAIL (no column, no cookie).

- [ ] **Step 3: Migration** `apps/server/migrations/1790900000000_devices-and-passkeys.sql`:

```sql
-- Up Migration
-- Devices and passkeys plan (2026-09-30). Additive: three NULLable columns and
-- one index; old code neither reads nor writes them.
ALTER TABLE "session" ADD COLUMN "deviceId" text;
ALTER TABLE "session" ADD COLUMN "lastSeenAt" timestamptz;
ALTER TABLE "passkey" ADD COLUMN "lastUsedAt" timestamptz;
CREATE INDEX IF NOT EXISTS session_user_device_idx ON "session" ("userId", "deviceId");
COMMENT ON COLUMN "session"."deviceId" IS 'The gn_device cookie value this session was created under (32 random bytes, base64url). Groups sessions by browser; carries no authority; never returned raw to a client or logged — clients see sha256 key + 4-char tag.';
COMMENT ON COLUMN "session"."lastSeenAt" IS 'Last authenticated request on this session, stamped by requireSession at most once per 5 minutes. An observation, never an authorisation input.';
COMMENT ON COLUMN "passkey"."lastUsedAt" IS 'Last successful sign-in with this passkey (stamped after /passkey/verify-authentication). An observation, never an authorisation input.';

-- Down Migration
DROP INDEX IF EXISTS session_user_device_idx;
ALTER TABLE "passkey" DROP COLUMN IF EXISTS "lastUsedAt";
ALTER TABLE "session" DROP COLUMN IF EXISTS "lastSeenAt";
ALTER TABLE "session" DROP COLUMN IF EXISTS "deviceId";
```

(`purge/table-rules.ts:65,68` already classify `session` and `passkey` as `not-entity-bearing`; columns inherit it — no change. Run `pnpm check:migrations`.)

- [ ] **Step 4: `apps/server/src/auth/device-cookie.ts`:**

```ts
import { createHash, randomBytes } from 'node:crypto';

/** The browser's long-lived device cookie (devices plan, spec V1). */
export const DEVICE_COOKIE = 'gn_device';
const ONE_YEAR_S = 31_536_000;
const WELL_FORMED = /^[A-Za-z0-9_-]{43}$/;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function mintDeviceId(): string {
  return randomBytes(32).toString('base64url');
}

/** One-way; what a client may hold to name a device. */
export function deviceKey(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

/** 4 upper-case base32 characters of sha256(id) — distinguishes two same-browser machines on screen. */
export function deviceTag(id: string): string {
  const digest = createHash('sha256').update(id).digest();
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 4) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length === 4) break;
  }
  return out;
}

type HookCtx = {
  getCookie: (key: string) => string | null;
  setCookie: (key: string, value: string, options?: Record<string, unknown>) => string;
} | null;

/** `databaseHooks.session.create.before` — every sign-in method creates its session through this. */
export function deviceSessionHook(opts: { secure: boolean }) {
  return async (session: Record<string, unknown>, ctx: HookCtx): Promise<{ data: Record<string, unknown> }> => {
    if (ctx === null) return { data: { ...session, deviceId: null } };
    const presented = ctx.getCookie(DEVICE_COOKIE);
    const deviceId = presented !== null && WELL_FORMED.test(presented) ? presented : mintDeviceId();
    if (deviceId !== presented) {
      ctx.setCookie(DEVICE_COOKIE, deviceId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: opts.secure,
        path: '/',
        maxAge: ONE_YEAR_S,
      });
    }
    return { data: { ...session, deviceId } };
  };
}
```

- [ ] **Step 5: Wire in `auth.ts`** (inside `betterAuth({ ... })`, after `advanced`):

```ts
    session: {
      // Devices plan (Task 1). `returned: false` keeps the raw id out of every
      // better-auth response (listSessions included) — FD4; `input: false` means
      // no client can set it.
      additionalFields: {
        deviceId: { type: 'string', required: false, returned: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: { before: deviceSessionHook({ secure: new URL(deps.baseUrl).protocol === 'https:' }) },
      },
    },
```

(import `deviceSessionHook` from `./device-cookie.js`.) If better-auth's hook signature types `ctx` as `GenericEndpointContext | null`, pass it through as `HookCtx` (the two methods used exist on it — `better-call/dist/context.d.mts:97,99`).

- [ ] **Step 6: Run** `pnpm exec vitest run test/auth/devices.test.ts test/auth/sign-in-flows.test.ts test/auth/require-session.test.ts > /tmp/dev1.log 2>&1; tail -30 /tmp/dev1.log` — PASS; sign-in-flows and require-session (incl. 14.35) unchanged.

- [ ] **Step 7: Catalogue + commit.** Flip 6.300–6.306; Features.md §6 bullet "⚙️ **Device identity on sign-in**" (cookie, column, never raw). `git add … && git commit -m "Devices 1: gn_device cookie and session.deviceId on every sign-in (6.300-6.306)"`.

---

### Task 2: `currentSessionId` and a throttled `lastSeenAt`

**Files:** Modify `apps/server/src/auth/require-session.ts:7-12,96-120`; Test `apps/server/test/auth/require-session.test.ts` (append).

**Interfaces:** Produces `request.currentSessionId: string | null` (null for `mcp-token`); `stampLastSeen(db, sessionId, now): Promise<void>`.

```markdown
- ❌ **6.307 — an authenticated session request stamps `lastSeenAt` when it is NULL or older than 5 minutes;** control: a request 4 m 59 s after the last stamp writes nothing (the value is unchanged). Mutation: stamp on every request.
- ❌ **6.308 — exactly 5 minutes after the stamp, the next request stamps again** (boundary); control: 6.307's 4 m 59 s. Mutation: `>` → `>=` flipped the wrong way (assert both sides).
- ❌ **6.309 — `request.currentSessionId` is the better-auth session's id for a cookie request and `null` for an MCP token request;** control: `currentUserId` unchanged in both. Mutation: set it from the token instead of the id.
- ❌ **6.310 — the stamp never blocks the request: a failing stamp query is logged and the request still succeeds;** control: normal success. Mutation: `await` the stamp outside a try.
```

- [ ] **Step 1: Failing tests** (append):

```ts
describe('6.307/6.308 lastSeenAt is throttled to 5 minutes', () => {
  it('6.307 null → stamped; 4m59s later → unchanged; 6.308 exactly 5m → restamped', async () => {
    let clock = new Date('2026-10-01T00:00:00Z');
    const { app, db, signedIn } = await harnessWithClock(() => clock); // existing file's harness, clock injected into makeRequireSession(auth, db, now)
    const sid = await sessionIdOf(db, signedIn.token);
    await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: `Bearer ${signedIn.token}` } });
    expect(await lastSeen(db, sid)).toEqual(clock);
    const first = clock;
    clock = new Date(first.getTime() + 299_000);
    await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: `Bearer ${signedIn.token}` } });
    expect(await lastSeen(db, sid)).toEqual(first);
    clock = new Date(first.getTime() + 300_000);
    await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: `Bearer ${signedIn.token}` } });
    expect(await lastSeen(db, sid)).toEqual(clock);
  });
});
```

(`harnessWithClock`, `sessionIdOf` (`SELECT id FROM session WHERE token = $1`), `lastSeen` (`SELECT "lastSeenAt"`) are three small helpers added at the top of the file; the bearer token authenticates as a better-auth session via the `bearer()` plugin, so `authKind === 'session'`.) Add 6.309 (register a probe route in the test app that returns `request.currentSessionId`; cookie/bearer-session → the row id; MCP token → null) and 6.310 (a `db` wrapper whose `query` throws for `UPDATE session SET "lastSeenAt"` — the request still answers 200).

- [ ] **Step 2: Run → FAIL.** `pnpm exec vitest run test/auth/require-session.test.ts > /tmp/dev2.log 2>&1; tail -30 /tmp/dev2.log`

- [ ] **Step 3: Implement** — in the `declare module` add `currentSessionId: string | null;`; in the session branch:

```ts
    if (session) {
      request.currentUserId = session.user.id;
      request.authKind = 'session';
      request.currentSessionId = session.session.id;
      try {
        await db.query(
          `UPDATE session SET "lastSeenAt" = $2
            WHERE id = $1 AND ("lastSeenAt" IS NULL OR "lastSeenAt" <= $2::timestamptz - interval '5 minutes')`,
          [session.session.id, now()],
        );
      } catch (cause) {
        request.log.warn({ err: cause }, 'lastSeenAt stamp failed');
      }
      return;
    }
```

and `request.currentSessionId = null;` in the MCP branch.

- [ ] **Step 4: Run → PASS** (whole `test/auth` folder). **Step 5:** flip 6.307–6.310; Features bullet; commit `"Devices 2: currentSessionId and a 5-minute lastSeenAt (6.307-6.310)"`.

---

### Task 3: `GET /v1/me/devices` and `POST /v1/me/devices/:key/sign-out`

**Files:** Create `apps/server/src/routes/me-devices.ts`; register in `apps/server/src/app.ts` beside `registerMcpConnectionRoutes`; Test `apps/server/test/routes/me-devices.test.ts`.

**Interfaces:**
- Consumes: `deviceKey`, `deviceTag` (Task 1); `request.currentSessionId` (Task 2).
- Produces (JSON):

```ts
type DeviceRow = {
  key: string;            // hex sha256(deviceId) — or 'legacy:' + hex sha256(userAgent + '\n' + ipAddress) for pre-V1 sessions
  tag: string | null;     // 4 chars; null for legacy groups
  userAgent: string | null;
  isCurrent: boolean;
  lastSeenAt: string | null;   // max over the device's sessions (falls back to updatedAt when all lastSeenAt are NULL)
  firstSignedInAt: string;     // min createdAt
  sessionCount: number;
  legacy: boolean;
};
// GET /v1/me/devices → { devices: DeviceRow[] }  (current first, then lastSeenAt desc; only unexpired sessions)
// POST /v1/me/devices/:key/sign-out → 204 | 404 { error: 'not_found' } | 409 { error: 'current_device' }
```

```markdown
- ❌ **6.311 — two sessions under one deviceId list as ONE device with `sessionCount` 2, `firstSignedInAt` the earlier createdAt and `lastSeenAt` the later stamp;** control: a second deviceId is a second row. Mutation: group by session id.
- ❌ **6.312 — two devices with the SAME user agent get different `key` and `tag`;** control: the same device's key is stable across calls. Mutation: group by user agent.
- ❌ **6.313 — no response contains the raw deviceId** (JSON body searched for every stored deviceId); control: the key is present. Mutation: return `deviceId` as `key`.
- ❌ **6.314 — expired sessions are not listed, and a device whose sessions are all expired is absent;** control: an unexpired one is. Mutation: drop the `expiresAt > now()` filter.
- ❌ **6.315 — pre-V1 sessions (deviceId NULL) group by user agent + IP as `legacy: true`, `tag: null`;** control: a deviceId session is not legacy. Mutation: put every NULL-deviceId session in one group.
- ❌ **6.316 — the caller's current session's device is `isCurrent: true` and listed first;** control: others false. Mutation: compare by user id.
- ❌ **6.317 — sign-out of another device's key deletes exactly that device's sessions of the CALLER and answers 204;** control: the caller's other devices survive. Mutation: delete by key without the user filter.
- ❌ **6.318 — a key that names another person's device (or no device) answers 404 and deletes nothing;** control: the owner's own key → 204. Mutation: answer 204 for any key.
- ❌ **6.319 — the current device's key answers 409 `current_device` and deletes nothing;** control: another device → 204. Mutation: remove the current-device guard.
- ❌ **6.320 — an MCP-token caller gets 403 on both routes** (devices are a browser concept); control: a session caller → 200. Mutation: allow `authKind === 'mcp-token'`.
```

- [ ] **Step 1: Failing tests** — `apps/server/test/routes/me-devices.test.ts` builds the app as in Task 1, signs one person in three times (two with the same `gn_device`, one without), plus a second person, and inserts one expired and one legacy (`deviceId` NULL) session row directly:

```ts
it('6.311/6.312/6.313 grouping, distinct tags, no raw id', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/me/devices', headers: { cookie: aliceCookieOnDeviceA } });
  expect(res.statusCode).toBe(200);
  const { devices } = res.json() as { devices: Array<Record<string, unknown>> };
  const a = devices.find((d) => d.isCurrent === true)!;
  expect(a.sessionCount).toBe(2);
  const nonLegacy = devices.filter((d) => d.legacy === false);
  expect(new Set(nonLegacy.map((d) => d.key)).size).toBe(nonLegacy.length);
  expect(new Set(nonLegacy.map((d) => d.tag)).size).toBe(nonLegacy.length);
  const stored = await db.pool.query(`SELECT "deviceId" FROM session WHERE "deviceId" IS NOT NULL`);
  for (const row of stored.rows) expect(res.body).not.toContain(row.deviceId);
});
it('6.318 another person’s key → 404, nothing deleted', async () => {
  const bobKey = deviceKey(bobDeviceId);
  const before = await count(db);
  const res = await app.inject({ method: 'POST', url: `/v1/me/devices/${bobKey}/sign-out`, headers: { cookie: aliceCookieOnDeviceA } });
  expect(res.statusCode).toBe(404);
  expect(await count(db)).toBe(before);
});
it('6.319 current device → 409', async () => {
  const res = await app.inject({ method: 'POST', url: `/v1/me/devices/${deviceKey(aliceDeviceA)}/sign-out`, headers: { cookie: aliceCookieOnDeviceA } });
  expect(res.statusCode).toBe(409);
  expect(res.json()).toEqual({ error: 'current_device' });
});
```

(and the remaining cases in the same style: 6.314 inserts `expiresAt = now() - 1 day`; 6.315 inserts two legacy rows with different IPs → two legacy groups; 6.317 signs out device B and asserts only B's rows are gone; 6.320 uses an MCP token from `mcp-tokens` test helpers.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `me-devices.ts`:**

```ts
import { createHash } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db.js';
import { deviceKey, deviceTag } from '../auth/device-cookie.js';

type Row = { id: string; deviceId: string | null; userAgent: string | null; ipAddress: string | null; createdAt: Date; updatedAt: Date; lastSeenAt: Date | null };

const legacyKey = (ua: string | null, ip: string | null) =>
  'legacy:' + createHash('sha256').update(`${ua ?? ''}\n${ip ?? ''}`).digest('hex');
const keyOf = (r: Row) => (r.deviceId === null ? legacyKey(r.userAgent, r.ipAddress) : deviceKey(r.deviceId));

async function liveSessions(db: Queryable, userId: string): Promise<Row[]> {
  const r = await db.query(
    `SELECT id, "deviceId", "userAgent", "ipAddress", "createdAt", "updatedAt", "lastSeenAt"
       FROM session WHERE "userId" = $1 AND "expiresAt" > now()`,
    [userId],
  );
  return r.rows as Row[];
}

export function registerMeDeviceRoutes(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
  const sessionOnly: preHandlerHookHandler = async (request, reply) => {
    if (request.authKind !== 'session') await reply.code(403).send({ error: 'session_required' });
  };

  app.get('/v1/me/devices', { preHandler: [requireSession, sessionOnly] }, async (request) => {
    const rows = await liveSessions(deps.pool, request.currentUserId);
    const groups = new Map<string, Row[]>();
    for (const r of rows) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);
    const devices = [...groups.entries()].map(([key, g]) => {
      const seen = g.map((r) => (r.lastSeenAt ?? r.updatedAt).getTime());
      const first = g.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
      const sample = g[0]!;
      return {
        key,
        tag: sample.deviceId === null ? null : deviceTag(sample.deviceId),
        userAgent: sample.userAgent,
        isCurrent: g.some((r) => r.id === request.currentSessionId),
        lastSeenAt: new Date(Math.max(...seen)).toISOString(),
        firstSignedInAt: first.createdAt.toISOString(),
        sessionCount: g.length,
        legacy: sample.deviceId === null,
      };
    });
    devices.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.lastSeenAt.localeCompare(a.lastSeenAt));
    return { devices };
  });

  app.post<{ Params: { key: string } }>('/v1/me/devices/:key/sign-out', { preHandler: [requireSession, sessionOnly] }, async (request, reply) => {
    const rows = await liveSessions(deps.pool, request.currentUserId);
    const target = rows.filter((r) => keyOf(r) === request.params.key);
    if (target.length === 0) return reply.code(404).send({ error: 'not_found' });
    if (target.some((r) => r.id === request.currentSessionId)) return reply.code(409).send({ error: 'current_device' });
    await deps.pool.query(`DELETE FROM session WHERE "userId" = $1 AND id = ANY($2::text[])`, [request.currentUserId, target.map((r) => r.id)]);
    return reply.code(204).send();
  });
}
```

(Register in `app.ts` next to `registerMcpConnectionRoutes`; add `/v1/me/devices/:key/sign-out` to the HTTP-Origin-checked POST set the way other cookie POSTs are — find it by the `http-origin.ts` route list.)

- [ ] **Step 4: Run → PASS.** **Step 5:** flip 6.311–6.320; Features §6 bullet "✅ **Your devices**"; commit `"Devices 3: GET /v1/me/devices and a scoped per-device sign-out (6.311-6.320)"`.

---

### Task 4: Delete expired sessions daily

**Files:** Create `apps/server/src/ops/expired-sessions.ts`; Modify `apps/server/src/ops/backup-daemon-main.ts` (read the interval beside `PURGE_SWEEP_INTERVAL_MS` `:186-189`; add a `ScheduledJob` after `'purge'` `:289-297`); Modify `.env.example`; Test `apps/server/test/ops/expired-sessions.test.ts` + `backup-daemon-main.test.ts`.

```markdown
- ❌ **6.321 — `deleteExpiredSessions(pool, now)` deletes every session with `expiresAt <= now` and returns the count; unexpired sessions survive;** control: a session expiring 1 s after `now` survives. Mutation: `<` → `<=` on the wrong side / delete all.
- ❌ **6.322 — the worker schedules a job named `expired-sessions` whose delay is `SESSION_SWEEP_INTERVAL_MS` (default 86400000; empty = default; 0 refused and named, aborting the scheduler like the other sweeps);** control: the purge job still scheduled. Mutation: drop the job.
- ❌ **6.323 — `.env.example` documents `SESSION_SWEEP_INTERVAL_MS`** (`pnpm check:env` green); control: check:env fails with it removed. Mutation: remove the line.
```

- [ ] **Step 1: Failing test:**

```ts
import { afterAll, beforeAll, expect, it } from 'vitest';
import { deleteExpiredSessions } from '../../src/ops/expired-sessions.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

it('6.321 deletes expired, keeps unexpired', async () => {
  const now = new Date('2026-10-01T00:00:00Z');
  await db.pool.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ('u1','U','u1@x.test',true,now(),now())`);
  const ins = (id: string, exp: string) => db.pool.query(
    `INSERT INTO session (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1,$2,$1,now(),now(),'u1')`, [id, exp]);
  await ins('old', '2026-09-30T23:59:59Z');
  await ins('edge', '2026-10-01T00:00:00Z');
  await ins('live', '2026-10-01T00:00:01Z');
  expect(await deleteExpiredSessions(db.pool, now)).toBe(2);
  const left = await db.pool.query(`SELECT id FROM session ORDER BY id`);
  expect(left.rows.map((r) => r.id)).toEqual(['live']);
});
```

(The `user` insert must satisfy the live `user` columns — copy the column list from `test/auth/auth-tables.test.ts` if it differs.)

- [ ] **Step 2: FAIL.** **Step 3:**

```ts
import type { Queryable } from '../db.js';

/** Devices plan Task 4: expired sessions are never listed; this keeps the table from growing forever (831 rows for one dev account, 2026-09-30). */
export async function deleteExpiredSessions(pool: Queryable, now: Date): Promise<number> {
  const r = await pool.query(`DELETE FROM session WHERE "expiresAt" <= $1`, [now]);
  return r.rowCount ?? 0;
}
```

In `backup-daemon-main.ts`, beside `rawPurgeInterval`:

```ts
  const rawSessionInterval = process.env.SESSION_SWEEP_INTERVAL_MS;
  const sessionSweepIntervalMs = Number(
    rawSessionInterval === undefined || rawSessionInterval.trim() === '' ? '86400000' : rawSessionInterval,
  );
```

and after the `'purge'` job:

```ts
    {
      name: 'expired-sessions',
      run: async (): Promise<void> => {
        const deleted = await deleteExpiredSessions(pool, new Date());
        console.log(JSON.stringify({ msg: 'expired-session sweep complete', deleted }));
      },
      delayMs: () => requirePositiveIntervalMs(sessionSweepIntervalMs, 'SESSION_SWEEP_INTERVAL_MS'),
    },
```

`.env.example`: `SESSION_SWEEP_INTERVAL_MS=` with a one-line comment "(worker) how often expired better-auth sessions are deleted; default 86400000 (daily)". Extend `backup-daemon-main.test.ts` with 6.322 in the shape of its existing `AUTO_CLOSE_SWEEP_INTERVAL_MS` refusal case (`:186`).

- [ ] **Step 4: PASS** (`test/ops`) + `pnpm check:env`. **Step 5:** flip 6.321–6.323; Features §13 ops bullet; commit `"Devices 4: daily expired-session delete in the worker (6.321-6.323)"`.

---

### Task 5: Passkeys — provider label, `lastUsedAt`, `GET /v1/me/passkeys`

**Files:** Create `apps/server/src/auth/passkey-providers.ts`, `apps/server/src/routes/me-passkeys.ts`; Modify `apps/server/src/auth/auth.ts` (`hooks.after`); register the route in `app.ts`; Test `apps/server/test/auth/passkey-providers.test.ts`, `apps/server/test/routes/me-passkeys.test.ts`.

**Interfaces:** Produces `providerOf(aaguid: string | null): string`; `GET /v1/me/passkeys → { passkeys: Array<{ id: string; name: string | null; provider: string; createdAt: string; lastUsedAt: string | null; notUsedRecently: boolean }> }`.

```markdown
- ❌ **6.324 — `providerOf` maps each known AAGUID to its label** (iCloud Keychain `fbfc3007-154e-4ecc-8c0b-6e020557d7bd`, Google Password Manager `ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4`, Windows Hello `08987058-cadc-4b81-b6e1-30de50dcbe96`, 1Password `bada5566-a7aa-401f-bd96-45619a55120d`, Bitwarden `d548826e-79b4-db40-a3d8-11116f7e8349`, Dashlane `531126d6-e717-415c-9320-3d9aa6981239`, Chrome on Mac `adce0002-35bc-c60a-648b-0b25f1f05503`) and anything else (including the all-zero AAGUID and null) to "Security key or other"; control: the returned label is never a UUID. Mutation: return the AAGUID for unknowns.
- ❌ **6.325 — a successful passkey sign-in stamps that passkey's `lastUsedAt` (and only that one);** control: the person's other passkey stays NULL. Mutation: stamp every passkey of the user.
- ❌ **6.326 — a FAILED passkey verification stamps nothing;** control: 6.325. Mutation: stamp before checking `newSession`.
- ❌ **6.327 — `GET /v1/me/passkeys` returns only the caller's passkeys with provider, createdAt, lastUsedAt and never `publicKey`/`credentialID`/`counter`;** control: another person's passkeys absent. Mutation: `SELECT *`.
- ❌ **6.328 — `notUsedRecently` is true for `lastUsedAt` NULL or older than 90 days, false at exactly 89 d 23 h 59 m;** control: exactly 90 days → true. Mutation: 30 days.
- ❌ **6.329 — an MCP-token caller gets 403;** control: a session caller → 200. Mutation: allow MCP tokens.
```

- [ ] **Step 1: Failing tests** — `passkey-providers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { providerOf } from '../../src/auth/passkey-providers.js';

describe('6.324 AAGUID → provider', () => {
  it.each([
    ['fbfc3007-154e-4ecc-8c0b-6e020557d7bd', 'iCloud Keychain'],
    ['ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4', 'Google Password Manager'],
    ['08987058-cadc-4b81-b6e1-30de50dcbe96', 'Windows Hello'],
    ['bada5566-a7aa-401f-bd96-45619a55120d', '1Password'],
    ['d548826e-79b4-db40-a3d8-11116f7e8349', 'Bitwarden'],
    ['531126d6-e717-415c-9320-3d9aa6981239', 'Dashlane'],
    ['adce0002-35bc-c60a-648b-0b25f1f05503', 'Chrome on Mac'],
  ])('6.324 %s → %s', (aaguid, label) => expect(providerOf(aaguid)).toBe(label));
  it('6.324 unknowns never show a UUID', () => {
    for (const x of ['00000000-0000-0000-0000-000000000000', '12345678-1234-1234-1234-123456789abc', null]) {
      expect(providerOf(x)).toBe('Security key or other');
    }
  });
});
```

`me-passkeys.test.ts` inserts passkey rows directly (the columns listed in the spec §1) for two users and asserts 6.327–6.329; 6.325/6.326 drive `/api/auth/passkey/verify-authentication` through the test app — if a real WebAuthn assertion cannot be produced in the server suite, test the after-hook in isolation: export `passkeyLastUsedHook(pool)` and call it with a fake ctx `{ path: '/passkey/verify-authentication', body: { response: { id: '<credentialID>' } }, context: { newSession: { user: { id: 'u1' } } } }` (and `newSession: null` for 6.326); record which in the case text. The real round trip is 6.357 (Task 8, browser).

- [ ] **Step 2: FAIL.** **Step 3:** `passkey-providers.ts`:

```ts
const PROVIDERS: Record<string, string> = {
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud Keychain',
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
  '531126d6-e717-415c-9320-3d9aa6981239': 'Dashlane',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome on Mac',
};
export const UNKNOWN_PROVIDER = 'Security key or other';
export function providerOf(aaguid: string | null): string {
  return aaguid === null ? UNKNOWN_PROVIDER : (PROVIDERS[aaguid.toLowerCase()] ?? UNKNOWN_PROVIDER);
}
```

In `auth.ts` (import `createAuthMiddleware` from `better-auth/api`):

```ts
    hooks: {
      after: createAuthMiddleware(async (ctx) => passkeyLastUsedHook(deps.pool)(ctx)),
    },
```

with, in `passkey-providers.ts` (or a sibling `passkey-last-used.ts`):

```ts
export function passkeyLastUsedHook(pool: Queryable) {
  return async (ctx: { path: string; body?: unknown; context: { newSession?: { user: { id: string } } | null } }) => {
    if (ctx.path !== '/passkey/verify-authentication') return;
    const userId = ctx.context.newSession?.user.id;
    const credentialId = (ctx.body as { response?: { id?: unknown } } | undefined)?.response?.id;
    if (userId === undefined || typeof credentialId !== 'string') return;
    await pool.query(`UPDATE passkey SET "lastUsedAt" = now() WHERE "credentialID" = $1 AND "userId" = $2`, [credentialId, userId]);
  };
}
```

`me-passkeys.ts`:

```ts
export function registerMePasskeyRoutes(app: FastifyInstance, deps: { pool: Queryable; now?: () => Date }, requireSession: preHandlerHookHandler): void {
  const now = deps.now ?? (() => new Date());
  app.get('/v1/me/passkeys', { preHandler: requireSession }, async (request, reply) => {
    if (request.authKind !== 'session') return reply.code(403).send({ error: 'session_required' });
    const r = await deps.pool.query(
      `SELECT id, name, aaguid, "createdAt", "lastUsedAt" FROM passkey WHERE "userId" = $1 ORDER BY "createdAt"`,
      [request.currentUserId],
    );
    const cutoff = now().getTime() - 90 * 24 * 60 * 60 * 1000;
    return {
      passkeys: r.rows.map((p) => ({
        id: p.id,
        name: p.name,
        provider: providerOf(p.aaguid),
        createdAt: p.createdAt.toISOString(),
        lastUsedAt: p.lastUsedAt === null ? null : p.lastUsedAt.toISOString(),
        notUsedRecently: p.lastUsedAt === null || p.lastUsedAt.getTime() <= cutoff,
      })),
    };
  });
}
```

- [ ] **Step 4: PASS.** **Step 5:** flip 6.324–6.329; Features §6 bullet; commit `"Devices 5: passkey provider, lastUsedAt, GET /v1/me/passkeys (6.324-6.329)"`.

---

### Task 6: Account → "Sign-in and devices", one row per device

**Files:** Create `packages/app-core/src/account/relative-time.ts`; Modify `packages/app-core/src/account/sessions-client.ts`, `sessions-section.tsx`, `apps/web/src/account/account-clients.ts` (`createSessionsClient` `:98-122`), `apps/web/app/account/page.tsx:327-332`; Test `packages/app-core/test/account/sessions-section.test.tsx`, `packages/app-core/test/account/relative-time.test.ts`. UI work: invoke `ui-ux-pro-max`; styles in `apps/web/app/globals.css` beside `.gn-account__session-row` on the refreshed vocabulary (raised panel, 44px rows, quiet `Sign out this device`).

**Interfaces:**

```ts
export type DeviceSummary = {
  key: string; tag: string | null; label: string; isCurrent: boolean;
  lastSeenAt: string | null; firstSignedInAt: string; sessionCount: number; legacy: boolean;
};
export interface SessionsClient {
  list(): Promise<DeviceSummary[]>;
  signOutDevice(key: string): Promise<{ error: string | null }>;
  signOutOthers(): Promise<{ error: string | null }>;
}
export function relativeTime(iso: string, now: Date): string; // "Active now" (<5 min) | "N minutes ago" | "N hours ago" | "N days ago" (<7) | formatted date
```

```markdown
- ❌ **6.330 — `relativeTime`: 4 m 59 s → "Active now", 5 m → "5 minutes ago", 3 h → "3 hours ago", 2 d → "2 days ago", 8 d → the date;** control: future timestamps → "Active now". Mutation: threshold 1 minute.
- ❌ **6.331 — the section renders one row per device: "<browser> on <os> · <TAG>", "This device" on the current, the relative last activity, "First signed in <date>", and "N sign-ins" when N > 1;** control: a legacy group reads "Older sign-in" with no tag. Mutation: drop the tag.
- ❌ **6.332 — the heading reads "Sign-in and devices · N signed in · M active" (owner ruling A, FD3), N = devices, M = devices whose `lastSeenAt` is within 24 h;** control: N counts devices, not sessions. Mutation: count sessions; mutation: M counts every device.
- ❌ **6.339 — devices split into "Active in the last 24 hours" (the current device always there) and a collapsed "Signed in, idle (N)" group for `lastSeenAt` older than 24 h; expanding it shows those rows;** control: with every device active the idle group is not rendered. Mutation: threshold 7 days; mutation: current device placed by `lastSeenAt` rather than forced active.
- ❌ **6.333 — "Sign out this device" appears on every row except the current and calls `signOutDevice(key)`; "Sign out all other devices" appears once when there is more than one device and calls `signOutOthers()`;** control: a single device shows neither. Mutation: show the row action on the current device.
- ❌ **6.334 — the web client reads `GET /v1/me/devices` (not `authClient.listSessions`) and `signOutOthers` calls better-auth's `revokeOtherSessions`;** control: a refused sign-out's error is shown (the existing E2-24(b) behaviour). Mutation: keep `listSessions`.
```

- [ ] **Step 1: Failing tests** — `relative-time.test.ts`:

```ts
import { expect, it } from 'vitest';
import { relativeTime } from '../../src/account/relative-time.js';
const now = new Date('2026-10-01T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
it('6.330 thresholds', () => {
  expect(relativeTime(ago(299_000), now)).toBe('Active now');
  expect(relativeTime(ago(300_000), now)).toBe('5 minutes ago');
  expect(relativeTime(ago(3 * 3_600_000), now)).toBe('3 hours ago');
  expect(relativeTime(ago(2 * 86_400_000), now)).toBe('2 days ago');
  expect(relativeTime(ago(8 * 86_400_000), now)).toMatch(/2026/);
  expect(relativeTime(new Date(now.getTime() + 60_000).toISOString(), now)).toBe('Active now');
});
```

`sessions-section.test.tsx` (replace the session-row cases the new model supersedes; amend their catalogue ids in place, noting "Amended 2026-09-30 by the devices plan"):

```tsx
const devices: DeviceSummary[] = [
  { key: 'k1', tag: '7F3K', label: 'Chrome on macOS', isCurrent: true, lastSeenAt: new Date().toISOString(), firstSignedInAt: '2026-09-12T10:00:00Z', sessionCount: 1, legacy: false },
  { key: 'k2', tag: 'Q2ZA', label: 'Chrome on macOS', isCurrent: false, lastSeenAt: '2026-09-29T10:00:00Z', firstSignedInAt: '2026-09-20T10:00:00Z', sessionCount: 3, legacy: false },
  { key: 'legacy:x', tag: null, label: 'Safari on iOS', isCurrent: false, lastSeenAt: '2026-09-28T10:00:00Z', firstSignedInAt: '2026-09-01T10:00:00Z', sessionCount: 1, legacy: true },
];
it('6.331/6.332/6.333 rows, heading count, actions', async () => {
  const onSignOut = vi.fn(); const onSignOutOthers = vi.fn();
  render(<SessionsSection devices={devices} onSignOutDevice={onSignOut} onSignOutOthers={onSignOutOthers} now={new Date('2026-10-01T00:00:00Z')} />);
  expect(screen.getByRole('heading', { name: 'Sign-in and devices · 3 signed in · 1 active' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Signed in, idle \(2\)/ })).toBeTruthy(); // 6.339 — k2 and the legacy Safari are older than 24 h on 2026-10-01
  expect(screen.getByText('Chrome on macOS · 7F3K')).toBeTruthy();
  expect(screen.getByText('Chrome on macOS · Q2ZA')).toBeTruthy();
  expect(screen.getByText('This device')).toBeTruthy();
  expect(screen.getByText('3 sign-ins')).toBeTruthy();
  expect(screen.getByText('Older sign-in · Safari on iOS')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /Sign out this device/ })).toHaveLength(2);
  await userEvent.click(screen.getAllByRole('button', { name: /Sign out this device/ })[0]!);
  expect(onSignOut).toHaveBeenCalledWith('k2');
  await userEvent.click(screen.getByRole('button', { name: 'Sign out all other devices' }));
  expect(onSignOutOthers).toHaveBeenCalledTimes(1);
});
it('6.333 control: one device → no actions', () => {
  render(<SessionsSection devices={[devices[0]!]} onSignOutDevice={vi.fn()} onSignOutOthers={vi.fn()} now={new Date()} />);
  expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
});
```

(Each "Sign out this device" button's accessible name includes the row label and tag, e.g. "Sign out this device — Chrome on macOS · Q2ZA", so repeated buttons stay addressable.)

- [ ] **Step 2: FAIL.** **Step 3: Implement** `relative-time.ts`, the new types, the section (keep the existing error alert, the hedged empty state "No signed-in devices to show.", and the append-only history note), and in `account-clients.ts`:

```ts
export function createSessionsClient(): SessionsClient {
  return {
    async list() {
      const res = await fetch(`${API_ORIGIN}/v1/me/devices`, { credentials: 'include' });
      if (!res.ok) return [];
      const { devices } = (await res.json()) as { devices: Array<Omit<DeviceSummary, 'label'> & { userAgent: string | null }> };
      return devices.map((d) => ({ ...d, label: deviceLabelOf(d.userAgent) }));
    },
    async signOutDevice(key) {
      const res = await fetch(`${API_ORIGIN}/v1/me/devices/${encodeURIComponent(key)}/sign-out`, { method: 'POST', credentials: 'include' });
      return { error: res.ok ? null : 'That device could not be signed out. Try again.' };
    },
    async signOutOthers() {
      const result = await authClient.revokeOtherSessions();
      return { error: result.error?.message ?? null };
    },
  };
}
```

(`API_ORIGIN`: use whatever origin the file's other `fetch` calls use — the web rewrites `/v1/*` to the API, so a relative `/v1/me/devices` is the existing pattern if present; match it.) Wire `page.tsx` to the new props.

- [ ] **Step 4: PASS** (`packages/app-core` account tests + `apps/web` account tests); build. **Step 5:** flip 6.330–6.334; amend the superseded session-row cases; Features §3 account bullet edited in place; `pnpm check:help` (update the help/manual paragraph about "Sign-in and devices" if it describes rows); commit `"Devices 6: Sign-in and devices grouped by device (6.330-6.334)"`.

---

### Task 7: Account → "Passkeys", grouped by provider

**Files:** Modify `packages/app-core/src/account/passkey-client.ts:20-26`, `passkeys-section.tsx`, `apps/web/src/account/account-clients.ts` (`createPasskeyClient`), `apps/web/app/account/page.tsx:334-340`; Test `packages/app-core/test/account/passkeys-section.test.tsx`. `ui-ux-pro-max` for the UI.

**Interfaces:** `PasskeySummary = { id: string; name: string | null; provider: string; createdAt: string; lastUsedAt: string | null; notUsedRecently: boolean }`; `PasskeyClient.list()` reads `GET /v1/me/passkeys`; `add`/`remove` unchanged (plugin).

```markdown
- ❌ **6.335 — passkeys are grouped under their provider heading (e.g. "iCloud Keychain · 2"), each row showing its name (or "Unnamed passkey"), "Added <date>" and "Last used <relative>" / "Never used";** control: a single provider still shows its heading. Mutation: flat list.
- ❌ **6.336 — a passkey with `notUsedRecently` shows "Not used recently" next to its Remove button;** control: a recently used one does not. Mutation: ignore the flag.
- ❌ **6.337 — the web client reads `GET /v1/me/passkeys`; Add and Remove still go through the passkey plugin and the list refreshes after each;** control: a failed list read keeps the existing `listFailed` wording. Mutation: keep `listUserPasskeys` for the list.
```

- [ ] **Step 1: Failing test:**

```tsx
const passkeys: PasskeySummary[] = [
  { id: 'p1', name: 'MacBook', provider: 'iCloud Keychain', createdAt: '2026-09-18T10:00:00Z', lastUsedAt: '2026-09-30T10:00:00Z', notUsedRecently: false },
  { id: 'p2', name: null, provider: 'iCloud Keychain', createdAt: '2026-06-01T10:00:00Z', lastUsedAt: null, notUsedRecently: true },
  { id: 'p3', name: 'YubiKey', provider: 'Security key or other', createdAt: '2026-09-01T10:00:00Z', lastUsedAt: '2026-09-02T10:00:00Z', notUsedRecently: false },
];
it('6.335/6.336 grouped rows and the stale flag', () => {
  render(<PasskeysSection passkeys={passkeys} onAdd={vi.fn()} onRemove={vi.fn()} error={null} listFailed={false} now={new Date('2026-10-01T00:00:00Z')} />);
  expect(screen.getByRole('heading', { name: 'iCloud Keychain · 2' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Security key or other · 1' })).toBeTruthy();
  expect(screen.getByText('Unnamed passkey')).toBeTruthy();
  expect(screen.getByText('Never used')).toBeTruthy();
  expect(screen.getAllByText('Not used recently')).toHaveLength(1);
});
```

- [ ] **Step 2: FAIL. Step 3: Implement** (group with a stable provider order: providers sorted by label, "Security key or other" last). **Step 4: PASS. Step 5:** flip 6.335–6.337; Features; `pnpm check:help`; commit `"Devices 7: passkeys grouped by provider, last used, not used recently (6.335-6.337)"`.

---

### Task 8: Test hygiene, and the browser pass

**Files:** Create `apps/web/e2e-stack/global-teardown.ts`; Modify `apps/web/playwright.stack.config.ts:41` (`globalTeardown`); Modify `apps/web/e2e-stack/global-setup.ts` (write the run's start time to `process.env.GISIK_E2E_RUN_STARTED_AT` / a temp file the teardown reads).

```markdown
- ❌ **6.338 — the e2e-stack teardown deletes the sessions and passkeys the run created for the `@e2e.gisik-nokma.local` accounts (`createdAt >=` the run's start), through the same `docker compose exec` channel the setup already uses to seed;** control: rows created before the run survive. Mutation: skip the `createdAt` bound (deletes the owner's own dev sessions).
- 🧪 **6.355 — two browsers signed in as the same person show TWO devices with different tags; the current one reads "This device"; "Sign out this device" on the other removes it and that browser is signed out on its next request.**
- 🧪 **6.356 — signing out and back in on the same browser keeps ONE device row (the tag is unchanged).**
- 🧪 **6.357 — a passkey sign-in on the dev stack stamps "Last used Active now"/"Last used just now" on that passkey, and the provider heading names its authenticator ("Chrome on Mac" or "Security key or other" for a virtual one).**
```

- [ ] **Step 1: Teardown** (`global-teardown.ts`):

```ts
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export default async function globalTeardown(): Promise<void> {
  const started = process.env.GISIK_E2E_RUN_STARTED_AT;
  if (started === undefined) return; // setup did not run — nothing of ours to remove
  const sql = `
    DELETE FROM session s USING "user" u
     WHERE u.id = s."userId" AND u.email LIKE '%@e2e.gisik-nokma.local' AND s."createdAt" >= '${started}'::timestamptz;
    DELETE FROM passkey p USING "user" u
     WHERE u.id = p."userId" AND u.email LIKE '%@e2e.gisik-nokma.local' AND p."createdAt" >= '${started}'::timestamptz;`;
  execFileSync(
    'docker',
    ['compose', '-f', 'docker-compose.dev.yml', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'],
    { cwd: REPO_ROOT, input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
  );
}
```

(`started` is an ISO string the setup produced — `new Date().toISOString()` — never user input. Match the compose service name and `-T`/`exec` shape to what `global-setup.ts`'s `seedArgv` already uses.) In `global-setup.ts` add `process.env.GISIK_E2E_RUN_STARTED_AT = new Date().toISOString();` at the top of the default export (Playwright runs setup and teardown in the same process). Pin 6.338 with a unit test that runs the SQL against the test database (54329) — insert two e2e sessions (one before, one after the bound) and one non-e2e session, execute the two statements with `started` bound, assert only the after-bound e2e rows are gone.

- [ ] **Step 2:** Run the e2e-stack suite once on the dev stack (`pnpm --filter web test:e2e:stack` or the repo's script for `playwright.stack.config.ts`) and record session/passkey counts for the e2e accounts before and after (they must return to the pre-run numbers).

- [ ] **Step 3: Browser pass (controller, 🧪):** `ctl rebuild`; sign in on the dev stack in two browsers (the owner's Chrome profile tab and the chrome-devtools browser) as the e2e owner; check 6.355–6.357 and record evidence inline on each case; remove what the check created (sign the second browser out; delete a passkey registered for 6.357 if one was added).

- [ ] **Step 4:** Catalogue + Features; commit `"Devices 8: e2e-stack teardown; browser pass evidence (6.338, 6.355-6.357)"`.

---

## Case allocation (§6, `test-cases/06-auth-visibility.md`)

| Block | Task |
|---|---|
| 6.300–6.306 | 1 device cookie + migration |
| 6.307–6.310 | 2 lastSeenAt + currentSessionId |
| 6.311–6.320 | 3 devices read + sign-out |
| 6.321–6.323 | 4 expired-session delete |
| 6.324–6.329 | 5 passkeys server |
| 6.330–6.334 | 6 devices UI |
| 6.335–6.337 | 7 passkeys UI |
| 6.338, 6.355–6.357 | 8 hygiene + browser |
| 6.339–6.354, 6.358–6.359 | free (this plan's follow-ups) |

## Self-review

- **Spec coverage:** V1 → Task 1 (apps half dropped, FD1); V2 → Tasks 3, 6; V3 → Tasks 3, 6 (30-day split replaced, FD3); V4 → Tasks 3, 6; V5 → Tasks 3 (legacy grouping), 6; V6 → Task 4; V7 → Tasks 5, 7; V8 → Tasks 4, 8; §4 tag/relative/heading → Tasks 1, 6; §5 security → 6.313, 6.317–6.320, 6.327, 6.329; §6 testing → every task + Task 8 browser.
- **Placeholders:** none; the two "record which in the case" branches (6.302 passkey path, 6.325/6.326 hook isolation) are decisions the implementer must state, with both shapes given.
- **Types:** `deviceKey`/`deviceTag`/`deviceSessionHook` (Task 1) used in Task 3; `DeviceSummary`/`SessionsClient` (Task 6) match the route's `DeviceRow` plus the client-side `label`; `PasskeySummary` (Task 7) matches `GET /v1/me/passkeys` (Task 5).
- **Review Focus:** 1 → 6.302 (+ Google via the shared `session.create.before`, which every method uses); 2 → 6.318; 3 → 6.319; 4 → 6.307/6.308, 6.328; 5 → 6.305.
