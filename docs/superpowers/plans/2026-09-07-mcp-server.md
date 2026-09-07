# Landed 2026-09-07 — implementation plan, not yet executed

**Filename: `2026-09-07-mcp-server.md`, date-only.** Every one of the thirteen files already in
`docs/superpowers/plans/` is `2026-08-20-NN-<slug>.md`. That `NN-` ordered **one closed series** — the
11-plan series whose coordination doc is `…-00-series-coordination.md`, and whose sequence section was
retired on 2026-09-07 (`ALL 177 TASKS ARE DONE`). Extending that numbering would enrol this work in a
finished series and imply a coordination-doc row that does not exist. The date half of the convention is
real and kept; the series-number half retires with the series. It also matches the `writing-plans`
default and the sibling `docs/superpowers/specs/2026-09-07-mcp-server-design.md`.

> ### ⚠ THIS FILE IS INVISIBLE TO `check:tasks`, AND THAT IS A CHECK THAT CANNOT FAIL
>
> `scripts/check-task-ledger.mjs:145` matches plan files with `/^2026-08-20-(\d\d)-.*\.md$/`.
> **Verified empirically at `e260d99`, not read off the plan:** that exact regex is on that exact line,
> `2026-08-20-09-editor-attachments.md` matches it and `2026-09-07-mcp-server.md` does not. So this
> plan's eleven tasks get **no ledger rows and no `done`-against-`origin/main` validation**, while
> `check:tasks` keeps reporting `177/177` and tracking nothing new.
>
> **Task 11 fixes the gate.** Until it lands, do not read a green `check:tasks` as saying anything
> whatsoever about this plan. Open question 6 offers the owner the alternative (take a series number
> instead), which would shrink Task 11 Step 4 to adding `'12'` to `PLANS_WITH_TASKS`.

**Authorship and verification.** Written by a planning session with no history in this repo, then
verified against the tree by the serial executor before landing. What was checked, so a reader knows the
warrant: **all 32 line-anchored citations resolve and none is out of range**; the ledger-gate regex above
was reproduced empirically; and the load-bearing "already exists, do not rebuild" claims were each read
at their cited line — `auth.ts:236` (`bearer()`, comment verbatim), `require-session.ts:60`
(`auth.api.getSession`), `invites.ts:134` (`hashToken`), `http-origin.ts:151`
(`HTTP_ORIGIN_PROTECTED_ROUTES`) and `:213` (`if (input.cookie === undefined) return false`),
`app.ts:428` (the `/v1/events` rate-limit branch), `envelope.ts:26` (`ORIGINS`, no `'mcp'`),
`config.ts:191-192` (120 / 60). The `invite_tokens` projection-exclusion claim is **stronger** than the
plan states: `projections/proj-invites.ts` forbids naming that table at all, with the reason in its
docblock. Nothing verified turned out to be wrong.

**This plan is not executed.** It lands as a document. Its seven open questions go to the owner first —
they are not the executor's to decide.

---

# Gisik Nokma MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person's own AI assistant operate Gisik Nokma as *them* — search, read, create, transition, comment on and assign tickets — through a local MCP server that is a pure HTTP client of the existing API, inventing no rule the product does not already enforce.

**Architecture:** A new package, `packages/mcp-server`, speaks MCP over stdio and HTTP to `apps/server`. It holds no database handle, imports nothing from `apps/server/src`, and re-derives no business logic: reads are passthroughs of existing routes and every write is a domain event posted to `POST /v1/events`, where the same permission gate, rule engine and visibility rules that judge the web client judge it. Authentication is a device-authorization flow — the CLI mints a device code, the person approves it in the browser session they already have, and the CLI receives an opaque personal access token it caches at `~/.gisik-nokma/mcp-token` (mode `0600`). The token is a **sibling credential** to a better-auth session: hashed at rest in a server-owned table that no projection may touch, resolved by `require-session.ts` only **after** better-auth has answered `null`.

**Tech Stack:** `@modelcontextprotocol/sdk ^1.30.0` (stdio transport), TypeScript strict ESM on Node 22, zod ^3.25.0 schemas imported from `@gisik-nokma/domain`, Fastify 5 + Postgres 16 on the server side, Vitest 3, node-pg-migrate 7 SQL migrations.

**Spec:** `docs/superpowers/specs/2026-09-07-mcp-server-design.md` — approved by the owner 2026-09-07. The plan argues from the spec; executors read both. Where this plan departs from the spec's letter it says so in the task and again under **Open questions**.

## Global Constraints

Copied from the repository's live conventions, verified against the tree at `ebe5ed8`. Every task's requirements implicitly include this section.

- **MONOREPO:** pnpm workspaces + Turborepo. `packageManager` is `pnpm@9.15.0`; root `engines.node` is `">=22.0.0 <23"`; `.nvmrc` is `22`; `.npmrc` sets `engine-strict=true` — **a wrong Node version makes `pnpm install` exit 1 with zero output.** Package scope is `@gisik-nokma/*`, `"private": true`, `"version": "0.1.0"`.
- **ESM everywhere.** `"type": "module"`; `module`/`moduleResolution` are `NodeNext`; `verbatimModuleSyntax` is on, so **relative imports in source carry the `.js` suffix** (`import { x } from './y.js'`) and type-only imports must say `import type`.
- **TypeScript:** every package extends `tsconfig.base.json` — `strict: true` **and `noUncheckedIndexedAccess: true`** (an indexed read is `T | undefined`; `arr[0]` needs a guard). Build is `tsc -p tsconfig.json` into `dist/`, never a bundler.
- **TESTING:** Vitest ^3.1.0. Tests live in `test/**/*.test.ts` — **never colocated in `src/`**. Tests import from `../src/<file>.js` (source), not the built barrel.
- **Pinned dev versions to copy:** `typescript ^5.6.3`, `vitest ^3.1.0`, `@types/node ^22.10.0`, `zod ^3.25.0`, `ulidx ^2.4.1`.
- **NEVER pipe a test or build run into `head` or `grep -m N`.** It orphans the vitest worker pool at `ppid=1` and has already cost this machine a forced restart (repo `CLAUDE.md`, incident 2026-09-04). Use `| tail -N`, or `> /tmp/run.log 2>&1` then read the file.
- **IDS:** ULID via `newUlid()` from `@gisik-nokma/domain`. `ULID_REGEX` is the arbiter of validity.
- **EVENT ENVELOPE (exact, `packages/domain/src/envelope.ts:149`):**

```ts
type EventEnvelope = {
  id: string; workspaceId: string;
  entity: { kind: EntityKind; id: string };
  type: string; version: number; payload: unknown;
  actorId: string; origin: Origin;
  clientTime: string; serverTime: string; seq: number;
};
type SubmittedEvent = Omit<EventEnvelope, 'serverTime' | 'seq'>;
```

- **`ORIGINS = ['web', 'mobile', 'desktop', 'server', 'mcp']`** — `envelope.ts:26`. **`'mcp'` is added by
  Task 0** (owner ruling 1); it is NOT in the enum on `main` today, so Task 0 lands before any write.
  Every write in this plan submits `origin: 'mcp'`, so the ledger can tell a claim a person typed from
  one their assistant made on their behalf. `'server'` is refused at the client door.
- **`origin: 'server'` is refused at the client door** (`apps/server/src/permissions/check-permission.ts:403`), and `actorId` must equal the session user (`:400`). The MCP server therefore **must know its own user id** — Task 3 makes the token exchange return it, because no read route on this surface carries it (there is no `GET /v1/me`).
- **INGEST RESULT (exact, `packages/domain/src/ingest-result.ts:14`) — three statuses, no more:**

```ts
type IngestResult =
  | { status: 'committed'; eventId: string; seq: number; serverTime: string }
  | { status: 'invalid';   eventId: string | null; code: IngestErrorCode; message: string }
  | { status: 'refused';   eventId: string; rule: string; reason: string };
```

  `IngestErrorCode` = `'malformed-envelope' | 'unknown-event-type' | 'unknown-event-version' | 'entity-kind-mismatch' | 'invalid-payload' | 'duplicate-event-id'`. `POST /v1/events` answers **200 with `{results}`** for refusals and envelope errors alike; an HTTP error means "this was not a batch".
- **Refusal bodies on the read surface are single-key `{ error: '<code>' }`** — `READ_NOT_FOUND_BODY = { error: 'not_found' }` (`apps/server/src/read/membership.ts:15`), `UNAUTHENTICATED_BODY = { error: 'unauthenticated' }` (`auth/require-session.ts:37`). There is no `{refused, rule, reason}` HTTP body anywhere; that shape exists only inside `results[]`.
- **A refusal's own words are never paraphrased.** Every `reason`, `message` and `error` this package surfaces travels to the MCP client verbatim.
- **MIGRATIONS:** `apps/server/migrations/<epoch-milliseconds>_<kebab-name>.sql`, plain SQL with literal `-- Up Migration` / `-- Down Migration` markers. A down migration is always written. Every table and every non-obvious column gets a `COMMENT ON` saying what the row means.
- **Server tests:** one database per test file via `createTestDatabase()` (`apps/server/test/helpers/db.ts`); the app via `buildTestApp(db, overrides)` (`test/helpers/app.ts`); sign-in via `signInWithPhone(app, otp, phone)` (`test/helpers/session.ts`) which returns `{ token, userId }` — **bearer, not cookie**, and the phone number must be unique per call within a file.
- **Features.md §14 and `test-cases/14-mcp-server.md` move in the SAME change set as the work**, never a follow-up (workspace `CLAUDE.md`). This plan claims section **14** — §13 is the highest in use and §8 is permanently absent by decision, not a gap to fill.
- **`scripts/fixtures/check-case-citations-baseline.json` must gain a `"14-mcp-server.md"` entry the moment that file exists.** The gate FAILS naming any `test-cases/NN-*.md` with no committed baseline entry, and it fails on `actual < baseline` too — an exact match is the property.
- **Delivery:** one PR per change, branched off `main`, merged only by the controller with the owner's approval. **Never commit or push to `main`** — the branch rule is the enforcement, because the server will not stop you.
- **`reference/` is frozen.** Nothing in this plan reads or writes it.
- The executor runs all commands from the repo root (`/Users/kiro/my_projects/gisik-nokma`) unless a step says otherwise.

## What already exists, and must not be rebuilt

Read this before Task 1. Four of the spec's premises are already half-true in the tree, and an executor who does not know that will write code the codebase does not need.

1. **Bearer credentials already reach `requireSession`.** `auth/auth.ts:236` registers better-auth's `bearer()` plugin ("token sessions for the mobile/desktop apps") and `auth/require-session.ts:60` calls `auth.api.getSession({ headers })`, which resolves a cookie **or** an `Authorization: Bearer` session token with no transport branch. The spec's "gains a second recognized credential shape (bearer token) alongside the existing session-cookie check" describes something already shipped. What is genuinely new is a **personal access token that is not a session** — Task 4, and it is a *fallback after* `getSession` returns `null`, never a branch before it.
2. **Opaque hashed tokens have a precedent to copy verbatim, not invent.** `invite_tokens` (`apps/server/migrations/1787961600000_proj-invites.sql:75`) is `sha256(token)` hex, minted from `randomBytes`, `expires_at NOT NULL`, raw token existing only in the response that mints it, the table deliberately **excluded from any projection's `tables` array** so `reset()`/`verify-projections` can never empty it. `apps/server/src/routes/invites.ts:134` is the `hashToken` to copy. Task 2 follows this exactly.
3. **The CSRF control is already correct, and MCP is already exempt.** `HTTP_ORIGIN_PROTECTED_ROUTES` (`http/http-origin.ts:151`) covers cookie-authenticated mutations; `httpOriginRefused` returns `false` when there is no `Cookie` header (`:213`), so a bearer-only MCP caller is untouched by it. **Do not "fix" that.** But the *browser approval* POST this plan adds is exactly the category the set exists for — a cookie-authenticated request that mints a credential — so Task 3 adds it to the set with a planted-defect test.
4. **`POST /v1/events` shares the `events:` rate-limit bucket** (`app.ts:428`, `RATE_LIMIT_EVENTS_MAX=120` per `RATE_LIMIT_WINDOW_SEC=60`). An assistant hammering writes spends that budget against the same client key as the user's own web client. That is correct and intended; it is written here so a later reader is not surprised.

## File Structure

```
packages/mcp-server/                       — @gisik-nokma/mcp-server (NEW)
├── package.json                           — deps: @modelcontextprotocol/sdk, @gisik-nokma/domain, zod
├── tsconfig.json                          — verbatim copy of packages/rule-engine's
├── tsconfig.typecheck.json                — verbatim copy of packages/rule-engine's
├── vitest.config.ts                       — verbatim copy of packages/rule-engine's
├── src/
│   ├── index.ts                           — barrel
│   ├── config.ts                          — McpConfig: serverUrl, tokenPath, pollIntervalMs
│   ├── token-cache.ts                     — readToken/writeToken, mode 0600, ~/.gisik-nokma/
│   ├── http-client.ts                     — GisikClient: get/postEvents, RefusalError/TransportError
│   ├── device-login.ts                    — the device-flow driver (mint → open → poll → cache)
│   ├── session.ts                          — AuthenticatedClient: 401 → re-login → retry ONCE
│   ├── tools/read-tools.ts                — list_workspaces, list_projects, search_tickets,
│   │                                        list_tickets, get_ticket
│   ├── tools/write-tools.ts               — create_ticket, transition_ticket, add_comment,
│   │                                        assign_ticket
│   ├── tools/register.ts                  — registerTools(server, session): one wiring point
│   └── main.ts                            — stdio entrypoint (the bin)
└── test/
    ├── token-cache.test.ts
    ├── device-login.test.ts
    ├── read-tools.test.ts
    ├── write-tools.test.ts
    └── errors.test.ts

apps/server/                               — EXISTING, changed in four places only
├── migrations/1788600000000_mcp-device-auth.sql   — mcp_device_codes + mcp_tokens (NEW)
├── src/mcp/token-store.ts                 — mint/approve/exchange/resolve/revoke (NEW)
├── src/routes/mcp-device.ts               — the three device-flow routes (NEW)
├── src/auth/require-session.ts            — MODIFY: PAT fallback after getSession() === null
├── src/http/http-origin.ts                — MODIFY: add the approve route to the protected set
└── src/app.ts                             — MODIFY: wire the routes, add the 4th limiter bucket
    test/mcp/device-flow.test.ts           — route + token tests (NEW)
    test/mcp/require-session-pat.test.ts   — the fallback's own tests (NEW)

apps/web/app/mcp/authorize/page.tsx        — the approval screen (NEW) — see Open question 2

scripts/check-runbook-commands.mjs         — MODIFY: packageDirs() list gains packages/mcp-server
scripts/check-task-ledger.mjs              — MODIFY: plan discovery + PLANS_WITH_TASKS (Task 11)
scripts/fixtures/check-case-citations-baseline.json — MODIFY: "14-mcp-server.md"
docs/runbook.md                            — MODIFY: the MCP install/authorize section
.env.example                               — MODIFY: MCP_DEVICE_CODE_TTL_SEC if it becomes config
Features.md §14 · test-cases/14-mcp-server.md
```

## The wire contract, pinned

Three routes. Named here once so Tasks 3, 4, 6 and 7 agree without re-deriving.

| Route | Auth | Body / Query | 200 body |
|---|---|---|---|
| `POST /v1/mcp/device/code` | none | `{}` | `{ deviceCode, userCode, verificationUri, expiresInSec, pollIntervalSec }` |
| `POST /v1/mcp/device/approve` | **session (cookie or bearer)** | `{ userCode }` | `{ approved: true }` |
| `POST /v1/mcp/device/token` | none | `{ deviceCode }` | `{ status: 'pending' }` **or** `{ status: 'issued', token, userId }` |

- `deviceCode` — 32 bytes of `randomBytes`, base64url. Stored only as `sha256` hex. Never displayed.
- `userCode` — 8 characters from the unambiguous alphabet `BCDFGHJKLMNPQRSTVWXZ23456789` (no vowels, so no accidental words; no `0/O/1/I/5/S`), formatted `XXXX-XXXX` for reading aloud. This is what the person types.
- `verificationUri` — `${WEB_ORIGIN}/mcp/authorize` — the **web** origin, not the API's. This is forced, not chosen: see Open question 2.
- **Refusals, all single-key `{ error }`:** `{ error: 'unknown_code' }` (404, unknown or already-exchanged), `{ error: 'expired_code' }` (410), `{ error: 'invalid' }` (400, malformed body), `{ error: 'unauthenticated' }` (401, approve without a session).
- **`expiresInSec = 600`, `pollIntervalSec = 12`.** Derived, not picked — see Task 3 Step 1.

---

### Task 0: `'mcp'` becomes an envelope-origin of its own

**Owner ruling 1.** An assistant's write must be distinguishable, in the ledger, from a claim the
person typed themselves. In a product whose stated purpose is a board that cannot lie about its own
history, a write that claims `'web'` when a machine made it is the ledger lying about who acted — the
one thing the whole design exists to prevent.

**Scope, MEASURED at `8190507` rather than estimated.** This plan originally called it *"more than
this plan's scope"*; it is not. See the ruling table above for the full measurement.

- [ ] **Step 1 — add the member.** `packages/domain/src/envelope.ts:26`:
      `export const ORIGINS = ['web', 'mobile', 'desktop', 'server', 'mcp'] as const;`
      `Origin` (`:27`) and `z.enum(ORIGINS)` (`:182`) both derive from it and need no edit.
      **No migration:** the column is `origin text NOT NULL` with no `CHECK` and no Postgres enum
      (`migrations/1787841717635_events-and-snapshots.sql:12`), verified across every migration.
- [ ] **Step 2 — kill the second authority.** `packages/rule-engine/src/fixtures/harness.ts:53`
      re-spells the list as `z.enum(['web', 'mobile', 'desktop', 'server'])`. **Import `ORIGINS` and
      use `z.enum(ORIGINS)`** — do not add a fifth string. A second list of what the origins are is
      precisely the drift `check-permission.test.ts:33-36` warns about in prose, and it is sitting one
      package away from the file that warns about it. Fixing it by hand would leave the same trap set
      for the sixth member.
