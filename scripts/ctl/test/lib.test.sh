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
  capture-pane) n=$(cat "$FAKE_ENTERS" 2>/dev/null || echo 0)
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
rm -rf "$fk"
rm -rf "$tmp" "$wt"
[ "$fails" -eq 0 ] && echo "lib.test.sh: ok" || { echo "lib.test.sh: $fails FAILED"; exit 1; }
