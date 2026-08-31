# Auth, Workspaces & Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the server its identity, membership, permission, and visibility layer: who a user is, what role they hold, which claims they may make, which tickets they may see — with every restriction enforced server-side and every visible thing still telling the truth.

**Architecture:** Identity (users, sessions) is server-owned infrastructure managed by better-auth — deliberately NOT events, because auth state is not workspace history. Membership and visibility ARE workspace history: `workspace.created`, `project.created`, `membership.granted/revoked`, `project.member_added/removed`, and `visibility.set` are ordinary ledger events, projected into `proj_memberships` (effective roles) and `proj_visibility` (each ticket's resolved audience). Permission checks run as pre-engine refusals in the ingest pipeline using the standard Refusal shape; read enforcement runs through one decision function, `canSee`, which also backs the sync-down filter `visibleEventsFor` that Plan 10 consumes.

**Tech Stack:** Node 22 LTS, TypeScript strict, Fastify 5, Postgres 16 via `pg`, node-pg-migrate, better-auth (auth library — see decision paragraph below), Vitest, `ulidx`.

**Spec:** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` — this plan implements section 6 (permissions, visibility, auth) plus the three visibility-honesty guarantees (true counts with restriction named; restricted-parent placeholder; provenance never redacted from those entitled to see).

**Series position:** Plan 4 of 11. **Consumes** from Plan 1: `EventEnvelope`, the event-type registry and pure `parseEvent` in `packages/domain`; the Fastify 5 server and ingest pipeline calling `evaluateEvent(env, ctx)` in `apps/server`; the projection registry `registerProjection({name, apply, reset})` with `proj_`-prefixed tables; node-pg-migrate; the verify-projections CLI. From Plan 2: the rule engine and the `Refusal` shape it returns, `workflow.defined` v1 and `WorkflowDef`. From Plan 3: ticket events (`ticket.created`, `ticket.reparented`, …), `ticket-type.defined` and `builtinTicketTypeDefs(defaultWorkflowId)`, `proj_tickets` (head states incl. parentId), `proj_rollups` (direct-children counts by category), `TicketState`. **Produces** (consumed by later plans, exact signatures in the task Interfaces blocks): `proj_memberships`, `proj_visibility`, `canSee(db, userId, ticketId)`, `visibleEventsFor(db, userId, workspaceId, afterSeq)` (where `afterSeq` is Plan 1's per-workspace `workspace_seq` cursor, coordination §18), the auth surface (`/api/auth/*` routes, `makeRequireSession`, `OtpSender`) for all client plans, and — new, per the owner decision of 2026-08-26 — the **workspace-creation surface**: `bootstrapWorkspace(db, foundingEvent, append)` (Task 5) and `registerWorkspaceRoutes(app, deps)` serving `POST /v1/workspaces` (Task 13). It also **creates** the canonical simple-Kanban definition in `@gisik-nokma/domain` (`SIMPLE_KANBAN_TEMPLATE`, `simpleKanbanWorkflowDef(workflowId)`, Task 5) — Plan 8's template gallery and Plan 11's seeds consume that one export rather than declaring copies.

## Global Constraints

Copied verbatim from the series engineering contract and the spec; every task's requirements implicitly include this section.

- MONOREPO: pnpm workspaces + Turborepo, TypeScript strict, Node 22 LTS, pnpm 9.
- TESTING: Vitest.
- IDS: ULID via `ulidx`.
- EVENT ENVELOPE (exact): entity.kind ∈ 'workspace'|'project'|'ticket'|'workflow'|'ticket-type'|'membership'|'invite'; fields id, workspaceId, entity, type, version, payload, actorId, origin('web'|'mobile'|'desktop'|'server'), clientTime, serverTime, seq. ('invite' joined the set in Task 3 rather than Task 14, so the file every lane imports is amended once, early — see the coordination doc's envelope-collision section. A membership's entity.id is the composite `${workspaceId}:${userId}`; every other kind's is a bare ULID.)
- Refusal shape (exact): `{refused: true; rule: string; reason: string}` — plain-language reason.
- Every refusal is proven against planted defects before it is trusted (spec §1 invariant 6).
- Provenance is never redacted from someone who can see the ticket (spec §6).
- Rollups show true counts with restriction named: "5 of 8 done · 2 restricted" (spec §6).
- A visible child under a restricted parent shows a placeholder — existence, no title (spec §6).
- No passwords. Sign-in: phone OTP, email magic link, Google OAuth, passkeys (spec §6).
- `reference/` is frozen — never edit anything under it.
- Commits are prose that says what was found and why it matters (spec, constraints carried from the base).
- CODING_STANDARDS: `snake_case` for database tables and columns (exception: better-auth's own generated tables keep the library's naming — vendor schema, managed by its migrator; renaming them breaks the library). Log detailed errors internally; return generic, safe errors to clients — an invisible ticket reads as 404 `not_found`, indistinguishable from nonexistent.
- Features.md and test-cases/ move in the same change set as the work.

## Auth library decision (owner review — see Open questions)

**better-auth** is the pinned choice. It is the one vetted, actively maintained TypeScript-first auth framework that covers all four required methods as first-party plugins — `phoneNumber` (OTP with a `sendOTP` callback we point at our `OtpSender` interface), `magicLink`, Google via built-in `socialProviders`, and `passkey` (WebAuthn) — plus the `bearer` plugin for token sessions on mobile/desktop alongside default httpOnly-cookie sessions for web. It has a documented Fastify integration (catch-all route over its Web-standard `auth.handler`), speaks Postgres directly through a `pg` Pool, and generates its own schema, so we never hand-roll credential storage, session rotation, or WebAuthn ceremony code. The alternatives fail concretely: Lucia is discontinued as a library; Auth.js is Next.js-centric with no phone OTP story; Passport is middleware-per-strategy with no session/schema management and no passkey or OTP orchestration; SuperTokens/Keycloak are separate services, disproportionate for a single Node server. Pin the latest 1.x at execution time and record the exact version in the lockfile. Sources: better-auth Fastify integration docs (better-auth.com/docs/integrations/fastify), better-auth plugin docs (phone-number, magic-link, passkey, bearer).

## Cross-plan path assumptions

Plans 1–3 are being written in parallel; their internal file names are not contractual. Where this plan touches them it assumes the canonical layout below. **If the executed Plan 1–3 code placed something elsewhere or named an internal differently, keep this plan's semantic content and adapt the name/path at the call site** — the contract-fixed names (`EventEnvelope`, `evaluateEvent`, `registerProjection`, `parseEvent`, table names `proj_tickets`/`proj_rollups`, the Refusal shape) are NOT adaptable.

- Workspace package names: `@gisik-nokma/domain` (packages/domain), server package in `apps/server`.
- Event-type registry: `packages/domain/src/events/registry.ts` exporting `registerEventType({type, version, entityKind, parsePayload})`; payload parsers throw `Error` on invalid input (adapt to Plan 1's error style if it used a Result type).
- Ledger table: `events` with columns `id, workspace_id, entity_kind, entity_id, type, version, payload (jsonb), actor_id, origin, client_time, server_time, seq`. **Both clocks are `timestamptz`** — absolute instants (owner decision 2026-08-20, "time is Asia/Kolkata"); the driver yields `Date`, and every reader in this plan converts with `.toISOString()`, never `String(...)` and never a SQL cast. `visibleEventsFor`'s ordering is by `workspace_seq` and is unaffected by any of this — the stream cursor is an integer, not a clock.
- Ingest pipeline: `apps/server/src/ingest/pipeline.ts`, exposing the point where `parseEvent` has succeeded and `evaluateEvent(env, ctx)` is about to run.
- `proj_tickets` columns used here: `ticket_id, workspace_id, project_id, parent_id, title, created_by`. `proj_rollups` columns used here: `ticket_id, open_count, active_count, terminal_count`.
- Fastify app assembly: `apps/server/src/app.ts` exporting a builder where routes are registered.
- `clientTime`/`serverTime` are ISO-8601 strings; `seq` is a JS number (Postgres bigint read via `Number(...)`).
- Test DB: `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/gisik_nokma_test`); if Plan 1 shipped an equivalent test-db helper, extend it rather than duplicating.

## File structure

```
apps/server/
  migrations/<ts>_auth-tables.cjs            # better-auth vendor schema (Task 1)
  migrations/<ts>_proj-memberships.cjs       # Task 4
  migrations/<ts>_proj-visibility.cjs        # Task 6
  migrations/<ts>_proj-projects.cjs          # Task 9 Step 3b
  src/projections/proj-projects.ts           # projProjects + projectExists (Task 9 Step 3b);
                                             #   registered BEFORE proj_tickets, coordination §8
  src/db/queryable.ts                        # Queryable = Pool | PoolClient (Task 1)
  src/auth/otp-sender.ts                     # OtpSender + LogOtpSender (Task 1)
  src/auth/magic-link-sender.ts              # MagicLinkSender + LogMagicLinkSender (Task 1)
  src/auth/auth.ts                           # createAuth() better-auth instance factory (Task 1)
  src/auth/routes.ts                         # /api/auth/* catch-all on Fastify (Task 2)
  src/auth/require-session.ts                # makeRequireSession preHandler (Task 2)
  src/projections/proj-memberships.ts        # Task 4
  src/projections/proj-visibility.ts         # Task 6
  src/permissions/effective-role.ts          # resolveEffectiveRole, hasProjectAdminRights (Task 4)
  src/permissions/check-permission.ts        # pre-engine gate: role (Task 5) + visibility (Task 9)
  src/visibility/can-see.ts                  # canSeeResolved (pure) + canSee (Task 7)
  src/visibility/visible-tickets.ts          # listVisibleTickets (Task 7)
  src/visibility/rollup.ts                   # rollupFor with restrictedCount (Task 10)
  src/visibility/visible-events-for.ts       # sync-down filter + purge tombstones (Task 11)
  src/workspaces/bootstrap-workspace.ts      # the founding sequence: workflow → types → owner grant (Task 5)
  src/routes/tickets.ts                      # read endpoints (Task 8, extended Task 10)
  src/routes/workspaces.ts                   # POST /v1/workspaces — the founding route (Task 13)
  test/helpers/db.ts                         # pool, migrate, truncate (Task 1)
  test/helpers/envelope.ts                   # testEnvelope factory (Task 4)
  test/helpers/seed.ts                       # scenario builders (Task 7)
  test/…                                     # one test file per source file, per task
packages/domain/
  src/events/membership.ts                   # payload types + parsers (Task 3)
  src/events/visibility.ts                   # visibility.set payload + parser (Task 3)
  src/workflows/simple-kanban.ts             # SIMPLE_KANBAN_TEMPLATE + simpleKanbanWorkflowDef (Task 5)
  test/events/membership.test.ts             # Task 3
  test/events/visibility.test.ts             # Task 3
  test/workflows/simple-kanban.test.ts       # Task 5
```

**The identity boundary, stated once and honored everywhere:** the `user`/`session`/`account`/`verification`/`passkey` tables are server-owned infrastructure — who can open the door. They are not events and never enter the ledger, because auth state is not workspace history: a password-less credential rotation is nobody's claim about the work. *Membership* — who is inside which workspace with which role — IS history, so it lives in the ledger as attributed events like everything else. Task 1 builds the first; Tasks 3–4 build the second; nothing blurs them.

---

### Task 1: Identity foundation — better-auth, sender interfaces, vendor schema

**Files:**
- Create: `apps/server/src/db/queryable.ts`
- Create: `apps/server/src/auth/otp-sender.ts`
- Create: `apps/server/src/auth/magic-link-sender.ts`
- Create: `apps/server/src/auth/auth.ts`
- Create: `apps/server/src/auth/auth-dev.ts`
- Create: `apps/server/migrations/<ts>_auth-tables.cjs` (node-pg-migrate generates the timestamp prefix)
- Create: `apps/server/test/helpers/db.ts`
- Test: `apps/server/test/auth/otp-sender.test.ts`

**Interfaces:**
- Consumes: Plan 1's `apps/server` package (Fastify 5, `pg`, node-pg-migrate already configured).
- Produces: `OtpSender { send(phoneE164: string, code: string): Promise<void> }` and `LogOtpSender` (captures into `.sent`, logs); `MagicLinkSender { send(email: string, url: string): Promise<void> }` and `LogMagicLinkSender`; `createAuth(deps: AuthDeps)` returning the better-auth instance (`type Auth = ReturnType<typeof createAuth>`); `type Queryable = Pool | PoolClient`; test helpers `testPool()`, `migrateTestDb()`, `truncateAll(pool)`.

- [ ] **Step 1: Install dependencies**

Run (from `apps/server/`):
```bash
pnpm add better-auth
pnpm add -D @better-auth/cli
```
Expected: lockfile updated; note the exact better-auth version — it goes into the PR description for the Open-questions review.

- [ ] **Step 2: Write the Queryable type**

```ts
// apps/server/src/db/queryable.ts
import type { Pool, PoolClient } from 'pg';

/**
 * Anything the projections and visibility code can query. Passing the
 * handle explicitly (DIP) keeps every function testable against a plain
 * Pool and usable inside a transaction via PoolClient.
 */
export type Queryable = Pool | PoolClient;
```

- [ ] **Step 3: Write the failing test for the OTP sender**

```ts
// apps/server/test/auth/otp-sender.test.ts
import { describe, expect, it } from 'vitest';
import { LogOtpSender } from '../../src/auth/otp-sender';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender';

describe('LogOtpSender', () => {
  it('captures the code and logs it instead of sending SMS', async () => {
    const lines: string[] = [];
    const sender = new LogOtpSender((msg) => lines.push(msg));
    await sender.send('+919000000001', '482913');
    expect(sender.sent).toEqual([{ phoneE164: '+919000000001', code: '482913' }]);
    expect(lines[0]).toContain('+919000000001');
    expect(lines[0]).toContain('482913');
  });
});

describe('LogMagicLinkSender', () => {
  it('captures the link and logs it instead of sending email', async () => {
    const lines: string[] = [];
    const sender = new LogMagicLinkSender((msg) => lines.push(msg));
    await sender.send('kiro@example.com', 'http://localhost:3000/api/auth/magic-link/verify?token=abc');
    expect(sender.sent).toEqual([
      { email: 'kiro@example.com', url: 'http://localhost:3000/api/auth/magic-link/verify?token=abc' },
    ]);
    expect(lines[0]).toContain('kiro@example.com');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run (from `apps/server/`): `pnpm vitest run test/auth/otp-sender.test.ts`
Expected: FAIL — cannot resolve `../../src/auth/otp-sender`.

- [ ] **Step 5: Implement the sender interfaces**

```ts
// apps/server/src/auth/otp-sender.ts

/** Delivery of one-time codes, abstracted so the transport is swappable. */
export interface OtpSender {
  send(phoneE164: string, code: string): Promise<void>;
}

/**
 * Development implementation: logs the code and records it for tests.
 * Production delivery runs through a DLT-registered SMS provider behind
 * this same interface — a deployment concern, deliberately NOT
 * implemented in this plan (spec §6 names the errand).
 */
export class LogOtpSender implements OtpSender {
  public readonly sent: Array<{ phoneE164: string; code: string }> = [];

  constructor(private readonly log: (message: string) => void = console.info) {}

  async send(phoneE164: string, code: string): Promise<void> {
    this.sent.push({ phoneE164, code });
    this.log(`[dev-otp] OTP for ${phoneE164}: ${code}`);
  }
}
```

```ts
// apps/server/src/auth/magic-link-sender.ts

/** Delivery of sign-in links, abstracted so the transport is swappable. */
export interface MagicLinkSender {
  send(email: string, url: string): Promise<void>;
}

/**
 * Development implementation: logs the link and records it for tests.
 * The production email provider is a deployment concern, deliberately
 * NOT implemented in this plan.
 */
export class LogMagicLinkSender implements MagicLinkSender {
  public readonly sent: Array<{ email: string; url: string }> = [];

  constructor(private readonly log: (message: string) => void = console.info) {}

  async send(email: string, url: string): Promise<void> {
    this.sent.push({ email, url });
    this.log(`[dev-magic-link] link for ${email}: ${url}`);
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run (from `apps/server/`): `pnpm vitest run test/auth/otp-sender.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Write the better-auth instance factory**

```ts
// apps/server/src/auth/auth.ts
import { betterAuth } from 'better-auth';
import { bearer, magicLink, phoneNumber } from 'better-auth/plugins';
import { passkey } from 'better-auth/plugins/passkey';
import type { Pool } from 'pg';
import type { MagicLinkSender } from './magic-link-sender';
import type { OtpSender } from './otp-sender';

export interface AuthDeps {
  pool: Pool;
  otpSender: OtpSender;
  magicLinkSender: MagicLinkSender;
  baseUrl: string; // e.g. http://localhost:3000
  secret: string; // BETTER_AUTH_SECRET
}

export function createAuth(deps: AuthDeps) {
  return betterAuth({
    database: deps.pool,
    baseURL: deps.baseUrl,
    secret: deps.secret,
    emailAndPassword: { enabled: false }, // the spec forbids passwords
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      },
    },
    plugins: [
      phoneNumber({
        sendOTP: async ({ phoneNumber: phone, code }) => {
          await deps.otpSender.send(phone, code);
        },
        signUpOnVerification: {
          getTempEmail: (phone) => `${phone.replace(/[^0-9]/g, '')}@phone.gisik-nokma.invalid`,
          getTempName: (phone) => phone,
        },
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await deps.magicLinkSender.send(email, url);
        },
      }),
      passkey({
        rpID: new URL(deps.baseUrl).hostname,
        rpName: 'Gisik Nokma',
      }),
      bearer(), // token sessions for the mobile/desktop apps
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

Note: option names above follow better-auth 1.x. If the pinned version's plugin option names differ (its docs are versioned), keep the wiring — `OtpSender` behind `sendOTP`, `MagicLinkSender` behind `sendMagicLink`, no passwords, Google + passkey + bearer enabled — and adapt the option spelling.

- [ ] **Step 8: Write the dev instance (for the schema CLI and local runs)**

```ts
// apps/server/src/auth/auth-dev.ts
import { Pool } from 'pg';
import { createAuth } from './auth';
import { LogMagicLinkSender } from './magic-link-sender';
import { LogOtpSender } from './otp-sender';

/**
 * Concrete instance for `npx @better-auth/cli generate` and local dev.
 * Never imported by production assembly — that wires real deps.
 */
export const auth = createAuth({
  pool: new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/gisik_nokma_dev',
  }),
  otpSender: new LogOtpSender(),
  magicLinkSender: new LogMagicLinkSender(),
  baseUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-change-me',
});
```

- [ ] **Step 9: Create the vendor-schema migration**

Run (from `apps/server/`): `pnpm exec node-pg-migrate create auth-tables`
Then replace the generated file's content:

```js
// apps/server/migrations/<ts>_auth-tables.cjs
/**
 * better-auth vendor schema. These tables are library-owned identity
 * infrastructure — NOT events, NOT projections. Column names keep the
 * library's camelCase (vendor exception to the snake_case standard).
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE "user" (
      "id" text PRIMARY KEY,
      "name" text NOT NULL,
      "email" text UNIQUE,
      "emailVerified" boolean NOT NULL DEFAULT false,
      "image" text,
      "phoneNumber" text UNIQUE,
      "phoneNumberVerified" boolean,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE "session" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "token" text NOT NULL UNIQUE,
      "expiresAt" timestamptz NOT NULL,
      "ipAddress" text,
      "userAgent" text,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE "account" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "accountId" text NOT NULL,
      "providerId" text NOT NULL,
      "accessToken" text,
      "refreshToken" text,
      "idToken" text,
      "accessTokenExpiresAt" timestamptz,
      "refreshTokenExpiresAt" timestamptz,
      "scope" text,
      "password" text,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE "verification" (
      "id" text PRIMARY KEY,
      "identifier" text NOT NULL,
      "value" text NOT NULL,
      "expiresAt" timestamptz NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE "passkey" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "name" text,
      "publicKey" text NOT NULL,
      "credentialID" text NOT NULL,
      "counter" integer NOT NULL,
      "deviceType" text NOT NULL,
      "backedUp" boolean NOT NULL,
      "transports" text,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX "session_userId_idx" ON "session"("userId");
    CREATE INDEX "account_userId_idx" ON "account"("userId");
    CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE "passkey";
    DROP TABLE "verification";
    DROP TABLE "account";
    DROP TABLE "session";
    DROP TABLE "user";
  `);
};
```

- [ ] **Step 10: Reconcile the migration against the library's own generator**

Run (from `apps/server/`): `pnpm exec @better-auth/cli generate --config src/auth/auth-dev.ts`
Compare the SQL it prints with the migration from Step 9. If the installed version's schema differs (extra columns, changed types), the library wins: update the migration to match, exactly. Do not skip this — a drifted vendor schema fails at runtime, not at migrate time.

- [ ] **Step 11: Write the test DB helper**

```ts
// apps/server/test/helpers/db.ts
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/gisik_nokma_test';

/** Bring the test database to the latest migration. Call once per suite. */
export function migrateTestDb(): void {
  execFileSync('pnpm', ['exec', 'node-pg-migrate', 'up'], {
    cwd: process.cwd(), // vitest runs from apps/server
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}

export function testPool(): Pool {
  return new Pool({ connectionString: TEST_DATABASE_URL });
}

/** Empty every table except node-pg-migrate's ledger of applied migrations. */
export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`
    DO $$
    DECLARE t text;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables
               WHERE schemaname = 'public' AND tablename <> 'pgmigrations'
      LOOP EXECUTE format('TRUNCATE TABLE %I CASCADE', t); END LOOP;
    END $$;
  `);
}
```

(If Plan 1 already ships a test-db helper in `apps/server/test/helpers/`, add `truncateAll` and `TEST_DATABASE_URL` to it instead of creating a second one, and use its names everywhere this plan says `testPool`/`migrateTestDb`.)

- [ ] **Step 12: Verify migrations apply cleanly**

Run (from `apps/server/`):
```bash
createdb gisik_nokma_test 2>/dev/null || true
DATABASE_URL=postgres://postgres:postgres@localhost:5432/gisik_nokma_test pnpm exec node-pg-migrate up
```
Expected: all migrations (Plan 1's and `auth-tables`) apply without error; `psql` shows the five quoted tables.

- [ ] **Step 13: Run the whole server test suite to prove nothing broke**

Run (from `apps/server/`): `pnpm vitest run`
Expected: PASS — Plan 1–3 suites untouched, plus the 2 new sender tests.

- [ ] **Step 14: Commit**

```bash
git add apps/server/src/db/queryable.ts apps/server/src/auth apps/server/migrations apps/server/test/helpers/db.ts apps/server/test/auth/otp-sender.test.ts apps/server/package.json pnpm-lock.yaml
git commit -m "Identity is infrastructure: better-auth owns users and sessions in server tables, while membership stays workspace history in the ledger. OTP and magic-link delivery sit behind senders whose dev implementations log instead of sending."
```

---

### Task 2: Auth routes and session resolution on Fastify

**Files:**
- Create: `apps/server/src/auth/routes.ts`
- Create: `apps/server/src/auth/require-session.ts`
- Create: `apps/server/test/helpers/session.ts`
- Modify: `apps/server/src/app.ts` (Plan 1's app assembly — register the auth routes where other routes are registered)
- Test: `apps/server/test/auth/sign-in-flows.test.ts`
- Test: `apps/server/test/auth/require-session.test.ts`

**Interfaces:**
- Consumes: `createAuth`, `LogOtpSender`, `LogMagicLinkSender`, test DB helpers (Task 1).
- Produces: `registerAuthRoutes(app: FastifyInstance, auth: Auth): void` mounting `/api/auth/*`; `makeRequireSession(auth: Auth)` returning a Fastify preHandler that 401s without a session and sets `request.currentUserId: string`; test helper `signInWithPhone(app, sender, phone): Promise<string>` (bearer token) in `test/helpers/session.ts`. Every later task's routes use `makeRequireSession`; every later task's route tests sign in through `signInWithPhone`; every client plan signs in through `/api/auth/*`.

- [ ] **Step 1: Write the failing sign-in flow tests**

```ts
// apps/server/test/auth/sign-in-flows.test.ts
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuth, type Auth } from '../../src/auth/auth';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender';
import { LogOtpSender } from '../../src/auth/otp-sender';
import { registerAuthRoutes } from '../../src/auth/routes';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';

let pool: Pool;
let app: FastifyInstance;
let auth: Auth;
let otp: LogOtpSender;
let magic: LogMagicLinkSender;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  otp = new LogOtpSender(() => {});
  magic = new LogMagicLinkSender(() => {});
  auth = createAuth({
    pool,
    otpSender: otp,
    magicLinkSender: magic,
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-at-least-32-characters-long',
  });
  app = Fastify();
  registerAuthRoutes(app, auth);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
  otp.sent.length = 0;
  magic.sent.length = 0;
});

describe('phone OTP sign-in', () => {
  it('delivers a code through OtpSender and verifying it opens a session', async () => {
    const send = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: '+919000000001' },
    });
    expect(send.statusCode).toBeLessThan(300);
    expect(otp.sent).toHaveLength(1);

    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      payload: { phoneNumber: '+919000000001', code: otp.sent[0].code },
    });
    expect(verify.statusCode).toBeLessThan(300);
    const setCookie = verify.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieText = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(cookieText).toMatch(/HttpOnly/i); // web sessions are httpOnly cookies
  });
});

describe('email magic link sign-in', () => {
  it('delivers a link through MagicLinkSender and following it opens a session', async () => {
    const start = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      payload: { email: 'kiro@example.com' },
    });
    expect(start.statusCode).toBeLessThan(300);
    expect(magic.sent).toHaveLength(1);

    const url = new URL(magic.sent[0].url);
    const follow = await app.inject({ method: 'GET', url: url.pathname + url.search });
    // Verification responds with a redirect carrying the session cookie.
    expect([200, 302]).toContain(follow.statusCode);
    expect(follow.headers['set-cookie']).toBeDefined();
  });
});

describe('bearer sessions for the apps', () => {
  it('returns a token on sign-in that authenticates via the Authorization header', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: '+919000000002' },
    });
    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      payload: { phoneNumber: '+919000000002', code: otp.sent[0].code },
    });
    const token = verify.headers['set-auth-token'] as string;
    expect(token).toBeTruthy();

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user).toBeTruthy();
  });
});

describe('google oauth wiring', () => {
  it('builds a Google authorization redirect (no external call)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      payload: { provider: 'google' },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(res.json().url).toContain('accounts.google.com');
  });
});

describe('passkey endpoints', () => {
  it('offers registration options to a signed-in user', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: '+919000000003' },
    });
    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      payload: { phoneNumber: '+919000000003', code: otp.sent[0].code },
    });
    const token = verify.headers['set-auth-token'] as string;
    const options = await app.inject({
      method: 'GET',
      url: '/api/auth/passkey/generate-register-options',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(options.statusCode).toBe(200);
    expect(options.json().challenge).toBeTruthy(); // WebAuthn ceremony is client-side; the server side is live
  });
});
```

Note: the `/api/auth/...` sub-paths are better-auth 1.x endpoint names. If the pinned version routes differently (versioned docs), fix the paths in the test — the flows themselves (send code → verify → session; link → verify → session; bearer; social url; passkey options) are the contract.

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/server/`): `pnpm vitest run test/auth/sign-in-flows.test.ts`
Expected: FAIL — cannot resolve `../../src/auth/routes`.

- [ ] **Step 3: Implement the catch-all auth route**

```ts
// apps/server/src/auth/routes.ts
import type { FastifyInstance } from 'fastify';
import type { Auth } from './auth';

/**
 * Mounts better-auth's Web-standard handler on Fastify 5 via a catch-all
 * route — the library's documented Fastify integration.
 */
export function registerAuthRoutes(app: FastifyInstance, auth: Auth): void {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (typeof value === 'string') headers.append(key, value);
        else if (Array.isArray(value)) for (const v of value) headers.append(key, v);
      }
      const body =
        request.method === 'POST' && request.body !== undefined && request.body !== null
          ? JSON.stringify(request.body)
          : undefined;
      const webRequest = new Request(url.toString(), { method: request.method, headers, body });

      const response = await auth.handler(webRequest);

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);
      reply.send(response.body ? await response.text() : null);
    },
  });
}
```

- [ ] **Step 4: Implement session resolution**

```ts
// apps/server/src/auth/require-session.ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import type { Auth } from './auth';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireSession; absent means the preHandler was skipped. */
    currentUserId: string;
  }
}

/**
 * Every protected route resolves session → user through this preHandler.
 * Cookie (web) and bearer (apps) both arrive as headers; better-auth
 * resolves either. No session → generic 401, no detail leaked.
 */
export function makeRequireSession(auth: Auth) {
  return async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      await reply.code(401).send({ error: 'unauthenticated' });
      return;
    }
    request.currentUserId = session.user.id;
  };
}
```

- [ ] **Step 5: Run the sign-in tests to verify they pass**

Run (from `apps/server/`): `pnpm vitest run test/auth/sign-in-flows.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Write the shared sign-in test helper**

Later tasks' route tests all need a session; the helper lives with the other test helpers from day one:

```ts
// apps/server/test/helpers/session.ts
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender';

/** Sign a user in over the wire (phone OTP) and return a bearer token. */
export async function signInWithPhone(
  app: FastifyInstance,
  sender: LogOtpSender,
  phone: string,
): Promise<string> {
  const before = sender.sent.length;
  await app.inject({ method: 'POST', url: '/api/auth/phone-number/send-otp', payload: { phoneNumber: phone } });
  const verify = await app.inject({
    method: 'POST',
    url: '/api/auth/phone-number/verify',
    payload: { phoneNumber: phone, code: sender.sent[before].code },
  });
  return verify.headers['set-auth-token'] as string;
}
```

