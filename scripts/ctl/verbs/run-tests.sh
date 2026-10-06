#!/usr/bin/env bash
# ctl run-tests [--repo W] [--label L] [--max-min N] [--short] [--dry-run] -- <command…> — run a vitest / tsc / build command through the machine-wide test semaphore
# (sem.sh), its WHOLE output in a log file, and print at most 30 lines: the counts, the first failure's name and assertion, the log path and the
# exit code. The verb's own exit code is the command's, never masked; 75 = no slot within CTL_SEM_MAX_WAIT (the command was not run); 124 WITH a
# `TIMEOUT after N min` line (the log's last, and the summary's last) = the command held its slot past --max-min and its process group was stopped
# (13.2320-13.2326). A command's own exit 124 prints no TIMEOUT line.
# --max-min N: minutes of SLOT time (the clock starts when the slot is taken; the queue wait never counts), default 30 (planner ruling 2026-10-05 14:36), GISIK_RUN_MAX_MIN overrides
# the default; 0 = no cap, accepted only as an explicit --max-min 0 (GISIK_RUN_MAX_MIN=0 is refused). Seams (tests): CTL_RUN_SECS_PER_MIN (60),
# CTL_RUN_KILL_GRACE_SECS (10: TERM → KILL of the group).
# --short (P72, 13.2360-13.2363): the caller promises a short job (one mutant, one test file). It may take an EXPRESS slot (sem.sh) when no normal slot is
# available to it — never in preference to a free normal one. The promise is checked by logging, not by killing: a --short hold past CTL_SEM_SHORT_MAX
# (90) s writes `SHORT-OVERRUN <label> <secs>` to its log (before any TIMEOUT line, which stays the last) and the secs to waits.tsv's 8th column.
# A command that runs Playwright for knowledge-graph-browser / flow-graph-browser gets a free KG_PW_PORT / FG_PW_PORT of its own (verbs/pw-ports.py; 13.2281-13.2285).
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
# Where the command runs: the CALLER's directory, or --repo W's when given. Every other verb cd's to CTL_REPO, but this one wraps a command whose meaning depends on
# its directory (`pnpm exec vitest run test/x` from a package dir; `pnpm test` there is NOT the root's whole-monorepo `turbo run test`). CTL_REPO is derived from $PWD,
# so the caller's directory is always inside it.
explicit_repo=0; for a in ${left[@]+"${left[@]}"}; do [ "$a" = --repo ] && explicit_repo=1; done
usage() { echo "FAIL run-tests $1 — usage: ctl run-tests [--repo W] [--label L] [--max-min N] [--short] -- <command…>"; exit 64; }
ctl_parse_common ${left[@]+"${left[@]}"} || exit 64
label=""; max_min=""; short=""
set -- ${CTL_ARGS[@]+"${CTL_ARGS[@]}"}
while [ $# -gt 0 ]; do case "$1" in
  --label) [ $# -ge 2 ] || usage "--label needs a value"; label="$2"; shift 2;;
  --short) short=short; shift;;
  --max-min) [ $# -ge 2 ] || usage "--max-min needs a value"; max_min="$2"; shift 2
             case "$max_min" in ''|*[!0-9]*) usage "--max-min $max_min is not a whole number of minutes";; esac;;
  *) usage "unknown arg $1";;
esac; done
# The cap (P47, 2026-10-05: a mutant's synchronous infinite loop held a slot 13+ min; vitest's testTimeout cannot stop one). No cap only on an
# explicit --max-min 0: a stray exported 0 must never switch the cap off for every run of a session.
if [ -z "$max_min" ]; then
  max_min="${GISIK_RUN_MAX_MIN:-30}"
  case "$max_min" in *[!0-9]*) usage "GISIK_RUN_MAX_MIN=$max_min is not a whole number of minutes";; esac
  [ "$((10#$max_min))" -gt 0 ] || usage "GISIK_RUN_MAX_MIN=0 is refused: no cap only with an explicit --max-min 0"
