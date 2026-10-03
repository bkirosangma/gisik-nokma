#!/usr/bin/env bash
# scripts/ctl/test/seats.test.sh — cases 13.1800-13.1824 and 13.2032-13.2034 for `ctl seats`; run by `ctl selftest`.
# Two layers: seats.py is driven over a directory of captured panes (+ their git facts), and the whole verb is driven
# against a fake `tmux` on PATH that serves those panes and logs every call (so "capture-pane only, never send-keys" is
# a measured fact, not a promise). Real captures live in fixtures/seats/ (taken from the live gisik session 2026-10-03
# 01:5x, address masked); the shapes a live session does not hold on demand (text in the box, a ghost suggestion, a
# needs-fresh line) are built here with the same escape sequences.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
PY="$HERE/verbs/seats.py"
FX="$HERE/test/fixtures/seats"
fails=0
check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }
export TZ=UTC
NOW=$(python3 -c 'import calendar;print(calendar.timegm((2026,10,3,2,0,0)))')   # 2026-10-03 02:00 UTC
T=$(cd "$(mktemp -d)" && pwd -P)

# --- builders -------------------------------------------------------------------------------------------------
BAR='────────────────────────────────────────'
# mkpane OUT TRANSCRIPT BOX CTX MODEL FOOTER_MIDDLE [EFFORT] — a Claude Code pane (EFFORT defaults to high; `none` drops the segment, as on the DeepSeek backend): transcript, rule, ❯ box, rule, status line, footer.
mkpane() {
  local out="$1" transcript="$2" box="$3" ctx="$4" model="$5" mid="$6" eff="${7:-high}" seg=""
  [ "$eff" = none ] || seg="effort: $eff | "
  { printf '%s\n' "$transcript"
    printf '\033[38;5;245m%s\n' "$BAR"
    printf '\033[39m❯\xc2\xa0%b\n' "$box"
    printf '\033[38;5;245m%s\n' "$BAR"
    printf '\033[39m  \033[38;5;241muser@example.com | %s | advisor: opus | %sCtx %s%% | session 9%% (resets 6:00am) | weekly 2%% (resets mon 6:30am)\033[39m\n' "$model" "$seg" "$ctx"
    printf '  \033[38;5;241m-- INSERT --\033[39m \033[38;5;131m⏵⏵ bypass permissions on\033[38;5;241m%s · ← for agents\033[39m\n' "$mid"
  } > "$out"
}
# meta DIR IDX NAME MODE [BRANCH HEAD UNPUSHED DIRTY WT] — the facts seats.sh gathers around a pane.
meta() { printf 'name=%s\nmode=%s\nbranch=%s\nhead=%s\nunpushed=%s\ndirty=%s\nwt=%s\n' "$3" "$4" "${5:-}" "${6:-}" "${7:-}" "${8:-}" "${9:-}" > "$1/$2.meta"; }
run() { local d="$1"; shift; CTL_SEATS_NOW="$NOW" python3 "$PY" --dir "$d" "$@"; }
# jv JSON IDX EXPR — evaluate EXPR over the seat object `d` of window IDX.
jv() { printf '%s\n' "$1" | python3 -c 'import sys,json; d=[json.loads(l) for l in sys.stdin if l.startswith("{")]; d=[x for x in d if x["window"]==int(sys.argv[1])][0]; r=eval(sys.argv[2]); print(" ".join(map(str,r)) if isinstance(r,tuple) else r)' "$2" "$3" 2>/dev/null || echo ERR; }
fixture() { local dir; dir=$(mktemp -d "$T/fx.XXXX"); echo "$dir"; }
flagsof() { jv "$(run "$1" --json)" "$2" "\",\".join(d[\"flags\"])"; }
# addpanel FILE N — the background-agent panel Claude Code opens BELOW the footer: "⏺ main", then N agent rows with the
# selection marker ❯ on the LAST one (the marker moves with the cursor; fixtures/seats/agents-panel-ghost.pane is the real shape).
addpanel() { local f="$1" n="$2" i; { printf '\n\033[1m  \xe2\x8f\xba main\033[0m\n'; for i in $(seq 1 "$n"); do
    if [ "$i" = "$n" ]; then printf '\033[38;5;241m\xe2\x9d\xaf \xe2\x97\xaf general-purpose\033[39m  \033[38;5;241mChecking route-shells %s\033[39m\n' "$i"
    else printf '\033[38;5;241m  \xe2\x97\xaf general-purpose\033[39m  \033[38;5;241mChecking route-shells %s\033[39m\n' "$i"; fi; done; } >> "$f"; }

