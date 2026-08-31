# Plan 4 (auth-visibility) — Extract A: Global Constraints, File Structure, Tasks 1-3

Source: `docs/superpowers/plans/2026-08-20-04-auth-visibility.md` lines 15-1223.

## Global Constraints (verbatim, copied from series contract + spec)

- MONOREPO: pnpm workspaces + Turborepo, TypeScript strict, Node 22 LTS, pnpm 9.
- TESTING: Vitest.
- IDS: ULID via `ulidx`.
- EVENT ENVELOPE (exact): `entity.kind` ∈ `'workspace'|'project'|'ticket'|'workflow'|'ticket-type'|'membership'`; fields `id, workspaceId, entity, type, version, payload, actorId, origin('web'|'mobile'|'desktop'|'server'), clientTime, serverTime, seq`.
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

## Auth library decision (owner review)

**better-auth** is the pinned choice (latest 1.x, exact version recorded in lockfile at execution time). Covers phone OTP (`phoneNumber` plugin, `sendOTP` callback → our `OtpSender`), `magicLink`, Google via `socialProviders`, `passkey` (WebAuthn), plus `bearer` plugin for mobile/desktop token sessions alongside default httpOnly-cookie sessions for web. Fastify integration: catch-all route over Web-standard `auth.handler`. Speaks Postgres directly via `pg` Pool; generates its own schema.

## Cross-plan path assumptions

Plans 1-3 written in parallel; their internal names are not contractual. This plan assumes:

- Workspace package names: `@gisik-nokma/domain` (packages/domain), server package in `apps/server`.
- Event-type registry: `packages/domain/src/events/registry.ts` exporting `registerEventType({type, version, entityKind, parsePayload})`; payload parsers throw `Error` on invalid input (adapt to Plan 1's error style if it used a Result type).
- Ledger table: `events` with columns `id, workspace_id, entity_kind, entity_id, type, version, payload (jsonb), actor_id, origin, client_time, server_time, seq`. **Both clocks are `timestamptz`** — absolute instants (owner decision 2026-08-20, "time is Asia/Kolkata"); driver yields `Date`, every reader converts with `.toISOString()`, never `String(...)`, never a SQL cast. `visibleEventsFor`'s ordering is by `workspace_seq`, unaffected by clock representation — the stream cursor is an integer.
- Ingest pipeline: `apps/server/src/ingest/pipeline.ts`, exposing the point where `parseEvent` has succeeded and `evaluateEvent(env, ctx)` is about to run.
- `proj_tickets` columns used here: `ticket_id, workspace_id, project_id, parent_id, title, created_by`. `proj_rollups` columns used here: `ticket_id, open_count, active_count, terminal_count`.
- Fastify app assembly: `apps/server/src/app.ts` exporting a builder where routes are registered.
- `clientTime`/`serverTime` are ISO-8601 strings; `seq` is a JS number (Postgres bigint read via `Number(...)`).
- Test DB: `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/gisik_nokma_test`); if Plan 1 shipped an equivalent test-db helper, extend it rather than duplicating.

