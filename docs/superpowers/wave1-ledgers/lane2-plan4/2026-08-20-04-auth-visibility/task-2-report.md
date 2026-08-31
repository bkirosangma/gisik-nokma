# Task 2 report — auth routes on Fastify and session resolution

Branch `exec/04-auth-visibility`, worktree `lane2-plan4`. better-auth **1.7.2**, Fastify **5.12.1**,
Postgres 16 on 54329.

Everything below labelled CONFIRMED or ADAPTED was produced by running the thing. Nothing in this
report is inferred from a `.d.ts` or from plan text.

---

## 1. What was built, file by file

### Created

**`apps/server/src/auth/routes.ts`** — `registerAuthRoutes(app: FastifyInstance, auth: Auth): void`.

Registers an **encapsulated** Fastify plugin scope containing (a) `removeAllContentTypeParsers()` plus a
raw `'*'` `parseAs: 'buffer'` parser, and (b) one route with `method: ['GET','POST']` at `/api/auth/*`.
The handler builds a WHATWG `Request` (origin from `auth.options.baseURL`, headers copied verbatim, body
forwarded as raw bytes for POST only), calls `auth.handler`, then copies status, every non-`Set-Cookie`
header, the `getSetCookie()` array as one Fastify array header, and the body as text.

**`apps/server/src/auth/require-session.ts`** — `makeRequireSession(auth: Auth)` returning a Fastify
preHandler; `UNAUTHENTICATED_BODY`; and the `declare module 'fastify'` augmentation adding
`currentUserId: string` to `FastifyRequest`.

**`apps/server/test/helpers/session.ts`** — `signInWithPhone(app, sender, phone): Promise<SignedInUser>`
where `SignedInUser = { token: string; userId: string }`. Signs in over the wire through the real
endpoints; throws with the server's own answer on every failure path rather than returning `undefined`.

**`apps/server/test/auth/sign-in-flows.test.ts`** — 17 `it` blocks (literal count).
**`apps/server/test/auth/require-session.test.ts`** — 6 `it` blocks (literal count).

### Modified

**`apps/server/src/app.ts`** — `AppDeps` gains `auth: Auth` (required); `registerAuthRoutes(app, deps.auth)`
appended beside `registerEventRoutes`. `buildApp` stays **synchronous**, still
`buildApp(deps, options) -> FastifyInstance`.

**`apps/server/src/auth/auth.ts`** — one line added: `advanced.disableOriginCheck: false`. See §4.

**`apps/server/src/config.ts`** — `configSchema` gains required `BETTER_AUTH_URL` (`z.string().url()`)
and `BETTER_AUTH_SECRET` (`z.string().min(32)`), both with **no default**; `AppConfig` gains
`betterAuthUrl` and `betterAuthSecret`.

**`apps/server/src/index.ts`** — builds the auth instance from validated config and passes it to
`buildApp`.

**`apps/server/test/app.test.ts`** — 2 call sites updated with a local `offlineAuth()` over a pool
pointing at a closed port; the file stays database-free.

**`apps/server/test/events-route.test.ts`** — 2 call sites updated with a local `testAuth()`.

**`apps/server/test/config.test.ts`** — `VALID_ENV` extended; the missing-`DATABASE_URL` case tightened
(see §5); 3 new cases (6 → 9 `it` blocks).

**`docs/superpowers/plans/2026-08-20-00-series-coordination.md`** — new entry
*"7. The auth HTTP surface, measured rather than read"* under Plan 4 execution consequences, in this
commit.

---

## 2. Runtime verification table

Every row was produced by a live request. Column 3 says how.

