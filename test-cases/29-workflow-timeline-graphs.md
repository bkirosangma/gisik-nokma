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
- ❌ **29.030 — offset = firstDay + scroll / ppd; visibleRange spans the viewport inclusive; scale writes --tl-ppd; control: a scroll of 240 px at 24 px/day is 10 days | scrollByPx moves by px; axis y reads scrollTop and the height.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.031 — the day under the pointer keeps its x within 0.5 px over a 60-event sweep, the event is cancelled, and --tl-ppd follows; control: the same sweep zoomed about the centre moves the pointer's day past 0.5 px; the pointer is measured from the container's own left edge | a zoom out at the first day, which the platform clamps, leaves the offset on the first day, not before it; a Ctrl + wheel during a glide ends the glide | on a platform that rounds scroll positions to whole pixels the anchor still holds within 0.5 px of the ideal on every event; control: re-reading the rounded position each event (the naive loop) drifts past 0.5 px on the same sweep | a plain vertical wheel, a horizontal swipe and Shift + wheel are left to the platform: not cancelled, no zoom | the zoom is capped by the browser scroll size: 400,000 days allow 40 px/day, not 96.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.032 — animateTo reaches the target and settles; the first frame is partial (never a jump); one last frame reports moving: false, with no jump on arrival; a native scroll after it is not pulled back | a 1,000,000 px glide still lands inside 450 ms (+1 frame); control: reduced motion lands in the same call, and one frame later the loop is idle with no frames pending | zoom glides geometrically about the viewport centre, inside 450 ms, and the centre day does not move | a glide started during a fling replaces the fling and lands exactly on its target.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.033 — Left / Right glide 7 days, with Shift 28, PageUp / PageDown 90% of a viewport, Home or T centres today, + (or =) and - (or _) zoom 1.25x; each is cancelled so the page does not also scroll | two quick presses add up (the second starts from the first target), arrows and zoom alike; a key with Ctrl, Meta or Alt, one already handled, or one typed into an input, is left alone.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.034 — dragging 100 px right scrolls 100 px left; releasing at speed keeps going and stops below 2 px/s; the click that ends the drag is swallowed; frames report moving throughout the drag; control: a press that moved no more than 4 px clicks as usual, and a drag begun on a bar, by touch, with another button or by a second pointer does nothing | a fling toward the first day stops there: the scroll rests at 0 and the loop goes idle; a press during a fling catches it where it is | a pointer that rested 300 ms before release, any release under reduced motion, or a cancelled pointer, has no momentum.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.035 — pulling past the first day shows a resisted overshoot (less than the pull, in its direction), and 160 ms after release it is back at 0; a new pull during the spring-back holds its overshoot between moves; control: inside the limits there is none.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.036 — a native scroll produces frames with the smoothed velocity in days per second, and a final frame once it is quiet; rebase keeps the day at the edge | a Ctrl + wheel zoom streams moving frames with the new scale | destroy removes every listener, the overshoot property and stops the loop; control: before destroy the same wheel zoomed.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.039 — a glide aimed past either scrollable end stops at that end and settles: a last frame reports moving: false and the loop goes idle; control: a target inside the extent lands exactly on it.** (`packages/viewport/test/scroll-adapter.test.ts`)
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

<!-- wtg-part3-workflow-graph -->

<!-- WTG4 -->

<!-- wtg-part5-mcp -->
