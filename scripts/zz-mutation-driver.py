#!/usr/bin/env python3
"""Applies one mutation, runs the focused case file, reports WHICH case ids
reddened, and restores from the commit.

⚠ THIS IS COMMITTED ON PURPOSE, and the reason is findability rather than
permanence: it was written as a throwaway and a machine-restart checkpoint asked
for it to be either deleted or committed, and committing it is what lets the next
lane re-run the fifteen measurements recorded in
`test-cases/13-owner-requests-and-backlog.md` (and the two the checkpoint
deferred, which are in here too, re-anchored). **It resolves its own checkout from
`__file__`, so it operates on whichever copy it lives in** — run it from another
checkout and it mutates and restores THAT checkout, never this one. It is wired
into no `package.json` task. `zz-` marks it scratch.

⚠ IT REQUIRES A CLEAN, COMMITTED TREE, AND THAT IS NOW ENFORCED RATHER THAN ASKED
FOR. Its restore is `git checkout --`, which reverts a file to HEAD and therefore
DESTROYS uncommitted work SILENTLY, leaving a clean `git status` that reads like
success. This was a docstring once and that was the defect: the version that
shipped with PR #699 carried an ABSOLUTE repo root, so a run from any other
checkout would have restored the WRONG worktree — destroying whatever was
uncommitted there while the operator watched this one stay clean. `refuse_if_dirty`
runs before any mutation is applied and exits non-zero naming the files; the root
is derived from `__file__` so there is no longer a wrong tree to reach.

⚠ AND A MUTATION THAT DOES NOT APPLY IS NOT A RESULT. Two of the first attempts
were mis-designed: one cut a condition mid-line and produced a source that does
not PARSE (vitest never ran the file, printed no summary, and a
`failed`-only reader would have called that a SURVIVOR); the other renamed BOTH
sides of the `aria-controls`/`id` pair, so the property under test was never
disturbed and the file stayed green — a mutation that mutated nothing. The anchors
below are the corrected ones for both, and `suite_counts` deliberately reports a
missing summary as a NON-RESULT rather than as a pass.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOARD = ROOT / "packages/app-core/src/views/board.tsx"
STORE = ROOT / "packages/app-core/src/preferences/workflow-collapse.ts"
CSS = ROOT / "packages/ui/src/ui.css"
TEST = ROOT / "packages/app-core/test/views/board-workflow-collapse.test.tsx"

# The three files `restore()` reverts, as ROOT-relative paths. A second constant
# rather than reusing the absolute BOARD/STORE/CSS handles, deliberately: git is
# asked about these by path, and `--porcelain` matches a repository-relative one.
RESTORED_PATHS = [
    "packages/app-core/src/views/board.tsx",
    "packages/app-core/src/preferences/workflow-collapse.ts",
    "packages/ui/src/ui.css",
]

# name, file, old, new, extra test path args
MUTATIONS = [
    ("default-lone-term-dropped", BOARD,
     "board.groups.length > 1 && groupIsEmpty(group)", "groupIsEmpty(group)", []),
    ("groupIsEmpty-always-false", BOARD,
     "return group.columns.every((column) => column.cards.length === 0);", "return false;", []),
    ("hidden-attribute-never-written", BOARD,
     "hidden={!expanded}", "hidden={false}", []),
    ("aria-expanded-pinned-true", BOARD,
     "aria-expanded={expanded}", "aria-expanded={true}", []),
    ("autoexpand-ignores-the-persons-choice", BOARD,
     "        !groupIsEmpty(group) &&\n        !Object.hasOwn(groupChoices, key)\n",
     "        !groupIsEmpty(group)\n", []),
    ("autoexpand-previous-guard-dropped", BOARD,
     "wasCollapsedByDefault &&", "true &&", []),
    ("toggle-does-not-write-through", BOARD,
     "    setGroupChoices(next);\n    rememberWorkflowCollapse(currentUserId ?? '', board.projectId, next);",
     "    setGroupChoices(next);", []),
    ("read-ignores-the-stored-user", STORE,
     "  if (storedUserId !== userId) return NO_COLLAPSE_CHOICES;\n", "", []),
    ("caret-typed-into-the-text-node", BOARD,
     '<span className="gn-board__workflow-caret" aria-hidden="true" />',
     '<span className="gn-board__workflow-caret" aria-hidden="true">{"▸"}</span>', []),
    ("toggle-loses-type-button", BOARD,
     '          <button\n            type="button"\n            className="gn-board__workflow-toggle"',
     '          <button\n            type="submit"\n            className="gn-board__workflow-toggle"', []),
    ("aria-controls-removed", BOARD,
     "            aria-controls={railId}\n", "", []),
    ("rail-hidden-rule-deleted", CSS,
     ".gn-board__rail[hidden] { display: none; }", "", ["packages/ui"]),
    ("caret-glyphs-deleted", CSS,
     ".gn-board__workflow-caret::after { content: '▸'; }",
     ".gn-board__workflow-caret::after { content: none; }", []),
    ("default-ignores-emptiness", BOARD,
     "board.groups.length > 1 && groupIsEmpty(group)", "board.groups.length > 1", []),
    ("rail-id-disagrees-with-aria-controls", BOARD,
     '<div className="gn-board__rail" id={railId} hidden={!expanded}>',
     '<div className="gn-board__rail" id={`${railId}-other`} hidden={!expanded}>', []),
]


def run(cmd, cwd=ROOT, timeout=600):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def restore():
    run(["git", "checkout", "--", *RESTORED_PATHS])


def refuse_if_dirty():
    """Refuse to run unless the files `restore()` reverts are CLEAN in ROOT.

    A PRECONDITION, NOT A DOCSTRING, and the distinction is the whole fix. The
    restore is `git checkout --`, which reverts a file to HEAD and therefore
    DESTROYS uncommitted work SILENTLY — the tree it leaves is clean, so the
    operation reports success. A docstring asking the operator to commit first
    is a check that cannot fail: nothing reads it at runtime, and the failure it
    describes looks exactly like success.

    Asked of GIT rather than by comparing mtimes or bytes: `--porcelain` answers
    "does this differ from HEAD", which is precisely the set the restore would
    discard. A merely-touched file whose content matches is correctly quiet,
    because reverting it would lose nothing.
    """
    status = run(["git", "status", "--porcelain", "--", *RESTORED_PATHS])
    if status.returncode != 0:
        # Do NOT proceed on an unanswerable question. A git that failed (not a
        # repository, a broken index) cannot tell us the tree is clean, and
        # treating "no output" as "clean" is how a dirty tree gets restored.
        sys.stderr.write(
            f"REFUSING: `git status` failed in {ROOT} (exit {status.returncode}): "
            f"{status.stderr.strip()}\n"
        )
        sys.exit(3)
    dirty = status.stdout.strip()
    if dirty:
        sys.stderr.write(
            "REFUSING: these files differ from HEAD, and this script's restore is "
            "`git checkout --`, which would DISCARD the changes below silently:\n"
            f"{dirty}\n"
            "Commit them, or set them aside, before running a mutation.\n"
        )
        sys.exit(2)


def reddened_cases(log: str) -> list[str]:
    """Case ids from FAIL lines, read AFTER the ' > ' separator.

    A vitest fail line's first id can belong to the describe; parsing after the
    separator and taking the first 13.14xx in what remains is what this tree's
    own mutation-collateral note prescribes.
    """
    found = []
    for line in log.splitlines():
        if not line.strip().startswith("FAIL "):
            continue
        tail = line.split(" > ", 1)[1] if " > " in line else line
        m = re.search(r"\b(13\.14\d\d)\b", tail)
        if m and m.group(1) not in found:
            found.append(m.group(1))
    return sorted(found)


def suite_counts(log: str) -> str:
    for line in log.splitlines():
        if "Tests " in line and ("failed" in line or "passed" in line):
            return line.strip()
    return "(no summary line — the run did not finish: treat as a NON-RESULT)"


def main():
    # FIRST, before `only` is even read and long before any mutation is applied —
    # see `refuse_if_dirty`, which owns the whole argument.
    refuse_if_dirty()
    only = [w for w in sys.argv[1].split(",") if w] if len(sys.argv) > 1 else None
    out = []
    for name, path, old, new, extra in MUTATIONS:
        if only and not any(w in name for w in only):
            continue
        text = path.read_text(encoding="utf-8")
        if text.count(old) != 1:
            out.append((name, f"ANCHOR COUNT {text.count(old)} — mutation NOT applied, not a result", []))
            continue
        path.write_text(text.replace(old, new, 1), encoding="utf-8")
        try:
            targets = ["board-workflow-collapse"]
            logs = []
            for target in targets:
                r = run(["./node_modules/.bin/vitest", "run", "--no-file-parallelism", target],
                        cwd=ROOT / "packages/app-core")
                logs.append(r.stdout + r.stderr)
            for pkg in extra:
                r = run(["./node_modules/.bin/vitest", "run", "--no-file-parallelism"],
                        cwd=ROOT / pkg)
                logs.append(r.stdout + r.stderr)
            log = "\n".join(logs)
            out.append((name, suite_counts(log), reddened_cases(log)))
        finally:
            restore()
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
