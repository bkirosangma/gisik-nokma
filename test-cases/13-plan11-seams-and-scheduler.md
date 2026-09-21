# 13. Plan 11 seams and the scheduler generalisation — test cases

Part of bucket 13 (`Features.md` §13) — one part-file of the catalogue split performed 2026-09-19.
Index and id-block allocation: [`13-deployment-dogfooding.md`](./13-deployment-dogfooding.md).
Case ids are unchanged and are never renumbered by the split.

## Plan 11 Tasks 1–6 — cases written retroactively at the seam-1 PR

**These cases were NOT written in each task's own change set.** Tasks 1–6 shipped across separate
commits on this branch (`012c8cc`, `d691461`, `c31988a`, `b189bf7`, `e42e10a`+`4d16c2f`, `6251aac`)
without a `Features.md`/`test-cases` entry apiece; this section catalogues all six in one pass, at the
seam-1 PR, from two inventory reports that opened each commit's diff and every test file's assertions
directly. That counts as "the same change set" only because seam 1 ships as a single PR — this is a
disclosed deviation from the usual same-change-set rule, not a hidden one. IDs minted from Lane E's
block (`13.101–13.200`), continuing after the graceful-shutdown section's `13.104`; the block's next
free id after this section is `13.169`.

**Note for Task 9 (`13.90`):** that case is `❌ pending the dev compose stack`, owned by Lane D. Task 6
below lands `docker-compose.dev.yml`, so `13.90`'s precondition is now satisfied — **it is not flipped
here**, since satisfying the precondition is not the same as a real test run against the stack, and the
case belongs to Lane D's block. Lane D should re-run `seed:cc` against the now-real dev stack and flip
`13.90` itself.

### Config surface, CA-aware pool, `/healthz` (Task 1)

- 13.105 ✅ nine deployment env vars, plus `DEPLOY_SHA`, each parsed and each refused by name when
  malformed — `config.test.ts`
- 13.106 ✅ an empty string reads as UNSET and falls back to the documented default — for the eight
  OPTIONAL knobs plus `DEPLOY_SHA`, which is a different nine from 13.105's. **`WEB_ORIGIN` is
  explicitly NOT among them and behaves the opposite way**: `WEB_ORIGIN: ''` THROWS
  `invalid server configuration — check: WEB_ORIGIN` (`config.test.ts:191`). That is the deviation
  Task 1's bullet defends — it is required with no default precisely so an empty value cannot mint an
  unfollowable invitation link — so an "inconsistency fix" giving it a default would reintroduce the
  defect. An earlier wording of this case said "any of the nine", which named `WEB_ORIGIN` among them
  and was false — `config.test.ts`
- 13.107 ✅ planted defect: `TRUST_PROXY` accepts only the literal `'true'`/`'false'`; `'yes'` and `'1'`
  are refused by name rather than coerced by truthiness — `config.test.ts`
- 13.108 ✅ planted defect: a rate-limit var that is non-integer, zero, negative, or fractional is
  refused by its own name — `config.test.ts`
- 13.109 ✅ `ALERT_WEBHOOK_URL` and `SMTP_URL` are scheme-discriminated against each other (an http URL
  rejected as SMTP and vice versa), not just "any string fails" — `config.test.ts`
- 13.110 ✅ the regression pin: a CA cert reaches the real driver through a `?sslmode=require`
  managed-Postgres-shaped URL — this fails on the code that shipped before the fix — `config.test.ts`
- 13.111 ✅ rewriting the connection string for TLS preserves user/password/host/port/database
  byte-for-byte, including a literal `+` in a password surviving `%2B` round-trip — `config.test.ts`
- 13.112 🟡 known-and-accepted, asserted rather than hidden: an `options=` query parameter still
  clobbers the pool's timezone startup parameter through the same `Object.assign` that motivated the CA
  fix — not fixed, the test pins the current (wrong) behaviour so a silent change is visible —
  `config.test.ts`
- 13.113 ✅ an unparseable connection string that also carries an ssl parameter is refused by name,
  rather than silently discarding the CA — `config.test.ts`
- 13.114 ✅ `/healthz` answers the exact shape `{ status, sha }` — not `{ ..., version }` — on both the
  200 and 503 branches, `toEqual` not partial matching, `sha` sourced from a handed `DEPLOY_SHA` —
  `app.test.ts`
- 13.115 ❌ `sslcert`/`sslkey`/`sslrootcert` causing `pg` to `readFileSync` at client construction (a
  missing file becomes an `ENOENT` at pool creation, not a clean config refusal) — no test exercises
  this; recorded only in the commit message and the `db.ts` docblock

### CORS, rate limiting, HTTP-Origin (CSRF) check (Task 2)

- 13.116 ✅ set-equality drift guard: every protected route has a row in the suite and every row in the
  suite is a protected route in production — a genuine set comparison, not a subset check —
  `security-middleware.test.ts`
- 13.117 ✅ each of the 7 protected routes: a forged `Origin` on a cookie-carrying `POST` is refused
  `403 { error: 'forbidden_origin' }` AND the route handler never ran — `security-middleware.test.ts`
- 13.118 ✅ each of the 7 protected routes: a cookie-carrying mutation with NO `Origin` header at all is
  also refused (require, not merely validate) — `security-middleware.test.ts`
- 13.119 ✅ each of the 7 protected routes: the correctly-configured `WEB_ORIGIN` is let through —
  `security-middleware.test.ts`
- 13.120 ✅ a query string does not buy a CSRF bypass — `/v1/events?x=1` is refused identically to
  `/v1/events`, pinning the `routeOptions.url`-vs-`raw.url` fix — `security-middleware.test.ts`
- 13.121 ✅ the regression pin: a caller-prepended `X-Forwarded-For` entry does NOT buy a fresh
  rate-limit bucket — a chain with varying left / constant right entries is refused on requests 2–4,
  which reddens under leftmost-keying and passes only under rightmost-keying —
  `security-middleware.test.ts`
- 13.122 ✅ two genuinely different clients behind the same proxy still get their own buckets — the
  inverse of 13.121, so keying can't be satisfied by treating everyone as one client —
  `security-middleware.test.ts`
- 13.123 ✅ `POST /v1/attachments` is charged to the shared `events` bucket, not left unlimited —
  spending the attachments budget also refuses a subsequent `/v1/events` call —
  `security-middleware.test.ts`
- 13.124 ✅ CORS answers preflight for the configured origin with both the allow-origin and
  allow-credentials headers; a foreign origin gets no allow header at all; and CORS is not the CSRF
  control — a foreign-origin `POST` is still refused `403` even though CORS is on —
  `security-middleware.test.ts`
