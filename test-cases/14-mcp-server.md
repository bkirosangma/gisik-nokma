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
