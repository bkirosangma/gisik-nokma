# ▣ RESTART CARD — the ONLY mandatory read at wake. Rewritten at every anchor, in the anchor's own commit. Last rewritten **2026-09-21 ~09:5x IST** at `origin/main` **`a7b6292b`** (#630) by the cycle-37 controller.

> **Why this card exists (owner, 2026-09-21: *"the restart takes too long"*).** The brief used to order *"read `controller-state.md` in full"* plus all three executor handoffs — measured at **3.16 MB / ~34,000 lines ≈ 790k tokens** before a controller's first word. **A restarting controller reads THIS CARD and the NEWEST cycle entry below it, prints a one-line awake report to the owner, and re-measures §1. Nothing else is mandatory.** Older cycles live in **`docs/lanes/controller-state-history.md`** (open one by heading: `grep -n "CYCLE 3[0-9]" docs/lanes/controller-state-history.md`) and only when the card or the newest cycle points you at it. Each executor handoff `<name>.md` pairs with `<name>-history.md`; read a handoff's TOP BLOCK only, and only for a lane you are about to merge or dispatch.
> ⚠ **The card is a reading that expires.** Every number in §1 is re-measured before it is repeated; if the card and the newest cycle disagree, the newest cycle wins and the card is stale — fix the card in the next anchor. **Whoever writes cycle N+1 moves cycle N to the TOP of the history file in the same commit.**