**Non-adaptable contract-fixed names** (per this plan's text): `EventEnvelope`, `evaluateEvent`, `registerProjection`, `parseEvent`, table names `proj_tickets`/`proj_rollups`, the Refusal shape.

## File structure (as spelled in the plan, full range)

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

**Identity boundary (stated once, honored everywhere):** `user`/`session`/`account`/`verification`/`passkey` tables are server-owned infrastructure, not events, never enter the ledger — auth state is not workspace history. *Membership* (who is inside which workspace with which role) IS history, lives in the ledger as attributed events. Task 1 builds the first; Tasks 3-4 build the second.

---

## Task 1: Identity foundation — better-auth, sender interfaces, vendor schema

**Files — Create:**
- `apps/server/src/db/queryable.ts`
- `apps/server/src/auth/otp-sender.ts`
- `apps/server/src/auth/magic-link-sender.ts`
- `apps/server/src/auth/auth.ts`
- `apps/server/src/auth/auth-dev.ts`
- `apps/server/migrations/<ts>_auth-tables.cjs` (node-pg-migrate generates timestamp prefix)
- `apps/server/test/helpers/db.ts`
- Test: `apps/server/test/auth/otp-sender.test.ts`

**Files — Modify:** none listed explicitly beyond package.json / pnpm-lock.yaml (dependency install, Step 1 and commit list).

**Interfaces produced (verbatim):**
- `OtpSender { send(phoneE164: string, code: string): Promise<void> }`
- `LogOtpSender` implements `OtpSender`, `public readonly sent: Array<{ phoneE164: string; code: string }>`, constructor `(log: (message: string) => void = console.info)`, method `send(phoneE164, code)` pushes to `sent` and logs `` `[dev-otp] OTP for ${phoneE164}: ${code}` ``.
- `MagicLinkSender { send(email: string, url: string): Promise<void> }`
- `LogMagicLinkSender` implements `MagicLinkSender`, `sent: Array<{ email: string; url: string }>`, logs `` `[dev-magic-link] link for ${email}: ${url}` ``.
- `Queryable = Pool | PoolClient` (from `apps/server/src/db/queryable.ts`).
- `AuthDeps { pool: Pool; otpSender: OtpSender; magicLinkSender: MagicLinkSender; baseUrl: string; secret: string }`
- `createAuth(deps: AuthDeps)` returning better-auth instance; `type Auth = ReturnType<typeof createAuth>`.
- `auth` (in `auth-dev.ts`) — concrete instance built from env vars, for CLI schema generation and local dev only; never imported by production assembly.
- Test helpers: `TEST_DATABASE_URL` (const, default `postgres://postgres:postgres@localhost:5432/gisik_nokma_test`), `migrateTestDb(): void`, `testPool(): Pool`, `truncateAll(pool: Pool): Promise<void>`.

**Consumes:** Plan 1's `apps/server` package (Fastify 5, `pg`, node-pg-migrate already configured).

**createAuth wiring detail (exact, from plan text):**
```ts
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
Note: "If the pinned version's plugin option names differ (its docs are versioned), keep the wiring — OtpSender behind sendOTP, MagicLinkSender behind sendMagicLink, no passwords, Google + passkey + bearer enabled — and adapt the option spelling."

**Vendor schema migration (`auth-tables.cjs`)** creates 5 tables: `"user"`, `"session"`, `"account"`, `"verification"`, `"passkey"` (camelCase columns — vendor exception to snake_case standard). Full column lists as given (see plan lines ~272-340 for the exact `pgm.sql(...)` block — not reproduced fully here beyond table/column names since the SQL is directly copy-pasteable from source):
- `user`: id (text PK), name, email (unique), emailVerified (bool, default false), image, phoneNumber (unique), phoneNumberVerified, createdAt, updatedAt (timestamptz, default now()).
- `session`: id (PK), userId (FK → user, cascade), token (unique), expiresAt (timestamptz), ipAddress, userAgent, createdAt, updatedAt.
- `account`: id (PK), userId (FK), accountId, providerId, accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt.
- `verification`: id (PK), identifier, value, expiresAt, createdAt, updatedAt.
- `passkey`: id (PK), userId (FK), name, publicKey, credentialID, counter (int), deviceType, backedUp (bool), transports, createdAt.
- Indexes: `session_userId_idx`, `account_userId_idx`, `verification_identifier_idx`.
- Step 10 explicitly requires reconciling against `@better-auth/cli generate` output — "If the installed version's schema differs ... the library wins: update the migration to match, exactly. Do not skip this — a drifted vendor schema fails at runtime, not at migrate time."

**Test DB helper detail:** `truncateAll` uses a `DO $$ ... FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'pgmigrations' LOOP EXECUTE format('TRUNCATE TABLE %I CASCADE', t); END LOOP; END $$;` block.

**Refusals:** none defined in Task 1.

**Test count:** Step 3/6: 2 tests (`LogOtpSender`, `LogMagicLinkSender`). Step 13 runs the whole server suite (expects PASS including Plan 1-3 suites + 2 new).

**Commit message (verbatim):** "Identity is infrastructure: better-auth owns users and sessions in server tables, while membership stays workspace history in the ledger. OTP and magic-link delivery sit behind senders whose dev implementations log instead of sending."

**planTextClaimsToVerify:**
- `apps/server` package exists with Fastify 5, `pg`, node-pg-migrate already configured (Plan 1 claim).
- Plan 1 may already ship a test-db helper in `apps/server/test/helpers/` — check before creating a duplicate; if present, extend with `truncateAll`/`TEST_DATABASE_URL` using its existing names.
- `better-auth` package exposes `betterAuth`, and `better-auth/plugins` exposes `bearer`, `magicLink`, `phoneNumber`; `better-auth/plugins/passkey` exposes `passkey`.
- `@better-auth/cli` supports `generate --config <path>` producing SQL comparable to a migration.
- node-pg-migrate CLI: `pnpm exec node-pg-migrate create auth-tables` generates a timestamped `.cjs` file; `pnpm exec node-pg-migrate up` applies migrations reading `DATABASE_URL`.
- Plan 1/2/3 test suites exist and currently pass under `pnpm vitest run` from `apps/server/`.

---

## Task 2: Auth routes and session resolution on Fastify

**Files — Create:**
- `apps/server/src/auth/routes.ts`
- `apps/server/src/auth/require-session.ts`
- `apps/server/test/helpers/session.ts`
- Test: `apps/server/test/auth/sign-in-flows.test.ts`
- Test: `apps/server/test/auth/require-session.test.ts`

**Files — Modify:**
- `apps/server/src/app.ts` (Plan 1's app assembly — register the auth routes where other routes are registered; construct auth instance from process env; expose `auth` from the builder's return value so later tasks can build `makeRequireSession(auth)`).

**Interfaces produced (verbatim):**
- `registerAuthRoutes(app: FastifyInstance, auth: Auth): void` mounting `/api/auth/*`.
- `makeRequireSession(auth: Auth)` returning a Fastify preHandler that 401s without a session and sets `request.currentUserId: string`.
- Test helper `signInWithPhone(app, sender, phone): Promise<string>` (bearer token) in `test/helpers/session.ts`.
- Every later task's routes use `makeRequireSession`; every later task's route tests sign in through `signInWithPhone`; every client plan signs in through `/api/auth/*`.

**Consumes:** `createAuth`, `LogOtpSender`, `LogMagicLinkSender`, test DB helpers (Task 1).

**registerAuthRoutes implementation (exact signature/behavior):**
```ts
export function registerAuthRoutes(app: FastifyInstance, auth: Auth): void {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) { ... }
  });
}
```
Converts Fastify request → Web-standard `Request`, calls `auth.handler(webRequest)`, copies response status/headers back, handles `set-cookie` via `response.headers.getSetCookie()`.

**makeRequireSession implementation (exact):**
```ts
declare module 'fastify' {
  interface FastifyRequest {
    currentUserId: string;
  }
}
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

**Refusal (exact):** No-session request → HTTP 401 with body `{ error: 'unauthenticated' }`. Note: this is a plain HTTP 401 JSON body, NOT the `{refused, rule, reason}` shape defined in Global Constraints — the auth layer's 401 is distinct from ledger/engine refusals.

**signInWithPhone helper (exact):**
```ts
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

**Endpoint paths asserted by tests** (better-auth 1.x names; plan notes "if the pinned version routes differently, fix the paths in the test — the flows themselves ... are the contract"):
- `POST /api/auth/phone-number/send-otp`
- `POST /api/auth/phone-number/verify`
- `POST /api/auth/sign-in/magic-link`
- `GET /api/auth/get-session`
- `POST /api/auth/sign-in/social` (payload `{provider:'google'}`) — response `.json().url` must contain `accounts.google.com`
- `GET /api/auth/passkey/generate-register-options` — response `.json().challenge` truthy

**Test counts:** Step 2/5: 5 tests in sign-in-flows.test.ts (phone OTP, magic link, bearer, google oauth, passkey — one `it` each across 5 `describe` blocks). Step 8: 3 tests in require-session.test.ts (no session → 401 exact body `{error:'unauthenticated'}`; forged bearer → 401; real bearer → 200 with truthy userId). Step 10: whole suite PASS — "all prior suites plus the 8 new auth tests" (5+3=8).

**Commit message (verbatim):** "Sign-in works four ways with no passwords: phone OTP, magic link, Google, passkeys — cookie sessions for the web, bearer tokens for the apps, and one preHandler that resolves session to user for every protected route."

**planTextClaimsToVerify:**
- Plan 1's `apps/server/src/app.ts` exists as "an app builder" with a return value that can be extended to also expose `auth`.
- `better-auth/node` exports `fromNodeHeaders`.
- `auth.api.getSession({ headers })` is the correct better-auth 1.x API shape.
- Web sign-in cookie response includes `HttpOnly` in `set-cookie` header text.
- Bearer plugin returns token via response header `set-auth-token`.

---

## Task 3: Membership and visibility event types in the domain package

**Files — Create:**
- `packages/domain/src/events/membership.ts`
- `packages/domain/src/events/visibility.ts`
- Test: `packages/domain/test/events/membership.test.ts`
- Test: `packages/domain/test/events/visibility.test.ts`

**Files — Modify:**
- `packages/domain/src/events/registry.ts` (Plan 1's event-type registry — add seven registrations)
- `packages/domain/src/index.ts` (export the new types and parsers: `export * from './events/membership'; export * from './events/visibility';`)

**Interfaces produced (verbatim, all exported from `@gisik-nokma/domain`):**
- `WorkspaceRole = 'owner'|'admin'|'member'|'guest'`
- `VisibilityMode = 'workspace'|'project'|'explicit'|'inherit'`
- `WorkspaceCreatedPayload { name: string }`
- `ProjectCreatedPayload { name: string }`
- `MembershipGrantedPayload { userId: string; role: WorkspaceRole }`
- `MembershipRevokedPayload { userId: string }`
- `ProjectMemberAddedPayload { userId: string; projectAdmin: boolean }`
- `ProjectMemberRemovedPayload { userId: string }`
- `VisibilitySetPayload { ticketId: string; mode: VisibilityMode; userIds?: string[] }`
- Parsers, each `(payload: unknown) => <Payload>`, throwing `Error` with plain message on invalid input:
  - `parseWorkspaceCreated`
  - `parseProjectCreated`
  - `parseMembershipGranted`
  - `parseMembershipRevoked`
  - `parseProjectMemberAdded`
  - `parseProjectMemberRemoved`
  - `parseVisibilitySet`

**Consumes:** Plan 1's `registerEventType({type, version, entityKind, parsePayload})` and `parseEvent` (unknown types refused at ingest — registration is what makes these types legal).

**Event → entity mapping (modeling decision, stated once):**
- `workspace.created` → `{kind:'workspace', id: workspaceId}`
- `project.created` → `{kind:'project', id: projectId}`
- `membership.granted`/`membership.revoked` → `{kind:'membership', id: membershipId(workspaceId, userId)}` — `membershipId` is **Plan 2's** helper in `@gisik-nokma/domain`, `` `${workspaceId}:${userId}` ``. Deterministic because engine addresses membership from `(workspaceId, actorId)` via `getEntityState('membership', id)` (coordination doc §5); scope stays in payload; `proj_memberships` keys on `(workspaceId, userId, scope)`.
- `project.member_added`/`project.member_removed` → `{kind:'project', id: projectId}` (project-roster history)
- `visibility.set` → `{kind:'ticket', id: ticketId}` (must equal `payload.ticketId` — **Task 9** refuses mismatches)

**Registration calls (Step 7, exact):**
```ts
registerEventType({ type: 'workspace.created', version: 1, entityKind: 'workspace', parsePayload: parseWorkspaceCreated });
registerEventType({ type: 'project.created', version: 1, entityKind: 'project', parsePayload: parseProjectCreated });
registerEventType({ type: 'membership.granted', version: 1, entityKind: 'membership', parsePayload: parseMembershipGranted });
registerEventType({ type: 'membership.revoked', version: 1, entityKind: 'membership', parsePayload: parseMembershipRevoked });
registerEventType({ type: 'project.member_added', version: 1, entityKind: 'project', parsePayload: parseProjectMemberAdded });
registerEventType({ type: 'project.member_removed', version: 1, entityKind: 'project', parsePayload: parseProjectMemberRemoved });
registerEventType({ type: 'visibility.set', version: 1, entityKind: 'ticket', parsePayload: parseVisibilitySet });
```
Note: "adapting the call shape to the registry's actual signature — the semantic content below is fixed."

**Refusals — reproduced verbatim (exact Error message strings the parsers throw):**

| Parser | Condition | Exact message (template literal / string as written) |
|---|---|---|
| `parseWorkspaceCreated` | not a record | `'workspace.created payload requires a non-empty name'` |
| `parseWorkspaceCreated` (via `requireNonEmptyString`) | missing/empty name | `` `${eventType} payload requires a non-empty ${field}` `` → for this call: `'workspace.created payload requires a non-empty name'` |
| `parseProjectCreated` | not a record | `'project.created payload requires a non-empty name'` |
| `parseProjectCreated` (via helper) | missing/empty name | `'project.created payload requires a non-empty name'` |
| `parseMembershipGranted` | not a record | `'membership.granted payload requires userId and role'` |
| `parseMembershipGranted` (via helper) | missing/empty userId | `'membership.granted payload requires a non-empty userId'` |
| `parseMembershipGranted` | role not in ROLES set | `"membership.granted payload requires role 'owner'|'admin'|'member'|'guest'"` |
| `parseMembershipGranted` | `'scope' in payload` | `'membership.granted no longer takes a scope; use project.member_added to put someone on a project'` |
| `parseMembershipRevoked` | not a record | `'membership.revoked payload requires userId'` |
| `parseMembershipRevoked` | `'scope' in payload` | `'membership.revoked no longer takes a scope; use project.member_removed to take someone off a project'` |
| `parseMembershipRevoked` (via helper) | missing/empty userId | `'membership.revoked payload requires a non-empty userId'` |
| `parseProjectMemberAdded` | not a record | `'project.member_added payload requires userId and projectAdmin'` |
| `parseProjectMemberAdded` (via helper) | missing/empty userId | `'project.member_added payload requires a non-empty userId'` |
| `parseProjectMemberAdded` | `projectAdmin` not boolean | `'project.member_added payload requires a boolean projectAdmin'` |
| `parseProjectMemberRemoved` | not a record | `'project.member_removed payload requires userId'` |
| `parseProjectMemberRemoved` (via helper) | missing/empty userId | `'project.member_removed payload requires a non-empty userId'` |
| `parseVisibilitySet` | not a record OR ticketId missing/empty | `'visibility.set payload requires a non-empty ticketId'` |
| `parseVisibilitySet` | mode not in MODES set | `"visibility.set payload requires mode 'workspace'|'project'|'explicit'|'inherit'"` |
| `parseVisibilitySet` | mode='explicit' with missing/empty/invalid userIds | `'visibility.set with explicit mode requires a non-empty userIds list'` |
| `parseVisibilitySet` | mode≠'explicit' with `userIds !== undefined` | `` `visibility.set with mode '${mode}' must not carry userIds` `` |

`requireNonEmptyString(record, field, eventType)` helper (exact): throws `` `${eventType} payload requires a non-empty ${field}` `` when `typeof value !== 'string' || value.trim() === ''`.

**Design-rationale note (from source comment on membership.ts, verbatim intent):** `MembershipScope` was removed (owner decision 2026-08-27) — membership is workspace-scoped only now. Rationale: "Two ways on means two ways off" — a project scope on `membership.granted`/`membership.revoked` duplicated `project.member_added`/`project.member_removed`, and removal via one path could leave the other standing. The project scope bought nothing: guest `canSee` is explicit-only (no reads granted), guests are refused ticket creation before project check (no writes granted). `project.member_added`/`project.member_removed` are now the ONLY project association; guests reach work through `visibility.set` explicit lists.

**Test counts:**
- membership.test.ts: Step 4 — PASS (13 tests). Enumerated: parseWorkspaceCreated (2: accepts, refuses missing/empty), parseProjectCreated (2: accepts, refuses junk), parseMembershipGranted (3: accepts, refuses unknown role, refuses scope [2 assertions in 1 it]), parseMembershipRevoked (3: accepts, refuses missing userId, refuses scope), parseProjectMemberAdded (2: accepts, refuses missing projectAdmin), parseProjectMemberRemoved (2: accepts, refuses junk) = 2+2+3+3+2+2=14 `it` blocks by my count, but plan explicitly states 13 — **flag this as a discrepancy** (see contradictions below).
- visibility.test.ts: Step 6 — PASS (6 tests): accepts workspace/project/inherit (1 it, loop), accepts explicit, refuses explicit without userIds, refuses userIds on non-explicit, refuses unknown mode, refuses missing ticketId = 6 `it` blocks. Matches.
- Step 8: full domain suite PASS — "Plan 1's registry/parseEvent tests still green ... plus the 19 new tests" (13+6=19, consistent with plan's own stated 13, even though my manual count of `it` blocks in membership.test.ts is 14).

**Commit message (verbatim):** "Membership and visibility claims parse at the door: seven event types the ledger can replay — workspaces, projects, grants, revocations, rosters, and who may see a ticket."

**planTextClaimsToVerify:**
- Plan 1's `packages/domain/src/events/registry.ts` exports `registerEventType({type, version, entityKind, parsePayload})` and `parseEvent`; parsers throw `Error` on invalid input (or a Result type — adapt if so).
- Plan 1's `parseEvent` refuses unknown event types at ingest.
- Plan 2 exports a `membershipId(workspaceId, userId)` helper from `@gisik-nokma/domain` returning `` `${workspaceId}:${userId}` ``.
- Coordination doc §5 claim: engine addresses membership via `getEntityState('membership', id)` keyed by `(workspaceId, actorId)`.
- `proj_memberships` keys on `(workspaceId, userId, scope)` (referenced here, built in Task 4 — later task in this plan but outside this extract's range end at line 1223, confirm Task 4 lines pick this up).
- Plan 1's `packages/domain/src/index.ts` exists and is the right place to add the two `export *` lines.

---

## Contradictions / flags observed WITHIN this range (lines 15-1223)

1. **Test-count mismatch, Task 3 membership.test.ts:** The plan states "Expected: PASS (13 tests)" in Step 4, but the test file listed in Step 1 contains 14 distinct `it(...)` blocks (2 for parseWorkspaceCreated, 2 for parseProjectCreated, 3 for parseMembershipGranted — including the "refuses a scope" test with 2 `expect().toThrow()` assertions inside one `it`, 3 for parseMembershipRevoked, 2 for parseProjectMemberAdded, 2 for parseProjectMemberRemoved = 14). Step 8's "19 new tests" total (domain suite) is consistent with the plan's own stated 13 for membership + 6 for visibility, not with my manual 14+6=20 count. This may resolve to 13 if one of the `describe` blocks I count as containing 2 `it`s actually has only 1 (need re-verification against the literal file when implementing) — flagged for the adaptation map / implementer to verify exact test count before asserting expectations in CI.

2. **`app.ts` "Modify" listed only implicitly:** Task 2's Files section lists `app.ts` under "Modify" in prose ("Modify: apps/server/src/app.ts") but the Interfaces/Consumes section and Step 9 describe constructing `auth` from env vars and calling `registerAuthRoutes(app, auth)` inside "Plan 1's app builder" — this assumes Plan 1's `app.ts` already exists with a specific shape (returns a value that can be extended). No contradiction, but this is a load-bearing assumption on Plan 1's actual shape that the adaptation map must check against main.

3. **File-structure table lists Task 4, 5, 6, 9, 10, 11, 13 artifacts** (proj-memberships, proj-visibility, effective-role, check-permission, bootstrap-workspace, tickets.ts, workspaces.ts, proj-projects.ts, envelope.ts, seed.ts, simple-kanban.ts) even though this extract's task detail only covers Tasks 1-3 — these are forward references within the same file-structure block (lines ~53-96) and are not contradictions, just scope beyond T1-T3's own Files sections. Noting so downstream extract-B/C tasks are cross-checked against this same table for consistency.

No internal contradiction found where one task in T1-T3 creates a file another task in T1-T3 also creates — Tasks 1, 2, 3 each own disjoint file sets.