- [ ] **Step 3 — read what Step 1 switched on for free.** `check-permission.test.ts:38` derives
      `CLIENT_ORIGINS` from `ORIGINS` and runs `it.each(CLIENT_ORIGINS)`, so `'mcp'` gains a
      permission-gate case the moment Step 1 lands: *the gate must admit an `mcp`-origin client
      submission.* Run that suite and confirm the new case passes. **If it fails, stop** — the gate
      refusing `'mcp'` is a real finding about the ingest door, not a test to adjust.
- [ ] **Step 4 — a case that says why the value exists.** Assert an `'mcp'` envelope round-trips the
      ingest door and comes back out of the ledger as `'mcp'`. The point is not that the enum accepts
      a fifth string; it is that a reader of the history can tell a person's claim from their
      assistant's. A case asserting only `ORIGINS.includes('mcp')` would test the constant.

**Requirements:** `pnpm turbo run build test typecheck` green; the new permission-gate case passes
without editing it; no migration added.

**This task comes BEFORE Task 9**, which sends the value.

### Task 1: The package scaffold, and the one gate that will not see it

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/tsconfig.typecheck.json`
- Create: `packages/mcp-server/vitest.config.ts`
- Create: `packages/mcp-server/src/index.ts`
- Create: `packages/mcp-server/src/config.ts`
- Create: `packages/mcp-server/test/config.test.ts`
- Modify: `scripts/check-runbook-commands.mjs:69-71`

**Interfaces:**
- Consumes: nothing.
- Produces: the workspace member `@gisik-nokma/mcp-server`; `McpConfig` and `loadMcpConfig(env: NodeJS.ProcessEnv, home: string): McpConfig` — every later task in this package imports these.

- [x] **Step 1: Write `packages/mcp-server/package.json`**

Copied from `packages/rule-engine/package.json` with the name and dependencies swapped. `bin` is what makes Task 10's entrypoint launchable by an MCP client config.

```json
{
  "name": "@gisik-nokma/mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "sideEffects": false,
  "bin": { "gisik-nokma-mcp": "./dist/main.js" },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.typecheck.json"
  },
  "dependencies": {
    "@gisik-nokma/domain": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.30.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.6.3",
    "vitest": "^3.1.0"
  }
}
```

`@modelcontextprotocol/sdk@1.30.0` declares `zod: '^3.25 || ^4.0'` in both `dependencies` and `peerDependencies` — verified against the registry, so the repo's pinned `zod ^3.25.0` satisfies it and no second zod copy is installed.

- [x] **Step 2: Write the three config files, verbatim from `packages/rule-engine`**

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`tsconfig.typecheck.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

No `pnpm-workspace.yaml` edit — the `packages/*` glob already covers it. No `turbo.json` entry — that is only needed when a package's tests read files **outside** its own directory, and none of this package's tests do. (If a later task adds such a test it MUST add a `"@gisik-nokma/mcp-server#test"` block with `$TURBO_DEFAULT$` plus the foreign `$TURBO_ROOT$/…` inputs, or turbo serves a stale green — the failure measured on 2026-09-07 that let `#270` reach `main`.)

- [x] **Step 3: Write the failing test for `loadMcpConfig`**

`packages/mcp-server/test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadMcpConfig, DEFAULT_POLL_INTERVAL_MS } from '../src/config.js';

/**
 * Plan: MCP server, Task 1. Cases 14.1–14.3.
 */
describe('loadMcpConfig', () => {
  it('14.1 requires GISIK_SERVER_URL and names it when absent', () => {
    expect(() => loadMcpConfig({}, '/home/x')).toThrow(/GISIK_SERVER_URL/);
  });

  it('14.2 defaults the token path under the home directory', () => {
    const config = loadMcpConfig({ GISIK_SERVER_URL: 'http://localhost:3000' }, '/home/x');
    expect(config.tokenPath).toBe('/home/x/.gisik-nokma/mcp-token');
    expect(config.serverUrl).toBe('http://localhost:3000');
    expect(config.pollIntervalMs).toBe(DEFAULT_POLL_INTERVAL_MS);
  });

  it('14.3 strips a trailing slash so URL joins never double it', () => {
    const config = loadMcpConfig({ GISIK_SERVER_URL: 'http://localhost:3000/' }, '/home/x');
    expect(config.serverUrl).toBe('http://localhost:3000');
  });
});
```

- [x] **Step 4: Run it and watch it fail for the right reason**

Run: `pnpm --filter @gisik-nokma/mcp-server exec vitest run 2>&1 | tail -20`
Expected: FAIL — `Failed to resolve import "../src/config.js"`. A failure naming anything else means the scaffold is wrong, not the test.

- [x] **Step 5: Write `src/config.ts` and `src/index.ts`**

```ts
import { join } from 'node:path';

/**
 * 12 seconds, and it is DERIVED rather than chosen. The device routes share a
 * rate-limit bucket budgeted at `RATE_LIMIT_AUTH_MAX=10` per
 * `RATE_LIMIT_WINDOW_SEC=60` (see the server's `app.ts`), i.e. one request per
 * 6 seconds sustained. Polling at 12s spends half that budget, which leaves
 * room for the code-mint that opened the flow and for a retry, and keeps the
 * client from 429-ing itself — a login loop that rate-limits its own polling
 * looks exactly like a server that never approves.
 */
export const DEFAULT_POLL_INTERVAL_MS = 12_000;

export type McpConfig = {
  /** The gisik-nokma API origin, no trailing slash. */
  serverUrl: string;
  /** Where the personal access token is cached, mode 0600. */
  tokenPath: string;
  pollIntervalMs: number;
};

export function loadMcpConfig(env: NodeJS.ProcessEnv, home: string): McpConfig {
  const raw = env['GISIK_SERVER_URL'];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      'GISIK_SERVER_URL is not set. It is the origin of the gisik-nokma API this MCP server talks ' +
        'to — the same server your web client uses, e.g. http://localhost:3000.',
    );
  }
  return {
    serverUrl: raw.trim().replace(/\/+$/, ''),
    tokenPath: env['GISIK_MCP_TOKEN_PATH'] ?? join(home, '.gisik-nokma', 'mcp-token'),
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  };
}
```

`src/index.ts`:

```ts
export * from './config.js';
```

- [x] **Step 6: Run the tests and the whole gate**

Run: `pnpm install`
Expected: succeeds, links `@gisik-nokma/mcp-server`, updates `pnpm-lock.yaml`.

Run: `pnpm --filter @gisik-nokma/mcp-server exec vitest run 2>&1 | tail -20`
Expected: 3 passed.

Run: `pnpm turbo run build typecheck --filter @gisik-nokma/mcp-server 2>&1 | tail -20`
Expected: both green.

- [x] **Step 7: Register the package with the one gate that hardcodes a list**

