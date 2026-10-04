#!/usr/bin/env bash
# scripts/ctl/test/postman.test.sh — the postman (ctl post / inbox / ack / postman), cases 13.1900–13.1991, 13.2040–13.2059 and 13.2070–13.2086. Run by `ctl selftest`.
# Everything runs on a SCRATCH tmux session (ctlpm-<pid>), a scratch ledger root and a scratch notes file, with a fake
# clock (CTL_POSTMAN_NOW). It can never touch a live seat: the daemon refuses a scratch/live mismatch (13.1952).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CTL="$HERE/ctl"
. "$HERE/lib.sh"
fails=0
check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }
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
no_paste() { local n; for n in 1 2 3 4 5; do [ "$(rec_n exec$n)" = 0 ] || return 1; done; }
note_text() { jget "$1" body | xargs cat; echo; }
queue_n() { python3 -c 'import json,sys; print(sum(1 for l in open(sys.argv[1]) if json.loads(l)["from"]=="queue"))' "$R/LEDGER.jsonl"; }
printf '06:01 FIX 4 %s (task/foo-bar abcdef12; reviewer B)\n06:02 NEXT 2 %s\n06:03 MERGETIP 5 task/foo-bar base=release/smoothness\n06:04 FIX lane3 %s\n' "$T/BRIEF-b.md" "$T/BRIEF-b.md" "$T/BRIEF-b.md" >> "$Q"; pm postman once >/dev/null 2>&1; sleep 1
check "13.1930 bridge: a FIX / NEXT / MERGETIP queue line becomes ONE note to main (from queue; laneN accepted; ref from the line or the brief) — 'needs ctl restart' for FIX/NEXT, 'needs ctl tipmerge' for MERGETIP — and NOTHING is pasted into any lane (no next/fix/mergetip message exists); CONTROL in the same check: a manual ctl post of a fix to exec4 IS pasted into its pane" \
  '[ "$(count_kind note main)" = 4 ] && [ "$(count_kind fix)" = 0 ] && [ "$(count_kind next)" = 0 ] && [ "$(count_kind mergetip)" = 0 ] && no_paste && [ "$(jget 1 from)" = queue ] && note_text 1 | grep -q "^FIX 4 $T/BRIEF-b.md needs ctl restart" && note_text 2 | grep -q "^NEXT 2 .* needs ctl restart" && note_text 3 | grep -q "^MERGETIP task/foo-bar base=release/smoothness needs ctl tipmerge" && note_text 4 | grep -q "^FIX 3 " && [ "$(jget 1 ref)" = task/foo-bar ] && [ "$(jget 2 ref)" = task/foo-bar ] && [ "$(jget 3 ref)" = task/foo-bar ] && [ "$(jget 4 ref)" = task/foo-bar ] && pm post exec4 --kind fix --text "manual" --from main >/dev/null 2>&1 && pm postman once >/dev/null 2>&1 && [ "$(rec_n exec4)" = 1 ] && rec_has exec4 "[postman #5 fix"'
before="$(ledger_n)"; pm postman once >/dev/null 2>&1; echo 0 > "$R/postman/cursor-queue-dispatch"; echo "06:09 NOTE x" >> "$Q"; pm postman once >/dev/null 2>&1
check "13.1932 bridge: the same line seen twice (a reset cursor) makes ONE note (src dedupe); CONTROL in the same check: a different line makes a second" \
  '[ "$(queue_n)" = 4 ] && echo 0 > "$R/postman/cursor-queue-dispatch" && pm postman once >/dev/null 2>&1 && [ "$(queue_n)" = 4 ] && printf "06:10 FIX 2 %s\n" "$T/BRIEF-b.md" >> "$Q" && pm postman once >/dev/null 2>&1 && [ "$(queue_n)" = 5 ]'
bridge_reset; pm postman once >/dev/null 2>&1
printf '06:11 FIX 4 %s/missing-brief.md\n06:13 FIX orchestrator %s\n06:14 NEXT task/x %s\n06:15 MERGETIP 4 task/foo base=main\n06:16 FIX 6 %s\n06:17 FIX 7 %s\n' "$T" "$T/BRIEF-b.md" "$T/BRIEF-b.md" "$T/BRIEF-b.md" "$T/BRIEF-b.md" >> "$Q"; pm postman once >/dev/null 2>&1
check "13.1933 bridge: an unparsable line (missing brief, target orchestrator or a branch, a MERGETIP without a release base) is never dropped — one 'could not route' note to main quoting it each; CONTROL in the same check: FIX 6 and FIX 7 parse (lanes 6/7 live in windows 10/11) and make ordinary notes; nothing is sent to any lane" \
  '[ "$(count_kind note main)" = 6 ] && [ "$(count_kind fix)" = 0 ] && [ "$(count_kind mergetip)" = 0 ] && no_paste && [ "$(for i in 1 2 3 4 5 6; do note_text $i; done | grep -c "could not route")" = 4 ] && note_text 5 | grep -q "^FIX 6 " && note_text 6 | grep -q "^FIX 7 "'
# 13.1934 gets its OWN setup: window 3 is reviewerA, so a queue line addressed to it must still reach no pane
reset; mkdir -p "$T/lanes"; Q="$R/QUEUE-dispatch.md"; : > "$Q"; for n in 1 2 4 5; do IDX=$n mkseat exec$n idle; done; IDX=3 mkseat reviewerA idle; pm postman once >/dev/null 2>&1
printf '06:40 FIX 3 %s\n06:43 FIX 2 %s\n06:44 MERGETIP 3 task/foo-bar base=release/x\n' "$T/BRIEF-b.md" "$T/BRIEF-b.md" >> "$Q"; pm postman once >/dev/null 2>&1; sleep 1
check "13.1934 bridge: a line addressed to a window that is NOT an exec lane (3 = reviewerA here) reaches no pane — notes only; CONTROL in the same check: a manual post to that same reviewerA window IS pasted (the pane tier is alive)" \
  '[ "$(count_kind note main)" = 3 ] && [ "$(rec_n reviewerA)" = 0 ] && no_paste && pm post reviewerA --kind fix --text manual --from main >/dev/null 2>&1 && pm postman once >/dev/null 2>&1 && [ "$(rec_n reviewerA)" = 1 ]'
bridge_reset; pm postman once >/dev/null 2>&1
printf '06:20 TOOK 06:19 x\n06:21 DONE 06:19 y\n06:22 NOTE z\n06:23 HOLD q\n06:24 CLOSE 5\n' >> "$Q"; pm postman once >/dev/null 2>&1
check "13.1935 bridge: TOOK/DONE/NOTE/HOLD are ignored by name; CLOSE sends no lane message, only a note to main" '[ "$(ledger_n)" = 1 ] && [ "$(count_kind note main)" = 1 ] && jget 1 body | xargs grep -q "ctl close 5"'
bridge_reset; pm postman once >/dev/null 2>&1; printf '06:30 FIX 2 %s\n' "$T/BRIEF-b.md" >> "$Q"; pm postman once >/dev/null 2>&1
check "13.1936 bridge: a handled line gets a DONE line written back into QUEUE-dispatch.md naming the message" 'grep -qE "^[0-9]{2}:[0-9]{2} DONE 06:30 postman #1" "$Q"'
shadow_case() { # PANE → a bridged FIX 2 and a refused (unparsable) FIX orchestrator handled in one pass with CTL_POSTMAN_PANE=PANE
  bridge_reset; CTL_POSTMAN_PANE="$1" pm postman once >/dev/null 2>&1
  printf '06:40 FIX 2 %s\n06:41 FIX orchestrator %s\n' "$T/BRIEF-b.md" "$T/BRIEF-b.md" >> "$Q"; CTL_POSTMAN_PANE="$1" pm postman once >/dev/null 2>&1; }
check "13.1981 pane tier off (CTL_POSTMAN_PANE=0): the bridge posts its notes but writes NO DONE line into QUEUE-dispatch.md — the dispatcher's open line stays open; CONTROL in the same check: pane tier on → a DONE line for the handled AND for the refused line" \
  'shadow_case 0 && [ "$(count_kind note main)" = 2 ] && ! grep -q " DONE " "$Q" && shadow_case 1 && [ "$(grep -cE "^[0-9]{2}:[0-9]{2} DONE 06:4[01] postman" "$Q")" = 2 ] && grep -q "DONE 06:41 postman refused" "$Q"'

bridge_reset; pm postman once >/dev/null 2>&1; NOW=$((NOW+10)); pm postman restarted exec4 >/dev/null 2>&1; NOW=$((NOW+10))
printf '06:50 MERGETIP 4 task/foo-bar base=release/smoothness\n' >> "$Q"; pm postman once >/dev/null 2>&1; NOW=$((NOW+10)); pm postman once >/dev/null 2>&1; sleep 1
check "13.2042 a MERGETIP queue line that arrives AFTER its lane was restarted produces only the note to main (ctl tipmerge) — nothing is pasted into the new session; CONTROL in the same check: a manual mergetip message to the same lane IS pasted" \
  '[ "$(count_kind note main)" = 1 ] && [ "$(count_kind mergetip)" = 0 ] && [ "$(rec_n exec4)" = 0 ] && note_text 1 | grep -q "needs ctl tipmerge" && pm post exec4 --kind mergetip --text "manual tip" --from main >/dev/null 2>&1 && pm postman once >/dev/null 2>&1 && [ "$(rec_n exec4)" = 1 ]'

# ───────────────────────────── --shadow: compute every delivery, write only the shadow log ─────────────────────────────
sh_real_tmux="$(command -v tmux)"; TL2="$T/tmux-write.log"; mkdir -p "$T/shim2"
printf '#!/bin/bash\ncase "$1" in list-windows|display-message|capture-pane|list-panes|has-session|show-options) exec "%s" "$@";; esac\necho "$*" >> "%s"\nexit 1\n' "$sh_real_tmux" "$TL2" > "$T/shim2/tmux"; chmod +x "$T/shim2/tmux"
spm() { PATH="$T/shim2:$PATH" pm "$@"; }                       # a tmux that forwards ONLY read-only subcommands and logs (and fails) every other one
sjson() { python3 -c 'import json,sys; r=[json.loads(l) for l in open(sys.argv[1])]; v=eval(sys.argv[2]); print(v if isinstance(v,str) else json.dumps(v))' "$R/postman/shadow.jsonl" "$1"; }
shadow_run() { # MODE shadow|live — pass 1 (the baseline), then a manual fix post, a planner question and a QUEUE FIX 2, pass 2; both passes behind the write-logging tmux shim
  bridge_reset; IDX=7 mkseat planner idle; : > "$TL2"; local fl=""; [ "$1" = shadow ] && fl="--shadow"
  spm postman once $fl >/dev/null 2>&1
  pm post exec3 --kind fix --text "manual go" --from main >/dev/null 2>&1; pm post planner --kind question --text "which way?" --from exec3 >/dev/null 2>&1
  printf '06:50 FIX 2 %s\n' "$T/BRIEF-b.md" >> "$Q"; spm postman once $fl >/dev/null 2>&1; sleep 1; }
shadow_run shadow
check "13.2043 --shadow computes every delivery and writes nothing a seat can see: the tmux shim logged NO write (no paste, no send-keys), no pane received a line, no inbox file, no notes line, no DONE in QUEUE-dispatch.md, the ledger holds only the 2 manual posts; the shadow log holds the queue line, the manual fix (channel pane, would paste) and the planner question (channel flag); CONTROL in the same check: the same passes WITHOUT --shadow reach the shim with a load-buffer, create the inbox and write a ⚑ line" \
  '[ ! -s "$TL2" ] && no_paste && [ "$(rec_n exec3)" = 0 ] && [ "$(rec_n planner)" = 0 ] && [ ! -d "$R/postman/inbox" ] && [ ! -s "$N" ] && ! grep -q " DONE " "$Q" && [ "$(ledger_n)" = 2 ] && [ "$(sjson "sum(1 for x in r if x[\"origin\"]==\"queue\")")" = 1 ] && [ "$(sjson "[(x[\"channel\"],x[\"would\"]) for x in r if x[\"origin\"]==\"ledger\"]")" = "[[\"pane\", \"paste\"], [\"flag\", \"flag\"]]" ] && [ "$(sjson "[x[\"text\"][:20] for x in r if x[\"origin\"]==\"ledger\"][0]")" = "[postman #1 fix ← ma" ] && shadow_run live && grep -q "^load-buffer" "$TL2" && [ -d "$R/postman/inbox" ] && [ "$(grep -c "⚑" "$N")" = 1 ] && grep -q " DONE " "$Q"'
shadow_run shadow; for dt in 200 620 1220 1300; do NOW=$((NOW+dt)); spm postman once --shadow >/dev/null 2>&1; done; echo 0 > "$R/postman/cursor-queue-dispatch"; spm postman once --shadow >/dev/null 2>&1
check "13.2044 --shadow logs ONE record per message however many passes ran: four passes across the whole backoff ladder and a reset QUEUE cursor add none (1 queue record, 2 ledger records); CONTROL in the same check: a NEW queue line adds exactly one queue record" \
  '[ "$(sjson "sum(1 for x in r if x[\"origin\"]==\"queue\")")" = 1 ] && [ "$(sjson "sum(1 for x in r if x[\"origin\"]==\"ledger\")")" = 2 ] && printf "06:55 FIX 3 %s\n" "$T/BRIEF-b.md" >> "$Q" && spm postman once --shadow >/dev/null 2>&1 && [ "$(sjson "sum(1 for x in r if x[\"origin\"]==\"queue\")")" = 2 ] && [ ! -s "$TL2" ]'
