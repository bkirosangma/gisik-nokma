#!/usr/bin/env bash
# scripts/ctl/test/run-tests.test.sh — `ctl run-tests` and the machine-wide test semaphore (13.1750-13.1774, 13.1850, 13.2230-13.2235, 13.2270-13.2276, 13.2280-13.2286, 13.2310-13.2317 and 13.2360-13.2363, test-cases/13-deploy-and-ops.md);
# run by `ctl selftest`. Every case id starts its check's name. No real load is needed: `memory_pressure`, `sysctl` and `vm_stat` are PATH
# stubs that read files, the clock is a file (CTL_SEM_CLOCK_FILE: a sleep advances it and runs CTL_SEM_SLEEP_HOOK, so a wait of minutes costs
# no real time), and a slot is "held" by planting its directory with a live pid. Two cases (13.1767, 13.1774) use the REAL clock and real
# processes: they are the proof that the stubs stand in for something that works.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
fails=0
. "$HERE/test/harness.sh"   # check NAME CODE, and the CTL_TEST_ONLY case filter

fx=$(cd "$(mktemp -d)" && pwd -P)
cleanup() { while read -r p; do kill "$p" 2>/dev/null; done < "$fx/pids" 2>/dev/null; rm -rf "$fx"; }
trap cleanup EXIT
st="$fx/state"; FB="$fx/bin"; mkdir -p "$st" "$FB" "$fx/logs"
export CTL_SEM_DIR="$fx/sem" CTL_LOG_DIR="$fx/logs" FX_STATE="$st"   # NEVER the machine's real semaphore
unset CTL_TEST_SLOTS CTL_SEM_MAX_WAIT CTL_SEM_GATE_SLOTS CTL_SEM_POLL_SECS CTL_SEM_SAMPLE_SECS CTL_SEM_SWAP_TTL CTL_SEM_EXPRESS_SLOTS CTL_SEM_SHORT_MAX
repo="$fx/repo"; mkdir -p "$repo/sub"; ( cd "$repo" && /usr/bin/git init -q . )

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
lstart() { LC_ALL=C TZ=UTC0 ps -o lstart= -p "$1" | sed 's/^ *//; s/  */ /g'; }   # the SAME pinned rendering as ctl_sem_lstart (sem.sh): a holder file written here must read as live to the verb whatever TZ/locale it runs in
# plant a held slot / a running gate (the on-disk contract: slot-<n>/holder and gate-<pid> hold `pid|lstart|label|epoch`)
hold() { mkdir -p "$CTL_SEM_DIR/slot-$1"; printf '%s|%s|planted|0\n' "${2:-$(live_pid)}" "${3:-}" > "$CTL_SEM_DIR/slot-$1/holder"; if [ -z "${3:-}" ]; then printf '%s|%s|planted|0\n' "$(sed 's/|.*//' "$CTL_SEM_DIR/slot-$1/holder")" "$(lstart "$(sed 's/|.*//' "$CTL_SEM_DIR/slot-$1/holder")")" > "$CTL_SEM_DIR/slot-$1/holder"; fi; }
plant_gate() { local p="${1:-$(live_pid)}"; printf '%s|%s|gate|0\n' "$p" "${2-$(lstart "$p")}" > "$CTL_SEM_DIR/gate-$p"; echo "$p"; }
rt() { ( cd "$repo" && PATH="$FB:$PATH" CTL_SEM_CLOCK_FILE="$st/clock" CTL_SEM_SLEEP_HOOK="$fx/hook.sh" CTL_SEM_POLL_SECS=5 CTL_SEM_SAMPLE_SECS=1 CTL_DRY_RUN=0 "$HERE/ctl" run-tests --repo "$repo" "$@" 2>&1 ); }
rt_sub() { ( cd "$repo/sub" && PATH="$FB:$PATH" CTL_SEM_CLOCK_FILE="$st/clock" CTL_SEM_SLEEP_HOOK="$fx/hook.sh" CTL_SEM_POLL_SECS=5 CTL_SEM_SAMPLE_SECS=1 CTL_DRY_RUN=0 "$HERE/ctl" run-tests "$@" 2>&1 ); }   # called FROM a subdirectory, no --repo unless the caller passes one
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
check "13.1756 the digest's own cap holds whatever the caller asks for: MAXLINES 1 on the 400-failure log prints 1 line" '[ "$(python3 "$HERE/verbs/run-tests-summary.py" "$VHUGE" 1 | wc -l | tr -d " ")" -le 1 ]'
# The cause text lives in a FILE the command cats to stderr: it must not be in argv, or the `run-tests: <label> — <cmd>` line would satisfy the needle.
reset; printf 'boom: could not open the db\n' > "$fx/crash-cause.txt"; out=$(rt -- sh -c 'echo started; cat "$1" >&2; exit 2' x "$fx/crash-cause.txt"); rc=$?; lg=$(printf "%s\n" "$out" | sed -n "s/^log: //p" | head -1)
check "13.1757 a crash with no test summary: rc kept, the digest's indented tail shows the cause (not the command line), and the log FILE holds the command's stderr" '[ $rc -eq 2 ] && printf "%s" "$out" | grep -q "no test summary found" && printf "%s" "$out" | grep -q "^  boom: could not open the db" && ! printf "%s\n" "$out" | sed -n 1p | grep -q boom && [ "$(printf "%s\n" "$out" | grep -c boom)" -eq 1 ] && [ -f "$lg" ] && grep -q "boom: could not open the db" "$lg" && printf "%s" "$out" | grep -q "exit code: 2"'

