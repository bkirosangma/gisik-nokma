#!/usr/bin/env bash
# scripts/ctl/test/prune-gate-locks.test.sh — cases 13.2100-13.2104 for `ctl prune-gate-locks`; run by `ctl selftest`.
# Every case builds a SCRATCH log dir (CTL_LOG_DIR) with a fixed clock (CTL_PRUNE_NOW) and a fake `ps` (CTL_PRUNE_PS_CMD), so the
# live ~/.cache/gisik-ctl and a real running gate are never read or touched. A KEEP case asserts the verdict REASON (--list) on an
# entry that is old enough to go, and has its CONTROL in the same check: the same entry with that one attribute changed is REMOVE.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
V="$HERE/ctl"
fails=0
grep() { /usr/bin/grep "$@"; }   # never the PATH grep (ugrep here: different -E / BRE semantics; a negated check must not pass on its error)
check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }
NOW=$(date -j -f '%Y-%m-%d %H:%M:%S' '2026-10-04 12:00:00' +%s)
H=3600; DAY=86400
TMPLIST=$(mktemp); trap 'while read -r d; do case "$d" in /*/tmp.*) rm -rf "$d";; esac; done < "$TMPLIST"; rm -f "$TMPLIST"' EXIT
mk() { base=$(cd "$(mktemp -d)" && pwd -P); echo "$base" >> "$TMPLIST"; ld="$base/logs"; mkdir -p "$ld"; : > "$base/ps.txt"
  export CTL_LOG_DIR="$ld" CTL_PRUNE_NOW="$NOW" CTL_PRUNE_PS_CMD="cat $base/ps.txt"; }
age() { touch -t "$(date -r $((NOW - $2)) +%Y%m%d%H%M.%S)" "$1"; }
# lock NAME AGE — a gate-lock dir holding the copied scripts, its mtime NOW - AGE. logf NAME AGE — a log file.
lock() { mkdir -p "$ld/$1"; echo 'exit 0' > "$ld/$1/gate.sh"; age "$ld/$1" "$2"; }
logf() { echo log > "$ld/$1"; age "$ld/$1" "$2"; }
run() { out=$("${CTL_PRUNE_RUNNER:-$V}" prune-gate-locks --list "$@" 2>&1); rc=$?; }
verdict() { printf '%s\n' "$out" | awk -F'\t' -v n="$1" '$2 == n || $2 == n "/" {print $1}'; }
# world: the five dirs of 13.2100 — OLD (2 days, dead pid), FRESH (1 h), NEWEST (newest mtime, 3 days by name but touched last),
# LIVE (2 days, pid 4242 in ps), INPS (2 days, its path in another process's args).
world() { mk
  lock gate-lock-20261002T100000-1111 $((2 * DAY))
  lock gate-lock-20261004T110000-2222 $H
  lock gate-lock-20261002T100000-4242 $((2 * DAY))
  lock gate-lock-20261002T100000-5555 $((2 * DAY))
  lock gate-lock-20261001T100000-6666 $((2 * DAY)); age "$ld/gate-lock-20261001T100000-6666" 60
  printf '4242 bash /x/scripts/ctl/verbs/gate.sh abc --base release/x\n9999 bash %s/gate-lock-20261002T100000-5555/gate.sh %s/gate-x.log\n' "$ld" "$ld" > "$base/ps.txt"; }
prune_ok() {   # the 13.2100 assertion; also what the mutants of 13.2104 must break
  world; run || return 1
  [ "$(verdict gate-lock-20261002T100000-1111)" = REMOVE ] && [ "$(verdict gate-lock-20261004T110000-2222)" = KEEP:recent ] \
    && [ "$(verdict gate-lock-20261001T100000-6666)" = KEEP:newest ] && [ "$(verdict gate-lock-20261002T100000-4242)" = KEEP:live-pid ] \
    && [ "$(verdict gate-lock-20261002T100000-5555)" = KEEP:in-ps ] || return 1
  out=$("${CTL_PRUNE_RUNNER:-$V}" prune-gate-locks --apply 2>&1) || return 1
  [ ! -e "$ld/gate-lock-20261002T100000-1111" ] && [ -d "$ld/gate-lock-20261004T110000-2222" ] && [ -d "$ld/gate-lock-20261001T100000-6666" ] \
    && [ -d "$ld/gate-lock-20261002T100000-4242" ] && [ -d "$ld/gate-lock-20261002T100000-5555" ]; }