check "13.2045 --shadow and the planner: a message to the planner is logged as channel flag and writes NO line to the notes file; CONTROL in the same check: the next live pass over the same ledger writes exactly ONE ⚑ line for it" \
  'shadow_run shadow; [ ! -s "$N" ] && [ "$(sjson "[x[\"text\"] for x in r if x.get(\"channel\")==\"flag\"][0][:36]")" = "#2 question ← exec3: which way?" ] && pm postman once >/dev/null 2>&1 && [ "$(grep -c "⚑ POSTMAN → PLANNER: #2 question" "$N")" = 1 ]'
reset; mkseat exec3 idle; pm post exec3 --kind fix --text "old" --from main >/dev/null 2>&1; CTL_POSTMAN_MAX_PASSES=1 spm postman run --shadow >/dev/null 2>&1; rc=$?
pm post exec3 --kind fix --text "new" --from main >/dev/null 2>&1; spm postman once --shadow >/dev/null 2>&1
check "13.2046 run --shadow: exits 0 after its passes and leaves no daemon pid; messages already in the ledger at the first shadow pass are baseline (never replayed); CONTROL in the same check: a message posted after it IS logged" \
  '[ "$rc" = 0 ] && [ ! -e "$R/postman/daemon.pid" ] && [ "$(sjson "[x[\"upto\"] for x in r if x[\"origin\"]==\"baseline\"]")" = "[1]" ] && [ "$(sjson "[x[\"id\"] for x in r if x[\"origin\"]==\"ledger\"]")" = "[2]" ] && [ ! -s "$TL2" ]'
# N2: a restart marker written BEFORE a --shadow pass must survive it — restarts() acks (closes) real messages, a seat-visible write
reset; mkseat exec3 idle; pm post exec3 --kind fix --text "before the restart" --from main >/dev/null 2>&1; NOW=$((NOW+10)); pm postman restarted exec3 >/dev/null 2>&1; NOW=$((NOW+10)); : > "$TL2"
mk_before="$(ls "$R/postman/restarts" 2>/dev/null)"; spm postman once --shadow >/dev/null 2>&1
check "13.2056 --shadow runs no restart supersede (mutant N2): with a restart marker for exec3 and an open message to it posted before the marker, a --shadow pass writes no ack file, the message stays open, the marker stays, the ledger gains no note and the tmux shim logged no write; CONTROL in the same check: the next LIVE pass cancels it (an ack file marked cancelled, the marker consumed, one note to main)" \
  '[ "$mk_before" = exec3 ] && [ ! -e "$R/postman/acks/1" ] && [ -f "$R/postman/restarts/exec3" ] && [ "$(ledger_n)" = 1 ] && [ ! -s "$TL2" ] && pm postman once >/dev/null 2>&1 && grep -q " cancelled cancelled-by-restart" "$R/postman/acks/1" && [ ! -e "$R/postman/restarts/exec3" ] && [ "$(count_kind note main)" = 1 ]'

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
for dt in 200 620 1220 5; do NOW=$((NOW+dt)); pm_noage postman once >/dev/null 2>&1; done     # the last pass delivers the page the 4th try posted to the planner
check "13.1948 page chain: an unreachable main pages the planner (inbox) AND appends exactly ONE ⚑ line to the notes file (the page's own flag on delivery; a second write beside the page — mutant N10 — is red)" \
  '[ "$(count_kind page planner)" = 1 ] && [ "$(grep -c "⚑ POSTMAN" "$N")" = 1 ] && grep -q "#1" "$N"'
reset; mkseat exec3 idle; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1; sleep 4
NOW=$((NOW+1000)); pm postman once >/dev/null 2>&1; sleep 4; p1="$(count_kind page main)"; NOW=$((NOW+1000)); pm postman once >/dev/null 2>&1
check "13.1980 page by AGE: a seat that has the pointer (proven) but never acks is not paged at 17 min and is paged once at 33 min" '[ "$p1" = 0 ] && [ "$(count_kind page main)" = 1 ]'
reset; mkseat planner idle; pm post planner --kind question --text "which way?" --from exec3 >/dev/null 2>&1; pm postman once >/dev/null 2>&1
NOW=$((NOW+400)); pm postman once >/dev/null 2>&1
check "13.1954 planner seat: never a pane paste (inbox only); the message is flagged ONCE when delivered (a ⚑ line at once, not repeated by later passes); unacked 30 min → exactly ONE more ⚑ line, the reminder" \
  '[ "$(rec_n planner)" = 0 ] && [ "$(grep -c "⚑ POSTMAN" "$N")" = 1 ] && { NOW=$((NOW+1500)); pm postman once >/dev/null 2>&1; NOW=$((NOW+600)); pm postman once >/dev/null 2>&1; [ "$(grep -c "⚑ POSTMAN" "$N")" = 2 ] && [ "$(rec_n planner)" = 0 ]; }'
reset; mkseat planner idle; mkseat exec3 idle; pm post planner --kind note --text "blocked: need a ruling on X" --from exec3 >/dev/null 2>&1; pm post exec3 --kind fix --text "go" --from main >/dev/null 2>&1; pm postman once >/dev/null 2>&1; pm postman once >/dev/null 2>&1
check "13.2040 a message TO THE PLANNER is a ⚑ line in the notes file — one per message, its text carried, repeated passes add none — and never a pane paste; CONTROL in the same check: the message to exec3 in the same passes is pasted into its pane and flagged nowhere" \
  '[ "$(grep -c "⚑ POSTMAN → PLANNER: #1 note ← exec3: blocked: need a ruling on X" "$N")" = 1 ] && [ "$(grep -c "⚑" "$N")" = 1 ] && [ "$(rec_n planner)" = 0 ] && [ "$(rec_n exec3)" = 1 ] && rec_has exec3 "[postman #2 fix"'
reset
check "13.2041 ctl postman run/once/status/audit/restarted refuse an unknown flag (exit 1, nothing ran: no ledger root, no daemon pid, no restart marker); CONTROL in the same check: the same subcommands with --dry-run are accepted" \
  '{ o="$(CTL_POSTMAN_MAX_PASSES=1 pm postman run --shadw 2>&1)"; [ $? = 1 ]; } && printf "%s" "$o" | tail -1 | grep -q "^FAIL postman.*unknown flag --shadw" && { pm postman once --nope >/dev/null 2>&1; [ $? = 1 ]; } && { pm postman status --nope >/dev/null 2>&1; [ $? = 1 ]; } && { pm postman audit --nope >/dev/null 2>&1; [ $? = 1 ]; } && { pm postman restarted exec3 --nope >/dev/null 2>&1; [ $? = 1 ]; } && [ ! -e "$R/postman" ] && CTL_POSTMAN_MAX_PASSES=1 pm postman run --dry-run >/dev/null 2>&1 && pm postman once --dry-run >/dev/null 2>&1 && pm postman status --dry-run >/dev/null 2>&1 && pm postman restarted exec3 --dry-run >/dev/null 2>&1'
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
g_round() { # MODE same|other|verb → a QUEUE-dispatch line bridged to a note (FIX for task/foo-bar | FIX for task/other | MERGETIP for task/foo-bar) and a reviewer FIX verdict for task/foo-bar in the same pass, then a pass after the grace
  bridge_reset; QR="$R/QUEUE-review.md"; : > "$QR"; pm postman once >/dev/null 2>&1; local t; t="$(date -r $NOW +%H:%M)"
  case "$1" in same) printf '%s FIX 4 %s (task/foo-bar c28ca5cf)\n' "$t" "$T/BRIEF-b.md";; other) printf '%s FIX 4 %s (task/other c28ca5cf)\n' "$t" "$T/BRIEF-b.md";; verb) printf '%s MERGETIP 4 task/foo-bar base=release/x\n' "$t";; esac >> "$Q"
  printf '%s DONE %s FIX task/foo-bar c28ca5cf (F1) reviewer A\n' "$t" "$t" >> "$QR"
  pm postman once >/dev/null 2>&1; NOW=$((NOW+700)); pm postman once >/dev/null 2>&1; }
check "13.2057 mechanism g counts a BRIDGED queue note (mutant N11): a reviewer FIX verdict for task/foo-bar plus the bridge's FIX note with ref task/foo-bar → no audit note after the grace (the ledger holds only the bridge's note) and on-demand 'ctl postman audit' exits 0; CONTROL in the same check: a bridged FIX note for ANOTHER branch, and a bridged MERGETIP note for the SAME branch, each leave the verdict unmatched (an audit note after the grace, on-demand exit 1 naming task/foo-bar)" \
  'g_round same && [ "$(count_kind note main)" = 1 ] && [ "$(jget 1 ref)" = task/foo-bar ] && pm postman audit >/dev/null 2>&1 && g_round other && [ "$(count_kind note main)" = 2 ] && { o="$(pm postman audit 2>&1)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "UNMATCHED.*task/foo-bar" && g_round verb && [ "$(jget 1 ref)" = task/foo-bar ] && [ "$(count_kind note main)" = 2 ] && { o="$(pm postman audit 2>&1)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "UNMATCHED.*task/foo-bar"'

# ───────────────────────────── the shadow parity audit (ctl postman audit --parity | --since | --window) ─────────────────────────────
# Fixtures are written straight into postman/shadow.jsonl and DISPATCH-log.md (the audit is a pure function of those files and the ledger).
au_reset() { reset; mkdir -p "$R/postman"; : > "$R/DISPATCH-log.md"; }
au_q() { python3 -c 'import json,sys; now=float(sys.argv[1]); v,w,ago,src,why=sys.argv[2:7]; a=sys.argv[7:]+["",""]; print(json.dumps({"origin":"queue","verb":v,"win":w,"line_time":"00:00","src":src,"sid":1,"ref":a[1] or None,"brief":a[0] or None,"refused":(why or None),"to":"main","ts":"fixture","epoch":now-int(ago)}))' "$NOW" "$@" >> "$R/postman/shadow.jsonl"; }   # au_q VERB LANE SECS-AGO SRC REFUSED-WHY [BRIEF] [BRANCH]
au_d() { printf '%s %s\n' "$(date -r $((NOW-$1)) +%H:%M)" "$2" >> "$R/DISPATCH-log.md"; }                                                                                                                                                  # au_d SECS-AGO TEXT
au() { pm postman audit "$@" 2>&1; }
clean_fixture() { au_reset; au_q FIX 2 600 s1 "" BRIEF-x-fix-1.md; au_q MERGETIP 4 500 s2 "" "" task/y-tip; au_d 540 "dispatcher: delivered x FIX 1 pointer to lane2, saw echoed"; au_d 440 "dispatcher: delivered y-tip MERGETIP to lane4 (new turn running)"; }
clean_fixture
check "13.2047 audit --parity on a clean window: every dispatcher delivery pairs with a shadow delivery is parity-clean (matched=2 missed=0 duplicate=0) but fails condition A (CONDITION A FAIL: matched 2 < 20) → exit 2, the last line FAIL … condition A not met; CONTROL in the same check: one more dispatcher delivery with no shadow record (FIX 5) makes it exit 1 and names it MISSED" \
  '{ o="$(au --parity)"; [ $? = 2 ]; } && printf "%s" "$o" | tail -1 | grep -q "^FAIL postman audit parity .*matched=2 missed=0 duplicate=0 .*; condition A not met$" && printf "%s" "$o" | grep -q "^CONDITION A FAIL: matched 2 < 20 (matched 2 = dispatcher pairs 2 + BY-ORCH agreements 0)$" && printf "%s" "$o" | grep -q "^POSTMAN AUDIT all shadow records 2/0/0" && au_d 300 "FIX 5 z-fix delivered to lane 5, saw echoed" && { o="$(au --parity)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "^MISSED    FIX 5" && printf "%s" "$o" | tail -1 | grep -q "^FAIL postman audit parity .*missed=1"'
au_reset; au_q FIX 7 400 s1 "target 7 is not a lane"; au_d 300 "FIX 7 w-fix delivered to lane 7"; au_q FIX 2 200 s2 "" BRIEF-v-fix-1.md; au_d 150 "dispatcher: delivered v FIX 1 pointer to lane2"
check "13.2048 audit --parity MISSED: a delivery the bridge refused to route is named with the bridge's reason and exits 1; CONTROL in the same check: the same fixture without the refused delivery exits 2 (no miss; condition A not met), not 1" \
  '{ o="$(au --parity)"; [ $? = 1 ]; } && printf "%s" "$o" | grep "^MISSED" | grep -q "FIX 7.*bridge refused it: target 7 is not a lane" && printf "%s" "$o" | grep -q "matched=1 missed=1" && au_reset && au_q FIX 2 200 s2 "" BRIEF-v-fix-1.md && au_d 150 "dispatcher: delivered v FIX 1 pointer to lane2" && { au --parity >/dev/null; [ $? = 2 ]; }'
