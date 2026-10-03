#!/usr/bin/env bash
# scripts/ctl/test/restart.test.sh — `ctl restart --model / --effort`, cases 13.2026-13.2031 and 13.2036. Run by `ctl selftest`.
# restart is ONLY ever run --dry-run here (13.2030 runs without it, but behind the same barriers and a refusal that comes first): a
# PATH-front tmux SHIM that forwards list-windows and logs (then fails) every other subcommand, CTL_DRY_RUN=1 next to --dry-run, a scratch
# CTL_TMUX_SESSION / CTL_POSTMAN_ROOT / CTL_LOG_DIR, and restart.sh's own guard. The windows used are index 91, which no live session has.
# TRAP (2026-09-21): never test the PROMPT text for "--model" — a brief can contain it. The BRIEF below does, on purpose, and every
# assertion reads the launched ARGV (the pasted line, evaluated against a stub that prints its arguments), never the prompt.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CTL="$HERE/ctl"
. "$HERE/lib.sh"
fails=0
check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }
T="$(cd "$(mktemp -d)" && pwd -P)"; R="$T/roles"; L="$T/logs"; S="ctlrs-$$"; TL="$T/tmux.log"
mkdir -p "$R" "$L" "$T/wt" "$T/shim" "$T/fakeclaude"; /usr/bin/git -C "$T/wt" init -q
export CTL_POSTMAN_ROOT="$R" CTL_LOG_DIR="$L" CTL_TMUX_SESSION="$S"
unset TMUX_PANE
tmux new-session -d -s "$S" -n anchor "sleep 300"
cleanup() { tmux kill-session -t "$S" 2>/dev/null; rm -rf "$T"; }
trap cleanup EXIT
real_tmux="$(command -v tmux)"
printf '#!/bin/bash\ncase "$1" in list-windows) exec "%s" "$@";; esac\necho "$*" >> "%s"\nexit 1\n' "$real_tmux" "$TL" > "$T/shim/tmux"; chmod +x "$T/shim/tmux"
# the decoy brief: its TEXT contains both flags, so any code that inspects the prompt instead of the argv is caught
printf 'Run it as: claude --model opus --effort max. The brief is long prose.\n' > "$T/BRIEF.md"
launcher="/Users/kiro/my_projects/gisik-nokma-lanes/exec-claude.sh"
printf '#!/bin/bash\nprintf "%%s\\0" "$@" > "%s/argv"\n' "$T" > "$T/stub"; chmod +x "$T/stub"
printf '#!/bin/bash\nprintf "%%s\\0" "$@" > "%s/argv"\n' "$T" > "$T/fakeclaude/claude"; chmod +x "$T/fakeclaude/claude"
rs() { : > "$TL"; PATH="$T/shim:$PATH" CTL_DRY_RUN=1 "$CTL" restart 91 "$T/wt" "$T/BRIEF.md" "$@" --dry-run 2>&1; }
dryline() { printf '%s\n' "$1" | grep '^DRY: tmux kill-window' | sed -E 's|restart-[0-9T]+-[0-9]+\.log\.prompt|restart-STAMP.log.prompt|'; }
pasted() { printf '%s\n' "$1" | grep '^DRY: tmux kill-window' | sed -E 's|.*paste: (.*); send-keys Enter$|\1|'; }
# argv_of OUT — evaluate the pasted line with the launcher swapped for a stub; print the arguments joined by |, the prompt as <PROMPT>.
argv_of() { local c; c="$(pasted "$1")"; c="${c/$launcher/$T/stub}"; rm -f "$T/argv"; ( cd "$T" && eval "$c" ) || return 1
  python3 -c 'import sys; a=open(sys.argv[1],"rb").read().split(b"\0")[:-1]; a[-1]=b"<PROMPT>"; print("|".join(x.decode() for x in a))' "$T/argv"; }
BASE='--permission-mode|bypassPermissions|<PROMPT>'

check "13.2026 restart --model sonnet --effort medium: the pasted line, run against a stub, delivers exactly those arguments (argv, not prompt text); each flag alone delivers only itself; the flag order on the command line does not matter" \
  'o="$(rs --model sonnet --effort medium)" && [ "$(argv_of "$o")" = "--permission-mode|bypassPermissions|--model|sonnet|--effort|medium|<PROMPT>" ] && o="$(rs --effort xhigh --model opus)" && [ "$(argv_of "$o")" = "--permission-mode|bypassPermissions|--model|opus|--effort|xhigh|<PROMPT>" ] && o="$(rs --model sonnet)" && [ "$(argv_of "$o")" = "--permission-mode|bypassPermissions|--model|sonnet|<PROMPT>" ] && o="$(rs --effort max)" && [ "$(argv_of "$o")" = "--permission-mode|bypassPermissions|--effort|max|<PROMPT>" ] && [ ! -s "$TL" ]'

