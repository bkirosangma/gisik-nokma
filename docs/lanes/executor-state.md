# Serial executor — live state

**This file is the restart surface.** A controller that kills and relaunches the executor from its
brief recovers only what is written here. Refreshed at every task boundary.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document in this
> repo — the dispatch brief, the coordination doc's sections, the narrative parts of this file — is
> a fact about the moment it was written. Anchors in the table below were verified with
> `git branch --contains` (empty output = orphaned), never with `git cat-file`, which passes on
> reflog-only commits and hands you pre-rebase content while looking like it worked.

## WHERE I AM: **STEP 13 — Plan 8, the workflow builder. JUST STARTED.**

**Step 12 (Plan 7 remainder) is MERGED as PR #82 → `7337357`.** Plan 7 is complete at 22/22.
**Do not reopen it.** Its eighteen ledger rows read `in-flight` on `main` after the merge; this
branch's first commit promotes them to `done`, and `check:tasks` now verifies the merge sha is an
ancestor of `origin/main`. **The repo stands at 118/177 (66.7%), independently recounted.**

Step 13 = **Plan 8**, `docs/superpowers/plans/2026-08-20-08-workflow-builder.md`, **15 tasks, all
`todo`**. Nothing is in flight. No PR is open. Nothing is awaiting a decision.

## Live anchors — 2026-09-03, step 13 opening

| Anchor | Value | How verified |
|---|---|---|
| **Branch** | **`exec/13-plan8-workflow-builder`**, cut from `origin/main` `7337357`. | `git rev-parse --abbrev-ref HEAD` |
| **Base** | `origin/main` = `73373579b906a18e3d319363a8eb3685b076eb50` | `git rev-parse origin/main`, fetched |
| **Ahead-count** | **Not written here on purpose. Run `git rev-list --count origin/main..HEAD`.** A count taken while writing the commit that records it is *always* short by one and always looks right to its author. | — |
| **Gate at the base `7337357`** | **exit 0 · 24/24 tasks · 0 cached · Node v22.22.2 · 2232 tests.** domain 335 · rule-engine 280 · server 857 · app-core 474 · editor 178 · web 69 · ui 31 · sync-client 8. **This is the delta baseline for step 13.** | run by the executor with `--force` at branch creation, **through `rtk proxy`** — the first attempt was proxy-collapsed to one package and its composition was unusable |
| **`check:tasks`** | **exit 0**, 177 rows / 177 plan tasks, **118 done (66.7%)**, 0 claimed, 0 in-flight, **59 todo**. Plan 08 = 0 done / 15 todo. | `node scripts/check-task-ledger.mjs` after the promotion |
| **Gate SHAPE** | **24 tasks over EIGHT packages.** Plan 8 Task 14 adds a Playwright e2e script — **if it becomes a turbo task, this figure is spent and must be recounted.** | the run above |
| Orphaned, do not cite | every sha in the narrative sections of previous handoffs. | `git branch --contains` (empty = orphaned) |

### The Plan 7 ledger promotion in this branch's first commit, and its evidentiary basis

Eighteen Plan 7 rows (`07/5, 6, 7, 8, 9, 9a, 10, 11, 11a, 12, 12a, 12b, 12c, 13, 13a, 14, 15, 16`)
still read `in-flight` on `main` after PR #82 merged. They are promoted to `done`, PR `82`, sha
`7337357`.

**The basis matters, because this repo has already run one ledger audit that refused three rows.**
The vocabulary grants `done` to "a merged PR whose title **or the controller record** names THIS
plan AND task specifically". PR #82's *title* names the step, not the tasks — on the title alone
these rows would be `claimed`. They qualify on the **controller-record** clause: step 12's handoff
on `main` carries per-task Batch A/B/C/D tables naming each of the eighteen DONE with its artefact
and test delta. **This is the same basis step 12 used to promote Plan 6's twelve rows**, recorded
again here so the next audit does not re-derive it.

## THE SEQUENCE, and where step 13 sits

Spine: `1,2 → 3,4 → 5 → {6,7,8,9,10} → 11`. **Steps 1–12 are closed.**

