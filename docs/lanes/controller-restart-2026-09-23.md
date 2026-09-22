# ▣ RESTART CARD — controller session, 2026-09-23 (Claude Code restart for an update)

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
