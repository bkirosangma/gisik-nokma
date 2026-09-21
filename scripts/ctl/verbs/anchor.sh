#!/usr/bin/env bash
# ctl anchor <N> --title T --body FILE — measure, then let anchor.py do the text; then ctl checks.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
n="${CTL_ARGS[0]:-}"; title=""; body=""
set -- "${CTL_ARGS[@]:1}"
while [ $# -gt 0 ]; do case "$1" in --title) title="$2"; shift 2;; --body) body="$2"; shift 2;; *) ctl_fail anchor "unknown arg $1";; esac; done
[ -n "$n" ] && [ -n "$title" ] && [ -f "$body" ] || ctl_fail anchor "usage: ctl anchor <N> --title T --body FILE"
cd "$CTL_REPO" || exit 1
[ "$(/usr/bin/git branch --show-current)" != "main" ] || ctl_fail anchor "on main — branch first"
/usr/bin/git fetch -q origin
main_sha="$(/usr/bin/git rev-parse origin/main)"
last_pr="$(gh pr list --state merged --limit 1 --json number --jq '.[0].number')"
open_prs="$(gh pr list --state open --json number --jq length)"
ctl_branch="$(/usr/bin/git branch --show-current)"
stack="owner's; built images from the PRIMARY checkout"
for c in gisik-nokma-dev-server-1 gisik-nokma-dev-web-1; do
  img="$(docker inspect --format '{{.Image}}' "$c" 2>/dev/null | cut -c8-19)"; created="$(docker inspect --format '{{.Image}}' "$c" 2>/dev/null | xargs docker inspect --format '{{.Created}}' 2>/dev/null | cut -c1-16)"
  stack="$stack; ${c#gisik-nokma-dev-} image $img created $created"
done
windows="$(tmux list-windows -t gisik -F '#{window_index}:#{window_name}' 2>/dev/null | tr '\n' ' ')"
stamp="$(date '+%Y-%m-%d %H:%M IST')"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: anchor.py cycle $n main=$main_sha pr=$last_pr open=$open_prs branch=$ctl_branch"; ctl_ok anchor "dry-run"; fi
python3 "$(dirname "$0")/anchor.py" docs/lanes/controller-state.md docs/lanes/controller-state-history.md "$n" "$title" "$body" "$main_sha" "$last_pr" "$open_prs" "$ctl_branch" "$stack" "$windows" "$stamp" || ctl_fail anchor "anchor.py failed"
bash "$(dirname "$0")/checks.sh" --repo "$CTL_REPO" || ctl_fail anchor "checks red after the rewrite"
ctl_ok anchor "cycle $n written at main ${main_sha:0:12}; commit and land it"
