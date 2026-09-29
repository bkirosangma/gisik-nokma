#!/usr/bin/env bash
# ctl land <pr> [--base <branch>] — refuse without the gate marker; comment the gate summary; merge only if the head still equals the gated sha;
# verify by API, reachability, tree identity and a drop check with a control; fast-forward the primary checkout if safe.
# --base (default main; main or release/<name> only) is the branch the PR must target and every check reads as origin/<base>.
# It never widens what may land in main: the PR's base must EQUAL --base, so a release landing cannot reach main and a
# landing into main is the default with the guards it always had (the main-kind gate marker, the head-gated merge).
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
pr="${CTL_ARGS[0]:-}"; [ -n "$pr" ] || ctl_fail land "usage: ctl land <pr> [--base <branch>]"
CTL_BASE=main
set -- "${CTL_ARGS[@]:1}"
while [ $# -gt 0 ]; do case "$1" in --base) ctl_take_base land "${2:-}"; shift $(($# >= 2 ? 2 : 1));; *) ctl_fail land "unknown arg $1";; esac; done
cd "$CTL_REPO" || exit 1
read -r head state base < <(gh pr view "$pr" --json headRefOid,state,baseRefName --jq '"\(.headRefOid) \(.state) \(.baseRefName)"') || ctl_fail land "cannot read PR #$pr"
[ "$state" = "OPEN" ] || ctl_fail land "PR #$pr is $state"
[ "$base" = "$CTL_BASE" ] || ctl_fail land "PR #$pr base is $base, not $CTL_BASE — a PR lands only against the base it targets (default main; pass --base release/<name> for a release landing)"
kind="$(ctl_marker_kind gate "$CTL_BASE")"; bflag="$([ "$CTL_BASE" = main ] || echo " --base $CTL_BASE")"
ctl_marker_has "$CTL_REPO" "$kind" "$head" || ctl_fail land "no gate marker for $head — run: ctl gate $head$bflag"
marker="$(cat "$(ctl_marker_dir "$CTL_REPO")/$kind-$head")"; glog="${marker#* }"
E=$(grep -m1 '^EXIT=' "$glog.console"); T=$(grep -m1 'Tasks:' "$glog" | sed 's/^.*Tasks:/Tasks:/'); N=$(grep -m1 'NODE=' "$glog.console")
/usr/bin/git fetch -q origin; old_base="$(/usr/bin/git rev-parse "origin/$CTL_BASE")"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: gh pr comment $pr (gate $E $T $N); gh pr merge $pr --merge if head still $head"; ctl_ok land "dry-run"; fi
gh pr comment "$pr" --body "**Forced gate at \`${head:0:12}\`** (\`ctl gate\`): \`$E\` · \`$T\` · \`$N\` — log \`$glog\`. Merging by \`ctl land\` on the checks + this gate." >/dev/null || ctl_fail land "comment failed"
read -r now now_base < <(gh pr view "$pr" --json headRefOid,baseRefName --jq '"\(.headRefOid) \(.baseRefName)"') || ctl_fail land "cannot re-read PR #$pr"
[ "$now" = "$head" ] || ctl_fail land "head moved to $now after the gate at $head — re-gate"
[ "$now_base" = "$CTL_BASE" ] || ctl_fail land "PR #$pr was retargeted to $now_base after the checks — not merging (expected $CTL_BASE)"
# The gate proved the tree at $head with origin/<base> as an ancestor; if the base has moved since, the --merge tree would be a
# union the gate never saw (#642's failure, one step later) and the tree check below would only redden AFTER the merge.
# Re-read the ancestry immediately before acting, against a fresh origin/<base> (design §8).
/usr/bin/git fetch -q origin; base_now="$(/usr/bin/git rev-parse "origin/$CTL_BASE")"
/usr/bin/git merge-base --is-ancestor "$base_now" "$head" || ctl_fail land "origin/$CTL_BASE moved to ${base_now:0:12} since the gate and is not an ancestor of the gated head ${head:0:12} — not merging. Remedy on the branch: git merge --no-edit origin/$CTL_BASE && git push, then ctl gate \$(git rev-parse HEAD)$bflag and ctl land $pr$bflag again"
gh pr merge "$pr" --merge > "$(ctl_log land)" 2>&1 || ctl_fail land "gh pr merge failed"
read -r st mc < <(gh pr view "$pr" --json state,mergeCommit --jq '"\(.state) \(.mergeCommit.oid)"')
[ "$st" = "MERGED" ] || ctl_fail land "state after merge is $st"
/usr/bin/git fetch -q origin; new_base="$(/usr/bin/git rev-parse "origin/$CTL_BASE")"
/usr/bin/git merge-base --is-ancestor "$mc" "origin/$CTL_BASE" || ctl_fail land "merge commit $mc not reachable from origin/$CTL_BASE"
[ -z "$(/usr/bin/git diff --stat "$head" "origin/$CTL_BASE")" ] || ctl_fail land "tree of origin/$CTL_BASE differs from the gated head (partition?)"
[ -n "$(/usr/bin/git diff --stat "$old_base" "origin/$CTL_BASE")" ] || ctl_fail land "drop check control: origin/$CTL_BASE did not change"
ff="primary untouched"
P="$(ctl_primary)"
# The primary checkout is fast-forwarded only when it stands on the very branch that was landed into: a release landing
# never moves a primary standing on main (or anything else), and a main landing behaves exactly as it always did.
if [ "$(/usr/bin/git -C "$P" branch --show-current)" = "$CTL_BASE" ] && [ -z "$(/usr/bin/git -C "$P" status --porcelain)" ] && [ "$(/usr/bin/git -C "$P" rev-list --count "origin/$CTL_BASE..HEAD")" = 0 ]; then
  /usr/bin/git -C "$P" pull -q --ff-only origin "$CTL_BASE" && ff="primary ff $(/usr/bin/git -C "$P" rev-parse --short=12 HEAD)" || ff="primary ff FAILED"
fi
ctl_ok land "#$pr merge ${mc:0:12} $CTL_BASE ${new_base:0:12} $ff"
