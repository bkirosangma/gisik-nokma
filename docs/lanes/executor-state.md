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
| Branch in flight | **`exec/03-chain-b`**, cut from step 7's tip. **STEP 8 COMPLETE — Chain B T9–T14 all done.** Step 7 is **PR #57, unmerged** | `git log` |
| `main` | **`1003d8d`** per the controller (#55 merged). **REFETCH AND RE-VERIFY BY PRESENCE** before trusting it — main has moved under this file three times today | `git fetch`, `git cat-file -e` |
| `exec/04-auth-visibility`, `exec/04-t4-t5-permissions` | **Both merged/redundant — safe to delete.** NOTE: `cherry` returns `+` for all 10 of `t4-t5`'s commits **even though #51 merged them**, because #51 was SQUASHED. Main's subject ends `(#51)` — that suffix is the marker | `git cherry -v`, `git log -1 --format=%s` |
| Node | **v22.22.2** under the brief's PATH export. Machine default is **v24.11.1**, outside `>=22 <23`, enforced by nothing | `node -v` |
| Orphaned, do not cite | `52520b0`, `72a7e3e`, `30e3db4`, and every pre-squash sha of the Phase 0 branches | `git branch --contains`, empty = orphaned |

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

## OPEN ESCALATION — the controller session ENDED before this could be delivered

**`gisik-nokma-8d` became unreachable mid-step-7.** This was written as a message, could not be sent,
and is recorded here instead. **A successor controller must read this before merging step 7's PR.**

### Ruling P23 was applied as DELETE, not as NARROW, and its footprint is wider than the ruling named

The ruling said the member-side per-event purge **must be gated**, naming case **6.101**. The
implementing agent **deleted the per-event subtree walk entirely**, and flagged the interpretation
against its own work as its least-sure claim.

**Its derivation, which I judge sound:** a purge may only name an entity the recipient could previously
see; the module **cannot ask** that question (`proj_visibility` keeps no prior audience, no payload
carries a before-image); and it **may not reconstruct** the answer (cases 6.82/6.94, the
second-definition ban). Those three together leave **no conforming per-event emission at all**, so
nothing survives to gate.

**What it cost beyond 6.101, which is the part needing a controller's eye:**
* four test blocks deleted; cases **6.90** and **6.99** flipped ✅ → 🚫;
* **per-event tombstones removed for MEMBERS AS WELL AS GUESTS** — recorded as **6.104**, sibling of
  6.102, **owner Plan 10**, phrased as an absence.

So the under-purge residual accepted for one case now applies to **all** per-event triggers, and the
retention half of a gap Plan 10 must close got **harder**, not easier.

**A narrower gate was considered and declined, and this is the load-bearing judgement:** gating the purge
on the viewer being **on the ticket's project** has a far smaller blast radius, and was refused because
*being on a container is not holding the entity* — it fails the ruling's own **relationship** axis and
leaves the same disclosure at a smaller radius, which is exactly what the ruling rejected for guests.
**I agree with that refusal.**

**REVERSAL IS CHEAP AND EXACT IF A CONTROLLER DISAGREES:** the agent's mutation 1 — re-adding the deleted
walk — is the precise restoration diff, and it reddens both 6.101 cases and nothing else.

### And the signature defect appeared inside the fix for it

The agent's own mutation sweep **falsified two sentences it had already committed**, and it corrected
them in place rather than dropping them. The surviving consequence: **case 6.100 now passes for a reason
its own name does not describe** — it is held by the `canSee` guard that case 6.16 already pins, not by
anything purge-shaped. Stated on the case and in the test comment, with a warning **not to cite 6.100 as
evidence that a purge gate exists.**

### A rule of this project was misapplied, and the correction belongs with it

*"Nothing may be chained after the gate"* was read as forbidding `$?` capture, so that agent **inferred**
exit 0 from four secondary facts. **The rule is about a trailing command in the same pipeline stealing
the status.** Reading `$?` on the next line is the correct practice:

```
pnpm turbo run build test typecheck --force > gate.log 2>&1
GATE_EXIT=$?
```

**An inferred exit code is a self-inflicted downgrade from a read one.** Re-run here with a captured
exit: **TURBO_EXIT=0, 21/21, 1161 tests, zero `Unsupported engine` WARNs, durations in seconds.**

## Where I am in the serial sequence

**PHASE 0 + STEPS 4, 5, 6 MERGED. STEPS 7 AND 8 ARE COMPLETE AND UNMERGED**, because the controller
session ended mid-step-7 and no successor has appeared. **I do not merge; that is the whole reason a
second session exists.**

| | branch | state |
|---|---|---|
| **Step 7** Plan 4 T8–T14 | `exec/04-t8-t14-enforcement` | **PR #57 OPEN**, 1225 tests |
| **Step 8** Plan 3 Chain B T9–T14 | `exec/03-chain-b` | **complete, 19 commits on top of step 7**, needs a PR |

**Step 8 is branched FROM step 7, not from `main`** — deliberately: `proj_tickets` collides with step 7
on the projection registry, and step 7's cases 6.57/6.61 reference it. **Merge #57 first, then Chain B.**

Gate at Chain B's HEAD: **exit 0 READ, 21/21, 1277 tests**, zero `Unsupported engine` WARNs.
domain 295 · rule-engine 280 · **server 461** · app-core 130 · editor 72 · ui 31 · sync-client 8.
**TEN projections**, counted by printing the `registry.register(` rows — **do not quote that number
without recounting**; an earlier dispatch of mine said six when there were seven.

### Chain B — what each task found

| task | outcome |
|---|---|
| **T9** `proj_ticket_types` | 0 findings. Found **the plan's own upsert was non-deterministic**: a type's key is its PAYLOAD's id filed at fresh entity ULIDs, so **many entity streams write one projection key** |
| **T10** `proj_tickets` (floor-list) | **Critical** — a `✅` citing a test **nobody had written**, over a branch nothing constrained. Fix found a **second** stale citation the same commit had created |
| **T11** `proj_rollups` | 0 findings. Found **two plan-text defects**, and reported a survivor **with its reason** rather than papering over it |
| **T12** `EngineContext` (floor-list) | **First attempt DIED mid-edit** — 3 Criticals incl. never opening its own main file. Retry closed all 11. **P14 is CLOSED** |
| **T13** history route | 1 Important — **my dispatch's fault** (see below). Converted **two survivors into killers** rather than excusing them |
| **T14** catalogue | Reconciled 31 reserved ids against what shipped; corrected two to match the test rather than the plan |

### P14 IS CLOSED — verified in source, not taken from a report

All three `proj_workflows` selector branches now read `WHERE workspace_id = $1 AND workflow_id = $2`.
Tenancy arrives as a **`TenantScope` parameter on the method**, leaving `createEngineContext(client)`
untouched as the handoff required. The obvious alternative was checked and **reproduces P14 exactly** —
deriving a type's tenancy from its own head row fails because `proj_entity_heads`' key is global.
**Ruling P3 held**: `getEntityState('ticket-type')` stayed identity-only despite the plan text
instructing the rejected alternative at three lines.

### A DISPATCH ERROR OF MINE, recorded because the rule is the point

**I told T13 not to touch the catalogue because T14 would reconcile it.** Its reviewer correctly called
that an Important: T13 shipped a route while §5 still said the route did not exist. **"The next task
will fix it" is precisely the follow-up the same-change-set rule forbids.** T14 did close it minutes
later — which is why it is recorded rather than re-run — but the drift window was real and I created it.

### Carried, unfixed, with owners

**`getContest` reads `proj_contested` unscoped** — a fourth instance of P14's class, **executed** by the
reviewer; narrower than P14 because two other guards bite. *Owner: Plan 10 T7.* ·
**The ticket-type ladder is not as-of** (Plan 3's own Open question 11) — UNASSIGNED ·
**P9 `'ticket-type'` parity** diverges between harness and memory-context · **`getEntityState('ticket')`'s
fail-closed branch is unreachable by any input**, so its tenancy argument is untested — kept and recorded
so it is not mistaken for a tested predicate · **`routes/tickets.ts:347`'s `ORDER BY seq` has the same
unfalsifiability T13 fixed in its own route, and `tickets-read.test.ts` carries no `seq` assertion at
all.** *Owner: Plan 4.*

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