- [ ] **Step 7: Write the failing requireSession tests**

```ts
// apps/server/test/auth/require-session.test.ts
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuth, type Auth } from '../../src/auth/auth';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender';
import { LogOtpSender } from '../../src/auth/otp-sender';
import { registerAuthRoutes } from '../../src/auth/routes';
import { makeRequireSession } from '../../src/auth/require-session';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { signInWithPhone } from '../helpers/session';

let pool: Pool;
let app: FastifyInstance;
let auth: Auth;
let otp: LogOtpSender;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  await truncateAll(pool);
  otp = new LogOtpSender(() => {});
  auth = createAuth({
    pool,
    otpSender: otp,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-at-least-32-characters-long',
  });
  app = Fastify();
  registerAuthRoutes(app, auth);
  const requireSession = makeRequireSession(auth);
  app.get('/protected', { preHandler: requireSession }, async (request) => ({
    userId: request.currentUserId,
  }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('requireSession', () => {
  it('refuses a request with no session as a generic 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('refuses a forged bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer forged-token-000000' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('resolves the user for a real bearer session', async () => {
    const token = await signInWithPhone(app, otp, '+919000000004');
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBeTruthy();
  });
});
```

- [ ] **Step 8: Run the requireSession tests**

Run (from `apps/server/`): `pnpm vitest run test/auth/require-session.test.ts`
Expected: PASS (3 tests — implementation already exists from Step 4; this step proves the guard from the outside).

- [ ] **Step 9: Register the auth routes in the app assembly**

In Plan 1's `apps/server/src/app.ts` (or its equivalent app builder), construct the auth instance from the process environment and register the routes where the other routes register:

```ts
// inside the app builder, alongside existing route registration
import { createAuth } from './auth/auth';
import { LogMagicLinkSender } from './auth/magic-link-sender';
import { LogOtpSender } from './auth/otp-sender';
import { registerAuthRoutes } from './auth/routes';

const auth = createAuth({
  pool, // the pg Pool the app already constructs
  otpSender: new LogOtpSender(), // production sender is a deployment concern (Open questions)
  magicLinkSender: new LogMagicLinkSender(),
  baseUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-change-me',
});
registerAuthRoutes(app, auth);
```

Expose `auth` from the builder's return value (alongside whatever it already returns) so later tasks can build `makeRequireSession(auth)`.

- [ ] **Step 10: Run the whole server suite**

Run (from `apps/server/`): `pnpm vitest run`
Expected: PASS — all prior suites plus the 8 new auth tests.

- [ ] **Step 11: Commit**

```bash
git add apps/server/src/auth apps/server/src/app.ts apps/server/test/auth apps/server/test/helpers/session.ts
git commit -m "Sign-in works four ways with no passwords: phone OTP, magic link, Google, passkeys — cookie sessions for the web, bearer tokens for the apps, and one preHandler that resolves session to user for every protected route."
```

---

### Task 3: Membership and visibility event types in the domain package

**Files:**
- Create: `packages/domain/src/events/membership.ts`
- Create: `packages/domain/src/events/visibility.ts`
- Modify: `packages/domain/src/events/registry.ts` (Plan 1's event-type registry — add seven registrations)
- Modify: `packages/domain/src/index.ts` (export the new types and parsers)
- Test: `packages/domain/test/events/membership.test.ts`
- Test: `packages/domain/test/events/visibility.test.ts`

**Interfaces:**
- Consumes: Plan 1's `registerEventType({type, version, entityKind, parsePayload})` and `parseEvent` (unknown types are refused at ingest — registration is what makes these types legal).
- Produces (all exported from `@gisik-nokma/domain`): `WorkspaceRole = 'owner'|'admin'|'member'|'guest'`; `VisibilityMode = 'workspace'|'project'|'explicit'|'inherit'`; payload interfaces `WorkspaceCreatedPayload {name}`, `ProjectCreatedPayload {name}`, `MembershipGrantedPayload {userId, role}`, `MembershipRevokedPayload {userId}`, `ProjectMemberAddedPayload {userId, projectAdmin}`, `ProjectMemberRemovedPayload {userId}`, `VisibilitySetPayload {ticketId, mode, userIds?}`; parsers `parseWorkspaceCreated`, `parseProjectCreated`, `parseMembershipGranted`, `parseMembershipRevoked`, `parseProjectMemberAdded`, `parseProjectMemberRemoved`, `parseVisibilitySet` — each `(payload: unknown) => <Payload>`, throwing `Error` with a plain message on invalid input.

**Event → entity mapping (a modeling decision, stated once):** `workspace.created` → entity `{kind:'workspace', id: workspaceId}`; `project.created` → `{kind:'project', id: projectId}`; `membership.granted`/`membership.revoked` → `{kind:'membership', id: membershipId(workspaceId, userId)}` — `membershipId` is Plan 2's helper in `@gisik-nokma/domain` (`${workspaceId}:${userId}`), and the id is deterministic because the engine must be able to address a membership from `(workspaceId, actorId)` via `getEntityState('membership', id)` (coordination doc §5); the *scope* stays in the payload, and `proj_memberships` still keys on `(workspaceId, userId, scope)`; `project.member_added`/`project.member_removed` → `{kind:'project', id: projectId}` (they are project-roster history); `visibility.set` → `{kind:'ticket', id: ticketId}` (must equal `payload.ticketId` — Task 9 refuses mismatches).

- [ ] **Step 1: Write the failing membership parser tests**

```ts
// packages/domain/test/events/membership.test.ts
import { describe, expect, it } from 'vitest';
import {
  parseMembershipGranted,
  parseMembershipRevoked,
  parseProjectCreated,
  parseProjectMemberAdded,
  parseProjectMemberRemoved,
  parseWorkspaceCreated,
} from '../../src/events/membership';

describe('parseWorkspaceCreated', () => {
  it('accepts a non-empty name', () => {
    expect(parseWorkspaceCreated({ name: 'Convenience Corner' })).toEqual({ name: 'Convenience Corner' });
  });
  it('refuses a missing or empty name', () => {
    expect(() => parseWorkspaceCreated({})).toThrow(/name/);
    expect(() => parseWorkspaceCreated({ name: '  ' })).toThrow(/name/);
  });
});

describe('parseProjectCreated', () => {
  it('accepts a non-empty name', () => {
    expect(parseProjectCreated({ name: 'Registrations' })).toEqual({ name: 'Registrations' });
  });
  it('refuses junk', () => {
    expect(() => parseProjectCreated(null)).toThrow(/name/);
  });
});

describe('parseMembershipGranted', () => {
  it('accepts a workspace grant', () => {
    expect(parseMembershipGranted({ userId: 'usr_1', role: 'admin' })).toEqual({
      userId: 'usr_1',
      role: 'admin',
    });
  });
  it('refuses an unknown role', () => {
    expect(() => parseMembershipGranted({ userId: 'usr_1', role: 'superuser' })).toThrow(/role/);
  });
  // Planted defect for the 2026-08-27 collapse: a stale client or an old
  // fixture can still send the scope this event used to carry. Accepting and
  // ignoring it would take in a claim meaning "put them on project P" and do
  // something else — the silent acceptance the honesty contract forbids — and
  // it is how the two-ways-on/two-ways-off hole would grow back.
  it('refuses a scope, rather than ignoring one', () => {
    expect(() => parseMembershipGranted({ userId: 'usr_1', role: 'guest', scope: { projectId: 'prj_1' } }))
      .toThrow(/project\.member_added/);
    expect(() => parseMembershipGranted({ userId: 'usr_1', role: 'member', scope: 'workspace' }))
      .toThrow(/project\.member_added/);
  });
});

describe('parseMembershipRevoked', () => {
  it('accepts a userId', () => {
    expect(parseMembershipRevoked({ userId: 'usr_1' })).toEqual({ userId: 'usr_1' });
  });
  it('refuses a missing userId', () => {
    expect(() => parseMembershipRevoked({})).toThrow(/userId/);
  });
  it('refuses a scope, rather than ignoring one', () => {
    expect(() => parseMembershipRevoked({ userId: 'usr_1', scope: { projectId: 'prj_1' } }))
      .toThrow(/project\.member_removed/);
  });
});

describe('parseProjectMemberAdded', () => {
  it('accepts userId and an explicit projectAdmin flag', () => {
    expect(parseProjectMemberAdded({ userId: 'usr_1', projectAdmin: true })).toEqual({
      userId: 'usr_1',
      projectAdmin: true,
    });
  });
  it('refuses a missing projectAdmin flag — the flag is a claim, not a default', () => {
    expect(() => parseProjectMemberAdded({ userId: 'usr_1' })).toThrow(/projectAdmin/);
  });
});

describe('parseProjectMemberRemoved', () => {
  it('accepts a userId', () => {
    expect(parseProjectMemberRemoved({ userId: 'usr_1' })).toEqual({ userId: 'usr_1' });
  });
  it('refuses junk', () => {
    expect(() => parseProjectMemberRemoved('usr_1')).toThrow(/userId/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `packages/domain/`): `pnpm vitest run test/events/membership.test.ts`
Expected: FAIL — cannot resolve `../../src/events/membership`.

- [ ] **Step 3: Implement the membership payloads and parsers**

```ts
// packages/domain/src/events/membership.ts

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';

/**
 * Membership is workspace-scoped and nothing else (owner decision 2026-08-27).
 * There was a `MembershipScope = 'workspace' | { projectId }` here, so a person
 * could be put on a project two ways — this event with a project scope, or
 * `project.member_added`. Two ways on means two ways off: `membership.revoked`
 * with a project scope and `project.member_removed` both mean "take them off
 * this project", and unless they wrote the identical projection key, removing
 * by one path left the other standing and an admin believed access was gone
 * when it was not.
 *
 * The project scope also bought nothing. A guest's `canSee` is explicit-only,
 * so it granted no reads, and guests are refused ticket creation before the
 * project check is reached, so it granted no writes. `project.member_added` /
 * `project.member_removed` are now the ONLY project association; guests reach
 * work through `visibility.set` explicit lists, which is what spec §6 says a
 * guest is.
 */
export interface WorkspaceCreatedPayload {
  name: string;
}
export interface ProjectCreatedPayload {
  name: string;
}
export interface MembershipGrantedPayload {
  userId: string;
  role: WorkspaceRole;
}
export interface MembershipRevokedPayload {
  userId: string;
}
export interface ProjectMemberAddedPayload {
  userId: string;
  projectAdmin: boolean;
}
export interface ProjectMemberRemovedPayload {
  userId: string;
}

const ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'member', 'guest']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(record: Record<string, unknown>, field: string, eventType: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${eventType} payload requires a non-empty ${field}`);
  }
  return value;
}

export function parseWorkspaceCreated(payload: unknown): WorkspaceCreatedPayload {
  if (!isRecord(payload)) throw new Error('workspace.created payload requires a non-empty name');
  return { name: requireNonEmptyString(payload, 'name', 'workspace.created') };
}

export function parseProjectCreated(payload: unknown): ProjectCreatedPayload {
  if (!isRecord(payload)) throw new Error('project.created payload requires a non-empty name');
  return { name: requireNonEmptyString(payload, 'name', 'project.created') };
}

export function parseMembershipGranted(payload: unknown): MembershipGrantedPayload {
  if (!isRecord(payload)) throw new Error('membership.granted payload requires userId and role');
  const userId = requireNonEmptyString(payload, 'userId', 'membership.granted');
  const role = payload.role;
  if (typeof role !== 'string' || !ROLES.has(role)) {
    throw new Error("membership.granted payload requires role 'owner'|'admin'|'member'|'guest'");
  }
  // A `scope` is REFUSED rather than ignored. These events used to carry one,
  // so a stale client or an old fixture can still send it — and silently
  // dropping it would accept a claim meaning "put them on project P" while
  // doing something else entirely, which is the quiet acceptance the honesty
  // contract exists to prevent. Project membership is project.member_added.
  if ('scope' in payload) {
    throw new Error('membership.granted no longer takes a scope; use project.member_added to put someone on a project');
  }
  return { userId, role: role as WorkspaceRole };
}

export function parseMembershipRevoked(payload: unknown): MembershipRevokedPayload {
  if (!isRecord(payload)) throw new Error('membership.revoked payload requires userId');
  if ('scope' in payload) {
    throw new Error('membership.revoked no longer takes a scope; use project.member_removed to take someone off a project');
  }
  return {
    userId: requireNonEmptyString(payload, 'userId', 'membership.revoked'),
  };
}

export function parseProjectMemberAdded(payload: unknown): ProjectMemberAddedPayload {
  if (!isRecord(payload)) throw new Error('project.member_added payload requires userId and projectAdmin');
  const userId = requireNonEmptyString(payload, 'userId', 'project.member_added');
  if (typeof payload.projectAdmin !== 'boolean') {
    throw new Error('project.member_added payload requires a boolean projectAdmin');
  }
  return { userId, projectAdmin: payload.projectAdmin };
}

export function parseProjectMemberRemoved(payload: unknown): ProjectMemberRemovedPayload {
  if (!isRecord(payload)) throw new Error('project.member_removed payload requires userId');
  return { userId: requireNonEmptyString(payload, 'userId', 'project.member_removed') };
}
```

- [ ] **Step 4: Run the membership tests to verify they pass**

Run (from `packages/domain/`): `pnpm vitest run test/events/membership.test.ts`
Expected: PASS. (The plan said 13; Step 1 above literally contains 14 `it` blocks, so 13 was wrong and the
block count governs. As executed the file holds 23 — the extra nine cover the ULID user id, the blank-name
refusal, the role vocabulary in both directions, `.strict()`'s generic message staying generic, and the
registrations themselves. No written test was deleted to reach any stated total.)

- [ ] **Step 5: Write the failing visibility parser tests**

```ts
// packages/domain/test/events/visibility.test.ts
import { describe, expect, it } from 'vitest';
import { parseVisibilitySet } from '../../src/events/visibility';

describe('parseVisibilitySet', () => {
  it('accepts workspace, project, and inherit modes without userIds', () => {
    for (const mode of ['workspace', 'project', 'inherit'] as const) {
      expect(parseVisibilitySet({ ticketId: 'tkt_1', mode })).toEqual({ ticketId: 'tkt_1', mode });
    }
  });

  it('accepts explicit mode with a non-empty userIds list', () => {
    expect(parseVisibilitySet({ ticketId: 'tkt_1', mode: 'explicit', userIds: ['usr_1', 'usr_2'] })).toEqual({
      ticketId: 'tkt_1',
      mode: 'explicit',
      userIds: ['usr_1', 'usr_2'],
    });
  });

  it('refuses explicit mode without userIds — an audience of nobody is not a claim', () => {
    expect(() => parseVisibilitySet({ ticketId: 'tkt_1', mode: 'explicit' })).toThrow(/userIds/);
    expect(() => parseVisibilitySet({ ticketId: 'tkt_1', mode: 'explicit', userIds: [] })).toThrow(/userIds/);
  });

  it('refuses userIds on non-explicit modes — a list nobody reads would be a silent lie', () => {
    expect(() => parseVisibilitySet({ ticketId: 'tkt_1', mode: 'project', userIds: ['usr_1'] })).toThrow(/userIds/);
  });

  it('refuses an unknown mode', () => {
    expect(() => parseVisibilitySet({ ticketId: 'tkt_1', mode: 'secret' })).toThrow(/mode/);
  });

  it('refuses a missing ticketId', () => {
    expect(() => parseVisibilitySet({ mode: 'project' })).toThrow(/ticketId/);
  });
});
```

- [ ] **Step 6: Run to verify failure, then implement**

Run (from `packages/domain/`): `pnpm vitest run test/events/visibility.test.ts` — Expected: FAIL (module missing). Then:

```ts
// packages/domain/src/events/visibility.ts

export type VisibilityMode = 'workspace' | 'project' | 'explicit' | 'inherit';

export interface VisibilitySetPayload {
  ticketId: string;
  mode: VisibilityMode;
  userIds?: string[];
}

const MODES: ReadonlySet<string> = new Set(['workspace', 'project', 'explicit', 'inherit']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseVisibilitySet(payload: unknown): VisibilitySetPayload {
  if (!isRecord(payload) || typeof payload.ticketId !== 'string' || payload.ticketId.trim() === '') {
    throw new Error('visibility.set payload requires a non-empty ticketId');
  }
  const mode = payload.mode;
  if (typeof mode !== 'string' || !MODES.has(mode)) {
    throw new Error("visibility.set payload requires mode 'workspace'|'project'|'explicit'|'inherit'");
  }
  if (mode === 'explicit') {
    const userIds = payload.userIds;
    if (
      !Array.isArray(userIds) ||
      userIds.length === 0 ||
      !userIds.every((u) => typeof u === 'string' && u.trim() !== '')
    ) {
      throw new Error('visibility.set with explicit mode requires a non-empty userIds list');
    }
    return { ticketId: payload.ticketId, mode, userIds };
  }
  if (payload.userIds !== undefined) {
    throw new Error(`visibility.set with mode '${mode}' must not carry userIds`);
  }
  return { ticketId: payload.ticketId, mode: mode as VisibilityMode };
}
```

Run again — Expected: PASS (6 tests).

- [ ] **Step 7: Register all seven event types**

In Plan 1's `packages/domain/src/events/registry.ts`, add (adapting the call shape to the registry's actual signature — the semantic content below is fixed):

```ts
import {
  parseMembershipGranted,
  parseMembershipRevoked,
  parseProjectCreated,
  parseProjectMemberAdded,
  parseProjectMemberRemoved,
  parseWorkspaceCreated,
} from './membership';
import { parseVisibilitySet } from './visibility';

registerEventType({ type: 'workspace.created', version: 1, entityKind: 'workspace', parsePayload: parseWorkspaceCreated });
registerEventType({ type: 'project.created', version: 1, entityKind: 'project', parsePayload: parseProjectCreated });
registerEventType({ type: 'membership.granted', version: 1, entityKind: 'membership', parsePayload: parseMembershipGranted });
registerEventType({ type: 'membership.revoked', version: 1, entityKind: 'membership', parsePayload: parseMembershipRevoked });
registerEventType({ type: 'project.member_added', version: 1, entityKind: 'project', parsePayload: parseProjectMemberAdded });
registerEventType({ type: 'project.member_removed', version: 1, entityKind: 'project', parsePayload: parseProjectMemberRemoved });
registerEventType({ type: 'visibility.set', version: 1, entityKind: 'ticket', parsePayload: parseVisibilitySet });
```

Also export everything from `packages/domain/src/index.ts`:

```ts
export * from './events/membership';
export * from './events/visibility';
```

- [ ] **Step 8: Run the full domain suite**

Run (from `packages/domain/`): `pnpm vitest run`
Expected: PASS — Plan 1's registry/parseEvent tests still green (proving the registrations are well-formed), plus the new tests. Six registrations are added, not seven: `workspace.created` was already registered by Plan 1 and is TAKEN OVER here, not re-registered (`register` throws on a duplicate `type@version`). Counted as executed: 23 in `test/events/membership.test.ts`, 10 in `test/events/visibility.test.ts`, and 20 more for the three envelope amendments across `envelope.test.ts`, `parse-event.test.ts` and `ids.test.ts` — domain goes 152 → 205.

- [ ] **Step 9: Commit**

```bash
git add packages/domain/src/events packages/domain/src/index.ts packages/domain/test/events
git commit -m "Membership and visibility claims parse at the door: seven event types the ledger can replay — workspaces, projects, grants, revocations, rosters, and who may see a ticket."
```

---

### Task 4: proj_memberships — membership history becomes effective roles

**Files:**
- Create: `apps/server/migrations/<ts>_proj-memberships.cjs`
- Create: `apps/server/src/projections/proj-memberships.ts`
- Create: `apps/server/src/permissions/effective-role.ts`
- Create: `apps/server/test/helpers/envelope.ts`
- Modify: `apps/server/src/projections/index.ts` (Plan 1's projection registration point — add `registerProjection(projMemberships)`)
- Test: `apps/server/test/projections/proj-memberships.test.ts`
- Test: `apps/server/test/permissions/effective-role.test.ts`

**Interfaces:**
- Consumes: `EventEnvelope`, `MembershipGrantedPayload` etc. (Task 3); Plan 1's `registerProjection({name, apply, reset})`; `Queryable` (Task 1).
- Produces: table `proj_memberships`; projection object `projMemberships = { name: 'proj_memberships', apply(env, db), reset(db) }`; `EffectiveRole { workspaceRole: WorkspaceRole | null; projects: Map<string, { projectAdmin: boolean }> }`; `resolveEffectiveRole(db: Queryable, userId: string, workspaceId: string): Promise<EffectiveRole>`; `hasProjectAdminRights(eff: EffectiveRole, projectId: string): boolean`; test helper `testEnvelope(overrides)`.

**Role-resolution rules (exact, encoded in `resolveEffectiveRole`):** a user's workspace role is their workspace-scope row's role, or — if they hold only project-scope rows and any of them carries role `'guest'` — `'guest'` (a guest invited to one project is a guest of the workspace); otherwise `null` (not a member). Their project set is every project-scope row; `projectAdmin` is that row's flag. `hasProjectAdminRights` is true for workspace `owner`/`admin` (spec: admins manage projects and people) or a project row with `projectAdmin: true`. This is management rights only — Task 7's `canSee` grants owners/admins NO read bypass (Open questions).

- [ ] **Step 1: Write the envelope test factory**

```ts
// apps/server/test/helpers/envelope.ts
import { ulid } from 'ulidx';
import type { EventEnvelope } from '@gisik-nokma/domain';
import type { LedgerEvent } from '../../src/ledger/event-store';

let seqCounter = 0;

/** Monotonic per-process seq for test ledgers. Reset between suites if exact numbers matter. */
export function nextSeq(): number {
  return ++seqCounter;
}

export function resetSeq(): void {
  seqCounter = 0;
}

/**
 * `clientTime`/`serverTime` are ISO 8601 `Z` strings at the domain boundary
 * and land in `timestamptz` columns (owner decision 2026-08-20). A test that
 * overrides them may state any offset it likes — `appendTestEvent` converts to
 * an instant on the way in — but must expect the equivalent `…Z` on the way
 * back out, because the column stores the moment, not the label.
 */
export function testEnvelope(
  overrides: Partial<LedgerEvent> &
    Pick<EventEnvelope, 'workspaceId' | 'entity' | 'type' | 'payload' | 'actorId'>,
): LedgerEvent {
  const now = new Date().toISOString();
  const seq = nextSeq();
  return {
    id: ulid(),
    version: 1,
    origin: 'web',
    clientTime: now,
    serverTime: now,
    seq,
    // One counter drives both numbers here: `workspace_seq` is Plan 1's
    // per-workspace stream cursor (coordination §18), and a globally monotonic
    // value is unique inside every workspace — so a test can resume at
    // `env.workspaceSeq - 1` and land exactly before that event.
    workspaceSeq: seq,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing projection tests**

```ts
// apps/server/test/projections/proj-memberships.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { membershipId } from '@gisik-nokma/domain';
import { projMemberships } from '../../src/projections/proj-memberships';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { testEnvelope } from '../helpers/envelope';

let pool: Pool;
const WS = 'wks_01';

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

function grant(userId: string, role: 'owner' | 'admin' | 'member' | 'guest') {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'membership', id: membershipId(WS, userId) },
    type: 'membership.granted',
    payload: { userId, role },
    actorId: 'usr_admin',
  });
}

function addToProject(userId: string, projectId: string, projectAdmin = false) {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'project', id: projectId },
    type: 'project.member_added',
    payload: { userId, projectAdmin },
    actorId: 'usr_admin',
  });
}

async function rows() {
  const res = await pool.query(
    'SELECT user_id, scope_kind, project_id, role, project_admin FROM proj_memberships ORDER BY user_id, scope_kind, project_id',
  );
  return res.rows;
}

describe('proj_memberships apply', () => {
  it('materializes a workspace grant', async () => {
    await projMemberships.apply(grant('usr_1', 'member', 'workspace'), pool);
    expect(await rows()).toEqual([
      { user_id: 'usr_1', scope_kind: 'workspace', project_id: '', role: 'member', project_admin: false },
    ]);
  });

  it('a re-grant updates the role in place — one row per membership identity', async () => {
    await projMemberships.apply(grant('usr_1', 'member', 'workspace'), pool);
    await projMemberships.apply(grant('usr_1', 'admin', 'workspace'), pool);
    expect(await rows()).toEqual([
      { user_id: 'usr_1', scope_kind: 'workspace', project_id: '', role: 'admin', project_admin: false },
    ]);
  });

  // One way off each scope, matching the one way on (owner decision
  // 2026-08-27). Taking someone off a project is project.member_removed and
  // nothing else; membership.revoked takes them out of the workspace. When
  // both events could mean "off this project", removing by one path left the
  // other row standing and an admin believed access was gone when it was not.
  it('project removal deletes the project row and leaves workspace membership', async () => {
    await projMemberships.apply(grant('usr_1', 'member'), pool);
    await projMemberships.apply(addToProject('usr_1', 'prj_1'), pool);
    await projMemberships.apply(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'project', id: 'prj_1' },
        type: 'project.member_removed',
        payload: { userId: 'usr_1' },
        actorId: 'usr_admin',
      }),
      pool,
    );
    expect(await rows()).toEqual([
      { user_id: 'usr_1', scope_kind: 'workspace', project_id: '', role: 'member', project_admin: false },
    ]);
  });

  it('workspace revocation deletes every row for that user, project rows included', async () => {
    await projMemberships.apply(grant('usr_1', 'member'), pool);
    await projMemberships.apply(addToProject('usr_1', 'prj_1'), pool);
    await projMemberships.apply(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'membership', id: membershipId(WS, 'usr_1') },
        type: 'membership.revoked',
        payload: { userId: 'usr_1' },
        actorId: 'usr_admin',
      }),
      pool,
    );
    // Leaving a project row behind for someone who is no longer in the
    // workspace is the same silent-access failure in a different place.
    expect(await rows()).toEqual([]);
  });

  it('project roster events add and remove project-scope member rows', async () => {
    await projMemberships.apply(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'project', id: 'prj_1' },
        type: 'project.member_added',
        payload: { userId: 'usr_2', projectAdmin: true },
        actorId: 'usr_admin',
      }),
      pool,
    );
    expect(await rows()).toEqual([
      { user_id: 'usr_2', scope_kind: 'project', project_id: 'prj_1', role: 'member', project_admin: true },
    ]);

    await projMemberships.apply(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'project', id: 'prj_1' },
        type: 'project.member_removed',
        payload: { userId: 'usr_2' },
        actorId: 'usr_admin',
      }),
      pool,
    );
    expect(await rows()).toEqual([]);
  });

  it('rebuilds deterministically: reset + replay reproduces the same rows', async () => {
    const events = [
      grant('usr_1', 'member', 'workspace'),
      grant('usr_2', 'admin', 'workspace'),
      grant('usr_3', 'guest', { projectId: 'prj_1' }),
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'project', id: 'prj_1' },
        type: 'project.member_added',
        payload: { userId: 'usr_1', projectAdmin: false },
        actorId: 'usr_2',
      }),
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'membership', id: membershipId(WS, 'usr_2') },
        type: 'membership.revoked',
        payload: { userId: 'usr_2' },
        actorId: 'usr_1',
      }),
    ];
    for (const env of events) await projMemberships.apply(env, pool);
    const first = await rows();
    await projMemberships.reset(pool);
    expect(await rows()).toEqual([]);
    for (const env of events) await projMemberships.apply(env, pool);
    expect(await rows()).toEqual(first);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run (from `apps/server/`): `pnpm vitest run test/projections/proj-memberships.test.ts`
Expected: FAIL — cannot resolve `../../src/projections/proj-memberships`.

- [ ] **Step 4: Create the migration**

Run (from `apps/server/`): `pnpm exec node-pg-migrate create proj-memberships`, then:

```js
// apps/server/migrations/<ts>_proj-memberships.cjs
/**
 * Projection: membership history → current membership rows.
 * project_id '' is the workspace-scope sentinel (Postgres primary keys
 * cannot contain NULLs; '' never collides with a real ULID).
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE proj_memberships (
      workspace_id  text NOT NULL,
      user_id       text NOT NULL,
      scope_kind    text NOT NULL CHECK (scope_kind IN ('workspace', 'project')),
      project_id    text NOT NULL DEFAULT '',
      role          text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'guest')),
      project_admin boolean NOT NULL DEFAULT false,
      granted_by    text NOT NULL,
      granted_at    timestamptz NOT NULL,
      seq           bigint NOT NULL,
      PRIMARY KEY (workspace_id, user_id, scope_kind, project_id)
    );
    CREATE INDEX proj_memberships_by_user ON proj_memberships (user_id, workspace_id);
    CREATE INDEX proj_memberships_by_project ON proj_memberships (workspace_id, project_id)
      WHERE scope_kind = 'project';
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE proj_memberships;');
};
```

- [ ] **Step 5: Implement the projection**

