# Release 2026-09-22 — progress ledger (one line per batch claim and per task; appended by the driver, travels in each batch PR)

Read `docs/lanes/release-2026-09-22-plan.md` §0 first. Statuses: `claimed` (batch), `done`, `skipped`, `blocked`, `needs-owner`. Never rewrite a line; append.

| id | status | when / sha | note |
|---|---|---|---|
| B09 | claimed | 2026-09-21 19:57 | /Users/kiro/my_projects/gisik-nokma-ds5 |
| T-E2-20 | done | 0bbb5d66 | 13.1050/13.1051 (ticket-types.test.tsx) — rejected read renders the load-error sentence, not Loading for ever |
| T-E2-39 | done | 50f48409 | 10.90/10.91 (screens.test.tsx) — failed roster read is a load failure, guest refusal still degrades; two mutation controls |
| T-E2-44 | done | 02f6d7d2 | 14.113 (mcp-tokens-page.test.tsx) — a failed read says so, never "No assistants are connected" |

**NOTICE — CASE-ID COLLISIONS ACROSS LIVE RELEASE LANES, AND B09'S RENUMBER (2026-09-21 20:42).** The plan's §0 rule 5 ("next free id in that file's section") was followed by six live lanes at once, and the tip is not a safe place to mint from while they run. Measured across ALL remote branches, not `origin/main`:
- **`10.90` was minted by BOTH B06 and B09** as a real case bullet in `test-cases/10-workflow-builder.md`; §10's occupied ordinals ran to `10.92`.
- **`13.1050`–`13.1051` (B09) collided with B03's `13.1050`–`13.1056`** in `test-cases/13-hig-per-screen.md`; §13's occupied ordinals ran to **`13.1103`** (B01), so `13.1100`–`13.1103` were taken as well.
- **B09 renumbered its three mints** — `13.1050`/`13.1051` → `13.1110`/`13.1111`, `10.90`/`10.91` → `10.110`/`10.111`, `14.113` → `14.150` — and took recorded BLOCKS (`13.1110`–`13.1119`, `10.110`–`10.119`, `14.150`–`14.159`) instead of tips. None of the moved ids had merged, which is the repo's condition for renumbering. **The three earlier B09 progress lines above still name the superseded ids; the case TEXT is authoritative and this line is the supersession record.** The blocks are recorded in the id-block authority for each section (`test-cases/13-deployment-dogfooding.md` header, and §10's and §14's own headers) so the next lane reads them before minting.
- ⚠ **This is a coordination defect the controller may want to fix for the remaining batches**, not merely a B09 matter: any two batches minting the same section will collide the same way, and the collision only becomes visible when both PRs merge — `check-case-ids` would then report `union < sum`.
| T-E4-23 | done | 238e6fde | 13.1112/13.1113 (ticket-sheet.test.tsx) — a server-answered 404 says "not here", not Loading for ever |
| T-E5-15 | done | fa294812 | 13.1114 (ticket-types.test.tsx) — the OTHER half of each Promise.all tuple; RED observed against the reverted fix |
| T-E5-40 | done | 7495e6fd | 13.1115 (backlog-tab.test.tsx) — the toggle-hidden backlog says so; scope note + manual name the Backlog |
