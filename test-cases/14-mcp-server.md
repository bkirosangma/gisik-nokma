# 14. MCP server

The assistant-facing door onto gisik-nokma: an MCP server a person runs locally, authenticated as
themselves, whose writes are attributable in the ledger as an assistant's rather than a person's.

**Legend:** ✅ covered by a test · ❌ not yet · 🚫 out of scope, with a reason.

**⚠ MINT FROM A BLOCK, NOT THE TIP, WHILE THE RELEASE RUNS — `14.150`–`14.159` is ALLOCATED to release batch B09 (lane ds5, 2026-09-21)**, of which `14.150` is minted. The release plan tells every batch to mint "the next free id in that file's section", and six batches were doing that at once; the same rule had already collided twice in §10 and §13 the same day, so B09 took a block clear of every live tip instead. Measured before choosing, across ALL remote branches rather than `origin/main`: §14's occupied ordinals ran to **`14.113`**. A lane minting here should read this line first.

*Numbering starts at 14.1. This section was **reserved** by §15's header for
`docs/superpowers/plans/2026-09-07-mcp-server.md`, and the plan assigns the finished catalogue to its
**Task 11**. This file is opened early, by Task 1, because 14.1–14.3 are real passing cases the moment the
scaffold lands and a catalogue that omits shipped tests is out of sync with the tree — the workspace
convention is that `test-cases/` moves in the SAME change set as the code. Task 11 continues from this
file's then-highest id rather than renumbering, exactly as §13 records doing for its own reservation gap.*

*The decade blocks are contiguous — config `14.1–14.9` through the revoke surface `14.90–14.99` — with
one exception a reader will otherwise trip on: **`14.100` is Task 5's manual end-to-end case**, minted
out of band when a Task 5/Task 6 id collision was fixed. The `last_used` column added on the owner's
2026-09-08 ruling therefore sits at `14.102–14.103`, not `14.100–14.101`. That collision was caught by
`check-case-ids`, not by reading. `14.112`–`14.112b` are E6-16's (release plan B01, 2026-09-21). **Next
free: `14.113`.***

## Task 1 — configuration (`packages/mcp-server`)

*`loadMcpConfig(env, home)` takes the environment as a PARAMETER rather than reading `process.env`
directly, which is what makes these three cases pure functions of their inputs with no global to reset
between them. It also, as a side effect nobody wanted, makes the whole file invisible to
`pnpm check:env` — see the block in `.env.example`.*

- **14.1** ✅ Requires `GISIK_SERVER_URL` and NAMES it when absent — a server that starts without its
  origin and then fails every call is harder to diagnose than one that refuses to start. —
  (`packages/mcp-server/test/config.test.ts`)
- **14.2** ✅ Defaults the token path to `~/.gisik-nokma/mcp-token` under the given home, and carries
  `DEFAULT_POLL_INTERVAL_MS`. — (`packages/mcp-server/test/config.test.ts`)
- **14.3** ✅ Strips a trailing slash from the server URL so later URL joins never double it. —
  (`packages/mcp-server/test/config.test.ts`)

*The 12-second poll default is DERIVED, not chosen: the device routes share a rate-limit bucket budgeted
at `RATE_LIMIT_AUTH_MAX=10` per `RATE_LIMIT_WINDOW_SEC=60`, i.e. one request per 6 s sustained. Polling
at 12 s spends half that, leaving room for the code-mint that opened the flow and for a retry. A login
loop that rate-limits its own polling looks exactly like a server that never approves.*

## Task 2 — the credential store (`apps/server/src/mcp/token-store.ts`)

*Two tables that are deliberately NOT projections and NOT rebuildable, for the same reason
`invite_tokens` is not: what they hold is absent from the ledger on purpose. Anyone who can read a
workspace's history can read an event id and a payload, so a credential that was either would be
readable by every member. **Neither name may ever appear in a projection's `tables` array** — `reset()`
empties what that array names, and a rebuild that emptied `mcp_tokens` would sign every MCP client out
with no way to put them back, and the ledger could not.*

- **14.10** ✅ The device code is stored ONLY as a hash — asserted from both sides: the column equals
  `hashCredential(deviceCode)` AND does not equal the raw code, so storing the plaintext fails twice. —
  (`apps/server/test/mcp/token-store.test.ts`)
- **14.11** ✅ Answers `pending` before anyone approves. — (`apps/server/test/mcp/token-store.test.ts`)
- **14.12** ✅ **Issues a token to the approving user, ONCE.** The replay of the same device code answers
  `unknown` rather than minting a second token. Single-use is enforced by `DELETE … RETURNING` in the
  statement that reads the grant — a SELECT-then-DELETE cannot stop two concurrent presentations, and
  this repo has already had three concurrent invite acceptances all commit against a read-shaped guard. —
  (`apps/server/test/mcp/token-store.test.ts`)
- **14.13** ✅ Refuses an expired grant, and DISTINGUISHES it from an unknown one — two different
  answers, because a client that cannot tell "too late" from "never existed" retries the wrong one. —
  (`apps/server/test/mcp/token-store.test.ts`)
- **14.14** ✅ Refuses to approve an expired grant. — (`apps/server/test/mcp/token-store.test.ts`)
- **14.15** ✅ A personal access token resolves to its user and is stored only as a hash. —
  (`apps/server/test/mcp/token-store.test.ts`)
- **14.16** ✅ **Answers `null` for a forged token and for a revoked one, IDENTICALLY.** Deliberate: every
  distinction here is an oracle somebody can query, the same reasoning `UNAUTHENTICATED_BODY` records for
  its own contentlessness. — (`apps/server/test/mcp/token-store.test.ts`)

*The migration is reversible, proven rather than assumed: UP creates both tables, DOWN leaves zero `mcp%`
tables while **24 other tables remain** (the control that says it dropped only its own), and a re-UP
restores both. The token table carries no `expires_at` by decision, not omission — an invitation link is
handed to somebody who is not yet a user, so a clock bounds an unknown, whereas an MCP token is minted by
the account holder for their own machine from an approval they performed. Revocation is a DELETE and takes
effect at once. Plan Open question 4 if the owner wants a TTL.*

## Task 3 — the three device-flow routes (`apps/server/src/routes/mcp-device.ts`)

*Two of the three doors are unauthenticated BY DESIGN — the point of a device flow is that the thing
asking for a credential does not have one yet. Neither gives anything away: the mint hands back a code
that authorises nothing until a signed-in person approves it, and the exchange answers `pending` forever
unless somebody with a session approved that exact grant. **The credential is created by the APPROVAL**,
which is the door that requires identity, and therefore the door that needs CSRF protection.*

- **14.20** ✅ Mints a grant and never returns the device code in a form it stored — shape-checked to the
  wire contract (43-char base64url code, `XXXX-XXXX` from the unambiguous alphabet, the WEB origin's
  `/mcp/authorize`, and the TTL/interval constants). — (`apps/server/test/mcp/device-flow.test.ts`)
- **14.21** ✅ Needs no session. **Asserts `toBe(200)`, not the plan's `not.toBe(401)`** — see the note
  below. — (`apps/server/test/mcp/device-flow.test.ts`)
- **14.22** ✅ Refuses an unauthenticated approval with the product-wide `{ error: 'unauthenticated' }`. —
  (`apps/server/test/mcp/device-flow.test.ts`)
- **14.23** ✅ Approves as the signed-in person, and the exchange issues THAT person a token. The
  `userId` is in the response because the MCP client cannot build a valid envelope without it —
  `actorId` must equal the session user or the permission gate refuses every write. —
  (`apps/server/test/mcp/device-flow.test.ts`)
- **14.24** ✅ An unknown user code is refused, and says only that. — (`apps/server/test/mcp/device-flow.test.ts`)
- **14.25** ✅ Answers `pending` until somebody approves. — (`apps/server/test/mcp/device-flow.test.ts`)
- **14.26** ✅ A device code is single-use over the WIRE too — the second exchange gets 404
  `unknown_code`, not a second token. — (`apps/server/test/mcp/device-flow.test.ts`)
- **14.27** ✅ `/v1/mcp/device/approve` is in `HTTP_ORIGIN_PROTECTED_ROUTES`. —
  (`apps/server/test/mcp/device-flow.test.ts`)
- **14.27b** ✅ A cookie-carrying approval with a forged `Origin` is refused 403 `forbidden_origin`, and
  the SAME approval bearer-authenticated succeeds — the control without which a route that 403'd
  everything would pass the first half. — (`apps/server/test/mcp/device-flow.test.ts`)
  *Planted defect, run: deleting the route from `HTTP_ORIGIN_PROTECTED_ROUTES` fails **both** 14.27 and
  14.27b — 2 failed / 7 passed. Two failures and not one is the requirement; if only 14.27 had failed,
  14.27b would not be testing what it claims. Restored and verified by SHA-256 against `HEAD`.*

### 2026-09-19 — the DENIAL door (`14.104`–`14.111`)

*Added with the owner's doors ruling (`docs/lanes/owner-holds.md`, "THE DOORS, RULED": `isMcpAuth` **deny** → **BUILD**, a `NEW ROUTE` sibling of approve). **`scopes` and `displayed code` are DECLINED on that same table and are settled product positions — a later session must not surface them as gaps to close.***

- **14.104** ✅ Denies an UNAPPROVED code, which can then be neither approved nor exchanged — the deny answers `{ denied: true }`, a later approve answers 404, and the CLI's exchange answers 404. The last two are the point: the first alone would pass against a route that merely recorded a flag. — (`apps/server/test/mcp/device-flow.test.ts`)
  *Planted defect, run: predicating the `DELETE` on `approved_user_id IS NULL` reddens **14.105 alone** — 1 failed / 13 passed, `expected 404 to be 200` at the deny call. 14.104 stays green, which is what shows the mutation moved only the already-approved property and not the route.*