# ============ 1. state: busy / idle, from the real captures ============
d=$(fixture); cp "$FX/busy-sonnet.pane" "$d/2.pane"; meta "$d" 2 exec2 0 task/x abc1234 0 2
J=$(run "$d" --json)
check "13.1800 busy: a spinner line above the box reads busy, with its elapsed time (real capture)" '[ "$(jv "$J" 2 "d[\"state\"]")" = busy ] && [ "$(jv "$J" 2 "d[\"elapsed\"]")" = "3m59s" ]'
check "13.1800 busy: Ctx and model come from the status line" '[ "$(jv "$J" 2 "d[\"ctx\"]")" = 11 ] && [ "$(jv "$J" 2 "d[\"model\"]")" = sonnet-5-5 ]'
check "13.1800 busy: the footer without a background segment is 0 shells, 0 monitors" '[ "$(jv "$J" 2 "d[\"shells\"],d[\"monitors\"]")" = "0 0" ]'
d=$(fixture); cp "$FX/busy-sonnet-tip.pane" "$d/3.pane"; meta "$d" 3 exec3 0
J=$(run "$d" --json)
check "13.1800 busy: a spinner with a Tip line under it is still busy (real capture)" '[ "$(jv "$J" 3 "d[\"state\"]")" = busy ]'
d=$(fixture); cp "$FX/busy-opus-shells.pane" "$d/4.pane"; meta "$d" 4 reviewerA 0
J=$(run "$d" --json)
check "13.1801 counts: \"4 shells, 1 monitor\" in the footer -> 4 and 1; model opus-5-5; Ctx 19 despite the extra \"cutting it close\" segment (real capture)" '[ "$(jv "$J" 4 "d[\"shells\"],d[\"monitors\"],d[\"model\"],d[\"ctx\"]")" = "4 1 opus-5-5 19" ]'
d=$(fixture); cp "$FX/idle-done-sonnet.pane" "$d/8.pane"; meta "$d" 8 dispatcher 0
J=$(run "$d" --json)
check "13.1802 idle: the \"done 1:54 AM\" turn-end line reads idle with that time, 1 monitor (real shape)" '[ "$(jv "$J" 8 "d[\"state\"]")" = idle ] && [ "$(jv "$J" 8 "d[\"done_at\"]")" = "1:54 AM" ] && [ "$(jv "$J" 8 "d[\"monitors\"]")" = 1 ]'
d=$(fixture); cp "$FX/idle-done-opus-bg.pane" "$d/7.pane"; meta "$d" 7 reviewerA 0
J=$(run "$d" --json)
check "13.1802 idle: \"2 shells, 1 monitor\" counted, idle, the turn-end line's own count does not double it (real capture)" '[ "$(jv "$J" 7 "d[\"state\"],d[\"shells\"],d[\"monitors\"]")" = "idle 2 1" ]'
d=$(fixture); mkpane "$d/5.pane" "⏺ done." "" 12 sonnet-5-5 " · 1 shell"; meta "$d" 5 exec5 0
J=$(run "$d" --json)
check "13.1803 counts: the singular \"1 shell\" parses (no monitors segment -> 0)" '[ "$(jv "$J" 5 "d[\"shells\"],d[\"monitors\"]")" = "1 0" ]'
d=$(fixture); mkpane "$d/5.pane" "✢ Misting… (32s · ↓ 2.2k tokens · thought for 1s)" "" 12 haiku-4-5 ""; meta "$d" 5 exec5 0
check "13.1803 busy: a spinner of the \"✢ Misting… (32s\" shape (seconds only) is busy" '[ "$(jv "$(run "$d" --json)" 5 "d[\"state\"],d[\"elapsed\"]")" = "busy 32s" ]'
d=$(fixture); mkpane "$d/5.pane" "$(printf '⏺ ran a test that printed\n  ⎿  Running… (3s of output)\n⏺ all done.')" "" 12 sonnet-5-5 ""; meta "$d" 5 exec5 0
check "13.1803 CONTROL: ellipsis-and-parenthesis text inside tool output is not a spinner (no glyph-verb-… start)" '[ "$(jv "$(run "$d" --json)" 5 "d[\"state\"]")" = idle ]'

# ============ 2. the input box ============
d=$(fixture); mkpane "$d/5.pane" "⏺ ok" "please review the diff" 12 sonnet-5-5 ""; meta "$d" 5 exec5 0
J=$(run "$d" --json)
check "13.1804 box: real text after ❯ -> box text, with the text" '[ "$(jv "$J" 5 "d[\"box\"]")" = text ] && jv "$J" 5 "d[\"box_text\"]" | grep -q "please review the diff"'
d=$(fixture); mkpane "$d/5.pane" "⏺ ok" '\033[2mRead the WHOLE file and then summarise it\033[0m' 12 sonnet-5-5 ""; meta "$d" 5 exec5 0
check "13.1804 box: a dim ghost suggestion is not input (empty)" '[ "$(jv "$(run "$d" --json)" 5 "d[\"box\"]")" = empty ]'
d=$(fixture); mkpane "$d/5.pane" "⏺ ok" '\033[2mRead the WHOLE file and then summarise it' 12 sonnet-5-5 ""; meta "$d" 5 exec5 0
check "13.1804 box: a ghost suggestion with NO closing reset (runs to the line end, measured 2026-10-02) is not input" '[ "$(jv "$(run "$d" --json)" 5 "d[\"box\"]")" = empty ]'
d=$(fixture); mkpane "$d/5.pane" "⏺ ok" 'typed \033[2mghost tail\033[0m' 12 sonnet-5-5 ""; meta "$d" 5 exec5 0
check "13.1804 box: real text followed by a ghost tail keeps only the real part" '[ "$(jv "$(run "$d" --json)" 5 "d[\"box_text\"]")" = typed ]'
d=$(fixture); mkpane "$d/5.pane" "$(printf '❯ an earlier user message echoed in the transcript\n⏺ ok')" "" 12 sonnet-5-5 ""; meta "$d" 5 exec5 0
check "13.1804 CONTROL: a ❯ in the transcript above the box is not the box (the last ❯ is)" '[ "$(jv "$(run "$d" --json)" 5 "d[\"box\"]")" = empty ]'
d=$(fixture); mkpane "$d/5.pane" "⏺ ok" "" 12 sonnet-5-5 ""; meta "$d" 5 exec5 1
J=$(run "$d" --json)
check "13.1805 copy-mode: pane_in_mode=1 reads copy_mode true, and the state is unknown (a scrolled view hides the spinner)" '[ "$(jv "$J" 5 "d[\"copy_mode\"],d[\"state\"]")" = "True unknown" ]'

