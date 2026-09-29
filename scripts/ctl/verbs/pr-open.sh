#!/usr/bin/env bash
# ctl pr open <branch> --title T --body FILE [--base main] [--require-checked] — push as its own step, verify, open, verify head and body.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
branch="${CTL_ARGS[0]:-}"; title=""; body=""; base="main"; require=0
set -- "${CTL_ARGS[@]:1}"
while [ $# -gt 0 ]; do case "$1" in --title) title="$2"; shift 2;; --body) body="$2"; shift 2;; --base) base="$2"; shift 2;; --require-checked) require=1; shift;; *) ctl_fail pr-open "unknown arg $1";; esac; done
[ -n "$branch" ] && [ -n "$title" ] && [ -f "$body" ] || ctl_fail pr-open "usage: ctl pr open <branch> --title T --body FILE"
[ "$branch" != "main" ] || ctl_fail pr-open "refusing to open a PR from main"
cd "$CTL_REPO" || exit 1
[ "$(/usr/bin/git branch --show-current)" = "$branch" ] || ctl_fail pr-open "checked-out branch is not $branch"
[ -z "$(/usr/bin/git status --porcelain)" ] || ctl_fail pr-open "tree is dirty"
head="$(/usr/bin/git rev-parse HEAD)"
# The marker must have been earned against the SAME base this PR targets: a check against release/x never admits a PR to main.
if [ "$require" = 1 ]; then ctl_marker_has "$CTL_REPO" "$(ctl_marker_kind checked "$base")" "$head" || ctl_fail pr-open "no checked marker for $head — run: ctl check-pr $branch$([ "$base" = main ] || echo " --base $base")"; fi
ctl_run /usr/bin/git push -u origin "$branch" || ctl_fail pr-open "push rejected"
if [ "$CTL_DRY_RUN" = 1 ]; then ctl_ok pr-open "dry-run"; fi
remote="$(/usr/bin/git ls-remote origin "refs/heads/$branch" | cut -f1)"
[ "$remote" = "$head" ] || ctl_fail pr-open "remote $remote != local $head after push"
gh pr create --base "$base" --head "$branch" --title "$title" --body-file "$body" > "$(ctl_log pr-open)" 2>&1 || ctl_fail pr-open "gh pr create failed"
n="$(gh pr view "$branch" --json number --jq .number)"; h="$(gh pr view "$branch" --json headRefOid --jq .headRefOid)"
[ "$h" = "$head" ] || ctl_fail pr-open "PR #$n head $h != local $head"
first="$(head -1 "$body")"; got="$(gh pr view "$n" --json body --jq .body | head -1)"
[ "$got" = "$first" ] || ctl_fail pr-open "PR #$n body first line differs from $body"
ctl_ok pr-open "#$n head ${head:0:12} base $base"