- **14.105** ✅ Denies an ALREADY-APPROVED code, so no credential is ever issued — the state the dispatch named explicitly, and the one that would quietly mint a token if that predicate were ever added back. — (`apps/server/test/mcp/device-flow.test.ts`)
- **14.106** ✅ Needs a session (`401 { error: 'unauthenticated' }`), and an unknown code is refused with the body approve already uses — `404 { error: 'unknown_code' }`, deliberately not a distinct "denied" answer, which would confirm to whoever holds a guessed user code that it had been real. — (`apps/server/test/mcp/device-flow.test.ts`)
- **14.107** ✅ `/v1/mcp/device/deny` is in `HTTP_ORIGIN_PROTECTED_ROUTES`. The attack is the MIRROR of 14.27's and no less real for being a refusal rather than a grant. — (`apps/server/test/mcp/device-flow.test.ts`)
- **14.107b** ✅ A cookie-carrying DENIAL with a forged `Origin` is refused 403 `forbidden_origin`, and the SAME denial bearer-authenticated succeeds — doing double duty: it proves the 403 is about the ORIGIN rather than a route that refuses everything, and because it answers 200 rather than 404 it also proves the forged call really did nothing. — (`apps/server/test/mcp/device-flow.test.ts`)
  *Planted defect, run: removing the route from `HTTP_ORIGIN_PROTECTED_ROUTES` reddens **five** cases — 14.107 (`false` vs `true`), 14.107b (`401` vs `403`), both `it.each` probe loops in `security-middleware.test.ts` for the new row (`400` vs `403`), and **the `13.116` set-equality drift guard**, which reports the two sets as `…(9)` and `…(8)`. That guard fires in BOTH directions by design: protect the route and forget its row, or add the row and drop the protection.*
- **14.108** ✅ The Deny control sits BESIDE Approve on `/mcp/authorize` and posts to the DENIAL door — `/v1/mcp/device/deny` with `{ userCode }`, asserted on the URL rather than on "something was sent", because a `deny: true` flag posted to approve is the one-route-two-questions shape this repo refuses by name. — (`apps/web/test/mcp-authorize.test.tsx`)
  *Planted defect, run: posting both controls to `/v1/mcp/device/approve` reddens **14.108 alone** (`expected '/v1/mcp/device/approve' to be '/v1/mcp/device/deny'`); 14.109 stays green.*
- **14.109** ✅ Approve still posts to `/v1/mcp/device/approve` — the positive control proving the two doors really are two. — (`apps/web/test/mcp-authorize.test.tsx`)
- **14.110** ✅ Both controls are disabled until a code is present, so neither can be pressed into an empty POST. — (`apps/web/test/mcp-authorize.test.tsx`)
- **14.111** ✅ A refusal on DENY is rendered as a sentence naming BOTH possibilities ("not recognised … already been used"), and the form returns rather than sticking in a sending state. — (`apps/web/test/mcp-authorize.test.tsx`)
- **14.112** ✅ E6-16 — an MCP token cannot approve a device code, not even its own successor. `requireSession` accepts either a real better-auth session or an MCP personal-access-token bearer, and nothing previously distinguished them, so a token could mint a SUCCESSOR device code that survives revoking the token that minted it — falsifying the consent page's "it lasts until you revoke it". Mints a real token by walking the flow once as a signed-in person, then uses THAT token (not the session bearer) to attempt approving a second code: `403 { error: 'mcp_token_may_not_decide_device_grant' }`. *Planted defect, run: reverting `require-session.ts`'s two `authKind` stamps and `mcp-device.ts`'s two refusal checks reddens 14.112 and 14.112b together — `expected 200 to be 403` on both, the approval and the exchange both succeeding through the forged authority. Restored, full suite green.* — (`apps/server/test/mcp/device-flow.test.ts`)
- **14.112b** ✅ The mirror for DENY: an MCP token cannot deny a device code either, same refusal, same reason a forged deny is no less an act on someone else's authority than a forged approve. — (`apps/server/test/mcp/device-flow.test.ts`)

*The accessible names on this screen are asserted **by string** (`getByRole('button', { name: 'Deny' })`), because `e2e-viewport`'s sweep counts `aria-label` ATTRIBUTES and cannot tell one name from another — and **neither accessible-names baseline carries a `/mcp/authorize` key** (measured 2026-09-19), so nothing else in the suite is watching these strings.*

> **A defect in this task's own specified test, worth keeping because of how it was caught.** The plan's
> Step 4 says the file must go entirely red and that any pass at that point means a test "is testing
> something other than what it names". It went **8 failed / 1 passed**. The pass was 14.21, asserting
> `not.toBe(401)` — and an unregistered route answers **404**, which is not 401, so it passed against a
> route that did not exist at all. A negative assertion about a status code cannot distinguish "reachable
> and unauthenticated" from "not there", which is the whole claim. Changed to `toBe(200)` and re-run
> WHILE STILL RED to confirm it then failed (9 of 9), so the strengthening is falsifiable rather than
> asserted. The plan's warning was right; it just did not notice the test it had written.

*The two numbers the spec left open are DERIVED, not picked. All three routes are charged to a fourth
limiter bucket, `mcp:`, fed by the existing `RATE_LIMIT_AUTH_MAX` — the `inviteMax` precedent, no new
environment variable. Before this, a route under `/v1/mcp/...` matched NO bucket, leaving the 8-character
user code an unlimited brute-force surface. At 10 per 60s the sustained rate is one per 6s, so a 12s poll
spends half the budget and leaves room for the mint and a retry, and a 600s TTL is 50 polls.*

## Task 4 — `require-session` learns the personal access token

*A FALLBACK, not a branch. better-auth is asked first, always, and `mcp_tokens` only when it answers
null. Reversing that would put a second credential system in front of the one that owns sessions — every
mobile and desktop client, and every test in this repository, authenticates with a better-auth BEARER
token. They are the same header; only the order keeps them from contending.*

- **14.30** ✅ An MCP token reaches `GET /v1/me/workspaces` as its owner. — (`apps/server/test/mcp/require-session-pat.test.ts`)
- **14.31** ✅ A better-auth SESSION token still works, unchanged — the regression that is the whole risk
  of this change. — (`apps/server/test/mcp/require-session-pat.test.ts`)
- **14.32** ✅ A forged token gets the product-wide contentless 401. — (`apps/server/test/mcp/require-session-pat.test.ts`)
- **14.33** ✅ A revoked token is refused, indistinguishable from a forged one. — (`apps/server/test/mcp/require-session-pat.test.ts`)
- **14.35** ✅ **A credential valid as BOTH resolves as better-auth, not as the PAT.** —
  (`apps/server/test/mcp/require-session-pat.test.ts`)
- **14.36** ✅ A rejected bearer actually REACHES the fallback and still 401s when it misses — asserted on
  a recording stub, because the 401 alone is what the route answered before the fallback existed. Also
  pins that what reaches the query is the sha256, never the credential. —
  (`apps/server/test/auth/require-session.test.ts`)
- **14.37** ✅ A request with NO bearer never reaches the fallback at all. Without it, a fallback running
  on every anonymous probe — one database write apiece — would look identical from outside. —
  (`apps/server/test/auth/require-session.test.ts`)

> ### The plan said the order could not be tested. It can, and 14.35 is the test.
>
> Task 4's Step 5 says to move the PAT lookup above `getSession` and observe that everything still
> passes — then concludes that a discriminating test "would need a value that is valid as both
> credentials at once, which cannot be constructed", and that the order is therefore "held by the
> docblock and by review, not by a test".
>
> **The first half is true and was reproduced: with the order reversed, all twelve then-existing cases
> passed.** The conclusion is not. Such a value IS constructible — insert an `mcp_tokens` row whose
> `token_hash` is the sha256 of a LIVE better-auth session token, pointed at a DIFFERENT user. That one
> string is simultaneously a valid session for `owner` and a valid PAT for `impostor`, and which identity
> the request resolves to is exactly the order under test. The device-approval route is the observation
> channel, being the one place `currentUserId` becomes visible in a response.
>
> Verified in the order that makes it evidence: written WHILE the reversal was still applied, watched to
> fail as the only failure among five, then the order restored (SHA-256 against `HEAD`) and watched to
> pass. **14.35 is the only thing in this repository that holds the resolution order.**

*The cost of the fallback, stated rather than hidden: every request that falls THROUGH to the PAT branch
performs one indexed single-row write, because `resolveMcpToken` stamps `last_used`. A better-auth session
never reaches it, so web, mobile and desktop pay nothing; only MCP calls do.*

## Task 5 — the approval screen (`apps/web/app/mcp/authorize/page.tsx`)

*The one place a person consents to an assistant acting as them. It must live in `apps/web` and nowhere
else: `/v1/mcp/device/approve` is inside `HTTP_ORIGIN_PROTECTED_ROUTES`, so a cookie-carrying POST must
present `Origin: <WEB_ORIGIN>`, and only a page served from the web origin does.*

*Numbered **14.100**, outside every decade the plan assigns, and that is deliberate. The plan gives each
task a decade — Task 2 the 14.10s, Task 3 the 14.20s, Task 4 the 14.30s, Task 6 the 14.40s, and so on,
with Task 11 owning each `x9`. **Task 5 has no decade**: the plan never numbers it, because it specifies
this verification as a manual drive rather than a committed spec. An earlier draft of this section minted
`14.40` for it, which is Task 6's FIRST case — caught before Task 6 was written, by reading the plan's
assignments rather than the file's maximum, which is exactly what §12's header warns is the only safe way.*

- **14.100** 🧪 **End-to-end, driven against the real compose stack** — mint with `curl`, approve in a real
  browser as a real signed-in person, exchange with `curl`, and use the issued token on a real product
  route. Manual rather than a committed spec, per the plan's Step 3, and the exact readings are recorded
  in the commit: `?code=` prefill matched the minted code, approval and refusal both rendered, exchange
  answered `issued`, and the token authenticated `GET /v1/me/workspaces` → 200 with the seeded
  Convenience Corner workspace.
  *This is the case that FOUND something. The confirmation rendered "It now acts as , with exactly your
  permissions" — naming nobody, in the sentence whose whole job is naming somebody. No status-code or
  testid assertion in this plan would have caught it: the page rendered perfectly.*

> **The origin control, measured rather than argued.** Attempting the approval from a page served on a
> non-`WEB_ORIGIN` port answers **403 `forbidden_origin`**; the identical request from the real web
> origin passes the origin check and fails on its bogus cookie instead (**401**). That pair is why this
> page exists in `apps/web`, and it is why verifying it on a spare port is impossible by construction.

