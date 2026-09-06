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
REPO=/Users/kiro/my_projects/gisik-nokma-lanes/lane5-plan11

cd "$REPO" || exit 3
exec bash "$HERE/locked-test.sh" "$OUT" \
  pnpm turbo run build test typecheck --force --concurrency=1
