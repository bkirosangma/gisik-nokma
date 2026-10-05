#!/usr/bin/env bash
# scripts/ctl/test/run-tests-cap.test.sh — `ctl run-tests --max-min`: the wall-clock cap on SLOT time (13.2320-13.2326, 13.2328, 13.2329 and 13.2349,
# test-cases/13-deploy-and-ops.md); run by `ctl selftest`. Every case id starts its check's name.
# The legs use the REAL clock and real processes (a cap is a timer: a fake clock would prove nothing about it), scaled by the verb's seams:
# CTL_RUN_SECS_PER_MIN=1 (a "minute" of cap is 1 s, so `--max-min 2` takes the production path and prints `TIMEOUT after 2 min`) and
# CTL_RUN_KILL_GRACE_SECS=1. The memory/swap probes are PATH stubs that always read healthy, so a leg never waits on the machine's load.
# Every run sits under an alarm (`bounded`), and every job writes its pids to a file that `reap` kills after each leg: a mutant that never
# fires the cap fails its leg in seconds and leaves no CPU spinner behind on the shared machine.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
. "$HERE/sem.sh"   # ctl_sem_lstart: a planted holder must read as live to the verb
fails=0
. "$HERE/test/harness.sh"   # check NAME CODE, and the CTL_TEST_ONLY case filter