| # | Question | Answer | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Session cookie name, http baseURL | `better-auth.session_token` | **CONFIRMED** (was plan text) | `POST /api/auth/phone-number/verify` → `Set-Cookie`; pinned by test |
| 2 | Its flags, http | `Max-Age=604800; Path=/; HttpOnly; SameSite=Lax` — **no `Secure`** | **CONFIRMED** | attribute list asserted with `toEqual`, so `Secure`'s absence is pinned |
| 3 | Session cookie name, **https** baseURL | `__Secure-better-auth.session_token` | **ADAPTED** — a different *name*, not the same name plus a flag | second auth instance at `https://app.example.test`, no TLS involved |
| 4 | Its flags, https | `Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax` | **CONFIRMED** | same test |
| 5 | Bearer token header | `set-auth-token` | **CONFIRMED** (plan text was right) | present on `phone-number/verify` and on `magic-link/verify` |
| 6 | …and CORS exposure | `access-control-expose-headers: set-auth-token` | **NEW** — not in plan text | asserted by test |
| 7 | Session object shape | `{ session: {id, token, userId, expiresAt, createdAt, updatedAt, ipAddress, userAgent}, user: {id, name, email, emailVerified, image, phoneNumber, phoneNumberVerified, createdAt, updatedAt} }` | **CONFIRMED** | `Object.keys().sort()` pinned for both levels |
| 8 | `getSession` on no session / forged bearer / corrupt cookie / signed-out token | `null` in all four | **CONFIRMED** | probe + 4 test cases |
| 9 | Endpoint verbs | GET and POST only, across all 46 | **CONFIRMED** (given) | catch-all uses exactly these two |
| 10 | `/get-session` | accepts GET (and POST) | **CONFIRMED** | test uses GET |
| 11 | `/passkey/generate-register-options` | **GET**, works with bearer *and* cookie | **ADAPTED** — the plan's verb intuition would say POST | test asserts a live `challenge` and `rp: {name:'Gisik Nokma', id:'localhost'}` |
| 12 | Magic-link verification | `302` + `location` + `Set-Cookie` + `set-auth-token` | **CONFIRMED** (plan allowed 200 or 302; it is 302) | test pins 302 |
| 13 | Magic link origin | built from configured `baseURL`, not from `Host` | **CONFIRMED** | `expect(url.origin).toBe(BASE_URL)` |
| 14 | `POST /sign-in/social` google | `200 {url, redirect:true}` with `redirect_uri = <baseURL>/api/auth/callback/google` | **ADAPTED** — needs placeholder `GOOGLE_CLIENT_ID`/`SECRET` on `process.env` **before** `createAuth`, else `500 CLIENT_ID_AND_SECRET_REQUIRED` | plan's test would have failed |
| 15 | Unknown auth sub-path | `404`, **no headers at all, empty body** | **NEW** | the catch-all must survive a header-less `Response` |
| 16 | Wrong OTP: account exists vs never existed | byte-identical `400 {"message":"Invalid OTP","code":"INVALID_OTP"}` | **CONFIRMED** — no user-existence oracle | pinned by test |
| 17 | Magic link: known vs unknown address | byte-identical `200 {"status":true}` | **CONFIRMED** | pinned by test |
| 18 | Wrong OTP vs no pending OTP | **differs**: `INVALID_OTP` vs `OTP_NOT_FOUND`, both 400 | **NEW, left as-is** | see §4 |
| 19 | CSRF: cookie POST, no `Origin` | `403 {"message":"Missing or null Origin","code":"MISSING_OR_NULL_ORIGIN"}` | **NEW** | pinned by test |
| 20 | CSRF: cookie POST, untrusted `Origin` | `403 {"message":"Invalid origin","code":"INVALID_ORIGIN"}` | **NEW** | pinned by test |
| 21 | CSRF: cookie POST, `Origin` = baseURL | `200 {"success":true}` | **NEW** | pinned by test |
| 22 | CSRF: bearer-only POST, no `Origin` | `200` — exempt (gate is `headers.has("cookie")`) | **NEW** | pinned by test; this is why the helper returns a bearer |
| 23 | better-auth's CSRF default | OFF under `NODE_ENV=test` (`isTest()`), ON in production | **NEW, and the most dangerous finding** | see §4 |
| 24 | Other cookies the vendor sets | `better-auth.session_data`, `better-auth.dont_remember`, `better-auth.state` (`Max-Age=300`), `better-auth.better-auth-passkey` (`Max-Age=300`) | observed, not pinned | probe |
| 25 | `createAuth` connects at construction? | **No** — returns in ~2ms over a pool whose port nothing listens on | **NEW** | this is what keeps `app.test.ts` database-free |
| 26 | `auth.options.baseURL` readable at runtime | yes, exactly the string passed in | **CONFIRMED** | used by the mount |
| 27 | Forged `Host` header changes anything? | **No** — magic link and `redirect_uri` identical either way | **NEW, negative result** | see §6 |
| 28 | better-auth's own secret floor | warns below **32** characters and starts anyway | **CONFIRMED** | `context/create-context.mjs`; drove `.min(32)` |