```ts
// apps/server/src/projections/proj-memberships.ts
import type {
  EventEnvelope,
  MembershipGrantedPayload,
  MembershipRevokedPayload,
  ProjectMemberAddedPayload,
  ProjectMemberRemovedPayload,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable';

const UPSERT = `
  INSERT INTO proj_memberships
    (workspace_id, user_id, scope_kind, project_id, role, project_admin, granted_by, granted_at, seq)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (workspace_id, user_id, scope_kind, project_id)
  DO UPDATE SET role = EXCLUDED.role, project_admin = EXCLUDED.project_admin,
                granted_by = EXCLUDED.granted_by, granted_at = EXCLUDED.granted_at, seq = EXCLUDED.seq`;

export const projMemberships = {
  name: 'proj_memberships',

  async apply(env: EventEnvelope, db: Queryable): Promise<void> {
    switch (env.type) {
      // Membership is workspace-scoped (owner decision 2026-08-27), so this
      // writes the workspace row and only that. Project rows come from
      // project.member_added below, and from nowhere else.
      case 'membership.granted': {
        const p = env.payload as MembershipGrantedPayload;
        await db.query(UPSERT, [
          env.workspaceId, p.userId, 'workspace', '', p.role, false,
          env.actorId, env.serverTime, env.seq,
        ]);
        return;
      }
      case 'membership.revoked': {
        const p = env.payload as MembershipRevokedPayload;
        // Every row, project rows included. Leaving someone on a project after
        // they have been put out of the workspace is the same silent-access
        // failure the scope collapse exists to remove — they would still resolve
        // a project association while belonging to nothing.
        await db.query(
          'DELETE FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2',
          [env.workspaceId, p.userId],
        );
        return;
      }
      case 'project.member_added': {
        const p = env.payload as ProjectMemberAddedPayload;
        await db.query(UPSERT, [
          env.workspaceId, p.userId, 'project', env.entity.id, 'member', p.projectAdmin,
          env.actorId, env.serverTime, env.seq,
        ]);
        return;
      }
      case 'project.member_removed': {
        const p = env.payload as ProjectMemberRemovedPayload;
        await db.query(
          `DELETE FROM proj_memberships
           WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'project' AND project_id = $3`,
          [env.workspaceId, p.userId, env.entity.id],
        );
        return;
      }
      default:
        return; // not a membership event — projections ignore what they do not read
    }
  },

  async reset(db: Queryable): Promise<void> {
    await db.query('TRUNCATE proj_memberships');
  },
};
```

- [ ] **Step 6: Migrate the test DB and run the projection tests**

Run (from `apps/server/`):
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/gisik_nokma_test pnpm exec node-pg-migrate up
pnpm vitest run test/projections/proj-memberships.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 7: Write the failing effective-role tests**

```ts
// apps/server/test/permissions/effective-role.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { membershipId } from '@gisik-nokma/domain';
import { projMemberships } from '../../src/projections/proj-memberships';
import { hasProjectAdminRights, resolveEffectiveRole } from '../../src/permissions/effective-role';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { testEnvelope } from '../helpers/envelope';

let pool: Pool;
const WS = 'wks_01';

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

async function seed(type: string, entityId: string, payload: unknown, entityKind: 'membership' | 'project' = 'membership') {
  await projMemberships.apply(
    testEnvelope({
      workspaceId: WS,
      entity: { kind: entityKind, id: entityId },
      type,
      payload,
      actorId: 'usr_admin',
    }),
    pool,
  );
}

describe('resolveEffectiveRole', () => {
  it('a non-member resolves to null with no projects', async () => {
    const eff = await resolveEffectiveRole(pool, 'usr_none', WS);
    expect(eff.workspaceRole).toBeNull();
    expect(eff.projects.size).toBe(0);
  });

  it('workspace role plus project rows resolve together', async () => {
    await seed('membership.granted', membershipId(WS, 'usr_1'), { userId: 'usr_1', role: 'member' });
    await seed('project.member_added', 'prj_1', { userId: 'usr_1', projectAdmin: true }, 'project');
    const eff = await resolveEffectiveRole(pool, 'usr_1', WS);
    expect(eff.workspaceRole).toBe('member');
    expect(eff.projects.get('prj_1')).toEqual({ projectAdmin: true });
  });

  it('a guest grant makes the user a guest of the workspace, on no project', async () => {
    await seed('membership.granted', membershipId(WS, 'usr_acct'), { userId: 'usr_acct', role: 'guest' });
    const eff = await resolveEffectiveRole(pool, 'usr_acct', WS);
    expect(eff.workspaceRole).toBe('guest');
    // A guest reaches work through visibility.set explicit lists, which is what
    // spec §6 says a guest is — not through a project association.
    expect(eff.projects.size).toBe(0);
  });
});

describe('hasProjectAdminRights', () => {
  it('workspace owners and admins hold management rights everywhere', async () => {
    await seed('membership.granted', membershipId(WS, 'usr_own'), { userId: 'usr_own', role: 'owner' });
    const eff = await resolveEffectiveRole(pool, 'usr_own', WS);
    expect(hasProjectAdminRights(eff, 'prj_anything')).toBe(true);
  });

  it('a project admin holds rights on that project only', async () => {
    await seed('membership.granted', membershipId(WS, 'usr_1'), { userId: 'usr_1', role: 'member' });
    await seed('project.member_added', 'prj_1', { userId: 'usr_1', projectAdmin: true }, 'project');
    const eff = await resolveEffectiveRole(pool, 'usr_1', WS);
    expect(hasProjectAdminRights(eff, 'prj_1')).toBe(true);
    expect(hasProjectAdminRights(eff, 'prj_2')).toBe(false);
  });

  it('a plain project member holds no management rights', async () => {
    await seed('membership.granted', membershipId(WS, 'usr_1'), { userId: 'usr_1', role: 'member' });
    await seed('project.member_added', 'prj_1', { userId: 'usr_1', projectAdmin: false }, 'project');
    const eff = await resolveEffectiveRole(pool, 'usr_1', WS);
    expect(hasProjectAdminRights(eff, 'prj_1')).toBe(false);
  });
});
```

- [ ] **Step 8: Run to verify failure, then implement**

Run (from `apps/server/`): `pnpm vitest run test/permissions/effective-role.test.ts` — Expected: FAIL (module missing). Then:

```ts
// apps/server/src/permissions/effective-role.ts
import type { WorkspaceRole } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable';

export interface EffectiveRole {
  /** null = not a member of this workspace at all. */
  workspaceRole: WorkspaceRole | null;
  /** Every project the user is on, with the project-admin flag. */
  projects: Map<string, { projectAdmin: boolean }>;
}

export async function resolveEffectiveRole(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<EffectiveRole> {
  const { rows } = await db.query(
    `SELECT scope_kind, project_id, role, project_admin
     FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  );
  let workspaceRole: WorkspaceRole | null = null;
  const projects = new Map<string, { projectAdmin: boolean }>();
  for (const row of rows as Array<{ scope_kind: string; project_id: string; role: WorkspaceRole; project_admin: boolean }>) {
    if (row.scope_kind === 'workspace') workspaceRole = row.role;
    else projects.set(row.project_id, { projectAdmin: row.project_admin });
  }
  // A guest invited to one project is a guest of the workspace: their
  // project-scope grant is their only membership, and it names them guest.
  if (workspaceRole === null && rows.some((r: { scope_kind: string; role: string }) => r.scope_kind === 'project' && r.role === 'guest')) {
    workspaceRole = 'guest';
  }
  return { workspaceRole, projects };
}

/**
 * Management rights over a project: workspace owners/admins (the spec has
 * admins managing projects and people) or the project-admin flag. This is
 * NOT a visibility bypass — canSee never consults it.
 */
export function hasProjectAdminRights(eff: EffectiveRole, projectId: string): boolean {
  return (
    eff.workspaceRole === 'owner' ||
    eff.workspaceRole === 'admin' ||
    eff.projects.get(projectId)?.projectAdmin === true
  );
}
```

Run again — Expected: PASS (6 tests).

- [ ] **Step 9: Register the projection**

In Plan 1's projection registration point (`apps/server/src/projections/index.ts` or equivalent), add:

```ts
import { projMemberships } from './proj-memberships';

registerProjection(projMemberships);
```

Then run the projection verifier to prove the registry accepts it:
Run (from `apps/server/`): `pnpm vitest run` (full suite) and the verify CLI if Plan 1 exposed it as a script, e.g. `pnpm run verify-projections`.
Expected: PASS; verifier reports proj_memberships in its projection list.

- [ ] **Step 10: Commit**

```bash
git add apps/server/migrations apps/server/src/projections apps/server/src/permissions/effective-role.ts apps/server/test
git commit -m "proj_memberships turns membership history into effective roles: one row per membership identity, workspace role plus per-project admin flags, and a guest of one project is a guest of the workspace."
```

---

### Task 5: Pre-engine permission gate — role refusals at the ingest door, and the founding sequence behind it

**Files:**
- Create: `apps/server/src/permissions/check-permission.ts`
- Create: `packages/domain/src/workflows/simple-kanban.ts` (Step 6 — the canonical default workflow, one home)
- Create: `apps/server/src/workspaces/bootstrap-workspace.ts` (Step 6)
- Modify: `apps/server/src/ingest/pipeline.ts` (Plan 1's ingest pipeline — insert the gate between `parseEvent` success and `evaluateEvent`; call the bootstrap after a `workspace.created` is appended)
- Test: `apps/server/test/permissions/check-role-permission.test.ts`
- Test: `packages/domain/test/workflows/simple-kanban.test.ts` (Step 6)

**Interfaces:**
- Consumes: `Refusal` shape from `@gisik-nokma/domain` (contract-fixed: `{refused: true; rule: string; reason: string}`); `EffectiveRole`, `resolveEffectiveRole`, `hasProjectAdminRights` (Task 4); Plan 1's ingest pipeline and `evaluateEvent(env, ctx)`; `WorkflowDef` and `validateWorkflowDef` (Plan 2), `builtinTicketTypeDefs(defaultWorkflowId)` (Plan 3).
- Produces: `PermissionContext { sessionUserId: string; eff: EffectiveRole }`; `checkRolePermission(env: EventEnvelope, ctx: PermissionContext): Refusal | null` (pure); `checkPermission(db: Queryable, env: EventEnvelope, sessionUserId: string): Promise<Refusal | null>` — the single gate the ingest pipeline calls (Task 9 extends it with visibility checks). Rule names used: `'permission.role'`, `'permission.visibility'` (Task 9). Step 6 additionally produces `SIMPLE_KANBAN_TEMPLATE: Omit<WorkflowDef, 'id' | 'version'>` and `simpleKanbanWorkflowDef(workflowId: string): WorkflowDef` in `@gisik-nokma/domain`, and `bootstrapWorkspace(founding: EventEnvelope, append: (env: EventEnvelope) => Promise<void>): Promise<EventEnvelope[]>` in `apps/server`.

> ### ⚠️ AS-BUILT CORRECTIONS — Task 5 landed 2026-08-31. The code samples below are STALE; do not copy them.
>
> Ruling P17 requires a breaking signature change to be swept in the plan text and not only in code.
> `SubmissionGate` was widened, so every sample in this task and in **Task 9** that calls the gate is
> wrong. What shipped:
>
> | Plan text (below) | As built |
> |---|---|
> | `checkPermission(db, env, sessionUserId)` — three positional args | **`checkPermission(env, ctx)`** where `ctx: SubmissionContext = { db: Queryable; sessionUserId: string }` |
> | `SubmissionGate = (env) => Refusal \| null` | **`(env, ctx: SubmissionContext) => Promise<Refusal \| null>`** — async |
> | `import type { Refusal } from '@gisik-nokma/domain'` | **`from '@gisik-nokma/rule-engine'`** (coordination §10: the import origin comes from the shipped code) |
> | Modify `apps/server/src/ingest/pipeline.ts` | **No such file.** `apps/server/src/ingest/ingest-service.ts`, and the insert is not linear — the gate is threaded through `commitOne` as a `ClientDoor \| null`, and `ingestClientBatch(rawEvents, sessionUserId)` gained the session |
> | `packages/domain/src/workflows/simple-kanban.ts` | **`packages/domain/src/simple-kanban.ts`** (flat; there is no `workflows/` directory) |
> | `projMemberships` | **`membershipsProjection`** |
> | `bootstrapWorkspace(founding: EventEnvelope, append: (env) => Promise<void>)` | **`bootstrapWorkspace(founding: FoundingEvent, append: (events: SubmittedEvent[]) => Promise<IngestResult[]>)`**, plus a pure `foundingSequence(founding)`; it lives at `apps/server/src/workspaces/bootstrap-workspace.ts` and is fired from `ingestAll`, not from a route |
> | `ingestEvent(e, { db: pool, sessionUserId })` in the Step 6 tests | **No such export.** `ingest.ingestClientBatch([e], sessionUserId)` / `ingest.ingestBatch([e])`, returning `IngestResult[]` |
>
> `checkRolePermission(env, ctx)` — the PURE half — is **unchanged**, so Plan 5's samples that call it
> (`2026-08-20-05-api-realtime-search.md:791-844`) are still correct. Task 9's are not: see the block at
> Task 9.
>
> **Also corrected, because the plan text's reason is not the shipped system's reason:** Step 6 says the
> workflow → types order is load-bearing because "a `ticket-type.defined` naming a workflow that has not
> been defined yet is refused". **No such refusal exists.** `checkTicketTypeDefined`
> (`packages/rule-engine/src/checks/ticket-type.ts`) takes `_ctx` unread and checks entity kind, payload
> shape and the built-in rank lock only. The order is kept and is still load-bearing — for ledger
> honesty, which `bootstrap-workspace.ts` states — but do not repeat the refusal as though it fires.
> *Owner of the missing check, if the series wants one: Plan 3 Chain B.*
>
> **The Step 6 test "a workspace can hold a ticket the moment it exists" was NOT written**, because
> `proj_tickets` does not exist on main — Plan 3 Chain B has not landed. What was written instead pins
> the ledger: the seven-event order by `workspace_seq`, the four type ids each naming the workflow
> defined one event earlier, the founding workflow equal to `SIMPLE_KANBAN_TEMPLATE`, and the founder's
> `owner` row in `proj_memberships`. *Owner of the missing end-to-end assertion: whoever runs the
> step-10 integration checkpoint after Plan 3 Chain B lands.*

**Planted-defect discipline for this task and Task 9:** Plan 2's fixture format (`{name, workflowDef, priorEvents, candidateEvent, expected}` in `packages/rule-engine/fixtures/`) is for *rule-engine* rules — refusals a workflow declares. Permission refusals are PRE-engine and never involve a workflowDef, so they do NOT go into that fixture directory. Their planted defects are ordinary Vitest tests in `apps/server` that construct the defective scenario (the wrong actor, the insufficient role) and assert the exact Refusal object. Same discipline, different harness — do not hunt for a fixtures folder.

- [ ] **Step 1: Write the failing planted-defect tests**

```ts
// apps/server/test/permissions/check-role-permission.test.ts
import { describe, expect, it } from 'vitest';
import { ulid } from 'ulidx';
import { membershipId, type EventEnvelope } from '@gisik-nokma/domain';
import type { EffectiveRole } from '../../src/permissions/effective-role';
import { checkRolePermission } from '../../src/permissions/check-permission';
import { testEnvelope } from '../helpers/envelope';

const WS = 'wks_01';

function eff(
  workspaceRole: EffectiveRole['workspaceRole'],
  projects: Array<[string, boolean]> = [],
): EffectiveRole {
  return { workspaceRole, projects: new Map(projects.map(([id, projectAdmin]) => [id, { projectAdmin }])) };
}

function env(overrides: Partial<EventEnvelope> & Pick<EventEnvelope, 'type' | 'entity' | 'payload'>): EventEnvelope {
  return testEnvelope({ workspaceId: WS, actorId: 'usr_actor', ...overrides });
}

describe('checkRolePermission — planted defects', () => {
  it('refuses a claim submitted as another person', () => {
    const e = env({
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: 'tkt_1' },
      payload: {},
      actorId: 'usr_someone_else',
    });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('admin') })).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'You cannot submit a claim as another person.',
    });
  });

  it("refuses a client-submitted event wearing the server's origin", () => {
    const e = env({
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: 'tkt_1' },
      payload: {},
      origin: 'server',
    });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('admin') })).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only the server itself may record server-origin events.',
    });
  });

  it('refuses any claim from a non-member of the workspace', () => {
    const e = env({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: 'tkt_1' }, payload: {} });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff(null) })).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'You are not a member of this workspace.',
    });
  });

  it('allows any signed-in user to found a workspace — there is no membership to hold yet', () => {
    const e = env({ type: 'workspace.created', entity: { kind: 'workspace', id: WS }, payload: { name: 'New' } });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff(null) })).toBeNull();
  });

  it.each(['workflow.defined', 'ticket-type.defined', 'project.created'] as const)(
    'refuses %s from a plain member, names the rule and the role',
    (type) => {
      const entity =
        type === 'workflow.defined'
          ? { kind: 'workflow' as const, id: ulid() }
          : type === 'ticket-type.defined'
            ? { kind: 'ticket-type' as const, id: ulid() }
            : { kind: 'project' as const, id: ulid() };
      const e = env({ type, entity, payload: {} });
      expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('member') })).toEqual({
        refused: true,
        rule: 'permission.role',
        reason: 'Only a workspace owner or admin can do this. Your role is member.',
      });
    },
  );

  it('allows an admin to define workflows', () => {
    const e = env({ type: 'workflow.defined', entity: { kind: 'workflow', id: ulid() }, payload: {} });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('admin') })).toBeNull();
  });

  it('refuses workspace-scope membership grants from below admin', () => {
    const e = env({
      type: 'membership.granted',
      entity: { kind: 'membership', id: membershipId(WS, 'usr_new') },
      payload: { userId: 'usr_new', role: 'member' },
    });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('member') })).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only a workspace owner or admin can manage workspace membership.',
    });
  });

  // A project admin runs their project's roster, not the workspace's door.
  // Before the 2026-08-27 collapse a project-scoped `membership.granted` let
  // them do both through one event; now the two questions have two events.
  it('lets a project admin manage their own project roster and no other', () => {
    const add = (projectId: string) =>
      env({
        type: 'project.member_added',
        entity: { kind: 'project', id: projectId },
        payload: { userId: 'usr_acct', projectAdmin: false },
      });
    const ctx = { sessionUserId: 'usr_actor', eff: eff('member', [['prj_1', true]]) };
    expect(checkRolePermission(add('prj_1'), ctx)).toBeNull();
    expect(checkRolePermission(add('prj_2'), ctx)).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only a project admin can manage who is on this project.',
    });
  });

  it('refuses a project admin who tries to grant workspace membership', () => {
    const e = env({
      type: 'membership.granted',
      entity: { kind: 'membership', id: membershipId(WS, 'usr_acct') },
      payload: { userId: 'usr_acct', role: 'guest' },
    });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('member', [['prj_1', true]]) })).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only a workspace owner or admin can manage workspace membership.',
    });
  });

  it('refuses project roster changes from a plain project member', () => {
    const e = env({
      type: 'project.member_added',
      entity: { kind: 'project', id: 'prj_1' },
      payload: { userId: 'usr_new', projectAdmin: false },
    });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('member', [['prj_1', false]]) })).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only a project admin can manage who is on this project.',
    });
  });

  it('lets ordinary ticket work through — the visibility gate (Task 9) owns the rest', () => {
    const e = env({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: 'tkt_1' }, payload: {} });
    expect(checkRolePermission(e, { sessionUserId: 'usr_actor', eff: eff('member', [['prj_1', false]]) })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `apps/server/`): `pnpm vitest run test/permissions/check-role-permission.test.ts`
Expected: FAIL — cannot resolve `../../src/permissions/check-permission`.

- [ ] **Step 3: Implement the role gate**

```ts
// apps/server/src/permissions/check-permission.ts
import type { EventEnvelope, Refusal } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable';
import { hasProjectAdminRights, resolveEffectiveRole, type EffectiveRole } from './effective-role';

export interface PermissionContext {
  sessionUserId: string;
  eff: EffectiveRole;
}

function refuse(rule: string, reason: string): Refusal {
  return { refused: true, rule, reason };
}

/** Event types only workspace owners/admins may ingest. */
const ADMIN_ONLY_TYPES: ReadonlySet<string> = new Set([
  'workflow.defined',
  'ticket-type.defined',
  'project.created',
  // Migration re-homes work other people are doing: it moves a ticket onto a
  // different workflow, so the states it can reach, the rules guarding them
  // and the board column it appears in all change under whoever is holding it.
  // Ordinary ticket edits are a member's business; this is not (coordination
  // doc, "a ticket's workflow is pinned at creation, and moved only
  // deliberately"). Plan 3 owns the event and its structural refusals; the
  // question of who may emit it is this plan's.
  'ticket.workflow_rebound',
]);

/**
 * Pure pre-engine role checks. Runs before evaluateEvent so a
 * permission refusal never reaches the rule engine — permissions are
 * the system's rules, not a workflow's.
 */
export function checkRolePermission(env: EventEnvelope, ctx: PermissionContext): Refusal | null {
  if (env.actorId !== ctx.sessionUserId) {
    return refuse('permission.role', 'You cannot submit a claim as another person.');
  }
  if (env.origin === 'server') {
    return refuse('permission.role', 'Only the server itself may record server-origin events.');
  }
  if (env.type === 'workspace.created') {
    return null; // founding a workspace needs a session, not a membership
  }
  const role = ctx.eff.workspaceRole;
  if (role === null) {
    return refuse('permission.role', 'You are not a member of this workspace.');
  }
  if (ADMIN_ONLY_TYPES.has(env.type) && role !== 'owner' && role !== 'admin') {
    return refuse('permission.role', `Only a workspace owner or admin can do this. Your role is ${role}.`);
  }
  // Membership is workspace-scoped only now, so this is one question rather
  // than a branch on scope: managing who is in the workspace is an owner/admin
  // matter. Who is on a PROJECT is the next check, gated by project admin.
  if (env.type === 'membership.granted' || env.type === 'membership.revoked') {
    if (role !== 'owner' && role !== 'admin') {
      return refuse('permission.role', 'Only a workspace owner or admin can manage workspace membership.');
    }
  }
  if (env.type === 'project.member_added' || env.type === 'project.member_removed') {
    if (!hasProjectAdminRights(ctx.eff, env.entity.id)) {
      return refuse('permission.role', 'Only a project admin can manage who is on this project.');
    }
  }
  return null;
}

/**
 * The single permission gate the ingest pipeline calls. Task 9 extends
 * this with the visibility-dependent checks.
 */
export async function checkPermission(
  db: Queryable,
  env: EventEnvelope,
  sessionUserId: string,
): Promise<Refusal | null> {
  const eff = await resolveEffectiveRole(db, sessionUserId, env.workspaceId);
  const ctx: PermissionContext = { sessionUserId, eff };
  return checkRolePermission(env, ctx);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/server/`): `pnpm vitest run test/permissions/check-role-permission.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Wire the gate into the ingest pipeline**

In Plan 1's `apps/server/src/ingest/pipeline.ts`, at the point where the envelope has passed `parseEvent` and is about to be evaluated, insert the gate. The surrounding lines below are illustrative of Plan 1's pipeline; the inserted block is exact:

```ts
import { checkPermission } from '../permissions/check-permission';

// ... envelope parsed, seq not yet assigned, about to call evaluateEvent ...

const permissionRefusal = await checkPermission(db, env, sessionUserId);
if (permissionRefusal) {
  return permissionRefusal; // surfaces exactly like an engine refusal — same shape, same path
}

const engineResult = evaluateEvent(env, ctx);
```

`sessionUserId` comes from `request.currentUserId` (Task 2's `makeRequireSession`), which the ingest route must now use as a preHandler if Plan 1 left it open. A permission refusal returns through the same response path Plan 1 uses for engine refusals — one refusal surface, one shape.

- [ ] **Step 6: The founding sequence — a new workspace can hold a ticket the moment it exists**

Founding a workspace must leave its founder owning it, or nobody can ever act again. It must also leave the workspace **able to accept its first ticket**, and until the owner decision of 2026-08-26 it did not: nothing in the series emitted a workflow or the built-in ticket types at creation, so the first `ticket.created` in a product-founded workspace was refused `ticket.unknown-type` and the workspace was permanently unusable. **Owner decision (coordination doc, "A new workspace can hold a ticket the moment it exists"): found every workspace with the simple-Kanban template, bound to all four built-in types, changeable immediately afterwards.** The founder is not asked to choose a template — a workspace that cannot accept its first ticket is not a workspace — and nothing about this is permanent: the very next thing an admin may do is publish another workflow and re-point the types (Plan 8's builder), which is ordinary authoring, not an undo.

Three things are load-bearing and an executor must not rearrange them:

1. **The order is workflow → types → grant.** A `ticket-type.defined` naming a workflow that has not been defined yet is refused (coordination doc, same section), so the four type definitions can only follow the `workflow.defined` that gives them something to name. The founder's grant stays last, exactly where it already was. This is safe because the bootstrap appends are server-origin and go through Plan 1's internal append path, **not** through `checkPermission` — the gate is the HTTP door (Step 5), and the server's own record does not knock on it. Nothing in the sequence depends on the founder already being a member.
2. **The bootstrap fires on accept, never on duplicate.** Both of Plan 11's seed CLIs are idempotent by re-submitting the same deterministic `workspace.created` id and counting `duplicate-event-id` as "already present". If the bootstrap fired again on that duplicate, every re-run would append a second workflow and four more type definitions, and Plan 11's "re-run is a no-op" test would be a lie. Hook it to the branch where the append actually happened.
3. **The hook lives in the shared ingest path, not in the route.** `POST /v1/workspaces` (Task 13) and Plan 11's seed CLIs both found workspaces, and they have exactly one founding sequence between them because both go through the ingest service. An executor who puts this in the route layer silently breaks the seeds.

First, the canonical definition gets **one home**. Create `packages/domain/src/workflows/simple-kanban.ts`:

```ts
import type { WorkflowDef } from '../workflows/types.js'; // adapt to Plan 2's WorkflowDef module path

/**
 * The one simple-Kanban definition in the product. Every workspace is founded
 * on a clone of it (Plan 4's bootstrap), and it is the first card in Plan 8's
 * template gallery — the SAME object, not a copy that looks like it. Two
 * copies of one workflow is the drift this series keeps finding, and a
 * bootstrap default that quietly diverged from the gallery card an admin
 * later picks would be invisible until someone compared them by hand.
 *
 * Carries no `id` and no `version`: an id is minted per workspace, and every
 * clone starts at version 1 (spec §4 — templates are cloned, never referenced).
 */
export const SIMPLE_KANBAN_TEMPLATE: Omit<WorkflowDef, 'id' | 'version'> = {
  name: 'Simple kanban',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'todo', rules: [] },
    { from: 'doing', to: 'done', rules: [] },
    { from: 'done', to: 'doing', rules: [] },
  ],
};

/** A publishable clone at version 1. Deep-cloned, so an edited copy can never bleed back. */
export function simpleKanbanWorkflowDef(workflowId: string): WorkflowDef {
  return { ...structuredClone(SIMPLE_KANBAN_TEMPLATE), id: workflowId, version: 1 };
}
```

Export both from the domain barrel. Create `packages/domain/test/workflows/simple-kanban.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateWorkflowDef } from '../../src/workflows/validate.js'; // adapt to Plan 2's path
import { SIMPLE_KANBAN_TEMPLATE, simpleKanbanWorkflowDef } from '../../src/workflows/simple-kanban.js';

describe('the canonical simple-Kanban definition', () => {
  it('clones into a def that validates clean at version 1', () => {
    const def = simpleKanbanWorkflowDef('01JBOOTSTRAPWORKFLOW000001');
    expect(validateWorkflowDef(def)).toEqual([]);
    expect(def.version).toBe(1);
    expect(def.id).toBe('01JBOOTSTRAPWORKFLOW000001');
    expect(def.initialStateId).toBe('todo');
    expect(def.states.some((state) => state.category === 'terminal')).toBe(true);
  });

  it('is deep-cloned — editing a clone never reaches the template', () => {
    const first = simpleKanbanWorkflowDef('01JBOOTSTRAPWORKFLOW000001');
    first.states[0]!.name = 'Mutated';
    expect(SIMPLE_KANBAN_TEMPLATE.states[0]!.name).toBe('To do');
    expect(simpleKanbanWorkflowDef('01JBOOTSTRAPWORKFLOW000002').states[0]!.name).toBe('To do');
  });
});
```

Then the bootstrap itself. Create `apps/server/src/workspaces/bootstrap-workspace.ts`:

```ts
import { ulid } from 'ulidx';
import {
  builtinTicketTypeDefs,
  membershipId,
  simpleKanbanWorkflowDef,
  type EventEnvelope,
} from '@gisik-nokma/domain';

/**
 * Everything a workspace needs to be usable, appended immediately after its
 * `workspace.created` is accepted (owner decision 2026-08-26).
 *
 * ORDER IS LOAD-BEARING: the default workflow first, then the four built-in
 * ticket types that name it, then the founder's owner grant. A
 * `ticket-type.defined` naming an undefined workflow is refused, so the
 * sequence cannot be reordered for tidiness.
 *
 * These are the SERVER's own records: they are appended through Plan 1's
 * internal append path and never pass through `checkPermission`, which is the
 * HTTP door. That is why the grant can come last without the earlier events
 * needing the founder to already be a member.
 */
