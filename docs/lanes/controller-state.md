# ▣ RESTART CARD — the ONLY mandatory read at wake. Rewritten at every anchor, in the anchor's own commit. Last rewritten **2026-09-21 ~16:5x IST** at `origin/main` **`d3772072`** (#633) by the cycle-40 controller, ON BRANCH `ctl/round2-judgment` (pushed, no PR yet) — ⚠ a successor reads THIS branch's copy, not main's.

> **Why this card exists (owner, 2026-09-21: *"the restart takes too long"*).** The brief used to order *"read `controller-state.md` in full"* plus all three executor handoffs — measured at **3.16 MB / ~34,000 lines ≈ 790k tokens** before a controller's first word. **A restarting controller reads THIS CARD and the NEWEST cycle entry below it, prints a one-line awake report to the owner, and re-measures §1. Nothing else is mandatory.** Older cycles live in **`docs/lanes/controller-state-history.md`** (open one by heading: `grep -n "CYCLE 3[0-9]" docs/lanes/controller-state-history.md`) and only when the card or the newest cycle points you at it. Each executor handoff `<name>.md` pairs with `<name>-history.md`; read a handoff's TOP BLOCK only, and only for a lane you are about to merge or dispatch.
> ⚠ **The card is a reading that expires.** Every number in §1 is re-measured before it is repeated; if the card and the newest cycle disagree, the newest cycle wins and the card is stale — fix the card in the next anchor. **Whoever writes cycle N+1 moves cycle N to the TOP of the history file in the same commit.**