## §1 LIVE ANCHORS — re-measure each before repeating it
| anchor | value at last rewrite | re-measure with |
|---|---|---|
| `origin/main` | `a7b6292b` (#630) | `git fetch && git rev-parse origin/main` |
| open PRs | **0** | `gh pr list --state open --json number,headRefOid,mergeable` + a `--state merged --limit 2` control on the same path |
| ledger | 307 done / 1 todo | `pnpm check:tasks` under Node 22 |
| controller seat | `gisik:0`, **Claude API — the session identifies as Fable 5.1** (status line read `opus-5` at 07:55 wake); launched per-launcher (`ctl-start.sh` / `ctl-self-restart.sh`, both export `anthropic`) | pane status line; `/tmp/ctl-self-restart.log` |
| lanes 1–3 backend | `deepseek-flash[1m]`; session env `GISIK_EXECUTOR_BACKEND=deepseek` **is theirs — do not harmonise** | `tmux show-environment -t gisik GISIK_EXECUTOR_BACKEND` |
| lanes 4–6 backend | **Claude API, Opus** — launchers export `anthropic` per process | status line reads `opus-5`; no `backend deepseek` line in the pane |
| **REVIEW ROUND 2 — LIVE** | **T0 = 2026-09-21 09:41:50 IST**; phase 1 (review) ends **15:41:50**; phase 2 (refutation) ends **18:41:50**; then judging. Rules: `docs/lanes/review-round2-rules.md`. Ledger: `docs/lanes/review-scores.tsv` | the phase clock is wall time — `date` |
| exec 1 · UI · DeepSeek | `gisik:1` · `…/gisik-nokma-exec` · `exec1/review-ui-r2` · relook, extending `review-ui-exec1.md` | `git ls-remote origin refs/heads/exec1/review-ui-r2`; capture the pane |
| exec 2 · UX · DeepSeek | `gisik:2` · `…/gisik-nokma-exec2` · `exec2/review-ux-r2` | same shape |
| exec 3 · functionality · DeepSeek | `gisik:3` · `…/gisik-nokma-exec3` · `exec3/review-functionality-r2` | same shape |
| exec 4 · UI · Opus | `gisik:4` · `…/gisik-nokma-exec4` · `exec4/review-ui` · report `review-ui-exec4.md` | same shape |
| exec 5 · UX · Opus | `gisik:5` · `…/gisik-nokma-exec5` · `exec5/review-ux` · report `review-ux-exec5.md` | same shape |
| exec 6 · functionality · Opus | `gisik:6` · `…/gisik-nokma-exec6` · `exec6/review-functionality` · report `review-functionality-exec6.md` | same shape |
| idle nudger | **ON**, six targets (`IDLE_NUDGER_TARGETS=gisik:1,…,gisik:6` in the plist) | `launchctl list \| grep nudger` |
| limit resumer | ON (`com.kiro.claude-limit-resumer`); its live-pane delivery is now two `paste-buffer` pastes, not `send-keys` | `~/.claude/scripts/limit-resumer.log` |
| cron | session-only round-2 cron (phase-aware); **none on disk** — a successor wakes with none | `CronList` |
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

## 🔄 MONDAY 2026-09-21 ~09:5x IST — **CYCLE 37: REVIEW ROUND 2 IS LIVE — SIX LANES, THREE PAIRS, ONE JUDGE. T0 = 09:41:50 IST.** `main` is **`a7b6292b`** (#630); **zero open PRs**; ledger 307 done / 1 todo.

### 1. 📌 THE OWNER'S ORDERS THIS CYCLE, IN ORDER
1. *"rebuild the dev stack."* — done, cycle 36 §8(a). 2. *"check the restart script and instructions. the restart takes too long."* — done, cycle 36 §8(b); rotation approved and landed as **#630 → `a7b6292b`** (three live files cut to card/top block; three `*-history.md` files carry the rest byte-for-byte, sha256-proven with a control). 3. *"hope the graphify is up to date. do so if not."* — it was behind by the night's merges; the code layer was rebuilt (AST over 1,161 code files → 10,670 nodes / 19,406 edges, +167/+385 vs Sep 20). **The semantic re-pass was SKIPPED on the owner's word** (Q2: *"skip"*): the cache was empty and a full pass would read 14.2 MB of docs, mostly handoff history. 4. **The competition** (§0 of `docs/lanes/review-round2-rules.md` quotes it verbatim), with the owner's answers to the controller's eight questions: land the rotation first (yes); semantic graphify (skip); machine capacity (3b — but see §3); points severity-weighted C5/I3/M1 at the judge's severity, invalid −3× claimed; refutation transfers points and penalises, failed refutation costs the refuter; DeepSeek's landed findings are their base and Opus re-finds score 0 without a new measurement; the loser is ended, its branch kept, the winner is the standing executor; **6 h / 3 h**. Two rule amendments from the owner: **no first-commit-wins** (unfair to lanes that started later) and **category-2 divergences score if the reviewer argues the ruling is mistaken**, connected evidence weighing more. 5. *"make sure they make full use of graphify to save as much tokens as possible."* — rules §6; `graphify-out/` copied into all six worktrees (sha `38e42c17…` identical in all seven copies). 6. *"make sure you self restart if the session budget runs out. it likely will."* — §4.

### 2. THE BUDGET ESTIMATE THE OWNER ASKED FOR (Q8), measured from transcripts
Weekly calibration: Mon 09-14 → Thu 09-18 Anthropic-family spend was **993 M weighted tokens** (in + out + 1.25×cache-write + 0.10×cache-read) when the owner said the limit was *"almost over"*, so **one week ≈ 1,000–1,050 M weighted**. The DeepSeek round-1 reviewers ran **52 min each** (00:03–00:55) at 19.5 / 17.2 / 5.1 M weighted — **~20 M per lane-hour**. Estimate for 6 h × 3 Opus + 3 h × 3 Opus + judging: **~525 M ≈ 50% of the week (range 37–70%)**; fan-out is the variable. Weekly meter read 0% at 07:55 (reset this morning).

### 3. THE DISPATCH — and one deviation from 3b, stated
| lane | pane | backend (measured) | branch | started |
|---|---|---|---|---|
| exec 4 · UI | `gisik:4` | `opus-5` on the status line; no `backend deepseek` stderr line | `exec4/review-ui` @ `a7b6292b` | 09:41 |
| exec 5 · UX | `gisik:5` | `opus-5` | `exec5/review-ux` @ `a7b6292b` | 09:41 |
| exec 6 · functionality | `gisik:6` | `opus-5` | `exec6/review-functionality` @ `a7b6292b` | 09:41 |
| exec 1 · UI | `gisik:1` | `deepseek-flash[1m]` | `exec1/review-ui-r2` (ack: *"Read the rules in full and cut exec1/review-ui-r2 from origin/main = a7b6292b"*) | 09:42 |
| exec 2 · UX | `gisik:2` | `deepseek-flash[1m]` | `exec2/review-ux-r2` (it computed its base: *"2×5 + 11×3 + 6×1 = 49 points"*) | 09:42 |
| exec 3 · functionality | `gisik:3` | `deepseek-flash[1m]` | `exec3/review-functionality-r2` (ack) | 09:42 |
**The deviation:** the owner chose 3b (Opus reviews while DeepSeek holds, then all six refute) and then noted *"deepseek reviewer ran for a short amount time"*. **All six run phase 1 concurrently** so the DeepSeek lanes get the same six hours; the OOM risk 3b was meant to avoid is carried by the rules instead (§4: no full turbo gate, one package's suite at a time, `--no-file-parallelism`, never `| head`). Swap at T0: 1,258 MB free of 4,096; **re-read `sysctl vm.swapusage` on every check and, if free swap falls under ~300 MB, tell the owner before anything else.** The Opus lanes were launched through `launch-exec{4,5,6}-2026-09-21-review-r2.sh` → `exec-claude.sh` with `GISIK_EXECUTOR_BACKEND=anthropic` exported per process (the session env stays `deepseek` for lanes 1–3). Each prompt is ~25 KB: lane override + round-1 common brief + the rules + the role addendum (derived from the round-1 role brief, its *"your own work"* section replaced by *"the round-1 lane's blind spots are your target"*). The DeepSeek lanes received the relook order as a paste (text, pause, CR) into their live sessions — they keep what they read in round 1.

### 4. SELF-RESTART, as the owner ordered — what is armed and what was fixed
- **Session-limit (5-hour / weekly) errors:** `com.kiro.claude-limit-resumer` is loaded (45-min sweep + a one-shot at reset + 2 min; Claude Code also natively auto-resumes an interactive session at reset). ⚠ **Its live-pane path used `tmux send-keys "continue" Enter`, which copy mode swallows** — patched 2026-09-21 to two `paste-buffer` pastes (`limit-resumer.py: tmux_inject_continue`), `import time` added, dry-run path kept side-effect free; load-tested. The registry (`limit-resumer-registry/`) is fed by SessionStart hooks, so lanes 4–6 registered themselves at launch.
- **Context fill:** `ctl-self-restart.sh` (fixed 30 s wait → 2 s poll, cycle 36); **the restart card is the handoff**, so a restarted controller is productive within two minutes.
- **The nudger is ON for six targets** (`IDLE_NUDGER_TARGETS` in the plist; installed + bootstrapped in the same action as the dispatch, rc=0). It cannot tell a finished lane from a stalled one — a lane that has pushed its report and said so may be nudged; the nudge text tells it to say so rather than spin.

### 5. WHAT THE JUDGE DOES AT EACH BOUNDARY
**15:41:50** — collect: `git ls-remote` every lane branch, record the sha, read each report FROM THE BRANCH (never a worktree), count findings by claimed severity; anything not pushed is not submitted. Tell all six lanes phase 2 is open (paste). **18:41:50** — collect refutations the same way; tell the lanes to stop. **Then judge:** every finding and every refutation gets a row in `docs/lanes/review-scores.tsv` with the line the judge opened; totals per lane; per pair the winner; the loser's session ended and worktree retired (branch kept); everything lands in ONE PR with the seven checks and the forced gate at the landing tree, and the anchor. ⚠ **The judge verifies by opening the line and running the reproduction — never by re-reading the finding's own citation.** Family is not evidence.

---

