# ▣ RESTART CARD — the ONLY mandatory read at wake. Rewritten at every anchor, in the anchor's own commit. Last rewritten **2026-09-21 ~18:3x IST** at `origin/main` **`b0b2aa65`** (#637, the release plan) by the cycle-44 controller, on branch `ctl/cycle44-plan-landed`.

> **Why this card exists (owner, 2026-09-21: *"the restart takes too long"*).** The brief used to order *"read `controller-state.md` in full"* plus all three executor handoffs — measured at **3.16 MB / ~34,000 lines ≈ 790k tokens** before a controller's first word. **A restarting controller reads THIS CARD and the NEWEST cycle entry below it, prints a one-line awake report to the owner, and re-measures §1. Nothing else is mandatory.** Older cycles live in **`docs/lanes/controller-state-history.md`** (open one by heading: `grep -n "CYCLE 3[0-9]" docs/lanes/controller-state-history.md`) and only when the card or the newest cycle points you at it. Each executor handoff `<name>.md` pairs with `<name>-history.md`; read a handoff's TOP BLOCK only, and only for a lane you are about to merge or dispatch.
> ⚠ **The card is a reading that expires.** Every number in §1 is re-measured before it is repeated; if the card and the newest cycle disagree, the newest cycle wins and the card is stale — fix the card in the next anchor. **Whoever writes cycle N+1 moves cycle N to the TOP of the history file in the same commit.**

