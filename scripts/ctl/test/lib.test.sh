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
check "gate: main moved past the branch (seen only by fetching) → refuses, names the remedy" 'out=$(gate_dry); [ $? -eq 1 ] && printf "%s" "$out" | grep -q "is not an ancestor of HEAD.*merge origin/main"'
( cd "$gr" && /usr/bin/git merge -q --no-edit origin/main )
check "gate: after merging origin/main → proceeds again" 'gate_dry | tail -1 | grep -q "^OK gate dry-run"'
rm -rf "$bare" "$gr" "$other"
rm -rf "$tmp" "$wt"
[ "$fails" -eq 0 ] && echo "lib.test.sh: ok" || { echo "lib.test.sh: $fails FAILED"; exit 1; }
