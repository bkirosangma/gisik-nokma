#!/usr/bin/env bash
# scripts/ctl/test/archive.test.sh — assertions for `ctl archive`; run by `ctl selftest`.
# Every case builds a SCRATCH lanes root (CTL_LANES_DIR) with a fixed clock (CTL_ARCHIVE_NOW), a scratch semaphore dir and a fake `ps`
# (CTL_ARCHIVE_PS_CMD), so nothing here reads or writes the live lanes directory, and a real `ctl gate` elsewhere cannot redden a case.
# An exclusion case asserts the VERDICT REASON the verb prints (--list), on a fixture that meets every other move condition, and has a
# CONTROL: the same file with that one attribute changed, which is MOVE.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
V="$HERE/ctl"
fails=0
check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }
unset CTL_DRY_RUN
NOW=$(date -j -f '%Y-%m-%d %H:%M:%S' '2026-10-03 12:00:00' +%s)
TODAY=2026-10-03
DAY=86400
TMPLIST=$(mktemp); trap 'while read -r d; do case "$d" in /*/tmp.*) rm -rf "$d";; esac; done < "$TMPLIST"; rm -f "$TMPLIST"' EXIT

# mk: a fresh scratch tree. $base/lanes is the lanes root; roles/ holds LANES.md and two queues (the verb fails closed without them).
mk() {
  base=$(cd "$(mktemp -d)" && pwd -P); echo "$base" >> "$TMPLIST"; root="$base/lanes"; mkdir -p "$root/roles" "$base/logs" "$base/sem"
  printf '# LANES\n| 1 | gisik:1 | work |\n' > "$root/roles/LANES.md"
  printf '# QUEUE-dispatch\n10:00 NOTE nothing here\n' > "$root/roles/QUEUE-dispatch.md"
  printf '# QUEUE-gate\n10:00 NOTE nothing here\n' > "$root/roles/QUEUE-gate.md"
  : > "$base/ps.txt"
  export CTL_LANES_DIR="$root" CTL_ARCHIVE_NOW="$NOW" CTL_LOG_DIR="$base/logs" CTL_SEM_DIR="$base/sem" CTL_ARCHIVE_PS_CMD="cat $base/ps.txt"
}
# fa NAME AGE_SECONDS [CONTENT] — a file in the lanes root whose mtime is NOW - AGE.
fa() { printf '%s\n' "${3:-body of $1}" > "$root/$1"; touch -t "$(date -r $((NOW - $2)) +%Y%m%d%H%M.%S)" "$root/$1"; }
old() { fa "$1" $((30 * DAY)) "${2:-}"; }   # 30 days: well past the 7-day line
dry() { out=$("$V" archive --list "$@" 2>&1); rc=$?; last=$(printf '%s\n' "$out" | tail -1); }
app() { out=$("$V" archive --apply --list "$@" 2>&1); rc=$?; last=$(printf '%s\n' "$out" | tail -1); }
verdict() { printf '%s\n' "$out" | awk -F'\t' -v n="$1" '$2 == n {print $1}'; }
moved() { [ ! -e "$root/$1" ] && [ -f "$root/archive/$TODAY/$1" ]; }
stayed() { [ -f "$root/$1" ] && [ ! -e "$root/archive/$TODAY/$1" ]; }
snap() { ( cd "$root" && find . | sort | while read -r p; do if [ -f "$p" ]; then echo "$p $(shasum < "$p") $(stat -f %m "$p") $(stat -f %i "$p")"; else echo "$p"; fi; done | shasum ); }
# keeps NAME REASON: dry-run says KEEP:REASON for NAME. moves NAME: says MOVE.
keeps() { [ "$(verdict "$1")" = "KEEP:$2" ]; }
moves() { [ "$(verdict "$1")" = MOVE ]; }
# each PRED ARG... — PRED must hold for EVERY ARG (a bare `for` loop reports only its last iteration's status, which hides a mutant
# that breaks all but the last item).
each() { local f="$1" x r=0; shift; for x in "$@"; do "$f" "$x" || { echo "  (not satisfied: $f $x)" >&2; r=1; }; done; return $r; }
moved_same() { moved "$1" && [ "$(cat "$root/archive/$TODAY/$1")" = "content of $1" ]; }
kept_protected() { keeps "$1" protected && stayed "$1"; }
outside_stays() { stayed "$1" && [ -z "$(verdict "$1")" ]; }
dir_intact() { [ "$(cat "$root/$1/BRIEF-deep.md")" = "keep me" ]; }
in_flight_refuses() { printf "%s\n" "$1" > "$base/ps.txt"; app; [ $rc -eq 1 ]; }