# the controls: the SAME dirs with the protecting attribute removed are REMOVE (proves each KEEP above is that attribute's doing)
prune_controls() { world; : > "$base/ps.txt"; age "$ld/gate-lock-20261004T110000-2222" $((2 * DAY)); age "$ld/gate-lock-20261001T100000-6666" $((2 * DAY)); lock gate-lock-20261004T115900-7777 60; run || return 1
  [ "$(verdict gate-lock-20261002T100000-4242)" = REMOVE ] && [ "$(verdict gate-lock-20261002T100000-5555)" = REMOVE ] \
    && [ "$(verdict gate-lock-20261004T110000-2222)" = REMOVE ] && [ "$(verdict gate-lock-20261001T100000-6666)" = REMOVE ] \
    && [ "$(verdict gate-lock-20261004T115900-7777)" = KEEP:newest ]; }
check "13.2100 a gate-lock dir 2 days old whose pid is dead and that no process names is REMOVE and --apply removes it; a 1 h dir (recent), the newest dir, a 2-day dir whose run pid is alive (live-pid) and one a running bash names (in-ps) are KEPT with that reason and still exist after --apply; CONTROL in the same check: the same four with the protecting attribute removed (ps empty, aged 2 days, a newer dir added) are REMOVE" 'prune_ok && prune_controls'

snap() { ( cd "$ld" && find . | sort | while read -r p; do echo "$p $(stat -f %m "$p")"; done | shasum ); }
dry_ok() { world; local a b; a=$(snap); run || return 1; out2=$("$V" prune-gate-locks 2>&1) || return 1; b=$(snap)
  [ "$a" = "$b" ] && printf '%s' "$out2" | tail -1 | grep -q '^OK prune-gate-locks would remove (dry-run; --apply to remove) 1 gate-lock dirs' \
    && out3=$("$V" prune-gate-locks --apply 2>&1) && [ "$(snap)" != "$a" ] && printf '%s' "$out3" | tail -1 | grep -q '^OK prune-gate-locks removed 1 gate-lock dirs'; }
check "13.2101 dry-run is the DEFAULT: with no flag and with --list the log dir is byte-for-byte unchanged (names + mtimes) and the summary says 'would remove'; CONTROL in the same check: --apply on the same dir changes it and says 'removed'; --apply --dry-run together is refused" \
  'dry_ok && o=$("$V" prune-gate-locks --apply --dry-run 2>&1); [ $? = 1 ] && printf "%s" "$o" | grep -q contradict'

logs_ok() { mk; lock gate-lock-20261004T115000-1 60
  logf gate-20260920T100000-111.log $((8 * DAY)); logf gate-20260920T100000-111.log.console $((8 * DAY))
  logf gate-20260930T100000-222.log $((6 * DAY)); logf tipmerge-20260920T100000-333.log $((8 * DAY))
  logf gate-20260920T100000-4242.log $((8 * DAY)); printf '4242 bash /x/verbs/gate.sh\n' > "$base/ps.txt"
  lock gate-lock-20261003T100000-888 $((25 * H)); lock gate-lock-20261003T120000-889 $((23 * H)); run || return 1
  [ "$(verdict gate-20260920T100000-111.log)" = REMOVE ] && [ "$(verdict gate-20260920T100000-111.log.console)" = REMOVE ] \
    && [ "$(verdict gate-20260930T100000-222.log)" = KEEP:recent ] && [ -z "$(verdict tipmerge-20260920T100000-333.log)" ] \
    && [ "$(verdict gate-20260920T100000-4242.log)" = KEEP:live-pid ] \
    && [ "$(verdict gate-lock-20261003T100000-888)" = REMOVE ] && [ "$(verdict gate-lock-20261003T120000-889)" = KEEP:recent ] || return 1
  "$V" prune-gate-locks --apply >/dev/null 2>&1 && [ -f "$ld/tipmerge-20260920T100000-333.log" ] && [ -f "$ld/gate-20260930T100000-222.log" ] && [ ! -e "$ld/gate-20260920T100000-111.log" ]; }
