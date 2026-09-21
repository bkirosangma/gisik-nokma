# ▣ RESTART CARD — the ONLY mandatory read at wake. Rewritten at every anchor, in the anchor's own commit. Last rewritten **2026-09-21 ~15:1x IST** at `origin/main` **`aad3f511`** (#632) by the cycle-39 controller.

> **Why this card exists (owner, 2026-09-21: *"the restart takes too long"*).** The brief used to order *"read `controller-state.md` in full"* plus all three executor handoffs — measured at **3.16 MB / ~34,000 lines ≈ 790k tokens** before a controller's first word. **A restarting controller reads THIS CARD and the NEWEST cycle entry below it, prints a one-line awake report to the owner, and re-measures §1. Nothing else is mandatory.** Older cycles live in **`docs/lanes/controller-state-history.md`** (open one by heading: `grep -n "CYCLE 3[0-9]" docs/lanes/controller-state-history.md`) and only when the card or the newest cycle points you at it. Each executor handoff `<name>.md` pairs with `<name>-history.md`; read a handoff's TOP BLOCK only, and only for a lane you are about to merge or dispatch.
> ⚠ **The card is a reading that expires.** Every number in §1 is re-measured before it is repeated; if the card and the newest cycle disagree, the newest cycle wins and the card is stale — fix the card in the next anchor. **Whoever writes cycle N+1 moves cycle N to the TOP of the history file in the same commit.**

