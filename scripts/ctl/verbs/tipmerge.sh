#!/usr/bin/env bash
# ctl tipmerge <branch> --base <branch> --expect <sha> — merge origin/<base> into origin/<branch> WITHOUT a working tree, when git says the merge is clean.
# `git merge-tree --write-tree` computes the auto-merge tree; this verb wraps that tree in a merge commit (parents: the branch tip, the base tip), proves it, and
# pushes it to <branch> with a plain (fast-forward-only) push. CLEAN → the new sha is printed and the caller gates it. CONFLICTED → the paths are printed, exit 3,
# nothing is pushed: that case still goes to a lane (and a reviewer fast path for the hand-resolved files). Nothing in any checkout is read or written.
# --expect <sha> is REQUIRED (7-40 hex): the branch tip the caller saw as READY; a branch that has moved since is refused, never merged under the caller's feet.
# <branch> can never be main or any release/* name (a push there is a release or a deploy, not a task's tip merge). The push is never forced.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
usage="usage: ctl tipmerge <branch> --base <release/name> --expect <sha> [--repo W] [--dry-run]"
branch=""; expect=""; have_base=0; CTL_BASE=""
set -- "${CTL_ARGS[@]}"
while [ $# -gt 0 ]; do
  case "$1" in
    --base) ctl_take_base tipmerge "${2:-}"; have_base=1; shift $(($# >= 2 ? 2 : 1));;
    --expect) [ $# -ge 2 ] || ctl_fail tipmerge "--expect needs a sha"; expect="$2"; shift 2;;
    -*) ctl_fail tipmerge "unknown arg $1 ($usage)";;
    *) [ -z "$branch" ] || ctl_fail tipmerge "unexpected argument $1 ($usage)"; branch="$1"; shift;;
  esac