---

## 3. Fastify-layer facts (measured, because the design forked on them)

| Question | Answer |
|---|---|
| Are content-type parsers encapsulated in a `register` scope? | **Yes.** With the raw parser inside the scope, `POST /v1/events` still arrives parsed and still answers `400 FST_ERR_VALIDATION` for an unknown key. |
| POST with no content-type and no body | reaches the handler, `request.body === undefined` — **with or without** the raw parser |
| POST `content-type: application/json`, empty body | **with** raw parser: `200` from better-auth. **without**: `400 FST_ERR_CTP_EMPTY_JSON_BODY` from Fastify |
| POST `application/x-www-form-urlencoded` | `415` either way, but **with** the parser it is better-auth's `UNSUPPORTED_MEDIA_TYPE` naming its allowed types; **without**, Fastify's opaque `FST_ERR_CTP_INVALID_MEDIA_TYPE` |
| Array `Set-Cookie` via `reply.header('set-cookie', string[])` | works; emitted as repeated headers |
| `app.inject` `Host` | `localhost:80` (irrelevant — see §6) |

---

## 4. Departures from the brief, and why

**D1 — Raw buffer parser instead of `JSON.stringify(request.body)`.** The brief's Step 3 re-serialises
Fastify's parsed body. Measured: with Fastify's own JSON parser in place, `request.body` is an object,
`Buffer.isBuffer` is false, every POST reaches better-auth with no body, and **every check in
`sign-in-flows.test.ts` that puts a JSON body through the mount** fails. (This read "12 of the 17
checks" when written — true then, false after fix round 1 added three tests. Re-measured at 13 of 20;
the sentence now names the set instead. See fix round 2.) The raw parser also decides *who answers* a body Fastify has opinions
about (§3). The brief's own note licenses fixing the mechanics: "the flows themselves … are the contract".

**D2 — The parser is registered in an encapsulated `app.register` scope.** Not in the brief at all.
Necessary: hoisted to the root instance, `/v1/events` stops enforcing `additionalProperties: false`,
which is Plan 1 consequences §7's promise. Proven by mutation both ways.

**D3 — `createAuth` gains `advanced.disableOriginCheck: false`.** A change to Task 1's file, made because
the behaviour is only observable once the routes exist. better-auth computes
`skipOriginCheck = options.advanced?.disableOriginCheck !== undefined ? … : isTest() ? true : false`
(`context/create-context.mjs`), and `isTest()` is `NODE_ENV === 'test'`, which vitest sets. Left unset,
the CSRF origin check is ON in production and OFF in every test — and while `disableCSRFCheck` is unset,
`shouldSkipCSRFForBackwardCompat` takes the whole CSRF middleware down with it
(`api/middlewares/origin-check.mjs`). That is a security control whose presence depends on `NODE_ENV`,
producing the worst available failure: a green suite in which every cookie POST passes against a
production that 403s them. This was discovered by three tests failing, not by reading.