# ---- the background-agent panel (13.1820): its selected row's ❯ sits BELOW the footer and is not the input box ----
d=$(fixture); cp "$FX/agents-panel-ghost.pane" "$d/6.pane"; meta "$d" 6 planner 0
J=$(run "$d" --json)
check "13.1820 panel: the REAL capture (panel open, selection on an agent row) reads box empty, no box-text flag, and still busy from the spinner (live gisik:6 flagged box-text)" '[ "$(jv "$J" 6 "d[\"box\"],d[\"state\"],d[\"elapsed\"]")" = "empty busy 6s" ] && ! flagsof "$d" 6 | grep -q box-text'
d=$(fixture); python3 -c 'import sys;s=open(sys.argv[1],encoding="utf-8").read();s=s.replace("\u276f\xa0\x1b[39m","\u276f\xa0\x1b[39m\x1b[2mok keep going\x1b[0m",1);open(sys.argv[2],"w",encoding="utf-8").write(s)' "$FX/agents-panel-ghost.pane" "$d/6.pane"; meta "$d" 6 planner 0
check "13.1820 panel: a dim ghost suggestion in the real box (panel open) is still not input" '[ "$(jv "$(run "$d" --json)" 6 "d[\"box\"]")" = empty ]'
d=$(fixture); mkpane "$d/6.pane" "✢ Misting… (32s · ↓ 2k tokens)" "" 12 sonnet-5-5 ""; addpanel "$d/6.pane" 12; meta "$d" 6 planner 0
check "13.1820 panel: a spinner above the real box is read with 12 agent rows below the footer (the window anchors on the real box, not on the panel's ❯)" '[ "$(jv "$(run "$d" --json)" 6 "d[\"state\"],d[\"elapsed\"],d[\"box\"]")" = "busy 32s empty" ]'
d=$(fixture); mkpane "$d/6.pane" "⏺ x" "" 12 sonnet-5-5 " · esc to interrupt"; addpanel "$d/6.pane" 12; meta "$d" 6 planner 0
check "13.1820 panel: \"esc to interrupt\" in the footer is read with 12 agent rows below it" '[ "$(jv "$(run "$d" --json)" 6 "d[\"state\"]")" = busy ]'
d=$(fixture); mkpane "$d/6.pane" "⏺ x" "please review the diff" 12 sonnet-5-5 ""; addpanel "$d/6.pane" 12; meta "$d" 6 planner 0
check "13.1820 CONTROL: real text typed in the box with the panel open is still box text, and it is the typed text" '[ "$(jv "$(run "$d" --json)" 6 "d[\"box\"],d[\"box_text\"]")" = "text please review the diff" ]'
d=$(fixture); mkpane "$d/6.pane" "⏺ x" "typed words" 12 sonnet-5-5 ""; grep -v "Ctx " "$d/6.pane" > "$d/6.tmp" && mv "$d/6.tmp" "$d/6.pane"; addpanel "$d/6.pane" 3; meta "$d" 6 planner 0
check "13.1820 panel: with NO status line in the capture, the ❯ above a ─ rule still beats a later ❯ row" '[ "$(jv "$(run "$d" --json)" 6 "d[\"box_text\"]")" = "typed words" ]'
d=$(fixture); printf '❯ an earlier message\n⏺ ok\n❯ real box text\n' > "$d/6.pane"; meta "$d" 6 planner 0
check "13.1820 CONTROL: with no status line and no rule, the LAST ❯ is the box (not an echoed message above)" '[ "$(jv "$(run "$d" --json)" 6 "d[\"box_text\"]")" = "real box text" ]'
d=$(fixture); mkpane "$d/6.pane" "⏺ x" 'a long wrapped first line\n  and its second line' 12 sonnet-5-5 ""; addpanel "$d/6.pane" 12; printf '  \xe2\x97\xaf general-purpose  grep one | two\n' >> "$d/6.pane"; meta "$d" 6 planner 0
check "13.1820 panel: a box that wraps onto a second line (no rule right under its ❯) with 12 agent rows below, the last holding a \" | \", still reads the box's own line" '[ "$(jv "$(run "$d" --json)" 6 "d[\"box_text\"]")" = "a long wrapped first line" ]'
d=$(fixture); mkpane "$d/6.pane" "⏺ x" "" 12 sonnet-5-5 ""; addpanel "$d/6.pane" 12; meta "$d" 6 planner 0
check "13.1820 CONTROL: a panel alone makes an idle seat neither busy nor box-text" '[ "$(jv "$(run "$d" --json)" 6 "d[\"state\"],d[\"box\"]")" = "idle empty" ]'

# ---- a `ctl seats` text line in the scrollback (13.1824): the status line is the LAST one that looks like it ----
# The controller runs `ctl seats` in its own pane, so a line `gisik:2 exec2 lane | idle … | Ctx 11% sonnet-5-5 | …` sits ABOVE the real
# transcript, box and status line, and matches `Ctx N%` + `|`. Taking the first match would read ctx 11 / sonnet and bound the box search above the box.
SCROLL='gisik:2 exec2 lane | idle | sh 0 mon 0 | box empty | Ctx 11% sonnet-5-5 | task/x clean | last: none'
d=$(fixture); mkpane "$d/6.pane" "$SCROLL
⏺ working on it" "typed words" 27 opus-5-5 ""; meta "$d" 6 planner 0
d2=$(fixture); mkpane "$d2/6.pane" "⏺ working on it" "typed words" 27 opus-5-5 ""; meta "$d2" 6 planner 0
check "13.1824 scrollback: a ctl-seats line (Ctx 11% sonnet) above the real status line (Ctx 27% opus) — ctx, model and the typed box text come from the REAL ones; CONTROL: the same pane without that line reads the same" '[ "$(jv "$(run "$d" --json)" 6 "d[\"ctx\"],d[\"model\"],d[\"box\"],d[\"box_text\"]")" = "27 opus-5-5 text typed words" ] && [ "$(jv "$(run "$d2" --json)" 6 "d[\"ctx\"],d[\"model\"],d[\"box\"],d[\"box_text\"]")" = "27 opus-5-5 text typed words" ]'

