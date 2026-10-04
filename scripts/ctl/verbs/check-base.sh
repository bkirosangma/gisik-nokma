#!/usr/bin/env bash
# ctl check-base <branch> <stated-base> [--repo R] — is the base a REVIEW line (or a lane's DONE) states the base the branch was cut from?
# Planner ruling 2026-10-04 02:08 (the dispatcher flagged task/sm2-g1-cls at 01:36 as cut from release/smoothness while its line said base=KG;
# it was in fact cut from KG, and smoothness was already inside KG — this verb clears that branch). Read-only.
# Where a branch was cut is read on its FIRST-PARENT line (the tip, its first parent, that commit's first parent …): a release merged INTO
# the branch arrives as a second parent and is never the base. For the stated base, origin/main and every origin/release/* it counts the
# branch's first-parent commits that ref cannot reach (`rev-list --first-parent --count tip ^ref`): the fork distance, smaller = cut from
# it more recently. Another ref STRICTLY closer than the stated base is WRONG-BASE (exit 1); a tie — a branch sitting on a commit two
# releases share — is fine. The verdict does not depend on how many commits any release holds: neither "commits behind" (rev-list
# tip..ref, which flags every stale-but-correct branch whenever a younger release has fewer new commits) nor merge-base depth (which
# made a release merged into the branch look like its base whenever that release was the deeper one) decides it. "behind" is printed.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || true
branch="${CTL_ARGS[0]:-}"; stated="${CTL_ARGS[1]:-}"
[ -n "$branch" ] && [ -n "$stated" ] && [ "${#CTL_ARGS[@]}" -eq 2 ] || ctl_fail check-base "usage: ctl check-base <branch> <stated-base>"
ctl_base_valid "$stated" || ctl_fail check-base "stated base '$stated' is not main or release/<name>"
g() { /usr/bin/git -C "$CTL_REPO" "$@"; }
tip="$(g rev-parse --verify -q "refs/remotes/origin/$branch^{commit}" || g rev-parse --verify -q "refs/heads/$branch^{commit}")" || ctl_fail check-base "branch $branch not found (origin/$branch or local)"
g rev-parse --verify -q "refs/remotes/origin/$stated^{commit}" >/dev/null || ctl_fail check-base "origin/$stated not found (git fetch first)"
g merge-base "$tip" "refs/remotes/origin/$stated" >/dev/null 2>&1 || ctl_fail check-base "$branch shares no history with origin/$stated"
fork() { g rev-list --first-parent --count "$tip" "^refs/remotes/origin/$1"; }     # the branch's first-parent commits <ref> cannot reach
behind() { g rev-list --count "$tip..refs/remotes/origin/$1"; }
sf="$(fork "$stated")"; best=""; bf="$sf"
for r in main $(g for-each-ref --format='%(refname:strip=3)' refs/remotes/origin/release/ 2>/dev/null); do
  [ "$r" != "$stated" ] || continue
  f="$(fork "$r")"; [ "$f" -lt "$bf" ] && { best="$r"; bf="$f"; }
done
if [ -n "$best" ]; then
  echo "WRONG-BASE $branch stated=$stated closest=$best ($(behind "$stated") vs $(behind "$best") behind; forked $sf vs $bf first-parent commits back)"
  ctl_fail check-base "$branch was cut from $best, not $stated — fix the base on the REVIEW line (merging $stated into the branch does not move where it was cut)"
fi
ctl_ok check-base "$branch stated=$stated: no ref is closer ($(behind "$stated") behind, forked $sf first-parent commits back)"