> **Recorded, not fixed — a defect in a SHARED hook.** `useSessionStatus` builds the display name as
> `user.name ?? user.id`, and `??` catches only null and undefined. A magic-link account's name is `''`
> — an empty string, confirmed by reading the column — so the fallback never fires. This page defends
> itself with `actingAs()`, which answers "you" rather than a ULID, because an id has technically named
> the person and actually told them nothing. *Owner: whoever next touches `useSessionStatus`.*

## Task 6 — the client's token cache and HTTP layer (`packages/mcp-server`)

- **14.40** ✅ Answers `null` when nothing is cached. — (`packages/mcp-server/test/token-cache.test.ts`)
- **14.41** ✅ Round-trips the token and the user id. — (`packages/mcp-server/test/token-cache.test.ts`)
- **14.42** ✅ **Writes the file `0600` and its directory `0700`.** A personal access token any process on
  a shared machine can read is not cached, it is published — so the mask is asserted, not assumed, and
  `mkdir` is given the mode explicitly rather than trusting the process umask, which is not this module's
  to assume. — (`packages/mcp-server/test/token-cache.test.ts`)
  *Mutation: drop both mode arguments and rely on umask — the tempting shortcut — and **exactly 14.42
  fails**, 1 of 11. Nothing else notices a world-readable credential.*
- **14.43** ✅ Answers `null` for a CORRUPT cache rather than throwing. Absent, unreadable and corrupt all
  mean the same thing to a caller — there is no usable credential — and one of them is recoverable by the
  device flow. Throwing would turn a truncated file into a permanent failure only a human deleting a
  dotfile could clear. — (`packages/mcp-server/test/token-cache.test.ts`)
- **14.44** ✅ Sends the token as a bearer credential, returns the parsed body, and **sends no cookie** —
  the absence is asserted. A bearer-only caller sits outside the HTTP-Origin check by construction, and a
  cookie would put this client inside a CSRF control it has no business being inside. —
  (`packages/mcp-server/test/http-client.test.ts`)
- **14.45** ✅ Throws `HttpError` carrying the server's body **verbatim**, not a summary of it — whoever
  surfaces this to an assistant shows what the server actually said. —
  (`packages/mcp-server/test/http-client.test.ts`)
- **14.46** ✅ **Turns an unreachable server into a `TransportError` and does NOT retry**, asserted by
  counting the calls. A write retried against a server that becomes reachable mid-retry double-submits,
  and a double-submitted ticket is worse than a failure the person is told about once. —
  (`packages/mcp-server/test/http-client.test.ts`)
  *Mutation: add a single retry in the catch — **exactly 14.46 fails**, 1 of 11.*
- **14.47** ✅ Posts with no token when there is none, which the device flow requires: the two
  unauthenticated doors are reached before any credential exists. —
  (`packages/mcp-server/test/http-client.test.ts`)

## Task 7 — the device-flow login driver and the session (`packages/mcp-server`)

*Every source of time is injected — `sleep`, `now`, the deadline — so the whole flow runs in
microseconds under test and a reader can see there is no hidden clock.*

- **14.50** ✅ Mints, prompts, polls until issued, and returns token + userId. **The poll interval comes
  from the SERVER's answer**, not a constant in the client: the server is the side that knows its own
  rate-limit budget, and a client carrying its own number would 429 itself the day that budget changes —
  a login loop that rate-limits its own polling is indistinguishable from a server that never approves. —
  (`packages/mcp-server/test/device-login.test.ts`)
- **14.51** ✅ Gives up at the deadline rather than polling forever. — (`packages/mcp-server/test/device-login.test.ts`)
- **14.52** ✅ Surfaces the prompt **before** the first poll — the ORDER is asserted, not merely that both
  happened. A person cannot approve a code they have not been shown, and prompting after the first poll
  would spend one interval of silence on every login. — (`packages/mcp-server/test/device-login.test.ts`)
- **14.54** ✅ Uses a cached token without running the device flow. — (`packages/mcp-server/test/session.test.ts`)
- **14.55** ✅ A 401 re-runs the device flow and retries the call ONCE — and **the user id moves with the
  token**. A stale id would make every write's `actorId` disagree with the session and draw an
  identity-spoof refusal from the permission gate: a confusing failure a long way from its cause. —
  (`packages/mcp-server/test/session.test.ts`)
- **14.56** ✅ **A second 401 is surfaced, not looped on**, asserted by counting calls. A server answering
  401 to everything would otherwise spin forever and spend the device-flow rate-limit budget doing it. —
  (`packages/mcp-server/test/session.test.ts`)
  *Mutation: make the re-auth an unbounded loop and **exactly 14.56 fails**, by TIMING OUT at 4003ms —
  the failure mode is the spin itself, which is the right way for this one to die.*
- **14.57** ✅ **A 404 is NOT a re-auth trigger — it is the answer.** The product answers 404 for "does
  not exist" and "not yours" alike, deliberately, so a caller cannot probe for which records exist.
  Re-authenticating on it would turn a correct visibility refusal into a login prompt. —
  (`packages/mcp-server/test/session.test.ts`)
  *Mutation: re-auth on ANY `HttpError` rather than 401 only — **exactly 14.57 fails**.*

> **`14.53` does not exist, and that is a correction rather than a gap.** The plan's docblock for
> `device-login.test.ts` says "Cases 14.50–14.53" and then defines three. Corrected to 14.50–14.52 in the
> file rather than carried forward: a docblock naming a case no test defines is exactly what
> `check-case-citations.mjs` exists to catch, and this catalogue would otherwise have inherited a ✅ with
> nothing behind it. The id is left unused; §13's rule is never to renumber around a gap.

## Task 8 — the five read tools (`packages/mcp-server/src/tools/read-tools.ts`)

*Passthroughs of routes that already exist. The interesting decisions are all about what these tools do
NOT do: invent routes, normalise the server's shapes, or restate the domain's schema.*

- **14.60** ✅ `list_workspaces` passes the server body through unchanged. — (`packages/mcp-server/test/read-tools.test.ts`)
- **14.61** ✅ **`list_projects` reads the WORKSPACES route, because no projects route exists.** Verified
  against the tree rather than taken from the plan: `/v1/projects/:projectId/*` serves `board` and
  `tickets` and nothing else. — (`packages/mcp-server/test/read-tools.test.ts`)
  *Mutation: point it at an invented `/v1/workspaces/:id/projects` — **exactly 14.61 fails**, 1 of 7. It
  is the only thing standing between this tool and a 404 against a route the server never promised.*
- **14.62** ✅ Answers an empty list for a workspace the person cannot see — not an error, because the
  workspace directory is already the visibility answer. — (`packages/mcp-server/test/read-tools.test.ts`)
- **14.63** ✅ `search_tickets` encodes `q` and `workspaceId` and omits an absent filter. —
  (`packages/mcp-server/test/read-tools.test.ts`)
- **14.64** ✅ **Refuses a filter carrying `text` BEFORE the network** — the assertion is that no request
  was made at all. The server answers `400 {error:'invalid_filter'}`, which does not say which of the two
  text terms is the problem; this is the difference between an assistant being told to pass one or the
  other and being told "invalid_filter". — (`packages/mcp-server/test/read-tools.test.ts`)
  *Mutation: drop the guard and let the server answer — **exactly 14.64 fails**, 1 of 7.*
- **14.65** ✅ `list_tickets` JSON-encodes the `FilterSpec` into ONE `filter` parameter. The expectation
  is built with the same `URLSearchParams` construction the handler uses, so parameter ORDER cannot drift
  between test and code and turn a correct handler red — what is asserted is the encoding. —
  (`packages/mcp-server/test/read-tools.test.ts`)
- **14.66** ✅ `get_ticket` passes **both casings** through untouched — `ticket` snake_case beside
  `ticketState` camelCase. The mixed casing is the SERVER's contract; normalising it here would be this
  package inventing a shape. — (`packages/mcp-server/test/read-tools.test.ts`)

*`filter` is `filterSpecSchema` imported from `@gisik-nokma/domain`, never restated. Probed rather than
assumed: it parses `{stateCategory:'open'}` and REFUSES `{assigneeIds:['x']}`, because it is `.strict()`
and its assignee/collaborator keys are SINGULAR — so a caller passing an array is refused by the schema
instead of silently matching nothing. The tool descriptions carry the traps an assistant would otherwise
learn by failing: search is capped at 50 with no pagination (`SEARCH_LIMIT = 50`, verified in
`routes/search.ts`), the project list is deliberately partial for a non-owner, `parentId: "root"` means
top-level only, and a ticket you cannot see is indistinguishable from one that does not exist.*

## Task 9 — the four write tools (`packages/mcp-server/src/tools/write-tools.ts`)

*Every write carries `origin: 'mcp'` — owner ruling 1, and the reason Task 0 exists. A ledger that
cannot tell a person's claim from their assistant's is a ledger lying about who acted.*

- **14.70** ✅ `create_ticket` builds a `ticket.created` that **`parseEvent` accepts**, run through the
  product's OWN parser with the product's OWN registry — so a payload key this package guessed wrong
  fails here rather than as an `invalid-payload` result after a round trip. —
  (`packages/mcp-server/test/write-tools.test.ts`)
  *Mutation: remove `'mcp'` from `ORIGINS` and rebuild the domain dist — **exactly 14.70 fails**, with
  `malformed-envelope … at origin: Invalid enum value … received 'mcp'`. That is the proof Task 0 is a
  real dependency of Task 9 and not bookkeeping.*
- **14.71** ✅ `parentId` is sent as an **explicit null, never an absent key** — asserted with
  `Object.hasOwn`, which an absent key fails while `payload.parentId === null` alone would not. The
  domain schema is `.nullable()`, not `.optional()`. — (`packages/mcp-server/test/write-tools.test.ts`)
- **14.72** ✅ `transition_ticket` uses the key **`to`**, not `toStateId` (`workflow.ts:137`). An
  executor guessing the other spelling gets `invalid-payload` on every transition. —
  (`packages/mcp-server/test/write-tools.test.ts`)
- **14.73** ✅ Omits `comment` entirely when none is given. — (`packages/mcp-server/test/write-tools.test.ts`)
- **14.74** ✅ `add_comment` sends a document **object**, not a string — `plainTextToDoc` builds it. —
  (`packages/mcp-server/test/write-tools.test.ts`)