au_reset; au_q FIX 2 600 same ""; au_q FIX 2 590 same ""; au_d 540 "FIX 2 x delivered to lane 2"
check "13.2049 audit --parity DUPLICATE: the same QUEUE line recorded twice (one src) is a duplicate → exit 1; CONTROL in the same check: two records with different srcs and two dispatcher deliveries pair cleanly (exit 2: no duplicate, no miss; condition A not met)" \
  '{ o="$(au --parity)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "^DUPLICATE queue line .* FIX 2 recorded 2 times" && au_reset && au_q FIX 2 600 a "" BRIEF-x-fix-1.md && au_q FIX 2 590 b "" BRIEF-y-fix-1.md && au_d 540 "dispatcher: delivered x FIX 1 pointer to lane2" && au_d 530 "dispatcher: delivered y FIX 1 pointer to lane2" && { o="$(au --parity)"; [ $? = 2 ]; } && printf "%s" "$o" | tail -1 | grep -q "matched=2 missed=0 duplicate=0 .* unpaired=0;"'
reset; mkdir -p "$R/postman"; pm postman once --shadow >/dev/null 2>&1; printf 'x\n' > "$T/BRIEF-dup.md"
pm post exec3 --kind fix --body "$T/BRIEF-dup.md" --from reviewerA >/dev/null 2>&1; NOW=$((NOW+60)); pm post exec3 --kind fix --body "$T/BRIEF-dup.md" --from reviewerA >/dev/null 2>&1; pm postman once --shadow >/dev/null 2>&1
check "13.2050 audit --parity (ledger leg): two ledger messages to one seat with the same kind and body within 10 min are a DUPLICATE (exit 1) — and a ledger message the shadow run never recorded is MISSED (exit 1); CONTROL in the same check: distinct bodies, each recorded: no miss, no duplicate (exit 2, condition A not met) — and those 2 ledger records are printed BESIDE the queue count (0) as information, never counted: CONDITION A FAIL: matched 0 < 20" \
  '{ o="$(au --parity)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "^DUPLICATE ledger #2 repeats #1" && pm post exec3 --kind fix --text "unrecorded" --from reviewerA >/dev/null 2>&1 && { o="$(au --parity)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "^MISSED    ledger #3" && reset && mkdir -p "$R/postman" && pm postman once --shadow >/dev/null 2>&1 && pm post exec3 --kind fix --text "one" --from reviewerA >/dev/null 2>&1 && pm post exec3 --kind fix --text "two" --from reviewerA >/dev/null 2>&1 && pm postman once --shadow >/dev/null 2>&1 && { o="$(au --parity)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "shadow queue deliveries in it: 0; ledger records beside them: 2 (information only" && printf "%s" "$o" | grep -q "^CONDITION A FAIL: matched 0 < 20 ("'
au_reset; au_q FIX 2 600 s1 "" BRIEF-x-fix-1.md; au_q NEXT 3 500 s2 ""; au_d 540 "dispatcher: delivered x FIX 1 pointer to lane2"
check "13.2051 audit --parity EXTRA: a shadow delivery the dispatcher never logged (the orchestrator did it directly) is listed EXTRA and is no miss (exit 2, not 1: the parity is clean; condition A is not met and the extra, with no derivable reason, prints reason=?); CONTROL in the same check: an extra never hides a miss — adding a dispatcher MERGETIP to the SAME lane as the extra NEXT (a different verb never pairs) exits 1 with the extra still listed and the MERGETIP MISSED" \
  '{ o="$(au --parity)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^EXTRA     .*NEXT 3 .*reason=?$" && printf "%s" "$o" | tail -1 | grep -q "matched=1 missed=0 duplicate=0 extra=1" && au_d 100 "MERGETIP 3 q delivered" && { o="$(au --parity)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "^EXTRA     .*NEXT 3" && printf "%s" "$o" | grep -q "^MISSED    MERGETIP 3"'
au_reset; au_d 5000 "FIX 5 old-miss delivered to lane 5"; for k in 1 2 3; do au_q FIX 2 $((900-k*100)) "s$k" "" "BRIEF-r$k-fix-1.md"; au_d $((880-k*100)) "dispatcher: delivered r$k FIX 1 pointer to lane2"; done
check "13.2052 audit windows: --window 2 looks at the last two shadow QUEUE deliveries only and --since T at records from T on, so an old miss outside the window does not fail them (no miss: exit 2 — the parity is clean and condition A, which counts MATCHED, fails with matched 2 < 20; the queue-delivery count and the ledger records are printed beside it as information); CONTROL in the same check: the same fixture over the whole log (--parity, --window 3 reaching back to it is NOT needed) exits 1; --since and --window together are refused" \
  '{ o="$(au --window 2)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^window: last 2 queue deliveries; shadow queue deliveries in it: 2; ledger records beside them: 0 (information only" && printf "%s" "$o" | grep -q "^CONDITION A FAIL: matched 2 < 20 (matched 2 = dispatcher pairs 2 + BY-ORCH agreements 0)$" && { au --since $((NOW-1000)) >/dev/null; [ $? = 2 ]; } && { o="$(au --parity)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "^MISSED    FIX 5" && { au --window 2 --since 12:00 >/dev/null; [ $? = 1 ]; } && { au --window 0 >/dev/null; [ $? = 1 ]; } && { au --since garbage >/dev/null; [ $? = 1 ]; }'
au_reset
for i in 1 2 3 4 5; do au_q FIX 2 $((1000-i*10)) "g$i" ""; done; au_q MERGETIP 2 900 g6 ""; au_q FIX 4 890 g7 ""; au_q MERGETIP 5 880 g8 "" "" task/sm2-g-3; au_q FIX 3 870 g9 ""
au_d 950 "FIX 2 help-round-trip-fix-1 delivered to lane 2, saw echoed; FIX 3 skipped as superseded"
au_d 940 "MERGETIP lane 2 + FIX lane 4 (fix-1, fix-2) delivered, both echoed"
au_d 930 "dispatcher: delivered G-3 MERGETIP (4d418760) to lane 5, saw: tip. T4 tip b810bbf9 seen, no DONE yet."
au_d 925 "HOLD MERGETIP 4 sm2-g1-cls: lane 4 finished and restarted on kg-home-t2; not delivered, flagged orchestrator for ctl restart"
au_d 920 "ACK lane 3 restarted on ctl-postman-followup; nothing delivered"
au_d 915 "NEXT 2 editor-toolbar-phone-hosts HELD: duplicates the brief lane 2 is already on; flagged"
au_d 910 "DELIVERED FIX 3 BRIEF-x.md"
au_d 905 "forwarded the FIX pointer sent onwards"
au_d 903 "FIX 6 held-fix not delivered to lane 6, lane busy"
check "13.2053 DISPATCH-log grammar, real line shapes: 'FIX 2 … delivered to lane 2; FIX 3 skipped', 'MERGETIP lane 2 + FIX lane 4 … delivered', 'delivered G-3 MERGETIP (…) to lane 5' and the exact 'DELIVERED FIX 3' form each give their deliveries (4 matched pairs + the exact one = 5; parity clean, exit 2: condition A not met); HOLD / not delivered / nothing delivered / HELD lines give NONE (no MISSED), including a clause that names verb + lane AND says not delivered (FIX 6 … not delivered to lane 6); CONTROL in the same check: a line that names a verb and says sent but pairs nothing is printed UNPARSED, never silently dropped" \
  '{ o="$(au --parity)"; [ $? = 2 ]; } && printf "%s" "$o" | tail -1 | grep -q "matched=1 missed=0 duplicate=0 extra=8 unparsed=1 .* unpaired=4;" && printf "%s" "$o" | grep -q "^UNPARSED  .*forwarded the FIX pointer" && printf "%s" "$o" | grep -q "^MATCHED   MERGETIP 5 .* ref=g-3 ~ task/sm2-g-3 = .*delivered G-3 MERGETIP" && printf "%s" "$o" | grep -q "^UNPAIRED  FIX lane 2 ref=(none) reason=no-ref; .*FIX 2 help-round-trip-fix-1 delivered" && printf "%s" "$o" | grep -q "^UNPAIRED  MERGETIP lane 2 ref=(none) reason=no-ref; .*MERGETIP lane 2 + FIX lane 4" && printf "%s" "$o" | grep -q "^UNPAIRED  FIX lane 4 ref=(none) reason=no-ref; .*MERGETIP lane 2 + FIX lane 4" && printf "%s" "$o" | grep -q "^UNPAIRED  FIX lane 3 ref=(none) reason=no-ref; .*DELIVERED FIX 3 BRIEF-x.md$" && [ "$(printf "%s" "$o" | grep -c "^UNPAIRED")" = 4 ] && printf "%s" "$o" | grep -q "^NOTE      dispatcher lines before 2026-10-03 name the task after the verb and audit as no-ref; run condition A on windows from 10-03 on$"'
au_reset; au_q FIX 2 600 s1 ""; au_d 300 "FIX 5 z delivered to lane 5"
check "13.2054 plain 'ctl postman audit' (no window flag) stays the mechanism-g sweep and ignores the shadow log: a parity miss does not fail it (exit 0); CONTROL in the same check: --parity over the same files exits 1, and with no shadow log at all --parity refuses (exit 1, says so)" \
  'au >/dev/null && { o="$(au --parity)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "^MISSED" && rm -f "$R/postman/shadow.jsonl" && { o="$(au --parity)"; [ $? = 1 ]; } && printf "%s" "$o" | tail -1 | grep -q "no shadow log"'
reset; bridge_reset; pm postman once --shadow >/dev/null 2>&1; printf '06:50 FIX 2 %s\n' "$T/BRIEF-b.md" >> "$Q"; pm postman once --shadow >/dev/null 2>&1; : > "$R/DISPATCH-log.md"; au_d 0 "dispatcher: delivered b FIX 1 pointer to lane2, saw echoed"
check "13.2055 end to end: a real --shadow pass over a QUEUE-dispatch FIX 2 and the dispatcher's DISPATCH-log line for it audit as matched=1 missed=0 (exit 2: parity clean, condition A not met); CONTROL in the same check: the same log line for FIX 3 (no queue line) is MISSED (exit 1)" \
  '{ o="$(au --parity)"; [ $? = 2 ]; } && printf "%s" "$o" | tail -1 | grep -q "matched=1 missed=0" && au_d 0 "FIX 3 other-brief delivered to lane 3" && { o="$(au --parity)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "^MISSED    FIX 3"'
n14_round() { # BRIEF → a QUEUE-dispatch FIX 4 naming BRIEF through a real --shadow pass, then the dispatcher's log line delivering it; prints the parity audit
  bridge_reset; pm postman once --shadow >/dev/null 2>&1; printf '06:50 FIX 4 %s\n' "$1" >> "$Q"; pm postman once --shadow >/dev/null 2>&1; : > "$R/DISPATCH-log.md"; au_d 0 "dispatcher: delivered b FIX 1 pointer to lane4, saw echoed"; au --parity; }
check "13.2058 end to end, a REFUSED line (mutant N14): a QUEUE-dispatch FIX 4 whose brief does not exist goes through a real --shadow pass, the dispatcher logs delivering it → MISSED naming the bridge's own reason (brief file … not found), exit 1; CONTROL in the same check: the same line with a brief that exists → matched=1 missed=0, exit 2 (parity clean, condition A not met)" \
  '{ o="$(n14_round "$T/BRIEF-b.md")"; [ $? = 2 ]; } && printf "%s" "$o" | tail -1 | grep -q "matched=1 missed=0" && { o="$(n14_round "$T/missing-brief.md")"; [ $? = 1 ]; } && printf "%s" "$o" | grep "^MISSED" | grep -q "FIX 4: .*bridge refused it: brief file .*missing-brief.md. not found"'