**D4 — `BETTER_AUTH_URL` / `BETTER_AUTH_SECRET` are required config, not `process.env` with fallbacks.**
The brief's Step 9 writes `process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-change-me'` in the
**production** entrypoint. That lets a deploy boot signing every session with a key printed in this
repository, and anyone reading the repo could then mint a session for any user. `loadConfig` is the
repo's process-environment door and already names missing variables, so both moved there with no
defaults. `.min(32)` is better-auth's own threshold, not an invented one.

**D5 — `AppDeps.auth` is required, and `pool`/`otpSender` were not added.** Adaptation map §12 sketches
`{db, ingest, pool, auth, otpSender, …}`. `buildApp` needs none of `pool`/`otpSender` — `createAuth`
happens in the caller, which is what keeps `buildApp` synchronous (§12's own recommendation) — so only
`auth` was added. Required rather than optional: an app with no identity surface should take a different
builder to produce. The usual objection (a unit test now needs a database) does not apply: `createAuth`
opens no connection (row 25), so `app.test.ts` is still database-free.

**D6 — `signInWithPhone` returns `{token, userId}`, not a bare token.** Per ruling 5. `userId` is read
off the verify response body, so no consumer needs a database round-trip to attribute an event.

**D7 — Test DB helpers.** The brief imports `migrateTestDb`, `testPool`, `truncateAll`; none exist.
Used `createTestDatabase()` / `db.drop()` (adaptation map §9), and no truncation at all — each test uses
a distinct phone number, since a phone number *is* a user's identity here.

**D8 — The Google test sets placeholder credentials.** Without them `/sign-in/social` answers
`500 CLIENT_ID_AND_SECRET_REQUIRED` and the brief's assertion cannot pass. Placeholders, not
credentials; no external call is made. An earlier draft justified the `process.env` write with
"vitest isolates test files in separate workers" — a mechanism claim read rather than run, and dropped
for that reason: the justification that does hold is that a placeholder pair leaves the provider
configured-but-unusable, exactly as an absent pair does, so how far the write reaches cannot matter.

**D9 — The enumeration split that was found and deliberately not fixed.** better-auth distinguishes
`INVALID_OTP` from `OTP_NOT_FOUND` at the same 400. It is **not** the constraint's oracle: `sendOTP`
creates a verification row for any number, so the answer is identical for an account that exists and one
that does not — proven, and pinned by test. What it leaks is whether a code was recently *requested*,
which the attacker requested themselves. Normalising vendor error bodies at the mount would break
better-auth's own client, which Plan 6 uses. Recorded rather than papered over.

**D10 — Test counts.** The brief says 5 + 3 = 8. Shipped: 17 + 6, plus 3 new cases in `config.test.ts`.
Literal `it`-block counts per file: `sign-in-flows.test.ts` 17, `require-session.test.ts` 6,
`config.test.ts` 9 (was 6), `app.test.ts` 2, `events-route.test.ts` 12. Nothing was deleted to match a
stated total.

---

## 5. One existing test tightened

`config.test.ts`'s missing-`DATABASE_URL` case called `loadConfig({})`. With three required keys that
message now names all three, and `toThrowError(string)` matches on **substring** — so the assertion
would have kept passing while proving less than its name claims. It now removes only `DATABASE_URL`
from a valid environment, so the message names exactly one variable again.

---

## 6. Code shipped with NO covering check, stated rather than hidden

`routes.ts` builds the request URL's origin from `auth.options.baseURL` rather than the `Host` header.
**Measured both ways with a forged `Host: evil.example`: the magic link and the OAuth `redirect_uri`
come back identical.** better-auth resolves every absolute URL of its own from `options.baseURL` and
never from the request, so nothing observable depends on this line and no test can cover it. It is kept
as defence for an endpoint that one day *does* read the request URL, and the comment at the site says
exactly this — the first draft of that comment claimed it stopped a forged Host from redirecting a magic
link, which the measurement showed to be false.

Two claims in an earlier draft were likewise wrong and were corrected after running them: that the raw
parser is what lets a **bodyless** POST through (it is not — that works either way), and that
form-encoding is a shape "the vendor surface legitimately uses" (better-auth refuses it with
`UNSUPPORTED_MEDIA_TYPE`). The test that pointed at the bodyless case was rewritten to point at the
empty-JSON-body case, which is the one that actually bites.

---

## 7. Falsifiability evidence

Method: apply one mutation, run the target test, record the failing line, restore the file byte-for-byte
and assert equality with the original in the same script. Tree restoration verified afterwards with
`git status --short` and by grepping every mutated anchor — never a shell `diff`.

### Own-code mutations

| # | Mutation | Result | Failed at |
|---|---|---|---|
| M1 | `routes.ts`: stop forwarding `Set-Cookie` | 1 failed | `expect(cookies).toHaveLength(1)` — `expected [] to have a length of 1` |
| M2 | `routes.ts`: drop the raw `'*'` parser | **12 of 17 failed** at the time of this run; **re-measured 13 of 20** after fix round 1 added three tests. Filtered run failed at `expect(emptyJson.statusCode).toBe(200)` — `expected 400 to be 200` |
| M3 | `routes.ts`: hoist the parser to the **root** instance | 1 failed | `expect(res.json()).toEqual({…FST_ERR_VALIDATION…})` in "leaves the product door parsing JSON and refusing unknown keys" |
| M4 | `routes.ts`: use `Host` instead of `auth.options.baseURL` | **0 failed — reported in §6, not shipped as evidence** |
| M5 | `require-session.ts`: change the 401 body to `unauthorized` | 4 failed | `expect(res.body).toBe(UNAUTHENTICATED)` — `expected '{"error":"unauthorized"}' to be '{"error":"unauthenticated"}'` |
| M6 | `require-session.ts`: `if (!session)` → `if (false as boolean)` | 4 failed | `expect(res.statusCode).toBe(401)` — `expected 500 to be 401` |
| M7 | `app.ts`: drop `registerAuthRoutes(app, deps.auth)` | 1 failed (filtered) | `expect(send.statusCode).toBe(200)` — `expected 404 to be 200` |
| M8 | `auth.ts`: remove `disableOriginCheck: false` | 2 failed | `expect(res.statusCode).toBe(403)` — `expected 200 to be 403` |
| M9 | `config.ts`: give `BETTER_AUTH_SECRET` a default | 1 failed | `expect(() => loadConfig(withoutSecret)).toThrowError(ConfigError)` — `expected function to throw an error, but it didn't` |
| M10 | `config.ts`: relax `.min(32)` to `.min(1)` | 1 failed | same assertion in the under-32 case |
| M11 | `require-session.ts`: assign `session.session.id` instead of `session.user.id` | 2 failed | `expect(res.json()).toEqual({ userId })` in both positive-resolution cases — the session ULID is not the user ULID |