- 13.125 ✅ `makeFixedWindowLimiter` unit coverage: max-then-refuse with bounded retry hints, key
  independence, window reset proven by a clock argument (not `sleep`), a retry-after floor of 1ms even
  in the last millisecond of a window, and refusal repeating rather than resetting on the next call —
  `rate-limit.test.ts`
- 13.126 ❌ `rateLimitKeyFor` (the rightmost-XFF-entry keying itself — comma-splitting, array-vs-string
  header handling) has no standalone unit test; it is only exercised indirectly through the HTTP
  integration cases above, so a change hitting a header shape those cases don't cover (a trailing comma,
  an all-whitespace entry) would not be caught by a fast unit-level run
- 13.127 ❌ whether `apps/web`'s proxy actually forwards the `Origin` header on same-origin requests —
  stated in the module docblock as not measured in this repository; named as "the first thing to check"
  if the web client starts answering `403 forbidden_origin`

*(Not a numbered case, named for completeness: `POST /v1/invites/:token/accept` and
`PUT /v1/me/preferences` are cookie-authenticatable mutations deliberately excluded from the protected
set, owners named as future plans in the docblock. No case asserts they are unprotected — the 13.116
drift guard fires only on a mismatch with the production route list, so it would not catch someone
silently adding CSRF protection to either route any more than it would catch its removal.)*

### Error alerting hook on 5xx (Task 3)

- 13.128 🟡 `WebhookErrorAlerter` POSTs `{ text }` with the right headers, and an `AbortSignal` is
  wired into the request. **The 5-second VALUE is not asserted and this case must not claim it was:**
  the test checks `signal instanceof AbortSignal` only. Measured, not inferred — raising
  `WEBHOOK_TIMEOUT_MS` from `5_000` to `500_000` leaves the suite 16/16 green. Downgraded from `✅` to
  `🟡` by the verification pass that ran that mutation; the first wording said "an `AbortSignal`-based
  5s timeout wired through", which reads as coverage of the deadline itself. Open: a dead webhook could
  be widened to hold a socket for minutes with nothing reddening — `error-alerter.test.ts`
- 13.129 ✅ `alertWithoutWaiting` contains a SYNCHRONOUS throw from `notify` — it does not propagate out
  of `alertWithoutWaiting` itself — `error-alerter.test.ts`
- 13.130 ✅ `alertWithoutWaiting` contains a REJECTING `notify` — a real `process.on('unhandledRejection',
  …)` collector asserts nothing escapes the process, a genuine behavioural check rather than an inference
  from the absence of a thrown error — `error-alerter.test.ts`
- 13.131 ✅ `alertWithoutWaiting` does not wait for the alerter — a releasable gate (not an unresolvable
  promise, which would make "not settled yet" trivially true) proves the response returns before the
  alert settles, and releasing the gate is the positive control proving `notify` really was invoked —
  `error-alerter.test.ts`
- 13.132 ✅ the 5xx handler answers the exact `INTERNAL_ERROR_BODY` shape (`toEqual`) and the response
  body does not contain the thrown error's message or a real path — a leak check, not a status-code-only
  check — `error-alerter.test.ts`
- 13.133 ✅ the alert context carries the REDACTED url — asserted to literally equal
  `'GET /v1/invites/[redacted]/explode'`, confirming the redaction exactly rather than merely "doesn't
  contain the token" — `error-alerter.test.ts`
- 13.134 ✅ planted defect: a 400 from a schema refusal is the door working — zero alert contexts are
  recorded, confirming sub-500s never page — `error-alerter.test.ts`
- 13.135 ✅ planted defect: an alerter that THROWS or REJECTS still leaves the response exactly `500` +
  `INTERNAL_ERROR_BODY`, and (for the reject case) the escaped-unhandled-rejections collector is still
  empty — `error-alerter.test.ts`
- 13.136 ✅ planted defect: an alerter that HANGS does not hold the response — the 500 is already
  answered while the alert's `settled` flag is still `false`, and only flips after `release()`, a genuine
  ordering assertion (response-before-alert-settles) — `error-alerter.test.ts`
- 13.137 ✅ with NO alerter configured, nothing reaches the network — `globalThis.fetch` is replaced
  BEFORE `buildTestApp()` is called, closing the install-then-build ordering bug (`WebhookErrorAlerter`
  captures `fetch` as a default parameter at construction) a reviewer caught in an earlier, guard-that-
  cannot-fail version of this exact test — `error-alerter.test.ts`
- 13.138 ❌ the claim that `/healthz`'s 503 branch never reaches this alerter (the one 5xx an operator
  most needs paged) — stated only in prose in two files; nothing would go red if that routing were
  silently changed to alert on it
- 13.139 ❌ no coalescing or rate-limiting of the alert channel itself — a repeat-failure storm pages the
  same webhook every time, by design, and is unbuilt and untested

### SMTP magic-link sender, OTP sign-in refused (Task 4)

- 13.140 ✅ `SmtpMagicLinkSender` composes one message to the address, from the configured sender —
  envelope AND raw `From:`/`To:`/`Subject:` headers checked via full MIME composition (`streamTransport`),
  not a spy on `sendMail`'s call args — `smtp-magic-link-sender.test.ts`
- 13.141 ✅ the link survives quoted-printable transfer encoding byte-for-byte and stands alone on its
  own decoded line, using a >76-char URL specifically so the encoding is actually exercised —
  `smtp-magic-link-sender.test.ts`
- 13.142 ✅ the email is plain-text only — asserted `Content-Type: text/plain`,
  `Content-Transfer-Encoding: quoted-printable`, and the raw message explicitly does NOT contain
  `multipart/` or `text/html` — `smtp-magic-link-sender.test.ts`
- 13.143 ✅ negative control: constructing the sender alone sends nothing —
  `smtp-magic-link-sender.test.ts`
- 13.144 ✅ an unreachable mail host that never speaks (a real TCP listener that accepts and never sends
  a banner) is given up on in seconds, not the nodemailer-default minutes — the **greeting** timeout
  specifically, `ETIMEDOUT`, elapsed time asserted bounded both above and below so an instant/no-op
  rejection cannot pass — `smtp-magic-link-sender.test.ts`
- 13.145 ✅ `selectMagicLinkSender` picks the SMTP sender when `SMTP_URL` is configured and the log
  sender otherwise, both directions — `select-senders.test.ts`
- 13.146 ✅ `selectOtpSender()` NEVER returns `LogOtpSender` on the production path — asserted
  `toBeInstanceOf(NullOtpSender)` and explicitly `not.toBeInstanceOf(LogOtpSender)` —
  `select-senders.test.ts`
- 13.147 ✅ `NullOtpSender` holds no transcript of issued codes — structural check (`'sent' in sender ===
  false`, empty own-keys), not a behavioural count after a send — `select-senders.test.ts`