# ---------------- the semaphore ----------------
reset; : > "$fx/seen"; out=$(rt -- sh -c 'ls "$CTL_SEM_DIR" | grep "^slot-" > "$1"' x "$fx/seen"); rc=$?
check "13.1758 uncontended: the slot is taken for the run, released after, and the queue wait is 0s" '[ $rc -eq 0 ] && printf "%s" "$out" | grep -q "^queue wait: 0s" && [ "$(wc -l < "$fx/seen" | tr -d " ")" -eq 1 ] && [ -z "$(ls "$CTL_SEM_DIR" | grep "^slot-")" ]'
reset; lp=$(live_pid); out=$(rt -- sh -c 'printf "%s|x|other|0\n" "$1" > "$CTL_SEM_DIR/slot-1/holder"' x "$lp"); rc=$?
check "13.1758 a slot whose holder file now names ANOTHER pid is not removed when this run ends (a wrongly reclaimed slot cannot take another run's claim with it)" '[ $rc -eq 0 ] && [ -d "$CTL_SEM_DIR/slot-1" ] && [ "$(sed "s/|.*//" "$CTL_SEM_DIR/slot-1/holder")" = "$lp" ]'
reset; ctl_out=$(rt -- true); ctl_left=$(ls "$CTL_SEM_DIR" | grep -c "^slot-")   # control: the same verb on an uncontended run still releases its slot
reset; out=$(rt -- sh -c 'rm -f "$CTL_SEM_DIR/slot-1/holder"'); rc=$?
check "13.1758 a slot dir whose holder file has gone is another waiter's claim in progress (the grace rule): it is NOT removed when this run ends, and the missing file prints no error — control: an uncontended run still releases its slot" '[ $rc -eq 0 ] && [ "$ctl_left" -eq 0 ] && [ -d "$CTL_SEM_DIR/slot-1" ] && [ ! -e "$CTL_SEM_DIR/slot-1/holder" ] && ! printf "%s" "$out" | grep -q "No such file"'
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
check "13.1764 a running gate has priority: with one slot held (the default CTL_SEM_GATE_SLOTS=1) a free slot is not granted while it runs; the wait ends when the gate ends (40 s) and says gate; the held slot-1 was never touched" 'printf "%s" "$out" | grep -q "^queue wait: 40s (waited for: gate)" && [ -d "$CTL_SEM_DIR/slot-1" ]'
reset; GATE_AFTER_CLAIM="$fx/gate-after-claim.sh"
cat > "$GATE_AFTER_CLAIM" <<'HOOKEOF'
#!/bin/sh
# runs once, right after the verb claimed its slot: a gate "starts" now and "ends" at fake time 1010 (when the slot must NOT be held)
[ -f "$FX_STATE/planted" ] && exit 0
: > "$FX_STATE/planted"
sleep 600 >/dev/null 2>&1 & p=$!
echo $p > "$FX_STATE/gatepid"; echo $p >> "$FX_STATE/../pids"
printf '%s|%s|gate|0\n' "$p" "$(LC_ALL=C TZ=UTC0 ps -o lstart= -p $p | sed 's/^ *//; s/  */ /g')" > "$CTL_SEM_DIR/gate-$p"
echo "1010 ls \"$CTL_SEM_DIR\" | grep -c '^slot-' > \"$FX_STATE/slots-while-gate\"; rm -f \"$CTL_SEM_DIR/gate-$p\"" >> "$FX_STATE/script"
HOOKEOF
chmod +x "$GATE_AFTER_CLAIM"; rm -f "$st/planted" "$st/slots-while-gate"
out=$(CTL_SEM_GATE_SLOTS=0 CTL_SEM_CLAIM_HOOK="$GATE_AFTER_CLAIM" rt -- true); rc=$?; gpid=$(cat "$st/gatepid" 2>/dev/null)
check "13.1764 a gate that starts between the slot being claimed and the run is seen (CTL_SEM_GATE_SLOTS=0; the default cap is 13.2233): the slot is given back (0 held while the gate ran) and the run waits (the re-check after the claim)" '[ $rc -eq 0 ] && printf "%s" "$out" | grep -q "waited for: gate" && [ "$(cat "$st/slots-while-gate")" = 0 ]'
# --- one slot during a gate (13.2230-13.2235): while a gate's marker is live a slot is granted only while FEWER than CTL_SEM_GATE_SLOTS (1) are held ---
# 13.2230: real concurrency inside the fake clock — the first run's command starts the SECOND run, which inherits CTL_SEM_DIR, the clock and the hook.
reset; gp=$(plant_gate); script_line "1020 rm -f \"$CTL_SEM_DIR/gate-$gp\""; rm -f "$fx/g2230" "$fx/second.out"
out=$(rt --label first -- sh -c 'ls "$CTL_SEM_DIR" | grep "^gate-" > "$3"; cd "$2" && "$1/ctl" run-tests --repo "$2" --label second -- true > "$4" 2>&1' x "$HERE" "$repo" "$fx/g2230" "$fx/second.out")
check "13.2230 a gate is live and no slot is held: the first run is granted at once (0 s, the gate marker present while it ran); the SECOND, started while the first holds its slot, waits for the gate (20 s, reason gate)" 'printf "%s" "$out" | grep -q "^queue wait: 0s (slot " && [ -s "$fx/g2230" ] && grep -q "^queue wait: 20s (waited for: gate)\$" "$fx/second.out"'
reset; d=$(dead_pid); hold 1 "$d" "Thu Jan  1 00:00:00 1970"; plant_gate >/dev/null; rm -f "$fx/g2230s"; out=$(rt -- sh -c 'ls "$CTL_SEM_DIR" | grep "^gate-" > "$1"' x "$fx/g2230s")
check "13.2230 a STALE holder is not a held slot: one dead-pid slot plus a live gate is granted at 0 s (the count runs after the reclaim), with the gate still live while it ran" 'printf "%s" "$out" | grep -q "^queue wait: 0s (slot " && [ -s "$fx/g2230s" ]'
reset; plant_gate >/dev/null; mkdir -p "$CTL_SEM_DIR/slot-1.stale.99999"; lp=$(live_pid); printf '%s|%s|planted|0\n' "$lp" "$(lstart "$lp")" > "$CTL_SEM_DIR/slot-1.stale.99999/holder"; outm=$(rt -- true)
reset; plant_gate >/dev/null; mkdir "$CTL_SEM_DIR/slot-1"; outq=$(rt -- true); qleft=$([ -d "$CTL_SEM_DIR/slot-1" ] && echo kept)
check "13.2230 the count is of HELD slots only: a dir a reclaimer moved aside (slot-1.stale.<pid>, live holder) and a fresh holder-less dir (a claim in progress, left in place) are not held — each with a live gate is granted at 0 s" 'printf "%s" "$outm" | grep -q "^queue wait: 0s (slot " && printf "%s" "$outq" | grep -q "^queue wait: 0s (slot 2/" && [ "$qleft" = kept ]'
reset; hold 1; gp=$(plant_gate); script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; rm -f "$fx/g2231"; out=$(rt -- sh -c 'ls "$CTL_SEM_DIR" | grep "^gate-" > "$1"' x "$fx/g2231")
check "13.2231 a gate is live with one slot held: a new run waits (reason gate) though slot 2 is free; when the holder exits (1020) it is granted while the gate is STILL live (20 s; the marker present while it ran)" 'printf "%s" "$out" | grep -q "^queue wait: 20s (waited for: gate)\$" && [ -s "$fx/g2231" ] && [ -f "$CTL_SEM_DIR/gate-$gp" ]'
reset; gp=$(plant_gate); script_line "1040 rm -f \"$CTL_SEM_DIR/gate-$gp\""; out0=$(CTL_SEM_GATE_SLOTS=0 rt -- true)
reset; gp=$(plant_gate); script_line "1040 rm -f \"$CTL_SEM_DIR/gate-$gp\""; outd=$(rt -- true)
check "13.2232 CTL_SEM_GATE_SLOTS=0 is the old rule: with no slot held, nothing is granted while the gate is live (40 s, reason gate); CONTROL — the same fixture at the default is granted at 0 s" 'printf "%s" "$out0" | grep -q "^queue wait: 40s (waited for: gate)\$" && printf "%s" "$outd" | grep -q "^queue wait: 0s (slot "'
reset; hold 1; rm -f "$st/planted" "$st/slots-while-gate"; out=$(CTL_SEM_CLAIM_HOOK="$GATE_AFTER_CLAIM" rt -- true); rc=$?
check "13.2233 a gate that starts between the probe and the claim with one slot already held: the claimed slot is given back (only the planted slot held while the gate ran) and the run waits for the gate" '[ $rc -eq 0 ] && printf "%s" "$out" | grep -q "^queue wait: 11s (waited for: gate)\$" && [ "$(cat "$st/slots-while-gate" 2>/dev/null)" = 1 ]'
reset; rm -f "$st/planted" "$st/slots-while-gate" "$fx/g2233"; out=$(CTL_SEM_CLAIM_HOOK="$GATE_AFTER_CLAIM" rt -- sh -c 'ls "$CTL_SEM_DIR" | grep "^gate-" > "$1"' x "$fx/g2233"); rc=$?
check "13.2233 …with NO slot held the claim is kept: granted at 0 s, and the gate (begun after the claim) was live while the run ran" '[ $rc -eq 0 ] && printf "%s" "$out" | grep -q "^queue wait: 0s (slot " && [ -s "$fx/g2233" ]'
reset; plant_gate >/dev/null; echo 5 > "$st/free"; script_line "1030 echo 60 > \"$st/free\""; outp=$(rt -- true)
reset; plant_gate >/dev/null; echo 1000 > "$st/swaprate"; script_line "1040 echo 0 > \"$st/swaprate\""; outs=$(rt -- true)
check "13.2234 under the cap the probes still bind during a gate: free memory 5% waits until it recovers (30 s, reason pressure), a sustained swap-in waits until it drops (>= 35 s, reason swap) — never reason gate" 'printf "%s" "$outp" | grep -q "^queue wait: 30s (waited for: pressure)\$" && printf "%s" "$outs" | grep -qE "^queue wait: [0-9]+s \(waited for: swap\)\$" && w=$(printf "%s" "$outs" | sed -n "s/^queue wait: \([0-9]*\)s.*/\1/p") && [ "$w" -ge 35 ]'
reset; dd=$(rt --dry-run -- true); d0=$(CTL_SEM_GATE_SLOTS=0 rt --dry-run -- true); d3=$(CTL_SEM_GATE_SLOTS=3 rt --dry-run -- true); dx=$(CTL_SEM_GATE_SLOTS=abc rt --dry-run -- true)
check "13.2235 --dry-run names the cap: 1 by default, 0 and 3 as set, 1 for a value that is not a number" '( for p in "dd 1" "d0 0" "d3 3" "dx 1"; do v=${p%% *}; n=${p#* }; eval "t=\$$v"; printf "%s" "$t" | grep -qF "waits while a gate runs and at least $n slot(s) are held (CTL_SEM_GATE_SLOTS), memory pressure" || exit 1; done )'
# --- the gate cap from a file (13.2270-13.2276): CTL_SEM_GATE_SLOTS when numeric, else $CTL_SEM_DIR/gate-slots (trimmed, non-negative integer), else 1; re-read every poll ---
gslots() { printf '%s' "$1" > "$CTL_SEM_DIR/gate-slots"; }   # the file's exact bytes ($'..' for a newline); `reset` removes it
reset; hold 1; plant_gate >/dev/null; gslots $'2\n'; outf=$(rt -- true)
reset; hold 1; plant_gate >/dev/null; gslots '  2  '; outw=$(rt -- true)
reset; hold 1; gp=$(plant_gate); gslots $'1\n'; script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; outc=$(rt -- true)
check "13.2270 the gate-slots file sets the cap when the env is unset: file 2 (or '  2  ', whitespace trimmed) with one slot held and a live gate is granted at 0 s; CONTROL — the same state with file 1 waits (20 s, reason gate) until the holder exits" 'printf "%s" "$outf" | grep -q "^queue wait: 0s (slot " && printf "%s" "$outw" | grep -q "^queue wait: 0s (slot " && printf "%s" "$outc" | grep -q "^queue wait: 20s (waited for: gate)\$"'
reset; gp=$(plant_gate); gslots $'3\n'; script_line "1040 rm -f \"$CTL_SEM_DIR/gate-$gp\""; oute=$(CTL_SEM_GATE_SLOTS=0 rt -- true)
reset; gp=$(plant_gate); gslots $'0\n'; script_line "1040 rm -f \"$CTL_SEM_DIR/gate-$gp\""; outn=$(CTL_SEM_GATE_SLOTS=abc rt -- true)
check "13.2271 the env wins over the file: CTL_SEM_GATE_SLOTS=0 with file 3 and a live gate grants nothing (40 s, reason gate); a non-numeric env falls to the file — abc with file 0 and none held waits like 0 (40 s, reason gate)" 'printf "%s" "$oute" | grep -q "^queue wait: 40s (waited for: gate)\$" && printf "%s" "$outn" | grep -q "^queue wait: 40s (waited for: gate)\$"'
for bad in abc ''; do
  reset; plant_gate >/dev/null; gslots "$bad"; eval "out_none_${bad:-empty}=\$(rt -- true)"
  reset; hold 1; gp=$(plant_gate); gslots "$bad"; script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; eval "out_held_${bad:-empty}=\$(rt -- true)"
