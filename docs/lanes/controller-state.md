# ▣ RESTART CARD — the ONLY mandatory read at wake. Rewritten at every anchor, in the anchor's own commit. Last rewritten **2026-09-22 05:11 IST** at `origin/main` **`bc432c46`** (#676) by the cycle-49 controller, on branch `ctl/cycle49-anchor`. (Cycle 45 ran on Fable — its last cycle; the loop moved to Sonnet.)

> **Why this card exists (owner, 2026-09-21: *"the restart takes too long"*).** The brief used to order *"read `controller-state.md` in full"* plus all three executor handoffs — measured at **3.16 MB / ~34,000 lines ≈ 790k tokens** before a controller's first word. **A restarting controller reads THIS CARD and the NEWEST cycle entry below it, prints a one-line awake report to the owner, and re-measures §1. Nothing else is mandatory.** Older cycles live in **`docs/lanes/controller-state-history.md`** (open one by heading: `grep -n "CYCLE 3[0-9]" docs/lanes/controller-state-history.md`) and only when the card or the newest cycle points you at it. Each executor handoff `<name>.md` pairs with `<name>-history.md`; read a handoff's TOP BLOCK only, and only for a lane you are about to merge or dispatch.
> ⚠ **The card is a reading that expires.** Every number in §1 is re-measured before it is repeated; if the card and the newest cycle disagree, the newest cycle wins and the card is stale — fix the card in the next anchor. **Whoever writes cycle N+1 moves cycle N to the TOP of the history file in the same commit.**

