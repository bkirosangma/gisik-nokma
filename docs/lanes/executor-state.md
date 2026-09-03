# Serial executor — live state

**This file is the restart surface.** A controller that kills and relaunches the executor from its
brief recovers only what is written here. Refreshed at every task boundary.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document in this
> repo — the dispatch brief, the coordination doc's sections, the narrative parts of this file — is
> a fact about the moment it was written. Anchors in the table below were verified with
> `git branch --contains` (empty output = orphaned), never with `git cat-file`, which passes on
> reflog-only commits and hands you pre-rebase content while looking like it worked.

## WHERE I AM: **STEP 13 — Plan 8. T1-T12 DONE, gate green. Batch D (T13-T15) is the last one.**

> **BATCH B DIED MID-FLIGHT ON AN EXPIRED LOGIN (2026-09-03).** Seven of nine agents failed with
> *"Login expired · Please run /login"*: T5's fix round and both agents of T6, T7 and T8. **T5's
> implementer and reviewer completed**, and **T5's fix round had written its full work into the tree
> but died before committing** — recovered, independently verified and committed as `87ab662`.
> **The tree is clean and the suite is green at 562.** A dead fan-out leaves work in the tree, not
> just a gap in the ledger: **check `git status` before assuming a failed agent did nothing.**

**Step 12 (Plan 7 remainder) is MERGED as PR #82 → `7337357`.** Plan 7 is complete at 22/22.
**Do not reopen it.** Its eighteen ledger rows read `in-flight` on `main` after the merge; this
branch's first commit promotes them to `done`, and `check:tasks` now verifies the merge sha is an
ancestor of `origin/main`. **The repo stands at 118/177 (66.7%), independently recounted.**

Step 13 = **Plan 8**, `docs/superpowers/plans/2026-08-20-08-workflow-builder.md`, **15 tasks.**
**T1-T12 are DONE and committed.** **Only T13, T14, T15 remain**, then the final whole-branch review
(ONE opus reviewer, per the cost ruling) and the PR.
No PR is open. **Three rulings are open and NONE blocks Batch B** — see RULINGS OPEN.

**Batching:** **A: T1-T4** (done) · **B: T5-T8** (canvas → validation) · **C: T9-T12** (publish →
admin) · **D: T13-T15** (web, smoke, catalogue). Every fact those batches need is recorded in THIS
file — a restarted executor should rebuild its dispatches from here, not hunt for scratchpad scripts,
which do not survive a restart.

**A PROCESS ERROR MADE ONCE THIS STEP — DO NOT REPEAT IT.** I started the boundary gate while a
reviewer was still planting mutations. **Concurrent mutation and verification corrupts both** — a
false red for the gate, disturbed measurements for the reviewer. Killed it; tree and `dist` verified
clean afterwards. **Require a clean tree AND zero running agents before any gate run.**

## Live anchors — 2026-09-03, step 13 opening

| Anchor | Value | How verified |
|---|---|---|
| **Branch** | **`exec/13-plan8-workflow-builder`**, cut from `origin/main` `7337357`. | `git rev-parse --abbrev-ref HEAD` |
| **Base** | `origin/main` = `73373579b906a18e3d319363a8eb3685b076eb50` | `git rev-parse origin/main`, fetched |
| **Ahead-count** | **Not written here on purpose. Run `git rev-list --count origin/main..HEAD`.** A count taken while writing the commit that records it is *always* short by one and always looks right to its author. | — |
| **Gate at branch HEAD (Batch C closed)** | **exit 0 · 24/24 tasks · 0 cached · Node v22.22.2 · 2445 tests.** domain 335 · rule-engine 280 · server 857 · **app-core 687** · editor 178 · web 69 · ui 31 · sync-client 8. **The branch adds +213 over the base, ALL in app-core** (474 → 687): Batch A +69, Batch B +63, Batch C +81. | run by the executor with `--force` on a clean tree with **no agents running**, through `rtk proxy`; Node printed into the same log |
| Gate at the Batch A boundary | exit 0 · 24/24 · 0 cached · 2301 tests; app-core 543. Batch A's own split, measured by excluding each task's test file rather than inferred: **T1-T3 = 58, T4 = 11.** | same method |
| Gate at the base `7337357`, for the delta | exit 0 · 24/24 · 0 cached · **2232 tests**; app-core 474, all others as above. | measured at branch creation, on the second (unproxied) attempt — the first was proxy-collapsed to one package and its composition was unusable |
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

