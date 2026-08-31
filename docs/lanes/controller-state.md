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
| `main` | `40c5219` **as of 21:20 IST — this row goes stale by design.** Phase 1 steps 4 (#51) and 5 (#52) merged |
| last forced gate | **`40c5219`** — 21/21, 0 cached, **1032 tests**, `TURBO_EXIT=0`, node **v22.22.2** |
| gate composition | domain 276 · rule-engine 278 · server **237** · app-core 130 · editor 72 · ui 31 · sync-client 8 |
| **gate ran under** | **node v22.22.2** — see the Node section below before you trust any gate |
| collision surfaces | fixtures **84** · projections **4** (`entity_heads`, `memberships`, `visibility`, `workflows`) · packages 6 |
| open PRs | none at time of writing — **re-measure** |

**Re-measure everything above on resume.** Recount at the sha you report; do not carry a composition
forward — five of six package counts staying right is what makes the sixth invisible. `app-core` went
92 → 130 at this merge, which is the kind of move a carried-forward composition hides.

## THE ENVIRONMENT IS NOT THE DECLARED ONE — read before running a gate

Found 2026-08-31 by a post-merge gate that came back RED and was **not** a code defect.

- `package.json` declares `"engines": { "node": ">=22.0.0 <23" }`. CI (`.github/workflows/ci.yml:62`)
  uses `node-version: 22`. **This machine's default `node` is v24.11.1** — outside the declared range.
- There is **no `.nvmrc`, no `.node-version`, no `.tool-versions` — and no `.npmrc`.** The last one is
  the load-bearing absence: without `engine-strict=true`, **`engines` enforces nothing.** Verified under
  v24.11.1: `pnpm exec node -v` and `pnpm run` both succeed with **no refusal and not a single warning**,
  with the same commands under 22 as the control so the silence is not a broken probe. The declared
  engine is decorative. *(Pending item below; the controller does not implement.)*
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
- **Restart the executor at task boundaries.** This is a kill-and-relaunch from its brief, NOT a `/clear`,
  which is user-typed and cannot be issued to another session.

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

**Steps 4 and 5 are CLOSED** — `45c83eb` (#51) and `40c5219` (#52). **Step 6 is next: the LIFTED Plan 10
T4**, the §11 envelope-origin closer — it extends two registration pins and obeys §8's *insert, don't
append* rule for projection order.

**Seven gaps carried with named owners, none folded in opportunistically.** The two that bite hardest:
**P19 guest admissions (T9)** — a guest is admitted TODAY for `ticket.created`, `visibility.set`,
`workspace.renamed`, `comment.added`, and `visibility.set` in an append-only ledger cannot be walked back;
and **P22 (T8)** — `canSeeResolved` takes `EffectiveRole` **by value**, so every safety property rests on
provenance nothing enforces. TypeScript is structural, so Task 8/9/11 can each build or cache one no early
return ever emptied. **Closer, so it is not re-litigated: a branded type** carrying a unique symbol only
`resolveEffectiveRole` can produce — turning a silent grant into a compile error.

> ### ~~⚠ IN-FLIGHT BRANCH — `exec/04-t6-t7-visibility`~~ **MERGED as `40c5219`. Kept for the rule below.**
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