### Vendor-pin checks

The vendor cannot be mutated, so each expectation was flipped once and the check watched to bite.

| # | Flip | Failed at |
|---|---|---|
| V1 | http cookie name → `betterauth.session` | `expected 'better-auth.session_token' to be 'betterauth.session'` |
| V2 | https cookie name → `__Host-…` | `expected '__Secure-better-auth.session_token' to be '__Host-better-auth.session_token'` |
| V3 | bearer header → `x-auth-token` | `expect(typeof token).toBe('string')` — `expected 'undefined' to be 'string'` |
| V4 | identical-answer body → `{"message":"User not found"}` | `expected '{"message":"Invalid OTP",…}' to be '{"message":"User not found"}'` |
| V5 | session key list → `['session','token','user']` | `expected [ 'session', 'user' ] to deeply equal [ 'session', 'token', 'user' ]` |

All 15 bit **at their own assertion**, not in setup. Every mutation was restored and the restoration
verified in-script by string equality against the original text.

---

## 8. Verification command and output

```
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd /Users/kiro/my_projects/gisik-nokma-lanes/lane2-plan4
pnpm turbo run build test typecheck
```

```
@gisik-nokma/rule-engine:test:  Test Files  4 passed (4)
@gisik-nokma/rule-engine:test:       Tests  115 passed (115)
@gisik-nokma/domain:test:  Test Files  14 passed (14)
@gisik-nokma/domain:test:       Tests  205 passed (205)
@gisik-nokma/app-core:test:  Test Files  1 passed (1)
@gisik-nokma/app-core:test:       Tests  5 passed (5)
@gisik-nokma/ui:test:  Test Files  3 passed (3)
@gisik-nokma/ui:test:       Tests  31 passed (31)
@gisik-nokma/server:test:  Test Files  19 passed (19)
@gisik-nokma/server:test:       Tests  128 passed (128)
 Tasks:    15 successful, 15 total
  Time:    7.711s
```

`@gisik-nokma/server` was 102 tests before this task; 128 after (+17 sign-in flows, +6 require-session,
+3 config). Assertion-level detail for the server package came from
`node ./node_modules/vitest/vitest.mjs run <file>` inside `apps/server`, since the rtk proxy collapses
`pnpm test` output.

