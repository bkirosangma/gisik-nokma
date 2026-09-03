# Cross-lane controller — live state

**This file is the controller's restart surface.** A controller relaunched from
`gisik-nokma-lanes/dispatch-controller-serial.md` recovers only what is written here. Refreshed at every
decision boundary. *(The brief was renamed 2026-09-01: `dispatch-main-controller.md` is the dead
parallel-wave one. The "READ FIRST" section below still applies to anyone holding the old file.)*

> **Shas in narrative prose below are facts about when they were written.** Verify anchors with
> `git branch --contains` — empty output means orphaned. `git cat-file` passes on reflog-only commits and
> will lie. This file lives on `main` deliberately: an earlier handoff was tracked, pushed, and stranded on
> a branch that had already merged, so a restart read a copy 70 lines out of date. **Once the branch
> carrying a handoff merges, the next update branches off `main`.**

## RULING P29 (2026-09-03, owner-approved) — the frozen errand-with-waits template keeps its two advisories

**Escalated by the executor at step 13's close** (`exec/13-plan8-workflow-builder`, PR #85 already open,
non-blocking — step 14 was not waiting on it). Owner explicitly asked for the consequences of the accepted
option before ruling, so they are recorded alongside it.

**THE TENSION.** `ERRAND_WITH_WAITS_TEMPLATE` — the real Convenience Corner shop's workflow, imported by
identity for Plan 11's dogfooding, never re-declared — trips the `rule-bypassable` advisory **twice** once
Plan 8's Task 8 covers that code (Ruling P28's FYI item 3). Two paths, both genuinely blocked:
- **Fixing the template** violates Plan 11's `checkErrandTemplate` oracle, which pins this exact shape as
  the ground truth for dogfooding fidelity.
- **Silencing the check** means editing `adviseWorkflowDef` — the exact module Plan 2's F5 ruling built to
  catch this class of issue, for every workflow, not just this one.

**RULING: Option 3 — accept both trips as known and expected. Touch neither `checkErrandTemplate` nor
`adviseWorkflowDef`.**

**Why, in order of weight:**
1. **`rule-bypassable` is advisory-only, never blocking** — Task 8's own title separates the "issues" tier
   (blocks publish) from the "advisory" tier (does not). This costs nothing functionally; the workflow
   works regardless.
2. **It is the philosophically consistent answer for THIS product specifically.** Plan 11 Task 8's own
   framing is *"frozen record in, events out, nothing invented."* The template exists to digitize the real
   shop's actual workflow, warts included. Sanitizing it to clear an advisory panel would mean **inventing
   a cleaner reality than the one being recorded** — the exact thing "nothing invented" forbids, and a
   direct contradiction of the product's own founding principle (a board that cannot lie).
3. **Scoped, not a precedent.** The acceptance names this one frozen, identity-imported template
   specifically — it does not weaken `rule-bypassable` for any workflow a real user authors fresh.

**Cost, stated honestly:** whoever opens the Workflow Builder on this workflow sees two advisories that
never auto-clear on the frozen template/gallery entry. Mitigated if — **to be confirmed by the
executor** — the dogfooding seed creates an independently-editable live `WorkflowDef` row rather than
re-deriving from the frozen constant each time, in which case the shop's own admin can fix their live copy
through the builder UI without touching the template or the oracle at all, and the permanent cost shrinks
to "the gallery/seed source stays as originally captured," not "every real user is stuck."

**Action required, not a code change:** a one-line rationale near the template's declaration (and in
`Features.md`/`test-cases` if there's a natural home) stating the two advisories are expected and why, so
a future session doesn't mistake them for a bug and try to "fix" the frozen template.

## RULING P28 (2026-09-03, owner-approved) — Plan 8's gateway adapter calls HTTP directly for 4 operations

**Escalated by the executor mid-step-13** (`exec/13-plan8-workflow-builder`, Batch A running, no PR yet),
via cross-session message — non-blocking, the executor had a conservative default and kept working while
this was pending.

**THE FINDING.** Amendment 10 says `apps/web` implements `WorkflowAuthoringGateway` "over Plan 6's
`DataSource`." Measured against `packages/app-core/src/data-source.ts:125-139`: **four of the gateway's
eight operations have no `DataSourceQuery` member at all** — `listWorkflows`, `getStateOccupancy`,
`getTypeWorkflowPopulation`, `migrateTypeToWorkflow`. All four have a **live, registered** server route
(`routes/builder-reads.ts`, `registerBuilderReadRoutes` at `app.ts:253`). **This is the inverse of the
series' usual failure** — the server is ahead, and the client-side seam is missing, not the other way round.

**RULING: Option (b) — the gateway ADAPTER calls those four directly over HTTP, bypassing `DataSource`.**
Amendment 10's "no HTTP in views" rule binds **views**, not the adapter that implements the gateway — the
view still only ever sees the `WorkflowAuthoringGateway` interface, unchanged. Narrowest change: touches no
other plan's file, and does not force Plan 10's not-yet-built offline replica to invent an answer for
"what does migrating a ticket type mean with no network" before that plan exists.

**Rejected:**
- **(a) Widen `DataSource` itself** with the four members. More architecturally uniform long-term, but a
  cross-plan touch to Plan 6's already-shipped file, and it widens an interface **every** `DataSource`
  implementor must satisfy — including Plan 10's, which has no offline story for a migration or an
  occupancy count and would be forced to invent one under time pressure from an unrelated plan.
- **(c) Defer the four operations** with an honest refusal, same shape as the `ServingGapError` pattern
  used elsewhere in this series. Rejected because **three of the four are load-bearing for Tasks 9 and 11,
  in this same plan** — unlike prior deferrals (P25), which parked things genuinely out of scope, this
  would break in-plan work rather than defer future work.

**Also folded in, same T13 scope, no separate ruling needed:** reconcile `getMembers`'s `Actor[]` against
the gateway's wanted `WorkspaceMember[]`.

**Two things flagged alongside this, neither needing a ruling:**
- **The coordination doc carries a false "Done" claim about Plan 8's divergence-notice component**
  (line 216), phrased as if verified against the code and naming five artefacts — `git log --all --
  packages/app-core/src/workflow-builder` is **empty** (positive control: the same command on
  `app-core/src/views` finds commits), and a repo-wide sweep for `WorkflowRebindDialog`, `rankImplications`,
  `migrateTypeToWorkflow`, `TicketTypeEditorScreen`, and the two named button labels returns **zero** files
  (controls in the same run: `transitionOptions` and `adviseWorkflowDef` each return 6). **The dangerous
  part is the vocabulary, not the falsehood alone** — "verified against the code" plus five named artefacts
  reads as already-checked, which is exactly what makes a reader skip the task it describes as done.
  Executor is building Task 11 in full as if the line did not exist, correcting it in the same change set
  once the real commit exists — the only honest order, since "absent, and here is the commit that supplies
  it" cannot be written before that commit does.
- **Plan 8's text predates the F5 amendment**: `rule-bypassable` appears 0 times in the plan against
  `rdu-bypassable`'s 17, while `adviseWorkflowDef` ships both. Conservative default taken: cover both codes
  in T8, correct the one dictated `Features.md` sentence in T15, domain untouched.

## RULING P27 (2026-09-02/03, owner-approved) — F5 recurrence in `packages/app-core`: fix now in step 12

**Escalated by the executor mid-step-12** (`exec/12-plan7-remainder`, T16 running, no PR open yet), via a
direct cross-session message to this controller — not tmux, a different channel, and it worked. Recorded
here immediately because a ruling that lives only in a message or a pane does not survive either session's
restart (P26's own history, twice now).

**THE FINDING, proven by execution, not merely read.** `packages/app-core` held two answers to the
wildcard-vs-exact transition-rule question, and the wrong one was on the user-facing surface:

- `packages/rule-engine/src/transition.ts:91-93` (the ENGINE, authoritative) and
  `packages/app-core/src/precheck.ts:375-378` (`needsMembership`) both do `find(exact) ?? find('*')` —
  **exact wins, declaration order irrelevant.**
- `packages/app-core/src/views/transition-dialog.tsx:23-29` (`transitionOptions`) iterates
  `def.transitions` in order and keeps the **first match** — **first DECLARATION wins. Wrong.**

Proven with a temporary probe (removed, tree verified clean via `git status`, not shell `diff`): a workflow
def declaring the wildcard *before* the specific edge is a shape `adviseWorkflowDef` only warns about
("real, but not fatal"), so it publishes clean. Under it, the ENGINE resolves `(doing→done)` to
`[{kind:'require-evidence'}]` while the DIALOG resolves the same transition to `[]` — no evidence prompt
shown. **Positive control**: reversing the two declarations makes the dialog agree, which is what makes
this a genuine divergence rather than a constant. **User-visible consequence**: the ticket sheet offers a
transition with no evidence prompt, the user submits, the server refuses — reads as a product bug, not a
rule, which is the exact failure mode T13's own dispatch named as the thing to avoid.

**Why it needed a ruling rather than a silent fix**: it is a 2-line change in a package that shipped under
Plan 6 (closed at step 11), so fixing it is a scope decision, not a task detail. The reviewer's first
instinct was to record the owner as "the Plan 6/6a lane" — **the second time this branch has found a
recorded owner naming a plan that no longer exists** (the first was the `AttachmentListEntry` false
positive, corrected in the same branch). Assigning it to another dead owner would repeat the mistake the
branch keeps independently finding.

**RULING: Option (a) — fix it now, in step 12.** Match `precheck.ts`'s exact-match-wins resolution exactly
in `transitionOptions`; promote the removed probe to a **permanent** regression test in `app-core`, both
directions (wildcard-before-exact and exact-before-wildcard), so the positive control that makes this a
divergence rather than a constant stays in the suite. Recorded in the step-12 PR body as a ruling-directed
addition outside T13–T16's original scope, same shape as every other named deviation this branch has
carried. Rejected: (b) assign to Plan 8 (workflow-def semantics owner, unrun) and (c) assign to Plan 11
hardening — both park a live, proven, user-visible defect for a plan that has not started, when the fix is
cheap and the correct pattern already exists twice in the same package.

**General form, worth keeping alongside the `getBoard`/version-field lesson**: `adviseWorkflowDef`'s
wildcard-before-exact warning is real but non-fatal, which is exactly the gap that let two consumers of the
same `WorkflowDef` disagree for as long as nobody executed the shape it warns about rather than merely
reading past the warning.

## OWNER CORRECTION 2026-09-02 — magic-link sender is `contact@artsourced.in`, not `sign-in@artsourced.in`

Plan 11's Open question 13 and the coordination doc's sign-off table (line 86) both recorded
`sign-in@artsourced.in` as the owner's 2026-08-20 confirmation. **The owner corrected the local-part to
`contact@artsourced.in` on 2026-09-02** — the apex-address reasoning (sender reputation and deliverability
stay with the established zone) is unchanged, only the mailbox name. Both plan documents and
`deploy/do/app.yaml`'s `MAGIC_LINK_FROM` value are corrected in place (this PR); dev/CI's
`sign-in@gisik-nokma.local` is untouched — it never leaves Mailpit. **No code has executed against the old
value** — Plan 11 is 0/16 `done`, so this is a plan-text correction, not a rollback.

## Anchors — re-measured 2026-09-03 ~16:35 IST, at `9b70ab9` (step 13 merged)

| what | value |
|---|---|
| `main` | **`9b70ab9`** — **STEP 13 (Plan 8, all 15 tasks) MERGED, PR #85.** Ruling P28 (gateway adapter HTTP-bypass) and Ruling P29 (frozen-template advisory acceptance) both apply to this step |
| last forced gate | **`9b70ab9`** — `GATE_EXIT=0` read from `$?`, `--force` so **0 cached**, **24/24 tasks**, **2463 tests**, 52.5s, node **v22.22.2**, zero `Unsupported engine` — install-then-gate, `check:env` run as its own step first and confirmed `exit 0` before the turbo gate |
| gate composition | domain 335 · rule-engine 280 · server 857 · **app-core 687 (was 474)** · **web 87 (was 69)** · editor 178 · ui 31 · sync-client 8 = **2463** |
| corroboration | independently re-measured, not carried from the executor's report — matched the executor's own 2463 exactly, same split |
| ledger | **`CHECK_EXIT=0` · 133/177 (75.1%)** · claimed 0 · in-flight 0 · todo 44 · Plan 8 now 15/15 |
| executor | restarted immediately after the merge (fixed-point rule), context reset to ~7%. Next: **step 14 (Plan 9, calendar & notifications)** |

> ### PR #85's FIRST CI RUN WAS GENUINELY RED, AND THE EXECUTOR'S OWN REPORT SAID GREEN
> Independent CI at the exact head sha (`b6e7ea4`) failed at `check:env` — Task 14's new Playwright spec
> reads four env vars (`E2E_ADMIN_STORAGE_STATE`, `E2E_BASE_URL`, `E2E_MEMBER_STORAGE_STATE`,
> `E2E_WORKSPACE_ID`) never added to `.env.example`. The executor's gate report said exit 0. **Root cause,
> in the executor's own words: the CI gate is TWO commands** (`check:env` then the turbo build/test/typecheck
> gate), and the executor's own anchors table had carried "check:env exit 0" from branch creation, never
> re-measured after Task 14 added the reads that broke it — the fourth instance of the stale-measurement
> defect this branch has caught. **Fixed and re-verified** (pushed at `9017ebc`, PR head became `932c194`,
> independently confirmed green before merge): `check:env` now passes at 45 documented / 23 referenced.
> **Standing procedure note for this controller too: `check:env` is a separate anchors row, re-measured at
> every reported sha — the turbo composition being green is not evidence for it.**