- 13.148 ✅ over the real mounted route (`app.inject` against `/api/auth/phone-number/send-otp`), the
  refusal is `501` with `body.code === PHONE_SIGN_IN_UNAVAILABLE`, `body.message` mentioning email, and
  `Object.keys(body).sort()` equal to exactly `['code','message']` — guards against a future field
  leaking anything extra — `null-otp-sender.test.ts`
- 13.149 ✅ the refusal never answers with the string `'code sent'` — `null-otp-sender.test.ts`
- 13.150 ✅ positive control: the identical request against `LogOtpSender` succeeds `200` +
  `'code sent'` — the control that makes 13.148's 501 meaningful by ruling out a broken route/mount as
  the explanation — `null-otp-sender.test.ts`
- 13.151 ❌ whether `requireTLS` should be forced on the SMTP transport — deliberately left off to keep
  working against Mailpit's plaintext `smtp://`; no test asserts TLS behaviour either way
- 13.152 ❌ a refused OTP request still leaves an expiring verification row in better-auth's own storage
  — documented in the docblock as a known, accepted side effect; would require inspecting better-auth's
  internal tables and is not asserted by any test here

### Server and web Dockerfiles (Task 5)

*(🧪 here means a `docker build` run by hand and recorded in commit `e42e10a`'s message — it has not been
re-run by anything since, automated or otherwise.)*

- 13.153 🧪 the server image builds and, run with no database, prints "applying migrations…" then dies
  `ECONNREFUSED` — manually observed against a real build (exit 0, ~607 MB), recorded in the commit
  message, not automated; never run against a real Postgres
- 13.154 🧪 the web image builds standalone and the resulting artifact contains `.next/standalone`'s
  `server.js` and `.next/static` — manually observed (exit 0, ~241 MB), recorded in the commit message;
  `node apps/web/server.js` has never actually answered a request, by anyone, at any point in this
  branch's history
- 13.155 ❌ no automated test builds or runs either Dockerfile — confirmed by grep: `apps/server/test`
  and `apps/web` have no hits for `Dockerfile`/`docker` outside the dev-compose-stack tests below, which
  test the compose YAML, not an image build
- 13.156 ❌ the build-arg defect itself (before the fix): the plan's `NEXT_PUBLIC_API_URL`/
  `NEXT_PUBLIC_WS_URL` have zero readers in `apps/`/`packages/` (measured with a grep, not assumed), and
  the commit message for the fix (`4d16c2f`) documents that an unset `SERVER_ORIGIN` bakes
  `http://localhost:3000` into `routes-manifest.json` at build time. **The earlier rationale here was
  wrong about its own source** — it called this "recorded reasoning, not an inspection of a built
  manifest", while commit `4d16c2f` says the opposite in its own words ("proven from this repo's own
  build output"), and applying that invented standard would have forced 13.153/13.154 down to `❌` too,
  since those rest on the same kind of commit-recorded measurement. The marker stays `❌` for the honest
  reason instead: this catalogue entry describes the defect as it existed BEFORE the fix, and nothing
  reproduces the pre-fix state on demand. The post-fix behaviour IS measured, at 13.167. Automated regression coverage for the FIXED names living correctly in the compose file is
  Task 6's 13.162/13.163 below; no test in this repo reproduces the original defect end-to-end against a
  real image build

### Dev stack (`docker-compose.dev.yml`) checked against real config loaders (Task 6)

- 13.157 ✅ anti-vacuity guard: all 6 expected compose service names actually parse out of the YAML,
  guarding against a parser silently returning `{}` — `compose-dev-contract.test.ts`
- 13.158 ✅ project isolation: the dev stack declares a `name:`, and it is truthy and differs from the
  root compose file's (undefined) name — `compose-dev-contract.test.ts`
- 13.159 ✅ the server service's parsed env satisfies the REAL `loadConfig()` (not a mock) without
  throwing — `compose-dev-contract.test.ts`
- 13.160 ✅ the server service's parsed env satisfies the REAL `createObjectStoreFromEnv()` without
  throwing, and resolves to `S3ObjectStore` specifically, not the local-disk fallback — upgraded from a
  `toBeTruthy()` key-presence check after a review showed that passed even against a malformed
  `DATABASE_URL`, a schemeless `BETTER_AUTH_URL`, and a mismatched bucket name —
  `compose-dev-contract.test.ts`
- 13.161 ✅ object-store wiring: `OBJECT_STORE === 's3'`, `OBJECT_STORE_S3_FORCE_PATH_STYLE === 'true'`,
  the endpoint contains `'minio'`, the bucket name matches the one actually created by the `minio-init`
  entrypoint (parsed by regex out of the real entrypoint string, not hand-copied), and no bare `S3_*` keys
  survive — checked through an `envOf()` helper that normalizes both Compose environment syntaxes,
  because list-form `Object.keys()` yielding `'0','1','2'` made an earlier version of the "no bare keys"
  check pass vacuously against a file that still had three — `compose-dev-contract.test.ts`
- 13.162 ✅ web build-args: `SERVER_ORIGIN` is present as a **build arg** (not runtime env), contains
  `'server'`, and explicitly does NOT contain `'localhost'` — the direct regression test for the
  routes-manifest bug named in 13.156 — `compose-dev-contract.test.ts`
- 13.163 ✅ web build-args: `NEXT_PUBLIC_SERVER_URL` is present, and neither of the plan's dead names
  (`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL`) appear anywhere — `compose-dev-contract.test.ts`
- 13.164 ✅ Postgres port: `54329` (the live shared cross-lane test Postgres) is NOT in the published
  ports, and `54330` IS — a two-sided check, since a negative-only assertion would pass if the ports
  block were deleted entirely or moved to a third port while `.env.example` still claimed 54330 —
  `compose-dev-contract.test.ts`
- 13.165 🟡 the load-bearing bug this whole deviation chain was about: the first version of this file and
  the root `docker-compose.yml` resolved to the same directory-inferred project name and both declared a
  service literally named `postgres`, so bringing either stack up destroyed the other's containers —
  directly contradicting the landing commit's own "the two stacks are now co-runnable" claim. Fixed the
  same day by adding the explicit `name:` covered structurally by 13.158; no test actually brings both
  stacks up together and confirms neither is destroyed, so this is `🟡` on the fix's structural proxy, not
  a reproduction of the original collision
- 13.166 🧪 the MinIO healthcheck (`curl -f http://localhost:9000/minio/health/live` against the pinned
  tag) returns healthy. **Upgraded from `❌` to `🧪` by an actual run** — the catalogue pass was right to
  refuse the comment as evidence, and the run has since happened. `docker compose ps` reported
  `minio ... (healthy)` on a live stack; the chain is self-witnessing beyond that, because `minio-init`
  is gated on `condition: service_healthy` and `server` on `minio-init`'s
  `condition: service_completed_successfully`, so a healthcheck that never went healthy could not have
  produced a healthy `server`. `curl` is confirmed present in the pinned image
  (`docker run --rm --entrypoint sh minio/minio:RELEASE.2024-11-07T00-52-20Z -c 'command -v curl'` →
  `/usr/bin/curl`), so the check is not silently a no-op. Still `🧪` and not `✅`: nothing in the gate
  runs it