# Real DISPATCH-log.md lines, VERBATIM after their HH:MM (roles/DISPATCH-log.md:541, 607, 632, 635, 145, 465, 628, 206, 681, 484, 486, then for FIX 2
# 722, 716, 676, 686, 715, 718, 903, 733, 734 on 2026-10-04)
cat > "$T/dl-real.txt" <<'DLEOF'
dispatcher: delivered T9 FIX 1 pointer to lane3 (queued behind its turn)
dispatcher: delivered G-3 FIX 1 pointer to lane5
dispatcher: T4 FIX 1 delivered to lane 5 (saw: t4 fix). Watch bcuuco5hr expires now; re-arming.
dispatcher: T10 FIX 2 delivered to lane 1 (saw: t10 fix 2).
FIX 4 (pg-t6 mergetip ruling) delivered, acked. NEXT 1 U-T9 still waits behind lane 1's undeliverable MERGETIP (ctl ghost-text bug); lane 3 box still holds my unsent pointer; both in CTL notes for the orchestrator
MERGETIP lane1 task/mcp-e-1-converter delivered (FIX 1 already DONE c9fb56f1; merge ae0c059a remaining); REVIEW c9fb56f1 → B queued. MERGETIP lane5 task/mcp-e-2-comment-events delivered (queued behind its battery; tip de7ea7b7 is WIP, not queued for review).
dispatcher: T10 FIX1 DONE f750ad28 verified (REVIEW by lane 1); T5 FIX 1 delivered to lane 2 (saw: t5 fix).
#891 P-T8 landed 031c800c: delivered 06:32 NEXT 4 (U-T4->U-T5), MERGETIP 5, MERGETIP 1, NEXT 2 (G0 fix1 -> P-T5 tip -> U-T7); lane 3 still waits for P-T7 (P-T11 blocked), U-T9 re-merge held until U-T6 lands
ACK T8 FIX 1 delivered by orchestrator (lane 4)
lane4 F-5 FIX 1 delivered once (queued behind T3 turn); awaiting DONE → re-check REVIEW to B.
lane1 T4 MERGETIP (T2 tip 7ba3a37d) delivered once, folded into FIX 1; awaiting the one DONE → ONE REVIEW to B.
ACK ctl-run-tests FIX 1 delivered by orchestrator (lane 2); hold closed
ACK batch-6 FIX 3 delivered by orchestrator; hold closed
ACK G-9 T1 FIX 1 delivered by orchestrator (lane 7); reviewer A fresh on T8
ACK ctl tipmerge FIX 1 delivered by orchestrator (lane 1)
HOLD batch-6 FIX 3 (not delivered; orchestrator to restart a lane)
HOLD batch-6 MERGETIP 4 (not delivered; orchestrator routes tip merges)
ACK deliver nothing for ctl-model-effort-catalogue (lane 3 restarted by orchestrator) or kg-home-t2-brand 9223851c REVIEW
HOLD T9 FIX 1 (not delivered; orchestrator to restart a lane)
ACK T9 FIX 1 delivered by orchestrator (lane 3); lane 4 resumed; hold closed
DLEOF
au_dl() { au_d "$1" "$(sed -n "${2}p" "$T/dl-real.txt")"; }     # au_dl SECS-AGO LINE-NO (of dl-real.txt)
f1_round() { # SHADOW-LANES → five real "<task> FIX <round> … to lane N" / "laneN <task> FIX <round>" lines, shadow FIX records for the given five lanes; prints the parity audit
  au_reset; local k=0 w b=(- BRIEF-sm-t9-notes-fix-1.md BRIEF-g-3-fix-1.md BRIEF-t4-x-fix-1.md BRIEF-t10-x-fix-2.md BRIEF-f-5-x-fix-1.md); for w in $1; do k=$((k+1)); au_q FIX "$w" $((700-k*10)) "r$k" "" "${b[$k]}"; done; for k in 1 2 3 4; do au_dl $((600-k*10)) $k; done; au_dl 550 10; au --parity; }
check "13.2059 DISPATCH-log grammar, a fix ROUND is not the LANE (F1 i): the real lines 'delivered T9 FIX 1 pointer to lane3', 'delivered G-3 FIX 1 pointer to lane5', 'T4 FIX 1 delivered to lane 5 (…)', 'T10 FIX 2 delivered to lane 1 (…)' and, the lane BEFORE the verb, 'lane4 F-5 FIX 1 delivered once (…)' pair with shadow FIX records for lanes 3, 5, 5, 1, 4 → matched=5 missed=0 extra=0, exit 2 (parity clean, condition A not met); CONTROL in the same check: the same lines against shadow FIX records for the ROUND numbers (1, 1, 1, 2, 1) leave four of them MISSED (only the lane-1 line pairs a round-1 record) → matched=1 missed=4 extra=4, exit 1" \
  '{ o="$(f1_round "3 5 5 1 4")"; [ $? = 2 ]; } && printf "%s" "$o" | tail -1 | grep -q "matched=5 missed=0 duplicate=0 extra=0 .* unpaired=0;" && { o="$(f1_round "1 1 1 2 1")"; [ $? = 1 ]; } && printf "%s" "$o" | tail -1 | grep -q "matched=0 missed=4 duplicate=0 extra=5 .* unpaired=1$" && printf "%s" "$o" | grep -q "^UNPAIRED  FIX lane 1 ref=t10 reason=ref-mismatch; .*T10 FIX 2 delivered to lane 1"'
au_reset; au_q FIX 4 700 a1 ""; au_q MERGETIP 1 690 a2 ""; au_q MERGETIP 5 680 a3 ""; au_q FIX 2 670 a4 "" BRIEF-t5-comment-ui-fix-1.md; au_q MERGETIP 1 660 a5 "" "" task/wtg1-t4-pack; au_dl 600 5; au_dl 590 6; au_dl 580 7; au_dl 570 11
check "13.2070 DISPATCH-log grammar, sentences (F1 ii): the real 04:40 line 'FIX 4 (…) delivered, acked. NEXT 1 U-T9 still waits behind lane 1's …' yields only (FIX, 4) — a sentence end splits clauses, so the waiting NEXT 1 is no delivery (no MISSED NEXT 1); CONTROL in the same check: a real second sentence / clause that says delivered still pairs — 'MERGETIP lane1 … delivered (FIX 1 already DONE …); REVIEW … queued. MERGETIP lane5 … delivered (…)' gives MERGETIP 1 and 5 (the FIX 1 already DONE is not a delivery) and '… (REVIEW by lane 1); T5 FIX 1 delivered to lane 2' gives FIX 2; 'lane1 T4 MERGETIP (…) delivered once, folded into FIX 1' gives only MERGETIP 1: matched=5 missed=0 extra=0 (exit 2: parity clean, condition A not met)" \
  '{ o="$(au --parity)"; [ $? = 2 ]; } && printf "%s" "$o" | tail -1 | grep -q "matched=2 missed=0 duplicate=0 extra=3 .* unpaired=3;" && ! printf "%s" "$o" | grep -q "^MISSED" && ! printf "%s" "$o" | grep -q "NEXT lane 1" && printf "%s" "$o" | grep -q "^MATCHED   FIX 2 .* ref=t5 ~ BRIEF-t5-comment-ui-fix-1.md = .*T5 FIX 1 delivered to lane 2" && printf "%s" "$o" | grep -q "^MATCHED   MERGETIP 1 .* ref=t4 ~ task/wtg1-t4-pack = .*lane1 T4 MERGETIP" && printf "%s" "$o" | grep -q "^UNPAIRED  FIX lane 4 ref=(none) reason=no-ref; .*FIX 4 (pg-t6 mergetip ruling)" && printf "%s" "$o" | grep -q "^UNPAIRED  MERGETIP lane 1 ref=(none) reason=no-ref; .*MERGETIP lane1 task/mcp-e-1-converter" && printf "%s" "$o" | grep -q "^UNPAIRED  MERGETIP lane 5 ref=(none) reason=no-ref; .*MERGETIP lane1 task/mcp-e-1-converter"'
au_reset; for vw in NEXT:4 MERGETIP:5 MERGETIP:1 NEXT:2 FIX:4; do au_q "${vw%%:*}" "${vw##*:}" 700 "b$vw" ""; done; au_dl 600 8; au_dl 590 9
check "13.2071 DISPATCH-log grammar, several deliveries in one line and the orchestrator's (F1 iii): the real 06:33 line 'delivered 06:32 NEXT 4 (…), MERGETIP 5, MERGETIP 1, NEXT 2 (…); lane 3 still waits …' gives exactly its four pairs (matched=4); the real 'ACK T8 FIX 1 delivered by orchestrator (lane 4)' is NOT a dispatcher delivery — it is listed BY-ORCH and, its shadow FIX 4 record having no brief and no branch (an empty ref), agrees with nothing — the record stays EXTRA with reason=? (no line names it) and condition A fails on it (exit 2); CONTROL in the same check: the same ACK text without 'by orchestrator' pairs (FIX, 4): matched=5 extra=0 by_orchestrator=0; and the real 05:58 'ACK ctl-run-tests FIX 1 delivered by orchestrator (lane 2); hold closed' AGREES with a shadow FIX 2 record whose brief is BRIEF-ctl-run-tests-fix-1.md: MATCHED '= BY-ORCH', agreed=1" \
  '{ o="$(au --parity)"; [ $? = 2 ]; } && printf "%s" "$o" | tail -1 | grep -q "matched=0 missed=0 duplicate=0 extra=5 unparsed=0 by_orchestrator=1 agreed=0 no_reason=5 unpaired=4; condition A not met$" && printf "%s" "$o" | grep -q "^UNPAIRED  NEXT lane 4 ref=891-p-t8-landed-031c800c-06-32 reason=ref-mismatch;" && printf "%s" "$o" | grep -q "^UNPAIRED  MERGETIP lane 5 ref=4-u-t4-u-t5 reason=ref-mismatch;" && printf "%s" "$o" | grep -q "^UNPAIRED  MERGETIP lane 1 ref=5 reason=no-ref;" && printf "%s" "$o" | grep -q "^UNPAIRED  NEXT lane 2 ref=1 reason=no-ref;" && printf "%s" "$o" | grep -q "^BY-ORCH   .*ACK T8 FIX 1 delivered by orchestrator (lane 4) \[FIX lane 4: no shadow record agrees on verb + lane + ref\]$" && printf "%s" "$o" | grep -q "^EXTRA     .*FIX 4 .*reason=?$" && printf "%s" "$o" | grep -q "^CONDITION A FAIL: matched 0 < 20; unpaired 4 (ref-mismatch 2, no-ref 2); 5 EXTRA without a reason (" && au_reset && au_q FIX 4 700 c0 "" BRIEF-t8-member-admin-fix-1.md "" && au_d 590 "ACK T8 FIX 1 delivered (lane 4)" && { o="$(au --parity)"; [ $? = 2 ]; } && printf "%s" "$o" | tail -1 | grep -q "matched=1 missed=0 duplicate=0 extra=0 unparsed=0 by_orchestrator=0 agreed=0 no_reason=0 unpaired=0;" && printf "%s" "$o" | grep -q "^MATCHED   FIX 4 .* ref=t8 ~ BRIEF-t8-member-admin-fix-1.md = .*ACK T8 FIX 1 delivered (lane 4)$" && au_reset && au_q FIX 2 700 c1 "" BRIEF-ctl-run-tests-fix-1.md "" && au_dl 600 12 && { o="$(au --parity)"; [ $? = 2 ]; } && printf "%s" "$o" | tail -1 | grep -q "matched=1 missed=0 duplicate=0 extra=0 unparsed=0 by_orchestrator=1 agreed=1 no_reason=0 unpaired=0;" && printf "%s" "$o" | grep -q "^MATCHED   FIX 2 .* = BY-ORCH .*ACK ctl-run-tests FIX 1"'

# ── FIX 2 (planner ruling 09:03): condition A counts MATCHED (dispatcher pairs + BY-ORCH agreements), every EXTRA carries a reason ──
# Real QUEUE-dispatch.md lines, VERBATIM after their HH:MM (roles/QUEUE-dispatch.md:1325, 1568, 1560 on 2026-10-04): the HOLDs the reasons read.
cat > "$T/q-real.txt" <<'QEOF'
HOLD dispatcher: FIX 5 ctl-run-tests FIX 1 (BRIEF-ctl-run-tests-fix-1.md, task/ctl-run-tests fe844305, reviewer B; merge the release tip first, 57 behind, merge-tree clean) — lane 5 (the author) was just restarted on PTR-gate-accepts-36-lane5.md, a different task; not delivered into any live session (one task = one session). ORCHESTRATOR: needs a fresh-restart lane. Open: ctl-run-tests FIX 1.
HOLD dispatcher: FIX 4 BRIEF-ctl-postman-followup-fix-2.md (task/ctl-postman-followup 6ff89c41, KG, RUNG H+, reviewer A FIX 1 delta: planner 09:03 matched-count rule for audit --parity) targets lane 4, the FIX 1 author, which printed DONE on 6ff89c41 at ~09:04 and is now live on task/ctl-autopilot (a different task); the line itself says the orchestrator routes. One task = one session: I deliver nothing into lane 4. I will not deliver. Open hold: this (orchestrator-owned).
HOLD dispatcher: FIX 1 BRIEF-wtg1-scroll-fix-1.md (task/wtg1-scroll c1bf6072, RUNG per ledger +1, reviewer C FULL, test-only: 5 legs F1-F5 killing survivors G1/G3/G5/G2) names lane 1 WG. Lane 1 finished wtg1-scroll at ~09:31 and is live on task/wtg1-pack (Part 1 T4, a different task, step 3/6 at ~09:40). One task = one session: I deliver nothing into lane 1. The orchestrator restarts lanes itself; I will not deliver. Open hold: this (orchestrator-owned).
QEOF
au_qd() { printf '%s %s\n' "$(date -r $((NOW-$1)) +%H:%M)" "$2" >> "$R/QUEUE-dispatch.md"; }     # au_qd SECS-AGO TEXT (a QUEUE-dispatch line)
au_ql() { au_qd "$1" "$(sed -n "${2}p" "$T/q-real.txt")"; }                                         # au_ql SECS-AGO LINE-NO (of q-real.txt)
au_tn() { # FIRST LAST SECS-AGO → shadow FIX records T<k> on lane (k-1)%5+1 with the real T9 brief's shape BRIEF-sm-t<k>-notes-fix-1.md, 10 s apart from SECS-AGO
  python3 -c 'import json,sys; now,a,b,ago=float(sys.argv[1]),int(sys.argv[2]),int(sys.argv[3]),int(sys.argv[4]); [print(json.dumps({"origin":"queue","verb":"FIX","win":str((k-1)%5+1),"line_time":"00:00","src":"t%d"%k,"sid":k,"ref":None,"brief":"BRIEF-sm-t%d-notes-fix-1.md"%k,"refused":None,"to":"main","ts":"fixture","epoch":now-ago+(k-a)*10})) for k in range(a,b+1)]' "$NOW" "$@" >> "$R/postman/shadow.jsonl"; }
