#!/usr/bin/env bash
# scripts/ctl/sem.sh — the machine-wide test semaphore (`ctl run-tests`) and the gate's priority marker. Sourced, never executed.
# State lives in CTL_SEM_DIR (default ~/.cache/gisik-ctl/sem): MACHINE-wide, not ctl_marker_dir (that one is per checkout).
#   slot-<n>/holder   one directory per held slot, made by an atomic `mkdir`; holder = `pid|lstart|label|epoch`, lstart = `ps -o lstart=` (LC_ALL=C TZ=UTC0) of
#                     the pid, so a REUSED pid cannot impersonate the holder (stale = pid dead, or alive with another start time)
#   gate-<pid>        a running `ctl gate` (same fields). While any live one exists a new slot is granted only while FEWER than the gate cap
#                     slots are held (CTL_SEM_GATE_SLOTS, else the gate-slots file, else 1; 0 = none is granted); running slots finish.
#   gate-slots        optional: the gate cap (read after CTL_SEM_GATE_SLOTS, re-read every poll, so a rewrite needs no restart)
#                     (the marker globs are gate-[0-9]*, so this file is never mistaken for a stale marker and reclaimed)
#   slots             optional: the slot count (read before CTL_TEST_SLOTS so two callers cannot disagree on N)
#   express-<n>/holder the EXPRESS slots (P72, 13.2360-13.2363): held only by a `--short` run, and only when no normal slot is available to it (the gate cap
#                     reached, or every slot-<n> held); same holder format, same pressure / swap-in / stale-reclaim rules; NOT counted against the gate cap
#                     (ctl_sem_held counts slot-* only). The glob is express-[0-9]*, so the express-slots file is never mistaken for a slot.
#   express-slots     optional: the express slot count E (read after CTL_SEM_EXPRESS_SLOTS, re-read every poll; 0 = none; else 1)
#   swap.verdict      `<epoch> <ok|high>`: the last swap-in sample's result, shared by every waiter while it is at most CTL_SEM_SWAP_TTL s old
#   waits.tsv         one row per run: time, label, queue wait seconds, reason, slot count, probe seconds (the grant poll's own sampling time, which the
#                     wait excludes: wait + probe = queue entry to grant; 0 when a shared verdict was reused), slot class (normal|express), short-overrun
#                     (the seconds a `--short` hold lasted when that was past CTL_SEM_SHORT_MAX, else -) — the history the count is tuned from. The row is
#                     written at RELEASE (the overrun is known only then), its time still the grant's; a run killed by SIGKILL writes none.
# macOS has no flock(1): mkdir is the lock. Bash 3.2-safe (no wait -n, mapfile, declare -A, EPOCHREALTIME; no empty array under set -u).
# Test seams (env): CTL_SEM_CLOCK_FILE (fake clock: ctl_sem_sleep advances it and runs CTL_SEM_SLEEP_HOOK with CTL_SEM_NOW / CTL_SEM_SLEEP_SECS),
# CTL_SEM_CLAIM_HOOK (runs right after a slot was claimed), CTL_SEM_POLL_SECS, CTL_SEM_SAMPLE_SECS.
# Knobs: CTL_TEST_SLOTS (2), CTL_SEM_MIN_FREE_PCT (15), CTL_SEM_MAX_SWAPIN_MBS (8), CTL_SEM_SAMPLE_SECS (3), CTL_SEM_SWAP_TTL (10), CTL_SEM_POLL_SECS (1),
# CTL_SEM_MAX_WAIT (1800), CTL_SEM_GRACE_SECS (10), CTL_SEM_GATE_SLOTS (the gate-slots file, else 1), CTL_SEM_EXPRESS_SLOTS (the express-slots file,
# else 1), CTL_SEM_SHORT_MAX (90: a `--short` hold longer than this is logged as SHORT-OVERRUN, never killed).

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
# `Thu Oct  3 00:46:12 2026`, whitespace squeezed; empty when the pid does not exist. Rendered with LC_ALL=C TZ=UTC0: `ps -o lstart=` follows the CALLER's
# TZ and locale, and a waiter in another zone would read a LIVE holder as "another start time" (a reused pid) and reclaim its slot or gate marker.
ctl_sem_lstart() { LC_ALL=C TZ=UTC0 ps -o lstart= -p "$1" 2>/dev/null | sed 's/^ *//; s/  */ /g'; }
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
  for d in "$sem"/slot-* "$sem"/express-[0-9]*; do
    [ -d "$d" ] || continue
    case "$d" in *.stale.*) continue;; esac
    if [ -f "$d/holder" ]; then ctl_sem_holder_live "$d/holder" || ctl_sem_drop "$d"
    elif [ $(( now - $(ctl_sem_mtime "$d") )) -gt "${CTL_SEM_GRACE_SECS:-10}" ]; then ctl_sem_drop "$d"; fi
  done
  for d in "$sem"/gate-[0-9]*; do [ -f "$d" ] || continue; ctl_sem_holder_live "$d" || rm -f "$d"; done
  return 0
}
# The slots a live gate leaves the lanes: CTL_SEM_GATE_SLOTS when set to a number, else the `gate-slots` file in the sem dir when its trimmed content is a
# number, else 1 (a non-numeric or empty file falls through to 1, never to 0). 0 is valid in either (no grant while a gate runs). Re-read on every call,
# so a rewrite of the file takes effect on the next poll of every waiter. The read sits in a group so `2>/dev/null` is in place before the `<` opens
# the file: a missing file (the normal state) prints nothing (13.2276).
ctl_sem_gate_slots() {
  local c="${CTL_SEM_GATE_SLOTS:-}"
  case "$c" in ''|*[!0-9]*) c="$( { tr -d '[:space:]' < "$(ctl_sem_dir)/gate-slots"; } 2>/dev/null )";; esac
  case "$c" in ''|*[!0-9]*) c=1;; esac
  echo "$c"
}
# Slots held now: every slot-<n>/holder file, PRESENT, not re-checked for life — the caller runs ctl_sem_reclaim first, which is what keeps a stale
# holder out of the count. A dir moved aside by a reclaimer (slot-<n>.stale.<pid>) is not a slot.
ctl_sem_held() {
  local d sem n=0; sem="$(ctl_sem_dir)"
  for d in "$sem"/slot-*; do case "$d" in *.stale.*) continue;; esac; [ -f "$d/holder" ] && n=$((n+1)); done
  echo "$n"
}
# The express slot count E (P72): CTL_SEM_EXPRESS_SLOTS when set to a number, else the `express-slots` file's trimmed content when a number, else 1.
# 0 is valid in either (no express slot). Re-read on every poll, as gate-slots is.
ctl_sem_express_slots() {
  local c="${CTL_SEM_EXPRESS_SLOTS:-}"
  case "$c" in ''|*[!0-9]*) c="$( { tr -d '[:space:]' < "$(ctl_sem_dir)/express-slots"; } 2>/dev/null )";; esac
  case "$c" in ''|*[!0-9]*) c=1;; esac
  echo "$c"
}
# The `--short` contract (P72): a hold past this many seconds is logged (SHORT-OVERRUN), not stopped. 90 unless CTL_SEM_SHORT_MAX is a number.
ctl_sem_short_max() { local m="${CTL_SEM_SHORT_MAX:-90}"; case "$m" in ''|*[!0-9]*) m=90;; esac; echo "$m"; }
ctl_sem_gate_live() { local g sem; sem="$(ctl_sem_dir)"; for g in "$sem"/gate-[0-9]*; do [ -f "$g" ] && ctl_sem_holder_live "$g" && return 0; done; return 1; }

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
# The shared verdict (13.2310-13.2315): `ok` or `high` when swap.verdict is at most CTL_SEM_SWAP_TTL (10) s old by ctl_sem_now, nothing when it is
# missing, unparsable, older, or stamped in the FUTURE (a clock stepped back must not keep a `high` alive past its TTL). The read sits in a group so
# a missing file (the cold state) prints nothing.
ctl_sem_swap_cached() {
  local t="" v="" age ttl="${CTL_SEM_SWAP_TTL:-10}"
  case "$ttl" in ''|*[!0-9]*) ttl=10;; esac
  { read -r t v < "$(ctl_sem_dir)/swap.verdict"; } 2>/dev/null || return 0
  case "$t" in ''|*[!0-9]*) return 0;; esac
  case "$v" in ok|high) ;; *) return 0;; esac
  age=$(( $(ctl_sem_now) - t ))
  if [ "$age" -ge 0 ] && [ "$age" -le "$ttl" ]; then echo "$v"; fi
  return 0
}
# 0 when swap-in is calm. A fresh shared verdict is reused as it stands (no sleep: a reused `high` blocks exactly as a sampled one); only a stale or
# missing one samples, and that sample's result, stamped with the time it ENDED, becomes the verdict for every waiter. TWO consecutive high windows
# are needed to make it `high` — one window is a blip (measured: 253 pages/s once among ~1/s). Runs in the caller's shell (CTL_SEM_PROBE_SECS).
ctl_sem_swap_why() {
  local v sem; sem="$(ctl_sem_dir)"; v="$(ctl_sem_swap_cached)"
  if [ -z "$v" ]; then
    v=ok; if ctl_sem_swap_window_high && ctl_sem_swap_window_high; then v=high; fi
    printf '%s %s\n' "$(ctl_sem_now)" "$v" > "$sem/swap.verdict.$$" && mv "$sem/swap.verdict.$$" "$sem/swap.verdict"
  fi
  [ "$v" = ok ] && return 0
  echo "swap-in at least ${CTL_SEM_MAX_SWAPIN_MBS:-8} MB/s over two ${CTL_SEM_SAMPLE_SECS:-3} s windows"; return 1
}