> ### RULING P27 VERIFIED LANDED — mutation-proved, not merely claimed (carried from step 12)
> `transition-dialog.tsx`'s `transitionOptions` now matches `precheck.ts`'s exact-match-wins resolution.
> Cases 3.149–3.151 pin it in both directions; the executor reports the mutation is **site-identifying**
> (restoring the old first-declaration-wins resolution kills exactly 3.149, 1 of 20, with 3.150/3.151 still
> green) — the positive control (3.150) is what makes 3.149 a divergence test rather than proof one ordering
> happens to work.

## CARRIED FORWARD, owner Plan 11 — `registerAttachmentRoutes` is never wired into the composition root

**Found and recorded by the executor at step 12's close, not fixed** — registering routes is not Plan 7's
task text, and turning an editor plan into a deployment change is not step 12's call.

Verified with a positive control: `registerEventRoutes` resolves to a real call site at `app.ts:204`;
`registerAttachmentRoutes` appears in `src/` **only at its own definition** — nothing calls it. **The
consequence, not just the gap, is the finding**: the attachments table can never gain a row on the server
this repo actually starts, so `image-embed-gate`'s `attachment.embed-unknown` refusal branch would refuse
**every** inline image in a real deployment — correct about the rule, useless as a product. The gap itself
was already disclosed (`Features.md`, cases 9.59/9.61); the consequence was not.

**Owner: Plan 11's deployment work**, which owns the boot path and the start script. Surface this in Plan
11's dispatch — a route that exists, is tested, and is never mounted is not caught by any check this series
runs short of actually booting the server, which Plan 11 is the first plan to do.

> ### ⚠ THE FORCED-GATE PROCEDURE WAS INCOMPLETE AND IT PRODUCED A FALSE RED
> **`pnpm install --frozen-lockfile` MUST run before the gate whenever the package set may have
> changed.** Step 11 added `apps/web`, an eighth workspace package. My worktree had no
> `node_modules` for it, so the gate came back **`GATE_EXIT=1`, `Tasks: 16 successful, 24 total`,
> `Failed: @gisik-nokma/web#test`** — with `sh: vitest: command not found`, `sh: next: command not
> found`, `sh: tsc: command not found` and **`WARN Local package.json exists, but node_modules
> missing`**. After the install: **24/24, 2027 tests, exit 0.**
> **Nothing was wrong with `main`.** Same family as the `better-sqlite3` ABI false red already in this
> file — a stale worktree, not a defect. **The discriminator is the WARN line and
> `command not found`; a real failure names a test, not a missing binary.**
> **This is a hole in the written procedure, not a slip.** The loop says "forced gate under node 22"
> and never mentioned install — **a Sonnet controller following it literally would have reported
> `main` broken.** Trigger #4 sends a RED gate to Opus, so it would have escalated rather than
> mis-merged, but it would have escalated a non-event. **The procedure now reads: install, then gate.**

## STEP 13 CLOSED — Plan 8 complete, and the restart-then-verify shape caught a real red this time

82 files, +10787/−485, ~54 commits, 15/15 Plan 8 tasks. **This is the step where independently re-verifying
CI rather than trusting the executor's report actually mattered** — see the false-green box above. Gate,
ledger and test count all independently re-confirmed at `9b70ab9` before merging: 2463 tests matched
exactly, `check:tasks` and `check:env` both `exit 0`.

**Two more carried items from this step, neither fixed here:**
- **Task 14's Playwright spec is outside the gate entirely.** `turbo.json` defines no `e2e` task and
  `ci.yml` explicitly defers it as needing "a deployable stack and Playwright infra" — the spec is honest
  about what backstops it (nothing, until Plan 11 wires CI). Its env-var *reads* were still inside
  `check:env`'s reach, which is exactly what caught the gap above.
- **`registerAttachmentRoutes` is still never called** (inherited from step 12, unchanged — see below).

**Two rulings this step, both durable:** P28 (gateway adapter bypasses `DataSource` for 4 HTTP-only
operations) and P29 (the frozen errand-with-waits template keeps its two `rule-bypassable` advisories,
undocumented as of this close — the executor was asked to add the one-line rationale near the template's
declaration; **verify it landed before treating P29 as fully discharged**, since it was ruled after this
step's PR was already open).

**The ledger promotion this time arrived with rich per-task evidence already written**, unlike step 12's
placeholder-only handoff — the executor closed exactly the gap step 12's close recorded. Promotion here was
copy-and-attribute, not reconstruct-from-`Files:`-blocks.

## STEP 12 CLOSED — Plan 7 complete, and the restart-then-verify shape held under a bigger diff

81 files, +9983/−1260, 52 commits, 22/22 Plan 7 tasks. Independently verified rather than adopted: CI at
the exact head sha (`gh api …/check-runs`), a fresh `pnpm install --frozen-lockfile` + forced gate
(2232 tests, matched the executor's own count exactly), and a direct read of the merge-conflict resolution
the executor reported (`docs/lanes/task-ledger.tsv` row 06/16 — confirmed the controller's §8-refusal note
survived the rebase, not merely told so).

**Two things worth keeping from this step's own account, because they generalise:**
- **Shell `diff` reported two ledger-row versions as IDENTICAL when one was 241 characters longer** — the
  same false-identical failure this file already warns about, and it fired at the one point where believing
  it would have deleted a controller note. Caught with a Python line-compare and `cmp` (exit 1). Re-flagging
  because it keeps recurring on this machine specifically, not as a general git property.
- **The step's own defect distribution, stated because it bears on model policy**: across 18 tasks, the
  defect classes were overwhelmingly *false claims in prose* and *checks that could not fail* — in two of
  four batches, those were the ONLY classes found, and Batch A had zero implementation defects at all. The
  executor's own escalations (reviewer→opus on T10, T12, T12c, T13, T13a, T15 — beyond what the brief
  floor-listed) caught the step's most dangerous findings, including T10's byte-identity property having no
  executed mutation behind it. **Recommendation carried into Plans 8–11: escalate the reviewer wherever a
  task's point is a refusal or a disclosure, even when the brief doesn't floor-list it** — the pattern paid
  for itself twice in this step alone.

**The step-12 handoff moved the ledger to `in-flight` with placeholder notes (branch name only, no
per-task artefact), unlike step 11's rich per-task evidence.** The controller filled in the actual
artefact citations at promotion time from each task's own `Files:` block in the plan text, cross-checked
against the PR's changed-file list — same `done` definition as always, just assembled by the promoting
party this time rather than handed over pre-written. Not a defect in the handoff; recorded so a future
promotion doesn't assume the notes will always arrive populated.

## STEP 11 CLOSED — Plan 6 complete, and the executor solved a boundary I never specified

**`apps/web` is real**: Next.js 15 shell, sign-in, navigation, invite acceptance, and a Playwright
smoke **run for real (5 passed) but deliberately off the gate**. `app-core` went 130 → **471** tests.

> **THE EXECUTOR INVENTED THE RIGHT ANSWER FOR A CASE THE RULES DID NOT COVER.** It had completed 12
> tasks it could not itself mark `done` — promotion is the controller's act. Instead of leaving them
> `todo` (understating) or marking them `done` (overstepping), **it moved them to `in-flight` and wrote
> the per-task artefact evidence into each note.** So the 12 promotions arrived with their evidence
> already attached rather than reconstructed. That is the `done`/`claimed` split's logic applied one
> case further out, by the party the split exists to check. **Keep this shape.**

**T16 was promoted WITH ITS DEVIATION NAMED.** Its declared artefact `test-cases/08-web-client.md` was
**deliberately not created** — opening §8 means remapping **112+ live cross-referenced ids** against the
README's own never-renumber rule. The catalogue landed in **§3** instead (3.145–3.147 + citations +
a README correction). **The artefact rule could not decide this one**; the note carries the deviation so
the ledger does not read as if the file exists.

## RULING P25 — TAKEN 2026-09-02. Clauses 2 and 3 accepted; clause 1 CAPPED AT `getBoard`

**`getMyWorkspaces`, `getTicket`, `getTickets` do NOT enter step 12 and must not be folded into it.**

1. **They are visibility decisions, not field additions** — corrected upward from two to three by the
   executor checking rather than assuming. **`getMyWorkspaces` is not even a field addition:** there is
   **no shipped project-list read at all** (`grep -rn "proj_projects"` finds the projection, one
   existence check, and **no route that reads it**; positive control `proj_memberships` = eight
   readers). Adding it means DESIGNING a read whose first question is *what a project-scoped guest sees
   of a workspace's other projects.* That is Plan 4's read-enforcement surface — which has produced
   **P19, P22 and P23, every one a disclosure no test caught.**
2. **The executor's own confidence decided it:** *"neither has been implemented, so the assertion is a
   prediction from reading the routes, not a measurement."* A step that might be *"bigger than a step"*
   by its author's own admission is not absorbed silently.
3. **Deferring is SAFE here, which is unusual — and it was VERIFIED, not taken on the PR's word.**
   `ServingGapError`: 11 uses in `mappers.ts`, handled in four views, and `client-contract.test.ts`
   names five of the six **server-side**, so a refusal **goes RED the day its route starts serving**.
   A self-expiring gap is cheap to hold; a rotting one is not.

**CONDITION, and it is the checkable part:** each of the three must be implemented by **applying an
existing Plan 4 visibility rule.** **If any requires a NEW rule rather than an application of one,
ESCALATE BEFORE BUILDING.** Same shape as P23's condition, which fired correctly.

> **TWO LESSONS PROMOTED FROM THE EXECUTOR'S OWN POSTSCRIPT, because they generalise past their cases:**
> **"A sweep is a fact about the directories it walked."** The register misrouted `getAttention`'s fix
> because the derivation swept `routes/**` and the route lives in `sync/`. **A register that misroutes a
> fix is worse than none — it looks checked.**
> **`getBoard`'s field addition was nearly a check that could not fail.** Every fixture workflow was at
> v1, so serving the constant `1` left **all 756 server tests green**, whole-body `toEqual` included.
> **Tidy fixtures make a version field indistinguishable from a constant.**

## STEP 10 CLOSED — and the executor found the controller's ledger bug, not the other way round

**Ruling P18 discharged, and it was real.** `getEntityState('membership')` answered `null`
unconditionally, so **every role-gated `restrict-to` edge refused everyone, an owner included.** It
fails *closed*, so a functionality gap and never a bypass. It survived because the contract was **half
witnessed** — only `fixtures/harness.ts` carried a roster, so fixtures were green on the side with the
fake. **Two mutations of the new reader passed all 720 tests**: a bare `SELECT` of `proj_memberships`
(hands back a revoked person's surviving row as a role), and collapsing every non-admin to `guest`
(invisible, because a wrong role and a missing one refuse identically).

**The scoping in BOTH documents that set this step was wrong.** The six `applyCommitted` absences were
not the target — five are already closed through the real door. **The real gap was one sentence:**
*every Plan 5 read-route test seeds through `applyCommitted` and none writes through `POST /v1/events`.*

**Carried, owner Plan 6 (step 11):** `board.tsx` is a **live defect** — it dereferences
`group.workflowVersion` and `card.assignee.id`/`.name`, none of which any response contains, and
`board.tsx:94` already reads `card.assignee.name`. And **9 of 12 `DataSourceQuery` methods cannot be
implemented over the shipped routes**, three because they take no `workspaceId` and those routes answer
400 without it.

**RULING P24 — taken by the executor, standing: the SERVER's `UserPreferences` shape wins.** §6b called
the two "informationally equivalent"; the shipped schema is `.strict()`, so Plan 6's document is
**refused three ways, not renamed.** Reversible in one direction only while Plan 6 T10 is unexecuted.
This closes the §6b deadline item.

> **The final whole-branch review found six things and ALL SIX WERE IN THE EXECUTOR'S OWN PROSE, none
> in its code** — a restart surface contradicting itself, a lesson naming the wrong module in four
> places including a production docblock, and a "no coverage anywhere" claim falsified by a test that
> exists. **Prose is not exempt from the falsifiability law, and it is the part no gate runs.**

## A STRUCTURAL GRAPH EXISTS — and it is gitignored, so nothing else will tell you

Built 2026-09-02 on the owner's instruction. **`graphify-out/` is in `.gitignore` (PR #73), so it does
NOT arrive with a clone or a fetch — this section is the only durable pointer to it.** Both worktrees
have their own, which is correct: they sit on different branches, so a shared graph would describe the
wrong tree for one of them.

| | primary (`main`) | exec worktree |
|---|---|---|
| nodes / edges | **3133 / 5999** (hook, whole-repo) — was 2151/4987 code-only | 2261 / 5319 (code-only) |
| built from | `main` at `4194172`, **then rebuilt whole-repo by the hook** | `exec/11-plan6-remainder` (code-only, manual) |
| outputs | `graphify-out/GRAPH_REPORT.md`, `graph.html`, `graph.json` | same |

**A POST-COMMIT HOOK NOW REBUILDS IT — installed 2026-09-02 on the owner's instruction.**
`graphify hook install` writes `post-commit` and `post-checkout` into `.git/hooks`. **Measured before
being left in place: commit latency 0.74s, because the hook launches the rebuild in the BACKGROUND**
(log: `~/.cache/graphify-rebuild.log`). It is incremental and AST-only, so still **zero LLM tokens**.

> **⚠ `.git/hooks` IS SHARED WITH THE EXEC WORKTREE** — `git -C <exec> rev-parse --git-path hooks`
> resolves to the primary's. So the executor's commits fire it too. That is why the 0.74s was measured
> first rather than assumed; a foreground rebuild would have taxed every commit of a session that makes
> dozens per step. A `post-commit` failure cannot abort a commit, so the downside is bounded to noise.

> **⚠ AND THE HOOK'S SCOPE IS NOT THE SCOPE I BUILT.** My manual run was code-only (`apps/` +
> `packages/`) → **2151 nodes**. The hook rebuilds the **WHOLE REPO** → **3133 nodes**: 1151 `packages`,
> 1000 `apps`, plus **653 `docs`, 172 `reference` (the FROZEN upstream snapshot), 53 `test-cases`, 35
> `scripts`.** Still free — AST parses markdown structurally, no LLM — but **`reference/` is noise by
> construction** and the graph is broader and less focused than the code-only one. **Filter by
> `source_file` when querying; do not assume a node is ours.** Recorded because the numbers in any older
> note will not match what is on disk, and the mismatch is the hook, not drift.