export async function bootstrapWorkspace(
  founding: EventEnvelope,
  append: (env: EventEnvelope) => Promise<void>,
): Promise<EventEnvelope[]> {
  const workflowDef = simpleKanbanWorkflowDef(ulid());
  const at = founding.serverTime;
  const serverEvent = (
    entity: EventEnvelope['entity'],
    type: string,
    payload: unknown,
  ): EventEnvelope => ({
    id: ulid(),
    workspaceId: founding.workspaceId,
    entity,
    type,
    version: 1,
    payload,
    actorId: founding.actorId,
    origin: 'server',
    clientTime: at,
    serverTime: at,
    seq: 0, // assigned by the same seq-assignment step Plan 1 applies to every appended event
  });

  const sequence: EventEnvelope[] = [
    serverEvent({ kind: 'workflow', id: workflowDef.id }, 'workflow.defined', workflowDef),
    // Fresh entity ULID per ticket-type submission; the payload id is the
    // stable type key and the projection folds by it (Plan 8 design decision 6).
    ...builtinTicketTypeDefs(workflowDef.id).map((def) =>
      serverEvent({ kind: 'ticket-type', id: ulid() }, 'ticket-type.defined', def),
    ),
    serverEvent(
      { kind: 'membership', id: membershipId(founding.workspaceId, founding.actorId) },
      'membership.granted',
      { userId: founding.actorId, role: 'owner' },
    ),
  ];

  for (const event of sequence) {
    await append(event); // Plan 1's internal append path — adapt the name
  }
  return sequence;
}
```

Wire it into the ingest pipeline, on the accepted-and-appended branch only:

```ts
import { bootstrapWorkspace } from '../workspaces/bootstrap-workspace';

// after workspace.created is accepted and appended — NOT on duplicate-event-id,
// which is how both seed CLIs re-run without founding a second time:
if (env.type === 'workspace.created') {
  await bootstrapWorkspace(env, appendAndProject); // Plan 1's internal append path — adapt the name
}
```

Add to `apps/server/test/permissions/check-role-permission.test.ts` an integration test through the pipeline's exported ingest function (adapt the import to Plan 1's actual export):

```ts
import { afterAll, beforeAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { ingestEvent } from '../../src/ingest/pipeline'; // adapt to Plan 1's export
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';

describe('ingest pipeline wiring', () => {
  let pool: Pool;
  beforeAll(() => {
    migrateTestDb();
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('workspace.created leaves its founder as owner in proj_memberships', async () => {
    const e = testEnvelope({
      workspaceId: 'wks_new',
      entity: { kind: 'workspace', id: 'wks_new' },
      type: 'workspace.created',
      payload: { name: 'Founded' },
      actorId: 'usr_founder',
    });
    const result = await ingestEvent(e, { db: pool, sessionUserId: 'usr_founder' });
    expect(result).not.toMatchObject({ refused: true });
    const { rows } = await pool.query(
      "SELECT role FROM proj_memberships WHERE workspace_id = 'wks_new' AND user_id = 'usr_founder' AND scope_kind = 'workspace'",
    );
    expect(rows).toEqual([{ role: 'owner' }]);
  });

  it('founding appends the default workflow, then the four built-in types, then the grant — in that order', async () => {
    const e = testEnvelope({
      workspaceId: 'wks_new',
      entity: { kind: 'workspace', id: 'wks_new' },
      type: 'workspace.created',
      payload: { name: 'Founded' },
      actorId: 'usr_founder',
    });
    await ingestEvent(e, { db: pool, sessionUserId: 'usr_founder' });

    // Ordered by the WORKSPACE cursor, not per-entity `seq` (coordination §18):
    // this sequence spans four entity kinds, so per-entity seq cannot order it.
    const { rows } = await pool.query<{ type: string; payload: Record<string, unknown> }>(
      `SELECT type, payload FROM events WHERE workspace_id = 'wks_new' ORDER BY workspace_seq`,
    );
    expect(rows.map((row) => row.type)).toEqual([
      'workspace.created',
      'workflow.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'membership.granted',
    ]);
    // Every type names the workflow defined one event earlier — the reason the
    // order cannot be rearranged.
    const workflowId = rows[1]!.payload.id as string;
    expect(rows.slice(2, 6).map((row) => row.payload.id)).toEqual(['epic', 'story', 'task', 'sub-task']);
    for (const row of rows.slice(2, 6)) {
      expect(row.payload.workflowId).toBe(workflowId);
    }
    // The default IS the canonical template, not a copy that resembles it.
    const { id: _id, version, ...shape } = rows[1]!.payload as Record<string, unknown> & { id: string; version: number };
    expect(version).toBe(1);
    expect(shape).toEqual(SIMPLE_KANBAN_TEMPLATE);
  });

  it('a workspace can hold a ticket the moment it exists', async () => {
    const founded = await ingestEvent(
      testEnvelope({
        workspaceId: 'wks_new',
        entity: { kind: 'workspace', id: 'wks_new' },
        type: 'workspace.created',
        payload: { name: 'Founded' },
        actorId: 'usr_founder',
      }),
      { db: pool, sessionUserId: 'usr_founder' },
    );
    expect(founded).not.toMatchObject({ refused: true });

    // A project, and the founder onto its roster — Task 9's ingest rule is that
    // a non-guest must be ON the target project, with no admin shortcut. This
    // is the whole legal path from nothing to a first ticket.
    for (const env of [
      testEnvelope({
        workspaceId: 'wks_new',
        entity: { kind: 'project', id: 'prj_first' },
        type: 'project.created',
        payload: { name: 'First project' },
        actorId: 'usr_founder',
      }),
      testEnvelope({
        workspaceId: 'wks_new',
        entity: { kind: 'project', id: 'prj_first' },
        type: 'project.member_added',
        payload: { userId: 'usr_founder', projectAdmin: true },
        actorId: 'usr_founder',
      }),
    ]) {
      expect(await ingestEvent(env, { db: pool, sessionUserId: 'usr_founder' })).not.toMatchObject({ refused: true });
    }

    // The point of the whole decision: this is accepted, where before the
    // bootstrap it was refused `ticket.unknown-type` and the workspace was
    // permanently unusable.
    const created = await ingestEvent(
      testEnvelope({
        workspaceId: 'wks_new',
        entity: { kind: 'ticket', id: 'tkt_first' },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: 'prj_first', parentId: null, title: 'The first thing' },
        actorId: 'usr_founder',
      }),
      { db: pool, sessionUserId: 'usr_founder' },
    );
    expect(created).not.toMatchObject({ refused: true });
    const { rows } = await pool.query("SELECT state_id FROM proj_tickets WHERE ticket_id = 'tkt_first'");
    expect(rows).toEqual([{ state_id: 'todo' }]); // the default workflow's initial state
  });

  it('re-founding with the same event id does not bootstrap a second time', async () => {
    const founding = testEnvelope({
      workspaceId: 'wks_new',
      entity: { kind: 'workspace', id: 'wks_new' },
      type: 'workspace.created',
      payload: { name: 'Founded' },
      actorId: 'usr_founder',
    });
    await ingestEvent(founding, { db: pool, sessionUserId: 'usr_founder' });
    const after = await pool.query("SELECT count(*)::int AS n FROM events WHERE workspace_id = 'wks_new'");

    // Both of Plan 11's seed CLIs re-run by re-submitting the same deterministic
    // event id and counting `duplicate-event-id` as "already present". If the
    // bootstrap fired again here, every re-run would append a second workflow
    // and four more type definitions.
    const again = await ingestEvent(founding, { db: pool, sessionUserId: 'usr_founder' });
    expect(again).toMatchObject({ status: 'invalid', code: 'duplicate-event-id' }); // adapt to Plan 1's result shape
    const now = await pool.query("SELECT count(*)::int AS n FROM events WHERE workspace_id = 'wks_new'");
    expect(now.rows[0].n).toBe(after.rows[0].n);
  });

  it('a member ingesting workflow.defined is refused before the engine runs', async () => {
    await projMemberships.apply(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'membership', id: membershipId(WS, 'usr_m') },
        type: 'membership.granted',
        payload: { userId: 'usr_m', role: 'member' },
        actorId: 'usr_admin',
      }),
      pool,
    );
    const e = testEnvelope({
      workspaceId: WS,
      entity: { kind: 'workflow', id: ulid() },
      type: 'workflow.defined',
      payload: {},
      actorId: 'usr_m',
    });
    const result = await ingestEvent(e, { db: pool, sessionUserId: 'usr_m' });
    expect(result).toMatchObject({ refused: true, rule: 'permission.role' });
  });
});
```

(Add the imports the snippet needs — `projMemberships` from Task 4, `SIMPLE_KANBAN_TEMPLATE` from `@gisik-nokma/domain` — to the file's import block. The `ingestEvent` call signature and its duplicate-result shape adapt to Plan 1's actual export; the assertions do not.)

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/workflows/simple-kanban.test.ts` — PASS (2 tests). Then (from `apps/server/`) `pnpm vitest run test/permissions/check-role-permission.test.ts` — PASS.

- [ ] **Step 7: Run the full server suite**

Run (from `apps/server/`): `pnpm vitest run`
Expected: PASS — including Plan 1's ingest tests, proving the gate refuses nothing it should not.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/workflows/simple-kanban.ts packages/domain/test/workflows \
  apps/server/src/permissions/check-permission.ts apps/server/src/workspaces apps/server/src/ingest apps/server/test/permissions
git commit -m "Under-privileged claims are refused before the rule engine sees them: identity spoofing, borrowed server origin, and role shortfalls all get the rule named and the reason in plain language — and a founded workspace now arrives usable, with the simple-Kanban default and its four built-in types appended before the founder's own grant."
```

---

### Task 6: proj_visibility — every ticket's resolved audience

**Files:**
- Create: `apps/server/migrations/<ts>_proj-visibility.cjs`
- Create: `apps/server/src/projections/proj-visibility.ts`
- Modify: `apps/server/src/projections/index.ts` (register `projVisibility`)
- Test: `apps/server/test/projections/proj-visibility.test.ts`

**Interfaces:**
- Consumes: `VisibilitySetPayload` (Task 3); Plan 3's `ticket.created` (payload carries `projectId` and optional `parentId` — proj_tickets tracks parentId, so the event must carry it; adapt field names to Plan 3's actual payload) and `ticket.reparented` (payload `{parentId: string | null}`); Plan 1's `registerProjection`.
- Produces: table `proj_visibility`; projection object `projVisibility = { name: 'proj_visibility', apply(env, db), reset(db) }`; `reResolveSubtree(db: Queryable, ticketId: string): Promise<void>` (exported for tests). Columns later tasks read: `ticket_id, workspace_id, project_id, parent_id, own_mode, own_user_ids, resolved_mode, resolved_user_ids, resolved_from`.

**The resolution algorithm (exact — this is the heart of visibility):**

A ticket has an *authored* mode (`own_mode`: what `visibility.set` last claimed, `'inherit'` if never set) and a *resolved* mode (`resolved_mode`: the audience that actually applies — never `'inherit'`).

```
resolve(t):
  if own_mode(t) ≠ 'inherit':
      resolved(t) = (own_mode(t), own_user_ids(t)), resolved_from(t) = t
  else if t has a parent:
      resolved(t) = resolved(parent), resolved_from(t) = resolved_from(parent)
  else:  # a root with no authored mode
      resolved(t) = ('project', []), resolved_from(t) = ''      # workspace default for roots
```

**Re-resolution** happens on exactly three events, and always as `resolve(t)` followed by recursion into children whose `own_mode = 'inherit'`, pruning at any child with an authored mode (an authored subtree cannot be affected by anything above it):

- `ticket.created` — insert the row (`own_mode 'inherit'`), then `resolve(t)`. A new ticket has no children, so no recursion.
- `ticket.reparented` — update `parent_id`, then re-resolve t's inherit-subtree: the ticket now inherits from a different chain, and everything inheriting *from it* follows.
- `visibility.set` — update `own_mode`/`own_user_ids`, then re-resolve t's inherit-subtree: an ancestor's visibility change reaches every descendant that inherits, and stops dead at the first authored descendant.

Events arrive in ledger order, so a parent's row always exists (and is resolved) before any child references it; a missing parent is treated defensively as a root.

- [ ] **Step 1: Create the migration**

Run (from `apps/server/`): `pnpm exec node-pg-migrate create proj-visibility`, then:

```js
// apps/server/migrations/<ts>_proj-visibility.cjs
/**
 * Projection: each ticket's authored visibility mode and its RESOLVED
 * audience (inherit chains walked, never 'inherit'). resolved_from is
 * the ticket whose authored mode won ('' = project default for roots).
 * The audience is stored as a mode + optional user list, NOT a flattened
 * per-user table — membership changes then never force re-materialization;
 * canSee joins mode against proj_memberships at read time.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE proj_visibility (
      ticket_id         text PRIMARY KEY,
      workspace_id      text NOT NULL,
      project_id        text NOT NULL,
      parent_id         text,
      own_mode          text NOT NULL DEFAULT 'inherit'
                        CHECK (own_mode IN ('workspace', 'project', 'explicit', 'inherit')),
      own_user_ids      text[] NOT NULL DEFAULT '{}',
      resolved_mode     text NOT NULL
                        CHECK (resolved_mode IN ('workspace', 'project', 'explicit')),
      resolved_user_ids text[] NOT NULL DEFAULT '{}',
      resolved_from     text NOT NULL DEFAULT '',
      seq               bigint NOT NULL
    );
    CREATE INDEX proj_visibility_children ON proj_visibility (parent_id);
    CREATE INDEX proj_visibility_by_workspace ON proj_visibility (workspace_id);
    CREATE INDEX proj_visibility_by_project ON proj_visibility (workspace_id, project_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE proj_visibility;');
};
```

- [ ] **Step 2: Write the failing resolution tests**

```ts
// apps/server/test/projections/proj-visibility.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { projVisibility } from '../../src/projections/proj-visibility';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { testEnvelope } from '../helpers/envelope';

let pool: Pool;
const WS = 'wks_01';
const PRJ = 'prj_01';

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

function created(ticketId: string, parentId?: string) {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { projectId: PRJ, ...(parentId ? { parentId } : {}) },
    actorId: 'usr_1',
  });
}

function setVis(ticketId: string, mode: string, userIds?: string[]) {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'visibility.set',
    payload: { ticketId, mode, ...(userIds ? { userIds } : {}) },
    actorId: 'usr_1',
  });
}

function reparented(ticketId: string, parentId: string | null) {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.reparented',
    payload: { parentId },
    actorId: 'usr_1',
  });
}

async function resolved(ticketId: string) {
  const { rows } = await pool.query(
    'SELECT own_mode, resolved_mode, resolved_user_ids, resolved_from FROM proj_visibility WHERE ticket_id = $1',
    [ticketId],
  );
  return rows[0];
}

async function apply(...envs: ReturnType<typeof testEnvelope>[]) {
  for (const env of envs) await projVisibility.apply(env, pool);
}

describe('proj_visibility resolution', () => {
  it("a root with no authored mode resolves to the workspace default: 'project'", async () => {
    await apply(created('tkt_root'));
    expect(await resolved('tkt_root')).toEqual({
      own_mode: 'inherit',
      resolved_mode: 'project',
      resolved_user_ids: [],
      resolved_from: '',
    });
  });

  it('a child inherits its parent’s resolved audience through the chain', async () => {
    await apply(created('tkt_p'), setVis('tkt_p', 'explicit', ['usr_a']), created('tkt_c', 'tkt_p'), created('tkt_g', 'tkt_c'));
    expect(await resolved('tkt_g')).toEqual({
      own_mode: 'inherit',
      resolved_mode: 'explicit',
      resolved_user_ids: ['usr_a'],
      resolved_from: 'tkt_p',
    });
  });

  it('an ancestor visibility change re-resolves every inheriting descendant', async () => {
    await apply(created('tkt_p'), created('tkt_c', 'tkt_p'), created('tkt_g', 'tkt_c'));
    await apply(setVis('tkt_p', 'workspace'));
    expect((await resolved('tkt_c')).resolved_mode).toBe('workspace');
    expect((await resolved('tkt_g')).resolved_mode).toBe('workspace');
  });

  it('re-resolution prunes at an authored descendant — an authored subtree cannot be reached from above', async () => {
    await apply(created('tkt_p'), created('tkt_c', 'tkt_p'), created('tkt_g', 'tkt_c'));
    await apply(setVis('tkt_c', 'explicit', ['usr_b']));
    await apply(setVis('tkt_p', 'workspace'));
    expect(await resolved('tkt_c')).toMatchObject({ resolved_mode: 'explicit', resolved_user_ids: ['usr_b'], resolved_from: 'tkt_c' });
    expect(await resolved('tkt_g')).toMatchObject({ resolved_mode: 'explicit', resolved_user_ids: ['usr_b'], resolved_from: 'tkt_c' });
  });

  it('reparenting re-resolves the moved subtree against its new chain', async () => {
    await apply(
      created('tkt_a'), setVis('tkt_a', 'workspace'),
      created('tkt_b'), setVis('tkt_b', 'explicit', ['usr_c']),
      created('tkt_child', 'tkt_a'),
    );
    expect((await resolved('tkt_child')).resolved_mode).toBe('workspace');
    await apply(reparented('tkt_child', 'tkt_b'));
    expect(await resolved('tkt_child')).toMatchObject({
      resolved_mode: 'explicit',
      resolved_user_ids: ['usr_c'],
      resolved_from: 'tkt_b',
    });
  });

  it('reparenting to root falls back to the project default', async () => {
    await apply(created('tkt_a'), setVis('tkt_a', 'workspace'), created('tkt_child', 'tkt_a'));
    await apply(reparented('tkt_child', null));
    expect(await resolved('tkt_child')).toMatchObject({ resolved_mode: 'project', resolved_from: '' });
  });

  it("setting a ticket back to 'inherit' re-attaches it to its chain", async () => {
    await apply(created('tkt_p'), setVis('tkt_p', 'workspace'), created('tkt_c', 'tkt_p'));
    await apply(setVis('tkt_c', 'explicit', ['usr_d']));
    expect((await resolved('tkt_c')).resolved_mode).toBe('explicit');
    await apply(setVis('tkt_c', 'inherit'));
    expect(await resolved('tkt_c')).toMatchObject({ resolved_mode: 'workspace', resolved_from: 'tkt_p' });
  });

  it('rebuilds deterministically: reset + replay reproduces every row', async () => {
    const events = [
      created('tkt_p'),
      created('tkt_c', 'tkt_p'),
      setVis('tkt_p', 'explicit', ['usr_a']),
      created('tkt_g', 'tkt_c'),
      setVis('tkt_c', 'project'),
      reparented('tkt_g', 'tkt_p'),
      setVis('tkt_p', 'workspace'),
    ];
    for (const env of events) await projVisibility.apply(env, pool);
    const snapshot = await pool.query('SELECT * FROM proj_visibility ORDER BY ticket_id');
    await projVisibility.reset(pool);
    for (const env of events) await projVisibility.apply(env, pool);
    const rebuilt = await pool.query('SELECT * FROM proj_visibility ORDER BY ticket_id');
    expect(rebuilt.rows).toEqual(snapshot.rows);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run (from `apps/server/`):
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/gisik_nokma_test pnpm exec node-pg-migrate up
pnpm vitest run test/projections/proj-visibility.test.ts
```
Expected: FAIL — cannot resolve `../../src/projections/proj-visibility`.

- [ ] **Step 4: Implement the projection**

```ts
// apps/server/src/projections/proj-visibility.ts
import type { EventEnvelope, VisibilitySetPayload } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable';

interface VisibilityRow {
  ticket_id: string;
  parent_id: string | null;
  own_mode: 'workspace' | 'project' | 'explicit' | 'inherit';
  own_user_ids: string[];
  resolved_mode: 'workspace' | 'project' | 'explicit';
  resolved_user_ids: string[];
  resolved_from: string;
}

async function getRow(db: Queryable, ticketId: string): Promise<VisibilityRow | null> {
  const { rows } = await db.query(
    `SELECT ticket_id, parent_id, own_mode, own_user_ids, resolved_mode, resolved_user_ids, resolved_from
     FROM proj_visibility WHERE ticket_id = $1`,
    [ticketId],
  );
  return (rows[0] as VisibilityRow | undefined) ?? null;
}

/** resolve(t) from the plan: own mode wins; else parent's resolution; else project default. */
async function resolveOne(db: Queryable, ticketId: string): Promise<void> {
  const row = await getRow(db, ticketId);
  if (!row) return;
  let resolvedMode: string;
  let resolvedUserIds: string[];
  let resolvedFrom: string;
  if (row.own_mode !== 'inherit') {
    resolvedMode = row.own_mode;
    resolvedUserIds = row.own_mode === 'explicit' ? row.own_user_ids : [];
    resolvedFrom = row.ticket_id;
  } else {
    const parent = row.parent_id ? await getRow(db, row.parent_id) : null;
    if (parent) {
      resolvedMode = parent.resolved_mode;
      resolvedUserIds = parent.resolved_user_ids;
      resolvedFrom = parent.resolved_from;
    } else {
      resolvedMode = 'project'; // the workspace default for roots
      resolvedUserIds = [];
      resolvedFrom = '';
    }
  }
  await db.query(
    `UPDATE proj_visibility
     SET resolved_mode = $2, resolved_user_ids = $3, resolved_from = $4
     WHERE ticket_id = $1`,
    [ticketId, resolvedMode, resolvedUserIds, resolvedFrom],
  );
}

/**
 * Re-resolve ticketId and every descendant that inherits, pruning at any
 * child with an authored mode: nothing above an authored node can change
 * what that node's subtree resolves to.
 */
export async function reResolveSubtree(db: Queryable, ticketId: string): Promise<void> {
  await resolveOne(db, ticketId);
  const { rows } = await db.query(
    'SELECT ticket_id, own_mode FROM proj_visibility WHERE parent_id = $1 ORDER BY ticket_id',
    [ticketId],
  );
  for (const child of rows as Array<{ ticket_id: string; own_mode: string }>) {
    if (child.own_mode === 'inherit') await reResolveSubtree(db, child.ticket_id);
  }
}

export const projVisibility = {
  name: 'proj_visibility',

  async apply(env: EventEnvelope, db: Queryable): Promise<void> {
    switch (env.type) {
      case 'ticket.created': {
        const p = env.payload as { projectId: string; parentId?: string };
        await db.query(
          `INSERT INTO proj_visibility
             (ticket_id, workspace_id, project_id, parent_id, own_mode, own_user_ids,
              resolved_mode, resolved_user_ids, resolved_from, seq)
           VALUES ($1, $2, $3, $4, 'inherit', '{}', 'project', '{}', '', $5)
           ON CONFLICT (ticket_id) DO NOTHING`,
          [env.entity.id, env.workspaceId, p.projectId, p.parentId ?? null, env.seq],
        );
        await resolveOne(db, env.entity.id); // a fresh ticket has no children yet
        return;
      }
      case 'ticket.reparented': {
        const p = env.payload as { parentId: string | null };
        await db.query('UPDATE proj_visibility SET parent_id = $2, seq = $3 WHERE ticket_id = $1', [
          env.entity.id, p.parentId, env.seq,
        ]);
        await reResolveSubtree(db, env.entity.id);
        return;
      }
      case 'visibility.set': {
        const p = env.payload as VisibilitySetPayload;
        await db.query(
          'UPDATE proj_visibility SET own_mode = $2, own_user_ids = $3, seq = $4 WHERE ticket_id = $1',
          [p.ticketId, p.mode, p.userIds ?? [], env.seq],
        );
        await reResolveSubtree(db, p.ticketId);
        return;
      }
      default:
        return;
    }
  },

  async reset(db: Queryable): Promise<void> {
    await db.query('TRUNCATE proj_visibility');
  },
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `apps/server/`): `pnpm vitest run test/projections/proj-visibility.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Register the projection and run everything**

In `apps/server/src/projections/index.ts`:

```ts
import { projVisibility } from './proj-visibility';

registerProjection(projVisibility);
```

Run (from `apps/server/`): `pnpm vitest run`
Expected: PASS — full suite, verify-projections aware of proj_visibility.

- [ ] **Step 7: Commit**

```bash
git add apps/server/migrations apps/server/src/projections apps/server/test/projections/proj-visibility.test.ts
git commit -m "proj_visibility resolves every ticket's audience: authored modes win, inherit chains walk to the nearest authored ancestor, roots default to project, and re-resolution on reparent or ancestor change stops dead at the first authored descendant."
```

---

### Task 7: canSee — the one visibility decision

**Files:**
- Create: `apps/server/src/visibility/can-see.ts`
- Create: `apps/server/src/visibility/visible-tickets.ts`
- Create: `apps/server/test/helpers/seed.ts`
- Test: `apps/server/test/visibility/can-see.test.ts`
- Test: `apps/server/test/visibility/visible-tickets.test.ts`

**Interfaces:**
- Consumes: `proj_visibility` (Task 6), `resolveEffectiveRole`/`EffectiveRole` (Task 4), `proj_tickets` (Plan 3).
- Produces: `ResolvedVisibility { workspaceId: string; projectId: string; resolvedMode: 'workspace'|'project'|'explicit'; resolvedUserIds: string[] }`; `canSeeResolved(eff: EffectiveRole, userId: string, v: ResolvedVisibility): boolean` (pure — the decision every other function defers to); `getResolvedVisibility(db: Queryable, ticketId: string): Promise<ResolvedVisibility | null>`; `canSee(db: Queryable, userId: string, ticketId: string): Promise<boolean>`; `listVisibleTickets(db: Queryable, userId: string, workspaceId: string): Promise<Array<Record<string, unknown>>>`; seed helpers `seedMember`, `seedGuest`, `seedTicket`.

**The decision table (exact — `canSeeResolved` implements precisely this):**

| viewer's workspace role | resolved_mode 'workspace' | 'project' | 'explicit' |
|---|---|---|---|
| null (non-member) | no | no | no |
| guest | **no** | **no** | only if listed |
| member / admin / owner | yes | only if on the project | only if listed |

Guests see ONLY tickets explicitly shared with them (spec §6) — a guest belongs to the workspace and to no project (the 2026-08-27 membership collapse), so there is no project attachment to even ask about. The **owner** reads everything in the workspace (owner decision 2026-08-27) — a disclosed power, not a hidden one; the visibility controls say so wherever they are built. **Admins** get no bypass: an admin not on a project does not see its project-mode tickets, and an unlisted admin does not see explicit-mode tickets (Open questions). The `explicit` list is exactly the authored list — creator and assignee are not implicitly appended; locking yourself out is a legal (attributed) claim, and the client warns before it is made.

- [ ] **Step 1: Write the scenario seed helpers**

```ts
// apps/server/test/helpers/seed.ts
import { membershipId, type EventEnvelope } from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable';
import { projMemberships } from '../../src/projections/proj-memberships';
import { projVisibility } from '../../src/projections/proj-visibility';
import { testEnvelope } from './envelope';

/** Apply one envelope to both of this plan's projections. */
export async function applyAll(db: Queryable, envs: EventEnvelope[]): Promise<void> {
  for (const env of envs) {
    await projMemberships.apply(env, db);
    await projVisibility.apply(env, db);
  }
}

export async function seedMember(
  db: Queryable,
  workspaceId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
  projects: Array<{ projectId: string; projectAdmin?: boolean }> = [],
): Promise<void> {
  const envs: EventEnvelope[] = [
    testEnvelope({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.granted',
      payload: { userId, role },
      actorId: 'usr_seed_admin',
    }),
    ...projects.map((p) =>
      testEnvelope({
        workspaceId,
        entity: { kind: 'project', id: p.projectId },
        type: 'project.member_added',
        payload: { userId, projectAdmin: p.projectAdmin ?? false },
        actorId: 'usr_seed_admin',
      }),
    ),
  ];
  await applyAll(db, envs);
}

/**
 * A guest belongs to the workspace and to no project — the `projectId`
 * parameter is gone rather than ignored, because a caller passing one would be
 * expressing an association this vocabulary no longer has. What a guest can
 * reach comes from `visibility.set` explicit lists on individual tickets.
 */
export async function seedGuest(db: Queryable, workspaceId: string, userId: string): Promise<void> {
  await applyAll(db, [
    testEnvelope({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.granted',
      payload: { userId, role: 'guest' },
      actorId: 'usr_seed_admin',
    }),
  ]);
}

export interface SeedTicketArgs {
  workspaceId: string;
  projectId: string;
  ticketId: string;
  parentId?: string;
  title?: string;
  createdBy?: string;
}

/**
 * Creates the ticket in proj_visibility (via the real event) and inserts
 * the matching proj_tickets head row directly — the minimal columns this
 * plan's reads touch. If Plan 3's proj_tickets carries more NOT NULL
 * columns, extend the INSERT with their values; do not change what the
 * tests assert.
 */
export async function seedTicket(db: Queryable, args: SeedTicketArgs): Promise<void> {
  await applyAll(db, [
    testEnvelope({
      workspaceId: args.workspaceId,
      entity: { kind: 'ticket', id: args.ticketId },
      type: 'ticket.created',
      payload: { projectId: args.projectId, ...(args.parentId ? { parentId: args.parentId } : {}) },
      actorId: args.createdBy ?? 'usr_seed_creator',
    }),
  ]);
  await db.query(
    `INSERT INTO proj_tickets (ticket_id, workspace_id, project_id, parent_id, title, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (ticket_id) DO NOTHING`,
    [
      args.ticketId, args.workspaceId, args.projectId, args.parentId ?? null,
      args.title ?? `Ticket ${args.ticketId}`, args.createdBy ?? 'usr_seed_creator',
    ],
  );
}