Remaining: **13. Plan 8** (here) · 14. Plan 9 *(T6 floor-list)*, T14 after `apps/web` · 15. Plan 10
remainder *(T7, T9, T14/T15 floor-list)* · 16. Plan 11 *(T8/T9, T12 floor-list)* — last by
construction.

## PLAN 8's FLOOR-LIST ENTRY IS ALREADY DISCHARGED — and that licenses less than it looks like

The coordination doc's floor list names exactly one Plan 8 item: **"Plan 8's F5 amendment (the
'cover' semantics are a design call)"**. Coordination line 546 records that the amendment was
**pulled forward as its own PR** because no task in any plan absorbed it — *"Plan 8 only consumes
`adviseWorkflowDef`, never modifies it."* **Verified on disk at this base:**
`packages/domain/src/advise-workflow.ts` ships both advisory sweeps (`rdu-bypassable`,
`rule-bypassable`), and the COVER design call is made *and argued* in its docblock —
same-kind-present, parameters never compared, stated explicitly as "a floor, not a proof of equal
strictness". `packages/domain/test/advise-workflow.test.ts` and the rule-engine fixtures exist.

**So Plan 8 carries no floor-list task. It does NOT follow that Plan 8 is a sonnet plan.** The
MODEL & EFFORT class rows are independent of the floor list, and two of them — *honesty-carrying
view-models* and *fixture authoring and planted-defect design* — are opus-high wherever they appear.
**Priced as opus BEFORE the batch starts, not discovered mid-batch:**

| Task | Why opus |
|---|---|
| **T8** live validation | Eleven issue codes, each owed a planted-defect test, **plus the advisory code whose test proves the OPPOSITE property** — that publish stays *enabled* while a warning is on screen. That inversion is exactly where a check that cannot fail hides. |
| **T9** publish flow | Server refusals rendered verbatim + the stranded-state mapping dialog, where occupancy is **"a builder courtesy, never an engine input"**. A refusal that depends on a count would make the two engines disagree by construction. |
| **T11** ticket-type management | The plan's own title names it: *"the divergence a re-binding leaves behind"*. |
| **T12** admin gating end-to-end | A read-enforcement surface. This series has produced rulings P19, P22 and P23 on exactly that shape, **every one a disclosure no test caught**. |

Escalation runs upward; the cost ruling lowered floors, it did not forbid this. **Plan 7's T10 was
not on any floor list and its escalated reviewer found the step's most dangerous unfalsifiable
check.**

## FIVE THINGS THAT WILL COST A ROUND EACH IN STEP 13

**1. The catalogue home is §10, NOT §8 — and the §8 refusal on record does not apply here.**
`Features.md` runs §7 → §9 → §12 and `test-cases/` holds `03,04,05,06,07,09,12`. The numbering is
**plan N → §N+2** (§1 Reference base and §2 Product design sit ahead of the plans): Plan 1→§3,
Plan 3→§5, Plan 5→§7, Plan 7→§9, Plan 10→§12. **Plan 8→§10.** Ledger row `06/16` carries a
controller note refusing §8 — **that refusal is about PLAN 6's web client**, whose catalogue landed
in §3 because migrating 112+ live cross-referenced ids breaks the never-renumber rule. It says
nothing about Plan 8. Plan 8's own Task 15 pins **§10 / `10-workflow-builder` / cases `10.x`** and
instructs: *"If the numbers on disk disagree at execution time, stop and flag it to the
orchestrator; do not take another number."* **They do not disagree — §10 and
`test-cases/10-workflow-builder.md` are both free.** T15 therefore **opens** a section rather than
extending one, which is the opposite of Plan 7 T16's situation. New cases start at **10.1**.

**2. `@xyflow/react` is NOT installed anywhere in the monorepo** — swept across the root and every
`packages/*` and `apps/*` `package.json`. Task 5 adds it. **The jsdom hazard is the real cost:**
React Flow measures its container, and in jsdom with no `ResizeObserver` and no explicit
width/height **it renders no nodes**. That fails two ways and the second is worse — confusing red,
or **a green suite asserting over an empty canvas**. The discriminating check is a planted defect
that *removes a node* and must redden. If it does not, the harness is not rendering and every
canvas assertion in the plan is vacuous.