# ============ 3. last DONE / CHECKPOINT / needs fresh session ============
repo="$T/repo"; mkdir -p "$repo"; ( cd "$repo" && git init -q . && GIT_AUTHOR_DATE=2026-10-03T01:48:00Z GIT_COMMITTER_DATE=2026-10-03T01:48:00Z git -c user.name=t -c user.email=t@t commit -q --allow-empty -m one )
sha=$(git -C "$repo" rev-parse HEAD)
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ CHECKPOINT task/ctl-seats %s step 1/3\n⏺ working on step 2' "$sha")" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0 task/ctl-seats "${sha:0:7}" 0 0 "$repo"
J=$(run "$d" --json)
check "13.1806 last: a CHECKPOINT line is found, kind and text kept" '[ "$(jv "$J" 2 "d[\"last\"][\"kind\"]")" = CHECKPOINT ] && jv "$J" 2 "d[\"last\"][\"text\"]" | grep -q "step 1/3"'
check "13.1806 last: its age is the checkpointed commit time (01:48 -> 02:00 = 720 s)" '[ "$(jv "$J" 2 "d[\"last\"][\"age_s\"]")" = 720 ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ CHECKPOINT task/ctl-seats %s step 1/3\n⏺ DONE task/ctl-seats %s\n⏺ more' "$sha" "$sha")" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0 "" "" "" "" "$repo"
check "13.1806 last: the LAST of several signal lines wins (DONE after CHECKPOINT)" '[ "$(jv "$(run "$d" --json)" 2 "d[\"last\"][\"kind\"]")" = DONE ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ needs fresh session at step 3\n')" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0
J=$(run "$d" --json)
check "13.1807 needs-fresh: \"needs fresh session at step 3\" is a signal of kind needs-fresh" '[ "$(jv "$J" 2 "d[\"last\"][\"kind\"]")" = needs-fresh ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ read the brief\nCHECKPOINT task/<branch> <sha40> step <n>/<N>\n"needs fresh session at step <n+1>"')" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0
check "13.1807 CONTROL: a line that STARTS with the brief template text (CHECKPOINT task/<branch> <sha40>; \"needs fresh session at step <n+1>\") is not a signal" '[ "$(jv "$(run "$d" --json)" 2 "d[\"last\"]")" = None ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ Monitor event: QUEUE-dispatch +1 lines: DONE task/ctl-seats %s' "$sha")" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0
check "13.1807 CONTROL: a DONE quoted inside a monitor event line (not at the start of the line) is not the seat's own signal" '[ "$(jv "$(run "$d" --json)" 2 "d[\"last\"]")" = None ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ CHECKPOINT task/ctl-seats 0123456789abcdef0123456789abcdef01234567 step 1/3\n✻ Sautéed for 1s · done 1:53 AM\n⏺ next')" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0
check "13.1808 last: a sha the worktree does not know falls back to the next turn-end stamp (done 1:53 AM -> 7 min)" '[ "$(jv "$(run "$d" --json)" 2 "d[\"last\"][\"age_s\"]")" = 420 ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ needs fresh session at step 2\n⏺ a long reply')" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0
check "13.1808 last: with neither a known sha nor a later stamp the age is null (shown as ?)" '[ "$(jv "$(run "$d" --json)" 2 "d[\"last\"][\"age_s\"]")" = None ] && run "$d" | grep -q "needs-fresh.*(? ago)"'

# ---- protocol lines from MSG-no-midtask-seats (13.1821) ----
d=$(fixture); mkpane "$d/9.pane" "$(printf '  CHECKPOINT reviewer idle after task/ctl-run-tests fe844305')" "" 12 opus-5-5 " · 1 monitor"; meta "$d" 9 reviewerB 0
J=$(run "$d" --json)
check "13.1821 last: a reviewer's \"CHECKPOINT reviewer idle after task/<b> <sha8>\" is a CHECKPOINT signal (live gisik:9 read last: none)" '[ "$(jv "$J" 9 "d[\"last\"][\"kind\"]")" = CHECKPOINT ] && run "$d" | grep -q "last: CHECKPOINT reviewer idle after task/ctl-run-tests fe844305"'
d=$(fixture); mkpane "$d/9.pane" "$(printf '⏺ CHECKPOINT reviewer idle after <branch> <sha8>')" "" 12 opus-5-5 " · 1 monitor"; meta "$d" 9 reviewerB 0
check "13.1821 CONTROL: the reviewer TEMPLATE (CHECKPOINT reviewer idle after <branch> <sha8>, no hex sha) is not a signal" '[ "$(jv "$(run "$d" --json)" 9 "d[\"last\"]")" = None ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ needs fresh FIX session')" "" 12 sonnet-5-5 " · 1 shell"; meta "$d" 2 exec2 0
check "13.1821 needs-fresh: a lane's \"needs fresh FIX session\" is kind needs-fresh, flagged needs-fresh-session, and shown on the line" '[ "$(jv "$(run "$d" --json)" 2 "d[\"last\"][\"kind\"]")" = needs-fresh ] && [ "$(flagsof "$d" 2)" = needs-fresh-session ] && run "$d" | grep -q "last: needs-fresh FIX session"'
d=$(fixture); mkpane "$d/2.pane" "$(printf '%s' '"needs fresh FIX session" is the line to print')" "" 12 sonnet-5-5 " · 1 shell"; meta "$d" 2 exec2 0
check "13.1821 CONTROL: a QUOTED \"needs fresh FIX session\" at the start of a line (a brief quoting the protocol) is not a signal" '[ "$(jv "$(run "$d" --json)" 2 "d[\"last\"]")" = None ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ CHECKPOINT task/x %s DONE' "$sha")" "" 12 sonnet-5-5 " · 1 monitor"; meta "$d" 2 exec2 0 "" "" "" "" "$repo"
check "13.1821 final checkpoint: a lane's \"CHECKPOINT task/<b> <sha> DONE\" counts as DONE — idle-no-task even with a monitor armed (as 13.1811's DONE)" '[ "$(jv "$(run "$d" --json)" 2 "d[\"last\"][\"kind\"]")" = DONE ] && [ "$(flagsof "$d" 2)" = idle-no-task ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ CHECKPOINT task/x %s step 2/3' "$sha")" "" 12 sonnet-5-5 " · 1 monitor"; meta "$d" 2 exec2 0 "" "" "" "" "$repo"
check "13.1821 CONTROL: a STEP checkpoint (step 2/3) is not DONE — kind CHECKPOINT, and a lane waiting on its monitor is not flagged" '[ "$(jv "$(run "$d" --json)" 2 "d[\"last\"][\"kind\"]")" = CHECKPOINT ] && [ "$(flagsof "$d" 2)" = "" ]'
# a stamp later than now belongs to yesterday: now 00:05, "done 11:58 PM" is 7 minutes old (13.1822)
NOW_MIDNIGHT=$(python3 -c 'import calendar;print(calendar.timegm((2026,10,3,0,5,0)))')
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ CHECKPOINT task/ctl-seats 0123456789abcdef0123456789abcdef01234567 step 1/3\n✻ Sautéed for 1s · done 11:58 PM\n⏺ next')" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0
check "13.1822 last: a turn-end stamp later than now is yesterday's (now 00:05, done 11:58 PM -> 7 min)" '[ "$(CTL_SEATS_NOW="$NOW_MIDNIGHT" python3 "$PY" --dir "$d" --json | python3 -c "import sys,json; print(json.loads(sys.stdin.readline())[\"last\"][\"age_s\"])")" = 420 ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ CHECKPOINT task/ctl-seats 0123456789abcdef0123456789abcdef01234567 step 1/3\n✻ Sautéed for 1s · done 12:03 AM\n⏺ next')" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0
check "13.1822 CONTROL: a stamp earlier than now stays today (now 00:05, done 12:03 AM -> 2 min, not 24 h)" '[ "$(CTL_SEATS_NOW="$NOW_MIDNIGHT" python3 "$PY" --dir "$d" --json | python3 -c "import sys,json; print(json.loads(sys.stdin.readline())[\"last\"][\"age_s\"])")" = 120 ]'

