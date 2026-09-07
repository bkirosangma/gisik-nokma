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
