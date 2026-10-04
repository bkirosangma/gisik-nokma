#!/usr/bin/env bash
# ctl autopilot once|run|start [--shadow] [--interval S] — the controller's matchmaking as a deterministic loop (planner MSG-orch-bottleneck-1,
# 2026-10-04): free reviewers take queue items by the pull rule, free lanes take their pool's next task (a FIX, then a task whose Needs are
# on the release tip, then a stack <= 2 deep) or become reviewers. The rules are autopilot.py's; this wrapper parses the verb.
#   once   one pass now            run   a pass every --interval s (default 60), under a singleton lock, forever
#   start  open the tmux window `autopilot` (session gisik) running `run` with the same flags; refuses when the window exists
# --shadow logs what it WOULD do and writes nothing, sends nothing (the PROOF mode: run it first, audit it, then go live).
# --dry-run (start only) prints the tmux line and opens nothing. CTL_AUTOPILOT_PY is a test seam (a mutant copy).
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
HERE="$(cd "$(dirname "$0")" && pwd)"
mode="${1:-}"; shift || true
case "$mode" in once|run|start) ;; *) ctl_fail autopilot "usage: ctl autopilot once|run|start [--shadow] [--interval S] [--dry-run]";; esac
args=(); dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --shadow|--no-fetch) args+=("$1"); shift;;
    --interval) [ $# -ge 2 ] && [[ "$2" =~ ^[0-9]+$ ]] || ctl_fail autopilot "--interval needs seconds"; args+=(--interval "$2"); shift 2;;
    --dry-run) dry=1; shift;;
    --repo) shift 2;;
    *) ctl_fail autopilot "unknown arg $1";;
  esac
done
py="${CTL_AUTOPILOT_PY:-$HERE/autopilot.py}"
if [ "$mode" = start ]; then
  line="bash $(cd "$HERE/.." && pwd)/ctl autopilot run ${args[*]+${args[*]}}"
  if [ "$dry" = 1 ]; then echo "DRY: tmux new-window -d -t gisik -n autopilot \"$line\""; ctl_ok autopilot "dry-run"; fi
  tmux has-session -t gisik 2>/dev/null || ctl_fail autopilot "no gisik session"
  tmux list-windows -t gisik -F '#{window_name}' | grep -qx autopilot && ctl_fail autopilot "window gisik:autopilot already exists (one loop at a time)"
  tmux new-window -d -t gisik -n autopilot "$line" || ctl_fail autopilot "new-window failed"
  ctl_ok autopilot "window gisik:autopilot runs: $line"
fi
[ "$dry" = 1 ] && { echo "DRY: python3 $py $mode ${args[*]+${args[*]}}"; ctl_ok autopilot "dry-run"; }
exec python3 "$py" "$mode" ${args[@]+"${args[@]}"}
