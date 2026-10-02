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
# gate copies the gate-lock scripts PER RUN and never on --dry-run. Measured 2026-09-21: the copy went to one shared
# dir on every call, so a sibling's `ctl checks` (→ selftest → gate --dry-run) rewrote locked-test.sh under a running gate.
ld=$(mktemp -d)
check "gate: --dry-run copies nothing into the log dir" 'CTL_LOG_DIR="$ld" gate_dry >/dev/null; [ "$(ls "$ld" | wc -l | tr -d " ")" -eq 0 ]'
# a fixture gate.sh that prints what the verb reads: the summary lines into the log ($1), GATE_MODE/EXIT/NODE on its console
# (GATE_MODE is what the verb requires to match the kind it asked for: fresh on main, cached on a release base)
( cd "$gr" && printf '%s\n' '#!/bin/bash' 'printf "Tasks:    34 successful, 34 total\nCached:    0 cached, 34 total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=0' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && echo helper > docs/lanes/gate-lock/locked-test.sh && /usr/bin/git add -A && /usr/bin/git commit -q -m "fixture gate" && /usr/bin/git push -q origin HEAD:main && /usr/bin/git fetch -q origin )
# CTL_DRY_RUN=0 explicitly: the arg-parsing check above leaves CTL_DRY_RUN=1 in this shell, and a "real run" that is
# silently a dry run prints `OK gate dry-run` — which a loose `^OK gate` grep accepted (measured writing this test).
gate_real() { ( cd "$gr" && CTL_DRY_RUN=0 CTL_LOG_DIR="$ld" "$HERE/ctl" gate "$(/usr/bin/git rev-parse HEAD)" --repo "$gr" 2>&1 ); }
check "gate: a real run is green on the fixture (a sha follows OK gate — not dry-run)" 'gate_real | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0"'
check "gate: the real run copied both scripts into a per-run dir named like its log" 'd=$(ls -d "$ld"/gate-lock-* | head -1); run=${d##*/gate-lock-}; [ -f "$d/gate.sh" ] && [ -f "$d/locked-test.sh" ] && [ -f "$ld/gate-$run.log" ]'
check "gate: no shared gate-lock dir was created" '[ ! -e "$ld/gate-lock" ]'
check "gate: a second real run gets its own dir, the first copy stays" 'sleep 1; gate_real >/dev/null; [ "$(ls -d "$ld"/gate-lock-* | wc -l | tr -d " ")" -eq 2 ]'
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
( cd "$cr" && echo three > docs/x.md && /usr/bin/git commit -q -am "B05: cite each new case id (touches a catalogue file)" )
check "check-pr: a batch-id subject that stays in catalogue paths (docs/, test-cases/, Features.md) is bookkeeping" 'out=$(checkpr); [ $? -eq 0 ] && printf "%s" "$out" | grep -q "1 task commits, 4 bookkeeping commits, 3 files, 0 failures"'
( cd "$cr" && mkdir -p test-cases && echo case > test-cases/09-x.md && /usr/bin/git add -A && /usr/bin/git commit -q -m "Progress: T-X1 done (row + catalogue)" )
check "check-pr: a Progress: subject in bookkeeping paths is bookkeeping, not a task" 'out=$(checkpr); [ $? -eq 0 ] && printf "%s" "$out" | grep -q "1 task commits, 5 bookkeeping commits, 4 files, 0 failures"'
( cd "$cr" && mkdir -p apps/web/test && echo spec > apps/web/test/x.test.ts && /usr/bin/git add -A && /usr/bin/git commit -q -m "B05: close a ratchet violation (touches a test file)" )
check "check-pr: a batch-id subject touching apps/ is a batch-labelled FIX-UP — counted and listed, rc 0" 'out=$(checkpr); [ $? -eq 0 ] && printf "%s" "$out" | grep -q "~ fix-up: [0-9a-f]\{8\} B05: close a ratchet violation (touches a test file) -> apps/web/test/x.test.ts" && printf "%s" "$out" | grep -q "1 task commits, 5 bookkeeping commits, 1 batch-labelled fix-ups ([0-9a-f]\{8\}), 5 files, 0 failures"'
( cd "$cr" && echo spec2 > apps/web/test/x.test.ts && /usr/bin/git commit -q -am "Progress: T-X1 done — squashed with its test" )
check "check-pr: a Progress: subject touching apps/ is a fix-up too (2 listed)" 'out=$(checkpr); [ $? -eq 0 ] && printf "%s" "$out" | grep -q "2 batch-labelled fix-ups"'
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
# rtk-proxied captures: `PASS (n) FAIL (m)` on line 1, a stack trace as the tail (the real shape of /tmp/exec2-e5-13-red.log, 434 lines)
{ printf 'PASS (17) FAIL (1)\n\n'; for i in $(seq 1 40); do printf '       at runTest (file:///x/node_modules/@vitest/runner/dist/index.js:%d:11)\n' $i; done; printf '[full output: ~/Library/Application Support/rtk/tee/1_vitest_run.log]\n'; } > "$lg/rtk-red.log"
{ printf 'PASS (87) FAIL (0)\n\n'; for i in $(seq 1 40); do printf '  ✓ case %d\n' $i; done; } > "$lg/rtk-green.log"
printf 'Scope: 2 of 12 workspace projects\npackages/app-core typecheck$ tsc -p tsconfig.typecheck.json\npackages/app-core typecheck: Done\nEXIT=0\n' > "$lg/e5-4-tc2.log"
printf 'packages/app-core typecheck$ tsc -p tsconfig.typecheck.json\nsrc/x.ts(3,1): error TS2322: no\nEXIT=2\n' > "$lg/e5-4-tc3.log"
cp "$lg/a-red.log" "$lg/E5-40-red2.log"; cp "$lg/a-green.log" "$lg/E5-40-green2.log"
logbody() { printf '%s\n' "$@" > "$cr-logs.md"; ( cd "$cr" && python3 "$HERE/verbs/check-pr.py" "$cr" plan.md docs/lanes/release-2026-09-22-progress.md "$cr-logs.md" 2>&1 ); }
check "check-pr logs: a green log cited as green passes" '! logbody "| T-X1 | case — \`$lg/a-red.log\` (\`1 failed | 18 passed (19)\`) | \`$lg/a-green.log\` · \`19 passed (19)\` |" | grep -q "cited as green is not green"'
check "check-pr logs: the red half of a TDD pair, cited as red, passes" '! logbody "| T-X1 | case — \`$lg/a-red.log\` (\`1 failed | 18 passed (19)\`) | \`$lg/a-green.log\` · \`19 passed (19)\` |" | grep -q "cited as red is not red"'
check "check-pr logs: an arrow pair with unnamed halves — first red, second green — passes" '! logbody "| T-X1 | case | 2 failed → 71 passed | \`$lg/pair-t.log\` · \`$lg/pair-g.log\` |" | grep -q "cited as"'
check "check-pr logs: a red log cited as green FAILS, naming the path and the marker" 'cp "$lg/a-red.log" "$lg/suite.log"; logbody "- \`@gisik-nokma/web\` — \`$lg/suite.log\` · Test Files **64 passed (64)**" | grep -q "log cited as green is not green (vitest: Test Files 1 failed): $lg/suite.log"'
check "check-pr logs: a green log cited as RED FAILS" 'cp "$lg/a-green.log" "$lg/probe.log"; logbody "witnessed by mutation, \`$lg/probe.log\`" | grep -q "log cited as red is not red (vitest: Test Files 1 passed): $lg/probe.log"'
check "check-pr logs: a turbo build log cited as green passes" '! logbody "- \`pnpm turbo run build\` — exit 0 (\`$lg/build.log\`)" | grep -q "cited as"'
check "check-pr logs: a measurement log with no summary, cited without a claim, passes" '! logbody "MEASURED — \`$lg/reading.log\`: the anchor precedes the first nav" | grep -q "$lg/reading.log"'
check "check-pr logs: an rtk-proxied red (FAIL (1) on line 1, stack-trace tail) cited RED passes" '! logbody "| T-X1 | red first: \`$lg/rtk-red.log\` |" | grep -q "cited as red is not red"'
check "check-pr logs: an rtk-proxied green (PASS (87) FAIL (0)) cited GREEN passes" '! logbody "- suite green: \`$lg/rtk-green.log\` · PASS (87) FAIL (0)" | grep -q "cited as green is not green"'
check "check-pr logs: an rtk-proxied red cited as GREEN FAILS, naming the rtk marker (path name neutral, so the row decides)" 'cp "$lg/rtk-red.log" "$lg/rtk-suite.log"; logbody "- suite green: \`$lg/rtk-suite.log\` · all passed" | grep -q "log cited as green is not green (rtk: FAIL (1)): $lg/rtk-suite.log"'
check "check-pr logs: a ONE-LINE rtk file (the whole capture is the summary) cited green passes" 'printf "PASS (1763) FAIL (0)" > "$lg/final-app-core.log"; ! logbody "- app-core: \`$lg/final-app-core.log\` PASS (1763) FAIL (0)" | grep -q "cited as"'
check "check-pr logs: a typecheck log (tsc … Done, EXIT=0, no error TS) cited green passes" '! logbody "- typecheck (2 packages, fresh dist): EXIT=0 — \`$lg/e5-4-tc2.log\`" | grep -q "cited as green is not green"'
check "check-pr logs: a typecheck log with error TS cited green FAILS" 'logbody "- typecheck: EXIT=0 — \`$lg/e5-4-tc3.log\`" | grep -q "log cited as green is not green (typecheck: error TS): $lg/e5-4-tc3.log"'
check "check-pr logs: the path name WINS over the row — …-red2.log on a row that also says passed is RED, and passes" '! logbody "| T-E5-40 | the hidden backlog says so — \`$lg/E5-40-red2.log\` (1 failed) → \`$lg/E5-40-green2.log\` 19 passed (19) |" | grep -q "cited as"'
check "check-pr logs: a cited log that does not exist still fails" 'logbody "see \`$lg/nope.log\`" | grep -q "names a log that does not exist: $lg/nope.log"'
rm -rf "$lg" "$cr-logs.md"
rm -rf "$cb" "$cr" "$cr-body.md" "$co"
rm -rf "$bare" "$gr" "$other"
# --base <branch> (13.1501-13.1512, test-cases/13-deploy-and-ops.md): gate, land, check-pr and pr open's marker lookup measure against origin/<base>, default main.
# The base is main or release/<name> and nothing else; main's behaviour is the default and is asserted unchanged (regression arms).
G=/usr/bin/git
check "13.1501 base: ctl_base_valid accepts main and release/<name>, incl. nested" 'ctl_base_valid main && ctl_base_valid release/trash && ctl_base_valid release/2026-09-23 && ctl_base_valid release/a/b'
check "13.1501 base: ctl_base_valid refuses every other name, incl. traversal and an empty release/" '( for b in "" develop feat/x mainx release release/ release/../main release/a..b "release/a b" "release/a;b" releases/x origin/main release/.hidden; do ! ctl_base_valid "$b" || { echo "accepted: [$b]"; exit 1; }; done )'
check "13.1503 base: main keeps the marker kind the chain always used" '[ "$(ctl_marker_kind gate main)" = gate ] && [ "$(ctl_marker_kind checked main)" = checked ]'
check "13.1503 base: a release base gets its OWN marker kind, injectively" '[ "$(ctl_marker_kind gate release/x)" = "gate.release+x" ] && [ "$(ctl_marker_kind gate release/a/b)" != "$(ctl_marker_kind gate release/a-b)" ]'
bb=$(mktemp -d); $G init -q --bare "$bb"
br=$(mktemp -d); ( cd "$br" && $G init -q . && $G symbolic-ref HEAD refs/heads/main && mkdir -p docs/lanes/gate-lock && printf '%s\n' '#!/bin/bash' 'printf "Tasks:    34 successful, 34 total\nCached:    0 cached, 34 total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=0' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && echo one > f.txt && $G add -A && $G commit -q -m base && $G remote add origin "$bb" && $G push -q -u origin main && $G checkout -q -b release/x && echo rel > rel.txt && $G add -A && $G commit -q -m rel1 && $G push -q -u origin release/x && $G checkout -q -b task && echo task > task.txt && $G add -A && $G commit -q -m task1 && $G push -q origin task )
bump() { ( c=$(mktemp -d); rm -rf "$c"; $G clone -q "$bb" "$c" && cd "$c" && $G checkout -q "$1" && echo "$RANDOM" > "moved-$RANDOM.txt" && $G add -A && $G commit -q -m "$1 moved" && $G push -q origin "$1"; rm -rf "$c" ); }
gb() { ( cd "$br" && CTL_LOG_DIR="$ld" "$HERE/ctl" gate "$($G rev-parse HEAD)" --repo "$br" "$@" 2>&1 ); }
check "13.1502 base gate: --base release/x on a branch containing origin/release/x proceeds" 'gb --base release/x --dry-run | tail -1 | grep -q "^OK gate dry-run"'
bump release/x
check "13.1502 base gate: origin/release/x moved past the branch → refuses, names origin/release/x and its own remedy" 'out=$(gb --base release/x --dry-run); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "origin/release/x [0-9a-f]\{12\} is not an ancestor of HEAD.*Remedy: git merge --no-edit origin/release/x && git push"'
check "13.1502 base gate: CONTROL — the default still measures against main, which the branch contains, so it proceeds" 'gb --dry-run | tail -1 | grep -q "^OK gate dry-run"'
( cd "$br" && $G merge -q --no-edit origin/release/x )
bump main
check "13.1502 base gate: main moved and the branch does not contain it — --base release/x does not care" 'gb --base release/x --dry-run | tail -1 | grep -q "^OK gate dry-run"'
check "13.1502 base gate: REGRESSION — the default still refuses on main's move, naming origin/main" 'out=$(gb --dry-run); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "origin/main [0-9a-f]\{12\} is not an ancestor of HEAD.*Remedy: git merge --no-edit origin/main && git push"'
check "13.1502 base gate: --base main is the default spelled out (same refusal)" 'out=$(gb --base main --dry-run); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "origin/main [0-9a-f]\{12\} is not an ancestor"'
check "13.1501 base gate: only main or release/* — every other base is refused before anything runs, with the rule named" '( for b in develop feat/x release/ release/../main "release/a b" ""; do out=$(gb --base "$b" --dry-run); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*main or release/" || { echo "not refused: [$b] $out"; exit 1; }; done )'
check "13.1501 base gate: --base with no value is refused, not swallowed" 'out=$(gb --dry-run --base); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*--base needs a value"'
( cd "$br" && $G merge -q --no-edit origin/main && $G push -q origin task )
gbr() { CTL_DRY_RUN=0 gb "$@"; }
sha=$(cd "$br" && $G rev-parse HEAD); mk="$br/.git/ctl"
check "13.1503 base gate: a real --base release/x run is green and writes the release-kind marker, NOT the main one" 'gbr --base release/x | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0" && [ -f "$mk/gate.release+x-$sha" ] && [ ! -f "$mk/gate-$sha" ]'
check "13.1503 base gate: REGRESSION — a default real run writes gate-<sha>, the marker land has always read" 'gbr | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0" && [ -f "$mk/gate-$sha" ]'
# Gate modes (13.1700-13.1705, test-cases/13-deploy-and-ops.md): main-kind is fresh (`--force --concurrency=1`), a release base is
# cached (cache on, `--concurrency=1`). The OK line names the mode that RAN, read from gate.sh's console, not the one asked for.
# 13.1700: the REAL docs/lanes/gate-lock/gate.sh, beside a stub locked-test.sh and a stub pnpm that record argv.
gm=$(mktemp -d); mkdir -p "$gm/bin" "$gm/repo/.git"; cp "$HERE/../../docs/lanes/gate-lock/gate.sh" "$gm/gate.sh"
printf '%s\n' '#!/bin/bash' 'shift; "$@"' > "$gm/locked-test.sh"
printf '%s\n' '#!/bin/bash' 'echo "$*" >> "$STUB_ARGV"' > "$gm/bin/pnpm"; chmod +x "$gm/bin/pnpm" "$gm/locked-test.sh"
gm_run() { rm -f "$gm/argv"; ( cd "$gm/repo" && env "$@" PATH="$gm/bin:$PATH" STUB_ARGV="$gm/argv" GATE_REPO="$gm/repo" bash "$gm/gate.sh" "$gm/log" 2>&1 ); }
check "13.1700 gate modes: GATE_MODE=fresh runs turbo --force --concurrency=1" 'gm_run GATE_MODE=fresh >/dev/null; [ "$(cat "$gm/argv")" = "turbo run build test typecheck --force --concurrency=1" ]'
check "13.1700 gate modes: GATE_MODE unset is fresh — a hand-run of gate.sh never picks the weaker mode" 'gm_run X=1 >/dev/null; [ "$(cat "$gm/argv")" = "turbo run build test typecheck --force --concurrency=1" ]'
check "13.1700 gate modes: GATE_MODE=cached runs turbo with --concurrency=1 and NO --force" 'gm_run GATE_MODE=cached >/dev/null; [ "$(cat "$gm/argv")" = "turbo run build test typecheck --concurrency=1" ] && ! grep -q -- --force "$gm/argv"'
check "13.1700 gate modes: the console states the mode that runs (the verb reads it)" 'gm_run GATE_MODE=cached | grep -q "^GATE_MODE=cached TURBO_FLAGS=--concurrency=1$" && gm_run GATE_MODE=fresh | grep -q "^GATE_MODE=fresh TURBO_FLAGS=--force --concurrency=1$"'
check "13.1701 gate modes: CONTROL — an unknown mode refuses (exit 2, names the value) and turbo is never invoked" 'out=$(gm_run GATE_MODE=fast); rc=$?; [ "$rc" -eq 2 ] && printf "%s" "$out" | grep -q "GATE_MODE=.fast. is not fresh|cached" && [ ! -e "$gm/argv" ]'
check "13.1701 gate modes: CONTROL — an empty mode is not fresh by accident of spelling, it is the default only when UNSET" 'out=$(gm_run GATE_MODE=); [ $? -eq 2 ] && [ ! -e "$gm/argv" ]'
rm -rf "$gm"
# 13.1702-13.1704: the verb. The fixture gate.sh at $br echoes GATE_MODE=${GATE_MODE:-unset}, so the OK line carries what the verb passed.
mkline() { gbr "$@" | tail -1; }
check "13.1702 gate modes: --base release/x is release-kind — the OK line says mode=cached and carries the cache count" 'l=$(mkline --base release/x); printf "%s" "$l" | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +34 successful, 34 total · Cached: +0 cached, 34 total"'
check "13.1702 gate modes: CONTROL — the default (no --base) is main-kind: mode=fresh" 'l=$(mkline); printf "%s" "$l" | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh · "'
check "13.1702 gate modes: CONTROL — --base main spelled out is main-kind too: mode=fresh" 'l=$(mkline --base main); printf "%s" "$l" | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh · "'
check "13.1703 gate modes: --dry-run names the mode it would pass, per base" 'gb --base release/x --dry-run | grep -q "^DRY: GATE_MODE=cached " && gb --dry-run | grep -q "^DRY: GATE_MODE=fresh "'
# 13.1704: a gate.sh that ignores GATE_MODE (a stale copy) must not pass under the wrong name.
( cd "$br" && printf '%s\n' '#!/bin/bash' 'printf "Tasks:    34 successful, 34 total\nCached:    0 cached, 34 total\n" > "$1"' 'echo "GATE_MODE=fresh"' 'echo EXIT=0' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && $G commit -q -am "stale gate.sh" )
check "13.1704 gate modes: a gate.sh that ran fresh when cached was asked for FAILS the verb, naming both" 'out=$(gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*asked for cached, gate.sh ran fresh"'
check "13.1704 gate modes: CONTROL — the same stale gate.sh is correct for main-kind, which asked for fresh" 'gbr | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=fresh"'
( cd "$br" && $G reset -q --hard HEAD~1 )
# 13.1716: a short run fails the verb. Without the Tasks pin a task dropped from the graph (or a missing build:webview) would read
# green. The fixture prints GATE_MODE=<what it was asked for> and a Tasks line from $FIXTURE_OK (successful) and $FIXTURE_TASKS (total), both defaulting to 34.
( cd "$br" && printf '%s\n' '#!/bin/bash' 'printf "Tasks:    ${FIXTURE_OK:-${FIXTURE_TASKS:-34}} successful, ${FIXTURE_TASKS:-34} total\nCached:    0 cached, ${FIXTURE_TASKS:-34} total\n" > "$1"' 'echo "GATE_MODE=${GATE_MODE:-unset}"' 'echo EXIT=0' 'echo NODE=v22.22.2' > docs/lanes/gate-lock/gate.sh && $G commit -q -am "short-run fixture" )
check "13.1716 task count: a cached run of 33/33 FAILS the verb, naming the Tasks line" 'out=$(FIXTURE_TASKS=33 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *33 successful, 33 total"'
check "13.1716 task count: a fresh (main-kind) run of 33/33 FAILS too" 'out=$(FIXTURE_TASKS=33 gbr); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *33 successful, 33 total"'
check "13.1716 task count: a run that is 33 of 34 (a task failed) FAILS" 'out=$(FIXTURE_OK=33 gbr --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL gate .*Tasks: *33 successful, 34 total"'
check "13.1716 task count: CONTROL — the same fixture at 34/34 passes, so the 33 arms fail on the count and nothing else" 'FIXTURE_TASKS=34 gbr --base release/x | tail -1 | grep -qE "^OK gate [0-9a-f]{40} EXIT=0 · mode=cached · Tasks: +34 successful, 34 total"'
( cd "$br" && $G reset -q --hard HEAD~1 )
# ctl land, against a fake gh that answers pr view/comment and performs the merge for real inside the fixture bare repo.
fg=$(mktemp -d); cat > "$fg/gh" <<'FAKEGH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_DIR/calls"
[ "$1" = pr ] || exit 2
case "$2" in
  comment) exit 0;;
  view) case "$*" in
      *headRefOid,state,baseRefName*) echo "$FAKE_HEAD $(cat "$FAKE_DIR/state") $FAKE_BASE";;
      *headRefOid,baseRefName*) echo "$FAKE_HEAD ${FAKE_BASE_LATER:-$FAKE_BASE}";;
      *state,mergeCommit*) echo "$(cat "$FAKE_DIR/state") $(cat "$FAKE_DIR/mc")";;
      *) exit 2;;
    esac;;
  merge) c=$(mktemp -d); rm -rf "$c"
    /usr/bin/git clone -q "$FAKE_BARE" "$c" && cd "$c" && /usr/bin/git checkout -q -B "$FAKE_BASE" "origin/$FAKE_BASE" && GIT_AUTHOR_NAME=f GIT_AUTHOR_EMAIL=f@f GIT_COMMITTER_NAME=f GIT_COMMITTER_EMAIL=f@f /usr/bin/git merge -q --no-ff -m "Merge PR" "$FAKE_HEAD" && /usr/bin/git push -q origin "HEAD:refs/heads/$FAKE_BASE" && /usr/bin/git rev-parse HEAD > "$FAKE_DIR/mc" && echo MERGED > "$FAKE_DIR/state";;
  *) exit 2;;
