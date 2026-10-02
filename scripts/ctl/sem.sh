#!/usr/bin/env bash
# scripts/ctl/sem.sh — the machine-wide test semaphore (`ctl run-tests`) and the gate's priority marker. Sourced, never executed.
# State lives in CTL_SEM_DIR (default ~/.cache/gisik-ctl/sem): MACHINE-wide, not ctl_marker_dir (that one is per checkout).
#   slot-<n>/holder   one directory per held slot, made by an atomic `mkdir`; holder = `pid|lstart|label|epoch`, lstart = `ps -o lstart=` of
#                     the pid, so a REUSED pid cannot impersonate the holder (stale = pid dead, or alive with another start time)
#   gate-<pid>        a running `ctl gate` (same fields). While any live one exists no NEW slot is granted; running slots finish.
#   slots             optional: the slot count (read before CTL_TEST_SLOTS so two callers cannot disagree on N)
#   waits.tsv         one row per run: time, label, queue wait seconds, reason, slot count — the history the count is tuned from
# macOS has no flock(1): mkdir is the lock. Bash 3.2-safe (no wait -n, mapfile, declare -A, EPOCHREALTIME; no empty array under set -u).
# Test seams (env): CTL_SEM_CLOCK_FILE (fake clock: ctl_sem_sleep advances it and runs CTL_SEM_SLEEP_HOOK with CTL_SEM_NOW / CTL_SEM_SLEEP_SECS),
# CTL_SEM_CLAIM_HOOK (runs right after a slot was claimed), CTL_SEM_POLL_SECS, CTL_SEM_SAMPLE_SECS.
# Knobs: CTL_TEST_SLOTS (2), CTL_SEM_MIN_FREE_PCT (15), CTL_SEM_MAX_SWAPIN_MBS (8), CTL_SEM_SAMPLE_SECS (3), CTL_SEM_POLL_SECS (5),
# CTL_SEM_MAX_WAIT (1800), CTL_SEM_GRACE_SECS (10).

ctl_sem_dir() { local d="${CTL_SEM_DIR:-$HOME/.cache/gisik-ctl/sem}"; mkdir -p "$d"; echo "$d"; }
ctl_sem_now() { if [ -n "${CTL_SEM_CLOCK_FILE:-}" ]; then cat "$CTL_SEM_CLOCK_FILE"; else date +%s; fi; }
ctl_sem_sleep() {
  local n="$1" now
  if [ -n "${CTL_SEM_CLOCK_FILE:-}" ]; then
    now=$(( $(cat "$CTL_SEM_CLOCK_FILE") + n )); echo "$now" > "$CTL_SEM_CLOCK_FILE"
    if [ -n "${CTL_SEM_SLEEP_HOOK:-}" ]; then CTL_SEM_NOW="$now" CTL_SEM_SLEEP_SECS="$n" "$CTL_SEM_SLEEP_HOOK"; fi
  elif [ "$n" -gt 0 ]; then sleep "$n"; fi
  return 0
}
# `Thu Oct  3 00:46:12 2026`, whitespace squeezed; empty when the pid does not exist.
ctl_sem_lstart() { ps -o lstart= -p "$1" 2>/dev/null | sed 's/^ *//; s/  */ /g'; }
ctl_sem_slots() {
  local n; n="$(cat "$(ctl_sem_dir)/slots" 2>/dev/null)"
  case "$n" in ''|*[!0-9]*) n="${CTL_TEST_SLOTS:-2}";; esac
  case "$n" in ''|*[!0-9]*|0) n=2;; esac
  echo "$n"
}
# 0 when the holder/gate file names a live process that started when it says; 1 for a dead pid, a reused pid, a file that names none.
ctl_sem_holder_live() {
  local pid ls rest; IFS='|' read -r pid ls rest < "$1" 2>/dev/null || true
  case "$pid" in ''|*[!0-9]*) return 1;; esac
  kill -0 "$pid" 2>/dev/null || return 1
  [ "$(ctl_sem_lstart "$pid")" = "$ls" ]
}
ctl_sem_mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0; }
# Atomic: rename away, then delete; of two reclaimers only one `mv` finds the source. The post-check puts a LIVE holder back (a fresh claimant
# that took the slot between our staleness read and the rename); that window is a few milliseconds and the failure is one extra slot, not a hang.
ctl_sem_drop() {
  local d="$1" t="$1.stale.$$"
  mv "$d" "$t" 2>/dev/null || return 0
  if [ -f "$t/holder" ] && ctl_sem_holder_live "$t/holder"; then mv "$t" "$d" 2>/dev/null || rm -rf "$t"; else rm -rf "$t"; fi
}
# Free every stale slot and gate marker. A holder-less slot dir is a claim in progress while it is younger than CTL_SEM_GRACE_SECS (real time:
# it is a file mtime), a claimant that died between mkdir and writing its holder once it is older.
ctl_sem_reclaim() {
  local sem d now; sem="$(ctl_sem_dir)"; now="$(date +%s)"
  for d in "$sem"/slot-*; do
    [ -d "$d" ] || continue
    case "$d" in *.stale.*) continue;; esac
    if [ -f "$d/holder" ]; then ctl_sem_holder_live "$d/holder" || ctl_sem_drop "$d"
    elif [ $(( now - $(ctl_sem_mtime "$d") )) -gt "${CTL_SEM_GRACE_SECS:-10}" ]; then ctl_sem_drop "$d"; fi
  done
  for d in "$sem"/gate-*; do [ -f "$d" ] || continue; ctl_sem_holder_live "$d" || rm -f "$d"; done
  return 0
}
ctl_sem_gate_live() { local g sem; sem="$(ctl_sem_dir)"; for g in "$sem"/gate-*; do [ -f "$g" ] && ctl_sem_holder_live "$g" && return 0; done; return 1; }