done
check "13.2272 a file that is not a number (abc) or is empty behaves as 1, never 0: with none held and a live gate the run is granted at 0 s; with one held it waits (20 s, reason gate)" 'printf "%s" "$out_none_abc" | grep -q "^queue wait: 0s (slot " && printf "%s" "$out_none_empty" | grep -q "^queue wait: 0s (slot " && printf "%s" "$out_held_abc" | grep -q "^queue wait: 20s (waited for: gate)\$" && printf "%s" "$out_held_empty" | grep -q "^queue wait: 20s (waited for: gate)\$"'
reset; gp=$(plant_gate); gslots $'0\n'; script_line "1040 rm -f \"$CTL_SEM_DIR/gate-$gp\""; out0=$(rt -- true)
reset; gp=$(plant_gate); gslots $'1\n'; script_line "1040 rm -f \"$CTL_SEM_DIR/gate-$gp\""; out1=$(rt -- true)
check "13.2273 file 0 is a valid cap: with none held nothing is granted while the gate is live (40 s, reason gate); CONTROL — file 1 with the same state is granted at 0 s" 'printf "%s" "$out0" | grep -q "^queue wait: 40s (waited for: gate)\$" && printf "%s" "$out1" | grep -q "^queue wait: 0s (slot "'
reset; hold 1; plant_gate >/dev/null; gslots $'1\n'; script_line "1010 echo 2 > \"$CTL_SEM_DIR/gate-slots\""; outr=$(rt -- true)
check "13.2274 the file is re-read on every poll: rewritten from 1 to 2 (at 1010) while a run waits behind one held slot and a live gate, that run is granted at the next poll (10 s, reason gate) — no restart, the holder still running" 'printf "%s" "$outr" | grep -q "^queue wait: 10s (waited for: gate)\$"'
reset; gslots $'3\n'; df3=$(rt --dry-run -- true); reset; gslots $'3\n'; dfe=$(CTL_SEM_GATE_SLOTS=0 rt --dry-run -- true); reset; gslots abc; dfa=$(rt --dry-run -- true)
check "13.2275 --dry-run names the cap from the file: file 3 names 3, env 0 over file 3 names 0, file abc names 1" '( for p in "df3 3" "dfe 0" "dfa 1"; do v=${p%% *}; n=${p#* }; eval "t=\$$v"; printf "%s" "$t" | grep -qF "waits while a gate runs and at least $n slot(s) are held (CTL_SEM_GATE_SLOTS), memory pressure" || exit 1; done )'
reset; hold 1; gp=$(plant_gate); script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; outm=$(rt -- true); [ -e "$CTL_SEM_DIR/gate-slots" ]; gm=$?
reset; dm=$(rt --dry-run -- true)
check "13.2276 no gate-slots file (the normal state) prints no read error on any poll: one slot held and a live gate waits (20 s, reason gate — the CONTROL that the output was captured) with no 'No such file' in its 2>&1 output; --dry-run names cap 1 (CONTROL) with no 'No such file' either" '[ $gm -ne 0 ] && printf "%s" "$outm" | grep -q "^queue wait: 20s (waited for: gate)\$" && ! printf "%s" "$outm" | grep -q "No such file" && printf "%s" "$dm" | grep -qF "at least 1 slot(s) are held" && ! printf "%s" "$dm" | grep -q "No such file"'

# --- the shared swap verdict and the 1 s poll (13.2310-13.2317): rtd runs with CTL_SEM_POLL_SECS / CTL_SEM_SAMPLE_SECS / CTL_SEM_SWAP_TTL UNSET, so the
# defaults (1 s, 3 s, 10 s) are what is measured; its hook logs every fake sleep's seconds to state/sleeps (one per line), then runs hook.sh ---
cat > "$fx/hookd.sh" <<'HOOK'
#!/bin/sh
echo "$CTL_SEM_SLEEP_SECS" >> "$FX_STATE/sleeps"
exec "$(dirname "$0")/hook.sh"
HOOK
chmod +x "$fx/hookd.sh"
rtd() { ( cd "$repo" && PATH="$FB:$PATH" CTL_SEM_CLOCK_FILE="$st/clock" CTL_SEM_SLEEP_HOOK="$fx/hookd.sh" CTL_DRY_RUN=0 "$HERE/ctl" run-tests --repo "$repo" "$@" 2>&1 ); }
dreset() { reset; rm -f "$st/sleeps"; }
verdict() { echo "$1 $2" > "$CTL_SEM_DIR/swap.verdict"; }
sleeps() { tr '\n' ' ' < "$st/sleeps" 2>/dev/null; }
clock() { cat "$st/clock"; }
col6() { awk -F'\t' -v l="$1" '$2==l {print NF ":" $6}' "$CTL_SEM_DIR/waits.tsv"; }

dreset; verdict 1000 ok; o_fresh=$(rtd --label fresh -- true); c_fresh=$(clock); s_fresh=$(sleeps); v_fresh=$(cat "$CTL_SEM_DIR/swap.verdict")
dreset; o_cold=$(rtd --label cold -- true); c_cold=$(clock); s_cold=$(sleeps); v_cold=$(cat "$CTL_SEM_DIR/swap.verdict")
check "13.2310 a fresh ok verdict on file is reused: granted at 0 s with ZERO sleeps (fake clock still 1000, the verdict untouched); CONTROL — no verdict on file samples once (one 3 s sleep, clock 1003) and writes '1003 ok'" 'printf "%s" "$o_fresh" | grep -q "^queue wait: 0s (slot " && [ "$c_fresh" = 1000 ] && [ -z "$s_fresh" ] && [ "$v_fresh" = "1000 ok" ] && printf "%s" "$o_cold" | grep -q "^queue wait: 0s (slot " && [ "$c_cold" = 1003 ] && [ "$s_cold" = "3 " ] && [ "$v_cold" = "1003 ok" ]'

dreset; verdict 989 ok; o_11=$(rtd -- true); c_11=$(clock); s_11=$(sleeps); v_11=$(cat "$CTL_SEM_DIR/swap.verdict")
dreset; verdict 990 ok; o_10=$(rtd -- true); c_10=$(clock); s_10=$(sleeps)
check "13.2311 a verdict 11 s old is stale: exactly one sample (one 3 s sleep, clock 1003, the verdict rewritten '1003 ok'); at 10 s old (the TTL itself) it is still reused — no sleep, clock 1000" 'printf "%s" "$o_11" | grep -q "^queue wait: 0s (slot " && [ "$c_11" = 1003 ] && [ "$s_11" = "3 " ] && [ "$v_11" = "1003 ok" ] && printf "%s" "$o_10" | grep -q "^queue wait: 0s (slot " && [ "$c_10" = 1000 ] && [ -z "$s_10" ]'

dreset; verdict 1000 high; o_high=$(rtd --label high -- true); s_high=$(sleeps)
check "13.2312 a fresh high verdict blocks as a sampled one does, with swap-in quiet: no grant while it is fresh (eleven 1 s polls, no sample), then one 3 s sample at 1011 finds it calm — queue wait 11s, reason swap, probe 3 in waits.tsv" 'printf "%s" "$o_high" | grep -q "^queue wait: 11s (waited for: swap)\$" && [ "$s_high" = "1 1 1 1 1 1 1 1 1 1 1 3 " ] && [ "$(col6 high)" = "8:3" ]'

dreset; echo 1000 > "$st/swaprate"; o_two=$(CTL_SEM_MAX_WAIT=5 rtd -- true); r_two=$?; v_two=$(cat "$CTL_SEM_DIR/swap.verdict"); s_two=$(sleeps)
rm -f "$st/sleeps"; echo 0 > "$st/swaprate"; o_next=$(CTL_SEM_MAX_WAIT=5 rtd -- true); r_next=$?; s_next=$(sleeps)
dreset; echo 1000 > "$st/swaprate"; script_line "1003 echo 0 > \"$st/swaprate\""; o_one=$(rtd --label blip -- true); v_one=$(cat "$CTL_SEM_DIR/swap.verdict")
check "13.2313 a NEW sample keeps the two-window rule: two consecutive high windows are written as '1006 high' and block (CTL_SEM_MAX_WAIT=5: rc 75, reason swap); the next waiter, with swap-in now quiet, is blocked by that verdict without sampling (five 1 s polls, rc 75); one high window then a quiet one is '1006 ok', granted at 0 s, probe 6" '[ $r_two -eq 75 ] && printf "%s" "$o_two" | tail -1 | grep -q "waited for: swap" && [ "$v_two" = "1006 high" ] && [ "$s_two" = "3 3 " ] && [ $r_next -eq 75 ] && printf "%s" "$o_next" | tail -1 | grep -q "waited for: swap" && [ "$s_next" = "1 1 1 1 1 " ] && printf "%s" "$o_one" | grep -q "^queue wait: 0s (slot " && [ "$v_one" = "1006 ok" ] && [ "$(col6 blip)" = "8:6" ]'

