# Cross-lane controller — live state

**This file is the controller's restart surface.** A controller relaunched from
`gisik-nokma-lanes/dispatch-main-controller.md` recovers only what is written here. Refreshed at every
decision boundary.

> **Shas in narrative prose below are facts about when they were written.** Verify anchors with
> `git branch --contains` — empty output means orphaned. `git cat-file` passes on reflog-only commits and
> will lie. This file lives on `main` deliberately: an earlier handoff was tracked, pushed, and stranded on
> a branch that had already merged, so a restart read a copy 70 lines out of date. **Once the branch
> carrying a handoff merges, the next update branches off `main`.**

## Anchors — verified 2026-08-31, at `c93c910`

| what | value |
|---|---|
| `main` | `27dba39` **as of 05:10 IST 1 Sep — goes stale by design.** #50 (this file) merged after `33538be` |
| last forced gate | **`33538be`** — 21/21, 0 cached, **1070 tests**, `TURBO_EXIT=0`, node **v22.22.2**. Still valid at `27dba39`: delta is doc-only |
| gate composition | domain 276 · rule-engine 278 · server **275** · app-core 130 · editor 72 · ui 31 · sync-client 8 |
| **gate ran under** | **node v22.22.2** — see the Node section below before you trust any gate |
| collision surfaces | fixtures **84** · projections **5** (`contested`, `entity_heads`, `memberships`, `visibility`, `workflows`) · packages 6 |
| open PRs | none at time of writing — **re-measure** |

**Re-measure everything above on resume.** Recount at the sha you report; do not carry a composition
forward — five of six package counts staying right is what makes the sixth invisible. `app-core` went
92 → 130 at this merge, which is the kind of move a carried-forward composition hides.


## Task-level progress is now tracked — stop reconstructing it

`pnpm check:tasks` (`scripts/check-task-ledger.mjs`) reports task-level completion from
`docs/lanes/task-ledger.tsv`, one row per `### Task N:` heading across the eleven plans. **Do not
recompute a progress figure from prose again — run the gate and quote it.**

- **The denominator is derived, never typed.** 177 tasks (167 plain + 10 lettered). The earlier "167
  total" was produced by `grep -cE '^#+ *Task '`, which returns **BLANK, not 0**, for plans 08 and 11 —
  both have very long lines. The gate carries a positive control so a reader that drifts fails loudly
  instead of reporting an empty backlog as clean.
- **Two numbers, deliberately not one.** `done` = a PR naming that exact plan+task whose **merge** sha is
  an ancestor of `origin/main`; `claimed` = asserted at plan or branch granularity only (the whole of
  Plans 1 and 2), never counted as complete. **At `edbb940`: 17/177 verified (9.6%), 29 claimed but
  unaudited (16.4%), 4 in-flight, 127 todo.** The familiar "~43%" folded all of those together.
- **Evidence is the MERGE commit.** This repo squash-merges, so an implementing commit is not an ancestor
  of main once its PR lands — recording one false-REDs a finished task. Proven by mutation: `876e170`
  (real, on the live exec branch, in the shared object store) is correctly rejected.
- **Rejected and recorded so it is not re-tried: fenced-code stripping.** It looks obviously right and it
  drops the count 177 → 166, removing the real tail headings of plans 06 and 07, which carry an **odd**
  number of ``` markers. It fails toward "more complete" while every per-plan count stays non-zero, so
  the positive control cannot see it. Rationale is in the script header.
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

- **The controller merges the executor's work and NEVER its own.** Its own doc PRs go to the owner. This
  is the check the two-session split exists to provide.
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

> ### ⚠ IN-FLIGHT NOW — `exec/04-t8-t14-enforcement` (step 7)
> **Cut from `main` at `33538be`, 7 commits, pushed.** T8, T9, T10 landed; **T11 (floor-list) running**;
> T12 + **T13 (BLIND — its dispatch must carry 6.52/6.53)** then T14 (floor-list) follow. Branch gate
> **1115 tests**. `main`'s executor handoff is a step behind and does not name this branch — **hand it to
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
- **THE INSTRUMENT'S SCOPE IS NARROWER THAN THE CLAIM BUILT ON IT — three instances, so stop calling it
  a coincidence.** Each time the probe was real, it ran correctly, and it answered truthfully about a
  narrower subject than the sentence written from it. **A right answer about the wrong subject.**
  1. `git merge-tree --write-tree` answers *"did this conflict"*; it was read as *"is this redundant"*.
  2. `@{u}` answers *"ahead of the upstream this branch was created with"* — `origin/main` — and it was
     read as *"pushed"*, truthfully returning `0 6` right after a successful push.
  3. `pnpm exec node -v` answers for **`pnpm exec`**; it was read as *"pnpm"*, and `pnpm run` — the
     command every gate actually uses — behaves differently.
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
unbuilt, because the threshold needs tuning against how long a legitimate fan-out stays quiet.

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
Currently alive as **PID 78292**.

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