au_ack() { local k; for k in $(seq "$1" "$2"); do au_d $((1700-(k-$1)*5)) "ACK T$k FIX 1 delivered by orchestrator (lane $(( (k-1)%5+1 )))"; done; }   # the real 07:01 ack's shape, one per T<k>
pp_build() { # N → the planner's window: 25 shadow FIX records T1..T25, each held by a line of the real 07:00 shape 'HOLD T9 FIX 1 (not delivered; …)', and N BY-ORCH acks for T1..TN
  au_reset; au_tn 1 25 2400; local k; for k in $(seq 1 25); do au_d $((2100-k*10)) "HOLD T$k FIX 1 (not delivered; orchestrator to restart a lane)"; done; [ "$1" = 0 ] || au_ack 1 "$1"; }
pp_round() { pp_build "$1"; au --parity; }
check "13.2072 condition A counts MATCHED, never deliveries (planner 09:03, F1 i): a window of 25 shadow queue deliveries, each held (a 'HOLD T<k> FIX 1 (not delivered; …)' line names it), with 0 matches → 'CONDITION A FAIL: matched 0 < 20' as the ONLY failing clause (all 25 EXTRA reason=held) and exit 2, the last line FAIL … condition A not met (red arm); CONTROL in the same check: the same window plus 20 agreeing BY-ORCH acks 'ACK T<k> FIX 1 delivered by orchestrator (lane N)' → CONDITION A PASS (matched 20 = BY-ORCH agreements 20, the other 5 EXTRA reason=held), exit 0, the last line OK; and 19 acks → FAIL matched 19 < 20, exit 2 (one under the threshold)" \
  '{ o="$(pp_round 0)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^CONDITION A FAIL: matched 0 < 20 (matched 0 = dispatcher pairs 0 + BY-ORCH agreements 0)$" && [ "$(printf "%s" "$o" | grep -c "^EXTRA .*reason=held$")" = 25 ] && printf "%s" "$o" | grep -q "shadow queue deliveries in it: 25;" && printf "%s" "$o" | tail -1 | grep -q "^FAIL postman audit parity .*matched=0 missed=0 duplicate=0 extra=25 .*; condition A not met$" && { o="$(pp_round 20)"; [ $? = 0 ]; } && printf "%s" "$o" | grep -q "^CONDITION A PASS: matched 20 >= 20, missed 0, duplicate 0, unpaired 0, every EXTRA has a reason (held 5) (matched 20 = dispatcher pairs 0 + BY-ORCH agreements 20)$" && printf "%s" "$o" | tail -1 | grep -q "^OK postman audit parity .*matched=20 missed=0 duplicate=0 extra=5 .*agreed=20 no_reason=0 unpaired=0$" && { o="$(pp_round 19)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^CONDITION A FAIL: matched 19 < 20 ("'
ag_round() { # VERB LANE BRIEF BRANCH [RECORD-SECS-AGO] [DL-REAL-LINE] → one shadow record and one real BY-ORCH ack 600 s ago (default dl-real 12, the 05:58 'ACK ctl-run-tests FIX 1 delivered by orchestrator (lane 2); hold closed'); prints the parity audit
  au_reset; au_q "$1" "$2" "${5:-700}" a1 "" "$3" "$4"; au_dl 600 "${6:-12}"; au --parity; }
agreed() { ag_round "$@" | tail -1 | sed -n 's/.* agreed=\([0-9]*\) .*/\1/p'; }
ao() { o="$("$@")"; return 0; }     # ao CMD… → $o = its output, whatever it exits (keeps a check's && chain unbroken)
lane_arm() { au_reset; au_q FIX 5 700 a1 "" BRIEF-ctl-run-tests-fix-1.md task/ctl-run-tests; au_ql 640 1; au_dl 600 12; au --parity; }   # the real queue line's lane 5 against the lane-2 ack
check "13.2073 a BY-ORCH agreement needs verb + lane + ref (F1 ii): the real 05:58 'ACK ctl-run-tests FIX 1 delivered by orchestrator (lane 2); hold closed' and a shadow FIX 2 record for BRIEF-ctl-run-tests-fix-1.md → MATCHED '= BY-ORCH', agreed=1, its BY-ORCH line marked 'FIX lane 2 agreed' (the CONTROL); each sub-arm disagrees on ONE field and agrees with nothing (agreed=0, the record EXTRA): the VERB (a MERGETIP 2 record for task/ctl-run-tests), the LANE (the real queue line's lane 5 — its EXTRA reason=held: the real 05:58 QUEUE-dispatch HOLD names it, and so does the ack's own 'hold closed'), the REF (a FIX 2 record for BRIEF-ctl-seats-fix-1.md); and a clause that names NO lane — the real 05:54 'ACK batch-6 FIX 3 delivered by orchestrator; hold closed', whose 3 is the fix round — never agrees, even with a FIX 3 record for BRIEF-smoothness-batch-6-fix-3.md (marked 'names no lane')" \
  'ao ag_round FIX 2 BRIEF-ctl-run-tests-fix-1.md task/ctl-run-tests && printf "%s" "$o" | tail -1 | grep -q "matched=1 missed=0 duplicate=0 extra=0 unparsed=0 by_orchestrator=1 agreed=1 no_reason=0 unpaired=0; condition A not met$" && printf "%s" "$o" | grep -q "^MATCHED   FIX 2 .* = BY-ORCH .*ACK ctl-run-tests FIX 1" && printf "%s" "$o" | grep -q "^BY-ORCH   .*hold closed \[FIX lane 2 agreed\]$" && [ "$(agreed MERGETIP 2 "" task/ctl-run-tests)" = 0 ] && ao lane_arm && printf "%s" "$o" | tail -1 | grep -q "matched=0 .* agreed=0 " && printf "%s" "$o" | grep -q "^EXTRA     .*FIX 5 BRIEF-ctl-run-tests-fix-1.md task/ctl-run-tests .*reason=held$" && printf "%s" "$o" | grep -q "\[FIX lane 2: no shadow record agrees on verb + lane + ref\]$" && [ "$(agreed FIX 2 BRIEF-ctl-seats-fix-1.md task/ctl-seats)" = 0 ] && ao ag_round FIX 3 BRIEF-smoothness-batch-6-fix-3.md task/smoothness-batch-6 700 13 &&printf "%s" "$o" | tail -1 | grep -q "matched=0 .* agreed=0 " && printf "%s" "$o" | grep -q "^BY-ORCH   .*ACK batch-6 FIX 3 delivered by orchestrator; hold closed \[FIX: names no lane\]$"'
check "13.2074 the ref rule and the pairing window of a BY-ORCH agreement: the real 03:22 'ACK G-9 T1 FIX 1 delivered by orchestrator (lane 7); reviewer A fresh on T8' agrees with a FIX 7 record for BRIEF-g9-t1-live-drag-fix-1.md (the ref words joined, g9t1, spell the run g9-t1), and the 05:58 ctl-run-tests ack agrees with its FIX 2 record 2580 s before it and 60 s after it; CONTROL in the same check: whole words — 'ACK T1 FIX 1 delivered by orchestrator (lane 1)' never agrees with BRIEF-sm-t10-notes-fix-1.md; a contiguous run — the real 04:17 'ACK ctl tipmerge FIX 1 delivered by orchestrator (lane 1)' never with BRIEF-ctl-auto-tipmerge-fix-1.md; a letter — 'ACK 6 FIX 1 delivered by orchestrator (lane 2)' (ref words: 6) never agrees with BRIEF-batch-6-fix-1.md although 6 is one of its whole words; the window — the same ctl-run-tests pair 2780 s apart (over 45 min), or the record 220 s after the ack (over 2 min), agrees with nothing" \
  '[ "$(agreed FIX 7 BRIEF-g9-t1-live-drag-fix-1.md "" 700 14)" = 1 ] && [ "$(agreed FIX 2 BRIEF-ctl-run-tests-fix-1.md "" 3200)" = 1 ] && [ "$(agreed FIX 2 BRIEF-ctl-run-tests-fix-1.md "" 560)" = 1 ] && [ "$(au_reset; au_q FIX 1 700 a1 "" BRIEF-sm-t10-notes-fix-1.md ""; au_d 600 "ACK T1 FIX 1 delivered by orchestrator (lane 1)"; au --parity | tail -1 | sed -n "s/.* agreed=\([0-9]*\) .*/\1/p")" = 0 ] && [ "$(agreed FIX 1 BRIEF-ctl-auto-tipmerge-fix-1.md "" 700 15)" = 0 ] && [ "$(au_reset; au_q FIX 2 700 a1 "" BRIEF-batch-6-fix-1.md ""; au_d 600 "ACK 6 FIX 1 delivered by orchestrator (lane 2)"; au --parity | tail -1 | sed -n "s/.* agreed=\([0-9]*\) .*/\1/p")" = 0 ] && [ "$(agreed FIX 2 BRIEF-ctl-run-tests-fix-1.md "" 3400)" = 0 ] && [ "$(agreed FIX 2 BRIEF-ctl-run-tests-fix-1.md "" 400)" = 0 ]'
rs_round() { # [unexplained] → 20 agreed records (T31..T50) plus one EXTRA per reason, each from its real line, all later than T31..T50; "unexplained" adds a 4th EXTRA no rule explains; prints the parity audit
  au_reset; au_tn 31 50 2100; au_ack 31 50
  au_q FIX 3 1850 h1 "" BRIEF-sm-t9-notes-fix-1.md ""; au_dl 1800 19                                       # held: the real 07:00 FIX 3 and the real 'HOLD T9 FIX 1 (not delivered; …)'
  au_q NEXT 6 1840 n1 "" "" task/ctl-model-effort-catalogue; au_dl 1790 18                                 # no-deliver: the real 05:31 'ACK deliver nothing for ctl-model-effort-catalogue …'
  au_q MERGETIP 1 1830 s1 "" "" task/wtg1-stress-output-ignored; au_q FIX 1 1700 s2 "" BRIEF-wtg1-scroll-fix-1.md task/wtg1-scroll; au_ql 1650 3   # superseded: the real 09:11 MERGETIP 1, then the real 09:42 FIX 1 to lane 1 (held by its real 09:43 HOLD)
  if [ "${1:-}" = unexplained ]; then au_q FIX 7 4000 u1 "" BRIEF-kg-c-t3-motion-fix-1.md task/kg-c-t3-motion
    au_d 3000 "kg-c-t3-motion FIX 1 seen in the queue; lane 7 busy"; au_d 1000 "HOLD kg-c-t3-motion FIX 1 (not delivered; orchestrator to restart a lane)"; fi
  au --parity; }
check "13.2075 EXTRA reasons (F1 iii): beside 20 BY-ORCH agreements, one EXTRA per reason, each derived from its real line — held (07:00 FIX 3 BRIEF-sm-t9-notes-fix-1.md + 'HOLD T9 FIX 1 (not delivered; …)'), no-deliver (task/ctl-model-effort-catalogue + 'ACK deliver nothing for ctl-model-effort-catalogue …'), superseded (09:11 MERGETIP 1 task/wtg1-stress-output-ignored, then 09:42 FIX 1 to lane 1, itself held by its 09:43 HOLD) → CONDITION A PASS (held 2, no-deliver 1, superseded 1), exit 0; CONTROL in the same check: one more EXTRA no rule explains — a line names it without HOLD or deliver-nothing, a HOLD naming it comes 50 min later, other HOLD lines lie in its window — prints reason=? and the condition FAILs although matched = 20 ('1 EXTRA without a reason'), exit 2" \
  '{ o="$(rs_round)"; [ $? = 0 ]; } && printf "%s" "$o" | grep -q "^EXTRA     .*FIX 3 BRIEF-sm-t9-notes-fix-1.md .*reason=held$" && printf "%s" "$o" | grep -q "^EXTRA     .*NEXT 6 task/ctl-model-effort-catalogue .*reason=no-deliver$" && printf "%s" "$o" | grep -q "^EXTRA     .*MERGETIP 1 task/wtg1-stress-output-ignored .*reason=superseded$" && printf "%s" "$o" | grep -q "^EXTRA     .*FIX 1 BRIEF-wtg1-scroll-fix-1.md task/wtg1-scroll .*reason=held$" && printf "%s" "$o" | grep -q "^CONDITION A PASS: matched 20 >= 20, missed 0, duplicate 0, unpaired 0, every EXTRA has a reason (held 2, no-deliver 1, superseded 1) (" && { o="$(rs_round unexplained)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^EXTRA     .*FIX 7 BRIEF-kg-c-t3-motion-fix-1.md task/kg-c-t3-motion .*reason=?$" && printf "%s" "$o" | grep -q "^CONDITION A FAIL: 1 EXTRA without a reason (matched 20 = dispatcher pairs 0 + BY-ORCH agreements 20)$" && printf "%s" "$o" | tail -1 | grep -q "no_reason=1 unpaired=0; condition A not met$"'