`scripts/check-runbook-commands.mjs:69-71` enumerates package directories by hand. Every other gate discovers packages dynamically (`check-case-citations.mjs:189` walks `apps` and `packages`; CI's `other-tests` job runs `turbo run test --filter='!@gisik-nokma/server'` and picks a new package up automatically). This one does not, and a hardcoded list that stops matching the tree is the defect PR #278 was opened for ("the gate could not see the trees its own tests police — four packages, not one").

In `packageDirs()`, replace:

```js
  for (const d of ['apps/server', 'apps/web', 'apps/mobile', 'apps/desktop',
                   'packages/domain', 'packages/app-core', 'packages/rule-engine',
                   'packages/sync-client', 'packages/editor', 'packages/ui']) {
```

with:

```js
  for (const d of ['apps/server', 'apps/web', 'apps/mobile', 'apps/desktop',
                   'packages/domain', 'packages/app-core', 'packages/rule-engine',
                   'packages/sync-client', 'packages/editor', 'packages/ui',
                   'packages/mcp-server']) {
```

Run: `pnpm check:runbook 2>&1 | tail -10`
Expected: ok. (It stays ok either way today — `docs/runbook.md` names no `@gisik-nokma/mcp-server` script until Task 10. The line is added **now** so Task 10's runbook entry cannot land against a list that does not know this package exists.)

- [x] **Step 8: Commit**

```bash
git add packages/mcp-server scripts/check-runbook-commands.mjs pnpm-lock.yaml
git commit -m "Scaffold @gisik-nokma/mcp-server, and teach the one gate that hardcodes a package list about it"
```

---

### Task 2: The credential store — two tables and the module that owns them

**Files:**
- Create: `apps/server/migrations/1788600000000_mcp-device-auth.sql`
- Create: `apps/server/src/mcp/token-store.ts`
- Create: `apps/server/test/mcp/token-store.test.ts`

**Interfaces:**
- Consumes: `Queryable` from `apps/server/src/db/queryable.js`; `newUlid` from `@gisik-nokma/domain`.
- Produces — Task 3 and Task 4 call these by name:

```ts
export type DeviceCodeGrant = { deviceCode: string; userCode: string; expiresAt: Date };
export type ExchangeOutcome =
  | { status: 'pending' }
  | { status: 'issued'; token: string; userId: string }
  | { status: 'unknown' }
  | { status: 'expired' };
export const DEVICE_CODE_TTL_SEC = 600;
export const POLL_INTERVAL_SEC = 12;
export function hashCredential(raw: string): string;
export async function mintDeviceCode(db: Queryable, now: Date): Promise<DeviceCodeGrant>;
export async function approveDeviceCode(db: Queryable, userCode: string, userId: string, now: Date): Promise<'approved' | 'unknown' | 'expired'>;
export async function exchangeDeviceCode(db: Queryable, deviceCode: string, now: Date): Promise<ExchangeOutcome>;
export async function resolveMcpToken(db: Queryable, rawToken: string, now: Date): Promise<string | null>;
```

- [x] **Step 1: Write the migration**

`apps/server/migrations/1788600000000_mcp-device-auth.sql`. The timestamp is later than `1788470000000_snapshot-provenance.sql`, the current last migration; if a newer one has landed by execution time, bump this above it.

```sql
-- Up Migration

-- NEITHER table is a projection and NEITHER is rebuildable, for exactly the
-- reason invite_tokens is not (see 1787961600000_proj-invites.sql): what they
-- hold is deliberately absent from the ledger. Anyone who can read a
-- workspace's history can read an event id and a payload; a credential that
-- was either of those would be readable by every member. So these sit beside
-- better-auth's own tables in the same relationship to the ledger that a
-- session has: identity machinery is not workspace history.
--
-- The consequence a reader must not undo: neither name may EVER appear in a
-- projection's `tables` array. `reset()` empties what that array names, and
-- verify-projections builds a shadow schema per listed table with `search_path`
-- set — so an unlisted table's unqualified name resolves to the LIVE one. A
-- rebuild that emptied mcp_tokens would sign every MCP client out with no way
-- to put them back, and the ledger could not.

CREATE TABLE mcp_device_codes (
  device_code_hash text NOT NULL PRIMARY KEY,
  user_code        text NOT NULL UNIQUE,
  approved_user_id text,
  created_at       timestamptz NOT NULL,
  expires_at       timestamptz NOT NULL
);

CREATE INDEX mcp_device_codes_expires_at_idx ON mcp_device_codes (expires_at);

COMMENT ON TABLE mcp_device_codes IS 'In-flight device-authorization grants for the MCP server. Server-owned, never a projection, never rebuildable. A row lives at most DEVICE_CODE_TTL_SEC and is DELETED at exchange — that deletion is what makes a device code single-use.';
COMMENT ON COLUMN mcp_device_codes.device_code_hash IS 'sha256(deviceCode), hex. The raw device code exists only in the response that minted it and in the client''s memory; it is never stored, never logged, and never displayed to the person approving.';
COMMENT ON COLUMN mcp_device_codes.user_code IS 'The short code a PERSON reads and types, stored in the clear on purpose: it is a lookup key the approver types, not a bearer credential — holding it grants nothing without an authenticated session to approve with, and the row it names is gone within ten minutes.';
COMMENT ON COLUMN mcp_device_codes.approved_user_id IS 'NULL until a signed-in person approves. Once set, the next exchange mints that person''s token. A grant is approved by exactly one user and can never be re-pointed.';

CREATE TABLE mcp_tokens (
  token_hash text NOT NULL PRIMARY KEY,
  user_id    text NOT NULL,
  created_at timestamptz NOT NULL,
  last_used  timestamptz
);

CREATE INDEX mcp_tokens_user_id_idx ON mcp_tokens (user_id);

COMMENT ON TABLE mcp_tokens IS 'Personal access tokens for the MCP server — a SIBLING credential to a better-auth session, not a session: no cookie, no browser semantics, no CSRF surface, and resolved only after better-auth has answered null (see src/auth/require-session.ts). Server-owned, never a projection.';
COMMENT ON COLUMN mcp_tokens.token_hash IS 'sha256(token), hex. A plain hash rather than a password KDF, and that is correct HERE for the same reason it is correct for invite_tokens: the input is 32 bytes from randomBytes — 256 bits of uniform entropy, not a human-chosen secret — so there is no dictionary to stretch against.';
COMMENT ON COLUMN mcp_tokens.last_used IS 'NULL until first use. Written on every successful resolution so a person can see whether a token they meant to revoke is still being used. It is an observation, never an authorisation input — no code path reads it to decide anything.';

-- Deliberately NO expires_at, and this is a decision rather than an omission.
-- An invitation link is a credential handed to somebody who is not yet a user,
-- so a clock on it bounds an unknown; an MCP token is minted by the account
-- holder, for their own machine, from an interactive approval they performed.
-- Expiring it would sign the assistant out mid-task on a timer nobody chose,
-- and the re-auth path (401 -> device flow) already exists for the case that
-- matters: a REVOKED token, which is a DELETE here and takes effect at once.
-- If the owner wants a TTL, it is one column and one WHERE clause -- see the
-- plan's Open question 4.

-- Down Migration

DROP TABLE mcp_tokens;
DROP TABLE mcp_device_codes;
```

- [x] **Step 2: Write the failing tests**

`apps/server/test/mcp/token-store.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  approveDeviceCode,
  exchangeDeviceCode,
  hashCredential,
  mintDeviceCode,
  resolveMcpToken,
} from '../../src/mcp/token-store.js';

/**
 * Plan: MCP server, Task 2. Cases 14.10–14.16.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

const NOW = new Date('2026-09-07T10:00:00.000Z');
const LATER = new Date('2026-09-07T10:05:00.000Z');
const PAST_TTL = new Date('2026-09-07T10:11:00.000Z');

describe('the device-code grant', () => {
  it('14.10 stores the device code ONLY as a hash', async () => {
    const grant = await mintDeviceCode(db.pool, NOW);
    const { rows } = await db.pool.query<{ device_code_hash: string }>(
      'SELECT device_code_hash FROM mcp_device_codes WHERE user_code = $1',
      [grant.userCode],
    );
    expect(rows[0]?.device_code_hash).toBe(hashCredential(grant.deviceCode));
    // The planted defect this guards: storing the raw code. If the column ever
    // held the plaintext, this equality fails AND the next assertion catches it
    // from the other side.
    expect(rows[0]?.device_code_hash).not.toBe(grant.deviceCode);
  });

  it('14.11 answers pending before anyone approves', async () => {
    const grant = await mintDeviceCode(db.pool, NOW);
    expect(await exchangeDeviceCode(db.pool, grant.deviceCode, LATER)).toEqual({ status: 'pending' });
  });

  it('14.12 issues a token to the approving user, once', async () => {
    const grant = await mintDeviceCode(db.pool, NOW);
    expect(await approveDeviceCode(db.pool, grant.userCode, '01J0USER0000000000000000AA', LATER)).toBe('approved');

    const first = await exchangeDeviceCode(db.pool, grant.deviceCode, LATER);
    expect(first.status).toBe('issued');
    if (first.status !== 'issued') throw new Error('unreachable');
    expect(first.userId).toBe('01J0USER0000000000000000AA');

    // Single-use: the grant row is gone, so a replay of the same device code
    // gets `unknown` and NOT a second token. This is the invite_tokens
    // property — a read cannot make a credential single-use, the DELETE does.
    expect(await exchangeDeviceCode(db.pool, grant.deviceCode, LATER)).toEqual({ status: 'unknown' });
  });

  it('14.13 refuses an expired grant, and distinguishes it from an unknown one', async () => {
    const grant = await mintDeviceCode(db.pool, NOW);
    await approveDeviceCode(db.pool, grant.userCode, '01J0USER0000000000000000BB', LATER);
    expect(await exchangeDeviceCode(db.pool, grant.deviceCode, PAST_TTL)).toEqual({ status: 'expired' });
    expect(await exchangeDeviceCode(db.pool, 'never-minted', NOW)).toEqual({ status: 'unknown' });
  });

  it('14.14 refuses to approve an expired grant', async () => {
    const grant = await mintDeviceCode(db.pool, NOW);
    expect(await approveDeviceCode(db.pool, grant.userCode, '01J0USER0000000000000000CC', PAST_TTL)).toBe('expired');
  });
});

describe('the personal access token', () => {
  it('14.15 resolves to its user, and is stored only as a hash', async () => {
    const grant = await mintDeviceCode(db.pool, NOW);
    await approveDeviceCode(db.pool, grant.userCode, '01J0USER0000000000000000DD', LATER);
    const issued = await exchangeDeviceCode(db.pool, grant.deviceCode, LATER);
    if (issued.status !== 'issued') throw new Error('unreachable');

    expect(await resolveMcpToken(db.pool, issued.token, LATER)).toBe('01J0USER0000000000000000DD');

    const { rows } = await db.pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM mcp_tokens WHERE user_id = $1',
      ['01J0USER0000000000000000DD'],
    );
    expect(rows[0]?.token_hash).toBe(hashCredential(issued.token));
  });

  it('14.16 answers null for a forged token and for a revoked one, identically', async () => {
    expect(await resolveMcpToken(db.pool, 'forged', NOW)).toBeNull();

    const grant = await mintDeviceCode(db.pool, NOW);
    await approveDeviceCode(db.pool, grant.userCode, '01J0USER0000000000000000EE', LATER);
    const issued = await exchangeDeviceCode(db.pool, grant.deviceCode, LATER);
    if (issued.status !== 'issued') throw new Error('unreachable');
    await db.pool.query('DELETE FROM mcp_tokens WHERE token_hash = $1', [hashCredential(issued.token)]);
    expect(await resolveMcpToken(db.pool, issued.token, LATER)).toBeNull();
  });
});
```

- [x] **Step 3: Run them and watch them fail**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/mcp/token-store.test.ts 2>&1 | tail -20`
Expected: FAIL — cannot resolve `../../src/mcp/token-store.js`.

Requires the dev database up: `docker compose up -d` (Postgres 16 on 54329).

- [x] **Step 4: Write `apps/server/src/mcp/token-store.ts`**

```ts
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
```

- [x] **Step 5: Run the tests**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/mcp/token-store.test.ts 2>&1 | tail -20`
Expected: 7 passed.

- [x] **Step 6: Prove the migration is reversible**

Run: `pnpm --filter @gisik-nokma/server exec node-pg-migrate down --migrations-dir migrations --count 1 2>&1 | tail -10`
Expected: drops both tables cleanly.
Run: `pnpm --filter @gisik-nokma/server exec node-pg-migrate up --migrations-dir migrations 2>&1 | tail -10`
Expected: re-applies.

- [x] **Step 7: Commit**

```bash
git add apps/server/migrations/1788600000000_mcp-device-auth.sql apps/server/src/mcp/token-store.ts apps/server/test/mcp/token-store.test.ts
git commit -m "MCP credential store: device-code grants and personal access tokens, hashed at rest and outside the ledger"
```

---

### Task 3: The three device-flow routes

**Files:**
- Create: `apps/server/src/routes/mcp-device.ts`
- Create: `apps/server/test/mcp/device-flow.test.ts`
- Modify: `apps/server/src/http/http-origin.ts:151` (the protected-route set)
- Modify: `apps/server/src/app.ts` (registration + the fourth limiter bucket)

**Interfaces:**
- Consumes: `mintDeviceCode`, `approveDeviceCode`, `exchangeDeviceCode`, `DEVICE_CODE_TTL_SEC`, `POLL_INTERVAL_SEC`, `hashCredential` (Task 2); `Queryable`; `preHandlerHookHandler`.
- Produces: `registerMcpDeviceRoutes(app, deps: { pool: Queryable; webOrigin: string; now?: () => Date }, requireSession: preHandlerHookHandler): void`, and the three routes pinned in **The wire contract** above. Task 6 and Task 7 code against those paths and bodies; Task 5 codes against `POST /v1/mcp/device/approve`.

- [x] **Step 1: Decide the bucket before writing the route — it is what fixes the TTL and the interval**

The spec leaves "exact device-code TTL and polling interval" open. It is not a free choice: `app.ts`'s limiter classifies by exact route pattern and a route under `/v1/mcp/...` matches **no** bucket today, which would make an 8-character user code an unlimited brute-force surface. Mounting the routes in the existing `authLimiter` bucket instead would make the CLI's polling contend with the person's own browser sign-in on the same client key, on a `RATE_LIMIT_AUTH_MAX=10`-per-60s budget.

So: a **fourth bucket**, `mcpMax`, fed by the existing `RATE_LIMIT_AUTH_MAX` — no new environment variable. This is exactly the precedent `inviteMax` set (`app.ts`'s `SecurityOptions.rateLimit` docblock: a field rather than a constant, "No new environment variable is introduced for it"; `.env.example:174` records `invite … at RATE_LIMIT_AUTH_MAX`). With 10 requests per 60s the sustained rate is one per 6s, so **`POLL_INTERVAL_SEC = 12`** spends half the budget and leaves room for the mint and one retry, and **`DEVICE_CODE_TTL_SEC = 600`** is 50 polls — an unhurried browser trip that does not leave an abandoned grant lying around for an hour.

- [x] **Step 2: Widen `buildTestApp` to accept security options — FIRST, because a test needs it**

Case 14.27b below drives the HTTP-Origin check, and `buildTestApp` cannot assemble an app with the security controls on today. Do this before writing the tests, so no test in this task is ever written in a shape that cannot fail.

In `apps/server/test/helpers/app.ts`, add to `BuildTestAppOverrides`:

```ts
  /**
   * The deployment security surface — CORS, the HTTP-Origin check, the rate
   * limiters. ABSENT STILL MEANS OFF, which is the existing contract stated in
   * `app.ts`'s `SecurityOptions` docblock: around sixty test files build this
   * app and several hammer `POST /v1/events` in a loop. A test opts in when it
   * is testing these controls and not otherwise.
   */
  security?: SecurityOptions;
```

and forward it to `buildApp`'s options object. Import `SecurityOptions` from `../../src/app.js`.

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/app.test.ts 2>&1 | tail -10`
Expected: green — the widening is additive and absent-means-off is unchanged.

- [x] **Step 3: Write the failing route tests**

`apps/server/test/mcp/device-flow.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';
import { HTTP_ORIGIN_PROTECTED_ROUTES } from '../../src/http/http-origin.js';
import { DEVICE_CODE_TTL_SEC, POLL_INTERVAL_SEC } from '../../src/mcp/token-store.js';

/**
 * Plan: MCP server, Task 3. Cases 14.20–14.27.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

describe('POST /v1/mcp/device/code', () => {
  it('14.20 mints a grant, and never returns the device code in a form it stored', async () => {
    const { app } = buildTestApp(db);
    const res = await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      deviceCode: string; userCode: string; verificationUri: string;
      expiresInSec: number; pollIntervalSec: number;
    };
    expect(body.deviceCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.userCode).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ23456789]{4}-[BCDFGHJKLMNPQRSTVWXZ23456789]{4}$/);
    expect(body.verificationUri).toBe(`${TEST_WEB_ORIGIN}/mcp/authorize`);
    expect(body.expiresInSec).toBe(DEVICE_CODE_TTL_SEC);
    expect(body.pollIntervalSec).toBe(POLL_INTERVAL_SEC);
  });

  it('14.21 needs no session — that is the point of a device flow', async () => {
    const { app } = buildTestApp(db);
    const res = await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} });
    expect(res.statusCode).not.toBe(401);
  });
});

describe('POST /v1/mcp/device/approve', () => {
  it('14.22 refuses an unauthenticated approval with the product-wide body', async () => {
    const { app } = buildTestApp(db);
    const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { userCode: string };
    const res = await app.inject({
      method: 'POST', url: '/v1/mcp/device/approve', payload: { userCode: minted.userCode },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('14.23 approves as the signed-in person, and the exchange issues THAT person a token', async () => {
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000001');
    const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { deviceCode: string; userCode: string };

    const approve = await app.inject({
      method: 'POST', url: '/v1/mcp/device/approve',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { userCode: minted.userCode },
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toEqual({ approved: true });

    const exchange = await app.inject({
      method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode },
    });
    expect(exchange.statusCode).toBe(200);
    const issued = exchange.json() as { status: string; token: string; userId: string };
    expect(issued.status).toBe('issued');
    // The userId is here BECAUSE the MCP client cannot build a valid envelope
    // without it: `actorId` must equal the session user or the permission gate
    // refuses every write. No read route on this surface carries it.
    expect(issued.userId).toBe(user.userId);
    expect(typeof issued.token).toBe('string');
  });

  it('14.24 an unknown user code is refused, and says only that', async () => {
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000002');
    const res = await app.inject({
      method: 'POST', url: '/v1/mcp/device/approve',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { userCode: 'ZZZZ-ZZZZ' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'unknown_code' });
  });
});

describe('POST /v1/mcp/device/token', () => {
  it('14.25 answers pending until somebody approves', async () => {
    const { app } = buildTestApp(db);
    const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { deviceCode: string };
    const res = await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'pending' });
  });

  it('14.26 a device code is single-use — the second exchange gets nothing', async () => {
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000003');
    const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { deviceCode: string; userCode: string };
    await app.inject({
      method: 'POST', url: '/v1/mcp/device/approve',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { userCode: minted.userCode },
    });
    const first = await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } });
    expect((first.json() as { status: string }).status).toBe('issued');
    const second = await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } });
    expect(second.statusCode).toBe(404);
    expect(second.json()).toEqual({ error: 'unknown_code' });
  });
});

describe('the approval route is CSRF-protected, because it mints a credential', () => {
  it('14.27 /v1/mcp/device/approve is in HTTP_ORIGIN_PROTECTED_ROUTES', () => {
    // A cookie-authenticated POST that mints a credential is exactly the
    // category that set exists for — `/v1/workspaces/:workspaceId/invites` is
    // in it for the same reason. Without this, an attacker's page can approve
    // THEIR OWN device code using the victim's ambient session and walk away
    // with a token for the victim's account. `SameSite=Lax` does not help:
    // pm.artsourced.in and pm-api.artsourced.in are same-site siblings.
    expect(HTTP_ORIGIN_PROTECTED_ROUTES.has('/v1/mcp/device/approve')).toBe(true);
  });

  it('14.27b a cookie-carrying approval with a forged Origin is refused', async () => {
    const { app, otp } = buildTestApp(db, {
      security: { webOrigin: TEST_WEB_ORIGIN, rateLimit: null, trustProxy: false },
    });
    const user = await signInWithPhone(app, otp, '+911100000004');
    const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { userCode: string };

    const forged = await app.inject({
      method: 'POST',
      url: '/v1/mcp/device/approve',
      headers: {
        cookie: 'better-auth.session_token=whatever',
        origin: 'https://attacker.example',
      },
      payload: { userCode: minted.userCode },
    });
    expect(forged.statusCode).toBe(403);
    expect(forged.json()).toEqual({ error: 'forbidden_origin' });

    // The control that proves the refusal is about the ORIGIN and not about
    // the route simply being broken: the SAME approval, bearer-authenticated
    // (no cookie, nothing ambient to forge), succeeds. Without this second
    // half, a route that 403'd everything would pass the first half.
    const honest = await app.inject({
      method: 'POST',
      url: '/v1/mcp/device/approve',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { userCode: minted.userCode },
    });
    expect(honest.statusCode).toBe(200);
  });
});
```

- [x] **Step 4: Run them and watch them fail**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/mcp/device-flow.test.ts 2>&1 | tail -30`
Expected: FAIL — cannot resolve `../../src/routes/mcp-device.js`. Every test in the file fails for that one reason; a file that reports some passes at this point is testing something other than what it names.

- [x] **Step 5: Write `apps/server/src/routes/mcp-device.ts`**

```ts
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import {
  approveDeviceCode,
  DEVICE_CODE_TTL_SEC,
  exchangeDeviceCode,
  mintDeviceCode,
  POLL_INTERVAL_SEC,
} from '../mcp/token-store.js';

/** The four refusal bodies this surface answers with. Single-key, like every
 *  other refusal on the read surface — `{error: 'not_found'}` is the house
 *  shape and these are its siblings. Built once so route and test name one
 *  object each. */
export const UNKNOWN_CODE_BODY = { error: 'unknown_code' } as const;
export const EXPIRED_CODE_BODY = { error: 'expired_code' } as const;
export const INVALID_BODY = { error: 'invalid' } as const;

/**
 * The device-authorization flow, in three doors.
 *
 * ## Why two of them are unauthenticated, and why that is not a hole
 *
 * `POST /v1/mcp/device/code` and `POST /v1/mcp/device/token` carry no session
 * BY DESIGN — the whole point of a device flow is that the thing asking for a
 * credential does not have one yet. Neither door gives anything away: the mint
 * hands back a code that authorises nothing until a signed-in person approves
 * it, and the exchange answers `pending` forever unless somebody with a
 * session has approved that exact grant. The credential is created by the
 * APPROVAL, which is the door that requires identity.
 *
 * ## Why the approval is the CSRF-sensitive one
 *
 * It is a cookie-authenticatable POST that mints a credential, which is the
 * exact category `HTTP_ORIGIN_PROTECTED_ROUTES` exists for and the reason
 * `/v1/workspaces/:workspaceId/invites` is already in it. Without that
 * membership, a page the victim visits can POST an approval for the ATTACKER's
 * device code with the victim's ambient cookie, and the attacker polls a token
 * for the victim's account. `SameSite=Lax` does not close it — `http-origin.ts`
 * records at length that the product and API are same-site siblings of one
 * registrable domain, so the origin check is not defence in depth here, it is
 * the defence.
 *
 * ## Bucket
 *
 * All three routes are charged to the `mcp:` limiter (see `app.ts`), a fourth
 * bucket fed by `RATE_LIMIT_AUTH_MAX` — the `inviteMax` precedent, no new
 * environment variable. A separate bucket rather than sharing `auth:` because
 * a CLI polling every 12 seconds must not be able to lock a person out of
 * signing in from the same machine, and a brute-force sweep of the 8-character
 * user code must not be able to spend the sign-in budget either.
 */
export function registerMcpDeviceRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable; webOrigin: string; now?: () => Date },
  requireSession: preHandlerHookHandler,
): void {
  const now = deps.now ?? (() => new Date());

  app.post(
    '/v1/mcp/device/code',
    { schema: { body: { type: 'object', additionalProperties: false, properties: {} } } },
    async () => {
      const grant = await mintDeviceCode(deps.pool, now());
      return {
        deviceCode: grant.deviceCode,
        userCode: grant.userCode,
        // The WEB origin, never this API's own. The approver's session cookie
        // is presented from the web client, and an approval POST originating
        // anywhere else fails the HTTP-Origin check by construction.
        verificationUri: `${deps.webOrigin}/mcp/authorize`,
        expiresInSec: DEVICE_CODE_TTL_SEC,
        pollIntervalSec: POLL_INTERVAL_SEC,
      };
    },
  );

  app.post(
    '/v1/mcp/device/approve',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['userCode'],
          additionalProperties: false,
          properties: { userCode: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { userCode } = request.body as { userCode: string };
      const outcome = await approveDeviceCode(
        deps.pool,
        userCode.trim().toUpperCase(),
        request.currentUserId,
        now(),
      );
      if (outcome === 'expired') return reply.code(410).send(EXPIRED_CODE_BODY);
      if (outcome === 'unknown') return reply.code(404).send(UNKNOWN_CODE_BODY);
      return reply.code(200).send({ approved: true });
    },
  );

  app.post(
    '/v1/mcp/device/token',
    {
      schema: {
        body: {
          type: 'object',
          required: ['deviceCode'],
          additionalProperties: false,
          properties: { deviceCode: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { deviceCode } = request.body as { deviceCode: string };
      const outcome = await exchangeDeviceCode(deps.pool, deviceCode, now());
      if (outcome.status === 'unknown') return reply.code(404).send(UNKNOWN_CODE_BODY);
      if (outcome.status === 'expired') return reply.code(410).send(EXPIRED_CODE_BODY);
      if (outcome.status === 'pending') return reply.code(200).send({ status: 'pending' });
      return reply
        .code(200)
        .send({ status: 'issued', token: outcome.token, userId: outcome.userId });
    },
  );
}
```

- [x] **Step 6: Wire it, protect it, bucket it**

In `apps/server/src/http/http-origin.ts`, inside `HTTP_ORIGIN_PROTECTED_ROUTES`, add after the `'/v1/me/notifications/:id/read'` entry:

```ts
  // A cookie-authenticated POST that MINTS A CREDENTIAL — the same category as
  // the invite route three lines up, and the reason that one is here.
  '/v1/mcp/device/approve',
```

In `apps/server/src/app.ts`:

1. Import: `import { registerMcpDeviceRoutes } from './routes/mcp-device.js';`
2. Widen `SecurityOptions['rateLimit']` from `{ authMax: number; eventsMax: number; inviteMax: number; windowSec: number }` to add `mcpMax: number`, with this comment above the field:

```ts
  /**
   * The device-flow bucket. Fed by `RATE_LIMIT_AUTH_MAX` at the wire site, not
   * by a new environment variable — the `inviteMax` precedent exactly. Its own
   * bucket rather than sharing `auth:` because the two contend in both
   * directions: a CLI polling every 12s must not lock a person out of signing
   * in from the same machine, and a sweep of the 8-character user code must
   * not be able to spend the sign-in budget.
   */
  mcpMax: number;
```

3. In the limiter hook, destructure `mcpMax`, build `const mcpLimiter = makeFixedWindowLimiter(mcpMax, windowSec);`, and add a branch after the invite branch:

```ts
      } else if (
        method === 'POST' &&
        (routeUrl === '/v1/mcp/device/code' ||
          routeUrl === '/v1/mcp/device/approve' ||
          routeUrl === '/v1/mcp/device/token')
      ) {
        verdict = mcpLimiter.check(`mcp:${clientKey}`, now());
      }
```

4. Beside the other `register*Routes` calls: `registerMcpDeviceRoutes(app, { pool: deps.pool, webOrigin: deps.webOrigin }, requireSession);`
5. In `apps/server/src/index.ts`, pass `mcpMax: config.rateLimitAuthMax` wherever `inviteMax` is passed.

- [x] **Step 7: Run the whole file**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/mcp/ 2>&1 | tail -30`
Expected: all pass. **Read the output.** A suite that reports 0 tests run is not a pass; confirm the count.

- [x] **Step 8: Plant the CSRF defect and watch it caught**

Temporarily delete the `'/v1/mcp/device/approve'` line from `HTTP_ORIGIN_PROTECTED_ROUTES`.

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/mcp/device-flow.test.ts 2>&1 | tail -20`
Expected: **14.27 AND 14.27b both fail** — 14.27 on the set membership, 14.27b with the forged request answering 200 instead of 403. Two failures, not one; if only 14.27 fails, 14.27b is not testing what it claims.

Restore the line. Re-run: all pass.

- [x] **Step 9: Commit**

```bash
git add apps/server/src/routes/mcp-device.ts apps/server/src/http/http-origin.ts apps/server/src/app.ts apps/server/src/index.ts apps/server/test/helpers/app.ts apps/server/test/mcp/device-flow.test.ts
git commit -m "Device-authorization routes for the MCP server, with the approval door inside the CSRF-protected set and its own rate-limit bucket"
```

---

### Task 4: `require-session` learns the personal access token — as a fallback, not a branch

**Files:**
- Modify: `apps/server/src/auth/require-session.ts`
- Create: `apps/server/test/mcp/require-session-pat.test.ts`
- Modify: `apps/server/src/app.ts` (`makeRequireSession` now needs the pool)

**Interfaces:**
- Consumes: `resolveMcpToken` (Task 2); `Auth`; `Queryable`.
- Produces: `makeRequireSession(auth: Auth, db: Queryable, now?: () => Date)` — **a breaking signature change**, so every call site must move in this same commit. **There are THREE, verified by grep, not one:**
  - `apps/server/src/app.ts:632` — `makeRequireSession(deps.auth)`, the main one.
  - `apps/server/src/routes/attachments.ts:283` — **builds its own**, because that route registers `@fastify/multipart` on its own encapsulated instance. Its `deps` already carries `pool: Pool` (`attachments.ts:21`), so it becomes `makeRequireSession(deps.auth, deps.pool)`.
  - `apps/server/test/auth/require-session.test.ts:42` — the preHandler's own unit test, which builds it directly.

  Run `grep -rn "makeRequireSession(" apps/server/src apps/server/test` before editing and confirm the list is still exactly these three; a fourth appearing later is a call site this task must also move.

- [x] **Step 1: Write the failing tests**

`apps/server/test/mcp/require-session-pat.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Plan: MCP server, Task 4. Cases 14.30–14.33.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

async function tokenFor(app: Awaited<ReturnType<typeof buildTestApp>>['app'], bearer: string): Promise<string> {
  const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { deviceCode: string; userCode: string };
  await app.inject({
    method: 'POST', url: '/v1/mcp/device/approve',
    headers: { authorization: `Bearer ${bearer}` },
    payload: { userCode: minted.userCode },
  });
  const issued = (await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } })).json() as { token: string };
  return issued.token;
}

