# ▣ RESTART CARD — the ONLY mandatory read at wake. Rewritten at every anchor, in the anchor's own commit. Last rewritten **2026-09-22 06:02 IST** at `origin/main` **`0d83bfff`** (#678) by the cycle-50 controller, on branch `ctl/cycle50-anchor`. (Cycle 45 ran on Fable — its last cycle; the loop moved to Sonnet.)

## ▶ UPDATE 2026-09-23 ~13:30 IST — NEWEST; read this block, then the 05:15 block below it

**Topology changed.** `release/2026-09-23` is RETIRED (owner, ~12:2x): remote branch deleted, its last commit
preserved as tag `archive/release-2026-09-23` (= `c6614e0b`, which this anchor cherry-picks). The next non-notes
task gets a fresh `release/<date>`; hotfixes go straight to `main` on the owner's word (#705 did). `main` =
`c96153e5` (#700 + #705, deployed). The owner's PRIMARY checkout still stands on the LOCAL `release/2026-09-23`:
do not switch it, and do not `ctl rebuild` until the owner has.

**`release/notes` = `8c47586e` and CONTAINS ALL OF `main`** (#706 merged main in; its one semantic conflict,
`TicketEditorSlot.tsx`: `onDocChange` → `onDraft` in note mode, → `onChange` otherwise; footer: note mode =
save state and never a button, else `submitSlot 'none'` = no button). Landed on it: #698 spec+Plan 1 doc,
#701 Plan 4 doc, #703 **Plan 1**, #702 Plans 2-3 docs, #704 **Plan 4**, #706 main.

| lane | worktree | work | state at this write |
|---|---|---|---|
| `gisik:1` | `gisik-nokma-task1` | `task/notes-merge-main` | DONE, merged (#706); idle |
| `gisik:2` | `gisik-nokma-ds3` | **Plan 2** `task/notes-2-sync` | running, tasks 1-5 in |
| `gisik:3` | `gisik-nokma-ds5` | **Plan 3** `task/notes-3-search` | running, tasks 1-2 in; own container `notes3-lane-pg` on 54331 |

Nudger → `gisik:2,gisik:3`. Hand-backs to the plan author ALSO go to `gisik-nokma-lanes/CTL-TO-PLANNER-notes.md`
(cross-session messages wait for owner approval there). The battery is `battery.sh <label> <head> [base]` in
the controller's scratchpad — rewrite it if the session is new: the would-be merge, build, typecheck, the mobile
bundle `--check`, all eleven package suites one at a time, the five catalogue checks, DIRTY_AFTER.

**Owed / open, owner-facing:**
- **Swap the shared test Postgres (54329) to `pgvector/pgvector:pg16`** BEFORE Plan 3 lands — every server
  suite on `release/notes` needs `vector` after it. `docker compose` up/down is owner-only (ctl hook, lanes too);
  compose from a worktree addresses the wrong project (no `name:` in the file). Use `-p gisik-nokma` and
  `--renew-anon-volumes` (alpine → debian data dir).
- **Plan 3's `search:preflight` against the managed DO DB, before its merge.** `vector` is `trusted=false` on
  PG16 → `CREATE EXTENSION vector` needs superuser-equivalent; if the app user cannot, the migration fails AT
  DEPLOY.
- Plan 3 commits **125 MB** of model files (vocab-split safetensors, Backend B `potion-base-32M`; Backend A's
  ONNX cannot load on the musl runtime) and the server's warm RSS goes **268.7 → 543.5 MB** on a `basic-xs`
  (1 GB) server.
- `main`'s mobile editor bundle was already stale at `59029e1c` (fixed on `release/notes`, ships with it).
- `ctl gate` can print FAIL with EXIT=0 · 33/33 when turbo emits ANSI — run it with `NO_COLOR=1 FORCE_COLOR=0`.

## ▶ UPDATE 2026-09-23 ~05:15 IST — READ THIS BLOCK FIRST; it overrides anything below it

**Released.** `release/2026-09-23` → `main` as **#700**, merge `3cf4e551` (owner's word). DO deployment
`ea53c95e` ACTIVE on `3cf4e55` (server, web, backup); `pm-api…/healthz` 200, web 307→`/workspaces` 200.
Rollback target was `d8918f6a` (`59029e1`). Gate: local `ctl gate` 33/33, 0 cached, Node v22.22.2 — **no
CI ran** (billing). `ctl land <pr> --repo <gate worktree>` works for the release→`main` landing; the marker
lives in the gated worktree's gitdir, so pass the same `--repo` to both verbs. No new `release/<date>` has
been cut — that is the owner's call.

**THE NOTES SERIES — a six-plan loop the controller runs without the owner between plans.**
- Branch **`release/notes`**, cut from `main` `59029e1c` (so it does NOT contain #700's release). Spec
  `docs/superpowers/specs/2026-09-23-notes-design.md`; Plan 1's header holds the series table:
  1 backend core (—) · 2 sync (1) · 3 search (1) · 4 editor port (— , parallel) · 5 notes page (1-4) ·
  6 ticket section (1,2,4). After 1 lands: 2 ∥ 3; 4 runs beside 1; then 5, then 6. Never two lanes on one plan.
- **Plan author = the owner's peer session `Priority field [6bfc4d]`** (SendMessage, that exact name). It
  writes Plan n+1 after Plan n lands and pastes a CTL-HANDOFF into the controller window. Re-message after
  an hour of silence.
- **Per plan:** push `origin/release/notes:refs/heads/task/notes-<n>-<slug>` → copy
  `gisik-nokma-lanes/LANE-notes-plan-2026-09-23.md` to `LANE-notes-<n>-<date>.md` + two lines `PLAN=…`,
  `BRANCH=…` → `ctl restart <win> <worktree> <brief>` (verify the seat by the STATUS LINE) → nudger
  `IDLE_NUDGER_TARGETS` in `~/.claude/scripts/com.kiro.claude-idle-nudger.plist`, bootout+bootstrap →
  watch the pane for `(PROGRESS|DONE|BLOCKED) notes-N … — <sha8>` → on DONE review against the plan (a
  commit per task, RED/GREEN + NODE= in bodies, mutation lines, `Features.md` §15 + `test-cases/18-notes.md`
  in the same commits, `pnpm check:citations`) → `ctl pr open task/notes-<n>-<slug> --repo <wt> --base
  release/notes …` → `--no-ff` merge from a throwaway worktree → verify reachability → SendMessage the peer:
  `NOTES PLAN <n> LANDED — PR #<num> — merge <full sha> — release/notes now <full sha>`.
- **BLOCKED:** plan defect → message the peer verbatim and hold; owner ruling → owner report and hold.
- **DeepSeek 402 / credit out:** `tmux set-environment -t gisik GISIK_EXECUTOR_BACKEND anthropic` and
  `EXECUTOR_MODEL sonnet`, then `ctl restart` the same window/worktree/brief (RESUMING section picks up at
  the first uncommitted task). Switch back when credit returns. Report every switch.
- **DO NOT:** `ctl rebuild` from `release/notes`; merge to `main`; §13 allocation rows for notes (§18
  blocks live in `test-cases/18-notes.md`).
- **Open owner ruling (carried, not blocking):** spec §4.2 limits admin edit/delete to notes they can read;
  the brainstorm said "admins can edit any note". Plan 1 builds the spec's version; one line flips it.

**State at this write:** #698 merged into `release/notes` as `0817d1e4`. Plan 1 `task/notes-1-backend-core`
running on **`gisik:2`** (worktree `gisik-nokma-ds3`, deepseek-flash), nudger → `gisik:2`. `gisik:3`
(`gisik-nokma-ds5`) idle, reserved for Plan 4. `gisik:1` idle (board lane, done).



> **Why this card exists (owner, 2026-09-21: *"the restart takes too long"*).** The brief used to order *"read `controller-state.md` in full"* plus all three executor handoffs — measured at **3.16 MB / ~34,000 lines ≈ 790k tokens** before a controller's first word. **A restarting controller reads THIS CARD and the NEWEST cycle entry below it, prints a one-line awake report to the owner, and re-measures §1. Nothing else is mandatory.** Older cycles live in **`docs/lanes/controller-state-history.md`** (open one by heading: `grep -n "CYCLE 3[0-9]" docs/lanes/controller-state-history.md`) and only when the card or the newest cycle points you at it. Each executor handoff `<name>.md` pairs with `<name>-history.md`; read a handoff's TOP BLOCK only, and only for a lane you are about to merge or dispatch.
> ⚠ **The card is a reading that expires.** Every number in §1 is re-measured before it is repeated; if the card and the newest cycle disagree, the newest cycle wins and the card is stale — fix the card in the next anchor. **Whoever writes cycle N+1 moves cycle N to the TOP of the history file in the same commit.**

## §1 LIVE ANCHORS — re-measure each before repeating it
| anchor | value at last rewrite | re-measure with |
|---|---|---|
| `origin/main` | `0d83bfff` (#678) | `git fetch && git rev-parse origin/main` |
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
| dev stack | owner's; built images from the PRIMARY checkout; server-1 image 9655d3cb3987 created 2026-09-22T00:30; web-1 image b0dc8d89d0db created 2026-09-22T00:31 | `docker ps`; `docker inspect` |
| primary checkout | `/Users/kiro/my_projects/gisik-nokma` on `main` at `18dcc683`, clean — `ctl land` fast-forwards it | `git -C … status --porcelain; git rev-parse HEAD` |
| graphify | code layer rebuilt by the PostToolUse hook through the day (last 21:07 IST); copied into the six lane worktrees earlier (`graphify-out/`, gitignored) | `stat graphify-out/GRAPH_REPORT.md` |
| controller worktree | `/Users/kiro/my_projects/gisik-nokma-ctl` — on `ctl/cycle50-anchor` | `git -C … status` |

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

## 🔄 2026-09-22 06:02 IST — **CYCLE 50: Addendum: lane 1 ended, nudger retargeted, two more real fixes landed** `main` is **`0d83bfff`**; windows: 0:main 1:lane1 2:lane2 3:lane3 .

### 1. ADDENDUM TO CYCLE 49 — owner instruction, 2026-09-22 ~05:2x IST

Owner (relayed): *"end lane 1 (it is sweeping under the nudger with nothing left to do) and note that gisik:2 and gisik:3 are bare shells the nudger keeps typing 'continue' into — retarget or stop the nudger for those windows. No ruling needed."*

- **Lane 1 ended** (`/exit`, clean). Before ending it, found it had kept sweeping post-DONE (nudged by the idle nudger, still targeting the stale `gisik:1-6` list) and had pushed **three more commits** to the now-closed `rel/priority-builtin` branch — genuine finds, not busywork: a first-match selector-shadowing hazard the lane's own Task 7 introduced plus the real CSS layout bug it was hiding (`3.974`), and a test-coverage-gap fix for case `16.30` that turned out to be already superseded by the sheet-parity tail lane's own rewrite of the same case (verified: diff against the current tree was empty, dropped rather than force-applied). The first two landed as **PR #678 → `0d83bfff`**. `ctl checks` 8/8, gate `EXIT=0`/`33 successful`, `app-core` 1933 tests, `ui` **429** (428 + `3.974`) — all green.
- **The idle nudger's target list was stale** (`gisik:1,2,3,4,5,6`, a six-lane topology that no longer exists) and was pasting "continue" into bare idle shells at `gisik:2`/`gisik:3` (and would have kept doing so at `gisik:1` too). Cleared to empty in `~/.claude/scripts/com.kiro.claude-idle-nudger.plist` and reloaded (`launchctl bootout` + `bootstrap`) — confirmed empty via `launchctl print`. **The next controller that dispatches a real lane must set `IDLE_NUDGER_TARGETS` back to that lane's window(s)**, or the nudger will silently do nothing for it.
- **Final dev-stack sha after this addendum's rebuild: `0d83bfff4f0b`** — images fresh, server healthy, sign-in configured.
- All worktrees and windows are now idle/clean; `gh pr list --state open` is empty.

**Holding again, unchanged from cycle 49's close.**

---