EXPECT_OLD="DRY: tmux kill-window -t gisik:91; tmux new-window -t gisik:91 -n exec91 -c $T/wt; sleep 3; paste: $launcher --permission-mode bypassPermissions \"\$(cat $L/restart-STAMP.log.prompt)\"; send-keys Enter"
check "13.2027 CONTROL — without --model/--effort the dry-run line is BYTE-IDENTICAL to the pre-change line (a literal frozen here), the argv carries neither flag although the brief TEXT contains both, and --override alone changes nothing about the launch line" \
  'o="$(rs)" && [ "$(dryline "$o")" = "$EXPECT_OLD" ] && [ "$(argv_of "$o")" = "$BASE" ] && printf "x\n" > "$T/ov.md" && o2="$(rs --override "$T/ov.md")" && [ "$(dryline "$o2")" = "$EXPECT_OLD" ] && printf "%s" "$o" | tail -1 | grep -q "^OK restart dry-run" && [ ! -s "$TL" ]'

bad() { # bad ARGS... — refused (rc 1) naming the flag, BEFORE the supersede marker and the kill, with no tmux write at all
  local o rc; o="$(rs "$@")"; rc=$?
  [ "$rc" = 1 ] && printf '%s' "$o" | grep -q "^FAIL restart .*--\(model\|effort\)" && ! printf '%s' "$o" | grep -q '^DRY:' && [ ! -s "$TL" ] && [ -z "$(ls -A "$R")" ]; }
check "13.2028 a bad value fails BEFORE anything is written: --effort ultra, --effort (no value), --model (no value), --model --effort high (a flag as the value), --model 'x;y' and an uppercase/space model each exit 1, name the flag, print no DRY: line (no supersede marker, no kill-window), log no tmux write and leave the postman root empty; CONTROL in the same check: valid values on the same command line print the marker and the launch line" \
  'bad --effort ultra && bad --effort && bad --model && bad --model --effort high && bad --model "x;y" && bad --model "Sonnet 5" && bad --effort high --model && o="$(rs --model sonnet --effort high)" && printf "%s" "$o" | grep -q "^DRY: mark exec91 restarted" && printf "%s" "$o" | grep -q "^DRY: tmux kill-window" && printf "%s" "$o" | tail -1 | grep -q "^OK restart"'

e2e() { # e2e ARGS... — the REAL exec-claude.sh against a fake `claude` on PATH: print "<model>|<effort>|<n model>|<n effort>"
  local o c; o="$(rs "$@")" || return 1; c="$(pasted "$o")"; rm -f "$T/argv"
  ( cd "$T" && GISIK_EXECUTOR_BACKEND=anthropic EXECUTOR_MODEL=opus GISIK_LANE_EFFORT=high PATH="$T/fakeclaude:$PATH" eval "$c" ) >/dev/null 2>&1 || return 1
  python3 -c 'import sys; a=[x.decode() for x in open(sys.argv[1],"rb").read().split(b"\0")[:-1]]; m=[i for i,x in enumerate(a) if x=="--model"]; e=[i for i,x in enumerate(a) if x=="--effort"]; print("%s|%s|%d|%d"%(a[m[0]+1] if m else "-", a[e[0]+1] if e else "-", len(m), len(e)))' "$T/argv"; }
check "13.2029 end to end through the real exec-claude.sh (fake claude on PATH): --model sonnet --effort medium reach claude as exactly one --model sonnet and one --effort medium; CONTROL in the same check: without them the launcher still supplies its own single opus / high" \
  '[ -x "$launcher" ] && [ "$(e2e --model sonnet --effort medium)" = "sonnet|medium|1|1" ] && [ "$(e2e --effort max)" = "opus|max|1|1" ] && [ "$(e2e)" = "opus|high|1|1" ]'

live_bad() { # a LIVE restart (no --dry-run) with --effort ultra: refused by the arg loop, nothing reaches tmux or the postman root
  local before after o rc; : > "$TL"; before="$(tmux list-windows -t "$S" -F "#{window_index} #{pane_pid}")"
  o="$(PATH="$T/shim:$PATH" "$CTL" restart 91 "$T/wt" "$T/BRIEF.md" --effort ultra 2>&1)"; rc=$?
  after="$(tmux list-windows -t "$S" -F "#{window_index} #{pane_pid}")"
  [ "$rc" = 1 ] && printf '%s' "$o" | grep -q "^FAIL restart --effort" && [ ! -s "$TL" ] && [ -z "$(ls -A "$R")" ] && [ "$before" = "$after" ]; }
live_ok() { # the same live call with a valid value gets PAST the arg loop and is stopped later, by the CTL_TMUX_SESSION guard
  local o rc; o="$(PATH="$T/shim:$PATH" "$CTL" restart 91 "$T/wt" "$T/BRIEF.md" --effort high 2>&1)"; rc=$?
  [ "$rc" = 1 ] && printf '%s' "$o" | grep -q "a live restart refuses it"; }