describe('a personal access token authenticates a product route', () => {
  it('14.30 an MCP token reaches GET /v1/me/workspaces as its owner', async () => {
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000010');
    const pat = await tokenFor(app, user.token);

    const res = await app.inject({
      method: 'GET', url: '/v1/me/workspaces',
      headers: { authorization: `Bearer ${pat}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ workspaces: [] });
  });

  it('14.31 a better-auth SESSION token still works, unchanged', async () => {
    // The regression this guards is the whole risk of the change: resolving
    // the PAT FIRST, or instead of, better-auth would silently break every
    // mobile and desktop client and every test in this repository, all of
    // which are bearer-authenticated.
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000011');
    const res = await app.inject({
      method: 'GET', url: '/v1/me/workspaces',
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('14.32 a forged token gets the product-wide contentless 401', async () => {
    const { app } = buildTestApp(db);
    const res = await app.inject({
      method: 'GET', url: '/v1/me/workspaces',
      headers: { authorization: 'Bearer not-a-token-at-all' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('14.33 a revoked token is refused, and is indistinguishable from a forged one', async () => {
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000012');
    const pat = await tokenFor(app, user.token);
    await db.pool.query('DELETE FROM mcp_tokens');

    const res = await app.inject({
      method: 'GET', url: '/v1/me/workspaces',
      headers: { authorization: `Bearer ${pat}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });
});
```

- [x] **Step 2: Run and watch 14.30 and 14.33 fail**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/mcp/require-session-pat.test.ts 2>&1 | tail -20`
Expected: **14.30 fails with 401** (better-auth does not know this token); 14.31 and 14.32 pass already; 14.33 passes for the wrong reason and will keep passing — that is fine, it is a guard for later, not a discriminator now.

If 14.30 passes at this step, stop: something is resolving the token that should not be.

- [x] **Step 3: Add the fallback**

In `apps/server/src/auth/require-session.ts`, replace `makeRequireSession` with:

```ts
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from './auth.js';
import type { Queryable } from '../db/queryable.js';
import { resolveMcpToken } from '../mcp/token-store.js';

/**
 * ...(the existing docblock is kept verbatim; this paragraph is appended)...
 *
 * ## The MCP personal access token is a FALLBACK, and the order is the design
 *
 * better-auth is asked first, always, and the token table is consulted only
 * when it answers `null`. Reversing that — or branching on the header shape
 * before calling `getSession` — would put a second credential system in front
 * of the one that owns sessions, and every mobile and desktop client, plus
 * every test in this repository, authenticates with a better-auth BEARER
 * token. They are the same header. Only the order keeps them from contending.
 *
 * The fallback runs on the raw `Authorization: Bearer <value>` and nothing
 * else: an MCP token is never a cookie, so a cookie-carrying request that
 * better-auth rejected falls straight through to the same 401 it always got.
 */
export function makeRequireSession(auth: Auth, db: Queryable, now: () => Date = () => new Date()) {
  return async function requireSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (session) {
      request.currentUserId = session.user.id;
      return;
    }

    const header = request.headers.authorization;
    if (header !== undefined && header.startsWith('Bearer ')) {
      const userId = await resolveMcpToken(db, header.slice('Bearer '.length), now());
      if (userId !== null) {
        request.currentUserId = userId;
        return;
      }
    }

    await reply.code(401).send(UNAUTHENTICATED_BODY);
  };
}
```

Then move **all three** call sites in this same commit:

- `apps/server/src/app.ts:632` → `makeRequireSession(deps.auth, deps.pool)`
- `apps/server/src/routes/attachments.ts:283` → `makeRequireSession(deps.auth, deps.pool)` (its `deps.pool` is a `Pool`, which satisfies `Queryable`)
- `apps/server/test/auth/require-session.test.ts:42` → pass a query handle. That test is deliberately database-free today; give it the narrowest thing that satisfies `Queryable` for its purpose — a stub whose `query` returns `{ rows: [], rowCount: 0 }` — and add one case there asserting that a request better-auth rejects still reaches the fallback and still 401s when the fallback misses.

`Queryable` is `Pool | PoolClient` (`apps/server/src/db/queryable.ts`), so `resolveMcpToken`'s `UPDATE … RETURNING` on the read path is type-compatible everywhere the preHandler is used. The cost is real and stated rather than hidden: **every authenticated request that falls through to the PAT branch performs one write.** A better-auth session never reaches it, so the web, mobile and desktop clients pay nothing; only MCP calls do, and one indexed single-row update per call is the price of `last_used` being answerable at all.

- [x] **Step 4: Run the file, then the whole server suite**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/mcp/require-session-pat.test.ts 2>&1 | tail -20`
Expected: 4 passed.

Run: `pnpm --filter @gisik-nokma/server exec vitest run > /tmp/mcp-t4.log 2>&1; tail -30 /tmp/mcp-t4.log`
Expected: the whole suite green. This is the step that catches a signature change breaking a call site the grep missed. **Redirect, then read — never pipe into `head`.**

- [x] **Step 5: Prove the ORDER, not just the outcome**

Temporarily move the PAT lookup **above** the `getSession` call.

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/mcp/require-session-pat.test.ts 2>&1 | tail -20`
Expected: still 4 passed — **the order is NOT observable from these tests alone.** That is the finding, and it is why this step exists rather than a comment claiming the order matters. Restore the order, then add this test to the file to make it observable:

```ts
  it('14.34 a better-auth session token is NOT looked up in mcp_tokens', async () => {
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000013');
    const before = await db.pool.query('SELECT count(*)::int AS n FROM mcp_tokens WHERE last_used IS NOT NULL');
    await app.inject({
      method: 'GET', url: '/v1/me/workspaces',
      headers: { authorization: `Bearer ${user.token}` },
    });
    const after = await db.pool.query('SELECT count(*)::int AS n FROM mcp_tokens WHERE last_used IS NOT NULL');
    // `resolveMcpToken` writes `last_used` on every lookup that hits. A
    // session token must never reach it at all — with the lookup moved first,
    // it does reach it, misses, and this stays equal; so the real
    // discrimination is the miss COUNT, which is why the assertion below is on
    // a session token that HAS a matching mcp_tokens row.
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
```

**Honest limit, stated rather than hidden:** the assertion above passes under both orders, because a session token has no `mcp_tokens` row to hit. A test that genuinely discriminates the order would need a value that is valid as both credentials at once, which cannot be constructed. So the order is held by the docblock and by review, not by a test — and this step's job was to establish *that*, not to pretend otherwise. Record it in the task-ledger row.

- [x] **Step 6: Commit**

```bash
git add apps/server/src/auth/require-session.ts apps/server/src/app.ts apps/server/test/mcp/require-session-pat.test.ts
git commit -m "require-session resolves an MCP personal access token, but only after better-auth has answered null"
```

---

> **EXECUTION NOTE — Step 5's conclusion is superseded, its experiment is not.** The experiment was run
> and reproduced exactly: with the PAT lookup moved above `getSession`, all twelve then-existing cases
> still passed. But "a value valid as both credentials at once … cannot be constructed" is false. Insert
> an `mcp_tokens` row whose `token_hash` is the sha256 of a LIVE session token, pointed at a DIFFERENT
> user, and observe the resolved identity through the device-approval route. That is **case 14.35**,
> written while the reversal was still applied, watched to fail as the only failure of five, then passing
> once the order was restored. The order is held by a test, not by review.

### Task 5: The approval screen

**Files:**
- Create: `apps/web/app/mcp/authorize/page.tsx`
- Create: `apps/web/e2e-stack/mcp-authorize.spec.ts` (or the nearest existing e2e convention — check `apps/web/e2e-stack/` before writing)

**Interfaces:**
- Consumes: `POST /v1/mcp/device/approve` (Task 3), the web client's existing authenticated-fetch helper — **find it, do not invent one**: grep `apps/web/src` for the module that already adds credentials to API calls and use that.
- Produces: the page at `${WEB_ORIGIN}/mcp/authorize`, which is the `verificationUri` Task 3 hands out.

**Read Open question 2 before starting.** The spec never mentions `apps/web`; its architecture diagram lists only `apps/server` changes. This task exists because the flow it *does* describe ("the user opens the URL in their already-authenticated browser session and approves") cannot terminate anywhere else: an approval POST must carry `Origin: <WEB_ORIGIN>` to pass `httpOriginRefused`, and only a page served from the web origin does that. A server-rendered page on the API origin would be refused by the product's own CSRF control.

- [ ] **Step 1: Read the neighbours first**

Run: `ls apps/web/app && ls apps/web/src`
Then read one existing page that performs an authenticated POST, and one that renders a refusal. Match those patterns exactly — component structure, the fetch helper, the error surface, and the `data-testid` convention (`docs/superpowers/plans/2026-08-20-11-deployment-dogfooding.md` pins the product's testid contract; add `mcp-authorize-*` ids in the same style).

**Also invoke `ui-ux-pro-max`** for this task — it is UI work, and the workspace conventions require it alongside the workflow skill.

- [ ] **Step 2: Write the page**

Behaviour, exactly:
- A single text input for the user code, pre-filled from `?code=` when present, `data-testid="mcp-authorize-code-input"`.
- A submit button, `data-testid="mcp-authorize-submit"`, POSTing `{ userCode }` to `/v1/mcp/device/approve`.
- On 200: a confirmation naming what was granted, `data-testid="mcp-authorize-approved"` — and it must say plainly that an assistant will now act **as this person**, with their permissions, because that is the thing being consented to.
- On 404: render the server's `unknown_code` as "That code is not recognised. It may have already been used, or it may have expired." — this is the one place a message is written rather than passed through, and it is a *presentation* of `{error:'unknown_code'}`, not a paraphrase of a rule-engine refusal. `data-testid="mcp-authorize-refused"`.
- On 410: "That code has expired. Ask for a new one." — same testid.
- On 401: send the person to the existing sign-in route with a return path back here.

- [ ] **Step 3: Test it against the compose stack**

Run: `docker compose -f docker-compose.dev.yml up -d --build --wait`
Then drive the page end to end: mint a code with `curl`, approve it in the browser, exchange it with `curl`, and confirm the token authenticates `GET /v1/me/workspaces`.

Record the exact commands and their output in the task-ledger row. A screenshot of the approval screen is worth more than a sentence claiming it renders.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/mcp/authorize apps/web/e2e-stack
git commit -m "The MCP approval screen: the one place a person consents to an assistant acting as them"
```

---

### Task 6: The client's HTTP layer and its token cache

**Files:**
- Create: `packages/mcp-server/src/token-cache.ts`
- Create: `packages/mcp-server/src/http-client.ts`
- Create: `packages/mcp-server/test/token-cache.test.ts`
- Create: `packages/mcp-server/test/http-client.test.ts`
- Modify: `packages/mcp-server/src/index.ts`

**Interfaces:**
- Consumes: `McpConfig` (Task 1).
- Produces:

```ts
// token-cache.ts
export type CachedToken = { token: string; userId: string };
export async function readCachedToken(path: string): Promise<CachedToken | null>;
export async function writeCachedToken(path: string, value: CachedToken): Promise<void>;
export async function clearCachedToken(path: string): Promise<void>;

// http-client.ts
export class TransportError extends Error { constructor(message: string, cause?: unknown); }
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown);
}
export type GisikClient = {
  get(path: string, token: string): Promise<unknown>;
  post(path: string, body: unknown, token: string | null): Promise<unknown>;
};
export function createGisikClient(serverUrl: string, fetchImpl?: typeof fetch): GisikClient;
```

- [ ] **Step 1: Write the failing token-cache tests**

`packages/mcp-server/test/token-cache.test.ts`:

```ts
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearCachedToken, readCachedToken, writeCachedToken } from '../src/token-cache.js';

/**
 * Plan: MCP server, Task 6. Cases 14.40–14.43.
 */
function scratch(): string {
  return join(mkdtempSync(join(tmpdir(), 'gisik-mcp-')), 'nested', 'mcp-token');
}

describe('the token cache', () => {
  it('14.40 answers null when nothing is cached', async () => {
    expect(await readCachedToken(scratch())).toBeNull();
  });

  it('14.41 round-trips the token and the user id', async () => {
    const path = scratch();
    await writeCachedToken(path, { token: 'tok', userId: '01J0USER0000000000000000AA' });
    expect(await readCachedToken(path)).toEqual({ token: 'tok', userId: '01J0USER0000000000000000AA' });
  });

  it('14.42 writes the file 0600 and the directory 0700', async () => {
    const path = scratch();
    await writeCachedToken(path, { token: 'tok', userId: '01J0USER0000000000000000AA' });
    // A credential readable by every process on a shared machine is not
    // cached, it is published. The mask is asserted, not assumed.
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(path, '..')).mode & 0o777).toBe(0o700);
  });

  it('14.43 answers null for a corrupt cache rather than throwing', async () => {
    const path = scratch();
    await writeCachedToken(path, { token: 'tok', userId: 'u' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path, 'not json at all');
    // A corrupt cache must degrade to "not logged in", which the device flow
    // can recover from. Throwing here would make a truncated file a permanent
    // failure that only a human deleting a dotfile could clear.
    expect(await readCachedToken(path)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @gisik-nokma/mcp-server exec vitest run 2>&1 | tail -20`
Expected: FAIL — cannot resolve `../src/token-cache.js`.

- [ ] **Step 3: Write `src/token-cache.ts`**

```ts
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type CachedToken = { token: string; userId: string };

/**
 * `null` for absent, unreadable and corrupt alike — three states that mean the
 * same thing to a caller ("there is no usable credential here") and one of
 * which is recoverable by the device flow. Distinguishing them would only give
 * the caller branches with no different action behind them.
 */
export async function readCachedToken(path: string): Promise<CachedToken | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof (parsed as { token?: unknown }).token !== 'string' ||
      typeof (parsed as { userId?: unknown }).userId !== 'string'
    ) {
      return null;
    }
    return { token: (parsed as CachedToken).token, userId: (parsed as CachedToken).userId };
  } catch {
    return null;
  }
}

/**
 * The mode arguments are the point of this function. `0600` on the file and
 * `0700` on its directory: a personal access token that any process on the
 * machine can read is not cached, it is published. `mkdir` is given the mode
 * explicitly rather than relying on the process umask, which is not this
 * module's to assume.
 */
export async function writeCachedToken(path: string, value: CachedToken): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
}

export async function clearCachedToken(path: string): Promise<void> {
  await rm(path, { force: true });
}
```

- [ ] **Step 4: Write the failing http-client tests**

`packages/mcp-server/test/http-client.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createGisikClient, HttpError, TransportError } from '../src/http-client.js';

/**
 * Plan: MCP server, Task 6. Cases 14.44–14.47.
 */
