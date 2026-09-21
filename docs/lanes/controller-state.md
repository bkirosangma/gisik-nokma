# ▣ RESTART CARD — the ONLY mandatory read at wake. Rewritten at every anchor, in the anchor's own commit. Last rewritten **2026-09-21 ~17:2x IST** at `origin/main` **`d3772072`** (#633) by the cycle-41 controller, ON BRANCH `ctl/round2-judgment` — the landing PR of the whole round; once it merges this card is on `main` and this parenthesis is stale.

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
| **REVIEW ROUND 2 — JUDGED** | Phase 2 closed **17:06:57 IST** (`PHASE2_CLOSE` + six shas in `judge-2026-09-21/T0.txt`). **239 rulings in `docs/lanes/review-scores.tsv`; the verdict is `docs/lanes/review-round2-judgment.md`: UI exec 4 wins 72–70, UX exec 2 wins 110–101, FUNC exec 6 wins 54.5–44.5.** ⛔ NEXT ACTION AFTER THIS PR MERGES: end the losers — exec 1, exec 5, exec 3 — per cycle 41 §5, then anchor cycle 42. Until that anchor exists, `tmux list-windows -t gisik` is the only truth about which lanes are alive | `grep PHASE2_CLOSE …/judge-2026-09-21/T0.txt`; `awk -F'	' 'NR>1{t[$2]+=$5+$7} END{for(l in t) print l, t[l]}' docs/lanes/review-scores.tsv` |
| exec 1 · UI · DeepSeek→Opus — **LOSER (70 vs 72), to be ENDED** | `gisik:1` · `…/gisik-nokma-exec` · `exec1/review-ui-r2` @ close `b7c57b6d` (branch kept) | `tmux list-windows -t gisik`; `git worktree list` |
| exec 2 · UX · DeepSeek→Opus — **WINNER (110 vs 101), standing UX executor** | `gisik:2` · `…/gisik-nokma-exec2` · `exec2/review-ux-r2` @ close `84ce91d6`; IDLE AND HELD — no next work (cycle 35 §3) | capture the pane |
| exec 3 · functionality · DeepSeek→Opus — **LOSER (44.5 vs 54.5), to be ENDED** | `gisik:3` · `…/gisik-nokma-exec3` · `exec3/review-functionality-r2` @ close `58d88d6b` (branch kept) | same |
| exec 4 · UI · Opus — **WINNER (72 vs 70), standing UI executor** | `gisik:4` · `…/gisik-nokma-exec4` · `exec4/review-ui` @ close `fe35c41b`; IDLE AND HELD; its `next dev` on `:3041` (pid 99771 at 17:05) may still be serving | capture the pane; `lsof -iTCP:3041` |
| exec 5 · UX · Opus — **LOSER (101 vs 110), to be ENDED** | `gisik:5` · `…/gisik-nokma-exec5` · `exec5/review-ux` @ close `67a33066` (branch kept) | same |
| exec 6 · functionality · Opus — **WINNER (54.5 vs 44.5), standing functionality executor** | `gisik:6` · `…/gisik-nokma-exec6` · `exec6/review-functionality` @ close `c14c8a05`; IDLE AND HELD | capture the pane |
| idle nudger | **ON**, six targets — ⚠ observed 17:00 and 17:06: it pastes CONTEXTUAL text ("stay idle — the judge is reading branches now") that STRANDS unsubmitted in the lane's input box; the next paste to that pane submits both. Harmless while lanes hold; a dispatch must clear or absorb it | `launchctl list \| grep nudger`; the last `❯` line of each pane |
| limit resumer | ON (`com.kiro.claude-limit-resumer`); its live-pane delivery is now two `paste-buffer` pastes, not `send-keys` | `~/.claude/scripts/limit-resumer.log` |
| cron | NONE. The phase-2 close ran from a background shell of the cycle-41 session (`close-at-1705.log`) | `CronList` |
| PR watcher | harness `Monitor` on the open-PR set, armed 17:00 IST, 30-min lease — **dies with the session; re-arm first** | — |
| dev stack | owner's; built images from the PRIMARY checkout (`:3000`/`:3001`), last rebuilt **08:20 IST at `e2769d60`** | `docker ps`; `docker inspect --format '{{.Image}}'` |
| primary checkout | `/Users/kiro/my_projects/gisik-nokma` on `main` at `e2769d60`, clean — behind `main`; the owner pulls | `git -C … status --porcelain; git rev-parse HEAD` |
| graphify | code layer current at `origin/main` 09:17 IST (AST merge; doc layer 2026-09-20); **copied into all six lane worktrees** (`graphify-out/`, gitignored) | `stat graphify-out/GRAPH_REPORT.md` |
| controller worktree | `/Users/kiro/my_projects/gisik-nokma-ctl` — ON `ctl/round2-judgment` carrying the six reports and six refutation files **at the phase-2 close shas** (not the phase-1 freeze — the phase-2 findings live in the reports), `review-scores.tsv` (239), `review-round2-judgment.md` and this card; detach only after the landing PR merges | `git -C … status` |