**3. T4's gateway — MEASURED, and the answer is the opposite of the feared one. ALL SEVEN
OPERATIONS ARE ALREADY SERVED BY A REGISTERED ROUTE.**

`apps/server/src/routes/builder-reads.ts` exists, and `registerBuilderReadRoutes` is **called** at
`apps/server/src/app.ts:253` — not merely defined. It registers exactly Plan 8's gateway surface:

| Gateway operation | Route | builder-reads.ts |
|---|---|---|
| `listWorkflows` | `/v1/workspaces/:workspaceId/workflows` | 482 |
| `getWorkflow` | `/v1/workspaces/:workspaceId/workflows/:workflowId` | 500 |
| `listTicketTypes` | `/v1/workspaces/:workspaceId/ticket-types` | 531 |
| `listMembers` | `/v1/workspaces/:workspaceId/members` | 547 |
| `getStateOccupancy` | `/v1/workspaces/:workspaceId/workflows/:workflowId/state-occupancy` | 580 |
| `getTypeWorkflowPopulation` | `/v1/workspaces/:workspaceId/ticket-types/:typeId/population` | 602 |
| `migrateTypeToWorkflow` | `/v1/workspaces/:workspaceId/ticket-types/:typeId/migrate` | 693 |

`submit` rides `registerEventRoutes`, called at `app.ts:204`. **So Plan 8's gateway is NOT a mocked
contract excusing a server that does not exist** — the read surface landed ahead of it.

**Two consequences, and the second is a live correction to the plan.**

- **The plan's own assumption 3 is now stale.** It calls the migrate endpoint *"unowned server
  work — see Open question 13"* and assumes the path
  `POST /v1/workspaces/:workspaceId/ticket-types/:typeId/migrate-workflow`. **The real path is
  `…/:typeId/migrate`** and the endpoint is built. T4 and T13 must consume the real path; an
  implementer transcribing the plan's assumed path would write an adapter that 404s, and no
  app-core test would notice because the fake answers instead.
- The fake stays justified for tasks 5–12 — but T13's adapter is now checkable against a real route
  rather than a promise, and **T4's docblocks must not claim any of these is unserved.**

**The sweep that found this failed its own control first, and the correction is the transferable
part.** The pattern `export function register[A-Za-z]*Routes` returned 12 registrars and **omitted
`registerAttachmentRoutes`, which is known to exist** — because that one is declared
`export **async** function`. Twelve results looked like a complete enumeration. Re-run as
`export (async )?function …` it returns **13**, and the one registrar with no call site is
`registerAttachmentRoutes` — which independently re-confirms step 12's finding. **An over-specific
sweep returns a well-formed wrong answer, and the only thing that exposed it was knowing one row
that had to be in the output.**

**The original hazard, kept because it still binds the shape of T4:** T4
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

**3b. PLAN 8 COVERS ONE OF THE TWO ADVISORY CODES THAT SHIP, AND ITS OWN CATALOGUE TEXT SAYS SO.**

