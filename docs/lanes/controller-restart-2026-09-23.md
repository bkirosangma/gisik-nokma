# ▣ RESTART CARD — controller session, 2026-09-23 (Claude Code restart for an update)

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



Written before a deliberate restart of the CONTROLLER SESSION ONLY — not the machine, not the lanes. Lane
processes, worktrees and branches are untouched by it. Read this, then `docs/lanes/controller-state.md`'s own card only if
you need the older topology — most of what that card says about lanes and cycles predates this session.

## The one rule that changed everything, and is not in the old card

**A merge to `main` deploys to production.** `deploy/do/app.yaml` sets `deploy_on_push: true` against
`branch: main` on all three components. Work therefore integrates on **`release/2026-09-23`**, and the
release→`main` merge IS the release. See `CLAUDE.md`'s first rule — it is the authority, this is a pointer.

## State at the moment of restart

| thing | value |
|---|---|
| `origin/main` | **`59029e1c`** — UNMOVED all session. Nothing has deployed. |
| `origin/release/2026-09-23` | **`81096a6d`**, 20 commits ahead of `main` |
| primary checkout | `/Users/kiro/my_projects/gisik-nokma` on `release/2026-09-23` at `81096a6d`, clean |
| dev stack | built from the release branch (`ctl rebuild` reads the primary's CURRENT branch now, not `main`) |
| open PRs into `release/2026-09-23` | **none** |
| other open PR | **#698 `docs/notes-spec` → `release/notes`** — the OWNER's own, a Notes design spec on a DIFFERENT release branch. Not this branch's work and not the controller's to merge. |

## Landed on the release branch this session

`#694` stream multiplex · a typecheck hotfix for it · `#695` scope-note reserved row · `#696` New ticket
form (backlog switch + description + assignee) · `#697` My Work opens the sheet in place · plus
controller commits: the CI trigger change, the block allocations, the owner's rail-shift ruling, and two
defect fixes found by the owner in the assembled branch (below).

## In flight — ONE lane

**`gisik:1`**, worktree `/Users/kiro/my_projects/gisik-nokma-task1`, branch
`task/board-workflow-collapsible`, on `deepseek-flash`. Task: the board's workflow group becomes
collapsible; an empty one starts collapsed.

It was told to CHECKPOINT, then told to RESUME — the checkpoint order was over-scoped by the controller
(a Claude Code restart does not touch a lane) and is corrected in
`gisik-nokma-lanes/RESUME-board-lane-2026-09-23.md`. The checkpoint itself was kept because it was worth
having: commit `b8299931` plus `docs/lanes/board-workflow-collapsible-handoff.md`, in which the lane
caught and corrected its own catalogue carrying PREDICTED results as measured ones. **The lane is
CONTINUING.** If its PR is open when you wake, review and merge it under the standing authorization.

Its brief and TWO rulings, in order — read all three, the later ones overrule the earlier:

1. `BRIEF-board-workflow-collapsible-2026-09-23.md`
2. `RULING-board-workflow-collapsible-2026-09-23.md` — its **section 2 is SUPERSEDED**
3. `RULING-2-board-collapse-localstorage-2026-09-23.md` — persistence is **`window.localStorage`,
   user-keyed**, NOT the server preferences document. The owner corrected this mid-flight and the lane
   had already started the wrong (server) version and backed it out.

Owner's three rulings: a lone workflow starts UNCOLLAPSED even when empty; the choice persists
(localStorage); a collapsed-because-empty group AUTO-EXPANDS when a ticket arrives, and that persists.

## Standing authorizations in force

- **Reviews and merges INTO the release branch are autonomous** (owner, 2026-09-23: *"automatically take
  care of the reviews and merges"*). Review the diff against the brief, run the LOCAL battery yourself,
  merge. **This does NOT reach `main`.**
- **The release→`main` merge is the owner's word, per merge.** It was explicitly held twice this session.

## Traps this session paid for — do not re-learn them

- **CI has started no job since 2026-09-22 (account billing).** And `ci.yml` now filters `pull_request`
  on the BASE branch, so CI runs NOTHING on a dev PR by design. Every merge bar is a LOCAL run and must
  be reported as local. Never write "CI green".
- **`ctl restart` reports `FAIL … no backend line` when the lane launched fine.** Verify the seat from
  the pane's STATUS LINE, never the verb's verdict. `ctl dispatch` failing with "not submitted" usually
  means QUEUED — wait for the queue to drain, then grep the pane to confirm the text is in context.
- **`ctl land` / `ctl gate` / `ctl checks` read `origin/main`** and are wrong for a release-branch merge.
  Merge with a real `--no-ff` merge from a throwaway detached worktree, then verify by API
  (`state`, `baseRefName`, and reachability `ahead_by: 0`).
- **The ctl hook evaluates the TOOL's cwd, not your `cd`.** Pass `git -C <path>` so it resolves the real
  target; it also false-positives on `git merge-base` via its `merge\b` pattern.
- **Build AFTER your last edit.** A build that ran BEFORE an edit plus green vitest says nothing — vitest
  strips types without checking them. That shipped a type error into this branch once (caught by the
  Docker build, `ctl rebuild` rc=17). And a stale host `dist` has produced both a false red and a false
  green; `ctl rebuild` builds inside Docker and does NOT refresh the host `dist`.
- **`test-cases/13-hig-per-screen.md`'s block table conflicts on every lane merge** — lanes annotate
  their own row while the controller adds the next. It is always append-vs-append; keep BOTH.

## Owed work, named rather than forgotten

- **13.1385 has no automated arm.** The project-header flicker fix is witnessed only by a browser
  measurement. A jsdom arm is writable — render, toggle the switch, assert the New ticket button is still
  in the document — and would have caught the original defect.
- **13.1384's list door is not directly asserted.** The birth-assignee 500 fix is witnessed through the
  single read; the list door shares the same function but its own arm needs `seedWorkflowDef`.
- **`13.1401`** (from the My Work lane): a My Work deletion has no toast and no Undo. Marked ❌ owed; the
  manual now states the absence rather than promising the feature.
- **`MEMORY.md` is over its read limit** (~22 KB against 24.4 KB). When it crosses, sessions stop reading
  the index. Needs a curation pass, which is the owner's, not a lane's.
- The owner's `apps/web/e2e-stack/non-text-contrast-roster.json` is in **`stash@{0}`** and stays there by
  the owner's decision. Do not restore it: it is a partial sweep (`treeWasClean: false`, 4 elements
  examined against the committed 13) whose `belowCount: 0` reads as "all fixed" when it means "looked at
  less".
