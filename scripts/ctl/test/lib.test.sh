#!/usr/bin/env bash
# scripts/ctl/test/lib.test.sh — assertions for lib.sh; run by `ctl selftest`.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
fails=0
check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }
# node 22
check "node22 on PATH" '[ "$(ctl_node22 >/dev/null; node --version | cut -c1-4)" = "v22." ]'
# repo resolution: a .git DIRECTORY and a .git FILE (worktree)
# `pwd -P`: on macOS mktemp returns /var/… but git resolves the toplevel to /private/var/…; the fixture is canonicalised, the function is not changed.
tmp=$(cd "$(mktemp -d)" && pwd -P); ( cd "$tmp" && git init -q . ) ; check "repo: .git dir" '[ "$(ctl_repo "$tmp")" = "$tmp" ]'
wt="$tmp-wt"; rm -rf "$wt"; ( cd "$tmp" && git commit -q --allow-empty -m x && git worktree add -q "$wt" -b t1 ) ; check "repo: .git file (worktree)" '[ "$(ctl_repo "$wt")" = "$wt" ]'
check "repo: not a repo fails" '! ctl_repo /tmp >/dev/null 2>&1'
# markers
check "marker absent" '! ctl_marker_has "$tmp" gate deadbeef'
ctl_marker_write "$tmp" gate deadbeef /tmp/x.log
check "marker present" 'ctl_marker_has "$tmp" gate deadbeef'
check "marker content has time and log" 'grep -q "/tmp/x.log" "$tmp/.git/ctl/gate-deadbeef"'
# dry-run
check "ctl_run echoes under dry-run" '[ "$(CTL_DRY_RUN=1 ctl_run echo hi)" = "DRY: echo hi" ]'
check "ctl_run runs otherwise" '[ "$(CTL_DRY_RUN=0 ctl_run echo hi)" = "hi" ]'
# arg parsing
ctl_parse_common --repo "$tmp" --dry-run a b; check "parse: repo" '[ "$CTL_REPO" = "$tmp" ]'; check "parse: dry" '[ "$CTL_DRY_RUN" = 1 ]'; check "parse: rest" '[ "${CTL_ARGS[*]}" = "a b" ]'
check "dispatcher: unknown verb exits 64" '"$HERE/ctl" nosuchverb >/dev/null 2>&1; [ $? -eq 64 ]'
check "dispatcher: help lists land" '"$HERE/ctl" help | grep -q "^  land"'
# gate's precondition: origin/main must be an ancestor of HEAD, read after a fetch (a stale local origin/main must not pass).
bare=$(mktemp -d); /usr/bin/git init -q --bare "$bare"
gr=$(mktemp -d); ( cd "$gr" && /usr/bin/git init -q . && /usr/bin/git symbolic-ref HEAD refs/heads/main && mkdir -p docs/lanes/gate-lock && echo 'exit 0' > docs/lanes/gate-lock/gate.sh && /usr/bin/git add -A && /usr/bin/git commit -q -m base && /usr/bin/git remote add origin "$bare" && /usr/bin/git push -q -u origin main && /usr/bin/git checkout -q -b feat && /usr/bin/git commit -q --allow-empty -m feat )
gate_dry() { ( cd "$gr" && "$HERE/ctl" gate "$(/usr/bin/git rev-parse HEAD)" --repo "$gr" --dry-run 2>&1 ); }
check "gate: branch containing origin/main proceeds to DRY" 'gate_dry | tail -1 | grep -q "^OK gate dry-run"'
other=$(mktemp -d); rm -rf "$other"; /usr/bin/git clone -q "$bare" "$other" && ( cd "$other" && /usr/bin/git checkout -q main && /usr/bin/git commit -q --allow-empty -m "main moved elsewhere" && /usr/bin/git push -q origin main )
check "gate: local origin/main still stale before the verb runs" '[ "$(cd "$gr" && /usr/bin/git rev-parse origin/main)" = "$(cd "$gr" && /usr/bin/git rev-parse main)" ]'
check "gate: main moved past the branch (seen only by fetching) → refuses, names the remedy" 'out=$(gate_dry); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "is not an ancestor of HEAD.*Remedy: git merge --no-edit origin/main && git push, then re-run ctl gate"'
( cd "$gr" && /usr/bin/git merge -q --no-edit origin/main )
check "gate: after merging origin/main → proceeds again" 'gate_dry | tail -1 | grep -q "^OK gate dry-run"'
# check-pr.py: the merge of origin/main that gate now requires is not a task commit; a non-merge non-ruling subject still fails.
cb=$(mktemp -d); /usr/bin/git init -q --bare "$cb"
cr=$(mktemp -d); ( cd "$cr" && /usr/bin/git init -q . && /usr/bin/git symbolic-ref HEAD refs/heads/main && mkdir -p docs/lanes && printf '#### T-X1 — a task\n' > plan.md && printf '| T-X1 | done | abc | note |\n' > docs/lanes/release-2026-09-22-progress.md && echo one > docs/x.md && /usr/bin/git add -A && /usr/bin/git commit -q -m base && /usr/bin/git remote add origin "$cb" && /usr/bin/git push -q -u origin main && /usr/bin/git checkout -q -b feat && echo two > docs/x.md && /usr/bin/git commit -q -am "X1: change x" )
co=$(mktemp -d); rm -rf "$co"; /usr/bin/git clone -q "$cb" "$co" && ( cd "$co" && /usr/bin/git checkout -q main && echo moved > moved.md && /usr/bin/git add moved.md && /usr/bin/git commit -q -m "main moved" && /usr/bin/git push -q origin main )
( cd "$cr" && /usr/bin/git fetch -q origin && /usr/bin/git merge -q --no-edit origin/main )
printf 'no logs here\n' > "$cr-body.md"   # outside the repo, so a bookkeeping `git add -A` cannot sweep it in
checkpr() { ( cd "$cr" && python3 "$HERE/verbs/check-pr.py" "$cr" plan.md docs/lanes/release-2026-09-22-progress.md "$cr-body.md" 2>&1 ); }
check "check-pr: merge commit is on the branch" '[ "$(cd "$cr" && /usr/bin/git log --merges --format=%s origin/main..HEAD | grep -c Merge)" -eq 1 ]'
check "check-pr: one task commit + the merge of origin/main passes" 'out=$(checkpr); [ $? -eq 0 ] && printf "%s" "$out" | grep -q "1 task commits, 0 bookkeeping commits, 1 files, 0 failures"'
( cd "$cr" && printf '| B05 | claimed | - | 1 task |\n' >> docs/lanes/release-2026-09-22-progress.md && /usr/bin/git commit -q -am "B05 claim: T-X1 (1 task)" && mkdir -p docs/lanes/pr-bodies && echo body > docs/lanes/pr-bodies/b05.md && /usr/bin/git add -A && /usr/bin/git commit -q -m "B05: the §4 PR body, with log paths" && echo more >> docs/lanes/pr-bodies/b05.md && /usr/bin/git commit -q -am "| B05 | claimed — PR body amended" )
check "check-pr: batch-id bookkeeping (progress file, pr-bodies/) passes and is not a task" 'out=$(checkpr); [ $? -eq 0 ] && printf "%s" "$out" | grep -q "1 task commits, 3 bookkeeping commits, 3 files, 0 failures"'
( cd "$cr" && echo three > docs/x.md && /usr/bin/git commit -q -am "B05: cite each new case id (touches a task file)" )
check "check-pr: a batch-id subject whose diff leaves the bookkeeping paths fails, naming the files" 'out=$(checkpr); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "batch-id subject but the diff touches files outside.*docs/x.md"'
( cd "$cr" && echo four > docs/x.md && /usr/bin/git commit -q -am "oops: not a ruling id" )
check "check-pr: a non-merge, non-bookkeeping commit without a ruling id still fails" 'out=$(checkpr); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "commit subject does not start with a ruling id in the plan: .oops"'
check "check-pr: a B-prefixed word that is not a batch id is not bookkeeping" '( cd "$cr" && /usr/bin/git commit -q --allow-empty -m "Bugfix: not a batch id" ); out=$(checkpr); printf "%s" "$out" | grep -q "ruling id in the plan: .Bugfix"'
# check-pr.py's log rule: a cited log is judged by the CLAIM its citing line makes — green must be green, red must be red,
# an unclaimed (measurement) log need only exist. Fixture logs carry real vitest / turbo tails; the body cites them the
# way the plan's §4 rows do (a TDD pair on one row, a build log, a browser reading).
lg=$(mktemp -d)
printf ' Test Files  1 passed (1)\n      Tests  19 passed (19)\n   Duration  1s\n' > "$lg/a-green.log"
printf ' Test Files  1 failed (1)\n      Tests  1 failed | 18 passed (19)\n   Duration  1s\n' > "$lg/a-red.log"
printf ' Tasks:    7 successful, 7 total\nCached:    0 cached, 7 total\n  Time:    9s\n' > "$lg/build.log"
printf 'the anchor at byte 14060 precedes the first <nav\nmeasured in Chrome, no suite summary here\n' > "$lg/reading.log"
cp "$lg/a-green.log" "$lg/pair-g.log"; cp "$lg/a-red.log" "$lg/pair-t.log"
logbody() { printf '%s\n' "$@" > "$cr-logs.md"; ( cd "$cr" && python3 "$HERE/verbs/check-pr.py" "$cr" plan.md docs/lanes/release-2026-09-22-progress.md "$cr-logs.md" 2>&1 ); }
check "check-pr logs: a green log cited as green passes" '! logbody "| T-X1 | case — \`$lg/a-red.log\` (\`1 failed | 18 passed (19)\`) | \`$lg/a-green.log\` · \`19 passed (19)\` |" | grep -q "cited as green is not green"'
check "check-pr logs: the red half of a TDD pair, cited as red, passes" '! logbody "| T-X1 | case — \`$lg/a-red.log\` (\`1 failed | 18 passed (19)\`) | \`$lg/a-green.log\` · \`19 passed (19)\` |" | grep -q "cited as red is not red"'
check "check-pr logs: an arrow pair with unnamed halves — first red, second green — passes" '! logbody "| T-X1 | case | 2 failed → 71 passed | \`$lg/pair-t.log\` · \`$lg/pair-g.log\` |" | grep -q "cited as"'
check "check-pr logs: a red log cited as green FAILS, naming the path and the marker" 'cp "$lg/a-red.log" "$lg/suite.log"; logbody "- \`@gisik-nokma/web\` — \`$lg/suite.log\` · Test Files **64 passed (64)**" | grep -q "log cited as green is not green (vitest: Test Files 1 failed): $lg/suite.log"'
check "check-pr logs: a green log cited as RED FAILS" 'cp "$lg/a-green.log" "$lg/probe.log"; logbody "witnessed by mutation, \`$lg/probe.log\`" | grep -q "log cited as red is not red (vitest: Test Files 1 passed): $lg/probe.log"'
check "check-pr logs: a turbo build log cited as green passes" '! logbody "- \`pnpm turbo run build\` — exit 0 (\`$lg/build.log\`)" | grep -q "cited as"'
check "check-pr logs: a measurement log with no summary, cited without a claim, passes" '! logbody "MEASURED — \`$lg/reading.log\`: the anchor precedes the first nav" | grep -q "$lg/reading.log"'
check "check-pr logs: a cited log that does not exist still fails" 'logbody "see \`$lg/nope.log\`" | grep -q "names a log that does not exist: $lg/nope.log"'
rm -rf "$lg" "$cr-logs.md"
rm -rf "$cb" "$cr" "$cr-body.md" "$co"
rm -rf "$bare" "$gr" "$other"
# Pane delivery helpers against a fake tmux on PATH: it records every call, answers display-message with $FAKE_MODE,
# counts the Enters it receives, and its capture-pane shows a real multi-line box until $FAKE_NEEDS Enters have
# arrived, then the dim "Press up to edit queued messages" hint (the shapes are copied from real captures).
fk=$(mktemp -d); cat > "$fk/tmux" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_LOG"
case "$1" in
  display-message) echo "${FAKE_MODE:-0}";;
  send-keys) case "$*" in *" Enter") n=$(cat "$FAKE_ENTERS" 2>/dev/null || echo 0); echo $((n+1)) > "$FAKE_ENTERS";; esac;;
  capture-pane) esc=$(printf '\033')
    if [ -n "${FAKE_PANE:-}" ]; then case " $* " in *" -e "*) cat "$FAKE_PANE";; *) sed "s/$esc\[[0-9;]*m//g" "$FAKE_PANE";; esac; exit 0; fi
    n=$(cat "$FAKE_ENTERS" 2>/dev/null || echo 0)
    if [ "$n" -ge "${FAKE_NEEDS:-1}" ]; then printf '\033[38;5;241m\xe2\x9d\xaf \033[2m\033[39mPress up to edit queued messages\033[0m\n'
    else printf '\033[38;5;241m\xe2\x9d\xaf \033[39m[a brief line]\n  line 2 of the brief\n'; fi;;