- **14.75** ✅ `assign_ticket` sends an explicit null to unassign. — (`packages/mcp-server/test/write-tools.test.ts`)
- **14.76** ✅ A rule-engine refusal is thrown with **rule and reason verbatim**. `POST /v1/events`
  answers **200** for a refusal — refusals ride inside `results[]`, index-aligned — so a caller checking
  the status code alone would report every refusal as a success. —
  (`packages/mcp-server/test/write-tools.test.ts`)
- **14.77** ✅ An `invalid` result carries its code and message. — (`packages/mcp-server/test/write-tools.test.ts`)

> ### The check that could not fail, and the three invalid ULIDs it was hiding
>
> The plan calls 14.70 "the strongest available check short of a live server". As written it was
> `expect('error' in parsed).toBe(false)` — and `parseEvent` returns `{ok:true,event}` or
> `{ok:false,code,message,eventId}`. **Neither shape has an `error` key**, so the expression was false
> unconditionally. Measured before touching it: with `'mcp'` removed from `ORIGINS` and the domain dist
> genuinely rebuilt to four members — verified by reading the built JS rather than trusting turbo — all
> eight cases still passed.
>
> Corrected to `parsed.ok`, it failed at once with `malformed at actorId: must be a ULID`. **The plan's
> own fixtures are not ULIDs.** Crockford base32 excludes I, L, O and U, and `01J0USER…`, `01J0PROJ…`
> and `01J0TICK…` carry one each — eleven occurrences across three constants. The envelopes these cases
> claimed the server "would accept" would have been refused at the door.
>
> Replacements were validated against `ULID_REGEX` **before** substitution, so the fix could not repeat
> the defect it was fixing. Both halves were corrected together: fixing the constants alone would leave
> the next wrong fixture equally invisible.

> ### The plan's trap 4 is stale, and following it would have defeated Task 0
>
> It says *"`origin` is `'web'` … `ORIGINS` has no `'mcp'` (Open question 1)"*. Owner ruling 1 resolved
> that question the other way — which is why Task 0 exists — and Task 0's closing line reads "This task
> comes BEFORE Task 9, **which sends the value**." The plan's own test and implementation both already
> said `'mcp'`; only the prose table was left behind.

## Task 10 — the stdio entrypoint and the nine-tool registration (`packages/mcp-server`)

*One wiring point: `register.ts` is the only file in the package that knows the MCP SDK's registration
API, so everything else speaks `ToolDefinition` and every tool test runs with no transport at all.
These cases run against a **real `McpServer` and a real `Client` over `InMemoryTransport`** — a
recording double records whatever it is handed and would pass even if the SDK rejected all nine
definitions, which is the one question Step 1 of this task exists to answer.*

- **14.80** ✅ `allTools` yields **exactly the nine**, in a stable order, each named once and each
  described. A tool dropped from either half disappears from the assistant's world silently — there is
  no error, the capability simply stops existing. — (`packages/mcp-server/test/register.test.ts`)
  *Mutation: drop one write tool → 14.80 and 14.81 both fail.*
- **14.81** ✅ A **real `McpServer`** accepts all nine and a **real client** lists them, each with a
  description and an object input schema. — (`packages/mcp-server/test/register.test.ts`)
- **14.82** ✅ The **empty raw shape** (`list_workspaces`) and the **imported `.strict()` FilterSpec**
  (`search_tickets`) both survive into real JSON Schema — `{type:'object',properties:{}}` rather than no
  schema at all, and `additionalProperties: false` three levels deep. The second is the proof that the
  SDK walked the SAME zod instance `@gisik-nokma/domain` built the schema with; two copies of zod in the
  tree would misclassify it and it would be absent. — (`packages/mcp-server/test/register.test.ts`)
- **14.83** ✅ The SDK **enforces** that schema **before the handler runs**: a call missing a required
  argument is refused with the SDK's own `-32602` invalid-params answer and the handler is never
  reached. — (`packages/mcp-server/test/register.test.ts`)
  *This case was written asserting only `toContain('ticketId')` and, measured, **could not fail**:
  every handler re-parses its own arguments, so registering all nine with `inputSchema: {}` still
  refused the call and still named `ticketId` — from inside the handler, with the SDK validating
  nothing. Anchored on `-32602`, which only the schema reaching the SDK can produce, the same mutation
  kills it.*
- **14.84** ✅ A handler's answer comes back as MCP **text content** carrying the body unchanged. —
  (`packages/mcp-server/test/register.test.ts`)
- **14.85** ✅ A rule-engine refusal returns `isError: true` with the rule and the reason **VERBATIM** —
  asserted with full string equality, not `toContain`, because the failure being guarded is a reworded
  or truncated refusal and a truncation that keeps the prefix passes `toContain`. —
  (`packages/mcp-server/test/register.test.ts`)
  *Mutations: reword the message → fails; truncate it to 24 characters → fails.*
- **14.86** ✅ A throw that is **not an `Error`** still arrives as its own text rather than
  `[object Object]`. — (`packages/mcp-server/test/register.test.ts`)
- **14.87** ✅ **The handshake does not wait on a credential.** `initialize` and `tools/list` both
  complete with zero logins; the FIRST TOOL CALL authenticates, exactly once, and the call used is a
  WRITE — whose handler reads `session.userId()` synchronously while building the envelope, so this
  only passes if `registerTools` awaited `ready()` before dispatching. —
  (`packages/mcp-server/test/register.test.ts`)
  *Mutations: authenticate eagerly in `lazySession` → fails; drop the `await session.ready()` in
  `registerTools` → fails.*
- **14.88** ✅ **Nothing on the tool path writes to STDOUT** — registration, all nine handlers, and the
  login prompt `main.ts` installs, with `process.stdout.write` recorded. stdout IS the transport: one
  stray line lands in the middle of the JSON-RPC stream and the client answers with a parse error
  instead of a tool result. The prompt goes to stderr and names both the verification URI and the user
  code. — (`packages/mcp-server/test/register.test.ts`)
  *Mutation: point `stderrLoginPrompt` at stdout → fails. The prompt is called through the SAME
  binding `main.ts` uses, so this covers the wiring rather than a re-creation of it.*
- **14.88b** ✅ `createLoginPrompt` writes **one** chunk naming both halves of the instruction. —
  (`packages/mcp-server/test/register.test.ts`)

> ### The plan's `main.ts` would never have answered `initialize`
>
> Its ordering was `await createSession(...)` and then `server.connect(...)`. `createSession`
> authenticates EAGERLY, and `readCachedToken` returns `null` on a fresh install — so that await runs
> the device flow and blocks for up to its ten-minute deadline before the transport exists. The person
> is never told, because the prompt goes to stderr, which for a stdio server is a log file nobody is
> reading; the client sees a server that failed to start. That is the whole "how a person installs it"
> story, broken by a line order.
>
> Measured, not argued. Against a stub gisik-nokma that mints a device code and never approves it —
> the ordinary first run — the BUILT `dist/main.js` was driven by a real MCP client over a real child
> process:
>
> | ordering | outcome | HTTP requests during the window |
> |---|---|---|
> | as shipped (connect first) | `initialize` answered in **107 ms**, 9 tools listed | **none** |
> | the plan's (authenticate first) | **timed out at 8 s, `initialize` never answered** | `/v1/mcp/device/code`, `/v1/mcp/device/token` |
>
> `lazy-session.ts` is the fix: the transport connects immediately and the credential is fetched on the
> first tool call. `registerTools` awaits `ready()` before dispatching, which is what keeps
> `session.userId()` — synchronous, and the source of every write's `actorId` — safe inside a handler.

> ### Step 6, driven end to end against the live compose stack
>
> Real magic-link sign-in; the BUILT `dist/main.js` launched as a child process by a real MCP client;
> `initialize` answered with nine tools and **no credential**; the first tool call printing to stderr
>
>     gisik-nokma needs you to approve this assistant.
>       1. Open http://localhost:3001/mcp/authorize
>       2. Enter the code 57XK-2HCW
>
> `POST /v1/mcp/device/approve` → `200 {"approved":true}`, and the waiting `list_workspaces` completing
> with Convenience Corner and its one project. Then, verbatim:
>
> | call | answer |
> |---|---|
> | `create_ticket` | `committed`, `seq 1`, ticket `01M1YPTE147N7MCHNHM3JRVG5G` |
> | `add_comment` | `committed`, `seq 2` |
> | `transition_ticket … to: "no-such-state"` | `refused by unknown-state: The workflow "Errand with waits" has no state "no-such-state".` |
> | `get_ticket` on a ticket the owner cannot see | `gisik-nokma answered 404` |
>
> And the point of the whole plan, read back out of the ledger itself:
>
>     seq |      type      | origin |          actor_id
>     -----+----------------+--------+----------------------------
>        1 | ticket.created | mcp    | 01M1V02CWM3G3SADCCRC40JQ42
>        2 | comment.added  | mcp    | 01M1V02CWM3G3SADCCRC40JQ42
>
> workspace-wide: `web 123 · server 6 · mcp 2`. `mcp_tokens.last_used` was written, as its column
> comment claims.
>
> **The first attempt refused every write**, and that is worth keeping. The container then running
> predated Task 0, so its `ORIGINS` had four members and each write came back
> `malformed-envelope: … at origin: Invalid enum value. Expected 'web' | 'mobile' | 'desktop' |
> 'server', received 'mcp'`. Nothing was wrong with this task; the stack was a version behind. It is the
> sharpest available proof that Task 0 is load-bearing rather than bookkeeping — without it every write
> tool is dead at the door — and the refusal reached the assistant word for word through server, HTTP
> client, `submitOne` and `registerTools`, which is case 14.85's property demonstrated in production
> rather than in a test. `docker compose -f docker-compose.dev.yml up -d --build --wait server` fixed
> it, exactly as the plan's Step 6 says to run it.

## Task 12 — the revoke surface (`apps/server/src/routes/mcp-tokens.ts`, `apps/web/app/mcp/tokens/`)

*Owner ruling 5, and the one that went against the plan's default. The plan had settled for no UI —
granted in two clicks, withdrawn only by somebody with a `psql` prompt — and flagged the asymmetry as
"something a person should agree to knowingly". Every token in these cases is minted through the REAL
device flow rather than inserted: a row the test wrote itself would prove the list can read rows the
test wrote, not that it shows the credential the CLI is holding.*

