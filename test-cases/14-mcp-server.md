# 14. MCP server

The assistant-facing door onto gisik-nokma: an MCP server a person runs locally, authenticated as
themselves, whose writes are attributable in the ledger as an assistant's rather than a person's.

**Legend:** ✅ covered by a test · ❌ not yet · 🚫 out of scope, with a reason.

*Numbering starts at 14.1. This section was **reserved** by §15's header for
`docs/superpowers/plans/2026-09-07-mcp-server.md`, and the plan assigns the finished catalogue to its
**Task 11**. This file is opened early, by Task 1, because 14.1–14.3 are real passing cases the moment the
scaffold lands and a catalogue that omits shipped tests is out of sync with the tree — the workspace
convention is that `test-cases/` moves in the SAME change set as the code. Task 11 continues from this
file's then-highest id rather than renumbering, exactly as §13 records doing for its own reservation gap.*

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