# --- 13.2000: dry-run is the default and mutates nothing --------------------------------------------------------------------
check "13.2000 no flag = dry-run: exit 0, names the files it would move, and the lanes tree is byte-identical (no archive/ dir, no INDEX, no roll)" 'mk; old BRIEF-a.md; old PTR-b.md; seq 1 50 > "$root/CTL-TO-PLANNER-notes.md"; s0=$(snap); dry; [ $rc -eq 0 ] && moves BRIEF-a.md && moves PTR-b.md && printf "%s\n" "$last" | grep -q "^OK archive dry-run: would move 2 files" && [ "$(snap)" = "$s0" ] && [ ! -e "$root/archive" ]'
check "13.2000 an explicit --dry-run is the same, and --apply together with it refuses" 'mk; old BRIEF-a.md; s0=$(snap); out=$("$V" archive --dry-run 2>&1); rc=$?; [ $rc -eq 0 ] && [ "$(snap)" = "$s0" ] && out=$("$V" archive --apply --dry-run 2>&1); [ $? -eq 1 ] && printf "%s\n" "$out" | tail -1 | grep -q "^FAIL archive .*contradict" && [ "$(snap)" = "$s0" ]'
check "13.2000 CTL_DRY_RUN=0 in the environment does not apply, and CONTROL — --apply on the same fixture moves the file" 'mk; old BRIEF-a.md; s0=$(snap); CTL_DRY_RUN=0 dry; [ $rc -eq 0 ] && [ "$(snap)" = "$s0" ] && app && [ $rc -eq 0 ] && moved BRIEF-a.md'

# --- 13.2001: what moves, and how ---------------------------------------------------------------------------------------------
FAMILIES="BRIEF-x.md PTR-x.md MSG-x.md NOTE-x.md HANDOFF-x.md EXEC-x.md EXEC2-x.md pr-x.md DISPATCH-x.md gate-x.log"
check "13.2001 every working-file family moves (BRIEF- PTR- MSG- NOTE- HANDOFF- EXEC- EXEC<n>- pr- DISPATCH- gate-): same name, same bytes, source gone" 'mk; for n in $FAMILIES; do old "$n" "content of $n"; done; app; [ $rc -eq 0 ] && each moved_same $FAMILIES'
check "13.2001 nothing is lost: the file count is conserved (kept + archived = before), only INDEX.tsv is new" 'mk; for n in $FAMILIES; do old "$n"; done; fa BRIEF-new.md 3600; b=$(find "$root" -type f | wc -l); app; a=$(find "$root" -type f | wc -l); [ $((a - b)) -eq 1 ] && [ -f "$root/archive/$TODAY/INDEX.tsv" ] && [ "$(ls "$root/archive/$TODAY" | wc -l | tr -d " ")" -eq 11 ]'
check "13.2001 INDEX.tsv: a header and one row per moved file — file, mtime, size, original path" 'mk; old BRIEF-a.md "twelve bytes"; app; x="$root/archive/$TODAY/INDEX.tsv"; [ "$(sed -n 1p "$x")" = "$(printf "file\tmtime\tsize\toriginal_path")" ] && [ "$(sed -n 2p "$x" | cut -f1)" = BRIEF-a.md ] && sed -n 2p "$x" | cut -f2 | grep -qE "^2026-09-03T12:00:00$" && [ "$(sed -n 2p "$x" | cut -f3)" = 13 ] && [ "$(sed -n 2p "$x" | cut -f4)" = "$root/BRIEF-a.md" ] && [ "$(wc -l < "$x" | tr -d " ")" -eq 2 ]'
check "13.2001 a second apply on the same day appends to INDEX.tsv (one header) instead of replacing it" 'mk; old BRIEF-a.md; app; old PTR-b.md; app; x="$root/archive/$TODAY/INDEX.tsv"; [ "$(grep -c "^file" "$x")" = 1 ] && grep -q "^BRIEF-a.md" "$x" && grep -q "^PTR-b.md" "$x" && moved PTR-b.md'
check "13.2001 the dry-run, the log and the OK line agree on the count; the plan log lists every verdict" 'mk; old BRIEF-a.md; old BRIEF-b.md; fa BRIEF-c.md 3600; dry; l=$(ls "$base/logs"/archive-*.log); [ "$(grep -c "^MOVE" "$l")" = 2 ] && grep -q "^KEEP:recent	BRIEF-c.md" "$l" && printf "%s\n" "$last" | grep -q "would move 2 files"'