- **14.90** ✅ `GET /v1/me/mcp-tokens` lists the caller's tokens and **never the credential itself** —
  the id is `sha256(token)` in hex, and the whole response is asserted not to contain the raw token
  the device flow just issued. — (`apps/server/test/mcp/mcp-tokens.test.ts`)
- **14.91** ✅ The list is the caller's own: two people, two real tokens, **disjoint in both
  directions** — one direction alone passes for a list that returns everything to one caller and
  nothing to the other. — (`apps/server/test/mcp/mcp-tokens.test.ts`)
  *Mutation: drop `WHERE user_id = $1` from the list query → 14.90, 14.91, 14.93, 14.94 and 14.95 all
  fail.*
- **14.92** ✅ The list needs a session, and answers the product-wide `unauthenticated` body. —
  (`apps/server/test/mcp/mcp-tokens.test.ts`)
- **14.93** ✅ Revoking **ends access at the next request** — the raw token authenticates a real route
  before the revoke and is refused 401 after it, with the control asserted first so a route that never
  authenticated anything could not pass. A case that only checked the list had gone empty would pass on
  a delete some other code path still honoured. — (`apps/server/test/mcp/mcp-tokens.test.ts`)
- **14.94** ✅ The **same 404, byte for byte**, for somebody else's real token id and for an id that
  names nothing — `expect(notMine.body).toBe(nowhere.body)`, because any difference between them is an
  oracle for which token hashes exist. And the refusal was a refusal: the other person's token
  survives. — (`apps/server/test/mcp/mcp-tokens.test.ts`)
  *Mutations: drop `AND user_id = $2` from the DELETE → 14.93, 14.94, 14.95 fail. Return 204 when the
  delete matched nothing → 14.94 fails.*
- **14.95** ✅ `/v1/me/mcp-tokens/:id` is CSRF-protected: a cookie-carrying forged-`Origin` DELETE is
  refused 403 `forbidden_origin`, with the honest bearer DELETE succeeding as the control — without
  which a route that 403'd everything would pass. — (`apps/server/test/mcp/mcp-tokens.test.ts`)
- **14.96** ✅ Signed out, the screen offers a sign-in that lands back on `/mcp/tokens` and **asks the
  server nothing** — asserted on the recorded calls, because a signed-out page that still fired the
  request would 401 and look identical. **The route also carries the app nav (E5-17, 2026-09-21):** it
  rendered no `AppNav`, nothing in `apps/web/app` or `apps/web/src` linked to it, and this case's own
  `?next=` behaviour sends a signed-out person BACK here after sign-in — so the one route a reader could
  reach only by typing was also the only one with no bar and no way out. The route is KEPT rather than
  redirected to `/account#connected-assistants`, per the page's own docblock ("the owner named
  `/settings` as where the tab should live, not that this URL should stop resolving"). — (`apps/web/test/mcp-tokens-page.test.tsx`)
- **14.97** ✅ The row names the approval date in the product's timezone and the page **never prints
  the id**; the empty state names the connect page. —
  (`apps/web/test/mcp-tokens-page.test.tsx`)
  *Mutation: print `token.id` in the row → fails.*
- **14.98** ✅ Revoking sends `DELETE /v1/me/mcp-tokens/<that row's id>` and **reloads the list from the
  server** rather than splicing it locally. — (`apps/web/test/mcp-tokens-page.test.tsx`)
- **14.99** ✅ A 404 on revoke is reported as "already gone" — the only thing true of both meanings the
  server deliberately refuses to distinguish — with `role="alert"`, and the list is re-read. —
  (`apps/web/test/mcp-tokens-page.test.tsx`)
- **14.102** ✅ `lastUsedAt` is **null until the token is used** and an instant after — driven through
  the real PAT path, which is what writes the column. A token minted and never used has no last use,
  and inventing one would make a forgotten connection look active in the one column a person reads
  before revoking. — (`apps/server/test/mcp/mcp-tokens.test.ts`)
- **14.103** ✅ The screen says **"Never used"** for one and names the day for the other, asserted in
  ONE case with both rows present — either half alone passes for a component that renders one string
  unconditionally. — (`apps/web/test/mcp-tokens-page.test.tsx`)

> ### The CSRF control could not see a DELETE
>
> `httpOriginRefused` opened with `if (input.method !== 'POST') return false;` under a comment reading
> "Mutations only". Every route in `HTTP_ORIGIN_PROTECTED_ROUTES` happened to be a POST, so the control
> looked complete while being **unable to protect a PUT, a PATCH or a DELETE that had been added to the
> set** — a hole with no symptom, in the one control this repo describes as "not defence in depth here,
> it is the defence".
>
> It was found the only way it could be: adding `DELETE /v1/me/mcp-tokens/:id` to the set and watching
> the forged-`Origin` request sail past the hook to `requireSession`, which answered **401** — a
> refusal, for entirely the wrong reason, that reads as a pass to anyone checking that the request was
> rejected. Widened to all four mutating methods; it admits nothing that was previously refused,
> because all eight pre-existing routes are POST-only.
>
> `security-middleware.test.ts`'s `PROTECTED` table gained a **method column** for the same reason: a
> table that cannot express a non-POST route cannot catch that hole. Its own drift guard (13.116) is
> what forced the new row to exist at all — protecting a route without adding a row reddens it.

> ### Two more checks that could not fail, both found by mutation
>
> **14.98** rendered ONE token, so `tokens[0].id` and the clicked row's id were the same string: a
> handler that always revoked the first token passed, and the `not.toContain(OTHER)` guard was vacuous
> because `OTHER` appeared in no list. Now two rows, and the second is the one revoked.
>
> **14.97** asserted the rendered day — "8 Sept 2026", which is the 7th in UTC — and claimed that pinned
> `Asia/Kolkata`. It did not. **This runner is already in IST**, so deleting the forced timezone left
> the case green. The `toLocaleDateString` options object is now asserted too, which is falsifiable
> wherever it runs.

> ### The fenced sub-question, its stale premise, and the ruling
>
> The plan reserved one question for the owner: **should the list show when each token was last used?**
> It records the honest cost — *"it is a log of when a person's assistant acted on their behalf, kept
> per token"* — and says it is "not in Task 2's schema today".
>
> **It is.** `mcp_tokens.last_used` exists, and `resolveMcpToken` writes it on **every** successful
> resolution (`UPDATE mcp_tokens SET last_used = $2 … RETURNING user_id`); the live end-to-end run in
> Task 10 observed it being written. So the recording half was decided and shipped in Task 2, and what
> was ever open is only whether the product **surfaces** it — a much smaller question than the plan
> priced, and the reason for surfacing the difference rather than deciding it.
>
> **Built without it first, then added on the owner's ruling (2026-09-08).** Cases 14.100 and 14.101
> cover it. Declaring the new `textMuted` on `surfaceSunken` combination in `CONTRAST_PAIRS` was part
> of the change: that list is self-declared enforcement, so a pair nobody lists is a pair nobody
> checks, and shipping a new fg-on-bg without its row is the gap rather than a formality.

## The revoke screen's READ: a failure is not an empty account — case `14.150` (E2-44, 2026-09-21)

**The id is `14.150`, taken as part of B09's `14.150`–`14.159` block rather than from the tip** — the
allocation is recorded in this file's header above. It was first minted as `14.113`, the tip of §14 as the
tree showed it (`14.112`), and moved here for the reason that header gives: the same tip-minting rule had
already collided twice on 2026-09-21 (§10's `10.90`, §13's `13.1050`–`13.1051`), so this lane took a block
clear of every live tip instead. Measured across ALL remote branches rather than one, §14's occupied
ordinals ran to `14.113`.

**The defect.** `McpTokensScreen`'s loader is `http.get('/v1/me/mcp-tokens').then(ok, () => setTokens([]))`.
`[]` is not a neutral value here — it is exactly what the empty arm asserts over: *"No assistants are
connected. One appears here after you approve it on the connect page."* A 500, a dropped connection or an
unparseable body was therefore drawn as a confident statement about the person's account, on the one screen
whose whole subject is which assistants still hold access, and the sentence it printed sent them to approve
a second assistant they did not need.

- **14.150** ✅ A rejected read renders a failure sentence and NEITHER the empty state nor the list —
  asserted on the pair, because the absence is the half that matters: a screen rendering both would pass an
  assertion on the sentence alone. A second case is the control, and it is what stops the fix from
  over-reaching: an **answered** empty list still renders the empty state, so "no assistants" stays
  reachable rather than being traded for a sentence that is never true. —
  (`apps/web/test/mcp-tokens-page.test.tsx`)

**The sentence carries the server's own words when it sent any** (`refusalText(cause.body)`, the same narrowing
`revoke` and the rename path already use), and otherwise says what is true — that the read did not come back,
that the list is unknown rather than empty, and the one recovery there is.

## 14.2 Hosted MCP — storage

*Remote-MCP plan (`docs/superpowers/plans/2026-09-30-remote-mcp-server.md`) Task 1, block 14.200–14.299. Tests: `apps/server/test/mcp/oauth-store.test.ts`.*

