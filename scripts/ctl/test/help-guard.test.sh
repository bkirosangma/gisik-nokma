#!/usr/bin/env bash
# scripts/ctl/test/help-guard.test.sh — the dispatcher's --help / -h guard (cases 13.2371–13.2376; planner P78, 2026-10-06: `ctl rebuild
# --help` started a real rebuild). Run by `ctl selftest`. The REAL scripts/ctl/ctl (or CTL_HELP_GUARD_CTL, a mutant copy) is copied into a
# scratch dir beside STUB verbs, one per verbs/*.sh of the real directory, each writing a sentinel with its argv: no leg can run a real verb,
# even with the guard gone.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"; fails=0
. "$HERE/test/harness.sh"   # check NAME CODE, and the CTL_TEST_ONLY case filter
T="$(cd "$(mktemp -d)" && pwd -P)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/verbs"; cp "${CTL_HELP_GUARD_CTL:-$HERE/ctl}" "$T/ctl"
stub() { printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*" > "%s/ran-%s"\n' "$T" "$1" > "$T/verbs/$1.sh"; }
verbs=(); for f in "$HERE"/verbs/*.sh; do v="$(basename "$f" .sh)"; verbs+=("$v"); stub "$v"; done
words() { case "$1" in pr-open) echo "pr open";; *) echo "$1";; esac; }   # how the verb is typed (and its help-table label)
ran_none() { local r; r="$(ls "$T" | grep '^ran-')"; [ -z "$r" ] || { echo "    ran: $r"; return 1; }; }
clean() { rm -f "$T"/ran-*; }

# help_leg VERB ARGS…: rc 0, the header line, the verb's own table row next, and nothing ran. Any failure is echoed.
help_leg() {
  local v="$1" l out rc; shift; l="$(words "$v")"; clean
  # shellcheck disable=SC2086
  out="$(bash "$T/ctl" $l "$@" 2>&1)"; rc=$?
  [ "$rc" = 0 ] || { echo "    $l $*: rc $rc"; return 1; }
  [ "$(printf '%s\n' "$out" | sed -n 1p)" = "ctl $l --help: its rows of \`ctl help\` (scripts/ctl/README.md has more); nothing was run" ] \
    || { echo "    $l $*: header: $(printf '%s\n' "$out" | sed -n 1p)"; return 1; }
  printf '%s\n' "$out" | sed -n 2p | grep -Eq "^  $l( |\$)" || { echo "    $l $*: row 2: $(printf '%s\n' "$out" | sed -n 2p)"; return 1; }
  printf '%s\n' "$out" | sed 1d | grep -E '^  [^ ]' | grep -Evq "^  $l( |\$)" && { echo "    $l $*: a row of another verb: $out"; return 1; }   # post is not postman
  ran_none || { echo "    $l $*: a verb ran"; return 1; }
}

every_verb_help() {
  local v n=0 bad=0
  for v in "${verbs[@]}"; do
    n=$((n+1))
    help_leg "$v" --help || bad=$((bad+1))
    help_leg "$v" x --dry-run --help || bad=$((bad+1))   # NOT the first argument: the P78 call was `ctl rebuild --help`; this is the deeper form
  done
  [ "$n" = "${#verbs[@]}" ] && [ "$n" -ge 27 ] || { echo "    looped $n of ${#verbs[@]} verbs (expected >= 27)"; bad=$((bad+1)); }
  [ "$bad" = 0 ]
}
check "13.2371 every verbs/*.sh (looped from the directory, >= 27): ctl <verb> --help and ctl <verb> x --dry-run --help exit 0, print the header and the verb's own help-table row, and run nothing" 'every_verb_help'

dash_h() {
  help_leg rebuild -h && help_leg rebuild --dry-run -h && help_leg pr-open -h && help_leg run-tests --label l -h || return 1
  # the rows are whole: rebuild's continuation line, and postman's two rows with the second one's two continuation lines
  out="$(bash "$T/ctl" rebuild -h)"; printf '%s\n' "$out" | sed -n 3p | grep -q '^  *rebuild the stack from it, verify$' || { echo "    rebuild -h: $out"; return 1; }
  out="$(bash "$T/ctl" postman -h)"; [ "$(printf '%s\n' "$out" | grep -c '^  postman ')" = 2 ] && [ "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" = 4 ] || { echo "    postman -h: $out"; return 1; }
  # `ctl pr --help` / `ctl pr -h` (no sub-verb) is pr open's usage; before the guard it was "unknown verb pr---help", exit 64
  local p; for p in --help -h; do
    clean; out="$(bash "$T/ctl" pr "$p" 2>&1)"; rc=$?
    [ "$rc" = 0 ] && printf '%s\n' "$out" | sed -n 2p | grep -q '^  pr open ' && ran_none || { echo "    pr $p: rc $rc: $out"; return 1; }
  done
}
check "13.2372 -h is --help: ctl rebuild -h, rebuild --dry-run -h, pr open -h, run-tests --label l -h, and ctl pr --help / pr -h (pr open's rows) exit 0 and run nothing; the rows are whole (rebuild's continuation line, postman's two rows)" 'dash_h'

lists_every_verb() {
  local a v bad=0 first=""
  for a in --help -h help; do
    clean; out="$(bash "$T/ctl" "$a" 2>&1)"; rc=$?
    [ "$rc" = 0 ] || { echo "    ctl $a: rc $rc"; bad=$((bad+1)); }
    printf '%s\n' "$out" | sed -n 1p | grep -q '^usage: scripts/ctl/ctl <verb>' || { echo "    ctl $a: no usage line"; bad=$((bad+1)); }
    for v in "${verbs[@]}"; do printf '%s\n' "$out" | grep -Eq "^  $(words "$v")( |\$)" || { echo "    ctl $a: no row for $v"; bad=$((bad+1)); }; done
    [ -z "$first" ] && first="$out"; [ "$out" = "$first" ] || { echo "    ctl $a differs from ctl --help"; bad=$((bad+1)); }
    ran_none || bad=$((bad+1))
  done
  [ "$bad" = 0 ]
}
check "13.2373 ctl --help, ctl -h and ctl help print one table with a row for EVERY verbs/*.sh (so each verb's --help has usage text), exit 0 and run nothing" 'lists_every_verb'

no_usage_text() {
  stub zz-no-usage; clean
  out="$(bash "$T/ctl" zz-no-usage x --help 2>&1)"; rc=$?
  [ "$rc" = 0 ] && [ "$out" = "ctl zz-no-usage: no usage text; read scripts/ctl/README.md" ] && ran_none || { echo "    rc $rc: $out"; return 1; }
  # CONTROL: without --help the same verb runs
  clean; bash "$T/ctl" zz-no-usage x > /dev/null 2>&1; [ "$(cat "$T/ran-zz-no-usage" 2>/dev/null)" = "x" ] || { echo "    the control did not run"; return 1; }
}
check "13.2374 a verb with no help-table row: --help prints exactly 'ctl <verb>: no usage text; read scripts/ctl/README.md', exit 0, runs nothing; CONTROL: without --help it runs" 'no_usage_text'

after_dashdash() {
  local args
  for args in "--label l -- grep -h x" "-- tsc --help" "--short -- vitest run -h --help"; do
    clean
    # shellcheck disable=SC2086
    bash "$T/ctl" run-tests $args > /dev/null 2>&1
    [ "$(cat "$T/ran-run-tests" 2>/dev/null)" = "$args" ] || { echo "    run-tests $args: did not run with its argv ($(cat "$T/ran-run-tests" 2>/dev/null))"; return 1; }
  done
  help_leg run-tests --label l --help -- tsc   # CONTROL: before the -- it is ctl's own --help
}
check "13.2375 after the first -- the arguments are a command: run-tests -- grep -h x / -- tsc --help / -- vitest run -h --help reach the verb with their argv intact; CONTROL: run-tests --label l --help -- tsc is usage, nothing run" 'after_dashdash'

control_runs() {
  local v l bad=0 a
  for v in "${verbs[@]}"; do
    l="$(words "$v")"; clean
    # shellcheck disable=SC2086
    bash "$T/ctl" $l x --dry-run > /dev/null 2>&1
    [ "$(cat "$T/ran-$v" 2>/dev/null)" = "x --dry-run" ] || { echo "    $l x --dry-run did not run"; bad=$((bad+1)); }
  done
  for a in --helpx --help=1 -hx -H help --HELP; do   # the match is exact
    clean; bash "$T/ctl" rebuild "$a" > /dev/null 2>&1
    [ "$(cat "$T/ran-rebuild" 2>/dev/null)" = "$a" ] || { echo "    rebuild $a did not run"; bad=$((bad+1)); }
  done
  clean; out="$(bash "$T/ctl" nosuch --help 2>&1)"; rc=$?
  [ "$rc" = 64 ] && [ "$out" = "FAIL ctl unknown verb nosuch (see: scripts/ctl/ctl help)" ] && ran_none || { echo "    nosuch --help: rc $rc: $out"; bad=$((bad+1)); }
  [ "$bad" = 0 ]
}
check "13.2376 CONTROL: every verb WITHOUT --help runs with its argv (ctl <verb> x --dry-run); --helpx, --help=1, -hx, -H, help and --HELP are not the guard (rebuild runs); an unknown verb with --help is still exit 64" 'control_runs'

ctl_test_only_end help-guard.test.sh
[ "$fails" -eq 0 ] && echo "help-guard: all green" || { echo "help-guard: $fails red"; exit 1; }