check "13.2030 a bad value on a LIVE (not --dry-run) restart is refused in the arg loop: exit 1, no tmux subcommand but list-windows reaches the shim, the postman root stays empty and the scratch session's windows are unchanged; CONTROL in the same check: the same call with a valid value gets past the arg loop and is stopped later, by the CTL_TMUX_SESSION guard" \
  'live_bad && live_ok'

STEP='^step "restart suite '
wiring() {
  /usr/bin/grep -Eq "$STEP" "$HERE/verbs/selftest.sh" && ! printf '%s\n' '# step "restart suite x"' | /usr/bin/grep -Eq "$STEP" || return 1
  local h; h="$("$CTL" help | grep '^  restart ')"; printf '%s' "$h" | grep -q -- '--model M' && printf '%s' "$h" | grep -q -- '--effort E' || return 1
  PATH="$T/shim:$PATH" "$CTL" restart 91 /nonexistent "$T/BRIEF.md" --dry-run 2>&1 | grep -q -- '\[--model M\] \[--effort E\]'; }
check "13.2031 wiring: selftest runs this suite as a live (uncommented) step; CONTROL — the pattern rejects a commented-out step; \`ctl help\` and the usage line show --model and --effort" 'wiring'

# one_launch FILE — the structure behind "the line a test reads is the line that runs": the live paste cannot run in a test, so pin it.
# Over FILE with comment lines stripped: exactly one assignment to cmd (cmd= or cmd+=), the dry-run echo prints `paste: $cmd;`, the
# only load-buffer is `printf '%s' "$cmd" | tmux load-buffer`, and --permission-mode appears on the cmd= line and nowhere else.
one_launch() { python3 - "$1" <<'PY'
import re, sys
lines = [l for l in open(sys.argv[1]).read().split("\n") if not re.match(r"\s*#", l)]
ok = (sum(len(re.findall(r"(?<![A-Za-z0-9_])cmd\+?=", l)) for l in lines) == 1
      and any("DRY: tmux kill-window" in l and "paste: $cmd;" in l for l in lines)
      and [l for l in lines if "load-buffer" in l] == [l for l in lines if "printf '%s' \"$cmd\" | tmux load-buffer" in l] != []
      and [l for l in lines if "--permission-mode" in l] == [l for l in lines if re.match(r"cmd=", l)] != []
      and len([l for l in lines if "--permission-mode" in l]) == 1)
sys.exit(0 if ok else 1)
PY
}
# mutant SRC DST OLD NEW — DST is SRC with OLD (which must occur exactly once, or the control would be vacuous) replaced by NEW
mutant() { python3 -c 'import sys; s=open(sys.argv[1]).read(); assert s.count(sys.argv[3])==1, "anchor not found once"; open(sys.argv[2],"w").write(s.replace(sys.argv[3],sys.argv[4]))' "$@"; }
R12='cmd="$launcher --permission-mode bypassPermissions \"\$(cat $pf)\""'
launch_pinned() { local v="$HERE/verbs/restart.sh"
  one_launch "$v" || return 1
  mutant "$v" "$T/r12.sh" 'lb="ctlr$$";' "$R12
lb=\"ctlr\$\$\";" && ! one_launch "$T/r12.sh" || return 1
  mutant "$v" "$T/r12i.sh" 'lb="ctlr$$";' "$R12; lb=\"ctlr\$\$\";" && ! one_launch "$T/r12i.sh" || return 1
  mutant "$v" "$T/r12b.sh" 'lb="ctlr$$";' 'cmd="$launcher \"\$(cat $pf)\""
lb="ctlr$$";' && ! one_launch "$T/r12b.sh" || return 1
  mutant "$v" "$T/lit.sh" 'paste: $cmd;' 'paste: $launcher --permission-mode bypassPermissions \"\$(cat $pf)\";' && ! one_launch "$T/lit.sh" || return 1
  # one copy per remaining clause with no --permission-mode in it, so each clause is the only one that can reject it
  mutant "$v" "$T/litb.sh" 'paste: $cmd;' 'paste: $launcher \"\$(cat $pf)\";' && ! one_launch "$T/litb.sh" || return 1
  mutant "$v" "$T/pst.sh" "printf '%s' \"\$cmd\" | tmux" "printf '%s' \"\$launcher \\\"\\\$(cat \$pf)\\\"\" | tmux" && ! one_launch "$T/pst.sh"; }
check "13.2036 one launch line, pinned by structure (the live paste cannot run in a test): over verbs/restart.sh without comment lines, exactly one cmd= assignment, the dry-run echo prints \`paste: \$cmd;\`, the only load-buffer is \`printf '%s' \"\$cmd\" | tmux load-buffer\`, and no line but cmd= carries --permission-mode; CONTROL in the same check: a copy with a flagless cmd= re-assigned before the paste (own line, inline, and one that never mentions --permission-mode), a copy whose dry-run echo prints the old literal, one whose echo prints a flagless line and one that pastes a string other than \$cmd are all rejected" 'launch_pinned'

[ "$fails" -eq 0 ] && { echo "restart tests: all ok"; exit 0; } || { echo "restart tests: $fails FAILED"; exit 1; }
