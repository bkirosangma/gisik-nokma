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
# Where the command runs: the CALLER's directory, or --repo W's when given. Every other verb cd's to CTL_REPO, but this one wraps a command whose meaning depends on
# its directory (`pnpm exec vitest run test/x` from a package dir; `pnpm test` there is NOT the root's whole-monorepo `turbo run test`). CTL_REPO is derived from $PWD,
# so the caller's directory is always inside it.
explicit_repo=0; for a in ${left[@]+"${left[@]}"}; do [ "$a" = --repo ] && explicit_repo=1; done
usage() { echo "FAIL run-tests $1 — usage: ctl run-tests [--repo W] [--label L] -- <command…>"; exit 64; }
ctl_parse_common ${left[@]+"${left[@]}"} || exit 64
label=""
set -- ${CTL_ARGS[@]+"${CTL_ARGS[@]}"}
while [ $# -gt 0 ]; do case "$1" in --label) [ $# -ge 2 ] || usage "--label needs a value"; label="$2"; shift 2;; *) usage "unknown arg $1";; esac; done
[ "$seen" = 1 ] && [ "${#cmd[@]}" -gt 0 ] || usage "no command after --"
[ -n "$label" ] || label="${cmd[0]##*/}"
ctl_node22 || exit 1
[ -d "$CTL_REPO" ] || { echo "FAIL run-tests no such worktree $CTL_REPO"; exit 64; }
if [ "$explicit_repo" = 1 ]; then rundir="$CTL_REPO"; else rundir="$PWD"; fi
shown="${cmd[*]}"; [ "${#shown}" -le 120 ] || shown="${shown:0:119}…"
# Playwright ports (13.2281-13.2282): the two browser packages pin their dev-server port (KG 3191, FG 3192) with `reuseExistingServer: false`, so a second run of
# the same package on the same port is RED ("already used"), not a wait. A command that names Playwright or either package (or runs in its directory, or through
# turbo) gets a FREE port of its own in KG_PW_PORT / FG_PW_PORT (verbs/pw-ports.py: the window of its slot, first port nothing listens on); a value the caller already
# exported stays. Anything else runs with its environment untouched.
pw_ports=""
case "$shown $rundir" in *playwright*|*graph-browser*|*turbo*) pw_ports=1;; esac
pw_exports() {   # $1 = slot (0 = a dry-run holds none): sets KG_PW_PORT / FG_PW_PORT unless the caller's own are exported; prints the pair
  local pair kg fg; pair="$(python3 "$HERE/verbs/pw-ports.py" "$1")" || return 1
  kg="${pair% *}"; fg="${pair#* }"
  [ -n "${KG_PW_PORT:-}" ] || KG_PW_PORT="$kg"; [ -n "${FG_PW_PORT:-}" ] || FG_PW_PORT="$fg"
  export KG_PW_PORT FG_PW_PORT
}
if [ "$CTL_DRY_RUN" = 1 ]; then
  portnote=""; if [ -n "$pw_ports" ]; then pw_exports 0 || ctl_fail run-tests "no free Playwright ports"; portnote=" with KG_PW_PORT=$KG_PW_PORT FG_PW_PORT=$FG_PW_PORT"; fi
  echo "DRY: acquire a slot (1..$(ctl_sem_slots) in $(ctl_sem_dir); waits while a gate runs and at least $(ctl_sem_gate_slots) slot(s) are held (CTL_SEM_GATE_SLOTS), memory pressure is not normal, or swap-in is high), then in $rundir: $shown > $(ctl_log run-tests)$portnote"
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
abort() { local sig="$1"; stop_child; ctl_sem_release; echo "FAIL run-tests $label terminated by signal $sig — slot released"; exit $((128 + sig)); }
cleanup() { ctl_sem_release; }
trap cleanup EXIT
trap 'abort 2' INT
trap 'abort 15' TERM
ctl_sem_acquire "$label"; arc=$?
if [ "$arc" -ne 0 ]; then
  echo "FAIL run-tests $label no slot after ${CTL_SEM_WAITED}s (waited for: $CTL_SEM_REASONS) — nothing was run"; exit 75
fi
if [ "$CTL_SEM_REASONS" = "-" ]; then waitline="queue wait: ${CTL_SEM_WAITED}s (slot $CTL_SEM_SLOT/$CTL_SEM_SLOTS)"; else waitline="queue wait: ${CTL_SEM_WAITED}s (waited for: $CTL_SEM_REASONS)"; fi
portline=""
if [ -n "$pw_ports" ]; then
  # after the slot: the slot decides the window, so two concurrent runs never start on the same port
  pw_exports "${CTL_SEM_SLOT:-0}" || { ctl_sem_release; echo "FAIL run-tests $label no free Playwright ports — nothing was run"; exit 1; }
  portline="ports: KG_PW_PORT=$KG_PW_PORT FG_PW_PORT=$FG_PW_PORT"
fi
{ echo "# ctl run-tests: $shown"; echo "# $waitline; in $rundir"; [ -z "$portline" ] || echo "# $portline"; } > "$log"
cd "$rundir" || exit 1
# The command runs as a background job with `wait`, in its OWN process group (set -m): a TERM to the verb is handled at once (bash defers a trap
# behind a foreground child) and the whole group can be stopped; no pipe, so rc is the command's own. A job killed by a signal makes bash print
# "Terminated" — silenced. stdin is /dev/null: a background group that read the terminal would be stopped.
set -m
"${cmd[@]}" >> "$log" 2>&1 < /dev/null &
child=$!
{ wait "$child"; } 2>/dev/null; rc=$?
child=""
ctl_sem_release
echo "run-tests: $label — $shown (in $rundir)"
echo "$waitline"
[ -z "$portline" ] || echo "$portline"
python3 "$HERE/verbs/run-tests-summary.py" "$log" 22 "$rc"
echo "log: $log"
echo "exit code: $rc"
if [ "$rc" -eq 0 ]; then echo "OK run-tests $label rc=0 (wait ${CTL_SEM_WAITED}s, log $log)"; else echo "FAIL run-tests $label rc=$rc (wait ${CTL_SEM_WAITED}s, log $log)"; fi
exit "$rc"