- ✅ **14.200 — the migration adds five tables and three `mcp_tokens` columns, and every EXISTING token row reads `kind='local'`, `expires_at NULL`, `connection_id NULL`;** control: a device-flow token minted after the migration still authenticates `/v1/me/workspaces` with no expiry. Mutation: default `kind` to `'hosted'`.
- ✅ **14.201 — a hosted access token past `expires_at` is refused by `requireSession` (401), a live one resolves to its owner;** control: a LOCAL token with `expires_at NULL` resolves at any `now`. Mutation: drop the `expires_at` clause from `resolveMcpToken`.
- ✅ **14.202 — resolving a hosted token stamps its CONNECTION's `last_used`;** control: resolving a local token stamps only `mcp_tokens.last_used`. Mutation: remove the connection update.
- ✅ **14.203 — a code is single-use and dies after 60 s:** `takeCode` returns the row once, `null` the second time, and `null` at `now + 61 s`;** control: at `now + 59 s` the first take succeeds. Mutation: `SELECT` instead of `DELETE … RETURNING`.
- ✅ **14.204 — refresh rotation: `useRefreshToken` succeeds once; presenting the same token again returns `reused` AND deletes the connection with its access tokens;** control: a fresh refresh token issued by the first use still works. Mutation: skip the connection delete on reuse.
- ✅ **14.205 — a connection past `idle_expires_at` refuses refresh (`expired`) and is deleted; a successful refresh slides `idle_expires_at` to `now + 90 d`;** control: at `now + 89 d` refresh succeeds. Mutation: do not slide the window.
- ✅ **14.206 — `sweepStaleClients` deletes a 31-day-old client with no connection and no pending row, and keeps one with a live connection;** control: a 29-day-old unused client survives. Mutation: ignore connections in the sweep.
- ✅ **14.207 — nothing raw is stored:** after `mintCode` + `issueTokens`, no column of `oauth_codes`, `mcp_tokens` or `oauth_refresh_tokens` contains the raw code, access or refresh token;** control: each table holds `hashCredential(raw)`. Mutation: store the raw refresh token.
- ✅ **14.208 — `listMcpTokens` returns local tokens only; hosted access tokens never appear there;** control: a local token still lists with its name. Mutation: drop `WHERE kind = 'local'`.
- ✅ **14.209 — every new table has a purge rule (`not-entity-bearing`)** — the existing guard `table-rules.test.ts` fails without them;** control: the guard's count of ruled tables rises by exactly five. Mutation: remove `oauth_connections` from `table-rules.ts`.

## 14.7 Hosted MCP — one tool code path (hosted remote MCP plan, Task 6; block `14.200`–`14.299`)

The hosted `/mcp` route runs the SAME nine tools as the stdio server, from the same package, over an in-process
`fetch` that calls the API's own routes. This section is the seam that makes that true; the route itself is
Task 7. Ids come from the plan's block `14.200`–`14.299` (`docs/superpowers/plans/2026-09-30-remote-mcp-server.md`).

- ✅ **14.250 — `@gisik-nokma/mcp-server` exports `registerTools`, `allTools` and `lazySession`, and `allTools` still yields the nine tools in their pinned order;** control: the same `it` reads the nine names in order. Mutation: drop `registerTools` from the index. — (`packages/mcp-server/test/exports.test.ts`)
- ✅ **14.251 — `inProcessFetch` turns a `fetch('http://in-process/v1/me/workspaces', { headers: { authorization } })` into `app.inject` and returns a real `Response` with the route's status, JSON body and headers;** control: a 404 route comes back as a 404 `Response` (not a throw) and a call with no credential comes back 401. Mutation: always return status 200. — (`apps/server/test/mcp/in-process-fetch.test.ts`)
- ✅ **14.252 — the in-process request carries the OUTER caller's `remoteAddress` and `x-forwarded-for` (FD7): the rate-limit key seen by the events route is the outer key, not `127.0.0.1`;** control: two different outer callers land in two buckets and the same caller spends its own. Mutation: omit `remoteAddress` from `inject` (and, for the `trustProxy` case, omit the `x-forwarded-for` header). — (`apps/server/test/mcp/in-process-fetch.test.ts`)
- ✅ **14.253 — a tool run through `hostedSession` writes an event with `origin: 'mcp'` and `actorId` = the token's owner;** control: a read tool returns the same JSON the REST route returns. Mutation: build the session with a different `userId`. — (`apps/server/test/mcp/in-process-fetch.test.ts`)
- 🧪 **14.254 — the server's build includes the package: `pnpm turbo run build --filter=@gisik-nokma/server...` builds `@gisik-nokma/mcp-server` first, and `apps/server/Dockerfile` needs no change (its manifest COPY already lists `packages/mcp-server/package.json`, line 44);** control: `pnpm deploy --prod --filter=@gisik-nokma/server <dir>` leaves `<dir>/node_modules/@gisik-nokma/mcp-server/dist/index.js`, and `import('@gisik-nokma/mcp-server')` from `<dir>` yields `registerTools` and `allTools` (and `@modelcontextprotocol/sdk/server/mcp.js` and `…/webStandardStreamableHttp.js` import from the same `<dir>`, which Task 7 needs). Mutation: remove the workspace dependency. — build check, not a vitest case. **Measured 2026-09-30 by the controller at `d563588f`:** `pnpm turbo run build --force --filter=@gisik-nokma/server...` 7/7 tasks, `mcp-server` built before `server`; `pnpm deploy --prod` left `node_modules/@gisik-nokma/{domain,mcp-server,rule-engine}` with `mcp-server/dist/index.js` and `node_modules/@modelcontextprotocol/sdk`; the import yielded twelve functions including both named above; with the `@gisik-nokma/mcp-server` line deleted from `apps/server/package.json` the deploy carried only `domain` and `rule-engine` (red). The Dockerfile's manifest COPY of `packages/mcp-server/package.json` is at line 44 unchanged. The real image is built by `ctl rebuild` / the deploy; this is the bundle, not a container run.

## 14.3 Hosted MCP — metadata and registration

*Remote-MCP plan Task 2 (14.210–14.219). Tests: `apps/server/test/mcp/oauth-metadata.test.ts`; the config half of 14.210 in `apps/server/test/config.test.ts`.*