**3. T4's gateway is where "a mocked contract excuses the server from existing" would land.** T4
defines `WorkflowAuthoringGateway` and its in-memory fake, and **twelve tasks then build against
that fake** before T13 ever touches a real `DataSource`. The wave-boundary integration checkpoint no
longer fires and step 10's replacement is spent. **Do a server-read inventory BEFORE T4**, not at
T13: enumerate every read and write the gateway needs (workflow list, def fetch, `getStateOccupancy`,
ticket-type reads, publish submit) and check which the shipped server actually serves. The publish
path is wired — `registerEventRoutes` resolves to `app.ts:204`. The **reads** are the open question.
Where a read does not exist, the honest shape is for T4's interface to make the gap visible so T13
surfaces `ServingGapError` — **never to weaken one to make a view light up**, which main's handoff
explicitly forbids. Step 12's final review found `registerAttachmentRoutes` is defined and **never
called**, so "the module exists" is not evidence the route serves.

**4. The `apps/web` TS6053 hazard returns at T13, which adds six pages.** `apps/web/tsconfig.json`
excludes `.next` because Next's default `include` globs a directory `next build` deletes while turbo
runs typecheck concurrently — measured **2 red of 3** without the exclude. It cannot be a narrower
include: `next build` rewrites that file's `include` every run and never touches its `exclude`.
**If the gate reddens on `@gisik-nokma/web:typecheck` with TS6053, this is why — and run it three
times before believing either answer.**

**5. Verify BEFORE T14 whether Playwright is installed and whether CI actually runs it.** T15's own
verification step accepts `pnpm --filter web e2e` **SKIPping loudly when the env gate is unset** as a
pass. A smoke test that is outside the gate and skips by default is a check that cannot fail. State
plainly in T14's commit which of the two it is.

## THE THREE THINGS FROM EARLIER STEPS A SUCCESSOR MUST NOT UNDO

1. **`Chosen<T>`'s default arm carries no `value`, deliberately**
   (`packages/app-core/src/views/view-types.ts`). A pair would let a consumer read `.value` and
   ignore `.origin`, which is how ruling P24 was being violated. The obvious tidy-up restores the
   defect.
2. **`packages/app-core/src/views/transition-dialog.tsx` resolves wildcard-vs-exact by
   `find(exact) ?? find('*')`**, matching the engine and `precheck.ts`. That is **Ruling P27**,
   applied in step 12, pinned by cases 3.149–3.151. Restoring first-declaration-order kills exactly
   one test (3.149). Plan 8 authors workflow defs constantly and will meet this resolution; do not
   "simplify" it back.
3. **The six `ServingGapError` refusals in `packages/app-core/src/online/` are the point, not a
   shortfall.** Each is cross-checked in `apps/server/test/integration/client-contract.test.ts` and
   goes RED the day its route serves the field. **Do not weaken one to make a Plan 8 view light up.**

## RECORDED, NOT FIXED — carried into step 13 with owners, from step 12

- **`registerAttachmentRoutes` is never called** (`routes/attachments.ts:211` is its only appearance
  in `src/`), so the `attachments` table can never gain a row and `image-embed-gate` refuses every
  embedded image: correct about the rule, useless as a product. **Owner: Plan 11's deployment work**,
  which owns the boot path, the `start` script and the deployment target.
- **`.env.example` carries a stale `S3_*` placeholder block** predating T8's `OBJECT_STORE_*`
  variables. **Owner: Plan 11's deployment hardening.**
- **`comparableHeaders` is defined locally in ELEVEN server test files**, all byte-identical.
  **Owner: a later test-helper consolidation.**
- **`schema.test.ts` carries two "CURRENT BEHAVIOUR pending Task 5" cases about paste-rule
  autoformatting that Plan 7 Task 5's text never covers.** **Owner: plan author.**

## IN FLIGHT