# The gate's priority marker. begin before the REAL gate run, end by an EXIT trap (green, red, ^C). Written by verbs/gate.sh only.
ctl_sem_gate_begin() { local sem; sem="$(ctl_sem_dir)"; ctl_sem_gate_file="$sem/gate-$$"; printf '%s|%s|gate|%s\n' "$$" "$(ctl_sem_lstart $$)" "$(ctl_sem_now)" > "$ctl_sem_gate_file.tmp" && mv "$ctl_sem_gate_file.tmp" "$ctl_sem_gate_file"; }
ctl_sem_gate_end() { [ -n "${ctl_sem_gate_file:-}" ] && rm -f "$ctl_sem_gate_file" "$ctl_sem_gate_file.tmp"; return 0; }

# --- the pressure probe: `memory_pressure` / `sysctl` / `vm_stat` by bare name. Never -l/-p/-s/-S on memory_pressure: those SIMULATE pressure. ---
# Kernel level (kern.memorystatus_vm_pressure_level): 1 normal, 2 warn, 4 critical. Unreadable = unknown = not a reason to block (fail open).
ctl_sem_pressure_why() {
  local lvl free
  lvl="$(sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null)"
  case "$lvl" in ''|1) ;; *) echo "kernel level $lvl"; return 1;; esac
  free="$(memory_pressure 2>/dev/null | sed -n 's/.*free percentage: *\([0-9][0-9]*\)%.*/\1/p' | tail -1)"
  if [ -n "$free" ] && [ "$free" -lt "${CTL_SEM_MIN_FREE_PCT:-15}" ]; then echo "free memory ${free}%"; return 1; fi
  return 0
}
ctl_sem_swapins() { vm_stat 2>/dev/null | awk '/^Swapins:/{gsub(/\./,"",$2); print $2}'; }
ctl_sem_pagesize() { local p; p="$(vm_stat 2>/dev/null | sed -n 's/.*page size of \([0-9]*\) bytes.*/\1/p' | head -1)"; echo "${p:-16384}"; }
# One window: swap-in bytes/s over CTL_SEM_SAMPLE_SECS against the threshold. 0 = high. Sets CTL_SEM_PROBE_SECS (+= the time it slept).
ctl_sem_swap_window_high() {
  local c0 c1 t0 t1 dt psz max
  c0="$(ctl_sem_swapins)"; t0="$(ctl_sem_now)"
  ctl_sem_sleep "${CTL_SEM_SAMPLE_SECS:-3}"
  c1="$(ctl_sem_swapins)"; t1="$(ctl_sem_now)"
  CTL_SEM_PROBE_SECS=$(( ${CTL_SEM_PROBE_SECS:-0} + t1 - t0 ))
  case "$c0$c1" in ''|*[!0-9]*) return 1;; esac   # unreadable: not a reason to block
  dt=$(( t1 - t0 )); [ "$dt" -ge 1 ] || dt=1
  psz="$(ctl_sem_pagesize)"; max="${CTL_SEM_MAX_SWAPIN_MBS:-8}"
  [ $(( (c1 - c0) * psz )) -ge $(( max * 1048576 * dt )) ]
}
# 0 when swap-in is calm. TWO consecutive high windows are needed to block — one window is a blip (measured: 253 pages/s once among ~1/s).
ctl_sem_swap_why() {
  ctl_sem_swap_window_high || return 0
  ctl_sem_swap_window_high || return 0
  echo "swap-in at least ${CTL_SEM_MAX_SWAPIN_MBS:-8} MB/s over two ${CTL_SEM_SAMPLE_SECS:-3} s windows"; return 1
}