## §1 LIVE ANCHORS — re-measure each before repeating it
| anchor | value at last rewrite | re-measure with |
|---|---|---|
| `origin/main` | `aad3f511` (#632) | `git fetch && git rev-parse origin/main` |
| open PRs | **0** | `gh pr list --state open --json number,headRefOid,mergeable` + a `--state merged --limit 2` control on the same path |
| ledger | 307 done / 1 todo | `pnpm check:tasks` under Node 22 |
| controller seat | `gisik:0`, **Claude API — the session identifies as Fable 5.1** (status line read `opus-5` at 07:55 wake); launched per-launcher (`ctl-start.sh` / `ctl-self-restart.sh`, both export `anthropic`) | pane status line; `/tmp/ctl-self-restart.log` |
| lanes 1–3 backend | **OPUS since 15:05:23** (owner: *"replace exec 1, 2, and 3 with opus for phase 2"*); the DeepSeek sessions died at 14:57 on `402 Insufficient Balance`. ⚠ DeepSeek does NOT auto-compact (exec 2 died at the 1M limit at 14:39). The session env `GISIK_EXECUTOR_BACKEND=deepseek` is vestigial; every launcher exports its own | status lines read `opus-5` on all six |
| lanes 4–6 backend | **Claude API, Opus** — launchers export `anthropic` per process | status line reads `opus-5`; no `backend deepseek` line in the pane |
| **REVIEW ROUND 2 — PHASE 2 LIVE** | T0 = 09:41:50. **Phase 1 CLOSED EARLY at 15:05:23 IST** (owner: *"lets start phase 2 early"*, then *"make phase 2 just 2 h instead of 3 h. then go"*). **Phase 2 ends 17:05:23 IST.** Frozen phase-1 shas (cycle 39 §1). Rules: `docs/lanes/review-round2-rules.md`. Ledger: `docs/lanes/review-scores.tsv`. At 17:05:23: paste PHASE 2 CLOSED to all six, record `PHASE2_CLOSE` shas, then judge | `date`; scratchpad `T0.txt` |
| exec 1 · UI · DeepSeek→Opus | `gisik:1` · `…/gisik-nokma-exec` · `exec1/review-ui-r2` · extending `review-ui-exec1.md`; phase-2 brief `REVIEW-R2-PHASE2-OPUS-EXEC1-2026-09-21.md` | `git ls-remote origin refs/heads/exec1/review-ui-r2`; capture the pane |
| exec 2 · UX · DeepSeek→Opus | `gisik:2` · `…/gisik-nokma-exec2` · `exec2/review-ux-r2` · relaunched 14:44 (`REVIEW-R2-RESUME-EXEC2-2026-09-21.md`) after the 1M-context death; phase-2 brief `…PHASE2-OPUS-EXEC2…` | same shape |
| exec 3 · functionality · DeepSeek→Opus | `gisik:3` · `…/gisik-nokma-exec3` · `exec3/review-functionality-r2`; phase-2 brief `…PHASE2-OPUS-EXEC3…` | same shape |
| exec 4 · UI · Opus | `gisik:4` · `…/gisik-nokma-exec4` · `exec4/review-ui` · report `review-ui-exec4.md` | same shape |
| exec 5 · UX · Opus | `gisik:5` · `…/gisik-nokma-exec5` · `exec5/review-ux` · report `review-ux-exec5.md` | same shape |
| exec 6 · functionality · Opus | `gisik:6` · `…/gisik-nokma-exec6` · `exec6/review-functionality` · report `review-functionality-exec6.md` | same shape |
| idle nudger | **ON**, six targets (`IDLE_NUDGER_TARGETS=gisik:1,…,gisik:6` in the plist) | `launchctl list \| grep nudger` |
| limit resumer | ON (`com.kiro.claude-limit-resumer`); its live-pane delivery is now two `paste-buffer` pastes, not `send-keys` | `~/.claude/scripts/limit-resumer.log` |
| cron | session-only: recurring `:17/:47` round-2 check (v5: reads PHASE2_END from `T0.txt`, closes phase 2); **none on disk** — a successor wakes with none and closes phase 2 by hand at 17:05:23 (paste + shas) | `CronList` |
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

## 🔄 MONDAY 2026-09-21 ~15:1x IST — **CYCLE 39: PHASE 1 CLOSED EARLY AT 15:05:23 ON THE OWNER'S WORD; PHASE 2 IS TWO HOURS, ENDS 17:05:23; ALL SIX LANES ARE OPUS.** `main` is **`aad3f511`** (#632); **zero open PRs**.

### 1. THE FREEZE — findings are scored at THESE shas, nothing later
Owner, 15:0x: *"lets start phase 2 early. lemme know when we can start."* → *"make phase 2 just 2 h instead of 3 h. then go."* The boundary script ran at **15:05:23 IST** and recorded (scratchpad `T0.txt`, `PHASE1_CLOSE` line):
| lane | branch | phase-1 sha |
|---|---|---|
| exec 1 · UI · DeepSeek-authored | `exec1/review-ui-r2` | `2cfffc7a7c007b75d05c18b46dbb69664a347997` (+ one pending pre-death edit the Opus session commits first — the judge diffs that commit and counts it as phase-1 work only if it touches nothing but the report) |
| exec 2 · UX · DeepSeek-authored | `exec2/review-ux-r2` | `778a6439793e074eb8dd819ce90dd7fefa910e1e` |
| exec 3 · FUNC · DeepSeek-authored | `exec3/review-functionality-r2` | `f8b5e929efdef8aae6e01ab44d9e923eb4eb12c4` |
| exec 4 · UI · Opus | `exec4/review-ui` | `98584aa36da8d23ede541cb94e7c917207165d38` |
| exec 5 · UX · Opus | `exec5/review-ux` | `1641161de9e99be17d69c679af40c35db36cacf3` |
| exec 6 · FUNC · Opus | `exec6/review-functionality` | `737294ae05f0a6671e018fb6dab625d622d4afe2` |
The DeepSeek sessions had died at **14:57** on `API Error: 402 Insufficient Balance` (all three, twelve minutes into a turn); they were deliberately NOT relaunched before the boundary (Opus was ordered for phase 2, and Opus finishing a DeepSeek-authored phase-1 report would muddy the authorship comparison). Cost to them: ~8 minutes of phase 1; cost to the Opus lanes of the early close: ~36 minutes they were spending idle/tightening.

### 2. WHAT RUNS NOW
Execs 1–3 relaunched at 15:05 on the Claude API (status lines `opus-5`, no `backend deepseek` line) with `REVIEW-R2-PHASE2-OPUS-EXEC{1,2,3}-2026-09-21.md` (times substituted: close 15:05:23, end 17:05:23): inherit the lane, report frozen, refute with measurements, defend, push every 15 min. Execs 4–6 received PHASE 2 OPEN by paste (all three transcripts show it submitted). The recurring cron (v5) reads `PHASE2_END` from `T0.txt` and closes phase 2 with the paste + `PHASE2_CLOSE` shas; the 15:42 one-shot was cancelled so the boundary cannot run twice. Findings counted at 14:54 (pre-freeze; heading counts): UI 36 vs 37 · UX 61 vs 45 · FUNC 31 vs 27 — the reminder of 13:55 had produced 34 new findings in 90 minutes.

### 3. FOR THE JUDGE, at 17:05:23
Paste PHASE 2 CLOSED to all six; record `PHASE2_CLOSE` shas; read every report at its **phase-1 sha** and every refutation/defence at its **phase-2 sha**; one ledger row per finding and per refutation with the line the judge opened; per-pair totals; the loser ended (branch kept); everything in ONE PR with the seven checks and the forced gate at the landing tree; the anchor.

---

