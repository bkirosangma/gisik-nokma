#!/usr/bin/env bash
# ctl prune-gate-locks [--apply] [--list] — remove the per-run gate-lock-<stamp>-<pid>/ dirs older than 24 h and the gate logs
# (gate-*.log, gate-*.log.console) older than 7 days from the log dir (CTL_LOG_DIR, default ~/.cache/gisik-ctl), NEVER the newest
# gate-lock dir, one whose run's pid is alive, or one a running process names (planner 2026-10-04 08:10). DRY-RUN BY DEFAULT: only
# --apply removes anything. The rules are prune-gate-locks.py's; this wrapper parses the flags. CTL_PRUNE_PY is a test seam (a mutant copy).
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
HERE="$(cd "$(dirname "$0")" && pwd)"
apply=0; list=0; dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) apply=1; shift;;
    --list) list=1; shift;;
    --dry-run) dry=1; shift;;
    --repo) shift 2;;
    *) ctl_fail prune-gate-locks "unknown arg $1 (usage: ctl prune-gate-locks [--apply] [--list])";;
  esac
done
[ "$apply" = 1 ] && [ "$dry" = 1 ] && ctl_fail prune-gate-locks "--apply and --dry-run contradict each other"
args=(--dir "$(ctl_log_dir)"); [ "$apply" = 1 ] && args+=(--apply); [ "$list" = 1 ] && args+=(--list)
exec python3 "${CTL_PRUNE_PY:-$HERE/prune-gate-locks.py}" "${args[@]}"