# --- 13.2002: the 7-day line ---------------------------------------------------------------------------------------------------
check "13.2002 age: 7 days + 1 hour moves; 7 days - 1 hour is KEEP:recent (and stays after --apply)" 'mk; fa BRIEF-old.md $((7*DAY + 3600)); fa BRIEF-new.md $((7*DAY - 3600)); dry; moves BRIEF-old.md && keeps BRIEF-new.md recent && app && moved BRIEF-old.md && stayed BRIEF-new.md'
check "13.2002 age: exactly 7 days is still KEEP:recent (older than 7 days moves, 7 days itself does not)" 'mk; fa BRIEF-edge.md $((7*DAY)); dry; keeps BRIEF-edge.md recent'
check "13.2002 age: a file dated in the future is kept" 'mk; fa BRIEF-future.md $((-2*DAY)); dry; keeps BRIEF-future.md recent'

# --- 13.2003: referenced files stay -------------------------------------------------------------------------------------------
check "13.2003 (a) named in a QUEUE file: KEEP:queue-ref — as a bare name, a full path and with no extension; CONTROL — an unnamed twin moves" 'mk; old BRIEF-q1.md; old BRIEF-q2.md; old BRIEF-q3.md; old BRIEF-free.md; printf "11:00 NEXT 3 BRIEF-q1.md\n11:01 NEXT 4 /abs/dir/BRIEF-q2.md\n11:02 FIX see BRIEF-q3 for the rest\n" >> "$root/roles/QUEUE-gate.md"; app; stayed BRIEF-q1.md && stayed BRIEF-q2.md && stayed BRIEF-q3.md && keeps BRIEF-q1.md queue-ref && keeps BRIEF-q2.md queue-ref && keeps BRIEF-q3.md queue-ref && moves BRIEF-free.md && moved BRIEF-free.md'
check "13.2003 (a) every roles/QUEUE-*.md counts, not only QUEUE-dispatch.md (the name sits in QUEUE-review.md only)" 'mk; old PTR-r.md; printf "09:00 REVIEW PTR-r.md\n" > "$root/roles/QUEUE-review.md"; dry; keeps PTR-r.md queue-ref'
check "13.2003 (b) named in roles/LANES.md: KEEP:lanes; CONTROL — the same file not named moves" 'mk; old BRIEF-l.md; old BRIEF-m.md; printf "| 2 | gisik:2 | BRIEF-l.md |\n" >> "$root/roles/LANES.md"; dry; keeps BRIEF-l.md lanes && moves BRIEF-m.md'
check "13.2003 (e) named in a lanes-root *.sh script: KEEP:script-ref; CONTROL — not named moves" 'mk; old dispatch-x.md; old MSG-s.md; old MSG-t.md; printf "cat MSG-s.md\n" > "$root/ctl-start.sh"; dry; keeps MSG-s.md script-ref && moves MSG-t.md'
check "13.2003 reference matching is by substring of the stem (the safe side): a mention of BRIEF-ab.md also keeps BRIEF-a.md, and an unrelated file still moves" 'mk; old BRIEF-a.md; old BRIEF-zzz.md; printf "BRIEF-ab.md\n" >> "$root/roles/QUEUE-gate.md"; dry; keeps BRIEF-a.md queue-ref && moves BRIEF-zzz.md'

