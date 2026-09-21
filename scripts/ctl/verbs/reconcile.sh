#!/usr/bin/env bash
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
[ "$CTL_DRY_RUN" = 1 ] && { echo "DRY: reconcile.py $CTL_REPO"; ctl_ok reconcile "dry-run"; }
log="$(ctl_log reconcile)"
python3 "$(dirname "$0")/reconcile.py" "$CTL_REPO" | tee "$log"; rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] && ctl_ok reconcile "0 discrepancies (log $log)" || ctl_fail reconcile "discrepancies listed (log $log)"
