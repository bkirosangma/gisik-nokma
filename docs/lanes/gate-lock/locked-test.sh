#!/bin/bash
# Lane E's ONLY path to any test run that touches apps/server.
#
#   locked-test.sh <logfile> <command...>
#
# GATE LOCK v3 — controller ruling 2026-09-06. This file is the reference
# implementation the other four lanes copy. Invoke with run_in_background:true;
# never reproduce its body inline, because a lock taken in one Bash tool call and
# used in another records a `$$` that dies seconds later.
#
# ## Why v3: v2 had two acquisition paths and only one was sound
#
# v2 took a DIRECTORY with `mkdir` (atomic, correct) and wrote its pid INSIDE it
# as a SECOND step. That leaves a window where the lock is held but
# unattributed, and v2's reclaim treated an empty pid file as a dead holder after
# 60s. A peer whose script takes the directory and writes NO pid file is
# indistinguishable from a corpse, so v2 deleted a LIVE holder's lock and both
# sides proceeded. Lane D observed exactly that on 2026-09-06: its bare `mkdir`
# won the directory and this lane's pid appeared inside it afterwards. D's gate
# writes no pid file at all — confirmed by D — which is precisely the condition
# the reclaim was misreading.
#
# The lesson is not "write a pid file". It is that A LOCK PROTOCOL SHARED BY
# SCRIPTS THAT DIFFER IS NOT ONE PROTOCOL: v2's reclaim was safe against its own
# invariants and unsafe against a peer's, and neither script could see the
# other's assumptions.
#
# ## v3 removes the window rather than policing it
#
# `( set -o noclobber; echo $$ > "$LOCK" )` CREATES AND FILLS the lock in one
# operation: with noclobber, `>` fails if the path exists, so the create IS the
# exclusion check and the pid is written by that same redirect. There is no
# instant at which the lock is held but unattributed, so the ambiguity v2's
# reclaim had to guess about cannot arise.
#
# ## The mixed period, while other lanes still run v2
#
# An old-form DIRECTORY at this path: the redirect fails (cannot write to a
# directory), `[ -f ]` is false, so this script simply waits. It NEVER rmdirs a
# directory it did not create. And a v2 holder cannot steal a v3 lock either —
# its `mkdir` fails against an existing file. Both forms wait for each other,
# which is the whole requirement during the transition.
set -u

LOCK=/tmp/gisik-gate.lock
# WHICH TREE THIS GATES. Until v3.2 this was hard-coded to Lane E's worktree,
# and these files are copied between lanes: a peer that copied the FILE gated
# Lane E's tree and read Lane E's `check:env` exit while believing it had
# measured its own (Lane B, 2026-09-06). A wrong tree here does not fail — it
# returns a well-formed green about somebody else's work.
#
# Resolution order, and it FAILS LOUDLY rather than falling back to anyone's
# tree: $GATE_REPO if set (for a copy run from a scratchpad, where nothing
# relative to $0 can find the repo), else the caller's cwd. A git WORKTREE has
# `.git` as a FILE, not a directory, so both forms are accepted.
REPO="${GATE_REPO:-$PWD}"
if [ ! -e "$REPO/.git" ]; then
  echo "FATAL: '$REPO' is not the root of a git worktree." >&2
  echo "Run this from your worktree root, or set GATE_REPO=/path/to/your/worktree." >&2
  exit 3
fi
OUT="${1:?usage: locked-test.sh <logfile> <command...>}"
shift