# --- 13.2004: a live pointer keeps what it names (the second hop) ------------------------------------------------------------
check "13.2004 a file named only inside a kept (listed) PTR is KEEP:live-ptr; CONTROL — named only inside an unlisted old PTR (which itself moves) it moves too" 'mk; old PTR-open.md "work from BRIEF-deep.md"; old PTR-dead.md "work from BRIEF-other.md"; old BRIEF-deep.md; old BRIEF-other.md; printf "| 1 | gisik:1 | PTR-open.md |\n" >> "$root/roles/LANES.md"; app; keeps PTR-open.md lanes && keeps BRIEF-deep.md live-ptr && stayed BRIEF-deep.md && moves PTR-dead.md && moves BRIEF-other.md && moved BRIEF-other.md && moved PTR-dead.md'
check "13.2004 the hop runs to a fixed point (open PTR -> BRIEF -> HANDOFF -> MSG all stay) and a RECENT pointer keeps what it names" 'mk; fa PTR-new.md 3600 "see BRIEF-b1.md"; old BRIEF-b1.md "see HANDOFF-h1.md"; old HANDOFF-h1.md "see MSG-m1.md"; old MSG-m1.md "end"; old MSG-lone.md; dry; keeps BRIEF-b1.md live-ptr && keeps HANDOFF-h1.md live-ptr && keeps MSG-m1.md live-ptr && moves MSG-lone.md'
check "13.2004 only pointer families chain: a kept pr-/DISPATCH- file does not keep what it names" 'mk; fa pr-new.md 3600 "see BRIEF-p.md"; old BRIEF-p.md; dry; moves BRIEF-p.md'

# --- 13.2005: protected names and what is outside the families -----------------------------------------------------------------
check "13.2005 the cards and common rules never move: STEPS-common, *CARD*, ROLES*, BOOT* (also family-shaped: PTR-x-CARD.md) — KEEP:protected; CONTROL — the same shape without the word moves" 'mk; old STEPS-common-2026-10-03.md; old CARD-x.md; old ROLES-2026-10-01.md; old BOOT-x.md; old PTR-x-CARD.md; old PTR-x-BOOT.md; old PTR-plain.md; app; each kept_protected STEPS-common-2026-10-03.md CARD-x.md ROLES-2026-10-01.md BOOT-x.md PTR-x-CARD.md PTR-x-BOOT.md && moved PTR-plain.md'
check "13.2005 CTL-TO-PLANNER-notes.md is protected from the file sweep (it is rolled, not archived as a file)" 'mk; old CTL-TO-PLANNER-notes.md; dry; keeps CTL-TO-PLANNER-notes.md protected'
check "13.2005 outside the families nothing is touched: CTL-NOTE-*, lowercase dispatch-*/msg-*, exec-claude.sh, a .sh in a family name, REVIEW-*; CONTROL — a family name with an allowed extension moves" 'mk; old CTL-NOTE-x.md; old dispatch-x.md; old msg-x.md; old exec-claude.sh; old BRIEF-x.sh; old REVIEW-x.md; old PTR-ok.md; app; each outside_stays CTL-NOTE-x.md dispatch-x.md msg-x.md exec-claude.sh BRIEF-x.sh REVIEW-x.md && moved PTR-ok.md'
check "13.2005 a name that merely contains a family word later is not a candidate (my-BRIEF-x.md, xPTR-x.md stay unlisted)" 'mk; old my-BRIEF-x.md; old xPTR-x.md; old PTR-ok.md; dry; [ -z "$(verdict my-BRIEF-x.md)" ] && [ -z "$(verdict xPTR-x.md)" ] && moves PTR-ok.md'