# ctl_sem_acquire LABEL — wait for a slot. Order per poll: reclaim stale → a gate runs? → a slot free? → pressure → swap-in → claim → re-check
# the gate (one that began between the probe and the claim gets the slot back). Sets CTL_SEM_SLOT, CTL_SEM_SLOTS, CTL_SEM_WAITED (seconds from
# entering the queue to the grant, minus the final probe's own sampling window: a measurement, not a wait) and CTL_SEM_REASONS (a+b, "-" none).
# Returns 75 when CTL_SEM_MAX_WAIT elapses first (nothing claimed).
ctl_sem_acquire() {
  local label="$1" sem n N free start now reasons="" why max="${CTL_SEM_MAX_WAIT:-1800}"
  sem="$(ctl_sem_dir)"; start="$(ctl_sem_now)"; CTL_SEM_SLOT=""
  while :; do
    CTL_SEM_PROBE_SECS=0; why=""; N="$(ctl_sem_slots)"; CTL_SEM_SLOTS="$N"
    ctl_sem_reclaim
    if ctl_sem_gate_live; then why=gate
    else
      free=""; n=1; while [ "$n" -le "$N" ]; do [ -d "$sem/slot-$n" ] || { free="$n"; break; }; n=$((n+1)); done
      if [ -z "$free" ]; then why=slots
      elif ! ctl_sem_pressure_why > /dev/null; then why=pressure
      elif ! ctl_sem_swap_why > /dev/null; then why=swap
      elif mkdir "$sem/slot-$free" 2>/dev/null; then
        printf '%s|%s|%s|%s\n' "$$" "$(ctl_sem_lstart $$)" "$label" "$(ctl_sem_now)" > "$sem/slot-$free/holder.tmp" && mv "$sem/slot-$free/holder.tmp" "$sem/slot-$free/holder"
        if [ -n "${CTL_SEM_CLAIM_HOOK:-}" ]; then "$CTL_SEM_CLAIM_HOOK"; fi
        if ctl_sem_gate_live; then rm -rf "$sem/slot-$free"; why=gate
        else CTL_SEM_SLOT="$free"; break; fi
      else why=slots; fi   # lost the race for that slot to another waiter
    fi
    case "+$reasons+" in *"+$why+"*) ;; *) reasons="${reasons:+$reasons+}$why";; esac
    now="$(ctl_sem_now)"
    if [ $(( now - start )) -ge "$max" ]; then CTL_SEM_WAITED=$(( now - start )); CTL_SEM_REASONS="${reasons:--}"; return 75; fi
    ctl_sem_sleep "${CTL_SEM_POLL_SECS:-5}"
  done
  now="$(ctl_sem_now)"; CTL_SEM_WAITED=$(( now - start - CTL_SEM_PROBE_SECS )); [ "$CTL_SEM_WAITED" -ge 0 ] || CTL_SEM_WAITED=0
  CTL_SEM_REASONS="${reasons:--}"
  printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$label" "$CTL_SEM_WAITED" "$CTL_SEM_REASONS" "$N" >> "$sem/waits.tsv"
  return 0
}
ctl_sem_release() { [ -n "${CTL_SEM_SLOT:-}" ] && rm -rf "$(ctl_sem_dir)/slot-$CTL_SEM_SLOT"; CTL_SEM_SLOT=""; return 0; }