sp_reason() { # ARM [X-SECS-AGO] → the real 09:11 'MERGETIP 1 task/wtg1-stress-output-ignored' as record X (default 2400 s ago) plus what ARM adds; prints X's reason
  au_reset; au_q MERGETIP 1 "${2:-2400}" x1 "" "" task/wtg1-stress-output-ignored
  case "$1" in
    later) au_q FIX 1 1500 s2 "" BRIEF-wtg1-scroll-fix-1.md task/wtg1-scroll;;
    noise) au_q FIX 1 1500 s2 "" BRIEF-wtg1-scroll-fix-1.md task/wtg1-scroll; au_dl 2700 15; au_dl 1950 14; au_dl 1300 15;;
    other) au_q FIX 2 1500 s2 "" BRIEF-wtg1-scroll-fix-1.md task/wtg1-scroll;;
    earlier) au_q FIX 1 2450 s0 "" BRIEF-wtg1-scroll-fix-1.md task/wtg1-scroll;;
    orch) au_q FIX 1 1500 s2 "" BRIEF-wtg1-scroll-fix-1.md task/wtg1-scroll; au_dl 1950 15;;
    dis) au_q FIX 1 2600 w1 "" BRIEF-w-fix-1.md ""; au_q FIX 1 1500 s2 "" BRIEF-wtg1-scroll-fix-1.md task/wtg1-scroll; au_d 1950 "dispatcher: delivered w FIX 1 pointer to lane1, saw echoed";;
  esac
  au --parity | sed -n 's/^EXTRA .* MERGETIP 1 task\/wtg1-stress-output-ignored .*reason=//p'; }
check "13.2076 the superseded rule, clause by clause: the real 09:11 MERGETIP 1 task/wtg1-stress-output-ignored followed 15 min later by a queue record to lane 1 is superseded — also with BY-ORCH acks naming lane 1 BEFORE it and AFTER the later record, and one naming lane 7 between them, and 2600 s apart; CONTROL in the same check, each leaves it reason=?: the later record goes to lane 2; the only other lane-1 record is EARLIER, 50 s before it (inside the pairing window, so only the later-than clause refuses it); the later record is 2800 s after it (over 45 min); a BY-ORCH ack naming lane 1 lies between them (the real 04:17 'ACK ctl tipmerge FIX 1 … (lane 1)'); a dispatcher delivery to lane 1 lies between them (it pairs an earlier record)" \
  '[ "$(sp_reason later)" = superseded ] && [ "$(sp_reason noise)" = superseded ] && [ "$(sp_reason later 4100)" = superseded ] && [ "$(sp_reason other)" = "?" ] && [ "$(sp_reason earlier)" = "?" ] && [ "$(sp_reason later 4300)" = "?" ] && [ "$(sp_reason orch)" = "?" ] && [ "$(sp_reason dis)" = "?" ]'
hd_reason() { # BRIEF dl:N|q:N → a shadow FIX 4 record for BRIEF (2000 s ago) and one real line 60 s later (dl-real.txt or q-real.txt line N); prints its reason
  au_reset; au_q FIX 4 2000 h1 "" "$1" ""; case "$2" in dl:*) au_dl 1940 "${2#dl:}";; q:*) au_ql 1940 "${2#q:}";; esac
  au --parity | sed -n 's/^EXTRA .*reason=//p'; }
check "13.2077 what NAMES a record, for held / no-deliver: the real 10:42 QUEUE-dispatch 'HOLD dispatcher: FIX 4 BRIEF-ctl-postman-followup-fix-2.md (…)' names its record by the WHOLE brief stem → held; the real 05:54 'HOLD batch-6 FIX 3 (not delivered; …)' names the 05:53 FIX 4 BRIEF-smoothness-batch-6-fix-3.md record by the ref words before its verb (batch-6 FIX) → held; so does the real 05:54 'ACK batch-6 FIX 3 delivered by orchestrator; hold closed', whose verb is its first key word — the line's HH:MM time is no ref word (its digits joined in would agree with nothing) and 'hold closed' says HOLD → held; CONTROL in the same check: the real 05:56 'HOLD batch-6 MERGETIP 4 (not delivered; …)' gives the same ref words before ANOTHER verb, so it names the FIX record not → reason=?" \
  '[ "$(hd_reason BRIEF-ctl-postman-followup-fix-2.md q:2)" = held ] && [ "$(hd_reason BRIEF-smoothness-batch-6-fix-3.md dl:16)" = held ] && [ "$(hd_reason BRIEF-smoothness-batch-6-fix-3.md dl:13)" = held ] && [ "$(hd_reason BRIEF-smoothness-batch-6-fix-3.md dl:17)" = "?" ]'
check "13.2078 condition A's other clauses: the 20-agreement PASS window plus one dispatcher delivery no record pairs → CONDITION A FAIL: missed 1 (its only clause), exit 1; plus one queue record recorded twice → CONDITION A FAIL: duplicate 1, exit 1; CONTROL in the same check: the window alone → CONDITION A PASS, exit 0" \
  '{ pp_build 20; o="$(au --parity)"; [ $? = 0 ]; } && printf "%s" "$o" | grep -q "^CONDITION A PASS: " && { pp_build 20; au_d 1000 "FIX 9 z-fix delivered to lane 9, saw echoed"; o="$(au --parity)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "^CONDITION A FAIL: missed 1 (matched 20 = dispatcher pairs 0 + BY-ORCH agreements 20)$" && { pp_build 20; au_tn 5 5 2360; o="$(au --parity)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "^CONDITION A FAIL: duplicate 1 (matched 20 = dispatcher pairs 0 + BY-ORCH agreements 20)$"'
e2e_round() { # LANE → the real 07:00 queue line 'FIX <LANE> BRIEF-sm-t9-notes-fix-1.md' (no branch in the line or the brief) through a real --shadow pass, then the real 07:00 HOLD and 07:01 ack (lane 3); prints the parity audit
  bridge_reset; pm postman once --shadow >/dev/null 2>&1; printf 'T9 notes, fix 1.\n' > "$T/BRIEF-sm-t9-notes-fix-1.md"; printf '07:00 FIX %s %s\n' "$1" "$T/BRIEF-sm-t9-notes-fix-1.md" >> "$Q"
  pm postman once --shadow >/dev/null 2>&1; : > "$R/DISPATCH-log.md"; au_dl 0 19; au_dl 0 20; au --parity; }
check "13.2079 end to end, the BY-ORCH agreement: a real --shadow pass over the real 07:00 'FIX 3 BRIEF-sm-t9-notes-fix-1.md' (no branch anywhere) records the brief, and the real 07:01 'ACK T9 FIX 1 delivered by orchestrator (lane 3); …' agrees with it by that brief alone → matched=1 agreed=1; CONTROL in the same check: the same line queued for lane 4 agrees with nothing (agreed=0) and stays EXTRA reason=held (the real 07:00 HOLD names it)" \
  'ao e2e_round 3 && [ "$(sjson "[x.get(\"brief\") for x in r if x[\"origin\"]==\"queue\"]")" = "[\"$T/BRIEF-sm-t9-notes-fix-1.md\"]" ] && printf "%s" "$o" | tail -1 | grep -q "matched=1 missed=0 duplicate=0 extra=0 .*agreed=1 no_reason=0 unpaired=0; condition A not met$" && ao e2e_round 4 && printf "%s" "$o" | tail -1 | grep -q "matched=0 missed=0 duplicate=0 extra=1 .*agreed=0 no_reason=0 unpaired=0; condition A not met$" && printf "%s" "$o" | grep -q "^EXTRA     .*FIX 4 .*BRIEF-sm-t9-notes-fix-1.md .*reason=held$"'