# --- 13.2006: only the top level; subdirectories are never entered -------------------------------------------------------------
check "13.2006 old family-named files under roles/, archive/, smoothness-2026-10-02/ and audit-x/ are untouched by --apply; CONTROL — the same name at the top level moves" 'mk; for d in roles archive/2026-09-01 smoothness-2026-10-02 audit-2026-10-01 audit-ux-recheck-2026-10-02 sub/deeper; do mkdir -p "$root/$d"; printf "keep me\n" > "$root/$d/BRIEF-deep.md"; touch -t 202609010000 "$root/$d/BRIEF-deep.md"; done; old BRIEF-deep.md; app; moved BRIEF-deep.md && each dir_intact roles archive/2026-09-01 smoothness-2026-10-02 audit-2026-10-01 audit-ux-recheck-2026-10-02 sub/deeper'
check "13.2006 roles/ keeps every file it had (LANES.md and the queues included) and gains none" 'mk; old BRIEF-a.md; ( cd "$root/roles" && find . -type f | sort | xargs shasum ) > "$base/r0"; app; ( cd "$root/roles" && find . -type f | sort | xargs shasum ) > "$base/r1"; cmp -s "$base/r0" "$base/r1"'
check "13.2006 a top-level symlink is never moved (not even one that points at an old family-named file); CONTROL — the real file moves" 'mk; old BRIEF-real.md; ln -s BRIEF-real.md "$root/BRIEF-link.md"; ln -s /etc/hosts "$root/PTR-out.md"; app; moved BRIEF-real.md && [ -L "$root/BRIEF-link.md" ] && [ -L "$root/PTR-out.md" ] && [ ! -e "$root/archive/$TODAY/BRIEF-link.md" ]'
check "13.2006 a directory with a family-shaped name is not moved" 'mk; mkdir "$root/BRIEF-dir.md"; touch -t 202609010000 "$root/BRIEF-dir.md"; old BRIEF-f.md; app; [ -d "$root/BRIEF-dir.md" ] && moved BRIEF-f.md'

# --- 13.2007: never overwrite ----------------------------------------------------------------------------------------------------
check "13.2007 a same-day re-run never overwrites: a new file of an archived name is KEEP:collision, the archive copy keeps its first bytes, the new one stays; the re-run exits 0" 'mk; old BRIEF-a.md "first"; app; old BRIEF-a.md "second"; app; [ $rc -eq 0 ] && keeps BRIEF-a.md collision && [ "$(cat "$root/BRIEF-a.md")" = second ] && [ "$(cat "$root/archive/$TODAY/BRIEF-a.md")" = first ]'
check "13.2007 an immediate second --apply is a no-op that exits 0 (nothing left to move)" 'mk; old BRIEF-a.md; app; s0=$(snap); app; [ $rc -eq 0 ] && printf "%s\n" "$last" | grep -q "moved 0 files" && [ "$(snap)" = "$s0" ]'
check "13.2007 a destination that appears between the plan and the move (a race) is left alone: FAIL naming it, the source stays, the archive copy is intact" 'mk; old BRIEF-a.md "mine"; mkdir -p "$root/archive/$TODAY"; python3 - "$HERE/verbs/archive.py" "$root" "$NOW" <<PYEOF
import os, sys, runpy
src, root, now = sys.argv[1:4]
os.environ.update(CTL_LANES_DIR=root, CTL_ARCHIVE_NOW=now, CTL_ARCHIVE_INFLIGHT="")
real = os.link
def racing_link(a, b, *k, **kw):
    if os.path.basename(b) == "BRIEF-a.md":
        open(b, "w").write("racer\n")
    return real(a, b, *k, **kw)
os.link = racing_link
sys.argv = [src, "--apply"]
runpy.run_path(src, run_name="__main__")
PYEOF
[ $? -eq 1 ] && [ "$(cat "$root/BRIEF-a.md")" = mine ] && [ "$(cat "$root/archive/$TODAY/BRIEF-a.md")" = racer ]'