# ============ 4. roles and the text line ============
d=$(fixture)
i=0; for n in main exec1 planner reviewerA reviewerC dispatcher scratch; do i=$((i+1)); cp "$FX/idle-done-sonnet.pane" "$d/$i.pane"; meta "$d" $i $n 0; done
J=$(run "$d" --json)
check "13.1809 roles: main -> controller, exec* -> lane, planner, reviewer*, dispatcher, anything else -> other" '[ "$(for i in 1 2 3 4 5 6 7; do jv "$J" $i "d[\"role\"]"; done | tr "\n" " ")" = "controller lane planner reviewer reviewer dispatcher other " ]'
d=$(fixture); cp "$FX/busy-sonnet.pane" "$d/2.pane"; meta "$d" 2 exec2 0 task/x abc1234 3 2
check "13.1810 text line: one line per seat — window, name, role | state | sh/mon | box | Ctx model/effort | branch@head unpushed dirty | last" '[ "$(run "$d" | head -1)" = "gisik:2 exec2 lane | busy 3m59s | sh 0 mon 0 | box empty | Ctx 11% sonnet-5-5/high | task/x@abc1234 unpushed 3 dirty 2 | last: none" ]'
d=$(fixture); mkpane "$d/2.pane" "⏺ x" "hello" 12 sonnet-5-5 " · 1 shell"; meta "$d" 2 exec2 1 task/x abc1234 0 0
check "13.1810 text line: copy mode is in the STATE field (| unknown copy-mode |) and box text is visible" 'run "$d" | head -1 | grep -q "| unknown copy-mode |" && run "$d" | head -1 | grep -q "box text: hello"'
d2=$(fixture); mkpane "$d2/2.pane" "⏺ x" "" 12 sonnet-5-5 " · 2 shells, 1 monitor"; meta "$d2" 2 exec2 0
check "13.1810 text line: shells before monitors, with different counts (sh 2 mon 1 — a swap reads sh 1 mon 2)" 'run "$d2" | head -1 | grep -q "| sh 2 mon 1 |"'
check "13.1810 the last line of the output is one OK summary naming the seat count" 'run "$d" | tail -1 | grep -q "^OK seats 1 window"'
check "13.1810 --json: one object per line, the summary line goes to stderr and not into the stream" 'out=$(run "$d" --json 2>/dev/null); [ "$(printf "%s\n" "$out" | grep -vc "^{")" = 0 ] && run "$d" --json 2>&1 >/dev/null | grep -q "^OK seats"'