fi
max_min=$((10#$max_min))
per_min="${CTL_RUN_SECS_PER_MIN:-60}"; case "$per_min" in ''|*[!0-9]*) per_min=60;; esac
grace="${CTL_RUN_KILL_GRACE_SECS:-10}"; case "$grace" in ''|*[!0-9]*) grace=10;; esac
cap_secs=$((max_min * per_min))
if [ "$max_min" -gt 0 ]; then capnote="cap $max_min min of slot time (then TERM the group, KILL ${grace} s later, exit 124)"; else capnote="no cap (--max-min 0)"; fi
[ "$seen" = 1 ] && [ "${#cmd[@]}" -gt 0 ] || usage "no command after --"
[ -n "$label" ] || label="${cmd[0]##*/}"
ctl_node22 || exit 1
[ -d "$CTL_REPO" ] || { echo "FAIL run-tests no such worktree $CTL_REPO"; exit 64; }
if [ "$explicit_repo" = 1 ]; then rundir="$CTL_REPO"; else rundir="$PWD"; fi
shown="${cmd[*]}"; [ "${#shown}" -le 120 ] || shown="${shown:0:119}…"
# Playwright ports (13.2281-13.2282): the two browser packages pin their dev-server port (KG 3191, FG 3192) with `reuseExistingServer: false`, so a second run of
# the same package on the same port is RED ("already used"), not a wait. A command that names Playwright or either package (or runs in its directory, or through
# turbo) gets a FREE port of its own in KG_PW_PORT / FG_PW_PORT (verbs/pw-ports.py: the window of its slot, first port nothing listens on, wildcard listeners included); a value the caller already
# exported stays. Anything else runs with its environment untouched. The trigger reads the WHOLE command, never $shown (cut to 120 characters for display).
pw_ports=""
case "${cmd[*]} $rundir" in *playwright*|*graph-browser*|*turbo*) pw_ports=1;; esac
pw_exports() {   # $1 = slot (0 = a dry-run holds none): sets KG_PW_PORT / FG_PW_PORT unless the caller's own are exported; prints the pair
  local pair kg fg; pair="$(python3 "$HERE/verbs/pw-ports.py" "$1")" || return 1
  kg="${pair% *}"; fg="${pair#* }"
  [ -n "${KG_PW_PORT:-}" ] || KG_PW_PORT="$kg"; [ -n "${FG_PW_PORT:-}" ] || FG_PW_PORT="$fg"
  export KG_PW_PORT FG_PW_PORT
}
if [ "$CTL_DRY_RUN" = 1 ]; then
  portnote=""; if [ -n "$pw_ports" ]; then pw_exports 0 || ctl_fail run-tests "no free Playwright ports"; portnote=" with KG_PW_PORT=$KG_PW_PORT FG_PW_PORT=$FG_PW_PORT"; fi
  shortnote=""; [ -z "$short" ] || shortnote="; --short: express slot 1..$(ctl_sem_express_slots) when no normal slot is available, SHORT-OVERRUN logged past $(ctl_sem_short_max) s"
  echo "DRY: acquire a slot (1..$(ctl_sem_slots) in $(ctl_sem_dir); waits while a gate runs and at least $(ctl_sem_gate_slots) slot(s) are held (CTL_SEM_GATE_SLOTS), memory pressure is not normal, or swap-in is high)$shortnote, then in $rundir: $shown > $(ctl_log run-tests)$portnote; $capnote"
  ctl_ok run-tests "dry-run"