dreset; verdict 995 ok; CTL_SEM_SWAP_TTL=3 rtd -- true >/dev/null; s_t3=$(sleeps)
dreset; verdict 995 ok; CTL_SEM_SWAP_TTL=abc rtd -- true >/dev/null; s_tabc=$(sleeps)
dreset; verdict 990 ok; CTL_SEM_SWAP_TTL=abc rtd -- true >/dev/null; s_tabc10=$(sleeps)
dreset; verdict 989 ok; CTL_SEM_SWAP_TTL=abc rtd -- true >/dev/null; s_tabc11=$(sleeps)
dreset; verdict 1005 high; rtd -- true >/dev/null; s_fut=$(sleeps)
dreset; echo "x ok" > "$CTL_SEM_DIR/swap.verdict"; rtd -- true >/dev/null; s_gx=$(sleeps)
dreset; verdict +1000 high; rtd -- true >/dev/null; s_gp=$(sleeps)
dreset; verdict 1000 maybe; rtd -- true >/dev/null; s_gm=$(sleeps)
check "13.2314 CTL_SEM_SWAP_TTL=3 makes a 5 s old verdict stale (one 3 s sample); a TTL that is not a number (abc) falls to exactly 10 (the 5 s old verdict reused, no sleep; at 10 s old still reused, at 11 s old one 3 s sample); a verdict stamped in the FUTURE (1005 high at clock 1000), a non-numeric stamp (x, and +1000 which shell arithmetic would read as 1000) and an unknown word are not verdicts (one sample each, no block)" '[ "$s_t3" = "3 " ] && [ -z "$s_tabc" ] && [ -z "$s_tabc10" ] && [ "$s_tabc11" = "3 " ] && [ "$s_fut" = "3 " ] && [ "$s_gx" = "3 " ] && [ "$s_gp" = "3 " ] && [ "$s_gm" = "3 " ]'

dreset; hold 1; hold 2; verdict 1000 ok; script_line "1001 rm -rf \"$CTL_SEM_DIR/slot-1\""; o_poll=$(rtd -- true); s_poll=$(sleeps)
check "13.2315 the default poll is 1 s: both slots full, one freed when the fake clock reaches 1001 (the integer clock's stand-in for t+0.5), the waiter is granted at the next poll — queue wait exactly 1s, reason slots, one 1 s sleep (5 s polls would wait 5s)" 'printf "%s" "$o_poll" | grep -q "^queue wait: 1s (waited for: slots)\$" && [ "$s_poll" = "1 " ]'

dreset; echo 1 > "$CTL_SEM_DIR/slots"; hp=$(live_pid); hold 1 "$hp"; verdict "$(date +%s)" ok
t0=$(python3 -c 'import time; print(time.time())'); ( sleep 0.5; kill "$hp" ) & kb=$!
o_real=$( ( cd "$repo" && PATH="$FB:$PATH" CTL_DRY_RUN=0 "$HERE/ctl" run-tests --repo "$repo" -- true 2>&1 ) ); t1=$(python3 -c 'import time; print(time.time())'); wait "$kb" 2>/dev/null
el=$(python3 -c "print(round($t1 - $t0, 2))")
check "13.2316 REAL clock, default knobs: the only slot held by a live pid killed at t+0.5, a fresh ok verdict on file — the waiter (reason slots) is done by t+3 (measured ${el}s; a 5 s poll or a missed verdict's 3 s sample would not be), and not before t+0.5" 'printf "%s" "$o_real" | grep -q "waited for: slots" && python3 -c "import sys; sys.exit(0 if 0.5 <= $el < 3.0 else 1)"'