Measured with a positive control in the same run: **`rule-bypassable` appears 0 times in Plan 8**,
while **`rdu-bypassable` appears 17 times in the same file**, and
`packages/domain/src/advise-workflow.ts` demonstrably emits **both** codes. Plan 8's text predates
the F5 amendment commit `c7fef4b` (*"Every guard now says when an arrow goes around it, and the
arrow that carries its own guard says nothing"*), which is the commit that added `rule-bypassable`.
The amendment was pulled forward as its own PR precisely because no task absorbed it — and the
consequence nobody wrote down is that **the plan that consumes the advisory tier still describes the
one-code version of it.**

The code half is harmless: the advisory section is fed by `adviseWorkflowDef` and anchored through
the same widened `anchorIssues`, so a `rule-bypassable` advisory **renders correctly today with no
change**. Two things are not harmless:

- **Task 8's advisory coverage table has one row (A1, `rdu-bypassable`).** Nothing exercises the
  second code, so the claim "the advisory tier is covered" would hold for half the tier. Given the
  plan's own standard — *"Without the pair, 'advisories do not gate publish' is a convention rather
  than a guarantee"* — the same argument applies to the second code.
- **Task 15's `Features.md` text is dictated verbatim by the plan and says the advisory section
  "carries `rdu-bypassable`"**, naming one code where two ship. Transcribed faithfully, that ships a
  false catalogue claim, in the document whose whole purpose is describing reality.

**Conservative default taken, per the coordination doc's ruling protocol** (take the conservative
option, record it in the same change set, notify, continue — never block): **cover both codes and
correct the one catalogue sentence.** This widens Task 8 by one test and edits one dictated
sentence in Task 15; it does not touch `packages/domain`, whose COVER semantics are settled and must
not be reopened. Recorded here rather than fixed on the spot because the tasks that own it have not
run yet — **this is a note to T8 and T15, not a licence for any other task to touch the tier.**

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
- *(raised in step 13, not carried from step 12.)* **`packages/app-core/test/helpers/fake-data-source.ts`
  validates nothing.** Its `ingest` pushes to
  an array and runs no schema check, so it is the seam through which the `toStateId` payload drift
  and the non-ULID seed `actorId`s pass silently (coordination doc §"The validating fake", 2802–2825).
  It is the sibling of the seam Plan 8 T4 hardened (`createFakeGateway`), and T4 does not touch it.
  **The doc's own assignment — "Owner: Lane 4" at line 2825 — names an owner that no longer exists.**
  (The review that raised this cited 2826; that line is blank. Measured: 2825, and it is the only
  `Owner: Lane 4` in the file — the other `Owner: Lane` is Lane 2 / Plan 4 at 2590.)
  Lane 4's own file opens *"execution state at fold-back to serial … written 2026-08-31 when Wave 1
  folded back into serial execution"*, and the last mention of the lane anywhere in the coordination
  doc is line 4001 of 6169 — a back-reference to a dependency version it shipped, inside a 2026-08-31
  section — with roughly 2,100 lines of later material naming it nowhere. Two sweeps found no
  successor: succession vocabulary (`successor`, `inherits`, `picks up`, `passes to`, `reassign`,
  `carried into`, `hands off`) and the item's own vocabulary (`fake-data-source`, `validating fake`,
  `app-core/test/helpers`), each run through `rtk proxy` with a positive control from the same run.
  Lane 4's `lane4-periphery-state.md` §6 "Open claims on other plans" does not carry this item either
  — it carries only the `seed.ts` non-ULID half, **and that bullet names no owner at all**, so it is
  orphaned by the same fold-back and needs one too. **Owner: the serial executor chain**, recorded
  here because this file is the surface a task boundary actually reads. **Do not re-assign to Plan 6**,
  which created the file and has closed: measured in `task-ledger.tsv`, all eighteen `06` rows read
  `done` with a merge sha, against a positive control of fifteen `08` rows reading `todo` in the same
  run. (`executor-state.md`'s own lesson list says step 12 twice mis-assigned work to Plan 6 after it
  closed; that aside is what prompted the check, not what settles it.)

## BATCH A — T1, T2, T3, T4. All committed. Gate green at HEAD.