fi
log="$(ctl_log run-tests)"
child=""
# Stop the command AND everything under it: it runs in its own process group (set -m below), so `pnpm exec vitest` and its node workers all get
# the signal. Signalling only the direct child left the vitest workers orphaned at ppid 1 (measured 2026-10-03: two workers after a TERM) — and
# `ctl gate` fails on any such orphan. TERM first, KILL after 5 s.
stop_child() {
  [ -z "$child" ] && return 0
  kill -TERM -- "-$child" 2>/dev/null
  local n=0; while [ "$n" -lt 20 ] && kill -0 "$child" 2>/dev/null; do sleep 0.25; n=$((n+1)); done
  kill -KILL -- "-$child" 2>/dev/null
  wait "$child" 2>/dev/null
  return 0
}
# The cap's timer: ONE process, `perl` exec'd in the background (no subshell, no child of its own), that sleeps the cap and then sends USR1 to
# the verb only while its parent is still the verb (`getppid`: a timer whose verb died is reparented to launchd and signals nothing, whatever
# reuses the verb's pid; 13.2329). It never signals the job: the verb does, in the job's own group only. Stopped by KILL to its own pid on every exit path,
# so no timer outlives the run, and only while it has not fired (a fired timer has exited; its pid is never signalled). Measured 2026-10-05:
# the first version, a `( … sleep N … ) &` subshell stopped through its group, left the subshell's `sleep` orphaned in 25 of 40 runs of a job
# that ends at once, and once lost a TERM in the fork window and made the verb wait out the whole sleep (13.1752's `kill -TERM $$` job).
timer=""; cap_fired=0
# M19 (KILL a fired timer too) is EQUIVALENT under test: a fired timer has exited, so only a reused pid tells them apart; the guard stays (planner 16:50).
stop_timer() { [ -z "$timer" ] && return 0; { [ "$cap_fired" = 1 ] || kill -KILL "$timer"; wait "$timer"; } 2>/dev/null; timer=""; return 0; }
# The cap's stop: TERM the job's whole group, wait up to $grace s for the GROUP (not just the leader) to empty, then KILL it. Never a pid outside it.
cap_stop() {
  local n=0
  kill -TERM -- "-$child" 2>/dev/null
  while [ "$n" -lt $((grace * 4)) ] && kill -0 -- "-$child" 2>/dev/null; do sleep 0.25; n=$((n+1)); done
  kill -KILL -- "-$child" 2>/dev/null
  n=0; while [ "$n" -lt 20 ] && kill -0 -- "-$child" 2>/dev/null; do sleep 0.1; n=$((n+1)); done
  return 0
}
# Every exit path frees its slot HERE (the normal end, a signal, the EXIT trap, the port refusal): ctl_sem_release writes the waits.tsv row and sets
# CTL_SEM_OVERRUN, and the --short contract's log line (P72) is written from that same value, so log and row never disagree. Only the call that freed
# the slot writes it — the EXIT trap after the normal end, or a TERM during the summary, adds no second line. `log` is set before the traps; a hold
# that overran before the header was written (only the port probe runs there) would start the run's own log rather than lose the line.
release_slot() { local had="${CTL_SEM_SLOT:-}"; ctl_sem_release; [ -n "$had" ] && [ -n "${CTL_SEM_OVERRUN:-}" ] && echo "SHORT-OVERRUN $label $CTL_SEM_OVERRUN" >> "$log"; return 0; }
abort() { local sig="$1"; stop_timer; stop_child; release_slot; echo "FAIL run-tests $label terminated by signal $sig — slot released"; exit $((128 + sig)); }
cleanup() { stop_timer; release_slot; }
trap cleanup EXIT
trap 'abort 2' INT
trap 'abort 15' TERM
trap 'cap_fired=1' USR1
ctl_sem_acquire "$label" "$short"; arc=$?
if [ "$arc" -ne 0 ]; then
  echo "FAIL run-tests $label no slot after ${CTL_SEM_WAITED}s (waited for: $CTL_SEM_REASONS) — nothing was run"; exit 75
fi
# A normal grant prints as it always did; an express one names its class in both forms (13.2360: the class is what the tests read).
if [ "$CTL_SEM_CLASS" = express ]; then slotname="express slot $CTL_SEM_SLOT/$CTL_SEM_SLOTS"; else slotname="slot $CTL_SEM_SLOT/$CTL_SEM_SLOTS"; fi
if [ "$CTL_SEM_REASONS" = "-" ]; then waitline="queue wait: ${CTL_SEM_WAITED}s ($slotname)"
elif [ "$CTL_SEM_CLASS" = express ]; then waitline="queue wait: ${CTL_SEM_WAITED}s (waited for: $CTL_SEM_REASONS; $slotname)"
else waitline="queue wait: ${CTL_SEM_WAITED}s (waited for: $CTL_SEM_REASONS)"; fi
portline=""
if [ -n "$pw_ports" ]; then
  # after the slot: the slot decides the window, so two concurrent runs never start on the same port
  # an express slot's window follows the normal ones (slot N+n), so it never starts in normal slot n's window
  pwslot="${CTL_SEM_SLOT:-0}"; [ "$CTL_SEM_CLASS" != express ] || pwslot=$(( $(ctl_sem_slots) + CTL_SEM_SLOT ))
  pw_exports "$pwslot" || { release_slot; echo "FAIL run-tests $label no free Playwright ports — nothing was run"; exit 1; }
  portline="ports: KG_PW_PORT=$KG_PW_PORT FG_PW_PORT=$FG_PW_PORT"