dreset; verdict 1000 ok; rtd --label reused -- true >/dev/null; rm -f "$CTL_SEM_DIR/swap.verdict"; rtd --label sampled -- true >/dev/null
check "13.2317 every waits.tsv row has 8 tab-separated columns (the 7th and 8th, slot class and short-overrun, are 13.2360/13.2363), the 6th the grant poll's probe seconds: 0 on a reused verdict, 3 on a sampled grant (whose queue wait, column 3, stays 0)" '[ "$(col6 reused)" = "8:0" ] && [ "$(col6 sampled)" = "8:3" ] && awk -F"\t" "\$2==\"sampled\" && \$3==0 {f=1} END{exit !f}" "$CTL_SEM_DIR/waits.tsv" && [ "$(wc -l < "$CTL_SEM_DIR/waits.tsv" | tr -d " ")" -eq 2 ]'
# --- the EXPRESS slot (P72, 13.2360-13.2363): `--short` may take express-1..E (CTL_SEM_EXPRESS_SLOTS, else the express-slots file, else 1) when no
# normal slot is available to it; never preferred over a free normal slot; never taken by a run without --short; not counted against the gate cap;
# a --short hold past CTL_SEM_SHORT_MAX (90) s logs SHORT-OVERRUN (log + waits.tsv column 8). rt's fake clock lets a command "hold" N s by advancing it.
xhold() { local p="${2:-$(live_pid)}"; mkdir -p "$CTL_SEM_DIR/express-$1"; printf '%s|%s|planted|0\n' "$p" "${3-$(lstart "$p")}" > "$CTL_SEM_DIR/express-$1/holder"; }
cls() { awk -F'\t' -v l="$1" '$2==l {print NF ":" $7 ":" $8}' "$CTL_SEM_DIR/waits.tsv"; }   # NF:class:short-overrun of label $1's row
xfiles() { ls "$CTL_SEM_DIR" | grep -E '^(slot|express)-[0-9]+$' | tr '\n' ' '; }
xslots() { printf '%s' "$1" > "$CTL_SEM_DIR/express-slots"; }
reset; hold 1; hold 2; rm -f "$fx/x2360"; o_sx=$(rt --short --label sx -- sh -c 'ls "$CTL_SEM_DIR" | grep -E "^(slot|express)-" | tr "\n" " " > "$1"' x "$fx/x2360"); a_sx=$(xfiles); c_sx=$(cls sx)
reset; hold 1; hold 2; script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; o_nx=$(rt --label nx -- true); c_nx=$(cls nx)
check "13.2360 a --short job with every normal slot held gets the EXPRESS slot at once: 'queue wait: 0s (express slot 1/1)', express-1 held while it ran (beside slot-1 and slot-2), released after (the planted slots untouched), waits.tsv class express; CONTROL — a job without --short in the same state WAITS (20 s, reason slots) until a normal slot frees" 'printf "%s" "$o_sx" | grep -q "^queue wait: 0s (express slot 1/1)\$" && [ "$(cat "$fx/x2360")" = "express-1 slot-1 slot-2 " ] && [ "$a_sx" = "slot-1 slot-2 " ] && [ "$c_sx" = "8:express:-" ] && printf "%s" "$o_nx" | grep -q "^queue wait: 20s (waited for: slots)\$" && [ "$c_nx" = "8:normal:-" ]'
reset; hold 1; hold 2; xhold 1; script_line "1020 rm -rf \"$CTL_SEM_DIR/express-1\""; o_xh=$(rt --short --label xh -- true)
reset; hold 1; hold 2; xhold 1 "$(dead_pid)" "Thu Jan  1 00:00:00 1970"; o_xs=$(rt --short --label xs -- true)
check "13.2360 the express slot is exclusive and reclaimable: held by a live pid, a --short job waits (20 s, reason slots) until it frees, then takes it ('waited for: slots; express slot 1/1'); held by a DEAD pid it is reclaimed and granted at 0 s" 'printf "%s" "$o_xh" | grep -q "^queue wait: 20s (waited for: slots; express slot 1/1)\$" && printf "%s" "$o_xs" | grep -q "^queue wait: 0s (express slot 1/1)\$"'
# the claim race (sem.sh's `[ -n "$got" ]`): express-1 is free when probed, and another --short waiter's mkdir wins while this one samples swap-in — rt's
# cold 1 s sample ends at 1001, where the hook plants a LIVE holder (prepared as a file: no quoting through hook.sh's eval); it frees at 1020
xrace() { local p; p=$(live_pid); printf '%s|%s|racer|0\n' "$p" "$(lstart "$p")" > "$fx/xracer"; script_line "1001 mkdir \"$CTL_SEM_DIR/express-1\" && cp \"$fx/xracer\" \"$CTL_SEM_DIR/express-1/holder\""; script_line "1020 rm -rf \"$CTL_SEM_DIR/express-1\""; }
reset; hold 1; hold 2; xrace; o_xr=$(rt --short --label xr -- true); c_xr=$(cls xr)
reset; hold 1; hold 2; o_xc=$(rt --short --label xc -- true); c_xc=$(cls xc)
check "13.2360 the express claim race: express-1 free when probed but taken by another waiter during this one's swap-in sample (planted live at 1001) is NOT granted (no grant with an empty slot): the job waits until it frees (1020) and is granted it then ('queue wait: 21s (waited for: slots; express slot 1/1)', class express); CONTROL in the same check — nothing planted: granted express at 0 s" 'printf "%s" "$o_xr" | grep -q "^queue wait: 21s (waited for: slots; express slot 1/1)\$" && [ "$c_xr" = "8:express:-" ] && printf "%s" "$o_xc" | grep -q "^queue wait: 0s (express slot 1/1)\$" && [ "$c_xc" = "8:express:-" ]'
reset; hold 1; hold 2; echo 5 > "$st/free"; script_line "1030 echo 60 > \"$st/free\""; o_xp=$(rt --short --label xp -- true)
reset; hold 1; hold 2; echo 1000 > "$st/swaprate"; script_line "1040 echo 0 > \"$st/swaprate\""; o_xw=$(rt --short --label xw -- true)
check "13.2360 the express slot obeys the probes: free memory 5% waits until it recovers (30 s, reason pressure), a sustained swap-in waits until it drops (>= 35 s, reason swap) — each then granted express" 'printf "%s" "$o_xp" | grep -q "^queue wait: 30s (waited for: pressure; express slot 1/1)\$" && printf "%s" "$o_xw" | grep -qE "^queue wait: [0-9]+s \(waited for: swap; express slot 1/1\)\$" && w=$(printf "%s" "$o_xw" | sed -n "s/^queue wait: \([0-9]*\)s.*/\1/p") && [ "$w" -ge 35 ]'
reset; hold 1; o_sn=$(rt --short --label sn -- true); c_sn=$(cls sn)
reset; hold 1; hold 2; xslots $'0\n'; script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; o_z=$(rt --short --label z -- true); c_z=$(cls z)
reset; hold 1; hold 2; script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; o_ze=$(CTL_SEM_EXPRESS_SLOTS=0 rt --short --label ze -- true)
check "13.2361 with a normal slot free a --short job takes the NORMAL slot ('queue wait: 0s (slot 2/2)', class normal) — express is the fallback; CONTROL — express-slots 0 (the file, and CTL_SEM_EXPRESS_SLOTS=0) makes a --short job wait like any other (20 s, reason slots, then a normal slot)" 'printf "%s" "$o_sn" | grep -q "^queue wait: 0s (slot 2/2)\$" && [ "$c_sn" = "8:normal:-" ] && printf "%s" "$o_z" | grep -q "^queue wait: 20s (waited for: slots)\$" && [ "$c_z" = "8:normal:-" ] && printf "%s" "$o_ze" | grep -q "^queue wait: 20s (waited for: slots)\$"'
reset; hold 1; hold 2; xhold 1; xslots $'2\n'; o_f2=$(rt --short --label f2 -- true)
reset; hold 1; hold 2; xhold 1; xslots '  2  '; script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; o_e1=$(CTL_SEM_EXPRESS_SLOTS=1 rt --short --label e1 -- true); c_e1=$(cls e1)
reset; hold 1; hold 2; xslots abc; o_fa=$(rt --short --label fa -- true)
reset; hold 1; hold 2; xhold 1; xslots $'1\n'; script_line "1010 echo 0 > \"$CTL_SEM_DIR/express-slots\"; rm -rf \"$CTL_SEM_DIR/express-1\""; script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; o_rr=$(rt --short --label rr -- true); c_rr=$(cls rr)
check "13.2361 the express count E: the express-slots file sets it with the env unset (file 2, express-1 held: granted 'express slot 2/2'); the env wins over the file (CTL_SEM_EXPRESS_SLOTS=1 over file '  2  ', express-1 held: waits 20 s for a normal slot); a file that is not a number (abc) is 1, never 0 (granted express 1/1); re-read every poll (rewritten to 0 at 1010 just as express-1 frees: the job waits on to 1020 and is granted the normal slot, not express)" 'printf "%s" "$o_f2" | grep -q "^queue wait: 0s (express slot 2/2)\$" && printf "%s" "$o_e1" | grep -q "^queue wait: 20s (waited for: slots)\$" && [ "$c_e1" = "8:normal:-" ] && printf "%s" "$o_fa" | grep -q "^queue wait: 0s (express slot 1/1)\$" && printf "%s" "$o_rr" | grep -q "^queue wait: 20s (waited for: slots)\$" && [ "$c_rr" = "8:normal:-" ]'
reset; hold 1; plant_gate >/dev/null; rm -f "$fx/x2362"; o_gs=$(rt --short --label gs -- sh -c 'ls "$CTL_SEM_DIR" | grep -E "^(slot|express|gate)-" | sed "s/^gate-.*/gate/" | tr "\n" " " > "$1"' x "$fx/x2362")
reset; hold 1; plant_gate >/dev/null; script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; o_gn=$(rt --label gn -- true)
reset; xhold 1; plant_gate >/dev/null; o_gx=$(rt --label gx -- true)
check "13.2362 a gate runs with the gate cap (1) held and slot 2 physically FREE: a --short job still gets the EXPRESS slot at 0 s (express-1 held beside slot-1, the gate live while it ran), and a job without --short waits (20 s, reason gate); the express slot is not counted against the cap — express-1 held, no normal slot held, a live gate: a job without --short is granted a normal slot at 0 s" 'printf "%s" "$o_gs" | grep -q "^queue wait: 0s (express slot 1/1)\$" && [ "$(cat "$fx/x2362")" = "express-1 gate slot-1 " ] && printf "%s" "$o_gn" | grep -q "^queue wait: 20s (waited for: gate)\$" && printf "%s" "$o_gx" | grep -q "^queue wait: 0s (slot 1/2)\$"'
adv() { echo "sh -c 'echo \$(( \$(cat \"\$1\") + $1 )) > \"\$1\"' x $st/clock"; }   # a command that holds its slot $1 fake seconds
ovlog() { printf '%s\n' "$1" | sed -n "s/^log: //p"; }
reset; o91=$(rt --short --label o91 -- sh -c "$(adv 91)"); l91=$(ovlog "$o91"); g91=$(grep -c '^SHORT-OVERRUN' "$l91"); t91=$(tail -1 "$l91"); c_o91=$(cls o91)
reset; o90=$(rt --short --label o90 -- sh -c "$(adv 90)"); l90=$(ovlog "$o90"); g90=$(grep -c 'SHORT-OVERRUN' "$l90"); c_o90=$(cls o90)
reset; o9n=$(rt --label o9n -- sh -c "$(adv 900)"); l9n=$(ovlog "$o9n"); g9n=$(grep -c 'SHORT-OVERRUN' "$l9n"); c_o9n=$(cls o9n)
check "13.2363 a --short hold past the default CTL_SEM_SHORT_MAX (90) is logged, never stopped: held 91 s, the log has exactly one line 'SHORT-OVERRUN o91 91' (its last) and waits.tsv column 8 is 91, rc 0; CONTROL — held 90 s (the max itself) writes none ('-'), nor does a job without --short held 900 s" '[ "$g91" = 1 ] && [ "$t91" = "SHORT-OVERRUN o91 91" ] && [ "$c_o91" = "8:normal:91" ] && printf "%s" "$o91" | grep -q "^exit code: 0\$" && [ "$g90" = 0 ] && [ "$c_o90" = "8:normal:-" ] && [ "$g9n" = 0 ] && [ "$c_o9n" = "8:normal:-" ]'
reset; o6=$(CTL_SEM_SHORT_MAX=5 rt --short --label o6 -- sh -c "$(adv 6)"); l6=$(ovlog "$o6"); g6=$(grep -cx "SHORT-OVERRUN o6 6" "$l6"); c_o6=$(cls o6)
reset; o5=$(CTL_SEM_SHORT_MAX=5 rt --short --label o5 -- sh -c "$(adv 5)"); l5=$(ovlog "$o5"); g5=$(grep -c SHORT-OVERRUN "$l5"); c_o5=$(cls o5)
reset; hold 1; hold 2; oxo=$(rt --short --label oxo -- sh -c "$(adv 95)"); c_oxo=$(cls oxo); x_oxo=$(xfiles)
reset; oab=$(CTL_SEM_SHORT_MAX=abc rt --short --label oab -- sh -c "$(adv 91)"); c_oab=$(cls oab)
check "13.2363 CTL_SEM_SHORT_MAX=5: held 6 s logs 'SHORT-OVERRUN o6 6', held 5 s none; an EXPRESS hold of 95 s is logged (class express, column 8 95) and its express slot is still freed (the planted slot-1 and slot-2 untouched); a max that is not a number (abc) is 90 (held 91 logged)" '[ "$g6" = 1 ] && [ "$c_o6" = "8:normal:6" ] && [ "$g5" = 0 ] && [ "$c_o5" = "8:normal:-" ] && [ "$c_oxo" = "8:express:95" ] && [ "$x_oxo" = "slot-1 slot-2 " ] && [ "$c_oab" = "8:normal:91" ]'
reset; otm=$(CTL_RUN_SECS_PER_MIN=1 CTL_RUN_KILL_GRACE_SECS=1 rt --short --max-min 1 --label otm -- sh -c "$(adv 100); sleep 30"); rtm=$?; ltm=$(ovlog "$otm"); tm1=$(tail -1 "$ltm"); tm2=$(tail -2 "$ltm" | sed -n 1p)
reset; o_ot=$(rt --short --label ot -- sh -c "$(adv 120); kill -TERM \$PPID; sleep 5"); r_ot=$?; c_ot=$(cls ot); x_ot=$(xfiles)
l_ot=$(ls -t "$CTL_LOG_DIR"/run-tests-*.log | sed -n 1p); g_ot=$(grep -cx "SHORT-OVERRUN ot 120" "$l_ot")   # the abort prints no log path; reset left this run's log alone
# SIGHUP has no trap of its own (a closed tmux pane sends it): bash still runs the EXIT trap, whose cleanup frees the slot through the same release_slot
reset; o_oh=$(rt --short --label oh -- sh -c "$(adv 120); kill -HUP \$PPID; sleep 1"); r_oh=$?; c_oh=$(cls oh); x_oh=$(xfiles); g_oh=$(grep -cx "SHORT-OVERRUN oh 120" "$(ls -t "$CTL_LOG_DIR"/run-tests-*.log | sed -n 1p)")
check "13.2363 a --short job whose verb is stopped by SIGTERM past the max still records the overrun in BOTH places: rc 143, the 'terminated by signal 15' line, its log holds exactly one 'SHORT-OVERRUN ot 120' line and waits.tsv column 8 is 120, the slot freed; one stopped by SIGHUP (no trap: the EXIT trap frees it) likewise — rc 129, one 'SHORT-OVERRUN oh 120' line, column 8 120, the slot freed" '[ $r_ot -eq 143 ] && printf "%s" "$o_ot" | tail -1 | grep -q "^FAIL run-tests ot terminated by signal 15" && [ "$g_ot" = 1 ] && [ "$c_ot" = "8:normal:120" ] && [ -z "$x_ot" ] && [ $r_oh -eq 129 ] && [ "$g_oh" = 1 ] && [ "$c_oh" = "8:normal:120" ] && [ -z "$x_oh" ]'
reset; dsh=$(rt --dry-run --short -- true); dno=$(rt --dry-run -- true)
check "13.2363 a --short job the cap stops keeps TIMEOUT as the log's LAST line, SHORT-OVERRUN the line before it (rc 124); --dry-run --short names the express slots and the 90 s contract, and a plain --dry-run names neither" '[ $rtm -eq 124 ] && [ "$tm1" = "TIMEOUT after 1 min" ] && [ "$tm2" = "SHORT-OVERRUN otm 100" ] && printf "%s" "$dsh" | grep -qF "; --short: express slot 1..1 when no normal slot is available, SHORT-OVERRUN logged past 90 s, then in " && ! printf "%s" "$dno" | grep -q "express"'
reset; d=$(dead_pid); plant_gate "$d" "Thu Jan  1 00:00:00 1970" >/dev/null; lp=$(live_pid); plant_gate "$lp" "Mon Jan  1 00:00:00 2001" >/dev/null
out=$(rt -- true)
check "13.1765 a stale gate marker is ignored and removed: a dead pid, and a live pid whose start time differs (pid reuse)" 'printf "%s" "$out" | grep -q "^queue wait: 0s" && [ -z "$(ls "$CTL_SEM_DIR" | grep "^gate-")" ]'
reset; hold 1; gp=$(plant_gate); script_line "1040 [ -f \"$CTL_SEM_DIR/gate-$gp\" ] && : > \"$st/gate-alive\"; rm -f \"$CTL_SEM_DIR/gate-$gp\""; rm -f "$st/gate-alive"; out=$(TZ=America/New_York rt -- true)   # not TZ=UTC: the pinned helper reads UTC0, so a UTC waiter would read the same string even on the old code
check "13.1765 a LIVE gate's marker is never reclaimed, whatever TZ the waiter runs in: TZ=America/New_York, one slot held (the default cap binds), waits the same 40 s (reason gate) and the marker still existed when the gate ended" 'printf "%s" "$out" | grep -q "^queue wait: 40s (waited for: gate)" && [ -f "$st/gate-alive" ]'
reset; d=$(dead_pid); hold 1 "$d" "Thu Jan  1 00:00:00 1970"; lp=$(live_pid); hold 2 "$lp" "Mon Jan  1 00:00:00 2001"
out=$(rt -- true)
check "13.1766 stale slots are reclaimed: a dead pid and a reused pid (live, other start time) both free their slot at once" 'printf "%s" "$out" | grep -q "^queue wait: 0s"'
# The reused pid ALONE: slot-1 is genuinely live, so a free slot exists only if the reused pid in slot-2 is detected (a dead pid would free one by itself).
reset; hold 1; lp=$(live_pid); hold 2 "$lp" "Mon Jan  1 00:00:00 2001"
out=$(rt --label reused -- sh -c 'sed "s/|.*//" "$CTL_SEM_DIR/slot-2/holder" > "$1"; echo $PPID > "$2"' x "$fx/s2-holder" "$fx/s2-verb"); rc=$?; left=$(ls "$CTL_SEM_DIR" | grep '^slot-' | tr '\n' ' ')   # the dir as THIS run left it (the control below resets it)
reset; hold 1; hold 2; script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; outc=$(rt -- true)
check "13.1766 a live pid with ANOTHER start time (reuse) is the only stale slot: the run starts at once, slot-2 was the verb's own while it ran, slot-1 (genuinely live) is untouched. Control: both genuinely live → the run waits for slots" '[ $rc -eq 0 ] && printf "%s" "$out" | grep -q "^queue wait: 0s" && [ -n "$(cat "$fx/s2-holder")" ] && [ "$(cat "$fx/s2-holder")" = "$(cat "$fx/s2-verb")" ] && [ "$left" = "slot-1 " ] && printf "%s" "$outc" | grep -q "^queue wait: 20s (waited for: slots)"'
# A LIVE holder is never reclaimed because the waiter renders the start time differently: TZ and locale change `ps -o lstart=`.
reset; hold 1; hold 2; script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; outz=$(TZ=America/New_York LC_ALL=de_DE.UTF-8 rt -- true)
reset; hold 1; hold 2; script_line "1020 rm -rf \"$CTL_SEM_DIR/slot-1\""; outd=$(rt -- true)
check "13.1766 a LIVE holder is never reclaimed because the waiter's TZ or locale renders its start time differently: TZ=America/New_York LC_ALL=de_DE.UTF-8 waits the same 20 s as the default environment" 'printf "%s" "$outz" | grep -q "^queue wait: 20s (waited for: slots)" && printf "%s" "$outd" | grep -q "^queue wait: 20s (waited for: slots)"'
reset; d1=$(dead_pid); d2=$(dead_pid); hold 1 "$d1" ""; hold 2 "$d2" ""
out=$(rt -- true)
check "13.1766 a dead pid whose recorded start time is EMPTY (ps had failed at claim time) is still stale: the pid check decides, not only the start-time compare" 'printf "%s" "$out" | grep -q "^queue wait: 0s"'
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
# exec: $rp is then the verb's own pid, so the TERM reaches its trap. The sleep is a GRANDCHILD (sh forks it) and sleeps 300 s: it can never end inside this test, so "dead"
# means the verb killed it. The verb must exit within ~12 s of the TERM (the 5 s TERM→KILL ladder + slack): a verb that only finishes when the command does is red.
reset; ( cd "$repo" && exec env PATH="$FB:$PATH" CTL_DRY_RUN=0 CTL_SEM_SAMPLE_SECS=1 "$HERE/ctl" run-tests --repo "$repo" -- sh -c 'sleep 300 & echo $! > "$1"; wait' x "$fx/grandchild.pid" >/dev/null 2>&1 ) & rp=$!
i=0; while [ $i -lt 120 ] && [ -z "$(ls "$CTL_SEM_DIR" 2>/dev/null | grep '^slot-')" ]; do sleep 0.25; i=$((i+1)); done
held=$(ls "$CTL_SEM_DIR" | grep -c '^slot-'); kill -TERM "$rp" 2>/dev/null
i=0; while [ $i -lt 48 ] && kill -0 "$rp" 2>/dev/null; do sleep 0.25; i=$((i+1)); done
verb_gone=1; if kill -0 "$rp" 2>/dev/null; then verb_gone=0; kill -KILL "$rp" 2>/dev/null; fi   # EXACT pid only (never pkill)
wait "$rp" 2>/dev/null
gc=$(cat "$fx/grandchild.pid" 2>/dev/null); child_left=0; if [ -n "$gc" ] && kill -0 "$gc" 2>/dev/null; then child_left=1; kill "$gc" 2>/dev/null; fi
check "13.1768 the verb terminated by SIGTERM exits within 12 s (not when the command ends), releases its slot (held while it ran), and the 300 s grandchild it spawned is dead" '[ "$held" -eq 1 ] && [ "$verb_gone" -eq 1 ] && [ -n "$gc" ] && [ "$child_left" -eq 0 ] && [ -z "$(ls "$CTL_SEM_DIR" | grep "^slot-")" ]'
reset; rt --label first -- true >/dev/null; hold 1; hold 2; script_line "1030 rm -rf \"$CTL_SEM_DIR/slot-1\""; rt --label second -- true >/dev/null
check "13.1769 every run appends its queue wait to a tally in the sem dir (time, label, seconds, reason, slots; the 6th column, probe seconds, is 13.2317) — the history the slot count is tuned from" 'f="$CTL_SEM_DIR/waits.tsv"; [ "$(wc -l < "$f" | tr -d " ")" -eq 2 ] && awk -F"\t" "NR==1 && \$2==\"first\" && \$3==0 && \$4==\"-\" && \$5==2 {a=1} NR==2 && \$2==\"second\" && \$3==30 && \$4==\"slots\" && \$5==2 {b=1} END{exit !(a&&b)}" "$f"'
reset; hold 1; hold 2; rm -f "$fx/ran"; out=$(CTL_SEM_MAX_WAIT=30 rt -- sh -c ': > "$1"' x "$fx/ran"); rc=$?
check "13.1770 a queue wait past CTL_SEM_MAX_WAIT gives up with exit 75, runs nothing, and says so" '[ $rc -eq 75 ] && [ ! -e "$fx/ran" ] && printf "%s" "$out" | tail -1 | grep -q "^FAIL run-tests .*no slot after"'
reset; rm -f "$fx/ran"; out=$(rt --dry-run -- sh -c ': > "$1"' x "$fx/ran"); rc=$?
check "13.1771 --dry-run prints the plan, takes no slot, runs nothing, exits 0" '[ $rc -eq 0 ] && [ ! -e "$fx/ran" ] && [ -z "$(ls "$CTL_SEM_DIR" | grep "^slot-")" ] && printf "%s" "$out" | grep -q "^DRY: " && printf "%s" "$out" | tail -1 | grep -q "^OK run-tests dry-run"'

