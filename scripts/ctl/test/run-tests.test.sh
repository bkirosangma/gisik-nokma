#!/usr/bin/env bash
# scripts/ctl/test/run-tests.test.sh — `ctl run-tests` and the machine-wide test semaphore (13.1750-13.1774, test-cases/13-deploy-and-ops.md);
# run by `ctl selftest`. Every case id starts its check's name. No real load is needed: `memory_pressure`, `sysctl` and `vm_stat` are PATH
# stubs that read files, the clock is a file (CTL_SEM_CLOCK_FILE: a sleep advances it and runs CTL_SEM_SLEEP_HOOK, so a wait of minutes costs
# no real time), and a slot is "held" by planting its directory with a live pid. Two cases (13.1767, 13.1774) use the REAL clock and real
# processes: they are the proof that the stubs stand in for something that works.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
fails=0
check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }

fx=$(cd "$(mktemp -d)" && pwd -P)
cleanup() { while read -r p; do kill "$p" 2>/dev/null; done < "$fx/pids" 2>/dev/null; rm -rf "$fx"; }
trap cleanup EXIT
st="$fx/state"; FB="$fx/bin"; mkdir -p "$st" "$FB" "$fx/logs"
export CTL_SEM_DIR="$fx/sem" CTL_LOG_DIR="$fx/logs" FX_STATE="$st"   # NEVER the machine's real semaphore
unset CTL_TEST_SLOTS CTL_SEM_MAX_WAIT
repo="$fx/repo"; mkdir -p "$repo"; ( cd "$repo" && /usr/bin/git init -q . )