# ============ 5. --flag: only the seats that need action ============
d=$(fixture); mkpane "$d/2.pane" "⏺ x" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0
check "13.1811 flag: a lane idle with no shell and no monitor is idle-no-task" '[ "$(flagsof "$d" 2)" = idle-no-task ]'
d=$(fixture); mkpane "$d/2.pane" "⏺ x" "" 12 sonnet-5-5 " · 1 shell"; meta "$d" 2 exec2 0
check "13.1811 CONTROL: the same lane idle but with a background shell running is waiting, not flagged" '[ "$(flagsof "$d" 2)" = "" ]'
d=$(fixture); mkpane "$d/2.pane" "✢ Misting… (32s · ↓ 2k tokens)" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0
check "13.1811 CONTROL: a busy lane is never idle-no-task" '[ "$(flagsof "$d" 2)" = "" ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ DONE task/x %s' "$sha")" "" 12 sonnet-5-5 " · 1 monitor"; meta "$d" 2 exec2 0 "" "" "" "" "$repo"
check "13.1811 flag: a lane idle after its DONE is idle-no-task even with a monitor still armed" '[ "$(flagsof "$d" 2)" = idle-no-task ]'
d=$(fixture); mkpane "$d/7.pane" "⏺ x" "" 12 opus-5-5 ""; meta "$d" 7 reviewerA 0
check "13.1812 flag: a coordinator idle with nothing armed is idle-no-watch (its watcher died)" '[ "$(flagsof "$d" 7)" = idle-no-watch ]'
d=$(fixture); mkpane "$d/7.pane" "⏺ x" "" 12 opus-5-5 " · 1 monitor"; meta "$d" 7 reviewerA 0
check "13.1812 CONTROL: the same coordinator with a monitor armed is quiet" '[ "$(flagsof "$d" 7)" = "" ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ CHECKPOINT task/x %s step 1/3' "$sha")" "" 25 sonnet-5-5 ""; meta "$d" 2 exec2 0 "" "" "" "" "$repo"
check "13.1813 flag: Ctx 25% idle at a CHECKPOINT is ctx>20%-at-boundary (plus idle-no-task)" 'f=$(flagsof "$d" 2); printf "%s" "$f" | grep -q "ctx>20%-at-boundary"'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ CHECKPOINT task/x %s step 1/3' "$sha")" "" 20 sonnet-5-5 " · 1 shell"; meta "$d" 2 exec2 0 "" "" "" "" "$repo"
check "13.1813 CONTROL: Ctx exactly 20% at a boundary is not over the line" '[ "$(flagsof "$d" 2)" = "" ]'
d=$(fixture); mkpane "$d/2.pane" "✢ Misting… (32s · ↓ 2k tokens)" "" 31 sonnet-5-5 ""; meta "$d" 2 exec2 0
check "13.1813 flag: Ctx 31% while a step is running is ctx>30%-mid-step (the sizing miss of plan #18)" '[ "$(flagsof "$d" 2)" = "ctx>30%-mid-step" ]'
d=$(fixture); mkpane "$d/2.pane" "✢ Misting… (32s · ↓ 2k tokens)" "" 30 sonnet-5-5 ""; meta "$d" 2 exec2 0
check "13.1813 CONTROL: Ctx exactly 30% mid-step is not flagged" '[ "$(flagsof "$d" 2)" = "" ]'
d=$(fixture); mkpane "$d/7.pane" "⏺ x" "" 21 opus-5-5 " · 1 monitor"; meta "$d" 7 reviewerA 0
check "13.1813 flag: a coordinator idle (its quiet point) over 20% is ctx>20%-at-boundary" '[ "$(flagsof "$d" 7)" = "ctx>20%-at-boundary" ]'
d=$(fixture); mkpane "$d/2.pane" "✢ Misting… (3s · ↓ 2k tokens)" "half-typed" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0
check "13.1814 flag: text sitting in the box is box-text, busy or not" '[ "$(flagsof "$d" 2)" = box-text ]'
d=$(fixture); mkpane "$d/2.pane" "✢ Misting… (3s · ↓ 2k tokens)" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 1
check "13.1814 flag: copy-mode is copy-mode" '[ "$(flagsof "$d" 2)" = copy-mode ]'
d=$(fixture); printf '$ \n' > "$d/2.pane"; meta "$d" 2 exec2 0
check "13.1814 flag: a pane with no Claude status line (a bare shell) is no-claude" '[ "$(flagsof "$d" 2)" = no-claude ]'
d=$(fixture); mkpane "$d/2.pane" "$(printf '⏺ needs fresh session at step 3')" "" 12 sonnet-5-5 " · 1 shell"; meta "$d" 2 exec2 0
check "13.1814 flag: a needs-fresh line is needs-fresh-session" '[ "$(flagsof "$d" 2)" = needs-fresh-session ]'
d=$(fixture); mkpane "$d/2.pane" "⏺ x" "" 12 sonnet-5-5 ""; meta "$d" 2 exec2 0
mkpane "$d/3.pane" "✢ Misting… (3s · ↓ 2k tokens)" "" 12 sonnet-5-5 ""; meta "$d" 3 exec3 0
mkpane "$d/4.pane" "✢ Misting… (3s · ↓ 2k tokens)" "" 12 sonnet-5-5 ""; meta "$d" 4 exec4 0
out=$(run "$d" --flag)
check "13.1815 --flag prints only the flagged seat, with its reason, then a summary of N flagged of M" '[ "$(printf "%s\n" "$out" | grep -c "^gisik:")" = 1 ] && printf "%s\n" "$out" | grep "^gisik:" | grep -q "^gisik:2 .*FLAG idle-no-task" && printf "%s\n" "$out" | tail -1 | grep -q "^OK seats 1 flagged of 3"'
d=$(fixture); mkpane "$d/3.pane" "✢ Misting… (3s · ↓ 2k tokens)" "" 12 sonnet-5-5 ""; meta "$d" 3 exec3 0
check "13.1815 --flag with nothing to flag prints no seat lines and exits 0" 'out=$(run "$d" --flag); [ $? -eq 0 ] && [ "$(printf "%s\n" "$out" | grep -c "^gisik:")" = 0 ] && printf "%s\n" "$out" | tail -1 | grep -q "^OK seats 0 flagged of 1"'
mkpane "$d/6.pane" "⏺ x" "" 12 opus-5-5 ""; meta "$d" 6 dispatcher 0
check "13.1815 --flag --json prints the flagged seat objects only (window 6 of 2)" 'out=$(run "$d" --flag --json 2>/dev/null); [ "$(printf "%s\n" "$out" | grep -c "^{")" = 1 ] && [ "$(jv "$out" 6 "d[\"flags\"][0]")" = idle-no-watch ]'

# ============ 6. the whole verb, against a fake tmux ============
# A bare repo + a worktree-like checkout: the branch tracks the RELEASE branch (the way a task branch is cut), pushed to origin/<branch>.
bare="$T/origin.git"; git init -q --bare "$bare"; co="$T/co"; git init -q "$co"
( cd "$co" && git config user.name t && git config user.email t@t && git remote add origin "$bare" && git commit -q --allow-empty -m base && git branch -M release/x && git push -q origin release/x \
  && git switch -q -c task/y && git commit -q --allow-empty -m a && git push -q origin task/y && git branch -q --set-upstream-to=origin/release/x task/y && git commit -q --allow-empty -m b && echo dirt > f1 && echo dirt > f2 )