# --- 13.2008: fail closed ------------------------------------------------------------------------------------------------------------
check "13.2008 no roles/LANES.md: FAIL exit 1, nothing moved or rolled, in --apply and in the dry-run; CONTROL — with it back the same tree applies" 'mk; old BRIEF-a.md; seq 1 5 > "$root/CTL-TO-PLANNER-notes.md"; rm "$root/roles/LANES.md"; s0=$(snap); app; r1=$rc; l1="$last"; dry; [ $r1 -eq 1 ] && [ $rc -eq 1 ] && printf "%s\n" "$l1" | grep -q "^FAIL archive cannot read roles/LANES.md" && [ "$(snap)" = "$s0" ] && printf "x\n" > "$root/roles/LANES.md" && app && [ $rc -eq 0 ] && moved BRIEF-a.md'
check "13.2008 no roles/QUEUE-*.md at all: FAIL exit 1, nothing moved; CONTROL — one queue back, applies" 'mk; old BRIEF-a.md; rm "$root/roles"/QUEUE-*.md; s0=$(snap); app; [ $rc -eq 1 ] && [ "$(snap)" = "$s0" ] && printf "x\n" > "$root/roles/QUEUE-review.md" && app && [ $rc -eq 0 ] && moved BRIEF-a.md'
check "13.2008 a missing lanes directory fails closed" 'mk; CTL_LANES_DIR="$base/nope" dry; [ $rc -eq 1 ] && printf "%s\n" "$last" | grep -q "^FAIL archive no lanes directory"'

# --- 13.2009: the notes roll -----------------------------------------------------------------------------------------------------------
NOTES=CTL-TO-PLANNER-notes.md
check "13.2009 roll: the archive file is the ORIGINAL inode (a rename, not a truncate), byte-identical; the path holds a NEW inode" 'mk; seq 1 100 > "$root/$NOTES"; i0=$(stat -f %i "$root/$NOTES"); h0=$(shasum < "$root/$NOTES"); app; a="$root/archive/$TODAY/CTL-TO-PLANNER-notes.$TODAY.md"; [ $rc -eq 0 ] && [ "$(stat -f %i "$a")" = "$i0" ] && [ "$(stat -f %i "$root/$NOTES")" != "$i0" ] && [ "$(shasum < "$a")" = "$h0" ]'
check "13.2009 roll: the new file is a one-line \"rolled <ts>\" header plus EXACTLY the last 40 lines of the old one (41 lines)" 'mk; seq 1 100 > "$root/$NOTES"; app; n="$root/$NOTES"; [ "$(wc -l < "$n" | tr -d " ")" = 41 ] && sed -n 1p "$n" | grep -qE "^# rolled 2026-10-03T12:00:00[+-][0-9]{4} " && [ "$(sed -n 2p "$n")" = 61 ] && [ "$(tail -1 "$n")" = 100 ]'
check "13.2009 roll: a file shorter than 40 lines carries ALL of its lines; one with no trailing newline keeps its last line" 'mk; seq 1 7 > "$root/$NOTES"; app; [ "$(wc -l < "$root/$NOTES" | tr -d " ")" = 8 ] && [ "$(sed -n 2p "$root/$NOTES")" = 1 ]; mk; printf "a\nb\nc" > "$root/$NOTES"; app; [ "$(tail -1 "$root/$NOTES")" = c ] && [ "$(wc -l < "$root/$NOTES" | tr -d " ")" = 4 ]'
check "13.2009 roll: the file mode survives, no temp file is left in the lanes root, and the roll has an INDEX row" 'mk; seq 1 50 > "$root/$NOTES"; chmod 640 "$root/$NOTES"; app; [ "$(stat -f %Lp "$root/$NOTES")" = 640 ] && [ -z "$(ls -A "$root" | grep rolling)" ] && grep -q "^CTL-TO-PLANNER-notes.$TODAY.md" "$root/archive/$TODAY/INDEX.tsv"'
check "13.2009 roll: a writer that holds the OLD file open keeps appending to the archive copy (nothing it writes after the roll is lost), a writer that opens the path afterwards writes the new file" 'mk; seq 1 50 > "$root/$NOTES"; exec 7>>"$root/$NOTES"; app; echo late-from-open-fd >&7; exec 7>&-; echo after-roll >> "$root/$NOTES"; grep -q late-from-open-fd "$root/archive/$TODAY/CTL-TO-PLANNER-notes.$TODAY.md" && ! grep -q late-from-open-fd "$root/$NOTES" && tail -1 "$root/$NOTES" | grep -q after-roll'
check "13.2009 the dry-run does not roll: the notes file keeps its inode and bytes, and the line says how many lines it would roll" 'mk; seq 1 100 > "$root/$NOTES"; i0=$(stat -f %i "$root/$NOTES"); dry; [ "$(stat -f %i "$root/$NOTES")" = "$i0" ] && printf "%s\n" "$out" | grep -q "^notes: would roll 100 lines into archive/$TODAY/"'
check "13.2009 no notes file: the verb still succeeds and says so" 'mk; old BRIEF-a.md; app; [ $rc -eq 0 ] && printf "%s\n" "$out" | grep -q "^notes: no CTL-TO-PLANNER-notes.md"'

