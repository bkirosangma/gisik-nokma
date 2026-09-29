#!/usr/bin/env bash
# ctl gate <sha> [--base <branch>] — the forced gate at HEAD=<sha> through the gate-lock reference scripts; writes .git/ctl/gate-<sha> only when green.
# --base (default main; main or release/<name> only) is the branch HEAD must already contain; a release base writes gate.release+<name>-<sha>.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
sha="${CTL_ARGS[0]:-}"; [ -n "$sha" ] || ctl_fail gate "usage: ctl gate <sha> [--base <branch>]"
CTL_BASE=main
set -- "${CTL_ARGS[@]:1}"
while [ $# -gt 0 ]; do case "$1" in --base) ctl_take_base gate "${2:-}"; shift $(($# >= 2 ? 2 : 1));; *) ctl_fail gate "unknown arg $1";; esac; done
ctl_node22 || exit 1
cd "$CTL_REPO" || exit 1
head="$(/usr/bin/git rev-parse HEAD)"
case "$head" in "$sha"*) ;; *) ctl_fail gate "HEAD $head is not $sha";; esac
[ -z "$(/usr/bin/git status --porcelain)" ] || ctl_fail gate "tree is dirty"
sha="$head"
# The tree that lands must be the tree that was gated. `gh pr merge --merge` makes a two-parent merge commit whose
# tree is the union of the branch and main; when main has moved since the branch was cut, that union was never
# gated (measured landing #642, 2026-09-21: three docs files main had and the branch never touched). So the branch
# must already contain origin/<base> (main unless --base) — then the merge's tree is content-identical to this head and land's tree check
# stays meaningful. Fetch first: a lane's origin/<base> can be hours stale, and a stale ref passes this test for the
# wrong reason. An offline fetch is reported, not hidden, and the local ref decides.
/usr/bin/git fetch -q origin "$CTL_BASE" 2>/dev/null || echo "WARN gate: fetch of origin/$CTL_BASE failed — ancestry checked against the local ref"
base_sha="$(/usr/bin/git rev-parse "origin/$CTL_BASE" 2>/dev/null)" || ctl_fail gate "no origin/$CTL_BASE in this repo"
/usr/bin/git merge-base --is-ancestor "$base_sha" "$head" || ctl_fail gate "origin/$CTL_BASE ${base_sha:0:12} is not an ancestor of HEAD ${head:0:12} — a --merge landing would produce a tree this gate never saw. Remedy: git merge --no-edit origin/$CTL_BASE && git push, then re-run ctl gate on the NEW head: scripts/ctl/ctl gate \$(git rev-parse HEAD)$([ "$CTL_BASE" = main ] || echo " --base $CTL_BASE") (merge, never rebase: PR bodies cite lane commits by sha)"
log="$(ctl_log gate)"; console="$log.console"
# The gate scripts are copied PER RUN, beside the run's log, and never on --dry-run: the copy used to go to one shared
# gate-lock/ dir on every call, and `ctl checks` (→ check:ctl → this verb's dry-run) from any sibling rewrote
# locked-test.sh while a running gate's bash was executing it — bash resumes at its byte offset in the NEW text
# (measured 2026-09-21 22:55 and 22:58: "line 216: timed: command not found", "line 238: code: unbound variable").
# The copy is left in place after the run: it is the evidence of what ran.
base="$(basename "$log" .log)"; work="$(dirname "$log")/gate-lock-${base#gate-}"
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: GATE_REPO=$CTL_REPO bash $work/gate.sh $log > $console (scripts would be copied to $work; nothing copied on --dry-run)"; ctl_ok gate "dry-run"; fi
mkdir -p "$work"; cp docs/lanes/gate-lock/*.sh "$work/"; chmod +x "$work"/*.sh
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
ctl_marker_write "$CTL_REPO" "$(ctl_marker_kind gate "$CTL_BASE")" "$sha" "$log"
ctl_ok gate "$sha $summary (log $log)"
