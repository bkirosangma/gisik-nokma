# Wave 1 lane ledgers — rescued 2026-08-31

These are the `.superpowers/sdd/` task reports and progress ledgers from the three Wave 1
lanes that had them, copied verbatim out of their worktrees when Wave 1 was folded back
into a single serial execution.

**Why they are here.** They were never tracked. `.superpowers` is not in `.gitignore` — they
were simply never `git add`ed, so 64 files carrying every mutation this project has run,
every ruling with its cost-if-wrong, and each lane's task-by-task outcome existed only on
local disk inside worktrees that were about to be removed.

**What they are good for, and what they are not.**

- **Good for:** the ruling record, mutation evidence, task outcomes, the reasoning behind
  decisions a serial resumer will otherwise re-litigate.
- **NOT good for:** commit addresses. Lane 1 measured 17 of 32 cited shas orphaned after
  four rebases; lane 2, 10 of 25. Orphaned shas still `git cat-file` clean and `git show`
  returns pre-rebase content, so they read as valid. Use `git log` and the merged-PR list
  as authoritative, and treat every sha below as narrative.

`lane4-periphery` has no directory here because it never kept one.