---

## 9. What later tasks inherit

- `makeRequireSession(auth)` → preHandler; `request.currentUserId` is the signed-in ULID.
  **A route that reads it registers the preHandler** — the type says `string` unconditionally.
- `signInWithPhone(app, sender, phone)` → `{token, userId}`. Authenticate with
  `Authorization: Bearer ${token}`; that path is exempt from the CSRF origin check.
- `buildApp({db, ingest, auth})` — `auth` now required.
- `/v1/events` still has **no** `preHandler`; adaptation map §17 assigns that to Task 5 or 12, along with
  updating `events-route.test.ts`'s 12 unauthenticated cases.
- `trustedOrigins` is still better-auth's default. **T14's `WEB_ORIGIN` must be added to it** or the
  browser's own cookie POSTs will 403.
- `config.ts` is now shared between this task and T14 (`webOrigin`).
- Production still uses `LogOtpSender`, which writes every one-time code to the process log. Real
  delivery is the deployment errand the plan names and does not do; the comment in `index.ts` says so at
  the site.

---

# Fix round 1 — six Importants and one promoted Minor

All seven addressed. Every reviewer claim was **reproduced here before being fixed**; none was taken on
report. Gate re-run green: 15/15 tasks, server **132** tests (was 128), `pnpm check:env` clean.

## Reproductions (mine, not the reviewer's)

| Claim | Measured here |
|---|---|
| sign-out emits 3 `Set-Cookie` | `better-auth.session_token=`, `better-auth.session_data=`, `better-auth.dont_remember=`, each `Max-Age=0` |
| `formCsrfMiddleware` gates cookieless requests | `POST /sign-in/magic-link`, no cookie, `origin: https://evil.example` → **403 INVALID_ORIGIN**; `sec-fetch-site: cross-site` + `mode: navigate` → **403 CROSS_SITE_NAVIGATION_LOGIN_BLOCKED**; trusted origin → 200; `send-otp` and `sign-out` with the same forged Origin → **200** |
| its mount sites | `api/routes/sign-in.mjs:245` (`/sign-in/email`), `sign-up.mjs:26` (`/sign-up/email`), `plugins/magic-link/index.mjs:60` (`/sign-in/magic-link`), `plugins/email-otp/routes.mjs:77`. Enumerating `auth.api`: the first three are registered here; the email-otp plugin is not enabled |
| `OPTIONS`/`HEAD` unmounted | `OPTIONS /api/auth/get-session` with preflight headers → **404** `{"message":"Route OPTIONS:/api/auth/get-session not found",…}`; `HEAD` → 404 |
| product routes outside CSRF | `POST /v1/events` with a session cookie and no `Origin` → 200 (valid body) / 400 validation (invalid). Never 403 |
| `.env.example:35` | `BETTER_AUTH_SECRET=change-me`, 9 characters against `min(32)`; `pnpm check:env` passed on it |
| endpoint count | `auth.api` has **46 entries, 44 with an HTTP `path`** (`setPassword`, `consumePhoneNumberOTP` are helpers); distinct methods across the 44 are exactly `GET`, `POST`. My earlier "all 46 endpoints" is tightened to this everywhere |

## Fixes

**1 — multi-valued `Set-Cookie` now has a check that can fail.** Extended the existing
`accepts a cookie-carrying POST from the configured origin` case: `toHaveLength(3)`, the three cookie
names in order, and `Max-Age=0` on each. This is the only request in the suite where n > 1, which is
exactly why the mutant survived before.

**2 — coordination §7's CSRF mechanism corrected.** The entry now records both halves: the cookie gate
in `originCheckMiddleware`, and `formCsrfMiddleware`'s per-endpoint `forceValidate` on cookieless
requests carrying `Origin`/`Referer`/`Sec-Fetch-*`, with the four mount sites and which three are live
here. It states explicitly that "bearer-only is exempt" is true of half one and **false as a general
statement**. New test: `origin-checks a cookieless magic-link request, and does not for send-otp`.

**3 — the `OPTIONS` gap is recorded and pinned.** §7 now says extending `trustedOrigins` will not be
sufficient. New test `known gap: OPTIONS and HEAD are not mounted…` pins the 404 and its exact body, and
is written to go **red** when CORS is mounted, so the remedy and the pin land in one commit.