check "13.2102 logs: an 8-day gate log and its .console are REMOVE, a 6-day gate log is KEEP:recent (7-day line), an 8-day gate log whose pid is alive is KEEP:live-pid, an 8-day tipmerge log is not even listed (no other verb's log is touched) and survives --apply; the dir line is 24 h: 25 h REMOVE, 23 h KEEP:recent" 'logs_ok'

check "13.2103 only names of the two shapes directly in the log dir: a symlink named like a gate-lock dir, a file named like one, and a gate-lock dir nested one level down are never listed or removed; CONTROL in the same check: a real old gate-lock dir beside them is REMOVE" \
  'mk; lock gate-lock-20261004T115000-1 60; lock gate-lock-20261001T100000-2 $((3 * DAY)); mkdir -p "$base/elsewhere"; ln -s "$base/elsewhere" "$ld/gate-lock-20261001T100000-3"; echo f > "$ld/gate-lock-20261001T100000-4"; age "$ld/gate-lock-20261001T100000-4" $((3 * DAY)); mkdir -p "$ld/sub"; lock sub/gate-lock-20261001T100000-5 $((3 * DAY)); run && [ "$(verdict gate-lock-20261001T100000-2)" = REMOVE ] && [ -z "$(verdict gate-lock-20261001T100000-3)" ] && [ -z "$(verdict gate-lock-20261001T100000-4)" ] && "$V" prune-gate-locks --apply >/dev/null && [ -d "$base/elsewhere" ] && [ -L "$ld/gate-lock-20261001T100000-3" ] && [ -f "$ld/gate-lock-20261001T100000-4" ] && [ -d "$ld/sub/gate-lock-20261001T100000-5" ]'

# mutant ANCHOR REPLACEMENT — a copy of prune-gate-locks.py with ANCHOR (which must occur exactly once) replaced; prints its path
PYSRC="$HERE/verbs/prune-gate-locks.py"
mutant() { local m; m=$(mktemp "${TMPDIR:-/tmp}/prune-mut.XXXX"); echo "$m" >> "$TMPLIST"
  python3 -c 'import sys; s=open(sys.argv[1]).read(); assert s.count(sys.argv[2])==1, "anchor not found once"; open(sys.argv[3],"w").write(s.replace(sys.argv[2],sys.argv[4]))' "$PYSRC" "$1" "$m" "$2" && echo "$m"; }
kills() { local m; m=$(mutant "$1" "$2") || return 1; ! CTL_PRUNE_PY="$m" prune_ok; }
check "13.2104 every guard is load-bearing: copies with the age test dropped, the live-pid guard dropped, the in-ps guard dropped, the newest guard dropped, and the 24 h line stepped to 0 each FAIL the 13.2100 assertion; CONTROL in the same check: the unmutated file passes it through the same seam" \
  'CTL_PRUNE_PY="$PYSRC" prune_ok && kills "elif age <= (DIR_AGE if is_dir else LOG_AGE): why = \"recent\"" "elif False: why = \"recent\"" && kills "elif int(m.group(2)) in pids: why = \"live-pid\"" "elif False: why = \"live-pid\"" && kills "for _, args in procs): why = \"in-ps\"" "for _, args in procs) and False: why = \"in-ps\"" && kills "if is_dir and n == newest: why = \"newest\"" "if False: why = \"newest\"" && kills "DIR_AGE = 24 * 3600" "DIR_AGE = 0"'

[ "$fails" -eq 0 ] && { echo "prune-gate-locks tests: all ok"; exit 0; } || { echo "prune-gate-locks tests: $fails FAILED"; exit 1; }
