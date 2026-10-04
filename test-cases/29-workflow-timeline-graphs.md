# §29 — Workflow and Timeline graphs

**Opened 2026-10-03 by the `wtg-part1-viewport-timeline-view` plan Task 1** (`docs/superpowers/plans/2026-10-03-wtg-part1-viewport-timeline-view.md`; spec `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md`). Mirrors `Features.md` §26. Ships on `release/workflow-graph` (cut 2026-10-04 from `release/knowledge-graph`).
3-DIGIT PADDED `29.001`–`29.399`, blocks per spec section 16.1 (each Part's plan splits its block per task in its own sub-section):

| Sub-block | Part / subject | Plan |
|---|---|---|
| 29.001–29.049 | Part 1: viewport engine (VP), preloading (PR) | `2026-10-03-wtg-part1-viewport-timeline-view.md` |
| 29.050–29.079 | Part 1: packing and routing (PK) | `2026-10-03-wtg-part1-viewport-timeline-view.md` |
| 29.080–29.119 | Part 1: the existing Timeline view (TV), including the retired cases | `2026-10-03-wtg-part1-viewport-timeline-view.md` |
| 29.120–29.149 | Part 2: links and Decision (LK, DC) | `2026-10-03-wtg-part2-model.md` |
| 29.150–29.179 | Part 2: estimate, rework estimate, wait-for-all, actual dates (ES) | `2026-10-03-wtg-part2-model.md` |
| 29.180–29.199 | Part 2: flow analysis (FL) and planning (PL) | `2026-10-03-wtg-part2-model.md` |
| 29.200–29.229 | Part 2: auto-promotion (AP) | `2026-10-03-wtg-part2-model.md` |
| 29.230–29.269 | Part 3: sheet, Workflow graph, create and publish (SH, WG, CR, RN) | `2026-10-03-wtg-part3-workflow-graph.md` |
| 29.270–29.289 | Part 3: note blocks, alternates, Not taken and pass display | `2026-10-03-wtg-part3-workflow-graph.md` |
| 29.290–29.329 | Part 4: Timeline graph and Home's Timeline (TG, HM) | `2026-10-03-wtg-part4-timeline-graph-home.md` |
| 29.330–29.349 | Part 4: periods, passes, ghosts, the paper pin, Home's one scope | `2026-10-03-wtg-part4-timeline-graph-home.md` |
| 29.350–29.374 | Part 2: work periods (WP) and passes (PS) | `2026-10-03-wtg-part2-model.md` |
| 29.375–29.389 | Part 5: MCP (MC) | `2026-10-03-wtg-part5-mcp.md` |
| 29.390–29.399 | Part 2: notifications (NT) | `2026-10-03-wtg-part2-model.md` |

Unused ids in a block stay free for that Part's follow-ups. Parts 2–5 each add their own `## 29.N` sub-section below their Part anchor; merges are unions (each plan writes under its own anchors).

Legend: ✅ covered by a test · ❌ not yet · 🟡 partial · 🧪 manual · 🚫 out of scope, with a reason.

## 29.1 Part 1 — viewport engine, packing and the continuous Timeline view (29.001–29.119)

Plan `docs/superpowers/plans/2026-10-03-wtg-part1-viewport-timeline-view.md`; spec section 2–6 and 13. Ids by task: T1 001–007 + 014 + 016 · T2 008–013 + 015 · T3 020–025 · T4 050–054 · T5 065–067 · T6 030–036 + 039 · T7 037–038 + 045–049 · T8 080–086 · T9 087 + 093–107 · T10 040–044 · T11 108–112 · T12 113–117 · T13 118–119. Unused ids stay free.

<!-- wtg-part1-viewport-timeline-view T1 -->
- ✅ **29.001 — frameStats: 60 fps steady is 60 and 16.7 ms; a planted 120 ms stall is the worst frame and is counted over every budget; control: no stall, none over | frameStats: p95 is the 95th-percentile gap, 6 slow frames in 100 put it on the slow value, 5 do not (nearest rank: the 95th of 100); no frames is refused, not reported as 0 fps.** (`packages/flow-graph-browser/tests/sampler.spec.ts`)
- ✅ **29.002 — the time scene mounts 1,200 bars in a native scroller and the sampler records a scripted pan of it; control: a 60 ms stall planted in the pan is the worst frame | the flow scene mounts 300 nodes and about 1.3 edges each under one transformed layer and records a pan and zoom of it.** (`packages/flow-graph-browser/tests/stress.spec.ts`)
- ✅ **29.003 — the product's own Timeline view at 2,000 dated tickets: panned and measured; the numbers are the recorded baseline.** (`packages/flow-graph-browser/tests/stress.spec.ts`)
- ✅ **29.004 — every workspace package an app builds from is registered in the four Dockerfiles and both hot-mode services | the closure is read from the manifests and names the packages the images build; control: a private test package is not in it | docker-compose.hot.yml mounts every one of their sources in the server service and in the web service.** (`apps/server/test/deploy/workspace-manifests.test.ts`)
- ✅ **29.005 — parseResult accepts a run record and refuses everything else; control: one field changed at a time.** (`packages/flow-graph-browser/tests/results.spec.ts`)
- ✅ **29.006 — the pan bars are the spec numbers (section 13) and judge holds a record to them: exactly on the bar passes, a hair under on fps or over on the worst frame fails, and a lighter load is refused.** (`packages/flow-graph-browser/tests/bars.spec.ts`)
- ✅ **29.007 — admits packages/flow-graph-browser/tests and packages/viewport/test; refuses the harness, the README, the source and node_modules.** (`apps/server/test/tooling/check-case-citations.test.ts`)
- ✅ **29.014 — day 4 is a Monday, day 2 a Saturday, day 3 a Sunday; Mondays are 7 apart; control: day 0 (Thursday) is no Monday | week labels from 16 px/day, day numbers cross-fade around 20 and are absent at Month zoom, the tint starts at 16; control: 8 px/day has none of them.** (`packages/viewport/test/calendar-days.test.ts`)
- ❌ **29.016 — The shipped week-column Timeline view, measured BEFORE the lift: 2,000 dated tickets panned through `stress.html?scene=view&n=2000&auto=1` on a headed desktop Chrome and on the owner's real phone; the numbers (fps, worst frame, click-to-settle) are written on this line and every later Part 1 task is held to them or better.** (`packages/flow-graph-browser/README.md`)
<!-- wtg-part1-viewport-timeline-view T2 -->
- ✅ **29.008 — tau = 85 ms: 95% of the way by about 300 ms, exactly on the target when it settles, never past it; control: a 1,000 ms step moves what a 100 ms step moves (the dt clamp) | reduced motion lands at once; a zoom (px per day) eases geometrically, so halfway in time is the geometric mean; control: without reduce one frame is partial | tauFor keeps 85 ms for a short distance and shortens it so any distance arrives inside maxMs; control: with the fixed 85 ms a 1,000,000 px glide is still moving at 450 ms.** (`packages/viewport/test/motion.test.ts`)
- ✅ **29.009 — the velocity is the least-squares slope of the last 80 ms; a pointer that rested before release has none; control: samples older than 80 ms are ignored | v(t) = v0 e^(-t/240): travel is v0 * tau, one long step equals many short ones, and it stops below 2 px/s; control: 2,000 px/s travels 480 px.** (`packages/viewport/test/motion.test.ts`)
- ✅ **29.010 — power 0.3 with unit slope at the limit: resisted, monotone, and bounded by extent / 0.3; control: inside the limits nothing changes.** (`packages/viewport/test/motion.test.ts`)
- ✅ **29.011 — the day under the anchor keeps its screen x within 0.5 px on every frame of a zoom sweep; control: zooming about the centre moves the day under the pointer.** (`packages/viewport/test/zoom.test.ts`)
- ✅ **29.012 — 4 to 96 px per day; Day 56, Week 24, Month 8; a free zoom between presets marks none; control: the exact presets are marked | the packing scale is the lower bound of the power-of-two bucket; it changes only across a bucket edge; control: 15.99 and 16 differ.** (`packages/viewport/test/zoom.test.ts`)
- ✅ **29.013 — wheelIntent is the Knowledge Graph classifier exactly; the time surfaces take over only Ctrl + wheel; control: Shift + wheel and a plain vertical wheel are the platform's.** (`packages/viewport/test/zoom.test.ts`)
- ✅ **29.015 — no Date, Math.random, performance, requestAnimationFrame, setTimeout or document in src (outside dom/); control: the scan finds a planted read.** (`packages/viewport/test/seam.test.ts`)
<!-- wtg-part1-viewport-timeline-view T3 -->
<!-- wtg-part1-viewport-timeline-view T4 -->
<!-- wtg-part1-viewport-timeline-view T5 -->
<!-- wtg-part1-viewport-timeline-view T6 -->
<!-- wtg-part1-viewport-timeline-view T7 -->
<!-- wtg-part1-viewport-timeline-view T8 -->
<!-- wtg-part1-viewport-timeline-view T9 -->
<!-- wtg-part1-viewport-timeline-view T10 -->
<!-- wtg-part1-viewport-timeline-view T11 -->
<!-- wtg-part1-viewport-timeline-view T12 -->
<!-- wtg-part1-viewport-timeline-view T13 -->
<!-- wtg-part1-viewport-timeline-view end -->

Parts 2 to 5 each own ONE anchor below, seeded here so the sub-sections always sit in Part order. The FIRST task of each Part writes, directly below its own anchor, its `## 29.N` heading, its per-task id split and one anchor per task (its task list is its own plan's business, not this one's). Never write below another Part's anchor.

<!-- wtg-part2-model -->

## 29.2 Part 2: the model

Plan `docs/superpowers/plans/2026-10-03-wtg-part2-model.md`; spec `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md`. Ids by task: the Global Constraints "Catalogue" line. `29.171`-`29.179` stay free. Ids follow this per-task split, not the sub-block subjects in the table above (planner ruling 2026-10-04, Q1).

<!-- wtg-part2-model T1 -->
- ✅ **29.147 — the shadow detector reports a custom field whose id is estimate, waitForAll or reworkEstimate from three sources: any ticket-type.defined event (current or superseded), the proj_ticket_types row, and ticket.field_set claims;** control: near-miss ids (estimates, Estimate), another field, and a workspace with none are NOT reported, and a superseded shadowing definition has NO type-projection finding but still has a ledger-definition one. Mutation: scan only proj_ticket_types → the superseded and claim assertions fail.
- ✅ **29.148 — an existing type with id decision is reported per workspace with its rank, workflow, the task type's workflow, rankMatchesSeed (rank 3) and sameWorkflowAsTask;** control: a workspace with no decision type is absent. Mutation: drop the rank comparison → a rank-5 decision reads rankMatchesSeed true.
- ✅ **29.149 — a workflow whose CURRENT (highest) version has a terminal initial state is reported with its bound-type count;** control: an open initial state, and a workflow whose old version was terminal-initial but whose latest is fixed, are not. Mutation: read every version → the superseded workflow appears.
- ✅ **29.150 — THE TERMINAL-READER CENSUS: every non-test source file that reads the terminal state category or the rollup's terminal count is classified definition, invariant or done-meaning; a new reader fails the test;** control: a planted file is reported, a comment-only mention and a .test. file are not. Mutation: drop the comment filter → a docblock mention reads as a reader.
- ✅ **29.151 — the report prints every finding (workspace id, source, field) and exits 1 only for shadows (decision and terminal-initial findings are warnings, exit 0); the CLI runs inside a READ ONLY transaction;** control: the same INSERT commits on the plain pool. Mutation: drop BEGIN READ ONLY → the write inside succeeds.
- ❌ **29.152 — the owner ran the script against PROD and pasted the output into HANDOFF-task-wtg2-preflight.md, showing zero ledger-definition and zero field-claim shadows (or an owner ruling per hit);** control: the dev-database run (Step 6) is recorded beside it. 🧪 when the output is pasted.
<!-- wtg-part2-model T2 -->
<!-- wtg-part2-model T3 -->
<!-- wtg-part2-model T4 -->
<!-- wtg-part2-model T5 -->
<!-- wtg-part2-model T6 -->
<!-- wtg-part2-model T7 -->
<!-- wtg-part2-model T8 -->
<!-- wtg-part2-model T9 -->
<!-- wtg-part2-model T10 -->
<!-- wtg-part2-model T11 -->
<!-- wtg-part2-model T12 -->
<!-- wtg-part2-model T13 -->
<!-- wtg-part2-model T14 -->
<!-- wtg-part2-model T15 -->
<!-- wtg-part2-model T16 -->
<!-- wtg-part2-model T17 -->
<!-- wtg-part2-model T18 -->
<!-- wtg-part2-model T19 -->

<!-- wtg-part3-workflow-graph -->

<!-- WTG4 -->

<!-- wtg-part5-mcp -->