# ── FIX 3 (reviewer C, F1): a record's OWN queue line, and its own NAME, are no evidence for its EXTRA reason; F2: the three survivors' legs ──
# Real QUEUE-dispatch.md lines, VERBATIM after their HH:MM (roles/QUEUE-dispatch.md:978, 1594, 1595, 1011, 1012, 985, 986, 993, 984 on 2026-10-04)
cat > "$T/q-own.txt" <<'OWNEOF'
FIX lane5 BRIEF-hk-1-docker-cache-check-fix-1.md (HK-1 f21acb67, reviewer A: F1 'the NEXT deploy' false, 5 deploys between; F2 add same-day uncached baseline 67b02899; catalogue prose only; branch stays HELD)
FIX 1 BRIEF-wtg1-route-fix-1.md (task/wtg1-route 2cce4b68, lane 1 WG (first free WG lane), RUNG per ledger (+1 per send-back, was H), reviewer B FULL; commit ON TOP, merge --ff-only first; TEST-ONLY: F1 mixed-height upward leg kills R5; F2 step-inside legs kill R8/R9/R10 (straight s.x<t.x, vx>s.x, ux<t.x); code accepted (FD-1 per planner 12:22); ALSO needs-tip BY HAND: tipmerge --dry-run CONFLICT at WG 774f5a65 (index.ts export union; Features.md T4/T5/T6 bullets in order); legs test:15-19/119-123 HELD pending reviewer B ⚑ QUESTION Q1 (same-row channel on the row edge y=28); READY of the delta waits for the planner's answer)
HOLD dispatcher: FIX 1 BRIEF-wtg1-route-fix-1.md (task/wtg1-route 2cce4b68, lane 1 WG named as 'first free WG lane', RUNG per ledger +1, reviewer B FULL, test-only: F1 mixed-height upward leg kills R5, F2 step-inside legs kill R8/R9/R10) — lane 1 finished wtg1-route at ~12:01 and is on task/wtg1-camera (Part 1 T7, a different task, restarted ~12:03). One task = one session: I deliver nothing into lane 1 or any live lane. The orchestrator restarts lanes itself; I will not deliver. Open holds: this + ctl-autopilot FIX 4 + drafts-t5b-atomic FIX 2 + wtg1-range FIX 1 (all orchestrator-owned).
MERGETIP 5 task/sm-t4-workspaces-read base=release/smoothness (reviewer B: df11c6e6 is on 7bff22be, not 604242a1. HOLD the merge until T3 task/sm-t3-read-cache lands (B is reviewing it now): T3 x T4 merge-tree CONFLICTS in providers.tsx resolveSession, Features §22, test-cases/25, so one merge of the tip carrying T3, not two. Same go: P1 clearReadCaches() must call clearMyWorkspacesCache (FD5; the docblock at use-my-workspaces.ts:27 claims it, and nothing calls it), with a door test that has a control; P2 build 25.045. Notes: roles/REVIEW-sm-t4-workspaces-read-df11c6e6.md)
HOLD 21:46 MERGETIP 5 task/sm-t4-workspaces-read: NOT delivered. Reviewer B says HOLD until T3 task/sm-t3-read-cache (8798d58d, B reviewing) lands, then ONE merge of the tip carrying T3 (T3 x T4 conflicts in providers.tsx, Features §22, test-cases/25), plus P1 clearReadCaches/clearMyWorkspacesCache and P2 25.045. T3 is not in QUEUE-gate LANDED yet (last LANDED #940 d4a44dd9 21:50). Lane 5 is also on the orchestrator's G-3 (PTR-sm-g3.md). I deliver this line when T3 lands
FIX lane1 BRIEF-hk-6-held-work-shipped-fix-1.md (HK-6 e8f561b8, reviewer A: F1 §5 13.1430 bullet collides with HK-1 5e0b40de and its times are wrong, copy HK-1's line byte for byte; F2 the 'Insert table' §5 bullet shipped in #744 (TablePicker f612840a), delete it and note it in item 4; docs only; HELD branch, no PR)
TOOK 20:19 FIX lane1 BRIEF-hk-6-held-work-shipped-fix-1.md (HK-6 e8f561b8): short pointer sent (asks for a literal DONE line), ctl dispatch result above
TOOK→DONE (orchestrator-delivered FIXes) lane1: DONE task/hk-6-held-work-shipped 96f661dc (ls-remote ok, 0 behind 26b57cab, docs/held-work.md only) and DONE task/hk-3-domain-em-dashes 3cd6daad (ls-remote ok, 0 behind, 14 files); lane 1 sent its own REVIEWs and A/B already wrote READY at 20:23, so I add none. NEW/MOVED TIP task/hk-3b-client-em-dashes f80399f8 (stacked on fixed HK-3 3cd6daad, 27 files): not a DONE yet, I wait for lane 1's literal DONE before queuing a REVIEW
TOOK→DONE (orchestrator-dispatched PTR-lane1-hk.md) lane1 HK-3 task/hk-3-domain-em-dashes 21bb2acd + HK-6 task/hk-6-held-work-shipped e8f561b8: both pushed and 0 behind release 26b57cab; the lane printed a final report with NO literal DONE line, so I verified the remote tips myself and queued REVIEWs (HK-3 to B, HK-6 to A); both HELD
OWNEOF
printf 'branch task/hk-1-docker-cache-check\n' > "$T/BRIEF-hk-1-docker-cache-check-fix-1.md"; printf 'branch task/wtg1-route\n' > "$T/BRIEF-wtg1-route-fix-1.md"; printf 'branch task/hk-6-held-work-shipped\n' > "$T/BRIEF-hk-6-held-work-shipped-fix-1.md"
br_round() { # SPEC... → a fresh root; each SPEC — q:N (line N of q-own.txt), q=TEXT (a QUEUE-dispatch line) or d=TEXT (a DISPATCH-log line) — is written at NOW's minute, then ONE real --shadow pass bridges the queue lines (the bridge gives each record its src, queue_src); prints the parity audit
  au_reset; : > "$R/QUEUE-dispatch.md"; pm postman once --shadow >/dev/null 2>&1; local s
  for s in "$@"; do case "$s" in q:*) au_qd 0 "$(sed -n "${s#q:}p" "$T/q-own.txt")";; q=*) au_qd 0 "${s#q=}";; d=*) au_d 0 "${s#d=}";; esac; done
  pm postman once --shadow >/dev/null 2>&1; au --parity; }
br_reason() { br_round "$@" | sed -n 's/^EXTRA .*reason=//p'; }     # the one EXTRA's reason word
HK1_HOLD='HOLD dispatcher: FIX 5 BRIEF-hk-1-docker-cache-check-fix-1.md (task/hk-1-docker-cache-check f21acb67, reviewer A) — lane 5 finished hk-1 and is on a different task; not delivered (one task = one session). Open hold: this (orchestrator-owned).'     # the real 12:49 HOLD's shape (q-own.txt line 3) for the hk-1 record
check "13.2080 a record's OWN queue line is no evidence for its reason (F1 i): the real 20:03 'FIX lane5 BRIEF-hk-1-docker-cache-check-fix-1.md (…; catalogue prose only; branch stays HELD)' through a real --shadow pass, with no other line, is EXTRA reason=? and condition A FAILs on it ('1 EXTRA without a reason', exit 2) — so are the real 12:48 'FIX 1 BRIEF-wtg1-route-fix-1.md (… HELD pending reviewer B …)' and the real 21:46 'MERGETIP 5 task/sm-t4-workspaces-read … HOLD the merge until T3 …', each alone; CONTROL in the same check: each plus one HOLD line naming it → held (a 'HOLD dispatcher: FIX 5 BRIEF-hk-1-… — …; not delivered …' line in the real 12:49 HOLD's shape; the real 12:49 'HOLD dispatcher: FIX 1 BRIEF-wtg1-route-fix-1.md …'; the real 21:47 'HOLD 21:46 MERGETIP 5 task/sm-t4-workspaces-read: NOT delivered …'); and under a Latin-1 locale (LC_ALL=en_US.ISO8859-1: python's default encoding ISO8859-1) the 12:48 line, which holds '⚑', is still read as the record's own line (reason=?)" \
  '{ o="$(br_round q:1)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^EXTRA     .*FIX 5 BRIEF-hk-1-docker-cache-check-fix-1.md task/hk-1-docker-cache-check .*reason=?$" && printf "%s" "$o" | grep -q "^CONDITION A FAIL: matched 0 < 20; 1 EXTRA without a reason (matched 0 = dispatcher pairs 0 + BY-ORCH agreements 0)$" && printf "%s" "$o" | tail -1 | grep -q "extra=1 .*no_reason=1 unpaired=0; condition A not met$" && [ "$(br_reason q:1 "q=$HK1_HOLD")" = held ] && [ "$(br_reason q:2)" = "?" ] && [ "$(export LC_ALL=en_US.ISO8859-1; br_reason q:2)" = "?" ] && [ "$(br_reason q:2 q:3)" = held ] && [ "$(br_reason q:4)" = "?" ] && [ "$(br_reason q:4 q:5)" = held ]'
NODEL_OWN='FIX lane1 BRIEF-hk-1-docker-cache-check-fix-1.md (HK-1 f21acb67, reviewer A: F1 catalogue prose only) (if lane 1 is busy, deliver nothing)'     # reviewer C's probe line (roles/mut-out/revC-pm-323b-selfline-probe.sh): no real NEXT/FIX/MERGETIP line says deliver nothing in its own text
check "13.2081 the same for no-deliver (F1 i): a record whose OWN queue line says '(if lane 1 is busy, deliver nothing)' (reviewer C's probe line; no real queue line says it of itself), through a real --shadow pass, is EXTRA reason=?; CONTROL in the same check: plus one DISPATCH-log line in the real 05:31 'ACK deliver nothing for <branch> (lane N restarted by orchestrator)' shape naming it → no-deliver" \
  '[ "$(br_reason "q=$NODEL_OWN")" = "?" ] && [ "$(br_reason "q=$NODEL_OWN" "d=ACK deliver nothing for hk-1-docker-cache-check (lane 1 restarted by orchestrator)")" = no-deliver ]'
check "13.2082 a name that holds the word is never its own held (F1 ii): the record of the real 20:19 'FIX lane1 BRIEF-hk-6-held-work-shipped-fix-1.md (…)' (a real --shadow pass; its brief names task/hk-6-held-work-shipped) with the real 20:19 'TOOK 20:19 FIX lane1 BRIEF-hk-6-held-work-shipped-fix-1.md (HK-6 e8f561b8): short pointer sent …' (the WHOLE stem, held only inside it) → reason=?, and with the real 20:26 'TOOK→DONE … DONE task/hk-6-held-work-shipped 96f661dc (…, docs/held-work.md only) …' (the branch, and a chunk holding the name's pair held-work) → reason=?; CONTROL in the same check: plus 'HOLD hk-6 FIX 1 (not delivered; orchestrator to restart a lane)' (the real 07:00 HOLD's shape, naming it by ref words) → held, and with the real 20:17 'TOOK→DONE … HK-6 task/hk-6-held-work-shipped e8f561b8: … both HELD' (a LONE HELD, one of the name's words, still counts) → held" \
  '[ "$(br_reason q:6 q:7)" = "?" ] && [ "$(br_reason q:6 q:8)" = "?" ] && [ "$(br_reason q:6 q:7 "d=HOLD hk-6 FIX 1 (not delivered; orchestrator to restart a lane)")" = held ] && [ "$(br_reason q:6 q:9)" = held ]'
check "13.2083 a name's LAST pair is a name too (F1 ii, edge): a MERGETIP 4 record for task/cycle36-hold (a two-word branch whose last word is the phrase; shape of the real ref ctl/cycle36-hold-anchor) with 'TOOK 19:43 MERGETIP 4 task/cycle36-hold: short pointer sent' → reason=?; CONTROL in the same check: plus 'HOLD MERGETIP 4 task/cycle36-hold (not delivered; orchestrator routes tip merges)' (the real 05:56 HOLD's shape) → held: the lone HOLD chunk is no name" \
  '[ "$(br_reason "q=MERGETIP 4 task/cycle36-hold base=release/smoothness" "q=TOOK 19:43 MERGETIP 4 task/cycle36-hold: short pointer sent")" = "?" ] && [ "$(br_reason "q=MERGETIP 4 task/cycle36-hold base=release/smoothness" "q=TOOK 19:43 MERGETIP 4 task/cycle36-hold: short pointer sent" "d=HOLD MERGETIP 4 task/cycle36-hold (not delivered; orchestrator routes tip merges)")" = held ]'
ack_agreed() { # VERB LANE BRIEF BRANCH ACK-TEXT → one shadow record 700 s ago and the BY-ORCH line 600 s ago; prints the tail's agreed count
  au_reset; au_q "$1" "$2" 700 a1 "" "$3" "$4"; au_d 600 "$5"; au --parity | tail -1 | sed -n 's/.* agreed=\([0-9]*\) .*/\1/p'; }
check "13.2084 the ref rule reaches a name's LAST word (F2 C1): 'ACK sm-t4-workspaces-read MERGETIP delivered by orchestrator (lane 5)' agrees with the real 21:46 MERGETIP 5 task/sm-t4-workspaces-read record (no brief: its ref words spell the WHOLE branch name), and 'ACK ux-t11-copy-glossary NEXT delivered by orchestrator (lane 2)' with the real 10:48 NEXT 2 BRIEF-ux-t11-copy-glossary.md (a stem with no -fix-N tail, spelled whole) → agreed=1 each; CONTROL in the same check: 'ACK sm-t4-read MERGETIP …' and 'ACK ux-t11-glossary NEXT …' (no contiguous run) agree with nothing (agreed=0)" \
  '[ "$(ack_agreed MERGETIP 5 "" task/sm-t4-workspaces-read "ACK sm-t4-workspaces-read MERGETIP delivered by orchestrator (lane 5)")" = 1 ] && [ "$(ack_agreed NEXT 2 BRIEF-ux-t11-copy-glossary.md "" "ACK ux-t11-copy-glossary NEXT delivered by orchestrator (lane 2)")" = 1 ] && [ "$(ack_agreed MERGETIP 5 "" task/sm-t4-workspaces-read "ACK sm-t4-read MERGETIP delivered by orchestrator (lane 5)")" = 0 ] && [ "$(ack_agreed NEXT 2 BRIEF-ux-t11-copy-glossary.md "" "ACK ux-t11-glossary NEXT delivered by orchestrator (lane 2)")" = 0 ]'
rf_round() { # LATER → the real 09:11 MERGETIP 1 task/wtg1-stress-output-ignored (2400 s ago) and ONE later queue record 900 s after it: orch = refused 'FIX orchestrator …' (13.1933's shape), lane = a refused FIX 1 (its brief file missing), ok = a bridged FIX 1; prints the parity audit
  au_reset; au_q MERGETIP 1 2400 x1 "" "" task/wtg1-stress-output-ignored
  case "$1" in orch) au_q FIX orchestrator 1500 s2 "target 'orchestrator' is not a lane number (N or laneN)" BRIEF-wtg1-scroll-fix-1.md "";; lane) au_q FIX 1 1500 s2 "brief file 'BRIEF-wtg1-scroll-fix-1.md' not found" BRIEF-wtg1-scroll-fix-1.md "";; ok) au_q FIX 1 1500 s2 "" BRIEF-wtg1-scroll-fix-1.md task/wtg1-scroll;; esac
  au --parity; }
check "13.2085 a REFUSED later queue record never supersedes (F2 C3): the real 09:11 MERGETIP 1 task/wtg1-stress-output-ignored followed 15 min later by a refused 'FIX orchestrator BRIEF-wtg1-scroll-fix-1.md' (13.1933's refused shape) stays reason=? and the audit completes (exit 2, no Traceback); followed by a refused FIX 1 to its OWN lane (the brief file missing) it stays reason=?; CONTROL in the same check: followed by a bridged FIX 1 → superseded" \
  '{ o="$(rf_round orch)"; [ $? = 2 ]; } && ! printf "%s" "$o" | grep -q Traceback && printf "%s" "$o" | grep -q "^EXTRA     .*MERGETIP 1 task/wtg1-stress-output-ignored .*reason=?$" && { o="$(rf_round lane)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^EXTRA     .*MERGETIP 1 task/wtg1-stress-output-ignored .*reason=?$" && { o="$(rf_round ok)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^EXTRA     .*MERGETIP 1 task/wtg1-stress-output-ignored .*reason=superseded$"'
check "13.2086 a lane named BEFORE the verb is no ref word (F2 C4): 'ACK lane 3 T9 FIX 1 delivered by orchestrator' (rule 3 names lane 3; the ref words are t9 once lane 3 is dropped) agrees with a FIX 3 record for the real BRIEF-sm-t9-notes-fix-1.md → agreed=1; CONTROL in the same check: the same line against a FIX 4 record for that brief agrees with nothing (agreed=0)" \
  '[ "$(ack_agreed FIX 3 BRIEF-sm-t9-notes-fix-1.md "" "ACK lane 3 T9 FIX 1 delivered by orchestrator")" = 1 ] && [ "$(ack_agreed FIX 4 BRIEF-sm-t9-notes-fix-1.md "" "ACK lane 3 T9 FIX 1 delivered by orchestrator")" = 0 ]'

