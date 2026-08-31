# Plan 4 Task 1 — Identity foundation: better-auth, sender interfaces, vendor schema

**Branch:** `exec/04-t1-queryable-identity` (worktree `lane2-plan4`), based on `main` = `f363b2f`.
**Status:** DONE_WITH_CONCERNS — everything asked for ships and the gate is green; the concerns are all *findings about better-auth 1.7.2* that Task 2 and Plan 11 need, not unfinished work.

---

## 1. What was built, file by file

### `apps/server/src/db/queryable.ts` (new) — the cross-lane contract

```ts
export type Queryable = Pool | PoolClient;
```

At the exact ruled path, because the Wave-1 schedule reads *"Plan 7's server T7/T8 once Plan 4 T1 lands `Queryable`"* and Plan 7's tasks were written against the `src/db/queryable` specifier. Not folded into `src/db.ts`; not retro-fitted onto `Projection.apply`, whose `tx: PoolClient` is a design decision. The docstring says both, and the choice is recorded in the coordination doc (§ below) so the next lane reads it from a file that is not gitignored.

### `apps/server/src/auth/otp-sender.ts`, `magic-link-sender.ts` (new)

`OtpSender` / `MagicLinkSender` interfaces plus the `LogOtpSender` / `LogMagicLinkSender` dev implementations, verbatim to the brief's shape: `sent` array, injected `log` defaulting to `console.info`, log strings `[dev-otp] OTP for {phone}: {code}` and `[dev-magic-link] link for {email}: {url}`. Task 2's `signInWithPhone` helper reads `sender.sent`.

### `apps/server/src/auth/auth.ts` (new) — `createAuth(deps: AuthDeps)` and `type Auth`

`AuthDeps` exactly as the plan spells it (`pool`, `otpSender`, `magicLinkSender`, `baseUrl`, `secret`). Wiring preserved: `sendOTP` → `OtpSender`, `sendMagicLink` → `MagicLinkSender`, `emailAndPassword: { enabled: false }`, Google + passkey + bearer enabled. One import line changed (§2, claim 2).

### `apps/server/src/auth/auth-dev.ts` (new) — the instance the schema generator loads

Two departures from the brief's snippet, both because the brief's values are wrong for this repo:
- pool comes from `createPool` (`../db.js`), not `new Pool(...)` — `src/db.ts` says every pool must, so the int8 parser and the Asia/Kolkata session are installed;
- default URL is `postgres://gisik:gisik@localhost:54329/gisik_nokma` (docker-compose), not `postgres://postgres:postgres@localhost:5432/gisik_nokma_dev`, which points at a port with nothing on it.

### `apps/server/src/tools/auth-schema.ts` (new) + `"auth:schema"` script — replaces `@better-auth/cli`

Prints the vendor schema of the **installed** better-auth via its own `getMigrations(auth.options).compileMigrations()`. This exists because the CLI is version-skewed and generates a wrong schema — see §3, which is the most important finding in this report. Mirrors the *structure* of the shipped `verify:projections` (an exported function plus a thin direct-execution guard) — **not** its config validation: `verify-projections.ts` builds its pool from `loadConfig(process.env)`, while this tool takes its URL from `auth-dev.ts`'s fallback. Deferred by the reviewer, recorded here so the claim is not read as stronger than it is.

### `apps/server/migrations/1787927101493_auth-tables.sql` (new) — vendor schema

Handwritten `.sql` in the shipped house style per adaptation map §1: `-- Up Migration` / `-- Down Migration` markers, timestamp prefix `1787927101493` > `1787896601515`, `COMMENT ON TABLE` on every table and `COMMENT ON COLUMN` where a column needs an argument. **Not** `.cjs`; `node-pg-migrate create` was not run. Every table has a primary key; no `json` columns. The camelCase vendor exception is stated at the site, in the file header and in `COMMENT ON TABLE "user"`.

### `apps/server/test/auth/otp-sender.test.ts` (new) — 2 tests
### `apps/server/test/auth/auth-tables.test.ts` (new) — 4 tests