## §2 WHAT IS IN FORCE — the verdict, then the hold
Round 2 is **judged** (owner-ordered 2026-09-21; rules `docs/lanes/review-round2-rules.md`; verdict `docs/lanes/review-round2-judgment.md`). What is in force after the landing PR: **the losers are ended** (exec 1, 5, 3 — sessions killed, worktrees retired, branches kept), **the winners stand** as the executor for their concern (exec 4 UI, exec 2 UX, exec 6 functionality), and **every surviving lane is IDLE AND HELD** — the round produced findings, not tasks, and which findings become work is the owner's call (cycle 35 §3). ⛔ A controller waking here must not invent a queue out of 239 rulings and dispatch it.

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

## 🔄 MONDAY 2026-09-21 ~17:2x IST — **CYCLE 41: PHASE 2 CLOSED AT 17:06:57; THE REFUTATIONS AND THE PHASE-2 FINDINGS ARE JUDGED; 239 RULINGS; THE VERDICT IS UI → EXEC 4, UX → EXEC 2, FUNCTIONALITY → EXEC 6.** `main` is **`d3772072`**; branch **`ctl/round2-judgment`** is the landing PR of the whole round.

### 1. WHAT THIS CYCLE DID, IN ORDER
Woke at 16:59 on the Claude API (the session identifies as Fable 5.1), read the card and cycle 40, printed the awake line at 17:00, armed the PR Monitor. Pre-read every lane's refutation file and report diff at its 17:01 tip. **Closed phase 2**: `phase2-close-2026-09-21.sh` fired at 17:05:26 from a background shell, pasted PHASE 2 CLOSED to all six panes, and recorded `PHASE2_CLOSE 2026-09-21 17:06:57 IST` with six shas in `judge-2026-09-21/T0.txt` — **each equal to the tip already read**, and each confirmed by the lane itself in its pane. Judged with the judge's own opened lines (no verifier subagents in phase 2): 3 refutations (R6-1, R6-2 PARTIAL — no points move; R6-3 UPHELD — E2-28's 1 point to exec 6, −3 to exec 2), 2 post-boundary withdrawals (E5-21 → 0, its core refiled as E5-44 at the phase-1 rate 3; E2-50 → 0, no penalty), 9 phase-2 findings (all VALID at half: E6-26 0.5; E3-30 0.5 (Important claimed, Minor judged under phase-1 policy c), E3-31 0.5, E3-32 1.5, E3-33 0.5, E3-34 0.5; P35 0.5, P36 0.5; E5-44 3). Amended the ledger (4 rows) and appended 13; wrote `review-round2-judgment.md`; staged the twelve documents at the close shas; wrote this anchor.

### 2. STANDINGS — final
| pair | lane | phase 1 | phase 2 | **final** |
|---|---|---|---|---|
| UI | exec 1 | 69 | +1 | **70** |
| UI | **exec 4** | 72 | 0 | **72** ✔ |
| UX | **exec 2** | 115 | −5 | **110** ✔ |
| UX | exec 5 | 101 | 0 | **101** |
| FUNC | exec 3 | 41 | +3.5 | **44.5** |
| FUNC | **exec 6** | 53 | +1.5 | **54.5** ✔ |
Computed from the ledger: `awk -F'\t' 'NR>1{t[$2]+=$5+$7} END{for(l in t) print l, t[l]}' docs/lanes/review-scores.tsv`. No tie, so the coverage tiebreaker was not drawn.

### 3. THREE RULINGS THE RULES DID NOT SPELL OUT — made here, recorded so the owner can overrule
1. **A PARTIAL refutation moves nothing and costs nothing.** R6-1/R6-2 were right (the phone's door is `POST /v1/sync`; actor≠session answers `invalid: actor-mismatch` before any gate; an `invalid` is terminal in the outbox) and the judge re-opened every line — and they also corrected the judge's own phase-1 mechanism on E5-21 and E2-42, which had cited the `/v1/events` spoof gate. But the scored core survived, as exec 6 itself said. Upholding would have charged exec 5 and exec 2 ×3 for an overclaim phase 1 had already discounted; rejecting would have charged exec 6 for being right. Both rows are corrected; exec 6 is credited in the judgment, not in points.
2. **A withdrawn-and-refiled core keeps its phase-1 score.** exec 5 withdrew E5-21 and refiled the narrowed core as E5-44; exec 2 narrowed E2-42 in place. Same core, same measurement — rules §5 says same ruling — so E5-44 carries E5-21's 3 rather than 1.5. Halving it would have made the score depend on the verb a lane chose.
3. **A whole finding withdrawn after the boundary is 0 with no penalty** (E2-50): honest self-correction is not a refutation.

### 4. THE LANDING — what this PR carries and how it is verified
Six reports + six refutation files at the phase-2 close shas (`git show <sha>:docs/lanes/<file>`; sha256 of each landed copy listed in the PR body), `review-scores.tsv` (240 lines incl. header; every row 9 fields), `review-round2-judgment.md`, this file (cycle 40 rotated to the history file's top in this commit). Docs-only. The merge bar: seven checks `rc=0` under Node 22 with a non-zero control; forced gate at the landing tree (`EXIT=0`, `Tasks: 33 successful, 33 total`, `NODE=v22.*`); push verified by `gh pr view --json headRefOid` = `git rev-parse HEAD`; merge verified by API + reachability + tree identity + the full-tree drop check with a control.

### 5. WHAT THE SUCCESSOR (or this session, after the merge) DOES NEXT, IN ORDER
1. **End the losers** — the owner's standing order (*"the ones who loses dies"*), executed only after this PR is on `main`: for each of exec 1 (`gisik:1`, `gisik-nokma-exec`), exec 5 (`gisik:5`, `gisik-nokma-exec5`), exec 3 (`gisik:3`, `gisik-nokma-exec3`): confirm the lane's worktree is clean and its HEAD equals the close sha (nothing unpushed dies with it), `tmux kill-window -t gisik:N`, `git worktree remove <path>`, keep the branch. exec 4's `next dev` on `:3041` is the winner's, not a loser's — leave it.
2. **Anchor cycle 42** recording the three endings with `tmux list-windows -t gisik` and `git worktree list` output, and rewrite the card's lane rows (the "to be ENDED" rows become "ENDED at HH:MM"). One docs PR, one gate.
3. **Then hold.** No lane has next work until the owner says what the 239 rulings become. Tell the owner the verdict table and the three rulings in §3 — they are the owner's to overrule.

### 6. INSTRUMENTS THIS CYCLE
- `zsh` does not word-split an unquoted `$var` (`set -- $p` keeps one word) and chokes on `case … )` inside `$( )`: two of this cycle's measurement one-liners failed to parse or misparsed until moved into a `bash` script file. **Write multi-branch measurement scripts to the scratchpad and run them with `bash`.**
- `git grep -c <id> <sha> -- docs/lanes/` sums across EVERY file in the directory (P36 → 33 hits at the phase-1 sha, all in other files); the absence check must name the one file, and its positive control is the same command at the close sha.
- The idle nudger's contextual pastes strand in the input box (three observed: 17:00 on `gisik:3` and `:5`, 17:06 on `:1` and `:3`); the close paste submitted the stranded text along with itself and every lane acted correctly — but a dispatch text must expect a prefix it did not write.

---