**The merge driver that `hook install` also registers was REMOVED**, along with the `.gitattributes` it
wrote: it targets `graphify-out/graph.json`, which is **gitignored, so the driver can never fire.** Dead
config that would have sat untracked in `git status` forever.

**Rebuild is FREE and takes about a minute** — a code-only corpus (`apps/` + `packages/`) has zero docs,
so graphify skips semantic extraction entirely and runs pure AST. **0 LLM tokens, no subagents.** Scope
it to code; the 13 plan documents are 3.8 MB of prose and are what makes a full run expensive.

**HONEST LIMITS, so it is not over-trusted.** The **15 `.sql` migrations contributed NOTHING**
(`tree_sitter_sql` not installed), 84 files produced zero nodes (mostly `.json` fixtures, expected), and
with semantic extraction skipped there are **no INFERRED edges at all** — only what the AST could prove.
**It is a structural map, not a conceptual one, and an absent edge is not evidence of no relationship.**

> **THE FINDING WORTH KEEPING, because it arrived from an instrument that knows nothing about this
> project's history.** The top god nodes by edge count are **test infrastructure, not production code**:
> `TestDatabase` (61), `createTestDatabase()` (61), `testEnvelope()` (45), `makeCommitted()` (28), with
> **`applyCommitted()` at #10 with 25 edges.** Step 10 reached *"the test seam is more connected than the
> shipped door"* by reading routes. The graph reaches it by counting edges. **Two independent
> instruments, same conclusion** — which is worth more than either alone.

### The workspace CLAUDE.md is WRONG about graphify — do not act on it

`/Users/kiro/my_projects/CLAUDE.md` asserts three things that were measured false 2026-09-02:
a cross-repo graph at `my_projects/graphify-out/` (**does not exist**), a **PostToolUse hook that
auto-rebuilds** (**there is no graphify PostToolUse hook at all**), and an instruction to read
`graphify-out/GRAPH_REPORT.md` before architecture questions (there was no graph until today).

**Why nobody noticed for weeks:** the one hook that does exist is
`[ -f graphify-out/graph.json ] && echo '{...}' || true`. **With no graph it evaluates to `true` and
emits nothing** — it fails silently by construction, so its absence is indistinguishable from its
success. Same family as a `grep` filter that can only match good news. The `HISTORY:` blocks in Read
results are **claude-mem** and the `SEMANTIC:` blocks are **semble**; both work, which is exactly why the
third missing leg looked normal.

### SCHEDULED — one semantic pass over the client packages, AFTER STEP 14

**Owner-approved 2026-09-02. This is the ONLY semantic extraction planned; everything else stays AST.**

| | |
|---|---|
| **TRIGGER** | **after step 14 (Plan 9) merges** — Plans 6, 7, 8, 9 all landed, before step 15 |
| **SCOPE** | `packages/app-core` + `packages/ui` + `packages/editor` + `packages/sync-client` only |
| **COST** | ~74 files → **~4 subagents**. A full-code pass would be ~20; the plans would be ~18 |
| **NOT IN SCOPE** | the 13 plan documents (3.8 MB), `apps/server`, `reference/` |

**What it buys that AST cannot give, stated as the one thing to look for:**
`semantically_similar_to` edges — *"two functions that solve the same problem and never call each
other."* **That is this series' signature failure with a different name.** The visibility decision table
lives **once in `canSeeResolved` and once in SQL**, its own docblock names the hazard, and **Plan 5 T5
nearly wrote a third copy** — caught by an executor reading carefully, not by any instrument. AST cannot
see this class at all: there is no import, no call, no citation to extract, which is precisely why it
survives review.

**WHY AFTER STEP 14 AND NOT NOW — two reasons, both measured:**
1. **60 of the 80 remaining tasks are client-side and unwritten.** Extracting now maps a codebase about
   to double, and the duplication it hunts cannot exist before the components do.
2. **Cost lands where the bill already hurts.** The spend record has this controller at 39% of
   $1,072. One 4-agent pass at the right moment beats a 20-agent pass at the wrong one.

**Run it with `--mode deep`** — the flag exists to be aggressive with INFERRED edges and to mark
uncertain ones AMBIGUOUS rather than omitting them. For a duplicate-logic hunt a false positive costs a
minute's reading; a false negative costs the defect this pass exists to find.

**Do NOT let the post-commit hook satisfy this.** The hook is AST-only whole-repo — it keeps the
structural graph fresh and produces **zero** inferred edges. Freshness is not the same capability.

### SCHEDULED — code-comment cleanup pass, BEFORE PLAN 11 STARTS (owner request 2026-09-03)

**Goal:** cross-cutting quality pass, not a plan task — apply `CODING_STANDARDS.md`'s own rule
retroactively across shipped code. **This is a tightening pass, not a stripping pass** — see the caveat
below before anyone runs it as a blind mechanical sweep.

| | |
|---|---|
| **TRIGGER** | after Plan 10 (offline-sync-apps) merges — every application package/app (`packages/*`, `apps/server`, `apps/web`, `apps/desktop`, `apps/mobile`) is complete and stable; before Plan 11 (deployment/dogfooding) starts |
| **SCOPE** | inline code comments and docblocks across `packages/*` and `apps/*`. **NOT** the plan documents, commit messages, or this file / `executor-state.md` — those serve a different audience and function, and this series already has a separate falsifiability rule for prose. **NOT** `reference/` (frozen) |
| **NOT a ledger task** | deliberately kept outside the 177-task denominator, same reasoning as the semantic-extraction pass above — inserting it into Plan 11's numbered tasks would mean editing a locked plan document and risks the same renumbering hazard this series repeatedly guards against elsewhere |

**WHY THIS TIMING, not earlier and not at the very end:**
1. **Not now** — 60+ of the remaining tasks are client-side code that doesn't exist yet (same reason the
   semantic pass above waits). Cleaning comments now means redoing it after every later plan's new files.
2. **Not after Plan 11** — Plan 11 is deployment/dogfooding: Dockerfiles, the DO spec, seed scripts. Lower
   comment-density than the application code, and delays the actual benefit (easier review) for the whole
   rest of the series for comparatively little gain.
3. **Right before Plan 11** — every application package is done and stable by then, so one pass covers
   everything that actually accumulated the verbose-comment style this series is known for, and Plan 11's
   own new files get written directly in the cleaned convention. No second pass needed for them.

**⚠ CAUTION, because a blind pass here would do real damage.** A large share of this codebase's verbose
comments are genuinely WHY-explaining — hidden constraints, workarounds, "this test's TZ loop cannot fail
and here is why" — exactly what `CODING_STANDARDS.md` says to *keep*. Several of this series' real defects
(the TZ-invariant test, the env-gate scanner's raw-vs-stripped mismatch, the database-timezone triple
redundancy) were caught by someone reading precisely this kind of comment. **The job is tightening
legitimate rationale for readability, not deleting it** — stripping WHY-comments in the name of brevity
would remove the exact signal this series has repeatedly relied on. A blanket "shorter is better" pass is
explicitly the wrong shape.