## §1 LIVE ANCHORS — re-measure each before repeating it
| anchor | value at last rewrite | re-measure with |
|---|---|---|
| `origin/main` | `bc432c46` (#676) | `git fetch && git rev-parse origin/main` |
| open PRs | **0** | `gh pr list --state open --json number,headRefOid,mergeable` + a `--state merged --limit 2` control on the same path |
| ledger | **323 done / 0 in-flight / 1 todo** — `ctl-scripts 16` flipped to `done 649 54f391f4` in this PR (Task 16 complete: hook installed, refusal demonstrated, anchor landed). The release plan's 231 tasks are tracked in `docs/lanes/release-2026-09-22-progress.md`, not here | `pnpm check:tasks` under Node 22 |
| controller seat | `gisik:0`, **Claude API — OPUS (`opus-5[1m]`)**; the owner moved it to Fable at 22:4x and back to Opus at 22:5x. Launcher default is still `EXECUTOR_MODEL=sonnet`; a Sonnet successor hands rulings to Opus by `ctl-self-restart.sh 3 opus` | status line; `/tmp/ctl-self-restart.log` |
| DeepSeek lanes | **NONE RUNNING.** ds1/ds3/ds5 ran B03→B06→B10→B18, B04→B08→B13→B17, B05→B09→B11; each ended with `/exit` after its last DONE and its window was closed (owner, 00:0x: *"close down the retired lanes"*). Worktrees `…/gisik-nokma-ds{1,3,5}` remain, clean, on their last batch branches | `ctl lanes`; `git ls-remote origin "refs/heads/rel/*"` |
| Claude lanes | **NONE RUNNING.** exec2 (B02→B12), exec4 (ctl build→B07→B14), exec6 (ctl build→B01→B16→B15) ended the same way. **The release plan is COMPLETE: 231/231 tasks, 18/18 batches on `main`.** Worktrees `…/gisik-nokma-exec{2,4,6}` remain, clean | `git ls-remote origin "refs/heads/ctl/ctl-scripts*"`; the panes |
| **RELEASE EXECUTION IS LIVE (owner 18:4x): 3 DeepSeek + 3 Claude lanes, one controller** | **DONE — every batch landed by 00:44 IST 2026-09-22** (#643 #644 #645 #664 #668 #669); the cut-off was 10:30. Next: `ctl rebuild` from `main`, the browser suites locally against :3001, then the post-release tasks (cycle 47 §2) | `git show origin/main:docs/lanes/release-2026-09-22-progress.md`; `git ls-remote origin "refs/heads/rel/*"` |
| idle nudger | **ON** but its targets `gisik:1…6` no longer exist (harmless "no such window" in its log); retarget when lanes return | `launchctl list \| grep nudger` |
| limit resumer | ON (`com.kiro.claude-limit-resumer`); its live-pane delivery is now two `paste-buffer` pastes, not `send-keys` | `~/.claude/scripts/limit-resumer.log` |
| cron | NONE. The phase-2 close ran from a background shell of the cycle-41 session (`close-at-1705.log`) | `CronList` |
| watchers | none needed — no lane runs; re-arm the two (branch heads; panes for `DONE B[0-9]+ —` anywhere in a line, ghost text stripped) when lanes are launched again | — |
| dev stack | owner's; built images from the PRIMARY checkout; server-1 image 1a5b0099e503 created 2026-09-21T23:35; web-1 image 132d1fa1fe54 created 2026-09-21T23:36 | `docker ps`; `docker inspect` |
| primary checkout | `/Users/kiro/my_projects/gisik-nokma` on `main` at `18dcc683`, clean — `ctl land` fast-forwards it | `git -C … status --porcelain; git rev-parse HEAD` |
| graphify | code layer rebuilt by the PostToolUse hook through the day (last 21:07 IST); copied into the six lane worktrees earlier (`graphify-out/`, gitignored) | `stat graphify-out/GRAPH_REPORT.md` |
| controller worktree | `/Users/kiro/my_projects/gisik-nokma-ctl` — on `ctl/cycle49-anchor` | `git -C … status` |

## §2 WHAT IS IN FORCE — the plan is landed; the release cut is next
No lane runs. **`main` `18dcc683` carries all 231 tasks.** The controller's next acts, in order (cycle 47 §2): `ctl rebuild` from `main`; the browser suites locally against :3001 (`apps/web`: `pnpm test:e2e:stack`, `pnpm test:e2e:viewport`) with results recorded in cycle 48; then the post-release tasks as their own gated PRs through forks. Landing discipline that survives: a PR merges only through `ctl checks` + `ctl gate` + `ctl land` with tree identity verified; `check-pr.py` is a report, the reviewer pass is a fork's judgment (owner, 23:2x); multi-PR waves land as one gated union.

## §3 AWAITING THE OWNER — cycle 47
1. The browser-suite results after the rebuild (a red is a release finding). 2. The CI runner returns in ~10 days — then restore "an independent CI run green" in the auto-merge clause; until then it reads "local forced gate". 3. Nothing else — T-E4-5, T-E5-39, T-I1, T-E6-26 and the §13 ceiling were ruled 00:2x (cycle 47 §1).

## §4 STANDING RULES THAT SURVIVE EVERY CYCLE — one line each, with where the reasoning lives
- **Never commit or push to `main`.** Branch from `origin/main`, PR `--base main`; the controller is the only merger; no executor merges its own PR. (`CLAUDE.md`; 2026-09-18 topology block)
- **The merge bar:** eight checks (`ctl checks`) `rc=0` under Node 22 at the frozen head **with a control that returns non-zero**; the forced gate **at the landing tree, never transferred**, read for `EXIT=0` + `Tasks: 33 successful, 33 total` + `NODE=v22.*` (the `NODE=` line is on the wrapper's console, NOT in the log); tree identity; full-tree drop check with a control; merge verified **by API and reachability, never by exit status**. (cycle 35 §4; override)
- **Gate under load reads red on `Hook timed out` — re-gate on a quiet box before believing it.** With six lanes live, expect it. `gate.sh` hardcodes `--force`: batch docs-only changes into ONE gate. (override)
- **The dev stack is the owner's:** built images from the primary checkout; `build` is safe; `up/down/restart` only when the owner asks; a rebuild is `git pull --ff-only` there + `pnpm dev:stack:rebuild`, then **verify the artifact**. (cycle 21; cycle 36 §8)
- **Reaching a lane: `ctl dispatch <window> <file>`** — a single-line paste (strip the trailing newline: a paste ending in `\n` is NOT submitted by a pasted `\r`) then a pasted `\r`, never `send-keys` in copy mode; **the dim text in an empty box is Claude Code's prompt SUGGESTION, not stuck input**; proof of delivery is the lane acting, read from the transcript. (brief; cycle 35 §8; cycle 46 §3)
- **Never `AskUserQuestion` in this topology** — the nudger's pasted Enter selects the first option and reads as an owner ruling. (override)
- **Every measurement names its tree and its Node**; a count is evidence only once its unit is pinned; a control traverses the same path in the same invocation; sha-bearing evidence goes through `/usr/bin/git`. (memory set; cycle 35 §5)
- **Never pipe a test run into `head`**; reap orphaned vitest workers at `ppid=1` only. (`CLAUDE.md`)
- **Mechanical work runs through `scripts/ctl/ctl` — land, gate, pr open, anchor, check-pr, reconcile, lanes, restart, dispatch, rebuild — and the hook refuses the raw forms** (`scripts/ctl/README.md`; owner, 2026-09-21). The merge bar is `ctl checks` (eight checks, two controls) + `ctl gate` + `ctl land`.

## §5 WHERE THINGS ARE
Briefs and launchers: `/Users/kiro/my_projects/gisik-nokma-lanes/` — round 2: `REVIEW-R2-RULES-2026-09-21.md` (byte-identical to `docs/lanes/review-round2-rules.md`), `REVIEW-R2-OPUS-EXEC{4,5,6}-2026-09-21.md`, `REVIEW-R2-ROLE-*-EXEC{4,5,6}-2026-09-21.md`, `REVIEW-R2-RELOOK-EXEC{1,2,3}-2026-09-21.txt` (pasted), `launch-exec{4,5,6}-2026-09-21-review-r2.sh`; round 1: `CTL-REVIEW-COMMON-2026-09-22.md` + role briefs; the controller's brief + live override `dispatch-controller-serial.md` + `.ctl-prompt-restart-2026-09-19.md`; `exec-claude.sh` (backend wrapper — **launch through it, never bare `claude`**); `ctl-self-restart.sh`. Prototype export: `gisik-nokma-lanes/prototype-2026-09-20/`. Gate reference copy: `docs/lanes/gate-lock/`. Handoffs: `docs/lanes/executor-state.md` (exec 1), `executor-2-state.md`, `executor-3-state.md`, each live block(s) only, history in `*-history.md`. Round-1 deliverables: `docs/lanes/review-{ui-exec1,ux-exec2,functionality-exec3,compiled-controller}.md`. Ledger: `docs/lanes/task-ledger.tsv` (`pnpm check:tasks`).

---

# Cross-lane controller — live state

> ⚠ **ROTATED 2026-09-21 (owner: *"do the rotation, one docs PR"*).** This file holds the **restart card and the NEWEST cycle only**. Every earlier cycle (35 and below) and the 2026-09-18 topology block live in **`docs/lanes/controller-state-history.md`**, byte-for-byte, newest first. Open one by heading: `grep -n "CYCLE 3[0-9]" docs/lanes/controller-state-history.md`. **The rule from now on: when an anchor writes cycle N+1, it moves cycle N to the TOP of the history file (directly under its header) in the same commit.** A `<name>.md` handoff always pairs with `<name>-history.md`.

## 🔄 2026-09-22 05:11 IST — **CYCLE 49: Morning report: priority built-in and sheet-parity both landed, dev-DB repaired, holding for the owner** `main` is **`bc432c46`**; windows: 0:main 1:lane1 2:lane2 3:lane3 .

### 1. THE MORNING REPORT — everything from the overnight standing order (03:25 IST → 05:1x IST)

**Owner's overnight order (2026-09-22 ~03:25 IST): run without intervention till morning, both dispatches (priority-built-in, sheet prototype parity) landed, the dev-DB write pre-approved contingent on Task 11's first count reading zero. It does.** All six PRs opened this session are MERGED, zero open.

| PR | State | What |
|---|---|---|
| #671 | MERGED → `476d027d` | Five local-browser-suite release findings |
| #672 | MERGED → `5de12392` | Priority built-in spec + plan (docs), with a controller case-id correction |
| #673 | MERGED → `a9a67a14` | Cycle 48 anchor |
| #674 | MERGED → `4fe13499` | Sheet-prototype-parity spec + plan (docs), amended for the two-lane split |
| #675 | MERGED → `5f97c073` | **Priority becomes a built-in ticket field** — all 11 tasks + 3 post-scope fixes |
| #676 | MERGED → `bc432c46` | **Ticket sheet takes the prototype's order and editor chrome** — all 8 tasks, 3 lanes, 1 mutation-found bug fixed |

`main` is now `bc432c46aca8d234dad88729a190e48a5c3e254f`.

**The parity ratchet (owner's own request — both counts):** `ticket-sheet.test.tsx` **140 → 161** `it(` (0 dropped). `visibility-editor.test.tsx` **30 → 35** `it(` (0 dropped). Every pre-existing case in both files passes with only the plan's enumerated mechanical edits.

**Task 11's three numbers (dev database, port 54330):**
1. Hand-made ticket types with a custom field id `"priority"`: **0** — the owner's held exception did not trigger; landing proceeded.
2. `proj_tickets` rows missing the priority claim, before repair: **27**. `verify:projections` detector agreed exactly: `DRIFT DETECTED — proj_tickets: 27 row(s) missing from live`.
3. After `ctl rebuild` (new `main`) + `pnpm --filter @gisik-nokma/server rebuild:projection proj_tickets`: the same count reads **0**, spot-checked against a specific ticket's row (`priority: {"value": "P2", ...}` now present). `verify:projections` no longer reports `proj_tickets` at all — clean for that projection specifically.

**Dev-stack sha after the final `ctl rebuild`:** `bc432c46aca8` — images fresh, server healthy, `/healthz` 200 on :3000, web :3001 307, sign-in configured.

**The closing browser-suite run (local, against the fully rebuilt stack):** viewport suite **41 passed / 0 failed / 3 skipped** — fully green, unchanged from the mid-cycle run. Stack suite **7 passed / 1 failed** — the SAME pre-existing, unrelated finding as mid-cycle (see §3.4): a missing tap-target baseline for `stack-phone-390|/p/:projectId` that likely cascades to ~9 more routes in the same test loop once seeded. Confirmed stable and NOT caused by tonight's landings (both suites re-run before and after, identical result on this specific failure).

### 2. WHAT DID NOT FINISH, AND WHY

1. **The stack suite's tap-target baseline gap is unresolved, by choice.** `apps/web/e2e-stack/tap-target-baseline.json` has exactly one key (`stack-phone-390|/my-work`) against ~11 routes the suite's own loop tests; the loop throws at the first missing key and never reaches the rest, so the true scope (how many of the ~10 remaining routes are clean vs. genuinely broken) is unmeasured. This predates tonight's work and is outside both owner rulings' scope — recorded as a release finding for the owner to scope, not silently seeded.
2. **The stray uncommitted file, `apps/web/e2e-stack/non-text-contrast-roster.json`, is still uncommitted.** Confirmed multiple times tonight: not the owner's, not ds1's, not any lane's — a real, valid point-in-time contrast measurement (headSha, treeWasClean, provenance all check out) taken against an earlier `main` (`9b7c38a9`), now stale relative to `bc432c46`. Harmless (worked around via `git stash`/`pop` around every `ctl` operation needing a clean primary — six times tonight), but worth a deliberate decision next session: commit it as a historical measurement, or regenerate fresh and commit that.
3. **Post-release tasks from cycle 48 §2 (T-E6-26 drop `proj_rollups`, `ctl_node22` prepend-first, `check-pr.py` docblock, a viewport-suite case for "phone-only control visible at desktop") were superseded by the two owner rulings and never dispatched.** Not forgotten — deliberately deprioritized under the standing order's explicit work queue, which named only the priority and parity work. Still open, undispatched.
4. **Two documented plan-vs-reality gaps, left as prose, not fixed:** the priority plan's Task 2 Step 3 (an impossible CSS-reset removal, worked around — see §3.3) and the parity plan's Task 5 text ("delete `.gn-visibility__heading`", impossible — case `17.002` reads it and throws if absent). Neither blocks anything; both are now correctly described in-repo instead of silently mismatched.
5. **`docs/product-coverage-map.md:146`** ("five groupings") attributes its number to an external persona document not in this repo — flagged by the priority lane, deliberately not corrected (nothing in this repo can verify or falsify that document's own count).

### 3. INSTRUMENTS THIS CYCLE (new since cycle 48)

1. **A `rebuild:projection` run through a stale `dist` is a silent no-op dressed as success.** The primary checkout's `packages/domain/dist` was 3 days stale (from 2026-09-19, zero `DEFAULT_PRIORITY` occurrences) when Task 11's first repair attempt ran — `tsx` resolves `@gisik-nokma/domain` by package name through that `dist`, so the ledger replayed under the OLD reducer, exit 0, "rebuilt … in 256 ms", and the missing-claim count stayed at 27. Caught only by a spot-check of one ticket's row content after the "successful" repair, not by the exit code. **The primary checkout needs its own `pnpm install` + `pnpm turbo run build` before any script that imports a workspace package by name is trusted there** — a worktree having been built is not evidence the primary has.
2. **A same-session's own controller merge can look like someone else's mutation from inside a live lane.** The tail lane noticed its file count and test count jumped between its own commits (`app-core 1925 → 1933` after adding only one case) and correctly traced it to the controller's `git merge origin/main` landing mid-turn, rather than assuming its own measurement was wrong — verified the merge didn't touch its files, re-ran its mutations on the confirmed merged tree, and only then committed. Good practice, worth normalizing: **a lane should always confirm which tree a number was measured on before reporting it**, including tonight's own "measurement is about the tree you stand in" lesson recurring in a new shape.
3. **A mutation that passes can be evidence of a second defect, not of safety.** The tail lane's real find: an off-by-one in the sheet's field-row tint index was masked because the ONE existing test of the constant it lived in exercised a fixture that never reached the buggy code path, and two independent mutations of the constant (7→6, 7→8) both stayed green — not because the constant was unconstrained, but because both mutations coincidentally compensated for the same off-by-one one position over. Fixed properly (`OWN_ROW_FIELD_IDS` filter, counts rendered rows only) with a new fixture that actually exercises the loop; both mutation directions now correctly kill only the new case.
4. **`ctl lanes` and ad hoc completion-monitors share the same bare-`402` false-positive**: `scripts/ctl/verbs/lanes.sh`'s error grep (`'API Error[^|]{0,40}|402|Insufficient…'`) matches a CSS diff's line number as readily as a real DeepSeek balance error — reproduced twice tonight (once on the controller's own pane, once on a lane doing routine CSS work). Not fixed tonight (low priority, understood and worked around by reading the pane directly); worth a real fix (`\b402\b` near "API Error" or "Insufficient", not bare).
5. **A `git merge` (not `git -C <path> merge`) run from the controller's own shell is refused by the ctl-scripts-only hook even when targeting a non-primary worktree** — the hook reads the Bash tool's registered `cwd` (the controller's own directory), not an inline `cd` inside the command string, so `cd <worktree> && git merge …` looks exactly like a primary-checkout merge to the hook. Use `git -C <worktree> merge …` for anything the hook should evaluate against that worktree, not the session's cwd.
6. **Backend-specific lane launches (a `--model` override on the Anthropic path) go through a small standalone script, not `ctl restart`** — `exec-claude.sh`'s anthropic branch defaults to `--model opus` unless `EXECUTOR_MODEL` is set in its own process environment, and `ctl restart` doesn't parametrize this. Two lanes tonight (priority-builtin's Sonnet phase, sheet-parity Lane A) launched via a small kill/create/paste script with `EXECUTOR_MODEL=sonnet GISIK_EXECUTOR_BACKEND=anthropic` set inline — matching the pattern already established for DeepSeek dispatches. **Avoid `set -euo pipefail` across a `tmux list-panes | head` capture of a window that may not exist** — the pipeline's failure aborts the whole script before `new-window` ever runs (measured once tonight; recovered by isolating each tmux call).

### 4. AWAITING THE OWNER

1. **The stack suite's tap-target baseline gap** (§2.1) — how far it actually extends (10 more routes untested) and whether to seed it now or treat it as a separate, scoped task.
2. **The stray `non-text-contrast-roster.json` file** (§2.2) — commit as a historical measurement, regenerate fresh, or discard.
3. **Post-release tasks from cycle 48** (§2.3) — still queued, never started; the owner's call on priority relative to whatever comes next.
4. The CI runner (unchanged, ~10 days out per the original estimate from cycle 47).

**Nothing further will be dispatched. Holding per the standing order until the owner reads this.**

---
