#!/usr/bin/env bash
# ctl land <pr> — refuse without the gate marker; comment the gate summary; merge only if the head still equals the gated sha;
# verify by API, reachability, tree identity and a drop check with a control; fast-forward the primary checkout if safe.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
pr="${CTL_ARGS[0]:-}"; [ -n "$pr" ] || ctl_fail land "usage: ctl land <pr>"
cd "$CTL_REPO" || exit 1
read -r head state base < <(gh pr view "$pr" --json headRefOid,state,baseRefName --jq '"\(.headRefOid) \(.state) \(.baseRefName)"') || ctl_fail land "cannot read PR #$pr"
[ "$state" = "OPEN" ] || ctl_fail land "PR #$pr is $state"
[ "$base" = "main" ] || ctl_fail land "PR #$pr base is $base"
ctl_marker_has "$CTL_REPO" gate "$head" || ctl_fail land "no gate marker for $head — run: ctl gate $head"
marker="$(cat "$(ctl_marker_dir "$CTL_REPO")/gate-$head")"; glog="${marker#* }"
E=$(grep -m1 '^EXIT=' "$glog.console"); T=$(grep -m1 'Tasks:' "$glog" | sed 's/^.*Tasks:/Tasks:/'); N=$(grep -m1 'NODE=' "$glog.console")
/usr/bin/git fetch -q origin; old_main="$(/usr/bin/git rev-parse origin/main)"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: gh pr comment $pr (gate $E $T $N); gh pr merge $pr --merge if head still $head"; ctl_ok land "dry-run"; fi
gh pr comment "$pr" --body "**Forced gate at \`${head:0:12}\`** (\`ctl gate\`): \`$E\` · \`$T\` · \`$N\` — log \`$glog\`. Merging by \`ctl land\` on the checks + this gate." >/dev/null || ctl_fail land "comment failed"
now="$(gh pr view "$pr" --json headRefOid --jq .headRefOid)"
[ "$now" = "$head" ] || ctl_fail land "head moved to $now after the gate at $head — re-gate"
# The gate proved the tree at $head with origin/main as an ancestor; if main has moved since, the --merge tree would be a
# union the gate never saw (#642's failure, one step later) and the tree check below would only redden AFTER the merge.
# Re-read the ancestry immediately before acting, against a fresh origin/main (design §8).
/usr/bin/git fetch -q origin; main_now="$(/usr/bin/git rev-parse origin/main)"
/usr/bin/git merge-base --is-ancestor "$main_now" "$head" || ctl_fail land "origin/main moved to ${main_now:0:12} since the gate and is not an ancestor of the gated head ${head:0:12} — not merging. Remedy on the branch: git merge --no-edit origin/main && git push, then ctl gate \$(git rev-parse HEAD) and ctl land again"
gh pr merge "$pr" --merge > "$(ctl_log land)" 2>&1 || ctl_fail land "gh pr merge failed"
read -r st mc < <(gh pr view "$pr" --json state,mergeCommit --jq '"\(.state) \(.mergeCommit.oid)"')
[ "$st" = "MERGED" ] || ctl_fail land "state after merge is $st"
/usr/bin/git fetch -q origin; new_main="$(/usr/bin/git rev-parse origin/main)"
/usr/bin/git merge-base --is-ancestor "$mc" origin/main || ctl_fail land "merge commit $mc not reachable from origin/main"
[ -z "$(/usr/bin/git diff --stat "$head" origin/main)" ] || ctl_fail land "tree of origin/main differs from the gated head (partition?)"
[ -n "$(/usr/bin/git diff --stat "$old_main" origin/main)" ] || ctl_fail land "drop check control: origin/main did not change"
ff="primary untouched"
P="$(ctl_primary)"
if [ "$(/usr/bin/git -C "$P" branch --show-current)" = "main" ] && [ -z "$(/usr/bin/git -C "$P" status --porcelain)" ] && [ "$(/usr/bin/git -C "$P" rev-list --count origin/main..HEAD)" = 0 ]; then
  /usr/bin/git -C "$P" pull -q --ff-only origin main && ff="primary ff $(/usr/bin/git -C "$P" rev-parse --short=12 HEAD)" || ff="primary ff FAILED"
fi
ctl_ok land "#$pr merge ${mc:0:12} main ${new_main:0:12} $ff"