# Peer gate scripts, counted as PROCESSES, excluding this one.
#
# NOT `pgrep -fl … | grep -vc`, which the v3 ruling proposed: that is a LINE
# count, and a Claude session's argv carries its entire multi-line brief, so ONE
# matching process emits hundreds of lines. MEASURED — `pgrep -fl
# 'gisik-gate.lock' | wc -l` returns 371 where `pgrep -f` returns 1. Since the
# ruling itself quotes both script names, any lane holding it in argv would make
# that expression permanently non-zero, the empty-file reclaim could never fire,
# and a genuinely orphaned lock would wedge all five lanes forever. Requiring
# `comm` to be a shell excludes a `claude` process by what it IS, not by luck.
#
# THREE exclusions/broadenings, each measured against a LIVE peer gate rather
# than a synthetic one, and the second and third were found only that way:
#
#  1. self  — this script's own pid.
#  2. PARENT — the tool shell that ran `bash gate.sh` carries that string in its
#     own argv, so from inside the script it would count as a peer forever.
#     (Controller's addition, v3.1.)
#  3. `gate[^ /]*\.sh`, NOT `gate\.sh` — the controller's own gate is named
#     `gate19.sh`, and neither the narrow awk pattern nor the ruling's
#     `pgrep -f 'gate.sh'` matches it: as a regex, `gate.sh` wants exactly ONE
#     character between "gate" and "sh". Measured at one instant with a live
#     gate running: broadened form 2, narrow form 0, `pgrep -f` 0. A lane whose
#     script is named anything but exactly `gate.sh` is invisible to the
#     un-broadened check, which is the same class of blindness as counting
#     lines instead of processes.
#  4. Match a PATH TOKEN in argv, not the whole line. A first attempt used
#     `$0 ~ /gate…/`, which matched the awk program's OWN caller, because this
#     comment and that pattern both contain the strings. Its positive control
#     then read 0 against two live gate-shaped processes — the field offset was
#     wrong too ($4 is the script path, not $3). Both were found only by starting
#     real gate-shaped processes and requiring the matcher to see them; a zero
#     from a matcher never watched to fire is not a measurement.
peer_gates() {
  # 5. EXCLUDE THIS FUNCTION'S OWN COMMAND-SUBSTITUTION SUBSHELL, and capture its
  #    pid with a PLAIN ASSIGNMENT FIRST. `pg=$(peer_gates)` forks a subshell
  #    that inherits this script's argv, so `ps` shows it as a bash process
  #    carrying `locked-test.sh` — a peer by every term of the predicate. It is
  #    not excluded by `self`: inside `$( )`, `$$` is still the PARENT's pid.
  #    v3.2 therefore counted itself, `peer_gates` never returned 0, and the
  #    empty-lock reclaim below could never fire — the wedge v3 exists to remove.
  #
  #    `-v fork=$BASHPID` written INLINE IN THE AWK ARGUMENT LIST DOES NOT FIX
  #    IT. Bash expands that argument in the child it forks for `awk`, so it
  #    yields AWK's pid, and awk is excluded by `comm` already. Measured on this
  #    machine, one live peer gate present throughout:
  #
  #      inline `-v fork=$BASHPID`        -> fork arg 98845 (awk)      count 2
  #      captured first, as below         -> fork arg 98846 (subshell) count 1
  #
  #    with a gate-shaped SLEEPER started (never a copy of this script, which
  #    would only prove the instrument counts instruments): 3 and 2. Reaped: 2
  #    and 1. The inline form is the captured form plus one, always — it never
  #    excludes anything real. The assignment must therefore be its own simple
  #    command, executed by the substitution subshell before any pipeline fork.
  local fork=$BASHPID
  ps -eo pid=,comm=,args= | awk -v self=$$ -v parent=$PPID -v fork="$fork" '
    { c = $2; sub(/.*\//, "", c); hit = 0
      # Fields 3..NF are the argv; the SCRIPT PATH is a token in there (field 4
      # for `bash /path/gate19.sh`). Requiring a token that ENDS in the script
      # name is what separates "a shell running a gate" from "a shell whose
      # command line merely mentions one" — including this very awk program,
      # which contains both names and would otherwise match its own caller.
      for (i = 3; i <= NF; i++)
        if ($i ~ /(^|\/)(gate[^\/]*|locked-test[^\/]*)\.sh$/) hit = 1 }
    (c == "bash" || c == "sh" || c == "zsh") && hit &&
    $1 != self && $1 != parent && $1 != fork { n++ }
    END { print n + 0 }'
}
# `node (vitest N)` DOES render on macOS — measured against a real pool after an
# earlier reading claimed it could not. That reading came from two `ps` calls at
# two instants on a quiet machine: a fact about a moment, read as a fact about
# the matcher.
live_pools() { ps -eo comm= | grep -c '^node (vitest' || true; }

empty_wait=0
until ( set -o noclobber; echo $$ > "$LOCK" ) 2>/dev/null; do
  if [ -f "$LOCK" ]; then
    p=$(cat "$LOCK" 2>/dev/null)
    if [ -n "$p" ]; then
      if ! ps -p "$p" >/dev/null 2>&1; then
        echo "RECLAIMING stale lock: holder $p is dead"
        rm -f "$LOCK"
      fi
      empty_wait=0
    else
      # An empty FILE means a crash between open and write — genuinely narrow,
      # unlike v2's window. Ten minutes AND an observably idle machine, because
      # "nobody is coming back" must be measured, never inferred.
      empty_wait=$((empty_wait + 15))
      if [ "$empty_wait" -ge 600 ]; then
        pg=$(peer_gates); pl=$(live_pools)
        if [ "$pg" -eq 0 ] && [ "$pl" -eq 0 ]; then
          echo "RECLAIMING empty lock after ${empty_wait}s, machine idle (peers=$pg pools=$pl)"
          rm -f "$LOCK"
          empty_wait=0
        else
          echo "lock empty ${empty_wait}s but NOT idle (peers=$pg pools=$pl) — waiting"
        fi
      fi
    fi
  else
    echo "lock path is not a regular file (v2 directory holder) — waiting"
  fi
  sleep 15
done
trap 'rm -f "$LOCK"' EXIT
echo "LOCK ACQUIRED pid=$$ at $(date +%H:%M:%S)"

# Holding the lock is not enough: non-server package tests may run UNLOCKED by
# protocol, so a peer's pool can already be resident. Bounded at 10 minutes, and
# proceeding is LOUD — a silent wait is indistinguishable from a hang.
drained=0
for _ in $(seq 1 40); do
  n=$(live_pools)
  [ "$n" -eq 0 ] && { drained=1; break; }
  echo "waiting for $n live vitest worker(s) to drain..."
  sleep 15
done
if [ "$drained" -eq 1 ]; then
  echo "POOLS DRAINED at $(date +%H:%M:%S) — starting"
else
  echo "WARNING: proceeding with $(live_pools) live vitest worker(s) after 10 min."
  echo "  This run shares the box. Treat a TIMEOUT below as contention, not a defect."
fi

# shellcheck disable=SC1090
. "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
nvm use 22 >/dev/null 2>&1
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
echo "NODE=$(node -v)  PNPM=$(pnpm --version)"

# cd to the REPO ROOT, and say so. Without it the command inherits the CALLER's
# cwd; from `apps/server` a full turbo gate resolves to FIVE tasks instead of
# THIRTY and still prints EXIT=0 — a false green distinguishable only by reading
# the `Tasks:` line, which is why that line is echoed below.
cd "$REPO" || { echo "FATAL: cannot cd to $REPO"; exit 3; }
echo "CWD=$(pwd)"

# Sweep orphaned test databases BEFORE running, never only after: `drop()` lives
# in `afterAll`, so the cleanup that exists is exactly the one that does NOT run
# when a suite is killed. Idle-only — a `gisik_test_*` with a live backend is a
# PEER'S RUNNING SUITE.
echo "=== orphaned test-database sweep (before the run) ==="
bash "$(dirname "$0")/sweep-test-dbs.sh" || echo "sweep failed — continuing, it is not the gate"

"$@" > "$OUT" 2>&1
code=$?
echo "EXIT=$code"

echo "=== Tasks / Cached / Time ==="
grep -E '^ *(Tasks|Cached|Time|Failed):' "$OUT"
echo "=== vitest totals ==="
grep -E 'Test Files +[0-9]|Tests +[0-9]' "$OUT"
echo "=== 'Unsupported engine' (expect 0) ==="
grep -c 'Unsupported engine' "$OUT"
echo "=== failures / timeouts ==="
grep -nE 'FAIL|✗|AssertionError|error TS|Error:|timed out|Timeout' "$OUT" | head -40

# `check:env` is NOT in the turbo build/test/typecheck graph, so a green gate
# says nothing about it. #85's false green is the precedent.
echo "=== check:env (SEPARATE from the gate — not in the turbo graph) ==="
node "$REPO/scripts/check-env-example.mjs" 2>&1 | tail -3
echo "CHECK_ENV_EXIT=${PIPESTATUS[0]}"

echo "=== log kept at: $OUT ==="

# Reap ORPHANED workers only. The orphan criterion is ppid=1 (reparented to
# launchd), NOT the word "vitest": `pgrep -f vitest` matches every lane's Claude
# session, because each session's argv embeds a brief containing the word, and it
# also matches a PEER'S LIVE POOL.
orphans=$(ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}')
if [ -n "$orphans" ]; then
  echo "ORPHANED vitest workers (ppid=1), killing: $orphans"
  # shellcheck disable=SC2086
  kill -9 $orphans 2>/dev/null
else
  echo "no orphaned vitest workers"
fi
exit $code