esac
FAKEGH
chmod +x "$fg/gh"
pp=$(mktemp -d); rm -rf "$pp"; $G clone -q "$bb" "$pp"
ref() { $G -C "$bb" rev-parse "refs/heads/$1"; }
# land <prbase> [land args]: PR 7 whose head is the checkout's HEAD and whose base (per the fake gh) is <prbase>.
land() { local prbase="$1"; shift; echo OPEN > "$fg/state"; ( cd "$br" && FAKE_DIR="$fg" FAKE_BARE="$bb" FAKE_HEAD="$($G rev-parse HEAD)" FAKE_BASE="$prbase" PATH="$fg:$PATH" GISIK_PRIMARY="$pp" CTL_DRY_RUN=0 CTL_LOG_DIR="$ld" "$HERE/ctl" land 7 --repo "$br" "$@" 2>&1 ); }
check "13.1506 base land: --dry-run with a matching release base and its marker is OK and merges nothing" 'rx=$(ref release/x); land release/x --base release/x --dry-run | tail -1 | grep -q "^OK land dry-run" && [ "$(ref release/x)" = "$rx" ] && ! grep -q "pr merge" "$fg/calls" 2>/dev/null'
check "13.1504 base land: a PR whose base is main is refused under --base release/x, and nothing merges" 'rm -f "$fg/calls"; mn=$(ref main); rx=$(ref release/x); out=$(land main --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL land PR #7 base is main, not release/x" && [ "$(ref main)" = "$mn" ] && [ "$(ref release/x)" = "$rx" ] && ! grep -q "pr merge" "$fg/calls"'
check "13.1504 base land: REGRESSION — a PR whose base is release/x is refused by the DEFAULT (main) guard, and nothing merges" 'rm -f "$fg/calls"; rx=$(ref release/x); out=$(land release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL land PR #7 base is release/x, not main" && [ "$(ref release/x)" = "$rx" ] && ! grep -q "pr merge" "$fg/calls"'
check "13.1501 base land: a PR whose base is a task branch is refused even when named by --base (the flag admits main/release/* only)" 'out=$(land feat/x --base feat/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL land .*main or release/"'
check "13.1505 base land: a main-kind marker does not satisfy a release landing" 'mv "$mk/gate.release+x-$sha" "$mk/hold"; out=$(land release/x --base release/x); rc=$?; mv "$mk/hold" "$mk/gate.release+x-$sha"; [ $rc -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL land no gate marker for $sha"'
check "13.1505 base land: a release-kind marker does not satisfy a landing into main" 'mv "$mk/gate-$sha" "$mk/hold"; out=$(land main); rc=$?; mv "$mk/hold" "$mk/gate-$sha"; [ $rc -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL land no gate marker for $sha"'
check "13.1512 base land: a PR retargeted to main between the checks and the merge is refused, and nothing merges" 'rm -f "$fg/calls"; mn=$(ref main); rx=$(ref release/x); out=$(FAKE_BASE_LATER=main land release/x --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL land PR #7 was retargeted to main" && [ "$(ref main)" = "$mn" ] && [ "$(ref release/x)" = "$rx" ] && ! grep -q "pr merge" "$fg/calls"'
bump release/x
check "13.1506 base land: release/x moved after the gate → refuses naming origin/release/x, and nothing merges" 'rx=$(ref release/x); out=$(land release/x --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL land origin/release/x moved to [0-9a-f]\{12\} since the gate" && [ "$(ref release/x)" = "$rx" ]'
( cd "$br" && $G merge -q --no-edit origin/release/x && $G push -q origin task )
sha=$(cd "$br" && $G rev-parse HEAD); mn=$(ref main); ppm=$($G -C "$pp" rev-parse HEAD)
gbr --base release/x >/dev/null
check "13.1506 base land: a release landing merges into release/x, verifies against origin/release/x, and says which base" 'rx=$(ref release/x); out=$(land release/x --base release/x); [ $? -eq 0 ] && printf "%s" "$out" | tail -1 | grep -qE "^OK land #7 merge [0-9a-f]{12} release/x [0-9a-f]{12} primary untouched" && [ "$(ref release/x)" != "$rx" ] && $G -C "$bb" merge-base --is-ancestor "$sha" refs/heads/release/x'
check "13.1506 base land: THE SAFETY ARM — a release landing leaves main untouched, in the remote and in the primary checkout standing on main" '[ "$(ref main)" = "$mn" ] && [ "$($G -C "$pp" rev-parse HEAD)" = "$ppm" ] && [ "$($G -C "$pp" branch --show-current)" = main ]'
gbr >/dev/null
check "13.1507 base land: REGRESSION — the default still lands into main and fast-forwards a primary standing on main" 'mn=$(ref main); out=$(land main); [ $? -eq 0 ] && printf "%s" "$out" | tail -1 | grep -qE "^OK land #7 merge [0-9a-f]{12} main [0-9a-f]{12} primary ff [0-9a-f]{12}" && [ "$(ref main)" != "$mn" ] && [ "$($G -C "$pp" rev-parse HEAD)" = "$(ref main)" ]'
# a second head: a release landing fast-forwards a primary that stands on THAT release branch, and only then
( cd "$br" && $G checkout -q -b task2 origin/release/x && echo t2 > t2.txt && $G add -A && $G commit -q -m task2 && $G push -q origin task2 )
gbr --base release/x >/dev/null; ( cd "$pp" && $G checkout -q release/x ); mn=$(ref main)
check "13.1508 base land: a primary standing on the landed release branch is fast-forwarded to it; main still untouched" 'out=$(land release/x --base release/x); [ $? -eq 0 ] && printf "%s" "$out" | tail -1 | grep -qE "primary ff [0-9a-f]{12}$" && [ "$($G -C "$pp" rev-parse HEAD)" = "$(ref release/x)" ] && [ "$(ref main)" = "$mn" ]'
# check-pr.py / check-pr.sh: the diff and the commit list are taken against origin/<base>.
kb=$(mktemp -d); $G init -q --bare "$kb"
kr=$(mktemp -d); ( cd "$kr" && $G init -q . && $G symbolic-ref HEAD refs/heads/main && mkdir -p docs/lanes && printf '#### T-X1 — a task\n' > plan.md && printf '| T-X1 | done | abc | note |\n' > docs/lanes/release-2026-09-22-progress.md && echo one > docs/x.md && $G add -A && $G commit -q -m base && $G remote add origin "$kb" && $G push -q -u origin main && $G checkout -q -b release/x && echo rel > docs/y.md && $G add -A && $G commit -q -m "release: work already on the release branch" && $G push -q -u origin release/x && $G checkout -q -b feat && echo two > docs/x.md && $G commit -q -am "X1: change x" )
printf 'no logs here\n' > "$kr-body.md"
kpr() { ( cd "$kr" && python3 "$HERE/verbs/check-pr.py" "$kr" plan.md docs/lanes/release-2026-09-22-progress.md "$kr-body.md" "$@" 2>&1 ); }
check "13.1509 base check-pr.py: against origin/release/x only the branch's own commit counts — 1 task commit, 0 failures" 'out=$(kpr release/x); [ $? -eq 0 ] && printf "%s" "$out" | grep -q "1 task commits, 0 bookkeeping commits, 1 files, 0 failures"'
check "13.1509 base check-pr.py: CONTROL — the same branch against the default main sees the release branch commit and fails on it" 'out=$(kpr); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "ruling id in the plan: .release: work already on the release branch"'
check "13.1509 base check-pr.py: main spelled out is the default" 'a=$(kpr main); b=$(kpr); [ "$a" = "$b" ]'
check "13.1501 base check-pr.py: a base outside main / release/* exits non-zero, naming the rule" 'out=$(kpr develop); [ $? -ne 0 ] && printf "%s" "$out" | grep -q "main or release/"'
kc="$kr-ctl"; cp -R "$HERE" "$kc"; printf '#!/usr/bin/env bash\nexit 0\n' > "$kc/verbs/checks.sh"   # a private copy whose `checks` is a no-op: the repo's real checks are not this test's business
ksha=$(cd "$kr" && $G rev-parse HEAD)
kv() { ( cd "$kr" && CTL_DRY_RUN=0 CTL_LOG_DIR="$ld" "$kc/ctl" check-pr feat --repo "$kr" --plan plan.md --body "$kr-body.md" "$@" 2>&1 ); }
check "13.1510 base check-pr: a real --base release/x run is green and writes the release-kind checked marker, NOT the main one" 'kv --base release/x | tail -1 | grep -q "^OK check-pr feat [0-9a-f]\{12\} checked" && [ -f "$kr/.git/ctl/checked.release+x-$ksha" ] && [ ! -f "$kr/.git/ctl/checked-$ksha" ]'
check "13.1510 base check-pr: CONTROL — the default (main) run fails on the same branch, so the release run was not vacuous" 'out=$(kv); [ $? -eq 1 ] && printf "%s" "$out" | tail -1 | grep -q "^FAIL check-pr conditions failed" && [ ! -f "$kr/.git/ctl/checked-$ksha" ]'
check "13.1501 base check-pr: a base outside main / release/* is refused by the verb" 'out=$(kv --base develop); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL check-pr .*main or release/"'
kpo() { ( cd "$kr" && "$HERE/ctl" pr open feat --title t --body "$kr-body.md" --repo "$kr" --dry-run --require-checked "$@" 2>&1 ); }
check "13.1511 base pr open: --base release/x --require-checked accepts the release-kind marker" 'kpo --base release/x | tail -1 | grep -q "^OK pr-open dry-run"'
check "13.1511 base pr open: SAFETY — a PR to main is NOT admitted by a release-kind checked marker" 'out=$(kpo); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL pr-open no checked marker for $ksha"'
check "13.1511 base pr open: a PR to release/x is not admitted by a main-kind marker either" 'mv "$kr/.git/ctl/checked.release+x-$ksha" "$kr/.git/ctl/checked-$ksha"; out=$(kpo --base release/x); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "^FAIL pr-open no checked marker for $ksha"; r=$?; mv "$kr/.git/ctl/checked-$ksha" "$kr/.git/ctl/checked.release+x-$ksha"; [ $r -eq 0 ]'
check "13.1511 base pr open: REGRESSION — a main-kind marker still admits a PR to main" 'cp "$kr/.git/ctl/checked.release+x-$ksha" "$kr/.git/ctl/checked-$ksha"; kpo | tail -1 | grep -q "^OK pr-open dry-run"'
rm -rf "$bb" "$br" "$pp" "$fg" "$kb" "$kr" "$kr-body.md" "$kc"
# Pane delivery helpers against a fake tmux on PATH: it records every call, answers display-message with $FAKE_MODE,
# counts the Enters it receives, and its capture-pane shows a real multi-line box until $FAKE_NEEDS Enters have
# arrived, then the dim "Press up to edit queued messages" hint (the shapes are copied from real captures).
fk=$(mktemp -d); cat > "$fk/tmux" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_LOG"
case "$1" in
  display-message) echo "${FAKE_MODE:-0}";;
  list-windows) echo 7;;
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
# 13.1640: the prompt suggestion with NO closing reset (real capture, gisik:1 2026-10-02) is not input; control: real text
# after a CLOSED dim span is still read, and real text before an unclosed one is kept.
p_ghost="$fk/pane-ghost.txt"; printf '\033[38;5;241m\xe2\x9d\xaf \033[39m\033[2mRead the WHOLE file BRIEF-prefix-t11 and execute it\n  status line\n' > "$p_ghost"
p_mixed="$fk/pane-mixed.txt"; printf '\033[38;5;241m\xe2\x9d\xaf \033[39m\033[2mhint\033[0m real words \033[2mtrailing ghost\n' > "$p_mixed"
ghost() { FAKE_LOG="$fk/calls" FAKE_PANE="$1" PATH="$fk:$PATH" bash -c ". '$HERE/lib.sh'; ctl_box_text gisik:7"; }
check "13.1640 box_text: an UNCLOSED dim suggestion is not input" '[ -z "$(ghost "$p_ghost")" ]'
check "13.1640 box_text: control — real text between a closed and an unclosed dim span is read" '[ "$(ghost "$p_mixed")" = "real words" ]'
sp() { rm -f "$fk/calls" "$fk/enters"; CTL_DRY_RUN=0 FAKE_LOG="$fk/calls" FAKE_ENTERS="$fk/enters" FAKE_NEEDS="${2:-1}" FAKE_PANE="$1" PATH="$fk:$PATH" bash "$HERE/verbs/dispatch.sh" 7 --submit-pending --repo "$HERE/../.." 2>&1; }
check "13.1641 dispatch --submit-pending: a pasted-but-unsent message is submitted by real Enters, never re-pasted" 'out=$(sp "" 2); [ $? -eq 0 ] && printf "%s" "$out" | grep -q "^OK dispatch gisik:7 submitted its pending text (Enter ×2)" && ! grep -q paste-buffer "$fk/calls"'
check "13.1642 dispatch --submit-pending: a box with only a ghost suggestion is refused and gets NO Enter" 'out=$(sp "$p_ghost"); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "holds no real text" && ! grep -q "send-keys" "$fk/calls"'
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
# Post-rebuild prune (13.1590-13.1595, test-cases/13-deploy-and-ops.md). A stub `docker` first on PATH records every
# argv, so the assertions read what ctl would have run, never what Docker did.
pk="$(mktemp -d)"; mkdir -p "$pk/bin"
cat > "$pk/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$DLOG"
case "$1 $2" in
  "system df") [ -n "${STUB_NO_DF:-}" ] && exit 1; printf 'Images|12.3GB|4.1GB (33%%)\nContainers|1MB|0B (0%%)\nLocal Volumes|2GB|0B (0%%)\nBuild Cache|5.5GB|5.5GB\n';;
  "exec gisik-nokma-postgres-1") [ -n "${STUB_NO_DF:-}" ] && exit 1; printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\noverlay 100 62 38 62%% /var/lib/postgresql/data\n';;
  "builder prune") [ -n "${STUB_FAIL_PRUNE:-}" ] && exit 1;;