| Task | Result |
|---|---|
| **T1** draft store + layered auto-layout | **DONE.** One Important: **the copy-on-write immutability the plan's own header names was pinned by NOTHING** — mutating `renameState` to assign in place left all 497 app-core tests green and `tsc` silent. The implementer's own commit title records the sequel: *"the test I wrote to pin it passed on mutating code twice before it worked."* The reviewer also reported a genuine **survivor** (dropping the dangling-marker guard in `layoutDraft` kills nothing) and — this is the part that matters — **stated in the same breath that the mutation demonstrably ran**, which is the distinction between an unconstrained path and a mutation that never executed. Only the second condemns a check that is fine. |
| **T2** summaries, field choices, per-code anchoring | **DONE.** Two Important: `BUILTIN_FIELD_CHOICES` was missing `startDate` against domain's own `BUILTIN_FIELD_IDS`, and a `duplicate-transition` anchor queue whose fixture could not distinguish one-anchor-per-repeat from the correct grouping — **the reviewer reported that mutation as a non-site-identifying survivor rather than a pass**, and the fix round replaced the fixture. Anchoring was separately verified order-independent by reversing `validateWorkflowDef`'s output and re-running. |
| **T3** template gallery | **DONE, and it did not fall into the trap.** It imported `SIMPLE_KANBAN_TEMPLATE` from `packages/domain/src/simple-kanban.ts` and created only the genuinely-absent `errand-with-waits.ts`. **It also found a real conflict nobody had ruled** — see below. One **Critical**, and it was against T3's own ruling-request prose. |
| **T4** gateway, validating fake, event builders | **DONE.** Nine mutations run, **every one site-identifying**. One Important, again against prose: the commit's owner-verification claim for a recorded item was false in both its parts. |

**The through-line of Batch A: eight of the ten findings were against PROSE, not code** — false owner
verifications, a present-tense claim the same commit falsified, an incomplete absence enumeration, and
arithmetic that did not close. **The tests, where mutation-proved, held.** That is the same
distribution steps 11 and 12 produced, and it is the argument for keeping the reviewer stage at the
lowered floors: the gate does not run prose.

### T3 found a conflict that no plan had ruled, and correctly refused to resolve it

`ERRAND_WITH_WAITS_TEMPLATE` is pinned by Plan 11's `checkErrandTemplate` oracle and its own docblock
(*"Edit this only with that check green"*). It trips **`rule-bypassable` twice**: `require-comment`
guards `in-progress → waiting`, while `later → waiting` and `next → waiting` enter the same state
carrying no such rule — and `later → waiting` **must stay rule-free**, because it is one of the seed's
pinned one-hop paths. Task 3's own prose asserts the opposite invariant twice: *"a shipped template
that greets the author with a warning is a shipped template that is wrong."* **Both cannot hold.**

T3 took the conservative path: it recorded the **actual** advisory output in `templates.test.ts`
rather than asserting the stale "warns about nothing" claim for that one template (the other two
still assert clean), touched neither the template nor the check, and filed a ruling request.
**Recorded as an open ruling — do not let a later task resolve it by fixing the template or
weakening the check.**

### The Critical was an overclaim inside the ruling request itself, and the fix needed two commits