- 13.167 🧪 **TASK 6'S ACCEPTANCE, RUN.** A request through the WEB container's proxy is answered by the
  SERVER. `docker compose -f docker-compose.dev.yml up -d --build` reached a healthy server, then
  `GET http://localhost:3001/v1/me/work` (the web container's published port; `/v1/*` is rewritten by
  `next.config.ts` to `$SERVER_ORIGIN`) returned **HTTP 401, `content-type: application/json`, body
  `{"error":"unauthenticated"}`**. A 401 is the PASS: the question is who answered, not whether the
  caller was authorised, and only Fastify produces that body. Direct control the same run:
  `GET :3000/healthz` → `200 {"status":"ok","sha":"dev"}`.
  **The discriminator was written down BEFORE the run** so the result could not be reinterpreted
  afterwards, and the case is `🧪` rather than `✅` because nothing in the gate brings a stack up.
- 13.168 🧪 **the negative control for 13.167 — the acceptance can fail, and its real failure mode is not
  the one that was predicted.** With `SERVER_ORIGIN` reverted to the pre-fix `http://localhost:3000` and
  the web image rebuilt, the same request returned **HTTP 500 after a 30-second stall**, body
  `Internal Server Error`, while the server stayed healthy on :3000 and the web container still served
  its own pages (`GET :3001/` → 307). The web container's log names the cause:
  `Failed to proxy http://localhost:3000/v1/me/work [Error: connect EADDRNOTAVAIL 127.0.0.1:3000 -
  Local (0.0.0.0:0)]`, then `[Error: socket hang up] { code: 'ECONNRESET' }`.
  **The prediction — written into the compose file, the contract test and commit `4d16c2f` before any
  measurement — was that Next would proxy back into itself and answer its own 404. That is false.** It
  attempts the hop, cannot connect, and 500s slowly. The measured symptom is worse than the predicted
  one and much harder to spot: every healthcheck stays green, the web tier serves pages, and only the
  proxied path fails. Recorded because the first pass through this acceptance nearly skipped the control
  on the grounds that the positive run had already passed — **a matcher never watched failing is not a
  measurement**, and the branch that would have fired here (`HTML`) never did