# ── parity-ref (planner ruling 2026-10-04 17:54, REQUIRE; 18:57, ref words from BEFORE the verb only): a dispatcher delivery pairs only a record of its
# verb + lane whose ref agrees by the SAME ref_agrees as a BY-ORCH agreement; none agreeing → UNPAIRED ref-mismatch, no ref word with a letter → no-ref ──
# Real lines: roles/DISPATCH-log.md:575 (20:39 on 2026-10-03) and the briefs of roles/QUEUE-dispatch.md:988, 996 (20:21, 20:39), from the 16:59 snapshot
# roles/mut-out/lane3-pm-b6eb-replay/replay/snap; 'FIX 2 toolbar-brd08 delivered, saw echoed' is roles/DISPATCH-log.md 00:23 on 2026-10-02.
HK3=BRIEF-hk-3-domain-em-dashes-fix-1.md; HK3B=BRIEF-hk-3b-client-em-dashes-fix-1.md; HK_DL='dispatcher: delivered HK-3b FIX 1 pointer to lane1'
hk_round() { # LATER-BRIEF|- → the real 20:21 hk-3 FIX lane1 record 1080 s before the real 20:39 delivery, plus (unless -) a FIX lane1 record for LATER-BRIEF at the delivery's time; prints the parity audit
  au_reset; au_q FIX 1 1080 q988 "" "$HK3" task/hk-3-domain-em-dashes; [ "$1" = - ] || au_q FIX 1 0 q996 "" "$1" task/hk-3b-client-em-dashes; au_d 0 "$HK_DL"; au --parity; }
check "13.2240 the HK-3b replay shape: the real 20:39 'dispatcher: delivered HK-3b FIX 1 pointer to lane1' with the real 20:21 hk-3 FIX lane1 record EARLIER in its window and the real hk-3b record later pairs the LATER, ref-agreeing record (MATCHED names ref=hk-3b and the record), and the earlier hk-3 record stays EXTRA; CONTROL in the same check: without the hk-3b record (the second record decides) the delivery pairs nothing: UNPAIRED FIX lane 1 ref=hk-3b reason=ref-mismatch, naming the hk-3 record it would not take" \
  '{ o="$(hk_round "$HK3B")"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^MATCHED   FIX 1 .* ref=hk-3b ~ BRIEF-hk-3b-client-em-dashes-fix-1.md task/hk-3b-client-em-dashes = .*delivered HK-3b FIX 1 pointer to lane1$" && printf "%s" "$o" | grep -q "^EXTRA     00:00 FIX 1 BRIEF-hk-3-domain-em-dashes-fix-1.md task/hk-3-domain-em-dashes " && printf "%s" "$o" | tail -1 | grep -q "matched=1 missed=0 duplicate=0 extra=1 .* unpaired=0;" && { o="$(hk_round -)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^UNPAIRED  FIX lane 1 ref=hk-3b reason=ref-mismatch; same verb + lane in the window, none agreeing: 00:00 BRIEF-hk-3-domain-em-dashes-fix-1.md task/hk-3-domain-em-dashes — .*delivered HK-3b FIX 1 pointer to lane1$" && printf "%s" "$o" | tail -1 | grep -q "matched=0 missed=0 duplicate=0 extra=1 .* unpaired=1;" && ! printf "%s" "$o" | grep -q "^MATCHED"'
sp_round() { # BRIEF BRANCH → the 20-agreement PASS window (pp_build 20), record R = FIX lane1 for BRIEF/BRANCH 1000 s ago, a later FIX lane1 record for the real hk-6 fix-2 brief 950 s ago (R is superseded by it; a 'HOLD hk-6 FIX 2 (not delivered; …)' line holds it), and the real 20:39 HK-3b delivery 900 s ago; prints the parity audit
  pp_build 20; au_q FIX 1 1000 r1 "" "$1" "$2"; au_q FIX 1 950 r2 "" BRIEF-hk-6-held-work-shipped-fix-2.md task/hk-6-held-work-shipped
  au_d 940 "HOLD hk-6 FIX 2 (not delivered; orchestrator to restart a lane)"; au_d 900 "$HK_DL"; au --parity; }
check "13.2241 a wrong pair whose leftover HAS a reason no longer passes condition A: beside the 20-agreement window, the only FIX lane1 records in the HK-3b delivery's window are a wrong-ref hk-3 record (superseded by a later lane-1 record) and that later held hk-6 record → UNPAIRED ref-mismatch, the hk-3 record EXTRA reason=superseded, and CONDITION A FAIL: unpaired 1 (ref-mismatch 1) as the ONLY failing clause, exit 2; CONTROL in the same check: the same record with the right ref (the real hk-3b brief and branch) pairs → CONDITION A PASS (matched 21 = dispatcher pairs 1 + BY-ORCH agreements 20), exit 0" \
  '{ o="$(sp_round "$HK3" task/hk-3-domain-em-dashes)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^UNPAIRED  FIX lane 1 ref=hk-3b reason=ref-mismatch; " && printf "%s" "$o" | grep -q "^EXTRA     .*FIX 1 BRIEF-hk-3-domain-em-dashes-fix-1.md task/hk-3-domain-em-dashes .*reason=superseded$" && printf "%s" "$o" | grep -q "^EXTRA     .*FIX 1 BRIEF-hk-6-held-work-shipped-fix-2.md task/hk-6-held-work-shipped .*reason=held$" && printf "%s" "$o" | grep -q "^CONDITION A FAIL: unpaired 1 (ref-mismatch 1) (matched 20 = dispatcher pairs 0 + BY-ORCH agreements 20)$" && { o="$(sp_round "$HK3B" task/hk-3b-client-em-dashes)"; [ $? = 0 ]; } && printf "%s" "$o" | grep -q "^MATCHED   FIX 1 .* ref=hk-3b ~ BRIEF-hk-3b-client-em-dashes-fix-1.md task/hk-3b-client-em-dashes = " && printf "%s" "$o" | grep -q "^CONDITION A PASS: matched 21 >= 20, missed 0, duplicate 0, unpaired 0, every EXTRA has a reason (held 6) (matched 21 = dispatcher pairs 1 + BY-ORCH agreements 20)$"'
nr_round() { # LINE → the 20-agreement PASS window plus a FIX 2 record for BRIEF-toolbar-brd08-fix-1.md 900 s ago, a 'HOLD toolbar-brd08 FIX 2 (not delivered; …)' line naming it 800 s ago (so an unpaired record keeps a reason and the unpaired clause stands alone) and the DISPATCH-log LINE 600 s ago; prints the parity audit
  pp_build 20; au_q FIX 2 900 n1 "" BRIEF-toolbar-brd08-fix-1.md ""; au_d 800 "HOLD toolbar-brd08 FIX 2 (not delivered; orchestrator to restart a lane)"; au_d 600 "$1"; au --parity; }
NR_OK='dispatcher: delivered toolbar-brd08 FIX 1 pointer to lane2'
check "13.2242 a delivery that names no ref words is UNPAIRED no-ref: the real 10-02 'FIX 2 toolbar-brd08 delivered, saw echoed' (the task named AFTER the verb, the planner's format boundary) beside the 20-agreement window and its FIX 2 toolbar-brd08 record (which a HOLD line names, so the leftover has a reason) → UNPAIRED FIX lane 2 ref=(none) reason=no-ref, the NOTE naming the boundary, CONDITION A FAIL: unpaired 1 (no-ref 1) as the only clause, exit 2; CONTROL in the same check: the same delivery in the 10-03 shape, the ref before the verb ('dispatcher: delivered toolbar-brd08 FIX 1 pointer to lane2'), pairs → CONDITION A PASS, exit 0, no NOTE" \
  '{ o="$(nr_round "FIX 2 toolbar-brd08 delivered, saw echoed")"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^UNPAIRED  FIX lane 2 ref=(none) reason=no-ref; " && printf "%s" "$o" | grep -q "^NOTE      dispatcher lines before 2026-10-03 name the task after the verb and audit as no-ref; run condition A on windows from 10-03 on$" && printf "%s" "$o" | grep -q "^PAIRING   matched 20; unpaired 1 (ref-mismatch 0, no-ref 1); extra 6$" && printf "%s" "$o" | grep -q "^CONDITION A FAIL: unpaired 1 (no-ref 1) (matched 20 = dispatcher pairs 0 + BY-ORCH agreements 20)$" && { o="$(nr_round "$NR_OK")"; [ $? = 0 ]; } && printf "%s" "$o" | grep -q "^MATCHED   FIX 2 .* ref=toolbar-brd08 ~ BRIEF-toolbar-brd08-fix-1.md = " && printf "%s" "$o" | grep -q "^CONDITION A PASS: matched 21 >= 20," && ! printf "%s" "$o" | grep -q "^NOTE"'
ea_round() { # A-SECS B-SECS → two FIX lane1 records that both agree with the real 20:39 HK-3b delivery (0 s ago): the real hk-3b fix-1 brief A s ago and a fix-2 brief B s ago; prints the parity audit
  au_reset; au_q FIX 1 "$1" e1 "" "$HK3B" ""; au_q FIX 1 "$2" e2 "" BRIEF-hk-3b-client-em-dashes-fix-2.md ""; au_d 0 "$HK_DL"; au --parity; }
check "13.2243 two ref-agreeing records in the window: the EARLIEST pairs — fix-1 1200 s before the delivery and fix-2 600 s before it → MATCHED fix-1, fix-2 EXTRA; CONTROL in the same check: the same two records written in the same order with the times swapped → MATCHED fix-2, fix-1 EXTRA (the time decides, not the file order)" \
  '{ o="$(ea_round 1200 600)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^MATCHED   FIX 1 .* ~ BRIEF-hk-3b-client-em-dashes-fix-1.md = " && printf "%s" "$o" | grep -q "^EXTRA     .*BRIEF-hk-3b-client-em-dashes-fix-2.md " && { o="$(ea_round 600 1200)"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^MATCHED   FIX 1 .* ~ BRIEF-hk-3b-client-em-dashes-fix-2.md = " && printf "%s" "$o" | grep -q "^EXTRA     .*BRIEF-hk-3b-client-em-dashes-fix-1.md "'
check "13.2244 the exact form 'HH:MM DELIVERED <VERB> <lane> …' (planner 18:57; 0 live lines): 'DELIVERED FIX 2 BRIEF-toolbar-brd08-fix-1.md' names the brief only AFTER the verb, so its ref words are empty → UNPAIRED FIX lane 2 ref=(none) reason=no-ref and CONDITION A FAIL: unpaired 1 (no-ref 1), exit 2, although the brief is the record's; CONTROL in the same check: the 10-03 shape of the same delivery passes (exit 0)" \
  '{ o="$(nr_round "DELIVERED FIX 2 BRIEF-toolbar-brd08-fix-1.md")"; [ $? = 2 ]; } && printf "%s" "$o" | grep -q "^UNPAIRED  FIX lane 2 ref=(none) reason=no-ref; .*DELIVERED FIX 2 BRIEF-toolbar-brd08-fix-1.md$" && printf "%s" "$o" | grep -q "^CONDITION A FAIL: unpaired 1 (no-ref 1) (" && { nr_round "$NR_OK" >/dev/null; [ $? = 0 ]; }'
pa_round() { # LINE BRIEF → one FIX lane1 record for BRIEF 900 s ago and the DISPATCH-log LINE 600 s ago; prints "matched" or the UNPAIRED reason
  au_reset; au_q FIX 1 900 p1 "" "$2" ""; au_d 600 "$1"; au --parity | sed -n -e "s/^UNPAIRED .* reason=\([a-z-]*\);.*/\1/p" -e "s/^MATCHED .*/matched/p"; }
check "13.2245 ONE ref rule for both pairings (kill c): the dispatcher pair reads its ref words and agrees by the BY-ORCH rule's own functions — a lane named BEFORE the verb is no ref word ('lane1 HK-3b FIX 1 delivered once (queued behind its turn)', the real 'lane4 F-5 FIX 1 delivered once (…)' shape, pairs the hk-3b record), whole words ('delivered T1 FIX 1 pointer to lane1' never pairs BRIEF-sm-t10-notes-fix-1.md: ref-mismatch), a contiguous run ('delivered ctl tipmerge FIX 1 …' never pairs BRIEF-ctl-auto-tipmerge-fix-1.md: ref-mismatch); and postman.py holds ONE def ref_agrees, called from names(), the dispatcher pairing and the BY-ORCH agreement and nowhere else; CONTROL in the same check: 'delivered ctl-auto-tipmerge FIX 1 pointer to lane1' pairs that record" \
  '[ "$(pa_round "lane1 HK-3b FIX 1 delivered once (queued behind its turn)" "$HK3B")" = matched ] && [ "$(pa_round "dispatcher: delivered T1 FIX 1 pointer to lane1" BRIEF-sm-t10-notes-fix-1.md)" = ref-mismatch ] && [ "$(pa_round "dispatcher: delivered ctl tipmerge FIX 1 pointer to lane1" BRIEF-ctl-auto-tipmerge-fix-1.md)" = ref-mismatch ] && [ "$(pa_round "dispatcher: delivered ctl-auto-tipmerge FIX 1 pointer to lane1" BRIEF-ctl-auto-tipmerge-fix-1.md)" = matched ] && [ "$(grep -c "def ref_agrees" "$HERE/postman.py")" = 1 ] && [ "$(grep -o "ref_agrees(" "$HERE/postman.py" | wc -l | tr -d " ")" = 4 ] && [ "$(grep -c "def .*agree" "$HERE/postman.py")" = 1 ]'

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

[ "$fails" -eq 0 ] && { echo "postman tests: all ok"; exit 0; } || { echo "postman tests: $fails FAILED"; exit 1; }