# --- 13.2010: a tail -F follower keeps following ------------------------------------------------------------------------------------
check "13.2010 a running \`tail -F\` on the notes path keeps following after the roll: a line appended afterwards reaches it" 'mk; seq 1 50 > "$root/$NOTES"; tail -F "$root/$NOTES" > "$base/follow.out" 2>&1 & tp=$!; sleep 2; app; sleep 3; echo follow-me-after-roll >> "$root/$NOTES"; sleep 3; kill $tp 2>/dev/null; wait $tp 2>/dev/null; grep -q follow-me-after-roll "$base/follow.out" && grep -q "rolled 2026-10-03" "$base/follow.out"'

# --- 13.2011: once a day ----------------------------------------------------------------------------------------------------------------
check "13.2011 a second roll on the same day refuses to roll: the notes file keeps its inode and the archive copy its bytes; the OK line is still printed" 'mk; seq 1 100 > "$root/$NOTES"; app; echo extra >> "$root/$NOTES"; i1=$(stat -f %i "$root/$NOTES"); a="$root/archive/$TODAY/CTL-TO-PLANNER-notes.$TODAY.md"; h1=$(shasum < "$a"); app; [ $rc -eq 0 ] && [ "$(stat -f %i "$root/$NOTES")" = "$i1" ] && [ "$(shasum < "$a")" = "$h1" ] && printf "%s\n" "$out" | grep -q "^notes: already rolled today"'
check "13.2011 CONTROL — the next day rolls again, into archive/<next day>/, keeping the first day untouched" 'mk; seq 1 100 > "$root/$NOTES"; app; a="$root/archive/$TODAY/CTL-TO-PLANNER-notes.$TODAY.md"; h1=$(shasum < "$a"); CTL_ARCHIVE_NOW=$((NOW + DAY)) app; nd=$(date -r $((NOW + DAY)) +%F); [ $rc -eq 0 ] && [ -f "$root/archive/$nd/CTL-TO-PLANNER-notes.$nd.md" ] && [ "$(shasum < "$a")" = "$h1" ] && [ "$(sed -n 1p "$root/archive/$nd/CTL-TO-PLANNER-notes.$nd.md" | cut -c1-8)" = "# rolled" ]'