**Nothing.** The branch carries one commit: the Plan 7 ledger promotion plus this handoff.

## RULINGS OPEN

**None blocking step 13.** P25 taken (capped at `getBoard`). **P27 taken and applied** in step 12.
P26 exists as a number and subject with no text on `main` — noted, not load-bearing here.

## METHOD FOR THIS STEP — the cost ruling, applied

- **One fan-out for the plan**: the adaptation map, **one sonnet agent** (pre-flight is retired).
- **Per task: implementer → reviewer.** Fix round only on an Important or worse; scoped re-review
  only if the fix over-reached its scope. **HARD CAP 6 subagents per task.**
- **Final whole-branch review: ONE opus reviewer.** No lens bank, no refuters, no triage stage.
- **Fable is not dispatched, with no exception clause.** Sonnet is the default, opus the exception —
  except the four tasks priced opus above.
- **Batch on the plan's own seams**, with a handoff refresh at each boundary:
  **A: T1–T4** (pure core + gateway) · **B: T5–T8** (canvas → validation) ·
  **C: T9–T12** (publish → admin) · **D: T13–T15** (web wiring, smoke, catalogue).
- Expect escapes at the last gate that the removed machinery used to catch. **Record each instance
  in the coordination doc** for when the trade is next reviewed; do not re-open the trade.

## VERIFICATION RULES THAT BIND EVERY CLAIM IN THIS STEP

- **`grep` through this shell returns SILENT WRONG ANSWERS.** Measured at this base: `grep -c '^#'`
  on a markdown file that opens with `# Workflow Builder` returned **empty**, and
  `grep -n '^### Task'` on a file with fifteen such headings returned **nothing**. The same queries
  through `rtk proxy grep` returned 35 and all fifteen headings. **Every absence-shaped claim in
  this step must run through `rtk proxy` and print a positive control from the same run.**
- **The gate's per-package test counts are COLLAPSED by the proxy.** `pnpm turbo run build test
  typecheck` printed exactly one `Tests N passed` line (server) for a run reporting 24/24 successful.
  The exit code and task count survive; **the composition does not.** Use `rtk proxy pnpm turbo run
  …` when the per-package delta is the thing being claimed.
- **A cross-package mutation under bare `vitest` tests the stale `dist`.** The resolving property is
  **import style**: `../src/*.js` catches its mutation; `@gisik-nokma/domain` by package name
  resolves through `./dist`. Use `pnpm turbo run test` or rebuild explicitly — **and rebuild again
  after restoring**, or you leave a mutated dist for the next agent. Plan 8 imports
  `validateWorkflowDef` and `adviseWorkflowDef` from `@gisik-nokma/domain` **by package name in
  every task**, so this will come up constantly.
- **Every mutation kept should fail specifically enough to identify its own site.** A survivor with
  no explanation is either an unconstrained path or a mutation that never ran, and the second is the
  damaging one: it condemns a check that is fine.
- **"X appears nowhere" needs file-by-file enumeration or a second sweep, and every null prints a
  positive control from the same run.**
- **A TZ loop around a TZ-invariant function is a check that cannot fail wearing the costume of the
  rule that forbids them.** Before wrapping a TZ loop around anything, name the local-time accessor
  (`getDate`, `getHours`, `toLocaleString`, …) whose behaviour the loop is supposed to expose; if
  there isn't one, the loop proves nothing.
- **A partial-implementation marker enumerates the absences, not the partiality.**
- **The instinct to fix what you find is the one that hides compounds.** Anything outside a task's
  scope gets **recorded with a named owner**, not fixed — **and check the recorded owner still
  exists.** Step 12 twice assigned an owner to "Plan 6 Open question 13" after Plan 6 had closed.
- **Prose is not exempt from the falsifiability law, and it is the part no gate runs.** Across steps
  11 and 12, the large majority of review findings were against documents, not code.
- **Never run a state-changing git command in a shell whose cwd was set for a read.** Use `git -C`.
- Verify any file restoration with `git diff` or by reading the file — **never a shell `diff`**,
  which has returned a false "identical" on this machine, on this repo's own ledger.