# F1: where the command runs. `ctl run-tests` is the one verb that wraps a command whose meaning depends on its directory (pnpm exec vitest run test/x from a package dir).
reset; out=$(rt_sub --label here -- sh -c 'pwd -P > "$1"' x "$fx/cwd-here"); lgh=$(printf "%s\n" "$out" | sed -n "s/^log: //p" | head -1); hdr=$(sed -n 2p "$lgh")   # read before the next reset wipes the logs
reset; outr=$(rt_sub --repo "$repo" --label there -- sh -c 'pwd -P > "$1"' x "$fx/cwd-there"); dry=$(rt_sub --dry-run -- true); dryr=$(rt_sub --dry-run --repo "$repo" -- true)
check "13.1850 the command runs in the CALLER's directory (a subdirectory, no --repo), and in --repo when that is given; the summary's first line, the log header and the --dry-run line name the directory" '[ "$(cat "$fx/cwd-here")" = "$repo/sub" ] && [ "$(cat "$fx/cwd-there")" = "$repo" ] && printf "%s\n" "$out" | sed -n 1p | grep -q "(in $repo/sub)\$" && printf "%s\n" "$outr" | sed -n 1p | grep -q "(in $repo)\$" && printf "%s\n" "$hdr" | grep -q "in $repo/sub\$" && printf "%s" "$dry" | grep -q "in $repo/sub: " && printf "%s" "$dryr" | grep -q "in $repo: "'

