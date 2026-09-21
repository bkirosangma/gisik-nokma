# ▣ RESTART CARD — the ONLY mandatory read at wake. Rewritten at every anchor, in the anchor's own commit. Last rewritten **2026-09-21 ~15:0x IST** at `origin/main` **`30fc083b`** (#631) by the cycle-38 controller.

> **Why this card exists (owner, 2026-09-21: *"the restart takes too long"*).** The brief used to order *"read `controller-state.md` in full"* plus all three executor handoffs — measured at **3.16 MB / ~34,000 lines ≈ 790k tokens** before a controller's first word. **A restarting controller reads THIS CARD and the NEWEST cycle entry below it, prints a one-line awake report to the owner, and re-measures §1. Nothing else is mandatory.** Older cycles live in **`docs/lanes/controller-state-history.md`** (open one by heading: `grep -n "CYCLE 3[0-9]" docs/lanes/controller-state-history.md`) and only when the card or the newest cycle points you at it. Each executor handoff `<name>.md` pairs with `<name>-history.md`; read a handoff's TOP BLOCK only, and only for a lane you are about to merge or dispatch.
> ⚠ **The card is a reading that expires.** Every number in §1 is re-measured before it is repeated; if the card and the newest cycle disagree, the newest cycle wins and the card is stale — fix the card in the next anchor. **Whoever writes cycle N+1 moves cycle N to the TOP of the history file in the same commit.**