- ✅ **14.210 — with `MCP_PUBLIC_URL` unset, `/mcp`, `/oauth/register` and `/.well-known/oauth-authorization-server` are 404 (the hosted door does not exist);** control: set, the metadata answers 200. Mutation: register the plugin unconditionally.
- ✅ **14.211 — `GET /.well-known/oauth-authorization-server` lists issuer = `MCP_PUBLIC_URL`, the authorize/token/register/revoke endpoints under it, `code_challenge_methods_supported: ["S256"]`, `grant_types_supported: ["authorization_code","refresh_token"]`, `token_endpoint_auth_methods_supported: ["none"]`, `response_types_supported: ["code"]`, `scopes_supported: ["gisik:act"]`;** control: no `plain` anywhere in the document. Mutation: add `"plain"` to the challenge methods.
- ✅ **14.212 — protected-resource metadata is served at BOTH `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`, naming `resource: <public>/mcp` and `authorization_servers: [<public>]`;** control: the two documents are identical. Mutation: serve only the root one.
- ✅ **14.213 — `POST /oauth/register` with `redirect_uris: ["https://claude.ai/api/mcp/auth_callback"]` and `client_name: "Claude"` answers 201 with a `client_id`, `token_endpoint_auth_method: "none"`, and NO `client_secret`;** control: the stored row carries the name and the exact URI. Mutation: return a client secret.
- ✅ **14.214 — registration refuses a non-https, non-loopback redirect (`http://evil.example/cb`) with 400 `invalid_redirect_uri`;** control: `http://127.0.0.1:33418/callback` and `http://localhost:6274/cb` are accepted. Mutation: accept any `http:` URI.
- ✅ **14.215 — registration refuses a redirect with a fragment or userinfo (`https://a.example/cb#x`, `https://u:p@a.example/cb`) and an empty `redirect_uris`;** control: a query string is allowed (`https://chatgpt.com/cb?x=1`). Mutation: drop the fragment check.
- ✅ **14.216 — registration is charged to the MCP rate-limit bucket: the (mcpMax+1)-th registration from one client key in a window answers 429;** control: a different client key still registers. Mutation: remove `/oauth/register` from the bucket.
- ✅ **14.217 — `client_name` is trimmed to 60 characters and a missing name stores the redirect host;** control: a 20-character name is stored as given. Mutation: store the raw 500-character name.
- ✅ **14.218 — registering sweeps stale clients (Task 1's rule) — a 31-day-old unused client is gone after the next registration;** control: the new client exists. Mutation: never call the sweep.
- ✅ **14.219 — a hosted-door request never reaches better-auth's catch-all: `/oauth/token` and `/.well-known/*` are their own routes, not `/api/auth/*`;** control: `/api/auth/get-session` still answers. Mutation: mount the routes under `/api/auth`.

- ✅ **14.237 — registration refuses a `redirect_uris` list with a non-string entry (`["https://claude.ai/api/mcp/auth_callback", 5]`) with 400 `invalid_redirect_uri` — the good entry is NOT registered on its own;** control: the same list without the `5` registers. Mutation: drop the `uris.length !== given.length` clause (a review survivor of Task 2).
- ✅ **14.238 — registration allows at most 10 redirect URIs (11 → 400 `invalid_redirect_uri`, no client stored);** control: exactly 10 registers. Mutation: remove the count bound.
- ✅ **14.239 — each redirect URI may be at most 2048 characters (2049 → 400 `invalid_redirect_uri`);** control: exactly 2048 registers. Mutation: remove the length bound.

## 14.6 Hosted MCP — tokens and revocation

*Remote-MCP plan Task 5 (14.240–14.249). Tests: `apps/server/test/mcp/oauth-token.test.ts`, `pkce.test.ts`. Landed BEFORE Task 3 on the controller's ordering, so its `consent()` helper (now shared, in `apps/server/test/helpers/oauth.ts`) mints the code through the store (`mintCode`) rather than through `/oauth/authorize` + the decision route; **14.247's pending-consent half needs Task 3 and its case flips there** (the code half is already asserted in `oauth-token.test.ts`).*

- ✅ **14.240 — `authorization_code` with the right verifier, client and redirect returns an access + refresh token (`expires_in: 3600`, `token_type: "Bearer"`, `scope: "gisik:act"`, `cache-control: no-store`), and the access token authenticates `GET /v1/me/workspaces` as the consenting person;** control: the response has no `id_token`. Mutation: return `expires_in: 86400`.
- ✅ **14.241 — a wrong `code_verifier` is `invalid_grant` and the code is burnt (a retry with the right verifier also fails);** control: the right verifier on a fresh code succeeds. Mutation: skip `verifyPkceS256`.
- ✅ **14.242 — the code is bound to its client and redirect: another client's id, or a different registered redirect, is `invalid_grant`;** control: the matching pair succeeds. Mutation: ignore `redirect_uri` at the token endpoint.
- ✅ **14.243 — the code is single-use: a second exchange is `invalid_grant`;** control: the first exchange succeeded. Mutation: `getCode` instead of `takeCode`.
- ✅ **14.244 — `refresh_token` returns a NEW access + refresh token, and the old refresh token is dead;** control: the new access token authenticates. Mutation: return the same refresh token.
- ✅ **14.245 — presenting a used refresh token revokes the whole connection: its latest access token stops authenticating (401) and its latest refresh token is refused;** control: another connection of the same person is untouched. Mutation: skip the family revoke.
- ✅ **14.246 — two concurrent refreshes with the same token: exactly one succeeds; the other is treated as reuse and the connection is gone;** control: a single refresh succeeds. Mutation: a read-then-write refresh (SELECT used_at, then UPDATE). *(Review Focus 2)*
- ✅ **14.247 — a pending consent and a minted code survive an app restart (a second `buildOAuthApp` on the same database completes the exchange);** control: the same exchange on the first app also works. Mutation: keep pending rows in a `Map`. *(Review Focus 5)*
- ✅ **14.248 — `/oauth/revoke` with an access OR refresh token deletes the connection (both stop working) and answers 200; an unknown token also answers 200;** control: a different connection keeps working. Mutation: revoke only the presented access token.
- ✅ **14.249 — the token endpoint accepts `application/x-www-form-urlencoded` (what OAuth clients send) and JSON; an unknown `grant_type` is `unsupported_grant_type`;** control: the same exchange in both encodings yields a token. Mutation: accept JSON only.
- ✅ **14.255 — `verifyPkceS256` refuses a verifier shorter than 43 or longer than 128 characters, or with a character outside the RFC 7636 unreserved set, even when that verifier's OWN S256 challenge is presented;** control: 43 and 128 characters are accepted. Mutation: delete the `/^[A-Za-z0-9._~-]{43,128}$/` test line. *(A survivor of Task 5's review.)*
- ✅ **14.256 — `/oauth/token` and `/oauth/revoke` are each charged to the MCP rate-limit bucket (`mcpMax: 2` → the third call from one client is 429);** control: another client key is not limited. Mutations: drop `/oauth/token` from the bucket condition in `app.ts`; drop `/oauth/revoke` from it. *(A survivor of Task 5's review.)*
- ✅ **14.257 — a refresh whose new token pair cannot be issued (a trigger rejects the insert) answers 500 and leaves the old refresh token UNUSED — the transaction rolled back;** control: with the fault removed the same token refreshes (200) and authenticates. Mutation: delete the `BEGIN`/`COMMIT` around the refresh in `routes/mcp-oauth.ts`. *(A survivor of Task 5's review.)*
- ✅ **14.258 — `GET /oauth/authorize` is charged to the MCP rate-limit bucket (`mcpMax: 2` → the third call from one client is 429 and writes no pending row);** control: another client key is not limited. Mutation: drop `/oauth/authorize` from the bucket condition in `app.ts`.

## 14.4 Hosted MCP — authorize and consent API

*Remote-MCP plan Task 3 (14.220–14.229; 14.237–14.239 sit in §14.3). Tests: `apps/server/test/mcp/oauth-authorize.test.ts`, `test/http/security-middleware.test.ts` (row for the decision route).*

- ✅ **14.220 — a valid authorize request 302s to `${WEB_ORIGIN}/mcp/connect?request=req_…` and stores a pending row with the challenge, redirect and state;** control: the pending row expires 10 minutes after `now`. Mutation: redirect to the API's own host.
- ✅ **14.221 — PKCE is required: `code_challenge_method=plain` and a missing `code_challenge` are refused (302 to the client with `error=invalid_request`), no pending row;** control: `S256` with a 43-char challenge is accepted. Mutation: accept `plain`.
- ✅ **14.222 — the redirect must equal a registered one EXACTLY: a trailing slash, a different case in the path, or an extra query parameter is refused with a 400 JSON error and NO redirect;** control: the exact string is accepted. Mutation: compare after `new URL().href` normalisation.
- ✅ **14.223 — an unknown `client_id` is a 400 JSON error, never a redirect;** control: a known client proceeds. Mutation: redirect to the supplied `redirect_uri` on an unknown client.
- ✅ **14.224 — `GET /v1/mcp/oauth/requests/:id` returns the client's name AND the redirect host (`claude.ai`) to the signed-in person, 401 signed out, 404 for an expired request (the pending row is still in the table, only past `expires_at`);** control: a live request answers 200. Mutations: omit `redirectHost`; make `getPending` ignore `expires_at` (a review survivor).
- ✅ **14.225 — Allow mints a code for the SIGNED-IN person and answers `redirectTo = <redirect_uri>?code=…&state=<state>`; Deny answers `redirectTo = <redirect_uri>?error=access_denied&state=<state>` and mints nothing;** control: a redirect that already has a query keeps it (`…cb?x=1&code=…`). Mutation: drop `state`.
- ✅ **14.226 — a request is answered once: a second decision (either way) is 409 `already_answered`, and no second code exists;** control: the first decision was 200. Mutation: read the pending row with `getPending` instead of `takePending`.
- ✅ **14.227 — the decision refuses a cookie POST whose `Origin` is not `WEB_ORIGIN` (403 via the HTTP-Origin hook);** control: the same POST with `Origin: WEB_ORIGIN` passes the hook. Mutation: remove the route from `HTTP_ORIGIN_PROTECTED_ROUTES`.
- ✅ **14.228 — an MCP token (local) cannot decide a consent (403 `mcp_token_may_not_decide`), and the request stays answerable;** control: a better-auth session can. Mutation: drop the `authKind` fence.
- ✅ **14.229 — `response_type` other than `code` and a `scope` other than `gisik:act` are handled: `token` → `error=unsupported_response_type`; `admin` → `error=invalid_scope`;** control: an absent scope is accepted as `gisik:act`. Mutation: accept any scope.

## 14.5 Hosted MCP — the consent page

*Remote-MCP plan Task 4 (14.230–14.236); centring, owner 2026-09-30 (14.283–14.286). Tests: `apps/web/test/mcp-connect-page.test.tsx`, `apps/web/test/mcp-connect-centring.test.tsx`, `apps/web/test/next-config.test.ts`.*

- ✅ **14.230 — signed out, `/mcp/connect?request=req_x` shows a Sign in link to `/sign-in?next=%2Fmcp%2Fconnect%3Frequest%3Dreq_x` and no Allow button;** control: signed in, Allow appears. Mutation: link to `/sign-in` without `next`.
- ✅ **14.231 — signed in, the page shows the consent copy verbatim with the app name AND the redirect host from the API;** control: a different name/host pair renders its own values. Mutation: drop the host.
- ✅ **14.232 — Allow POSTs `{ allow: true }` to the decision route and navigates to the returned `redirectTo` (`window.location.assign`);** control: the button is disabled while the POST is in flight (no double submit) and nothing navigates before it resolves. Mutation: navigate before the POST resolves.
- ✅ **14.233 — Deny POSTs `{ allow: false }` and navigates to the returned `redirectTo`;** control: Allow is not called. Mutation: Deny posts `allow: true`.
- ✅ **14.234 — a 404 request shows "This connection request has expired. Go back to your assistant and connect again." and no buttons; a 409 shows the server's message verbatim;** control: a live request shows buttons. Mutation: render the buttons on 404.
- ✅ **14.235 — Allow is the page's ONE primary button; Deny is the quiet (ghost) Button;** control: both are real `<button>`s with accessible names "Allow" and "Deny". Mutation: make Deny primary.
- ✅ **14.236 — the page is not frameable: `next.config.ts` headers for `/:path*` (which covers `/mcp/connect`) include `x-frame-options: DENY` (FD4);** control: the pattern matches `/mcp/connect?request=x`. Mutation: scope the header to `/workspaces/:path*`.
- ✅ **14.283 — `/mcp/connect` is a full-height column (`min-height: 100dvh`, flex) whose single child, the stage (title + card), centres itself with `margin: auto` at `max-width: 34rem` — auto margins, not `justify-content: center`, so a stage taller than the viewport is top-aligned and scrolls instead of being clipped above the top edge;** control: Allow is still the page's ONE primary button. Mutation: drop `margin: auto`; drop `min-height: 100dvh`; put `justify-content` on the stage; widen the stage's `max-width`; rename the stage class in `page.tsx`. *(`apps/web/test/mcp-connect-centring.test.tsx`; CSS-source scan, jsdom has no layout — the pixels are 14.285.)*
- ✅ **14.284 — the page's vertical padding is symmetric longhands (`padding-top` = `padding-bottom`), so the stage centres on the VIEWPORT's middle rather than on `.gn-shell`'s 0/3rem box, and no `padding:` shorthand clobbers the phone's side gutter; the layout rules declare no colour (tokens only);** control: `.gn-shell`'s `@media (max-width: 60rem)` gutter rule is still there. Mutation: `padding-bottom: 3rem`; a `padding:` shorthand; a hex colour in either rule. *(same file)*
- 🟡 **14.285 — in a browser, at 1512px the card's centre is within 2px of the viewport's centre, on both axes, in hig / minimal / neo; at 390px the page has no horizontal overflow and the card is not clipped; in a viewport shorter than the card the card is top-aligned under the gutter and the page scrolls;** control: Allow is still the one primary. Mutation: remove the centring rule (the card returns to x≈136–680 of 1512). *(measured by hand; no automated test)* *Measured 2026-10-01, dev stack @ e4e92f77: the card's offsets from the viewport centre are 0/0 in six style × theme combinations at 1512px and at a real 390×800 viewport; no app nav (14.286). NOT measured: a viewport shorter than the card (top-aligned, page scrolls), horizontal overflow and clipping at 390 beyond the offsets, and the Allow-is-the-one-primary control.*
- ✅ **14.286 — the page renders no app nav: no `<nav>`, `<header>` or navigation/banner landmark (people arrive from an assistant for one decision);** control: the same render does show the "Connect an assistant" heading and Allow. Mutation: mount a `<nav>` in the page. *(same file)*

## 14.9 Hosted MCP — Connected assistants

*Remote-MCP plan Task 8 (14.270–14.277). Tests: `apps/server/test/mcp/mcp-connections.test.ts`, `test/http/security-middleware.test.ts` (row for the DELETE), `apps/web/test/mcp-tokens-page.test.tsx`.*

- ✅ **14.270 — `GET /v1/me/mcp-connections` lists the caller's LIVE hosted connections (name, redirect host, connected, last used) and none of another person's; a connection past its idle expiry is absent (the row is still in the table);** control: local tokens still list under `/v1/me/mcp-tokens`, hosted ones never do. Mutations: drop the `user_id` filter; drop the `idle_expires_at > now` filter (a review survivor).
- ✅ **14.271 — Disconnect (`DELETE /v1/me/mcp-connections/:id`) deletes the connection: its access token stops authenticating and its refresh token is `invalid_grant`;** control: another person's id answers 404 and their connection, access token and refresh token all survive. Mutation: revoke by id without the owner (`revokeConnection(…, null)`; a review survivor).
- ✅ **14.272 — the DELETE refuses a cookie request with a foreign Origin (403 `forbidden_origin`);** control: `Origin: WEB_ORIGIN` passes the hook. Mutation: remove the route from `HTTP_ORIGIN_PROTECTED_ROUTES`.
- ✅ **14.273 — `GET /v1/mcp/public-url` answers `{ url: "<MCP_PUBLIC_URL>/mcp" }` when the door is on and `{ url: null }` when off;** control: unauthenticated callers get the same answer. Mutation: return the web origin.
- ✅ **14.274 — the Connected assistants screen shows each hosted connection as "{app name} · {host}", "Connected {date}", "Last used {date}" or "Never used" and a **Disconnect** button; local tokens keep **Revoke**;** control: a person with neither sees the existing empty state. Mutation: label the hosted button Revoke. **Also:** with ZERO local tokens and a live hosted connection the screen must NOT say "No assistants are connected" (control in the same `it`: both lists empty does say it). Mutation: drop `&& connections.length === 0` from the empty-state condition.
- ✅ **14.275 — Disconnect removes the row only after the DELETE resolves and shows the server's reason on failure;** control: while in flight the row stays and its button reads "Disconnecting…". Mutation: remove the row before the DELETE resolves.
- ✅ **14.276 — the "Connect an assistant" panel shows the URL from `/v1/mcp/public-url` with a **Copy** button (writes it to the clipboard, then reads "Copied") and a "How to connect" link to the Help article;** control: with `url: null` the panel is absent. Mutation: hard-code the URL.
- ✅ **14.277 — the screen reads `/v1/me/mcp-connections` and `/v1/me/mcp-tokens` independently: a failure of one shows its own failure sentence and still renders the other;** control: both succeed → both lists. Mutation: make one failure fail both. **Also, both arrival orders:** a connections failure that lands AFTER the tokens read, and one that lands BEFORE it, each leave the token list rendered with no tokens-failed sentence. Mutation: the connections error arm also does `setTokens(null); setLoadFailed(true)`.


## 14.10 Hosted MCP — member help (hosted remote MCP plan, Task 9; block `14.200`–`14.299`)

*The manual's new "§16 — Connecting Claude or ChatGPT" (`docs/manual.md`). Tests: `packages/app-core/test/help/connecting-assistants.test.ts`; `pnpm check:help` guards its quoted strings and the freshness of the generated copy. The menu names for Claude and ChatGPT were checked on 2026-09-30 against the MCP project's "Connect to remote MCP servers" guide and OpenAI's ChatGPT developer-mode guide and are dated in the text.*

- ✅ **14.280 — the manual has a §16 "Connecting Claude or ChatGPT" with, per app, three numbered steps (where to add a connector, paste the URL, press Allow), how to disconnect (Connected assistants → Disconnect), and what a "reconnect" prompt means;** control: `pnpm check:help` exits 0 and §15 has no second three-step list. Mutation: change **Allow** to **Approve** in the Claude steps — caught by the section test's `allow` assertions, NOT by `pnpm check:help`, which checks quoted strings only and does not see bold button names (controller-measured 2026-09-30: the check stays green), so a wrong bold label is guarded only by the words the test names. — (`packages/app-core/test/help/connecting-assistants.test.ts`, `pnpm check:help`)
- ✅ **14.281 — the Help browser finds §16 by searching "ChatGPT" and "connector";** control: an existing §15 search still finds §15 and a term §16 does not contain does not find §16. Mutation: omit the generated file's regeneration. — (`packages/app-core/test/help/connecting-assistants.test.ts`)
- ✅ **14.282 — the "How to connect" link on Connected assistants lands on §16's anchor: its `href` is EXACTLY `/help#manual-16-connecting-claude-or-chatgpt`, derived in the web test from the generated manual's section id (`manual-${section.id}`, as the Help browser renders it);** control: the anchor is unique across the manual (`packages/app-core/test/help/connecting-assistants.test.ts`) and the section exists in `HELP_CONTENT`. Mutation: link `/help` without the anchor; link the old wrong anchor `/help#connecting-claude-or-chatgpt`. — (`apps/web/test/mcp-tokens-page.test.tsx` 14.276 for the link, `packages/app-core/test/help/connecting-assistants.test.ts` for the anchor)

## 14.8 Hosted MCP — the /mcp endpoint

*Remote-MCP plan Task 7 (14.260–14.269). Tests: `apps/server/test/mcp/mcp-http.test.ts`. Run LOCALLY (CI does not run on a dev PR). Every case runs the real `buildApp`, the real OAuth token exchange and the real nine tools over the API's own routes; nothing is stubbed.*

- ✅ **14.260 — no bearer → 401 with `WWW-Authenticate: Bearer resource_metadata="<public>/.well-known/oauth-protected-resource/mcp"`;** control: the same header on an expired token (one that authenticated a moment earlier). Mutation: answer 401 with no header.
- ✅ **14.261 — a local (device-flow) token is REFUSED at `/mcp` (401): the hosted door takes hosted tokens only;** control: the same token is accepted by the REST API, and a hosted token of the same person is accepted at `/mcp`. Mutation: accept any resolvable token. *(Keeps the two doors' credentials apart — a leaked local token cannot be pasted into a remote client.)*
- ✅ **14.262 — `initialize` then `tools/list` return the nine tools with their descriptions, as JSON (`enableJsonResponse`), and NO `mcp-session-id` header (stateless);** control: every tool carries a description. Mutation: set `sessionIdGenerator: () => randomUUID()`.
- ✅ **14.263 — `tools/call list_workspaces` returns the caller's workspaces (the same JSON as `GET /v1/me/workspaces`);** control: a second person sees their own (none). Mutation: build the session from a fixed user.
- ✅ **14.264 — `tools/call create_ticket` writes an event with `origin: 'mcp'`, `actorId` = the token's owner;** control: `transition_ticket` refused by the rule engine returns `isError: true` with the server's own reason text. Mutation: catch and reword the error.
- ✅ **14.265 — `Origin` present and not allowed (`https://evil.example`) → 403 before auth (even with a valid token); absent `Origin` (server-to-server connectors) and `https://claude.ai` are admitted;** control: `https://chatgpt.com` is admitted (reaches the 401). Mutation: skip the Origin check.
- ✅ **14.266 — a person removed from every workspace (R5 `membership.revoked`) with a live connection gets `list_workspaces` → `{ workspaces: [] }` and a write → the REST refusal, never data;** control: before removal the same calls return data. Mutation: cache the membership on the connection. *(Review Focus 3)*
- ✅ **14.267 — `GET /mcp` and `DELETE /mcp` → 405 with `Allow: POST`;** control: `POST` answers 200. Mutation: route GET to the transport.
- ✅ **14.268 — every tool call writes one log line `{ msg: 'mcp tool call', tool, outcome: 'ok'|'error', durationMs, userId }` and no token, argument value or result text;** control: the line exists for a failing call with `outcome: 'error'`. Mutation: log the arguments.
- ✅ **14.269 — `/mcp` is charged to the MCP rate-limit bucket keyed by the caller;** control: another caller (another `x-forwarded-for`) is unaffected. Mutation: leave `/mcp` unbucketed.

## 14.11 Hosted MCP — round trip

*Remote-MCP plan Task 10 (14.290–14.293). Tests: `apps/server/test/mcp/mcp-remote-e2e.test.ts`. Run LOCALLY (CI does not run on a dev PR). The consent is decided through the real decision route; nothing is stubbed. No product code changed — these are integration cases over Tasks 1–9, so their proof is the mutation, not a RED run.*

- ✅ **14.290 — one test drives the whole door as a client would: fetch protected-resource metadata → AS metadata → register → authorize (302 to `/mcp/connect`) → decision as a signed-in person → token → `initialize` → `tools/list` → `list_workspaces` → `create_ticket` → refresh → the old access token still works until expiry and the new one works → revoke → `/mcp` 401 with `WWW-Authenticate`;** control: the same person's web session still works after revoke. Mutation: have revoke delete the person's better-auth session.
- ✅ **14.291 — the request log over that whole run contains no raw code, access token, refresh token or `state` value (FD5: `redactRequestUrl` covers `code`, `state`, `access_token`, `refresh_token` in query strings, and bodies are not logged);** control: the log does contain the route names `/oauth/authorize`, `/oauth/token` and `/mcp`. Mutation: remove `state` from `CREDENTIAL_PARAMS`.
- ✅ **14.292 — the device flow still works end to end after all of this (stdio door unchanged, D2): mint → approve → token → `/v1/me/workspaces`;** control: the hosted door beside it works for the same person (and `require-session-pat.test.ts`'s 14.30 is green in the same run). Mutation: make `resolveMcpToken` require `kind='hosted'`.
- ✅ **14.293 — a hosted access token cannot approve or deny a device code or decide a consent (each 403), so a connected app cannot mint itself more access;** control: a web session can do all three on the very same codes and request. Mutation: drop any one `authKind` fence (approve, deny, decision — each run separately).
- ✅ **14.294 — the dev stack (`docker-compose.dev.yml`, server service) declares `MCP_PUBLIC_URL: "${MCP_PUBLIC_URL:-}"`: empty by default, so the hosted door is OFF on the dev stack exactly as in a deploy that has not set it, and the shell's value (`MCP_PUBLIC_URL=http://localhost:3000 ctl rebuild`) reaches `loadConfig` unchanged;** control: both halves in the same `it`, through the real `loadConfig`. Mutation: delete the key; hard-code the URL on; hard-code it empty (not switchable). *(`apps/server/test/deploy/compose-dev-contract.test.ts`; it also made 13.159 substitute compose's `${NAME:-default}` before calling `loadConfig`, which a declared-empty URL otherwise breaks.)*