# gate priority marker: written by verbs/gate.sh around the REAL gate run only
bare=$(mktemp -d); /usr/bin/git init -q --bare "$bare"
gr=$(mktemp -d); ( cd "$gr" && /usr/bin/git init -q . && /usr/bin/git symbolic-ref HEAD refs/heads/main && mkdir -p docs/lanes/gate-lock && printf '%s\n' '#!/bin/bash' 'ls "$CTL_SEM_DIR" | grep "^gate-" > "$CTL_SEM_DIR/../during"' 'echo "${KG_PW_PORT:-unset} ${FG_PW_PORT:-unset}" > "$CTL_SEM_DIR/../ports"' 'printf "Tasks:    41 successful, 41 total\nCached:    0 cached, 41 total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=${GATE_FIXTURE_EXIT:-0}' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && echo helper > docs/lanes/gate-lock/locked-test.sh && /usr/bin/git add -A && /usr/bin/git commit -q -m base && /usr/bin/git remote add origin "$bare" && /usr/bin/git push -q -u origin main && /usr/bin/git checkout -q -b feat && /usr/bin/git commit -q --allow-empty -m feat )
gate_run() { ( cd "$gr" && CTL_DRY_RUN=0 "$HERE/ctl" gate "$(/usr/bin/git rev-parse HEAD)" --repo "$gr" "$@" 2>&1 ); }
reset; rm -f "$fx/during"; dry=$(gate_run --dry-run)
check "13.1772 ctl gate --dry-run writes no priority marker (and did dry-run)" 'printf "%s" "$dry" | tail -1 | grep -q "^OK gate dry-run" && [ -z "$(ls "$CTL_SEM_DIR" | grep "^gate-")" ] && [ ! -e "$fx/during" ]'
reset; rm -f "$fx/during"; gout=$(gate_run); grc=$?
check "13.1772 ctl gate writes a priority marker while the real gate runs (the fixture gate.sh saw gate-<pid>) and removes it when it ends — and that gate went GREEN (rc 0, last line OK gate), so the success exit path is the one exercised" '[ -s "$fx/during" ] && [ -z "$(ls "$CTL_SEM_DIR" | grep "^gate-")" ] && [ $grc -eq 0 ] && printf "%s" "$gout" | tail -1 | grep -q "^OK gate "'
reset; rm -f "$fx/during"; out=$(GATE_FIXTURE_EXIT=1 gate_run); rc=$?
check "13.1772 …and removes it when the gate goes RED too (the verb still fails), so a failed gate never blocks the lanes" '[ $rc -ne 0 ] && [ -s "$fx/during" ] && [ -z "$(ls "$CTL_SEM_DIR" | grep "^gate-")" ]'
check "13.1772 the marker is written only after the dry-run exit and removed by an EXIT trap: gate.sh has the begin call after the DRY line and an EXIT trap" 'b=$(/usr/bin/grep -n "ctl_sem_gate_begin" "$HERE/verbs/gate.sh" | head -1 | cut -d: -f1); d=$(/usr/bin/grep -n "DRY: GATE_MODE" "$HERE/verbs/gate.sh" | head -1 | cut -d: -f1); [ -n "$b" ] && [ -n "$d" ] && [ "$b" -gt "$d" ] && /usr/bin/grep -q "trap .*ctl_sem_gate_end.* EXIT" "$HERE/verbs/gate.sh"'

check "13.1773 ctl help lists run-tests and selftest runs the run-tests suite and a run-tests --dry-run step" '"$HERE/ctl" help | grep -q "^  run-tests" && /usr/bin/grep -q "run-tests.test.sh" "$HERE/verbs/selftest.sh" && /usr/bin/grep -q "run-tests --dry-run\|run-tests.*--dry-run" "$HERE/verbs/selftest.sh"'

# the real thing: two parallel runs at once, a third that has to wait for one of them (real clock, real processes, stubbed memory readings)
reset; rm -f "$fx"/p*.t
pr() { rt_real --label "$1" -- sh -c 'date +%s > "$1.start"; sleep 4; date +%s > "$1.end"' x "$fx/$1" ; }
pr p1 > "$fx/p1.out" & q1=$!; pr p2 > "$fx/p2.out" & q2=$!; sleep 1; pr p3 > "$fx/p3.out" & q3=$!; wait $q1 $q2 $q3
check "13.1774 two runs overlap, a third (CTL_TEST_SLOTS=2 default) waits ≥ 2 s for one to finish and logs that wait" 's1=$(cat "$fx/p1.start"); s2=$(cat "$fx/p2.start"); s3=$(cat "$fx/p3.start"); e1=$(cat "$fx/p1.end"); e2=$(cat "$fx/p2.end"); [ "$s2" -lt "$e1" ] && [ "$s3" -ge "$e1" -o "$s3" -ge "$e2" ] && w=$(sed -n "s/^queue wait: \([0-9]*\)s.*/\1/p" "$fx/p3.out") && [ "$w" -ge 2 ] && grep -q "waited for: slots" "$fx/p3.out"'


# --- Playwright ports (13.2280-13.2286): the gate runs the browser packages on 3291 / 3292, every other Playwright run on a FREE port of its own ---
check "13.2280 ctl gate --dry-run names the Playwright ports it exports: KG_PW_PORT=3291 FG_PW_PORT=3292" 'reset; gate_run --dry-run | grep -q "^DRY: GATE_MODE=fresh KG_PW_PORT=3291 FG_PW_PORT=3292 "'
reset; rm -f "$fx/ports"; gate_run >/dev/null
check "13.2280 the REAL gate run puts KG_PW_PORT=3291 and FG_PW_PORT=3292 in the environment gate.sh (and so turbo) starts with" '[ "$(cat "$fx/ports" 2>/dev/null)" = "3291 3292" ]'
reset; rm -f "$fx/ports"; ( export KG_PW_PORT=3191 FG_PW_PORT=3192; gate_run >/dev/null )
check "13.2280 …and a port the CALLER exported does not leak into the gate: it still gets 3291 / 3292" '[ "$(cat "$fx/ports" 2>/dev/null)" = "3291 3292" ]'