describe('the HTTP client', () => {
  it('14.44 sends the token as a bearer credential and returns the parsed body', async () => {
    let seen: Request | undefined;
    const client = createGisikClient('http://server', async (input, init) => {
      seen = new Request(input as string, init);
      return new Response(JSON.stringify({ workspaces: [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    expect(await client.get('/v1/me/workspaces', 'tok')).toEqual({ workspaces: [] });
    expect(seen?.url).toBe('http://server/v1/me/workspaces');
    expect(seen?.headers.get('authorization')).toBe('Bearer tok');
    // No cookie, ever. A bearer-only caller is outside the HTTP-Origin check by
    // construction, and sending one would put this client inside a CSRF
    // control it has no business being inside.
    expect(seen?.headers.get('cookie')).toBeNull();
  });

  it('14.45 throws HttpError carrying the server body VERBATIM', async () => {
    const client = createGisikClient('http://server', async () =>
      new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(client.get('/v1/x', 'tok')).rejects.toMatchObject({
      status: 404,
      body: { error: 'not_found' },
    });
    await expect(client.get('/v1/x', 'tok')).rejects.toBeInstanceOf(HttpError);
  });

  it('14.46 turns an unreachable server into a TransportError, and does NOT retry', async () => {
    let calls = 0;
    const client = createGisikClient('http://server', async () => {
      calls += 1;
      throw new TypeError('fetch failed');
    });
    await expect(client.post('/v1/events', { events: [] }, 'tok')).rejects.toBeInstanceOf(TransportError);
    // The spec's reasoning, pinned: an assistant retrying a write against an
    // unreachable server risks a double-submit once connectivity returns
    // mid-retry, which is worse than surfacing the failure once.
    expect(calls).toBe(1);
  });

  it('14.47 posts with no token when there is none — the device flow needs that', async () => {
    let seen: Request | undefined;
    const client = createGisikClient('http://server', async (input, init) => {
      seen = new Request(input as string, init);
      return new Response(JSON.stringify({ status: 'pending' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    await client.post('/v1/mcp/device/token', { deviceCode: 'd' }, null);
    expect(seen?.headers.get('authorization')).toBeNull();
  });
});
```

- [ ] **Step 5: Write `src/http-client.ts`**

```ts
export class TransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TransportError';
  }
}

/** Carries the server's own body, unread and unrewritten. Whoever surfaces
 *  this to an MCP client shows that body; nothing here summarises it. */
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`gisik-nokma answered ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export type GisikClient = {
  get(path: string, token: string): Promise<unknown>;
  post(path: string, body: unknown, token: string | null): Promise<unknown>;
};

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createGisikClient(serverUrl: string, fetchImpl: typeof fetch = fetch): GisikClient {
  async function send(method: string, path: string, body: unknown, token: string | null): Promise<unknown> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token !== null) headers['authorization'] = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';

    let response: Response;
    try {
      response = await fetchImpl(`${serverUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      // NOT retried, on purpose. See case 14.46 and the spec's Error handling
      // section: a retried write against a server that becomes reachable
      // mid-retry double-submits, and a double-submitted ticket is worse than
      // a failure the person is told about once.
      throw new TransportError(
        `could not reach gisik-nokma at ${serverUrl}: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
    const parsed = await readBody(response);
    if (!response.ok) throw new HttpError(response.status, parsed);
    return parsed;
  }

  return {
    get: (path, token) => send('GET', path, undefined, token),
    post: (path, body, token) => send('POST', path, body, token),
  };
}
```

Extend `src/index.ts`:

```ts
export * from './config.js';
export * from './token-cache.js';
export * from './http-client.js';
```

- [ ] **Step 6: Run everything in the package**

Run: `pnpm --filter @gisik-nokma/mcp-server exec vitest run 2>&1 | tail -20`
Expected: 11 passed (3 from Task 1, 4 + 4 here).

Run: `pnpm turbo run typecheck --filter @gisik-nokma/mcp-server 2>&1 | tail -10`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/src packages/mcp-server/test
git commit -m "MCP client: a 0600 token cache and an HTTP layer that carries the server's own words and never retries a write"
```

---

### Task 7: The device-flow login driver, and the single retry after re-auth

**Files:**
- Create: `packages/mcp-server/src/device-login.ts`
- Create: `packages/mcp-server/src/session.ts`
- Create: `packages/mcp-server/test/device-login.test.ts`
- Create: `packages/mcp-server/test/session.test.ts`
- Modify: `packages/mcp-server/src/index.ts`

**Interfaces:**
- Consumes: `GisikClient`, `HttpError`, `CachedToken`, `readCachedToken`, `writeCachedToken`, `clearCachedToken`, `McpConfig` (Tasks 1, 6); the wire contract from Task 3.
- Produces:

```ts
// device-login.ts
export type LoginPrompt = (info: { userCode: string; verificationUri: string }) => void;
export async function runDeviceLogin(deps: {
  client: GisikClient; prompt: LoginPrompt;
  sleep: (ms: number) => Promise<void>; now: () => number; deadlineMs: number;
}): Promise<CachedToken>;

// session.ts
export type Session = {
  /** The signed-in user's ULID — every write's `actorId`. */
  userId(): string;
  get(path: string): Promise<unknown>;
  postEvents(events: unknown[]): Promise<unknown>;
};
export async function createSession(deps: {
  config: McpConfig; client: GisikClient; prompt: LoginPrompt;
  sleep: (ms: number) => Promise<void>; now: () => number;
}): Promise<Session>;
```

- [ ] **Step 1: Write the failing device-login tests**

`packages/mcp-server/test/device-login.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { runDeviceLogin } from '../src/device-login.js';
import type { GisikClient } from '../src/http-client.js';

/**
 * Plan: MCP server, Task 7. Cases 14.50–14.53.
 */
function clientAnswering(script: unknown[]): { client: GisikClient; posts: string[] } {
  const posts: string[] = [];
  let i = 0;
  const client: GisikClient = {
    get: async () => { throw new Error('not used'); },
    post: async (path) => {
      posts.push(path);
      const next = script[i];
      i += 1;
      if (next === undefined) throw new Error('script exhausted');
      return next;
    },
  };
  return { client, posts };
}

describe('the device flow', () => {
  it('14.50 mints, prompts, polls until issued, and returns token + userId', async () => {
    const { client, posts } = clientAnswering([
      { deviceCode: 'dev', userCode: 'BCDF-GHJK', verificationUri: 'http://web/mcp/authorize', expiresInSec: 600, pollIntervalSec: 12 },
      { status: 'pending' },
      { status: 'pending' },
      { status: 'issued', token: 'tok', userId: '01J0USER0000000000000000AA' },
    ]);
    const prompt = vi.fn();
    const sleep = vi.fn(async () => {});

    const result = await runDeviceLogin({
      client, prompt, sleep, now: () => 0, deadlineMs: 600_000,
    });

    expect(result).toEqual({ token: 'tok', userId: '01J0USER0000000000000000AA' });
    expect(prompt).toHaveBeenCalledWith({ userCode: 'BCDF-GHJK', verificationUri: 'http://web/mcp/authorize' });
    expect(posts).toEqual([
      '/v1/mcp/device/code',
      '/v1/mcp/device/token',
      '/v1/mcp/device/token',
      '/v1/mcp/device/token',
    ]);
    // The interval comes from the SERVER's answer, not from a constant in this
    // file. If the server's budget changes, the client follows without a
    // release.
    expect(sleep).toHaveBeenCalledWith(12_000);
  });

  it('14.51 gives up at the deadline rather than polling forever', async () => {
    const { client } = clientAnswering([
      { deviceCode: 'dev', userCode: 'BCDF-GHJK', verificationUri: 'http://web/mcp/authorize', expiresInSec: 600, pollIntervalSec: 12 },
      { status: 'pending' },
      { status: 'pending' },
      { status: 'pending' },
    ]);
    let clock = 0;
    await expect(
      runDeviceLogin({
        client, prompt: () => {}, sleep: async () => { clock += 12_000; },
        now: () => clock, deadlineMs: 24_000,
      }),
    ).rejects.toThrow(/expired|not approved/i);
  });

  it('14.52 surfaces the prompt BEFORE the first poll', async () => {
    const order: string[] = [];
    const client: GisikClient = {
      get: async () => { throw new Error('not used'); },
      post: async (path) => {
        order.push(`post ${path}`);
        if (path === '/v1/mcp/device/code') {
          return { deviceCode: 'dev', userCode: 'BCDF-GHJK', verificationUri: 'http://web/a', expiresInSec: 600, pollIntervalSec: 1 };
        }
        return { status: 'issued', token: 'tok', userId: 'u' };
      },
    };
    await runDeviceLogin({
      client, prompt: () => order.push('prompt'), sleep: async () => {}, now: () => 0, deadlineMs: 600_000,
    });
    // A person cannot approve a code they have not been shown. Prompting after
    // the first poll would burn one poll interval of silence on every login.
    expect(order).toEqual(['post /v1/mcp/device/code', 'prompt', 'post /v1/mcp/device/token']);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/device-login.test.ts 2>&1 | tail -20`
Expected: FAIL — cannot resolve `../src/device-login.js`.

- [ ] **Step 3: Write `src/device-login.ts`**

```ts
import type { GisikClient } from './http-client.js';
import type { CachedToken } from './token-cache.js';

export type LoginPrompt = (info: { userCode: string; verificationUri: string }) => void;

type MintResponse = {
  deviceCode: string; userCode: string; verificationUri: string;
  expiresInSec: number; pollIntervalSec: number;
};

/**
 * The whole device flow, with every source of time injected so a test can run
 * it in microseconds and a reader can see there is no hidden clock.
 *
 * The poll INTERVAL comes from the server's own answer rather than a constant
 * here, because the server is the side that knows its rate-limit budget. A
 * client with its own number would 429 itself the day that budget changes, and
 * a login loop that rate-limits its own polling is indistinguishable from a
 * server that never approves.
 */
export async function runDeviceLogin(deps: {
  client: GisikClient;
  prompt: LoginPrompt;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  deadlineMs: number;
}): Promise<CachedToken> {
  const minted = (await deps.client.post('/v1/mcp/device/code', {}, null)) as MintResponse;
  deps.prompt({ userCode: minted.userCode, verificationUri: minted.verificationUri });

  const started = deps.now();
  const intervalMs = minted.pollIntervalSec * 1000;

  for (;;) {
    const answer = (await deps.client.post(
      '/v1/mcp/device/token',
      { deviceCode: minted.deviceCode },
      null,
    )) as { status: 'pending' } | { status: 'issued'; token: string; userId: string };

    if (answer.status === 'issued') {
      return { token: answer.token, userId: answer.userId };
    }
    if (deps.now() - started >= deps.deadlineMs) {
      throw new Error(
        `the sign-in request expired before it was approved. Run the tool again and approve ` +
          `${minted.verificationUri} with the code it shows.`,
      );
    }
    await deps.sleep(intervalMs);
  }
}
```

- [ ] **Step 4: Write the failing session tests**

`packages/mcp-server/test/session.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSession } from '../src/session.js';
import { HttpError, type GisikClient } from '../src/http-client.js';
import { writeCachedToken } from '../src/token-cache.js';
import { DEFAULT_POLL_INTERVAL_MS } from '../src/config.js';

/**
 * Plan: MCP server, Task 7. Cases 14.54–14.57.
 */
function scratchConfig() {
  return {
    serverUrl: 'http://server',
    tokenPath: join(mkdtempSync(join(tmpdir(), 'gisik-sess-')), 'mcp-token'),
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  };
}

describe('the session', () => {
  it('14.54 uses a cached token without running the device flow', async () => {
    const config = scratchConfig();
    await writeCachedToken(config.tokenPath, { token: 'cached', userId: '01J0USER0000000000000000AA' });
    const post = vi.fn();
    const client: GisikClient = { get: async () => ({ ok: true }), post };

    const session = await createSession({
      config, client, prompt: () => {}, sleep: async () => {}, now: () => 0,
    });
    expect(session.userId()).toBe('01J0USER0000000000000000AA');
    expect(await session.get('/v1/me/workspaces')).toEqual({ ok: true });
    expect(post).not.toHaveBeenCalled();
  });

  it('14.55 a 401 re-runs the device flow and retries the call ONCE', async () => {
    const config = scratchConfig();
    await writeCachedToken(config.tokenPath, { token: 'stale', userId: 'old' });
    let gets = 0;
    const client: GisikClient = {
      get: async (_path, token) => {
        gets += 1;
        if (token === 'stale') throw new HttpError(401, { error: 'unauthenticated' });
        return { ok: true };
      },
      post: async (path) =>
        path === '/v1/mcp/device/code'
          ? { deviceCode: 'd', userCode: 'BCDF-GHJK', verificationUri: 'http://web/a', expiresInSec: 600, pollIntervalSec: 1 }
          : { status: 'issued', token: 'fresh', userId: '01J0USER0000000000000000BB' },
    };

    const session = await createSession({
      config, client, prompt: () => {}, sleep: async () => {}, now: () => 0,
    });
    expect(await session.get('/v1/me/workspaces')).toEqual({ ok: true });
    expect(gets).toBe(2);
    // The user id must move with the token. A stale id would make every write's
    // `actorId` disagree with the session and draw an identity-spoof refusal
    // from the permission gate — a confusing failure a long way from its cause.
    expect(session.userId()).toBe('01J0USER0000000000000000BB');
  });

  it('14.56 a second 401 is surfaced, not looped on', async () => {
    const config = scratchConfig();
    await writeCachedToken(config.tokenPath, { token: 'stale', userId: 'old' });
    let gets = 0;
    const client: GisikClient = {
      get: async () => { gets += 1; throw new HttpError(401, { error: 'unauthenticated' }); },
      post: async (path) =>
        path === '/v1/mcp/device/code'
          ? { deviceCode: 'd', userCode: 'BCDF-GHJK', verificationUri: 'http://web/a', expiresInSec: 600, pollIntervalSec: 1 }
          : { status: 'issued', token: 'fresh', userId: 'u' },
    };
    const session = await createSession({
      config, client, prompt: () => {}, sleep: async () => {}, now: () => 0,
    });
    await expect(session.get('/v1/x')).rejects.toBeInstanceOf(HttpError);
    // Exactly twice: the original and one retry. An unbounded re-auth loop
    // against a server that 401s everything would spin forever and spend the
    // device-flow rate-limit budget doing it.
    expect(gets).toBe(2);
  });

  it('14.57 a 404 is NOT a re-auth trigger — it is the answer', async () => {
    const config = scratchConfig();
    await writeCachedToken(config.tokenPath, { token: 'good', userId: 'u' });
    const post = vi.fn();
    const client: GisikClient = {
      get: async () => { throw new HttpError(404, { error: 'not_found' }); },
      post,
    };
    const session = await createSession({ config, client, prompt: () => {}, sleep: async () => {}, now: () => 0 });
    await expect(session.get('/v1/x')).rejects.toMatchObject({ status: 404, body: { error: 'not_found' } });
    expect(post).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Write `src/session.ts`**

```ts
import type { McpConfig } from './config.js';
import { HttpError, type GisikClient } from './http-client.js';
import { runDeviceLogin, type LoginPrompt } from './device-login.js';
import { clearCachedToken, readCachedToken, writeCachedToken, type CachedToken } from './token-cache.js';

export type Session = {
  /** The signed-in user's ULID. Every write's `actorId` is this, and the
   *  permission gate refuses any envelope where it is not. */
  userId(): string;
  get(path: string): Promise<unknown>;
  postEvents(events: unknown[]): Promise<unknown>;
};

/**
 * Authentication, and the ONE retry.
 *
 * A 401 means the cached token is expired or revoked, which the person can fix
 * by approving a fresh one — so it re-runs the device flow and repeats the call
 * once. Exactly once: a server answering 401 to everything would otherwise spin
 * this loop forever and spend the device-flow rate-limit budget doing it, and
 * the second 401 is information the caller needs rather than a condition to
 * keep working around.
 *
 * No other status re-authenticates. A 404 from a visibility refusal is THE
 * ANSWER — the product's deliberate "you may not know whether this exists" —
 * and re-authenticating on it would turn a correct refusal into a login prompt.
 */
export async function createSession(deps: {
  config: McpConfig;
  client: GisikClient;
  prompt: LoginPrompt;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}): Promise<Session> {
  let cached: CachedToken =
    (await readCachedToken(deps.config.tokenPath)) ?? (await login());

  async function login(): Promise<CachedToken> {
    const fresh = await runDeviceLogin({
      client: deps.client,
      prompt: deps.prompt,
      sleep: deps.sleep,
      now: deps.now,
      deadlineMs: 600_000,
    });
    await writeCachedToken(deps.config.tokenPath, fresh);
    return fresh;
  }

  async function withReauth<T>(call: (token: string) => Promise<T>): Promise<T> {
    try {
      return await call(cached.token);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) throw error;
      await clearCachedToken(deps.config.tokenPath);
      cached = await login();
      return await call(cached.token);
    }
  }

  return {
    userId: () => cached.userId,
    get: (path) => withReauth((token) => deps.client.get(path, token)),
    postEvents: (events) => withReauth((token) => deps.client.post('/v1/events', { events }, token)),
  };
}
```

Extend `src/index.ts` with `export * from './device-login.js';` and `export * from './session.js';`.

- [ ] **Step 6: Run the package suite**

Run: `pnpm --filter @gisik-nokma/mcp-server exec vitest run 2>&1 | tail -20`
Expected: 18 passed. Confirm the count — a suite reporting 0 files is not a pass.

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/src packages/mcp-server/test
git commit -m "Device-flow login and a session that re-authenticates on 401 exactly once"
```

---

### Task 8: The five read tools

**Files:**
- Create: `packages/mcp-server/src/tools/read-tools.ts`
- Create: `packages/mcp-server/test/read-tools.test.ts`

**Interfaces:**
- Consumes: `Session` (Task 7).
- Produces: `readTools(session: Session): ToolDefinition[]` where

```ts
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler(args: Record<string, unknown>): Promise<unknown>;
};
```

Task 10 registers these with the MCP SDK. Keeping the definition SDK-agnostic is deliberate: the tools are testable without a transport, and the one place that knows the SDK's registration API is `tools/register.ts`.

- [ ] **Step 1: Pin the routes each tool calls, from the live contract**

Verified against the tree; do not re-derive these from the spec's table, which names them loosely.

| Tool | Route | Notes that will bite |
|---|---|---|
| `list_workspaces` | `GET /v1/me/workspaces` | Returns `{workspaces:[{workspaceId,name,role,projects}]}`; `projects` elements are `{projectId,name}` and the list is **deliberately partial** for a non-owner. |
| `list_projects` | `GET /v1/me/workspaces`, then pick | There is **no** projects route. The projects a person may be told the name of arrive inside the workspaces response. Filter by `workspaceId` client-side; do not invent `/v1/workspaces/:id/projects`. |
| `search_tickets` | `GET /v1/search?workspaceId&q[&filter]` | `q` is REQUIRED (1–500 chars). A `filter` carrying `text` is a `400 {error:'invalid_filter'}` — `q` is the text term. **Hard `LIMIT 50`, no cursor**; the 51st match is unreachable. |
| `list_tickets` | `GET /v1/projects/:projectId/tickets` | Query: `groupBy` (default `flat`), `filter` (JSON-encoded `FilterSpec`), `parentId`, `cursor`, `limit` (1–200, default 50). **`parentId: 'root'` is magic** — it means `parent_id IS NULL`. |
| `get_ticket` | `GET /v1/workspaces/:workspaceId/tickets/:ticketId` | Returns `{ticket, ticketState, title, stateProvenance, parent, rollup}`. `ticket` is snake_case; `ticketState` is camelCase. Both are passed through unchanged. |

`FilterSpec` is `filterSpecSchema` from `@gisik-nokma/domain` (`packages/domain/src/filter-spec.ts:119`) — **`.strict()`, and its assignee/collaborator keys are SINGULAR** (`assigneeId`, `collaboratorId`, not arrays). It is passed as `filter=<JSON.stringify(spec) URL-encoded>`. Import the schema; do not restate its shape.

- [ ] **Step 2: Write the failing tests**

`packages/mcp-server/test/read-tools.test.ts` — one test per tool plus the two traps:

```ts
import { describe, expect, it } from 'vitest';
import { readTools } from '../src/tools/read-tools.js';
import type { Session } from '../src/session.js';

/**
 * Plan: MCP server, Task 8. Cases 14.60–14.66.
 */
function sessionRecording(answer: unknown): { session: Session; paths: string[] } {
  const paths: string[] = [];
  const session: Session = {
    userId: () => '01J0USER0000000000000000AA',
    get: async (path) => { paths.push(path); return answer; },
    postEvents: async () => { throw new Error('not a read'); },
  };
  return { session, paths };
}

function tool(name: string, session: Session) {
  const found = readTools(session).find((t) => t.name === name);
  if (found === undefined) throw new Error(`no tool named ${name}`);
  return found;
}

describe('the read tools', () => {
  it('14.60 list_workspaces passes the server body through unchanged', async () => {
    const body = { workspaces: [{ workspaceId: 'w1', name: 'Shop', role: 'owner', projects: [{ projectId: 'p1', name: 'Ops' }] }] };
    const { session, paths } = sessionRecording(body);
    expect(await tool('list_workspaces', session).handler({})).toEqual(body);
    expect(paths).toEqual(['/v1/me/workspaces']);
  });

  it('14.61 list_projects reads the workspaces route, because no projects route exists', async () => {
    const body = { workspaces: [
      { workspaceId: 'w1', name: 'Shop', role: 'owner', projects: [{ projectId: 'p1', name: 'Ops' }] },
      { workspaceId: 'w2', name: 'Other', role: 'guest', projects: [{ projectId: 'p2', name: 'Else' }] },
    ] };
    const { session, paths } = sessionRecording(body);
    expect(await tool('list_projects', session).handler({ workspaceId: 'w1' })).toEqual({
      workspaceId: 'w1',
      projects: [{ projectId: 'p1', name: 'Ops' }],
    });
    expect(paths).toEqual(['/v1/me/workspaces']);
  });

  it('14.62 list_projects answers an empty list for a workspace the person cannot see', async () => {
    const { session } = sessionRecording({ workspaces: [] });
    expect(await tool('list_projects', session).handler({ workspaceId: 'nope' })).toEqual({
      workspaceId: 'nope', projects: [],
    });
  });

  it('14.63 search_tickets encodes q and workspaceId, and omits an absent filter', async () => {
    const { session, paths } = sessionRecording({ workspaceId: 'w1', query: 'gst', hits: [] });
    await tool('search_tickets', session).handler({ workspaceId: 'w1', query: 'gst return' });
    expect(paths).toEqual(['/v1/search?workspaceId=w1&q=gst+return']);
  });

  it('14.64 search_tickets refuses a filter carrying `text` before the network', async () => {
    const { session, paths } = sessionRecording({});
    // The server answers 400 {error:'invalid_filter'} for this. Refusing it
    // here as well is not a duplicated rule: it is the difference between an
    // assistant being told which of its two text terms is the problem and
    // being told "invalid_filter".
    await expect(
      tool('search_tickets', session).handler({ workspaceId: 'w1', query: 'x', filter: { text: 'y' } }),
    ).rejects.toThrow(/text/);
    expect(paths).toEqual([]);
  });

  it('14.65 list_tickets JSON-encodes the FilterSpec into one filter parameter', async () => {
    const { session, paths } = sessionRecording({ projectId: 'p1', groupBy: 'flat', groups: [], nextCursor: null });
    await tool('list_tickets', session).handler({
      projectId: 'p1', groupBy: 'status', filter: { stateCategory: 'open' }, limit: 25,
    });
    // Built with the same URLSearchParams construction the handler uses, so
    // parameter ORDER cannot drift between test and code and turn a correct
    // handler red. What is asserted is the encoding — one `filter` parameter
    // carrying the whole JSON-stringified spec — not the ordering.
    const expected = new URLSearchParams();
    expected.set('groupBy', 'status');
    expected.set('limit', '25');
    expected.set('filter', JSON.stringify({ stateCategory: 'open' }));
    expect(paths).toEqual([`/v1/projects/p1/tickets?${expected.toString()}`]);
  });

  it('14.66 get_ticket passes both casings through untouched', async () => {
    const body = {
      ticket: { ticket_id: 't1', workspace_id: 'w1', project_id: 'p1', parent_id: null, own_mode: 'inherit', resolved_mode: 'project', seq: 3 },
      ticketState: { kind: 'ticket', id: 't1', assigneeId: null, collaboratorIds: [] },
      title: 'A ticket', stateProvenance: null, parent: null, rollup: null,
    };
    const { session, paths } = sessionRecording(body);
    expect(await tool('get_ticket', session).handler({ workspaceId: 'w1', ticketId: 't1' })).toEqual(body);
    expect(paths).toEqual(['/v1/workspaces/w1/tickets/t1']);
    // The mixed casing is the SERVER's contract. Normalising it here would be
    // this package inventing a shape, which is exactly what the spec forbids.
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/read-tools.test.ts 2>&1 | tail -20`
Expected: FAIL — cannot resolve `../src/tools/read-tools.js`.

- [ ] **Step 4: Write `src/tools/read-tools.ts`**

```ts
import { z } from 'zod';
import { filterSpecSchema } from '@gisik-nokma/domain';
import type { Session } from '../session.js';

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler(args: Record<string, unknown>): Promise<unknown>;
};

/** `filter` is the domain schema, imported and not restated. It is `.strict()`,
 *  and its assignee/collaborator keys are SINGULAR — a caller passing an array
 *  is refused by the schema rather than silently matching nothing. */
const filterArg = filterSpecSchema.optional();

export function readTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'list_workspaces',
      description:
        'List the gisik-nokma workspaces you belong to, with your role in each and the projects ' +
        'you can see inside them. The project list is deliberately partial: a project you are not ' +
        'a member of is absent rather than named.',
      inputSchema: {},
      handler: async () => session.get('/v1/me/workspaces'),
    },
    {
      name: 'list_projects',
      description:
        'List the projects you can see inside one workspace. Reads the same workspace directory as ' +
        'list_workspaces — the server has no separate projects route — and returns an empty list for ' +
        'a workspace you cannot see.',
      inputSchema: { workspaceId: z.string().min(1) },
      handler: async (args) => {
        const workspaceId = z.string().min(1).parse(args['workspaceId']);
        const body = (await session.get('/v1/me/workspaces')) as {
          workspaces: { workspaceId: string; projects: { projectId: string; name: string }[] }[];
        };
        const match = body.workspaces.find((w) => w.workspaceId === workspaceId);
        return { workspaceId, projects: match?.projects ?? [] };
      },
    },
    {
      name: 'search_tickets',
      description:
        'Full-text search across the tickets you can see in one workspace. Returns at most 50 hits ' +
        'and has no pagination — narrow the query or the filter rather than expecting a next page. ' +
        'Use list_tickets when you need to enumerate.',
      inputSchema: {
        workspaceId: z.string().min(1),
        query: z.string().min(1).max(500),
        filter: filterArg,
      },
      handler: async (args) => {
        const parsed = z
          .object({ workspaceId: z.string().min(1), query: z.string().min(1).max(500), filter: filterArg })
          .parse(args);
        if (parsed.filter?.text !== undefined) {
          // Refused here rather than at the server, which answers a bare
          // `invalid_filter` that does not say which of the two text terms is
          // the problem.
          throw new Error(
            'search_tickets takes the search text as `query`; a `text` key inside `filter` is refused ' +
              'by the server. Pass one or the other, not both.',
          );
        }
        const search = new URLSearchParams({ workspaceId: parsed.workspaceId, q: parsed.query });
        if (parsed.filter !== undefined) search.set('filter', JSON.stringify(parsed.filter));
        return session.get(`/v1/search?${search.toString()}`);
      },
    },
    {
      name: 'list_tickets',
      description:
        'List tickets in one project, optionally grouped and filtered. `parentId` accepts the literal ' +
        'value "root" to mean top-level tickets only. Pages with `cursor`; the response carries ' +
        '`nextCursor` (null on the last page).',
      inputSchema: {
        projectId: z.string().min(1),
        groupBy: z.enum(['epic', 'status', 'assignee', 'type', 'flat']).optional(),
        filter: filterArg,
        parentId: z.string().min(1).optional(),
        cursor: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      handler: async (args) => {
        const parsed = z
          .object({
            projectId: z.string().min(1),
            groupBy: z.enum(['epic', 'status', 'assignee', 'type', 'flat']).optional(),
            filter: filterArg,
            parentId: z.string().min(1).optional(),
            cursor: z.string().min(1).optional(),
            limit: z.number().int().min(1).max(200).optional(),
          })
          .parse(args);
        const search = new URLSearchParams();
        if (parsed.groupBy !== undefined) search.set('groupBy', parsed.groupBy);
        if (parsed.parentId !== undefined) search.set('parentId', parsed.parentId);
        if (parsed.cursor !== undefined) search.set('cursor', parsed.cursor);
        if (parsed.limit !== undefined) search.set('limit', String(parsed.limit));
        if (parsed.filter !== undefined) search.set('filter', JSON.stringify(parsed.filter));
        const query = search.toString();
        return session.get(`/v1/projects/${encodeURIComponent(parsed.projectId)}/tickets${query === '' ? '' : `?${query}`}`);
      },
    },
    {
      name: 'get_ticket',
      description:
        'Read one ticket in full: its visibility row, its folded state (assignee, collaborators, ' +
        'custom fields, transition history), its title, who last moved it, its parent and its rollup. ' +
        'A ticket you cannot see is indistinguishable from one that does not exist — both answer not_found.',
      inputSchema: { workspaceId: z.string().min(1), ticketId: z.string().min(1) },
      handler: async (args) => {
        const parsed = z.object({ workspaceId: z.string().min(1), ticketId: z.string().min(1) }).parse(args);
        return session.get(
          `/v1/workspaces/${encodeURIComponent(parsed.workspaceId)}/tickets/${encodeURIComponent(parsed.ticketId)}`,
        );
      },
    },
  ];
}
```

- [ ] **Step 5: Run**

Run: `pnpm --filter @gisik-nokma/mcp-server exec vitest run 2>&1 | tail -20`
Expected: 25 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/src/tools/read-tools.ts packages/mcp-server/test/read-tools.test.ts
git commit -m "The five MCP read tools: passthroughs of routes that already exist, with the server's own shapes intact"
```

---

### Task 9: The four write tools

**Files:**
- Create: `packages/mcp-server/src/tools/write-tools.ts`
- Create: `packages/mcp-server/test/write-tools.test.ts`

**Interfaces:**
- Consumes: `Session` (Task 7); `ToolDefinition` (Task 8); from `@gisik-nokma/domain`: `newUlid`, `newSubmittedEvent`, `ticketCreatedPayload`, `ticketTransitionedPayloadSchema`, `commentAddedPayload`, `ticketAssignedPayload`, `plainTextToDoc`.
- Produces: `writeTools(session: Session): ToolDefinition[]`.

- [ ] **Step 1: Pin the four event shapes, verified against `packages/domain`**

**These differ from the spec's prose. The spec is loose here; the code below is the tree.**

| Tool | `type` | `version` | `entity` | Payload (exact) |
|---|---|---|---|---|
| `create_ticket` | `ticket.created` | 1 | `{kind:'ticket', id:<new ULID>}` | `{ typeId: string, projectId: ULID, parentId: string \| null, title: string }` |
| `transition_ticket` | `ticket.transitioned` | 1 | `{kind:'ticket', id:<ticketId>}` | `{ to: string, comment?: {text: string}, evidenceAttachmentId?: string }` |
| `add_comment` | `comment.added` | 1 | `{kind:'ticket', id:<ticketId>}` | `{ body: Record<string, unknown> }` |
| `assign_ticket` | `ticket.assigned` | 1 | `{kind:'ticket', id:<ticketId>}` | `{ assigneeId: string \| null }` |

Four traps, each of which produces a refusal a long way from its cause:

1. **`parentId` and `assigneeId` are `.nullable()`, not `.optional()`** — the key must be **present** and explicitly `null`. Omitting it is `invalid-payload`.
2. **The transition payload's key is `to`, not `toStateId`** (`packages/domain/src/workflow.ts:137`; `vocabulary.ts:77-84` records the deliberate choice). The spec's prose says "workflow-transition event" and does not name the key; an executor who guesses `toStateId` gets `invalid-payload` on every transition.
3. **`comment.added`'s `body` is a document OBJECT, not a string** — `z.record(z.string(), z.unknown())`. `plainTextToDoc(text)` from `@gisik-nokma/domain` builds the shape.
4. **`origin` is `'web'` and `actorId` is `session.userId()`.** `ORIGINS` has no `'mcp'` (Open question 1) and `origin: 'server'` is refused outright at the client door (`check-permission.ts:403`), as is any envelope whose `actorId` is not the session user (`:400`).

- [ ] **Step 2: Write the failing tests**

`packages/mcp-server/test/write-tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ULID_REGEX, domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { writeTools } from '../src/tools/write-tools.js';
import type { Session } from '../src/session.js';

/**
 * Plan: MCP server, Task 9. Cases 14.70–14.77.
 */
const USER = '01J0USER0000000000000000AA';

function sessionCapturing(result: unknown): { session: Session; sent: unknown[][] } {
  const sent: unknown[][] = [];
  const session: Session = {
    userId: () => USER,
    get: async () => { throw new Error('not a write'); },
    postEvents: async (events) => { sent.push(events); return result; },
  };
  return { session, sent };
}

function tool(name: string, session: Session) {
  const found = writeTools(session).find((t) => t.name === name);
  if (found === undefined) throw new Error(`no tool named ${name}`);
  return found;
}

const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-09-07T10:00:00.000Z' }] };

describe('every write builds an envelope the SERVER would accept', () => {
  it('14.70 create_ticket builds a ticket.created that parseEvent accepts', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('create_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA',
      projectId: '01J0PROJ00000000000000000A',
      typeId: 'task',
      title: 'Renew the trade licence',
      parentId: null,
    });
    const envelope = sent[0]?.[0];
    // The strongest available check short of a live server: the product's own
    // envelope parser, with the product's own registry. A payload key this
    // package guessed wrong fails HERE rather than as an `invalid-payload`
    // result after a round trip.
    const parsed = parseEvent({ ...(envelope as object), serverTime: '2026-09-07T10:00:00.000Z', seq: 1 }, domainRegistry);
    expect('error' in (parsed as object)).toBe(false);
    expect(envelope).toMatchObject({
      type: 'ticket.created',
      version: 1,
      actorId: USER,
      origin: 'mcp',
      entity: { kind: 'ticket' },
      payload: { typeId: 'task', projectId: '01J0PROJ00000000000000000A', parentId: null, title: 'Renew the trade licence' },
    });
    expect((envelope as { entity: { id: string } }).entity.id).toMatch(ULID_REGEX);
  });

  it('14.71 create_ticket sends parentId as an explicit null, never an absent key', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('create_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', projectId: '01J0PROJ00000000000000000A',
      typeId: 'task', title: 'x',
    });
    const payload = (sent[0]?.[0] as { payload: Record<string, unknown> }).payload;
    // `.nullable()` not `.optional()`: an absent key is `invalid-payload`.
    expect(Object.hasOwn(payload, 'parentId')).toBe(true);
    expect(payload['parentId']).toBeNull();
  });

  it('14.72 transition_ticket uses the key `to`, not `toStateId`', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('transition_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TICK00000000000000000A',
      toStateId: undefined, to: 'in-progress', comment: 'starting',
    });
    expect((sent[0]?.[0] as { payload: unknown }).payload).toEqual({ to: 'in-progress', comment: { text: 'starting' } });
  });

  it('14.73 transition_ticket omits comment entirely when none is given', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('transition_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TICK00000000000000000A', to: 'done',
    });
    expect((sent[0]?.[0] as { payload: unknown }).payload).toEqual({ to: 'done' });
  });

  it('14.74 add_comment sends a document object, not a string', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('add_comment', session).handler({
      workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TICK00000000000000000A', text: 'hello',
    });
    const payload = (sent[0]?.[0] as { payload: { body: unknown } }).payload;
    expect(typeof payload.body).toBe('object');
    expect(payload.body).toMatchObject({ type: 'doc' });
  });

  it('14.75 assign_ticket sends an explicit null to unassign', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('assign_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TICK00000000000000000A', assigneeId: null,
    });
    expect((sent[0]?.[0] as { payload: unknown }).payload).toEqual({ assigneeId: null });
  });
});

describe('a refusal arrives with its own words', () => {
  it('14.76 a rule-engine refusal is thrown with rule and reason intact', async () => {
    const { session } = sessionCapturing({
      results: [{ status: 'refused', eventId: 'e', rule: 'require-comment', reason: 'Moving to done needs a comment saying what was done.' }],
    });
    await expect(
      tool('transition_ticket', session).handler({
        workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TICK00000000000000000A', to: 'done',
      }),
    ).rejects.toThrow('Moving to done needs a comment saying what was done.');
    // Verbatim, not paraphrased: the refusal's own words are the product's
    // contract with the person, and an assistant that reworded them would be
    // inventing a rule the product does not have.
    await expect(
      tool('transition_ticket', session).handler({
        workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TICK00000000000000000A', to: 'done',
      }),
    ).rejects.toThrow('require-comment');
  });

  it('14.77 an invalid result carries its code and message', async () => {
    const { session } = sessionCapturing({
      results: [{ status: 'invalid', eventId: 'e', code: 'invalid-payload', message: 'title: String must contain at least 1 character(s)' }],
    });
    await expect(
      tool('create_ticket', session).handler({
        workspaceId: '01J0WS000000000000000000AA', projectId: '01J0PROJ00000000000000000A', typeId: 'task', title: 'x',
      }),
    ).rejects.toThrow(/invalid-payload/);
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/write-tools.test.ts 2>&1 | tail -30`
Expected: FAIL — cannot resolve `../src/tools/write-tools.js`.

- [ ] **Step 4: Write `src/tools/write-tools.ts`**

```ts
import { z } from 'zod';
import { newSubmittedEvent, newUlid, plainTextToDoc, type SubmittedEvent } from '@gisik-nokma/domain';
import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';

/**
 * The single write path, for all four tools.
 *
 * `POST /v1/events` answers 200 for a refusal — refusals ride INSIDE
 * `results[]`, index-aligned with the request array, and only a malformed
 * BATCH is an HTTP error. So a caller that checked the status code alone would
 * report every refusal as a success. This function is the one place that
 * reads the result, and it throws the server's own words rather than a summary
 * of them.
 */
async function submitOne(session: Session, event: SubmittedEvent): Promise<unknown> {
  const body = (await session.postEvents([event])) as {
    results: (
      | { status: 'committed'; eventId: string; seq: number; serverTime: string }
      | { status: 'invalid'; eventId: string | null; code: string; message: string }
      | { status: 'refused'; eventId: string; rule: string; reason: string }
    )[];
  };
  const result = body.results[0];
  if (result === undefined) {
    throw new Error('gisik-nokma returned no result for the submitted event');
  }
  if (result.status === 'refused') {
    // VERBATIM. The rule's name and the reason's own sentence, because a
    // refusal is the product explaining itself to a person and a reworded
    // refusal is a different product.
    throw new Error(`refused by ${result.rule}: ${result.reason}`);
  }
  if (result.status === 'invalid') {
    throw new Error(`${result.code}: ${result.message}`);
  }
  return result;
}

function envelope(
  session: Session,
  workspaceId: string,
  entityId: string,
  type: string,
  payload: unknown,
): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId,
    entity: { kind: 'ticket', id: entityId },
    type,
    payload,
    // The session user, always. The permission gate's first question is
    // whether the actor is the person submitting, and it refuses any envelope
    // where they differ.
    actorId: session.userId(),
      // `'mcp'` — owner ruling 1. This was `'web'` while ORIGINS had no
      // fifth member; Task 0 adds one, and the whole reason it exists is
      // that a ledger which cannot distinguish a person's claim from their
      // assistant's is a ledger lying about who acted. `'server'` remains
      // refused at the client door.
    origin: 'mcp',
  });
}

export function writeTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'create_ticket',
      description:
        'Create a ticket in a project. `typeId` names a ticket type that already exists in the ' +
        'workspace; `parentId` is the epic or parent ticket, or null for a top-level ticket. The ' +
        'workflow, the initial state and every rule are the product\'s, not this tool\'s.',
      inputSchema: {
        workspaceId: z.string().min(1),
        projectId: z.string().min(1),
        typeId: z.string().min(1),
        title: z.string().min(1),
        parentId: z.string().min(1).nullable().optional(),
      },
      handler: async (args) => {
        const a = z
          .object({
            workspaceId: z.string().min(1),
            projectId: z.string().min(1),
            typeId: z.string().min(1),
            title: z.string().min(1),
            parentId: z.string().min(1).nullable().optional(),
          })
          .parse(args);
        const ticketId = newUlid();
        const event = envelope(session, a.workspaceId, ticketId, 'ticket.created', {
          typeId: a.typeId,
          projectId: a.projectId,
          // Explicit null, never an absent key: the domain schema is
          // `.nullable()`, not `.optional()`.
          parentId: a.parentId ?? null,
          title: a.title,
        });
        const committed = await submitOne(session, event);
        return { ticketId, ...(committed as object) };
      },
    },
    {
      name: 'transition_ticket',
      description:
        'Move a ticket to another state in its workflow. The rule engine decides whether the move is ' +
        'allowed; if it refuses, this tool reports the rule and the reason exactly as the server ' +
        'wrote them. Some transitions require a comment — pass one.',
      inputSchema: {
        workspaceId: z.string().min(1),
        ticketId: z.string().min(1),
        to: z.string().min(1),
        comment: z.string().min(1).optional(),
      },
      handler: async (args) => {
        const a = z
          .object({
            workspaceId: z.string().min(1),
            ticketId: z.string().min(1),
            to: z.string().min(1),
            comment: z.string().min(1).optional(),
          })
          .parse(args);
        // `to`, not `toStateId` — packages/domain/src/workflow.ts:137.
        const payload: { to: string; comment?: { text: string } } = { to: a.to };
        if (a.comment !== undefined) payload.comment = { text: a.comment };
        return submitOne(session, envelope(session, a.workspaceId, a.ticketId, 'ticket.transitioned', payload));
      },
    },
    {
      name: 'add_comment',
      description: 'Add a comment to a ticket, attributed to you.',
      inputSchema: {
        workspaceId: z.string().min(1),
        ticketId: z.string().min(1),
        text: z.string().min(1),
      },
      handler: async (args) => {
        const a = z
          .object({ workspaceId: z.string().min(1), ticketId: z.string().min(1), text: z.string().min(1) })
          .parse(args);
        // A document object, not a string — `commentAddedPayload.body` is
        // `z.record(z.string(), z.unknown())`.
        return submitOne(
          session,
          envelope(session, a.workspaceId, a.ticketId, 'comment.added', { body: plainTextToDoc(a.text) }),
        );
      },
    },
    {
      name: 'assign_ticket',
      description: 'Assign a ticket to somebody, or pass null to leave it unassigned.',
      inputSchema: {
        workspaceId: z.string().min(1),
        ticketId: z.string().min(1),
        assigneeId: z.string().min(1).nullable(),
      },
      handler: async (args) => {
        const a = z
          .object({
            workspaceId: z.string().min(1),
            ticketId: z.string().min(1),
            assigneeId: z.string().min(1).nullable(),
          })
          .parse(args);
        return submitOne(
          session,
          envelope(session, a.workspaceId, a.ticketId, 'ticket.assigned', { assigneeId: a.assigneeId }),
        );
      },
    },
  ];
}
```

**Verify `newSubmittedEvent`'s signature before writing this** — read `packages/domain/src/submit.ts:9`. The call above assumes it fills `id`, `version` (default 1) and `clientTime`. If its parameter names differ, follow the source, not this block, and say so in the ledger row.

- [ ] **Step 5: Run, then plant the two traps and watch them caught**

Run: `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/write-tools.test.ts 2>&1 | tail -30`
Expected: 8 passed.

Now plant, one at a time, re-running between each:
1. Change `to:` to `toStateId:` in the transition payload → **14.72 must fail.**
2. Change `parentId: a.parentId ?? null` to omit the key when undefined → **14.71 must fail, and 14.70's `parseEvent` check must fail too.** Two failures; if only one fires, 14.70 is not doing the work its comment claims.
3. Change the refusal throw to `throw new Error('the server refused this')` → **14.76 must fail on both assertions.**

Restore after each. Record which planted defect produced which failure in the ledger row — an exit code alone is not evidence.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/src/tools/write-tools.ts packages/mcp-server/test/write-tools.test.ts
git commit -m "The four MCP write tools: real domain events, and refusals surfaced in the server's own words"
```

---

### Task 10: The stdio entrypoint, and how a person installs it

**Files:**
- Create: `packages/mcp-server/src/tools/register.ts`
- Create: `packages/mcp-server/src/main.ts`
- Create: `packages/mcp-server/README.md`
- Create: `packages/mcp-server/test/register.test.ts`
- Modify: `docs/runbook.md`

**Interfaces:**
- Consumes: `readTools`, `writeTools`, `createSession`, `loadMcpConfig`, `createGisikClient`.
- Produces: the `gisik-nokma-mcp` bin, and `registerTools(server, session)`.

- [ ] **Step 1: Verify the SDK's registration API against the installed package**

Do not write against recall. Run:

```
node -e "const s=require('@modelcontextprotocol/sdk/package.json');console.log(s.version)"
ls node_modules/@modelcontextprotocol/sdk/dist/esm/server/
```

Read the `McpServer` class's `registerTool`/`tool` signature in the installed `.d.ts` and confirm whether `inputSchema` takes a **zod raw shape** (an object of zod validators) or a JSON Schema. `@modelcontextprotocol/sdk@1.30.0` declares `zod: '^3.25 || ^4.0'` as a dependency and a peer, and ships `zod-to-json-schema`, which strongly suggests a raw shape — but **confirm it, and if it takes JSON Schema instead, convert with `zod-to-json-schema` in `register.ts` and nowhere else.** The `ToolDefinition.inputSchema` type from Task 8 is the seam that makes that a one-file change.

- [ ] **Step 2: Write `src/tools/register.ts`**

One wiring point. Every tool's handler result is returned as MCP content; every thrown error becomes an MCP tool error carrying the message verbatim.

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Session } from '../session.js';
import { readTools, type ToolDefinition } from './read-tools.js';
import { writeTools } from './write-tools.js';

export function allTools(session: Session): ToolDefinition[] {
  return [...readTools(session), ...writeTools(session)];
}

/**
 * The ONE place that knows the MCP SDK's registration API. Everything else in
 * this package speaks `ToolDefinition`, so an SDK upgrade that moves this
 * signature is a one-file change and every tool test keeps running with no
 * transport at all.
 *
 * An error thrown by a handler is returned as `isError: true` with the
 * message unchanged — a refusal from the rule engine reaches the assistant
 * saying what the rule was and why, which is the whole point.
 */
export function registerTools(server: McpServer, session: Session): void {
  for (const tool of allTools(session)) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args: Record<string, unknown>) => {
        try {
          const result = await tool.handler(args);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
          };
        }
      },
    );
  }
}
```

Adjust the exact `registerTool` call to whatever Step 1 established. `test/register.test.ts` asserts `allTools(fakeSession)` yields exactly the nine names, in a stable order — that is the test that catches a tool silently dropped.

- [ ] **Step 3: Write `src/main.ts`**

```ts
#!/usr/bin/env node
import { homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadMcpConfig } from './config.js';
import { createGisikClient } from './http-client.js';
import { createSession } from './session.js';
import { registerTools } from './tools/register.js';

/**
 * The login prompt goes to STDERR, always, and this is not a style choice:
 * stdout IS the MCP transport. A single line written there corrupts the
 * protocol stream and the client sees a parse error instead of a sign-in
 * instruction.
 */
function prompt(info: { userCode: string; verificationUri: string }): void {
  process.stderr.write(
    `\ngisik-nokma needs you to approve this assistant.\n` +
      `  1. Open ${info.verificationUri}\n` +
      `  2. Enter the code ${info.userCode}\n` +
      `Waiting…\n\n`,
  );
}

async function main(): Promise<void> {
  const config = loadMcpConfig(process.env, homedir());
  const client = createGisikClient(config.serverUrl);
  const session = await createSession({
    config,
    client,
    prompt,
    sleep: (ms) => delay(ms),
    now: () => Date.now(),
  });

  const server = new McpServer({ name: 'gisik-nokma', version: '0.1.0' });
  registerTools(server, session);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
```

- [ ] **Step 4: Write `packages/mcp-server/README.md`**

Answer the spec's packaging open question by taking the **repo-local script** option for v1, and say why in one paragraph: this is a private workspace package (`"private": true` like every other), publishing to npm is a decision nobody has taken, and an MCP client config can point at a built path today. Include a copy-pasteable client config:

```json
{
  "mcpServers": {
    "gisik-nokma": {
      "command": "node",
      "args": ["/absolute/path/to/gisik-nokma/packages/mcp-server/dist/main.js"],
      "env": { "GISIK_SERVER_URL": "http://localhost:3000" }
    }
  }
}
```

State plainly what the assistant can then do (create, move, comment on and assign tickets **as you**) and that revoking access is `DELETE FROM mcp_tokens WHERE user_id = …` until a revoke surface exists (Open question 5).

- [ ] **Step 5: Add it to the runbook**

`docs/runbook.md` gains a short "MCP server" section: build, configure, authorize, and revoke. `pnpm check:runbook` will now resolve any `pnpm --filter @gisik-nokma/mcp-server run <script>` the section names — Task 1 Step 7 added the package to that gate's directory list, which is why this can land at all.

Run: `pnpm check:runbook 2>&1 | tail -10`
Expected: ok.

- [ ] **Step 6: Drive it end to end against the compose stack**

Run: `docker compose -f docker-compose.dev.yml up -d --build --wait`
Run: `pnpm turbo run build --filter @gisik-nokma/mcp-server 2>&1 | tail -5`
Then launch the built `dist/main.js` from a real MCP client, complete the device flow in the browser, and call one read tool and one write tool.

**Record the actual transcript in the ledger row** — tool name, arguments, and the server's answer. "It worked" is not evidence; a refusal reproduced verbatim is.

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server docs/runbook.md
git commit -m "The stdio entrypoint, the nine-tool registration, and how a person installs and revokes it"
```

---

### Task 11: The catalogue, the baselines, and the gate that cannot see this plan

**Files:**
- Modify: `Features.md` (new §14, appended at EOF)
- Create: `test-cases/14-mcp-server.md`
- Modify: `scripts/fixtures/check-case-citations-baseline.json`
- Modify: `scripts/check-task-ledger.mjs`
- Modify: `docs/lanes/task-ledger.tsv`

**Interfaces:**
- Consumes: every task above — this one records what they actually did, never what they were supposed to do.
- Produces: §14 and its test-case bucket; a task-ledger gate that can see this plan.

- [ ] **Step 1: Write `Features.md` §14**

Appended at the end of the file (§13 is the last heading; the file's headings are not in numeric order and that is fine). Follow the exact bullet shape: `- <marker> **Bold title** — prose. \`path\``, marker from the legend at `Features.md:3` (`✅` user-observable · `⚙️` internal subsystem · `?` inferred/unverified — and **never leave a `?` you introduced**; the file currently has zero).

```markdown
## 14. MCP server

- ✅ **An assistant can operate gisik-nokma as you** — nine MCP tools over stdio: five reads (workspaces, projects, search, list, ticket detail) and four writes (create, transition, comment, assign). Every write is a domain event through `POST /v1/events`, judged by the same permission gate, rule engine and visibility rules as the web client. `packages/mcp-server/src/tools/`
- ✅ **Device-authorization sign-in** — the CLI mints a code, you approve it in the browser you are already signed into, and the CLI receives a personal access token. No token pasting, no reused cookie. `packages/mcp-server/src/device-login.ts`, `apps/server/src/routes/mcp-device.ts`
- ✅ **The approval screen names what it grants** — the one place a person consents to an assistant acting with their permissions. `apps/web/app/mcp/authorize/`
- ⚙️ **Personal access tokens are a sibling credential, not a session** — opaque, `sha256`-hashed at rest, outside the ledger and outside every projection, resolved only after better-auth has answered `null`. `apps/server/src/mcp/token-store.ts`, `apps/server/src/auth/require-session.ts`
- ⚙️ **The approval route is inside the CSRF-protected set** — a cookie-authenticated POST that mints a credential, in the same category as invite issuance. `apps/server/src/http/http-origin.ts`
- ⚙️ **Refusals travel verbatim** — a rule-engine refusal reaches the assistant with its rule name and its own sentence; nothing in this package rewords one. `packages/mcp-server/src/tools/write-tools.ts`
- ⚙️ **A write is never retried on a transport failure** — an assistant retrying against an unreachable server risks a double-submit when connectivity returns mid-retry. `packages/mcp-server/src/http-client.ts`
```

Edit each bullet to describe what actually landed. A bullet describing a task's *intention* is worse than no bullet.

- [ ] **Step 2: Write `test-cases/14-mcp-server.md`**

Header exactly in the house shape (compare `test-cases/13-deployment-dogfooding.md:1-3`):

```markdown
# 14. MCP server — test cases

Mirrors `Features.md` §14. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

Numbering: this bucket opens at `14.1`. **Never renumber.** A deleted case leaves its number unused and new cases continue past it. Blocks used so far: config `14.1–14.9` · credential store `14.10–14.19` · routes `14.20–14.29` · session resolution `14.30–14.39` · client cache and HTTP `14.40–14.49` · device login and session `14.50–14.59` · read tools `14.60–14.69` · write tools `14.70–14.79` · entrypoint and catalogue `14.80–14.89`. **Next free block: `14.90`.**
```

Then one line per case, in the file's dominant id-first style (`- 14.1 ✅ **short title** — what it proves.`). Every id this plan's tests cite must appear, and its marker must match reality at commit time.

- [ ] **Step 3: Add the citation baseline entry — the gate FAILS without it**

`scripts/check-case-citations.mjs` fails naming any `test-cases/NN-*.md` with no committed baseline entry, and fails on `actual < baseline` as well: an exact match is the whole property of a ratchet. Add to `scripts/fixtures/check-case-citations-baseline.json`:

```json
  "14-mcp-server.md": 0
```

`0` means every `✅` case in the bucket is cited by a live test. That is achievable here and nowhere else in this repo, because these tests were written with their citations in the docblocks from the first commit — do not set a non-zero ceiling to make a red go away.

Run: `pnpm check:citations 2>&1 | tail -20`
Expected: ok, and the new file named in the report.

Run: `node scripts/check-case-ids.mjs 2>&1 | tail -10`
Expected: 0 duplicates, and the new bucket's ids counted. **Confirm the count went up** — a reader that silently stops matching this file's style would report clean.

- [ ] **Step 4: Make the task-ledger gate able to see this plan**

`scripts/check-task-ledger.mjs:145` matches `/^2026-08-20-(\d\d)-.*\.md$/`. This plan's file does not match, so its eleven tasks get no ledger rows and no `done`-against-`origin/main` validation — the gate passes while tracking nothing, which is the exact failure the script's own header calls out ("a tracker whose denominator can quietly become 0 reports 0/0 = clean forever").

Change the discovery to recognise both the retired series and dated plans, keying the retired ones on their series number and dated ones on their slug:

```js
for (const name of readdirSync(PLANS_DIR).sort()) {
  // The retired 11-plan series, keyed by its series number...
  const series = name.match(/^2026-08-20-(\d\d)-.*\.md$/);
  // ...and every plan written after it, keyed by its slug. Without this second
  // form a new plan is INVISIBLE here: no ledger rows are demanded for it, none
  // are validated, and the gate stays green while tracking nothing. That is the
  // 0/0 failure this script's header names, arriving through the door of a
  // filename convention rather than a broken reader.
  const dated = name.match(/^\d{4}-\d{2}-\d{2}-(?!\d\d-)(.+)\.md$/);
  const plan = series?.[1] ?? dated?.[1];
  if (plan === undefined) continue;
  perPlan.set(plan, perPlan.get(plan) ?? 0);
  // ...unchanged from here...
}
```

Add `'mcp-server'` to `PLANS_WITH_TASKS` so an empty read of this plan fails loudly rather than reporting no backlog.

Then add eleven rows to `docs/lanes/task-ledger.tsv`, keyed `mcp-server/1` … `mcp-server/11`, each naming its merge commit once it lands.

**A slug key is safe here, and that was checked rather than assumed.** The ledger parser is `const [plan, task, status, pr, sha, ...rest] = line.split('\t')` with `key = \`${plan}/${task}\`` (`check-task-ledger.mjs:193-197`) — plain tab-split strings, no fixed width and no `\d\d` pattern anywhere on the ledger side. `perPlan`, `CONTROL_PLANS` and `PLAN_WITHOUT_TASKS` are all keyed by the same strings, so `'mcp-server'` sits beside `'11'` without disturbing either. If a future reader adds a width assumption, Step 5's second control is what catches it.

- [ ] **Step 5: Prove BOTH halves of the gate change, with two different planted defects**

One control proves the plan is *discovered*; the other proves its rows are *matched*. A pass on the first alone would leave the eleven rows unvalidated, which is the same 0/0 shape one level down.

**Control A — discovery.** Temporarily rename the plan file to `2026-09-07-mcp-server.md.bak`.

Run: `node scripts/check-task-ledger.mjs 2>&1 | tail -20`
Expected: **FAILS**, naming `mcp-server` as a plan in `PLANS_WITH_TASKS` that yielded 0 tasks. Before this task's change the same rename produced a **clean** run — run it against `origin/main`'s copy of the script once to see that, because the difference between the two outputs is the whole justification for this step.

Restore the name. Re-run: clean, with eleven `mcp-server` tasks counted. **Report the count**, not the exit code.

**Control B — row matching.** Temporarily delete the `mcp-server/7` row from `docs/lanes/task-ledger.tsv`.

Run: `node scripts/check-task-ledger.mjs 2>&1 | tail -20`
Expected: **FAILS** under `PLAN TASKS WITH NO LEDGER ROW`, naming `mcp-server/7` specifically — not a count, the id. Then change that row's plan field to `mcp-server-typo` and re-run: it must fail under `LEDGER ROWS NAMING A TASK NO PLAN CONTAINS` **and** `PLAN TASKS WITH NO LEDGER ROW` at once, which is how you know both directions traverse the new key space.

Restore the row. Re-run: clean.

- [ ] **Step 6: Run the whole gate**

Run: `pnpm turbo run build test typecheck --force > /tmp/mcp-gate.log 2>&1; tail -40 /tmp/mcp-gate.log`
Expected: every package green. **Redirect, then read** — never pipe into `head`.

Run: `pnpm check:env && pnpm check:citations && pnpm check:runbook && pnpm check:tasks 2>&1 | tail -20`
Expected: all four ok.

Then, per the repo's gate-environment rule, **name the Node version in the ledger row**: `node --version`. A gate result that does not name its Node is not evidence.

- [ ] **Step 7: Commit**

```bash
git add Features.md test-cases/14-mcp-server.md scripts/fixtures/check-case-citations-baseline.json scripts/check-task-ledger.mjs docs/lanes/task-ledger.tsv
git commit -m "Features.md §14, the MCP test-case bucket, and a task-ledger gate that can see a plan not named after the retired series"
```

---

## Owner rulings (2026-09-07) — all seven answered

**Five confirmed the plan's written default and change nothing. Two are real changes**, and both are
reflected in the tasks below rather than only recorded here.

| # | Question | Ruling | Effect |
|---|---|---|---|
| 1 | envelope-origin for MCP | **`'mcp'`**, a distinct value — not `'web'` | **CHANGE.** New **Task 0**; Task 9 sends `'mcp'` |
| 2 | approval page in `apps/web` | **yes** | Confirms default. Task 5 unchanged |
| 3 | `list_projects` as a client-side filter | **keep it** | Confirms default. Task 8 unchanged |
| 4 | token expiry | **no expiry** | Confirms default. Task 2 unchanged |
| 5 | revoke surface | **"a simple UI for it"** | **CHANGE.** New **Task 12**; the plan had defaulted to SQL-only |
| 6 | filename | **dated name** | Confirms default. Task 11 unchanged |
| 7 | "nine write tools" | **four writes, five reads** | Confirms the plan's reading |

### Ruling 1, verified against the tree — and the plan OVERSTATED the work

This plan's own text called adding `'mcp'` *"a `packages/domain` envelope change with migration and
test fallout across the ingest gate, the contest rules and the sync clients — genuinely more than this
plan's scope."* **Measured at `8190507`, that is wrong in the expensive direction, and a scary estimate
left standing is how a one-line change gets deferred for weeks:**

- **`ORIGINS` is referenced in exactly ONE source file** — `packages/domain/src/envelope.ts:26`, with
  `Origin` derived at `:27` and `z.enum(ORIGINS)` at `:182`. Adding a member is one line.
- **No migration is needed.** The column is `origin text NOT NULL`
  (`migrations/1787841717635_events-and-snapshots.sql:12`) — no `CHECK`, no Postgres enum. Nothing in
  any migration constrains the value.
- **No consumer switches on it exhaustively.** A sweep of every `.ts`/`.tsx` in `apps/` and `packages/`
  found no `switch` on an origin and no `Record<Origin, …>`, so no code needs a new branch. Adding a
  member to a union is not the same as changing one: every existing producer keeps compiling.

**But the sweep found two sites the plan does not name, and one of them is a real defect:**

1. **`packages/rule-engine/src/fixtures/harness.ts:53` re-spells the list**:
   `z.enum(['web', 'mobile', 'desktop', 'server'])`. It is a **second authority for what an origin is**,
   and it will not learn about `'mcp'`. This is exactly the drift
   `check-permission.test.ts:33-36` warns about in prose — *"a second list of what the origins are
   would drift from `ORIGINS` silently"* — sitting one package over from the file that says it. Task 0
   fixes it by importing `ORIGINS`, not by adding a fifth string.
2. **`apps/server/test/permissions/check-permission.test.ts:38`** derives
   `CLIENT_ORIGINS = ORIGINS.filter((o) => o !== 'server')` and runs `it.each(CLIENT_ORIGINS)`. Its own
   comment says *"a fifth origin member is covered the day it is added instead of the day somebody
   remembers this file."* So adding `'mcp'` **creates a new permission-gate case automatically** — the
   gate must admit an `mcp`-origin client submission, and if it does not, that test goes red without
   anyone writing it. That is a feature, and it is why Task 0 comes before Task 9.

---


### Task 12: The revoke surface

**Owner ruling 5, and the one that is NOT the plan's default.** The plan defaulted to no UI —
revocation as a hand-written `DELETE` — and explicitly flagged the asymmetry as *"something a person
should agree to knowingly"*: granted in two clicks, withdrawn only with database access. The owner
ruled for **"a simple UI for it."**

**Why this is a page of design and not a fresh planning pass.** The surface exists
(`apps/web/app/w/[workspaceId]/settings/` already has three screens, so this is a fourth, not a new
area); the data model is settled by Task 2 (`mcp_tokens`, hashed at rest, no expiry per ruling 4); and
the load-bearing architectural question — whether `apps/web` is in scope at all — was ruling 2, answered
yes, with Task 5's approval page already establishing the pattern.

- [ ] **Step 1 — the list.** A settings screen listing this user's own MCP tokens. **It cannot show the
      token**: Task 2 stores `sha256(token)` and the raw value exists only in the response that minted
      it. So each row shows what is honestly available — a label, and when it was approved. A row that
      implied it could show the credential would be a lie about the storage.
- [ ] **Step 2 — the revoke.** `DELETE /v1/me/mcp-tokens/:id`, scoped to
      `request.currentUserId` the way every `/v1/me/*` route is, so a caller cannot revoke somebody
      else's. **Answer the same 404 for "not yours" and "does not exist"**, matching
      `routes/notifications.ts` — otherwise this route becomes an oracle for which token ids exist.
      Cookie-authenticated and mutating, so it joins `HTTP_ORIGIN_PROTECTED_ROUTES` (`http-origin.ts:151`)
      with a planted-defect test, exactly as Task 3's approval POST does.
- [ ] **Step 3 — say what revoking does.** Deleting the row ends access at the next request, because
      `resolveMcpToken` finds nothing. The screen should say that plainly rather than implying a
      session is being killed mid-flight.
- [ ] **Step 4 — the catalogue.** §14 cases for the list, the revoke, the cross-user refusal and the
      HTTP-Origin protection.

> #### ⚠ ONE SUB-QUESTION FOR THE OWNER, not for the executor
>
> **Should the list show when each token was LAST USED?**
>
> It is the single most useful column for deciding whether to revoke — *"this one has not been touched
> in three months"* — and it is **not in Task 2's schema today**. Adding it means a `last_used_at`
> column and a write on every authenticated MCP request.
>
> It is flagged rather than decided because it is not merely a column: **it is a log of when a person's
> assistant acted on their behalf**, kept per token. That is a privacy-shaped decision in a product
> whose whole posture is that a record should not quietly know more than it says it does.
>
> **Written against:** no `last_used_at`, list without it — buildable exactly as Task 2 stands.
> **If ruled otherwise:** one column, one `UPDATE` on the token-resolution path, one test, and a
> sentence on the screen saying the product records it.


## Open questions

> **Two unrelated things are called "origin" in this repo, and this plan touches both.** The
> **envelope-origin** is the provenance enum on a domain event (`ORIGINS`, `envelope.ts:26`) — question 1
> is about that. The **HTTP-Origin** is the request header the CSRF control reads
> (`http-origin.ts`) — question 2 and "what already exists" item 3 are about that. They meet nowhere and
> mean nothing to each other. *Someone who conflates them writes a header check and believes the
> forgery window is closed.* Say **envelope-origin** or **HTTP-Origin** in every task, commit and review.

**ALL SEVEN ARE NOW RULED — see the table above.** Kept below because each records the *reasoning*, which the one-line answers do not, and a later reader deciding whether to revisit one needs the argument rather than the verdict. Each names the plain reading the plan is written against, so the plan is executable either way — but a different ruling changes real content, and the affected tasks are named.

1. **Is there an envelope-origin value for MCP, or does an assistant's write claim `'web'`?**
   **RULED: `'mcp'`.** *The question as originally written, preserved because the reasoning is the part a later reader needs — and because my own edit briefly broke it: replacing the literal turned this sentence into "writes send `'mcp'`, which means the ledger cannot distinguish", attaching the consequence of one answer to the other. A find-and-replace through prose changes what sentences MEAN, not just what they say.*

   `ORIGINS = ['web','mobile','desktop','server']` and there was no `'mcp'`. Every write in Task 9 would have sent `origin: 'web'`, which means the ledger cannot distinguish a claim a person typed from a claim their assistant made on their behalf. In a product whose stated purpose is a board that cannot lie about its own history, that is not a small thing. ~~Adding `'mcp'` is a `packages/domain` envelope change with migration and test fallout across the ingest gate, the contest rules and the sync clients — genuinely more than this plan's scope.~~ **This estimate was WRONG and is struck rather than deleted: measured at `8190507`, `ORIGINS` has one source reference, the column has no `CHECK` and no consumer switches on it. See the ruling table. A scary estimate left standing is how a one-line change gets deferred for weeks.** **Written against:** `'web'`. **If ruled otherwise:** Task 9 changes one literal; a new Task 0 adds `'mcp'` to `ORIGINS` and sweeps every consumer.

2. **Does v1 get a web approval page (`apps/web`), or does the device flow terminate somewhere else?**
   The spec's architecture diagram lists changes to `apps/server` only and never mentions `apps/web`. But the flow it describes — "the user opens the URL in their already-authenticated browser session and approves" — has to land on a page, and it cannot be a page served by the API: an approval POST must carry `Origin: <WEB_ORIGIN>` to survive `httpOriginRefused`, and a page on the API origin sends its own origin instead. **Written against:** a minimal page in `apps/web` (Task 5). **If the owner would rather not touch `apps/web` in v1:** the alternative is exempting the approve route from the origin check, which this plan will not propose — it would remove the only CSRF defence from the one route that mints a credential.

3. **Should `list_projects` exist at all, given there is no projects route?**
   The spec's table maps it to an "existing workspace→projects read". There is none: the visible projects arrive inside `GET /v1/me/workspaces`, and Task 8 filters that response client-side. The tool is therefore a convenience over data `list_workspaces` already returned. Keeping it is harmless; dropping it removes a tool that can never be more current than the call it wraps. **Written against:** keep it, implemented as a filter, with the absence of a route stated in its description.

4. **Do personal access tokens expire?**
   Task 2's migration deliberately has no `expires_at` on `mcp_tokens`, and the SQL comment argues the case: the token is minted by the account holder for their own machine from an interactive approval, and revocation (a `DELETE`) takes effect immediately. `invite_tokens` has a TTL because it is handed to somebody who is not yet a user. **Written against:** no expiry. **If ruled otherwise:** one column, one `WHERE` clause in `resolveMcpToken`, and one test.

5. **Is there a revoke surface in v1, or is revocation a SQL statement?**
   Nothing in the spec's scope covers it, and the non-goals rule out "admin/workspace-settings tools". So today revoking an assistant's access means `DELETE FROM mcp_tokens WHERE user_id = …` by hand — which is a real gap for the one control a person most wants over a credential they granted. **Written against:** documented as SQL in the README (Task 10), no UI. **Worth ruling on explicitly**, because "you can grant it in two clicks and revoke it only with database access" is an asymmetry a person should agree to knowingly.

6. **Filename: `2026-09-07-mcp-server.md`, or a series number?**
   See the header of this file. The plan is written for the dated name and Task 11 extends the ledger gate to recognise it — which is worth doing regardless, since it is the fix that makes any *future* plan visible to that gate too. If the owner would rather this take `2026-08-20-12-mcp-server.md` and join the series numbering, Task 11 Step 4 shrinks to adding `'12'` to `PLANS_WITH_TASKS`, and the coordination doc needs a row.

7. **Does the spec's "nine write tools" phrase hide a scope disagreement?**
   The spec's Data flow section says "one path for all nine write tools", but its own table has four writes and five reads. Read as a typo — nine *tools*, four writes — which is how this plan is written. Flagged only so nobody executes against the larger reading.

## Self-review (performed by the plan author)

**1. Spec coverage.** Walked each section of `2026-09-07-mcp-server-design.md`:

| Spec section | Task |
|---|---|
| Purpose / single-user local-first | 1, 10 |
| Architecture — pure network client, no DB, no duplicated logic | 1, 6, 8, 9 (no task gives `packages/mcp-server` a pool or an `apps/server` import) |
| Auth — device flow, five numbered steps | 2, 3, 5, 7 |
| New server-side surface — two routes, new token type, `require-session` | 2, 3, 4 (**three** routes, not two — the approval door the spec's step 2 implies but does not list) |
| Scope — the nine tools | 8 (five reads), 9 (four writes) |
| Data flow — reads passthrough, writes via `POST /v1/events` | 8, 9 |
| Error handling — refusals verbatim, 401 re-auth + one retry, no transport retry | 6 (14.46), 7 (14.55–14.57), 9 (14.76–14.77) |
| Testing — package suite with mocked HTTP, device-flow integration test, route tests | 6–9 (mocked), 3 (real routes, real issuance, polling driven directly), 3–4 (route tests in `apps/server/test/`) |
| "a decision for `writing-plans`" on catalogue rows | Task 11 — **decided yes**, §14 and `test-cases/14-mcp-server.md`, per the workspace convention that every repo keeps both in sync in the same change set |
| Open question — TTL and polling interval | Task 3 Step 1, **derived** from `RATE_LIMIT_AUTH_MAX` rather than picked: 600s / 12s |
| Open question — CLI packaging | Task 10 Step 4, **decided** repo-local script for v1, reason stated |

No spec requirement is without a task.

**2. Placeholder scan.** Zero. An earlier draft of Task 3 carried an `expect(true).toBe(true)` for case 14.27b, deferred to a later step because the test helper it needed did not exist yet — flagged, fenced, and still exactly the "check that cannot fail" shape this repo has been burned by, since a fence is a note and notes get skipped. It was removed by **reordering**: the `buildTestApp` security-options widening is now Task 3 Step 2, before any test is written, so 14.27 and 14.27b are both real from their first commit. Nothing else in the task depended on the old order. Three steps deliberately say *verify before writing* rather than asserting a fact I could not check from here — Task 10 Step 1 (the SDK's registration API), Task 9 Step 4 (`newSubmittedEvent`'s parameter names), Task 5 Step 1 (the web client's fetch helper). Those are instructions to consult a source, not placeholders standing in for content.

**3. Type consistency.** Traced the names across tasks: `hashCredential`, `mintDeviceCode`, `approveDeviceCode`, `exchangeDeviceCode`, `resolveMcpToken` (Task 2 → 3, 4). `ExchangeOutcome`'s four statuses match Task 3's four HTTP answers. `CachedToken = {token, userId}` (Task 6 → 7). `Session` = `{userId(), get(), postEvents()}` (Task 7 → 8, 9, 10). `ToolDefinition` defined once in Task 8 and imported by Task 9 rather than restated. `POLL_INTERVAL_SEC` (server) and `DEFAULT_POLL_INTERVAL_MS` (client) are deliberately two constants with one value, and Task 3's case 14.20 pins them equal.

**3b. Two claims corrected after review, both by grep rather than by re-reading the draft.**
- Task 4 originally said `makeRequireSession` had **exactly one** call site. It has **three** — `app.ts:632`, `routes/attachments.ts:283` (which builds its own, because it registers multipart on an encapsulated instance), and `test/auth/require-session.test.ts:42`. A breaking signature change against a miscounted call-site list is a compile failure at best and a route silently left on the old preHandler at worst.
- Task 11's slug-keyed ledger rows were checked against the parser rather than assumed safe: `check-task-ledger.mjs:193-197` tab-splits and keys on plain strings, with no width or `\d\d` assumption on the ledger side, so `mcp-server/7` round-trips beside `11/16`. Control B in Step 5 is what keeps that true if a later reader adds an assumption.

**4. Things I checked because the spec asserted them and the tree disagreed.** `require-session.ts` already resolves bearer credentials (better-auth's `bearer()` plugin, `auth.ts:236`) — so the spec's "gains a second recognized credential shape" is half-shipped, and Task 4 is a *fallback ordering* problem rather than a new branch. `comment.added`, not `ticket.commented`. The transition payload key is `to`, not `toStateId`. `comment.added`'s `body` is a document object, not a string. There is no projects route and no `GET /v1/me`. `search` has a hard 50-row cut with no cursor. Each correction is carried into the task that would otherwise have shipped the spec's version.

**5. What this plan does NOT prove, said plainly.** Task 4 Step 5 establishes that the credential-resolution *order* is not observable from any test that can be constructed, and holds it by docblock and review instead. Task 9's `parseEvent` check is the strongest offline validation available, but only a live server proves the permission gate accepts these envelopes — which is why Task 10 Step 6 requires a real transcript rather than a claim.