done
[ -n "$branch" ] || ctl_fail tipmerge "$usage"
[ "$have_base" = 1 ] || ctl_fail tipmerge "--base is required ($usage)"
[[ "$expect" =~ ^[0-9a-f]{7,40}$ ]] || ctl_fail tipmerge "--expect needs the READY sha, 7-40 hex characters (got '${expect}') — $usage"
# The branch is what gets pushed to: never an integration branch, never a name git would read as something else.
if ctl_base_valid "$branch" || [[ "$branch" == release/* ]] || [ "$branch" = HEAD ] || [[ "$branch" == refs/* ]] || [[ "$branch" == -* ]] || ! /usr/bin/git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  ctl_fail tipmerge "'$branch' is not a task branch — main, release/<name>, HEAD and invalid ref names are refused (a push there is a release, not a tip merge)"
fi
cd "$CTL_REPO" || exit 1
# Fresh refs or nothing: a merge computed against a stale ref would be pushed as if it were current, so a failed fetch FAILS here (gate only warns).
/usr/bin/git fetch -q origin "+refs/heads/$CTL_BASE:refs/remotes/origin/$CTL_BASE" "+refs/heads/$branch:refs/remotes/origin/$branch" 2>/dev/null \
  || ctl_fail tipmerge "cannot fetch origin $CTL_BASE and $branch (offline, or one is not on origin) — nothing merged"
tip="$(/usr/bin/git rev-parse --verify -q "refs/remotes/origin/$branch^{commit}")" || ctl_fail tipmerge "no origin/$branch"
btip="$(/usr/bin/git rev-parse --verify -q "refs/remotes/origin/$CTL_BASE^{commit}")" || ctl_fail tipmerge "no origin/$CTL_BASE"
case "$tip" in "$expect"*) ;; *) ctl_fail tipmerge "origin/$branch moved: it is ${tip:0:12}, the caller expected ${expect:0:12} — re-read the READY sha";; esac
if /usr/bin/git merge-base --is-ancestor "$btip" "$tip"; then
  ctl_ok tipmerge "$branch $tip already contains origin/$CTL_BASE ${btip:0:12} — no merge made, nothing pushed; gate it: ctl gate $tip --base $CTL_BASE"
fi
# The auto-merge tree. Orientation = what `git merge origin/<base>` run on the branch would do (ours = branch). Exit 0 clean, 1 conflicted, anything else an error.
mt="$(/usr/bin/git merge-tree --write-tree --name-only --no-messages "$tip" "$btip" 2>/dev/null)"; rc=$?
case "$rc" in
  0) ;;
  1) paths="$(printf '%s\n' "$mt" | sed '1d;/^$/,$d' | sort -u)"
     printf '%s\n' "$paths" | sed 's/^/CONFLICT /'
     echo "FAIL tipmerge $branch conflicted: $(printf '%s\n' "$paths" | grep -c .) file(s) — not merged, nothing pushed; send it to a lane with origin/$CTL_BASE ${btip:0:12}"; exit 3;;
  *) ctl_fail tipmerge "git merge-tree failed (exit $rc) for origin/$branch and origin/$CTL_BASE — not a conflict; unrelated histories or a bad object. Nothing pushed";;
esac
tree="$(printf '%s\n' "$mt" | sed -n 1p)"
[[ "$tree" =~ ^[0-9a-f]{40}$ ]] || ctl_fail tipmerge "git merge-tree printed no tree ('$tree')"
# Independent proof 1: the opposite orientation reaches the same tree (a clean merge does not depend on which side is ours).
rtree="$(/usr/bin/git merge-tree --write-tree --no-messages "$btip" "$tip" 2>/dev/null | sed -n 1p)"
[ "$rtree" = "$tree" ] || ctl_fail tipmerge "the merge is order-dependent (${tree:0:12} vs ${rtree:0:12}) — refusing to auto-merge it; send it to a lane"
if [ "$CTL_DRY_RUN" = 1 ]; then
  echo "DRY: git commit-tree $tree -p $tip -p $btip"
  echo "DRY: git push origin <new sha>:refs/heads/$branch"
  ctl_ok tipmerge "$branch dry-run: clean, auto-merge tree $tree of origin/$CTL_BASE ${btip:0:12} into ${tip:0:12} — nothing created, nothing pushed"
fi
msg="Merge origin/$CTL_BASE (${btip:0:8}) into $branch (ctl tipmerge: clean auto-merge, tree ${tree:0:12})"
new="$(/usr/bin/git commit-tree "$tree" -p "$tip" -p "$btip" -m "$msg")" || ctl_fail tipmerge "git commit-tree failed (no git identity?)"
# Proof 2: the commit read back from the object database is the merge we meant — this tree, these two parents, in this order.
[ "$(/usr/bin/git rev-parse "$new^{tree}")" = "$tree" ] || ctl_fail tipmerge "commit ${new:0:12} has tree $(/usr/bin/git rev-parse "$new^{tree}"), not the auto-merge tree $tree — not pushed"
[ "$(/usr/bin/git rev-list --parents -n 1 "$new")" = "$new $tip $btip" ] || ctl_fail tipmerge "commit ${new:0:12} has the wrong parents — not pushed"
/usr/bin/git merge-base --is-ancestor "$btip" "$new" || ctl_fail tipmerge "origin/$CTL_BASE is not an ancestor of ${new:0:12} — not pushed"
# A plain push: a fast-forward of the branch tip we read, so it is itself the race guard (a branch that moved since the fetch is refused by origin).
log="$(ctl_log tipmerge)"
/usr/bin/git push origin "$new:refs/heads/$branch" > "$log" 2>&1 || ctl_fail tipmerge "push refused (the branch moved since the fetch, or origin rejected it) — nothing merged (log $log)"
# Positive proof: origin itself says the branch is now the commit we made (an accepted push can still be rewound by a hook).
got="$(/usr/bin/git ls-remote origin "refs/heads/$branch" 2>/dev/null | awk '{print $1}')"
[ "$got" = "$new" ] || ctl_fail tipmerge "origin/$branch is ${got:-unreadable}, not the pushed ${new:0:12} (log $log)"
ctl_ok tipmerge "$branch $new merged origin/$CTL_BASE ${btip:0:12} into ${tip:0:12}, tree ${tree:0:12} = the auto-merge tree, pushed — gate it from the gate checkout at the new sha (git fetch origin && git checkout --detach $new): ctl gate $new --base $CTL_BASE; the lane's local $branch is now behind origin — a lane that commits on it again must git pull --ff-only in its OWN worktree first"
