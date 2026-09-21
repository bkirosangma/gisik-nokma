#!/usr/bin/env bash
# ctl gate <sha> — the forced gate at HEAD=<sha> through the gate-lock reference scripts; writes .git/ctl/gate-<sha> only when green.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
sha="${CTL_ARGS[0]:-}"; [ -n "$sha" ] || ctl_fail gate "usage: ctl gate <sha>"
ctl_node22 || exit 1
cd "$CTL_REPO" || exit 1
head="$(/usr/bin/git rev-parse HEAD)"
case "$head" in "$sha"*) ;; *) ctl_fail gate "HEAD $head is not $sha";; esac
[ -z "$(/usr/bin/git status --porcelain)" ] || ctl_fail gate "tree is dirty"
sha="$head"
# The tree that lands must be the tree that was gated. `gh pr merge --merge` makes a two-parent merge commit whose
# tree is the union of the branch and main; when main has moved since the branch was cut, that union was never
# gated (measured landing #642, 2026-09-21: three docs files main had and the branch never touched). So the branch
# must already contain origin/main — then the merge's tree is content-identical to this head and land's tree check
# stays meaningful. Fetch first: a lane's origin/main can be hours stale, and a stale ref passes this test for the
# wrong reason. An offline fetch is reported, not hidden, and the local ref decides.
/usr/bin/git fetch -q origin main 2>/dev/null || echo "WARN gate: fetch of origin/main failed — ancestry checked against the local ref"
main_sha="$(/usr/bin/git rev-parse origin/main 2>/dev/null)" || ctl_fail gate "no origin/main in this repo"
/usr/bin/git merge-base --is-ancestor "$main_sha" "$head" || ctl_fail gate "origin/main ${main_sha:0:12} is not an ancestor of HEAD ${head:0:12} — a --merge landing would produce a tree this gate never saw; merge origin/main into the branch (git merge --no-edit origin/main), then re-gate"
work="$(ctl_log_dir)/gate-lock"; mkdir -p "$work"; cp docs/lanes/gate-lock/*.sh "$work/"; chmod +x "$work"/*.sh
log="$(ctl_log gate)"; console="$log.console"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: GATE_REPO=$CTL_REPO bash $work/gate.sh $log > $console"; ctl_ok gate "dry-run"; fi
GATE_REPO="$CTL_REPO" bash "$work/gate.sh" "$log" > "$console" 2>&1; echo "GATE_WRAPPER_EXIT=$?" >> "$console"
E=$(grep -m1 '^EXIT=' "$console"); T=$(grep -m1 'Tasks:' "$log" | sed 's/^.*Tasks:/Tasks:/'); C=$(grep -m1 'Cached:' "$log" | sed 's/^.*Cached:/Cached:/')
N=$(grep -m1 'NODE=' "$console"); eng=$(grep -c 'Unsupported engine' "$log"); to=$(grep -c 'Hook timed out' "$log")
orph=$(ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}' | wc -l | tr -d ' ')
summary="$E · $T · $C · $N · engine=$eng timeouts=$to orphans=$orph"
[ "$E" = "EXIT=0" ] || ctl_fail gate "$summary (log $log)"
echo "$T" | grep -q '33 successful, 33 total' || ctl_fail gate "$summary (log $log)"
echo "$N" | grep -q 'NODE=v22\.' || ctl_fail gate "$summary (log $log)"
[ "$eng" -eq 0 ] || ctl_fail gate "Unsupported engine ×$eng (log $log)"
[ "$to" -eq 0 ] || ctl_fail gate "Hook timed out ×$to — re-gate on a quiet box (log $log)"
[ "$orph" -eq 0 ] || ctl_fail gate "$orph orphaned vitest workers at ppid 1 — reap them, then re-gate"
ctl_marker_write "$CTL_REPO" gate "$sha" "$log"
ctl_ok gate "$sha $summary (log $log)"