Both under `test/`, so `pnpm turbo run test` sees them. Relative imports carry `.js` extensions (the brief's snippet omits them; NodeNext + `tsconfig.typecheck.json`, which includes `test/`, rejects extensionless relative specifiers with TS2835 — vitest would have passed while typecheck failed).

### Modified

- `apps/server/package.json` — `better-auth ^1.7.2`, `@better-auth/passkey ^1.7.2`; `auth:schema` script.
- `apps/server/tsconfig.json`, `tsconfig.typecheck.json` — `declaration: false` (§5).
- `pnpm-lock.yaml` — regenerated clean (§3, last paragraph).
- `docs/superpowers/plans/2026-08-20-00-series-coordination.md` — new section "Plan 4 execution consequences", four entries: the `Queryable` path, the CLI ban, `declaration: false`, and the zod verdict. Written here rather than in the lane's gitignored map, per the map's own durability warning.

**Not touched, deliberately:** `test/helpers/db.ts` (map §9 — `createTestDatabase()` already answers this; `testPool`/`migrateTestDb`/`TEST_DATABASE_URL` would have been a second answer pointing at a dead port), `src/app.ts`, `src/auth/routes.ts`, `src/auth/require-session.ts` (Task 2), `Features.md`, `test-cases/`.

---

## 2. The better-auth verification table

better-auth was absent from the repo (`grep -c better-auth pnpm-lock.yaml` → 0), so all five claims were install-time verifications. Every verdict below is from the installed package's own `.d.ts` / `package.json`, not from documentation.

| # | Plan claim | Verdict | Evidence and actual shape |
|---|---|---|---|
| 1 | `better-auth` exports `betterAuth` | **CONFIRMED** | `node_modules/better-auth/dist/index.d.mts:30` — `betterAuth` is in the named export list. |
| 2 | `better-auth/plugins` exports `bearer`, `magicLink`, `phoneNumber`; **`better-auth/plugins/passkey` exports `passkey`** | **half CONFIRMED, half ADAPTED** | `bearer`/`magicLink`/`phoneNumber`: confirmed in `dist/plugins/index.d.mts`'s export list (entries 142, 169, 186 of the `export { … }` at line 69). **`better-auth/plugins/passkey` DOES NOT EXIST in 1.7.2** — the package's `exports` map has 54 subpaths and no `./plugins/passkey` (there is no `@simplewebauthn/*` in its dependency list either). Passkey moved to its own package: **`@better-auth/passkey@1.7.2`**, whose `dist/index.d.mts` exports `passkey`, `Passkey`, `PasskeyOptions`, `PASSKEY_ERROR_CODES`, `getAuthenticatorName`, `commonAuthenticatorNames`. **Task 2 must import `import { passkey } from '@better-auth/passkey';`** — a separate line in `package.json` dependencies, already added. `PasskeyOptions` still carries `rpID?: string` and `rpName?: string` (`dist/index-B7Y0IgKK.d.mts:140,147,153`), so the plan's `passkey({ rpID, rpName })` call is unchanged. |
| 3 | `@better-auth/cli` supports `generate --config <path>` | **ADAPTED — and the CLI is REJECTED** | `generate --config` exists and ran successfully, but **the bin is named `better-auth`, not `@better-auth/cli`** (`@better-auth/cli`'s `bin` is `{"better-auth": "./dist/index.mjs"}`), so the invocation is `pnpm exec better-auth generate --config src/auth/auth-dev.ts --output <file> -y`. The CLI was then **removed from the repo** because its output is wrong for the installed library — see §3. |
| 4 | `better-auth/node` exports `fromNodeHeaders` | **CONFIRMED** | `dist/integrations/node.d.mts` (whole file): `declare function fromNodeHeaders(nodeHeaders: IncomingHttpHeaders): Headers;` and `declare const toNodeHandler: (auth: {handler} \| Auth["handler"]) => (req: IncomingMessage, res: ServerResponse) => Promise<void>;` — **both exported.** `toNodeHandler` is a second option for Task 2's catch-all route that the plan does not mention. |
| 5 | `auth.api.getSession({ headers })` is the 1.x shape | **CONFIRMED, and headers are mandatory** | `dist/api/index.d.mts:238` — `readonly getSession: StrictEndpoint<"/get-session", { method: ("GET"\|"POST")[]; query?: {disableCookieCache?, disableRefresh?}; requireHeaders: true; … }, { session: {id, createdAt, updatedAt, userId, expiresAt, token, ipAddress?, userAgent?}; user: {id, createdAt, updatedAt, email, emailVerified, name, image?} } \| null>`. Verified by compiling, not by reading: a throwaway probe module type-checked `const session = await auth.api.getSession({ headers }); session.user.id` and `session.session.token` as `string`, and a `@ts-expect-error`-guarded `auth.api.getSession({})` **was** an error (so `requireHeaders: true` is enforced in the type). `auth.handler` type-checks as `(request: Request) => Promise<Response>`. The probe was deleted after verification. |

**Extra, for Task 2's brief (all type-checked, not read):**
- `createAuth`'s `AuthDeps` shape works as written — `betterAuth`'s `database` option accepts a raw `pg.Pool` (`@better-auth/core` `init-options.d.mts:525`: `database?: (PostgresPool | MysqlPool | … )`).
- `phoneNumber`'s callback is `sendOTP: (data: { phoneNumber: string; code: string }, ctx?) => Awaitable<void>` (`dist/plugins/phone-number/types.d.mts:24`) and `signUpOnVerification: { getTempEmail: (phoneNumber) => string; getTempName?: (phoneNumber) => string }` (`:83-103`) — the plan's spelling is exact.
- `magicLink`'s is `sendMagicLink: (data: { email; url; token; metadata? }, ctx?) => Awaitable<void>` (`dist/plugins/magic-link/index.d.mts:35`) — the plan destructures `{ email, url }`, which is a subset and compiles.
- Endpoint path claims 13–15 in the map (`/api/auth/phone-number/send-otp`, the `better-auth.session_token` cookie, the bearer `set-auth-token` header) were **not** verified here — they are Task 2's runtime surface and need a live sign-in, which is Task 2's own test.

---

## 3. Resolved versions, and the CLI that generates the wrong schema

**Resolved:** `better-auth@1.7.2`, `@better-auth/passkey@1.7.2`, recorded in `pnpm-lock.yaml` as
`better-auth: specifier ^1.7.2, version 1.7.2(pg@8.23.0)(vitest@3.2.7(@types/node@22.20.1)(tsx@4.23.12))`.

**zod: no conflict, and no upgrade.** better-auth 1.7.2 declares **no zod peer range** — zod `^4.3.6` is a *direct dependency*, resolved to `zod@4.4.3` inside better-auth's own subtree. `apps/server` keeps `zod ^3.25.0`; nothing in the monorepo was upgraded. Its real peer ranges that touch us — `pg: ^8.0.0` (we have 8.23.0) and `vitest: ^2||^3||^4` (we have 3.2.7) — are both satisfied; the framework peers (react, vue, svelte, prisma, drizzle, mongodb, better-sqlite3 …) are all `optional: true`.

One cosmetic warning survives every install:
```
apps/server
└─┬ better-call 1.4.0
  └── ✕ unmet peer zod@^4.0.0: found 3.25.76
```
The installed graph contradicts it: the store holds exactly one `better-call`, keyed `better-call@1.4.0_zod@4.4.3`, and `better-call`'s own `peerDependenciesMeta` marks zod optional. pnpm is reporting the workspace importer's zod, not the one in force. **Do not "fix" this by upgrading zod** — it would touch every package in the monorepo to satisfy a warning about a resolution that is already correct.

### The finding that changed the plan: `@better-auth/cli` generates a 1.4 schema

`@better-auth/cli`'s latest release is **1.4.21** — there is no 1.7.x CLI — and it pins **`better-auth: "1.4.21"` as a hard dependency**, so `getMigrations` runs from *its* copy of the library, never from the project's. Run against this repo's own `auth-dev.ts` config it emitted an `account` table with:

- **no `"issuer" text not null` column**, and
- **no `create unique index "account_issuer_accountId_uidx" on "account" ("issuer","accountId")`**,

both of which better-auth **1.7.2** writes on every account link. Following Step 9/10 literally would have shipped a vendor schema that migrates cleanly and then fails on the first Google sign-in — precisely the failure mode Step 10 exists to prevent, delivered by the tool Step 10 names.

Side effects of keeping it were bad independently: it drags in ~150 packages including `@prisma/client` and a native-compiled `better-sqlite3`, on every CI install, to run one command.

**Ruling taken (conservative default, recorded per the autonomous-execution protocol):** `@better-auth/cli` is not a dependency of this repo. `src/tools/auth-schema.ts` + `pnpm --filter @gisik-nokma/server run auth:schema` print the schema of the library the server actually imports, and `test/auth/auth-tables.test.ts` asserts continuously that the migration has not drifted from it. Recorded in the coordination doc as "Plan 4 execution consequences §2" so Plan 11 does not reintroduce it.

**Lockfile hygiene note.** `pnpm remove @better-auth/cli` left the CLI's optional peers baked into the lockfile as resolution keys — `better-auth@1.7.2(@prisma/client@5.22.0)(better-sqlite3@12.11.1)(pg…)` — so a `--frozen-lockfile` CI install would still have fetched prisma and compiled better-sqlite3. The lockfile was therefore reset to `HEAD` and re-resolved from `package.json`; it now reads `better-auth@1.7.2(pg@8.23.0)(vitest@…)` with no prisma, no better-sqlite3 and no CLI anywhere (`grep -c "@better-auth/cli" pnpm-lock.yaml` → 0; the remaining `prisma`/`better-sqlite3` strings are unresolved optional-peer *declarations* in package metadata).

### The schema the library actually wants (and what the plan's DDL got wrong)

Generated by `pnpm run auth:schema` from better-auth 1.7.2 + @better-auth/passkey 1.7.2, and transcribed into the migration. Differences from the plan's `pgm.sql` block, all resolved in the library's favour:

| Table | Plan text | Library 1.7.2 |
|---|---|---|
| `user.email` | `text UNIQUE` (nullable) | `text NOT NULL UNIQUE` — a phone-only signup gets a synthetic `…@phone.gisik-nokma.invalid` address, which is what `signUpOnVerification.getTempEmail` is for |
| `user.emailVerified` | `NOT NULL DEFAULT false` | `NOT NULL`, **no default** |
| `session.updatedAt` | `NOT NULL DEFAULT now()` | `NOT NULL`, **no default** |
| `account.issuer` | absent | **`text NOT NULL`** — new in 1.7 |
| `account.updatedAt` | `NOT NULL DEFAULT now()` | `NOT NULL`, **no default** |
| `passkey.aaguid` | absent | **`text`** |
| `passkey.createdAt` | `NOT NULL DEFAULT now()` | `timestamptz` **nullable**, no default |
| indexes | `session_userId_idx`, `account_userId_idx`, `verification_identifier_idx` | those three **plus** `passkey_userId_idx`, `passkey_credentialID_idx`, and **UNIQUE** `account_issuer_accountId_uidx` |

`timestamptz` throughout — the generator's own choice, so there is no divergence to flag against the Asia/Kolkata session policy. `CURRENT_TIMESTAMP` is kept verbatim rather than rewritten to the house `now()` (identical in Postgres) so a future diff against `auth:schema` is a literal match.

---

## 4. Every departure from the plan text, and why

| # | Departure | Why |
|---|---|---|
| 1 | Migration is `1787927101493_auth-tables.sql`, not `<ts>_auth-tables.cjs`; `node-pg-migrate create` not run | Adaptation map §1 — main's three migrations are handwritten `.sql` with `-- Up/Down Migration` markers |
| 2 | No `testPool` / `migrateTestDb` / `truncateAll` / `TEST_DATABASE_URL`; `test/helpers/db.ts` untouched | Adaptation map §9 — `createTestDatabase()` already gives each test file its own database; `TEST_DATABASE_URL`'s default port 5432 has nothing on it (Postgres is on 54329) |
| 3 | `passkey` imported from `@better-auth/passkey`, which is a new dependency | Finding: `better-auth/plugins/passkey` does not exist in 1.7.2 (§2 claim 2) |
| 4 | `@better-auth/cli` not installed; `src/tools/auth-schema.ts` + `auth:schema` script instead | Finding: the CLI is pinned to its own better-auth 1.4.21 and generates a schema missing a NOT NULL column (§3) |
| 5 | Migration DDL follows the generator, not the plan's column list | Plan Step 10's own instruction — "the library wins" |
| 6 | `auth-dev.ts` uses `createPool` and the 54329 docker-compose URL | `src/db.ts` requires every pool to come through `createPool`; the plan's URL points at a nonexistent database |
| 7 | `declaration: false` in `apps/server`'s two tsconfigs | §5 below |
| 8 | Test imports carry `.js` extensions | NodeNext + `tsconfig.typecheck.json` includes `test/`; the brief's extensionless specifiers are TS2835 |
| 9 | `process.env['X']` bracket access | Repo style (`test/helpers/db.ts:10`, `migrations.test.ts:8`) |
| 10 | A fourth test (`auth-tables.test.ts`, 4 cases) beyond the plan's 2 | Step 10's reconciliation is a one-off manual compare in the plan; as a test it survives the next better-auth upgrade |
| 11 | Coordination doc amended | Adaptation map's durability warning; map §11 requires Task 1 to *record* the `Queryable` choice |

---

## 5. `declaration: false` — the one change with blast radius

`tsc` refused both `createAuth` and `auth` with **TS2742**:

```
src/auth/auth.ts(37,17): error TS2742: The inferred type of 'createAuth' cannot be named
  without a reference to '.pnpm/@simplewebauthn+server@13.3.3/node_modules/@simplewebauthn/server'.
src/auth/auth.ts(37,17): error TS2742: … without a reference to '.pnpm/zod@4.4.3/node_modules/zod/v4/core'.
```

`betterAuth(...)`'s inferred type reaches into `@simplewebauthn/server` and zod 4, both nested under better-auth in the pnpm store and so unnameable from `apps/server`. `declaration: true` comes from `tsconfig.base.json`; it is now overridden to `false` in `apps/server/tsconfig.json` **and** `tsconfig.typecheck.json` (the check fires under `noEmit` too).

`apps/server` is a private leaf app that nothing imports, so it loses nothing. The alternatives were worse: hoisting a second zod major into a package that already depends on zod 3, or hand-writing a facade `Auth` type that would silently narrow the plugin API Task 2 builds on. `packages/domain` and `packages/rule-engine` are untouched and still emit declarations. Recorded in the coordination doc.

---

## 6. Falsifiability evidence

Four checks were planted; each was proven to fail **at its own assertion** by mutating the code it guards, then restored. Every restoration was verified with `git checkout -- <path>` followed by an **empty `git diff`** and by reading the restored lines — never with a shell `diff`.

**(a) `LogOtpSender` records what it sent.** Deleted `this.sent.push({ phoneE164, code })` from `otp-sender.ts`.
→ `AssertionError: expected [] to deeply equal [ Array(1) ]` at `expect(sender.sent).toEqual(...)`. This is the shape that matters: Task 2's `signInWithPhone` helper reads `sender.sent` to learn the OTP, so a silently non-recording sender breaks every later auth test with no message of its own.

**(b) `LogMagicLinkSender` logs.** Deleted the `this.log(...)` line from `magic-link-sender.ts`.
→ `AssertionError: … (undefined and string) is invalid for this assertion` at `expect(lines[0]).toContain('kiro@example.com')`.

**(c) The anti-drift check — planted in the exact shape the real risk takes.** Rather than an arbitrary mutation, the migration was edited into **exactly what `@better-auth/cli` 1.4.21 emits**: `account."issuer"` removed, its `COMMENT ON COLUMN` removed, and the `account_issuer_accountId_uidx` unique index removed — a migration that applies without error.
→ `AssertionError: expected [ 'account.issuer' ] to deeply equal []` at `auth-tables.test.ts:69`, the `plan.toBeAdded` assertion.
**And the other three tests in the file still PASSED** — the "five tables exist" and "camelCase columns" checks are blind to this drift. That is the point of the third check, and the reason a `toContain('user')`-style test is not sufficient evidence that a vendor schema is correct.

*(A first attempt at this mutation left the `COMMENT ON COLUMN "account"."issuer"` line behind; the migration then failed in `beforeAll` with `column "issuer" of relation "account" does not exist` and all four tests were reported **skipped**. A setup failure is not assertion-level evidence, so the mutation was redone cleanly. Recorded because the distinction is the whole discipline.)*

**(d) The camelCase vendor exception.** Renamed `"emailVerified"` to `"email_verified"` in the migration — the well-meaning house-style "fix" the exception exists to prevent.
→ two independent failures: `expected [ 'id','name','email',…(6) ] to include 'emailVerified'` at `auth-tables.test.ts:49`, and `expected [ 'user.emailVerified' ] to deeply equal []` at `:69`.

The fourth check (no projection claims a vendor table) is a boundary guard with no defect planted: `buildProjectionRegistry().all()` currently registers two projections over `proj_entity_heads` and `proj_workflows`, so it asserts a true negative today. It is falsifiable by construction — registering any projection whose `tables` names a vendor table turns it red — but that mutation would require inventing a bogus projection, which is a heavier lie than the check is worth. **Flagged as the weakest check in this task.**

---

## 7. Verification command and output

Run from the worktree root, after the lockfile re-resolution:

```
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
pnpm turbo run build test typecheck
```

```
@gisik-nokma/domain:test:      Test Files  12 passed (12)   Tests  152 passed (152)
@gisik-nokma/rule-engine:test: Test Files   4 passed (4)    Tests  115 passed (115)
@gisik-nokma/server:test:      Test Files  16 passed (16)   Tests   99 passed (99)
 Tasks:    9 successful, 9 total
```

Server went 93 → 99 tests (14 → 16 files): +2 sender, +4 vendor schema. Plan 1–3 suites untouched and unchanged in count. `build` and `typecheck` are green for all three packages, i.e. `tsc -p tsconfig.json` and `tsc -p tsconfig.typecheck.json` (which includes `test/`) both pass under `strict` + `noUncheckedIndexedAccess` + NodeNext.

Postgres was the lane's own on port 54329; every DB-touching test creates and drops its own `gisik_test_<uuid>` database, so nothing collides with sibling lanes.

---

## 8. Concerns handed forward

1. **Task 2's import line changes:** `import { passkey } from '@better-auth/passkey'` — not `better-auth/plugins/passkey`. Already wired in `auth.ts`; flagged because Task 2's brief was written from the plan text.
2. **`@better-auth/cli` must not be reinstalled** by any later task or by Plan 11's packaging. The coordination doc says so; this is the item most likely to be undone by someone following the plan text.
3. **`toNodeHandler` exists** (`better-auth/node`) and may be a simpler Task 2 catch-all than a hand-rolled `Request`/`Response` bridge. Unverified at runtime — noted, not recommended.
4. **Google is configured with empty credentials** (`process.env['GOOGLE_CLIENT_ID'] ?? ''`), which makes better-auth log `Social provider google is missing clientId or clientSecret` on every boot and in the test suite. Deliberate — an absent pair leaves the provider unusable rather than failing server start — but it is log noise, and whichever plan owns the env contract (Plan 11) should decide whether an unconfigured provider should be omitted from `socialProviders` entirely instead.
5. **`auth-dev.ts` carries `secret: … ?? 'dev-only-secret-change-me'`**, which better-auth warns is low-entropy and under 32 chars. Not a credential and not on the production path (`src/config.ts` is), but Plan 11's `.env.example`/`check:env` gate should list `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
6. **Weakest check** is the projection-boundary test in §6; see the note there.

---

## 9. Post-report verifications (coordinator request, 2026-08-28)

### 9.1 `declaration: false` in `tsconfig.typecheck.json` is LOAD-BEARING — verified by toggle

Removed the line from `apps/server/tsconfig.typecheck.json` only, left `tsconfig.json` untouched, ran `pnpm exec tsc -p tsconfig.typecheck.json`:

```
src/auth/auth-dev.ts(17,14): error TS2742: The inferred type of 'auth' cannot be named without a
  reference to '.pnpm/@simplewebauthn+server@13.3.3/node_modules/@simplewebauthn/server'. …
src/auth/auth-dev.ts(17,14): error TS2742: … '.pnpm/zod@4.4.3/node_modules/zod/v4/core'. …
src/auth/auth.ts(37,17): error TS2742: … '@simplewebauthn/server'. …
src/auth/auth.ts(37,17): error TS2742: … 'zod/v4/core'. …
```

**TS2742 returns.** `noEmit` suppresses the *output* of declaration files, not the declaration-emit *check*. The flag is not belt-and-braces in the typecheck config; without it `build` stays green while `typecheck` fails, and the two configs read as gratuitously inconsistent to whoever is diagnosing that. Both comments now say this, and both now carry the clause that stops the next tidy-up: **`tsconfig.base.json:9` sets `"declaration": true`, so the line overrides an inherited `true` — deleting it restores that `true` rather than leaving the flag unset.**

Line restored in both files; `tsc -p tsconfig.typecheck.json` and `tsc -p tsconfig.json` both exit clean. Restoration verified by reading the files and by `git diff`, which shows only the intended comment expansion (`+23 / -8` across the two configs, `declaration: false` present in both).

### 9.2 Does better-auth's public runtime surface hand back zod schemas? — YES, but the mix is a compile error, not a silent runtime bug

Checked on both axes, at runtime and at the type level, not by reading docs.

**(a) Nothing we pass IN is zod-typed — clean negative.** `BetterAuthOptions` (`@better-auth/core/dist/types/init-options.d.mts`) contains **zero** occurrences of `Zod`, and so do the option types of the three core plugins we configure (`phone-number/types.d.mts`: 0, `bearer/index.d.mts`: 0). Every option this repo supplies — `database`, `baseURL`, `secret`, `emailAndPassword`, `socialProviders`, and the plugin callbacks — is plain data or a function. **We never hand better-auth one of our zod-3 schemas, and it has no field that would accept one.**

**(b) Zod-4 schema objects DO come OUT, in two places.** Verified at runtime against the real instance:

- **Seven named exports of the `better-auth` barrel are live zod-4 schema objects**: `userSchema`, `sessionSchema`, `accountSchema`, `verificationSchema`, `coreSchema`, `rateLimitSchema`, `additionalAuthorizationParamsSchema` (found by filtering the 102 runtime exports for objects carrying `_zod`).
- **Every endpoint on `auth.api.*` carries its schema at runtime.** Probed three: `auth.api.getSession.options.query`, `auth.api.signInMagicLink.options.body`, `auth.api.sendPhoneNumberOTP.options.body` — each a live schema whose `_zod.version` reads `{ major: 4, minor: 4, patch: 3 }`. So the endpoint metadata Task 2 might be tempted to reuse for request validation *is* zod 4.

**(c) But TypeScript catches the cross-major mix.** The hazard as posed — "composed with one of our zod-3 schemas, misbehaves at runtime, with no type error anywhere" — **does not hold here.** Composing them without a cast is a compile error:

```
z.object({ workspaceId: z.string() }).and(userSchema)
→ error TS2345: Argument of type 'ZodObject<{ id: ZodString; … }, $strip>' is not assignable to
  parameter of type 'ZodTypeAny'. … is missing the following properties from type
  'ZodType<any, any, any>': _type, _parse, _getType, _getOrReturnCtx, and 7 more.
```

zod 3's `ZodType` and zod 4's `ZodObject` are structurally incompatible enough that the compiler refuses. Only an explicit `as never` / `as any` cast gets a mix through — which is a deliberate act, not an accident.

**(d) One residual trap, and it fails loudly.** `better-auth/dist/index.d.mts:29` contains `export * from "zod";`, so **`import { z } from 'better-auth'` type-checks** and would hand a reader zod 4 under the name they expect to be zod 3. The runtime barrel (`dist/index.mjs`) has **no** such re-export, so the import is a link-time failure:

```
SyntaxError: The requested module 'better-auth' does not provide an export named 'z'
```

An ESM link error — the module does not even load, so this can never reach production silently; the first test to import that file fails. Named for Task 2 and Plan 7 anyway, because the *type* acceptance makes it look correct in an editor.

**Verdict to record:** the coexistence is **not** inert — better-auth's public surface returns live zod-4 schemas — but it is **safe by construction on this repo's usage**: nothing flows in, and anything flowing out cannot be composed with our zod 3 without an explicit cast, which the compiler will otherwise refuse. The standing rule for Task 2 and Plan 7: **import `z` only from `zod`, never from `better-auth`, and do not reuse `auth.api.*.options.body` as a validator in our own zod-3 code.**

### 9.3 Membership entity id — noted, no action

The owner has since ratified the composite-id exception (adaptation map §7 / blocker B2): `entity.kind === 'membership'` admits `${workspaceId}:${userId}`, every other kind keeps `ulidString`. Nothing in Task 1 touches the envelope, and §1's note that the identity boundary keeps membership in the ledger is unaffected — but the report should not be read as describing the envelope door as untouchable for Task 3.

### 9.4 Gate re-run after these changes

Only the two tsconfig comment blocks changed; no source, no test, no schema. Re-run from the worktree root:

```
pnpm turbo run build test typecheck
→ @gisik-nokma/domain:test       Test Files  12 passed (12)   Tests  152 passed (152)
→ @gisik-nokma/rule-engine:test  Test Files   4 passed (4)    Tests  115 passed (115)
→ @gisik-nokma/server:test       Test Files  16 passed (16)   Tests   99 passed (99)
   Tasks:    9 successful, 9 total
```

---

## 10. Fix round 1 — three findings, one verification

Review outcome: Spec PASS, quality APPROVED conditional on #1. All three findings accepted as stated; none was disputed.

### 10.1 IMPORTANT #1 — the coordination doc recorded the inverse of the truth. Corrected.

**The reviewer is right and my original reason was wrong.** I read a `.pnpm` *directory name* (`better-call@1.4.0_zod@4.4.3`) and a resolution-key *substring* and concluded better-call had resolved zod 4. Both were artifacts: the directory was an unpruned leftover of the `@better-auth/cli` install, and the key is a stale peer label whose `dependencies` block says otherwise. Re-derived from `pnpm-lock.yaml` and a **pruned** `node_modules` (§10.4's clean install), not from the deleted probe module:

| Evidence | Reading |
|---|---|
| `pnpm-lock.yaml:1881` | the **only** `better-call` snapshot: `better-call@1.4.0(zod@3.25.76):` with `optionalDependencies: zod: 3.25.76` |
| `pnpm-lock.yaml:1363-1371` | `@better-auth/core`'s key says `(better-call@1.4.0(zod@4.4.3))`, its `dependencies` say `better-call: 1.4.0(zod@3.25.76)` — **the key lies, the edge does not** |
| pruned store | exactly one directory, `better-call@1.4.0_zod@3.25.76`; `better-auth`, `@better-auth/core` and `@better-auth/passkey` **all three** symlink to it |
| per-package `zod` links | `better-call` → 3.25.76; `better-auth` → 4.4.3; `@better-auth/core` → 4.4.3; `@better-auth/passkey` → 4.4.3 (own direct `zod ^4.3.6`) |

So `better-call` resolved its optional peer to **3.25.76, outside its declared `^4.0.0`** — exactly what pnpm's warning says and what my entry dismissed. **The conclusion survives unchanged — nobody upgrades zod — and the reason is replaced.**

Safe because `better-call`'s only zod use anywhere in `dist/` is `openapi.mjs`/`openapi.cjs`. **Corrected in round 2:** that module is not absent from the process — `generator`/`getHTML` are re-exported from better-call's root barrel, so it loads eagerly on every `import 'better-call'`. It is loaded and never reached, which is a different claim. See §11.1.

**Ride-along accepted: my "the compiler refuses the mix" was true of our code and already false inside the vendor.** `better-call/dist/openapi.cjs:20` and `:36` run `options.query instanceof zod.ZodObject` / `options.body instanceof zod.ZodObject` with a zod-3 `ZodObject` against zod-4 schema objects — a silent `false`, no compile error, no throw, producing an OpenAPI document quietly missing its parameters and bodies. **The trigger I named for this — "nothing here enables better-auth's openAPI plugin" — is wrong, and is corrected in §11.1; do not read this paragraph for it.** Both coordination entries carry the live caveat: §4 with the corrected trigger, and the runtime paragraph scoped to *our* source with an explicit "this is not a claim that the hazard cannot occur".

### 10.2 IMPORTANT #2 — the drift test was blind to shape. Fixed, both channels now asserted.

Mechanism confirmed at `apps/server/node_modules/better-auth/dist/db/get-migration.mjs`:

```js
if (field.required !== false && column.isNullable) logger.warn(`Column "${fieldName}" … stays nullable …`);
if (matchType(column.dataType, field.type, dbType)) continue;
else logger.warn(`Field ${fieldName} in table ${key} has a different type …`);
```

Neither branch touches `toBeAddedFields`, so neither reaches `toBeAdded` — the only thing the old test asserted on. Presence was caught; shape was not, and the coordination doc was meanwhile telling Plan 11 that red means a required migration.

**Fix taken: the capturing-logger route**, so the test's name stays true rather than being narrowed. `getMigrations` is handed `{ ...auth.options, logger: { level: 'debug', log: (level, message) => { … } } }` and the captured `warn`/`error` messages are asserted empty alongside the three arrays. No production surface changed — `AuthDeps` is untouched and the logger override lives only in the test. Renamed to *"the installed better-auth finds nothing left to create and warns about nothing — no drift in presence or in shape"*, and the docstring now names both channels and why asserting on one is how a drift check comes to look green while the schema is wrong.

**Falsifiability, using the reviewer's own two mutations.** Both previously passed all 4 tests; both now fail at the new assertion, `expect(warnings).toEqual([])` at `auth-tables.test.ts:97`:

| Mutation | Before | After |
|---|---|---|
| `user."emailVerified" boolean NOT NULL` → `boolean` (nullable) | 4/4 passed | `AssertionError: expected [ Array(1) ] to deeply equal []` at `:97:22` |
| `passkey."counter" integer NOT NULL` → `text NOT NULL` | 4/4 passed | `AssertionError: expected [ Array(1) ] to deeply equal []` at `:97:22` |

Restored after each; `git diff` on the migration empty both times, and lines 20 and 81 read back as `"emailVerified"       boolean NOT NULL,` and `"counter"      integer NOT NULL,`. Suite green after restore.

### 10.3 IMPORTANT #3 — the entry guard could not fail. Fixed.

`auth-schema.ts` now uses `import.meta.url === pathToFileURL(process.argv[1]).href`, matching `verify-projections.ts`. Demonstrated rather than asserted — a probe run from a directory whose name contains spaces:

```
import.meta.url          : file:///…/guard%20test%20dir/guard.mjs
`file://${argv[1]}`      : file:///…/guard test dir/guard.mjs
pathToFileURL(argv[1])   : file:///…/guard%20test%20dir/guard.mjs
OLD guard (template)     : FALSE — SILENTLY PRINTS NOTHING, EXIT 0
NEW guard (pathToFileURL): TRUE — runs
```

`import.meta.url` percent-encodes; the template string does not. Under the old guard a checkout path with a space, `#` or non-ASCII character made `pnpm run auth:schema` a check that cannot fail — succeeding while emitting nothing, which the Global Constraints call not-evidence.

Ride-along fixed: the docstring's dead pointer `migrations/1787900000000_auth-tables.sql` now reads `1787927101493_auth-tables.sql`, the actual filename.

Post-fix, `pnpm --filter @gisik-nokma/server run auth:schema` still emits all 11 statements (5 tables, 5 indexes, 1 unique index) including `account_issuer_accountId_uidx`.

### 10.4 VERIFICATION — clean install from an emptied tree

`rm -rf` is refused by this session's sandbox, so all four `node_modules` trees (root + the three workspace projects) were **moved aside** into the scratchpad, which produces the same condition and is reversible. `find` then confirmed no `node_modules` remained anywhere in the repo.

```
pnpm install --frozen-lockfile
→ Scope: all 4 workspace projects
  Lockfile is up to date, resolution step is skipped
  Packages: +206
  Done in 1.1s
  EXIT: 0
```

The pruned store now matches the lockfile: **no** `@better-auth/cli`, **no** `@better-auth/core@1.4.x`, **no** `@prisma/client`, **no** `better-sqlite3`, and exactly one `better-call` (the zod-3 one) — all of which were present as unreferenced leftovers before. This is what made §10.1's original error possible, and is why the rewrite was derived only after the prune. The peer warning is not printed on a frozen-lockfile install (resolution is skipped); it appears only on resolving installs.

```
pnpm turbo run build test typecheck
→ @gisik-nokma/domain:test       Test Files  12 passed (12)   Tests  152 passed (152)
→ @gisik-nokma/rule-engine:test  Test Files   4 passed (4)    Tests  115 passed (115)
→ @gisik-nokma/server:test       Test Files  16 passed (16)   Tests   99 passed (99)
   Tasks:    9 successful, 9 total
```

**Nothing differs from the reported 366 green.** The working tree was not hiding anything CI would not reproduce.

### 10.5 Deferred, not fixed (recorded per instruction)

- `auth-schema.ts` takes its DB URL from `auth-dev.ts`'s fallback rather than `loadConfig`. Code stands; **§1's claim that it "mirrors the shipped `verify:projections` shape" has been corrected in place** to say it mirrors the structure, not the config validation or the entry guard.
- The `auth-dev.ts` fallback secret — reviewer traced the non-reachability argument and confirmed it.

---

## 11. Fix round 2 — the caveat named the wrong trigger

Re-review: #1, #2 and #3 all ADDRESSED. Two items remained, both about the openapi caveat's accuracy rather than about code. No production behaviour changed in this round; the only source edit is a docstring.

### 11.1 The openapi caveat's trigger and remedy were both wrong. Rewritten in both locations.

Every one of the reviewer's three counts re-verified here against the vendor tree before rewriting — none was taken on trust:

| Count | Verified at | Reading |
|---|---|---|
| better-auth's `openAPI()` uses its **own** generator | `better-auth/dist/plugins/open-api/index.mjs:5` → `import { generator } from "./generator.mjs"`; `generator.mjs:3` → `import * as z from "zod"`; better-auth's `zod` symlink → **4.4.3** | enabling that plugin never reaches better-call's zod-3 code |
| better-call's hazard path is **already off** | `better-call/dist/router.mjs:7-16` gates `/api/reference` + `generator` on `if (!config?.openapi?.disabled)`; `better-auth/dist/api/index.mjs:155` passes `openapi: { disabled: true }` unconditionally | the one path that would reach it is switched off by better-auth itself |
| nothing here imports `better-call` | `grep -rn "better-call" apps/*/src apps/*/test packages/*/src packages/*/test` → no matches | no repo code is near it |

**So my "whichever plan first enables better-auth's openAPI plugin inherits this" named an event that cannot trigger the bug, and "force one zod major" was a remedy for it.** A future plan reading the durable record would have watched the wrong signal — which is exactly the failure this finding is about, so the report's own copy at §10.1 is corrected in place too rather than left to contradict the coordination doc.

**The corrected trigger, now recorded:** the mix goes live only if repo code calls better-call's `createRouter` **without** `openapi: { disabled: true }`, or calls the root barrel's `generator` / `getHTML` directly. If that day comes the fix is to keep better-call's OpenAPI generation disabled, or to align better-call's zod with better-auth's.

**Two supporting corrections, both verified:**

- *"a module not even in its `exports` map"* was true of the **subpath** only and misleading as stated. `generator` and `getHTML` **are** re-exported from the root barrel — `better-call/dist/index.cjs:8,17,19` (`require_openapi = require("./openapi.cjs")`, `exports.generator`, `exports.getHTML`), `dist/index.mjs:7`, and `dist/router.mjs:4` — and both appear in `dist/index.d.cts`. So `openapi` and its zod-3 binding (`openapi.mjs:1` `import { ZodObject, ZodOptional } from "zod"`; `openapi.cjs:1` `require("zod")`, resolving to **3.25.76**) load **eagerly on every `import 'better-call'`**.
- Therefore *"the endpoint runtime this repo exercises never imports zod"* was imprecise. The accurate statement, now in both documents: **the code is loaded and never reached** — not absent. The `instanceof` sites at `openapi.cjs:20,36` are simply never evaluated.

### 11.2 Ride-along — `auth-dev.ts`'s docstring re-motivated the banned CLI, and named a command that does not exist

`apps/server/src/auth/auth-dev.ts:7` read *"Concrete instance for `pnpm exec better-auth generate --config …`"* — pointing at the banned workflow from the very file the replacement tool loads. Confirmed the command is also simply unrunnable:

```
$ pnpm exec better-auth generate --config src/auth/auth-dev.ts
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "better-auth" not found
$ ls apps/server/node_modules/.bin/
node-pg-migrate  node-pg-migrate-cjs  node-pg-migrate-esm  tsc  tsserver  tsx  vitest
```

The `generate` bin ships in `@better-auth/cli`, not in the library. Docstring now points at `pnpm --filter @gisik-nokma/server run auth:schema` and carries a one-line "deliberately NOT `better-auth generate`" with the reason, so the site that reads `auth.options` also says why the CLI is not the way to read it.

Re-confirmed the coordinator's FYI independently: `grep -c "@better-auth/cli" pnpm-lock.yaml` → **0**, and no `package.json` in the repo mentions it. The install half was never a problem; this comment was the only live remnant.

### 11.3 Gate

```
pnpm turbo run build test typecheck
→ @gisik-nokma/domain:test       Test Files  12 passed (12)   Tests  152 passed (152)
→ @gisik-nokma/rule-engine:test  Test Files   4 passed (4)    Tests  115 passed (115)
→ @gisik-nokma/server:test       Test Files  16 passed (16)   Tests   99 passed (99)
   Tasks:    9 successful, 9 total
```

366 green, unchanged. Expected: this round touched two documents and one docstring.

---

## 12. Fix round 3 — better-auth was minting ids the ledger door refuses

A real gap, and mine rather than Task 3's: `envelope.ts:79`'s `actorId: ulidString` has been on `main` since Plan 1, and Task 1 wired an identity provider that cannot satisfy it. Nothing about the envelope changed; the identity layer conforms to it.

### 12.1 What better-auth 1.7.2 generates by default — read, not assumed

`@better-auth/core/dist/utils/id.mjs`, in full:

```js
const generateId = (size) => createRandomStringGenerator("a-z", "A-Z", "0-9")(size || 32);
```

A **32-character mixed-case alphanumeric** string. A ULID is 26 characters of Crockford base32 with a leading `0-7` (`ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/`). Not a no-op: the default is refused by the door, and the two never overlap — mixed case alone disqualifies every default id.

### 12.2 The configuration point, from the installed `.d.ts`

`@better-auth/core/dist/types/init-options.d.mts:374` — `generateId?: GenerateIdFn | false | "serial" | "uuid"`, under `advanced.database`, with `GenerateIdFn = (options: { model: ModelNames; size?: number }) => string | false` (`:26-29`).

The resolution order is at `better-auth/dist/context/create-context.mjs:106-119`: `advanced.generateId` (a legacy path, **not present in the type**) is consulted first, then `advanced.database.generateId`, then the `"uuid"`/`"serial"`/`false` literals, then the 32-char default. I used `advanced.database.generateId` — the one the installed types actually declare.

### 12.3 What was configured, and the scope decision

```ts
advanced: { database: { generateId: () => newUlid() } },
```

`newUlid()` from `@gisik-nokma/domain`, not a second `ulid()` call — `ids.ts` stays the one origin of what a ULID is, the discipline `envelope.ts` states for `ULID_REGEX`.

**Applied to every model, deliberately, not only `user`.** Session, account, verification and passkey ids never enter the ledger and carry no ULID requirement, so this is wider than strictly needed. Reasons, recorded rather than implied: one unconditional rule has no branch to get wrong; a `user`-only version needs a fallback for the other models, and the honest fallbacks are bad — `false` asks Postgres for a default our vendor schema does not define, and calling better-auth's own `generateId` means depending on a vendor internal; and a table a future plugin adds conforms without anyone remembering a list. `size` is ignored because a ULID is fixed-length. **Session tokens are untouched** — `db/internal-adapter.mjs` calls better-auth's own `generateId(32)` directly for those, not this hook, so token entropy is unchanged.

### 12.4 Falsifiability — the check fails when the config is removed, in the shape that matters

`apps/server/test/auth/user-ids.test.ts` (3 tests) signs a user up through the **real** phone-OTP path — OTP out through our `LogOtpSender`, code back in via `auth.api.verifyPhoneNumber` — then reads the id **from Postgres**, not from the response, and puts it through the **real door** (`parseEvent` on a `submittedWorkspaceCreated({ actorId: userId })`), not a regex twin of it.

With `advanced.database.generateId` deleted from `createAuth`, all three fail at their own assertions:

| Test | Failure with the config removed |
|---|---|
| the door accepts the id it minted | `AssertionError: door refused: malformed-envelope — event envelope is malformed at actorId: must be a ULID` — `user-ids.test.ts:73` |
| the stored id is a ULID | `expected 'QhiYV1j73o6pGaVNrVv37ccUwk9fsFtY' to match /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/` — `:81` |
| the rule is global (session id too) | `expected 'ARcHLW4vnsoVsO1O3vGttYmfSMkxaACJ' to match /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/` — `:94` |

The first row is the coordinator's predicted failure, reproduced live: the refusal names the envelope for a fault in the identity layer. The other two show the actual default ids — 32 characters, mixed case — confirming §12.1's reading of the source empirically.

Restored by re-inserting the block; `git diff` against HEAD shows `1 file changed, 34 insertions(+)` and **no deletions**, i.e. purely the ULID addition, and the restored region reads back correctly. All three green again.

### 12.5 The vendor migration — checked, and correct as it stands

No change needed, verified rather than assumed:

- Every id column is unbounded `text` — `user."id"`, and the `"userId"` foreign keys on `session`, `account`, `passkey`. Column types across the whole migration are 31×`text`, 13×`timestamptz`, 3×`boolean`, 1×`integer`: **no `varchar(n)`, no `char(n)`**. 26 characters fit where 32 did.
- better-auth's own planner agrees: `get-migration.mjs:493-494` only alters id typing for `generateId === "uuid"` or `"serial"`; a function-valued generator leaves `text`. The §10.2 anti-drift test runs against an auth instance carrying the new option and stays green — so the library itself confirms the schema still matches.

### 12.6 Gate

```
pnpm turbo run build test typecheck
→ @gisik-nokma/domain:test       Tests  152 passed (152)
→ @gisik-nokma/rule-engine:test  Tests  115 passed (115)
→ @gisik-nokma/app-core:test     Tests    5 passed (5)
→ @gisik-nokma/ui:test           Tests   31 passed (31)
→ @gisik-nokma/server:test       Test Files  17 passed (17)   Tests  102 passed (102)
   Tasks:   15 successful, 15 total
```

Server 99 → **102** (17 files), 405 across the workspace. The rebase brought sibling lanes' `app-core` and `ui` packages into the gate; all green.

Recorded in the coordination doc as **Plan 4 execution consequences §5**, including the point that any later plan swapping the auth provider inherits the constraint — the requirement belongs to the ledger, not to better-auth.
