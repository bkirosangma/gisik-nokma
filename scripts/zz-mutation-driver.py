#!/usr/bin/env python3
"""SCRATCH, deleted before commit. Applies one mutation, runs the focused case
file, reports WHICH case ids reddened, and restores from the commit.

The tree is clean and committed before this runs (b8299931), so `git checkout --`
is a restore to a known commit rather than a revert of uncommitted work.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path("/Users/kiro/my_projects/gisik-nokma-task1")
BOARD = ROOT / "packages/app-core/src/views/board.tsx"
STORE = ROOT / "packages/app-core/src/preferences/workflow-collapse.ts"
CSS = ROOT / "packages/ui/src/ui.css"
TEST = ROOT / "packages/app-core/test/views/board-workflow-collapse.test.tsx"

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
    run(["git", "checkout", "--", "packages/app-core/src/views/board.tsx",
         "packages/app-core/src/preferences/workflow-collapse.ts", "packages/ui/src/ui.css"])


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