## §1 LIVE ANCHORS — re-measure each before repeating it
| anchor | value at last rewrite | re-measure with |
|---|---|---|
| `origin/main` | `d3772072` (#633) | `git fetch && git rev-parse origin/main` |
| open PRs | **0** | `gh pr list --state open --json number,headRefOid,mergeable` + a `--state merged --limit 2` control on the same path |
| ledger | 307 done / 1 todo | `pnpm check:tasks` under Node 22 |
| controller seat | `gisik:0`, **Claude API — the session identifies as Fable 5.1** (status line read `opus-5` at 07:55 wake); launched per-launcher (`ctl-start.sh` / `ctl-self-restart.sh`, both export `anthropic`) | pane status line; `/tmp/ctl-self-restart.log` |
| lanes 1–3 backend | **OPUS since 15:05:23** (owner: *"replace exec 1, 2, and 3 with opus for phase 2"*); the DeepSeek sessions died at 14:57 on `402 Insufficient Balance`. ⚠ DeepSeek does NOT auto-compact (exec 2 died at the 1M limit at 14:39). The session env `GISIK_EXECUTOR_BACKEND=deepseek` is vestigial; every launcher exports its own | status lines read `opus-5` on all six |
| lanes 4–6 backend | **Claude API, Opus** — launchers export `anthropic` per process | status line reads `opus-5`; no `backend deepseek` line in the pane |
| **REVIEW ROUND 2 — JUDGING IN PROGRESS** | Phase 1 closed 15:05:23; **phase 2 ends 17:05:23 IST — CLOSE IT: wait until 17:05:23 then `bash gisik-nokma-lanes/phase2-close-2026-09-21.sh /Users/kiro/my_projects/gisik-nokma-lanes/judge-2026-09-21`** (pastes PHASE 2 CLOSED to all six, 75 s grace, appends `PHASE2_CLOSE` + six shas to that dir's `T0.txt`; idempotent). **Phase-1 judging is COMPLETE: 227 rulings in `docs/lanes/review-scores.tsv` on this branch** (= `judge-2026-09-21/ledger.tsv`). What remains: cycle 40 §3 | `grep PHASE2_CLOSE …/judge-2026-09-21/T0.txt` |
| exec 1 · UI · DeepSeek→Opus | `gisik:1` · `…/gisik-nokma-exec` · `exec1/review-ui-r2` · extending `review-ui-exec1.md`; phase-2 brief `REVIEW-R2-PHASE2-OPUS-EXEC1-2026-09-21.md` | `git ls-remote origin refs/heads/exec1/review-ui-r2`; capture the pane |
| exec 2 · UX · DeepSeek→Opus | `gisik:2` · `…/gisik-nokma-exec2` · `exec2/review-ux-r2` · relaunched 14:44 (`REVIEW-R2-RESUME-EXEC2-2026-09-21.md`) after the 1M-context death; phase-2 brief `…PHASE2-OPUS-EXEC2…` | same shape |
| exec 3 · functionality · DeepSeek→Opus | `gisik:3` · `…/gisik-nokma-exec3` · `exec3/review-functionality-r2`; phase-2 brief `…PHASE2-OPUS-EXEC3…` | same shape |
| exec 4 · UI · Opus | `gisik:4` · `…/gisik-nokma-exec4` · `exec4/review-ui` · report `review-ui-exec4.md` | same shape |
| exec 5 · UX · Opus | `gisik:5` · `…/gisik-nokma-exec5` · `exec5/review-ux` · report `review-ux-exec5.md` | same shape |
| exec 6 · functionality · Opus | `gisik:6` · `…/gisik-nokma-exec6` · `exec6/review-functionality` · report `review-functionality-exec6.md` | same shape |
| idle nudger | **ON**, six targets (`IDLE_NUDGER_TARGETS=gisik:1,…,gisik:6` in the plist) | `launchctl list \| grep nudger` |
| limit resumer | ON (`com.kiro.claude-limit-resumer`); its live-pane delivery is now two `paste-buffer` pastes, not `send-keys` | `~/.claude/scripts/limit-resumer.log` |
| cron | **NONE after the 16:5x restart** — the one-shot close and the recurring check died with the session. The successor closes phase 2 by hand (row above) and re-arms the PR Monitor | `CronList` |
| PR watcher | harness `Monitor` on the open-PR set, 30-min lease — **dies with the session; re-arm first** | — |
| dev stack | owner's; built images from the PRIMARY checkout (`:3000`/`:3001`), last rebuilt **08:20 IST at `e2769d60`** | `docker ps`; `docker inspect --format '{{.Image}}'` |
| primary checkout | `/Users/kiro/my_projects/gisik-nokma` on `main` at `e2769d60`, clean — behind `main`; the owner pulls | `git -C … status --porcelain; git rev-parse HEAD` |
| graphify | code layer current at `origin/main` 09:17 IST (AST merge; doc layer 2026-09-20); **copied into all six lane worktrees** (`graphify-out/`, gitignored) | `stat graphify-out/GRAPH_REPORT.md` |
| controller worktree | `/Users/kiro/my_projects/gisik-nokma-ctl` — **currently ON `ctl/round2-judgment`** carrying the six frozen reports (sha256-verified against the judge copies), `review-scores.tsv` and this card; commit there, do not detach until the landing PR merges | `git -C … status` |

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

## 🔄 MONDAY 2026-09-21 ~16:5x IST — **CYCLE 40: PHASE-1 JUDGING COMPLETE (227 RULINGS); THE CONTROLLER RESTARTS AT 81 % CONTEXT ON THE OWNER'S WORD; THE SUCCESSOR CLOSES PHASE 2 AND JUDGES THE REFUTATIONS.** `main` is **`d3772072`**; branch **`ctl/round2-judgment`** carries everything.

### 1. HOW PHASE 1 WAS JUDGED — the method the successor must keep
Owner, 15:4x: *"go with the subagents, you re-open every C/I and refuted one."* 32 verification subagents (Opus, `general-purpose`, prompts in `judge-2026-09-21/chunks/prompt{01..32}.md`, ≤8 concurrent) each read a chunk of ≤8 findings extracted from the FROZEN reports and wrote a TSV row per finding with the file:line THEY opened (`judge-2026-09-21/results/chunkNN.tsv`). **The judge then opened the cited line for every Critical and Important itself** and wrote the ledger row; Minors rest on the verifier's opened line and say so in their note. Read-only tree: `gisik-nokma-ctl` at `d3772072` (code-identical to `a7b6292b`). **Policy decisions taken, applied uniformly:** (a) `PARTIAL` (core holds, an absolute/mechanism/count false) scores at the judged severity of the core with the overclaim noted — no penalty; (b) **no upward re-grading above the CLAIMED severity** (E2-22, E2-34, E4-32…36, E5-34, E6-15 would have been raised by verifiers); (c) help/manual passages describing a product that no longer exists = IMPORTANT (F1, E5-24, E6-1); a stale `test-cases/` entry = MINOR (E3-20…24, E6-12); an instrument that cannot fail = IMPORTANT; (d) independent duplicates across lanes both score in full (rules §3); (e) a recorded ruling engaged by consequence counts (E3-14 partly, E5-6, E6-13, P8). **Zero INVALID rulings; the ×3 penalty was never drawn.** Reconciliation: ledger ids == index ids exactly (0 missing, 0 extra).

### 2. THE STANDINGS BEFORE REFUTATIONS
| pair | lane | findings | C/I/M | pts |
|---|---|---|---|---|
| UI | exec 1 · DeepSeek-authored | 37 | 0/16/21 | **69** |
| UI | exec 4 · Opus | 36 | 0/18/18 | **72** |
| UX | exec 2 · DeepSeek-authored | 57 | 0/29/28 | **115** |
| UX | exec 5 · Opus | 43 | 2/25/16 | **101** |
| FUNC | exec 3 · DeepSeek-authored | 29 | 0/6/23 | **41** |
| FUNC | exec 6 · Opus | 25 | 0/14/11 | **53** |
Critical rulings: E5-13 and E5-41 hold; V10, V2, E3-14, I1 re-graded to IMPORTANT (each with the judge's own opened line in the ledger).

### 3. WHAT THE SUCCESSOR DOES, IN ORDER
1. **Wake, read this card and this cycle. Print one line to the owner.** Re-arm the PR Monitor.
2. **At 17:05:23 IST run the close script** (card row). Record the six `PHASE2_CLOSE` shas.
3. **Judge phase 2 at those shas:** for each lane, `git show <sha>:docs/lanes/review-refutations-execN.md` (may not exist) and the report's *Defence* paragraphs added since its phase-1 sha (`git diff <p1sha> <p2sha> -- docs/lanes/<report>`). Rules §3: an upheld refutation moves the finding's points to the refuter AND the author takes −3× the claimed points; a rejected one costs the refuter the finding's points; phase-2 findings score half. **Open the line yourself for every refutation and every refuted finding.** At the 15:5x reading the lanes had filed almost no refutations (exec 6: R6-1→E5-21, R6-2→E2-42, R6-3→E2-28, all PARTIAL; exec 2's file says "THIS FILE CONTAINS NO REFUTATION"); most files are corroborations and pre-written defences. Update `review-scores.tsv` (`refuted_by`, `penalty`) and append rows for phase-2 findings.
4. **Write `docs/lanes/review-round2-judgment.md`**: method (§1), per-lane totals, per-pair winner, the refutation rulings, the coverage tiebreaker where relevant, and the fairness note (phase 2 was Opus on both sides).
5. **Land ONE PR** from `ctl/round2-judgment`: six reports (already staged, sha256 = judge copies), the refutation files at their phase-2 shas, `review-scores.tsv`, the judgment, this file (+ the rotation of this cycle when a later one is written). Seven checks under Node 22 with a control, forced gate at the landing tree, push verified, merge by API + reachability + tree identity + drop check.
6. **The losers die** (owner: *"the ones who loses dies"*; rules §1): end the losing session of each pair (`tmux kill-window`), retire its worktree (`git worktree remove`), keep its branch; the winner is the standing executor for its concern. Tell the owner the table first, then act.
7. Anchor: cycle 41; rotate cycle 40 to the history file.

### 4. WHERE THE JUDGE'S WORK IS
`/Users/kiro/my_projects/gisik-nokma-lanes/judge-2026-09-21/` — `ledger.tsv` (== `review-scores.tsv` here), `results/chunk01..32.tsv`, `chunks/`, `index.tsv`, `manifest.json`, `verifier-prompt.md`, `p1-exec{1..6}.md` (the frozen reports), `T0.txt` (phase records + frozen shas), `gate/` (gate scripts + logs). The scratchpad copy at `/private/tmp/claude-501/…/7ead0d8d…/scratchpad/judge` is the original; the lanes-dir copy is the durable one.

---

