#!/usr/bin/env bash
# ctl check-pr <branch> [--plan FILE] [--body FILE] [--base <branch>] — mechanical batch-PR verification; writes .git/ctl/checked-<sha> when green.
# --base (default main; main or release/<name> only) is the branch the diff and the commit list are taken against (origin/<base>);
# a release base writes checked.release+<name>-<sha>, which admits only a PR to that base (ctl pr open --base).
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
branch="${CTL_ARGS[0]:-}"; plan="docs/lanes/release-2026-09-22-plan.md"; body=""; CTL_BASE=main
set -- "${CTL_ARGS[@]:1}"
while [ $# -gt 0 ]; do case "$1" in --plan) plan="$2"; shift 2;; --body) body="$2"; shift 2;; --base) ctl_take_base check-pr "${2:-}"; shift 2;; *) ctl_fail check-pr "unknown arg $1";; esac; done
[ -n "$branch" ] || ctl_fail check-pr "usage: ctl check-pr <branch> [--plan FILE] [--body FILE] [--base <branch>]"
cd "$CTL_REPO" || exit 1
# HEAD names the checked-out commit whatever the branch (a detached worktree has none); any other name must be the current branch.
[ "$branch" = HEAD ] || [ "$(/usr/bin/git branch --show-current)" = "$branch" ] || ctl_fail check-pr "checked-out branch is not $branch"
[ -z "$(/usr/bin/git status --porcelain)" ] || ctl_fail check-pr "tree is dirty"
/usr/bin/git fetch -q origin
log="$(ctl_log check-pr)"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: check-pr.py $CTL_REPO $plan (base origin/$CTL_BASE); ctl checks"; ctl_ok check-pr "dry-run"; fi
python3 "$(dirname "$0")/check-pr.py" "$CTL_REPO" "$plan" docs/lanes/release-2026-09-22-progress.md "$body" "$CTL_BASE" | tee -a "$log"; rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] || ctl_fail check-pr "conditions failed (log $log)"
bash "$(dirname "$0")/checks.sh" --repo "$CTL_REPO" >> "$log" 2>&1 || ctl_fail check-pr "checks red (log $log)"
sha="$(/usr/bin/git rev-parse HEAD)"; ctl_marker_write "$CTL_REPO" "$(ctl_marker_kind checked "$CTL_BASE")" "$sha" "$log"
ctl_ok check-pr "$branch ${sha:0:12} checked (log $log)"
