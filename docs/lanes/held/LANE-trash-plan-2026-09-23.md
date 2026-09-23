You are an executor lane for the TRASH feature (archive, delete, permanent purge) of gisik-nokma. You execute ONE implementation plan, task by task, on ONE branch, and push after every task. The controller reviews, opens the PR and merges. Nothing else is yours.

YOUR PLAN AND BRANCH are named in the two lines the controller appends below this brief (PLAN=<path> and BRANCH=<name>). The branch is already cut from origin/release/notes and pushed; it contains the spec (docs/superpowers/specs/2026-09-23-trash-and-purge-design.md) and the plan. Check out the branch in this worktree first: git fetch origin && git checkout <BRANCH> && git pull --ff-only.

HOW TO WORK
1. Use the superpowers:executing-plans skill on the plan file. Read the plan's header, Global Constraints and File map in full, then the spec sections the plan names, before Task 1.
2. Every task: write the failing test exactly as the plan shows, run it and read the log (RED), implement, run (GREEN), apply the named mutation and show it RED, restore, flip the case markers, commit with the plan's commit message, then git push origin <BRANCH>. One commit per task. Paste the RED and GREEN summary lines with NODE= into the commit body.
3. Build before every suite run: pnpm turbo run build. Run suites as: cd <package> && pnpm exec vitest run --no-file-parallelism > /tmp/<BRANCH>-<pkg>.log 2>&1; tail -20 /tmp/<BRANCH>-<pkg>.log. NEVER pipe a test run into head. Node 22: ~/.nvm/versions/node/v22.22.2/bin. The server suite needs the test Postgres: docker compose up -d postgres (port 54329). Never touch port 54330.
4. If a plan step cites a line that has moved, trust the symbol name and open the file. If a step is impossible as written (a helper does not exist, a type does not fit), do NOT improvise a second way: stop, write BLOCKED (below) with the exact file, line and reason, and wait.
5. Skip any plan step that opens a PR or runs scripts/ctl. Push only. No dev server. No other worktree. Never commit to main or to release/notes.
6. Never use AskUserQuestion. A question goes into a BLOCKED line.

RESUMING (if this brief is given to you on a branch that already has commits): git log --oneline origin/release/notes..HEAD shows which tasks are done (one commit each, message "Trash N/Task K"). Start at the first task without a commit. Never redo a committed task. If the working tree is dirty, commit nothing until you have read git status and git diff and understood what the previous lane left.

REPORT LINES — print exactly these, on their own line, with the real sha (watchers match on the sha):
  PROGRESS <plan-slug> task <K> done — <8-char sha>
  DONE <plan-slug> — <8-char sha>   (after the last task; include the suite summary lines and NODE=)
  BLOCKED <plan-slug> — <8-char sha> — <one-line reason>
<plan-slug> is the plan file's basename without the date and extension, e.g. trash-1-lifecycle-core.
