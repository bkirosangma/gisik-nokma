#!/bin/bash
# Lane E's full gate. A THIN WRAPPER over locked-test.sh, deliberately — there is
# one lock implementation in this lane and this is not it. Two copies of a lock
# is two things to keep in step, and the one that drifts is the one nobody reads.
#
#   gate.sh <logfile>
#
# Run it with run_in_background:true. Never inline its body: a lock acquired in
# one Bash tool call and used in another records a `$$` that dies immediately.
#
# --concurrency=1 (was 2) per the cross-lane protocol fix of 2026-09-06: five
# lanes on one 16 GB box drove free memory to ~66 MB and swap to 65%. The gate is
# slower and it finishes.
set -u
OUT="${1:?usage: gate.sh <logfile>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# WHICH TREE THIS GATES. Until v3.2 this was hard-coded to Lane E's worktree,
# and these files are copied between lanes: a peer that copied the FILE gated
# Lane E's tree and read Lane E's `check:env` exit while believing it had
# measured its own (Lane B, 2026-09-06). A wrong tree here does not fail — it
# returns a well-formed green about somebody else's work.
#
# Resolution order, and it FAILS LOUDLY rather than falling back to anyone's
# tree: $GATE_REPO if set (for a copy run from a scratchpad, where nothing
# relative to $0 can find the repo), else the caller's cwd. A git WORKTREE has
# `.git` as a FILE, not a directory, so both forms are accepted.
REPO="${GATE_REPO:-$PWD}"
if [ ! -e "$REPO/.git" ]; then
  echo "FATAL: '$REPO' is not the root of a git worktree." >&2
  echo "Run this from your worktree root, or set GATE_REPO=/path/to/your/worktree." >&2
  exit 3
fi

cd "$REPO" || exit 3
exec bash "$HERE/locked-test.sh" "$OUT" \
  pnpm turbo run build test typecheck --force --concurrency=1