# --- stubs (bare names, found first on PATH — the way the docker stub in lib.test.sh works) ---
cat > "$FB/memory_pressure" <<'STUB'
#!/bin/sh
echo "$*" >> "$FX_STATE/mp-argv"
case " $* " in *" -l "*|*" -p "*|*" -s "*|*" -S "*) exit 99;; esac   # the flags that SIMULATE pressure; reading never needs one
echo "The system has 17179869184 (1048576 pages with a page size of 16384)."
echo "System-wide memory free percentage: $(cat "$FX_STATE/free")%"
STUB
cat > "$FB/sysctl" <<'STUB'
#!/bin/sh
[ "$*" = "-n kern.memorystatus_vm_pressure_level" ] && { cat "$FX_STATE/level"; exit 0; }
exit 1
STUB
cat > "$FB/vm_stat" <<'STUB'
#!/bin/sh
echo "Mach Virtual Memory Statistics: (page size of 16384 bytes)"
echo "Swapins:                          $(cat "$FX_STATE/swapins")."
STUB
# the sleep hook: swapins grows by (rate × slept seconds); "AT CMD" lines in state/script run once when the fake clock reaches AT
cat > "$fx/hook.sh" <<'HOOK'
#!/bin/sh
echo $(( $(cat "$FX_STATE/swapins") + $(cat "$FX_STATE/swaprate") * CTL_SEM_SLEEP_SECS )) > "$FX_STATE/swapins"
[ -f "$FX_STATE/script" ] || exit 0
i=0
while IFS= read -r line; do
  i=$((i+1)); at=${line%% *}; cmd=${line#* }
  [ -f "$FX_STATE/done.$i" ] && continue
  if [ "$CTL_SEM_NOW" -ge "$at" ]; then : > "$FX_STATE/done.$i"; eval "$cmd"; fi
done < "$FX_STATE/script"
HOOK
chmod +x "$FB"/* "$fx/hook.sh"

reset() {   # a clean machine: nothing held, healthy memory, no swap-in, clock at 1000, no script
  rm -rf "$CTL_SEM_DIR" "$st"/done.* "$st/script" "$st/mp-argv" "$CTL_LOG_DIR"/*; mkdir -p "$CTL_SEM_DIR" "$CTL_LOG_DIR"
  echo 60 > "$st/free"; echo 1 > "$st/level"; echo 0 > "$st/swapins"; echo 0 > "$st/swaprate"; echo 1000 > "$st/clock"
}
live_pid() { sleep 600 >/dev/null 2>&1 & echo $! >> "$fx/pids"; echo $!; }   # stdout closed: a $(...) caller must not wait for the sleeper
dead_pid() { sh -c 'exit 0' & local p=$!; wait "$p" 2>/dev/null; echo "$p"; }
lstart() { ps -o lstart= -p "$1" | sed 's/^ *//; s/  */ /g'; }
# plant a held slot / a running gate (the on-disk contract: slot-<n>/holder and gate-<pid> hold `pid|lstart|label|epoch`)
hold() { mkdir -p "$CTL_SEM_DIR/slot-$1"; printf '%s|%s|planted|0\n' "${2:-$(live_pid)}" "${3:-}" > "$CTL_SEM_DIR/slot-$1/holder"; if [ -z "${3:-}" ]; then printf '%s|%s|planted|0\n' "$(sed 's/|.*//' "$CTL_SEM_DIR/slot-$1/holder")" "$(lstart "$(sed 's/|.*//' "$CTL_SEM_DIR/slot-$1/holder")")" > "$CTL_SEM_DIR/slot-$1/holder"; fi; }
plant_gate() { local p="${1:-$(live_pid)}"; printf '%s|%s|gate|0\n' "$p" "${2-$(lstart "$p")}" > "$CTL_SEM_DIR/gate-$p"; echo "$p"; }
rt() { ( cd "$repo" && PATH="$FB:$PATH" CTL_SEM_CLOCK_FILE="$st/clock" CTL_SEM_SLEEP_HOOK="$fx/hook.sh" CTL_SEM_POLL_SECS=5 CTL_SEM_SAMPLE_SECS=1 CTL_DRY_RUN=0 "$HERE/ctl" run-tests --repo "$repo" "$@" 2>&1 ); }
rt_real() { ( cd "$repo" && PATH="$FB:$PATH" CTL_SEM_POLL_SECS=1 CTL_SEM_SAMPLE_SECS=1 CTL_DRY_RUN=0 "$HERE/ctl" run-tests --repo "$repo" "$@" 2>&1 ); }
script_line() { echo "$1" >> "$st/script"; }
nlines() { printf '%s\n' "$1" | wc -l | tr -d ' '; }

# --- fixtures: what the wrapped command prints ---
VFAIL="$fx/vitest-fail.log"; cat > "$VFAIL" <<'EOF'
 ❯ test/a.test.ts (3 tests | 1 failed) 12ms
   × alpha > beta works 3ms
     → expected 1 to be 2 // Object.is equality

 FAIL  test/a.test.ts > alpha > beta works
AssertionError: expected 1 to be 2 // Object.is equality

- Expected
+ Received

- 2
+ 1

 ❯ test/a.test.ts:7:19

 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 11 passed (12)
   Duration  1.2s
EOF
VPASS="$fx/vitest-pass.log"; { i=0; while [ $i -lt 2000 ]; do echo " ✓ test/t$i.test.ts (3 tests) 4ms"; i=$((i+1)); done; printf '\n Test Files  2000 passed (2000)\n      Tests  6000 passed (6000)\n   Duration  41s\n'; } > "$VPASS"
VHUGE="$fx/vitest-huge.log"; { i=0; while [ $i -lt 400 ]; do printf ' FAIL  test/f%s.test.ts > suite > case %s\nAssertionError: expected %s to be 0\n\n- Expected\n+ Received\n\n' "$i" "$i" "$i"; i=$((i+1)); done; printf ' Test Files  400 failed | 1 passed (401)\n      Tests  400 failed | 5 passed (405)\n'; } > "$VHUGE"
TSCERR="$fx/tsc.log"; cat > "$TSCERR" <<'EOF'
src/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/b.ts(9,1): error TS2304: Cannot find name 'x'.
Found 2 errors in 2 files.
EOF
TURBO="$fx/turbo.log"; printf '\033[36m@gisik-nokma/ui:test: \033[0m \033[31m FAIL \033[39m test/x.test.tsx > comp > draws\n@gisik-nokma/ui:test: \033[1mAssertionError\033[22m: expected 3 to be 4\n@gisik-nokma/ui:test:  Test Files  1 failed | 4 passed (5)\n@gisik-nokma/ui:test:       Tests  1 failed | 9 passed (10)\n' > "$TURBO"

# ---------------- the summary ----------------
reset; out=$(rt --label v -- cat "$VPASS"); rc=$?
check "13.1750 a passing run: the whole output goes to a log FILE, stdout stays under 30 lines, and carries the counts, the log path and the exit code" '[ $rc -eq 0 ] && [ "$(nlines "$out")" -le 30 ] && printf "%s" "$out" | grep -q "Tests  6000 passed (6000)" && printf "%s" "$out" | grep -q "exit code: 0" && lg=$(printf "%s\n" "$out" | sed -n "s/^log: //p" | head -1) && [ -f "$lg" ] && [ "$(wc -l < "$lg" | tr -d " ")" -ge 2000 ] && case "$lg" in "$CTL_LOG_DIR"/run-tests-*.log) true;; *) false;; esac && printf "%s" "$out" | tail -1 | grep -q "^OK run-tests"'
reset; out=$(rt -- sh -c 'cat "$1"; exit 1' x "$VFAIL"); rc=$?
check "13.1751 a failing vitest run: the first failure's test name and its assertion are in the summary, and the last line is FAIL run-tests" 'printf "%s" "$out" | grep -q "first failure: test/a.test.ts > alpha > beta works" && printf "%s" "$out" | grep -q "AssertionError: expected 1 to be 2" && printf "%s" "$out" | grep -q "Test Files  1 failed | 2 passed (3)" && printf "%s" "$out" | grep -q "Tests  1 failed | 11 passed (12)" && printf "%s" "$out" | tail -1 | grep -q "^FAIL run-tests"'
reset; out=$(rt -- sh -c 'echo hi; exit 3'); rc=$?
check "13.1752 the exit code is the command's own — 3 stays 3 (not 1), and is printed" '[ $rc -eq 3 ] && printf "%s" "$out" | grep -q "exit code: 3"'
reset; out=$(rt -- sh -c 'exit 0'); rc0=$?; out=$(rt -- sh -c 'kill -TERM $$'); rcs=$?
check "13.1752 control: exit 0 stays 0 and a command killed by a signal reports 128+signal" '[ $rc0 -eq 0 ] && [ $rcs -eq 143 ] && printf "%s" "$out" | grep -q "exit code: 143"'
reset; out=$(rt -- sh -c 'echo "args: $*"' x --dry-run --repo /nonexistent --label zz); rc=$?
check "13.1753 everything after -- reaches the command untouched, including --dry-run and --repo (ctl_parse_common must not eat them)" '[ $rc -eq 0 ] && lg=$(printf "%s\n" "$out" | sed -n "s/^log: //p") && grep -q "args: --dry-run --repo /nonexistent --label zz" "$lg"'
reset; out=$(rt -- cat "$TSCERR"); rc=$?
check "13.1754 a tsc run: the error count and the first error are shown" 'printf "%s" "$out" | grep -q "tsc: 2 errors" && printf "%s" "$out" | grep -q "first error: src/a.ts(3,5): error TS2322"'
reset; out=$(rt -- cat "$TURBO"); rc=$?
check "13.1755 ANSI codes and turbo pkg:task: prefixes are stripped before parsing and printing" '! printf "%s" "$out" | /usr/bin/grep -q $(printf "\033") && ! printf "%s" "$out" | grep -q "gisik-nokma/ui:test:" && printf "%s" "$out" | grep -q "first failure: test/x.test.tsx > comp > draws" && printf "%s" "$out" | grep -q "AssertionError: expected 3 to be 4" && printf "%s" "$out" | grep -q "Tests  1 failed | 9 passed (10)"'
reset; out=$(rt -- cat "$VHUGE"); rc=$?
check "13.1756 a run with 400 failures still prints at most 30 lines, counts first" '[ "$(nlines "$out")" -le 30 ] && printf "%s" "$out" | grep -q "Tests  400 failed | 5 passed (405)" && printf "%s" "$out" | grep -q "first failure: test/f0.test.ts"'
reset; out=$(rt -- sh -c 'echo started; echo "boom: could not open the db" >&2; exit 2'); rc=$?
check "13.1757 a crash with no test summary: rc kept, and the log tail shows the cause" '[ $rc -eq 2 ] && printf "%s" "$out" | grep -q "no test summary found" && printf "%s" "$out" | grep -q "boom: could not open the db" && printf "%s" "$out" | grep -q "exit code: 2"'

# ---------------- the semaphore ----------------
reset; : > "$fx/seen"; out=$(rt -- sh -c 'ls "$CTL_SEM_DIR" | grep "^slot-" > "$1"' x "$fx/seen"); rc=$?
check "13.1758 uncontended: the slot is taken for the run, released after, and the queue wait is 0s" '[ $rc -eq 0 ] && printf "%s" "$out" | grep -q "^queue wait: 0s" && [ "$(wc -l < "$fx/seen" | tr -d " ")" -eq 1 ] && [ -z "$(ls "$CTL_SEM_DIR" | grep "^slot-")" ]'
reset; hold 1; hold 2; script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""
out=$(rt --label third -- sh -c 'exit 0'); rc=$?
check "13.1759 both slots held: the third run waits in fake time until one frees (20 s, 5 s polls), runs, and names why it waited" '[ $rc -eq 0 ] && printf "%s" "$out" | grep -q "^queue wait: 20s (waited for: slots)"'
reset; hold 1; echo 1 > "$CTL_SEM_DIR/slots"; script_line "1015 rm -rf \"$CTL_SEM_DIR/slot-1\""; out1=$(rt -- true)
reset; hold 1; hold 2; echo 3 > "$CTL_SEM_DIR/slots"; out3=$(rt -- true)
reset; hold 1; hold 2; out_env=$(CTL_TEST_SLOTS=3 rt -- true); reset; hold 1; hold 2; echo 1 > "$CTL_SEM_DIR/slots"; script_line "1010 rm -rf \"$CTL_SEM_DIR/slot-1\" \"$CTL_SEM_DIR/slot-2\""; out_file_wins=$(CTL_TEST_SLOTS=3 rt -- true)
check "13.1760 the slot count is configurable: a slots file in the sem dir, else CTL_TEST_SLOTS, else 2 — the file wins, so callers cannot disagree" 'printf "%s" "$out1" | grep -q "queue wait: 15s" && printf "%s" "$out3" | grep -q "queue wait: 0s" && printf "%s" "$out_env" | grep -q "queue wait: 0s" && printf "%s" "$out_file_wins" | grep -q "queue wait: 10s"'
reset; echo 5 > "$st/free"; script_line "1030 echo 60 > \"$st/free\""
out=$(rt -- true)
check "13.1761 low free memory holds the slot back (free 5% → wait until it recovers, 30 s) and says pressure" 'printf "%s" "$out" | grep -q "^queue wait: 30s (waited for: pressure)"'
reset; echo 2 > "$st/level"; script_line "1010 echo 1 > \"$st/level\""; outw=$(rt -- true)
reset; echo 4 > "$st/level"; script_line "1010 echo 1 > \"$st/level\""; outc=$(rt -- true)
reset; outn=$(rt -- true)
check "13.1762 the kernel pressure level gates too: 2 (warn) and 4 (critical) wait, 1 (normal) does not; the probe never passes a simulate flag (-l -p -s -S)" 'printf "%s" "$outw" | grep -q "queue wait: 10s (waited for: pressure)" && printf "%s" "$outc" | grep -q "queue wait: 10s (waited for: pressure)" && printf "%s" "$outn" | grep -q "queue wait: 0s" && [ -s "$st/mp-argv" ] && ! grep -qE "(^| )-[lpsS]( |$)" "$st/mp-argv"'
reset; echo 1000 > "$st/swaprate"; script_line "1040 echo 0 > \"$st/swaprate\""; out=$(rt -- true)
check "13.1763 a sustained swap-in rate (1000 pages/s × 16 KiB ≈ 15.6 MB/s) holds the slot back until it drops, and says swap" 'printf "%s" "$out" | grep -qE "^queue wait: [0-9]+s \(waited for: swap\)" && w=$(printf "%s" "$out" | sed -n "s/^queue wait: \([0-9]*\)s.*/\1/p") && [ "$w" -ge 35 ]'
reset; echo 1000 > "$st/swaprate"; script_line "1001 echo 0 > \"$st/swaprate\""; out=$(rt -- true)
check "13.1763 control: one high window then a quiet one is a blip, not pressure — it takes two consecutive high windows to block" 'printf "%s" "$out" | grep -q "^queue wait: 0s"'
reset; echo 100 > "$st/swaprate"; out=$(rt -- true)
check "13.1763 control: 100 pages/s (≈1.6 MB/s, under the 8 MB/s default) does not block" 'printf "%s" "$out" | grep -q "^queue wait: 0s"'
reset; hold 1; gp=$(plant_gate); script_line "1040 rm -f \"$CTL_SEM_DIR/gate-$gp\""; out=$(rt -- true)
check "13.1764 a running gate has priority: a free slot is not granted while it runs; the wait ends when the gate ends (40 s) and says gate; the held slot-1 was never touched" 'printf "%s" "$out" | grep -q "^queue wait: 40s (waited for: gate)" && [ -d "$CTL_SEM_DIR/slot-1" ]'
reset; GATE_AFTER_CLAIM="$fx/gate-after-claim.sh"
cat > "$GATE_AFTER_CLAIM" <<'HOOKEOF'
#!/bin/sh
# runs once, right after the verb claimed its slot: a gate "starts" now and "ends" at fake time 1010 (when the slot must NOT be held)
[ -f "$FX_STATE/planted" ] && exit 0
: > "$FX_STATE/planted"
sleep 600 >/dev/null 2>&1 & p=$!
echo $p > "$FX_STATE/gatepid"; echo $p >> "$FX_STATE/../pids"
printf '%s|%s|gate|0\n' "$p" "$(ps -o lstart= -p $p | sed 's/^ *//; s/  */ /g')" > "$CTL_SEM_DIR/gate-$p"
echo "1010 ls \"$CTL_SEM_DIR\" | grep -c '^slot-' > \"$FX_STATE/slots-while-gate\"; rm -f \"$CTL_SEM_DIR/gate-$p\"" >> "$FX_STATE/script"
HOOKEOF
chmod +x "$GATE_AFTER_CLAIM"; rm -f "$st/planted" "$st/slots-while-gate"
out=$(CTL_SEM_CLAIM_HOOK="$GATE_AFTER_CLAIM" rt -- true); rc=$?; gpid=$(cat "$st/gatepid" 2>/dev/null)
check "13.1764 a gate that starts between the slot being claimed and the run is seen: the slot is given back (0 held while the gate ran) and the run waits (the re-check after the claim)" '[ $rc -eq 0 ] && printf "%s" "$out" | grep -q "waited for: gate" && [ "$(cat "$st/slots-while-gate")" = 0 ]'
reset; d=$(dead_pid); plant_gate "$d" "Thu Jan  1 00:00:00 1970" >/dev/null; lp=$(live_pid); plant_gate "$lp" "Mon Jan  1 00:00:00 2001" >/dev/null
out=$(rt -- true)
check "13.1765 a stale gate marker is ignored and removed: a dead pid, and a live pid whose start time differs (pid reuse)" 'printf "%s" "$out" | grep -q "^queue wait: 0s" && [ -z "$(ls "$CTL_SEM_DIR" | grep "^gate-")" ]'
reset; d=$(dead_pid); hold 1 "$d" "Thu Jan  1 00:00:00 1970"; lp=$(live_pid); hold 2 "$lp" "Mon Jan  1 00:00:00 2001"
out=$(rt -- true)
check "13.1766 stale slots are reclaimed: a dead pid and a reused pid (live, other start time) both free their slot at once" 'printf "%s" "$out" | grep -q "^queue wait: 0s"'
reset; mkdir "$CTL_SEM_DIR/slot-1" "$CTL_SEM_DIR/slot-2"; script_line "1005 rmdir \"$CTL_SEM_DIR/slot-1\""
out=$(rt -- true)
check "13.1766 a slot dir with no holder file is a claim in progress: NOT reclaimed while fresh (the run waits for it)" 'printf "%s" "$out" | grep -q "waited for: slots"'
reset; mkdir "$CTL_SEM_DIR/slot-1" "$CTL_SEM_DIR/slot-2"; touch -t 200001010000 "$CTL_SEM_DIR/slot-1" "$CTL_SEM_DIR/slot-2"
out=$(rt -- true)
check "13.1766 …but an old holder-less slot dir (a claimant that died between mkdir and its holder file) is reclaimed" 'printf "%s" "$out" | grep -q "^queue wait: 0s"'
reset; echo 1 > "$CTL_SEM_DIR/slots"; d=$(dead_pid); hold 1 "$d" "Thu Jan  1 00:00:00 1970"
( rt_real -- sh -c 'date +%s >> "$1"; sleep 2; date +%s >> "$1"' x "$fx/span1" >/dev/null ) & b1=$!
( rt_real -- sh -c 'date +%s >> "$1"; sleep 2; date +%s >> "$1"' x "$fx/span2" >/dev/null ) & b2=$!
wait $b1 $b2
check "13.1767 two real processes racing for ONE slot (one stale slot to reclaim) never overlap: the later one starts after the earlier one ended" 's1=$(sed -n 1p "$fx/span1"); e1=$(sed -n 2p "$fx/span1"); s2=$(sed -n 1p "$fx/span2"); e2=$(sed -n 2p "$fx/span2"); [ -n "$s1" ] && [ -n "$s2" ] && { [ "$s2" -ge "$e1" ] || [ "$s1" -ge "$e2" ]; }'
reset
out=$(rt -- sh -c 'exit 5'); rc=$?
check "13.1768 the slot is released when the command fails (and the run did happen: rc 5)" '[ $rc -eq 5 ] && printf "%s" "$out" | grep -q "exit code: 5" && [ -z "$(ls "$CTL_SEM_DIR" | grep "^slot-")" ]'
# exec: $rp is then the verb's own pid, so the TERM reaches its trap
reset; ( cd "$repo" && exec env PATH="$FB:$PATH" CTL_DRY_RUN=0 "$HERE/ctl" run-tests --repo "$repo" -- sleep 30 >/dev/null 2>&1 ) & rp=$! ; i=0; while [ $i -lt 40 ] && [ -z "$(ls "$CTL_SEM_DIR" 2>/dev/null | grep '^slot-')" ]; do sleep 0.25; i=$((i+1)); done
held=$(ls "$CTL_SEM_DIR" | grep -c '^slot-'); kill -TERM "$rp" 2>/dev/null; wait "$rp" 2>/dev/null; sleep 1
check "13.1768 the slot is released when the verb is terminated (SIGTERM), and was held while it ran" '[ "$held" -eq 1 ] && [ -z "$(ls "$CTL_SEM_DIR" | grep "^slot-")" ]'
reset; rt --label first -- true >/dev/null; hold 1; hold 2; script_line "1030 rm -rf \"$CTL_SEM_DIR/slot-1\""; rt --label second -- true >/dev/null
check "13.1769 every run appends its queue wait to a tally in the sem dir (time, label, seconds, reason, slots) — the history the slot count is tuned from" 'f="$CTL_SEM_DIR/waits.tsv"; [ "$(wc -l < "$f" | tr -d " ")" -eq 2 ] && awk -F"\t" "NR==1 && \$2==\"first\" && \$3==0 && \$4==\"-\" && \$5==2 {a=1} NR==2 && \$2==\"second\" && \$3==30 && \$4==\"slots\" && \$5==2 {b=1} END{exit !(a&&b)}" "$f"'
reset; hold 1; hold 2; rm -f "$fx/ran"; out=$(CTL_SEM_MAX_WAIT=30 rt -- sh -c ': > "$1"' x "$fx/ran"); rc=$?
check "13.1770 a queue wait past CTL_SEM_MAX_WAIT gives up with exit 75, runs nothing, and says so" '[ $rc -eq 75 ] && [ ! -e "$fx/ran" ] && printf "%s" "$out" | tail -1 | grep -q "^FAIL run-tests .*no slot after"'
reset; rm -f "$fx/ran"; out=$(rt --dry-run -- sh -c ': > "$1"' x "$fx/ran"); rc=$?
check "13.1771 --dry-run prints the plan, takes no slot, runs nothing, exits 0" '[ $rc -eq 0 ] && [ ! -e "$fx/ran" ] && [ -z "$(ls "$CTL_SEM_DIR" | grep "^slot-")" ] && printf "%s" "$out" | grep -q "^DRY: " && printf "%s" "$out" | tail -1 | grep -q "^OK run-tests dry-run"'

# gate priority marker: written by verbs/gate.sh around the REAL gate run only
bare=$(mktemp -d); /usr/bin/git init -q --bare "$bare"
gr=$(mktemp -d); ( cd "$gr" && /usr/bin/git init -q . && /usr/bin/git symbolic-ref HEAD refs/heads/main && mkdir -p docs/lanes/gate-lock && printf '%s\n' '#!/bin/bash' 'ls "$CTL_SEM_DIR" | grep "^gate-" > "$CTL_SEM_DIR/../during"' 'printf "Tasks:    34 successful, 34 total\nCached:    0 cached, 34 total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=${GATE_FIXTURE_EXIT:-0}' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && echo helper > docs/lanes/gate-lock/locked-test.sh && /usr/bin/git add -A && /usr/bin/git commit -q -m base && /usr/bin/git remote add origin "$bare" && /usr/bin/git push -q -u origin main && /usr/bin/git checkout -q -b feat && /usr/bin/git commit -q --allow-empty -m feat )
gate_run() { ( cd "$gr" && CTL_DRY_RUN=0 "$HERE/ctl" gate "$(/usr/bin/git rev-parse HEAD)" --repo "$gr" "$@" 2>&1 ); }
reset; rm -f "$fx/during"; dry=$(gate_run --dry-run)
check "13.1772 ctl gate --dry-run writes no priority marker (and did dry-run)" 'printf "%s" "$dry" | tail -1 | grep -q "^OK gate dry-run" && [ -z "$(ls "$CTL_SEM_DIR" | grep "^gate-")" ] && [ ! -e "$fx/during" ]'
reset; rm -f "$fx/during"; gate_run >/dev/null
check "13.1772 ctl gate writes a priority marker while the real gate runs (the fixture gate.sh saw gate-<pid>) and removes it when it ends" '[ -s "$fx/during" ] && [ -z "$(ls "$CTL_SEM_DIR" | grep "^gate-")" ]'
reset; rm -f "$fx/during"; out=$(GATE_FIXTURE_EXIT=1 gate_run); rc=$?
check "13.1772 …and removes it when the gate goes RED too (the verb still fails), so a failed gate never blocks the lanes" '[ $rc -ne 0 ] && [ -s "$fx/during" ] && [ -z "$(ls "$CTL_SEM_DIR" | grep "^gate-")" ]'
check "13.1772 the marker is written only after the dry-run exit and removed by an EXIT trap: gate.sh has the begin call after the DRY line and an EXIT trap" 'b=$(/usr/bin/grep -n "ctl_sem_gate_begin" "$HERE/verbs/gate.sh" | head -1 | cut -d: -f1); d=$(/usr/bin/grep -n "DRY: GATE_MODE" "$HERE/verbs/gate.sh" | head -1 | cut -d: -f1); [ -n "$b" ] && [ -n "$d" ] && [ "$b" -gt "$d" ] && /usr/bin/grep -q "trap .*ctl_sem_gate_end.* EXIT" "$HERE/verbs/gate.sh"'

check "13.1773 ctl help lists run-tests and selftest runs the run-tests suite and a run-tests --dry-run step" '"$HERE/ctl" help | grep -q "^  run-tests" && /usr/bin/grep -q "run-tests.test.sh" "$HERE/verbs/selftest.sh" && /usr/bin/grep -q "run-tests --dry-run\|run-tests.*--dry-run" "$HERE/verbs/selftest.sh"'

# the real thing: two parallel runs at once, a third that has to wait for one of them (real clock, real processes, stubbed memory readings)
reset; rm -f "$fx"/p*.t
pr() { rt_real --label "$1" -- sh -c 'date +%s > "$1.start"; sleep 4; date +%s > "$1.end"' x "$fx/$1" ; }
pr p1 > "$fx/p1.out" & q1=$!; pr p2 > "$fx/p2.out" & q2=$!; sleep 1; pr p3 > "$fx/p3.out" & q3=$!; wait $q1 $q2 $q3
check "13.1774 two runs overlap, a third (CTL_TEST_SLOTS=2 default) waits ≥ 2 s for one to finish and logs that wait" 's1=$(cat "$fx/p1.start"); s2=$(cat "$fx/p2.start"); s3=$(cat "$fx/p3.start"); e1=$(cat "$fx/p1.end"); e2=$(cat "$fx/p2.end"); [ "$s2" -lt "$e1" ] && [ "$s3" -ge "$e1" -o "$s3" -ge "$e2" ] && w=$(sed -n "s/^queue wait: \([0-9]*\)s.*/\1/p" "$fx/p3.out") && [ "$w" -ge 2 ] && grep -q "waited for: slots" "$fx/p3.out"'

rm -rf "$bare" "$gr"
[ "$fails" -eq 0 ] && echo "run-tests.test.sh: ok" || { echo "run-tests.test.sh: $fails FAILED"; exit 1; }
