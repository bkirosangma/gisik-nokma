# Workflow and Timeline graphs, Part 1: the viewport engine, packing and the continuous Timeline view Implementation Plan

> **Release branch (owner, 2026-10-04):** `release/workflow-graph`, cut from `origin/release/knowledge-graph` at f9e0cd18. Every task branch is cut from `origin/release/workflow-graph` and every PR goes `--base release/workflow-graph`. The Knowledge Graph release merges to `main` first; `main` is then merged INTO `release/workflow-graph`, never rebased.

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In the gisik orchestration, every task is ONE lane session. Follow `gisik-nokma-lanes/STEPS-common-2026-10-03.md`: numbered steps, each ending with a pushed commit + `CHECKPOINT task/<branch> <sha40> step <n>/<N>` + `HANDOFF-<branch>.md`; the sweep list + your own mutation pass before DONE.

**Goal:** the existing project Timeline stops being a paged, eight-week grid and becomes one continuous, packed canvas that pans, glides and zooms smoothly, on a new shared engine (`packages/viewport`) that Parts 3 to 5 reuse, measured first in a real browser against the spec's pan bars.

**Architecture:**
- **One engine, two adapters** (spec VP-0). `packages/viewport` (`@gisik-nokma/viewport`) holds every motion, range, packing and routing rule as PURE modules (no DOM, no clock; a scan enforces it, 29.015) and two thin DOM adapters that own time: `ScrollAdapter` (a native scroller, for the time views) and `CameraAdapter` (a transform camera, for the graphs). Both implement `ViewportDriver`.
- **The existing view moves onto it** (TV-1 to TV-11). `timeline-model.ts` keeps the claims semantics and swaps week indices for integer DAY NUMBERS; `timeline-layout.ts` packs each epic lane (`packLane`) at a bucketed scale; `timeline-view.tsx` renders absolutely placed bars on one scroller with `--tl-ppd` as the only scale; `ui.css` loses the week-column grid. Part 1 builds no route: its data is the list's single walk.
- **Measure first.** `packages/flow-graph-browser` (private, Playwright against a Vite harness on port 3192) is built in T1 with the frame sampler, three stress scenes and the section 13 bars as data, and the shipped week grid is measured before anything is lifted. Headless numbers are floors; only headed and real-phone numbers are quoted as passes.

**Tech stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext), React 19, vitest 3 (node + jsdom), Playwright, Vite 6, pnpm/turbo, Postgres (one read), Fastify (one route edit).

**Spec:** `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md`, **Part 1 only** (sections 2 to 6, the bars of 13, the audit rules VP-10, VP-11, TV-11, TG-11 and TG-12 to TG-15 as they touch the existing view). Read the whole spec for context; Parts 2 to 5 have their own plans. Code was read at `origin/release/knowledge-graph` (`e0bee5ed`, moved to `a03cc486` while this plan was written; none of the files edited here changed in between). Re-read every `file:line` before editing.

**Dependencies**

| Needs | Why | Status |
|---|---|---|
| The Knowledge Graph release shipped and a new release branch cut (`release/workflow-graph`) | one release branch at a time; Part 1 ships FIRST and ALONE on the next one | cut 2026-10-04 from KG f9e0cd18 (owner) |
| Nothing else | Part 1 needs neither Drafts nor `leads_to`; it builds no route and no event | |

| Is needed by | What it takes from this plan |
|---|---|
| Part 2 T1 | the catalogue files and ONE Part anchor seeded in T1 (`<!-- wtg-part2-model -->` in file 29, `<!-- wtg-part2-model bullets -->` in Features §26); Part 2 T1 writes its own heading and per-task anchors below them |
| Part 3 | `CameraAdapter`, `routeEdge`, `routeLoop` (T5, T7), the Part anchors `<!-- wtg-part3-workflow-graph -->` / `<!-- wtg-part3-workflow-graph bullets -->` (Part 3 T1 adds its per-task anchors below them) |
| Part 4 | `ScrollAdapter`, `RangeCache` / `ScopeCaches` and the range planner (T3, T6), `packLane` / `layoutLanes` (T4, T8), `routeEdge` / `routeLoop` (T5), the stress harness and bars (T1), the paper pin and its footprint (T8, T12), the Part anchors `<!-- WTG4 -->` / `<!-- WTG4 bullets -->` (Part 4 T1 adds its per-task anchors below them) |
| Part 5 | the Part anchors `<!-- wtg-part5-mcp -->` / `<!-- wtg-part5-mcp bullets -->` (Part 5 T1 adds its per-task anchors below them) |

**Names Part 4 should read, as built here (they differ from the guesses in its plan; the rest of this plan is the contract):** `packLane(items, {ppd, labelPx})` returns `{rows, rowOf, strategy}`; `packScale(ppd)`; `planFetches`, `planWiden`, `chunksToEvict`, `wantedRange`, `panLimits` (not `planRange`); `RangeCache<I, D>` and `ScopeCaches`, `scopeKey(workspaceIds, projectIds, mine)`; `ScrollAdapter` options in T6; `routeEdge(from, to, obstacles, orientation)` and `routeLoop(from, to, obstacles, orientation)`. A ticket's `pin` is `{notes, attachments}` (counts) on the list read; the spec's index entry says `pin` is a boolean (`:174`) and Part 4's wire carries the count (`:714`), as this plan does.

## Global Constraints

**Release and identity**
- **Release:** `release/workflow-graph` is a literal until the planner cuts it (one release branch at a time; never a second). Every task branch is `task/wtg1-<slug>` cut from `origin/release/workflow-graph`, and its PR has `--base release/workflow-graph`. Never `main`.
- **Catalogue:** Features.md §26 "Workflow and Timeline graphs" ↔ `test-cases/29-workflow-timeline-graphs.md` (the bucket number is 29, the Features number is 26; §25 and file 28 are Drafts'). T1 creates both, with the block table of spec 16.1, one anchor per task for Part 1 (T1..T13), and ONE Part anchor for each of Parts 2 to 5 in each file (`<!-- wtg-part2-model -->`, `<!-- wtg-part3-workflow-graph -->`, `<!-- WTG4 -->`, `<!-- wtg-part5-mcp -->` in file 29; the same names with ` bullets` in Features §26). The first task of each later Part writes its sub-heading and its own per-task anchors below its Part anchor, so parallel tasks never append to the same line and this plan never guesses another Part's task list. This plan owns `29.001`–`29.119`: T1 `29.001–29.007`, `29.014`, `29.016` · T2 `29.008–29.013`, `29.015` · T3 `29.020–29.025` · T4 `29.050–29.054` · T5 `29.065–29.067` · T6 `29.030–29.036`, `29.039` · T7 `29.037`, `29.038`, `29.045–29.049` · T8 `29.080–29.086` · T9 `29.093–29.107` · T10 `29.040–29.044` · T11 `29.108–29.112` · T12 `29.113–29.117` · T13 `29.118`, `29.119`. Unused ids in the block (`29.017–29.019`, `29.026–29.029`, `29.055–29.064`, `29.068–29.079`, `29.087–29.092`) stay free for follow-ups.
- **Case lines are id lines:** `- ❌ **29.001 — …**`. Each starts ❌ and flips ✅ in the same commit as its test (🧪 for a manual record, 🚫 for a retired pin with its reason). Test names or comments carry the id. `pnpm check:citations` must pass.
- **Before allocating,** re-grep every live tip: `for b in $(git for-each-ref refs/remotes/origin --format='%(refname:short)'); do git grep -qE '^## 2[56]\. ' "$b" -- Features.md && echo "FEAT $b"; git ls-tree --name-only "$b" test-cases/ | grep -qE 'test-cases/(28|29)-' && echo "FILE $b"; done`. On 2026-10-03 none of 877 refs printed anything. If Drafts landed first, §25 and `28-drafts.md` exist: put §26 after §25 and keep 29.
- **Ledger:** plan id `wtg-part1-viewport-timeline-view` (`scripts/check-task-ledger.mjs` strips the date). Rows are at the end of this plan.

**Spec constants, copied verbatim**
- Spring τ = 85 ms, dt clamped to 100 ms, a glide never takes longer than 450 ms whatever the distance. Momentum τm = 240 ms, stop below 2 px/s, velocity = least-squares slope of the last 80 ms. Rubber band power 0.3, spring-back 160 ms.
- Zoom 4 to 96 px per day; presets Day 56, Week 24, Month 8 px/day. Chunks of 28 days aligned to a Monday. At most 2 fetches in flight; idle widening after 200 ms; caps 40 chunks or 10,000 detail entries.
- Packing scale `packScale(ppd) = 2^⌊log2 ppd⌋` clamped to 4 to 64. Row pitch 40 px, bar 28 px, lane heading 34 px, portrait column 112 px, the paper pin adds 14 px to a label footprint.
- Keys: Left/Right glide 7 days, Shift 28, PageUp/PageDown one viewport minus 10%, Home or `T` glides to Today, `+` / `−` zoom 1.25x. Today and a Day | Week | Month switch are the ONLY movement controls (VP-10): no element named Earlier, Later, Previous or Next exists in any timeline.
- Axis (VP-11): top row month labels below 16 px/day and "W 28 Sep" week labels from 16; day numbers under it from 20 px/day (cross-faded); weekend columns tinted from 16 px/day by the opaque role `timelineWeekend` (`--gn-timeline-weekend`), day numbers at 4.5:1 in every style and theme.
- Bars (section 13), headed desktop (an M2 Pro class machine) and a real mid-range phone: pan of 1,200 mounted bars at least 60 fps with a worst frame of 20 ms or less (phone: 600 bars, 30 fps, 50 ms); a flow of 300 nodes 60 fps / 16.7 ms (phone: 100, 30 fps, 50 ms); the existing Timeline at 2,000 dated tickets the first row's numbers.

**What must not change**
- The claims semantics: a bar needs BOTH claims, the five side-list reasons (`TimelineSideReason`), epic lanes, `hideEpicRows` / `laneEpicId` / `isEpicType`, custom date claims beside the ticket, provenance, and the `aria-describedby` date span (the accessible NAME stays the ticket title alone; the key is in the description).
- `TimelineView` stays clock-free: `today` is an injected prop. The clock scan (`packages/app-core/test/calendar/clock-free.test.ts`) covers `src/timeline`; engine clock reads live ONLY in `packages/viewport/src/dom/`.
- The list's session cache and `useTicketList` (no fetch changes). The Knowledge Graph's own camera and tests (they import the shared constants back only if the engine files exist on the base, T2).

**Registering a package app-core depends on** (T1, guarded by 29.004): `COPY packages/viewport/package.json packages/viewport/` after the `ui` line in all four Dockerfiles; the `./packages/viewport/src:/repo/packages/viewport/src` mount in BOTH the server and web services of `docker-compose.hot.yml`; the `"@gisik-nokma/viewport": "workspace:*"` dependency in app-core; the lockfile.

**Gate count.** The gate runs 41 tasks today (`scripts/ctl/verbs/gate.sh`, 41-only since KG C T1). `packages/viewport` adds `build`, `test`, `typecheck` and `packages/flow-graph-browser` adds `test`, `typecheck`: **46**. The verb that runs is the PRIMARY checkout's, so T1 lands in two steps: a small FIRST PR widens the verb to `41 or 46` (the KG precedent "36 or 41"), the owner pulls the primary checkout, then T1's LAST commit pins 46-only. Count with `pnpm turbo run build test typecheck --dry=json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).tasks.length))'` and expect 46 (41 before T1). **41 and 46 are the counts MEASURED when this plan was written; T1 Step 0 re-measures both** (the pre-T1 count on the tip, and the count with the two packages added). If either differs, use the measured pair everywhere this task says 41 or 46 (the verb, its fixtures and case lines, the docs, the T1 bullet and the pin) and say so in the HANDOFF. **This is the ONLY widening procedure of the series:** a later package-adding task (Part 3 T1, `packages/flow-graph`) re-measures and pins its count and runs no widening of its own (see Part 3 T1 Step 10).

**Tests and tooling**
- **Node 22** for `pnpm install` in a worktree. Every test run goes through `/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh <label> -- <cmd>`.
- **Never pipe a test or build run into `head`.** Use `| tail -N` or `> /tmp/x.log 2>&1`. No `pkill` / `killall`; exact pids only. vitest `--maxWorkers=2`.
- **Build before suites.** Web and the harness read app-core's `dist`; app-core reads viewport's `dist`: `pnpm turbo run build --filter=@gisik-nokma/viewport... --filter=@gisik-nokma/app-core...`.
- **ui.css changes** (T9, T11, T12) ⇒ run the ui, app-core and web suites WHOLE. **An app-core online/sync change or a server read change** (T12) ⇒ run the server integration files (`apps/server` WHOLE). **A domain change** (T12, a type) ⇒ `pnpm --filter @gisik-nokma/editor run build:webview && node apps/mobile/scripts/generate-editor-html.mjs --check`; expect no change.
- **Every run quoted in a report is named LOCAL** (CI runs only on the release→main PR); a headless Playwright number is named `LOCAL, headless` and is never a pass.
- **Controls live in the same `it()`** as the case they guard. **Features.md and test-cases change in the same commit as the code.**
- **UI tasks (T9, T11, T12) name `frontend-design` in the lane prompt** and measure real geometry on the dev stack. The dev stack is the PRIMARY checkout's (rule #23: no lane runs its own Docker stack): ask the controller for `ctl rebuild` on the release branch and read the page there; the `flow-graph-browser` pages are the lane's own real-browser measurement.
- **Mutation pass** on every pure module (T2 to T5, T8) and on the view (T9, T11, T12): the lane breaks the code, one constant or branch at a time, and the named case must turn RED; the survivors are recorded in the HANDOFF (a survivor judges the test, not the mutant).
- Gate task count and every pinned member/registry count are MEASURED on the tip at execution and pinned in the same task that changes them; never copy a number from this plan.

## Review Focus

1. **A platform that rounds `scrollLeft` to whole pixels** (Safari, some Chrome zooms). Re-reading the rounded position every wheel event makes the zoom anchor drift past 0.5 px within a sweep. `ScrollAdapter` keeps the exact offset it wrote and reads the platform only when someone else moved it. Pinned by 29.031 (T6), with the naive loop as the control, and by 29.041 in a real browser (T10).
2. **A glide aimed past the end of the scroller never settles.** The platform clamps the write, so a naive spring chases the target forever and no resting frame is ever emitted (the "Nothing in view" pill would never appear and the frame loop would never idle). `ScrollAdapter` aims at the nearest day the scroller can show. Pinned by 29.039 (T6) and 29.112 (T11).
3. **A note the viewer cannot read must add nothing to the paper pin,** not even a number that proves it exists: the count is taken through `visibleNotesWhere`, a deleted note is not counted, and a note-owned attachment is not a ticket's. Pinned by 29.113 (T12) with three viewers over one world and a deleted note the lane adds to the fixture. A note in a TRASHED project is excluded by the notes list's own `NOTE_PROJECT_LIVE_WHERE` clause, which the pin reuses verbatim; no test here builds a trashed-project world, and T12's mutation pass records that clause's mutant as a known survivor.
4. **A re-render storm.** The pan loop re-renders the view on every moving / resting flip; with 2,000 bars an un-memoised bar costs a 33 ms stall (9.4 ms with `React.memo`). Pinned by a source scan and a render-count case, both with controls (29.102, T9).
5. **Work far from today, or none.** Dated work a year away is drawn, not described; an unrepresentable day (2026-02-30) is a side-list entry, never a crash or a bar at day NaN; an empty chart shows its one sentence and NO "Nothing in view" pill; the pill appears only once the view has come to rest. Pinned by 29.094, 29.095, 29.096 (T9) and 29.108, 29.112 (T11).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `packages/viewport/package.json`, `tsconfig.json`, `tsconfig.typecheck.json`, `vitest.config.ts` (new) | the package; `build`, `test`, `typecheck` | 1 |
| `packages/viewport/src/calendar-days.ts` (new) | day-number arithmetic, `axisLevels`, `crossFade` | 1 |
| `packages/viewport/src/{spring,momentum,rubber-band,anchored-zoom,wheel,driver}.ts` (new) | the motion core and `ViewportDriver` | 2 |
| `packages/viewport/src/{range-plan,range-cache}.ts` (new) | chunks, fetch/widen/evict plans, `RangeCache`, `ScopeCaches` | 3 |
| `packages/viewport/src/pack.ts` (new) | `packLane`, `footprintOf`, natural key order | 4 |
| `packages/viewport/src/route.ts` (new) | `routeEdge`, `routeLoop` | 5 |
| `packages/viewport/src/dom/{clock,scroll-adapter}.ts` (new) | the clock seam, `ScrollAdapter` | 6 |
| `packages/viewport/src/dom/camera-adapter.ts` (new) | `CameraAdapter` | 7 |
| `packages/viewport/test/*` (new) | one test file per module, `fake-clock.ts` | 1–7 |
| `packages/flow-graph-browser/` (new, private) | `package.json`, `tsconfig.json`, `README.md`, `vite.config.ts`, `playwright.config.ts`, `harness/{sampler,results,bars,scenes}.ts`, `stress.{html,tsx}` | 1 |
| `packages/flow-graph-browser/harness/camera.{html,ts}`, `tests/camera.spec.ts` | the camera in a browser | 7 |
| `packages/flow-graph-browser/harness/timeline.html`, `timeline-main.tsx`, `tests/timeline.spec.ts` | the continuous view in a browser | 10 |
| `packages/flow-graph-browser/tests/timeline-phone.spec.ts` | portrait and the pill in a browser | 11 |
| `apps/server/test/deploy/workspace-manifests.test.ts` (new) | 29.004: every package an app builds from is registered | 1 |
| `apps/{web,server}/Dockerfile{,.dev}`, `docker-compose.hot.yml`, `packages/app-core/package.json`, `pnpm-lock.yaml` | register `@gisik-nokma/viewport` | 1 |
| `turbo.json`, `.github/workflows/ci.yml`, `.gitignore`, `packages/ui/test/helpers/colour-scan.ts` | the new packages' gate inputs, Chromium install, results dir | 1 |
| `scripts/check-case-citations.{mjs,d.mts}`, `apps/server/test/tooling/check-case-citations.test.ts` | `flow-graph-browser/tests` is citation corpus (29.007) | 1 |
| `scripts/ctl/verbs/gate.sh`, `scripts/ctl/test/{lib,run-tests}.test.sh`, `docs/lanes/gate-lock/README.md`, `test-cases/13-deploy-and-ops.md`, `Features.md` (the gate bullet) | 41 → 46 (41 or 46, then 46-only) | 1 |
| `test-cases/29-workflow-timeline-graphs.md` (new), `test-cases/README.md`, `scripts/fixtures/check-case-citations-baseline.json`, `Features.md` §26 | the catalogue: Part 1's per-task anchors plus one Part anchor each for Parts 2 to 5 | 1 |
| `packages/app-core/src/timeline/{timeline-days,timeline-layout}.ts` (new), `src/index.ts` | day numbers, lane layout | 8 |
| `packages/app-core/src/timeline/{timeline-model,timeline-view}.ts(x)`, `claims/claim-labels.ts`, `src/index.ts` | the continuous model and view | 9, 11, 12 |
| `packages/ui/src/ui.css`, `tokens.ts` | the `.gn-timeline*` canvas; `timelineWeekend` | 9, 11, 12 |
| `packages/ui/src/icons/paper-pin-icon.tsx`, `src/index.ts` | the pin glyph | 12 |
| `apps/server/src/read/pin-counts.ts` (new), `routes/list.ts`, `packages/domain/src/read-models.ts` | `pin` on the list read | 12 |
| `packages/app-core/src/{view-types,online/mappers}.ts`, `claims/ticket-dates.ts`, `apps/web/src/ticket-dates-input.ts` | `pin` on the row, to the Timeline input | 12 |
| `docs/manual.md`, `docs/faq.md`, `packages/app-core/src/help/content.generated.ts` | the manual describes the continuous chart | 9, 11, 12 |
| `test-cases/{11,13,20,21,23}-*.md`, `Features.md` Timeline bullets | retired pins, narrowed 20.271 | 9 |
| `apps/server/test/tooling/wtg-part1-catalogue.test.ts` (new) | 29.119: the Part 1 block stays closed | 13 |

**Parallelism**
- **T1 first** (everything imports the package and the catalogue). Its first PR is the gate widening; wait for the owner to pull the primary checkout before the T1 gate.
- **T2** then **T3, T4, T5** in parallel (independent pure modules), then **T6** (needs T2) and **T7** (needs T6's clock and fake clock). **T8** needs T4. **T9** needs T6 and T8 (and T2 for the wheel constants). **T10** needs T9; **T11** needs T10 (it extends the same harness page); **T12** needs T11; **T13** last.
- **Shared files:** `packages/viewport/src/index.ts` (each of T2 to T7 adds its own `export *` line: take the union on a merge), `Features.md` and file 29 (each task writes only under its own anchor), `ui.css` (T9, T11, T12 are serial), `packages/app-core/src/index.ts` (T8, T9).
- **A pre-flight, once, in T1 Step 0:** read `origin/task/kg-c-t1-measure`'s `packages/knowledge-graph-browser/harness/stress.ts` and the KG plans' `engine/{camera,wheel,fit,glide,coast}.ts` (on `origin/docs/kg-plans-cd`, `2026-10-03-knowledge-graph-view.md`). At `a03cc486` the engine files DO NOT exist (`packages/knowledge-graph/src` has only `render/`), so the viewport modules are WRITTEN here, and T2 Step 8 imports them back only if the KG release has shipped its own copy (open question 5).

---


### Task 1: Measure first, the viewport package, the browser harness, the registration and the catalogue (cases 29.001–29.007, 29.014, 29.016)

**Branches:** `task/wtg1-gate-widen` (PR A, the gate widening, lands FIRST and alone) and `task/wtg1-measure` (PR B, everything else), both cut from `origin/release/workflow-graph`, both `--base release/workflow-graph`. PR B is cut AFTER PR A is merged so its last commit applies on top of it. **NEEDS:** the owner's pull of the primary checkout after PR A (the gate verb that runs is the primary's), and the owner's phone for step 15.

**Files:**
- Create: `packages/viewport/{package.json,tsconfig.json,tsconfig.typecheck.json,vitest.config.ts}`, `packages/viewport/src/{calendar-days.ts,index.ts}`, `packages/viewport/test/calendar-days.test.ts`
- Create: `packages/flow-graph-browser/{package.json,tsconfig.json,README.md,vite.config.ts,playwright.config.ts}`, `harness/{sampler,results,bars,scenes}.ts`, `harness/stress.{html,tsx}`, `tests/{sampler,results,bars,stress}.spec.ts`
- Create: `apps/server/test/deploy/workspace-manifests.test.ts`, `test-cases/29-workflow-timeline-graphs.md`
- Modify: the four Dockerfiles (`apps/web/Dockerfile`, `apps/web/Dockerfile.dev`, `apps/server/Dockerfile`, `apps/server/Dockerfile.dev`), `docker-compose.hot.yml`, `packages/app-core/package.json`, `pnpm-lock.yaml`
- Modify: `turbo.json`, `.github/workflows/ci.yml`, `.gitignore`, `packages/ui/test/helpers/colour-scan.ts`, `scripts/check-case-citations.{mjs,d.mts}`, `apps/server/test/tooling/check-case-citations.test.ts`, `scripts/fixtures/check-case-citations-baseline.json`, `test-cases/README.md`, `Features.md` (new section 26 and the gate bullet)
- Modify (PR A, then pinned in PR B): `scripts/ctl/verbs/gate.sh`, `scripts/ctl/test/{lib,run-tests}.test.sh`, `docs/lanes/gate-lock/README.md`, `test-cases/13-deploy-and-ops.md`

**Interfaces:**
- **Consumes:** nothing from earlier tasks. From the codebase: `TimelineView` and `TicketDatesInput` exported by `@gisik-nokma/app-core`, `themeStylesheet` from `@gisik-nokma/ui/tokens`, `@gisik-nokma/ui/ui.css`.
- **Produces:**
  - `@gisik-nokma/viewport`: `DAYS_PER_WEEK`, `weekdayOf(day): 0..6` (0 = Monday), `isMonday`, `isWeekend`, `mondayOnOrBefore`, `mondaysIn(first, last)`, `axisLevels(ppd): {weekLabels, dayNumbers, weekendTint}`, `crossFade(ppd, threshold, half = 2)`. Day numbers are epoch days: day 0 is Thursday 1970-01-01, day 4 is Monday 1970-01-05.
  - `@gisik-nokma/flow-graph-browser` (private): `frameStats(gapsMs): FrameStats`, `samplePan(step, durationMs): Promise<number[]>`, `parseResult(body)`, `StressRecord`, `SceneName = 'time' | 'flow' | 'view'`, `BARS`, `barFor(record)`, `judge(record): string[]`, `timeScene`, `flowScene`; the page `stress.html?scene=time|flow|view&n=<count>[&auto=1]`; `window.__stress`; `POST /__results` appending to `test-results/stress.jsonl`.
  - The catalogue: `test-cases/29-workflow-timeline-graphs.md` with Part 1's per-task anchors and one Part anchor for each of Parts 2 to 5, and Features section 26 likewise (see the Global Constraints for the spellings).
  - The registration set and the gate pinned to the MEASURED count (46 when written).

**Why this task is first and what is in it.** The spec (section 2, "measure first") asks for the shipped Timeline to be measured before anything is lifted, so the harness, the sampler and the bars come first, with the engine's calendar module as the package's first real content (so `build`, `test` and `typecheck` all have something to run). The registration and the gate are here because every later task imports the package and every later task is gated.

- [ ] **Step 0: Pre-flight (read, do not edit)**
  - `git fetch origin`, then run the re-grep from the Global Constraints. Expect no output. If it prints `FEAT` or `FILE` lines, Drafts has landed: read its Features heading and its bucket number and keep section 26 and bucket 29 unless one of them is taken.
  - Confirm the starting state: `grep -n "41 successful, 41" scripts/ctl/verbs/gate.sh` finds the 41-only line; `ls packages` shows no `viewport` and no `flow-graph-browser`; `pnpm turbo run build test typecheck --dry=json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).tasks.length))'` prints 41 (run under Node 22).
  - Read the Knowledge Graph's harness for the shape this one copies: `git show origin/task/kg-c-t1-measure:packages/knowledge-graph-browser/harness/stress.ts` (or, if C T1 has merged, the same path on the release branch). The sampler, results and bars below are written to be compatible with it; where it differs, keep THIS plan's names (the two packages never import each other).

**PR A: widen the gate to 41 or 46 (its own PR, small, lands first)**

The verb that runs is the primary checkout's, which is 41-only; PR B's gate would fail there. KG C T1 solved this the same way (`36 or 41`, then pinned in its last commit). This PR changes only the verb, its fixtures, its docs and its case lines.

- [ ] **Step 1: The fixtures first (RED)**

  Cases 13.2020–13.2025 in `test-cases/13-deploy-and-ops.md`, the next free block after `13.1849` (re-check with `grep -n '^- 13\.20[0-9][0-9]' test-cases/*.md` and take the next free run of six if it has moved). In PR A the first five are written and 13.2025 is PENDING (it is the 46-only pin that PR B flips). `scripts/ctl/test/lib.test.sh` gains the block below (before the `ctl land` section), which fails until the verb accepts 46:

`scripts/ctl/test/lib.test.sh`:

```diff
--- a/scripts/ctl/test/lib.test.sh
+++ b/scripts/ctl/test/lib.test.sh
@@ -188,6 +188,19 @@
 check "13.1847 task count: CONTROL — anchored on the right: text after 'total' FAILS (41/41 total total)" 'out=$(FIXTURE_OK=41 FIXTURE_TASKS="41 total" gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *41 successful, 41 total total"'
 check "13.1848 task count: the transitional marker is gone — gate.sh carries no TEMPORARY \"36 or 41\" comment and names the 41-only line" '! grep -q "TEMPORARY \"36 or 41\"" "$HERE/verbs/gate.sh" && grep -q "41 successful, 41" "$HERE/verbs/gate.sh"'
 check "13.1849 task count: the verb is 41-only — 36/36 FAILS naming the Tasks line, release-kind and main-kind" '( for base in "--base release/x" ""; do out=$(FIXTURE_TASKS=36 gbr $base); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *36 successful, 36 total" || exit 1; done )'
+# 13.2020-13.2024 (13.2025 is the pending 46-only flip): Workflow and Timeline graphs Part 1 T1 adds packages/viewport (build, test, typecheck) and packages/flow-graph-browser
+# (test, typecheck), so its gate runs 46 tasks (41 + 5) while the verb that runs is the primary checkout's (41-only). The verb accepts 41 OR 46 until T1's last commit pins 46-only.
+# 13.1840-13.1849 above still hold (41 passes; 34, 35, 36, 37, 40, 42 and mixed pairs fail).
+check "13.2020 task count: a cached run of 46/46 passes the verb (WTG Part 1 T1's graph), and so does a fresh (main-kind) one" '( FIXTURE_TASKS=46 gbr --base release/x | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +46 successful, 46 total" && FIXTURE_TASKS=46 gbr | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh · Tasks: +46 successful, 46 total" )'
+check "13.2020 task count: CONTROL — 41/41 still passes on the same tip (the old graph, both kinds)" '( FIXTURE_TASKS=41 gbr --base release/x | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +41 successful, 41 total" && FIXTURE_TASKS=41 gbr | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh · Tasks: +41 successful, 41 total" )'
+for n in 44 45 47 51; do
+  check "13.2021 task count: CONTROL — $n/$n FAILS, naming the Tasks line (accepted by value, not by a range between the two graphs)" 'out=$(FIXTURE_TASKS='$n' gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *'$n' successful, '$n' total"'
+done
+check "13.2022 task count: CONTROL — mixed pair 41 successful of 46 total FAILS" 'out=$(FIXTURE_OK=41 FIXTURE_TASKS=46 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *41 successful, 46 total"'
+check "13.2022 task count: CONTROL — mixed pair 46 successful of 41 total FAILS" 'out=$(FIXTURE_OK=46 FIXTURE_TASKS=41 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *46 successful, 41 total"'
+check "13.2022 task count: CONTROL — a short 46-task run (45 of 46) FAILS, release-kind and main-kind" '( for base in "--base release/x" ""; do out=$(FIXTURE_OK=45 FIXTURE_TASKS=46 gbr $base); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *45 successful, 46 total" || exit 1; done )'
+check "13.2023 task count: CONTROL — the match is anchored: 146 of 46 and 46 of 460 FAIL (an accepted count as the tail of a longer one, and as the prefix of the total)" '( out=$(FIXTURE_OK=146 FIXTURE_TASKS=46 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *146 successful, 46 total" && out=$(FIXTURE_OK=46 FIXTURE_TASKS=460 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *46 successful, 460 total" )'
+check "13.2024 task count: the TEMPORARY marker is greppable — gate.sh names the 41-or-46 pair and WTG Part 1 T1's LAST commit as the one that pins 46-only" 'grep -q "TEMPORARY \"41 or 46\"" "$HERE/verbs/gate.sh" && grep -q "WTG Part 1 T1.s LAST commit pins 46-ONLY" "$HERE/verbs/gate.sh"'
 ( cd "$br" && $G reset -q --hard HEAD~1 )
 # ctl land, against a fake gh that answers pr view/comment and performs the merge for real inside the fixture bare repo.
 fg=$(mktemp -d); cat > "$fg/gh" <<'FAKEGH'
```

  Run: `slot-run.sh ctl -- bash scripts/ctl/test/lib.test.sh > /tmp/ctl.log 2>&1; tail -n 30 /tmp/ctl.log`. Expected before step 2: the new `13.2020`, `13.2021` (two of its four arms), `13.2022` and `13.2023` checks FAIL. The control arms that are expected to fail on a 46 run (44, 45, 47, 51, mixed pairs, 146/46, 46/460) already pass, which is the point: they are the controls.

- [ ] **Step 2: The verb accepts 41 or 46**

`scripts/ctl/verbs/gate.sh`:

```diff
--- a/scripts/ctl/verbs/gate.sh
+++ b/scripts/ctl/verbs/gate.sh
@@ -52,7 +52,11 @@
 [ "$ran" = "$mode" ] || ctl_fail gate "$summary — asked for $mode, gate.sh ran ${ran:-nothing} (log $log)"
 # The gate graph: 36 (through G-9's workflow-canvas-browser) + 5 for Knowledge Graph C T1 (packages/knowledge-graph: build, test, typecheck;
 # packages/knowledge-graph-browser: test, typecheck) = 41. The match is anchored, so 141, 410 and mixed pairs fail (13.1840-13.1849).
-echo "$T" | grep -Eq '^Tasks: +41 successful, 41 total *$' || ctl_fail gate "$summary (log $log)"
+# TEMPORARY "41 or 46": Workflow and Timeline graphs Part 1 T1 adds packages/viewport (build, test, typecheck) and packages/flow-graph-browser
+# (test, typecheck), so its gate is 46, while the verb that runs is the PRIMARY checkout's (41-only). Both halves must match one graph: an anchored
+# two-alternative match, so 4146, 460/410 and mixed pairs fail. WTG Part 1 T1's LAST commit pins 46-ONLY here (and flips 13.2025 to a FAIL control);
+# delete this comment with the 41 arm. Same shape as KG C T1's "36 or 41" (13.1844-13.1849).
+echo "$T" | grep -Eq '^Tasks: +(41 successful, 41|46 successful, 46) total *$' || ctl_fail gate "$summary (log $log)"
 echo "$N" | grep -q 'NODE=v22\.' || ctl_fail gate "$summary (log $log)"
 [ "$eng" -eq 0 ] || ctl_fail gate "Unsupported engine ×$eng (log $log)"
 [ "$to" -eq 0 ] || ctl_fail gate "Hook timed out ×$to — re-gate on a quiet box (log $log)"
```

  The match stays anchored and has two whole alternatives, so `41 successful, 46 total` and `146 successful, 46 total` still fail. Re-run step 1's command: all green.

- [ ] **Step 3: The docs and the case lines**

`docs/lanes/gate-lock/README.md`:

```diff
--- a/docs/lanes/gate-lock/README.md
+++ b/docs/lanes/gate-lock/README.md
@@ -149,7 +149,7 @@
 **The cache is only as sound as `turbo.json`'s `inputs`.** `scripts/ctl/test/gate-cache.test.sh` (a `ctl selftest` step) proves a
 changed cross-package reader changes the task hash (`ui#test` after an `apps/web/src` edit; `mobile#test` after a
 `packages/editor` CSS edit; and one row for every other declared non-dependency input, cases 13.1712–13.1715, each shown red when its
-`turbo.json` entry is removed) and that an unrelated file does not; `ctl gate` itself fails any run that is not 41/41 (13.1716, 13.1840–13.1849); `--real` shows it through turbo's own cache (warm → HIT → change →
+`turbo.json` entry is removed) and that an unrelated file does not; `ctl gate` itself fails any run that is not 41/41 or 46/46 (13.1716, 13.1840–13.1849, 13.2020–13.2024; the 41 arm is TEMPORARY until WTG Part 1 T1 pins 46-only); `--real` shows it through turbo's own cache (warm → HIT → change →
 MISS), run 2026-10-02: `warm=miss rerun=hit unrelated-change=hit reader-change=miss` for both. The audit found, and `turbo.json`
 now declares: ui (client source roots + `apps/*/test`, `packages/*/test`, the `package.json` globs), app-core (the help suite walks
 `apps/**` and `packages/**`, minus build output — the `!` negations are mandatory: a glob input walks the DISK and ignores
```

  `Features.md`, the gate bullet (find it with `grep -n "the verb also fails any run" Features.md`): replace the sentence

```text
the verb also fails any run that is not `41 successful, 41 total` — an anchored match (13.1716, 13.1840–13.1849: 41/41 passes; 34/34, 35/35, 36/36, 37/37, 40/40, 42/42, mixed pairs, short runs and 141/41-style supersets fail).
```

  with

```text
the verb also fails any run that is not `41 successful, 41 total` or `46 successful, 46 total` (the 41 arm is TEMPORARY until Workflow and Timeline graphs Part 1 T1 pins 46-only; 13.2020–13.2024) — an anchored match (13.1716, 13.1840–13.1849: 41/41 passes; 34/34, 35/35, 36/36, 37/37, 40/40, 42/42, mixed pairs, short runs and 141/41-style supersets fail).
```

  `test-cases/13-deploy-and-ops.md`, after the `13.1849` line:

`test-cases/13-deploy-and-ops.md`:

```diff
--- a/test-cases/13-deploy-and-ops.md
+++ b/test-cases/13-deploy-and-ops.md
@@ -763,6 +763,12 @@
 - 13.1847 🧪 CONTROL for 13.1844: the match is anchored — `141 successful, 41 total` (the accepted count as the tail of a longer one), `41 successful, 410 total` (as the prefix of the total) and `41 successful, 41 total total` (text after `total`) all FAIL. Mutation measured: dropping `^Tasks: +` (a bare substring match) turns the 141 arm RED; dropping ` total *$` (a prefix match) turns the 410 and `total total` arms RED; dropping only the trailing ` *$` turns the `total total` arm RED. Equivalent mutant, measured and left alone: dropping only the `^` (the sed makes the line begin with `Tasks:` anyway).
 - 13.1848 🧪 The transitional marker is gone: `gate.sh` carries no `TEMPORARY "36 or 41"` comment and names the 41-only line, so the 36 arm cannot linger. Mutation: restoring the comment turns it RED.
 - 13.1849 🧪 The verb is 41-only: `36 successful, 36 total` FAILS naming the Tasks line for a release-kind and a main-kind run, and 41/41 passes (13.1840, 13.1844). Landed with Knowledge Graph C T1's last commit; it was ❌ PENDING while the tip accepted both. Mutation measured: re-admitting the 36 arm turns it RED.
+- 13.2020 🧪 `ctl gate` accepts a 46-task run: a fixture gate printing `Tasks: 46 successful, 46 total` is OK for a release-kind (`mode=cached`) and a main-kind (`mode=fresh`) run, and 41/41 still passes both. Why: the verb that runs is the PRIMARY checkout's (41-only, 13.1849), but Workflow and Timeline graphs Part 1 T1 adds `packages/viewport` (build, test, typecheck) and `packages/flow-graph-browser` (test, typecheck), so its gate is 46 tasks, and the T1 lane's gate would FAIL the verb whatever its branch (the KG C T1 precedent, `36 or 41`). The verb accepts `41 successful, 41` OR `46 successful, 46` (`scripts/ctl/verbs/gate.sh`, an anchored two-alternative `grep -E`), with a TEMPORARY marker, until T1's last commit pins 46-only. Mutation measured: narrowing the pattern to 41-only turns 13.2020's 46 arms RED.
+- 13.2021 🧪 CONTROL for 13.2020: `44/44`, `45/45`, `47/47` and `51/51` still FAIL naming the Tasks line — the two graphs are accepted by value, not by a range between them. Mutation measured: admitting any `N/N` turns every 13.2021 arm RED (and 13.1841's, 13.1843's, 13.1716's).
+- 13.2022 🧪 CONTROL for 13.2020: mixed pairs (`41 successful, 46 total`; `46 successful, 41 total`) and a short 46-task run (`45 successful, 46 total`, release-kind and main-kind) FAIL — successful and total must name the SAME graph.
+- 13.2023 🧪 CONTROL for 13.2020: the match is anchored on both sides — `146 successful, 46 total` (a longer count ending in an accepted one) and `46 successful, 460 total` (an accepted count as a prefix of the total) FAIL. Mutation measured: dropping the `^Tasks: +` prefix turns the 146 arm RED; dropping the ` total *$` suffix turns the 460 arm RED.
+- 13.2024 🧪 The TEMPORARY marker is greppable: `gate.sh` carries `TEMPORARY "41 or 46"` and names WTG Part 1 T1's last commit as the one that pins 46-only, so the removal is not forgotten. Mutation: deleting the comment turns it RED.
+- 13.2025 ❌ PENDING (lands with Part 1 T1's last commit, which takes gate.sh's 46-only line): the verb is 46-only — `41 successful, 41 total` FAILS naming the Tasks line for a release-kind and a main-kind run, 46/46 passes, and 13.1840/13.2020's 41 arms flip to FAIL controls. Not covered here: this tip accepts both.
 
 ## CI repair: when CI runs, and the failures it had hidden (`task/ci-repair`, owner 2026-10-02: *"check the CI again … CI to be run only on merges to main"*)
 
```

- [ ] **Step 4: Verify, open PR A, hand off**
  - `slot-run.sh ctl -- scripts/ctl/ctl selftest > /tmp/ctl.log 2>&1; tail -n 30 /tmp/ctl.log` (the whole ctl battery, `pnpm check:ctl`) and `pnpm check:citations`; name the run LOCAL.
  - Mutation: change the alternation to `46` only → the 13.1840 arms and the 13.2020 control go RED; remove the leading `^` or the trailing ` *$` → the 13.2023 arms go RED. Record both in the HANDOFF.
  - `ctl pr open --repo <worktree> --base release/workflow-graph --title "gate: accept 41 or 46 (WTG Part 1 T1, transitional)" --body <ABSOLUTE path>`; `ctl gate <sha> --base release/workflow-graph`; `ctl land <pr> --base release/workflow-graph`.
  - **Report to the controller: `NEEDS: owner pulls the primary checkout`**, with the merge sha. Do not wait; PR B's work needs no gate until step 17.
  - **OWNER ACTION:** the owner pulls the primary checkout (on the release branch it stands on) after PR A merges, so the verb that runs accepts 41 or 46. PR B's step 17 gate waits for it.

**PR B: measure, build, register, seed**

- [ ] **Step 5: The viewport package skeleton (RED first)**

  `packages/viewport/package.json` (the package is private and built with `tsc`, like `@gisik-nokma/ui`; app-core imports its `dist`):

`packages/viewport/package.json` (new):

```json
{
  "name": "@gisik-nokma/viewport",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.typecheck.json"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vitest": "^3.1.0"
  }
}
```

  `tsconfig.json`, `tsconfig.typecheck.json` (typechecks `src` and `test`, no emit) and `vitest.config.ts` (the shared 20 s / 30 s budget):

`packages/viewport/tsconfig.json` (new):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2023", "DOM"]
  },
  "include": ["src"]
}
```

`packages/viewport/tsconfig.typecheck.json` (new):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "lib": ["ES2023", "DOM"]
  },
  "include": ["src", "test"]
}
```

`packages/viewport/vitest.config.ts` (new):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // HK-7 (13.1733): one budget for every package, as apps/server's 30_000 already was; parallel runs stay.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

  The test comes before the module (case 29.014):

`packages/viewport/test/calendar-days.test.ts` (new):

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { axisLevels, crossFade, isMonday, isWeekend, mondayOnOrBefore, mondaysIn, weekdayOf } from '../src/index.js';

describe('29.014 calendar days and the axis levels', () => {
  it('29.014 day 4 is a Monday, day 2 a Saturday, day 3 a Sunday; Mondays are 7 apart; control: day 0 (Thursday) is no Monday', () => {
    expect(weekdayOf(4)).toBe(0);
    expect(isMonday(4)).toBe(true);
    expect(isWeekend(2)).toBe(true);
    expect(isWeekend(3)).toBe(true);
    expect(isWeekend(4)).toBe(false);
    expect(isMonday(0)).toBe(false);
    expect(weekdayOf(-3)).toBe(0); // 1969-12-29, a Monday
    expect(mondayOnOrBefore(10)).toBe(4);
    expect(mondaysIn(5, 30)).toEqual([11, 18, 25]);
    expect(mondaysIn(4, 4)).toEqual([4]);
  });

  it('29.014 week labels from 16 px/day, day numbers cross-fade around 20 and are absent at Month zoom, the tint starts at 16; control: 8 px/day has none of them', () => {
    expect(axisLevels(8)).toEqual({ weekLabels: false, dayNumbers: 0, weekendTint: false });
    expect(axisLevels(16)).toMatchObject({ weekLabels: true, weekendTint: true, dayNumbers: 0 });
    expect(axisLevels(20).dayNumbers).toBe(0.5);
    expect(axisLevels(24).dayNumbers).toBe(1);
    expect(crossFade(18, 20)).toBe(0);
    expect(crossFade(22, 20)).toBe(1);
  });
});
```

  Run `pnpm install` (Node 22; it only adds the two new importer blocks to `pnpm-lock.yaml`, so check `git diff --stat pnpm-lock.yaml` shows nothing else), then `slot-run.sh vp -- pnpm --filter @gisik-nokma/viewport test`. Expected: FAIL (`Cannot find module '../src/calendar-days.js'`).

- [ ] **Step 6: The calendar module and the first index**

`packages/viewport/src/calendar-days.ts` (new):

```ts
/**
 * Calendar arithmetic on integer DAY NUMBERS (days since 1970-01-01, the IST calendar's date read as a plain date).
 * No `Date`, no clock, no locale: 1970-01-01 was a Thursday, so day 4 (1970-01-05) is a Monday.
 */
export const DAYS_PER_WEEK = 7;

/** 0 = Monday ... 6 = Sunday. */
export function weekdayOf(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}
export const isMonday = (day: number): boolean => weekdayOf(day) === 0;
export const isWeekend = (day: number): boolean => weekdayOf(day) >= 5;
export const mondayOnOrBefore = (day: number): number => day - weekdayOf(day);

/** Every Monday in [first, last], ascending. */
export function mondaysIn(first: number, last: number): number[] {
  const out: number[] = [];
  for (let d = first + ((7 - weekdayOf(first)) % 7); d <= last; d += 7) out.push(d);
  return out;
}

/** The header levels at a scale (VP-11). `weekLabels`: "W 28 Sep" at 16 px/day and up, month labels below. */
export function axisLevels(ppd: number): { weekLabels: boolean; dayNumbers: number; weekendTint: boolean } {
  return { weekLabels: ppd >= 16, dayNumbers: crossFade(ppd, 20), weekendTint: ppd >= 16 };
}

/** 0 below `threshold - 2`, 1 from `threshold + 2`, linear between: a cross-fade, never a pop. */
export function crossFade(ppd: number, threshold: number, half = 2): number {
  return Math.min(1, Math.max(0, (ppd - (threshold - half)) / (2 * half)));
}
```

`packages/viewport/src/index.ts` (new):

```ts
export * from './calendar-days.js';
```

  `index.ts` grows one `export *` line per task (T2 to T7); on a merge take the union.

  Run: `slot-run.sh vp -- pnpm --filter @gisik-nokma/viewport test` (expected 2 tests green), then `pnpm --filter @gisik-nokma/viewport typecheck` and `pnpm --filter @gisik-nokma/viewport build` (expected `dist/index.js` and `dist/index.d.ts`).

- [ ] **Step 7: The browser package: sampler, results, bars (RED first)**

  `packages/flow-graph-browser/package.json` and `tsconfig.json`:

`packages/flow-graph-browser/package.json` (new):

```json
{
  "name": "@gisik-nokma/flow-graph-browser",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@gisik-nokma/app-core": "workspace:*",
    "@gisik-nokma/ui": "workspace:*",
    "@gisik-nokma/viewport": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.6.3",
    "vite": "^6.0.0"
  }
}
```

`packages/flow-graph-browser/tsconfig.json` (new):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["harness", "tests", "*.ts"]
}
```

  The three pure modules' specs first (cases 29.001, 29.005, 29.006). They are Playwright specs that import plain TypeScript, so they run in Node without a browser:

`packages/flow-graph-browser/tests/sampler.spec.ts` (new):

```ts
import { expect, test } from '@playwright/test';
import { frameStats } from '../harness/sampler.js';

test('29.001 frameStats: 60 fps steady is 60 and 16.7 ms; a planted 120 ms stall is the worst frame and is counted over every budget; control: no stall, none over', () => {
  const steady = Array.from({ length: 120 }, () => 16.7);
  const base = frameStats(steady);
  expect(base).toMatchObject({ frames: 120, fps: 59.9, worstMs: 16.7, p95Ms: 16.7, over167: 0, over20: 0, over50: 0 });

  const stalled = [...steady];
  stalled[60] = 120;
  const s = frameStats(stalled);
  expect(s.worstMs).toBe(120);
  expect([s.over167, s.over20, s.over50]).toEqual([1, 1, 1]);
  // the mean moves a little, the worst frame moves a lot: the bars are written in the worst frame for this reason
  expect(s.fps).toBeLessThan(base.fps);
  expect(s.p95Ms).toBe(16.7);
});

test('29.001 frameStats: p95 is the 95th-percentile gap, 5 slow frames in 100 put it on the slow value, 4 do not; no frames is refused, not reported as 0 fps', () => {
  const gaps = (slow: number) => [...Array.from({ length: 100 - slow }, () => 10), ...Array.from({ length: slow }, () => 40)];
  expect(frameStats(gaps(5)).p95Ms).toBe(10);
  expect(frameStats(gaps(6)).p95Ms).toBe(40);
  expect(() => frameStats([])).toThrow(RangeError);
});
```

`packages/flow-graph-browser/tests/results.spec.ts` (new):

```ts
import { expect, test } from '@playwright/test';
import { parseResult } from '../harness/results.js';

const pan = { frames: 120, fps: 59.9, worstMs: 18.2, p95Ms: 16.9, over167: 3, over20: 0, over50: 0 };
const good = { scene: 'time', count: 1200, device: 'Mozilla/5.0 (iPhone)', touch: true, pan, clickToSettleMs: null };

test('29.005 parseResult accepts a run record and refuses everything else; control: one field changed at a time', () => {
  expect(parseResult(good)).toEqual({ ok: true, record: good });
  expect(parseResult({ ...good, scene: 'view', clickToSettleMs: 41.5 }).ok).toBe(true);
  for (const bad of [
    null,
    'x',
    { ...good, scene: 'graph' },
    { ...good, count: -1 },
    { ...good, device: '' },
    { ...good, touch: 'yes' },
    { ...good, pan: null },
    { ...good, pan: { ...pan, fps: Number.NaN } },
    { ...good, pan: { ...pan, worstMs: '18' } },
    { ...good, clickToSettleMs: 'fast' },
  ]) {
    expect(parseResult(bad).ok, JSON.stringify(bad)).toBe(false);
  }
});
```

`packages/flow-graph-browser/tests/bars.spec.ts` (new):

```ts
import { expect, test } from '@playwright/test';
import { BARS, barFor, judge } from '../harness/bars.js';
import type { StressRecord } from '../harness/results.js';

const pan = { frames: 240, fps: 60, worstMs: 20, p95Ms: 16.7, over167: 2, over20: 0, over50: 0 };
const record = (over: Partial<StressRecord> & { pan?: Partial<StressRecord['pan']> }): StressRecord => ({
  scene: 'time',
  count: 1200,
  device: 'test',
  touch: false,
  clickToSettleMs: null,
  ...over,
  pan: { ...pan, ...over.pan },
});

test('29.006 the pan bars are the spec numbers (section 13) and judge holds a record to them: exactly on the bar passes, a hair under on fps or over on the worst frame fails, and a lighter load is refused', () => {
  expect(BARS.time.desktop).toEqual({ count: 1200, minFps: 60, maxWorstMs: 20 });
  expect(BARS.time.phone).toEqual({ count: 600, minFps: 30, maxWorstMs: 50 });
  expect(BARS.flow.desktop).toEqual({ count: 300, minFps: 60, maxWorstMs: 16.7 });
  expect(BARS.flow.phone).toEqual({ count: 100, minFps: 30, maxWorstMs: 50 });
  expect(BARS.view.desktop.count).toBe(2000);
  expect(BARS.view.phone.maxWorstMs).toBe(50);
  // CONTROL, same test: exactly on the bar passes
  expect(judge(record({}))).toEqual([]);
  expect(judge(record({ touch: true, count: 600, pan: { fps: 30, worstMs: 50 } }))).toEqual([]);
  // one number at a time over the line
  expect(judge(record({ pan: { fps: 59.9 } }))).toEqual(['59.9 fps is under 60']);
  expect(judge(record({ pan: { worstMs: 20.1 } }))).toEqual(['worst frame 20.1 ms is over 20']);
  expect(judge(record({ scene: 'flow', count: 300, pan: { worstMs: 16.8 } }))).toEqual(['worst frame 16.8 ms is over 16.7']);
  // a lighter load says nothing about the bar
  expect(judge(record({ count: 1199 }))).toEqual(["load 1199 is below the bar's 1200"]);
  // the phone bar is chosen by touch, not by the scene
  expect(barFor(record({ touch: true }))).toBe(BARS.time.phone);
  expect(judge(record({ touch: true, count: 600, pan: { fps: 29 } }))).toEqual(['29 fps is under 30']);
});
```

  Then the modules:

`packages/flow-graph-browser/harness/sampler.ts` (new):

```ts
/**
 * Frame pacing for the stress scenes (Workflow and Timeline graphs, Part 1 T1; spec §13 pan bars).
 *
 * PURE: `frameStats` takes the gaps between consecutive animation frames in milliseconds and answers the three numbers the
 * bars are written in (frames a second, the worst frame, how many frames missed a budget). `samplePan` is the only DOM-facing
 * function: it drives a scripted pan on `requestAnimationFrame` and returns the gaps.
 */
export type FrameStats = {
  frames: number;
  /** 1000 / the mean gap. */
  fps: number;
  /** The largest gap. The bars say "worst frame <= N ms". */
  worstMs: number;
  p95Ms: number;
  /** Frames whose gap exceeded 16.7, 20 and 50 ms (a 60 fps frame, the desktop bar, the phone bar). */
  over167: number;
  over20: number;
  over50: number;
};

export function frameStats(gapsMs: readonly number[]): FrameStats {
  if (gapsMs.length === 0) throw new RangeError('frameStats: no frames were sampled');
  const sorted = [...gapsMs].sort((a, b) => a - b);
  const sum = gapsMs.reduce((total, gap) => total + gap, 0);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] as number;
  const round = (n: number): number => Math.round(n * 10) / 10;
  return {
    frames: gapsMs.length,
    fps: round(1000 / (sum / gapsMs.length)),
    worstMs: round(sorted[sorted.length - 1] as number),
    p95Ms: round(p95),
    over167: gapsMs.filter((gap) => gap > 16.7).length,
    over20: gapsMs.filter((gap) => gap > 20).length,
    over50: gapsMs.filter((gap) => gap > 50).length,
  };
}

/**
 * Runs `step(dtMs, elapsedMs)` once per animation frame for `durationMs` and returns the gaps between frames. The first gap
 * (start-up, not a pan frame) is dropped. `step` is where a scene moves: `scrollLeft += ...`, or a camera transform.
 */
export function samplePan(step: (dtMs: number, elapsedMs: number) => void, durationMs: number): Promise<number[]> {
  return new Promise((resolve) => {
    const gaps: number[] = [];
    let last = 0;
    let start = 0;
    const frame = (now: number): void => {
      if (last === 0) {
        last = now;
        start = now;
        requestAnimationFrame(frame);
        return;
      }
      const dt = now - last;
      last = now;
      step(dt, now - start);
      gaps.push(dt);
      if (now - start < durationMs) requestAnimationFrame(frame);
      else resolve(gaps);
    };
    requestAnimationFrame(frame);
  });
}
```

`packages/flow-graph-browser/harness/results.ts` (new):

```ts
/**
 * The record a stress run leaves behind. A phone cannot be driven by a test runner, so a run on it (`stress.html?auto=1`)
 * shows its numbers on screen AND posts them to the dev server (`/__results`, see vite.config.ts), which appends one JSON line
 * per run to `results/stress.jsonl`. `parseResult` is the one gate on that file: a body that is not a run record is refused,
 * so a stray request cannot put a line in it.
 */
import type { FrameStats } from './sampler.js';

export type SceneName = 'time' | 'flow' | 'view';
export type StressRecord = {
  scene: SceneName;
  /** What was on the page: mounted bars, nodes, or dated tickets. */
  count: number;
  /** `navigator.userAgent`, so a line says which device it came from. */
  device: string;
  /** Ran on a real touch device (`maxTouchPoints > 0`). */
  touch: boolean;
  /** The scripted pan: the second pass of three (the first is warm-up). */
  pan: FrameStats;
  /** `scene === 'view'` only: ms from a click to the frame after it settled. Null for the other scenes. */
  clickToSettleMs: number | null;
};

const SCENES: readonly SceneName[] = ['time', 'flow', 'view'];
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The record, or the reason the body is not one. */
export function parseResult(body: unknown): { ok: true; record: StressRecord } | { ok: false; reason: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, reason: 'not an object' };
  const b = body as Record<string, unknown>;
  if (!SCENES.includes(b['scene'] as SceneName)) return { ok: false, reason: `unknown scene ${String(b['scene'])}` };
  if (!isNumber(b['count']) || b['count'] < 0) return { ok: false, reason: 'count must be a non-negative number' };
  if (typeof b['device'] !== 'string' || b['device'].length === 0) return { ok: false, reason: 'device must be a non-empty string' };
  if (typeof b['touch'] !== 'boolean') return { ok: false, reason: 'touch must be a boolean' };
  const pan = b['pan'] as Record<string, unknown> | null;
  if (typeof pan !== 'object' || pan === null) return { ok: false, reason: 'pan must be a stats object' };
  for (const key of ['frames', 'fps', 'worstMs', 'p95Ms', 'over167', 'over20', 'over50']) {
    if (!isNumber(pan[key])) return { ok: false, reason: `pan.${key} must be a number` };
  }
  if (b['clickToSettleMs'] !== null && !isNumber(b['clickToSettleMs'])) return { ok: false, reason: 'clickToSettleMs must be a number or null' };
  return { ok: true, record: body as StressRecord };
}
```

`packages/flow-graph-browser/harness/bars.ts` (new):

```ts
/**
 * The pan bars of the Workflow and Timeline graphs spec, section 13, as data (Part 1 T1). A stress record is judged against the
 * bar for its scene and device: it must have been taken at AT LEAST the load the bar is written for (a record of 300 bars says
 * nothing about 1,200), and must clear both numbers.
 *
 * Headless Chromium composites in software, so a headless record is a floor and never evidence of a pass: `judge` says what a
 * record would be worth against the bar, and the plan quotes only `FG_HEADED=1` and real-phone records as passes.
 */
import type { SceneName, StressRecord } from './results.js';

export type Bar = {
  /** The load the bar is written for: mounted bars, nodes, or dated tickets. */
  count: number;
  minFps: number;
  maxWorstMs: number;
};

/** Spec section 13: pan, desktop (an M2 Pro class machine) and pan, phone (a real mid-range phone). */
export const BARS: Readonly<Record<SceneName, { desktop: Bar; phone: Bar }>> = {
  /** Home Timeline at 10,000 index entries: at most 1,200 mounted bars on desktop, 600 on a phone. */
  time: { desktop: { count: 1200, minFps: 60, maxWorstMs: 20 }, phone: { count: 600, minFps: 30, maxWorstMs: 50 } },
  /** A flow of 300 bars or nodes on desktop, 100 on a phone. */
  flow: { desktop: { count: 300, minFps: 60, maxWorstMs: 16.7 }, phone: { count: 100, minFps: 30, maxWorstMs: 50 } },
  /** The existing project Timeline at 2,000 dated tickets: "the desktop and phone numbers above" (the 1,200 / 600 bar row). */
  view: { desktop: { count: 2000, minFps: 60, maxWorstMs: 20 }, phone: { count: 2000, minFps: 30, maxWorstMs: 50 } },
};

export function barFor(record: Pick<StressRecord, 'scene' | 'touch'>): Bar {
  return BARS[record.scene][record.touch ? 'phone' : 'desktop'];
}

/** The reasons the record misses its bar; an empty list is a pass. */
export function judge(record: StressRecord): string[] {
  const bar = barFor(record);
  const failures: string[] = [];
  if (record.count < bar.count) failures.push(`load ${record.count} is below the bar's ${bar.count}`);
  if (record.pan.fps < bar.minFps) failures.push(`${record.pan.fps} fps is under ${bar.minFps}`);
  if (record.pan.worstMs > bar.maxWorstMs) failures.push(`worst frame ${record.pan.worstMs} ms is over ${bar.maxWorstMs}`);
  return failures;
}
```

  The bars are data on purpose: `judge` is the one place the section 13 numbers are written, and Part 4 reads them from here.

- [ ] **Step 8: The scenes, the page, the Vite and Playwright configs**

  `scenes.ts` holds the two synthetic scenes (plain DOM, so what is measured is the cost of the SURFACE: a native scroller full of absolutely placed bars, a transformed layer of boxes and SVG paths). Colours are literals on purpose: this is a measurement harness outside the colour scan's roots.

`packages/flow-graph-browser/harness/scenes.ts` (new):

```ts
/**
 * The synthetic scenes of the §13 pan bars. Each scene is plain DOM driven by a scripted pan, so what is measured is the cost
 * of the SURFACE the engine will move (compositing a native scroller full of absolutely placed bars, or a transformed layer of
 * nodes and edges), not React and not the product's code. The product's own view is the `view` scene (`stress.tsx`).
 *
 * Colours are literals on purpose: this is a measurement harness, not product UI, and it sits outside the colour scan's roots.
 */
import { frameStats, samplePan, type FrameStats } from './sampler.js';

export type Scene = {
  /** Mounted bars or nodes. */
  count: number;
  /** One scripted pan of `durationMs`; resolves with its frame statistics. */
  pan(durationMs: number): Promise<FrameStats>;
};

const ACCENT = '#2f5f9e';

/**
 * Home's Timeline shape (spec §13, "Pan, desktop ... <= 1,200 mounted bars"): a native scroll container three viewports wide
 * holding `bars` absolutely placed 28 px bars in 40 px rows, each a button with a key and a title like the product's bars.
 * The pan scrolls one viewport per second, bouncing at the ends, which is what the engine's keyboard glide and a fling ask of it.
 */
export function timeScene(host: HTMLElement, bars: number): Scene {
  host.replaceChildren();
  const scroller = document.createElement('div');
  scroller.style.cssText = 'width:100%;height:70vh;overflow:auto;overscroll-behavior:contain;position:relative;background:#f0e9e1';
  const surface = document.createElement('div');
  const viewport = Math.max(320, host.clientWidth || window.innerWidth);
  const rows = 14;
  surface.style.cssText = `position:relative;width:${viewport * 3}px;height:${rows * 40 + 34}px`;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < bars; i += 1) {
    const bar = document.createElement('button');
    const width = 36 + ((i * 29) % 220);
    bar.style.cssText = `position:absolute;left:${(i * 53) % (viewport * 3 - width)}px;top:${34 + (i % rows) * 40 + 6}px;width:${width}px;height:28px;border:none;border-radius:6px;background:${ACCENT};color:#fff;font:600 11px system-ui;text-align:left;overflow:hidden;white-space:nowrap`;
    bar.textContent = `GN-${100 + i}  Ticket ${i} with a long title`;
    fragment.appendChild(bar);
  }
  surface.appendChild(fragment);
  scroller.appendChild(surface);
  host.appendChild(scroller);
  return {
    count: bars,
    async pan(durationMs) {
      scroller.scrollLeft = 0;
      let direction = 1;
      const gaps = await samplePan((dt) => {
        const max = scroller.scrollWidth - scroller.clientWidth;
        const next = scroller.scrollLeft + direction * (scroller.clientWidth * dt) / 1000;
        if (next >= max || next <= 0) direction = -direction;
        scroller.scrollLeft = Math.min(max, Math.max(0, next));
      }, durationMs);
      return frameStats(gaps);
    },
  };
}

/**
 * The flow graph's shape ("a flow of 300 bars/nodes"): one layer under one transform holding `nodes` boxes and about 1.3
 * edges per node as SVG paths, panned and gently zoomed the way `CameraAdapter` moves it.
 */
export function flowScene(host: HTMLElement, nodes: number): Scene {
  host.replaceChildren();
  const view = document.createElement('div');
  view.style.cssText = 'width:100%;height:70vh;overflow:hidden;position:relative;touch-action:none;background:#f0e9e1';
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform';
  const columns = 12;
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  const rowsCount = Math.ceil(nodes / columns);
  svg.setAttribute('width', String(columns * 180));
  svg.setAttribute('height', String(rowsCount * 80));
  svg.style.cssText = 'position:absolute;left:0;top:0';
  const at = (i: number): { x: number; y: number } => ({ x: (i % columns) * 180 + 10, y: Math.floor(i / columns) * 80 + 10 });
  const edges = Math.floor(nodes * 1.3);
  for (let e = 0; e < edges; e += 1) {
    const from = at(e % nodes);
    const to = at((e * 7 + 13) % nodes);
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', `M${from.x + 140} ${from.y + 22} L${from.x + 160} ${from.y + 22} L${from.x + 160} ${to.y + 22} L${to.x} ${to.y + 22}`);
    path.setAttribute('stroke', '#8a7f74');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);
  }
  layer.appendChild(svg);
  for (let i = 0; i < nodes; i += 1) {
    const { x, y } = at(i);
    const node = document.createElement('div');
    node.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:140px;height:44px;border-radius:8px;background:${ACCENT};color:#fff;font:600 11px system-ui;padding:6px;box-sizing:border-box;overflow:hidden`;
    node.textContent = `GN-${100 + i} Step ${i}`;
    layer.appendChild(node);
  }
  view.appendChild(layer);
  host.replaceChildren(view);
  return {
    count: nodes,
    async pan(durationMs) {
      let x = 0;
      const gaps = await samplePan((dt, elapsed) => {
        x += (view.clientWidth * dt) / 1000;
        const zoom = 1 + 0.2 * Math.sin(elapsed / 700);
        layer.style.transform = `translate3d(${-(x % (columns * 180))}px,0,0) scale(${zoom})`;
      }, durationMs);
      return frameStats(gaps);
    },
  };
}
```

  `stress.html` and `stress.tsx`. The `view` scene mounts the product's own `TimelineView` with `n` dated tickets; at this task it is the SHIPPED week-column grid (no `.gn-timeline__canvas` exists, so the pan scrolls the page); after T9 it is the continuous view and the same page measures both. `clickToSettle` presses `Later` if the page has it and `Today` otherwise.

`packages/flow-graph-browser/harness/stress.html` (new):

```html
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>flow graph stress</title></head>
<body style="margin:0;font-family:system-ui"><div id="host"></div>
<button id="run" style="font-size:20px;padding:12px 20px;margin:8px">Run</button><pre id="out" style="font-size:16px;white-space:pre-wrap"></pre>
<script type="module" src="./stress.tsx"></script></body></html>
```

`packages/flow-graph-browser/harness/stress.tsx` (new):

```tsx
import { createRoot } from 'react-dom/client';
import { TimelineView, type TicketDatesInput } from '@gisik-nokma/app-core';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import '@gisik-nokma/ui/ui.css';
import { frameStats, samplePan } from './sampler.js';
import type { SceneName, StressRecord } from './results.js';
import { flowScene, timeScene, type Scene } from './scenes.js';

/**
 * `stress.html?scene=time|flow|view&n=<count>[&auto=1]`. Three pans; the first is warm-up and the second is the record
 * (`window.__stress`, the screen, and POST /__results). `view` is the product's own Timeline view at `n` dated tickets: at T1
 * it is the shipped week-column grid (the baseline); after the lift it is the continuous view, so the same page measures both.
 */
const params = new URLSearchParams(location.search);
const scene = (params.get('scene') ?? 'time') as SceneName;
const DEFAULTS: Record<SceneName, number> = { time: 1200, flow: 300, view: 2000 };
const count = Number(params.get('n') ?? DEFAULTS[scene]);
const host = document.getElementById('host') as HTMLElement;
const out = document.getElementById('out') as HTMLElement;
document.documentElement.dataset['style'] = 'neo';
const themeTag = document.createElement('style');
themeTag.textContent = themeStylesheet();
document.head.appendChild(themeTag);

const claim = (value: unknown) => ({ value, actorId: 'u1', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' });
const DAY = 86_400_000;
const TODAY = '2026-10-03';
function tickets(n: number): TicketDatesInput[] {
  const base = Date.parse(`${TODAY}T00:00:00Z`) - 28 * DAY;
  return Array.from({ length: n }, (_, i) => {
    const start = base + ((i * 7) % 700) * DAY;
    const end = start + (i % 14) * DAY;
    const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
    return {
      key: `GN-${100 + i}`,
      state: {
        kind: 'ticket', id: `t${i}`, workspaceId: 'w', projectId: 'p', typeId: 'task', parentId: null, workflowId: 'wf', workflowVersion: 1,
        stateId: 's', stateCategory: i % 4 === 0 ? 'terminal' : i % 4 === 1 ? 'active' : 'open', assigneeId: null, collaboratorIds: [],
        fields: { title: claim(`Ticket ${i} with a long title`), startDate: claim({ date: iso(start) }), dueDate: claim({ date: iso(end) }) },
        transitions: [],
      },
      pendingFieldIds: [], customDateFields: [],
    } as unknown as TicketDatesInput;
  });
}

/** The view scene pans the product's own scroller: the continuous view's canvas if it has one, else the page. */
function viewScene(): Scene {
  host.replaceChildren();
  const mount = document.createElement('div');
  host.appendChild(mount);
  createRoot(mount).render(<TimelineView tickets={tickets(count)} today={TODAY} userName={(id) => id} onOpenTicket={() => undefined} />);
  return {
    count,
    async pan(durationMs) {
      const canvas = document.querySelector<HTMLElement>('.gn-timeline__canvas');
      const target = canvas ?? document.scrollingElement ?? document.documentElement;
      target.scrollTo(0, 0);
      let direction = 1;
      const horizontal = canvas !== null;
      const gaps = await samplePan((dt) => {
        const size = horizontal ? target.clientWidth : window.innerHeight;
        const max = horizontal ? target.scrollWidth - target.clientWidth : target.scrollHeight - window.innerHeight;
        const now = horizontal ? target.scrollLeft : target.scrollTop;
        const next = now + (direction * size * dt) / 1000;
        if (next >= max || next <= 0) direction = -direction;
        const clamped = Math.min(max, Math.max(0, next));
        if (horizontal) target.scrollLeft = clamped;
        else target.scrollTop = clamped;
      }, durationMs);
      return frameStats(gaps);
    },
  };
}

/** Click -> the frame after the click's work settled (two frames: React commit, then paint). Null when the page has no Later / Today. */
async function clickToSettle(): Promise<number | null> {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Later') ?? [...document.querySelectorAll('button')].find((b) => b.textContent === 'Today');
  if (button === undefined) return null;
  const t0 = performance.now();
  button.click();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return Math.round((performance.now() - t0) * 10) / 10;
}

async function go(): Promise<void> {
  out.textContent = 'running...';
  const s = scene === 'time' ? timeScene(host, count) : scene === 'flow' ? flowScene(host, count) : viewScene();
  await new Promise((resolve) => setTimeout(resolve, 600));
  await s.pan(2000);
  const pan = await s.pan(2000);
  const clickToSettleMs = scene === 'view' ? await clickToSettle() : null;
  const record: StressRecord = { scene, count: s.count, device: navigator.userAgent, touch: navigator.maxTouchPoints > 0, pan, clickToSettleMs };
  (window as unknown as { __stress: StressRecord }).__stress = record;
  out.textContent = `${scene}: ${s.count} on the page\n${pan.fps} frames a second, worst frame ${pan.worstMs} ms, p95 ${pan.p95Ms} ms\nframes over 16.7 / 20 / 50 ms: ${pan.over167} / ${pan.over20} / ${pan.over50}\n${clickToSettleMs === null ? '' : `click to settle ${clickToSettleMs} ms\n`}${navigator.userAgent}`;
  await fetch('/__results', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) }).catch(() => undefined);
}
document.getElementById('run')!.addEventListener('click', () => void go());
if (params.has('auto')) void go();
```

`packages/flow-graph-browser/vite.config.ts` (new):

```ts
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { parseResult } from './harness/results.js';

// The harness serves the REAL built `@gisik-nokma/app-core` so a browser measures the view the product ships. Port 3192, never
// 3190 (G-9's harness), 3191 (the Knowledge Graph's) or 3001 (the dev stack).
// `--host` (vite CLI) serves it on the LAN: that is how a real phone opens `stress.html?auto=1`. A run posts its record to
// /__results and this plugin appends one line per accepted run to results/stress.jsonl (gitignored).
function results(): Plugin {
  return {
    name: 'stress-results',
    configureServer(server) {
      server.middlewares.use('/__results', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = null;
          }
          const verdict = parseResult(parsed);
          if (!verdict.ok) {
            res.statusCode = 400;
            res.end(verdict.reason);
            return;
          }
          mkdirSync(resolve(__dirname, 'results'), { recursive: true });
          appendFileSync(resolve(__dirname, 'results/stress.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...verdict.record })}\n`);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  root: 'harness',
  esbuild: { jsx: 'automatic' },
  // The automatic runtime is injected by esbuild, so the dependency scan never sees it: without this Vite discovers it on the
  // first page load and RELOADS the page mid-test.
  optimizeDeps: { include: ['react/jsx-dev-runtime'] },
  plugins: [results()],
  server: { port: 3192, strictPort: true },
  build: { rollupOptions: { input: [resolve(__dirname, 'harness/stress.html')] } },
});
```

`packages/flow-graph-browser/playwright.config.ts` (new):

```ts
import { defineConfig, devices } from '@playwright/test';

// Real-browser stress cases for the time and flow surfaces (Workflow and Timeline graphs, Part 1). On the gate through this
// package's `test` script. Headless Chromium composites in software, so a headless number is a floor and never the bar:
// the bars (spec §13) are read from `FG_HEADED=1` runs and from the real phone (`stress.html?auto=1`, see the README).
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  workers: 1,
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], headless: process.env['FG_HEADED'] !== '1' } }],
  use: { baseURL: 'http://localhost:3192' },
  webServer: { command: 'vite --config vite.config.ts', url: 'http://localhost:3192/stress.html', reuseExistingServer: false, timeout: 60_000 },
});
```

  The stress spec (cases 29.002 and 29.003). The first test carries its own control: the same page with a 60 ms busy loop planted in the scroll handler must make that stall the worst frame, otherwise the harness could not see a stall and every number it prints would be meaningless:

`packages/flow-graph-browser/tests/stress.spec.ts` (new):

```ts
import { expect, test, type Page } from '@playwright/test';
import type { StressRecord } from '../harness/results.js';

async function run(page: Page, query: string): Promise<StressRecord> {
  await page.goto(`/stress.html?${query}&auto=1`);
  await page.waitForFunction(() => (window as unknown as { __stress?: unknown }).__stress !== undefined, null, { timeout: 60_000 });
  return page.evaluate(() => (window as unknown as { __stress: StressRecord }).__stress);
}

test('29.002 the time scene mounts 1,200 bars in a native scroller and the sampler records a scripted pan of it; control: a 60 ms stall planted in the pan is the worst frame', async ({ page }) => {
  const r = await run(page, 'scene=time&n=1200');
  console.log(`fg-stress time (LOCAL, headless): ${JSON.stringify(r.pan)}`);
  expect(r.count).toBe(1200);
  expect(await page.locator('#host button').count()).toBe(1200);
  expect(r.pan.frames).toBeGreaterThan(20);
  // CONTROL: the same page with a busy loop in a scroll handler. A harness that cannot see a stall measures nothing.
  await page.goto('/stress.html?scene=time&n=1200');
  await page.evaluate(() => {
    document.getElementById('host')!.addEventListener('scroll', () => { const t = performance.now(); while (performance.now() - t < 60); }, true);
  });
  await page.click('#run');
  await page.waitForFunction(() => (window as unknown as { __stress?: unknown }).__stress !== undefined, null, { timeout: 60_000 });
  const stalled = await page.evaluate(() => (window as unknown as { __stress: StressRecord }).__stress);
  expect(stalled.pan.worstMs).toBeGreaterThanOrEqual(60);
  expect(stalled.pan.over50).toBeGreaterThan(r.pan.over50);
});

test('29.002 the flow scene mounts 300 nodes and about 1.3 edges each under one transformed layer and records a pan and zoom of it', async ({ page }) => {
  const r = await run(page, 'scene=flow&n=300');
  console.log(`fg-stress flow (LOCAL, headless): ${JSON.stringify(r.pan)}`);
  expect(r.count).toBe(300);
  expect(await page.locator('#host path').count()).toBe(390);
  expect(r.pan.frames).toBeGreaterThan(20);
});

test('29.003 the product\'s own Timeline view at 2,000 dated tickets: panned and measured; the numbers are the recorded baseline', async ({ page }) => {
  const r = await run(page, 'scene=view&n=2000');
  console.log(`fg-stress view (LOCAL, headless): ${JSON.stringify({ pan: r.pan, clickToSettleMs: r.clickToSettleMs })}`);
  expect(await page.locator('.gn-timeline').count()).toBe(1);
  expect(r.pan.frames).toBeGreaterThan(5);
});
```

  `README.md` (run commands, the phone recipe, the scenes table; the `## Records` section is added by steps 14 and 15 and extended by T13):

`packages/flow-graph-browser/README.md` (new):

````markdown
# flow-graph-browser

Real-browser harness for the time and flow surfaces of the Workflow and Timeline graphs (spec `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md`, Part 1). Private; never published. Same shape as `packages/knowledge-graph-browser`: a Vite page per scene, Playwright driving Chromium against the BUILT `@gisik-nokma/app-core`, `@gisik-nokma/viewport` and `@gisik-nokma/ui`.

Port **3192**. Never 3190 (G-9's harness), 3191 (the Knowledge Graph's) or 3001 (the dev stack).

## Run

```bash
pnpm turbo run build --filter=@gisik-nokma/flow-graph-browser^...   # the harness reads dist, never src
/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh fgb -- pnpm --filter @gisik-nokma/flow-graph-browser test
```

Headless Chromium composites in software. A headless number is a **floor and never the bar**: the bars (spec section 13) are read from `FG_HEADED=1` runs on the owner's machine and from a real phone. A report quotes a headless run as `LOCAL, headless` and never as a pass.

```bash
FG_HEADED=1 pnpm --filter @gisik-nokma/flow-graph-browser test          # real window, GPU compositing
pnpm --filter @gisik-nokma/flow-graph-browser exec vite --host            # then open on the phone:
#   http://<lan-ip>:3192/stress.html?scene=time&n=600&auto=1
#   http://<lan-ip>:3192/stress.html?scene=view&n=2000&auto=1
```

A page run posts its record to `/__results`, which appends a line to `results/stress.jsonl` (gitignored) after `parseResult` accepts it. `harness/bars.ts` holds the section 13 bars as data; `judge(record)` lists the reasons a record misses its bar.

## Scenes

| Page | What it mounts |
|---|---|
| `stress.html?scene=time&n=` | n absolutely placed bars in a native scroller (the Home Timeline shape) |
| `stress.html?scene=flow&n=` | n nodes and about 1.3 edges each under one transformed layer (the Workflow and Timeline graph shape) |
| `stress.html?scene=view&n=` | the product's own `TimelineView` at n dated tickets |
| `timeline.html?n=&span=&theme=` | the product's `TimelineView`, for the behaviour specs (`tests/timeline*.spec.ts`) |
| `camera.html` | a `CameraAdapter` over a transformed layer (`tests/camera.spec.ts`) |
````

  Run (the harness reads the BUILT packages):

  ```bash
  pnpm install
  pnpm turbo run build --filter=@gisik-nokma/flow-graph-browser^...
  /Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh fgb -- pnpm --filter @gisik-nokma/flow-graph-browser test > /tmp/fgb.log 2>&1; tail -n 40 /tmp/fgb.log
  ```

  Expected: sampler, results and bars specs green; the three stress tests green (they print `fg-stress time|flow|view (LOCAL, headless): {...}`). `pnpm exec playwright install chromium` if the browser is missing. A stress test that times out at 60 s on a loaded machine is a load artefact: re-run it alone.

- [ ] **Step 9: Register the package**

  Four Dockerfiles gain one `COPY` line directly after the `ui` line (they all list package manifests for `pnpm fetch`; a missing manifest makes the image build fail on the first `pnpm install` that sees app-core's new dependency):

`apps/web/Dockerfile`:

```diff
--- a/apps/web/Dockerfile
+++ b/apps/web/Dockerfile
@@ -31,6 +31,7 @@
 COPY packages/rule-engine/package.json packages/rule-engine/
 COPY packages/sync-client/package.json packages/sync-client/
 COPY packages/ui/package.json packages/ui/
+COPY packages/viewport/package.json packages/viewport/
 RUN pnpm fetch
 # Source last, so the edits above stay cache-warm for the fetch layer.
 COPY . .
```

`apps/web/Dockerfile.dev`:

```diff
--- a/apps/web/Dockerfile.dev
+++ b/apps/web/Dockerfile.dev
@@ -48,6 +48,7 @@
 COPY packages/rule-engine/package.json packages/rule-engine/
 COPY packages/sync-client/package.json packages/sync-client/
 COPY packages/ui/package.json packages/ui/
+COPY packages/viewport/package.json packages/viewport/
 RUN pnpm fetch
 # Source last, so the edits above stay cache-warm for the fetch layer.
 COPY . .
```

`apps/server/Dockerfile`:

```diff
--- a/apps/server/Dockerfile
+++ b/apps/server/Dockerfile
@@ -45,6 +45,7 @@
 COPY packages/rule-engine/package.json packages/rule-engine/
 COPY packages/sync-client/package.json packages/sync-client/
 COPY packages/ui/package.json packages/ui/
+COPY packages/viewport/package.json packages/viewport/
 RUN pnpm fetch
 # Source last, so the edits above stay cache-warm for the fetch layer.
 COPY . .
```

`apps/server/Dockerfile.dev`:

```diff
--- a/apps/server/Dockerfile.dev
+++ b/apps/server/Dockerfile.dev
@@ -48,6 +48,7 @@
 COPY packages/rule-engine/package.json packages/rule-engine/
 COPY packages/sync-client/package.json packages/sync-client/
 COPY packages/ui/package.json packages/ui/
+COPY packages/viewport/package.json packages/viewport/
 RUN pnpm fetch
 # Source last, so the edits above stay cache-warm for the fetch layer.
 COPY . .
```

`docker-compose.hot.yml`:

```diff
--- a/docker-compose.hot.yml
+++ b/docker-compose.hot.yml
@@ -260,6 +260,7 @@
       - ./packages/rule-engine/src:/repo/packages/rule-engine/src
       - ./packages/sync-client/src:/repo/packages/sync-client/src
       - ./packages/ui/src:/repo/packages/ui/src
+      - ./packages/viewport/src:/repo/packages/viewport/src
       - ./reference:/repo/reference:ro
 
   # ---------------------------------------------------------------------------
@@ -374,3 +375,4 @@
       - ./packages/rule-engine/src:/repo/packages/rule-engine/src
       - ./packages/sync-client/src:/repo/packages/sync-client/src
       - ./packages/ui/src:/repo/packages/ui/src
+      - ./packages/viewport/src:/repo/packages/viewport/src
```

`packages/app-core/package.json`:

```diff
--- a/packages/app-core/package.json
+++ b/packages/app-core/package.json
@@ -40,6 +40,7 @@
     "@gisik-nokma/rule-engine": "workspace:*",
     "@gisik-nokma/sync-client": "workspace:*",
     "@gisik-nokma/ui": "workspace:*",
+    "@gisik-nokma/viewport": "workspace:*",
     "@xyflow/react": "^12.8.2"
   },
   "peerDependencies": {
```

  Run `pnpm install` again (Node 22). Then the guard (case 29.004), written RED first by running it before the edits above if you prefer; it reads the manifests, so it needs no Docker:

`apps/server/test/deploy/workspace-manifests.test.ts` (new):

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 29.004 (Workflow and Timeline graphs, Part 1, T1): a NEW workspace package that an app builds from needs a line in all four
 * Dockerfiles (`COPY packages/<dir>/package.json packages/<dir>/`: the `pnpm fetch` layer's cache key, and an offline-store miss
 * at the install when it is absent, `apps/web/Dockerfile:14-19`) and a source mount in both services of `docker-compose.hot.yml`
 * (a `packages/<dir>/src` edit never reaches `dist` without it). The registry of what an app builds from is the workspace itself:
 * the `dependencies` closure of `apps/web` and `apps/server`, so a package added to app-core later is caught the day it is added.
 */
const ROOT = resolve(import.meta.dirname, '../../../..');
const read = (relative: string): string => readFileSync(resolve(ROOT, relative), 'utf8');
type Manifest = { name: string; dependencies?: Record<string, string> };
const manifest = (dir: string): Manifest => JSON.parse(read(`${dir}/package.json`)) as Manifest;

/** workspace package name -> directory, for every `packages/*` that has a manifest. */
function packageDirs(): Map<string, string> {
  const byName = new Map<string, string>();
  for (const entry of readdirSync(resolve(ROOT, 'packages'), { withFileTypes: true })) {
    if (entry.isDirectory()) byName.set(manifest(`packages/${entry.name}`).name, `packages/${entry.name}`);
  }
  return byName;
}

/** The `packages/*` directories an app builds from: its workspace `dependencies`, and theirs, transitively. */
export function builtFrom(appDir: string, byName: ReadonlyMap<string, string>): string[] {
  const seen = new Set<string>();
  const walk = (dir: string): void => {
    for (const [name, range] of Object.entries(manifest(dir).dependencies ?? {})) {
      const child = byName.get(name);
      if (range.startsWith('workspace:') && child !== undefined && !seen.has(child)) {
        seen.add(child);
        walk(child);
      }
    }
  };
  walk(appDir);
  return [...seen].sort();
}

const DOCKERFILES = ['apps/web/Dockerfile', 'apps/web/Dockerfile.dev', 'apps/server/Dockerfile', 'apps/server/Dockerfile.dev'] as const;
const byName = packageDirs();
const closure = [...new Set([...builtFrom('apps/web', byName), ...builtFrom('apps/server', byName)])].sort();

describe('29.004 every workspace package an app builds from is registered in the four Dockerfiles and both hot-mode services', () => {
  it('29.004 the closure is read from the manifests and names the packages the images build; control: a private test package is not in it', () => {
    expect(closure).toEqual(expect.arrayContaining(['packages/app-core', 'packages/domain', 'packages/ui', 'packages/viewport']));
    expect(closure).not.toContain('packages/workflow-canvas-browser');
    expect(closure).not.toContain('packages/flow-graph-browser');
  });

  for (const dockerfile of DOCKERFILES) {
    it(`29.004 ${dockerfile} copies every one of their manifests`, () => {
      const text = read(dockerfile);
      const missing = closure.filter((dir) => !text.includes(`COPY ${dir}/package.json ${dir}/`));
      expect(missing, `${dockerfile} lacks: ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('29.004 docker-compose.hot.yml mounts every one of their sources in the server service and in the web service', () => {
    const compose = read('docker-compose.hot.yml');
    const at = compose.search(/^ {2}web:$/m);
    const server = compose.slice(compose.search(/^ {2}server:$/m), at);
    const web = compose.slice(at);
    for (const [name, text] of [['server', server], ['web', web]] as const) {
      const missing = closure.filter((dir) => !text.includes(`./${dir}/src:/repo/${dir}/src`));
      expect(missing, `the ${name} service lacks: ${missing.join(', ')}`).toEqual([]);
    }
    // CONTROL, same it: the split found two non-empty services, so the loop above could fail.
    expect(server.length).toBeGreaterThan(500);
    expect(web.length).toBeGreaterThan(500);
  });
});
```

  Run: `slot-run.sh srv -- pnpm --filter @gisik-nokma/server exec vitest run test/deploy/workspace-manifests.test.ts --maxWorkers=2 > /tmp/wm.log 2>&1; tail -n 20 /tmp/wm.log`. Expected: 3 tests green. Mutation: delete the `viewport` line from one Dockerfile, then from one compose service → the matching test goes RED naming the file.

- [ ] **Step 10: The gate inputs, CI, the colour scan, the citation corpus**

`turbo.json`:

```diff
--- a/turbo.json
+++ b/turbo.json
@@ -123,6 +123,7 @@
         "$TURBO_ROOT$/apps/desktop/src/**",
         "$TURBO_ROOT$/apps/mobile/src/**",
         "$TURBO_ROOT$/packages/knowledge-graph/src/**",
+        "$TURBO_ROOT$/packages/viewport/src/**",
         "$TURBO_ROOT$/apps/*/test/**",
         "$TURBO_ROOT$/packages/*/test/**",
         "$TURBO_ROOT$/apps/*/package.json",
@@ -133,6 +134,11 @@
     "@gisik-nokma/knowledge-graph-browser#test": {
       "dependsOn": ["^build"],
       "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/packages/knowledge-graph/src/**", "$TURBO_ROOT$/packages/ui/src/ui.css"]
+    },
+    // WTG Part 1 T1: the browser suite drives Chromium against the BUILT app-core, viewport and ui packages and reads the stylesheet the view ships.
+    "@gisik-nokma/flow-graph-browser#test": {
+      "dependsOn": ["^build"],
+      "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/packages/viewport/src/**", "$TURBO_ROOT$/packages/app-core/src/**", "$TURBO_ROOT$/packages/ui/src/ui.css"]
     },
     // `reporting-scope-guard.test.ts` walks SEVEN trees (its own `SCANNED_ROOTS`),
     // and three CSS-binding suites read `packages/ui/src/ui.css` — the stylesheet
```

`.github/workflows/ci.yml`:

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -544,6 +544,8 @@
       - run: pnpm --filter @gisik-nokma/workflow-canvas-browser exec playwright install --with-deps chromium
       # KG-C T1: `knowledge-graph-browser`'s `test` drives a real Chromium against its own Vite harness (:3191).
       - run: pnpm --filter @gisik-nokma/knowledge-graph-browser exec playwright install --with-deps chromium
+      # WTG Part 1 T1: `flow-graph-browser`'s `test` drives a real Chromium against its own Vite harness (:3192).
+      - run: pnpm --filter @gisik-nokma/flow-graph-browser exec playwright install --with-deps chromium
       - run: pnpm turbo run test --filter='!@gisik-nokma/server'
 
   # apps/web/e2e (Playwright) needs a deployable stack -- Plan 11 Task 13's
```

`.gitignore`:

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -55,3 +55,6 @@
 
 # Claude Code agent worktrees (a committed gitlink here broke CI checkout post-job: no .gitmodules entry)
 .claude/worktrees/
+
+# flow-graph-browser: stress records the harness appends through its /__results endpoint (a real-phone run writes here too)
+packages/flow-graph-browser/results/
```

`packages/ui/test/helpers/colour-scan.ts`:

```diff
--- a/packages/ui/test/helpers/colour-scan.ts
+++ b/packages/ui/test/helpers/colour-scan.ts
@@ -26,6 +26,7 @@
   'packages/app-core/src',
   'packages/editor/src',
   'packages/knowledge-graph/src',
+  'packages/viewport/src',
   'apps/web/src',
   'apps/web/app',
   'apps/desktop/src',
```

  The `ui#test` inputs gain `packages/viewport/src/**` because the colour scan now reads it (the engine has no colours, and the scan proves it); the new `flow-graph-browser#test` entry lists the three trees the browser suite depends on, so a change to the view or the stylesheet re-runs it.

  The citation checker must count `packages/flow-graph-browser/tests` as test corpus (a ✅ case is carried by a Playwright spec). `isTestPath` is exported for the first time, with its declaration and the case-29.007 test (RED first):

`scripts/check-case-citations.mjs`:

```diff
--- a/scripts/check-case-citations.mjs
+++ b/scripts/check-case-citations.mjs
@@ -155,7 +155,7 @@
 // `*.test.ts`/`*.test.tsx` file wherever it lives (five apps/mobile and
 // apps/desktop tests are co-located under `src/`, not under `test/`), and
 // the e2e specs under `apps/web/e2e*/`, and the canvas browser suite's `packages/workflow-canvas-browser/tests/` (G-9 T1).
-function isTestPath(relPath) {
+export function isTestPath(relPath) {
   if (relPath.includes('/node_modules/')) return false;
   if (/(^|\/)test\//.test(relPath)) return true;
   if (/\.test\.tsx?$/.test(relPath)) return true;
@@ -170,6 +170,8 @@
   if (/^packages\/workflow-canvas-browser\/tests\//.test(relPath)) return true;
   // KG-C T1: the Knowledge Graph browser suite is a package of its own (Playwright against a Vite harness, on the gate), its specs live in `tests/`.
   if (/^packages\/knowledge-graph-browser\/tests\//.test(relPath)) return true;
+  // WTG Part 1 T1: the flow/time browser suite is a package of its own (Playwright against a Vite harness, on the gate), its specs live in `tests/`.
+  if (/^packages\/flow-graph-browser\/tests\//.test(relPath)) return true;
   return false;
 }
 
```

`scripts/check-case-citations.d.mts`:

```diff
--- a/scripts/check-case-citations.d.mts
+++ b/scripts/check-case-citations.d.mts
@@ -9,6 +9,7 @@
   malformed: { line: number; raw: string }[];
 };
 export function isCited(id: string, corpusText: string): boolean;
+export function isTestPath(relPath: string): boolean;
 export function computeUncited(
   caseFilesMap: Record<string, string[]>,
   corpusText: string,
```

`apps/server/test/tooling/check-case-citations.test.ts`:

```diff
--- a/apps/server/test/tooling/check-case-citations.test.ts
+++ b/apps/server/test/tooling/check-case-citations.test.ts
@@ -6,6 +6,7 @@
   checkRatchet,
   extractCheckedIds,
   isCited,
+  isTestPath,
 } from '../../../../scripts/check-case-citations.mjs';
 
 /**
@@ -89,3 +90,21 @@
     ]);
   });
 });
+
+describe('check-case-citations corpus', () => {
+  /**
+   * 29.007 — the flow/time browser suite's specs and the viewport package's tests are citation corpus, so a ✅ case in
+   * `test-cases/29-workflow-timeline-graphs.md` can be carried by a Playwright spec. Controls in the same `it`: the
+   * package's harness pages, its README and the viewport SOURCE are not corpus (an id written in prose would otherwise
+   * keep a case green with no test), and a `node_modules` copy of a spec directory is not either.
+   */
+  it('29.007 admits packages/flow-graph-browser/tests and packages/viewport/test; refuses the harness, the README, the source and node_modules', () => {
+    expect(isTestPath('packages/flow-graph-browser/tests/stress.spec.ts')).toBe(true);
+    expect(isTestPath('packages/viewport/test/pack.test.ts')).toBe(true);
+    expect(isTestPath('packages/knowledge-graph-browser/tests/stress.spec.ts')).toBe(true);
+    expect(isTestPath('packages/flow-graph-browser/harness/stress.tsx')).toBe(false);
+    expect(isTestPath('packages/flow-graph-browser/README.md')).toBe(false);
+    expect(isTestPath('packages/viewport/src/pack.ts')).toBe(false);
+    expect(isTestPath('packages/flow-graph-browser/node_modules/pkg/tests/a.spec.ts')).toBe(false);
+  });
+});
```

  Run: `slot-run.sh srv -- pnpm --filter @gisik-nokma/server exec vitest run test/tooling/check-case-citations.test.ts --maxWorkers=2 > /tmp/cc.log 2>&1; tail -n 20 /tmp/cc.log`, and `pnpm --filter @gisik-nokma/ui exec vitest run --maxWorkers=2 > /tmp/ui.log 2>&1; tail -n 20 /tmp/ui.log` (the colour scan). Expected green. Mutation: delete the `flow-graph-browser` arm of `isTestPath` → 29.007 RED.

- [ ] **Step 11: Seed the catalogue**

  Create the bucket file. It carries the block table of spec section 16.1, Part 1's sub-section with an anchor per Part 1 task, and ONE Part anchor for each of Parts 2 to 5 (each Part's first task adds its own sub-section and per-task anchors below it), so no two parallel tasks append to one line. The T1 case lines are already in place (all ❌):

`test-cases/29-workflow-timeline-graphs.md` (new):

```markdown
# §29 — Workflow and Timeline graphs

**Opened 2026-10-03 by the `wtg-part1-viewport-timeline-view` plan Task 1** (`docs/superpowers/plans/2026-10-03-wtg-part1-viewport-timeline-view.md`; spec `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md`). Mirrors `Features.md` §26. Ships on the release branch cut after the Knowledge Graph release.
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
- ❌ **29.001 — frameStats: 60 fps steady is 60 and 16.7 ms; a planted 120 ms stall is the worst frame and is counted over every budget; control: no stall, none over | frameStats: p95 is the 95th-percentile gap, 5 slow frames in 100 put it on the slow value, 4 do not; no frames is refused, not reported as 0 fps.** (`packages/flow-graph-browser/tests/sampler.spec.ts`)
- ❌ **29.002 — the time scene mounts 1,200 bars in a native scroller and the sampler records a scripted pan of it; control: a 60 ms stall planted in the pan is the worst frame | the flow scene mounts 300 nodes and about 1.3 edges each under one transformed layer and records a pan and zoom of it.** (`packages/flow-graph-browser/tests/stress.spec.ts`)
- ❌ **29.003 — the product's own Timeline view at 2,000 dated tickets: panned and measured; the numbers are the recorded baseline.** (`packages/flow-graph-browser/tests/stress.spec.ts`)
- ❌ **29.004 — every workspace package an app builds from is registered in the four Dockerfiles and both hot-mode services | the closure is read from the manifests and names the packages the images build; control: a private test package is not in it | docker-compose.hot.yml mounts every one of their sources in the server service and in the web service.** (`apps/server/test/deploy/workspace-manifests.test.ts`)
- ❌ **29.005 — parseResult accepts a run record and refuses everything else; control: one field changed at a time.** (`packages/flow-graph-browser/tests/results.spec.ts`)
- ❌ **29.006 — the pan bars are the spec numbers (section 13) and judge holds a record to them: exactly on the bar passes, a hair under on fps or over on the worst frame fails, and a lighter load is refused.** (`packages/flow-graph-browser/tests/bars.spec.ts`)
- ❌ **29.007 — admits packages/flow-graph-browser/tests and packages/viewport/test; refuses the harness, the README, the source and node_modules.** (`apps/server/test/tooling/check-case-citations.test.ts`)
- ❌ **29.014 — day 4 is a Monday, day 2 a Saturday, day 3 a Sunday; Mondays are 7 apart; control: day 0 (Thursday) is no Monday | week labels from 16 px/day, day numbers cross-fade around 20 and are absent at Month zoom, the tint starts at 16; control: 8 px/day has none of them.** (`packages/viewport/test/calendar-days.test.ts`)
- ❌ **29.016 — The shipped week-column Timeline view, measured BEFORE the lift: 2,000 dated tickets panned through `stress.html?scene=view&n=2000&auto=1` on a headed desktop Chrome and on the owner's real phone; the numbers (fps, worst frame, click-to-settle) are written on this line and every later Part 1 task is held to them or better.** (`packages/flow-graph-browser/README.md`)
<!-- wtg-part1-viewport-timeline-view T2 -->
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

<!-- wtg-part3-workflow-graph -->

<!-- WTG4 -->

<!-- wtg-part5-mcp -->
```

  `test-cases/README.md`: add this paragraph after the `27-knowledge-graph.md` entry:

```markdown
`29-workflow-timeline-graphs.md` (`Features.md` §26 — Workflow and Timeline graphs (the viewport engine, packing and the continuous Timeline view; the model; the Workflow graph; the Timeline graph and Home's Timeline; MCP), **opened by `wtg-part1-viewport-timeline-view` Task 1 on 2026-10-03** (`docs/superpowers/plans/2026-10-03-wtg-part1-viewport-timeline-view.md`; spec `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md`); 3-DIGIT PADDED `29.001`–`29.399`, blocks per Part in the bucket file's own table).
```

  `scripts/fixtures/check-case-citations-baseline.json` (a new bucket starts at zero uncited):

`scripts/fixtures/check-case-citations-baseline.json`:

```diff
--- a/scripts/fixtures/check-case-citations-baseline.json
+++ b/scripts/fixtures/check-case-citations-baseline.json
@@ -33,5 +33,6 @@
   "24-neo-refresh.md": 0,
   "25-smoothness.md": 0,
   "26-comments-and-markdown.md": 0,
-  "27-knowledge-graph.md": 0
+  "27-knowledge-graph.md": 0,
+  "29-workflow-timeline-graphs.md": 0
 }
```

  `Features.md`: append this section at the END of the file, after the last section (Knowledge Graph, `## 24.`). If Drafts has landed first, put it after `## 25.`; the heading number is the only thing that moves. Every Part 1 anchor below is replaced by its task's bullet when that task lands. The four Part anchors for Parts 2 to 5 STAY: each Part's first task writes its `###` sub-heading and its per-task bullet anchors directly below its own Part anchor:

```markdown
## 26. Workflow and Timeline graphs

*Flow graphs, a timeline of planned and actual work, and the model under them. Spec `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md`; mirrored by `test-cases/29-workflow-timeline-graphs.md`.*

### Part 1 — the viewport engine, packing and the continuous Timeline view

<!-- wtg-part1-viewport-timeline-view T1 bullet -->
<!-- wtg-part1-viewport-timeline-view T2 bullet -->
<!-- wtg-part1-viewport-timeline-view T3 bullet -->
<!-- wtg-part1-viewport-timeline-view T4 bullet -->
<!-- wtg-part1-viewport-timeline-view T5 bullet -->
<!-- wtg-part1-viewport-timeline-view T6 bullet -->
<!-- wtg-part1-viewport-timeline-view T7 bullet -->
<!-- wtg-part1-viewport-timeline-view T8 bullet -->
<!-- wtg-part1-viewport-timeline-view T9 bullet -->
<!-- wtg-part1-viewport-timeline-view T10 bullet -->
<!-- wtg-part1-viewport-timeline-view T11 bullet -->
<!-- wtg-part1-viewport-timeline-view T12 bullet -->
<!-- wtg-part1-viewport-timeline-view T13 bullet -->

<!-- wtg-part2-model bullets -->

<!-- wtg-part3-workflow-graph bullets -->

<!-- WTG4 bullets -->

<!-- wtg-part5-mcp bullets -->
```

- [ ] **Step 12: The T1 Features bullet**

  Replace the anchor `<!-- wtg-part1-viewport-timeline-view T1 bullet -->` in Features section 26 with:

```markdown
- ⚙️ **The viewport package and the real-browser stress harness** (Workflow and Timeline graphs Part 1 T1; cases 29.001–29.007, 29.014, 29.016; `packages/viewport/`, `packages/flow-graph-browser/`) — `@gisik-nokma/viewport` is the pure, clock-free home of the shared time-and-camera engine (this task: IST day numbers, Mondays and the axis levels, `calendar-days.ts`). `packages/flow-graph-browser` is a private Playwright package on port 3192 (never 3190 / 3191 / 3001): a frame sampler (`frameStats`, `samplePan`), three stress pages (`scene=time|flow|view`), `/__results` records in `results/stress.jsonl` (gitignored; a real phone posts there too) and the section 13 pan bars as data with `judge(record)`. A headless number is a floor, never a pass; the bars are read from `FG_HEADED=1` runs and a real phone. The shipped week-column Timeline's own numbers are the baseline on case 29.016. Registered in the four Dockerfiles, `docker-compose.hot.yml` and app-core's dependencies (guard 29.004); `check-case-citations` admits `packages/flow-graph-browser/tests` (29.007); the gate is <the measured count, 46 when written> tasks.
```

- [ ] **Step 13: Run the catalogue checks and the whole local battery for what changed**
  - `pnpm check:citations`. Only checked (`✅`) ids need a citing test, and every T1 case is still `❌` or `🧪` at this point, so it passes with the new bucket's baseline of 0; it is re-run after the flips in step 17.
  - Typecheck what you touched: `pnpm turbo run typecheck --filter=@gisik-nokma/viewport --filter=@gisik-nokma/flow-graph-browser --filter=@gisik-nokma/app-core --filter=@gisik-nokma/ui`.
  - **The app-core dependency is new, so run the app-core and web suites once** (`slot-run.sh ac -- pnpm --filter @gisik-nokma/app-core exec vitest run --maxWorkers=2 > /tmp/ac.log 2>&1; tail -n 20 /tmp/ac.log`, likewise web): nothing imports the package yet, so this only proves the install did not break resolution.
  - Count the gate: the one-liner from the Global Constraints must print the count MEASURED at Step 0 with both packages (**46** when this plan was written).

- [ ] **Step 14: Measure the shipped Timeline on a headed desktop browser (case 29.016, desktop half)**

  The numbers are the whole point of this task: every later task is held to them. On the dev machine (M2 Pro class), with the app-core `dist` built from the UNTOUCHED view (this branch has not edited `timeline-view.tsx`):

  ```bash
  pnpm turbo run build --filter=@gisik-nokma/flow-graph-browser^...
  FG_HEADED=1 /Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh fgb-headed -- pnpm --filter @gisik-nokma/flow-graph-browser exec playwright test tests/stress.spec.ts --grep "29.003" > /tmp/fgb-headed.log 2>&1; tail -n 12 /tmp/fgb-headed.log
  tail -n 3 packages/flow-graph-browser/test-results/stress.jsonl
  ```

  Read the `view` record's `pan.fps`, `pan.worstMs`, `pan.p95Ms` and `clickToSettleMs`, and count what the page mounted (open `stress.html?scene=view&n=2000&auto=1` in the headed window and run `document.querySelectorAll('.gn-timeline__bar').length` in its console; the shipped view mounts only its eight-week window, so this is far below 2,000 and the record must say so). Append a `## Records` section to the end of the package README (T13 adds the second record under it):

  ```markdown
  ## Records

  | Case | Scene | Device | fps | worst frame | p95 | click to settle | mounted |
  |---|---|---|---|---|---|---|---|
  | 29.016 (before the lift) | `view`, 2,000 tickets | desktop: <the machine and Chrome version> | N | N ms | N ms | N ms | N bars |
  ```

  and write the same numbers onto the 29.016 line as `desktop: N fps, worst N ms, p95 N ms, click-to-settle N ms, N bars mounted (device: ...)`. A headless run is NOT this measurement.

- [ ] **Step 15: Measure it on the owner's real phone (case 29.016, phone half)**

  The lane cannot hold the phone. Start the harness on the LAN in the background and ask the controller to relay the URL to the owner:

  ```bash
  cd packages/flow-graph-browser && pnpm exec vite --host   # run_in_background; note the pid
  ```

  URL for the owner: `http://<this machine's LAN ip>:3192/stress.html?scene=view&n=2000&auto=1` (the page runs three pans by itself and posts its record). Wait for the record: `tail -n 2 packages/flow-graph-browser/test-results/stress.jsonl` shows a line with `"touch":true`. Stop the server by its exact pid (no `pkill`). Add the phone row to the README table and write `phone: N fps, worst N ms, p95 N ms, click-to-settle N ms (device: <the UA string's model>)` on the same 29.016 line. If the owner is not available, the line stays ❌ and the lane reports `NEEDS: owner phone` as a standing blocker for T13 only (T2 to T12 are not held up by it); in that case also write the desktop half now.

  Flip 29.016 to 🧪 only when both halves carry their numbers (T13's catalogue test, 29.119, requires at least two `N fps` figures on this line).

- [ ] **Step 16: Mutation pass (own, recorded in the HANDOFF)**

  One mutant at a time, run the named test, expect RED, restore:
  - `frameStats`: `Math.ceil(sorted.length * 0.95) - 1` without the `- 1`; `fps` from the median gap → 29.001.
  - `judge`: `fps < minFps` to `<=`; `worstMs > max` to `>=`; delete the `count` line → 29.006 (exactly on the bar passes; a lighter load is refused).
  - `parseResult`: delete the `touch` check; accept `clickToSettleMs: undefined` → 29.005.
  - `weekdayOf`: `day + 3` to `day + 4`; `axisLevels`: `ppd >= 16` to `> 16`; `crossFade` threshold `- half` to `+ half` → 29.014.
  - the 60 ms stall in the stress control removed → 29.002 must NOT stay green (the control `expect` fails).

- [ ] **Step 17: Flip, pin the gate to 46-only, gate, land**
  - Flip `❌` to `✅` on 29.001–29.007 and 29.014 in `test-cases/29-workflow-timeline-graphs.md` (29.016 stays ❌ until step 15 is complete, then `🧪`). Run `pnpm check:citations` and the local battery named in step 13.
  - **The last commit of PR B pins the gate to 46-only** (the transitional 41 arm goes, 13.2024 becomes a 🚫 line, 13.2025 flips to 🧪; the 13.1840–13.1849 lines are bumped to the 46 graph). Do it AFTER the owner has pulled the primary checkout. The diffs are against PR A's tree:

`scripts/ctl/verbs/gate.sh`:

```diff
--- a/scripts/ctl/verbs/gate.sh
+++ b/scripts/ctl/verbs/gate.sh
@@ -51,12 +51,9 @@
 [ "$E" = "EXIT=0" ] || ctl_fail gate "$summary (log $log)"
 [ "$ran" = "$mode" ] || ctl_fail gate "$summary — asked for $mode, gate.sh ran ${ran:-nothing} (log $log)"
 # The gate graph: 36 (through G-9's workflow-canvas-browser) + 5 for Knowledge Graph C T1 (packages/knowledge-graph: build, test, typecheck;
-# packages/knowledge-graph-browser: test, typecheck) = 41. The match is anchored, so 141, 410 and mixed pairs fail (13.1840-13.1849).
-# TEMPORARY "41 or 46": Workflow and Timeline graphs Part 1 T1 adds packages/viewport (build, test, typecheck) and packages/flow-graph-browser
-# (test, typecheck), so its gate is 46, while the verb that runs is the PRIMARY checkout's (41-only). Both halves must match one graph: an anchored
-# two-alternative match, so 4146, 460/410 and mixed pairs fail. WTG Part 1 T1's LAST commit pins 46-ONLY here (and flips 13.2025 to a FAIL control);
-# delete this comment with the 41 arm. Same shape as KG C T1's "36 or 41" (13.1844-13.1849).
-echo "$T" | grep -Eq '^Tasks: +(41 successful, 41|46 successful, 46) total *$' || ctl_fail gate "$summary (log $log)"
+# packages/knowledge-graph-browser: test, typecheck) = 41, + 5 for Workflow and Timeline graphs Part 1 T1 (packages/viewport: build, test, typecheck;
+# packages/flow-graph-browser: test, typecheck) = 46. The match is anchored, so 146, 460 and mixed pairs fail (13.1840-13.1849, 13.2020-13.2025).
+echo "$T" | grep -Eq '^Tasks: +46 successful, 46 total *$' || ctl_fail gate "$summary (log $log)"
 echo "$N" | grep -q 'NODE=v22\.' || ctl_fail gate "$summary (log $log)"
 [ "$eng" -eq 0 ] || ctl_fail gate "Unsupported engine ×$eng (log $log)"
 [ "$to" -eq 0 ] || ctl_fail gate "Hook timed out ×$to — re-gate on a quiet box (log $log)"
```

`scripts/ctl/test/lib.test.sh`:

```diff
--- a/scripts/ctl/test/lib.test.sh
+++ b/scripts/ctl/test/lib.test.sh
@@ -42,7 +42,7 @@
 check "gate: --dry-run copies nothing into the log dir" 'CTL_LOG_DIR="$ld" gate_dry >/dev/null; [ "$(ls "$ld" | wc -l | tr -d " ")" -eq 0 ]'
 # a fixture gate.sh that prints what the verb reads: the summary lines into the log ($1), GATE_MODE/EXIT/NODE on its console
 # (GATE_MODE is what the verb requires to match the kind it asked for: fresh on main, cached on a release base)
-( cd "$gr" && printf '%s\n' '#!/bin/bash' 'printf "Tasks:    41 successful, 41 total\nCached:    0 cached, 41 total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=0' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && echo helper > docs/lanes/gate-lock/locked-test.sh && /usr/bin/git add -A && /usr/bin/git commit -q -m "fixture gate" && /usr/bin/git push -q origin HEAD:main && /usr/bin/git fetch -q origin )
+( cd "$gr" && printf '%s\n' '#!/bin/bash' 'printf "Tasks:    46 successful, 46 total\nCached:    0 cached, 46 total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=0' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && echo helper > docs/lanes/gate-lock/locked-test.sh && /usr/bin/git add -A && /usr/bin/git commit -q -m "fixture gate" && /usr/bin/git push -q origin HEAD:main && /usr/bin/git fetch -q origin )
 # CTL_DRY_RUN=0 explicitly: the arg-parsing check above leaves CTL_DRY_RUN=1 in this shell, and a "real run" that is
 # silently a dry run prints `OK gate dry-run` — which a loose `^OK gate` grep accepted (measured writing this test).
 gate_real() { ( cd "$gr" && CTL_DRY_RUN=0 CTL_LOG_DIR="$ld" "$HERE/ctl" gate "$(/usr/bin/git rev-parse HEAD)" --repo "$gr" 2>&1 ); }
@@ -114,7 +114,7 @@
 check "13.1503 base: main keeps the marker kind the chain always used" '[ "$(ctl_marker_kind gate main)" = gate ] && [ "$(ctl_marker_kind checked main)" = checked ]'
 check "13.1503 base: a release base gets its OWN marker kind, injectively" '[ "$(ctl_marker_kind gate release/x)" = "gate.release+x" ] && [ "$(ctl_marker_kind gate release/a/b)" != "$(ctl_marker_kind gate release/a-b)" ]'
 bb=$(mktemp -d); $G init -q --bare "$bb"
-br=$(mktemp -d); ( cd "$br" && $G init -q . && $G symbolic-ref HEAD refs/heads/main && mkdir -p docs/lanes/gate-lock && printf '%s\n' '#!/bin/bash' 'printf "Tasks:    41 successful, 41 total\nCached:    0 cached, 41 total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=0' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && echo one > f.txt && $G add -A && $G commit -q -m base && $G remote add origin "$bb" && $G push -q -u origin main && $G checkout -q -b release/x && echo rel > rel.txt && $G add -A && $G commit -q -m rel1 && $G push -q -u origin release/x && $G checkout -q -b task && echo task > task.txt && $G add -A && $G commit -q -m task1 && $G push -q origin task )
+br=$(mktemp -d); ( cd "$br" && $G init -q . && $G symbolic-ref HEAD refs/heads/main && mkdir -p docs/lanes/gate-lock && printf '%s\n' '#!/bin/bash' 'printf "Tasks:    46 successful, 46 total\nCached:    0 cached, 46 total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=0' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && echo one > f.txt && $G add -A && $G commit -q -m base && $G remote add origin "$bb" && $G push -q -u origin main && $G checkout -q -b release/x && echo rel > rel.txt && $G add -A && $G commit -q -m rel1 && $G push -q -u origin release/x && $G checkout -q -b task && echo task > task.txt && $G add -A && $G commit -q -m task1 && $G push -q origin task )
 bump() { ( c=$(mktemp -d); rm -rf "$c"; $G clone -q "$bb" "$c" && cd "$c" && $G checkout -q "$1" && echo "$RANDOM" > "moved-$RANDOM.txt" && $G add -A && $G commit -q -m "$1 moved" && $G push -q origin "$1"; rm -rf "$c" ); }
 gb() { ( cd "$br" && CTL_LOG_DIR="$ld" "$HERE/ctl" gate "$($G rev-parse HEAD)" --repo "$br" "$@" 2>&1 ); }
 check "13.1502 base gate: --base release/x on a branch containing origin/release/x proceeds" 'gb --base release/x --dry-run | tail -1 | grep -q "^OK gate dry-run"'
@@ -149,50 +149,49 @@
 rm -rf "$gm"
 # 13.1702-13.1704: the verb. The fixture gate.sh at $br echoes GATE_MODE=${GATE_MODE:-unset}, so the OK line carries what the verb passed.
 mkline() { gbr "$@" | tail -1; }
-check "13.1702 gate modes: --base release/x is release-kind — the OK line says mode=cached and carries the cache count" 'l=$(mkline --base release/x); printf "%s" "$l" | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +41 successful, 41 total · Cached: +0 cached, 41 total"'
+check "13.1702 gate modes: --base release/x is release-kind — the OK line says mode=cached and carries the cache count" 'l=$(mkline --base release/x); printf "%s" "$l" | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +46 successful, 46 total · Cached: +0 cached, 46 total"'
 check "13.1702 gate modes: CONTROL — the default (no --base) is main-kind: mode=fresh" 'l=$(mkline); printf "%s" "$l" | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh · "'
 check "13.1702 gate modes: CONTROL — --base main spelled out is main-kind too: mode=fresh" 'l=$(mkline --base main); printf "%s" "$l" | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh · "'
 check "13.1703 gate modes: --dry-run names the mode it would pass, per base" 'gb --base release/x --dry-run | grep -q "^DRY: GATE_MODE=cached " && gb --dry-run | grep -q "^DRY: GATE_MODE=fresh "'
 # 13.1704: a gate.sh that ignores GATE_MODE (a stale copy) must not pass under the wrong name.
-( cd "$br" && printf '%s\n' '#!/bin/bash' 'printf "Tasks:    41 successful, 41 total\nCached:    0 cached, 41 total\n" > "$1"' 'echo "GATE_MODE=fresh"' 'echo EXIT=0' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && $G commit -q -am "stale gate.sh" )
+( cd "$br" && printf '%s\n' '#!/bin/bash' 'printf "Tasks:    46 successful, 46 total\nCached:    0 cached, 46 total\n" > "$1"' 'echo "GATE_MODE=fresh"' 'echo EXIT=0' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && $G commit -q -am "stale gate.sh" )
 check "13.1704 gate modes: a gate.sh that ran fresh when cached was asked for FAILS the verb, naming both" 'out=$(gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*asked for cached, gate.sh ran fresh"'
 check "13.1704 gate modes: CONTROL — the same stale gate.sh is correct for main-kind, which asked for fresh" 'gbr | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh"'
 ( cd "$br" && $G reset -q --hard HEAD~1 )
 # 13.1716: a short run fails the verb. Without the Tasks pin a task dropped from the graph (or a missing build:webview) would read
 # green. The fixture prints GATE_MODE=<what it was asked for> and a Tasks line from $FIXTURE_OK (successful) and $FIXTURE_TASKS (total), both defaulting to 41.
-( cd "$br" && printf '%s\n' '#!/bin/bash' 'printf "Tasks:    ${FIXTURE_OK:-${FIXTURE_TASKS:-41}} successful, ${FIXTURE_TASKS:-41} total\nCached:    0 cached, ${FIXTURE_TASKS:-41} total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=0' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && $G commit -q -am "short-run fixture" )
+( cd "$br" && printf '%s\n' '#!/bin/bash' 'printf "Tasks:    ${FIXTURE_OK:-${FIXTURE_TASKS:-46}} successful, ${FIXTURE_TASKS:-46} total\nCached:    0 cached, ${FIXTURE_TASKS:-46} total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=0' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && $G commit -q -am "short-run fixture" )
 check "13.1716 task count: a cached run of 33/33 FAILS the verb, naming the Tasks line" 'out=$(FIXTURE_TASKS=33 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *33 successful, 33 total"'
 check "13.1716 task count: a fresh (main-kind) run of 33/33 FAILS too" 'out=$(FIXTURE_TASKS=33 gbr); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *33 successful, 33 total"'
-check "13.1716 task count: a run that is 40 of 41 (a task failed) FAILS" 'out=$(FIXTURE_OK=40 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *40 successful, 41 total"'
-check "13.1716 task count: CONTROL — the same fixture at 41/41 passes, so the failure arms fail on the count and nothing else" 'FIXTURE_TASKS=41 gbr --base release/x | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +41 successful, 41 total"'
-# 13.1840-13.1849: Knowledge Graph C T1 adds packages/knowledge-graph (build, test, typecheck) and packages/knowledge-graph-browser (test, typecheck), so its gate runs 41 tasks (36 + 5).
-# #968 let the tip accept 36 OR 41 until C T1 landed; C T1's last commit pins 41-ONLY (the same shape as G-9's e739eeaf), so the 36/36 arms below are FAIL controls and 13.1849 is the flip.
-check "13.1840 task count: a cached run of 41/41 passes the verb (KG C T1's graph)" 'FIXTURE_TASKS=41 gbr --base release/x | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +41 successful, 41 total"'
-check "13.1840 task count: a fresh (main-kind) run of 41/41 passes too" 'FIXTURE_TASKS=41 gbr | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh · Tasks: +41 successful, 41 total"'
-check "13.1841 task count: CONTROL — 40/40 still FAILS, so 41 is accepted by value and not by any count" 'out=$(FIXTURE_TASKS=40 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *40 successful, 40 total"'
-check "13.1841 task count: CONTROL — 42/42 still FAILS" 'out=$(FIXTURE_TASKS=42 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *42 successful, 42 total"'
-check "13.1841 task count: CONTROL — a 41-task run that is 41 of 40 FAILS" 'out=$(FIXTURE_OK=41 FIXTURE_TASKS=40 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *41 successful, 40 total"'
-check "13.1842 task count: CONTROL — a short 41-task run (40 of 41) FAILS" 'out=$(FIXTURE_OK=40 FIXTURE_TASKS=41 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *40 successful, 41 total"'
-check "13.1842 task count: CONTROL — 39 successful of 41 total FAILS (the pair must agree)" 'out=$(FIXTURE_OK=39 FIXTURE_TASKS=41 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *39 successful, 41 total"'
-check "13.1842 task count: CONTROL — 41 successful of 39 total FAILS" 'out=$(FIXTURE_OK=41 FIXTURE_TASKS=39 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *41 successful, 39 total"'
-check "13.1843 task count: CONTROL — a 34-task run (34/34) FAILS the verb on the 41-only tip, naming the Tasks line" 'out=$(FIXTURE_TASKS=34 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *34 successful, 34 total"'
-check "13.1844 task count: a cached run of 41/41 passes the verb, and so does a fresh (main-kind) one" '( FIXTURE_TASKS=41 gbr --base release/x | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +41 successful, 41 total" && FIXTURE_TASKS=41 gbr | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh · Tasks: +41 successful, 41 total" )'
-for n in 34 35 36 37 40 42; do
-  check "13.1845 task count: CONTROL — $n/$n FAILS, naming the Tasks line (accepted by value, not by range; 36/36 is the old graph and FAILS now)" 'out=$(FIXTURE_TASKS='$n' gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *'$n' successful, '$n' total"'
+check "13.1716 task count: a run that is 45 of 46 (a task failed) FAILS" 'out=$(FIXTURE_OK=45 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *45 successful, 46 total"'
+check "13.1716 task count: CONTROL — the same fixture at 46/46 passes, so the failure arms fail on the count and nothing else" 'FIXTURE_TASKS=46 gbr --base release/x | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +46 successful, 46 total"'
+# 13.1840-13.1849: Knowledge Graph C T1 adds packages/knowledge-graph (build, test, typecheck) and packages/knowledge-graph-browser (test, typecheck), so its gate runs 46 tasks (41 + 5).
+# #968 let the tip accept 41 OR 46 until C T1 landed; C T1's last commit pins 46-ONLY (the same shape as G-9's e739eeaf), so the 41/41 arms below are FAIL controls and 13.1849 is the flip.
+check "13.1840 task count: a cached run of 46/46 passes the verb (KG C T1's graph)" 'FIXTURE_TASKS=46 gbr --base release/x | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +46 successful, 46 total"'
+check "13.1840 task count: a fresh (main-kind) run of 46/46 passes too" 'FIXTURE_TASKS=46 gbr | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh · Tasks: +46 successful, 46 total"'
+check "13.1841 task count: CONTROL — 45/45 still FAILS, so 46 is accepted by value and not by any count" 'out=$(FIXTURE_TASKS=45 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *45 successful, 45 total"'
+check "13.1841 task count: CONTROL — 47/47 still FAILS" 'out=$(FIXTURE_TASKS=47 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *47 successful, 47 total"'
+check "13.1841 task count: CONTROL — a 46-task run that is 46 of 45 FAILS" 'out=$(FIXTURE_OK=46 FIXTURE_TASKS=45 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *46 successful, 45 total"'
+check "13.1842 task count: CONTROL — a short 46-task run (45 of 46) FAILS" 'out=$(FIXTURE_OK=45 FIXTURE_TASKS=46 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *45 successful, 46 total"'
+check "13.1842 task count: CONTROL — 44 successful of 46 total FAILS (the pair must agree)" 'out=$(FIXTURE_OK=44 FIXTURE_TASKS=46 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *44 successful, 46 total"'
+check "13.1842 task count: CONTROL — 46 successful of 44 total FAILS" 'out=$(FIXTURE_OK=46 FIXTURE_TASKS=44 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *46 successful, 44 total"'
+check "13.1843 task count: CONTROL — a 34-task run (34/34) FAILS the verb on the 46-only tip, naming the Tasks line" 'out=$(FIXTURE_TASKS=34 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *34 successful, 34 total"'
+check "13.1844 task count: a cached run of 46/46 passes the verb, and so does a fresh (main-kind) one" '( FIXTURE_TASKS=46 gbr --base release/x | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +46 successful, 46 total" && FIXTURE_TASKS=46 gbr | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh · Tasks: +46 successful, 46 total" )'
+for n in 34 35 36 37 41 45 47; do
+  check "13.1845 task count: CONTROL — $n/$n FAILS, naming the Tasks line (accepted by value, not by range; 41/41 is the old graph and FAILS now)" 'out=$(FIXTURE_TASKS='$n' gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *'$n' successful, '$n' total"'
 done
-check "13.1846 task count: CONTROL — mixed pair 36 successful of 41 total FAILS" 'out=$(FIXTURE_OK=36 FIXTURE_TASKS=41 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *36 successful, 41 total"'
-check "13.1846 task count: CONTROL — mixed pair 41 successful of 36 total FAILS" 'out=$(FIXTURE_OK=41 FIXTURE_TASKS=36 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *41 successful, 36 total"'
-check "13.1846 task count: CONTROL — a short 41-task run FAILS main-kind too" 'out=$(FIXTURE_OK=40 FIXTURE_TASKS=41 gbr); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *40 successful, 41 total"'
-check "13.1847 task count: CONTROL — anchored on the left: 141 of 41 FAILS (the accepted count as the tail of a longer one)" 'out=$(FIXTURE_OK=141 FIXTURE_TASKS=41 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *141 successful, 41 total"'
-check "13.1847 task count: CONTROL — 41 of 410 FAILS (the accepted count as the prefix of the total)" 'out=$(FIXTURE_OK=41 FIXTURE_TASKS=410 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *41 successful, 410 total"'
-check "13.1847 task count: CONTROL — anchored on the right: text after 'total' FAILS (41/41 total total)" 'out=$(FIXTURE_OK=41 FIXTURE_TASKS="41 total" gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *41 successful, 41 total total"'
-check "13.1848 task count: the transitional marker is gone — gate.sh carries no TEMPORARY \"36 or 41\" comment and names the 41-only line" '! grep -q "TEMPORARY \"36 or 41\"" "$HERE/verbs/gate.sh" && grep -q "41 successful, 41" "$HERE/verbs/gate.sh"'
+check "13.1846 task count: CONTROL — mixed pair 41 successful of 46 total FAILS" 'out=$(FIXTURE_OK=41 FIXTURE_TASKS=46 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *41 successful, 46 total"'
+check "13.1846 task count: CONTROL — mixed pair 46 successful of 41 total FAILS" 'out=$(FIXTURE_OK=46 FIXTURE_TASKS=41 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *46 successful, 41 total"'
+check "13.1846 task count: CONTROL — a short 46-task run FAILS main-kind too" 'out=$(FIXTURE_OK=45 FIXTURE_TASKS=46 gbr); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *45 successful, 46 total"'
+check "13.1847 task count: CONTROL — anchored on the left: 146 of 46 FAILS (the accepted count as the tail of a longer one)" 'out=$(FIXTURE_OK=146 FIXTURE_TASKS=46 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *146 successful, 46 total"'
+check "13.1847 task count: CONTROL — 46 of 460 FAILS (the accepted count as the prefix of the total)" 'out=$(FIXTURE_OK=46 FIXTURE_TASKS=460 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *46 successful, 460 total"'
+check "13.1847 task count: CONTROL — anchored on the right: text after 'total' FAILS (46/46 total total)" 'out=$(FIXTURE_OK=46 FIXTURE_TASKS="46 total" gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *46 successful, 46 total total"'
+check "13.1848 task count: the transitional marker is gone — gate.sh carries no TEMPORARY \"41 or 46\" comment and names the 46-only line" '! grep -q "TEMPORARY \"41 or 46\"" "$HERE/verbs/gate.sh" && grep -q "46 successful, 46" "$HERE/verbs/gate.sh"'
 check "13.1849 task count: the verb is 41-only — 36/36 FAILS naming the Tasks line, release-kind and main-kind" '( for base in "--base release/x" ""; do out=$(FIXTURE_TASKS=36 gbr $base); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *36 successful, 36 total" || exit 1; done )'
-# 13.2020-13.2024 (13.2025 is the pending 46-only flip): Workflow and Timeline graphs Part 1 T1 adds packages/viewport (build, test, typecheck) and packages/flow-graph-browser
-# (test, typecheck), so its gate runs 46 tasks (41 + 5) while the verb that runs is the primary checkout's (41-only). The verb accepts 41 OR 46 until T1's last commit pins 46-only.
-# 13.1840-13.1849 above still hold (41 passes; 34, 35, 36, 37, 40, 42 and mixed pairs fail).
+# 13.2020-13.2025: Workflow and Timeline graphs Part 1 T1 adds packages/viewport (build, test, typecheck) and packages/flow-graph-browser
+# (test, typecheck), so its gate runs 46 tasks (41 + 5). The TEMPORARY 41-or-46 verb let the tip accept both until T1 landed; T1's last commit pins 46-ONLY, so the 41/41 arms are FAIL controls and 13.2025 is the flip.
 check "13.2020 task count: a cached run of 46/46 passes the verb (WTG Part 1 T1's graph), and so does a fresh (main-kind) one" '( FIXTURE_TASKS=46 gbr --base release/x | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +46 successful, 46 total" && FIXTURE_TASKS=46 gbr | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh · Tasks: +46 successful, 46 total" )'
-check "13.2020 task count: CONTROL — 41/41 still passes on the same tip (the old graph, both kinds)" '( FIXTURE_TASKS=41 gbr --base release/x | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +41 successful, 41 total" && FIXTURE_TASKS=41 gbr | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh · Tasks: +41 successful, 41 total" )'
+check "13.2025 task count: the verb is 46-only — 41/41 FAILS naming the Tasks line, release-kind and main-kind" '( for base in "--base release/x" ""; do out=$(FIXTURE_TASKS=41 gbr $base); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *41 successful, 41 total" || exit 1; done )'
 for n in 44 45 47 51; do
   check "13.2021 task count: CONTROL — $n/$n FAILS, naming the Tasks line (accepted by value, not by a range between the two graphs)" 'out=$(FIXTURE_TASKS='$n' gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *'$n' successful, '$n' total"'
 done
@@ -200,7 +199,6 @@
 check "13.2022 task count: CONTROL — mixed pair 46 successful of 41 total FAILS" 'out=$(FIXTURE_OK=46 FIXTURE_TASKS=41 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *46 successful, 41 total"'
 check "13.2022 task count: CONTROL — a short 46-task run (45 of 46) FAILS, release-kind and main-kind" '( for base in "--base release/x" ""; do out=$(FIXTURE_OK=45 FIXTURE_TASKS=46 gbr $base); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *45 successful, 46 total" || exit 1; done )'
 check "13.2023 task count: CONTROL — the match is anchored: 146 of 46 and 46 of 460 FAIL (an accepted count as the tail of a longer one, and as the prefix of the total)" '( out=$(FIXTURE_OK=146 FIXTURE_TASKS=46 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *146 successful, 46 total" && out=$(FIXTURE_OK=46 FIXTURE_TASKS=460 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *46 successful, 460 total" )'
-check "13.2024 task count: the TEMPORARY marker is greppable — gate.sh names the 41-or-46 pair and WTG Part 1 T1's LAST commit as the one that pins 46-only" 'grep -q "TEMPORARY \"41 or 46\"" "$HERE/verbs/gate.sh" && grep -q "WTG Part 1 T1.s LAST commit pins 46-ONLY" "$HERE/verbs/gate.sh"'
 ( cd "$br" && $G reset -q --hard HEAD~1 )
 # ctl land, against a fake gh that answers pr view/comment and performs the merge for real inside the fixture bare repo.
 fg=$(mktemp -d); cat > "$fg/gh" <<'FAKEGH'
```

`scripts/ctl/test/run-tests.test.sh`:

```diff
--- a/scripts/ctl/test/run-tests.test.sh
+++ b/scripts/ctl/test/run-tests.test.sh
@@ -220,7 +220,7 @@
 
 # gate priority marker: written by verbs/gate.sh around the REAL gate run only
 bare=$(mktemp -d); /usr/bin/git init -q --bare "$bare"
-gr=$(mktemp -d); ( cd "$gr" && /usr/bin/git init -q . && /usr/bin/git symbolic-ref HEAD refs/heads/main && mkdir -p docs/lanes/gate-lock && printf '%s\n' '#!/bin/bash' 'ls "$CTL_SEM_DIR" | grep "^gate-" > "$CTL_SEM_DIR/../during"' 'printf "Tasks:    41 successful, 41 total\nCached:    0 cached, 41 total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=${GATE_FIXTURE_EXIT:-0}' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && echo helper > docs/lanes/gate-lock/locked-test.sh && /usr/bin/git add -A && /usr/bin/git commit -q -m base && /usr/bin/git remote add origin "$bare" && /usr/bin/git push -q -u origin main && /usr/bin/git checkout -q -b feat && /usr/bin/git commit -q --allow-empty -m feat )
+gr=$(mktemp -d); ( cd "$gr" && /usr/bin/git init -q . && /usr/bin/git symbolic-ref HEAD refs/heads/main && mkdir -p docs/lanes/gate-lock && printf '%s\n' '#!/bin/bash' 'ls "$CTL_SEM_DIR" | grep "^gate-" > "$CTL_SEM_DIR/../during"' 'printf "Tasks:    46 successful, 46 total\nCached:    0 cached, 46 total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=${GATE_FIXTURE_EXIT:-0}' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && echo helper > docs/lanes/gate-lock/locked-test.sh && /usr/bin/git add -A && /usr/bin/git commit -q -m base && /usr/bin/git remote add origin "$bare" && /usr/bin/git push -q -u origin main && /usr/bin/git checkout -q -b feat && /usr/bin/git commit -q --allow-empty -m feat )
 gate_run() { ( cd "$gr" && CTL_DRY_RUN=0 "$HERE/ctl" gate "$(/usr/bin/git rev-parse HEAD)" --repo "$gr" "$@" 2>&1 ); }
 reset; rm -f "$fx/during"; dry=$(gate_run --dry-run)
 check "13.1772 ctl gate --dry-run writes no priority marker (and did dry-run)" 'printf "%s" "$dry" | tail -1 | grep -q "^OK gate dry-run" && [ -z "$(ls "$CTL_SEM_DIR" | grep "^gate-")" ] && [ ! -e "$fx/during" ]'
```

`docs/lanes/gate-lock/README.md`:

```diff
--- a/docs/lanes/gate-lock/README.md
+++ b/docs/lanes/gate-lock/README.md
@@ -138,8 +138,8 @@
 ## Gate modes, the turbo cache, and measured timings (`task/gate-speedup`, owner 2026-10-02)
 
 `gate.sh` takes `GATE_MODE=fresh|cached` (unset = `fresh`; anything else refuses, exit 2). `ctl gate` picks it from `--base`
-and states the mode that RAN in its OK line, read from the console (`… EXIT=0 · mode=cached · Tasks: 41 successful, 41 total ·
-Cached: 26 cached, 41 total …`); a `gate.sh` that ran a different mode than asked fails the verb.
+and states the mode that RAN in its OK line, read from the console (`… EXIT=0 · mode=cached · Tasks: 46 successful, 46 total ·
+Cached: 26 cached, 46 total …`); a `gate.sh` that ran a different mode than asked fails the verb.
 
 | kind | command | turbo flags | when |
 |---|---|---|---|
@@ -149,7 +149,7 @@
 **The cache is only as sound as `turbo.json`'s `inputs`.** `scripts/ctl/test/gate-cache.test.sh` (a `ctl selftest` step) proves a
 changed cross-package reader changes the task hash (`ui#test` after an `apps/web/src` edit; `mobile#test` after a
 `packages/editor` CSS edit; and one row for every other declared non-dependency input, cases 13.1712–13.1715, each shown red when its
-`turbo.json` entry is removed) and that an unrelated file does not; `ctl gate` itself fails any run that is not 41/41 or 46/46 (13.1716, 13.1840–13.1849, 13.2020–13.2024; the 41 arm is TEMPORARY until WTG Part 1 T1 pins 46-only); `--real` shows it through turbo's own cache (warm → HIT → change →
+`turbo.json` entry is removed) and that an unrelated file does not; `ctl gate` itself fails any run that is not 46/46 (13.1716, 13.1840–13.1849, 13.2020–13.2025); `--real` shows it through turbo's own cache (warm → HIT → change →
 MISS), run 2026-10-02: `warm=miss rerun=hit unrelated-change=hit reader-change=miss` for both. The audit found, and `turbo.json`
 now declares: ui (client source roots + `apps/*/test`, `packages/*/test`, the `package.json` globs), app-core (the help suite walks
 `apps/**` and `packages/**`, minus build output — the `!` negations are mandatory: a glob input walks the DISK and ignores
```

`test-cases/13-deploy-and-ops.md`:

```diff
--- a/test-cases/13-deploy-and-ops.md
+++ b/test-cases/13-deploy-and-ops.md
@@ -753,22 +753,22 @@
 - 13.1714 🧪 `@gisik-nokma/server#test`: a `reference/` file (seed suites), `.env.example` (`config.test.ts`), `apps/web/e2e-stack/helpers/teardown.ts` (`e2e-teardown.test.ts` imports it) and `apps/web/next.config.ts` (`security-middleware.test.ts`) each change the hash although `web` is not a dependency of `server`. CONTROL per row: `CLAUDE.md` (the gate-lock README is itself read via `docs/**`). Mutations measured: dropping each entry turns its own row RED.
 - 13.1715 🧪 `@gisik-nokma/editor#test`: a `packages/app-core/src/views` file (read as text) and `packages/ui/test/helpers/css-rules.ts` (imported by four editor tests; `ui` is not a dependency of `editor`) each change the hash. CONTROL per row: the README leaves it alone. Mutations measured: dropping the views entry or the ui helpers entry turns its own row RED. No `packages/ui/test/tsconfig.json` exists, so none is declared.
 - 13.1716 🧪 `ctl gate` fails a short run: a fixture gate printing `GATE_MODE=cached …` and `Tasks: 33 successful, 33 total` makes the verb FAIL, naming the Tasks line, for a release-kind and a main-kind run, and a `40 successful, 41 total` run fails too. CONTROL in the same arm: the same fixture at `41 successful, 41 total` passes, so the failure arms fail on the count alone (the count was 34 until G-9 T1 put `workflow-canvas-browser`'s `test` and `typecheck` on the gate, making 36, and 36 until Knowledge Graph C T1 put `knowledge-graph`'s `build`, `test`, `typecheck` and `knowledge-graph-browser`'s `test`, `typecheck` on it, making 41). Mutation measured: loosening `grep -q '41 successful, 41 total'` to `grep -q 'successful'` turns the three failure arms RED and leaves the control green.
-- 13.1840 🧪 `ctl gate` accepts a 41-task run: a fixture gate printing `Tasks: 41 successful, 41 total` is OK for a release-kind (`mode=cached`) and a main-kind (`mode=fresh`) run. Why: Knowledge Graph C T1 adds `packages/knowledge-graph` (`build`, `test`, `typecheck`) and `packages/knowledge-graph-browser` (`test`, `typecheck`), so its gate runs 41 of 41 (36 + 5) and the verb said FAIL on the hard-coded count, and the verb that runs is the release tip's (G-9 had the same: 34 → 36; #968's transitional `36 or 41` carried the gap until C T1 landed). `scripts/ctl/verbs/gate.sh` is 41-only. Mutation measured: narrowing the pattern to 36-only turns 13.1840's two arms RED; loosening it to `grep -q 'successful'` turns every 13.1841/13.1842 arm RED (and three older 13.1716 arms).
-- 13.1841 🧪 CONTROL for 13.1840: `40 successful, 40 total` and `42 successful, 42 total` still FAIL naming the Tasks line, and `41 successful, 40 total` too — 41 is accepted by value, not by loosening to any count. 34/34 is in the FAIL set too (13.1843), as is 36/36 (13.1849).
-- 13.1842 🧪 CONTROL for 13.1840: a short 41-task run (`40 successful, 41 total`) and a mixed pair (`39 successful, 41 total`, `41 successful, 39 total`) FAIL — the successful and total halves must agree.
-- 13.1843 🧪 CONTROL: the gate rejects the old graph — a 34-task run (`34 successful, 34 total`) FAILS the verb, naming the Tasks line, on the 41-only tip, for a release-kind run. This is the reviewer's control that the old graph is gone. Mutation (own, at the tip merge): loosening `gate.sh`'s pattern to accept `34 successful, 34` too turns this case RED.
-- 13.1844 🧪 `ctl gate` accepts a 41-task run in both kinds: a fixture gate printing `Tasks: 41 successful, 41 total` is OK for a release-kind (`mode=cached`) and a main-kind (`mode=fresh`) run (one arm, both kinds). Mutation measured: narrowing the pattern to 36-only turns it RED.
-- 13.1845 🧪 CONTROL for 13.1844: `34/34`, `35/35`, `36/36`, `37/37`, `40/40` and `42/42` FAIL naming the Tasks line — the graph is accepted by value, not by a range. Mutation measured: admitting any `N/N` turns every 13.1845 arm RED (and 13.1841's, 13.1843's, 13.1716's).
-- 13.1846 🧪 CONTROL for 13.1844: mixed pairs (`36 successful, 41 total`; `41 successful, 36 total`) and a short 41-task run (`40 successful, 41 total`, main-kind) FAIL — successful and total must name the SAME graph.
-- 13.1847 🧪 CONTROL for 13.1844: the match is anchored — `141 successful, 41 total` (the accepted count as the tail of a longer one), `41 successful, 410 total` (as the prefix of the total) and `41 successful, 41 total total` (text after `total`) all FAIL. Mutation measured: dropping `^Tasks: +` (a bare substring match) turns the 141 arm RED; dropping ` total *$` (a prefix match) turns the 410 and `total total` arms RED; dropping only the trailing ` *$` turns the `total total` arm RED. Equivalent mutant, measured and left alone: dropping only the `^` (the sed makes the line begin with `Tasks:` anyway).
-- 13.1848 🧪 The transitional marker is gone: `gate.sh` carries no `TEMPORARY "36 or 41"` comment and names the 41-only line, so the 36 arm cannot linger. Mutation: restoring the comment turns it RED.
-- 13.1849 🧪 The verb is 41-only: `36 successful, 36 total` FAILS naming the Tasks line for a release-kind and a main-kind run, and 41/41 passes (13.1840, 13.1844). Landed with Knowledge Graph C T1's last commit; it was ❌ PENDING while the tip accepted both. Mutation measured: re-admitting the 36 arm turns it RED.
-- 13.2020 🧪 `ctl gate` accepts a 46-task run: a fixture gate printing `Tasks: 46 successful, 46 total` is OK for a release-kind (`mode=cached`) and a main-kind (`mode=fresh`) run, and 41/41 still passes both. Why: the verb that runs is the PRIMARY checkout's (41-only, 13.1849), but Workflow and Timeline graphs Part 1 T1 adds `packages/viewport` (build, test, typecheck) and `packages/flow-graph-browser` (test, typecheck), so its gate is 46 tasks, and the T1 lane's gate would FAIL the verb whatever its branch (the KG C T1 precedent, `36 or 41`). The verb accepts `41 successful, 41` OR `46 successful, 46` (`scripts/ctl/verbs/gate.sh`, an anchored two-alternative `grep -E`), with a TEMPORARY marker, until T1's last commit pins 46-only. Mutation measured: narrowing the pattern to 41-only turns 13.2020's 46 arms RED.
-- 13.2021 🧪 CONTROL for 13.2020: `44/44`, `45/45`, `47/47` and `51/51` still FAIL naming the Tasks line — the two graphs are accepted by value, not by a range between them. Mutation measured: admitting any `N/N` turns every 13.2021 arm RED (and 13.1841's, 13.1843's, 13.1716's).
-- 13.2022 🧪 CONTROL for 13.2020: mixed pairs (`41 successful, 46 total`; `46 successful, 41 total`) and a short 46-task run (`45 successful, 46 total`, release-kind and main-kind) FAIL — successful and total must name the SAME graph.
-- 13.2023 🧪 CONTROL for 13.2020: the match is anchored on both sides — `146 successful, 46 total` (a longer count ending in an accepted one) and `46 successful, 460 total` (an accepted count as a prefix of the total) FAIL. Mutation measured: dropping the `^Tasks: +` prefix turns the 146 arm RED; dropping the ` total *$` suffix turns the 460 arm RED.
-- 13.2024 🧪 The TEMPORARY marker is greppable: `gate.sh` carries `TEMPORARY "41 or 46"` and names WTG Part 1 T1's last commit as the one that pins 46-only, so the removal is not forgotten. Mutation: deleting the comment turns it RED.
-- 13.2025 ❌ PENDING (lands with Part 1 T1's last commit, which takes gate.sh's 46-only line): the verb is 46-only — `41 successful, 41 total` FAILS naming the Tasks line for a release-kind and a main-kind run, 46/46 passes, and 13.1840/13.2020's 41 arms flip to FAIL controls. Not covered here: this tip accepts both.
+- 13.1840 🧪 `ctl gate` accepts the gate graph's task count: a fixture gate printing `Tasks: 46 successful, 46 total` is OK for a release-kind (`mode=cached`) and a main-kind (`mode=fresh`) run. Why: the graph is 36 (through G-9's `workflow-canvas-browser`) + 5 for Knowledge Graph C T1 (`knowledge-graph`: build, test, typecheck; `knowledge-graph-browser`: test, typecheck) = 41, + 5 for Workflow and Timeline graphs Part 1 T1 (`viewport`: build, test, typecheck; `flow-graph-browser`: test, typecheck) = 46, and a gate that ran green at the new count would FAIL a verb still holding the old number. Mutation measured: narrowing the pattern to the previous graph (41-only) turns 13.1840's two arms RED.
+- 13.1841 🧪 CONTROL for 13.1840: `45 successful, 45 total` and `47 successful, 47 total` still FAIL naming the Tasks line, and `46 successful, 45 total` too — 46 is accepted by value, not by loosening to any count. 34/34 (13.1843), 36/36 (13.1849) and 41/41 (13.2025) are in the FAIL set too.
+- 13.1842 🧪 CONTROL for 13.1840: a short 46-task run (`45 successful, 46 total`) and a mixed pair (`44 successful, 46 total`, `46 successful, 44 total`) FAIL — the successful and total halves must agree.
+- 13.1843 🧪 CONTROL: the gate rejects the old graph — a 34-task run (`34 successful, 34 total`) FAILS the verb, naming the Tasks line, on the 46-only tip, for a release-kind run. This is the reviewer's control that the old graph is gone. Mutation (own, at the tip merge): loosening `gate.sh`'s pattern to accept `34 successful, 34` too turns this case RED.
+- 13.1844 🧪 `ctl gate` accepts a 46-task run in both kinds: a fixture gate printing `Tasks: 46 successful, 46 total` is OK for a release-kind (`mode=cached`) and a main-kind (`mode=fresh`) run (one arm, both kinds). Mutation measured: narrowing the pattern to 41-only turns it RED.
+- 13.1845 🧪 CONTROL for 13.1844: `34/34`, `35/35`, `36/36`, `37/37`, `41/41`, `45/45` and `47/47` FAIL naming the Tasks line — the graph is accepted by value, not by a range. Mutation measured: admitting any `N/N` turns every 13.1845 arm RED (and 13.1841's, 13.1843's, 13.1716's).
+- 13.1846 🧪 CONTROL for 13.1844: mixed pairs (`41 successful, 46 total`; `46 successful, 41 total`) and a short 46-task run (`45 successful, 46 total`, main-kind) FAIL — successful and total must name the SAME graph.
+- 13.1847 🧪 CONTROL for 13.1844: the match is anchored — `146 successful, 46 total` (the accepted count as the tail of a longer one), `46 successful, 460 total` (as the prefix of the total) and `46 successful, 46 total total` (text after `total`) all FAIL. Mutation measured: dropping the `^Tasks: +` prefix (a bare substring match) turns the 146 arm RED; dropping the ` total *$` suffix (a prefix match) turns the 460 and `total total` arms RED.
+- 13.1848 🧪 The transitional marker is gone: `gate.sh` carries no `TEMPORARY "41 or 46"` comment and names the 46-only line, so the 41 arm cannot linger. Mutation: restoring the comment turns it RED.
+- 13.1849 🧪 The verb is 46-only: `36 successful, 36 total` FAILS naming the Tasks line for a release-kind and a main-kind run. Landed with Knowledge Graph C T1's last commit as the 41-only flip; kept as a FAIL control for the oldest graph.
+- 13.2020 🧪 `ctl gate` accepts a 46-task run in both kinds (Workflow and Timeline graphs Part 1 T1; the same arm as 13.1844, kept under the id the transitional PR minted). Mutation measured: narrowing the pattern to 41-only turns it RED.
+- 13.2021 🧪 CONTROL for 13.2020: `44/44`, `45/45`, `47/47` and `51/51` FAIL naming the Tasks line — the graph is accepted by value, not by a range around it.
+- 13.2022 🧪 CONTROL for 13.2020: mixed pairs (`41 successful, 46 total`; `46 successful, 41 total`) and a short 46-task run (`45 successful, 46 total`, release-kind and main-kind) FAIL.
+- 13.2023 🧪 CONTROL for 13.2020: the match is anchored on both sides — `146 successful, 46 total` and `46 successful, 460 total` FAIL.
+- 13.2024 🚫 The TEMPORARY `"41 or 46"` marker check lived here while the tip accepted both graphs; at the pin it is the same grep as 13.1848, which now asserts the marker is gone.
+- 13.2025 🧪 The verb is 46-only: `41 successful, 41 total` (the previous graph) FAILS naming the Tasks line for a release-kind and a main-kind run, and 46/46 passes (13.1840, 13.1844). Landed with Part 1 T1's last commit; it was ❌ PENDING while the tip accepted both. Mutation measured: re-admitting the 41 arm turns it RED.
 
 ## CI repair: when CI runs, and the failures it had hidden (`task/ci-repair`, owner 2026-10-02: *"check the CI again … CI to be run only on merges to main"*)
 
```

  `Features.md`, the gate bullet: replace

```text
the verb also fails any run that is not `41 successful, 41 total` or `46 successful, 46 total` (the 41 arm is TEMPORARY until Workflow and Timeline graphs Part 1 T1 pins 46-only; 13.2020–13.2024) — an anchored match (13.1716, 13.1840–13.1849: 41/41 passes; 34/34, 35/35, 36/36, 37/37, 40/40, 42/42, mixed pairs, short runs and 141/41-style supersets fail).
```

  with

```text
the verb also fails any run that is not `46 successful, 46 total` — an anchored match (13.1716, 13.1840–13.1849, 13.2020–13.2025: 46/46 passes; 34/34, 35/35, 36/36, 37/37, 41/41, 45/45, 47/47, mixed pairs, short runs and 146/46-style supersets fail).
```

  Run the ctl battery (`slot-run.sh ctl -- scripts/ctl/ctl selftest`; every arm green), `grep -n "TEMPORARY" scripts/ctl/verbs/gate.sh` (no output) and the count one-liner (the measured count, 46 when written).
  - `ctl gate <sha> --base release/workflow-graph` (LOCAL; the verb must be the pulled primary's), then `ctl land <pr> --base release/workflow-graph` with the same `--repo`.

  - **OWNER ACTION:** after PR B lands, the owner pulls the primary checkout again, so the verb that runs is the pinned 46-only one (until then it is the transitional `41 or 46`, which still passes later gates but is not the pin).

- [ ] **Step 18: HANDOFF**: write `HANDOFF-wtg1-measure.md` with the two PR numbers, the 29.016 record (or the standing `NEEDS: owner phone`), the mutation table, and the sentence "the primary checkout must be pulled by the owner before any later task's gate (it now has two new packages)".

**Sweep list (every task copies this):** `grep -rn "viewport" apps/*/Dockerfile* docker-compose.hot.yml` (4 + 2 hits); `git grep -n "41 successful" -- scripts docs Features.md test-cases` (only historical case text remains); `pnpm check:citations`; `pnpm check:env` and `pnpm check:tasks` before the release PR.


### Task 2: The motion core: spring, momentum, rubber band, anchored zoom, wheel (cases 29.008–29.013, 29.015)

**Branch:** `task/wtg1-motion` from `origin/release/workflow-graph` (after T1 has landed). **NEEDS:** nothing.

**Files:**
- Create: `packages/viewport/src/{spring,momentum,rubber-band,anchored-zoom,wheel,driver}.ts`
- Create: `packages/viewport/test/{motion,zoom,seam}.test.ts`
- Modify: `packages/viewport/src/index.ts` (the T2 exports), `test-cases/29-workflow-timeline-graphs.md` (under `<!-- wtg-part1-viewport-timeline-view T2 -->`), `Features.md` (the T2 bullet anchor)
- Conditional (step 8): `packages/viewport/test/wheel-parity.test.ts`, a `@gisik-nokma/viewport#test` entry in `turbo.json`

**Interfaces:**
- **Consumes:** T1's package skeleton and `calendar-days.ts`.
- **Produces:**
  - `springAlpha(dtMs, tauMs = 85): number`, `tauFor(distance, epsilon, maxMs): number`, `stepLinear(current, target, dtMs, epsilon = 1e-3, reduce = false, tauMs = 85): {value, settled}`, `stepGeometric(...)` (same shape, both values > 0), `SPRING_TAU_MS = 85`, `SPRING_DT_MAX_MS = 100`
  - `releaseVelocity(samples: PanSample[], now): number` (px/s), `momentumStep(offset, velocity, dtMs): {offset, velocity, stopped}`, `MOMENTUM_TAU_MS = 240`, `MOMENTUM_STOP_PX_S = 2`, `VELOCITY_WINDOW_MS = 80`
  - `rubberOvershoot(over, extent)`, `rubber(offset, min, max, extent)`, `clampOffset(offset, min, max)`, `RUBBER_POWER = 0.3`, `SPRING_BACK_MS = 160`
  - `MIN_PPD = 4`, `MAX_PPD = 96`, `ZOOM_PRESETS = {day: 56, week: 24, month: 8}`, `clampPpd(ppd, maxPpd?)`, `dayAt(view, anchorPx)`, `zoomAbout(view, newPpd, anchorPx): View`, `presetOf(ppd, tolerance = 0.05): 'day' | 'week' | 'month' | null`, `packScale(ppd)`
  - `wheelIntent(e): {kind:'zoom', factor} | {kind:'pan', dx, dy}` (the Knowledge Graph's classifier), `wheelZoomFactor(e): number | null` (Ctrl + wheel only)
  - The driver types `Frame`, `AnimateTarget`, `AnimateOptions`, `ViewportDriver`, `RangeSource`

**Design notes (read before writing):**
- **Everything here is a pure function of its arguments.** The caller passes `dtMs`; no function reads a clock. The seam test (29.015) enforces this for every top-level `src/*.ts` forever, so a later task that reads `performance.now()` outside `dom/` fails it.
- **The spring is first order**, each frame closing `1 - e^(-dt/tau)` of the remaining distance. It never overshoots and is exact for any frame length, so a 1,000 ms stall moves what a 100 ms frame moves (the clamp, VP-4). `tauFor` shortens tau for long distances so a glide always lands inside the cap (VP-5): 85 ms stays for short ones.
- **A zoom eases geometrically** (`stepGeometric`), so halfway in time is the geometric mean of the two scales and equal steps feel equal.
- **Rubber band:** the Knowledge Graph applies the 0.3 power to a zoom ratio; a pan offset is linear, so the same power is applied to the overshoot as a curve with unit slope at the limit.
- **Anchored zoom** solves the new offset from the anchor day, so the day under the anchor keeps its screen x exactly (the tolerance in the case, 0.5 px, is for the platforms that round).

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part1-viewport-timeline-view T2 -->` in `test-cases/29-workflow-timeline-graphs.md`, insert (all ❌):

- ❌ **29.008 — tau = 85 ms: 95% of the way by about 300 ms, exactly on the target when it settles, never past it; control: a 1,000 ms step moves what a 100 ms step moves (the dt clamp) | reduced motion lands at once; a zoom (px per day) eases geometrically, so halfway in time is the geometric mean; control: without reduce one frame is partial | tauFor keeps 85 ms for a short distance and shortens it so any distance arrives inside maxMs; control: with the fixed 85 ms a 1,000,000 px glide is still moving at 450 ms.** (`packages/viewport/test/motion.test.ts`)
- ❌ **29.009 — the velocity is the least-squares slope of the last 80 ms; a pointer that rested before release has none; control: samples older than 80 ms are ignored | v(t) = v0 e^(-t/240): travel is v0 * tau, one long step equals many short ones, and it stops below 2 px/s; control: 2,000 px/s travels 480 px.** (`packages/viewport/test/motion.test.ts`)
- ❌ **29.010 — power 0.3 with unit slope at the limit: resisted, monotone, and bounded by extent / 0.3; control: inside the limits nothing changes.** (`packages/viewport/test/motion.test.ts`)
- ❌ **29.011 — the day under the anchor keeps its screen x within 0.5 px on every frame of a zoom sweep; control: zooming about the centre moves the day under the pointer.** (`packages/viewport/test/zoom.test.ts`)
- ❌ **29.012 — 4 to 96 px per day; Day 56, Week 24, Month 8; a free zoom between presets marks none; control: the exact presets are marked | the packing scale is the lower bound of the power-of-two bucket; it changes only across a bucket edge; control: 15.99 and 16 differ.** (`packages/viewport/test/zoom.test.ts`)
- ❌ **29.013 — wheelIntent is the Knowledge Graph classifier exactly; the time surfaces take over only Ctrl + wheel; control: Shift + wheel and a plain vertical wheel are the platform's.** (`packages/viewport/test/zoom.test.ts`)
- ❌ **29.015 — no Date, Math.random, performance, requestAnimationFrame, setTimeout or document in src (outside dom/); control: the scan finds a planted read.** (`packages/viewport/test/seam.test.ts`)

- [ ] **Step 2: The tests first (RED)**

`packages/viewport/test/motion.test.ts` (new):

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MOMENTUM_TAU_MS,
  RUBBER_POWER,
  SPRING_DT_MAX_MS,
  SPRING_TAU_MS,
  clampOffset,
  momentumStep,
  releaseVelocity,
  rubber,
  rubberOvershoot,
  springAlpha,
  stepGeometric,
  stepLinear,
  tauFor,
} from '../src/index.js';

const settle = (from: number, to: number, ms: number, frame = 16) => {
  let value = from;
  let t = 0;
  let settled = false;
  while (t < ms && !settled) ({ value, settled } = stepLinear(value, to, frame)), (t += frame);
  return { value, settled, t };
};

describe('29.008 the critically damped spring', () => {
  it('29.008 tau = 85 ms: 95% of the way by about 300 ms, exactly on the target when it settles, never past it; control: a 1,000 ms step moves what a 100 ms step moves (the dt clamp)', () => {
    expect([SPRING_TAU_MS, SPRING_DT_MAX_MS]).toEqual([85, 100]);
    expect(settle(0, 1, 300).value).toBeGreaterThan(0.95);
    const done = settle(0, 1, 5000);
    expect(done.settled).toBe(true);
    expect(done.value).toBe(1);
    let v = 0;
    let max = 0;
    for (let i = 0; i < 100; i += 1) ({ value: v } = stepLinear(v, 1, 16)), (max = Math.max(max, v));
    expect(max).toBeLessThanOrEqual(1);
    // control: the clamp
    expect(springAlpha(1000)).toBe(springAlpha(100));
    expect(springAlpha(50)).toBeLessThan(springAlpha(100));
    expect(stepLinear(0, 1, 1000).value).toBeCloseTo(stepLinear(0, 1, 100).value, 12);
  });

  it('29.008 reduced motion lands at once; a zoom (px per day) eases geometrically, so halfway in time is the geometric mean; control: without reduce one frame is partial', () => {
    expect(stepLinear(0, 9, 16, 1e-3, true)).toEqual({ value: 9, settled: true });
    expect(stepGeometric(56, 8, 16, 1e-4, true)).toEqual({ value: 8, settled: true });
    expect(stepLinear(0, 9, 16).settled).toBe(false);
    const k = 1 - Math.exp(-16 / SPRING_TAU_MS);
    expect(stepGeometric(64, 4, 16).value).toBeCloseTo(64 * Math.pow(4 / 64, k), 12);
  });
});

describe('29.009 momentum', () => {
  it('29.009 the velocity is the least-squares slope of the last 80 ms; a pointer that rested before release has none; control: samples older than 80 ms are ignored', () => {
    const moving = [0, 20, 40, 60, 80].map((t) => ({ t, x: t * 2 })); // 2 px/ms = 2000 px/s
    expect(releaseVelocity(moving, 80)).toBeCloseTo(2000, 6);
    expect(releaseVelocity(moving, 400)).toBe(0); // rested 320 ms
    const old = [{ t: 0, x: 0 }, { t: 10, x: 1000 }, { t: 100, x: 1100 }, { t: 140, x: 1140 }, { t: 180, x: 1180 }];
    expect(releaseVelocity(old, 180)).toBeCloseTo(1000, 6); // only t >= 100 counts: 1 px/ms
    expect(releaseVelocity([{ t: 5, x: 3 }], 5)).toBe(0);
  });

  it('29.009 v(t) = v0 e^(-t/240): travel is v0 * tau, one long step equals many short ones, and it stops below 2 px/s; control: 2,000 px/s travels 480 px', () => {
    expect(MOMENTUM_TAU_MS).toBe(240);
    let s = { offset: 0, velocity: 2000, stopped: false };
    for (let t = 0; t < 10_000 && !s.stopped; t += 16) s = momentumStep(s.offset, s.velocity, 16);
    expect(s.stopped).toBe(true);
    expect(s.offset).toBeGreaterThan(478);
    expect(s.offset).toBeLessThan(480.01);
    const one = momentumStep(0, 2000, 1000);
    const many = Array.from({ length: 1000 }).reduce<{ offset: number; velocity: number; stopped: boolean }>((a) => momentumStep(a.offset, a.velocity, 1), { offset: 0, velocity: 2000, stopped: false });
    expect(one.offset).toBeCloseTo(many.offset, 3);
    expect(momentumStep(0, 3, 16).stopped).toBe(false);
    expect(momentumStep(0, 2.02, 100).stopped).toBe(true);
  });
});

describe('29.010 the rubber band', () => {
  it('29.010 power 0.3 with unit slope at the limit: resisted, monotone, and bounded by extent / 0.3; control: inside the limits nothing changes', () => {
    expect(RUBBER_POWER).toBe(0.3);
    expect(rubberOvershoot(0.001, 800) / 0.001).toBeCloseTo(1, 3);
    let last = 0;
    for (const over of [1, 10, 100, 400, 800, 3200, 12800]) {
      const shown = rubberOvershoot(over, 800);
      expect(shown).toBeGreaterThan(last);
      expect(shown).toBeLessThan(over);
      last = shown;
    }
    expect(rubberOvershoot(800, 800)).toBeCloseTo((800 * (2 ** 0.3 - 1)) / 0.3, 9);
    expect(rubber(50, 0, 100, 800)).toBe(50);
    expect(rubber(-40, 0, 100, 800)).toBeCloseTo(-rubberOvershoot(40, 800), 9);
    expect(rubber(160, 0, 100, 800)).toBeCloseTo(100 + rubberOvershoot(60, 800), 9);
    expect(clampOffset(160, 0, 100)).toBe(100);
    expect(clampOffset(-3, 0, 100)).toBe(0);
    expect(clampOffset(40, 0, 100)).toBe(40);
  });
});

describe('29.008 a long glide is faster, never cut off', () => {
  it('29.008 tauFor keeps 85 ms for a short distance and shortens it so any distance arrives inside maxMs; control: with the fixed 85 ms a 1,000,000 px glide is still moving at 450 ms', () => {
    expect(tauFor(10, 0.5, 450)).toBe(85);
    expect(tauFor(100, 0.5, 450)).toBeLessThanOrEqual(85);
    const arrive = (distance: number, tau: number) => {
      let value = 0;
      let t = 0;
      let settled = false;
      while (!settled && t < 5000) ({ value, settled } = stepLinear(value, distance, 8, 0.5, false, tau)), (t += 8);
      return t;
    };
    const tau = tauFor(1_000_000, 0.5, 450);
    expect(tau).toBeLessThan(85);
    expect(arrive(1_000_000, tau)).toBeLessThanOrEqual(450);
    expect(arrive(1_000_000, 85)).toBeGreaterThan(450);
  });
});
```

`packages/viewport/test/zoom.test.ts` (new):

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_PPD,
  MIN_PPD,
  ZOOM_PRESETS,
  clampPpd,
  dayAt,
  packScale,
  presetOf,
  stepGeometric,
  wheelIntent,
  wheelZoomFactor,
  zoomAbout,
} from '../src/index.js';

describe('29.011 anchored zoom', () => {
  it('29.011 the day under the anchor keeps its screen x within 0.5 px on every frame of a zoom sweep; control: zooming about the centre moves the day under the pointer', () => {
    const anchorPx = 300;
    let view = { offsetDay: 20_000.3, ppd: 56 };
    const anchorDay = dayAt(view, anchorPx);
    let ppd = view.ppd;
    for (let i = 0; i < 200; i += 1) {
      ppd = stepGeometric(ppd, 8, 16).value;
      view = zoomAbout(view, ppd, anchorPx);
      expect(Math.abs((anchorDay - view.offsetDay) * view.ppd - anchorPx)).toBeLessThan(0.5);
    }
    expect(view.ppd).toBeLessThan(56);
    const centred = zoomAbout({ offsetDay: 20_000.3, ppd: 56 }, 8, 600);
    expect(Math.abs((anchorDay - centred.offsetDay) * centred.ppd - anchorPx)).toBeGreaterThan(0.5);
  });
});

describe('29.012 limits, presets and the packing scale', () => {
  it('29.012 4 to 96 px per day; Day 56, Week 24, Month 8; a free zoom between presets marks none; control: the exact presets are marked', () => {
    expect([MIN_PPD, MAX_PPD]).toEqual([4, 96]);
    expect(ZOOM_PRESETS).toEqual({ day: 56, week: 24, month: 8 });
    expect(clampPpd(2)).toBe(4);
    expect(clampPpd(500)).toBe(96);
    expect(clampPpd(500, 40)).toBe(40);
    expect(clampPpd(500, 1)).toBe(4);
    expect(presetOf(40)).toBeNull();
    expect(presetOf(56)).toBe('day');
    expect(presetOf(24)).toBe('week');
    expect(presetOf(8)).toBe('month');
  });

  it('29.012 the packing scale is the lower bound of the power-of-two bucket; it changes only across a bucket edge; control: 15.99 and 16 differ', () => {
    expect([4, 7.9, 8, 15.99, 16, 31, 32, 63, 64, 96].map(packScale)).toEqual([4, 4, 8, 8, 16, 16, 32, 32, 64, 64]);
    expect(packScale(15.99)).not.toBe(packScale(16));
  });
});

describe('29.013 the wheel', () => {
  it('29.013 wheelIntent is the Knowledge Graph classifier exactly; the time surfaces take over only Ctrl + wheel; control: Shift + wheel and a plain vertical wheel are the platform\'s', () => {
    const w = (o: Partial<{ deltaMode: number; deltaX: number; deltaY: number; ctrlKey: boolean }>) => ({ deltaMode: 0, deltaX: 0, deltaY: 0, ctrlKey: false, ...o });
    expect(wheelIntent(w({ ctrlKey: true, deltaY: 10 }))).toEqual({ kind: 'zoom', factor: Math.exp(-10 * 0.012) });
    expect(wheelIntent(w({ deltaY: 100 }))).toEqual({ kind: 'zoom', factor: Math.exp(-100 * 0.0022) });
    expect(wheelIntent(w({ deltaX: 3, deltaY: 12 }))).toEqual({ kind: 'pan', dx: 3, dy: 12 });
    expect(wheelIntent(w({ deltaMode: 1, deltaY: 3 }))).toEqual({ kind: 'zoom', factor: Math.exp(-48 * 0.0022) });
    expect(wheelZoomFactor(w({ ctrlKey: true, deltaY: 10 }))).toBe(Math.exp(-10 * 0.012));
    expect(wheelZoomFactor(w({ ctrlKey: true, deltaMode: 1, deltaY: 1 }))).toBe(Math.exp(-16 * 0.012));
    expect(wheelZoomFactor(w({ deltaY: 100 }))).toBeNull();
    expect(wheelZoomFactor(w({ deltaX: 40 }))).toBeNull();
  });
});
```

`packages/viewport/test/seam.test.ts` (new):

```ts
// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('29.015 the pure modules read no clock', () => {
  it('29.015 no Date, Math.random, performance, requestAnimationFrame, setTimeout or document in src (outside dom/); control: the scan finds a planted read', () => {
    const scan = (text: string) => /\b(Date\.now|new Date|Math\.random|performance\.|requestAnimationFrame|setTimeout|setInterval|document\.|window\.)/.test(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''));
    const dir = join(__dirname, '..', 'src');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    // the scan reads every module there is; these are the ones it must have found (later tasks add more, and are scanned too)
    for (const name of ['spring.ts', 'momentum.ts', 'rubber-band.ts', 'anchored-zoom.ts', 'wheel.ts', 'calendar-days.ts']) expect(files, name).toContain(name);
    for (const f of files) expect(scan(readFileSync(join(dir, f), 'utf8')), f).toBe(false);
    expect(scan('const t = performance.now();')).toBe(true);
  });
});
```

  The seam test lists six modules it must find. A scan over a directory with one file would be green however wrong the scan, so the list is what makes it non-vacuous; the control line at the end proves the regular expression sees a planted read.

  Run: `slot-run.sh vp -- pnpm --filter @gisik-nokma/viewport exec vitest run --maxWorkers=2 > /tmp/vp.log 2>&1; tail -n 30 /tmp/vp.log`. Expected: FAIL (modules missing).

- [ ] **Step 3: The spring and the momentum**

`packages/viewport/src/spring.ts` (new):

```ts
/**
 * The spring every glide uses (spec VP-4, VP-5, VP-6): tau = 85 ms, about 300 ms to settle, and a step is never longer
 * than 100 ms, so a stalled tab does not jump. The constants equal the Knowledge Graph's camera spring so the two
 * surfaces feel alike. (It is the first-order critically damped form the KG plan uses: each frame closes the share
 * `1 - e^(-dt / tau)` of the remaining distance. It never overshoots and is exact for any frame length.)
 *
 * PURE: no clock, no DOM. The caller passes the frame's `dtMs`.
 */
export const SPRING_TAU_MS = 85;
export const SPRING_DT_MAX_MS = 100;

/** The share of the remaining distance one frame closes. `dtMs` is clamped to [0, 100]. */
export function springAlpha(dtMs: number, tauMs = SPRING_TAU_MS): number {
  const dt = Math.min(SPRING_DT_MAX_MS, Math.max(0, dtMs));
  return 1 - Math.exp(-dt / tauMs);
}

/**
 * VP-5: a glide takes at most `maxMs` whatever the distance. A first-order spring needs `tau * ln(distance / epsilon)`
 * to arrive, so a long distance gets a SHORTER tau (a faster spring), never a snap at the end. Short distances keep 85 ms.
 */
export function tauFor(distance: number, epsilon: number, maxMs: number): number {
  const steps = Math.log(Math.max(Math.E, Math.abs(distance) / epsilon));
  // 5% margin, so a frame boundary never carries the glide past the cap.
  return Math.min(SPRING_TAU_MS, (0.95 * maxMs) / steps);
}

export type SpringResult = { value: number; settled: boolean };

/** One frame toward `target`, linear. `epsilon` is the distance (in the value's own unit) that counts as arrived. */
export function stepLinear(
  current: number,
  target: number,
  dtMs: number,
  epsilon = 1e-3,
  reduce = false,
  tauMs = SPRING_TAU_MS,
): SpringResult {
  if (reduce) return { value: target, settled: true };
  const next = current + (target - current) * springAlpha(dtMs, tauMs);
  if (Math.abs(next - target) < epsilon) return { value: target, settled: true };
  return { value: next, settled: false };
}

/**
 * One frame toward `target`, geometric: equal steps feel equal on a zoom (px per day). Both values must be > 0.
 * Halfway in time is the geometric mean, not the arithmetic one.
 */
export function stepGeometric(
  current: number,
  target: number,
  dtMs: number,
  epsilon = 1e-4,
  reduce = false,
  tauMs = SPRING_TAU_MS,
): SpringResult {
  if (reduce) return { value: target, settled: true };
  const next = current * Math.pow(target / current, springAlpha(dtMs, tauMs));
  if (Math.abs(next / target - 1) < epsilon) return { value: target, settled: true };
  return { value: next, settled: false };
}
```

`packages/viewport/src/momentum.ts` (new):

```ts
/**
 * Momentum after a drag-pan (spec VP-3). On release the offset keeps its release velocity `v0` and decays
 * `v(t) = v0 * e^(-t / tau)`, tau = 240 ms, stopping below 2 px/s. The velocity is the least-squares slope of the
 * last 80 ms of pointer samples. PURE: the caller supplies the sample times and `now`.
 */
export const MOMENTUM_TAU_MS = 240;
export const MOMENTUM_STOP_PX_S = 2;
export const VELOCITY_WINDOW_MS = 80;

/** One pointer sample: `t` in ms (any origin, one clock), `x` in px along the pan axis. */
export type PanSample = { t: number; x: number };

/**
 * Release velocity in px/s: the least-squares slope of `x` over `t` for the samples no older than 80 ms before
 * `now`. Fewer than two samples in the window (the pointer rested before release) is 0.
 */
export function releaseVelocity(samples: readonly PanSample[], now: number): number {
  const recent = samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS && now - s.t >= 0);
  if (recent.length < 2) return 0;
  const n = recent.length;
  const meanT = recent.reduce((a, s) => a + s.t, 0) / n;
  const meanX = recent.reduce((a, s) => a + s.x, 0) / n;
  let num = 0;
  let den = 0;
  for (const s of recent) {
    num += (s.t - meanT) * (s.x - meanX);
    den += (s.t - meanT) * (s.t - meanT);
  }
  if (den === 0) return 0;
  return (num / den) * 1000;
}

export type MomentumState = { offset: number; velocity: number; stopped: boolean };

/**
 * One frame of the decay, integrated exactly over `dtMs` (so a long frame travels the right distance, no clamp
 * needed): distance = v * tau * (1 - e^(-dt/tau)), velocity = v * e^(-dt/tau). `velocity` is px/s.
 */
export function momentumStep(offset: number, velocity: number, dtMs: number): MomentumState {
  const dt = Math.max(0, dtMs);
  const decay = Math.exp(-dt / MOMENTUM_TAU_MS);
  const travelled = velocity * (MOMENTUM_TAU_MS / 1000) * (1 - decay);
  const next = velocity * decay;
  if (Math.abs(next) < MOMENTUM_STOP_PX_S) return { offset: offset + travelled, velocity: 0, stopped: true };
  return { offset: offset + travelled, velocity: next, stopped: false };
}
```

- [ ] **Step 4: The rubber band and the anchored zoom**

`packages/viewport/src/rubber-band.ts` (new):

```ts
/**
 * Past a pan limit the surface rubber-bands with power 0.3 and springs back 160 ms after the last input (spec
 * VP-7, Knowledge Graph parity: `RUBBER_POWER`, `SETTLE_MS`).
 *
 * The Knowledge Graph applies the power to a zoom RATIO (`lo * (r / lo) ** 0.3`). A pan offset is linear, so the
 * same power is applied to the overshoot as a curve with unit slope at the limit (`rubberOvershoot`): the first
 * pixel past the limit moves one pixel, and each further pixel moves less, up to `extent` of resistance scale.
 */
export const RUBBER_POWER = 0.3;
export const SPRING_BACK_MS = 160;

/** The displayed overshoot for a raw overshoot `over` >= 0. `extent` is the viewport's size along the axis (> 0). */
export function rubberOvershoot(over: number, extent: number): number {
  if (over <= 0) return 0;
  return (extent * (Math.pow(1 + over / extent, RUBBER_POWER) - 1)) / RUBBER_POWER;
}

/** The displayed offset for a raw `offset` and the limits [min, max]: inside is unchanged, outside is resisted. */
export function rubber(offset: number, min: number, max: number, extent: number): number {
  if (offset < min) return min - rubberOvershoot(min - offset, extent);
  if (offset > max) return max + rubberOvershoot(offset - max, extent);
  return offset;
}

/** The nearest offset inside [min, max]: where the spring-back goes. */
export function clampOffset(offset: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, offset));
}
```

`packages/viewport/src/anchored-zoom.ts` (new):

```ts
/**
 * Zoom about an anchor (spec VP-6). The time axis is measured in DAYS (a day is an integer or a fraction of one);
 * `ppd` is pixels per day; `offsetDay` is the day at the viewport's left (portrait: top) edge.
 *
 * The anchor invariant: the day under the anchor keeps its screen position on every frame, within 0.5 px.
 * Here it holds exactly, because the new offset is solved from the anchor day.
 */
export const MIN_PPD = 4;
export const MAX_PPD = 96;
/** Day, Week and Month presets (VP-6): px per day. */
export const ZOOM_PRESETS = { day: 56, week: 24, month: 8 } as const;
export type ZoomPreset = keyof typeof ZOOM_PRESETS;

export type View = { offsetDay: number; ppd: number };

/** `ppd` inside [MIN_PPD, maxPpd]. `maxPpd` is lowered when the extent would exceed the browser's scroll size (ScrollAdapter). */
export function clampPpd(ppd: number, maxPpd = MAX_PPD): number {
  return Math.min(Math.max(MIN_PPD, maxPpd), Math.max(MIN_PPD, ppd));
}

/** The day under `anchorPx` (px from the viewport's leading edge). */
export function dayAt(view: View, anchorPx: number): number {
  return view.offsetDay + anchorPx / view.ppd;
}

/** The view after zooming to `newPpd` with the day under `anchorPx` held still. */
export function zoomAbout(view: View, newPpd: number, anchorPx: number): View {
  const anchorDay = dayAt(view, anchorPx);
  return { ppd: newPpd, offsetDay: anchorDay - anchorPx / newPpd };
}

/** Which preset `ppd` is, or null while a free zoom sits between presets (none is marked then, VP-10). */
export function presetOf(ppd: number, tolerance = 0.05): ZoomPreset | null {
  for (const [name, value] of Object.entries(ZOOM_PRESETS) as [ZoomPreset, number][]) {
    if (Math.abs(ppd - value) <= tolerance) return name;
  }
  return null;
}

/** The packing scale (PK-4): the lower bound of `ppd`'s power-of-two bucket, 4 to 64. Rows re-pack only when this changes. */
export function packScale(ppd: number): number {
  return Math.min(64, Math.max(4, 2 ** Math.floor(Math.log2(ppd))));
}
```

- [ ] **Step 5: The wheel and the driver interface**

  `wheelIntent` is the Knowledge Graph's classifier (a port of the mockup's `onWheel`); the time surfaces use only `wheelZoomFactor`, because a horizontal swipe, Shift + wheel and the plain vertical wheel are all the platform's native scrolling (VP-2).

`packages/viewport/src/wheel.ts` (new):

```ts
/**
 * Wheel input. `wheelIntent` is the Knowledge Graph's classifier, byte for byte (`packages/knowledge-graph/src/engine/wheel.ts`,
 * a port of the mockup's `onWheel`): Ctrl + wheel and a trackpad pinch (which arrives as Ctrl + wheel) zoom, a notched
 * mouse wheel zooms, a pixel scroll pans. The CameraAdapter (a free 2D camera) uses it.
 *
 * `wheelZoomFactor` is what the time surfaces (ScrollAdapter) use: they let the platform scroll natively for every wheel
 * (a horizontal swipe, Shift + wheel and the vertical wheel are all native scrolling, VP-2) and take over ONLY Ctrl + wheel.
 */
export type WheelIntent = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number };
export type WheelLike = { deltaMode: number; deltaX: number; deltaY: number; ctrlKey: boolean };

export function wheelIntent(e: WheelLike): WheelIntent {
  const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const dx = e.deltaX * px;
  const dy = e.deltaY * px;
  const mouseWheel = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 40 && Number.isInteger(dy));
  if (e.ctrlKey) return { kind: 'zoom', factor: Math.exp(-dy * 0.012) };
  if (mouseWheel) return { kind: 'zoom', factor: Math.exp(-dy * 0.0022) };
  return { kind: 'pan', dx, dy };
}

/** The zoom factor of a Ctrl + wheel (or pinch) event, or null when the event is the platform's to scroll. */
export function wheelZoomFactor(e: WheelLike): number | null {
  if (!e.ctrlKey) return null;
  const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  return Math.exp(-e.deltaY * px * 0.012);
}
```

`packages/viewport/src/driver.ts` (new):

```ts
/**
 * The one interface both adapters implement (spec VP-0), so the range planner, the cache and the packer never know
 * which one is under them. Units are the surface's: for the time views `offset` is a DAY (fractional) and `scale` is
 * px per day; the Workflow graph's camera uses graph px and a unitless zoom.
 */
export type Frame = {
  /** `performance.now()` of the frame, ms. */
  now: number;
  offset: number;
  scale: number;
  /** Smoothed velocity along the axis, in `offset` units per second (days per second on a time view). */
  velocity: number;
  /** True while something is still moving (a glide, momentum, a spring-back, a native scroll). */
  moving: boolean;
};

export type AnimateTarget = { offset?: number; scale?: number };
export type AnimateOptions = {
  /** Px from the viewport's leading edge to hold still while the scale changes. Default: the viewport centre. */
  anchorPx?: number;
  /** A glide never takes longer than this many ms whatever the distance (VP-5: 450). */
  maxMs?: number;
  /** Land at once (the caller read `prefers-reduced-motion`, VP-9). */
  instant?: boolean;
};

export interface ViewportDriver {
  /** The leading edge of the viewport on the axis (a day, fractional, on a time view). */
  offset(): number;
  /** Px per axis unit (px per day on a time view). */
  scale(): number;
  /** Glide to a target on the critically damped spring. Replaces any glide in progress. */
  animateTo(target: AnimateTarget, options?: AnimateOptions): void;
  /** Called once per frame while something moves, and once more when it settles. Returns the unsubscribe. */
  onFrame(callback: (frame: Frame) => void): () => void;
  /** The axis range in view now, inclusive (days on a time view). */
  visibleRange(): { start: number; end: number };
}

/** What a range source answers (the fake in the browser harness, the real routes in Part 4). */
export interface RangeSource<I extends { id: string }, D extends { id: string }> {
  fetchIndex(signal: AbortSignal): Promise<readonly I[]>;
  fetchChunk(chunk: number, signal: AbortSignal): Promise<readonly D[]>;
}
```

- [ ] **Step 6: Export them**

`packages/viewport/src/index.ts` (new):

```ts
export * from './spring.js';
export * from './momentum.js';
export * from './rubber-band.js';
export * from './anchored-zoom.js';
export * from './wheel.js';
export * from './calendar-days.js';
export * from './driver.js';
```

  Run the package: `slot-run.sh vp -- pnpm --filter @gisik-nokma/viewport test > /tmp/vp.log 2>&1; tail -n 20 /tmp/vp.log` (expected 13 tests green), then `pnpm --filter @gisik-nokma/viewport typecheck` and `pnpm --filter @gisik-nokma/viewport build`.

- [ ] **Step 7: Mutation pass (own)**

  One at a time; the named case must go RED; restore after each.
  - `SPRING_TAU_MS = 85` to `100`; delete the `Math.min(SPRING_DT_MAX_MS, ...)` clamp; `1 - Math.exp(-dt / tau)` to `Math.exp(-dt / tau)` → 29.008.
  - `stepGeometric`: use the linear form `current + (target - current) * alpha` → 29.008 (the geometric-mean assertion).
  - `tauFor`: delete the `0.95` margin, or return `SPRING_TAU_MS` always → the "1,000,000 px lands inside 450 ms" control.
  - `VELOCITY_WINDOW_MS = 80` to `120`; dropping the `now - s.t >= 0` guard SURVIVES (no test sample is dated after `now`; record it as a survivor, nothing passes future samples); `MOMENTUM_TAU_MS = 240` to `200` → 29.009 (the 480 px travel).
  - `RUBBER_POWER = 0.3` to `0.5`; remove the `/ RUBBER_POWER` (the slope at the limit is no longer 1) → 29.010.
  - `zoomAbout`: `anchorDay - anchorPx / newPpd` to `anchorDay - (viewport centre) / newPpd` → 29.011.
  - `packScale`: `Math.floor` to `Math.round` → 29.012 (the 15.99 vs 16 control); `MIN_PPD = 4` to `5`; `presetOf` tolerance `0.05` to `20` (40 would be marked Day).
  - `wheelIntent`: `0.012` to `0.01`; `0.0022` to `0.002`; `Number.isInteger(dy)` removed → 29.013.
  - seam: add `performance.now()` to `spring.ts` → 29.015 names `spring.ts`.

- [ ] **Step 8 (conditional): Parity with the Knowledge Graph's wheel**

  Open question 5 of the spec: at `a03cc486` the Knowledge Graph release has NO `packages/knowledge-graph/src/engine/` (only `render/`), so this package owns the classifier and the constants. Check again now: `ls packages/knowledge-graph/src/engine/ 2>/dev/null`.
  - **Absent:** nothing to do. Write "KG engine absent at <base sha>; viewport owns wheelIntent" in the HANDOFF.
  - **Present (`wheel.ts` exists):** do NOT edit the Knowledge Graph package (its release is closed to this plan, and importing viewport from it would need the same registration again). Add this parity test and the turbo entry so a change on either side re-runs it:

  ```ts
  // @vitest-environment node
  import { existsSync } from 'node:fs';
  import { join } from 'node:path';
  import { describe, expect, it } from 'vitest';
  import { wheelIntent } from '../src/index.js';

  const KG_WHEEL = join(__dirname, '../../knowledge-graph/src/engine/wheel.ts');

  describe('29.013 parity with the Knowledge Graph wheel', () => {
    it.skipIf(!existsSync(KG_WHEEL))('29.013 wheelIntent agrees with the Knowledge Graph classifier over a grid of events; control: a changed constant would disagree', async () => {
      const kg = (await import(/* @vite-ignore */ KG_WHEEL)) as { wheelIntent: typeof wheelIntent };
      let compared = 0;
      for (const deltaMode of [0, 1, 2]) for (const deltaX of [0, 3, 40]) for (const deltaY of [-120, -40, -3, 0, 7, 40, 100]) for (const ctrlKey of [false, true]) {
        const e = { deltaMode, deltaX, deltaY, ctrlKey };
        expect(wheelIntent(e), JSON.stringify(e)).toEqual(kg.wheelIntent(e));
        compared += 1;
      }
      expect(compared).toBe(126);
      expect(wheelIntent({ deltaMode: 0, deltaX: 0, deltaY: 100, ctrlKey: false })).not.toEqual({ kind: 'zoom', factor: Math.exp(-100 * 0.003) });
    });
  });
  ```

  `turbo.json`: add `"@gisik-nokma/viewport#test": { "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/packages/knowledge-graph/src/engine/**"] }` beside the other per-package entries. If the two classifiers DISAGREE, the Knowledge Graph's wins (parity is the requirement, VP-2): fix `wheel.ts` here and record it.

- [ ] **Step 9: Flip, bullet, gate**
  - Flip ❌ to ✅ on 29.008–29.013 and 29.015. `pnpm check:citations`.
  - Features section 26: replace the anchor `<!-- wtg-part1-viewport-timeline-view T2 bullet -->` with:

```markdown
- ⚙️ **The motion core** (Workflow and Timeline graphs Part 1 T2; cases 29.008–29.013, 29.015; `packages/viewport/src/{spring,momentum,rubber-band,anchored-zoom,wheel,driver}.ts`) — a critically damped spring (τ 85 ms, dt clamped at 100 ms, `tauFor` so any glide lands inside 450 ms), flick momentum (τ 240 ms, least-squares velocity over 80 ms, stop below 2 px/s), a rubber band (power 0.3, 160 ms spring-back), zoom about an anchor (4–96 px per day; presets Day 56 / Week 24 / Month 8; `packScale` is the power-of-two bucket), `wheelIntent` (the Knowledge Graph's classifier, byte for byte) and `wheelZoomFactor` (Ctrl + wheel only), and the `ViewportDriver` / `RangeSource` interfaces both adapters implement. Pure: no `Date`, `performance`, timer or DOM outside `src/dom/` (29.015 scans for it).
```

  - Run the package suite WHOLE, `pnpm turbo run typecheck build --filter=@gisik-nokma/viewport...`, then `ctl gate <sha> --base release/workflow-graph` and `ctl land <pr> --base release/workflow-graph`. HANDOFF carries the mutation table and the survivors.


### Task 3: Preloading: chunks, the fetch and widen plans, the range cache (cases 29.020–29.025)

**Branch:** `task/wtg1-range` from `origin/release/workflow-graph` (after T2). Independent of T4 and T5; may run beside them. **NEEDS:** nothing.

**Files:**
- Create: `packages/viewport/src/{range-plan,range-cache}.ts`, `packages/viewport/test/range.test.ts`
- Modify: `packages/viewport/src/index.ts` (add the two `export *` lines), `test-cases/29-workflow-timeline-graphs.md` (T3 anchor), `Features.md` (T3 bullet anchor)

**Interfaces:**
- **Consumes:** T1's `isMonday` (the test only); the `Identified` shape `{ id: string }` is declared here.
- **Produces (all pure, no clock, no fetch):**
  - constants `CHUNK_DAYS = 28`, `CHUNK_ORIGIN_DAY = 4`, `MAX_IN_FLIGHT = 2`, `IDLE_MS = 200`, `MAX_CHUNKS = 40`, `MAX_DETAIL_ENTRIES = 10_000`, `MOVING_DAYS_PER_S = 1`, `LOOK_AHEAD_S = 1.5`
  - `chunkOf(day)`, `chunkStart(chunk)`, `chunkEnd(chunk)`, `chunksCovering(range)`, `type DayRange = {start, end}` (inclusive), `type Priority = 'high' | 'low'`
  - `wantedRange(view, velocityDaysPerS): {range, side}`, `planFetches(PlanInput): {start: {chunk, priority}[], cancel: number[]}`, `planWiden(...)`, `chunksToEvict(loaded, view, entriesIn)`, `nextCoarserPpd(ppd)`, `rangeAtPpd(view, ppd, newPpd)`, `neighbourScales(scale)`, `mountRange(view)`, `panLimits(drawn, today, viewportDays, minHalfDays = 56)`
  - `class RangeCache<I, D>` (`setIndex`, `getIndex`, `putChunk`, `getChunk`, `has`, `loadedChunks`, `entriesIn`, `entryCount`, `markStale`, `staleChunks`, `evict`, `patchEntry`), `class ScopeCaches<I, D>` (`get`, `keys`; default `max = 4`), `scopeKey(workspaceIds, projectIds, mine)`
- **Used by:** T9 (`mountRange` for the bars mounted around the view, `panLimits` for the scroll extent). Part 4's Home hook owns the timers, `fetch` and `requestIdleCallback` and calls these planners; Part 1's view loads from the list's single walk and calls no route.

**Design notes:**
- A CHUNK is 28 days aligned to a Monday (the old paging unit), so `chunkStart(c)` is always a Monday; day 4 (1970-01-05) is the origin.
- `planFetches` returns what to START and what to CANCEL. At most two requests are ever in flight. Visible chunks come first; a low-priority fetch (a chunk wholly behind the direction of travel) is cancelled when a visible chunk needs the slot, and on a reversal. The caller owns the `AbortController`s.
- A stale chunk (a live event could have added an entry the cache cannot know about) is still returned by `getChunk` (stale-while-revalidate): a refetch never blanks the screen. `putChunk` replaces it and clears the mark.
- `ScopeCaches` keeps four scopes (least recently used dropped), so flipping Me | Everyone and back reuses what was loaded.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part1-viewport-timeline-view T3 -->`, insert (all ❌):

- ❌ **29.020 — 28 days from a Monday; the day before a start is the previous chunk's last; control: no chunk starts on a non-Monday.** (`packages/viewport/test/range.test.ts`)
- ❌ **29.021 — still: one viewport either side; moving: ahead by max(V, 1.5 s of travel) and half a viewport behind | at most two in flight; the visible chunks first; low-priority behind-the-travel fetches are cancelled when a visible one needs the slot | travelling later, the chunk BEHIND the view is low priority and starts after the visible one; control: standing still, the same chunk is high | a reversal cancels every low-priority fetch; chunks outside the index bounds and loaded chunks are never fetched.** (`packages/viewport/test/range.test.ts`)
- ❌ **29.022 — idle widening alternates sides outward and stops at 40 chunks, 10,000 entries or the index extent; control: nothing loaded plans nothing | past the cap the farthest chunk goes first and nothing within a viewport of the view is ever evicted.** (`packages/viewport/test/range.test.ts`)
- ❌ **29.023 — the next coarser preset, the same centre at another scale, the neighbouring packing scales, the mount range | pan limits: the drawn extent plus a viewport either side, never narrower than today +/- 56; nothing drawn is the minimum.** (`packages/viewport/test/range.test.ts`)
- ❌ **29.024 — a stale chunk is still returned; putChunk clears the mark; markStale on an unloaded chunk reports false | patchEntry changes the index and every chunk copy and reports how many; an unknown id reports 0.** (`packages/viewport/test/range.test.ts`)
- ❌ **29.025 — scopes: the same scope in another order is one cache; the fifth scope drops the least recently used; a get refreshes.** (`packages/viewport/test/range.test.ts`)

- [ ] **Step 2: The tests first (RED)**

`packages/viewport/test/range.test.ts` (new):

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CHUNK_DAYS,
  MAX_CHUNKS,
  RangeCache,
  ScopeCaches,
  chunkEnd,
  chunkOf,
  chunkStart,
  chunksCovering,
  chunksToEvict,
  mountRange,
  neighbourScales,
  nextCoarserPpd,
  panLimits,
  planFetches,
  planWiden,
  rangeAtPpd,
  scopeKey,
  wantedRange,
  isMonday,
} from '../src/index.js';

const bounds = { first: -100, last: 100 };
const none = new Map<number, 'high' | 'low'>();

describe('29.020 chunks', () => {
  it('29.020 28 days from a Monday; the day before a start is the previous chunk\'s last; control: no chunk starts on a non-Monday', () => {
    expect(CHUNK_DAYS).toBe(28);
    for (let c = -5; c <= 5; c += 1) {
      expect(isMonday(chunkStart(c))).toBe(true);
      expect(chunkEnd(c) - chunkStart(c) + 1).toBe(28);
      expect(chunkOf(chunkStart(c))).toBe(c);
      expect(chunkOf(chunkEnd(c))).toBe(c);
      expect(chunkOf(chunkStart(c) - 1)).toBe(c - 1);
    }
    expect(chunksCovering({ start: chunkStart(2), end: chunkStart(4) })).toEqual([2, 3, 4]);
  });
});

describe('29.021 what to fetch', () => {
  const view = { start: 100, end: 120 }; // V = 21
  it('29.021 still: one viewport either side; moving: ahead by max(V, 1.5 s of travel) and half a viewport behind', () => {
    expect(wantedRange(view, 0).range).toEqual({ start: 79, end: 141 });
    expect(wantedRange(view, 0.5).side).toBe(0);
    expect(wantedRange(view, 10)).toEqual({ range: { start: 100 - 11, end: 120 + 21 }, side: 1 });
    expect(wantedRange(view, 40).range.end).toBe(120 + 60);
    expect(wantedRange(view, -40)).toEqual({ range: { start: 100 - 60, end: 120 + 11 }, side: -1 });
  });

  it('29.021 at most two in flight; the visible chunks first; low-priority behind-the-travel fetches are cancelled when a visible one needs the slot', () => {
    // still: wanted = days 79-141 = chunks 2, 3, 4; visible = chunks 3 (days 88-115) and 4 (days 116-143); chunk 2 is outside the view
    const p = planFetches({ view, velocity: 0, loaded: new Set(), inFlight: none, bounds, reversed: false });
    expect(p.start).toEqual([{ chunk: 3, priority: 'high' }, { chunk: 4, priority: 'high' }]);
    // one already in flight: one slot left, and the in-flight chunk is not started twice
    const oneBusy = planFetches({ view, velocity: 0, loaded: new Set(), inFlight: new Map<number, 'high' | 'low'>([[3, 'high']]), bounds, reversed: false });
    expect(oneBusy.start).toEqual([{ chunk: 4, priority: 'high' }]);
    // two high fetches in flight (even unwanted ones): nothing starts and a HIGH fetch is never cancelled
    const busy = planFetches({ view, velocity: 0, loaded: new Set(), inFlight: new Map([[50, 'high'], [51, 'high']]), bounds, reversed: false });
    expect(busy.start).toEqual([]);
    expect(busy.cancel).toEqual([]);
    // a low fetch no longer wanted is cancelled even when nothing waits: travelling later from days 100-120 wants
    // days 89-141 = chunks 3, 4 (both loaded), so chunk 2 (days 60-87) has fallen out of the wanted range
    const stray = planFetches({ view, velocity: 12, loaded: new Set([3, 4]), inFlight: new Map<number, 'high' | 'low'>([[2, 'low']]), bounds, reversed: false });
    expect(stray).toEqual({ start: [], cancel: [2] });
    // the slot rule: travelling later over days 116-136 wants chunks 3, 4, 5; chunk 3 (behind, low) and chunk 5 (high) are in
    // flight and STILL wanted, chunk 4 (visible) waits: the low fetch is cancelled to free its slot and chunk 4 starts
    const full = planFetches({
      view: { start: chunkStart(4), end: chunkStart(4) + 20 },
      velocity: 12,
      loaded: new Set(),
      inFlight: new Map<number, 'high' | 'low'>([[3, 'low'], [5, 'high']]),
      bounds,
      reversed: false,
    });
    expect(full).toEqual({ start: [{ chunk: 4, priority: 'high' }], cancel: [3] });
  });

  it('29.021 travelling later, the chunk BEHIND the view is low priority and starts after the visible one; control: standing still, the same chunk is high', () => {
    // chunk 4 is days 116-143 (the view), chunk 3 is days 88-115 (wholly behind it), chunk 5 is days 144-171 (ahead)
    const ahead = { start: chunkStart(4), end: chunkStart(4) + 20 };
    const moving = planFetches({ view: ahead, velocity: 12, loaded: new Set([5]), inFlight: none, bounds, reversed: false });
    expect(moving.start).toEqual([{ chunk: 4, priority: 'high' }, { chunk: 3, priority: 'low' }]);
    const still = planFetches({ view: ahead, velocity: 0, loaded: new Set([5]), inFlight: none, bounds, reversed: false });
    expect(still.start.find((s) => s.chunk === 3)?.priority).toBe('high');
  });

  it('29.021 a reversal cancels every low-priority fetch; chunks outside the index bounds and loaded chunks are never fetched', () => {
    const lows = new Map<number, 'high' | 'low'>([[chunkOf(110), 'low']]);
    const rev = planFetches({ view, velocity: 12, loaded: new Set(), inFlight: lows, bounds, reversed: true });
    expect(rev.cancel).toEqual([chunkOf(110)]);
    const loaded = new Set(chunksCovering(wantedRange(view, 0).range));
    expect(planFetches({ view, velocity: 0, loaded, inFlight: none, bounds, reversed: false }).start).toEqual([]);
    expect(planFetches({ view, velocity: 0, loaded: new Set(), inFlight: none, bounds: { first: 99, last: -99 }, reversed: false }).start).toEqual([]);
    // each bound on its own: the wanted chunks are 2, 3, 4; only the one inside [first, last] may start
    expect(planFetches({ view, velocity: 0, loaded: new Set(), inFlight: none, bounds: { first: 4, last: 100 }, reversed: false }).start).toEqual([{ chunk: 4, priority: 'high' }]);
    expect(planFetches({ view, velocity: 0, loaded: new Set(), inFlight: none, bounds: { first: -100, last: 2 }, reversed: false }).start).toEqual([{ chunk: 2, priority: 'high' }]);
  });
});

describe('29.022 widening, eviction, neighbours', () => {
  it('29.022 idle widening alternates sides outward and stops at 40 chunks, 10,000 entries or the index extent; control: nothing loaded plans nothing', () => {
    const loaded = new Set([10, 11]);
    expect(planWiden({ loaded, bounds, lastSide: 1, entryCount: 5 })).toEqual({ chunk: 9, side: -1 });
    expect(planWiden({ loaded, bounds, lastSide: -1, entryCount: 5 })).toEqual({ chunk: 12, side: 1 });
    expect(planWiden({ loaded, bounds: { first: 10, last: 11 }, lastSide: 0, entryCount: 5 })).toBeNull();
    // one side at the index extent: the other side is taken instead of stopping
    expect(planWiden({ loaded, bounds: { first: 10, last: 100 }, lastSide: 1, entryCount: 5 })).toEqual({ chunk: 12, side: 1 });
    expect(planWiden({ loaded: new Set(Array.from({ length: MAX_CHUNKS }, (_, i) => i)), bounds, lastSide: 0, entryCount: 5 })).toBeNull();
    expect(planWiden({ loaded, bounds, lastSide: 0, entryCount: 10_000 })).toBeNull();
    // the control needs UNBOUNDED bounds: with finite bounds an empty set's ±Infinity edges fail the bounds check anyway,
    // so the leg would stay green with the `size === 0` guard deleted
    expect(planWiden({ loaded: new Set(), bounds: { first: -Infinity, last: Infinity }, lastSide: 0, entryCount: 0 })).toBeNull();
  });

  it('29.022 past the cap the farthest chunk goes first and nothing within a viewport of the view is ever evicted', () => {
    const view = { start: 0, end: 27 };
    const loaded = new Set(Array.from({ length: 45 }, (_, i) => i - 22));
    // 45 chunks (-22..22), 5 over the cap. Distance of chunk c's centre from day 13.5 is |4 + 28c|: 22 → 620, -22 → 612,
    // 21 → 592, -21 → 584, 20 → 564. Farthest first, exactly five.
    const out = chunksToEvict(loaded, view, () => 1);
    expect(out).toEqual([22, -22, 21, -21, 20]);
    expect(chunksToEvict(new Set([0, 1, 2]), view, () => 1)).toEqual([]);
    // the protection leg: 24,000 entries, and evicting both far chunks still leaves 12,000 (> 10,000), so only the
    // protected set (chunks -2..1, days -28..55) stops the loop from taking chunk 1 next
    const heavy = chunksToEvict(new Set([0, 1, 40, -40]), view, () => 6000);
    expect(heavy).toEqual([40, -40]);
  });

  it('29.023 the next coarser preset, the same centre at another scale, the neighbouring packing scales, the mount range', () => {
    expect([nextCoarserPpd(56), nextCoarserPpd(24), nextCoarserPpd(8), nextCoarserPpd(30)]).toEqual([24, 8, null, 24]);
    expect(rangeAtPpd({ start: 100, end: 123 }, 24, 8)).toEqual({ start: 75, end: 148 });
    expect(neighbourScales(16)).toEqual([32, 8]);
    expect(neighbourScales(64)).toEqual([32]);
    expect(neighbourScales(4)).toEqual([8]);
    expect(mountRange({ start: 100, end: 120 })).toEqual({ start: 79, end: 141 });
  });

  it('29.023 pan limits: the drawn extent plus a viewport either side, never narrower than today +/- 56; nothing drawn is the minimum', () => {
    expect(panLimits(null, 1000, 30)).toEqual({ start: 944, end: 1056 });
    expect(panLimits({ start: 990, end: 1010 }, 1000, 30)).toEqual({ start: 944, end: 1056 });
    expect(panLimits({ start: 500, end: 2000 }, 1000, 30)).toEqual({ start: 470, end: 2030 });
  });
});

describe('29.024 the cache', () => {
  type I = { id: string; start: number };
  type D = { id: string; title: string };
  it('29.024 a stale chunk is still returned; putChunk clears the mark; markStale on an unloaded chunk reports false', () => {
    const c = new RangeCache<I, D>('s');
    c.putChunk(3, [{ id: 'a', title: 'A' }]);
    expect(c.markStale(3)).toBe(true);
    expect(c.markStale(9)).toBe(false);
    expect(c.getChunk(3)).toEqual({ items: [{ id: 'a', title: 'A' }], stale: true });
    expect(c.staleChunks()).toEqual([3]);
    c.putChunk(3, [{ id: 'a', title: 'A2' }]);
    expect(c.staleChunks()).toEqual([]);
    expect(c.getChunk(3)?.items[0]?.title).toBe('A2');
    expect(c.getChunk(4)).toBeUndefined();
  });

  it('29.024 patchEntry changes the index and every chunk copy and reports how many; an unknown id reports 0', () => {
    const c = new RangeCache<I, D>('s');
    c.setIndex([{ id: 'a', start: 1 }, { id: 'b', start: 2 }]);
    c.putChunk(0, [{ id: 'a', title: 'A' }]);
    c.putChunk(1, [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
    expect(c.patchEntry('a', (e) => ({ ...e, start: 9 }), (d) => ({ ...d, title: 'new' }))).toBe(3);
    expect(c.getIndex()?.[0]?.start).toBe(9);
    expect(c.getChunk(1)?.items.map((d) => d.title)).toEqual(['new', 'B']);
    expect(c.patchEntry('zzz', (e) => e, (d) => d)).toBe(0);
    expect(c.entryCount()).toBe(3);
    c.evict(0);
    expect([...c.loadedChunks()]).toEqual([1]);
  });

  it('29.025 scopes: the same scope in another order is one cache; the fifth scope drops the least recently used; a get refreshes', () => {
    expect(scopeKey(['b', 'a'], ['p'], true)).toBe(scopeKey(['a', 'b'], ['p'], true));
    expect(scopeKey(['a'], ['q', 'p'], true)).toBe(scopeKey(['a'], ['p', 'q'], true));
    expect(scopeKey(['a'], [], true)).not.toBe(scopeKey(['a'], [], false));
    const s = new ScopeCaches<I, D>(); // the DEFAULT max (4) is the contract; passing 4 would leave a wrong default green
    for (const k of ['1', '2', '3', '4']) s.get(k);
    s.get('1');
    s.get('5');
    expect(s.keys()).toEqual(['3', '4', '1', '5']);
    // one cache per scope: a second get of a held scope returns the SAME cache (with what it loaded), not a fresh one
    const five = s.get('5');
    five.putChunk(0, [{ id: 'x', title: 'X' }]);
    expect(s.get('5')).toBe(five);
    expect(s.get('5').has(0)).toBe(true);
  });
});
```

**Kills:** (mutants of this task's Step 3 and Step 4 code; each must turn its `it()` red)
- 29.020 chunks: (a) `CHUNK_ORIGIN_DAY = 4` → `0` (day 0 is a Thursday, `isMonday` fails) (b) `chunkEnd` drops the `- 1` (29 days) (c) `chunkOf` uses `Math.trunc` for `Math.floor` (`chunkOf(chunkEnd(-1))` = 0, not -1).
- 29.021 wanted range: (a) `behind = Math.ceil(V / 2)` → `V` (start 79, not 89) (b) `LOOK_AHEAD_S = 1.5` → `1` (velocity 40: end 160, not 180) (c) `MOVING_DAYS_PER_S = 1` → `0` (0.5 days/s reports side 1).
- 29.021 at most two in flight: (a) delete planFetches' second `for` loop (`full` becomes `{start: [], cancel: []}`) (b) drop `!input.inFlight.has(c)` from the candidates filter (`oneBusy` starts chunk 3 again) (c) drop the `!wantedSet.has(chunk)` arm of the first cancel loop (`stray` cancels nothing).
- 29.021 behind is low, still is high: (a) swap the priority comparator in `candidates.sort` (`'high' ? 1 : -1`: chunk 3 low starts first) (b) `behind` ignores the travel side (`!visible.has(chunk) && chunkEnd(chunk) < input.view.start`: the still control marks chunk 3 low) (c) swap the two arms of the `side === 1 ? … : …` test in `behind` (chunk 3 becomes high while moving).
- 29.021 reversal and exclusions: (a) delete the `input.reversed ||` arm (cancel `[]`) (b) drop `!input.loaded.has(c)` (the all-loaded plan starts chunks 3, 4) (c) drop `c <= input.bounds.last` (the `last: 2` plan starts chunks 3, 4).
- 29.022 widening: (a) invert `input.lastSide === 1 ? -1 : 1` (b) delete the `input.entryCount >= MAX_DETAIL_ENTRIES` check (c) delete the `input.loaded.size === 0` check (the unbounded control returns `{chunk: -Infinity, side: 1}`).
- 29.022 eviction: (a) drop `.filter((c) => !protectedChunks.has(c))` (`heavy` becomes `[40, -40, 1]`) (b) sort by ascending distance (`out` becomes `[2, -3, 3, -4, 4]`) (c) `&&` → `||` in the stop condition (`out` is `[]`).
- 29.023 zoom helpers: (a) `p < ppd - 0.05` → `p <= ppd` (56 → 56) (b) swap `Math.floor` / `Math.ceil` in `rangeAtPpd` (`{76, 147}`) (c) drop `s >= 4` in `neighbourScales` (4 → `[8, 2]`).
- 29.023 pan limits: (a) `Math.min` → `Math.max` for `start` (990..1010 gives 960) (b) `Math.max` → `Math.min` for `end` (500..2000 gives 1056) (c) default `minHalfDays = 56` → `28` (null gives 972..1028).
- 29.024 stale: (a) `markStale` returns `true` for an unloaded chunk (b) `putChunk` keeps the old mark (`stale: this.chunks.get(chunk)?.stale ?? false`) (c) `getChunk` hides a stale chunk (`held?.stale ? undefined : held`).
- 29.024 patchEntry: (a) skip the `this.index` block (returns 2, index start stays 1) (b) `break` after the first chunk copy patched (returns 2) (c) `entryCount` also counts the index (5).
- 29.025 scopes: (a) remove `this.scopes.delete(scopeKey)` before the re-`set` in `get` (keys `['2', '3', '4', '5']`) (b) default `max = 4` → `5` (`'2'` survives) (c) `[...projectIds].sort()` → `[...projectIds]` (the `['q', 'p']` key differs).

  Run: `slot-run.sh vp -- pnpm --filter @gisik-nokma/viewport exec vitest run test/range.test.ts --maxWorkers=2 > /tmp/vp.log 2>&1; tail -n 20 /tmp/vp.log`. Expected: FAIL (modules missing).

- [ ] **Step 3: The planner**

`packages/viewport/src/range-plan.ts` (new):

```ts
/**
 * What to load, and what to keep (spec §4, PR-1 to PR-5). PURE: it takes the view, the smoothed velocity and what is
 * loaded or in flight, and answers which chunks to start, which to cancel, which to widen to when idle and which to
 * evict. The HOOK that owns timers, `fetch` and `requestIdleCallback` lives elsewhere; this file never reads a clock.
 *
 * Terms: `V` = the viewport width in days. A CHUNK is 28 days aligned to a Monday (the existing view's old paging unit).
 * Days are integers (`calendar-days.ts`); a day range is inclusive at both ends.
 */
export const CHUNK_DAYS = 28;
/** Day 4 (1970-01-05) is a Monday, so every chunk start is a Monday. */
export const CHUNK_ORIGIN_DAY = 4;
export const MAX_IN_FLIGHT = 2;
export const IDLE_MS = 200;
export const MAX_CHUNKS = 40;
export const MAX_DETAIL_ENTRIES = 10_000;
/** Below this smoothed speed (days per second) the view counts as still. */
export const MOVING_DAYS_PER_S = 1;
/** PR-2: look ahead this many seconds of travel, at least one viewport. */
export const LOOK_AHEAD_S = 1.5;

export type DayRange = { start: number; end: number };
export type Priority = 'high' | 'low';

export const chunkOf = (day: number): number => Math.floor((day - CHUNK_ORIGIN_DAY) / CHUNK_DAYS);
export const chunkStart = (chunk: number): number => CHUNK_ORIGIN_DAY + chunk * CHUNK_DAYS;
export const chunkEnd = (chunk: number): number => chunkStart(chunk) + CHUNK_DAYS - 1;

/** Every chunk index that intersects [start, end]. */
export function chunksCovering(range: DayRange): number[] {
  const out: number[] = [];
  for (let c = chunkOf(range.start); c <= chunkOf(range.end); c += 1) out.push(c);
  return out;
}

const widthOf = (view: DayRange): number => view.end - view.start + 1;

/**
 * PR-1 and PR-2. Still: V either side. Moving: ahead of the travel by `max(V, |v| * 1.5 s)` and at least 0.5 V behind.
 * `side` is the direction of travel (-1 earlier, 0 still, 1 later).
 */
export function wantedRange(view: DayRange, velocityDaysPerS: number): { range: DayRange; side: -1 | 0 | 1 } {
  const V = widthOf(view);
  if (Math.abs(velocityDaysPerS) < MOVING_DAYS_PER_S) return { range: { start: view.start - V, end: view.end + V }, side: 0 };
  const ahead = Math.ceil(Math.max(V, Math.abs(velocityDaysPerS) * LOOK_AHEAD_S));
  const behind = Math.ceil(V / 2);
  return velocityDaysPerS > 0
    ? { range: { start: view.start - behind, end: view.end + ahead }, side: 1 }
    : { range: { start: view.start - ahead, end: view.end + behind }, side: -1 };
}

export type PlanInput = {
  view: DayRange;
  /** Smoothed velocity, days per second (positive = toward later days). */
  velocity: number;
  loaded: ReadonlySet<number>;
  inFlight: ReadonlyMap<number, Priority>;
  /** The chunks that can hold anything: from the index's extent. Chunks outside are never fetched. */
  bounds: { first: number; last: number };
  /** True when the direction of travel flipped since the last plan: low-priority fetches are cancelled (PR-2). */
  reversed: boolean;
};
export type FetchPlan = { start: Array<{ chunk: number; priority: Priority }>; cancel: number[] };

/** PR-1, PR-2: which chunks to start (at most two in flight in all) and which in-flight low-priority fetches to cancel. */
export function planFetches(input: PlanInput): FetchPlan {
  const { range, side } = wantedRange(input.view, input.velocity);
  const wanted = chunksCovering(range).filter((c) => c >= input.bounds.first && c <= input.bounds.last);
  const wantedSet = new Set(wanted);
  const visible = new Set(chunksCovering(input.view));
  const edge = side === 1 ? input.view.end : side === -1 ? input.view.start : (input.view.start + input.view.end) / 2;
  const candidates = wanted
    .filter((c) => !input.loaded.has(c) && !input.inFlight.has(c))
    .map((chunk) => {
      const behind = side !== 0 && !visible.has(chunk) && (side === 1 ? chunkEnd(chunk) < input.view.start : chunkStart(chunk) > input.view.end);
      const priority: Priority = behind ? 'low' : 'high';
      const centre = (chunkStart(chunk) + chunkEnd(chunk)) / 2;
      return { chunk, priority, distance: visible.has(chunk) ? -1 : Math.abs(centre - edge) };
    })
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1) || a.distance - b.distance || a.chunk - b.chunk);

  const cancel: number[] = [];
  for (const [chunk, priority] of [...input.inFlight].sort((a, b) => a[0] - b[0])) {
    if (priority === 'low' && (input.reversed || !wantedSet.has(chunk))) cancel.push(chunk);
  }
  const keep = (): number => input.inFlight.size - cancel.length;
  const highWaiting = candidates.filter((c) => c.priority === 'high').length;
  for (const [chunk, priority] of [...input.inFlight].sort((a, b) => a[0] - b[0])) {
    if (MAX_IN_FLIGHT - keep() >= highWaiting) break;
    if (priority === 'low' && !cancel.includes(chunk)) cancel.push(chunk);
  }
  const slots = Math.max(0, MAX_IN_FLIGHT - keep());
  return { start: candidates.slice(0, slots).map(({ chunk, priority }) => ({ chunk, priority })), cancel };
}

/** PR-3: when nothing has moved for 200 ms, the next chunk outward, alternating sides, until a cap. Null when done. */
export function planWiden(input: {
  loaded: ReadonlySet<number>;
  bounds: { first: number; last: number };
  lastSide: -1 | 0 | 1;
  entryCount: number;
}): { chunk: number; side: -1 | 1 } | null {
  if (input.loaded.size === 0 || input.loaded.size >= MAX_CHUNKS || input.entryCount >= MAX_DETAIL_ENTRIES) return null;
  const lo = Math.min(...input.loaded);
  const hi = Math.max(...input.loaded);
  const first: -1 | 1 = input.lastSide === 1 ? -1 : 1;
  for (const side of [first, first === 1 ? -1 : 1] as const) {
    const chunk = side === 1 ? hi + 1 : lo - 1;
    if (chunk >= input.bounds.first && chunk <= input.bounds.last && !input.loaded.has(chunk)) return { chunk, side };
  }
  return null;
}

/**
 * PR-3: past a cap, evict the chunk farthest from the viewport centre first, and never one that intersects
 * [visible - V, visible + V]. Returns the chunks to drop, in order.
 */
export function chunksToEvict(
  loaded: ReadonlySet<number>,
  view: DayRange,
  entriesIn: (chunk: number) => number,
): number[] {
  const V = widthOf(view);
  const protectedChunks = new Set(chunksCovering({ start: view.start - V, end: view.end + V }));
  const centre = (view.start + view.end) / 2;
  const order = [...loaded]
    .filter((c) => !protectedChunks.has(c))
    .sort((a, b) => Math.abs((chunkStart(b) + chunkEnd(b)) / 2 - centre) - Math.abs((chunkStart(a) + chunkEnd(a)) / 2 - centre) || b - a);
  let count = loaded.size;
  let entries = 0;
  for (const c of loaded) entries += entriesIn(c);
  const out: number[] = [];
  for (const chunk of order) {
    if (count <= MAX_CHUNKS && entries <= MAX_DETAIL_ENTRIES) break;
    out.push(chunk);
    count -= 1;
    entries -= entriesIn(chunk);
  }
  return out;
}

/** PR-4: the next coarser preset below `ppd` (Week from Day, Month from Week), or null at the coarsest. */
export function nextCoarserPpd(ppd: number): number | null {
  for (const p of [56, 24, 8]) if (p < ppd - 0.05) return p;
  return null;
}

/** PR-4: the day range the same viewport centre shows at another scale (`widthPx` is the viewport's width in px). */
export function rangeAtPpd(view: DayRange, ppd: number, newPpd: number): DayRange {
  const widthPx = widthOf(view) * ppd;
  const half = widthPx / newPpd / 2;
  const centre = (view.start + view.end) / 2;
  return { start: Math.floor(centre - half), end: Math.ceil(centre + half) };
}

/** PR-4: the packing scales next door to `scale` (a power of two between 4 and 64), nearest first. */
export function neighbourScales(scale: number): number[] {
  return [scale * 2, scale / 2].filter((s) => s >= 4 && s <= 64);
}

/** PR-5: the days whose bars are mounted before they scroll in: [visible - V, visible + V]. */
export function mountRange(view: DayRange): DayRange {
  const V = widthOf(view);
  return { start: view.start - V, end: view.end + V };
}

/**
 * VP-7 and TV-3: the pan limits in days. The earliest drawn day minus one viewport to the latest plus one, and never
 * narrower than today +/- `minHalfDays` (nothing drawn: today +/- 8 weeks, the existing view: at least +/- 56 days).
 */
export function panLimits(
  drawn: DayRange | null,
  today: number,
  viewportDays: number,
  minHalfDays = 56,
): DayRange {
  const base: DayRange = { start: today - minHalfDays, end: today + minHalfDays };
  if (drawn === null) return base;
  return {
    start: Math.min(base.start, Math.floor(drawn.start - viewportDays)),
    end: Math.max(base.end, Math.ceil(drawn.end + viewportDays)),
  };
}
```

- [ ] **Step 4: The cache**

`packages/viewport/src/range-cache.ts` (new):

```ts
/**
 * The per-scope cache of loaded chunks and the whole-scope interval index (spec PR-6). PURE: plain maps, no clock,
 * no fetch. The same idea as the list's session cache (`cacheKey`, `ticket-list.tsx`): a return to the same scope reuses
 * what was loaded.
 *
 * A live event patches the cache two ways:
 * - an event that changes ONE entry (title, assignee, state, dates, ...) patches that entry wherever it is held
 *   (`patchEntry`), with no refetch;
 * - an event that could ADD an entry the cache cannot know about marks the chunk STALE (`markStale`). A stale chunk is
 *   still returned by `getChunk` (stale-while-revalidate), so a refetch never blanks the screen; `putChunk` replaces
 *   it and clears the mark.
 */
export type Identified = { id: string };

export type CachedChunk<D extends Identified> = { items: readonly D[]; stale: boolean };

export class RangeCache<I extends Identified, D extends Identified> {
  private index: I[] | null = null;
  private readonly chunks = new Map<number, { items: D[]; stale: boolean }>();

  constructor(readonly scopeKey: string) {}

  setIndex(entries: readonly I[]): void {
    this.index = [...entries];
  }

  getIndex(): readonly I[] | null {
    return this.index;
  }

  /** Replaces the chunk's items and clears its stale mark. */
  putChunk(chunk: number, items: readonly D[]): void {
    this.chunks.set(chunk, { items: [...items], stale: false });
  }

  /** The chunk as drawn, stale or not; undefined when never loaded. */
  getChunk(chunk: number): CachedChunk<D> | undefined {
    return this.chunks.get(chunk);
  }

  has(chunk: number): boolean {
    return this.chunks.has(chunk);
  }

  loadedChunks(): Set<number> {
    return new Set(this.chunks.keys());
  }

  entriesIn(chunk: number): number {
    return this.chunks.get(chunk)?.items.length ?? 0;
  }

  entryCount(): number {
    let n = 0;
    for (const c of this.chunks.values()) n += c.items.length;
    return n;
  }

  /** Marks a loaded chunk stale. Returns false when the chunk is not loaded (nothing to refetch yet). */
  markStale(chunk: number): boolean {
    const held = this.chunks.get(chunk);
    if (held === undefined) return false;
    held.stale = true;
    return true;
  }

  staleChunks(): number[] {
    return [...this.chunks].filter(([, c]) => c.stale).map(([k]) => k).sort((a, b) => a - b);
  }

  evict(chunk: number): void {
    this.chunks.delete(chunk);
  }

  /** Patches one entry of the index and every chunk copy of it. Returns how many places changed; 0 means the id is unknown here. */
  patchEntry(id: string, patchIndex: (entry: I) => I, patchDetail: (detail: D) => D): number {
    let n = 0;
    if (this.index !== null) {
      const i = this.index.findIndex((e) => e.id === id);
      if (i >= 0) {
        this.index[i] = patchIndex(this.index[i] as I);
        n += 1;
      }
    }
    for (const held of this.chunks.values()) {
      const j = held.items.findIndex((d) => d.id === id);
      if (j >= 0) {
        held.items[j] = patchDetail(held.items[j] as D);
        n += 1;
      }
    }
    return n;
  }
}

/** Several scopes at once, least recently used dropped past `max`. */
export class ScopeCaches<I extends Identified, D extends Identified> {
  private readonly scopes = new Map<string, RangeCache<I, D>>();

  constructor(private readonly max = 4) {}

  /** The cache for `scopeKey` (sorted workspace ids, sorted project ids, the Me / Everyone flag), created on first use. */
  get(scopeKey: string): RangeCache<I, D> {
    const held = this.scopes.get(scopeKey);
    if (held !== undefined) {
      this.scopes.delete(scopeKey);
      this.scopes.set(scopeKey, held);
      return held;
    }
    const fresh = new RangeCache<I, D>(scopeKey);
    this.scopes.set(scopeKey, fresh);
    while (this.scopes.size > this.max) {
      const oldest = this.scopes.keys().next().value as string;
      this.scopes.delete(oldest);
    }
    return fresh;
  }

  keys(): string[] {
    return [...this.scopes.keys()];
  }
}

/** The scope key: sorted ids, so the same scope picked in another order is the same cache. */
export function scopeKey(workspaceIds: readonly string[], projectIds: readonly string[], mine: boolean): string {
  return `${[...workspaceIds].sort().join(',')}|${[...projectIds].sort().join(',')}|${mine ? 'me' : 'all'}`;
}
```

- [ ] **Step 5: Export them**

`packages/viewport/src/index.ts` (exists on the ref with T1/T2's seven lines): add only T3's own two export lines (planner ruling 2026-10-04):

```ts
export * from './range-plan.js';
export * from './range-cache.js';
```

  (On a merge with T4 and T5 take the union of the `export *` lines.) Run the package suite: `slot-run.sh vp -- pnpm --filter @gisik-nokma/viewport test > /tmp/vp.log 2>&1; tail -n 20 /tmp/vp.log`, then typecheck and build. Expected: 25 tests green after T3 on its own.

- [ ] **Step 6: Mutation pass (own)**
  - `CHUNK_ORIGIN_DAY = 4` to `0` → 29.020 (no chunk starts on a Monday).
  - `wantedRange`: `behind = ceil(V / 2)` to `V`; `LOOK_AHEAD_S = 1.5` to `1`; `MOVING_DAYS_PER_S` to `0` → 29.021.
  - `planFetches`: delete the `reversed` arm in `cancel`; remove the second loop that frees a slot for a waiting high-priority chunk; swap the `priority` ordering in `candidates.sort` → 29.021.
  - `planWiden`: `input.lastSide === 1 ? -1 : 1` inverted; remove the `MAX_DETAIL_ENTRIES` check → 29.022.
  - `chunksToEvict`: drop the `protectedChunks` filter (the nearest chunk is evicted); sort ascending instead of descending distance → 29.022.
  - `nextCoarserPpd`: `p < ppd - 0.05` to `p <= ppd` (56 returns 56) ; `neighbourScales`: drop the `>= 4` bound; `panLimits`: `Math.min` to `Math.max` → 29.023.
  - `RangeCache.markStale` returning `true` for an unloaded chunk; `putChunk` not clearing `stale`; `patchEntry` skipping the index → 29.024. `ScopeCaches`: no `delete` before re-`set` in `get` (a get no longer refreshes); `max` to `5` → 29.025.
  - Record the survivors in the HANDOFF. (`rangeAtPpd`'s `Math.floor`/`Math.ceil` swap is killed by the exact `{75, 148}` expectation.)

**Prose to sweep:** none found (searched the ref outside `docs/superpowers/` for `range-plan`, `range-cache`, `RangeCache`, `planFetches`, `chunksToEvict`, `ScopeCaches`, `range planner`; the one hit, `packages/viewport/src/driver.ts:2` — "the range planner, the cache and the packer never know which one is under them", stays true: both files are pure and import no adapter).

- [ ] **Step 7: Flip, bullet, gate**
  - Flip ❌ to ✅ on 29.020–29.025; `pnpm check:citations`.
  - Features section 26: replace `<!-- wtg-part1-viewport-timeline-view T3 bullet -->` with:

```markdown
- ⚙️ **The range planner and cache** (Workflow and Timeline graphs Part 1 T3; cases 29.020–29.025; `packages/viewport/src/{range-plan,range-cache}.ts`) — chunks of 28 days from a Monday; `planFetches` (one viewport either side when still, ahead by `max(V, 1.5 s of travel)` and half a viewport behind when moving; at most two in flight; low-priority fetches behind the travel are cancelled on a reversal), `planWiden` (idle widening alternating sides to 40 chunks or 10,000 entries), `chunksToEvict` (farthest first, never within a viewport of the view), the zoom helpers (`nextCoarserPpd`, `rangeAtPpd`, `neighbourScales`, `mountRange`, `panLimits`), and `RangeCache` / `ScopeCaches` (a live patch changes one entry without a refetch; a stale chunk stays drawn until its replacement lands; a return to a scope reuses its chunks). Pure and unused by a screen until a later Part: Part 1 builds no route.
```

  - Package suite WHOLE, typecheck, build; `ctl gate <sha> --base release/workflow-graph`; `ctl land <pr> --base release/workflow-graph`.


### Task 4: Row packing (cases 29.050–29.054)

**Branch:** `task/wtg1-pack` from `origin/release/workflow-graph` (after T2). Independent of T3 and T5. **NEEDS:** nothing.

**Files:**
- Create: `packages/viewport/src/pack.ts`, `packages/viewport/test/pack.test.ts`
- Modify: `packages/viewport/src/index.ts` (add `export * from './pack.js'`), `test-cases/29-workflow-timeline-graphs.md` (T4 anchor), `Features.md` (T4 bullet anchor)

**Interfaces:**
- **Consumes:** nothing (pure).
- **Produces:**
  - `type Seg = {start: number; end: number}` (inclusive days), `type PackItem = {id: string; key: string | null; segments: readonly Seg[]}`, `type PackOptions = {ppd: number; labelPx?: (item, segmentIndex) => number}`, `type PackStrategy = 'segments' | 'hull'`, `type PackResult = {rows: number; rowOf: ReadonlyMap<string, number>; strategy: PackStrategy}`
  - `packLane(items, opts): PackResult`, `packLaneBy(items, opts, strategy)`, `maxOverlap(items, opts)` (the optimum the packer must reach), `footprintOf(seg, labelPx, ppd): Seg`, `naturalKeyCompare(a, b)`, `keyPartsOf(key)`, `type KeyParts`
- **Used by:** T8 (`layoutLanes` packs each epic lane), Part 3 and Part 4 (every lane of the Timeline graph and Home).

**Design notes:**
- Items are sorted by (first segment start, natural key, id) and each goes into the FIRST row where none of its segments shares a day with one already there. For ONE interval per item this greedy first fit is optimal: the row count equals the greatest number of footprints overlapping on a day (PK-2), and `maxOverlap` is the independent check of that claim. With several segments per item the segment packing is used: it leaves the gaps usable, and taking items in the same first-start order it never needs more rows than packing their hulls. The hull packing is still computed and compared, kept as PK-2's guard; segment packing is never worse (planner ruling 2026-10-04).
- Two bars on adjacent days (one ends on the 14th, the next starts on the 15th) share a row; a shared day does not.
- **The label is part of the footprint** (PK-4): a bar shorter than its label reserves the label's width along the time axis, so the key shown just outside its end never sits on top of the next bar. The label width is INJECTED (`labelPx`), cached by the caller; the pack module never measures text. The caller passes `ppd = packScale(ppd)` (T2) so rows re-pack only when the zoom crosses a power-of-two edge, not every frame of a pinch.
- Deterministic: the result is a function of the items and `ppd` only (input order does not matter); an item with no segment throws a `RangeError` rather than vanishing.
- Speed: items are bucketed by start day and only each bucket is sorted by key; a row remembers its last occupied day so the common item (starting after the row's end) needs no search; otherwise a binary search finds the first interval that could collide.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part1-viewport-timeline-view T4 -->`, insert (all ❌):

- ❌ **29.050 — rows equal the greatest overlap on 200 seeds, and no two items in a row share a day; control: an UNSORTED first fit exceeds the optimum on at least one seed.** (`packages/viewport/test/pack.test.ts`)
- ❌ **29.051 — never more rows than the hull packing, and every segment of an item sits in its one row without sharing a day; control: the hull packer alone can need more rows.** (`packages/viewport/test/pack.test.ts`)
- ❌ **29.052 — adjacent days share a row (the next can stand side by side); a shared day does not; control: the same pair one day apart split | equal starts order by natural key (GN-9 before GN-10), keyed before unkeyed, then by id; the input order does not matter | adding an item that starts after everything changes no existing row; control: adding one that starts first can.** (`packages/viewport/test/pack.test.ts`)
- ❌ **29.053 — a one-day bar whose key needs 70 px at 16 px/day reserves 5 days, so a bar on day 3 goes to a second row; control: no label measure and they share a row | the packing scale is injected: at 8 px/day the same label is 9 days, so the footprint is wider (the bucket rule is applied by the caller via packScale).** (`packages/viewport/test/pack.test.ts`)
- ❌ **29.054 — ten thousand items.** (`packages/viewport/test/pack.test.ts`)

- [ ] **Step 2: The tests first (RED)**

`packages/viewport/test/pack.test.ts` (new):

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { footprintOf, maxOverlap, naturalKeyCompare, packLane, packLaneBy, type PackItem, type Seg } from '../src/index.js';

/** A small seeded generator so a failing seed can be replayed. */
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const single = (seed: number, n = 40): PackItem[] => {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const start = Math.floor(r() * 60);
    return { id: `i${i}`, key: r() < 0.2 ? null : `GN-${Math.floor(r() * 500)}`, segments: [{ start, end: start + Math.floor(r() * 9) }] };
  });
};

/** First fit WITHOUT the sort: the planted wrong packer for the control. */
function unsortedFirstFit(items: readonly PackItem[]): number {
  const rows: Seg[][] = [];
  for (const item of items) {
    const s = item.segments[0] as Seg;
    let r = 0;
    while (r < rows.length && (rows[r] as Seg[]).some((o) => o.start <= s.end && s.start <= o.end)) r += 1;
    if (r === rows.length) rows.push([]);
    (rows[r] as Seg[]).push(s);
  }
  return rows.length;
}

const overlaps = (a: Seg, b: Seg) => a.start <= b.end && b.start <= a.end;

describe('29.050 packing is optimal for single-interval items', () => {
  it('29.050 rows equal the greatest overlap on 200 seeds, and no two items in a row share a day; control: an UNSORTED first fit exceeds the optimum on at least one seed', () => {
    let controlWorse = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const items = single(seed);
      const out = packLane(items, { ppd: 16 });
      expect(out.rows, `seed ${seed}`).toBe(maxOverlap(items, { ppd: 16 }));
      const byRow = new Map<number, Seg[]>();
      for (const it of items) {
        const row = out.rowOf.get(it.id) as number;
        const held = byRow.get(row) ?? [];
        for (const o of held) expect(overlaps(o, it.segments[0] as Seg), `seed ${seed}`).toBe(false);
        held.push(it.segments[0] as Seg);
        byRow.set(row, held);
      }
      if (unsortedFirstFit(items) > out.rows) controlWorse += 1;
    }
    expect(controlWorse).toBeGreaterThan(0);
  });
});

describe('29.051 multi-segment items', () => {
  it('29.051 never more rows than the hull packing, and every segment of an item sits in its one row without sharing a day; control: the hull packer alone can need more rows', () => {
    let hullWorse = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const r = rng(seed + 1000);
      // 1 to 3 segments per item, the count drawn from the seeded generator (spec PK-2; planner ruling 2026-10-04).
      // Checked by hand-simulation of Step 3's code: the hull packing is worse on 187 of the 200 seeds and never better.
      const items: PackItem[] = Array.from({ length: 24 }, (_, i) => {
        const n = 1 + Math.floor(r() * 3);
        const segments: Seg[] = [];
        let at = Math.floor(r() * 40);
        for (let k = 0; k < n; k += 1) {
          const end = at + 2 + Math.floor(r() * 5);
          segments.push({ start: at, end });
          at = end + 2 + Math.floor(r() * 12);
        }
        return { id: `m${i}`, key: `GN-${i}`, segments };
      });
      const out = packLane(items, { ppd: 16 });
      const hull = packLaneBy(items, { ppd: 16 }, 'hull');
      // The SEGMENT packing itself, not `out`: `packLane` returns the smaller of the two, so `out.rows <= hull.rows` held by construction.
      const segs = packLaneBy(items, { ppd: 16 }, 'segments');
      expect(segs.rows, `seed ${seed}`).toBeLessThanOrEqual(hull.rows);
      if (hull.rows > out.rows) hullWorse += 1;
      const placed = new Map<number, Seg[]>();
      for (const it of items) {
        const row = out.rowOf.get(it.id) as number;
        const held = placed.get(row) ?? [];
        for (const s of it.segments) for (const o of held) expect(overlaps(o, s), `seed ${seed}`).toBe(false);
        held.push(...it.segments);
        placed.set(row, held);
      }
    }
    expect(hullWorse).toBeGreaterThan(0);
    // A tie keeps the segment packing (PK-2): both packings need 2 rows here.
    const twin = (id: string): PackItem => ({ id, key: `GN-${id}`, segments: [{ start: 0, end: 1 }, { start: 5, end: 6 }] });
    const tie = packLane([twin('1'), twin('2')], { ppd: 16 });
    expect([tie.rows, tie.strategy]).toEqual([2, 'segments']);
  });
});

describe('29.052 adjacency, ties and stability', () => {
  it('29.052 adjacent days share a row (the next can stand side by side); a shared day does not; control: the same pair one day apart split', () => {
    const a: PackItem = { id: 'a', key: 'GN-1', segments: [{ start: 10, end: 14 }] };
    const next: PackItem = { id: 'b', key: 'GN-2', segments: [{ start: 15, end: 18 }] };
    const touching: PackItem = { id: 'c', key: 'GN-3', segments: [{ start: 14, end: 18 }] };
    expect(packLane([a, next], { ppd: 16 }).rows).toBe(1);
    expect(packLane([a, touching], { ppd: 16 }).rows).toBe(2);
    // The same rule through the row search (a row that already reaches past the bar's start): a two-segment item whose gap
    // is exactly days 10-14 takes `a` beside both of its segments; with day 10 shared it does not.
    const gapped: PackItem = { id: 'g', key: 'GN-4', segments: [{ start: 0, end: 9 }, { start: 15, end: 18 }] };
    const gappedShared: PackItem = { id: 'h', key: 'GN-5', segments: [{ start: 0, end: 10 }, { start: 15, end: 18 }] };
    expect(packLane([a, gapped], { ppd: 16 }).rows).toBe(1);
    expect(packLane([a, gappedShared], { ppd: 16 }).rows).toBe(2);
  });

  it('29.052 equal starts order by natural key (GN-9 before GN-10), keyed before unkeyed, then by id; the input order does not matter', () => {
    expect(naturalKeyCompare('GN-9', 'GN-10')).toBeLessThan(0);
    expect(naturalKeyCompare('GN-10', 'GN-9')).toBeGreaterThan(0);
    const mk = (id: string, key: string | null): PackItem => ({ id, key, segments: [{ start: 5, end: 9 }] });
    // `w` before `z` here, so a sort that drops the id tie-break keeps `forward` right and only `back` ([z, x, y, w]) goes wrong.
    const items = [mk('w', null), mk('y', 'GN-10'), mk('x', 'GN-9'), mk('z', null)];
    const forward = packLane(items, { ppd: 16 });
    const back = packLane([...items].reverse(), { ppd: 16 });
    expect([...back.rowOf].sort()).toEqual([...forward.rowOf].sort());
    for (const it of items) expect(back.rowOf.get(it.id)).toBe(forward.rowOf.get(it.id));
    expect([forward.rowOf.get('x'), forward.rowOf.get('y'), forward.rowOf.get('w'), forward.rowOf.get('z')]).toEqual([0, 1, 2, 3]);
  });

  it('29.052 adding an item that starts after everything changes no existing row; control: adding one that starts first can', () => {
    const items = single(7, 30);
    const before = packLane(items, { ppd: 16 });
    const later: PackItem = { id: 'later', key: 'GN-999', segments: [{ start: 5000, end: 5003 }] };
    const after = packLane([...items, later], { ppd: 16 });
    for (const it of items) expect(after.rowOf.get(it.id)).toBe(before.rowOf.get(it.id));
    let moved = 0;
    for (let seed = 1; seed <= 30 && moved === 0; seed += 1) {
      const base = single(seed, 12);
      const first: PackItem = { id: 'first', key: 'GN-0', segments: [{ start: -1, end: 80 }] };
      const a = packLane(base, { ppd: 16 });
      const b = packLane([...base, first], { ppd: 16 });
      moved += base.filter((it) => a.rowOf.get(it.id) !== b.rowOf.get(it.id)).length;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('29.052 an item with no segment is refused, not silently dropped', () => {
    expect(() => packLane([{ id: 'x', key: null, segments: [] }], { ppd: 16 })).toThrow(RangeError);
  });
});

describe('29.053 the label is part of the footprint', () => {
  it('29.053 a one-day bar whose key needs 70 px at 16 px/day reserves 5 days, so a bar on day 3 goes to a second row; control: no label measure and they share a row', () => {
    const a: PackItem = { id: 'a', key: 'GN-123', segments: [{ start: 0, end: 0 }] };
    const b: PackItem = { id: 'b', key: 'GN-124', segments: [{ start: 3, end: 6 }] };
    expect(footprintOf({ start: 0, end: 0 }, 70, 16)).toEqual({ start: 0, end: 4 });
    expect(footprintOf({ start: 0, end: 9 }, 70, 16)).toEqual({ start: 0, end: 9 });
    expect(packLane([a, b], { ppd: 16, labelPx: () => 70 }).rows).toBe(2);
    expect(packLane([a, b], { ppd: 16 }).rows).toBe(1);
  });

  it('29.053 the packing scale is injected: at 8 px/day the same label is 9 days, so the footprint is wider (the bucket rule is applied by the caller via packScale)', () => {
    expect(footprintOf({ start: 0, end: 0 }, 70, 8)).toEqual({ start: 0, end: 8 });
  });
});

describe('29.054 ten thousand items', () => {
  it.skipIf(process.env['VP_PERF'] === undefined)('29.054 pack 10,000 items in one lane within the 20 ms bar (VP_PERF=1; a LOCAL, warm run, median of 5)', () => {
    const r = rng(99);
    const items: PackItem[] = Array.from({ length: 10_000 }, (_, i) => {
      const start = Math.floor(r() * 900);
      return { id: `p${i}`, key: `GN-${i}`, segments: [{ start, end: start + Math.floor(r() * 20) }] };
    });
    packLane(items, { ppd: 16 }); // warm
    const times: number[] = [];
    let out = packLane(items, { ppd: 16, labelPx: () => 40 });
    for (let k = 0; k < 5; k += 1) {
      const t0 = performance.now();
      out = packLane(items, { ppd: 16, labelPx: () => 40 });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(out.rows).toBe(maxOverlap(items, { ppd: 16, labelPx: () => 40 }));
    console.log(`29.054 pack 10,000 items: median ${times[2]?.toFixed(1)} ms (LOCAL)`);
    expect(times[2]).toBeLessThan(20);
  });
});
```

**Kills:** (each mutant is an edit of Step 3's `pack.ts`, checked by hand-running the fixtures)
- 29.050 rows equal the greatest overlap: (a) `orderByStart` sorts the bucket days with a bare `.sort()` (lexicographic: day 10 before day 2) → the rows-equal leg alone; (b) `rowOf.set(p.item.id, r)` to `rowOf.set(p.item.id, rows.length - 1)` → the no-shared-day leg alone (row count unchanged); (c) fast path `rowEnd[r] < firstStart` to `<=` → both.
- 29.051 multi-segment items: (a) `rowHolds` ends `return false` instead of `return true` (every multi-segment item opens a row) → the segments-vs-hull leg and the control; (b) `byHull.rows < bySegments.rows` to `<=` (a tie goes to the hull) → the tie leg; (c) the `rowOf.set(..., rows.length - 1)` mutant above → the no-shared-day leg.
- 29.052 adjacency: (a) `rowHolds`: `hit.start <= s.end` to `hit.start <= s.end + 1` → the gapped leg (the fast path hides it from the single-interval pair); (b) `firstEndingAtOrAfter`: `.end < day` to `.end <= day` → the touching and gapped-shared legs; (c) fast path `<` to `<=` → the touching leg.
- 29.052 natural key order: (a) `keyPartsOf` keeps digit runs as text (`GN-10` before `GN-9`) → the `naturalKeyCompare` legs and the row pin; (b) swap the keyed-before-unkeyed returns in `compareItems` → the row pin; (c) `compareItems` returns `0` instead of comparing ids → the input-order legs alone (`forward` stays [0, 1, 2, 3]).
- 29.052 adding an item after everything: none from a single edit of `pack.ts` (`later` collides with nothing, so wherever any order puts it no other item moves); it guards a redesign (best fit, a key-first order). The control is killed by `orderByStart` returning the input order (`first` is then packed last and moves nothing).
- 29.052 an item with no segment: (a) delete the `RangeError` throw in `footprints` (the item then fails with a `TypeError` on `segs[0]`); (b) throw `Error` instead of `RangeError`.
- 29.053 70 px at 16 px/day: (a) `footprintOf`: `Math.ceil` to `Math.floor` → the first `footprintOf` leg; (b) `footprintOf` returns `seg.start + labelDays - 1` without the `Math.max` → the 0-9 leg; (c) `footprints` passes `0` instead of `label(item, 0)` for a one-segment item → the two-rows leg alone.
- 29.053 at 8 px/day: (a) `Math.ceil` to `Math.floor` (8.75 → 8 days, end 7); (b) drop the `- 1` (end 9).
- 29.054 ten thousand items (VP_PERF only): (a) `orderByStart` returns the input order → the rows-equal leg; the 20 ms leg is a timing and has no reliable single mutant.

  Two details to keep. The generator is seeded so a failing seed can be replayed (`seed N` is in every assertion message). `29.054` is skipped unless `VP_PERF` is set: it is a timing, and a timing on a shared gate machine is noise (the memory rule: a speed case is run LOCAL, warm, and quoted as such).

  Run: `slot-run.sh vp -- pnpm --filter @gisik-nokma/viewport exec vitest run test/pack.test.ts --maxWorkers=2 > /tmp/vp.log 2>&1; tail -n 20 /tmp/vp.log`. Expected: FAIL (module missing).

- [ ] **Step 3: The packer**

`packages/viewport/src/pack.ts` (new):

```ts
/**
 * Row packing (spec PK-1 to PK-6). Within one lane an item is a SET of day intervals (its segments); items are sorted by
 * (first segment start, key, id) and each goes into the FIRST row where none of its segments shares a day with a segment
 * already there. Adjacent days do not overlap, so "the next can stand side by side".
 *
 * PURE and deterministic: the result is a function of the items and `ppd` only. No clock, no DOM; the text measurement
 * that gives a key label its width is INJECTED (`labelPx`).
 *
 * Days are integers (see `calendar-days.ts`); a segment is inclusive at both ends.
 */
export type Seg = { start: number; end: number };

export type PackItem = {
  id: string;
  /** The ticket key, or null (a draft, or an offline replica row). Keyed items sort before unkeyed ones that start the same day. */
  key: string | null;
  /** At least one segment. */
  segments: readonly Seg[];
};

export type PackOptions = {
  /** The PACKING scale in px per day: `packScale(ppd)`, a power of two, so a footprint is never smaller than its label needs inside the bucket. */
  ppd: number;
  /**
   * The width in px the label of `item`'s segment `segmentIndex` needs along the time axis (a cached text measurement).
   * Absent: labels take no room beyond the bar.
   */
  labelPx?: (item: PackItem, segmentIndex: number) => number;
};

export type PackStrategy = 'segments' | 'hull';
export type PackResult = { rows: number; rowOf: ReadonlyMap<string, number>; strategy: PackStrategy };

/** A key split once into alternating text and number parts, so a sort compares parts rather than re-splitting strings. */
export type KeyParts = ReadonlyArray<string | number>;

export function keyPartsOf(key: string): KeyParts {
  return key.split(/(\d+)/).map((part, i) => (i % 2 === 1 ? Number(part) : part));
}

function comparePartLists(pa: KeyParts, pb: KeyParts): number {
  for (let i = 0; i < Math.min(pa.length, pb.length); i += 1) {
    const x = pa[i] as string | number;
    const y = pb[i] as string | number;
    if (x === y) continue;
    return x < y ? -1 : 1;
  }
  return pa.length - pb.length;
}

/** Natural order: `GN-9` before `GN-10`. Digits compare as numbers, everything else as text. */
export function naturalKeyCompare(a: string, b: string): number {
  return comparePartLists(keyPartsOf(a), keyPartsOf(b));
}

/** PK-4: a bar shorter than its label shows the key just outside its end, so the label is part of the footprint. */
export function footprintOf(seg: Seg, labelPx: number, ppd: number): Seg {
  const labelDays = Math.ceil(labelPx / ppd);
  return { start: seg.start, end: Math.max(seg.end, seg.start + labelDays - 1) };
}

/** Sorted by start, overlapping segments merged (one item's own footprints may overlap each other). */
function normalise(segs: readonly Seg[]): Seg[] {
  const sorted = [...segs].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Seg[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}

function footprints(item: PackItem, opts: PackOptions): Seg[] {
  if (item.segments.length === 0) throw new RangeError(`pack: item ${item.id} has no segments`);
  const label = opts.labelPx;
  if (item.segments.length === 1) return [footprintOf(item.segments[0] as Seg, label === undefined ? 0 : label(item, 0), opts.ppd)];
  return normalise(item.segments.map((s, i) => footprintOf(s, label === undefined ? 0 : label(item, i), opts.ppd)));
}

type Sortable = { item: PackItem; first: number; parts: KeyParts | null };

/**
 * Items sorted by (first start, key, id). Items are bucketed by start day first and only each bucket is sorted by key,
 * so the comparator runs on ties alone, which is most of the saving at 10,000 items.
 */
function orderByStart<T extends Sortable>(items: readonly T[]): T[] {
  const buckets = new Map<number, T[]>();
  for (const p of items) {
    const held = buckets.get(p.first);
    if (held === undefined) buckets.set(p.first, [p]);
    else held.push(p);
  }
  const out: T[] = [];
  for (const day of [...buckets.keys()].sort((a, b) => a - b)) {
    const group = buckets.get(day) as T[];
    if (group.length > 1) group.sort(compareItems);
    for (const p of group) out.push(p);
  }
  return out;
}

function compareItems(a: Sortable, b: Sortable): number {
  if (a.first !== b.first) return a.first - b.first;
  if (a.parts !== null && b.parts !== null) {
    const c = comparePartLists(a.parts, b.parts);
    if (c !== 0) return c;
  } else if (a.parts !== null) {
    return -1;
  } else if (b.parts !== null) {
    return 1;
  }
  return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
}

/** Index of the first interval in a sorted, non-overlapping row whose end is >= `day`. */
function firstEndingAtOrAfter(row: readonly Seg[], day: number): number {
  let lo = 0;
  let hi = row.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((row[mid] as Seg).end < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function rowHolds(row: readonly Seg[], segs: readonly Seg[]): boolean {
  for (const s of segs) {
    const i = firstEndingAtOrAfter(row, s.start);
    const hit = row[i];
    if (hit !== undefined && hit.start <= s.end) return false;
  }
  return true;
}

/** Pack with one named strategy. `hull` treats each item as one interval from its first start to its last end. */
export function packLaneBy(items: readonly PackItem[], opts: PackOptions, strategy: PackStrategy): PackResult {
  const prepared = items.map((item) => {
    const segs = footprints(item, opts);
    const used = strategy === 'hull' ? [{ start: (segs[0] as Seg).start, end: (segs[segs.length - 1] as Seg).end }] : segs;
    return { item, segs: used, first: (segs[0] as Seg).start, parts: item.key === null ? null : keyPartsOf(item.key) };
  });
  const ordered = orderByStart(prepared);
  const rows: Seg[][] = [];
  /** The last day any segment in the row reaches: an item starting after it fits without a search (the common case). */
  const rowEnd: number[] = [];
  const rowOf = new Map<string, number>();
  for (const p of ordered) {
    const firstStart = (p.segs[0] as Seg).start;
    let r = 0;
    while (r < rows.length && !((rowEnd[r] as number) < firstStart && p.segs.length === 1) && !rowHolds(rows[r] as Seg[], p.segs)) r += 1;
    if (r === rows.length) {
      rows.push([]);
      rowEnd.push(Number.NEGATIVE_INFINITY);
    }
    const row = rows[r] as Seg[];
    // The segments are this call's own objects (`footprints` makes them), so the row keeps them without a copy.
    for (const s of p.segs) {
      if (s.start > (rowEnd[r] as number)) row.push(s);
      else row.splice(firstEndingAtOrAfter(row, s.start), 0, s);
      rowEnd[r] = Math.max(rowEnd[r] as number, s.end);
    }
    rowOf.set(p.item.id, r);
  }
  return { rows: rows.length, rowOf, strategy };
}

/**
 * PK-2: the packing a lane uses. Greedy by start with first fit is optimal for ONE interval per item, so the row
 * count equals the largest number of footprints overlapping on any day. With several segments per item the
 * segment-set packing is returned (it leaves the gaps usable); taking items in the same first-start order, it never
 * needs more rows than packing their hulls. The hull comparison below is kept as PK-2's guard; segment packing is
 * never worse (planner ruling 2026-10-04).
 */
export function packLane(items: readonly PackItem[], opts: PackOptions): PackResult {
  const bySegments = packLaneBy(items, opts, 'segments');
  if (!items.some((item) => footprints(item, opts).length > 1)) return bySegments;
  const byHull = packLaneBy(items, opts, 'hull');
  return byHull.rows < bySegments.rows ? byHull : bySegments;
}

/** The largest number of footprints (single-interval items) that overlap on one day: the optimum `packLane` must reach. */
export function maxOverlap(items: readonly PackItem[], opts: PackOptions): number {
  const events: Array<[number, number]> = [];
  for (const item of items) {
    for (const s of footprints(item, opts)) {
      events.push([s.start, 1]);
      events.push([s.end + 1, -1]);
    }
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let max = 0;
  for (const [, delta] of events) {
    open += delta;
    max = Math.max(max, open);
  }
  return max;
}
```

- [ ] **Step 4: Export it and run**

`packages/viewport/src/index.ts` (exists on the ref with T1/T2's seven lines): add only `export * from './pack.js';` (planner ruling 2026-10-04). On a merge with T3 or T5, take the union of the `export *` lines.

```ts
export * from './pack.js';
```

  Run the package suite (33 tests pass and 1 is skipped), typecheck and build. Then the timing, three times, warm: `VP_PERF=1 slot-run.sh vp-perf -- pnpm --filter @gisik-nokma/viewport exec vitest run test/pack.test.ts -t 29.054 --maxWorkers=1 > /tmp/vp-perf.log 2>&1; grep "29.054 pack" /tmp/vp-perf.log`. Expected: a median under 20 ms (the spec's pack bar for 10,000 items); record the three medians and the machine in the HANDOFF. If it is over, do not loosen the bar: profile (`node --cpu-prof`) and fix the packer.

- [ ] **Step 5: Mutation pass (own)**
  - `orderByStart` replaced by the input order (no sort) → 29.050 (the control's whole purpose: an unsorted first fit exceeds the optimum).
  - fast path `rowEnd[r] < firstStart` to `<=` (an item starting on the row's last day fits) → 29.050, 29.052.
  - `firstEndingAtOrAfter`: `.end < day` to `<=` → 29.050 / 29.051.
  - `footprintOf`: `Math.ceil` to `Math.floor`; drop the `- 1` → 29.053.
  - `keyPartsOf`: stop converting digit runs to numbers (`GN-10` sorts before `GN-9`); swap the keyed-before-unkeyed branches → 29.052.
  - `packLane`: `byHull.rows < bySegments.rows` to `<=` (a tie goes to the hull) → 29.051 (its tie leg pins `strategy: 'segments'` on two identical two-segment items). Deleting the hull comparison altogether (always `bySegments`) is EQUIVALENT: with both packings taking items in the same first-start order, every row an item cannot enter holds an earlier-starting item whose hull covers the new item's first day, so the segment packing never needs more rows than the hull packing; record it as equivalent. The hull comparison is kept as PK-2's guard; segment packing is never worse (planner ruling 2026-10-04). `normalise`: `s.start <= last.end` to `<` is an EQUIVALENT mutant (touching segments occupy the same days merged or not); record it.
  - the `footprints(...).length > 1` guard in `packLane` removed (hull always packed): equivalent for the rows, slower; record.

**Prose to sweep:** none found (searched on the ref: `pack`, `packLane`, `footprintOf`, `row packing`, `pack.ts` in `packages/viewport/`, `packages/flow-graph-browser/README.md`, `Features.md`, `test-cases/29-workflow-timeline-graphs.md`; the only hits are `packages/viewport/src/anchored-zoom.ts:40` and `src/driver.ts:2`, which stay true, and the anchors `Features.md:3829` / `test-cases/29-workflow-timeline-graphs.md:50` this task fills).

- [ ] **Step 6: Flip, bullet, gate**
  - Flip ❌ to ✅ on 29.050–29.053. **29.054 goes to 🧪, not ✅**: its test is skipped on the gate (`VP_PERF` unset), so a ✅ would claim a check that does not run. Append the recorded `median N ms (LOCAL, warm, VP_PERF=1, <machine>)` to its line. `pnpm check:citations`.
  - Features section 26: replace `<!-- wtg-part1-viewport-timeline-view T4 bullet -->` with:

```markdown
- ⚙️ **Row packing** (Workflow and Timeline graphs Part 1 T4; cases 29.050–29.054; `packages/viewport/src/pack.ts`) — `packLane` puts each item in the first row where none of its segments shares a day (sorted by first start, natural key, id; adjacent days share a row), so the row count equals the greatest overlap on any day for single-interval items; multi-segment items keep the segment packing, which is never worse than packing their hulls (the hull comparison stays as PK-2's guard; planner ruling 2026-10-04). A bar shorter than its label reserves the label's width (`footprintOf`, with the measure injected), so packing is deterministic and clock-free. 10,000 items pack inside the budget (29.054, `VP_PERF=1`).
```

  - Package suite WHOLE, typecheck, build, gate, land (as T2).


### Task 5: Edge and loop routing (cases 29.065–29.067)

**Branch:** `task/wtg1-route` from `origin/release/workflow-graph` (after T2). Independent of T3 and T4. **NEEDS:** nothing.

**Files:**
- Create: `packages/viewport/src/route.ts`, `packages/viewport/test/route.test.ts`
- Modify: `packages/viewport/src/index.ts`, `test-cases/29-workflow-timeline-graphs.md` (T5 anchor), `Features.md` (T5 bullet anchor)

**Interfaces:**
- **Consumes:** nothing (pure geometry).
- **Produces:** `type Box = {x, y, w, h}`, `type Pt = {x, y}`, `type Orientation = 'landscape' | 'portrait'`, `type Route = {points: Pt[]; label: Pt; crossings: number}`, `type LoopRoute = {d: string; points: [Pt, Pt, Pt, Pt]; label: Pt; crossings: number}`, `GUTTER_PX = 14`, `LOOP_LIFTS_PX = [28, 64, 100]`, `LOOP_ENTRY_INSET_PX = 6`, `routeEdge(from, to, obstacles, orientation = 'landscape'): Route`, `routeLoop(from, to, obstacles = [], orientation = 'landscape'): LoopRoute`.
- **Used by:** Part 3 (the Workflow graph's transitions) and Part 4 (the Timeline graph's `leads_to` edges and loop arrows). Part 1 draws nothing with them.

**Why they live in Part 1.** Spec TG-12 puts the loop's curve in the shared router, while spec section 16.1 gives the loop cases to Part 4. Part 4's bridge consumes `routeLoop`, so Part 1 supplies it with its three lifts and the cases below (29.066, 29.067); Part 4 owns what is DRAWN with it.

**Design notes:**
- `from` and `to` are the two bars' boxes in px; `obstacles` is every other bar on the surface. The router is deterministic: a function of the boxes and the orientation.
- An edge leaves the source bar's END anchor on axis-aligned steps only and enters the target's START anchor with the arrowhead on it (from the left in landscape, from above in portrait). Candidates, in order: a straight line when both anchors share a y, a vertical run in the gutter just before the target (`target.start - 14 px`), a vertical run just after the source, a channel between the two rows (when the target starts before the source ends). The first candidate that crosses no third bar wins; if none is clean the one with the fewest crossings.
- Portrait is the SAME router on transposed boxes (time runs down, so "left" becomes "above"); the answer is transposed back.
- A loop is one cubic Bezier, no corners, no pill. Landscape: it leaves the diamond's TOP anchor going up, rises above both ends and lands on the target's top edge just inside its start. Portrait: it leaves the diamond's LEFT anchor going left. Its two controls sit `lift` px beyond the endpoints; the smallest of 28 / 64 / 100 whose sampled curve crosses no third bar wins. A bar narrower than twice the inset takes the arrowhead in its middle.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part1-viewport-timeline-view T5 -->`, insert (all ❌):

- ❌ **29.065 — same row, target later: a straight line from the end anchor to the start anchor; every step axis-aligned | another row: the vertical run is in the gutter 14 px before the target; the path ends ON the start anchor | a third bar in the way: the router takes the gutter after the source instead; control: with the bar absent the first candidate is used and the two differ | the target starts before the source ends: a channel between the rows, five corners at most | portrait is the same route transposed: time runs down, the arrowhead enters from above.** (`packages/viewport/test/route.test.ts`)
- ❌ **29.066 — a loop is a curved return arrow, with no pill and no corners | landscape: one cubic that leaves the diamond's top anchor going up, rises above both ends, and lands on the target's top edge just inside its start; control: a target on a lower row is entered from above too | portrait: it leaves the diamond's LEFT anchor going left and lands on the target's top edge; control: the landscape curve is not the portrait one | the curve is deterministic, a bar narrower than 12 px takes the arrowhead in its middle, and the same boxes always give the same string.** (`packages/viewport/test/route.test.ts`)
- ❌ **29.067 — the smallest lift that crosses no third bar wins; with nothing in the way the first lift is used; with all three blocked the one with the fewest crossings is reported.** (`packages/viewport/test/route.test.ts`)

- [ ] **Step 2: The tests first (RED)**

`packages/viewport/test/route.test.ts` (new):

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GUTTER_PX, LOOP_LIFTS_PX, routeEdge, routeLoop, type Box } from '../src/index.js';

const bar = (day: number, row: number, days: number, ppd = 16): Box => ({ x: day * ppd, y: row * 40, w: days * ppd, h: 28 });
const axisAligned = (pts: readonly { x: number; y: number }[]) => pts.every((p, i) => i === 0 || p.x === (pts[i - 1] as { x: number }).x || p.y === (pts[i - 1] as { y: number }).y);

describe('29.065 edge routing on packed rows', () => {
  it('29.065 same row, target later: a straight line from the end anchor to the start anchor; every step axis-aligned', () => {
    const r = routeEdge(bar(0, 0, 4), bar(8, 0, 3), []);
    expect(r.points).toEqual([{ x: 64, y: 14 }, { x: 128, y: 14 }]);
    expect(r.crossings).toBe(0);
    // a gap narrower than the 14 px gutter has no gutter candidate: only the straight-line candidate gives two points here
    expect(routeEdge(bar(0, 0, 4), { x: 72, y: 0, w: 48, h: 28 }, []).points).toEqual([{ x: 64, y: 14 }, { x: 72, y: 14 }]);
  });

  it('29.065 another row: the vertical run is in the gutter 14 px before the target; the path ends ON the start anchor', () => {
    const to = bar(8, 2, 3);
    const r = routeEdge(bar(0, 0, 4), to, []);
    expect(GUTTER_PX).toBe(14);
    expect(r.points[0]).toEqual({ x: 64, y: 14 });
    expect(r.points[r.points.length - 1]).toEqual({ x: to.x, y: to.y + 14 });
    expect(r.points).toContainEqual({ x: to.x - 14, y: to.y + 14 });
    expect(axisAligned(r.points)).toBe(true);
    expect(r.crossings).toBe(0);
  });

  it('29.065 a third bar in the way: the router takes the gutter after the source instead; control: with the bar absent the first candidate is used and the two differ', () => {
    const from = bar(0, 0, 4);
    const to = bar(20, 2, 3);
    const blocker = bar(18, 1, 2); // x 288-320 on row 1: stands in the gutter before the target at x = 306
    const clean = routeEdge(from, to, []);
    const around = routeEdge(from, to, [{ x: to.x - 40, y: 40, w: 30, h: 28 }]);
    const forced = routeEdge(from, to, [blocker]);
    // CONTROL: no bar, the first candidate (the gutter 14 px before the target, x = 306)
    expect(clean.points).toEqual([{ x: 64, y: 14 }, { x: 306, y: 14 }, { x: 306, y: 94 }, { x: 320, y: 94 }]);
    expect(clean.points).not.toEqual(around.points);
    // a bar in the gutter before the target: the gutter AFTER the source (x = 64 + 14 = 78), clean
    expect(around.points).toEqual([{ x: 64, y: 14 }, { x: 78, y: 14 }, { x: 78, y: 94 }, { x: 320, y: 94 }]);
    expect(around.crossings).toBe(0);
    expect(forced.points).toEqual(around.points);
    expect(forced.crossings).toBe(0);
    expect(axisAligned(around.points)).toBe(true);
    // a bar that only TOUCHES the first candidate's runs (an edge on x = 306 from either side, an edge on y = 14 from
    // above and from below) is not in the way: the first candidate is kept
    const touching: Box[] = [
      { x: 306, y: 40, w: 10, h: 28 },
      { x: 296, y: 40, w: 10, h: 28 },
      { x: 100, y: 14, w: 20, h: 20 },
      { x: 100, y: -6, w: 20, h: 20 },
    ];
    const grazed = routeEdge(from, to, touching);
    expect(grazed.points).toEqual(clean.points);
    expect(grazed.crossings).toBe(0);
  });

  it('29.065 the target starts before the source ends: a channel between the rows, five corners at most', () => {
    const from = bar(10, 0, 6);
    const to = bar(12, 1, 3);
    const r = routeEdge(from, to, []);
    expect(axisAligned(r.points)).toBe(true);
    expect(r.points.length).toBeLessThanOrEqual(6);
    expect(r.points[0]).toEqual({ x: from.x + from.w, y: 14 });
    expect(r.points[r.points.length - 1]).toEqual({ x: to.x, y: to.y + 14 });
    // the channel runs half-way between the source's bottom (28) and the target's top (40), out past the source end (256 + 14)
    // and back to the gutter before the target (192 - 14)
    expect(r.points).toEqual([{ x: 256, y: 14 }, { x: 270, y: 14 }, { x: 270, y: 34 }, { x: 178, y: 34 }, { x: 178, y: 54 }, { x: 192, y: 54 }]);
  });

  it('29.065 portrait is the same route transposed: time runs down, the arrowhead enters from above', () => {
    const from = bar(0, 0, 4);
    const to = bar(8, 2, 3);
    const land = routeEdge(from, to, []);
    const t = (b: Box): Box => ({ x: b.y, y: b.x, w: b.h, h: b.w });
    const port = routeEdge(t(from), t(to), [], 'portrait');
    expect(port.points).toEqual(land.points.map((p) => ({ x: p.y, y: p.x })));
    expect(port.label).toEqual({ x: land.label.y, y: land.label.x });
    // the last step runs DOWN onto the target's start anchor (its top edge's middle): the arrowhead enters from above
    expect(port.points.slice(-2)).toEqual([{ x: 94, y: 114 }, { x: 94, y: 128 }]);
  });

  it('29.065 the label sits on the longest segment along the time axis', () => {
    const r = routeEdge(bar(0, 0, 4), bar(30, 2, 3), []);
    expect(r.label.y).toBe(14);
    expect(r.label.x).toBeGreaterThan(64);
    expect(r.label.x).toBeLessThan(30 * 16);
    // the path is 64 -> 466 on row 0 (402 px), down, then 466 -> 480 (14 px): the middle of the long run
    expect(r.label).toEqual({ x: 265, y: 14 });
  });
});

describe('29.066 a loop is a curved return arrow, with no pill and no corners', () => {
  const diamond: Box = { x: 400, y: 80, w: 28, h: 28 }; // a Decision on row 2
  const target = bar(2, 0, 6); // the work it sends back to, on row 0, earlier in time

  it('29.066 landscape: one cubic that leaves the diamond\'s top anchor going up, rises above both ends, and lands on the target\'s top edge just inside its start; control: a target on a lower row is entered from above too', () => {
    const r = routeLoop(diamond, target);
    expect(r.points[0]).toEqual({ x: 414, y: 80 }); // top anchor of the diamond
    expect(r.points[3]).toEqual({ x: target.x + 6, y: target.y }); // the target's top edge, 6 px in
    expect(r.points[1].x).toBe(414); // leaves straight up
    expect(r.points[1].y).toBeLessThan(0); // above the higher end (the target's top is y = 0)
    expect(r.points[2].x).toBe(target.x + 6); // lands straight down
    expect(r.d).toBe('M 414 80 C 414 -28, 38 -28, 38 0');
    expect(r.crossings).toBe(0);
    expect(r.label.y).toBeLessThan(0); // the label is at the curve\'s highest point, above both ends
    expect(r.label.y).toBeGreaterThan(-28);
    // CONTROL, same it: a target on a LOWER row than the diamond still arrives from above, and the curve still rises above the higher end (the diamond)
    const lower = routeLoop(diamond, bar(2, 4, 6));
    expect(lower.points[3]).toEqual({ x: 38, y: 160 });
    expect(lower.points[2].x).toBe(38);
    expect(lower.points[2].y).toBeLessThan(80);
    expect(lower.points[1].y).toBeLessThan(80);
  });

  it('29.066 portrait: it leaves the diamond\'s LEFT anchor going left and lands on the target\'s top edge; control: the landscape curve is not the portrait one', () => {
    const d: Box = { x: 100, y: 400, w: 28, h: 28 };
    const t: Box = { x: 0, y: 32, w: 100, h: 96 }; // time runs down: a column
    const r = routeLoop(d, t, [], 'portrait');
    expect(r.points[0]).toEqual({ x: 100, y: 414 });
    expect(r.points[1].y).toBe(414); // leaves horizontally
    expect(r.points[1].x).toBeLessThan(0); // out to the left of both ends
    expect(r.points[3]).toEqual({ x: 6, y: 32 });
    expect(r.points[2].x).toBe(6); // lands vertically
    expect(r.points[2].y).toBeLessThan(32);
    expect(r.label.x).toBeLessThan(6); // the curve\'s left-most point is left of where it lands
    expect(routeLoop(d, t, [], 'landscape').d).not.toBe(r.d);
  });

  it('29.066 the curve is deterministic, a bar narrower than 12 px takes the arrowhead in its middle, and the same boxes always give the same string', () => {
    const slim: Box = { x: 50, y: 0, w: 8, h: 28 };
    expect(routeLoop(diamond, slim).points[3]).toEqual({ x: 54, y: 0 });
    expect(routeLoop(diamond, target).d).toBe(routeLoop({ ...diamond }, { ...target }).d);
    // a function of the boxes alone: fresh copies give the exact string, not merely an equal one
    expect(routeLoop({ ...diamond }, { ...target }).d).toBe('M 414 80 C 414 -28, 38 -28, 38 0');
  });
});

describe('29.067 a loop lifts over a bar that is in its way', () => {
  it('29.067 the smallest lift that crosses no third bar wins; with nothing in the way the first lift is used; with all three blocked the one with the fewest crossings is reported', () => {
    const diamond: Box = { x: 400, y: 80, w: 28, h: 28 };
    const target: Box = { x: 32, y: 0, w: 96, h: 28 };
    expect(LOOP_LIFTS_PX).toEqual([28, 64, 100]);
    const clear = routeLoop(diamond, target, []);
    expect(clear.points[1].y).toBe(-28); // the first lift, as a literal (not read back from the constant)
    expect(clear.crossings).toBe(0);
    // a bar the arc crosses at lift 28 (y about -11 at x = 226) but clears at lift 64 (y about -38 there): the SECOND lift wins
    const low: Box = { x: 200, y: -30, w: 40, h: 25 };
    const second = routeLoop(diamond, target, [low]);
    expect(second.crossings).toBe(0);
    expect(second.points[1].y).toBe(-64);
    // a bar sitting in the arc at the first two lifts (y -40 to -10): only the third lift (y about -65 there) clears it
    const inTheWay: Box = { x: 200, y: -40, w: 40, h: 30 };
    const lifted = routeLoop(diamond, target, [inTheWay]);
    expect(lifted.crossings).toBe(0);
    expect(lifted.points[1].y).toBeLessThan(clear.points[1].y);
    expect(lifted.points[1].y).toBe(-100);
    // blocked at every lift: a wall across the arc; the three tie at one crossing and the first (smallest) is reported
    const wall = [{ x: 200, y: -120, w: 40, h: 118 }];
    const stuck = routeLoop(diamond, target, wall);
    expect(stuck.crossings).toBe(1);
    expect(stuck.points[1].y).toBe(-28);
    // the wall plus the low bar: lift 28 crosses two, lifts 64 and 100 cross one: the fewest, smallest first, is lift 64
    const fewest = routeLoop(diamond, target, [...wall, low]);
    expect(fewest.crossings).toBe(1);
    expect(fewest.points[1].y).toBe(-64);
  });
});
```

**Kills:**
- 29.065 same row, straight line: (a) delete the `if (s.y === t.y && s.x < t.x) candidates.push([s, t]);` arm (the 8 px gap then takes the six-point channel) (b) `s` at `from.x` instead of `from.x + from.w` (c) `t.y` as `to.y` instead of `to.y + to.h / 2`.
- 29.065 another row, the gutter before the target: (a) `GUTTER_PX = 14` to `12` (b) swap the `vx` and `ux` candidate pushes (the gutter after the source first) (c) `const vx = t.x - GUTTER_PX` to `t.x + GUTTER_PX`.
- 29.065 a third bar in the way: (a) `crossings()` returning `0` (the obstacle ignored: `around`/`forced` keep the first candidate) (b) swap the `vx` and `ux` candidate pushes (`clean` takes x = 78) (c) `a.x > box.x` to `a.x >= box.x` (or any one of the four position comparisons `a.x > box.x`, `a.x < box.x + box.w`, `a.y > box.y`, `a.y < box.y + box.h` loosened to `>=` / `<=`: `grazed` leaves the first candidate).
- 29.065 the channel: (a) `cy` as `from.y + from.h` (the channel on the source's bottom edge, y = 28) (b) `ux = s.x + GUTTER_PX` to `s.x` in the channel (c) drop the channel push (the target starting before the source end then has no candidate: `candidates[0]` is undefined).
- 29.065 portrait: (a) skip `transposePt` on the way back (`points: r.points`) (b) `label: r.label` untransposed (c) the portrait branch calls `routeLandscape(from, to, obstacles)` on the untransposed boxes.
- 29.065 the label: (a) `a.y === b.y` to `a.x === b.x` (the label on the longest vertical run) (b) `label = { x: a.x, y: a.y }` instead of the middle (c) drop the `Math.abs(b.x - a.x) > longest` test (the label on the LAST horizontal run, y = 94).
- 29.066 landscape: (a) `LOOP_ENTRY_INSET_PX = 6` to `10` (b) `Math.min(s.y, e.y)` to `e.y` in `c1`/`c2` (the lower-row control lands its controls at y = 132) (c) `label` left at `s` (no highest-point scan: `label.y` = 80).
- 29.066 portrait: (a) the portrait start anchor `from.x` to `from.x + from.w / 2` (b) portrait `c1.x` as `Math.max(s.x, e.x) - lift` (72, not left of both ends) (c) ignore `orientation` in `routeLoop` (the landscape string comes back).
- 29.066 deterministic, slim bar: (a) `Math.min(LOOP_ENTRY_INSET_PX, to.w / 2)` to `LOOP_ENTRY_INSET_PX` (lands at 56) (b) `to.w / 2` to `to.w` (c) `round2` dropped from the `d` template in favour of `toFixed(1)` (the literal string changes).
- 29.067 lifts: (a) `LOOP_LIFTS_PX = [28, 64, 100]` to `[28, 28, 28]` (b) `[28, 64, 100]` to `[28, 100, 64]` or `[28, 100]` (the low bar's answer is no longer -64) (c) `n < best.crossings` to `n <= best.crossings` (the wall reports lift 100, the fewest case lift 100) (d) count crossings as one boolean (`n = obstacles.some(...) ? 1 : 0`: the fewest case reports lift 28).

  Run: `slot-run.sh vp -- pnpm --filter @gisik-nokma/viewport exec vitest run test/route.test.ts --maxWorkers=2 > /tmp/vp.log 2>&1; tail -n 20 /tmp/vp.log`. Expected: FAIL (module missing).

- [ ] **Step 3: The router**

`packages/viewport/src/route.ts` (new):

```ts
/**
 * Edge routing on packed rows (spec TG-5). PURE and deterministic.
 *
 * An arrow leaves the source bar's END anchor, runs on axis-aligned segments only, and enters the target bar's START
 * anchor with the arrowhead on the anchor: from the left in landscape, from above in portrait. It takes a vertical
 * run in the gutter just before the target (`target.start - 14 px`), or just after the source end, or, when the target
 * starts before the source ends, a horizontal channel between the two rows. Of those candidates (in that order) the
 * first that crosses no third bar wins; if none is clean, the one with the fewest crossings.
 *
 * Portrait is the same router on transposed boxes: time runs down, so "left" becomes "above".
 * Loops (TG-12) are curves, not corners: `routeLoop` below.
 */
export type Box = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };
export type Orientation = 'landscape' | 'portrait';
export type Route = {
  /** From the source's end anchor to the target's start anchor, every step axis-aligned. */
  points: Pt[];
  /** Where the label pill sits: the middle of the longest segment along the time axis. */
  label: Pt;
  /** Third bars the chosen path still crosses (0 when a clean candidate existed). */
  crossings: number;
};

export const GUTTER_PX = 14;

const transposeBox = (b: Box): Box => ({ x: b.y, y: b.x, w: b.h, h: b.w });
const transposePt = (p: Pt): Pt => ({ x: p.y, y: p.x });

function segmentCrossesBox(a: Pt, b: Pt, box: Box): boolean {
  if (a.y === b.y) {
    return a.y > box.y && a.y < box.y + box.h && Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.w;
  }
  return a.x > box.x && a.x < box.x + box.w && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.h;
}

function crossings(points: readonly Pt[], obstacles: readonly Box[]): number {
  let n = 0;
  for (const box of obstacles) {
    for (let i = 1; i < points.length; i += 1) {
      if (segmentCrossesBox(points[i - 1] as Pt, points[i] as Pt, box)) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

/** Drops zero-length steps and collinear middle points, so the path is the minimum number of corners. */
function simplify(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last !== undefined && last.x === p.x && last.y === p.y) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i -= 1) {
    const a = out[i - 1] as Pt;
    const b = out[i] as Pt;
    const c = out[i + 1] as Pt;
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1);
  }
  return out;
}

function routeLandscape(from: Box, to: Box, obstacles: readonly Box[]): Route {
  const s: Pt = { x: from.x + from.w, y: from.y + from.h / 2 };
  const t: Pt = { x: to.x, y: to.y + to.h / 2 };
  const vx = t.x - GUTTER_PX;
  const ux = s.x + GUTTER_PX;
  const below = t.y >= s.y;
  const cy = below ? (from.y + from.h + Math.max(to.y, from.y + from.h)) / 2 : (to.y + to.h + Math.min(from.y, to.y + to.h)) / 2;
  const candidates: Pt[][] = [];
  if (s.y === t.y && s.x < t.x) candidates.push([s, t]);
  if (vx > s.x) candidates.push([s, { x: vx, y: s.y }, { x: vx, y: t.y }, t]);
  if (ux < t.x) candidates.push([s, { x: ux, y: s.y }, { x: ux, y: t.y }, t]);
  candidates.push([s, { x: ux, y: s.y }, { x: ux, y: cy }, { x: vx, y: cy }, { x: vx, y: t.y }, t]);
  let best: Pt[] = candidates[0] as Pt[];
  let bestCrossings = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const n = crossings(c, obstacles);
    if (n < bestCrossings) {
      best = c;
      bestCrossings = n;
      if (n === 0) break;
    }
  }
  const points = simplify(best);
  let longest = -1;
  let label: Pt = points[0] as Pt;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    if (a.y === b.y && Math.abs(b.x - a.x) > longest) {
      longest = Math.abs(b.x - a.x);
      label = { x: (a.x + b.x) / 2, y: a.y };
    }
  }
  return { points, label, crossings: bestCrossings };
}

/**
 * `from` and `to` are the two bars' boxes in px; `obstacles` are every other bar on the surface. `orientation` is the
 * surface's: landscape runs time left to right, portrait top to bottom.
 */
export function routeEdge(from: Box, to: Box, obstacles: readonly Box[], orientation: Orientation = 'landscape'): Route {
  if (orientation === 'landscape') return routeLandscape(from, to, obstacles);
  const r = routeLandscape(transposeBox(from), transposeBox(to), obstacles.map(transposeBox));
  return { points: r.points.map(transposePt), label: transposePt(r.label), crossings: r.crossings };
}

// ---- loops (TG-12) ----

/** A loop's smallest lift above the higher end, and the three lifts tried in turn when a bar is in the way. */
export const LOOP_LIFTS_PX = [28, 64, 100] as const;
/** How far inside the target bar's start the arrowhead lands, at most (a bar narrower than twice this lands in its middle). */
export const LOOP_ENTRY_INSET_PX = 6;

export type LoopRoute = {
  /** One cubic: `M x y C x y, x y, x y`, from the source's anchor to the arrowhead on the target. */
  d: string;
  /** The four points of the cubic: start, two controls, end. */
  points: [Pt, Pt, Pt, Pt];
  /** Where the label sits: the highest point of the curve (the left-most in portrait), on a chip of the canvas colour. */
  label: Pt;
  /** Third bars the chosen curve still crosses (0 when a lift was clean). */
  crossings: number;
};

const bezierAt = (p: readonly [Pt, Pt, Pt, Pt], t: number): Pt => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return { x: a * p[0].x + b * p[1].x + c * p[2].x + e * p[3].x, y: a * p[0].y + b * p[1].y + c * p[2].y + e * p[3].y };
};

const LOOP_SAMPLES = 48;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * A loop is a curved return arrow from a Decision to the bar its outcome sends the work back to (TG-12). No pill, no corners.
 * Landscape: it leaves the diamond's TOP anchor going up, arcs over everything between, and comes down onto the target's top
 * edge just inside its start with the arrowhead (so it arrives "from above"). Portrait (time runs down): it leaves the
 * diamond's LEFT anchor going left and comes down onto the target's top edge. The curve is one cubic whose two controls sit
 * `lift` px beyond the endpoints; the smallest of `LOOP_LIFTS_PX` whose sampled curve crosses no third bar wins, otherwise the
 * one with the fewest crossings. Deterministic: the result is a function of the boxes alone.
 */
export function routeLoop(from: Box, to: Box, obstacles: readonly Box[] = [], orientation: Orientation = 'landscape'): LoopRoute {
  const portrait = orientation === 'portrait';
  const s: Pt = portrait ? { x: from.x, y: from.y + from.h / 2 } : { x: from.x + from.w / 2, y: from.y };
  const e: Pt = { x: to.x + Math.min(LOOP_ENTRY_INSET_PX, to.w / 2), y: to.y };
  let best: LoopRoute | null = null;
  for (const lift of LOOP_LIFTS_PX) {
    const c1: Pt = portrait ? { x: Math.min(s.x, e.x) - lift, y: s.y } : { x: s.x, y: Math.min(s.y, e.y) - lift };
    const c2: Pt = portrait ? { x: e.x, y: e.y - lift } : { x: e.x, y: Math.min(s.y, e.y) - lift };
    const points: [Pt, Pt, Pt, Pt] = [s, c1, c2, e];
    let label = s;
    const sampled: Pt[] = [];
    for (let i = 0; i <= LOOP_SAMPLES; i += 1) {
      const p = bezierAt(points, i / LOOP_SAMPLES);
      sampled.push(p);
      if (portrait ? p.x < label.x : p.y < label.y) label = p;
    }
    let n = 0;
    for (const box of obstacles) {
      if (sampled.some((p) => p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h)) n += 1;
    }
    const d = `M ${round2(s.x)} ${round2(s.y)} C ${round2(c1.x)} ${round2(c1.y)}, ${round2(c2.x)} ${round2(c2.y)}, ${round2(e.x)} ${round2(e.y)}`;
    if (best === null || n < best.crossings) best = { d, points, label: { x: round2(label.x), y: round2(label.y) }, crossings: n };
    if (n === 0) break;
  }
  return best as LoopRoute;
}
```

- [ ] **Step 4: Export it and run**

`packages/viewport/src/index.ts` (exists on the ref with T1/T2's seven lines): add only this task's own export line (planner ruling 2026-10-04, as for T3 and T4); on a merge, take the union of the `export *` lines:

```ts
export * from './route.js';
```

  Run the package suite (with T3 and T4 on the base, 42 tests pass and 1 is skipped: counted at `457f3caa`, the base holds 13 viewport tests, T3 adds 12, T4 adds 9 with 29.054 skipped, T5 adds 9; on the bare base T5 gives 22; re-count on the tip), typecheck and build.

- [ ] **Step 5: Mutation pass (own)**
  - `GUTTER_PX = 14` to `12` → 29.065 (the 14 px gutter). Reorder the candidates (the gutter before the source first) → 29.065 (third bar in the way / control).
  - `segmentCrossesBox`: `>` to `>=` on one side (a segment along a bar's edge counts as crossing) → 29.065.
  - `simplify`: delete the collinear-middle removal → the "five corners at most" and the straight-line cases.
  - Portrait: skip `transposePt` on the way back → the portrait case.
  - `LOOP_LIFTS_PX = [28, 64, 100]` to `[28, 28, 28]` → 29.067; `LOOP_ENTRY_INSET_PX = 6` to `10` → 29.066; the portrait start anchor `from.x` to `from.x + from.w / 2` → 29.066 portrait.
  - `routeLoop`'s `if (n === 0) break;` removed: EQUIVALENT (a later lift can never beat 0 crossings, and `n < best.crossings` is strict); record it.
  - `label` as the first sampled point instead of the highest → 29.066.

**Prose to sweep:** none found (searched on `origin/release/workflow-graph`: `routeEdge`, `routeLoop`, `route.ts`, `LOOP_LIFTS`, `GUTTER_PX`, `edge routing`, `loop routing` in `Features.md`, `test-cases/`, `packages/viewport/`, `packages/flow-graph-browser/`, `docs/*.md`; the only hits are the T5 anchors `Features.md:3830` and `test-cases/29-workflow-timeline-graphs.md:51`, which this task's own Step 1 and Step 6 replace, and `packages/viewport/src/index.ts:1-7` carries no comment).

- [ ] **Step 6: Flip, bullet, gate**
  - Flip ❌ to ✅ on 29.065–29.067; `pnpm check:citations`.
  - Features section 26: replace `<!-- wtg-part1-viewport-timeline-view T5 bullet -->` with:

```markdown
- ⚙️ **Edge and loop routing** (Workflow and Timeline graphs Part 1 T5; cases 29.065–29.067; `packages/viewport/src/route.ts`) — `routeEdge` draws an axis-aligned connector between packed bars (a straight line on one row, a vertical run in the 14 px gutter before the target, the gutter after the source when a third bar is in the way, a channel between the rows when the target starts before the source ends; portrait is the same route transposed) and puts its label on the longest segment along the time axis; `routeLoop` draws a loop as one curved return arrow (28 / 64 / 100 px lifts, the smallest that crosses no third bar), with no pill and no corners. Both are pure and deterministic; Part 4 draws them.
```

  - Package suite WHOLE, typecheck, build, gate, land.


### Task 6: `ScrollAdapter`: smooth movement on a native scroller (cases 29.030–29.036, 29.039)

**Branch:** `task/wtg1-scroll` from `origin/release/workflow-graph` (after T2). **NEEDS:** nothing (jsdom tests with a fake clock; the real-browser proof is T10).

**Files:**
- Create: `packages/viewport/src/dom/clock.ts`, `packages/viewport/src/dom/scroll-adapter.ts`, `packages/viewport/test/fake-clock.ts`, `packages/viewport/test/scroll-adapter.test.ts`
- Modify: `packages/viewport/src/index.ts` (add `./dom/clock.js` and `./dom/scroll-adapter.js`), `test-cases/29-workflow-timeline-graphs.md` (T6 anchor), `Features.md` (T6 bullet anchor)

**Interfaces:**
- **Consumes (T2):** `clampPpd`, `dayAt`, `MAX_PPD`, `stepLinear`, `stepGeometric`, `tauFor`, `momentumStep`, `releaseVelocity`, `rubberOvershoot`, `SPRING_BACK_MS`, `wheelZoomFactor`, and the types `Frame`, `AnimateTarget`, `AnimateOptions`, `ViewportDriver`.
- **Produces:**
  - `type Clock = {now(): number; raf(cb): number; caf(handle): void}`, `browserClock`, `prefersReducedMotion(): boolean`, `createFrameLoop(clock, tick): {start, stop, running}`. These are the ONLY places in the package that name `performance`, `requestAnimationFrame` or `matchMedia`.
  - `class ScrollAdapter implements ViewportDriver`, constructed with `{element, axis?: 'x' | 'y', firstDay, scale, extentDays: () => number, todayDay?: () => number, scaleVar?: string = '--tl-ppd', reducedMotion?: () => boolean, clock?: Clock}`. Methods: `offset()`, `scale()`, `visibleRange()`, `viewportDays()`, `maxScale()`, `animateTo(target, options?)`, `onFrame(cb): unsubscribe`, `rebase(newFirstDay)`, `scrollByPx(px)`, `destroy()`. Side channels on the element: the `--tl-ppd` custom property, the `--tl-overshoot` custom property (the rubber band, in px), the `gn-dragging` class during a mouse drag.
  - `MAX_SCROLL_PX = 16_000_000`.
  - Test helpers `fakeClock(frameMs = 16)`, `sizeOf(el, {...})`, `pointer(type, init)`, `wheel(init)` (T7 reuses them).
- **Used by:** T9 (`TimelineView` owns one), T10 (the real-browser proof), Part 4 (Home's Timeline).

**Design notes (these are the traps; each has a case):**
- **The platform keeps its own scrolling** (spec VP-2): a horizontal swipe, a trackpad, Shift + wheel, the vertical wheel, touch and its momentum, the scrollbar. The adapter takes over ONLY Ctrl + wheel (and the trackpad pinch that arrives as Ctrl + wheel), the keys, and a MOUSE drag on empty canvas. A drag begun on a button, a link, an input or an element with `data-no-pan` does nothing; a touch pointer does nothing.
- **Px per day lives in one CSS custom property** (`--tl-ppd`), multiplied into every bar's `left` and `width` by the stylesheet (T9), so a zoom frame is one property write and one scroll write: no React render and no per-bar work.
- **Rounded scroll positions** (Review Focus 1). A browser at device pixel ratio 1 rounds `scrollLeft` to a whole pixel. Reading it back between wheel events feeds the rounding into the next event and the anchor random-walks past 0.5 px. The adapter remembers the exact position it asked for (`exact`) and the value the DOM held right after the write (`written`); while the DOM still shows `written`, nobody else scrolled and `exact` is the truth; any other value (a touch pan, the scrollbar) wins.
- **A glide past the end** (Review Focus 2). The platform clamps the write, so a naive spring chases the target forever and no resting frame is ever emitted. `stepGlide` aims at the nearest day the scroller can show (`firstDay` to `firstDay + maxPos / ppd`).
- **A glide takes at most 450 ms** whatever the distance (`tauFor`), and a zoom glide eases geometrically about the viewport centre unless an anchor is given.
- **Frames:** the loop runs while something moves (a glide, momentum, a spring-back, a drag, or a native scroll within 100 ms) and emits ONE last frame with `moving: false`. The velocity is smoothed (0.8 / 0.2) and is in DAYS per second; it is 0 at rest.
- **A drag that panned must not also click** the bar it ended on (the click is swallowed once). Past either end the offset rubber-bands through `--tl-overshoot` and springs back inside 160 ms; releasing a rested pointer leaves no momentum.
- **Zoom cap:** a browser stops honouring a scroll position past about 16 M px, so `maxScale()` lowers the cap to `16,000,000 / extentDays` (400,000 days allow 40 px/day).
- **Reduced motion** (`reducedMotion()`, default the media query) lands every animation in the same call.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part1-viewport-timeline-view T6 -->`, insert (all ❌):

- ❌ **29.030 — offset = firstDay + scroll / ppd; visibleRange spans the viewport inclusive; scale writes --tl-ppd; control: a scroll of 240 px at 24 px/day is 10 days.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.031 — the day under the pointer keeps its x within 0.5 px over a 60-event sweep, the event is cancelled, and --tl-ppd follows; control: centre zoom would move it | on a platform that rounds scroll positions to whole pixels the anchor still holds within 0.5 px of the ideal on every event; control: re-reading the rounded position each event (the naive loop) drifts past 0.5 px on the same sweep | a plain vertical wheel, a horizontal swipe and Shift + wheel are left to the platform: not cancelled, no zoom | the zoom is capped by the browser scroll size: 400,000 days allow 40 px/day, not 96.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.032 — animateTo reaches the target and settles; the first frame is partial (never a jump); one last frame reports moving: false | a 1,000,000 px glide still lands inside 450 ms (+1 frame); control: reduced motion lands in the same call, with no frames pending | zoom glides geometrically about the viewport centre, and the centre day does not move.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.033 — Left / Right glide 7 days, with Shift 28, PageDown 90% of a viewport, Home centres today, + and - zoom 1.25x; each is cancelled so the page does not also scroll | two quick presses add up (the second starts from the first target); a key with Ctrl, or typed into an input, is left alone.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.034 — dragging 100 px right scrolls 100 px left; releasing at speed keeps going and stops below 2 px/s; the click that ends the drag is swallowed; control: a drag begun on a bar, or by touch, does nothing.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.035 — pulling past the first day shows a resisted overshoot (less than the pull), and 160 ms after release it is back at 0; control: inside the limits there is none.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.036 — a native scroll produces frames with the smoothed velocity in days per second, and a final frame once it is quiet; rebase keeps the day at the edge | destroy removes every listener and stops the loop; control: before destroy the same wheel zoomed.** (`packages/viewport/test/scroll-adapter.test.ts`)
- ❌ **29.039 — a glide aimed past the scrollable end stops at the end and settles: a last frame reports moving: false and the loop goes idle; control: a target inside the extent lands exactly on it.** (`packages/viewport/test/scroll-adapter.test.ts`)

- [ ] **Step 2: The helpers and the tests first (RED)**

`packages/viewport/test/fake-clock.ts` (new):

```ts
import type { Clock } from '../src/index.js';

/** A clock the test drives by hand: `advance(ms)` runs animation frames of `frameMs`. */
export function fakeClock(frameMs = 16) {
  let t = 1000;
  let next = 1;
  const queue = new Map<number, () => void>();
  const clock: Clock = {
    now: () => t,
    raf: (cb) => {
      const id = next++;
      queue.set(id, cb);
      return id;
    },
    caf: (id) => void queue.delete(id),
  };
  return {
    clock,
    now: () => t,
    pending: () => queue.size,
    advance(ms: number) {
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + frameMs);
        const due = [...queue];
        queue.clear();
        for (const [, cb] of due) cb();
      }
    },
  };
}

/** jsdom lays nothing out, so the test says how big the container is. */
export function sizeOf(el: HTMLElement, o: { clientWidth: number; scrollWidth: number; clientHeight?: number; scrollHeight?: number }) {
  for (const [k, v] of Object.entries(o)) Object.defineProperty(el, k, { configurable: true, value: v });
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: o.clientWidth, bottom: o.clientHeight ?? 400, width: o.clientWidth, height: o.clientHeight ?? 400, x: 0, y: 0, toJSON: () => ({}) });
}

export function pointer(type: string, init: { x: number; y: number; id?: number; kind?: string; button?: number }): Event {
  const e = new MouseEvent(type, { clientX: init.x, clientY: init.y, button: init.button ?? 0, bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: init.id ?? 1, pointerType: init.kind ?? 'mouse' });
  return e;
}

export function wheel(init: { x?: number; y?: number; dx?: number; dy: number; ctrl?: boolean; mode?: number }): WheelEvent {
  return new WheelEvent('wheel', { clientX: init.x ?? 0, clientY: init.y ?? 0, deltaX: init.dx ?? 0, deltaY: init.dy, deltaMode: init.mode ?? 0, ctrlKey: init.ctrl ?? false, bubbles: true, cancelable: true });
}
```

`packages/viewport/test/scroll-adapter.test.ts` (new):

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ScrollAdapter, dayAt, type Frame } from '../src/index.js';
import { fakeClock, pointer, sizeOf, wheel } from './fake-clock.js';

const FIRST = 20_000; // the surface starts on this day

function mount(opts: { ppd?: number; extentDays?: number; reduced?: boolean; width?: number } = {}) {
  const el = document.createElement('div');
  el.innerHTML = '<div class="surface"><button data-bar>bar</button></div>';
  document.body.append(el);
  const ppd = opts.ppd ?? 24;
  const extentDays = opts.extentDays ?? 400;
  sizeOf(el, { clientWidth: opts.width ?? 1000, scrollWidth: extentDays * ppd });
  const fc = fakeClock();
  const frames: Frame[] = [];
  const todayDay = FIRST + 200;
  const adapter = new ScrollAdapter({ element: el, firstDay: FIRST, scale: ppd, extentDays: () => extentDays, todayDay: () => todayDay, reducedMotion: () => opts.reduced ?? false, clock: fc.clock });
  adapter.onFrame((f) => frames.push(f));
  // the surface is `extentDays * ppd` wide, so a zoom changes what the container can scroll
  const resize = () => sizeOf(el, { clientWidth: opts.width ?? 1000, scrollWidth: extentDays * adapter.scale() });
  return { el, adapter, fc, frames, resize, todayDay };
}

afterEach(() => void (document.body.innerHTML = ''));

describe('29.030 the driver reads the scroll position as a day', () => {
  it('29.030 offset = firstDay + scroll / ppd; visibleRange spans the viewport inclusive; scale writes --tl-ppd; control: a scroll of 240 px at 24 px/day is 10 days', () => {
    const { el, adapter } = mount();
    expect(adapter.offset()).toBe(FIRST);
    expect(el.style.getPropertyValue('--tl-ppd')).toBe('24');
    el.scrollLeft = 240;
    expect(adapter.offset()).toBe(FIRST + 10);
    expect(adapter.visibleRange()).toEqual({ start: FIRST + 10, end: FIRST + 10 + Math.ceil(1000 / 24) - 1 });
    expect(adapter.viewportDays()).toBeCloseTo(41.67, 1);
  });
});

describe('29.031 Ctrl + wheel zooms about the pointer, nothing else is taken', () => {
  it('29.031 the day under the pointer keeps its x within 0.5 px over a 60-event sweep, the event is cancelled, and --tl-ppd follows; control: centre zoom would move it', () => {
    const { el, adapter, resize } = mount();
    el.scrollLeft = 2400;
    const anchorPx = 300;
    const day = dayAt({ offsetDay: adapter.offset(), ppd: adapter.scale() }, anchorPx);
    let worst = 0;
    for (let i = 0; i < 60; i += 1) {
      const e = wheel({ x: anchorPx, dy: i < 40 ? 6 : -9, ctrl: true });
      resize();
      el.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      worst = Math.max(worst, Math.abs((day - adapter.offset()) * adapter.scale() - anchorPx));
    }
    expect(worst).toBeLessThan(0.5);
    expect(adapter.scale()).not.toBe(24);
    expect(el.style.getPropertyValue('--tl-ppd')).toBe(String(adapter.scale()));
    const centred = dayAt({ offsetDay: adapter.offset(), ppd: adapter.scale() }, 500);
    expect(Math.abs((day - adapter.offset()) * adapter.scale() - 500)).toBeGreaterThan(0.5); // the pointer's day is not at the centre
    expect(centred).not.toBe(day);
  });

  it('29.031 on a platform that rounds scroll positions to whole pixels the anchor still holds within 0.5 px of the ideal on every event; control: re-reading the rounded position each event (the naive loop) drifts past 0.5 px on the same sweep', () => {
    const { el, adapter, resize } = mount();
    // Chromium at device-pixel-ratio 1: the stored scroll position is a whole number.
    let stored = 0;
    Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => stored, set: (v: number) => void (stored = Math.round(v)) });
    el.scrollLeft = 2400;
    const anchorPx = 300;
    const ideal = dayAt({ offsetDay: adapter.offset(), ppd: adapter.scale() }, anchorPx);
    const sweep = (i: number) => (i < 40 ? 6 : -9);
    let worst = 0;
    for (let i = 0; i < 60; i += 1) {
      resize();
      el.dispatchEvent(wheel({ x: anchorPx, dy: sweep(i), ctrl: true }));
      const screenX = (ideal - FIRST) * adapter.scale() - stored;
      worst = Math.max(worst, Math.abs(screenX - anchorPx));
    }
    expect(worst).toBeLessThanOrEqual(0.5 + 1e-9);
    // the naive loop: derive the anchor day from the rounded position every event
    let ppd = 24;
    let pos = 2400;
    let naiveWorst = 0;
    for (let i = 0; i < 60; i += 1) {
      const day = (pos + anchorPx) / ppd;
      ppd = Math.min(96, Math.max(4, ppd * Math.exp(-sweep(i) * 0.012)));
      pos = Math.round(day * ppd - anchorPx);
      naiveWorst = Math.max(naiveWorst, Math.abs((ideal - FIRST) * ppd - pos - anchorPx));
    }
    expect(naiveWorst).toBeGreaterThan(0.5);
  });

  it('29.031 a plain vertical wheel, a horizontal swipe and Shift + wheel are left to the platform: not cancelled, no zoom', () => {
    const { el, adapter } = mount();
    for (const e of [wheel({ dy: 80 }), wheel({ dx: 60, dy: 2 }), new WheelEvent('wheel', { deltaY: 40, shiftKey: true, bubbles: true, cancelable: true })]) {
      el.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    }
    expect(adapter.scale()).toBe(24);
  });

  it('29.031 the zoom is capped by the browser scroll size: 400,000 days allow 40 px/day, not 96', () => {
    const { adapter } = mount({ extentDays: 400_000 });
    expect(adapter.maxScale()).toBe(40);
    expect(new ScrollAdapter({ element: document.createElement('div'), firstDay: 0, scale: 96, extentDays: () => 400_000 }).scale()).toBe(40);
  });
});

describe('29.032 glides', () => {
  it('29.032 animateTo reaches the target and settles; the first frame is partial (never a jump); one last frame reports moving: false', () => {
    const { el, adapter, fc, frames } = mount();
    adapter.animateTo({ offset: FIRST + 100 });
    fc.advance(16);
    expect(adapter.offset()).toBeGreaterThan(FIRST);
    expect(adapter.offset()).toBeLessThan(FIRST + 50);
    fc.advance(600);
    expect(adapter.offset()).toBeCloseTo(FIRST + 100, 1);
    expect(frames[frames.length - 1]).toMatchObject({ moving: false, velocity: 0 });
    expect(frames.some((f) => f.moving && f.velocity > 0)).toBe(true);
    expect(el.scrollLeft).toBeCloseTo(100 * 24, 0);
  });

  it('29.032 a 1,000,000 px glide still lands inside 450 ms (+1 frame); control: reduced motion lands in the same call, with no frames pending', () => {
    const { adapter, fc } = mount({ extentDays: 100_000 });
    adapter.animateTo({ offset: FIRST + 40_000 });
    fc.advance(450 + 16);
    expect(adapter.offset()).toBeCloseTo(FIRST + 40_000, 0);
    const r = mount({ reduced: true });
    r.adapter.animateTo({ offset: FIRST + 100 });
    expect(r.adapter.offset()).toBe(FIRST + 100);
  });

  it('29.039 a glide aimed past the scrollable end stops at the end and settles: a last frame reports moving: false and the loop goes idle; control: a target inside the extent lands exactly on it', () => {
    const { el, adapter, fc, frames } = mount();
    // a real scroller clamps scrollLeft to [0, scrollWidth - clientWidth]; jsdom does not, so say so
    let stored = 0;
    Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => stored, set: (v: number) => void (stored = Math.min(8600, Math.max(0, v))) });
    adapter.animateTo({ offset: FIRST + 390 }); // the last scrollable day is FIRST + 8600 / 24, about 358.3
    fc.advance(1500);
    expect(stored).toBeCloseTo(8600, 0);
    expect(frames[frames.length - 1]).toMatchObject({ moving: false });
    expect(fc.pending()).toBe(0);
    const inside = mount();
    let held = 0;
    Object.defineProperty(inside.el, 'scrollLeft', { configurable: true, get: () => held, set: (v: number) => void (held = Math.min(8600, Math.max(0, v))) });
    inside.adapter.animateTo({ offset: FIRST + 300 });
    inside.fc.advance(1500);
    expect(inside.adapter.offset()).toBeCloseTo(FIRST + 300, 1);
    expect(inside.frames[inside.frames.length - 1]).toMatchObject({ moving: false });
    expect(inside.fc.pending()).toBe(0);
  });

  it('29.032 zoom glides geometrically about the viewport centre, and the centre day does not move', () => {
    const { el, adapter, fc, resize } = mount();
    el.scrollLeft = 2400;
    const centreDay = dayAt({ offsetDay: adapter.offset(), ppd: adapter.scale() }, 500);
    adapter.animateTo({ scale: 8 });
    for (let i = 0; i < 40; i += 1) {
      resize();
      fc.advance(16);
      expect(Math.abs((centreDay - adapter.offset()) * adapter.scale() - 500)).toBeLessThan(0.5);
    }
    expect(adapter.scale()).toBeCloseTo(8, 2);
  });
});

describe('29.033 keys', () => {
  const press = (el: HTMLElement, key: string, shiftKey = false) => {
    const e = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };

  it('29.033 Left / Right glide 7 days, with Shift 28, PageDown 90% of a viewport, Home centres today, + and - zoom 1.25x; each is cancelled so the page does not also scroll', () => {
    const { el, adapter, fc, todayDay } = mount();
    el.scrollLeft = 24 * 100;
    const start = adapter.offset();
    expect(press(el, 'ArrowRight').defaultPrevented).toBe(true);
    fc.advance(700);
    expect(adapter.offset()).toBeCloseTo(start + 7, 1);
    press(el, 'ArrowLeft', true);
    fc.advance(700);
    expect(adapter.offset()).toBeCloseTo(start + 7 - 28, 1);
    const before = adapter.offset();
    press(el, 'PageDown');
    fc.advance(700);
    expect(adapter.offset() - before).toBeCloseTo(Math.round(adapter.viewportDays() * 0.9), 1);
    press(el, 'Home');
    fc.advance(700);
    expect(adapter.offset() + adapter.viewportDays() / 2).toBeCloseTo(todayDay + 0.5, 1);
    press(el, 'T');
    press(el, '+');
    fc.advance(700);
    expect(adapter.scale()).toBeCloseTo(24 * 1.25, 2);
    press(el, '-');
    fc.advance(700);
    expect(adapter.scale()).toBeCloseTo(24, 2);
  });

  it('29.033 two quick presses add up (the second starts from the first target); a key with Ctrl, or typed into an input, is left alone', () => {
    const { el, adapter, fc } = mount();
    el.scrollLeft = 24 * 100;
    const start = adapter.offset();
    press(el, 'ArrowRight');
    fc.advance(32);
    press(el, 'ArrowRight');
    fc.advance(900);
    expect(adapter.offset()).toBeCloseTo(start + 14, 1);
    const ctrl = new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true });
    el.dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(false);
    const input = document.createElement('input');
    el.append(input);
    const typed = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    input.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false);
  });
});

describe('29.034 a mouse drag pans, with momentum', () => {
  it('29.034 dragging 100 px right scrolls 100 px left; releasing at speed keeps going and stops below 2 px/s; the click that ends the drag is swallowed; control: a drag begun on a bar, or by touch, does nothing', () => {
    const { el, adapter, fc } = mount();
    el.scrollLeft = 2000;
    let clicks = 0;
    el.addEventListener('click', () => (clicks += 1));
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 50 }));
    expect(el.classList.contains('gn-dragging')).toBe(true);
    for (let i = 1; i <= 6; i += 1) {
      fc.advance(16);
      el.dispatchEvent(pointer('pointermove', { x: 500 + i * 20, y: 50 }));
    }
    expect(el.scrollLeft).toBeCloseTo(2000 - 120, 5);
    el.dispatchEvent(pointer('pointerup', { x: 620, y: 50 }));
    expect(el.classList.contains('gn-dragging')).toBe(false);
    const released = el.scrollLeft;
    fc.advance(160);
    expect(el.scrollLeft).toBeLessThan(released - 30);
    fc.advance(4000);
    const rest = el.scrollLeft;
    fc.advance(500);
    expect(el.scrollLeft).toBe(rest);
    el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(clicks).toBe(0); // swallowed
    el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(clicks).toBe(1); // only the one
    // controls
    const at = el.scrollLeft;
    el.querySelector('button')?.dispatchEvent(pointer('pointerdown', { x: 500, y: 50 }));
    el.dispatchEvent(pointer('pointermove', { x: 600, y: 50 }));
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 50, id: 9, kind: 'touch' }));
    el.dispatchEvent(pointer('pointermove', { x: 700, y: 50, id: 9, kind: 'touch' }));
    expect(el.scrollLeft).toBe(at);
    expect(adapter.offset()).toBeGreaterThan(FIRST);
  });

  it('29.034 a pointer that rested 300 ms before release has no momentum', () => {
    const { el, fc } = mount();
    el.scrollLeft = 2000;
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 50 }));
    fc.advance(16);
    el.dispatchEvent(pointer('pointermove', { x: 560, y: 50 }));
    fc.advance(300);
    el.dispatchEvent(pointer('pointerup', { x: 560, y: 50 }));
    const rest = el.scrollLeft;
    fc.advance(500);
    expect(el.scrollLeft).toBe(rest);
  });
});

describe('29.035 the rubber band', () => {
  it('29.035 pulling past the first day shows a resisted overshoot (less than the pull), and 160 ms after release it is back at 0; control: inside the limits there is none', () => {
    const { el, fc } = mount();
    el.scrollLeft = 0;
    el.dispatchEvent(pointer('pointerdown', { x: 300, y: 50 }));
    el.dispatchEvent(pointer('pointermove', { x: 350, y: 50 }));
    const shown = Math.abs(parseFloat(el.style.getPropertyValue('--tl-overshoot')));
    expect(el.scrollLeft).toBe(0);
    expect(shown).toBeGreaterThan(10);
    expect(shown).toBeLessThan(50);
    el.dispatchEvent(pointer('pointerup', { x: 350, y: 50 }));
    fc.advance(48);
    expect(Math.abs(parseFloat(el.style.getPropertyValue('--tl-overshoot')))).toBeLessThan(shown);
    fc.advance(160);
    expect(parseFloat(el.style.getPropertyValue('--tl-overshoot'))).toBeCloseTo(0, 5);
    el.scrollLeft = 1000;
    el.dispatchEvent(pointer('pointerdown', { x: 300, y: 50 }));
    el.dispatchEvent(pointer('pointermove', { x: 350, y: 50 }));
    expect(parseFloat(el.style.getPropertyValue('--tl-overshoot'))).toBeCloseTo(0, 5);
  });
});

describe('29.036 the frame stream', () => {
  it('29.036 a native scroll produces frames with the smoothed velocity in days per second, and a final frame once it is quiet; rebase keeps the day at the edge', () => {
    const { el, adapter, fc, frames } = mount();
    for (let i = 0; i < 10; i += 1) {
      el.scrollLeft = i * 48; // 2 days per 16 ms frame = 125 days/s
      el.dispatchEvent(new Event('scroll'));
      fc.advance(16);
    }
    const moving = frames.filter((f) => f.moving);
    expect(moving.length).toBeGreaterThan(5);
    expect(moving[moving.length - 1]?.velocity).toBeGreaterThan(40);
    fc.advance(400);
    expect(frames[frames.length - 1]).toMatchObject({ moving: false, velocity: 0 });
    const day = adapter.offset();
    adapter.rebase(FIRST - 30);
    expect(adapter.offset()).toBeCloseTo(day, 6);
    expect(el.scrollLeft).toBeCloseTo((day - (FIRST - 30)) * 24, 6);
  });

  it('29.036 destroy removes every listener and stops the loop; control: before destroy the same wheel zoomed', () => {
    const { el, adapter, fc } = mount();
    el.dispatchEvent(wheel({ dy: 5, ctrl: true, x: 100 }));
    const zoomed = adapter.scale();
    expect(zoomed).not.toBe(24);
    adapter.destroy();
    const e = wheel({ dy: 50, ctrl: true, x: 100 });
    el.dispatchEvent(e);
    expect(adapter.scale()).toBe(zoomed);
    expect(e.defaultPrevented).toBe(false);
    expect(fc.pending()).toBe(0);
  });
});
```

  Run: `slot-run.sh vp -- pnpm --filter @gisik-nokma/viewport exec vitest run test/scroll-adapter.test.ts --maxWorkers=2 > /tmp/vp.log 2>&1; tail -n 20 /tmp/vp.log`. Expected: FAIL (modules missing). The second 29.031 test is the one that proves the rounding trap: it installs a `scrollLeft` that rounds, and its CONTROL replays the same sweep with the naive read-back loop and requires THAT to drift past 0.5 px, otherwise the test would pass on a platform that never rounds.

- [ ] **Step 3: The clock seam**

`packages/viewport/src/dom/clock.ts` (new):

```ts
/**
 * The ONLY file in the package that names the browser clock (spec VP-0: `src/dom/` owns `requestAnimationFrame` and
 * `performance.now()`). Everything above it takes a `Clock`, so a test drives frames by hand.
 */
export type Clock = {
  now(): number;
  raf(callback: () => void): number;
  caf(handle: number): void;
};

export const browserClock: Clock = {
  now: () => performance.now(),
  raf: (callback) => requestAnimationFrame(() => callback()),
  caf: (handle) => cancelAnimationFrame(handle),
};

/** `prefers-reduced-motion: reduce` (VP-9). False where `matchMedia` does not exist. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A frame loop that runs `tick(now, dtMs)` once per animation frame while it returns true, then stops itself.
 * `start()` is idempotent; the first tick after a start gets the real time since `start()`.
 */
export function createFrameLoop(clock: Clock, tick: (now: number, dtMs: number) => boolean) {
  let handle: number | null = null;
  let last = 0;
  const run = (): void => {
    handle = null;
    const now = clock.now();
    const dt = now - last;
    last = now;
    if (tick(now, dt)) handle = clock.raf(run);
  };
  return {
    start(): void {
      if (handle !== null) return;
      last = clock.now();
      handle = clock.raf(run);
    },
    stop(): void {
      if (handle !== null) clock.caf(handle);
      handle = null;
    },
    running: (): boolean => handle !== null,
  };
}
```

- [ ] **Step 4: The adapter**

`packages/viewport/src/dom/scroll-adapter.ts` (new):

```ts
import { MAX_PPD, clampPpd, dayAt } from '../anchored-zoom.js';
import type { AnimateOptions, AnimateTarget, Frame, ViewportDriver } from '../driver.js';
import { momentumStep, releaseVelocity, type PanSample } from '../momentum.js';
import { rubberOvershoot, SPRING_BACK_MS } from '../rubber-band.js';
import { stepGeometric, stepLinear, tauFor } from '../spring.js';
import { wheelZoomFactor } from '../wheel.js';
import { browserClock, createFrameLoop, prefersReducedMotion, type Clock } from './clock.js';

/** A browser stops honouring a scroll position past about this many px (Firefox ~17.9 M, Chrome ~33.5 M). */
export const MAX_SCROLL_PX = 16_000_000;
const MAX_GLIDE_MS = 450;
const QUIET_MS = 100;
const DRAG_SLOP_PX = 4;
/** One notch of `+` / `-`. */
const KEY_ZOOM = 1.25;

export type ScrollAdapterOptions = {
  /** The `overflow: auto` container. Its FIRST child is the surface that carries the drawn length. */
  element: HTMLElement;
  /** `x`: time runs left to right. `y`: time runs down (portrait). */
  axis?: 'x' | 'y';
  /** The day at scroll position 0. */
  firstDay: number;
  /** Starting px per day. */
  scale: number;
  /** How many days the surface draws, so the zoom can be capped below the browser's scroll size. */
  extentDays: () => number;
  /** Today's day, for Home and `T`. Absent: those keys do nothing. */
  todayDay?: () => number;
  /** The CSS custom property that carries px per day to the surface. */
  scaleVar?: string;
  reducedMotion?: () => boolean;
  clock?: Clock;
};

type Glide = { offset: number | null; scale: number | null; anchorPx: number; tauOffset: number; tauScale: number; reduce: boolean };
type Drag = { id: number; startClient: number; startPos: number; samples: PanSample[]; moved: boolean };

/**
 * A native scroll container with a virtualised surface (spec VP-0). The platform keeps its touch momentum, wheel and
 * keyboard scrolling; this adds what it cannot do: glides (Today, keyboard, jump to a ticket), an anchored zoom, a mouse
 * drag with momentum and a rubber band, and a single stream of frames carrying the smoothed velocity.
 *
 * Px per day lives in ONE CSS custom property (`--tl-ppd`) that the stylesheet multiplies into every bar's left and
 * width, so a zoom frame is one custom-property write and one scroll write, with no React render and no per-bar work.
 */
export class ScrollAdapter implements ViewportDriver {
  private readonly el: HTMLElement;
  private readonly horizontal: boolean;
  private readonly clock: Clock;
  private readonly scaleVar: string;
  private readonly callbacks = new Set<(frame: Frame) => void>();
  private readonly loop;
  private firstDay: number;
  private ppd: number;
  private glide: Glide | null = null;
  private momentum: number | null = null;
  private overshoot = 0;
  private springing = false;
  private springTau = 85;
  private drag: Drag | null = null;
  private swallowClick = false;
  private velocity = 0;
  private lastOffset: number;
  private lastScrollAt = Number.NEGATIVE_INFINITY;
  private emittedIdle = true;
  /** The exact scroll position last asked for, and the value the DOM held right after that write (see `pos`). */
  private exact = 0;
  private written = Number.NaN;
  private readonly removers: Array<() => void> = [];

  constructor(private readonly options: ScrollAdapterOptions) {
    this.el = options.element;
    this.horizontal = (options.axis ?? 'x') === 'x';
    this.clock = options.clock ?? browserClock;
    this.scaleVar = options.scaleVar ?? '--tl-ppd';
    this.firstDay = options.firstDay;
    this.ppd = this.capped(options.scale);
    this.el.style.setProperty(this.scaleVar, String(this.ppd));
    this.lastOffset = this.offset();
    this.loop = createFrameLoop(this.clock, (now, dt) => this.tick(now, dt));
    this.listen(this.el, 'scroll', () => this.onScroll(), { passive: true });
    this.listen(this.el, 'wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.listen(this.el, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.listen(this.el, 'pointermove', (e) => this.onPointerMove(e as PointerEvent));
    this.listen(this.el, 'pointerup', (e) => this.onPointerEnd(e as PointerEvent));
    this.listen(this.el, 'pointercancel', (e) => this.onPointerEnd(e as PointerEvent));
    this.listen(this.el, 'click', (e) => this.onClickCapture(e), { capture: true });
    this.listen(this.el, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
  }

  // ---- ViewportDriver ----
  offset(): number {
    return this.firstDay + this.pos() / this.ppd;
  }
  scale(): number {
    return this.ppd;
  }
  visibleRange(): { start: number; end: number } {
    const off = this.offset();
    return { start: Math.floor(off), end: Math.max(Math.floor(off), Math.ceil(off + this.viewportDays()) - 1) };
  }
  onFrame(callback: (frame: Frame) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  animateTo(target: AnimateTarget, options: AnimateOptions = {}): void {
    const reduce = options.instant === true || this.reduced();
    const maxMs = Math.min(options.maxMs ?? MAX_GLIDE_MS, MAX_GLIDE_MS);
    const anchorPx = options.anchorPx ?? this.size() / 2;
    const scale = target.scale === undefined ? null : this.capped(target.scale);
    const offset = target.offset === undefined ? null : target.offset;
    this.momentum = null;
    if (reduce) {
      this.glide = null;
      if (scale !== null) this.applyScale(scale, anchorPx);
      if (offset !== null) this.setOffset(offset);
      this.wake();
      return;
    }
    const distancePx = offset === null ? 0 : Math.abs(offset - this.offset()) * this.ppd;
    this.glide = {
      offset,
      scale,
      anchorPx,
      tauOffset: tauFor(distancePx, 0.5, maxMs),
      tauScale: tauFor(scale === null ? 1 : this.ppd * Math.abs(Math.log(scale / this.ppd)), 0.01, maxMs),
      reduce: false,
    };
    this.wake();
  }

  // ---- extras the time views use ----
  /** The surface's first day moved (data arrived to the left): keep the same day at the viewport edge. */
  rebase(newFirstDay: number): void {
    const keep = this.offset();
    this.firstDay = newFirstDay;
    this.setOffset(keep);
    this.lastOffset = this.offset();
  }
  /** Pan by px with no animation (tests, and the harness's scripted pan). */
  scrollByPx(px: number): void {
    this.write(this.pos() + px);
  }
  viewportDays(): number {
    return this.size() / this.ppd;
  }
  maxScale(): number {
    return Math.max(4, Math.min(MAX_PPD, Math.floor(MAX_SCROLL_PX / Math.max(1, this.options.extentDays()))));
  }
  destroy(): void {
    this.loop.stop();
    for (const remove of this.removers.splice(0)) remove();
    this.callbacks.clear();
    this.el.style.removeProperty('--tl-overshoot');
  }

  // ---- geometry ----
  /**
   * The scroll position in px. A browser at device-pixel-ratio 1 rounds `scrollLeft` to a whole pixel, so reading it back
   * between frames would feed that rounding into the next frame and the zoom anchor would random-walk (each frame up to 0.5
   * px off the last). The engine therefore remembers the EXACT position it asked for (`exact`) and the value the DOM held right
   * after the write (`written`); while the DOM still shows `written`, nobody else has scrolled and `exact` is the truth. Any
   * other value (a touch pan, the scrollbar, the platform's momentum) wins, because then the platform moved it.
   */
  private pos(): number {
    const dom = this.horizontal ? this.el.scrollLeft : this.el.scrollTop;
    return dom === this.written ? this.exact : dom;
  }
  private size(): number {
    return this.horizontal ? this.el.clientWidth : this.el.clientHeight;
  }
  private maxPos(): number {
    return Math.max(0, (this.horizontal ? this.el.scrollWidth - this.el.clientWidth : this.el.scrollHeight - this.el.clientHeight));
  }
  private write(px: number): void {
    if (this.horizontal) this.el.scrollLeft = px;
    else this.el.scrollTop = px;
    const dom = this.horizontal ? this.el.scrollLeft : this.el.scrollTop;
    this.written = dom;
    // Rounded by the platform: keep the exact ask. Clamped by it (past the end): the platform's value is the truth.
    this.exact = Math.abs(dom - px) < 1 ? px : dom;
  }
  private setOffset(day: number): void {
    this.write((day - this.firstDay) * this.ppd);
  }
  private capped(scale: number): number {
    return clampPpd(scale, this.maxScale());
  }
  private reduced(): boolean {
    return (this.options.reducedMotion ?? prefersReducedMotion)();
  }

  /** Zoom with the day under `anchorPx` held still (VP-6). One property write, one scroll write. */
  private applyScale(scale: number, anchorPx: number): void {
    const next = this.capped(scale);
    const anchorDay = dayAt({ offsetDay: this.offset(), ppd: this.ppd }, anchorPx);
    this.ppd = next;
    this.el.style.setProperty(this.scaleVar, String(next));
    this.write((anchorDay - this.firstDay) * next - anchorPx);
  }

  // ---- the loop ----
  private wake(): void {
    this.emittedIdle = false;
    this.loop.start();
  }

  private tick(now: number, dt: number): boolean {
    let busy = false;
    if (this.glide !== null) busy = this.stepGlide(dt) || busy;
    if (this.momentum !== null) busy = this.stepMomentum(dt) || busy;
    if (this.springing && this.drag === null) busy = this.stepSpringBack(dt) || busy;
    if (this.drag !== null) busy = true;
    const offset = this.offset();
    const seconds = Math.max(dt, 1) / 1000;
    const instant = (offset - this.lastOffset) / seconds;
    this.velocity = dt > 0 ? this.velocity * 0.8 + instant * 0.2 : this.velocity;
    this.lastOffset = offset;
    const moving = busy || now - this.lastScrollAt < QUIET_MS;
    if (!moving) this.velocity = 0;
    this.emit({ now, offset, scale: this.ppd, velocity: this.velocity, moving });
    if (!moving) this.emittedIdle = true;
    return moving;
  }

  private stepGlide(dt: number): boolean {
    const g = this.glide as Glide;
    let done = true;
    if (g.scale !== null) {
      const r = stepGeometric(this.ppd, g.scale, dt, 1e-3, g.reduce, g.tauScale);
      this.applyScale(r.value, g.anchorPx);
      done = done && r.settled;
    }
    if (g.offset !== null) {
      // A target past either end of the scroller can never be reached (the platform clamps the write), so the glide would
      // chase it forever and no resting frame would be emitted: aim at the nearest day the scroller can show.
      const last = this.firstDay + this.maxPos() / this.ppd;
      const aim = Math.min(last, Math.max(this.firstDay, g.offset));
      const r = stepLinear(this.offset(), aim, dt, 0.5 / this.ppd, g.reduce, g.tauOffset);
      this.setOffset(r.value);
      done = done && r.settled;
    }
    if (done) this.glide = null;
    return !done;
  }

  private stepMomentum(dt: number): boolean {
    const m = momentumStep(this.pos(), this.momentum as number, dt);
    const max = this.maxPos();
    const clamped = Math.min(max, Math.max(0, m.offset));
    this.write(clamped);
    if (m.stopped || clamped !== m.offset) {
      this.momentum = null;
      return false;
    }
    this.momentum = m.velocity;
    return true;
  }

  private setOvershoot(px: number): void {
    this.overshoot = px;
    this.el.style.setProperty('--tl-overshoot', `${px}px`);
  }

  private stepSpringBack(dt: number): boolean {
    const r = stepLinear(this.overshoot, 0, dt, 0.5, this.reduced(), this.springTau);
    this.setOvershoot(r.value);
    if (r.settled) this.springing = false;
    return !r.settled;
  }

  private emit(frame: Frame): void {
    for (const callback of [...this.callbacks]) callback(frame);
  }

  // ---- input ----
  private onScroll(): void {
    this.lastScrollAt = this.clock.now();
    this.wake();
  }

  private onWheel(e: WheelEvent): void {
    const factor = wheelZoomFactor(e);
    if (factor === null) return;
    e.preventDefault();
    const rect = this.el.getBoundingClientRect();
    const anchorPx = this.horizontal ? e.clientX - rect.left : e.clientY - rect.top;
    this.glide = null;
    this.applyScale(this.ppd * factor, anchorPx);
    this.lastScrollAt = this.clock.now();
    this.wake();
  }

  private onPointerDown(e: PointerEvent): void {
    // Touch keeps the platform's scrolling and momentum (VP-2); only a mouse or pen drags here, and only on empty canvas.
    if (e.pointerType === 'touch' || e.button !== 0) return;
    if ((e.target as Element | null)?.closest('button, a, input, textarea, select, [data-no-pan]') != null) return;
    this.glide = null;
    this.momentum = null;
    const client = this.horizontal ? e.clientX : e.clientY;
    this.drag = { id: e.pointerId, startClient: client, startPos: this.pos(), samples: [{ t: this.clock.now(), x: this.pos() }], moved: false };
    this.el.setPointerCapture?.(e.pointerId);
    this.el.classList.add('gn-dragging');
    this.wake();
  }

  private onPointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (d === null || e.pointerId !== d.id) return;
    const client = this.horizontal ? e.clientX : e.clientY;
    const raw = d.startPos - (client - d.startClient);
    if (Math.abs(client - d.startClient) > DRAG_SLOP_PX) d.moved = true;
    const max = this.maxPos();
    const clamped = Math.min(max, Math.max(0, raw));
    this.write(clamped);
    const beyond = raw < 0 ? raw : raw > max ? raw - max : 0;
    this.setOvershoot(beyond === 0 ? 0 : -Math.sign(beyond) * rubberOvershoot(Math.abs(beyond), Math.max(1, this.size())));
    d.samples.push({ t: this.clock.now(), x: raw });
    if (d.samples.length > 12) d.samples.shift();
  }

  private onPointerEnd(e: PointerEvent): void {
    const d = this.drag;
    if (d === null || e.pointerId !== d.id) return;
    this.drag = null;
    this.el.releasePointerCapture?.(e.pointerId);
    this.el.classList.remove('gn-dragging');
    this.swallowClick = d.moved;
    if (this.overshoot !== 0) {
      // Fixed for the whole spring-back: recomputing it as the overshoot shrinks would slow the tail past 160 ms.
      this.springTau = tauFor(this.overshoot, 0.5, SPRING_BACK_MS);
      this.springing = true;
    } else if (e.type === 'pointerup') {
      const v = releaseVelocity(d.samples, this.clock.now());
      if (v !== 0 && !this.reduced()) this.momentum = v;
    }
    this.wake();
  }

  /** A drag that panned must not also click the bar it ended on. */
  private onClickCapture(e: Event): void {
    if (!this.swallowClick) return;
    this.swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as Element | null)?.closest('input, textarea, select, [contenteditable="true"]') != null) return;
    const back = this.horizontal ? 'ArrowLeft' : 'ArrowUp';
    const forward = this.horizontal ? 'ArrowRight' : 'ArrowDown';
    const off = this.glide?.offset ?? this.offset();
    const go = (days: number): void => {
      e.preventDefault();
      this.animateTo({ offset: off + days });
    };
    const page = Math.max(1, Math.round(this.viewportDays() * 0.9));
    if (e.key === back) go(e.shiftKey ? -28 : -7);
    else if (e.key === forward) go(e.shiftKey ? 28 : 7);
    else if (e.key === 'PageUp') go(-page);
    else if (e.key === 'PageDown') go(page);
    else if ((e.key === 'Home' || e.key === 't' || e.key === 'T') && this.options.todayDay !== undefined) {
      e.preventDefault();
      this.animateTo({ offset: this.options.todayDay() + 0.5 - this.viewportDays() / 2 });
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.animateTo({ scale: (this.glide?.scale ?? this.ppd) * KEY_ZOOM });
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.animateTo({ scale: (this.glide?.scale ?? this.ppd) / KEY_ZOOM });
    }
  }

  private listen(target: HTMLElement, type: string, handler: (e: Event) => void, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler, options);
    this.removers.push(() => target.removeEventListener(type, handler, options));
  }
}
```

- [ ] **Step 5: Export and run**

`packages/viewport/src/index.ts` (new):

```ts
export * from './spring.js';
export * from './momentum.js';
export * from './rubber-band.js';
export * from './anchored-zoom.js';
export * from './wheel.js';
export * from './calendar-days.js';
export * from './range-plan.js';
export * from './range-cache.js';
export * from './pack.js';
export * from './route.js';
export * from './driver.js';
export * from './dom/clock.js';
export * from './dom/scroll-adapter.js';
```

  Run the package suite (59 tests pass and 1 is skipped after T6 on its own), typecheck and build. The seam test (29.015) still passes because every clock read is under `src/dom/`; confirm by running `grep -n "performance\|requestAnimationFrame\|matchMedia" packages/viewport/src/*.ts` (no output).

- [ ] **Step 6: Mutation pass (own)**
  - `pos()`: `return dom` always (the naive read-back) → 29.031 (rounding) goes RED.
  - `stepGlide`: delete the `aim` clamp (use `g.offset`) → 29.039 RED (the loop never goes idle).
  - `MAX_GLIDE_MS = 450` to `900`; `tauFor` replaced by `85` → 29.032 (the 1,000,000 px glide).
  - `maxScale`: delete the `MAX_SCROLL_PX` division → 29.031 (the cap case).
  - keys: `-7`/`7` to `5`; Shift `28` to `14`; `0.9` to `1`; `KEY_ZOOM = 1.25` to `1.5`; Home without the `+ 0.5` → 29.033.
  - `if (e.pointerType === 'touch'...)` removed → 29.034 control; the `closest('button, a, ...')` guard removed → 29.034 control; `swallowClick = d.moved` to `true` or `false` → 29.034.
  - `SPRING_BACK_MS = 160` to `320`; the `rubberOvershoot` sign flipped → 29.035.
  - `QUIET_MS = 100` to `0` (no final quiet frame while a native scroll just ended) → 29.036; `destroy` not removing listeners → 29.036 control.
  - Record the survivors with their reasons (a mutant of `DRAG_SLOP_PX` between 1 and 4 is expected to survive: the case drags 100 px).

- [ ] **Step 7: Flip, bullet, gate**
  - Flip ❌ to ✅ on 29.030–29.036 and 29.039; `pnpm check:citations`.
  - Features section 26: replace `<!-- wtg-part1-viewport-timeline-view T6 bullet -->` with:

```markdown
- ⚙️ **`ScrollAdapter`: smooth movement on a native scroller** (Workflow and Timeline graphs Part 1 T6; cases 29.030–29.036, 29.039; `packages/viewport/src/dom/{clock,scroll-adapter}.ts`) — the time views keep the platform's own scrolling (wheel, swipe, touch, scrollbar) and add what it lacks: Ctrl + wheel and pinch zoom about the pointer (the day under it holds within 0.5 px, also where the platform rounds scroll positions), glides on the spring (a Today jump lands inside 450 ms, instantly under reduced motion, never chasing a target past the scroller's end), keys (arrows 7 days, Shift 28, PageUp/Down 90% of a viewport, Home / T centre today, + / - zoom 1.25x), mouse-drag pan with momentum, a rubber band at the ends, and a frame stream with smoothed velocity. Reads time only through an injected `Clock`.
```

  - Package suite WHOLE, typecheck, build, gate, land.


### Task 7: `CameraAdapter`: the free 2D camera for graphs (cases 29.037, 29.038, 29.045–29.049)

**Branch:** `task/wtg1-camera` from `origin/release/workflow-graph` (after T6; it reuses T6's clock and fake clock). **NEEDS:** nothing; the five real-browser cases run headless Chromium on the lane's machine (a camera transform is not a frame-rate claim, so a headless run IS a pass here, named `LOCAL, headless`).

**Files:**
- Create: `packages/viewport/src/dom/camera-adapter.ts`, `packages/viewport/test/camera-adapter.test.ts`
- Create: `packages/flow-graph-browser/harness/camera.html`, `harness/camera.ts`, `tests/camera.spec.ts`
- Modify: `packages/viewport/src/index.ts` (add `./dom/camera-adapter.js`), `test-cases/29-workflow-timeline-graphs.md` (T7 anchor), `Features.md` (T7 bullet anchor)

**Interfaces:**
- **Consumes (T2, T6):** `stepLinear`, `stepGeometric`, `tauFor`, `momentumStep`, `releaseVelocity`, `wheelIntent`, the `Clock` and `createFrameLoop`, the `ViewportDriver` types; the test helpers `fakeClock`, `pointer`, `wheel`.
- **Produces:** `class CameraAdapter implements ViewportDriver`, constructed with `{element, layer, minZoom, maxZoom, start?: {x, y, zoom}, reducedMotion?, clock?}`. Methods: `getCamera(): {x, y, zoom}`, `camera(target: Partial<Camera>, options?)` (a glide of any of x, y, zoom), `toWorld({x, y})`, and the `ViewportDriver` four (`offset()` = camera x, `scale()` = zoom, `visibleRange()`, `animateTo`, `onFrame`), `destroy()`. `type Camera = {x, y, zoom}`.
- **Used by:** Part 3 (the Workflow graph) and Part 4 (the Timeline graph). The Knowledge Graph keeps its own camera.

**Design notes:**
- **One `transform` write per frame** (VP-8): `translate(-x*zoom px, -y*zoom px) scale(zoom)` on the one `layer`, `transform-origin: 0 0`. The camera is `{x, y, zoom}`: the world point at the viewport's top-left and px per world unit, so `screen = (world - camera) * zoom`.
- The element gets `touch-action: none` and `overscroll-behavior: contain` so the page never pans under a gesture.
- **Input:** `wheelIntent` (T2) decides: Ctrl + wheel and a notched wheel zoom about the pointer, a pixel scroll pans by `delta / zoom` world units; drag pans with momentum (mouse, pen and touch); two pointers pinch about their midpoint (the world point under the midpoint follows it as it moves); keys pan 80 px (Shift four times as far) and zoom 1.25x. Every handled event is cancelled.
- Glides use the same spring and the same 450 ms cap as `ScrollAdapter`; reduced motion jumps in the same call.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part1-viewport-timeline-view T7 -->`, insert (all ❌):

- ❌ **29.037 — it writes ONE transform on the layer, from the camera: screen = (world - camera) * zoom; control: the touch-action and overscroll are set so the page never pans under it | wheel: a notched wheel and Ctrl + wheel zoom about the pointer (the world point under it does not move), a pixel scroll pans; all cancelled; zoom stays in [min, max] | a pixel wheel pans by delta / zoom; control: the same delta at zoom 2 moves half as many world units.** (`packages/viewport/test/camera-adapter.test.ts`)
- ❌ **29.038 — drag pans (touch too); two fingers pinch about their midpoint; a flick keeps going and stops; control: a rested release does not | glides: the camera animates to a target inside 450 ms, never jumps on frame 1, and lands at once under reduced motion; the frame stream ends with moving: false | keys pan 80 px / zoom 1.25x, Shift pans four times as far; destroy detaches.** (`packages/viewport/test/camera-adapter.test.ts`)
- ❌ **29.045 — a mouse drag pans the world with the pointer, then momentum carries on and stops.** (`packages/flow-graph-browser/tests/camera.spec.ts`)
- ❌ **29.046 — Ctrl + wheel zooms about the pointer: the world point under it stays within half a pixel.** (`packages/flow-graph-browser/tests/camera.spec.ts`)
- ❌ **29.047 — a pixel wheel scroll pans; the arrow keys pan by 80 px; plus and minus zoom; the page does not scroll.** (`packages/flow-graph-browser/tests/camera.spec.ts`)
- ❌ **29.048 — reduced motion: a key press jumps with no glide and a drag release leaves no momentum.** (`packages/flow-graph-browser/tests/camera.spec.ts`)
- ❌ **29.049 — two touch points pinch and pan as one gesture; the world point under their midpoint follows it.** (`packages/flow-graph-browser/tests/camera.spec.ts`)

- [ ] **Step 2: The unit tests first (RED)**

`packages/viewport/test/camera-adapter.test.ts` (new):

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CameraAdapter, type Frame } from '../src/index.js';
import { fakeClock, pointer, sizeOf, wheel } from './fake-clock.js';

function mount(reduced = false) {
  const el = document.createElement('div');
  const layer = document.createElement('div');
  el.append(layer);
  document.body.append(el);
  sizeOf(el, { clientWidth: 800, scrollWidth: 800, clientHeight: 600, scrollHeight: 600 });
  const fc = fakeClock();
  const frames: Frame[] = [];
  const cam = new CameraAdapter({ element: el, layer, minZoom: 0.2, maxZoom: 4, reducedMotion: () => reduced, clock: fc.clock });
  cam.onFrame((f) => frames.push(f));
  return { el, layer, cam, fc, frames };
}
afterEach(() => void (document.body.innerHTML = ''));

describe('29.037 the camera', () => {
  it('29.037 it writes ONE transform on the layer, from the camera: screen = (world - camera) * zoom; control: the touch-action and overscroll are set so the page never pans under it', () => {
    const { el, layer, cam } = mount();
    cam.camera({ x: 100, y: 50, zoom: 2 }, { instant: true });
    expect(layer.style.transform).toBe('translate(-200px, -100px) scale(2)');
    expect(cam.getCamera()).toEqual({ x: 100, y: 50, zoom: 2 });
    expect(el.style.touchAction).toBe('none');
    expect(el.style.overscrollBehavior).toBe('contain');
    expect(cam.toWorld({ x: 400, y: 300 })).toEqual({ x: 300, y: 200 });
  });

  it('29.037 wheel: a notched wheel and Ctrl + wheel zoom about the pointer (the world point under it does not move), a pixel scroll pans; all cancelled; zoom stays in [min, max]', () => {
    const { el, cam } = mount();
    const at = { x: 250, y: 100 };
    const world = cam.toWorld(at);
    for (const e of [wheel({ ...at, dy: -120 }), wheel({ ...at, dy: -8, ctrl: true }), wheel({ ...at, dy: 8, ctrl: true })]) {
      el.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      const now = cam.toWorld(at);
      expect(Math.abs(now.x - world.x) * cam.scale()).toBeLessThan(0.5);
      expect(Math.abs(now.y - world.y) * cam.scale()).toBeLessThan(0.5);
    }
    const z = cam.scale();
    // wheel up zooms IN: the notched -120 (exp(0.264)) and the Ctrl pair (exp(0.096) * exp(-0.096)) leave exp(0.264)
    expect(z).toBeCloseTo(Math.exp(0.264), 6);
    const before = cam.getCamera();
    const pan = wheel({ dx: 30, dy: 12 });
    el.dispatchEvent(pan);
    expect(pan.defaultPrevented).toBe(true);
    expect(cam.getCamera().x).toBeCloseTo(before.x + 30 / z, 9);
    expect(cam.getCamera().y).toBeCloseTo(before.y + 12 / z, 9);
    expect(cam.scale()).toBe(z);
    for (let i = 0; i < 200; i += 1) el.dispatchEvent(wheel({ dy: -120 }));
    expect(cam.scale()).toBe(4);
    for (let i = 0; i < 400; i += 1) el.dispatchEvent(wheel({ dy: 120 }));
    expect(cam.scale()).toBe(0.2);
  });

  it('29.037 a pixel wheel pans by delta / zoom; control: the same delta at zoom 2 moves half as many world units', () => {
    const { el, cam } = mount();
    el.dispatchEvent(wheel({ dx: 40, dy: 0 }));
    expect(cam.getCamera().x).toBe(40);
    cam.camera({ x: 0, y: 0, zoom: 2 }, { instant: true });
    el.dispatchEvent(wheel({ dx: 40, dy: 0 }));
    expect(cam.getCamera().x).toBe(20);
  });

  it('29.038 drag pans (touch too); two fingers pinch about their midpoint; a flick keeps going and stops; control: a rested release does not', () => {
    const { el, cam, fc } = mount();
    el.dispatchEvent(pointer('pointerdown', { x: 400, y: 300, id: 1, kind: 'touch' }));
    el.dispatchEvent(pointer('pointermove', { x: 350, y: 280, id: 1, kind: 'touch' }));
    expect(cam.getCamera()).toMatchObject({ x: 50, y: 20 });
    el.dispatchEvent(pointer('pointerup', { x: 350, y: 280, id: 1, kind: 'touch' }));
    // pinch
    el.dispatchEvent(pointer('pointerdown', { x: 300, y: 300, id: 2, kind: 'touch' }));
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300, id: 3, kind: 'touch' }));
    const mid = cam.toWorld({ x: 400, y: 300 });
    el.dispatchEvent(pointer('pointermove', { x: 200, y: 300, id: 2, kind: 'touch' }));
    el.dispatchEvent(pointer('pointermove', { x: 600, y: 300, id: 3, kind: 'touch' }));
    expect(cam.scale()).toBeCloseTo(2, 5);
    const after = cam.toWorld({ x: 400, y: 300 });
    expect(Math.abs(after.x - mid.x) * cam.scale()).toBeLessThan(0.5);
    expect(Math.abs(after.y - mid.y) * cam.scale()).toBeLessThan(0.5);
    // both fingers slide 100 px right: the midpoint leaves the viewport centre (400, 300) and the world point follows it
    el.dispatchEvent(pointer('pointermove', { x: 300, y: 300, id: 2, kind: 'touch' }));
    el.dispatchEvent(pointer('pointermove', { x: 700, y: 300, id: 3, kind: 'touch' }));
    const slid = cam.toWorld({ x: 500, y: 300 });
    expect(Math.abs(slid.x - mid.x) * cam.scale()).toBeLessThan(0.5);
    el.dispatchEvent(pointer('pointerup', { x: 300, y: 300, id: 2, kind: 'touch' }));
    el.dispatchEvent(pointer('pointerup', { x: 700, y: 300, id: 3, kind: 'touch' }));
    fc.advance(1000);
    // flick
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300 }));
    for (let i = 1; i <= 5; i += 1) {
      fc.advance(16);
      el.dispatchEvent(pointer('pointermove', { x: 500 - i * 24, y: 300 }));
    }
    el.dispatchEvent(pointer('pointerup', { x: 380, y: 300 }));
    const released = cam.getCamera().x;
    expect(released).toBe(120);
    // release velocity 1.5 px/ms = 1,500 px/s: 200 ms of decay travel 360 * (1 - e^(-200/240)) = 203.5 px
    fc.advance(200);
    expect(cam.getCamera().x).toBeGreaterThan(released + 150);
    fc.advance(4000);
    const rest = cam.getCamera().x;
    // the whole flick travels v * tau = 1,500 px/s * 0.24 s = 360 px, less the < 2 px/s left when it stops
    expect(rest - released).toBeGreaterThan(355);
    expect(rest - released).toBeLessThan(361);
    fc.advance(400);
    expect(cam.getCamera().x).toBe(rest);
    // stopped means the frame loop went idle, not only that x held
    expect(fc.pending()).toBe(0);
    // rested: the move is 16 ms after the press, so the samples span time; 300 ms of rest empties the 80 ms window
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300 }));
    fc.advance(16);
    el.dispatchEvent(pointer('pointermove', { x: 450, y: 300 }));
    fc.advance(300);
    el.dispatchEvent(pointer('pointerup', { x: 450, y: 300 }));
    const still = cam.getCamera().x;
    fc.advance(500);
    expect(cam.getCamera().x).toBe(still);
  });

  it('29.038 glides: the camera animates to a target inside 450 ms, never jumps on frame 1, and lands at once under reduced motion; the frame stream ends with moving: false', () => {
    const { cam, fc, frames } = mount();
    cam.camera({ x: 5000, y: 3000, zoom: 2 });
    fc.advance(16);
    expect(cam.getCamera().x).toBeGreaterThan(0);
    expect(cam.getCamera().x).toBeLessThan(5000);
    fc.advance(480);
    expect(cam.getCamera().x).toBeCloseTo(5000, 0);
    expect(cam.getCamera().zoom).toBeCloseTo(2, 2);
    expect(frames[frames.length - 1]?.moving).toBe(false);
    const r = mount(true);
    r.cam.camera({ x: 90, zoom: 3 });
    expect(r.cam.getCamera()).toMatchObject({ x: 90, zoom: 3 });
  });

  it('29.038 keys pan 80 px / zoom 1.25x, Shift pans four times as far; destroy detaches', () => {
    const { el, cam, fc } = mount();
    const press = (key: string, shiftKey = false) => el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
    press('ArrowRight');
    fc.advance(700);
    expect(cam.getCamera().x).toBeCloseTo(80, 0);
    press('ArrowRight', true);
    fc.advance(700);
    expect(cam.getCamera().x).toBeCloseTo(80 + 320, 0);
    press('+');
    fc.advance(700);
    expect(cam.scale()).toBeCloseTo(1.25, 2);
    // 80 SCREEN px: at zoom 1.25 a key pan is 64 world units
    const x1 = cam.getCamera().x;
    press('ArrowRight');
    fc.advance(700);
    expect((cam.getCamera().x - x1) * cam.scale()).toBeCloseTo(80, 0);
    cam.destroy();
    const e = wheel({ dy: -120 });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
```

**Kills:**
- 29.037 one transform: (a) `paint()`: `${-x * zoom}px` → `${-x}px` (b) delete `this.el.style.touchAction = 'none';` (c) `toWorld`: `px.x / this.cam.zoom` → `px.x * this.cam.zoom`.
- 29.037 wheel: (a) `onWheel`: `this.zoomAbout(this.cam.zoom * intent.factor, this.local(e))` → anchor `{ x: this.el.clientWidth / 2, y: this.el.clientHeight / 2 }` (b) `this.cam.zoom * intent.factor` → `this.cam.zoom / intent.factor` (wheel up zooms out: z = exp(-0.264)) (c) move `e.preventDefault()` into the zoom branch (the pixel pan is no longer cancelled).
- 29.037 pixel pan: (a) `this.cam.x += intent.dx / this.cam.zoom` → `this.cam.x += intent.dx` (b) `+=` → `-=` on the pan x.
- 29.038 drag / pinch / flick: (a) the pinch branch's `y: this.pinch.world.y - mid.y / zoom` → `y: this.cam.y` (b) `const mid = this.pinchMid()` → `{ x: this.el.clientWidth / 2, y: this.el.clientHeight / 2 }` (pinch about the view centre: the slide leg) (c) `onPointerEnd`: `const t = this.clock.now()` → `const t = this.samples[this.samples.length - 1]?.t ?? this.clock.now()` (the rested release gets a velocity).
- 29.038 glides: (a) `camera()`: `options.instant === true || (this.options.reducedMotion ?? prefersReducedMotion)()` → `options.instant === true` (reduced motion glides) (b) `Math.min(options.maxMs ?? MAX_GLIDE_MS, MAX_GLIDE_MS)` → `options.maxMs ?? 4500` (tau stays 85 ms: about 15 px short at 496 ms) (c) `tick`: `busy = !done` → `busy = true` (the last frame says moving: true).
- 29.038 keys: (a) `e.shiftKey ? 4 : 1` → `e.shiftKey ? 2 : 1` (b) `step = (KEY_PAN_PX * (e.shiftKey ? 4 : 1)) / this.cam.zoom` → drop `/ this.cam.zoom` (100 screen px at zoom 1.25) (c) delete the `for (const remove of this.removers.splice(0)) remove();` line in `destroy`.

  Run: `slot-run.sh vp -- pnpm --filter @gisik-nokma/viewport exec vitest run test/camera-adapter.test.ts --maxWorkers=2 > /tmp/vp.log 2>&1; tail -n 20 /tmp/vp.log`. Expected: FAIL (module missing).

- [ ] **Step 3: The adapter**

`packages/viewport/src/dom/camera-adapter.ts` (new):

```ts
import type { AnimateOptions, AnimateTarget, Frame, ViewportDriver } from '../driver.js';
import { momentumStep, releaseVelocity, type PanSample } from '../momentum.js';
import { stepGeometric, stepLinear, tauFor } from '../spring.js';
import { wheelIntent } from '../wheel.js';
import { browserClock, createFrameLoop, prefersReducedMotion, type Clock } from './clock.js';

const MAX_GLIDE_MS = 450;
const QUIET_MS = 100;
const KEY_PAN_PX = 80;
const KEY_ZOOM = 1.25;

export type CameraAdapterOptions = {
  /** The element that receives pointer, wheel and key input (its `touch-action` is set to `none` here). */
  element: HTMLElement;
  /** The one layer that moves: a `div` or an `svg` group. Only its `transform` is written. */
  layer: HTMLElement | SVGElement;
  minZoom: number;
  maxZoom: number;
  /** World px at the viewport's top-left, and the zoom, to start from. */
  start?: { x: number; y: number; zoom: number };
  reducedMotion?: () => boolean;
  clock?: Clock;
};

export type Camera = { x: number; y: number; zoom: number };
type Pointer = { x: number; y: number };
type Glide = { target: Partial<Camera>; anchor: Pointer; tauPan: number; tauZoom: number };

/**
 * A free 2D camera over one layer (spec VP-0), for the Workflow graph: pan by drag (mouse, pen and touch), pinch,
 * Ctrl + wheel and notched-wheel zoom about the pointer, a pixel wheel scroll pans, keys pan and zoom, glides and a
 * momentum release. Movement is ONE `transform` write per frame (VP-8). The camera is `{x, y, zoom}`: the world point at
 * the viewport's top-left corner and px per world unit, so `screen = (world - camera) * zoom`.
 *
 * As a `ViewportDriver` its axis is world x: `offset()` is the left edge, `scale()` is the zoom.
 */
export class CameraAdapter implements ViewportDriver {
  private cam: Camera;
  private readonly el: HTMLElement;
  private readonly layer: HTMLElement | SVGElement;
  private readonly clock: Clock;
  private readonly loop;
  private readonly callbacks = new Set<(frame: Frame) => void>();
  private readonly pointers = new Map<number, Pointer>();
  private glide: Glide | null = null;
  private momentum: { vx: number; vy: number } | null = null;
  private samples: Array<{ t: number; x: number; y: number }> = [];
  /** `world` is the world point under the fingers' midpoint when the pinch began: it stays under the midpoint as it moves. */
  private pinch: { distance: number; zoom: number; world: Pointer } | null = null;
  private lastScrollAt = Number.NEGATIVE_INFINITY;
  private lastX: number;
  private velocity = 0;
  private readonly removers: Array<() => void> = [];

  constructor(private readonly options: CameraAdapterOptions) {
    this.el = options.element;
    this.layer = options.layer;
    this.clock = options.clock ?? browserClock;
    this.cam = options.start ?? { x: 0, y: 0, zoom: 1 };
    this.lastX = this.cam.x;
    this.el.style.touchAction = 'none';
    this.el.style.overscrollBehavior = 'contain';
    this.paint();
    this.loop = createFrameLoop(this.clock, (now, dt) => this.tick(now, dt));
    this.listen('wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.listen('pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.listen('pointermove', (e) => this.onPointerMove(e as PointerEvent));
    this.listen('pointerup', (e) => this.onPointerEnd(e as PointerEvent));
    this.listen('pointercancel', (e) => this.onPointerEnd(e as PointerEvent));
    this.listen('keydown', (e) => this.onKeyDown(e as KeyboardEvent));
  }

  // ---- ViewportDriver ----
  offset(): number {
    return this.cam.x;
  }
  scale(): number {
    return this.cam.zoom;
  }
  visibleRange(): { start: number; end: number } {
    return { start: Math.floor(this.cam.x), end: Math.ceil(this.cam.x + this.el.clientWidth / this.cam.zoom) };
  }
  onFrame(callback: (frame: Frame) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  animateTo(target: AnimateTarget, options: AnimateOptions = {}): void {
    this.camera({ ...(target.offset === undefined ? {} : { x: target.offset }), ...(target.scale === undefined ? {} : { zoom: target.scale }) }, options);
  }

  // ---- the camera ----
  getCamera(): Camera {
    return { ...this.cam };
  }
  /** Glide the camera (any of x, y, zoom). A zoom without a position holds the anchor still. */
  camera(target: Partial<Camera>, options: AnimateOptions = {}): void {
    const reduce = options.instant === true || (this.options.reducedMotion ?? prefersReducedMotion)();
    const maxMs = Math.min(options.maxMs ?? MAX_GLIDE_MS, MAX_GLIDE_MS);
    const anchor = options.anchorPx === undefined ? { x: this.el.clientWidth / 2, y: this.el.clientHeight / 2 } : { x: options.anchorPx, y: this.el.clientHeight / 2 };
    this.momentum = null;
    const zoom = target.zoom === undefined ? undefined : this.clampZoom(target.zoom);
    if (reduce) {
      this.glide = null;
      this.jump({ ...target, ...(zoom === undefined ? {} : { zoom }) }, anchor);
      this.wake();
      return;
    }
    const dx = target.x === undefined ? 0 : (target.x - this.cam.x) * this.cam.zoom;
    const dy = target.y === undefined ? 0 : (target.y - this.cam.y) * this.cam.zoom;
    this.glide = {
      target: { ...target, ...(zoom === undefined ? {} : { zoom }) },
      anchor,
      tauPan: tauFor(Math.hypot(dx, dy), 0.5, maxMs),
      tauZoom: tauFor(zoom === undefined ? 1 : 1000 * Math.abs(Math.log(zoom / this.cam.zoom)), 1, maxMs),
    };
    this.wake();
  }
  /** Screen px (relative to the element) to world units. */
  toWorld(px: Pointer): Pointer {
    return { x: this.cam.x + px.x / this.cam.zoom, y: this.cam.y + px.y / this.cam.zoom };
  }
  destroy(): void {
    this.loop.stop();
    for (const remove of this.removers.splice(0)) remove();
    this.callbacks.clear();
  }

  // ---- internals ----
  private clampZoom(zoom: number): number {
    return Math.min(this.options.maxZoom, Math.max(this.options.minZoom, zoom));
  }
  private paint(): void {
    const { x, y, zoom } = this.cam;
    this.layer.style.transform = `translate(${-x * zoom}px, ${-y * zoom}px) scale(${zoom})`;
    this.layer.style.transformOrigin = '0 0';
  }
  /** Zoom with the world point under `anchor` held still. */
  private zoomAbout(zoom: number, anchor: Pointer): void {
    const next = this.clampZoom(zoom);
    const world = this.toWorld(anchor);
    this.cam = { zoom: next, x: world.x - anchor.x / next, y: world.y - anchor.y / next };
  }
  private jump(target: Partial<Camera>, anchor: Pointer): void {
    if (target.zoom !== undefined) this.zoomAbout(target.zoom, anchor);
    if (target.x !== undefined) this.cam.x = target.x;
    if (target.y !== undefined) this.cam.y = target.y;
    this.paint();
  }
  private wake(): void {
    this.loop.start();
  }
  private tick(now: number, dt: number): boolean {
    let busy = false;
    if (this.glide !== null) {
      const g = this.glide;
      const reduce = false;
      let done = true;
      if (g.target.zoom !== undefined) {
        const r = stepGeometric(this.cam.zoom, g.target.zoom, dt, 1e-3, reduce, g.tauZoom);
        this.zoomAbout(r.value, g.anchor);
        done = done && r.settled;
      }
      if (g.target.x !== undefined) {
        const r = stepLinear(this.cam.x, g.target.x, dt, 0.5 / this.cam.zoom, reduce, g.tauPan);
        this.cam.x = r.value;
        done = done && r.settled;
      }
      if (g.target.y !== undefined) {
        const r = stepLinear(this.cam.y, g.target.y, dt, 0.5 / this.cam.zoom, reduce, g.tauPan);
        this.cam.y = r.value;
        done = done && r.settled;
      }
      if (done) this.glide = null;
      busy = !done;
    }
    if (this.momentum !== null) {
      const mx = momentumStep(0, this.momentum.vx, dt);
      const my = momentumStep(0, this.momentum.vy, dt);
      this.cam.x -= mx.offset / this.cam.zoom;
      this.cam.y -= my.offset / this.cam.zoom;
      this.momentum = mx.stopped && my.stopped ? null : { vx: mx.velocity, vy: my.velocity };
      busy = busy || this.momentum !== null;
    }
    this.paint();
    const seconds = Math.max(dt, 1) / 1000;
    this.velocity = dt > 0 ? this.velocity * 0.8 + ((this.cam.x - this.lastX) / seconds) * 0.2 : this.velocity;
    this.lastX = this.cam.x;
    const moving = busy || this.pointers.size > 0 || now - this.lastScrollAt < QUIET_MS;
    if (!moving) this.velocity = 0;
    for (const callback of [...this.callbacks]) callback({ now, offset: this.cam.x, scale: this.cam.zoom, velocity: this.velocity, moving });
    return moving;
  }

  private local(e: { clientX: number; clientY: number }): Pointer {
    const rect = this.el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.glide = null;
    this.momentum = null;
    const intent = wheelIntent(e);
    if (intent.kind === 'zoom') this.zoomAbout(this.cam.zoom * intent.factor, this.local(e));
    else {
      this.cam.x += intent.dx / this.cam.zoom;
      this.cam.y += intent.dy / this.cam.zoom;
    }
    this.paint();
    this.lastScrollAt = this.clock.now();
    this.wake();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.glide = null;
    this.momentum = null;
    this.pointers.set(e.pointerId, this.local(e));
    this.el.setPointerCapture?.(e.pointerId);
    this.samples = [{ t: this.clock.now(), ...this.local(e) }];
    this.pinch = this.pointers.size === 2 ? { distance: this.pinchDistance(), zoom: this.cam.zoom, world: this.toWorld(this.pinchMid()) } : null;
    this.wake();
  }

  private pinchMid(): Pointer {
    const [a, b] = [...this.pointers.values()];
    return a === undefined || b === undefined ? { x: 0, y: 0 } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onPointerMove(e: PointerEvent): void {
    const before = this.pointers.get(e.pointerId);
    if (before === undefined) return;
    const now = this.local(e);
    this.pointers.set(e.pointerId, now);
    if (this.pointers.size === 2 && this.pinch !== null && this.pinch.distance > 0) {
      // Pinch and two-finger pan are one gesture: the world point first under the midpoint follows the midpoint.
      const zoom = this.clampZoom((this.pinch.zoom * this.pinchDistance()) / this.pinch.distance);
      const mid = this.pinchMid();
      this.cam = { zoom, x: this.pinch.world.x - mid.x / zoom, y: this.pinch.world.y - mid.y / zoom };
    } else if (this.pointers.size === 1) {
      this.cam.x -= (now.x - before.x) / this.cam.zoom;
      this.cam.y -= (now.y - before.y) / this.cam.zoom;
      this.samples.push({ t: this.clock.now(), ...now });
      if (this.samples.length > 12) this.samples.shift();
    }
    this.paint();
  }

  private onPointerEnd(e: PointerEvent): void {
    if (!this.pointers.delete(e.pointerId)) return;
    this.el.releasePointerCapture?.(e.pointerId);
    this.pinch = null;
    if (this.pointers.size === 0 && e.type === 'pointerup' && !(this.options.reducedMotion ?? prefersReducedMotion)()) {
      const t = this.clock.now();
      const vx = releaseVelocity(this.samples.map((s): PanSample => ({ t: s.t, x: s.x })), t);
      const vy = releaseVelocity(this.samples.map((s): PanSample => ({ t: s.t, x: s.y })), t);
      if (vx !== 0 || vy !== 0) this.momentum = { vx, vy };
    }
    this.wake();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as Element | null)?.closest('input, textarea, select, [contenteditable="true"]') != null) return;
    const base = this.glide?.target ?? {};
    const x = base.x ?? this.cam.x;
    const y = base.y ?? this.cam.y;
    const zoom = base.zoom ?? this.cam.zoom;
    const step = (KEY_PAN_PX * (e.shiftKey ? 4 : 1)) / this.cam.zoom;
    const pan = (dx: number, dy: number): void => {
      e.preventDefault();
      this.camera({ x: x + dx, y: y + dy });
    };
    if (e.key === 'ArrowLeft') pan(-step, 0);
    else if (e.key === 'ArrowRight') pan(step, 0);
    else if (e.key === 'ArrowUp') pan(0, -step);
    else if (e.key === 'ArrowDown') pan(0, step);
    else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.camera({ zoom: zoom * KEY_ZOOM });
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.camera({ zoom: zoom / KEY_ZOOM });
    }
  }

  private listen(type: string, handler: (e: Event) => void, options?: AddEventListenerOptions): void {
    this.el.addEventListener(type, handler, options);
    this.removers.push(() => this.el.removeEventListener(type, handler, options));
  }
}
```

`packages/viewport/src/index.ts` (exists on the ref with T1/T2's seven lines): add only this task's own export line (planner ruling 2026-10-04, as for T3 and T4); on a merge, take the union of the `export *` lines:

```ts
export * from './dom/camera-adapter.js';
```

  Run the package suite (65 tests pass and 1 is skipped after T7), typecheck and build.

- [ ] **Step 4: The harness page and the real-browser specs (RED, then GREEN)**

  The page is 60 world-unit boxes on a grid under one transformed layer, so a spec can read where a world point lands. `?reduced=1` forces reduced motion. Specs first:

`packages/flow-graph-browser/tests/camera.spec.ts` (new):

```ts
import { expect, test, type Page } from '@playwright/test';

type Cam = { x: number; y: number; zoom: number };
const cam = (page: Page): Promise<Cam> => page.evaluate(() => (window as unknown as { __camera: { getCamera(): Cam } }).__camera.getCamera());
const nodeLeft = (page: Page): Promise<number> => page.evaluate(() => document.querySelector('.node')!.getBoundingClientRect().left);
const settled = async (page: Page): Promise<void> => {
  let last = await cam(page);
  for (let i = 0; i < 80; i += 1) {
    await page.waitForTimeout(50);
    const now = await cam(page);
    if (now.x === last.x && now.y === last.y && now.zoom === last.zoom) return;
    last = now;
  }
  // a camera that never comes to rest is a failure, not a quiet return (a fast flick stops within about 2.3 s)
  throw new Error('the camera never came to rest within 4 s');
};

test('29.045 a mouse drag pans the world with the pointer, then momentum carries on and stops', async ({ page }) => {
  await page.goto('/camera.html');
  const view = page.locator('#view');
  const box = (await view.boundingBox())!;
  await page.mouse.move(box.x + 500, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, { steps: 10 });
  const during = await cam(page);
  expect(during.x).toBeCloseTo(200, 0);
  await page.mouse.up();
  await settled(page);
  const after = await cam(page);
  // the release velocity carried the camera further than the pointer went (strictly: with no momentum after === during), and it came to rest
  expect(after.x).toBeGreaterThan(during.x);
  expect(after.y).toBeCloseTo(0, 0);
  const rest = await cam(page);
  await page.waitForTimeout(200);
  expect((await cam(page)).x).toBe(rest.x);
});

test('29.046 Ctrl + wheel zooms about the pointer: the world point under it stays within half a pixel', async ({ page }) => {
  await page.goto('/camera.html');
  const view = page.locator('#view');
  const box = (await view.boundingBox())!;
  const px = { x: 420, y: 180 };
  await page.mouse.move(box.x + px.x, box.y + px.y);
  const worldAt = (c: Cam) => ({ x: c.x + px.x / c.zoom, y: c.y + px.y / c.zoom });
  const before = worldAt(await cam(page));
  let worst = 0;
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -12);
    await page.keyboard.up('Control');
    const c = await cam(page);
    const w = worldAt(c);
    worst = Math.max(worst, Math.hypot(w.x - before.x, w.y - before.y) * c.zoom);
  }
  // zoomed in, and not pinned at the 3x ceiling (a clamped step would make the drift trivially zero)
  expect((await cam(page)).zoom).toBeGreaterThan(1.3);
  expect((await cam(page)).zoom).toBeLessThan(3);
  expect(worst).toBeLessThanOrEqual(0.5);
  // the SCREEN agrees with the camera at this zoom: node 0 (world 0, 0) is drawn at (0 - x) * zoom from the view's left
  const c = await cam(page);
  expect(Math.abs((await nodeLeft(page)) - (box.x - c.x * c.zoom))).toBeLessThan(0.5);
});

test('29.047 a pixel wheel scroll pans; the arrow keys pan by 80 px; plus and minus zoom; the page does not scroll', async ({ page }) => {
  await page.goto('/camera.html');
  const view = page.locator('#view');
  const box = (await view.boundingBox())!;
  // make the page itself scrollable both ways, so "the page does not scroll" can fail (the 800 x 500 view alone never overflows)
  await page.evaluate(() => {
    document.body.style.width = '3000px';
    document.body.style.height = '3000px';
  });
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.wheel(60, 0);
  await page.waitForTimeout(100);
  expect((await cam(page)).x).toBeCloseTo(60, 0);
  await view.focus();
  const x0 = (await cam(page)).x;
  await page.keyboard.press('ArrowRight');
  await settled(page);
  expect((await cam(page)).x - x0).toBeCloseTo(80, 0);
  const z0 = (await cam(page)).zoom;
  await page.keyboard.press('+');
  await settled(page);
  expect((await cam(page)).zoom).toBeCloseTo(z0 * 1.25, 2);
  await page.keyboard.press('-');
  await settled(page);
  expect((await cam(page)).zoom).toBeCloseTo(z0, 2);
  // the wheel and the arrow are horizontal: scrollX is the axis they would have moved
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  // CONTROL: the page CAN scroll, so the line above is not true merely of an unscrollable page
  await page.evaluate(() => window.scrollTo(10, 10));
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([10, 10]);
});

test('29.048 reduced motion: a key press jumps with no glide and a drag release leaves no momentum', async ({ page }) => {
  await page.goto('/camera.html?reduced=1');
  const view = page.locator('#view');
  await view.focus();
  await page.keyboard.press('ArrowRight');
  // no animation frames needed: the camera is already there
  expect((await cam(page)).x).toBeCloseTo(80, 0);
  const box = (await view.boundingBox())!;
  await page.mouse.move(box.x + 500, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, { steps: 10 });
  await page.mouse.up();
  const released = await cam(page);
  await page.waitForTimeout(300);
  expect((await cam(page)).x).toBe(released.x);
  // CONTROL: the screen position of a node follows the camera exactly (translate(-x*zoom)), so the cases above read the real thing
  expect(Math.abs((await nodeLeft(page)) - (box.x - released.x))).toBeLessThan(0.5);
});

test('29.049 two touch points pinch and pan as one gesture; the world point under their midpoint follows it', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/camera.html');
  const cdp = await ctx.newCDPSession(page);
  const box = (await page.locator('#view').boundingBox())!;
  const at = (x: number, y: number, id: number) => ({ x: box.x + x, y: box.y + y, id });
  const world0 = { x: 400, y: 250 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(300, 250, 1), at(500, 250, 2)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(200, 250, 1), at(600, 250, 2)] });
  const c = await cam(page);
  expect(c.zoom).toBeGreaterThan(1.9);
  // the midpoint stayed at 400, so the world point first under it (400, 250) is still under it
  expect(c.x + 400 / c.zoom).toBeCloseTo(world0.x, 0);
  expect(c.y + 250 / c.zoom).toBeCloseTo(world0.y, 0);
  // the pan half of the gesture: both fingers slide 50 px right, the midpoint (now 450, off the view's centre) still holds world0
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(250, 250, 1), at(650, 250, 2)] });
  const d = await cam(page);
  expect(d.x + 450 / d.zoom).toBeCloseTo(world0.x, 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await ctx.close();
});
```

**Kills:**
- 29.045: (a) delete `if (vx !== 0 || vy !== 0) this.momentum = { vx, vy };` (after === during, and the strict `>` turns red) (b) `onPointerMove`: `this.cam.x -= (now.x - before.x) / this.cam.zoom` → `+=` (during.x is -200).
- 29.046: (a) `onWheel`'s zoom anchor `this.local(e)` → `{ x: this.el.clientWidth / 2, y: this.el.clientHeight / 2 }` (drift of tens of px at (420, 180)) (b) `paint()`: `${-x * zoom}px` → `${-x}px` (node 0 drawn at box.x - x, not box.x - x * 2.05) (c) delete the `if (intent.kind === 'zoom')` arm so every wheel pans (zoom stays 1: `> 1.3` turns red).
- 29.047: (a) `KEY_PAN_PX = 80` → `60` (b) `KEY_ZOOM = 1.25` → `1.5` (c) delete `e.preventDefault()` at the top of `onWheel` (the 3,000 px page scrolls 60 px: scrollX).
- 29.048: (a) `onPointerEnd`: drop `&& !(this.options.reducedMotion ?? prefersReducedMotion)()` (momentum under reduced motion) (b) `camera()`: `const reduce = options.instant === true` (the key glides: about 14–25 px read, not 80) (c) `paint()`: `translate(${-x * zoom}px` → `translate(${x * zoom}px` (the control: node 0 at box.x + 200).
- 29.049: (a) `const mid = this.pinchMid()` → `{ x: this.el.clientWidth / 2, y: this.el.clientHeight / 2 }` (the slide leg: world 425 under 450) (b) `y: this.pinch.world.y - mid.y / zoom` → `y: this.cam.y` (c) `this.pinchDistance()) / this.pinch.distance` → `this.pinch.distance) / this.pinchDistance()` (zoom 0.5).

`packages/flow-graph-browser/harness/camera.html` (new):

```html
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>camera harness</title></head>
<body style="margin:0;font-family:system-ui"><div id="view" tabindex="0" style="position:relative;width:800px;height:500px;overflow:hidden;background:#f0e9e1"><div id="layer" style="position:absolute;left:0;top:0"></div></div>
<script type="module" src="./camera.ts"></script></body></html>
```

`packages/flow-graph-browser/harness/camera.ts` (new):

```ts
import { CameraAdapter } from '@gisik-nokma/viewport';

/**
 * The Workflow graph's engine in a real browser: a 2D camera over one transformed layer. 60 world-unit squares on a grid so a
 * test can read where a world point lands on screen. `?reduced=1` forces reduced motion.
 */
const params = new URLSearchParams(location.search);
const view = document.getElementById('view') as HTMLElement;
const layer = document.getElementById('layer') as HTMLElement;
for (let i = 0; i < 60; i += 1) {
  const node = document.createElement('div');
  node.className = 'node';
  node.dataset['world'] = `${(i % 10) * 200},${Math.floor(i / 10) * 120}`;
  node.style.cssText = `position:absolute;left:${(i % 10) * 200}px;top:${Math.floor(i / 10) * 120}px;width:160px;height:80px;background:#2f5f9e`;
  layer.appendChild(node);
}
const camera = new CameraAdapter({
  element: view,
  layer,
  minZoom: 0.25,
  maxZoom: 3,
  start: { x: 0, y: 0, zoom: 1 },
  ...(params.has('reduced') ? { reducedMotion: () => true } : {}),
});
(window as unknown as { __camera: CameraAdapter }).__camera = camera;
```

  Build the package, then run: `pnpm turbo run build --filter=@gisik-nokma/viewport && slot-run.sh fgb -- pnpm --filter @gisik-nokma/flow-graph-browser exec playwright test tests/camera.spec.ts > /tmp/fgb.log 2>&1; tail -n 30 /tmp/fgb.log`. Expected: 5 tests green. The harness imports the BUILT `@gisik-nokma/viewport`, so a viewport edit needs a rebuild before the browser sees it (a stale `dist` is the usual cause of a red spec that is green in jsdom). The touch test (29.049) opens its own touch-enabled browser context.

- [ ] **Step 5: Mutation pass (own)**
  - `paint()`: `-x * zoom` to `-x` (the transform ignores the zoom) → 29.037 and 29.046.
  - `zoomAbout`: anchor taken from the viewport centre → 29.037 and 29.046.
  - the `touch-action = 'none'` line removed → 29.037 control.
  - the pixel-pan division by `zoom` removed → 29.037 control (the same delta at zoom 2).
  - `KEY_PAN_PX = 80` to `60`; Shift multiplier 4 to 2; `KEY_ZOOM = 1.25` to `1.5` → 29.038, 29.047.
  - the pinch's world point re-read at every move instead of fixed at the start → 29.038, 29.049.
  - momentum started for a rested release (drop the `releaseVelocity` zero) → 29.038 control; reduced motion ignored for the release → 29.048.
  - Record the survivors.

**Prose to sweep:** none found (searched on the ref: `CameraAdapter`, `camera.html`, `camera.spec`, `dom/camera-adapter`, `camera-adapter`, the `packages/viewport/src/index.ts` export list). Read and still true after T7: `packages/flow-graph-browser/README.md:33` (the `camera.html` row, "added by Part 1 T7"), `packages/viewport/src/wheel.ts:6` ("The CameraAdapter … uses it"), `packages/flow-graph-browser/harness/scenes.ts:61` (the flow scene moves "the way `CameraAdapter` moves it"), `packages/viewport/src/driver.ts:4` ("the Workflow graph's camera uses graph px and a unitless zoom").

- [ ] **Step 6: Flip, bullet, gate**
  - Flip ❌ to ✅ on 29.037, 29.038, 29.045–29.049; `pnpm check:citations`.
  - Features section 26: replace `<!-- wtg-part1-viewport-timeline-view T7 bullet -->` with:

```markdown
- ⚙️ **`CameraAdapter`: the free 2D camera for graphs** (Workflow and Timeline graphs Part 1 T7; cases 29.037, 29.038, 29.045–29.049; `packages/viewport/src/dom/camera-adapter.ts`, `packages/flow-graph-browser/harness/camera.*`) — one transform on one layer: wheel (`wheelIntent`), drag and touch pan with momentum, two-finger pinch about the midpoint, keys (80 px pans, 1.25x zoom), glides on the same spring, reduced motion. Part 3 drives the Workflow graph with it and Part 4 the Timeline graph; the Knowledge Graph keeps its own camera (it shares `wheelIntent` and the constants).
```

  - Run the viewport suite WHOLE and the flow-graph-browser suite WHOLE (`slot-run.sh fgb -- pnpm --filter @gisik-nokma/flow-graph-browser test > /tmp/fgb.log 2>&1; tail -n 30 /tmp/fgb.log`), typecheck, build; gate; land.


### Task 8: Day numbers and lane layout in app-core (cases 29.080–29.086)

**Branch:** `task/wtg1-layout` from `origin/release/workflow-graph` (after T4 has landed; T1 already added the app-core dependency on `@gisik-nokma/viewport`). **NEEDS:** nothing.

**Files:**
- Create: `packages/app-core/src/timeline/timeline-days.ts`, `packages/app-core/src/timeline/timeline-layout.ts`
- Create: `packages/app-core/test/timeline/timeline-days.test.ts`, `packages/app-core/test/timeline/timeline-layout.test.ts`
- Modify: `packages/app-core/src/index.ts` (export `dayNumberOf`, `isoDayOf`), `test-cases/29-workflow-timeline-graphs.md` (T8 anchor), `Features.md` (T8 bullet anchor)

**Interfaces:**
- **Consumes:** `dateMs`, `isoDate`, `DAY_MS` from `claims/dates.ts` (existing); T4's `packLane`, `packScale` (T2) and `PackItem` from `@gisik-nokma/viewport` (app-core imports the package's built `dist`: build it before the suites).
- **Produces:**
  - `dayNumberOf(isoDay: string): number` (throws `RangeError` for a string that is not a real day, as `dateMs` does) and `isoDayOf(dayNumber: number): string`; both exported from the package index
  - constants `ROW_PITCH = 40`, `BAR_HEIGHT = 28`, `LANE_HEADING = 34`, `COLUMN_WIDTH = 112`, `PIN_PX = 14`
  - `type LayoutItem = {id, key, startDay, endDay, pinned?}`, `type LayoutLane = {laneId, items}`, `type PlacedBar = {id, row, startDay, endDay}`, `type PlacedLane = {laneId, offset, extent, rows, bars}`, `type TimelineLayout = {lanes, scale, extent}`, `type Orientation`, `type KeyMeasure = (key: string | null) => number`
  - `layoutLanes(lanes, {ppd, measure, orientation?}): TimelineLayout`, `barsInRange(lane, {start, end}): PlacedBar[]`
- **Used by:** T9 (`TimelineView` lays out and mounts), T11 (portrait), T12 (the pin), and Part 4 (Home and the Timeline graph pack their lanes the same way).

**Design notes:**
- A claimed IST day becomes an integer DAY NUMBER (days since 1970-01-01; a Monday is a number that is 4 mod 7), the unit the viewport package counts in. `dateMs` reads the day as a plain UTC date, so the division by `DAY_MS` is exact and `Math.round` only absorbs float noise. This file stays clock-free like everything under `src/timeline` (it converts a day someone claimed, never the device's).
- `layoutLanes` is a pure function of its inputs: each epic lane is packed ON ITS OWN, at the BUCKETED scale `packScale(ppd)` so rows never change mid-gesture (a pinch crosses a power-of-two edge a handful of times, not every frame). The label footprint is the injected measurement of the key plus `PIN_PX` for a pinned ticket. Landscape lanes stack by `LANE_HEADING + rows x ROW_PITCH`; portrait lanes sit side by side at `rows x COLUMN_WIDTH`; a lane never has fewer than one row.
- `barsInRange` is the slice the view mounts around the visible days; bars come sorted by start day then id, so the slice is stable.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part1-viewport-timeline-view T8 -->`, insert (all ❌):

- ❌ **29.080 — 1970-01-05 is day 4 and a Monday; the round trip holds across a leap day and a year end; control: a 30th of February is refused, not rounded to a neighbour.** (`packages/app-core/test/timeline/timeline-days.test.ts`)
- ❌ **29.081 — each lane is its own packing; landscape lanes stack by 34 px heading + 40 px per row; portrait lanes sit side by side at 112 px per column; control: two lanes with the same items get the same rows | an empty lane list is a zero-height layout, and a lane never has fewer than one row.** (`packages/app-core/test/timeline/timeline-layout.test.ts`)
- ❌ **29.082 — on 50 seeds the rows of a lane equal the greatest overlap of its bars with their labels at the packing scale; control: an item order that is shuffled gives the same rows.** (`packages/app-core/test/timeline/timeline-layout.test.ts`)
- ❌ **29.083 — the key label is part of the footprint, at the bucketed scale | a one-day bar whose key needs 70 px reserves 5 days at 16 px/day, so a bar on day 3 goes to a second row; at 32 px/day the label needs 3 days and they share one row | rows are the same for every ppd inside one bucket and change only across its edge; control: 31.99 and 32 differ.** (`packages/app-core/test/timeline/timeline-layout.test.ts`)
- ❌ **29.084 — a pinned bar adds 14 px to its label footprint: 60 px of key at 16 px/day is 4 days, 74 px is 5; control: the unpinned neighbour on day 4 shares a row, the pinned one does not.** (`packages/app-core/test/timeline/timeline-layout.test.ts`)
- ❌ **29.085 — adding a bar that starts after everything changes no existing row; control: a bar that starts first can.** (`packages/app-core/test/timeline/timeline-layout.test.ts`)
- ❌ **29.086 — barsInRange returns the bars that touch the range, inclusive at both ends; control: one day outside is not returned.** (`packages/app-core/test/timeline/timeline-layout.test.ts`)

- [ ] **Step 2: The tests first (RED)**

`packages/app-core/test/timeline/timeline-days.test.ts` (new):

```ts
import { describe, expect, it } from 'vitest';
import { dayNumberOf, isoDayOf } from '../../src/timeline/timeline-days.js';

describe('29.080 a claimed day is a day number', () => {
  it('29.080 1970-01-05 is day 4 and a Monday; the round trip holds across a leap day and a year end; control: a 30th of February is refused, not rounded to a neighbour', () => {
    expect(dayNumberOf('1970-01-01')).toBe(0);
    expect(dayNumberOf('1970-01-05')).toBe(4);
    expect(dayNumberOf('2026-10-05') % 7).toBe(4); // a Monday
    for (const day of ['2024-02-29', '2026-12-31', '2027-01-01', '1999-12-31', '2026-03-29']) {
      expect(isoDayOf(dayNumberOf(day))).toBe(day);
    }
    expect(dayNumberOf('2026-03-01') - dayNumberOf('2026-02-28')).toBe(1);
    expect(dayNumberOf('2024-03-01') - dayNumberOf('2024-02-28')).toBe(2);
    expect(() => dayNumberOf('2026-02-30')).toThrow(RangeError);
  });
});
```

**Kills:**
- 29.080 a claimed day is a day number: (a) `dayNumberOf` returns `Math.round(dateMs(isoDay) / DAY_MS) - 1` (day 0 / day 4 legs) (b) `isoDayOf` returns `isoDate((dayNumber + 1) * DAY_MS)` (round-trip leg) (c) `dayNumberOf` wraps `dateMs` in `try { … } catch { return Number.NaN; }` (the 30 February control). (`Math.round` → `Math.floor` is equivalent: the division is exact.)

`packages/app-core/test/timeline/timeline-layout.test.ts` (new):

```ts
import { maxOverlap, type PackItem } from '@gisik-nokma/viewport';
import { describe, expect, it } from 'vitest';
import {
  COLUMN_WIDTH,
  LANE_HEADING,
  PIN_PX,
  ROW_PITCH,
  barsInRange,
  layoutLanes,
  type LayoutItem,
  type LayoutLane,
} from '../../src/timeline/timeline-layout.js';

const fixed = (px: number) => () => px;
const item = (id: string, startDay: number, endDay: number, key: string | null = id.toUpperCase(), pinned = false): LayoutItem => ({ id, key, startDay, endDay, pinned });

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe('29.081 lanes pack on their own and stack', () => {
  it('29.081 each lane is its own packing; landscape lanes stack by 34 px heading + 40 px per row; portrait lanes sit side by side at 112 px per column; control: two lanes with the same items get the same rows', () => {
    const a: LayoutLane = { laneId: 'a', items: [item('a1', 0, 9), item('a2', 3, 12), item('a3', 5, 6)] }; // 3 overlap on days 5-6
    const b: LayoutLane = { laneId: 'b', items: [item('b1', 0, 4), item('b2', 10, 14)] }; // 1 row
    const land = layoutLanes([a, b], { ppd: 24, measure: fixed(0) });
    expect(land.lanes.map((l) => l.rows)).toEqual([3, 1]);
    // The rows each bar was given, not only the count: a1, a2, a3 all overlap on days 5-6.
    expect(land.lanes[0]?.bars.map((bar) => [bar.id, bar.row])).toEqual([['a1', 0], ['a2', 1], ['a3', 2]]);
    // The spec's pixels as literals (34 heading, 40 pitch, 112 column): a test that re-reads the exported constants stays
    // green when a constant changes.
    expect([LANE_HEADING, ROW_PITCH, COLUMN_WIDTH]).toEqual([34, 40, 112]);
    expect(land.lanes[0]).toMatchObject({ offset: 0, extent: 34 + 3 * 40 });
    expect(land.lanes[1]).toMatchObject({ offset: 34 + 3 * 40, extent: 34 + 40 });
    expect(land.extent).toBe(34 * 2 + 4 * 40);
    const port = layoutLanes([a, b], { ppd: 24, measure: fixed(0), orientation: 'portrait' });
    expect(port.lanes.map((l) => [l.offset, l.extent])).toEqual([[0, 3 * 112], [3 * 112, 112]]);
    const twin = layoutLanes([a, { laneId: 'c', items: a.items.map((i) => ({ ...i, id: `c-${i.id}` })) }], { ppd: 24, measure: fixed(0) });
    expect(twin.lanes.map((l) => l.rows)).toEqual([3, 3]);
  });

  it('29.081 an empty lane list is a zero-height layout, and a lane never has fewer than one row', () => {
    expect(layoutLanes([], { ppd: 24, measure: fixed(0) })).toMatchObject({ lanes: [], extent: 0 });
    // Both the row count and the extent of an empty lane (planner ruling 2026-10-04): one row, and the room for one row.
    expect(layoutLanes([{ laneId: 'x', items: [] }], { ppd: 24, measure: fixed(0) }).lanes[0]).toMatchObject({ rows: 1, extent: 34 + 40 });
    expect(layoutLanes([{ laneId: 'x', items: [] }], { ppd: 24, measure: fixed(0), orientation: 'portrait' }).lanes[0]).toMatchObject({ rows: 1, extent: 112 });
  });
});

describe('29.082 the fewest rows', () => {
  it('29.082 on 50 seeds the rows of a lane equal the greatest overlap of its bars with their labels at the packing scale; control: an item order that is shuffled gives the same rows', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const r = rng(seed);
      const items = Array.from({ length: 30 }, (_, i) => {
        const s = Math.floor(r() * 50);
        return item(`i${i}`, s, s + Math.floor(r() * 8), `GN-${i}`);
      });
      const out = layoutLanes([{ laneId: 'l', items }], { ppd: 20, measure: fixed(40) });
      const packItems: PackItem[] = items.map((it) => ({ id: it.id, key: it.key, segments: [{ start: it.startDay, end: it.endDay }] }));
      expect(out.lanes[0]?.rows, `seed ${seed}`).toBe(maxOverlap(packItems, { ppd: out.scale, labelPx: () => 40 }));
      const shuffled = layoutLanes([{ laneId: 'l', items: [...items].reverse() }], { ppd: 20, measure: fixed(40) });
      expect(shuffled.lanes[0]?.bars.map((b) => [b.id, b.row])).toEqual(out.lanes[0]?.bars.map((b) => [b.id, b.row]));
    }
  });
});

describe('29.083 the key label is part of the footprint, at the bucketed scale', () => {
  const lane = (): LayoutLane => ({ laneId: 'l', items: [item('a', 0, 0, 'GN-123'), item('b', 3, 6, 'GN-124')] });

  it('29.083 a one-day bar whose key needs 70 px reserves 5 days at 16 px/day, so a bar on day 3 goes to a second row; at 32 px/day the label needs 3 days and they share one row', () => {
    expect(layoutLanes([lane()], { ppd: 16, measure: fixed(70) }).lanes[0]?.rows).toBe(2);
    expect(layoutLanes([lane()], { ppd: 32, measure: fixed(70) }).lanes[0]?.rows).toBe(1);
  });

  it('29.083 rows are the same for every ppd inside one bucket and change only across its edge; control: 31.99 and 32 differ', () => {
    const rowsAt = (ppd: number) => layoutLanes([lane()], { ppd, measure: fixed(70) }).lanes[0]?.bars.map((b) => b.row).join(',');
    for (const ppd of [16, 17.3, 24, 31.99]) expect(rowsAt(ppd)).toBe(rowsAt(16));
    expect(rowsAt(31.99)).not.toBe(rowsAt(32));
    expect(layoutLanes([lane()], { ppd: 24, measure: fixed(70) }).scale).toBe(16);
  });
});

describe('29.084 the paper pin', () => {
  it('29.084 a pinned bar adds 14 px to its label footprint: 60 px of key at 16 px/day is 4 days, 74 px is 5; control: the unpinned neighbour on day 4 shares a row, the pinned one does not', () => {
    expect(PIN_PX).toBe(14);
    const make = (pinned: boolean): LayoutLane => ({ laneId: 'l', items: [item('a', 0, 0, 'GN-1', pinned), item('b', 4, 6, 'GN-2')] });
    expect(layoutLanes([make(false)], { ppd: 16, measure: fixed(60) }).lanes[0]?.rows).toBe(1);
    expect(layoutLanes([make(true)], { ppd: 16, measure: fixed(60) }).lanes[0]?.rows).toBe(2);
    // Exactly 14 px, by behaviour: 50 + 14 = 64 px is 4 days at 16 px/day (one row), 51 + 14 = 65 px is 5 (two rows).
    // 13 px would put 51 in one row; 15 px would put 50 in two.
    expect(layoutLanes([make(true)], { ppd: 16, measure: fixed(50) }).lanes[0]?.rows).toBe(1);
    expect(layoutLanes([make(true)], { ppd: 16, measure: fixed(51) }).lanes[0]?.rows).toBe(2);
    expect(layoutLanes([make(false)], { ppd: 16, measure: fixed(51) }).lanes[0]?.rows).toBe(1);
  });
});

describe('29.085 stability', () => {
  it('29.085 adding a bar that starts after everything changes no existing row; control: a bar that starts first can', () => {
    const items = Array.from({ length: 20 }, (_, i) => item(`i${i}`, i * 2, i * 2 + 5, `GN-${i}`));
    const before = layoutLanes([{ laneId: 'l', items }], { ppd: 24, measure: fixed(40) }).lanes[0]?.bars;
    // Non-empty, and the bars really sit in different rows (each spans 6 days and one starts every 2: rows 0, 1, 2 in turn),
    // so "no row changed" below is a claim about three rows, not about one row every bar shares.
    expect(before?.map((bar) => bar.row).join('')).toBe('01201201201201201201');
    const later = layoutLanes([{ laneId: 'l', items: [...items, item('later', 900, 904, 'GN-900')] }], { ppd: 24, measure: fixed(40) }).lanes[0]?.bars;
    for (const bar of before ?? []) expect(later?.find((b) => b.id === bar.id)?.row).toBe(bar.row);
    const first = layoutLanes([{ laneId: 'l', items: [item('first', -5, 100, 'GN-0'), ...items] }], { ppd: 24, measure: fixed(40) }).lanes[0]?.bars;
    expect((before ?? []).some((bar) => first?.find((b) => b.id === bar.id)?.row !== bar.row)).toBe(true);
  });
});

describe('29.086 what is mounted', () => {
  it('29.086 barsInRange returns the bars that touch the range, inclusive at both ends; control: one day outside is not returned', () => {
    const out = layoutLanes([{ laneId: 'l', items: [item('a', 0, 4), item('b', 5, 9), item('c', 10, 14), item('d', 20, 25)] }], { ppd: 24, measure: fixed(0) });
    const lane = out.lanes[0]!;
    expect(barsInRange(lane, { start: 5, end: 10 }).map((b) => b.id)).toEqual(['b', 'c']);
    expect(barsInRange(lane, { start: 4, end: 4 }).map((b) => b.id)).toEqual(['a']);
    expect(barsInRange(lane, { start: 15, end: 19 })).toEqual([]);
    expect(barsInRange(lane, { start: 25, end: 30 }).map((b) => b.id)).toEqual(['d']);
    expect(barsInRange(lane, { start: 26, end: 30 })).toEqual([]);
    // The slice is in start-day order, then id: ids that sort the other way, and a tie on day 5.
    const mixed = layoutLanes([{ laneId: 'm', items: [item('z', 0, 2), item('y', 5, 6), item('x', 5, 8)] }], { ppd: 24, measure: fixed(0) }).lanes[0]!;
    expect(barsInRange(mixed, { start: 0, end: 10 }).map((b) => b.id)).toEqual(['z', 'x', 'y']);
  });
});
```

**Kills:**
- 29.081 lanes pack on their own and stack: (a) hoist the pack items out of the `for (const lane of lanes)` loop so every lane packs the items of all lanes so far (lane b gets 3 rows) (b) `LANE_HEADING = 34` to `30`, `ROW_PITCH = 40` to `36` or `COLUMN_WIDTH = 112` to `100` (c) `const portrait = options.orientation !== 'portrait'`.
- 29.081 an empty lane list is a zero-height layout, and a lane never has fewer than one row: (a) drop the `max(1, …)` (`const rows = result.rows`; the empty lane reads `rows: 0` and `extent: 34`, and in portrait `extent: 0`; planner ruling 2026-10-04) (b) push `rows: result.rows` while the extent keeps `rows` (only the `rows: 1` leg goes red) (c) start `cursor` at `LANE_HEADING`.
- 29.082 on 50 seeds the rows equal the greatest overlap: (a) `labelPx: () => 0` ignoring `options.measure` (23 of the 50 seeds differ) (b) pack at `ppd: options.ppd` instead of `scale` while still returning `scale` (19 seeds differ) (c) delete the `.sort(…)` on `bars` (the reversed input keeps its own order, so the shuffled leg differs).
- 29.083 a one-day bar whose key needs 70 px: (a) `labelPx` returns `PIN_PX` instead of the measured width (b) `ppd: scale` to `ppd: 64`.
- 29.083 rows are the same for every ppd inside one bucket: (a) pack at `ppd: options.ppd` (24 px/day gives "0,0") (b) `const scale = options.ppd` (the scale leg) (c) `row: result.rowOf.get(item.id) ?? 0` to `row: 0` (31.99 and 32 both "0,0").
- 29.084 a pinned bar adds 14 px: (a) remove the `+ (source?.pinned === true ? PIN_PX : 0)` term (b) `PIN_PX = 14` to `13` (the 51 leg) or `15` (the 50 leg) (c) add `PIN_PX` to every item, pinned or not (the unpinned 60 and 51 legs go to two rows).
- 29.085 adding a bar that starts after everything changes no existing row: (a) `row: result.rowOf.get(item.id) ?? 0` to `row: 0` (the precondition and the control) (b) look rows up by position, `row: result.rowOf.get(lane.items[0]!.id) ?? 0` (every bar row 0). Otherwise it guards T4's first fit by start through the layout.
- 29.086 barsInRange returns the bars that touch the range: (a) `bar.endDay >= range.start` to `>` (the day-4 leg) (b) `bar.startDay <= range.end` to `<` (`c` drops from 5-10) (c) sort `bars` by id only, or by start day only (the `['z', 'x', 'y']` leg).


  Build the package app-core reads, then run: `pnpm turbo run build --filter=@gisik-nokma/viewport && slot-run.sh ac -- pnpm --filter @gisik-nokma/app-core exec vitest run test/timeline/timeline-days.test.ts test/timeline/timeline-layout.test.ts --maxWorkers=2 > /tmp/ac.log 2>&1; tail -n 20 /tmp/ac.log`. Expected: FAIL (modules missing).

- [ ] **Step 3: The day numbers and the layout**

`packages/app-core/src/timeline/timeline-days.ts` (new):

```ts
import { DAY_MS, dateMs, isoDate } from '../claims/dates.js';

/**
 * An IST calendar day as a day NUMBER: days since 1970-01-01, the unit `@gisik-nokma/viewport` counts in
 * (a Monday is a number that is 4 mod 7). `dateMs` reads the claimed day as a plain UTC date, so the division is
 * exact and `Math.round` only absorbs float noise. A string that is not a real day throws `RangeError`, like `dateMs`.
 *
 * Clock-free like everything under `src/timeline`: it converts a day someone claimed and never reads the device.
 */
export function dayNumberOf(isoDay: string): number {
  return Math.round(dateMs(isoDay) / DAY_MS);
}

/** The inverse: a day number back to its `YYYY-MM-DD` day. */
export function isoDayOf(dayNumber: number): string {
  return isoDate(dayNumber * DAY_MS);
}
```

`packages/app-core/src/timeline/timeline-layout.ts` (new):

```ts
import { packLane, packScale, type PackItem } from '@gisik-nokma/viewport';

/** The row pitch and bar height of the time views (spec TG-13: a 28 px bar in a 40 px pitch, 12 px of gap). */
export const ROW_PITCH = 40;
export const BAR_HEIGHT = 28;
/** A lane's heading row (the mockup's 34 px). */
export const LANE_HEADING = 34;
/** Portrait (PK-7): a lane's column is `rows x COLUMN_WIDTH` wide; time runs down. */
export const COLUMN_WIDTH = 112;
/** TG-11: the paper pin adds this much to a key's label footprint. */
export const PIN_PX = 14;

export type LayoutItem = {
  id: string;
  key: string | null;
  /** Day numbers (see `timeline-days.ts`), inclusive. */
  startDay: number;
  endDay: number;
  /** The ticket has a note or an attachment (TG-11): the pin is part of the label footprint. */
  pinned?: boolean;
};
export type LayoutLane = { laneId: string; items: readonly LayoutItem[] };
export type PlacedBar = { id: string; row: number; startDay: number; endDay: number };
export type PlacedLane = {
  laneId: string;
  /** Landscape: the lane's top in px. Portrait: its left. */
  offset: number;
  /** Landscape: the lane's height in px (heading + rows). Portrait: its width (rows x 112). */
  extent: number;
  /** The rows the lane occupies; at least 1, an empty lane included (planner ruling 2026-10-04). */
  rows: number;
  /** Sorted by start day, then id: stable for the virtualised slice. */
  bars: PlacedBar[];
};
export type TimelineLayout = {
  lanes: PlacedLane[];
  /** The packing scale the rows were computed at (a power of two, 4 to 64). Rows change only when this does. */
  scale: number;
  /** Total px along the cross axis (landscape: height under the axis; portrait: width). */
  extent: number;
};
export type Orientation = 'landscape' | 'portrait';

/** The width in px of a key's label along the time axis. Injected: the view caches a canvas measurement. */
export type KeyMeasure = (key: string | null) => number;

/**
 * Packs every lane (PK-1 to PK-6) and stacks them: one lane per epic, each packed on its own, at the BUCKETED scale
 * `packScale(ppd)` so rows never change mid-gesture. A pure function of its inputs: the same lanes at the same bucket give
 * the same rows on every device.
 */
export function layoutLanes(
  lanes: readonly LayoutLane[],
  options: { ppd: number; measure: KeyMeasure; orientation?: Orientation },
): TimelineLayout {
  const scale = packScale(options.ppd);
  const portrait = options.orientation === 'portrait';
  let cursor = 0;
  const placed: PlacedLane[] = [];
  for (const lane of lanes) {
    const byId = new Map(lane.items.map((item) => [item.id, item]));
    const packItems: PackItem[] = lane.items.map((item) => ({
      id: item.id,
      key: item.key,
      segments: [{ start: item.startDay, end: item.endDay }],
    }));
    const result = packLane(packItems, {
      ppd: scale,
      labelPx: (item) => {
        const source = byId.get(item.id);
        return options.measure(item.key) + (source?.pinned === true ? PIN_PX : 0);
      },
    });
    const bars = lane.items
      .map((item): PlacedBar => ({ id: item.id, row: result.rowOf.get(item.id) ?? 0, startDay: item.startDay, endDay: item.endDay }))
      .sort((a, b) => a.startDay - b.startDay || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    // A lane never has fewer than one row, an empty lane included: `rows` and `extent` agree (planner ruling 2026-10-04).
    const rows = Math.max(1, result.rows);
    const extent = portrait ? rows * COLUMN_WIDTH : LANE_HEADING + rows * ROW_PITCH;
    placed.push({ laneId: lane.laneId, offset: cursor, extent, rows, bars });
    cursor += extent;
  }
  return { lanes: placed, scale, extent: cursor };
}

/** The bars of a lane that touch [range.start, range.end] (inclusive): what the view mounts. */
export function barsInRange(lane: PlacedLane, range: { start: number; end: number }): PlacedBar[] {
  return lane.bars.filter((bar) => bar.endDay >= range.start && bar.startDay <= range.end);
}
```

- [ ] **Step 4: Export the day helpers**

`packages/app-core/src/index.ts`:

```diff
--- a/packages/app-core/src/index.ts
+++ b/packages/app-core/src/index.ts
@@ -297,6 +297,7 @@
 // the component reads it, and its own test measures the shift by the columns
 // that move rather than by re-stating the constant.
 export { TimelineView, type TimelineViewProps } from './timeline/timeline-view.js';
+export { dayNumberOf, isoDayOf } from './timeline/timeline-days.js';
 // Plan 9 Task 12 — the inbox. Named exports with the `.js` extension, matching
 // every block above; `export *` (which the plan's draft writes five times)
 // would re-export this module's internals — `PATHS`, `sinceDay`, `CAP` — as
```

  (`layoutLanes` and the constants stay internal to the package until Part 4 needs them: the view imports them by path.) Run the two files (expected 9 tests green: 1 in `timeline-days.test.ts`, 8 in `timeline-layout.test.ts`) and `pnpm --filter @gisik-nokma/app-core typecheck`.

- [ ] **Step 5: Mutation pass (own)**
  - `dayNumberOf`: `Math.round` to `Math.floor` (a float below `.5` noise would flip) is expected to SURVIVE for exact `DAY_MS` division; record it as equivalent. Drop the `RangeError` (return `NaN`) → 29.080's control.
  - `layoutLanes`: use `options.ppd` instead of `scale` for packing → 29.083 (bucket case); `LANE_HEADING = 34` to `30`; `ROW_PITCH = 40` to `36`; `COLUMN_WIDTH = 112` to `100` → 29.081; `PIN_PX = 14` to `10` → 29.084; drop `Math.max(1, ...)` (one `rows` now feeds both `rows` and `extent`; planner ruling 2026-10-04) → 29.081 empty-lane case; remove the `pinned` addition → 29.084; sort `bars` by id only → 29.085/29.086 if they read order.
  - `barsInRange`: `>=` to `>` or `<=` to `<` → 29.086 (inclusive at both ends).

**Prose to sweep:** none found (searched on the ref: `day number`, `dayNumberOf`, `timeline-days`, `layoutLanes` in `packages/app-core/src`, `packages/viewport/src`, `Features.md`, `test-cases/29-workflow-timeline-graphs.md`; the comment block above the new export at `packages/app-core/src/index.ts:293-298` describes `TimelineView` only and stays true; the clock scan's prose in `packages/app-core/test/calendar/clock-free.test.ts:208-217` names roots, not files). T8 adds files and one export line; nothing it changes is described elsewhere yet.

- [ ] **Step 6: Flip, bullet, gate**
  - Flip ❌ to ✅ on 29.080–29.086; `pnpm check:citations`.
  - Features section 26: replace `<!-- wtg-part1-viewport-timeline-view T8 bullet -->` with:

```markdown
- ⚙️ **Timeline day numbers and lane layout** (Workflow and Timeline graphs Part 1 T8; cases 29.080–29.086; `packages/app-core/src/timeline/{timeline-days,timeline-layout}.ts`) — `dayNumberOf` / `isoDayOf` convert an IST `YYYY-MM-DD` day to the integer day number the viewport package counts in (days since 1970-01-01; a Monday is 4 mod 7) and back; a string that is not a real day throws `RangeError`, as `dateMs` does. `layoutLanes` packs each epic lane on its own at the bucketed scale `packScale(ppd)` (so rows never change mid-gesture), reserving a key's measured label width plus 14 px for a paper pin, and stacks the lanes: landscape lanes by a 34 px heading plus 40 px per row, portrait lanes side by side at 112 px per column. Pure and clock-free; `barsInRange` is what the view mounts.
```

  - The app-core suite WHOLE (`slot-run.sh ac -- pnpm --filter @gisik-nokma/app-core exec vitest run --maxWorkers=2 > /tmp/ac.log 2>&1; tail -n 20 /tmp/ac.log`), `pnpm turbo run typecheck --filter=@gisik-nokma/app-core...`, gate, land.


### Task 9: The continuous Timeline: model, view, stylesheet, token, retirements, the radio variant (cases 29.087, 29.093–29.107)

**Branch:** `task/wtg1-cutover` from `origin/release/workflow-graph` (after T6 and T8 have landed; it also needs T2's wheel constants through the adapter). **NEEDS:** `frontend-design` named in the lane prompt (UI work). The real-browser proof of this task is T10; this task looks at the page through the T1 harness (step 9).

**Files:**
- Modify: `packages/app-core/src/timeline/timeline-model.ts` (rewrite of the placement: day numbers, no window), `packages/app-core/src/timeline/timeline-view.tsx` (rewrite: one scroller), `packages/app-core/src/claims/claim-labels.ts` (drop `TIMELINE_OUT_OF_WINDOW_COPY`, reword `TIMELINE_EMPTY_COPY`), `packages/app-core/src/index.ts` (drop `TIMELINE_OUT_OF_WINDOW_COPY`, `TimelineBarSpan`, `TimelineWeekCol`)
- Modify: `packages/ui/src/ui.css` (`.gn-timeline*`), `packages/ui/src/tokens.ts` (`timelineWeekend`), `packages/ui/src/components/segmented-control.tsx` (the `variant="radio"` member; planner ruling P5: this task, its first user, OWNS it and Part 4 T5 consumes it)
- Modify tests: `packages/app-core/test/timeline/{timeline-model.test.ts,timeline-view.test.tsx}`, `packages/app-core/test/views/phone-project-views-hooks.test.tsx`, `packages/app-core/test/calendar/clock-free.test.ts`, `packages/ui/test/{tokens,neo-hk4-field-rim,styling-b8-timeline}.test.ts`, `apps/web/test/{phone-project-views,project-views-ux}.test.ts`
- Create: `packages/ui/test/timeline-continuous.test.ts`, `packages/ui/test/segmented-control-radio.test.tsx` (29.087)
- Modify docs and catalogue: `docs/manual.md`, `docs/faq.md`, `packages/app-core/src/help/content.generated.ts` (regenerated), `test-cases/{11-calendar-notifications,13-board-prototype-port,20-styling-system,21-mobile-web,23-ux-fixes}.md`, `test-cases/29-workflow-timeline-graphs.md` (T9 anchor), `Features.md` (Timeline bullets and the T9 bullet anchor)

**Interfaces:**
- **Consumes:** T6 `ScrollAdapter`, T2 `ZOOM_PRESETS`, `presetOf`, `axisLevels`, `crossFade`, `isMonday`, `isWeekend`, `mondayOnOrBefore`; T3 `mountRange`, `panLimits`, `DayRange`; T8 `dayNumberOf`, `isoDayOf`, `layoutLanes`, `barsInRange`, `KeyMeasure`; `SegmentedControl` from `@gisik-nokma/ui`.
- **Produces:**
  - `TimelineRow` now carries `key: string | null`, `startDay: number`, `endDay: number` (day numbers, inclusive, never clipped) instead of `bar` / `days`; `TimelineModel` carries `todayDay: number | null` (a day NUMBER, no longer a column index), `firstDay`, `lastDay` (the extent of what is drawn, or `null`), and no `weeks`; `TimelineModelOptions` loses `anchor` and `weeksCount`. `TimelineViewProps` is unchanged (`tickets`, `today`, `userName`, `onOpenTicket`, `filter?`, `laneEpicId?`, `isEpicType?`, `hideEpicRows?`).
  - The class contract the stylesheet and later tasks key on: `.gn-timeline` > `.gn-timeline__toolbar` + `.gn-timeline__stage` > `.gn-timeline__canvas` (the scroller) > `.gn-timeline__surface` > `.gn-timeline__axis` + `.gn-timeline__today` + `.gn-timeline__lane` > `.gn-timeline__row` > `.gn-timeline__bar`. Custom properties: `--tl-ppd` (px per day, on the canvas), `--d0` / `--dn` / `--row` (a bar's first day, length in days and packed row), `--lane-offset` / `--lane-extent`, `--tl-fade-days` / `--tl-fade-weeks`, `--tl-overshoot`.
  - Token `timelineWeekend` (`--gn-timeline-weekend`), opaque, with the contrast pair `textMuted` on it at 4.5.
  - `SegmentedControl` gains `variant?: 'tabs' | 'radio'` (default `'tabs'`; `'radio'` renders `role="radiogroup"` / `radio` / `aria-checked`). The Timeline zoom switch uses it (VP-10). Part 4 T5 and T7 consume it and add no variant of their own.
  - Removed public surface: `TIMELINE_OUT_OF_WINDOW_COPY`, `TimelineBarSpan`, `TimelineWeekCol`, `TimelineBarDays`.
- **Used by:** T10 (browser proof), T11 (portrait and the pill), T12 (the pin), Part 4 (Home reuses the axis idea).

**Design notes (read the spec's TV-1 to TV-11 first):**
- **The claims semantics do not change.** A bar needs BOTH claims; the five side-list reasons (`no-dates`, `start-only`, `due-only`, `start-after-due`, `unplaceable-day`) and the three headings are the model's, rendered verbatim; epic lanes, `hideEpicRows`, custom claims beside the ticket, provenance, the in-transit `data-pending` mark, the `aria-describedby` description (the accessible NAME is the ticket title alone). What changes is where a bar goes: by DAY NUMBER on a continuous axis, never clipped, never out of window.
- **Where the scale lives.** `--tl-ppd` on the canvas is the only scale. A bar's `left` and `width` are CSS `calc()`s of `--d0`, `--dn` and `--tl-ppd` (the stylesheet), so a zoom frame is one custom-property write and one scroll write: React does not render on a pinch. React re-renders on three slow events only: the data changes, the zoom SETTLES (rows may re-pack at the next bucket, PK-4), or the view nears the edge of the mounted band (PR-5).
- **What is mounted.** With a measured width, only the bars in `[visible - V, visible + V]` (`mountRange`), refreshed when the view reaches a quarter of the band's edge; with no measured width (jsdom, a hidden tab) every bar is mounted. `TimelineBar` is `React.memo`: a refresh renders only the bars that are new (Review Focus 4).
- **Far from today (Review Focus 5).** The pan range is `panLimits(drawn, today, viewportDays)`: the drawn extent plus a viewport either side, never narrower than today +/- 56 days. Dated work a year away is drawn and reachable by scrolling; an unrepresentable day (2026-02-30) is a side-list entry (`unplaceable-day`), and `todayDay` is `null` for a day that is not real.
- **Axis (VP-11):** a sticky two-row header: period labels (month names below 16 px/day, "W 28 Sep" on Mondays from 16) and day numbers (cross-faded in around 20 px/day via `--tl-fade-days`); weekend columns are tinted from 16 px/day by the opaque role `timelineWeekend` as a repeating background tile of seven days (`calc(var(--tl-ppd) * 7px)`), switched off at Month zoom by `data-weekend='off'`.
- **Toolbar (VP-10):** Today and a Day | Week | Month switch (`SegmentedControl variant="radio"`, a radio group as VP-10 asks; a free zoom marks none). No element named Earlier, Later, Previous or Next exists.
- **Status is never colour alone (TG-14):** a finished ticket's bar carries a check, one in progress a play mark, one not started nothing; the description says it in words.
- **The key (TV-5):** inside the bar when it fits, otherwise just outside its end (`outside = barPx < measure(key)`); `measure` is a cached `OffscreenCanvas` measurement with a 6.5 px per character estimate where there is none (jsdom).
- **Retirements:** the paged grid took nine catalogue pins with it (11.55, 11.56, 11.74, 11.79, 11.82, 13.474, 13.477, 21.113, 23.142). They become 🚫 lines naming the Part 1 id that replaced them; 11.75 and 20.271 stay ✅ but are amended (step 10). 29.119 (T13) checks all of them.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part1-viewport-timeline-view T9 -->`, insert (all ❌):

- ❌ **29.093 — the row carries the claimed days as day numbers (1970-01-05 is day 4): a one-day period is startDay === endDay; a real leap day is placed | both claims and their two authors still make one row with the exact provenance sentence.** (`packages/app-core/test/timeline/timeline-model.test.ts`)
- ❌ **29.094 — a ticket dated a year before, and one dated a year after, are both rows; none is side-listed; the extent spans them (firstDay / lastDay).** (`packages/app-core/test/timeline/timeline-model.test.ts`)
- ❌ **29.095 — dated work a year away is DRAWN, not described: no sentence, a bar | 11.61 the empty timelines (one sentence since the window went: 29.095) | the empties are ONE distinct model; a model with a row is another.** (`packages/app-core/test/timeline/timeline-view.test.tsx`, `packages/app-core/test/timeline/timeline-model.test.ts`)
- ❌ **29.096 — any calendar day is a number, however far from the rows; no today (or not a calendar day) is null.** (`packages/app-core/test/timeline/timeline-model.test.ts`)
- ❌ **29.097 — --dn is the length in days, both ends included: Mon-Wed is 3, Mon-Fri 5, a one-day bar 1; the day numbers ride on the bar | there is no window: work a year before and a year after is drawn, with the surface long enough to hold it | no stylesheet number leaks into the markup: the scale is one custom property on the canvas, and no inline grid template exists.** (`packages/app-core/test/timeline/timeline-view.test.tsx`)
- ❌ **29.098 — two bars that share a day take two rows, two that only touch take one, and the lane is as tall as its rows; control: a third overlap adds a row.** (`packages/app-core/test/timeline/timeline-view.test.tsx`)
- ❌ **29.099 — there are no pages: no Earlier / Later, a Today button, a zoom switch and a two-row axis | the toolbar is Today and a Day | Week | Month switch with Week marked; Earlier and Later are gone (control: Today is there) | the axis has a period row with a W label on each Monday and a day-number row; a weekend day carries the mark.** (`packages/app-core/test/timeline/timeline-view.test.tsx`)
- ❌ **29.100 — a wide bar shows the key inside; a one-day bar shows it just outside its end; the name is the title alone and the description has the key | a finished ticket carries a check, one in progress a play mark, one not started none; the description says it in words.** (`packages/app-core/test/timeline/timeline-view.test.tsx`)
- ❌ **29.101 — one line, aria-hidden, at today's day number; a different prop moves it; an invalid day draws none.** (`packages/app-core/test/timeline/timeline-view.test.tsx`)
- ❌ **29.102 — with a measured width the mounted bars are the viewport and one viewport either side; with none (jsdom, a hidden tab) every bar is mounted | a view that re-renders without new data re-renders none of its bars | the bar is a React.memo component imported from react, so a moving / resting flip of the view does not re-render 2,000 bars (measured: a 33 ms stall without it, 9.4 ms with); control: the scan finds a planted un-memoised bar | re-rendering the view with the same tickets, today and handlers draws no bar again (the pan loop re-renders the view on every moving / resting flip); control: a changed ticket list does draw them again.** (`packages/app-core/test/timeline/timeline-view.test.tsx`)
- ❌ **29.103 — the claim list sits in the bar's row, outside the bar, with the model's label; a bar with none has no list.** (`packages/app-core/test/timeline/timeline-view.test.tsx`)
- ❌ **29.104 — 24.121 no CONTRAST_PAIRS row names fieldRim; the roster is 53 (56 minus the four, plus one for the weekend tint, 29.104) | the weekend tint is one opaque role whose day numbers clear 4.5:1 in every style and theme | the role is declared, opaque and exported; textMuted on it is a declared pair at 4.5; control: a translucent tint would fail the opaque check.** (`packages/ui/test/neo-hk4-field-rim.test.ts`, `packages/ui/test/timeline-continuous.test.ts`)
- ❌ **29.105 — no Earlier / Later, SHIFT_DAYS, weeksCount, anchor option or week-column grid remains in the timeline source or in ui.css; control: the scan finds a planted one.** (`packages/app-core/test/timeline/timeline-view.test.tsx`)
- ❌ **29.106 — the Timeline stylesheet is the continuous canvas: one scroller, packed 28 px bars, no paging | the canvas scrolls and contains its overscroll; the bar is 28 px on a 40 px pitch; the axis is sticky; rows are transparent to layout | nothing of the paged grid survives: no weeks band, no header grid, no zebra, no clipped edges, no phone arm for the timeline | the Today pill keeps the quiet nav treatment; reduced motion stops the re-pack glide.** (`packages/ui/test/timeline-continuous.test.ts`)
- ❌ **29.107 — the Timeline carries the classes its scroller and its portrait rules key on | .gn-timeline > toolbar + stage > canvas > surface > axis, and under a lane the .gn-timeline__row wrappers (21.113, retitled: the week band and the column template are gone).** (`packages/app-core/test/views/phone-project-views-hooks.test.tsx`)
- ❌ **29.087 — VP-10's zoom switch is a radio group: `SegmentedControl` with `variant="radio"` renders `role="radiogroup"`, each option `role="radio"` with `aria-checked`, the roving tabindex and ArrowRight/ArrowLeft moving AND selecting; control (same `it()`): the default variant still renders `tablist` / `tab` / `aria-selected`, so every existing render site is unchanged; the Timeline zoom switch is the radio group named `Timeline zoom`.** Mutation: render `role="tablist"` for `'radio'` → the radio assertion reds. (`packages/ui/test/segmented-control-radio.test.tsx`, `packages/app-core/test/timeline/timeline-view.test.tsx`)

- [ ] **Step 2: The tests first (RED)**

  **The radio variant (29.087; planner ruling P5).** `grep -n "radiogroup" -r packages/ui/src packages/app-core/src apps/web/src` must print nothing on the base (else consume it and say so). Test first in `packages/ui/test/segmented-control-radio.test.tsx`: render `SegmentedControl` with `variant="radio"` and three options, assert `radiogroup` / `radio` / `aria-checked`, ArrowRight moves focus and selects; in the SAME `it()`, the control: the default variant renders `tablist` / `tab` / `aria-selected`. Then add `variant?: 'tabs' | 'radio'` (default `'tabs'`, so every existing render site is byte-identical) to `packages/ui/src/components/segmented-control.tsx` (it renders `role="tablist"` at `:130` and `role="tab"` at `:147` on the KG tip; re-read it): when `'radio'` the root is `role="radiogroup"`, each button `role="radio"` with `aria-checked={on}` instead of `aria-selected`, the roving tabindex and arrow keys unchanged, the same classes. Run the `packages/ui` and `apps/web` suites whole (a role change can move an accessible-name ratchet). Flip 29.087 in the commit that lands the test and the variant.

  **Kills** (the `variant` edit to `segmented-control.tsx`): 29.087: (a) render `role="tablist"` for `'radio'` (b) set `aria-selected` instead of `aria-checked` on a radio (c) ArrowRight moves focus without calling `onChange` (the "moving AND selecting" leg); the same-`it()` control reds on (d) `role="radiogroup"` for the default variant too.

  The test diffs are unified diffs against the files at `origin/release/workflow-graph`; apply each with `patch -p1` from the repo root (save the fenced text, `patch -p1 --no-backup-if-mismatch < file`) or by hand. Controls live in the same `it()` as the case.

`packages/app-core/test/timeline/timeline-model.test.ts`:

```diff
--- a/packages/app-core/test/timeline/timeline-model.test.ts
+++ b/packages/app-core/test/timeline/timeline-model.test.ts
@@ -2,12 +2,12 @@
 import type { TicketState } from '@gisik-nokma/domain';
 import {
   TIMELINE_EMPTY_COPY,
-  TIMELINE_OUT_OF_WINDOW_COPY,
   TIMELINE_SIDE_LIST_COPY,
   TIMELINE_SIDE_LIST_NO_DATES_COPY,
   TIMELINE_SIDE_LIST_UNDRAWABLE_COPY,
 } from '../../src/claims/claim-labels.js';
 import type { TicketDatesInput } from '../../src/claims/ticket-dates.js';
+import { dayNumberOf } from '../../src/timeline/timeline-days.js';
 import {
   NO_DATES_NOTE,
   NO_DAY_CLAIMS_NOTE,
@@ -67,21 +67,14 @@
   };
 }
 
-/**
- * Sunday. The window therefore opens on the Monday BEFORE the anchor —
- * 17 Aug — and eight columns reach the Sunday 11 Oct. Both of those days are
- * fixtures below, and so is the day either side of each.
- */
-const ANCHOR = '2026-08-23';
-const WINDOW_START = '2026-08-17';
-const WINDOW_END = '2026-10-11';
-const LAST_WEEK = 7;
+/** The injected today: a Sunday. The chart has no window, so it only places the today line. */
+const TODAY = '2026-08-23';
 
 function model(
   inputs: TicketDatesInput[],
   extra: Partial<Parameters<typeof buildTimelineModel>[1]> = {},
 ): TimelineModel {
-  return buildTimelineModel(inputs, { anchor: ANCHOR, userName, ...extra });
+  return buildTimelineModel(inputs, { today: TODAY, userName, ...extra });
 }
 
 function allRows(m: TimelineModel): TimelineRow[] {
@@ -161,7 +154,7 @@
 
   it('start EQUAL to due is a period of one day, not a contradiction', () => {
     const row = onlyRow(model([dated('2026-08-24', '2026-08-24', 'Same day')]));
-    expect(row.bar).toEqual({ fromWeek: 1, toWeek: 1, clippedStart: false, clippedEnd: false });
+    expect([row.startDay, row.endDay]).toEqual([dayNumberOf('2026-08-24'), dayNumberOf('2026-08-24')]);
   });
 });
 
@@ -322,134 +315,34 @@
       ]),
     );
     // The bar is untouched, and the bad day is printed verbatim beside it.
-    expect(row.bar).toEqual({ fromWeek: 1, toWeek: 1, clippedStart: false, clippedEnd: false });
+    expect([row.startDay, row.endDay]).toEqual([dayNumberOf('2026-08-24'), dayNumberOf('2026-08-28')]);
     expect(row.customClaims.map((item) => item.label)).toEqual([
       "Filed on: 2026-02-30, Kiro's claim",
     ]);
   });
 
   it('a real leap day is placed, not refused — the guard is about days, not about February', () => {
-    const row = onlyRow(model([dated('2028-02-29', '2028-03-07', 'Leap')], { anchor: '2028-02-29' }));
-    expect(row.bar).toEqual({ fromWeek: 0, toWeek: 1, clippedStart: false, clippedEnd: false });
-  });
-});
-
-describe('11.55 the window, at both of its ends and one day either side', () => {
-  it('is 8 Monday-start weeks with W-labels', () => {
-    const m = model([]);
-    expect(m.weeks).toHaveLength(8);
-    expect(m.weeks[0]).toEqual({ start: WINDOW_START, label: 'W 17 Aug' });
-    expect(m.weeks[1]!.start).toBe('2026-08-24');
-    expect(m.weeks[LAST_WEEK]).toEqual({ start: '2026-10-05', label: 'W 5 Oct' });
-  });
-
-  it('an anchor already ON a Monday opens that same week, not the one before', () => {
-    const m = model([], { anchor: '2026-08-17' });
-    expect(m.weeks[0]!.start).toBe('2026-08-17');
-  });
-
-  it('the week boundary is Sunday|Monday, pinned on both days', () => {
-    // 23 Aug is the anchor Sunday: still week 0. 24 Aug is week 1.
-    expect(onlyRow(model([dated('2026-08-23', '2026-08-23')])).bar.fromWeek).toBe(0);
-    expect(onlyRow(model([dated('2026-08-24', '2026-08-24')])).bar.fromWeek).toBe(1);
-  });
-
-  it('a start ON the window start is not clipped; one day earlier is', () => {
-    const on = onlyRow(model([dated(WINDOW_START, '2026-08-28')]));
-    expect(on.bar.clippedStart).toBe(false);
-    expect(on.bar.fromWeek).toBe(0);
-    const before = onlyRow(model([dated('2026-08-16', '2026-08-28')]));
-    expect(before.bar.clippedStart).toBe(true);
-    expect(before.bar.fromWeek).toBe(0);
-  });
-
-  it('a due ON the window end is not clipped; one day later is', () => {
-    const on = onlyRow(model([dated('2026-09-28', WINDOW_END)]));
-    expect(on.bar.clippedEnd).toBe(false);
-    expect(on.bar.toWeek).toBe(LAST_WEEK);
-    const after = onlyRow(model([dated('2026-09-28', '2026-10-12')]));
-    expect(after.bar.clippedEnd).toBe(true);
-    expect(after.bar.toWeek).toBe(LAST_WEEK);
-  });
-
-  it('membership at the near edge: due ON the window start is in, one day earlier is nowhere', () => {
-    const inside = model([dated('2026-08-01', WINDOW_START, 'Ends on day one')]);
-    expect(onlyRow(inside).bar).toEqual({
-      fromWeek: 0,
-      toWeek: 0,
-      clippedStart: true,
-      clippedEnd: false,
-    });
-    const outside = model([dated('2026-08-01', '2026-08-16', 'Ended the day before')]);
-    expect(allRows(outside)).toHaveLength(0);
-    // Absent, not side-listed: it carries both claims, it is simply elsewhere.
-    expect(outside.sideList).toHaveLength(0);
-  });
-
-  it('membership at the far edge: start ON the window end is in, one day later is nowhere', () => {
-    const inside = model([dated(WINDOW_END, '2026-11-20', 'Starts on the last day')]);
-    expect(onlyRow(inside).bar).toEqual({
-      fromWeek: LAST_WEEK,
-      toWeek: LAST_WEEK,
-      clippedStart: false,
-      clippedEnd: true,
-    });
-    const outside = model([dated('2026-10-12', '2026-11-20', 'Next quarter')]);
-    expect(allRows(outside)).toHaveLength(0);
-    expect(outside.sideList).toHaveLength(0);
-  });
-
-  it('a bar spanning the whole window is clipped at both ends and covers every column', () => {
-    const row = onlyRow(model([dated('2026-01-01', '2026-12-31', 'All year')]));
-    expect(row.bar).toEqual({ fromWeek: 0, toWeek: LAST_WEEK, clippedStart: true, clippedEnd: true });
-  });
-
-  it('every bar ends no earlier than it starts — a backwards bar is invented geometry', () => {
-    const rows = allRows(
-      model([
-        dated(WINDOW_START, WINDOW_END, 'a'),
-        dated('2026-08-16', '2026-10-12', 'b'),
-        dated('2026-08-24', '2026-08-24', 'c'),
-        dated(WINDOW_END, '2026-11-20', 'd'),
-      ]),
-    );
-    expect(rows).toHaveLength(4);
-    for (const row of rows) {
-      expect(row.bar.toWeek).toBeGreaterThanOrEqual(row.bar.fromWeek);
-      expect(row.bar.fromWeek).toBeGreaterThanOrEqual(0);
-      expect(row.bar.toWeek).toBeLessThanOrEqual(LAST_WEEK);
-    }
-  });
-
-  it('weeksCount is honoured, and its last column is where clipping lands', () => {
-    const m = model([dated('2026-08-24', '2026-12-01')], { weeksCount: 2 });
-    expect(m.weeks.map((week) => week.start)).toEqual(['2026-08-17', '2026-08-24']);
-    expect(onlyRow(m).bar).toEqual({ fromWeek: 1, toWeek: 1, clippedStart: false, clippedEnd: true });
-  });
-
-  /**
-   * The MESSAGE, not just the type. Deleting the `weeksCount` guard still
-   * throws — the empty `weeks` array trips the `lastWeek === undefined`
-   * fallback one line later — so `toThrow(RangeError)` alone passes against
-   * a model with no guard at all. Measured: that is exactly what the first
-   * draft of this assertion did.
-   */
-  it('a window with no columns is refused loudly, by the guard that names the count', () => {
-    expect(() => model([], { weeksCount: 0 })).toThrow(
-      /a timeline needs at least one week column: 0/,
-    );
-    expect(() => model([], { weeksCount: -3 })).toThrow(
-      /a timeline needs at least one week column: -3/,
-    );
-    // A fractional count would otherwise build a fractional number of columns.
-    expect(() => model([], { weeksCount: 2.5 })).toThrow(
-      /a timeline needs at least one week column: 2.5/,
-    );
-  });
-});
-
-describe('11.56 bars carry exact week indices and their two authors', () => {
-  it('a both-claims ticket becomes one bar with exact week indices and provenance', () => {
+    const row = onlyRow(model([dated('2028-02-29', '2028-03-07', 'Leap')]));
+    expect([row.startDay, row.endDay]).toEqual([dayNumberOf('2028-02-29'), dayNumberOf('2028-03-07')]);
+  });
+});
+
+describe('29.093 a bar is its two claimed days, whatever they are', () => {
+  it('29.093 the row carries the claimed days as day numbers (1970-01-05 is day 4): a one-day period is startDay === endDay; a real leap day is placed', () => {
+    const one = onlyRow(model([dated('2026-08-24', '2026-08-24', 'Same day')]));
+    expect([one.startDay, one.endDay]).toEqual([dayNumberOf('2026-08-24'), dayNumberOf('2026-08-24')]);
+    // The number itself, not only agreement with the helper: day 0 is 1970-01-01, so 1970-01-05 is day 4 and 2026-08-24 is 20689.
+    expect(one.startDay).toBe(20689);
+    const leap = onlyRow(model([dated('2028-02-29', '2028-03-07', 'Leap')]));
+    expect([leap.startDay, leap.endDay]).toEqual([dayNumberOf('2028-02-29'), dayNumberOf('2028-03-07')]);
+    expect(leap.endDay - leap.startDay).toBe(7);
+    // control: a day that is not a day is refused by the guard, not turned into a bar: it is side-listed as unplaceable
+    const bad = model([dated('2026-02-30', '2026-03-05', 'Bad day')]);
+    expect(allRows(bad)).toHaveLength(0);
+    expect(bad.sideList.map((entry) => entry.reason)).toEqual(['unplaceable-day']);
+  });
+
+  it('29.093 both claims and their two authors still make one row with the exact provenance sentence', () => {
     const m = model([
       ticket({
         fields: {
@@ -460,26 +353,56 @@
       }),
     ]);
     const row = onlyRow(m);
-    // weeks: 17 Aug = 0, 24 Aug = 1, 31 Aug = 2
-    expect(row.bar).toEqual({ fromWeek: 1, toWeek: 2, clippedStart: false, clippedEnd: false });
+    expect([row.startDay, row.endDay]).toEqual([dayNumberOf('2026-08-24'), dayNumberOf('2026-09-04')]);
     expect(row.provenance).toBe("starts 24 Aug, Anselma's claim; needed by 4 Sep, Kiro's claim");
     expect(row.startClaim.date).toBe('2026-08-24');
     expect(row.dueClaim.date).toBe('2026-09-04');
     expect(row.pending).toBe(false);
   });
-
-  it('a bar reaching outside the window is clipped and says so', () => {
-    const row = onlyRow(model([dated('2026-08-01', '2026-08-26', 'Long haul')]));
-    expect(row.bar.fromWeek).toBe(0);
-    expect(row.bar.toWeek).toBe(1);
-    expect(row.bar.clippedStart).toBe(true);
-    expect(row.bar.clippedEnd).toBe(false);
-  });
-
-  it('a fully-dated ticket wholly outside the window appears nowhere', () => {
-    const m = model([dated('2026-11-02', '2026-11-20', 'Next quarter')]);
-    expect(allRows(m)).toHaveLength(0);
+});
+
+describe('29.094 the chart has no window: a dated ticket is never elsewhere', () => {
+  it('29.094 a ticket dated a year before, and one dated a year after, are both rows; none is side-listed; the extent spans them (firstDay / lastDay)', () => {
+    const m = model([
+      dated('2025-03-03', '2025-03-07', 'Long ago'),
+      dated('2027-11-01', '2027-11-05', 'Far ahead'),
+      dated('2026-08-24', '2026-08-28', 'Now'),
+    ]);
+    expect(allRows(m).map((r) => r.title).sort()).toEqual(['Far ahead', 'Long ago', 'Now']);
     expect(m.sideList).toHaveLength(0);
+    expect(m.firstDay).toBe(dayNumberOf('2025-03-03'));
+    expect(m.lastDay).toBe(dayNumberOf('2027-11-05'));
+    // control: with nothing dated the extent is empty, not zero
+    const none = model([]);
+    expect([none.firstDay, none.lastDay]).toEqual([null, null]);
+  });
+
+  it('29.094 a custom date claim neither extends a row nor adds one', () => {
+    const stretch = ticket(
+      {
+        fields: {
+          title: claimField('Stretchy'),
+          startDate: claimField({ date: '2026-08-24' }),
+          dueDate: claimField({ date: '2026-08-28' }),
+          'filed-on': claimField('2026-12-25'),
+        },
+      },
+      [],
+      [{ id: 'filed-on', name: 'Filed on' }],
+    );
+    const row = onlyRow(model([stretch]));
+    expect(row.endDay).toBe(dayNumberOf('2026-08-28'));
+    expect(row.customClaims).toHaveLength(1);
+    expect(model([stretch]).lastDay).toBe(dayNumberOf('2026-08-28'));
+  });
+});
+
+describe('29.096 todayDay is the day number of the injected today', () => {
+  it('29.096 any calendar day is a number, however far from the rows; no today (or not a calendar day) is null', () => {
+    expect(model([], { today: '2026-08-19' }).todayDay).toBe(dayNumberOf('2026-08-19'));
+    expect(model([], { today: '2031-01-01' }).todayDay).toBe(dayNumberOf('2031-01-01'));
+    expect(model([], { today: '2026-02-30' }).todayDay).toBeNull();
+    expect(buildTimelineModel([], { userName }).todayDay).toBeNull();
   });
 });
 
@@ -711,11 +634,11 @@
     expect(row.customClaims[0]!.claim.fieldId).toBe('filed-on');
     // 24 Aug and 28 Aug are both in the 24-30 week: one column, untouched by
     // the 26 Aug claim.
-    expect(row.bar).toEqual({ fromWeek: 1, toWeek: 1, clippedStart: false, clippedEnd: false });
+    expect([row.startDay, row.endDay]).toEqual([dayNumberOf('2026-08-24'), dayNumberOf('2026-08-28')]);
     expect(row.provenance).toBe("starts 24 Aug, Kiro's claim; needed by 28 Aug, Kiro's claim");
   });
 
-  it('a custom claim far outside the window neither extends a bar nor rescues a window miss', () => {
+  it('a custom claim far away neither extends a bar nor makes a row', () => {
     const stretch = ticket(
       {
         fields: {
@@ -728,23 +651,7 @@
       [],
       [{ id: 'filed-on', name: 'Filed on' }],
     );
-    expect(onlyRow(model([stretch])).bar.toWeek).toBe(1);
-
-    const gone = ticket(
-      {
-        fields: {
-          title: claimField('Elsewhere'),
-          startDate: claimField({ date: '2026-11-02' }),
-          dueDate: claimField({ date: '2026-11-20' }),
-          'filed-on': claimField('2026-08-26'),
-        },
-      },
-      [],
-      [{ id: 'filed-on', name: 'Filed on' }],
-    );
-    const m = model([gone]);
-    expect(allRows(m)).toHaveLength(0);
-    expect(m.sideList).toHaveLength(0);
+    expect(onlyRow(model([stretch])).endDay).toBe(dayNumberOf('2026-08-28'));
   });
 
   it('a custom date claim does NOT rescue a ticket from the side list — but the note stops lying', () => {
@@ -856,7 +763,7 @@
  * still distinguish. The distinct-count assertion records the collapse rather
  * than hiding it.
  */
-describe('11.61 the empty timelines, and the guard a deleted sentence left behind', () => {
+describe('11.61 the empty timelines (one sentence since the window went: 29.095)', () => {
   function assigned(assigneeId: string, title: string, start?: string, due?: string): TicketDatesInput {
     const fields: Record<string, unknown> = { title: claimField(title) };
     if (start !== undefined) fields.startDate = claimField({ date: start });
@@ -879,7 +786,6 @@
     expect(m.emptyCopy).toBe(TIMELINE_EMPTY_COPY);
     // The property the deleted sentence used to carry, now carried by this one.
     expect(m.emptyCopy).toContain('your filter');
-    expect(m.emptyCopy).not.toBe(TIMELINE_OUT_OF_WINDOW_COPY);
   });
 
   it('an unmatched LANE reaches the same sentence — the door outlives the copy', () => {
@@ -888,43 +794,21 @@
     expect(m.emptyCopy).toBe(TIMELINE_EMPTY_COPY);
   });
 
-  it('work that is fully dated and merely ELSEWHERE IN TIME says exactly that', () => {
-    const m = model([dated('2026-11-02', '2026-11-06', 'Later')]);
-    expect(m.groups).toEqual([]);
-    expect(m.sideList).toEqual([]);
-    expect(m.emptyCopy).toBe(TIMELINE_OUT_OF_WINDOW_COPY);
-    expect(m.emptyCopy).not.toBe(TIMELINE_EMPTY_COPY);
-  });
-
   /**
-   * ⚠ THE MEASUREMENT THAT MADE THIS BLOCK WORTH HAVING, INVERTED BY A RULING.
-   *
-   * The reviewer's DISTINCT COUNT was 1; the block was built to make it 3. It
-   * is **2** as of 2026-09-20, because `TIMELINE_NARROWED_COPY` was deleted on
-   * the owner's ruling (*"delete the copy"* — it named "the LANE", a word no
-   * screen shows, and no app could render it), and its arm now falls through to
-   * `TIMELINE_EMPTY_COPY`. **So a filter that matched nobody and a workspace
-   * with nothing in it are ONE screen again** — the exact collapse this block
-   * was written to end, and the cost the ruling buys. Reinstating the
-   * distinction means writing a new sentence for the narrowing case.
-   *
-   * It is asserted rather than described so that the day someone writes that
-   * sentence, THIS is what tells them the count moved — and so that the loss is
-   * a re-runnable measurement rather than a memory.
+   * 29.095 THE COLLAPSE, MEASURED. With the window gone there is no "elsewhere
+   * in time" screen: a workspace with nothing in it, a filter that matched
+   * nobody and a lane that matched nothing are ONE model, and the one sentence
+   * is true of all three ("No claimed dates are here to draw ... your filter").
+   * Control: a model with a row on it is a different model.
    */
-  it('the empties are TWO distinct models, down from three — the narrowing sentence was deleted', () => {
+  it('29.095 the empties are ONE distinct model; a model with a row is another', () => {
     const serialised = [
       model([]),
       model(inWindow(), { filter: { assigneeIds: ['user_nobody'] } }),
       model(inWindow(), { laneEpicId: 'no_such_epic' }),
-      model([dated('2026-11-02', '2026-11-06', 'Later')]),
     ].map((m) => JSON.stringify(m));
-    expect(new Set(serialised).size).toBe(2);
-    // The filter, the lane and the empty workspace are one screen now.
-    expect(serialised[1]).toBe(serialised[0]);
-    expect(serialised[2]).toBe(serialised[0]);
-    // The window miss is still its own, because ITS guard survived.
-    expect(serialised[3]).not.toBe(serialised[0]);
+    expect(new Set(serialised).size).toBe(1);
+    expect(JSON.stringify(model(inWindow()))).not.toBe(serialised[0]);
   });
 
   it('a timeline with anything on it has no empty sentence at all', () => {
@@ -933,43 +817,6 @@
     expect(
       model([ticket({ fields: { title: claimField('Undated') } })]).emptyCopy,
     ).toBeNull();
-  });
-
-  /**
-   * NARROWINGS STACK, and this is the pair that proves the precedence is a
-   * truth condition rather than an ordering someone liked.
-   */
-  it('a filter that removed work which WOULD have shown here outranks the window', () => {
-    const m = model(
-      [
-        assigned('user_anselma', 'Later', '2026-11-02', '2026-11-06'),
-        assigned('user_kiro', 'Undated, and would have been listed'),
-      ],
-      { filter: { assigneeIds: ['user_anselma'] } },
-    );
-    expect(m.groups).toEqual([]);
-    expect(m.sideList).toEqual([]);
-    // Widening the filter WOULD fill this screen, so "it is outside these
-    // weeks" would send the viewer to the wrong control. The guard that keeps
-    // that sentence away OUTLIVED the sentence it used to select, which is the
-    // whole reason this test still has a job.
-    expect(m.emptyCopy).toBe(TIMELINE_EMPTY_COPY);
-    expect(m.emptyCopy).not.toBe(TIMELINE_OUT_OF_WINDOW_COPY);
-  });
-
-  it('a filter that removed only work which would ALSO have missed the window is not blamed', () => {
-    const m = model(
-      [
-        assigned('user_anselma', 'Later', '2026-11-02', '2026-11-06'),
-        assigned('user_kiro', 'Earlier', '2026-08-01', '2026-08-05'),
-      ],
-      { filter: { assigneeIds: ['user_anselma'] } },
-    );
-    expect(m.groups).toEqual([]);
-    // Widening the filter would put nothing on this screen — the window is the
-    // only control that reaches either ticket.
-    expect(m.emptyCopy).toBe(TIMELINE_OUT_OF_WINDOW_COPY);
-    expect(m.emptyCopy).not.toBe(TIMELINE_EMPTY_COPY);
   });
 
   /**
@@ -1041,12 +888,10 @@
     expect(m.groups).toHaveLength(1);
     expect(m.groups[0]!.epicId).toBe('epic_full');
     expect(m.groups[0]!.rows.map((row) => row.ticketId)).toEqual(['epic_full']);
-    expect(m.groups[0]!.rows[0]!.bar).toEqual({
-      fromWeek: 1,
-      toWeek: 1,
-      clippedStart: false,
-      clippedEnd: false,
-    });
+    expect([m.groups[0]!.rows[0]!.startDay, m.groups[0]!.rows[0]!.endDay]).toEqual([
+      dayNumberOf('2026-08-24'),
+      dayNumberOf('2026-08-28'),
+    ]);
   });
 
   it('a TRULY undated epic is a lane and nothing else — neither a row nor missing work', () => {
@@ -1161,18 +1006,3 @@
     expect(bare.groups).toEqual([]);
   });
 });
-
-describe('23.142 todayDay is an index into THIS window, and null outside it', () => {
-  it('23.142 todayDay is null for a today before the anchor or after the window end, and the right index inside (explicit anchor)', () => {
-    // The window is 17 Aug – 11 Oct (ANCHOR's Monday, eight weeks): day indices 0–55.
-    expect(model([], { today: '2026-08-19' }).todayDay).toBe(2);
-    // The edges are INSIDE: the first day and the last day.
-    expect(model([], { today: WINDOW_START }).todayDay).toBe(0);
-    expect(model([], { today: WINDOW_END }).todayDay).toBe(55);
-    // One day either side is outside — each bound is its own claim (`>= windowStart`, `<= windowEnd`).
-    expect(model([], { today: '2026-08-16' }).todayDay).toBeNull();
-    expect(model([], { today: '2026-10-12' }).todayDay).toBeNull();
-    // No `today` at all: no line.
-    expect(model([]).todayDay).toBeNull();
-  });
-});
```

**Kills** (mutants of this task's `timeline-model.ts`, Step 3):
- 11.52 "start EQUAL to due is a period of one day": (a) `start.date <= due.date` to `<` (the one-day period is side-listed, `onlyRow` throws) (b) `endDay: dayNumberOf(due.date) + 1`.
- 11.54 "the bar is untouched" (bad custom day) and "a real leap day is placed": (a) feed the custom claims' days into `unplaceable` (the dated ticket is side-listed) (b) `endDay: dayNumberOf(start.date)` (the leap bar is 0 days long).
- 29.093 the row carries the claimed days: (a) `startDay: dayNumberOf(start.date) + 1` (b) `endDay: dayNumberOf(start.date)` (the leap leg) (c) delete the `unplaceable` guard (`dayNumberOf('2026-02-30')` throws, and the reason leg names `unplaceable-day`).
- 29.093 both claims and their two authors: (a) `barProvenance(due, start, opts.userName)` (b) `endDay: dayNumberOf(start.date)`.
- 29.094 a year before and a year after: (a) `firstDay` with `Math.max` (b) `lastDay` from `row.startDay` (c) the extent loop reads only `group.rows[0]` (Long ago, Now, Far ahead are one lane, sorted by start).
- 29.094 a custom date claim neither extends a row nor adds one: (a) `lastDay` takes `Math.max` over the row's custom claim days too (b) `customClaims` dropped from the row (`toHaveLength(1)`).
- 11.58 "a custom claim far away neither extends a bar nor makes a row" and the edited 11.58 pair leg: (a) `endDay` stretched to the latest custom claim day.
- 29.096 todayDay: (a) drop `isCalendarDay(opts.today) &&` (`dayNumberOf('2026-02-30')` throws) (b) `todayDay` null when `opts.today` lies outside `[firstDay, lastDay]` (a window guard by another name: `2031-01-01` with no rows).
- 11.61 / 29.095 "the empties are ONE distinct model; a model with a row is another": (a) compute `firstDay` / `lastDay` over every dated INPUT instead of the drawn rows (the filter and lane models get an extent and differ from `model([])`).
- 13.1036 (the epic's own bar, edited leg): (a) `endDay: dayNumberOf(start.date)`.

`packages/app-core/test/timeline/timeline-view.test.tsx`:

```diff
--- a/packages/app-core/test/timeline/timeline-view.test.tsx
+++ b/packages/app-core/test/timeline/timeline-view.test.tsx
@@ -1,12 +1,11 @@
 import { readFileSync } from 'node:fs';
 import { dirname, join, resolve } from 'node:path';
 import { fileURLToPath } from 'node:url';
-import { fireEvent, render, screen, within } from '@testing-library/react';
+import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
 import { describe, expect, it, vi } from 'vitest';
 import type { TicketState } from '@gisik-nokma/domain';
 import {
   TIMELINE_EMPTY_COPY,
-  TIMELINE_OUT_OF_WINDOW_COPY,
   TIMELINE_SIDE_LIST_COPY,
   TIMELINE_SIDE_LIST_UNDRAWABLE_COPY,
   barProvenance,
@@ -20,6 +19,7 @@
 import type { IsEpicType } from '../../src/hierarchy/epic-ancestor.js';
 import type { FilterSpec } from '../../src/view-types.js';
 import { NO_DATES_NOTE, NO_DAY_CLAIMS_NOTE } from '../../src/timeline/timeline-model.js';
+import { dayNumberOf, isoDayOf } from '../../src/timeline/timeline-days.js';
 import { TimelineView } from '../../src/timeline/timeline-view.js';
 
 /**
@@ -106,6 +106,8 @@
  * inclusively on 11 Oct.
  */
 const TODAY = '2026-08-23';
+/** The state word the description leads with for the fixture's `active` state (TG-14: status is never colour alone). */
+const IN_PROGRESS = 'In progress; ';
 
 /**
  * `packages/app-core/test/timeline` -> four levels up. Deliberately NOT
@@ -118,9 +120,6 @@
  */
 const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
 
-/** The model's own label shape for a column, never a second spelling of it. */
-const WEEK_17_AUG = 'W 17 Aug';
-const WEEK_14_SEP = 'W 14 Sep';
 
 function renderTimeline(
   tickets: TicketDatesInput[],
@@ -130,7 +129,6 @@
     filter?: FilterSpec;
     laneEpicId?: string | null;
     isEpicType?: IsEpicType;
-    weeksCount?: number;
   } = {},
 ) {
   const onOpenTicket = extra.onOpenTicket ?? vi.fn();
@@ -143,7 +141,6 @@
       {...(extra.filter === undefined ? {} : { filter: extra.filter })}
       {...(extra.laneEpicId === undefined ? {} : { laneEpicId: extra.laneEpicId })}
       {...(extra.isEpicType === undefined ? {} : { isEpicType: extra.isEpicType })}
-      {...(extra.weeksCount === undefined ? {} : { weeksCount: extra.weeksCount })}
     />,
   );
   return { onOpenTicket, ...view };
@@ -177,7 +174,7 @@
     const bar = screen.getByRole('button', { name: 'Dated' });
     expect(bar).toHaveAttribute(
       'title',
-      barProvenance(
+      IN_PROGRESS + barProvenance(
         { date: '2026-08-24', actorId: 'user_kiro' },
         { date: '2026-08-28', actorId: 'user_kiro' },
         userName,
@@ -218,40 +215,57 @@
   });
 });
 
-describe('11.74 the window moves four weeks at a time, and Today follows the prop rather than the mount', () => {
-  it('Later shifts forward, Earlier comes back, and the columns that leave really leave', () => {
+describe('29.099 there are no pages: no Earlier / Later, a Today button, a zoom switch and a two-row axis', () => {
+  it('29.099 the toolbar is Today and a Day | Week | Month switch with Week marked; Earlier and Later are gone (control: Today is there)', async () => {
     renderTimeline([]);
-    expect(screen.getByText(WEEK_17_AUG)).toBeInTheDocument();
-    // 14 Sep is ALREADY on screen before the shift — the plan's own assertion
-    // would have passed without the window moving at all. What proves the move
-    // is that it becomes the FIRST column and that 17 Aug is gone.
-    expect(screen.getByText(WEEK_14_SEP)).toBeInTheDocument();
-
-    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
-    expect(screen.queryByText(WEEK_17_AUG)).toBeNull();
-    expect(screen.getAllByText(/^W /)[0]).toHaveTextContent(WEEK_14_SEP);
-    // And a column that could not have been in the old window is now in view.
-    expect(screen.getByText('W 2 Nov')).toBeInTheDocument();
-
-    fireEvent.click(screen.getByRole('button', { name: 'Earlier' }));
-    expect(screen.getAllByText(/^W /)[0]).toHaveTextContent(WEEK_17_AUG);
-    expect(screen.queryByText('W 2 Nov')).toBeNull();
-  });
-
-  it('Today returns to the day the shell is handing in NOW, not the one it mounted with', () => {
-    const { rerender } = renderTimeline([]);
-    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
-    expect(screen.getAllByText(/^W /)[0]).toHaveTextContent(WEEK_14_SEP);
-
-    // Midnight passed, or the shell simply re-rendered with a fresher day.
-    rerender(
-      <TimelineView tickets={[]} today="2026-10-07" userName={userName} onOpenTicket={vi.fn()} />,
-    );
-    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
-    // 2026-10-07 is a Wednesday; its Monday is 5 Oct. A component that had
-    // captured the mounted `today` would land back on 17 Aug.
-    expect(screen.getAllByText(/^W /)[0]).toHaveTextContent('W 5 Oct');
-    expect(screen.queryByText(WEEK_17_AUG)).toBeNull();
+    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
+    expect(screen.queryByRole('button', { name: 'Earlier' })).toBeNull();
+    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
+    const zoom = screen.getByRole('radiogroup', { name: 'Timeline zoom' }); // 29.087: VP-10 asks for a radio group
+    expect(within(zoom).getAllByRole('radio').map((t) => t.textContent)).toEqual(['Day', 'Week', 'Month']);
+    expect(within(zoom).getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'true');
+    expect(within(zoom).getByRole('radio', { name: 'Day' })).toHaveAttribute('aria-checked', 'false');
+    // The mark follows the zoom, not a constant: choosing Day marks Day once the zoom lands. Reduced motion makes the zoom
+    // instant (the adapter reads `prefers-reduced-motion` through matchMedia, which jsdom lacks), so it lands on the next frame.
+    vi.stubGlobal('matchMedia', (query: string) => ({
+      matches: query.includes('reduce'),
+      media: query,
+      addEventListener() {},
+      removeEventListener() {},
+      addListener() {},
+      removeListener() {},
+    }));
+    try {
+      fireEvent.click(within(zoom).getByRole('radio', { name: 'Day' }));
+      await waitFor(() => expect(within(zoom).getByRole('radio', { name: 'Day' })).toHaveAttribute('aria-checked', 'true'));
+      expect(within(zoom).getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'false');
+    } finally {
+      vi.unstubAllGlobals();
+    }
+  });
+
+  it('29.099 the axis has a period row with a W label on each Monday and a day-number row; a weekend day carries the mark', () => {
+    const { container } = renderTimeline([]);
+    const axis = container.querySelector('.gn-timeline__axis');
+    expect(axis?.querySelectorAll('.gn-timeline__axis-row')).toHaveLength(2);
+    // 2026-08-24 is a Monday, 2026-08-29 a Saturday
+    expect(within(axis as HTMLElement).getByText('W 24 Aug')).toBeInTheDocument();
+    const weekendDays = [...(axis?.querySelectorAll('.gn-timeline__axis-day[data-weekend="true"]') ?? [])];
+    expect(weekendDays.length).toBeGreaterThan(10);
+    // control: no weekday carries it
+    const monday = [...(axis?.querySelectorAll('.gn-timeline__axis-day') ?? [])].filter((n) => !n.hasAttribute('data-weekend'));
+    expect(monday.length).toBeGreaterThan(weekendDays.length);
+    // The RIGHT days, not only the right share: read each day cell by its offset from the W 24 Aug label (labels and day cells
+    // share `--d0`, the day's offset from the surface's first day). Mon 24 and Fri 28 are clear, Sat 29 and Sun 30 are marked.
+    const mon = Number((within(axis as HTMLElement).getByText('W 24 Aug') as HTMLElement).style.getPropertyValue('--d0'));
+    const dayAt = (d0: number) =>
+      [...(axis?.querySelectorAll<HTMLElement>('.gn-timeline__axis-day') ?? [])].find((n) => n.style.getPropertyValue('--d0') === String(d0));
+    expect(dayAt(mon)?.textContent).toBe('24');
+    expect(dayAt(mon)?.getAttribute('data-weekend')).toBeNull();
+    expect(dayAt(mon + 4)?.getAttribute('data-weekend')).toBeNull();
+    expect(dayAt(mon + 5)?.getAttribute('data-weekend')).toBe('true');
+    expect(dayAt(mon + 6)?.getAttribute('data-weekend')).toBe('true');
+    expect(dayAt(mon + 7)?.textContent).toBe('31');
   });
 });
 
@@ -305,7 +319,7 @@
     expect(screen.getByRole('note')).toHaveTextContent('your filter');
   });
 
-  it('dated work scheduled outside these weeks — the arm the component cannot reconstruct', () => {
+  it('29.095 dated work a year away is DRAWN, not described: no sentence, a bar', () => {
     renderTimeline([
       ticket({
         fields: {
@@ -315,7 +329,8 @@
         },
       }),
     ]);
-    expect(screen.getByRole('note')).toHaveTextContent(TIMELINE_OUT_OF_WINDOW_COPY);
+    expect(screen.queryByRole('note')).toBeNull();
+    expect(screen.getByRole('button', { name: 'Next year' })).toBeInTheDocument();
   });
 
   it('and NO sentence at all when there is something to show — the over-firing half', () => {
@@ -532,96 +547,204 @@
   });
 });
 
-describe('11.79 a bar occupies the columns it was claimed for, and says which end the window cut', () => {
-  const INSIDE = { title: 'Inside', start: '2026-08-24', due: '2026-08-28', column: '3 / 4' };
-  const OVER_START = { title: 'Over start', start: '2026-08-10', due: '2026-08-28', column: '2 / 4' };
-  const OVER_END = { title: 'Over end', start: '2026-08-24', due: '2026-11-01', column: '3 / 10' };
-  const OVER_BOTH = { title: 'Over both', start: '2026-08-10', due: '2026-11-01', column: '2 / 10' };
-
-  function spans() {
-    return [INSIDE, OVER_START, OVER_END, OVER_BOTH].map((span) =>
-      ticket({
-        fields: {
-          title: claimField(span.title),
-          startDate: claimField({ date: span.start }),
-          dueDate: claimField({ date: span.due }),
-        },
-      }),
+describe('29.097 a bar is placed by three numbers and one scale', () => {
+  const bar = (title: string, start: string, due: string, key?: string): TicketDatesInput => {
+    const input = ticket({ fields: { title: claimField(title), startDate: claimField({ date: start }), dueDate: claimField({ date: due }) } });
+    return key === undefined ? input : { ...input, key };
+  };
+  const barOf = (title: string) => screen.getByRole('button', { name: title });
+  const prop = (title: string, name: string) => (barOf(title).closest('.gn-timeline__row') as HTMLElement).style.getPropertyValue(name);
+
+  it('29.097 --dn is the length in days, both ends included: Mon-Wed is 3, Mon-Fri 5, a one-day bar 1; the day numbers ride on the bar', () => {
+    renderTimeline([bar('Mon to Wed', '2026-08-24', '2026-08-26'), bar('Mon to Fri', '2026-08-24', '2026-08-28'), bar('One day', '2026-09-30', '2026-09-30')]);
+    expect(prop('Mon to Wed', '--dn')).toBe('3');
+    expect(prop('Mon to Fri', '--dn')).toBe('5');
+    expect(prop('One day', '--dn')).toBe('1');
+    expect(barOf('Mon to Wed')).toHaveAttribute('data-day-from', String(dayNumberOf('2026-08-24')));
+    expect(barOf('Mon to Wed')).toHaveAttribute('data-day-to', String(dayNumberOf('2026-08-26')));
+    // --d0 is relative to the surface's first day, so the offset BETWEEN two bars is their distance in days
+    expect(Number(prop('One day', '--d0')) - Number(prop('Mon to Wed', '--d0'))).toBe(dayNumberOf('2026-09-30') - dayNumberOf('2026-08-24'));
+    // ...and the offset itself is the axis's: a bar starting Monday 24 Aug has the --d0 of the W 24 Aug label above it (a
+    // difference alone cannot see an offset counted from the wrong origin, since both bars would carry it).
+    expect(prop('Mon to Wed', '--d0')).toBe((screen.getByText('W 24 Aug') as HTMLElement).style.getPropertyValue('--d0'));
+  });
+
+  it('29.097 there is no window: work a year before and a year after is drawn, with the surface long enough to hold it', () => {
+    const { container } = renderTimeline([bar('Long ago', '2025-08-25', '2025-08-29'), bar('Far ahead', '2027-08-23', '2027-08-27')]);
+    expect(barOf('Long ago')).toBeInTheDocument();
+    expect(barOf('Far ahead')).toBeInTheDocument();
+    expect(Number(prop('Far ahead', '--d0')) - Number(prop('Long ago', '--d0'))).toBe(dayNumberOf('2027-08-23') - dayNumberOf('2025-08-25'));
+    // control: the surface is sized from the day count, not from a week count
+    const width = (container.querySelector('.gn-timeline__surface') as HTMLElement).style.width;
+    expect(width).toMatch(/^calc\(var\(--tl-ppd\) \* \d+ \* 1px\)$/);
+    expect(Number(/\* (\d+) \*/.exec(width)?.[1])).toBeGreaterThan(730);
+  });
+
+  it('29.097 no stylesheet number leaks into the markup: the scale is one custom property on the canvas, and no inline grid template exists', () => {
+    const { container } = renderTimeline([bar('Mon to Wed', '2026-08-24', '2026-08-26')]);
+    expect((container.querySelector('.gn-timeline__canvas') as HTMLElement).style.getPropertyValue('--tl-ppd')).toBe('24');
+    expect(container.querySelectorAll('[style*="grid-template-columns"]')).toHaveLength(0);
+    expect(container.querySelectorAll('[style*="left:"]')).toHaveLength(0);
+  });
+});
+
+describe('29.098 the bars of a lane are packed into the fewest rows', () => {
+  const bar = (title: string, start: string, due: string): TicketDatesInput =>
+    ticket({ fields: { title: claimField(title), startDate: claimField({ date: start }), dueDate: claimField({ date: due }) } });
+  const rowOf = (title: string) => Number((screen.getByRole('button', { name: title }).closest('.gn-timeline__row') as HTMLElement).style.getPropertyValue('--row'));
+
+  it('29.098 two bars that share a day take two rows, two that only touch take one, and the lane is as tall as its rows; control: a third overlap adds a row', () => {
+    const { container } = renderTimeline([
+      bar('A', '2026-08-24', '2026-08-28'),
+      bar('B', '2026-08-26', '2026-08-31'),
+      bar('C', '2026-09-01', '2026-09-03'),
+    ]);
+    expect(rowOf('A')).toBe(0);
+    expect(rowOf('B')).toBe(1);
+    // C starts the day after B ends: it fits beside A in row 0
+    expect(rowOf('C')).toBe(0);
+    const lane = container.querySelector('.gn-timeline__lane') as HTMLElement;
+    expect(lane.style.getPropertyValue('--lane-extent')).toBe(`${34 + 2 * 40}px`);
+    document.body.innerHTML = '';
+    const three = renderTimeline([bar('A', '2026-08-24', '2026-08-28'), bar('B', '2026-08-26', '2026-08-31'), bar('C', '2026-08-27', '2026-08-30')]);
+    expect((three.container.querySelector('.gn-timeline__lane') as HTMLElement).style.getPropertyValue('--lane-extent')).toBe(`${34 + 3 * 40}px`);
+  });
+});
+
+describe('29.100 the key is on the bar; the accessible name stays the title', () => {
+  const keyed = (title: string, key: string, start: string, due: string): TicketDatesInput => ({
+    ...ticket({ fields: { title: claimField(title), startDate: claimField({ date: start }), dueDate: claimField({ date: due }) } }),
+    key,
+  });
+
+  it('29.100 a wide bar shows the key inside; a one-day bar shows it just outside its end; the name is the title alone and the description has the key', () => {
+    const { container } = renderTimeline([keyed('Wide', 'GN-12', '2026-08-24', '2026-08-28'), keyed('Narrow', 'GN-13', '2026-09-08', '2026-09-08')]);
+    const wide = screen.getByRole('button', { name: 'Wide' });
+    expect(wide.querySelector('.gn-timeline__key')).toHaveTextContent('GN-12');
+    const narrow = screen.getByRole('button', { name: 'Narrow' });
+    expect(narrow.querySelector('.gn-timeline__key')).toBeNull();
+    const outside = (narrow.closest('.gn-timeline__row') as HTMLElement).querySelector('.gn-timeline__key--outside');
+    expect(outside).toHaveTextContent('GN-13');
+    expect(outside).toHaveAttribute('aria-hidden', 'true');
+    // the key is reachable by assistive technology through the description, never through the name
+    const described = document.getElementById(narrow.getAttribute('aria-describedby') as string);
+    expect(described).toHaveTextContent('GN-13');
+    expect(narrow.getAttribute('aria-label')).toBe('Narrow');
+    // exactly one key per bar: inside the wide one, outside the narrow one, never both at once
+    expect(container.querySelectorAll('.gn-timeline__key')).toHaveLength(2);
+    expect((wide.closest('.gn-timeline__row') as HTMLElement).querySelector('.gn-timeline__key--outside')).toBeNull();
+    // control: a bar with no key (a draft or a replica row) has none to show, inside or outside
+    document.body.innerHTML = '';
+    const bare = renderTimeline([ticket({ fields: { title: claimField('Bare'), startDate: claimField({ date: '2026-09-08' }), dueDate: claimField({ date: '2026-09-08' }) } })]);
+    expect(bare.container.querySelector('.gn-timeline__key')).toBeNull();
+  });
+
+  it('29.100 a finished ticket carries a check, one in progress a play mark, one not started none; the description says it in words', () => {
+    const withState = (title: string, stateCategory: TicketState['stateCategory']): TicketDatesInput =>
+      ticket({ stateCategory, fields: { title: claimField(title), startDate: claimField({ date: '2026-08-24' }), dueDate: claimField({ date: '2026-08-28' }) } });
+    renderTimeline([withState('Done one', 'terminal'), withState('Active one', 'active'), withState('Fresh one', 'open')]);
+    const mark = (title: string) => screen.getByRole('button', { name: title }).querySelector('.gn-timeline__mark')?.textContent ?? null;
+    expect(mark('Done one')).toBe('✓');
+    expect(mark('Active one')).toBe('▶');
+    expect(mark('Fresh one')).toBeNull();
+    expect(screen.getByRole('button', { name: 'Done one' })).toHaveAttribute('title', expect.stringMatching(/^Done; /));
+    expect(screen.getByRole('button', { name: 'Active one' })).toHaveAttribute('title', expect.stringMatching(/^In progress; /));
+    expect(screen.getByRole('button', { name: 'Fresh one' }).getAttribute('title')).not.toMatch(/Done|In progress/);
+  });
+});
+
+describe('29.101 the today line is one line, on the prop\'s day', () => {
+  it('29.101 one line, aria-hidden, at today\'s day number; a different prop moves it; an invalid day draws none', () => {
+    const { container, rerender } = renderTimeline([]);
+    const lines = () => container.querySelectorAll('.gn-timeline__today');
+    expect(lines()).toHaveLength(1);
+    expect(lines()[0]).toHaveAttribute('aria-hidden', 'true');
+    expect(lines()[0]).toHaveAttribute('data-day', String(dayNumberOf('2026-08-23')));
+    // ...and it is DRAWN on that day: Sunday 23 Aug is one day left of the W 24 Aug label (both offsets count from the
+    // surface's first day), so a line placed from the wrong origin fails here even though its data-day is right.
+    const mondayD0 = Number((screen.getByText('W 24 Aug') as HTMLElement).style.getPropertyValue('--d0'));
+    expect(Number((lines()[0] as HTMLElement).style.getPropertyValue('--d0'))).toBe(mondayD0 - 1);
+    rerender(<TimelineView tickets={[]} today="2026-10-07" userName={userName} onOpenTicket={vi.fn()} />);
+    expect(lines()[0]).toHaveAttribute('data-day', String(dayNumberOf('2026-10-07')));
+    rerender(<TimelineView tickets={[]} today="2026-02-30" userName={userName} onOpenTicket={vi.fn()} />);
+    expect(lines()).toHaveLength(0);
+  });
+});
+
+describe('29.102 only the bars near the view are mounted', () => {
+  function crowd(n: number): TicketDatesInput[] {
+    return Array.from({ length: n }, (_, i) => {
+      const start = isoDayOf(dayNumberOf('2026-01-05') + i * 3);
+      return ticket({ fields: { title: claimField(`Bar ${i}`), startDate: claimField({ date: start }), dueDate: claimField({ date: start }) } });
+    });
+  }
+
+  it('29.102 with a measured width the mounted bars are the viewport and one viewport either side; with none (jsdom, a hidden tab) every bar is mounted', () => {
+    const all = crowd(300);
+    const bars = () => document.querySelectorAll('.gn-timeline__bar').length;
+    const stub = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960);
+    try {
+      renderTimeline(all, { today: '2026-06-01' });
+      const measured = bars();
+      expect(measured).toBeGreaterThan(0);
+      expect(measured).toBeLessThan(300);
+      // WHICH bars, not only how many. Bar i is on 2026-01-05 + 3i, so Bar 49 is on today (2026-06-01). The viewport is 40 days
+      // (960 px at 24 px/day) centred on today, so the visible days are today -20 .. +20 and one viewport either side reaches
+      // about today -61 .. +61 (Bars 29 to 69). Bars 21 and 77 are 84 days away, past any band of the view; Bars 0 and 299 are
+      // the ends of the data.
+      const mounted = (i: number) => screen.queryByRole('button', { name: `Bar ${i}` }) !== null;
+      expect([mounted(29), mounted(49), mounted(69)]).toEqual([true, true, true]);
+      expect([mounted(0), mounted(21), mounted(77), mounted(299)]).toEqual([false, false, false, false]);
+      // After the mount and its first refresh the band IS spec PR-5's [visible - V, visible + V], exactly (planner ruling
+      // 2026-10-04): visible = today -20 .. +20 (offset today - 19.5, 40 days), V = 41, band = today -61 .. +61. Bars 28 and 70
+      // (today -63 and +63) are just outside it; the 54-day guess the view starts from (today -81 .. +80) would mount both.
+      expect([mounted(28), mounted(70)]).toEqual([false, false]);
+    } finally {
+      stub.mockRestore();
+    }
+    document.body.innerHTML = '';
+    renderTimeline(all, { today: '2026-06-01' });
+    expect(bars()).toBe(300);
+  });
+});
+
+describe('29.102 a view that re-renders without new data re-renders none of its bars', () => {
+  it('29.102 the bar is a React.memo component imported from react, so a moving / resting flip of the view does not re-render 2,000 bars (measured: a 33 ms stall without it, 9.4 ms with); control: the scan finds a planted un-memoised bar', () => {
+    const here = dirname(fileURLToPath(import.meta.url));
+    const source = readFileSync(join(here, '../../src/timeline/timeline-view.tsx'), 'utf8');
+    const memoised = (text: string) => /import \{[^}]*\bmemo\b[^}]*\} from 'react'/.test(text) && /const TimelineBar = memo\(function TimelineBar\(/.test(text);
+    expect(memoised(source)).toBe(true);
+    expect(memoised("const TimelineBar = function TimelineBar(props) { return null; };")).toBe(false);
+  });
+});
+
+describe('29.103 custom date claims stay beside the ticket (TV-2)', () => {
+  it('29.103 the claim list sits in the bar\'s row, outside the bar, with the model\'s label; a bar with none has no list', () => {
+    const withClaim = ticket(
+      { fields: { title: claimField('Filed'), startDate: claimField({ date: '2026-08-24' }), dueDate: claimField({ date: '2026-08-28' }), 'filed-on': claimField('2026-08-26') } },
+      [],
+      [{ id: 'filed-on', name: 'Filed on' }],
     );
-  }
-
-  it('places each bar on its own columns', () => {
-    renderTimeline(spans());
-    for (const span of [INSIDE, OVER_START, OVER_END, OVER_BOTH]) {
-      expect(screen.getByRole('button', { name: span.title })).toHaveStyle({
-        gridColumn: span.column,
-      });
-    }
-  });
-
-  it('names the ticket in the title column as well as inside the bar', () => {
-    const { container } = renderTimeline(spans());
-    // The 12rem title column exists BECAUSE a one-week bar clips its own
-    // label — that is the whole reason the row is not just a bar. Every other
-    // assertion in this file reaches a name through the bar button or through
-    // a side entry, so emptying `.gn-timeline__title-text` made every name
-    // vanish from the column with the suite at 26/26.
-    const rows = [...container.querySelectorAll('.gn-timeline__row')].map((row) => ({
-      title: row.querySelector('.gn-timeline__title-text')?.textContent,
-      bar: row.querySelector('.gn-timeline__bar')?.textContent,
-    }));
-    expect(rows).toHaveLength(4);
-    // The four names really arrived — a pairwise check alone would be
-    // satisfied by an empty column beside an equally empty bar. Sorted,
-    // because the row order is the model's business and 11.81 pins it.
-    expect(rows.map((row) => row.title).sort()).toEqual(
-      [INSIDE, OVER_START, OVER_END, OVER_BOTH].map((span) => span.title).sort(),
-    );
-    // And each row names its OWN ticket in both places.
-    for (const row of rows) expect(row.title).toBe(row.bar);
-    // The copy counted above is the title column's, never the bar's.
-    for (const node of container.querySelectorAll('.gn-timeline__title-text')) {
-      expect(node.closest('.gn-timeline__bar')).toBeNull();
-      expect(node.closest('.gn-timeline__title')).not.toBeNull();
-    }
-  });
-
-  it('the header reserves the title column, so week i heads the column bar i lands on', () => {
-    const { container } = renderTimeline(spans());
-    // A PROXY, and named as one. jsdom computes no layout, so nothing here can
-    // assert that a label sits over its bar. What it CAN assert is the
-    // structure that alignment rests on: the weeks grid opens with one empty
-    // spacer cell before the week cells, which is why week `i` occupies column
-    // `i + 2` — exactly what the bar's computed `grid-column` says above.
-    // Deleting the spacer slides every label one column left of the bar it
-    // labels, and no assertion in this file could see it.
-    const weeks = container.querySelector('.gn-timeline__weeks');
-    const cells = [...(weeks?.children ?? [])];
-    const weekCells = container.querySelectorAll('[data-week]');
-    expect(weekCells.length).toBeGreaterThan(0);
-    expect(cells).toHaveLength(weekCells.length + 1);
-    expect(cells[0]).toHaveClass('gn-timeline__corner');
-    expect(cells[0]?.textContent).toBe('');
-    expect(cells[0]?.hasAttribute('data-week')).toBe(false);
-    expect(cells.slice(1).every((cell) => cell.hasAttribute('data-week'))).toBe(true);
-  });
-
-  it('marks each clipped end at the end that was clipped, and nowhere else', () => {
-    renderTimeline(spans());
-    const clipping = [INSIDE, OVER_START, OVER_END, OVER_BOTH].map((span) => {
-      const bar = screen.getByRole('button', { name: span.title });
-      return {
-        title: span.title,
-        start: bar.getAttribute('data-clipped-start'),
-        end: bar.getAttribute('data-clipped-end'),
-      };
-    });
-    expect(clipping).toEqual([
-      { title: 'Inside', start: null, end: null },
-      { title: 'Over start', start: 'true', end: null },
-      { title: 'Over end', start: null, end: 'true' },
-      { title: 'Over both', start: 'true', end: 'true' },
-    ]);
+    const plain = ticket({ fields: { title: claimField('Plain'), startDate: claimField({ date: '2026-09-01' }), dueDate: claimField({ date: '2026-09-02' }) } });
+    renderTimeline([withClaim, plain]);
+    const rowOfFiled = screen.getByRole('button', { name: 'Filed' }).closest('.gn-timeline__row') as HTMLElement;
+    expect(rowOfFiled.querySelector('[data-custom-claims]')).not.toBeNull();
+    expect(rowOfFiled.querySelector('[data-custom-claims]')).toHaveTextContent(customLabel('Filed on', '2026-08-26'));
+    expect(rowOfFiled.querySelector('.gn-timeline__bar [data-custom-claims]')).toBeNull();
+    expect((screen.getByRole('button', { name: 'Plain' }).closest('.gn-timeline__row') as HTMLElement).querySelector('[data-custom-claims]')).toBeNull();
+  });
+});
+
+describe('29.105 the pages are gone from the source', () => {
+  it('29.105 no Earlier / Later, SHIFT_DAYS, weeksCount, anchor option or week-column grid remains in the timeline source or in ui.css; control: the scan finds a planted one', () => {
+    const here = dirname(fileURLToPath(import.meta.url));
+    const files = ['timeline-view.tsx', 'timeline-model.ts', 'timeline-layout.ts'].map((f) => readFileSync(join(here, '../../src/timeline', f), 'utf8'));
+    const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
+    const banned = /SHIFT_DAYS|weeksCount|--timeline-week-columns|--timeline-bar-lead|TimelineWeekCol|TimelineBarSpan|TIMELINE_OUT_OF_WINDOW_COPY|>\s*Earlier\s*<|>\s*Later\s*</;
+    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
+    for (const text of files) expect(banned.test(code(text))).toBe(false);
+    expect(banned.test(css.replace(/\/\*[\s\S]*?\*\//g, ''))).toBe(false);
+    expect(banned.test('const SHIFT_DAYS = 28;')).toBe(true);
   });
 });
 
@@ -647,7 +770,7 @@
     const { container } = renderTimeline([filed()]);
     const claim = screen.getByText(customLabel('Filed on', '2026-08-26', 'user_anselma'));
     expect(claim).toHaveAttribute('data-field-id', 'filed-on');
-    expect(claim.closest('.gn-timeline__title')).not.toBeNull();
+    expect(claim.closest('.gn-timeline__row')).not.toBeNull();
     // The list is beside the ticket, never a cell in the week grid: it is not
     // inside the bar, and the bar is the only thing this row puts on a column.
     expect(claim.closest('.gn-timeline__bar')).toBeNull();
@@ -658,7 +781,7 @@
     renderTimeline([filed()]);
     expect(screen.getByRole('button', { name: 'Dated' })).toHaveAttribute(
       'title',
-      [
+      IN_PROGRESS + [
         barProvenance(
           { date: '2026-08-24', actorId: 'user_kiro' },
           { date: '2026-08-28', actorId: 'user_kiro' },
@@ -724,7 +847,7 @@
     expect(container.querySelector('[data-custom-claims]')).toBeNull();
     expect(screen.getByRole('button', { name: 'Dated' })).toHaveAttribute(
       'title',
-      barProvenance(
+      IN_PROGRESS + barProvenance(
         { date: '2026-08-24', actorId: 'user_kiro' },
         { date: '2026-08-28', actorId: 'user_kiro' },
         userName,
@@ -858,124 +981,6 @@
   });
 });
 
-describe('11.82 the window width is the model\'s, stated once', () => {
-  it('draws the default eight columns and publishes the count for the grids to read', () => {
-    const { container } = renderTimeline([]);
-    const root = container.querySelector('.gn-timeline');
-    expect(container.querySelectorAll('[data-week]')).toHaveLength(8);
-    expect(root).toBeInstanceOf(HTMLElement);
-    // The TRACK LIST, not a bare count: `14.375rem var(--timeline-week-columns)`
-    // substitutes a var as a component of the value, where
-    // `repeat(var(--n), minmax(0, 1fr))` would substitute one into a function
-    // argument — a form no test here could check, since jsdom computes no
-    // layout. `minmax(0, 1fr)` per week track (Board prototype port Task 11,
-    // spec Timeline `:506-538`) rather than a bare `1fr`: a plain `1fr` track
-    // carries an implicit automatic minimum of `auto` (min-content), so a
-    // long bar could still push a column wider than its share and defeat
-    // `.gn-timeline__bar`'s own ellipsis truncation.
-    expect((root as HTMLElement).style.getPropertyValue('--timeline-week-columns')).toBe(
-      'repeat(8, minmax(0, 1fr))',
-    );
-  });
-
-  it('forwards weeksCount unchanged rather than restating the default', () => {
-    const { container } = renderTimeline([], { weeksCount: 2 });
-    const root = container.querySelector('.gn-timeline');
-    expect([...container.querySelectorAll('[data-week]')].map((n) => n.getAttribute('data-week'))).toEqual([
-      '2026-08-17',
-      '2026-08-24',
-    ]);
-    expect((root as HTMLElement).style.getPropertyValue('--timeline-week-columns')).toBe(
-      'repeat(2, minmax(0, 1fr))',
-    );
-  });
-
-  it('the stylesheet that CONSUMES the track list names the property the component publishes', () => {
-    const { container } = renderTimeline([]);
-    const root = container.querySelector('.gn-timeline');
-    expect(root).toBeInstanceOf(HTMLElement);
-    const inline = (root as HTMLElement).style;
-    const published = [...Array(inline.length).keys()]
-      .map((index) => inline.item(index))
-      .filter((name) => name.startsWith('--'));
-    // The NAME is not typed here — only the count. Typing it would make this
-    // file a third spelling of the property, which is the duplication the case
-    // exists to catch; the length is what says the component publishes exactly
-    // one custom property and that `published[0]` below means something.
-    expect(published).toHaveLength(1);
-
-    // The count was de-duplicated INSIDE this component and then restated
-    // across a package boundary: the producer is here, the consumer is
-    // `packages/ui/src/ui.css`, and nothing tied the two spellings together.
-    // Typing `--timeline-week-colummns` on the ui side left ui 34/34 AND
-    // app-core 26/26 green — a `var()` naming an undefined property with no
-    // fallback is invalid at computed-value time, so `grid-template-columns`
-    // becomes `none`, every row drops onto implicit auto-placed tracks, and
-    // each bar keeps a `grid-column` indexing into them. It is outside
-    // `tokens.test.ts`'s var scan on purpose: that scan covers `--gn-` roles,
-    // and a track list is not a colour.
-    //
-    // The name comes from the RENDERED COMPONENT above, so a rename on either
-    // side of the boundary reddens here and names the other side.
-    const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
-    const consumed = [...css.matchAll(/var\((--timeline-[a-z0-9-]*)\)/g)].map((hit) => hit[1]);
-    // The walk really read a stylesheet that reads the property — an empty
-    // match list would satisfy a subset check by finding nothing at all.
-    expect(consumed.length).toBeGreaterThan(0);
-    expect([...new Set(consumed)]).toEqual(published);
-
-    // And the SUBSTITUTION FORM, which a name check cannot see. `14.375rem
-    // var(--…)` substitutes the property as a plain COMPONENT of the value;
-    // `repeat(var(--…), minmax(0, 1fr))` substitutes into a function
-    // argument, fails to parse, and turns the whole declaration into `none`
-    // — the same silent collapse as the typo, behind the same green suite,
-    // because jsdom computes no layout.
-    // The leading-track width is pinned DELIBERATELY, and it couples this
-    // app-core case to a ui width: what is load-bearing is that exactly ONE
-    // track precedes the week track list, because that is where the bar's
-    // `grid-column: i + 2` gets its `+ 2`. A ui-side change to the number of
-    // leading tracks must be seen here; a change to the width alone will
-    // redden this too, and re-reading this comment is the intended cost —
-    // paid here: Board prototype port Task 11 (2026-09-16, spec Timeline
-    // `:506-538`) widens the leading track from Plan 9's 12rem to the spec's
-    // 230px (14.375rem). Still exactly one leading track, so the `+ 2` math
-    // is unaffected.
-    expect(css).toContain(`grid-template-columns: 14.375rem var(${published[0]});`);
-    expect(css).not.toMatch(/repeat\(\s*var\(--timeline-/);
-  });
-
-  it('refuses a window it cannot mean rather than restating or clamping the default', () => {
-    // `weeksCount` is forwarded, never defaulted here. `0` is the input that
-    // separates a forward from a rescue: a `|| 8`, a `Math.max(1, …)` or any
-    // clamp in this component swallows the model's refusal and silently draws
-    // a window nobody asked for.
-    //
-    // MEASURED AND REPORTED AS A SURVIVOR: `?? 8` is NOT killed by this case.
-    // `0 ?? 8` is `0`, `null` is not type-legal for this prop, and `undefined`
-    // maps to the model's own 8 — so no input discriminates the forward from
-    // that one restatement. The doc comment on `TimelineViewProps` forbids it;
-    // nothing here proves it absent.
-    expect(() => renderTimeline([], { weeksCount: 0 })).toThrow(RangeError);
-  });
-
-  it('states the column template ONCE: no inline grid-template-columns anywhere', () => {
-    const { container } = renderTimeline([
-      ticket({
-        fields: {
-          title: claimField('Dated'),
-          startDate: claimField({ date: '2026-08-24' }),
-          dueDate: claimField({ date: '2026-08-28' }),
-        },
-      }),
-    ]);
-    // The plan writes the template twice — header row and every ticket row —
-    // from one expression. Two statements that can disagree would slide every
-    // bar off the column it names, silently.
-    expect(container.querySelectorAll('[style*="grid-template-columns"]')).toHaveLength(0);
-    expect(container.querySelectorAll('.gn-timeline__row').length).toBeGreaterThan(0);
-  });
-});
-
 /**
  * E4-28 (batch B15, case `11.223`) — the timeline's own half of the same
  * finding calendar-view.test.tsx's `11.222` covers: a bar's rendered text is
@@ -1014,99 +1019,6 @@
   });
 });
 
-describe('23.142 timeline bars end on their real day, and today has a line (audit PV-10)', () => {
-  const bar = (title: string, start: string, due: string) =>
-    ticket({ fields: { title: claimField(title), startDate: claimField({ date: start }), dueDate: claimField({ date: due }) } });
-  const barOf = (title: string) => screen.getByRole('button', { name: title });
-  const days = (title: string) => {
-    const node = barOf(title);
-    return { from: Number(node.getAttribute('data-day-from')), to: Number(node.getAttribute('data-day-to')) };
-  };
-  const prop = (title: string, name: string) => barOf(title).style.getPropertyValue(name);
-
-  it('23.142 a bar spans [start day, end day]: Mon–Wed is THREE day columns and Mon–Fri leaves the weekend free', () => {
-    // The window opens on Mon 17 Aug, so Mon 24 Aug is day 7.
-    renderTimeline([
-      bar('Mon to Wed', '2026-08-24', '2026-08-26'),
-      bar('Mon to Fri', '2026-08-24', '2026-08-28'),
-      bar('Across the weekend', '2026-08-26', '2026-09-01'),
-    ]);
-    expect(days('Mon to Wed')).toEqual({ from: 7, to: 9 });
-    expect(days('Mon to Wed').to - days('Mon to Wed').from + 1).toBe(3);
-    // Days inside the week the bar starts/ends in: the bar's margins are these, as a share of its own weeks.
-    expect(prop('Mon to Wed', '--timeline-bar-lead')).toBe('0');
-    expect(prop('Mon to Wed', '--timeline-bar-tail')).toBe('4');
-    expect(prop('Mon to Fri', '--timeline-bar-tail')).toBe('2');
-    expect(prop('Mon to Fri', '--timeline-bar-weeks')).toBe('1');
-    // Two weeks, starting Wednesday and ending Tuesday.
-    expect(days('Across the weekend')).toEqual({ from: 9, to: 15 });
-    expect(prop('Across the weekend', '--timeline-bar-lead')).toBe('2');
-    expect(prop('Across the weekend', '--timeline-bar-tail')).toBe('5');
-    expect(prop('Across the weekend', '--timeline-bar-weeks')).toBe('2');
-    expect(barOf('Across the weekend')).toHaveStyle({ gridColumn: '3 / 5' });
-
-    // CONTROL — a bar that fills whole weeks (Mon–Sun) has no lead and no tail: the week index and the day
-    // index agree exactly where the old whole-week answer was right, so the new one is not a different drawing.
-    document.body.innerHTML = '';
-    renderTimeline([bar('Whole week', '2026-08-24', '2026-08-30')]);
-    expect(prop('Whole week', '--timeline-bar-lead')).toBe('0');
-    expect(prop('Whole week', '--timeline-bar-tail')).toBe('0');
-    expect(days('Whole week')).toEqual({ from: 7, to: 13 });
-  });
-
-  it('23.142 a bar clipped by the window keeps its edge on the window and zero lead / tail there', () => {
-    renderTimeline([bar('Runs past the end', '2026-10-05', '2026-12-31'), bar('Starts before', '2026-08-01', '2026-08-19')], {
-      weeksCount: 8,
-    });
-    // 8 weeks from 17 Aug is 56 days (0–55).
-    expect(days('Runs past the end').to).toBe(55);
-    expect(prop('Runs past the end', '--timeline-bar-tail')).toBe('0');
-    expect(days('Starts before').from).toBe(0);
-    expect(prop('Starts before', '--timeline-bar-lead')).toBe('0');
-    expect(prop('Starts before', '--timeline-bar-tail')).toBe('4');
-  });
-
-  it('23.142 a today line sits on the prop\'s day in every row, and is absent when today is outside the window', () => {
-    const { container, unmount } = renderTimeline([bar('One', '2026-08-24', '2026-08-26'), bar('Two', '2026-08-25', '2026-08-27')], {
-      today: '2026-08-26',
-    });
-    const lines = [...container.querySelectorAll<HTMLElement>('.gn-timeline__today')];
-    // One per row — "spanning the rows" — drawn for the eye only.
-    expect(lines).toHaveLength(2);
-    for (const line of lines) {
-      expect(line).toHaveAttribute('aria-hidden', 'true');
-      // The window opens on the Monday of today's week (24 Aug), so Wed 26 Aug is day 2: the first week (column 2), two days in.
-      expect(line).toHaveStyle({ gridColumn: '2 / 3' });
-      expect(line.style.getPropertyValue('--timeline-today-lead')).toBe('2');
-    }
-    unmount();
-
-    // CONTROL — the line follows the PROP, not a device clock: a day inside the window moves it.
-    const moved = renderTimeline([bar('One', '2026-08-24', '2026-08-26')], { today: '2026-08-17' });
-    expect(moved.container.querySelector('.gn-timeline__today')?.getAttribute('style')).toContain('--timeline-today-lead: 0');
-    moved.unmount();
-  });
-
-  it('23.142 paging away from today removes the line, while the bar that spans both windows keeps its row; Today brings it back', () => {
-    // The window opens on the Monday of the `today` prop, so a different `today` would MOVE the window and no row
-    // would render for a line to sit in. The real case is the person paging away: `today` stays, the window moves.
-    const { container } = renderTimeline([bar('Spans both', '2026-08-24', '2026-10-02')], { today: '2026-08-26', weeksCount: 2 });
-    const line = () => container.querySelector('.gn-timeline__today');
-    expect(barOf('Spans both')).toBeInTheDocument();
-    expect(line()).not.toBeNull();
-
-    // Later is 28 days: the window is now 21 Sep – 4 Oct and today (26 Aug) is behind it.
-    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
-    // The row is STILL there (the bar runs to 2 Oct), so a missing line is the model's answer, not an empty chart.
-    expect(barOf('Spans both')).toBeInTheDocument();
-    expect(container.querySelectorAll('.gn-timeline__row').length).toBeGreaterThan(0);
-    expect(line()).toBeNull();
-
-    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
-    expect(line()).not.toBeNull();
-  });
-});
-
 describe('23.143 the undated list speaks to the person and offers "Add dates" (audit PV-11)', () => {
   const bare = (title: string) => ticket({ fields: { title: claimField(title) } });
 
```

**Kills** (mutants of this task's `timeline-view.tsx`, Step 5, unless named otherwise):
- 11.73 / 11.80 / the third `title` leg (the edited `IN_PROGRESS + ...` expectations): (a) drop `mark?.word` from `detail` (b) put the word after the provenance in `detail`.
- 11.80 "the claim under its own field name" (the edited `.closest('.gn-timeline__row')` leg): (a) render `CustomClaimList` once per lane instead of inside `TimelineBar`'s row.
- 29.099 the toolbar: (a) add an `Earlier` button to the toolbar (b) `value={'week'}` instead of `preset ?? 'free'` (the Day click leg) (c) `variant="tabs"` on the zoom switch (no `radiogroup`) (d) `if (frame.moving)` instead of `if (!frame.moving)` around `setPpd` (the zoom never settles into the state, Week stays marked).
- 29.099 the axis: (a) `data-weekend={isWeekend(d.day - firstDay)}` (the share of tinted days is unchanged; the Sat 29 and Sun 30 legs red) (b) drop the `gn-timeline__axis-row--days` row (c) `week: isWeekend(day) ? ...` instead of `isMonday(day)` (no `W 24 Aug`).
- 29.095 dated work a year away is drawn: (a) `const range = band` always (drop the `unmeasured` branch: the 2027 bar is outside the band around today) (b) `hasContent = sideList.length > 0` in the model (the empty sentence shows over a drawn bar).
- 29.097 `--dn` and the day numbers: (a) `'--dn': row.endDay - row.startDay` (b) `'--d0': row.startDay` without `- firstDay` (the new W 24 Aug leg; the difference leg alone survives it) (c) `data-day-to={row.startDay}`.
- 29.097 no window: (a) `const range = band` always (b) the surface width from weeks: `` `calc(var(--tl-ppd) * ${Math.ceil(extentDays / 7)} * 1px)` ``.
- 29.097 no stylesheet number in the markup: (a) `DEFAULT_PPD = ZOOM_PRESETS.day` (`--tl-ppd` is 56) (b) a bar `style={{ left: ... }}` in px.
- 29.098 packing: (a) `layoutRow={0}` for every bar (b) `--lane-extent` written as `${lane.rows * 40}px` (the 34 px heading dropped).
- 29.100 the key: (a) `outside = row.key !== null && barPx >= measure(row.key)` (b) drop `row.key` from `detail` (c) drop `!outside &&` from the inside key (the key-count leg reads 3).
- 29.100 the state mark: (a) swap the glyphs in `stateMark` (b) drop `mark?.word` from `detail` (c) `stateMark` returns the play mark for `'open'` too.
- 29.101 the today line: (a) drop `model.todayDay !== null &&` (an invalid day draws a line with no `data-day`) (b) `'--d0': model.todayDay` without `- firstDay` (the new W 24 Aug leg) (c) drop `props.today` from the model's `useMemo` deps (a new prop does not move the line).
- 29.102 the mounted band: (a) `const range = { start: firstDay, end: firstDay + extentDays - 1 }` always (Bar 0 mounted) (b) the first-frame `setBand(mountRange(adapter.visibleRange()))` written as `setBand(adapter.visibleRange())` (the band is the visible days only, so Bars 29 and 69 are unmounted) (c) `anchorDay = model.firstDay ?? model.todayDay ?? 0` (Bar 49 unmounted) (d) delete the first-frame `setBand` line (the 54-day guess stays, so Bars 28 and 70 are mounted; planner ruling 2026-10-04).
- 29.102 the source scan: (a) delete `memo(` around `TimelineBar`.
- 29.102 the render count: lands in T12 (T12's `it`, counted through its `timelinePinLabel` mock). Until then T9's own guard is the source scan, so `onOpen={(id) => props.onOpenTicket(id)}` (memo defeated, the scan stays green) is a KNOWN T9 SURVIVOR, killed in T12; record it in the HANDOFF.
- 29.103 the claim list: (a) render `CustomClaimList` inside the `<button>` (b) drop `row.customClaims.length > 0 &&` (an empty list on Plain) (c) the claim `<li>` prints `entry.claim.date` instead of `entry.label`.
- 29.105 the pages are gone: (a) `const SHIFT_DAYS = 28;` left in `timeline-view.tsx` (b) a `--timeline-week-columns` declaration left in `ui.css` (Step 6).

`packages/app-core/test/views/phone-project-views-hooks.test.tsx`:

```diff
--- a/packages/app-core/test/views/phone-project-views-hooks.test.tsx
+++ b/packages/app-core/test/views/phone-project-views-hooks.test.tsx
@@ -10,7 +10,7 @@
 
 /**
  * The web app on phones, Plan Task 8 — the CLASS HOOKS the phone rules for List / Backlog (21.111), Calendar
- * (21.112) and Timeline (21.113) key on. `apps/web/test/phone-project-views.test.ts` pins the CSS; this pins
+ * (21.112) and Timeline (29.107, which was 21.113 until the continuous Timeline) key on. `apps/web/test/phone-project-views.test.ts` pins the CSS; this pins
  * that the components CARRY the classes that CSS paints, in the structure its selectors assume (a `td` under a
  * `tr` under a `tbody` under a `.gn-list__table`; a week row holding the days and the items).
  */
@@ -81,29 +81,26 @@
   });
 });
 
-describe('21.113 the Timeline carries the classes its scroller rules key on', () => {
-  it('21.113 .gn-timeline > header + .gn-timeline__weeks and, under a group, .gn-timeline__row grid rows', () => {
-    const ticket: TicketState = {
-      kind: 'ticket',
-      id: 't1',
-      workspaceId: 'ws_1',
-      projectId: 'p1',
-      typeId: 'task',
-      parentId: null,
-      workflowId: 'wf_basic',
-      workflowVersion: 1,
-      stateId: 'doing',
-      stateCategory: 'active',
-      assigneeId: null,
-      collaboratorIds: [],
-      fields: {
-        title: { value: 'A dated ticket', actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
-        startDate: { value: { date: '2026-08-24' }, actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
-        dueDate: { value: { date: '2026-08-28' }, actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
-      },
-      transitions: [],
-    };
-    const { container } = render(
+describe('29.107 the Timeline carries the classes its scroller and its portrait rules key on', () => {
+  const claim = (value: unknown) => ({ value, actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' });
+  const ticket: TicketState = {
+    kind: 'ticket',
+    id: 't1',
+    workspaceId: 'ws_1',
+    projectId: 'p1',
+    typeId: 'task',
+    parentId: null,
+    workflowId: 'wf_basic',
+    workflowVersion: 1,
+    stateId: 'doing',
+    stateCategory: 'active',
+    assigneeId: null,
+    collaboratorIds: [],
+    fields: { title: claim('A dated ticket'), startDate: claim({ date: '2026-08-24' }), dueDate: claim({ date: '2026-08-28' }) },
+    transitions: [],
+  };
+  const renderIt = () =>
+    render(
       <TimelineView
         tickets={[{ state: ticket, pendingFieldIds: [], customDateFields: [] }]}
         today="2026-08-23"
@@ -111,14 +108,18 @@
         onOpenTicket={vi.fn()}
       />,
     );
-    const root = container.querySelector('.gn-timeline');
+
+  it('29.107 .gn-timeline > toolbar + stage > canvas > surface > axis, and under a lane the .gn-timeline__row wrappers (21.113, retitled: the week band and the column template are gone)', () => {
+    const root = renderIt().container.querySelector('.gn-timeline');
     expect(root).not.toBeNull();
-    // The scroller's direct children: the toolbar (made sticky), the week band, the groups.
-    expect(root?.querySelector(':scope > header.gn-timeline__header')).not.toBeNull();
-    expect(root?.querySelectorAll(':scope > .gn-timeline__weeks')).toHaveLength(1);
-    // The row is a grid row under a group — the element the 40rem floor is on.
-    expect(root?.querySelector(':scope > .gn-timeline__group > .gn-timeline__row')).not.toBeNull();
-    // CONTROL — the week band and the row share one column template through the component's own CSS variable.
-    expect((root as HTMLElement).style.getPropertyValue('--timeline-week-columns')).toMatch(/^repeat\(\d+, minmax\(0, 1fr\)\)$/);
+    // The panel's direct children: the toolbar, the stage that holds the scroller, nothing else but the optional note and side list.
+    expect(root?.querySelector(':scope > header.gn-timeline__toolbar')).not.toBeNull();
+    expect(root?.querySelectorAll(':scope > .gn-timeline__stage')).toHaveLength(1);
+    // The scroller, its one surface, the sticky axis, and a lane holding the row wrappers the bars hang from.
+    expect(root?.querySelector(':scope > .gn-timeline__stage > .gn-timeline__canvas > .gn-timeline__surface > .gn-timeline__axis')).not.toBeNull();
+    expect(root?.querySelector('.gn-timeline__surface > .gn-timeline__lane > .gn-timeline__row > .gn-timeline__bar')).not.toBeNull();
+    // CONTROL: the week band and its column template do not exist any more.
+    expect(root?.querySelector('.gn-timeline__weeks')).toBeNull();
+    expect((root as HTMLElement).style.getPropertyValue('--timeline-week-columns')).toBe('');
   });
 });
```

**Kills** (`timeline-view.tsx`, Step 5): 29.107 the class structure: (a) render the canvas directly under `.gn-timeline` (drop the `.gn-timeline__stage` wrapper) (b) keep `className="gn-timeline__header"` on the toolbar (c) render `TimelineBar`'s `<button>` without its `.gn-timeline__row` wrapper.

`packages/app-core/test/calendar/clock-free.test.ts`:

```diff
--- a/packages/app-core/test/calendar/clock-free.test.ts
+++ b/packages/app-core/test/calendar/clock-free.test.ts
@@ -3,6 +3,7 @@
 import { fileURLToPath } from 'node:url';
 import { describe, expect, it } from 'vitest';
 import { buildCalendarModel } from '../../src/calendar/calendar-model.js';
+import { dayNumberOf } from '../../src/timeline/timeline-days.js';
 import { buildTimelineModel } from '../../src/timeline/timeline-model.js';
 import { monthGridWeeks } from '../../src/claims/dates.js';
 import type { TicketDatesInput } from '../../src/claims/ticket-dates.js';
@@ -127,13 +128,15 @@
 /**
  * 11.60 — the timeline view-model, held to the same standard, and the reason
  * it needs its own case rather than riding the calendar's: the calendar only
- * ever COMPARES day strings, while the timeline divides a millisecond
- * difference to get a week index. That arithmetic is where a device getter
- * would place the same claim in a different column depending on who is
- * looking, and it is the only place in this surface that does any.
+ * ever COMPARES day strings, while the timeline turns a claimed day into a
+ * day NUMBER (`dayNumberOf`, a millisecond difference divided by a day). That
+ * arithmetic is where a device getter would place the same claim on a
+ * different day depending on who is looking, and it is the only place in this
+ * surface that does any. (The week index it used to divide into is gone with
+ * the week columns; the day number is what the continuous axis is made of.)
  */
 describe('11.60 the timeline view-model reads no clock either', () => {
-  it('the whole model — weeks, bars, side list — is byte-identical in every zone', () => {
+  it('the whole model — day numbers, extent, side list — is byte-identical in every zone', () => {
     const inputs = [
       ticket(
         {
@@ -147,20 +150,19 @@
     ];
     const models = ZONES.map((zone) =>
       underZone(zone, () =>
-        JSON.stringify(buildTimelineModel(inputs, { anchor: '2026-08-23', userName })),
+        JSON.stringify(buildTimelineModel(inputs, { today: '2026-08-23', userName })),
       ),
     );
     expect(new Set(models).size).toBe(1);
-    // The window's two edge days really rendered — an empty model must not
-    // pass this by being empty, and both ends are where a zone shift lands.
-    expect(models[0]).toContain('2026-08-17');
-    expect(models[0]).toContain('2026-10-11');
-    // And the arithmetic actually ran: an unclipped span across all 8 columns.
-    expect(models[0]).toContain('"fromWeek":0');
-    expect(models[0]).toContain('"toWeek":7');
-  });
-
-  it('the week a claim falls in is the same week in every zone, on the Sunday|Monday seam', () => {
+    // The span's two edge days really rendered, as day numbers (20682 = 2026-08-17, 20737 = 2026-10-11) — an empty model
+    // must not pass this by being empty, and both ends are where a zone shift lands.
+    expect(models[0]).toContain(`"startDay":${dayNumberOf('2026-08-17')}`);
+    expect(models[0]).toContain(`"endDay":${dayNumberOf('2026-10-11')}`);
+    expect(dayNumberOf('2026-10-11') - dayNumberOf('2026-08-17')).toBe(55);
+    expect(models[0]).toContain(`"todayDay":${dayNumberOf('2026-08-23')}`);
+  });
+
+  it('a claimed day is the same day number in every zone, on the Sunday|Monday seam', () => {
     const seam = ZONES.map((zone) =>
       underZone(zone, () => {
         const model = buildTimelineModel(
@@ -171,12 +173,14 @@
               dueDate: claimField({ date: '2026-08-23' }),
             }),
           ],
-          { anchor: '2026-08-23', userName },
+          { today: '2026-08-23', userName },
         );
-        return model.groups[0]?.rows[0]?.bar.fromWeek;
+        return model.groups[0]?.rows[0]?.startDay;
       }),
     );
-    expect(seam).toEqual([0, 0, 0, 0]);
+    expect(seam).toEqual(ZONES.map(() => dayNumberOf('2026-08-23')));
+    // CONTROL: the Monday after is the next number, so the seam is a real boundary and not one day for everything.
+    expect(dayNumberOf('2026-08-24')).toBe(dayNumberOf('2026-08-23') + 1);
   });
 });
 
```

**Kills** (`timeline-model.ts`, Step 3):
- 11.60 "the whole model is byte-identical in every zone": (a) `startDay: Math.floor(new Date(`${start.date}T00:00`).getTime() / 86_400_000)` (a local-time parse: the four zones disagree) (b) `todayDay` dropped from the returned model (the `"todayDay":20688` leg).
- 11.60 "a claimed day is the same day number in every zone": (a) the same local-time parse for `startDay` (Pacific/Kiritimati and Asia/Kolkata, east of UTC, land on 20687; Niue and UTC on 20688).

  The UI stylesheet and token tests (a NEW file, plus three edited ones: the roster is 53 now, the weeks-band and clipped-edge rows are gone, the second inverted-zebra family retired with the grid):

`packages/ui/test/timeline-continuous.test.ts` (new):

```ts
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './helpers/contrast.js';
import { parseRules, ruleExactly, rulesNaming, valueOf } from './helpers/css-rules.js';
import { cssOf } from './helpers/style-patterns.js';
import { CONTRAST_PAIRS, TOKEN_ROLES, colorOf, cssVariableName, themeStylesheet } from '../src/tokens.js';

/** Workflow and Timeline graphs, Part 1, T9 — cases 29.104 (the weekend role) and 29.106 (the stylesheet contract). */
const STYLES = ['hig', 'minimal', 'neo'] as const;
const THEMES = ['light', 'dark'] as const;

describe('29.104 the weekend tint is one opaque role whose day numbers clear 4.5:1 in every style and theme', () => {
  it('29.104 the role is declared, opaque and exported; textMuted on it is a declared pair at 4.5; control: a translucent tint would fail the opaque check', () => {
    expect(TOKEN_ROLES as readonly string[]).toContain('timelineWeekend');
    expect(cssVariableName('timelineWeekend')).toBe('--gn-timeline-weekend');
    const sheet = themeStylesheet();
    expect(sheet).toContain('--gn-timeline-weekend:');
    for (const style of STYLES) {
      for (const theme of THEMES) {
        const tint = colorOf(theme, 'timelineWeekend', style);
        // Opaque: the day numbers are measured on THIS colour, not on whatever it composites over.
        expect(tint, `${style}/${theme}`).toMatch(/^#[0-9a-f]{6}$/);
        const ratio = contrastRatio(colorOf(theme, 'textMuted', style), tint);
        expect(ratio, `${style}/${theme}: textMuted on the weekend tint`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // The pair is DECLARED, so tokens.test.ts's every-pair loop guards it in all six combinations.
    expect(CONTRAST_PAIRS.some((p) => p.fg === 'textMuted' && p.bg === 'timelineWeekend' && p.minimum === 4.5)).toBe(true);
    // CONTROL: the opaque pattern rejects an 8-digit (translucent) hex, so the assertion above can fail.
    expect('#e8ded480').not.toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('29.106 the Timeline stylesheet is the continuous canvas: one scroller, packed 28 px bars, no paging', () => {
  const ui = cssOf('ui');
  const names = (selector: string): number => rulesNaming(ui, selector).length;

  it('29.106 the canvas scrolls and contains its overscroll; the bar is 28 px on a 40 px pitch; the axis is sticky; rows are transparent to layout', () => {
    const canvas = ruleExactly(ui, '.gn-timeline__canvas');
    expect(valueOf(canvas, 'overflow')).toBe('auto');
    expect(valueOf(canvas, 'overscroll-behavior')).toBe('contain');
    const bar = ruleExactly(ui, '.gn-timeline__bar');
    expect(valueOf(bar, 'height')).toBe('28px');
    expect(valueOf(bar, 'top')).toBe('calc(34px + var(--row) * 40px + 6px)');
    expect(valueOf(bar, 'container-type')).toBe('inline-size');
    expect(valueOf(ruleExactly(ui, '.gn-timeline__axis'), 'position')).toBe('sticky');
    expect(valueOf(ruleExactly(ui, '.gn-timeline__row'), 'display')).toBe('contents');
    // A long bar (150 px or more) shows its title: the container query that turns the title on.
    const long = ruleExactly(ui, '.gn-timeline__bar .gn-timeline__title-text', '@container (min-width: 150px)');
    expect(valueOf(long, 'display')).toBe('block');
    // The minimum height (TG-13) and the weekend tile (seven days of the packing scale).
    expect(valueOf(ruleExactly(ui, '.gn-timeline'), 'min-height')).toBe('20rem');
    expect(valueOf(ruleExactly(ui, ['.gn-timeline__surface', '.gn-timeline__axis']), 'background-size')).toBe('calc(var(--tl-ppd) * 7px) 100%');
  });

  it('29.106 nothing of the paged grid survives: no weeks band, no header grid, no zebra, no clipped edges, no phone arm for the timeline', () => {
    for (const retired of ['.gn-timeline__weeks', '.gn-timeline__header', '.gn-timeline__corner', '.gn-timeline__week', '.gn-timeline__row:nth-of-type(odd)']) {
      expect(names(retired), retired).toBe(0);
    }
    expect(ui).not.toContain('timeline-week-columns');
    expect(ui).not.toContain('data-clipped');
    // The phone is a portrait ORIENTATION chosen by the view (PK-7), not a media-query arm of the same grid.
    const phoneArms = parseRules(ui).filter((r) => r.atRule !== null && r.atRule.includes('max-width') && r.selectors.some((s) => s.includes('.gn-timeline')));
    expect(phoneArms.map((r) => r.selectors.join(', '))).toEqual([]);
    // CONTROL: the same filter does find a view's phone arm where one exists (the calendar keeps its own), so the empty list
    // above is the stylesheet's answer and not a filter that can match nothing.
    expect(parseRules(ui).some((r) => r.atRule !== null && r.atRule.includes('max-width') && r.selectors.some((s) => s.includes('.gn-calendar')))).toBe(true);
    // CONTROL: the scan can see a timeline rule at all.
    expect(names('.gn-timeline__bar')).toBeGreaterThan(0);
  });

  it('29.106 the Today pill keeps the quiet nav treatment; reduced motion stops the re-pack glide', () => {
    const nav = ruleExactly(ui, '.gn-timeline__nav');
    expect(valueOf(nav, 'border')).toBe('1px solid var(--gn-border)');
    expect(valueOf(nav, 'min-height')).toBe('2.75rem');
    const calm = ruleExactly(ui, ['.gn-timeline__bar', '.gn-timeline__key--outside'], '@media (prefers-reduced-motion: reduce)');
    expect(valueOf(calm, 'transition')).toBe('none');
  });
});
```

**Kills** (`tokens.ts` and `ui.css`, Step 6):
- 29.104 the weekend role: (a) map `timelineWeekend` to an 8-digit (translucent) primitive in one style (b) delete the `{ fg: 'textMuted', bg: 'timelineWeekend', minimum: 4.5 }` row (c) map `timelineWeekend` to `labelWarmDark` in a dark arm (the 4.5 ratio leg).
- 29.106 the canvas: (a) bar `height: 28px` to `30px` (b) bar `top` to `calc(34px + var(--row) * 40px + 8px)` (c) drop `overscroll-behavior: contain` (d) the weekend tile `* 7px` to `* 6px` in `background-size`.
- 29.106 nothing of the paged grid: (a) keep a `.gn-timeline__weeks` rule (b) keep the old `@media (max-width: 40rem) { .gn-timeline { ... } }` arm (c) keep `.gn-timeline__row:nth-of-type(odd)`.
- 29.106 Today pill and reduced motion: (a) `.gn-timeline__nav` `min-height: 2.25rem` (b) delete the `@media (prefers-reduced-motion: reduce)` block.

`packages/ui/test/tokens.test.ts`:

```diff
--- a/packages/ui/test/tokens.test.ts
+++ b/packages/ui/test/tokens.test.ts
@@ -1536,8 +1536,8 @@
     // No two rows share a pair: a duplicate is a row that guards nothing new but inflates the count below (UX fixes T1
     // fix 1). Asserted BEFORE the count so a re-added copy fails here, by name, and not only as a number that moved.
     expect(new Set(CONTRAST_PAIRS.map((pair) => `${pair.fg}|${pair.bg}`)).size, 'duplicate fg|bg rows').toBe(CONTRAST_PAIRS.length);
-    // HK-4 (2026-10-02, 24.121): 56 minus the four retired fieldRim rows.
-    expect(CONTRAST_PAIRS.length).toBe(52);
+    // HK-4 (2026-10-02, 24.121): 56 minus the four retired fieldRim rows, plus one: textMuted on timelineWeekend (Workflow and Timeline graphs Part 1 T9, 29.104).
+    expect(CONTRAST_PAIRS.length).toBe(53);
     // And no minimum sits below the floor these rows exist to state, so
     // "re-cleared" cannot have been reached by relaxing a bar to meet a result.
     expect(CONTRAST_PAIRS.every((pair) => pair.minimum >= 3)).toBe(true);
@@ -1818,17 +1818,17 @@
  * first is its PARITY — the prototype stripes `(i % 2 ? …)` over a 0-based `i`
  * (`desktop.dc.html:3159`, blob `6d7b67c0a52c`), so the tint falls on the
  * **1-indexed EVEN** rows. That is the whole content of the construct and it is
- * silently invertible: **two families in this repo already inverted it**
- * (`.gn-list__table-row`, `ui.css:1088`; `.gn-timeline__row`, `:2703` — both
- * `odd`). The second is that the stripe is VISIBLE — a fill that composites to
+ * silently invertible: **two families in this repo inverted it**
+ * (`.gn-list__table-row`, `ui.css:1088`, still `odd`; `.gn-timeline__row`, `:2703`, `odd` until the paged Timeline grid retired in
+ * Workflow and Timeline graphs Part 1 T9). The second is that the stripe is VISIBLE — a fill that composites to
  * its own ground is a stripe that draws nothing, the identical defect class
  * 13.920 measured for the state chip under `neo`.
  *
  * **What the control does and does not prove, because a control is where this
  * repo's defects hide.** The parity case reads the selector out of `ui.css`, so
  * the parity it asserts is the stylesheet's and not this file's. The control
- * then reads the two inverted siblings **through the same instrument, on the
- * same token**, and asserts their parity is the OTHER one — proving the two
+ * then reads the inverted sibling (the list's; the Timeline's retired with its paged grid) **through the same instrument, on the
+ * same token**, and asserts its parity is the OTHER one — proving the two
  * parity strings are distinguishable here and that this rule is not merely
  * matching a sibling. **It does not prove how a browser stripes**, which needs a
  * rendered page and which no case in this repo has; and it does not prove the
@@ -1871,7 +1871,7 @@
     return new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? null;
   };
 
-  it('the parity is EVEN, and the two inverted families read ODD — the control', () => {
+  it('the parity is EVEN, and the inverted list family reads ODD — the control', () => {
     // LOOK THIS STRING UP IN THE FILE FIRST. It is what makes the parity
     // assertions below facts about `ui.css` rather than about a literal in this
     // test: if the selector is not in the stylesheet, nothing after it means
@@ -1882,12 +1882,11 @@
     expect(ZEBRA).not.toMatch(/odd/);
 
     // THE CONTROL — same instrument, same TOKEN, the OPPOSITE parity, on the
-    // two families this port measured as inverted. See the docblock for what
+    // family this port measured as inverted. See the docblock for what
     // this does and does not prove.
-    const inverted = [
-      { selector: '.gn-list__table-row:nth-child(odd)', label: 'gn-list' },
-      { selector: '.gn-timeline__row:nth-of-type(odd)', label: 'gn-timeline' },
-    ] as const;
+    // The Timeline's `.gn-timeline__row:nth-of-type(odd)` was the second inverted family; it retired with the paged grid
+    // (Workflow and Timeline graphs Part 1 T9, 29.106), so the control reads the one that is left.
+    const inverted = [{ selector: '.gn-list__table-row:nth-child(odd)', label: 'gn-list' }] as const;
     const siblingParities = new Set<string>();
     for (const { selector, label } of inverted) {
       const body = declarationsFor(UI_CSS_TEXT, selector);
```

**Kills:** the roster count (`toBe(53)`): (a) delete the new `CONTRAST_PAIRS` row in `tokens.ts` (52) (b) add it twice (the duplicate check). The zebra control: none, guards existing behaviour (the list family's ODD parity; the retired Timeline sibling leaves the control list because its rule is deleted in Step 6).

`packages/ui/test/neo-hk4-field-rim.test.ts`:

```diff
--- a/packages/ui/test/neo-hk4-field-rim.test.ts
+++ b/packages/ui/test/neo-hk4-field-rim.test.ts
@@ -24,9 +24,9 @@
 });
 
 describe('24.121 the four fieldRim contrast rows are gone and every other row stays', () => {
-  it('24.121 no CONTRAST_PAIRS row names fieldRim; the roster is 52 (56 minus the four)', () => {
+  it('24.121 no CONTRAST_PAIRS row names fieldRim; the roster is 53 (56 minus the four, plus one for the weekend tint, 29.104)', () => {
     expect(CONTRAST_PAIRS.filter((p) => (p.fg as string) === 'fieldRim' || (p.bg as string) === 'fieldRim')).toEqual([]);
-    expect(CONTRAST_PAIRS.length).toBe(52);
+    expect(CONTRAST_PAIRS.length).toBe(53);
     // CONTROL: the rows beside them are untouched.
     expect(CONTRAST_PAIRS.some((p) => p.fg === 'border' && p.bg === 'surfaceWell' && p.minimum === 3)).toBe(true);
     expect(CONTRAST_PAIRS.some((p) => p.fg === 'textAccent' && p.bg === 'surfaceTrack' && p.minimum === 4.5)).toBe(true);
```

**Kills:** 24.121 the roster is 53: (a) delete the `textMuted` / `timelineWeekend` row (52) (b) re-add a `fieldRim` row (existing guard).

`packages/ui/test/styling-b8-timeline.test.ts`:

```diff
--- a/packages/ui/test/styling-b8-timeline.test.ts
+++ b/packages/ui/test/styling-b8-timeline.test.ts
@@ -2,10 +2,9 @@
 import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';
 import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';
 
-/** Styling refresh Plan B, Task B8 — cases 20.271–20.272 (§20.28). */
+/** Styling refresh Plan B, Task B8 — cases 20.271–20.272 (§20.28). The weeks-band and clipped-edge rows were retired by Workflow and Timeline graphs Part 1 T9 (29.106). */
 const ROWS: RosterRow[] = [
   { sheet: 'ui', selectors: '.gn-timeline__nav', pattern: 'P-QUIET' },
-  { sheet: 'ui', selectors: '.gn-timeline__weeks', declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)' } },
   { sheet: 'ui', selectors: '.gn-timeline__side', declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)' } },
 ];
 /** Every property the two views' navs must agree on (13.1147's pair, restated). */
@@ -22,9 +21,9 @@
       expect(valueOf(timeline, property), `nav pair: ${property}`).not.toBeNull();
       expect(valueOf(timeline, property), `nav pair: ${property}`).toBe(valueOf(calendar, property));
     }
-    // Control: the states the surface still bears are declared.
-    expectRow({ sheet: 'ui', selectors: '.gn-timeline__bar[data-clipped-start]', declarations: { 'border-left': '2px dashed var(--gn-border-strong)' } });
-    expectRow({ sheet: 'ui', selectors: '.gn-timeline__bar[data-clipped-end]', declarations: { 'border-right': '2px dashed var(--gn-border-strong)' } });
+    // Control: the states the surface still bears are declared. The clipped-edge rows are retired with the paging (29.106): a bar is
+    // never cut at a window edge on a continuous axis, so the in-transit outline is the only bar state left.
+    expectRow({ sheet: 'ui', selectors: '.gn-timeline__bar[data-pending]', declarations: { outline: '2px dashed var(--gn-pending)' } });
     expectRow({
       sheet: 'ui',
       selectors: ['.gn-timeline__side-entry--start-after-due', '.gn-timeline__side-entry--unplaceable-day'],
```

**Kills:** 20.271 (narrowed): (a) delete the `.gn-timeline__bar[data-pending]` rule in Step 6's `ui.css` (the new control) (b) restore `min-height: 2.25rem` on `.gn-timeline__nav` (existing). 20.272: none, guards existing behaviour (no flat boundary in the timeline rules).

  Build and run (expected RED: the model has no `startDay`, the view has no canvas): `pnpm turbo run build --filter=@gisik-nokma/viewport --filter=@gisik-nokma/ui && slot-run.sh ac -- pnpm --filter @gisik-nokma/app-core exec vitest run test/timeline test/calendar/clock-free.test.ts test/views/phone-project-views-hooks.test.tsx --maxWorkers=2 > /tmp/ac.log 2>&1; tail -n 40 /tmp/ac.log`.

- [ ] **Step 3: The model**

  Full replacement of the file's content (the diff against the old file is mostly deletions of the window arithmetic and the long precedence comments that described it):

`packages/app-core/src/timeline/timeline-model.ts` (new):

```ts
import type { TicketState } from '@gisik-nokma/domain';
import {
  TIMELINE_EMPTY_COPY,
  TIMELINE_SIDE_LIST_COPY,
  TIMELINE_SIDE_LIST_NO_DATES_COPY,
  TIMELINE_SIDE_LIST_UNDRAWABLE_COPY,
  barProvenance,
  contradictionCopy,
  customClaimLabel,
  dueClaimLabel,
  startClaimLabel,
  unplaceableDayCopy,
  type UserNameFn,
} from '../claims/claim-labels.js';
import { isCalendarDay } from '../claims/dates.js';
import {
  customDateClaimsOf,
  dateClaimOf,
  titleOf,
  type CustomDateClaimView,
  type DateClaimView,
  type TicketDatesInput,
} from '../claims/ticket-dates.js';
import { matchesFilter } from '../filter/matches-filter.js';
import { epicAncestorOf, isBuiltinEpicType, type IsEpicType } from '../hierarchy/epic-ancestor.js';
import type { FilterSpec } from '../view-types.js';
import { dayNumberOf } from './timeline-days.js';

/** A claimed custom date field with its attributed rendering. Never geometry. */
export type TimelineCustomClaim = { claim: CustomDateClaimView; label: string };

/**
 * Why a ticket is beside the timeline rather than on it.
 *
 * `unplaceable-day` is NOT in the plan's four and is not a taste call: the
 * other four are each a statement the model would otherwise make falsely about
 * a ticket whose claimed day is not a day. Calling it `due-only` would deny a
 * start claim the ticket carries; calling it `start-after-due` would assert an
 * ordering between a real day and one that does not exist. See
 * `unplaceableDayCopy`.
 */
export type TimelineSideReason =
  | 'no-dates'
  | 'start-only'
  | 'due-only'
  | 'start-after-due'
  | 'unplaceable-day';

/**
 * One bar. `startDay` and `endDay` are DAY NUMBERS (days since 1970-01-01, see `timeline-days.ts`), INCLUSIVE at both
 * ends, and never clipped: the axis is continuous (TV-1), so a period is drawn where it was claimed and the viewport
 * decides what is in view. `key` is the ticket key for the label on the bar (TV-5), `null` when the ledger holds no prefix.
 */
export type TimelineRow = {
  ticketId: string;
  title: string;
  key: string | null;
  startDay: number;
  endDay: number;
  startClaim: DateClaimView;
  dueClaim: DateClaimView;
  pending: boolean;
  provenance: string;
  customClaims: TimelineCustomClaim[];
};

export type TimelineSideEntry = {
  ticketId: string;
  title: string;
  reason: TimelineSideReason;
  startClaim: DateClaimView | null;
  dueClaim: DateClaimView | null;
  note: string;
  customClaims: TimelineCustomClaim[];
};

export type TimelineGroup = { epicId: string | null; epicTitle: string; rows: TimelineRow[] };

/**
 * Where one ticket landed, or why it landed nowhere.
 *
 * The two silent arms are the point of this union. A ticket that produces
 * neither a row nor a side entry has been removed for a REASON, and the two
 * reasons are different facts a viewer needs told apart — which is exactly
 * what the model could not say before, because it said nothing at all.
 */
type TimelinePlacement =
  | { kind: 'row'; epicId: string | null; row: TimelineRow }
  | { kind: 'side'; entry: TimelineSideEntry }
  /** An undated epic: a lane, not missing work. */
  | { kind: 'lane-heading' };

export type TimelineModel = {
  /**
   * `today` as a day number, or `null` when no `today` was passed or it is not a real day. The line is the view's;
   * the model only says which day (it reads no clock: `today` is an input).
   */
  todayDay: number | null;
  /** The earliest `startDay` and latest `endDay` over every drawn bar, or `null` when nothing is drawn. */
  firstDay: number | null;
  lastDay: number | null;
  groups: TimelineGroup[];
  sideList: TimelineSideEntry[];
  sideListCopy: string;
  /**
   * Why the timeline is empty, or null when it is not: `TIMELINE_EMPTY_COPY`, whose one sentence names the set of
   * narrowings that can keep a claim off the chart (the page narrows `tickets` upstream, so the model cannot tell a
   * filter that matched nobody from a workspace nobody dated, and does not pretend to).
   *
   * **The second arm is gone (continuous axis, 2026-10-03, TV-9).** There used to be a sentence for work that was
   * fully dated and sat outside the eight weeks; on one continuous axis every dated bar is drawn and reachable by
   * panning, so "outside the window" is no longer a state of the data. What replaces it is the VIEW's "Nothing in
   * view" pill with its jump controls, which needs the viewport and so cannot be a model answer. The `narrowedAway`
   * guard that picked between the two sentences went with the arm it chose between.
   */
  emptyCopy: string | null;
};

export type TimelineModelOptions = {
  /** An IST day, injected — never read from a device. Absent: no today line. */
  today?: string;
  userName: UserNameFn;
  filter?: FilterSpec;
  laneEpicId?: string | null;
  /**
   * What counts as an epic, for the lane filter, the grouping AND the
   * undated-epic skip. Defaults to the built-in type id; a shell that has
   * resolved the workspace's type roster should pass its own rank-1 test.
   *
   * The plan hardcoded `typeId === 'epic'` at the skip while routing grouping
   * through `epicAncestorOf`'s injectable predicate. A workspace whose rank-1
   * type is "Initiative" would then have its undated initiative land in the
   * side list as MISSING WORK while the same model grouped under it — the
   * product disagreeing with itself inside one function.
   */
  isEpicType?: IsEpicType;
  /**
   * AN EPIC'S OWN CLAIMS ARE NOT DRAWN HERE — the owner's ruling of
   * 2026-09-20, whose full statement and whose counting rationale live on
   * `calendar-model.ts`'s `hideEpicRows`. Read that one; the two options are
   * ONE rule with two spellings only because the two models are separate files,
   * and a second full argument here would be a second thing to keep true.
   *
   * ⚠ WHAT THE TIMELINE ADDS, AND IT IS THE WHOLE REASON THIS OPTION IS NOT
   * JUST A FILTER OF ITS INPUTS. A lane here IS the epic — `groupTitle` reads
   * `byId`, `byId` is built from the COMPLETE input set one line above `visible`
   * *"before narrowing: an ancestor removed by a filter still names the lane its
   * child belongs to"*, and `rowsWithEpic` reaches a lane through each child's
   * `epicAncestorOf`. So removing the epic's own placement removes the epic's
   * bar and nothing else: a lane that still holds a dated child keeps its
   * heading, titled with the epic's name, which is exactly the shape the owner
   * ruled for the Backlog's section headers — **visible as a NAME, absent as a
   * ticket.** Reaching the same outcome by dropping epics from `inputs` instead
   * would empty `byId`, move every child into `NO_EPIC_TITLE`, and delete the
   * heading — the drawn absence this ruling's own addendum forbids.
   */
  hideEpicRows?: boolean;
};

export const NO_DATES_NOTE = 'no claimed dates';

/**
 * The same side-list slot for a ticket that DOES carry custom date claims
 * but no start/needed-by pair. Saying "no claimed dates" there would be
 * false — the note narrows to exactly what is missing.
 */
export const NO_DAY_CLAIMS_NOTE = 'no claimed start or needed-by';

const NO_EPIC_TITLE = 'No epic';

/**
 * The reasons the plain heading is true of: a ticket that is here because a
 * claim is MISSING leaves the moment both arrive. The other two do not.
 */
const MISSING_CLAIM_REASONS: ReadonlySet<TimelineSideReason> = new Set<TimelineSideReason>([
  'no-dates',
  'start-only',
  'due-only',
]);

/**
 * Gantt-lite over claims. THE rule: a bar requires BOTH a claimed start and
 * a claimed due. A single claim is a side-list entry with the claim named;
 * no claim is a side-list entry saying so; start-after-due is displayed as
 * the contradiction it is — geometry is never invented to resolve it.
 * No dependencies, no critical path: out of spec.
 *
 * NO CLOCK IS READ HERE. `today` arrives as an IST day from the shell;
 * `test/calendar/clock-free.test.ts` runs this model under four zones and
 * scans `src/timeline` for the getters that would break it.
 */
export function buildTimelineModel(
  inputs: TicketDatesInput[],
  opts: TimelineModelOptions,
): TimelineModel {
  const isEpicType = opts.isEpicType ?? isBuiltinEpicType;

  // Built from ALL inputs, before narrowing: an ancestor removed by a filter
  // still names the lane its child belongs to, and resolving against the
  // narrowed set would move filtered children into "No epic".
  const byId = new Map<string, TicketState>(inputs.map((input) => [input.state.id, input.state]));
  const visible = inputs.filter((input) => {
    if (opts.filter !== undefined && !matchesFilter(input.state, opts.filter)) return false;
    // The same ruling as the calendar's, and the same reasoning for putting it
    // HERE rather than over `inputs`: `byId` above is already built, so this
    // removes the epic's own bar from the grid and leaves its children's lanes
    // named. See this option's docblock.
    if (opts.hideEpicRows === true && isEpicType(input.state.typeId)) return false;
    if (
      opts.laneEpicId !== undefined &&
      opts.laneEpicId !== null &&
      epicAncestorOf(byId, input.state.id, isEpicType) !== opts.laneEpicId
    ) {
      return false;
    }
    return true;
  });

  function groupTitle(epicId: string | null): string {
    if (epicId === null) return NO_EPIC_TITLE;
    const state = byId.get(epicId);
    const title = state === undefined ? '' : titleOf(state);
    // An UNTITLED epic is not an epic-less lane. `titleOf(...) || 'No epic'`
    // would put a ticket that has an epic under a heading saying it has none,
    // and would render two distinct lanes identically.
    return title !== '' ? title : epicId;
  }

  /** Claims in, placement out: the ONE construction every ticket goes through. */
  function classify(input: TicketDatesInput): TimelinePlacement {
    const start = dateClaimOf(input, 'startDate');
    const due = dateClaimOf(input, 'dueDate');
    const title = titleOf(input.state);
    const ticketId = input.state.id;
    /**
     * An undated epic is a lane, not missing work — and the guard fires ONLY
     * when the epic has nothing to say. Both halves of the condition are
     * deliberate, and both are now pinned (11.62):
     *
     * - A HALF-dated epic goes to the side list like any other half-dated
     *   ticket, and still heads its lane. Widening this to `||` would suppress
     *   a claim on the grounds of the ticket's TYPE — someone claimed a start
     *   for that epic, and the whole file's rule is that a claim is shown as
     *   claimed.
     * - A FULLY dated epic gets a bar, in its own lane (`epicAncestorOf`
     *   returns self for an epic). Dropping the date condition would delete a
     *   period someone claimed because of what the ticket IS.
     *
     * This is the only statement in the function that removes a ticket from
     * BOTH outputs, so it is kept as narrow as its justification.
     */
    if (isEpicType(input.state.typeId) && start === null && due === null) {
      return { kind: 'lane-heading' };
    }

    // Custom date claims are carried, never consulted: nothing below branches
    // on them except the side-list WORDING. They cannot make a bar, move a
    // bar, or move a ticket between the rows and the side list.
    const customClaims: TimelineCustomClaim[] = customDateClaimsOf(input).map((claim) => ({
      claim,
      label: customClaimLabel(claim, opts.userName),
    }));

    /**
     * Geometry needs days that exist. Asked BEFORE any comparison or
     * arithmetic, because `2026-02-30` compares perfectly well as a string
     * and would reach `dayNumberOf`, where `dateMs` throws — blanking the
     * timeline for every other ticket in the workspace.
     */
    const unplaceable = [start, due]
      .filter((claim): claim is DateClaimView => claim !== null)
      .map((claim) => claim.date)
      .filter((day) => !isCalendarDay(day));
    if (unplaceable.length > 0) {
      return {
        kind: 'side',
        entry: {
          ticketId,
          title,
          reason: 'unplaceable-day',
          startClaim: start,
          dueClaim: due,
          note: unplaceableDayCopy(unplaceable),
          customClaims,
        },
      };
    }

    if (start !== null && due !== null && start.date <= due.date) {
      return {
        kind: 'row',
        epicId: epicAncestorOf(byId, ticketId, isEpicType),
        row: {
          ticketId,
          title,
          key: input.key ?? null,
          startDay: dayNumberOf(start.date),
          endDay: dayNumberOf(due.date),
          startClaim: start,
          dueClaim: due,
          pending: start.pending || due.pending,
          provenance: barProvenance(start, due, opts.userName),
          customClaims,
        },
      };
    }

    if (start !== null && due !== null) {
      return {
        kind: 'side',
        entry: {
          ticketId,
          title,
          reason: 'start-after-due',
          startClaim: start,
          dueClaim: due,
          note: contradictionCopy(start, due),
          customClaims,
        },
      };
    }
    if (due !== null) {
      return {
        kind: 'side',
        entry: {
          ticketId,
          title,
          reason: 'due-only',
          startClaim: null,
          dueClaim: due,
          note: dueClaimLabel(due, opts.userName),
          customClaims,
        },
      };
    }
    if (start !== null) {
      return {
        kind: 'side',
        entry: {
          ticketId,
          title,
          reason: 'start-only',
          startClaim: start,
          dueClaim: null,
          note: startClaimLabel(start, opts.userName),
          customClaims,
        },
      };
    }
    return {
      kind: 'side',
      entry: {
        ticketId,
        title,
        reason: 'no-dates',
        startClaim: null,
        dueClaim: null,
        // "no claimed dates" would be false of a ticket carrying a "Filed on".
        note: customClaims.length > 0 ? NO_DAY_CLAIMS_NOTE : NO_DATES_NOTE,
        customClaims,
      },
    };
  }

  const rowsWithEpic: Array<{ epicId: string | null; row: TimelineRow }> = [];
  const sideList: TimelineSideEntry[] = [];
  for (const input of visible) {
    const placement = classify(input);
    if (placement.kind === 'row') rowsWithEpic.push({ epicId: placement.epicId, row: placement.row });
    else if (placement.kind === 'side') sideList.push(placement.entry);
  }

  const groupsById = new Map<string | null, TimelineGroup>();
  for (const { epicId, row } of rowsWithEpic) {
    const existing = groupsById.get(epicId);
    if (existing !== undefined) existing.rows.push(row);
    else groupsById.set(epicId, { epicId, epicTitle: groupTitle(epicId), rows: [row] });
  }
  for (const group of groupsById.values()) {
    group.rows.sort((a, b) =>
      a.startClaim.date < b.startClaim.date
        ? -1
        : a.startClaim.date > b.startClaim.date
          ? 1
          : a.ticketId < b.ticketId
            ? -1
            : a.ticketId > b.ticketId
              ? 1
              : 0,
    );
  }
  const groups = [...groupsById.values()].sort((a, b) => {
    if (a.epicId === null) return 1;
    if (b.epicId === null) return -1;
    if (a.epicTitle !== b.epicTitle) return a.epicTitle < b.epicTitle ? -1 : 1;
    // Two epics may share a title; ordering by id keeps the answer the same
    // twice rather than leaving it to input order.
    return a.epicId < b.epicId ? -1 : a.epicId > b.epicId ? 1 : 0;
  });

  /**
   * The heading must be true of every entry UNDER it.
   *
   * `TIMELINE_SIDE_LIST_COPY` says a ticket needs "a start and a due date" to
   * be placed — a leaving condition that a
   * `start-after-due` entry already satisfies while sitting in the list, and
   * that an `unplaceable-day` entry can satisfy too. So the exhaustive
   * sentence is reached only when every entry really is here for a missing
   * claim, exactly as `emptyCopy` reaches `CALENDAR_ALL_HIDDEN_COPY` only when
   * nothing the MODEL narrowed was removed from this grid. ⚠ **"The model
   * narrowed" is load-bearing and narrower than "the legend is the only cause":
   * the calendar's gate cannot see the page's upstream pruning, so that
   * sentence is reachable while false today.** See `calendar-model.ts`'s
   * precedence note; do not restate the condition here as exclusivity.
   */
  // THREE sentences, each true of every entry under it (UX fixes T8, 23.143): "no dates yet" is false of a ticket
  // that has one date, and the leaving-condition sentence is false of a start-after-due entry.
  const sideListCopy = !sideList.every((entry) => MISSING_CLAIM_REASONS.has(entry.reason))
    ? TIMELINE_SIDE_LIST_UNDRAWABLE_COPY
    : sideList.length > 0 && sideList.every((entry) => entry.reason === 'no-dates')
      ? TIMELINE_SIDE_LIST_NO_DATES_COPY
      : TIMELINE_SIDE_LIST_COPY;

  const hasContent = groups.length > 0 || sideList.length > 0;
  const emptyCopy = hasContent ? null : TIMELINE_EMPTY_COPY;

  // `today` is a day the shell vetted (`istDayOf`); a malformed or foreign string must not reach `dateMs`, which throws.
  const todayDay = opts.today !== undefined && isCalendarDay(opts.today) ? dayNumberOf(opts.today) : null;

  let firstDay: number | null = null;
  let lastDay: number | null = null;
  for (const group of groups) {
    for (const row of group.rows) {
      firstDay = firstDay === null ? row.startDay : Math.min(firstDay, row.startDay);
      lastDay = lastDay === null ? row.endDay : Math.max(lastDay, row.endDay);
    }
  }
  return { todayDay, firstDay, lastDay, groups, sideList, sideListCopy, emptyCopy };
}
```

- [ ] **Step 4: Copy and exports**

`packages/app-core/src/claims/claim-labels.ts`:

```diff
--- a/packages/app-core/src/claims/claim-labels.ts
+++ b/packages/app-core/src/claims/claim-labels.ts
@@ -236,27 +236,7 @@
  * `timeline-view.test.tsx`'s "names only controls the TIMELINE has".
  */
 export const TIMELINE_EMPTY_COPY =
-  'No claimed dates are here to draw. Undated work is absent, not estimated. The timeline draws only the periods someone claimed. If a claim is here and not drawn, a narrowing kept it off these weeks without dropping it: your filter, closed tickets being hidden, or an epic, which is drawn in the List and not here.';
-
-/**
- * The THIRD empty timeline, and the ONE case the component cannot reconstruct
- * from its own props: the work is fully dated, coherent, placeable, and simply
- * scheduled elsewhere in time.
- *
- * Task 11's props carry `tickets`, `filter` and `laneEpicId` but nothing about
- * the window, so a component asked to work this out would have to redo the day
- * arithmetic — a second statement of where the window is, free to disagree
- * with the model's.
- *
- * DELIBERATELY NOT EXHAUSTIVE ("dated work here sits outside", not "every
- * piece of dated work"). A filter can remove work that would ALSO have missed
- * the window, which leaves this arm reachable with a second narrowing live —
- * and an exhaustive sentence there would be the `CALENDAR_ALL_HIDDEN_COPY`
- * failure in timeline clothes. The quantifier is what would be false; the fact
- * stated is true either way.
- */
-export const TIMELINE_OUT_OF_WINDOW_COPY =
-  'Dated work here sits outside the weeks in view. Nothing was dropped. Move the window Earlier or Later to reach it.';
+  'No claimed dates are here to draw. Undated work is absent, not estimated. The timeline draws only the periods someone claimed. If a claim is here and not drawn, a narrowing kept it off this chart without dropping it: your filter, closed tickets being hidden, or an epic, which is drawn in the List and not here.';
 
 /**
  * A claimed day that no calendar has, named rather than silently dropped.
```

`packages/app-core/src/index.ts`:

```diff
--- a/packages/app-core/src/index.ts
+++ b/packages/app-core/src/index.ts
@@ -223,7 +223,6 @@
   CALENDAR_ALL_HIDDEN_COPY,
   CALENDAR_EMPTY_MONTH_COPY,
   TIMELINE_EMPTY_COPY,
-  TIMELINE_OUT_OF_WINDOW_COPY,
   TIMELINE_SIDE_LIST_COPY,
   TIMELINE_SIDE_LIST_NO_DATES_COPY,
   TIMELINE_SIDE_LIST_UNDRAWABLE_COPY,
@@ -280,7 +279,6 @@
   NO_DATES_NOTE,
   NO_DAY_CLAIMS_NOTE,
   buildTimelineModel,
-  type TimelineBarSpan,
   type TimelineCustomClaim,
   type TimelineGroup,
   type TimelineModel,
@@ -288,14 +286,11 @@
   type TimelineRow,
   type TimelineSideEntry,
   type TimelineSideReason,
-  type TimelineWeekCol,
 } from './timeline/timeline-model.js';
 // Plan 9 Task 11 — the week columns over that model. Named exports with the
 // `.js` extension, matching every block above; `export *` would re-export this
 // module's internal helpers (`CustomClaimList`, `sideEntryClassName`) as
-// package surface. `SHIFT_DAYS` is deliberately not listed: nothing outside
-// the component reads it, and its own test measures the shift by the columns
-// that move rather than by re-stating the constant.
+// package surface.
 export { TimelineView, type TimelineViewProps } from './timeline/timeline-view.js';
 export { dayNumberOf, isoDayOf } from './timeline/timeline-days.js';
 // Plan 9 Task 12 — the inbox. Named exports with the `.js` extension, matching
```

  Run `grep -rn "TIMELINE_OUT_OF_WINDOW_COPY\|TimelineBarSpan\|TimelineWeekCol\|TimelineBarDays" packages apps --include='*.ts' --include='*.tsx'` (no output outside tests you have already changed; fix any other consumer, e.g. a web page that read `model.weeks`).

- [ ] **Step 5: The view**

  Full replacement. Read the docblock first: it is the contract. The three things that look odd and are deliberate: the `adapter.animateTo({ offset: ... }, { instant: true })` on mount (the view opens centred on today, not scrolled from day zero), the `unmeasured` branch (jsdom and hidden tabs mount every bar), and the `rebase(firstDay)` effect (data that arrives to the left keeps the same day at the viewport edge).

`packages/app-core/src/timeline/timeline-view.tsx` (new):

```tsx
import {
  ScrollAdapter,
  ZOOM_PRESETS,
  axisLevels,
  crossFade,
  isMonday,
  isWeekend,
  mondayOnOrBefore,
  mountRange,
  panLimits,
  presetOf,
  type DayRange,
  type Frame,
  type ZoomPreset,
} from '@gisik-nokma/viewport';
import { SegmentedControl } from '@gisik-nokma/ui';
import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { UserNameFn } from '../claims/claim-labels.js';
import type { TicketDatesInput } from '../claims/ticket-dates.js';
import type { IsEpicType } from '../hierarchy/epic-ancestor.js';
import type { FilterSpec } from '../view-types.js';
import { isoDayOf } from './timeline-days.js';
import { barsInRange, layoutLanes, type KeyMeasure, type LayoutLane } from './timeline-layout.js';
import {
  buildTimelineModel,
  type TimelineCustomClaim,
  type TimelineRow,
  type TimelineSideReason,
} from './timeline-model.js';

/**
 * The continuous timeline (spec 2026-10-03, Part 1, TV-1 to TV-11).
 *
 * One axis, no pages. The surface is a native scroll container (`ScrollAdapter`, `@gisik-nokma/viewport`) holding one tall
 * element; every bar is placed by CSS from three custom properties (`--d0`, `--dn`, `--row`) and ONE scale property
 * (`--tl-ppd`, px per day), so a zoom frame is a property write and a scroll write and never a React render. React re-renders
 * on three slow events only: the data changes, the zoom SETTLES (rows may re-pack, PK-4), or the view nears the edge of the
 * mounted band (PR-5).
 *
 * Everything this component decides is ARRANGEMENT. What a claim is, what it says, which lane a ticket sits in, why the
 * timeline is empty and which heading the side list carries are the model's answers, rendered verbatim.
 *
 * ## No colour literal
 *
 * Classes here, CSS in `packages/ui/src/ui.css`. The only inline styles are the computed numbers: a bar's day offset, length
 * and row, a lane's offset and extent, and the surface's length.
 *
 * ## No clock
 *
 * `today` is a prop, converted to a day number by the model. The engine's clock reads (`requestAnimationFrame`,
 * `performance.now`) live in `packages/viewport/src/dom/`, outside the clock-free roots, so
 * `test/calendar/clock-free.test.ts` still scans this file's source for device getters and finds none.
 *
 * ## jsdom has no layout
 *
 * A container 0 px wide (jsdom, or a hidden tab) has no viewport to virtualise against, so the view mounts every bar then;
 * with a real width it mounts the band `[visible - V, visible + V]` (PR-5).
 */

export type TimelineViewProps = {
  tickets: TicketDatesInput[];
  /** The IST day, injected by the shell. See the clock note above. */
  today: string;
  userName: UserNameFn;
  onOpenTicket: (ticketId: string) => void;
  filter?: FilterSpec;
  laneEpicId?: string | null;
  /**
   * WHAT THIS WORKSPACE CALLS AN EPIC — forwarded UNCHANGED, never defaulted here: `buildTimelineModel` states the default
   * (`isBuiltinEpicType`) and `epic-ancestor.ts` states why it is deliberately narrower than the server's rank-1 rule. It
   * reaches two answers in the model: `epicAncestorOf` (the lane filter and the grouping) and the undated-epic arm that
   * decides an undated epic's side-list entry.
   */
  isEpicType?: IsEpicType;
  /**
   * THE OWNER'S RULING (2026-09-20): an epic draws a row in the List and nowhere else, so this view does not draw the
   * epic's OWN bar. A lane that still holds a dated child keeps its heading, titled with the epic's name: the epic stays
   * visible as a NAME and goes absent as a ticket. Forwarded unchanged; see `calendar-model.ts`'s `hideEpicRows`.
   */
  hideEpicRows?: boolean;
};

/** The default zoom on open: the Week preset, 24 px per day (the Home mockup's scale). */
const DEFAULT_PPD: number = ZOOM_PRESETS.week;
/** The margin on each side of the drawn days is one viewport at the default zoom; this is its width before it is measured. */
const FALLBACK_WIDTH_PX = 960;
const KEY_PADDING_PX = 12;
/** TG-13: the panel fills the height under the filters, but never less than this. */
const MIN_PANEL_PX = 320;
const PANEL_BOTTOM_GAP_PX = 16;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * A ticket's custom date claims, beside the ticket rather than across the
 * weeks — they are facts about the work, not spans of it. Each label is the
 * model's attributed rendering, printed verbatim.
 */
function CustomClaimList(props: { claims: readonly TimelineCustomClaim[] }) {
  return (
    <ul className="gn-timeline__claims" data-custom-claims="">
      {props.claims.map((entry) => (
        <li
          key={entry.claim.fieldId}
          className="gn-timeline__claim"
          data-field-id={entry.claim.fieldId}
          data-pending={entry.claim.pending ? 'true' : undefined}
        >
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * One modifier per reason, ONE-TO-ONE, and the `never` arm is the point.
 *
 * The plan's draft predates `unplaceable-day` and switches over four reasons;
 * a fifth falling through such a switch produces no class at all — a row that
 * renders, and says nothing about why it cannot be drawn, in a suite that
 * stays green. The exhaustive default makes a sixth reason a COMPILE error
 * rather than a silent blank.
 *
 * It is 1:1 rather than bucketed into "missing a claim" and "cannot be drawn"
 * even though only two treatments exist in `ui.css` today: the model already
 * owns that partition (`MISSING_CLAIM_REASONS`, which chooses the side-list
 * heading) and does not export it. A two-arm switch here would be a second
 * statement of the same grouping, free to disagree with the heading printed
 * directly above the rows it grouped. CSS decides which modifiers look alike.
 *
 * Today CSS gives the two undrawable reasons a treatment and the three
 * missing-claim ones none — deliberately, and documented at the rules in
 * `ui.css`. That is what makes the arms below dangerous: an arm returning the
 * wrong missing-claim class, or the empty string, changes nothing on screen
 * AND nothing in a suite that only asks whether a row was classed. The
 * compiler proves this switch is exhaustive; it proves nothing about what the
 * arms RETURN. All five VALUES are pinned by exact whole-class equality in
 * `test/timeline/timeline-view.test.tsx` 11.77.
 */
function sideEntryClassName(reason: TimelineSideReason): string {
  switch (reason) {
    case 'no-dates':
      return 'gn-timeline__side-entry gn-timeline__side-entry--no-dates';
    case 'start-only':
      return 'gn-timeline__side-entry gn-timeline__side-entry--start-only';
    case 'due-only':
      return 'gn-timeline__side-entry gn-timeline__side-entry--due-only';
    case 'start-after-due':
      return 'gn-timeline__side-entry gn-timeline__side-entry--start-after-due';
    case 'unplaceable-day':
      return 'gn-timeline__side-entry gn-timeline__side-entry--unplaceable-day';
    default: {
      const exhaustive: never = reason;
      throw new RangeError(`unknown side-list reason: ${String(exhaustive)}`);
    }
  }
}


type MeasureContext = { font: string; measureText(text: string): { width: number } };

/**
 * The width of a key on a bar, in px. A cached canvas measurement where the browser has one (`OffscreenCanvas`); a 6.5 px
 * per character estimate where it does not (jsdom). The estimate only decides whether a label is drawn outside its bar.
 */
function useKeyMeasure(): KeyMeasure {
  return useMemo(() => {
    const cache = new Map<string, number>();
    let context: MeasureContext | null | undefined;
    const measureWithCanvas = (text: string): number | null => {
      if (context === undefined) {
        context = typeof OffscreenCanvas === 'function' ? (new OffscreenCanvas(1, 1).getContext('2d') as MeasureContext | null) : null;
        if (context) context.font = '600 11px system-ui, sans-serif';
      }
      return context ? context.measureText(text).width : null;
    };
    return (key) => {
      if (key === null || key === '') return 0;
      const held = cache.get(key);
      if (held !== undefined) return held;
      const width = Math.ceil((measureWithCanvas(key) ?? key.length * 6.5) + KEY_PADDING_PX);
      cache.set(key, width);
      return width;
    };
  }, []);
}

/**
 * TV-11: the panel fills the height under the filters. Measured, not guessed: the panel's top edge to the bottom of the window,
 * re-read when the window resizes (a phone rotating, a keyboard opening). A flex parent cannot do this alone because the
 * project page's filter bar and the panel are siblings of unknown heights inside a scrolling page.
 */
function useFillHeight(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const fit = (): void => {
      const available = window.innerHeight - el.getBoundingClientRect().top - PANEL_BOTTOM_GAP_PX;
      el.style.height = `${Math.max(MIN_PANEL_PX, Math.floor(available))}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [ref]);
}

/** Month and week labels for the days in [first, last]: `month` marks the 1st, `week` marks each Monday ("W 28 Sep"). */
function axisLabels(first: number, last: number): Array<{ day: number; month: string | null; week: string | null; number: string }> {
  const out: Array<{ day: number; month: string | null; week: string | null; number: string }> = [];
  for (let day = first; day <= last; day += 1) {
    const iso = isoDayOf(day);
    const dom = Number(iso.slice(8, 10));
    const monthName = MONTHS[Number(iso.slice(5, 7)) - 1] ?? '';
    out.push({
      day,
      month: dom === 1 ? `${monthName} ${iso.slice(0, 4)}` : null,
      week: isMonday(day) ? `W ${dom} ${monthName}` : null,
      number: String(dom),
    });
  }
  return out;
}

/** TG-14: status is never colour alone. A finished bar carries a check, one in progress a play mark, a not-started one nothing. */
function stateMark(category: string): { glyph: string; word: string } | null {
  if (category === 'terminal') return { glyph: '✓', word: 'Done' };
  if (category === 'active') return { glyph: '▶', word: 'In progress' };
  return null;
}

type TimelineBarProps = {
  row: TimelineRow;
  /** The packed row (PK-1). */
  layoutRow: number;
  firstDay: number;
  ppd: number;
  category: string;
  measure: KeyMeasure;
  detailId: string;
  onOpen: (ticketId: string) => void;
};

/**
 * One bar and everything that travels with it. MEMOISED: the mounted band refreshes at the quarter-edge (PR-5) and almost every bar
 * in it is the same bar as a frame ago, so a refresh renders only the bars that are new. Every prop is a primitive or a value
 * that is stable between refreshes (`row` comes from the model's memo, `measure` from `useKeyMeasure`, `onOpen` from a ref).
 */
const TimelineBar = memo(function TimelineBar(props: TimelineBarProps) {
  const { row, layoutRow, firstDay, ppd, category, measure, detailId, onOpen } = props;
  const mark = stateMark(category);
  const detail = [row.key, mark?.word, row.provenance, ...row.customClaims.map((entry) => entry.label)]
    .filter((part): part is string => part !== null && part !== undefined && part !== '')
    .join('; ');
  const barPx = (row.endDay - row.startDay + 1) * ppd;
  const outside = row.key !== null && barPx < measure(row.key);
  const vars = {
    ['--d0' as string]: row.startDay - firstDay,
    ['--dn' as string]: row.endDay - row.startDay + 1,
    ['--row' as string]: layoutRow,
  } as CSSProperties;
  return (
    <div className="gn-timeline__row" data-ticket-id={row.ticketId} style={vars}>
      <button
        type="button"
        className="gn-timeline__bar"
        data-day-from={row.startDay}
        data-day-to={row.endDay}
        data-pending={row.pending ? 'true' : undefined}
        data-state={mark === null ? undefined : mark.word === 'Done' ? 'done' : 'active'}
        aria-label={row.title}
        aria-describedby={detailId}
        title={detail}
        onClick={() => onOpen(row.ticketId)}
      >
        {mark !== null && (
          <span className="gn-timeline__mark" aria-hidden="true">
            {mark.glyph}
          </span>
        )}
        {!outside && row.key !== null && <span className="gn-timeline__key">{row.key}</span>}
        <span className="gn-timeline__title-text">{row.title}</span>
      </button>
      {outside && (
        <span className="gn-timeline__key gn-timeline__key--outside" aria-hidden="true">
          {row.key}
        </span>
      )}
      {/* TV-2: custom date claims stay beside the ticket. A bar row has no room for a list, so it is a callout that opens on
          hover or focus (CSS); the labels are also in the bar's hover and description. */}
      {row.customClaims.length > 0 && <CustomClaimList claims={row.customClaims} />}
      <span id={detailId} className="gn-visually-hidden">
        {detail}
      </span>
    </div>
  );
});

export function TimelineView(props: TimelineViewProps) {
  const idPrefix = useId();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFillHeight(panelRef);
  const adapterRef = useRef<ScrollAdapter | null>(null);
  const measure = useKeyMeasure();
  const openRef = useRef(props.onOpenTicket);
  openRef.current = props.onOpenTicket;
  const openTicket = useCallback((ticketId: string): void => openRef.current(ticketId), []);

  const model = useMemo(
    () =>
      buildTimelineModel(props.tickets, {
        today: props.today,
        userName: props.userName,
        ...(props.filter === undefined ? {} : { filter: props.filter }),
        ...(props.laneEpicId === undefined ? {} : { laneEpicId: props.laneEpicId }),
        ...(props.isEpicType === undefined ? {} : { isEpicType: props.isEpicType }),
        ...(props.hideEpicRows === undefined ? {} : { hideEpicRows: props.hideEpicRows }),
      }),
    [props.tickets, props.today, props.userName, props.filter, props.laneEpicId, props.isEpicType, props.hideEpicRows],
  );

  // ---- what is drawn: the pan range (TV-3) ----
  const [widthPx, setWidthPx] = useState(FALLBACK_WIDTH_PX);
  const anchorDay = model.todayDay ?? model.firstDay ?? 0;
  const drawn: DayRange | null = model.firstDay === null || model.lastDay === null ? null : { start: model.firstDay, end: model.lastDay };
  const limits = panLimits(drawn, anchorDay, Math.ceil(widthPx / DEFAULT_PPD));
  const firstDay = mondayOnOrBefore(limits.start);
  const extentDays = limits.end - firstDay + 1;

  // ---- the motion state React needs to hear about (slow) ----
  const [ppd, setPpd] = useState(DEFAULT_PPD);
  const [moving, setMoving] = useState(false);
  const [band, setBand] = useState<DayRange>(() => mountRange({ start: anchorDay - 27, end: anchorDay + 26 }));
  const [unmeasured, setUnmeasured] = useState(false);
  const bandRef = useRef(band);
  bandRef.current = band;
  const stateRef = useRef({ firstDay, extentDays, anchorDay });
  stateRef.current = { firstDay, extentDays, anchorDay };

  // ---- the layout: packed once per lane, re-packed only when the zoom SETTLES in another bucket ----
  const layout = useMemo(() => {
    const lanes: LayoutLane[] = model.groups.map((group) => ({
      laneId: group.epicId ?? 'no-epic',
      items: group.rows.map((row) => ({ id: row.ticketId, key: row.key, startDay: row.startDay, endDay: row.endDay })),
    }));
    return layoutLanes(lanes, { ppd, measure });
  }, [model.groups, ppd, measure]);
  const rowById = useMemo(() => {
    const byId = new Map<string, TimelineRow>();
    for (const group of model.groups) for (const row of group.rows) byId.set(row.ticketId, row);
    return byId;
  }, [model.groups]);
  const categoryById = useMemo(() => new Map(props.tickets.map((t) => [t.state.id, t.state.stateCategory])), [props.tickets]);

  // ---- the adapter ----
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const width = canvas.clientWidth;
    setUnmeasured(width === 0);
    if (width > 0) setWidthPx(width);
    const adapter = new ScrollAdapter({
      element: canvas,
      axis: 'x',
      firstDay: stateRef.current.firstDay,
      scale: DEFAULT_PPD,
      extentDays: () => stateRef.current.extentDays,
      todayDay: () => stateRef.current.anchorDay,
    });
    adapterRef.current = adapter;
    adapter.animateTo({ offset: stateRef.current.anchorDay + 0.5 - adapter.viewportDays() / 2 }, { instant: true });
    const refresh = (frame: Frame): void => {
      const levels = axisLevels(frame.scale);
      canvas.style.setProperty('--tl-fade-days', String(levels.dayNumbers));
      canvas.style.setProperty('--tl-fade-weeks', String(crossFade(frame.scale, 16)));
      canvas.dataset['weekend'] = levels.weekendTint ? 'on' : 'off';
      const range = adapter.visibleRange();
      const held = bandRef.current;
      const days = range.end - range.start + 1;
      if (range.start < held.start + days / 4 || range.end > held.end - days / 4) setBand(mountRange(range));
      if (!frame.moving) {
        setPpd((current) => (Math.abs(current - frame.scale) < 1e-6 ? current : frame.scale));
      }
      setMoving((current) => (current === frame.moving ? current : frame.moving));
    };
    const off = adapter.onFrame(refresh);
    if (width > 0) setBand(mountRange(adapter.visibleRange())); // PR-5 from the first measured frame; the 54-day guess is only transitional (planner ruling 2026-10-04)
    refresh({ now: 0, offset: adapter.offset(), scale: adapter.scale(), velocity: 0, moving: false });
    return () => {
      off();
      adapter.destroy();
      adapterRef.current = null;
    };
  }, []);

  // The first day of the surface moved (data arrived to the left): keep the same day at the viewport edge.
  useLayoutEffect(() => {
    adapterRef.current?.rebase(firstDay);
  }, [firstDay]);

  // ---- toolbar ----
  const preset = presetOf(ppd);
  const zoomTo = (next: ZoomPreset): void => adapterRef.current?.animateTo({ scale: ZOOM_PRESETS[next] });
  const goToday = (): void => {
    const adapter = adapterRef.current;
    if (adapter !== null) adapter.animateTo({ offset: anchorDay + 0.5 - adapter.viewportDays() / 2 });
  };

  // ---- what to mount ----
  const range: DayRange = unmeasured ? { start: firstDay, end: firstDay + extentDays - 1 } : band;
  const labelDays = useMemo(() => axisLabels(Math.max(firstDay, range.start), Math.min(firstDay + extentDays - 1, range.end)), [firstDay, extentDays, range.start, range.end]);
  const surfaceStyle = {
    width: `calc(var(--tl-ppd) * ${extentDays} * 1px)`,
    height: `calc(var(--tl-axis-height) + ${layout.extent}px)`,
  } as CSSProperties;

  return (
    <div ref={panelRef} className="gn-timeline" data-zooming={moving ? 'true' : undefined}>
      <header className="gn-timeline__toolbar">
        <button type="button" className="gn-timeline__nav" onClick={goToday}>
          Today
        </button>
        <SegmentedControl<ZoomPreset | 'free'>
          variant="radio"
          aria-label="Timeline zoom"
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          value={preset ?? 'free'}
          onChange={(next) => {
            if (next !== 'free') zoomTo(next);
          }}
        />
      </header>

      {/* The model chose the sentence and it is rendered VERBATIM. ONE arm since 2026-10-03: nothing claimed, or a
          narrowing emptied it. "Dated work sits outside these weeks" is gone with the weeks. */}
      {model.emptyCopy !== null && (
        <p role="note" className="gn-timeline__empty">
          {model.emptyCopy}
        </p>
      )}

      <div className="gn-timeline__stage">
      <div ref={canvasRef} className="gn-timeline__canvas" role="group" aria-label="Timeline" tabIndex={0} style={{ ['--tl-ppd' as string]: DEFAULT_PPD }}>
        <div className="gn-timeline__surface" style={surfaceStyle}>
          <div className="gn-timeline__axis" aria-hidden="true">
            <div className="gn-timeline__axis-row gn-timeline__axis-row--period">
              {labelDays.map((d) =>
                d.month !== null ? (
                  <span key={`m${d.day}`} className="gn-timeline__axis-label gn-timeline__axis-label--month" style={{ ['--d0' as string]: d.day - firstDay } as CSSProperties}>
                    {d.month}
                  </span>
                ) : d.week !== null ? (
                  <span key={`w${d.day}`} className="gn-timeline__axis-label gn-timeline__axis-label--week" style={{ ['--d0' as string]: d.day - firstDay } as CSSProperties}>
                    {d.week}
                  </span>
                ) : null,
              )}
            </div>
            <div className="gn-timeline__axis-row gn-timeline__axis-row--days">
              {labelDays.map((d) => (
                <span
                  key={d.day}
                  className="gn-timeline__axis-day"
                  data-weekend={isWeekend(d.day) ? 'true' : undefined}
                  style={{ ['--d0' as string]: d.day - firstDay } as CSSProperties}
                >
                  {d.number}
                </span>
              ))}
            </div>
          </div>

          {model.todayDay !== null && (
            <span className="gn-timeline__today" aria-hidden="true" data-day={model.todayDay} style={{ ['--d0' as string]: model.todayDay - firstDay } as CSSProperties} />
          )}

          {model.groups.map((group, index) => {
            const lane = layout.lanes[index];
            if (lane === undefined) return null;
            return (
              <section
                key={group.epicId ?? 'no-epic'}
                className="gn-timeline__lane gn-timeline__group"
                style={{ ['--lane-offset' as string]: `${lane.offset}px`, ['--lane-extent' as string]: `${lane.extent}px` } as CSSProperties}
              >
                <h3 className="gn-timeline__group-heading">{group.epicTitle}</h3>
                {barsInRange(lane, range).map((placed) => {
                  const row = rowById.get(placed.id);
                  if (row === undefined) return null;
                  return (
                    <TimelineBar
                      key={row.ticketId}
                      row={row}
                      layoutRow={placed.row}
                      firstDay={firstDay}
                      ppd={ppd}
                      category={categoryById.get(row.ticketId) ?? 'open'}
                      measure={measure}
                      detailId={`${idPrefix}-detail-${row.ticketId}`}
                      onOpen={openTicket}
                    />
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
      </div>

      {/*
        A VISIBLE aside, never a disclosure: partially dated work is honest
        information, not an error state to tuck away. Rendered only when it has
        a row, for the reason the calendar's legend is — its heading is a
        sentence ABOUT the entries under it, and a sentence over nothing is
        chrome that says nothing. This can never hide the empty copy: the model
        reaches `emptyCopy` only when the side list is empty too.
      */}
      {model.sideList.length > 0 && (
        <aside className="gn-timeline__side" aria-label="Undated or partially dated">
          {/* The heading is a counted one, and the sentence under it is the model's
              choice among THREE (23.143): "no dates yet" (only undated work), the
              leaving-condition sentence (only work missing a claim, one of which
              has a date) and the mixed-list sentence. Verbatim. */}
          <h3 className="gn-timeline__side-heading">Not on the timeline yet ({model.sideList.length})</h3>
          <p className="gn-timeline__side-copy">{model.sideListCopy}</p>
          <ul className="gn-timeline__side-list">
            {model.sideList.map((entry) => (
              <li
                key={entry.ticketId}
                className={sideEntryClassName(entry.reason)}
                data-reason={entry.reason}
              >
                <button
                  type="button"
                  className="gn-timeline__open"
                  onClick={() => props.onOpenTicket(entry.ticketId)}
                >
                  {entry.title}
                </button>
                {/* The model's note, verbatim — it already narrows to exactly
                    what is missing, and a ticket carrying a custom date claim
                    is not told it has "no claimed dates". */}
                <span className="gn-timeline__side-note">{entry.note}</span>
                {entry.customClaims.length > 0 && <CustomClaimList claims={entry.customClaims} />}
                {/* "Add dates" (UX fixes T8, 23.143, audit PV-11): the way forward the list never offered. It opens
                    the ticket's sheet, where the dates are set — there is no scroll-to-field door to open it at. */}
                <button
                  type="button"
                  className="gn-button gn-button--ghost gn-timeline__add-dates"
                  aria-label={`Add dates to ${entry.title}`}
                  onClick={() => props.onOpenTicket(entry.ticketId)}
                >
                  Add dates
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
```

- [ ] **Step 6: The token and the stylesheet**

  `timelineWeekend` is opaque on purpose (an alpha role cannot carry a `CONTRAST_PAIRS` row, and the day numbers sit on this tint): `hig` and `minimal` map it to the primitive the track surface uses, `neo` to the well.

`packages/ui/src/tokens.ts`:

```diff
--- a/packages/ui/src/tokens.ts
+++ b/packages/ui/src/tokens.ts
@@ -780,6 +780,14 @@
    */
   'surfaceTrack',
   'surfaceWell',
+  /**
+   * The weekend column tint of the continuous Timeline and the graphs' day axis (Workflow and Timeline graphs, VP-11) --
+   * `--gn-timeline-weekend`. It is a RECESSED ground, so `hig` and `minimal` map it to the primitive `surfaceTrack` uses and `neo`
+   * to the well (as `surfaceSunken` is there). OPAQUE on purpose: an alpha role cannot carry a `CONTRAST_PAIRS` row, and the day
+   * numbers in the axis header sit on this tint. Measured: `textMuted` on it is 8.25 light, 15.25 dark (hig), and in `neo` it is
+   * the already-declared `textMuted` on `surfaceSunken` pair.
+   */
+  'timelineWeekend',
   'text',
   'textMuted',
   /**
@@ -966,6 +974,7 @@
     surfacePlaceholder: 'trackWarm',
     surfaceTrack: 'trackWarm',
     surfaceWell: 'wellWarm',
+    timelineWeekend: 'trackWarm',
     text: 'labelWarmLight',
     textMuted: 'inkMuted',
     textSubtle: 'textSubtleLight',
@@ -1011,6 +1020,7 @@
     surfacePlaceholder: 'trackNavy',
     surfaceTrack: 'trackNavy',
     surfaceWell: 'wellNavy',
+    timelineWeekend: 'trackNavy',
     text: 'labelWarmDark',
     textMuted: 'fogMuted',
     textSubtle: 'textSubtleDark',
@@ -1098,6 +1108,7 @@
       surfacePlaceholder: 'neoPlaceholderLight', // S-R1: flat, never the well
       surfaceTrack: 'neoWellLight',
       surfaceWell: 'neoWellLight',
+      timelineWeekend: 'neoWellLight',
       fillTertiary: 'fillWarmNeo3',
       fillQuaternary: 'fillWarmNeo4',
       danger: 'neoLightDanger',
@@ -1115,6 +1126,7 @@
       surfacePlaceholder: 'neoPlaceholderDark', // S-R1: flat, never the well
       surfaceTrack: 'neoWellDark',
       surfaceWell: 'neoWellDark',
+      timelineWeekend: 'neoWellDark',
       textSubtle: 'neoTextSubtleDark',
       fillTertiary: 'fillNavyNeo3',
       fillQuaternary: 'fillNavyNeo4',
@@ -1856,6 +1868,8 @@
    */
   { fg: 'text', bg: 'surfaceTrack', minimum: 4.5 },
   { fg: 'textMuted', bg: 'surfaceTrack', minimum: 4.5 },
+  // Added 2026-10-03 with `timelineWeekend`: the axis day numbers (`textMuted`) sit on the weekend tint.
+  { fg: 'textMuted', bg: 'timelineWeekend', minimum: 4.5 },
   { fg: 'textSubtle', bg: 'surfaceTrack', minimum: 4.5 },
   { fg: 'text', bg: 'surfaceWell', minimum: 4.5 },
   { fg: 'textMuted', bg: 'surfaceWell', minimum: 4.5 },
```

  `ui.css`: the whole `.gn-timeline*` section is replaced (the old week-column grid, header, zebra, clipped edges and the phone arm go). Find it with `grep -n "gn-timeline" packages/ui/src/ui.css`. Apply the diff (it is against the file at `origin/release/workflow-graph`; a hunk that does not apply because the tip moved is re-applied by hand, the intent is stated in each rule's comment). Nothing outside `.gn-timeline*` and one mention in the comment of the first zebra rule changes.

`packages/ui/src/ui.css`:

```diff
--- a/packages/ui/src/ui.css
+++ b/packages/ui/src/ui.css
@@ -2788,7 +2788,7 @@
   box-shadow: none;
   border-color: transparent;
 }
-/* "Group header row": `padding 11px 16px`; the prototype drew it as `trayBg + trayShadow`, the pair `.gn-timeline__weeks` uses
+/* "Group header row": `padding 11px 16px`; the prototype drew it as `trayBg + trayShadow`, the pair the Timeline's retired `.gn-timeline__weeks` band used
    (`--gn-surface-sunken`/`--gn-shadow-sunken`); UX fixes T6 (23.095) flattened it to a quaternary tint, so the heading
    no longer reads as a text field. DECLARED DIVERGENCE, not a
    match: the prototype draws this as a `<tr>` spanning the table's columns;
@@ -2964,8 +2964,8 @@
 /* "Header cell": `13px/18px; 600; label2; trayBg; padding 11px 16px;
    nowrap`. `label2` → `--gn-text-muted`, `trayBg` → `--gn-surface-sunken` —
    both already declared, both already paired for identical prototype
-   vocabulary elsewhere in this file (`.gn-timeline__weeks`, `:1934-1937`
-   below). Uniform across every column — `ticket-list.tsx` applies this
+   vocabulary elsewhere in this file (the Timeline's `.gn-timeline__weeks`
+   band, retired by Workflow and Timeline graphs Part 1). Uniform across every column — `ticket-list.tsx` applies this
    class to the title header AND every mapped data header alike, since the
    metric does not vary by column. */
 .gn-list__table-header {
@@ -2978,7 +2978,7 @@
   white-space: nowrap;
 }
 /* "Zebra": odd rows `fill4` → `--gn-fill-quaternary`, already declared and
-   consumed elsewhere. `:nth-child`, not `:nth-of-type` as Task 11's
+   consumed elsewhere. `:nth-child`, not `:nth-of-type` as Task 11's (since retired)
    `.gn-timeline__row` needed — checked, not assumed identical: `Table`'s
    `<tbody>` (`table.tsx`) contains ONLY `<tr>` siblings (one per row, no
    heading or other element mixed in, unlike the timeline's `<h3>`-then-rows
@@ -4725,12 +4725,11 @@
    (23.095) replaced that zebra with a hairline; the parity is worked through in this block, and the type rows keep the zebra.
 
    THE PRODUCT'S OTHER TWO ZEBRAS DIFFER, AND THAT IS RECORDED RATHER THAN
-   HARMONISED. `.gn-list__table-row` (`:1088`) and `.gn-timeline__row` (`:2703`)
-   both stripe the ODD child, so those two families read INVERTED against the
-   prototype. **The measurement and its named owner already exist**
-   (the Members note that recorded it was removed with that zebra by UX fixes T6; the owner, "whoever next touches those two families", is unchanged),
-   so this rule adds the third member of the matching set and re-records
-   nothing — harmonising those two is not this screen's change. */
+   HARMONISED. `.gn-list__table-row` (`:1088`) stripes the ODD child, and
+   `.gn-timeline__row` did too until the paged Timeline grid retired (Workflow and Timeline graphs Part 1), so the
+   list family reads INVERTED against the prototype. **The measurement and its named owner already exist**
+   (the Members note that recorded it was removed with that zebra by UX fixes T6; the owner, "whoever next touches that family", is unchanged),
+   so this rule re-records nothing — harmonising the list is not this screen's change. */
 .ticket-type-list__rows li:nth-child(even) .ticket-type-list__row {
   background: var(--gn-fill-quaternary);
 }
@@ -5892,56 +5891,39 @@
   .gn-calendar__agenda-item:focus-visible { outline: 2px solid var(--gn-focus-ring); outline-offset: 2px; }
 }
 
-/* Plan 9 Task 11 — the timeline's week columns.
-
-   NO NEW ROLE. The plan's `tokens.color.barActive`, `pendingHatch`, `ink`,
-   `inkMuted`, `line`, `surface` and `customMarker` are seven names for six
-   roles this file already carries: a bar is `accent` on `accent-text`, an
-   in-transit claim is `pending`, a claim on a workspace-defined date field is
-   `custom-marker`, and the grid lines are `border`. Task 9 added the one role
-   the roster really was missing; this surface needed none.
-
-   The week track list arrives as `--timeline-week-columns`, set once by the
-   component on `.gn-timeline`, and it carries `repeat(n, 1fr)` rather than the
-   bare `n` so the var substitutes as a plain component of the value — nothing
-   here computes layout in a test, and `repeat(var(--n), 1fr)` failing to parse
-   would silently turn the whole declaration into `none`.
-
-   It is NOT `--gn-`-prefixed on purpose: that namespace is the token origin's,
-   and tokens.test.ts asserts every `var(--gn-…)` here names a declared colour
-   role. A track list is not a colour. */
+/* The continuous timeline (Workflow and Timeline graphs, Part 1; spec 2026-10-03 VP-1 to VP-11, TV-1 to TV-11).
+
+   REPLACES Plan 9 Task 11's week-column grid. One scroll container (`.gn-timeline__canvas`, driven by `ScrollAdapter`)
+   holds one surface; every bar, label and the today line is placed from three or four custom properties and ONE scale,
+   `--tl-ppd` (px per day), which the adapter writes on the canvas. So a zoom frame is a property write and a scroll write:
+   the layout engine multiplies, React does not render. `--d0` is a day offset from the surface's first day (always a
+   Monday), `--dn` a length in days, `--row` a packed row.
+
+   NO NEW COLOUR EXCEPT ONE ROLE. A bar is `accent` on `accent-text`, an in-transit claim is `pending`, a claim on a custom
+   date field is `custom-marker`, the lines are `border`. The weekend tint is the new role `timelineWeekend`
+   (`--gn-timeline-weekend`), decoration only; the day numbers on it are held to 4.5:1 by two `CONTRAST_PAIRS` rows. The
+   component-local names (`--tl-*`) are not colours and are deliberately NOT `--gn-`-prefixed: `tokens.test.ts` asserts every
+   `var(--gn-...)` in this file names a declared role. */
 
 .gn-timeline {
+  --tl-weekend: var(--gn-timeline-weekend);
+  --tl-axis-height: 3.25rem; /* two 26 px rows: the period label and the day numbers (VP-11) */
+  display: flex;
+  flex-direction: column;
+  min-height: 20rem; /* 320 px (TG-13); the view sets its own height to fill the space under the filters */
   background: var(--gn-surface);
   color: var(--gn-text);
   font: inherit;
 }
-.gn-timeline__header {
+.gn-timeline__toolbar {
   display: flex;
   align-items: center;
   gap: 0.5rem;
   padding: 0.5rem;
-}
-/* E4-15 / P35 (2026-09-21). This rule declared a radius, a background, a
-   colour, a font, padding and a cursor — and **no `border`** — so the three
-   Earlier / Today / Later buttons kept the user agent's `2px outset` bevel:
-   measured `border: 2px outset rgb(0,0,0)` with the product's own
-   `background: rgb(241,234,227)`, `border-radius: 6px`, `padding: 3.2px 9.6px`.
-   The rule applied; the UA border survived it. **That is outside round 1's P1
-   population by construction** — P1 selected classes with ZERO matching
-   selector blocks, and this one matched — and it is why P35 filed the same
-   defect from the other side: *"matched a selector block"* and *"is fully
-   styled"* are different questions.
-
-   The values are the CALENDAR nav's own (`:3295`), which is the same
-   three-button control on the sibling view, so the two views' navs now agree
-   rather than one of them wearing the browser's default bevel. `border: none`
-   is the property that removes the bevel; the rest is the harmonisation the
-   calendar already settled.
-   Styling refresh Plan B (Task B8): P-QUIET — the values above are superseded
-   in step with the calendar's nav (Task B7): a quiet outlined 44px pill in
-   text2, washed on hover. The border is now the 1px `--gn-border` edge, still
-   a declared `border`, so no UA bevel can survive. */
+  flex: none;
+}
+/* Today: a quiet outlined 44 px pill in text2, washed on hover (Styling refresh Plan B, Task B8). The 1px `--gn-border` edge is
+   a declared border, so no user-agent bevel can survive (E4-15 / P35). */
 .gn-timeline__nav {
   display: inline-flex;
   align-items: center;
@@ -5956,10 +5938,10 @@
   cursor: pointer;
 }
 .gn-timeline__nav:hover:not(:disabled) { background: var(--gn-fill-quaternary); }
-.gn-timeline__glyph { color: var(--gn-text-muted); margin: 0 0.2rem; }
 .gn-timeline__nav:focus-visible,
 .gn-timeline__bar:focus-visible,
-.gn-timeline__open:focus-visible {
+.gn-timeline__open:focus-visible,
+.gn-timeline__canvas:focus-visible {
   outline: 2px solid var(--gn-focus-ring);
   outline-offset: 1px;
 }
@@ -5971,147 +5953,183 @@
   font-size: 0.85rem;
 }
 
-/* Board prototype port Task 11 (2026-09-16), spec Timeline `:506-538`. NO NEW
-   ROLE: `trayBg`/`trayShadow` → `--gn-surface-sunken`/`--gn-shadow-sunken`
-   (the same pair the board's own column trays already use for identical
-   prototype vocabulary — `.gn-board__column`, Task 6) and `fill4` →
-   `--gn-fill-quaternary` — both already declared, already consumed elsewhere
-   in this file. `accent`/`accentText` for the bar are UNCHANGED from Plan
-   9's own landing: `.gn-filters__chip[aria-pressed='true']` (`:3602-3605`
-   below) already settled "accent ground + onColor" as
-   `background: var(--gn-accent); color: var(--gn-accent-text)` over the
-   plan's literal `--onColor` → `--gn-text-inverted` mapping, because
-   `CONTRAST_PAIRS` (`tokens.ts`) measures `accentText` against `accent` and
-   never measures `textInverted` there at all — this bar already used that
-   exact pair, so nothing here changes it.
-
-   The two grids that must agree, reading ONE count. The first column is the
-   title column, widened from Plan 9's 12rem to the spec's 230px (14.375rem)
-   — pinned by an EXACT substring match in
-   `test/timeline/timeline-view.test.tsx` (`grid-template-columns: 12rem
-   var(--timeline-week-columns);`, 11.82's third case), which that case's own
-   docblock sanctions changing ("a change to the width alone will redden
-   this too, and re-reading this comment is the intended cost") — updated
-   alongside this. Week `i` is column `i + 2`, which is what the bar's
-   computed `grid-column` says too; that arithmetic depends on there being
-   exactly ONE leading track, not on its width, so it is unaffected. */
-.gn-timeline__weeks,
-.gn-timeline__row {
-  display: grid;
-  grid-template-columns: 14.375rem var(--timeline-week-columns);
-  align-items: center;
-}
-/* Header grid: trayBg + trayShadow on the CONTAINER — `.gn-timeline__corner`
-   and `.gn-timeline__week` are transparent grid items sitting on top of it,
-   the same "background on the row, not the cell" shape the list's group
-   header bar (`.gn-list__section-title`, below) uses.
-   Styling refresh Plan B (Task B8): the ground is now the recessed TRACK
-   (`surface-track` / `shadow-track`) instead of the sunken tray. */
-.gn-timeline__weeks {
-  background: var(--gn-surface-track);
-  box-shadow: var(--gn-shadow-track);
-}
-/* Row: min-height 42px, zebra fill4. `:nth-of-type`, not `:nth-child` — each
-   row's siblings inside `.gn-timeline__group` include the group's own `<h3
-   class="gn-timeline__group-heading">` ahead of the rows, and `:nth-child`
-   would count that heading as sibling #1, shifting every row's parity by
-   one. `:nth-of-type` counts only same-tag-name siblings (every sibling
-   `<div>` in a group is a `.gn-timeline__row` — the heading is an `<h3>`),
-   so the first row is always odd regardless of the heading above it. */
-.gn-timeline__row { min-height: 2.625rem; }
-.gn-timeline__row:nth-of-type(odd) { background: var(--gn-fill-quaternary); }
-.gn-timeline__week {
-  padding: 0.5625rem 0.625rem;
+/* The scroller. `overscroll-behavior: contain` and the adapter's non-passive Ctrl + wheel listener are what keep the PAGE from
+   scrolling under it (VP-2); touch keeps the platform's own pan and momentum. A mouse drag on empty canvas pans, so the cursor
+   says so. */
+.gn-timeline__stage {
+  position: relative;
+  display: flex;
+  flex-direction: column;
+  flex: 1 1 0;
+  min-height: 0;
+}
+.gn-timeline__canvas {
+  position: relative;
+  flex: 1 1 0;
+  min-height: 0;
+  overflow: auto;
+  overscroll-behavior: contain;
+  cursor: grab;
+}
+.gn-timeline__canvas.gn-dragging { cursor: grabbing; user-select: none; }
+.gn-timeline__surface {
+  position: relative;
+  min-width: 100%;
+  /* The rubber band: the adapter writes the resisted overshoot here while the pointer pulls past the first or last day. */
+  transform: translateX(var(--tl-overshoot, 0px));
+}
+/* Weekend columns, lightly tinted through the whole height at 16 px/day and above (VP-11). The surface starts on a Monday, so
+   one tile is seven days: five clear, two tinted. The adapter's frame handler turns it off below 16 px/day. */
+.gn-timeline__surface,
+.gn-timeline__axis {
+  background-image: linear-gradient(
+    to right,
+    transparent 0,
+    transparent calc(var(--tl-ppd) * 5px),
+    var(--tl-weekend) calc(var(--tl-ppd) * 5px),
+    var(--tl-weekend) calc(var(--tl-ppd) * 7px)
+  );
+  background-size: calc(var(--tl-ppd) * 7px) 100%;
+}
+.gn-timeline__canvas[data-weekend='off'] .gn-timeline__surface,
+.gn-timeline__canvas[data-weekend='off'] .gn-timeline__axis { background-image: none; }
+
+/* The axis header: its own layer, sticky at the top (VP-8), two rows. The labels cross-fade with the scale through
+   `--tl-fade-weeks` and `--tl-fade-days`, which the adapter's frame handler writes (never a pop, VP-11). */
+.gn-timeline__axis {
+  position: sticky;
+  top: 0;
+  z-index: 3;
+  height: var(--tl-axis-height);
+  background-color: var(--gn-surface);
+  border-bottom: 1px solid var(--gn-border);
+}
+.gn-timeline__axis-row { position: relative; height: 1.625rem; }
+.gn-timeline__axis-label,
+.gn-timeline__axis-day {
+  position: absolute;
+  top: 0;
+  left: calc(var(--d0) * var(--tl-ppd) * 1px);
   font-size: 0.75rem;
-  line-height: 1rem;
-  font-weight: 600;
+  line-height: 1.625rem;
   color: var(--gn-text-muted);
-}
-
-/* The web app on phones — the Timeline (Plan Task 8, case 21.113). At <=40rem `.gn-timeline` itself is the
-   horizontal scroller (the component has no inner track), so the weeks band and the rows scroll inside it and
-   the PAGE does not. The band and each row keep a 40rem floor and a 9rem title column (14.375rem above), so a
-   week track stays about 3.75rem wide; the toolbar wraps and is `sticky; left: 0`, so Today and the week
-   arrows stay in view while the grid scrolls under them. Inside the one 40rem arm and AFTER every base rule it
-   overrides. */
-@media (max-width: 40rem) {
-  .gn-timeline { min-width: 0; max-width: 100%; overflow-x: auto; overscroll-behavior-x: contain; }
-  .gn-timeline__header { flex-wrap: wrap; position: sticky; left: 0; }
-  .gn-timeline__weeks,
-  .gn-timeline__row { grid-template-columns: 9rem var(--timeline-week-columns); min-width: 40rem; }
-}
-
+  white-space: nowrap;
+}
+.gn-timeline__axis-label { padding-left: 0.25rem; font-weight: 600; }
+.gn-timeline__axis-label--week { opacity: var(--tl-fade-weeks, 1); }
+.gn-timeline__axis-label--month { opacity: calc(1 - var(--tl-fade-weeks, 1)); }
+.gn-timeline__axis-day {
+  width: calc(var(--tl-ppd) * 1px);
+  text-align: center;
+  opacity: var(--tl-fade-days, 1);
+}
+
+/* A lane (an epic): absolutely placed under the axis by the packed layout. Its heading sticks to the left edge (VP-8). */
+.gn-timeline__lane {
+  position: absolute;
+  left: 0;
+  right: 0;
+  top: calc(var(--tl-axis-height) + var(--lane-offset));
+  height: var(--lane-extent);
+}
 .gn-timeline__group-heading {
+  position: sticky;
+  left: 0;
+  z-index: 2;
+  display: inline-block;
+  height: 2.125rem; /* 34 px: the mockup's lane heading */
   margin: 0;
-  padding: 0.5rem 0.25rem 0.15rem;
+  padding: 0.5rem 0.5rem 0.15rem;
+  box-sizing: border-box;
   font-size: 0.9rem;
-}
-/* Ruling 22 (coordinator, 2026-09-16) — "Row title": `padding 6px 12px;
-   15px/20px; ellipsis; nowrap`, the spec Timeline table's fourth row
-   (`docs/superpowers/specs/2026-09-16-board-prototype-port-design.md:372`),
-   dropped from the plan's own condensed prose and so absent from this
-   task's brief — landed directly from the spec, not the brief, per the
-   plan's own rule that where the two disagree the spec wins. `min-width: 0`
-   is kept (not a metric, but load-bearing for `.gn-timeline__title-text`'s
-   ellipsis to truncate inside a grid item rather than push the column
-   wide); ellipsis/nowrap themselves already live on that child, unchanged
-   here. */
-.gn-timeline__title {
-  padding: 0.375rem 0.75rem;
-  min-width: 0;
-  font-size: 0.9375rem;
   line-height: 1.25rem;
-}
-.gn-timeline__title-text {
-  overflow: hidden;
-  text-overflow: ellipsis;
-  white-space: nowrap;
-}
+  background: var(--gn-surface);
+}
+
+/* A bar is 28 px tall in a 40 px row pitch (TG-13). `.gn-timeline__row` only carries the data attribute and the custom
+   properties down to its children. The key is the first line; a bar 150 px wide or more also shows the title on a second line
+   (container query on the bar itself). `top` is transitioned so a re-pack glides over 200 ms (PK-6). */
+.gn-timeline__row { display: contents; }
 .gn-timeline__bar {
+  position: absolute;
+  z-index: 1;
+  box-sizing: border-box;
+  container-type: inline-size;
+  left: calc(var(--d0) * var(--tl-ppd) * 1px);
+  width: calc(var(--dn) * var(--tl-ppd) * 1px);
+  top: calc(34px + var(--row) * 40px + 6px);
+  height: 28px;
+  padding: 2px 6px;
   border: none;
   border-radius: 0.375rem;
-  /* UX fixes T8 (23.142, audit PV-10): the bar sits in the WEEK columns it touches and these margins trim it to its
-     real days. A percentage margin resolves against the grid AREA (the weeks the bar spans), so `lead` days of
-     `7 * weeks` is exactly that share of it. The view sets the three custom properties; the 0.1875rem is the
-     breathing room the bar always had. `grid-row: 1` keeps the today line (also row 1) from pushing it down. */
-  grid-row: 1;
-  margin: 0.3125rem 0;
-  margin-left: calc(var(--timeline-bar-lead, 0) / (7 * var(--timeline-bar-weeks, 1)) * 100% + 0.1875rem);
-  margin-right: calc(var(--timeline-bar-tail, 0) / (7 * var(--timeline-bar-weeks, 1)) * 100% + 0.1875rem);
-  padding: 0.1875rem 0.5625rem;
+  overflow: hidden;
   text-align: left;
   font: inherit;
-  font-size: 0.75rem;
-  line-height: 1rem;
-  overflow: hidden;
-  text-overflow: ellipsis;
+  font-size: 11px;
+  line-height: 12px;
   white-space: nowrap;
   cursor: pointer;
   background: var(--gn-accent);
   color: var(--gn-accent-text);
-}
-/* In transit: outlined, never a different hue — a claim on its way to the
-   server is the same claim, and recolouring it would say it means something
-   else. The same treatment `.gn-calendar__item--pending` uses. */
+  transition: top 200ms ease;
+}
+.gn-timeline__mark { margin-right: 3px; }
+.gn-timeline__key { font-weight: 600; }
+.gn-timeline__bar .gn-timeline__title-text { display: none; overflow: hidden; text-overflow: ellipsis; }
+@container (min-width: 150px) {
+  .gn-timeline__bar .gn-timeline__title-text { display: block; }
+}
+/* A bar shorter than its key shows the key just outside its end, never hidden (PK-4). It fades out while a zoom is moving
+   and returns after the re-pack. */
+.gn-timeline__key--outside {
+  position: absolute;
+  z-index: 1;
+  left: calc((var(--d0) + var(--dn)) * var(--tl-ppd) * 1px + 4px);
+  top: calc(34px + var(--row) * 40px + 6px);
+  line-height: 28px;
+  font-size: 11px;
+  color: var(--gn-text);
+  white-space: nowrap;
+  pointer-events: none;
+  transition: top 200ms ease, opacity 150ms ease;
+}
+.gn-timeline[data-zooming='true'] .gn-timeline__key--outside { opacity: 0; }
+/* In transit: outlined, never a different hue — a claim on its way to the server is the same claim. The same treatment
+   `.gn-calendar__item--pending` uses. */
 .gn-timeline__bar[data-pending] { outline: 2px dashed var(--gn-pending); outline-offset: -1px; }
-/* A period that continues past the window's edge. Dashed at the end it is
-   clipped at, and only that end — the bar does not claim to start or finish
-   where the window happens to. Corner radius follows the base bar's 6px. */
-.gn-timeline__bar[data-clipped-start] { border-left: 2px dashed var(--gn-border-strong); border-radius: 0 0.375rem 0.375rem 0; }
-.gn-timeline__bar[data-clipped-end] { border-right: 2px dashed var(--gn-border-strong); border-radius: 0.375rem 0 0 0.375rem; }
-.gn-timeline__bar[data-clipped-start][data-clipped-end] { border-radius: 0; }
-/* The today line (UX fixes T8, 23.142, audit PV-10): a hairline in the middle of today's day, in every row. A
-   zero-width item in the one-week column today falls in; its percentage margin is a share of that week. It paints
-   in the accent (a token) and takes no click. */
+@media (prefers-reduced-motion: reduce) {
+  .gn-timeline__bar,
+  .gn-timeline__key--outside { transition: none; }
+}
+/* The today line (UX fixes T8, 23.142): one hairline through the whole surface, in the middle of today's day, UNDER the bars. */
 .gn-timeline__today {
-  grid-row: 1;
-  align-self: stretch;
+  position: absolute;
+  top: 0;
+  bottom: 0;
+  left: calc((var(--d0) + 0.5) * var(--tl-ppd) * 1px);
   width: 0;
-  margin-left: calc((var(--timeline-today-lead, 0) + 0.5) / 7 * 100%);
   border-left: 2px solid var(--gn-accent);
   pointer-events: none;
-  z-index: 1;
-}
+  z-index: 0;
+}
+
+/* TV-2: a ticket's custom date claims stay beside the ticket. A bar row has no room for a list, so it is a callout beside the
+   bar's end that opens on hover or keyboard focus (the labels are also in the bar's hover text and its description, so nothing
+   is reachable only by hover). `.gn-timeline__row` is `display: contents`; :hover and :focus-within still follow its descendants. */
+.gn-timeline__row > .gn-timeline__claims {
+  display: none;
+  position: absolute;
+  z-index: 4;
+  left: calc((var(--d0) + var(--dn)) * var(--tl-ppd) * 1px + 4px);
+  top: calc(34px + var(--row) * 40px + 6px);
+  max-width: 18rem;
+  padding: 0.25rem 0.5rem;
+  border: 1px solid var(--gn-border);
+  border-radius: 0.375rem;
+  background: var(--gn-surface-raised);
+}
+.gn-timeline__row:hover > .gn-timeline__claims,
+.gn-timeline__row:focus-within > .gn-timeline__claims { display: block; }
 
 .gn-timeline__claims { list-style: none; margin: 0; padding: 0; }
 .gn-timeline__claim { font-size: 0.75rem; color: var(--gn-custom-marker); }
```

- [ ] **Step 7: GREEN, typecheck, the whole app-core and ui suites**

  ```bash
  pnpm turbo run build --filter=@gisik-nokma/ui --filter=@gisik-nokma/viewport
  slot-run.sh ac -- pnpm --filter @gisik-nokma/app-core exec vitest run --maxWorkers=2 > /tmp/ac.log 2>&1; tail -n 20 /tmp/ac.log
  slot-run.sh ui -- pnpm --filter @gisik-nokma/ui exec vitest run --maxWorkers=2 > /tmp/ui.log 2>&1; tail -n 20 /tmp/ui.log
  pnpm turbo run typecheck --filter=@gisik-nokma/app-core... --filter=@gisik-nokma/ui
  ```

  Expected: the timeline tests, `clock-free`, the hooks file, the ui tests (`timeline-continuous`, `tokens`, `neo-hk4`, `styling-b8`) all green; typecheck clean (a missing `KeyMeasure` import would show here: tests alone do not see types). `ui.css` changed, so the web suite runs too (step 8) and the apps check the new class contract.

- [ ] **Step 8: Retire the web tests and the paged pins**

  The two web tests below pinned the paged grid's stylesheet; their cases are retired (they cannot stay: the rules they read are gone). Remove them and update their file docblocks:

`apps/web/test/phone-project-views.test.ts`:

```diff
--- a/apps/web/test/phone-project-views.test.ts
+++ b/apps/web/test/phone-project-views.test.ts
@@ -4,7 +4,7 @@
 
 /**
  * The web app on phones, Plan Task 8 — the project page's other views (§21.8): the project header and
- * view tabs (21.110), List / Backlog (21.111), Calendar (21.112) and Timeline (21.113). 21.114 (the four
+ * view tabs (21.110), List / Backlog (21.111), Calendar (21.112). The Timeline's case, 21.113, was retired with the paged grid by Workflow and Timeline graphs Part 1 (29.106 pins the continuous canvas's stylesheet, 29.107 its structure). 21.114 (the four
  * views at 360 / 412 / 440, no page overflow, scrollers scroll) is a browser case and stays 🧪.
  *
  * Every phone rule sits inside the existing 40rem arm (FD1) and AFTER the base rule it overrides — equal
@@ -236,37 +236,6 @@
   });
 });
 
-describe('21.113 Timeline: the weeks band scrolls inside its track; the page does not', () => {
-  it('21.113 the timeline is the scroller; its week band and rows keep a 40rem floor and a narrower title column; the toolbar wraps and stays in view', () => {
-    const track = ruleExactly(ui, '.gn-timeline', PHONE);
-    expect(valueOf(track, 'overflow-x')).toBe('auto');
-    expect(valueOf(track, 'max-width')).toBe('100%');
-    expect(valueOf(track, 'min-width')).toBe('0');
-    expect(valueOf(track, 'overscroll-behavior-x')).toBe('contain');
-    const bands = ruleExactly(ui, ['.gn-timeline__weeks', '.gn-timeline__row'], PHONE);
-    expect(valueOf(bands, 'min-width')).toBe('40rem');
-    expect(valueOf(bands, 'grid-template-columns')).toBe('9rem var(--timeline-week-columns)');
-    const header = ruleExactly(ui, '.gn-timeline__header', PHONE);
-    expect(valueOf(header, 'flex-wrap')).toBe('wrap');
-    expect(valueOf(header, 'position')).toBe('sticky');
-    expect(valueOf(header, 'left')).toBe('0');
-    after(ui, ['.gn-timeline']);
-    after(ui, ['.gn-timeline__header']);
-    after(ui, ['.gn-timeline__weeks', '.gn-timeline__row'], [
-      ['.gn-timeline__weeks', '.gn-timeline__row'],
-      ['.gn-timeline__weeks'],
-      ['.gn-timeline__row'],
-    ]);
-
-    // CONTROL — desktop unchanged: no scroller on the timeline, the 14.375rem title column, no floor.
-    const base = ruleExactly(ui, '.gn-timeline');
-    expect(valueOf(base, 'overflow-x')).toBeNull();
-    const desktopBands = ruleExactly(ui, ['.gn-timeline__weeks', '.gn-timeline__row']);
-    expect(valueOf(desktopBands, 'grid-template-columns')).toBe('14.375rem var(--timeline-week-columns)');
-    expect(valueOf(desktopBands, 'min-width')).toBeNull();
-  });
-});
-
 describe('21.115 the Calendar grid contains its own absolutely placed descendants, so the page does not scroll sideways at 360', () => {
   /**
    * Found by the T13 browser pass (2026-10-01): at 360 the Calendar tab made the DOCUMENT 5px wider than the window
```

`apps/web/test/project-views-ux.test.ts`:

```diff
--- a/apps/web/test/project-views-ux.test.ts
+++ b/apps/web/test/project-views-ux.test.ts
@@ -3,7 +3,7 @@
 
 /**
  * UX fixes Task 8 (audit PV-05, PV-06, PV-10, PV-11, PV-12): the project views. The stylesheet half —
- * 23.141 (the phone calendar chip is one line), 23.142 (the timeline bar's day margins and the today line) and
+ * 23.141 (the phone calendar chip is one line), 23.142 (retired by Workflow and Timeline graphs Part 1: the bars are placed by custom properties on a day axis now, 29.106) and
  * 23.145 (wrapped timeline titles keep their left edge). jsdom lays nothing out, so each case reads the
  * DECLARATIONS that give the box its shape, and the phone rule's source order against the base it overrides.
  */
@@ -87,34 +87,6 @@
   });
 });
 
-describe('23.142 timeline bars take their day margins from custom properties; the today line is a token-coloured rule', () => {
-  it('23.142 the bar is on row 1 (so a today line over it cannot push it down) and its margins are a share of its own weeks', () => {
-    const bar = ruleExactly(ui, '.gn-timeline__bar');
-    expect(valueOf(bar, 'grid-row')).toBe('1');
-    const left = valueOf(bar, 'margin-left') ?? '';
-    const right = valueOf(bar, 'margin-right') ?? '';
-    expect(left).toContain('var(--timeline-bar-lead');
-    expect(left).toContain('var(--timeline-bar-weeks');
-    expect(right).toContain('var(--timeline-bar-tail');
-    expect(right).toContain('var(--timeline-bar-weeks');
-    // The 0.1875rem breathing margin the bar always had survives next to the day share.
-    expect(left).toContain('0.1875rem');
-
-    const today = ruleExactly(ui, '.gn-timeline__today');
-    expect(valueOf(today, 'grid-row')).toBe('1');
-    expect(valueOf(today, 'pointer-events')).toBe('none');
-    expect(valueOf(today, 'border-left')).toBe('2px solid var(--gn-accent)');
-    expect(valueOf(today, 'margin-left') ?? '').toContain('var(--timeline-today-lead');
-    // Tokens only: no hex or rgb in the line's rule.
-    expect(today).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
-
-    // CONTROL — the week tracks themselves did not change: the bar still lands on whole-week grid columns.
-    expect(valueOf(ruleExactly(ui, ['.gn-timeline__weeks', '.gn-timeline__row']), 'grid-template-columns')).toBe(
-      '14.375rem var(--timeline-week-columns)',
-    );
-  });
-});
-
 describe('23.145 a wrapped timeline title keeps its left edge (audit PV-12)', () => {
   it('23.145 `.gn-timeline__open` is left-aligned; the other side-list rows are unchanged', () => {
     const open = ruleExactly(ui, '.gn-timeline__open');
```

  **Kills:** none for the two web files: they only delete the retired 21.113 and 23.142 cases and re-word docblocks; the surviving cases (21.110–21.112, 21.115, 23.141, 23.145) guard existing behaviour unchanged by this task.

  Then the catalogue. Each line below is retired in place (the id stays, the marker becomes 🚫, the reason names the Part 1 id that replaced it; ids are never reused and never renumbered). The `Features.md` / case diffs are against the files at `origin/release/workflow-graph`: apply by id, not by line number.

`test-cases/11-calendar-notifications.md`:

```diff
--- a/test-cases/11-calendar-notifications.md
+++ b/test-cases/11-calendar-notifications.md
@@ -40,8 +40,8 @@
 - **11.52** ✅ A bar requires BOTH the start and due claims (planted defects, invariant 4) — (`timeline-model.test.ts`)
 - **11.53** ✅ The side-list heading is true of every entry rendered under it — (`timeline-model.test.ts`)
 - **11.54** ✅ A claimed day that is not a real day is named, and blanks nothing — (`timeline-model.test.ts`)
-- **11.55** ✅ The rendered window is correct at both of its ends, and one day either side of them — (`timeline-model.test.ts`)
-- **11.56** ✅ Bars carry exact week indices and both of their authors — (`timeline-model.test.ts`)
+- **11.55** 🚫 RETIRED by Workflow and Timeline graphs Part 1 T9 (the rendered window is gone with the paged grid; replaced by 29.094 and 29.096): The rendered window is correct at both of its ends, and one day either side of them — (`timeline-model.test.ts`)
+- **11.56** 🚫 RETIRED by Workflow and Timeline graphs Part 1 T9 (a bar no longer carries week indices; the row carries day numbers; replaced by 29.093): Bars carry exact week indices and both of their authors — (`timeline-model.test.ts`)
 - **11.57** ✅ Grouping by epic ancestor is arrangement, never data — (`timeline-model.test.ts`)
 - **11.58** ✅ Custom date claims ride along on the timeline and change no geometry (owner sign-off 2026-08-20) — (`timeline-model.test.ts`)
 - **11.59** ✅ Filters narrow both the row set and the side list together — (`timeline-model.test.ts`)
@@ -70,15 +70,15 @@
 
 ## Timeline view — React component (`packages/app-core`)
 - **11.73** ✅ A bar is drawn only from a claimed pair, with the rest sitting beside the grid — never in both places at once — (`timeline-view.test.tsx`)
-- **11.74** ✅ The window moves four weeks at a time, and Today follows the prop rather than the mount — (`timeline-view.test.tsx`)
-- **11.75** ✅ The empty timelines render the model's own sentences, verbatim, **and the timeline's copy names only controls the TIMELINE has.** The second half is a separate assertion pinning a property the first cannot: `TimelineViewProps` has no hidden-field prop and `buildTimelineModel` has no `hiddenCustomFieldIds`, so the legend switch the CALENDAR's copy names does not exist on this surface. A first draft of the 2026-09-20 change copied that clause across "for symmetry", naming a control no reader here can reach — **the same defect the owner deleted the lane sentence for, one screen over.** Asserted on the WORD (`/legend/i`), so it fails at the clause and not at a comma; mutation-witnessed by re-adding the clause, which reddens **this assertion alone** — (`timeline-view.test.tsx`). **⚠ AMENDED 2026-09-20:** this read "Three empty timelines render as three different sentences"; the narrowing sentence was deleted (owner ruling, item 10), so a filter-emptied chart and an empty one are now the SAME sentence — the naming is what survives the distinction, and the window miss is still its own arm. See 11.61 for the measured collapse.
+- **11.74** 🚫 RETIRED by Workflow and Timeline graphs Part 1 T9 (there is no window to move and no Earlier / Later; Today follows the prop; replaced by 29.099 and 29.101): The window moves four weeks at a time, and Today follows the prop rather than the mount — (`timeline-view.test.tsx`)
+- **11.75** ✅ The empty timelines render the model's own sentences, verbatim, **and the timeline's copy names only controls the TIMELINE has.** The second half is a separate assertion pinning a property the first cannot: `TimelineViewProps` has no hidden-field prop and `buildTimelineModel` has no `hiddenCustomFieldIds`, so the legend switch the CALENDAR's copy names does not exist on this surface. A first draft of the 2026-09-20 change copied that clause across "for symmetry", naming a control no reader here can reach — **the same defect the owner deleted the lane sentence for, one screen over.** Asserted on the WORD (`/legend/i`), so it fails at the clause and not at a comma; mutation-witnessed by re-adding the clause, which reddens **this assertion alone** — (`timeline-view.test.tsx`). **⚠ AMENDED 2026-09-20:** this read "Three empty timelines render as three different sentences"; the narrowing sentence was deleted (owner ruling, item 10), so a filter-emptied chart and an empty one are now the SAME sentence — the naming is what survives the distinction, and the window miss is still its own arm. See 11.61 for the measured collapse. **⚠ AMENDED 2026-10-03 (Workflow and Timeline graphs Part 1 T9, TV-9):** the window-miss arm (`TIMELINE_OUT_OF_WINDOW_COPY`) is retired with the window, so there is one empty sentence and the legend assertion stays; a view that shows no bar while bars exist elsewhere says "Nothing in view" with two jumps (29.108).
 - **11.76** ✅ The side list renders only when it has entries, under the heading the model chose — (`timeline-view.test.tsx`)
 - **11.77** ✅ All FIVE side-list reasons render, each saying which one it is — (`timeline-view.test.tsx`)
 - **11.78** ✅ A claim still in transit says so, and a settled one does not — (`timeline-view.test.tsx`)
-- **11.79** ✅ A bar occupies exactly the columns it was claimed for, and names which end the window cut off — (`timeline-view.test.tsx`)
+- **11.79** 🚫 RETIRED by Workflow and Timeline graphs Part 1 T9 (no column occupancy; a bar is placed by a start day and a length in days; replaced by 29.097): A bar occupies exactly the columns it was claimed for, and names which end the window cut off — (`timeline-view.test.tsx`)
 - **11.80** ✅ Custom date claims sit beside the ticket rather than across the weeks, and still join the hover — (`timeline-view.test.tsx`)
 - **11.81** ✅ Rows group under the epic that owns them, and under "No epic" when none does — (`timeline-view.test.tsx`)
-- **11.82** ✅ The window width shown is the model's own, stated once — (`timeline-view.test.tsx`)
+- **11.82** 🚫 RETIRED by Workflow and Timeline graphs Part 1 T9 (there is no window width; replaced by 29.097): The window width shown is the model's own, stated once — (`timeline-view.test.tsx`)
 - **11.159** ✅ A workspace's own rank-1 type heads the timeline lane too, and is kept out of the side list — (`timeline-view.test.tsx`)
 - **11.223** ✅ E4-28 (batch B15), the timeline's own half of 11.222: a bar's date span is linked as an `aria-describedby` DESCRIPTION, not folded into its accessible NAME — the name stays exactly the ticket title, and the linked description is the same string the `title` attribute already carried, composed from the model's own `barProvenance`, never hand-typed — (`timeline-view.test.tsx`)
 
```

`test-cases/13-board-prototype-port.md`:

```diff
--- a/test-cases/13-board-prototype-port.md
+++ b/test-cases/13-board-prototype-port.md
@@ -743,7 +743,7 @@
 section calls for one ("A live read of the board, list, calendar and timeline in all three styles × both
 themes") and it is named here as a gap for whoever reviews this before merge, not silently skipped.
 
-- **13.474** 🟡 The timeline restyles to the prototype's metrics: 230px title column + `trayBg`/
+- **13.474** 🚫 RETIRED by Workflow and Timeline graphs Part 1 T9 (the 230px title column and the week tracks no longer exist; replaced by 29.106): The timeline restyles to the prototype's metrics: 230px title column + `trayBg`/
   `trayShadow` header grid, `minmax(0, 1fr)` week tracks, 42px zebra rows, a 6px-radius `accent`/
   `accentText` bar (still `0` on the clipped side only), and a `trayBg`/`trayShadow` undrawn footer.
   **Covered:** the three literals `timeline-view.test.tsx` pins by exact equality/substring
@@ -808,7 +808,7 @@
 environmental flakes rather than anything this work touched, since the identical suite is clean here with
 no `apps/server` changes at all.
 
-- **13.477** ❌ The Timeline's "Row title" metric (`padding 6px 12px; 15px/20px`, the spec table's fourth
+- **13.477** 🚫 RETIRED by Workflow and Timeline graphs Part 1 T9 (the grid's Row title cell no longer exists; replaced by 29.106): The Timeline's "Row title" metric (`padding 6px 12px; 15px/20px`, the spec table's fourth
   row, dropped by the plan before reaching this task's brief) lands on `.gn-timeline__title`. All eight
   Timeline spec rows re-checked row by row against the shipped CSS and confirmed matching. Not verified
   by a live render in any style or theme. — (`packages/ui/src/ui.css`) — uncited on 2026-09-18: no test found; was ✅ on owner/workspace-edits d958ab8f. `timeline-view.test.tsx` uses `.gn-timeline__title` only for DOM structure (`closest()`), never for its padding, and no test reads that rule out of `ui.css`.
```

`test-cases/21-mobile-web.md`:

```diff
--- a/test-cases/21-mobile-web.md
+++ b/test-cases/21-mobile-web.md
@@ -95,7 +95,7 @@
 - ✅ **21.110 — the project header on a phone: the view tabs (`.gn-project__rail`) are a deliberate horizontal scroller in their own track (`flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x proximity`, each tab `flex: none; scroll-snap-align: start`), the search takes the first row with Filters (`.gn-project__filters`) beside it, and New ticket stays the header's one primary button at full width (`flex: 1 1 100%`); every rule is inside the one `@media (max-width: 40rem)` arm and after its base rule;** control: above 40rem the rail still wraps and does not scroll and the controls row is unchanged. AMENDED 2026-10-02 (UX fixes Task 4, owner U3) (23.054): the header rules are the two-row ≤64rem arm and the primary is right-aligned in row one, not full width (`flex: 1 1 100%` is gone); the rail scroller and the search/Filters pairing still hold. AMENDED 2026-10-02 (neo follow-up F-3, case 23.345): each phone rail tab also carries `padding-inline: 0.625rem` (was the shared 1rem). Mutation: let the tabs wrap (`flex-wrap: wrap`), drop `overflow-x`/`scroll-snap`, let the primary lose its right-alignment (`margin-left: auto` at ≤64rem, `tablet-band.test.tsx` 23.054), or remove the `gn-project__filters` class from the Filters button. (`apps/web/test/phone-project-views.test.ts`, `apps/web/test/phone-project-views-hooks.test.tsx`)
 - ✅ **21.111 — List and Backlog (both render `TicketList`) at ≤64rem (was a phone only; AMENDED 2026-10-02 (UX fixes Task 4, owner U3), 23.052): the table, its body and each row stack as blocks (`display: block` / `flex; flex-wrap: wrap`), the title cell takes the first line (`order: -1; flex: 1 0 100%`) and the key · state · assignee · due cells wrap beneath it as small meta, the column-header row is clipped rather than removed, the bulk-select checkbox is its own 44px square at the row start, and the bulk-close bar (`.gn-list__controls-end` → `.gn-list__bulk`) takes a full row with Confirm close filling it;** control: above 64rem the columns, header row and right-aligned bulk bar are unchanged. Mutation: keep the table layout (`display: table`), drop the title's `order`, shrink the select square, or take the bulk bar off its full-width basis. (`apps/web/test/phone-project-views.test.ts`; the classes the rules key on, `packages/app-core/test/views/phone-project-views-hooks.test.tsx`) AMENDED 2026-10-02 (UX fixes Task 5, case 23.073; audit PV-03): the bulk-close bar is NO LONGER full width — the `.gn-list__controls-end`, `.gn-list__bulk` and `.gn-list__bulk-close` band rules at `flex: 1 1 100%` are gone, so the controls slot and the bar sit in the toolbar row at their own width; the test now pins their absence (above 64rem unchanged).
 - ✅ **21.112 — [AMENDED 2026-10-02, neo-refresh F-4: phones no longer scroll; the grid FITS the card — every day track is `minmax(0, 1fr)`, no 22rem floor, no `overflow-x`, no 3rem cells; the toolbar still wraps and the page does not overflow. The mutation is now "put the 22rem floor back". See 23.260–23.268.] The Calendar on a phone (as first written): the month grid (`.gn-calendar__grid`) is a deliberate horizontal scroller (`overflow-x: auto`), the weekday head and each week row keep a 22rem floor, every day track is `minmax(3rem, 1fr)` (and the items track shares it, so a chip stays under its day), the toolbar wraps, and the calendar is bounded to its column so the page itself does not overflow;** control: above 40rem the columns are plain `1fr` and the grid does not scroll. Mutation: shrink the cells to fit (`minmax(0, 1fr)`), drop `overflow-x: auto`, drop the floor, or stop the toolbar wrapping. (`apps/web/test/phone-project-views.test.ts`; hooks, `packages/app-core/test/views/phone-project-views-hooks.test.tsx`)
-- ✅ **21.113 — the Timeline on a phone: `.gn-timeline` itself is the horizontal scroller (the component has no inner track), the week band and each row keep a 40rem floor and a 9rem title column (14.375rem above 40rem), the toolbar wraps and is `position: sticky; left: 0` so Today and the week arrows stay in view, and the timeline is bounded to its column so the page does not scroll;** control: above 40rem the timeline is unchanged. Mutation: let the page scroll (drop `overflow-x: auto` or `max-width`), drop the floor, or restore the wide title column. (`apps/web/test/phone-project-views.test.ts`; hooks, `packages/app-core/test/views/phone-project-views-hooks.test.tsx`)
+- 🚫 **21.113 — RETIRED by Workflow and Timeline graphs Part 1 T9 (the horizontal scroller, week band and 40rem floor are gone; the phone Timeline is portrait; replaced by 29.106, 29.107 and 29.109); was: the Timeline on a phone: `.gn-timeline` itself is the horizontal scroller (the component has no inner track), the week band and each row keep a 40rem floor and a 9rem title column (14.375rem above 40rem), the toolbar wraps and is `position: sticky; left: 0` so Today and the week arrows stay in view, and the timeline is bounded to its column so the page does not scroll;** control: above 40rem the timeline is unchanged. Mutation: let the page scroll (drop `overflow-x: auto` or `max-width`), drop the floor, or restore the wide title column. (`apps/web/test/phone-project-views.test.ts`; hooks, `packages/app-core/test/views/phone-project-views-hooks.test.tsx`)
 - 🧪 **21.114 — the project views on a real phone: at 360, 375, 390, 412, 430 and 466px, in hig / minimal / neo × light / dark, the five view tabs scroll sideways without wrapping and the current one is readable, search and Filters share a row and New ticket is full width, the List and Backlog show stacked rows (title, then key · state · assignee · due) with a 44px select square and a full-width bulk-close bar, the Calendar scrolls sideways with legible day cells and the page does not, and the Timeline scrolls inside its track with the toolbar in view.** Browser pass (the controller's Task 13). **Evidence (T13 browser pass, 2026-10-01, LOCAL dev stack built from `d22d4ffa`, popup windows driven by script; stays 🧪 — no covering automated test):** the project page's five views (Backlog, Board, List, Calendar, Timeline) at all ten widths (360…466): overflow 0 and no unaccounted small target on all 50 — EXCEPT the Calendar at 360, which overflowed the page by 5px (`scrollWidth` 365): FIXED as **21.115**. The view tabs sit on one row and scroll inside their own track (`overflow-x: auto`; scrolls at 360–430, fits at 466), the current one is `aria-selected`; search and Filters share a row; New ticket is full width (336px at 360 … 442px at 466); the List's row stacks the title (top 10, full width) then key · state · assignee · type, then the date line; the Calendar's grid scrolls sideways at 360/375 (354 > 336) and fits from 390; the Timeline scrolls inside its own box. Not measured: hig / minimal / neo × light / dark on these tabs (styles were swept on the default Board tab only), the bulk-close bar, and the Timeline toolbar's `sticky left` position.
 - ✅ **21.115 — [AMENDED 2026-10-02, F-4: the arm no longer scrolls (21.112); `position: relative` stays for the one frame before the phone query resolves.] The Calendar does not scroll the page sideways at 360: the phone `.gn-calendar__grid` is `position: relative`, so the scroller is the containing block of the day chips' absolutely placed visually-hidden text (an absolute descendant whose containing block is outside a scroller is not clipped by it);** control: above 40rem the grid is not positioned and 21.112's scroller declarations are unchanged. Found by the T13 pass: `scrollWidth` 365 against `innerWidth` 360 on the Calendar tab at 360 only (the matrix routes cannot see it — the views are tabs, not URLs). Measured with the rule injected on the `d22d4ffa` build: 5 → 0. Mutation: drop `position: relative` → red. (`packages/ui/src/ui.css`, `apps/web/test/phone-project-views.test.ts`)
 
```

`test-cases/23-ux-fixes.md`:

```diff
--- a/test-cases/23-ux-fixes.md
+++ b/test-cases/23-ux-fixes.md
@@ -75,7 +75,7 @@
 
 - ✅ **23.140 — a calendar marker is named `<key> <title>` (the title alone when unkeyed), its claim is its `title` tooltip and `aria-describedby` description, and the claim text no longer names the chip (audit PV-05).** Control: a bar is unchanged — the title alone, described by its provenance. `packages/app-core/test/calendar/calendar-view.test.tsx`
 - ✅ **23.141 — at ≤40rem `.gn-calendar__item` is `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`, after its base rule (audit PV-06).** Control: the base chip and the grid's own tracks do not carry it. `apps/web/test/project-views-ux.test.ts`
-- ✅ **23.142 — a timeline bar carries its day span (`data-day-from`/`-to`, `--timeline-bar-lead`/`-tail`/`-weeks`): Mon–Wed is 3 days with a 4-day tail, a bar clipped by the window ends on its edge, and a today line sits on the injected `today` in every row and is absent outside the window (audit PV-10).** Control: a bar that fills whole weeks has no lead and no tail; the CSS puts the bar and the line on grid row 1 and trims by a share of the bar's own weeks. `packages/app-core/test/timeline/timeline-view.test.tsx`, `apps/web/test/project-views-ux.test.ts`
+- 🚫 **23.142 — RETIRED by Workflow and Timeline graphs Part 1 T9 (bars are placed by custom properties on a day axis, not trimmed inside week columns; replaced by 29.097 and 29.101); was: a timeline bar carries its day span (`data-day-from`/`-to`, `--timeline-bar-lead`/`-tail`/`-weeks`): Mon–Wed is 3 days with a 4-day tail, a bar clipped by the window ends on its edge, and a today line sits on the injected `today` in every row and is absent outside the window (audit PV-10).** Control: a bar that fills whole weeks has no lead and no tail; the CSS puts the bar and the line on grid row 1 and trims by a share of the bar's own weeks. `packages/app-core/test/timeline/timeline-view.test.tsx`, `apps/web/test/project-views-ux.test.ts`
 - ✅ **23.143 — the undated list has a heading with its count, says "These tickets have no dates yet." when every entry is undated, keeps the other two sentences for the other lists, and each entry has an "Add dates" button that opens its ticket (audit PV-11).** Control: the old builder-voice sentence appears nowhere. `packages/app-core/test/timeline/timeline-view.test.tsx`, `timeline-model.test.ts`
 - ✅ **23.144 — Move up / Move down carry a tooltip saying they move the order of the whole backlog; the aria-label is unchanged (audit PV-14).** The lane implemented the tooltip, not hiding the controls in grouped view. `apps/web/test/backlog-tab.test.tsx`
 - ✅ **23.145 — `.gn-timeline__open` is `text-align: left` (audit PV-12).** Control: the ghost button's other declarations are unchanged. `apps/web/test/project-views-ux.test.ts`
```

`test-cases/20-styling-system.md`:

```diff
--- a/test-cases/20-styling-system.md
+++ b/test-cases/20-styling-system.md
@@ -262,7 +262,7 @@
 
 ## 20.28 Plan B — the Timeline tab
 
-- ✅ **20.271 — the timeline's Earlier / Today / Later navigation is a quiet outlined 44px control with its hover wash and agrees with the calendar's navigation on every value (the pair 13.1147 compares), and its weeks band and side panel are recessed tracks;** control: the clipped-bar dashed edges and the side-entry marker edge are still declared. Mutation: restore `min-height: 2.25rem` on `.gn-timeline__nav`.
+- ✅ **20.271 — the timeline's Today control is a quiet outlined 44px control with its hover wash and agrees with the calendar's navigation on every value (the pair 13.1147 compares), and its side panel is a recessed track (Earlier / Later and the weeks band were retired with the paging by Workflow and Timeline graphs Part 1 T9, 29.106);** control: the pending bar's dashed outline and the side-entry marker edge are still declared. Mutation: restore `min-height: 2.25rem` on `.gn-timeline__nav`.
 - ✅ **20.272 — no timeline rule paints a flat boundary or the retired constant;** control: the scan reads more than 25 timeline rules. Mutation: restore `background: var(--gn-surface-sunken)` on `.gn-timeline__side`.
 ## 20.35 Plan B — settings and the workspace settings form
 
```

  11.75 stays ✅ with the amendment above (the window-miss arm is retired; the legend assertion stays). 20.271 stays ✅, narrowed to the Today control. The web suite WHOLE: `slot-run.sh web -- pnpm --filter @gisik-nokma/web exec vitest run --maxWorkers=2 > /tmp/web.log 2>&1; tail -n 20 /tmp/web.log`.

- [ ] **Step 9: Look at it and measure (frontend-design)**

  Name `frontend-design` in the lane prompt. The lane's branch is not buildable on the dev stack (rule #23: no lane stack; `ctl rebuild` takes only `main` or a release branch), so the look is taken through the T1 harness on the lane's own build of the packages:

  ```bash
  pnpm turbo run build --filter=@gisik-nokma/flow-graph-browser^...
  cd packages/flow-graph-browser && pnpm exec vite --config vite.config.ts   # run_in_background; note the pid
  ```

  Open `http://localhost:3192/stress.html?scene=view&n=60` in a headed Chrome (or take a Playwright screenshot of it: `pnpm exec playwright screenshot --viewport-size=1280,800 http://localhost:3192/stress.html?scene=view&n=60 /tmp/view.png`, then read the PNG). Check against the spec, by measuring the real geometry (`getBoundingClientRect` in the console), not by eye: bars 28 px high on a 40 px pitch; the axis stays at the top when the lanes scroll; the weekend tint at Day zoom and none at Month; the Today line; the key inside a wide bar and outside a one-day bar; a lane heading; the side list under the chart. Fix what is wrong in `ui.css`, re-run step 7. Stop the server by its exact pid. T10 pins these measurements as browser cases.

- [ ] **Step 10: Docs, help and Features**

  The manual and the FAQ described "Earlier / Later, four weeks at a time"; the in-app help is generated from them, so both must change or `pnpm check:help` fails.

`docs/manual.md`:

```diff
--- a/docs/manual.md
+++ b/docs/manual.md
@@ -1064,9 +1064,11 @@
 
 ### Timeline
 
-The same idea stretched sideways over weeks, moving four weeks at a time with **Earlier** and
-**Later**. A bar again needs both a start and a needed-by, and it ends on the real day of the needed-by
-rather than at the end of its week. A thin line marks today in every row.
+The same idea stretched sideways, as one continuous chart with no pages: drag, swipe or scroll to move
+through time, press **Today** to glide back to it, and use the **Day**, **Week** and **Month** switch (or
+Ctrl and scroll, or a pinch) to zoom about the spot you point at. The arrow keys move a week at a time.
+A bar again needs both a start and a needed-by, and it ends on the real day of the needed-by. A thin line
+marks today. Tickets that share a day are stacked in rows, and each bar shows its ticket's key.
 
 Anything with only one date, no dates, or a contradiction goes into a list beside the chart headed
 *"Not on the timeline yet"*, with a count. The sentence under the heading says what to do: *"These
```

`docs/faq.md`:

```diff
--- a/docs/faq.md
+++ b/docs/faq.md
@@ -771,8 +771,8 @@
 connecting them. That is your cue to go and fix the dates.
 
 **What's the difference between the Calendar and the Timeline?**
-The Calendar is a month grid; the Timeline is the same idea stretched sideways over weeks, moving four
-weeks at a time. Both draw a bar only when a ticket has **both** a start and a needed-by claim. On the
+The Calendar is a month grid; the Timeline is the same idea stretched sideways as one continuous chart you
+scroll and zoom, with no pages. Both draw a bar only when a ticket has **both** a start and a needed-by claim. On the
 Timeline, anything with only one date, no dates, or a contradiction goes into a list headed *"Not on
 the timeline yet"* with a count, saying what is missing for each ticket. Its **Add dates** button opens the
 ticket so you can set them. A thin line marks today on the Timeline, and a bar ends on the real day.
```

  Regenerate the help content and check it: `node scripts/help-content.mjs` (writes `packages/app-core/src/help/content.generated.ts`), then `node scripts/help-content.mjs --check` (expected `ok`). Commit the regenerated file.

  `Features.md`. The Timeline view bullet is reworded; the three week-grid bullets (the Board prototype port Task 11 restyle, Ruling 22, and "Timeline bars end on their real day") are deleted (no tombstones; their cases are retired above); "The Timeline tab follows the rules" is rewritten to the Today control and the recessed side panel; the project-views phone bullet notes the Timeline is the continuous chart. Apply this diff by bullet title, not by line number:

`Features.md`:

```diff
--- a/Features.md
+++ b/Features.md
@@ -2762,9 +2762,7 @@
 - ✅ **Calendar view** — month grid drawn only from claimed dates: attributed markers ("needed by 30 Aug, Kiro's claim"), start→due bars when both claims exist, undated tickets absent, an all-undated board renders an empty month that says why; month nav + today ring; per-week "+n more" overflow; click opens the ticket. **Restyled to the desktop prototype's metrics — geometry and colour, not behaviour (Board prototype port Task 10, 2026-09-16).** Nav buttons and Today take `--gn-fill-tertiary`/transparent grounds with `--gn-text-accent` labels (never bare `--gn-accent`, which fails as text on a light surface — the SAME already-recorded `ctlShadow`-omitted divergence `.gn-project__workflow-select` states); a NEW weekday-head row (Mon–Sun, matching the model's own Monday-first week) sits above the day grid, both wrapped in a `--gn-surface-sunken`/`--gn-shadow-sunken` tray with a 420px floor height. Day cells take `--gn-surface-raised` in-month / `--gn-fill-quaternary` out, 1px gaps revealing the tray as hairlines. **The event list (`.gn-calendar__items`) is deliberately PINNED to `--gn-surface`, not the tray it visually sits inside** — this is not an oversight; it is the fix for a real regression a follow-up review caught: nothing between `.gn-calendar__items` and the new `.gn-calendar__grid` wrapper painted an opaque ground of its own, so every item (the custom-field marker's unchanged `--gn-custom-marker` text included) silently moved onto `--gn-surface-sunken`, and `customMarker` on `hig`/`minimal` LIGHT's `surfaceSunken` measures 4.310 — below 4.5, where the SAME pairing on the plain `--gn-surface` it was actually last measured against is 4.935 (`neo`'s cited 4.807 is unaffected either way, since `neo` collapses `surface`/`surfaceSunken` to one hex). Pinned back explicitly. **Ruling 24 (coordinator, 2026-09-16) corrected how this is gated**: the first attempt (case `11.213`, `packages/ui/test/tokens.test.ts`) computed the ratio from `tokens.ts` role lookups alone, duplicated a `CONTRAST_PAIRS` row that had already existed since Plan 9, and — because it never read `ui.css` — could not have caught this exact regression (deleting the CSS declaration left it green). Retired same-day; the real gate is case `11.214` (`packages/ui/test/in-transit.test.ts`), which reads the actual stylesheet and is proven to redden when the declaration is removed. **The today ring moved from a whole-cell outline to a 24px accent circle around the day number** (`onColor` = `--gn-accent-text`, the same pair the Filters sheet and the Timeline bar already use for "accent ground + onColor" — never `--gn-text-inverted`). **The accent-ground event pill, previously bar-only, now applies to every non-custom item** (markers included) — ONE declared exception: the custom-field marker keeps its plain `--gn-custom-marker` text treatment and does NOT become a tinted pill (measured: no purple wash clears contrast on both grounds a day cell can have; no `--gn-tint-purple` role exists or was added). This is a DECLARED architectural divergence from the prototype's single 42-cell grid: this product still renders a week's events in a separate list below its day numbers rather than inside each cell, so the 420px floor is a minimum on the whole grid, not a per-row stretch. No new token role — every `var(--gn-…)` referenced was already declared. Case `11.212`. **AN EPIC'S OWN CLAIMED DATES ARE NOT DRAWN HERE (owner, 2026-09-20).** `hideEpicRows` drops the rank-1 ticket inside `buildCalendarModel`'s `visible` filter, before any item is built — so its bar, its markers and its custom-date claims all go, and its children's claims stay. Joining `visible` rather than filtering the inputs is deliberate: a removed epic therefore counts as a NARROWING, and `narrowedOutOfGrid` still gates `CALENDAR_ALL_HIDDEN_COPY`'s exhaustivity claim off. **Every day cell now names its own full date, and a bar's date span is a linked accessible description (E4-28, batch B15, 2026-09-21).** Day cells carried only `data-day`/`data-today`/`data-outside`/`aria-current` — an assistive-tech reader landing on one heard a bare number with no month or year; each now also carries `aria-label={formatDate(day)}` (e.g. "23 Aug 2026"). A bar's rendered text is its ticket title alone, and its date span lived only in the hover-only `title` attribute; it now also carries `aria-describedby`, pointing at a visually-hidden span repeating the exact `title` string — the accessible NAME stays exactly the ticket title (nothing already depending on it broke), and the dates are linked as a DESCRIPTION rather than folded in, the same ARIA shape `apps/web/app/w/[workspaceId]/page.tsx`'s `WorkspaceLinks` already uses and documents. A MARKER USED TO BE UNTOUCHED (its text named its own date); since UX fixes T8 it too is named by its ticket and links its claim as a description — see §20. Cases `11.221`–`11.222`. **The month grid also now carries the APG calendar-grid pattern's roles (P20, batch B15, 2026-09-21).** The grid and week columns were built from `<div>`s and `<span>`s with no `role="grid"`, `role="row"`, `role="columnheader"` or `role="gridcell"` anywhere — a day cell carried no association to the weekday column it sits under. `role="grid"` (with `aria-label="Calendar"`) on `.gn-calendar__grid`, `role="row"` on the weekday head and on each week, `role="columnheader"` (with `aria-label` naming the full weekday — "Monday", not "Mon", since a three-letter abbreviation read aloud is easy to mishear) on the seven labels, `role="gridcell"` on each day — an attribute apiece on the structure that already exists, no markup reshaped. Case `11.224`. `packages/app-core/src/calendar/calendar-view.tsx`, `packages/ui/src/ui.css`
 - ✅ **Custom date fields on Calendar and Timeline** — any custom `date`-kind field renders as a claim on the same honesty terms as the built-ins: attributed to its claimant, absent when unclaimed, and labelled with the field's own name ("Filed on: 30 Aug, Kiro's claim" — the chip's tooltip and description since UX fixes T8; its text is the ticket). Markers only — a bar still requires the startDate + dueDate pair, so no span is ever invented between arbitrary claims. `packages/app-core/src/claims/ticket-dates.ts`, `packages/app-core/src/calendar/`, `packages/app-core/src/timeline/`
 - ✅ **Claimed-date-field legend** — one switch per custom date field that actually claimed a day in the visible month, named and counted; hiding is view state, reversible, and never touches what matches. **Ruling R4 (coordinator, 2026-09-16) merged the desktop prototype's legend-CARD visual treatment onto this same control** — `--gn-surface-raised`/`--gn-shadow-raised` ground, `--gn-radius-control` corners (the spec's own `ctlR`, not the bigger `cardR`) — while keeping every checkbox, field name and count exactly as before: "so a switched-off field still says how much it is hiding." **`Due date` and `In transit` join as READ-ONLY rows** (swatch + label, deliberately not an `<input>`, not even a disabled one — neither carries a per-field count or a click that does anything), gated behind the SAME `model.customDateFields.length` guard as the rest of the legend, so they are never on their own a reason to show it — a month with no custom claims still renders no legend at all. Verified with an anti-vacuous count assertion (`within(legend).getAllByRole('checkbox')` equals the custom-field count exactly, catching both a lost toggle and a read-only row shipped as a checkbox). Case `11.211`. `packages/app-core/src/calendar/calendar-view.tsx`, `packages/app-core/test/calendar/calendar-view.test.tsx`
-- ✅ **Timeline view** — week-column Gantt-lite: bars only for tickets with BOTH startDate and dueDate claims; single-claim, undated, and start-after-due work sits in a visible side list with attributed notes (a ticket carrying only custom date claims says "no claimed start or needed-by", not "no claimed dates"); epic grouping; no dependencies, no critical path. **THE SAME RULING HAS TWO ANSWERS HERE (owner, 2026-09-20), and they are kept apart: the epic's own BAR and its own side-list entry are gone, and the LANE is not a row — a lane that still holds a dated child keeps its heading, titled with the epic's name.** `hideEpicRows` removes the epic inside `visible`, which is AFTER `byId` is built from the complete input set — *"an ancestor removed by a filter still names the lane its child belongs to"* — so reaching the same outcome by dropping epics from the inputs instead would empty `byId`, move every child into "No epic" and delete the heading. **A bar's date span is now a linked accessible description, the timeline's own half of the Calendar's same fix (E4-28, batch B15, 2026-09-21).** A bar's rendered text is its ticket title alone; its date span lived only in the hover-only `title` attribute and now also carries `aria-describedby`, pointing at a visually-hidden span repeating the exact `title` string — the accessible NAME stays exactly the ticket title. Case `11.223`. **Since UX fixes T8 (§20): bars end on their real day with a today line (23.142), and the side list reads under a counted heading in plain sentences with an "Add dates" button (23.143).** `packages/app-core/src/timeline/`
-- ✅ **Timeline restyles to the desktop prototype's metrics — geometry only (Board prototype port Task 11, 2026-09-16).** Every rule lands on `.gn-timeline*`, which `TimelineView` owns end to end (no shared component involved, unlike List's `Table`), so this task hit none of the shared-surface questions Task 9 did. No new token role: `trayBg`/`trayShadow` → `--gn-surface-sunken`/`--gn-shadow-sunken` (the same pair the board's own column trays already use), `fill4` → `--gn-fill-quaternary`; the bar's `accent` ground/`accentText` text is UNCHANGED — it already used the pair the Filters sheet settled over the plan's literal `--onColor` → `--gn-text-inverted` mapping (`CONTRAST_PAIRS` in `tokens.ts` measures `accentText` against `accent`, never `textInverted`). **The title (leading) column widens from 12rem to the spec's 230px (14.375rem)**, pinned by an exact substring in `test/timeline/timeline-view.test.tsx` whose own docblock sanctions the update ("a change to the width alone will redden this too, and re-reading this comment is the intended cost") — paid here, along with the two sibling cases pinning `--timeline-week-columns` by exact equality. **The published track-list value changes from `repeat(n, 1fr)` to `repeat(n, minmax(0, 1fr))`**, the spec's own literal for this row and not merely a transcription: a bare `1fr` track carries CSS Grid's implicit automatic minimum of `auto` (min-content), so without `minmax(0, …)` a long bar or title could still push a week column wider than its share and defeat `.gn-timeline__bar`'s own ellipsis truncation. **Zebra uses `:nth-of-type(odd)`, not `:nth-child(odd)`** — each row's siblings inside `.gn-timeline__group` include the group's own `<h3 class="gn-timeline__group-heading">` ahead of the rows, which `:nth-child` would count as sibling #1 and shift every row's parity by one; `:nth-of-type` counts same-tag-name siblings only, and every sibling `<div>` in a group is in fact a `.gn-timeline__row` (checked, not assumed). **Both load-bearing checks this task's brief named were re-verified, not assumed clean:** the undrawn side-list's five per-reason modifier classes (`timeline-view.test.tsx:396-441`) are untouched — this task never renders a side-list fixture, so nothing here could reach that code — and `packages/app-core/test/inbox/inbox-css-binding.test.tsx`'s three references to `.gn-timeline__bar` are all fixture strings inside the INBOX scanner's own self-test (proving its `gn-inbox` prefix matcher is not fooled by a different prefix), never a binding assertion against the real `ui.css`/`TimelineView` — inert to this task, and its 8/8 suite is unchanged. **No live cross-style/cross-theme render was performed** — recorded as an open item for review, per the spec's own Verification section, not silently skipped. **As originally landed this bullet was also incomplete against the spec, not only unverified by eye — see Ruling 22 below, which closes it.** Case `13.474`. `packages/app-core/src/timeline/timeline-view.tsx`, `packages/app-core/test/timeline/timeline-view.test.tsx`, `packages/ui/src/ui.css`
-- ✅ **Ruling 22 (coordinator, 2026-09-16): the Timeline's "Row title" metric, dropped by the plan before it ever reached Task 11's brief.** The spec's Timeline metrics table has eight rows; the plan's own Task 11 section condensed it into six-row prose, dropping "Header cell" (implemented anyway, from the spec directly, during the original Task 11 pass) and "Row title" (not implemented — nothing in the brief named it, and `grep "Row title"` returned zero hits in the plan and the brief against one in the spec). The coordinator verified this directly rather than accepting the prior report's "every metric in its brief" framing, which was true of the brief and beside the point — the plan's own rule is that the spec wins on disagreement. Landed on `.gn-timeline__title`: `padding: 0.25rem; min-width: 0;` (4px all round, no type) → `padding: 0.375rem 0.75rem; min-width: 0; font-size: 0.9375rem; line-height: 1.25rem;` (6px/12px, 15px/20px, per the spec row `padding 6px 12px; 15px/20px; ellipsis; nowrap`). `min-width: 0` is kept though it names no metric — load-bearing for `.gn-timeline__title-text`'s own ellipsis to truncate inside a grid item; ellipsis/nowrap themselves were already correct on that child. No new token role — both values are plain length/type literals. **All eight Timeline spec rows re-checked row by row against the shipped CSS after this edit**, per the coordinator's own request to surface any other omission now rather than in final review — the other seven match exactly; nothing else is missing. **Explicitly cleared, not a finding:** `.gn-timeline__bar`'s `border-radius: 0.375rem` is a literal-to-literal change from the pre-existing 4px (neither `RADIUS_ROLES` role, `card`/`control`, resolves near 6px), not a Ruling-17-shaped regression. A stale self-citation (`:3224-3227` for `.gn-filters__chip[aria-pressed='true']`, which Ruling 21's own ~67-line insertion had moved to `:3306-3309`) was also corrected in this commit. Verification re-run on the true final tree rather than a pre-Ruling-21 snapshot: full `packages/ui`/`packages/app-core` suites green, `tsc` clean on both, and `pnpm turbo run test` at the repo root — all 17 tasks green, `apps/server` included (149/149), confirming this session's earlier `apps/server` failures were environmental flakes rather than anything this work touched. Case `13.477`. `packages/ui/src/ui.css`
+- ✅ **Timeline view** — one continuous day-axis chart with no pages (Workflow and Timeline graphs Part 1, §26): bars only for tickets with BOTH startDate and dueDate claims; single-claim, undated, and start-after-due work sits in a visible side list with attributed notes (a ticket carrying only custom date claims says "no claimed start or needed-by", not "no claimed dates"); epic grouping; no dependencies, no critical path. **THE SAME RULING HAS TWO ANSWERS HERE (owner, 2026-09-20), and they are kept apart: the epic's own BAR and its own side-list entry are gone, and the LANE is not a row — a lane that still holds a dated child keeps its heading, titled with the epic's name.** `hideEpicRows` removes the epic inside `visible`, which is AFTER `byId` is built from the complete input set — *"an ancestor removed by a filter still names the lane its child belongs to"* — so reaching the same outcome by dropping epics from the inputs instead would empty `byId`, move every child into "No epic" and delete the heading. **A bar's date span is now a linked accessible description, the timeline's own half of the Calendar's same fix (E4-28, batch B15, 2026-09-21).** A bar's rendered text is its ticket title alone; its date span lived only in the hover-only `title` attribute and now also carries `aria-describedby`, pointing at a visually-hidden span repeating the exact `title` string — the accessible NAME stays exactly the ticket title. Case `11.223`. **Since Workflow and Timeline graphs Part 1 T9 the week columns, Earlier / Later and the window are gone: a bar is placed by its start day and its length in days on a native scroller (cases 29.093–29.107, which retire 11.55, 11.56, 11.74, 11.79, 11.82, 23.142 and 21.113), and since UX fixes T8 (§20) the side list reads under a counted heading in plain sentences with an "Add dates" button (23.143).** `packages/app-core/src/timeline/`
 - ⚙️ **Filters on both views** — FilterSpec (assignee, type, state, category, project, title text) plus an epic lane; in-transit claims render distinctly (`data-pending`) with provenance on hover. **PARTLY REACHABLE NOW, and the old wording is corrected rather than left standing.** It read: *"⚙️ and not ✅ deliberately — built and tested at the view layer, not reachable by a user through the shipped web shell … the project page passes neither a FilterSpec nor a lane."* The project page now passes a `FilterSpec`: **one axis**, `stateCategories: ['active']`, behind the *Only tickets in progress* control (see the entry above). The LANE is still not passed, and the other nine axes are still not reachable. **A hard ceiling found while wiring it, worth knowing before designing the rest:** the six id-shaped axes are LISTS client-side while `filterSpecSchema` takes exactly ONE value each, so `toServerFilterSpec` THROWS `UnexpressibleFilterError` on any two-value narrowing — *"not done"* (`open` + `active`) cannot be expressed at all, and needs either a plural `stateCategory` or a negation term on the route. The `data-pending` half is a different case and NOT a gap: `toTicketDatesInput` hard-codes `pendingFieldIds: []` because this shell is online-only, so at the moment a list read lands nothing is in transit — Plan 10's replica is where that array stops being empty. *Owner for the filter wiring: whoever mounts a filter bar on the project page.* `packages/app-core/src/filter/`, `packages/app-core/src/claims/`, `apps/web/src/ticket-dates-input.ts`
 - ⚙️ **Notification fan-out** — on committed events: `ticket.assigned` → assignee, structured `@mention` nodes in ticket comments/descriptions → the mentioned (and in notes and note comments, with their own diff and read gate — see "Mentioning people in a note"), `claim.contested` → the original claimant; canSee-gated so a notification never out-leaks its ticket; idempotent per (user, dedupe key). `apps/server/src/notifications/fanout.ts`
   - ⚙️ **A birth assignee is notified** (owner ruling 2026-09-29; access plan Task 4) — `ticket.created` carrying `assigneeId` goes through the same `handleAssigned` as `ticket.assigned`: same guards, same gate, same `assignment:<event id>` key. Cases 11.225–11.227.
@@ -3583,7 +3581,7 @@
 - ✅ **The List and Backlog tabs follow the rules** (styling refresh Plan B Task B6; `ui.css` `.gn-list*`, `.gn-table__row--clickable`, `.gn-row-action`) — a raised table with a recessed `surface-well` header band and flat `fill-quaternary` section titles (UX fixes T6, 23.095: no longer recessed track bands); rows answer hover with a soft `fill-quaternary` wash; a row action is a ghost control (edgeless) and the toolbar's bulk close and column chooser are quiet outlined 44px pills; column options are raised 44px pills. The board's Close rule is split so only its own two names stay in the shared body. Cases 20.251–20.253. `packages/ui/test/styling-b6-list.test.ts`
 - ✅ **One hover vocabulary for every door card: the shadow deepens** (styling refresh Plan B Task B13; `globals.css`) — the workspace card, the project card and the workspace home's section cards answer hover with the near shadow above their neighbours and settle it on press — shadow only, nothing scales (owner ruling 2026-09-29) — replacing Round 21's brightness pair with no per-theme arm; with no filter or transform left, a card's own Delete dialog is never trapped in a containing block. The section cards and the project-founding panel rest on the lift shadow. Create project is the home's one loud element. Cases 20.321–20.323.
 - ✅ **The Calendar tab follows the rules** (styling refresh Plan B Task B7; `ui.css` `.gn-calendar*`) — the arrows and Today are quiet outlined 44px pills with a hover wash, the legend a raised panel, the month grid a recessed track whose 1px gaps still draw the day lines, and the weekday row sits on the track with no fill of its own. Cases 20.261–20.262. `packages/ui/test/styling-b7-calendar.test.ts`
-- ✅ **The Timeline tab follows the rules** (styling refresh Plan B Task B8; `ui.css` `.gn-timeline*`) — the Earlier / Today / Later navigation is a quiet outlined 44px pill with a hover wash, agreeing with the calendar's; the weeks band and the side panel are recessed tracks; the clipped-bar and side-entry state edges are unchanged. Cases 20.271–20.272. `packages/ui/test/styling-b8-timeline.test.ts`
+- ✅ **The Timeline tab follows the rules** (styling refresh Plan B Task B8; `ui.css` `.gn-timeline*`) — the Today control is a quiet outlined 44px pill with a hover wash, agreeing with the calendar's; the side panel is a recessed track; the pending-bar and side-entry state edges are unchanged. Earlier / Later and the weeks band were retired with the paging (Workflow and Timeline graphs Part 1 T9). Cases 20.271–20.272. `packages/ui/test/styling-b8-timeline.test.ts`
 - ✅ **Empty states follow the rules** (styling refresh Plan B Task B9; `ui.css` `.gn-board--empty`, `.gn-board__empty-create`, `.gn-board__column-empty`) — an empty board is a recessed track like its columns; its create action is a quiet outlined pill because the header's Create ticket is already the one loud element; an empty column has no fill of its own, so its track shows through. Cases 20.281–20.282. `packages/ui/test/styling-b9-empty-states.test.ts`
 - ⚙️ **My work, audited** (styling refresh Plan B Task B10; `ui.css` `.gn-my-work*`, `.gn-attention*`; no CSS changed) — the page paints no flat boundary and no retired control constant, so it inherits the refresh through the shared Card, Button and shell layers; its row titles and attention items keep the 24px in-list floor (`DENSE_IN_LIST` names the titles). Cases 20.291–20.292; `packages/ui/test/styling-b10-my-work.test.ts`.
 - ✅ **The workspaces page has one loud element** (styling refresh Plan B Task B14; `apps/web/app/workspaces/page.tsx`) — Create workspace is the only primary; each invitation's Accept is a quiet outlined control (a variant change only), so pending invitations no longer multiply the loud elements; the cards deepen their shadow on hover, shadow only (B13). Cases 20.331–20.332.
@@ -3609,7 +3607,7 @@
 - ✅ **Move to… on desktop cards** (mobile-web plan Task 5; cases 21.060–21.062) — above 40rem each card's footer gains a ghost **Move to…** after the ‹ › arrows (≥44px), the same button the phone shows as **Move**: it opens the move dialog over every board destination in both directions, so a branching state's far targets are one click away without the arrows' picker. One accessible name ("Move to another state") at every width; the visible word is swapped by CSS. Amends 20.052's footer list. `packages/app-core/src/views/board.tsx`, `packages/ui/src/ui.css`.
 - ✅ **The ticket sheet full screen, and dialogs as bottom sheets** (mobile-web plan Task 6; cases 21.070–21.074) — at ≤40rem the ticket sheet fills the screen (the `.gn-sheet--full` form, forced: `width: 100%`, square, no shadow) and its Full-screen toggle is hidden; its header sticks to the top and carries a phone-only **Move** shortcut (accessible name "Move this ticket") that calls the same `openMove` handler as the State row's **Move…**, so one dialog opens. Dialogs (`.gn-dialog`) become bottom sheets: pinned to the bottom, full width, rounded on top only, at most `90dvh`, clear of the home-indicator inset; they keep the `gnRise` entrance and none under reduced motion. CSS-only except the shortcut. `packages/ui/src/ui.css`, `packages/app-core/src/views/ticket-sheet.tsx`.
 - ✅ **Phone screens: workspaces, workspace home, Members, Inbox** (mobile-web plan Task 7; cases 21.090–21.093) — at ≤40rem `/workspaces` and the workspace home are single-column, the Create workspace button spans the header's width and the Create project button wraps under the Projects heading (the dialogs are the Dialog's own phone sheet); the workspace home's section links become a scrollable row of compact chips (22.148); Members is stacked rows (name + email, role select full width, Remove under it) with the pending-invitation rows wrapping and the invite form full width; Inbox rows keep a ≥44px tap height with the unread dot and badge, and "Load more" spans the list. Desktop and tablet are unchanged. `apps/web/app/globals.css`, `packages/ui/src/ui.css` (the `.gn-inbox__*` arm).
-- ✅ **The project page's other views on a phone** (mobile-web plan Task 8; cases 21.110–21.115) — at ≤40rem the view tabs scroll sideways in their own snapping track instead of wrapping; search and Filters share the first row and Create ticket is the one full-width primary; List and Backlog render stacked rows (title line, then key · state · assignee · due as meta, a 44px select square, a full-width bulk-close bar) instead of a table; the Calendar month grid FITS the card (since neo-refresh F-4, 2026-10-02: it was a deliberate horizontal scroller with 3rem day cells; see "The phone calendar is dots, lines and a day agenda" in §20) and its toolbar wraps; the Timeline scrolls inside itself with its toolbar sticky. CSS-only apart from one hook class (`gn-project__filters`) on the Filters button. `packages/ui/src/ui.css` (the owning screens' phone arms), `apps/web/app/globals.css` (`.gn-project__rail`), `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`.
+- ✅ **The project page's other views on a phone** (mobile-web plan Task 8; cases 21.110–21.115) — at ≤40rem the view tabs scroll sideways in their own snapping track instead of wrapping; search and Filters share the first row and Create ticket is the one full-width primary; List and Backlog render stacked rows (title line, then key · state · assignee · due as meta, a 44px select square, a full-width bulk-close bar) instead of a table; the Calendar month grid FITS the card (since neo-refresh F-4, 2026-10-02: it was a deliberate horizontal scroller with 3rem day cells; see "The phone calendar is dots, lines and a day agenda" in §20) and its toolbar wraps; the Timeline is the continuous chart, still a horizontal scroller on a phone until it turns portrait (Workflow and Timeline graphs Part 1 T9 and T11; it was a scroller with a sticky toolbar, case 21.113, retired). CSS-only apart from one hook class (`gn-project__filters`) on the Filters button. `packages/ui/src/ui.css` (the owning screens' phone arms), `apps/web/app/globals.css` (`.gn-project__rail`), `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`.
 - ✅ **Notes, a note's page and My work on a phone** (mobile-web plan Task 9; cases 21.130–21.134) — at ≤40rem the Notes tree is the existing toggle panel (the "Notes list" toggle a 44px target), the document fills the width, and every editor-toolbar control on the page (the note's and the comment composer's) is 44px and wraps; a note's title stays on one line and **Copy as Markdown / History / Delete…** move behind one "⋯" menu — the workspace card's menu, extracted as `OverflowMenu` (`apps/web/src/overflow-menu.tsx`) and used by `NoteByline` by script (`useIsPhone`), so desktop keeps the inline buttons; My work's rows and title buttons are 44px in a single column and the attention strip's clickable rows are lifted to 44px by one phone rule (`.gn-attention__item`, `min-height: 2.75rem`; case 21.134 — `13.893`'s one-declaration guard now allows exactly one phone-arm rule per family selector, after its base). The split scroll above 60rem is untouched. `apps/web/app/globals.css` (`.gn-notes*`, `.gn-card-menu--inline`), `packages/ui/src/ui.css` (`.gn-my-work*`, `.gn-attention__item`), `apps/web/src/notes/note-byline.tsx`.
 - ✅ **Every editor-toolbar tool is an icon, with its name as a tooltip; on a phone the bar is one docked row with a "More tools" bottom sheet** (owner, 2026-10-01: *"can we not have named buttons but icon instead. check what is the usual icons used for each tool"* and *"A as recommended"*; mobile-web plan Task 9 follow-up; cases 21.135–21.140, 21.233–21.238) — at EVERY width each tool is one 16px inline stroke SVG (`aria-hidden`, `currentColor`, no icon package): bold, italic and strikethrough glyphs; code `<>`, link (chain), bullet list, numbered list, quote, task list (checkbox + lines), code block (`<>` in a square), collapsible (chevron + lines), horizontal rule, **Insert note** (page with a +) and **Insert ticket** (stub); undo, redo and table kept theirs. The `aria-label` stays the name, and the existing role="tooltip" panel (hover, keyboard focus) gains a **touch long-press** (500ms resting finger shows the name, the click that ends the press is swallowed so reading "Bold" does not toggle bold, the name lingers 1.5s). At ≤40rem (script-gated by `PHONE_TOOLBAR_QUERY`, the same `(max-width: 40rem)` as `PHONE_BOARD_QUERY`, in every toolbar host) the bar is ONE docked row, and **More tools** is a bottom sheet — **AMENDED 2026-10-02 by smoothness G-7 (cases 25.400–25.419, see its bullet below)**: it used to keep eight tools and open the other nine as an in-place tray, two rows; the tray and `.ticket-editor__tray` are gone. The phone bar and the 44px targets apply to EVERY host of the editor — the ticket sheet's description and comment editors, the new-ticket dialog, Notes and the note comment composer (AUDIT BRD-08, 2026-10-02; cases 21.233–21.238): `editor.css` has its own ≤40rem arm after its bases (44px tools and heading select, dividers hidden, the toolbar's side padding trimmed to 0.25rem; G-7: the groups no longer wrap, the bar is one scrolling row), so nothing is cut in the sheet and the dialog at 360–466 (cases 21.236/21.237 keep a weaker `≤ 2 rows` model bound; before G-7 the Notes bar measured 106px at 360 and 5 rows/256px before that); the Notes-only `.gn-notes .ticket-editor__*` rules are gone. Above 40rem nothing moves and there is no More. `packages/editor/src/components/EditorToolbar.tsx`, `packages/editor/src/styles/editor.css` (the phone arm).
 - ✅ **Account, Settings, MCP tokens, Help, Privacy and Terms on a phone** (mobile-web plan Task 10; cases 21.150–21.153, 🧪 21.154; `apps/web/app/globals.css` phone arms beside each screen's own rules) — at ≤40rem: `/account`'s column drops its 42.5rem cap and the device and passkey rows stack (label and tag, activity, the action under); Connected assistants and `/mcp/tokens` rows put Rename / Revoke / Disconnect under the label, the Copy URL address takes its own line and wraps, and the rename field fills its row; `/settings`'s sidebar becomes a horizontally scrolling track above the content (the current section keeps its filled pill) and Save is full width; Help, Privacy and Terms read at the full viewport width inside the shell's 24px gutter and `overflow-wrap: anywhere` on their titles and prose. Desktop and tablet are untouched.
@@ -3657,7 +3655,6 @@
 
 - ✅ **The phone calendar is dots, lines and a day agenda** (neo-refresh follow-up F-4, owner 2026-10-02, audit PV-05 + N1; cases 23.260–23.269; `packages/app-core/src/calendar/calendar-view.tsx`, `calendar-model.ts`, `packages/ui/src/ui.css` phone arm) — at ≤40rem (`usePhoneBoard`, the same query as the stylesheet's arm) the month grid fits its card (`minmax(0, 1fr)` tracks, no 22rem floor, no padding or gap, so a 360px viewport's cells are 44.5px) and draws no chips: a single-day marker is a dot in its day cell and a span is a 3px line under the days it covers, no text; more than three dots in a day or three lines in a week row fold to "+n" (`PHONE_MAX_MARKS`, the model's order kept). Each day is a 44px button (`aria-pressed`; today by default when it is in the shown month, else the 1st; Today and month navigation reset it) and the agenda under the grid lists EVERY item active that day: `<key> <title>`, then a marker's claim or a span's range and its place in it ("28 Sep → 2 Oct (day 3 of 5)"); a span is listed under every day it covers, a claim on an impossible day under its week's first day with its claimed text verbatim, and each row opens its ticket. Desktop and tablet keep the chips. `CalendarBar` carries the ticket `key`.
 - ✅ **A phone calendar chip is one line** (UX fixes T8; case 23.141, audit PV-06; `packages/ui/src/ui.css`) — at ≤40rem `.gn-calendar__item` is `nowrap` with an ellipsis; desktop chips still wrap. The per-week fold limit is unchanged.
-- ✅ **Timeline bars end on their real day, and today has a line** (UX fixes T8; case 23.142, audit PV-10; `packages/app-core/src/timeline/timeline-model.ts`, `timeline-view.tsx`, `packages/ui/src/ui.css`) — each row carries `days: {from, to}` (day indexes in the window; a clipped end is the window's edge) and `todayDay` (`null` outside the window; `today` is the injected prop, never a clock). The bar stays in its WEEK columns and the stylesheet trims it by `--timeline-bar-lead` / `--timeline-bar-tail` days, so a Mon–Wed bar ends on Wednesday. A `.gn-timeline__today` accent rule (aria-hidden) sits on today in every row.
 - ✅ **The undated list speaks to the person and offers "Add dates"** (UX fixes T8; case 23.143, audit PV-11; `packages/app-core/src/claims/claim-labels.ts`, `timeline-model.ts`, `timeline-view.tsx`) — a heading "Not on the timeline yet (n)"; a list of only undated tickets reads "These tickets have no dates yet.", a mixed one "Add a start and a due date to place a ticket on the timeline.", one holding an undrawable ticket the undrawable sentence. Each entry has an "Add dates" button that opens the ticket sheet (`onOpenTicket`).
 - ✅ **A wrapped timeline title keeps its left edge** (UX fixes T8; case 23.145, audit PV-12; `.gn-timeline__open` in `packages/ui/src/ui.css`) — `text-align: left`, since a `<button>` centres its text.
 - ✅ **Move up / Move down say what they move** (UX fixes T8; case 23.144, audit PV-14; `apps/web/src/backlog-rank-controls.tsx`) — each button's `title` reads "Move up/down in backlog order — the order of the whole backlog, not only this group"; the aria-label (`Move <title> up`) is unchanged. The controls stay visible in the grouped view.
```

  Then replace the anchor `<!-- wtg-part1-viewport-timeline-view T9 bullet -->` in section 26 with:

```markdown
- ✅ **The Timeline is one continuous, packed canvas** (Workflow and Timeline graphs Part 1 T9; cases 29.093–29.107; `packages/app-core/src/timeline/{timeline-model,timeline-view}.tsx`, `packages/ui/src/ui.css` `.gn-timeline*`, `packages/ui/src/tokens.ts`) — there are no pages: no Earlier / Later, no `SHIFT_DAYS`, no week-column grid. A native scroller on a day axis (`--tl-ppd`), a Today button and a Day | Week | Month switch (a free zoom marks none), a two-row axis (W labels on Mondays, day numbers cross-faded in around 20 px per day, a tinted weekend column from 16), the today line, bars 28 px high on a 40 px pitch packed per epic lane, the ticket key on the bar (just outside a bar too short for it; the accessible name stays the title), a check on a finished ticket and a play mark on one in progress, custom date claims as callouts beside the bar, and only the bars within a viewport either side of the view are mounted. The claims semantics are unchanged: a bar needs both claims, the five side-list reasons, epic lanes and provenance. New opaque token `timelineWeekend` (`--gn-timeline-weekend`, 4.5:1 against `textMuted`). Retires 11.55, 11.56, 11.74, 11.79, 11.82, 13.474, 13.477, 21.113 and 23.142 and narrows 20.271 to the Today control.
```

- [ ] **Step 11: Mutation pass (own)**
  - `dayNumberOf` off by one in the row (`startDay: dayNumberOf(...) + 1`) → 29.093; `--dn` computed without `+ 1` → 29.097; `endDay < startDay` rows (a start-after-due ticket drawn) → the 11.73 side-list tests.
  - `isCalendarDay` guard on `todayDay` removed → 29.101 (an invalid day must draw none).
  - delete `memo(` around `TimelineBar` → 29.102 (the source scan goes RED in T9; the render-count case lands in T12 and goes RED there too; a render-count case alone let the removal survive in the first draft, which is why the source scan sits beside it).
  - mount every bar even with a measured width → 29.102; `mountRange` replaced by the visible range → 29.102.
  - toolbar: add an `Earlier` button → 29.099 and 29.105; `presetOf` ignored (always mark Week) → 29.099.
  - `outside = barPx < measure(key)` flipped → 29.100; the `stateMark` arms swapped → 29.100.
  - CSS: bar `height: 28px` to `30px`; `top: calc(34px + var(--row) * 40px + 6px)` to `38px`; `overscroll-behavior: contain` removed; the weekend tile `* 7px` to `* 6px`; re-add a `.gn-timeline__weeks` rule → 29.106.
  - `timelineWeekend` mapped to a translucent colour → 29.104.
  - Record survivors with reasons.

**Prose to sweep:** what this task makes FALSE that the steps above do not already edit (line numbers at `origin/release/workflow-graph`; re-read before editing). Already edited above, so NOT listed: `docs/manual.md:1067-1069`, `docs/faq.md:774-775` (and the regenerated `content.generated.ts`), `Features.md:2765-2767`, `:3598`, `:3624`, `:3672`, the case lines 11.55, 11.56, 11.74, 11.75, 11.79, 11.82, 13.474, 13.477, 20.271, 21.113, 23.142, the `ui.css` comments starting at `:2791`, `:2964`, `:2980` and `:4747`, the docblocks of the two web tests, `styling-b8-timeline.test.ts`, `tokens.test.ts`, `phone-project-views-hooks.test.tsx`, `clock-free.test.ts` and the `SHIFT_DAYS` comment in `src/index.ts`.
- `test-cases/11-calendar-notifications.md:51` — 11.61 says the distinct count is **2** and "the `narrowedAway` guard survives and still keeps the window sentence away, so the window miss is still its own" (after T9 the count is 1, the guard and the window sentence are gone, and the test is retitled for 29.095).
- `packages/app-core/test/timeline/timeline-model.test.ts:837-858` — the 11.61 docblock: "work that is fully dated but wholly outside the window", "The window miss is the case the component cannot reconstruct", "THE BLOCK IS NOW ABOUT TWO SENTENCES, NOT THREE ... The guard it steered by is kept" (the diff keeps `:856-858` as context).
- `packages/app-core/test/timeline/timeline-model.test.ts:712-713` — "24 Aug and 28 Aug are both in the 24-30 week: one column, untouched by the 26 Aug claim" (kept as diff context; there are no columns).
- `packages/app-core/test/timeline/timeline-view.test.tsx:26` — "11.73–11.82 — `TimelineView`, the week columns over Task 10's landed model" (11.74, 11.79 and 11.82 are retired; there are no week columns); `:42` "a clipped marker on a bar that fits" and `:48-49` "the title column's own text ... (11.79)" (no clipped marker, no title column).
- `packages/app-core/test/timeline/timeline-view.test.tsx:104-106` — `TODAY`'s docblock: "`mondayOnOrBefore` puts the window's first column on 2026-08-17, so week 0 is 17 Aug and the eighth (default) column starts 5 Oct" (kept as context by the `@@ -106` hunk).
- `packages/app-core/test/timeline/timeline-view.test.tsx:646` — the 11.80 test title "in the title column and not inside the bar", and `:651-652` "never a cell in the week grid ... the bar is the only thing this row puts on a column" (the diff changes `:650` to `.gn-timeline__row` and keeps both).
- `packages/app-core/src/claims/claim-labels.ts:199-211` — `TIMELINE_EMPTY_COPY`'s docblock: "The FIRST empty timeline", "work that is fully dated and merely elsewhere in time", "Reached when nothing is on screen, nothing visible is scheduled outside the window, and nothing a narrowing removed would have shown here" (one empty arm now; Step 4 edits only `:236-260`).
- `packages/app-core/src/calendar/calendar-view.tsx:451-452` — "the same shape `.gn-list__section-title` and `.gn-timeline__weeks` already declare for the identical reason" (the weeks band is deleted).
- `packages/ui/src/ui.css:2645-2648` — "`fill4` → `--gn-fill-quaternary`, already the established mapping ... (`.gn-list__table-row:nth-child(odd)` below, the timeline's own week columns)" (the timeline's zebra is deleted).
- `packages/ui/test/in-transit.test.ts:37-38` — the anchoring rationale "`.gn-timeline__bar[data-pending]` never matches inside `.gn-timeline__bar[data-clipped-start][data-clipped-end]`" names a rule Step 6 deletes.
- `packages/ui/test/components.test.tsx:1953-1954` — 13.1147's docblock "the timeline's Earlier / Today / Later buttons" (only Today remains; the case still holds for `.gn-timeline__nav`).
- `Features.md:2772` — "IST day boundaries everywhere a day is decided — calendar cell assignment, timeline day columns, ..." (no columns: day numbers on one axis).
- `test-cases/21-mobile-web.md:99` — 21.114 (🧪) "the Timeline scrolls inside its track with the toolbar in view" and "Not measured: ... the Timeline toolbar's `sticky left` position" (the sticky toolbar arm is deleted; amend, keep the dated evidence).
- `test-cases/13-board-prototype-port.md:857` and `:944` — "the same pair Task 11's `.gn-timeline__weeks` uses" / "the SAME pair `.gn-timeline__weeks` already uses (`ui.css:1939-1942`)" (present tense about a deleted rule, in other cases' evidence notes); `:1926-1927` "`.gn-timeline__nav` — the three Earlier / Today / Later buttons".
- `Features.md` §26, T3's bullet as T3 writes it (plan line 3110 on the ref copy): "Pure and unused by a screen until a later Part: Part 1 builds no route". After T9 the Timeline view calls `mountRange` and `panLimits`. Reword it to: "the Timeline view uses `mountRange` and `panLimits`; the fetch planners and the cache wait for a later Part (Part 1 builds no route)" (planner ruling 2026-10-04).
- `apps/web/e2e-stack/tap-target-baseline.json:8` (`"stack-phone-390|/p/:projectId#timeline": 37`) and `apps/web/e2e-stack/type-scale-baseline.json:8` (`"stack-phone-390|/p/:projectId#timeline": 0`) are measured numbers for the week grid's DOM. T9 replaces that DOM, so it re-measures both in Step 12 (planner ruling 2026-10-04).
- Not swept (dated records, not living prose): `docs/design/prototype-delta-2026-09-18.md:615,620`, `docs/hig-reconciliation-audit.md:559`, `docs/lanes/*-history.md`.

- [ ] **Step 12: Flip and gate**
  - Flip ❌ to ✅ on 29.093–29.107, **except 29.102, which goes to 🟡** (planner ruling 2026-10-04). In T9, 29.102 has only the source scan; the render counter its case line promises lands in T12, which flips it to ✅. Then run `pnpm check:citations` (the retired ids are not checked: only ✅ ids are).
  - **Re-measure the e2e-stack phone Timeline baselines this task changes** (planner ruling 2026-10-04: the task that changes the DOM owns them):
    - The files are `apps/web/e2e-stack/tap-target-baseline.json` (key `stack-phone-390|/p/:projectId#timeline`, 37 on the ref) and `apps/web/e2e-stack/type-scale-baseline.json` (the same key, 0 on the ref).
    - Also check `apps/web/e2e-stack/accessible-names-baseline.json` (`stack-phone-390|/p/:projectId`, `:9`) for a change.
    - The dev stack is the primary checkout's (rule #23). Ask the controller for `ctl rebuild` with this branch merged into the release branch's build, then run `apps/web/e2e-stack/viewport.spec.ts` once with `UPDATE_TAP_BASELINE=1 UPDATE_TYPE_SCALE_BASELINE=1` (and `UPDATE_ACCESSIBLE_BASELINE=1` only if that key moved).
    - Commit only the Timeline keys that changed, in this PR, and name each old → new number in the HANDOFF. A number that RISES is a regression: report it rather than recording it.
  - Whole suites named LOCAL: ui, app-core, web (`ui.css` changed). `pnpm check:help`, `pnpm check:citations`, `pnpm check:env`, `pnpm check:tasks`.
  - `ctl gate <sha> --base release/workflow-graph`; `ctl land <pr> --base release/workflow-graph`. HANDOFF: the mutation table, the survivors, and the line "T11 turns the phone portrait; until then a phone shows the landscape chart (21.113 is retired, 29.109 lands in T11)".


### Task 10: The continuous Timeline in a real browser (cases 29.040–29.044)

**Branch:** `task/wtg1-browser` from `origin/release/workflow-graph` (after T9). **NEEDS:** nothing (headless Chromium is a pass for behaviour; these cases make no frame-rate claim). A headed run is welcome for a second look.

**Files:**
- Create: `packages/flow-graph-browser/harness/timeline.html`, `packages/flow-graph-browser/harness/timeline-main.tsx`, `packages/flow-graph-browser/tests/timeline.spec.ts`
- Modify: `test-cases/29-workflow-timeline-graphs.md` (T10 anchor), `Features.md` (T10 bullet anchor)
- Modify only if a case finds a real defect: `packages/ui/src/ui.css`, `packages/app-core/src/timeline/timeline-view.tsx`, `packages/viewport/src/dom/scroll-adapter.ts` (with a failing unit case added first, in the file that owns the unit)

**Interfaces:**
- **Consumes:** the BUILT `@gisik-nokma/app-core` (`TimelineView`, `TicketDatesInput`), `@gisik-nokma/ui` (`themeStylesheet`, `ui.css`), `@gisik-nokma/viewport` (through the view).
- **Produces:** the page `timeline.html?n=<tickets>&span=<days>&h=<panel height>&theme=light|dark&style=neo|hig|minimal` (today is fixed at 2026-10-02 as an injected prop; `window.__opened` holds the last opened ticket id), which T11 extends and Part 4 copies for the Home Timeline.

**Why a real browser.** jsdom has no layout, no compositor and no scroll rounding. Four things this feature promises can only be proven where a scroller really scrolls: the anchored zoom on a platform that rounds `scrollLeft` (Review Focus 1, case 29.041), the page staying put under a wheel (the `overscroll-behavior` and `preventDefault` pair), a sticky axis over scrolling lanes, and a touch swipe being the platform's own scroll (no drag handler may run).

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part1-viewport-timeline-view T10 -->`, insert (all ❌):

- ❌ **29.040 — the panel fills the height under its filters, a bar is 28 px on a 40 px pitch, the axis stays at the top when the lanes scroll, and the weekend tint is on at Day and off at Month.** (`packages/flow-graph-browser/tests/timeline.spec.ts`)
- ❌ **29.041 — Ctrl + wheel zooms about the pointer: the day under it moves less than half a pixel on every event, and the page does not scroll.** (`packages/flow-graph-browser/tests/timeline.spec.ts`)
- ❌ **29.042 — a mouse drag pans, a touch swipe is the platform's own scroll, the arrow keys glide 7 days, Today and Home put today in the middle, and reduced motion lands at once.** (`packages/flow-graph-browser/tests/timeline.spec.ts`)
- ❌ **29.043 — a fast pan of 10 viewports at one per second leaves no frame with an empty band.** (`packages/flow-graph-browser/tests/timeline.spec.ts`)
- ❌ **29.044 — a custom date claim is a callout that opens on hover and on focus and is hidden otherwise.** (`packages/flow-graph-browser/tests/timeline.spec.ts`)

- [ ] **Step 2: The specs first (RED)**

`packages/flow-graph-browser/tests/timeline.spec.ts` (new):

```ts
import { expect, test, type Page } from '@playwright/test';

/**
 * The continuous Timeline view in a real browser (Workflow and Timeline graphs, Part 1; spec TV-1 to TV-11, VP-1 to VP-9, PR-7).
 * The page is `harness/timeline-main.tsx`: the BUILT app-core view over a synthetic project, today fixed at 2026-10-02.
 * 24 px per day is the Week preset the view opens on.
 */
const PPD = 24;

const state = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    return {
      ppd: Number(getComputedStyle(c).getPropertyValue('--tl-ppd')),
      scrollLeft: c.scrollLeft,
      scrollTop: c.scrollTop,
      weekend: c.dataset['weekend'],
      panelH: (document.querySelector('.gn-timeline') as HTMLElement).getBoundingClientRect().height,
      pageY: window.scrollY,
    };
  });

const todayCentre = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    const t = document.querySelector('.gn-timeline__today') as HTMLElement;
    const r = c.getBoundingClientRect();
    const q = t.getBoundingClientRect();
    return q.left + q.width / 2 - (r.left + r.width / 2);
  });

test('29.040 the panel fills the height under its filters, a bar is 28 px on a 40 px pitch, the axis stays at the top when the lanes scroll, and the weekend tint is on at Day and off at Month', async ({ page }) => {
  await page.goto('/timeline.html?n=200&span=60&theme=light&h=80vh');
  await expect(page.locator('.gn-timeline__canvas')).toBeVisible();
  const s = await state(page);
  expect(s.panelH).toBeGreaterThan(500);
  // TV-11 fills to the WINDOW, not to the host div (80vh = 576 px here): the panel ends 16 px above the window's bottom edge
  const bottomGap = await page.evaluate(() => window.innerHeight - (document.querySelector('.gn-timeline') as HTMLElement).getBoundingClientRect().bottom);
  expect(bottomGap).toBeGreaterThanOrEqual(15);
  expect(bottomGap).toBeLessThanOrEqual(17);
  const tops = await page.evaluate(() => {
    // ONE lane, every bar in it (the band covers all 60 days): the packed rows are contiguous, so the distinct tops are the pitch
    const bars = [...document.querySelectorAll<HTMLElement>('.gn-timeline__lane')[0]!.querySelectorAll<HTMLElement>('.gn-timeline__bar')];
    return { heights: [...new Set(bars.map((b) => b.getBoundingClientRect().height))], tops: [...new Set(bars.map((b) => Math.round(b.getBoundingClientRect().top)))].sort((a, b) => a - b) };
  });
  expect(tops.heights).toEqual([28]);
  expect(tops.tops.length).toBeGreaterThanOrEqual(3); // at least two pitches to compare, or `every` below passes on nothing
  const pitches = tops.tops.slice(1).map((t, i) => t - (tops.tops[i] as number));
  expect(pitches).toEqual(pitches.map(() => 40));
  // 200 bars over 60 days stack into more rows than the panel holds: scroll the lanes and the axis keeps its place
  await page.evaluate(() => { (document.querySelector('.gn-timeline__canvas') as HTMLElement).scrollTop = 300; });
  await page.waitForTimeout(100);
  const axis = await page.evaluate(() => {
    const c = (document.querySelector('.gn-timeline__canvas') as HTMLElement).getBoundingClientRect();
    return { scrollTop: (document.querySelector('.gn-timeline__canvas') as HTMLElement).scrollTop, gap: (document.querySelector('.gn-timeline__axis') as HTMLElement).getBoundingClientRect().top - c.top };
  });
  expect(axis.scrollTop).toBeGreaterThan(100);
  expect(Math.abs(axis.gap)).toBeLessThan(1);
  // weekend tint: the Week preset (24 px/day) shows it, Month (8) hides it, Day (56) shows it again
  expect((await state(page)).weekend).toBe('on');
  await page.getByRole('radio', { name: 'Month' }).click();
  await page.waitForTimeout(700);
  let z = await state(page);
  expect(z.ppd).toBeCloseTo(8, 0);
  expect(z.weekend).toBe('off');
  await page.getByRole('radio', { name: 'Day' }).click();
  await page.waitForTimeout(700);
  z = await state(page);
  expect(z.ppd).toBeCloseTo(56, 0);
  expect(z.weekend).toBe('on');
});

test('29.041 Ctrl + wheel zooms about the pointer: the day under it moves less than half a pixel on every event, and the page does not scroll', async ({ page }) => {
  await page.goto('/timeline.html?n=40&theme=light');
  const canvas = page.locator('.gn-timeline__canvas');
  await expect(canvas).toBeVisible();
  // The page must be ABLE to scroll, or `pageY === 0` below is true whatever the view does (the panel alone fits the window).
  // Every wheel event is recorded at the window, after the canvas's listener: `defaultPrevented` is the cancel itself.
  await page.evaluate(() => {
    document.body.style.minHeight = '200vh';
    const w = window as unknown as { __wheel: boolean[] };
    w.__wheel = [];
    window.addEventListener('wheel', (e) => w.__wheel.push(e.defaultPrevented), { passive: true });
    // A whole-pixel start, so the reference day below is exact (the open position may be a half pixel the platform rounded)
    (document.querySelector('.gn-timeline__canvas') as HTMLElement).scrollLeft = 2400;
  });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeGreaterThan(100);
  const box = (await canvas.boundingBox()) as { x: number; y: number };
  const dayAtPointer = (st: { ppd: number; scrollLeft: number }) => (st.scrollLeft + 600) / st.ppd;
  const before = await state(page);
  expect(before.scrollLeft).toBe(2400);
  await page.mouse.move(box.x + 600, box.y + 200);
  let worst = 0;
  // 24 small steps (x e^0.048 each: 24 -> 76 px/day), every one BELOW the 96 cap: an event at the cap writes nothing, so a
  // sweep that reaches it (the old -60 steps did after two events) gives the naive read-back nothing to drift on
  for (let i = 0; i < 24; i += 1) {
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -4);
    await page.keyboard.up('Control');
    await page.waitForTimeout(40);
    const st = await state(page);
    worst = Math.max(worst, Math.abs(dayAtPointer(st) - dayAtPointer(before)) * st.ppd);
  }
  await page.waitForTimeout(600);
  const after = await state(page);
  expect(after.ppd).toBeGreaterThan(before.ppd);
  expect(after.ppd).toBeLessThan(96);
  expect(worst).toBeLessThanOrEqual(0.5 + 1e-6);
  expect(after.pageY).toBe(0);
  const cancelled = await page.evaluate(() => (window as unknown as { __wheel: boolean[] }).__wheel);
  expect(cancelled.length).toBeGreaterThan(0);
  expect(cancelled.every((prevented) => prevented)).toBe(true);
});

test('29.042 a mouse drag pans, a touch swipe is the platform\'s own scroll, the arrow keys glide 7 days, Today and Home put today in the middle, and reduced motion lands at once', async ({ page, browser }) => {
  await page.goto('/timeline.html?n=40&span=200&theme=light');
  const canvas = page.locator('.gn-timeline__canvas');
  await expect(canvas).toBeVisible();
  expect(Math.abs(await todayCentre(page))).toBeLessThan(2);
  // mouse drag: 200 px left of the pointer is 200 px of scroll, and a drag begun on a bar would not pan (unit-tested), so the
  // drag must START on empty canvas or a correct view reds here for the wrong reason
  const onBar = (p: Page, x: number, y: number) =>
    p.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('.gn-timeline__bar') != null, [x, y] as const);
  const box = (await canvas.boundingBox()) as { x: number; y: number };
  const before = await state(page);
  expect(await onBar(page, box.x + 700, box.y + 250)).toBe(false);
  await page.mouse.move(box.x + 700, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 250, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  expect((await state(page)).scrollLeft - before.scrollLeft).toBeGreaterThan(190);
  // keys
  await page.getByRole('button', { name: 'Today' }).click();
  await page.waitForTimeout(700);
  expect(Math.abs(await todayCentre(page))).toBeLessThan(2);
  await canvas.focus();
  const x0 = (await state(page)).scrollLeft;
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  expect(Math.abs((await state(page)).scrollLeft - x0 - 7 * PPD)).toBeLessThan(2);
  await page.keyboard.press('Home');
  await page.waitForTimeout(700);
  expect(Math.abs(await todayCentre(page))).toBeLessThan(2);
  // touch: no drag handler runs and the browser's own pan scrolls the canvas. `gn-dragging` is added on pointerdown and removed on
  // pointerup/cancel, so a class check AFTER the swipe is green either way: an observer records every class it ever held.
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, hasTouch: true });
  const touch = await ctx.newPage();
  await touch.goto('/timeline.html?n=40&span=200&theme=light');
  await expect(touch.locator('.gn-timeline__canvas')).toBeVisible();
  expect(await onBar(touch, 450, 300)).toBe(false); // a touch begun on a bar is ignored by the adapter anyway: start off one
  await touch.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    const w = window as unknown as { __dragged: boolean };
    w.__dragged = false;
    new MutationObserver((records) => {
      for (const r of records) if ((r.oldValue ?? '').includes('gn-dragging') || c.classList.contains('gn-dragging')) w.__dragged = true;
    }).observe(c, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  });
  const dragged = () => touch.evaluate(() => (window as unknown as { __dragged: boolean }).__dragged);
  const t0 = await state(touch);
  const cdp = await ctx.newCDPSession(touch);
  await cdp.send('Input.synthesizeScrollGesture', { x: 450, y: 300, xDistance: -400, yDistance: 0, gestureSourceType: 'touch', speed: 1200 });
  await touch.waitForTimeout(500);
  const t1 = await state(touch);
  expect(t1.scrollLeft - t0.scrollLeft).toBeGreaterThan(300);
  expect(await dragged()).toBe(false);
  // control: the same observer on the same page sees a MOUSE drag (begun on the sticky axis, which holds no bar whatever scrolled)
  const tbox = (await touch.locator('.gn-timeline__canvas').boundingBox()) as { x: number; y: number };
  await touch.mouse.move(tbox.x + 450, tbox.y + 20);
  await touch.mouse.down();
  await touch.mouse.move(tbox.x + 400, tbox.y + 20, { steps: 4 });
  await touch.mouse.up();
  expect(await dragged()).toBe(true);
  await ctx.close();
  // reduced motion: the same key press has already landed on the next frame
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/timeline.html?n=40&span=200&theme=light');
  await page.locator('.gn-timeline__canvas').focus();
  const r0 = (await state(page)).scrollLeft;
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(50);
  expect(Math.abs((await state(page)).scrollLeft - r0 - 7 * PPD)).toBeLessThan(2);
});

test('29.043 a fast pan of 10 viewports at one per second leaves no frame with an empty band', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/timeline.html?n=1200&span=1500&theme=light');
  await expect(page.locator('.gn-timeline__canvas')).toBeVisible();
  // park on the first day that has data (the margin before it is empty BY DESIGN, TV-3) and let the band settle: a teleport is
  // not a pan, and the first paint after one may be empty
  await page.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    c.scrollLeft = 0;
    c.scrollLeft = 1400;
  });
  await page.waitForTimeout(500);
  const result = await page.evaluate(
    () =>
      new Promise<{ frames: number; empty: number; moved: number }>((resolve) => {
        const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
        const start = c.scrollLeft;
        let last = performance.now();
        const t0 = last;
        let frames = 0;
        let empty = 0;
        const step = (): void => {
          const now = performance.now();
          const dt = now - last;
          last = now;
          c.scrollLeft += (c.clientWidth * dt) / 1000;
          const r = c.getBoundingClientRect();
          const visible = [...document.querySelectorAll('.gn-timeline__bar')].filter((b) => {
            const q = b.getBoundingClientRect();
            return q.right > r.left && q.left < r.right;
          }).length;
          frames += 1;
          if (visible === 0) empty += 1;
          if (now - t0 < 10_000) requestAnimationFrame(step);
          else resolve({ frames, empty, moved: c.scrollLeft - start });
        };
        requestAnimationFrame(step);
      }),
  );
  expect(result.frames).toBeGreaterThan(100);
  expect(result.moved).toBeGreaterThan(9 * 1280);
  expect(result.empty).toBe(0);
  // PR-5, the mechanism: the band is mounted BEFORE it scrolls in. The data covers every day several times over, so a bar that
  // intersects the visible days never leaves the view empty for one frame; `empty === 0` alone stays green with the band cut to
  // the visible days. At rest the band reaches at least a quarter viewport past each edge (the refresh rule), so bars that START
  // an eighth of a viewport beyond the right edge, and END one before the left, are mounted.
  await page.waitForTimeout(500);
  const beyond = await page.evaluate(() => {
    const r = (document.querySelector('.gn-timeline__canvas') as HTMLElement).getBoundingClientRect();
    const bars = [...document.querySelectorAll('.gn-timeline__bar')].map((b) => b.getBoundingClientRect());
    return { ahead: bars.filter((q) => q.left > r.right + r.width / 8).length, behind: bars.filter((q) => q.right < r.left - r.width / 8).length };
  });
  expect(beyond.ahead).toBeGreaterThan(0);
  expect(beyond.behind).toBeGreaterThan(0);
});

test('29.044 a custom date claim is a callout that opens on hover and on focus and is hidden otherwise', async ({ page }) => {
  await page.goto('/timeline.html?n=40&span=60&theme=light');
  const row = page.locator('.gn-timeline__row:has(.gn-timeline__claims)').first();
  const claims = row.locator('.gn-timeline__claims');
  // `toBeHidden` also passes when NOTHING matches: the callout must exist (and stay mounted) for "hidden" to mean anything
  await expect(claims).toHaveCount(1);
  await expect(claims).toBeHidden();
  await row.locator('.gn-timeline__bar').hover();
  await expect(claims).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(claims).toHaveCount(1);
  await expect(claims).toBeHidden();
  await row.locator('.gn-timeline__bar').focus();
  await expect(claims).toBeVisible();
});
```

**Kills:** (this task's own code is the harness page; the mutants are edits to the code it proves in a browser: T6's `scroll-adapter.ts`, T9's `timeline-view.tsx` and `ui.css` blocks, as Step 5 lists)
- 29.040 the panel fills the height, 28 px on 40 px, sticky axis, weekend tint: (a) delete the `useFillHeight(panelRef)` call in `TimelineView` (the panel no longer ends 16 px above the window: `bottomGap` reds) (b) `.gn-timeline__bar` `height: 28px` → `30px` (heights `[30]`), or `top: calc(34px + var(--row) * 40px + 6px)` → `* 42px` (pitches 42) (c) `.gn-timeline__axis` `position: sticky` → `relative` (gap −300) (d) delete `canvas.dataset['weekend'] = …` in the frame handler (`weekend` undefined, not `'on'`).
- 29.041 Ctrl + wheel zooms about the pointer, the page does not scroll: (a) `pos()` returns `dom` always (the naive read-back; drift past 0.5 px over 24 below-cap events on a rounding platform) (b) the wheel listener's `{ passive: false }` → `{ passive: true }` (`preventDefault` ignored: the window records `defaultPrevented === false`) (c) `onWheel` returns before `applyScale` (ppd stays 24: `after.ppd > before.ppd` reds).
- 29.042 drag, touch, keys, Today, Home, reduced motion: (a) drop `e.pointerType === 'touch' ||` in `onPointerDown` (the observer records `gn-dragging` during the swipe) (b) `go(e.shiftKey ? 28 : 7)` → `go(e.shiftKey ? 28 : 8)` (ArrowRight lands 24 px off) (c) `const reduce = options.instant === true || this.reduced()` → `options.instant === true` (50 ms after the press the glide is ~90 px short) (d) `goToday` aims at `anchorDay - adapter.viewportDays() / 2` without `+ 0.5` (today 12 px off centre); delete the `'Home'` arm (Home leaves today 168 px off).
- 29.043 a fast pan leaves no empty band: (a) `mountRange` returns `{ start: view.start, end: view.end }` (no bar starts an eighth of a viewport past either edge: `ahead`/`behind` 0) (b) delete the quarter-edge `setBand(mountRange(range))` in the frame handler (the band stays around today; frames go empty within about 3 s: `empty > 0`).
- 29.044 the custom date claim callout: (a) delete the `.gn-timeline__row:hover > .gn-timeline__claims` selector (not visible after hover) (b) delete the `:focus-within` selector (not visible after focus) (c) the base `.gn-timeline__row > .gn-timeline__claims` rule's `display: none` → `display: block` (the first `toBeHidden` reds).

  Read the specs before the page. They fix the contract: 24 px per day is the Week preset the view opens on (`PPD`); the touch case opens a SECOND browser context with `hasTouch` and drives the platform's pan through a CDP `Input.synthesizeScrollGesture`, because a mouse-event simulation would exercise the wrong code path; the reduced-motion case navigates again under `emulateMedia({ reducedMotion: 'reduce' })`. 29.043 pans 10 viewports in 10 seconds from the first day that has data (the margin before it is empty by design, TV-3) and requires every sampled frame to have at least one bar in view.

- [ ] **Step 3: The page**

`packages/flow-graph-browser/harness/timeline.html` (new):

```html
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>timeline harness</title></head>
<body style="margin:0"><div id="root"></div><script type="module" src="./timeline-main.tsx"></script></body></html>
```

`packages/flow-graph-browser/harness/timeline-main.tsx` (new):

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TimelineView, type TicketDatesInput } from '@gisik-nokma/app-core';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import '@gisik-nokma/ui/ui.css';

/**
 * The product's own Timeline view (the BUILT `@gisik-nokma/app-core`) over a synthetic project, in a page the specs drive.
 * `?n=<tickets>&span=<days the tickets are spread over>&h=<panel height>&theme=light|dark&style=neo|hig|minimal`.
 * Today is the fixed day 60 after 2026-08-03 (an injected prop, like the product's: nothing here reads the clock).
 */
const params = new URLSearchParams(window.location.search);
document.documentElement.dataset['style'] = params.get('style') || 'neo';
if (params.get('theme')) document.documentElement.dataset['theme'] = params.get('theme') as string;
const themeTag = document.createElement('style');
themeTag.textContent = themeStylesheet();
document.head.appendChild(themeTag);

const claim = (value: unknown) => ({ value, actorId: 'u1', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' });
const n = Number(params.get('n') ?? 40);
const span = Number(params.get('span') ?? 400);
const base = Date.UTC(2026, 7, 3);
const day = (offset: number): string => new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
const tickets: TicketDatesInput[] = Array.from({ length: n }, (_, i) => {
  const start = Math.floor((i * span) / n);
  const length = 1 + ((i * 7) % 12);
  return {
    key: `GN-${100 + i}`,
    state: {
      kind: 'ticket', id: `t${i}`, workspaceId: 'w', projectId: 'p', typeId: 'task', parentId: i % 9 === 0 ? 'epic1' : null, workflowId: 'wf', workflowVersion: 1,
      stateId: 's', stateCategory: i % 4 === 0 ? 'terminal' : i % 4 === 1 ? 'active' : 'open', assigneeId: null, collaboratorIds: [],
      fields: {
        title: claim(`Ticket ${i} with a long title`),
        startDate: claim({ date: day(start) }),
        dueDate: claim({ date: day(start + length - 1) }),
        ...(i % 7 === 0 ? { 'filed-on': claim(day(start + 1)) } : {}),
      },
      transitions: [],
    },
    pendingFieldIds: [],
    customDateFields: [{ id: 'filed-on', name: 'Filed on' }],
  } as unknown as TicketDatesInput;
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <div id="host" style={{ height: params.get('h') ?? '70vh', display: 'flex', flexDirection: 'column' }}>
      <TimelineView tickets={tickets} today={day(60)} userName={(id) => id} onOpenTicket={(id) => ((window as unknown as { __opened: string }).__opened = id)} />
    </div>
  </StrictMode>,
);
```

  The page wraps the view in a `div#host` of the requested height (a flex column, like the project page's), renders under `StrictMode` (a double effect run is how a leaked listener shows up), and spreads `n` synthetic tickets over `span` days from 2026-08-03: every ninth is a child of an epic, every seventh carries a custom date claim ("Filed on"), a quarter are done and a quarter in progress.

- [ ] **Step 4: Run, GREEN**

  ```bash
  pnpm turbo run build --filter=@gisik-nokma/flow-graph-browser^...
  slot-run.sh fgb -- pnpm --filter @gisik-nokma/flow-graph-browser exec playwright test tests/timeline.spec.ts > /tmp/fgb.log 2>&1; tail -n 30 /tmp/fgb.log
  ```

  Expected: 5 tests green, named `LOCAL, headless`. The harness reads the BUILT packages, so after any source edit rebuild first (a stale `dist` is the usual cause of a red spec that is green in jsdom). If a case is red for a real reason, FIX THE PRODUCT with a failing unit case first in the file that owns the unit (the view test, the adapter test, the stylesheet test), then re-run both. Do not loosen a spec to its tolerance: 0.5 px is the spec's number.

- [ ] **Step 5: Mutation pass (own)**
  - `ScrollAdapter.pos()` returns the DOM value every time (the naive read-back) → 29.041 must go RED on this platform: Chromium at device pixel ratio 1 rounds `scrollLeft`. **Run this mutant first, and keep the result** (planner ruling 2026-10-04).
    - If it goes RED at DPR 1, 29.041 stays on the `desktop` project as written.
    - If it SURVIVES at DPR 1, the platform did not round, so the leg cannot see the trap there. Add a second Playwright project to `packages/flow-graph-browser/playwright.config.ts`: `{ name: 'desktop-dpr15', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1.5, headless: process.env['FG_HEADED'] !== '1' } }`. At DPR 1.5, `scrollLeft` snaps to device pixels, so the read-back is no longer exact.
    - When you use that project, run 29.041 on it (`test.skip(testInfo.project.name !== 'desktop-dpr15', …)` inside 29.041, and the reverse skip only if another case breaks there), then re-run the mutant and confirm it is RED there.
    - Record in the HANDOFF and on the 29.041 case line which project the leg runs on (`desktop` at DPR 1, or `desktop-dpr15`) and the mutant's result on each.
  - the `wheel` listener registered `passive: true` (so `preventDefault` is ignored) → 29.041 (`pageY` is 0 only because the event was cancelled).
  - `overscroll-behavior: contain` removed from `.gn-timeline__canvas` → 29.106 (T9's stylesheet parse). No T10 case can see it: the swipe in 29.042 starts mid-canvas and never reaches an end, and an uncancelled Ctrl + wheel zooms the browser rather than scrolling the page; record it as a known survivor here.
  - `.gn-timeline__axis` `position: sticky` to `relative` → 29.040.
  - bar `height: 28px` to `30px`, or the 40 px pitch to 42 → 29.040.
  - the weekend `data-weekend` flip removed → 29.040.
  - the `mountRange` margin made 0 (only the visible days mounted) → 29.043 (an empty frame appears during the fast pan). Record the survivors.

**Prose to sweep:**
- `packages/flow-graph-browser/playwright.config.ts:3` — "Real-browser stress cases for the time and flow surfaces": after this task `tests/` also holds the behaviour specs (`timeline.spec.ts`), which make no frame-rate claim and pass headless (this task's own NEEDS line); say so beside the stress sentence.
- `packages/flow-graph-browser/README.md:32` — the `timeline.html?n=&span=&theme=` row: the page this task builds also reads `h` and `style` (the Interfaces line); add them.
- Only if Step 5 adds the `desktop-dpr15` project: `packages/flow-graph-browser/playwright.config.ts` holds one `desktop` project on the ref, so its header comment and the README's run section are where a second project gets named, and the "Expected: 5 tests green" count becomes the per-project count the run prints (planner ruling 2026-10-04).

- [ ] **Step 6: Flip, bullet, gate**
  - Flip ❌ to ✅ on 29.040–29.044; `pnpm check:citations`.
  - Features section 26: replace `<!-- wtg-part1-viewport-timeline-view T10 bullet -->` with:

```markdown
- ✅ **The continuous Timeline in a real browser** (Workflow and Timeline graphs Part 1 T10; cases 29.040–29.044; `packages/flow-graph-browser/tests/timeline.spec.ts`, `harness/timeline.html`) — the panel fills the height under its filters at a 28 px bar on a 40 px pitch with the axis fixed while lanes scroll; Ctrl + wheel zooms about the pointer (under half a pixel of drift per event, the page never scrolls); a mouse drag pans with momentum while a touch swipe stays the platform's; arrow keys glide 7 days; Today and Home centre today; reduced motion lands at once; a scripted fast pan of 10 viewports in 10 seconds leaves no frame with an empty mounted band; a custom date claim opens on hover and on focus.
```

  - The flow-graph-browser suite WHOLE, then `ctl gate <sha> --base release/workflow-graph`; `ctl land <pr> --base release/workflow-graph`.


### Task 11: The phone: portrait orientation and "Nothing in view" (cases 29.108–29.112)

**Branch:** `task/wtg1-portrait` from `origin/release/workflow-graph` (after T10; it extends the T10 harness page and the T9 view). **NEEDS:** `frontend-design` named in the lane prompt (UI work). The real-browser cases emulate a 390 px phone; the owner's real phone is read in T13.

**Files:**
- Modify: `packages/app-core/src/timeline/timeline-view.tsx` (orientation, the pill, the jumps), `packages/ui/src/ui.css` (`.gn-timeline[data-orientation='portrait']`, `.gn-timeline__nothing`)
- Modify tests: `packages/app-core/test/timeline/timeline-view.test.tsx`, `packages/app-core/test/views/phone-project-views-hooks.test.tsx`, `packages/ui/test/timeline-continuous.test.ts`
- Create: `packages/flow-graph-browser/tests/timeline-phone.spec.ts`
- Modify docs: `docs/manual.md`, the regenerated `packages/app-core/src/help/content.generated.ts`
- Modify: `test-cases/29-workflow-timeline-graphs.md` (T11 anchor), `Features.md` (the phone-views bullet, and the T11 bullet anchor)

**Interfaces:**
- **Consumes:** T9's view and stylesheet, T8's `layoutLanes(..., {orientation})` and `COLUMN_WIDTH`, T6's `ScrollAdapter({axis: 'y'})`.
- **Produces:** `data-orientation="portrait" | "landscape"` on `.gn-timeline`; the status pill `.gn-timeline__nothing` (`role="status"`) with two buttons named **Jump to the previous bar** and **Jump to the next bar**; the portrait CSS contract (a lane is a 112 px column group placed by `--lane-offset`, a bar is 100 px wide at `--row` x 112 px and as tall as its days, the day labels ride an 80 px sticky gutter, `--tl-gutter`).
- **Used by:** T12 (the pin in portrait), T13 (the real phone), Part 4 (Home's phone layout).

**Design notes:**
- **Orientation is the view's decision, not a media query's** (PK-7): `useOrientation` reads the panel's own `clientWidth` on mount and on window resize; narrower than 40rem (640 px) is portrait; 640 and wider, and an UNMEASURED panel (jsdom, a hidden tab: width 0) are landscape. The canvas carries `key={orientation}` so a rotation remounts it and rebuilds the adapter with the other axis.
- **Portrait packs on the same engine** with a one-line key footprint along the time axis (`PORTRAIT_KEY_FOOTPRINT_PX = 16`: a key is text down a column, not a width) and `COLUMN_WIDTH` 112 per row; time runs DOWN, the surface is `PORTRAIT_GUTTER_PX + layout.extent` wide and `--tl-ppd` tall per day. Touch scrolling stays the platform's.
- **"Nothing in view" (TV-9, Review Focus 5).** Work is never lost on a continuous axis, but the viewer can be looking at a gap. The pill is a verdict about where the view has COME TO REST: it is computed on the adapter's frames, is false while `frame.moving`, is false on an empty chart (the empty sentence speaks there, and the pill would add a second voice), and is true only when there are bars, none touches the visible days. Its two jumps glide (the 450 ms spring) to the nearest bar beyond either edge; a jump with no bar beyond it is disabled. Nothing here is named Earlier, Later, Previous or Next (the names are "Jump to the previous bar" and "Jump to the next bar").
- A glide aimed past the scroller's end must still come to rest or the pill would never appear: 29.112 pins that with a PageDown past the last day (T6's 29.039 is the unit case).

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part1-viewport-timeline-view T11 -->`, insert (all ❌):

- ❌ **29.108 — Nothing in view, and the jumps that glide to the next or previous bar | with bars only far from today the pill reads "Nothing in view" and offers both jumps, the one with no bar beyond it disabled; control: a bar around today shows no pill | no timeline control is named Earlier, Later, Previous or Next, with the pill up or down | an empty chart has no pill (the empty sentence speaks); control: bars elsewhere do.** (`packages/app-core/test/timeline/timeline-view.test.tsx`)
- ❌ **29.109 — portrait runs time down a sticky gutter, and the Nothing-in-view pill floats over the stage | a lane is a 112 px column group placed by --lane-offset, the day labels ride an 80 px sticky gutter, a bar is 100 px wide at --row x 112 px and as tall as its days; control: the landscape bar is unchanged | the pill is a rounded status chip over the bottom of the stage, never inside the scroller; the disabled jump is dimmed and not clickable.** (`packages/ui/test/timeline-continuous.test.ts`)
- ❌ **29.110 — the panel names its orientation: narrower than 40rem (640 px) is portrait, 640 and wider and an unmeasured panel (jsdom, a hidden tab) are landscape.** (`packages/app-core/test/views/phone-project-views-hooks.test.tsx`)
- ❌ **29.111 — on a 390 px phone the view is portrait: time runs down, bars are 100 px columns, the day gutter stays on the left, and the page does not scroll sideways.** (`packages/flow-graph-browser/tests/timeline-phone.spec.ts`)
- ❌ **29.112 — Nothing in view appears once the view comes to rest over a gap, its jump glides to a bar and the pill goes; control: a bar in view shows no pill.** (`packages/flow-graph-browser/tests/timeline-phone.spec.ts`)

- [ ] **Step 2: The tests first (RED)**

`packages/app-core/test/timeline/timeline-view.test.tsx`:

```diff
--- a/packages/app-core/test/timeline/timeline-view.test.tsx
+++ b/packages/app-core/test/timeline/timeline-view.test.tsx
@@ -1048,3 +1048,50 @@
     expect(TIMELINE_SIDE_LIST_COPY).toBe('Add a start and a due date to place a ticket on the timeline.');
   });
 });
+
+describe('29.108 Nothing in view, and the jumps that glide to the next or previous bar', () => {
+  const bar = (title: string, start: string, due: string): TicketDatesInput =>
+    ticket({ fields: { title: claimField(title), startDate: claimField({ date: start }), dueDate: claimField({ date: due }) } });
+
+  it('29.108 with bars only far from today the pill reads "Nothing in view" and offers both jumps, the one with no bar beyond it disabled; control: a bar around today shows no pill', () => {
+    // jsdom has no layout: the canvas is 0 px wide, so the view rests on [today, today] (TODAY = 2026-08-23) and the verdict is about that day.
+    renderTimeline([bar('Far ahead', '2027-08-23', '2027-08-27')]);
+    const pill = screen.getByRole('status');
+    expect(pill).toHaveTextContent('Nothing in view');
+    // The pill hangs off the stage, never inside the scroller (29.109's "never inside the scroller", seen in the DOM).
+    expect(pill.closest('.gn-timeline__canvas')).toBeNull();
+    expect(pill.parentElement).toHaveClass('gn-timeline__stage');
+    expect(screen.getByRole('button', { name: 'Jump to the next bar' })).toBeEnabled();
+    expect(screen.getByRole('button', { name: 'Jump to the previous bar' })).toBeDisabled();
+    document.body.innerHTML = '';
+    renderTimeline([bar('Around today', '2026-08-21', '2026-08-26')]);
+    expect(screen.getByRole('button', { name: 'Around today' })).toBeInTheDocument();
+    expect(screen.queryByRole('status')).toBeNull();
+  });
+
+  it('29.108 no timeline control is named Earlier, Later, Previous or Next, with the pill up or down', () => {
+    const names = /^(Earlier|Later|Previous|Next)$/i;
+    renderTimeline([bar('Far ahead', '2027-08-23', '2027-08-27')]);
+    // Pill UP: its two jumps exist, so a jump renamed "Next" or "Previous" would be found.
+    expect(screen.getByRole('status')).toBeInTheDocument();
+    expect(screen.getAllByRole('button', { name: /^Jump to the (previous|next) bar$/ })).toHaveLength(2);
+    expect(screen.queryAllByRole('button', { name: names })).toHaveLength(0);
+    document.body.innerHTML = '';
+    // Pill DOWN: the toolbar alone (Today and the zoom switch) names none of them either.
+    renderTimeline([bar('Around today', '2026-08-21', '2026-08-26')]);
+    expect(screen.queryByRole('status')).toBeNull();
+    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
+    expect(screen.queryAllByRole('button', { name: names })).toHaveLength(0);
+  });
+
+  it('29.108 an empty chart has no pill (the empty sentence speaks); control: bars elsewhere do', () => {
+    renderTimeline([]);
+    expect(screen.queryByRole('status')).toBeNull();
+    expect(screen.getByRole('note')).toHaveTextContent(TIMELINE_EMPTY_COPY);
+    document.body.innerHTML = '';
+    // CONTROL, same it: the same mount with one bar far from today DOES raise the pill, so the null above is the empty-chart rule
+    // and not a verdict that never runs in jsdom.
+    renderTimeline([bar('Far ahead', '2027-08-23', '2027-08-27')]);
+    expect(screen.getByRole('status')).toHaveTextContent('Nothing in view');
+  });
+});
```

**Kills:**
- 29.108 the pill and its jumps: (a) `const none = frame.moving ? false : rows.length > 0` (drop the `!rows.some(...)` visibility test: the "Around today" control raises a pill) (b) the previous jump's `disabled={!hasPrevious}` → `disabled={!hasNext}` (hasNext/hasPrevious swapped: next disabled, previous enabled) (c) move the `{nothingInView && (...)}` block inside the `.gn-timeline__canvas` div (`pill.closest('.gn-timeline__canvas')` is no longer null).
- 29.108 no Earlier / Later / Previous / Next: (a) the label `Jump to the next bar` → `Next` (the pill-up names leg finds it) (b) `setNothingInView(... none)` → `setNothingInView(false)` (the pill never rises: the pill-up precondition goes red).
- 29.108 an empty chart has no pill: (a) drop `rows.length > 0 &&` (a resting empty chart raises the pill) (b) `setNothingInView(... none)` → `setNothingInView(false)` (the same-it control goes red).

`packages/app-core/test/views/phone-project-views-hooks.test.tsx`:

```diff
--- a/packages/app-core/test/views/phone-project-views-hooks.test.tsx
+++ b/packages/app-core/test/views/phone-project-views-hooks.test.tsx
@@ -122,4 +122,22 @@
     expect(root?.querySelector('.gn-timeline__weeks')).toBeNull();
     expect((root as HTMLElement).style.getPropertyValue('--timeline-week-columns')).toBe('');
   });
+
+  it('29.110 the panel names its orientation: narrower than 40rem (640 px) is portrait, 640 and wider and an unmeasured panel (jsdom, a hidden tab) are landscape', () => {
+    const orientationAt = (width: number): string | null => {
+      const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
+      try {
+        return renderIt().container.querySelector('.gn-timeline')?.getAttribute('data-orientation') ?? null;
+      } finally {
+        spy.mockRestore();
+        cleanup();
+      }
+    };
+    expect(orientationAt(390)).toBe('portrait');
+    expect(orientationAt(639)).toBe('portrait');
+    // CONTROLS, same it: the edge, a desktop width and no layout at all are landscape.
+    expect(orientationAt(640)).toBe('landscape');
+    expect(orientationAt(1280)).toBe('landscape');
+    expect(orientationAt(0)).toBe('landscape');
+  });
 });
```

**Kills:**
- 29.110 the panel names its orientation: (a) `PORTRAIT_BELOW_PX = 640` → `600` (639 reads landscape) (b) drop `width > 0 &&` in `useOrientation` (an unmeasured panel reads portrait) (c) `width < PORTRAIT_BELOW_PX` → `width <= PORTRAIT_BELOW_PX` (640 reads portrait).

`packages/ui/test/timeline-continuous.test.ts`:

```diff
--- a/packages/ui/test/timeline-continuous.test.ts
+++ b/packages/ui/test/timeline-continuous.test.ts
@@ -4,7 +4,7 @@
 import { cssOf } from './helpers/style-patterns.js';
 import { CONTRAST_PAIRS, TOKEN_ROLES, colorOf, cssVariableName, themeStylesheet } from '../src/tokens.js';
 
-/** Workflow and Timeline graphs, Part 1, T9 — cases 29.104 (the weekend role) and 29.106 (the stylesheet contract). */
+/** Workflow and Timeline graphs, Part 1 — T9: 29.104 (the weekend role) and 29.106 (the stylesheet contract); T11: 29.109 (portrait and the pill). */
 const STYLES = ['hig', 'minimal', 'neo'] as const;
 const THEMES = ['light', 'dark'] as const;
 
@@ -73,3 +73,48 @@
     expect(valueOf(calm, 'transition')).toBe('none');
   });
 });
+
+describe('29.109 portrait runs time down a sticky gutter, and the Nothing-in-view pill floats over the stage', () => {
+  const ui = cssOf('ui');
+  const portrait = (selector: string): string => `.gn-timeline[data-orientation='portrait']${selector === '' ? '' : ` ${selector}`}`;
+
+  it('29.109 a lane is a 112 px column group placed by --lane-offset, the day labels ride an 80 px sticky gutter, a bar is 100 px wide at --row x 112 px and as tall as its days; control: the landscape bar is unchanged', () => {
+    expect(valueOf(ruleExactly(ui, portrait('')), '--tl-gutter')).toBe('80px');
+    const lane = ruleExactly(ui, portrait('.gn-timeline__lane'));
+    expect(valueOf(lane, 'left')).toBe('calc(var(--tl-gutter) + var(--lane-offset))');
+    expect(valueOf(lane, 'width')).toBe('var(--lane-extent)');
+    const bar = ruleExactly(ui, portrait('.gn-timeline__bar'));
+    expect(valueOf(bar, 'left')).toBe('calc(var(--row) * 112px + 6px)');
+    expect(valueOf(bar, 'width')).toBe('100px');
+    expect(valueOf(bar, 'top')).toBe('calc(var(--tl-axis-height) + var(--d0) * var(--tl-ppd) * 1px)');
+    expect(valueOf(bar, 'height')).toBe('max(6px, calc(var(--dn) * var(--tl-ppd) * 1px - 2px))');
+    const axis = ruleExactly(ui, portrait('.gn-timeline__axis'));
+    expect(valueOf(axis, 'position')).toBe('sticky');
+    expect(valueOf(axis, 'width')).toBe('var(--tl-gutter)');
+    expect(valueOf(ruleExactly(ui, portrait('.gn-timeline__today')), 'border-top')).toBe('2px solid var(--gn-accent)');
+    // The key outside a short bar has no room in a 100 px column; its words are in the bar's title.
+    expect(valueOf(ruleExactly(ui, portrait('.gn-timeline__key--outside')), 'display')).toBe('none');
+    // CONTROL, same it: the landscape bar is still placed by --d0 from the left, and portrait is NOT a media query.
+    expect(valueOf(ruleExactly(ui, '.gn-timeline__bar'), 'left')).toBe('calc(var(--d0) * var(--tl-ppd) * 1px)');
+    const portraitRules = parseRules(ui).filter((r) => r.selectors.some((s) => s.includes("[data-orientation='portrait']")));
+    expect(portraitRules.length).toBeGreaterThanOrEqual(10);
+    expect(portraitRules.filter((r) => r.atRule !== null).map((r) => `${r.atRule} ${r.selectors.join(', ')}`)).toEqual([]);
+  });
+
+  it('29.109 the pill is a rounded status chip over the bottom of the stage, never inside the scroller; the disabled jump is dimmed and not clickable', () => {
+    const pill = ruleExactly(ui, '.gn-timeline__nothing');
+    expect(valueOf(pill, 'position')).toBe('absolute');
+    expect(valueOf(pill, 'bottom')).toBe('1rem');
+    expect(valueOf(pill, 'border-radius')).toBe('999px');
+    expect(valueOf(pill, 'z-index')).toBe('4');
+    expect(valueOf(pill, 'background')).toBe('var(--gn-surface-raised)');
+    expect(valueOf(ruleExactly(ui, '.gn-timeline__stage'), 'position')).toBe('relative');
+    const disabled = ruleExactly(ui, '.gn-timeline__nothing .gn-timeline__nav:disabled');
+    expect(valueOf(disabled, 'cursor')).toBe('default');
+    expect(valueOf(disabled, 'opacity')).toBe('0.45');
+    // GUARD (T9's canvas, not a control of this task's rules): the canvas is itself a positioning parent that scrolls, so a pill inside
+    // it would be carried away; the pill's place OUTSIDE it is pinned in the DOM by 29.108 (`pill.closest('.gn-timeline__canvas')`).
+    expect(valueOf(ruleExactly(ui, '.gn-timeline__canvas'), 'position')).toBe('relative');
+    expect(ruleExactly(ui, '.gn-timeline__stage')).not.toContain('overflow');
+  });
+});
```

**Kills:**
- 29.109 portrait geometry: (a) portrait `--tl-gutter: 80px` → `72px` (b) portrait `.gn-timeline__bar` `width: 100px` → `96px` (c) wrap the portrait `.gn-timeline__key--outside` rule in `@media (max-width: 40rem)` (`ruleExactly` at top level throws and the media scan lists it). The landscape-bar leg guards T9's base rule against a lane that edits it instead of the portrait arm (a second top-level `.gn-timeline__bar` rule makes `ruleExactly` throw).
- 29.109 the pill: (a) `.gn-timeline__nothing` `position: absolute` → `static` (b) drop `opacity: 0.45` from the disabled jump (c) `border-radius: 999px` → `0.5rem`. The canvas `position` leg guards T9 (`Kills: none` for that leg); the pill's DOM place is pinned by 29.108.

`packages/flow-graph-browser/tests/timeline-phone.spec.ts` (new):

```ts
import { expect, test } from '@playwright/test';

/**
 * The Timeline on a phone, in a real browser (spec PK-7, TV-6, TV-9; Workflow and Timeline graphs, Part 1). A container narrower
 * than 40rem is portrait: time runs DOWN, a lane is a column group, the day labels ride a sticky gutter.
 */
test('29.111 on a 390 px phone the view is portrait: time runs down, bars are 100 px columns, the day gutter stays on the left, and the page does not scroll sideways', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/timeline.html?n=40&span=90&theme=light');
  await expect(page.locator('.gn-timeline__canvas')).toBeVisible();
  expect(await page.locator('.gn-timeline').getAttribute('data-orientation')).toBe('portrait');
  const geometry = await page.evaluate(() => {
    const bars = [...document.querySelectorAll<HTMLElement>('.gn-timeline__bar')].map((b) => ({ day: Number(b.dataset['dayFrom']), top: b.offsetTop, width: b.offsetWidth }));
    const later = bars.filter((b) => b.day > bars[0]!.day).sort((a, b) => a.day - b.day)[0];
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    return { first: bars[0]!, later: later!, widths: [...new Set(bars.map((b) => b.width))], pageWide: document.documentElement.scrollWidth - window.innerWidth, canvasScrolls: c.scrollHeight > c.clientHeight };
  });
  expect(geometry.widths).toEqual([100]);
  expect(geometry.later.top).toBeGreaterThan(geometry.first.top);
  // time runs down at the scale: the two bars' tops are their day gap x 24 px (the Week preset), whatever rows they packed into
  expect(Math.abs(geometry.later.top - geometry.first.top - (geometry.later.day - geometry.first.day) * 24)).toBeLessThanOrEqual(1);
  expect(geometry.canvasScrolls).toBe(true);
  expect(geometry.pageWide).toBeLessThanOrEqual(0);
  const labelLeft = () => page.evaluate(() => {
    const c = (document.querySelector('.gn-timeline__canvas') as HTMLElement).getBoundingClientRect();
    const label = [...document.querySelectorAll<HTMLElement>('.gn-timeline__axis-day')].map((d) => d.getBoundingClientRect()).find((r) => r.bottom > c.top && r.top < c.bottom);
    return label === undefined ? null : label.left - c.left;
  });
  // scroll the lanes down and a day label is still on screen at the canvas's left edge
  await page.evaluate(() => { (document.querySelector('.gn-timeline__canvas') as HTMLElement).scrollTop = 400; });
  await page.waitForTimeout(150);
  const gutter = await labelLeft();
  expect(gutter).not.toBeNull();
  expect(Math.abs(gutter as number)).toBeLessThan(1);
  // the gutter is STICKY: on a chart whose lanes are wider than the phone (40 tickets packed into 10 days), scroll the lanes 200 px
  // SIDEWAYS and the day labels stay at the left edge (a vertical scroll alone cannot tell sticky from absolute)
  await page.goto('/timeline.html?n=40&span=10&theme=light');
  await expect(page.locator('.gn-timeline__canvas')).toBeVisible();
  const room = await page.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    c.scrollLeft = 200;
    return { room: c.scrollWidth - c.clientWidth, left: c.scrollLeft };
  });
  expect(room.room).toBeGreaterThanOrEqual(200);
  expect(room.left).toBe(200);
  await page.waitForTimeout(150);
  const stuck = await labelLeft();
  expect(stuck).not.toBeNull();
  expect(Math.abs(stuck as number)).toBeLessThan(1);
  await ctx.close();
});

test('29.112 Nothing in view appears once the view comes to rest over a gap, its jump glides to a bar and the pill goes; control: a bar in view shows no pill', async ({ page }) => {
  // 3 bars in the first 20 days; today (day 60) is far from them: the view opens centred on today with nothing in view
  await page.goto('/timeline.html?n=3&span=20&theme=light');
  await expect(page.locator('.gn-timeline__canvas')).toBeVisible();
  const pill = page.getByRole('status');
  await expect(pill).toContainText('Nothing in view');
  await expect(page.getByRole('button', { name: 'Jump to the next bar' })).toBeDisabled();
  // The fixture's bars are days 0, 6-13 and 13-15; all three are mounted at open. The NEAREST bar before the view is the one that
  // ends LAST (13-15), so that is where "previous" must land, not merely on some bar.
  const ends = await page.locator('.gn-timeline__bar').evaluateAll((bars) => bars.map((b) => Number((b as HTMLElement).dataset['dayTo'])));
  expect(ends).toHaveLength(3);
  const lastEnd = Math.max(...ends);
  /** The `data-day-to` of the bar whose centre sits within 1.5 days (36 px at 24 px/day) of the canvas's centre, or null. */
  const centredOn = () => page.evaluate(() => {
    const r = (document.querySelector('.gn-timeline__canvas') as HTMLElement).getBoundingClientRect();
    const mid = (r.left + r.right) / 2;
    const hit = [...document.querySelectorAll<HTMLElement>('.gn-timeline__bar')].find((b) => { const q = b.getBoundingClientRect(); return Math.abs((q.left + q.right) / 2 - mid) < 36; });
    return hit === undefined ? null : Number(hit.dataset['dayTo']);
  });
  // a verdict about where the view has come to REST: while a glide is moving over the same gap there is no pill, and it is back after.
  // PageDown aims past the last scrollable day, so this also pins that a glide clamped by the scroller still comes to rest.
  await page.locator('.gn-timeline__canvas').focus();
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(60);
  await expect(pill).toHaveCount(0);
  await expect(pill).toContainText('Nothing in view', { timeout: 3000 });
  await page.getByRole('button', { name: 'Jump to the previous bar' }).click();
  await expect(pill).toHaveCount(0, { timeout: 3000 });
  const barsShown = () => page.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    const r = c.getBoundingClientRect();
    return [...document.querySelectorAll('.gn-timeline__bar')].filter((b) => { const q = b.getBoundingClientRect(); return q.right > r.left && q.left < r.right; }).length;
  });
  // the jump glides (inside 450 ms): wait for it to land, then a bar is on screen and still no pill
  await expect.poll(barsShown, { timeout: 3000 }).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await expect(pill).toHaveCount(0);
  // ...and it came to rest CENTRED on the nearest bar before the view (the last-ending one), not on the farthest. Read it only
  // after the glide's 450 ms cap, so a glide to the farthest bar cannot be sampled while passing over the nearest one.
  await page.waitForTimeout(500);
  await expect.poll(centredOn, { timeout: 3000 }).toBe(lastEnd);
  // no paging control survives: nothing is named Earlier, Later, Previous or Next
  await expect(page.getByRole('button', { name: /^(Earlier|Later|Previous|Next)$/i })).toHaveCount(0);
  // "next" likewise lands on the NEAREST bar after the view: bars at days 0, 90-97 and 180-182, today (day 60) over the gap between
  await page.goto('/timeline.html?n=3&span=270&theme=light');
  await expect(pill).toContainText('Nothing in view');
  const nearestAfter = await page.evaluate(() => {
    const today = Number((document.querySelector('.gn-timeline__today') as HTMLElement).dataset['day']);
    const after = [...document.querySelectorAll<HTMLElement>('.gn-timeline__bar')].filter((b) => Number(b.dataset['dayFrom']) > today);
    return after.length === 0 ? null : Math.min(...after.map((b) => Number(b.dataset['dayTo'])));
  });
  expect(nearestAfter).not.toBeNull();
  await page.getByRole('button', { name: 'Jump to the next bar' }).click();
  await page.waitForTimeout(500);
  await expect.poll(centredOn, { timeout: 3000 }).toBe(nearestAfter);
  await expect(pill).toHaveCount(0);
  // CONTROL: with bars around today there is no pill at all
  await page.goto('/timeline.html?n=40&span=120&theme=light');
  await expect(page.locator('.gn-timeline__bar').first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('29.111 a rotation re-builds the adapter on the other axis: resized from a phone to a desktop width the view is landscape and scrolls sideways, and back it scrolls down', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 780 } });
  const page = await ctx.newPage();
  // 40 tickets packed into 10 days: the portrait lanes are wider than the phone, so the landscape scrollLeft has room to survive a rotation
  await page.goto('/timeline.html?n=40&span=10&theme=light');
  const canvas = page.locator('.gn-timeline__canvas');
  await expect(canvas).toBeVisible();
  const axes = () => page.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    return { orientation: document.querySelector('.gn-timeline')!.getAttribute('data-orientation'), x: c.scrollWidth > c.clientWidth, y: c.scrollHeight > c.clientHeight, left: c.scrollLeft, top: c.scrollTop };
  });
  const wide = await axes();
  expect(wide).toMatchObject({ orientation: 'landscape', x: true });
  // landscape opens centred on today (day 60), far from the surface's first day: the scroller is well to the right
  expect(wide.left).toBeGreaterThan(200);
  await page.setViewportSize({ width: 390, height: 780 });
  await expect.poll(async () => (await axes()).orientation).toBe('portrait');
  const tall = await axes();
  // a NEW scroller (`key={orientation}`): the landscape scrollLeft is gone although the portrait lanes could scroll sideways ...
  expect(tall.x).toBe(true);
  expect(tall.left).toBe(0);
  // ... and the portrait adapter centred it on today DOWN the page before any key was pressed
  expect(tall.top).toBeGreaterThan(0);
  // the key press must move the PORTRAIT scroller's own axis: an adapter left on the old axis would write scrollLeft and nothing would move down
  await canvas.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => canvas.evaluate((c) => (c as HTMLElement).scrollTop), { timeout: 3000 }).toBeGreaterThan(tall.top);
  await page.setViewportSize({ width: 1000, height: 780 });
  await expect.poll(async () => (await axes()).orientation).toBe('landscape');
  const left = await canvas.evaluate((c) => (c as HTMLElement).scrollLeft);
  await canvas.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => canvas.evaluate((c) => (c as HTMLElement).scrollLeft), { timeout: 3000 }).not.toBe(left);
  await ctx.close();
});
```

**Kills:**
- 29.111 portrait on a 390 px phone: (a) `PORTRAIT_BELOW_PX = 640` → `320` (390 px stays landscape) (b) drop the portrait `.gn-timeline__bar` `top` declaration (the landscape row-pitch `top` applies: two bars' tops are no longer their day gap x 24 px) (c) portrait `.gn-timeline__axis` `position: sticky` → `absolute` (the labels leave the left edge after the 200 px sideways scroll). The `pageWide` leg guards T9's contained scroller.
- 29.112 Nothing in view at rest, the jumps: (a) `frame.moving ? false : ...` → the bare expression (the pill stays up through the PageDown glide; `toHaveCount(0)` times out) (b) the previous jump's sort `b.endDay - a.endDay` → `a.endDay - b.endDay` (it lands on day 0, `centredOn` ≠ `lastEnd`) (c) the next jump's sort `a.startDay - b.startDay` → `b.startDay - a.startDay` (it lands on days 180–182, `centredOn` ≠ `nearestAfter`).
- 29.111 a rotation rebuilds the adapter: (a) remove `key={orientation}` from the canvas (the same element keeps its ~1,900 px landscape `scrollLeft`: `tall.left` ≠ 0) (b) the adapter effect's deps `[portrait]` → `[]` (the new portrait canvas has no adapter: `tall.top` is 0) (c) `axis: portrait ? 'y' : 'x'` → `axis: 'x'` (the portrait centring writes `scrollLeft`, `scrollTop` stays 0).

  The phone spec opens its own 390 x 780 touch context for 29.111 and runs a third test that rotates one page (1000 to 390 to 1000 px wide) and presses PageDown in each orientation, so an adapter left on the old axis shows. Its second test is the one that earns its keep: with 3 bars in the first 20 days and today at day 60 the view opens over a gap; PageDown glides to the end of the scroller and the pill must be ABSENT while it moves and PRESENT once it rests; a jump then glides to a bar and the pill goes. Run (expected RED: no `data-orientation`, no pill): `slot-run.sh ac -- pnpm --filter @gisik-nokma/app-core exec vitest run test/timeline test/views/phone-project-views-hooks.test.tsx --maxWorkers=2 > /tmp/ac.log 2>&1; tail -n 30 /tmp/ac.log`.

- [ ] **Step 3: The view**

`packages/app-core/src/timeline/timeline-view.tsx`:

```diff
--- a/packages/app-core/src/timeline/timeline-view.tsx
+++ b/packages/app-core/src/timeline/timeline-view.tsx
@@ -20,7 +20,7 @@
 import type { IsEpicType } from '../hierarchy/epic-ancestor.js';
 import type { FilterSpec } from '../view-types.js';
 import { isoDayOf } from './timeline-days.js';
-import { barsInRange, layoutLanes, type KeyMeasure, type LayoutLane } from './timeline-layout.js';
+import { barsInRange, layoutLanes, type KeyMeasure, type LayoutLane, type Orientation } from './timeline-layout.js';
 import {
   buildTimelineModel,
   type TimelineCustomClaim,
@@ -88,6 +88,12 @@
 /** TG-13: the panel fills the height under the filters, but never less than this. */
 const MIN_PANEL_PX = 320;
 const PANEL_BOTTOM_GAP_PX = 16;
+/** PK-7: a container narrower than 40rem (`ui.css:1059`) lays the chart out in portrait, time running down. */
+const PORTRAIT_BELOW_PX = 640;
+/** In portrait a key is a line of text down a column, so its footprint along the time axis is a line height, not a width. */
+const PORTRAIT_KEY_FOOTPRINT_PX = 16;
+/** The portrait gutter that holds the day labels, in px (`--tl-gutter` in ui.css is the same number). */
+const PORTRAIT_GUTTER_PX = 80;
 const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
 
 /**
@@ -202,6 +208,23 @@
     window.addEventListener('resize', fit);
     return () => window.removeEventListener('resize', fit);
   }, [ref]);
+}
+
+/** PK-7: portrait below 40rem of container width; read on mount and on resize. An unmeasured container (jsdom) is landscape. */
+function useOrientation(ref: RefObject<HTMLElement | null>): Orientation {
+  const [orientation, setOrientation] = useState<Orientation>('landscape');
+  useLayoutEffect(() => {
+    const el = ref.current;
+    if (el === null) return undefined;
+    const read = (): void => {
+      const width = el.clientWidth;
+      setOrientation(width > 0 && width < PORTRAIT_BELOW_PX ? 'portrait' : 'landscape');
+    };
+    read();
+    window.addEventListener('resize', read);
+    return () => window.removeEventListener('resize', read);
+  }, [ref]);
+  return orientation;
 }
 
 /** Month and week labels for the days in [first, last]: `month` marks the 1st, `week` marks each Monday ("W 28 Sep"). */
@@ -300,6 +323,8 @@
   const canvasRef = useRef<HTMLDivElement | null>(null);
   const panelRef = useRef<HTMLDivElement | null>(null);
   useFillHeight(panelRef);
+  const orientation = useOrientation(panelRef);
+  const portrait = orientation === 'portrait';
   const adapterRef = useRef<ScrollAdapter | null>(null);
   const measure = useKeyMeasure();
   const openRef = useRef(props.onOpenTicket);
@@ -332,10 +357,13 @@
   const [moving, setMoving] = useState(false);
   const [band, setBand] = useState<DayRange>(() => mountRange({ start: anchorDay - 27, end: anchorDay + 26 }));
   const [unmeasured, setUnmeasured] = useState(false);
+  const [nothingInView, setNothingInView] = useState(false);
+  const visibleRef = useRef<DayRange>({ start: 0, end: 0 });
   const bandRef = useRef(band);
   bandRef.current = band;
-  const stateRef = useRef({ firstDay, extentDays, anchorDay });
-  stateRef.current = { firstDay, extentDays, anchorDay };
+  const allRows = useMemo(() => model.groups.flatMap((group) => group.rows), [model.groups]);
+  const stateRef = useRef({ firstDay, extentDays, anchorDay, rows: allRows });
+  stateRef.current = { firstDay, extentDays, anchorDay, rows: allRows };
 
   // ---- the layout: packed once per lane, re-packed only when the zoom SETTLES in another bucket ----
   const layout = useMemo(() => {
@@ -343,8 +371,9 @@
       laneId: group.epicId ?? 'no-epic',
       items: group.rows.map((row) => ({ id: row.ticketId, key: row.key, startDay: row.startDay, endDay: row.endDay })),
     }));
-    return layoutLanes(lanes, { ppd, measure });
-  }, [model.groups, ppd, measure]);
+    const portraitMeasure: KeyMeasure = (key) => (key === null || key === '' ? 0 : PORTRAIT_KEY_FOOTPRINT_PX);
+    return layoutLanes(lanes, { ppd, measure: portrait ? portraitMeasure : measure, orientation });
+  }, [model.groups, ppd, measure, orientation, portrait]);
   const rowById = useMemo(() => {
     const byId = new Map<string, TimelineRow>();
     for (const group of model.groups) for (const row of group.rows) byId.set(row.ticketId, row);
@@ -361,7 +390,7 @@
     if (width > 0) setWidthPx(width);
     const adapter = new ScrollAdapter({
       element: canvas,
-      axis: 'x',
+      axis: portrait ? 'y' : 'x',
       firstDay: stateRef.current.firstDay,
       scale: DEFAULT_PPD,
       extentDays: () => stateRef.current.extentDays,
@@ -375,6 +404,11 @@
       canvas.style.setProperty('--tl-fade-weeks', String(crossFade(frame.scale, 16)));
       canvas.dataset['weekend'] = levels.weekendTint ? 'on' : 'off';
       const range = adapter.visibleRange();
+      visibleRef.current = range;
+      // TV-9: the pill is a verdict about where the view has COME TO REST, never about a gap passing under a pan.
+      const rows = stateRef.current.rows;
+      const none = frame.moving ? false : rows.length > 0 && !rows.some((row) => row.endDay >= range.start && row.startDay <= range.end);
+      setNothingInView((current) => (current === none ? current : none));
       const held = bandRef.current;
       const days = range.end - range.start + 1;
       if (range.start < held.start + days / 4 || range.end > held.end - days / 4) setBand(mountRange(range));
@@ -391,7 +425,7 @@
       adapter.destroy();
       adapterRef.current = null;
     };
-  }, []);
+  }, [portrait]);
 
   // The first day of the surface moved (data arrived to the left): keep the same day at the viewport edge.
   useLayoutEffect(() => {
@@ -406,16 +440,36 @@
     if (adapter !== null) adapter.animateTo({ offset: anchorDay + 0.5 - adapter.viewportDays() / 2 });
   };
 
+  const jump = (direction: 1 | -1): void => {
+    const adapter = adapterRef.current;
+    if (adapter === null) return;
+    const seen = visibleRef.current;
+    const target =
+      direction === 1
+        ? allRows.filter((row) => row.startDay > seen.end).sort((a, b) => a.startDay - b.startDay)[0]
+        : allRows.filter((row) => row.endDay < seen.start).sort((a, b) => b.endDay - a.endDay)[0];
+    if (target !== undefined) adapter.animateTo({ offset: (target.startDay + target.endDay) / 2 - adapter.viewportDays() / 2 });
+  };
+  const hasNext = allRows.some((row) => row.startDay > visibleRef.current.end);
+  const hasPrevious = allRows.some((row) => row.endDay < visibleRef.current.start);
+
   // ---- what to mount ----
   const range: DayRange = unmeasured ? { start: firstDay, end: firstDay + extentDays - 1 } : band;
   const labelDays = useMemo(() => axisLabels(Math.max(firstDay, range.start), Math.min(firstDay + extentDays - 1, range.end)), [firstDay, extentDays, range.start, range.end]);
-  const surfaceStyle = {
-    width: `calc(var(--tl-ppd) * ${extentDays} * 1px)`,
-    height: `calc(var(--tl-axis-height) + ${layout.extent}px)`,
-  } as CSSProperties;
+  const surfaceStyle = (
+    portrait
+      ? {
+          width: `${PORTRAIT_GUTTER_PX + layout.extent}px`,
+          height: `calc(var(--tl-axis-height) + var(--tl-ppd) * ${extentDays} * 1px)`,
+        }
+      : {
+          width: `calc(var(--tl-ppd) * ${extentDays} * 1px)`,
+          height: `calc(var(--tl-axis-height) + ${layout.extent}px)`,
+        }
+  ) as CSSProperties;
 
   return (
-    <div ref={panelRef} className="gn-timeline" data-zooming={moving ? 'true' : undefined}>
+    <div ref={panelRef} className="gn-timeline" data-orientation={orientation} data-zooming={moving ? 'true' : undefined}>
       <header className="gn-timeline__toolbar">
         <button type="button" className="gn-timeline__nav" onClick={goToday}>
           Today
@@ -444,7 +498,7 @@
       )}
 
       <div className="gn-timeline__stage">
-      <div ref={canvasRef} className="gn-timeline__canvas" role="group" aria-label="Timeline" tabIndex={0} style={{ ['--tl-ppd' as string]: DEFAULT_PPD }}>
+      <div ref={canvasRef} key={orientation} className="gn-timeline__canvas" role="group" aria-label="Timeline" tabIndex={0} style={{ ['--tl-ppd' as string]: DEFAULT_PPD }}>
         <div className="gn-timeline__surface" style={surfaceStyle}>
           <div className="gn-timeline__axis" aria-hidden="true">
             <div className="gn-timeline__axis-row gn-timeline__axis-row--period">
@@ -510,6 +564,17 @@
           })}
         </div>
       </div>
+      {nothingInView && (
+        <div className="gn-timeline__nothing" role="status">
+          <span>Nothing in view</span>
+          <button type="button" className="gn-timeline__nav" disabled={!hasPrevious} onClick={() => jump(-1)}>
+            Jump to the previous bar
+          </button>
+          <button type="button" className="gn-timeline__nav" disabled={!hasNext} onClick={() => jump(1)}>
+            Jump to the next bar
+          </button>
+        </div>
+      )}
       </div>
 
       {/*
```

- [ ] **Step 4: The stylesheet**

  `frontend-design`: portrait is a different arrangement of the same parts, not a media-query arm of the landscape grid. The pill is a rounded status chip over the bottom of the stage, never inside the scroller (so it does not scroll away with the lanes); a disabled jump is dimmed and not clickable.

`packages/ui/src/ui.css`:

```diff
--- a/packages/ui/src/ui.css
+++ b/packages/ui/src/ui.css
@@ -6131,6 +6131,123 @@
 .gn-timeline__row:hover > .gn-timeline__claims,
 .gn-timeline__row:focus-within > .gn-timeline__claims { display: block; }
 
+/* "Nothing in view" (TV-9): a pill over the bottom of the stage, never inside the scroller, so panning does not carry it away. It
+   is a verdict about where the view has come to rest. */
+.gn-timeline__nothing {
+  position: absolute;
+  left: 50%;
+  bottom: 1rem;
+  transform: translateX(-50%);
+  z-index: 4;
+  display: flex;
+  flex-wrap: wrap;
+  align-items: center;
+  justify-content: center;
+  gap: 0.5rem;
+  max-width: calc(100% - 2rem);
+  padding: 0.5rem 0.75rem;
+  border: 1px solid var(--gn-border);
+  border-radius: 999px;
+  background: var(--gn-surface-raised);
+  color: var(--gn-text);
+  font-size: 0.85rem;
+}
+.gn-timeline__nothing .gn-timeline__nav:disabled { opacity: 0.45; cursor: default; }
+
+/* PORTRAIT (PK-7, TV-6): a container narrower than 40rem lays the same packing out with time running DOWN. A lane is a column
+   group (`--lane-extent` = its rows x 112 px, placed by `--lane-offset`), the day labels ride a sticky 80 px gutter at the left, and
+   the lane headings stick to the top. The surface also pans sideways when the lanes are wider than the screen (2D). */
+.gn-timeline[data-orientation='portrait'] {
+  --tl-gutter: 80px;
+  --tl-axis-height: 2.125rem; /* the lane-heading row; there is no horizontal axis */
+}
+.gn-timeline[data-orientation='portrait'] .gn-timeline__surface,
+.gn-timeline[data-orientation='portrait'] .gn-timeline__axis {
+  background-image: linear-gradient(
+    to bottom,
+    transparent 0,
+    transparent calc(var(--tl-ppd) * 5px),
+    var(--tl-weekend) calc(var(--tl-ppd) * 5px),
+    var(--tl-weekend) calc(var(--tl-ppd) * 7px)
+  );
+  background-size: 100% calc(var(--tl-ppd) * 7px);
+  background-position: 0 var(--tl-axis-height);
+}
+.gn-timeline[data-orientation='portrait'] .gn-timeline__canvas[data-weekend='off'] .gn-timeline__surface,
+.gn-timeline[data-orientation='portrait'] .gn-timeline__canvas[data-weekend='off'] .gn-timeline__axis { background-image: none; }
+.gn-timeline[data-orientation='portrait'] .gn-timeline__axis {
+  position: sticky;
+  left: 0;
+  top: auto;
+  z-index: 3;
+  width: var(--tl-gutter);
+  height: 0;
+  background-color: transparent;
+  border-bottom: none;
+}
+.gn-timeline[data-orientation='portrait'] .gn-timeline__axis-row {
+  position: absolute;
+  top: 0;
+  left: 0;
+  width: var(--tl-gutter);
+  height: auto;
+}
+.gn-timeline[data-orientation='portrait'] .gn-timeline__axis-label,
+.gn-timeline[data-orientation='portrait'] .gn-timeline__axis-day {
+  left: 0;
+  top: calc(var(--tl-axis-height) + var(--d0) * var(--tl-ppd) * 1px);
+  height: calc(var(--tl-ppd) * 1px);
+  line-height: calc(var(--tl-ppd) * 1px);
+  width: var(--tl-gutter);
+  background: var(--gn-surface);
+}
+.gn-timeline[data-orientation='portrait'] .gn-timeline__axis-row--days .gn-timeline__axis-day { width: 1.75rem; text-align: right; padding-right: 0.25rem; }
+.gn-timeline[data-orientation='portrait'] .gn-timeline__axis-row--period .gn-timeline__axis-label { left: 1.75rem; width: calc(var(--tl-gutter) - 1.75rem); overflow: hidden; }
+.gn-timeline[data-orientation='portrait'] .gn-timeline__lane {
+  top: 0;
+  bottom: 0;
+  left: calc(var(--tl-gutter) + var(--lane-offset));
+  width: var(--lane-extent);
+  height: auto;
+}
+.gn-timeline[data-orientation='portrait'] .gn-timeline__group-heading {
+  position: sticky;
+  top: 0;
+  left: auto;
+  display: block;
+  width: 100%;
+  overflow: hidden;
+  text-overflow: ellipsis;
+  white-space: nowrap;
+}
+.gn-timeline[data-orientation='portrait'] .gn-timeline__bar {
+  left: calc(var(--row) * 112px + 6px);
+  width: 100px;
+  top: calc(var(--tl-axis-height) + var(--d0) * var(--tl-ppd) * 1px);
+  height: max(6px, calc(var(--dn) * var(--tl-ppd) * 1px - 2px));
+  display: flex;
+  flex-direction: column;
+  justify-content: flex-start;
+  white-space: normal;
+  transition: left 200ms ease;
+}
+.gn-timeline[data-orientation='portrait'] .gn-timeline__key--outside { display: none; }
+.gn-timeline[data-orientation='portrait'] .gn-timeline__bar .gn-timeline__title-text { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
+.gn-timeline[data-orientation='portrait'] .gn-timeline__row > .gn-timeline__claims {
+  left: calc(var(--row) * 112px + 6px);
+  top: calc(var(--tl-axis-height) + (var(--d0) + var(--dn)) * var(--tl-ppd) * 1px);
+  max-width: 100px;
+}
+.gn-timeline[data-orientation='portrait'] .gn-timeline__today {
+  top: calc(var(--tl-axis-height) + (var(--d0) + 0.5) * var(--tl-ppd) * 1px);
+  bottom: auto;
+  left: 0;
+  right: 0;
+  width: auto;
+  border-left: none;
+  border-top: 2px solid var(--gn-accent);
+}
+
 .gn-timeline__claims { list-style: none; margin: 0; padding: 0; }
 .gn-timeline__claim { font-size: 0.75rem; color: var(--gn-custom-marker); }
 /* In transit, on the claim itself. Without this rule the timeline was the one
```

- [ ] **Step 5: GREEN, the whole suites, the real browser**

  ```bash
  pnpm turbo run build --filter=@gisik-nokma/ui --filter=@gisik-nokma/viewport --filter=@gisik-nokma/app-core
  slot-run.sh ac -- pnpm --filter @gisik-nokma/app-core exec vitest run --maxWorkers=2 > /tmp/ac.log 2>&1; tail -n 20 /tmp/ac.log
  slot-run.sh ui -- pnpm --filter @gisik-nokma/ui exec vitest run --maxWorkers=2 > /tmp/ui.log 2>&1; tail -n 20 /tmp/ui.log
  slot-run.sh web -- pnpm --filter @gisik-nokma/web exec vitest run --maxWorkers=2 > /tmp/web.log 2>&1; tail -n 20 /tmp/web.log
  pnpm turbo run typecheck --filter=@gisik-nokma/app-core... --filter=@gisik-nokma/ui
  slot-run.sh fgb -- pnpm --filter @gisik-nokma/flow-graph-browser exec playwright test tests/timeline-phone.spec.ts tests/timeline.spec.ts > /tmp/fgb.log 2>&1; tail -n 30 /tmp/fgb.log
  ```

  `ui.css` changed, so the three suites run WHOLE. Expected: green; the phone spec 3 tests, the earlier timeline spec still 5.

- [ ] **Step 6: Look at it (frontend-design)**

  Take a 390 x 780 screenshot of `http://localhost:3192/timeline.html?n=40&span=90&theme=light` and one of `?n=3&span=20` (the pill), in light and dark and in the `neo` and `hig` styles (`&style=hig`), with `pnpm exec playwright screenshot --viewport-size=390,780 <url> /tmp/wtg1-t11/<name>.png` (outside the worktree; never a tracked or un-ignored path in the checkout: an untracked file there blocks every gate) against `vite` started from `packages/flow-graph-browser` (exact pid, no `pkill`). Read the PNGs. Measure, do not eyeball: the day gutter's left edge, a bar's width (100), a lane's column width (112), the pill's bottom offset and that it does not overlap the toolbar. Fix `ui.css` and re-run step 5.

- [ ] **Step 7: Docs and Features**

`docs/manual.md`:

```diff
--- a/docs/manual.md
+++ b/docs/manual.md
@@ -1068,7 +1068,9 @@
 through time, press **Today** to glide back to it, and use the **Day**, **Week** and **Month** switch (or
 Ctrl and scroll, or a pinch) to zoom about the spot you point at. The arrow keys move a week at a time.
 A bar again needs both a start and a needed-by, and it ends on the real day of the needed-by. A thin line
-marks today. Tickets that share a day are stacked in rows, and each bar shows its ticket's key.
+marks today. Tickets that share a day are stacked in rows, and each bar shows its ticket's key. On a phone the chart turns so that time runs down the page.
+Scroll to a stretch with nothing on it and a pill reads *"Nothing in view"* with **Jump to the previous
+bar** and **Jump to the next bar**.
 
 Anything with only one date, no dates, or a contradiction goes into a list beside the chart headed
 *"Not on the timeline yet"*, with a count. The sentence under the heading says what to do: *"These
```

  Regenerate the help (`node scripts/help-content.mjs`, then `--check`). In `Features.md` the project-views phone bullet changes (the Timeline "turns portrait" instead of "is still a horizontal scroller until it turns portrait"); apply by bullet title:

`Features.md`:

```diff
--- a/Features.md
+++ b/Features.md
@@ -3607,7 +3607,7 @@
 - ✅ **Move to… on desktop cards** (mobile-web plan Task 5; cases 21.060–21.062) — above 40rem each card's footer gains a ghost **Move to…** after the ‹ › arrows (≥44px), the same button the phone shows as **Move**: it opens the move dialog over every board destination in both directions, so a branching state's far targets are one click away without the arrows' picker. One accessible name ("Move to another state") at every width; the visible word is swapped by CSS. Amends 20.052's footer list. `packages/app-core/src/views/board.tsx`, `packages/ui/src/ui.css`.
 - ✅ **The ticket sheet full screen, and dialogs as bottom sheets** (mobile-web plan Task 6; cases 21.070–21.074) — at ≤40rem the ticket sheet fills the screen (the `.gn-sheet--full` form, forced: `width: 100%`, square, no shadow) and its Full-screen toggle is hidden; its header sticks to the top and carries a phone-only **Move** shortcut (accessible name "Move this ticket") that calls the same `openMove` handler as the State row's **Move…**, so one dialog opens. Dialogs (`.gn-dialog`) become bottom sheets: pinned to the bottom, full width, rounded on top only, at most `90dvh`, clear of the home-indicator inset; they keep the `gnRise` entrance and none under reduced motion. CSS-only except the shortcut. `packages/ui/src/ui.css`, `packages/app-core/src/views/ticket-sheet.tsx`.
 - ✅ **Phone screens: workspaces, workspace home, Members, Inbox** (mobile-web plan Task 7; cases 21.090–21.093) — at ≤40rem `/workspaces` and the workspace home are single-column, the Create workspace button spans the header's width and the Create project button wraps under the Projects heading (the dialogs are the Dialog's own phone sheet); the workspace home's section links become a scrollable row of compact chips (22.148); Members is stacked rows (name + email, role select full width, Remove under it) with the pending-invitation rows wrapping and the invite form full width; Inbox rows keep a ≥44px tap height with the unread dot and badge, and "Load more" spans the list. Desktop and tablet are unchanged. `apps/web/app/globals.css`, `packages/ui/src/ui.css` (the `.gn-inbox__*` arm).
-- ✅ **The project page's other views on a phone** (mobile-web plan Task 8; cases 21.110–21.115) — at ≤40rem the view tabs scroll sideways in their own snapping track instead of wrapping; search and Filters share the first row and Create ticket is the one full-width primary; List and Backlog render stacked rows (title line, then key · state · assignee · due as meta, a 44px select square, a full-width bulk-close bar) instead of a table; the Calendar month grid FITS the card (since neo-refresh F-4, 2026-10-02: it was a deliberate horizontal scroller with 3rem day cells; see "The phone calendar is dots, lines and a day agenda" in §20) and its toolbar wraps; the Timeline is the continuous chart, still a horizontal scroller on a phone until it turns portrait (Workflow and Timeline graphs Part 1 T9 and T11; it was a scroller with a sticky toolbar, case 21.113, retired). CSS-only apart from one hook class (`gn-project__filters`) on the Filters button. `packages/ui/src/ui.css` (the owning screens' phone arms), `apps/web/app/globals.css` (`.gn-project__rail`), `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`.
+- ✅ **The project page's other views on a phone** (mobile-web plan Task 8; cases 21.110–21.115) — at ≤40rem the view tabs scroll sideways in their own snapping track instead of wrapping; search and Filters share the first row and Create ticket is the one full-width primary; List and Backlog render stacked rows (title line, then key · state · assignee · due as meta, a 44px select square, a full-width bulk-close bar) instead of a table; the Calendar month grid FITS the card (since neo-refresh F-4, 2026-10-02: it was a deliberate horizontal scroller with 3rem day cells; see "The phone calendar is dots, lines and a day agenda" in §20) and its toolbar wraps; the Timeline turns portrait (time runs down, a sticky day gutter; Workflow and Timeline graphs Part 1 T11, 29.108–29.112; it was a horizontal scroller with a sticky toolbar, case 21.113, retired). CSS-only apart from one hook class (`gn-project__filters`) on the Filters button. `packages/ui/src/ui.css` (the owning screens' phone arms), `apps/web/app/globals.css` (`.gn-project__rail`), `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`.
 - ✅ **Notes, a note's page and My work on a phone** (mobile-web plan Task 9; cases 21.130–21.134) — at ≤40rem the Notes tree is the existing toggle panel (the "Notes list" toggle a 44px target), the document fills the width, and every editor-toolbar control on the page (the note's and the comment composer's) is 44px and wraps; a note's title stays on one line and **Copy as Markdown / History / Delete…** move behind one "⋯" menu — the workspace card's menu, extracted as `OverflowMenu` (`apps/web/src/overflow-menu.tsx`) and used by `NoteByline` by script (`useIsPhone`), so desktop keeps the inline buttons; My work's rows and title buttons are 44px in a single column and the attention strip's clickable rows are lifted to 44px by one phone rule (`.gn-attention__item`, `min-height: 2.75rem`; case 21.134 — `13.893`'s one-declaration guard now allows exactly one phone-arm rule per family selector, after its base). The split scroll above 60rem is untouched. `apps/web/app/globals.css` (`.gn-notes*`, `.gn-card-menu--inline`), `packages/ui/src/ui.css` (`.gn-my-work*`, `.gn-attention__item`), `apps/web/src/notes/note-byline.tsx`.
 - ✅ **Every editor-toolbar tool is an icon, with its name as a tooltip; on a phone the bar is one docked row with a "More tools" bottom sheet** (owner, 2026-10-01: *"can we not have named buttons but icon instead. check what is the usual icons used for each tool"* and *"A as recommended"*; mobile-web plan Task 9 follow-up; cases 21.135–21.140, 21.233–21.238) — at EVERY width each tool is one 16px inline stroke SVG (`aria-hidden`, `currentColor`, no icon package): bold, italic and strikethrough glyphs; code `<>`, link (chain), bullet list, numbered list, quote, task list (checkbox + lines), code block (`<>` in a square), collapsible (chevron + lines), horizontal rule, **Insert note** (page with a +) and **Insert ticket** (stub); undo, redo and table kept theirs. The `aria-label` stays the name, and the existing role="tooltip" panel (hover, keyboard focus) gains a **touch long-press** (500ms resting finger shows the name, the click that ends the press is swallowed so reading "Bold" does not toggle bold, the name lingers 1.5s). At ≤40rem (script-gated by `PHONE_TOOLBAR_QUERY`, the same `(max-width: 40rem)` as `PHONE_BOARD_QUERY`, in every toolbar host) the bar is ONE docked row, and **More tools** is a bottom sheet — **AMENDED 2026-10-02 by smoothness G-7 (cases 25.400–25.419, see its bullet below)**: it used to keep eight tools and open the other nine as an in-place tray, two rows; the tray and `.ticket-editor__tray` are gone. The phone bar and the 44px targets apply to EVERY host of the editor — the ticket sheet's description and comment editors, the new-ticket dialog, Notes and the note comment composer (AUDIT BRD-08, 2026-10-02; cases 21.233–21.238): `editor.css` has its own ≤40rem arm after its bases (44px tools and heading select, dividers hidden, the toolbar's side padding trimmed to 0.25rem; G-7: the groups no longer wrap, the bar is one scrolling row), so nothing is cut in the sheet and the dialog at 360–466 (cases 21.236/21.237 keep a weaker `≤ 2 rows` model bound; before G-7 the Notes bar measured 106px at 360 and 5 rows/256px before that); the Notes-only `.gn-notes .ticket-editor__*` rules are gone. Above 40rem nothing moves and there is no More. `packages/editor/src/components/EditorToolbar.tsx`, `packages/editor/src/styles/editor.css` (the phone arm).
 - ✅ **Account, Settings, MCP tokens, Help, Privacy and Terms on a phone** (mobile-web plan Task 10; cases 21.150–21.153, 🧪 21.154; `apps/web/app/globals.css` phone arms beside each screen's own rules) — at ≤40rem: `/account`'s column drops its 42.5rem cap and the device and passkey rows stack (label and tag, activity, the action under); Connected assistants and `/mcp/tokens` rows put Rename / Revoke / Disconnect under the label, the Copy URL address takes its own line and wraps, and the rename field fills its row; `/settings`'s sidebar becomes a horizontally scrolling track above the content (the current section keeps its filled pill) and Save is full width; Help, Privacy and Terms read at the full viewport width inside the shell's 24px gutter and `overflow-wrap: anywhere` on their titles and prose. Desktop and tablet are untouched.
```

  Replace the anchor `<!-- wtg-part1-viewport-timeline-view T11 bullet -->` with:

```markdown
- ✅ **The Timeline on a phone, and "Nothing in view"** (Workflow and Timeline graphs Part 1 T11; cases 29.108–29.112; `packages/app-core/src/timeline/timeline-view.tsx`, `packages/ui/src/ui.css`) — below 40rem the chart is portrait: time runs down, a lane is a 112 px column group, bars are 100 px columns, the day labels ride a sticky gutter and the page does not scroll sideways. When the view comes to rest over a gap with bars elsewhere, a pill reads "Nothing in view" with "Jump to the previous bar" and "Jump to the next bar" (a glide; the one with no bar beyond it is disabled); an empty chart has no pill. No control anywhere is named Earlier, Later, Previous or Next.
```

- [ ] **Step 8: Mutation pass (own)**
  - `PORTRAIT_BELOW_PX = 640` to `600` or `700`; `width > 0 &&` removed (an unmeasured panel becomes portrait) → 29.110.
  - `frame.moving ? false : ...` to the bare expression (the pill shows while moving) → 29.112 (`toHaveCount(0)` right after PageDown).
  - `rows.length > 0 &&` removed (a pill over an empty chart) → 29.108's control.
  - the `jump` target sort direction swapped (either arm) → 29.112 (the `centredOn` legs; 29.108 never clicks a jump); `hasNext`/`hasPrevious` swapped → 29.108.
  - `key={orientation}` removed (the adapter keeps the old axis after a rotation) → the third spec test (resize 1000 to 390 to 1000: PageDown must move `scrollTop` in portrait and `scrollLeft` back in landscape). The unit cases cannot see this mutant; if the spec test also survives it, record it and strengthen the spec before landing.
  - portrait CSS: `.gn-timeline__bar` width `100px` to `96px`, the gutter `80px` to `72px` → 29.109 and 29.111; the pill's `position` made `static` → 29.109.
  - Record survivors.

**Prose to sweep:**
- `packages/app-core/src/timeline/timeline-view.tsx` docblock as T9 writes it (plan lines 8021–8023) — "React re-renders on three slow events only: the data changes, the zoom SETTLES ..., or the view nears the edge of the mounted band": T11 adds two more (the Nothing-in-view verdict flipping at rest, and an orientation change). Add them.
- `docs/faq.md:774` (ref), as T9 rewrites it (plan line 9358) — "the Timeline is the same idea stretched sideways as one continuous chart": on a phone it now runs down the page. Add the phone clause the manual gets in Step 7.
- `Features.md` §26 T9 bullet as T9 writes it (plan line 9415) — "bars 28 px high on a 40 px pitch ..., custom date claims as callouts beside the bar": landscape only after T11 (portrait bars are 100 px columns on a 112 px pitch, the claims sit under the bar). Qualify it as the landscape chart and point at the T11 bullet.
- `apps/web/e2e-stack/tap-target-baseline.json:8` and `apps/web/e2e-stack/type-scale-baseline.json:8` (the `stack-phone-390|/p/:projectId#timeline` key): T9 re-measured them for the landscape chart, but on a 390 px phone T11 turns the chart portrait and adds the pill and its jumps. Re-measure them in Step 9 (planner ruling 2026-10-04).

- [ ] **Step 9: Flip, gate**
  - Flip ❌ to ✅ on 29.108–29.112; `pnpm check:citations`, `pnpm check:help`.
  - **Re-measure the e2e-stack phone Timeline baselines for this task's DOM** (planner ruling 2026-10-04): the task that changes the DOM owns its baselines.
    - Re-measure the same files T9 did: `apps/web/e2e-stack/tap-target-baseline.json` and `apps/web/e2e-stack/type-scale-baseline.json` (key `stack-phone-390|/p/:projectId#timeline`), and check `apps/web/e2e-stack/accessible-names-baseline.json`'s `stack-phone-390|/p/:projectId`.
    - Ask the controller for `ctl rebuild` with this branch, then run `apps/web/e2e-stack/viewport.spec.ts` once with `UPDATE_TAP_BASELINE=1 UPDATE_TYPE_SCALE_BASELINE=1` (and `UPDATE_ACCESSIBLE_BASELINE=1` only if that key moved).
    - Commit only the Timeline keys that changed, and name old → new in the HANDOFF. A number that rises is reported, not recorded.
  - `ctl gate <sha> --base release/workflow-graph`; `ctl land <pr> --base release/workflow-graph`.


### Task 12: The paper pin (cases 29.113–29.117)

**Branch:** `task/wtg1-pin` from `origin/release/workflow-graph` (after T11). **NEEDS:** `frontend-design` named in the lane prompt (the glyph and its placement); a database for the server cases (the shared TEST Postgres on 54329 through `createTestDatabase`, which the lane's slot already provides; the DEV database is 54330 and is never used by a test).

**Files:**
- Create: `apps/server/src/read/pin-counts.ts`, `packages/ui/src/icons/paper-pin-icon.tsx`
- Create tests: `apps/server/test/read/pin-counts.test.ts`, `packages/app-core/test/online/list-pin.test.ts`, `apps/web/test/ticket-dates-input-pin.test.ts`
- Modify: `apps/server/src/routes/list.ts`, `packages/domain/src/read-models.ts`, `packages/app-core/src/view-types.ts`, `packages/app-core/src/online/mappers.ts`, `packages/app-core/src/claims/ticket-dates.ts`, `packages/app-core/src/timeline/timeline-model.ts`, `packages/app-core/src/timeline/timeline-view.tsx`, `packages/ui/src/index.ts`, `packages/ui/src/ui.css`, `apps/web/src/ticket-dates-input.ts`
- Modify: `packages/flow-graph-browser/harness/timeline-main.tsx` (a `pins=1` measurement switch, step 8)
- Modify tests: `apps/server/test/integration/real-door-round-trip.test.ts`, `packages/app-core/test/timeline/timeline-model.test.ts`, `packages/app-core/test/timeline/timeline-view.test.tsx`, `packages/ui/test/timeline-continuous.test.ts`
- Modify docs and catalogue: `docs/manual.md`, `packages/app-core/src/help/content.generated.ts` (regenerated), `test-cases/29-workflow-timeline-graphs.md` (T12 anchor), `Features.md` (T12 bullet anchor)

**Interfaces:**
- **Consumes:** T8's `PIN_PX` (14) and the layout item flag `pinned?: boolean` (a pinned bar's footprint is its key plus 14 px); T9's `TimelineRow`, `TicketDatesInput`, the bar component; the notes series' `visibleNotesWhere` and `NOTE_PROJECT_LIVE_WHERE` (`apps/server/src/read/visible-where.ts`, `notes.ts`); the existing `attachments.ticket_id` column and `proj_note_attachments`.
- **Produces:**
  - `pinCountsFor(db: Queryable, eff: EffectiveRole, viewerId: string, ticketIds: readonly string[]): Promise<Map<string, PinCounts>>`, `pinOf(pins, ticketId): PinCounts` (zeros when absent) and `NO_PIN`.
  - `PinCounts = { notes: number; attachments: number }` (`@gisik-nokma/domain`), `ListCard.pin?: PinCounts`; `TicketPin` (same shape, `@gisik-nokma/app-core` view types), `ListRow.pin?: TicketPin`, `TicketDatesInput.pin?: TicketPin`.
  - `timelinePinLabel(pin: TicketPin): string` (`"2 notes, 1 attachment"`), `TimelineRow.pin: TicketPin | null`.
  - `PaperPinIcon({ size = 12 })` from `@gisik-nokma/ui` (a 24 px viewBox paper clip, `aria-hidden`, `currentColor`).
- **Used by:** Part 3 and Part 4 (the Workflow and Timeline graphs draw the same glyph from the same counts, TG-11), Part 5 (nothing: MCP has its own note reads).

**Design notes (the rules the code and the cases share):**
- **What counts (TG-11, TV-10).** For each ticket in the page: the notes THIS viewer may read that are attached to it, and the attachments it owns. A note counts only if `visibleNotesWhere(eff, viewerId, params)` admits it, it is not deleted and its home project is live (the notes list's own two clauses, so the pin can never disagree with the Notes tab). A note the viewer cannot read adds nothing, so the count cannot reveal that it exists. An attachment counts when `attachments.ticket_id` is the ticket: a note-owned attachment has `ticket_id IS NULL` and is not a ticket's. No attachment-removal event exists, so an attachment is live until a purge deletes its row.
- **The server decides nothing about ticket visibility.** `pinCountsFor` is called with the ids of the page's own rows, which the route already filtered, so a hidden ticket cannot be probed through it. One batched read per page (two queries), never one per row.
- **Three states on the wire and in the row, kept apart.** `pin` absent = "this producer does not know" (an older server, the offline replica, which holds no attachments); `{notes: 0, attachments: 0}` = known, none; counts = known. The mapper takes a missing pin as unknown, takes both counts or neither (a half object or a string is a `MappingError` naming `…pin.notes`), and the shell adapter spreads the key only when the row has it. A producer that does not know must never be read as zero.
- **Drawing.** A bar shows one pin when either count is above zero. It is decoration (`aria-hidden`, not a button, not focusable): the words ride the bar's `title` on the pin and its description (`aria-describedby`), the accessible name stays the ticket title. It sits inside the bar's trailing edge, 6 px in; a bar too short for key AND pin puts both outside its end (the pin follows the key in the flow). PK-4's footprint adds `PIN_PX` for a pinned bar, so a neighbour never lands on the pin.
- **The list route is the only producer.** `assembleListCards` is shared by other list-shaped reads and is left alone (that is why `ListCard.pin` is optional in the type): `routes/list.ts` adds the pin to the page it returns.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part1-viewport-timeline-view T12 -->`, insert (all ❌):

- ❌ **29.113 — the paper pin counts what the viewer may read, plus the ticket-owned attachments | per viewer: the owner reads all four notes on TP; a member on P two; an unlisted guest none; the attachments are the ticket's two whoever asks | an inherited note reaches a guest through its ticket; a note-owned attachment is never a ticket's; an empty id list reads nothing | the list page carries the pin on every row, and the row of a ticket with nothing is {notes: 0, attachments: 0}, never absent.** (`apps/server/test/read/pin-counts.test.ts`)
- ❌ **29.114 — a pin on the wire reaches the row; no pin leaves the field off the row (unknown), and zeros stay zeros (known: none) | a pin missing one count, or carrying a non-number, is refused naming its path | the shell adapter carries the paper pin from the list row to the Timeline input | counts reach the input unchanged; a row with none (unknown) leaves the key off rather than inventing zeros.** (`packages/app-core/test/online/list-pin.test.ts`, `apps/web/test/ticket-dates-input-pin.test.ts`)
- ❌ **29.115 — a row carries the paper pin only when there is something to count | notes or attachments make a pin; zeros and an unknown producer make none; the words are singular at one and leave a zero out.** (`packages/app-core/test/timeline/timeline-model.test.ts`)
- ❌ **29.116 — the paper pin sits inside the bar's end, or after the key outside a bar too short for both | a pinned wide bar draws one pin inside the bar; its words are the tooltip and part of the description; it is not a button and not announced | a one-day bar cannot hold key and pin: both stand outside its end; the same bar without a pin keeps the key outside only, and a pin on a bar that fits stays inside.** (`packages/app-core/test/timeline/timeline-view.test.tsx`)
- ❌ **29.117 — the paper pin is decoration inside the bar's trailing edge, or after the key outside a bar too short for both | a pinned bar reserves room for the 12 px icon; the pin sits 6 px in, vertically centred; outside the bar it follows the key in the flow; it takes the ink around it.** (`packages/ui/test/timeline-continuous.test.ts`)

- [ ] **Step 2: The tests first (RED)**

  Server (the notes series' 5-notes x 7-people fixture; four notes attached to the project ticket TP, one to TE already, two ticket attachments, one note attachment as the control):

`apps/server/test/read/pin-counts.test.ts` (new):

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { NO_PIN, pinCountsFor, pinOf } from '../../src/read/pin-counts.js';
import { readList } from '../../src/routes/list.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';

/**
 * Workflow and Timeline graphs, Part 1, T12 — case 29.113 (TG-11, TV-10). The paper pin counts the notes a viewer may READ and
 * the attachments a ticket owns, and the list page carries the counts so the Timeline view needs no second request.
 *
 * The world is the notes series' 5-notes x 7-people fixture (`helpers/notes-fixture.ts`). TP is a project-mode ticket on
 * project P; TE is explicit-to-guestListed. Four live notes are attached to TP (workspace, project, private, explicit scope) plus one that was then deleted, and
 * `nInherit` is already attached to TE by the fixture. Two attachments belong to TP, one to TE, one to a NOTE (not a ticket).
 */
let db: TestDatabase;
let world: NotesFixture;

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedNotesFixture(db.pool);
  const author = world.ids.author;
  const attach = (noteId: string, ticketId: string) =>
    makeCommitted({ workspaceId: world.WS, actorId: author, entity: { kind: 'note', id: noteId }, type: 'note.attached', payload: { ticketId } });
  // A workspace-scope note attached to TP and then deleted: the owner could read it, so only the deleted rule keeps it out of the count.
  const gone = newUlid();
  const goneEvent = (type: string, payload: unknown) =>
    makeCommitted({ workspaceId: world.WS, actorId: author, entity: { kind: 'note', id: gone }, type, payload });
  await applyCommitted(db.pool, [
    attach(world.NOTES.nWorkspace, world.TP),
    attach(world.NOTES.nProject, world.TP),
    attach(world.NOTES.nPrivate, world.TP),
    attach(world.NOTES.nExplicit, world.TP),
    goneEvent('note.created', { title: 'Gone', homeProjectId: world.P, scope: { mode: 'workspace' } }),
    goneEvent('note.attached', { ticketId: world.TP }),
    goneEvent('note.deleted', {}),
  ]);
  const file = (ticketId: string | null, noteId: string | null) =>
    db.pool.query(
      `INSERT INTO attachments (id, workspace_id, ticket_id, note_id, uploader_id, filename, mime, size, object_key)
       VALUES ($1, $2, $3, $4, $5, 'a.pdf', 'application/pdf', 3, $6)`,
      [newUlid(), world.WS, ticketId, noteId, world.ids.owner, `k/${newUlid()}`],
    );
  await file(world.TP, null);
  await file(world.TP, null);
  await file(world.TE, null);
  await file(null, world.NOTES.nWorkspace); // a NOTE's attachment: never a ticket's
}, 120_000);

afterAll(async () => {
  await db.drop();
});

async function pinsFor(who: NotesUser) {
  const eff = await resolveEffectiveRole(db.pool, world.ids[who], world.WS);
  return pinCountsFor(db.pool, eff, world.ids[who], [world.TP, world.TE]);
}

describe('29.113 the paper pin counts what the viewer may read, plus the ticket-owned attachments', () => {
  it('29.113 per viewer: the owner reads all four notes on TP; a member on P two; an unlisted guest none; the attachments are the ticket\'s two whoever asks', async () => {
    const owner = await pinsFor('owner');
    expect(owner.get(world.TP)).toEqual({ notes: 4, attachments: 2 });
    const memberIn = await pinsFor('memberIn');
    // workspace + project scope; not the private one (author only), not the explicit one (guestListed only).
    expect(memberIn.get(world.TP)).toEqual({ notes: 2, attachments: 2 });
    const guest = await pinsFor('guestUnlisted');
    // A guest reads neither the workspace nor the project note; the ticket's attachments still count.
    expect(guest.get(world.TP)).toEqual({ notes: 0, attachments: 2 });
    // CONTROL, same it: TP really holds FIVE note links (the deleted note's included), so the owner's 4 is the deleted rule at
    // work and not a link the fixture failed to write.
    const links = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM proj_note_attachments WHERE ticket_id = $1', [world.TP]);
    expect(links.rows[0]?.n).toBe(5);
    // Only the asked-for tickets are keys: the note-owned file (ticket_id NULL) adds no key of its own.
    expect([...owner.keys()].sort()).toEqual([world.TP, world.TE].sort());
  });

  it('29.113 an inherited note reaches a guest through its ticket; a note-owned attachment is never a ticket\'s; an empty id list reads nothing', async () => {
    const listed = await pinsFor('guestListed');
    // nInherit is attached to TE, which guestListed may read (explicit audience); the attachment on TE counts.
    expect(listed.get(world.TE)).toEqual({ notes: 1, attachments: 1 });
    // The workspace note's own attachment (ticket_id NULL) did not become an attachment of TP: TP has exactly the two files.
    expect((await pinsFor('owner')).get(world.TP)?.attachments).toBe(2);
    const eff = await resolveEffectiveRole(db.pool, world.ids.owner, world.WS);
    // "Reads nothing" is a statement about the database: no query is sent for an empty page (an `ANY('{}')` query would also
    // answer an empty map, so the map's size alone cannot tell).
    const queries = vi.spyOn(db.pool, 'query');
    expect((await pinCountsFor(db.pool, eff, world.ids.owner, [])).size).toBe(0);
    expect(queries).not.toHaveBeenCalled();
    queries.mockRestore();
    // The literal, not `NO_PIN`: comparing with the module's own constant would pass whatever that constant held.
    expect(pinOf(new Map(), 'no-such-ticket')).toEqual({ notes: 0, attachments: 0 });
    expect(NO_PIN).toEqual({ notes: 0, attachments: 0 });
  });

  it('29.113 the list page carries the pin on every row, and the row of a ticket with nothing is {notes: 0, attachments: 0}, never absent', async () => {
    const eff = await resolveEffectiveRole(db.pool, world.ids.owner, world.WS);
    const page = await readList(db.pool, eff, world.ids.owner, world.WS, world.P, { spec: {}, limit: 50, groupBy: 'flat' });
    const cards = page.groups.flatMap((g) => g.cards);
    expect(cards.length).toBe(2);
    const byId = new Map(cards.map((c) => [c.ticketId, c as typeof c & { pin?: { notes: number; attachments: number } }]));
    expect(byId.get(world.TP)?.pin).toEqual({ notes: 4, attachments: 2 });
    expect(byId.get(world.TE)?.pin).toEqual({ notes: 1, attachments: 1 });
    // A third ticket with no note and no file: the route answers zeros.
    const bareId = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'ticket', id: bareId }, type: 'ticket.created', payload: { typeId: 'task', projectId: world.P, parentId: null, title: 'Bare' } }),
    ]);
    const again = await readList(db.pool, eff, world.ids.owner, world.WS, world.P, { spec: {}, limit: 50, groupBy: 'flat' });
    const bare = again.groups.flatMap((g) => g.cards).find((c) => c.title === 'Bare') as { pin?: unknown } | undefined;
    expect(bare).toBeDefined();
    expect(bare?.pin).toEqual({ notes: 0, attachments: 0 });
    // Then a note alone (no file): the notes-only path of the merge, which neither TP nor TE exercises (both hold files).
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: world.WS, actorId: world.ids.author, entity: { kind: 'note', id: world.NOTES.nProject }, type: 'note.attached', payload: { ticketId: bareId } }),
    ]);
    const third = await readList(db.pool, eff, world.ids.owner, world.WS, world.P, { spec: {}, limit: 50, groupBy: 'flat' });
    const noteOnly = third.groups.flatMap((g) => g.cards).find((c) => c.ticketId === bareId) as { pin?: unknown } | undefined;
    expect(noteOnly?.pin).toEqual({ notes: 1, attachments: 0 });
  });
});
```

**Kills:**
- 29.113 per viewer: (a) drop `AND ${visibleNotesWhere(eff, viewerId, params)}` from the notes query (memberIn and the guest read 4); (b) drop `AND n.deleted = FALSE` (the owner reads 5); (c) widen the files query to `WHERE ticket_id = ANY($1::text[]) OR ticket_id IS NULL` (the note-owned file lands under a `null` key: the keys leg).
- 29.113 inherited / note-owned / empty: (a) delete `if (ticketIds.length === 0) return pins;` (two queries are sent: the spy leg); (b) the second merge loop writes `{ notes: 0, attachments: row.n }` (TE reads `{0, 1}` for guestListed); (c) the files query also counts the files of notes linked to the ticket (`… OR note_id IN (SELECT note_id FROM proj_note_attachments WHERE ticket_id = ANY($1::text[]))`, grouped by the link's ticket: TP reads 3 attachments).
- 29.113 the list page: (a) `routes/list.ts` spreads `pin` only when a count is above zero (Bare has no pin); (b) `pinOf` returns `pins.get(ticketId)` without `?? NO_PIN`; (c) the merge is driven by the files rows only (`for (const row of files.rows) pins.set(row.ticket_id, { notes: notes.rows.find((r) => r.ticket_id === row.ticket_id)?.n ?? 0, attachments: row.n })`, the first loop deleted: the note-only Bare reads zeros).

  **The file carries one row the notes fixture lacks: a deleted note.** `beforeAll` creates a workspace-scope note, attaches it to TP and deletes it (`note.created`, `note.attached`, `note.deleted`, the last shaped like the fixture's own deleted note, `apps/server/test/helpers/notes-fixture.ts:301-302`). The owner could read it, so only the `n.deleted = FALSE` clause keeps it out of the count, and the owner's `4` is the control (a mutant that drops the clause reads 5). Those three events were written from the fixture's lines and the file's own `attach` helper and were not run against a database when this plan was drafted: run the file before trusting it, and if the reducer refuses the ordering, split the attach and the delete into two `applyCommitted` calls. A note in a trashed project (`NOTE_PROJECT_LIVE_WHERE`) has no fixture here; its mutant is recorded as a survivor rather than building a trash world in this task.

  The list page's own card shape is pinned by the real-door round trip (a world with no note and no attachment, so the answer is zeros, spelled out):

`apps/server/test/integration/real-door-round-trip.test.ts`:

```diff
--- a/apps/server/test/integration/real-door-round-trip.test.ts
+++ b/apps/server/test/integration/real-door-round-trip.test.ts
@@ -418,6 +418,9 @@
     stateName,
     assignedProvenance: over.assignedProvenance,
     hasRestrictedParent: over.hasRestrictedParent,
+    // The paper pin (Workflow and Timeline graphs Part 1 T12, 29.113): this world has no note and no attachment, so the server's answer is
+    // zeros, spelled out — a card WITHOUT the field would mean the route stopped sending it.
+    pin: { notes: 0, attachments: 0 },
   };
 }
 
```

**Kills:** (the real-door list `it`, 29.113's wire half) (a) `routes/list.ts` spreads `pin` only when a count is above zero; (b) `routes/list.ts` returns `assembled` instead of `listCards` to `groupCards` (no `pin` on the wire); (c) `pinOf` without `?? NO_PIN` (the key is dropped by `JSON.stringify`, so the card has no `pin`).

  The wire reader, then the shell adapter:

`packages/app-core/test/online/list-pin.test.ts` (new):

```ts
import { describe, expect, it } from 'vitest';
import { MappingError } from '../../src/wire-readers.js';
import { mapListPage } from '../../src/online/mappers.js';

/**
 * Workflow and Timeline graphs, Part 1, T12 — case 29.114. The list row's optional paper-pin counts cross the wire whole or not
 * at all: a server that predates the field leaves `pin` off the row (the replica leaves it off too), a server that sends it
 * sends both counts, and a half-built or mistyped one is a refusal that names the path. Never a silent zero.
 */
const claim = { actorId: 'user_anselma', clientTime: '2026-08-19T09:59:00.000Z', serverTime: '2026-08-19T10:01:00.000Z' };
const card = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  ticketId: '01J9GTKT000000000000000000',
  title: 'Renew the trade licence',
  key: 'RTSF-1',
  typeId: 'task',
  typeRank: 3,
  parentId: null,
  epicId: null,
  stateId: 'doing',
  stateName: 'Doing',
  stateCategory: 'active',
  stateProvenance: claim,
  assigneeId: null,
  assignedProvenance: null,
  dueDate: { state: 'never-claimed' },
  priority: { value: 'P2', ...claim },
  fields: {},
  rollup: null,
  hasRestrictedParent: false,
  closed: null,
  rank: null,
  ...extra,
});
const page = (c: Record<string, unknown>): unknown => ({
  workspaceId: '01J9GWS0000000000000000000',
  projectId: '01J9GPRJ000000000000000000',
  groupBy: 'flat',
  groups: [{ key: 'all', label: 'All tickets', cards: [c] }],
  nextCursor: null,
});

describe('29.114 the list row carries the paper pin whole, or not at all', () => {
  it('29.114 a pin on the wire reaches the row; no pin leaves the field off the row (unknown), and zeros stay zeros (known: none)', () => {
    const withPin = mapListPage(page(card({ pin: { notes: 2, attachments: 1 } }))).rows[0];
    expect(withPin?.pin).toEqual({ notes: 2, attachments: 1 });
    const none = mapListPage(page(card({ pin: { notes: 0, attachments: 0 } }))).rows[0];
    expect(none?.pin).toEqual({ notes: 0, attachments: 0 });
    const absent = mapListPage(page(card())).rows[0];
    expect(absent).toBeDefined();
    // Unknown is NOT zero: the key is not on the row at all, so a reader cannot mistake "never asked" for "has nothing".
    expect(absent !== undefined && 'pin' in absent).toBe(false);
  });

  it('29.114 a pin missing one count, or carrying a non-number, is refused naming its path', () => {
    expect(() => mapListPage(page(card({ pin: { notes: 2 } })))).toThrow(MappingError);
    expect(() => mapListPage(page(card({ pin: { notes: 2 } })))).toThrow(/cards\[0\]\.pin\.attachments/);
    expect(() => mapListPage(page(card({ pin: { notes: '2', attachments: 1 } })))).toThrow(/cards\[0\]\.pin\.notes/);
    expect(() => mapListPage(page(card({ pin: 'two notes' })))).toThrow(MappingError);
    // CONTROL: the same card with a whole pin maps, so the refusals above are about the pin and nothing else on the card.
    expect(() => mapListPage(page(card({ pin: { notes: 2, attachments: 1 } })))).not.toThrow();
  });
});
```

**Kills:**
- 29.114 a pin on the wire reaches the row: (a) `mapPin` returns `{ pin: { notes: 0, attachments: 0 } }` when `raw === undefined` (the unknown arm); (b) the `...mapPin(record['pin'], …)` spread is removed from `mapListRow`; (c) `mapPin` swaps the two reads (`notes: asNumber(record['attachments'], …)`).
- 29.114 refused naming its path: (a) `attachments: asNumber(record['attachments'] ?? 0, …)` (a half pin maps); (b) `notes: Number(record['notes'])` in place of `asNumber` (the string `'2'` maps); (c) `mapPin` passes `path` instead of `` `${path}.notes` `` to the notes read (the path regex fails).

`apps/web/test/ticket-dates-input-pin.test.ts` (new):

```ts
import { describe, expect, it } from 'vitest';
import type { ListRow } from '@gisik-nokma/app-core';
import { toTicketDatesInput } from '../src/ticket-dates-input.js';

/** Workflow and Timeline graphs, Part 1, T12 — case 29.114 (the shell half): the project page's adapter hands the pin to the Timeline. */
const row = (extra: Partial<ListRow> = {}): ListRow =>
  ({
    ticketId: 't1',
    title: 'Renew the licence',
    key: 'RTSF-1',
    typeId: 'task',
    parentId: null,
    stateId: 'doing',
    stateCategory: 'active',
    assignee: null,
    fields: {},
    ...extra,
  }) as ListRow;

describe('29.114 the shell adapter carries the paper pin from the list row to the Timeline input', () => {
  it('29.114 counts reach the input unchanged; a row with none (unknown) leaves the key off rather than inventing zeros', () => {
    const scope = { workspaceId: 'w', projectId: 'p' };
    expect(toTicketDatesInput(row({ pin: { notes: 2, attachments: 1 } }), scope, []).pin).toEqual({ notes: 2, attachments: 1 });
    const unknown = toTicketDatesInput(row(), scope, []);
    expect('pin' in unknown).toBe(false);
    // CONTROL: the rest of the input is still built (key and state), so the absence above is about the pin alone.
    expect(unknown.key).toBe('RTSF-1');
    expect(unknown.state.id).toBe('t1');
  });
});
```

**Kills:** 29.114 the shell adapter: (a) the return spreads `pin: row.pin` unconditionally (the key is present, as `undefined`); (b) the pin spread is dropped from the return (the counts never reach the input); (c) the adapter defaults the absent pin to zeros (`pin: row.pin ?? { notes: 0, attachments: 0 }`).

  The model, the view and the stylesheet:

`packages/app-core/test/timeline/timeline-model.test.ts`:

```diff
--- a/packages/app-core/test/timeline/timeline-model.test.ts
+++ b/packages/app-core/test/timeline/timeline-model.test.ts
@@ -12,6 +12,7 @@
   NO_DATES_NOTE,
   NO_DAY_CLAIMS_NOTE,
   buildTimelineModel,
+  timelinePinLabel,
   type TimelineModel,
   type TimelineRow,
 } from '../../src/timeline/timeline-model.js';
@@ -402,6 +403,25 @@
   });
 });
 
+describe('29.115 a row carries the paper pin only when there is something to count', () => {
+  const pinned = (pin: { notes: number; attachments: number } | undefined): TicketDatesInput => ({
+    ...dated('2026-08-24', '2026-08-28', 'Pinned'),
+    ...(pin === undefined ? {} : { pin }),
+  });
+
+  it('29.115 notes or attachments make a pin; zeros and an unknown producer make none; the words are singular at one and leave a zero out', () => {
+    expect(model([pinned({ notes: 2, attachments: 1 })]).groups[0]!.rows[0]!.pin).toEqual({ notes: 2, attachments: 1 });
+    expect(model([pinned({ notes: 0, attachments: 3 })]).groups[0]!.rows[0]!.pin).toEqual({ notes: 0, attachments: 3 });
+    // CONTROLS, same it: known-none and unknown both draw no pin, and neither is an error.
+    expect(model([pinned({ notes: 0, attachments: 0 })]).groups[0]!.rows[0]!.pin).toBeNull();
+    expect(model([pinned(undefined)]).groups[0]!.rows[0]!.pin).toBeNull();
+    expect(timelinePinLabel({ notes: 2, attachments: 1 })).toBe('2 notes, 1 attachment');
+    expect(timelinePinLabel({ notes: 1, attachments: 2 })).toBe('1 note, 2 attachments');
+    expect(timelinePinLabel({ notes: 0, attachments: 1 })).toBe('1 attachment');
+    expect(timelinePinLabel({ notes: 3, attachments: 0 })).toBe('3 notes');
+  });
+});
+
 describe('11.57 grouping by epic ancestor is arrangement, never data', () => {
   it('groups rows under their epic ancestor; epicless work lands in "No epic", last', () => {
     const epic = ticket({ id: 'epic1', typeId: 'epic', fields: { title: claimField('Registrations') } });
```

**Kills:** 29.115: (a) the model's `pin: input.pin ?? null` (zeros kept: the known-none leg); (b) the model tests `input.pin.notes > 0` only (the `{0, 3}` row loses its pin); (c) `timelinePinLabel` pluralises at one (`pin.notes === 1 ? 'notes' : …`), keeps a zero count, or joins with `' and '` (each breaks one of the four label legs).

`packages/app-core/test/timeline/timeline-view.test.tsx`:

```diff
--- a/packages/app-core/test/timeline/timeline-view.test.tsx
+++ b/packages/app-core/test/timeline/timeline-view.test.tsx
@@ -21,6 +21,20 @@
 import { NO_DATES_NOTE, NO_DAY_CLAIMS_NOTE } from '../../src/timeline/timeline-model.js';
 import { dayNumberOf, isoDayOf } from '../../src/timeline/timeline-days.js';
 import { TimelineView } from '../../src/timeline/timeline-view.js';
+
+/** Counts how often a pinned bar renders: `timelinePinLabel` is called in the bar's render body, once per render (29.102 memo case). */
+const barRenders = vi.hoisted(() => ({ n: 0 }));
+vi.mock('../../src/timeline/timeline-model.js', async (importOriginal) => {
+  const actual = await importOriginal<typeof import('../../src/timeline/timeline-model.js')>();
+  return {
+    ...actual,
+    timelinePinLabel: (...args: Parameters<typeof actual.timelinePinLabel>) => {
+      barRenders.n += 1;
+      return actual.timelinePinLabel(...args);
+    },
+  };
+});
+
 
 /**
  * 11.73–11.82 — `TimelineView`, the week columns over Task 10's landed model.
@@ -653,6 +667,59 @@
   });
 });
 
+describe('29.116 the paper pin sits inside the bar\'s end, or after the key outside a bar too short for both', () => {
+  const pinnedTicket = (title: string, key: string, start: string, due: string, pin?: { notes: number; attachments: number }): TicketDatesInput => ({
+    ...ticket({ fields: { title: claimField(title), startDate: claimField({ date: start }), dueDate: claimField({ date: due }) } }),
+    key,
+    ...(pin === undefined ? {} : { pin }),
+  });
+
+  it('29.116 a pinned wide bar draws one pin inside the bar; its words are the tooltip and part of the description; it is not a button and not announced', () => {
+    renderTimeline([pinnedTicket('Wide', 'GN-12', '2026-08-24', '2026-08-28', { notes: 2, attachments: 1 }), pinnedTicket('Plain', 'GN-14', '2026-08-24', '2026-08-28', { notes: 0, attachments: 0 })]);
+    const wide = screen.getByRole('button', { name: 'Wide' });
+    const pin = wide.querySelector('.gn-timeline__pin') as HTMLElement;
+    expect(pin).not.toBeNull();
+    expect(pin).toHaveAttribute('title', '2 notes, 1 attachment');
+    expect(pin.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
+    expect(pin.closest('button')).toBe(wide);
+    expect(wide).toHaveAttribute('data-pinned', 'true');
+    const described = document.getElementById(wide.getAttribute('aria-describedby') as string);
+    expect(described).toHaveTextContent('2 notes, 1 attachment');
+    // the accessible name stays the title alone, and only the one bar has a pin
+    expect(wide.getAttribute('aria-label')).toBe('Wide');
+    expect(document.querySelectorAll('.gn-timeline__pin')).toHaveLength(1);
+    // CONTROL, same it: a bar with counts of zero has no pin and no data-pinned
+    const plain = screen.getByRole('button', { name: 'Plain' });
+    expect(plain.querySelector('.gn-timeline__pin')).toBeNull();
+    expect(plain).not.toHaveAttribute('data-pinned');
+  });
+
+  it('29.116 a one-day bar cannot hold key and pin: both stand outside its end; the same bar without a pin keeps the key outside only, and a pin on a bar that fits stays inside', () => {
+    renderTimeline([
+      pinnedTicket('Short', 'GN-13', '2026-09-08', '2026-09-08', { notes: 1, attachments: 0 }),
+      pinnedTicket('Short bare', 'GN-15', '2026-09-15', '2026-09-15'),
+      pinnedTicket('Roomy', 'GN-16', '2026-09-01', '2026-09-05', { notes: 1, attachments: 0 }),
+      // A two-day bar is 48 px at 24 px/day: the 45 px key fits, key and 14 px pin (59) do not. PK-4 adds the pin to the footprint.
+      pinnedTicket('Tight pinned', 'GN-17', '2026-09-22', '2026-09-23', { notes: 1, attachments: 0 }),
+      pinnedTicket('Tight bare', 'GN-18', '2026-09-24', '2026-09-25'),
+    ]);
+    const tightPinned = screen.getByRole('button', { name: 'Tight pinned' });
+    expect(tightPinned.querySelector('.gn-timeline__key')).toBeNull();
+    expect((tightPinned.closest('.gn-timeline__row') as HTMLElement).querySelector('.gn-timeline__key--outside .gn-timeline__pin')).not.toBeNull();
+    // CONTROL: the same width without a pin keeps its key inside, so the pin is what pushed it out.
+    expect(screen.getByRole('button', { name: 'Tight bare' }).querySelector('.gn-timeline__key')).toHaveTextContent('GN-18');
+    const short = screen.getByRole('button', { name: 'Short' });
+    expect(short.querySelector('.gn-timeline__pin')).toBeNull();
+    const outside = (short.closest('.gn-timeline__row') as HTMLElement).querySelector('.gn-timeline__key--outside') as HTMLElement;
+    expect(outside).toHaveTextContent('GN-13');
+    expect(outside.querySelector('.gn-timeline__pin')).toHaveAttribute('title', '1 note');
+    const bare = screen.getByRole('button', { name: 'Short bare' });
+    const bareOutside = (bare.closest('.gn-timeline__row') as HTMLElement).querySelector('.gn-timeline__key--outside') as HTMLElement;
+    expect(bareOutside.querySelector('.gn-timeline__pin')).toBeNull();
+    expect(screen.getByRole('button', { name: 'Roomy' }).querySelector('.gn-timeline__pin')).not.toBeNull();
+  });
+});
+
 describe('29.101 the today line is one line, on the prop\'s day', () => {
   it('29.101 one line, aria-hidden, at today\'s day number; a different prop moves it; an invalid day draws none', () => {
     const { container, rerender } = renderTimeline([]);
@@ -715,6 +782,25 @@
     const memoised = (text: string) => /import \{[^}]*\bmemo\b[^}]*\} from 'react'/.test(text) && /const TimelineBar = memo\(function TimelineBar\(/.test(text);
     expect(memoised(source)).toBe(true);
     expect(memoised("const TimelineBar = function TimelineBar(props) { return null; };")).toBe(false);
+  });
+
+  it('29.102 re-rendering the view with the same tickets, today and handlers draws no bar again (the pan loop re-renders the view on every moving / resting flip); control: a changed ticket list does draw them again', () => {
+    const pinned = (title: string, start: string): TicketDatesInput => ({
+      ...ticket({ fields: { title: claimField(title), startDate: claimField({ date: start }), dueDate: claimField({ date: start }) } }),
+      pin: { notes: 1, attachments: 0 },
+    });
+    const tickets = [pinned('A', '2026-08-24'), pinned('B', '2026-08-25'), pinned('C', '2026-08-26')];
+    const onOpenTicket = vi.fn();
+    const element = (list: TicketDatesInput[]) => <TimelineView tickets={list} today={TODAY} userName={userName} onOpenTicket={onOpenTicket} />;
+    const view = render(element(tickets));
+    expect(document.querySelectorAll('.gn-timeline__bar')).toHaveLength(3);
+    const afterMount = barRenders.n;
+    expect(afterMount).toBeGreaterThanOrEqual(3);
+    view.rerender(element(tickets));
+    expect(barRenders.n).toBe(afterMount);
+    // CONTROL, same it: new data does render them, so the counter can see a render
+    view.rerender(element([...tickets, pinned('D', '2026-08-27')]));
+    expect(barRenders.n).toBeGreaterThan(afterMount);
   });
 });
 
```

**Kills:**
- 29.116 a pinned wide bar: (a) `pinWords` dropped from `detail` (the description leg); (b) the model keeps zero counts (`pin: input.pin ?? null`: Plain draws a second pin, the count leg); (c) `data-pinned` never set, or the pin words appended to the bar's `aria-label` (the name leg).
- 29.116 a one-day bar: (a) drop `+ (row.pin === null ? 0 : PIN_PX)` from `outside` (Tight pinned keeps its key inside); (b) render `{pin}` inside the button unconditionally (drop `!outside &&`: Short carries a pin inside); (c) drop `{pin}` from the outside span (Short's outside key has no pin).
- 29.102 the render count: none of this task's code; guards existing behaviour (T9's `memo` on `TimelineBar`, with T12's `timelinePinLabel` call as the counter). Its mutant: `const TimelineBar = function TimelineBar(` without `memo(` (the second render leg goes red).

  The view test adds a second `it` to **29.102**. It is a T9 case that T9 left 🟡 with only its source scan; this `it` completes it, and Step 11 flips it to ✅ (planner ruling 2026-10-04). The render counter hangs on `timelinePinLabel`, which a bar calls once per render, so it needs the pin to exist; the source scan T9 added beside it is the other half, and the two together are what stops a removal of the bar's `memo`.

`packages/ui/test/timeline-continuous.test.ts`:

```diff
--- a/packages/ui/test/timeline-continuous.test.ts
+++ b/packages/ui/test/timeline-continuous.test.ts
@@ -4,7 +4,7 @@
 import { cssOf } from './helpers/style-patterns.js';
 import { CONTRAST_PAIRS, TOKEN_ROLES, colorOf, cssVariableName, themeStylesheet } from '../src/tokens.js';
 
-/** Workflow and Timeline graphs, Part 1 — T9: 29.104 (the weekend role) and 29.106 (the stylesheet contract); T11: 29.109 (portrait and the pill). */
+/** Workflow and Timeline graphs, Part 1 — T9: 29.104 (the weekend role) and 29.106 (the stylesheet contract); T11: 29.109 (portrait and the pill); T12: 29.117 (the paper pin). */
 const STYLES = ['hig', 'minimal', 'neo'] as const;
 const THEMES = ['light', 'dark'] as const;
 
@@ -113,3 +113,24 @@
     expect(ruleExactly(ui, '.gn-timeline__stage')).not.toContain('overflow');
   });
 });
+
+describe('29.117 the paper pin is decoration inside the bar\'s trailing edge, or after the key outside a bar too short for both', () => {
+  const ui = cssOf('ui');
+
+  it('29.117 a pinned bar reserves room for the 12 px icon; the pin sits 6 px in, vertically centred; outside the bar it follows the key in the flow; it takes the ink around it', () => {
+    expect(valueOf(ruleExactly(ui, '.gn-timeline__bar[data-pinned]'), 'padding-right')).toBe('22px');
+    const pin = ruleExactly(ui, '.gn-timeline__pin');
+    expect(valueOf(pin, 'position')).toBe('absolute');
+    expect(valueOf(pin, 'right')).toBe('6px');
+    expect(valueOf(pin, 'top')).toBe('50%');
+    expect(valueOf(pin, 'transform')).toBe('translateY(-50%)');
+    expect(valueOf(pin, 'color')).toBe('inherit');
+    const outside = ruleExactly(ui, '.gn-timeline__key--outside .gn-timeline__pin');
+    expect(valueOf(outside, 'position')).toBe('static');
+    expect(valueOf(outside, 'margin-left')).toBe('4px');
+    expect(valueOf(outside, 'transform')).toBe('none');
+    // CONTROL, same it: the base bar keeps its 6 px padding, and the pin names no colour of its own (the colour scan covers the rest).
+    expect(valueOf(ruleExactly(ui, '.gn-timeline__bar'), 'padding')).toBe('2px 6px');
+    expect(pin).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
+  });
+});
```

**Kills:** 29.117: (a) `.gn-timeline__bar[data-pinned] { padding-right: 16px; }`; (b) `.gn-timeline__pin { right: 4px; }` or `top: 0` / `transform` dropped; (c) the outside rule's `position: static` dropped or `margin-left: 2px` (or `.gn-timeline__pin { color: var(--gn-accent-text); }`).

  Run (expected RED everywhere: no module, no field, no class). The server file needs the TEST database; the others need only their package:

  ```bash
  slot-run.sh srv -- pnpm --filter @gisik-nokma/server exec vitest run test/read/pin-counts.test.ts --maxWorkers=2 > /tmp/srv.log 2>&1; tail -n 20 /tmp/srv.log
  slot-run.sh ac -- pnpm --filter @gisik-nokma/app-core exec vitest run test/online/list-pin.test.ts test/timeline --maxWorkers=2 > /tmp/ac.log 2>&1; tail -n 30 /tmp/ac.log
  slot-run.sh ui -- pnpm --filter @gisik-nokma/ui exec vitest run test/timeline-continuous.test.ts --maxWorkers=2 > /tmp/ui.log 2>&1; tail -n 20 /tmp/ui.log
  ```

- [ ] **Step 3: The server read and the wire type**

`apps/server/src/read/pin-counts.ts` (new):

`apps/server/src/read/pin-counts.ts` (new):

```ts
import type { PinCounts } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { SqlParams } from './sql-params.js';
import { NOTE_PROJECT_LIVE_WHERE } from './notes.js';
import { visibleNotesWhere } from './visible-where.js';

/**
 * The paper pin (Workflow and Timeline graphs, TG-11 and TV-10): per ticket, how many notes THIS viewer may read are
 * attached to it, and how many attachments the ticket owns.
 *
 * - A note counts only if `visibleNotesWhere` admits it for the viewer, it is not deleted, and its home project is live
 *   (`NOTE_PROJECT_LIVE_WHERE`, the notes list's own two clauses). A note the viewer cannot read adds nothing, so the count
 *   cannot reveal that it exists.
 * - An attachment counts when `attachments.ticket_id` is the ticket. A note-owned attachment has `ticket_id IS NULL`
 *   (`1790110000000_attachments-note-owner.sql`) and is not a ticket's. No attachment-removal event exists, so a row is live
 *   until a purge deletes it.
 *
 * The caller passes ONLY ids the viewer can already see (the list page's own rows), so this makes no ticket-visibility
 * decision of its own. A ticket with neither is absent from the map, and `pinOf` spells the absence as zeros.
 */
export const NO_PIN: PinCounts = { notes: 0, attachments: 0 };

export async function pinCountsFor(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  ticketIds: readonly string[],
): Promise<Map<string, PinCounts>> {
  const pins = new Map<string, PinCounts>();
  if (ticketIds.length === 0) return pins;
  const params = new SqlParams();
  const ids = params.add([...ticketIds]);
  const notes = await db.query<{ ticket_id: string; n: number }>(
    `SELECT na.ticket_id, count(DISTINCT n.note_id)::int AS n
       FROM proj_note_attachments na
       JOIN proj_notes n ON n.note_id = na.note_id
      WHERE na.ticket_id = ANY(${ids}::text[])
        AND n.deleted = FALSE
        AND ${NOTE_PROJECT_LIVE_WHERE}
        AND ${visibleNotesWhere(eff, viewerId, params)}
      GROUP BY na.ticket_id`,
    params.toArray(),
  );
  const files = await db.query<{ ticket_id: string; n: number }>(
    'SELECT ticket_id, count(*)::int AS n FROM attachments WHERE ticket_id = ANY($1::text[]) GROUP BY ticket_id',
    [[...ticketIds]],
  );
  for (const row of notes.rows) pins.set(row.ticket_id, { notes: row.n, attachments: 0 });
  for (const row of files.rows) pins.set(row.ticket_id, { notes: pins.get(row.ticket_id)?.notes ?? 0, attachments: row.n });
  return pins;
}

export function pinOf(pins: ReadonlyMap<string, PinCounts>, ticketId: string): PinCounts {
  return pins.get(ticketId) ?? NO_PIN;
}
```

`apps/server/src/routes/list.ts`:

```diff
--- a/apps/server/src/routes/list.ts
+++ b/apps/server/src/routes/list.ts
@@ -15,6 +15,7 @@
 import { epicAncestors, type EpicOf } from '../read/ancestry.js';
 import { READ_NOT_FOUND_BODY, requireMember, workspaceOfProject } from '../read/membership.js';
 import { assembleListCards } from '../read/list-cards.js';
+import { pinCountsFor, pinOf } from '../read/pin-counts.js';
 import { SqlParams } from '../read/sql-params.js';
 import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from '../read/ticket-cards.js';
 import { LIVE_TICKET_WHERE, visibleTicketsWhere } from '../read/visible-where.js';
@@ -173,7 +174,7 @@
     workspaceId,
     cards.map((card) => card.ticketId),
   );
-  const listCards = await assembleListCards(
+  const assembled = await assembleListCards(
     db,
     viewerId,
     workspaceId,
@@ -181,6 +182,10 @@
     cards,
     new Map([...epics].map(([ticketId, found]) => [ticketId, found.epicId])),
   );
+  // The paper pin (TG-11, TV-10): the notes THIS viewer may read and the attachments each row carries. One batched read for
+  // the page; the ids are the rows the viewer already sees, so nothing here widens what a hidden ticket reveals.
+  const pins = await pinCountsFor(db, eff, viewerId, assembled.map((card) => card.ticketId));
+  const listCards = assembled.map((card) => ({ ...card, pin: pinOf(pins, card.ticketId) }));
   const groups = await groupCards(db, workspaceId, listCards, pageRows, query.groupBy, epics);
 
   return {
```

`packages/domain/src/read-models.ts`:

```diff
--- a/packages/domain/src/read-models.ts
+++ b/packages/domain/src/read-models.ts
@@ -393,7 +393,16 @@
   stateName: string;
   assignedProvenance: AssignmentProvenance | null;
   hasRestrictedParent: boolean;
-};
+  /**
+   * The paper pin (Workflow and Timeline graphs, TG-11 and TV-10): the notes THIS viewer may read that are attached to the card's
+   * ticket, and the attachments it owns. The list route sends it on every card (`routes/list.ts`, `read/pin-counts.ts`); it is
+   * optional in the TYPE only because `assembleListCards` — which the other list-shaped reads share — does not compute it.
+   */
+  pin?: PinCounts;
+};
+
+/** How many notes and attachments a ticket has, counted for one viewer. */
+export type PinCounts = { notes: number; attachments: number };
 
 export type ListGroup = { key: string; label: string; cards: ListCard[] };
 
```

  `PinCounts` is exported through the domain's existing `export * from './read-models.js'`; check with `grep -n "read-models" packages/domain/src/index.ts` and add nothing if it is there.

- [ ] **Step 4: The client types, the reader and the shell adapter**

`packages/app-core/src/view-types.ts`:

```diff
--- a/packages/app-core/src/view-types.ts
+++ b/packages/app-core/src/view-types.ts
@@ -545,7 +545,17 @@
    * after them by `ticketId`, so the distinction is the whole sort.
    */
   rank: string | null;
-};
+  /**
+   * The paper pin's counts (Workflow and Timeline graphs, TG-11 and TV-10): the notes THIS viewer may read that are attached to
+   * the ticket, and the attachments it owns. OPTIONAL, unlike the fields above, and on purpose: `undefined` means "this producer
+   * does not know" (the offline replica holds no attachments, so it leaves the field off rather than claim zero), and
+   * `{ notes: 0, attachments: 0 }` means "known: none". The server always sends it (case 29.113).
+   */
+  pin?: TicketPin;
+};
+
+/** How many notes and attachments a ticket has, as the viewer is allowed to count them (TG-11). */
+export type TicketPin = { notes: number; attachments: number };
 
 export type TicketListView = { projectId: string; rows: ListRow[] };
 
```

`packages/app-core/src/online/mappers.ts`:

```diff
--- a/packages/app-core/src/online/mappers.ts
+++ b/packages/app-core/src/online/mappers.ts
@@ -47,6 +47,7 @@
   SearchHit,
   TicketHistoryEvent,
   TicketListView,
+  TicketPin,
   TicketRead,
   TicketVisibility,
   TransitionCause,
@@ -1711,6 +1712,13 @@
   };
 }
 
+/** The list row's optional paper-pin counts as a spread: `{}` when the wire has none, `{ pin }` when it has both counts. */
+function mapPin(raw: unknown, path: string): { pin?: TicketPin } {
+  if (raw === undefined) return {};
+  const record = asRecord(raw, path);
+  return { pin: { notes: asNumber(record['notes'], `${path}.notes`), attachments: asNumber(record['attachments'], `${path}.attachments`) } };
+}
+
 /**
  * The wire's `rank` → `string | null` (spec §8.1, second wave 2026-09-18).
  * `null` survives as the truth — "nobody has ranked this ticket", which is a
@@ -1818,6 +1826,8 @@
     // server assembler reads `proj_tickets.rank` (`read/ticket-cards.ts`), the
     // card's `rank` rides the JSON, and this is the client half — case 13.703.
     rank: mapRank(record['rank'], `${path}.rank`),
+    // The paper pin (TG-11): absent from a server that predates it, whole when present. A half-built object is refused.
+    ...mapPin(record['pin'], `${path}.pin`),
   };
 }
 
```

`packages/app-core/src/claims/ticket-dates.ts`:

```diff
--- a/packages/app-core/src/claims/ticket-dates.ts
+++ b/packages/app-core/src/claims/ticket-dates.ts
@@ -1,4 +1,5 @@
 import { IST_DAY_REGEX, type TicketState } from '@gisik-nokma/domain';
+import type { TicketPin } from '../view-types.js';
 
 /** A date claim as a view renders it: the FieldClaim flattened, plus the in-transit flag. */
 export type DateClaimView = {
@@ -44,6 +45,8 @@
    * names a marker by it (UX fixes T8, 23.140): a marker that said only "needed by 28 Sep" never said WHICH ticket.
    */
   key?: string | null;
+  /** The paper pin's counts (TG-11, TV-10): the Timeline draws a pin on the bar when either count is above zero. Absent = unknown. */
+  pin?: TicketPin;
 };
 
 /**
```

`apps/web/src/ticket-dates-input.ts`:

```diff
--- a/apps/web/src/ticket-dates-input.ts
+++ b/apps/web/src/ticket-dates-input.ts
@@ -94,7 +94,8 @@
     transitions: [],
   };
   // The row's key (`CCSO-4`, or null with no prefix): the calendar names a marker by it (UX fixes T8, 23.140).
-  return { state, pendingFieldIds: [], customDateFields, key: row.key };
+  // The paper pin's counts ride along when the producer knew them (`undefined` = unknown, e.g. the offline replica); never defaulted to zero.
+  return { state, pendingFieldIds: [], customDateFields, key: row.key, ...(row.pin === undefined ? {} : { pin: row.pin }) };
 }
 
 /**
```

- [ ] **Step 5: The model and the view**

`packages/app-core/src/timeline/timeline-model.ts`:

```diff
--- a/packages/app-core/src/timeline/timeline-model.ts
+++ b/packages/app-core/src/timeline/timeline-model.ts
@@ -23,7 +23,7 @@
 } from '../claims/ticket-dates.js';
 import { matchesFilter } from '../filter/matches-filter.js';
 import { epicAncestorOf, isBuiltinEpicType, type IsEpicType } from '../hierarchy/epic-ancestor.js';
-import type { FilterSpec } from '../view-types.js';
+import type { FilterSpec, TicketPin } from '../view-types.js';
 import { dayNumberOf } from './timeline-days.js';
 
 /** A claimed custom date field with its attributed rendering. Never geometry. */
@@ -62,7 +62,17 @@
   pending: boolean;
   provenance: string;
   customClaims: TimelineCustomClaim[];
+  /** TG-11: the counts behind the paper pin, or `null` when the ticket has no note and no attachment (or the producer does not know). */
+  pin: TicketPin | null;
 };
+
+/** TG-11: the words behind the paper pin, "2 notes, 1 attachment" (singular at one, a count of zero left out). */
+export function timelinePinLabel(pin: TicketPin): string {
+  const parts: string[] = [];
+  if (pin.notes > 0) parts.push(`${pin.notes} ${pin.notes === 1 ? 'note' : 'notes'}`);
+  if (pin.attachments > 0) parts.push(`${pin.attachments} ${pin.attachments === 1 ? 'attachment' : 'attachments'}`);
+  return parts.join(', ');
+}
 
 export type TimelineSideEntry = {
   ticketId: string;
@@ -301,6 +311,7 @@
           pending: start.pending || due.pending,
           provenance: barProvenance(start, due, opts.userName),
           customClaims,
+          pin: input.pin !== undefined && input.pin.notes + input.pin.attachments > 0 ? input.pin : null,
         },
       };
     }
```

`packages/app-core/src/timeline/timeline-view.tsx`:

```diff
--- a/packages/app-core/src/timeline/timeline-view.tsx
+++ b/packages/app-core/src/timeline/timeline-view.tsx
@@ -13,19 +13,20 @@
   type Frame,
   type ZoomPreset,
 } from '@gisik-nokma/viewport';
-import { SegmentedControl } from '@gisik-nokma/ui';
+import { PaperPinIcon, SegmentedControl } from '@gisik-nokma/ui';
 import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
 import type { UserNameFn } from '../claims/claim-labels.js';
 import type { TicketDatesInput } from '../claims/ticket-dates.js';
 import type { IsEpicType } from '../hierarchy/epic-ancestor.js';
 import type { FilterSpec } from '../view-types.js';
 import { isoDayOf } from './timeline-days.js';
-import { barsInRange, layoutLanes, type KeyMeasure, type LayoutLane, type Orientation } from './timeline-layout.js';
+import { PIN_PX, barsInRange, layoutLanes, type KeyMeasure, type LayoutLane, type Orientation } from './timeline-layout.js';
 import {
   buildTimelineModel,
   type TimelineCustomClaim,
   type TimelineRow,
   type TimelineSideReason,
+  timelinePinLabel,
 } from './timeline-model.js';
 
 /**
@@ -271,11 +272,19 @@
 const TimelineBar = memo(function TimelineBar(props: TimelineBarProps) {
   const { row, layoutRow, firstDay, ppd, category, measure, detailId, onOpen } = props;
   const mark = stateMark(category);
-  const detail = [row.key, mark?.word, row.provenance, ...row.customClaims.map((entry) => entry.label)]
+  const pinWords = row.pin === null ? null : timelinePinLabel(row.pin);
+  const detail = [row.key, mark?.word, row.provenance, pinWords, ...row.customClaims.map((entry) => entry.label)]
     .filter((part): part is string => part !== null && part !== undefined && part !== '')
     .join('; ');
   const barPx = (row.endDay - row.startDay + 1) * ppd;
-  const outside = row.key !== null && barPx < measure(row.key);
+  // PK-4 and TG-11: the pin is part of the label's footprint. A bar too short for the key AND the pin shows both just outside its end.
+  const outside = row.key !== null && barPx < measure(row.key) + (row.pin === null ? 0 : PIN_PX);
+  const pin =
+    pinWords === null ? null : (
+      <span className="gn-timeline__pin" title={pinWords}>
+        <PaperPinIcon />
+      </span>
+    );
   const vars = {
     ['--d0' as string]: row.startDay - firstDay,
     ['--dn' as string]: row.endDay - row.startDay + 1,
@@ -289,6 +298,7 @@
         data-day-from={row.startDay}
         data-day-to={row.endDay}
         data-pending={row.pending ? 'true' : undefined}
+        data-pinned={row.pin === null ? undefined : 'true'}
         data-state={mark === null ? undefined : mark.word === 'Done' ? 'done' : 'active'}
         aria-label={row.title}
         aria-describedby={detailId}
@@ -302,10 +312,12 @@
         )}
         {!outside && row.key !== null && <span className="gn-timeline__key">{row.key}</span>}
         <span className="gn-timeline__title-text">{row.title}</span>
+        {!outside && pin}
       </button>
       {outside && (
         <span className="gn-timeline__key gn-timeline__key--outside" aria-hidden="true">
           {row.key}
+          {pin}
         </span>
       )}
       {/* TV-2: custom date claims stay beside the ticket. A bar row has no room for a list, so it is a callout that opens on
@@ -369,7 +381,7 @@
   const layout = useMemo(() => {
     const lanes: LayoutLane[] = model.groups.map((group) => ({
       laneId: group.epicId ?? 'no-epic',
-      items: group.rows.map((row) => ({ id: row.ticketId, key: row.key, startDay: row.startDay, endDay: row.endDay })),
+      items: group.rows.map((row) => ({ id: row.ticketId, key: row.key, startDay: row.startDay, endDay: row.endDay, pinned: row.pin !== null })),
     }));
     const portraitMeasure: KeyMeasure = (key) => (key === null || key === '' ? 0 : PORTRAIT_KEY_FOOTPRINT_PX);
     return layoutLanes(lanes, { ppd, measure: portrait ? portraitMeasure : measure, orientation });
```

- [ ] **Step 6: The glyph and the stylesheet (frontend-design)**

  The glyph is a paper clip on the same terms as `pencil-icon.tsx` and `plus-icon.tsx` (24 px viewBox, `fill="none"`, `stroke="currentColor"`, `aria-hidden`), 12 px in the Timeline, so it takes the ink of the bar around it in every style and theme and never needs its own colour token.

`packages/ui/src/icons/paper-pin-icon.tsx` (new):

`packages/ui/src/icons/paper-pin-icon.tsx` (new):

```tsx
/**
 * The paper pin (Workflow and Timeline graphs, TG-11): the small mark on a timeline bar that says "this ticket has a note or an
 * attachment". The owner's word is "paper pin"; the glyph is a paper clip. Same precedent as `pencil-icon.tsx` and
 * `plus-icon.tsx` — 24x24 viewBox, `fill="none"`, `stroke="currentColor"`, `aria-hidden="true"` — so it takes the ink of the
 * bar around it and never speaks: the bar's own description carries the counts ("2 notes, 1 attachment"). It is not a button.
 * 12 px is the timeline's size; the Timeline graph (Part 4) and Home's Timeline draw the same glyph from here.
 */
export function PaperPinIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
```

`packages/ui/src/index.ts`:

```diff
--- a/packages/ui/src/index.ts
+++ b/packages/ui/src/index.ts
@@ -80,3 +80,5 @@
 export { PlusIcon } from './icons/plus-icon.js';
 // The workspace home's Rename cue (UX fixes Task 10, 23.177): one glyph, same terms as `PlusIcon`.
 export { PencilIcon } from './icons/pencil-icon.js';
+// The Timeline's paper pin (Workflow and Timeline graphs, TG-11): one glyph, drawn by the Timeline view and by the Part 4 graphs.
+export { PaperPinIcon } from './icons/paper-pin-icon.js';
```

`packages/ui/src/ui.css`:

```diff
--- a/packages/ui/src/ui.css
+++ b/packages/ui/src/ui.css
@@ -6094,6 +6094,23 @@
   transition: top 200ms ease, opacity 150ms ease;
 }
 .gn-timeline[data-zooming='true'] .gn-timeline__key--outside { opacity: 0; }
+/* The paper pin (TG-11): 12 px, inside the bar's trailing edge 6 px in; on a bar too short for key and pin it follows the key
+   outside the end. Decoration only (aria-hidden); the counts are in the bar's title and description. */
+.gn-timeline__bar[data-pinned] { padding-right: 22px; }
+.gn-timeline__pin {
+  position: absolute;
+  right: 6px;
+  top: 50%;
+  display: inline-flex;
+  transform: translateY(-50%);
+  color: inherit;
+}
+.gn-timeline__key--outside .gn-timeline__pin {
+  position: static;
+  margin-left: 4px;
+  transform: none;
+  vertical-align: middle;
+}
 /* In transit: outlined, never a different hue — a claim on its way to the server is the same claim. The same treatment
    `.gn-calendar__item--pending` uses. */
 .gn-timeline__bar[data-pending] { outline: 2px dashed var(--gn-pending); outline-offset: -1px; }
```

- [ ] **Step 7: GREEN, then the whole suites**

  ```bash
  pnpm turbo run build --filter=@gisik-nokma/domain --filter=@gisik-nokma/ui --filter=@gisik-nokma/viewport --filter=@gisik-nokma/app-core
  slot-run.sh srv -- pnpm --filter @gisik-nokma/server exec vitest run test/read/pin-counts.test.ts test/integration/real-door-round-trip.test.ts --maxWorkers=2 > /tmp/srv.log 2>&1; tail -n 20 /tmp/srv.log
  slot-run.sh ac -- pnpm --filter @gisik-nokma/app-core exec vitest run --maxWorkers=2 > /tmp/ac.log 2>&1; tail -n 20 /tmp/ac.log
  slot-run.sh ui -- pnpm --filter @gisik-nokma/ui exec vitest run --maxWorkers=2 > /tmp/ui.log 2>&1; tail -n 20 /tmp/ui.log
  slot-run.sh web -- pnpm --filter @gisik-nokma/web exec vitest run --maxWorkers=2 > /tmp/web.log 2>&1; tail -n 20 /tmp/web.log
  pnpm turbo run typecheck --filter=@gisik-nokma/server... --filter=@gisik-nokma/web... --filter=@gisik-nokma/ui
  ```

  Expected: green. Three whole-suite rules fire at once, and each needs its own run:
  1. `ui.css` changed: ui, app-core and web WHOLE (above).
  2. A server read changed and `packages/app-core/src/online/` changed: run the **server WHOLE** (`slot-run.sh srv -- pnpm --filter @gisik-nokma/server exec vitest run --maxWorkers=2 > /tmp/srv-all.log 2>&1; tail -n 30 /tmp/srv-all.log`), because other files assert the list card's exact shape (the real-door file is one of them; a second would be a defect this task has to fix with the same `pin` line, not a reason to make the field optional on the wire).
  3. A domain type changed: `pnpm --filter @gisik-nokma/editor run build:webview && node apps/mobile/scripts/generate-editor-html.mjs --check`. Expected: no change (the type is not in the editor bundle). If `--check` fails, the bundle is stale from an earlier task: regenerate it and commit the result.

  A failing sibling in the whole runs is read before it is dismissed: rerun it alone, and compare with the same file on the release tip.

- [ ] **Step 8: Look at it (frontend-design)**

  The Timeline harness page carries no pins (its synthetic tickets have no counts), so give it a measurement switch. In `packages/flow-graph-browser/harness/timeline-main.tsx`, inside the `Array.from` callback, replace the returned object's tail so it carries a pin when `?pins=1`:

  ```diff
  -    customDateFields: [{ id: 'filed-on', name: 'Filed on' }],
  -  } as unknown as TicketDatesInput;
  +    customDateFields: [{ id: 'filed-on', name: 'Filed on' }],
  +    ...(params.get('pins') === '1' && i % 3 === 0 ? { pin: i % 9 === 0 ? { notes: 1, attachments: 0 } : { notes: 2, attachments: 1 } } : {}),
  +  } as unknown as TicketDatesInput;
  ```

  It is a measurement aid: no spec asserts on it and no case id names it. Take 1x and 2x screenshots of `timeline.html?n=40&span=90&pins=1` at Week and Day zoom, light and dark, in `neo` and `hig` (`&style=hig`), and read them; save them under `packages/flow-graph-browser/test-results/` (ignored by the root `.gitignore:24` `test-results/` rule) or the lane's scratch directory, never elsewhere in the worktree, so no untracked file reaches a gate checkout. Measure rather than eyeball: the pin's right inset inside a bar (6 px), its size (12 px), that the title text does not run under it (the bar's `padding-right` is 22 px), and that outside a one-day bar it follows the key with a 4 px gap. At 390 px (T11) the pin keeps the same inside-the-end rule along the column. Fix `ui.css` and re-run step 7.

- [ ] **Step 9: Docs and Features**

  One sentence in the manual's Timeline section (the in-app help is generated from it):

`docs/manual.md`:

```diff
--- a/docs/manual.md
+++ b/docs/manual.md
@@ -1071,6 +1071,7 @@
 marks today. Tickets that share a day are stacked in rows, and each bar shows its ticket's key. On a phone the chart turns so that time runs down the page.
 Scroll to a stretch with nothing on it and a pill reads *"Nothing in view"* with **Jump to the previous
 bar** and **Jump to the next bar**.
+A small paper pin on a bar means the ticket has a note or an attachment you can read.
 
 Anything with only one date, no dates, or a contradiction goes into a list beside the chart headed
 *"Not on the timeline yet"*, with a count. The sentence under the heading says what to do: *"These
```

  Regenerate the help (`node scripts/help-content.mjs`, then `--check`: expected `ok`) and commit the regenerated file. In `Features.md` replace the anchor `<!-- wtg-part1-viewport-timeline-view T12 bullet -->` with:

```markdown
- ✅ **The paper pin: a ticket's notes and attachments, counted** (Workflow and Timeline graphs Part 1 T12; cases 29.113–29.117; `apps/server/src/read/pin-counts.ts`, `apps/server/src/routes/list.ts`, `packages/domain/src/read-models.ts`, `packages/app-core/src/{view-types,online/mappers}.ts`, `packages/ui/src/icons/paper-pin-icon.tsx`) — the list read carries `pin: {notes, attachments}` per row (notes the viewer may read that are attached to the ticket; attachments it owns; a hidden or trashed note is not counted; `undefined` means "this producer does not know", as in the offline replica, and zeros mean none). The Timeline draws one paper pin inside a bar's end (after the key, outside, on a bar too short for both), 14 px of footprint, a tooltip and part of the description, never a button. TG-11's rule for the later graphs is the same function.
```

  Confirm the sentence against the code once: `grep -n "pinOf(pins" apps/server/src/routes/list.ts` finds the spread that puts the pin on every card, and `grep -n "pinWords" packages/app-core/src/timeline/timeline-view.tsx` finds the tooltip and the description part.

- [ ] **Step 10: Mutation pass (own)**
  - `pin-counts.ts`: drop the `visibleNotesWhere` clause (a note the viewer cannot read counts) → 29.113 (the unlisted guest and the member). Drop `n.deleted = FALSE` → 29.113 only with the deleted note added in step 2. Drop `NOTE_PROJECT_LIVE_WHERE` → expected SURVIVOR (no trashed-project fixture); record it. `count(DISTINCT n.note_id)` to `count(*)` → record whether anything kills it (a note attached to one ticket twice is not reachable through the events, so it may be equivalent). Counting `ticket_id IS NULL` attachments → 29.113's note-owned control.
  - `pinOf`: return `undefined` for an absent ticket instead of `NO_PIN` → 29.113's "never absent".
  - `routes/list.ts`: send the pin only when non-zero → the real-door file.
  - `mapPin`: read `notes` only (no `attachments`) → 29.114; return `{ pin: zeros }` when absent → 29.114's unknown arm; the adapter's spread made unconditional → the web case.
  - `timelinePinLabel`: pluralise at 1, leave zero in, join with `' and '` → 29.115.
  - Model: `pin: input.pin` (zeros kept) → 29.115. View: `PIN_PX` not added to the footprint test → 29.116 (`Tight pinned`);  `aria-hidden` removed from the svg → 29.116. `.gn-timeline__bar[data-pinned]` padding or `right: 6px` changed → 29.117. Remove the bar's `memo` → 29.102's render count AND its source scan; remove only the scan's regex match target → the render count still kills it.
  - Record survivors.

**Prose to sweep:**
- `packages/domain/src/read-models.ts:330` — "A `TicketCard` plus the five facts the LIST route — and only the list route — also serves": the list route now serves a sixth, `pin` (and the "Field by field" list at `:356` names five).
- `apps/server/test/integration/real-door-round-trip.test.ts:389` — "The LIST route's card: `expectedCard` plus the five facts ruling P25 clause 1 added to it": `expectedListCard` now adds `pin` too (this task's own edit to that function).
- `packages/app-core/src/claims/ticket-dates.ts:28-30` — the `TicketDatesInput` docblock lists what the views take as head state, the pending field ids and the custom date fields; `pin` (like `key` before it) is not among them.
- `packages/ui/src/ui.css`, the comment T9 lands above `.gn-timeline__key--outside` (plan line 9005, not on the ref yet) — "A bar shorter than its key shows the key just outside its end": a PINNED bar shorter than its key plus 14 px now shows key and pin outside.

- [ ] **Step 11: Flip, gate**
  - Flip ❌ to ✅ on 29.113–29.117, and flip **29.102 from 🟡 to ✅**: its render counter is this task's second 29.102 `it` (planner ruling 2026-10-04). Then run `pnpm check:citations`, `pnpm check:help`, `pnpm check:env`, `pnpm check:tasks`.
  - `ctl gate <sha> --base release/workflow-graph`; `ctl land <pr> --base release/workflow-graph`.


### Task 13: Re-measure after the lift, and close the Part 1 catalogue (cases 29.118, 29.119)

**Branch:** `task/wtg1-close` from `origin/release/workflow-graph` (after T12; it is the last Part 1 task). **NEEDS: the owner's real phone, and a headed desktop Chrome on the owner's machine** (the same two devices as T1 steps 14 and 15; a headless number is a floor and never the bar). T1 step 15 already made the phone a standing blocker for T13 only: **this task opens its PR only when both records exist**, because the catalogue test below fails on a 29.118 that is still pending. The lane may write and run the test beforehand (it is red exactly where Step 2 says) and reports `NEEDS: owner phone` until the figures arrive; Part 1 is not called finished before that.

**Files:**
- Create: `apps/server/test/tooling/wtg-part1-catalogue.test.ts`
- Modify: `packages/flow-graph-browser/README.md` (the `## Records` table, a second row), `test-cases/29-workflow-timeline-graphs.md` (29.118 text, T13 anchor), `Features.md` (T13 bullet anchor)
- Modify only if the measurement misses a bar: nothing in this task. A miss is reported to the controller as a defect with the record attached, and a new task is cut (the cause is found by profiling the headed run, not guessed here).

**Interfaces:**
- **Consumes:** `harness/bars.ts` `judge(record)` (T1); the `view` scene of `stress.html` (T1) now running the CONTINUOUS view; the 29.016 record (T1 steps 14 and 15) in the README table and on its catalogue line; every Part 1 anchor and retirement line (T1, T9).
- **Produces:** the after-the-lift record (desktop and phone) in the README and on the 29.118 line; `part1Lines`, `notClosed`, `unretired`, `emptyAnchors` (exported from the test file so the controls can plant violations); the standing guard that Part 1's block cannot reopen.
- **Used by:** Part 2 onward (they edit `test-cases/29-...md` below Part 1's range and must leave 29.001-29.119 closed).

**Design notes:**
- **The measurement is the whole point of Part 1's performance claim.** T1 wrote the "before" with the shipped week-column grid (eight weeks mounted, native scroller). The same URL now runs the continuous, packed, preloaded view with up to 2,000 tickets drawn through the visible window plus one viewport each side. The bars are spec section 13: desktop at least 60 fps with a worst frame of 20 ms or less; phone at least 30 fps with 50 ms or less; and no slower than 29.016.
- **29.118 is manual (`🧪`)**: its test is a human reading a number off a real device. The line flips to `🧪` when both halves carry their figures AND `judge` lists no reason, never before.
- **29.119 is a guard on the catalogue itself**, not on behaviour. Its four checks each carry a planted violation in the same `it()` so a check that cannot fail would fail the control.

- [ ] **Step 1: Case lines**

  Under `<!-- wtg-part1-viewport-timeline-view T13 -->`, insert (both ❌):

- ❌ **29.118 — After the lift: the SAME scene, `stress.html?scene=view&n=2000&auto=1`, on a headed desktop Chrome and on the real phone, meets the section 13 bars (desktop at least 60 fps with a worst frame of 20 ms or less; phone at least 30 fps with 50 ms or less) and is no slower than 29.016; both records, and the device each was taken on, are written on this line.** (`packages/flow-graph-browser/README.md`)
- ❌ **29.119 — The Part 1 catalogue is closed and stays closed: no id line in 29.001–29.119 is pending or partial; the nine pins the paged grid retired (11.55, 11.56, 11.74, 11.79, 11.82, 13.474, 13.477, 21.113, 23.142) are retired and name the Part 1 id that replaced them; every Part 1 task wrote its case lines and its Features bullet; the two manual records (29.016 before, 29.118 after) carry numbers; control: each check finds a planted violation.** (`apps/server/test/tooling/wtg-part1-catalogue.test.ts`)

- [ ] **Step 2: The catalogue test first (RED where it can be)**

`apps/server/test/tooling/wtg-part1-catalogue.test.ts` (new):

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 29.119 — the Part 1 block of `test-cases/29-workflow-timeline-graphs.md` is closed and stays closed
 * (Workflow and Timeline graphs Part 1 T13). Four properties, each with its control in the same `it`:
 *  1. no id line in 29.001-29.119 is still pending (a cross) or partial: each is covered, manual or retired;
 *  2. the pins the paged grid retired are retired with the id that replaced them, in their own catalogue files;
 *  3. every Part 1 anchor in the catalogue and in Features section 26 was replaced by content (no empty task);
 *  4. the two manual records (29.016 before the lift, 29.118 after) carry numbers, not just a promise of them.
 * The paging names themselves are scanned in the source by 29.105; this file does not repeat that.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

const PLAN = 'wtg-part1-viewport-timeline-view';
const RETIRED: ReadonlyArray<{ id: string; file: string }> = [
  { id: '11.55', file: 'test-cases/11-calendar-notifications.md' },
  { id: '11.56', file: 'test-cases/11-calendar-notifications.md' },
  { id: '11.74', file: 'test-cases/11-calendar-notifications.md' },
  { id: '11.79', file: 'test-cases/11-calendar-notifications.md' },
  { id: '11.82', file: 'test-cases/11-calendar-notifications.md' },
  { id: '13.474', file: 'test-cases/13-board-prototype-port.md' },
  { id: '13.477', file: 'test-cases/13-board-prototype-port.md' },
  { id: '21.113', file: 'test-cases/21-mobile-web.md' },
  { id: '23.142', file: 'test-cases/23-ux-fixes.md' },
];

type IdLine = { id: string; marker: string; text: string };

/** Every `- <marker> **29.NNN` line whose number is in 29.001-29.119. */
export function part1Lines(md: string): IdLine[] {
  const out: IdLine[] = [];
  for (const text of md.split('\n')) {
    const m = text.match(/^- (✅|❌|🟡|🧪|🚫) \*\*29\.(\d{3}) /);
    if (m === null) continue;
    const n = Number(m[2]);
    if (n >= 1 && n <= 119) out.push({ id: `29.${m[2]}`, marker: m[1] as string, text });
  }
  return out;
}

/** The ids that are neither covered, manual nor retired. */
export function notClosed(lines: readonly IdLine[]): string[] {
  return lines.filter((l) => !['✅', '🧪', '🚫'].includes(l.marker)).map((l) => l.id);
}

/** The retired pins that are not retired by a Part 1 id: not on a 🚫 line that names `replaced by 29.`. */
export function unretired(md: string, id: string): boolean {
  const escaped = id.replace('.', '\\.');
  const line = md.split('\n').find((l) => new RegExp(`^- (\\*\\*${escaped}\\*\\* |(?:✅|🟡|❌|🚫) \\*\\*${escaped} — )`).test(l));
  if (line === undefined) return true;
  return !(line.includes('🚫') && /replaced by 29\.\d{3}/.test(line));
}

/** Part 1 anchors left in place: a task whose catalogue lines or Features bullet were never written. */
export function emptyAnchors(md: string, kind: 'cases' | 'bullet'): string[] {
  const lines = md.split('\n');
  const left: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = (lines[i] as string).match(new RegExp(`^<!-- ${PLAN} T(\\d+)${kind === 'bullet' ? ' bullet' : ''} -->$`));
    if (m === null) continue;
    const next = lines[i + 1] ?? '';
    const filled = kind === 'bullet' ? false : /^- (✅|❌|🟡|🧪|🚫) \*\*29\./.test(next);
    if (!filled) left.push(`T${m[1]}`);
  }
  return left;
}

const range = (a: number, b: number): string[] => Array.from({ length: b - a + 1 }, (_, i) => `29.${String(a + i).padStart(3, '0')}`);
/** Part 1's allocation (file 29's "Ids by task" line): T1-T13 own these 85 ids; the gaps stay free for follow-ups. */
const PART1_IDS: readonly string[] = [...range(1, 16), ...range(20, 25), ...range(30, 54), ...range(65, 67), ...range(80, 87), ...range(93, 119)];

/** The allocated ids with no id line at all (a deleted line is neither pending nor closed, so `notClosed` cannot see it). */
function missingIds(lines: readonly IdLine[]): string[] {
  const have = new Set(lines.map((l) => l.id));
  return PART1_IDS.filter((id) => !have.has(id));
}

/** The Part 1 tasks with no Features bullet: each bullet names `(Workflow and Timeline graphs Part 1 T<n>; cases ...`. */
function missingBullets(section: string): string[] {
  return Array.from({ length: 13 }, (_, i) => `T${i + 1}`).filter((t) => !section.includes(`Workflow and Timeline graphs Part 1 ${t};`));
}

/** The measured halves of a record (`desktop: 61 fps`, `phone: 34.5 fps`). The bar text ("at least 60 fps") is neither. */
function recordHalves(line: string): { desktop: boolean; phone: boolean } {
  return { desktop: /desktop: \d+(\.\d+)? fps/.test(line), phone: /phone: \d+(\.\d+)? fps/.test(line) };
}

describe('29.119 the Part 1 catalogue is closed', () => {
  const cases = read('test-cases/29-workflow-timeline-graphs.md');
  const features = read('Features.md');

  it('29.119 no id line in 29.001-29.119 is pending or partial; control: a planted pending line and a planted partial one are both found', () => {
    const lines = part1Lines(cases);
    expect(lines.length).toBeGreaterThanOrEqual(80);
    expect(missingIds(lines)).toEqual([]);
    expect(notClosed(lines)).toEqual([]);
    const planted = cases + '\n- ❌ **29.050 — a planted pending line.**\n- 🟡 **29.051 — a planted partial one.**\n';
    expect(notClosed(part1Lines(planted))).toEqual(['29.050', '29.051']);
    // control for the allocation leg: the same file with its 29.050 line deleted is missing exactly 29.050
    const dropped = cases.split('\n').filter((l) => !l.includes('**29.050 — ')).join('\n');
    expect(missingIds(part1Lines(dropped))).toEqual(['29.050']);
  });

  it('29.119 the nine pins the paged grid retired are 🚫 and name the Part 1 id that replaced them; control: an un-retired copy of each is found', () => {
    for (const { id, file } of RETIRED) {
      const md = read(file);
      expect(unretired(md, id), id).toBe(false);
      // control: the same line with its marker put back is reported
      const reopened = md
        .split('\n')
        .map((l) => (l.includes(`**${id}`) && l.includes('🚫') ? l.replace('🚫', '✅') : l))
        .join('\n');
      expect(unretired(reopened, id), `${id} reopened`).toBe(true);
      // control: still 🚫 but naming no replacement is reported too (kills `unretired` without the `replaced by` clause)
      const orphaned = md
        .split('\n')
        .map((l) => (l.includes(`**${id}`) && l.includes('🚫') ? l.replace(/replaced by 29\.\d{3}/g, 'replaced later') : l))
        .join('\n');
      expect(unretired(orphaned, id), `${id} with no replacement`).toBe(true);
    }
  });

  it('29.119 every Part 1 task wrote its case lines and its Features bullet (no anchor is left empty); control: a seed with the anchors alone is found empty', () => {
    // the case anchors stay by design: all 13 must be there, or a renamed anchor would make emptyAnchors vacuous
    expect(cases.match(new RegExp(`^<!-- ${PLAN} T\\d+ -->$`, 'gm'))?.length ?? 0).toBe(13);
    expect(emptyAnchors(cases, 'cases')).toEqual([]);
    const at = features.indexOf('## 26. Workflow and Timeline graphs');
    expect(at).toBeGreaterThanOrEqual(0); // indexOf -1 would slice the last character and pass both legs below
    const featuresSection = features.slice(at);
    expect(emptyAnchors(featuresSection, 'bullet')).toEqual([]);
    expect(missingBullets(featuresSection)).toEqual([]);
    expect(emptyAnchors(`<!-- ${PLAN} T1 -->\n<!-- ${PLAN} T2 -->\n- ✅ **29.001 — x.**\n`, 'cases')).toEqual(['T1']);
    expect(emptyAnchors(`<!-- ${PLAN} T3 bullet -->\n`, 'bullet')).toEqual(['T3']);
    // control: an anchor deleted without its bullet leaves no anchor to find, but the bullet is missing
    expect(missingBullets(featuresSection.replace('Workflow and Timeline graphs Part 1 T5;', 'Part 1, task five;'))).toEqual(['T5']);
  });

  it('29.119 the two manual records carry numbers: 29.016 (before) and 29.118 (after) each name a desktop and a phone fps; control: a record with no numbers has none', () => {
    for (const id of ['29.016', '29.118']) {
      const line = cases.split('\n').find((l) => l.includes(`**${id} — `));
      expect(line, id).toBeDefined();
      expect(recordHalves(line as string), `${id} desktop and phone fps`).toEqual({ desktop: true, phone: true });
      expect((line as string).startsWith('- 🧪 '), `${id} is manual`).toBe(true);
    }
    expect(recordHalves('- 🧪 **29.016 — measured on the owner\'s phone.**')).toEqual({ desktop: false, phone: false });
    // control: 29.118 as Step 1 writes it quotes the bars ("at least 60 fps", "at least 30 fps") and is no record
    expect(recordHalves('- ❌ **29.118 — meets the section 13 bars (desktop at least 60 fps with a worst frame of 20 ms or less; phone at least 30 fps with 50 ms or less).**')).toEqual({ desktop: false, phone: false });
    // control: half a record is half
    expect(recordHalves('- 🧪 **29.118 — x; desktop: 61 fps, worst 18 ms.**')).toEqual({ desktop: true, phone: false });
  });
});
```

**Kills:**
- 29.119 no id line pending or partial: (a) `notClosed` admitting ❌ (`['✅', '🧪', '🚫', '❌']`): the planted-pending control returns `['29.051']`; (b) `part1Lines` bound `n <= 119` to `n <= 49`: `missingIds` reports every id from 29.050 up; (c) `missingIds` returning `[]`: the deleted-29.050 control fails.
- 29.119 the nine retired pins: (a) `unretired` without the `replaced by` clause (`return !line.includes('🚫')`): the no-replacement control returns false; (b) `unretired` without the `line.includes('🚫')` arm: the reopened (✅) control still names `replaced by 29.` and returns false; (c) the line regex losing its `\*\*${escaped}\*\* ` arm: the five file-11 lines (`- **11.55** 🚫 ...`) are not found and `unretired` is true on the real files.
- 29.119 every task wrote its lines and bullet: (a) `emptyAnchors` for `bullet` returning filled: the planted `T3 bullet` control returns `[]`; (b) `emptyAnchors` for `cases` dropping the next-line test (`filled = true`): the seed control returns `[]` for T1; (c) `missingBullets` returning `[]`: the T5 control fails (a task that deleted its anchor without writing a bullet would pass `emptyAnchors`).
- 29.119 the manual records carry numbers: (a) `recordHalves` without the `desktop:` anchor (`/\d+(\.\d+)? fps/` for desktop): the Step 1 bar-text control returns `desktop: true`; (b) the `phone` test dropped (`phone: true`): the half-record control returns `phone: true`.

  Run: `slot-run.sh srv -- pnpm --filter @gisik-nokma/server exec vitest run test/tooling/wtg-part1-catalogue.test.ts --maxWorkers=2 > /tmp/srv.log 2>&1; tail -n 30 /tmp/srv.log`. Expected at this point, after Step 1 and before the measurement: `it` 2 (the nine retired pins) green; `it` 1 RED naming exactly `29.118` and `29.119` (this task's own lines are still ❌); `it` 3 RED naming exactly `T13` (this task's Features bullet anchor is still in place); `it` 4 RED (29.118 carries no `desktop: N fps` / `phone: N fps` record and is not 🧪; the bar text "at least 60 fps" in its Step 1 wording is not a record). Those three reds are the task's progress bar and each goes away in a named step below. If any red names anything else (another task's id or anchor), an earlier task left a pending line or an anchor in place: fix that task's catalogue line in this PR and say so in the HANDOFF.

- [ ] **Step 3: Re-measure on a headed desktop (case 29.118, desktop half)**

  The same recipe as T1 step 14, on the same machine, with the app-core `dist` built from THIS branch (the continuous view):

  ```bash
  pnpm turbo run build --filter=@gisik-nokma/flow-graph-browser^...
  FG_HEADED=1 /Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh fgb-headed -- pnpm --filter @gisik-nokma/flow-graph-browser exec playwright test tests/stress.spec.ts --grep "29.003" > /tmp/fgb-headed.log 2>&1; tail -n 12 /tmp/fgb-headed.log
  tail -n 3 packages/flow-graph-browser/test-results/stress.jsonl
  ```

  Run it three times; the log prints `fg-stress view (...)` with the pan's `fps`, `worstMs`, `p95Ms` and `clickToSettleMs`. Count what the page mounted (open `stress.html?scene=view&n=2000&auto=1` in the headed window and run `document.querySelectorAll('.gn-timeline__bar').length` in the console): it is far below 2,000, and the figure goes in the record. Take the MEDIAN run by fps and write its row (`judge` is applied to that record in `harness/bars.ts`; if it lists a reason, the bar is missed).

  "No slower than 29.016" is judged against the run-to-run spread you just saw: the median's fps must be at least 29.016's, and its worst frame at most 29.016's, unless the difference is smaller than the largest gap between your three runs on either figure, in which case say so in the record. A real regression (the continuous view slower than the grid it replaced, beyond the spread) is a defect: stop, attach the three records, and report; do not flip the line.

- [ ] **Step 4: Re-measure on the owner's real phone (case 29.118, phone half)**

  Exactly T1 step 15: start `pnpm exec vite --host` from `packages/flow-graph-browser` in the background (note the pid), ask the controller to relay `http://<this machine's LAN ip>:3192/stress.html?scene=view&n=2000&auto=1` to the owner, wait for a `"touch":true` line in `test-results/stress.jsonl`, stop the server by its exact pid (no `pkill`). Ask for the page THREE times when the owner is willing; the page runs three pans per load.

- [ ] **Step 5: Write the records**

  Append the second row to the README's `## Records` table (the first is T1's):

  ```markdown
  | 29.118 (after the lift) | `view`, 2,000 tickets | desktop: <machine and Chrome version> | N | N ms | N ms | N ms | N bars |
  | 29.118 (after the lift) | `view`, 2,000 tickets | phone: <model> | N | N ms | N ms | N ms | N bars |
  ```

  and write the same figures onto the 29.118 line in the catalogue in the same form as 29.016's: `desktop: N fps, worst N ms, p95 N ms, click-to-settle N ms, N bars mounted (device: ...); phone: N fps, worst N ms, p95 N ms, click-to-settle N ms, N bars mounted (device: ...)`. Add the sentence "No slower than 29.016: <yes, by ...>". Flip 29.118 to `🧪` ONLY when both halves carry their figures, `judge` lists no reason for either record, and the no-slower comparison holds. A headless run is not this measurement and is never written on this line.

- [ ] **Step 6: This task's own Features bullet and the 29.119 flip**

  Replace the anchor `<!-- wtg-part1-viewport-timeline-view T13 bullet -->` in section 26 with:

```markdown
- ✅ **Part 1 is closed: re-measured and guarded** (Workflow and Timeline graphs Part 1 T13; cases 29.118, 29.119; `apps/server/test/tooling/wtg-part1-catalogue.test.ts`) — the existing view at 2,000 dated tickets is panned again on a headed desktop and a real phone and written against the section 13 bars and the 29.016 baseline (case 29.118); a tooling test keeps the Part 1 block honest: no pending line left in 29.001–29.119, the retired pins stay retired with their replacements, every Part 1 task's lines and bullet exist, and both manual records carry a desktop and a phone figure (the paged grid's names are kept out of the source by 29.105, not by this test).
```

  Leave the closing `<!-- wtg-part1-viewport-timeline-view end -->` marker where it is: it is the permanent insertion point the later Parts' sections sit below.

  Flip 29.119 from ❌ to ✅ in file 29 (the test written in Step 2 is its covering test, and it is run in Step 7).

- [ ] **Step 7: GREEN and the final sweep of Part 1**

  ```bash
  slot-run.sh srv -- pnpm --filter @gisik-nokma/server exec vitest run test/tooling --maxWorkers=2 > /tmp/srv.log 2>&1; tail -n 30 /tmp/srv.log
  pnpm check:citations
  pnpm check:help
  pnpm check:env
  pnpm check:tasks
  ```

  Expected: all four catalogue-test `it`s green, `check:citations` clean. `check:env` and `check:tasks` are not run by the gate, so a release that skips them breaks the release PR's CI: run them here, once, as Part 1's last act. Then every other `check:*` script in the root `package.json` (`grep -n '"check:' package.json`), each named LOCAL, and the quoted runs say which they are. Last, one sweep for leftovers across the repo:

  ```bash
  grep -n "wtg-part1-viewport-timeline-view T[0-9]* bullet" Features.md   # expect no output: every Part 1 Features anchor was replaced by its bullet (the case anchors in file 29 stay by design, each with its lines under it; the test checks that)
  grep -rnE "TIMELINE_OUT_OF_WINDOW_COPY|TimelineWeekCol|TimelineBarSpan|SHIFT_DAYS|weeksCount" packages/app-core/src packages/ui/src apps/web/src   # expect no output (29.105 holds the same scan)
  ```

  A Features anchor still present means a task never wrote its bullet: that is a defect of that task, fixed in this PR and named in the HANDOFF.

**Prose to sweep:** `docs/superpowers/plans/2026-10-03-wtg-part1-viewport-timeline-view.md:38` (Global Constraints, "Catalogue") gives T9 `29.093–29.107` and lists `29.087–29.092` as unused. T9 writes 29.087, and file 29 (`test-cases/29-workflow-timeline-graphs.md:29` on the ref, "T9 087 + 093–107") and this task's `PART1_IDS` (85 ids) follow it. Correct the line to T9 `29.087`, `29.093–29.107`, with unused `29.088–29.092` (planner ruling 2026-10-04: file 29 is right; T1's landed text is left alone). Otherwise none found (searched on the ref: `29.118`, `29.119`, `after the lift`, `wtg-part1-catalogue`, `Records`, `T13` in `packages/flow-graph-browser/README.md`, `test-cases/`, `Features.md`, `docs/` outside the plans; the only hits are the block table `test-cases/29-workflow-timeline-graphs.md:10`/`:27`, the ledger row `docs/lanes/task-ledger.tsv:658` and `packages/flow-graph-browser/harness/stress.tsx:12`, which stay true). Note: `packages/flow-graph-browser/README.md:23` still names `results/stress.jsonl` on the ref; it is moved by `task/wtg1-stress-output-ignored`, not by this task; if that branch has not landed when T13 runs, the records are read from `results/stress.jsonl` instead of `test-results/` in Steps 3 and 4.

- [ ] **Step 8: Mutation, gate**

  Mutation pass (own), on the catalogue test: a different threshold than 80 on the count (set 90, expect RED), `notClosed` admitting ❌ (expect the planted-pending control to fail), `unretired` without the `replaced by` clause (expect the no-replacement control to fail), `emptyAnchors` for `bullet` returning filled (expect the planted anchor control to fail), `missingIds` / `missingBullets` returning `[]` (expect the deleted-29.050 / the T5 control to fail), `recordHalves` counting any `N fps` as a desktop figure (expect the Step 1 bar-text control to fail) and dropping its `phone` test (expect the half-record control to fail). Record survivors.

  - `pnpm check:citations` (29.119 is ✅ with its covering test; 29.118 is 🧪).
  - `ctl gate <sha> --base release/workflow-graph`; `ctl land <pr> --base release/workflow-graph`.
  - HANDOFF: the 13 tasks' landed shas, the two records, every mutation survivor recorded across Part 1, and "Part 1 ships first and alone: the release branch is ready for the owner's word to merge to `main`" (the merge is the owner's, per merge, every time).


## Self-review

**1. Spec coverage (Part 1: sections 2 to 6, the bars of 13, VP-10, VP-11, TV-11, TG-11, TG-12 to TG-15 as they touch the existing view).**

| Spec | Task |
|---|---|
| VP-0 (the seam; clock-free modules, 29.015), VP-1 to VP-5 (spring, glide, momentum, wheel and keys), VP-6 (anchored zoom, presets) | T2 (pure), T6 (`ScrollAdapter`), T7 (`CameraAdapter`) |
| VP-7 (limits, rubber band), VP-8 (frame discipline: one transform layer, sticky axis and headings), VP-9 (reduced motion) | T2 and T3 (`panLimits`), T6, T9 (CSS layers), T10 (real browser, reduced-motion case) |
| VP-10 (no Earlier / Later / Previous / Next), VP-11 (axis, weekend tint, contrast) | T9 (copy, axis, `timelineWeekend` token, contrast roster 52 to 53), T10 |
| PR-1 to PR-6 (range plan, preload, cache), PR-7 (bars) | T3 (plan and cache); T9 (the view's use of them); T1 and T13 (the bars) |
| PK-1 to PK-6 (row packing, packing scale, hulls, label footprint), PK-7 (orientation), PK-8 (labels) | T4 (pure), T8 (lane layout), T9 (labels), T11 (portrait) |
| TV-1 to TV-9 (the existing Timeline continuous and packed, claims semantics kept, Today, axis, side list, empty states, out-of-window copy replaced) | T8, T9, T10 |
| TV-10 and TG-11 (the paper pin) | T12 (server count, wire, view, glyph) |
| TV-11 (audit rules on this view: TG-13 geometry, TG-14 marks, TG-15 copy) and TG-12 (loop arrows) | T9 (bars, marks, copy), T11 (phone), T5 (`routeLoop`, the pure half of TG-12); the drawn loop arrow belongs to Part 3 |
| TG-5 (edge routing) | T5 (`routeEdge`, pure) |
| Section 13 bars; measure first | T1 (harness, bars as data, 29.016 before), T13 (29.118 after) |
| Catalogue, Features section 26, gate, registration | T1 (two PRs: the gate widening, then the rest); T13 (closing guard 29.119) |

Gaps: none left for Part 1. Open question 5 (does the Knowledge Graph's engine exist to share?) is answered by reading `origin/release/knowledge-graph` at `a03cc486`: it does not, so the motion core is written here, and T2 step 8 adds a parity test that runs only if the Knowledge Graph's file appears later.

**2. Placeholder scan.** No step says to fill something in later. Where a figure must come from a device (T1 steps 14 and 15, T13 steps 3 and 4) the plan names the device, the command and the record form, and says what the line does if the device is not available. The release branch is `release/workflow-graph` (cut 2026-10-04).

**3. Type consistency.** Names are used as defined: `View { offsetDay, ppd }`, `packLane(items, {ppd, labelPx}) -> {rows, rowOf, strategy}`, `packScale`, `layoutLanes(lanes, {ppd, measure, orientation})`, `PIN_PX`, `pinned?` on layout items (T8) and `TimelineRow.pin` (T12), `TicketPin` / `PinCounts` / `timelinePinLabel`, `ScrollAdapter({axis})`, `Orientation`, `KeyMeasure`. The staged per-task states (viewport `index.ts` per task, app-core T9 / T11 / T12) were typechecked and run before they were embedded; the per-task diffs are applied in order, so a lane that takes a task out of order breaks a diff context, not a name. One known mismatch is deliberate: T12's view-test diff adds a second `it` to 29.102, a T9 case, because the render counter needs the pin (T9 says the same).

**4. Review Focus, mapped to cases.**
1. rounded `scrollLeft`: 29.031 (T6), 29.041 (T10), each with its naive-loop control.
2. a glide past the scroller's end: 29.039 (T6), 29.112 (T11).
3. a note the viewer cannot read: 29.113 (T12), three viewers over one world plus the deleted note; the trashed-project clause is a recorded gap.
4. a re-render storm: 29.102 (T9, completed in T12).
5. far from today, or none: 29.094, 29.095, 29.096 (T9), 29.108, 29.112 (T11).

**Known limits of this plan** (said once, here): the lockfile diff is not embedded (T1 runs `pnpm install` under Node 22 and checks that only the two new importer blocks changed); test files are shown as unified diffs against the Knowledge Graph release tip, and a lane applies them with `patch -p1` or by hand; `Features.md` and `test-cases/23-ux-fixes.md` moved on that branch after the base the diffs were cut against, so their edits are applied by bullet title or id, never by line number. No full-repo suite was run on the assembled final tree; every task's whole-suite run is a step the lane performs and names LOCAL.

## Order and what each task needs

| Task | After | Needs | Owner action |
|---|---|---|---|
| T1 (PR A, then PR B) | the release branch exists | a headed Chrome and the owner's phone for 29.016 | pull the primary checkout between PR A and PR B |
| T2 | T1 | nothing | none |
| T3, T4, T5 | T2 (parallel) | nothing | none |
| T6 | T2 | nothing | none |
| T7 | T6 | nothing | none |
| T8 | T4 | nothing | none |
| T9 | T6, T8 | `frontend-design` | none |
| T10 | T9 | nothing (headed run welcome) | none |
| T11 | T10 | `frontend-design` | none |
| T12 | T11 | `frontend-design`; the test Postgres | none |
| T13 | T12 | the owner's phone, a headed desktop; the PR waits for both records | the phone run |

Execution: the gisik-nokma lanes (one task = one session), per the planner. Reviews and merges into `release/workflow-graph` are autonomous with a LOCAL battery named as local; the merge of `release/workflow-graph` to `main` is the owner's word, per merge. I recommend subagent-driven execution: T1's catalogue, package registration and gate dance feed every later task, T9 is a view cutover with retirements across five catalogue files, and a shipped mistake in T12 would leak that a hidden note exists.

## Ledger rows

```
wtg-part1-viewport-timeline-view	1	todo	-	-	not started (two PRs: gate widening A, owner pulls primary, then B; opens Features 26 + test-cases/29; NEEDS headed Chrome + owner phone for 29.016)
wtg-part1-viewport-timeline-view	2	todo	-	-	not started (waits for T1)
wtg-part1-viewport-timeline-view	3	todo	-	-	not started (waits for T2)
wtg-part1-viewport-timeline-view	4	todo	-	-	not started (waits for T2)
wtg-part1-viewport-timeline-view	5	todo	-	-	not started (waits for T2)
wtg-part1-viewport-timeline-view	6	todo	-	-	not started (waits for T2)
wtg-part1-viewport-timeline-view	7	todo	-	-	not started (waits for T6)
wtg-part1-viewport-timeline-view	8	todo	-	-	not started (waits for T4)
wtg-part1-viewport-timeline-view	9	todo	-	-	not started (waits for T6 + T8; frontend-design; cutover and retirements)
wtg-part1-viewport-timeline-view	10	todo	-	-	not started (waits for T9; real browser)
wtg-part1-viewport-timeline-view	11	todo	-	-	not started (waits for T10; frontend-design)
wtg-part1-viewport-timeline-view	12	todo	-	-	not started (waits for T11; frontend-design; server read + wire + whole server suite)
wtg-part1-viewport-timeline-view	13	todo	-	-	not started (waits for T12; NEEDS owner phone + headed desktop for 29.118; PR opens only when both records exist)
```