## §1 LIVE ANCHORS — re-measure each before repeating it
| anchor | value at last rewrite | re-measure with |
|---|---|---|
| `origin/main` | `b0b2aa65` (#637 — the release plan) | `git fetch && git rev-parse origin/main` |
| open PRs | **0** | `gh pr list --state open --json number,headRefOid,mergeable` + a `--state merged --limit 2` control on the same path |
| ledger | 307 done / 1 todo | `pnpm check:tasks` under Node 22 |
| controller seat | `gisik:0`, **Claude API — the session identifies as Fable 5.1** (status line read `opus-5` at 07:55 wake); launched per-launcher (`ctl-start.sh` / `ctl-self-restart.sh`, both export `anthropic`) | pane status line; `/tmp/ctl-self-restart.log` |
| lanes 1–3 backend | **OPUS since 15:05:23** (owner: *"replace exec 1, 2, and 3 with opus for phase 2"*); the DeepSeek sessions died at 14:57 on `402 Insufficient Balance`. ⚠ DeepSeek does NOT auto-compact (exec 2 died at the 1M limit at 14:39). The session env `GISIK_EXECUTOR_BACKEND=deepseek` is vestigial; every launcher exports its own | status lines read `opus-5` on all six |
| lanes 4–6 backend | **Claude API, Opus** — launchers export `anthropic` per process | status line reads `opus-5`; no `backend deepseek` line in the pane |
| **ROUND 2 CLOSED (#634, #636); THE RELEASE PLAN IS ON MAIN (#637) — ⛔ NOT SCHEDULED** | Verdict `docs/lanes/review-round2-judgment.md` (UI exec 4 72–71, UX exec 2 107–101, FUNC exec 6 54.5–44.5; 240 rulings). **`docs/lanes/release-2026-09-22-plan.md`: 231 tasks / 18 batches / a model per task / copy-pasteable briefs / the driver protocol; `release-2026-09-22-progress.md` is the empty ledger.** Owner (17:4x): *"do not schedule anything yet. i will review the tasks."* — **dispatch nothing until the owner says which batches run and who drives**; when they do, follow the plan's §0–§4 verbatim, restore the nudger targets to the live windows, and expect a stranded prefix in each pane | `git show origin/main:docs/lanes/release-2026-09-22-progress.md \| tail -3` (empty = nothing started) |
| exec 1 · UI — **ENDED 17:20:52 IST** (lost 71–72 after cycle 43; 70–72 at the time) | window `gisik:1` killed, worktree `gisik-nokma-exec` removed, branch `exec1/review-ui-r2` kept at `b7c57b6d` (clean, = origin at the kill) | `tmux list-windows -t gisik`; `git ls-remote origin refs/heads/exec1/review-ui-r2` |
| exec 2 · UX · DeepSeek→Opus — **WINNER (110 vs 101), standing UX executor** | `gisik:2` · `…/gisik-nokma-exec2` · `exec2/review-ux-r2` @ close `84ce91d6`; IDLE AND HELD — no next work (cycle 35 §3) | capture the pane |
| exec 3 · functionality — **ENDED 17:21:05 IST** (lost 44.5–54.5) | `gisik:3` killed, `gisik-nokma-exec3` removed, `exec3/review-functionality-r2` kept at `58d88d6b` | same |
| exec 4 · UI · Opus — **WINNER (72 vs 70), standing UI executor** | `gisik:4` · `…/gisik-nokma-exec4` · `exec4/review-ui` @ close `fe35c41b`; IDLE AND HELD; its `next dev` on `:3041` (pid 99771 at 17:05) may still be serving | capture the pane; `lsof -iTCP:3041` |
| exec 5 · UX — **ENDED 17:21:18 IST** (lost 101–107 after cycle 43; 101–110 at the time) | `gisik:5` killed, `gisik-nokma-exec5` removed, `exec5/review-ux` kept at `67a33066` | same |
| exec 6 · functionality · Opus — **WINNER (54.5 vs 44.5), standing functionality executor** | `gisik:6` · `…/gisik-nokma-exec6` · `exec6/review-functionality` @ close `c14c8a05`; IDLE AND HELD | capture the pane |
| idle nudger | **ON**, plist still names six targets (`gisik:1,…,6`) — three no longer exist; a paste to a missing window fails harmlessly, but a re-enable/edit should set `IDLE_NUDGER_TARGETS=gisik:2,gisik:4,gisik:6`. ⚠ Its contextual pastes STRAND unsubmitted in a lane's input box (cycle 41 §6); a dispatch must expect a prefix it did not write | `launchctl list \| grep nudger`; the last `❯` line of each pane |
| limit resumer | ON (`com.kiro.claude-limit-resumer`); its live-pane delivery is now two `paste-buffer` pastes, not `send-keys` | `~/.claude/scripts/limit-resumer.log` |
| cron | NONE. The phase-2 close ran from a background shell of the cycle-41 session (`close-at-1705.log`) | `CronList` |
| PR watcher | harness `Monitor` on the open-PR set, armed 17:00 IST, 30-min lease — **dies with the session; re-arm first** | — |
| dev stack | owner's; built images from the PRIMARY checkout (`:3000`/`:3001`), last rebuilt **08:20 IST at `e2769d60`** | `docker ps`; `docker inspect --format '{{.Image}}'` |
| primary checkout | `/Users/kiro/my_projects/gisik-nokma` on `main` at `e2769d60`, clean — behind `main`; the owner pulls | `git -C … status --porcelain; git rev-parse HEAD` |
| graphify | code layer current at `origin/main` 09:17 IST (AST merge; doc layer 2026-09-20); **copied into all six lane worktrees** (`graphify-out/`, gitignored) | `stat graphify-out/GRAPH_REPORT.md` |
| controller worktree | `/Users/kiro/my_projects/gisik-nokma-ctl` — on `ctl/cycle44-plan-landed` (cut from `b0b2aa65`) | `git -C … status` |

## §2 WHAT IS IN FORCE — the hold
Round 2 is judged, landed (#634) and executed: exec 1, 3, 5 are ended; **exec 4 (UI), exec 2 (UX) and exec 6 (functionality) are the standing executors, IDLE AND HELD.** The round produced 239 rulings, not tasks; which become work is the owner's call (cycle 35 §3). ⛔ A controller waking here dispatches nothing until the owner speaks — and when it does dispatch, it restores the nudger's target list first and expects a stranded prefix in the pane.

## §3 AWAITING THE OWNER — unchanged from cycle 36 except item 6 (done)
1. **What the 45 round-1 rulings become** — now folded into round 2's outcome. 2. **exec 1's `14d86847`** (19 findings) — its `-r2` branch supersedes the question. 3. **The CI runner never starts** (`steps: []` since 2026-09-06). 4. **The auto-merge clause *"an independent CI run green"*** — exec 1's `I1` asks that the forced-gate substitution be written where the authorization lives. 5. **Coverage boundary** — now a scored target for the Opus lanes.

## §4 STANDING RULES THAT SURVIVE EVERY CYCLE — one line each, with where the reasoning lives
- **Never commit or push to `main`.** Branch from `origin/main`, PR `--base main`; the controller is the only merger; no executor merges its own PR. (`CLAUDE.md`; 2026-09-18 topology block)
- **The merge bar:** seven checks `rc=0` under Node 22 at the frozen head **with a control that returns non-zero**; the forced gate **at the landing tree, never transferred**, read for `EXIT=0` + `Tasks: 33 successful, 33 total` + `NODE=v22.*` (the `NODE=` line is on the wrapper's console, NOT in the log); tree identity; full-tree drop check with a control; merge verified **by API and reachability, never by exit status**. (cycle 35 §4; override)
- **Gate under load reads red on `Hook timed out` — re-gate on a quiet box before believing it.** With six lanes live, expect it. `gate.sh` hardcodes `--force`: batch docs-only changes into ONE gate. (override)
- **The dev stack is the owner's:** built images from the primary checkout; `build` is safe; `up/down/restart` only when the owner asks; a rebuild is `git pull --ff-only` there + `pnpm dev:stack:rebuild`, then **verify the artifact**. (cycle 21; cycle 36 §8)
- **Reaching a lane: two `paste-buffer` pastes** (text, pause, `\r`), never `send-keys`; `load-buffer` takes a PATH, not a redirect; proof of delivery is the lane acting, read from the transcript. (brief; cycle 35 §8)
- **Never `AskUserQuestion` in this topology** — the nudger's pasted Enter selects the first option and reads as an owner ruling. (override)
- **Every measurement names its tree and its Node**; a count is evidence only once its unit is pinned; a control traverses the same path in the same invocation; sha-bearing evidence goes through `/usr/bin/git`. (memory set; cycle 35 §5)
- **Never pipe a test run into `head`**; reap orphaned vitest workers at `ppid=1` only. (`CLAUDE.md`)

## §5 WHERE THINGS ARE
Briefs and launchers: `/Users/kiro/my_projects/gisik-nokma-lanes/` — round 2: `REVIEW-R2-RULES-2026-09-21.md` (byte-identical to `docs/lanes/review-round2-rules.md`), `REVIEW-R2-OPUS-EXEC{4,5,6}-2026-09-21.md`, `REVIEW-R2-ROLE-*-EXEC{4,5,6}-2026-09-21.md`, `REVIEW-R2-RELOOK-EXEC{1,2,3}-2026-09-21.txt` (pasted), `launch-exec{4,5,6}-2026-09-21-review-r2.sh`; round 1: `CTL-REVIEW-COMMON-2026-09-22.md` + role briefs; the controller's brief + live override `dispatch-controller-serial.md` + `.ctl-prompt-restart-2026-09-19.md`; `exec-claude.sh` (backend wrapper — **launch through it, never bare `claude`**); `ctl-self-restart.sh`. Prototype export: `gisik-nokma-lanes/prototype-2026-09-20/`. Gate reference copy: `docs/lanes/gate-lock/`. Handoffs: `docs/lanes/executor-state.md` (exec 1), `executor-2-state.md`, `executor-3-state.md`, each live block(s) only, history in `*-history.md`. Round-1 deliverables: `docs/lanes/review-{ui-exec1,ux-exec2,functionality-exec3,compiled-controller}.md`. Ledger: `docs/lanes/task-ledger.tsv` (`pnpm check:tasks`).

---

# Cross-lane controller — live state

> ⚠ **ROTATED 2026-09-21 (owner: *"do the rotation, one docs PR"*).** This file holds the **restart card and the NEWEST cycle only**. Every earlier cycle (35 and below) and the 2026-09-18 topology block live in **`docs/lanes/controller-state-history.md`**, byte-for-byte, newest first. Open one by heading: `grep -n "CYCLE 3[0-9]" docs/lanes/controller-state-history.md`. **The rule from now on: when an anchor writes cycle N+1, it moves cycle N to the TOP of the history file (directly under its header) in the same commit.** A `<name>.md` handoff always pairs with `<name>-history.md`.

## 🔄 MONDAY 2026-09-21 ~18:3x IST — **CYCLE 44: THE RELEASE PLAN IS ON MAIN (#637) — 231 TASKS, 18 BATCHES, A MODEL PER TASK, BRIEFS A HAIKU DRIVER CAN RUN; NOTHING SCHEDULED.** `main` is **`b0b2aa65`**; zero open PRs.

### 1. WHAT LANDED
`docs/lanes/release-2026-09-22-plan.md` (787 KB), generated by `gen.py` (cycle-44 session scratchpad; copy kept in `gisik-nokma-lanes/judge-2026-09-21/`) from `review-scores.tsv` at `b8b09fb5` and each finding's own remedy paragraph: one task per valid ruling (231 — coverage asserted), ranked (severity × cluster impact ÷ solo hours), 18 batches in value-per-hour order, a model per task (haiku 114 · sonnet 105 · opus 10 · OWNER I1 · OWNER-DECISION E6-26), a self-contained brief per task, §0 driver rules, §1 loop, §4 reviewer pass and PR template. Committed release set B01–B05 (27 batched h / 60 tasks for three drivers at ~9 h before the 10:30 cut-off); stretch B06–B07; post-release B08–B18; whole plan ~105 batched h. `release-2026-09-22-progress.md` is the empty append-only ledger (batch claims + per-task lines) that makes a driver's restart free.

### 2. WHAT THE OWNER SAID, VERBATIM, AND WHAT IT BINDS
*"do not schedule anything yet. i will review the tasks."* (17:4x) — then the four asks that produced the plan (all 233 → tasks; rank; batch; persist; model per task, *"fable is out of the option for the implementation"*, no bigger than required; briefs copy-pasteable; *"one instruction manual that a haiku model can run autonomously till it finishes everything"*). **The plan exists to be reviewed; the next controller action is whatever the owner says after reading it.** A controller waking here dispatches nothing.

### 3. WHEN THE OWNER SAYS GO — the dispatch shape (not an order to dispatch)
One driver per worktree (`…-exec6`, `…-exec2`, `…-exec4`), launched through `exec-claude.sh` at the batch's session model (the plan's §3 column; haiku drivers dispatch sonnet/opus tasks as subagents per §0.8), with the launch prompt = the plan's §0 + §1 + the batch's section pasted verbatim (or simply: *"Read docs/lanes/release-2026-09-22-plan.md and run batch BNN"*). Restore the nudger (`IDLE_NUDGER_TARGETS` = the live windows) in the same action. The controller merges each batch PR on the seven checks + a forced gate at the head, then rebuilds the stack from `main` after the last release merge.

### 4. INSTRUMENTS THIS CYCLE
- An extraction over six report formats needs a per-format spot check, not a count: exec 3 numbers its findings as `## N.` sections and exec 6 keeps E6-26 in its refutation file; 11 findings had no remedy paragraph and got hand-written fixes.
- Per-ruling accounting is ~1.7× the cluster accounting (175 solo h vs the 45-cluster ~95 h) — say which unit a capacity number is in.

---