head7=$(git -C "$co" rev-parse --short HEAD)
fk="$T/fakebin"; mkdir -p "$fk"; cat > "$fk/tmux" <<'FAKE'
#!/usr/bin/env bash
# fake tmux for seats.test.sh: serves $FAKE_PANES/<idx>.pane, $FAKE_WINDOWS (idx name mode path per line); logs every call.
printf '%s\n' "$*" >> "$FAKE_DIR/calls"
case "$1" in
  has-session) exit 0;;
  list-windows) while read -r i n m p; do printf '%s\t%s\t%s\t%s\n' "$i" "$n" "$m" "$p"; done < "$FAKE_WINDOWS";;
  capture-pane) t=""; e=""; while [ $# -gt 0 ]; do case "$1" in -t) t="$2"; shift 2;; -e) e=1; shift;; *) shift;; esac; done
    i="${t#gisik:}"; if [ -n "$e" ]; then cat "$FAKE_PANES/$i.pane"; else sed $'s/\033\\[[0-9;]*m//g' "$FAKE_PANES/$i.pane"; fi;;
  display-message) t=""; while [ $# -gt 0 ]; do case "$1" in -t) t="$2"; shift 2;; *) fmt="$1"; shift;; esac; done
    i="${t#gisik:}"; case "$fmt" in *pane_in_mode*) awk -v w="$i" '$1==w{print $3}' "$FAKE_WINDOWS";; *pane_current_path*) awk -v w="$i" '$1==w{print $4}' "$FAKE_WINDOWS";; esac;;
  *) exit 0;;
esac
FAKE
chmod +x "$fk/tmux"
fd="$T/fake"; mkdir -p "$fd/panes"; : > "$fd/calls"
cp "$FX/busy-sonnet.pane" "$fd/panes/1.pane"; cp "$FX/idle-done-sonnet.pane" "$fd/panes/2.pane"
printf '1 exec1 0 %s\n2 reviewerA 0 %s\n' "$co" "$T" > "$fd/windows"
vrun() { FAKE_DIR="$fd" FAKE_PANES="$fd/panes" FAKE_WINDOWS="$fd/windows" PATH="$fk:$PATH" CTL_LOG_DIR="$T/logs" "$HERE/ctl" seats "$@"; }
out=$(vrun --json 2>&1)
check "13.1816 verb: a window per line in window order, the worktree's branch and short head" '[ "$(jv "$out" 1 "d[\"branch\"],d[\"head\"]")" = "task/y $head7" ]'
check "13.1816 verb: unpushed counts against origin/<branch> (1: commit b), not the upstream release branch (which would say 2)" '[ "$(jv "$out" 1 "d[\"unpushed\"]")" = 1 ]'
check "13.1816 verb: dirty counts the changed files (2 untracked)" '[ "$(jv "$out" 1 "d[\"dirty\"]")" = 2 ]'
check "13.1816 verb: a window whose directory is not a git worktree has no branch facts (null), and the line still prints" '[ "$(jv "$out" 2 "d[\"branch\"]")" = None ] && vrun | grep -q "^gisik:2 reviewerA reviewer "'
check "13.1816 verb: unpushed with no origin/<branch> counts commits on no origin ref at all (b and c = 2)" '( cd "$co" && git switch -q -c task/z && git commit -q --allow-empty -m c ); o=$(vrun --json 2>&1); r=$(jv "$o" 1 "d[\"unpushed\"]"); ( cd "$co" && git switch -q task/y ); [ "$r" = 2 ]'
check "13.1817 read-only: the verb called tmux with has-session, list-windows and capture-pane ONLY (the set is exact: no send-keys, paste-buffer, load-buffer, kill-window, display-message)" '[ "$(awk "{print \$1}" "$fd/calls" | sort -u | tr "\n" " ")" = "capture-pane has-session list-windows " ]'
check "13.1817 read-only: the verb ran and did not change the checkout (same dirty files, same HEAD)" '[ "$(jv "$out" 1 "d[\"dirty\"]")" = 2 ] && [ "$(git -C "$co" status --porcelain | wc -l | tr -d " ")" = 2 ] && [ "$(git -C "$co" rev-parse --short HEAD)" = "$head7" ]'
check "13.1818 --dry-run touches no tmux at all and exits OK" ': > "$fd/calls"; o=$(vrun --dry-run 2>&1); [ $? -eq 0 ] && printf "%s" "$o" | tail -1 | grep -q "^OK seats dry-run" && [ ! -s "$fd/calls" ]'
# 13 windows, all in the same worktree, timed (the budget is 2 s; the real run is quoted in DONE).
: > "$fd/windows"; for i in $(seq 1 13); do cp "$FX/busy-sonnet.pane" "$fd/panes/$i.pane"; printf '%s exec%s 0 %s\n' "$i" "$i" "$co" >> "$fd/windows"; done
s=$(python3 -c 'import time;print(time.time())'); n13=$(vrun --json 2>/dev/null | grep -c "^{"); e=$(python3 -c 'import time;print(time.time())')
check "13.1816 verb: windows print in NUMERIC order (2 before 10, 10-13 after 9 — a text sort puts 10 before 2)" '[ "$(vrun --json 2>/dev/null | python3 -c "import sys,json; print(\" \".join(str(json.loads(l)[\"window\"]) for l in sys.stdin if l.startswith(\"{\")))")" = "1 2 3 4 5 6 7 8 9 10 11 12 13" ] && [ "$(vrun 2>/dev/null | grep -o "^gisik:[0-9]*" | tr "\n" " ")" = "gisik:1 gisik:2 gisik:3 gisik:4 gisik:5 gisik:6 gisik:7 gisik:8 gisik:9 gisik:10 gisik:11 gisik:12 gisik:13 " ]'
check "13.1819 speed: 13 windows in under 2 s through the fake tmux" '[ "$n13" = 13 ] && python3 -c "import sys; sys.exit(0 if $e - $s < 2.0 else 1)"'
# parity with lib.sh: the box this verb reads is the box ctl_box_text reads, on every box variant used above.
check "13.1819 parity: seats.py and ctl_box_text agree on real text, a closed ghost, an unclosed ghost, real+ghost, the agent-panel shape (empty box; typed text) and a ctl-seats line in the scrollback" 'ok=1
  for variant in "plain words" "\\033[2mghost\\033[0m" "\\033[2munclosed ghost" "real \\033[2mghost\\033[0m" ""; do
    pd=$(fixture); mkpane "$pd/1.pane" "⏺ x" "$variant" 12 sonnet-5-5 ""; meta "$pd" 1 exec1 0
    want=$(FAKE_DIR="$fd" FAKE_PANES="$pd" FAKE_WINDOWS="$fd/windows" PATH="$fk:$PATH" bash -c ". \"$HERE/lib.sh\"; ctl_box_text gisik:1")
    got=$(jv "$(run "$pd" --json)" 1 "d[\"box_text\"]")
    [ "$want" = "$got" ] || { ok=0; echo "    variant [$variant]: ctl_box_text=[$want] seats=[$got]"; }
  done
  pd=$(fixture); cp "$FX/agents-panel-ghost.pane" "$pd/1.pane"; meta "$pd" 1 exec1 0
  pd2=$(fixture); mkpane "$pd2/1.pane" "⏺ x" "typed words" 12 sonnet-5-5 ""; addpanel "$pd2/1.pane" 12; meta "$pd2" 1 exec1 0
  pd3=$(fixture); mkpane "$pd3/1.pane" "gisik:2 exec2 lane | idle | Ctx 11% sonnet-5-5 | x