# ctl_sem_acquire LABEL [short] — wait for a slot. Order per poll: reclaim stale → a gate runs with the gate cap already held? → a slot free? →
# pressure → swap-in → claim → re-check the gate (one that began between the probe and the claim gets the slot back when, counting the claim,
# more than the gate cap are held); every CTL_SEM_POLL_SECS (1) while nothing is granted. A `short` run (P72) whose normal path is blocked by the
# gate cap or by every slot held tries an EXPRESS slot next, in the same poll: one of express-1..E free → pressure → swap-in → claim, with no gate
# re-check (express slots are not counted against the cap). A normal slot is always tried first; a run that is not `short` never takes an express one.
# Sets CTL_SEM_SLOT, CTL_SEM_CLASS (normal|express), CTL_SEM_SLOTS (N, or E for express), CTL_SEM_WAITED (seconds from entering the queue to the
# grant, minus the grant poll's own sampling time CTL_SEM_PROBE_SECS: a measurement, not a wait; 0 on a reused verdict) and CTL_SEM_REASONS (a+b,
# "-" none). The waits.tsv row is written by ctl_sem_release (it carries the short-overrun, known only then): wait + probe = queue entry to grant.
# A grant also sets the row's fields for release: CTL_SEM_GRANTED (ctl_sem_now), CTL_SEM_GRANT_UTC, CTL_SEM_SHORT, CTL_SEM_LABEL, CTL_SEM_ROW_N.
# Returns 75 when CTL_SEM_MAX_WAIT elapses first (nothing claimed).
ctl_sem_acquire() {
  local label="$1" short="${2:-}" sem n N E free got start now reasons="" why max="${CTL_SEM_MAX_WAIT:-1800}"
  sem="$(ctl_sem_dir)"; start="$(ctl_sem_now)"; CTL_SEM_SLOT=""; CTL_SEM_CLASS=""
  while :; do
    CTL_SEM_PROBE_SECS=0; why=""; N="$(ctl_sem_slots)"; CTL_SEM_SLOTS="$N"
    ctl_sem_reclaim
    if ctl_sem_gate_live && [ "$(ctl_sem_held)" -ge "$(ctl_sem_gate_slots)" ]; then why=gate
    else
      free=""; n=1; while [ "$n" -le "$N" ]; do [ -d "$sem/slot-$n" ] || { free="$n"; break; }; n=$((n+1)); done
      if [ -z "$free" ]; then why=slots
      elif ! ctl_sem_pressure_why > /dev/null; then why=pressure
      elif ! ctl_sem_swap_why > /dev/null; then why=swap
      else
        # Claim ANY free slot, not the one seen before the probes: a sibling that probed with us may have taken it meanwhile (measured
        # 2026-10-03: three runs started together, the second lost slot 1 to the first and sat out a whole poll for slot 2, which was free).
        got=""; n=1; while [ "$n" -le "$N" ]; do if mkdir "$sem/slot-$n" 2>/dev/null; then got="$n"; break; fi; n=$((n+1)); done
        if [ -z "$got" ]; then why=slots
        else
          printf '%s|%s|%s|%s\n' "$$" "$(ctl_sem_lstart $$)" "$label" "$(ctl_sem_now)" > "$sem/slot-$got/holder.tmp" && mv "$sem/slot-$got/holder.tmp" "$sem/slot-$got/holder"
          if [ -n "${CTL_SEM_CLAIM_HOOK:-}" ]; then "$CTL_SEM_CLAIM_HOOK"; fi
          if ctl_sem_gate_live && [ "$(ctl_sem_held)" -gt "$(ctl_sem_gate_slots)" ]; then rm -rf "$sem/slot-$got"; why=gate
          else CTL_SEM_SLOT="$got"; CTL_SEM_CLASS=normal; break; fi
        fi
      fi
    fi
    # The express fallback (P72): only for a short run, and only when the NORMAL path was refused for want of a slot (gate cap or all held) —
    # pressure and swap-in refusals bind it too, so they are not retried here.
    if [ "$short" = short ] && { [ "$why" = gate ] || [ "$why" = slots ]; }; then
      E="$(ctl_sem_express_slots)"
      free=""; n=1; while [ "$n" -le "$E" ]; do [ -d "$sem/express-$n" ] || { free="$n"; break; }; n=$((n+1)); done
      if [ -n "$free" ]; then
        if ! ctl_sem_pressure_why > /dev/null; then why=pressure
        elif ! ctl_sem_swap_why > /dev/null; then why=swap
        else
          got=""; n=1; while [ "$n" -le "$E" ]; do if mkdir "$sem/express-$n" 2>/dev/null; then got="$n"; break; fi; n=$((n+1)); done
          if [ -n "$got" ]; then
            printf '%s|%s|%s|%s\n' "$$" "$(ctl_sem_lstart $$)" "$label" "$(ctl_sem_now)" > "$sem/express-$got/holder.tmp" && mv "$sem/express-$got/holder.tmp" "$sem/express-$got/holder"
            CTL_SEM_SLOT="$got"; CTL_SEM_CLASS=express; CTL_SEM_SLOTS="$E"; break
          fi
        fi
      fi
    fi
    case "+$reasons+" in *"+$why+"*) ;; *) reasons="${reasons:+$reasons+}$why";; esac
    now="$(ctl_sem_now)"
    if [ $(( now - start )) -ge "$max" ]; then CTL_SEM_WAITED=$(( now - start )); CTL_SEM_REASONS="${reasons:--}"; return 75; fi
    ctl_sem_sleep "${CTL_SEM_POLL_SECS:-1}"
  done
  now="$(ctl_sem_now)"; CTL_SEM_WAITED=$(( now - start - CTL_SEM_PROBE_SECS )); [ "$CTL_SEM_WAITED" -ge 0 ] || CTL_SEM_WAITED=0
  CTL_SEM_REASONS="${reasons:--}"; CTL_SEM_GRANTED="$now"; CTL_SEM_SHORT="$short"; CTL_SEM_LABEL="$label"; CTL_SEM_ROW_N="$N"
  CTL_SEM_GRANT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  return 0
}
# ctl_sem_release writes the run's waits.tsv row, then frees the slot — only while the holder file names THIS run: a slot that was wrongly reclaimed
# and re-claimed is somebody else's, and a holder-less dir is a claim in progress (the grace rule) — both survive our exit. It sets CTL_SEM_OVERRUN,
# the row's 8th column: the seconds a `short` hold lasted when that is past ctl_sem_short_max, else empty (written `-`). Computed ONCE, here, on
# every exit path (a signal too), so the log line run-tests writes from it and the row never disagree.
ctl_sem_release() {
  local d hp hrest sem held
  if [ -n "${CTL_SEM_SLOT:-}" ]; then
    sem="$(ctl_sem_dir)"; CTL_SEM_OVERRUN=""
    if [ "${CTL_SEM_SHORT:-}" = short ]; then
      held=$(( $(ctl_sem_now) - CTL_SEM_GRANTED ))
      if [ "$held" -gt "$(ctl_sem_short_max)" ]; then CTL_SEM_OVERRUN="$held"; fi
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$CTL_SEM_GRANT_UTC" "$CTL_SEM_LABEL" "$CTL_SEM_WAITED" "$CTL_SEM_REASONS" "$CTL_SEM_ROW_N" "$CTL_SEM_PROBE_SECS" "$CTL_SEM_CLASS" "${CTL_SEM_OVERRUN:--}" >> "$sem/waits.tsv"
    if [ "$CTL_SEM_CLASS" = express ]; then d="$sem/express-$CTL_SEM_SLOT"; else d="$sem/slot-$CTL_SEM_SLOT"; fi
    hp=""; { IFS='|' read -r hp hrest < "$d/holder"; } 2>/dev/null || true
    [ "$hp" = "$$" ] && rm -rf "$d"
  fi
  CTL_SEM_SLOT=""; return 0
}