# --- 13.2012: no roll, no move while a landing is in flight ---------------------------------------------------------------------
gate_marker() { printf '%s|%s|gate|%s\n' "$1" "$(LC_ALL=C TZ=UTC0 ps -o lstart= -p "$1" 2>/dev/null | sed "s/^ *//; s/  */ /g")" "$NOW" > "$base/sem/gate-$1"; }
check "13.2012 a LIVE ctl gate marker: --apply FAIL exit 1, nothing moved, the notes not rolled; CONTROL — a marker naming a DEAD pid does not block" 'mk; old BRIEF-a.md; seq 1 50 > "$root/$NOTES"; sleep 30 & sp=$!; gate_marker $sp; s0=$(snap); app; r1=$rc; l1="$last"; s1=$(snap); kill $sp; wait $sp 2>/dev/null; [ $r1 -eq 1 ] && printf "%s\n" "$l1" | grep -q "^FAIL archive a ctl gate is running" && [ "$s1" = "$s0" ] && app && [ $rc -eq 0 ] && moved BRIEF-a.md'
check "13.2012 a running land/gate/tipmerge verb in ps: --apply refuses; an unrelated ps line, or none, does not" 'mk; old BRIEF-a.md; printf "  4242 bash /x/scripts/ctl/verbs/land.sh 940 --base release/x\n" > "$base/ps.txt"; app; r1=$rc; l1="$last"; [ $r1 -eq 1 ] && printf "%s\n" "$l1" | grep -q "^FAIL archive a land/gate/tipmerge verb is running (pid 4242)" && stayed BRIEF-a.md && printf "  1 vim notes\n  2 bash /x/scripts/ctl/ctl archive --apply\n" > "$base/ps.txt" && app && [ $rc -eq 0 ] && moved BRIEF-a.md'
check "13.2012 each of the three verbs is recognised, via the verb script and via the ctl door" 'mk; old BRIEF-a.md; each in_flight_refuses "9 bash /v/verbs/land.sh 5" "9 bash /v/verbs/gate.sh abc" "9 bash /v/verbs/tipmerge.sh task/x" "9 bash /r/scripts/ctl/ctl land 5" "9 bash /r/scripts/ctl/ctl gate abc" "9 bash /r/scripts/ctl/ctl tipmerge task/x"'
check "13.2012 a REAL process whose command line is a land verb is seen through the real ps (no fake)" 'mk; old BRIEF-a.md; ( exec -a "bash /x/scripts/ctl/verbs/land.sh" sleep 30 ) & sp=$!; sleep 1; out=$(CTL_ARCHIVE_PS_CMD="ps -axo pid=,command=" "$V" archive --apply 2>&1); rc=$?; kill $sp 2>/dev/null; wait $sp 2>/dev/null; [ $rc -eq 1 ] && printf "%s\n" "$out" | tail -1 | grep -q "a land/gate/tipmerge verb is running" && stayed BRIEF-a.md'
check "13.2012 the dry-run reports the landing in flight and still exits 0, changing nothing" 'mk; old BRIEF-a.md; printf "  4242 bash /x/scripts/ctl/verbs/land.sh 940\n" > "$base/ps.txt"; s0=$(snap); dry; [ $rc -eq 0 ] && printf "%s\n" "$out" | grep -q "a landing is in flight" && [ "$(snap)" = "$s0" ]'

# --- 13.2013: arguments ---------------------------------------------------------------------------------------------------------------------
check "13.2013 an unknown argument refuses (exit 1) and changes nothing" 'mk; old BRIEF-a.md; s0=$(snap); out=$("$V" archive --apply --force 2>&1); rc=$?; [ $rc -eq 1 ] && printf "%s\n" "$out" | tail -1 | grep -q "^FAIL archive unknown arg --force" && [ "$(snap)" = "$s0" ]'

# --- 13.2014: wiring; the verb moves, it never deletes ------------------------------------------------------------------------------------
P="$HERE/verbs/archive.py"
check "13.2014 ctl help lists archive, with the dry-run default stated" '"$V" help | grep "^  archive " | grep -q "dry-run"'
SUITE_STEP='^step .*archive\.test\.sh'
check "13.2014 selftest.sh runs this suite as a live (uncommented) step; CONTROL — the pattern rejects a commented-out step" '/usr/bin/grep -Eq "$SUITE_STEP" "$HERE/verbs/selftest.sh" && ! printf "%s\n" "# step \"archive suite\" \"bash archive.test.sh\"" | /usr/bin/grep -Eq "$SUITE_STEP"'
check "13.2014 the verb deletes nothing: no rmtree, no os.remove, and its only unlinks are the temp file and a moved source (after os.link)" '! /usr/bin/grep -Eq "rmtree|os\.remove|shutil\.move|os\.rename\(" "$P" && [ "$(/usr/bin/grep -c "os\.unlink" "$P")" = 2 ] && /usr/bin/grep -q "os\.link(src, dst)" "$P" && ! /usr/bin/grep -Eq "(^|[^a-z_])rm( |$)" "$HERE/verbs/archive.sh"'
check "13.2014 ctl archive is a verb the dispatcher knows (not 'unknown verb')" 'mk; "$V" archive --dry-run 2>&1 | tail -1 | grep -q "^OK archive dry-run"'

[ "$fails" -eq 0 ] && echo "archive.test.sh: ok" || { echo "archive.test.sh: $fails FAILED"; exit 1; }