T3's ruling request titled itself *"unowned by any open plan"* and asserted it had **verified** Plan 2
does not claim the check. Its reviewer refuted this: the **F5 ruling at coordination lines 512 and 521
designed `rule-bypassable` into existence** (*"adviseWorkflowDef emits a `rule-bypassable`-style
advisory for any guarded target also reachable by a lower-guard edge, for every rule kind"*). The
heading now reads *"Plan 2's own ruling designed the check but did not settle this shape"*, which is
the honest narrowing.

**The fix round then needed a SECOND commit (`bdcb5a6`) to withdraw the claim properly** — the first
correction was itself incomplete. That is this series' most reliably recurring pattern, now observed
again on this branch, and it is the whole argument for reviewing a fix round rather than trusting it.

### T4's reviewer compared the fake against the REAL door, and the fake's absence list was short

The coordination doc's Lane 3 ruling (*"the validating fake"*, ~lines 2806-2825) is **not in Plan 8's
own Task 4 text**; it was injected into the dispatch and implemented — `createFakeGateway` now runs
every submitted event through the shipped `submittedEventSchema`, proven by two mutations (disabling
validation, and recording an invalid envelope as submitted) that each redden exactly one test.

But the fake's docblock enumerated its divergences from the real door **incompletely**. A probe that
ran the same events through both found two more: **entity-kind mismatch** (`parseEvent` refuses a
`workflow.defined` filed against a ticket; the fake commits it) and **duplicate event id** (the real
door answers `{status:'invalid', code:'duplicate-event-id'}`; the fake commits it twice, returning
the same `eventId` with `seq` 1 then 2). **An absence enumeration that is short is exactly as
misleading as a partiality marker**, which is why the rule says enumerate rather than say "partial".

### The test-delta arithmetic did not close, and the shape of the error is worth keeping

T4's commit claimed app-core `474 → 543` with *"Tasks 1-3 already added 69 before this one"* and
*"this task added 11"*. **474 + 69 = 543 leaves nothing for the 11.** The 69 was the whole-workspace
delta (2301 − 2232) re-used as the Tasks 1-3 figure, double-counting T4's own contribution.
Re-measured by excluding the task's own test file: **Tasks 1-3 added 58, T4 added 11, 58 + 11 = 69.**
A decomposition that reconciles at the total and not at the parts reads as verified — the total was
right, which is what made it persuasive.

## BATCH B — T5, T6, T7, T8. All committed. Gate green at HEAD.

| Task | Result |
|---|---|
| **T5** React Flow canvas | **DONE**, and it settled the harness question first, as instructed. Two Important, both **false claims in prose**, and its fix round **died mid-write on the expired login** — recovered and committed as `87ab662` after independent verification. See the harness findings below. |
| **T6** select-to-edit inspectors | **DONE.** One Important: **the coordination doc's own test-count arithmetic was self-refuting** (`573 → 578` with a claim no pre-existing test changed status). T6 was told to measure the connect gesture and **did** — result below. |
| **T7** rule editors | **DONE.** One Important, and it is a **finding class worth naming: every conditional affordance was asserted present-when-expected and never absent-when-not**, so none could detect OVER-firing. Load-bearing for the require-field unknown-field warning, which is the only enforcement of design decision 3 anywhere in the product. The reviewer proved it by running both directions of each mutation: `isEmpty = false` (helper never shown) reddens; **`isEmpty = true` (helper ALWAYS shown) does not.** |
| **T8** live validation *(opus/opus)* | **DONE, verdict SHIP — 27 executed mutations, the most thorough review on this branch.** All eleven issue codes reddened individually and by name; **both** advisory codes anchored; merging the two tiers reddens five tests; truncating the advisory list reddens one. It also mutated `packages/domain/src/validate-workflow.ts` itself to confirm the app-core tests genuinely reach the real validator, and mutated `packages/ui/src/ui.css` to confirm the token-discipline check catches a raw hex. |

### The jsdom harness, now measured in three parts rather than assumed

1. **Rendering is real.** Mutating `state-node.tsx`'s `{data.name}` to a literal reddens canvas tests
   by name. The canvas assertions in Tasks 5-10 are not theatre.
2. **`setup.ts`'s `Object.defineProperty` wrapper is load-bearing for GESTURES, not clicks.** Without
   it d3-drag's `nodrag(event.view)` throws on user-event's `view: null`, **jsdom's own dispatch
   SWALLOWS the TypeError**, and the gesture silently no-ops while 561 tests stay green. The drag test
   added in T5's fix round is the only assertion in app-core that reddens when the wrapper goes —
   **verified independently by me: exactly 1 of 11 canvas tests fails, and it is the drag test.**
3. **A connect gesture CANNOT be driven to completion in jsdom, and T6 measured it rather than
   assuming.** The test is named for what it establishes, and its planted defect
   (`onConnectStart` firing `addTransition`) reddens it. **The mapping layer
   (`connectionToTransition`) carries the property instead.** Recorded in the coordination doc under
   `## Plan 8 execution consequences (2026-09-03) — the connect gesture, measured and closed`
   (~line 6171) so Tasks 9-10 read it rather than re-deriving it.
4. **jsdom has no layout engine**: every `getBoundingClientRect` is 0x0 and a drag lands a **zero
   delta**. A gesture test must assert the action firing, **never a coordinate**.

### A stale citation I wrote into two dispatch briefs, caught by T8's reviewer

My Batch B and C briefs cited the errand-template ruling request as *"the coordination doc's Plan 8
execution consequences, entry 5"*. **That was true when T3 filed it and false by the time I wrote
it**: T3's own fix round (`48c3655`) moved the entry to its **own top-level heading**,
`## RULING REQUEST — Plan 8 Task 3's frozen errand template trips rule-bypassable` (~line 6126). Worse,
`## Plan 8 execution consequences` (~line 6171) now exists as a **different** section — T6's
connect-gesture record — so the stale pointer resolves to a real heading that is not the subject.
**A pointer that lands on the wrong real section is worse than one that lands nowhere**, because
nothing about it looks broken. Corrected in the Batch C brief; `batch-d` never carried it.

## BATCH C — T9, T10, T11, T12. All committed.

| Task | Result |
|---|---|
| **T9** publish flow *(opus/opus)* | **DONE.** Two Important, and **both were tests named for properties their own fixtures could not decide.** (1) `bumps from the PUBLISHED base` could not tell the base from the draft: `draftFromPublished` copies `published.version` into **both** `def.version` and `base.version`, so for every draft that file can build, `base.version + 1` and `def.version + 1` are the same number. It ruled out a hard-coded 1 and nothing else. (2) The occupancy-failure test asserted only the **first** half of its named property — it stopped at `toBeDisabled()` and never picked a target, never re-enabled, never published. **The mutation "make a failed count block publishing" SURVIVED**, which is exactly the missing half. |
| **T10** the three screens | **DONE.** Two Important, both about error handling the plan never specified: `Promise.all([...]).catch()` collapsed a **documented-normal** guest roster refusal into a full-screen fatal error — making the empty-roster degradation path unreachable through the screen and throwing away a successfully-loaded `ticketTypes` — and `WorkflowListScreen` had **no `.catch()` at all**, so a rejection left it on "Loading workflows…" forever. |
| **T11** ticket types *(opus/opus)* | **DONE — one CRITICAL, and it is the sharpest finding of the step.** See below. It also corrected the coordination doc's false "Done", and **corrected an absence claim of mine in the process.** |
| **T12** admin gating *(opus/opus)* | **DONE, verdict ship on 16 mutations — but its Important is a lesson about enumeration.** The gate enumeration the commit was built on **stopped at the builder screen**. The ticket-type editor — the other half of the gate, and the half that owns field-schema and rank authoring — got no control enumeration and no button sweep, so **three of its five non-author gates were pinned by nothing and all three mutations survived the full 211-test suite.** Fixed in `c5f7c60`. |

### T11's Critical: the move gate asked the wrong question, and the wrong question is answerable

`ticket-type-editor-screen.tsx:249` gated an irreversible bulk migration on
**`save.phase !== 'saved'`** — *"has this form ever been saved?"* — rather than on whether the
**selected binding matches the saved one**. Both questions return "yes, allowed" in the common case,
which is why it read as correct. **After saving a re-bind, an admin can re-point the combobox again
and fire the migration at a workflow the tickets were never bound to** — an irreversible bulk
operation aimed by a stale answer to a question nobody meant to ask. Fixed in `7d993f2`.

A second Important on the same screen shares the shape: the completed-move sentence **re-read the
live combobox** instead of the workflow the migration actually targeted, so changing the binding
afterwards silently rewrote a statement about a past action into a false one. The `migrated` payload
carried the count but not the destination.

**The transferable form: a gate that asks a question whose usual answer coincides with the right
one.** It is not detectable by reading the gate — only by asking what it would do when the two
answers diverge.

### T11 corrected an absence claim I wrote, and the correction is the "nobody holds the moment" rule

My Batch C brief told T11 that a repo-wide sweep returned **zero files** for six names, including
`migrateTypeToWorkflow`. **That was measured before Task 4 ran and carried forward unchanged after
it.** At the sha T11 measured, `migrateTypeToWorkflow` returned **three** files — `gateway.ts`,
`fake-gateway.ts` and `events.test.ts` — because **Task 4 had already landed the gateway method and
its fake.** Re-verified by me at HEAD: **five** files now, against a control of 34 for
`adviseWorkflowDef`.

**The enumeration was true when I made it and false when I used it, and nothing about its form said
so.** What was actually missing was every *consumer* of that method, not the method. T11 put the
correction in the coordination doc rather than quietly dropping the row, which is the right call:
the corrected line now names its own controls and states which row was stale.

**Rule, restated because I broke it while quoting it: an absence sweep is a fact about a moment, and
a brief that carries one across a task boundary must re-measure it or date it.**

## TWO FINDINGS FROM THE ADAPTATION MAP THAT REACH BEYOND ONE TASK

### A. RULING REQUESTED — T13's adapter cannot be written as scoped. Four operations have a live
### route and no seam to reach it through.

Plan 8 amendment 10 says the builder consumes `WorkflowAuthoringGateway` and **`apps/web` implements
it over Plan 6's `DataSource`**. Measured against `packages/app-core/src/data-source.ts:125-139`:

| Gateway operation | `DataSourceQuery` member | Server route |
|---|---|---|
| `getWorkflow` | `getWorkflowDef(workspaceId, workflowId, version?)` | served |
| `listTicketTypes` | `getTicketTypes(workspaceId)` | served |
| `listMembers` | `getMembers(workspaceId)` — **returns `Actor[]`, not `WorkspaceMember[]`** | served |
| `submit` | `ingest(events)` | served |
| **`listWorkflows`** | **absent** | `/v1/workspaces/:workspaceId/workflows` — LIVE |
| **`getStateOccupancy`** | **absent** | `…/workflows/:workflowId/state-occupancy` — LIVE |
| **`getTypeWorkflowPopulation`** | **absent** | `…/ticket-types/:typeId/population` — LIVE |
| **`migrateTypeToWorkflow`** | **absent** | `…/ticket-types/:typeId/migrate` — LIVE |

**Four of eight operations have a real, registered, working HTTP route and no `DataSource` member to
reach them through.** This is not the usual shape of this series' failure — the server is *ahead*,
not behind. T13 as scoped ("an adapter over `DataSource`") is therefore **not writable** without one
of:

- **(a)** extend `packages/app-core/src/data-source.ts` with the four members — a **cross-plan touch**
  of Plan 6's file, and it widens an interface every existing `DataSource` implementation must then
  satisfy (the online one, the fake, and Plan 10's replica);
- **(b)** have the `apps/web` adapter call the four routes through the existing `online/http` client
  directly, leaving `DataSource` untouched. Amendment 10's rule is that **views** never speak HTTP;
  the adapter is not a view, and the view still sees only the gateway. Narrower, and it does not
  force Plan 10's replica to grow four members it has no offline answer for;
- **(c)** defer the four to a later plan and have T4's interface carry an honest refusal for them —
  but three of the four are load-bearing for Tasks 9 and 11, which are *in this plan*.

**Conservative default if no ruling arrives before Batch D: (b)** — it is the narrowest change, it
touches no other plan's file, and it cannot break an existing `DataSource` implementor. Recorded
here so the choice is visible rather than made silently inside T13. **`getMembers` returning `Actor[]`
where the gateway wants `WorkspaceMember[]` is a second, smaller reconciliation T13 owes regardless
of which option wins.**

### B. THE COORDINATION DOC CARRIES A FALSE "Done" ABOUT THIS VERY PLAN, AND IT IS THE DANGEROUS KIND

Coordination doc **line 216** reads: *"~~Plan 8 — the divergence-notice component.~~ **Done** — it
was already complete when this line was written; the agent that appeared to stall mid-insert had
finished. **Verified against the code rather than the note**: the copy table, the population read
with its honest-degradation states, the helper functions, the JSX, and the tests are all present,
including 'Leave them on …' as an affirmative button beside 'Move them to …'."*

**It is false.** Measured two ways, with positive controls in the same run:

- `git log --all --oneline -- packages/app-core/src/workflow-builder` is **empty** — no commit on any
  branch has ever touched that directory. Control: the same command against
  `packages/app-core/src/views` returns commits.
- A repo-wide sweep of the artefacts that line enumerates returns **zero files** for `Leave them on`,
  `Move them to`, `WorkflowRebindDialog`, `rankImplications`, `migrateTypeToWorkflow` and
  `TicketTypeEditorScreen`. Controls in the same run: `transitionOptions` → 6 files,
  `adviseWorkflowDef` → 6 files.

**What makes it dangerous is not that it is wrong but how it is wrong.** It does not merely assert
completion — it asserts completion *and claims to have verified against the code rather than the
note*, then enumerates five specific artefacts. That is the exact rhetorical shape a reader uses to
decide a claim is trustworthy, which is why a reader who hits it would skip Task 11's divergence
work entirely. **This is the "a pointer from a correct document to a stale one reverses" lesson in
its most persuasive costume: a stale claim wearing the vocabulary of verification.**

**Action: Task 11 is built in full, as if the line did not exist, and the line is corrected in the
same change set as Task 11.** Not corrected earlier, because the honest correction is *"absent, and
here is the commit that supplies it"*, which cannot be written until the commit exists.

## IN FLIGHT

**Nothing.** Batch A is closed, the tree is clean, and the gate is green at HEAD.

## RULINGS — P28 taken, line 216 closed by T11, ONE still open and it blocks nothing

1. ~~**The T13 `DataSource` seam**~~ — **RULED. P28 (owner-approved, 2026-09-03), and it took the
   executor's recommended option (b).** The `apps/web` `WorkflowAuthoringGateway` adapter calls
   `listWorkflows`, `getStateOccupancy`, `getTypeWorkflowPopulation` and `migrateTypeToWorkflow`
   **directly over HTTP, bypassing `DataSource`**. The ruling's reasoning, recorded because it
   settles a rule that will be read again: **amendment 10's "no HTTP in views" binds VIEWS, not the
   gateway adapter** — the view still only ever sees the gateway interface, unchanged. `DataSource`
   stays untouched, so **Plan 10's offline replica is not forced to answer an offline-migration or
   offline-occupancy question before that plan exists.** The `getMembers` `Actor[]` →
   `WorkspaceMember[]` reconciliation is part of the same T13 work. Full text in
   `docs/lanes/controller-state.md` as P28 — **cite that, not the message that carried it.**
2. **The frozen errand template trips `rule-bypassable` twice** — filed by T3 in the coordination
   doc. Fixing the template violates Plan 11's `checkErrandTemplate` oracle pin; silencing the check
   means editing a module Plan 2's own F5 ruling designed. **No later task may resolve this by
   fixing the template or weakening the check.**
3. ~~**Coordination doc line 216's false "Done" on Task 11**~~ — **CLOSED by T11's own commit
   (`9bf4cbe`)**, which supplies the component the line falsely claimed existed and rewrites the line
   to say so. The corrected line names its controls **before** the run and states which row of the
   inherited absence claim was stale. Nothing further is owed.

P25 taken (capped at `getBoard`). **P27 taken and applied** in step 12. P26 is a number with no text
on `main` — noted, not load-bearing here.

## THE FIX-ROUND PATTERN IS NOT OCCASIONAL ON THIS BRANCH, IT IS THE NORM

**Three of Batch A's four fix rounds needed a SECOND commit to correct an error the fix itself
introduced**, and the titles say so in the authors' own words:

- `9154e67` — *"I fixed the false-present-tense comment I happened to be reading, then found the same
  defect in the file I had not opened — and my first correction to it was itself false"*
- `bdcb5a6` — *"withdraw the false 'unowned/unverified' claim on rule-bypassable"*, after `48c3655`
  had already tried to soften the same overclaim
- `460ebdc` — *"Second commit of the same fix round: the fragment my own edit left, and the one fact
  in it I had not measured"*, after `340192a`

Step 12 recorded six instances; this is three more in four tasks. **It is the argument for reviewing
a fix round rather than trusting it, and for never citing a fix round's own summary as evidence.**

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
