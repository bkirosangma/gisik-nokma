# Features — gisik-nokma

Legend: ✅ user-observable · ⚙️ internal subsystem · ? inferred/unverified

## 1. Reference base

- ⚙️ **Vendored tracker snapshot** — the convenience-corner project tracker, verbatim at upstream commit `24e2240`: the four-view static page (Focus, Board, Backlog, Calendar), its authored attention file, its generated data snapshot, and the generator with its 73 tests. Frozen; provenance and the freeze rule in `reference/convenience-corner-tracker/PROVENANCE.md`. `reference/convenience-corner-tracker/`
- ⚙️ **Base design documents** — the three upstream documents that designed the base: the tracker (2026-08-18), the calendar view (2026-08-19), and the calendar's implementation plan. `reference/design-docs/`

## 2. Product design

- ⚙️ **Product design spec** — the brainstorm's approved output: audience (non-technical operators), the honesty contract, event-sourced architecture with a shared rule engine, workflow engine and builder, offline sync with contested claims, permissions and visibility, views and search, testing discipline, and the two dogfooding targets. Awaiting owner review before an implementation plan is written. `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md`

*(Product feature sections begin once implementation starts; the brainstorm that produced the spec started from `docs/brainstorm-kickoff.md`.)*