**4 — `.env.example` fixed, and the class closed.** `BETTER_AUTH_SECRET` is now a 38-character
placeholder naming `openssl rand -base64 32`; the header no longer claims only Plan 1's four are live
and instead lists the live set (the six in `config.ts`, plus `GOOGLE_CLIENT_*` read directly by
`createAuth`, plus `TEST_DATABASE_ADMIN_URL`). More importantly the gap that let it happen is closed:
`config.test.ts` now **parses `.env.example` and feeds its documented values to `loadConfig`**, with a
guard asserting the parser still finds the six live keys so the check cannot go quiet. `check:env` proves
presence; this proves validity.

**5 — product-route CSRF posture recorded.** §7 now states that the origin rule binds `/api/auth/*` only,
that once `requireSession` reaches `/v1/events` a cookie-authenticated cross-site POST is defended by
`SameSite=Lax` alone, what that does and does not cover (nothing for a non-browser replaying a stolen
cookie), and that the current answer is "no extra check" **by omission rather than by decision** — left
for whoever adds the guard.

**6 — `LogOtpSender` marked for both faults.** `otp-sender.ts`'s claim that *"there is no production
implementation that keeps a transcript of every OTP the system has ever sent"* was made false by my
`index.ts`; corrected in place, naming the unbounded `sent` array as a second production fault beside the
log write. `index.ts`'s wiring comment says both. §7 records both.

**7 (promoted) — the `baseURL` fallback is gone.** `auth.options.baseURL ?? \`http://${host}\`` reintroduced
the attacker-controlled Host in exactly the future the comment defended against. `registerAuthRoutes` now
reads `baseURL` once **at assembly** and throws if it is unset or empty — a misconfigured deployment
loses its boot, not its integrity, and one startup error beats a 500 per sign-in. The handler uses the
checked constant unconditionally. New test:
`refuses at assembly to mount an auth instance with no baseURL`, pinning the message.

## New falsifiability evidence

| # | Mutation / flip | Result | Failed at |
|---|---|---|---|
| M12 | `routes.ts`: `getSetCookie()` → `headers.get('set-cookie')` | 1 failed | `expect(cleared).toHaveLength(3)` — `expected [ Array(1) ] to have a length of 3 but got 1`. This is the reviewer's surviving mutant, now killed |
| M13 | `routes.ts`: delete the guard, restore a Host fallback | 1 failed | `expect(() => registerAuthRoutes(…)).toThrowError(…)` — `expected [Function] to throw an error` |
| M14 | `.env.example`: restore `BETTER_AUTH_SECRET=change-me` | 1 failed | `expect(() => loadConfig(documented)).not.toThrow()` — `ConfigError` thrown |
| V6 | drop `dont_remember` from the expected cleared list | 1 failed | `toEqual` on the cookie-name array |
| V7 | expect the cookieless forged-Origin magic link to pass | 1 failed | `expect(evil.statusCode).toBe(200)` — `expected 403 to be 200` |
| V8 | expect the preflight to be 204 | 1 failed | `expect(preflight.statusCode).toBe(204)` — `expected 404 to be 204` |

All six bit at their own assertion. Every mutation restored in-script with a byte-equality assertion
against the original; tree confirmed by `git status --short`, never a shell `diff`.

## Counts after this round

`sign-in-flows.test.ts` **20** `it` blocks (was 17), `require-session.test.ts` 6, `config.test.ts` **10**
(was 9), `app.test.ts` 2, `events-route.test.ts` 12. Server package **132** tests, 19 files.

## Verification

```
pnpm turbo run build test typecheck   →  Tasks: 15 successful, 15 total
  rule-engine 115 | domain 205 | app-core 5 | ui 31 | server 132
pnpm check:env                        →  env contract clean: 33 documented, 8 referenced in code
```

## Deferred items, acknowledged and untouched this round

