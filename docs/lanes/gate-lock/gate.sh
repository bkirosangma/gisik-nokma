#!/bin/bash
# Lane E's full gate. A THIN WRAPPER over locked-test.sh, deliberately — there is
# one lock implementation in this lane and this is not it. Two copies of a lock
# is two things to keep in step, and the one that drifts is the one nobody reads.
#
#   GATE_MODE=fresh|cached gate.sh <logfile>
#
# Run it with run_in_background:true. Never inline its body: a lock acquired in
# one Bash tool call and used in another records a `$$` that dies immediately.
#
# TWO MODES (owner, 2026-10-02: "do the caching and whatever to run the gate faster").
#
#   fresh  (the default) — `--force --concurrency=1`: every task re-run, nothing
#          replayed from the turbo cache. This is the RELEASE gate (`ctl gate <sha>`,
#          before a merge to main) and the safety net that makes `cached` acceptable
#          below it. Unset GATE_MODE means fresh, so a hand-run of this file can
#          never silently pick the weaker mode.
#   cached — turbo's cache ON (no --force) and `--concurrency=2`: a task whose
#          inputs are unchanged replays its green log. This is a TASK LANDING
#          (`ctl gate <sha> --base release/<x>`). It is only as sound as turbo.json's
#          `inputs`; the cross-package readers are audited there, and
#          scripts/ctl/test/gate-cache.test.sh proves a changed reader input misses.
#
# fresh keeps --concurrency=1 per the cross-lane protocol fix of 2026-09-06: five
# lanes on one 16 GB box drove free memory to ~66 MB and swap to 65%. The gate is
# slower and it finishes. cached runs two at a time because most of its tasks are
# cache hits; the machine lock below still admits ONE gate at a time.
set -u
OUT="${1:?usage: GATE_MODE=fresh|cached gate.sh <logfile>}"
# Unset means fresh; set-but-empty is NOT unset (`-`, not `:-`) and falls to the refusal below.
MODE="${GATE_MODE-fresh}"
case "$MODE" in
  fresh)  TURBO_FLAGS=(--force --concurrency=1) ;;
  cached) TURBO_FLAGS=(--concurrency=2) ;;
  *) echo "FATAL: GATE_MODE='$MODE' is not fresh|cached — refusing rather than guessing a mode." >&2; exit 2 ;;
esac
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
# What actually runs is stated on the console, so the verb reads the mode from what RAN, not from what it asked for.
echo "GATE_MODE=$MODE TURBO_FLAGS=${TURBO_FLAGS[*]}"
exec bash "$HERE/locked-test.sh" "$OUT" \
  pnpm turbo run build test typecheck "${TURBO_FLAGS[@]}"