fi
{ echo "# ctl run-tests: $shown"; echo "# $waitline; in $rundir"; [ -z "$portline" ] || echo "# $portline"; echo "# $capnote"; } > "$log"
cd "$rundir" || exit 1
# The command runs as a background job with `wait`, in its OWN process group (set -m): a TERM to the verb is handled at once (bash defers a trap
# behind a foreground child) and the whole group can be stopped; no pipe, so rc is the command's own. A job killed by a signal makes bash print
# "Terminated" — silenced. stdin is /dev/null: a background group that read the terminal would be stopped.
# The cap's clock starts HERE, with the slot already held: a queue wait (up to CTL_SEM_MAX_WAIT, a gate first) never counts against it.
# The USR1 trap makes `wait` return at once. The leader still un-reaped (kill -0) is what tells a cap stop from a job that ended in the same
# instant: once `wait` has reaped it, its pid (and so its pgid) may belong to a new process group, which cap_stop must never signal. Only a
# microsecond race reaches this guard; 13.2349 freezes that race, so dropping the guard (mutant M12) is RED there (a TIMEOUT and rc 124 for a job that already
# ended; reviewer C 2026-10-05). It stays for the same reason as the timer's getppid guard: never outside the group.
# The residual (13.2349): the cap firing as the job ends. The kernel can reap the job inside `wait` while the USR1 is pending; bash then
# longjmps out of `wait` before it records the status, so rc is 128+USR1 (158 on macOS), the job's own rc is gone for good (a second `wait`
# returns 127), and the job is not alive, so no TIMEOUT either. The verb says so in the log ("CAP RACE") and keeps the 128+USR1: a false RED
# that a re-run clears, never a false green. The line fires only when that first `wait` was interrupted, i.e. rc = 128+USR1: a cap firing just
# after a normal `wait` keeps the job's own rc and logs nothing (13.2355; a job whose OWN rc is 128+USR1 still logs it, though that rc is real: a true RED).
# Weighed and rejected 2026-10-05: no timer at all, the verb polling `kill -0` and then `wait`
# (option D), and `wait -n -p` on the job and a sleeping timer (option A, a bash >= 5.1 floor; ctl is 3.2-safe). Each re-architects the
# cap for a microsecond window at its boundary.
set -m
"${cmd[@]}" >> "$log" 2>&1 < /dev/null &
child=$!
if [ "$cap_secs" -gt 0 ]; then
  perl -e '($v, $s) = @ARGV; sleep $s; kill "USR1", $v if getppid() == $v' "$$" "$cap_secs" < /dev/null > /dev/null 2>&1 &
  timer=$!
fi
{ wait "$child"; } 2>/dev/null; rc=$?
timed_out=0; capline=""
if [ "$cap_fired" = 1 ] && kill -0 "$child" 2>/dev/null; then
  timed_out=1; cap_stop; { wait "$child"; } 2>/dev/null; rc=124
  capline="TIMEOUT after $max_min min"
elif [ "$cap_fired" = 1 ] && [ "$rc" -eq $((128 + $(kill -l USR1))) ]; then
  capline="CAP RACE: the cap fired as the job ended; its own rc is lost ($rc), so re-run"
fi
stop_timer
child=""
release_slot   # the SHORT-OVERRUN line goes before the cap's, so TIMEOUT stays the log's last
[ -z "$capline" ] || echo "$capline" >> "$log"
echo "run-tests: $label — $shown (in $rundir)"
echo "$waitline"
[ -z "$portline" ] || echo "$portline"
python3 "$HERE/verbs/run-tests-summary.py" "$log" 22 "$rc"
echo "log: $log"
echo "exit code: $rc"
if [ "$timed_out" = 1 ]; then echo "FAIL run-tests $label TIMEOUT after $max_min min — its process group was stopped, slot released (rc=124, wait ${CTL_SEM_WAITED}s, log $log)"
elif [ "$rc" -eq 0 ]; then echo "OK run-tests $label rc=0 (wait ${CTL_SEM_WAITED}s, log $log)"; else echo "FAIL run-tests $label rc=$rc (wait ${CTL_SEM_WAITED}s, log $log)"; fi
exit "$rc"