esac
FAKE
chmod +x "$fk/tmux"
fake() { local mode="$1" needs="$2"; shift 2; rm -f "$fk/calls" "$fk/enters"; FAKE_LOG="$fk/calls" FAKE_ENTERS="$fk/enters" FAKE_MODE="$mode" FAKE_NEEDS="$needs" PATH="$fk:$PATH" bash -c ". '$HERE/lib.sh'; $*"; }
check "press_enter: not in copy mode → one real Enter, no cancel" 'fake 0 1 "ctl_press_enter gisik:7" >/dev/null; [ "$(grep -c send-keys "$fk/calls")" -eq 1 ] && grep -qx "send-keys -t gisik:7 Enter" "$fk/calls"'
check "press_enter: in copy mode → cancel first, then Enter" 'fake 1 1 "ctl_press_enter gisik:7" >/dev/null; [ "$(grep send-keys "$fk/calls" | tr "\n" " ")" = "send-keys -t gisik:7 -X cancel send-keys -t gisik:7 Enter " ]'
check "box_text: real text is read" '[ "$(fake 0 1 "ctl_box_text gisik:7")" = "[a brief line]" ]'
check "box_text: the dim queued hint is not input" '[ -z "$(fake 0 0 "ctl_box_text gisik:7")" ] && fake 0 0 "ctl_box_queued gisik:7"'
check "submit: a single-line box empties on the first Enter → 1" '[ "$(fake 0 1 "ctl_submit gisik:7")" = 1 ]'
check "submit: a multi-line box absorbs the first Enter → 2" '[ "$(fake 0 2 "ctl_submit gisik:7")" = 2 ]'
check "submit: a box that never empties → exit 1 after 3 Enters" '! fake 0 99 "ctl_submit gisik:7" >/dev/null && [ "$(cat "$fk/enters")" -eq 3 ]'
check "submit: never pastes a CR" 'fake 0 2 "ctl_submit gisik:7" >/dev/null; ! grep -q paste-buffer "$fk/calls"'
# ctl_delivered against fake panes (shapes from real captures): the proof must need NEW evidence, never old scrollback.
pane() { local f="$fk/pane-$1.txt"; shift; printf '%b' "$*" > "$f"; echo "$f"; }
p_idle=$(pane idle     '\033[38;5;16m  old response line\033[39m\n\033[38;5;241m\xe2\x9d\xaf \033[39m\n  status line\n')
p_echo=$(pane echo     '\033[38;5;16m  old response line\033[39m\n  idle filler 59 — no action needed\n\xe2\x9c\xb3 Imagining… (6s · ↓ 107 tokens)\n\033[38;5;241m\xe2\x9d\xaf \033[39m\n  status line\n')
p_busy0=$(pane busy0   '\033[38;5;16m  old response line\033[39m\n\xe2\x9c\xb3 Imagining… (48s · ↓ 1k tokens)\n\033[38;5;241m\xe2\x9d\xaf \033[39m\n  status line\n')
p_queued=$(pane queued '\033[38;5;16m  old response line\033[39m\n\xe2\x9c\xb3 Imagining… (52s · ↓ 1k tokens)\n\033[38;5;241m\xe2\x9d\xaf \033[2m\033[39mPress up to edit queued messages\033[0m\n  status line\n')
p_stale=$(pane stale   '\033[38;5;16m  idle filler 59 — no action needed\033[39m\n\xe2\x9c\xb3 Imagining… (9s · ↓ 2k tokens)\n\033[38;5;241m\xe2\x9d\xaf \033[39m\n  status line\n')
delivered() { local before="$1" after="$2"; FAKE_LOG="$fk/calls" FAKE_PANE="$before" PATH="$fk:$PATH" bash -c ". '$HERE/lib.sh'; ctl_pane_above gisik:7" > "$fk/before.txt"; FAKE_LOG="$fk/calls" FAKE_PANE="$after" CTL_PROOF_TRIES=1 PATH="$fk:$PATH" bash -c ". '$HERE/lib.sh'; ctl_delivered gisik:7 'idle filler 59 — no action needed' '$fk/before.txt'"; }
check "delivered: idle lane → echo of the last line + a spinner that was absent before" '[ "$(delivered "$p_idle" "$p_echo")" = "echoed above the prompt, new turn running" ]'
check "delivered: busy lane → the queued-messages hint" '[ "$(delivered "$p_busy0" "$p_queued")" = "queued behind the lane'"'"'s running turn" ]'
check "delivered: nothing changed → no proof, exit 1" '! delivered "$p_idle" "$p_idle" >/dev/null'
check "delivered: a spinner that was ALREADY running is not new evidence" '! delivered "$p_busy0" "$p_stale" >/dev/null'
check "delivered: an echo that was ALREADY in the scrollback is not new evidence" '! delivered "$p_stale" "$p_stale" >/dev/null'
p_oldecho=$(pane oldecho '\033[38;5;16m  idle filler 59 — no action needed\033[39m\n\033[38;5;241m\xe2\x9d\xaf \033[39m\n  status line\n')
check "delivered: a new spinner with an OLD echo (needle count unchanged) is not proof" '! delivered "$p_oldecho" "$p_stale" >/dev/null'
p_boxfull=$(pane boxfull '\033[38;5;16m  old response line\033[39m\n  idle filler 59 — no action needed\n\xe2\x9c\xb3 Imagining… (6s · ↓ 107 tokens)\n\033[38;5;241m\xe2\x9d\xaf \033[39m[still typed here]\n  status line\n')
check "delivered: real text still in the box is never proof, whatever the transcript shows" '! delivered "$p_idle" "$p_boxfull" >/dev/null'
rm -rf "$fk"
rm -rf "$tmp" "$wt"
[ "$fails" -eq 0 ] && echo "lib.test.sh: ok" || { echo "lib.test.sh: $fails FAILED"; exit 1; }
