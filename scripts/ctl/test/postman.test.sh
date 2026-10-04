#!/usr/bin/env bash
# scripts/ctl/test/postman.test.sh — the postman (ctl post / inbox / ack / postman), cases 13.1900–13.1991. Run by `ctl selftest`.
# Everything runs on a SCRATCH tmux session (ctlpm-<pid>), a scratch ledger root and a scratch notes file, with a fake
# clock (CTL_POSTMAN_NOW). It can never touch a live seat: the daemon refuses a scratch/live mismatch (13.1952).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CTL="$HERE/ctl"
. "$HERE/lib.sh"
fails=0
. "$HERE/test/harness.sh"   # check NAME CODE, and the CTL_TEST_ONLY case filter
T="$(cd "$(mktemp -d)" && pwd -P)"; R="$T/roles"; L="$T/logs"; N="$T/notes.md"; S="ctlpm-$$"
mkdir -p "$R" "$L"; : > "$N"
export CTL_POSTMAN_ROOT="$R" CTL_LOG_DIR="$L" CTL_POSTMAN_NOTES="$N" CTL_TMUX_SESSION="$S" CTL_PROOF_TRIES=4 CTL_POSTMAN_CMD_RE='^(bash|cat)$'
unset TMUX_PANE
NOW=1790000000
pm() { CTL_POSTMAN_NOW="$NOW" "$CTL" "$@"; }
tmux new-session -d -s "$S" -n anchor "sleep 900"
cleanup() { tmux kill-session -t "$S" 2>/dev/null; for f in "$L"/inbox-watch-*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null; done; rm -rf "$T"; }
trap cleanup EXIT
reset() { rm -rf "$R"/* "$L"/*; : > "$N"; NOW=1790000000; for w in $(tmux list-windows -t "$S" -F '#{window_name}' | grep -v '^anchor$'); do tmux kill-window -t "$S:=$w"; done; }
# a killed child of this shell stays a zombie until reaped, and `kill -0` still succeeds on a zombie: read the process state instead
proc_alive() { local st; st="$(ps -o stat= -p "$1" 2>/dev/null)"; [ -n "$st" ] && [ "${st#Z}" = "$st" ]; }
jget() { python3 -c 'import json,sys; [print(json.loads(l).get(sys.argv[2],"")) for l in open(sys.argv[3]) if json.loads(l)["id"]==int(sys.argv[1])]' "$1" "$2" "$R/LEDGER.jsonl"; }
ledger_n() { [ -f "$R/LEDGER.jsonl" ] && wc -l < "$R/LEDGER.jsonl" | tr -d ' ' || echo 0; }
count_kind() { python3 -c 'import json,sys; print(sum(1 for l in open(sys.argv[2]) if json.loads(l)["kind"]==sys.argv[1] and (len(sys.argv)<4 or json.loads(l)["to"]==sys.argv[3])))' "$1" "$R/LEDGER.jsonl" ${2:+"$2"} 2>/dev/null || echo 0; }
mkseat() { : > "$T/rec-$1"; tmux new-window -d -t "$S:${IDX:-}" -n "$1" "bash '$HERE/test/fakeseat.sh' $2 '$T/rec-$1' '${3:-}'"; sleep 0.7; }
rec_n() { local n; n="$(grep -c . "$T/rec-$1" 2>/dev/null)"; echo "${n:-0}"; }
rec_has() { grep -qF -- "$2" "$T/rec-$1"; }
status_of() { pm postman status 2>&1 | grep "^$1 " | head -1; }
hb() { python3 -c 'import os,sys; open(sys.argv[1],"a").close(); os.utime(sys.argv[1],(int(sys.argv[2]),int(sys.argv[2])))' "$L/inbox-watch-$1.hb" "$2"; }
body() { printf 'Do the brief.\n' > "$T/BRIEF-$1.md"; echo "$T/BRIEF-$1.md"; }
post() { pm post "$@" 2>&1; }
pm_noage() { CTL_POSTMAN_PAGE_AGE=999999 pm "$@"; }          # post <to> --kind K ... ; prints the summary line

# ───────────────────────────── ledger / post ─────────────────────────────
reset; b1="$(body a)"
out="$(post exec3 --kind fix --body "$b1" --from main)"
check "13.1900 post: one ledger line with exactly the schema fields; summary names the id" \
  '[ "$(ledger_n)" = 1 ] && python3 -c "
import json,sys
m=json.loads(open(sys.argv[1]).readline())
want={\"id\",\"ts\",\"from\",\"to\",\"kind\",\"body\",\"body_sha\",\"body_bytes\",\"reply_to\",\"src\",\"ref\"}
assert set(m)==want, set(m)^want
assert (m[\"id\"],m[\"from\"],m[\"to\"],m[\"kind\"],m[\"body\"])==(1,\"main\",\"exec3\",\"fix\",sys.argv[2]) and len(m[\"body_sha\"])==64 and m[\"body_bytes\"]==14
" "$R/LEDGER.jsonl" "$b1" && printf "%s" "$out" | tail -1 | grep -q "^OK post #1 .*exec3 (fix)"'
reset; for i in $(seq 1 20); do ( pm post exec2 --kind note --text "n$i" --from main >/dev/null 2>&1 ) & done; wait
check "13.1901 post: 20 parallel posts → ids 1..20 unique, every line valid JSON" \
  '[ "$(ledger_n)" = 20 ] && [ "$(python3 -c "import json,sys; print(sorted(json.loads(l)[\"id\"] for l in open(sys.argv[1])) == list(range(1,21)))" "$R/LEDGER.jsonl")" = True ]'
reset; pm post exec2 --kind next --text "go on" --from main >/dev/null 2>&1
check "13.1902 post --text: the body is a spooled file holding the text" \
  '[ "$(jget 1 body)" = "$R/postman/spool/1.txt" ] && [ "$(cat "$R/postman/spool/1.txt")" = "go on" ]'
reset
check "13.1903 post: a missing --body file, no body and both body forms are refused, nothing appended; CONTROL: a valid post is accepted" \
  'pm post exec2 --kind fix --body "$b1" --from main >/dev/null 2>&1 && rm -rf "$R"/* && { pm post exec2 --kind fix --body "$T/nope.md" --from main >/dev/null 2>&1; [ $? = 1 ]; } && { pm post exec2 --kind fix --from main >/dev/null 2>&1; [ $? = 1 ]; } && { pm post exec2 --kind fix --body "$b1" --text x --from main >/dev/null 2>&1; [ $? = 1 ]; } && [ "$(ledger_n)" = 0 ]'
check "13.1904 post: a bad seat name, a bad kind and a missing --from are refused; CONTROL: a valid post is accepted" \
  'pm post exec3 --kind fix --body "$b1" --from main >/dev/null 2>&1 && rm -rf "$R"/* && { pm post "exec 3;rm" --kind fix --body "$b1" --from main >/dev/null 2>&1; [ $? = 1 ]; } && { pm post exec3 --kind shout --body "$b1" --from main >/dev/null 2>&1; [ $? = 1 ]; } && { pm post exec3 --kind fix --body "$b1" >/dev/null 2>&1; [ $? = 1 ]; } && [ "$(ledger_n)" = 0 ]'
reset; mkseat exec4 idle
check "13.1905 post: a bare window number resolves to the window NAME; orch aliases main" \
  'idx=$(tmux list-windows -t "$S" -F "#{window_index} #{window_name}" | awk "\$2==\"exec4\"{print \$1}"); pm post "$idx" --kind note --text hi --from main >/dev/null 2>&1; pm post orch --kind note --text hi --from exec4 >/dev/null 2>&1; [ "$(jget 1 to)" = exec4 ] && [ "$(jget 2 to)" = main ]'
reset; pm post exec3 --kind question --text "which?" --from exec3 >/dev/null 2>&1; pm post exec3 --kind note --text "answer" --from main >/dev/null 2>&1
pm post main --kind note --text "reply" --from exec3 --reply-to 2 >/dev/null 2>&1
check "13.1906 post --reply-to: replying acks the replied-to id for the poster" '[ -f "$R/postman/acks/2" ] && grep -q exec3 "$R/postman/acks/2"'
reset; out="$(pm post exec3 --kind fix --text x --from main --dry-run 2>&1)"
check "13.1907 post --dry-run: appends nothing, prints a DRY line" '[ "$(ledger_n)" = 0 ] && printf "%s" "$out" | grep -q "^DRY" && printf "%s" "$out" | tail -1 | grep -q "^OK post"'

# ───────────────────────────── ack / inbox ─────────────────────────────
reset; pm post exec3 --kind fix --text "a" --from main >/dev/null 2>&1
pm ack 1 --seat exec3 >/dev/null 2>&1; first="$(cat "$R/postman/acks/1")"; out2="$(pm ack 1 --seat exec3 2>&1)"; rc2=$?
check "13.1910 ack: a second ack is OK 'already acked', exit 0, the ack file is untouched" \
  '[ "$rc2" = 0 ] && printf "%s" "$out2" | tail -1 | grep -q "already acked" && [ "$(cat "$R/postman/acks/1")" = "$first" ] && [ "$(ls "$R/postman/acks" | wc -l | tr -d " ")" = 1 ]'
reset; pm post exec3 --kind fix --text "a" --from main >/dev/null 2>&1
check "13.1911 ack: the wrong seat is refused (exit 1, no ack file); the addressee succeeds" \
  '! pm ack 1 --seat exec4 >/dev/null 2>&1 && [ ! -e "$R/postman/acks/1" ] && pm ack 1 --seat exec3 >/dev/null 2>&1 && [ -e "$R/postman/acks/1" ]'
check "13.1912 ack: an unknown id exits 1" '! pm ack 99 --seat exec3 >/dev/null 2>&1'
reset; pm post exec3 --kind fix --text "a" --from main >/dev/null 2>&1
pm ack 1 --seat main --cancel --note "no longer wanted" >/dev/null 2>&1
check "13.1913 ack --cancel: any seat can close a message; the ack records cancelled and the note" 'grep -q "cancelled" "$R/postman/acks/1" && grep -q "no longer wanted" "$R/postman/acks/1"'
reset; pm post exec3 --kind fix --text "one" --from main >/dev/null 2>&1; pm post exec3 --kind fix --text "two" --from main >/dev/null 2>&1; pm post exec4 --kind fix --text "other" --from main >/dev/null 2>&1
pm ack 1 --seat exec3 >/dev/null 2>&1
check "13.1914 inbox: lists only MY unacked messages, oldest first; --all adds acked" \
  'o="$(pm inbox --seat exec3 2>&1)"; printf "%s" "$o" | grep -q "#2 " && ! printf "%s" "$o" | grep -q "#1 " && ! printf "%s" "$o" | grep -q "#3 " && pm inbox --seat exec3 --all 2>&1 | grep -q "#1 "'

# ───────────────────────────── the inbox watcher ─────────────────────────────
watch_once() { CTL_WATCH_ONCE=1 pm inbox --watch --seat "$1" 2>/dev/null; }
reset; pm post exec3 --kind fix --text "w1" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1
CTL_TEST_DIE_AFTER_READ=1 watch_once exec3 >/dev/null; first="$(watch_once exec3)"
check "13.1920 watch: a kill between reading and emitting loses nothing — the line is replayed, the cursor moves only after the emit" \
  'printf "%s" "$first" | grep -q "^\[postman #1 fix" && [ -z "$(watch_once exec3)" ]'
reset; pm post exec3 --kind fix --text "w1" --from main >/dev/null 2>&1; pm post exec3 --kind note --text "w2" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1
pm ack 1 --seat exec3 >/dev/null 2>&1; rm -f "$L"/cursor-exec3-inbox
check "13.1921 watch: a MISSING cursor starts at 0 and prints only the still-unacked ids" \
  'o="$(watch_once exec3)"; printf "%s" "$o" | grep -q "#2 " && ! printf "%s" "$o" | grep -q "#1 "'
reset; sleep 300 & old=$!; echo $old > "$L/inbox-watch-exec3.pid"
( exec -a "ctl inbox --watch --seat exec3" sleep 300 ) & old=$!; echo $old > "$L/inbox-watch-exec3.pid"; sleep 0.3
CTL_WATCH_ONCE=1 pm inbox --watch --seat exec3 >/dev/null 2>&1
check "13.1922 watch: starting a second watcher for the seat stops the old one by its exact pid and takes over" \
  '! proc_alive $old && { [ "$(cat "$L/inbox-watch-exec3.pid" 2>/dev/null)" != "$old" ] || [ ! -s "$L/inbox-watch-exec3.pid" ]; }; r=$?; kill $old 2>/dev/null; [ $r = 0 ]'
reset; sleep 300 & unrelated=$!; echo $unrelated > "$L/inbox-watch-exec3.pid"
CTL_WATCH_ONCE=1 pm inbox --watch --seat exec3 >/dev/null 2>&1
check "13.1979 watch: a pidfile whose pid is NOT a watcher for that seat is never signalled" 'proc_alive $unrelated; r=$?; kill $unrelated 2>/dev/null; [ $r = 0 ]'
reset; pm post exec3 --kind fix --text "w1" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1; watch_once exec3 >/dev/null
: > "$R/postman/inbox/exec3.jsonl"; pm post exec3 --kind note --text "w2" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1
check "13.1923 watch: a file that shrinks below the cursor restarts at 0 (acked ids skipped, new ones shown)" 'watch_once exec3 | grep -q "#2 "'
reset; rm -f "$L/inbox-watch-exec3.hb"; watch_once exec3 >/dev/null
check "13.1924 watch: the heartbeat file is touched on every poll" '[ -f "$L/inbox-watch-exec3.hb" ] && [ $(( $(date +%s) - $(stat -f %m "$L/inbox-watch-exec3.hb") )) -lt 10 ]'

# ───────────────────────────── the QUEUE-dispatch bridge ─────────────────────────────
bridge_reset() { reset; mkdir -p "$T/lanes"; Q="$R/QUEUE-dispatch.md"; : > "$Q"; for n in 1 2 3 4 5; do IDX=$n mkseat exec$n idle; done; IDX=6 mkseat reviewerA idle; echo "$T/BRIEF-b.md" > /dev/null; printf 'branch task/foo-bar\n' > "$T/BRIEF-b.md"; }
bridge_reset; echo "05:55 FIX 4 $T/BRIEF-old.md (history, never reposted)" >> "$Q"; pm postman once >/dev/null 2>&1
check "13.1931 bridge: the first run starts at EOF — history is never reposted" '[ "$(ledger_n)" = 0 ] && [ -f "$R/postman/cursor-queue-dispatch" ]'
printf '06:01 FIX 4 %s (task/foo-bar abcdef12; reviewer B)\n06:02 NEXT 2 %s\n06:03 MERGETIP 5 task/foo-bar base=release/smoothness\n06:04 FIX lane3 %s\n' "$T/BRIEF-b.md" "$T/BRIEF-b.md" "$T/BRIEF-b.md" >> "$Q"; pm postman once >/dev/null 2>&1
check "13.1930 bridge: FIX/NEXT/MERGETIP lines become messages to the right exec seat (laneN accepted); ref from the line or the brief" \
  '[ "$(count_kind fix exec4)" = 1 ] && [ "$(count_kind next exec2)" = 1 ] && [ "$(count_kind mergetip exec5)" = 1 ] && [ "$(count_kind fix exec3)" = 1 ] && [ "$(jget 1 body)" = "$T/BRIEF-b.md" ] && [ "$(jget 1 ref)" = task/foo-bar ] && [ "$(jget 4 ref)" = task/foo-bar ] && grep -q "branch task/foo-bar, base release/smoothness" "$(jget 3 body)"'
before="$(ledger_n)"; pm postman once >/dev/null 2>&1; echo 0 > "$R/postman/cursor-queue-dispatch"; echo "06:09 NOTE x" >> "$Q"; pm postman once >/dev/null 2>&1
check "13.1932 bridge: the same line seen twice (a reset cursor) makes ONE message (src dedupe)" '[ "$(count_kind fix exec4)" = 1 ] && [ "$(count_kind next exec2)" = 1 ]'
bridge_reset; pm postman once >/dev/null 2>&1
printf '06:11 FIX 4 %s/missing-brief.md\n06:12 FIX 7 %s\n06:13 FIX orchestrator %s\n06:14 NEXT task/x %s\n06:15 MERGETIP 4 task/foo base=main\n06:16 FIX 6 %s\n' "$T" "$T/BRIEF-b.md" "$T/BRIEF-b.md" "$T/BRIEF-b.md" "$T/BRIEF-b.md" >> "$Q"; pm postman once >/dev/null 2>&1
check "13.1933 bridge: an unparsable line is never dropped — one note to main quoting it each (incl. FIX 6 = a reviewerA window), nothing sent to a lane" \
  '[ "$(count_kind note main)" = 6 ] && [ "$(count_kind fix)" = 0 ] && [ "$(count_kind mergetip)" = 0 ]'
# 13.1934 gets its OWN setup: window 3 is reviewerA (inside 1–5, so only the exec* rule can refuse it), 2 is exec2
reset; mkdir -p "$T/lanes"; Q="$R/QUEUE-dispatch.md"; : > "$Q"; for n in 1 2 4 5; do IDX=$n mkseat exec$n idle; done; IDX=3 mkseat reviewerA idle; pm postman once >/dev/null 2>&1
printf '06:40 FIX 3 %s\n06:41 FIX orchestrator %s\n06:42 FIX planner %s\n06:43 FIX 2 %s\n' "$T/BRIEF-b.md" "$T/BRIEF-b.md" "$T/BRIEF-b.md" "$T/BRIEF-b.md" >> "$Q"; pm postman once >/dev/null 2>&1
check "13.1934 bridge: a number INSIDE 1–5 whose window is not exec* (3 = reviewerA here) and orchestrator/planner targets are refused, never routed; CONTROL in the same check: FIX 2 reaches exec2" \
  '[ "$(count_kind fix reviewerA)" = 0 ] && [ "$(count_kind fix main)" = 0 ] && [ "$(count_kind fix planner)" = 0 ] && [ "$(count_kind fix exec2)" = 1 ] && [ "$(count_kind fix)" = 1 ] && python3 -c "
import json,sys
t=[json.loads(l) for l in open(sys.argv[1])]
n=[open(m[\"body\"]).read() for m in t if m[\"kind\"]==\"note\"]
assert any(\"FIX 3\" in x and \"reviewerA\" in x for x in n) and any(\"orchestrator\" in x for x in n) and any(\"FIX planner\" in x for x in n) and len(n)==3, n" "$R/LEDGER.jsonl"'
bridge_reset; pm postman once >/dev/null 2>&1
printf '06:20 TOOK 06:19 x\n06:21 DONE 06:19 y\n06:22 NOTE z\n06:23 HOLD q\n06:24 CLOSE 5\n' >> "$Q"; pm postman once >/dev/null 2>&1
check "13.1935 bridge: TOOK/DONE/NOTE/HOLD are ignored by name; CLOSE sends no lane message, only a note to main" '[ "$(ledger_n)" = 1 ] && [ "$(count_kind note main)" = 1 ] && jget 1 body | xargs grep -q "ctl close 5"'
bridge_reset; pm postman once >/dev/null 2>&1; printf '06:30 FIX 2 %s\n' "$T/BRIEF-b.md" >> "$Q"; pm postman once >/dev/null 2>&1
check "13.1936 bridge: a handled line gets a DONE line written back into QUEUE-dispatch.md naming the message" 'grep -qE "^[0-9]{2}:[0-9]{2} DONE 06:30 postman #1" "$Q"'
shadow_case() { # PANE → a bridged FIX 2 and a refused FIX 7 handled in one pass with CTL_POSTMAN_PANE=PANE
  bridge_reset; CTL_POSTMAN_PANE="$1" pm postman once >/dev/null 2>&1
  printf '06:40 FIX 2 %s\n06:41 FIX 7 %s\n' "$T/BRIEF-b.md" "$T/BRIEF-b.md" >> "$Q"; CTL_POSTMAN_PANE="$1" pm postman once >/dev/null 2>&1; }
check "13.1981 shadow run (CTL_POSTMAN_PANE=0): the bridge posts the message but writes NO DONE line into QUEUE-dispatch.md — the dispatcher's open line stays open; CONTROL in the same check: pane tier on → a DONE line for the handled AND for the refused line" \
  'shadow_case 0 && [ "$(count_kind fix exec2)" = 1 ] && [ "$(count_kind note main)" = 1 ] && ! grep -q " DONE " "$Q" && shadow_case 1 && [ "$(grep -cE "^[0-9]{2}:[0-9]{2} DONE 06:4[01] postman" "$Q")" = 2 ] && grep -q "DONE 06:41 postman refused" "$Q"'

# ───────────────────────────── delivery state machine ─────────────────────────────
reset; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1
check "13.1940 deliver: the message reaches the inbox file first (one line) and the state records the time; no window → nothing else" \
  '[ "$(wc -l < "$R/postman/inbox/exec3.jsonl" | tr -d " ")" = 1 ] && grep -q "\"id\": *1" "$R/postman/inbox/exec3.jsonl" && [ "$(status_of exec3 | grep -c "no-window")" = 1 ]'
reset; mkseat exec3 idle; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; hb exec3 "$NOW"; pm postman once >/dev/null 2>&1
check "13.1941 watched + idle: no pane paste inside the 120 s grace" '[ "$(rec_n exec3)" = 0 ]'
NOW=$((NOW+130)); hb exec3 "$NOW"; pm postman once >/dev/null 2>&1
check "13.1970 watched + idle: after 120 s without an ack the pane pointer is pasted ONCE" '[ "$(rec_n exec3)" = 1 ] && rec_has exec3 "[postman #1 fix"'
reset; mkseat exec3 busy; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; hb exec3 "$NOW"; NOW=$((NOW+130)); hb exec3 "$NOW"; pm postman once >/dev/null 2>&1
check "13.1942 watched + BUSY: no pane paste at all (the Monitor line is already queued in the session)" '[ "$(rec_n exec3)" = 0 ]'
reset; mkseat exec3 idle; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1
check "13.1943 unwatched seat (every lane): the pane pointer goes at once, one line, carrying the id and the ack command" \
  '[ "$(rec_n exec3)" = 1 ] && rec_has exec3 "[postman #1 fix ← main]" && rec_has exec3 "ctl ack 1" && [ "$(wc -c < "$T/rec-exec3")" -lt 450 ]'
sleep 4; NOW=$((NOW+60)); pm postman once >/dev/null 2>&1; NOW=$((NOW+400)); pm postman once >/dev/null 2>&1
check "13.1944 a PROVEN delivery is not re-pasted before 15 min (the seat has it, it is busy)" '[ "$(rec_n exec3)" = 1 ]'
NOW=$((NOW+600)); pm postman once >/dev/null 2>&1; sleep 4
check "13.1971 …and is re-pointed after 15 min of silence" '[ "$(rec_n exec3)" = 2 ]'
reset; mkseat exec3 idle; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1; pm ack 1 --seat exec3 >/dev/null 2>&1; NOW=$((NOW+3000)); pm postman once >/dev/null 2>&1
check "13.1945 ack stops redelivery: nothing more is pasted after the ack, however late" '[ "$(rec_n exec3)" = 1 ] && ! status_of exec3 | grep -q "head=#1"'
reset; mkseat exec3 idle; pm post exec3 --kind next --text "first" --from main >/dev/null 2>&1; pm post exec3 --kind fix --text "second" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1
check "13.1946 one open message per seat, in id order: the second waits; its inbox line appears only after the first is acked" \
  '[ "$(wc -l < "$R/postman/inbox/exec3.jsonl" | tr -d " ")" = 1 ] && rec_has exec3 "#1 next" && ! rec_has exec3 "#2" && { pm ack 1 --seat exec3 >/dev/null 2>&1; sleep 3; NOW=$((NOW+5)); pm postman once >/dev/null 2>&1; [ "$(wc -l < "$R/postman/inbox/exec3.jsonl" | tr -d " ")" = 2 ] && rec_has exec3 "#2 fix"; }'
reset; mkseat exec3 mute; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; pm_noage postman once >/dev/null 2>&1
for dt in 200 620 1220; do NOW=$((NOW+dt)); pm_noage postman once >/dev/null 2>&1; done
check "13.1947 backoff ladder: an unproven seat is re-pointed at +3, +10, +20 min and paged (once) after the 4th try" \
  '[ "$(rec_n exec3)" = 4 ] && [ "$(count_kind page main)" = 1 ] && jget 2 body | xargs grep -q "#1"'
NOW=$((NOW+1300)); pm_noage postman once >/dev/null 2>&1
check "13.1972 …the page is not repeated while the message stays open" '[ "$(rec_n exec3)" = 5 ] && [ "$(count_kind page main)" = 1 ]'
reset; mkseat main mute; pm post main --kind fix --text "go" --from exec3 >/dev/null 2>&1; pm_noage postman once >/dev/null 2>&1
for dt in 200 620 1220; do NOW=$((NOW+dt)); pm_noage postman once >/dev/null 2>&1; done
check "13.1948 page chain: an unreachable main pages the planner (inbox) AND appends a ⚑ line to the notes file" \
  '[ "$(count_kind page planner)" = 1 ] && grep -q "⚑ POSTMAN" "$N" && grep -q "#1" "$N"'
reset; mkseat exec3 idle; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1; sleep 4
NOW=$((NOW+1000)); pm postman once >/dev/null 2>&1; sleep 4; p1="$(count_kind page main)"; NOW=$((NOW+1000)); pm postman once >/dev/null 2>&1
check "13.1980 page by AGE: a seat that has the pointer (proven) but never acks is not paged at 17 min and is paged once at 33 min" '[ "$p1" = 0 ] && [ "$(count_kind page main)" = 1 ]'
reset; mkseat planner idle; pm post planner --kind question --text "which way?" --from exec3 >/dev/null 2>&1; pm postman once >/dev/null 2>&1
NOW=$((NOW+400)); pm postman once >/dev/null 2>&1
check "13.1954 planner seat: never a pane paste (inbox only); unacked 30 min → exactly one ⚑ notes line" \
  '[ "$(rec_n planner)" = 0 ] && ! grep -q "⚑ POSTMAN" "$N" && { NOW=$((NOW+1500)); pm postman once >/dev/null 2>&1; NOW=$((NOW+600)); pm postman once >/dev/null 2>&1; [ "$(grep -c "⚑ POSTMAN" "$N")" = 1 ] && [ "$(rec_n planner)" = 0 ]; }'
reset; f="$T/gone.md"; echo x > "$f"; pm post exec3 --kind fix --body "$f" --from reviewerA >/dev/null 2>&1; rm -f "$f"; pm postman once >/dev/null 2>&1
check "13.1949 lost body: bounced — a bounce message goes back to the sender, nothing is delivered" \
  '[ "$(count_kind bounce reviewerA)" = 1 ] && [ ! -s "$R/postman/inbox/exec3.jsonl" ] && ! status_of exec3 | grep -q "head=#1"'
reset; mkseat exec3 idle; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1
CTL_TEST_CRASH_AFTER_ATTEMPT=1 pm postman once >/dev/null 2>&1; rc=$?
check "13.1950 crash between writing the attempt and the paste: nothing typed, ledger intact" '[ "$rc" != 0 ] && [ "$(rec_n exec3)" = 0 ] && [ "$(ledger_n)" = 1 ]'
NOW=$((NOW+200)); pm postman once >/dev/null 2>&1
check "13.1973 …the attempt repeats after the backoff (at-least-once) with the SAME id, once" '[ "$(rec_n exec3)" = 1 ] && rec_has exec3 "[postman #1 fix"'
reset; sleep 60 & live=$!; mkdir -p "$R/postman"; echo $live > "$R/postman/daemon.pid"
out="$(CTL_POSTMAN_MAX_PASSES=1 pm postman run 2>&1)"; rc=$?; kill $live 2>/dev/null
check "13.1951 a second daemon is refused while the first pid is alive" '[ "$rc" = 1 ] && printf "%s" "$out" | tail -1 | grep -q "^FAIL postman.*already running"'
echo 999999 > "$R/postman/daemon.pid"; out="$(CTL_POSTMAN_MAX_PASSES=1 pm postman run 2>&1)"; rc=$?
check "13.1974 …but a stale pidfile (dead pid) is taken over" '[ "$rc" = 0 ] && printf "%s" "$out" | tail -1 | grep -q "^OK postman"'
reset; # BOTH halves run --dry-run: guard() runs before the dry-run exit, so the refusal is still proven, and a mutant that removes the guard only prints DRY (it never runs a pass on the live root or the live session)
out1="$(CTL_TMUX_SESSION=gisik pm postman once --dry-run 2>&1)"; rc1=$?; out2="$(env -u CTL_POSTMAN_ROOT CTL_POSTMAN_NOW=$NOW "$CTL" postman once --dry-run 2>&1)"; rc2=$?
check "13.1952 live/scratch guard: the live session with a scratch root, and a scratch session with the live root, are both refused before anything runs" \
  '[ "$rc1" = 1 ] && printf "%s" "$out1" | tail -1 | grep -q "refus" && [ "$rc2" = 1 ] && printf "%s" "$out2" | tail -1 | grep -q "refus"'
reset; mkseat exec3 idle; pm post exec3 --kind fix --text "old" --from main >/dev/null 2>&1; NOW=$((NOW+10)); pm postman restarted exec3 >/dev/null 2>&1; NOW=$((NOW+10)); pm post exec3 --kind next --text "fresh" --from main >/dev/null 2>&1; NOW=$((NOW+10)); pm postman once >/dev/null 2>&1
check "13.1953 restart supersedes: a message posted BEFORE the restart is cancelled-by-restart with ONE note to main listing its id; one posted AFTER is kept" \
  'grep -q "cancelled-by-restart" "$R/postman/acks/1" && [ ! -e "$R/postman/acks/2" ] && [ "$(count_kind note main)" = 1 ] && jget 3 body | xargs grep -q "#1"'

# ───────────────────────────── audit (mechanism g) ─────────────────────────────
reset; QR="$R/QUEUE-review.md"; : > "$QR"; pm postman once >/dev/null 2>&1
printf '05:53 DONE 05:45 FIX task/foo-bar c28ca5cf (F1) reviewer A\n05:54 DONE 05:50 needs-tip task/baz 1a0753d6 (tip) reviewer A\n05:55 DONE 05:51 READY task/ok 11111111 reviewer A\n' >> "$QR"
pm postman once >/dev/null 2>&1; NOW=$((NOW+300)); pm postman once >/dev/null 2>&1
check "13.1955 audit: inside the grace nothing is reported (the FIX may still be coming)" '[ "$(count_kind note main)" = 0 ]'
NOW=$((NOW+400)); pm postman once >/dev/null 2>&1
check "13.1975 audit: after the grace an undelivered FIX and an undelivered needs-tip each get ONE note to main; READY lines are not audited" \
  '[ "$(count_kind note main)" = 2 ] && python3 -c "
import json,sys
b=[open(json.loads(l)[\"body\"]).read() for l in open(sys.argv[1]) if json.loads(l)[\"kind\"]==\"note\"]
assert any(\"task/foo-bar\" in x for x in b) and any(\"task/baz\" in x for x in b) and not any(\"task/ok\" in x for x in b)" "$R/LEDGER.jsonl"'
NOW=$((NOW+400)); pm postman once >/dev/null 2>&1
check "13.1976 audit: not reported twice" '[ "$(count_kind note main)" = 2 ]'
reset; QR="$R/QUEUE-review.md"; : > "$QR"; pm postman once >/dev/null 2>&1
printf '05:53 DONE 05:45 FIX task/foo-bar c28ca5cf (F1) reviewer A\n' >> "$QR"; pm postman once >/dev/null 2>&1
printf 'x\n' > "$T/BRIEF-f.md"; pm post exec3 --kind fix --body "$T/BRIEF-f.md" --ref task/foo-bar --from reviewerA >/dev/null 2>&1; NOW=$((NOW+900)); pm postman once >/dev/null 2>&1
check "13.1977 audit: a delivered FIX (a fix message with that ref) satisfies it — no note" '[ "$(count_kind note main)" = 0 ]'
check "13.1978 ctl postman audit (on demand) exits 1 and names the unmatched line; CONTROL: exit 0 once a fix message with that ref exists, and on an empty queue" \
  'reset; QR="$R/QUEUE-review.md"; printf "05:53 DONE 05:45 FIX task/lost c28ca5cf (F1) reviewer A\n" > "$QR"; o="$(pm postman audit 2>&1)"; rc=$?; [ $rc = 1 ] && printf "%s" "$o" | grep -q "task/lost" && { printf x > "$T/BRIEF-l.md"; pm post exec3 --kind fix --body "$T/BRIEF-l.md" --ref task/lost --from reviewerA >/dev/null 2>&1; pm postman audit >/dev/null 2>&1; } && { : > "$QR"; pm postman audit >/dev/null 2>&1; }'
audit_round() { # SECOND → FIX 1's message at T0; the FIX 2 verdict is first seen 35 min later; SECOND=1 also posts FIX 2's message; two passes after the grace
  reset; QR="$R/QUEUE-review.md"; : > "$QR"; pm postman once >/dev/null 2>&1
  printf 'x\n' > "$T/BRIEF-r.md"; pm post exec3 --kind fix --body "$T/BRIEF-r.md" --ref task/foo-bar --from reviewerA >/dev/null 2>&1
  NOW=$((NOW+2100)); printf '05:53 DONE 05:45 FIX task/foo-bar c28ca5cf (FIX 2) reviewer A\n' >> "$QR"; pm postman once >/dev/null 2>&1
  [ "$1" = 1 ] && { NOW=$((NOW+60)); pm post exec3 --kind fix --body "$T/BRIEF-r.md" --ref task/foo-bar --from reviewerA >/dev/null 2>&1; }
  NOW=$((NOW+700)); pm postman once >/dev/null 2>&1; NOW=$((NOW+400)); pm postman once >/dev/null 2>&1; }
check "13.1982 audit matches THIS verdict: FIX 1's message 35 min before a FIX 2 verdict does not satisfy it — exactly ONE note after the grace; CONTROL in the same check: a FIX 2 message posted after the verdict → no note" \
  'audit_round 0; [ "$(count_kind note main)" = 1 ] && grep -q "(FIX 2)" $(grep -l "audit:" "$R"/postman/spool/*.txt) && audit_round 1 && [ "$(count_kind note main)" = 0 ]'
od_round() { # MODE 0 = FIX 1 message only; 1 = + a FIX 2 message after the verdict; 2 = a FIX 1 verdict and a FIX 2 verdict, only a message after the FIX 2 verdict
  reset; QR="$R/QUEUE-review.md"; T0=$NOW; printf 'x\n' > "$T/BRIEF-r.md"
  vline() { local t; t="$(date -r $((T0+$1)) +%H:%M)"; printf '%s DONE %s FIX task/foo-bar c28ca5cf (FIX %s) reviewer A\n' "$t" "$t" "$2"; }
  if [ "$1" = 2 ]; then { vline 60 1; vline 2100 2; } > "$QR"; else
    pm post exec3 --kind fix --body "$T/BRIEF-r.md" --ref task/foo-bar --from reviewerA >/dev/null 2>&1; vline 2100 2 > "$QR"; fi
  NOW=$((T0+2160)); if [ "$1" != 0 ]; then pm post exec3 --kind fix --body "$T/BRIEF-r.md" --ref task/foo-bar --from reviewerA >/dev/null 2>&1; fi
  pm postman audit 2>&1; }
check "13.1983 ctl postman audit (on demand) applies the same window: FIX 1's message does not satisfy a FIX 2 verdict 35 min later (exit 1, names it); a FIX 2 message after it does (exit 0); with a FIX 1 and a FIX 2 verdict and only FIX 2's message, exactly the FIX 1 verdict is named" \
  '{ o="$(od_round 0)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "UNMATCHED.*(FIX 2)" && od_round 1 >/dev/null && { o="$(od_round 2)"; [ $? = 1 ]; } && [ "$(printf "%s" "$o" | grep -c "^UNMATCHED")" = 1 ] && printf "%s" "$o" | grep "^UNMATCHED" | grep -q "(FIX 1)"'

od2_round() { # F11: FIX verdicts for task/a (+60 s) then task/b (+600 s); MODE 1 posts task/a's message AFTER the task/b line, 0 posts none
  reset; QR="$R/QUEUE-review.md"; T0=$NOW; printf 'x\n' > "$T/BRIEF-r.md"
  vl() { local t; t="$(date -r $((T0+$1)) +%H:%M)"; printf '%s DONE %s FIX %s c28ca5cf (FIX 1) reviewer A\n' "$t" "$t" "$2"; }
  { vl 60 task/a; vl 600 task/b; } > "$QR"
  NOW=$((T0+900)); if [ "$1" = 1 ]; then pm post exec3 --kind fix --body "$T/BRIEF-r.md" --ref task/a --from reviewerA >/dev/null 2>&1; fi
  NOW=$((T0+960)); pm postman audit 2>&1; }
check "13.1988 ctl postman audit (on demand): a verdict's window ends at the next verdict of the SAME branch, not of any branch — task/a's message posted after task/b's verdict still satisfies task/a; CONTROL in the same check: with no task/a message task/a IS named" \
  '{ o="$(od2_round 1)"; [ $? = 1 ]; } && ! printf "%s" "$o" | grep -q "UNMATCHED.*task/a" && printf "%s" "$o" | grep -q "UNMATCHED.*task/b" && { o="$(od2_round 0)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "UNMATCHED.*task/a"'
epoch_of() { python3 -c "import sys,time,datetime; print(int(time.mktime(datetime.datetime(*map(int,sys.argv[1:6])).timetuple())))" "$@"; }
mid_round() { # F12: a 23:50 FIX verdict and a 00:10 line after it, read at 00:20 the next day; MODE 1 posts task/m's message at 23:55 the day before
  reset; QR="$R/QUEUE-review.md"; printf 'x\n' > "$T/BRIEF-r.md"
  printf '23:50 DONE 23:50 FIX task/m c28ca5cf (FIX 1) reviewer A\n00:10 REVIEW task/z c28ca5cf base=x brief=y lane=1 (z) (reviewer B)\n' > "$QR"
  if [ "$1" = 1 ]; then NOW="$(epoch_of 2026 7 14 23 55)"; pm post exec3 --kind fix --body "$T/BRIEF-r.md" --ref task/m --from reviewerA >/dev/null 2>&1; fi
  NOW="$(epoch_of 2026 7 15 0 20)"; pm postman audit 2>&1; }
check "13.1989 ctl postman audit (on demand) across midnight: a 23:50 verdict read at 00:20 is dated YESTERDAY (a line later than the next line by over 12 h belongs to the previous day), so task/m's 23:55 message satisfies it; CONTROL in the same check: with no message task/m IS named" \
  '{ o="$(mid_round 1)"; [ $? = 0 ]; } && { o="$(mid_round 0)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "UNMATCHED.*task/m"'
nt_round() { # F13: a needs-tip verdict for task/n; MODE 1 = a mergetip message with that ref, 0 = only a fix message with that ref
  reset; QR="$R/QUEUE-review.md"; T0=$NOW; printf 'x\n' > "$T/BRIEF-r.md"; t="$(date -r $((T0+60)) +%H:%M)"
  printf '%s DONE %s needs-tip task/n c28ca5cf reviewer A\n' "$t" "$t" > "$QR"
  NOW=$((T0+300)); pm post exec3 --kind "$([ "$1" = 1 ] && echo mergetip || echo fix)" --body "$T/BRIEF-r.md" --ref task/n --from reviewerA >/dev/null 2>&1
  NOW=$((T0+360)); pm postman audit 2>&1; }
check "13.1990 ctl postman audit (on demand): a needs-tip verdict is satisfied by a mergetip message with that ref; CONTROL in the same check: a fix message with that ref does NOT satisfy it (exit 1, named)" \
  '{ o="$(nt_round 1)"; [ $? = 0 ]; } && { o="$(nt_round 0)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "UNMATCHED.*task/n"'

# ───────────────────────────── pane safety (pane_state) — each refusal has its control in the SAME check ─────────────────────────────
# A refusal is "nothing typed AND the message still open"; the control is an idle pane that IS pasted into.
pane_case() { # name mode [pretext]  → runs once at +0 against a fresh seat; prints nothing; sets rec file
  reset; mkseat exec3 "$@"; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1; }
check "13.1960 pane_state menu: a permission/option menu is refused (a pasted Enter would pick option 1); CONTROL in the same check: an idle pane is pasted" \
  'pane_case idle; [ "$(rec_n exec3)" = 1 ] && { pane_case menu; [ ! -s "$T/rec-exec3" ] && status_of exec3 | grep -q "last=menu"; }'
check "13.1987 pane_state no prompt: a screen with NO ❯ at all (a dialog, a full-screen view) is refused as menu and nothing is typed; CONTROL in the same check: an idle pane is pasted" \
  'pane_case idle; [ "$(rec_n exec3)" = 1 ] && { pane_case dialog; [ ! -s "$T/rec-exec3" ] && status_of exec3 | grep -q "last=menu"; }'
check "13.1961 pane_state text: a box holding foreign text is never cleared or pasted over; CONTROL in the same check: an idle pane is pasted" \
  'pane_case idle; [ "$(rec_n exec3)" = 1 ] && { pane_case text "half a thought"; [ ! -s "$T/rec-exec3" ] && tmux capture-pane -p -t "$S:=exec3" | grep -q "half a thought" && status_of exec3 | grep -q "last=text"; }'
copy_case() { reset; mkseat exec3 idle; tmux copy-mode -t "$S:=exec3"; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1; }
check "13.1962 pane_state copy-mode: nothing typed while in copy mode; after 180 s cancelled once and delivered; CONTROL in the same check: an idle (not copy-mode) pane is pasted at once" \
  'pane_case idle; [ "$(rec_n exec3)" = 1 ] && { copy_case; [ "$(rec_n exec3)" = 0 ] && status_of exec3 | grep -q "last=copy-mode" && { NOW=$((NOW+200)); pm postman once >/dev/null 2>&1; sleep 4; [ "$(rec_n exec3)" = 1 ] && [ "$(tmux display-message -p -t "$S:=exec3" "#{pane_in_mode}")" = 0 ]; }; }'
reset; mkseat exec3 idle
pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; CTL_POSTMAN_CMD_RE='^([0-9]+\.[0-9]+\.[0-9]+|claude|node)$' pm postman once >/dev/null 2>&1
check "13.1963 pane_state not-claude: with the DEFAULT allowlist a bash pane is never typed into; CONTROL: the same pane under a regex that allows bash is pasted" \
  '[ ! -s "$T/rec-exec3" ] && status_of exec3 | grep -q "last=not-claude" && { NOW=$((NOW+200)); pm postman once >/dev/null 2>&1; [ "$(rec_n exec3)" = 1 ]; }'
check "13.1964 pane_state not-claude: a less pane (not a shell, still not claude) is refused — the guard is an allowlist; CONTROL: an idle pane is pasted" 'pane_case idle; [ "$(rec_n exec3)" = 1 ] && { reset; tmux new-window -d -t "$S:" -n exec3 "less /etc/hosts"; sleep 0.5; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1; ! tmux capture-pane -p -t "$S:=exec3" | grep -q "postman" && status_of exec3 | grep -q "last=not-claude"; }'
reset; mkseat exec3 prefill "[postman #1 fix ← main] Read the WHOLE file x"; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1; sleep 1
check "13.1965 pane_state ours: our own unsubmitted pointer in the box is SUBMITTED, not pasted a second time (exactly one copy reaches the seat)" '[ "$(rec_n exec3)" = 1 ] && rec_has exec3 "[postman #1 fix" && [ "$(grep -o "\\[postman #1 fix" "$T/rec-exec3" | wc -l | tr -d " ")" = 1 ]'
reset; mkseat exec3 busy; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1; NOW=$((NOW+400)); pm postman once >/dev/null 2>&1
check "13.1966 busy seat: the pointer is pasted once (it queues) and not again inside 15 min" '[ "$(rec_n exec3)" = 1 ]'
reset; mkseat exec11 idle; pm post exec1 --kind fix --text "go" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1
check "13.1967 no window: exec1 absent while exec11 exists — the prefix is NOT matched (exact name), nothing typed into exec11, the message stays open" \
  '[ ! -s "$T/rec-exec11" ] && status_of exec1 | grep -q "last=no-window"'
reset; mkseat exec3 idle; pm post exec3 --kind note --text "fyi" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1
check "13.1968 kind note: delivered to the inbox only, never pasted into a pane, never blocks the head of the queue" \
  '[ "$(rec_n exec3)" = 0 ] && [ "$(wc -l < "$R/postman/inbox/exec3.jsonl" | tr -d " ")" = 1 ]'
ackrace_case() { reset; mkseat exec3 idle; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; CTL_TEST_ACK_BEFORE_PASTE=1 pm postman once >/dev/null 2>&1; }
check "13.1984 ack re-check: a seat that acks between pane_state and the paste is never typed into; CONTROL in the same check: without that ack the pointer is pasted" \
  'ackrace_case; [ ! -s "$T/rec-exec3" ] && [ -e "$R/postman/acks/1" ] && pane_case idle && [ "$(rec_n exec3)" = 1 ] && [ ! -e "$R/postman/acks/1" ]'
# ctl restart is ONLY ever run --dry-run here, behind THREE barriers: a PATH-front tmux SHIM (forwards list-windows only; every other subcommand is
# logged to $TL and fails), CTL_DRY_RUN=1 exported next to --dry-run, and restart.sh's own guard (a live restart refuses CTL_TMUX_SESSION != gisik).
# restart.sh's kill-window/new-window/paste-buffer hardcode `gisik:N`; the windows below sit at indices 91–98, which no live session has.
rs_wt="$T/wt"; mkdir -p "$rs_wt"; /usr/bin/git -C "$rs_wt" init -q; printf 'brief\n' > "$T/BRIEF-rs.md"
TL="$T/tmux-restart.log"; rs_real_tmux="$(command -v tmux)"; mkdir -p "$T/shim"
printf '#!/bin/bash\ncase "$1" in list-windows) exec "%s" "$@";; esac\necho "$*" >> "%s"\nexit 1\n' "$rs_real_tmux" "$TL" > "$T/shim/tmux"; chmod +x "$T/shim/tmux"
rs_dry() { PATH="$T/shim:$PATH" CTL_DRY_RUN=1 "${RS_CTL:-$CTL}" restart "$1" "$rs_wt" "$T/BRIEF-rs.md" --dry-run 2>&1; }
rs_snap() { tmux list-panes -a -F '#{session_name}:#{window_index} #{window_name} #{pane_pid}' 2>/dev/null | sort; }
reset; IDX=91 mkseat reviewerB idle; IDX=94 mkseat exec4 idle
check "13.1985 ctl restart --dry-run: the window keeps its NAME and the supersede marker is called for it (window 91 = reviewerB → -n reviewerB, never exec91); CONTROL in the same check: window 94 = exec4 and an absent window falls back to exec<N>; nothing is written and the tmux shim logged no write" \
  ': > "$TL" && o="$(rs_dry 91)" && printf "%s" "$o" | grep -q "^DRY: mark reviewerB restarted" && printf "%s" "$o" | grep -q -- "-n reviewerB " && ! printf "%s" "$o" | grep -q "exec91" && o4="$(rs_dry 94)" && printf "%s" "$o4" | grep -q "^DRY: mark exec4 restarted" && printf "%s" "$o4" | grep -q -- "-n exec4 " && o8="$(rs_dry 98)" && printf "%s" "$o8" | grep -q "^DRY: mark exec98 restarted" && [ ! -e "$R/postman/restarts" ] && [ ! -s "$TL" ]'
reset; tmux new-window -d -t "$S:96" -n "Bad Name" "sleep 600"; tmux new-window -d -t "$S:95" -n exec5 "sleep 600"
check "13.1986 ctl restart: a supersede marker that cannot be written prints a WARN (not silent) and the restart still proceeds; CONTROL in the same check: a valid seat name prints no WARN; the tmux shim logged no write" \
  ': > "$TL" && o="$(rs_dry 96)" && printf "%s" "$o" | grep -q "^WARN restart: postman marker not written" && printf "%s" "$o" | tail -1 | grep -q "^OK restart" && o5="$(rs_dry 95)" && ! printf "%s" "$o5" | grep -q "^WARN" && printf "%s" "$o5" | grep -q "^DRY: mark exec5 restarted" && [ ! -s "$TL" ]'
rs_nodry_case() { # a COPY of the ctl tree whose restart.sh lost its dry-run exit: the guard must stop it before any tmux write
  rm -rf "$T/ctlcopy"; cp -R "$HERE" "$T/ctlcopy" && sed -i.bak '/^if \[ "\$CTL_DRY_RUN" = 1 \]; then echo "DRY: tmux kill-window/d' "$T/ctlcopy/verbs/restart.sh" || return 1
  ! grep -q 'DRY: tmux kill-window' "$T/ctlcopy/verbs/restart.sh" || return 1
  : > "$TL"; before="$(rs_snap)"; o="$(RS_CTL="$T/ctlcopy/ctl" rs_dry 91)"; rc=$?; after="$(rs_snap)"
  [ "$rc" != 0 ] && printf "%s" "$o" | grep -q "a live restart refuses it" && [ ! -s "$TL" ] && [ -n "$before" ] && [ "$before" = "$after" ]; }
reset; IDX=91 mkseat reviewerB idle
check "13.1991 ctl restart whose dry-run exit is REMOVED (a stripped copy) reaches no tmux write: the CTL_TMUX_SESSION guard refuses it (rc≠0), the shim log is empty and no pane in ANY session was created, killed or replaced; CONTROL in the same check: the shim logs a write it is handed (a forward-everything shim is red), still forwards list-windows, and the unmodified restart --dry-run prints DRY: mark … restarted and OK restart" \
  ': > "$TL" && { PATH="$T/shim:$PATH" tmux kill-window -t "ctlpm-nosuch-$$:99" >/dev/null 2>&1; [ $? = 1 ]; } && grep -q "^kill-window -t ctlpm-nosuch-$$:99" "$TL" && PATH="$T/shim:$PATH" tmux list-windows -t "$S" >/dev/null && o="$(rs_dry 91)" && printf "%s" "$o" | grep -q "^DRY: mark reviewerB restarted" && printf "%s" "$o" | tail -1 | grep -q "^OK restart" && rs_nodry_case'
check "13.1969 lib ctl_cmd_is_claude: the version string, claude and node pass; zsh bash less vim python3 ssh fail" \
  '( unset CTL_POSTMAN_CMD_RE; for c in 2.1.288 claude node; do ctl_cmd_is_claude "$c" || exit 1; done; for c in zsh bash sh fish less vim python3 ssh ""; do ! ctl_cmd_is_claude "$c" || exit 1; done )'

ctl_test_only_end postman.test.sh
[ "$fails" -eq 0 ] && { echo "postman tests: all ok"; exit 0; } || { echo "postman tests: $fails FAILED"; exit 1; }