## §1 LIVE ANCHORS — re-measure each before repeating it
| anchor | value at last rewrite | re-measure with |
|---|---|---|
| `origin/main` | `30fc083b` (#631) | `git fetch && git rev-parse origin/main` |
| open PRs | **0** | `gh pr list --state open --json number,headRefOid,mergeable` + a `--state merged --limit 2` control on the same path |
| ledger | 307 done / 1 todo | `pnpm check:tasks` under Node 22 |
| controller seat | `gisik:0`, **Claude API — the session identifies as Fable 5.1** (status line read `opus-5` at 07:55 wake); launched per-launcher (`ctl-start.sh` / `ctl-self-restart.sh`, both export `anthropic`) | pane status line; `/tmp/ctl-self-restart.log` |
| lanes 1–3 backend | **DeepSeek until 15:41:50, then OPUS** (owner 14:5x: *"replace exec 1, 2, and 3 with opus for phase 2. deepseek balance is about to run out. $.7 left"*). ⚠ DeepSeek does NOT auto-compact — exec 2 died at the 1M limit at 14:39 and was relaunched from its branch at 14:44; 1 and 3 compact manually at 80%. The session env `GISIK_EXECUTOR_BACKEND=deepseek` is now vestigial; every launcher exports its own | status lines; `/tmp` has nothing — read the panes |
| lanes 4–6 backend | **Claude API, Opus** — launchers export `anthropic` per process | status line reads `opus-5`; no `backend deepseek` line in the pane |
| **REVIEW ROUND 2 — LIVE** | **T0 = 2026-09-21 09:41:50 IST**; phase 1 ends **15:41:50**; phase 2 ends **18:41:50**; then judging. Rules: `docs/lanes/review-round2-rules.md`. Ledger: `docs/lanes/review-scores.tsv`. **The boundary is a SCRIPT: `gisik-nokma-lanes/phase2-boundary-2026-09-21.sh <scratchpad>`** — records the six phase-1 shas to `T0.txt`, pastes PHASE 2 OPEN to 4–6, kills+relaunches 1–3 on Opus via `launch-exec{1,2,3}-2026-09-21-phase2-opus.sh`. A successor checks `grep PHASE1_CLOSE <scratchpad>/T0.txt`; if empty after 15:41:50, run it | `date`; `T0.txt` |
| exec 1 · UI · DeepSeek→Opus | `gisik:1` · `…/gisik-nokma-exec` · `exec1/review-ui-r2` · extending `review-ui-exec1.md`; phase-2 brief `REVIEW-R2-PHASE2-OPUS-EXEC1-2026-09-21.md` | `git ls-remote origin refs/heads/exec1/review-ui-r2`; capture the pane |
| exec 2 · UX · DeepSeek→Opus | `gisik:2` · `…/gisik-nokma-exec2` · `exec2/review-ux-r2` · relaunched 14:44 (`REVIEW-R2-RESUME-EXEC2-2026-09-21.md`) after the 1M-context death; phase-2 brief `…PHASE2-OPUS-EXEC2…` | same shape |
| exec 3 · functionality · DeepSeek→Opus | `gisik:3` · `…/gisik-nokma-exec3` · `exec3/review-functionality-r2`; phase-2 brief `…PHASE2-OPUS-EXEC3…` | same shape |
| exec 4 · UI · Opus | `gisik:4` · `…/gisik-nokma-exec4` · `exec4/review-ui` · report `review-ui-exec4.md` | same shape |
| exec 5 · UX · Opus | `gisik:5` · `…/gisik-nokma-exec5` · `exec5/review-ux` · report `review-ux-exec5.md` | same shape |
| exec 6 · functionality · Opus | `gisik:6` · `…/gisik-nokma-exec6` · `exec6/review-functionality` · report `review-functionality-exec6.md` | same shape |
| idle nudger | **ON**, six targets (`IDLE_NUDGER_TARGETS=gisik:1,…,gisik:6` in the plist) | `launchctl list \| grep nudger` |
| limit resumer | ON (`com.kiro.claude-limit-resumer`); its live-pane delivery is now two `paste-buffer` pastes, not `send-keys` | `~/.claude/scripts/limit-resumer.log` |
| cron | session-only: recurring `:17/:47` round-2 check (v3, with the DeepSeek compaction guard and the backend switch) + a one-shot at 15:42 that runs the boundary script; **none on disk** — a successor wakes with none and must run the boundary script by hand if `T0.txt` lacks `PHASE1_CLOSE` | `CronList` |
| PR watcher | harness `Monitor` on the open-PR set, 30-min lease — **dies with the session; re-arm first** | — |
| dev stack | owner's; built images from the PRIMARY checkout (`:3000`/`:3001`), last rebuilt **08:20 IST at `e2769d60`** | `docker ps`; `docker inspect --format '{{.Image}}'` |
| primary checkout | `/Users/kiro/my_projects/gisik-nokma` on `main` at `e2769d60`, clean — behind `main`; the owner pulls | `git -C … status --porcelain; git rev-parse HEAD` |
| graphify | code layer current at `origin/main` 09:17 IST (AST merge; doc layer 2026-09-20); **copied into all six lane worktrees** (`graphify-out/`, gitignored) | `stat graphify-out/GRAPH_REPORT.md` |
| controller worktree | `/Users/kiro/my_projects/gisik-nokma-ctl` — detach to `origin/main` before each use | `git -C … checkout --detach origin/main` |

## §2 WHAT IS IN FORCE — the competition, not the hold
Round 2 is live (owner, 2026-09-21): three Opus lanes review the whole codebase against the prototype export, the three DeepSeek round-1 lanes relook and extend, then all six refute across concerns, then **the controller judges every finding and refutation** (rules §3–§5: severity-weighted points at the judge's severity, invalid = −3× claimed, refutations move points, coverage is the tiebreaker, every ruling cites a line the judge opened). **The loser of each pair is ended.** The controller merges nothing from the lanes until judging: reports and refutations are collected from branches at the phase boundaries and landed with the ledger in ONE PR. ⛔ **A controller waking mid-round must NOT relaunch any lane** — a reviewer restarted mid-read loses what it has read; if a lane is dead (`API Error`, budget), leave its pushed branch as its submission and note it. The owner's order on budget: *"make sure you self restart if the session budget runs out"* — for the controller that is the limit-resumer plus `ctl-self-restart.sh`; for a lane it is its pushed branch.

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

## 🔄 MONDAY 2026-09-21 ~15:0x IST — **CYCLE 38: PHASE 1 AT 5h20m — AN OUTAGE, A BACKEND THAT NEVER COMPACTS, AND THE OWNER'S ORDER TO MOVE LANES 1–3 TO OPUS AT THE BOUNDARY.** `main` is **`30fc083b`** (#631); **zero open PRs**.

### 1. THE FINDINGS PER LANE, from the pushed branches (heading counts; the lanes' own severity labels; not yet judged)
| pair | lane | 10:58 | 11:50 | 12:23 | 13:26 | withdrawn |
|---|---|---|---|---|---|---|
| UI | exec 1 · DeepSeek | 26 | 27 | 29 | 30 | 2 |
| UI | exec 4 · Opus | 22 | 30 | 31 | 31 | 0 |
| UX | exec 2 · DeepSeek | 45 | 52 | 52 | 52 | 1 |
| UX | exec 5 · Opus | 29 | 34 | 38 | 40 | 0 |
| FUNC | exec 3 · DeepSeek | 21 | 25 | 25 | 26 | 0 |
| FUNC | exec 6 · Opus | 14 | 18 | 23 | 24 | 0 |
Discovery slowed to ~5/hour after 12:00; exec 2 and exec 6 opened refutation files in phase 1. Coverage sections were read from every branch at 12:3x — exec 4 painted the signed-in app at four widths (round 1's #1 gap); exec 5 walked the running stack on `:3001` signed in read-only until its browser died at ~10:30; exec 6 went line-by-line into the four packages exec 3 said it did not reach; exec 3 is total on soft-delete/migrations/routes/checkers and nowhere else.

### 2. THREE INCIDENTS, each handled without relaunching a working lane
1. **Network outage 13:32–13:46 IST** (DNS/API unreachable; IP fine; the net-resumer logged `offline`). Five lanes died mid-turn on `API Error: Can't reach the API server` and sat idle. A one-line resume was pasted to all six at 13:48; all resumed; five pushed within two minutes. Cost: ~16 minutes of phase 1, nothing lost. **The watcher now collapses repeated outage errors** instead of one event per minute.
2. **exec 4 declared itself finished at 12:5x and held for the boundary.** Rather than prod one lane, the same reminder went to all six at 13:55: holding earns nothing, coverage is the tiebreaker, spend the time on your own not-reached list.
3. ⛔ **DEEPSEEK DOES NOT AUTO-COMPACT.** exec 2 hit `API Error: 400 This model's maximum context length is 1048576 tokens. However, you requested 1048793` at 14:39 — **zero compaction records in its transcript** (the Opus lanes' transcripts carry `compactMetadata: trigger auto, 969038 → 11393`). A manual `/compact` on exec 2 **also failed** (the summarize request was itself 1,050,093 tokens). Manual `/compact` on exec 1 (86%) and exec 3 (77%) **worked** (→ 11% / 7%). **exec 2 was relaunched at 14:44 from its pushed branch** (`REVIEW-R2-RESUME-EXEC2-2026-09-21.md` + `launch-exec2-2026-09-21-review-r2-resume.sh`); its one uncommitted file was committed and pushed by the new session at 14:45. Rule pasted to 1 and 3: `/compact` yourself at 80%. **This is the first time this project has measured why a DeepSeek lane goes silent at ~6 hours.**

### 3. 📌 THE OWNER'S ORDER, 14:5x: *"replace exec 1, 2, and 3 with opus for phase 2. deepseek balance is about to run out. $.7 left."*
Executed as a boundary script rather than by hand, so a successor can run it: **`gisik-nokma-lanes/phase2-boundary-2026-09-21.sh <scratchpad>`** — (a) `git fetch` and append `PHASE1_CLOSE` + the six branch shas to `T0.txt`; (b) paste PHASE 2 OPEN to `gisik:4–6`; (c) kill and relaunch `gisik:1–3` through `launch-exec{1,2,3}-2026-09-21-phase2-opus.sh` (`GISIK_EXECUTOR_BACKEND=anthropic` exported per launcher; prompt = `REVIEW-R2-PHASE2-OPUS-EXECn-2026-09-21.md` + common brief + rules + the round-1 role brief). The phase-2 brief tells the Opus session it **inherits the lane** — branch, report (frozen at the recorded sha), score, opponent — and that withdrawals now cost. A one-shot cron fires the script at 15:42; the recurring check re-runs it if `T0.txt` lacks `PHASE1_CLOSE`. Execs 1–3 were told to push every 10 minutes until the boundary in case the balance ends first; a DeepSeek death before 15:41:50 is NOT relaunched on DeepSeek — the branch is the submission and the Opus relaunch comes early.
⚠ **What this changes about the comparison:** phase 2 is Opus defending Opus-authored reports against Opus defending DeepSeek-authored reports. The model comparison is about **phase-1 authorship**; the kill applies to the losing lane. Recorded here so the result is not misread later.

### 4. BUDGET, measured against the estimate
The Opus lanes' status lines read **weekly 6%** at 4h13m (13:5x). Cycle 37 §2 estimated ~50% for the whole round; the DeepSeek reviewers' 20 M-per-lane-hour over-predicted Opus by roughly 3×. Expect the round to finish well under 20% of the week.

### 5. FOR THE JUDGE, at 18:41:50
Paste PHASE 2 CLOSED to all six; record `PHASE2_CLOSE` shas; read every report and refutation file **from its recorded sha**; one ledger row per finding and per refutation with the line the judge opened; per-pair totals; the loser ended (branch kept); everything in ONE PR with the seven checks and the forced gate at the landing tree. ⚠ **A finding is scored at the sha recorded at `PHASE1_CLOSE`; a refutation or defence at `PHASE2_CLOSE`.** Later pushes are not submitted.

---