Per the coordinator: the D9 oracle wording (it leaks short-lived activity-recency for a number, not user
existence — the decision to leave the vendor bodies alone stands, but the record should say what it
actually leaks); `auth-dev.ts:33`'s surviving dev-secret literal; `currentUserId`'s knowing type lie; and
`BETTER_AUTH_TRUSTED_ORIGINS` as an undocumented second path into `trustedOrigins`.

---

# Fix round 2 — a measured count that my own round-1 commit falsified

One finding, two lines, both fixed. Gate re-run green: 15/15, server 132, `check:env` clean.

## The re-measurement, run here rather than relayed

The claim was *"12 of the 17 checks in `sign-in-flows.test.ts` fail"* when the raw `'*'` body parser is
removed. Round 1 added three tests to that file, so both numbers were stale. I re-applied the mutation
rather than taking the corrected figure on report:

```
❯ test/auth/sign-in-flows.test.ts (20 tests | 13 failed)
  Tests  13 failed | 7 passed (20)
```

**13 of 20 — my run agrees with the re-reviewer's.** The 13, in file order:

| | failing check |
|---|---|
| 1 | phone OTP sign-in > delivers a code through OtpSender and verifying it opens a session |
| 2 | phone OTP sign-in > the session cookie is better-auth.session_token, HttpOnly, SameSite=Lax, and not Secure over http |
| 3 | phone OTP sign-in > over https the cookie becomes __Secure-better-auth.session_token and gains Secure |
| 4 | bearer sessions for the apps > returns a token in set-auth-token that authenticates via the Authorization header |
| 5 | bearer sessions for the apps > the session object is {session, user} with the ULID at user.id |
| 6 | email magic link sign-in > delivers a link through MagicLinkSender and following it opens a session |
| 7 | google oauth wiring > builds a Google authorization redirect from the configured baseURL |
| 8 | passkey endpoints > offers registration options to a signed-in user |
| 9 | no-oracle > a wrong code answers identically for a number with an account and one without |
| 10 | no-oracle > a magic link request answers identically for a known and an unknown address |
| 11 | cross-site > origin-checks a cookieless magic-link request, and does not for send-otp |
| 12 | cross-site > a bearer-only POST needs no Origin at all |
| 13 | the catch-all mount > lets better-auth judge the body, whatever shape it arrives in |

The seven survivors are the ones that never put a JSON body through the auth mount: the vendor 404 (GET),
the `OPTIONS`/`HEAD` gap (no body), the assembly-time guard (no request at all), the `/v1/events`
encapsulation check (posts to the product door, not this one), and the three cookie-origin cases whose
outcome does not depend on a body arriving.

## The fix, and why it is not a corrected number

Both sites — `apps/server/src/auth/routes.ts` and coordination §7 — now name **what** fails instead of
how many: *"every check in `sign-in-flows.test.ts` that puts a JSON body through this mount fails — every
sign-in route the product offers, plus the bearer token, the passkey options and the Google authorization
URL."* That set is what the mutation actually demonstrates, and unlike a count it does not rot when the
next test lands. Both sites keep one sentence of history saying the old count stood there and how it went
stale, because the failure mode is the interesting part.

The two round-1 report entries carrying the old figure (D1 and the M2 row) are annotated in place with
the re-measurement rather than silently rewritten — they are a record of what was true when run.

**What made this worth a round, in my own words:** the stale sentence ended *"Run, not reasoned"*. It was
a measured claim, inside a comment asserting it had been measured, falsified by the same commit that
corrected its neighbour four lines above. A number in prose is a claim with an expiry date, and nothing
in the gate can see it expire.

## Tooling note for whoever reviews next

`rtk` reformats `git diff`, indenting the `+`/`-` markers, which **silently defeats `grep "^[+-]"`** — the
filter returns empty and reads as "no changes" rather than as a broken filter. Parse the `.diff` file the
review-package script writes, never `git diff` piped through a line-anchored filter. (Same family as the
already-recorded trap that `rg` is proxied to `grep`, where a directory search returns nothing instead of
erroring.)

## Verification

```
pnpm turbo run build test typecheck   →  Tasks: 15 successful, 15 total
  rule-engine 115 | domain 205 | app-core 5 | ui 31 | server 132
pnpm check:env                        →  env contract clean: 33 documented, 8 referenced in code
```
