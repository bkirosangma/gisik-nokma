# Features — gisik-nokma

Legend: ✅ user-observable · ⚙️ internal subsystem · ? inferred/unverified

## 1. Reference base

- ⚙️ **Vendored tracker snapshot** — the convenience-corner project tracker, verbatim at upstream commit `24e2240`: the four-view static page (Focus, Board, Backlog, Calendar), its authored attention file, its generated data snapshot, and the generator with its 73 tests. Frozen; provenance and the freeze rule in `reference/convenience-corner-tracker/PROVENANCE.md`. `reference/convenience-corner-tracker/`
- ⚙️ **Base design documents** — the three upstream documents that designed the base: the tracker (2026-08-18), the calendar view (2026-08-19), and the calendar's implementation plan. `reference/design-docs/`

## 2. Product design

- ⚙️ **Product design spec** — the brainstorm's approved output: audience (non-technical operators), the honesty contract, event-sourced architecture with a shared rule engine, workflow engine and builder, offline sync with contested claims, permissions and visibility, views and search, testing discipline, and the two dogfooding targets. Approved and merged (PR #1). `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md`
- ⚙️ **Implementation plan series** — eleven task-by-task plans covering the whole build, ledger through deployment and dogfooding, written in parallel from one pinned contract and then reconciled. Under review on `plans/server-core` (PR #2), plan by plan. `docs/superpowers/plans/`
- ⚙️ **Series coordination document** — the single authority for cross-plan interfaces, naming, and ownership, and the record of every decision taken at review: where a plan disagrees with it, it wins. `docs/superpowers/plans/2026-08-20-00-series-coordination.md`

*(Product feature sections begin once implementation starts. Sections 3–13, and the matching `test-cases/` buckets, are already reserved one per plan by the coordination document. The brainstorm that produced the spec started from `docs/brainstorm-kickoff.md`.)*
