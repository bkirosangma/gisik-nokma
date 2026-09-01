# Serial executor — live state

**This file is the restart surface.** A controller that kills and relaunches the executor from its
brief recovers only what is written here. Refreshed at every task boundary.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document in this
> repo — the dispatch brief, the Chain B handoff, the coordination doc's sections, the narrative
> parts of this file — is a fact about the moment it was written. Anchors in the table below were
> verified with `git branch --contains` (empty output = orphaned), never with `git cat-file`, which
> passes on reflog-only commits and hands you pre-rebase content while looking like it worked.

## Live anchors — 2026-08-31, rewritten after the step-4 recon was found WRONG

**The previous version of this file told a restarted executor to rebase `exec/04-auth-visibility` and
called it "the largest rebase left in the series." That instruction was live and wrong. Do not do it.**
The branch is **fully redundant**: all four of its commits are already on `main` under different shas,
and `git cherry -v origin/main origin/exec/04-auth-visibility` prints `-` (already upstream) for every
one of them. There is no rebase in step 4.

| Anchor | Value | How verified |
|---|---|---|
| Branch in flight | **`exec/05-api-realtime` @ `c3b1090`** — **REBASED ONTO `origin/main` 2026-09-01.** **STEP 9 (Plan 5) IN PROGRESS.** | `git log`, `git branch -r --contains` |
| `main` | **`00cb2e0`** — steps 7 and 8 BOTH MERGED (#57 → `dd7bfcf`, Chain B → `6cb631d` via **#59**, not #58), then the controller's docs-only **#60 → `00cb2e0`**. **REFETCH before trusting this** | `git log origin/main` |
| `exec/04-auth-visibility`, `exec/04-t4-t5-permissions` | **Both merged/redundant — safe to delete.** NOTE: `cherry` returns `+` for all 10 of `t4-t5`'s commits **even though #51 merged them**, because #51 was SQUASHED. Main's subject ends `(#51)` — that suffix is the marker | `git cherry -v`, `git log -1 --format=%s` |
| Node | **v22.22.2** under the brief's PATH export. Machine default is **v24.11.1**, outside `>=22 <23`, enforced by nothing | `node -v` |
| Orphaned, do not cite | `52520b0`, `72a7e3e`, `30e3db4`, every pre-squash sha of the Phase 0 branches, and **NEW 2026-09-01: `6d15e50`, `96a6ff3`, `400fbfc`, `95004e1`** — Plan 5 batch A's PRE-REBASE shas, killed by the rebase below. An earlier version of this very file cited all four as live. | `git branch --contains`, empty = orphaned |

## THE RULE THIS COST US, and it generalises to every remaining rebase

**`git cherry` belongs BEFORE the pre-rebase gate rule fires. An ahead-count is not a work-count.**

`git rev-list --left-right --count` measures **commit identity**; `git merge-tree` measures **a merge**.
Neither asks the only question that matters — *is this content already upstream?* A branch whose commits
were rebase-merged keeps its own shas, so it reports "4 ahead" forever while contributing nothing. The
previous recon read `30 / 4` plus two real conflicts and concluded there was a large rebase to perform.
Both readings were accurate; the conclusion was false.

**The cheapest way to make a rebase gate unnecessary is discovering there is no rebase.** For every
remaining branch in the serial order, run `git cherry -v origin/main <branch>` FIRST. `-` on every line
means delete the branch and start from main.

**Cost of learning it late:** a pre-rebase gate was run at `5c71689` per the coordination doc's rule —
**green, 15/15 tasks, exit 0, 488 tests, Node v22.22.2**. It is recorded here as a footnote only. It
measured a tree strictly *behind* main and is **a control for nothing**. Do not place 488 beside any
main-derived total: they are different trees, and a total that rises without decomposing is exactly what
the coordination doc warns against.

## Gate composition — recounted at the sha being reported (step 6 complete)

**GREEN.** Redirected to a file, **never piped, nothing chained after it** — any following command
becomes the status you are shown, a bare `echo` included.

| Measure | `main @ 40c5219` | step 6 final |
|---|---|---|
| **Node** | v22.22.2 | **v22.22.2** |
| Exit code | 0 | **0** |
| Turbo tasks | 21/21, 0 cached | **21/21, 0 cached** |
| **Tests** | **1032** | **1070** |
| **server** | 237 | **275** |
| domain 276 · rule-engine 278 · app-core 130 · editor 72 · ui 31 · sync-client 8 | unchanged | unchanged |

**The delta decomposes: +38, entirely in `apps/server` (237 → 275)** — `contest-coherence.test.ts` 13 ·
`contest-coherence-door.test.ts` 6 · `contested-projection.test.ts` 6 · `contests-route.test.ts` **8**
(7 from the task + **1 added by the Minor fix**, the `open=false` refusal) · `engine-context.test.ts` +4
· `verify-projections.test.ts` +1. Every other package is unchanged, as it must be — step 6 touches only
`apps/server`, and the one `packages/` file it reads it does not modify.

**The jsonb column was validated by OBSERVATION, not by reasoning from the type name.** The contract
forbids `json` because it has no equality operator and the verifier's `EXCEPT` diff needs one.
`original_event` is this repo's **first `jsonb` projection column**, so whether the ban extends to it was
an open question. Measured: a real contest committed, `verifyProjections` clean; one live cell tampered
via `jsonb_set` → `{clean:false, tables:['proj_contested']}`; cell restored → clean again. **jsonb
satisfies the requirement the `json` ban is about, and the instrument was proven live in the same run.**

## What was verified about step 4's surface, so the next session does not re-pay for it

| Claim | Finding | How |
|---|---|---|
| Coordination-doc conflict would lose content | **FALSE — nothing to re-append.** The branch's 154-line §7 block is **byte-identical** on main. The one-line diff seen initially was the extraction picking up main's *next* heading (`### 8. The envelope-origin gate has landed`) | `git diff --no-index` over both extracted blocks |
| `app.ts` conflict would lose content | **FALSE.** Main's `app.ts` is a strict superset — it has the branch's `auth: Auth` block *and* the `ingest: ClientIngest` narrowing the branch lacks | read both blobs |
| T5 is unstarted | **PARTLY FALSE.** T5's **first branch already landed on main** via `fc904f4`: `checkPermission`, `SERVER_ORIGIN_RULE`, `SERVER_ORIGIN_REASON`, and the `SubmissionGate` type — which its own comment says was "named as a type so Task 5 can widen it to carry the session (`(env, session)`) without every call site changing shape." **T5 WIDENS; it does not create.** | read `apps/server/src/permissions/check-permission.ts` on main |
| T4 is unstarted | **TRUE.** `proj_memberships` appears on main only in doc comments — `registry.ts`, `engine-context.ts`, plan text. No implementation file, and `buildProjectionRegistry` registers exactly two projections | `git grep`, read `projections/index.ts` |
| CSRF anchor line | **`sign-in-flows.test.ts:148` on `main @ 91df593`**, content confirmed: `expect(attributes).toEqual(['Max-Age=604800', 'Path=/', 'HttpOnly', 'SameSite=Lax']);` — re-verified on main, not merely on the stale branch, because T5 item 3 anchors a sentence to a line and line numbers drift across a rebase-merge | `awk` over the blob at `origin/main` |
| `docs/` affects the gate | **NO.** `turbo.json` declares no `inputs`, and `docs/` sits outside every package, so a docs-only merge cannot move gate composition. **PRs #48 and #49 were both docs-only** — do not re-run a gate to "check" them | read `turbo.json` |

## Where I am in the serial sequence

**STEPS 7 AND 8 ARE MERGED.** `main` = **`00cb2e0`**. **RULING P23 IS SETTLED — see below.**

**STEP 9 (Plan 5, the hinge, 17 tasks) IS IN PROGRESS on `exec/05-api-realtime`.**
**BATCH A ONLY IS DONE: T1 and T2, plus T2's fix round. T3 ONWARD IS NOT STARTED.**

Gate **re-run at the post-rebase sha `c3b1090`**, not carried over from the pre-rebase run:
**exit 0 READ (not inferred), 21/21 (0 cached), 1321 tests**, zero `Unsupported engine` WARNs,
**Node v22.22.2**. domain 314 · rule-engine 280 · **server 486** · app-core 130 · editor 72 · ui 31 ·
sync-client 8. (Sum checks: 314+280+486+130+72+31+8 = 1321.) The rebase moved only docs, so composition
could not have shifted — but it was measured rather than argued, because *docs-only* was itself a claim.

### THE SEAM — exactly where a successor picks up

**Plan 5 has THREE commits of its own**, now sitting directly on `origin/main` (`00cb2e0`) after the
rebase. **These are the POST-rebase shas; the pre-rebase ones are orphaned and listed in the anchors
table above:**

| sha | task |
|---|---|
| `b5a776c` | **T1** `docToPlainText` — closed a termination gap the pulled-forward walker shipped with |
| `3c107c4` | **T2** FilterSpec + the injection-proof compiler |
| `9286404` | **T2's fix round** — the NUL byte, and a guard that fired on correct code |

**Four files are Plan 5's whole surface so far:** `packages/domain/src/doc-text.ts` (+31),
`packages/domain/src/filter-spec.ts` (+63), `apps/server/src/read/compile-filter.ts` (+116),
`apps/server/src/read/sql-params.ts` (+27). `Features.md` **§7** and
`test-cases/07-api-realtime-search.md` were **opened by T2 in its own change set.**

**NEXT: Plan 5 Task 3** (`workspace.settings_set`, plan line 628), then T4 (883).
**Floor-list in this plan: T5 (1213), T9b (3183), T14 (4918), T15 (5452).**

## THE PLAN 5 ADAPTATION MAP — three compile-breaks, one of them at EIGHT sites

Run 2026-09-01, one sonnet agent, read-only against `git show origin/main:<path>` blobs (never the
working tree, because an implementer was editing it concurrently). **Positive control: 26 cross-module
symbols checked and found to MATCH main exactly** — a map reporting drifts and no matches would mean a
broken method rather than a broken plan, so the matches are the evidence the misses are real.

| Task | Symbol | Plan assumes | Main actually has |
|---|---|---|---|
| **T7** | `RollupView` (`src/visibility/rollup.ts`) | `{total, open, active, terminal, restrictedCount}`; the snippet reads `rollupView.terminal` for `TicketRollup.terminalChildren` | **`{total, restrictedCount}` — two fields.** No `terminal`, `open` or `active` exists on the type or on what `rollupFor` returns |
| **T8 + 7 more** | `makeRequireSession` | `import … from '../auth/routes.js'` | Exported **only** from `src/auth/require-session.ts`; `auth/routes.ts` exports `registerAuthRoutes` and nothing else |
| **T5** | `EffectiveRole` | a plain literal `{workspaceRole: null, projects: new Map()}` | **A required unexported unique-symbol brand `readonly [RESOLVED]: true` (Ruling P22).** No object literal can satisfy it structurally; main's own tests write `as unknown as EffectiveRole` |

**The `makeRequireSession` one is the expensive one and it is why this map paid for itself.** The wrong
import recurs **verbatim at plan lines 2527 (T8), 2956 (T9), 3442 (T10), 3774 (T11), 4009 (T12), 4369
(T13), 4865 (T14's test helper) and 5915 (T15)** — every route-registration snippet in the plan. Only
the T8 occurrence (line 2632) carries an inline self-correction; **the other seven are unmarked.** Seven
separate implementers would each have hit it cold. Fix it at every site without re-deriving it.

**All three are compile-break, i.e. self-announcing — and the map went looking for the dangerous class
and reported the null.** It specifically hunted a T3-style *silent-wrong* (an optional field the
snippet omits, which compiles and passes while behaving differently) across T4–T16 and found none,
having checked `EventEnvelope`'s 11 required fields against `makeCommitted`'s literal, the
refresh-on-publish fold-forward that T8's "unreachable now" claim rests on, and all 10
`PROJ_TICKET_COLUMNS` against the live `CREATE TABLE`. **A reported null with its method named is worth
more than a silent omission** — but note it is a null, not a proof, and the map states its own gaps:
T4's and T6's full code bodies, T9/T9b's route-handler bodies, and T13's preferences SQL were not
swept beyond their import blocks.

### RECORDED BEFORE THEY WERE NEEDED — two plan/as-built drifts found by reading, not by failing

Both were found while orienting for T3, before any implementer ran. Recorded here so a restart does not
re-pay for them, and because the second is **not T3's to fix.**

* **T3's registration snippet is stale, and its AS-BUILT annotation proves the plan was patched
  incompletely.** The snippet registers `{type, version, payloadSchema}`. As-built,
  `EventTypeRegistration` also carries **`entityKind?`**, and `parse-event.ts:79` enforces it at the
  door. It is **optional**, so the plan's snippet *compiles and its tests pass* — which is the trap:
  omitting it admits a `workspace.settings_set` envelope pointed at `entity.kind: 'ticket'`, and
  **nothing in T3's supplied test suite can tell the two apart** (`parsed.ok === true` either way).
  The task carries an explicit AS-BUILT correction for a *different* drift in the same code block (Plan
  4 T5's `workspaceExists`). **An AS-BUILT annotation is evidence the plan was reviewed, not that it was
  reviewed completely** — treat one as a signal to check the rest of the snippet, not as a clearance.
* **T5 will be tempted into a THIRD copy of the visibility decision table — owner Plan 5 T5.**
  `apps/server/src/visibility/visible-tickets.ts` is on main and already expresses that table in SQL;
  its own docblock names the hazard: *"Once in `canSeeResolved`, once in SQL — the two-sources-of-truth
  shape."* T5 produces `visibleTicketsWhere(eff, userId, params): string`, which **does not exist**
  (main has `listVisibleTickets`, an async query function, not a predicate builder), and neither do
  `workspaceOfProject` / `requireMember`. So T5 is genuinely create — but it must **extract from**
  `visible-tickets.ts`, not re-derive beside it. Checked because Plan 4's T5 turned out to *widen*
  rather than create; this one does not, and that was measured rather than assumed.

### THE REBASE IS DONE — do not re-run it, and here is why `cherry` said what it said

**Performed 2026-09-01: `git rebase --onto origin/main 8858f28`.** Four commits, replayed clean, zero
conflicts. **Not 62** — the branch is Chain B's tip plus four, and Chain B's content was already on main
under `6cb631d`, so only the four were ever mine to move.

**The verification that makes this trustworthy is a diff, not the rebase's own success message:**
`git diff --stat 95004e1 c3b1090` prints **exactly two files** — `docs/lanes/controller-state.md` and
`docs/lanes/task-ledger.tsv`, i.e. the controller's docs-only `00cb2e0` and nothing else. That is
positive evidence the branch already carried step 7's and Chain B's content **byte-identically**: had it
not, source files would appear in that diff. A clean rebase alone would not have shown me this.

`git cherry` marked all 60 pre-rebase commits `+` although 58 were merged, because **#57 and #59 were
SQUASHED**. Main's subjects carry the **`(#57)` / `(#59)` suffix** — that suffix is the marker telling
you the `+` is uninformative. **Post-rebase the branch is 4 ahead of `origin/main` and `cherry` is
meaningful again.**

### What batch A found — both defects were in code or plan text that predated the task

* **T1:** the pulled-forward `docToPlainText` had **unbounded recursion** while its own docblock said
  *"Total function… never throws."* Three hostile inputs (self-referential node, nested one, 100k-deep
  chain) all threw `RangeError` **against the real exported function**. Fixed with a depth cap rather
  than a seen-node set, because **a seen-set would misrender a document that legitimately reuses one JS
  object in two tree positions.**
* **T2:** the plan's own blocked-states CTE used `DISTINCT ON (workflow_id)` across all of
  `proj_workflows`. The PK is `(workflow_id, version)` **globally**, so workspace A holding `('wf',1)`
  and B holding `('wf',2)` means **A's `blocked` filter read A's tickets against B's flags** — a
  **second consumer** of the same global key whose reader half was ruling P14. Fixed by correlating on
  the ticket row's own workspace, which nothing an actor sends can aim.
* **T2's answer to "which identifiers can vary": NONE — the allowlist is the empty set.** And it was
  honest about the limit: the base tenancy scope stays the caller's, **"and yes, a caller can forget
  it"**, with a test enumerating all twelve terms that fails if a new one reaches another table
  uncorrelated.
* **The fix round closed two Importants:** a **U+0000 the schema admitted and Postgres cannot carry**
  (SQLSTATE 22021 — a door accepting what the store cannot hold turns a 400 into a 500), and §7's
  arrival making two neighbouring scope notes false.

### A REVIEW FINDING WORTH CARRYING INTO EVERY LATER TASK

`expect(sql).not.toContain(hostile)` **measures whether the value LOOKS LIKE SQL, not whether it was
concatenated.** Add `'$1'` to the hostile set and a **correct** compiler fails — it emits
`t.assignee_id = $1` and binds the string safely. **A guard that fires on correct code is worse than no
guard, because the next person deletes it.** The meaning lives in the paired execution assertion.

### Three method results from batch A's fix round, worth more than the fixes

* **A review nit's stated mechanism was REFUTED, and a working one substituted.** N3 proposed seeding a
  second workspace's ordinary `proj_search` rows to make a tenancy correlation executable. That cannot
  work: `proj_tickets.ticket_id` is a **primary key**, so ticket_id → workspace is a *function*, and a
  correctly-filed neighbouring row can never satisfy the outer predicate. The reachable failure is
  projection **drift** — a WS_A ticket whose `proj_search` row is filed under WS_B. Correlated → `[]`;
  uncorrelated → the foreign row. **A reviewer's proposed experiment is a claim like any other.**
* **N5's premise was PROVEN, not accepted.** The deleted `not.toContain` guard was restored as a
  mutation and **failed against the correct, unmodified compiler** (`Expected: "$1"`). Replaced by a
  pinned SQL constant plus **exact** parameter-array equality — the old `>= 5` would pass on a compiler
  that had lost two bindings.
* **The NUL rule was measured, not assumed.** BEL, TAB, LF, CR, ESC, DEL and a lone surrogate all
  round-trip through Postgres; **only 0x00 raises 22021.** So the door refuses exactly what the store
  cannot hold, rather than inventing a control-character policy nothing downstream needs. A mutation
  widening the guard to all C0 controls is killed by a test named `refuses ONLY NUL`.

## RULING P23 — SETTLED. Do not reopen; do not restore the walk.

**DELETE upheld, not narrow.** What carries it, in the controller's weight order:
1. the **blessed scope-wide emitter survives**;
2. the residual is **under-purge** — the direction P23 explicitly named;
3. **refusing the project-membership gate is correct**, because *being on a container is not holding the
   entity*;
4. **no gatable predicate exists**, so a gate here would be a deletion wearing a condition.

**6.104 stands, owner Plan 10.** *(A supporting figure of 495 insertions / 0 deletions was offered and
then withdrawn by the controller: it was measured at `eadc748`, before #57, and re-run now prints 0/0.
It is context, not the reason — and the escalation's actual claim was forward-looking, about the
residual reaching all per-event triggers and members, which that figure does not touch.)*

## What step 2 actually contained

T9 was the one task on this branch that had passed none of implementer → reviewer → fix → re-review.
It has now passed all four.

1. **Rebased** onto `55ae0a1`, resolving the `Features.md` conflict (above).
2. **F1–F4 fixed** (`c240c53`): the TZ restore that assigned the string `"undefined"`; `useBoard`
   never refetching on a `projectId` change; the views-never-speak-HTTP guard that tested a prefix and
   read one import spelling of four; the `Features.md` merge conflict.
3. **Eight mutations** run against the fix round. Seven died naming their own site. **The eighth
   survived** — F1's own pinning test read `process.env.TZ` *after* the three tests above it had
   corrupted it, so it was asserting that `"undefined"` had been faithfully restored to `"undefined"`.
   Rewritten to set both configurations; now dies under ambient TZ and under `TZ=Pacific/Niue`
   (`10a314e`).
4. **Scoped re-review** — triggered by the ruling's own criterion, since the fix round changed a public
   signature and widened four scanner claims. Three read-only lenses (1 opus, 2 sonnet; cap 6).
   Response in `439da6c`. Full disposition of all twelve findings:
   `docs/lanes/plan-6a-t9-review.md`.

## Open items for the controller — read before merging

- **The re-review's one Critical is REFUTED, and the PR body carries the experiment chain.** It claimed
  `provenance.test.ts`'s naive TZ restore leaks across files and reddens the suite. It does not: the
  failure reproduces on `main` with that file **alone**, and `forks`+`singleFork` — all seven files in
  one process, sequentially, the sharing hypothesis' own maximal configuration — is **92/92 green**.
  The variable is the vitest **pool**, not the sharing. Do not re-panic at the word "Critical" in the
  workflow output without the refutation beside it.
- **What that investigation found instead is in this branch and is fixed here:** T9's three zone tests
  were **32/32 green under `--pool=threads`** while the zone never moved, because a worker thread does
  not get the process-level clock reconfiguration. An anti-vacuity probe is now in `board.test.tsx`;
  under `threads` the file is 33 passed / 1 failed naming its own line, and under the gate's pool
  130/130. **Ruling recorded in the coordination doc** — it generalises to Plan 9's Calendar and
  Timeline.
- **`useLiveQuery`'s signature changed** and eight call sites in Plan 6's own plan text are now wrong.
  **Ruling P17**, coordination doc. Binding on Plans 6 T10–T13 and Plan 10.
- **Recorded, not fixed, with named owners:** F6, F7, F8, F9, F10 from the original review;
  `provenance.test.ts:104,130`'s naive restore (owner Plan 6a); the one-committed-render window that
  F2's fix shortens but does not remove (owner Plan 6 T7/T8, with the design that closes it together
  with F6 written up beside it); `packages/app-core` still has no owning `test-cases/` file (owner
  Plan 6a, carried forward — nothing in `test-cases/` went stale from these fixes).
- **Auto-merge eligibility is the controller's call.** The PR is offered as a review ledger with the
  fixes-applied and recorded-with-owner split stated explicitly.

## RECORDED, owner Plan 11 (infra) — the Node version is declared and enforced by nothing

Raised by the controller after it cost a round, then verified here rather than adopted:

| Fact | Evidence |
|---|---|
| `package.json` declares `"engines": { "node": ">=22.0.0 <23" }` | read at `c93c910` |
| CI pins `node-version: 22` | `.github/workflows/ci.yml:62` |
| This machine's default `node` is **v24.11.1** — outside that range | `node -v` with no PATH export |
| **Nothing pins a shell** | `.nvmrc`, `.node-version`, `.tool-versions` all **ABSENT** |
| **Nothing enforces the declaration either** | no `.npmrc`, so `engine-strict` is off by default. Tested: under v24.11.1, `pnpm exec node -v` and `pnpm run` both **succeed with no refusal and not even a warning**. Control: the same commands under v22.22.2 behave identically, so the silence is not a broken probe. |

**Why this is the same class as the TZ finding, and worse.** Each worktree carries its own
`node_modules`, and a native binding (`better-sqlite3@11.10.0`) matches whichever Node last rebuilt
it. So **two sessions can certify the same commit under different Node majors and both report
green**, with nothing in either report saying which. The controller met the loud half — a *false red*
at `@gisik-nokma/sync-client#test`, ABI 137 runtime against an ABI 127 binding. The quiet half is a
**false green**, and this repo has no way to notice it.

**A gate result is not evidence unless it names its Node.** This file now does.

**The fix is not mine to make and is named so it is not lost:** an `.nvmrc` (or `.node-version`)
pinning 22, and `engine-strict=true` in `.npmrc` so an unsupported Node is a loud refusal rather than
a silent success — *prefer the check whose failure is loud* applied to the toolchain itself. Not done
here: it is Plan 11's infra surface, `engine-strict` needs a CI run to prove it does not break the
pipeline, and it does not belong in a doc-only PR. The controller's PR #44 already carries the Node
finding and is the natural home.

**Rebuilding a stale binding takes `nvm use 22 && pnpm rebuild better-sqlite3`** — the bare rebuild
compiles against whatever Node the shell has, which on this machine's default is 24, i.e. it
reproduces the problem while looking like the cure.

## Method notes earned here — cheap to re-learn, expensive to rediscover

- **`process.env.TZ` assignment does nothing inside a worker thread.** Verified with `new Worker(...)`:
  two zones render the same instant identically there and differently on the main thread. Vitest's
  `forks` default hides this; `--pool=threads` exposes it. **A test that varies an ambient setting must
  also assert that varying it does something** — the brief's "vary `TZ` explicitly" is necessary and
  not sufficient.
- **`delete process.env.TZ` DOES restore the machine zone** (probed both ways: the naive restore lands
  on GMT+0000, the delete lands back on GMT+0530 with the key genuinely absent). This machine is
  Asia/Kolkata with TZ unset — confirmed by probe, contradicting an earlier session note that called it
  UTC.
- **A mutation harness that restores with `git checkout -- <file>` restores to the last COMMIT.** An
  uncommitted fix was silently reverted by the very run confirming it, while the harness printed
  `restore-clean = True` — true of the commit, false of the work. Only a `git commit` that reported
  "nothing to commit" caught it. **Commit before mutating, or the restore is a revert.**
- **A finding whose mechanism is refuted is not therefore worthless.** Refute the mechanism, then ask
  what the observation was actually evidence of.
- **A read-only lens that names its mutation precisely and hands it back works.** One Important here
  was a prediction the lens could not execute; running it took two seconds and confirmed it. Prefer
  that shape over granting a fan-out write access to a shared tree.
- **Hold the tree still while a fan-out reads it.** All doc edits here were deferred until the three
  lenses returned, rather than repeating 2026-08-28's concurrent-mutation incident.
- **This machine's Node was upgraded to v24.11.1 (ABI 137) mid-series**, while `better-sqlite3@11.10.0`
  bindings built under Node 22 are ABI 127. **Any worktree whose `node_modules` predates the upgrade
  shows a false RED at `@gisik-nokma/sync-client#test` that is not a code defect.** Fix:
  **`nvm use 22 && pnpm rebuild better-sqlite3`** — the bare rebuild builds against the shell's Node,
  which defaults to 24 here, so it reproduces the fault while looking like the fix. Reported by the
  controller after it cost a round, and corrected by it before this file was pushed.
- **A trailing command makes the harness report the gate's exit code as its own.** The piped-gate trap
  (`| tail` returning 0 over a failed turbo run) is the special case; the general rule is that ANY
  command after the gate in the same chain — including a bare `echo` — becomes the status you are
  shown. **The summary line is the only honest signal.** The controller hit this with a gate that
  reported "exit code 0" while its own summary said `Tasks: 11 successful, 18 total`.