export function setVisibilityEnv(
  workspaceId: string,
  ticketId: string,
  mode: 'workspace' | 'project' | 'explicit' | 'inherit',
  userIds?: string[],
  actorId = 'usr_seed_admin',
): EventEnvelope {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'visibility.set',
    payload: { ticketId, mode, ...(userIds ? { userIds } : {}) },
    actorId,
  });
}
```

- [ ] **Step 2: Write the failing pure-decision tests**

```ts
// apps/server/test/visibility/can-see.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { EffectiveRole } from '../../src/permissions/effective-role';
import { canSee, canSeeResolved, type ResolvedVisibility } from '../../src/visibility/can-see';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { applyAll, seedGuest, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed';

const WS = 'wks_01';
const PRJ = 'prj_01';

function eff(role: EffectiveRole['workspaceRole'], projects: string[] = []): EffectiveRole {
  return { workspaceRole: role, projects: new Map(projects.map((p) => [p, { projectAdmin: false }])) };
}

function vis(resolvedMode: ResolvedVisibility['resolvedMode'], resolvedUserIds: string[] = []): ResolvedVisibility {
  return { workspaceId: WS, projectId: PRJ, resolvedMode, resolvedUserIds };
}

describe('canSeeResolved — the decision table, exactly', () => {
  it('a non-member sees nothing at all', () => {
    expect(canSeeResolved(eff(null), 'u', vis('workspace'))).toBe(false);
    expect(canSeeResolved(eff(null), 'u', vis('project'))).toBe(false);
    expect(canSeeResolved(eff(null), 'u', vis('explicit', ['u']))).toBe(false);
  });

  it('a guest sees only explicit lists that name them — never workspace or project modes', () => {
    expect(canSeeResolved(eff('guest', [PRJ]), 'u', vis('workspace'))).toBe(false);
    expect(canSeeResolved(eff('guest', [PRJ]), 'u', vis('project'))).toBe(false);
    expect(canSeeResolved(eff('guest', [PRJ]), 'u', vis('explicit', ['u']))).toBe(true);
    expect(canSeeResolved(eff('guest', [PRJ]), 'u', vis('explicit', ['other']))).toBe(false);
  });

  it('a member sees workspace mode, project mode only from inside the project, explicit only when listed', () => {
    expect(canSeeResolved(eff('member'), 'u', vis('workspace'))).toBe(true);
    expect(canSeeResolved(eff('member', [PRJ]), 'u', vis('project'))).toBe(true);
    expect(canSeeResolved(eff('member'), 'u', vis('project'))).toBe(false);
    expect(canSeeResolved(eff('member'), 'u', vis('explicit', ['u']))).toBe(true);
    expect(canSeeResolved(eff('member'), 'u', vis('explicit', ['other']))).toBe(false);
  });

  // This case originally asserted no bypass for admins AND owners; the owner
  // decision of 2026-08-27 split the two roles, so it is now two cases with
  // opposite expectations — and the split itself is the planted defect: a
  // regression that re-unifies them fails one side or the other.
  it('planted defect — an ADMIN gets no visibility bypass', () => {
    expect(canSeeResolved(eff('admin'), 'u', vis('project'))).toBe(false);
    expect(canSeeResolved(eff('admin'), 'u', vis('explicit', ['other']))).toBe(false);
  });

  it('the OWNER reads everything in the workspace — disclosed, not hidden', () => {
    expect(canSeeResolved(eff('owner'), 'u', vis('workspace'))).toBe(true);
    expect(canSeeResolved(eff('owner'), 'u', vis('project'))).toBe(true);
    // Even an explicit list that names somebody else: the owner power is total
    // within the workspace, which is exactly why the UI must say so.
    expect(canSeeResolved(eff('owner'), 'u', vis('explicit', ['other']))).toBe(true);
  });
});

describe('canSee — against the real projections', () => {
  let pool: Pool;
  beforeAll(async () => {
    migrateTestDb();
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('walks projection state end to end: guest vs member vs outsider on one explicit ticket', async () => {
    await seedMember(pool, WS, 'usr_member', 'member', [{ projectId: PRJ }]);
    await seedGuest(pool, WS, 'usr_guest');
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' });
    await applyAll(pool, [setVisibilityEnv(WS, 'tkt_1', 'explicit', ['usr_guest'])]);

    expect(await canSee(pool, 'usr_guest', 'tkt_1')).toBe(true);
    expect(await canSee(pool, 'usr_member', 'tkt_1')).toBe(false);
    expect(await canSee(pool, 'usr_outsider', 'tkt_1')).toBe(false);
  });

  it('an unknown ticket is invisible to everyone', async () => {
    await seedMember(pool, WS, 'usr_member', 'member', [{ projectId: PRJ }]);
    expect(await canSee(pool, 'usr_member', 'tkt_ghost')).toBe(false);
  });

  it('inherited visibility governs: a child under an explicit parent is invisible to non-listed members', async () => {
    await seedMember(pool, WS, 'usr_member', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_p' });
    await applyAll(pool, [setVisibilityEnv(WS, 'tkt_p', 'explicit', ['usr_listed'])]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_c', parentId: 'tkt_p' });
    expect(await canSee(pool, 'usr_member', 'tkt_c')).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run (from `apps/server/`): `pnpm vitest run test/visibility/can-see.test.ts`
Expected: FAIL — cannot resolve `../../src/visibility/can-see`.

- [ ] **Step 4: Implement canSee**

```ts
// apps/server/src/visibility/can-see.ts
import type { Queryable } from '../db/queryable';
import { resolveEffectiveRole, type EffectiveRole } from '../permissions/effective-role';

export interface ResolvedVisibility {
  workspaceId: string;
  projectId: string;
  resolvedMode: 'workspace' | 'project' | 'explicit';
  resolvedUserIds: string[];
}

/**
 * The one visibility decision, pure. Every read path, permission check,
 * and the sync-down filter defer here — one function to prove, one
 * function that can lie if it is wrong, so its tests are the plan's
 * planted-defect core.
 */
export function canSeeResolved(eff: EffectiveRole, userId: string, v: ResolvedVisibility): boolean {
  if (eff.workspaceRole === null) return false;
  // The OWNER reads everything in their workspace (owner decision 2026-08-27).
  // The workspace is the container everything else sits inside, and its owner
  // owns the container. Reads leave no event trace, so this power cannot be
  // made honest by attribution — it is made honest by DISCLOSURE: the
  // visibility controls state plainly that the workspace owner can always see
  // (Plan 6 carries the copy). A stated power is not a lie; a hidden one is.
  // ADMINS get no bypass: an admin must join a project — an attributed event —
  // to read its project-mode tickets. Writing is unchanged for everyone,
  // owner included: creating in a project still requires joining it.
  if (eff.workspaceRole === 'owner') return true;
  if (eff.workspaceRole === 'guest') {
    // Guests see ONLY what is explicitly shared with them (spec §6).
    return v.resolvedMode === 'explicit' && v.resolvedUserIds.includes(userId);
  }
  switch (v.resolvedMode) {
    case 'workspace':
      return true;
    case 'project':
      return eff.projects.has(v.projectId); // no ADMIN bypass — deliberate, see Open questions
    case 'explicit':
      return v.resolvedUserIds.includes(userId);
  }
}

export async function getResolvedVisibility(db: Queryable, ticketId: string): Promise<ResolvedVisibility | null> {
  const { rows } = await db.query(
    'SELECT workspace_id, project_id, resolved_mode, resolved_user_ids FROM proj_visibility WHERE ticket_id = $1',
    [ticketId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    resolvedMode: row.resolved_mode,
    resolvedUserIds: row.resolved_user_ids,
  };
}

export async function canSee(db: Queryable, userId: string, ticketId: string): Promise<boolean> {
  const v = await getResolvedVisibility(db, ticketId);
  if (!v) return false; // unknown and invisible are the same answer
  const eff = await resolveEffectiveRole(db, userId, v.workspaceId);
  return canSeeResolved(eff, userId, v);
}
```

- [ ] **Step 5: Run the canSee tests**

Run (from `apps/server/`): `pnpm vitest run test/visibility/can-see.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Write the failing list-filter test**

```ts
// apps/server/test/visibility/visible-tickets.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { canSee } from '../../src/visibility/can-see';
import { listVisibleTickets } from '../../src/visibility/visible-tickets';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { applyAll, seedGuest, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed';

const WS = 'wks_01';

let pool: Pool;
beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

describe('listVisibleTickets — server-side filtering, one SQL pass', () => {
  it('each viewer gets exactly their slice of the same workspace', async () => {
    await seedMember(pool, WS, 'usr_a', 'member', [{ projectId: 'prj_1' }]);
    await seedMember(pool, WS, 'usr_b', 'member', [{ projectId: 'prj_2' }]);
    await seedGuest(pool, WS, 'usr_g');

    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_ws' });
    await applyAll(pool, [setVisibilityEnv(WS, 'tkt_ws', 'workspace')]);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_p1' }); // project default
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_2', ticketId: 'tkt_p2' }); // project default
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_ex' });
    await applyAll(pool, [setVisibilityEnv(WS, 'tkt_ex', 'explicit', ['usr_g', 'usr_b'])]);

    const ids = async (userId: string) =>
      (await listVisibleTickets(pool, userId, WS)).map((t) => t.ticket_id).sort();

    expect(await ids('usr_a')).toEqual(['tkt_p1', 'tkt_ws']);
    expect(await ids('usr_b')).toEqual(['tkt_ex', 'tkt_p2', 'tkt_ws']);
    expect(await ids('usr_g')).toEqual(['tkt_ex']); // guests: explicit only
    expect(await ids('usr_outsider')).toEqual([]);
  });

  // The SQL is the decision table said twice; this viewer is the drift alarm.
  // If canSeeResolved's owner bypass and this function's owner branch ever
  // disagree, the owner sees a ticket the list omits (or the reverse) and this
  // goes red. usr_own is on NO project and NO explicit list — everything they
  // receive, they receive from the bypass alone.
  it('the owner lists every ticket, from the bypass alone', async () => {
    await seedMember(pool, WS, 'usr_own', 'owner', []);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_p1' });
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_ex' });
    await applyAll(pool, [setVisibilityEnv(WS, 'tkt_ex', 'explicit', ['usr_b'])]);

    const listed = (await listVisibleTickets(pool, 'usr_own', WS)).map((t) => t.ticket_id).sort();
    expect(listed).toEqual(['tkt_ex', 'tkt_p1']);
    for (const ticketId of listed) {
      expect(await canSee(pool, 'usr_own', ticketId)).toBe(true); // the two implementations agree
    }
  });
});
```

- [ ] **Step 7: Run to verify failure, then implement**

Run (from `apps/server/`): `pnpm vitest run test/visibility/visible-tickets.test.ts` — Expected: FAIL (module missing). Then:

```ts
// apps/server/src/visibility/visible-tickets.ts
import type { Queryable } from '../db/queryable';
import { resolveEffectiveRole } from '../permissions/effective-role';

/**
 * All tickets in the workspace the viewer may see — the same decision
 * table as canSeeResolved, expressed as one SQL predicate so lists never
 * do N round-trips. If Plan 3 named proj_tickets' key column differently,
 * adjust the join column only.
 */
export async function listVisibleTickets(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<Array<Record<string, unknown>>> {
  const eff = await resolveEffectiveRole(db, userId, workspaceId);
  if (eff.workspaceRole === null) return [];

  // This function is the decision table SAID TWICE — once in canSeeResolved,
  // once in SQL — which is exactly the two-sources-of-truth shape this series
  // keeps catching. Every branch here must move when canSeeResolved moves; the
  // owner-bypass case below exists because the 2026-08-27 decision moved it,
  // and the list test asserts an owner viewer so the two cannot drift silently.
  if (eff.workspaceRole === 'owner') {
    const { rows } = await db.query(
      `SELECT t.* FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
       WHERE v.workspace_id = $1
       ORDER BY t.ticket_id`,
      [workspaceId],
    );
    return rows;
  }

  if (eff.workspaceRole === 'guest') {
    const { rows } = await db.query(
      `SELECT t.* FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
       WHERE v.workspace_id = $1
         AND v.resolved_mode = 'explicit' AND $2 = ANY (v.resolved_user_ids)
       ORDER BY t.ticket_id`,
      [workspaceId, userId],
    );
    return rows;
  }

  const memberProjects = [...eff.projects.keys()];
  const { rows } = await db.query(
    `SELECT t.* FROM proj_tickets t
     JOIN proj_visibility v ON v.ticket_id = t.ticket_id
     WHERE v.workspace_id = $1
       AND (
         v.resolved_mode = 'workspace'
         OR (v.resolved_mode = 'project' AND v.project_id = ANY ($3::text[]))
         OR (v.resolved_mode = 'explicit' AND $2 = ANY (v.resolved_user_ids))
       )
     ORDER BY t.ticket_id`,
    [workspaceId, userId, memberProjects],
  );
  return rows;
}
```

Run again — Expected: PASS (1 test, 4 viewers asserted).

- [ ] **Step 8: Run the full suite and commit**

Run (from `apps/server/`): `pnpm vitest run` — Expected: PASS.

```bash
git add apps/server/src/visibility apps/server/test/visibility apps/server/test/helpers/seed.ts
git commit -m "canSee is the one visibility decision, pure at its core: guests get explicit lists only, members get their projects, admins get no bypass while the owner sees the whole workspace disclosed — and lists filter server-side through the same table in one SQL pass, with an owner viewer standing guard against the two copies of the decision drifting apart."
```

---

### Task 8: Read enforcement — 404s, the restricted-parent placeholder, provenance untouched

**Files:**
- Create: `apps/server/src/routes/tickets.ts`
- Modify: `apps/server/src/app.ts` (register the ticket routes, passing the pool and auth from the builder)
- Create: `apps/server/test/helpers/ledger.ts`
- Test: `apps/server/test/routes/tickets-read.test.ts`

**Interfaces:**
- Consumes: `makeRequireSession` + `Auth` (Task 2), `canSee`/`listVisibleTickets` (Task 7), `proj_tickets` (Plan 3), the `events` ledger table (Plan 1 — see Cross-plan path assumptions).
- Produces: `registerTicketRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void` serving `GET /v1/workspaces/:workspaceId/tickets`, `GET /v1/workspaces/:workspaceId/tickets/:ticketId`, `GET /v1/workspaces/:workspaceId/tickets/:ticketId/events`; single-read response shape `{ ticket: <proj_tickets row>, parent: null | { kind: 'ticket', id, title } | { kind: 'restricted', id } }` (Task 10 adds `rollup`); test helper `appendTestEvent(db, env)`. Sessions come from Task 2's `signInWithPhone` in `test/helpers/session.ts`.

**Honesty decisions encoded here (spec §6, exact):**
- A direct read of an invisible ticket is `404 {error: 'not_found'}` — invisible and nonexistent are indistinguishable, so a member probing another project's ids learns nothing. The ONE deliberate existence leak is the restricted-parent placeholder, reachable only through a child the viewer can already see.
- A visible child under an invisible parent returns `parent: { kind: 'restricted', id }` — existence, no title, never posing as parentless. (`kind: 'ticket'` carries `title`; `kind: 'restricted'` structurally cannot.)
- The history endpoint returns full ledger envelopes — `actor_id`, `client_time`, `server_time` and all — for anyone who can see the ticket. Provenance is never redacted from someone entitled to the state; there is no "anonymized" serialization path to drift into.

- [ ] **Step 1: Write the ledger test helper**

```ts
// apps/server/test/helpers/ledger.ts
import type { Queryable } from '../../src/db/queryable';
import type { LedgerEvent } from '../../src/ledger/event-store';

/**
 * Append one event to the ledger table directly (tests seed history without
 * the full ingest pipeline). `workspace_seq` is NOT NULL in Plan 1's schema —
 * the stream cursor is part of a stored event, so the helper writes the one
 * `testEnvelope` assigned. Adapt column names if Plan 1's events table
 * differs — see Cross-plan path assumptions.
 *
 * BOTH time columns are `timestamptz` (owner decision 2026-08-20, "time is
 * Asia/Kolkata"), so this helper feeds pg INSTANTS — `Date` values — rather
 * than the envelope's ISO strings. The strings would work by implicit cast,
 * but a fixture that hands text to a timestamp column is the habit that
 * survived the verbatim-text era, and it hides the conversion that readers
 * then have to undo. Whatever offset the envelope's ISO string carried, the
 * stored value is the moment it named; readback is normalized to `…Z`.
 */
export async function appendTestEvent(db: Queryable, env: LedgerEvent): Promise<void> {
  await db.query(
    `INSERT INTO events
       (id, workspace_id, entity_kind, entity_id, type, version, payload,
        actor_id, origin, client_time, server_time, seq, workspace_seq)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      env.id, env.workspaceId, env.entity.kind, env.entity.id, env.type, env.version,
      JSON.stringify(env.payload), env.actorId, env.origin,
      new Date(env.clientTime), new Date(env.serverTime),
      env.seq, env.workspaceSeq,
    ],
  );
}
```

- [ ] **Step 2: Write the failing read-enforcement tests**

```ts
// apps/server/test/routes/tickets-read.test.ts
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuth, type Auth } from '../../src/auth/auth';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender';
import { LogOtpSender } from '../../src/auth/otp-sender';
import { registerAuthRoutes } from '../../src/auth/routes';
import { registerTicketRoutes } from '../../src/routes/tickets';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { testEnvelope } from '../helpers/envelope';
import { appendTestEvent } from '../helpers/ledger';
import { applyAll, seedGuest, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed';
import { signInWithPhone } from '../helpers/session';

const WS = 'wks_01';

let pool: Pool;
let app: FastifyInstance;
let auth: Auth;
let otp: LogOtpSender;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  otp = new LogOtpSender(() => {});
  auth = createAuth({
    pool,
    otpSender: otp,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-at-least-32-characters-long',
  });
  app = Fastify();
  registerAuthRoutes(app, auth);
  registerTicketRoutes(app, { pool, auth });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

/** Sign in a fresh user over the wire and seed their membership under the returned userId. */
async function sessionFor(phone: string): Promise<{ token: string; userId: string }> {
  const token = await signInWithPhone(app, otp, phone);
  const session = await app.inject({
    method: 'GET',
    url: '/api/auth/get-session',
    headers: { authorization: `Bearer ${token}` },
  });
  return { token, userId: session.json().user.id };
}

describe('read enforcement', () => {
  it('a member reading another project’s ticket by direct id gets a 404 indistinguishable from nonexistence', async () => {
    const { token, userId } = await sessionFor('+919000000101');
    await seedMember(pool, WS, userId, 'member', [{ projectId: 'prj_mine' }]);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_other', ticketId: 'tkt_other' }); // project default

    const invisible = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WS}/tickets/tkt_other`,
      headers: { authorization: `Bearer ${token}` },
    });
    const ghost = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WS}/tickets/tkt_never_existed`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(invisible.statusCode).toBe(404);
    expect(ghost.statusCode).toBe(404);
    expect(invisible.json()).toEqual(ghost.json()); // no distinguishing detail leaks
  });

  it('the list endpoint returns only the viewer’s slice', async () => {
    const { token, userId } = await sessionFor('+919000000102');
    await seedMember(pool, WS, userId, 'member', [{ projectId: 'prj_mine' }]);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_mine', ticketId: 'tkt_mine' });
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_other', ticketId: 'tkt_other' });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WS}/tickets`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tickets.map((t: { ticket_id: string }) => t.ticket_id)).toEqual(['tkt_mine']);
  });

  it('planted defect — a visible child under a restricted parent shows existence and no title', async () => {
    const { token, userId } = await sessionFor('+919000000103');
    await seedMember(pool, WS, userId, 'member', [{ projectId: 'prj_1' }]);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_parent', title: 'Secret plan' });
    await applyAll(pool, [setVisibilityEnv(WS, 'tkt_parent', 'explicit', ['usr_listed_other'])]);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_child', parentId: 'tkt_parent' });
    await applyAll(pool, [setVisibilityEnv(WS, 'tkt_child', 'project')]); // authored back open

    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WS}/tickets/tkt_child`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const parent = res.json().parent;
    expect(parent).toEqual({ kind: 'restricted', id: 'tkt_parent' }); // exact: existence, id, nothing else
    expect(parent).not.toHaveProperty('title');
  });

  it('a visible parent comes through with kind ticket and its title', async () => {
    const { token, userId } = await sessionFor('+919000000104');
    await seedMember(pool, WS, userId, 'member', [{ projectId: 'prj_1' }]);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_parent', title: 'Open plan' });
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_child', parentId: 'tkt_parent' });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WS}/tickets/tkt_child`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json().parent).toEqual({ kind: 'ticket', id: 'tkt_parent', title: 'Open plan' });
  });

  it('planted defect — provenance is never redacted: history arrives with actor and both times, even when the actor shares no project with the viewer', async () => {
    const { token, userId } = await sessionFor('+919000000105');
    await seedMember(pool, WS, userId, 'member', [{ projectId: 'prj_1' }]);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_1' });
    // usr_stranger is in no project the viewer belongs to — a redacting
    // serializer would be tempted to anonymize them. It must not.
    const claim = testEnvelope({
      workspaceId: WS,
      entity: { kind: 'ticket', id: 'tkt_1' },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
      actorId: 'usr_stranger',
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:02.000Z',
    });
    await appendTestEvent(pool, claim);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WS}/tickets/tkt_1/events`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const event = res.json().events.find((e: { id: string }) => e.id === claim.id);
    expect(event).toMatchObject({
      actor_id: 'usr_stranger',
      client_time: '2026-08-19T10:00:00.000Z',
      server_time: '2026-08-19T10:00:02.000Z',
    });
  });

  it('history of an invisible ticket is a 404 like every other read', async () => {
    const { token, userId } = await sessionFor('+919000000106');
    await seedMember(pool, WS, userId, 'member', [{ projectId: 'prj_mine' }]);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_other', ticketId: 'tkt_other' });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WS}/tickets/tkt_other/events`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

Note on `client_time` comparison — **settled, no longer conditional.** Plan 1's `events` table stores **both** clocks as `timestamptz` (owner decision 2026-08-20, "time is Asia/Kolkata"; the earlier verbatim-text `client_time` is gone). pg therefore returns `Date` objects, and Fastify's JSON serializer emits them as ISO 8601 `Z` at millisecond precision — which is exactly what the fixture above claimed, so the assertion compares string to string with no coercion. The one thing a test here must NOT do is assert a verbatim `+05:30` readback: an event submitted with that offset is stored as the instant it named and reads back as the equivalent `…Z`. The invariant is that the *values* survive untouched — the actor and both instants, unredacted — never the offset label the submitting device happened to attach.

- [ ] **Step 3: Run to verify failure**

Run (from `apps/server/`): `pnpm vitest run test/routes/tickets-read.test.ts`
Expected: FAIL — cannot resolve `../../src/routes/tickets`.

- [ ] **Step 4: Implement the read routes**

```ts
// apps/server/src/routes/tickets.ts
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Auth } from '../auth/auth';
import { makeRequireSession } from '../auth/require-session';
import { canSee } from '../visibility/can-see';
import { listVisibleTickets } from '../visibility/visible-tickets';

export type ParentRef =
  | { kind: 'ticket'; id: string; title: string }
  | { kind: 'restricted'; id: string };

export function registerTicketRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void {
  const requireSession = makeRequireSession(deps.auth);
  const notFound = { error: 'not_found' } as const;

  app.get('/v1/workspaces/:workspaceId/tickets', { preHandler: requireSession }, async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const tickets = await listVisibleTickets(deps.pool, request.currentUserId, workspaceId);
    return { tickets };
  });

  app.get(
    '/v1/workspaces/:workspaceId/tickets/:ticketId',
    { preHandler: requireSession },
    async (request, reply) => {
      const { ticketId } = request.params as { workspaceId: string; ticketId: string };
      if (!(await canSee(deps.pool, request.currentUserId, ticketId))) {
        // Invisible and nonexistent are the same 404: direct probes learn nothing.
        return reply.code(404).send(notFound);
      }
      const { rows } = await deps.pool.query('SELECT * FROM proj_tickets WHERE ticket_id = $1', [ticketId]);
      const ticket = rows[0];
      if (!ticket) return reply.code(404).send(notFound); // projection lag guard — same generic answer

      let parent: ParentRef | null = null;
      if (ticket.parent_id) {
        if (await canSee(deps.pool, request.currentUserId, ticket.parent_id)) {
          const parentRow = (
            await deps.pool.query('SELECT ticket_id, title FROM proj_tickets WHERE ticket_id = $1', [ticket.parent_id])
          ).rows[0];
          parent = { kind: 'ticket', id: parentRow.ticket_id, title: parentRow.title };
        } else {
          // Honesty under restriction: the child never poses as parentless.
          // Existence and id only — no title, no state, no provenance of the parent.
          parent = { kind: 'restricted', id: ticket.parent_id };
        }
      }
      return { ticket, parent };
    },
  );

  app.get(
    '/v1/workspaces/:workspaceId/tickets/:ticketId/events',
    { preHandler: requireSession },
    async (request, reply) => {
      const { ticketId } = request.params as { workspaceId: string; ticketId: string };
      if (!(await canSee(deps.pool, request.currentUserId, ticketId))) {
        return reply.code(404).send(notFound);
      }
      // The history view IS the ledger, filtered (spec §3). Full envelopes:
      // provenance — actor, both times — is never redacted from someone
      // entitled to see the ticket.
      const { rows } = await deps.pool.query(
        `SELECT id, workspace_id, entity_kind, entity_id, type, version, payload,
                actor_id, origin, client_time, server_time, seq
         FROM events
         WHERE entity_kind = 'ticket' AND entity_id = $1
         ORDER BY seq`,
        [ticketId],
      );
      return { events: rows };
    },
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `apps/server/`): `pnpm vitest run test/routes/tickets-read.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Register the routes in the app assembly**

In `apps/server/src/app.ts`, alongside Task 2's auth registration:

```ts
import { registerTicketRoutes } from './routes/tickets';

registerTicketRoutes(app, { pool, auth });
```

Run (from `apps/server/`): `pnpm vitest run`
Expected: PASS — full suite.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes apps/server/src/app.ts apps/server/test/routes apps/server/test/helpers/ledger.ts
git commit -m "Direct reads enforce visibility as indistinguishable 404s; a restricted parent shows existence without a title rather than letting the child pose as parentless; and history goes out as full envelopes because provenance is never redacted from someone entitled to see."
```

---

### Task 9: Visibility-dependent ingest permissions

**Files:**
- Modify: `apps/server/src/permissions/check-permission.ts` (add `checkVisibilityPermission`; extend `checkPermission` to call it)
- Test: `apps/server/test/permissions/check-visibility-permission.test.ts`

**Interfaces:**
- Consumes: `canSee`, `getResolvedVisibility` (Task 7); `hasProjectAdminRights` (Task 4); `proj_tickets.created_by` (Plan 3 — the head state carries creator provenance; adapt the column name if Plan 3 spelled it differently); `VisibilitySetPayload` (Task 3).
- Produces: `checkVisibilityPermission(db: Queryable, env: EventEnvelope, ctx: PermissionContext): Promise<Refusal | null>`; `checkPermission` (same signature as Task 5) now runs role checks then visibility checks — still the single gate the ingest pipeline calls, unchanged at the call site.

> ### ⚠️ STALE CALL SIGNATURE — read before transcribing anything below (Ruling P17)
>
> Task 5 shipped on 2026-08-31 and **widened `checkPermission`**. Every `checkPermission(pool, env, 'usr_m')`
> in this task's Step 1 test block is wrong and will not compile. As built:
>
> ```ts
> checkPermission(env, { db: pool, sessionUserId: 'usr_m' })   // one env, one context object
> ```
>
> The line above claiming `checkPermission` has "the same signature as Task 5" is still true — it is the
> Task 5 signature that moved. `checkVisibilityPermission` should take the same shape rather than the
> `(db, env, ctx)` triple below, so the two halves of one gate read alike.
>
> Two more things Task 9 inherits from Task 5 as built:
> - `checkRolePermission(env, ctx: PermissionContext)` is unchanged and still pure. Visibility runs
>   AFTER it, inside `checkPermission`, between the role refusal and the final `null`.
> - The plan text's `'usr_m'` / `'tkt_1'` / `'wks_01'` fixture ids are **not ULIDs** and the envelope
>   schema refuses them. They are fine for the pure `checkRolePermission` unit tests, which never touch
>   `parseEvent`; anything that goes through a door needs `newUlid()`.

**The checks (exact):**
1. Only ticket-entity events are examined; everything else passed the role gate already.
2. `ticket.created`: guests are refused (`permission.role` — "Guests cannot create tickets."); non-guests must be on the target project (`permission.role`). No admin shortcut — an admin joins the project first (attributed), then creates (Open questions).
3. `visibility.set` whose `payload.ticketId` differs from `entity.id`: refused (`permission.visibility`) before anything else is looked up — a claim must name the ticket it rides on.
4. Every other ticket event (transition, assign, comment, field set, reparent, visibility.set itself): the actor must `canSee` the ticket, else `permission.visibility` — "This ticket is not visible to you." This is also exactly the guest constraint: a guest's `canSee` is true only for tickets explicitly shared with them, so *guests may only act on tickets explicitly visible to them* falls out of the same check.
5. `visibility.set` additionally requires project-admin rights on the ticket's project OR ticket creatorship (`permission.role`).

- [ ] **Step 1: Write the failing planted-defect tests**

```ts
// apps/server/test/permissions/check-visibility-permission.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { checkPermission } from '../../src/permissions/check-permission';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { testEnvelope } from '../helpers/envelope';
import { applyAll, seedGuest, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed';

const WS = 'wks_01';
const PRJ = 'prj_01';

let pool: Pool;
beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

function ticketEvent(type: string, ticketId: string, actorId: string, payload: unknown = {}) {
  return testEnvelope({ workspaceId: WS, entity: { kind: 'ticket', id: ticketId }, type, payload, actorId });
}

describe('checkVisibilityPermission — planted defects', () => {
  it('planted defect: a guest acting on a ticket not explicitly shared with them is refused', async () => {
    await seedGuest(pool, WS, 'usr_guest');
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' }); // project-mode default
    const result = await checkPermission(
      pool,
      ticketEvent('ticket.transitioned', 'tkt_1', 'usr_guest', { to: 'done' }),
      'usr_guest',
    );
    expect(result).toEqual({
      refused: true,
      rule: 'permission.visibility',
      reason: 'This ticket is not visible to you.',
    });
  });

  it('a guest acting on a ticket explicitly shared with them passes the gate', async () => {
    await seedGuest(pool, WS, 'usr_guest');
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' });
    await applyAll(pool, [setVisibilityEnv(WS, 'tkt_1', 'explicit', ['usr_guest'])]);
    const result = await checkPermission(
      pool,
      ticketEvent('comment.added', 'tkt_1', 'usr_guest', { body: 'checked' }),
      'usr_guest',
    );
    expect(result).toBeNull();
  });

  it('planted defect: a member acting on another project’s ticket by direct id is refused', async () => {
    await seedMember(pool, WS, 'usr_m', 'member', [{ projectId: 'prj_mine' }]);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_other', ticketId: 'tkt_other' });
    const result = await checkPermission(
      pool,
      ticketEvent('ticket.assigned', 'tkt_other', 'usr_m', { assigneeId: 'usr_m' }),
      'usr_m',
    );
    expect(result).toEqual({
      refused: true,
      rule: 'permission.visibility',
      reason: 'This ticket is not visible to you.',
    });
  });

  it('guests cannot create tickets', async () => {
    await seedGuest(pool, WS, 'usr_guest');
    const result = await checkPermission(
      pool,
      ticketEvent('ticket.created', 'tkt_new', 'usr_guest', { projectId: PRJ }),
      'usr_guest',
    );
    expect(result).toEqual({ refused: true, rule: 'permission.role', reason: 'Guests cannot create tickets.' });
  });

  it('creating a ticket requires being on the project — even for admins', async () => {
    await seedMember(pool, WS, 'usr_adm', 'admin');
    const result = await checkPermission(
      pool,
      ticketEvent('ticket.created', 'tkt_new', 'usr_adm', { projectId: PRJ }),
      'usr_adm',
    );
    expect(result).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'You are not a member of this project, so you cannot create tickets in it.',
    });
  });

  it('a project member creates tickets freely', async () => {
    await seedMember(pool, WS, 'usr_m', 'member', [{ projectId: PRJ }]);
    const result = await checkPermission(
      pool,
      ticketEvent('ticket.created', 'tkt_new', 'usr_m', { projectId: PRJ }),
      'usr_m',
    );
    expect(result).toBeNull();
  });

  it('visibility.set whose payload names a different ticket than its entity is refused', async () => {
    await seedMember(pool, WS, 'usr_m', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' });
    const env = testEnvelope({
      workspaceId: WS,
      entity: { kind: 'ticket', id: 'tkt_1' },
      type: 'visibility.set',
      payload: { ticketId: 'tkt_2', mode: 'workspace' },
      actorId: 'usr_m',
    });
    const result = await checkPermission(pool, env, 'usr_m');
    expect(result).toEqual({
      refused: true,
      rule: 'permission.visibility',
      reason: 'This claim does not name the ticket it is attached to.',
    });
  });

  it('planted defect: a plain member who is neither project admin nor creator cannot set visibility', async () => {
    await seedMember(pool, WS, 'usr_m', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1', createdBy: 'usr_creator' });
    const result = await checkPermission(pool, setVisibilityEnv(WS, 'tkt_1', 'workspace', undefined, 'usr_m'), 'usr_m');
    expect(result).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: "Only a project admin or the ticket's creator can change who sees this ticket.",
    });
  });

  it('the ticket creator may set visibility', async () => {
    await seedMember(pool, WS, 'usr_creator', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1', createdBy: 'usr_creator' });
    const result = await checkPermission(
      pool,
      setVisibilityEnv(WS, 'tkt_1', 'explicit', ['usr_creator'], 'usr_creator'),
      'usr_creator',
    );
    expect(result).toBeNull();
  });

  it('a project admin may set visibility on tickets they can see', async () => {
    await seedMember(pool, WS, 'usr_pa', 'member', [{ projectId: PRJ, projectAdmin: true }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1', createdBy: 'usr_other' });
    const result = await checkPermission(pool, setVisibilityEnv(WS, 'tkt_1', 'project', undefined, 'usr_pa'), 'usr_pa');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `apps/server/`): `pnpm vitest run test/permissions/check-visibility-permission.test.ts`
Expected: FAIL — the guest transition and member direct-id cases return `null` (no visibility gate exists yet); the mismatch and creator cases fail likewise.

- [ ] **Step 3: Implement the visibility gate**

Add to `apps/server/src/permissions/check-permission.ts`:

```ts
import type { VisibilitySetPayload } from '@gisik-nokma/domain';
import { canSee, getResolvedVisibility } from '../visibility/can-see';

async function getTicketCreator(db: Queryable, ticketId: string): Promise<string | null> {
  // Plan 3's head state carries creator provenance; adapt the column
  // name if its proj_tickets spelled it differently.
  const { rows } = await db.query('SELECT created_by FROM proj_tickets WHERE ticket_id = $1', [ticketId]);
  return (rows[0]?.created_by as string | undefined) ?? null;
}

/**
 * Visibility-dependent checks — async because they read projections.
 * Runs after checkRolePermission, still before the rule engine.
 */
export async function checkVisibilityPermission(
  db: Queryable,
  env: EventEnvelope,
  ctx: PermissionContext,
): Promise<Refusal | null> {
  if (env.entity.kind !== 'ticket') return null;

  if (env.type === 'ticket.created') {
    const p = env.payload as { projectId: string };
    if (ctx.eff.workspaceRole === 'guest') {
      return refuse('permission.role', 'Guests cannot create tickets.');
    }
    if (!ctx.eff.projects.has(p.projectId)) {
      // No admin shortcut: joining the project is an attributed event; use it first.
      return refuse('permission.role', 'You are not a member of this project, so you cannot create tickets in it.');
    }
    return null;
  }

  if (env.type === 'visibility.set' && (env.payload as VisibilitySetPayload).ticketId !== env.entity.id) {
    return refuse('permission.visibility', 'This claim does not name the ticket it is attached to.');
  }

  if (!(await canSee(db, ctx.sessionUserId, env.entity.id))) {
    // For guests this is exactly "guests may only act on tickets
    // explicitly visible to them" — their canSee is explicit-only.
    return refuse('permission.visibility', 'This ticket is not visible to you.');
  }

  if (env.type === 'visibility.set') {
    const v = await getResolvedVisibility(db, env.entity.id);
    const creatorId = await getTicketCreator(db, env.entity.id);
    const allowed =
      (v !== null && hasProjectAdminRights(ctx.eff, v.projectId)) || ctx.sessionUserId === creatorId;
    if (!allowed) {
      return refuse('permission.role', "Only a project admin or the ticket's creator can change who sees this ticket.");
    }
  }

  return null;
}
```

And extend `checkPermission` (replacing its final `return`):

```ts
export async function checkPermission(
  db: Queryable,
  env: EventEnvelope,
  sessionUserId: string,
): Promise<Refusal | null> {
  const eff = await resolveEffectiveRole(db, sessionUserId, env.workspaceId);
  const ctx: PermissionContext = { sessionUserId, eff };
  const roleRefusal = checkRolePermission(env, ctx);
  if (roleRefusal) return roleRefusal;
  // Before any membership question: does the project this event names exist at
  // all? Ordering is the point — see Step 3b.
  const projectRefusal = await checkProjectExists(db, env);
  if (projectRefusal) return projectRefusal;
  return checkVisibilityPermission(db, env, ctx);
}
```

- [ ] **Step 3b: `proj_projects`, so a ticket cannot be created into a project nobody founded**

Owner decision 2026-08-26 (coordination doc). Nothing in the series validated that `ticket.created.projectId` names a real project: there was no `proj_projects` anywhere, and `project.created` was a registered event type that nothing projected into a queryable table.

**What covered it by accident, and why that is not coverage.** The membership check in Step 3 refuses an actor who is not a member of the project — so a fabricated `projectId` was usually refused, because nobody is a member of a project that does not exist. But membership is built from `membership.granted` / `project.member_added`, and those accept any non-empty string as a project scope without checking it either. Grant yourself membership on a typo'd id and the ticket is accepted: it lands in `proj_tickets` and `proj_visibility` with a dangling `project_id`, shows on no board and in no project list, and nobody is ever told. And on the paths where the coincidence *did* hold, the user was told the wrong thing — that they were not a member, when the truth is that the project does not exist.

Hence the ordering above: the existence check runs **before** the membership check, so the honest reason wins whenever both would fire.

**Files:**
- Create: `apps/server/migrations/<ts>_proj-projects.cjs`, `apps/server/src/projections/proj-projects.ts`
- Modify: `apps/server/src/projections/index.ts` (register `projProjects` **before** `projTickets` — coordination §8), `apps/server/src/permissions/check-permission.ts`
- Test: `apps/server/test/projections/proj-projects.test.ts`, `apps/server/test/permissions/check-project-exists.test.ts`

The table carries only what the check needs plus the provenance every projection keeps:

```js
// apps/server/migrations/<ts>_proj-projects.cjs
exports.up = (pgm) => {
  pgm.createTable('proj_projects', {
    project_id: { type: 'text', primaryKey: true },
    workspace_id: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    created_by: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true },
  });
  pgm.createIndex('proj_projects', 'workspace_id');
};
exports.down = (pgm) => pgm.dropTable('proj_projects');
```

```ts
// apps/server/src/projections/proj-projects.ts
export const projProjects = {
  name: 'proj_projects',
  tables: ['proj_projects'] as const,

  async apply(env: LedgerEvent, db: Queryable): Promise<void> {
    if (env.type !== 'project.created') return;
    const p = parseProjectCreated(env.payload);
    await db.query(
      `INSERT INTO proj_projects (project_id, workspace_id, name, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id) DO NOTHING`,
      [env.entity.id, env.workspaceId, p.name, env.actorId, env.serverTime],
    );
  },

  async reset(db: Queryable): Promise<void> {
    await db.query('DELETE FROM proj_projects');
  },
};

/** Scoped by workspace: a project id from another workspace is not "found". */
export async function projectExists(
  db: Queryable,
  workspaceId: string,
  projectId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    'SELECT 1 FROM proj_projects WHERE project_id = $1 AND workspace_id = $2',
    [projectId, workspaceId],
  );
  return rows.length > 0;
}
```

The check covers every event that *names* a project, not only ticket creation — the membership path is the one the hole was actually reachable through:

```ts
// apps/server/src/permissions/check-permission.ts
/** The project this event names, or null if it names none. */
function projectNamedBy(env: EventEnvelope): string | null {
  switch (env.type) {
    case 'ticket.created':
      return (env.payload as { projectId: string }).projectId;
    // membership.granted / revoked name no project: membership is
    // workspace-scoped (owner decision 2026-08-27). Project association is
    // project.member_added / _removed, immediately below.
    case 'project.member_added':
    case 'project.member_removed':
      return env.entity.id;
    default:
      // project.created names the project it is bringing into existence.
      return null;
  }
}

export async function checkProjectExists(db: Queryable, env: EventEnvelope): Promise<Refusal | null> {
  const projectId = projectNamedBy(env);
  if (projectId === null) return null;
  if (await projectExists(db, env.workspaceId, projectId)) return null;
  return refuse('project.unknown', `There is no project ${projectId} in this workspace.`);
}
```

**Tests, both halves planted.** In `proj-projects.test.ts`: a `project.created` lands a row scoped to its workspace and carrying its creator; a re-delivered duplicate does not double-insert; `reset` empties it; and `projectExists` answers `false` for a real project id asked under the wrong workspace. In `check-project-exists.test.ts`, the planted defect is the reachable one — grant yourself membership on a `projectId` that was never founded, then create a ticket in it. Before this step the ticket is accepted; after it, the refusal is `project.unknown` and **not** `permission.role`, and the test asserts the rule name, because a refusal that fires for the wrong reason is what this step exists to remove. A second case asserts the ordering directly: a non-member creating a ticket in a project that does not exist is told the project does not exist, not that they are not a member.

**One thing this does not do.** `proj_projects` has no `project.renamed` handler because no such event is registered; when one is added it lands here.

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/server/`): `pnpm vitest run test/permissions/check-visibility-permission.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Run the full suite — the ingest wiring from Task 5 now enforces visibility with zero call-site changes**

Run (from `apps/server/`): `pnpm vitest run`
Expected: PASS, including Task 5's pipeline tests (their envelopes' actors could all see their tickets, or weren't ticket events).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/permissions/check-permission.ts apps/server/test/permissions/check-visibility-permission.test.ts
git commit -m "Guests and outsiders cannot act on tickets they cannot see: the visibility gate joins the role gate at the ingest door, visibility edits demand project-admin rights or creatorship, and a claim must name the ticket it rides on."
```

---

### Task 10: Rollup honesty — true totals with the restriction named

**Files:**
- Create: `apps/server/src/visibility/rollup.ts`
- Modify: `apps/server/src/routes/tickets.ts` (single-ticket response gains `rollup`)
- Test: `apps/server/test/visibility/rollup.test.ts`

**Interfaces:**
- Consumes: `proj_rollups` (Plan 3 — true DIRECT-children counts by category over ALL children, computed with no visibility filtering; columns per Cross-plan path assumptions); `proj_visibility` children index and `canSeeResolved`/`getResolvedVisibility` (Tasks 6–7); `resolveEffectiveRole` (Task 4).
- Produces: `RollupView { total: number; open: number; active: number; terminal: number; restrictedCount: number }`; `rollupFor(db: Queryable, viewerId: string, ticketId: string): Promise<RollupView | null>` (null = no children row); the single-ticket read response is now `{ ticket, parent, rollup: RollupView | null }`.

**The honesty mechanics:** `proj_rollups` already holds the truth over ALL children — visibility never touches the stored counts. `restrictedCount` is **per-viewer** and therefore computed at response assembly, never materialized: it is the number of direct children the viewer cannot see. The client renders "5 of 8 done · 2 restricted" from `{terminal: 5, total: 8, restrictedCount: 2}` — true counts, restriction named, nothing pretended absent.

- [ ] **Step 1: Write the failing planted-defect test**

```ts
// apps/server/test/visibility/rollup.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { rollupFor } from '../../src/visibility/rollup';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { applyAll, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed';

const WS = 'wks_01';
const PRJ = 'prj_01';

let pool: Pool;
beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

/** Seed Plan 3's rollup row directly — this plan reads it, Plan 3 maintains it. */
async function seedRollup(ticketId: string, open: number, active: number, terminal: number) {
  await pool.query(
    `INSERT INTO proj_rollups (ticket_id, open_count, active_count, terminal_count)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (ticket_id) DO UPDATE
       SET open_count = $2, active_count = $3, terminal_count = $4`,
    [ticketId, open, active, terminal],
  );
}

describe('rollupFor — planted defect: “5 of 8 done · 2 restricted”', () => {
  it('carries true totals over ALL children plus the count the viewer cannot see', async () => {
    await seedMember(pool, WS, 'usr_viewer', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_parent' });
    // 8 direct children; 5 terminal; 2 of them restricted to someone else.
    for (let i = 1; i <= 8; i++) {
      await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: `tkt_c${i}`, parentId: 'tkt_parent' });
    }
    await applyAll(pool, [
      setVisibilityEnv(WS, 'tkt_c7', 'explicit', ['usr_other']),
      setVisibilityEnv(WS, 'tkt_c8', 'explicit', ['usr_other']),
    ]);
    await seedRollup('tkt_parent', 2, 1, 5);

    const rollup = await rollupFor(pool, 'usr_viewer', 'tkt_parent');
    expect(rollup).toEqual({ total: 8, open: 2, active: 1, terminal: 5, restrictedCount: 2 });
  });

  it('a fully visible family reports restrictedCount 0 — the field is always present, never implied', async () => {
    await seedMember(pool, WS, 'usr_viewer', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_parent' });
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_c1', parentId: 'tkt_parent' });
    await seedRollup('tkt_parent', 1, 0, 0);
    expect(await rollupFor(pool, 'usr_viewer', 'tkt_parent')).toEqual({
      total: 1, open: 1, active: 0, terminal: 0, restrictedCount: 0,
    });
  });

  it('a ticket with no rollup row reports null — nothing is invented', async () => {
    await seedMember(pool, WS, 'usr_viewer', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_leaf' });
    expect(await rollupFor(pool, 'usr_viewer', 'tkt_leaf')).toBeNull();
  });

  it('restrictedCount is per-viewer: the listed user sees 0 restricted on the same parent', async () => {
    await seedMember(pool, WS, 'usr_listed', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_parent' });
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_c1', parentId: 'tkt_parent' });
    await applyAll(pool, [setVisibilityEnv(WS, 'tkt_c1', 'explicit', ['usr_listed'])]);
    await seedRollup('tkt_parent', 1, 0, 0);
    expect(await rollupFor(pool, 'usr_listed', 'tkt_parent')).toEqual({
      total: 1, open: 1, active: 0, terminal: 0, restrictedCount: 0,
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `apps/server/`): `pnpm vitest run test/visibility/rollup.test.ts`
Expected: FAIL — cannot resolve `../../src/visibility/rollup`.

- [ ] **Step 3: Implement rollupFor**

```ts
// apps/server/src/visibility/rollup.ts
import type { Queryable } from '../db/queryable';
import { resolveEffectiveRole } from '../permissions/effective-role';
import { canSeeResolved } from './can-see';

export interface RollupView {
  total: number;
  open: number;
  active: number;
  terminal: number;
  /** Direct children THIS viewer cannot see. Per-viewer — computed at read, never stored. */
  restrictedCount: number;
}

/**
 * True totals from proj_rollups (over ALL children — visibility never
 * touches the stored counts) plus the viewer's restrictedCount. The
 * client renders "5 of 8 done · 2 restricted" from {terminal, total,
 * restrictedCount}: true counts, restriction named, nothing pretended
 * absent (spec §6).
 */
export async function rollupFor(db: Queryable, viewerId: string, ticketId: string): Promise<RollupView | null> {
  const { rows } = await db.query(
    'SELECT open_count, active_count, terminal_count FROM proj_rollups WHERE ticket_id = $1',
    [ticketId],
  );
  if (rows.length === 0) return null;
  const open = Number(rows[0].open_count);
  const active = Number(rows[0].active_count);
  const terminal = Number(rows[0].terminal_count);

  const children = await db.query(
    `SELECT project_id, workspace_id, resolved_mode, resolved_user_ids
     FROM proj_visibility WHERE parent_id = $1`,
    [ticketId],
  );
  let restrictedCount = 0;
  if (children.rows.length > 0) {
    const eff = await resolveEffectiveRole(db, viewerId, children.rows[0].workspace_id);
    for (const child of children.rows) {
      const visible = canSeeResolved(eff, viewerId, {
        workspaceId: child.workspace_id,
        projectId: child.project_id,
        resolvedMode: child.resolved_mode,
        resolvedUserIds: child.resolved_user_ids,
      });
      if (!visible) restrictedCount += 1;
    }
  }
  return { total: open + active + terminal, open, active, terminal, restrictedCount };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/server/`): `pnpm vitest run test/visibility/rollup.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Embed the rollup in the single-ticket read**

In `apps/server/src/routes/tickets.ts`, add the import and extend the single-ticket handler's return:

```ts
import { rollupFor } from '../visibility/rollup';

// in the GET /v1/workspaces/:workspaceId/tickets/:ticketId handler,
// replace `return { ticket, parent };` with:
const rollup = await rollupFor(deps.pool, request.currentUserId, ticketId);
return { ticket, parent, rollup };
```

Add to `apps/server/test/routes/tickets-read.test.ts`:

```ts
it('the single read carries the rollup with true totals and the viewer’s restrictedCount', async () => {
  const { token, userId } = await sessionFor('+919000000107');
  await seedMember(pool, WS, userId, 'member', [{ projectId: 'prj_1' }]);
  await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_parent' });
  await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_c1', parentId: 'tkt_parent' });
  await seedTicket(pool, { workspaceId: WS, projectId: 'prj_1', ticketId: 'tkt_c2', parentId: 'tkt_parent' });
  await applyAll(pool, [setVisibilityEnv(WS, 'tkt_c2', 'explicit', ['usr_someone_else'])]);
  await pool.query(
    `INSERT INTO proj_rollups (ticket_id, open_count, active_count, terminal_count) VALUES ('tkt_parent', 1, 0, 1)`,
  );

  const res = await app.inject({
    method: 'GET',
    url: `/v1/workspaces/${WS}/tickets/tkt_parent`,
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.json().rollup).toEqual({ total: 2, open: 1, active: 0, terminal: 1, restrictedCount: 1 });
});
```

- [ ] **Step 6: Run the route tests and the full suite**

Run (from `apps/server/`): `pnpm vitest run test/routes/tickets-read.test.ts` then `pnpm vitest run`
Expected: PASS (route file now 7 tests; full suite green).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/visibility/rollup.ts apps/server/src/routes/tickets.ts apps/server/test/visibility/rollup.test.ts apps/server/test/routes/tickets-read.test.ts
git commit -m "Rollups tell the truth under restriction: stored counts stay computed over all children, and every response names how many of them this viewer cannot see — five of eight done, two restricted, nothing pretended absent."
```

---

### Task 11: visibleEventsFor — the sync-down visibility filter (Plan 10's interface)

**Files:**
- Create: `apps/server/src/visibility/visible-events-for.ts`
- Test: `apps/server/test/visibility/visible-events-for.test.ts`

**Interfaces:**
- Consumes: the `events` ledger table with its `workspace_seq` cursor column and `LedgerEvent` type (Plan 1), `canSee`/`canSeeResolved`/`getResolvedVisibility` (Task 7), `resolveEffectiveRole` (Task 4), `proj_visibility` (Task 6).
- Produces (THE interface Plan 10 consumes — do not rename anything here):
  - `interface PurgeInstruction { kind: 'purge'; entityId: string }`
  - `type SyncItem = LedgerEvent | PurgeInstruction` — each yielded event carries `workspaceSeq`, server-enriched per Plan 1 (the domain `EventEnvelope` stays frozen).
  - `visibleEventsFor(db: Queryable, userId: string, workspaceId: string, afterSeq: number): AsyncIterable<SyncItem>` — **`afterSeq` is the WORKSPACE cursor (`workspace_seq`), not a per-entity `seq`.** Per coordination §18, per-entity `seq` cannot order a workspace stream: every entity restarts at 1, so resuming a workspace at a per-entity number would silently skip newer entities' early events. Callers hand back the last `workspaceSeq` they saw and treat it as an opaque resume token.
  - The contract types the return as `AsyncIterable<EventEnvelope>`, but purge instructions force the union — flagged under Open questions, not silently resolved. A consumer discriminates with `'kind' in item && item.kind === 'purge'` (envelopes have no `kind` property at the top level; `entity.kind` is nested).

**Filter semantics (exact — each clause is a test):**

1. Events are streamed in `workspace_seq` order for `workspace_seq > afterSeq`, filtered against visibility **as of now** (current projections). The filter is a per-event primitive; backfilling a ticket's pre-`afterSeq` history when visibility is newly granted is Plan 10's job, on top of this interface.
2. **Ticket events:** yielded iff `canSee(userId, ticketId)` now. Events about invisible tickets are NEVER yielded — not even their existence.
3. **Purge on revocation:** when a `visibility.set` or `ticket.reparented` event in the range leaves the target — or any descendant inheriting from it — invisible to this user, yield `{kind:'purge', entityId: <ticketId>}` for each such ticket (deduplicated per call). The traversal prunes at authored descendants, exactly like re-resolution: their visibility cannot have changed from above.
4. **Purge on membership loss:** a `membership.revoked` or `project.member_removed` event in the range naming THIS user yields purges for every ticket in the lost scope that the user cannot see now.
5. **Non-ticket events:** workspace, project, and membership events go to non-guest members only. `workflow`/`ticket-type` definition events go to everyone including guests — a guest cannot render their explicitly-shared ticket's status without its workflow definition. (Both choices flagged under Open questions.)

- [ ] **Step 1: Write the failing tests**

```ts
// apps/server/test/visibility/visible-events-for.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { ulid } from 'ulidx';
import { membershipId, type EventEnvelope } from '@gisik-nokma/domain';
import type { LedgerEvent } from '../../src/ledger/event-store';
import { visibleEventsFor, type SyncItem } from '../../src/visibility/visible-events-for';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { testEnvelope } from '../helpers/envelope';
import { appendTestEvent } from '../helpers/ledger';
import { applyAll, seedGuest, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed';

const WS = 'wks_01';
const PRJ = 'prj_01';

let pool: Pool;
beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

/** Seed an event into BOTH the ledger and this plan's projections, like ingest would. */
async function record(env: LedgerEvent): Promise<LedgerEvent> {
  await appendTestEvent(pool, env);
  await applyAll(pool, [env]);
  return env;
}

/** `afterSeq` is the WORKSPACE cursor (coordination §18), never a per-entity seq. */
async function collect(userId: string, afterSeq = 0): Promise<SyncItem[]> {
  const items: SyncItem[] = [];
  for await (const item of visibleEventsFor(pool, userId, WS, afterSeq)) items.push(item);
  return items;
}

function idsOf(items: SyncItem[]): string[] {
  return items.map((i) => ('kind' in i && i.kind === 'purge' ? `purge:${i.entityId}` : (i as EventEnvelope).id));
}

function ticketEvent(type: string, ticketId: string, payload: unknown = {}, actorId = 'usr_a') {
  return testEnvelope({ workspaceId: WS, entity: { kind: 'ticket', id: ticketId }, type, payload, actorId });
}

describe('visibleEventsFor', () => {
  it('planted defect: events about invisible tickets are never yielded — not even their existence', async () => {
    await seedMember(pool, WS, 'usr_a', 'member', [{ projectId: 'prj_mine' }]);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_mine', ticketId: 'tkt_mine' });
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_other', ticketId: 'tkt_other' });
    const visible = await record(ticketEvent('ticket.transitioned', 'tkt_mine', { to: 'doing' }));
    await record(ticketEvent('ticket.transitioned', 'tkt_other', { to: 'done' }));

    const items = await collect('usr_a');
    expect(idsOf(items)).toContain(visible.id);
    const serialized = JSON.stringify(items);
    expect(serialized).not.toContain('tkt_other'); // the id itself must not leak in any yielded item
  });

  it('revocation by visibility.set yields a purge tombstone instead of the event', async () => {
    await seedMember(pool, WS, 'usr_a', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' });
    const revoke = await record(setVisibilityEnv(WS, 'tkt_1', 'explicit', ['usr_someone_else']));

    const items = await collect('usr_a', revoke.workspaceSeq - 1);
    expect(items).toEqual([{ kind: 'purge', entityId: 'tkt_1' }]);
  });

  it('an ancestor revocation purges inheriting descendants too — pruning at authored ones', async () => {
    await seedMember(pool, WS, 'usr_a', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_p' });
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_c', parentId: 'tkt_p' }); // inherits
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_open', parentId: 'tkt_p' });
    await applyAll(pool, [setVisibilityEnv(WS, 'tkt_open', 'project')]); // authored — survives the parent change
    const revoke = await record(setVisibilityEnv(WS, 'tkt_p', 'explicit', ['usr_someone_else']));

    const items = await collect('usr_a', revoke.workspaceSeq - 1);
    expect(idsOf(items).sort()).toEqual(['purge:tkt_c', 'purge:tkt_p']);
  });

  it('losing project membership purges that project’s now-invisible tickets', async () => {
    await seedMember(pool, WS, 'usr_a', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' }); // project-mode default
    const removal = await record(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'project', id: PRJ },
        type: 'project.member_removed',
        payload: { userId: 'usr_a' },
        actorId: 'usr_admin',
      }),
    );

    const items = await collect('usr_a', removal.workspaceSeq - 1);
    expect(idsOf(items)).toContain('purge:tkt_1');
  });

  it('definition events reach guests; membership events do not', async () => {
    await seedGuest(pool, WS, 'usr_g');
    const wf = await record(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'workflow', id: ulid() },
        type: 'workflow.defined',
        payload: {},
        actorId: 'usr_admin',
      }),
    );
    const grant = await record(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'membership', id: membershipId(WS, 'usr_new') },
        type: 'membership.granted',
        payload: { userId: 'usr_new', role: 'member' },
        actorId: 'usr_admin',
      }),
    );

    const guestItems = idsOf(await collect('usr_g'));
    expect(guestItems).toContain(wf.id);
    expect(guestItems).not.toContain(grant.id);

    await seedMember(pool, WS, 'usr_m', 'member');
    const memberItems = idsOf(await collect('usr_m'));
    expect(memberItems).toContain(wf.id);
    expect(memberItems).toContain(grant.id);
  });

  it('a non-member of the workspace receives nothing at all', async () => {
    await seedMember(pool, WS, 'usr_a', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' });
    await record(ticketEvent('ticket.transitioned', 'tkt_1', { to: 'doing' }));
    expect(await collect('usr_stranger')).toEqual([]);
  });

  it('respects afterSeq as the WORKSPACE cursor: only events beyond it are yielded, and each carries its own cursor', async () => {
    await seedMember(pool, WS, 'usr_a', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' });
    const first = await record(ticketEvent('comment.added', 'tkt_1', { body: 'one' }));
    const second = await record(ticketEvent('comment.added', 'tkt_1', { body: 'two' }));
    const tail = await collect('usr_a', first.workspaceSeq);
    expect(idsOf(tail)).toEqual([second.id]);
    // The consumer resumes from what it was handed, so the cursor must travel.
    expect((tail[0] as LedgerEvent).workspaceSeq).toBe(second.workspaceSeq);
  });

  it('planted defect: a ticket born after the cursor is never skipped — the cursor counts the workspace, not the entity', async () => {
    await seedMember(pool, WS, 'usr_a', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_old' });
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_new' });
    await record(ticketEvent('comment.added', 'tkt_old', { body: 'one' }));
    const older = await record(ticketEvent('comment.added', 'tkt_old', { body: 'two' }));
    // tkt_new's FIRST event: per-entity seq 1, workspace cursor past `older`.
    // An iterator ordering by `seq > afterSeq` drops it and never recovers —
    // the defect coordination §18 exists to kill.
    const newborn = await record(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'ticket', id: 'tkt_new' },
        type: 'comment.added',
        payload: { body: 'hello' },
        actorId: 'usr_a',
        seq: 1,
      }),
    );
    expect(newborn.seq).toBeLessThan(older.seq);
    expect(newborn.workspaceSeq).toBeGreaterThan(older.workspaceSeq);
    expect(idsOf(await collect('usr_a', older.workspaceSeq))).toEqual([newborn.id]);
  });

  it('planted defect: a yielded event carries ISO instants, not stringified Dates — and a +05:30 claim arrives as the equivalent Z', async () => {
    await seedMember(pool, WS, 'usr_a', 'member', [{ projectId: PRJ }]);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' });
    // 2026-08-20T14:30:00+05:30 IS 2026-08-20T09:00:00Z. Both columns are
    // timestamptz, so pg returns Date — and `String(aDate)` would yield
    // 'Wed Aug 19 2026 …GMT+0530 (India Standard Time)', which no replica
    // could parse as the instant `EventEnvelope` promises.
    const claim = await record(
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'ticket', id: 'tkt_1' },
        type: 'comment.added',
        payload: { body: 'filed from a phone in Shillong' },
        actorId: 'usr_a',
        clientTime: '2026-08-20T14:30:00.000+05:30',
        serverTime: '2026-08-20T09:00:02.000Z',
      }),
    );

    const yielded = (await collect('usr_a', claim.workspaceSeq - 1))[0] as LedgerEvent;
    expect(yielded.clientTime).toBe('2026-08-20T09:00:00.000Z');
    expect(yielded.serverTime).toBe('2026-08-20T09:00:02.000Z');
    // Round-trippable by any consumer, in any runtime, with no locale in play.
    expect(new Date(yielded.clientTime).toISOString()).toBe(yielded.clientTime);
    // The skew between the two clocks is preserved: two facts, still two.
    expect(Date.parse(yielded.serverTime) - Date.parse(yielded.clientTime)).toBe(2000);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `apps/server/`): `pnpm vitest run test/visibility/visible-events-for.test.ts`
Expected: FAIL — cannot resolve `../../src/visibility/visible-events-for`.

- [ ] **Step 3: Implement the filter**

```ts
// apps/server/src/visibility/visible-events-for.ts
import type { EventEnvelope } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable';
import type { LedgerEvent } from '../ledger/event-store';
import { resolveEffectiveRole } from '../permissions/effective-role';
import { canSee } from './can-see';

export interface PurgeInstruction {
  kind: 'purge';
  entityId: string;
}

/**
 * "Everything you held in this scope is gone" — one instruction instead of one
 * purge per ticket (owner decision 2026-08-27). Per-id purges tell the
 * recipient how many tickets existed in a scope, including ids they never held.
 * For a member losing a project that is a minor count-leak, consistent with the
 * restricted-parent existence-leak spec §6 already accepts. For a GUEST being
 * revoked it is an external party learning the size of work they were never
 * shown, so guests get this instead. The replica's handling is a local delete
 * by scope, so it is idempotent like a purge.
 */
export interface ScopeRevokedInstruction {
  kind: 'scope-revoked';
  workspaceId: string;
  projectId?: string;
}

export type SyncItem = LedgerEvent | PurgeInstruction | ScopeRevokedInstruction;

const VISIBILITY_AFFECTING: ReadonlySet<string> = new Set(['visibility.set', 'ticket.reparented']);

function envelopeFromRow(row: Record<string, unknown>): LedgerEvent {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    entity: { kind: row.entity_kind as EventEnvelope['entity']['kind'], id: row.entity_id as string },
    type: row.type as string,
    version: Number(row.version),
    payload: row.payload,
    actorId: row.actor_id as string,
    origin: row.origin as EventEnvelope['origin'],
    // Both clocks are `timestamptz` (Plan 1 Task 6, owner decision
    // 2026-08-20), so the driver hands back `Date`. `String(aDate)` would
    // print a locale string — 'Wed Aug 19 2026 15:30:00 GMT+0530 (India
    // Standard Time)' — which is not the ISO instant `EventEnvelope`
    // declares. Convert the way Plan 1's `rowToEnvelope` does, and only
    // that way.
    clientTime: (row.client_time as Date).toISOString(),
    serverTime: (row.server_time as Date).toISOString(),
    seq: Number(row.seq),
    // Server-enriched (Plan 1, coordination §18): the domain envelope stays
    // frozen; the cursor rides along so the consumer can resume by it.
    workspaceSeq: Number(row.workspace_seq),
  };
}

/** ticketId plus every inheriting descendant (pruned at authored nodes) the user cannot see now. */
async function nowInvisibleInheritSubtree(db: Queryable, userId: string, ticketId: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(id: string): Promise<void> {
    if (!(await canSee(db, userId, id))) out.push(id);
    const { rows } = await db.query(
      'SELECT ticket_id, own_mode FROM proj_visibility WHERE parent_id = $1 ORDER BY ticket_id',
      [id],
    );
    for (const child of rows as Array<{ ticket_id: string; own_mode: string }>) {
      if (child.own_mode === 'inherit') await walk(child.ticket_id);
    }
  }
  await walk(ticketId);
  return out;
}

/**
 * What a person just lost. This is NOT the old `MembershipScope` — membership
 * is workspace-scoped now and its payload carries no scope at all. Losing a
 * scope is a fact about a purge, computed from which event arrived
 * (`membership.revoked` → the workspace; `project.member_removed` → that
 * project), so the type lives here with the purge rather than in the vocabulary.
 */
type LostScope = 'workspace' | { projectId: string };

/** Does any ticket this user can see use this definition? The guest slice. */
async function definitionIsUsedByVisibleTicket(
  db: Queryable,
  userId: string,
  env: EventEnvelope,
): Promise<boolean> {
  // Fixed ternary, not caller input — the column name can never be user data.
  const column = env.entity.kind === 'workflow' ? 'workflow_id' : 'type_id';
  const { rows } = await db.query(
    `SELECT ticket_id FROM proj_tickets WHERE ${column} = $1 ORDER BY ticket_id`,
    [env.entity.id],
  );
  for (const row of rows as Array<{ ticket_id: string }>) {
    if (await canSee(db, userId, row.ticket_id)) return true;
  }
  return false;
}

/**
 * The definitions one ticket needs, as ledger events, skipping any this stream
 * already sent. Yielded ahead of a guest's ticket event so a status is never
 * unrenderable: the definition may have been withheld earlier, correctly,
 * because at that point no visible ticket used it.
 */
async function* definitionsFor(
  db: Queryable,
  ticketId: string,
  already: Set<string>,
): AsyncGenerator<LedgerEvent> {
  const { rows } = await db.query(
    'SELECT workflow_id, type_id FROM proj_tickets WHERE ticket_id = $1',
    [ticketId],
  );
  const ticket = rows[0] as { workflow_id: string; type_id: string } | undefined;
  if (ticket === undefined) return;
  for (const definitionId of [ticket.workflow_id, ticket.type_id]) {
    if (already.has(definitionId)) continue;
    const { rows: defRows } = await db.query(
      `SELECT * FROM events WHERE entity_id = $1 AND entity_kind IN ('workflow', 'ticket-type')
       ORDER BY seq DESC LIMIT 1`,
      [definitionId],
    );
    if (defRows.length === 0) continue;
    already.add(definitionId);
    yield envelopeFromRow(defRows[0] as Record<string, unknown>);
  }
}

/** All tickets in the lost scope the user cannot see now. */
async function nowInvisibleTicketsInScope(
  db: Queryable,
  userId: string,
  workspaceId: string,
  scope: LostScope,
): Promise<string[]> {
  const where = scope === 'workspace' ? 'workspace_id = $1' : 'workspace_id = $1 AND project_id = $2';
  const params = scope === 'workspace' ? [workspaceId] : [workspaceId, scope.projectId];
  const { rows } = await db.query(`SELECT ticket_id FROM proj_visibility WHERE ${where} ORDER BY ticket_id`, params);
  const out: string[] = [];
  for (const row of rows as Array<{ ticket_id: string }>) {
    if (!(await canSee(db, userId, row.ticket_id))) out.push(row.ticket_id);
  }
  return out;
}

/**
 * The sync-down visibility filter (Plan 10's interface). Streams ledger
 * events past afterSeq, filtered against visibility AS OF NOW:
 * events about invisible tickets are never yielded; whatever revocation
 * takes away comes back as a purge tombstone. Backfill on newly granted
 * visibility is Plan 10's job, on top of this primitive.
 *
 * afterSeq is the WORKSPACE cursor (`workspace_seq`, coordination §18) — per
 * entity `seq` restarts at 1 for every entity, so ordering a workspace stream
 * by it would silently skip the early events of anything born after the
 * cursor. Callers hand back the last `workspaceSeq` they were given and treat
 * it as opaque.
 */
export async function* visibleEventsFor(
  db: Queryable,
  userId: string,
  workspaceId: string,
  afterSeq: number,
): AsyncGenerator<SyncItem> {
  const eff = await resolveEffectiveRole(db, userId, workspaceId);
  if (eff.workspaceRole === null) return;
  const isGuest = eff.workspaceRole === 'guest';
  const purged = new Set<string>();
  const sentDefinitions = new Set<string>();

  async function* purge(ids: string[]): AsyncGenerator<PurgeInstruction> {
    for (const id of ids) {
      if (!purged.has(id)) {
        purged.add(id);
        yield { kind: 'purge', entityId: id };
      }
    }
  }

  /**
   * A member is told which tickets went; a guest is told only that the scope
   * went. The ids are the leak — per-id purges reveal how many tickets existed,
   * including ones the recipient never held. A member already lives inside the
   * workspace's accepted existence-leak; an external guest does not, and
   * learning the size of work they were never shown is not something losing
   * access should teach them. The ticket list is not even computed for a guest,
   * so nothing counts it.
   */
  async function* revoke(
    guest: boolean,
    instruction: ScopeRevokedInstruction,
    idsInScope: () => Promise<string[]>,
  ): AsyncGenerator<SyncItem> {
    if (guest) {
      yield instruction;
      return;
    }
    yield* purge(await idsInScope());
  }

  const { rows } = await db.query(
    `SELECT id, workspace_id, entity_kind, entity_id, type, version, payload,
            actor_id, origin, client_time, server_time, seq, workspace_seq
     FROM events
     WHERE workspace_id = $1 AND workspace_seq > $2
     ORDER BY workspace_seq ASC`,
    [workspaceId, afterSeq],
  );

  for (const row of rows as Array<Record<string, unknown>>) {
    const env = envelopeFromRow(row);
    switch (env.entity.kind) {
      case 'ticket': {
        if (await canSee(db, userId, env.entity.id)) {
          // The ordering hole the guest slice would otherwise open: a workflow
          // published BEFORE this guest could see any ticket using it was
          // withheld at the time, correctly — and then a later `visibility.set`
          // hands them a ticket whose status they cannot render. So a guest's
          // ticket event carries its definitions ahead of it if this stream has
          // not already sent them. Definitions upsert on the replica, so a
          // re-send is a no-op rather than a correction.
          if (isGuest) yield* definitionsFor(db, env.entity.id, sentDefinitions);
          yield env;
        }
        // Even when the event itself is visible, it may have flipped an
        // inheriting descendant out of this user's view.
        if (VISIBILITY_AFFECTING.has(env.type)) {
          yield* purge(await nowInvisibleInheritSubtree(db, userId, env.entity.id));
        }
        break;
      }
      case 'membership': {
        const p = env.payload as { userId: string };
        // Membership carries no scope now: losing it is losing the workspace.
        if (env.type === 'membership.revoked' && p.userId === userId) {
          yield* revoke(isGuest, { kind: 'scope-revoked', workspaceId }, () =>
            nowInvisibleTicketsInScope(db, userId, workspaceId, 'workspace'));
        }
        if (!isGuest) yield env;
        break;
      }
      case 'project': {
        if (env.type === 'project.member_removed' && (env.payload as { userId: string }).userId === userId) {
          yield* revoke(isGuest, { kind: 'scope-revoked', workspaceId, projectId: env.entity.id }, () =>
            nowInvisibleTicketsInScope(db, userId, workspaceId, { projectId: env.entity.id }));
        }
        if (!isGuest) yield env;
        break;
      }
      case 'workspace': {
        if (!isGuest) yield env;
        break;
      }
      case 'workflow':
      case 'ticket-type': {
        // Members get every definition. A guest gets only the ones their own
        // visible tickets need: shipping all of them hands an external party
        // every state name in the workspace — the shape of internal process,
        // for work they cannot see (owner decision 2026-08-27).
        if (!isGuest || (await definitionIsUsedByVisibleTicket(db, userId, env))) {
          sentDefinitions.add(env.entity.id);
          yield env;
        }
        break;
      }
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/server/`): `pnpm vitest run test/visibility/visible-events-for.test.ts`
Expected: PASS (9 tests) — including the workspace-cursor defect (a newborn entity's first event survives a resume) and the instant-serialization defect (a `+05:30` claim arrives as the equivalent `…Z`, never a stringified `Date`).

- [ ] **Step 5: Run the full suite and commit**

Run (from `apps/server/`): `pnpm vitest run` — Expected: PASS.

```bash
git add apps/server/src/visibility/visible-events-for.ts apps/server/test/visibility/visible-events-for.test.ts
git commit -m "Sync-down never leaks and never skips: visibleEventsFor walks the workspace stream by workspace_seq so a ticket born after the cursor still arrives, streams only visible-ticket events, walks inherit subtrees to purge what a revocation took away, and hands guests the definitions they need without the membership history they don't."
```

---

### Task 12: Route-level security proofs, session hygiene, and the sync ledgers

**Files:**
- Create: `apps/server/test/routes/security.test.ts`
- Modify: `Features.md` (new server-core bullets)
- Create: `test-cases/06-auth-visibility.md` (this plan's own bucket, per the coordination doc §2)

**Interfaces:**
- Consumes: everything this plan built; Plan 1's ingest HTTP route `POST /v1/events`, body `{ events: [envelope, …] }` — the workspace travels inside each envelope, not in the path (verified against Plan 1 Task 11, not assumed).
- Produces: end-to-end proof that the permission and visibility layers hold at the HTTP surface, plus the Features.md / test-cases entries the workspace convention demands in the same change set. (`POST /v1/workspaces` is the one route not proven here — it arrives in Task 13 with its own file, including its no-session 401.)

- [ ] **Step 1: Write the failing end-to-end security tests**

```ts
// apps/server/test/routes/security.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app'; // Plan 1's app builder — adapt name/signature, keep the assertions
import { LogOtpSender } from '../../src/auth/otp-sender';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { signInWithPhone } from '../helpers/session';
import { seedGuest, seedMember, seedTicket } from '../helpers/seed';
import { testEnvelope } from '../helpers/envelope';

const WS = 'wks_01';
const PRJ = 'prj_01';

let pool: Pool;
let app: FastifyInstance;
let otp: LogOtpSender;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  otp = new LogOtpSender(() => {});
  // Build the real app with the dev senders injected; adapt to the
  // builder's actual dependency-injection shape.
  ({ app } = await buildApp({ pool, otpSender: otp }));
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

async function sessionFor(phone: string): Promise<{ token: string; userId: string }> {
  const token = await signInWithPhone(app, otp, phone);
  const session = await app.inject({
    method: 'GET',
    url: '/api/auth/get-session',
    headers: { authorization: `Bearer ${token}` },
  });
  return { token, userId: session.json().user.id };
}

describe('security at the HTTP surface', () => {
  it('planted defect: a guest ingesting an event on an invisible ticket is refused with the standard shape', async () => {
    const { token, userId } = await sessionFor('+919000000201');
    await seedGuest(pool, WS, userId);
    await seedTicket(pool, { workspaceId: WS, projectId: PRJ, ticketId: 'tkt_1' }); // not explicitly shared

    const env = testEnvelope({
      workspaceId: WS,
      entity: { kind: 'ticket', id: 'tkt_1' },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
      actorId: userId,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: `Bearer ${token}` },
      payload: { events: [env] },
    });
    expect(res.json()).toMatchObject({
      refused: true,
      rule: 'permission.visibility',
      reason: 'This ticket is not visible to you.',
    });
    // Status code follows Plan 1's refusal convention (its ingest tests
    // document it); the body above is this plan's contract.
  });

  it('planted defect: a member reading another project’s ticket via direct id is refused as 404', async () => {
    const { token, userId } = await sessionFor('+919000000202');
    await seedMember(pool, WS, userId, 'member', [{ projectId: 'prj_mine' }]);
    await seedTicket(pool, { workspaceId: WS, projectId: 'prj_other', ticketId: 'tkt_secret' });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WS}/tickets/tkt_secret`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('an unauthenticated ingest is a 401 before any permission logic runs', async () => {
    const env = testEnvelope({
      workspaceId: WS,
      entity: { kind: 'ticket', id: 'tkt_1' },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
      actorId: 'usr_nobody',
    });
    const res = await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [env] } });
    expect(res.statusCode).toBe(401);
  });

  it('sign-out invalidates the session token (fixation/expiry basics per the auth library)', async () => {
    const { token } = await sessionFor('+919000000203');
    const before = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(before.json().user).toBeTruthy();

    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    const after = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.json()?.user ?? null).toBeNull(); // the old token opens nothing
  });

  it('a pre-set cookie value never becomes the session (no fixation): sign-in issues a fresh token', async () => {
    const before = otp.sent.length;
    await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: '+919000000204' },
    });
    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      headers: { cookie: 'better-auth.session_token=attacker-chosen-value' },
      payload: { phoneNumber: '+919000000204', code: otp.sent[before].code },
    });
    const setCookie = String(verify.headers['set-cookie']);
    expect(setCookie).not.toContain('attacker-chosen-value');
    expect(setCookie).toMatch(/HttpOnly/i);
  });
});
```

- [ ] **Step 2: Run to verify state, fix wiring until green**

Run (from `apps/server/`): `pnpm vitest run test/routes/security.test.ts`
Expected: initially FAIL wherever the app builder does not yet expose sender injection or the ingest route lacks `requireSession`; fix the assembly (builder accepts `otpSender`/`magicLinkSender` overrides; ingest route uses `makeRequireSession` and passes `request.currentUserId` into `checkPermission`) until: PASS (5 tests).

- [ ] **Step 3: Run the entire workspace verification**

Run (from the repo root):
```bash
pnpm -r vitest run
pnpm --filter ./apps/server run verify-projections   # adapt to Plan 1's script name
```
Expected: every package green; the verifier re-derives proj_memberships and proj_visibility from the ledger with zero diffs.

- [ ] **Step 4: Update Features.md**

Append to `Features.md` (§6 is this plan's section, settled per the coordination doc §2):

```markdown
## 6. Server core — auth, membership & visibility

- ⚙️ **Identity & sessions** — better-auth on Fastify: phone OTP, email magic link, Google OAuth, passkeys; no passwords. httpOnly-cookie sessions for web, bearer tokens for the apps. OTP delivery behind `OtpSender` (dev/log implementation; the DLT-registered SMS provider is a deployment concern). Identity is infrastructure, not events. `apps/server/src/auth/`
- ⚙️ **Membership events & effective roles** — `workspace.created`, `project.created`, `membership.granted`/`membership.revoked`, `project.member_added`/`project.member_removed` in the ledger; `proj_memberships` resolves each user's workspace role and per-project admin flags; founding a workspace appends the default simple-Kanban workflow, the four built-in ticket types bound to it, and the founder's owner grant — in that order, on accept and never on a duplicate re-submission. `apps/server/src/projections/proj-memberships.ts`, `apps/server/src/workspaces/bootstrap-workspace.ts`
- ⚙️ **Project existence** — `proj_projects` makes `project.created` answerable, and every event that names a project is checked against it before any membership question is asked, so a ticket can never be created into a project nobody founded and nobody is ever refused for the wrong reason. Scoped by workspace: a project id from another workspace is not found. `apps/server/src/projections/proj-projects.ts`, `apps/server/src/permissions/check-permission.ts`
- ✅ **Permission refusals** — a pre-engine ingest gate refuses identity spoofing, borrowed server origin, and role shortfalls with the standard `{refused, rule, reason}` shape (`permission.role`, `permission.visibility`), reasons in plain language, every refusal proven against a planted defect. `apps/server/src/permissions/`
- ✅ **Ticket visibility** — `visibility.set` claims a mode (workspace / project / explicit / inherit); `proj_visibility` resolves every ticket's audience by walking inherit chains to the nearest authored ancestor (roots default to project) and re-resolves on reparent and ancestor changes; `canSee` backs 404-enforced reads and one-pass filtered lists; guests see only explicit shares; the owner reads the whole workspace (a disclosed power, never a hidden one); admins get no bypass and join projects on the record like anyone else. `apps/server/src/visibility/`
- ✅ **Honesty under restriction** — rollup responses carry true totals over all children plus the viewer's `restrictedCount`; a visible child under a restricted parent gets `{kind: 'restricted'}` — existence, no title; ledger history goes out with provenance untouched for anyone entitled to see. `apps/server/src/visibility/rollup.ts`, `apps/server/src/routes/tickets.ts`
- ⚙️ **Visibility-scoped sync feed** — `visibleEventsFor(userId, workspaceId, afterSeq)` walks the workspace stream in `workspace_seq` order (the per-workspace cursor, coordination §18 — never per-entity `seq`, which would skip newborn entities on resume), yields only visible-ticket events, each carrying its cursor and both clocks as absolute ISO 8601 `Z` instants, plus `{kind:'purge'}` tombstones for whatever revocation takes away; the interface the sync plan consumes. `apps/server/src/visibility/visible-events-for.ts`
```

- [ ] **Step 5: Create the test-cases bucket**

Create `test-cases/06-auth-visibility.md` (this plan's own bucket, cases 6.1–6.20, settled per the coordination doc §2; Plans 1–3 own buckets 03–05 — never renumber existing IDs):

```markdown
# 6. Server core — auth, membership & visibility

Mirrors Features.md §6. Status: ❌ not covered · ✅ covered · 🟡 partial · 🧪 manual · 🚫 out of scope.

- **6.1** ✅ Phone OTP sign-in end-to-end: code delivered via OtpSender, verify opens an httpOnly-cookie session. (`test/auth/sign-in-flows.test.ts`)
- **6.2** ✅ Email magic link sign-in: link delivered via MagicLinkSender, following it opens a session. (`test/auth/sign-in-flows.test.ts`)
- **6.3** ✅ Bearer-token sessions authenticate the apps via the Authorization header. (`test/auth/sign-in-flows.test.ts`)
- **6.4** ✅ Unauthenticated and forged-token requests get a generic 401. (`test/auth/require-session.test.ts`)
- **6.5** ✅ proj_memberships resolves effective roles: grants, re-grants, revocations, project rosters; a project-scope guest is a guest of the workspace; deterministic rebuild. (`test/projections/proj-memberships.test.ts`, `test/permissions/effective-role.test.ts`)
- **6.6** ✅ Admin-only event types (workflow.defined, ticket-type.defined, project.created) are refused to plain members with rule permission.role. (`test/permissions/check-role-permission.test.ts`)
- **6.7** ✅ A claim submitted as another person (actorId ≠ session user) is refused. (`test/permissions/check-role-permission.test.ts`)
- **6.8** ✅ A client-submitted event wearing origin 'server' is refused; founding a workspace appends the whole founding sequence server-side. (`test/permissions/check-role-permission.test.ts`)
- **6.9** ✅ Visibility resolution: authored modes win, inherit chains walk to the nearest authored ancestor, roots default to project mode. (`test/projections/proj-visibility.test.ts`)
- **6.10** ✅ Re-resolution on reparent and on ancestor visibility change, pruning at authored descendants; deterministic rebuild. (`test/projections/proj-visibility.test.ts`)
- **6.11** ✅ A guest acting on a ticket not explicitly shared with them is refused with rule permission.visibility (pipeline and HTTP). (`test/permissions/check-visibility-permission.test.ts`, `test/routes/security.test.ts`)
- **6.12** ✅ A member reading or acting on another project's ticket via direct id is refused — reads as an indistinguishable 404, ingest as permission.visibility. (`test/routes/security.test.ts`, `test/permissions/check-visibility-permission.test.ts`)
- **6.13** ✅ Rollups carry true totals over ALL children plus per-viewer restrictedCount — the "5 of 8 done · 2 restricted" planted defect. (`test/visibility/rollup.test.ts`)
- **6.14** ✅ A visible child under a restricted parent returns parent {kind:'restricted', id} — existence, no title. (`test/routes/tickets-read.test.ts`)
- **6.15** ✅ Provenance is never redacted: ticket history returns actor and both times untouched even when the actor shares no project with the viewer — both clocks arriving as absolute ISO 8601 `Z` instants, which is what "untouched" means for a `timestamptz` column. (`test/routes/tickets-read.test.ts`)
- **6.16** ✅ visibleEventsFor never yields events about invisible tickets — the id itself does not appear in any yielded item. (`test/visibility/visible-events-for.test.ts`)
- **6.17** ✅ Revocation yields purge tombstones: direct visibility.set, inheriting descendants (pruned at authored nodes), and membership loss. (`test/visibility/visible-events-for.test.ts`)
- **6.18** ✅ Session hygiene: sign-out invalidates the token; a pre-set cookie never becomes the session; session cookies are HttpOnly. (`test/routes/security.test.ts`)
- **6.19** ✅ visibility.set demands project-admin rights or ticket creatorship, and must name the ticket it is attached to. (`test/permissions/check-visibility-permission.test.ts`)
- **6.20** 🚫 Real SMS delivery through the DLT-registered provider — deployment concern, tracked as an operational errand, not a test. (this plan, Open questions)
- **6.21** ✅ visibleEventsFor resumes by the WORKSPACE cursor: only events past `workspace_seq > afterSeq` are yielded, each carries its `workspaceSeq`, and the planted defect proves a ticket born after the cursor is not skipped (per-entity `seq` would bury its first event). (`test/visibility/visible-events-for.test.ts`)
- **6.22** ✅ Planted defect: a yielded envelope's clocks are ISO 8601 `Z` instants, not stringified `Date`s — a claim submitted at `+05:30` arrives as the equivalent `…Z`, still parseable by any runtime, with the client/server skew intact. (`test/visibility/visible-events-for.test.ts`)
```

- [ ] **Step 6: Final full run and commit**

Run (from the repo root): `pnpm -r vitest run`
Expected: PASS everywhere.

```bash
git add apps/server/test Features.md test-cases/06-auth-visibility.md
git commit -m "Route-level security proven end to end — the guest, the prober, and the fixated cookie all bounce — and Features.md with test-cases now record what the auth and visibility layer holds."
```

---

### Task 13: The founding route — `POST /v1/workspaces`

Task 5 gave a founded workspace everything it needs to be usable. This task gives the product a door to found one through. Until the owner decision of 2026-08-26 there was **no** workspace-creation route anywhere in the series — the surface was unowned end to end, and every workspace in every test arrived by hand-appending a `workspace.created` envelope.

**Route prefix, stated once:** the whole product API lives under `/v1/*` (coordination doc amendment 20). better-auth's vendor surface at `/api/auth/*` is the only exception, and it is deliberate. Task 8's ticket read routes were written `/api/workspaces/...` before amendment 20 landed and were moved to `/v1/workspaces/...` on 2026-08-27, along with this plan's end-to-end tests. There is now one idiom in this plan and nothing to flag at execution.

**Files:**
- Create: `apps/server/src/routes/workspaces.ts`
- Modify: `apps/server/src/app.ts` (register the route alongside the ticket routes)
- Modify: `Features.md` (§6 — the founding bullet), `test-cases/06-auth-visibility.md` (cases 6.23–6.25)
- Test: `apps/server/test/routes/workspaces.test.ts`

**Interfaces:**
- Consumes: `makeRequireSession` (Task 2), the ingest path (Task 5's wiring — the route submits through it, so `bootstrapWorkspace` fires exactly as it does for Plan 11's seed CLIs), `newUlid` from `@gisik-nokma/domain`.
- Produces: `registerWorkspaceRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth; ingest: IngestService }): void` serving `POST /v1/workspaces` with body `{ name: string }` → `201 { workspaceId: string }`, or the ingest layer's own refusal/invalid body verbatim.

- [ ] **Step 1: Write the failing route test**

```ts
// apps/server/test/routes/workspaces.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app'; // Plan 1's app builder — adapt name/signature
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { signInWithPhone } from '../helpers/session';

let pool: Pool;
let app: FastifyInstance;

describe('POST /v1/workspaces', () => {
  beforeAll(async () => {
    migrateTestDb();
    pool = testPool();
    app = await buildApp({ pool });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('founds a workspace and returns its id', async () => {
    const { token } = await signInWithPhone('+919000000201');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Convenience Corner' },
    });
    expect(res.statusCode).toBe(201);
    const { workspaceId } = res.json() as { workspaceId: string };
    expect(workspaceId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('the founded workspace arrives usable — owner, a workflow, and all four built-in types', async () => {
    const { token, userId } = await signInWithPhone('+919000000202');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Convenience Corner' },
    });
    const { workspaceId } = res.json() as { workspaceId: string };

    const role = await pool.query(
      'SELECT role FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = $3',
      [workspaceId, userId, 'workspace'],
    );
    expect(role.rows).toEqual([{ role: 'owner' }]);

    const workflows = await pool.query('SELECT workflow_id FROM proj_workflows WHERE workspace_id = $1', [workspaceId]);
    expect(workflows.rows).toHaveLength(1);
    const types = await pool.query(
      'SELECT type_id, workflow_id FROM proj_ticket_types WHERE workspace_id = $1 ORDER BY rank',
      [workspaceId],
    );
    expect(types.rows.map((row) => row.type_id)).toEqual(['epic', 'story', 'task', 'sub-task']);
    for (const row of types.rows) {
      expect(row.workflow_id).toBe(workflows.rows[0].workflow_id);
    }
  });

  it('a request with no session is refused with the generic 401 — founding needs a signed-in person', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/workspaces', payload: { name: 'Nobody' } });
    expect(res.statusCode).toBe(401);
  });

  it('a nameless workspace is refused, and nothing is appended', async () => {
    const { token } = await signInWithPhone('+919000000203');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: '   ' },
    });
    expect(res.statusCode).toBe(400);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM events');
    expect(rows[0].n).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `apps/server/`): `pnpm vitest run test/routes/workspaces.test.ts`
Expected: FAIL — 404 on the route.

- [ ] **Step 3: Implement the route**

```ts
// apps/server/src/routes/workspaces.ts
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth';
import { makeRequireSession } from '../auth/require-session';
import type { IngestService } from '../ingest/ingest-service'; // Plan 1's ingest entry point — adapt the name

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  deps: { pool: Pool; auth: Auth; ingest: IngestService },
): void {
  const requireSession = makeRequireSession(deps.auth);

  app.post('/v1/workspaces', { preHandler: requireSession }, async (request, reply) => {
    const { name } = (request.body ?? {}) as { name?: unknown };
    if (typeof name !== 'string' || name.trim() === '') {
      return reply.code(400).send({ error: 'invalid', message: 'A workspace needs a name.' });
    }

    // A workspace's id IS its founding entity's id — one ULID, minted here.
    const workspaceId = newUlid();
    // Origin is the caller's, not 'server': this is a person's claim to have
    // founded a workspace, and `checkRolePermission` refuses a borrowed server
    // origin (Task 5). `actorId` must equal the session user for the same
    // reason. The gate then lets `workspace.created` through without a
    // membership — founding needs a session, not a membership.
    const founding: SubmittedEvent = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.created',
      version: 1,
      payload: { name: name.trim() },
      actorId: request.currentUserId,
      origin: 'web',
      clientTime: new Date().toISOString(),
    };

    // Through the ordinary ingest path — which is what appends the default
    // workflow, the four built-in types and the founder's owner grant
    // (Task 5's `bootstrapWorkspace`). The route knows nothing about that
    // sequence, deliberately: Plan 11's seed CLIs found workspaces through the
    // same path, and there is exactly one founding sequence between them.
    const [result] = await deps.ingest.ingestBatch([founding], { sessionUserId: request.currentUserId });
    if (result === undefined) throw new Error('ingest returned no result for the founding event');
    if (result.status !== 'committed') return reply.code(422).send(result); // refusal/invalid body verbatim
    return reply.code(201).send({ workspaceId });
  });
}
```

Register it where Task 8's ticket routes are registered, in `apps/server/src/app.ts`.

- [ ] **Step 4: Run to verify it passes**

Run (from `apps/server/`): `pnpm vitest run test/routes/workspaces.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 4b: The workspace directory — `GET /v1/me/workspaces`**

Added at Plan 6's walk (2026-08-27), which found the gap the hard way: Plan 6's navigation codes against this route, its Playwright smoke *mocks* it — and no plan served it. A signed-in person could found a workspace and then have no way to be told they belong to it.

In the same `routes/workspaces.ts`:

```ts
// GET /v1/me/workspaces → { workspaces: [{ workspaceId, name, role }] }
// proj_memberships holds the person's workspace-scope rows; the name comes
// from workspaceNameFromLedger (Task 14's helper — latest workspace.created/
// renamed), which collapses into a workspace projection if one ever grows.
app.get('/v1/me/workspaces', { preHandler: requireSession }, async (request) => {
  const { rows } = await deps.pool.query(
    `SELECT workspace_id, role FROM proj_memberships
     WHERE user_id = $1 AND scope_kind = 'workspace' ORDER BY workspace_id`,
    [request.currentUserId],
  );
  const workspaces = [];
  for (const row of rows as Array<{ workspace_id: string; role: string }>) {
    workspaces.push({
      workspaceId: row.workspace_id,
      name: await workspaceNameFromLedger(deps.pool, row.workspace_id),
      role: row.role,
    });
  }
  return { workspaces };
});
```

Tests: a member of two workspaces lists both with names and roles; a guest lists their guest workspace (a guest is *told where they are a guest* — that is their own membership, not somebody else's data); no session → 401; and a revoked membership disappears from the directory on the next call, because the read is `proj_memberships` and revocation deletes the row.

- [ ] **Step 5: Record it — Features.md and test-cases, same change set**

Append to `Features.md` §6:

```markdown
- ✅ **Founding a workspace** — `POST /v1/workspaces` takes a name from any signed-in person and returns a workspace that already works: the simple-Kanban default workflow, all four built-in ticket types bound to it, and the founder recorded as owner — appended in that order, because a ticket type naming an undefined workflow is refused. The template is a starting point, not a commitment: an admin may publish another workflow and re-point the types immediately. Beside it, `GET /v1/me/workspaces` is the directory: the workspaces this person belongs to, with names and roles, straight from `proj_memberships`. `apps/server/src/routes/workspaces.ts`, `apps/server/src/workspaces/bootstrap-workspace.ts`
```

Append to `test-cases/06-auth-visibility.md`:

```markdown
- **6.23** ✅ `POST /v1/workspaces` founds a workspace for any signed-in person and returns its id; no session gets the generic 401; a nameless workspace is refused and appends nothing. (`test/routes/workspaces.test.ts`)
- **6.24** ✅ Founding appends the default workflow, then the four built-in types naming it, then the founder's owner grant — asserted in `workspace_seq` order, because the sequence spans four entity kinds and per-entity `seq` cannot order it. (`test/permissions/check-role-permission.test.ts`)
- **6.25** ✅ A founded workspace accepts a ticket immediately: found → project → roster → `ticket.created` is committed and lands in the default workflow's initial state. Before the bootstrap this refused `ticket.unknown-type` and the workspace was permanently unusable. (`test/permissions/check-role-permission.test.ts`)
- **6.26** ✅ Planted defect: re-submitting the same founding event id answers `duplicate-event-id` and bootstraps nothing a second time — the property both of Plan 11's seed CLIs re-run on. (`test/permissions/check-role-permission.test.ts`)
- **6.27** ✅ `project.created` lands a `proj_projects` row scoped to its workspace and carrying its creator; a re-delivered duplicate does not double-insert; `reset` empties the table. (`test/projections/proj-projects.test.ts`)
- **6.28** ✅ `projectExists` answers `false` for a real project id asked under a different workspace — project ids are not globally unique keys to anyone who knows one. (`test/projections/proj-projects.test.ts`)
- **6.29** ✅ Planted defect, and the one the hole was actually reachable through: a membership granted on a `projectId` that was never founded no longer lets a ticket be created into it. The refusal is `project.unknown`; the test asserts the rule name, because being refused for the wrong reason is what this check exists to remove. (`test/permissions/check-project-exists.test.ts`)
- **6.30** ✅ Ordering: a non-member creating a ticket in a project that does not exist is told the project does not exist, not that they are not a member — the existence check runs before the membership check. (`test/permissions/check-project-exists.test.ts`)
- **6.31** ✅ `ticket.workflow_rebound` is admin-only: a plain member's migration is refused `permission.role`, an admin's passes the gate. Migration re-homes work other people are holding, so it is not an ordinary ticket edit. (`test/permissions/check-role-permission.test.ts`)
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/workspaces.ts apps/server/src/app.ts apps/server/test/routes/workspaces.test.ts \
  Features.md test-cases/06-auth-visibility.md
git commit -m "A workspace can now be founded through the product, and it arrives able to hold a ticket: one name in, and the default workflow, the four built-in types and the founder's ownership come back out."
```

---

### Task 14: Invites — the address-named claim, and the token that is not history

Spec §6 promises "Invites travel as links or QR from an admin", and until the owner decision of 2026-08-27 the vocabulary could not express it: `membership.granted` names a `userId`, and a person who has never signed in does not have one. So no new person could be invited to a workspace at all — including the accountant guest the dogfooding plan depends on. Plan 6 already owns the client half (Task 15 there: `/invite/[token]` page, `InviteGateway`, tests) and pins the server surface it calls; this task is the half that answers it. **The routes below are Plan 6's contract, consumed verbatim — do not rename them.**

**Two design lines, drawn once:**

1. **The token is a credential, so it is not the event id and never enters the ledger.** Anyone who can read a workspace's history can read an event id; if that id were the link's token, any member could accept an invitation addressed to somebody else. The token is server-owned state (hashed at rest, like better-auth's own token tables) keyed to the invite — the same line this plan draws for sessions: identity machinery is not workspace history. The ledger records that an invitation was made, to what address, by whom. It does not record the secret that opens it.
2. **An invite is a claim like everything else** — attributed, dated, visible as pending until accepted, and its revocation is itself an event. Acceptance is recorded by the *server* when the invited person opens their link and authenticates (creating an account if they have none — the existing OTP / magic-link / Google paths; no new auth); a client cannot submit `invite.accepted` directly, because acceptance without the token would let anyone who can read an invite id bind it to themselves.

**Files:**
- Create: `packages/domain/src/events/invites.ts` (payloads, parsers, registrations)
- Create: `apps/server/migrations/<ts>_proj-invites.cjs` (the projection table **and** the server-owned `invite_tokens` table — two tables, one migration, different natures: one rebuilds from the ledger, one is deliberately unrebuildable)
- Create: `apps/server/src/projections/proj-invites.ts`, `apps/server/src/routes/invites.ts`
- Modify: `apps/server/src/permissions/check-permission.ts` (gates), `apps/server/src/sync/visible-events.ts` (the `invite` entity kind), `apps/server/src/app.ts`, `apps/server/src/projections/index.ts` (register `projInvites` — coordination §8 amended to slot it after `proj_memberships`)
- Test: `packages/domain/test/events/invites.test.ts`, `apps/server/test/routes/invites.test.ts`

**Interfaces:**
- Consumes: `makeRequireSession` (Task 2), the ingest path (Task 5's wiring), `checkRolePermission` context (Task 5), `visibleEventsFor` (Task 11), `newUlid` (Plan 1), `AppConfig` — which gains `webOrigin` (`WEB_ORIGIN`; Plan 11's `.env.example` completeness gate picks it up).
- Produces: `InviteSentPayload { inviteId, address, channel: 'email' | 'phone', role: 'admin' | 'member' | 'guest', projectIds?: string[] }`, `InviteAcceptedPayload { inviteId, userId }`, `InviteRevokedPayload { inviteId }`, their parsers, event types `invite.sent` / `invite.accepted` / `invite.revoked` v1 with `entityKind: 'invite'`, entity id = `inviteId`; `registerInviteRoutes(app, deps)` serving **`POST /v1/workspaces/:workspaceId/invites`** → `201 { inviteId, url }` (admin-only), **`GET /v1/invites/:token`** → `InviteSummary { workspaceId, workspaceName, role }` or 404 (no session required — the token is the credential), **`POST /v1/invites/:token/accept`** → `{ workspaceId }` (session required).

**Payload rules, each refused with the reason named (`packages/domain/src/events/invites.ts`):**

```ts
const INVITE_ROLES = new Set(['admin', 'member', 'guest']);
const INVITE_CHANNELS = new Set(['email', 'phone']);

export function parseInviteSent(payload: unknown): InviteSentPayload {
  if (!isRecord(payload)) throw new Error('invite.sent payload requires inviteId, address, channel, role');
  const inviteId = requireNonEmptyString(payload, 'inviteId', 'invite.sent');
  const address = requireNonEmptyString(payload, 'address', 'invite.sent');
  const { channel, role } = payload;
  if (typeof channel !== 'string' || !INVITE_CHANNELS.has(channel)) {
    throw new Error("invite.sent payload requires channel 'email' or 'phone'");
  }
  if (typeof role !== 'string' || !INVITE_ROLES.has(role)) {
    // 'owner' is refused by omission, and deliberately: an invitation cannot
    // make somebody the owner of a workspace they have not yet entered.
    throw new Error("invite.sent payload requires role 'admin'|'member'|'guest' — an invite cannot confer ownership");
  }
  let projectIds: string[] | undefined;
  if ('projectIds' in payload) {
    if (!Array.isArray(payload.projectIds) || payload.projectIds.some((p) => typeof p !== 'string' || p === '')) {
      throw new Error('invite.sent projectIds must be non-empty strings');
    }
    if (role === 'guest') {
      // The 2026-08-27 membership collapse removed inert associations; this
      // refusal keeps one from growing back at the front door. A guest reaches
      // work through visibility.set explicit lists, so a project association on
      // a guest invite would promise something membership no longer means.
      throw new Error('invite.sent cannot put a guest on a project; share tickets with visibility.set instead');
    }
    projectIds = payload.projectIds as string[];
  }
  return { inviteId, address, channel: channel as 'email' | 'phone', role: role as 'admin' | 'member' | 'guest', projectIds };
}
```

`parseInviteAccepted` and `parseInviteRevoked` are shape checks (`inviteId`, `userId` non-empty). Each event registers with `entityKind: 'invite'`; the entity id **must equal** `payload.inviteId` (refused at parse otherwise, the same mismatch rule Task 9 applies to `visibility.set`).

**Gates (`check-permission.ts`), three additions:** `invite.sent` and `invite.revoked` join `ADMIN_ONLY_TYPES` — inviting somebody into the workspace is managing its membership. `invite.accepted` is refused from **every** client origin with `permission.role` and the reason `Acceptance is recorded by the server when the invited person opens their link.` — planted defect: an admin who reads an inviteId from history and submits `invite.accepted { inviteId, userId: themselves }` is refused; without this gate they could bind any pending invite to any user with no token ever seen.

**Sync-down (`visible-events.ts`):** a new `case 'invite':` yields only to `owner`/`admin`. An `invite.sent` carries a personal address; members and guests have no need of it, and the smaller the audience of a PII-bearing event, the better. (This is the first event kind withheld from plain members — the switch's default-deny shape already supports it.)

**The projection and the token store (`proj-invites.ts` + migration):**

```ts
// proj_invites — rebuildable from the ledger like every projection:
//   invite_id PK, workspace_id, address, channel, role, project_ids jsonb,
//   status 'pending'|'accepted'|'revoked', invited_by, invited_at,
//   accepted_user_id NULL, accepted_at NULL
// invite_tokens — NOT a projection and NEVER rebuildable from the ledger,
//   because the token is not in the ledger (that is the point):
//   invite_id PK, token_hash text NOT NULL UNIQUE, created_at
export const projInvites = {
  name: 'proj_invites',
  tables: ['proj_invites'] as const, // invite_tokens is deliberately absent: reset() must not touch it
  async apply(env: LedgerEvent, db: Queryable): Promise<void> {
    if (env.type === 'invite.sent') { /* INSERT ... ON CONFLICT DO NOTHING */ }
    if (env.type === 'invite.accepted') { /* status='accepted', accepted_user_id, accepted_at */ }
    if (env.type === 'invite.revoked') { /* status='revoked' */ }
  },
  async reset(db: Queryable): Promise<void> { await db.query('DELETE FROM proj_invites'); },
};
```

**Routes (`routes/invites.ts`):**

- `POST /v1/workspaces/:workspaceId/invites` `{ address, channel, role, projectIds? }` — mints `inviteId = newUlid()` and a 32-byte random token; submits `invite.sent` **through the ingest gate** as the session user (so the admin-only refusal and the parser rules above fire exactly as they would for any event); on commit, stores `sha256(token)` in `invite_tokens` in the same transaction; answers `201 { inviteId, url: `${config.webOrigin}/invite/${token}` }`. The raw token exists only in this response — never in a log line, never in the ledger, never at rest.
- `GET /v1/invites/:token` — hashes the token, looks up the invite, joins `proj_invites`; answers the `InviteSummary` Plan 6 pinned (`workspaceId`, `workspaceName`, `role`) for a **pending** invite and `404` for anything else — unknown, revoked and accepted are indistinguishable from outside, because a dead link that explains *why* it is dead is an oracle. `workspaceName` comes from `workspaceNameFromLedger(db, workspaceId)` — the latest `workspace.created`/`workspace.renamed` name in the events table; if a later plan grows a workspace projection, this helper collapses into it.
- `POST /v1/invites/:token/accept` — requires a session; hashes and resolves the token; refuses a non-pending invite (`410`); then appends, server-origin through the same append+project path as the founding sequence, in this order: `invite.accepted { inviteId, userId: session.userId }`, `membership.granted { userId, role }`, and one `project.member_added { userId, projectAdmin: false }` per promised project. Every appended event's `actorId` is the accepting user — the acceptance is their act; the *authorization* traces through `inviteId` to the admin's attributed `invite.sent`, which is what the history view shows when the grant unfolds. Deletes the token row in the same transaction: a spent credential does not linger. Answers `{ workspaceId }`.

`invite.revoked` needs no route: an admin submits it through `POST /v1/events` like any other claim, and the projection flips the status, which kills the link (the GET refuses non-pending invites; the token row is deleted by a sweep-free rule — the accept route checks status before the token, so a revoked invite's surviving token row opens nothing).

**One more read, added at Plan 6's walk (2026-08-27): `GET /v1/workspaces/:workspaceId/invites`** — admin-only, the pending list for the invite-mint screen. An admin who can send invitations but cannot see which are outstanding will send the same one twice and cannot revoke what they cannot list. Answers `{ invites: [{ inviteId, address, channel, role, projectIds, invitedBy, invitedAt }] }` from `proj_invites WHERE status = 'pending'`, newest first. No tokens in the response — the token's one copy went to whoever minted it, and a list that re-served credentials would turn a read into an issuance. Test: pending invites list with their addresses; accepted and revoked ones do not; a plain member is refused `permission.role` — the addresses are PII and the sync-down rule (owners/admins only) applies to the read path identically.

- [ ] **Steps 1–4: failing tests, then the implementation above** — the domain tests first (each parser rule, including the two refusals with their exact messages), then the route tests. **Planted defects, each proven before trusted:** a plain member calling the invite route is refused `permission.role` · client-submitted `invite.accepted` is refused even from an admin (the token-bypass defect above) · `GET` with a valid-shaped but unknown token, a revoked token and a spent token all answer the identical 404 body · accepting twice: the second answers `410` and appends nothing (assert the event count) · **the credential-separation defect:** take a committed `invite.sent`, use its event id and its `inviteId` as tokens — both must 404, proving that reading the ledger confers nothing · an accepted member invite lands `membership.granted` + `project.member_added` rows and the new member's very next request can read a ticket in the promised project · an accepted **guest** invite lands the grant alone, `eff.projects` empty.

- [ ] **Step 5: Features.md §6 and test-cases 6.32–6.38, same change set**

```markdown
- ✅ **Invites** — an admin invites a person by address (email or phone), not by user id, so someone who has never signed in can be brought in: `invite.sent` is the attributed claim, the link's token is server-owned and hashed (never in the ledger — reading history confers nothing), and acceptance on landing creates the account if needed, binds the invite, and appends the membership it promised. Revocation is an event; a dead link never says why it is dead. An invite cannot confer ownership, and a guest invite cannot carry projects. `apps/server/src/routes/invites.ts`, `packages/domain/src/events/invites.ts`
```

```markdown
- **6.32** ✅ An admin invites by address; the response carries the one copy of the raw token; the ledger, the projections and the logs carry only the claim and the hash. (`test/routes/invites.test.ts`)
- **6.33** ✅ Planted defect: a plain member issuing an invite is refused `permission.role`; a guest invite carrying projectIds is refused at parse with the visibility.set remedy named. (`test/routes/invites.test.ts`, `test/events/invites.test.ts`)
- **6.34** ✅ Planted defect: client-submitted `invite.accepted` is refused even from an admin — acceptance without the token would bind any pending invite to any user. (`test/permissions/check-role-permission.test.ts`)
- **6.35** ✅ The credential-separation defect: the committed invite's event id and its inviteId both 404 as tokens. Reading the workspace's history confers nothing. (`test/routes/invites.test.ts`)
- **6.36** ✅ Unknown, revoked and spent tokens are indistinguishable: one 404 body. Accepting twice appends nothing the second time. (`test/routes/invites.test.ts`)
- **6.37** ✅ Acceptance appends invite.accepted, the grant, and the promised project rows in order, all actor-attributed to the acceptor, authorization tracing to the admin's invite.sent; the new member can immediately read a ticket in the promised project. (`test/routes/invites.test.ts`)
- **6.38** ✅ `invite.sent` reaches owners and admins in sync-down and nobody else — the address is PII and members have no need of it. (`test/sync/visible-events.test.ts`)
- **6.39** ✅ The owner reads everything in the workspace, including explicit lists naming only others; an admin still reads nothing they have not joined or been listed for — the split IS the planted defect, since a regression re-unifying the two roles fails one side. (Task 7 amendment, owner decision 2026-08-27; `test/visibility/can-see.test.ts`)
- **6.40** ✅ An owner on no project and no list receives every ticket from `listVisibleTickets`, and `canSee` agrees ticket by ticket — the drift alarm between the decision table's two copies (pure function and SQL). (`test/visibility/visible-tickets.test.ts`)
- **6.41** ✅ `GET /v1/me/workspaces` lists the caller's workspaces with names and roles; a guest is told where they are a guest; a revoked membership vanishes from the directory on the next call. Added at Plan 6's walk, which found its own navigation coded against a route no plan served. (`test/routes/workspaces.test.ts`)
- **6.42** ✅ `GET /v1/workspaces/:workspaceId/invites` lists pending invites to admins, never re-serves a token, and refuses plain members `permission.role` — the same PII rule as sync-down, applied to the read path. (`test/routes/invites.test.ts`)
```

- [ ] **Step 6: Commit** — `git commit -m "Invites name an address rather than a user id, and the secret that opens one is not history: the ledger records who invited whom, the token lives hashed beside the sessions, and reading a workspace's past confers nothing about entering its future."`

---

## Open questions (owner review before or during execution)

1. **Auth library: better-auth** (justified above). Pin the latest 1.x at execution; the exact version lands in the lockfile and PR description. Owner sign-off requested on the library choice itself.
2. **`visibleEventsFor` return type vs the contract.** The contract types it `AsyncIterable<EventEnvelope>` but also requires revocation to yield `{kind:'purge', entityId}` — those cannot both hold. This plan implements `AsyncIterable<SyncItem>` with `SyncItem = LedgerEvent | PurgeInstruction`. Flagged, not silently resolved; Plan 10's consumption should confirm the union.
3. **Two ways onto a project.** `membership.granted {scope:{projectId}}` and `project.member_added` overlap. This plan's modeling: `membership.granted` carries *roles* (and is how guests attach to a project); `project.member_added` is the roster path for existing workspace members (with the projectAdmin flag). Both land in `proj_memberships`. Confirm or collapse.
4. **Non-ticket events in sync-down.** Chosen: workspace/project/membership events go to non-guest members; workflow and ticket-type definitions go to everyone including guests (they cannot render a shared ticket's status without its workflow). Confirm the guest slice.
5. **Visibility bypass — SETTLED, and amended by the owner (2026-08-27): the owner reads everything; admins do not.** The plan proposed no bypass for anyone; the owner drew the line one role higher. The workspace **owner** bypasses read visibility across their workspace — the workspace is the container everything else sits inside, and its owner owns the container. Because reads leave no event trace, the power cannot be made honest by attribution, so it is made honest by **disclosure**: the visibility controls state plainly that the workspace owner can always see (Plan 6 carries the copy — `Visible to: these people — and the workspace owner, always`). **Admins** get exactly what the plan proposed: they manage but do not silently see, and must join a project (an attributed event) to read its project-mode tickets or create in it. Writing is unchanged for everyone, owner included. Implemented in `canSeeResolved` (Task 7); the sync-down filter and every read route inherit it for free, because they all defer to the one function.
6. **Purge existence-leak on membership loss.** After `membership.revoked`/`project.member_removed`, purges are emitted for every now-invisible ticket in the lost scope — including ids the client may never have held (server-side per-client held-sets do not exist in this plan; Plan 10 owns sync state and could narrow this). A purge of an unheld id is a client no-op, but the id itself travels. Accepted here; Plan 10 may tighten.
7. **Read endpoints live in this plan.** Plan 3 ships projections, not HTTP routes, so the minimal list/read/history endpoints are built here. If another plan also claims ticket read routes, merge at execution — the visibility enforcement in them is this plan's, regardless of file ownership.
8. **Vendor tables are not snake_case.** better-auth's generated tables keep the library's naming — a deliberate exception to CODING_STANDARDS, called out in the migration header.
9. **Explicit lists are exactly the authored list — SETTLED (owner decision 2026-08-27): the sharp edge stays, and the client warns at the moment of authoring.** Creator/assignee are not implicitly appended; a creator can lock themselves out of their own ticket. Auto-appending the creator would be the system inventing a claim nobody made, so the server keeps the list exactly as authored. What the owner added: the *client* warns, at the moment a `visibility.set` would exclude its own author, that they will lose access — naming the repair path (a project admin, or the workspace owner, who always sees). Warning is not inventing: the claim submitted is still exactly the authored list. The warning is client copy and lands in Plan 6's visibility editor alongside the owner-disclosure line from question 5; nothing in this plan's server behaviour changes.
10. **Invites — SETTLED (owner decision 2026-08-27); the founding *screen* is the one client surface still unowned.** This question originally reported that nobody owned invite issuance or acceptance, and it was wrong twice over: the vocabulary could not express an invite at all (`membership.granted` names a `userId`, which a person who has never signed in does not have), and Plan 6 in fact already owned the client half — its Task 15 builds `/invite/[token]` and an `InviteGateway`, and pins the two server routes it calls. Task 14 now supplies the vocabulary (`invite.sent` naming an *address*, `invite.accepted`, `invite.revoked`) and those two routes, plus issuance. Still genuinely unowned, and only this: the screen that founds a workspace — a form calling `POST /v1/workspaces` and routing into the result. Assign when Plan 6 is walked; everything else in this question's original list now has an owner.
11. **Route prefix — SETTLED (owner decision 2026-08-27).** Task 8's ticket read routes were `/api/workspaces/...`, predating coordination amendment 20; they are now `/v1/workspaces/...` like everything else, with the plan's own end-to-end tests moved with them. `/api/auth/*` stays as better-auth's vendor surface, which amendment 20 names as the one exception.

    Moving them turned up a second, larger error in the same tests. This plan's end-to-end cases posted events to `POST /api/workspaces/:workspaceId/events` — a route that **does not exist in any plan**, and that was recorded here as an assumption ("adapt its URL"). Plan 1 Task 11 registers `POST /v1/events`, with body `{ events: [envelope, …] }` and the workspace carried inside each envelope rather than in the path. So the tests were wrong about the URL *and* about the request shape, and would have 404'd rather than proving anything. Both are corrected against Plan 1's actual route rather than against a fresh assumption.

## Self-review (performed on the finished plan)

1. **Spec §6 coverage:** roles owner/admin/member/guest with guests explicit-only → Tasks 4, 7, 9. Project member lists with project-admin flag → Tasks 3–5. Server-side enforcement on every read and sync-down → Tasks 8, 11. `visibility.set` as attributed events, editing rights project-admin-or-creator → Tasks 3, 9. True counts with restriction named → Task 10 (exact "5 of 8 done · 2 restricted" scenario). Restricted-parent placeholder, existence no title → Task 8. Provenance never redacted → Task 8 (history endpoint planted defect). Phone-first auth, four methods, no passwords, DLT noted → Tasks 1–2, case 6.20. Each honesty guarantee has its own planted-defect test (cases 6.13, 6.14, 6.15).
2. **Placeholder scan:** no TBDs; every code step carries the actual code; cross-plan touchpoints name a concrete assumed shape plus the adaptation rule (Cross-plan path assumptions) instead of "similar to".
3. **Type consistency:** `Refusal` shape used identically in Tasks 5, 9, 12; rule names only `permission.role`/`permission.visibility` throughout; `EffectiveRole.projects` (Map) consistent across Tasks 4, 5, 7, 9, 10; `canSee(db, userId, ticketId)` signature identical in Tasks 7–11; `SyncItem`/`PurgeInstruction` defined once (Task 11) and mirrored in the header's Produces list; `signInWithPhone` lives in `test/helpers/session.ts` from Task 2 and every route test imports it from there.

