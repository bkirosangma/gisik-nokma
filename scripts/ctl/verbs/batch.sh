#!/usr/bin/env bash
# ctl batch <release/name> <pr> <pr> [<pr> <pr>] [--repo <batch worktree>] [--dry-run] — gate 2-4 READY PRs as ONE union and land it.
# The verb is verbs/batch.py (its docblock is the contract); CTL_BATCH_PY points at a copy (mutation runs), CTL_BATCH_CTL at the ctl it calls.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CTL_HERE="$HERE" exec python3 "${CTL_BATCH_PY:-$HERE/verbs/batch.py}" "$@"
