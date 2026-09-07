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