esac
exit 0
STUB
chmod +x "$pk/bin/docker"
prune_run() { : > "$pk/dlog"; ( PATH="$pk/bin:$PATH" DLOG="$pk/dlog" CTL_DRY_RUN=0 "$@" ) >/dev/null 2>&1; }
# the detector the "never names a volume" checks use, with its own controls below
names_volume() { /usr/bin/grep -Eiq 'volume|system prune|down +(-[a-z]*v|.*--volumes)' ; }
check "13.1590 prune: runs exactly the build-cache prune and the >24h unused-image prune, in that order" 'prune_run ctl_prune; [ "$(cat "$pk/dlog")" = "$(printf "%s\n%s" "builder prune -f" "image prune -a -f --filter until=24h")" ]'
check "13.1590 prune: the image prune is bounded by until=24h (an unbounded -a would eat the image just built)" 'prune_run ctl_prune_old_images; /usr/bin/grep -q -- "--filter until=24h" "$pk/dlog"'
check "13.1591 volumes: nothing ctl_prune runs names a volume, a system prune or --volumes" 'prune_run ctl_prune; [ -s "$pk/dlog" ] && ! names_volume < "$pk/dlog"'
check "13.1591 volumes: CONTROL — the detector flags every volume-touching prune it exists to catch" 'for l in "volume prune -f" "system prune -af" "system prune --volumes" "image prune -a -f --volumes" "builder prune -f --volumes" "compose down -v" "compose down --volumes"; do echo "$l" | names_volume || { echo "missed: $l"; false; break; }; done'
check "13.1591 volumes: no non-comment line of any ctl script names a volume or a system prune" '! /usr/bin/grep -rEh "^[^#]*(volume|system prune|down +-[a-z]*v)" --include="*.sh" --include=ctl "$HERE/lib.sh" "$HERE/ctl" "$HERE/verbs" | /usr/bin/grep -Evi "^[[:space:]]*#" | /usr/bin/grep -Eiq "docker.*(volume|system prune)|down +-[a-z]*v"'
check "13.1591 volumes: CONTROL — the static scan sees a planted volume prune in a fixture verb (no backticks in a check name: a double-quoted one EXECUTES)" 'echo "  docker volume prune -f" > "$pk/planted.sh"; /usr/bin/grep -Eih "^[^#]*(volume|system prune|down +-[a-z]*v)" "$pk/planted.sh" | /usr/bin/grep -Eiq "docker.*(volume|system prune)"'
prim="$pk/primary"; mkdir -p "$prim"; ( cd "$prim" && git init -q -b release/2026-09-99 . && git commit -q --allow-empty -m x && echo X=1 > .env && echo .env > .gitignore && git add .gitignore && git commit -q -m ign )
prune_dry() { : > "$pk/dlog"; PATH="$pk/bin:$PATH" DLOG="$pk/dlog" GISIK_PRIMARY="$prim" "$HERE/ctl" rebuild --dry-run 2>&1; }
check "13.1592 dry-run: rebuild --dry-run prints both prune commands between the pull line and the OK line, exit 0" 'out=$(prune_dry); rc=$?; [ $rc -eq 0 ] && [ "$(echo "$out" | sed -n 1p)" = "DRY: git pull --ff-only origin release/2026-09-99; pnpm dev:stack:rebuild; verify" ] && [ "$(echo "$out" | sed -n 2p)" = "DRY: docker builder prune -f" ] && [ "$(echo "$out" | sed -n 3p)" = "DRY: docker image prune -a -f --filter until=24h" ] && [ "$(echo "$out" | sed -n 4p)" = "OK rebuild dry-run on release/2026-09-99" ]'
check "13.1592 dry-run: it only PRINTS — the stub recorded no docker call" 'prune_dry >/dev/null; [ ! -s "$pk/dlog" ]'
check "13.1592 dry-run: the dry-run output names no volume" '! prune_dry | names_volume'
check "13.1593 disk line: images, build cache and the Docker VM disk percentage, from the stub's df" '[ "$(PATH="$pk/bin:$PATH" DLOG="$pk/dlog" ctl_disk_line)" = "disk: images 12.3GB (reclaimable 4.1GB (33%)), build cache 5.5GB (reclaimable 5.5GB), Docker VM disk 62% used" ]'
check "13.1593 disk line: CONTROL — with docker unable to answer it degrades to n/a, never an empty field" '[ "$(STUB_NO_DF=1 PATH="$pk/bin:$PATH" DLOG="$pk/dlog" ctl_disk_line)" = "disk: images n/a, build cache n/a, Docker VM disk n/a used" ]'
check "13.1594 failure: a failing build-cache prune still runs the image prune, and ctl_prune reports non-zero" ': > "$pk/dlog"; ( PATH="$pk/bin:$PATH" DLOG="$pk/dlog" STUB_FAIL_PRUNE=1 CTL_DRY_RUN=0 ctl_prune ) >/dev/null 2>&1; rc=$?; [ $rc -ne 0 ] && /usr/bin/grep -q "^image prune" "$pk/dlog"'
check "13.1594 failure: CONTROL — with nothing failing ctl_prune reports zero" 'prune_run ctl_prune'
check "13.1594 order: rebuild.sh prunes only AFTER the last verification gate and BEFORE the final ctl_ok, and the OK line carries the prune result and the disk line" 'v="$HERE/verbs/rebuild.sh"; g=$(/usr/bin/grep -an "GOOGLE_CLIENT_ID empty" "$v" | cut -d: -f1); p=$(/usr/bin/grep -an "^if ctl_prune >>" "$v" | cut -d: -f1); o=$(/usr/bin/grep -an "^ctl_ok rebuild \"\$branch" "$v" | cut -d: -f1); [ -n "$g" ] && [ -n "$p" ] && [ -n "$o" ] && [ "$g" -lt "$p" ] && [ "$p" -lt "$o" ] && sed -n "${o}p" "$v" | /usr/bin/grep -q "\$pr, \$(ctl_disk_line)"'
rm -rf "$pk"
rm -rf "$tmp" "$wt"
[ "$fails" -eq 0 ] && echo "lib.test.sh: ok" || { echo "lib.test.sh: $fails FAILED"; exit 1; }
