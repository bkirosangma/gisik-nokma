# Session handoff — Gisik Nokma plan review

*Paste the block below into a fresh session started from `/Users/kiro/my_projects/gisik-nokma`.*

---

Continue the Gisik Nokma plan review. Repo `github.com/bkirosangma/gisik-nokma`, local at `/Users/kiro/my_projects/gisik-nokma`, working branch **`plans/server-core`** (PR #2, open, awaiting my approval — do not merge without it).

**Read first, in this order:** `docs/superpowers/plans/2026-08-20-00-series-coordination.md` — the series authority; where any plan contradicts it, it wins. Then `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` (the approved spec, merged in PR #1). Then `CLAUDE.md` and the workspace rules at `/Users/kiro/my_projects/CLAUDE.md`. **Do not read the eleven plan documents whole** — they total ~60,000 lines. Grep them for what you need, and delegate wide reading to subagents.

**Where things stand.** The brainstorm produced the spec (merged). Eleven implementation plans plus the coordination document were written in parallel by subagents from one pinned contract, then reconciled — that reconciliation, and every decision I have made since, is recorded in the coordination doc's tables. Twelve commits sit on the branch.

**What we are doing now.** Walking my open questions **plan by plan**, in order. For each plan: pull the full text of its Open questions section, separate the items that genuinely need my judgement from those already settled by coordination decisions or that are executor-facing notes, present them concisely in the final message of your turn, and wait. When I answer, record the decision in the coordination doc, apply it to every affected plan (delegate to subagents with exact instructions and grep-verifiable success criteria), commit with a prose message, and move to the next plan.

- **Plan 1 (foundation & ledger): done.** Provisional workspace events accepted; both clocks are Asia/Kolkata; per-entity zod scope accepted.
- **Plan 2 (workflow engine): presented, two answers outstanding** — (a) workflow versioning currently demands a state mapping for *every* dropped state, not only occupied ones, because the engine cannot reliably ask "is anyone in this state" at publish time and a too-broad refusal is safer than a silent strand; (b) `require-different-user` passes vacuously when nobody performed the referenced transition, since creation is not a transition. Ask me to confirm or tighten these, then continue.
- **Plans 3–11: not yet walked.**

**Decisions already made (all recorded in the coordination doc — treat as settled):** better-auth · DigitalOcean App Platform + Managed Postgres BLR1 + **Spaces** BLR1 (compared against Cloudflare R2; Spaces won on Indian data residency, revisit near 1 TiB monthly egress) · `pm.artsourced.in` and `pm-api.artsourced.in`, sender `sign-in@artsourced.in` · a parent is required at or below the deepest rank (`>=`, constant fixed at 4) · attention thresholds 7/7, workspace-configurable, **one origin — the sweep reads the same settings as the attention strip** · custom epic-rank types head groups · custom date fields render on calendar and timeline in v1 · Google Drive attachments as **references only** (never evidence, never inline-embedded, rendered as external with last-seen name; uploads carry SHA-256) · runbook in-repo · `main` unprotected with a standing rule never to commit or push there · **all times Asia/Kolkata, day boundaries at IST midnight via the shared `istDayOf`/`istDayBounds` helpers**.

**Working rules.** `reference/` is frozen. `Features.md` and `test-cases/` move in the same change set as the work they describe. Never commit or push to `main` — branch, PR, and merge only on my explicit approval. Commit messages are prose that say what was found and why it matters, not bullet lists of files. Checks are proven against planted defects before they are trusted.

**One thing that has repeatedly paid off:** when a decision ripples across plans, dispatch a subagent per disjoint file set with the exact change and verifiable criteria, and require it to report what it did *not* find as well as what it fixed. Several real defects surfaced that way — a notification sweep that ran a day behind because it sliced UTC off an instant, an envelope rendered with `String()` over a timestamp, a test that would have started passing for the wrong reason, and the stale-threshold divergence above. Agents correcting my briefs is the mechanism working, not a problem.
