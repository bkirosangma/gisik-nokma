#!/usr/bin/env bash
# ctl archive [--apply] [--list] — move the stale working files of the lanes directory (CTL_LANES_DIR, default
# /Users/kiro/my_projects/gisik-nokma-lanes) to archive/<date>/ and roll CTL-TO-PLANNER-notes.md (owner plan B13, 2026-10-03).
# DRY-RUN BY DEFAULT: only --apply moves anything. MOVE, never delete. The rules and the plan are archive.py's; this wrapper
# refuses --apply while a landing is in flight: a live `ctl gate` marker (sem.sh), or a running land/gate/tipmerge verb in ps
# (`ctl land` itself writes no marker; CTL_ARCHIVE_PS_CMD replaces the ps command, a test seam).
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
. "$(cd "$(dirname "$0")/.." && pwd)/sem.sh"
apply=0; dry=0; pass=()
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) apply=1; pass+=("$1");;
    --dry-run) dry=1;;
    --list) pass+=("$1");;
    *) ctl_fail archive "unknown arg $1 (usage: ctl archive [--apply] [--list])";;
  esac
  shift
done
[ "$apply" = 1 ] && [ "$dry" = 1 ] && ctl_fail archive "--apply and --dry-run contradict each other"
root="${CTL_LANES_DIR:-/Users/kiro/my_projects/gisik-nokma-lanes}"
[ -d "$root" ] || ctl_fail archive "no lanes directory at $root"
inflight=""
if ctl_sem_gate_live; then
  inflight="a ctl gate is running (marker in $(ctl_sem_dir))"
else
  p="$(sh -c "${CTL_ARCHIVE_PS_CMD:-ps -axo pid=,command=}" 2>/dev/null | grep -E '(verbs/(land|gate|tipmerge)\.sh|scripts/ctl/ctl (land|gate|tipmerge))( |$)' | awk 'NR==1{print $1}')"
  [ -z "$p" ] || inflight="a land/gate/tipmerge verb is running (pid $p)"
fi
[ "$apply" = 1 ] && [ -n "$inflight" ] && ctl_fail archive "$inflight — a landing is in flight, nothing moved or rolled; retry at a quiet point"
export CTL_LANES_DIR="$root" CTL_ARCHIVE_INFLIGHT="$inflight" CTL_ARCHIVE_LOG="$(ctl_log archive)"
exec python3 "$(cd "$(dirname "$0")" && pwd)/archive.py" "${pass[@]+"${pass[@]}"}"
