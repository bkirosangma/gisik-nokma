#!/usr/bin/env bash
# ctl run-tests [--repo W] [--label L] [--dry-run] -- <command…> — run a vitest / tsc / build command through the machine-wide test semaphore
# (sem.sh), its WHOLE output in a log file, and print at most 30 lines: the counts, the first failure's name and assertion, the log path and the
# exit code. The verb's own exit code is the command's, never masked; 75 = no slot within CTL_SEM_MAX_WAIT (the command was not run).
# ctl_ok / ctl_fail exit 0 / 1, so this verb prints its own last line (OK|FAIL run-tests …) and exits with the real code.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
. "$HERE/sem.sh"
# Split at the FIRST `--`: ctl_parse_common strips --repo / --dry-run from anywhere, which would eat them from the wrapped command.
left=(); cmd=(); seen=0
for a in "$@"; do
  if [ "$seen" = 0 ] && [ "$a" = -- ]; then seen=1
  elif [ "$seen" = 0 ]; then left+=("$a")
  else cmd+=("$a"); fi
done
usage() { echo "FAIL run-tests $1 — usage: ctl run-tests [--repo W] [--label L] -- <command…>"; exit 64; }
ctl_parse_common ${left[@]+"${left[@]}"} || exit 64
label=""
set -- ${CTL_ARGS[@]+"${CTL_ARGS[@]}"}
while [ $# -gt 0 ]; do case "$1" in --label) [ $# -ge 2 ] || usage "--label needs a value"; label="$2"; shift 2;; *) usage "unknown arg $1";; esac; done
[ "$seen" = 1 ] && [ "${#cmd[@]}" -gt 0 ] || usage "no command after --"
[ -n "$label" ] || label="${cmd[0]##*/}"
ctl_node22 || exit 1
[ -d "$CTL_REPO" ] || { echo "FAIL run-tests no such worktree $CTL_REPO"; exit 64; }
shown="${cmd[*]}"; [ "${#shown}" -le 120 ] || shown="${shown:0:119}…"
if [ "$CTL_DRY_RUN" = 1 ]; then
  echo "DRY: acquire a slot (1..$(ctl_sem_slots) in $(ctl_sem_dir); waits while a gate runs, memory pressure is not normal, or swap-in is high), then in $CTL_REPO: $shown > $(ctl_log run-tests)"
  ctl_ok run-tests "dry-run"
fi
log="$(ctl_log run-tests)"
child=""
cleanup() { ctl_sem_release; }
abort() { local sig="$1"; [ -z "$child" ] || { kill -TERM "$child" 2>/dev/null; wait "$child" 2>/dev/null; }; ctl_sem_release; echo "FAIL run-tests $label terminated by signal $sig — slot released"; exit $((128 + sig)); }
trap cleanup EXIT
trap 'abort 2' INT
trap 'abort 15' TERM
ctl_sem_acquire "$label"; arc=$?
if [ "$arc" -ne 0 ]; then
  echo "FAIL run-tests $label no slot after ${CTL_SEM_WAITED}s (waited for: $CTL_SEM_REASONS) — nothing was run"; exit 75
fi
if [ "$CTL_SEM_REASONS" = "-" ]; then waitline="queue wait: ${CTL_SEM_WAITED}s (slot $CTL_SEM_SLOT/$CTL_SEM_SLOTS)"; else waitline="queue wait: ${CTL_SEM_WAITED}s (waited for: $CTL_SEM_REASONS)"; fi
{ echo "# ctl run-tests: $shown"; echo "# $waitline; repo $CTL_REPO"; } > "$log"
cd "$CTL_REPO" || exit 1
# The command runs in the background with `wait` so a TERM to the verb is handled at once (bash defers a trap behind a foreground child) and
# the child can be told to stop; no pipe, so rc is the command's own. A job killed by a signal makes bash print "Terminated" — silenced.
"${cmd[@]}" >> "$log" 2>&1 < /dev/null &
child=$!
{ wait "$child"; } 2>/dev/null; rc=$?
child=""
ctl_sem_release
echo "run-tests: $label — $shown"
echo "$waitline"
python3 "$HERE/verbs/run-tests-summary.py" "$log" 22 "$rc"
echo "log: $log"
echo "exit code: $rc"
if [ "$rc" -eq 0 ]; then echo "OK run-tests $label rc=0 (wait ${CTL_SEM_WAITED}s, log $log)"; else echo "FAIL run-tests $label rc=$rc (wait ${CTL_SEM_WAITED}s, log $log)"; fi
exit "$rc"