*(`scripts/check-env-example.mjs` was reused by Task 6, not created by it — it already existed from an
earlier lane's work (`git log` shows it first at `b641a28`, unchanged in the Task 4–6 diffs inspected). No
case above credits Task 6 with authoring it; flagging this so a future edit doesn't misattribute it.)*

## The scheduler generalisation and the notification-sweep registration (Plan 11's two deferred "ops errands")

**Lane C's `13.1–13.40` block was fully exhausted (13.40 above already spends the last one on the
restore-drill guard pair) — this contradicted the brief this task was given ("13.40 is your LAST free
id"), which was already stale by the time this task started. The three cases below were written out in
full with no id first (following this file's own Task 12 precedent two sections up) and flagged as a
block-exhaustion ask in this task's own report; the controller then allocated Lane C a new block,
`13.201–13.240` (next block `13.241`, on request), and they are minted below at 13.201–13.203.** Header
paragraphs at the top of this file updated to record the new block.

- ✅ **13.201 — `startScheduler` generalises the daemon's private `loop`/`onFailure` primitive from a
fixed two-job shape to an arbitrary list of `{name, run, delayMs}` jobs, and `startBackupDaemon` becomes a
thin wrapper over it with an UNCHANGED external signature.** Every existing `startBackupDaemon` case in
`test/ops/schedule.test.ts` (the stderr shape, the `` `backup:${name}` `` alerter key, two timers armed
synchronously at construction, independent re-arm, `stop()` clearing both) passes byte-for-byte against the
new implementation with no edits to those cases — proof the wrapper is genuinely thin rather than a
same-behavior rewrite that happens to pass. Four NEW cases prove the generalisation itself, none of them
reachable through the two-job wrapper alone: N independent jobs are armed with N timers **synchronously at
construction** (not on a microtask — the existing `stop()` case's `toBe(2)` immediately after construction
already pins this for two jobs; the new case pins it for three); one job's failure and re-arm leaves a
sibling job's own call count and schedule untouched; each job re-arms strictly on its OWN `delayMs()`, so a
fast job firing three times causes zero calls to a slow job on a much longer interval; and `stop()` clears
EVERY job's timer (five, not two) with nothing firing across a fortnight of advanced time afterward.
**Review-round addition (2026-09-06): construction is all-or-nothing, not first-come-first-armed.** Every
job's initial `delayMs()` is now called BEFORE any of them is armed, so a LATER job's `delayMs()` throwing
(the shape `requirePositiveIntervalMs` and `msUntilNextUtc` both produce on a malformed schedule value)
leaves ZERO timers live, rather than orphaning the earlier jobs' timers with no `stop()` ever returned to
cancel them. Two new cases pin this: a three-job list where the third throws leaves `vi.getTimerCount() === 0`
(mutation-verified — reverting the fix to the original one-job-at-a-time loop reddens exactly this
assertion, at exactly the pre-fix value 2, with every other case in the file still green); and a two-job
list where the first throws proves the second job's `delayMs()` is never even called.
`apps/server/src/ops/schedule.ts`, `apps/server/test/ops/schedule.test.ts`

- ✅ **13.202 — `requirePositiveIntervalMs` refuses rather than clamps a millisecond interval, the same
"refuse, don't clamp" bargain `msUntilNextUtc`'s HH:MM and day-of-week checks already make for the two
existing backup jobs, applied to the notification sweep's configurable interval.** Six cases: a legitimate
positive integer (and the boundary value `1`) pass through unchanged; `0` is refused, naming `0` in the
thrown message; a negative value is refused, naming it; `NaN` (what a non-numeric
`NOTIFICATION_SWEEP_INTERVAL_MS` produces through `Number()`, mirroring how `LEDGER_EXPORT_DOW_UTC`'s own
`NaN` case is asserted above at 13.9–13.12's neighbourhood) is refused; a fractional value is refused,
because "positive integer" means the integers, not the range; and `Infinity` is refused, because "positive"
alone would pass it and only a `setTimeout` scheduled for the heat death of the universe would ever reveal
the mistake. Every refusal is a SYNCHRONOUS throw, asserted the same way the day-of-week cases above are:
the failure mode this guards against is not a wrong value but a call that never returns (`0`/negative spin
the daemon in a tight re-arm loop; the pre-fix code had no guard against either).
`apps/server/test/ops/schedule.test.ts`

- ✅ **13.203 — `backup-daemon-main.ts` registers two more jobs on the SAME scheduler as the existing
pg-dump and ledger-export jobs, and neither reaches the `--once` path.** The entry point now calls
`startScheduler` DIRECTLY with all four jobs, not `startBackupDaemon` — one scheduler, one `stop()`, one
`'backup daemon scheduled'` log line, for all four. **The count is FIVE as of Task 8 (second wave,
2026-09-18), which added the `auto-close` job; the sentence above is this case's own measurement at the
time it was written, and the heading in `test/ops/backup-daemon-main.test.ts` was corrected to match.**
`startBackupDaemon`'s only remaining caller is its own
test file above (13.9, 13.25–13.29), kept because it is what pins `startScheduler`'s stderr/alerter contract
in one place; that pinning is what makes it true, by construction rather than by a fifth case, that a
`sweep-orphans` failure in production alerts as `` `backup:sweep-orphans` `` with `msg: 'backup job failed'`
— the exact shape 13.25/13.27 assert against `startBackupDaemon`. `sweep-orphans` runs
`sweepOrphanObjects` against the worker's own `createObjectStoreFromEnv` store on a fixed 30-day interval
(first run 30 days after boot — the same `delayMs`-called-once-to-arm, called-again-after-completion
semantics `startScheduler` already gives the two backup jobs) and logs COUNTS only (`examined`, `named`,
`unrecognizedShape`, `withinWindow`, `swept`, `deleted`), never the swept key list itself, at `info` level.
`sweep-notifications` runs `runNotificationSweep` with `createInAppTransport(pool)` on
`NOTIFICATION_SWEEP_INTERVAL_MS` (optional, default one hour; unset OR empty both mean "use the default",
the same equivalence `requireDatabaseUrl` and the `ALERT_WEBHOOK_URL || null` mapping already draw
elsewhere in this file, because an unset App Platform binding resolves to `''` and `Number('')` is `0`,
which the validator above would then — correctly — refuse for a value the operator never actually set).
Both new jobs are absent from the `process.argv.includes('--once')` branch, with a comment at that branch
saying so explicitly: that flag's own docstring, and the `pnpm ops:backup-once` script that calls it, are
"run the two BACKUP jobs right now," and folding a sweep whose delete has no undo into that silently would
surprise whoever reaches for it expecting only a backup. `console.log(JSON.stringify({msg: 'backup daemon
scheduled'}))` still fires exactly once, after all FOUR jobs are armed — no competing log line was added.
**No automated test exercises `backup-daemon-main.ts` itself** — this is the same gap 13.39 already records
for the two original jobs, now also true of the two new ones; the claim above is proven at the unit level
(`startScheduler`'s and `requirePositiveIntervalMs`'s own cases, immediately above) and by reading the
wiring, not by an integration test of the entry point. `apps/server/src/ops/backup-daemon-main.ts`,
`apps/server/src/ops/schedule.ts`

### Deployed-stack E2E, and the sign-in defect it found (Task 13)

Playwright against the **running compose stack** — real Next container proxying to a real API server,
real Postgres, real Mailpit — under `apps/web/playwright.stack.config.ts`, a SECOND config with no
`webServer`. Run: `pnpm run test:e2e:stack` with the stack up. **Three specs, all passing at the head
that carries this file.** The auth cases below are ordinary `vitest` server cases
(`apps/server/test/auth/trusted-origins.test.ts`), not E2E.

- 13.169 ✅ the run REFUSES to start unless what is listening is the stack: `/healthz` answers `ok` with a
  non-empty deploy sha, AND `GET :3001/v1/me/workspaces` is answered by the API SERVER — status 401 with
  the server's own `{"error":"unauthenticated"}` body, inside a 10 s bound (`e2e-stack/helpers/stack.ts`)
- 13.170 🧪 the negative control that makes 13.169 falsifiable, MEASURED both ways on one stack: an image
  built without `SERVER_ORIGIN` (what `up -d` reuses WITHOUT `--build`) proxies `/v1/*` at itself and
  answers **500 after 30.014 s**; rebuilt, the same request answers **401 in 0.059 s** — and
  `docker compose ps` reported **every container healthy in BOTH states**, so "the containers are up" is
  not evidence about the hop
- 13.171 ✅ the test inbox is purged immediately before each send and EXACTLY ONE message is then required;
  two after a purge raises rather than picking a winner. `messages[0]` under an unknown sort order can
  return an already-SPENT link, and following one does not fail loudly — the earlier session cookie is
  still in the context, so the suite would go green having proved nothing (`e2e-stack/helpers/mailpit.ts`)
- 13.172 ✅ sign-in through the SHIPPED UI: the email goes into the real form (`getByLabel('Email')`,
  `getByRole('button', {name:'Send magic link'})` — role/label addressing, no test id added to suit a
  test), the link comes out of Mailpit, the browser follows it and lands authenticated
- 13.173 ✅ the seeded board renders from REAL projections: `Convenience Corner` → `Shop operations` →
  at least one `board-column-*`, and `ticket-card-*` COUNTED greater than zero (an empty board would
  satisfy "no error appeared")
- 13.174 ✅ `POST /v1/events` through the WEB container's proxy is ANSWERED BY THE SERVER — 200 exactly,
  a body that parses, one `results` entry, and NOT `malformed-envelope` — carrying the session cookie the
  browser earned, the ids read off the real page, and `actorId` read from the browser's OWN session via
  `/api/auth/get-session`. Two-sided: the identical POST from a fresh context with no session answers
  **401**. **This case was REWRITTEN after review found the first version could not fail.** It sent no
  `Origin`, and `/v1/events` is in `HTTP_ORIGIN_PROTECTED_ROUTES` where `httpOriginRefused` ends
  `input.origin !== input.expectedOrigin` — so an ABSENT origin is refused by an `onRequest` hook, before
  routing, and `requireSession` never ran. The old assertions (`not.toBe(401)`, `toBeLessThan(500)`) both
  passed on that 403, meaning "it is authenticated" had no failure mode at all: an expired or forged
  cookie produced the same answer. Measured: Playwright's `page.request` sends no `Origin` header. The
  event id was also `crypto.randomUUID()` against a `ULID_REGEX` envelope, so the ids read off the page
  never reached a parser
- 13.175 ✅ a guest sees the workspace and NOT its projects — ruling **P38**'s partial workspace, seen from
  a browser for the first time. The seed makes the accountant a WORKSPACE member with role `guest` plus
  explicit visibility on four TICKETS and never emits `project.member_added`, and `eff.projects` is built
  from that event and nowhere else, so an empty project list is the product working. Asserted as
  absent-with-a-present-sibling (the workspace heading is visible in the same render), never a bare
  `toHaveCount(0)`, which passes on a blank, 500'd or redirected page
- 13.176 🟡 **a guest has NO NAVIGATION to the four errands explicitly shared with them** — the read and
  the surface now exist; the BROWSER assertion does not. **What is served and witnessed:**
  `MyWorkResponse.shared` carries the tickets whose RESOLVED audience names the viewer
  (`explicitAudienceWhere`, exported from `read/visible-where.ts` rather than restated), a guest already
  reaches `/v1/me/work` — **this sentence cited 13.175 for that link and was corrected 2026-09-20: the citation had gone stale rather than the fact being wrong.** Round 19c made `AppNav` CONTEXTUAL, so on `/workspaces` — where no workspace is selected — it renders the always-tier items only and the guest has NO `My Work` link there; 13.175's present-sibling is now the workspace door link, measured live on the stack. The guest's `My Work` link does exist on `/w/<id>`, where a workspace IS selected, and **no spec asserts it — recorded as a gap rather than left as a citation resolving to a spec which no longer says it** — and the My Work page renders
  a "Shared with me" section for it. Witnessed by 7.260–7.265 at the route, 3.159 at the mapper and
  3.160/3.161 at the view, each with measured mutations, plus both integration doors
  (`client-contract`, `real-door-round-trip`) whose exact-shape assertions now name the key.
  **What is NOT done, enumerated rather than called "partial":** (1) no Playwright spec asserts a real
  guest reaching a real errand in a real browser — this suite is structurally off the local gate (13.177)
  and GitHub Actions has had no green run since 2026-09-06, so a spec added now would execute once, by
  hand, and never again; deliberately NOT written, because an unrunnable spec landing beside verified
  work is how a 🧪 becomes a believed ✅. (2) ~~OPENING a shared errand into a ticket sheet is still not
  possible — `DataSource.getTicket` refuses with `ServingGapError` for EVERY viewer, not only a guest — the
  route answers a snake_case `proj_visibility` row with no title, no `stateProvenance` and no domain
  `TicketState` — so the SHEET is a refusal for everybody on every surface, which predates this change.~~
  **⚠ FALSE, AND CORRECTED RATHER THAN DELETED (2026-09-20).** The struck text is kept because it is a
  **superseded claim, not a wrong conclusion**: it was true when written and the read it describes closed
  later. **Decided by what it RESOLVES to, and measured on the running stack three ways.** (a) The single
  read answers **200** with exactly the seven keys `mapTicketRead` reads — `ticket`, `ticketState`,
  `title`, `stateProvenance`, `assignedProvenance`, `parent`, `rollup`. (b) A board card click opens the
  sheet (`?ticket=…`, `.gn-sheet` rendered, the ticket's own title, the `Details | History` pair, and
  **`stateProvenance` drawn on screen** as *"marked To do by Kiro on 6 Sep 2026"* — one of the three fields
  this sentence said was unavailable). (c) **A GUEST opens a sheet for an errand explicitly shared with
  them**, with its real title. **The refusal is on the READ, not on the sheet**, and it is two-sided: a
  ticket NOT shared with the viewer answers **404** and opens a sheet carrying the generic title `Ticket`
  and no content — the same answer a non-existent id gets, which is the frozen 404 doing its job.
  **This closes reason (2); the 🟡 above now rests on (1) alone**, because the witness is a hand-run
  measurement and not a committed spec.
  **⚠ THE CAUSE, which is the durable half of this correction:** the belief came from
  `apps/web/src/ticket-location.ts:26`, whose docblock states `DataSource.getTicket` *"exists and
  **refuses**"*. **It was TRUE when written** (`e09666ce`, 2026-09-04) and **falsified two days later**,
  when ruling **P25 clause 1** discharged the buildable subset (`c86c4b5c`, 2026-09-06). The 2026-09-19
  sweep that existed to catch exactly this class (`01a24a9d`, PR `#537`, *"Four docblocks claimed a read
  refuses. Ruling P25 deleted that absence."*) **fixed two files carrying it — `attention-strip.tsx` and
  `ticket-sheet.tsx` — and not this one: a sweep whose universe was the files it had already opened.**
  **That docblock is a product-side stale claim in source and is NOT corrected here; the owner has it.**
  **A claim that stood here and was FALSE is corrected rather than deleted:** this said a guest "gets 404
  from" the project page, and `routes/board.ts` says in writing that a workspace member who is not on the
  project *"passes the gate and gets 200 with whatever their visibility yields"*. A guest IS a workspace
  member and the guest arm of `visibleTicketsWhere` is the explicit clause, so the project page loads for
  them with their shared ticket on the board. The view's open affordance was gated on that false claim and
  the gate is now GONE (3.161); navigation works to exactly the degree it works for anybody.
  Owner of (1): whoever runs the stack once CI billing is restored. Owner of (2): the `getTicket` serving
  gap, which predates this and is not this change's to close
- 13.177 ✅ the suite is off the LOCAL gate structurally, for two independent reasons: it is reached by
  `test:e2e:stack`, a script name turbo defines no task for, AND `apps/web/vitest.config.ts` includes
  `test/**` only, so `e2e-stack/` is not collected by the gate's runner either. Measured before and after
  — `turbo run test --dry=json` = 16 tasks, 10 `#test`, **0** e2e. **It is deliberately ON CI's `gate`
  fan-in** (`ci.yml` lists `e2e` in `gate`'s `needs`), which is the point of Task 13 rather than an
  oversight, and it is on `turbo run typecheck` via `tsconfig.e2e.json`, which is wanted. The earlier
  wording said "off the gate" without qualification and was false in two of those three senses
- 13.178 🧪 `ci.yml`'s `e2e` job supplies the real invocation (bring the stack up, install the browser
  explicitly since playwright declares no install script, run, tear down) and keeps a visibly-skipped
  path with a printed reason. It had become **green-by-presence**: once Task 6 landed
  `docker-compose.dev.yml` the old job took its file-present branch and reported green while running
  nothing. `🧪` and not `✅` because **no CI run has ever executed it** — GitHub Actions has been failing
  account-wide before the first step on a billing block — so it is verified only by a local YAML parse
  (9 jobs, `e2e` 11 steps, `gate`'s `needs` unchanged) and by Lane C's review of the hunk
- 13.179 ❌ what the web shell RENDERS when `getTickets` throws past the 2000-row cap (case 12.258) —
  **Task 13 does not cover it**; the E2E never reaches that path. Owner: Plan 6 / web render tests
- 13.180 ✅ `seed:cc` runs inside the DEV compose container — which is what the E2E's `global-setup` does
  on every run, so it is exercised continuously. **CORRECTED after review: the stated reason was wrong.**
  This case used to say `reference/` "is present at `/app` in the image". It is not. Measured against the
  IMAGE rather than a running container — `docker run --rm --entrypoint sh <image> -c 'ls /app'` — the
  runtime image holds `dist`, `migrations`, `node_modules`, `package.json` and config and nothing else: no
  `reference/`, no `src/`, no `tsx`. `reference/` is present in the DEV container only, via
  `docker-compose.dev.yml`'s `./reference:/app/reference:ro` bind mount, which App Platform has no
  equivalent of. **The original measurement was taken inside a container that had the mount** — the same
  class of error as reading a stale image's health as the stack's health, and the third time this lane
  measured the wrong environment. In production both seeds run from a checkout (runbook, "Seeding
  production")
- 13.181 ✅ `seed:dev` now has CLI coverage, and its host-only constraint is a documented FACT rather
  than an open defect. `apps/server/test/seed/seed-dev-cli.test.ts` spawns the entry point: it refuses
  without `DATABASE_URL`, prints usage without an owner, refuses an owner who never signed in, seeds
  end to end through `--plans-dir`, and — the control that makes that mean anything — fails naming the
  directory when it holds no plan documents, so a CLI ignoring the flag and reading the repo's own
  `docs/` could not pass. (An earlier draft of that case used an unknown owner and claimed the refusal
  proved the directory was read; it did not — `seedDevWorkspace` resolves the owner BEFORE
  `readPlanSeries`, so it fired whatever `--plans-dir` pointed at. The control exposed it.)
  It still cannot run inside the production image — `docs/` is in `.dockerignore`, so
  `docker compose exec server node dist/seed/cli-seed-dev-workspace.js` cannot work — and the runbook
  now states that for BOTH seeds, with the reason. Host-side only, `DATABASE_URL` → `localhost:54330`.
  (Case 13.90 is `seed:cc`'s CLI smoke and stays Lane D's to flip)
- 13.182 ✅ the WEB_ORIGIN a browser actually sends is ACCEPTED on `/sign-in/magic-link` (200). **Mutation:
  delete `trustedOrigins` from `createAuth` → this case reddens ALONE, 4 pass / 1 fail, `expected 403 to
  be 200` — the production defect reproduced, and the only assertion in the suite that distinguishes the
  default from the fix**
- 13.183 ✅ an origin in neither the default nor `WEB_ORIGIN` (`http://evil.test:9`) is still refused 403
  `INVALID_ORIGIN`
- 13.184 ✅ the `baseUrl` origin the default provides is STILL trusted — the fix ADDS, never substitutes:
  `getTrustedOrigins` (`better-auth@1.7.2`, `dist/context/helpers.mjs:74,77`) pushes the `baseURL` origin
  and only then appends `options.trustedOrigins`
- 13.185 ✅ a same-origin deployment (`WEB_ORIGIN` == `baseUrl`) behaves exactly as before AND does not
  become permissive — `:3001` is refused by that deployment. **Mutation: trust every origin (`'*'`) → 3
  pass / 2 fail; both this case and 13.183 redden, because both are permissiveness bounds. The ruling
  predicted one; two is more constraint than predicted, not less**
- 13.186 🚫 a request with NO cookie, NO `Sec-Fetch-*` and NO `Origin`/`Referer` is not origin-checked at
  all and answers 200 — read from outside that looks inverted, since the browser's own origin was refused.
  **Deliberate library policy, cited to the vendor's source rather than inferred from response codes**:
  in `better-auth@1.7.2`, `validateFormCsrf` (`dist/api/middlewares/origin-check.mjs:131`) validates ONLY
  at `:137` (has cookie), `:141` (has `Sec-Fetch-*`) and `:152` (has `Origin`/`Referer`) — a request
  matching none of the three falls off the end at `:153` unvalidated — and
  `validateOrigin` (`:96`) gates on `const useCookies = headers.has("cookie")` (`:101`) at `:108`. CSRF
  needs an AMBIENT CREDENTIAL the browser attaches automatically; a caller sending none gains nothing from
  forgery. Pinned as behaviour so a version bump that changes it is visible. *(Line numbers are `dist`
  line numbers and are only valid for 1.7.2 — re-read them when the lockfile moves.)*
- 13.188 ✅ a `WEB_ORIGIN` written with a TRAILING SLASH is still trusted — it is normalised at assembly
  with the same `normalizeOrigin` every other consumer uses. Un-normalised it would reinstate the exact
  403 `INVALID_ORIGIN` this change removes, because better-auth matches http(s) patterns by EXACT equality
  (`auth/trusted-origins.mjs`, `pattern === getOrigin(url)`) while `config.ts`'s `httpUrl()` admits the
  slash — and CORS and the HTTP-Origin check would both keep working, so it would present as an auth-only
  regression
- 13.189 ✅ a `WEB_ORIGIN` containing a wildcard is REFUSED AT ASSEMBLY rather than handed to better-auth,
  which branches to `wildcardMatch` for any pattern containing `*`. That branch is not hypothetical: this
  suite's own `'*'` mutation made both permissiveness bounds go green. `auth.ts` previously asserted
  "never a wildcard" as a property nothing enforced, and `WEB_ORIGIN` is set by hand in
  `deploy/do/app.yaml`
- 13.187 🧪 node's `fetch` is not `curl`, and a probe cannot stand in for the client here: the SAME request
  answers 200 under curl and **403 `MISSING_OR_NULL_ORIGIN`** under node, because node presents
  `Sec-Fetch-*` headers and so takes `validateFormCsrf`'s force-validate branch while curl falls through
  unchecked. Pinned by the E2E's own setup, which sends the web origin as a browser does

### Runbook, and the decision the deploy spec owed (Task 16)

Plan 11's last task. `docs/runbook.md` is created here; `Features.md` §13 and this file get their final
shape rather than a first draft — both had been filled incrementally by Tasks 1–15 across five lanes, so
the plan's Step 2 and Step 3 texts (which write them as if new) are stale by construction and were
reconciled, never overwritten.

- 13.190 ✅ every command `docs/runbook.md` names **in a matched shape** resolves — `pnpm --filter <pkg>
  run|exec <script>` (with `--filter @pkg` and `--filter=@pkg`), root `pnpm <script>` with or without a
  colon, repo-relative script paths, and `node dist/…` resolved to the source that builds it. **14
  references, 12 distinct** — both numbers printed, because an earlier version reported only the raw count
  and a reader takes one figure for "how many things the runbook names". `scripts/check-runbook-commands.mjs`,
  **its own CI job**. **Stated limits, because coverage is the thing this kind of check lies about:** a
  command named in PROSE with no `pnpm` in front of it is invisible to the matchers, and so is a directory
  path with no extension. The claim is "every command named in a matched shape", not "every command"
- 13.191 ✅ the checker refuses a clean answer it has not earned: a SELF-TEST runs first against four
  planted defects (an unknown script under a real package, an unknown package, an unknown root script, a
  missing file path) and exits 1 unless all four are caught, and a mirror control requires three
  known-good commands to be accepted. Without it, deleting a matcher would make the real sweep report a
  clean zero — and a zero from a matcher never watched to fire is not a measurement. A runbook naming zero
  commands is also an error, not a pass
- 13.192 ✅ planted defect against the REAL runbook, not a synthetic one: restoring the first draft's
  `ops:sweep-orphans` reddens the check with the site named — *"no such script in
  apps/server/package.json"* — and the file restores to a clean sweep. **That name is the defect this
  check was built for: it has never existed; the script is `sweep:orphans`**
- 13.193 ✅ `verify:projections` runs from `DATABASE_URL` alone, which is how the runbook's restore drill
  invokes it. It previously opened with `loadConfig(process.env)` and so demanded `BETTER_AUTH_URL`, a
  32-character `BETTER_AUTH_SECRET` and `WEB_ORIGIN` — **none of which it reads** — and the drill's own
  step 4 answered `ConfigError: invalid server configuration — check: BETTER_AUTH_URL,
  BETTER_AUTH_SECRET, WEB_ORIGIN`. Measured both ways: with `DATABASE_URL` it now reaches the database;
  with none it exits 2 saying `DATABASE_URL is required`. A drill nobody can run is not a recovery
  procedure, and demanding three auth secrets to read a scratch database invites an operator to invent
  production-shaped values while holding a restored copy of production
- 13.194 🚫 the projection verifier's privilege question is DISCHARGED AS A RECORDED DECISION, in both
  `docs/runbook.md` and `deploy/do/README.md` (coordination doc lines 1607–1611, which required either a
  DDL-capable credential or an explicit decision; neither existed): **`verify:projections` runs only
  against restore scratch databases, never production, and no DDL credential is added.** It needs
  `CREATE SCHEMA` + `CREATE TABLE` on whatever database it verifies, and the shadow trick is safe only
  while every registered projection declares its table — one missing from `tables` gets no shadow copy and
  its unqualified `TRUNCATE` resolves to `public`, truncating the live table (cases 5.55, 7.63).
  **🚫-with-reason, not 🧪 and not ✅:** a recorded decision is a document, nothing about it is verified at
  deploy time, and **no automated check reads it.** An earlier version of this case claimed 13.190 checked
  "that the two files say so" — it does not: 13.190 asserts `deploy/do/README.md` EXISTS and never reads a
  byte of it, so the decision section could be deleted entirely with the check still green. **The cost is
  recorded with the decision:** production drift is not detected continuously — the drill restores a
  ≤1-day-old dump, so what is bounded by a month is DETECTION LATENCY, not dump staleness — and the answer
  if that becomes unacceptable is a read-only continuous checker, not a DDL credential in the deploy spec
- 13.195 ✅ the plan's Task 16 Step 4 whole-stack smoke is now RUN IN FULL, docker half included. **Its
  targets are all LOCAL** — an earlier version said it "requires the production deployment", which is
  false; Step 4 names no production resource. It still cannot be run VERBATIM: it names four root scripts
  that do not exist (`lint`, `test:fixtures`, `test:dual-client`, `test:e2e`) and a stale Postgres port
  (54329; the dev stack is on 54330). RUN: the gate half (build/test/typecheck) and the E2E half
  (13.169–13.175). **The docker half, previously NOT RUN, was run 2026-09-07 and found a real defect:**
  `compose up --build` brings all five services healthy; `check:db-tz` against the compose database on
  54330 answers `Asia/Kolkata`; and the in-container `node dist/ops/backup-daemon-main.js --once`
  REFUSED with `backup object storage needs: BACKUP_S3_BUCKET`. That variable had been deliberately
  omitted from the server service, for a reason that was correct when written — nothing read it, measured
  as 0 hits in `apps/server/src` — and that **expired when the backup work merged**: the same control
  re-run at this head gives FIVE hits, and `ops:backup-once` is a real script. Nothing was watching the
  premise. With the variable wired to the `gisik-backups` bucket `minio-init` already pre-creates, the
  rehearsal completes and writes both artifacts (`ledger/2026-09-07.ndjson.gz` 25KiB,
  `pg/2026-09-07T05-36.dump` 149KiB, verified present and non-empty in the bucket rather than trusted
  from the log line). The wiring is now asserted by `apps/server/test/ci/compose-dev-backup-wiring.test.ts`
  so the rehearsal does not have to be re-run by hand to notice it break
- 13.196 ✅ the CONTENT assertion exists now. `check-runbook-commands.mjs` still only asserts
  that `deploy/do/README.md` and `docs/runbook.md` EXIST — which is its job, and "the commands resolve"
  and "the documents still say what they decided" are different questions that should not share a
  resolver. So the content assertion lives in `apps/server/test/docs/recorded-decisions.test.ts`, where
  the gate runs it and this row can cite it: both files must still carry the three load-bearing clauses of
  13.194's recorded decision (scope limited to restore scratch databases, never production, no DDL-capable
  credential). Sentence fragments, not paragraphs — a paragraph breaks on rewrapping and teaches people to
  delete the test, while a single word like "scratch" would survive the decision being reversed
- 13.197 ✅ E3-14 — three cookie-authenticatable mutations unrecorded in `HTTP_ORIGIN_PROTECTED_ROUTES`
  are now in it and covered by 13.116–13.119's parameterised rows: `PUT /v1/me/notification-preferences`,
  `POST /v1/me/invitations/:inviteId/accept` (membership-granting) and its `/decline` sibling. Distinct
  from the invite TOKEN accept and `PUT /v1/me/preferences`, both still deliberately outside the set by a
  recorded ruling this case does not revisit (`http-origin.ts`'s own docblock)
- 13.198 ✅ E3-15 — the set-equality drift guard (13.116) compares two hand-maintained lists (the suite's
  table and the production `Set`), so a route missing from BOTH leaves it green — the exact shape 13.197
  found. This case measures the ASSEMBLED APP instead: `buildApp`'s test-only `options.onRoute`, wired
  before a single route is registered (a hook attached by the caller afterward misses every root-level
  route — MEASURED, catching only 2 of ~20). Every mutating route the real app serves must be in
  `HTTP_ORIGIN_PROTECTED_ROUTES` or a commented allow-list of the six public doors. Control asserted in
  the same test: the seam must have observed both a root-level route and a child-`register()` route, or
  it would pass vacuously. RED against the pre-13.197 route set (proven by temporarily removing one route
  from both hand-maintained lists: 13.116 stayed green, this case reddened), GREEN at head.
  `app.printRoutes({ commonPrefix: false })` was tried first and rejected — MEASURED, it silently drops
  `/api/auth/*` from its tree (a `find-my-way` internal-node quirk under that option)