**Exact scope left to a dedicated planning pass at trigger time, not decided here:** whether this touches
test-file comments (planted-defect docblocks are load-bearing, not decorative) and the extensive rationale
comments in shared low-level utilities (e.g. `ist-day.ts`'s "no dependencies, and that is not an accident
of style") that this series has used as documentation. Run `superpowers:writing-plans` or equivalent when
the trigger fires rather than pre-committing task-by-task now.

### The cheap scan that replaces graphifying the plans

**Do NOT graphify the 13 plan documents to hunt cross-plan contract collisions.** A targeted scan does it
better, in seconds, for zero tokens: extract every `interface`/`type` declaration per plan, normalise
away comments and ordering, and report only where the **shapes** differ — not merely where the name
recurs. Measured 2026-09-02: **55 names in 2+ plans → 45 with differing shapes → 13 spanning two
unexecuted plans → 1 live (`SavedFilter`, now Ruling P26), 2 real-but-later (Plan 7's boundary), 1 false
positive.** Filtering by shape rather than name cut the candidate list by 76%. Script:
`scratchpad/collide.py`. **Re-run it before dispatching each remaining plan.**

## READ FIRST IF YOU WERE JUST LAUNCHED — the brief you hold is stale

`gisik-nokma-lanes/dispatch-main-controller.md` describes the **parallel Wave 1** topology: four lane
sessions, each merging its own PR, and a controller that only watches for cross-lane collisions. **None
of that is true any more.** Execution is **serial**, there is **one executor**, and **you merge its
work** — it never merges its own. The brief is not being rewritten because this file is the restart
surface and correcting it here is cheaper than keeping two documents true. **Where the brief and this
file disagree, this file wins.**

## Restarting the executor MID-STEP — main's handoff is not current, and the override is what bridges it

Done 2026-09-01 at 19:30 IST, at the owner's direction, because the executor hit 85% context in the
middle of step 9 rather than at a step boundary. **The documented trigger — restart after merging its
step PR — could not fire, because there was no step PR: Plan 5 is 17 tasks and only batch A was done.**

**The precondition "handoff current on `main`" CANNOT be met mid-step, and pretending otherwise loses
the work.** `main`'s `executor-state.md` stopped at step 8. Plan 5's three commits and the whole
step-9 seam existed only on `exec/05-api-realtime`, which **did not exist on `origin` at all** until
the executor was told to push it — `git ls-remote origin refs/heads/exec/05-api-realtime` returned
empty. A relaunch before that push would have destroyed step 9 outright, and the fresh session would
have read `main`, concluded nothing was in flight, and been confidently wrong.

**The sequence that works, mid-step:**
1. **Tell the executor it is being restarted and to flush a handoff FIRST** — covering which tasks
   landed, which branch carries them, and exactly where the seam is. Then stop. No PR, no merge.
2. **Poll `git ls-remote origin refs/heads/<branch>` for the push, not the executor's TUI.** A remote
   ref appearing is a fact; a pane saying "pushed" is a claim.
3. **Read the handoff yourself before killing anything** — confirm it covers the seam, not merely that
   a push happened. This one named three commits, four files with line counts, the next task *by plan
   line number*, and the floor-list tasks. That is the bar.
4. **Relaunch with an OVERRIDE appended after the brief**, naming the branch and sha and stating that
   `main` is NOT current. Put the position in it — tasks done, next task, plan line — so the fresh
   session can *check* the handoff rather than take it on faith. Launch from a script via
   `tmux new-window -d -t gisik:1 -n exec -c <worktree> <script>`; do not try to type a multi-line
   prompt through `send-keys`.
5. **Name the CURRENT `main` sha in the override, and expect to be caught if you do not.** This
   override said `6cb631d`; #60 merged in the interval and the fresh executor's first line was
   *"main has moved: origin/main is 00cb2e0, not 6cb631d as the override states."* Harmless here, and a
   good sign about the session — but it is a stale sha in a live instruction, which is the exact defect
   this file opens by warning about.

**Result: context 85% → 7%, on branch, mid-step, nothing lost.** Cost of the whole manoeuvre was one
handoff commit.

## How a controller reaches the executor — `SendMessage` does NOT work, tmux does

Found 2026-09-01 by a successor controller whose first message was silently never delivered.

- **`SendMessage` to `gisik-nokma-exec-*` is HELD, then declined**, with
  *"the sending session's permission mode class doesn't match this session's."* The executor runs
  `--permission-mode bypassPermissions`; a controller running in **auto mode does not**, and the class
  mismatch gates every cross-session message. The executor sees an approval dialog; if nobody clicks it,
  the message is dropped and **the executor goes on believing no controller exists** — which is exactly
  what it recorded in its transcript while the message sat undelivered.
- **`ListAgents` still lists the executor as reachable.** A listing is not a delivery guarantee. **The
  only proof a message arrived is seeing the executor act on it in its pane.**
- **The channel that works is tmux**, and it is the same one `idle-nudger.py` uses:
  `tmux load-buffer -b <name> <file>` → `tmux paste-buffer -b <name> -t gisik:1` → **sleep** →
  `tmux send-keys -t gisik:1 Enter` **as a separate call**. Text and Enter in one `send-keys` are
  coalesced into a paste event in the TUI's vim INSERT mode and insert a literal newline instead of
  submitting. Confirmed working: the executor replied to a pasted ruling within one turn.
- **The durable fix is to launch the controller with `--permission-mode bypassPermissions`**, matching
  the executor. In auto mode a controller also loses `git push --force-with-lease` to the classifier,
  which is what turned a routine rebase into a new PR number below.

## Stacked PRs and squash-merge — #58 became #59, and the check that made it safe

**A PR stacked on another PR's branch goes CONFLICTING the moment the base squash-merges.** #58
(Chain B) was based on `exec/04-t8-t14-enforcement`, deliberately, because `proj_tickets` collides with
step 7's projection registry. #57 squashed to `dd7bfcf`; retargeting #58 to `main` with
`gh pr edit 58 --base main` produced `mergeable=CONFLICTING state=DIRTY`, 93 files. **This will recur on
every stacked step — expect it, do not diagnose it again.**

The repair, and the shape to reuse:
1. `git worktree add --detach <scratch> origin/<branch>` — never rebase in the primary worktree.
2. `git rebase --onto origin/main <base-PR-head-sha>` — replays only the stacked commits. 20/20 clean.
3. **Verify content identity WITH A POSITIVE CONTROL, because an empty diff is what a broken diff
   invocation also prints.** `git diff --stat <old-head> HEAD` → **empty**; the control
   `git diff --stat origin/main HEAD` → **49 files, +5975 −285**, the exact stat the closed PR reported.
   One empty and one non-empty from the same instrument is the evidence; the empty one alone is not.
4. Force-push if you can. **In auto mode you cannot** — push to a new branch, open a replacement PR that
   states what it supersedes, and close the old one with the verification in the comment. Leave the
   original branch in place: it is the record of what was gated.

## Task-level progress is now tracked — stop reconstructing it

`pnpm check:tasks` (`scripts/check-task-ledger.mjs`) reports task-level completion from
`docs/lanes/task-ledger.tsv`, one row per `### Task N:` heading across the eleven plans. **Do not
recompute a progress figure from prose again — run the gate and quote it.**

- **The denominator is derived, never typed.** 177 tasks (167 plain + 10 lettered). The earlier "167
  total" was produced by `grep -cE '^#+ *Task '`, which returns **BLANK, not 0**, for plans 08 and 11 —
  both have very long lines. The gate carries a positive control so a reader that drifts fails loudly
  instead of reporting an empty backlog as clean.
- **Two numbers, deliberately not one.** ~~`done` = a PR **naming** that exact plan+task~~ **WIDENED by
  owner ruling 2026-09-02, because the original definition promoted ZERO rows whose work had shipped:**
  `done` = **the commit that introduced the task's declared artefact to `main`**, identified from the
  task's own `Files:` block and confirmed to belong to that task's PR. `claimed` = asserted at plan or
  branch granularity only, never counted as complete — **currently 0, and see the audit section for why
  the status is kept anyway.**
  Why the widening was forced: **#3's and #4's bodies name none of their own 28 tasks.** Every
  task-shaped string in either refers to a *different plan*. The old definition was unsatisfiable by the
  very PRs it was meant to adjudicate.
- **Evidence is the commit that PUT THE ARTEFACT ON MAIN — which is the merge sha only under a squash.**
  ~~This repo squash-merges~~ — true from #51 onward, **false of #3, #4 and #13**, which were
  rebase-merged and whose recorded `mergeCommit` is the LAST commit of the replayed chain: 3 files for
  #3, 1 for #4, both documentation. Recording it passes the ancestry check while pointing at a commit
  containing none of the work. **And do not infer merge style from an ancestry count** — a rebase that
  replays commits rewrites their shas and reports 0/N exactly like a squash. Use
  `gh api repos/<o>/<r>/commits/<sha>/pulls`. Recording an unmerged implementing sha still false-REDs,
  and the ancestry check still catches it: proven by mutation with the live exec branch tip.
- **Rejected and recorded so it is not re-tried: fenced-code stripping.** It looks obviously right and it
  drops the count 177 → 166, removing the real tail headings of plans 06 and 07, which carry an **odd**
  number of ``` markers. It fails toward "more complete" while every per-plan count stays non-zero, so
  the positive control cannot see it. Rationale is in the script header.
- **The 13 rows moved to `done` on 2026-09-01 were evidenced per task, not per title.** `check:tasks`
  passing proves only that the merge sha is an ancestor of `main` — **it cannot see whether the PR names
  each task**, and that human half is the entire reason the `done`/`claimed` split exists. Marking a
  range from a PR *title* would have been a claim wearing a verification's clothes. What was actually
  run: `gh pr view 57 --json title,body -q '.title + "\n" + .body' | grep -oE '\b(T|Task )(8|9|1[0-4])\b' | sort -u`
  → **T8 T9 T10 T11 T12 T13 T14, all seven present individually**; #59's per-task evidence is the
  outcome table in the executor's own handoff, one row per T9–T14. **Do this before moving rows, and
  cite the command** — three of #57's rows read `todo` beforehand, so a title-only edit would have
  manufactured completions in the very instrument built to catch them.
- **Keep it current in the same change set as the work**, like `Features.md`. A merged PR no row cites is
  printed every run — that is the direction that catches work landing unrecorded.

## THE ENVIRONMENT IS NOT THE DECLARED ONE — read before running a gate

Found 2026-08-31 by a post-merge gate that came back RED and was **not** a code defect.

- `package.json` declares `"engines": { "node": ">=22.0.0 <23" }`. CI (`.github/workflows/ci.yml:62`)
  uses `node-version: 22`. **This machine's default `node` is v24.11.1** — outside the declared range.
- There is **no `.nvmrc`, no `.node-version`, no `.tool-versions` — and no `.npmrc`.** The last one is
  the load-bearing absence: without `engine-strict=true`, **`engines` enforces nothing.** Verified under
  v24.11.1: `pnpm exec node -v` and `pnpm run` both succeed with **no refusal and not a single warning**,
  with the same commands under 22 as the control so the silence is not a broken probe. The declared
  engine is decorative. *(Pending item below; the controller does not implement.)*
  > **CORRECTED 2026-09-01 — that sentence is half wrong, and the wrong half is the one that matters.**
  > Re-measured with v22.22.2 as the control: **`pnpm run <script>` under v24 DOES warn** —
  > `WARN Unsupported engine: wanted: {"node":">=22.0.0 <23"} (current: {"node":"v24.11.1",...})` — and
  > prints nothing of the kind under 22. Only `pnpm exec node -v` is genuinely silent, which is the half
  > the original claim generalised from. **Every gate and every CI step goes through `pnpm run`**, so the
  > signal was there the whole time, one line above output nobody reads.
  > This does not rescue anything — it still does not REFUSE, so a wrong-Node gate still goes green — but
  > "says nothing at all" is not the accurate description of the false GREEN, and the pending fix is
  > smaller than recorded: `engine-strict=true` promotes an existing warning to an error rather than
  > inventing a check. **Claim only what the probe you ran covers**: two commands were tested, they
  > disagreed, and the summary took the quieter one for both.
  > **OPERATIONAL FORM — use this, it is free:** the gate is not unguarded after all. Every gate and CI
  > step runs through `pnpm run`, so **if `WARN Unsupported engine` appears anywhere in gate output, you
  > are on the wrong Node and that run is not evidence.** Detection, not prevention — Plan 11 keeps the
  > `.nvmrc` + `engine-strict` fix — but it means a wrong-Node gate is now readable rather than silent,
  > which is a materially weaker version of the false-GREEN than this section originally recorded.
  > *(Independently re-measured by the executor with v22.22.2 as its control; both sessions agree.)*
- **So there are two failure modes, and the quiet one is worse.** The false RED is what this section was
  written from — loud, and it names itself in the error text. The false GREEN is a gate that passes on an
  unsupported Node and says nothing at all. Nobody catches that one.
- `better-sqlite3@11.10.0` is a **native** module. Its binding matches whichever Node last rebuilt it —
  ABI **127** = Node 22, ABI **137** = Node 24. Under the wrong one, `@gisik-nokma/sync-client#test`
  fails 4/8 with `NODE_MODULE_VERSION` and **looks exactly like main being red.** It is not.
- Fix: `nvm use 22 && pnpm rebuild better-sqlite3`, then gate. **The main worktree's binding is currently
  built for ABI 127 (Node 22)** — correct, and it means a gate run there under Node 24 will now false-red.
- Each worktree has its own `node_modules`, so lanes are isolated — which is the hazard: **two sessions
  can certify the same code under different Node majors and both report green.** A gate result is not
  evidence unless it names its Node.

This is the same class as the TZ finding one level up. The coordination doc says *"the environment is a
fixture, and no test on `main` varies it."* It is worse than that: the environment is not even the
**declared** fixture, and nothing in the repo makes it be.

## Role and authority

Controller of a **two-session serial topology**: this session plus one executor. The wave schedule is
superseded (see the coordination doc's serial-execution section).

- **The controller merges the executor's work.** The executor never merges its own — *that* is the check
  the two-session split exists to provide, and it is untouched.
  > ~~**and NEVER its own. Its own doc PRs go to the owner.**~~ **SUPERSEDED 2026-09-01 — and it was
  > superseded by PRACTICE before anyone wrote it down, which is why a successor found this file
  > contradicting itself.** This sentence sat ~250 lines above an anchors table recording that this
  > file's own previous two updates merged as **#60** and **#61**, controller-authored and
  > controller-merged. `dispatch-controller-serial.md` grants it explicitly (*"This includes your own
  > doc PRs"*).
  > **The replacement is a substitution, not a deletion, because the original check still has a job.**
  > What licenses a controller merging its own PR is two properties *together*:
  > **(a) it is docs-only by construction** — the controller does not implement plan tasks, so its diff
  > cannot reach a package; and **(b) independent CI green at the exact head sha.** Verify (a) the same
  > way the gate anchor is verified — `rtk proxy git diff --name-only origin/main HEAD`, read as rows.
  > **A controller PR that touches anything outside `docs/` falls back to the original rule and goes to
  > the owner.** Deleting the sentence outright would have lost that fallback.
  > *(Recording the tie-break honestly: `gh pr view 60/61 --json author,mergedBy` returns
  > `bkirosangma` for both fields, because both sessions act through the owner's single `gh`
  > credential. **That query cannot discriminate controller from owner and should not be cited as if it
  > could** — the discriminating evidence is the session record plus the brief.)*
- Auto-merge is re-granted: a PR that passed its machinery **and** an independent CI run green merges
  without a per-PR ask. `gh pr checks <n>` — **pending is not green.** Prefer
  `gh api repos/<o>/<r>/commits/<head-sha>/check-runs` — it names the conclusion at the exact sha.
- The controller does **not** implement plan tasks, and does not re-review the executor's work.
- ~~**Restart the executor at task boundaries.**~~ **WRONG — that boundary cannot meet its own
  precondition.** The precondition is *"handoff current on `main`"*, and the handoff only reaches `main`
  when the **step's PR merges**. Within a step no such moment exists: mid-step, `main`'s handoff is a full
  step behind, so a relaunched session does not know which tasks have landed or which branch carries them.

  **THE RULE: restart the executor immediately after merging its step PR, BEFORE dispatching the next
  step.** That is the only instant where every precondition holds at once — handoff just merged, nothing
  in flight, no branch name to hand over, no fan-out to interrupt. It is a fixed point in the loop, not a
  judgment call, and **it is not optional because the executor did not ask.**

  It is a kill-and-relaunch from the brief, NOT a `/clear` (user-typed, cannot be issued to another
  session). Measured cost of skipping it: three consecutive opportunities missed (#51, #52, #53), context
  7% → 54%, and the only restart that did happen was one the executor requested.

  **Note the conflict, because it is live:** the brief's "KEEP GOING / do not end a turn" rule removes the
  natural pause a restart used to occupy. The two are reconciled *only* by the step-PR trigger — chaining
  is correct WITHIN a step, and the restart happens BETWEEN steps.

## The executor

- Session `gisik-nokma-exec-*`, tmux `gisik:exec`, worktree `/Users/kiro/my_projects/gisik-nokma-exec`.
- Brief: `gisik-nokma-lanes/dispatch-executor-serial.md` — **self-sufficient by design**; policy lives
  there, position lives in `docs/lanes/executor-state.md`.
- Relaunch: `tmux kill-window -t gisik:exec` then `tmux new-window -t gisik -n exec -c <worktree>` and
  `claude --model opus --permission-mode bypassPermissions "$(cat <brief>)"`.
- **Before restarting: the executor's handoff must be current on `main` and its anchors reachable.**
  Restarting against a stale handoff destroys what the restart was meant to preserve.
- **A branch checked out in ANY worktree cannot be checked out or deleted from another.** Four failures in
  one session: three `--delete-branch`, plus `git -C <exec-worktree> checkout main`, which refuses because
  `main` is held by the primary worktree. **So the exec worktree can never sit on `main`** — leave it on
  whatever branch it holds and let the fresh session check out its own target. `exec/06a-client-core` is
  held by `gisik-nokma-lanes/lane4-periphery`; work such a branch in place.

## Position in the serial sequence

**PHASE 0 IS COMPLETE.** All three branches landed: step 1 Chain A (`6b2fc76`), step 2
`exec/06a-client-core` (`c93c910`), step 3 `exec/07-editor-client` (`a3746fb`). P17's stale plan text was
discharged in `f40a850`.

> **Reconciled, because it would otherwise fire deterministically:** the coordination doc's step-2 line
> *"at `8209397`, not at the branch tip"* is **SUPERSEDED** — T9 was reviewed and its fixes applied, and
> the branch merged at its tip.

**Steps 4, 5 and 6 are CLOSED** — `45c83eb` (#51), `40c5219` (#52), `33538be` (#53).
**The §11 envelope-origin window is CLOSED at the constructor** (`fc904f4` had closed only the client
door). **Step 7 is next: Plan 4 T8–T14**, with **T11 and T14 floor-list**.

**Three privilege/forgery defects were found and closed in Phase 1, none by a pre-existing test:** a
founding bypass that made strangers owners of workspaces they were never in; a role chain whose
unenumerated direction was *grant*; and the embedded-claim window. All three were caught by review.

**Seven gaps carried with named owners, none folded in opportunistically.** The two that bite hardest:
**P19 guest admissions (T9)** — a guest is admitted TODAY for `ticket.created`, `visibility.set`,
`workspace.renamed`, `comment.added`, and `visibility.set` in an append-only ledger cannot be walked back;
and **P22 (T8)** — `canSeeResolved` takes `EffectiveRole` **by value**, so every safety property rests on
provenance nothing enforces. TypeScript is structural, so Task 8/9/11 can each build or cache one no early
return ever emptied. **Closer, so it is not re-litigated: a branded type** carrying a unique symbol only
`resolveEffectiveRole` can produce — turning a silent grant into a compile error.

> ### ⚠ IN-FLIGHT NOW — `exec/05-api-realtime` (step 9, Plan 5, 17 tasks)
> **No PR yet, and there will not be one until the step completes** — this is the state in which the
> restart trigger cannot fire (see the mid-step section at the top). Branch is 4 commits ahead of
> `origin/main`, rebased onto it by the executor. Batch A (T1, T2, T2's fix round) is done; **T3 is
> running now.** The executor's handoff on this branch is the current one; `main`'s is a step behind.
>
> **CHECK AT MERGE TIME, not before — do not interrupt a running turn for it.** The executor is running
> a background `Workflow` (adaptation map T4–T16 + T3 implement/review). The standing ruling is **one
> fan-out per plan, hard cap 6 subagents per task**, and **batch A's fix round already ran review lenses
> on Plan 5** — so this may be Plan 5's second fan-out. It is a budget question, not a correctness one:
> read the handoff's own account when the step PR lands, and if the budget is genuinely spent, say so
> then rather than re-litigating it mid-task.
>
> ### ~~⚠ IN-FLIGHT — `exec/04-t8-t14-enforcement` (step 7)~~ **MERGED as `dd7bfcf` via #57.** Kept for the rulings below.
> **Cut from `main` at `33538be`, 7 commits, pushed.** T8, T9, T10 landed; **T11 reviewed, fix round running**;
> T12 + **T13 (BLIND — its dispatch must carry 6.52/6.53)** then T14 (floor-list) follow. Branch gate
> **1138 tests at T11's sha and still moving — the fix round will change it.** `main`'s executor handoff is a
> step behind and does not name this branch — **hand it to
> any relaunched executor.**
> **T8 closed P22**: `EffectiveRole` is branded with a module-private `unique symbol`, so a hand-built one
> fails `TS2741`. Provenance is compiler-enforced, not conventional.
>
> **T10 clean (zero findings, reviewed as the ONLY check on a task whose implementer died mid-report).
> T11 review found a CRITICAL disclosure, reported 2026-09-01; fix round dispatched, gate at T11's sha
> 21/21, 1138 tests, server 343 — will move.** The purge walk in `visible-events-for.ts` sits OUTSIDE the
> `canSee` branch and applies no role test, so an ordinary `visibility.set` or `ticket.reparented` on ANY
> ticket yields `purge:<thatTicketId>` to every member AND every guest. A guest holding only ticket S,
> after an admin re-authors unrelated ticket N's audience, syncs down `{kind:'purge', entityId:N}` — a
> positive assertion that N exists plus roughly when, since ULIDs are timestamp-ordered. Contradicts case
> **6.16**'s own asserted property and falsifies the module docblock's "the ticket list is not even
> computed" on the guest path. **6.16's correction lands in the SAME change set, not the fix follow-up.**
>
> **DO NOT FILE THIS WITH P19.** P19 (guest admissions) is unrecoverable because the wrong facts ARE
> ledger rows in an append-only store. This one is a read-path computation over correct rows: no ledger
> row is wrong, so the fix is complete and retroactive the instant it lands. Filing them together
> over-scopes the fix or under-scopes P19.
> **GENERAL FORM, worth more than the instance — when triaging any disclosure, ask whether the wrong
> thing was WRITTEN or COMPUTED.** Written means it is in the ledger: closed for the future, existing
> rows superseded but never removed, and there is something to migrate. Computed means a read path
> derived it from correct rows: fixing the path fixes every past and future read at once, and there is
> nothing to migrate. The two look identical in a review — same severity, same guest, same leaked id —
> and they have completely different remediation shapes.
>
> **RULING, stated as a condition so it does not need re-arguing:** if the fix agent derives that
> `ScopeRevokedInstruction`'s docblock already blesses the itemised whole-workspace purge by analogy to
> case 6.14's restricted-parent leak, **that outcome escalates to the controller before it is built on.**
> Not because it misreads the docblock, but because of what it becomes — a precedent that a docblock
> written for a bounded case licenses whole-set enumeration. 6.14 names one parent id to a viewer already
> holding its child; this enumerates the entire invisible set to a party with no relationship to any of
> it. Cardinality and relationship both differ, so it is a different shape, not a wider instance of the
> same one. Derived the other way, no escalation.
>
> **T11's implementer also found the PLAN TEXT carries a dead branch, and it is the sharper finding.**
> The plan opens `if (eff.workspaceRole === null) return;` and places the `membership.revoked` purge
> branch inside the loop below it — but a revocation deletes the workspace-scope row, so the revoked
> user's role IS null. The generator returns before reaching the branch written to serve exactly those
> people, and **every ticket on that device stays there forever.** Unreachable by construction, so the
> more faithfully an implementer transcribes the plan the more certainly they ship it. `ticket.reparented`
> had no test at all, found by a mutation that killed nothing. **Five purge triggers, not the three the
> executor briefed — carry the corrected count INTO T14's dispatch text**, per the standing sweep rule.
>
> ### ~~⚠ IN-FLIGHT — `exec/04-t6-t7-visibility`~~ **MERGED as `40c5219`. Kept for the rule below.**
> **Cut from `main` at `45c83eb`. T6 (`proj_visibility`) is running.** The executor's handoff on `main`
> may still read *"step 5 is next and nothing is in flight"* — that was true when written and goes stale
> the moment T6 starts, because the executor deliberately does **not** commit a docs refresh underneath a
> reviewer reading `git diff origin/main...HEAD` (the 2026-08-28 concurrent-mutation incident).
> **So: before restarting the executor, hand the new session this branch name.** Otherwise it reads
> `main`, sees step 5 unstarted, and cuts a second branch duplicating T6.
> The executor mitigated this by telling the controller in a message — which does not survive the
> CONTROLLER being restarted. **A mitigation that lives only in a conversation is not a mitigation.**
> It is recorded here because this file is the thing that survives.
T6/T7 must read membership through **`resolveEffectiveRole`**, never by joining `proj_memberships`
directly — documented in three places and **enforced by nothing**; it is T4's implementer's own
least-sure claim, so raise a ruling if T6 joins directly.

**Four gaps carried with named owners, none silently fixed:** P18 engine-context wiring (T6 or the
step-10 checkpoint) · **P19 guest admissions (T9)** — a guest is admitted TODAY for `ticket.created`,
`visibility.set`, `workspace.renamed`, `comment.added`, and `visibility.set` in an append-only ledger is
unrecoverable · a second `workspace.created` still commits (T13) · the half-founded workspace with no
repair path (T13), **already closed by T5's escalation guards — do not read it as a regression.**

**Case ids are reserved too, and I got this wrong a second time.** I ruled "cases numbered from 6.1";
Plan 4 reserves **6.1–6.42 verbatim with content assigned per id**, and 6.5–6.8 are exactly T4's and T5's
work. The executor filled those and continued at 6.43. **Same root error as the §6/§9 section mistake:
assuming sequential allocation in a scheme that allocates from a table.** Claim from the table — at every
level, sections and case ids alike.

~~**Step 4 is running: Plan 4 T4 → T5.**~~ T4 (`proj_memberships`) is committed and green; T5 widens
`SubmissionGate` — note **T5 is NOT unstarted**, `fc904f4` landed its first branch, so review its PR as a
widening, not a creation. **No rebase was needed:** `exec/04-auth-visibility` is redundant (see the
`git cherry` rule below) — the recon's "31 behind / 4 ahead, two conflicts" was accurate and its
conclusion was false.

**Catalogue, ruled 2026-08-31 — an earlier version of this line was WRONG.** It said step 4 "creates §6",
asserted from the dispatch brief without opening Plan 4. **Plan 4's explicit catalogue steps are all in
Tasks 12–14** (lines 4700/4866/4884/4922, 5131, 5260); T4 and T5 have none. But **the same-change-set rule is a series-wide
standing constraint, not Plan 4 boilerplate** — measured, it appears in **all 11 numbered plans** (01–11),
phrased differently in each. So if T12–14's steps meant "earlier tasks are exempt", the same inference
would exempt earlier tasks in *every* plan and the rule would mean nothing anywhere. A general rule stated
in eleven places governs the specific steps below it. **Ruling:
step 4's PR creates §6 and `test-cases/06-auth-visibility.md` carrying ONLY T4's and T5's own entries**;
T12–14 append theirs. Rationale: `proj_memberships` ships to `main` at this PR, so deferring leaves the
catalogue not knowing about a live projection — the drift #47 was blocked for. Waiving it would make that
block arbitrary.

### `git cherry` before you believe an ahead-count

**An ahead-count is not a work-count.** `exec/04-auth-visibility` read `31 behind / 4 ahead` with two real
`merge-tree` conflicts — and `git cherry origin/main <branch>` prints `-` for all four commits: every one
already upstream. `rev-list` measures commit identity, `merge-tree` measures a merge; **neither asks
whether the content is already upstream.** Run `git cherry` FIRST for every remaining branch.

**CONFIRMED LIVE 2026-08-31** on the first branch to test it: after #51 squash-merged,
`git cherry origin/main origin/exec/04-t4-t5-permissions` returns **`+` for all 11** already-merged
commits, and `main`'s subject ends in `(#51)`. A `+` from a branch whose PR landed with a `(#N)` suffix
means nothing.

**Asymmetry, because this repo squash-merges.** `-` is strong evidence of redundancy. `+` is NOT
conclusive: a squash collapses N commits into one and destroys the per-commit patch-ids `cherry` matches,
so `exec/03-tickets-hierarchy` reports `31/31 new` despite having merged as `6b2fc76`. A false `+` costs
work, never loses it. **Tell them apart:** a squash landing's subject ends in `(#N)` and a rebase landing's
does not — verified against both populations here. That is a GitHub UI convention, not a git property, so
it is good evidence rather than proof.

Measured: `exec/04-envelope-origin-gate` is the only genuinely inert branch (merge-tree byte-identical to
`main`). `exec/04-auth-visibility` and `exec/10-prefix` are superseded AND conflicting — **merging either
would now regress `main`**, which is a stronger statement than "redundant".

### The catalogue rule, and how I got its number wrong

`Features.md` and `test-cases/` are stated in **two** CLAUDE.md files with the follow-up excluded both
times: *"same change set, never a follow-up"*, *"any PR that touches source files and leaves `Features.md`
untouched is incomplete."* **Nothing in this repo enforces it** — not the gate, not a scoped review. It is
the controller's job to read a PR against it, and #47 arrived with a 20-file package and an untouched
catalogue, recorded "with owner, not fixed", which IS the forbidden follow-up. Blocking it was right.

**But the section number I demanded was wrong, and would have collided within the hour.** I said "§6,
next-free". **Numbering is RESERVED, not sequential** — `test-cases/README.md`: *"claim from the table
rather than renumbering"*, and the coordination doc's reconciliation decision 2 assigns **§6 →
Plan 4** (the very next task) and **Plan 7 → §9 / `09-editor-attachments`**. I had applied the *case*
rule ("next free number in the matching section") one level up to *section* numbers, where it is false.
**§6–§8 are absent from `Features.md` by design, not missing.** Claim from the table. Always.

Case ids are reserved the same way: Plan 7 T16 pins 9.1–9.34 and has not run, so the new bucket starts
at **9.35**.

### The sonnet reviewer default is CONDITIONAL, and the condition is checkable

The cost ruling's table reads *"Per-task reviewers **where the plan text is complete** | sonnet | medium"*
(line 1016; the older `| opus | high` row at 613 is superseded — do not cite it). **That precondition is
measurable, so measure it** rather than defaulting: grep the task's own line range for the
security-relevant terms it is supposed to cover, with a control term from the same range.

Measured at step 6: **Plan 10 T4's range (1300–1810) contains ZERO** `coheren` / `binds` / `embedded` /
`outer envelope` / `envelope-origin` / `§11`, against `projection` = 30 as the control. The §11 closer —
**the entire reason the task was lifted to Phase 1** — is absent from its own text. It lives in the
coordination doc and in `packages/rule-engine/src/contests.ts:36`. **Named where a reader of the
EVALUATOR would find it; absent where a reader of the TASK would.** An implementer following the plan
faithfully ships the task with the window still open.

So an opus reviewer there is **not opus-by-exception** — the sonnet row simply does not cover the case.
An exception invites re-argument every time; an unsatisfied precondition does not.

General form: **lifting a task changes when it runs, not what its text says.** And the corollary, which is
the reusable half: **when an obligation is assigned to a task from OUTSIDE that task, it must be written
INTO that task's own text — or the next reader will not perform it, and the more faithful they are to the
plan the more certainly they will miss it.** Fidelity is the failure mode, which is why no amount of care
by the implementer would have caught this.

**Standing instruction: before dispatching any remaining lifted or re-sequenced item, sweep its own range
for the thing it was moved to do**, with a control term. Cheap, and it is the only check that fires before
the work rather than after it.

## THE MACHINE WAS ASLEEP — read before diagnosing any stall

**`pmset sleep 1` on BATTERY** (AC is `0`/never). A laptop on battery idle-sleeps after **one minute**,
freezing every session, every launchd agent and every `sleep` timer, **with no error recorded anywhere**.

**Evidence, from a 120-second agent's own log:** 16 gaps of 8–47 minutes overnight. Measured cost of one
occurrence: **2.9 h and ~871K subagent tokens for zero completed agents.** A `sleep 1432` observed still
alive at 59:11 is the same signature. **This is the mechanism behind both "idle executor" incidents that
were previously attributed to session behaviour.**

**Owner keeps the laptop plugged in (2026-09-01) — AC never sleeps, so this is closed by power, not
software.** `pmset` was NOT modified; changing owner power settings is not the controller's call.

### Three watchdogs, all launchd, all verified with controls before enabling

| agent | covers | why the others cannot |
|---|---|---|
| `com.kiro.claude-limit-resumer` | quota exhaustion | matches a transcript limit-error signature (45 min) |
| `com.kiro.claude-net-resumer` | connectivity loss | different signature + reachability gate (180 s) |
| `com.kiro.claude-idle-nudger` | **a turn that just ended** | leaves **no transcript trace at all** (120 s) |

The nudger hashes the pane's content area (**status bar stripped** — it carries a live token counter, so
including it makes every pane look permanently active), and holds a **self-expiring** `caffeinate` so a
dead agent cannot pin the laptop awake. READMEs and disable steps in `~/.claude/scripts/`.

**It shipped with a bug worth remembering: it counted 4 identical *samples* and assumed they were 120 s
apart.** Across sleep gaps they were 45+ minutes apart, so both its "IDLE" detections were false — the
pane was identical because the machine was stopped. **Fixed to wall-clock, and it now treats an oversized
sweep gap as a sleep event and resets rather than counting across it.** An instrument whose meaning
depended on an unchecked assumption, shipped one hour after that rule was written down.

## Spend — measured 2026-09-01, and it indicts this role

**$1,072 across 3,785 orchestrator requests since 31 Aug, 100% `claude-opus-5`.**

- **Cache reads are 68% of it** ($725; 1.45 **billion** tokens). Output is 12%. The bill is re-sending
  history, not generating text — so context growth costs money *directly*.
- **This controller alone is $416 — 39% of everything**, 1.4× the executor it spends the day policing.
- **Subagents are NOT in that figure.** No sidechain records exist on disk (`~/.claude/projects`, 46
  files; `~/.claude/tasks`, none since 31 Aug). One *failed* fan-out was reported at 871K tokens. **Real
  spend is materially higher and is not measurable from artifacts.**

## Standing owner rulings currently in force

- **RULING P26 (2026-09-02) — `SavedFilter`'s field is `filterSpec`. Plan 9 Task 13's `spec` is
  SUPERSEDED before it is written.** *(Written here because the executor received P26 as a message and
  correctly reported it had "a number, a subject, and no text" — a ruling that lives only in a pane does
  not survive either session's restart. That is the second time in one day.)*
  - **Three spellings of one field exist.** `packages/domain/src/preferences.ts:28` → **`filterSpec`**,
    shipped, schema is `.strict()`. `packages/app-core/src/view-types.ts:183` → `filter`, shipped.
    **Plan 9 Task 13 → `spec`, not yet built, 48 mentions.**
  - **SCOPE, stated precisely because the first version of this was too wide.** The first two are **NOT
    new**: they are one of P24's "three renames", and `client-contract.test.ts:605` already pins them —
    *"the client's document is REFUSED whole — `.strict()` turns three renames into one 400."* **That
    half is closed and is not reopened here.** What is new is only Plan 9's third spelling.
  - **Plan 9 T13 is not disagreeing — it does not know.** Measured against its own text: **zero**
    mentions of `filterSpec`, **zero** of `preferencesDocSchema`, **zero** of `Plan 5`.
  - **The ruling needs no new argument:** a `.strict()` schema REFUSES a third spelling rather than
    renaming it. `filterSpec` wins; Plan 9 T13 adopts it. P24's logic, a plan P24 never looked at.
  - **Also recorded, owner step 12 (Plan 7):** `EditorSlotProps` differs (Plan 6 `doc: unknown` vs
    Plan 7 `doc: DocJson | null`) and `AttachmentListEntry` differs structurally (Plan 6 inlines the
    drive-reference fields, Plan 7 uses `& DriveReference`). **`EditorSlotUpload` was a FALSE POSITIVE**
    — identical fields, different line breaks — named so nobody re-finds it.

## QUOTA IS THE BINDING CONSTRAINT, NOT TIME — measured 2026-09-02

**Measured, not estimated:** weekly went 1% → 33% between 03:27 and 14:20, i.e. **2.94 percentage points
per hour across BOTH sessions**. 67% remaining ≈ **23 hours of work**, against **112 hours** until the
stated reset. **We exhaust the week's allowance in about a day and then idle for ~3.7 days.**

- **Step 11's pace is 48 min/task** (7 tasks in 5.6h), against Plan 5's 31. **UI work is genuinely
  slower and 60 of the 89 remaining tasks are client-side — plan against 48.**
- This weekly buys roughly **28 more tasks**. All 89 need ~3 weekly cycles; 73 (excluding Plan 11) ~2.6.
- **A CONTROLLER ESTIMATE OF "4–6 DAYS" WAS GIVEN EARLIER AND WAS WRONG.** It measured throughput and
  **ignored quota entirely.** Time was never the constraint. Correct form: 4–6 days *of permitted
  execution*, spread across ~3 weekly windows.
- **⚠ The reset semantics do not match the label.** The status line says *"resets mon 6:30am"*, but
  weekly was observed dropping **62% → 1% overnight Tue→Wed**, which no Monday reset explains. That is
  consistent with a ROLLING window. If it rolls, capacity replenishes continuously and the outlook is
  materially better than the figures above, which assume hard cliffs. **Unresolved — do not present
  either reading as settled.**

## ⚠ THE CONTROLLER LOOP RUNS ON SONNET FROM THE NEXT RESTART — owner ruling 2026-09-02

**This AMENDS the standing ruling** at coordination doc §"Lane controllers / orchestrators | Opus 5"
(owner amendment 2026-08-28). **The loop is Sonnet. Rulings escalate to Opus.**

### THE DESIGN PROBLEM, stated first because it is the whole difficulty

**A session cannot reliably detect that it is out of its depth.** Every judgment call this role got
right on 2026-09-02 had the same shape: *something passed every check and was still wrong* — a ledger
audit where **both instruments said promote and the right answer was refuse**; an escalation answered
against the nearest claim rather than the claim actually made; a graph whose numbers silently
invalidated documentation written 40 minutes earlier. **None was flagged by a tool, and a session that
could spot them by feel would not need the rule.**

**So the triggers below are SYNTACTIC. They are things a session can detect by looking, not by
judging.** Do not replace them with "escalate when it seems subtle" — that is the version that erodes.

### STOP AND HAND TO THE OWNER FOR AN OPUS SESSION when ANY of these is true

1. **A ruling is requested or needed** — the executor's PR, handoff or pane contains `escalat`,
   `ruling`, `P2x`, or an explicit open question addressed to the controller.
2. **A `task-ledger.tsv` STATUS would change** — any `todo`/`claimed` → `done`, or any demotion.
   Promotion is the single act with the worst failure mode and the least loud failure.
3. **Two documents on `main` disagree about the same fact**, or a document contradicts a measurement.
4. **The gate is RED** — but FIRST check the log has a `Tasks:` line. **No `Tasks:` line means the gate
   did not run and it is a command error, not an escalation** (this cost a false alarm on 2026-09-02).
5. **The executor's report and the controller's own measurement disagree** about any number.
6. **A controller PR would touch anything outside `docs/`** — this already goes to the owner.
7. **NO WRITTEN PROCEDURE COVERS WHAT YOU ARE ABOUT TO DO.** This is the load-bearing one, because it
   converts *"know when you are out of your depth"* — which is unreliable — into *"check whether a
   procedure exists"*, which is checkable. **Never invent a procedure. The absence of one IS the
   trigger.**

### THE LOOP, which Sonnet runs — every step has a written procedure and a loud failure

Verify CI at the **exact head sha** (`gh api …/commits/<sha>/check-runs`; pending is not green) · merge ·
**restart the executor** · forced gate under **node 22** with `--force`, redirect to a file, read `$?` on
the NEXT line, grep for `Unsupported engine` · re-anchor with **re-measured** values · quote
`pnpm check:tasks` with its exit code read from a redirect, **never a pipe** · dispatch the next step ·
open and merge its own **docs-only** PRs.

**Two habits that are not optional, because both were violated by an Opus session today:** re-measure
every anchor at the sha you report, and never pipe a gate — `grep`'s exit code is not the gate's.

### RELAUNCH

    claude --model sonnet --permission-mode bypassPermissions \
      "$(cat /Users/kiro/my_projects/gisik-nokma-lanes/dispatch-controller-serial.md)"

**Escalations are relaunched with `--model opus`, same brief.** The brief's header was updated to say so.

**The honest argument against, recorded so it is not lost:** today the controller was the only party
between a wrong ledger and `main`. **The mitigating fact is that the EXECUTOR caught this controller's
worst bug** — the piped exit code hiding a red ledger gate — not the other way round. The two-session
split is doing real work independent of tier, which is what makes this change safe rather than merely
cheap.

## THE CONTROLLER RESTARTS ITSELF AT THE NEXT STEP BOUNDARY — owner-instructed 2026-09-02

**The owner instructed this directly.** This role has imposed a restart on the executor at every step
boundary all day and **has never once applied it to itself** — while the spend record has it at **39% of
$1,072, 1.4× the executor it supervises**, and context growth costs money *directly* because cache reads
are 68% of the bill.

**A controller cannot restart itself** — the restart is owner-issued (`/clear`) or owner-relaunched.
**So the obligation is to make it free, and that is what this file is for.** Before the next step PR
merges, confirm: anchors re-measured at the reported sha, every ruling written HERE and not only sent,
the ledger figure quoted from `check:tasks` with the exit code read from a redirect, and the executor's
position named by BRANCH rather than by sha. All four hold as of this commit.

    claude --model opus --permission-mode bypassPermissions \
      "$(cat /Users/kiro/my_projects/gisik-nokma-lanes/dispatch-controller-serial.md)"


- **RULING P23 (2026-09-01) — the `ScopeRevokedInstruction` blessing is SCOPE-WIDE ONLY; 6.101's
  per-event extension is settled by PROBE, not by the docblock.** Raised by the executor when the
  escalation condition set for it actually fired — the fix agent derived that the docblock *does* bless
  the itemised purge and kept the behaviour on that basis.
  - **Accepted:** the guest-side fix (`!isGuest` gate). M1 reddens exactly 2, M6 reddens 6 with 6.100
    green because it is an exclusion — each side killed only by the mutation that touches it.
  - **Blessing HOLDS at the revocation boundary, and is not reopened.** The decisive source is that
    `Features.md` line 120 **had already shipped this rule**, making the guest-side behaviour a failure
    to honour an existing contract rather than the fix inventing an allowance. A fix round does not
    reopen a shipped contract.
  - **It does NOT carry the per-event subtree purge.** The argument for extending it reasons about
    **cardinality only**, and the 6.14 precedent rests on cardinality **and relationship** — 6.14 is
    tolerable because the viewer ALREADY HOLDS THE CHILD. Drop the relationship axis and 6.14 stops being
    a precedent for anything; it degrades into "small leaks are fine", which is not what it says.
    The cardinality half is itself the wrong-subject class: *"one subtree per event is smaller than the
    whole workspace at once"* compares a **per-emission** quantity against a **per-boundary** one. The
    per-event walk fires far more often and nobody has measured the integral over a sync window.
  - **THE PROBE THAT SETTLES IT — and it needs no prior-audience reconstruction, so the 6.82/6.94
    second-definition ban does not block it.** The question is not historical: *does the member-side walk
    ever emit a purge for an entity that member's replica does not hold?* Build it like the probe that
    found the original Critical — member M, ticket N in a subtree M cannot see and never held, fire the
    trigger, read M's sync-down. **`purge:N` appears** → blessing does not reach it, gate it and disclose
    the under-purge residual as a sibling of 6.102 (stale local data is the safe direction, and the guest
    side already chose it). **Never appears** → relationship holds, it IS 6.14's shape, land it and
    **record the probe as the evidence, not the docblock.**
  - **The point of ruling it this way:** a docblock written for a bounded case must not become the thing
    that licenses the unbounded one. Making the code's measured behaviour the evidence is what stops that.
  - **RESOLVED THE SAME DAY — BRANCH ONE FIRED. DO NOT RE-RUN THIS PROBE.** No new experiment was
    needed: the fix round's own shipped test already answers it. Case 6.101 seeds ticket `foreign` in a
    project the viewer was **never on**, asserts `canSee(viewer, foreign) === false` immediately before
    the trigger, and then asserts ``expect(ids).toContain(`purge:${foreign}`)``. The member-side walk
    **does** emit a purge for an entity the member's replica does not hold. **Relationship absent →
    gate it**, accept the under-purge residual, disclose it as a sibling of 6.102. Prior audience is NOT
    to be reconstructed (6.82/6.94). 6.101's comment must be rewritten to state the relationship
    reasoning: it currently argues from spec §6 for the rejected conclusion, and **a false sentence a
    maintainer reasons from is worse than a missing one.**

- **P23 DISPOSITION (2026-09-01, controller `gisik-nokma-aa`) — the executor applied the ruling as
  DELETE rather than NARROW, and that is UPHELD. Do not restore the walk.** The escalation was written
  as an open question for a successor controller because `gisik-nokma-8d` became unreachable mid-step-7;
  it is now closed and must not be reopened without new evidence.

  **What carries the disposition, in order of weight:**
  1. **The blessed emitter survives.** P23 held the `ScopeRevokedInstruction` blessing at the revocation
     boundary; that path is intact. What is gone is only the per-event subtree tombstone.
  2. **The residual is UNDER-purge — stale local retention, no disclosure.** That is the direction P23
     explicitly named ("accept the under-purge residual, disclose it as a sibling of 6.102") and the
     direction the guest side had already taken.
  3. **The narrower project-membership gate is correctly refused, and this is the load-bearing half:**
     being on a container is not holding the entity, so that gate fails P23's own **relationship** axis
     and leaves the same disclosure at a smaller radius — precisely what P23 rejected for guests.
  4. **No conforming per-event emission exists**, because `proj_visibility` keeps no prior audience, no
     payload carries a before-image, and 6.82/6.94 forbid reconstructing one. **A gate with no gatable
     predicate is a deletion wearing a condition** — so DELETE and NARROW are the same act here, and the
     honest spelling is the one that leaves no dead branch behind.

  **CORRECTION, made the same day, to how this disposition was first written down.** The first version
  led with a measurement — *`git diff --stat origin/main origin/exec/04-t8-t14-enforcement --
  apps/server/src/visibility/visible-events-for.ts` was 495 insertions, **0 deletions** (measured while
  `main` was `eadc748`, before #57; re-run after #57 it prints 0/0)* — and called it "the fact that
  settles it." **It is not.** It establishes only that the walk never shipped to `main`, so nothing live
  regressed. **The escalation never claimed a regression.** Its own words are *"its footprint is wider
  than THE RULING named"* and *"what it cost BEYOND 6.101"* — a forward claim about scope: the residual
  now applies to all per-event triggers and to members, so the retention half of the gap Plan 10
  inherits (6.104) got wider. **That claim is true, and the never-shipped fact does not touch it.** It is
  supporting context, nothing more.
  **The executor was told otherwise and filed it against itself as a wrong-subject instance. It was not
  one, the attribution was withdrawn before its handoff was written, and it must not be counted in that
  tally.** By this file's own standard — *a false sentence a maintainer reasons from is worse than a
  missing one* — the correction belongs here at the same weight as the ruling. **A controller answering
  an escalation must answer the claim the escalation made, not the nearest claim its evidence refutes.**

  **Two further things that stand:**
  - **Do not cite case 6.100 as evidence that a purge gate exists** — it passes on the `canSee` guard
    that 6.16 already pins, not on anything purge-shaped. Stated on the case and in the test comment.
  - **The executor's correction to this project's own rule is upheld.** *"Nothing may be chained after
    the gate"* forbids a **trailing command in the same pipeline** stealing the status; it does **not**
    forbid reading `$?` on the next line. `pnpm turbo … > gate.log 2>&1` then `GATE_EXIT=$?` is correct
    practice, and **an inferred exit code is a self-inflicted downgrade from a read one.** The gate in
    the anchors above was taken that way.

- **Fable is not dispatched, for any role.** Sonnet default, opus by exception, hard cap **6 subagents per
  task**, one fan-out per plan, judgment fan-outs withdrawn. Cost ledger of what this trade has already
  cost is in the ruling — **add to it, do not re-argue it.** Note fable was the **premium** tier the
  ruling replaced with opus as "the ceiling" — not the cheap one. A controller got this backwards once.
- **CSRF ruling**: Plan 4 T5 owes HTTP-Origin on cookie-authenticated routes, `sameSite` set explicitly,
  and a sentence naming that the cookie assertion forbids a `Domain` attribute.
- **Plan 10 T4 is lifted to Phase 1** — the §11 envelope-origin closer. `fc904f4` closed only the client
  door.
- **Ruling P17** (new, this merge): `useLiveQuery(source, workspaceId, queryKey, load, debounceMs)` is a
  **breaking** signature change binding Plan 6 T10–T13 and Plan 10. Its unstated invariant — *the key must
  name every input `load` closes over* — is enforced by nothing.
  **P17's own "eight call sites" was wrong — there are NINE**, corrected in place by PR #45. The
  controller's dispatch said four. Both counts were wrong and the five neither named (5514, 6390, 6391,
  6395, 6396) sit in Tasks 11–13 — the only tasks not yet written, i.e. the ones that will be transcribed
  from that text. **A count asserted in two places can be wrong in both; recount from the file.**

## Traps that cost a round each if rediscovered

1. **Two "origin checks".** HTTP `Origin` header (CSRF) vs the event-envelope `origin` provenance enum.
   They meet in Plan 4 T5. Always say **envelope-origin** or **HTTP-Origin**.
2. **`docs/plan-3-chain-b-handoff.md` is read BEFORE Plan 3 Task 12, not during** — two tenancy hazards
   converge there, one a total outage presenting as a data problem.
3. **Clock tests: varying `TZ` is necessary and NOT sufficient.** Under vitest's `threads` pool,
   `process.env.TZ = zone` **does not move the clock** — a worker thread gets no process-level
   reconfiguration. T9's three zone tests were 32/32 green while the zone never moved. **A test that
   varies an ambient setting must also assert that varying it does something.** Binds Plan 9's Calendar
   and Timeline. Recorded as a ruling in the coordination doc at this merge.
4. **The integration checkpoint no longer fires** — replacement trigger is the Phase 2/3 boundary.
5. **A pre-ruling covers *who*, not *what*.** Reading "a pre-ruling covers this" and skipping the thought
   is the trap.
6. **A native-module false red.** See the Node section above. `sync-client` failing 4/8 is an ABI
   mismatch, not a defect.

## Method rules this role keeps breaking

Every one below was violated by a controller that had just written it. **Assume you are the next.**

- Never run a state-changing git command in a shell whose cwd was set for a read — use `git -C`. Violated;
  it swapped a live lane's worktree for 26 seconds and contaminated a running review.
- **A gate's exit code is the LAST command's exit code.** The known form is the pipe (`| tail` reports
  `tail`'s status). It was re-hit 2026-08-31 in a new costume: a trailing `echo` made the harness report
  **"exit code 0"** for a gate whose summary said `Tasks: 11 successful, 18 total / Failed:
  sync-client#test`. **Read the `Tasks:` line. It is the only honest signal.** Write the exit code INTO
  the log (`echo "TURBO_EXIT=$?" >> log`), never after a pipe.
- **I PIPED THE LEDGER GATE AND READ `grep`'s EXIT CODE, FOR FOUR CONSECUTIVE MERGES.** Found 2026-09-02
  by the **executor**, in PR #70, which correctly said *"`check:tasks` fails and is not this branch's —
  owner: the controller."* Every check I ran was `pnpm check:tasks 2>&1 | grep -E 'VERIFIED|todo'`.
  **The summary printed `88/177 (49.7%)` while the command was exiting 1.** I even wrote
  `; echo "CHECK_EXIT=$?"` once and it printed `0` — **`grep`'s status, because the pipe was still
  there.** The tell was available and I filtered it out: the report carries a
  `ROWS CLAIMING done WITH NO EVIDENCE` section, and my grep pattern could not match it.
  **The defect it hid was also mine.** The audit's applier set status, sha and note on the 14
  `todo → done` rows and **never set the `pr` column**. `claimed → done` rows already carried one —
  which is exactly why the bug was invisible in the 32 and present in the 14.
  **Third costume of the entry directly above** (`| tail`, then a trailing `echo`, now **a `grep` whose
  pattern cannot match the failure section**, so the output reads as a clean report). Committed inside
  the instrument built to catch drift, while writing about falsifiability.
  **Redirect to a file, read `$?` on the NEXT line, grep the file afterwards — and grep the FAILURE
  vocabulary, not only the success vocabulary. A filter that can only show you good news is not a check.**
- A rule does not reliably fire on its author. **The executor caught three controller errors on its first
  day**, each in an artifact the controller had just written *and verified*.
- Over-caution has a price here. Blocking a restart on a documentation merge spends session carriage —
  66% of all spend — to protect against a risk already closed.
- **A pointer from a correct document to a stale one does not drift; it reverses, deterministically.**
- **A control must be on the fact you are claiming, not merely in the same file.** Blocked a restart on
  "main's handoff has zero matches for `21 behind`", with `editor-client` hitting 3 as the control. The
  control was sound and the conclusion was false: main said **20**, and carried the whole recon. **A
  working search for the wrong term is still the wrong test** — it proves the probe is alive, not that the
  fact is absent. Search for the fact (`packages/domain/src/index.ts`), never for your own number.
- **Delta counts are not facts, they are readings.** That branch went 20 → 21 → 23 behind inside one
  session. Write "N as of <when>, and still moving", never a bare digit. Note also that `**two**
  conflicts` will not match a search for `two conflicts` — bold markers sit inside the phrase.
- **A ✅ written from the implementation is not evidence; only one written from the test is.** The
  executor's own catalogue was wrong **four times** before it checked — claims drafted from source and
  commit messages, then corrected by reading actual test names: a wrong file cited, a property no test
  asserts, a round-trip described as a direct test, and a 🚫 that two tests document as current behaviour.
  **The drift the catalogue exists to prevent, arriving during its creation.** Honest limit, stated in the
  bucket rather than implied away: **no test in this repo cites a case id in either direction**, so a ✅ is
  checkable by reading the named file and not by grep (owner workspace/Plan 11).
- **A claim that a test CANNOT fail needs the same mutation evidence as a claim that it can.** A recorded
  ruling called T4's Escape defect vacuous because the library calls `dispatchExit` unconditionally —
  right about the library, wrong about the test: deleting `container?.remove()` reddens it. One of three
  assertions was dead, not the test. **"Vacuous" invites deletion**, so a too-wide verdict licenses
  removing a working check. The controller propagated this one in a dispatch while simultaneously
  demanding mutation proof for the positive claim.
  > **THE PAIRED-MUTATION RULE — this is the demonstration the entry above never shipped.** Recorded
  > 2026-09-01 from T11's review, the first time the discrimination was run cleanly. **A mutation that
  > kills nothing is not evidence of anything until a mutation that DOES kill has run beside it, in the
  > same suite and the same run.** Measured: deleting the `canSee` guard reddened **7 of 16** cases —
  > genuinely tested — while a `throw` in the non-guest re-grant arm left **343/343 green** — never
  > executed. Alone, "343/343 green" is equally consistent with a coverage gap and with an unexecuted
  > path, and those two demand opposite responses (write the test vs. delete the branch). The green run
  > is only interpretable next to the red one. **Pair them or report neither.**
- **AN INABILITY TO TELL TWO CASES APART IS A REASON TO TAKE THE SAFE BRANCH, NOT A LICENCE TO TAKE THE
  UNSAFE ONE.** Found 2026-09-01 inside case 6.101's own comment, which argued the disclosure was correct
  because `canSee` now is *"true of a ticket taken away and equally true of one never held, and this
  module cannot ask the other question."* That is reasoning FROM an inability TO a permission. The module
  cannot distinguish *lost access* from *never had access*, and it resolved the ambiguity toward the
  disclosing branch. The guest side had already been gated for precisely this; the member side inherited
  the same blind spot at a different radius and defended it in a comment.
  **The tell is a sentence of the form "X and Y are indistinguishable here, so we treat both as Y" where
  Y is the permissive case.** The valid inference from indistinguishability is always toward the
  conservative case — here, retaining stale local data rather than emitting an id. Under-purge is
  recoverable by a resync; a disclosure is not recoverable at all.
  **And note where it was hiding: in a test's explanatory comment, next to a passing assertion.** The
  test encoded the wrong behaviour AND the argument for it, so reading the test as documentation
  propagated the defect. A green suite is not evidence the behaviour it pins is correct.
- **THE INSTRUMENT'S SCOPE IS NARROWER THAN THE CLAIM BUILT ON IT — three instances, so stop calling it
  a coincidence.** Each time the probe was real, it ran correctly, and it answered truthfully about a
  narrower subject than the sentence written from it. **A right answer about the wrong subject.**
  1. `git merge-tree --write-tree` answers *"did this conflict"*; it was read as *"is this redundant"*.
  2. `@{u}` answers *"ahead of the upstream this branch was created with"* — `origin/main` — and it was
     read as *"pushed"*, truthfully returning `0 6` right after a successful push.
  3. `pnpm exec node -v` answers for **`pnpm exec`**; it was read as *"pnpm"*, and `pnpm run` — the
     command every gate actually uses — behaves differently.
  4. `git checkout -- <path>` restores from the **INDEX**; the sentence built on it was *"restored to
     HEAD"*. After an earlier `git checkout <sha> -- <path>` staged the old content, the "restore"
     truthfully put the PRE-FIX files back and reported success. Found by the executor 2026-09-01,
     caught by reading the files for named markers rather than by trusting the command's exit.
  **SUB-PATTERN, now two of the four: a git command that takes an IMPLICIT ref resolves a different one
  than the writer assumed, and reports success either way** (`@{u}`, `checkout --`). **So name the ref:**
  `git checkout HEAD -- <path>`, `origin/<branch>...HEAD`. Never the bare implicit form.
  **The check: name the subject your instrument actually ranged over, then reread your sentence and see
  whether it names the same one.** All three passed every falsifiability test that was applied, because
  those tests asked whether the instrument WORKED, and the instrument did work. None asked what it was
  pointed at. Note this is the one failure class in this file that a positive control cannot catch.
- **An over-specific search returns a false negative that looks like a finding.** Searching all 12 plans
  for Plan 4's *exact* wording of the catalogue rule found it in **one** file; searching for the rule
  loosely found it in **all 11**. Same class as grepping for `21 behind` when the file said `20`.
  **Search for the fact in the vocabulary the other author would have used, not in yours** — and print the
  rows, because two of the twelve returned blank rather than `0`.
- **A RIGHT ANSWER ON DEAD EVIDENCE is worse than a wrong one** — a wrong answer gets caught; a right one
  confirms the method that produced it. P21's role/mode asymmetry was established by widening a union in
  `packages/domain/src` and compiling `apps/server`, which resolves that package through
  **`dist/*.d.ts`** — the edit never reached the compiler under test, so `tsc` exiting 0 was equally
  consistent with the finding and with a blind instrument. This is the **stale-`dist`** trap in its
  *type-level* form; the mutation form is already recorded. Both fail as a **quiet pass**, never an error.
  **Prove the instrument can see before reading it**: rebuild, then confirm a probe (`const _probe:
  WorkspaceRole = 'viewer'`) does NOT error. And prefer a check whose **count** discriminates — the fix
  raised exactly two `TS2366`s, one per file, where one would have meant a single switch was load-bearing.
- **Name the ref; don't trust the symbol.** I prescribed `git rev-list --left-right --count @{u}...HEAD`
  to verify a push. `@{u}` is whatever upstream the branch was *created* with, and
  `git checkout -b <n> origin/main` sets it to **`origin/main`** — so it returned `0 6` right after a
  successful push, truthfully answering a question nobody asked. Use `origin/<branch>...HEAD`.
- **`git cat-file` also lies from a SIBLING WORKTREE, not only the reflog.** Worktrees share one object
  store, so an unpushed commit resolves as `commit` from the main clone and reads as landed — fooling the
  *reviewing* session, which is the party least able to suspect it. `git branch -r --contains <sha>`
  (empty = on no remote) is the discriminating check. Caught two unpushed rounds this way.
- **PRINT THE ROWS, NOT THE COUNT, whenever a count is about to decide something.** Four instances in one
  day, one cause: a proxied `grep -c` silently reformatting its output; a `merge-tree` stat whose 11-line
  "difference" was **conflict markers**; a regex counting `9.1`/`9.34` out of prose *describing* a reserved
  range; and an idle check where a `✻` inside a "done" line made a finished session look busy. Corollary:
  when the rows are too many to read, print the first few **and** the count — the disagreement is the signal.
- **`git merge-tree --write-tree` writes conflict markers INTO the tree**, so comparing its output tree to
  `main`'s answers *"did this conflict"*, never *"is this redundant"* — a conflicting branch can never
  compare equal whatever its content. The tell for any instrument: **could it produce the answer that
  would clear the subject?** If not, it is not a check.
- **Verify a count by enumerating and marking, with the marker string counted as a control** so a zero
  cannot come from a sweep that matched nothing. Method from the executor, after the controller and
  Ruling P17 asserted two different wrong counts for the same thing.
- An artifact's author is the worst-placed party to report its contents. *(Corollary earned this merge:
  verifying an author's claims is cheap and it worked — every claim in the PR #43 handoff held, including
  four shas my naive `--contains` sweep called orphaned that the file itself labelled "do not cite".
  **A sweep that cannot tell "cited as live" from "marked dead" produces false defects.**)*

## The monitor's blind spot: it cannot see an idle session

**Measured 2026-08-31: the executor idled ~55 minutes on a full quota and nothing reported it.** It armed
a `sleep`-based wake-up for the 18:00 reset; the timer was **still alive at 59:11 for a 24-minute wait**,
output frozen at `waiting 1432s`, and it never fired. The owner noticed, not the controller and not the
monitor — the monitor watches `main`, open PRs and pane membership, and **has no signal for "a session is
idle when it should be working."**

**Do not close this with `#{window_activity}`.** I tested it before building on it: both windows returned
**identical** timestamps incrementing in exact lockstep with wall-clock (`…735 → …740 → …745`, +5 per
5-second sample). It tracks the clock, not activity, so a monitor built on it reports "active" forever —
**including for a dead session.** An idle detector structurally incapable of detecting idleness.
A workable signal is hashing `capture-pane` output (a working pane animates, an idle prompt does not);
~~unbuilt, because the threshold needs tuning against how long a legitimate fan-out stays quiet.~~
**BUILT — that is `com.kiro.claude-idle-nudger` in the table above, and it is the instrument that closes
this gap.** Verified loaded 2026-09-01 19:40 IST alongside the other two:
`launchctl list | grep -i claude` → `com.kiro.claude-idle-nudger`, `com.kiro.claude-limit-resumer`,
`com.kiro.claude-net-resumer`, all present. **Check this after every controller relaunch too** — unlike
the shell monitor these are launchd agents and genuinely do outlive the session, but that is a fact to
confirm rather than assume, and the nudger was still being debugged the morning of the same day.

**Second blind spot, demonstrated by the monitor itself.** The controller killed the `exec` window and
relaunched a fresh session into a new window of the same name. The monitor reported **no** `LANE PANES
CHANGED` — it compares the sorted pane-NAME set, which was `exec,main` before and `exec,main` after. **It
cannot see a session being replaced, nor one dying if anything takes the name back.** Combined with the
idle gap: the monitor answers *"did the repo move"* well and *"is anyone home"* not at all.

**Until then the controller tracks boundaries itself.** If you approve a hold-until-time, you own the
clock; do not approve one and then stop watching, which is exactly what happened here.

## The watch monitor — do NOT re-arm it blindly

A persistent monitor runs on `origin/main`, the open-PR set, and tmux pane membership. **It survives
`/clear`** — it is a shell child of the session process, and `/clear` ends the context, not the session.
Confirmed by observation 2026-08-31: it fired the `60bc7ca` event into a freshly cleared context.

**Check before re-arming: `pgrep -fl prev_main`.** Re-arming a live monitor gives you two and duplicate
events on every merge. It emits only on change — long silence means nothing changed, not that it died.
~~Currently alive as **PID 78292**.~~

> **BUT IT DOES NOT SURVIVE A CONTROLLER RELAUNCH, AND THAT IS THE CASE THIS ENTRY WAS MISSING.**
> Found 2026-09-01 by the controller that replaced `gisik-nokma-aa`: `pgrep -fl prev_main` returned
> **nothing at all**. "Survives `/clear`" and "survives a relaunch" are opposite consequences of the
> *same* fact — the monitor is a child of the **session process**. `/clear` ends the context and keeps
> the process; **an owner relaunch (or `tmux kill-window`) ends the process and takes every child with
> it.** The old entry recorded the reassuring half and pinned a PID that could not outlive its parent.
> **So: expect it ABSENT after any controller relaunch, and re-arm as a startup step** — the
> `pgrep` check is for the `/clear` case only. And note the ordering hazard: the controller is relaunched
> at exactly the moments the repo is most likely to move.

**The re-armed version fixes the zero→one guard; the script is not the one described above.** Live as of
2026-09-01 19:40 IST, source in the session scratchpad (`ctl-watch.sh`), three changes:
1. `prev_prs` / `prev_main` initialise to a **sentinel**, not `""`. The old guard `[ -n "$prev_prs" ]`
   is false whenever no PR is open, which suppressed **exactly the step-PR-appears event the serial loop
   turns on** (the third blind spot below). The sentinel suppresses only the startup emission.
2. Every remote call is wrapped in **`perl -e 'alarm shift; exec @ARGV'`** — there is **no `timeout` or
   `gtimeout` binary on this machine** (checked; both absent), so this is what stops a wedged
   `ls-remote` freezing the loop for hours the way one did for 5h16m.
3. It watches the exec window by **presence** (`window_index` 1), so a session *dying* emits even though
   the pane-NAME set is blind to a session being *replaced* (the second blind spot).

**Its reader was proven live before it was trusted:** `--state open` returned empty while the identical
query at `--state all` returned #61/#60/#59. An empty open-PR set that is a real zero, not a broken probe.

> **THIRD BLIND SPOT, and it is on the event this role most needs: it cannot report the FIRST PR.**
> The guard is `[ -n "$prev_prs" ] && [ "$prs" != "$prev_prs" ]`, and `prs` is the empty string when no
> PR is open. So the **zero → one** transition is indistinguishable from "no previous reading" and is
> suppressed. With the open-PR set usually at zero here, that is exactly the step-PR-appears event the
> serial loop turns on. **Poll `gh pr list` yourself; do not wait to be told.**
>
> **FOURTH: `pgrep -fl prev_main` returning a PID does not mean the monitor is running.** Found alive
> 2026-09-01 with its `git ls-remote origin main` child stuck for **5h16m** — the loop was blocked
> inside a command substitution and had reported nothing since 04:58, while `ls-remote` run by hand
> completed in 0.002s. Liveness is the CHILD's age, not the parent's existence:
> `pgrep -P <monitor-pid>` and read the etime. A child older than the 180s poll means it is wedged;
> `kill` that child and the loop resumes. Note the cost of the recovery — `prev_main`/`prev_prs` reset to
> empty, so the first change after the kill is suppressed by the guard above.

It costs **zero tokens** — a shell loop that wakes the session only on a real event. **If it is genuinely
gone**, re-arm change-triggered on a 180s poll against `git ls-remote origin main`, `gh pr list --state
open`, and `tmux list-panes -s -t gisik`.

Note its wording is one-directional: a pane being ADDED also reports "a lane may have exited."

## ✅ THE LEDGER AUDIT IS DONE — executed 2026-09-02, NOT at the step-9 boundary

**`pnpm check:tasks` at this commit: `VERIFIED COMPLETE: 72/177 (40.7%)`, `claimed: 0`, `todo: 105`.**
Quoted from the gate, not computed here. Was 26/177 (14.7%) with 33 claimed.

### THE REASON THIS WAITED FOR STEP 9 WAS FALSE, AND I WROTE IT

I recorded, and told the owner, that the audit had to wait because *"`task-ledger.tsv` is the one file
both sessions write."* **It is not. It is controller-only.** Measured three ways: the executor's live
branch does not touch it (three-dot diff, empty); only **two commits in the file's entire history**
modify it, #55 which created it and #60, both controller PRs; the executor maintains
`executor-state.md` and the coordination doc instead. The owner asked *"will the audits happen after
plan 5 merge?"* — and the honest answer was that the constraint I had invented did not exist.

**And the first check I ran on it was wrong in the same family as everything else in this file.**
`git diff --name-only origin/main origin/exec/05-api-realtime -- docs/` reported `controller-state.md`
as changed by the branch. **It was changed by `main`** — by my own four doc PRs since the fork.
**Two-dot compares two trees; three-dot compares against the merge base.** Use `origin/main...<branch>`
whenever the question is *"what did the BRANCH change."* Third instance of *name the ref, don't trust
the symbol* in one session.

**GENERAL FORM, and it is the expensive one: a constraint you invented is still a constraint you must
re-derive before obeying.** This one delayed approved work behind seven unrelated tasks, was repeated
to the owner as fact, and was only caught because the owner asked a scheduling question. **The
inherited rules in this file get re-measured on every restart; the ones a controller writes mid-session
get obeyed.**

### WHAT WAS APPLIED — 46 rows, all with per-row artefact evidence

- **32 promoted `claimed` → `done`**: Plans 1 (15) and 2 (13) per Ruling A, plus 03/T1, 03/T2,
  06/T9, 07/T4.
- **14 promoted `todo` → `done`**: 04/T1–T3 · 06/T1–T4 · 07/T1–T3 · 10/T1, T2, T3, T8. These were
  rows whose work had landed with **no ledger row citing it** — and `check:tasks` had been printing
  their PRs (#20, #22, #30, #16, #47, #23) in its unattributed-PR list on every run, under the
  understated figure, unread.
- **1 demoted `claimed` → `todo`**: **11/T6.** `docker-compose.dev.yml` was never added to `main`.
  The only row in the ledger that was concealing work which had not shipped — and the entire
  justification for the `done`/`claimed` split existing.

### 3 OF THE 17 CANDIDATES WERE REFUSED — and the reason generalises

**07/T16, 10/T18 and 11/T14 stay `todo`** although every declared artefact is present. Each is a
**final-catalogue-and-verification task**, and its files exist because *earlier tasks in the same plan
catalogued themselves* — the same-change-set rule is series-wide, so `test-cases/NN.md` exists from
task 1 onward. Plan 10 has 13 tasks unrun; Plan 11 has 15; PR #10's own subject calls itself a
**"CI skeleton."**

> **THE RULE: artefact presence is NOT evidence for a task whose job is to catalogue or verify OTHER
> tasks.** Such a task cannot be complete while the things it must sweep do not exist, whatever its
> files say. Check the structural precondition — *have the tasks it catalogues actually run?* — never
> the file. This is the `docToPlainText` precedent in its second costume: a file on `main` that a
> different task put there. It would have promoted 3 rows wrongly, and the two instruments that
> approved the other 14 (artefact present, declared tests present) both said yes to all three.

### The instrument that did this, and its guards — all four proven to fire

Idempotent by construction: a row already in its target state **with the expected sha** is a no-op; the
same row with a **wrong** sha still errors. Every guard was mutation-tested against scratch copies with
a passing control beside it — non-ancestor sha, wrong starting status, missing row, wrong sha under
idempotency. **The working tree was never used as a test fixture.**

## Pending owner decisions

1. ~~**The executor's advisor is running on Fable.**~~ **RESOLVED, no owner action needed** — its status
   line now reads `advisor: opus`. Recorded only so the question is not re-raised: `advisor:` is harness
   session config, not a dispatch, and the ruling's three named roles are all dispatch roles. Had it still
   been fable it would have been an owner scope call, not a controller one (trap #5).
2. **The declared Node engine is unenforced.** `engines` demands `>=22 <23`, the machine defaults to 24,
   and there is no `.nvmrc` *and no `.npmrc`* — so without `engine-strict=true` pnpm accepts the wrong
   Node silently. The fix is two lines (`.nvmrc` + `engine-strict=true`), but it turns an unsupported Node
   into a hard refusal and so needs a CI run to prove it does not break the pipeline. Recorded by the
   executor with owner **Plan 11**; surfaced here because it wants an owner decision, not a plan slot.
   The controller does not implement.

## Controller context discipline

Measured 2026-08-31: this role ran **655 requests at 404K average context, rising 165K → 609K per request
across the session** — worse than any session it was policing. **The controller is the most expensive
session in the topology and should restart itself at decision boundaries on the same terms it imposes on
the executor.** Its restart is owner-issued (`/clear`) or owner-relaunched; this file is what makes that
free rather than destructive.
