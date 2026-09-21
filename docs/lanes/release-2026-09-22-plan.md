# RELEASE 2026-09-22 12:00 IST — THE INSTRUCTION MANUAL. 231 tasks (one per valid round-2 ruling), 18 batches, ranked, with a model per task. A Haiku driver session runs this file top to bottom until every batch is merged.

Generated 2026-09-21 from `docs/lanes/review-scores.tsv` at `main` `b8b09fb5` by the controller (`gen.py`; every valid ruling is in exactly one task — asserted). The verdict and rules are in `docs/lanes/review-round2-judgment.md` and `docs/lanes/review-round2-rules.md`; the six reports are `docs/lanes/review-{ui-exec1,ux-exec2,functionality-exec3,ui-exec4,ux-exec5,functionality-exec6}.md`. **Every task brief below is self-contained: paste it into a Claude Code session and it starts.** Read §0 once; then follow §1 for every batch.

## §0 — RULES THE DRIVER NEVER BREAKS (read once, obey always)

1. **Never commit or push to `main`.** Every batch is a branch cut from `origin/main`, one PR with `--base main`. **You do not merge.** The controller merges; you move to the next batch as soon as your PR is open. Check `git branch --show-current` before every commit; if it prints `main`, stop and branch.
2. **Node 22 for everything:** `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"` at the top of every shell; `node --version` must print `v22.`.
3. **Tests: one package at a time**, from that package's directory: `pnpm exec vitest run --no-file-parallelism` (add a file path to run one file). Never the whole turbo graph (`pnpm test` at the root) — that is the controller's gate. **Never pipe a test run into `head` or `grep -m N`**; write to a file: `pnpm exec vitest run --no-file-parallelism > /tmp/run-<task>.log 2>&1; echo EXIT=$?; tail -30 /tmp/run-<task>.log`. A run with no `Test Files` summary line did not finish — rerun it. Tests in `apps/server` need the shared test Postgres on port 54329 (already running; never `docker compose up/down/restart` anything).
4. **Build before suites that import a sibling package by name** (`apps/web`, `packages/app-core`, `apps/server` import `@gisik-nokma/*` from `dist`): run `pnpm turbo run build --filter=<pkg>...` once per batch before the first suite, and again after you change a package that others import.
5. **`Features.md` and `test-cases/` stay true in the same commit** as the code: user-observable change → edit the feature bullet; add or flip the case in the owning `test-cases/NN-*.md` (next free id in that file's section; never renumber; struck cases keep their number). Prose-only tasks do not need a case.
6. **One commit per task**, subject `<ruling id>: <what changed in one line>`, body naming the test you added or the sentence you fixed, ending with `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` (or the model that did the work). Commit before starting the next task; a task not committed does not exist.
7. **Never `AskUserQuestion`.** Nobody answers. If a task is truly blocked, write `BLOCKED: <one line>` into `docs/lanes/release-2026-09-22-progress.md` for that task and go on to the next one.
8. **Model routing is per task** (§2). You are Haiku: do `haiku` tasks yourself. For a `sonnet` or `opus` task, dispatch the Agent tool with `model: "sonnet"` / `"opus"` and the task's brief block VERBATIM as the prompt, followed by the line: *"Work in `<worktree>` on the current branch. Do not commit; leave the change in the working tree and report: files changed, the test you added, and its RED→GREEN output."* Then YOU run the package suite, read the log, and commit. A subagent's report is a claim; the log you read is the evidence.
9. **`OWNER` / `OWNER-DECISION` tasks are not yours.** Append them to the progress file as `NEEDS-OWNER` and move on.
10. **Do not touch `reference/`, do not add dependencies, do not refactor beyond the finding.** If the cited line has moved, find it by the quoted text (`grep -rn "<quoted words>"`) — the finding's report section (linked in every brief) has the surrounding code.
11. **Reviewer pass before the PR** (§4 checklist), recorded in the PR body. **Then push, then open the PR, then verify** `gh pr view --json headRefOid` equals `git rev-parse HEAD`.
12. **Progress file:** `docs/lanes/release-2026-09-22-progress.md` — one line per task as you finish it: `| <task id> | done|skipped|blocked|needs-owner | <commit sha> | <test name or note> |`. It travels in the batch PR. **On restart, read it first and continue from the first task without a line.**

## §1 — THE LOOP (for every batch, in the order of §3)

```
# 0. once per batch — fresh branch from origin/main in the lane's worktree (§3 names it)
cd <worktree>; export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"; node --version
git fetch origin && git checkout -B rel/<batch id>-<short-name> origin/main
pnpm install --frozen-lockfile > /tmp/install.log 2>&1; echo EXIT=$?
pnpm turbo run build > /tmp/build.log 2>&1; echo EXIT=$?          # once; rebuild a package after changing it

# 1. for each task in the batch, in order
#    - haiku task: do it yourself from the brief. sonnet/opus task: Agent(model=..., prompt=brief) then verify.
#    - run the owning package's suite to a log file; read EXIT and the summary line
#    - update Features.md / test-cases if the brief says so
#    - git add -A && git commit -F <msg file>      (one commit per task)
#    - append the progress line

# 2. batch verification
#    - every package you touched: suite green (log per package, read the summary)
#    - root checks: pnpm check:env; pnpm check:tasks; pnpm check:runbook; pnpm check:citations; pnpm check:help; pnpm check:migrations; node scripts/check-case-ids.mjs   (each rc=0)
#    - reviewer pass (§4) — write the answers into the PR body

# 3. push, PR, verify, next batch
git push -u origin HEAD
gh pr create --base main --title "<batch id>: <batch title> (<n> tasks)" --body-file /tmp/pr-<batch>.md
gh pr view --json headRefOid --jq .headRefOid; git rev-parse HEAD     # must be equal
```

## §2 — MODEL ROUTING

| model | used for | why not bigger |
|---|---|---|
| **haiku** | prose, counts and catalogue markers; help copy; a single CSS property; an `aria-*` attribute or a role; CI yaml; comment rewrites | one file, one line, a check that already exists to prove it |
| **sonnet** | UX/UI state logic with a component test; server route/permission changes with a route test; CSRF/origin predicates; the two Criticals (contained page logic); keyboard/focus models; shells | needs a failing test written first and a small design choice, not deep invariants |
| **opus** | rule-engine invariants across doors, transactional atomicity, sync-client ordering, soft-delete semantics across ingest + replica | a wrong fix silently corrupts data; the probe spans packages |
| **OWNER** | the CI runner (I1) | infrastructure outside the repo |
| **OWNER-DECISION** | `proj_rollups` read-or-drop (E6-26) | product decision |

Counts: haiku 114, sonnet 105, opus 10, OWNER 1, OWNER-DECISION 1. Total estimated effort 175.3 h across all 231 tasks.

### §2b — BACKEND: which tasks a DeepSeek executor may run (owner, 2026-09-21: "deepseek execs are available again")

| backend | rule | tasks |
|---|---|---|
| **deepseek** (`deepseek-flash[1m]` through `exec-claude.sh`, backend `deepseek`) | every `haiku` task, and every `sonnet` task that is not a security predicate, not rule-engine work and not a Critical | 212 |
| **claude-sonnet** | security predicates (B01), rule-engine/engine classes, the two Criticals (E5-13, E5-41) | 7 |
| **claude-opus** | the ten invariant/atomicity/ordering tasks | 10 |
| owner | I1, E6-26 | 2 |

Each task brief carries its backend on its first line. A batch runs in ONE session: its backend is the strictest its tasks need (§3 column); a controller may split the deepseek-capable tasks of a mixed batch into a second, DeepSeek session on the same branch — one commit per task keeps that clean.

### §2c — WHAT CHANGES FOR A DEEPSEEK DRIVER (read this with §0; it overrides rules 8 and 12 there)

1. **You run every task in your batch yourself.** The Agent tool's `model` override is ignored on a DeepSeek session — every subagent is deepseek-flash — so §0 rule 8 does not apply. A batch that contains a `claude-sonnet` or `claude-opus` task is not yours; if you were launched on one, do only the `deepseek` tasks, append `skipped — needs claude` lines for the rest, and say so in your closing line.
2. **The session does not auto-compact.** Read `Ctx NN%` on your status line after every task. At **≥ 60 %** push, then run `/compact`; at **≥ 85 %** push and stop with `CONTEXT FULL — restart me from the progress file` in the pane. One batch per session; never carry a second batch in the same session.
3. **Budget death is sudden.** On any `402`, `Insufficient Balance` or repeated `API Error`, `git push` immediately (a task not pushed dies with the session), print `BUDGET: <text>` and stop. The controller relaunches you from the progress file.
4. **Paste the RED run and the GREEN run into the commit body** (the summary lines, from the log file), not a sentence saying they happened. The reviewer pass reads the log; a claim without the lines is a claim.
5. **Never assert a painted number you did not paint, and never write an absolute ("every", "always", "nothing") the test does not prove.** Round 2 scored DeepSeek-authored findings down for exactly this; the same reviewer reads your PR.
6. Everything else in §0 stands: never main, Node 22, one package suite at a time to a log file, build before suites, `Features.md` + `test-cases/` in the same commit, one commit per task, no `AskUserQuestion`, the progress line.

## §3 — BATCH ORDER, LANES AND THE RELEASE CUT

Batches run in this order, best value per hour first. **One driver takes the next unclaimed batch** (claim it with a line `| <batch> | claimed | <date time> | <worktree> |` in the progress file, pushed on the batch branch); up to three drivers may run at once, one per worktree: `/Users/kiro/my_projects/gisik-nokma-exec6`, `/Users/kiro/my_projects/gisik-nokma-exec2`, `/Users/kiro/my_projects/gisik-nokma-exec4` (the lane column says which concern the batch is about, not who must do it — if the standing executor session of a worktree is alive, that session is the driver there). **Hours are batched hours** (solo estimate × 0.6, since a batch shares its setup, one suite run and one review). **Release cut:** with three drivers at ~9 productive hours each before the **10:30 IST 2026-09-22 PR cut-off**, the committed release set is **B01, B02, B03, B04, B05** (27 h); **B06, B07** are stretch; everything after B07 is post-release and runs to completion afterwards. The controller rebuilds the stack from `main` after the last release merge (about 14 minutes).

| batch | lane | session model | backend | tasks | batched h (solo h) | ranks | title |
|---|---|---|---|---|---|---|---|
| **B01** | FUNC | sonnet | claude-sonnet (deepseek-capable tasks may be split out to a DeepSeek session) | 8 | 6.8 (11.2) | 42–113 | Server doors — security and refusal shape *(committed)* |
| **B02** | UX | sonnet | claude-sonnet (deepseek-capable tasks may be split out to a DeepSeek session) | 9 | 7.3 (12.1) | 24–116 | Account page, workflow-builder draft, identity — both Criticals *(committed)* |
| **B03** | UI | haiku | deepseek | 10 | 3.2 (5.4) | 1–27 | Accessible names and roles *(committed)* |
| **B04** | UI | haiku | deepseek | 27 | 5.2 (8.7) | 8–227 | The help corpus and the small copy fixes *(committed)* |
| **B05** | UI | sonnet | deepseek | 6 | 4.5 (7.5) | 30–79 | Keyboard, focus and dialog containment *(committed)* |
| **B06** | UX | sonnet | deepseek | 12 | 7.4 (12.4) | 58–141 | New-ticket and Move dialogs |
| **B07** | FUNC | opus | claude-opus (deepseek-capable tasks may be split out to a DeepSeek session) | 7 | 6.4 (10.6) | 77–123 | Soft-delete integrity — engine, replica, list **← RELEASE CUT after this batch** |
| **B08** | UX | sonnet | deepseek | 14 | 9.7 (16.2) | 59–153 | Ticket sheet — crumbs, history, comments, Move/Publish arms |
| **B09** | UX | sonnet | deepseek | 15 | 9.7 (16.1) | 57–138 | Failure states on the web — reads and writes that speak |
| **B10** | UI | haiku | deepseek | 27 | 8.5 (14.2) | 13–152 | Paint — UA chrome, phone width, contrast, headings |
| **B11** | UX | sonnet | deepseek | 10 | 6.3 (10.6) | 98–147 | Session expiry and dead controls |
| **B12** | FUNC | opus | claude-opus (deepseek-capable tasks may be split out to a DeepSeek session) | 4 | 4.2 (7) | 133–136 | Workflow and type invariants in the rule engine |
| **B13** | UX | sonnet | deepseek | 8 | 4.4 (7.4) | 103–211 | Due date, soft-delete undo, members picker |
| **B14** | UX | sonnet | deepseek | 14 | 6.3 (10.5) | 124–203 | Minimal shells — phone and desktop |
| **B15** | UI | sonnet | deepseek | 4 | 1.7 (2.9) | 143–228 | Calendar, timeline and canvas for assistive tech |
| **B16** | FUNC | opus | claude-opus (deepseek-capable tasks may be split out to a DeepSeek session) | 7 | 3.2 (5.3) | 157–231 | Outbox ordering, projection verifier, domain schema drift |
| **B17** | ANY | sonnet | deepseek | 12 | 4.8 (8) | 33–132 | Instruments that cannot fail or never run |
| **B18** | ANY | haiku | deepseek | 37 | 5.5 (9.2) | 160–201 | Prose drift sweep — docblocks, catalogue markers, counts |

Totals: committed 27 h (60 tasks) · through the cut 40.8 h (79 tasks) · whole plan 105.1 h batched, 175.3 h solo, 231 tasks.

## §4 — THE REVIEWER PASS (write the answers into every PR body)

1. For each task: name the test that was RED before and GREEN after, with the log file it is read from. A task without one says why (prose-only).
2. `git diff origin/main...HEAD --stat` — every file in it is explained by a task id in the commit list; nothing else.
3. `Features.md` and `test-cases/` diffs: each changed bullet/case names the task; no case renumbered; every new case id is the next free one in its file (`node scripts/check-case-ids.mjs` green).
4. No `AskUserQuestion`, no `docker compose`, no dependency added, no `reference/` change, no `console.log` left behind.
5. The progress file has one line per task in the batch.
6. Paste the seven root-check exit codes and each package suite's summary line.

PR body template:

```
## <batch id> — <batch title>
Tasks (in commit order): <T-… — one line each — commit sha>
Tests RED→GREEN: <test name — log path> …
Package suites: <pkg>: Test Files N passed (N) · Tests N passed (N)
Root checks: check:env 0 · check:tasks 0 · check:runbook 0 · check:citations 0 · check:help 0 · check:migrations 0 · check-case-ids 0
Reviewer pass (§4): 1 … 2 … 3 … 4 … 5 … 6 …
Needs owner: <task ids or none>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## §5 — THE RANKED LIST (all 231; rank = severity × impact ÷ hours)

| rank | task | batch | model | backend | sev | h | score | finding |
|---|---|---|---|---|---|---|---|---|
| 1 | `T-E4-4` | B03 | haiku | deepseek | I | 0.6 | 25 | E4-4 — **IMPORTANT** — The description editor and the comment composer are `role="textbox"` elements with NO accessible … |
| 2 | `T-E4-5` | B03 | haiku | deepseek | I | 0.6 | 25 | E4-5 — **IMPORTANT** — The workspace home's `<h1>` is a button, so the page's level-1 heading is named "Rename … |
| 3 | `T-P12` | B03 | haiku | deepseek | I | 0.6 | 25 | P12 — **IMPORTANT** — Every screen in the product has the same document title |
| 4 | `T-P19` | B03 | haiku | deepseek | I | 0.6 | 25 | P19 — **IMPORTANT** ⚠ **r2 NEW** — The product's primary view switcher is a `role="tablist"` with NO accessible name, … |
| 5 | `T-P21` | B03 | haiku | deepseek | I | 0.6 | 25 | P21 — **IMPORTANT** ⚠ **r2 NEW, MEASUREMENT CORRECTED TWICE BEFORE THE BOUNDARY — THE SECOND CORRECTION IS THE … |
| 6 | `T-P22` | B03 | haiku | deepseek | I | 0.6 | 25 | P22 — **IMPORTANT** ⚠ **r2 NEW** — Two `role="menu"` elements have no accessible name, and one of them has a named twin … |
| 7 | `T-P31` | B03 | haiku | deepseek | I | 0.6 | 25 | P31 — **IMPORTANT** ⚠ **r2 NEW** — The top bar renders as an UNNAMED `navigation` landmark beside a named one on at … |
| 8 | `T-E5-1` | B04 | haiku | deepseek | I | 0.5 | 24 | E5-1 — IMPORTANT · The help says "there is no dragging on the board"; every card is draggable and carries move arrows … |
| 9 | `T-E5-24` | B04 | haiku | deepseek | I | 0.5 | 24 | E5-24 — IMPORTANT · Five more passages of the help describe a product that no longer exists — "no change role", "you … |
| 10 | `T-E6-1` | B04 | haiku | deepseek | I | 0.5 | 24 | E6-1 — IMPORTANT — The in-app help tells the user a job cannot be deleted; the product ships `Delete` |
| 11 | `T-F1-ux` | B04 | haiku | deepseek | I | 0.5 | 24 | F1 — IMPORTANT · The in-app help describes a product that no longer exists, in at least six places |
| 12 | `T-E2-55` | B04 | haiku | deepseek | M | 0.25 | 16 | E2-55 (r2) — IMPORTANT · The FAQ and the manual both say the 200-entry history cap is disclosed *"at the top"*; the … |
| 13 | `T-E4-11` | B10 | haiku | deepseek | I | 0.75 | 16 | E4-11 — **IMPORTANT** — At 390 px the signed-in shell's navigation bar is 310 px tall — 37 % of the viewport — where … |
| 14 | `T-E4-13` | B10 | haiku | deepseek | I | 0.75 | 16 | E4-13 — **IMPORTANT** — The New-ticket dialog's Title field is a bare `<input>` that paints as a 2-px inset user-agent … |
| 15 | `T-E4-14` | B10 | haiku | deepseek | I | 0.75 | 16 | E4-14 — **IMPORTANT** — The active-filter chip's remove control is an 8×13 px "×" |
| 16 | `T-E4-3` | B10 | haiku | deepseek | I | 0.75 | 16 | E4-3 — **IMPORTANT** — Every board card carries a 66×21 px `who · when` disclosure button that no sweep has ever … |
| 17 | `T-E4-7` | B10 | haiku | deepseek | I | 0.75 | 16 | E4-7 — **IMPORTANT** — At phone width the ticket sheet's description is clipped: the field row keeps its 8-rem label … |
| 18 | `T-E5-38` | B04 | haiku | deepseek | M | 0.25 | 16 | E5-38 — MINOR · The sign-in page binds agreement to a Privacy notice that reads "Operated by [ENTITY NAME] · Governed … |
| 19 | `T-F5-ux` | B04 | haiku | deepseek | M | 0.25 | 16 | F5 — MINOR · The founding flow lands a new owner on a page of four negatives; the prototype lands on the list with a … |
| 20 | `T-F8-ux` | B04 | haiku | deepseek | M | 0.25 | 16 | F8 — MINOR · A recorded self-test count is stale, in the block that documents the freshness gate |
| 21 | `T-P1` | B10 | haiku | deepseek | I | 0.75 | 16 | P1 — **IMPORTANT** ⚠ **r2 CORRECTION — SIX, NOT SEVEN: the seventh was refuted by an ancestor rule and is withdrawn** — … |
| 22 | `T-P2` | B10 | haiku | deepseek | I | 0.75 | 16 | P2 — **IMPORTANT** — The board's whole-board empty state has no prototype counterpart, and is the one board empty state … |
| 23 | `T-E4-33` | B03 | haiku | deepseek | M | 0.4 | 12.5 | E4-33 — **MINOR** — For a person with no display name — the product's default email sign-up — the shell's own labels … |
| 24 | `T-E5-13` | B02 | sonnet | claude-sonnet | C | 2 | 12.5 | E5-13 — CRITICAL · After a failed preferences read, `/account` paints all five notifications ON and one toggle PUTs a … |
| 25 | `T-E5-41` | B02 | sonnet | claude-sonnet | C | 2 | 12.5 | E5-41 — CRITICAL · An unpublished workflow draft — every state, arrow and rule — is discarded by any navigation, … |
| 26 | `T-P13` | B03 | haiku | deepseek | M | 0.4 | 12.5 | P13 — **MINOR** ⚠ **r2 REVISION — the WCAG 2.4.1 CLAIM IS WITHDRAWN** — no skip link; a keyboard-only user Tabs the nav … |
| 27 | `T-V6` | B03 | haiku | deepseek | M | 0.4 | 12.5 | V6 — MINOR · Five tab-loading arms on the project page carry no role, in a file that uses one three times |
| 28 | `T-E2-23` | B02 | sonnet | deepseek | I | 1.25 | 12 | E2-23 (r2) — IMPORTANT · "You have no passkeys yet." is asserted over a read that failed |
| 29 | `T-E2-24` | B02 | sonnet | deepseek | I | 1.25 | 12 | E2-24 (r2) — IMPORTANT · A notification preference can end up showing a state the server never recorded, and no account … |
| 30 | `T-E4-17` | B05 | sonnet | deepseek | I | 1.25 | 12 | E4-17 — **IMPORTANT** — Both keyboard close paths of the shared `Select` that I drove — Escape, and Enter to pick — end … |
| 31 | `T-E4-21` | B05 | sonnet | deepseek | I | 1.25 | 12 | E4-21 — **IMPORTANT** — The searchable `Select` (New-ticket *Type* and *Parent*, the type editor's *Workflow*) has no … |
| 32 | `T-E4-31` | B10 | haiku | deepseek | I | 0.75 | 12 | E4-31 — **IMPORTANT** — Ghost buttons placed on a sunken row paint at **3.99:1** (light) / **4.00:1** (dark) in `hig` … |
| 33 | `T-E6-7` | B17 | haiku | deepseek | M | 0.25 | 12 | E6-7 — MINOR — Migration prefixes are hand-rounded and future-dated with no recorded convention, so the plans' own … |
| 34 | `T-F8-fn` | B17 | haiku | deepseek | M | 0.25 | 12 | F8 — LOW / observation — `check:db-tz` is the only one of the nine checkers with no automated invocation |
| 35 | `T-I2` | B10 | haiku | deepseek | M | 0.25 | 12 | I2 — **IMPORTANT** — The `e2e-stack` suite's committed artefact records a defect that was fixed eight hours later, and … |
| 36 | `T-P15` | B17 | haiku | deepseek | M | 0.25 | 12 | P15 — **MINOR** ⚠ **r2 NEW, CORRECTED DOWNWARD IN THE SAME ROUND** — the repo's generated prototype copy is one line … |
| 37 | `T-P18` | B05 | sonnet | deepseek | I | 1.25 | 12 | P18 — **IMPORTANT** ⚠ **r2 NEW** — A client-side navigation announces nothing: no title change, no focus move, no live … |
| 38 | `T-P23` | B05 | sonnet | deepseek | I | 1.25 | 12 | P23 — **IMPORTANT** ⚠ **r2 NEW** — The searchable Select's input has its focus outline REMOVED and nothing replaces it, … |
| 39 | `T-P24` | B10 | haiku | deepseek | I | 0.75 | 12 | P24 — **IMPORTANT** ⚠ **r2 NEW** — A painted text colour measures 3.84:1 at 12.8px, and it is UNDECLARED, so the gate … |
| 40 | `T-P5` | B17 | haiku | deepseek | M | 0.25 | 12 | P5 — **MINOR (product) / IMPORTANT (record)** — An owner-requested control was neither built nor reported |
| 41 | `T-P9` | B05 | sonnet | deepseek | I | 1.25 | 12 | P9 — **IMPORTANT** — `SegmentedControl` carries full ARIA tab semantics and implements none of the tab keyboard model |
| 42 | `T-E3-14` | B01 | sonnet | claude-sonnet | I | 1.5 | 10 | 14.7.1 — `E3-14` (r2) — **CRITICAL (claimed)** — FIVE cookie-authenticated mutating routes are outside … |
| 43 | `T-E3-15` | B01 | sonnet | claude-sonnet | I | 1.5 | 10 | 14.7.2 — `E3-15` (r2) — **IMPORTANT (claimed)** — The guard written to catch exactly this cannot catch it, and its own … |
| 44 | `T-E3-32` | B01 | sonnet | claude-sonnet | I | 1.5 | 10 | 68. `E3-32` (phase 2, HALF) — **IMPORTANT (claimed)** — The envelope-origin gate's own status list says `POST /v1/sync` … |
| 45 | `T-E4-10` | B10 | haiku | deepseek | M | 0.4 | 10 | E4-10 — **MINOR** — The workflow template gallery's four buttons paint as raw user-agent chrome — a population round … |
| 46 | `T-E4-15` | B10 | haiku | deepseek | M | 0.4 | 10 | E4-15 — **MINOR** — The timeline's Earlier / Today / Later buttons paint with the browser's 2-px outset bevel: the … |
| 47 | `T-E4-2` | B10 | haiku | deepseek | M | 0.4 | 10 | E4-2 — **MINOR** — The ticket sheet's and the dialog's Close glyph paints at 24×21 px — no rule gives it a size, the … |
| 48 | `T-E4-25` | B10 | haiku | deepseek | M | 0.4 | 10 | E4-25 — **MINOR** — The Settings sidebar's three section links are 39 px tall; the prototype's are `min-height:44px`, … |
| 49 | `T-E4-26` | B10 | haiku | deepseek | M | 0.4 | 10 | E4-26 — **MINOR** — In the List view the only two per-row controls — the collapse caret (22×22) and the title button … |
| 50 | `T-E4-27` | B10 | haiku | deepseek | M | 0.4 | 10 | E4-27 — **MINOR** — The ticket-type editor's *Save ticket type* is a page-local `<button>` at 36 px with a 1-px border … |
| 51 | `T-E4-35` | B10 | haiku | deepseek | M | 0.4 | 10 | E4-35 — **MINOR** — `.gn-segmented__item` sets no horizontal padding, so where the track is content-sized the *All* tab … |
| 52 | `T-E4-8` | B10 | haiku | deepseek | M | 0.4 | 10 | E4-8 — **IMPORTANT** — The editor's formatting strip is the one control family in the neumorphic sheet drawn with hard … |
| 53 | `T-E6-15` | B01 | sonnet | claude-sonnet | I | 1.5 | 10 | E6-15 — IMPORTANT — Cross-site WebSocket hijacking: a cookie-authenticated `/v1/stream` handshake from a foreign Origin … |
| 54 | `T-E6-16` | B01 | sonnet | claude-sonnet | I | 1.5 | 10 | E6-16 — IMPORTANT — An MCP token can approve a new device code, so one token mints a successor that survives its own … |
| 55 | `T-P27` | B10 | haiku | deepseek | M | 0.4 | 10 | P27 — **MINOR** ⚠ **r2 NEW** — The viewport suite's narrowest width is 390px; WCAG 1.4.10 Reflow specifies 320px, which … |
| 56 | `T-P35` | B10 | haiku | deepseek | M | 0.4 | 10 | P35 — **MINOR** ⚠ **r2 NEW — PHASE 2 (written before the 15:05:23 freeze but not committed until after it; scores at … |
| 57 | `T-E2-20` | B09 | sonnet | deepseek | I | 1.25 | 9.6 | E2-20 (r2) — IMPORTANT · Two admin screens stay on "Loading ticket types…" forever when a read rejects, and the comment … |
| 58 | `T-E2-21` | B06 | sonnet | deepseek | I | 1.25 | 9.6 | E2-21 (r2) — IMPORTANT · A rejected type migration destroys the mapping the admin just authored AND disables the … |
| 59 | `T-E2-29` | B08 | sonnet | deepseek | I | 1.25 | 9.6 | E2-29 (r2) — IMPORTANT · A dropped connection during a Move produces nothing at all, and the Move control has no … |
| 60 | `T-E2-39` | B09 | sonnet | deepseek | I | 1.25 | 9.6 | E2-39 (r2) — IMPORTANT · A failed roster read becomes "nobody is in this workspace", and the workflow builder's own … |
| 61 | `T-E2-40` | B06 | sonnet | deepseek | I | 1.25 | 9.6 | E2-40 (r2) — IMPORTANT · A `require-field` move previews as refused for ever, even after the person fills the field its … |
| 62 | `T-E2-44` | B09 | sonnet | deepseek | I | 1.25 | 9.6 | E2-44 (r2) — IMPORTANT · A failed read of your connected assistants is drawn as "No assistants are connected" |
| 63 | `T-E2-46` | B08 | sonnet | deepseek | I | 1.25 | 9.6 | E2-46 (r2) — IMPORTANT · A typed `[text](url)` becomes markup with no escape suggestion, where every other formatting … |
| 64 | `T-E4-18` | B02 | sonnet | deepseek | I | 1.25 | 9.6 | E4-18 — **IMPORTANT** — The Assignee picker renders a BLANK 13-px option for a member with no display name — the same … |
| 65 | `T-E4-19` | B08 | sonnet | deepseek | I | 1.25 | 9.6 | E4-19 — **IMPORTANT** — The History tab's headline is the raw event-type slug — `ticket.field_set` three times in a row … |
| 66 | `T-E4-23` | B09 | sonnet | deepseek | I | 1.25 | 9.6 | E4-23 — **IMPORTANT** — A ticket the server answers `404` for — never existed, soft-deleted, or invisible to this … |
| 67 | `T-E5-15` | B09 | sonnet | deepseek | I | 1.25 | 9.6 | E5-15 — IMPORTANT · A refused or failed ticket-types read leaves Settings on "Loading ticket types…" for ever — the … |
| 68 | `T-E5-27` | B08 | sonnet | deepseek | I | 1.25 | 9.6 | E5-27 — IMPORTANT · A Move that fails in transport is silence — no sentence, no latch, the dialog stays open — while … |
| 69 | `T-E5-28` | B08 | sonnet | deepseek | I | 1.25 | 9.6 | E5-28 — IMPORTANT · A dropped connection during Publish leaves the workflow builder's Publish button disabled for ever … |
| 70 | `T-E5-37` | B02 | sonnet | deepseek | I | 1.25 | 9.6 | E5-37 — IMPORTANT · For every email sign-up the shell does not know who you are: "Workspaces — ", an empty menu header, … |
| 71 | `T-E5-4` | B02 | sonnet | deepseek | I | 1.25 | 9.6 | E5-4 — IMPORTANT · Every email sign-up is a BLANK row in the assignee picker, the @mention list and the Filters sheet — … |
| 72 | `T-E5-40` | B09 | sonnet | deepseek | I | 1.25 | 9.6 | E5-40 — IMPORTANT · With "Only tickets in progress" on, the Backlog tab says "Nothing in the backlog — new tickets land … |
| 73 | `T-E5-42` | B09 | sonnet | deepseek | I | 1.25 | 9.6 | E5-42 — IMPORTANT · A failed preferences read — or a failed save of "which columns to show" that the person just … |
| 74 | `T-E5-7` | B06 | sonnet | deepseek | I | 1.25 | 9.6 | E5-7 — IMPORTANT · With a comment typed and Move enabled, the dialog still says *"none was provided"* — the exact … |
| 75 | `T-E5-8` | B08 | sonnet | deepseek | I | 1.25 | 9.6 | E5-8 — IMPORTANT · The History tab prints raw event names — `ticket.field_set` three times in a row — and never says … |
| 76 | `T-E6-18` | B01 | sonnet | deepseek | I | 1.25 | 9.6 | E6-18 — IMPORTANT — One byte (U+0000) answers 500 through twenty-three parameters on nineteen doors — every raw id … |
| 77 | `T-E6-24` | B07 | sonnet | deepseek | I | 1.25 | 9.6 | E6-24 — IMPORTANT — The phone's board and the desktop's ticket list keep showing a soft-deleted ticket, and the phone's … |
| 78 | `T-F3-ux` | B08 | sonnet | deepseek | I | 1.25 | 9.6 | F3 — IMPORTANT · A comment renders as plain text while the composer offers marks it discards; a link's destination is … |
| 79 | `T-P8` | B05 | sonnet | deepseek | I | 1.25 | 9.6 | P8 — **MINOR (product) / IMPORTANT (follow-on)** ⚠ **r2 REVISION** — `Dialog` and `Sheet` declare `aria-modal="true"`, … |
| 80 | `T-V10` | B06 | sonnet | deepseek | I | 1.25 | 9.6 | V10 — CRITICAL · "Create" has no re-entrancy guard, and each call mints a fresh id: a double press files two tickets |
| 81 | `T-V4` | B08 | sonnet | deepseek | I | 1.25 | 9.6 | V4 — IMPORTANT · The comment thread reports a still-loading read as "Comments · 0" and "No comments yet." |
| 82 | `T-V7` | B08 | sonnet | deepseek | I | 1.25 | 9.6 | V7 — IMPORTANT · A comment the server REFUSES costs the author the words they just wrote |
| 83 | `T-V9` | B09 | sonnet | deepseek | I | 1.25 | 9.6 | V9 — IMPORTANT · The invite page reports a transport failure as a dead link, and sends the person to ask for a … |
| 84 | `T-E4-12` | B17 | sonnet | deepseek | I | 1 | 9 | E4-12 — **IMPORTANT** — When the signed-in instrument runs, its tap-target population is ONE route at ONE width, and … |
| 85 | `T-F2-ux` | B17 | sonnet | deepseek | I | 1 | 9 | F2 — IMPORTANT · The only gate over the help corpus cannot fail on the property that matters |
| 86 | `T-I1` | B17 | OWNER | owner | I | 1 | 9 | I1 — **CRITICAL** — No browser-based UI instrument has executed anywhere since 2026-09-06, and the local gate … |
| 87 | `T-P11` | B17 | sonnet | deepseek | I | 1 | 9 | P11 — **IMPORTANT** — The `Select` panel is outside the population of every rendered-property sweep, for two … |
| 88 | `T-P16` | B17 | sonnet | deepseek | I | 1 | 9 | P16 — **IMPORTANT** ⚠ **r2 NEW** — One styling case asserts the ABSENCE of a declaration through a scanner that … |
| 89 | `T-P34` | B17 | sonnet | deepseek | I | 1 | 9 | P34 — **IMPORTANT** ⚠ **r2 NEW** — FOUR of the project page's five views are outside the tap-target ratchet's … |
| 90 | `T-E6-2` | B07 | opus | claude-opus | I | 1.75 | 8.6 | E6-2 — IMPORTANT — The ingest door accepts every ordinary write against an already soft-deleted ticket, and … |
| 91 | `T-E6-4` | B07 | opus | claude-opus | I | 1.75 | 8.6 | E6-4 — IMPORTANT — A soft-deleted open child blocks its parent's close with a refusal about a child no view can show; … |
| 92 | `T-F2-fn` | B07 | opus | claude-opus | I | 1.75 | 8.6 | F2 — IMPORTANT — A recorded survivor measurement's stated warrant is false: the second witness read a stale `dist` |
| 93 | `T-F4-fn` | B07 | opus | claude-opus | I | 1.75 | 8.6 | F4 — MEDIUM — `routes/my-work.ts:364`, the contested-claim title gate, is a confirmed open gap |
| 94 | `T-F5-fn` | B07 | opus | claude-opus | I | 1.75 | 8.6 | F5 — MEDIUM — The replica's two TypeScript gates are confirmed open gaps, and the table's citations for them have rotted |
| 95 | `T-E5-19` | B02 | sonnet | deepseek | M | 0.6 | 8.3 | E5-19 — MINOR · "Save name" says nothing on success, and a refusal without a message is reported as success `[SOURCE]` |
| 96 | `T-E4-9` | B10 | haiku | deepseek | I | 0.75 | 8 | E4-9 — **IMPORTANT** — The workflow builder renders TWO `<main>` landmarks, and at 390 px its name field is 403 px … |
| 97 | `T-E4-32` | B10 | haiku | deepseek | M | 0.4 | 7.5 | E4-32 — **MINOR** — The builder's advisories heading paints `warning` on `surfaceSunken` at **3.71:1** (13.6 px) in … |
| 98 | `T-E2-45` | B11 | sonnet | deepseek | I | 1.25 | 7.2 | E2-45 (r2) — IMPORTANT · "Sign out" can fail silently, and the menu closes either way |
| 99 | `T-E4-1` | B08 | sonnet | deepseek | I | 1.25 | 7.2 | E4-1 — **IMPORTANT** — The ticket sheet's breadcrumb renders the SAME ancestor twice whenever the direct parent is an … |
| 100 | `T-E4-30` | B08 | sonnet | deepseek | I | 1.25 | 7.2 | E4-30 — **IMPORTANT** — The sheet's ancestor crumbs are links painted in exactly the ink of the non-link crumbs beside … |
| 101 | `T-E5-10` | B09 | sonnet | deepseek | I | 1.25 | 7.2 | E5-10 — IMPORTANT · A single-row "mark read" and the bulk Undo fail SILENTLY — the exact first-version defect the bulk … |
| 102 | `T-E5-16` | B06 | sonnet | deepseek | I | 1.25 | 7.2 | E5-16 — IMPORTANT · "New ticket" pre-selects **Epic** — the top of the hierarchy — and a mis-filed type cannot be … |
| 103 | `T-E5-2` | B13 | sonnet | deepseek | I | 1.25 | 7.2 | E5-2 — IMPORTANT · A ticket a week overdue looks like every other card on the Board; the export's card carries the key … |
| 104 | `T-E5-20` | B06 | sonnet | deepseek | I | 1.25 | 7.2 | E5-20 — IMPORTANT · One Escape in the Move dialog closes the ticket sheet under it — the `Sheet`'s own guard says a … |
| 105 | `T-E5-25` | B11 | sonnet | deepseek | I | 1.25 | 7.2 | E5-25 — IMPORTANT · A write after the session expires is reported as *"We could not reach the server"* — at nine sites … |
| 106 | `T-E5-3` | B08 | sonnet | deepseek | I | 1.25 | 7.2 | E5-3 — IMPORTANT · A ticket directly under an epic reads `Epic › Epic › KEY` — the crumb states a four-deep chain the … |
| 107 | `T-E5-31` | B11 | sonnet | deepseek | I | 1.25 | 7.2 | E5-31 — IMPORTANT · The signed-out app bar offers Workspaces, Account, an Inbox icon and "No workspace selected — pick … |
| 108 | `T-E5-32` | B11 | sonnet | deepseek | I | 1.25 | 7.2 | E5-32 — IMPORTANT · The help promises a signed-out link to a job "remembers where you were headed"; every data page … |
| 109 | `T-E5-5` | B11 | sonnet | deepseek | I | 1.25 | 7.2 | E5-5 — IMPORTANT · The Filters sheet offers a Collaborators control that no view applies, and tells the person … |
| 110 | `T-E5-6` | B13 | sonnet | deepseek | I | 1.25 | 7.2 | E5-6 — IMPORTANT · A due date can be seen in four places, computed as "overdue", and notified as "due soon" — and set … |
| 111 | `T-E5-9` | B06 | sonnet | deepseek | I | 1.25 | 7.2 | E5-9 — IMPORTANT · A refused Delete answers five screens above the button that was pressed `[BROWSER]` `[SOURCE]` — and … |
| 112 | `T-E6-21` | B01 | sonnet | deepseek | I | 1.25 | 7.2 | E6-21 — IMPORTANT — A member or guest cannot leave a workspace: the gate refuses a self-revocation, no route or control … |
| 113 | `T-E6-9` | B01 | sonnet | deepseek | I | 1.25 | 7.2 | E6-9 — IMPORTANT — The members page's invite form offers three channels; the door refuses two of them, and the one it … |
| 114 | `T-F4-ux` | B09 | sonnet | deepseek | I | 1.25 | 7.2 | F4 — IMPORTANT · The visibility editor's read-only sentence can never render in the shipped app — and states the rule … |
| 115 | `T-V1` | B11 | sonnet | deepseek | I | 1.25 | 7.2 | V1 — IMPORTANT · The Board's empty states invite a person to create a ticket, and no caller in the web app wires the … |
| 116 | `T-V2` | B02 | sonnet | deepseek | I | 1.25 | 7.2 | V2 — CRITICAL · A failed pending-list re-read destroys a one-time invitation URL that cannot be recovered |
| 117 | `T-V3` | B09 | sonnet | deepseek | I | 1.25 | 7.2 | V3 — IMPORTANT · A rejected visibility write leaves Apply permanently disabled and silent |
| 118 | `T-V5` | B11 | sonnet | deepseek | I | 1.25 | 7.2 | V5 — IMPORTANT · A "My contested claims" title button is a dead click, under a comment claiming all four sections … |
| 119 | `T-V8` | B06 | sonnet | deepseek | I | 1.25 | 7.2 | V8 — IMPORTANT · Opening any parent ticket raises a false "this list is not shown rather than shown short" alert |
| 120 | `T-E2-22` | B06 | sonnet | deepseek | M | 0.6 | 6.7 | E2-22 (r2) — MINOR · The state-mapping dialog is unmounted by the act of submitting, so a refusal costs the admin the … |
| 121 | `T-E5-18` | B09 | sonnet | deepseek | M | 0.6 | 6.7 | E5-18 — MINOR · The invite landing page offers Join or nothing: no Decline, no inviter, no expiry; the export draws all … |
| 122 | `T-E5-30` | B09 | sonnet | deepseek | M | 0.6 | 6.7 | E5-30 — MINOR · The shared read-refusal panel on five routes says "… cannot be shown **yet**", appends the transport's … |
| 123 | `T-E6-11` | B07 | sonnet | deepseek | M | 0.6 | 6.7 | E6-11 — MINOR — The list serves a soft-deleted epic's title as a group header; the detail door withholds the same title … |
| 124 | `T-E2-41` | B14 | sonnet | deepseek | I | 1 | 6 | E2-41 (r2) — IMPORTANT · Two screens in the phone shell render a failed read as a benign state — an empty board, and … |
| 125 | `T-E2-42` | B14 | sonnet | deepseek | I | 1 | 6 | E2-42 (r2) — IMPORTANT · A comment posted from the phone is recorded as the ASSIGNEE's words |
| 126 | `T-E2-43` | B14 | sonnet | deepseek | I | 1 | 6 | E2-43 (r2) — IMPORTANT · The desktop shell's own startup has no rejection handler, so a failure to initialize is drawn … |
| 127 | `T-E2-48` | B14 | sonnet | deepseek | I | 1 | 6 | E2-48 (r2) — IMPORTANT · The phone shell's startup has no rejection handler either — the sibling of `E2-43`, and the … |
| 128 | `T-E2-52` | B14 | sonnet | deepseek | I | 1 | 6 | E2-52 (r2) — IMPORTANT · On the phone, typing `@` in the comment editor states **"No people match"** for every query, … |
| 129 | `T-E5-26` | B14 | sonnet | deepseek | I | 1 | 6 | E5-26 — IMPORTANT · The desktop app's only first-run sentence sends a person to a Settings screen it does not have, for … |
| 130 | `T-E5-44` | B14 | sonnet | deepseek | I | 1 | 6 | E5-44 — IMPORTANT · (phase 2, half points — the narrowed core of withdrawn E5-21) The manual sends a person to the … |
| 131 | `T-E6-26` | B17 | OWNER-DECISION | owner | M | 0.5 | 6 | E6-26 — MINOR — `proj_rollups` is recomputed inside every ticket, workflow and reparent transaction, replayed by the … |
| 132 | `T-E6-6` | B17 | sonnet | deepseek | M | 0.5 | 6 | E6-6 — MINOR — `check-no-silent-skips.mjs` prints `ok` on an empty report: an instrument with no positive control on … |
| 133 | `T-E3-19` | B12 | opus | claude-opus | I | 1.75 | 5.1 | 21. `E3-19` (r2) — **IMPORTANT (claimed)** — The parent-terminal invariant is enforced in ONE direction: a child can be … |
| 134 | `T-E6-10` | B12 | opus | claude-opus | I | 1.75 | 5.1 | E6-10 — IMPORTANT — The bulk rebind route can be refused part-way by the permission gate, leaving the type's tickets … |
| 135 | `T-E6-3` | B12 | opus | claude-opus | I | 1.75 | 5.1 | E6-3 — IMPORTANT — Re-ranking a custom ticket type is accepted with tickets already placed where the new rank forbids, … |
| 136 | `T-E6-8` | B12 | opus | claude-opus | I | 1.75 | 5.1 | E6-8 — IMPORTANT — A workflow republish can put a parent with open children into a terminal state, and `ticket.closed` … |
| 137 | `T-E2-26` | B09 | sonnet | deepseek | M | 0.6 | 5 | E2-26 (r2) — MINOR · A single notification's read-state is reverted silently, where its bulk sibling speaks |
| 138 | `T-E2-32` | B09 | sonnet | deepseek | M | 0.6 | 5 | E2-32 (r2) — MINOR · A committed move does not clear the comment, so the next move submits the previous move's words |
| 139 | `T-E2-33` | B06 | sonnet | deepseek | M | 0.6 | 5 | E2-33 (r2) — IMPORTANT · Three dialogs seed a choice once from a prop and guard it by emptiness rather than membership, … |
| 140 | `T-E2-34` | B06 | sonnet | deepseek | M | 0.6 | 5 | E2-34 (r2) — MINOR · Two `aria-modal` dialogs open at once, and one Escape press closes both |
| 141 | `T-E2-37` | B06 | sonnet | deepseek | M | 0.6 | 5 | E2-37 (r2) — MINOR · The New-ticket draft survives its own close, so reopening offers the last ticket's title with … |
| 142 | `T-E2-38` | B11 | sonnet | deepseek | M | 0.6 | 5 | E2-38 (r2) — MINOR · An archived project's own board does not say it is archived |
| 143 | `T-E4-16` | B15 | haiku | deepseek | M | 0.4 | 5 | E4-16 — **MINOR** — React Flow's attribution link renders at 10 px with 1.10:1 contrast in dark mode (2.61:1 in light) |
| 144 | `T-E4-24` | B10 | haiku | deepseek | M | 0.4 | 5 | E4-24 — **MINOR** — The board, the List, My Work and the builder skip a heading level: `h1` → `h3` with no `h2`, and … |
| 145 | `T-E4-36` | B10 | haiku | deepseek | M | 0.4 | 5 | E4-36 — **MINOR** — The help search announces "nothing matches" but never "9 answers": the no-match arm is a … |
| 146 | `T-E5-23` | B11 | sonnet | deepseek | M | 0.6 | 5 | E5-23 — MINOR · A brand-new owner's workspace home says "No projects you can open are active here" — a sentence written … |
| 147 | `T-E5-34` | B11 | sonnet | deepseek | M | 0.6 | 5 | E5-34 — MINOR · On an archived project's own page, the bar's project item names and links a DIFFERENT project — the … |
| 148 | `T-E5-43` | B13 | sonnet | deepseek | M | 0.6 | 5 | E5-43 — MINOR · "Today" on the Calendar and Timeline is computed once per render, so a tab left open across the IST day … |
| 149 | `T-P10` | B10 | haiku | deepseek | M | 0.4 | 5 | P10 — **MINOR** — The accessible-name ratchet's unit is an attribute; its failure message claims a property of … |
| 150 | `T-P17` | B10 | haiku | deepseek | M | 0.4 | 5 | P17 — **MINOR** ⚠ **r2 NEW** — `/my-work`'s heading outline skips level 2, the product IMPROVED on the prototype to get … |
| 151 | `T-P3` | B08 | sonnet | deepseek | M | 0.6 | 5 | P3 — **MINOR** — The parent crumb cannot show the parent's key; the prototype's does, and no ruling records the … |
| 152 | `T-P36` | B10 | haiku | deepseek | M | 0.4 | 5 | P36 — **MINOR** ⚠ **r2 NEW — PHASE 2 (filed 15:31 IST, after the freeze; scores at HALF per rules §2)** — Two settings … |
| 153 | `T-P4` | B08 | sonnet | deepseek | M | 0.6 | 5 | P4 — **MINOR** — "the SAME plain span" is not the same span |
| 154 | `T-E2-30` | B13 | sonnet | deepseek | I | 1.25 | 4.8 | E2-30 (r2) — IMPORTANT · The only way back from a soft delete is a 15-second toast |
| 155 | `T-E4-28` | B15 | sonnet | deepseek | I | 1.25 | 4.8 | E4-28 — **IMPORTANT** — The Calendar and the Timeline convey every date relationship by position alone: day cells and … |
| 156 | `T-E5-11` | B13 | sonnet | deepseek | I | 1.25 | 4.8 | E5-11 — IMPORTANT · The invite form asks a person to type comma-separated project ULIDs; the export draws a picker of … |
| 157 | `T-E6-13` | B16 | sonnet | deepseek | I | 1.25 | 4.8 | E6-13 — IMPORTANT — `verify:projections` reports DRIFT on a correct database after an ordinary type re-bind, so the … |
| 158 | `T-E2-49` | B14 | haiku | deepseek | M | 0.5 | 4 | E2-49 (r2) — MINOR · Push registration's declared contract is not total: a transport failure escapes as a rejection its … |
| 159 | `T-E2-53` | B14 | sonnet | deepseek | M | 0.5 | 4 | E2-53 (r2) — MINOR · The mobile editor host has no refusal vocabulary at all: three doors, and silence is the answer at … |
| 160 | `T-E3-10` | B18 | haiku | deepseek | M | 0.25 | 4 | 14.2 — `E3-10` (r2) — MINOR — The arithmetic of a stated correctness invariant is stale by two in **both** numbers |
| 161 | `T-E3-11` | B18 | haiku | deepseek | M | 0.25 | 4 | 14.6.1 — `E3-11` (r2) — MINOR — `Features.md` says the fixture suite holds **84**; it holds **86** |
| 162 | `T-E3-12` | B18 | haiku | deepseek | M | 0.25 | 4 | 14.6.2 — `E3-12` (r2) — MINOR — "eleven plain-language checks" — there are **twelve**, and the twelfth is the section's … |
| 163 | `T-E3-13` | B18 | haiku | deepseek | M | 0.25 | 4 | 14.6.3 — `E3-13` (r2) — MINOR — A citation in `visible-where.ts` resolves and points at the wrong line |
| 164 | `T-E3-16` | B18 | haiku | deepseek | M | 0.25 | 4 | 17.2 `E3-16` (r2) — **IMPORTANT (claimed)** — The roster-cut citation has drifted **twice**, and the files "corrected" … |
| 165 | `T-E3-17` | B18 | haiku | deepseek | M | 0.25 | 4 | 18. `E3-17` (r2) — MINOR — A docblock that says "re-run the stated command before trusting either number" gives a total … |
| 166 | `T-E3-18` | B18 | haiku | deepseek | M | 0.25 | 4 | 19. `E3-18` (r2) — **MINOR — revised DOWN from Important at §34** — The two shipped `DataSource` implementations … |
| 167 | `T-E3-20` | B18 | haiku | deepseek | M | 0.25 | 4 | 25. `E3-20` (r2) — **IMPORTANT (claimed)** — Case 6.82 declares a rollup capability "cannot ship" and "ABSENT from the … |
| 168 | `T-E3-21` | B18 | haiku | deepseek | M | 0.25 | 4 | 26. `E3-21` (r2) — **IMPORTANT (claimed)** — Case 6.84 declares a cross-workspace parent link "reachable and unrefused" … |
| 169 | `T-E3-22` | B18 | haiku | deepseek | M | 0.25 | 4 | 27. `E3-22` (r2) — **IMPORTANT (claimed)** — Case 6.58's stated reproduction of a cycle uses `ticket.reparented`, which … |
| 170 | `T-E3-23` | B18 | haiku | deepseek | M | 0.25 | 4 | 28. `E3-23` (r2) — **IMPORTANT (claimed)** — Case 6.124 is ❌ with owner "Plan 11"; the code that closed it names the … |
| 171 | `T-E3-24` | B18 | haiku | deepseek | M | 0.25 | 4 | 29. `E3-24` (r2) — **IMPORTANT (claimed)** — Case 6.66's thesis is INVERTED: it says the parent placeholder ships … |
| 172 | `T-E3-25` | B18 | haiku | deepseek | M | 0.25 | 4 | 30. `E3-25` (r2) — **MINOR (claimed)** — Case 6.96 says `SyncItem` "has three members"; it has four — **and this … |
| 173 | `T-E3-26` | B18 | haiku | deepseek | M | 0.25 | 4 | 42. `E3-26` (r2) — **IMPORTANT (claimed)** — `Features.md` says "Nothing in the app links to any of them yet" and … |
| 174 | `T-E3-27` | B18 | haiku | deepseek | M | 0.25 | 4 | 45. `E3-27` (r2) — **IMPORTANT (claimed)** — Two files say `checkErrandTemplate` is *"not yet landed on this branch"*; … |
| 175 | `T-E3-28` | B18 | haiku | deepseek | M | 0.25 | 4 | 48. `E3-28` (r2) — **IMPORTANT (claimed)** — Two documents count the offline-born ticket's doors as three and never … |
| 176 | `T-E3-29` | B18 | haiku | deepseek | M | 0.25 | 4 | 53. r2 finding E3-29 — `Features.md` §5 says "eleven registered types"; the registry carries eighteen, and the five it … |
| 177 | `T-E3-30` | B18 | haiku | deepseek | M | 0.25 | 4 | 65. `E3-30` (phase 2, HALF) — **IMPORTANT (claimed)** — Case 6.83 is ❌ asking for a measurement; the measurement … |
| 178 | `T-E3-31` | B18 | haiku | deepseek | M | 0.25 | 4 | 66. `E3-31` (phase 2, HALF) — **MINOR (claimed)** — Case 6.57 conditions on *"if Plan 3 admits a reparent that crosses … |
| 179 | `T-E3-33` | B18 | haiku | deepseek | M | 0.25 | 4 | 69. `E3-33` (phase 2, HALF) — **MINOR (claimed)** — `proj-projects.ts:29` says `proj_ticket_types` *"does not exist … |
| 180 | `T-E3-34` | B18 | haiku | deepseek | M | 0.25 | 4 | 72. `E3-34` (phase 2, HALF) — **MINOR (claimed)** — `projections/tickets.ts:480-499` says *"nothing refuses a … |
| 181 | `T-E3-9` | B18 | haiku | deepseek | M | 0.25 | 4 | 14.1 — `E3-9` (r2) — MINOR — A "thirteen fields" claim is false: the envelope schema has **eleven** |
| 182 | `T-E4-22` | B14 | haiku | deepseek | M | 0.5 | 4 | E4-22 — **MINOR** — The mobile board's rows are `TouchableOpacity`s with no `accessibilityRole`, so VoiceOver/TalkBack … |
| 183 | `T-E6-12` | B18 | haiku | deepseek | M | 0.25 | 4 | E6-12 — IMPORTANT — Two ❌ cases in `06-auth-visibility.md` declare guest admissions the product closed weeks ago, one … |
| 184 | `T-E6-14` | B18 | haiku | deepseek | M | 0.25 | 4 | E6-14 — MINOR — The delete toast's recorded reason for departing from the prototype ("this product has no ticket key") … |
| 185 | `T-E6-22` | B16 | haiku | deepseek | M | 0.25 | 4 | E6-22 — MINOR — The export advertises "ticket-only access" for someone outside the workspace; the product has no such … |
| 186 | `T-E6-23` | B16 | haiku | deepseek | M | 0.25 | 4 | E6-23 — MINOR — `BACKUP_TIME_UTC=25:00` or `99:99` is accepted and silently scheduled somewhere else (`99:99` → four … |
| 187 | `T-E6-25` | B18 | haiku | deepseek | M | 0.25 | 4 | E6-25 — MINOR — The deploy directory tells the operator that a forged `X-Forwarded-For` still buys a private rate-limit … |
| 188 | `T-F1-fn` | B18 | haiku | deepseek | M | 0.25 | 4 | F1 — IMPORTANT — An open-gap section still declares a closed security-relevant leak, with both supporting numbers stale … |
| 189 | `T-F3-fn` | B18 | haiku | deepseek | M | 0.25 | 4 | F3 — IMPORTANT — **My own lane's §17 group** cites an artifact the owner has ruled is not the prototype, and every … |
| 190 | `T-F6-fn` | B18 | haiku | deepseek | M | 0.25 | 4 | F6 — LOW — The soft-delete enumeration's own counts do not reproduce from the command printed beside them |
| 191 | `T-F7-fn` | B18 | haiku | deepseek | M | 0.25 | 4 | F7 — LOW — **My own lane's §17 block table** has one row and no rule for a lane with no allocation |
| 192 | `T-I3` | B18 | haiku | deepseek | M | 0.25 | 4 | I3 — **IMPORTANT** — `DENSE_IN_LIST`'s stated reason for excluding `.gn-my-work__title` is falsified by the same … |
| 193 | `T-I4` | B18 | haiku | deepseek | M | 0.25 | 4 | I4 — **MINOR** — `tap-targets.ts` cites a line range that resolves and misleads |
| 194 | `T-I5` | B18 | haiku | deepseek | M | 0.25 | 4 | I5 — **MINOR** — My own live handoff carries two position blocks that contradict each other, and the pointer that found … |
| 195 | `T-P25` | B18 | haiku | deepseek | M | 0.25 | 4 | P25 — **MINOR** ⚠ **r2 NEW** — Three live files cite the docblock of a component that was deleted, and one of them is … |
| 196 | `T-P26` | B18 | haiku | deepseek | M | 0.25 | 4 | P26 — **IMPORTANT** ⚠ **r2 NEW** — The prototype-delta document is stale in BOTH of its halves: every numbered queue … |
| 197 | `T-P28` | B14 | haiku | deepseek | M | 0.5 | 4 | P28 — **MINOR** ⚠ **r2 NEW** — The mobile board's row is the one pressable in the app with no accessibility role, and … |
| 198 | `T-P29` | B18 | haiku | deepseek | M | 0.25 | 4 | P29 — **MINOR** ⚠ **r2 NEW** — The mock-only suite claims each stub carries its server `file:line`; two of ten carry … |
| 199 | `T-P30` | B14 | haiku | deepseek | M | 0.5 | 4 | P30 — **IMPORTANT** ⚠ **r2 NEW** — The mobile editor webview is TWO GENERATED LINKS BEHIND, and both links are unguarded |
| 200 | `T-P32` | B18 | haiku | deepseek | M | 0.25 | 4 | P32 — **MINOR** ⚠ **r2 NEW** — Why a control is disabled is put in `title` ON the disabled button, where it cannot be … |
| 201 | `T-P33` | B18 | haiku | deepseek | M | 0.25 | 4 | P33 — **MINOR** ⚠ **r2 NEW** — The export draws a timestamp on every inbox row; the product draws none, and no client … |
| 202 | `T-P6` | B14 | haiku | deepseek | M | 0.5 | 4 | P6 — **MINOR** — Mobile: two of three screens have no styling of any kind |
| 203 | `T-P7` | B14 | haiku | deepseek | M | 0.5 | 4 | P7 — **MINOR** — Desktop's task list has no rules at all |
| 204 | `T-E6-5` | B16 | opus | claude-opus | I | 1.75 | 3.4 | E6-5 — IMPORTANT — After a transient sync failure, a later claim overtakes the backing-off claim it depends on; the … |
| 205 | `T-E2-25` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E2-25 (r2) — IMPORTANT · Five components written for offline and degraded states reach no screen, and the two shells … |
| 206 | `T-E2-27` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E2-27 (r2) — MINOR · An unrecognised sync status is reported as "Live", the healthiest word available |
| 207 | `T-E2-31` | B13 | sonnet | deepseek | M | 0.6 | 3.3 | E2-31 (r2) — MINOR · A re-entrancy guard whose stated purpose cannot happen, in a file that fixed the same guard … |
| 208 | `T-E2-35` | B13 | sonnet | deepseek | M | 0.6 | 3.3 | E2-35 (r2) — IMPORTANT · Deleting a ticket asks nothing, while the bulk close of the same soft delete gets a whole … |
| 209 | `T-E2-36` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E2-36 (r2) — MINOR · A partly committed Move batch never reloads, so the sheet behind the refusal shows state the … |
| 210 | `T-E2-47` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E2-47 (r2) — MINOR · The ticket sheet's own symbol sweep names three unwired exports and misses a fourth, whose … |
| 211 | `T-E2-51` | B13 | sonnet | deepseek | M | 0.6 | 3.3 | E2-51 (r2) — MINOR · My own `13.761` still asserts an absence the product reversed, with a reason that is now false and … |
| 212 | `T-E2-54` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E2-54 (r2) — MINOR · `shell-refusal.tsx` says "`SERVING_GAPS` is empty — so NO read in this shell refuses for a serving … |
| 213 | `T-E4-20` | B15 | sonnet | deepseek | M | 0.6 | 3.3 | E4-20 — **MINOR** — The workflow builder opens with `fitView`, so every control on a state node is painted at 74 % of … |
| 214 | `T-E4-29` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E4-29 — **MINOR** — The ticket-type editor's validation list paints Zod's own message, verbatim and without the field … |
| 215 | `T-E4-34` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E4-34 — **MINOR** — A guest who *"can look, not touch"* is offered five rows whose accessible name is `Edit <type>` |
| 216 | `T-E4-6` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E4-6 — **MINOR** — The visibility editor's people picker labels a member by a 26-character ULID |
| 217 | `T-E5-12` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E5-12 — MINOR · The same workspace is "1 project" on `/workspaces` and "2 projects" on `/account` `[BROWSER]` `[SOURCE]` |
| 218 | `T-E5-14` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E5-14 — MINOR · Ten reorder arrows, all disabled, the reason only in a hover `title`; and the shipped seed already … |
| 219 | `T-E5-17` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E5-17 — MINOR · `/mcp/tokens` is a chrome-less orphan: no app nav, nothing links to it, and its own docblock says it is … |
| 220 | `T-E5-22` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E5-22 — MINOR · "Add subtask" never says what it will file: under an Epic it silently births a Task (skipping Story); … |
| 221 | `T-E5-29` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E5-29 — MINOR · The state-mapping dialog says "Publishing cannot see which tickets sit in which state" directly above … |
| 222 | `T-E5-33` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E5-33 — MINOR · Pressing "Send magic link" with nothing typed makes a server round trip and paints the validator's own … |
| 223 | `T-E5-35` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E5-35 — MINOR · No inbox row says WHEN — `createdAt` is on every notification and rendered nowhere — and the two rows … |
| 224 | `T-E5-36` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E5-36 — MINOR · A workspace with no projects has no empty-project sentence on its `/workspaces` card — the owner's own … |
| 225 | `T-E5-39` | B04 | haiku | deepseek | M | 0.3 | 3.3 | E5-39 — MINOR · "Version history" lists v1…vN with no date and no author — the ledger records both on every … |
| 226 | `T-F6-ux` | B04 | haiku | deepseek | M | 0.3 | 3.3 | F6 — MINOR · A docblock states an absolute that the same card falsifies four lines later |
| 227 | `T-F7-ux` | B04 | haiku | deepseek | M | 0.3 | 3.3 | F7 — MINOR · The epic group count diverges from the prototype, and the divergence is declared but not ruled |
| 228 | `T-P20` | B15 | sonnet | deepseek | M | 0.6 | 3.3 | P20 — **MINOR** ⚠ **r2 NEW** — The month grid and the week columns carry no table or grid semantics, so a screen reader … |
| 229 | `T-E6-17` | B16 | sonnet | deepseek | M | 0.6 | 1.7 | E6-17 — MINOR — `ticket.assigned` and `ticket.collaborator_added` accept any non-empty string as a person — a … |
| 230 | `T-E6-19` | B16 | sonnet | deepseek | M | 0.6 | 1.7 | E6-19 — MINOR — A due date only has to look like `YYYY-MM-DD`: `2026-02-30`, `2026-13-45` and `0000-00-00` commit, and … |
| 231 | `T-E6-20` | B16 | sonnet | deepseek | M | 0.6 | 1.7 | E6-20 — MINOR — Ruling P15 ("a name of only spaces names nothing") closed titles, workspace, project and invite names — … |

## §6 — THE BATCHES AND THEIR BRIEFS (copy the fenced block of a task into a session — it is the whole instruction)

### B01 — Server doors — security and refusal shape  ·  lane FUNC  ·  session model **sonnet**  ·  backend **claude-sonnet (deepseek-capable tasks may be split out to a DeepSeek session)**  ·  8 tasks  ·  ~6.8 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec6` · branch `rel/b01-server-doors-security-and-refusa` · packages touched: @gisik-nokma/domain, @gisik-nokma/server.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E3-14` | sonnet | I | 1.5 | `apps/server/src/http/http-origin.ts` |
| 2 | `T-E3-15` | sonnet | I | 1.5 | `apps/server/test/http/security-middleware.test.ts:256-258`, `apps/server/test/http/security-middleware.test.ts:256` |
| 3 | `T-E3-32` | sonnet | I | 1.5 | `apps/server/src/permissions/check-permission.ts:531-533`, `apps/server/src/sync/sync-routes.ts:490-491`, `apps/server/src/sync/sync-service.ts:370` |
| 4 | `T-E6-15` | sonnet | I | 1.5 | `apps/server/src/http/http-origin.ts:259`, `deploy/do/app.yaml:5` |
| 5 | `T-E6-16` | sonnet | I | 1.5 | `apps/server/src/routes/mcp-device.ts:83-85` |
| 6 | `T-E6-18` | sonnet | I | 1.25 | `apps/server/src/ingest/ingest-service.ts:381`, `apps/server/src/app.ts:50-52` |
| 7 | `T-E6-21` | sonnet | I | 1.25 | `apps/server/src/permissions/check-permission.ts:641-644` |
| 8 | `T-E6-9` | sonnet | I | 1.25 | `packages/domain/src/events/invites.ts:70`, `apps/web/app/w/[workspaceId]/members/page.tsx:847-856` |

#### T-E3-14  ·  sonnet  ·  IMPORTANT  ·  ~1.5 h  ·  rank 42

```
TASK T-E3-14 — batch B01 (Server doors — security and refusal shape) — model sonnet — backend claude-sonnet — effort ~1.5 h — judged IMPORTANT — rank 42/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:1149, 131 lines — read the whole section first):
  14.7.1 — `E3-14` (r2) — **CRITICAL (claimed)** — FIVE cookie-authenticated mutating routes are outside `HTTP_ORIGIN_PROTECTED_ROUTES`, measured at the assembled app
WHAT IS WRONG (the reviewer's words):
  `apps/server/src/http/http-origin.ts`'s `HTTP_ORIGIN_PROTECTED_ROUTES` holds **11** patterns. **Five cookie-authenticated mutating routes are not in it**, so the HTTP-Origin check — this product's CSRF defence — does not run for them:
THE JUDGE'S LINE (the ruling rests on this; open it):
  http-origin.ts:151-163 the set holds exactly 11 patterns and :261 `if (!HTTP_ORIGIN_PROTECTED_ROUTES.has(input.routeUrl)) return false` — list-driven; the five routes are absent from the set and all five are `preHandler: requireSession` (invites.ts:429, my-invitations.ts:221/:263, preferences.ts:115, notification-preferences.ts:40); BUT http-origin.ts:127-145 "What is deliberately NOT in this set, and who owns each" records `POST /v1/invites/:token/accept` and `PUT /v1/me/preferences` as ruled …
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Add the five patterns to the set. **And the durable fix is the one the file already describes but does not implement**: the omissions it records — three waves of them — were each found *"by printing the assembled app's whole route table and injecting a cookie-carrying forged-Origin request at EVERY non-GET route, rather than by re-reading the list that was already believed complete."* **That procedure is a measurement nobody re-runs.** It should be a test (`E3-15` is why the existing one is not it), so that the next mutating route added is refused by CI rather than by the next reviewer who happens to think of it.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — a probe at the assembled app, controls included.** Modelled exactly on `security-middleware.test.ts`'s own harness (`buildApp` + a recording `onRequest` hook; a request the recorder logs is one the security hooks admitted). Injected with `{ cookie: 'better-auth.session_token=…', origin: 'https://evil.example' }`:
JUDGE'S NOTE: PARTIAL→scored as VALID at IMPORTANT: three of the five (`PUT /v1/me/notification-preferences`, `POST /v1/me/invitations/:inviteId/accept`, `/decline`) are unrecorded omissions from the CSRF set, the membership one real; two are recorded rulings called defects without argument (rules §3). Not CRITICAL: the attack needs an invitation the attacker minted and yields an attributed, leavable membership — the bar the file …
DONE WHEN: A test in the owning package REPRODUCES the defect — adapt the report's probe/appendix when it has one — and is RED before your change and GREEN after (name it with the ruling id). The package suite is green. If the behaviour is user-observable, `Features.md` and the owning `test-cases/` file change in the same commit (flip the case the test covers ❌→✅; add a case with the next free id in that file if none exists).
COMMIT: `E3-14: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-14 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-15  ·  sonnet  ·  IMPORTANT  ·  ~1.5 h  ·  rank 43

```
TASK T-E3-15 — batch B01 (Server doors — security and refusal shape) — model sonnet — backend claude-sonnet — effort ~1.5 h — judged IMPORTANT — rank 43/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:1281, 66 lines — read the whole section first):
  14.7.2 — `E3-15` (r2) — **IMPORTANT (claimed)** — The guard written to catch exactly this cannot catch it, and its own docblock says so
WHAT IS WRONG (the reviewer's words):
  `apps/server/test/http/security-middleware.test.ts:256`, the test the file calls **the set-equality drift guard**:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/test/http/security-middleware.test.ts:256-258 the drift guard compares the suite's own hand-written PROTECTED table to HTTP_ORIGIN_PROTECTED_ROUTES — a route in NEITHER leaves the sets equal and green; the docblock at :242-247 names exactly that case
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Compare against the app, not against a second list. Fastify exposes the assembled route table (`app.printRoutes()` / `onRoute`), and the file already contains the machinery: its own `Recorder` hook records `{ method, routeUrl }` for every request that reaches a route. **One `onRoute` hook over the built app, filtered to `MUTATING_METHODS`, asserted equal to the protected set plus an explicit, commented allow-list of the public doors** would make the next forgotten route a red test — which is the property the docblock claims and the one it does not have. The allow-list is the honest form: the three non-writers above are legitimately outside the check, and today that is expressed only by their absence from a list, which is indistinguishable from an oversight.
HOW IT WAS MEASURED (reproduce this before and after):
  The guard's body read at `:256-259`; the run above returns `1 passed | 72 skipped`; the probe in `E3-14` is the falsifier on the other side. Both from this sha.
JUDGE'S NOTE: VALID, judge opened. The guard written to catch omissions from the CSRF set cannot catch one = an instrument that cannot fail on the property that matters, IMPORTANT.
DONE WHEN: A test in the owning package REPRODUCES the defect — adapt the report's probe/appendix when it has one — and is RED before your change and GREEN after (name it with the ruling id). The package suite is green. If the behaviour is user-observable, `Features.md` and the owning `test-cases/` file change in the same commit (flip the case the test covers ❌→✅; add a case with the next free id in that file if none exists).
COMMIT: `E3-15: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-15 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-32  ·  sonnet  ·  IMPORTANT  ·  ~1.5 h  ·  rank 44

```
TASK T-E3-32 — batch B01 (Server doors — security and refusal shape) — model sonnet — backend claude-sonnet — effort ~1.5 h — judged IMPORTANT — rank 44/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:4301, 46 lines — read the whole section first):
  68. `E3-32` (phase 2, HALF) — **IMPORTANT (claimed)** — The envelope-origin gate's own status list says `POST /v1/sync` *"does not exist yet"* and is *"NOT CLOSED"*; the door has existed since 2026-09-04, calls the gated ingest, and a test witnesses the gate firing on it (15:35 IST)
WHAT IS WRONG (the reviewer's words):
  `apps/server/src/permissions/check-permission.ts:528-533` — the docblock of the check that refuses a client wearing the server's provenance (`SERVER_ORIGIN_REASON`), enumerating which doors it closes:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/permissions/check-permission.ts:531-533 '- **NOT CLOSED, because it does not exist yet:** `POST /v1/sync` (Plan 10)'; apps/server/src/sync/sync-routes.ts:490-491 app.post('/v1/sync'; apps/server/src/sync/sync-service.ts:370 deps.ingest.ingestClientBatch([event], userId); apps/server/test/sync/sync-route.test.ts:14 imports SERVER_ORIGIN_REASON (2 matches in the file)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Flip the third bullet to *"CLOSED: `POST /v1/sync` (Plan 10 Batch A, 2026-09-04) — `sync-service.ts` calls `ingestClientBatch`; witnessed by `sync-route.test.ts`"*. And the detector the controller proposed for `E3-1`: a status list is greppable by the route it names — `grep -rn "'/v1/sync'" apps/server/src` is the whole instrument.
HOW IT WAS MEASURED (reproduce this before and after):
  Lines opened: `check-permission.ts:520-533`; `sync-routes.ts:483-500`; `sync-service.ts:71`, `:370`; `sync-route.test.ts:345-361`; `git log --format='%h %ad' -- apps/server/src/sync/sync-routes.ts | tail -1` → `999d4860 2026-09-04`; `git log -S'NOT CLOSED, because it does not exist yet' -- …/check-permission.ts | tail -1` → `fc904f4a 2026-08-31`; `git log --since=2026-08-31T23:59 --format=%h -- …/check-permission.ts | wc -l` → 13 (16 in all). **Not run:** the sync test (it needs the test …
JUDGE'S NOTE: VALID, judge opened. IMPORTANT as claimed — the class of E3-1 (accepted at Important in round 1): the forgery gate's own record declares one of its doors open and unbuilt, while the door exists, calls the gated ingest and is tested. Phase 2, half.
DONE WHEN: A test in the owning package REPRODUCES the defect — adapt the report's probe/appendix when it has one — and is RED before your change and GREEN after (name it with the ruling id). The package suite is green. If the behaviour is user-observable, `Features.md` and the owning `test-cases/` file change in the same commit (flip the case the test covers ❌→✅; add a case with the next free id in that file if none exists).
COMMIT: `E3-32: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-32 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-15  ·  sonnet  ·  IMPORTANT  ·  ~1.5 h  ·  rank 53

```
TASK T-E6-15 — batch B01 (Server doors — security and refusal shape) — model sonnet — backend claude-sonnet — effort ~1.5 h — judged IMPORTANT — rank 53/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1128, 62 lines — read the whole section first):
  E6-15 — IMPORTANT — Cross-site WebSocket hijacking: a cookie-authenticated `/v1/stream` handshake from a foreign Origin is accepted and serves the victim's ledger, while the same cookie and Origin are refused on `POST /v1/events`
WHAT IS WRONG (the reviewer's words):
  Measured at the assembled app **with the security surface on** (`security: { webOrigin: 'http://localhost:3001', rateLimit: null }` — the same build `security-middleware.test.ts` uses), on this lane's port `:3061`, with a real web session obtained by replaying the OTP flow and keeping `set-cookie` (Appendix M; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/http/http-origin.ts:259 if (!MUTATING_METHODS.has(input.method)) return false; — the Origin check never runs for the GET handshake; stream/routes.ts:267 preHandler: [requireSession, requireConnectionBudget] only; cookies are SameSite=Lax (auth.ts:271)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The same predicate, one more door: in `httpOriginRefused`, treat the stream route as protected regardless of method (a cookie-bearing upgrade whose `Origin` is not `WEB_ORIGIN` is refused before `requireSession`), or check `Origin` in the stream's own `preHandler`. And the durable half exec 3's E3-14 also asks for — a test that walks the assembled route table and injects a cookie + forged `Origin` at every route, **including the upgrade**, so the next door added is refused by the suite rather than by a reviewer.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix M, run from `apps/server` (`app.listen` on `127.0.0.1:3061` — this lane's port — for the real socket; `ws` via `test/helpers/stream.ts`'s `openStream`). Lines opened: `http-origin.ts:146-149`, `:180-182`, `:259`; `stream/routes.ts:262`, `:267`; `auth.ts:271`; `deploy/do/app.yaml:5`, `:119`; `app.ts`'s origin hook (`httpOriginRefused({ method: request.method, routeUrl: request.routeOptions.url, … })`).
JUDGE'S NOTE: VALID, judge opened. A cookie-authenticated /v1/stream handshake from a foreign origin is accepted (cross-site WebSocket hijacking). The verifier would raise it to CRITICAL; the judge scores at the CLAIMED severity by policy (no upward re-grading) and records that this is the most security-relevant finding in the round.
DONE WHEN: A test in the owning package REPRODUCES the defect — adapt the report's probe/appendix when it has one — and is RED before your change and GREEN after (name it with the ruling id). The package suite is green. If the behaviour is user-observable, `Features.md` and the owning `test-cases/` file change in the same commit (flip the case the test covers ❌→✅; add a case with the next free id in that file if none exists).
COMMIT: `E6-15: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-15 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-16  ·  sonnet  ·  IMPORTANT  ·  ~1.5 h  ·  rank 54

```
TASK T-E6-16 — batch B01 (Server doors — security and refusal shape) — model sonnet — backend claude-sonnet — effort ~1.5 h — judged IMPORTANT — rank 54/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1191, 49 lines — read the whole section first):
  E6-16 — IMPORTANT — An MCP token can approve a new device code, so one token mints a successor that survives its own revocation; the consent page's "It lasts until you revoke it" is false, and the same token mints admin invitations
WHAT IS WRONG (the reviewer's words):
  `auth/require-session.ts:57-80` (the design note) and `:82-101` (`makeRequireSession`): every `requireSession` route accepts `Authorization: Bearer <mcp token>` as the user (`:95`, the fallback to `resolveMcpToken`). `POST /v1/mcp/device/approve` is a `requireSession` route (`routes/mcp-device.ts:83-105`). Measured through the doors (Appendix N; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/routes/mcp-device.ts:83-85 app.post('/v1/mcp/device/approve', { preHandler: requireSession }) and auth/require-session.ts:93-94 accepts `Authorization: Bearer` and resolves MCP tokens (:5 resolveMcpToken, :72); mcp/authorize/page.tsx:183 "It lasts until you revoke it."
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Two lines in `mcp-device.ts`'s approve (and deny) handlers: refuse when the session was resolved through the MCP fallback rather than a better-auth session — `requireSession` knows which branch answered and can stamp `request.authKind`. The same fence belongs on `DELETE /v1/me/mcp-tokens/:id` (a token revoking its siblings) and, arguably, on the invite mint. Then record `approved_via` on the device-code row so the token list can say *"approved by you, in the browser"* against *"approved by an assistant"*.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix N, run from `apps/server`. Lines opened: `require-session.ts:57-80`, `:82-101`; `mcp-device.ts:83-105`, `:160-181`; `mcp/token-store.ts:63-85` (`approveDeviceCode`); `mcp/authorize/page.tsx:148-156`, `:178-183`; `1788600000000_mcp-device-auth.sql:21`, `:31`; `McpAuthorize.dc.html:70-76`; export `:962`.
JUDGE'S NOTE: VALID, judge opened. An MCP token can approve a new device code, minting a successor that survives its own revocation, while the consent page promises otherwise. IMPORTANT (security; scored at the claimed severity).
DONE WHEN: A test in the owning package REPRODUCES the defect — adapt the report's probe/appendix when it has one — and is RED before your change and GREEN after (name it with the ruling id). The package suite is green. If the behaviour is user-observable, `Features.md` and the owning `test-cases/` file change in the same commit (flip the case the test covers ❌→✅; add a case with the next free id in that file if none exists).
COMMIT: `E6-16: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-16 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-18  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 76

```
TASK T-E6-18 — batch B01 (Server doors — security and refusal shape) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 76/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1279, 73 lines — read the whole section first):
  E6-18 — IMPORTANT — One byte (U+0000) answers 500 through twenty-three parameters on nineteen doors — every raw id parameter, the founding name, the invite address, the ticket payload strings — commits a batch's earlier claims while reporting failure for all, and becomes a poison claim the offline outbox retries forever; the doors that refine or hash their input first answer 400/404
WHAT IS WRONG (the reviewer's words):
  Measured through the doors (Appendix T; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/ingest/ingest-service.ts:381 throw error; — the rethrow escapes ingestAll; routes/events.ts:99-102 awaits ingestClientBatch with no try (grep try → 0), so a U+0000 byte in any raw id parameter reaches the 500 handler
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One ULID check on every id parameter at the route (the envelope already has the predicate; a 400 `invalid_id` before the first query), `noNul` on the three ticket payload strings (and on `plainTextToDoc`'s input in the MCP server, `write-tools.ts:163`, which is one way an agent hands the byte over), so the door answers `invalid` per event and the batch's other claims are judged; and a `hasNoNul` check on the three raw query parameters, answering 400 like their siblings. Neither is more than the refinement the domain already exports.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendices T, U and V, run from `apps/server`. Lines opened: `filter-spec.ts:45-51`; `ticket-events.ts:45-48`, `:98-103`, `:108`; `ingest-service.ts:361-386`, `:396-412`; `apps/server/src/app.ts:50-52`, `:388`; `list.ts:558-559`; `routes/notifications.ts:71`; `builder-reads.ts:726`; the `pg` probe in Appendix T's header (`22021` / `22P05`).
JUDGE'S NOTE: VALID, judge opened (the verifier traced 23 parameters on 19 doors). One byte answers 500 across the API, IMPORTANT.
DONE WHEN: A test in the owning package reproduces the defect, RED before and GREEN after (named with the ruling id); the package suite is green; `Features.md` and `test-cases/` updated in the same commit when the behaviour is user-observable.
COMMIT: `E6-18: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-18 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-21  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 112

```
TASK T-E6-21 — batch B01 (Server doors — security and refusal shape) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 112/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1419, 52 lines — read the whole section first):
  E6-21 — IMPORTANT — A member or guest cannot leave a workspace: the gate refuses a self-revocation, no route or control offers it, the export's privacy copy promises it, and the product's own CSRF exclusion of the invite-accept door rests on "a workspace they can leave"
WHAT IS WRONG (the reviewer's words):
  Through `POST /v1/events`, each role revoking its **own** membership (Appendix Y; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/permissions/check-permission.ts:641-644 if (env.type === 'membership.granted' || env.type === 'membership.revoked') { if (!isWorkspaceAdmin) return refuse(…) } — no self arm; http-origin.ts:137 assumes "a workspace they can leave"; the export's privacy copy (:2133) promises it
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One arm in `checkRolePermission`: `membership.revoked` with `payload.userId === sessionUserId` is allowed for any role **unless** the actor is the sole owner (the `last-owner` guard already refuses that case in the engine, `checks/membership.ts`), reported as its own rule so the sentence can say *"You have left <workspace>"*. A `Leave` control on the workspace home and the account page is the UX lane's half; the door is this lane's.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix Y, run from `apps/server`. Lines opened: `check-permission.ts:81` (`WORKSPACE_MEMBERSHIP_REASON`), `:641-643`; `http-origin.ts:133-139`; export `:2133`; `privacy/page.tsx:150-158`; the three greps above.
JUDGE'S NOTE: VALID, judge opened. A member or guest cannot leave a workspace while two documents assume they can, IMPORTANT.
DONE WHEN: A test in the owning package reproduces the defect, RED before and GREEN after (named with the ruling id); the package suite is green; `Features.md` and `test-cases/` updated in the same commit when the behaviour is user-observable.
COMMIT: `E6-21: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-21 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-9  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 113

```
TASK T-E6-9 — batch B01 (Server doors — security and refusal shape) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 113/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/domain
FINDING (exec6, docs/lanes/review-functionality-exec6.md:849, 45 lines — read the whole section first):
  E6-9 — IMPORTANT — The members page's invite form offers three channels; the door refuses two of them, and the one it accepts is not offered
WHAT IS WRONG (the reviewer's words):
  `apps/web/app/w/[workspaceId]/members/page.tsx:847-856` renders the mint form's Channel select with exactly `email`, `sms`, `whatsapp`. The domain schema the mint door parses the claim with — `packages/domain/src/events/invites.ts:70` `INVITE_CHANNELS = ['email', 'phone']`, `:73-75` *"requires channel 'email' or 'phone'"* — refuses two of the three. Measured through the real mint door (Appendix H; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/domain/src/events/invites.ts:70 export const INVITE_CHANNELS = ['email', 'phone'] as const; vs members/page.tsx:848-852 options email / sms / whatsapp — two offered channels are refused at the door and the accepted 'phone' is not offered
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One source: the select's options built from `INVITE_CHANNELS` (exported from `@gisik-nokma/domain`, `domain/src/events/invites.ts:70`), with `phone` labelled for people (*"Phone (SMS)"*). And a page test that submits each offered option and asserts the door's answer — the assertion the role select already has.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix H, run from `apps/server`. Lines opened: `members/page.tsx:728-729`, `:847-856`; `domain/src/events/invites.ts:70`, `:73-75`; `routes/invites.ts:296-352` (the mint route: body schema `channel: { type: 'string' }` at `:312`, the 422 at `:352`); `members-page.test.tsx:66`, `:244`, `:263`; export `:754`, mobile `:1524`, `github.md:12`.
JUDGE'S NOTE: VALID, judge opened. The invite form offers what the door refuses, IMPORTANT.
DONE WHEN: A test in the owning package reproduces the defect, RED before and GREEN after (named with the ruling id); the package suite is green; `Features.md` and `test-cases/` updated in the same commit when the behaviour is user-observable.
COMMIT: `E6-9: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-9 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B02 — Account page, workflow-builder draft, identity — both Criticals  ·  lane UX  ·  session model **sonnet**  ·  backend **claude-sonnet (deepseek-capable tasks may be split out to a DeepSeek session)**  ·  9 tasks  ·  ~7.3 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec2` · branch `rel/b02-account-page-workflow-builder-dr` · packages touched: @gisik-nokma/app-core, @gisik-nokma/web.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E5-13` | sonnet | C | 2 |  |
| 2 | `T-E5-41` | sonnet | C | 2 | `docs/manual.md:1085-1087` |
| 3 | `T-E2-23` | sonnet | I | 1.25 | `apps/web/app/account/page.tsx:180`, `packages/app-core/src/account/passkeys-section.tsx:96-97`, `apps/web/app/account/page.tsx:174-181` |
| 4 | `T-E2-24` | sonnet | I | 1.25 |  |
| 5 | `T-E4-18` | sonnet | I | 1.25 | `packages/app-core/src/views/ticket-sheet.tsx:1672`, `packages/app-core/src/provenance.ts:4-7` |
| 6 | `T-E5-37` | sonnet | I | 1.25 | `apps/web/src/providers.tsx:176` |
| 7 | `T-E5-4` | sonnet | I | 1.25 | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3275` |
| 8 | `T-E5-19` | sonnet | M | 0.6 | `apps/web/src/account/profile-section.tsx:34` |
| 9 | `T-V2` | sonnet | I | 1.25 |  |

#### T-E5-13  ·  sonnet  ·  CRITICAL  ·  ~2 h  ·  rank 24

```
TASK T-E5-13 — batch B02 (Account page, workflow-builder draft, identity — both Criticals) — model sonnet — backend claude-sonnet — effort ~2 h — judged CRITICAL — rank 24/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:590, 53 lines — read the whole section first):
  E5-13 — CRITICAL · After a failed preferences read, `/account` paints all five notifications ON and one toggle PUTs a whole document built from that guess — silently overwriting whatever the person had muted `[BROWSER, reproduced with zero server writes]` `[SOURCE]` (verifies exec 2 §2e's "two account sections with no error prop", and goes further)
WHAT IS WRONG (the reviewer's words):
  `account/page.tsx:81` `notificationPreferences.load().then(setPrefs, () => setPrefs({ mutedKinds: [] }))`. `toggleKind` (`:215-232`) builds `next` from `prefs.mutedKinds` and `save(next)` PUTs the WHOLE document — the gateway's contract (`notification-preferences-gateway.ts:18-22`): *"a PUT replaces it … A caller that wants to flip one kind reads the current value first (`load`) — exactly what `toggleKind` does."* On the failed-read path that premise is false: the "current value" is the page's guess.
THE JUDGE'S LINE (the ruling rests on this; open it):
  account/page.tsx:81 notificationPreferences.load().then(setPrefs, () => setPrefs({ mutedKinds: [] })) — the failed-read guess; :219-222 next built from prefs.mutedKinds and save(next) PUTs the whole document; notification-preferences-gateway.ts:19-22 "a PUT replaces it … reads the current value first"; grep role="alert"|unavailable in the page → 0
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Hold `prefs = null` on a failed read and render the five rows disabled with *"Your preferences could not be loaded"*; make `toggleKind` refuse to save unless the last `load` succeeded; same for sessions (`:91`).
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` JS transcript above (`cap` array: `[{GET, blocked:true}, {PUT, body:"{\"mutedKinds\":[\"assignment\"]}"}]`). `[SOURCE]` `account/page.tsx:74-81`, `:91`, `:180`, `:215-232`; `passkeys-section.tsx:96-97`; `notification-preferences-gateway.ts:18-22`; `sessions-section.tsx:56-63`.
JUDGE'S NOTE: VALID, judge opened. On a failed read the page renders every kind ON without a refusal and one toggle PUTs a guessed document that silently un-mutes whatever the person had stored. CRITICAL holds: silent overwrite of stored preferences = data loss the person cannot see.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-13: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-13 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-41  ·  sonnet  ·  CRITICAL  ·  ~2 h  ·  rank 25

```
TASK T-E5-41 — batch B02 (Account page, workflow-builder draft, identity — both Criticals) — model sonnet — backend claude-sonnet — effort ~2 h — judged CRITICAL — rank 25/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:1485, 36 lines — read the whole section first):
  E5-41 — CRITICAL · An unpublished workflow draft — every state, arrow and rule — is discarded by any navigation, silently: no unsaved marker, no leave guard, no persistence; the manual warns only that box POSITIONS are "for this session only" `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  `workflow-builder-screen.tsx:61` `const [store] = useState(() => createDraftStore(props.initialDraft))` — the draft lives in the mounted screen's React state and nowhere else: `grep -n 'localStorage\|sessionStorage\|persist\|beforeunload'` over `workflow-builder/*.ts`, `workflow-builder/ui/*.tsx` and `apps/web/src/authoring/*.tsx` → **0**. The screen is the route `/w/[workspaceId]/settings/workflows/[workflowId]` (`page.tsx:92-98`), so every nav-bar link (`AppNav`, `page.tsx:58`), the page's own *"Settings › Workflows"* crumb (`:80-81`), the browser's back button and a tab close unmount it and the draft is gone. Nothing on screen says the draft is unsaved: the export's *"Draft · last saved 11:58"* line is *"NOT here … Named as an absence, not built"* (`workflow-builder-screen.tsx:114-117`). The only way work survives is Publish — which E5-28 shows can also strand.
THE JUDGE'S LINE (the ruling rests on this; open it):
  workflow-builder-screen.tsx:61 const [store] = useState(() => createDraftStore(props.initialDraft)); :114-117 the status line is "Named as an absence, not built"; grep localStorage|sessionStorage|persist|beforeunload over workflow-builder/** + apps/web/src/authoring → 0 (and 0 across apps/web — the product has no leave guard anywhere); [workflowId]/page.tsx:92-98 mounts the screen under AppNav (:58) and a crumb Link (:81); docs/manual.md:1085-1087 scopes the warning to positions
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A `beforeunload`/route-leave guard while the draft differs from `initialDraft`, an *"Unsaved draft"* marker where the export drew its status line, and (cheapest of all) the draft in `sessionStorage` keyed by workflow id, which the manual's "for this session" already promises for positions.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `workflow-builder-screen.tsx:61`, `:114-117`; `draft-store.ts:109` (`createDraftStore`, in-memory); the three greps above (0 hits); `settings/workflows/[workflowId]/page.tsx:92-98`; `docs/manual.md:1085-1087`. Not driven — authoring needs a session; the mechanism is one `useState` and the absence of any guard, both opened.
JUDGE'S NOTE: VALID, judge opened. Every state/arrow/rule of an unpublished draft dies on any navigation with no marker, guard or persistence. CRITICAL holds: silent loss of the longest authoring act in the product.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-41: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-41 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-23  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 28

```
TASK T-E2-23 — batch B02 (Account page, workflow-builder draft, identity — both Criticals) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 28/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec2, docs/lanes/review-ux-exec2.md:1452, 29 lines — read the whole section first):
  E2-23 (r2) — IMPORTANT · "You have no passkeys yet." is asserted over a read that failed
WHAT IS WRONG (the reviewer's words):
  `apps/web/app/account/page.tsx:180` — `passkeyClient.list().then(setPasskeys, () => setPasskeys([]));` The rejection handler **collapses a failed read to an empty list**. The consumer then makes a claim about the account: `packages/app-core/src/account/passkeys-section.tsx:96-97` `{passkeys.length === 0 ? (<p>You have no passkeys yet.</p>) : …}`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  account/page.tsx:180 passkeyClient.list().then(setPasskeys, () => setPasskeys([])); passkeys-section.tsx:96-97 "You have no passkeys yet." — the error arm is fed only by add/remove
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Pass the failure as a fourth state so the section can say the list could not be read. The sibling on the same page already does exactly this: `sessions-section.tsx` renders the hedged *"No signed-in devices to show."* for the same input — two account lists, one hedged and one asserting.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `apps/web/app/account/page.tsx:174-181`; `passkeys-section.tsx:88-98` (the `error` arm at `:91-95` and the asserting empty arm at `:96-97`).
JUDGE'S NOTE: VALID, judge opened. An empty-state assertion over a failed read, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-23: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-23 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-24  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 29

```
TASK T-E2-24 — batch B02 (Account page, workflow-builder draft, identity — both Criticals) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 29/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:1482, 41 lines — read the whole section first):
  E2-24 (r2) — IMPORTANT · A notification preference can end up showing a state the server never recorded, and no account section can say so
WHAT IS WRONG (the reviewer's words):
  **WHAT — two linked defects on `/account`.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  account/page.tsx:228 notificationPreferences.load().then(setPrefs); — the revert after a failed save has no rejection handler, so the optimistic flip stands
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  (a) Give `:228`'s `load()` a rejection handler that at minimum stops the silence, and treat "save refused" as a rendered outcome rather than only a revert trigger. (b) Add the `error` prop to both section types — it is the same one-prop shape `PasskeysSection` already carries.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `account/page.tsx:94-105` (`revokeSession`, and where the result goes) and `:215-232` (`toggleKind`, both the optimistic write and the unguarded revert); `sessions-section.tsx:5-8`; `notifications-section.tsx:12-15`; `passkeys-section.tsx:9` for the contrast.
JUDGE'S NOTE: VALID, judge opened. A preference can show a state the server never recorded and no section can say so, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-24: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-24 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-18  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 64

```
TASK T-E4-18 — batch B02 (Account page, workflow-builder draft, identity — both Criticals) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 64/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:318, 12 lines — read the whole section first):
  E4-18 — **IMPORTANT** — The Assignee picker renders a BLANK 13-px option for a member with no display name — the same member the visibility picker labels by ULID (E4-6), and this time the recorded rule is broken rather than stretched
WHAT IS WRONG (the reviewer's words):
  The sheet's Assignee listbox has three rows: `Unassigned` (184×36), `Kiro` (184×36) and **`""` (184×13)** — no visible text, no accessible name.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ticket-sheet.tsx:1672 ...people.map((member) => ({ value: member.id, label: member.name })) — blank for a member with no display name; provenance.ts:4-7 "A missing display name falls back to the raw actor id — attributed, never blank"; visibility-editor.tsx:410 actorLabel(member.id, member.name) applies the contract
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One helper for "how a roster member is shown in a picker" — `name || email || id` — used by both pickers and by `standingSentence`; and a seed member with an empty name kept on purpose, because it is the fixture that reddens exactly this.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, listbox open).** `Array.from(listbox.querySelectorAll('[role=option]'))` → the third `li.gn-select__option` has `textContent === ''` and height 13 (line-height with no glyphs). Source: `packages/app-core/src/views/ticket-sheet.tsx:1672` — `...people.map((member) => ({ value: member.id, label: member.name }))` — `member.name` verbatim, no `actorLabel`. The member is `accountant@e2e.gisik-nokma.local`, `name = ''` in `"user"` (read-only select on 54330). …
JUDGE'S NOTE: VALID, judge opened. The Assignee picker breaks the product's own honesty contract that its sibling picker keeps, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E4-18: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-18 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-37  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 70

```
TASK T-E5-37 — batch B02 (Account page, workflow-builder draft, identity — both Criticals) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 70/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:1343, 39 lines — read the whole section first):
  E5-37 — IMPORTANT · For every email sign-up the shell does not know who you are: "Workspaces — ", an empty menu header, a "?" monogram, and the accessible names "Account menu for " and "Sign out " — the shared hook's `??` never fires on `''`, a defect the consent page found by driving the flow, recorded "for its owner", and patched only locally `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  `apps/web/src/providers.tsx:176` `name: user.name ?? user.id`, and the same shape in `useSessionStatus` at `:206` — both opened. `??` catches `null`/`undefined` only; the members page records the population — *"better-auth's magic-link plugin creates a user with `name: name || ""` … **an email sign-up has `name === ''`**"* (`members/page.tsx:635-638`) — and the consent page confirms it from the other side: `mcp/authorize/page.tsx:47-56` *"FOUND BY DRIVING THE REAL FLOW … rendered 'It now acts as , with exactly your permissions' — naming nobody … A magic-link account has name `''` — an EMPTY STRING, confirmed in the database — so the fallback never fires … That is a latent defect in the shared hook, recorded for its owner rather than changed here."* It then patched itself alone (`:64-66` `actingAs`). The other consumers still render the empty string: `workspaces/page.tsx:51` …
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/providers.tsx:176 name: user.name ?? user.id, — `??` does not catch the empty string the magic-link population carries (members/page.tsx:635), so five consumer sites render "" (verifier 5 of 5); avatar.tsx:19 returns '?' on empty initials
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `name → email → id` at the hook — the `memberLabel` order the members page already uses — so every consumer moves together; or at least `user.name?.trim() || user.email || user.id`.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `providers.tsx:170-179`, `:206`; `mcp/authorize/page.tsx:44-66`; `members/page.tsx:635-638`; `workspaces/page.tsx:51`; `account-menu.tsx:142`, `:145`, `:150`, `:188`. Not painted: the owner's account carries a name (`[BROWSER]` earlier: `Workspaces — Kiro`, `Account menu for Kiro`), and I hold no email-sign-up session; the empty-name population is established by two independent docblocks, one of which says *"confirmed in the database"*.
JUDGE'S NOTE: VALID, judge opened. For every email sign-up the shell does not know who you are — "Workspaces — ", an empty menu header, a "?" monogram, and an empty accessible name; IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-37: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-37 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-4  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 71

```
TASK T-E5-4 — batch B02 (Account page, workflow-builder draft, identity — both Criticals) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 71/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:310, 40 lines — read the whole section first):
  E5-4 — IMPORTANT · Every email sign-up is a BLANK row in the assignee picker, the @mention list and the Filters sheet — the members page fixed this for itself and left four sibling sites `[BROWSER]` `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  The roster serves `displayName: ""` for a member (the dev workspace's guest, `GET /v1/workspaces/…/members` → `{name: "", role: "guest"}`, `[BROWSER]`). Four sites render that string raw: - `ticket-sheet.tsx:1672` `...people.map((member) => ({ value: member.id, label: member.name }))` → the assignee `<select>` has an option with **no text** (`read_page`: `option value="01M1V035TASFV2G9WPWFV9QDVW"` with no name). - `ticket-sheet.tsx:968-969` `queryUsers` filters on `member.name.toLowerCase().includes(needle)` and maps `name: member.name` → a nameless member can never be @mentioned by typing, and if listed is a blank row. - `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:3275`, `:3289`, `:3291` — the Filters sheet's person rows: `label={member.name}`, `<Avatar name={member.name}>`, `<span>{member.name}</span>` → **two** rows (Assignee AND Collaborators) painted as `?` with …
THE JUDGE'S LINE (the ruling rests on this; open it):
  ticket-sheet.tsx:1672 label: member.name (blank for the magic-link population members/page.tsx:635 records); :968-969 the @mention list; the Filters sheet — 4 of 4 raw-name sites per the verifier; memberLabel (:671) fixes the members page alone
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Route the four labels through `actorLabel` (as `visibility-editor.tsx:410` already does) or lift `memberLabel` into app-core; make `queryUsers` match on the resolved label.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` accessibility tree of the open sheet: `combobox "Unassigned"` → options `""`, `"Unassigned"`, `"Kiro"`, `value="01M1V035TASFV2G9WPWFV9QDVW"` (unnamed). Filters sheet: rows `{aria: "", text: "?"}` ×2. `[SOURCE]` lines above opened; `visibility-editor.tsx:410` opened as the positive control (`actorLabel(member.id, member.name)`).
JUDGE'S NOTE: VALID, judge opened. Every email sign-up is a blank row in three pickers, IMPORTANT. Overlaps exec 4's E4-18 (one of the three sites) — independent, both score in full.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-4: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-4 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-19  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 95

```
TASK T-E5-19 — batch B02 (Account page, workflow-builder draft, identity — both Criticals) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 95/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:795, 20 lines — read the whole section first):
  E5-19 — MINOR · "Save name" says nothing on success, and a refusal without a message is reported as success `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  `account/page.tsx:210-213` `saveName`: `return { error: result.error?.message ?? null }`. `profile-section.tsx:24-30` `save`: shows `error` when non-null and **nothing otherwise** — no "Saved", no confirmation, the button just stops saying it is saving. So three outcomes paint identically: saved; refused with a body that carried no `message`; and (if the client resolves rather than throws on transport failure) never sent.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/account/profile-section.tsx:34 — if (result.error !== null) setError(result.error);
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A `role="status"` *"Name saved"* on `error === null`, and `error.message ?? 'The server refused this change and did not say why.'` rather than `?? null`.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` lines above opened. **Unverified half:** whether better-auth's `updateUser` can return an `error` with no `message` (its client types make `message` optional) — I did not drive a refusal against the owner's account. The success-silence half needs no measurement beyond the component: it renders no success arm.
JUDGE'S NOTE: VALID per verifier chunk25 (line opened by the verifier, not the judge): save() is at :29-35, not the cited :24-30 - loose, not false. No success arm anywhere in the file; account/page.tsx:212 is "error: result.error?.message ?? null", so a message-less refusal collapses i
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-19: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-19 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-V2  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 116

```
TASK T-V2 — batch B02 (Account page, workflow-builder draft, identity — both Criticals) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 116/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:747, 26 lines — read the whole section first):
  V2 — CRITICAL · A failed pending-list re-read destroys a one-time invitation URL that cannot be recovered
WHAT IS WRONG (the reviewer's words):
  `MintForm` holds the minted invitation in its own state (`members/page.tsx:746`), sets it (`:765`), and then calls `onMinted()` (`:766`) — which is `loadPending` (`:553`), a **network re-read**. If that read fails, `loadPending` sets `adminGate` to `'failed'` (`:213-216`) or `'member'` (`:205-211`); the **only** arm that renders `MintForm` is the final `else` (`:551`). `MintForm` unmounts and `minted` — the URL — dies with it. The screen had just said, in its own exported constant: `COPY_IT_NOW = 'Copy it now — it is not stored and cannot be shown again'` (`:24`, rendered at `:894`).
THE JUDGE'S LINE (the ruling rests on this; open it):
  members/page.tsx:746 const [minted, setMinted] = useState<MintedInvite | null>(null) — local to MintForm; :552 the only MintForm mount is the final else of the adminGate switch; :213-216 loadPending failure → setAdminGate failed; :765-766 setMinted(result); onMinted() = loadPending
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Two independent, cheap fixes: hoist `minted` into the page so it outlives the gate's re-render (`MintForm` is presentational; the credential is not its business), and/or make the post-mint refresh non-destructive — never let a failed refresh unmount the surface whose only job is to show the link. The same file already treats a *revoke* refusal as worth a sentence; a *mint* success is worth more.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `members/page.tsx:24` (`COPY_IT_NOW`), `:205-216` (both failure arms), `:542-554` (the three gate arms and the single `MintForm` mount), `:744-770` (`minted` state, `submit`).
JUDGE'S NOTE: VALID, judge opened. A failed re-read after a successful mint unmounts MintForm and the one-time URL with it. IMPORTANT not CRITICAL: the capability is recoverable (revoke + re-mint); the lost thing is the link, on a failure path.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `V2: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-V2 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B03 — Accessible names and roles  ·  lane UI  ·  session model **haiku**  ·  backend **deepseek**  ·  10 tasks  ·  ~3.2 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec4` · branch `rel/b03-accessible-names-and-roles` · packages touched: @gisik-nokma/editor, @gisik-nokma/web.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E4-4` | haiku | I | 0.6 | `packages/editor/src/components/TicketEditor.tsx:89-100`, `packages/app-core/src/views/ticket-sheet.tsx:2405`, `packages/editor/src/components/TicketEditor.tsx:89-101` |
| 2 | `T-E4-5` | haiku | I | 0.6 | `apps/web/app/w/[workspaceId]/page.tsx:797-813`, `apps/web/e2e-stack/tap-target-baseline.json` |
| 3 | `T-P12` | haiku | I | 0.6 | `apps/web/app/layout.tsx:8`, `apps/web/app/layout.tsx` |
| 4 | `T-P19` | haiku | I | 0.6 | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2058`, `packages/ui/src/components/segmented-control.tsx:25`, `packages/app-core/src/views/ticket-sheet.tsx:1904-1907` |
| 5 | `T-P21` | haiku | I | 0.6 | `packages/editor/src/components/TicketEditor.tsx:119` |
| 6 | `T-P22` | haiku | I | 0.6 |  |
| 7 | `T-P31` | haiku | I | 0.6 | `apps/web/src/app-nav.tsx:232`, `apps/web/src/legal-nav.tsx:68` |
| 8 | `T-E4-33` | haiku | M | 0.4 | `apps/web/app/workspaces/page.tsx:51`, `apps/web/src/account-menu.tsx:142`, `packages/ui/src/components/avatar.tsx:19` |
| 9 | `T-P13` | haiku | M | 0.4 |  |
| 10 | `T-V6` | haiku | M | 0.4 | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2390`, `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` |

#### T-E4-4  ·  haiku  ·  IMPORTANT  ·  ~0.6 h  ·  rank 1

```
TASK T-E4-4 — batch B03 (Accessible names and roles) — model haiku — backend deepseek — effort ~0.6 h — judged IMPORTANT — rank 1/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/editor
FINDING (exec4, docs/lanes/review-ui-exec4.md:135, 13 lines — read the whole section first):
  E4-4 — **IMPORTANT** — The description editor and the comment composer are `role="textbox"` elements with NO accessible name; the description row's visible label is the raw field id `description`
WHAT IS WRONG (the reviewer's words):
  The product's two writing surfaces on the ticket sheet.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/editor/src/components/TicketEditor.tsx:89-100 useEditor with no editorProps/attributes (grep → 0); ticket-sheet.tsx:2405 <dt>description</dt> lowercase against capitalised sibling dts
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `editorProps: { attributes: { 'aria-label': props.label, 'aria-multiline': 'true' } }` in `useEditor`, with the slot passing *"Description"* / *"Comment"*; and `<dt>Description</dt>`.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, sheet open, 1512).** `document.querySelectorAll('[contenteditable="true"]')` → two nodes, attributes exactly `contenteditable=true, role=textbox, translate=no, class=tiptap ProseMirror, tabindex=0` — **no `aria-label`, no `aria-labelledby`, no `aria-multiline`**, `labels: null`. The a11y snapshot renders them as `textbox multiline value="…"` with an empty name. The description row's `<dt>` is the literal lowercase `description` …
JUDGE'S NOTE: VALID, judge opened. Two role=textbox editors with no accessible name; IMPORTANT. Independent duplicate of exec 1's P21 — both score in full (rules §3).
DONE WHEN: The attribute is asserted by an existing sweep test or a new small test (query by role/name), RED before and GREEN after; no painted number is claimed unless you painted it.
COMMIT: `E4-4: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-4 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-5  ·  haiku  ·  IMPORTANT  ·  ~0.6 h  ·  rank 2

```
TASK T-E4-5 — batch B03 (Accessible names and roles) — model haiku — backend deepseek — effort ~0.6 h — judged IMPORTANT — rank 2/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec4, docs/lanes/review-ui-exec4.md:149, 13 lines — read the whole section first):
  E4-5 — **IMPORTANT** — The workspace home's `<h1>` is a button, so the page's level-1 heading is named "Rename Convenience Corner"
WHAT IS WRONG (the reviewer's words):
  `/w/<workspaceId>` renders `<h1 class="gn-page-title"><button type="button" class="gn-workspace-home__rename-trigger" aria-label="Rename Convenience Corner">Convenience Corner</button></h1>` — the heading's only child is the rename control.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/w/[workspaceId]/page.tsx:797-813 <h1 className="gn-page-title"><button … aria-label={`Rename ${workspace.name}`}> — the level-1 heading's accessible name is "Rename …"; the recorded reason (:738-761) rules the control's placement, not the heading's name
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `<h1>Convenience Corner</h1>` with an adjacent icon button *Rename Convenience Corner* (the shape `/w/<id>`'s own `Archive Shop operations` button uses), or keep the click-to-rename and put the accessible name on the heading: `<h1 aria-label="Convenience Corner">` is not it (that hides the button's purpose) — the two roles need two elements.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, `:3041`, 1512).** `document.querySelector('h1').outerHTML` → the markup above (one child node, `BUTTON`). Verbose a11y snapshot (`take_snapshot verbose`) line 40: **`heading "Rename Convenience Corner" level="1"`**, line 41: `button "Rename Convenience Corner"`. The non-verbose snapshot omits the heading entirely and shows only the button. The button measures `316×41` (font 34px, `padding: 0`, `min-height: 0`) — under the 44 floor for a standalone control on a route …
JUDGE'S NOTE: VALID, judge opened. Accessibility failure on the page's primary heading, IMPORTANT.
DONE WHEN: The attribute is asserted by an existing sweep test or a new small test (query by role/name), RED before and GREEN after; no painted number is claimed unless you painted it.
COMMIT: `E4-5: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-5 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P12  ·  haiku  ·  IMPORTANT  ·  ~0.6 h  ·  rank 3

```
TASK T-P12 — batch B03 (Accessible names and roles) — model haiku — backend deepseek — effort ~0.6 h — judged IMPORTANT — rank 3/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:400, 23 lines — read the whole section first):
  P12 — **IMPORTANT** — Every screen in the product has the same document title
WHAT IS WRONG (the reviewer's words):
  Nothing in the product sets a per-route title. The browser tab, the window title, the browser history and a screen reader's page announcement read **"Gisik Nokma"** on `/sign-in`, `/inbox`, `/help`, the board, the ticket sheet, the settings screens, `/privacy`, `/terms` and the 404 alike.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/layout.tsx:8 export const metadata = { title: 'Gisik Nokma' }; — grep generateMetadata|<title> over apps/web/app + src → 0 files
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A `title` per route — `Settings · Gisik Nokma`, `Shop operations · Gisik Nokma` — set through Next's own `metadata`/`generateMetadata` on the route modules that already exist. The client-rendered routes (`'use client'`) would need `generateMetadata` in a small server wrapper or a `document.title` effect; either is a handful of lines per route, and the workspace/project ones already resolve their names via `use-workspace-name`/`use-project-name`.
HOW IT WAS MEASURED (reproduce this before and after):
  Source-only sweep, excluding `.next` and `node_modules`: - `grep -rln --exclude-dir=.next --exclude-dir=node_modules -E 'generateMetadata|export const metadata' apps/web` → **exactly one file**: `apps/web/app/layout.tsx`. - `layout.tsx:8`: `export const metadata = { title: 'Gisik Nokma' }`. - **My first attempt at this reported 9 more hits and was wrong** — all nine were `apps/web/.next/types/app/*/page.ts`, Next's generated type files from a build I had just run, and `.next` is gitignored …
JUDGE'S NOTE: VALID, judge opened. Every route carries the same document title = accessibility/navigation failure, IMPORTANT.
DONE WHEN: The attribute is asserted by an existing sweep test or a new small test (query by role/name), RED before and GREEN after; no painted number is claimed unless you painted it.
COMMIT: `P12: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P12 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P19  ·  haiku  ·  IMPORTANT  ·  ~0.6 h  ·  rank 4

```
TASK T-P19 — batch B03 (Accessible names and roles) — model haiku — backend deepseek — effort ~0.6 h — judged IMPORTANT — rank 4/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:547, 19 lines — read the whole section first):
  P19 — **IMPORTANT** ⚠ **r2 NEW** — The product's primary view switcher is a `role="tablist"` with NO accessible name, and the repo fixed the identical defect on the sheet's tablist
WHAT IS WRONG (the reviewer's words):
  `role="tablist"` with no `aria-label` and no `aria-labelledby`, on the control that switches the project page between Backlog, Board, List, Calendar and Timeline.
THE JUDGE'S LINE (the ruling rests on this; open it):
  p/[projectId]/page.tsx:2058 <div className="gn-segmented" role="tablist"> — aria-label count in :2058-2081 → 0; segmented-control.tsx:9 requires aria-label and ticket-sheet.tsx:1904/1915 records the identical fix on the sheet
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Adopt `SegmentedControl` itself rather than its classes — the component exists, the page already passes the same `options`/`value`/`onChange` shape the component takes, and it would supply the required `aria-label` by construction. Failing that, add `aria-label="Project view"` and the assertion the sheet has. The first is strictly better because the type system then prevents the recurrence.
HOW IT WAS MEASURED (reproduce this before and after):
  - `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2058`: `<div className="gn-segmented" role="tablist">` — I read the whole element through its closing `</div>` at `:2081`; **there is no `aria-label` and no `aria-labelledby` anywhere in it.** Its five children carry `role="tab"` and `aria-selected` (`:2064-2079`). - **The product contains exactly two real `role="tablist"` elements**, comments excluded: this one, and `packages/ui/src/components/segmented-control.tsx:25`, which is `<div …
JUDGE'S NOTE: VALID, judge opened. The primary view switcher is an unnamed tablist while the repo fixed the same defect elsewhere = accessibility failure, IMPORTANT.
DONE WHEN: The attribute is asserted by an existing sweep test or a new small test (query by role/name), RED before and GREEN after; no painted number is claimed unless you painted it.
COMMIT: `P19: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P19 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P21  ·  haiku  ·  IMPORTANT  ·  ~0.6 h  ·  rank 5

```
TASK T-P21 — batch B03 (Accessible names and roles) — model haiku — backend deepseek — effort ~0.6 h — judged IMPORTANT — rank 5/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/editor
FINDING (exec1, docs/lanes/review-ui-exec1.md:583, 26 lines — read the whole section first):
  P21 — **IMPORTANT** ⚠ **r2 NEW, MEASUREMENT CORRECTED TWICE BEFORE THE BOUNDARY — THE SECOND CORRECTION IS THE SUBSTANTIVE ONE** — The description editor is a `role="textbox"` with no accessible name, and its visible label is not associated with it
WHAT IS WRONG (the reviewer's words):
  The ticket sheet's description composer is a `contenteditable` host with **no accessible name**, sitting inside a `<dl>` whose `<dt>description</dt>` is not programmatically attached to it. The toolbar directly above it is fully labelled; the field itself is not.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/editor/src/components/TicketEditor.tsx:119 <EditorContent editor={editor} className="ticket-editor__content" /> — grep editorProps|aria-label in the file → 0 (library-default role=textbox, no name); ticket-sheet.tsx:2405 <dt>description</dt> has no id
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either `aria-label="Description"` on the editor host, or an `id` on the `<dt>` plus `aria-labelledby` — the second is better because it keeps one source for the words, and it is the mechanism the product already reaches for. Either is one attribute at `TicketEditor.tsx:119` or one prop threaded through `editorProps.attributes`.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — five checks, each opening the artefact.** 1. **The host.** `packages/editor/src/components/TicketEditor.tsx:119` renders `<EditorContent editor={editor} className="ticket-editor__content" />` inside `<div className="ticket-editor">` (`:111`). **No `aria-label`, no `role` on either.** 2. **Nothing adds one above it.** `grep -rn "editorProps|attributes:"` over `packages/editor/src`, `apps/web/src` and `packages/app-core/src` → **no matches**, so the product never overrides the …
JUDGE'S NOTE: VALID, judge opened. The description editor is a textbox with no accessible name, IMPORTANT.
DONE WHEN: The attribute is asserted by an existing sweep test or a new small test (query by role/name), RED before and GREEN after; no painted number is claimed unless you painted it.
COMMIT: `P21: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P21 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P22  ·  haiku  ·  IMPORTANT  ·  ~0.6 h  ·  rank 6

```
TASK T-P22 — batch B03 (Accessible names and roles) — model haiku — backend deepseek — effort ~0.6 h — judged IMPORTANT — rank 6/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec1, docs/lanes/review-ui-exec1.md:610, 25 lines — read the whole section first):
  P22 — **IMPORTANT** ⚠ **r2 NEW** — Two `role="menu"` elements have no accessible name, and one of them has a named twin in the same product
WHAT IS WRONG (the reviewer's words):
  Two menus declare `role="menu"` and carry no `aria-label` and no `aria-labelledby`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  account-menu.tsx:148 <div ref={menuRef} id={menuId} role="menu" className="gn-nav__menu"> — no aria-label/aria-labelledby (verifier control: the grep surfaces the twin menu's aria-label)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `aria-label` on both — `"Account"` and `"Add rule"` name them exactly, and the workflow-builder menu's trigger already reads *"Add rule"* three lines above it (`add-rule-menu.tsx:44`). Better still, the same structural remedy P19 asks for: a shared menu component that requires the label by type, which is how `SegmentedControl` prevents P19's version of this.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — the sweep, then each hit opened.** I swept every `role="…"` on a role that requires an accessible name, across six source trees, comments stripped and taking the element's **whole opening tag** rather than its line. **Control: 23 name-requiring roles seen; 5 lacked a name in the tag.** One of the five is a string constant (`board.tsx:893`'s `CARD_CLICK_BAIL_SELECTOR`), one is **P19's tablist**, and **one was a false positive of my own sweep** — `unread-badge.tsx:75` *is* …
JUDGE'S NOTE: VALID, judge opened. A role=menu with no accessible name = accessibility failure, IMPORTANT.
DONE WHEN: The attribute is asserted by an existing sweep test or a new small test (query by role/name), RED before and GREEN after; no painted number is claimed unless you painted it.
COMMIT: `P22: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P22 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P31  ·  haiku  ·  IMPORTANT  ·  ~0.6 h  ·  rank 7

```
TASK T-P31 — batch B03 (Accessible names and roles) — model haiku — backend deepseek — effort ~0.6 h — judged IMPORTANT — rank 7/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:862, 34 lines — read the whole section first):
  P31 — **IMPORTANT** ⚠ **r2 NEW** — The top bar renders as an UNNAMED `navigation` landmark beside a named one on at least seven routes
WHAT IS WRONG (the reviewer's words):
  `AppNav` renders `<nav className="gn-nav">` with **no accessible name** (`apps/web/src/app-nav.tsx:232`), and `LegalNav` renders the identical `<nav className="gn-nav">`, also unnamed (`apps/web/src/legal-nav.tsx:68`). **Both of them co-render with a second, *labelled* `<nav>` on the same page**, so a screen-reader user who opens the landmark list meets two `navigation` regions and only one of them says what it is.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/app-nav.tsx:232 <nav className="gn-nav"> and legal-nav.tsx:68 <nav className="gn-nav"> — grep aria-label in both files → 0
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One attribute each: `aria-label="Main"` on `app-nav.tsx:232`, `aria-label="Legal"` on `legal-nav.tsx:68` — using the house's own names for those two bars (`legal-nav.tsx:55` calls the legal one *"the chrome"*). **Plus a unit case asserting the label by string, the way `legal-chrome.tsx:56-57` records doing for the TOC** — because, as that same comment says, the ratchet *"cannot judge and does not claim to"* this.
HOW IT WAS MEASURED (reproduce this before and after):
  1. **Every `<nav>` in product source, exhaustively** — `grep -rn "<nav" --include="*.tsx" --include="*.ts" apps packages`, excluding tests and `dist`: **nine elements. Seven carry a name. Two do not.** - **named:** `settings/page.tsx:180` *"Settings sections"* · `w/[workspaceId]/page.tsx:570` *"Workspace sections"* · `workflows/[workflowId]/page.tsx:80` and `…/history/page.tsx:39` *"Breadcrumb"* · `legal-chrome.tsx:115` *"On this page"* · `help-browser.tsx:511` …
JUDGE'S NOTE: VALID, judge opened (verifier chunk05 concurred). Two landmark navs with no accessible name; IMPORTANT = accessibility failure.
DONE WHEN: The attribute is asserted by an existing sweep test or a new small test (query by role/name), RED before and GREEN after; no painted number is claimed unless you painted it.
COMMIT: `P31: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P31 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-33  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 23

```
TASK T-E4-33 — batch B03 (Accessible names and roles) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 23/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec4, docs/lanes/review-ui-exec4.md:510, 9 lines — read the whole section first):
  E4-33 — **MINOR** — For a person with no display name — the product's default email sign-up — the shell's own labels degrade to dangling punctuation: `Workspaces — `, `Account menu for `, and a `?` avatar with an empty `title`
WHAT IS WRONG (the reviewer's words):
  One `displayLabel(user) = name || email` for the shell (`account-menu.tsx`, `workspaces/page.tsx`), and `initialsOf` on the email's local part when the name is empty.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/workspaces/page.tsx:51 — <h1 className="gn-page-title">Workspaces{user !== null ? ` — ${user.name}` : ''}</h1>
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One `displayLabel(user) = name || email` for the shell (`account-menu.tsx`, `workspaces/page.tsx`), and `initialsOf` on the email's local part when the name is empty.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted as the seeded guest `accountant@e2e.gisik-nokma.local`, `name = ''`, on `:3041`).** `/workspaces` `h1.gn-page-title` → `textContent === "Workspaces — "` (`apps/web/app/workspaces/page.tsx:51`: `` Workspaces{user !== null ? ` — ${user.name}` : ''} ``); `button.gn-nav__avatar-button` → `aria-label === "Account menu for "` (`apps/web/src/account-menu.tsx:142`: `` `Account menu for ${user.name}` ``), visible glyph `?` (`packages/ui/src/components/avatar.tsx:19` returns `'?'` …
JUDGE'S NOTE: VALID per verifier chunk22 (line opened by the verifier, not the judge): Opened 3 of 3 cited lines: account-menu.tsx:142 `Account menu for ${user.name}`, avatar.tsx:19 return '?', avatar.tsx:65 title={name} aria-label={name}. members/page.tsx:635-637 re. The verifier would raise it to IMPORTANT; no upward re-grading by policy.
DONE WHEN: The attribute is asserted by an existing sweep test or a new small test (query by role/name), RED before and GREEN after; no painted number is claimed unless you painted it.
COMMIT: `E4-33: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-33 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P13  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 26

```
TASK T-P13 — batch B03 (Accessible names and roles) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 26/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec1, docs/lanes/review-ui-exec1.md:424, 11 lines — read the whole section first):
  P13 — **MINOR** ⚠ **r2 REVISION — the WCAG 2.4.1 CLAIM IS WITHDRAWN** — no skip link; a keyboard-only user Tabs the nav on every navigation
WHAT IS WRONG (the reviewer's words):
  No skip link exists anywhere in the product.
THE JUDGE'S LINE (the ruling rests on this; open it):
  /usr/bin/grep -rniE 'skip[- ]?(to|link)|gn-skip' over apps/web/app, apps/web/src, packages/app-core/src, packages/ui/src (.tsx/.css/.ts, non-test) → 0 lines; control, the same command with the needle 'aria-label' → 166 lines; review-ui-exec1.md:424-434 the finding and its own withdrawal of the WCAG 2.4.1 citation only
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A visually-hidden-until-focused "Skip to content" link as the first focusable element in `layout.tsx`, targeting the `<main>`. That is the standard remedy, it is about ten lines, and it is the one element in this report that a keyboard user would notice immediately.
HOW IT WAS MEASURED (reproduce this before and after):
  `grep -rniE 'skip[ -]?(to|link)|gn-skip'` over `apps/web`, `packages/app-core/src`, `packages/ui/src` (all `.tsx`/`.css`, excluding tests) → **no matches** — a genuinely empty result, and the same sweep shape returns hits for other tokens, so it traverses.
JUDGE'S NOTE: VALID, judge opened. No skip link exists; the WCAG 2.4.1 claim was withdrawn by the lane (landmarks satisfy 2.4.1) and the surviving core — a keyboard-only user Tabs the whole nav on every navigation — is a Minor accessibility finding as filed. MISSED IN PHASE 1: the heading carries the word WITHDRAWN and the extraction skipped it (index.tsv has no P13); found by the cycle-43 membership reconciliation (40 headings …
DONE WHEN: The attribute is asserted by an existing sweep test or a new small test (query by role/name), RED before and GREEN after; no painted number is claimed unless you painted it.
COMMIT: `P13: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P13 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-V6  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 27

```
TASK T-V6 — batch B03 (Accessible names and roles) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 27/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec2, docs/lanes/review-ux-exec2.md:849, 17 lines — read the whole section first):
  V6 — MINOR · Five tab-loading arms on the project page carry no role, in a file that uses one three times
WHAT IS WRONG (the reviewer's words):
  `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` renders a bare `<p>Loading…</p>` for the calendar, timeline, board, backlog and list tabs — at lines **2390, 2428, 2515, 2650, 2769** — while the create region in the same file uses `role="status"` at **:1732, :1741, :1783**.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2390 2428 2515 2650 2769 — <p>Loading…</p> (all five bare; the calendar/timeline/board/backlog/list arms, read in context)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Add `role="status"` (and `aria-live="polite"` if the file's other three sites carry it) to the five bare `<p>Loading…</p>` arms at `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2390, 2428, 2515, 2650, 2769`, matching the create region's own sites at `:1732, :1741, :1783`. One test asserting the five arms render with the role (query by role, count 5).
HOW IT WAS MEASURED (reproduce this before and after):
  A single grep for `Loading…` in that file returns exactly those five lines, none with a role; a grep for `role="status"` in the same file returns the create region's three.
JUDGE'S NOTE: VALID per verifier chunk08 (line opened by the verifier, not the judge): 5 of 5 arms opened, all bare. judged IMPORTANT not MINOR: the rubric puts an accessibility failure there and MINOR is copy/style only. Nuance: 'the board is stream-refetched' is overstated - use-live-
DONE WHEN: The attribute is asserted by an existing sweep test or a new small test (query by role/name), RED before and GREEN after; no painted number is claimed unless you painted it.
COMMIT: `V6: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-V6 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B04 — The help corpus and the small copy fixes  ·  lane UI  ·  session model **haiku**  ·  backend **deepseek**  ·  27 tasks  ·  ~5.2 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec4` · branch `rel/b04-the-help-corpus-and-the-small-co` · packages touched: @gisik-nokma/app-core, @gisik-nokma/editor, @gisik-nokma/web.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E5-1` | haiku | I | 0.5 | `docs/manual.md:664`, `docs/faq.md:307`, `docs/manual.md:666-668` |
| 2 | `T-E5-24` | haiku | I | 0.5 | `docs/manual.md:371`, `docs/manual.md:355-359` |
| 3 | `T-E6-1` | haiku | I | 0.5 | `packages/app-core/src/help/content.generated.ts:1927`, `packages/app-core/src/help/content.generated.ts`, `scripts/help-content.mjs` |
| 4 | `T-F1-ux` | haiku | I | 0.5 | `docs/manual.md:128`, `docs/manual.md`, `docs/faq.md` |
| 5 | `T-E2-55` | haiku | M | 0.25 | `docs/faq.md:294`, `docs/manual.md:418` |
| 6 | `T-E5-38` | haiku | M | 0.25 | `apps/web/app/privacy/page.tsx:16`, `test-cases/13-pre-launch-checklist.md:149` |
| 7 | `T-F5-ux` | haiku | M | 0.25 | `apps/web/app/workspaces/page.tsx:613-614`, `packages/app-core/src/views/my-work.tsx` |
| 8 | `T-F8-ux` | haiku | M | 0.25 | `test-cases/15-in-app-help.md:44`, `scripts/help-content.mjs` |
| 9 | `T-E2-25` | haiku | M | 0.3 | `packages/app-core/src/index.ts:310`, `apps/desktop/src/app.tsx:22-25`, `apps/desktop/src/app.tsx:18-26` |
| 10 | `T-E2-27` | haiku | M | 0.3 | `packages/app-core/src/sync/sync-status-bar.tsx:4-9`, `apps/mobile/src/screens/board-screen.tsx:11`, `packages/app-core/src/sync/sync-status-bar.tsx:11-17` |
| 11 | `T-E2-36` | haiku | M | 0.3 | `packages/app-core/src/views/ticket-sheet.tsx:733` |
| 12 | `T-E2-47` | haiku | M | 0.3 | `packages/editor/src/attachments/require-evidence.ts:53-55`, `packages/editor/src/index.ts:66`, `packages/app-core/src/views/ticket-sheet.tsx:891-899` |
| 13 | `T-E2-54` | haiku | M | 0.3 | `apps/web/src/shell-refusal.tsx:13-14` |
| 14 | `T-E4-29` | haiku | M | 0.3 | `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:224` |
| 15 | `T-E4-34` | haiku | M | 0.3 | `packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx:390` |
| 16 | `T-E4-6` | haiku | M | 0.3 | `packages/app-core/src/provenance.ts:5-7`, `packages/app-core/src/views/visibility-editor.tsx:404-411`, `packages/app-core/src/provenance.ts:29-34` |
| 17 | `T-E5-12` | haiku | M | 0.3 | `apps/web/src/account/workspaces-section.tsx:76` |
| 18 | `T-E5-14` | haiku | M | 0.3 | `packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx:169` |
| 19 | `T-E5-17` | haiku | M | 0.3 | `apps/web/app/mcp/tokens/page.tsx:21-22` |
| 20 | `T-E5-22` | haiku | M | 0.3 | `packages/app-core/src/views/ticket-sheet.tsx:124-125` |
| 21 | `T-E5-29` | haiku | M | 0.3 | `packages/app-core/src/workflow-builder/ui/state-mapping-dialog.tsx:53` |
| 22 | `T-E5-33` | haiku | M | 0.3 | `apps/web/app/sign-in/page.tsx:385` |
| 23 | `T-E5-35` | haiku | M | 0.3 | `packages/app-core/src/inbox/format.ts:85` |
| 24 | `T-E5-36` | haiku | M | 0.3 | `apps/web/src/workspace-viewer.ts:128`, `apps/web/src/workspace-viewer.ts:127-130` |
| 25 | `T-E5-39` | haiku | M | 0.3 | `packages/app-core/src/workflow-builder/ui/workflow-history-screen.tsx:150` |
| 26 | `T-F6-ux` | haiku | M | 0.3 | `apps/web/app/workspaces/page.tsx:168`, `apps/web/app/workspaces/page.tsx:165-169` |
| 27 | `T-F7-ux` | haiku | M | 0.3 | `packages/app-core/src/views/ticket-list.tsx:669` |

#### T-E5-1  ·  haiku  ·  IMPORTANT  ·  ~0.5 h  ·  rank 8

```
TASK T-E5-1 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.5 h — judged IMPORTANT — rank 8/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec5, docs/lanes/review-ux-exec5.md:209, 32 lines — read the whole section first):
  E5-1 — IMPORTANT · The help says "there is no dragging on the board"; every card is draggable and carries move arrows `[BROWSER]` `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  `docs/manual.md:664` — *"Columns, one per stage, with cards in them. You do not drag cards — you open one and press Move (§7)."* and `docs/faq.md:307` — the FIRST answer under "Stages and moves", *"How do I mark something done?"*: *"Open the job, press **Move…**, pick the stage, press Move. There is no dragging on the board."* Both are false. `docs/manual.md:666-668` then lists what a card shows (*"the title, who it is on, whether it is blocked, its progress, and a small 'who · when' button"*) and names no move arrows.
THE JUDGE'S LINE (the ruling rests on this; open it):
  docs/manual.md:664 "You do not drag cards — you open one and press Move (§7)." vs board.tsx:977 draggable={arrows !== null} (and the move arrows at :1600)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Apply the corpus's own convention (`docs/manual.md:355-359`: a superseded absence is kept and corrected in place) to `:664` and `:307`: *"Drag a card to a column, press ‹ › on the card, or open it and press Move."* — and add the arrows to the `:666` list.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `packages/app-core/src/views/board.tsx:977` `draggable={arrows !== null}`, `:978-984` `onDragStart` sets `DRAG_TICKET_FORMAT`; `:880` `onDropCard={handleDrop}`; `:661-662` `onDragOver`/`onDrop` wired when `onDropCard !== null`. `[BROWSER]` on the Board tab, JS over the painted DOM: `{cards: 24, draggable: 24}` — every `.gn-board__card-slot` has `draggable="true"`; and every card carries two `.gn-board-card__move` buttons, accessible names `"Move to previous state — unavailable"` / …
JUDGE'S NOTE: VALID, judge opened. The help denies a capability every card has, IMPORTANT.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E5-1: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-1 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-24  ·  haiku  ·  IMPORTANT  ·  ~0.5 h  ·  rank 9

```
TASK T-E5-24 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.5 h — judged IMPORTANT — rank 9/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:952, 27 lines — read the whole section first):
  E5-24 — IMPORTANT · Five more passages of the help describe a product that no longer exists — "no change role", "you cannot rename a job", "you cannot delete a job", "you cannot see what [visibility] is currently set to" `[BROWSER]` `[SOURCE]` — sibling of `exec2-F1`, none of its eight rows
WHAT IS WRONG (the reviewer's words):
  The corpus's own convention (`docs/manual.md:355-359`): keep each entry, mark it superseded, say what is now true. For (a), keep "no remove" and drop "no change role".
THE JUDGE'S LINE (the ruling rests on this; open it):
  docs/manual.md:371 "**You cannot rename a job.**" vs ticket-sheet.tsx:1818 aria-label="Ticket title" (an editable title); verifier opened all five passages against the code
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The corpus's own convention (`docs/manual.md:355-359`): keep each entry, mark it superseded, say what is now true. For (a), keep "no remove" and drop "no change role".
HOW IT WAS MEASURED (reproduce this before and after):
  Each cell above names the line opened. `[BROWSER]` controls from the members-page and sheet accessibility trees recorded earlier in this report.
JUDGE'S NOTE: VALID, judge opened. Five more help passages describe capabilities the product no longer lacks; the same class as exec 2's F1, scored the same (IMPORTANT) for consistency — the verifier's MINOR is overridden by the judge.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E5-24: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-24 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-1  ·  haiku  ·  IMPORTANT  ·  ~0.5 h  ·  rank 10

```
TASK T-E6-1 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.5 h — judged IMPORTANT — rank 10/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec6, docs/lanes/review-functionality-exec6.md:336, 59 lines — read the whole section first):
  E6-1 — IMPORTANT — The in-app help tells the user a job cannot be deleted; the product ships `Delete`
WHAT IS WRONG (the reviewer's words):
  The shipped help content — `packages/app-core/src/help/content.generated.ts`, generated by `scripts/help-content.mjs` from `docs/manual.md` and `docs/faq.md` (`help-content.mjs:54-55`) and rendered by `help-browser.tsx` — carries three sentences that deny a shipped feature:
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/help/content.generated.ts:1927 "text": "You cannot delete a job." vs ticket-sheet.tsx:1203 submitTicketEvent('ticket.deleted', …)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The Delete PR's change set should have included the help — the workspace rule that `Features.md` moves in the same change set applies with more force to the user-facing manual, since `Features.md:73` *was* updated in that PR. Concretely: replace `manual.md:372` with the three facts a user needs (who may delete — project admin; what happens — hidden from views, history kept; how to undo — the 15 s `Undo` on the toast, after which the Delete PR's own list says *"there is no UI that emits `ticket.restored`, so a soft delete becomes permanent in practice"*, `executor-state-history.md:687-691` — a sentence a user needs more than any other on this page), rewrite `faq.md:220-222` to answer *yes* and point at the undo, and drop the `faq.md:982` "unknown" bullet. The prototype's own `faq-delete` entry (export `Gisik Nokma - Desktop.dc.html`, sha `3d142d46`, `:2082`, under *"What happens when I delete something"*) is the model: *"The ticket stops appearing in views. Its history is retained, because other events cite it."*
HOW IT WAS MEASURED (reproduce this before and after):
  ``` grep -nE 'No delete button|You cannot delete a job|Whether a job can be deleted' packages/app-core/src/help/content.generated.ts → 1927, 7681, 10693 (all three present) sed -n '220,222p' docs/faq.md ; sed -n '372,373p' docs/manual.md (opened, quoted above) git log -1 --format='%h %ci' -- docs/faq.md → d89db1df 2026-09-20 22:20:51 +0530 git log -1 --format='%h %ci' -- docs/manual.md → 09d4bc93 2026-09-20 22:37:41 +0530 git log --format='%h %ci' -S"submitTicketEvent('ticket.deleted'" -- …
JUDGE'S NOTE: VALID, judge opened. The help denies a shipped Delete — the same class as exec 2's F1 and exec 5's E5-24, scored the same (IMPORTANT); the verifier's MINOR is overridden for consistency.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E6-1: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-1 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F1-ux  ·  haiku  ·  IMPORTANT  ·  ~0.5 h  ·  rank 11

```
TASK T-F1-ux — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.5 h — judged IMPORTANT — rank 11/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:303, 97 lines — read the whole section first):
  F1 — IMPORTANT · The in-app help describes a product that no longer exists, in at least six places
WHAT IS WRONG (the reviewer's words):
  `docs/manual.md` and `docs/faq.md` — the corpus behind `/help` — carry statements that were true of an earlier build and are false today. Named, each with the code that falsifies it:
THE JUDGE'S LINE (the ruling rests on this; open it):
  docs/manual.md:128 "**That is the entire menu.** There is no settings link, no search box, and no help link." vs app-nav.tsx:297-304 (a Settings Link) per the verifier's 12 falsifiers
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either (i) update the six passages in the change set that made each one false — the docblock above says this is already the convention; or (ii) if the corpus is now hand-maintained and slow to follow, say so at the top of `/help` and stop making absolute claims about the chrome ("the entire menu", "nothing links to them… not anywhere"); or (iii) derive the nav section from `navDef`-shaped data the way the sidebar derives its groups, so it cannot drift.
JUDGE'S NOTE: VALID, judge opened + verifier opened 8/8 rows. The in-app help describes a menu the product no longer ships; IMPORTANT = wrong information a person meets.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `F1: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F1-ux | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-55  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 12

```
TASK T-E2-55 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 12/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:4043, 60 lines — read the whole section first):
  E2-55 (r2) — IMPORTANT · The FAQ and the manual both say the 200-entry history cap is disclosed *"at the top"*; the product renders the notice **after** the list, and the copy's own purpose is to stop a person believing they saw the whole history
WHAT IS WRONG (the reviewer's words):
  Both help documents describe the truncation notice by its **location**, and the location is the opposite of where it renders:
THE JUDGE'S LINE (the ruling rests on this; open it):
  docs/faq.md:294 "Up to 200 entries. It says so at the top and there is no way to page further back"
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either half fixes it, and the cheaper half is the copy: *"a line at the end of the list says so"*. ⚠ **But the placement is the part I would argue for changing**, and the file's own docblock is where the argument comes from: `ticket-sheet.tsx:61-70` reasons carefully about `>=` versus `==` and accepts over-reporting on purpose (*"an occasional 'there may be more' is a weaker claim than the truth, while a silent truncation is a stronger one"*). **That reasoning is about the claim's strength and it is right; the notice's position is a separate decision that undoes a large part of it**, because a disclosure a reader must scroll past 200 rows to meet is, for most readers, not a disclosure. Moving the sentence above `<HistoryList>` costs one JSX move and makes the help true as written.
HOW IT WAS MEASURED (reproduce this before and after):
  Every line above was opened by me in this worktree: the JSX pair at `ticket-sheet.tsx:2727-2732`, the stylesheet declaration at `ui.css:1882` (searched in **source** stylesheets — ⚠ my first pass at this grep ran over the repo root and matched `apps/web/.next/`'s built CSS, a 242 KB result whose universe was the build tree rather than the source, so I re-ran it against the two stylesheet files by name), the constant at `ticket-sheet.tsx:71`, the route's default at `ticket-history.ts:78`, and …
JUDGE'S NOTE: VALID at MINOR, judge opened. Help copy and render-order drift; not a behaviour a person is misled by.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E2-55: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-55 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-38  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 18

```
TASK T-E5-38 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 18/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:1383, 38 lines — read the whole section first):
  E5-38 — MINOR · The sign-in page binds agreement to a Privacy notice that reads "Operated by [ENTITY NAME] · Governed by the laws of [JURISDICTION] … write to [CONTACT EMAIL]" — ten placeholders at paint — while the recorded choice says the page must not announce its own unreliability `[BROWSER, devtools isolated context]` `[SOURCE]` — category 2, argued
WHAT IS WRONG (the reviewer's words):
  `/sign-in`: *"By continuing you agree to the Terms and Privacy notice."* (`sign-in/page.tsx:491`, `[BROWSER]`). `/privacy` at paint (second browser, signed out): the meta line *"Last updated [DATE] · Operated by [ENTITY NAME] · Governed by the laws of [JURISDICTION]"* and, in the body, *"operated by [ENTITY NAME], [REGISTERED ADDRESS]. For anything in this policy, write to [CONTACT EMAIL]"* — **10 bracketed placeholders**, 7 distinct (`[DATE]`, `[ENTITY NAME]`, `[JURISDICTION]`, `[REGISTERED ADDRESS]`, `[CONTACT EMAIL]`, `[RESPONSE PERIOD]`, `[SUPERVISORY AUTHORITY]`), measured by regex over `main.innerText`. `/terms` the same way: **9** placeholders, 6 distinct, opening *"An agreement between you and [ENTITY NAME] · Governed by the laws of [JURISDICTION]"*, with `[MINIMUM AGE]` and `[LIABILITY CAP]` in the body. No sentence on either page says it is a draft (regex for …
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/privacy/page.tsx:16 — * This warning is deliberately in a code comment and NOT on the rendered page.
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One visible line at the top of both legal pages — *"Draft notice: the bracketed details are not yet filled in"* — until the placeholders are, and the sign-in line phrased as *"… the draft Terms and Privacy notice"* until then.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` `/privacy` and `/terms` text and regex counts as above; `[SOURCE]` `privacy/page.tsx:1-24`; `sign-in/page.tsx:491`; `test-cases/13-pre-launch-checklist.md:149`.
JUDGE'S NOTE: VALID per verifier chunk27 (line opened by the verifier, not the judge): Counts reproduce EXACTLY in the same unit (rendered main text) but against the LIVE :3001 stack; the source halves come from the pinned tree. Control: 'not reviewed' hits privacy/p.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E5-38: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-38 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F5-ux  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 19

```
TASK T-F5-ux — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 19/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec2, docs/lanes/review-ux-exec2.md:546, 44 lines — read the whole section first):
  F5 — MINOR · The founding flow lands a new owner on a page of four negatives; the prototype lands on the list with a confirmation
WHAT IS WRONG (the reviewer's words):
  `FoundingForm` navigates to `/w/<workspaceId>/my-work` on success (`apps/web/app/workspaces/page.tsx:613-614`). For a workspace founded seconds earlier there are no projects and no tickets, so `MyWork` (`packages/app-core/src/views/my-work.tsx`) renders exactly four sentences and nothing else:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/workspaces/page.tsx:613-614 — void founding.foundWorkspace(...).then(({ workspaceId }) => router.push(`/w/${workspaceId}/my-work`),
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Land on `/w/<id>` (the workspace home, which carries the New-project form for an owner), or land on the list with the prototype's confirmation toast, or (cheapest) keep the `/my-work` destination and give the all-empty My Work state a first-run sentence with a link when the workspace has no projects.
JUDGE'S NOTE: VALID per verifier chunk06 (line opened by the verifier, not the judge): Core reproduces at the exact lines; manual.md:174 verbatim; NewProjectForm at apps/web/app/w/[workspaceId]/page.tsx:958-959. Citation drift: the witnessing test "posts the name and routes the founder
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `F5: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F5-ux | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F8-ux  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 20

```
TASK T-F8-ux — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 20/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:659, 23 lines — read the whole section first):
  F8 — MINOR · A recorded self-test count is stale, in the block that documents the freshness gate
WHAT IS WRONG (the reviewer's words):
  `test-cases/15-in-app-help.md:44` records the parser's self-test as *"(10 cases, 4 of them planted defects)"*. The runner prints **`self-test passed (12 cases, 5 of them planted defects)`**. The same entry says *"a parser reporting "224 entries" tells you it ran"*; the current count is **231**.
THE JUDGE'S LINE (the ruling rests on this; open it):
  test-cases/15-in-app-help.md:44 — The parser's own cases live in `scripts/help-content.mjs`'s self-test (10 cases, 4 of them planted defects)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  State the count without the number (*"the self-test's own cases, each planted defect named"*), or generate it — `scripts/help-content.mjs` prints the figure on every run, so a check could assert the entry matches.
JUDGE'S NOTE: VALID per verifier chunk07 (line opened by the verifier, not the judge): Both figures stale: 10->12, 4->5, 224->231. The check was falsifiable - matching numbers would have read INVALID. Small scope slip: the '224 entries' sentence is at :42 (the section's note), not insid
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `F8: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F8-ux | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-25  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 205

```
TASK T-E2-25 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 205/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:1524, 56 lines — read the whole section first):
  E2-25 (r2) — IMPORTANT · Five components written for offline and degraded states reach no screen, and the two shells that do show those states hand-copy them
WHAT IS WRONG (the reviewer's words):
  Five exported components — the entire offline/degraded vocabulary this product built — are **mounted nowhere**, while two shells re-implement two of them by hand.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/index.ts:310/:313 export ContestBanner / SyncStatusBar; grep <SyncStatusBar|<ContestBanner over the three shells → 0; apps/desktop/src/app.tsx:22-25 "SyncStatusBar and ContestBanner do not exist" (stale)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either mount the five where their states arise (the inbox badge is the cheapest and most visible — the nav already has the slot), or delete them and let the surviving spelling be the only one. A component that cannot be honoured is not carried "in case" — the repo states that rule for controls (`ticket-sheet.tsx:2596-2597`) and it applies unchanged to a component. And the desktop comment must be corrected in the change that proves it wrong.
HOW IT WAS MEASURED (reproduce this before and after):
  515 non-test source files under `apps/` and `packages/` walked; per-name hit lists above, each hit inspected for mount-vs-comment. Opened: `apps/desktop/src/app.tsx:18-26`; `apps/mobile/src/screens/board-screen.tsx:44-54`; `apps/mobile/src/screens/ticket-screen.tsx:72-80,106-114`.
JUDGE'S NOTE: VALID at MINOR, judge opened. Exported components no shell renders plus a stale deviation comment = structural drift; the person meets hand-copied states, not a wrong one. Scored below the claimed severity.
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E2-25: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-25 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-27  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 206

```
TASK T-E2-27 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 206/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:1609, 40 lines — read the whole section first):
  E2-27 (r2) — MINOR · An unrecognised sync status is reported as "Live", the healthiest word available
WHAT IS WRONG (the reviewer's words):
  `packages/app-core/src/sync/sync-status-bar.tsx:11-17`: ``` export function syncStatusLabel(status: string, queued: number): string { const claims = queued === 1 ? '1 claim waiting to send' : `${queued} claims waiting to send`; if (status === 'offline') … ; if (status === 'catching-up') … ; if (status === 'connecting') … ; return queued === 0 ? 'Live' : claims; } ``` `status` is deliberately widened to `string` so a host can pass `query.syncStatus` verbatim.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/sync/sync-status-bar.tsx:4-9,:16; apps/mobile/src/screens/board-screen.tsx:11 — :16 return queued === 0 ? 'Live' : claims; board-screen :11 status: string;
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Return the queue-only sentence on the unknown arm, or the status string verbatim (as `board-screen.tsx` already does for `failed`).
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `sync-status-bar.tsx:1-17` (the docblock and the whole function); `apps/mobile/src/screens/board-screen.tsx:11,44-54` for the live call site (`syncStatusLabel(props.status, props.queued)`).
JUDGE'S NOTE: PARTIAL per verifier chunk09 (line opened by the verifier, not the judge): Core holds: :16 returns 'Live' on the unknown arm and board-screen.tsx:11 is bare string, so the shell ADMITS the value by type. FALSE scope: the hardening says 'Here it can' occur, against its M4 cas
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E2-27: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-27 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-36  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 209

```
TASK T-E2-36 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 209/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:2100, 44 lines — read the whole section first):
  E2-36 (r2) — MINOR · A partly committed Move batch never reloads, so the sheet behind the refusal shows state the server no longer has
WHAT IS WRONG (the reviewer's words):
  `ticket-sheet.tsx:711-745`: the batch is ordered `[...fieldEvents, transition]` (`:731`), and the reload lives **only in the all-committed branch** — `:733-738` `if (failed === undefined) { … read.reload(); history.reload(); return; }`. On any failure the function sets `serverRefusal` (`:743-744`) and returns: **no reload.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/views/ticket-sheet.tsx:733 — if (failed === undefined) {
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Reload on **any** answer, not only the happy one.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `ticket-sheet.tsx:705-745` (the ordering rationale, the single reload site, and the refusal arms that return without one).
JUDGE'S NOTE: PARTIAL per verifier chunk10 (line opened by the verifier, not the judge): Core VALID; :708-710 states the deliberate ordering. FALSE: 'nothing re-read' - the committed field_set moves the stream, so the sheet re-reads itself; the staleness holds only while the socket is abs
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E2-36: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-36 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-47  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 210

```
TASK T-E2-47 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 210/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/editor
FINDING (exec2, docs/lanes/review-ux-exec2.md:3388, 58 lines — read the whole section first):
  E2-47 (r2) — MINOR · The ticket sheet's own symbol sweep names three unwired exports and misses a fourth, whose docblock hands its correctness gap to a caller that does not exist
WHAT IS WRONG (the reviewer's words):
  `packages/app-core/src/views/ticket-sheet.tsx:891-899` records a measured sweep:
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/editor/src/attachments/require-evidence.ts:53-55 and :61; packages/editor/src/index.ts:66; packages/app-core/src/views/ticket-sheet.tsx:891-899 — closing it means folding the state id here too, which is this function's caller's business (:53-54)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Two answers, both one line: **export it or delete it.** If the client is not going to decide the evidence prompt from the workflow definition — and the sheet's own docblock says the engine is the authority — then the function should not be public, because a public symbol with a documented unclosed gap invites a future caller to take it up without the folding its docblock requires. If it *is* to be used, the folding belongs inside it, since the docblock already establishes that no caller can be expected to know. **Either way the sweep in the sheet should name four, not three**, so the next reader does not have to re-run it to learn that this one exists.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `packages/editor/src/attachments/require-evidence.ts:1-67` (in full — the mirror, the two facts it derives by reading the engine, and the state-resolution gap it declines to close); `packages/editor/src/index.ts:66` (the barrel export); `packages/app-core/src/views/ticket-sheet.tsx:891-899` (the recorded sweep that names three); and a walk of every `.ts`/`.tsx` under `apps/` + `packages/` excluding `dist/` for the symbol, which returns **6 non-test mentions: 4 in `dist/`, its …
JUDGE'S NOTE: VALID per verifier chunk12 (line opened by the verifier, not the judge): Membership matches his stated 6 exactly; zero callers. Control through the same command: assembleTicketCards returns 34 non-test non-dist hits. Sweep at ticket-sheet:891-899 names three, not this one.
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E2-47: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-47 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-54  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 212

```
TASK T-E2-54 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 212/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec2, docs/lanes/review-ux-exec2.md:3814, 59 lines — read the whole section first):
  E2-54 (r2) — MINOR · `shell-refusal.tsx` says "`SERVING_GAPS` is empty — so NO read in this shell refuses for a serving reason"; the register's own docblock says emptiness means no such thing, and `getTickets` still refuses
WHAT IS WRONG (the reviewer's words):
  The docblock of the shell's one refusal component asserts an absolute about the product that the product does not satisfy:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/shell-refusal.tsx:13-14 — `SERVING_GAPS` is empty - so NO read in this shell refuses for a serving reason.
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The sentence should say what the register actually establishes — *"`SERVING_GAPS` is empty, so no read here refuses OUTRIGHT; a read can still refuse conditionally, and a `ServingGapError` from `online-data-source.ts` is one"* — or, better, delete the inference and keep the half the file can support: the component's reason to exist is that **a read that ANSWERS can still fail**, which the docblock already states and which needs no claim about the register at all. **The second half of the same docblock is a separate totality claim and has the same problem**: `:29` — *"So every read in this shell checks `error` BEFORE it checks `data`"* — is a statement about every read on every page, in a file that cannot see them; ⚠ **and exec 5's `E5-42` is what falsifies it** (a preferences failure painted as *"The ticket list cannot be shown yet."*), so I am recording the two claims together and claiming only the first as mine, because the second already has a measured finding against it and filing it again would be a duplicate of `E5-42` with nothing added.
HOW IT WAS MEASURED (reproduce this before and after):
  Every line above was opened by me in this worktree. The decisive pair is a **contradiction between two docblocks in the same call chain**: `shell-refusal.tsx:14` (the consumer) asserts the totality, `mappers.ts:2452-2453` (the producer) explicitly denies that the emptiness supports it, and `online-data-source.ts:255` is the reachable refusal that satisfies the producer's warning. ⚠ **What I did not measure:** whether a >2000-ticket project exists in the owner's database, so **I am not claiming …
JUDGE'S NOTE: VALID per verifier chunk13 (line opened by the verifier, not the judge): Claim + falsifier opened; mappers.ts:2453-4 denies the inference ('NOT a claim that no read is missing... no mapper here refuses outright'). Path MEASURED: providers.tsx:108 wires the ONLINE source, c
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E2-54: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-54 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-29  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 214

```
TASK T-E4-29 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 214/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:459, 12 lines — read the whole section first):
  E4-29 — **MINOR** — The ticket-type editor's validation list paints Zod's own message, verbatim and without the field it refers to: *"String must contain at least 1 character(s)"*, twice, for an empty form
WHAT IS WRONG (the reviewer's words):
  Map `issue.path` to the field's label and write the sentence (*"Name is required"*), or the `saved-filters.ts` shape at minimum.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:224 — const schemaMessages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Map `issue.path` to the field's label and write the sentence (*"Name is required"*), or the `saved-filters.ts` shape at minimum.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, `/settings/ticket-types/new`, 1512).** `ul.ticket-type-editor__issues` text → `String must contain at least 1 character(s)String must contain at least 1 character(s)` (two `<li>`, identical). Source: `ticket-type-editor-screen.tsx:223-224` — `const parsed = ticketTypeDefSchema.safeParse(def); const schemaMessages = … parsed.error.issues.map((issue) => issue.message);` — the library's default message, with `issue.path` discarded, rendered at `:372-377`. **Control in the …
JUDGE'S NOTE: VALID per verifier chunk21 (line opened by the verifier, not the judge): Verbatim reproduction. freshDef() at :50 holds exactly two empty strings (name, workflowId), which is why two identical li render at :372-377; issue.path is discarded. Both control.
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E4-29: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-29 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-34  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 215

```
TASK T-E4-34 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 215/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:520, 10 lines — read the whole section first):
  E4-34 — **MINOR** — A guest who *"can look, not touch"* is offered five rows whose accessible name is `Edit <type>`
WHAT IS WRONG (the reviewer's words):
  `` aria-label={`${canAuthor ? 'Edit' : 'Open'} ${type.name}`} `` — the branch the file already computes.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx:390 — aria-label={`Edit ${type.name}`}
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `` aria-label={`${canAuthor ? 'Edit' : 'Open'} ${type.name}`} `` — the branch the file already computes.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted as the guest, `/settings/ticket-types` and `/settings?workspaceId=…`).** `p.read-only-banner` *"You can look, not touch — only a workspace owner or admin can change workflows and ticket types."* directly above five `button.ticket-type-list__row` whose accessible names are `Edit Epic`, `Edit Story`, `Edit Errand`, `Edit Task`, `Edit Sub-task`. Source: `ticket-type-list-screen.tsx:386-391` — `` aria-label={`Edit ${type.name}`} `` with no `canAuthor` branch, while the same …
JUDGE'S NOTE: VALID per verifier chunk22 (line opened by the verifier, not the judge): Verb at :390 unbranched; :345/:355 branch on the same canAuthor; Save gated at editor:134. Sample 4 of 5 rows builtin. Ruling grep (docs/, test-cases/, control non-empty) found onl.
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E4-34: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-34 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-6  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 216

```
TASK T-E4-6 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 216/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:163, 12 lines — read the whole section first):
  E4-6 — **MINOR** — The visibility editor's people picker labels a member by a 26-character ULID
WHAT IS WRONG (the reviewer's words):
  In *Who can see this › Only the people I name › Who, exactly*, the second checkbox is labelled **`01M1V035TASFV2G9WPWFV9QDVW`**.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/provenance.ts:5-7,29-33; views/visibility-editor.tsx:410,95; view-types.ts:3,60 — A missing display name falls back to the raw actor id — attributed, never blank, never a fabricated "system".
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Pass `RosterMember[]` and label `name || email || id` in the picker only, leaving `actorLabel` untouched for provenance. Severity Minor because it needs a member with no display name, which the seed has and a real workspace may not.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, sheet open).** `label.gn-visibility__person` ×2: `Kiro` and `01M1V035TASFV2G9WPWFV9QDVW`. Read-only `select id, email, name from "user"` on the dev DB: that id is `accountant@e2e.gisik-nokma.local` with `name = ''`. Source: `packages/app-core/src/views/visibility-editor.tsx:404-411` renders `actorLabel(member.id, member.name)`; `packages/app-core/src/provenance.ts:29-34` returns the raw id when the name is empty. The editor's `members` prop is `Actor[]` = `{ id, name }` …
JUDGE'S NOTE: VALID per verifier chunk18 (line opened by the verifier, not the judge): The ruling exists and is quoted, but INVALID needs "no argument against the ruling" and the finding supplies one (a chooser is not an attributed claim), so VALID. Actor={id;name} at :3, RosterMember a
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E4-6: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-6 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-12  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 217

```
TASK T-E5-12 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 217/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:570, 19 lines — read the whole section first):
  E5-12 — MINOR · The same workspace is "1 project" on `/workspaces` and "2 projects" on `/account` `[BROWSER]` `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  `/workspaces` card for Convenience Corner: `1 project` + chip `1 archived` (`[BROWSER]`). `/account` → Your workspaces: `Convenience Corner · owner · 2 projects` (`[BROWSER]`). Wire: `GET /v1/me/workspaces` → two projects, one `archived: true` (`[BROWSER]`). **The cause is two units under one word:** `/workspaces` counts live projects only and says "archived" separately; `/account` counts the whole array, archived included — and neither screen names its unit.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/account/workspaces-section.tsx:76 — {workspace.projects.length}{' '} {workspace.projects.length === 1 ? 'project' : 'projects'}
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One helper, or the account row saying `1 project · 1 archived`.
HOW IT WAS MEASURED (reproduce this before and after):
  Lines above opened; both pages painted.
JUDGE'S NOTE: VALID per verifier chunk24 (line opened by the verifier, not the judge): Both render sites opened (2 of 2); two units under one word confirmed by reading. workspace-viewer.test.ts:11 pins projectCountLine(1)==='1 project'. The 1-vs-2 paint is the owner's seeded data and wa
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E5-12: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-12 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-14  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 218

```
TASK T-E5-14 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 218/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec5, docs/lanes/review-ux-exec5.md:644, 26 lines — read the whole section first):
  E5-14 — MINOR · Ten reorder arrows, all disabled, the reason only in a hover `title`; and the shipped seed already carries the rank tie the arrows exist to prevent `[BROWSER]` `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  `/settings` → Ticket types: five rows, each with `↑`/`↓`; **all ten are `disabled`** (`[BROWSER]` control list: `Move Epic up [disabled]` … `Move Sub-task down [disabled]`), including the custom `Errand`. The only explanation is `title={moveBlocker(index, -1) ?? …}` (`ticket-type-list-screen.tsx:365`) — *"Built-in types keep their rank."* — a hover tooltip, with no touch or keyboard equivalent and no sentence on screen. And the list reads `Errand · rank 3` and `Task · rank 3` (`[BROWSER]`) under the line *"5 types. Rank orders them in every picker."* (`:336`).
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx:169 — the exact tie the two-event swap exists to prevent. Every arrow is disabled
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Say the blocker on screen (a line under the list: *"Built-in types keep their rank; custom types reorder among themselves"*), or hide arrows on built-in rows; and either forbid the tie at the editor (*"rank 3 is Task's"*) or describe tie-break in the sentence.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` control list and row text on `/settings?workspaceId=…`; `[SOURCE]` lines above.
JUDGE'S NOTE: PARTIAL per verifier chunk24 (line opened by the verifier, not the judge): Core holds: :365 title-only blocker, :366 disabled, :336 'Rank orders them in every picker', seed ties Errand 3 to Task 3. PARTIAL: the quoted sentence is at :169, NOT the cited :214-222. exec-state-h
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E5-14: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-14 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-17  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 219

```
TASK T-E5-17 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 219/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:740, 27 lines — read the whole section first):
  E5-17 — MINOR · `/mcp/tokens` is a chrome-less orphan: no app nav, nothing links to it, and its own docblock says it is a Settings tab it left two rounds ago `[BROWSER]` `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  `/mcp/tokens` paints `Connected assistants` with **no `AppNav`** — no Workspaces/My Work/Members/Settings, no account menu (`[BROWSER]` control list: only `Name`/`Revoke` buttons). `grep -rn "/mcp/tokens" apps/web/app apps/web/src` → no `href` anywhere; the only non-comment hit is `mcp-tokens-screen.tsx:212` (`returnTo`), which sends a signed-out person BACK to this chrome-less page after sign-in. `app/mcp/tokens/page.tsx:16-24` says `/settings` *"can mount the SAME component as its 'MCP tokens' tab"*; `app/settings/page.tsx:118-125` says *"MCP tokens LEFT this shell (Round 21) … moved it to `/account`"*. The painted `/settings` has three tabs: Ticket types · Workflows · Workspace.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/mcp/tokens/page.tsx:21-22 — tokens should not be opening up a separate route. it should live inside settings.") can mount the SAME compone
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Redirect `/mcp/tokens` → `/account#connected-assistants`, or mount `AppNav`.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` painted text and controls; `[SOURCE]` `app/mcp/tokens/page.tsx:1-33`, `app/settings/page.tsx:118-130`, `mcp-tokens-screen.tsx:212`.
JUDGE'S NOTE: VALID per verifier chunk25 (line opened by the verifier, not the judge): settings/page.tsx:118-124 "MCP tokens LEFT this shell (Round 21) ... moved it to /account". app/layout.tsx is the only layout and has no nav, so the chrome-less claim holds from source (BROWSER half n
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E5-17: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-17 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-22  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 220

```
TASK T-E5-22 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 220/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec5, docs/lanes/review-ux-exec5.md:902, 23 lines — read the whole section first):
  E5-22 — MINOR · "Add subtask" never says what it will file: under an Epic it silently births a Task (skipping Story); the fallback rule is flagged "for a ruling" and unruled `[BROWSER]` `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  The subtask section reads `New subtask title` + `Add subtask` (`ticket-sheet.tsx:2295`, `:2306`; `[BROWSER]` on `CCSO-3`) and no sentence names the type the child will take. The type is chosen by `subtaskTypeFor` (`:118-131`): rule 1, the built-in `task` whenever legal; rule 2, otherwise the SHALLOWEST legal type. Under an Epic (rank 1) `task` (rank 3) is legal, so the child is a **Task** — the Story rank between them is skipped; under an Errand (rank 3) it is a Sub-task. `subtaskType.name` is read nowhere in the render (`grep -n 'subtaskType' …` → the predicate, the payload `:1388`, and the arm gates only).
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/views/ticket-sheet.tsx:124-125 — const task = legal.find((def) => def.id === 'task'); if (task !== undefined) return task;
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One clause: *"Adds a **Task** under this epic"* (the type is already in hand), or a type picker over the legal set when more than one qualifies.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` subtask section text; `[SOURCE]` `:96-131`, `:1334-1346`, `:1379-1388`, `:2294-2306`.
JUDGE'S NOTE: VALID per verifier chunk25 (line opened by the verifier, not the judge): Under an epic (rank 1) legal = story/task/sub-task and rule 1 takes task, so story is skipped. :106-113: "Rule 2 is the one judgement in this change that is not forced, and it is flagged for a ruling"
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E5-22: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-22 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-29  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 221

```
TASK T-E5-29 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 221/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec5, docs/lanes/review-ux-exec5.md:1117, 21 lines — read the whole section first):
  E5-29 — MINOR · The state-mapping dialog says "Publishing cannot see which tickets sit in which state" directly above rows that say "3 tickets sit here today" `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  `workflow-builder/ui/state-mapping-dialog.tsx:52-54` body: *"Version N+1 removes states that version N has. **Publishing cannot see which tickets sit in which state**, so every removed state needs a destination — occupied or not."* Each row beneath (`:58-62`) prints `countLine(...)` → *"3 tickets sit here today"* / *"1 ticket sits here today"* (`:10-15`), from `getStateOccupancy`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/workflow-builder/ui/state-mapping-dialog.tsx:53 (+ :60) — Publishing cannot see which tickets sit in which state, so every removed state needs a destination — occupied
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  *"The counts below are for your information only — the rule needs a destination for every removed state, occupied or not."*
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` lines above opened.
JUDGE'S NOTE: VALID per verifier chunk26 (line opened by the verifier, not the judge): countLine :11-15 returns '3 tickets sit here today', rendered at :60, seven lines under :53. Docblock :18-35: the count is a courtesy, occupancy reaches only countLine. The owner ruling (2026-08-26, :
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E5-29: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-29 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-33  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 222

```
TASK T-E5-33 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 222/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:1234, 23 lines — read the whole section first):
  E5-33 — MINOR · Pressing "Send magic link" with nothing typed makes a server round trip and paints the validator's own path — "[body.email] Invalid email address" `[BROWSER, devtools isolated context, 390 px]` `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  `/sign-in`, signed out: the email input is `type="email"` with no `required` (`sign-in/page.tsx:356-369`), the control is a `<Button onClick>` rather than a form submit (`:378-388`), so nothing checks for an empty field before `authClient.signIn.magicLink({ email: '' })` is sent; the server's `400` message is rendered verbatim by `fail(linkError.message)` (`:188`, `:384-386`) in the card's `role="alert"` (`:485`). Painted after one press on an empty field: **`[body.email] Invalid email address`** (`[BROWSER]`, alerts list).
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/sign-in/page.tsx:385 — linkError ? fail(linkError.message) : setEmailSent(true),
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `required` on the input and a `<form onSubmit>` so the browser refuses an empty press locally; map the validator's message to *"Enter the email address you signed up with."*
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` second browser: `before: {inputType: "email", required: false}`; after clicking `Send magic link` with the field empty → alert `"[body.email] Invalid email address"` (the request went through better-auth's own fetch, not `window.fetch`, so the page-level patch saw `reqs: []`). `[SOURCE]` lines above. No token was minted: the server refused the body before any write.
JUDGE'S NOTE: VALID per verifier chunk27 (line opened by the verifier, not the judge): Opened :358 (type=email, no required), :188, :385, :485. Paint not rerun - it is a POST through the owner's stack. Source: better-call validator.mjs:49 builds `[${validating}.path].
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E5-33: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-33 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-35  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 223

```
TASK T-E5-35 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 223/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec5, docs/lanes/review-ux-exec5.md:1287, 28 lines — read the whole section first):
  E5-35 — MINOR · No inbox row says WHEN — `createdAt` is on every notification and rendered nowhere — and the two rows that could name their ticket do not: the mention drops a `ticketTitle` it carries, the contested claim has none and prints a rule slug `[SOURCE]` — category 3 (recorded as "render-only", unruled)
WHAT IS WRONG (the reviewer's words):
  `inbox-view.tsx:66-109`: a row is icon + headline + body + unread dot. `grep -n createdAt inbox-view.tsx format.ts` → **0** — the wire's `Notification.createdAt` (`domain/notifications.ts:134`, `:146`) reaches no row. The export's row draws `{{ n.time }}` (`EXPORT:606-637`). Headlines (`format.ts:73-103`): a mention is *"<name> mentioned you"* with the excerpt as body — `mentionNotificationPayloadSchema` carries `ticketTitle` (`notifications.ts:66`) and neither headline nor body uses it; a contested claim is *"Your claim was contested — require-comment"* with the engine's reason as body — the payload (`:77-81`) has `ticketId`, `rule`, `reason` and no title, so the row cannot name the ticket, and the headline prints the rule's slug (`payload.rule`) where a person reads a sentence — the same shape as E5-8's `ticket.field_set`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/inbox/format.ts:85 — return `Your claim was contested - ${payload.rule}`;
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `formatDateTime(notification.createdAt)` on the row (the sheet's one renderer); the mention body as *"<excerpt>" — on <ticketTitle>*; the rule's human name from the workflow (or the reason alone) instead of the slug; `ticketTitle` added to the contested payload at the producer.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` lines above opened; `EXPORT:606-640` opened (`{{ n.time }}`, `{{ n.toggleRead }}`). Not painted: the owner's inbox is empty (`[BROWSER]` `EMPTY_INBOX_COPY`) and I mint no notifications in their database.
JUDGE'S NOTE: VALID per verifier chunk27 (line opened by the verifier, not the judge): Also opened format.ts:81 and :119 (body=excerpt, so ticketTitle at notifications.ts:66 is unused); :77-81 contested payload has no title. EXPORT Desktop.dc.html:633 draws {{ n.time.
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E5-35: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-35 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-36  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 224

```
TASK T-E5-36 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 224/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:1316, 26 lines — read the whole section first):
  E5-36 — MINOR · A workspace with no projects has no empty-project sentence on its `/workspaces` card — the owner's own gap list names this (`workspaces-gap.md` item 12) and it is still open `[SOURCE]` — FIRST-RUN
WHAT IS WRONG (the reviewer's words):
  `apps/web/src/workspace-viewer.ts:127-130` `projectCountLine(0)` → `null`; `:169-173` `projectLine([])` → `null`. `workspaces/page.tsx:264`, `:267` feed those into the card, which renders the meta line only when `meta !== null` and the project line only when `projects !== null` (`:296`, `:314`). So a founder's fresh workspace card is avatar, name, chips, *"You're an owner here."* — and nothing about projects, no *"No projects yet"*, no pointer. The export's card meta reads `"N members · M projects"` (`EXPORT:2732`: `live.length + (live.length === 1 ? " project" : " projects")`), which for a new workspace at least says `0 projects`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/workspace-viewer.ts:128 — if (liveCount <= 0) return null;
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `projectCountLine(0)` → *"No projects yet"* for a non-guest viewer (guests keep the withheld arm), matching the manual's convention of saying an absence rather than omitting it.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` lines above opened; `workspaces-gap.md:31` (*"12. No empty-project case on a card"*) opened. Not painted — the dev workspace has a live project.
JUDGE'S NOTE: VALID per verifier chunk27 (line opened by the verifier, not the judge): All 6 cited lines exact (sample 6 of 6). EXPORT card meta confirmed at 'Gisik Nokma - Desktop.dc.html':2732 (live.length + ' project'/' projects'). Not painted - the dev workspace .
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E5-36: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-36 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-39  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 225

```
TASK T-E5-39 — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 225/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec5, docs/lanes/review-ux-exec5.md:1422, 26 lines — read the whole section first):
  E5-39 — MINOR · "Version history" lists v1…vN with no date and no author — the ledger records both on every `workflow.defined`, the read serves neither `[SOURCE]` — wire-limited, unruled
WHAT IS WRONG (the reviewer's words):
  `workflow-builder/ui/workflow-history-screen.tsx:122-190`: each version renders `v${n}`, `Current`/ `Superseded`, the name, the state chips and *"N states · M transitions · maps K states"* (`:175-181`). `grep -n 'publishedAt\|serverTime\|actor' workflow-history-screen.tsx gateway.ts` → 0. `PublishedWorkflowDef` (`domain/workflow.ts:116`, `= WorkflowDefinedPayload`) carries `{id, version, name, initialStateId, states, transitions, stateMapping?}` — no instant, no actor — while the event that made each version, `workflow.defined` (`domain/vocabulary.ts:75`), carries `serverTime` and `actorId` like every ledger event. The screen's arms are otherwise complete: load error (`:116`), loading (`:118`), empty (`:120`), and a *"N versions … did not answer and are not shown"* gap sentence (`:136-140`).
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/workflow-builder/ui/workflow-history-screen.tsx:150 — <span className="workflow-history__version-number">{`v${version.version}`}</span>
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Carry `publishedAt`/`publishedBy` on the version read (they are on the event) and render *"published 16 Sep 2026 by Kiro"* per card through the one `formatDateTime`.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` lines above opened. Not driven — the builder needs a session.
JUDGE'S NOTE: VALID per verifier chunk27 (line opened by the verifier, not the judge): workflow.ts:83-90/:116: PublishedWorkflowDef carries no instant/actor; vocabulary.ts:75 is 'workflow.defined'; manual:637 and :1141 verbatim; :116/:118/:120/:136-140/:175-181 exact.
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `E5-39: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-39 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F6-ux  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 226

```
TASK T-F6-ux — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 226/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec2, docs/lanes/review-ux-exec2.md:591, 32 lines — read the whole section first):
  F6 — MINOR · A docblock states an absolute that the same card falsifies four lines later
WHAT IS WRONG (the reviewer's words):
  `apps/web/app/workspaces/page.tsx:165-169` argues the guest arm:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/workspaces/page.tsx:168 — // this branch either, for the same reason: a guest gets no numbers at all,
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Scope the sentence to what it governs: *"no count chips on this branch — a guest gets no ticket, member or archived numbers"*, and name the restriction sentence as the deliberate exception, as `workspace-viewer.ts` already does.
JUDGE'S NOTE: VALID per verifier chunk07 (line opened by the verifier, not the judge): All 4 measurement citations opened and exact (:165-169, :333-335, workspace-viewer.ts:107-110, :152-163 'owner-ruled restricted sentence'); the guest card does render a number, so the absolute is fals
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `F6: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F6-ux | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F7-ux  ·  haiku  ·  MINOR  ·  ~0.3 h  ·  rank 227

```
TASK T-F7-ux — batch B04 (The help corpus and the small copy fixes) — model haiku — backend deepseek — effort ~0.3 h — judged MINOR — rank 227/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:624, 34 lines — read the whole section first):
  F7 — MINOR · The epic group count diverges from the prototype, and the divergence is declared but not ruled
WHAT IS WRONG (the reviewer's words):
  Under the List's `epic` grouping, the section band reads `` `${groupMeta} · ${section.rows.length} tickets` `` (`packages/app-core/src/views/ticket-list.tsx:669`), counting the **epic row itself** among its children. The prototype counts children only: it builds the sentence at `:2923` from `const n = g.items.length` (`:2920`) while holding the epic separately in `g.epic` (`:2904`) and rendering it above (`:2927-2928`) — so an epic with three children reads `epic · 3 tickets` there and `epic · 4 tickets` here.
THE JUDGE'S LINE (the ruling rests on this; open it):
  /Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/Gisik Nokma - Desktop.dc.html:2903 — if (isEpicT(t)) { const g = push(t.id, t.title, "epic"); g.epic = t; return; }
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either adopt the prototype's children-only count, or have the band say which membership it is counting (`epic · 4 rows (3 tickets)`), or get one line of owner ruling and record it beside the divergence. Any of the three closes it.
JUDGE'S NOTE: PARTIAL per verifier chunk07 (line opened by the verifier, not the judge): Divergence is real (children-only count :2919, epic rendered as a row :2926; ticket-list.tsx:669 and :656-664 exact). FALSE PART: 'opened directly, not inherited' - 2904/2920/2923/2927 are the REPO CO
DONE WHEN: The sentence is corrected at the cited line; the test that pins the copy (if any) is updated; `pnpm check:help` green if help content is touched.
COMMIT: `F7: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F7-ux | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B05 — Keyboard, focus and dialog containment  ·  lane UI  ·  session model **sonnet**  ·  backend **deepseek**  ·  6 tasks  ·  ~4.5 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec4` · branch `rel/b05-keyboard-focus-and-dialog-contai` · packages touched: @gisik-nokma/ui.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E4-17` | sonnet | I | 1.25 | `packages/ui/src/select/select.tsx:187-190`, `packages/ui/src/select/select.tsx` |
| 2 | `T-E4-21` | sonnet | I | 1.25 | `packages/ui/src/ui.css:2474`, `packages/ui/src/ui.css` |
| 3 | `T-P18` | sonnet | I | 1.25 |  |
| 4 | `T-P23` | sonnet | I | 1.25 |  |
| 5 | `T-P9` | sonnet | I | 1.25 | `packages/ui/src/components/segmented-control.tsx:25-40` |
| 6 | `T-P8` | sonnet | I | 1.25 | `packages/ui/src/components/dialog.tsx:18-24`, `packages/ui/src/components/sheet.tsx:102-104` |

#### T-E4-17  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 30

```
TASK T-E4-17 — batch B05 (Keyboard, focus and dialog containment) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 30/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:302, 15 lines — read the whole section first):
  E4-17 — **IMPORTANT** — Both keyboard close paths of the shared `Select` that I drove — Escape, and Enter to pick — end with focus dropped to `<body>`
WHAT IS WRONG (the reviewer's words):
  Open the ticket sheet, focus *Assignee*, press Enter (the listbox opens, focus on the selected option), press Escape — or press Enter to pick — and `document.activeElement` is `body`. The keyboard user is thrown out of the sheet to the top of the document. (Tab-away from an open listbox was not driven; the two paths above are the ones a person uses.)
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/ui/src/select/select.tsx:187-190 useOverlay({ isOpen, onClose: state.close, shouldCloseOnBlur: true, isDismissable: true }) — grep FocusScope|restoreFocus|.focus( in the file → 0; the option is DOM-focused in a body portal
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Wrap `SelectPanel`'s content in `<FocusScope restoreFocus autoFocus>` (one import from `@react-aria/focus`), or call `triggerRef.current?.focus()` in the `onClose` passed to `useOverlay`.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, real key events via CDP `press_key`, 1512).** Sequence 1: `trigger.focus()` → `activeElement = button.gn-select__trigger`; **Enter** → `[role=listbox]` present, `activeElement = li.gn-select__option "Unassigned"`; **Escape** → listbox gone, sheet still open, **`activeElement = BODY`**. Sequence 2: focus trigger, **Enter**, **Enter** (re-picks the already-selected *Unassigned*, so nothing is written) → listbox gone, **`activeElement = BODY`**. Control in the same session: …
JUDGE'S NOTE: PARTIAL→scored at IMPORTANT, judge opened. Focus drops to <body> on Escape/Enter for the non-searchable mounts; the "every Select mount" scope is false for the three searchable ones (virtual focus, per the verifier). Accessibility, IMPORTANT.
DONE WHEN: A component test asserting the corrected behaviour (role, focus target, key handling) — RED before, GREEN after, named with the ruling id; the package suite is green; `test-cases/` updated in the same commit.
COMMIT: `E4-17: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-17 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-21  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 31

```
TASK T-E4-21 — batch B05 (Keyboard, focus and dialog containment) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 31/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:359, 10 lines — read the whole section first):
  E4-21 — **IMPORTANT** — The searchable `Select` (New-ticket *Type* and *Parent*, the type editor's *Workflow*) has no visible focus indicator: the rule that suppresses the input's outline has no replacement
WHAT IS WRONG (the reviewer's words):
  `.gn-select__trigger--searchable:focus-within { outline: 2px solid var(--gn-focus-ring); outline-offset: 1px; }` beside the suppression, or drop the suppression.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ui.css:2474 .gn-select__trigger--searchable input:focus { outline: none; } — the only focus rule for that input; the trigger div has no tabIndex; 3 of 3 mounts are searchable
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `.gn-select__trigger--searchable:focus-within { outline: 2px solid var(--gn-focus-ring); outline-offset: 1px; }` beside the suppression, or drop the suppression.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, New-ticket dialog, 1512).** `input[role=combobox]` focused: `input.matches(':focus-visible')` → **true**; `outline-style: none`; the wrapping `div.gn-select__trigger.gn-select__trigger--searchable.gn-field__input` → `outline-style: none`, `box-shadow` unchanged from its resting neo inset (`rgba(176,152,132,0.6) 4px 4px 9px inset, …`), `:focus-within` true. Control in the same dialog: the bare Title input focused → `outline: auto 1px rgb(0,95,204)` (the UA ring). Source: …
JUDGE'S NOTE: VALID, judge opened. No visible focus indicator on the searchable Select, IMPORTANT. Independent duplicate of exec 1's P23 — both score in full (rules §3).
DONE WHEN: A component test asserting the corrected behaviour (role, focus target, key handling) — RED before, GREEN after, named with the ruling id; the package suite is green; `test-cases/` updated in the same commit.
COMMIT: `E4-21: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-21 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P18  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 37

```
TASK T-P18 — batch B05 (Keyboard, focus and dialog containment) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 37/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec1, docs/lanes/review-ui-exec1.md:527, 19 lines — read the whole section first):
  P18 — **IMPORTANT** ⚠ **r2 NEW** — A client-side navigation announces nothing: no title change, no focus move, no live region
WHAT IS WRONG (the reviewer's words):
  This is a single-page application whose route changes are, to assistive technology, **completely silent**. Three independent signals are all absent, and they are absent together.
THE JUDGE'S LINE (the ruling rests on this; open it):
  next/dist/client/components/app-router.js:423 mounts AppRouterAnnouncer (role=alert) unconditionally — leg 3 ("no live region") is FALSE; the symptom holds because the announcer speaks only on a document.title change and P12 keeps the title static
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A route announcer is the small, standard remedy: on pathname change, set a visually-hidden live region to the new page's heading, or move focus to the `<main>`. In the App Router that is a ~15-line client component in `layout.tsx`. **It also fixes half of P12 incidentally** if it is fed the page name — which is why the two are filed separately and read together.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — three checks, each with its own control.** 1. **Focus does not move.** `grep -rlE "usePathname|useRouter"` over `apps/web/src`, `apps/web/app` and `packages/app-core/src` (excluding tests) → **40 files** use the routing hooks. Of those, the ones that also touch focus number **three**, and every one is a local widget rather than a navigation: `last-project-nav.tsx` (2, a menu), `account-menu.tsx` (3, a menu), and `p/[projectId]/page.tsx` (2, the filters sheet). **The shell itself …
JUDGE'S NOTE: PARTIAL→scored at IMPORTANT, judge accepted the verifier's opened line (a node_modules path the finding's finder missed because pnpm places no next/ at the repo root). Client-side navigation announces nothing — true; the stated mechanism and remedy are inverted. Accessibility, IMPORTANT.
DONE WHEN: A component test asserting the corrected behaviour (role, focus target, key handling) — RED before, GREEN after, named with the ruling id; the package suite is green; `test-cases/` updated in the same commit.
COMMIT: `P18: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P18 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P23  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 38

```
TASK T-P23 — batch B05 (Keyboard, focus and dialog containment) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 38/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec1, docs/lanes/review-ui-exec1.md:636, 21 lines — read the whole section first):
  P23 — **IMPORTANT** ⚠ **r2 NEW** — The searchable Select's input has its focus outline REMOVED and nothing replaces it, so the control has no visible focus indicator
WHAT IS WRONG (the reviewer's words):
  `ui.css:2474` sets `.gn-select__trigger--searchable input:focus { outline: none; }`. Nothing in the product supplies a ring for that control in its place. **WCAG 2.2 §2.4.7 *Focus Visible* is Level AA** — *"any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible"* — and here the indicator is not merely absent by default, it is **removed by the product's own CSS**, so no user-agent default can survive it.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ui.css:2474 .gn-select__trigger--searchable input:focus { outline: none; } — no :focus-visible rule for that input (verifier control: :focus-visible exists elsewhere in the file at 714/1338/4061/4771)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A ring for the control, in the place the product already uses for this exact shape: `.gn-select__trigger--searchable:focus-within { outline: 2px solid var(--gn-focus-ring); outline-offset: 1px; }` — `:focus-within` on the **div** is what matches when the inner input has focus, and `outline-offset: 1px` is `.gn-field__input`'s own value so the two branches look identical. One rule; and it is the same move `globals.css:1160-1164` already makes.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — every step opened, because this is the finding I would most expect to be wrong.** 1. **The removal.** `ui.css:2474`, exactly as quoted. It is the **only** `outline: none` in `ui.css` (`grep -cE 'outline:\s*(none|0)'` → **1**) and one of only two in the product; the other is `globals.css:1160`, which *does* replace it (below). 2. **The element that wears it.** `select.tsx:427-433`: the searchable branch renders `<div className={props.multiple ? '… --searchable … --multiple …
JUDGE'S NOTE: VALID, judge opened. Keyboard focus made invisible on the searchable select = accessibility failure, IMPORTANT.
DONE WHEN: A component test asserting the corrected behaviour (role, focus target, key handling) — RED before, GREEN after, named with the ruling id; the package suite is green; `test-cases/` updated in the same commit.
COMMIT: `P23: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P23 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P9  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 41

```
TASK T-P9 — batch B05 (Keyboard, focus and dialog containment) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 41/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec1, docs/lanes/review-ui-exec1.md:271, 15 lines — read the whole section first):
  P9 — **IMPORTANT** — `SegmentedControl` carries full ARIA tab semantics and implements none of the tab keyboard model
WHAT IS WRONG (the reviewer's words):
  `role="tablist"` + `role="tab"` + `aria-selected`, with no `tabpanel`, no `aria-controls`, no arrow-key handling and no roving `tabindex`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  segmented-control.tsx:25 <div role="tablist" aria-label={ariaLabel} …> / :31 role="tab" — grep onKeyDown|ArrowLeft|ArrowRight|tabIndex in the file → 0
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  If these are view switches, `role="tablist"` is the wrong role: a group of buttons with `aria-pressed` needs no keyboard model beyond Tab. If they really are tabs, they need the keyboard model and a `tabpanel` to point at. Either is small; the current shape takes the semantics and skips the contract.
HOW IT WAS MEASURED (reproduce this before and after):
  `packages/ui/src/components/segmented-control.tsx:25-40`: the container is `<div role="tablist" aria-label={…}>` and each option is `<button role="tab" type="button" aria-selected={on} …>`. `grep -n "onKeyDown\|Arrow\|tabIndex\|aria-controls\|tabpanel"` on that file → **NONE** (positive control in the same command: `Escape` is found in `dialog.tsx`/`sheet.tsx`). Per WAI-ARIA's tabs pattern a `tablist` requires arrow-key navigation between tabs, a roving tabindex, and the tab↔tabpanel …
JUDGE'S NOTE: VALID, judge opened. Tab semantics declared, tab keyboard model absent = accessibility failure, IMPORTANT (7 JSX sites per the verifier).
DONE WHEN: A component test asserting the corrected behaviour (role, focus target, key handling) — RED before, GREEN after, named with the ruling id; the package suite is green; `test-cases/` updated in the same commit.
COMMIT: `P9: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P9 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P8  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 79

```
TASK T-P8 — batch B05 (Keyboard, focus and dialog containment) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 79/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec1, docs/lanes/review-ui-exec1.md:239, 31 lines — read the whole section first):
  P8 — **MINOR (product) / IMPORTANT (follow-on)** ⚠ **r2 REVISION** — `Dialog` and `Sheet` declare `aria-modal="true"`, and the missing containment is RECORDED as a named follow-on that the remedy already exists for
WHAT IS WRONG (the reviewer's words):
  Both modal components tell assistive tech that the rest of the document is inert. Neither moves focus into the dialog, traps it, or restores it on close — and no focus trap or `inert` attribute exists anywhere in the product.
THE JUDGE'S LINE (the ruling rests on this; open it):
  board.tsx:394-396 "(Dropping `aria-modal`'s focus escape itself is the shared `Dialog`'s business — it ships no focus trap and no portal — and is recorded as a named follow-on"
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either implement containment — move focus to the dialog on open, restrict Tab to it, restore focus to the opener on close — or drop `aria-modal` to `role="dialog"` alone and be honest about it. The second is one attribute and is not a worse product; the current state is the only one that is *wrong*, because it asserts the property rather than merely lacking it.
HOW IT WAS MEASURED (reproduce this before and after):
  - `packages/ui/src/components/dialog.tsx:18-24`: `role="dialog" aria-modal="true"` on the `<section>`. Its only effect is an Escape keydown listener (`:6-13`). No focus call, no `tabIndex`, no trap. - `packages/ui/src/components/sheet.tsx:102-104`: the same three attributes, same shape; the ticket sheet renders this component. - **The search I ran finds no containment:** `grep -rn "inert\|focus-trap\|focusTrap\|trapFocus"` over `packages apps` (excluding `node_modules`/`dist`/tests) returns …
JUDGE'S NOTE: VALID at IMPORTANT, judge opened. aria-modal="true" with no containment is an accessibility failure; the deferral is a recorded follow-on and the finding argues against it with consequences (the :385-393 refusal, cases 13.445/13.446) — rules §3 category-2-with-argument.
DONE WHEN: A component test asserting the corrected behaviour (role, focus target, key handling) — RED before, GREEN after, named with the ruling id; the package suite is green; `test-cases/` updated in the same commit.
COMMIT: `P8: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P8 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B06 — New-ticket and Move dialogs  ·  lane UX  ·  session model **sonnet**  ·  backend **deepseek**  ·  12 tasks  ·  ~7.4 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec2` · branch `rel/b06-new-ticket-and-move-dialogs` · packages touched: @gisik-nokma/app-core, @gisik-nokma/domain, @gisik-nokma/rule-engine, @gisik-nokma/ui.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E2-21` | sonnet | I | 1.25 |  |
| 2 | `T-E2-40` | sonnet | I | 1.25 | `packages/rule-engine/src/rules/require-field.ts:5-18` |
| 3 | `T-E5-7` | sonnet | I | 1.25 |  |
| 4 | `T-V10` | sonnet | I | 1.25 |  |
| 5 | `T-E5-16` | sonnet | I | 1.25 | `packages/domain/src/ticket-types.ts:139` |
| 6 | `T-E5-20` | sonnet | I | 1.25 | `packages/ui/src/components/sheet.tsx:76`, `packages/ui/src/components/dialog.tsx:6-13`, `packages/ui/src/components/sheet.tsx:56-90` |
| 7 | `T-E5-9` | sonnet | I | 1.25 |  |
| 8 | `T-V8` | sonnet | I | 1.25 |  |
| 9 | `T-E2-22` | sonnet | M | 0.6 | `packages/app-core/src/workflow-builder/ui/publish-controls.tsx:64-65` |
| 10 | `T-E2-33` | sonnet | M | 0.6 | `packages/ui/src/select/select.tsx:250` |
| 11 | `T-E2-34` | sonnet | M | 0.6 | `packages/app-core/src/views/create-ticket-flow.tsx:250-253`, `packages/ui/src/components/dialog.tsx:1-24` |
| 12 | `T-E2-37` | sonnet | M | 0.6 | `packages/app-core/src/views/new-ticket-dialog.tsx:96`, `packages/app-core/src/views/new-ticket-dialog.tsx` |

#### T-E2-21  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 58

```
TASK T-E2-21 — batch B06 (New-ticket and Move dialogs) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 58/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:1328, 40 lines — read the whole section first):
  E2-21 (r2) — IMPORTANT · A rejected type migration destroys the mapping the admin just authored AND disables the control that would let them retry
WHAT IS WRONG (the reviewer's words):
  `ticket-type-editor-screen.tsx:269-284`: ``` async function onMigrate(target, stateMap) { if (outgoingWorkflow === null) return; setRebind({ phase: 'migrating', toWorkflowId: target.id }); const outcome = await gateway.migrateTypeToWorkflow({ … stateMap … }); // no try / no catch … } ``` The call site is `:551` `onConfirm={(stateMap) => void onMigrate(pendingTarget, stateMap)}` — a `void`, so a rejection is discarded entirely. Three things then hold at once:
THE JUDGE'S LINE (the ruling rests on this; open it):
  ticket-type-editor-screen.tsx:271 setRebind({ phase: 'migrating' }) before the unguarded await at :272; :546 the mapping dialog mounts only in phase mapping; :485 the Move control stays disabled
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `try`/`catch` around the await, restoring `rebind.phase` to `'mapping'` on rejection and rendering the transport sentence **inside the still-mounted dialog**, so the mapping survives and the admin can retry. The dialog must not unmount until a verdict arrives.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `ticket-type-editor-screen.tsx:269-284` (`onMigrate`, both `setRebind` calls and the unguarded await), `:504-553` (the enable conditions at `:509`, the dialog gate at `:546`, the `void` call site at `:551`).
JUDGE'S NOTE: VALID, judge opened. A rejected migration destroys the authored mapping and disables the retry, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-21: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-21 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-40  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 61

```
TASK T-E2-40 — batch B06 (New-ticket and Move dialogs) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 61/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/rule-engine
FINDING (exec2, docs/lanes/review-ux-exec2.md:2286, 54 lines — read the whole section first):
  E2-40 (r2) — IMPORTANT · A `require-field` move previews as refused for ever, even after the person fills the field its own dialog asked for
WHAT IS WRONG (the reviewer's words):
  `transition-dialog.tsx` renders an input for every field a `require-field` rule names (`:256`, `:401-406`), fails `blocked` until each is filled (`:260-262`, `:364`), and sends them into the submission (`:370-374`). The **preview** beside it is asked a different question: `:281-294` calls `precheckRef.current(toStateId, evidenceAttachmentId)` — **two arguments** — and the sheet's `precheck` is declared `(toStateId: string, evidenceAttachmentId?: string | null)` (`ticket-sheet.tsx:672-675`), building `payload = { to }` plus evidence and nothing else (`:681-684`).
THE JUDGE'S LINE (the ruling rests on this; open it):
  require-field.ts:9 const value = input.ticket.fields[rule.field]?.value; ticket-sheet.tsx:672-684 precheck(toStateId, evidenceAttachmentId?) builds payload {to}(+evidence) — a field typed but not yet sent is unseeable by the preview
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Make the preview ask the same question the submission asks: `transition-dialog.tsx:281-294` calls `precheckRef.current(toStateId, evidenceAttachmentId)` with two arguments while the submission (`:370-374`) also sends the `require-field` values. Pass the filled field values into the precheck (extend the precheck signature in `ticket-sheet.tsx` where it is defined) so that once every required field is filled the preview turns from refused to allowed. Add a component test: rule requires field X; type a value; the preview no longer says refused.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `transition-dialog.tsx:250-262` (the rules, `requiredFields`, `missingFields` and the shared predicate), `:281-294` (the preview call and its deps), `:360-364` (`blocked`), `:370-374` and `:401-406` (the submission and the inputs), `:477-481` (the rendered preview refusal); `ticket-sheet.tsx:672-692` (the `precheck` signature and payload), `:705-719`; `packages/rule-engine/src/rules/require-field.ts:5-18`; `apps/server/src` walked for `require-field` → 0.
JUDGE'S NOTE: VALID, judge opened. The move previews as refused after the person fills the field its dialog asked for, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-40: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-40 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-7  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 74

```
TASK T-E5-7 — batch B06 (New-ticket and Move dialogs) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 74/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:406, 36 lines — read the whole section first):
  E5-7 — IMPORTANT · With a comment typed and Move enabled, the dialog still says *"none was provided"* — the exact defect the file records as fixed for `require-evidence`, unfixed for `require-comment` `[BROWSER]` `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  Open `CCSO-3` → `Move…` → choose `Done`. The dialog shows `Comment (required by this transition)` and, before any keystroke, *"instant check — require-comment: This move must carry a comment explaining it, and none was provided."* Type `review note`. **Move becomes enabled (`moveDisabled: false`) and the refusal sentence stays.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  transition-dialog.tsx:294 the preview re-runs on [toStateId, evidenceAttachmentId] only; :360-364 blocked clears on the typed comment; :477-481 the preview still prints "none was provided"
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Pass the comment into the candidate (the submission carries it — `TransitionSubmission`) and add it to the effect's dependencies, exactly as the evidence fix did; or render the `require-comment` preview as the field's requirement (*"This move needs a comment"*) and not as a refusal.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` JS on the open dialog: after `select` change to `Done` and `textarea` input `'review note'`: `{moveDisabled: false, text: "… instant check — require-comment: … and none was provided. …"}`. `[SOURCE]` `transition-dialog.tsx:127-143`, `:281-296`, `:360-364`, `:477-481`; `ticket-sheet.tsx:673-692`.
JUDGE'S NOTE: VALID, judge opened. With a comment typed and Move enabled the dialog still refuses in preview — the evidence fix was never extended to the comment, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-7: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-7 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-V10  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 80

```
TASK T-V10 — batch B06 (New-ticket and Move dialogs) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 80/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:978, 38 lines — read the whole section first):
  V10 — CRITICAL · "Create" has no re-entrancy guard, and each call mints a fresh id: a double press files two tickets
WHAT IS WRONG (the reviewer's words):
  `new-ticket-dialog.tsx:278-306` — `disabled={title.trim() === '' || typeId === ''}` and nothing else. The dialog's four `useState` calls (`:96-106`) contain **no in-flight latch**. Its `onCreate` reaches `create-ticket-flow.tsx:208`, which at `:212` mints `entity: { kind: 'ticket', id: newUlid() }` **per call** and submits at `:244`. Two presses are two distinct `ticket.created` events with two distinct ids — **two tickets**, in an append-only ledger.
THE JUDGE'S LINE (the ruling rests on this; open it):
  new-ticket-dialog.tsx:280 disabled={title.trim() === '' || typeId === ''} — the only gate; create-ticket-flow.tsx:212 id: newUlid() per call, :244-246 dialog closes only on committed; grep submitting|useRef|inFlight in the dialog → 0 lines
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A `submittingRef` set synchronously at the top of `create()` — the exact shape the composer adopted after measuring — plus `disabled={… || submitting}` so the button states the state. If creating two tickets from two presses is genuinely wanted, the dialog should say so and the two should be labelled; silently filing a duplicate is not a design.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `new-ticket-dialog.tsx:96-106` (the state) and `:278-306` (the control); `create-ticket-flow.tsx:208-248` (`newUlid()` per call at `:212`, submit at `:244`, close only on `committed` at `:245-248`); `TicketEditorSlot.tsx:128-136` (the measured precedent).
JUDGE'S NOTE: VALID, judge opened. Two presses in flight file two tickets. Severity IMPORTANT not CRITICAL: a duplicate ticket is wrong behaviour a person meets, not data loss or a bypass (soft-delete exists); the composer precedent at TicketEditorSlot.tsx:128-136 is quoted accurately.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `V10: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-V10 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-16  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 102

```
TASK T-E5-16 — batch B06 (New-ticket and Move dialogs) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 102/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/domain
FINDING (exec5, docs/lanes/review-ux-exec5.md:702, 37 lines — read the whole section first):
  E5-16 — IMPORTANT · "New ticket" pre-selects **Epic** — the top of the hierarchy — and a mis-filed type cannot be changed afterwards; the export pre-selects the everyday type `[BROWSER]` `[SOURCE]` — category 3
WHAT IS WRONG (the reviewer's words):
  Press `New ticket` on the board: the `Type` combobox opens with `value="Epic"` (`[BROWSER]`, the input's painted value), `Parent` = `None (project root)`, `Create` disabled until a title. A person who types a title and presses Create files an **Epic**. `new-ticket-dialog.tsx:97` `useState(typeOptions[0]?.id ?? '')`; `typeOptions` is the workspace's types in rank order (`page.tsx:1482-1485`), so the default is always rank 1 = Epic. The export's form defaults to `type: "Defect"` (`EXPORT:2216`), the SECOND type in its ladder (`:2274-2282`), not the first.
THE JUDGE'S LINE (the ruling rests on this; open it):
  new-ticket-dialog.tsx:97 useState(typeOptions[0]?.id ?? ''); p/[projectId]/page.tsx:1482-1485 typeOptions = BUILTIN_TYPE_LADDER when types are unread, whose [0] is domain ticket-types.ts:139 { id: 'epic', … rank: 1 }; the export (:2216) pre-selects Defect
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Default to the deepest-legal or most-used type (the subtask form already defaults to the deepest legal type — `exec1-P5`'s ruling records that choice), or to no selection with `Create` disabled until one is made — the pattern the Move dialog already uses (`Choose a state`).
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` dialog inputs: `{label: "Type", role: "combobox", value: "Epic"}`; `[SOURCE]` lines above; `EXPORT:2216`, `:2274-2282`. **Both paths default to Epic:** the loaded path is the workspace's rank order (rank 1 = Epic on `/settings`); the loading fallback `BUILTIN_TYPE_LADDER` (`page.tsx:133`) maps `BUILTIN_TICKET_TYPE_SEEDS`, whose first entry is `{ id: 'epic', name: 'Epic', rank: 1 }` (`packages/domain/src/ticket-types.ts:139`). The combobox paints the NAME of `typeId` …
JUDGE'S NOTE: VALID, judge opened. "New ticket" pre-selects the top of the hierarchy and a mis-filed type cannot be changed afterwards, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-16: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-16 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-20  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 104

```
TASK T-E5-20 — batch B06 (New-ticket and Move dialogs) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 104/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec5, docs/lanes/review-ux-exec5.md:816, 40 lines — read the whole section first):
  E5-20 — IMPORTANT · One Escape in the Move dialog closes the ticket sheet under it — the `Sheet`'s own guard says a child must `preventDefault()`, and its sibling `Dialog` does not `[SOURCE]` `[BROWSER: the stacked pair observed]` (verifies exec 2 §2e's "two `aria-modal` dialogs … one Escape closing both", unmeasured there)
WHAT IS WRONG (the reviewer's words):
  With `CCSO-3` open, `Move…` mounts `TransitionDialog` (`ticket-sheet.tsx:2624`) → `Dialog` (`transition-dialog.tsx:382`); the DOM then holds **two** `role="dialog"` elements (`[BROWSER]` `dialogs: 2`, `aria-modal="true"` on the Move dialog). `packages/ui/src/components/dialog.tsx:6-13`: a document-level `keydown` that calls `onClose()` on `Escape` **with no `preventDefault()`**. `packages/ui/src/components/sheet.tsx:56-90`: a document-level `keydown` that closes the sheet on `Escape` unless `event.defaultPrevented` — and its docblock is explicit: *"A child that handles Escape must call `preventDefault()` for this guard to see it."* The Sheet's listener was registered first (the sheet mounted first), so on one Escape it runs first, sees `defaultPrevented === false`, and calls the sheet's `onClose`; then the dialog's listener closes the dialog. (The order does not matter: neither handler …
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/ui/src/components/sheet.tsx:76 "A child that handles Escape must call `preventDefault()` for this guard to see it"; :87-88 if (event.defaultPrevented) return; if (event.key === 'Escape') onClose(); — dialog.tsx:9 handles Escape and never calls preventDefault (grep → 0)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `Dialog`'s handler calls `event.preventDefault()` after `onClose()` — one line — so the Sheet's guard sees it; or the Sheet listens on its own root instead of `document`.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `dialog.tsx:6-13` (opened: no `preventDefault`), `sheet.tsx:56-90` (opened: the guard and its contract), `ticket-sheet.tsx:2624`, `transition-dialog.tsx:382`, `create-ticket-flow.tsx:246-256`, `:359-372`. `[BROWSER]` the pair was observed open together; **the Escape itself was not pressed with both open** — the browser became unusable before I returned to it (§6.1). `grep -n Escape packages/app-core/test/views/ticket-sheet.test.tsx` → only `16.86` (the title field); no case presses …
JUDGE'S NOTE: VALID, judge opened. One Escape in the Move dialog also closes the sheet under it, against the Sheet's own documented contract, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-20: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-20 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-9  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 111

```
TASK T-E5-9 — batch B06 (New-ticket and Move dialogs) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 111/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:473, 40 lines — read the whole section first):
  E5-9 — IMPORTANT · A refused Delete answers five screens above the button that was pressed `[BROWSER]` `[SOURCE]` — and this is the measured consequence the ruling on "offered to everyone" did not weigh
WHAT IS WRONG (the reviewer's words):
  `Delete` sits in the sheet's footer (`ticket-sheet.tsx:2612-2621`), `position: static` at the END of the scrolling body. Its refusal renders in the shared answer slot (`:1961-1965`, `gn-refusal--server`) directly under the tab bar. `[BROWSER]` measured on `CCSO-3`: `.gn-sheet__body` is the scroll container, `clientHeight 756`, `scrollHeight 4036`; the footer's top is **3,943 px below the tab bar**. A person scrolls to the bottom, presses Delete, is refused, and the answer lands ~5 viewports above them.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ticket-sheet.tsx:1961-1963 the server-refusal slot (role=alert) sits at the top of the one scrolling body; :2612-2614 the footer Delete is at its bottom; the ruling docblock :1198-1200 chose "the engine's own refusal … rather than a button that silently is not there" — it rules the choice, not the placement
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either render Delete's refusal beside Delete (a footer-local slot, as `TransitionDialog` has its own), or ask `check-permission`'s check 6 before offering — the New-ticket precedent — and withhold with a sentence. The no-confirmation shape MATCHES the export (`EXPORT:3794-3799`: filter + undo toast) and is not part of this finding.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` JS: `{scrollContainer: "gn-sheet__body", scrollH: 4036, clientH: 756, footerPosition: "static", footerOffsetFromTabs: 3942.8}`. `[SOURCE]` `:1192-1200`, `:1961-1965`, `:2612-2621`, `:1925-1940` opened.
JUDGE'S NOTE: VALID, judge opened. A refused Delete answers five screens above the button (lane painted 3943 px); the recorded ruling is engaged, not contradicted. IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-9: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-9 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-V8  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 119

```
TASK T-V8 — batch B06 (New-ticket and Move dialogs) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 119/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:917, 34 lines — read the whole section first):
  V8 — IMPORTANT · Opening any parent ticket raises a false "this list is not shown rather than shown short" alert
WHAT IS WRONG (the reviewer's words):
  `ticket-sheet.tsx:1278-1283` computes `subtaskRows = subtasks.data ?? []` and `subtasksIncomplete = ticketRead.rollup !== null && subtaskRows.length !== subtaskExpected`, where `subtaskExpected` comes from the **ticket** read's rollup. When the ticket read lands, the subtasks query's key changes — `:591` `const subtasksKey = \`${ticketId}:subtasks:${read.data?.ticket.projectId ?? ''}\`` — and `useLiveQuery` **resets `data` to `null` on every key change** (`use-live-query.ts:95`). So for the whole second round trip, `subtaskRows` is `[]` while `subtaskExpected` is the real child count, and `subtasksIncomplete` is true. The section then renders, as a **`role="alert"`** (`ticket-sheet.tsx:2216-2226`): *"The server counts N subtasks you can see, and 0 could be read — so this list is not shown rather than shown short."*
THE JUDGE'S LINE (the ruling rests on this; open it):
  ticket-sheet.tsx:1283 subtasksIncomplete = ticketRead.rollup !== null && subtaskRows.length !== subtaskExpected; use-live-query.ts:91-98 (verifier) setData(null) when the query key changes as the ticket read lands
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Gate the reconciliation on `subtasks.data !== null`: while unread, render nothing; raise the alert only when a read **that has answered** disagrees with the server's count. A strictly narrower condition, and it keeps the property the section exists for — a short list is never drawn silently.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `ticket-sheet.tsx:585-593` (the key and its rationale), `:1278-1283` (the comparison), `:2216-2226` (the alert); `use-live-query.ts:41-42` (`useState<T | null>(null)`) and `:91-98` (`setData(null)` before each new question, in the effect whose deps include the key).
JUDGE'S NOTE: VALID, judge opened :1283; the null-reset window rests on the verifier's opened line. A false role=alert on every ordinary parent-ticket load, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `V8: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-V8 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-22  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 120

```
TASK T-E2-22 — batch B06 (New-ticket and Move dialogs) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 120/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:1369, 27 lines — read the whole section first):
  E2-22 (r2) — MINOR · The state-mapping dialog is unmounted by the act of submitting, so a refusal costs the admin the mapping
WHAT IS WRONG (the reviewer's words):
  `packages/app-core/src/workflow-builder/ui/publish-controls.tsx:64-65`: `submitPayload` begins `setState({ phase: 'submitting' })`. `:117` renders the dialog only while `state.phase === 'mapping'`, so submitting removes the surface that holds the mapping — before any verdict exists. `state-mapping-dialog.tsx:46` keeps that mapping in `const [mapping, setMapping] = useState<Record<string, string>>({})`, which dies with the unmount, and `:126` passes it onward as `onConfirm={(mapping) => void submitPayload(mapping)}` — a `void`, so a rejection is discarded too.
THE JUDGE'S LINE (the ruling rests on this; open it):
  publish-controls.tsx:65 setState({ phase: 'submitting' }) before the await; :117 the mapping dialog mounts only in phase 'mapping'; state-mapping-dialog.tsx:46 mapping held locally
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Keep the dialog mounted through `submitting` and render the in-flight and refused states inside it, dismissing only on `committed`. One phase value; the dialog is already the surface in view.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `publish-controls.tsx:55-126` (the phase machine `:58`, `setState` at `:65`, the switch at `:75-86`, the gate at `:117`, the `void` at `:126`); `state-mapping-dialog.tsx:44-46` and `:82`.
JUDGE'S NOTE: VALID, judge opened. A refusal unmounts the dialog and costs the admin the mapping. The verifier would raise it to IMPORTANT; the judge scores at the CLAIMED severity by policy (no upward re-grading), noting the verifier's view.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-22: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-22 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-33  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 139

```
TASK T-E2-33 — batch B06 (New-ticket and Move dialogs) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 139/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec2, docs/lanes/review-ux-exec2.md:1889, 88 lines — read the whole section first):
  E2-33 (r2) — IMPORTANT · Three dialogs seed a choice once from a prop and guard it by emptiness rather than membership, so a later prop change leaves the screen and the payload disagreeing
WHAT IS WRONG (the reviewer's words):
  **Measured structural fact first: all three files contain ZERO `useEffect` occurrences** — `new-ticket-dialog.tsx` 0, `reopen-dialog.tsx` 0, `visibility-editor.tsx` 0. So every `useState` initialiser in them runs once, and no prop change is ever re-read.
THE JUDGE'S LINE (the ruling rests on this; open it):
  new-ticket-dialog.tsx:97 const [typeId, setTypeId] = useState(typeOptions[0]?.id ?? '') — seeded once, guarded by emptiness (:280)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Re-seed on the list's identity change (a `useEffect` keyed on `typeOptions`/`reopenStates`, or a `key` on the dialog), and gate the submit on membership (`!options.some(o => o.id === typeId)`) rather than on emptiness. For (c), reconcile the seeded values when `current` changes, so the fieldset cannot outlive the sentence it contradicts.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `new-ticket-dialog.tsx:96-106` (the four `useState`, no latch) and `:96-118` (the seed and `noUsableParent`), `:280`; `page.tsx:1482-1485`; `packages/ui/src/select/select.tsx:250,255`; `reopen-dialog.tsx:55-64` and `:102`; `visibility-editor.tsx:237-238`, `:330`, `:379-414`. `useEffect` counts per file are the grep above.
JUDGE'S NOTE: PARTIAL→MINOR, judge opened. The structure holds; the verifier showed the only arm claimed on the ordinary path is false. Scored below the claimed severity.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-33: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-33 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-34  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 140

```
TASK T-E2-34 — batch B06 (New-ticket and Move dialogs) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 140/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:1978, 54 lines — read the whole section first):
  E2-34 (r2) — MINOR · Two `aria-modal` dialogs open at once, and one Escape press closes both
WHAT IS WRONG (the reviewer's words):
  `packages/app-core/src/views/create-ticket-flow.tsx:250-253` — when the server answers `needs-reopen`, the flow opens the reopen offer **and returns without closing the New-ticket dialog**: ``` if (outcome.kind === 'needs-reopen' && draft.parentId !== null) { await openReopenPrompt(childEvent, draft.parentId, outcome.refusal, 'server'); return; } ``` `dialogOpen` is untouched, and both surfaces render from the same fragment: `:360` `<NewTicketDialog open={dialogOpen} … />` and `:371` `<ReopenDialog open … />`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  dialog.tsx:9 if (event.key === 'Escape') onClose(); — every mounted Dialog handles Escape, so two stacked aria-modal dialogs both close
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Close the New-ticket dialog when the offer opens, or render the offer in place of it — one modal at a time is the invariant the primitive assumes. A single document-level Escape listener owned by the topmost dialog would also do it, and would keep hidden state from accumulating.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `create-ticket-flow.tsx:244-256` and `:355-372`; `packages/ui/src/components/dialog.tsx:1-24` (the listener, the scrim's own `onClick={onClose}`, and `aria-modal="true"`).
JUDGE'S NOTE: VALID at the claimed MINOR, judge opened. The "drafted ticket is discarded" half is false (E2-37). The verifier would raise it; no upward re-grading by policy.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-34: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-34 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-37  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 141

```
TASK T-E2-37 — batch B06 (New-ticket and Move dialogs) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 141/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:2145, 25 lines — read the whole section first):
  E2-37 (r2) — MINOR · The New-ticket draft survives its own close, so reopening offers the last ticket's title with Create enabled
WHAT IS WRONG (the reviewer's words):
  `packages/app-core/src/views/new-ticket-dialog.tsx` contains **zero `useEffect`** (measured), so none of its four `useState` values (`:96-106` — `title`, `typeId`, `parentId`, `startInFocus`) is ever reset. The dialog is mounted for the flow's whole life — `create-ticket-flow.tsx:359` `<NewTicketDialog open={dialogOpen} … />` — and both a successful create (`:246 setDialogOpen(false)`) and a Cancel (`:368 onClose={() => setDialogOpen(false)}`) only toggle `open`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/views/new-ticket-dialog.tsx:96 — const [title, setTitle] = useState('');
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Clear the draft when the dialog closes, or key it per opening. ⚠ The mitigation is real and I am pricing it in: the stale title is **visible** in a text input, so a person who looks before typing will notice — which is why this is Minor and not the duplicate-write Critical that `E2-19` is. `E2-19` is a latch that can double-file *inside* one interaction; this needs the person to ignore what is on screen.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `new-ticket-dialog.tsx:96-118` and `:276-306`; `create-ticket-flow.tsx:244-248`, `:355-369`; `useEffect` count for the file is the grep in `E2-33`.
JUDGE'S NOTE: VALID per verifier chunk10 (line opened by the verifier, not the judge): Every cited line exact and the zero count carries a positive control in the same invocation. Both collapse routes checked: no key= on :359 and no conditional render, so useState survives open=false. C
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-37: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-37 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B07 — Soft-delete integrity — engine, replica, list  ·  lane FUNC  ·  session model **opus**  ·  backend **claude-opus (deepseek-capable tasks may be split out to a DeepSeek session)**  ·  7 tasks  ·  ~6.4 h  ·  ⛔ RELEASE CUT AFTER THIS BATCH

Worktree `/Users/kiro/my_projects/gisik-nokma-exec6` · branch `rel/b07-soft-delete-integrity-engine-rep` · packages touched: @gisik-nokma/app-core, @gisik-nokma/rule-engine, @gisik-nokma/server.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E6-24` | sonnet | I | 1.25 | `packages/app-core/src/replica/replica-data-source.ts:798-799`, `packages/app-core/src/replica/replica-data-source.ts`, `apps/desktop/src/app.tsx:140-153` |
| 2 | `T-E6-2` | opus | I | 1.75 | `packages/rule-engine/src/evaluate.ts:67-68`, `packages/domain/src/vocabulary.ts`, `packages/rule-engine/src/evaluate.ts` |
| 3 | `T-E6-4` | opus | I | 1.75 | `packages/rule-engine/src/transition.ts:134` |
| 4 | `T-F2-fn` | opus | I | 1.75 | `apps/server/test/read/soft-delete-background-paths.test.ts:179` |
| 5 | `T-F4-fn` | opus | I | 1.75 | `apps/server/src/routes/my-work.ts:363-366`, `test-cases/16-remaining-doors.md` |
| 6 | `T-F5-fn` | opus | I | 1.75 | `packages/app-core/src/replica/replica-data-source.ts` |
| 7 | `T-E6-11` | sonnet | M | 0.6 | `apps/server/src/routes/list.ts:402`, `apps/server/src/routes/list.ts`, `apps/server/src/routes/tickets.ts` |

#### T-E6-24  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 77

```
TASK T-E6-24 — batch B07 (Soft-delete integrity — engine, replica, list) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 77/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1545, 97 lines — read the whole section first):
  E6-24 — IMPORTANT — The phone's board and the desktop's ticket list keep showing a soft-deleted ticket, and the phone's offline search still finds it: the Delete commit put its replica filter on the two reads those shells never call and on none of the three they do
WHAT IS WRONG (the reviewer's words):
  Measured on the replica `DataSource` (probe in Appendix AF; 1 file / 1 test passed, with a positive control). One world, two tasks, one `ticket.deleted` applied through `replica.applyServerItem` (the fold sets `state.deleted = {actorId, at}` — printed), then the five view-serving reads of `packages/app-core/src/replica/replica-data-source.ts` before and after:
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/replica/replica-data-source.ts:798-799 listTicketSummaries pushes every confirmed ticket with no deleted conjunct, against :996 in the same file which has one (the control); myWork :1323-1329 and search :1357-1366 likewise (verifier)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The same conjunct, `(state.deleted ?? null) === null`, in `listTicketSummaries`' loop (one line, `:798`) — which fixes `myWork` with it, since `myWork` is a filter over those summaries — and in `searchLocal`'s title scan and comment-owner lookup (`replica.ts:1192-1195`, `:1205-1207`); plus the deleted-ticket fixture F5 asked for, asserting all five reads, so the next read added to this file cannot pass without answering the question.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix AF, run from `packages/app-core` with `pnpm exec vitest run test/zz-exec6-probe-replica-deleted.test.ts --no-file-parallelism` (the file imports `../src/replica/replica-data-source.js` relatively — the same instrument F5 validated; `@gisik-nokma/sync-client` resolves to its `dist`, and the dist was checked with a code-only needle rather than trusted: `grep -c "SELECT ticket_id FROM tickets WHERE workspace_id = ? ORDER BY ticket_id" packages/sync-client/dist/replica/replica.js` → 1, the …
JUDGE'S NOTE: VALID, judge opened. The phone board, the desktop list and the offline search keep showing soft-deleted tickets — three of five replica reads lack the filter the commit message promised for every read, IMPORTANT.
DONE WHEN: A test in the owning package reproduces the defect, RED before and GREEN after (named with the ruling id); the package suite is green; `Features.md` and `test-cases/` updated in the same commit when the behaviour is user-observable.
COMMIT: `E6-24: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-24 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-2  ·  opus  ·  IMPORTANT  ·  ~1.75 h  ·  rank 90

```
TASK T-E6-2 — batch B07 (Soft-delete integrity — engine, replica, list) — model opus — backend claude-opus — effort ~1.75 h — judged IMPORTANT — rank 90/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/rule-engine
FINDING (exec6, docs/lanes/review-functionality-exec6.md:396, 104 lines — read the whole section first):
  E6-2 — IMPORTANT — The ingest door accepts every ordinary write against an already soft-deleted ticket, and `ticket.assigned` on one manufactures an inbox notification that points at a 404
WHAT IS WRONG (the reviewer's words):
  Through the product's own door (`POST /v1/events`, session-authenticated, owner actor), against a ticket whose detail door already answers **404** and whose comments door answers **404**, the server **commits** `ticket.assigned`, `comment.added`, `ticket.transitioned`, `ticket.field_set` (title), `ticket.collaborator_added` and `visibility.set` — **byte-identical answers to the same eight-event battery run against a live ticket in the same run** (the two refusals, `ticket.closed` → `close-requires-terminal` and `ticket.ranked` → `rank-requires-backlog`, are state-of-workflow refusals and fire identically on the live control). Afterwards `proj_tickets` for the deleted ticket reads `{state_id: "doing", deleted_at: <set>, assignee_id: <peer>}`. And the `ticket.assigned` fanout inserted an `assignment` row for the peer, which `GET /v1/me/notifications` **serves** to the peer (200, …
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/rule-engine/src/evaluate.ts:67-68 default: return { refused: false }; — no live-ticket guard on the ingest path (deletion.ts:64/:85 are the only flag reads)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One rule, in the engine where the deleted flag is already read: a ticket-scoped event other than `ticket.restored` (and `ticket.deleted` itself, which already refuses) is refused with a `ticket.deleted`-family rule (*"This ticket is deleted; restore it first"*) — `checks/deletion.ts` already has the lookup and the refusal vocabulary (`REFUSAL_RULES.alreadyDeleted`). That closes all six types on all three doors at once, and it makes the fanout's premise true rather than asserted. The pass-through types (`comment.added`, `ticket.assigned`, `collaborator_*`, `visibility.set`, `attachment.added`) need a dispatch arm; today they have none. Then rewrite `fanout.ts:101-107` to say what is true.
HOW IT WAS MEASURED (reproduce this before and after):
  Probe file (verbatim in Appendix A), run once, 1 file / 1 test passed, raw output through `rtk proxy` (rtk's filter had swallowed the console lines on the first run): ``` cd apps/server && pnpm exec vitest run test/zz-exec6-probe-deleted-writes.test.ts --no-file-parallelism PROBE detail(deleted)=404 detail(live)=200 PROBE answers: (deleted ticket) PROBE LIVE control answers: ticket.assigned -> committed committed comment.added -> committed committed ticket.transitioned -> committed committed …
JUDGE'S NOTE: VALID, judge opened (reproduction is a mutation; verified by reading, as the lane recorded). Every ordinary write against a soft-deleted ticket is accepted and ticket.assigned on one manufactures an inbox notification, IMPORTANT.
DONE WHEN: A rule-engine/server test reproduces the defect through the real door (ingest or route), RED before and GREEN after; the package suite is green; the invariant is stated in one sentence in the check's docblock; `test-cases/` gains or flips the case in the same commit.
COMMIT: `E6-2: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-2 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-4  ·  opus  ·  IMPORTANT  ·  ~1.75 h  ·  rank 91

```
TASK T-E6-4 — batch B07 (Soft-delete integrity — engine, replica, list) — model opus — backend claude-opus — effort ~1.75 h — judged IMPORTANT — rank 91/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/rule-engine
FINDING (exec6, docs/lanes/review-functionality-exec6.md:560, 66 lines — read the whole section first):
  E6-4 — IMPORTANT — A soft-deleted open child blocks its parent's close with a refusal about a child no view can show; and new children can be created under, or moved to, a soft-deleted parent
WHAT IS WRONG (the reviewer's words):
  Measured through `POST /v1/events` (probe in Appendix C; 1 file / 1 test passed, with controls):
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/rule-engine/src/transition.ts:134 children.filter((child) => child.stateCategory !== 'terminal') — category alone; grep deleted in checks/hierarchy.ts → 0
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  In `transition.ts:134`, `child.stateCategory !== 'terminal' && (child.deleted ?? null) === null` — a deleted child is not open work, which is the sentence the refusal is about. In `hierarchy.ts:123`/`:249`, refuse a deleted parent with a rule of its own (*"That ticket is deleted; restore it or pick another parent"*) — the check already refuses an unknown one. Both are one-line and both are covered by fixtures the harness can express (Appendix B shows the shape).
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix C; run from `apps/server` (`pnpm exec vitest run test/zz-exec6-probe-children.test.ts --no-file-parallelism`, `rtk proxy` for raw output). Lines opened: `transition.ts:134`; `projections/tickets.ts:214-235`, `:263`; `hierarchy.ts:123`, `:249`; `routes/tickets.ts:419-431`; `visibility/rollup.ts:258-266`.
JUDGE'S NOTE: VALID, judge opened. A soft-deleted open child blocks its parent's close with a refusal about a child no view can show, and new children can be created under a deleted parent, IMPORTANT.
DONE WHEN: A rule-engine/server test reproduces the defect through the real door (ingest or route), RED before and GREEN after; the package suite is green; the invariant is stated in one sentence in the check's docblock; `test-cases/` gains or flips the case in the same commit.
COMMIT: `E6-4: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-4 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F2-fn  ·  opus  ·  IMPORTANT  ·  ~1.75 h  ·  rank 92

```
TASK T-F2-fn — batch B07 (Soft-delete integrity — engine, replica, list) — model opus — backend claude-opus — effort ~1.75 h — judged IMPORTANT — rank 92/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:200, 53 lines — read the whole section first):
  F2 — IMPORTANT — A recorded survivor measurement's stated warrant is false: the second witness read a stale `dist`
WHAT IS WRONG (the reviewer's words):
  `apps/server/test/read/soft-delete-background-paths.test.ts:179` justifies the trustworthiness of the (c) survivor measurement in these words:
THE JUDGE'S LINE (the ruling rests on this; open it):
  soft-delete-background-paths.test.ts:177-180 "that test imports `../../src/replica/replica-data-source.js`, not the package name, so nothing resolved through a stale dist" — the verifier: dual-client resolves via dist (exports, no alias) and dist/.../replica-data-source.js:696 still carries the gate, so the 21/0 half could not fail
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either (i) run `pnpm turbo run build` before the `dual-client` half and say so, or (ii) cite the app-core half alone — it is the half that is valid and it is sufficient. The sentence as written names the wrong test for the property it claims, and it is the **only** reason a reader is told to trust the number.
HOW IT WAS MEASURED (reproduce this before and after):
  As above: the two import lines read directly; `dist` mtime vs `src` mtime via `stat -f`; the `grep -rnE` over `apps/server/test` returning 0 with a positive control on the same command (`grep -rn "from '@gisik-nokma/app-core'" apps/server/test/` → 3 files).
JUDGE'S NOTE: VALID, judge opened. A recorded survivor measurement rests on a false warrant = a check that could not fail, IMPORTANT.
DONE WHEN: A rule-engine/server test reproduces the defect through the real door (ingest or route), RED before and GREEN after; the package suite is green; the invariant is stated in one sentence in the check's docblock; `test-cases/` gains or flips the case in the same commit.
COMMIT: `F2: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F2-fn | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F4-fn  ·  opus  ·  IMPORTANT  ·  ~1.75 h  ·  rank 93

```
TASK T-F4-fn — batch B07 (Soft-delete integrity — engine, replica, list) — model opus — backend claude-opus — effort ~1.75 h — judged IMPORTANT — rank 93/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:309, 30 lines — read the whole section first):
  F4 — MEDIUM — `routes/my-work.ts:364`, the contested-claim title gate, is a confirmed open gap
WHAT IS WRONG (the reviewer's words):
  `apps/server/src/routes/my-work.ts:363-366` gates a contested claim's title on `row.deleted_at === null && (await canSee(db, viewerId, row.ticket_id))`. Nothing in the server suite constrains the `deleted_at` half.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/routes/my-work.ts:363-366 title: row.deleted_at === null && (await canSee(...)) ? titleOf(...) : null — no my-work fixture holds a deleted ticket, so the deleted_at conjunct is executed-but-unconstrained (the record at 16-remaining-doors agrees)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A contested-claim fixture whose ticket is then soft-deleted, asserting the title is `null` while a live contested sibling's title is not. The project names this itself at `test-cases/16-remaining-doors.md` (16.90(b)) with the owner *"whoever next picks up the contested-claim surface"*. **This finding adds nothing new except an independent reproduction; it is reported because the brief asked me to verify the record, and the record holds.**
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — reproduced independently at `e4baa425`.** With the conjunct removed (line 364 rewritten to `(await canSee(db, viewerId, row.ticket_id))`), the **full `apps/server` suite reads 1727 passed / 0 failed / 5 skipped — byte-identical to the baseline.** Compare §5.1: this is the *only* soft-delete site in the server that survives.
JUDGE'S NOTE: VALID, judge opened (the reproduction is a mutation; verified by reading, as the lane itself recorded). A soft-delete gate no test constrains, IMPORTANT.
DONE WHEN: A rule-engine/server test reproduces the defect through the real door (ingest or route), RED before and GREEN after; the package suite is green; the invariant is stated in one sentence in the check's docblock; `test-cases/` gains or flips the case in the same commit.
COMMIT: `F4: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F4-fn | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F5-fn  ·  opus  ·  IMPORTANT  ·  ~1.75 h  ·  rank 94

```
TASK T-F5-fn — batch B07 (Soft-delete integrity — engine, replica, list) — model opus — backend claude-opus — effort ~1.75 h — judged IMPORTANT — rank 94/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec3, docs/lanes/review-functionality-exec3.md:340, 26 lines — read the whole section first):
  F5 — MEDIUM — The replica's two TypeScript gates are confirmed open gaps, and the table's citations for them have rotted
WHAT IS WRONG (the reviewer's words):
  `packages/app-core/src/replica/replica-data-source.ts` applies the delete rule twice in TypeScript — `:996` (`if ((state.deleted ?? null) !== null) continue;`, the ticket enumeration) and `:1029` (`(state.deleted ?? null) === null,` the board filter conjunct).
THE JUDGE'S LINE (the ruling rests on this; open it):
  replica-data-source.ts:996 if ((state.deleted ?? null) !== null) continue; — one of the two replica gates whose mutation survives; bg-paths.test.ts:165/:171/:172 cite :947/:980 which resolve to non-gates (+49 rot)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Cite by content — *"the `if ((state.deleted ?? null) !== null) continue;` in the ticket enumeration"* — which is what the file says it does for the neighbouring I2 note and does not do here. And cover the two gates with a deleted-ticket fixture in the replica suite.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — reproduced independently at `e4baa425`, with a valid instrument.** Mutating `:996` to `if (false) continue;` → app-core replica suite **27 passed / 0 failed**. Mutating `:1029` to `true,` → **27 passed / 0 failed**. The instrument is valid because that suite imports the module under test by **relative path** (`test/replica/replica-data-source.test.ts:30`), so nothing resolved through `dist`.
JUDGE'S NOTE: VALID, judge opened. Two unconstrained gates plus rotted citations, IMPORTANT.
DONE WHEN: A rule-engine/server test reproduces the defect through the real door (ingest or route), RED before and GREEN after; the package suite is green; the invariant is stated in one sentence in the check's docblock; `test-cases/` gains or flips the case in the same commit.
COMMIT: `F5: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F5-fn | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-11  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 123

```
TASK T-E6-11 — batch B07 (Soft-delete integrity — engine, replica, list) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 123/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec6, docs/lanes/review-functionality-exec6.md:946, 49 lines — read the whole section first):
  E6-11 — MINOR — The list serves a soft-deleted epic's title as a group header; the detail door withholds the same title as "the deleted ticket's content" — both decisions landed in the same commit, one as a ruling and one as a deferral
WHAT IS WRONG (the reviewer's words):
  `GET /v1/projects/:id/tickets?groupBy=epic` labels each group with the epic's title (`routes/list.ts:274-278`, `titleOfEpic`), resolved by `epicAncestors` (`:384-452`): a recursive walk up `proj_tickets` joined to `proj_visibility`, filtered by `${visible}` at every hop and by **nothing about `deleted_at`**. Measured through the real doors (Appendix J; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/routes/list.ts:402 — // NO soft-delete predicate on either arm of the walk below, and this is the
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Apply the crumb's decision: `AND ${LIVE_TICKET_WHERE}` on the recursive member of `epicAncestors` (alias `t` is already the `proj_tickets` join) so a deleted ancestor ends the walk as an invisible one does, and label the group the way the crumb labels the parent (`restricted` / "An epic you cannot open") rather than "No epic" — which keeps the chip the note wanted to keep and drops the content the crumb already drops. Then retire the "named, not decided" paragraph, since it is decided.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix J, run from `apps/server`. Lines opened: `list.ts:274-278`, `:384-452` (`:402-411` the residual note, `:416` `WITH RECURSIVE`, `:423`/`:433` the two `${visible}` hops); `list-cards.ts:125`; `routes/tickets.ts:419-431`; `executor-state-history.md:692-696`; `git log --format=%h -S"TITLE still travels" -- apps/server/src/routes/list.ts` and `-S"TITLE is the deleted ticket" -- apps/server/src/routes/tickets.ts` → both `18d7e391`.
JUDGE'S NOTE: VALID per verifier chunk30 (line opened by the verifier, not the judge): Walk :416-440 has no deleted_at; control: LIVE_TICKET_WHERE (visible-where.ts:191) is applied at list.ts:121 to the card query but not to the walk. list-cards.ts:125 sets epicId only, so the title rid
DONE WHEN: A test in the owning package reproduces the defect, RED before and GREEN after (named with the ruling id); the package suite is green; `Features.md` and `test-cases/` updated in the same commit when the behaviour is user-observable.
COMMIT: `E6-11: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-11 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B08 — Ticket sheet — crumbs, history, comments, Move/Publish arms  ·  lane UX  ·  session model **sonnet**  ·  backend **deepseek**  ·  14 tasks  ·  ~9.7 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec2` · branch `rel/b08-ticket-sheet-crumbs-history-comm` · packages touched: @gisik-nokma/app-core, @gisik-nokma/editor, @gisik-nokma/server, @gisik-nokma/ui, @gisik-nokma/web.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E2-29` | sonnet | I | 1.25 | `packages/app-core/src/views/ticket-sheet.tsx` |
| 2 | `T-E2-46` | sonnet | I | 1.25 | `packages/editor/src/schema/extensions.ts:91-96`, `packages/editor/src/schema/extensions.ts:76-96`, `packages/editor/test/schema.test.ts:342-361` |
| 3 | `T-E4-19` | sonnet | I | 1.25 | `packages/app-core/src/views/history-list.tsx:45`, `packages/app-core/src/view-types.ts:539-549` |
| 4 | `T-E5-27` | sonnet | I | 1.25 |  |
| 5 | `T-E5-28` | sonnet | I | 1.25 | `apps/web/src/authoring/data-source-gateway.ts:327` |
| 6 | `T-E5-8` | sonnet | I | 1.25 | `docs/manual.md:408-419` |
| 7 | `T-F3-ux` | sonnet | I | 1.25 |  |
| 8 | `T-V4` | sonnet | I | 1.25 |  |
| 9 | `T-V7` | sonnet | I | 1.25 |  |
| 10 | `T-E4-1` | sonnet | I | 1.25 | `apps/server/src/routes/tickets.ts:618` |
| 11 | `T-E4-30` | sonnet | I | 1.25 | `packages/ui/src/ui.css:672-679` |
| 12 | `T-E5-3` | sonnet | I | 1.25 | `test-cases/16-remaining-doors.md:1080` |
| 13 | `T-P3` | sonnet | M | 0.6 | `packages/app-core/src/view-types.ts:368-371`, `apps/server/src/routes/tickets.ts:435-436` |
| 14 | `T-P4` | sonnet | M | 0.6 | `packages/app-core/src/views/ticket-sheet.tsx:1529` |

#### T-E2-29  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 59

```
TASK T-E2-29 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 59/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:1713, 47 lines — read the whole section first):
  E2-29 (r2) — IMPORTANT · A dropped connection during a Move produces nothing at all, and the Move control has no in-flight state
WHAT IS WRONG (the reviewer's words):
  Two halves, both measured, in `packages/app-core/src/views/ticket-sheet.tsx`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ticket-sheet.tsx:731 const results = await dataSource.ingest([...fieldEvents, transition]); — no try; :2644 transportError={null} handed to the dialog as a literal
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Wrap the `await` in the same `try`/`catch`/`finally` shape `submitTicketEvent` uses, set `transportError`, and **pass it to the dialog** (which already accepts the prop) instead of the literal `null` — the dialog is the surface in view, so it should be the one that speaks. ⚠ **Not measured:** whether a genuine double press files two `ticket.transitioned` events. The second would be adjudicated by the engine against the state the first left; I did **not** trace that, so I allege only the absence of a latch, not a duplicate.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `ticket-sheet.tsx:711-745` (the whole function), `:1975`, `:2624-2647` (the dialog mount, the `void`, and `transportError={null}`), `:1014-1030` (the sibling that does it properly).
JUDGE'S NOTE: VALID, judge opened. A dropped connection during a Move produces nothing and the control has no in-flight state, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-29: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-29 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-46  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 63

```
TASK T-E2-46 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 63/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/editor
FINDING (exec2, docs/lanes/review-ux-exec2.md:3334, 51 lines — read the whole section first):
  E2-46 (r2) — IMPORTANT · A typed `[text](url)` becomes markup with no escape suggestion, where every other formatting trigger offers one — a hole in §2's named property that my own change opened
WHAT IS WRONG (the reviewer's words):
  Spec §2's named mechanic is that *"nothing silently becomes markup"*: when a typed reserved sequence triggers formatting, the editor surfaces an inline suggestion offering the escaped literal. `packages/editor/src/schema/extensions.ts:76-96` records that `markdownLinks` went **false → true** under the owner's 2026-09-20 ruling (*"both"*), **which my own change set landed**, and then records the consequence at `:91-96`:
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/editor/src/schema/extensions.ts:91-96 "a typed link now fires an input rule, but typing one offers no escape suggestion where `**due soon**` does… owner: whoever next touches the trigger coverage"; :195-196 EscapeSuggestion is last
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either add the typed-link rule to the escape trigger table — so `[text](url)` offers *"Keep as literal text"* beside `**due soon**`'s — or record a ruling that the typed link is deliberately outside the mechanic, which would be a decision about §2 rather than a side effect of a decision about an option. ⚠ **I did not establish the cause either**, and I am not guessing at one: the file says the probe read `getEscapeSuggestion` on both paths, and the reason one is empty is the thing the next reader should open rather than inherit from me.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `packages/editor/src/schema/extensions.ts:76-96` (the reversal and the recorded asymmetry), `:195-196` (`EscapeSuggestion` **is** the last entry `buildEditorExtensions` returns — I checked, because the escape mechanic's command override depends on it), `packages/editor/test/schema.test.ts:342-361` (case 9.95, the measured probe), `packages/editor/src/extensions/escape-suggestion.ts:6-120` (the mechanism, its measured Tiptap failure, and the two-part fix).
JUDGE'S NOTE: VALID, judge opened. The asymmetry is recorded in the code as an open gap with an owner, not ruled acceptable (verifier: history:559 rules only markdownLinks: true); a person meets it. IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-46: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-46 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-19  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 65

```
TASK T-E4-19 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 65/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:331, 14 lines — read the whole section first):
  E4-19 — **IMPORTANT** — The History tab's headline is the raw event-type slug — `ticket.field_set` three times in a row with nothing saying which field — where the prototype writes a sentence and the wire carries the payload the sentence needs
WHAT IS WRONG (the reviewer's words):
  Sheet → *History*, `CCSO-6`: six rows whose headlines read `ticket.created`, `ticket.field_set`, `ticket.field_set`, `ticket.field_set`, `ticket.transitioned`, `visibility.set`, each followed by `Kiro` · `from web` and the two clocks.
THE JUDGE'S LINE (the ruling rests on this; open it):
  history-list.tsx:45 <span className="gn-history__type">{event.type}</span> — the raw event-type slug as the headline; payload/version (view-types.ts:539-549) unread; the prototype (:3734-3736) writes "Created as / Assigned to / State set to"
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A small `describeEvent(type, payload)` — `field_set` → *"Set <field> to <value>"*, `transitioned` → *"Moved to <state>"*, `visibility.set` → *"Visibility: <mode>"* — with the slug kept as a `title`/secondary line for the reader who wants the wire name. The prototype's sentences are the spec for the shape.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted).** `document.querySelectorAll('.gn-history__event')` → 6; `.gn-history__type` texts tallied → `{ticket.created:1, ticket.field_set:3, ticket.transitioned:1, visibility.set:1}`; one full row: `<span class="gn-history__type">ticket.field_set</span><span class="gn-history__actor">Kiro</span><span class="gn-history__origin">from web</span><dl class="gn-history__clocks">…</dl>` — no field name, no value, no target state. Source: …
JUDGE'S NOTE: VALID, judge opened. History reads as `ticket.field_set` ×3 with nothing saying which field, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E4-19: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-19 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-27  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 68

```
TASK T-E5-27 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 68/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:1049, 33 lines — read the whole section first):
  E5-27 — IMPORTANT · A Move that fails in transport is silence — no sentence, no latch, the dialog stays open — while Close, Reopen and Delete on the same sheet have both; the sheet's own comment records the gap and hands the dialog `transportError={null}` `[SOURCE]` (verifies exec 2 §2d's "a transport failure during a Move has no surface at all", unmeasured there)
WHAT IS WRONG (the reviewer's words):
  `ticket-sheet.tsx:711-745` `submitTransition`: builds the events, `await dataSource.ingest([...])`, reads the results — **no `try`/`catch`, no `submitting` guard**. `transition-dialog.tsx:366-379` `submit()` and `:515` `<Button variant="primary" disabled={blocked} onClick={submit}>` — `blocked` (`:360-364`) is the form's validity only; nothing disables Move while a submission is in flight (`grep -n submitting transition-dialog.tsx` → 0). The sheet mounts the dialog with `transportError={null}` and says why at `:2637-2644`: *"`submitTransition` above stays unguarded … a rejected `ingest` here is an unhandled promise rejection, not a state this component tracks, so there is nothing to pass but `null`."* The sibling writes on the same sheet — `submitTicketEvent` for Close/Reopen/Delete (`:1025-1077`) — have the latch (`:1029` `if (submitting) return`), the transport arm (`:1071-1074` *"We …
THE JUDGE'S LINE (the ruling rests on this; open it):
  ticket-sheet.tsx:731 const results = await dataSource.ingest([...fieldEvents, transition]); — no try/catch, no latch; transportError={null} at :2645
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Wrap `submitTransition` in the same `try`/`catch`/`finally` as `submitTicketEvent`, feed the dialog's `transportError` prop (it already renders it, `transition-dialog.tsx:491-495`), and disable Move while in flight.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `ticket-sheet.tsx:711-745`, `:1025-1077`, `:2637-2644`; `transition-dialog.tsx:360-379`, `:515`, `:491-495`. Not driven (§6.1); the reproduction is the E5-13/E5-15 technique: wrap `fetch` to throw on `POST /v1/events`, press Move, observe the dialog.
JUDGE'S NOTE: VALID, judge opened. A Move that fails in transport is silence while Close/Reopen/Delete on the same sheet have arms, IMPORTANT. Independent duplicate of exec 2's E2-29 — both score in full.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-27: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-27 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-28  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 69

```
TASK T-E5-28 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 69/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:1083, 33 lines — read the whole section first):
  E5-28 — IMPORTANT · A dropped connection during Publish leaves the workflow builder's Publish button disabled for ever with no sentence; a refusal discards the state mapping the person just built `[SOURCE]` (verifies exec 2 §2e's "state-mapping dialog unmounted before the server answers", and goes further)
WHAT IS WRONG (the reviewer's words):
  `workflow-builder/ui/publish-controls.tsx:64-86` `submitPayload`: `setState({ phase: 'submitting' })`, then `await env.gateway.submit([event])` — **no `try`/`catch`** (the file's only `try` is around the occupancy READ, `:95-98`). Both callers discard the promise: `:91` `await submitPayload()` inside `onPublishClick` (itself invoked as `void onPublishClick()`, `:113`), and `:126` `onConfirm={(mapping) => void submitPayload(mapping)}`. The Publish button is `disabled={issues.length > 0 || state.phase === 'submitting'}` (`:111`), and nothing but a server answer ever leaves `submitting`. So a transport failure — the request never reaching the server — leaves the person with a greyed Publish, no banner (`:129-146` render only `published`/`refused`/`invalid`), and no way back but a reload. (`submit` is `dataSource.ingest` — `apps/web/src/authoring/data-source-gateway.ts:327` — which throws …
THE JUDGE'S LINE (the ruling rests on this; open it):
  publish-controls.tsx:73 const [result] = await env.gateway.submit([event]); — unguarded (one catch in the file, elsewhere); :111 disabled={issues.length > 0 || state.phase === 'submitting'} — nothing but a server answer leaves submitting
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A `catch` that sets a `transport` phase with the sheet's sentence and re-enables Publish; on `refused`, keep the mapping in state and reopen the dialog pre-filled.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `publish-controls.tsx:55-148` opened in full; `grep -n 'catch\|try {'` → the occupancy read only. Not driven (§6.1; the builder needs a draft to publish, which is a write).
JUDGE'S NOTE: VALID, judge opened. A dropped connection during Publish leaves the button disabled for ever with no sentence, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-28: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-28 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-8  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 75

```
TASK T-E5-8 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 75/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:443, 29 lines — read the whole section first):
  E5-8 — IMPORTANT · The History tab prints raw event names — `ticket.field_set` three times in a row — and never says WHAT changed; the export narrates every row `[BROWSER]` `[SOURCE]` — category 3
WHAT IS WRONG (the reviewer's words):
  `CCSO-3`'s History tab reads, in order: `ticket.created · Kiro · from web · claimed (device clock) 6 Sep 2026, 14:46 IST · recorded (server) 6 Sep 2026, 14:46 IST`, then `ticket.field_set` ×3 with identical clocks, then `ticket.transitioned`, `visibility.set` ×2, `ticket.transitioned` (`[BROWSER]`, tab panel text). Nothing on any row says which field was set, to what, or which state the ticket moved to. The export's rows (`EXPORT:3733-3737`) are sentences: *"Created as Errand"*, *"Assigned to Anselma Marak"*, *"State set to Doing"*, *"Conflicting claim recorded on iphone-02"*.
THE JUDGE'S LINE (the ruling rests on this; open it):
  history-list.tsx:45 <span className="gn-history__type">{event.type}</span> — payload discarded though the wire carries it (view-types.ts:543; route :701 selects it); the export narrates every event
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Narrate from `type` + `payload` (*"Due set to 14 Sep 2026"*, *"Moved to In progress"*, *"Visibility set to project"*) with the raw type kept as a secondary label; keep both clocks exactly as they are.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` History tab text above. `[SOURCE]` `history-list.tsx:36-60`; `view-types.ts:538-548`; `EXPORT:3733-3737`; `docs/manual.md:408-419`.
JUDGE'S NOTE: VALID, judge opened. History prints raw event names and never says what changed, IMPORTANT. Independent duplicate of exec 4's E4-19 — both score in full.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-8: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-8 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F3-ux  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 78

```
TASK T-F3-ux — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 78/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:442, 53 lines — read the whole section first):
  F3 — IMPORTANT · A comment renders as plain text while the composer offers marks it discards; a link's destination is unrecoverable
WHAT IS WRONG (the reviewer's words):
  The comment composer is the real editor and offers **Bold, Italic, Code, Link, List, Quote**. The thread renders each comment body through `docToPlainText`, which reads a node's `type`/`text`/`attrs` and **ignores `marks` entirely**. Consequences, in the person's terms:
THE JUDGE'S LINE (the ruling rests on this; open it):
  comments-thread.tsx:118 const text = docToPlainText(comment.body); rendered at :129 while EditorToolbar.tsx:56/:107 offers B i code link list quote
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either render the thread through the read-only editor (as the description does), or render through a projection that keeps marks and hrefs; or, if plain text is the decision, **remove the formatting controls from the comment composer** and say why. The one thing that should not stand is a toolbar whose output the next block deletes.
JUDGE'S NOTE: VALID, judge opened. A comment's marks and link destinations are discarded at render; IMPORTANT = a person loses what they typed.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `F3: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F3-ux | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-V4  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 81

```
TASK T-V4 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 81/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:800, 24 lines — read the whole section first):
  V4 — IMPORTANT · The comment thread reports a still-loading read as "Comments · 0" and "No comments yet."
WHAT IS WRONG (the reviewer's words):
  The sheet passes `comments={comments.data ?? []}` and `commentsUnavailable={comments.error ?? undefined}` (`ticket-sheet.tsx:2555-2556`). `useLiveQuery` initialises `data` to `null` (`use-live-query.ts:41`), so during the load window `[]` and `undefined` reach the thread. `CommentsThread` decides `answered = commentsUnavailable === undefined` (`comments-thread.tsx:159`) — true while loading — and the answered branch renders `` `Comments · ${comments.length}` `` (`:163`) and *"No comments yet."* (`:169`).
THE JUDGE'S LINE (the ruling rests on this; open it):
  comments-thread.tsx:159 const answered = commentsUnavailable === undefined; :163 `Comments · ${comments.length}` — a still-loading read (data null, error undefined) reports 0
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Pass the pending signal the way History receives it and give `CommentsThread` a wait arm; do not collapse `data === null` into `[]` at the boundary.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `use-live-query.ts:41`; `ticket-sheet.tsx:2555-2556` and `:2719-2723`; `comments-thread.tsx:159, 163, 169`.
JUDGE'S NOTE: VALID by reading (the reproduction is a mutation; verifier and judge both read the window at :546/:626-632). IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `V4: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-V4 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-V7  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 82

```
TASK T-V7 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 82/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:876, 40 lines — read the whole section first):
  V7 — IMPORTANT · A comment the server REFUSES costs the author the words they just wrote
WHAT IS WRONG (the reviewer's words):
  `ticket-sheet.tsx:853-877` — on a refusal, `submitComment` sets `serverRefusal` and **returns normally**; it does not throw. `TicketEditorSlot.handleSubmit` (`:161-185) `await`s `submit(...)` and, on a **resolution**, runs `editor.commands.setContent(emptyDoc(), …)` at `:174`. The `catch` that would preserve the draft is only reached on a **rejection**.
THE JUDGE'S LINE (the ruling rests on this; open it):
  TicketEditorSlot.tsx:174 editor.commands.setContent(emptyDoc()) inside the try, after the await; ticket-sheet.tsx:875-877 a refusal sets serverRefusal and RESOLVES — so the clear runs on a refusal; the docblock at :178-180 says the opposite
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either `submitComment` rejects on a refusal (it already records the refusal in its slot either way, and rejecting is what makes the composer's stated contract true), or `handleSubmit` clears on an explicit success signal rather than on a non-throwing `await` — because "no exception" is not "the server accepted it" anywhere else in this codebase.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `ticket-sheet.tsx:853-877` (the `refused` arm at `:875-876` returns); `TicketEditorSlot.tsx:161-185` (the clear at `:174` inside the `try`, the catch at `:177-181`); `ticket-image.ts:132,133,159`; `attachment-paste.ts:42-50`.
JUDGE'S NOTE: VALID, judge opened. A refused comment costs the author their words, and the code's own comment claims it cannot, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `V7: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-V7 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-1  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 99

```
TASK T-E4-1 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 99/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec4, docs/lanes/review-ui-exec4.md:87, 15 lines — read the whole section first):
  E4-1 — **IMPORTANT** — The ticket sheet's breadcrumb renders the SAME ancestor twice whenever the direct parent is an epic — which is 23 of the 26 tickets in the seeded project
WHAT IS WRONG (the reviewer's words):
  Open `CCSO-6` ("HSN codes for the real catalogue", parent = the epic "Open questions"). The painted crumb bar reads **`Convenience Corner › Shop operations › Open questions › Open questions › CCSO-6`** — two link crumbs, `data-testid="sheet-crumb-epic"` and `data-testid="sheet-crumb-parent"`, both labelled *Open questions*, both opening the same ticket.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/routes/tickets.ts:618 let cursor = state.parentId; … :658 if (epicTypeIds.has(ancestor.typeId)) { epic = { kind: 'ticket', id: cursor … — the walk returns on the first epic, so epic.id == parent.id when the parent is an epic; ticket-sheet.tsx:1772-1787 renders epicCrumb and parent under two independent null checks with no id compare
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One comparison: render the epic crumb only when `epicCrumb.id !== parent.id` (or have the server null the `epic` when it equals the parent, with the docblock saying which). Plus one case in `ticket-sheet.test.tsx` whose fixture sets `parent.id === epic.id` and asserts `crumbTexts()` has the ancestor once — the shape the seed produces 23 times.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, `:3041`, 1512×900).** `evaluate_script` on `nav[aria-label="Ticket location"]` returned the outerHTML: `…<button … data-testid="sheet-crumb-epic">Open questions</button><span … aria-hidden="true">›</span><button … data-testid="sheet-crumb-parent">Open questions</button>…`. The a11y snapshot (`take_snapshot`) lists `button "Open questions"` twice under `navigation "Ticket location"`. **The ticket has exactly one ancestor**: read-only recursive query on the dev DB …
JUDGE'S NOTE: VALID, judge opened. The breadcrumb renders the same ancestor twice for every ticket whose parent is an epic, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E4-1: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-1 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-30  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 100

```
TASK T-E4-30 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 100/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:472, 14 lines — read the whole section first):
  E4-30 — **IMPORTANT** — The sheet's ancestor crumbs are links painted in exactly the ink of the non-link crumbs beside them, on the strength of a docblock that says the prototype does the same — and the prototype's stylesheet says the opposite
WHAT IS WRONG (the reviewer's words):
  In the crumb bar `Convenience Corner › Shop operations › Open questions › … › CCSO-6`, the first two are plain `<span>`s and *Open questions* is a `<button>` that opens the epic. Nothing visible separates them.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ui.css:643 .gn-ticket-sheet__crumbs color: var(--gn-text-muted); :678 the link crumb color: inherit; the docblock :668-671 claims the prototype's <a> "sets no colour of its own" — the export's :86 a{color:var(--accent)…} is a type selector that beats inheritance
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `color: var(--gn-text-accent)` on `button.gn-ticket-sheet__crumb--link` (the role the product already resolves the prototype's `accent` to for text, per `.gn-button`'s and `.gn-board-card__move`'s docblocks), and the docblock rewritten to cite `:86`.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, 1512).** `span.gn-ticket-sheet__crumb` (plain): `color: rgb(60,60,67)`, `13px/18px`; `button.gn-ticket-sheet__crumb--link`: `color: rgb(60,60,67)`, `text-decoration: none`, `13px` — **identical ink, no underline, no weight change**; only `cursor: pointer` and the UA focus ring differ. The current crumb is `600` in `rgb(32,43,73)` (that part matches the prototype). Source: `packages/ui/src/ui.css:672-679` — `button.gn-ticket-sheet__crumb--link { … color: inherit; }`, and …
JUDGE'S NOTE: VALID, judge opened. Ancestor-crumb links are painted in the non-link ink on the strength of a false docblock inference, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E4-30: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-30 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-3  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 106

```
TASK T-E5-3 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 106/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:279, 30 lines — read the whole section first):
  E5-3 — IMPORTANT · A ticket directly under an epic reads `Epic › Epic › KEY` — the crumb states a four-deep chain the product does not have `[BROWSER]` `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  `CCSO-3`'s location crumb is `Convenience Corner › Shop operations › Open questions › Open questions › CCSO-3`: two clickable crumbs, `data-testid="sheet-crumb-epic"` and `data-testid="sheet-crumb-parent"`, both reading *"Open questions"*, both opening the same ticket.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ticket-sheet.tsx:1777/:1785 both crumbs draw when the parent is the epic (the walk starts at parentId, view-types.ts:529); :1756 "A crumb list is a PATH or it is nothing"
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Draw the epic crumb only when `epic.id !== parent.id` (one line at `:1777`), and add the one-hop case beside `16.70`.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` painted nav HTML (JS over `nav.gn-ticket-sheet__crumbs`): two `<button class="gn-ticket-sheet__crumb gn-ticket-sheet__crumb--link">Open questions</button>` with the two testids. Wire: `GET /v1/workspaces/0TZSS5W6ATCTF2YBPMWGGP9JF5/tickets/0320JX4SK3KBJ616QP82T8WRJ2` → `parent.id === epic.id` (`sameId: true`), `key: "CCSO-3"`. `[SOURCE]` `ticket-sheet.tsx:1534` `const epicCrumb = ticketRead.epic;`, `:1777`, `:1785`. `test-cases/16-remaining-doors.md:1080` (`16.70`) opened.
JUDGE'S NOTE: VALID, judge opened. `Epic › Epic › KEY` states a chain the product does not have, IMPORTANT. Independent duplicate of exec 4's E4-1 — both score in full.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-3: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-3 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P3  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 151

```
TASK T-P3 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 151/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec1, docs/lanes/review-ui-exec1.md:320, 16 lines — read the whole section first):
  P3 — **MINOR** — The parent crumb cannot show the parent's key; the prototype's does, and no ruling records the difference
WHAT IS WRONG (the reviewer's words):
  The prototype labels the parent crumb `key + " " + title`; the product labels it `title`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  /Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/Gisik Nokma - Desktop.dc.html:3417 — if (p) chain.push({ label: p.id + " " + p.title, go: () => self.setState({ sheetId: p.id, sheetTab: "details"
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either serve the parent's key (one field at `routes/tickets.ts:435`, one at `mappers.ts:1868-1872`, one in `ParentRef`) so the crumb can read as the prototype's — or record the divergence with the wire as its reason, in the dispatch's own idiom (*"a divergence the way the ticket-key spec recorded its own"*).
HOW IT WAS MEASURED (reproduce this before and after):
  Prototype `Gisik Nokma - Desktop.dc.html` `:3413-3414`: `chain.push({ label: p.id + " " + p.title, go: … })`. Product: `ticket-sheet.tsx:1557` and `:1566` render `{ancestor.title}` alone. The prototype's **epic** crumb is `e.title` (`:3410-3413`, title only) — **which the product matches.** So the divergence is exactly one crumb. **Why the product cannot match:** `ParentRef` is `{ kind:'ticket'; id; title }` (`packages/app-core/src/view-types.ts:368-371`) — no key field — and the server's …
JUDGE'S NOTE: PARTIAL per verifier chunk02 (line opened by the verifier, not the judge): CORE HOLDS: parent crumb is p.id + ' ' + p.title at prototype :3417, product renders {ancestor.title} at ticket-sheet :1557/:1566, ParentRef :368-371 carries no key, mapParentRef reads kind/id/title o
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `P3: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P3 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P4  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 153

```
TASK T-P4 — batch B08 (Ticket sheet — crumbs, history, comments, Move/Publish arms) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 153/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec1, docs/lanes/review-ui-exec1.md:337, 11 lines — read the whole section first):
  P4 — **MINOR** — "the SAME plain span" is not the same span
WHAT IS WRONG (the reviewer's words):
  The docblock justifying the no-callback crumb arm asserts an identity that is false of what renders.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/views/ticket-sheet.tsx:1529 — * degrades to the SAME plain span the restricted arm uses, which is that
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  *"With no callback the crumb degrades to a plain span — the same *shape* the restricted arm uses, though not its ink."* Or, if the marking is wanted for an unopenable-but-visible ancestor, give the arm the modifier. One of the two; not a sentence claiming both.
HOW IT WAS MEASURED (reproduce this before and after):
  `ticket-sheet.tsx:1528-1530`: *"With no callback the crumb degrades to the SAME plain span the restricted arm uses."* The restricted arm (`:1552`) carries `gn-ticket-sheet__crumb--restricted` → `color: var(--gn-restricted)` (`ui.css:687-689`). The no-callback arm (`:1556`) carries the bare class only → inherits `var(--gn-text-muted)` from `.gn-ticket-sheet__crumbs` (`ui.css:643`). **Different ink.** The identical sentence is repeated in `Features.md:77` (*"it degrades to the same plain span"*).
JUDGE'S NOTE: VALID per verifier chunk02 (line opened by the verifier, not the judge): ticket-sheet :1552 restricted span and :1556 bare-class span exact; ui.css:687-689 color: var(--gn-restricted); ui.css:643 color: var(--gn-text-muted) inside .gn-ticket-sheet__crumbs (opens :636). The
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `P4: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P4 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B09 — Failure states on the web — reads and writes that speak  ·  lane UX  ·  session model **sonnet**  ·  backend **deepseek**  ·  15 tasks  ·  ~9.7 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec2` · branch `rel/b09-failure-states-on-the-web-reads-` · packages touched: @gisik-nokma/app-core, @gisik-nokma/web.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E2-20` | sonnet | I | 1.25 |  |
| 2 | `T-E2-39` | sonnet | I | 1.25 | `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx:71-80`, `apps/web/src/authoring/data-source-gateway.ts:104`, `apps/web/src/authoring/builder-wiring.tsx:56-87` |
| 3 | `T-E2-44` | sonnet | I | 1.25 | `apps/web/src/mcp-tokens-screen.tsx:121-124`, `apps/web/src/mcp-tokens-screen.tsx:120-128`, `apps/web/src/mcp-tokens-screen.tsx:118-132` |
| 4 | `T-E4-23` | sonnet | I | 1.25 | `packages/app-core/src/online/http.ts:121`, `packages/app-core/src/online/http.ts:92-97`, `apps/server/src/routes/tickets.ts:300-302` |
| 5 | `T-E5-15` | sonnet | I | 1.25 |  |
| 6 | `T-E5-40` | sonnet | I | 1.25 | `docs/manual.md:763-770`, `test-cases/13-owner-requests-and-backlog.md:2243` |
| 7 | `T-E5-42` | sonnet | I | 1.25 | `packages/app-core/src/views/ticket-list.tsx:1225` |
| 8 | `T-V9` | sonnet | I | 1.25 | `apps/web/app/invite/[token]/page.tsx:59-69` |
| 9 | `T-E5-10` | sonnet | I | 1.25 | `apps/web/app/inbox/page.tsx:278`, `apps/web/app/inbox/page.tsx:269-278` |
| 10 | `T-F4-ux` | sonnet | I | 1.25 | `packages/app-core/src/views/visibility-editor.tsx:441-443` |
| 11 | `T-V3` | sonnet | I | 1.25 |  |
| 12 | `T-E5-18` | sonnet | M | 0.6 | `apps/web/app/invite/[token]/page.tsx:94-96` |
| 13 | `T-E5-30` | sonnet | M | 0.6 | `apps/web/src/shell-refusal.tsx:41`, `apps/web/src/shell-refusal.tsx` |
| 14 | `T-E2-26` | sonnet | M | 0.6 | `apps/web/app/inbox/page.tsx:278`, `apps/web/app/inbox/page.tsx:269-279` |
| 15 | `T-E2-32` | sonnet | M | 0.6 | `packages/app-core/src/views/transition-dialog.tsx:226` |

#### T-E2-20  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 57

```
TASK T-E2-20 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 57/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:1248, 79 lines — read the whole section first):
  E2-20 (r2) — IMPORTANT · Two admin screens stay on "Loading ticket types…" forever when a read rejects, and the comment beside one of them names that exact failure for a promise it did not apply it to
WHAT IS WRONG (the reviewer's words):
  Both ticket-type screens fetch with a `Promise.all` that has **no rejection handler**, and both gate their whole render on the loaded state, so a rejection is an error drawn as an eternal load.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ticket-type-list-screen.tsx:175-181 Promise.all([...]).then(…) with no rejection arm; :182-185 the file's own comment names "leave the screen on Loading ticket types… for ever" as the failure it avoids for the sibling promise
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One rejection handler on the `Promise.all` writing into an error state the screen renders as `ShellRefusal` — the shape every other data screen in this app already uses, and the shape this very effect uses for its second promise.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `ticket-type-list-screen.tsx:173-199` (the effect, both promises, the gate); `ticket-type-editor-screen.tsx:187-197` and `:240-251`. Both `Promise.all` call sites were read in full; neither has a second argument to `.then`, and neither has a `.catch`.
JUDGE'S NOTE: VALID, judge opened. Two admin screens load for ever on a rejected read, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-20: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-20 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-39  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 60

```
TASK T-E2-39 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 60/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:2204, 79 lines — read the whole section first):
  E2-39 (r2) — IMPORTANT · A failed roster read becomes "nobody is in this workspace", and the workflow builder's own adapter calls that "the very lie"
WHAT IS WRONG (the reviewer's words):
  `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx:71-80` loads the builder's environment with two reads and a **blanket** catch on one of them: ``` Promise.all([ props.gateway.listMembers(props.workspaceId).catch(() => [] as WorkspaceMember[]), // :72 props.gateway.listTicketTypes(props.workspaceId), ]) .then(([members, ticketTypes]) => { if (!cancelled) setData({ members, ticketTypes }); }) .catch(() => { if (!cancelled) setLoadFailed(true); }); // :78-80 ``` `listMembers` therefore **never rejects**, so the outer `.catch` at `:78` is reachable only by `listTicketTypes` — and the screen's own failure sentence, *"Could not load workspace people and types — reload to try again."* (`:86-91`), is unreachable for the members half. The empty array then flows into `BuilderEnvironment.members` (`:101`), which the rule editors and rule summaries read.
THE JUDGE'S LINE (the ruling rests on this; open it):
  workflow-builder-screen.tsx:72 props.gateway.listMembers(props.workspaceId).catch(() => [] as WorkspaceMember[]) — a failed roster read renders as an empty roster; the adapter docblock (:104) calls that "nobody is in this workspace"
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Narrow the catch to the guest refusal on the members read, and let anything else reach `loadFailed` — the sentence is already built and already says "reload to try again". The docblocks record why the narrowing is a *contract move* rather than a one-line catch (`AuthoringReadRefused` is declared under `apps/`, and `app-core` depends on nothing there), which is a reason it has not been done, not a reason it is right.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `workflow-builder-screen.tsx:58-101` (the state, the effect, both catches, the unreachable failure sentence, and `members: data.members` into the environment); `apps/web/src/authoring/data-source-gateway.ts:104,111-130`; `apps/web/src/authoring/builder-wiring.tsx:56-87`.
JUDGE'S NOTE: VALID, judge opened. Failure drawn as a benign empty state, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-39: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-39 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-44  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 62

```
TASK T-E2-44 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 62/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec2, docs/lanes/review-ux-exec2.md:2926, 65 lines — read the whole section first):
  E2-44 (r2) — IMPORTANT · A failed read of your connected assistants is drawn as "No assistants are connected"
WHAT IS WRONG (the reviewer's words):
  `apps/web/src/mcp-tokens-screen.tsx:120-128`: ``` const load = useCallback((): void => { void http.get('/v1/me/mcp-tokens').then( (body) => setTokens((body as { tokens: TokenRow[] }).tokens), () => setTokens([]), // :123 — any failure becomes an EMPTY LIST ); }, []); ``` and the render draws the empty state for exactly that value — `:236-240`: > *"**No assistants are connected.** One appears here after you approve it on the connect page."*
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/mcp-tokens-screen.tsx:121-124 http.get('/v1/me/mcp-tokens').then(setTokens…, () => setTokens([]))
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A third arm: keep `tokens` as `null` on a rejection and render a failure sentence in place of the list — the shape `:234-235` already has for loading, one branch over. The screen already imports `refusalText` and already distinguishes `HttpError` bodies in two other places, so the vocabulary is present.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `apps/web/src/mcp-tokens-screen.tsx:118-132` (the loader and its two-argument `.then`), `:134-159` (the revoke handler that does it properly), `:228-240` (the lead sentence, the loading arm, the asserting empty arm); `packages/app-core/src/preferences/…` not involved.
JUDGE'S NOTE: VALID, judge opened. A failed read of connected assistants is drawn as "No assistants are connected", IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-44: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-44 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-23  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 66

```
TASK T-E4-23 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 66/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:381, 14 lines — read the whole section first):
  E4-23 — **IMPORTANT** — A ticket the server answers `404` for — never existed, soft-deleted, or invisible to this viewer — opens a sheet that says **"Loading…"** forever: the client believes it is waiting while the server has already refused
WHAT IS WRONG (the reviewer's words):
  `…/p/<projectId>?ticket=01EXF5XW3ZZZV7PD0P6B5HWGP0` (one character off a real id). The sheet opens titled *Ticket*, body **`Loading…`**, and stays there.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/online/http.ts:121 if (response.status === 404 && method === 'GET') return null; ticket-sheet.tsx:626-628 if (read.data === null) → the "Loading…" sheet — a 404 (never existed, soft-deleted, invisible) opens a sheet that loads for ever
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Let `getTicket`'s `null` reach the sheet as a distinct state — `read.data === null && read.settled` → *"This ticket is not here — it may have been deleted, or you may not be able to see it."* (the server's one-body refusal means the sentence must name both), with the `Loading…` arm reserved for `!settled`. `useLiveQuery` already knows when a read resolved; it only needs to say so. One painted case at `?ticket=<never>` asserting the sentence.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, 1512).** `[role=dialog]` `aria-label="Ticket"`, `innerText = "Ticket\n×\n\nLoading…"` at 2.5 s, **8.5 s, 18.5 s and 61 s** (`performance.now()` on a fresh load); in the same window `fetch('/v1/workspaces/<ws>/tickets/01EXF5XW3ZZZV7PD0P6B5HWGP0')` from the page → **`404 {"error":"not_found"}`**, and the console shows the same 404 for the page's own request. Mechanism, opened: `packages/app-core/src/online/http.ts:92-97` — *"404 answers `null` on a GET, and ONLY on a GET … …
JUDGE'S NOTE: VALID, judge opened. A server refusal drawn as a benign loading state, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E4-23: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-23 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-15  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 67

```
TASK T-E5-15 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 67/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:671, 30 lines — read the whole section first):
  E5-15 — IMPORTANT · A refused or failed ticket-types read leaves Settings on "Loading ticket types…" for ever — the same file's own docblock names this failure while leaving it in `[BROWSER, reproduced]` `[SOURCE]` (verifies exec 2 §2e's top Critical candidate; claimed lower)
WHAT IS WRONG (the reviewer's words):
  `ticket-type-list-screen.tsx:175-181`: `void Promise.all([gateway.listTicketTypes(…), gateway.listWorkflows(…)]).then(…)` — **no rejection handler**. `:182-185`, the very next comment: *"A SEPARATE promise, and its own rejection handler. Folded into the `Promise.all` above, a failed count would reject the whole tuple and leave the screen on 'Loading ticket types…' for ever"* — the counts promise was split out; the two-promise tuple was not given a handler. Same shape at `ticket-type-editor-screen.tsx:189-193` (`Promise.all([listWorkflows, listTicketTypes]).then(…)` only), with its own `Loading ticket types…` at `:248`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ticket-type-list-screen.tsx:175 Promise.all([...]).then( — no rejection arm; :199 if (types === null || workflows === null) return <p>Loading ticket types…</p>
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The sibling's `.catch(() => setLoadFailed(true))` and the sibling's sentence.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` transcript above; `[SOURCE]` `ticket-type-list-screen.tsx:172-199`, `ticket-type-editor-screen.tsx:186-197`, `:248`; positive controls `workflow-list-screen.tsx:180-202`, `workflow-builder-screen.tsx:66-95`.
JUDGE'S NOTE: VALID, judge opened. Settings loads for ever on a refused or failed read; IMPORTANT. Independent duplicate of exec 2's E2-20 — both score in full.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-15: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-15 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-40  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 72

```
TASK T-E5-40 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 72/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:1449, 35 lines — read the whole section first):
  E5-40 — IMPORTANT · With "Only tickets in progress" on, the Backlog tab says "Nothing in the backlog — new tickets land here" over a backlog the toggle emptied; the scope note and the manual name three tabs of five, and the file records the defect as "RECORDED, NOT FIXED" `[SOURCE]` — EMPTY that lies
WHAT IS WRONG (the reviewer's words):
  `page.tsx:342`: the toggle sets `stateCategories: ['active']` on the SERVER read, so backlog rows (category `open`) never reach `list.rows`. `:152` `BACKLOG_EMPTY_COPY = 'Nothing in the backlog — new tickets land here.'` is what the Backlog tab then renders. The scope note the toggle paints (`:2023-2027`): *"the list, calendar and timeline are asking only for tickets in progress — not started and done are both excluded. The board is not narrowed."* — three tabs named, the Backlog not among them. The file says it in its own words, `:940-948`: *"RECORDED, NOT FIXED: … With the toggle on, the Backlog tab reads 'Nothing in the backlog — new tickets land here.' over a project that may hold plenty; both `shown` and `total` read 0, so nothing here can tell the two apart … and nothing on the Backlog tab today says the toggle is why. Owner: whoever next revisits the toggle's own scope."*
THE JUDGE'S LINE (the ruling rests on this; open it):
  p/[projectId]/page.tsx:2566-2568 backlogNarrowing.epicsOnly ? BACKLOG_EMPTY_EPICS_COPY : BACKLOG_EMPTY_COPY — the in-progress narrowing is not a case, so a toggle-emptied backlog reads "Nothing in the backlog — new tickets land here" (verifier: the tab issues no second query, listNarrowing:667-671)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A third sentence for this arm, chosen where `activeOnly` is known — *"The backlog is hidden while 'Only tickets in progress' is on."* — and the scope note naming the Backlog.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `page.tsx:152-153`, `:342`, `:925-948`, `:2023-2027`; `docs/manual.md:763-770`; `test-cases/13-owner-requests-and-backlog.md:2243` (`13.1044`). Not driven: the toggle and the Backlog tab need the session the browser lost (§6.1); the mechanism is a server-side filter plus one constant, both opened.
JUDGE'S NOTE: VALID, judge opened. An empty state that names the wrong cause, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-40: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-40 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-42  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 73

```
TASK T-E5-42 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 73/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec5, docs/lanes/review-ux-exec5.md:1522, 34 lines — read the whole section first):
  E5-42 — IMPORTANT · A failed preferences read — or a failed save of "which columns to show" that the person just triggered — paints "The ticket list cannot be shown yet. HTTP … for /v1/me/preferences" over intact rows, on four of five tabs; the page's own comment names the hazard and fixed one consumer `[SOURCE]` — ERROR (a preference failure reported as a data failure)
WHAT IS WRONG (the reviewer's words):
  `ticket-list.tsx:1225` `error: list.error ?? preferences.error` — `useTicketList` folds the preferences hook's error (`use-preferences.ts:74-110`: set on a failed `getPreferences` AND on a failed `putPreferences`) into the same field as the ticket read's. The project page then refuses on that field FIRST on every tab but the Board: Backlog `page.tsx:2523` `list.error !== null ? <ShellRefusal what="The backlog" message={list.error} />`, List `:2652` (*"The ticket list"*), Calendar `:2329` (*"The calendar"*), Timeline `:2393` (*"The timeline"*) — each before checking `list.rows`, which is intact. `setPrefs` (`ticket-list.tsx:1206-1213`) is what the List's column chooser calls, so the person's own click can produce it.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/views/ticket-list.tsx:1225 error: list.error ?? preferences.error — a preferences read/save failure surfaces as the list-level refusal; use-preferences.ts:85-88 sets error on a getPreferences reject and :105-108 clears it only on a later success
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Keep `preferences.error` separate from `list.error` (a `prefsError` field), render it beside the column chooser as *"Your column choice was not saved — …"*, and key the four tab arms on `list.error` alone — the same correction the parent-picker comment already made.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `ticket-list.tsx:1200-1227`; `use-preferences.ts:74-110`; `page.tsx:1745-1760`, `:2329`, `:2393`, `:2523`, `:2652`. Population: a sweep for `error ?? ` / `.error ?? ` over `packages/app-core/src/views`, `apps/web/app` and `apps/web/src` finds **this one fold** (the other two hits pass an error to a prop named for it). Not driven (a session is needed to toggle a column; the mechanism is one `??` and four `!== null` checks, all opened). The reproduction for the judge: on the List tab, …
JUDGE'S NOTE: VALID, judge opened (verifier chunk28: 4 of 4 tab arms, board as the negative control). A column-preference failure paints "The ticket list cannot be shown", IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-42: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-42 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-V9  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 83

```
TASK T-V9 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 83/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec2, docs/lanes/review-ux-exec2.md:952, 25 lines — read the whole section first):
  V9 — IMPORTANT · The invite page reports a transport failure as a dead link, and sends the person to ask for a replacement
WHAT IS WRONG (the reviewer's words):
  `apps/web/app/invite/[token]/page.tsx:59-69` — `getInvite`'s rejection handler sets `invite = null` for **any** failure. The render at `:93-97` then shows: *"This invitation link does not open anything. It may have been used, withdrawn, or lapsed — ask whoever invited you for a new one."*
THE JUDGE'S LINE (the ruling rests on this; open it):
  invite/[token]/page.tsx:63-68 the rejection arm sets invite null ("A transport failure is not the same as a dead link, but…"); :93-97 renders "This invitation link does not open anything… ask whoever invited you for a new one"
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Make the state four-valued rather than three — keep `null` for the answered 404 and add a distinct failure arm that says the invitation could not be checked and offers a retry. The dead-link sentence then means what it says.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `invite/[token]/page.tsx:52-69` (the state, the effect, both arms) and `:91-98` (the three rendered arms).
JUDGE'S NOTE: VALID, judge opened. A transport failure is drawn as a dead link and sends the person to burn a working invitation, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `V9: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-V9 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-10  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 101

```
TASK T-E5-10 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 101/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:514, 23 lines — read the whole section first):
  E5-10 — IMPORTANT · A single-row "mark read" and the bulk Undo fail SILENTLY — the exact first-version defect the bulk path's own docblock says it fixed `[SOURCE]` (verifies exec 2's §2e "single-row mark-read and its Undo failing silently", unmeasured there)
WHAT IS WRONG (the reviewer's words):
  `apps/web/app/inbox/page.tsx:269-278` `markRead(id)`: optimistic flip, then `void gateway.markRead(id).catch(() => loadFirstPage());` — no sentence. `:344-357` `undoMarkAllRead()`: the same, `.catch(() => loadFirstPage())`. The bulk path `:300-340` renders `BULK_REFUSED_COPY` / `BULK_UNREACHED_COPY` and its docblock at `:319-333` records why: *"The first version of this catch reloaded and said NOTHING: a reader over the bound saw a click do nothing and the list snap back, with no sentence anywhere."*
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/inbox/page.tsx:278 void gateway.markRead(id).catch(() => loadFirstPage()); — a failure reloads and says nothing; :344-358 undoMarkAllRead the same; only markAllRead renders a sentence
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The same status-split sentence on both catches — `BULK_UNREACHED_COPY`'s sibling for a row, and a one-line "could not undo" beside the toast.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` lines above opened. Not driven: the owner's inbox is empty (`[BROWSER]` `/inbox` → `EMPTY_INBOX_COPY`) and I will not mint notifications in the owner's database.
JUDGE'S NOTE: VALID, judge opened. Single-row mark-read and bulk Undo fail silently — the first-version defect the bulk path's docblock says it fixed, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-10: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-10 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F4-ux  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 114

```
TASK T-F4-ux — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 114/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:496, 49 lines — read the whole section first):
  F4 — IMPORTANT · The visibility editor's read-only sentence can never render in the shipped app — and states the rule wrongly
WHAT IS WRONG (the reviewer's words):
  `packages/app-core/src/views/visibility-editor.tsx:441-443` renders, for a viewer who may not edit:
THE JUDGE'S LINE (the ruling rests on this; open it):
  visibility-editor.tsx:441-443 "Only a project admin, or whoever created this ticket, can change who sees it." — gated by canEdit (:361) which defaults true (ticket-sheet.tsx:2513/:422, no caller passes false); check-permission.ts:1058-60 ORs owner||admin||projectAdmin (the sentence understates who can)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One sentence, checked against `check-permission.ts` the way the sibling was: *"Only a project admin, a workspace owner or admin, or whoever created this ticket, can change who sees it."* And the dead arm should either be deleted or given the read that makes it reachable — the sheet's own docblock at `:225-241` argues at length that the client cannot know role or creator, which is a sound argument for showing the control and letting the door refuse; it is **not** an argument for keeping an unreachable sentence that is also wrong.
JUDGE'S NOTE: VALID, judge opened. Dead branch carrying a wrong rule statement; IMPORTANT because the wrong sentence is the one that WOULD render.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `F4: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F4-ux | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-V3  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 117

```
TASK T-V3 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 117/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:774, 25 lines — read the whole section first):
  V3 — IMPORTANT · A rejected visibility write leaves Apply permanently disabled and silent
WHAT IS WRONG (the reviewer's words):
  `VisibilityEditor.apply` begins by setting `{kind:'sending'}` (`visibility-editor.tsx:274`), then `await`s `dataSource.ingest([…])` (`:288`) with **no `try`/`catch`**, and the call site is `onClick={() => void apply()}` (`:428`) — a `void`, so the rejection is discarded entirely. The Apply button is `disabled={explicitNamesNobody || submission.kind === 'sending'}` (`:427`), and the only sentence the component can render is under `submission.kind === 'refused'` (`:433`), which is now unreachable. **Measured: the file contains 0 lines matching `try {` or `catch`.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  visibility-editor.tsx:427 disabled={explicitNamesNobody || submission.kind === 'sending'}; setSubmission at :274 (sending) then only :295/:299/:307/:308 after the await; grep finally → 0
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `try`/`catch` inside `apply`, restoring `submission` to `idle` and routing the rejection to a transport sentence — the shape `BulkCloseDialog` already uses two files away.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `visibility-editor.tsx:273-309` (the whole `apply`), `:427-428` (the control), `:433-438` (the only sentence arm); plus a count of `try`/`catch` lines in the file → **0**.
JUDGE'S NOTE: VALID, judge opened. A rejected write leaves Apply disabled with no sentence, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `V3: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-V3 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-18  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 121

```
TASK T-E5-18 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 121/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:768, 26 lines — read the whole section first):
  E5-18 — MINOR · The invite landing page offers Join or nothing: no Decline, no inviter, no expiry; the export draws all three — and its dead arm offers no link at all `[SOURCE]` `[BROWSER: dead arm]` — category 3, wire-limited
WHAT IS WRONG (the reviewer's words):
  `/invite/[token]` (`page.tsx:87-126`): *"You are invited to join **<ws>** as <role>."* + `Join <ws>`. The export (`EXPORT:1761-1789`; Decline `:1788`, Accept `:1789`): inviter name, workspace, role, member count, *"Invitation expires · In 4 days"*, a *"What a member can do"* tray, and a Decline/Accept pair. `Decline` exists in the product only on `/workspaces` (`workspaces/page.tsx:448-466`, `:553`) for invitations matched to the signed-in email.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/invite/[token]/page.tsx:94-96 — This invitation link does not open anything. It may have been used, withdrawn, or lapsed - ask whoever invited
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A Decline beside Join (the door exists), and expiry on the wire (the server holds `expires_at`, `routes/invites.ts:514-515`, `i.invited_by, i.invited_at, t.expires_at`).
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` lines above; `EXPORT:1761-1789`. The live arm not driven — I hold no live invitation token; the dead arm `[BROWSER]` as above.
JUDGE'S NOTE: VALID per verifier chunk25 (line opened by the verifier, not the judge): Live arm (:99-114) offers only Join or a sign-in link; dead arm is one <p> in a Card, no links. InviteSummary online/invites.ts:3-7 = {workspaceId,workspaceName,role}. Decline exists (workspaces/page.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-18: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-18 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-30  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 122

```
TASK T-E5-30 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 122/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:1139, 26 lines — read the whole section first):
  E5-30 — MINOR · The shared read-refusal panel on five routes says "… cannot be shown **yet**", appends the transport's raw string, and names no action; the workflow screens' sibling sentence names one `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  `apps/web/src/shell-refusal.tsx` (`ShellRefusal`, the last function in the file): `<p role="status"> <span>{what} cannot be shown yet.</span>{message}</p>`. `message` is the page's `error` string — `LiveQueryResult.error`, the stringified cause — so a 500 reads *"Your inbox cannot be shown yet. HTTP 500 for /v1/me/notifications"* (`inbox/page.tsx:446`), *"My Work cannot be shown yet. HTTP 500 for /v1/me/work"* (`my-work/page.tsx:71`), and the same on `/workspaces` (`:81`), the attention strip (`:65`), the roster (`members/page.tsx:397`) and the workflow draft (`workflows/[workflowId]/page.tsx:90`).
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/shell-refusal.tsx:41 (+ :40, :42, :23) — <span className="gn-shell__refusal-what">{what} cannot be shown yet.</span>
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  *"{what} could not be loaded — reload to try again."* with the wire string as a secondary line, and the 401 arm already routed elsewhere (`expired-session.tsx`) left as is.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `shell-refusal.tsx` render opened; the six call sites above (`grep -rn '<ShellRefusal' apps/web/app` → 6 mounts on 5 routes; the docblock counts the panel's reach as every refusing read); sibling sentences at `workflow-list-screen.tsx:200`, `workflow-builder-screen.tsx:89-91`.
JUDGE'S NOTE: PARTIAL per verifier chunk26 (line opened by the verifier, not the judge): Copy core holds: :41 'yet', :42 raw {message}, :40 role=status, no action; the 6 named sites exist verbatim; both siblings exist. FALSE SCOPE: the finding's OWN grep returns 14 mounts on 7 routes, not
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-30: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-30 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-26  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 137

```
TASK T-E2-26 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 137/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec2, docs/lanes/review-ux-exec2.md:1581, 27 lines — read the whole section first):
  E2-26 (r2) — MINOR · A single notification's read-state is reverted silently, where its bulk sibling speaks
WHAT IS WRONG (the reviewer's words):
  `apps/web/app/inbox/page.tsx:269-279` — `markRead` flips the row optimistically and then `void gateway.markRead(id).catch(() => loadFirstPage());`. The undo path is the same: `:344-357`, `void gateway.setRead(ids, false).catch(() => loadFirstPage());`. The **bulk** path 60 lines up classifies the failure and says so: `:335-340` ``` .catch((cause) => { setBulkFailure(cause instanceof HttpError && cause.status === 400 ? BULK_REFUSED_COPY : BULK_UNREACHED_COPY); loadFirstPage(); }); ```
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/inbox/page.tsx:278,:335-340,:357 — :278 void gateway.markRead(id).catch(() => loadFirstPage()); | :337 ? BULK_REFUSED_COPY : BULK_UNREACHED_COPY
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The single-row catch reuses the same two sentences the bulk path already has — one fact, one vocabulary, no new copy.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `inbox/page.tsx:266-279` (the optimistic flip and the silent catch); `:330-341` (the speaking sibling); `:343-358` (the undo, same shape).
JUDGE'S NOTE: VALID per verifier chunk09 (line opened by the verifier, not the judge): All 3 cites open as quoted: :278 and :357 reload silently; the bulk sibling :335-340 classifies and sets copy; the both-arms comment is :332-333. MINOR under the rubric's 'copy' line: the state restor
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-26: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-26 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-32  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 138

```
TASK T-E2-32 — batch B09 (Failure states on the web — reads and writes that speak) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 138/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:1842, 42 lines — read the whole section first):
  E2-32 (r2) — MINOR · A committed move does not clear the comment, so the next move submits the previous move's words
WHAT IS WRONG (the reviewer's words):
  `packages/app-core/src/views/transition-dialog.tsx:226` holds `const [comment, setComment] = useState('')`. Neither reset effect touches it: `:329-333` clears `evidenceAttachmentId`/`uploadError` on a destination change, and `:352-358` does the same on close. The dialog is mounted for the sheet's whole life (`ticket-sheet.tsx:2624`, `open={moveOpen}`), so after a committed move — which only calls `setMoveOpen(false)` (`:735`) — the comment is still in state. On the next Move, `:376` `if (needsComment) submission.comment = comment.trim();` puts it on the wire: **a comment written about move A is recorded as the comment for move B.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/views/transition-dialog.tsx:226 — const [comment, setComment] = useState('');
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Clear `comment`/`fieldValues` on a **committed** submit (the parent can signal it, or key the dialog per committed move) while keeping preserve-on-Cancel, which is what the docblock actually defends.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `transition-dialog.tsx:222-228` (the state), `:329-333` and `:352-358` (both resets, neither touching `comment`), `:336-351` (the docblock, including its own "invisible state" phrase), `:372-378` (the submit that carries it); `ticket-sheet.tsx:731-738` (`setMoveOpen(false)` and no clearing) and `:2624` (the dialog's mount).
JUDGE'S NOTE: VALID per verifier chunk10 (line opened by the verifier, not the judge): All 8 cited lines exact (grep -n pinned :226/:343/:348/:376). The docblock's stated reason names only Cancel ('a stray Cancel'), and the !open effect serves Cancel and Commit alike. ticket-sheet.tsx:2
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-32: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-32 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B10 — Paint — UA chrome, phone width, contrast, headings  ·  lane UI  ·  session model **haiku**  ·  backend **deepseek**  ·  27 tasks  ·  ~8.5 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec4` · branch `rel/b10-paint-ua-chrome-phone-width-cont` · packages touched: @gisik-nokma/app-core, @gisik-nokma/ui, @gisik-nokma/web.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E4-11` | haiku | I | 0.75 | `apps/web/app/globals.css:1801`, `docs/pre-launch-checklist.md:203-211` |
| 2 | `T-E4-13` | haiku | I | 0.75 | `packages/app-core/src/views/new-ticket-dialog.tsx:127-130`, `packages/ui/src/ui.css:2155`, `apps/web/app/globals.css:96` |
| 3 | `T-E4-14` | haiku | I | 0.75 | `packages/ui/src/ui.css:4981-4990` |
| 4 | `T-E4-3` | haiku | I | 0.75 | `packages/ui/src/ui.css:990-998`, `packages/app-core/src/views/board.tsx:1052-1059` |
| 5 | `T-E4-7` | haiku | I | 0.75 | `packages/ui/src/ui.css:1868` |
| 6 | `T-P1` | haiku | I | 0.75 | `apps/web/app/globals.css:84` |
| 7 | `T-P2` | haiku | I | 0.75 | `packages/ui/src/ui.css` |
| 8 | `T-E4-31` | haiku | I | 0.75 | `packages/ui/test/tokens.test.ts:1089`, `packages/ui/src/tokens.ts:476-479`, `packages/ui/test/tokens.test.ts:1089-1108` |
| 9 | `T-I2` | haiku | M | 0.25 | `apps/web/e2e-stack/non-text-contrast-roster.json` |
| 10 | `T-P24` | haiku | I | 0.75 | `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:373` |
| 11 | `T-E4-10` | haiku | M | 0.4 | `packages/app-core/src/workflow-builder/ui/template-gallery.tsx:13-19` |
| 12 | `T-E4-15` | haiku | M | 0.4 | `packages/ui/src/ui.css:3427-3434` |
| 13 | `T-E4-2` | haiku | M | 0.4 | `packages/ui/src/ui.css:719-728`, `packages/ui/src/components/sheet.tsx:99`, `packages/ui/src/components/sheet.tsx:97-99` |
| 14 | `T-E4-25` | haiku | M | 0.4 | `apps/web/app/globals.css:1286`, `apps/web/app/globals.css:1283-1288` |
| 15 | `T-E4-26` | haiku | M | 0.4 | `packages/ui/src/ui.css:1419`, `packages/app-core/src/views/ticket-list.tsx`, `test-cases/13-board-prototype-port.md:758-760` |
| 16 | `T-E4-27` | haiku | M | 0.4 | `packages/ui/src/ui.css:2745`, `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:135-140` |
| 17 | `T-E4-35` | haiku | M | 0.4 | `packages/ui/src/ui.css:4648`, `packages/ui/src/ui.css:4648-4662` |
| 18 | `T-E4-8` | haiku | M | 0.4 | `apps/web/app/layout.tsx:3-4`, `packages/editor/src/styles/editor.css:137-149`, `packages/ui/src/ui.css:5866-5871` |
| 19 | `T-P27` | haiku | M | 0.4 | `apps/web/e2e-viewport/viewports.ts:122-124`, `apps/web/e2e-viewport/viewports.ts:122-137` |
| 20 | `T-P35` | haiku | M | 0.4 | `packages/ui/src/ui.css:3427-3434`, `apps/web/app/globals.css:84`, `packages/app-core/src/timeline/timeline-view.tsx:236` |
| 21 | `T-E4-9` | haiku | I | 0.75 | `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx:131`, `apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx:57`, `packages/ui/src/ui.css:2968-2979` |
| 22 | `T-E4-32` | haiku | M | 0.4 | `packages/ui/src/ui.css:2279`, `packages/ui/src/tokens.ts` |
| 23 | `T-E4-24` | haiku | M | 0.4 | `packages/app-core/src/views/board.tsx:642` |
| 24 | `T-E4-36` | haiku | M | 0.4 | `packages/app-core/src/help/help-browser.tsx:207`, `packages/app-core/src/help/help-browser.tsx:207-209` |
| 25 | `T-P10` | haiku | M | 0.4 | `apps/web/e2e-stack/viewport.spec.ts:720`, `apps/web/e2e-viewport/accessible-names.ts:47-52`, `apps/web/e2e-stack/viewport.spec.ts:719-722` |
| 26 | `T-P17` | haiku | M | 0.4 | `apps/web/app/w/[workspaceId]/my-work/page.tsx:51`, `packages/app-core/src/views/my-work.tsx:75` |
| 27 | `T-P36` | haiku | M | 0.4 | `apps/web/app/w/[workspaceId]/settings/workflows/page.tsx:25`, `packages/app-core/src/workflow-builder/ui/workflow-list-screen.tsx:206`, `apps/web/app/w/[workspaceId]/settings/ticket-types/page.tsx:20` |

#### T-E4-11  ·  haiku  ·  IMPORTANT  ·  ~0.75 h  ·  rank 13

```
TASK T-E4-11 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.75 h — judged IMPORTANT — rank 13/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec4, docs/lanes/review-ui-exec4.md:230, 13 lines — read the whole section first):
  E4-11 — **IMPORTANT** — At 390 px the signed-in shell's navigation bar is 310 px tall — 37 % of the viewport — where the only prototype drawn at that width puts navigation in a bottom tab bar
WHAT IS WRONG (the reviewer's words):
  On the board at `emulate 390x844`, `.gn-nav` measures **390×310** (`getBoundingClientRect`); the links wrap to five rows (`Workspaces` y=13, `Convenience Corner` y=73, `Shop operations` y=133, `My Work`/`Members` y=193, `Settings` y=253, each 44 tall). Measured at scroll 0: the first group title is at **y=755**, the first column header at **y=802** and the first card at **y=1105** on an 844-px-tall phone — so with the nav, the title, search, workflow select, switch, Filters, New ticket and the view tabs each on their own row, **no ticket is on screen when the board opens** (the first group has three empty columns; the first card is 260 px below the fold) (screenshot `docs/lanes/exec4-paint/board-390.jpeg`, committed).
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/globals.css:1801 .gn-nav__links { display: flex; flex-wrap: wrap; … gap: 1rem … } with .gn-nav a,button min-height 2.75rem (:753) — five wrapped 44-px rows + gaps + padding = 309.6 px at 390 px (verifier arithmetic)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Below 40rem: collapse the workspace-scoped links into the mobile prototype's bottom bar or a single disclosure, keep the brand/inbox/account row at one line. If the owner rules the wrapped bar is acceptable, record that ruling at `globals.css:1801` — today the only sentence there says the growth is an *"understatement"*.
HOW IT WAS MEASURED (reproduce this before and after):
  `apps/web/app/globals.css:1801` `.gn-nav__links { display: flex; flex-wrap: wrap; … }` with no narrow-width variant (the file's `@media (max-width: 60rem)` at `:1799` changes padding only). The file's own docblock (`:1766-1770`) records *"measured at 190px on a signed-in workspace route at 500px wide … three rows"* and calls a media query a trade of *"one wrong value for another"* — an author's note about the offset variable, not a ruling on the shell. The wrap's origin is …
JUDGE'S NOTE: VALID, judge opened; the lane painted 310 px. A navigation bar taking 37 % of a phone viewport, IMPORTANT.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-11: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-11 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-13  ·  haiku  ·  IMPORTANT  ·  ~0.75 h  ·  rank 14

```
TASK T-E4-13 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.75 h — judged IMPORTANT — rank 14/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:257, 13 lines — read the whole section first):
  E4-13 — **IMPORTANT** — The New-ticket dialog's Title field is a bare `<input>` that paints as a 2-px inset user-agent box, 22 px tall, white, in a neumorphic dialog
WHAT IS WRONG (the reviewer's words):
  Open *New ticket* on the board. The first control a person types into is `<label class="gn-new-ticket__field">Title<input value=""></label>`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  new-ticket-dialog.tsx:127-130 <label className="gn-new-ticket__field">Title<input value={title} …/></label> — the input carries no class; ui.css has exactly two .gn-new-ticket rules (:2154 actions, :2155 field), so the UA box paints
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `className="gn-field__input"` — the class `passkeys-section.tsx:114-120` and `profile-section.tsx:40-46` already use for exactly this (per `state-inspector.tsx:9-15`'s own note), which carries the fill, radius, 44-px height and the `neo` sunken override.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, `:3041`, 1512, light).** `getComputedStyle(input)` → `border: 2px inset rgb(118,118,118)`, `background-color: rgb(255,255,255)`, `border-radius: 0px`, `padding: 1px 2px`, `font-size: 13.3333px`; `getBoundingClientRect` → **425×22**. Its two siblings in the same dialog (`Type`, `Parent`) are React Aria comboboxes inside `.gn-select__trigger` and paint at the product's 17 px in a border-less field. Source: `packages/app-core/src/views/new-ticket-dialog.tsx:127-130` — the …
JUDGE'S NOTE: VALID, judge opened. The primary dialog's Title field paints as raw user-agent chrome in a neumorphic sheet, IMPORTANT.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-13: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-13 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-14  ·  haiku  ·  IMPORTANT  ·  ~0.75 h  ·  rank 15

```
TASK T-E4-14 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.75 h — judged IMPORTANT — rank 15/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:271, 11 lines — read the whole section first):
  E4-14 — **IMPORTANT** — The active-filter chip's remove control is an 8×13 px "×"
WHAT IS WRONG (the reviewer's words):
  On Calendar and Timeline (and any view with a chip in the tray), `button.gn-project__filter-chip-remove` with `aria-label="Remove filter — Closed: hidden"`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ui.css:4981-4990 .gn-project__filter-chip-remove { border: none; background: none; padding: 0; margin: 0; font: inherit; line-height: 1; … } inheriting font-size 0.8125rem (:4972) — a 13-px-tall, ~8-px-wide control with no min size
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `min-width: 24px; min-height: 24px; display: inline-grid; place-items: center` on the button (the chip stays 26 tall), or make the whole chip the remove control with the × as its glyph.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, 1512).** `getBoundingClientRect` → **8.1×13**; `getComputedStyle` → `padding: 0`, `line-height: 13px`, `font-size: 13px`, `min-width/min-height: auto`. The chip itself (`span.gn-project__filter-chip`, 147×26) is a `<span>` with no handler. **The one larger equivalent is the Filters panel's own toggle** (`button.gn-filters__choice "Closed"`, 90×35, behind the *Filters* button) — so under WCAG 2.5.8's *Equivalent* exception the letter of the criterion is arguably met; the …
JUDGE'S NOTE: VALID, judge opened. A remove control far under the 44/24 tap floor, IMPORTANT.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-14: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-14 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-3  ·  haiku  ·  IMPORTANT  ·  ~0.75 h  ·  rank 16

```
TASK T-E4-3 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.75 h — judged IMPORTANT — rank 16/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:119, 15 lines — read the whole section first):
  E4-3 — **IMPORTANT** — Every board card carries a 66×21 px `who · when` disclosure button that no sweep has ever measured and that no floor rule admits
WHAT IS WRONG (the reviewer's words):
  `button.gn-board-card__provenance` — toggles the state-provenance line on each card (`aria-expanded`). It is not the card's open control; nothing larger performs its function.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ui.css:990-999 the provenance disclosure rule has no min-height/min-width (grep → 0); e2e-viewport/responsive.spec.ts:678 is a SECOND measureTapTargets call (signed-out routes only), so the "only call" absolute is false; the board is in neither suite
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either give the control a 24-px floor in `ui.css` with the in-list argument written in the rule and a `DENSE_IN_LIST` entry (control `.gn-board-card__provenance`, container `.gn-board__cards`, witness `.gn-board__card-slot`) — the file's own documented procedure — or move the disclosure onto a 24-px-tall row. And add the board route to the stack suite's tap-target pass.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, `:3041`, board `/w/…/p/0XB92YA4CGEBF9S285AH4SDXR1`, 1512×900).** My in-page sweep with the product's own selector list (`tap-targets.ts:268-280`) and visibility filter: **24 instances** (one per card; `document.querySelectorAll('button.gn-board-card__provenance').length` → 24, `.gn-board-card` → 24), each `66×21`, `display: inline-block`, not inline-in-prose (the exemption at `:341-343` requires `display: inline`). Source: `packages/ui/src/ui.css:990-998` — `font-size: …
JUDGE'S NOTE: PARTIAL→scored at IMPORTANT, judge opened. A 66×21 px control on every board card that no sweep measures and no floor rule admits; the absolute is corrected, the core holds.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-3: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-3 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-7  ·  haiku  ·  IMPORTANT  ·  ~0.75 h  ·  rank 17

```
TASK T-E4-7 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.75 h — judged IMPORTANT — rank 17/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:176, 13 lines — read the whole section first):
  E4-7 — **IMPORTANT** — At phone width the ticket sheet's description is clipped: the field row keeps its 8-rem label column, the editor gets 224 px of a 367-px sheet, and its text paints past the sheet's right edge
WHAT IS WRONG (the reviewer's words):
  `emulate 390x844`, sheet open on `CCSO-6`. The description editor (`div.tiptap.ProseMirror`) measures **224×3195**; its container `dd` spans `x 178.6 → 402.7` while the sheet ends at `x 390` and the sheet body is `366.6` wide. Words are cut at the right edge — the screenshot (`docs/lanes/exec4-paint/sheet-390-description.jpeg`, committed with this report, taken from `:3041`) shows *"as o"*, *"the"*, *"screens"*, *"look"* truncated mid-glyph. The toolbar (`div.ticket-editor__toolbar`) also reports `right=403`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ui.css:1868 .gn-ticket-sheet__field { display: grid; grid-template-columns: 8rem 1fr; … } — the only rule for that class (grep → 1), no phone-width override
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `@media (max-width: 40rem) { .gn-ticket-sheet__field { grid-template-columns: 1fr; } }` (the breakpoint `ui.css:2728` already uses), `min-width: 0` on the `dd`, and hide `.gn-sheet__full` below the same width. One painted case at 390 asserting `dd.right <= sheet.right`.
HOW IT WAS MEASURED (reproduce this before and after):
  `getComputedStyle(field)` → `display: grid; grid-template-columns: 128px 224.094px` — `packages/ui/src/ui.css:1868`: `.gn-ticket-sheet__field { display: grid; grid-template-columns: 8rem 1fr; … }` with **no narrow-width override** (the file's four `@media (max-width…)` blocks are at `:2728`, `:3017`, `:4452`, `:4612`; none names `.gn-ticket-sheet__field`). The `dl` itself is `display: block`. `document.documentElement.scrollWidth` = 390 and the sheet's `scrollWidth` = 367, so the overflow is …
JUDGE'S NOTE: VALID, judge opened; the lane painted it at 390 px. The description editor is clipped at phone width, IMPORTANT.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-7: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-7 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P1  ·  haiku  ·  IMPORTANT  ·  ~0.75 h  ·  rank 21

```
TASK T-P1 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.75 h — judged IMPORTANT — rank 21/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:184, 34 lines — read the whole section first):
  P1 — **IMPORTANT** ⚠ **r2 CORRECTION — SIX, NOT SEVEN: the seventh was refuted by an ancestor rule and is withdrawn** — interactive controls styled by no rule of their own
WHAT IS WRONG (the reviewer's words):
  **Eight source sites, six distinct controls** (filed as nine and seven — see the withdrawal below), where **no class on the element matches any selector block** in the product's three stylesheets.
THE JUDGE'S LINE (the ruling rests on this; open it):
  board.tsx:494 <button type="button" className="gn-board__empty-create" …> — no rule for that class in ui.css/globals.css (verifier: 6 of 6 classes measured)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One shared bare-control reset — `border:none; background:transparent; padding:0; font:inherit; color:inherit` — applied as a class (the shape `button.gn-ticket-sheet__crumb--link` already uses at `ui.css:672`), or per-class rules for the six. The `.gn-*` convention in `ui.css` already exists for exactly this; these six simply never joined it.
HOW IT WAS MEASURED (reproduce this before and after):
  Extracted all **702 selector blocks** from `ui.css` (comments stripped), plus `globals.css` and `editor.css`; for each static `className` literal on a `<button|input|select|textarea|summary|a>`, required that **at least one** of its class tokens matches a selector block. Nine results; `nodrag` (`state-node.tsx:47`) is React Flow's own marker and is excluded as not ours. **Positive control, same extractor, same path: `.gn-board-card__move` → 4 blocks; `.ticket-type-list__move` → 3 blocks.** The …
JUDGE'S NOTE: PARTIAL→scored VALID at IMPORTANT, judge opened one site + verifier opened 8/8. Six interactive controls paint as raw UA chrome; the "every descendant selector" enumeration overclaims (16 found, 13 listed) — noted, core holds.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `P1: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P1 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P2  ·  haiku  ·  IMPORTANT  ·  ~0.75 h  ·  rank 22

```
TASK T-P2 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.75 h — judged IMPORTANT — rank 22/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec1, docs/lanes/review-ui-exec1.md:219, 19 lines — read the whole section first):
  P2 — **IMPORTANT** — The board's whole-board empty state has no prototype counterpart, and is the one board empty state with no styling
WHAT IS WRONG (the reviewer's words):
  `board.tsx:528` renders `<div className="gn-board gn-board--empty">`; `:490` renders `gn-board__empty-copy`; `:494` renders `gn-board__empty-create`. **All three have zero selector blocks.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  board.tsx:528 return <div className="gn-board gn-board--empty">{emptyBanner}</div>; — gn-board__empty appears in ui.css only inside comments (:835, :4980)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Style the three classes from the prototype's shared control constant (the same constant `981aa92b` reused for `.ticket-type-list__move` — fill-tertiary + text-accent + control radius, no border), and record the whole-board banner as a deliberate addition in `Features.md` with its rationale, so a later reader does not "correct" it back toward a prototype that has no such state.
HOW IT WAS MEASURED (reproduce this before and after):
  Selector extraction over `ui.css` for the `gn-board__empty` family returns **no selector blocks at all** — the only two hits in the file are *comments* (`ui.css:835`, `:4980`). `/usr/bin/git log -S'gn-board__empty-create' -- packages/ui/src/ui.css` → a single commit, `b1dda062`, and the extraction shows it added a mention, not a rule. **Contrast measured the same way: the product's per-column sibling *is* styled** — `.gn-board__column-empty` (`ui.css:846`), `-icon` (`:869`), `-copy` (`:885`).
JUDGE'S NOTE: VALID, judge opened + verifier measured against the export. The whole-board empty state is the one board empty state with no styling and no prototype counterpart.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `P2: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P2 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-31  ·  haiku  ·  IMPORTANT  ·  ~0.75 h  ·  rank 32

```
TASK T-E4-31 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.75 h — judged IMPORTANT — rank 32/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:487, 11 lines — read the whole section first):
  E4-31 — **IMPORTANT** — Ghost buttons placed on a sunken row paint at **3.99:1** (light) / **4.00:1** (dark) in `hig` and `minimal` — an accent-on-fill-over-sunken composite that case 13.360 does not measure, on three routes
WHAT IS WRONG (the reviewer's words):
  `button.gn-button--ghost` inside `li.gn-mcp-tokens__row` (`/account` *Connected assistants* and `/mcp/tokens`: *Name the connection…*, *Revoke*), inside the sessions rows, and `button.gn-button--ghost.fields-editor__required` (*Optional* / *Required*) on the type editor.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/ui/test/tokens.test.ts:1089 it('13.360 textAccent clears 4.5 against the fillTertiary-composited control background and surfaceSunken') — measures neither fillTertiary-over-surfaceSunken (3.997 light / 3.973 dark, verifier reproduced)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Add the third composite to 13.360 (`textAccent` on `fillTertiary` over `surfaceSunken`, all six style×theme) — it reddens today — then either lift the rows off `surfaceSunken`, use the `--primary` variant on sunken rows, or step `textAccent` down again in `hig`/`minimal`.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, 1512, `data-style` set client-side).** Light, `hig` and `minimal`: text `rgb(50,93,151)` on the composited `rgb(207,199,192)` → **3.99:1** at 16 px. Dark (`emulate colorScheme: dark`), `hig` and `minimal`: `rgb(139,177,230)` on `rgb(65,73,109)` → **4.00:1** (my in-page composite carried fractional channels; exec 1's phase-2 arithmetic from the rounded colours gives 3.97 — under 4.5 either way). `neo`, both themes: no failure. The chain, opened: `button.gn-button--ghost` …
JUDGE'S NOTE: PARTIAL→scored at IMPORTANT, judge opened. Ghost buttons on a sunken row paint under 4.5:1 in hig/minimal and no case measures that pair; one named placement (sessions rows: variant="danger", sessions-section.tsx:84) is false, the other three hold.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-31: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-31 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-I2  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 35

```
TASK T-I2 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 35/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:123, 17 lines — read the whole section first):
  I2 — **IMPORTANT** — The `e2e-stack` suite's committed artefact records a defect that was fixed eight hours later, and nothing in the file says which run produced it
WHAT IS WRONG (the reviewer's words):
  `apps/web/e2e-stack/non-text-contrast-roster.json` records `"belowCount": 1` with `button.ticket-type-list__move` at **1.41:1**. That class was fixed on 2026-09-20. The artefact was never regenerated.
THE JUDGE'S LINE (the ruling rests on this; open it):
  non-text-contrast-roster.json:2 "belowCount": 1 / :17 "selector": "button.ticket-type-list__move" — no sha/date field among the 20 keys
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Stamp the artefact with the head sha and timestamp it was produced at (a three-line change at the `writeFileSync` call), and say in the file itself when a later commit supersedes an entry. Then the file is a measurement with provenance instead of an unattributed number.
HOW IT WAS MEASURED (reproduce this before and after):
  - The artefact's last writer is commit **`8e742d18`** (`/usr/bin/git log -1 --format=%h%ad -- apps/web/e2e-stack/non-text-contrast-roster.json` → `8e742d18 Sun Sep 20 03:28:49 2026`), whose message says the class "has NEVER had a CSS rule" and that the entry is "NOT a contrast defect". - The fix is commit **`981aa92b`** (`Sun Sep 20 11:27:29 2026`), which adds `.ticket-type-list__move` at `ui.css:5836`, `:5851`, `:5855` — **verified by selector extraction, with `ticket-type-list__move` → 3 …
JUDGE'S NOTE: VALID, judge opened + verifier chunk01. A committed artefact recording a since-fixed defect with no provenance = drift, MINOR.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `I2: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-I2 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P24  ·  haiku  ·  IMPORTANT  ·  ~0.75 h  ·  rank 39

```
TASK T-P24 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.75 h — judged IMPORTANT — rank 39/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec1, docs/lanes/review-ui-exec1.md:658, 19 lines — read the whole section first):
  P24 — **IMPORTANT** ⚠ **r2 NEW** — A painted text colour measures 3.84:1 at 12.8px, and it is UNDECLARED, so the gate cannot see it
WHAT IS WRONG (the reviewer's words):
  `ui.css:2736-2743` sets `.ticket-type-editor__issues { background: var(--gn-surface-sunken); font-size: 0.8rem; color: var(--gn-danger); }`. In `hig` and `minimal`, **both themes**, `danger` on `surfaceSunken` measures **3.84:1** (`hig/light`) and **4.19:1** (`hig/dark`). The text is **12.8px** — far below the large-text exemption — so **WCAG 2.2 §1.4.3 *Contrast (Minimum)* requires 4.5:1, and 3.84 does not meet it.** And the pair is **not in `CONTRAST_PAIRS`**, so `tokens.test.ts`'s enforcement loop never evaluates it.
THE JUDGE'S LINE (the ruling rests on this; open it):
  ui.css:2736-2743 .ticket-type-editor__issues { background: var(--gn-surface-sunken); … color: var(--gn-danger); } — no danger-on-sunken pair in tokens.ts (verifier: :1225 is the only danger row, 34 pairs)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either raise `danger`'s darkness in `hig`/`minimal`, or use `dangerText` on the sunken surface, or take the element off `surfaceSunken` — and **add `{ fg: 'danger', bg: 'surfaceSunken', minimum: 4.5 }` to `CONTRAST_PAIRS` either way**, so the pair is checked rather than merely fixed. The second half is the one that generalises: a sweep in the shape the extraction used here — every rule painting a token colour on a token surface, each pair required to appear in `CONTRAST_PAIRS` — is a **gate-able** check (it reads two files and needs no browser), and it is the instrument this regime has never had.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — and this one needed a WRONG first answer thrown away, which is part of the finding.** - **The undeclared-pair sweep.** Every rule in `ui.css` that sets both `color: var(…)` and `background: var(…)` from tokens was extracted — **46 such rules against 34 declared pairs** — and **14 of those rules name a pair with no `CONTRAST_PAIRS` row, which is 7 distinct pairs**. - **⚠ MY FIRST RATIO CALCULATION WAS MEANINGLESS AND I THREW IT OUT.** It treated the fills as opaque and reported …
JUDGE'S NOTE: VALID, judge opened; verifier reproduced both ratios. Contrast pair absent from the roster = accessibility, IMPORTANT. The finding's hig-dark value list has one wrong hex (noted by the verifier); core holds.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `P24: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P24 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-10  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 45

```
TASK T-E4-10 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 45/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:218, 11 lines — read the whole section first):
  E4-10 — **MINOR** — The workflow template gallery's four buttons paint as raw user-agent chrome — a population round 1's sweep could not see, because they carry no class at all
WHAT IS WRONG (the reviewer's words):
  `/w/<id>/settings/workflows/new`: `button "Use this template — Simple kanban"`, `… — Errand with waits`, `… — Approval chain`, `button "Start blank"`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/workflow-builder/ui/template-gallery.tsx:13-19 and :23-25 — <button type="button" aria-label={`Use this template — ...`}> and <button type="button"> — neither has a class
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The shared `<Button>` (the file's own sibling `workflow-builder-screen.tsx:42` comment says why: *"The shared `Button`, not a bare `<button>`"*).
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, 390 and unchanged in shape at 1512).** My sweep's UA-chrome detector (`borderTopStyle === 'outset'` or the UA's `rgb(239,239,239)` fill) flagged exactly these four on the route; sizes `143×29` ×3 and `95×29`. Source: `packages/app-core/src/workflow-builder/ui/template-gallery.tsx:13-19` and `:23-25` — `<button type="button" …>` with **no `className`**. Round 1's P1 population was *"each static `className` literal on a `<button|input|…>`"*, so a class-less button was …
JUDGE'S NOTE: VALID per verifier chunk19 (line opened by the verifier, not the judge): 4 class-less buttons confirmed (3 templates + Start blank); zero CSS so UA chrome follows; globals.css:84 is button{font:inherit} only. Recorded as a GAP not a ruling — ui.css:2913-2918 "template-gall
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-10: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-10 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-15  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 46

```
TASK T-E4-15 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 46/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:283, 11 lines — read the whole section first):
  E4-15 — **MINOR** — The timeline's Earlier / Today / Later buttons paint with the browser's 2-px outset bevel: the class HAS a rule, and the rule forgot the border
WHAT IS WRONG (the reviewer's words):
  `button.gn-timeline__nav` ×3 on the Timeline view.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/ui/src/ui.css:3427-3434 (+ .gn-calendar__nav:3098, prototype Desktop.dc.html:511) — .gn-timeline__nav { border-radius: 6px; background: var(--gn-surface-raised); font: inherit; cursor — no borde
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `border: none; min-height: 36px; background: var(--gn-fill-tertiary); color: var(--gn-text-accent)` — the calendar nav's own values.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, 1512, light and dark).** `getComputedStyle` → `border: 2px outset rgb(0,0,0)` with the product's own `background: rgb(241,234,227)`, `border-radius: 6px`, `padding: 3.2px 9.6px` — i.e. the rule applied and the UA border survived. Source: `packages/ui/src/ui.css:3427-3434` sets `border-radius`, `background`, `color`, `font`, `padding`, `cursor` and **no `border`**. This is outside round 1's P1 population by construction: P1 selected classes with **zero** matching selector …
JUDGE'S NOTE: VALID per verifier chunk19 (line opened by the verifier, not the judge): Membership enumerated, not first-hit: no border in either .gn-timeline__nav block, and ui.css has no bare button reset (2 button.<class> selectors only), so the UA bevel survives. Prototype :511 opene
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-15: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-15 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-2  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 47

```
TASK T-E4-2 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 47/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:103, 15 lines — read the whole section first):
  E4-2 — **MINOR** — The ticket sheet's and the dialog's Close glyph paints at 24×21 px — no rule gives it a size, the prototype draws a 32-px filled circle, and the only larger pointer equivalent is the invisible scrim
WHAT IS WRONG (the reviewer's words):
  `button.gn-sheet__close` ("×", `aria-label="Close sheet"`) — the visible pointer control for leaving the product's most-used overlay. **Corrected before the freeze, and recorded rather than tidied:** my first draft said *"no other pointer control closes the sheet"* after a `[class*="backdrop"]` query returned null. That query was the wrong needle — the scrim is `div.gn-sheet__scrim` with `onClick={onClose}` (`packages/ui/src/components/sheet.tsx:97-99`; the dialog's is `dialog.tsx:17`). Clicking outside closes both. So this is **not** a WCAG 2.5.8 failure in the strict sense (the scrim is a pointer *equivalent*); it is a control 21 px tall whose equivalent is an unmarked area a person has to know about, and the severity is set accordingly.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/ui/src/ui.css:719-728; packages/ui/src/components/sheet.tsx:99,111; dialog.tsx:17 — .gn-dialog__close, .gn-sheet__close { font: inherit; font-size: 1.2rem; line-height: 1; border: none; backgrou
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The prototype's own numbers: `min-width: 32px; min-height: 32px; border-radius: 999px; background: var(--gn-fill-tertiary)` — or the product's 44 — on `.gn-sheet__close`; and one sweep that opens a sheet before measuring.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, `:3041`, 1512×900, sheet open).** `getBoundingClientRect()` → `w 23.59, h 21.20`; `getComputedStyle` → `padding: 1px 6px` (the UA's), `min-width: auto`, `min-height: auto`, `font-size: 19.2px`, `background: rgba(0,0,0,0)`. Escape also closes it (measured); the scrim closes it on click (source, above). Source: `packages/ui/src/ui.css:719-728` (`.gn-dialog__close, .gn-sheet__close`) sets `font`, `font-size: 1.2rem`, `line-height: 1`, `border: none`, `background: none`, …
JUDGE'S NOTE: VALID per verifier chunk18 (line opened by the verifier, not the judge): All citations exact, incl. ui.css:506-512's 44-vs-32 docblock. Prototype :1121 is a 32px circle. Painted 24x21 not reproduced (:3041 dead). "No sweep opens a sheet" holds: UNAUTHED_ROUTES = /help,/pri
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-2: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-2 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-25  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 48

```
TASK T-E4-25 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 48/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec4, docs/lanes/review-ui-exec4.md:409, 10 lines — read the whole section first):
  E4-25 — **MINOR** — The Settings sidebar's three section links are 39 px tall; the prototype's are `min-height:44px`, the file says so, and calls it out of scope
WHAT IS WRONG (the reviewer's words):
  The four declarations the docblock already names, on the rule it already annotates.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/globals.css:1286 — padding: 0.5rem 0.7rem; (inside the rule .gn-settings__sidebar a, :1283-1288 - no min-height anywhere in it)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The four declarations the docblock already names, on the rule it already annotates.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, `/settings?workspaceId=…`, 390 and — padding-driven, so — every width).** `nav.gn-settings__sidebar a` ×3 (`Ticket types` with `aria-current="page"`, `Workflows`, `Workspace`): **232×39**, `display: block`, `padding: 8px 11.2px`, `min-height: auto`. Source: `apps/web/app/globals.css:1283-1288` (`padding: 0.5rem 0.7rem`, no min-height). The docblock above it (`:1263-1266`): *"THE ITEM'S OTHER METRICS AT `:3145` ARE STILL NOT PORTED — `min-height:44px`, `padding:0 14px`, …
JUDGE'S NOTE: VALID per verifier chunk21 (line opened by the verifier, not the judge): All 4 citations open exactly. DENSE_IN_LIST holds 4 entries, none the settings sidebar; the stack tap route list (e2e-stack/viewport.spec.ts:469-512) is 7 routes with no bare /sett.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-25: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-25 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-26  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 49

```
TASK T-E4-26 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 49/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:420, 10 lines — read the whole section first):
  E4-26 — **MINOR** — In the List view the only two per-row controls — the collapse caret (22×22) and the title button (22 px tall) — sit under the product's own 24-px in-list floor, the row has no whole-row door, and the list route is swept by neither suite
WHAT IS WRONG (the reviewer's words):
  `1.5rem` on both rules (the same 24 `.gn-my-work__title` and `.gn-attention__title` got on 2026-09-08), and the List view in the stack suite's route list with a `DENSE_IN_LIST` entry for each.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/ui/src/ui.css:1419 — min-width: 1.375rem; (with :1420 min-height: 1.375rem; and :1433 .gn-list__open { ... line-height: 1.375rem;
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `1.5rem` on both rules (the same 24 `.gn-my-work__title` and `.gn-attention__title` got on 2026-09-08), and the List view in the stack suite's route list with a `DENSE_IN_LIST` entry for each.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, List view, 1512).** `button.gn-list__collapse "Collapse Open questions"` **22×22**; `button.gn-list__open "Open questions"` **125×22** (×26 rows, `17px/22px`). `grep -n onClick packages/app-core/src/views/ticket-list.tsx` → three handlers (`:508` the Columns toggle, `:889` the caret, `:927` the title) — **no `<tr>`/row handler**, so unlike the board card (`13.523`) there is no larger equivalent target. Source: `ui.css:1419-1420` (`min-width/min-height: 1.375rem` = 22) …
JUDGE'S NOTE: VALID per verifier chunk21 (line opened by the verifier, not the judge): Every citation opens exactly, incl. test-cases/13-board-prototype-port.md:758-760 "gets a real min-width/min-height: 22px tap target" and the 2026-09-20 owner ruling at :26-27. Con.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-26: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-26 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-27  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 50

```
TASK T-E4-27 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 50/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:431, 14 lines — read the whole section first):
  E4-27 — **MINOR** — The ticket-type editor's *Save ticket type* is a page-local `<button>` at 36 px with a 1-px border and a 6-px radius, beside a shared `Button` that is 44 px, border-less and control-radiused — and the prototype's is 44
WHAT IS WRONG (the reviewer's words):
  `<Button variant="primary">` on both, which is one import each and deletes two rules.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/ui/src/ui.css:2745 — .ticket-type-editor__save { (:2747 border: 1px solid var(--gn-accent); :2748 border-radius: 6px; no min-heig
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `<Button variant="primary">` on both, which is one import each and deletes two rules.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, `/settings/ticket-types/errand` and `/new`, 390 and 768 — padding-driven).** `button.ticket-type-editor__save "Save ticket type"` **146×36**. Source: `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:135-140` renders a bare `<button className="ticket-type-editor__save">`; `ui.css:2745-2754` gives it `border: 1px solid var(--gn-accent); border-radius: 6px; padding: 0.35rem 0.9rem` and no `min-height`. The shared `.gn-button` …
JUDGE'S NOTE: VALID per verifier chunk21 (line opened by the verifier, not the judge): The enumerated roster (18/13/14/4) reproduces with the identical control set. .gn-button:61-68 = min-height 2.75rem + radius-control; the Publish rule :2297-2306 is the same idiom;.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-27: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-27 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-35  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 51

```
TASK T-E4-35 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 51/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:531, 12 lines — read the whole section first):
  E4-35 — **MINOR** — `.gn-segmented__item` sets no horizontal padding, so where the track is content-sized the *All* tab on `/inbox` paints **31 px wide** — the prototype's segment carries `padding:0 16px`
WHAT IS WRONG (the reviewer's words):
  `padding: 0 1rem` on `.gn-segmented__item` (the prototype's 16 px), which changes nothing on the board (the track already fills) and makes *All* ~63 px on `/inbox`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/ui/src/ui.css:4648 — .gn-segmented__item {
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `padding: 0 1rem` on `.gn-segmented__item` (the prototype's 16 px), which changes nothing on the board (the track already fills) and makes *All* ~63 px on `/inbox`.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, `/inbox`, 1512, owner).** `[role=tablist][aria-label="Filter notifications"]` → `All` **31×44**, `Unread` 64×44, `Mentions` 78×44; each item `padding: 1px 6px` (the UA's), `min-width: auto`. On the board the same class paints 92×44 because that track fills its row (`flex: 1` shares free space); in `div.gn-inbox__header` (`globals.css:2880-2886`, `display:flex; justify-content: space-between`) the track is content-sized and `flex: 1` has nothing to share. Source: …
JUDGE'S NOTE: VALID per verifier chunk22 (line opened by the verifier, not the judge): Rule :4648-4662 has no padding/min-width; docblock :4641-4647 is height-only. globals.css:2880-2886 is flex/space-between so the track is content-sized. Prototype Desktop.dc.html:2. The verifier would raise it to IMPORTANT; no upward re-grading by policy.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-35: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-35 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-8  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 52

```
TASK T-E4-8 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 52/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec4, docs/lanes/review-ui-exec4.md:190, 13 lines — read the whole section first):
  E4-8 — **IMPORTANT** — The editor's formatting strip is the one control family in the neumorphic sheet drawn with hard 1-px outlines, and the two recorded reasons that leave it that way rest on a false premise
WHAT IS WRONG (the reviewer's words):
  In the sheet (style `neo`, light), `button.ticket-editor__tool` paints `border: 1px solid rgb(32,43,73)` (the label ink), `background: transparent`, `box-shadow: none`; the strip `div.ticket-editor__toolbar` has the same outline on three sides. Every neighbouring control — `.gn-button--ghost`, `.gn-segmented__item`, `.gn-select__trigger`, `.gn-field__input` — is border-less fill (the borders→fills campaign). The screenshot above shows it: six outlined boxes and an outlined rule over a soft-fill sheet.
THE JUDGE'S LINE (the ruling rests on this; open it):
  editor.css:117-125 "`packages/editor` does not depend on `packages/ui`, so no token from `tokens.ts` is reachable"; apps/web/app/layout.tsx:3-4 imports ui.css AND editor.css into one document — custom properties cascade from the document
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  In `editor.css`: `border: none; background: var(--gn-fill-tertiary); box-shadow: var(--gn-shadow-raised)` on `.ticket-editor__tool` (two roles `ui.css` already uses — `var(--gn-fill-tertiary)` **22** times and `var(--gn-shadow-raised)` **14** times, `grep -o | wc -l`; the first draft of this parenthesis said "14 and 19", which were the shadow-raised and shadow-sunken counts mis-assigned — corrected 15:22 IST after exec 1's phase-2 check), the strip on `var(--gn-fill-quaternary)` — **no fallback value**, so an undefined variable resolves to `initial` (transparent / none), which is exactly today's paint in the token-less mobile webview. **Checked against the scanner rather than assumed:** `packages/ui/test/helpers/colour-scan.ts:70-79` matches a hex (`#[0-9a-fA-F]{3,8}`) in a CSS value or a string, and the functions `rgb|rgba|hsl|hsla|oklch|oklab|color-mix(`; a `var(--gn-…)` reference matches neither. The header's third prohibition (a bare colour *keyword*, `:1-9`) is why I do not propose `transparent` as the fallback. No test in `packages/editor/test` constrains `var()` in the …
HOW IT WAS MEASURED (reproduce this before and after):
  `getComputedStyle` on `.ticket-editor__tool` (painted values above). Source: `packages/editor/src/styles/editor.css:137-149` (`border: 1px solid currentColor; background: none`), `:126-136` (the strip). The docblock at `:114-125` records why: *"THE FILL IS NOT TRANSCRIBED, and it cannot be: … THIS FILE'S HEADER forbids colour of every kind here — `packages/editor` does not depend on `packages/ui`, so no token from `tokens.ts` is reachable."* The other side, `packages/ui/src/ui.css:5866-5871`: …
JUDGE'S NOTE: VALID at MINOR, judge opened. The finding correctly refutes the recorded reason for the hard 1-px outlines; the defect itself is style consistency. Scored below the claimed severity.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-8: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-8 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P27  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 55

```
TASK T-P27 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 55/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:759, 14 lines — read the whole section first):
  P27 — **MINOR** ⚠ **r2 NEW** — The viewport suite's narrowest width is 390px; WCAG 1.4.10 Reflow specifies 320px, which `320` appears nowhere in either suite to test
WHAT IS WRONG (the reviewer's words):
  WCAG 2.2 §1.4.10 *Reflow* is **Level AA** and names a number: content must reflow to **320 CSS px** without two-dimensional scrolling. **The narrowest width this product is ever measured at is 390px.** `grep -rc "320"` over `apps/web/e2e-viewport/*.ts` and `apps/web/e2e-stack/*.spec.ts` returns **no non-zero count** — the value does not appear.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/e2e-viewport/viewports.ts:122-124 — 'phone-390': { width: 390, height: 844, device: 'iPhone 13', narrow40rem: true, narrow60rem: true }
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A fourth entry in `VIEWPORTS` — `phone-320` at 320×568 — costs one object literal and puts the criterion's own number under the three sweeps that already run per viewport (tap targets, label text, accessible names, contrast), all of which assert per-width baselines. **The existing suite would then measure 1.4.10 rather than approach it.**
HOW IT WAS MEASURED (reproduce this before and after):
  - **The width list**, read from `apps/web/e2e-viewport/viewports.ts:122-137`: `phone-390` **390**, `tablet-768` **768**, `desktop-1512` **1512**. Three widths, and the narrowest is 390 — **70px above the criterion's number**. - **The product appears to SATISFY it, and I checked the two ways it could fail.** Sweeping all three stylesheets for widths that would defeat reflow at 320px: **`min-width` above 320px → exactly one**, `.gn-members__table { min-width: 820px }` in `globals.css`; **fixed …
JUDGE'S NOTE: PARTIAL per verifier chunk04 (line opened by the verifier, not the judge): Core holds: widths 390/768/1512, 320 absent from both suites; CONTROL 390=8 proves grep finds bare numbers. PARTIAL: "min-width above 320px -> exactly one" is false - ui.css:1477 .gn-list__table min-w
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `P27: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P27 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P35  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 56

```
TASK T-P35 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 56/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec1, docs/lanes/review-ui-exec1.md:969, 22 lines — read the whole section first):
  P35 — **MINOR** ⚠ **r2 NEW — PHASE 2 (written before the 15:05:23 freeze but not committed until after it; scores at HALF per rules §2, no claim otherwise)** — The timeline's nav buttons keep the browser's default bevel, and P1's sweep could not see it: the rule EXISTS, the property is missing
WHAT IS WRONG (the reviewer's words):
  `.gn-timeline__nav` — the three Earlier / Today / Later buttons on the timeline (`packages/app-core/src/timeline/timeline-view.tsx:234-262`, three `<button type="button">`s with that class and no other) — is styled by a rule that declares a radius, a background, a colour, padding and a cursor, **and no `border`**. The product's only global button reset is font-only, so the control keeps the user agent's default **`2px outset` border**: a raised 3D bevel, in a flat design system, on a control that sits directly beside the timeline's bars.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/ui/src/ui.css:3427-3434 .gn-timeline__nav { border-radius; background; color; font; padding; cursor } — no border property; :3532 and :3585 border: none on .gn-timeline__bar / .gn-timeline__open; apps/web/app/globals.css:84 button { font: inherit; } is the only top-level button rule in either stylesheet (grep '^button' → globals.css:84 only; ui.css's two are class-qualified); packages/app-core/src/timeline/timeline-view.tsx:236,:248,:255 the three buttons
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One property — `border: none;`, which both of the family's other members already carry. **And the generalisable half:** P1's sweep should assert that a control's matched rule declares `border` (or that a global reset does), because *"matched a selector block"* and *"is fully styled"* are different questions. **The export is the cheaper check here, and it found it in one comparison.**
HOW IT WAS MEASURED (reproduce this before and after):
  1. **The rule, read in full** — `packages/ui/src/ui.css:3427-3434`: `border-radius: 6px; background: var(--gn-surface-raised); color: var(--gn-text); font: inherit; padding: 0.2rem 0.6rem; cursor: pointer;`. **No `border` property appears.** 2. **And the only reset that would have covered it is font-only** — `apps/web/app/globals.css:84`: `button { font: inherit; }`, the sibling of `:96`'s `input, textarea, select { font-family: inherit }`. **This is P1's own measured fact**, re-verified here …
JUDGE'S NOTE: VALID, judge opened. The rule exists and omits the one property that clears the UA bevel, while both siblings carry it. Phase-2 filing (absent from the branch at 2cfffc7a), half of Minor. exec 1's own later paint (15:27, border: 2px outset) corroborates; not needed for the ruling.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `P35: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P35 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-9  ·  haiku  ·  IMPORTANT  ·  ~0.75 h  ·  rank 96

```
TASK T-E4-9 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.75 h — judged IMPORTANT — rank 96/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:204, 13 lines — read the whole section first):
  E4-9 — **IMPORTANT** — The workflow builder renders TWO `<main>` landmarks, and at 390 px its name field is 403 px wide, so the page overflows the phone viewport to 415
WHAT IS WRONG (the reviewer's words):
  `/w/<id>/settings/workflows/<workflowId>` at `emulate 390x844`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  settings/workflows/[workflowId]/page.tsx:57 <main className="gn-shell"> wrapping workflow-builder-screen.tsx:131 <main className="workflow-builder-screen__canvas"> — two nested main landmarks
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `<section aria-label="Canvas">` (or `role="region"`) for the canvas; `width: 100%; min-width: 0; box-sizing: border-box` on `.workflow-builder-screen__name`; and the builder route in the stack suite's overflow loop.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted).** `document.querySelectorAll('main')` → **2**: `main.gn-shell` (parent `body`) and `main.workflow-builder-screen__canvas` (parent `div.workflow-builder-screen__layout`, `nested: true`). Source: `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx:131` `<main className="workflow-builder-screen__canvas">`, inside the route's own `<main className="gn-shell">` (`apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx:57`; the first draft …
JUDGE'S NOTE: PARTIAL→scored at IMPORTANT, judge opened. Core holds; the outer main is the route page, not layout.tsx as the finding says (verifier). Accessibility landmark failure plus the 403-px field overflow the lane painted.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-9: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-9 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-32  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 97

```
TASK T-E4-32 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 97/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec4, docs/lanes/review-ui-exec4.md:499, 10 lines — read the whole section first):
  E4-32 — **MINOR** — The builder's advisories heading paints `warning` on `surfaceSunken` at **3.71:1** (13.6 px) in `hig`/`minimal` light, and `warning` is a foreground no `CONTRAST_PAIRS` row names
WHAT IS WRONG (the reviewer's words):
  `color: var(--gn-text-muted)` with the warning tone carried by the panel's border/eyebrow, or a `{ fg: 'warning', bg: 'surfaceSunken' }` row and a darker `warning` in `hig`/`minimal`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/ui/src/ui.css:2279 — .advisories-panel__title { margin: 0 0 0.4rem; font-size: 0.85rem; color: var(--gn-warning); }
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `color: var(--gn-text-muted)` with the warning tone carried by the panel's border/eyebrow, or a `{ fg: 'warning', bg: 'surfaceSunken' }` row and a darker `warning` in `hig`/`minimal`.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, builder route, 1512, light).** `h3.advisories-panel__title` (*"Worth a look — none of these block publishing"*): `color: rgb(178,80,0)` on `section.advisories-panel` `background: rgb(228,216,204)`, `font-size: 13.6px` → **3.71:1** in `hig` and `minimal`; `neo` light passes; dark passes in all three (the only dark failure on the route is React Flow's attribution, E4-16). Source: `ui.css:2279` `.advisories-panel__title { … color: var(--gn-warning); }` inside …
JUDGE'S NOTE: VALID per verifier chunk21 (line opened by the verifier, not the judge): Exact reproduction of 3.71 and both rgb values; 0.85rem = 13.6px. Control: grep "fg: '" returns 34 rows, so the 0 is real, not a dead needle. :2274 background: var(--gn-surface-sun. The verifier would raise E4-32 to IMPORTANT (3.71:1 warning-on-sunken at 13.6 px); no upward re-grading by policy.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-32: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-32 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-24  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 144

```
TASK T-E4-24 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 144/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:396, 12 lines — read the whole section first):
  E4-24 — **MINOR** — The board, the List, My Work and the builder skip a heading level: `h1` → `h3` with no `h2`, and the builder's `h3`s hang under no `h1` at all
WHAT IS WRONG (the reviewer's words):
  `h2` for the first level under a page title (or a page `h1` on the builder, which its own record already owes).
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/views/board.tsx:642 — {groupCount > 1 ? <h3 className="gn-board__workflow">{group.workflowName}</h3> : null}
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `h2` for the first level under a page title (or a page `h1` on the builder, which its own record already owes).
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, heading sweep on every route).** Board: `H1 Shop operations` → `H3 Simple kanban`, `H3 Errand with waits`; List: `H1` → `H3 Recently assigned`, `H3 Open questions …`; My Work: `H1 My Work` → `H3 Assigned to me` … (four); builder: `H3 System rules …`, `H3 Worth a look …` with `h1` count 0. Source: `board.tsx:642` (`<h3 className="gn-board__workflow">`), `my-work.tsx:75-97` (`<h3 className="gn-my-work__heading">` ×4). Controls in the same sweep: `/account` (`H1` → seven …
JUDGE'S NOTE: VALID per verifier chunk20 (line opened by the verifier, not the judge): Citation drift: the range 'my-work.tsx:75-97 (x4)' holds 3 of the 4 - the fourth is :116; the count is right. Controls in the same sweep: help-browser h1:650 -> h2:170 -> h3:174 and workspaces h1:51 -
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-24: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-24 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-36  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 145

```
TASK T-E4-36 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 145/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:544, 9 lines — read the whole section first):
  E4-36 — **MINOR** — The help search announces "nothing matches" but never "9 answers": the no-match arm is a `role="status"`, the count is a plain `<p>`
WHAT IS WRONG (the reviewer's words):
  `role="status"` on `.gn-help__results-count`; `min-height: 1.5rem` on `.gn-help__result-title`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/help/help-browser.tsx:207 — <p className="gn-help__results-count">
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `role="status"` on `.gn-help__results-count`; `min-height: 1.5rem` on `.gn-help__result-title`.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, `/help`, 1512, owner).** Typed `invite` into the search (`aria-label="Search the manual and FAQ"`, via the input's value setter + `input` event): `div.gn-help__results` renders `p.gn-help__results-count "9 answers for “invite”"` and nine `li.gn-help__result`; `document.querySelectorAll('[role=status],[aria-live]')` → **none**. Source: `packages/app-core/src/help/help-browser.tsx:207-209` (`<p className="gn-help__results-count">` — no role) beside `:672` (`<p …
JUDGE'S NOTE: PARTIAL per verifier chunk22 (line opened by the verifier, not the judge): Core holds: :207 has no role, :672 does; ui.css:4105 has no line-height/min-height. FALSE mechanism: .gn-help__nav-link first appears 2026-09-15 (git log -S, 8079e999), its rule :4. The verifier would raise it to IMPORTANT; no upward re-grading by policy.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-36: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-36 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P10  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 149

```
TASK T-P10 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 149/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:305, 14 lines — read the whole section first):
  P10 — **MINOR** — The accessible-name ratchet's unit is an attribute; its failure message claims a property of assistive tech
WHAT IS WRONG (the reviewer's words):
  `ariaLabel` counts **elements carrying the attribute**, and the assertion that consumes it tells the reader something stronger.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/e2e-stack/viewport.spec.ts:720 — ${names[attr]}. Something that identified an element to assistive tech is gone.
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Keep the count (it is cheap and it does catch a dropped attribute) but say what it measures: *"an `aria-label` attribute left the document; whether it named anything is not what this measured"*. That sentence costs nothing and stops a count being read as a property.
HOW IT WAS MEASURED (reproduce this before and after):
  - `apps/web/e2e-viewport/accessible-names.ts:47-52`: `const count = (attr: string): number => all.filter((el) => el.hasAttribute(attr)).length;` and `ariaLabel: count('aria-label')`. `RATCHETED` (`:118-123`) includes `ariaLabel`. - The failing assertion's message (`apps/web/e2e-stack/viewport.spec.ts:719-722`) reads: *"…LOST ${attr}: baseline …, now …. **Something that identified an element to assistive tech is gone.**"* - **A live site where the two differ:** …
JUDGE'S NOTE: VALID per verifier chunk02 (line opened by the verifier, not the judge): accessible-names.ts:49 hasAttribute count and :51 ariaLabel exact; page.tsx:3288 aria-hidden wrap and avatar.tsx:65 aria-label={name} exact. CITATION DEFECT: RATCHETED sits at accessible-names.ts:88-9
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `P10: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P10 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P17  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 150

```
TASK T-P17 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 150/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:503, 23 lines — read the whole section first):
  P17 — **MINOR** ⚠ **r2 NEW** — `/my-work`'s heading outline skips level 2, the product IMPROVED on the prototype to get there, and no instrument measures heading level or order
WHAT IS WRONG (the reviewer's words):
  The My Work route renders an `<h1>` and the view it mounts renders its four section labels as `<h3>`. There is no `<h2>` anywhere in the path: the outline goes **h1 → h3**.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/w/[workspaceId]/my-work/page.tsx:51 — <h1 className="gn-page-title">My Work</h1>
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `<h2>` for the four section labels, which is one character each, and — separately — an assertion somewhere that walks a route's headings and fails on a skip. The second is the one that keeps the first from coming back: `type-scale.ts` and `accessible-names.ts` already establish the shape (a per-route sweep with a recorded baseline), and a heading sweep is the same instrument over a different property.
HOW IT WAS MEASURED (reproduce this before and after):
  - `apps/web/app/w/[workspaceId]/my-work/page.tsx:51`: `<h1 className="gn-page-title">My Work</h1>` — the route's **only** heading (`grep -cE '<h[1-6]'` → 1 for h1, 0 for h2, 0 for h3). - `packages/app-core/src/views/my-work.tsx:75, 86, 97, 116`: four `<h3 className="gn-my-work__heading">` — *Assigned to me*, *My claims in transit*, *My contested claims*, *Shared with me*. - The route mounts `<MyWork>` at `:73` and passes nothing heading-related, so nothing supplies a level 2 between them. - …
JUDGE'S NOTE: VALID per verifier chunk03 (line opened by the verifier, not the judge): h1->h3 skip reproduces unconditionally; the export block's styled <p>Needs your attention</p> found verbatim, 0 h2-h6. Scope drift, conservative: 'a sweep returns five' holds only over packages/app-co
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `P17: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P17 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P36  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 152

```
TASK T-P36 — batch B10 (Paint — UA chrome, phone width, contrast, headings) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 152/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:992, 15 lines — read the whole section first):
  P36 — **MINOR** ⚠ **r2 NEW — PHASE 2 (filed 15:31 IST, after the freeze; scores at HALF per rules §2)** — Two settings routes paint the same word as the page's `h1` and, 6 px under it, as the screen's `h2`: `Workflows / Workflows`, `Ticket types / Ticket types` — the export draws `Settings` over the section title
WHAT IS WRONG (the reviewer's words):
  `/w/<id>/settings/workflows` renders `<h1 class="gn-page-title">Workflows</h1>` (`apps/web/app/w/[workspaceId]/settings/workflows/page.tsx:25`) and then mounts `WorkflowListScreen`, whose header is `<h2 className="workflow-list__title">Workflows</h2>` (`packages/app-core/src/workflow-builder/ui/workflow-list-screen.tsx:206`). `/w/<id>/settings/ticket-types` does the same: `page.tsx:20` `<h1 class="gn-page-title">Ticket types</h1>` over `ticket-type-list-screen.tsx:334` `<h2 className="ticket-type-list__title">Ticket types</h2>`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/w/[workspaceId]/settings/workflows/page.tsx:25 <h1 className="gn-page-title">Workflows</h1>; packages/app-core/src/workflow-builder/ui/workflow-list-screen.tsx:206 <h2 className="workflow-list__title">Workflows</h2>; apps/web/app/w/[workspaceId]/settings/ticket-types/page.tsx:20 <h1>Ticket types</h1>; packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx:334 <h2>Ticket types</h2>
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either the export's shape — `h1 Settings` on the dedicated routes too, with the screen's `h2` naming the section — or drop the screen's `h2` when the route already names it (the `/settings` shell shows the two can coexist when the words differ). And one line in the heading sweep P17 asks for, asserting no two adjacent headings share their text.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — painted, by me** (instrument as P1's third defence paragraph: `:3041`, byte-identical product tree, signed in, 1200 px). `/settings/workflows`: `h1,h2,h3` in order → **`H1 "Workflows"` (34 px), `H2 "Workflows"` (16 px)**, and the `h2`'s top is **6.4 px** below the `h1`'s bottom. `/settings/ticket-types`: **`H1 "Ticket types"` (34 px), `H2 "Ticket types"` (20 px)**, gap **6.4 px**. The a11y-tree snapshot of the workflows route (`take_snapshot`) lists `heading "Workflows" …
JUDGE'S NOTE: VALID, judge opened both routes' h1 and both screens' h2 at source. MINOR as claimed. Phase 2 (filed 15:31), half.
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `P36: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P36 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B11 — Session expiry and dead controls  ·  lane UX  ·  session model **sonnet**  ·  backend **deepseek**  ·  10 tasks  ·  ~6.3 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec2` · branch `rel/b11-session-expiry-and-dead-controls` · packages touched: @gisik-nokma/app-core, @gisik-nokma/web.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E2-45` | sonnet | I | 1.25 | `apps/web/src/account-menu.tsx:190-192`, `apps/web/src/account-menu.tsx:189-194`, `apps/web/src/account-menu.tsx:184-197` |
| 2 | `T-E5-25` | sonnet | I | 1.25 | `apps/web/src/expired-session.tsx:53`, `apps/web/src/expired-session.tsx` |
| 3 | `T-E5-31` | sonnet | I | 1.25 | `apps/web/src/app-nav.tsx:243`, `apps/web/app/not-found.tsx` |
| 4 | `T-E5-32` | sonnet | I | 1.25 | `apps/web/src/expired-session.tsx:72`, `docs/manual.md:109-110`, `docs/manual.md:107-110` |
| 5 | `T-E5-5` | sonnet | I | 1.25 | `docs/manual.md:826-828` |
| 6 | `T-V1` | sonnet | I | 1.25 | `packages/app-core/src/views/board.tsx`, `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1720-1789` |
| 7 | `T-V5` | sonnet | I | 1.25 |  |
| 8 | `T-E2-38` | sonnet | M | 0.6 | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1837`, `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`, `apps/web/app/w/[workspaceId]/page.tsx` |
| 9 | `T-E5-23` | sonnet | M | 0.6 | `apps/web/app/w/[workspaceId]/page.tsx:887`, `apps/web/app/w/[workspaceId]/page.tsx:883-887` |
| 10 | `T-E5-34` | sonnet | M | 0.6 | `apps/web/src/last-project-nav.tsx:128`, `apps/web/src/last-project-nav.tsx:114-127` |

#### T-E2-45  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 98

```
TASK T-E2-45 — batch B11 (Session expiry and dead controls) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 98/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec2, docs/lanes/review-ux-exec2.md:2992, 71 lines — read the whole section first):
  E2-45 (r2) — IMPORTANT · "Sign out" can fail silently, and the menu closes either way
WHAT IS WRONG (the reviewer's words):
  `apps/web/src/account-menu.tsx:189-194`: ``` onClick={() => { close(false); void authClient.signOut().then(() => { router.push('/sign-in'); }); }} ``` **One callback, no rejection handler** — and `close(false)` runs *first*, so the menu closes before the request is even sent. If `signOut()` rejects (offline, a 5xx, a dropped connection), nothing is pushed, no sentence is rendered, and **the session stays live** while the only visible change — the menu closing — reads as success.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/account-menu.tsx:190-192 close(false); void authClient.signOut().then(() => { router.push('/sign-in'); }) — no rejection or {error} arm
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Two callbacks: on rejection, keep the session and say so — either re-render the menu with a failure sentence, or route to a state that tells the person they are still signed in. `close(false)` should not run before the answer if the closing *is* the confirmation.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `apps/web/src/account-menu.tsx:184-197` (the control, the `close` before the await, the single-callback `.then`); `docs/manual.md:112-114`.
JUDGE'S NOTE: PARTIAL→scored at IMPORTANT, judge opened. Core holds; the verifier showed the stated mechanism is inverted for 5xx (better-fetch resolves {data:null,error}, so .then RUNS and the client asserts a sign-out the server declined) — the defect is at least what the finding says.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-45: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-45 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-25  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 105

```
TASK T-E5-25 — batch B11 (Session expiry and dead controls) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 105/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:980, 40 lines — read the whole section first):
  E5-25 — IMPORTANT · A write after the session expires is reported as *"We could not reach the server"* — at nine sites in seven files — and none of them sends the person to sign in, though every READ does `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  The events door answers refusals inside a `200` body (`routes/events.ts:102` `return { results }`); a `401` is produced only by the session guard before the handler (`auth/require-session.ts:102` `reply.code(401).send(UNAUTHENTICATED_BODY)`). The client transport throws `HttpError` on any non-2xx (`online/http.ts:134`) with `message = "HTTP 401 for /v1/events"`. Every write `catch` in the product then paints that as transport: `ticket-sheet.tsx:1074` *"We could not reach the server for this change — HTTP 401 for /v1/events"*, and the same sentence at `board.tsx:1430`, `:1532`, `:1736`, `bulk-close-dialog.tsx:233`, `backlog-rank-controls.tsx:186`, `backlog-start-button.tsx:113`, `workspace-settings-form.tsx:298`, `page.tsx:848` (the delete's Undo) — nine sites, `grep -rn 'could not reach the server'`. Meanwhile `apps/web/src/expired-session.tsx` is *"The ONE author of 'a 401 is not a …
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/expired-session.tsx:53 return message !== null && message.startsWith(EXPIRED_SESSION_PREFIX); — the nine write sites (7 files, verifier) compose "We could not reach the server — <message>", which the anchored predicate cannot classify
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One predicate on the catch — `error instanceof HttpError && error.status === 401` (the transport HAS the status, `http.ts:50`) — routing to the same `/sign-in?next=` redirect reads use, with the sentence the product already owns for exactly this — `EXPIRED_SESSION_COPY = 'Your session has ended. Taking you to sign in…'` (`expired-session.tsx:90`, mounted by five read arms) — or feed each page's write-error state into its existing `useSignInOnExpiredSession` list.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` every line above opened. Not driven: I will not sign the owner's session out, and the browser stopped hydrating before I could inject a `401` on `/v1/events` (§6.1) — the injection would have been the same technique as E5-13/E5-15 and is the reproduction the judge can run: wrap `fetch` to answer `401` for `POST /v1/events`, press `Move`, read the transport slot.
JUDGE'S NOTE: PARTIAL→scored at IMPORTANT, judge opened. A write after session expiry is reported as a transport failure and nobody is sent to sign in; the absolute "every READ does" is false (ShellRefusal on 7 routes vs the hook on 5) — overclaim noted, core holds.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-25: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-25 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-31  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 107

```
TASK T-E5-31 — batch B11 (Session expiry and dead controls) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 107/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:1166, 32 lines — read the whole section first):
  E5-31 — IMPORTANT · The signed-out app bar offers Workspaces, Account, an Inbox icon and "No workspace selected — pick one…" to a visitor who cannot use any of them, and no Sign in; the legal pages' bar offers Sign in `[BROWSER, devtools isolated context, 390 px]` `[SOURCE]` — FIRST-RUN / PERMISSION-REFUSED
WHAT IS WRONG (the reviewer's words):
  Signed out on `/help` (the route `app-nav.tsx:330-332` calls *"the route most likely to be wanted by someone who cannot get in"*), the bar paints: `Workspaces -> /workspaces`, `Help`, `Account -> /account`, an unlabelled inbox link `-> /inbox`, and the scope note *"No workspace selected — pick one to reach its board, members and settings."* (`[BROWSER]`, nav links and text). No **Sign in**. `app-nav.tsx:333-342` is the `user === null` arm: Help + Account, nothing else. The legal bar has the arm the app bar lacks: `legal-nav.tsx:96-99` `user === null ? <Link className="gn-nav__signin" href="/sign-in">Sign in</Link>`. Pressing **Workspaces** signed out lands on `/sign-in` by a 401 bounce (`[BROWSER]`: `location.pathname` → `/sign-in`, no `next=`); pressing **Account** paints the page E5-13's second reproduction describes. The 404 (`apps/web/app/not-found.tsx`) is a third signed-out …
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/app-nav.tsx:243 <Link href="/workspaces" …> ungated on session, while :333-335 is the user === null arm (Help + Account only) — plus the Inbox link and the "No workspace selected" note, all ungated (verifier :103-105, :380-392)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The legal bar's arm: `user === null` → Help + **Sign in** (with `next=`), and withhold the scope note and the inbox icon until there is someone to scope.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` (devtools MCP, its own Chrome, isolated context `exec5`, `emulate 390x844x3,mobile`): `/help` nav links and `navText` as quoted; `/workspaces` → `/sign-in`; `/account` as in E5-13. `[SOURCE]` `app-nav.tsx:312-345`, `legal-nav.tsx:96-105`.
JUDGE'S NOTE: VALID, judge opened. The signed-out app bar offers Workspaces, Inbox and a workspace prompt to a visitor who can use none of them, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-31: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-31 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-32  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 108

```
TASK T-E5-32 — batch B11 (Session expiry and dead controls) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 108/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:1199, 34 lines — read the whole section first):
  E5-32 — IMPORTANT · The help promises a signed-out link to a job "remembers where you were headed"; every data page bounces to `/sign-in` with no `next=`, so the link is dropped — the invite link, the consent page and the settings shell all keep theirs `[BROWSER, devtools isolated context]` `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  `docs/manual.md:109-110`: *"The same is true if you click a link (an invitation, or a link to a job) while signed out: it remembers where you were headed and sends you there afterwards."* Signed out, opening `/w/0TZSS5W6ATCTF2YBPMWGGP9JF5/p/0XB92YA4CGEBF9S285AH4SDXR1?ticket=0320JX4SK3KBJ616QP82T8WRJ2` — the shape every notification deep link and every pasted ticket link has — lands on **`/sign-in` with `hasNext: false`** (`[BROWSER]`, `location.pathname + location.search` → `/sign-in`). The bounce is `expired-session.tsx:70-74`: `if (expired) router.push('/sign-in');` — no `next`. It is the ONE author of the 401 redirect and is called by `/workspaces`, `/w/[workspaceId]`, `/w/…/my-work`, `/w/…/p/[projectId]` and `/inbox` (§6.1 grep), so **no data page keeps the destination**. Four other sites do: `invite/[token]/page.tsx:107` (`/sign-in?next=/invite/<token>`), …
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/expired-session.tsx:72 if (expired) router.push('/sign-in'); — no next=; docs/manual.md:109-110 "it remembers where you were headed and sends you there afterwards" (verifier: 5 of 5 sites push the bare path)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `router.push('/sign-in?next=' + encodeURIComponent(pathname + search))` in the hook — the same shape the four sibling sites use — or correct `docs/manual.md:109` to "an invitation".
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` as above (second browser, no session, 390 px). `[SOURCE]` `expired-session.tsx:70-74`; `docs/manual.md:107-110`; the four `sign-in?next=` sites (`grep -rn 'sign-in?next=' apps/web` → 4, none in the hook); `sign-in/page.tsx:56-66`.
JUDGE'S NOTE: VALID, judge opened. The help promises a remembered destination the product never keeps, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-32: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-32 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-5  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 109

```
TASK T-E5-5 — batch B11 (Session expiry and dead controls) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 109/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:351, 27 lines — read the whole section first):
  E5-5 — IMPORTANT · The Filters sheet offers a Collaborators control that no view applies, and tells the person afterwards `[BROWSER]` `[SOURCE]`
WHAT IS WRONG (the reviewer's words):
  The Filters sheet renders a `Collaborators` fieldset with one tri-state row per member (`page.tsx:3317` `{personSection('Collaborators', 'collaboratorIds')}`, `[BROWSER]` legend list `["Assignee", "Collaborators", "Type", "State", "Closed", "Category"]`). No tab narrows by it: the manual's own words, `docs/manual.md:826-828` — *"Collaborators is the one thing no tab applies — the strip's own sentence is 'Not applied on the board: collaborator.' You can set it and the filter keeps it, but nothing narrows by it."*
THE JUDGE'S LINE (the ruling rests on this; open it):
  p/[projectId]/page.tsx:3317 {personSection('Collaborators', 'collaboratorIds')} while :3147-3151 records it as "deliberately included even though it is one of the four axes BoardCard cannot answer at all" — a reason for the shape, not a ruling that an inert control is acceptable
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Withhold the fieldset until an axis applies it, or label it inline *"(not applied by any view yet)"* so the person is told before the press, not in a strip after it.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` legends and rows listed above. `[SOURCE]` `page.tsx:3147-3151`, `:3157-3160`, `:3317`; `docs/manual.md:826-828`.
JUDGE'S NOTE: VALID, judge opened. The Filters sheet offers a control no view applies and tells the person afterwards, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-5: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-5 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-V1  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 115

```
TASK T-V1 — batch B11 (Session expiry and dead controls) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 115/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:716, 30 lines — read the whole section first):
  V1 — IMPORTANT · The Board's empty states invite a person to create a ticket, and no caller in the web app wires the control
WHAT IS WRONG (the reviewer's words):
  The empty-board banner renders `EMPTY_BOARD_COPY` = *"No tickets here yet — create one."*, and the "Create a ticket" button beneath it is gated on `onCreateTicket !== undefined` (`board.tsx:490-497`). The empty-column state renders a decorative `+` glyph (`board.tsx:746-758`, `aria-hidden="true"`) with copy *"No tickets in this column."* and an "Add a ticket" button gated the same way (`:762-764`).
THE JUDGE'S LINE (the ruling rests on this; open it):
  board.tsx:184 EMPTY_BOARD_COPY = 'No tickets here yet — create one.'; :493-497 the Create button renders only when onCreateTicket is passed; grep onCreateTicket= over apps/web/app → 0
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either pass `onCreateTicket` from the project page's existing create region (which is already gated correctly at `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1720-1789`), or make the copy conditional so an unwired board states the situation instead of instructing. The `+` glyph should never render unaccompanied — it is the one part of the empty column that reads as a control.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — and this is the finding.** `onCreateTicket` is declared and guarded in `packages/app-core/src/views/board.tsx` (18 hits), and across **`apps/web/app` + `apps/web/src` — 63 files scanned — it has 0 hits.** No web caller passes it, so the sentence tells the reader to create a ticket and the control that would let them is not rendered. The `+` glyph still paints.
JUDGE'S NOTE: VALID, judge opened. The empty state invites an action no web caller wires, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `V1: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-V1 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-V5  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 118

```
TASK T-V5 — batch B11 (Session expiry and dead controls) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 118/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:825, 23 lines — read the whole section first):
  V5 — IMPORTANT · A "My contested claims" title button is a dead click, under a comment claiming all four sections resolve
WHAT IS WRONG (the reviewer's words):
  `MyWork` renders a title button for the contested section that calls `onOpenTicket(contested.ticketId)` (`my-work.tsx:145-151`). The shell's resolver (`app/w/[workspaceId]/my-work/page.tsx:41-45`) searches `assigned`, `inTransit` and `shared` — **three arms** — under a comment at `:39-40` reading *"Every section this component renders a title button for must be resolvable here, and that is now all four."*
THE JUDGE'S LINE (the ruling rests on this; open it):
  my-work/page.tsx:39-44 the resolver searches assigned/inTransit/shared under a comment saying "that is now all four" — three arms; ContestedCard renders a title button (my-work.tsx:145-151) that cannot resolve
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Add the fourth arm, or make the resolver exhaustive over the view's own members so a fifth section cannot reintroduce this.
HOW IT WAS MEASURED (reproduce this before and after):
  Both files opened by me: `app/w/[workspaceId]/my-work/page.tsx:39-45` (the resolver and its comment) and `my-work.tsx:136-151` (`ContestedCard`, and its button).
JUDGE'S NOTE: VALID, judge opened. A dead click under a comment claiming completeness, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `V5: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-V5 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-38  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 142

```
TASK T-E2-38 — batch B11 (Session expiry and dead controls) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 142/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec2, docs/lanes/review-ux-exec2.md:2171, 28 lines — read the whole section first):
  E2-38 (r2) — MINOR · An archived project's own board does not say it is archived
WHAT IS WRONG (the reviewer's words):
  `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` contains **0 occurrences of `archived`** (case-insensitive, whole file, measured), while the screen a person must pass through to reach it says it prominently: `apps/web/app/w/[workspaceId]/page.tsx` matches **58** times, carrying the archive/restore controls and the `N archived · show` toggle.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1837 — {projectName !== null ? <h1 className="gn-project__title">{projectName}</h1> : null}
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One line on the board naming the project's state — the same fact the workspace home already carries, so no new read is needed.
HOW IT WAS MEASURED (reproduce this before and after):
  Occurrence counts above, run over both files in full. (The `M1` lead carried from round-1 §2d.)
JUDGE'S NOTE: VALID per verifier chunk11 (line opened by the verifier, not the judge): Both counts reproduce exactly over both files in full. Control: needle 'project' hits 112 lines in the same file, so the 0 could have failed. use-project-name.ts (the only name source, :1837) has 0 'a
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-38: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-38 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-23  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 146

```
TASK T-E5-23 — batch B11 (Session expiry and dead controls) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 146/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:926, 25 lines — read the whole section first):
  E5-23 — MINOR · A brand-new owner's workspace home says "No projects you can open are active here" — a sentence written for the excluded member, read by the founder above the form that makes the first project `[SOURCE]` — FIRST-RUN
WHAT IS WRONG (the reviewer's words):
  `apps/web/app/w/[workspaceId]/page.tsx:883-887`: when `shown.length === 0` the home renders *"No projects you can open are active here."* The comment above it (`:884-886`) says why: *"A member outside every project has an empty live list in a workspace full of them, and 'there are no projects' would be a claim about the workspace."* Correct for that member. An owner who founded the workspace seconds ago (`exec2-F5`'s person, arriving from `/my-work`'s four negatives) has `shown = []` for the other reason — the workspace has none — and reads a sentence that says the opposite ("you can open" presupposes projects they cannot), directly above `<NewProjectForm>` (`:958-959`, rendered for `isAdmin`).
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/w/[workspaceId]/page.tsx:887 — <p className="gn-workspace-home__empty">No projects you can open are active here.</p>
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Branch on `isAdmin && projects.length === 0`: *"No projects yet — create the first one below."*; keep the member's sentence for the member.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `:666` (`shown`), `:883-887`, `:958-962`. Not driven — I will not found a workspace in the owner's database.
JUDGE'S NOTE: VALID per verifier chunk25 (line opened by the verifier, not the judge): The comment at :884-886 confirms the sentence was written for the excluded member ("would be a claim about the workspace"). Nothing branches on isAdmin or projects.length at the empty arm, so a founde
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-23: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-23 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-34  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 147

```
TASK T-E5-34 — batch B11 (Session expiry and dead controls) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 147/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:1258, 28 lines — read the whole section first):
  E5-34 — MINOR · On an archived project's own page, the bar's project item names and links a DIFFERENT project — the docblock that made the item "a function of the ROUTE" is true only for live routes `[SOURCE]` — SOFT-DELETED (project) — extends `exec2-E2-38` with the measurement it lacks
WHAT IS WRONG (the reviewer's words):
  `apps/web/src/last-project-nav.tsx:114-127`: `routeProjectId` comes from `useParams`; `useLastProject(workspaceId, routeProjectId, userId)` answers `{status: 'remembered', projectId: routeProjectId}` whenever the route carries one (`use-last-project.ts:185-187`); then `live = projects.filter(p => !p.archived)` (`:121`), `rememberedLive = live.find(p => p.id === remembered.projectId) ?? null` (`:122-124`), and `shown = rememberedLive ?? live[0]` (`:127`). For an archived project's route, `find` misses and the item shows `live[0]`: the FIRST live project's name, `href` (`:188`), and no `aria-current` (`:234`, `pathname !== projectHref`). In the dev workspace: on `/w/…/p/01M25DBPXAK3NC9YRVS95MB7J6` (`gggg`, `archived: true` on the wire, §E5-12) the bar would read **Shop operations**.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/last-project-nav.tsx:128 — const shown: ProjectRef | null = rememberedLive ?? live?.[0] ?? null;
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  When `routeProjectId` names an archived project, show it (dimmed, badged, as the workspace home already draws archived cards) and keep the dropdown live-only; or, at minimum, keep `aria-current` honest by not substituting.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `last-project-nav.tsx:100-127`, `:188`, `:234`; `use-last-project.ts:145-190`. Not driven (§6.1). The wire fact — one archived project in the dev workspace — is E5-12's `[BROWSER]` `GET /v1/me/workspaces`.
JUDGE'S NOTE: VALID per verifier chunk27 (line opened by the verifier, not the judge): Mechanism reproduces exactly (name, href and aria-current all follow). Citation drift +/-1: shown is :128 not :127; use-last-project remember() is :189, cited :185-187. Not driven . The verifier would raise it to IMPORTANT; no upward re-grading by policy.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-34: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-34 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B12 — Workflow and type invariants in the rule engine  ·  lane FUNC  ·  session model **opus**  ·  backend **claude-opus (deepseek-capable tasks may be split out to a DeepSeek session)**  ·  4 tasks  ·  ~4.2 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec6` · branch `rel/b12-workflow-and-type-invariants-in-` · packages touched: @gisik-nokma/rule-engine, @gisik-nokma/server.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E3-19` | opus | I | 1.75 | `packages/rule-engine/src/transition.ts:132-138`, `packages/rule-engine/src/transition.ts:130-142` |
| 2 | `T-E6-10` | opus | I | 1.75 | `apps/server/src/routes/builder-reads.ts:843-845` |
| 3 | `T-E6-3` | opus | I | 1.75 | `packages/rule-engine/src/checks/ticket-type.ts:60-65`, `packages/rule-engine/src/checks/ticket-type.ts:50-64`, `test-cases/05-tickets-hierarchy.md:25` |
| 4 | `T-E6-8` | opus | I | 1.75 | `packages/rule-engine/src/workflow-defined.ts:162-172` |

#### T-E3-19  ·  opus  ·  IMPORTANT  ·  ~1.75 h  ·  rank 133

```
TASK T-E3-19 — batch B12 (Workflow and type invariants in the rule engine) — model opus — backend claude-opus — effort ~1.75 h — judged IMPORTANT — rank 133/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/rule-engine
FINDING (exec3, docs/lanes/review-functionality-exec3.md:1863, 88 lines — read the whole section first):
  21. `E3-19` (r2) — **IMPORTANT (claimed)** — The parent-terminal invariant is enforced in ONE direction: a child can be moved out of terminal under a terminal parent, and the parent can then be CLOSED with an open child
WHAT IS WRONG (the reviewer's words):
  `packages/rule-engine/src/transition.ts:130-142` guards the invariant the code itself states as *"parents cannot outrun children"*:
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/rule-engine/src/transition.ts:132-138 if (toState.category === 'terminal') { … openCount > 0 → refuse parentTerminal } — the invariant fires only on ENTERING terminal; grep parentTerminal over rule-engine/src finds guards at hierarchy.ts (add/move) and transition.ts (enter) and none on a child LEAVING terminal under a terminal parent
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The invariant is symmetric, so the guard should be: refuse a move **out of** a terminal state into a non-terminal one while the ticket's PARENT is terminal, with its own rule id and a sentence naming the parent (*"Registrations is finished; reopen it before reopening this."*) — the `hierarchy.ts` refusals already resolve a parent's title for exactly this kind of sentence. Alternatively, if one-way really is the intent, the comment should say **"a parent may not ENTER terminal while children are open"** and drop *"cannot outrun children"*, because as written it promises the symmetric property and the guard delivers half of it. **And a case should pin the direction that IS guarded together with the one that is not** — the existing parent-terminal cases cover the first alone.
HOW IT WAS MEASURED (reproduce this before and after):
  Two probes at `packages/rule-engine`, each created, run and **deleted in the same shell invocation** (`git status --porcelain` empty after both). They import `evaluateEvent` and `buildMemoryContext` from `../src/*.js` — **relative paths, so nothing resolves through a stale `dist`**, which is the trap `E3-2` records against another lane's measurement. All definitions travel as events (`workflow.defined`, `ticket-type.defined`), so the context needs no seed and no database. Both runs: `Tests 1 …
JUDGE'S NOTE: VALID, judge opened. "Parents cannot outrun children" is enforced in one direction only, IMPORTANT.
DONE WHEN: A rule-engine/server test reproduces the defect through the real door (ingest or route), RED before and GREEN after; the package suite is green; the invariant is stated in one sentence in the check's docblock; `test-cases/` gains or flips the case in the same commit.
COMMIT: `E3-19: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-19 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-10  ·  opus  ·  IMPORTANT  ·  ~1.75 h  ·  rank 134

```
TASK T-E6-10 — batch B12 (Workflow and type invariants in the rule engine) — model opus — backend claude-opus — effort ~1.75 h — judged IMPORTANT — rank 134/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec6, docs/lanes/review-functionality-exec6.md:895, 50 lines — read the whole section first):
  E6-10 — IMPORTANT — The bulk rebind route can be refused part-way by the permission gate, leaving the type's tickets split across two workflows while the client is told "refused"; its docblock says that window is unreachable, and case 7.45 asserts "appends nothing"
WHAT IS WRONG (the reviewer's words):
  `POST /v1/workspaces/:ws/ticket-types/:typeId/migrate` (`routes/builder-reads.ts:851-1049`) is `admins-only` (`:856`). Its pre-flight (`:870-955`) asks every *migration* question — unknown target state, unmapped occupied state, same workflow, closed → non-terminal, `backlog` as a key — and then submits one `ticket.workflow_rebound` per ticket through `ingestClientBatch` (`:1040`), which commits **one transaction per event**. The pre-flight never asks the question the permission gate asks per ticket: `checkVisibilityPermission` → `canSee` (`check-permission.ts:1048`), and `canSeeResolved` (`can-see.ts:105-112`) answers **false for an `admin` on a project-mode ticket whose project they are not on** — a designed state (`check-permission.ts:975`, *"There is deliberately NO admin shortcut: an admin who wants to create work in a project joins it first"*). Measured through the real doors …
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/routes/builder-reads.ts:843-845 "if ingest refuses or fails PART WAY through a batch … earlier tickets stay moved. Nothing this route can construct reaches that window — the pre-flight covers every…" — but canSee runs per ticket event with no admin bypass (can-see.ts:110-111, check-permission.ts:1048) and ingestAll commits per event
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Ask the gate's question in the pre-flight: `canSee` over the selected ticket set (or the cheaper `visibleTicketsWhere` join), and refuse **up front** with a count — *"3 tickets of this type are not visible to you; ask an owner, or join their projects"* — so 7.45's sentence becomes true of this door too. Alternatively, an owner-only door for migration; or the batch-scoped ingest transaction the docblock already names as the real fix. And 7.45 should carry a fourth arm: an admin not on one project, asserting zero appends.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix I, run from `apps/server`. Lines opened: `builder-reads.ts:842-846`, `:856`, `:938` (`ORDER BY ticket_id`), `:1040`, `:1041`; `check-permission.ts:975`, `:1048`; `can-see.ts:105-112`; `ingest-service.ts:235-252`; `07-api-realtime-search.md:68`.
JUDGE'S NOTE: VALID, judge opened. A bulk rebind can be refused part-way, splitting a type across two workflows, under a docblock asserting the window is unreachable, IMPORTANT.
DONE WHEN: A rule-engine/server test reproduces the defect through the real door (ingest or route), RED before and GREEN after; the package suite is green; the invariant is stated in one sentence in the check's docblock; `test-cases/` gains or flips the case in the same commit.
COMMIT: `E6-10: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-10 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-3  ·  opus  ·  IMPORTANT  ·  ~1.75 h  ·  rank 135

```
TASK T-E6-3 — batch B12 (Workflow and type invariants in the rule engine) — model opus — backend claude-opus — effort ~1.75 h — judged IMPORTANT — rank 135/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/rule-engine
FINDING (exec6, docs/lanes/review-functionality-exec6.md:501, 58 lines — read the whole section first):
  E6-3 — IMPORTANT — Re-ranking a custom ticket type is accepted with tickets already placed where the new rank forbids, so the ledger holds hierarchies the engine itself then refuses to produce
WHAT IS WRONG (the reviewer's words):
  `packages/rule-engine/src/checks/ticket-type.ts:50-64` is the whole of the `ticket-type.defined` check beyond payload shape: it refuses a **built-in** type whose rank differs from its seed (`type.builtin-rank`) and accepts everything else. Nothing asks whether tickets of a custom type already exist, nor where they sit. The editor exposes the door: `ticket-type-editor-screen.tsx:336-345` is a bare `<input type="number" min={1}>` for "Hierarchy rank", disabled only for built-ins. Measured with the engine's own memory context (probe in Appendix B; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/rule-engine/src/checks/ticket-type.ts:60-65 the only refusal is the builtin-rank one; the check ends in ACCEPT without reading ticket placements
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The check has the context it needs: `ctx.getChildrenStates` and `ctx.getEntityState` already serve the hierarchy checks. Refuse a custom re-rank when any ticket of the type is in a position the new rank forbids — a child whose parent's rank is now `≥` the new rank, a parent whose child's rank is now `≤` it, or a root ticket when the new rank is `≥ DEEPEST_RANK` — with the count in the refusal (*"12 features would need a parent first"*). That keeps `5.36` (re-rankable when nothing is placed against it) and makes the four write-site invariants true of the ledger rather than of the door. A cheaper honest alternative is to record the decision that they are write-time-only and say so in the editor copy.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix B, run from `packages/rule-engine` with `pnpm exec vitest run test/zz-exec6-probe-rerank.test.ts --no-file-parallelism` (imports `../src/*.js` relatively — no `dist` in the path). Lines opened: `ticket-type.ts:50-64`; `hierarchy.ts:108`/`:228` (`type.rank >= DEEPEST_RANK`), `:133`/`:281` (`type.rank <= parentType.rank`); `ticket-type-editor-screen.tsx:336-345`; `workflow-builder/ticket-types/rank.ts:38`; `refusals.ts:86`; `domain/src/ticket-types.ts:98` (`rank: z.number().int().min(1)` …
JUDGE'S NOTE: VALID, judge opened. Re-ranking a custom type is accepted with tickets already placed where the new rank forbids, IMPORTANT.
DONE WHEN: A rule-engine/server test reproduces the defect through the real door (ingest or route), RED before and GREEN after; the package suite is green; the invariant is stated in one sentence in the check's docblock; `test-cases/` gains or flips the case in the same commit.
COMMIT: `E6-3: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-3 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-8  ·  opus  ·  IMPORTANT  ·  ~1.75 h  ·  rank 136

```
TASK T-E6-8 — batch B12 (Workflow and type invariants in the rule engine) — model opus — backend claude-opus — effort ~1.75 h — judged IMPORTANT — rank 136/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/rule-engine
FINDING (exec6, docs/lanes/review-functionality-exec6.md:801, 47 lines — read the whole section first):
  E6-8 — IMPORTANT — A workflow republish can put a parent with open children into a terminal state, and `ticket.closed` (and the auto-close sweep) then accept it — the state the transition path refuses
WHAT IS WRONG (the reviewer's words):
  Case 4.23 (`04-workflow-engine.md:41`): *"A parent cannot enter a terminal state while any child is non-terminal."* `transition.ts:132-142` enforces it. Two republish doors walk around it, measured in the engine's memory context (Appendix F; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/rule-engine/src/workflow-defined.ts:162-172 the republish loop refuses only terminal → non-terminal; close.ts:39 asks stateCategory alone; sweep.ts:186-199 has no children check
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Same shape as 56(a)'s fix: in `workflow-defined.ts`, when a kept state is promoted to `terminal` or a dropped state is mapped onto a terminal one, refuse if any ticket currently in that state has a non-terminal child (the context has `getChildrenStates`; the memory context already folds tickets on publish, so the count is available) — or, cheaper, have `checks/close.ts` and the sweep refuse a parent with open children, which closes the last door regardless of how the state was reached.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix F, run from `packages/rule-engine` (`pnpm exec vitest run test/zz-exec6-probe-promote.test.ts --no-file-parallelism`, relative imports). Lines opened: `transition.ts:132-142`; `workflow-defined.ts:79-172`; `close.ts:39`; `auto-close/sweep.ts:186-199`; `04-workflow-engine.md:41`; `13-owner-requests-and-backlog.md:1428-1450`.
JUDGE'S NOTE: VALID, judge opened. A republish can put a parent with open children into a terminal state and the close paths then accept it — the one-directional invariant exec 3's E3-19 also found, from the other side. IMPORTANT.
DONE WHEN: A rule-engine/server test reproduces the defect through the real door (ingest or route), RED before and GREEN after; the package suite is green; the invariant is stated in one sentence in the check's docblock; `test-cases/` gains or flips the case in the same commit.
COMMIT: `E6-8: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-8 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B13 — Due date, soft-delete undo, members picker  ·  lane UX  ·  session model **sonnet**  ·  backend **deepseek**  ·  8 tasks  ·  ~4.4 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec2` · branch `rel/b13-due-date-soft-delete-undo-member` · packages touched: @gisik-nokma/app-core, @gisik-nokma/server, @gisik-nokma/web.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E5-2` | sonnet | I | 1.25 | `packages/app-core/src/view-types.ts:204-213` |
| 2 | `T-E5-6` | sonnet | I | 1.25 | `docs/manual.md:23`, `test-cases/16-remaining-doors.md:279-283`, `docs/faq.md:197-215` |
| 3 | `T-E5-43` | sonnet | M | 0.6 | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1235`, `docs/manual.md:32` |
| 4 | `T-E2-30` | sonnet | I | 1.25 | `apps/server/migrations/1789800000000_proj-tickets-deleted.sql` |
| 5 | `T-E5-11` | sonnet | I | 1.25 | `docs/manual.md:236-240`, `docs/manual.md:229-240` |
| 6 | `T-E2-31` | sonnet | M | 0.6 | `packages/app-core/src/views/ticket-sheet.tsx:1029`, `packages/editor/src/components/TicketEditorSlot.tsx:128-136` |
| 7 | `T-E2-35` | sonnet | M | 0.6 | `packages/app-core/src/views/ticket-sheet.tsx:2612-2621` |
| 8 | `T-E2-51` | sonnet | M | 0.6 | `test-cases/13-second-wave-board-actions.md:54-57`, `test-cases/13-second-wave-board-actions.md:49-58`, `apps/web/app/w/[workspaceId]/members/page.tsx:510-518` |

#### T-E5-2  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 103

```
TASK T-E5-2 — batch B13 (Due date, soft-delete undo, members picker) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 103/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec5, docs/lanes/review-ux-exec5.md:242, 36 lines — read the whole section first):
  E5-2 — IMPORTANT · A ticket a week overdue looks like every other card on the Board; the export's card carries the key and a due label that turns red `[BROWSER]` `[SOURCE]` — category 3
WHAT IS WRONG (the reviewer's words):
  The export's board card (`EXPORT:357-379`) draws a `meta` line built at `:2493-2499`: `bits = [t.id]; … bits.push(chDone + "/" + ch.length + " subtasks"); … bits.push("waiting on " + t.blockedBy); … bits.push(di.label)` and colours it `di.late ? "var(--danger)" : "var(--label2)"` (`:2504`). The product's card (`board.tsx:1029-1063`) renders title, an optional avatar, a `pending`/`reopened` chip, a rollup, and a `who · when` fold. **No key. No due date. No lateness.** Ticket `CCSO-3` is due `14 Sep 2026` (sheet `Due` row, `[BROWSER]`); the measurement was taken on `2026-09-21` (`date` on the box, and the report's start line); its board card is indistinguishable from an undated one — its meta div is literally empty (`<div class="gn-board-card__meta"></div>`, `[BROWSER]`).
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/view-types.ts:204-213 BoardCard carries ticketId/title/typeId/assignee/stateProvenance/cause/rollup/pending — no key, no dueDate; the export's card carries the key and a due label that turns red; the wire gap is a recorded queue row (prototype-delta:526), not a ruling
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Carry `dueDate` (already on the list wire) and `key` onto `BoardCard` and draw the export's meta line — at minimum the due label with the late tone. If the wire gap is to stand, record the ruling at `board.tsx:1029` and say in the manual's Board section that lateness is shown on My Work and the List only.
HOW IT WAS MEASURED (reproduce this before and after):
  `EXPORT:2493-2504` opened; `board.tsx:1029-1063` opened; `view-types.ts:204-214` opened; `prototype-delta-2026-09-18.md:526` opened. `[BROWSER]` sheet `Due 14 Sep 2026 · set by Kiro on 6 Sep 2026` for `CCSO-3`; board card `sample` HTML shows `gn-board-card__meta` empty.
JUDGE'S NOTE: PARTIAL→scored at IMPORTANT, judge opened. An overdue ticket is indistinguishable on the board (category 3); the "my-work.tsx renders Overdue by N days" clause is false (verifier: :242 reads "needed by {date}") — overclaim noted, core holds.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-2: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-2 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-6  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 110

```
TASK T-E5-6 — batch B13 (Due date, soft-delete undo, members picker) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 110/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:379, 26 lines — read the whole section first):
  E5-6 — IMPORTANT · A due date can be seen in four places, computed as "overdue", and notified as "due soon" — and set nowhere `[SOURCE]` `[BROWSER]` — category 3
WHAT IS WRONG (the reviewer's words):
  The sheet's `Due` row is read-only text (`14 Sep 2026 · set by Kiro on 6 Sep 2026`; the sheet's inputs are `Ticket title`, `gn-new-subtask-title`, the `Assignee` select and four visibility radios — no date input, `[BROWSER]`). `grep -rn 'type="date"' apps/web packages/app-core/src/views` → **zero** in product code (the one hit is the docblock at `ticket-sheet.tsx:1239` describing the prototype). The manual states it: `docs/manual.md:23` *"you cannot set a due date anywhere"*, `:355`; `docs/faq.md:197-215` *"Can I set a due date?"* → no.
THE JUDGE'S LINE (the ruling rests on this; open it):
  docs/manual.md:23 "you cannot set a due date anywhere"; test-cases/16-remaining-doors.md:279-283 records the Due editor as "an unbuilt door" (a scope deferral); the write path exists (ticket-events.ts:66) and the export draws <input type="date">
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Build the export's date input on the sheet (the write path already exists — `ticket.field_set` carries `dueDate`, `ticket-events.ts:66`), or rule the deferral and say on the sheet's Due row that it is read-only on the web today rather than only in the manual.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` sheet inputs enumerated by JS (list in E5-4's measurement); `[SOURCE]` grep above; `ticket-sheet.tsx:1209-1250` opened; `EXPORT:1192-1206` opened; `docs/manual.md:23`, `:355` opened.
JUDGE'S NOTE: PARTIAL→scored at IMPORTANT, judge opened. A due date read in four places, computed as overdue and notified, but settable nowhere; the recorded deferral is engaged by consequence (rules §3 category-2-with-argument). The "my-work.tsx Overdue by N days" clause is false — overclaim noted.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-6: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-6 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-43  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 148

```
TASK T-E5-43 — batch B13 (Due date, soft-delete undo, members picker) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 148/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec5, docs/lanes/review-ux-exec5.md:1557, 27 lines — read the whole section first):
  E5-43 — MINOR · "Today" on the Calendar and Timeline is computed once per render, so a tab left open across the IST day boundary keeps yesterday's ring — and the manual places that boundary at half past six in the evening for London and late morning for Los Angeles `[SOURCE]` — recorded "NOT FIXED", unruled
WHAT IS WRONG (the reviewer's words):
  `page.tsx:1235` `const today = istToday();` inside the render, and the note beneath it (`:1237-1245`): *"RECORDED, NOT FIXED: `today` is computed once per RENDER and never re-derived on its own, so a tab left open across IST midnight keeps yesterday's ring until something else re-renders this page … Deliberately not fixed here: the fix is a timer … OWNER: whoever next opens this page's date wiring."* `today` feeds `CalendarView` and `TimelineView` (`:2330-2334`, `:2394-2398`) — the today ring, the "Today" control's target, and every "due today / overdue" relation those views draw.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1235 — const today = istToday();
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Re-derive `today` on a visibility-change / focus event (no cadence argument) or a once-a-minute tick scoped to the two date tabs.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `page.tsx:1225-1245`, `:2330-2334`, `:2394-2398`; `docs/manual.md:32`, `:1350-1354`. Not driven — it needs a session and a day boundary.
JUDGE'S NOTE: VALID per verifier chunk28 (line opened by the verifier, not the judge): today={today} opened at :2334 and :2398 (2 of 2 views); manual:32 and :1354 as cited. The note is a deferral with a named owner, not a ruling that the ring may be stale, and the finding argues that, s
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-43: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-43 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-30  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 154

```
TASK T-E2-30 — batch B13 (Due date, soft-delete undo, members picker) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 154/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec2, docs/lanes/review-ux-exec2.md:1761, 45 lines — read the whole section first):
  E2-30 (r2) — IMPORTANT · The only way back from a soft delete is a 15-second toast
WHAT IS WRONG (the reviewer's words):
  Every view excludes a soft-deleted ticket (`deleted_at IS NULL`; the partial index `proj_tickets_live_idx` exists to serve exactly that predicate). The inverse event exists and is gated and wired — but it has **exactly one producer in the entire client**: the Undo button inside the delete toast. Measured: **517 non-test source files** — ⚠ **UNIT PINNED, and this line was wrong on first writing:** it said *515*, the count under a `.ts`/`.tsx`-only filter; including `.js`/`.jsx`/`.mjs` gives **517**. A count whose filter is unstated is one a re-runner will contradict, which is the defect my `E2-2` files against a card one directory over — so the filter is named here: `walk("apps") + walk("packages")`, excluding `node_modules`, `dist`, `.git`, `.next`, `test-results`, and excluding `*.test.*` and `/test/`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  p/[projectId]/page.tsx:2954 onUndo: () => void restoreDeletedTicket(deleteNotice.undoFor) — the only undo producer; toast.tsx:39 TOAST_DEFAULT_DURATION_MS = 15_000
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Keep the toast — it is the right shape for a quick reversal — and add a durable path: a "Deleted" filter or section on the List, or a re-issue affordance keyed on the ticket. Neither needs anything the server does not already do. The sentence should then name where the durable route is instead of promising a history that cannot be reached from any screen.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `page.tsx:826-852` (`restoreDeletedTicket`), `:2888-2892` (the message and `undoFor`), `:2948-2957` (the `Toast`, and the absence of `durationMs`); `toast.tsx:33,39,122,131,142`; `apps/server/migrations/1789800000000_proj-tickets-deleted.sql` for the `deleted_at IS NULL` predicate and its partial index.
JUDGE'S NOTE: PARTIAL→scored at IMPORTANT, judge opened. The only way back from a soft delete is a 15-second toast; the sub-claim "the gate protects the doing and not the undoing" is false (check-permission.ts:1116 gates both ticket.deleted and ticket.restored, per the verifier). Core holds.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-30: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-30 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-11  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 156

```
TASK T-E5-11 — batch B13 (Due date, soft-delete undo, members picker) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 156/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec5, docs/lanes/review-ux-exec5.md:538, 31 lines — read the whole section first):
  E5-11 — IMPORTANT · The invite form asks a person to type comma-separated project ULIDs; the export draws a picker of project names; the manual says the box "is not usable by a person" `[BROWSER]` `[SOURCE]` — category 3
WHAT IS WRONG (the reviewer's words):
  `/w/…/members` → "Invite somebody" → `Projects (comma-separated ids, optional)`, a bare text input (`members/page.tsx:875-884`; `[BROWSER]` control list `INPUT:text` under that label). The export (`EXPORT:765-775`) draws `Project access` as a `<select>`: `All projects in this workspace` / `Only <project name>` per project. `docs/manual.md:236-240`: *"It asks for a comma-separated list of identifiers — long strings of letters and numbers that you would have to go and find from somewhere. **In practice this box is not usable by a person.**"*
THE JUDGE'S LINE (the ruling rests on this; open it):
  members/page.tsx:877 <span className="gn-field__label">Projects (comma-separated ids, optional)</span> — the export draws a picker of project names; no ruling found (verifier: 0 over Features.md/test-cases/docs/design with a positive control of 10 repo-wide)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The export's select, fed from the workspaces read the page already makes.
HOW IT WAS MEASURED (reproduce this before and after):
  `[BROWSER]` members page controls; `[SOURCE]` `members/page.tsx:721-741`, `:875-884`; `EXPORT:765-775`; `docs/manual.md:229-240`.
JUDGE'S NOTE: VALID, judge opened. A person is asked to type ULIDs where the prototype offers a picker, with no recorded ruling — category 3, IMPORTANT.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E5-11: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-11 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-31  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 207

```
TASK T-E2-31 — batch B13 (Due date, soft-delete undo, members picker) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 207/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:1807, 34 lines — read the whole section first):
  E2-31 (r2) — MINOR · A re-entrancy guard whose stated purpose cannot happen, in a file that fixed the same guard properly 200 lines away
WHAT IS WRONG (the reviewer's words):
  `packages/app-core/src/views/ticket-sheet.tsx:1029` — `if (submitting) return;` at the top of `submitTicketEvent`. Its docblock (`:1018-1023`) gives its purpose:
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/views/ticket-sheet.tsx:1029 — if (submitting) return;
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either delete the line and let the docblock say what actually holds (`disabled` is the guard), or make it real with a `submittingRef` mirroring `submitTitle`'s own synchronous ref in the same file.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `ticket-sheet.tsx:1014-1030` (the claim and the line); `packages/editor/src/components/TicketEditorSlot.tsx:128-136` (the measured precedent and the fix).
JUDGE'S NOTE: VALID per verifier chunk10 (line opened by the verifier, not the judge): Reproduction is a mutation; verified by reading. Sample 2 of 2 callers; no un-gated caller, so the named case is unobservable as claimed. Precedent at TicketEditorSlot.tsx:128-136. MINOR not IMPORTANT
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-31: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-31 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-35  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 208

```
TASK T-E2-35 — batch B13 (Due date, soft-delete undo, members picker) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 208/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec2, docs/lanes/review-ux-exec2.md:2037, 62 lines — read the whole section first):
  E2-35 (r2) — IMPORTANT · Deleting a ticket asks nothing, while the bulk close of the same soft delete gets a whole dialog
WHAT IS WRONG (the reviewer's words):
  `packages/app-core/src/views/ticket-sheet.tsx:2612-2621` is the footer's Delete: a bare `<button … disabled={submitting} onClick={() => void deleteTicket()}>Delete</button>`. One press performs the delete; `deleteTicket` (`:1202-1206`) then closes the sheet and hands the host the notice whose only undo is the 15-second toast measured in `E2-30`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  bulk-close-dialog.tsx:191 type: 'ticket.closed' — a different event from the delete; close's inverse is a permanent sheet control, not the 15 s toast
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One confirmation naming the ticket and the consequence, in the shape `BulkCloseDialog` already establishes. The sheet already owns the mechanism to *ask first* rather than merely warn — `precheck` (`:672-692`) runs the shared engine locally for exactly this purpose — so the accept path can be gated on a local check with the server's refusal still the authority and still rendered verbatim. ⚠ I am **not** proposing the control be hidden: the docblock's argument that a hidden control cannot explain itself is sound and my `E2-2`/`V1` findings run the other way. The ask is for a confirmation, not a concealment.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `ticket-sheet.tsx:2612-2621` (the button and its only `disabled` term), `:1178-1206` (the docblock, whose subject is permission and not confirmation), `:672-692` (`precheck`); `bulk-close-dialog.tsx` (the contrasting confirmation surface, read in my round-1 pass).
JUDGE'S NOTE: PARTIAL→MINOR, judge opened. The asymmetry observation holds; the equivalence claim ("the same soft delete… undone the same way") is false.
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-35: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-35 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-51  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 211

```
TASK T-E2-51 — batch B13 (Due date, soft-delete undo, members picker) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 211/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec2, docs/lanes/review-ux-exec2.md:3604, 37 lines — read the whole section first):
  E2-51 (r2) — MINOR · My own `13.761` still asserts an absence the product reversed, with a reason that is now false and a citation that points at a different case
WHAT IS WRONG (the reviewer's words):
  `test-cases/13-second-wave-board-actions.md:49-58`, case **`13.761`** — one of seven ids I minted on 2026-09-18 for the members roster — says:
THE JUDGE'S LINE (the ruling rests on this; open it):
  test-cases/13-second-wave-board-actions.md:54-57 — The case also pins the ABSENCE of a per-row control: no `combobox`, no `button` inside the table
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The same re-point the test got, applied to the case text: *"each row shows the wire's own token; a row the viewer may edit carries a control named for its person, and a row they may not chips the token instead"* — which is what the test asserts and what `E2-33`'s `isEditableRole` precedent guards. Plus the citation moved to `:602`.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `test-cases/13-second-wave-board-actions.md:49-58` (the case, in full); `apps/web/app/w/[workspaceId]/members/page.tsx:510-518` (the live control) and `:334-371` (`changeRole`); `apps/web/test/members-page.test.tsx:602-632` (the re-pointed test and its own account of the proxy) and `:446` (what the citation actually resolves to). Reached by sampling the catalogue's **judgement half** on my own block — the pass the controller directed and the one place the brief says my own work is in …
JUDGE'S NOTE: VALID per verifier chunk13 (line opened by the verifier, not the judge): 3 of 3 sub-claims opened. Select page.tsx:510-519 (aria-label :515); changeRole :334 ingests membership.granted; cited test:446 is ' *' inside the 3.138 docblock (describe :451), real test :602. Contr
DONE WHEN: A component test (vitest + the package's testing-library setup) that renders the state the finding describes and asserts the corrected sentence/arm — RED before, GREEN after, named with the ruling id. The package suite is green. `Features.md` and the owning `test-cases/` file change in the same commit when a person can observe the change.
COMMIT: `E2-51: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-51 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B14 — Minimal shells — phone and desktop  ·  lane UX  ·  session model **sonnet**  ·  backend **deepseek**  ·  14 tasks  ·  ~6.3 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec2` · branch `rel/b14-minimal-shells-phone-and-desktop` · packages touched: @gisik-nokma/desktop, @gisik-nokma/mobile.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E2-41` | sonnet | I | 1 | `apps/mobile/src/screens/board-screen.tsx:26`, `apps/mobile/src/screens/board-screen.tsx:16-42`, `apps/mobile/src/screens/ticket-screen.tsx:20-31` |
| 2 | `T-E2-42` | sonnet | I | 1 | `apps/mobile/src/app.tsx:38`, `packages/sync-client/src/net/http-transport.ts:157`, `apps/server/src/sync/sync-service.ts:321-327` |
| 3 | `T-E2-43` | sonnet | I | 1 | `apps/desktop/src/app.tsx:58-64`, `apps/desktop/src/app.tsx:46-82`, `apps/desktop/src/app.tsx:26-137` |
| 4 | `T-E2-48` | sonnet | I | 1 | `apps/mobile/src/app.tsx:31-41`, `apps/mobile/src/app.tsx:28-60`, `apps/mobile/src/app.tsx:1-97` |
| 5 | `T-E2-52` | sonnet | I | 1 | `apps/mobile/src/screens/ticket-screen.tsx:124`, `apps/mobile/src/screens/ticket-screen.tsx` |
| 6 | `T-E5-26` | sonnet | I | 1 | `apps/desktop/src/app.tsx:98`, `apps/desktop/src/app.tsx:95-102`, `apps/desktop/src/app.tsx` |
| 7 | `T-E5-44` | sonnet | I | 1 | `apps/mobile/src/app.tsx:38`, `packages/sync-client/src/net/http-transport.ts:157`, `apps/server/src/sync/sync-service.ts:321-327` |
| 8 | `T-E2-49` | haiku | M | 0.5 | `apps/mobile/src/push/register-push.ts:1-39`, `apps/mobile/src/app.tsx:52`, `apps/mobile/src/push/register-push.ts:9-38` |
| 9 | `T-E2-53` | sonnet | M | 0.5 | `apps/mobile/src/editor/editor-web-view.tsx:92`, `apps/mobile/src/editor/editor-web-view.tsx` |
| 10 | `T-E4-22` | haiku | M | 0.5 | `apps/mobile/src/screens/board-screen.tsx:60`, `apps/mobile/src/screens/board-screen.tsx:60-66`, `docs/pre-launch-checklist.md:402` |
| 11 | `T-P28` | haiku | M | 0.5 | `apps/mobile/src/screens/board-screen.tsx:60` |
| 12 | `T-P30` | haiku | M | 0.5 | `apps/mobile/src/editor/editor-html.generated.ts:2-4`, `apps/mobile/src/editor/editor-html.generated.ts`, `packages/editor/dist-webview/index.html` |
| 13 | `T-P6` | haiku | M | 0.5 | `apps/mobile/package.json` |
| 14 | `T-P7` | haiku | M | 0.5 | `apps/desktop/src/app.tsx:151`, `apps/desktop/src/app.tsx:151-155`, `apps/desktop/src/main.tsx` |

#### T-E2-41  ·  sonnet  ·  IMPORTANT  ·  ~1 h  ·  rank 124

```
TASK T-E2-41 — batch B14 (Minimal shells — phone and desktop) — model sonnet — backend deepseek — effort ~1 h — judged IMPORTANT — rank 124/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/mobile
FINDING (exec2, docs/lanes/review-ux-exec2.md:2350, 40 lines — read the whole section first):
  E2-41 (r2) — IMPORTANT · Two screens in the phone shell render a failed read as a benign state — an empty board, and "Opening…" for ever
WHAT IS WRONG (the reviewer's words):
  **WHAT — two sites, one cause: a read with no rejection handler.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/mobile/src/screens/board-screen.tsx:26 void ds.query.listTicketSummaries(workspaceId).then(setTickets); — no rejection arm; :31 "Opening…" until a success
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A rejection handler per read writing into an error state the screen renders — RN's `Text` with `accessibilityRole="alert"`, the shape the ticket screen already uses for refusals (`ticket-screen.tsx:125`). For (b) specifically, a third state so "no answer yet" and "the answer failed" stop sharing one word.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened in full: `apps/mobile/src/screens/board-screen.tsx:16-42` (the state, both `.then` calls, the effect) and `:56-68` (the list); `apps/mobile/src/screens/ticket-screen.tsx:20-31` (the state, the read, the gate) and `:125` (the alert arm it already has).
JUDGE'S NOTE: VALID, judge opened. Two phone screens render a failed read as a benign state, IMPORTANT.
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `E2-41: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-41 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-42  ·  sonnet  ·  IMPORTANT  ·  ~1 h  ·  rank 125

```
TASK T-E2-42 — batch B14 (Minimal shells — phone and desktop) — model sonnet — backend deepseek — effort ~1 h — judged IMPORTANT — rank 125/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/mobile
FINDING (exec2, docs/lanes/review-ux-exec2.md:2391, 136 lines — read the whole section first):
  E2-42 (r2) — IMPORTANT · A comment posted from the phone is recorded as the ASSIGNEE's words
WHAT IS WRONG (the reviewer's words):
  `apps/mobile/src/screens/ticket-screen.tsx:36-57`, the Comment button's handler (`:126` `<Button title="Comment" onPress={onComment} />`), builds the event with: ``` payload: { body: draft }, // Interim, flagged by the plan this task adapts: the session user id // is not wired up (no auth flow in this shell yet). Becomes the real // signed-in user once Plan 6's session handling reaches this app. actorId: state.assigneeId ?? 'me', origin: 'mobile', ``` `actorId` is the envelope's **claim of authorship** — `packages/domain/src/submit.ts:4-7`: *"The one client-side envelope builder. **Everything a client claims is here**"*, with `actorId` a required field of the envelope (`:14`).
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/mobile/src/app.tsx:38 createHttpTransport → packages/sync-client/src/net/http-transport.ts:157 doFetch(`${opts.baseUrl}/v1/sync`) — the phone's only door; apps/server/src/sync/sync-service.ts:321-327 if (event.actorId !== userId) return { status: 'invalid', code: 'actor-mismatch' } — before any gate; packages/sync-client/src/outbox/outbox.ts:406-412 `refused` or `invalid`: TERMINAL … status = 'failed'; packages/domain/src/envelope.ts:196 actorId: ulidString (the literal 'me' fails the …
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A placeholder that cannot resolve to a member — the literal `'me'` arm alone, or a distinct `origin`-scoped sentinel the roster cannot contain — and a sentence on the composer saying the comment will not be attributed until sign-in reaches this shell. The real fix is the session, which the comment names; the placeholder must not be a colleague.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `apps/mobile/src/screens/ticket-screen.tsx:36-57` (the handler and the `actorId`), `:126` (the button); `packages/domain/src/submit.ts:1-31` (the envelope builder, `actorId` at `:14`, and its own docblock); `docs/manual.md:401-406`.
JUDGE'S NOTE: PARTIAL→scored at IMPORTANT, judge opened. The headline ("recorded as the ASSIGNEE's words") is false — the spoof gate refuses it — but the core is a shipped path that can never succeed: every phone comment by a non-assignee is refused as identity spoofing. Overclaim noted; not raised above the claimed severity. ‖ PHASE 2 — R6-2 PARTIAL, no points move. Upheld on the door and the outcome: the phone syncs through …
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `E2-42: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-42 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-43  ·  sonnet  ·  IMPORTANT  ·  ~1 h  ·  rank 126

```
TASK T-E2-43 — batch B14 (Minimal shells — phone and desktop) — model sonnet — backend deepseek — effort ~1 h — judged IMPORTANT — rank 126/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/desktop
FINDING (exec2, docs/lanes/review-ux-exec2.md:2528, 56 lines — read the whole section first):
  E2-43 (r2) — IMPORTANT · The desktop shell's own startup has no rejection handler, so a failure to initialize is drawn as "Opening local replica…" for ever
WHAT IS WRONG (the reviewer's words):
  `apps/desktop/src/app.tsx:46-82` builds the whole app inside an unawaited async IIFE with **no catch**: ``` void (async () => { const storage = await createTauriSqlStorage(); // :47 const replica = await createReplica({ storage }); // :48 const outbox = createOutbox({ storage, replica }); const transport = createHttpTransport({ baseUrl: API_BASE, token }); const engine = createSyncEngine({ replica, outbox, transport }); const dataSource = createReplicaDataSource({ … }); if (disposed) return; setDs(dataSource); // :58 … })(); ``` and the render gates on exactly that value: `:134` `{ds === null ? <p>Opening local replica…</p> : <TicketList … />}`. **`ds` is set only on success**, so any rejection in the four awaits leaves the app on a loading sentence for ever, with the rejection unhandled and nothing on screen.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/desktop/src/app.tsx:58-64 setDs(dataSource) only inside the resolved arm, no rejection handler; :134 {ds === null ? <p>Opening local replica…</p> : …}
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A `catch` on the init IIFE writing into an error state the shell renders in place of "Opening local replica…", and a handler per read the way the mobile shell already needs one — the same fix, for the third and fourth time in the two shells.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened in full: `apps/desktop/src/app.tsx:26-137` (the state, the init IIFE and its four awaits, the gate at `:134`, the sync-status read at `:61-64`) and `:139-162` (`TicketList`, the read at `:146` and `tickets` at `:140`). The false comment at `:22-25` — which claims `SyncStatusBar` and `ContestBanner` "do not exist in `@gisik-nokma/app-core` yet" when both are exported from the barrel — is **already filed as part of `E2-25`** and is cited here only as corroboration that this file's comments …
JUDGE'S NOTE: VALID, judge opened. A failed initialisation is drawn as "Opening…" for ever, IMPORTANT.
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `E2-43: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-43 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-48  ·  sonnet  ·  IMPORTANT  ·  ~1 h  ·  rank 127

```
TASK T-E2-48 — batch B14 (Minimal shells — phone and desktop) — model sonnet — backend deepseek — effort ~1 h — judged IMPORTANT — rank 127/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/mobile
FINDING (exec2, docs/lanes/review-ux-exec2.md:3447, 51 lines — read the whole section first):
  E2-48 (r2) — IMPORTANT · The phone shell's startup has no rejection handler either — the sibling of `E2-43`, and the symptom here is an empty board with no error
WHAT IS WRONG (the reviewer's words):
  `apps/mobile/src/app.tsx:28-60`:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/mobile/src/app.tsx:31-41 an async IIFE awaiting createOpSqliteStorage/createReplica with no catch (grep catch → 0 in the file); setDs only on success at :41
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  A `catch` on the IIFE writing into an error state the shell renders in place of the Board — the shape `E2-43` asks for on desktop. The two shells share their architecture (`createReplica → createOutbox → createSyncEngine → createReplicaDataSource`, then `setDs`) and differ only in the storage adapter, so one pattern read twice would fix both.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `apps/mobile/src/app.tsx:1-97` (the env tokens, the effect and its four awaits, the `setDs` at `:41`, the two screens' gates); `apps/mobile/src/storage/op-sqlite-storage.ts:43-46` (the dynamic import and `open`); `apps/mobile/src/screens/board-screen.tsx:22` and `ticket-screen.tsx:31` (the gates). ⚠ **Not driven:** I did not run the app, so I claim the code path and the rejectability of the first await, not a reproduction.
JUDGE'S NOTE: PARTIAL→scored at IMPORTANT, judge opened. The phone shell's startup has no rejection handler; the absolute "no sentence" is false (board-screen.tsx:33 renders an Offline line) and the await count is 2 not 4 — overclaims noted, core holds.
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `E2-48: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-48 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-52  ·  sonnet  ·  IMPORTANT  ·  ~1 h  ·  rank 128

```
TASK T-E2-52 — batch B14 (Minimal shells — phone and desktop) — model sonnet — backend deepseek — effort ~1 h — judged IMPORTANT — rank 128/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/mobile
FINDING (exec2, docs/lanes/review-ux-exec2.md:3651, 71 lines — read the whole section first):
  E2-52 (r2) — IMPORTANT · On the phone, typing `@` in the comment editor states **"No people match"** for every query, because the host that answers mention queries was never wired
WHAT IS WRONG (the reviewer's words):
  The mobile comment editor's mention popup is **permanently and falsely empty**. For as long as a person holds an `@`-mention open on their phone, the popup's own status line reads *"No people match"* — whatever they type, and whatever the workspace's membership actually is.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/mobile/src/screens/ticket-screen.tsx:124 <EditorWebView initialDoc={draft} onChange={setDraft} html={EDITOR_HTML} /> — the mention query's fallback resolves [] silently (editor-web-view.tsx:82 per the verifier)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Two things, and the product already knows both: 1. **Pass `onMentionQuery`** from `ticket-screen.tsx:124`. The mobile host already holds a gateway and a replica (`board-screen.tsx:52` reads the same sync state), so the roster is one call away. This is the single-line remedy and it needs a completion path only if the *reply* shape is unbuilt — it is not. 2. **Make "we could not ask" distinguishable from "nobody matched."** My brief states the rule this violates in its own words — *"a withheld thing and an absent thing must not look alike"* — and the popup is already shaped to carry a third state: `mentionResultAnnouncement(count)` is **a function with a test** (`mention-popup.ts:26-35`). A `null`/`unavailable` input rendered as *"People list unavailable"* costs one branch and removes the false claim. This is the same repair `E2-39` asks for at the roster read, reached through a different door.
HOW IT WAS MEASURED (reproduce this before and after):
  Every line above was opened by me in this worktree at the branch's current head. The decisive one is a **positive-then-negative pair on the same file**: `grep -rn 'onRequestUpload'` over `apps/` and `packages/` returns only `editor-web-view.tsx`'s own declaration, parameter destructure, call site and dependency array — **no caller**; and `grep -n 'onMentionQuery' apps/mobile/src/screens/ticket-screen.tsx` returns **nothing**, against `entry.tsx:55`, which shows the query path exists and is …
JUDGE'S NOTE: VALID, judge opened the mount; the fallback rests on the verifier's opened line. A failed people-read is drawn as "nobody matches", IMPORTANT.
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `E2-52: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-52 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-26  ·  sonnet  ·  IMPORTANT  ·  ~1 h  ·  rank 129

```
TASK T-E5-26 — batch B14 (Minimal shells — phone and desktop) — model sonnet — backend deepseek — effort ~1 h — judged IMPORTANT — rank 129/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/desktop
FINDING (exec5, docs/lanes/review-ux-exec5.md:1021, 27 lines — read the whole section first):
  E5-26 — IMPORTANT · The desktop app's only first-run sentence sends a person to a Settings screen it does not have, for a token nothing issues — and the manual says the step is merely awkward `[SOURCE]` — FIRST-RUN
WHAT IS WRONG (the reviewer's words):
  `apps/desktop/src/app.tsx:95-102`: with no stored token the whole app is one paragraph — *"Sign in on the web app, then paste your token in Settings (interim flow — see plan Open questions)."* — plus a help toggle. The token is read from `localStorage.getItem('gisik.token')` (`:40`) and the workspace from `'gisik.workspaceId'` (`:39`); the comment at `:17-19` says they *"arrive via localStorage set on the sign-in page."* `grep -rn "gisik.token\|gisik.workspaceId" apps/web/app apps/web/src` → **0** — no sign-in page sets them. `grep -rni settings apps/desktop/src/app.tsx` → only the hint itself — there is **no Settings screen** in the desktop app. And the web has no page that shows a token: `/mcp/tokens` says *"The connection itself is never shown — only a one-way hash of it is stored, so there is nothing here to copy"* (`[BROWSER]`, `mcp-tokens-screen.tsx:343`).
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/desktop/src/app.tsx:98 "Sign in on the web app, then paste your token in Settings (interim flow — see plan Open questions)." — no Settings screen in apps/desktop (grep: the only hit is this sentence) and nothing issues such a token (verifier: zeros repo-wide with controls)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Until the desktop has a sign-in, say so plainly — *"The desktop app cannot sign in yet — use the website."* — and drop the plan reference; or ship the settings form the sentence promises.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `app.tsx:14-19`, `:39-40`, `:95-102`; the two greps above (0 hits each); `docs/manual.md:1203-1213`.
JUDGE'S NOTE: VALID, judge opened. The desktop app's only first-run sentence points at a screen it lacks for a token nothing issues, IMPORTANT.
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `E5-26: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-26 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E5-44  ·  sonnet  ·  IMPORTANT  ·  ~1 h  ·  rank 130

```
TASK T-E5-44 — batch B14 (Minimal shells — phone and desktop) — model sonnet — backend deepseek — effort ~1 h — judged IMPORTANT — rank 130/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/mobile
FINDING (exec5, docs/lanes/review-ux-exec5.md:1585, 34 lines — read the whole section first):
  E5-44 — IMPORTANT · (phase 2, half points — the narrowed core of withdrawn E5-21) The manual sends a person to the phone to comment; on any ticket NOT assigned to them — every unassigned ticket, every ticket on someone else — the phone files the comment under another id, the sync door answers `invalid`, the outbox marks it failed without retry, and the screen shows nothing `[SOURCE]` + exec 6's …
WHAT IS WRONG (the reviewer's words):
  `docs/manual.md:365-366`: *"**The phone app has a Comment button on a job and the website does not.**"* `apps/mobile/src/screens/ticket-screen.tsx:36-57` files `comment.added` with `actorId: state.assigneeId ?? 'me'`. Three cases, measured by exec 6 through `POST /v1/sync` (R6-1, its probe reproduced verbatim in its file): assigned to the commenter → **committed**; assigned to someone else → `invalid: actor-mismatch` (*"A synced claim must belong to the signed-in user."*, `sync-service.ts:321-327`); unassigned (`'me'`) → `invalid: malformed-envelope` (`actorId: must be a ULID`). An `invalid` answer sets the outbox row to `failed` with no retry (`sync-client/src/outbox/outbox.ts:408-412`). On the phone the submit's only arm swallows the local queue acceptance — `:54` `if (err instanceof OfflineAcceptError) return; // queued locally — the expected offline outcome` — and the ticket screen …
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/mobile/src/app.tsx:38 createHttpTransport → packages/sync-client/src/net/http-transport.ts:157 doFetch(`${opts.baseUrl}/v1/sync`) — the phone's only door; apps/server/src/sync/sync-service.ts:321-327 if (event.actorId !== userId) return { status: 'invalid', code: 'actor-mismatch' } — before any gate; packages/sync-client/src/outbox/outbox.ts:406-412 `refused` or `invalid`: TERMINAL … status = 'failed'; packages/domain/src/envelope.ts:196 actorId: ulidString (the literal 'me' fails the …
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Bind the phone's `actorId` to the session (the comment at `:45-48` says this is "interim"); until then, withhold the Comment control on tickets not assigned to the viewer with a sentence, rather than accept into a queue whose failure the screen never reads; and scope the manual's sentence.
HOW IT WAS MEASURED (reproduce this before and after):
  `[SOURCE]` `ticket-screen.tsx:36-57`, `:54`, `:126`; `sync-service.ts:29`, `:318-327`; `outbox.ts:408-412`; `http-transport.ts:80`; `docs/manual.md:363-366`. The door outcomes are exec 6's R6-1 measurement, attributed; I did not run a probe (no writes, no phone).
JUDGE'S NOTE: VALID, judge opened. The narrowed core of withdrawn E5-21 — a comment on any ticket not assigned to the commenter never posts and the ticket screen says nothing — scored at the phase-1 rate (3), not the phase-2 half: it is the finding the judge already scored at IMPORTANT in phase 1, refiled under a new id after R6-1. exec 2 kept the same core by narrowing E2-42 in place; rules §5 gives the same measurement the same …
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `E5-44: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E5-44 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-49  ·  haiku  ·  MINOR  ·  ~0.5 h  ·  rank 158

```
TASK T-E2-49 — batch B14 (Minimal shells — phone and desktop) — model haiku — backend deepseek — effort ~0.5 h — judged MINOR — rank 158/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/mobile
FINDING (exec2, docs/lanes/review-ux-exec2.md:3499, 44 lines — read the whole section first):
  E2-49 (r2) — MINOR · Push registration's declared contract is not total: a transport failure escapes as a rejection its only caller voids
WHAT IS WRONG (the reviewer's words):
  `apps/mobile/src/push/register-push.ts:9-38` declares `Promise<{ registered: boolean; reason?: string }>` and returns a discriminated outcome for four cases — a token failure (`:28-30`, `reason: 'no-token'`), a 404 (`:36`, `'transport-unavailable'`), any non-ok (`:37`, `` `http-${res.status}` ``) and success (`:38`). **The `fetch` at `:31` is not inside any `catch`**, so a transport failure — offline, a dropped socket — **rejects** instead of returning `{ registered: false, reason: … }`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/mobile/src/push/register-push.ts:1-39 (esp. :14, :26-30, :31); apps/mobile/src/app.tsx:52 — const res = await doFetch(`${opts.baseUrl}/v1/push/registrations`, { (:31)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Move the `fetch` inside the `try` at `:26-30`, or add a second `catch` returning `{ registered: false, reason: 'unreachable' }` — the vocabulary is already there in spirit (the 404 arm is `'transport-unavailable'`, which is a *different* fact from a request that never got an answer, and conflating them would be the mistake Ruling 27/33 exists to prevent). ⚠ **And the reason must be a third value, not the 404 one** — this product has a standing rule that a refusal and a dropped connection are never the same word.
HOW IT WAS MEASURED (reproduce this before and after):
  Opened: `apps/mobile/src/push/register-push.ts:1-39` (in full — the four return arms, the `try`/`catch` that covers only `getToken`, and the unguarded `doFetch` at `:31`); `apps/mobile/src/app.tsx:52` (the `void` call site). ⚠ **Checked and NOT a defect, so it is not filed:** the permission denial at `:21` throws, and that throw **is** caught by the `try` at `:26` — I read it expecting a second hole and there is not one.
JUDGE'S NOTE: VALID per verifier chunk12 (line opened by the verifier, not the judge): Whole 39-line file read. Return type :14, four arms :29/:36/:37/:38, the only try (:26-30) wraps getToken alone - so the :21 permission throw IS caught (his non-defect holds) and the :31 fetch is not.
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `E2-49: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-49 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E2-53  ·  sonnet  ·  MINOR  ·  ~0.5 h  ·  rank 159

```
TASK T-E2-53 — batch B14 (Minimal shells — phone and desktop) — model sonnet — backend deepseek — effort ~0.5 h — judged MINOR — rank 159/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/mobile
FINDING (exec2, docs/lanes/review-ux-exec2.md:3723, 43 lines — read the whole section first):
  E2-53 (r2) — MINOR · The mobile editor host has no refusal vocabulary at all: three doors, and silence is the answer at every one
WHAT IS WRONG (the reviewer's words):
  `apps/mobile/src/editor/editor-web-view.tsx` hosts the phone's only document editor. **It contains no path by which the editor is ever told that anything went wrong, and no path by which a person is told either.** Three doors, each measured by absence at a named line:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/mobile/src/editor/editor-web-view.tsx:92 — return <WebView ref={ref} originWhitelist={['about:*']} source={source} onMessage={onMessage} javaScriptEnable
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  (a) Reply in-protocol on a parse failure — the host already replies to unanswered mention queries for exactly this reason (`:83`, *"an unanswered mentionQuery leaves the popup pending forever — always reply in-protocol"*), and the same argument applies to a frame the host refused; (b) `onError`/`renderError` on the `WebView`, rendering the product's existing refusal vocabulary instead of a blank rectangle; (c) a timeout behind `ready` that reports *"the editor did not open"* rather than waiting for ever. None of the three needs a new component — (a) and (c) are the discipline `:83` already states.
HOW IT WAS MEASURED (reproduce this before and after):
  `grep -n 'onError\|renderError\|onLoadEnd\|onHttpError\|startInLoadingState' apps/mobile/src/editor/editor-web-view.tsx` → **0 matches**; `grep -c 'loadDoc'` → 4, of which only `:69` is a send. ⚠ **Reachability, stated honestly and NOT measured:** I did not produce a malformed frame, and on a matched build the bridge's serialiser and parser are the same version, so door (a) is reachable today only through the one category `bridge.ts`'s own docblock names as untestable (a raw string that fails …
JUDGE'S NOTE: VALID per verifier chunk13 (line opened by the verifier, not the judge): 3 of 3 doors opened: :66 silent drop, :69 sole loadDoc send in case 'ready', :92 five props only. Docblock :16-24 quoted accurately. Control: grep -c onMessage=2, so the 0 is not a dead grep. Reachabi
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `E2-53: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E2-53 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-22  ·  haiku  ·  MINOR  ·  ~0.5 h  ·  rank 182

```
TASK T-E4-22 — batch B14 (Minimal shells — phone and desktop) — model haiku — backend deepseek — effort ~0.5 h — judged MINOR — rank 182/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/mobile
FINDING (exec4, docs/lanes/review-ui-exec4.md:370, 10 lines — read the whole section first):
  E4-22 — **MINOR** — The mobile board's rows are `TouchableOpacity`s with no `accessibilityRole`, so VoiceOver/TalkBack reads each row as text, not as a button
WHAT IS WRONG (the reviewer's words):
  `accessibilityRole="button"` and `accessibilityLabel={\`${item.title}, ${stateName}\`}` on the row; the same on `ticket-screen.tsx`'s contest `View` (`:108`), which carries `accessibilityRole="alert"` but whose three `<Button>`s are the only labelled controls.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/mobile/src/screens/board-screen.tsx:60 — <TouchableOpacity onPress={() => navigation.navigate('Ticket', { ticketId: item.ticketId })}>
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `accessibilityRole="button"` and `accessibilityLabel={\`${item.title}, ${stateName}\`}` on the row; the same on `ticket-screen.tsx`'s contest `View` (`:108`), which carries `accessibilityRole="alert"` but whose three `<Button>`s are the only labelled controls.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (source; `apps/mobile` has never been rendered — `Features.md` marks it `⚙️`, and I did not run a simulator).** `apps/mobile/src/screens/board-screen.tsx:60-66`: `<TouchableOpacity onPress={() => navigation.navigate('Ticket', …)}>` with no `accessibilityRole`, `accessibilityLabel` or `accessibilityHint`; `grep -c "accessibilityRole\|accessibilityLabel"` → 2 in the file, both on the sync-status `<Text accessibilityRole="text">` (`:52-53`), none on the row. The row text is …
JUDGE'S NOTE: VALID per verifier chunk20 (line opened by the verifier, not the judge): The row carries no accessibilityRole/Label/Hint; text is {item.title} - {item.stateId}. The recorded deferral covers the LABEL only, not the role, as claimed. ticket-screen.tsx:108 accessibilityRole="
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `E4-22: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-22 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P28  ·  haiku  ·  MINOR  ·  ~0.5 h  ·  rank 197

```
TASK T-P28 — batch B14 (Minimal shells — phone and desktop) — model haiku — backend deepseek — effort ~0.5 h — judged MINOR — rank 197/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/mobile
FINDING (exec1, docs/lanes/review-ui-exec1.md:774, 22 lines — read the whole section first):
  P28 — **MINOR** ⚠ **r2 NEW** — The mobile board's row is the one pressable in the app with no accessibility role, and its sibling sets one explicitly
WHAT IS WRONG (the reviewer's words):
  `apps/mobile/src/screens/board-screen.tsx:60` renders `<TouchableOpacity onPress={() => navigation.navigate('Ticket', …)}>` with **no `accessibilityRole`** — so on iOS and Android the app's primary navigation target is announced as text rather than as a control.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/mobile/src/screens/board-screen.tsx:60 — <TouchableOpacity onPress={() => navigation.navigate('Ticket', { ticketId: item.ticketId })}>
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Add `accessibilityRole="button"` (and an `accessibilityLabel` naming the ticket) to the `TouchableOpacity` at `apps/mobile/src/screens/board-screen.tsx:60`, the same way `help-screen.tsx:296-299` does on its `Pressable`. Then sweep every pressable under `apps/mobile/src` for a missing role and fix the ones you find; say in the commit how many you opened.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — all six pressables in the app, each opened:**
JUDGE'S NOTE: PARTIAL per verifier chunk04 (line opened by the verifier, not the judge): Core holds: :60 has no accessibilityRole; help-screen.tsx:296 Pressable sets it at :299; Features.md:2165 quote confirmed. PARTIAL: the census says "all six pressables"/"every pressable in apps/mobile
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `P28: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P28 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P30  ·  haiku  ·  MINOR  ·  ~0.5 h  ·  rank 199

```
TASK T-P30 — batch B14 (Minimal shells — phone and desktop) — model haiku — backend deepseek — effort ~0.5 h — judged MINOR — rank 199/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/mobile
FINDING (exec1, docs/lanes/review-ui-exec1.md:822, 39 lines — read the whole section first):
  P30 — **IMPORTANT** ⚠ **r2 NEW** — The mobile editor webview is TWO GENERATED LINKS BEHIND, and both links are unguarded
WHAT IS WRONG (the reviewer's words):
  `apps/mobile` renders the ticket's description editor inside a WebView built from a **baked HTML string**. That string is generated from a **built bundle**, which is built from `packages/editor`'s source — **a three-step chain, unguarded at both generated links, and measured to be two steps stale.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/mobile/src/editor/editor-html.generated.ts:2-4 "Regenerate with: pnpm --filter @gisik-nokma/editor run build:webview" — the header DOES name the remedy the finding says nothing names
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `generate-editor-html.mjs` gaining a `--check` mode that regenerates into a temp file and diffs, wired as one step in the mobile package's `test` — the same shape `check:help` already uses for the in-app manual (*"the in-app manual and FAQ must match the documents they are generated from"*), which is this repository's own precedent for exactly this problem. **And the header should say the bundle must be rebuilt first**, since its current instruction would produce a second stale artefact and look like a fix.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — each link, in order, with what proves the drift.** 1. **The generated constant is from 2026-09-06.** `git log -1 --format='%ad' -- apps/mobile/src/editor/editor-html.generated.ts` → **`dca435d2`, 2026-09-06 02:24**. 2. **The editor's source has changed FIVE times since.** `git rev-list --count --since=2026-09-03 HEAD -- packages/editor/src` → **5**, and they are not cosmetic: `1cbc6a02` (*"The description is editable, and the row it lives in did not exist"*), **`af4d31b7` (*"The …
JUDGE'S NOTE: PARTIAL→MINOR, judge opened. The staleness core (generated file behind 5 editor commits, no check) holds per the verifier's reproduction; the "documented remedy would not fix it / nothing says so" half is false at the cited header.
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `P30: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P30 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P6  ·  haiku  ·  MINOR  ·  ~0.5 h  ·  rank 202

```
TASK T-P6 — batch B14 (Minimal shells — phone and desktop) — model haiku — backend deepseek — effort ~0.5 h — judged MINOR — rank 202/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/mobile
FINDING (exec1, docs/lanes/review-ui-exec1.md:367, 13 lines — read the whole section first):
  P6 — **MINOR** — Mobile: two of three screens have no styling of any kind
WHAT IS WRONG (the reviewer's words):
  `board-screen.tsx` and `ticket-screen.tsx` define **no `StyleSheet` and set no `style` prop**; `help-screen.tsx` has a full themed palette module.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/mobile/package.json (dependencies block) — @gisik-nokma/ui: "workspace:*",
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Say it in the same bullet: *"`help-screen` alone is themed (`help-theme.ts`); `board-screen` and `ticket-screen` render with RN defaults and no palette."* Then the mark `⚙️` and the code agree, and the first device run knows what it is looking at.
HOW IT WAS MEASURED (reproduce this before and after):
  `grep -c StyleSheet` → `help-screen.tsx`: 5; `board-screen.tsx`: **0**; `ticket-screen.tsx`: **0**. `grep "style"` over the two screens returns only `{ text: 'Cancel', style: 'cancel' }` and `{ … style: 'destructive' }` (`ticket-screen.tsx:96-97`) — iOS `Alert` button styles, not component styling. Their imports are raw `react-native` primitives plus `@gisik-nokma/app-core`/`domain`/`editor`; `apps/mobile/package.json` has **no UI-kit dependency**. `help-screen.tsx:19` imports `helpPaletteFor`, …
JUDGE'S NOTE: PARTIAL per verifier chunk02 (line opened by the verifier, not the judge): CORE HOLDS and is controlled: StyleSheet 5/0/0 with help-screen as the positive control, and the only style hits on the two screens are the iOS Alert button styles at ticket-screen.tsx:96-97. FALSE AB
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `P6: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P6 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P7  ·  haiku  ·  MINOR  ·  ~0.5 h  ·  rank 203

```
TASK T-P7 — batch B14 (Minimal shells — phone and desktop) — model haiku — backend deepseek — effort ~0.5 h — judged MINOR — rank 203/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec2   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/desktop
FINDING (exec1, docs/lanes/review-ui-exec1.md:381, 18 lines — read the whole section first):
  P7 — **MINOR** — Desktop's task list has no rules at all
WHAT IS WRONG (the reviewer's words):
  `apps/desktop/src/app.tsx:151-155` renders `.ticket-list`, `.ticket-list__row`, `.ticket-list__title`, `.ticket-list__state`. **None has a selector block in any of the three stylesheets.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/desktop/src/app.tsx:151 — <ul className="ticket-list">
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Extend the `ui.css` note that already reasons about `apps/desktop` to name what it *does* style there, and either style `.ticket-list*` or record it as a named absence with an owner — as `Features.md:2169` does for mobile's missing push transport.
HOW IT WAS MEASURED (reproduce this before and after):
  Selector extraction across `ui.css`, `globals.css`, `editor.css` → 0 for each of the four (positive control `.gn-help__toggle` → 5). `apps/desktop/src/main.tsx` imports `@gisik-nokma/ui/ui.css`, and — **verified at this tree, not from prose** — also `installTheme` from `./theme.js`, so the **tokens** resolve (`theme.ts:15`: *"until pre-launch item 6 only `apps/web` ever emitted [them]. Without this line every `var(--gn-…)` above resolves to nothing"*); `apps/desktop/index.html` carries **0** …
JUDGE'S NOTE: VALID per verifier chunk02 (line opened by the verifier, not the judge): Source extraction 0 for all four classes; controls gn-help__toggle=4 and gn-board-card__move=4 in the same command. Descendant-rule regex 0 for both families, control gn-help=2. index.html <style=0; u
DONE WHEN: A test where the shell has one (vitest in apps/mobile or apps/desktop; else a pure-function test of the handler) reproduces the defect RED→GREEN; the shell still type-checks (`pnpm --filter <pkg> typecheck`).
COMMIT: `P7: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P7 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B15 — Calendar, timeline and canvas for assistive tech  ·  lane UI  ·  session model **sonnet**  ·  backend **deepseek**  ·  4 tasks  ·  ~1.7 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec4` · branch `rel/b15-calendar-timeline-and-canvas-for` · packages touched: @gisik-nokma/app-core.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E4-16` | haiku | M | 0.4 | `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx` |
| 2 | `T-E4-28` | sonnet | I | 1.25 |  |
| 3 | `T-E4-20` | sonnet | M | 0.6 | `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx:57` |
| 4 | `T-P20` | sonnet | M | 0.6 | `packages/app-core/src/calendar/calendar-view.tsx:395`, `packages/app-core/src/calendar/calendar-view.tsx:395-425`, `packages/app-core/test/calendar/calendar-view.test.tsx` |

#### T-E4-16  ·  haiku  ·  MINOR  ·  ~0.4 h  ·  rank 143

```
TASK T-E4-16 — batch B15 (Calendar, timeline and canvas for assistive tech) — model haiku — backend deepseek — effort ~0.4 h — judged MINOR — rank 143/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:295, 6 lines — read the whole section first):
  E4-16 — **MINOR** — React Flow's attribution link renders at 10 px with 1.10:1 contrast in dark mode (2.61:1 in light)
WHAT IS WRONG (the reviewer's words):
  (see the section)
THE JUDGE'S LINE (the ruling rests on this; open it):
  node_modules/@xyflow/react/dist/style.css:316-324 (vendor; imported at workflow-canvas.tsx:10) — .react-flow__attribution { font-size: 10px; ... } .react-flow__attribution a { text-decoration: none; color:
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  React Flow's attribution link paints at 10 px with 1.10:1 contrast in dark mode. Either pass `colorMode` to `<ReactFlow>` in `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx` so `.react-flow.dark` applies, or add a repo override for `.react-flow__attribution` (font-size ≥ 12 px, colour meeting 4.5:1 on both themes) in the workflow builder's stylesheet. Add the pair to the contrast roster if the roster enumerates pairs.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, builder route).** `a "React Flow attribution"`: `font-size: 10px`, `color: rgb(153,153,153)` on the canvas backdrop `rgb(141,145,160)` (dark) → **1.10:1**; on `rgb(248,245,241)` (light) → **2.61:1**; both under 4.5. It is the only text-contrast failure in 12 dark-mode routes and 14 light-mode routes I measured (2,600+ text elements). **Caveat stated:** this is React Flow's own element (`.react-flow__attribution`), required by its licence unless the pro option is used; …
JUDGE'S NOTE: VALID per verifier chunk19 (line opened by the verifier, not the judge): Reproduces. No repo override (grep react-flow__attribution and --xy- over source CSS = 0). Dark backdrop corroborates: no colorMode prop, so .react-flow.dark never applies and the attribution keeps rg
DONE WHEN: The property/value is asserted by the tokens or CSS sweep test where one exists, else by a small test that reads the rule; if the finding claims a painted number, either paint it on a dev server you started on a free port or say 'not painted' in the commit. Package suite green.
COMMIT: `E4-16: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-16 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-28  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 155

```
TASK T-E4-28 — batch B15 (Calendar, timeline and canvas for assistive tech) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 155/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec4, docs/lanes/review-ui-exec4.md:446, 12 lines — read the whole section first):
  E4-28 — **IMPORTANT** — The Calendar and the Timeline convey every date relationship by position alone: day cells and week columns are unlabelled `div`s, items and bars are buttons placed by CSS `grid-column`, and the dates themselves live only in `title`
WHAT IS WRONG (the reviewer's words):
  The cheapest honest fix is in the *name*, not the structure: `aria-label={`${title} — due ${date}`}` on each item/bar (the `title` text already exists), and `<time dateTime>` or an `aria-label` with the full date on each day cell. The structural fix — `role="grid"` with `columnheader`/`gridcell`, or a `<table>` — is what the ARIA calendar pattern asks for and is a larger change.
THE JUDGE'S LINE (the ruling rests on this; open it):
  calendar-view.tsx:427-430 day cells carry only data-day/data-today/data-outside/aria-current; :453 <ul className="gn-calendar__items"> sits OUTSIDE the cells, each li placed by grid position — grep aria-label|<th|scope= in the file → 3 (none on the cells)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The cheapest honest fix is in the *name*, not the structure: `aria-label={`${title} — due ${date}`}` on each item/bar (the `title` text already exists), and `<time dateTime>` or an `aria-label` with the full date on each day cell. The structural fix — `role="grid"` with `columnheader`/`gridcell`, or a `<table>` — is what the ARIA calendar pattern asks for and is a larger change.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted, 1512, Calendar and Timeline views).** Calendar: `.gn-calendar` is a `DIV` with no role; `table` → false, `[role=grid]` → false, zero `role` attributes inside; the first three day cells are `div.gn-calendar__day` whose entire text is `31`, `1`, `2` (no `aria-label`, no `<time>`); weekday heads are `span Mon / Tue / Wed`; an item is `<button>` with text *HSN digit count* and `title="starts 18 Aug — Kiro's claim · needed by 5 Oct — Kiro's claim"`. Timeline: `table` → false, …
JUDGE'S NOTE: VALID, judge opened. Calendar and Timeline convey date relationships by position alone = accessibility failure, IMPORTANT.
DONE WHEN: A component test asserting the corrected behaviour (role, focus target, key handling) — RED before, GREEN after, named with the ruling id; the package suite is green; `test-cases/` updated in the same commit.
COMMIT: `E4-28: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-28 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-20  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 213

```
TASK T-E4-20 — batch B15 (Calendar, timeline and canvas for assistive tech) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 213/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec4, docs/lanes/review-ui-exec4.md:346, 12 lines — read the whole section first):
  E4-20 — **MINOR** — The workflow builder opens with `fitView`, so every control on a state node is painted at 74 % of its size on a 1512-px desktop (a 10×10 Blocked checkbox, ~9-px labels) and at ~52 % on a phone; the prototype draws the canvas at 1:1 inside a scrolling card
WHAT IS WRONG (the reviewer's words):
  `fitView={false}` with `defaultViewport={{ zoom: 1 }}` and the prototype's scrolling card, or `fitViewOptions={{ minZoom: 1 }}` so fit never shrinks below 1:1; and give the canvas more height than 480 px on a 900-px viewport.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx:57 — fitView
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `fitView={false}` with `defaultViewport={{ zoom: 1 }}` and the prototype's scrolling card, or `fitViewOptions={{ minZoom: 1 }}` so fit never shrinks below 1:1; and give the canvas more height than 480 px on a 900-px viewport.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (painted).** 1512×900: `.react-flow__viewport` `transform: matrix(0.744928, …)`; canvas `564×480`; per node `input.nodrag "Blocked"` → **10×10**, `button.gn-select__trigger "Category"` → **103×33** (the 44-px control at 0.745), `span "Start"` `font-size: 12px` painted in a `22×13` box (~9 px). 390×844: the same checkbox → **7×7**, the trigger → `69×22`. 768: `10×10`. Source: `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx:57` `fitView`; `.gn-workflow-canvas { …
JUDGE'S NOTE: VALID per verifier chunk20 (line opened by the verifier, not the judge): Mechanism read, painted numbers (0.744928, 10x10) NOT re-measured - reproduction needs a browser. ui.css:2179 min-height:480px verbatim; state-node.tsx:46 label wraps the checkbox; plan hit :3087 is i
DONE WHEN: A component test asserting the corrected behaviour (role, focus target, key handling) — RED before, GREEN after, named with the ruling id; the package suite is green; `test-cases/` updated in the same commit.
COMMIT: `E4-20: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-20 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P20  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 228

```
TASK T-P20 — batch B15 (Calendar, timeline and canvas for assistive tech) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 228/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec1, docs/lanes/review-ui-exec1.md:567, 15 lines — read the whole section first):
  P20 — **MINOR** ⚠ **r2 NEW** — The month grid and the week columns carry no table or grid semantics, so a screen reader loses the day-to-weekday association
WHAT IS WRONG (the reviewer's words):
  The calendar's month grid and the timeline's week columns are built from `<div>`s and `<span>`s with **no `role="grid"`, `role="table"`, `role="row"`, `role="gridcell"` or `role="columnheader"` anywhere**. A day cell is not associated with the weekday column it sits under.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/calendar/calendar-view.tsx:395 — <div className="gn-calendar__grid">
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The APG's calendar grid pattern: `role="grid"` on the container, `role="row"` per week, `role="columnheader"` with `aria-label` on the seven labels, `role="gridcell"` on the day cells. The markup is already grouped exactly that way — grid → weekday-head → week → days → day — so the roles are an attribute apiece on a structure that already exists.
HOW IT WAS MEASURED (reproduce this before and after):
  - `packages/app-core/src/calendar/calendar-view.tsx:395-425`: `<div className="gn-calendar__grid">` → `<div className="gn-calendar__weekday-head">` containing seven `<span className="gn-calendar__weekday">{label}</span>`, then one `<section className="gn-calendar__week" data-week={…}>` per week, each holding `<div className="gn-calendar__days">` with `<div className="gn-calendar__day">` cells. **Headers are plain spans; cells are plain divs; there is no role on any of them.** - `data-week` …
JUDGE'S NOTE: VALID per verifier chunk03 (line opened by the verifier, not the judge): Structure reproduces: grid:395 > weekday-head:396 > 7 spans > section.week:409 > days:410 > day div, no role on any. Controls: the grep finds role=note:312 and 1 role= in timeline, so it traverses; th
DONE WHEN: A component test asserting the corrected behaviour (role, focus target, key handling) — RED before, GREEN after, named with the ruling id; the package suite is green; `test-cases/` updated in the same commit.
COMMIT: `P20: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P20 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B16 — Outbox ordering, projection verifier, domain schema drift  ·  lane FUNC  ·  session model **opus**  ·  backend **claude-opus (deepseek-capable tasks may be split out to a DeepSeek session)**  ·  7 tasks  ·  ~3.2 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec6` · branch `rel/b16-outbox-ordering-projection-verif` · packages touched: @gisik-nokma/domain, @gisik-nokma/server, @gisik-nokma/sync-client.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E6-13` | sonnet | I | 1.25 | `apps/server/src/projections/tickets.ts:38-47`, `docs/plan-3-chain-b-handoff.md:213-222`, `docs/runbook.md:149-150` |
| 2 | `T-E6-22` | haiku | M | 0.25 | `apps/server/src/visibility/can-see.ts:95` |
| 3 | `T-E6-23` | haiku | M | 0.25 | `apps/server/src/ops/schedule.ts:14`, `deploy/do/app.yaml:297` |
| 4 | `T-E6-5` | opus | I | 1.75 | `packages/sync-client/src/outbox/outbox.ts:333` |
| 5 | `T-E6-17` | sonnet | M | 0.6 | `packages/domain/src/events/ticket-events.ts:59` |
| 6 | `T-E6-19` | sonnet | M | 0.6 | `packages/domain/src/ist-day.ts:27` |
| 7 | `T-E6-20` | sonnet | M | 0.6 | `packages/domain/src/workflow.ts:8` |

#### T-E6-13  ·  sonnet  ·  IMPORTANT  ·  ~1.25 h  ·  rank 157

```
TASK T-E6-13 — batch B16 (Outbox ordering, projection verifier, domain schema drift) — model sonnet — backend deepseek — effort ~1.25 h — judged IMPORTANT — rank 157/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1032, 52 lines — read the whole section first):
  E6-13 — IMPORTANT — `verify:projections` reports DRIFT on a correct database after an ordinary type re-bind, so the restore drill it gates fails for a false reason and a real drift becomes indistinguishable from the known one
WHAT IS WRONG (the reviewer's words):
  Through the door, with the verifier run in-process (Appendix L; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/projections/tickets.ts:38-47 "getTicketTypeLadderFromDb takes no sequence number and reads what proj_ticket_types holds NOW … after that, replaying the ticket.created resolves the NEW workflowId … It is the plan's Open question 11, scoped out"; runbook.md:149-150 makes verify:projections the restore drill's pass condition
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The handoff already names the fix and its cost (a history-bearing `proj_ticket_types`, i.e. an as-of lookup like the workflow one). Short of that, two honest options: (a) have the verifier **know** this class — when a ticket's live `workflow_id` disagrees with the rebuild only because the type's binding changed after the ticket was created (the ledger says which), report it as *"binding drift, expected"* rather than `DRIFT DETECTED`, so the clean line means what the runbook says; or (b) record in `runbook.md` that the drill is not clean after a re-bind and what the expected row looks like. Either is one afternoon; leaving it UNASSIGNED with the trigger shipped is the choice this finding argues against.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix L, run from `apps/server` (imports `../src/tools/verify-projections.js` and `../src/projections/index.js` relatively). Lines opened: `verify-projections.ts:34-68` (projection-outer rebuild, `EXCEPT` both ways); `ledger/event-store.ts:146-156` (replay order, documented); `projections/tickets.ts:37-53`; `docs/plan-3-chain-b-handoff.md:213-222`; `docs/runbook.md:149-150`, `:174-175`; `seed-cc.test.ts:429-432`; `ticket-type-editor-screen.tsx:286-300`, `:354-361`, `:476`; `git log …
JUDGE'S NOTE: VALID, judge opened. The projection verifier reports DRIFT on a correct database after an ordinary re-bind; the recorded scope-out is engaged by its consequence (the drill fails for a false reason). IMPORTANT.
DONE WHEN: A test in the owning package reproduces the defect, RED before and GREEN after (named with the ruling id); the package suite is green; `Features.md` and `test-cases/` updated in the same commit when the behaviour is user-observable.
COMMIT: `E6-13: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-13 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-22  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 185

```
TASK T-E6-22 — batch B16 (Outbox ordering, projection verifier, domain schema drift) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 185/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1472, 37 lines — read the whole section first):
  E6-22 — MINOR — The export advertises "ticket-only access" for someone outside the workspace; the product has no such tier — the door commits the naming and it confers nothing (category 3, no ruling found)
WHAT IS WRONG (the reviewer's words):
  Export `Gisik Nokma - Desktop.dc.html` (sha `3d142d46`) `:1229`, the visibility sheet's helper text: *"Naming someone outside this workspace gives them ticket-only access — this ticket, nothing else"*; `:3771` the candidate suffix *"— outside this workspace"*; `github.md:15`: *"Seeded an external person … named on restricted GN-1164 but is not a workspace member, so ticket-only access … [is] visible on load."* Measured in the product (Appendix AA; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/visibility/can-see.ts:95 — if (eff.workspaceRole === null) {
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Decide it once and record it: either the guest role is the answer (then `visibility.set` refuses a non-member id — *"invite them as a guest first"* — and the export's sheet copy is a known divergence), or the product grows the tier (a `canSee` arm for a null role with an explicit naming, plus a bootstrap/stream path for a person with no workspace). The measured state is neither.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix AA, run from `apps/server`. Lines opened: `can-see.ts:94-117`; `visibility-editor.tsx:95`, `:398-403`; export `:1229`, `:3771`; `github.md:12`, `:15`.
JUDGE'S NOTE: PARTIAL per verifier chunk31 (line opened by the verifier, not the judge): Core VALID: export :1229/:3771 and github.md:15 verbatim; :95-97 refuses a null role first; picker is roster-only (visibility-editor.tsx:95). FALSE absolute: "No ruling found -> nothing" — Features.md
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E6-22: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-22 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-23  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 186

```
TASK T-E6-23 — batch B16 (Outbox ordering, projection verifier, domain schema drift) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 186/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1510, 34 lines — read the whole section first):
  E6-23 — MINOR — `BACKUP_TIME_UTC=25:00` or `99:99` is accepted and silently scheduled somewhere else (`99:99` → four days out), while `9:00` throws; the daemon reads the value raw
WHAT IS WRONG (the reviewer's words):
  `ops/schedule.ts:13-30` `msUntilNextUtc` validates the time with `/^(\d{2}):(\d{2})$/` (`:14`) and then hands the two numbers to `setUTCHours`, which rolls over instead of refusing. Measured against `dist/ops/schedule.js` from `2026-09-21T07:30Z`:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/ops/schedule.ts:14 — const match = timeHHMM.match(/^(\d{2}):(\d{2})$/);
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Two comparisons after the match — hours `< 24`, minutes `< 60` — in the same `throw` the shape check already uses; and a `BACKUP_TIME_UTC` key in `config.ts`'s schema so the daemon fails at boot with the sentence rather than at 04:39 four days on.
HOW IT WAS MEASURED (reproduce this before and after):
  The script above (six values through `msUntilNextUtc` from a fixed `from`; the fuzz over 20,000 valid `HH:MM`/`dow` pairs asserting `0 < ms ≤ 24 h (7 d)` and the landed UTC hour/minute/day). Lines opened: `schedule.ts:13-30`; `backup-daemon-main.ts:180`, `:187`; `deploy/do/app.yaml:297`; `.env.example:305`.
JUDGE'S NOTE: VALID per verifier chunk31 (line opened by the verifier, not the judge): All six reproduce EXACTLY as filed; 9:00 is a built-in negative control. Dist proven current by a code-only needle (1 hit) and mtime 2026-09-21T15:08 > src 2026-09-09T18:21. :29-31 hands Number(hours)
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E6-23: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-23 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-5  ·  opus  ·  IMPORTANT  ·  ~1.75 h  ·  rank 204

```
TASK T-E6-5 — batch B16 (Outbox ordering, projection verifier, domain schema drift) — model opus — backend claude-opus — effort ~1.75 h — judged IMPORTANT — rank 204/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/sync-client
FINDING (exec6, docs/lanes/review-functionality-exec6.md:627, 72 lines — read the whole section first):
  E6-5 — IMPORTANT — After a transient sync failure, a later claim overtakes the backing-off claim it depends on; the sync door turns it into a false, unresolved contest on the user's own ticket, and the edit is dropped
WHAT IS WRONG (the reviewer's words):
  `packages/sync-client/src/outbox/outbox.ts:333` selects the next batch as `WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY position LIMIT ?`. `recordFailure` (transient — a transport throw, a short answer, a misaligned answer; `sync-engine.ts:870`, `:897`, `:907`) pushes `next_attempt_at` of the **failed batch** out by `backoffMs(attempts)` (2 s on the first failure). A claim enqueued *after* the failure carries the schema's epoch default and is due immediately. So the next flush — and the product flushes on every enqueue, `replica-data-source.ts:1405` `void engine.flush()` — offers the newer claim **alone**, ahead of the older claims it depends on. Measured on the outbox with its own fixtures (Appendix D; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/sync-client/src/outbox/outbox.ts:333 SELECT * FROM outbox WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY position — a backing-off row is skipped while later rows are sent; :420-423 recordFailure bumps only the failed row
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Head-of-line blocking is what "a queue preserves order" means for a dependent stream: `nextBatch` should return nothing while the earliest queued row is not yet due — `ORDER BY position` first, then compare the head's `next_attempt_at` (or `MIN(next_attempt_at)` over queued rows) against `now`. Independently, the sync door should not contest a claim whose target ticket **does not exist** — `contest()` files a contest on a ticket id the ledger has never seen, which is the *"existence claim with no evidence"* shape the brief names. Nothing on the contest's own path asks: `contest-coherence.ts:139-158` (`checkContestCoherence`) binds the embedded claim's workspace, kind and id to the envelope and nothing else; `rule-engine/src/contests.ts:39-49` (`evaluateClaimContested`) checks only `origin === 'server'`; the entity↔workspace guard passes a head that does not exist. A plain `refused` there (or a `contest()` that first asks `getTicketStateFromDb`) would let the outbox keep the row `failed` and visible instead of minting a false contest. And 12.144 should enqueue after a `recordFailure` …
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix D (outbox, `packages/sync-client`, relative imports), Appendix G (server doors, `apps/server`, shared test Postgres) and Appendix S (overlay, `packages/sync-client`). Lines opened: `outbox.ts:333`, `:412`; `sync-engine.ts:845`, `:870`, `:897`, `:907`; `replica-data-source.ts:1404-1405`; `local-context.ts:126`; `check-permission.ts:1048`; `sync-service.ts:416-417`; `outbox.test.ts:119`, `:167`, `:201`, `:226`; `12-offline-sync-apps.md:905-907`.
JUDGE'S NOTE: VALID, judge opened (mutation; verified by reading). A later claim overtakes the backing-off claim it depends on and the sync door turns it into a false contest, IMPORTANT.
DONE WHEN: A rule-engine/server test reproduces the defect through the real door (ingest or route), RED before and GREEN after; the package suite is green; the invariant is stated in one sentence in the check's docblock; `test-cases/` gains or flips the case in the same commit.
COMMIT: `E6-5: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-5 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-17  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 229

```
TASK T-E6-17 — batch B16 (Outbox ordering, projection verifier, domain schema drift) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 229/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/domain
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1241, 37 lines — read the whole section first):
  E6-17 — MINOR — `ticket.assigned` and `ticket.collaborator_added` accept any non-empty string as a person — a non-member, a fresh ULID, the word `nobody-here` — and the board renders it
WHAT IS WRONG (the reviewer's words):
  Through `POST /v1/events` as the owner (Appendix O; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/domain/src/events/ticket-events.ts:59 — export const ticketAssignedPayload = z.object({ assigneeId: z.string().min(1).nullable() });
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One refusal in `checkVisibilityPermission` for the two types: resolve the named user's role in `env.workspaceId` and refuse `null` (*"That person is not in this workspace"*) — the same lookup `checkMembershipOwnerAuthority` already does for its target (`:1234`). `project.member_added` shares the gap (it checks the actor's project-admin rights only, `:683-687`), but its projection row is neutralised by `resolveEffectiveRole`'s early return; the assignment's is not.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix O, run from `apps/server`. Lines opened: `ticket-events.ts:59`, `:61`; `check-permission.ts:683-687`, `:1048`, `:1234`; `mappers.ts:537-546`; `write-tools.ts:168-186`.
JUDGE'S NOTE: VALID per verifier chunk31 (line opened by the verifier, not the judge): Opened :59 and :61 (both bare min(1)), mappers.ts:546 "name: roster.get(id) ?? id", check-permission.ts:1048 canSee(ACTOR) only, :1234 resolveEffectiveRole for a membership TARGET, write-tools.ts:173.
DONE WHEN: A test in the owning package reproduces the defect, RED before and GREEN after (named with the ruling id); the package suite is green; `Features.md` and `test-cases/` updated in the same commit when the behaviour is user-observable.
COMMIT: `E6-17: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-17 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-19  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 230

```
TASK T-E6-19 — batch B16 (Outbox ordering, projection verifier, domain schema drift) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 230/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/domain
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1353, 32 lines — read the whole section first):
  E6-19 — MINOR — A due date only has to look like `YYYY-MM-DD`: `2026-02-30`, `2026-13-45` and `0000-00-00` commit, and the attention strip then says "Needed by 0000-00-00 — due within 7 days"
WHAT IS WRONG (the reviewer's words):
  `packages/domain/src/ist-day.ts:27` `IST_DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/` is the whole of what a due or start date must satisfy (`domain/src/ticket-types.ts:179-181` `dueDateValueSchema`; `rule-engine/src/checks/fields.ts:39-42` for a custom `date` field, `:135-138` for `dueDate`/`startDate`). Measured through the door (Appendix W; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/domain/src/ist-day.ts:27 — export const IST_DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One refinement on `IST_DAY_REGEX`'s users — parse the three fields, rebuild the string, compare (the same trick `isRealCalendarDatetime` uses) — so `2026-02-30` is refused with the sentence the door already has. Two lines in `ist-day.ts`, shared by the two checks and the two filter bounds.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix W, run from `apps/server`. Lines opened: `ist-day.ts:27`, `:37-47`; `domain/src/ticket-types.ts:179-181`; `rule-engine/src/checks/fields.ts:39-42`, `:135-138`; `attention.ts:255-266`; `notifications/sweep.ts:188`; `domain/src/envelope.ts:64`.
JUDGE'S NOTE: VALID per verifier chunk31 (line opened by the verifier, not the judge): ticket-types.ts:180 is the whole due-date check; fields.ts:40 and :138 the two engine arms; attention.ts:261 "if (due.date > horizon) continue;" is a STRING compare and sweep.ts:188 the same in SQL; e
DONE WHEN: A test in the owning package reproduces the defect, RED before and GREEN after (named with the ruling id); the package suite is green; `Features.md` and `test-cases/` updated in the same commit when the behaviour is user-observable.
COMMIT: `E6-19: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-19 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-20  ·  sonnet  ·  MINOR  ·  ~0.6 h  ·  rank 231

```
TASK T-E6-20 — batch B16 (Outbox ordering, projection verifier, domain schema drift) — model sonnet — backend deepseek — effort ~0.6 h — judged MINOR — rank 231/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec6   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/domain
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1386, 32 lines — read the whole section first):
  E6-20 — MINOR — Ruling P15 ("a name of only spaces names nothing") closed titles, workspace, project and invite names — and left workflow, state, ticket-type, field and option names at `min(1)`, so a single space is a valid board column
WHAT IS WRONG (the reviewer's words):
  Through the door, with the P15 controls firing in the same run (Appendix X; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/domain/src/workflow.ts:8 — name: z.string().min(1),
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Export P15's refinement once (`displayName` already exists in `membership.ts`) and use it for the five name fields, so the refusal reads the same sentence everywhere.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix X, run from `apps/server`. Lines opened: `ticket-events.ts:18-24`; `domain/src/events/membership.ts:39-42`; `workflow.ts:8`, `:86`; `domain/src/ticket-types.ts:78-79`, `:96`; `validate-workflow.ts` (no `name` check — read whole).
JUDGE'S NOTE: VALID per verifier chunk31 (line opened by the verifier, not the judge): Control could fail and found 4 positives. 5 of 5 cited name fields opened: workflow.ts:8 and :86, ticket-types.ts:78, :79, :96 — all bare min(1). workflowDefinedPayloadSchema(:110) adds only stateMapp
DONE WHEN: A test in the owning package reproduces the defect, RED before and GREEN after (named with the ruling id); the package suite is green; `Features.md` and `test-cases/` updated in the same commit when the behaviour is user-observable.
COMMIT: `E6-20: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-20 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B17 — Instruments that cannot fail or never run  ·  lane ANY  ·  session model **sonnet**  ·  backend **deepseek**  ·  12 tasks  ·  ~4.8 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec4` · branch `rel/b17-instruments-that-cannot-fail-or-` · packages touched: @gisik-nokma/server, @gisik-nokma/web.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E6-7` | haiku | M | 0.25 | `scripts/check-migration-order.mjs:8`, `docs/superpowers/plans/2026-08-20-01-foundation-ledger.md:1902` |
| 2 | `T-F8-fn` | haiku | M | 0.25 | `scripts/check-db-timezone.mjs` |
| 3 | `T-P15` | haiku | M | 0.25 | `design-system/interactive/desktop.dc.html` |
| 4 | `T-P5` | haiku | M | 0.25 |  |
| 5 | `T-E4-12` | sonnet | I | 1 | `apps/web/e2e-stack/viewport.spec.ts:170`, `apps/web/e2e-stack/tap-target-baseline.json`, `apps/web/e2e-viewport/responsive.spec.ts:456` |
| 6 | `T-F2-ux` | sonnet | I | 1 | `test-cases/15-in-app-help.md:39-42`, `scripts/help-content.mjs` |
| 7 | `T-I1` | OWNER | I | 1 | `apps/web/test/tap-target-density.test.ts` |
| 8 | `T-P11` | sonnet | I | 1 |  |
| 9 | `T-P16` | sonnet | I | 1 | `apps/web/test/neo-card-radius.test.ts:53-57`, `apps/web/test/neo-card-radius.test.ts` |
| 10 | `T-P34` | sonnet | I | 1 | `apps/web/e2e-stack/viewport.spec.ts:469-471`, `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2059-2066` |
| 11 | `T-E6-26` | OWNER-DECISION | M | 0.5 | `apps/server/src/projections/rollups.ts:133` |
| 12 | `T-E6-6` | sonnet | M | 0.5 | `scripts/check-no-silent-skips.mjs:28` |

#### T-E6-7  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 33

```
TASK T-E6-7 — batch B17 (Instruments that cannot fail or never run) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 33/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec6, docs/lanes/review-functionality-exec6.md:737, 63 lines — read the whole section first):
  E6-7 — MINOR — Migration prefixes are hand-rounded and future-dated with no recorded convention, so the plans' own `node-pg-migrate create` produces a prefix below an already-applied migration for ~a day after each merge
WHAT IS WRONG (the reviewer's words):
  The last 13 migrations carry prefixes rounded to `…00000000` and spaced `1e11` ms (≈27.8 h) apart — `1788600000000` … `1790000000000` — and each was **committed before the instant its prefix names**: e.g. `1790000000000_proj-ticket-comments.sql` (prefix = `2026-09-21T14:13:20Z`) was committed `2026-09-20T22:20:51+05:30` = `16:50Z`, 21 h early; `1789800000000_proj-tickets-deleted.sql` (prefix `09-19T06:40Z`) was committed `09-20T13:17 IST`, so its prefix was already in the past — the spacing is a counter, not a clock. The only recorded way to create a migration is the plans' `pnpm --filter @gisik-nokma/server exec node-pg-migrate create <name>` (`docs/superpowers/plans/2026-08-20-01-foundation-ledger.md:1902`, `:3116`; `…-07-editor-attachments.md:1918`), which stamps the wall clock. Measured at review time:
THE JUDGE'S LINE (the ruling rests on this; open it):
  scripts/check-migration-order.mjs:8 — * could never run on any database that had the higher one - and NOTHING failed.
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either use the clock (the tool's default) and let `check:migrations` do its job, or record the convention in one place the plans point at (*"prefix = previous + 1e11; never below `Date.now()`"*) — and make the checker say which of the two the file violated. Cheapest of all: refuse a prefix in the future in `check-migration-order.mjs`, which turns the convention into a rule.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — primary, permanent.** For each rounded-prefix file, prefix instant vs first commit instant (`node -e 'console.log(new Date(<prefix>).toISOString())'` and `git log --diff-filter=A --format=%cI -- <file>`):
JUDGE'S NOTE: PARTIAL per verifier chunk29 (line opened by the verifier, not the judge): Core reproduces: 3 of the 13 rows re-measured, all match (1790000000000 committed 21h before its own instant). PARTIAL for one stated output: the convention grep prints ~50 matches ('around', 'backgro
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E6-7: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-7 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F8-fn  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 34

```
TASK T-F8-fn — batch B17 (Instruments that cannot fail or never run) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 34/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec3, docs/lanes/review-functionality-exec3.md:445, 57 lines — read the whole section first):
  F8 — LOW / observation — `check:db-tz` is the only one of the nine checkers with no automated invocation
WHAT IS WRONG (the reviewer's words):
  `scripts/check-db-timezone.mjs` is wired to `package.json` as `check:db-tz` and appears **nowhere in `.github/workflows/ci.yml`**. The other eight are all invoked by CI: `check-env-example` (`ci.yml:167`), `check-skipif-coverage` (`:168`), `check-case-ids` (`:169`), `check-runbook-commands` (`:203`), `check-case-citations` (`:231`), `check-help` (`:255`), `check-task-ledger` (`:267`), `check-migration-order` (`:316`), `check-no-silent-skips` (`:449`).
THE JUDGE'S LINE (the ruling rests on this; open it):
  package.json:14 (and .github/workflows/ci.yml, swept) — check:db-tz: "node scripts/check-db-timezone.mjs",
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Add `check:db-tz` to `.github/workflows/ci.yml` next to the other eight checkers (the block around `ci.yml:167-267`), in the same job and step shape. Also add it to the local seven-check list in the runbook if that list enumerates checkers by name.
HOW IT WAS MEASURED (reproduce this before and after):
  Each script read at the cited lines; all nine run at `e4baa425` (§7.4). The CI claims come from `grep -n "node scripts/\|run: pnpm check" .github/workflows/ci.yml`.
JUDGE'S NOTE: PARTIAL per verifier chunk14 (line opened by the verifier, not the judge): Core holds: 9 scripts/check-*.mjs exist, check-db-timezone is the only one absent from CI, and every self-test / empty-universe cite resolves. PARTIAL for the stated count: 'the other EIGHT' is follow
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `F8: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F8-fn | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P15  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 36

```
TASK T-P15 — batch B17 (Instruments that cannot fail or never run) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 36/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec1, docs/lanes/review-ui-exec1.md:436, 25 lines — read the whole section first):
  P15 — **MINOR** ⚠ **r2 NEW, CORRECTED DOWNWARD IN THE SAME ROUND** — the repo's generated prototype copy is one line offset from the owner's export, and 71 files cite it by line
WHAT IS WRONG (the reviewer's words):
  The two files are not identical, and the difference is a **constant one-line offset**: - repo copy `design-system/interactive/desktop.dc.html` — **4050 lines**, sha256 `2cda054b4320ebb6…` - the export `Gisik Nokma - Desktop.dc.html` — **4049 lines**, sha256 `3d142d464a070b33…` - `diff` between them: **1,113 lines**, net **−1** — the changes are overwhelmingly the in-line `sc-camel-*` rewrites, which is why the line count barely moves. - **The offset is exactly −1 at every anchor sampled**, spanning 119 to 1843: `isSignIn` 120/119, `isWorkspaces` 180/179, `isMembers` 651/650, `sheetCrumbs` 1102/1101, `isLegal` 1720/1719, `isNotFound` 1844/1843, `openParent` 1240/1239, `isSettingsShell` 800/799. - **71 source/test files** cite the repo's copy by line (`grep -rln "desktop\.dc\.html"` over `packages apps`, `.ts`/`.tsx`/`.css`); 103 including `docs/` and `test-cases/`. - **The VALUES …
THE JUDGE'S LINE (the ruling rests on this; open it):
  design-system/interactive/support.js:365 — var CAMEL_ATTR_RE = /(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/g;
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The repo copy `design-system/interactive/desktop.dc.html` is one line offset from the owner's export `gisik-nokma-lanes/prototype-2026-09-20/Gisik Nokma - Desktop.dc.html` (4050 vs 4049 lines). Either regenerate the repo copy from the export so the line numbers 71 files cite are exact, or add one sentence at the top of the repo copy's provenance note stating the +1 offset and the export's sha256 `3d142d464a070b33…`. Do not touch the 71 citing files.
JUDGE'S NOTE: VALID per verifier chunk03 (line opened by the verifier, not the judge): Withdrawal is right: support.js :297/:365-370 encode and :422-423 decode sc-camel-*, so the copy is not broken. Offset +1 at 8/8 anchors; 5/5 value counts equal. Drift: the disclosed mention-grep give
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `P15: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P15 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P5  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 40

```
TASK T-P5 — batch B17 (Instruments that cannot fail or never run) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 40/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec1, docs/lanes/review-ui-exec1.md:349, 17 lines — read the whole section first):
  P5 — **MINOR (product) / IMPORTANT (record)** — An owner-requested control was neither built nor reported
WHAT IS WRONG (the reviewer's words):
  The subtask form ships title-only. The owner asked for a type selector; the controller's own override says he still has not had one; and **no lane artefact records that it was dropped.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  override-2026-09-21-exec1-item6.md:9 the dispatch asked for a selector; ticket-sheet.tsx:2287-2308 the subtask form is one input + one Button (grep select in that range → 0)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One line in `EXEC-*` or the handoff: *"the selector is not built — the deepest-legal-type default satisfies the owner's first clause; this is the stop-and-report the override asked for if it is not small."* That converts an unrecorded drop into a ruling the controller can make.
HOW IT WAS MEASURED (reproduce this before and after):
  - Owner, quoted in `CTL-DISPATCH-2026-09-20-breadcrumb-hierarchy.md:5`: *"subtask is always at the bottom. **or at least have a type selector** so that i can create that particular type."* - Controller override `gisik-nokma-lanes/override-2026-09-21-exec1-item6.md` §1: *"**The owner asked for a selector and has not had one yet.** Do it **only if it is genuinely small**; if it opens a design question — which one is the default, what happens to the derived-type guarantee — **stop and report it …
JUDGE'S NOTE: VALID at MINOR, judge opened. A requested control neither built nor reported is a record/process finding; the product-severity scale (rules §3) puts it at MINOR — the lane itself filed it MINOR (product).
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `P5: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P5 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E4-12  ·  sonnet  ·  IMPORTANT  ·  ~1 h  ·  rank 84

```
TASK T-E4-12 — batch B17 (Instruments that cannot fail or never run) — model sonnet — backend deepseek — effort ~1 h — judged IMPORTANT — rank 84/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec4, docs/lanes/review-ui-exec4.md:244, 12 lines — read the whole section first):
  E4-12 — **IMPORTANT** — When the signed-in instrument runs, its tap-target population is ONE route at ONE width, and its text-contrast population is ZERO routes
WHAT IS WRONG (the reviewer's words):
  Round 1's I1 established that no browser instrument has executed since 2026-09-06. This is the finding underneath it: even executed, the signed-in suite cannot see most of what this report measured.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/e2e-stack/viewport.spec.ts:170 the single measureTapTargets call; :223 "`/my-work` is the ONLY route in this file"; grep measureContrast → 0 in e2e-stack vs 2 in e2e-viewport
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Run `measureTapTargets` inside the route loop (one line per route, with baselines recorded the way type-scale already does), lift `measureContrast` into a shared module the stack spec imports, and add the sheet-open and builder states.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT (source, opened).** `grep -n "measureTapTargets(" apps/web/e2e-stack/*.spec.ts` → **one** call, `viewport.spec.ts:170`, inside the `/my-work` test; the seven-route loop (`:469-513`) calls `measureTypeScale` (`:533`) and `sweepAccessibleNames` (`:611`) only. `apps/web/e2e-stack/tap-target-baseline.json` holds **one key** (`stack-phone-390|/my-work: 6`). `measureContrast` — TEXT contrast — is a module-private function of the signed-out spec …
JUDGE'S NOTE: VALID, judge opened. The signed-in instrument measures tap targets on one route at one width and text contrast on none = an instrument blind to what it claims, IMPORTANT.
DONE WHEN: The instrument can now FAIL: prove it by breaking the property in a scratch run (never committed), reading the red, then restoring; the commit message names the breakage you ran.
COMMIT: `E4-12: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E4-12 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F2-ux  ·  sonnet  ·  IMPORTANT  ·  ~1 h  ·  rank 85

```
TASK T-F2-ux — batch B17 (Instruments that cannot fail or never run) — model sonnet — backend deepseek — effort ~1 h — judged IMPORTANT — rank 85/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec2, docs/lanes/review-ux-exec2.md:401, 40 lines — read the whole section first):
  F2 — IMPORTANT · The only gate over the help corpus cannot fail on the property that matters
WHAT IS WRONG (the reviewer's words):
  `pnpm check:help` runs `node scripts/help-content.mjs --check`. Run here: **EXIT 0**, printing `help-content: ok (2 documents, 29 sections, 231 entries, generated copy matches source)`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  test-cases/15-in-app-help.md:39-42 the gate's own stated purpose; help-content.mjs:51/308/494 compares manual.md+faq.md to content.generated.ts and never opens apps/ (verifier control: "packages/" hits at :19,:51)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The corpus cannot be verified against the product mechanically in general, but the parts that can be are the parts that keep breaking: **strings quoted from the product** (`manual.md` quotes "No workspaces yet. Ask an admin for an invite link — or create your own." and "No workspaces yet…" — cacheable), **route mentions** (`/settings` appears in prose as an address), and **named controls** (`Sign out`, `Settings`, `Comment`). A check that every back-ticked control name in the manual appears as a literal in `apps/`+`packages/` would have caught rows (a), (b), (c) and (g) on the day each broke. The repo already has this pattern elsewhere (`check-runbook-commands.mjs` verifies every command the runbook names).
JUDGE'S NOTE: VALID, judge opened. The only gate over the help corpus cannot fail on whether the help is TRUE of the product = an instrument that cannot fail, IMPORTANT.
DONE WHEN: The instrument can now FAIL: prove it by breaking the property in a scratch run (never committed), reading the red, then restoring; the commit message names the breakage you ran.
COMMIT: `F2: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F2-ux | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-I1  ·  OWNER  ·  IMPORTANT  ·  ~1 h  ·  rank 86

```
TASK T-I1 — batch B17 (Instruments that cannot fail or never run) — model OWNER — backend owner — effort ~1 h — judged IMPORTANT — rank 86/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:102, 20 lines — read the whole section first):
  I1 — **CRITICAL** — No browser-based UI instrument has executed anywhere since 2026-09-06, and the local gate structurally cannot run one
WHAT IS WRONG (the reviewer's words):
  `e2e` (the signed-in stack suite) and `viewport` (the signed-out suite) are the *only* instruments that measure tap targets, label-text floors, accessible names, non-text contrast and sideways overflow. Neither has run in ~15 days.
THE JUDGE'S LINE (the ruling rests on this; open it):
  gh run list --limit 3 (15:56 IST): 35584638978/35584603076/35583130466 all failure; jobs of 35584638978: every job steps=0 runner="" (check-help, check-migrations, scope, check-citations, check-runbook failure; the rest skipped); last success run 34023679658 at 2026-09-06T09:05:54Z
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Two separable remedies, in order of value: (a) a **non-browser proxy on the gate** — the parts of these suites that are pure source analysis (the `DENSE_IN_LIST` liveness check already exists at `apps/web/test/tap-target-density.test.ts`; a selector-level "no interactive element whose classes have no rule" check is the same shape and needs no browser) so the *class* of defect in §4 stays guarded while CI is dark; and (b) treat a red `gate` as blocking rather than nominal, since the standing auto-merge authorization reads *"an independent CI run green"* and no run has been green since 2026-09-06T09:05:54Z.
HOW IT WAS MEASURED (reproduce this before and after):
  - `gh api repos/bkirosangma/gisik-nokma/actions/runs` across 12 pages (1,200 runs): the **last successful run is `34023679658` at `2026-09-06T09:05:54Z`**. Every run from `2026-09-06T11:52:24Z` to `2026-09-20T18:33:45Z` is `failure`. Pages 1–9 (900 runs) contain **zero** successes. - It is not a failing step — **the runner never starts.** `gh api …/runs/35529457412/jobs` → **every one of the 14 jobs has `"steps": []`, `"runner_name": ""`**, and `scope` shows `started_at …18:33:46Z → …
JUDGE'S NOTE: VALID, judge reproduced live. The runner never starts, so no browser-based instrument (e2e/viewport) has executed in 15 days and the local gate cannot run one. IMPORTANT not CRITICAL: an instrument/governance failure, not a product defect a person meets; its consequence for the auto-merge clause is recorded in controller-state cycle 35 §6. Base (round-1) finding of this lane, re-validated.
DONE WHEN: The instrument can now FAIL: prove it by breaking the property in a scratch run (never committed), reading the red, then restoring; the commit message names the breakage you ran.
⚠ THIS TASK NEEDS THE OWNER: do not implement; append `needs-owner` to the progress file with one line saying what must be decided or done, and continue.
COMMIT: `I1: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-I1 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P11  ·  sonnet  ·  IMPORTANT  ·  ~1 h  ·  rank 87

```
TASK T-P11 — batch B17 (Instruments that cannot fail or never run) — model sonnet — backend deepseek — effort ~1 h — judged IMPORTANT — rank 87/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec1, docs/lanes/review-ui-exec1.md:287, 17 lines — read the whole section first):
  P11 — **IMPORTANT** — The `Select` panel is outside the population of every rendered-property sweep, for two independent reasons
WHAT IS WRONG (the reviewer's words):
  `Select` is the product's most-migrated shared control (the members Channel/Role fields, the style and theme toggles, the ticket-type editors). Its option rows have never been measured for tap-target size, label-text floor, accessible-name contribution or non-text contrast — and could not have been.
THE JUDGE'S LINE (the ruling rests on this; open it):
  select.tsx:530 <ul {...resolvedListBoxProps} … className="gn-select__list"> under createPortal (:199) to document.body; tap-targets.ts:268-280 selector list has no [role="option"]/[role="listbox"] arm
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Add `[role="option"]` (and `[role="listbox"]`) to the tap-target selector, and have the stack spec open one Select before at least one sweep so the panel enters the population. Opening the style toggle on `/account` is one click and it is already on a swept route. Until then, say in the sweep's own output which surfaces it cannot reach — a stated blind spot is worth more than a silent zero.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — reason 1, the panel is never on screen when a sweep runs.** The listbox is portaled to `document.body` and renders only while open (`select.tsx:530`, `<ul {...resolvedListBoxProps}>` inside a `createPortal`). The stack spec's own comment records it: *"the listbox and its options render only while open, portaled to `document.body`, so a closed-page sweep sees none of them"* (`e2e-stack/viewport.spec.ts:696`). **No spec opens a Select before sweeping** — `grep` for a click on the …
JUDGE'S NOTE: VALID, judge opened. The Select panel is outside every rendered-property sweep for two independent reasons = an instrument blind spot, IMPORTANT.
DONE WHEN: The instrument can now FAIL: prove it by breaking the property in a scratch run (never committed), reading the red, then restoring; the commit message names the breakage you ran.
COMMIT: `P11: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P11 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P16  ·  sonnet  ·  IMPORTANT  ·  ~1 h  ·  rank 88

```
TASK T-P16 — batch B17 (Instruments that cannot fail or never run) — model sonnet — backend deepseek — effort ~1 h — judged IMPORTANT — rank 88/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:462, 40 lines — read the whole section first):
  P16 — **IMPORTANT** ⚠ **r2 NEW** — One styling case asserts the ABSENCE of a declaration through a scanner that truncates multi-line rules, so it cannot fail when the thing it guards returns
WHAT IS WRONG (the reviewer's words):
  `apps/web/test/neo-card-radius.test.ts` guards that no page-specific literal radius competes with `.gn-card`'s token. Its third case asserts `expect(rule?.includes('border-radius')).toBe(false)`. The `rule` it tests comes from a **single-line** scanner, so a declaration written on its own line is invisible to the assertion and the case stays **green with the literal radius present**.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/test/neo-card-radius.test.ts:53-57 expect(rule?.includes('border-radius')).toBe(false) over a `ruleFor` scanner that truncates multi-line rules (verifier: positive control with the single-line form returns true; latent today because globals.css:2081 .gn-sign-in is single-line)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Use the multi-line scanner the five siblings share — or, better, put it in `test/helpers/` so there is one scanner rather than nine. `members-styling.test.ts:56-58` already records that no shared CSS-scan helper exists and that the shape is duplicated *"rather than imported"*, which is the condition that produced this asymmetry.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — the scanner reproduced exactly, then run on a rule that sets the very thing the case forbids:**
JUDGE'S NOTE: VALID, judge opened. A case that asserts ABSENCE through a truncating scanner cannot fail when the declaration returns on a later line = an instrument that cannot fail, IMPORTANT.
DONE WHEN: The instrument can now FAIL: prove it by breaking the property in a scratch run (never committed), reading the red, then restoring; the commit message names the breakage you ran.
COMMIT: `P16: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P16 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P34  ·  sonnet  ·  IMPORTANT  ·  ~1 h  ·  rank 89

```
TASK T-P34 — batch B17 (Instruments that cannot fail or never run) — model sonnet — backend deepseek — effort ~1 h — judged IMPORTANT — rank 89/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:941, 27 lines — read the whole section first):
  P34 — **IMPORTANT** ⚠ **r2 NEW** — FOUR of the project page's five views are outside the tap-target ratchet's population, because the ratchet visits routes and the views are tabs
WHAT IS WRONG (the reviewer's words):
  `e2e-stack/viewport.spec.ts` is the only instrument in the product that measures tap targets on signed-in surfaces. Its population is a list of **routes**. The project page renders **five views** — Backlog, Board, List, Calendar, Timeline — as `role="tab"` buttons that switch **component state**, leaving the route unchanged. The suite visits `/p/:projectId` **once, and never clicks a view tab**, so the single visit renders the default view and the other four are **never measured by anything**.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/e2e-stack/viewport.spec.ts:469-471 routes: { path, key, reach?: () => Promise<void> }[] — the population is a route list; :659-661 the only mention of the view tabs is inside a // comment; page.tsx:2072-2076 role="tab" … onClick={() => setView(tab)} — views are tabs, not routes; tap-target-baseline.json holds one key
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Give the route entries a `reach` hook that clicks the view tabs — **the mechanism already exists and is already the house shape**: `:469`'s route objects are typed `{ path: string; key: string; reach?: () => Promise<void> }`, so this is one property per view rather than a new instrument. The alternative — making the four views routes — is larger and would change the product to suit its test.
HOW IT WAS MEASURED (reproduce this before and after):
  1. **The view list is five**, `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2059-2066`: `['backlog','Backlog'], ['board','Board'], ['list','List'], ['calendar','Calendar'], ['timeline','Timeline']`. 2. **They are tabs, not routes.** `role="tab"` (`:2073`), `aria-selected={selected}` (`:2074`), `onClick={() => setView(tab)}` (`:2076`) — the route does not change when the view does. 3. **The default is `'board'`**, stated twice: `:193` *"The default stays `'board'`"* and `:204` …
JUDGE'S NOTE: VALID, judge opened (verifier chunk05 concurred: no route entry sets `reach`). The tap-target ratchet never renders four of the five project views. IMPORTANT = an instrument that cannot see what it claims to measure.
DONE WHEN: The instrument can now FAIL: prove it by breaking the property in a scratch run (never committed), reading the red, then restoring; the commit message names the breakage you ran.
COMMIT: `P34: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P34 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-26  ·  OWNER-DECISION  ·  MINOR  ·  ~0.5 h  ·  rank 131

```
TASK T-E6-26 — batch B17 (Instruments that cannot fail or never run) — model OWNER-DECISION — backend owner — effort ~0.5 h — judged MINOR — rank 131/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec6, docs/lanes/review-refutations-exec6.md:249, 61 lines — read the whole section first):
  E6-26 — MINOR — `proj_rollups` is recomputed inside every ticket, workflow and reparent transaction, replayed by the release-gate verifier, and read by nothing in the product — a state `Features.md` records as interim ("Nothing reads it yet") for a reason that has since expired
WHAT IS WRONG (the reviewer's words):
  Measured at `a7b6292b`:
THE JUDGE'S LINE (the ruling rests on this; open it):
  grep proj_rollups outside projections/rollups.ts, non-test → comments only (visibility/rollup.ts:52,:79,:81,:156; projections/proj-projects.ts:28; registry.ts:25; index.ts:25,:43-45,:81), 0 SQL readers — control: FROM proj_tickets → 15 files; grep 'getRollup(' non-test non-dist → apps/server/src/projections/rollups.ts:133 (the definition) only; Features.md:408 '…Nothing reads it yet…'; visibility/rollup.ts:79-96 'it is NOT read from proj_rollups'
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either read it — `rollupFor` could take its category counts from it once the enumeration mismatch (6.83) is resolved — or drop the projection and its verifier row, and say in `Features.md:408` which. A projection kept "in case" is the rule the repo states for controls and components (E2-25 quotes it).
HOW IT WAS MEASURED (reproduce this before and after):
  The four greps above with their controls; lines opened: `projections/rollups.ts:362-367`, `:372-420`; `visibility/rollup.ts:79-96`; `read/ticket-cards.ts:159`; `routes/tickets.ts:445-456`; `projections/index.ts:25`; `tools/verify-projections.ts:5-8`; `Features.md:408` (the "Nothing reads it yet" sentence, found by `grep -o "Nothing reads it yet.*"` after the first draft claimed the absence was unrecorded — corrected above).
JUDGE'S NOTE: VALID, judge opened. A projection recomputed in every ticket transaction and replayed by the verifier, read by nothing, recorded as interim on 2026-09-01 for a reason that has expired. MINOR as claimed. Phase-2 filing (absent from the branch at 737294ae): half of Minor.
DONE WHEN: The instrument can now FAIL: prove it by breaking the property in a scratch run (never committed), reading the red, then restoring; the commit message names the breakage you ran.
⚠ THIS TASK NEEDS THE OWNER: do not implement; append `needs-owner` to the progress file with one line saying what must be decided or done, and continue.
COMMIT: `E6-26: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-26 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-6  ·  sonnet  ·  MINOR  ·  ~0.5 h  ·  rank 132

```
TASK T-E6-6 — batch B17 (Instruments that cannot fail or never run) — model sonnet — backend deepseek — effort ~0.5 h — judged MINOR — rank 132/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec6, docs/lanes/review-functionality-exec6.md:700, 36 lines — read the whole section first):
  E6-6 — MINOR — `check-no-silent-skips.mjs` prints `ok` on an empty report: an instrument with no positive control on its own universe
WHAT IS WRONG (the reviewer's words):
  `scripts/check-no-silent-skips.mjs:28` iterates `report.testResults ?? []` and `:77` prints `ok (N skipIf-guarded file(s) checked, none fully skipped)` whatever `N` is. Measured:
THE JUDGE'S LINE (the ruling rests on this; open it):
  scripts/check-no-silent-skips.mjs:28 — for (const fileResult of report.testResults ?? []) {
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Two lines: count the tracked `.skipIf(` files under the covered prefix (the sibling already does this walk) and refuse when the report mentions fewer of them than exist — *"expected 2 skipIf-guarded files in this report, saw 0"* — so an empty or mis-shaped report is loud. Also `:49` should recognise `.runIf(` (the same guard, inverted), or the sibling should refuse that spelling outright.
HOW IT WAS MEASURED (reproduce this before and after):
  The two commands above, run at `a7b6292b` with node v22.22.2. Lines opened: `check-no-silent-skips.mjs:28`, `:49`, `:77`; `check-skipif-coverage.mjs:29`; `ci.yml:445-449`.
JUDGE'S NOTE: VALID per verifier chunk29 (line opened by the verifier, not the judge): Reproduced exactly. Positive control: a report naming pg-dump.test.ts with one skipped assertion printed SILENT SKIP, EXIT=1, so it can fail; blind only to an empty universe. check-skipif-coverage.mjs
DONE WHEN: The instrument can now FAIL: prove it by breaking the property in a scratch run (never committed), reading the red, then restoring; the commit message names the breakage you ran.
COMMIT: `E6-6: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-6 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

### B18 — Prose drift sweep — docblocks, catalogue markers, counts  ·  lane ANY  ·  session model **haiku**  ·  backend **deepseek**  ·  37 tasks  ·  ~5.5 h

Worktree `/Users/kiro/my_projects/gisik-nokma-exec4` · branch `rel/b18-prose-drift-sweep-docblocks-cata` · packages touched: @gisik-nokma/app-core, @gisik-nokma/domain, @gisik-nokma/editor, @gisik-nokma/rule-engine, @gisik-nokma/server, @gisik-nokma/sync-client, @gisik-nokma/ui, @gisik-nokma/web.

| order | task | model | sev | h | files |
|---|---|---|---|---|---|
| 1 | `T-E3-10` | haiku | M | 0.25 | `apps/server/src/sync/sync-routes.ts:31-32`, `apps/server/src/sync/sync-routes.ts:31-33` |
| 2 | `T-E3-11` | haiku | M | 0.25 |  |
| 3 | `T-E3-12` | haiku | M | 0.25 | `packages/domain/src/validate-workflow.ts` |
| 4 | `T-E3-13` | haiku | M | 0.25 | `apps/server/src/read/visible-where.ts:51`, `apps/server/src/read/visible-where.ts:48-52` |
| 5 | `T-E3-16` | haiku | M | 0.25 | `apps/server/src/routes/tickets.ts:120`, `apps/server/src/routes/tickets.ts`, `test-cases/17-open-work.md:113` |
| 6 | `T-E3-17` | haiku | M | 0.25 | `packages/sync-client/src/outbox/outbox.ts:38`, `packages/sync-client/src/outbox/outbox.ts` |
| 7 | `T-E3-18` | haiku | M | 0.25 | `packages/app-core/src/replica/replica-data-source.ts:1175`, `apps/server/src/routes/tickets.ts:400-404`, `packages/app-core/src/replica/replica-data-source.ts:1164-1175` |
| 8 | `T-E3-20` | haiku | M | 0.25 | `apps/server/src/visibility/rollup.ts:48`, `test-cases/06-auth-visibility.md:115`, `apps/server/test/routes/tickets-read.test.ts` |
| 9 | `T-E3-21` | haiku | M | 0.25 | `packages/rule-engine/src/checks/hierarchy.ts:124`, `test-cases/06-auth-visibility.md:117` |
| 10 | `T-E3-22` | haiku | M | 0.25 | `packages/rule-engine/src/checks/hierarchy.ts:258`, `test-cases/06-auth-visibility.md:98`, `packages/rule-engine/src/checks/hierarchy.ts:255-258` |
| 11 | `T-E3-23` | haiku | M | 0.25 | `apps/server/src/config.ts:33`, `test-cases/06-auth-visibility.md:202`, `apps/server/src/config.ts:53-55` |
| 12 | `T-E3-24` | haiku | M | 0.25 | `apps/server/src/routes/tickets.ts:178`, `test-cases/06-auth-visibility.md:82`, `apps/server/src/routes/tickets.ts:436` |
| 13 | `T-E3-25` | haiku | M | 0.25 | `test-cases/06-auth-visibility.md:131` |
| 14 | `T-E3-26` | haiku | M | 0.25 | `apps/web/src/app-nav.tsx:299`, `apps/web/app/settings/page.tsx:55-77`, `apps/web/src/app-nav.tsx:62-84` |
| 15 | `T-E3-27` | haiku | M | 0.25 | `packages/app-core/test/workflow-builder/templates.test.ts:66`, `test-cases/13-deployment-dogfooding.md:104` |
| 16 | `T-E3-28` | haiku | M | 0.25 | `packages/app-core/src/replica/replica-data-source.ts:576`, `test-cases/12-offline-sync-apps.md:1410` |
| 17 | `T-E3-29` | haiku | M | 0.25 | `packages/domain/src/vocabulary.ts` |
| 18 | `T-E3-30` | haiku | M | 0.25 | `test-cases/06-auth-visibility.md:116`, `apps/server/test/read/ticket-cards.test.ts:507`, `test-cases/07-api-realtime-search.md:101` |
| 19 | `T-E3-31` | haiku | M | 0.25 | `test-cases/06-auth-visibility.md:97`, `packages/rule-engine/src/checks/hierarchy.ts:125`, `packages/domain/src/events/ticket-events.ts` |
| 20 | `T-E3-33` | haiku | M | 0.25 | `apps/server/src/projections/proj-projects.ts:29-30`, `apps/server/src/projections/index.ts:65-75`, `apps/server/src/projections/proj-projects.ts:26-32` |
| 21 | `T-E3-34` | haiku | M | 0.25 | `apps/server/src/projections/tickets.ts:483-484`, `apps/server/src/visibility/can-see.ts:140-142`, `apps/server/src/permissions/check-permission.ts:1048-1050` |
| 22 | `T-E3-9` | haiku | M | 0.25 | `packages/domain/src/ledger-event.ts:17`, `packages/domain/src/ledger-event.ts:16-18` |
| 23 | `T-E6-12` | haiku | M | 0.25 | `test-cases/06-auth-visibility.md:107`, `apps/server/src/app.ts:485` |
| 24 | `T-E6-14` | haiku | M | 0.25 | `packages/app-core/src/views/ticket-sheet.tsx:299-300`, `packages/app-core/src/views/ticket-sheet.tsx:296-306`, `packages/app-core/src/views/ticket-sheet.tsx` |
| 25 | `T-E6-25` | haiku | M | 0.25 | `deploy/do/app.yaml:95-101`, `deploy/do/README.md:115-116`, `deploy/do/README.md:115` |
| 26 | `T-F1-fn` | haiku | M | 0.25 | `apps/server/test/read/soft-delete-background-paths.test.ts:118`, `apps/server/src/routes/attachments.ts`, `apps/server/src/routes/tickets.ts` |
| 27 | `T-F3-fn` | haiku | M | 0.25 | `test-cases/17-open-work.md:58`, `test-cases/17-open-work.md`, `design-system/interactive/desktop.dc.html` |
| 28 | `T-F6-fn` | haiku | M | 0.25 | `apps/server/src/read/visible-where.ts:155` |
| 29 | `T-F7-fn` | haiku | M | 0.25 | `test-cases/17-open-work.md:28`, `test-cases/17-open-work.md` |
| 30 | `T-I3` | haiku | M | 0.25 | `apps/web/e2e-viewport/tap-targets.ts:83`, `apps/web/e2e-viewport/tap-targets.ts:71-76`, `apps/web/e2e-stack/viewport.spec.ts:108` |
| 31 | `T-I4` | haiku | M | 0.25 | `packages/ui/src/ui.css:1607`, `apps/web/e2e-viewport/tap-targets.ts:43-45`, `test-cases/16-remaining-doors.md:19` |
| 32 | `T-I5` | haiku | M | 0.25 | `docs/lanes/executor-state.md:65`, `test-cases/16-remaining-doors.md`, `docs/lanes/executor-state.md` |
| 33 | `T-P25` | haiku | M | 0.25 | `apps/web/e2e-viewport/viewports.ts:167`, `apps/web/src/back-button.tsx`, `apps/web/e2e-viewport/viewports.ts` |
| 34 | `T-P26` | haiku | M | 0.25 | `docs/design/prototype-delta-2026-09-18.md:101`, `docs/design/prototype-delta-2026-09-18.md` |
| 35 | `T-P29` | haiku | M | 0.25 | `apps/web/e2e/smoke.spec.ts:15`, `apps/web/e2e/smoke.spec.ts`, `apps/server/src/auth/routes.ts:76` |
| 36 | `T-P32` | haiku | M | 0.25 | `packages/editor/src/components/TicketEditorSlot.tsx:220`, `packages/editor/src/components/TicketEditorSlot.tsx`, `packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx:365` |
| 37 | `T-P33` | haiku | M | 0.25 | `packages/domain/src/notifications.ts:126-135`, `apps/web/app/inbox/page.tsx`, `apps/server/src/routes/notifications.ts` |

#### T-E3-10  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 160

```
TASK T-E3-10 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 160/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:871, 60 lines — read the whole section first):
  14.2 — `E3-10` (r2) — MINOR — The arithmetic of a stated correctness invariant is stale by two in **both** numbers
WHAT IS WRONG (the reviewer's words):
  `apps/server/src/sync/sync-routes.ts:31-33` states a load-bearing invariant and its arithmetic:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/sync/sync-routes.ts:31-32 — * registry binds SIXTEEN types to that kind (`vocabulary.ts`); * `TICKET_EVENT_TYPES` is thirteen of them
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either re-state the numbers in the same commit as any registration that moves them — which the 2026-09-18 note shows the project already knows how to do — or stop counting: the invariant is *"this list plus `TICKET_EVENT_TYPES` equals the registry's ticket kind set"*, and the counts are decoration. **The durable fix is a check**, and the comment already names what blocks it (*"the membership rule above is held by this comment and by arithmetic done once, NOT by a check"*, with the reason: 12.94's hardcoded literals must be able to shrink independently). I did **not** find a test that asserts the union, so the absence the comment names is real — see §14.4 for the sweep.
HOW IT WAS MEASURED (reproduce this before and after):
  §14.3. The registry set is derived by parsing `vocabulary.ts`'s 34 `domainRegistry.register(` blocks for their `type` and `entityKind`, then taking the distinct types whose kind is `'ticket'` — the registry exposes no enumerator (`registry.ts` has only `register`/`get`/ `hasType`), so the registrations ARE the list. `TICKET_EVENT_TYPES` and `BOOTSTRAP_BACKFILL_TYPES` are read verbatim from their declarations.
JUDGE'S NOTE: VALID per verifier chunk15 (line opened by the verifier, not the judge): Both numbers stale by two. Control on the same parse: the set difference is EXACTLY the three the comment names (visibility.set, claim.contested, claim.contested_resolved), so the parse is not silentl
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-10: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-10 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-11  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 161

```
TASK T-E3-11 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 161/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec3, docs/lanes/review-functionality-exec3.md:1017, 41 lines — read the whole section first):
  14.6.1 — `E3-11` (r2) — MINOR — `Features.md` says the fixture suite holds **84**; it holds **86**
WHAT IS WRONG (the reviewer's words):
  `Features.md:384`, the "Planted-defect fixture suite" bullet in §4 — ⚠ **corrected from `:377` at phase-1 close; see §17 for why, and for what it says about this report's own citations**:
THE JUDGE'S LINE (the ruling rests on this; open it):
  Features.md:384 — - (gear) **Planted-defect fixture suite** - 84 JSON fixtures, one per refusal path plus accepting twins
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Say what the suite is rather than how big it is — *"one fixture per refusal path plus accepting twins"* is the load-bearing half and is already there; "84" adds nothing and decays. If the number is wanted, it needs the same treatment `test-cases/` got: a checker, or a derivation, not a literal.
HOW IT WAS MEASURED (reproduce this before and after):
  As tabulated above. Nothing here was inferred from the other two — the file count, the loader's own filter, and the runner's case count were each read separately, and they agree.
JUDGE'S NOTE: VALID per verifier chunk15 (line opened by the verifier, not the judge): 86 files, 0 subdirs, 0 non-json. A fourth instrument the finding did not cite strengthens it: fixtures.test.ts:107 expect(fixtures).toHaveLength(86) pins 86 in code, so only Features.md carries 84. ha
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-11: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-11 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-12  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 162

```
TASK T-E3-12 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 162/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/domain
FINDING (exec3, docs/lanes/review-functionality-exec3.md:1059, 44 lines — read the whole section first):
  14.6.2 — `E3-12` (r2) — MINOR — "eleven plain-language checks" — there are **twelve**, and the twelfth is the section's own neighbouring feature
WHAT IS WRONG (the reviewer's words):
  `Features.md:377`, the "Structural validation" bullet — ⚠ **corrected from `:378` at phase-1 close; see §17**:
THE JUDGE'S LINE (the ruling rests on this; open it):
  Features.md:377 — - (gear) **Structural validation** - `validateWorkflowDef`, pure and I/O-free ... : eleven plain-language chec
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either drop the number (the list of what is covered is the useful half), or add the reserved-id class to the enumeration so the sentence and the count move together. The same conclusion as `E3-11`, and the same root: **`Features.md` counts have no instrument.**
HOW IT WAS MEASURED (reproduce this before and after):
  `grep -nE "code: '[a-z0-9-]+'" packages/domain/src/validate-workflow.ts` → 12 lines, 12 distinct codes, listed above. Positive control on the same path: `adviseWorkflowDef`'s two codes are found by the same pattern and **do** match their claim (`Features.md:378`, "Two codes", measured 2: `rdu-bypassable`, `rule-bypassable`) — so the pattern distinguishes a right count from a wrong one in the same file.
JUDGE'S NOTE: VALID per verifier chunk15 (line opened by the verifier, not the judge): Twelve, not eleven. Positive control passes: same pattern gives 2 for adviseWorkflowDef and Features.md:378 says "Two codes". Opened :40 - reserved-state-id, "backlog is reserved". One false sub-claim
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-12: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-12 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-13  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 163

```
TASK T-E3-13 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 163/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:1104, 42 lines — read the whole section first):
  14.6.3 — `E3-13` (r2) — MINOR — A citation in `visible-where.ts` resolves and points at the wrong line
WHAT IS WRONG (the reviewer's words):
  `apps/server/src/read/visible-where.ts:48-52`, the paragraph establishing that the owner row of the visibility table is its own row and that the plan text was wrong about it:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/read/visible-where.ts:51 — * and `test/visibility/visible-tickets.test.ts:88` ("from the bypass alone").
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Cite by content where the content is the point: *"the fixture commented `from the bypass alone`"* — which is also more robust, because the comment is the thing being quoted. This repo has the rule already; `soft-delete-background-paths.test.ts` states it at its own `:169-171`: *"which is why this file cites by what the line READS rather than by where it sat."*
HOW IT WAS MEASURED (reproduce this before and after):
  The three commands above, each run from the repo root. Control on the same path: the same `grep -rn` for the quoted string returns **two** hits, one in the test and one in the citing file — so the sweep is not silent and the quote is unique to one line.
JUDGE'S NOTE: PARTIAL per verifier chunk15 (line opened by the verifier, not the judge): Core holds: :88 is another fixture row, the quoted comment is at :91. PARTIAL because the stated control does not reproduce - the finding prints that grep as TWO hits and concludes the quote is unique
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-13: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-13 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-16  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 164

```
TASK T-E3-16 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 164/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:1549, 69 lines — read the whole section first):
  17.2 `E3-16` (r2) — **IMPORTANT (claimed)** — The roster-cut citation has drifted **twice**, and the files "corrected" to the new number are now stale in exactly the same way as the ones that were left alone
WHAT IS WRONG (the reviewer's words):
  `apps/server/src/routes/tickets.ts` carries the visibility disclosure ruling. The clause that `Features.md` and every client comment quote is:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/routes/tickets.ts:120 (clause 119-122) and :114 — * an explicit audience ROSTER, a disclosure no plan authorized, and leaving
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  **WHAT WOULD HAVE BEEN BETTER — and this is the part that generalises.** `test-cases/17-open-work.md:113` already reaches the right conclusion for the *previous* drift and does not act on it: *"the case for citing by what a line READS rather than by where it sat."* **Every one of the thirteen citations could drop its number and keep its quote** — `routes/tickets.ts`, *"an explicit audience ROSTER, a disclosure no plan authorized"* — and then no line number can drift, in either direction, ever again. The repo already made this choice once (`soft-delete-background-paths.test.ts:169-171`, quoted in `E3-13`). **A line number is a claim that decays; a quoted phrase is a claim that a grep can settle.**
HOW IT WAS MEASURED (reproduce this before and after):
  `grep -n "explicit audience ROSTER" apps/server/src/routes/tickets.ts` → `120`. The thirteen sites are the output of `grep -rn "tickets\.ts:11[1-8]\|routes/tickets\.ts:11[1-8]" --include=*.ts --include=*.tsx --include=*.md .` from the repo root, each one opened. **Control on the same path:** the same grep for the *paragraph* that `115-118` now names (`grep -n "Reachable today" apps/server/src/routes/tickets.ts` → `114`) confirms the two ranges have swapped subjects rather than one having …
JUDGE'S NOTE: PARTIAL per verifier chunk15 (line opened by the verifier, not the judge): Core holds: clause at 119-122, both cited ranges stale. PARTIAL: the stated scope does not reproduce - 13 sites across 9 files undercounts; same grep gives 16 across 12, adding Features.md:343 and 03-
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-16: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-16 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-17  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 165

```
TASK T-E3-17 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 165/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/sync-client
FINDING (exec3, docs/lanes/review-functionality-exec3.md:1631, 66 lines — read the whole section first):
  18. `E3-17` (r2) — MINOR — A docblock that says "re-run the stated command before trusting either number" gives a total its own two bullets contradict
WHAT IS WRONG (the reviewer's words):
  `packages/sync-client/src/outbox/outbox.ts`'s opening docblock prices a refactor — moving `SyncEventResult`/`SyncInvalidCode` into `@gisik-nokma/domain` — and publishes the command that measures it. Three sentences in it are numbers:
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/sync-client/src/outbox/outbox.ts:38 — sixth is prose. So the move's cost by the stated measure is **8 files**,
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The paragraph already contains the right rule and does not apply it to itself: *"Re-run the stated command before trusting either number."* Applied to the total, it would have caught this. **The durable form is to stop stating a total at all** — the two package counts are checkable against the command, the total is a derived fact a reader can add in their head, and it is the derived fact that drifted.
HOW IT WAS MEASURED (reproduce this before and after):
  The command above, run from the repo root at this sha — **the docblock's own command, verbatim**, which is the strongest available form of this check. `node_modules`/`dist` filtered out (the docblock's own parenthetical does the same and says so).
JUDGE'S NOTE: VALID per verifier chunk16 (line opened by the verifier, not the judge): 3+6=9 and :38 says 8; the 'five-plus-two' claim is likewise 5+3 by the docblock's own labels. Controls: git grep tracked-only gives an IDENTICAL 9-file set; a zero-match needle ret.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-17: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-17 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-18  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 166

```
TASK T-E3-18 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 166/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec3, docs/lanes/review-functionality-exec3.md:1698, 114 lines — read the whole section first):
  19. `E3-18` (r2) — **MINOR — revised DOWN from Important at §34** — The two shipped `DataSource` implementations disagree about a dangling parent, and the offline one makes the existence claim case 6.68 was fixed to stop
WHAT IS WRONG (the reviewer's words):
  A ticket whose `parent_id` names a **ticket that was never created** is a reachable state in this product, and the two implementations of the ticket read answer it **differently**:
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/replica/replica-data-source.ts:1175 — { kind: 'restricted', id: state.parentId };
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  `parent = found?.confirmed != null ? {…} : null` — matching the online read — if the replica can distinguish *"absent"* from *"present but not delivered"*. **It can**: that is the same distinction `restrictedParent` already draws for the list read at this file's own `:1171`, and the comment says so. Where the two genuinely cannot be told apart the conservative arm is defensible; here they can, and the code takes the arm that claims more rather than the one that claims less — the opposite of the rule the comment states.
HOW IT WAS MEASURED (reproduce this before and after):
  - `apps/server/src/routes/tickets.ts:400-404` — the online ordering, read at the line. - `packages/app-core/src/replica/replica-data-source.ts:1164-1175` — the replica arm, read at the line. - **The dangling case is REACHABLE and the online answer is PINNED**: `test/routes/ticket-crumbs.test.ts:244` creates a ticket with `parentId: neverCreated` and `:248` asserts `expect(danglingRead.json().parent).toBeNull()`; `test/routes/list.test.ts:713` asserts *"the dangling parent was actually …
JUDGE'S NOTE: PARTIAL per verifier chunk16 (line opened by the verifier, not the judge): tickets.ts:401-404 parent=null vs replica :1166-1175 restricted. PARTIAL: restrictedParent docblock :815-817 says restricted and undelivered are ONE observation, refuting the remed. The lane itself revised E3-18 down to MINOR at its §34; scored there.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-18: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-18 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-20  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 167

```
TASK T-E3-20 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 167/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:2112, 64 lines — read the whole section first):
  25. `E3-20` (r2) — **IMPORTANT (claimed)** — Case 6.82 declares a rollup capability "cannot ship" and "ABSENT from the type"; it shipped, the field is in both types, and the code records *"case 6.82 closed"* while the catalogue line stands
WHAT IS WRONG (the reviewer's words):
  `test-cases/06-auth-visibility.md:115` — case **6.82**, still **❌** — says:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/visibility/rollup.ts:48 — ## `terminal` LANDED here (case 6.82 closed); `open` / `active` are still ABSENT
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The partial-closure form the catalogue already uses elsewhere (`16-remaining-doors.md:923`): amend 6.82 in place to say which half landed, that `terminal` is on both types and counted over all children including unreachable ones, that `open`/`active` remain absent for the original reason, and drop the dead "neither table exists" premise — **in the same change set as the code that landed it**, per the workspace rule that `Features.md` and `test-cases/` move together, *"never a follow-up"*. Its owner line (*"Plan 3 Task 11"*) should move with it: the owner is now whoever removes `open`/`active` from the wait, or nobody.
HOW IT WAS MEASURED (reproduce this before and after):
  Every line above opened: `06-auth-visibility.md:115`; `rollup.ts:48`, `:61`, `:126`; `read-models.ts:95`; `ls apps/server/migrations/ | grep proj-rollups\|proj-tickets` (both present). **Control on the same sweep, so the finding is not a pattern artefact:** case **6.71** (`:87`) makes the same kind of declarative claim about `tickets-read.test.ts` walking only the member viewer class, and it **holds** — `grep -cE "guest|admin|owner|non-member|revoked" …
JUDGE'S NOTE: VALID per verifier chunk16 (line opened by the verifier, not the judge): Case 6.82 at :115 still open, still says 'neither table exists'; rollup.ts:126 terminal:number, read-models.ts:95 terminalChildren. Finding's control reproduced: 0 viewer-class hit. Stale catalogue entry (a case still open for shipped code) = prose drift, scored below the claimed severity.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-20: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-20 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-21  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 168

```
TASK T-E3-21 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 168/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/rule-engine
FINDING (exec3, docs/lanes/review-functionality-exec3.md:2177, 59 lines — read the whole section first):
  26. `E3-21` (r2) — **IMPORTANT (claimed)** — Case 6.84 declares a cross-workspace parent link "reachable and unrefused" and "*no check compares them*"; two checks compare them, at both doors, with a named rule
WHAT IS WRONG (the reviewer's words):
  `test-cases/06-auth-visibility.md:117` — case **6.84**, still **❌**:
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/rule-engine/src/checks/hierarchy.ts:124 — if (!parent || parent.workspaceId !== env.workspaceId) return refuse('hierarchy.unknown-parent');
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Split it in place: the first half becomes a ✅ (or is struck) naming `hierarchy.ts:124`/`:250` and the rule id; the second half stays ❌ or moves to the rollup's own file as a defensive property with its fixture. And the `*Owner: Plan 3.*` line should name whoever owns the rollup's corrupt-data resilience, because Plan 3 no longer owns a gap here.
HOW IT WAS MEASURED (reproduce this before and after):
  Lines opened: `06-auth-visibility.md:117` (full text read); `checks/hierarchy.ts:120-124` and `:250` — both refusals read with their surrounding docblock; `rollup.test.ts` for the `2/1` property the case names. **Control on the same file and the same sweep:** case **6.71** (`:87`) makes a declarative claim about a test file and **holds** (0 viewer-class mentions); case **6.82** (`:115`) is stale in four stated particulars (`E3-20`). **Three lines checked at this depth in one file give one live, …
JUDGE'S NOTE: VALID per verifier chunk16 (line opened by the verifier, not the judge): The comparison the case denies exists at :124 and :250 and both are REACHED - I checked the wiring, not just the guard function. Case 6.84 (:117) still open saying 'no check compar. Stale catalogue entry (a case still open for shipped code) = prose drift, scored below the claimed severity.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-21: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-21 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-22  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 169

```
TASK T-E3-22 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 169/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/rule-engine
FINDING (exec3, docs/lanes/review-functionality-exec3.md:2237, 64 lines — read the whole section first):
  27. `E3-22` (r2) — **IMPORTANT (claimed)** — Case 6.58's stated reproduction of a cycle uses `ticket.reparented`, which `hierarchy.cycle` now refuses — so the sequence it prints can no longer be performed through any door
WHAT IS WRONG (the reviewer's words):
  `test-cases/06-auth-visibility.md:98` — case **6.58**, still **❌**:
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/rule-engine/src/checks/hierarchy.ts:258 — if (cursor.id === ticket.id) return refuse('hierarchy.cycle');
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Case 6.58 in `test-cases/06-auth-visibility.md:98` is still ❌ but its printed reproduction ends in a `ticket.reparented` that `hierarchy.cycle` refuses (`packages/rule-engine/src/checks/hierarchy.ts:255-258`). Rewrite the case as ✅ citing the refusing walk and its test (`rule-engine/test/hierarchy.test.ts`), keeping the case number. Do not renumber anything.
HOW IT WAS MEASURED (reproduce this before and after):
  Lines opened: `06-auth-visibility.md:98` (full text); `hierarchy.ts:237`, `:257-258` (both refusals), and its docblock at `:157-159`; `refusal-rules.ts` for the rule id; `reparent.test.ts:96-131`, `:431` for the planted-defect coverage. **Control on the same file and the same sweep:** at the same depth **6.71** holds (0 viewer-class mentions in `tickets-read.test.ts`) and **6.125** holds (`applyAll` at `seed.ts:84-87` still hand-lists four projections, and the file argues for keeping it that …
JUDGE'S NOTE: VALID per verifier chunk16 (line opened by the verifier, not the judge): Case 6.58's repro ends reparented(A,B), B a descendant of A, which the :255-258 walk refuses. Two blemishes, neither load-bearing: the rule id is at checks/refusals.ts:69 not refus. Stale catalogue entry (a case still open for shipped code) = prose drift, scored below the claimed severity.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-22: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-22 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-23  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 170

```
TASK T-E3-23 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 170/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:2302, 58 lines — read the whole section first):
  28. `E3-23` (r2) — **IMPORTANT (claimed)** — Case 6.124 is ❌ with owner "Plan 11"; the code that closed it names the case by number and says so
WHAT IS WRONG (the reviewer's words):
  `test-cases/06-auth-visibility.md:202` — case **6.124**, still **❌**:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/config.ts:33 — closes it (test case 6.124), for `WEB_ORIGIN` and for `BETTER_AUTH_URL`,
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Case 6.124 in `test-cases/06-auth-visibility.md:202` is still ❌ ('Neither variable is constrained') but `apps/server/src/config.ts:53-55` refines both URLs (`httpUrl()` at `:110` and `:139`). Flip the case to ✅ citing those lines and the config test that covers them; keep the number.
HOW IT WAS MEASURED (reproduce this before and after):
  Lines opened: `06-auth-visibility.md:202` (full text); `config.ts:25-33` (the docblock, read in full), `:53` and `:55` (the refine and its message), `:110` and `:139` (both call sites). **Control inside the same file and the same sweep:** five ❌ lines read at the same depth and **not filed** — `6.71` (:87), `6.125` (:203), `6.130` (:193), `6.53` (:95), `6.65` (:77) — each checked against the code and each still describing the product as it is. **Nine read, four stale, five live.**
JUDGE'S NOTE: VALID per verifier chunk16 (line opened by the verifier, not the judge): :53 refine requires http(s) plus a hostname, :55 the message, :110 and :139 both httpUrl(). Case 6.124 (:202) still open, still says 'Neither variable is constrained'. Positive con. Stale catalogue entry (a case still open for shipped code) = prose drift, scored below the claimed severity.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-23: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-23 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-24  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 171

```
TASK T-E3-24 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 171/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:2361, 59 lines — read the whole section first):
  29. `E3-24` (r2) — **IMPORTANT (claimed)** — Case 6.66's thesis is INVERTED: it says the parent placeholder ships "existence-versus-the-row, not existence-versus-title"; the shipped branch carries the title, and the table it says does not exist does
WHAT IS WRONG (the reviewer's words):
  `test-cases/06-auth-visibility.md:82` — case **6.66**, still **❌**:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/routes/tickets.ts:178 — | { kind: 'ticket'; id: string; title: string; ticket: TicketView }
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Case 6.66 in `test-cases/06-auth-visibility.md:82` states four particulars that are all false today (`proj_tickets` exists; its `:101` comment stores the title; `apps/server/src/routes/tickets.ts:436` carries `title: titleOf(parentState)`). Rewrite the case to describe the shipped behaviour and flip it to ✅ citing `tickets.ts:436` and the covering test; keep the number.
HOW IT WAS MEASURED (reproduce this before and after):
  Lines opened: `06-auth-visibility.md:82` (full text); `routes/tickets.ts:433-438` (the shipped branch) and the `ParentRef` type above it; `1787961800000_proj-tickets.sql:85` and `:101` (the column and its comment); `read/ticket-cards.ts:206` (`titleOf` reading `row.fields['title']`). **Controls on the same file and sweep:** `6.71`, `6.125`, `6.130`, `6.53`, `6.65` read at the same depth and **not filed**; and `6.61` (`:73`) read and **not filed** because its observation still holds even though …
JUDGE'S NOTE: VALID per verifier chunk16 (line opened by the verifier, not the judge): All four particulars false: proj_tickets exists, its :101 comment stores title, tickets.ts:436 carries title: titleOf(parentState). Case 6.66 (:82) still open. Its '20 open lines' . Stale catalogue entry (a case still open for shipped code) = prose drift, scored below the claimed severity.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-24: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-24 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-25  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 172

```
TASK T-E3-25 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 172/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec3, docs/lanes/review-functionality-exec3.md:2421, 60 lines — read the whole section first):
  30. `E3-25` (r2) — **MINOR (claimed)** — Case 6.96 says `SyncItem` "has three members"; it has four — **and this completes the file**
WHAT IS WRONG (the reviewer's words):
  `test-cases/06-auth-visibility.md:131` — case **6.96**, still **❌**:
THE JUDGE'S LINE (the ruling rests on this; open it):
  test-cases/06-auth-visibility.md:131 — - **6.96** ❌ **`SyncItem` has three members and the plan's Interfaces section documents a two-way discriminato
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  **WHAT WOULD HAVE BEEN BETTER, for the file rather than for any one line.** A sweep of the ❌ set against the product, once, by whoever owns the catalogue — twenty lines is an afternoon. **And the durable fix is the one `E6-12` implies: `check-case-citations.mjs` should ask an ❌ line for the rule or route it names, the way a ✅ line is asked for its test.** Failing that, the file's own header should carry the date of its last re-read, so the next lane knows the sample it is working from.
HOW IT WAS MEASURED (reproduce this before and after):
  All twenty lines read in full (`:73`, `:77`, `:82`, `:87`, `:93`, `:95`, `:97`, `:98`, `:107`, `:115`, `:116`, `:117`, `:129`, `:131`, `:193`, `:198`, `:199`, `:201`, `:202`, `:203`), each checked against the code or artifact it names. For this finding: `sync-item.ts:94`, `:96`, `:99`. **Control on the count:** `grep -rn "three members"` over `packages apps test-cases` returns the case line and seven unrelated matches (a `FetchLike`'s three members, the gateway's three, an unrelated roster …
JUDGE'S NOTE: VALID per verifier chunk17 (line opened by the verifier, not the judge): Four arms; ReachGrantedInstruction :94. Count stale, harmless direction -> MINOR (count drift). SAMPLE: 6.96 only (1 of 20); the finding's 9-of-20 / 45% denominator NOT verified. C.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-25: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-25 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-26  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 173

```
TASK T-E3-26 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 173/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec3, docs/lanes/review-functionality-exec3.md:2992, 59 lines — read the whole section first):
  42. `E3-26` (r2) — **IMPORTANT (claimed)** — `Features.md` says "Nothing in the app links to any of them yet" and "`AppNav` … no settings entry"; the nav renders a Settings link and a `/settings` shell with a sidebar pointing at all of them
WHAT IS WRONG (the reviewer's words):
  `Features.md:2350`, a **✅** bullet cataloguing the authoring routes:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/src/app-nav.tsx:299 — href={`/settings?workspaceId=${effectiveWorkspaceId}`}
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The bullet should say what `/settings` is and that the nav entry landed — pointing at `app/settings/page.tsx` and `app-nav.tsx:299` — and drop the "unowned" sentence, in the change set that built it, per the workspace rule that `Features.md` moves with the code *"never a follow-up"*. **And the durable fix is the one §30.1 named for `test-cases/`: the missing instrument.** `Features.md` is the workspace's declared source of truth and is the one such document with no checker (§20's own note); a `href` claim in it could be checked the way `check:runbook` checks that every command a runbook names resolves.
HOW IT WAS MEASURED (reproduce this before and after):
  Lines opened: `Features.md:2350` (full bullet); `apps/web/app/settings/page.tsx:55-77`, `:182-193`, `:365-379`; `apps/web/src/app-nav.tsx:62-84`, `:299`; `find apps/web/app -path '*settings*' -name page.tsx` (eight pages, including `/settings/page.tsx`, which the bullet's sweep would have to have visited to make its claim). **Control on the same bullet:** its own list of six routes — I checked all six exist, and **all six do** …
JUDGE'S NOTE: PARTIAL per verifier chunk17 (line opened by the verifier, not the judge): CORE HOLDS: app-nav.tsx:299 renders a Settings Link, so 'no settings entry'/'unowned' is stale. PARTIAL: (a) the href sweep SURVIVES - no href to the six outside the six route file. Stale prose (docs/comments behind shipped code) = drift, scored below the claimed severity.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-26: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-26 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-27  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 174

```
TASK T-E3-27 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 174/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec3, docs/lanes/review-functionality-exec3.md:3165, 70 lines — read the whole section first):
  45. `E3-27` (r2) — **IMPORTANT (claimed)** — Two files say `checkErrandTemplate` is *"not yet landed on this branch"*; it landed, the SEEDER CALLS IT as a throwing guard, and it has eleven cases
WHAT IS WRONG (the reviewer's words):
  Two places carry the same claim, both still standing:
THE JUDGE'S LINE (the ruling rests on this; open it):
  Features.md:452 — - ⚙️ **Canonical errand-with-waits workflow template** — will be pinned by Plan 11's `checkErrandTemplate` ora
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One edit in each file, in the change set that landed the oracle: drop *"(not yet landed on this branch)"* and the *"will be pinned by"* future tense, and point at `seed/templates.test.ts` the way the neighbouring bullets point at their own tests. **The durable fix is again the missing instrument** — §30.1 and §42 both name it: `Features.md` is the one source-of-truth document in this repository with **no checker**, so a sentence about the product's own state has nothing that re-derives it. A grep for `` `identifier` `` in backticks against `className`/`functionName` existence would be crude and would still have caught this one.
HOW IT WAS MEASURED (reproduce this before and after):
  `Features.md:452` and `packages/app-core/test/workflow-builder/templates.test.ts:66` read in full; `seed/templates.ts:41` (the definition), `seed-convenience-corner.ts:131-136` (the call and its throw), `test/seed/templates.test.ts` (11 cases, `grep -cE "^\s*it\("`), `packages/domain/src/workflows/ errand-with-waits.ts:5` (the present-tense reference). **Control on the sweep:** `grep -rn "not yet landed"` over `packages apps Features.md test-cases`, excluding `node_modules` and `dist`, returns …
JUDGE'S NOTE: VALID per verifier chunk17 (line opened by the verifier, not the judge): 2nd site opened: app-core/test/workflow-builder/templates.test.ts:66, same phrase. errand-with-waits.ts:5 says 'pinned by Plan 11's checkErrandTemplate' in the present tense. Contr. Stale prose (docs/comments behind shipped code) = drift, scored below the claimed severity.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-27: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-27 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-28  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 175

```
TASK T-E3-28 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 175/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec3, docs/lanes/review-functionality-exec3.md:3312, 68 lines — read the whole section first):
  48. `E3-28` (r2) — **IMPORTANT (claimed)** — Two documents count the offline-born ticket's doors as three and never name `getTicket`; the code's own comment says *"THE THIRD NAME WAS MISSING"* and the registry now has it
WHAT IS WRONG (the reviewer's words):
  Two places state the same enumeration:
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/replica/replica-data-source.ts:576 — getTicket: OFFLINE_BORN_ABSENCE,
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One clause in each, in the change set that fixed the registry: name `getTicket` as the fourth door, or say *"three OMITTING doors — `getTickets`, `getBoard`, `getTicket`"* and count `listTicketSummaries` separately as the one that carries it. **And the deeper fix is the one the code already made**: the registry is the enumerable datum and the prose should be derived from it rather than restated — which is what `OFFLINE_BORN_OMISSIONS`'s own docblock says the registry exists for (*"so a caller can enumerate them without calling"*).
HOW IT WAS MEASURED (reproduce this before and after):
  `Features.md:2054` and `test-cases/12-offline-sync-apps.md:1410` read in full; `replica-data-source.ts:573-576` (the registry) and `:535-545` (its comment, quoting the *"THIRD NAME WAS MISSING"* sentence); the counts taken with `grep -oE "getTicket([^s]|$)"` **after a naive `grep -o "getTicket"` returned 2 for a line containing only `getTickets`** — the prefix trap, controlled for. **Also recorded: my first attempt to print the contexts used an `awk` loop that re-matched the same offset and …
JUDGE'S NOTE: VALID per verifier chunk17 (line opened by the verifier, not the judge): Registry :573-576 = {getTickets,getBoard,getTicket}; comment :536 'THE THIRD NAME WAS MISSING AND IS THE SAME ARGUMENT'. Prefix trap controlled; positive control = 5 getTickets ove. Stale prose (docs/comments behind shipped code) = drift, scored below the claimed severity.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-28: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-28 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-29  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 176

```
TASK T-E3-29 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 176/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/domain
FINDING (exec3, docs/lanes/review-functionality-exec3.md:3561, 44 lines — read the whole section first):
  53. r2 finding E3-29 — `Features.md` §5 says "eleven registered types"; the registry carries eighteen, and the five it omits are the soft-delete and closure pair
WHAT IS WRONG (the reviewer's words):
  `Features.md:397` opens — *"**Ticket event vocabulary** — eleven registered types, all v1, each bound to the entity kind it is about:"* — and enumerates exactly eleven. The registry in `packages/domain/src/vocabulary.ts` carries **34 registered types, eighteen of them filed against `entityKind: 'ticket'`.** Five `ticket.*` types in the registry are absent from the enumeration: **`ticket.closed`, `ticket.reopened`, `ticket.ranked`, `ticket.deleted`, `ticket.restored`.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  Features.md:397 — - ⚙️ **Ticket event vocabulary** — eleven registered types, all v1, each bound to the entity kind it is about:
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The bullet should state the vocabulary the registry holds, or scope itself explicitly — *"the eleven types Plan 3 registered"* — so the count is a claim about a moment rather than about the set. The five later additions (`ticket.ranked` in §3:25's own bullet, the closed pair under the backlog/closed spec, the soft-delete pair) each have a bullet somewhere; the defect is that **this** bullet's count and closure were never moved when they landed, which is precisely the *"any PR that touches source files and leaves `Features.md` untouched is incomplete"* rule in the workspace conventions.
JUDGE'S NOTE: VALID per verifier chunk17 (line opened by the verifier, not the judge): Bullet does enumerate 11 - `ticket.collaborator_added/removed` is ONE backtick = TWO types; 10 of the 11 are entityKind ticket. Membership not size: exactly the five named absent, .
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-29: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-29 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-30  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 177

```
TASK T-E3-30 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 177/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:4130, 41 lines — read the whole section first):
  65. `E3-30` (phase 2, HALF) — **IMPORTANT (claimed)** — Case 6.83 is ❌ asking for a measurement; the measurement exists, is named *"MEASURES case 6.83"* in the test, is recorded ✅ as case 7.78, and is cited by the code — since 2026-09-02
WHAT IS WRONG (the reviewer's words):
  `test-cases/06-auth-visibility.md:116` — case **6.83**, still **❌**: *"When `proj_rollups` lands this is not a column rename … the two totals have **different sources** … and nothing guarantees the sets are equal. So the substitution must be MEASURED rather than assumed to be a no-op. Owner: Plan 3 Task 11."*
THE JUDGE'S LINE (the ruling rests on this; open it):
  test-cases/06-auth-visibility.md:116 6.83 ❌; apps/server/test/read/ticket-cards.test.ts:507 it('MEASURES case 6.83: proj_visibility and proj_rollups do not enumerate the same children…'); test-cases/07-api-realtime-search.md:101 7.78 ✅ 'Case 6.83 MEASURED rather than argued'; apps/server/src/visibility/rollup.ts:82-85 'It now has been'
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Flip 6.83 to ✅ citing `ticket-cards.test.ts:507` and 7.78 — one line. And the detector `E6-12`/`E3-22` already ask for: a ❌ line whose number appears in a test name is a ❌ that must answer for itself; `grep -rn "case 6\.83" apps/server/test` → 2 lines is the whole instrument.
HOW IT WAS MEASURED (reproduce this before and after):
  Lines opened: `06-auth-visibility.md:116`; `ticket-cards.test.ts:462`, `:505-507`; `07-api-realtime-search.md:101`; `rollup.ts:79-85`; `1787961900000_proj-rollups.sql:66-78`; `git log -S"MEASURES case 6.83" -- apps/server/test/read/ticket-cards.test.ts` → `563c983e 2026-09-02`. **Not run:** the test itself (it needs the shared test Postgres; one file of one package is within the rules, and I chose the four documentary witnesses over the run because the claim is about the marker, not the test's …
JUDGE'S NOTE: VALID, judge opened; judged MINOR under phase-1 policy (c): a stale test-cases/ marker is Minor (E3-20…24 and E6-12 were scored so), and the same class cannot score Important on the same day. Phase 2, half.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-30: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-30 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-31  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 178

```
TASK T-E3-31 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 178/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/rule-engine
FINDING (exec3, docs/lanes/review-functionality-exec3.md:4172, 50 lines — read the whole section first):
  66. `E3-31` (phase 2, HALF) — **MINOR (claimed)** — Case 6.57 conditions on *"if Plan 3 admits a reparent that crosses projects"*; Plan 3 refused it on 2026-08-31 at both doors, and no event can move a ticket's project at all
WHAT IS WRONG (the reviewer's words):
  `test-cases/06-auth-visibility.md:97` — case **6.57**, still **❌**: *"`proj_visibility.project_id` is written only at `ticket.created` and is never updated afterwards … **If Plan 3 admits a reparent that crosses projects, this column goes stale** … Owner: Plan 3 (whether a cross-project reparent is legal at all)."* The same conditional is in the schema: `migrations/1787961300000_proj-visibility.sql:39` `COMMENT ON COLUMN proj_visibility.project_id … "if Plan 3 ever admits a cross-project reparent this column goes stale"`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  test-cases/06-auth-visibility.md:97 6.57 ❌ 'If Plan 3 admits a reparent that crosses projects'; packages/rule-engine/src/checks/hierarchy.ts:125 and :274 return refuse('hierarchy.cross-project'); grep projectId packages/domain/src/events/ticket-events.ts → :43 only (ticket.created)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Strike 6.57 with the rule id and 5.40 as the witness (*"cross-project reparent is refused — `hierarchy.cross-project`, `hierarchy.ts:274`; the column cannot drift"*), and amend the column comment the next time that migration file is touched. The projection's `project_id` staying write-once is then a documented invariant rather than an open gap.
HOW IT WAS MEASURED (reproduce this before and after):
  Lines opened: `06-auth-visibility.md:97`; `1787961300000_proj-visibility.sql:39`; `hierarchy.ts:124-125`, `:250`, `:274`; `hierarchy.test.ts:83-92`, `:382-393`; `05-tickets-hierarchy.md:56`; `ticket-events.ts:43`; `grep -rhoE "ticket\.[a-z_]+" packages/domain/src/events/*.ts | sort -u` → 13 names, and `grep -n projectId packages/domain/src/events/ticket-events.ts` → one line. **Control:** `6.71` at `:87`, read at the same depth, holds (as §27 recorded).
JUDGE'S NOTE: VALID, judge opened. The conditional the case rests on was refused at both doors on 2026-08-31 and no event carries a projectId after creation. Phase 2, half.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-31: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-31 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-33  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 179

```
TASK T-E3-33 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 179/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:4348, 25 lines — read the whole section first):
  69. `E3-33` (phase 2, HALF) — **MINOR (claimed)** — `proj-projects.ts:29` says `proj_ticket_types` *"does not exist yet"* and that its own position is *"immediately after `proj_workflows`"*; both became false 21 minutes after the sentence landed, and the file it says must move *"in the same commit"* did (15:35 IST)
WHAT IS WRONG (the reviewer's words):
  `apps/server/src/projections/proj-projects.ts:26-32`: *"§8 pins `proj_entity_heads, proj_workflows, proj_ticket_types, proj_projects, …`. `proj_ticket_types` does not exist yet, so this one's §8 position today is immediately after `proj_workflows` — an INSERT, not an append. See `./index.ts` and `test/projection-order.test.ts`, both of which must move in the same commit."*
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/projections/proj-projects.ts:29-30 '`proj_ticket_types` does not exist yet, so this one's §8 position today is immediately after `proj_workflows`'; apps/server/src/projections/index.ts:65-75 registers workflowsProjection, ticketTypesProjection ('§8 position 3 … INSERTS above proj_projects'), projProjects ('§8 position 4') in that order
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Delete the two sentences; `index.ts:66-72` already says what is true and why.
HOW IT WAS MEASURED (reproduce this before and after):
  Lines opened: `proj-projects.ts:24-33`; `projections/index.ts:62-76`; the migration's filename; `git log -S` and `git log --diff-filter=A` as above. **Control:** the first sentence of the same docblock (the §8 order) matches `index.ts:24`'s list word for word.
JUDGE'S NOTE: VALID, judge opened. Phase 2, half.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-33: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-33 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-34  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 180

```
TASK T-E3-34 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 180/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:4413, 54 lines — read the whole section first):
  72. `E3-34` (phase 2, HALF) — **MINOR (claimed)** — `projections/tickets.ts:480-499` says *"nothing refuses a `ticket.assigned` … for a ticket that does not exist"* and cites a test that *"ingests two … against tickets that were never created, and they are committed"*; the test it cites had been rewritten 21 minutes earlier because the gate refuses exactly that, and its own comment says so (15:41 …
WHAT IS WRONG (the reviewer's words):
  `apps/server/src/projections/tickets.ts:480-499` (docblock of the assignment fold's skip): *"the server commits them today: `test/permissions/check-role-permission.test.ts` ingests two `ticket.assigned` events against tickets that were never created, and they are committed, not refused."* … *"THE UNDERLYING GAP IS NOT FIXED HERE … nothing refuses a `ticket.assigned` (or either collaborator event) for a ticket that does not exist, so the ledger can hold an assignment of nothing to somebody. That is a refusal no plan document owns — recorded as a finding for the controller."*
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/projections/tickets.ts:483-484 'against tickets that were never created, and they are committed, not refused', :496 'nothing refuses a'; apps/server/src/visibility/can-see.ts:140-142 (no row → null) and :227-234 (null → false); apps/server/src/permissions/check-permission.ts:1048-1050 if (!(await canSee(…))) return refuseWith(PERMISSION_VISIBILITY_RULE, TICKET_NOT_VISIBLE_REASON); apps/server/test/permissions/check-role-permission.test.ts:942-948 'which the visibility check now …
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  *"the permission gate refuses this at both client doors since Plan 4 Task 9 (`canSee` is false for a missing row); the engine has no existence check, so the internal door could still write one"* — and drop the test citation, which now proves the opposite.
HOW IT WAS MEASURED (reproduce this before and after):
  Lines opened: `projections/tickets.ts:478-500`; `can-see.ts:129-142`, `:227-234`; `check-permission.ts:1040-1050`; `check-role-permission.test.ts:940-956`, `:1024`, `:1070`, `:1189` (the three `ticket.assigned` ingests, each on a `visibleTicket`); `git log -S'used to file \`ticket.assigned\` against a bare' -- …/check-role-permission.test.ts` → `dd7bfcfd`; `git log -S'THE UNDERLYING GAP IS NOT FIXED HERE' -- …/projections/tickets.ts` → `6cb631d0`. **Not run:** the test file (shared Postgres); …
JUDGE'S NOTE: VALID, judge opened. The docblock asserts a gap the gate closes and cites as evidence a test whose own comment says it was rewritten because of the refusal. MINOR as claimed (no upward re-grade). Phase 2, half.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-34: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-34 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E3-9  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 181

```
TASK T-E3-9 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 181/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/domain
FINDING (exec3, docs/lanes/review-functionality-exec3.md:827, 43 lines — read the whole section first):
  14.1 — `E3-9` (r2) — MINOR — A "thirteen fields" claim is false: the envelope schema has **eleven**
WHAT IS WRONG (the reviewer's words):
  `packages/domain/src/ledger-event.ts:16-18` — the docblock explaining why `ledgerEventSchema` is derived from `eventEnvelopeSchema` rather than restating it — reads:
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/domain/src/ledger-event.ts:17 — * spelling of the envelope, so the thirteen fields have exactly one definition
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  *"the eleven fields have exactly one definition"*, or — better, and the form this repo prefers elsewhere — name the thing instead of counting it: *"so the envelope's fields have exactly one definition"*. The count adds nothing the sentence needs, and it is the kind of number that cannot self-correct: nothing in the tree re-derives it, and the file has no test that reads it.
HOW IT WAS MEASURED (reproduce this before and after):
  Runtime probe, `packages/domain`, this sha — see §14.3. Plus the sweep that shows the claim is unique: `grep -rn "thirteen fields"` over `packages apps docs test-cases` returns exactly two hits, `src` and its built `dist/*.d.ts` copy — so this is one sentence, not a propagated belief.
JUDGE'S NOTE: VALID per verifier chunk15 (line opened by the verifier, not the judge): Docblock says thirteen; envelope is submittedEventObject(9)+serverTime+seq=11, by reading envelope.ts:188-248 and by runtime probe. 13 is the events table: CREATE TABLE events (migration 1787841717635
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E3-9: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E3-9 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-12  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 183

```
TASK T-E6-12 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 183/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec6, docs/lanes/review-functionality-exec6.md:996, 35 lines — read the whole section first):
  E6-12 — IMPORTANT — Two ❌ cases in `06-auth-visibility.md` declare guest admissions the product closed weeks ago, one of them security-relevant and with a named owner; a third declares "nothing rate-limits issuance" after the limiter shipped
WHAT IS WRONG (the reviewer's words):
  Three open-gap declarations, each measured against the product today (Appendix K for the guest doors; 1 file / 1 test passed):
THE JUDGE'S LINE (the ruling rests on this; open it):
  test-cases/06-auth-visibility.md:107 "6.77 ❌ A workspace GUEST is still ADMITTED for workspace.renamed" vs check-permission.ts:730-731 if (env.type === 'workspace.renamed' && !isWorkspaceAdmin) return refuse(…)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The supersession marker the catalogue already uses (`16-remaining-doors.md:923`, *"STATUS CHANGED 2026-09-20: (a) is FIXED — cases …"*) on 6.51, 6.77 and 6.123, pointing at the permission test's guest arm and the `ADMIN_ONLY_TYPES`/guest lines — one line each, in the PR that closed the door. And the cheap general detector the round-1 ruling proposed for F1: *"a 'known gap' paragraph should be greppable by the number it is built on"* — here, the rule constant it says is absent.
HOW IT WAS MEASURED (reproduce this before and after):
  Appendix K (guest actor through `POST /v1/events`, with a positive control that the guest can read the ticket they are refused on). Lines opened: `06-auth-visibility.md:93`, `:107`, `:201`; `check-permission.ts:704`, `:730`; `apps/server/src/app.ts:485`, `:588-595`; `check-visibility-permission.test.ts:330-340`, `:378-389`; `git log -S` dates above; `check-case-citations.mjs:13`.
JUDGE'S NOTE: VALID at MINOR, judge opened. A ❌ case declaring an admission the code closed = stale catalogue entry, scored as the same class in exec 3 (E3-20…24). The verifier's IMPORTANT is overridden for consistency.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E6-12: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-12 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-14  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 184

```
TASK T-E6-14 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 184/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/app-core
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1085, 42 lines — read the whole section first):
  E6-14 — MINOR — The delete toast's recorded reason for departing from the prototype ("this product has no ticket key") stopped being true thirteen minutes before it was written; the same file now reads the key for its own breadcrumb
WHAT IS WRONG (the reviewer's words):
  `packages/app-core/src/views/ticket-sheet.tsx:296-306`, on `onDeleted`: *"The prototype toast says `"GN-1183 deleted · …"` — a ticket KEY. **This product has no ticket key**; its ids are ULIDs … The title is the only human name a ticket has here … a key is a migration"* — and the host renders `${title} deleted · its history is retained` (`p/[projectId]/page.tsx:2879-2890`, same reasoning repeated). Measured today: the detail door serves `key` (`routes/tickets.ts:548-555`, `ticketKey(identity.prefix, projectPrefix, number)`; my Appendix C run's detail body carries a `key` field), and **the same sheet uses it**: `ticket-sheet.tsx:1588` `const lastCrumb = ticketRead.key ?? ticketRead.title;`, with `:1794` noting *"#595 shipped the composition"*.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/app-core/src/views/ticket-sheet.tsx:299-300 — The prototype toast says "GN-1183 deleted . ..." - a ticket KEY. **This product has no ticket key**; its ids a
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Hand `onDeleted` the `key ?? title` the crumb already computes, and replace the docblock's paragraph with the one sentence that is true: a key exists when the workspace has a prefix, and the toast falls back to the title when it does not.
HOW IT WAS MEASURED (reproduce this before and after):
  `sed -n '296,306p;1588p;1794p' packages/app-core/src/views/ticket-sheet.tsx`; `sed -n '548,555p' apps/server/src/routes/tickets.ts`; `git log -1 --format='%h %ci' ac18f2bc` / `18d7e391`; Appendix C's `GET ticket LC` line (`keys: …,key,epic`).
JUDGE'S NOTE: VALID per verifier chunk30 (line opened by the verifier, not the judge): Same file :1588 'const lastCrumb = ticketRead.key ?? ticketRead.title;'; tickets.ts:548-555 composes and serves key. git log -S'product has no ticket key' on that file returns 18d7e391 only, so the st
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E6-14: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-14 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-E6-25  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 187

```
TASK T-E6-25 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 187/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec6, docs/lanes/review-functionality-exec6.md:1643, 16 lines — read the whole section first):
  E6-25 — MINOR — The deploy directory tells the operator that a forged `X-Forwarded-For` still buys a private rate-limit bucket ("Plan 11 T2 (not yet on main)"), that `DATABASE_CA_CERT` "has no effect" and is "not yet in config.ts's zod schema", that the seed scripts are still to land, and (`.env.example`) that `SMTP_URL` does nothing until the SMTP sender lands and that "the other seven" config …
WHAT IS WRONG (the reviewer's words):
  `deploy/do/app.yaml:95-101`, the comment above `TRUST_PROXY: "true"`, verbatim: *"…lets a caller pick its own rate-limit bucket via a forged leftmost X-Forwarded-For entry — Plan 11 T2 (not yet on main) fixes this by keying the limiter on the RIGHTMOST XFF entry … Until T2 lands, TRUST_PROXY=true is still required here … but the forged-header gap above is open on whatever is on main."* Measured against the built server:
THE JUDGE'S LINE (the ruling rests on this; open it):
  deploy/do/app.yaml:95-101 and :59-62; deploy/do/README.md:115-116 and :71; .env.example:29-35 and :234-238 — app.yaml:101 "forged-header gap above is open on whatever is on main"; :60 "on the sha this file was written a
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Rewrite the operator comments in `deploy/do/app.yaml:95-101` and `deploy/do/README.md:115` so that every sentence is true of today's code: the rate limiter keys on the rightmost X-Forwarded-For entry (`apps/server/src/config.ts:212`, `index.ts:224`), `DATABASE_CA_CERT` is honoured (`db.ts:50,148`), and the sender selection at `select-senders:35-37`. Delete the 'Plan 11 T2 (not yet on main)' sentences. No code change.
JUDGE'S NOTE: PARTIAL per verifier chunk32 (line opened by the verifier, not the judge): 5 of 6 sentences false today (config.ts:212, db.ts:50+148, select-senders:35-37, index.ts:224, runbook:214). PARTIAL: the 6th (app.yaml:59-62) self-scopes to "the sha this file was written against", a
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `E6-25: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-E6-25 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F1-fn  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 188

```
TASK T-F1-fn — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 188/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:141, 58 lines — read the whole section first):
  F1 — IMPORTANT — An open-gap section still declares a closed security-relevant leak, with both supporting numbers stale and a named owner pointing at finished work
WHAT IS WRONG (the reviewer's words):
  `apps/server/test/read/soft-delete-background-paths.test.ts:118` heads a section `### ⛔ WHAT NEITHER ARM COVERS, NAMED RATHER THAN LEFT AS AN ABSENCE`, whose `:120` reads *"FOUR surfaces, every one of them MEASURED as a survivor"*. Its subsection (a) at `:123` is titled *"A soft-deleted ticket's ATTACHMENTS are served by THREE doors, and the third serves the BYTES"*, asserts at `:142-144`:
THE JUDGE'S LINE (the ruling rests on this; open it):
  soft-delete-background-paths.test.ts:140-146 an open-gap docblock still naming an owner for the attachment leak, with "routes/attachments.ts contains the word deleted ZERO times" — the leak is closed (16.97–16.99 per the report; verifier controls non-silent)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  The correction should have landed in the file that **owns the enumeration**. Concretely: replace (a)'s body with the supersession marker the catalogue already carries (`test-cases/16-remaining-doors.md:923` handles it correctly — *"STATUS CHANGED 2026-09-20: (a) is FIXED — cases `16.96`–`16.99`"*) and point the reader at those cases, rather than leaving a live gap with a named owner. **The cheap detector for the class: a "known gap" paragraph should be greppable by the number it is built on.** Both of (a)'s numbers (`ZERO`, `6`) are stale *and* the sentence that would have been checked by a content sweep — `attachment surface` — appears in exactly **one** source file, which is the one nobody swept.
HOW IT WAS MEASURED (reproduce this before and after):
  ``` grep -c "deleted" apps/server/src/routes/attachments.ts → 5 (claim: ZERO) grep -c "deleted" apps/server/src/routes/tickets.ts → 13 (claim: 6) git show --name-only 6a69f5df | grep -c soft-delete-background-paths → 0 grep -rn "attachment surface" --include=*.ts apps packages → 1 file (soft-delete-background-paths.test.ts:146) + 1 acknowledgement (routes/tickets.ts:888) ``` Control on the same path: `grep -rn "WHAT NEITHER ARM COVERS" --include=*.ts apps` → 1 hit, the section heading itself. …
JUDGE'S NOTE: VALID at MINOR, judge opened. A stale docblock declaring a closed leak open = prose drift; the lane's own re-filing agrees it is not a product defect.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `F1: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F1-fn | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F3-fn  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 189

```
TASK T-F3-fn — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 189/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec3, docs/lanes/review-functionality-exec3.md:254, 52 lines — read the whole section first):
  F3 — IMPORTANT — **My own lane's §17 group** cites an artifact the owner has ruled is not the prototype, and every citation in it is off by one against the artifact that is
WHAT IS WRONG (the reviewer's words):
  `test-cases/17-open-work.md` (shipped in `#619`, `6029e1cf`) cites the prototype by line number into **`design-system/interactive/desktop.dc.html`** — the header at `:87-90`, and cases `17.001`–`17.004` and `17.006` throughout: `:1213`, `:1210`, `:1214`–`:1224`, `:1216`, `:1224`, `:1225`–`:1229`, `:1230`, `:3755`, `:3756`, `:3786`.
THE JUDGE'S LINE (the ruling rests on this; open it):
  test-cases/17-open-work.md:58 §17 citations point at the repo's transformed prototype copy, every one +1 against the ruled export (CTL-REVIEW-COMMON-2026-09-22.md:21); the substance transfers (letter-spacing 0.6px = 13 in both copies)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Cite the staged export by **file name and sha** — as the common brief requires — and shift the numbers by −1, or state the copy used and the offset explicitly. The general form: **a prototype citation should name the artifact it was measured in, because two files in this repository both call themselves the prototype and only one of them is.**
HOW IT WAS MEASURED (reproduce this before and after):
  `shasum -a 256` on both files; `grep -o 'viewBox' | wc -l` and the same for `sc-camel-view-box` on both; `wc -l` on both; the four paired line reads via `sed -n`. Control: the same `grep` run for `letter-spacing:0.6px` on **both** files returned 13/12/1 on each — so the counts are a property of the prototype, not of one copy.
JUDGE'S NOTE: VALID at MINOR, judge opened. Citation drift against the wrong artifact; the lane's own honest self-finding.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `F3: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F3-fn | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F6-fn  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 190

```
TASK T-F6-fn — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 190/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/server
FINDING (exec3, docs/lanes/review-functionality-exec3.md:369, 48 lines — read the whole section first):
  F6 — LOW — The soft-delete enumeration's own counts do not reproduce from the command printed beside them
WHAT IS WRONG (the reviewer's words):
  Two places state the same figure, both naming the command that produces it:
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/server/src/read/visible-where.ts:155 — * reviewer: 13 executable uses of the constant (8 `${LIVE_TICKET_WHERE}`
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One clause: *"13 view-site uses … plus `read/live-ticket.ts`'s `ticketIsLive`, which asks the same constant at a route."* Then the command and the caption agree.
HOW IT WAS MEASURED (reproduce this before and after):
  ``` grep -rn '\${LIVE_TICKET_WHERE}' apps/server/src → 10 lines, 9 executable (1 is a docblock mention: visible-where.ts:155) grep -rn 'LIVE_TICKET_WHERE,' apps/server/src → 5 array members (after removing 10 import lines) grep -rniE "deleted_at[[:space:]]+is[[:space:]]+(not[[:space:]]+)?null" apps/server/src → 4 longhand + the constant's own definition ``` Each site's context was read individually to confirm it is executable SQL and not a comment; the 9 template sites are at …
JUDGE'S NOTE: VALID per verifier chunk14 (line opened by the verifier, not the judge): Reproduces exactly; the differing site is read/live-ticket.ts:58 as stated. Longhand executables: rollup.ts:263, rollups.ts:221, :320, builder-reads.ts:504 (5 comments + the definition at visible-wher
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `F6: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F6-fn | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-F7-fn  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 191

```
TASK T-F7-fn — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 191/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec3, docs/lanes/review-functionality-exec3.md:418, 26 lines — read the whole section first):
  F7 — LOW — **My own lane's §17 block table** has one row and no rule for a lane with no allocation
WHAT IS WRONG (the reviewer's words):
  `test-cases/17-open-work.md:28` is the whole allocation table: **one row**, `exec 3` → `17.001`–`17.020`. `:30` says *"THIS TABLE IS THE ALLOCATION, AND IT EXPIRES"* and `:33` gives the only escape hatch: *"**When your block is empty, STOP AND ASK.** Do not mint from the tip and do not borrow a neighbour's."*
THE JUDGE'S LINE (the ruling rests on this; open it):
  test-cases/17-open-work.md:28 — | **exec 3** | **`17.001`–`17.020`** (taken 2026-09-21 for the sheet's `Visibility` section styling) — **minte
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Two rows (or `— not allocated —` rows for exec 1 and exec 2), plus one sentence: *"a lane with no row here must STOP AND ASK; silence is not a licence."* §17 is the section my lane opened, so this is my defect to name.
HOW IT WAS MEASURED (reproduce this before and after):
  `grep -n "exec 3.*17.001\|THIS TABLE IS THE ALLOCATION\|When your block is empty" test-cases/17-open-work.md` → 3 hits, `:28`, `:30`, `:33`. The table's row count is 1 — read directly.
JUDGE'S NOTE: VALID per verifier chunk14 (line opened by the verifier, not the judge): Verified by reading: one row, and the only escape hatch fires on 'your block is EMPTY', not on 'you have NO block'. 16-doors.md:17 'exec 2's block is now FULLY SPENT ... must be reallocated by the con
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `F7: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-F7-fn | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-I3  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 192

```
TASK T-I3 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 192/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:141, 13 lines — read the whole section first):
  I3 — **IMPORTANT** — `DENSE_IN_LIST`'s stated reason for excluding `.gn-my-work__title` is falsified by the same docblock, two lines above it
WHAT IS WRONG (the reviewer's words):
  `apps/web/e2e-viewport/tap-targets.ts:71-76` states the membership rule: a control belongs in `DENSE_IN_LIST` when **(a)** the product's own CSS gives it the 24px floor **AND (b)** *"a sweep actually visits the route it renders on"*. Lines 82-90 exclude `.gn-my-work__title` on the ground that clause (b) fails.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/e2e-viewport/tap-targets.ts:83 "and on `/my-work`, which the stack suite does sweep)" vs the preamble at :78 attributing the exclusion to clause (b)
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either add the entry (clause (a) holds: the docblock says the rule is *"byte-similar to `.gn-attention__title`"*, whose own rule at `ui.css:1606-1616` makes the 24px call) and re-baseline in the same commit, or restate the exclusion as what it is — *"excluded because no lane has had a stack window to measure it, owner: whoever next runs `test:e2e:stack`"* — and keep clause (b) clean for the cases where it is the real reason.
HOW IT WAS MEASURED (reproduce this before and after):
  Clause (b) **holds**. The same docblock says the control is *"on `/my-work`, **which the stack suite does sweep**"*, and `apps/web/e2e-stack/viewport.spec.ts:108` navigates to `/w/${workspaceId}/my-work` before calling `measureTapTargets` at `:170`. The reason actually given for the exclusion is a *measurement window* ("its baseline can only be measured against the live stack on `:3001`, which is another lane's worktree"), which is not clause (b).
JUDGE'S NOTE: VALID, judge opened. A docblock contradicting itself two lines apart = prose drift, MINOR.
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `I3: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-I3 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-I4  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 193

```
TASK T-I4 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 193/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/ui
FINDING (exec1, docs/lanes/review-ui-exec1.md:155, 11 lines — read the whole section first):
  I4 — **MINOR** — `tap-targets.ts` cites a line range that resolves and misleads
WHAT IS WRONG (the reviewer's words):
  The docblock that justifies the 24/44 split cites the wrong lines for the sentence it quotes.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/ui/src/ui.css:1607 and :1662 — :1607 'WHAT LEFT, AND WHY IT IS NOT A REVERSAL. This rule carried a'; :1662 'Dense in-list controls get 24'
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Cite the sentence, not the range — `ui.css`'s `".gn-attention__title"` docblock — the same remedy `test-cases/16-remaining-doors.md:19` prescribes for itself (*"resolve that paragraph by CONTENT"*).
HOW IT WAS MEASURED (reproduce this before and after):
  `apps/web/e2e-viewport/tap-targets.ts:43-45` reads: *"`ui.css:1606-1616` states the whole rule in one sentence: *\"Dense in-list controls get 24, standalone controls get 44 — the same call `/help`'s table-of-contents links got.\"*"* — **the sentence is at `ui.css:1662-1663`.** Lines 1606-1616 hold an unrelated paragraph about an attention-strip `border-left` marker being removed as a design choice, and it *resolves* as a substantive, plausible-looking block.
JUDGE'S NOTE: PARTIAL per verifier chunk01 (line opened by the verifier, not the judge): Core exact; all three ranges opened. PARTIAL for its own remedy citation: it attributes 'resolve that paragraph by CONTENT' to test-cases/16-remaining-doors.md:19, and that string is absent from that
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `I4: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-I4 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-I5  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 194

```
TASK T-I5 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 194/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec1, docs/lanes/review-ui-exec1.md:167, 14 lines — read the whole section first):
  I5 — **MINOR** — My own live handoff carries two position blocks that contradict each other, and the pointer that found it is itself stale
WHAT IS WRONG (the reviewer's words):
  `docs/lanes/executor-state.md` (exec 1's handoff — **mine**) states the id block twice, differently.
THE JUDGE'S LINE (the ruling rests on this; open it):
  docs/lanes/executor-state.md:65 and :27 — :65 'exec 1's next free ids are **`16.63`-`16.80`**. The table in `test-cases/16-remaining-doors.md` says so.'
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  One position block per fact — the older subtask-affordance block should carry a forward pointer to the current block rather than restating the allocation. And any `file:line` citation into a file that grows should name the **string** to find, not the line (`test-cases/16:19`'s own rule elsewhere: *"resolve that paragraph by CONTENT"*). This finding is mine to own: line 65 is stale because I edited the newer block and not the older one.
HOW IT WAS MEASURED (reproduce this before and after):
  - `executor-state.md:65`: *"exec 1's next free ids are **`16.63`–`16.80`**. The table in `test-cases/16-remaining-doors.md` says so."* - `executor-state.md:27` (the newer block): *"THE CONTROLLER REALLOCATED `16.72`–`16.80` TO EXEC 2 (2026-09-21) … **Exec 1 has NO free ids and must ASK before minting.**"* - `test-cases/16-remaining-doors.md:16` says `16.63`–`16.71`. So line 65 **refutes itself at the very line it cites**, which is the defect `test-cases/16-remaining-doors.md:19` named — **and …
JUDGE'S NOTE: PARTIAL per verifier chunk01 (line opened by the verifier, not the judge): Measured in the ctl worktree at d3772072; all four cited lines resolve at the cited numbers and :31 does not hold the sentence. PARTIAL for the same misattribution as I4: it quotes 'resolve that parag
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `I5: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-I5 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P25  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 195

```
TASK T-P25 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 195/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:678, 17 lines — read the whole section first):
  P25 — **MINOR** ⚠ **r2 NEW** — Three live files cite the docblock of a component that was deleted, and one of them is an instrument
WHAT IS WRONG (the reviewer's words):
  `apps/web/src/back-button.tsx` no longer exists. Three files in the product still cite its docblock — including `apps/web/e2e-viewport/viewports.ts`, which the viewport suite loads.
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/e2e-viewport/viewports.ts:167 — * nor `apps/web/src/back-button.tsx` was touched by that task, so the Back
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Name the *reason* rather than the file — *"these pages are reached from the sign-in card's legal line, and the fallback link points at the same route, so a reader with no history still has a destination"* — which is what all three sentences actually mean and needs no file to resolve. Or keep a one-line tombstone in `legal-nav.tsx`'s own docblock recording that `BackButton` was removed and why, since that file *is* the chrome those pages now use.
HOW IT WAS MEASURED (reproduce this before and after):
  - `find . -name 'back-button*' -not -path '*/node_modules/*' -not -path '*/.next/*'` → **no matches**. The file is gone, not moved. - Deleted by **`17c8345c`** — *"Step 2c-2: the catalogue and Features.md, **and the dead component the port orphaned**"* — a commit whose own subject says the removal was deliberate. - **Three live citations, each read at its line:** 1. `apps/web/src/legal-nav.tsx:28` (product source): *"these pages are reached from the sign-in card's legal line …
JUDGE'S NOTE: VALID per verifier chunk04 (line opened by the verifier, not the judge): All three cited lines opened, each deferring to back-button.tsx's docblock (legal-nav.tsx:28, viewports.ts:167, not-found-and-legal.test.tsx:217). CONTROL: the grep also found globals.css:2177, a tomb
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `P25: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P25 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P26  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 196

```
TASK T-P26 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 196/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: see files
FINDING (exec1, docs/lanes/review-ui-exec1.md:696, 62 lines — read the whole section first):
  P26 — **IMPORTANT** ⚠ **r2 NEW** — The prototype-delta document is stale in BOTH of its halves: every numbered queue row is closed, and its per-screen gap claims no longer describe the product
WHAT IS WRONG (the reviewer's words):
  `docs/design/prototype-delta-2026-09-18.md` is this project's prototype-provenance authority. **It has two halves and both are stale:** an ordered queue of 11 items, and 25 per-screen sections each asserting the *"Product gap (new prototype → product)"*. **The queue half is closed in full** — see the table below. **The per-screen half is stale too, in two of the five sections I checked**, and that check was prompted by the queue's result rather than planned.
THE JUDGE'S LINE (the ruling rests on this; open it):
  docs/design/prototype-delta-2026-09-18.md:101 — | **5** | `isTypeEditor` | **port** | M | ...**blocked**: field `required` toggle is a schema gap needing a ru
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Mark a closed row in place — `✅ closed by #447` is a two-word edit to a line the closing commit already had open, and it is the "correct the sentence rather than delete it" discipline this document uses everywhere else. And name the string to find rather than a bare `:NNN`: *"asserts `surfaceSunken` is `#ede4db`"* survives a 200-line drift; `:1939` does not.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — each row re-derived, with the source of the answer named.**
JUDGE'S NOTE: PARTIAL per verifier chunk04 (line opened by the verifier, not the judge): Sample 13 sub-claims, all reproduce (settings nav 3; markAllRead inbox/page.tsx:427; ui.css:2375-2387, responsive.spec.ts:1939, ui.css:3440 drifted; mappers.ts:405-408 unrelated). PARTIAL: the held gr
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `P26: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P26 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P29  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 198

```
TASK T-P29 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 198/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/web
FINDING (exec1, docs/lanes/review-ui-exec1.md:797, 24 lines — read the whole section first):
  P29 — **MINOR** ⚠ **r2 NEW** — The mock-only suite claims each stub carries its server `file:line`; two of ten carry the file and no line, and they are the two whose contracts changed
WHAT IS WRONG (the reviewer's words):
  `apps/web/e2e/smoke.spec.ts`'s docblock states the rule its own design rests on: *"Each entry below therefore carries the `apps/server/src/...:line` that registers it, and **every one of those was re-derived from the shipped source** rather than copied from the plan."* **Eight of the ten stubs carry a line number. Two carry the file and not the line.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  apps/web/e2e/smoke.spec.ts:15 — * for. Each entry below therefore carries the `apps/server/src/...:line` that
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  In `apps/web/e2e/smoke.spec.ts`, give the two line-less stubs the `apps/server/src/...:line` that registers their route today (open the route file, read the line number), and correct the drift prose at `:21-22` and the stale note at `:186` so the docblock's rule ('every stub carries file:line, re-derived from shipped source') is true of all ten.
HOW IT WAS MEASURED (reproduce this before and after):
  **MEASUREMENT — every server citation in the file, in order:** ``` 112 apps/server/src/auth/routes.ts:76 (SESSION stub) 115 apps/server/src/routes/board.ts:286 (board) 118 apps/server/src/routes/builder-reads.ts:547 (workflow builder) 133 apps/server/src/routes/list.ts:480 (tickets*) 142 apps/server/src/routes/attention.ts:328 (attention) 147 apps/server/src/routes/preferences.ts:97 (preferences) 152 apps/server/src/routes/workspaces.ts ← NO LINE → the /v1/me/workspaces stub at :177 169 …
JUDGE'S NOTE: VALID per verifier chunk04 (line opened by the verifier, not the judge): Count reproduces exactly: 8 of 10 carry a line; both line-less lines opened. Drift prose at :21-22 confirmed and the "STALE FOR A DAY...NO GATE" note (:186) sits in the /v1/me/workspaces page.route bl
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `P29: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P29 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P32  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 200

```
TASK T-P32 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 200/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/editor
FINDING (exec1, docs/lanes/review-ui-exec1.md:897, 21 lines — read the whole section first):
  P32 — **MINOR** ⚠ **r2 NEW** — Why a control is disabled is put in `title` ON the disabled button, where it cannot be reached
WHAT IS WRONG (the reviewer's words):
  Three components explain a disabled control through the `title` attribute **on the disabled `<button>` itself**. A `disabled` button is removed from the focus order, so a keyboard user cannot land on it, and assistive technology does not reach `title` on an element the user cannot focus. **The explanation therefore reaches only a mouse user who hovers** — and it reaches them only if their browser shows tooltips on disabled controls, which several do not.
THE JUDGE'S LINE (the ruling rests on this; open it):
  packages/editor/src/components/TicketEditorSlot.tsx:220 — title={disabledReason}
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Either keep the control enabled and explain on activation, or move the reason into `aria-describedby` pointing at a visible or visually-hidden node — `Sheet`'s and `Dialog`'s own dismiss controls already show the house can attach a distinct accessible string to a control — or render the reason beside it, which is the pattern `publish-controls.tsx:112` already assumes when it says *"below"*.
HOW IT WAS MEASURED (reproduce this before and after):
  1. **`packages/editor/src/components/TicketEditorSlot.tsx` — `disabledReason` occurs four times in the file and NOWHERE ELSE**, by exhaustive grep: declared at **`:146-150`**, consumed by `canSubmit` at **`:151`**, and used at **`:219`** (`disabled={submitting || !canSubmit}`) and **`:220`** (`title={disabledReason}`). **There is no visible render of it.** Its two values are whole-surface explanations, not button hints: *"Read-only: this document cannot be edited here."* and *"This editor was …
JUDGE'S NOTE: VALID per verifier chunk05 (line opened by the verifier, not the judge): All 3 sites opened; disabled+title adjacency and type=button + visible text exact at each; no visible render of disabledReason (the repo-wide grep returns hits, so it traverses). Nit not moving the ve
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `P32: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P32 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

#### T-P33  ·  haiku  ·  MINOR  ·  ~0.25 h  ·  rank 201

```
TASK T-P33 — batch B18 (Prose drift sweep — docblocks, catalogue markers, counts) — model haiku — backend deepseek — effort ~0.25 h — judged MINOR — rank 201/231
Worktree: /Users/kiro/my_projects/gisik-nokma-exec4   Branch: the batch branch (§1)   Node: 22   Package: @gisik-nokma/domain
FINDING (exec1, docs/lanes/review-ui-exec1.md:919, 21 lines — read the whole section first):
  P33 — **MINOR** ⚠ **r2 NEW** — The export draws a timestamp on every inbox row; the product draws none, and no client in the chain reads the field it would need
WHAT IS WRONG (the reviewer's words):
  The export's inbox row renders **four** things per notification — a glyph, a headline, a body line, and **a time**. The product's row renders **three**: glyph, headline, body — then the unread dot. **There is no timestamp, and nothing records its absence.**
THE JUDGE'S LINE (the ruling rests on this; open it):
  prototype-2026-09-20/Gisik Nokma - Desktop.dc.html:633 — <span style="font-size:13px;line-height:18px;color:var(--label2)">{{ n.time }}</span>
FIX (the reviewer's own remedy — follow it unless the code has moved; then do the equivalent and say so):
  Render `createdAt` at `.gn-inbox__body`'s sibling in the row's `gn-inbox__text`, formatted through the product's own IST helpers — the discipline `apps/desktop/src/app.tsx:126-133` already states for every timestamp this product prints (*"any timestamp this shell prints goes through `formatIstInstant` … Never `toLocaleDateString()`"*) — **or record the omission**, which is the cheaper half and is what §5's other four divergences all did.
HOW IT WAS MEASURED (reproduce this before and after):
  1. **The export draws it.** `Gisik Nokma - Desktop.dc.html` (sha256 `3d142d46…`), the `isInbox` block at **`:606-649`**; the time span is **`:634`**: `<span style="font-size:13px;line-height:18px;color:var(--label2)">{{ n.time }}</span>`, sitting between the body span and the row's read-toggle. 2. **The product's row is `inbox-view.tsx:84-108`, read in full** — `gn-inbox__glyph`, then `gn-inbox__text` (holding `gn-inbox__headline` and `gn-inbox__body`), then `{!notification.read && <span …
JUDGE'S NOTE: VALID per verifier chunk05 (line opened by the verifier, not the judge): sha control proves I read the same bytes. isInbox opens :606. Row read in full at inbox-view.tsx:84-108 (glyph 84, dot 108): no time element. Ruling sweep for time|timestamp over the inbox chain: 0 hi
DONE WHEN: The sentence, count or marker is corrected at the cited line; `pnpm check:citations`, `pnpm check:help` (if help) and `node scripts/check-case-ids.mjs` (if test-cases) are green; no product test is needed. Never renumber a case; a struck case keeps its number.
COMMIT: `P33: <one line>` + body (test name / sentence fixed) + Co-Authored-By line. Then append to docs/lanes/release-2026-09-22-progress.md: | T-P33 | done | <sha> | <test> |
RULES: §0 of docs/lanes/release-2026-09-22-plan.md — never main, one package suite at a time to a log file, Features.md + test-cases in the same commit, no AskUserQuestion, no docker compose.
```

## §7 — WHEN EVERYTHING IS MERGED

The controller rebuilds the dev stack from `main` (`git pull --ff-only` in the primary checkout, then `pnpm dev:stack:rebuild`, about 14 minutes) and smokes `/help`, `/sign-in`, a project board and a ticket sheet. The driver's last act is a final line in the progress file: `ALL BATCHES OPEN — <date time> — <n> done, <n> blocked, <n> needs-owner`.
