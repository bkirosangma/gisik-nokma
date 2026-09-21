#!/usr/bin/env bash
# ctl check-pr <branch> [--plan FILE] [--body FILE] — mechanical batch-PR verification; writes .git/ctl/checked-<sha> when green.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
branch="${CTL_ARGS[0]:-}"; plan="docs/lanes/release-2026-09-22-plan.md"; body=""
set -- "${CTL_ARGS[@]:1}"
while [ $# -gt 0 ]; do case "$1" in --plan) plan="$2"; shift 2;; --body) body="$2"; shift 2;; *) ctl_fail check-pr "unknown arg $1";; esac; done
[ -n "$branch" ] || ctl_fail check-pr "usage: ctl check-pr <branch> [--plan FILE] [--body FILE]"
cd "$CTL_REPO" || exit 1
[ "$(/usr/bin/git branch --show-current)" = "$branch" ] || ctl_fail check-pr "checked-out branch is not $branch"
[ -z "$(/usr/bin/git status --porcelain)" ] || ctl_fail check-pr "tree is dirty"
/usr/bin/git fetch -q origin
log="$(ctl_log check-pr)"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: check-pr.py $CTL_REPO $plan; ctl checks"; ctl_ok check-pr "dry-run"; fi
python3 "$(dirname "$0")/check-pr.py" "$CTL_REPO" "$plan" docs/lanes/release-2026-09-22-progress.md "$body" | tee -a "$log"; rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] || ctl_fail check-pr "conditions failed (log $log)"
bash "$(dirname "$0")/checks.sh" --repo "$CTL_REPO" >> "$log" 2>&1 || ctl_fail check-pr "checks red (log $log)"
sha="$(/usr/bin/git rev-parse HEAD)"; ctl_marker_write "$CTL_REPO" checked "$sha" "$log"
ctl_ok check-pr "$branch ${sha:0:12} checked (log $log)"