⏺ x" "typed words" 27 opus-5-5 ""; meta "$pd3" 1 exec1 0   # a ctl-seats line in the scrollback (13.1824)
  for pdir in "$pd" "$pd2" "$pd3"; do   # the panel shape: the selected agent row below the footer is not the box; the scrollback shape: the last status line is
    want=$(FAKE_DIR="$fd" FAKE_PANES="$pdir" FAKE_WINDOWS="$fd/windows" PATH="$fk:$PATH" bash -c ". \"$HERE/lib.sh\"; ctl_box_text gisik:1")
    got=$(jv "$(run "$pdir" --json)" 1 "d[\"box_text\"]")
    [ "$want" = "$got" ] || { ok=0; echo "    panel [$pdir]: ctl_box_text=[$want] seats=[$got]"; }
  done
  [ $ok = 1 ]'
# ============ 13.2032-13.2034: the effort the status line shows (`ctl restart --effort`, owner 2026-10-04) ============
# statusline-command.sh writes an "effort: <level>" segment; the real captures all carry "effort: high", so every other level is built here.
levels_ok() { local e d2; for e in xhigh max medium low; do d2=$(fixture); mkpane "$d2/2.pane" "⏺ ok" "" 12 sonnet-5-5 "" "$e"; meta "$d2" 2 exec2 0; [ "$(effort_of "$d2" 2)" = "$e" ] || return 1; done; }
effort_of() { jv "$(run "$1" --json)" "$2" 'd["effort"]'; }
d=$(fixture); cp "$FX/busy-sonnet.pane" "$d/2.pane"; meta "$d" 2 exec2 0
check "13.2032 effort: read from the status line's own \"effort: <level>\" segment — high from the real capture; xhigh, max, medium, low from built panes (a parser fixed on \"high\" is red); CONTROL in the same check: the model beside it is still read (sonnet-5-5)" \
  '[ "$(effort_of "$d" 2)" = high ] && [ "$(jv "$(run "$d" --json)" 2 "d[\"model\"]")" = sonnet-5-5 ] && levels_ok'
d=$(fixture); mkpane "$d/2.pane" "⏺ ok" "" 12 sonnet-5-5 "" none; meta "$d" 2 exec2 0 task/x abc1234 0 0
d2=$(fixture); mkpane "$d2/2.pane" "⏺ ok" "" 12 sonnet-5-5 "" medium; meta "$d2" 2 exec2 0 task/x abc1234 0 0
check "13.2033 no effort segment (the DeepSeek backend sends none): effort is null in --json and the text line reads \"sonnet-5-5/?\" — never a guessed level; CONTROL in the same check: the same pane with \"effort: medium\" reads \"sonnet-5-5/medium\"" \
  '[ "$(jv "$(run "$d" --json)" 2 "d[\"effort\"]")" = None ] && run "$d" | head -1 | grep -q "| Ctx 12% sonnet-5-5/? |" && run "$d2" | head -1 | grep -q "| Ctx 12% sonnet-5-5/medium |"'
d=$(fixture); { printf 'gisik:2 exec2 lane | idle | sh 0 mon 0 | box empty | Ctx 11%% sonnet-5-5/max | task/x clean | last: none\n'; printf '⏺ the status line says | effort: max | Ctx 99%% in this sentence\n'; } > "$d/2.pane"; mkpane "$d/2.tmp" "⏺ working" "" 27 opus-5-5 "" low; cat "$d/2.tmp" >> "$d/2.pane"; meta "$d" 2 exec2 0
check "13.2034 scrollback: a ctl-seats line (sonnet-5-5/max) and a sentence quoting \"| effort: max |\" above the real status line (effort low) — the effort comes from the REAL status line; CONTROL in the same check: the real pane alone reads the same" \
  '[ "$(effort_of "$d" 2)" = low ] && d2=$(fixture) && cp "$d/2.tmp" "$d2/2.pane" && meta "$d2" 2 exec2 0 && [ "$(effort_of "$d2" 2)" = low ] && [ "$(jv "$(run "$d" --json)" 2 "d[\"model\"]")" = opus-5-5 ]'

rm -rf "$T"
[ "$fails" -eq 0 ] && echo "seats tests green" || { echo "$fails seats tests red"; exit 1; }
