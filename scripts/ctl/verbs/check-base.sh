#!/usr/bin/env bash
# ctl check-base <branch> <stated-base> [--repo R] — is the base a REVIEW line (or a lane's DONE) states the base the branch was cut from?
# Planner ruling 2026-10-04 02:08 (the dispatcher's 01:36 flag: a branch cut from release/smoothness whose line said base=KG). Read-only.
# For the branch tip it takes the merge-base with the stated base (origin/<stated>), with origin/main and with every origin/release/*,
# and reads each merge-base's DEPTH (its ancestor count: a merge-base further along history is a base the branch was cut from more
# recently). Another ref whose merge-base is STRICTLY deeper than the stated base's is WRONG-BASE (exit 1); equal depths — a branch
# sitting exactly on a commit two releases share — are fine. The first build measured "commits behind" (rev-list tip..ref) as the
# ruling says; that flags every stale-but-correct branch whenever a younger release has fewer new commits than the stated one, so the
# decision is by merge-base depth and "behind" is printed beside it.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || true
branch="${CTL_ARGS[0]:-}"; stated="${CTL_ARGS[1]:-}"
[ -n "$branch" ] && [ -n "$stated" ] && [ "${#CTL_ARGS[@]}" -eq 2 ] || ctl_fail check-base "usage: ctl check-base <branch> <stated-base>"
ctl_base_valid "$stated" || ctl_fail check-base "stated base '$stated' is not main or release/<name>"
g() { /usr/bin/git -C "$CTL_REPO" "$@"; }
tip="$(g rev-parse --verify -q "refs/remotes/origin/$branch^{commit}" || g rev-parse --verify -q "refs/heads/$branch^{commit}")" || ctl_fail check-base "branch $branch not found (origin/$branch or local)"
g rev-parse --verify -q "refs/remotes/origin/$stated^{commit}" >/dev/null || ctl_fail check-base "origin/$stated not found (git fetch first)"
depth() { local mb; mb="$(g merge-base "$tip" "refs/remotes/origin/$1" 2>/dev/null)" || { echo -1; return; }; g rev-list --count "$mb"; }
behind() { g rev-list --count "$tip..refs/remotes/origin/$1"; }
sd="$(depth "$stated")"; [ "$sd" -ge 0 ] || ctl_fail check-base "$branch shares no history with origin/$stated"
best=""; bd="$sd"
for r in main $(g for-each-ref --format='%(refname:strip=3)' refs/remotes/origin/release/ 2>/dev/null); do
  [ "$r" != "$stated" ] || continue
  d="$(depth "$r")"; [ "$d" -gt "$bd" ] && { best="$r"; bd="$d"; }
done
if [ -n "$best" ]; then
  echo "WRONG-BASE $branch stated=$stated closest=$best ($(behind "$stated") vs $(behind "$best") behind)"
  ctl_fail check-base "$branch was cut nearer to $best than to $stated — fix the base on the REVIEW line, or merge $stated into the branch on purpose"
fi
ctl_ok check-base "$branch stated=$stated: no ref is closer ($(behind "$stated") behind)"