# a block of 30 ports nobody listens on, so the cases below do not depend on what else this machine runs
pwbase=$(python3 -c '
import socket
for b in range(3600, 3990, 30):
    ok = True
    for p in range(b, b + 30):
        s = socket.socket()
        try: s.bind(("127.0.0.1", p))
        except OSError: ok = False
        finally: s.close()
    if ok: print(b); break')
export CTL_PW_PORT_BASE="$pwbase"; unset KG_PW_PORT FG_PW_PORT
in_range() { local p; for p in "$@"; do [ "$p" -ge "$pwbase" ] && [ "$p" -lt $((pwbase+100)) ] || return 1; done; }   # a function, not `exit 1` inside check()'s eval: that would end the whole suite
pw_cmd=(sh -c 'echo "${KG_PW_PORT:-unset} ${FG_PW_PORT:-unset}" > "$1"; sleep 3 # playwright' x)   # the word "playwright" in the command is what makes the verb pick ports
reset; rm -f "$fx"/pw*.out
rt_real --label pw1 -- "${pw_cmd[@]}" "$fx/pw1.out" >/dev/null & q1=$!; rt_real --label pw2 -- "${pw_cmd[@]}" "$fx/pw2.out" >/dev/null & q2=$!; wait $q1 $q2
read -r k1 f1 < "$fx/pw1.out"; read -r k2 f2 < "$fx/pw2.out"
check "13.2281 two CONCURRENT Playwright runs (two slots) get FOUR different ports (KG and FG of each: a KG port may not be the other run's FG port either), all inside the range, none of them 3191 / 3291 / 3192 / 3292" '[ "$(printf "%s\n" $k1 $f1 $k2 $f2 | sort -u | wc -l | tr -d " ")" = 4 ] && in_range $k1 $f1 $k2 $f2'
dry1=$(rt --dry-run -- sh -c ': # playwright'); dry2=$(rt --dry-run -- pnpm exec playwright test)
dry_in_range() { local d kp; for d in "$@"; do kp=$(printf "%s" "$d" | sed -n "s/.* with KG_PW_PORT=\([0-9]*\) FG_PW_PORT=.*/\1/p"); [ -n "$kp" ] && in_range "$kp" || return 1; done; }
check "13.2281 a --dry-run names the ports its run would get (inside the range, not 3191 / 3291) and a command with no Playwright in it names none" 'dry_in_range "$dry1" "$dry2" && ! rt --dry-run -- vitest run | grep -q KG_PW_PORT'

mkdir -p "$repo/packages/flow-graph-browser"
dry3=$(rt --dry-run -- pnpm turbo run test); dry4=$(rt --dry-run -- pnpm --filter @gisik-nokma/knowledge-graph-browser test); dry5=$( cd "$repo/packages/flow-graph-browser" && PATH="$FB:$PATH" "$HERE/ctl" run-tests --dry-run -- pnpm test 2>&1 )
check "13.2281 …each trigger alone: a turbo command names ports" 'printf "%s" "$dry3" | grep -q " with KG_PW_PORT=[0-9]* FG_PW_PORT="'
check "13.2281 …a command naming a *-graph-browser package names ports" 'printf "%s" "$dry4" | grep -q " with KG_PW_PORT=[0-9]* FG_PW_PORT="'
check "13.2281 …a plain \`pnpm test\` run FROM a *-graph-browser directory names ports" 'printf "%s" "$dry5" | grep -q " with KG_PW_PORT=[0-9]* FG_PW_PORT="'
longpad=$(printf 'a%.0s' $(seq 1 130)); dryl=$(rt --dry-run -- sh -c ": $longpad # playwright"); dryn=$(rt --dry-run -- sh -c ": $longpad # nothing here")
check "13.2281 …a command longer than the 120-character display whose \`playwright\` falls after the cut names ports (the trigger reads the WHOLE command, not the shown one); CONTROL — the shown command IS cut (… and no \`playwright\` in the DRY line) and the same long command without the word names none" 'printf "%s" "$dryl" | grep -q "…" && ! printf "%s" "$dryl" | grep -q "# playwright" && dry_in_range "$dryl" && ! printf "%s" "$dryn" | grep -q KG_PW_PORT'

pw_hold() {   # pw_hold <host> <port> <file>: a background listener on that host and port (::1, 127.0.0.1, or a wildcard 0.0.0.0 / ::), reported ready by <file>; its pid goes to $fx/pids (cleaned up on exit)
  python3 -c '
import socket, sys, time
fam = socket.AF_INET6 if ":" in sys.argv[1] else socket.AF_INET
s = socket.socket(fam); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind((sys.argv[1], int(sys.argv[2]))); s.listen()
open(sys.argv[3], "w").write("up"); time.sleep(60)' "$1" "$2" "$3" >/dev/null 2>&1 &   # stdout closed: a $(...) caller must not wait for the holder
  echo $! >> "$fx/pids"; hp=$!; n=0; while [ ! -f "$3" ] && [ "$n" -lt 50 ]; do sleep 0.1; n=$((n+1)); done; echo "$hp"
}
# a WILDCARD holder (a node / next dev server started with no host listens on ::, vite --host on 0.0.0.0) holds the port for localhost too (F2, FIX 1)
for hold in "::1 IPv6" "127.0.0.1 IPv4" "0.0.0.0 wildcard 0.0.0.0" ":: wildcard ::"; do
  host=${hold%% *}; what=${hold#* }
  reset; rm -f "$fx/pw1.out" "$fx/held"; hp=$(pw_hold "$host" "$pwbase" "$fx/held")
  rt_real --label pwh -- sh -c 'echo "$KG_PW_PORT $FG_PW_PORT" > "$1" # playwright' x "$fx/pw1.out" >/dev/null; read -r kh fh < "$fx/pw1.out"; dryh=$(rt --dry-run -- sh -c ': # playwright'); kill "$hp" 2>/dev/null; wait "$hp" 2>/dev/null
  check "13.2282 a HELD port is skipped ($what listener on the range's first port): the run gets KG >= base+1 and FG another free one, and its --dry-run names a different port too" '[ -f "$fx/held" ] && [ "$kh" -ge $((pwbase+1)) ] && [ "$fh" -ge $((pwbase+1)) ] && [ "$kh" != "$fh" ] && printf "%s" "$dryh" | grep -q " with KG_PW_PORT=$((pwbase+1)) "'
done
reset; rm -f "$fx/ran"; nofree=$(CTL_PW_PORT_COUNT=1 rt --label pwx -- sh -c ': > "$1" # playwright' x "$fx/ran"); nofreerc=$?; nofreed=$(CTL_PW_PORT_COUNT=1 rt --dry-run -- sh -c ': # playwright')
check "13.2285 with fewer than two free ports the run FAILS (rc 1) and the command is not run; its --dry-run fails too" '[ $nofreerc -eq 1 ] && [ ! -e "$fx/ran" ] && printf "%s" "$nofree" | tail -1 | grep -q "^FAIL run-tests pwx no free Playwright ports" && printf "%s" "$nofreed" | tail -1 | grep -q "^FAIL run-tests no free Playwright ports"'
reset; rm -f "$fx/pw1.out"; rt_real --label pw0 -- sh -c 'echo "$KG_PW_PORT $FG_PW_PORT" > "$1" # playwright' x "$fx/pw1.out" >/dev/null
check "13.2282 CONTROL: with nothing held a lone run gets the range's first two ports" '[ "$(cat "$fx/pw1.out")" = "$pwbase $((pwbase+1))" ]'
reset; hold 1; hold 2; rm -f "$fx/pwx.out"; rt --short --label pwxs -- sh -c 'echo "$KG_PW_PORT $FG_PW_PORT" > "$1" # playwright' x "$fx/pwx.out" >/dev/null
reset; hold 1; rm -f "$fx/pwn.out"; rt --short --label pwns -- sh -c 'echo "$KG_PW_PORT $FG_PW_PORT" > "$1" # playwright' x "$fx/pwn.out" >/dev/null
check "13.2360 an EXPRESS slot's Playwright window follows the normal ones (slot N+n): with 2 normal slots held, express 1 starts at base+20, not in normal slot 1's window; CONTROL — a --short run on normal slot 2 starts at base+10" '[ "$(cat "$fx/pwx.out")" = "$((pwbase+20)) $((pwbase+21))" ] && [ "$(cat "$fx/pwn.out")" = "$((pwbase+10)) $((pwbase+11))" ]'
reset; rm -f "$fx/pw1.out"; KG_PW_PORT=4999 rt_real --label pwk -- sh -c 'echo "$KG_PW_PORT $FG_PW_PORT" > "$1" # playwright' x "$fx/pw1.out" >/dev/null; read -r kp fp < "$fx/pw1.out"
check "13.2283 a KG_PW_PORT the caller exported is kept (FG still picked inside the range)" '[ "$kp" = 4999 ] && [ "$fp" -ge "$pwbase" ] && [ "$fp" -lt $((pwbase+100)) ]'
reset; rm -f "$fx/pw1.out"; FG_PW_PORT=4998 rt_real --label pwg -- sh -c 'echo "$KG_PW_PORT $FG_PW_PORT" > "$1" # playwright' x "$fx/pw1.out" >/dev/null; read -r kq fq < "$fx/pw1.out"
check "13.2283 …and a FG_PW_PORT the caller exported is kept too (KG still picked inside the range)" '[ "$fq" = 4998 ] && [ "$kq" -ge "$pwbase" ] && [ "$kq" -lt $((pwbase+100)) ]'
reset; rm -f "$fx/pw1.out"; rt_real --label pwn -- sh -c 'echo "${KG_PW_PORT:-unset} ${FG_PW_PORT:-unset}" > "$1"' x "$fx/pw1.out" >/dev/null
check "13.2283 a command that names neither Playwright, a *-graph-browser package nor turbo runs with its environment untouched" '[ "$(cat "$fx/pw1.out")" = "unset unset" ]'
reset; pwlog=$(rt_real --label pws -- sh -c 'true # playwright' | tr "\n" "~")
check "13.2284 the summary names the ports it picked (one line, after the queue wait) and the log header records them" 'printf "%s" "$pwlog" | grep -q "queue wait[^~]*~ports: KG_PW_PORT=[0-9]* FG_PW_PORT=[0-9]*~" && grep -q "^# ports: KG_PW_PORT=" "$(ls -t "$CTL_LOG_DIR"/run-tests-*.log | head -1)"'

# turbo's strict env mode drops a variable the task did not declare: the gate's KG_PW_PORT must be a pass-through of the browser task (and a pass-through is not hashed)
turbo="$(cd "$HERE/../.." && pwd)/node_modules/.bin/turbo"
tport() { ( cd "$HERE/../.." && KG_PW_PORT="$1" "$turbo" run test --filter=@gisik-nokma/knowledge-graph-browser --dry=json 2>/dev/null | python3 -c '
import json, sys
t = [x for x in json.load(sys.stdin)["tasks"] if x["taskId"] == "@gisik-nokma/knowledge-graph-browser#test"][0]
print(t["hash"], " ".join(t["environmentVariables"]["specified"].get("passThroughEnv") or []))' ); }
t1=$(tport 3291); t2=$(tport 3555)
check "13.2286 turbo hands KG_PW_PORT to knowledge-graph-browser#test as a pass-through variable" '[ -x "$turbo" ] && [ "${t1#* }" = KG_PW_PORT ]'
check "13.2286 …and a pass-through is not hashed: the task hash is the same under two different ports (an \`env\` entry would split the cache per port)" '[ -n "${t1%% *}" ] && [ "${t1%% *}" = "${t2%% *}" ]'
unset CTL_PW_PORT_BASE

rm -rf "$bare" "$gr"
ctl_test_only_end run-tests.test.sh
[ "$fails" -eq 0 ] && echo "run-tests.test.sh: ok" || { echo "run-tests.test.sh: $fails FAILED"; exit 1; }