fx=$(cd "$(mktemp -d)" && pwd -P)
reap() { local p; while read -r p; do kill -KILL "$p" 2>/dev/null; done < "$fx/pids" 2>/dev/null; : > "$fx/pids"; }
cleanup() { reap; kill "${sib:-}" 2>/dev/null; rm -rf "$fx"; }
trap cleanup EXIT
FB="$fx/bin"; mkdir -p "$FB" "$fx/logs"; : > "$fx/pids"
export CTL_SEM_DIR="$fx/sem" CTL_LOG_DIR="$fx/logs" FXP="$fx/pids"   # NEVER the machine's real semaphore
unset CTL_TEST_SLOTS CTL_SEM_MAX_WAIT CTL_SEM_GATE_SLOTS GISIK_RUN_MAX_MIN CTL_RUN_SECS_PER_MIN CTL_RUN_KILL_GRACE_SECS
repo="$fx/repo"; mkdir -p "$repo"; ( cd "$repo" && /usr/bin/git init -q . )
cat > "$FB/memory_pressure" <<'STUB'
#!/bin/sh
echo "System-wide memory free percentage: 60%"
STUB
printf '#!/bin/sh\necho 1\n' > "$FB/sysctl"
printf '#!/bin/sh\necho "Mach Virtual Memory Statistics: (page size of 16384 bytes)"\necho "Swapins:  0."\n' > "$FB/vm_stat"
chmod +x "$FB"/*

reset() { reap; rm -rf "$CTL_SEM_DIR" "$CTL_LOG_DIR"/* "$fx"/j.*; mkdir -p "$CTL_SEM_DIR"; }
# bounded SECS CMD…: CMD under an alarm (perl: alarm survives exec); a verb that hangs dies by SIGALRM (rc 142), never the suite.
bounded() { local s="$1"; shift; perl -e 'alarm shift; exec @ARGV' "$s" "$@"; }
rt() { ( cd "$repo" && PATH="$FB:$PATH" CTL_SEM_POLL_SECS=1 CTL_SEM_SAMPLE_SECS=0 CTL_RUN_SECS_PER_MIN=1 CTL_RUN_KILL_GRACE_SECS="${RT_GRACE:-1}" CTL_DRY_RUN=0 bounded "${RT_ALARM:-40}" "$HERE/ctl" run-tests --repo "$repo" "$@" 2>&1 ); }
lastlog() { ls -t "$CTL_LOG_DIR"/run-tests-*.log 2>/dev/null | head -1; }
gone() { local st; st="$(ps -o stat= -p "$1" 2>/dev/null | tr -d ' ')"; [ -z "$st" ] || [ "${st#Z}" != "$st" ]; }   # no process, or a zombie awaiting its reaper
slots_left() { ls "$CTL_SEM_DIR" 2>/dev/null | grep -c '^slot-'; }
now() { date +%s; }

# THE HUNG JOB (sh "$fx/hung.sh" PREFIX): a leader that records its pid and group, a CPU spinner that IGNORES TERM (only the KILL after the
# grace stops it), and a polite child that writes PREFIX.polite on TERM and exits (only a TERM sent to the GROUP reaches it before the KILL).
cat > "$fx/hung.sh" <<'SH'
echo $$ >> "$FXP"; echo $$ > "$1.leader"; ps -o pgid= -p $$ | tr -d " " > "$1.pgid"; date +%s > "$1.start"
bash -c 'trap "" TERM; while :; do :; done' & echo $! >> "$FXP"; echo $! > "$1.spin"
bash -c 'trap "echo term > \"$0.polite\"; exit 0" TERM; while :; do sleep 0.2; done' "$1" & echo $! >> "$FXP"; echo $! > "$1.politepid"
wait
SH

# ---- 13.2320 the cap fires: a job past --max-min is stopped (its whole group), 124, TIMEOUT, slot freed ----
reset; t0=$(now); out=$(rt --label capx --max-min 2 -- sh "$fx/hung.sh" "$fx/j.a"); rc=$?; t1=$(now); log=$(lastlog)
spin=$(cat "$fx/j.a.spin" 2>/dev/null); leader=$(cat "$fx/j.a.leader" 2>/dev/null); polite=$(cat "$fx/j.a.politepid" 2>/dev/null)
check "13.2320 a job that holds its slot past --max-min 2 (scaled: 2 s) is stopped: exit 124, the log's LAST line is exactly 'TIMEOUT after 2 min', the summary's last line says TIMEOUT, the slot is freed, the TERM-ignoring CPU spinner and its leader are both gone, and the polite child got the group's TERM (its file) and is gone too" \
  '[ $rc -eq 124 ] && [ "$(tail -1 "$log")" = "TIMEOUT after 2 min" ] && printf "%s\n" "$out" | tail -1 | grep -q "^FAIL run-tests capx TIMEOUT after 2 min — its process group was stopped, slot released (rc=124" && [ "$(slots_left)" = 0 ] && [ -n "$spin" ] && gone "$spin" && [ -n "$leader" ] && gone "$leader" && [ -f "$fx/j.a.polite" ] && [ -n "$polite" ] && gone "$polite"'
check "13.2320 …within the cap + the KILL grace + a margin (2 + 1 + 4 s of wall clock, the spinner needed the KILL), and the log header names the cap" \
  '[ $((t1 - t0)) -ge 3 ] && [ $((t1 - t0)) -le 7 ] && grep -qx "# cap 2 min of slot time (then TERM the group, KILL 1 s later, exit 124)" "$log"'

# A job whose whole group exits on the TERM must not sit out the grace: the wait ends once the GROUP is empty (reviewer P11, a clause-drop of the
# group-empty test survived every leg above, whose spinner always needs the KILL).
reset; t0=$(now); op=$(RT_GRACE=10 rt --label politeall --max-min 2 -- sh -c 'echo $$ >> "$FXP"; trap "exit 0" TERM; while :; do sleep 0.2; done'); rp=$?; t1=$(now); lp=$(lastlog)
check "13.2320 …a job whose whole group exits on the TERM ends the stop at once: under a 10 s grace it returns 124 + TIMEOUT within the 2 s cap + 5 s, never cap + grace (CONTROL: the cap fired, the log's last line is the TIMEOUT)" \
  '[ $rp -eq 124 ] && [ "$(tail -1 "$lp")" = "TIMEOUT after 2 min" ] && [ $((t1 - t0)) -le 7 ]'

# ---- 13.2321 under the cap the job's own exit code, and a job's OWN 124 prints no TIMEOUT ----
# logtext: the run's whole log, read NOW (the next reset removes it; a grep of a missing file would make `! grep` pass on nothing)
logtext() { local l; l="$(lastlog)"; [ -n "$l" ] && cat "$l"; }
reset; o0=$(rt --label ok0 --max-min 5 -- sh -c 'sleep 1; echo body0; exit 0'); r0=$?; l0=$(logtext)
reset; o1=$(rt --label ok1 --max-min 5 -- sh -c 'sleep 1; echo body1; exit 1'); r1=$?; l1=$(logtext)
reset; o4=$(rt --label own124 --max-min 5 -- sh -c 'echo body4; exit 124'); r4=$?; l4=$(logtext)
check "13.2321 a job under the cap keeps its own exit code: rc 0 (OK line) and rc 1 (FAIL rc=1), neither with a TIMEOUT or a CAP RACE line (13.2349) in the log (CONTROL: the log was read, its body line is there) or the output" \
  '[ $r0 -eq 0 ] && printf "%s\n" "$o0" | tail -1 | grep -q "^OK run-tests ok0 rc=0" && [ $r1 -eq 1 ] && printf "%s\n" "$o1" | tail -1 | grep -q "^FAIL run-tests ok1 rc=1 " && printf "%s\n" "$l0" | grep -qx body0 && printf "%s\n" "$l1" | grep -qx body1 && ! printf "%s\n%s\n%s\n%s" "$l0" "$l1" "$o0" "$o1" | grep -qE "TIMEOUT|CAP RACE"'
check "13.2321 the discriminator is 124 PLUS the TIMEOUT line: a command's own exit 124 is rc 124 with 'FAIL … rc=124' and NO TIMEOUT line anywhere (CONTROL: its log was read)" \
  '[ $r4 -eq 124 ] && printf "%s\n" "$o4" | tail -1 | grep -q "^FAIL run-tests own124 rc=124 " && printf "%s\n" "$l4" | grep -qx body4 && ! printf "%s\n%s" "$l4" "$o4" | grep -q TIMEOUT'

# ---- 13.2322 the clock starts at the slot grant: the queue wait never counts ----
# One slot, held from OUTSIDE by a live process for 6 s (longer than the 3 s cap), then freed; the job waits for it with a REAL wait.
holdslot() { local p; sleep 600 & p=$!; echo "$p" >> "$fx/pids"; mkdir -p "$CTL_SEM_DIR/slot-1"; printf '%s|%s|outside|0\n' "$p" "$(ctl_sem_lstart "$p")" > "$CTL_SEM_DIR/slot-1/holder"
  ( sleep "$1"; rm -rf "$CTL_SEM_DIR/slot-1"; kill "$p" ) > /dev/null 2>&1 & }
reset; holdslot 6; q0=$(now); oq=$(CTL_TEST_SLOTS=1 rt --label queued --max-min 3 -- sh -c 'date +%s > "$1.start"; sleep 2; echo ran-to-the-end' x "$fx/j.q"); rq=$?; lq=$(lastlog)
check "13.2322 a job queued 6 s behind a held slot, then 2 s in its slot under a 3 s cap, runs to completion: rc 0, its last output line is in the log, no TIMEOUT (precondition: it really queued ≥ 5 s, the start is ≥ 5 s after the call)" \
  '[ $rq -eq 0 ] && grep -qx ran-to-the-end "$lq" && ! grep -q TIMEOUT "$lq" && [ $(( $(cat "$fx/j.q.start") - q0 )) -ge 5 ] && printf "%s" "$oq" | grep -q "^queue wait: [5-9]s (waited for: slots)"'
reset; holdslot 6; oh=$(CTL_TEST_SLOTS=1 rt --label queuedhung --max-min 3 -- sh "$fx/hung.sh" "$fx/j.h"); rh=$?; th=$(now); lh=$(lastlog)
check "13.2322 …and a HUNG job behind the same queue is still capped, after a full cap of SLOT time: rc 124 + TIMEOUT after 3 min, ≥ 3 s from its own start to the verb's end (a clock started at the queue would kill it at once, or never)" \
  '[ $rh -eq 124 ] && [ "$(tail -1 "$lh")" = "TIMEOUT after 3 min" ] && [ -f "$fx/j.h.start" ] && [ $(( th - $(cat "$fx/j.h.start") )) -ge 3 ] && gone "$(cat "$fx/j.h.spin")"'

# ---- 13.2323 the job runs in its OWN process group, and nothing outside it is killed ----
sleep 600 & sib=$!   # a sibling in the CALLER's group (this shell has no job control): what a kill of the wrong group would take
reset; og=$(rt --label grp --max-min 2 -- sh "$fx/hung.sh" "$fx/j.g"); rg=$?
mypg=$(ps -o pgid= -p $$ | tr -d ' ')
check "13.2323 the job is the leader of its own process group (pgid = its pid, not the caller's group), and after its TIMEOUT a sibling in the caller's group is still alive and the verb itself returned 124 (it did not signal its own group)" \
  '[ -s "$fx/j.g.pgid" ] && [ "$(cat "$fx/j.g.pgid")" = "$(cat "$fx/j.g.leader")" ] && [ "$(cat "$fx/j.g.pgid")" != "$mypg" ] && kill -0 "$sib" 2>/dev/null && [ $rg -eq 124 ]'
kill "$sib" 2>/dev/null; wait "$sib" 2>/dev/null; sib=""

# ---- 13.2324 the flag, the env default and the refusals ----
reset
dd=$(rt --dry-run -- true); de=$(GISIK_RUN_MAX_MIN=20 rt --dry-run -- true); dz=$(rt --max-min 0 --dry-run -- true); dl=$(rt --max-min 08 --dry-run -- true)
dx=$(GISIK_RUN_MAX_MIN=7 rt --max-min 4 --dry-run -- true)
check "13.2324 --dry-run names the cap: the default is 30 min, GISIK_RUN_MAX_MIN=20 names 20, an explicit --max-min 4 beats the env's 7, --max-min 08 is 8, --max-min 0 is 'no cap'" \
  'printf "%s" "$dd" | grep -q "; cap 30 min of slot time (then TERM the group, KILL 1 s later, exit 124)\$" && printf "%s" "$de" | grep -q "; cap 20 min of slot time" && printf "%s" "$dx" | grep -q "; cap 4 min of slot time" && printf "%s" "$dl" | grep -q "; cap 8 min of slot time" && printf "%s" "$dz" | grep -q "; no cap (--max-min 0)\$"'
bad() { local o r; o=$("$@"); r=$?; [ $r -eq 64 ] && printf "%s\n" "$o" | tail -1 | grep -q "^FAIL run-tests $BADMSG"; }
check "13.2324 refusals are exit 64 and run nothing: GISIK_RUN_MAX_MIN=0 (no cap only with an explicit flag), GISIK_RUN_MAX_MIN=abc, --max-min abc, --max-min '' (empty), --max-min -1, --max-min with no value" \
  '( BADMSG="GISIK_RUN_MAX_MIN=0 is refused: no cap only with an explicit --max-min 0"; GISIK_RUN_MAX_MIN=0 bad rt --dry-run -- true ) && ( BADMSG="GISIK_RUN_MAX_MIN=abc is not a whole number"; GISIK_RUN_MAX_MIN=abc bad rt -- true ) && ( BADMSG="--max-min abc is not a whole number"; bad rt --max-min abc -- true ) && ( BADMSG="--max-min  is not a whole number"; bad rt --max-min "" -- true ) && ( BADMSG="--max-min -1 is not a whole number"; bad rt --max-min -1 -- true ) && ( BADMSG="--max-min needs a value"; bad rt --max-min ) && [ -z "$(ls "$CTL_LOG_DIR")" ]'

# The seams' PRODUCTION defaults (every other leg sets both): a minute of cap is 60 s, the TERM→KILL grace 10 s (reviewer P11: /10 on either survived).
TD=$(( 5000 + ($$ * 11 + RANDOM) % 4000 ))
reset; ( cd "$repo" && PATH="$FB:$PATH" CTL_SEM_POLL_SECS=1 CTL_SEM_SAMPLE_SECS=0 CTL_DRY_RUN=0 bounded 40 "$HERE/ctl" run-tests --repo "$repo" --label dflt --max-min "$TD" -- sh -c 'sleep 1; ps -axo command= | awk -v t="$1" '"'"'$NF == t && $1 != "awk"'"'"' | wc -l | tr -d " " > "$2.during"' x "$((TD * 60))" "$fx/j.d" > /dev/null 2>&1 ); during_dflt=$(cat "$fx/j.d.during" 2>/dev/null)
dg=$( cd "$repo" && PATH="$FB:$PATH" CTL_DRY_RUN=0 bounded 40 "$HERE/ctl" run-tests --repo "$repo" --max-min 3 --dry-run -- true 2>&1 )
check "13.2324 …with both seams unset (production): the timer sleeps --max-min × 60 s (one process whose last argument is N×60, seen from inside the job) and the grace is 10 s (the dry-run names 'KILL 10 s later')" \
  '[ "$during_dflt" = 1 ] && printf "%s" "$dg" | grep -q "; cap 3 min of slot time (then TERM the group, KILL 10 s later, exit 124)\$"'

# ---- 13.2325 the env default really caps a run, and an explicit 0 really is no cap ----
reset; oe=$(GISIK_RUN_MAX_MIN=2 rt --label envcap -- sh "$fx/hung.sh" "$fx/j.e"); re=$?
reset; oz=$(GISIK_RUN_MAX_MIN=1 rt --label nocap --max-min 0 -- sh -c 'sleep 3; echo outlived-the-env-cap'); rz=$?; lz=$(lastlog)
check "13.2325 GISIK_RUN_MAX_MIN=2 caps a hung run (rc 124, TIMEOUT after 2 min); --max-min 0 over GISIK_RUN_MAX_MIN=1 lets a 3 s job finish (rc 0, its output in the log, no TIMEOUT)" \
  '[ $re -eq 124 ] && printf "%s\n" "$oe" | tail -1 | grep -q "TIMEOUT after 2 min" && [ $rz -eq 0 ] && grep -qx outlived-the-env-cap "$lz" && ! grep -q TIMEOUT "$lz"'

# ---- 13.2326 no timer outlives its run ----
# The timer sleeps the scaled cap: `--max-min $TM` (a value of this run's own, 5000-9999) makes it a process whose LAST argument is $TM (the perl
# timer's seconds; a subshell timer's `sleep $TM` as well), which nothing else on the machine runs, a leftover of an earlier run of this suite included.
# The verb forks the timer AFTER it starts the job, so both counts taken while the job runs settle 1 s first (inside the job, before its `ps`;
# outside, after the job's .up file): with no settle a loaded machine can count 0 before the fork.
TM=$(( 5000 + ($$ * 7 + RANDOM) % 5000 ))
ntimers() { ps -axo command= | awk -v t="$TM" '$NF == t && $1 != "awk"' | wc -l | tr -d ' '; }   # not the counting awk itself (ps shows it as `awk -v t <TM>`)
reset; rt --label tnorm --max-min "$TM" -- sh -c 'sleep 1; ps -axo command= | awk -v t="$1" '"'"'$NF == t && $1 != "awk"'"'"' | wc -l | tr -d " " > "$2.during"' x "$TM" "$fx/j.t" > /dev/null; after_norm=$(ntimers); during_norm=$(cat "$fx/j.t.during" 2>/dev/null)
reset; ( cd "$repo" && PATH="$FB:$PATH" CTL_SEM_POLL_SECS=1 CTL_SEM_SAMPLE_SECS=0 CTL_RUN_SECS_PER_MIN=1 CTL_DRY_RUN=0 exec "$HERE/ctl" run-tests --repo "$repo" --label tterm --max-min "$TM" -- sh -c 'echo $$ >> "$FXP"; : > "$1.up"; sleep 60' x "$fx/j.u" > "$fx/j.u.out" 2>&1 ) & vp=$!
n=0; while [ ! -f "$fx/j.u.up" ] && [ $n -lt 100 ]; do sleep 0.1; n=$((n+1)); done; sleep 1; during_term=$(ntimers); kill -TERM "$vp"; wait "$vp"; rterm=$?; sleep 0.3; after_term=$(ntimers)
check "13.2326 the timer is there while the job runs (CONTROL: one process ending in its scaled cap, seen from inside the job, and from outside before the TERM) and gone after the run: after a normal end, and after a TERM to the verb (exit 143, slot released)" \
  '[ "$during_norm" = 1 ] && [ "$after_norm" = 0 ] && [ "$during_term" = 1 ] && [ $rterm -eq 143 ] && [ "$after_term" = 0 ] && [ "$(slots_left)" = 0 ]'
# Jobs that end AT ONCE put the timer's stop inside its start-up: the first (subshell) timer left its `sleep` orphaned in 25 of 40 such runs.
reset; sbad=0; for k in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if [ $((k % 2)) = 0 ]; then RT_ALARM=10 rt --max-min "$TM" -- sh -c 'kill -TERM $$' > /dev/null; [ $? -eq 143 ] || sbad=$((sbad+1))
  else RT_ALARM=10 rt --max-min "$TM" -- true > /dev/null; [ $? -eq 0 ] || sbad=$((sbad+1)); fi
done; sleep 0.3; after_stress=$(ntimers)
check "13.2326 20 jobs that end at once (true, and 13.1752's self-TERM \`sh -c 'kill -TERM \$\$'\`) each return their own code (0 / 143) within 10 s and leave NO timer process behind" \
  '[ "$sbad" = 0 ] && [ "$after_stress" = 0 ]'

# ---- 13.2329 the timer signals only while its parent is the verb (its getppid guard): a live process at the verb's pid that is NOT its parent gets nothing ----
# A reused pid cannot be produced on demand, so the leg builds the same situation another way: a `perl` shim on PATH (this leg only) runs the
# timer one process further down, so the pid the timer is told to signal (the verb, alive) is no longer its parent. The guard must then keep it
# silent, and the job outlives its cap. Every other perl (the `bounded` alarm) is exec'd untouched. Mutant M18 (the guard dropped) is RED here.
realperl=$(command -v perl); SB="$fx/shimbin"; mkdir -p "$SB"
cat > "$SB/perl" <<SH
#!/bin/bash
case "\$*" in *USR1*) "$realperl" "\$@" & p=\$!; echo "\$p" >> "\$FXP"; echo "\$\$ \$PPID \$p" > "\$FXP.shim"; wait "\$p";; *) exec "$realperl" "\$@";; esac
SH
chmod +x "$SB/perl"
reset; rm -f "$FXP.shim"; os=$(PATH="$SB:$PATH" rt --label shim --max-min 2 -- sh -c 'echo $$ >> "$FXP"; sleep 4; echo outlived-the-cap'); rs=$?; ls_=$(logtext)
{ read -r shimpid shimppid perlpid < "$FXP.shim"; } 2>/dev/null
check "13.2329 a timer whose parent is not the verb never signals it: with the timer run one process down (a PATH shim), a 4 s job under a 2 s cap runs to its end (rc 0, its output in the log, no TIMEOUT in log or output) (CONTROL: the shim really ran the timer: it recorded itself, its parent and the timer's pid)" \
  '[ -n "${perlpid:-}" ] && [ -n "${shimpid:-}" ] && [ $rs -eq 0 ] && printf "%s\n" "$ls_" | grep -qx outlived-the-cap && ! printf "%s\n%s" "$ls_" "$os" | grep -q TIMEOUT'

# ---- 13.2349 the cap fires in the same instant the job exits: the residual is a visible false RED (128+USR1 + CAP RACE), never a false green ----
# The race (the job reaped inside the verb's `wait` while the cap's USR1 is pending) is built without timing luck: a `perl` shim on PATH
# replaces the timer and backgrounds a worker (the verb KILLs a timer that has not fired) that waits for the verb to sit inside its
# `{ wait; } 2>/dev/null` (its fd 2 is /dev/null) and for the job to be up, STOPs the verb, lets the job `exit 0`, waits for the job to be a
# zombie or gone (macOS: the stopped verb's own wait4 reaps it), sends USR1, then CONTs the verb: both land on the one `wait`. bash longjmps
# out of it before recording the status, so the job's 0 is lost (a second `wait` returned 127, 5 of 5; ruling C+ 2026-10-05). The job exits 0
# so that a verb reporting the lost rc as 0 is a false green this leg catches.
cat > "$SB/perl" <<'SH'
#!/bin/bash
case "$*" in *USR1*) ;; *) exec "$REALPERL" "$@";; esac
v="$3"; r="$FXP.r"
( fd() { lsof -a -p "$v" -d 2 -Fn 2>/dev/null | sed -n 's/^n//p'; }; st() { ps -o stat= -p "$1" 2>/dev/null | tr -d ' '; }
  n=0; until [ -s "$r.pid" ] && [ "$(fd)" = /dev/null ]; do sleep 0.05; n=$((n+1)); [ $n -lt 200 ] || exit 1; done
  sleep 0.3; kill -STOP "$v"; vs=$(st "$v"); vfd=$(fd); j=$(cat "$r.pid"); : > "$r.go"
  n=0; until case "$(st "$j")" in Z*|"") true;; *) false;; esac; do sleep 0.05; n=$((n+1)); [ $n -lt 200 ] || break; done
  js=$(st "$j"); js=${js:-gone}; kill -USR1 "$v" && sent=1 || sent=0; echo "$vs $vfd $js $sent" > "$r.rec"; kill -CONT "$v" ) < /dev/null > /dev/null 2>&1 &
echo $! >> "$FXP"
SH
chmod +x "$SB/perl"
reset; rm -f "$FXP".r.*; orc=$(REALPERL="$realperl" PATH="$SB:$PATH" RT_ALARM=20 rt --label race --max-min 2 -- sh -c 'echo $$ >> "$FXP"; echo $$ > "$1.pid"; n=0; until [ -f "$1.go" ] || [ $n -ge 200 ]; do sleep 0.05; n=$((n+1)); done; echo job-exits-0; exit 0' x "$FXP.r"); rrc=$?; lrc=$(logtext)
rrec=$(cat "$FXP.r.rec" 2>/dev/null); usr1rc=$((128 + $(kill -l USR1)))
check "13.2349 the cap's USR1 landing on the verb's wait as the job exits 0 (verb STOPped inside its wait, job reaped, then USR1 + CONT) is a visible false RED: rc 128+USR1 (158 on macOS), never 0, the log's last line is 'CAP RACE: … its own rc is lost (158), so re-run', and no TIMEOUT in log or output (CONTROL: the shim's worker stopped the verb inside its wait — state T, fd 2 /dev/null —, saw the job a zombie or gone and sent the USR1; the job's last line is in the log)" \
  'case "$rrec" in "T"*" /dev/null Z"*" 1"|"T"*" /dev/null gone 1") true;; *) false;; esac && printf "%s\n" "$lrc" | grep -qx job-exits-0 && [ $rrc -eq $usr1rc ] && [ "$(printf "%s\n" "$lrc" | tail -1)" = "CAP RACE: the cap fired as the job ended; its own rc is lost ($usr1rc), so re-run" ] && ! printf "%s\n%s" "$lrc" "$orc" | grep -q TIMEOUT'

# ---- 13.2328 ctl mutate, the one ctl verb that runs through run-tests, names its cap explicitly, above its own watchdog ----
cat > "$fx/rec-run-tests" <<'SH'
#!/bin/sh
echo "$*" > "$FXREC"; echo "queue wait: 0s"; echo "log: /dev/null"; exit 0
SH
chmod +x "$fx/rec-run-tests"
margs() { FXREC="$fx/j.rec.$1" CTL_MUTATE_RUN_TESTS="$fx/rec-run-tests" python3 -c '
import importlib.util, sys
spec = importlib.util.spec_from_file_location("mutate", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.slot_run("mutate-1-x.ts", sys.argv[2], ["true"], int(sys.argv[3]))' "$HERE/verbs/mutate.py" "$repo" "$1" > /dev/null 2>&1; cat "$fx/j.rec.$1" 2>/dev/null; }
m600=$(margs 600); m1=$(margs 1); m659=$(margs 659)
check "13.2328 ctl mutate's slot-run passes --max-min right after its label, above its watchdog cap + GRACE (3 s) by ≥ 58 s: 600 s → 12, 659 s → 12, 1 s → 2 (so the watchdog's own stop always comes first)" \
  'case "$m600" in "--label mutate-1-x.ts --max-min 12 -- "*) true;; *) false;; esac && case "$m659" in "--label mutate-1-x.ts --max-min 12 -- "*) true;; *) false;; esac && case "$m1" in "--label mutate-1-x.ts --max-min 2 -- "*) true;; *) false;; esac'

reap
ctl_test_only_end run-tests-cap.test.sh
[ "$fails" -eq 0 ] && echo "run-tests-cap.test.sh: ok" || { echo "run-tests-cap.test.sh: $fails FAILED"; exit 1; }
