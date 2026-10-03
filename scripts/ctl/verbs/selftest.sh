#!/usr/bin/env bash
# ctl selftest — hook table, lib tests, every verb's --dry-run. Wired as `pnpm check:ctl`.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
export CTL_IN_SELFTEST=1
repo="$(ctl_repo "$PWD")" || exit 1
fails=0; n=0   # the step count is COUNTED, never typed: a literal collides in every tip merge that adds a step
step() { n=$((n+1)); if bash -c "$2" > /dev/null 2>&1; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }
step "hook self-test"        "python3 '$HERE/hooks/ctl-scripts-only.py' --self-test"
step "lib tests"             "bash '$HERE/test/lib.test.sh'"
# The cached gate is only as sound as turbo.json's inputs: a changed cross-package reader must change the task hash (a MISS).
step "gate cache correctness (turbo task hashes)" "bash '$HERE/test/gate-cache.test.sh'"
step "run-tests suite (semaphore, summary, gate priority)" "bash '$HERE/test/run-tests.test.sh'"
step "run-tests --dry-run"  "'$HERE/ctl' run-tests --repo '$repo' --dry-run -- true"
step "run-tests refuses a missing command" "! '$HERE/ctl' run-tests --repo '$repo' --dry-run"
step "tipmerge suite (clean → pushed + tree proof, conflict → paths, moved → refused)" "bash '$HERE/test/tipmerge.test.sh'"
# The postman suite builds a scratch tmux session with fake panes and a scratch ledger (never a live seat; ~3.5 min).
step "postman suite (ledger, ack, watcher, bridge, state machine, pane safety)" "bash '$HERE/test/postman.test.sh'"
step "post/ack/postman --dry-run write nothing" "d=\$(mktemp -d); CTL_POSTMAN_ROOT=\$d CTL_TMUX_SESSION=ctlst-\$\$ '$HERE/ctl' post exec3 --kind fix --text x --from main --dry-run && CTL_POSTMAN_ROOT=\$d CTL_TMUX_SESSION=ctlst-\$\$ '$HERE/ctl' postman once --dry-run && [ ! -e \$d/LEDGER.jsonl ]"
step "ack refuses an unknown id" "d=\$(mktemp -d); ! CTL_POSTMAN_ROOT=\$d '$HERE/ctl' ack 99 --seat exec3"
step "checks --dry-run"      "'$HERE/ctl' checks --repo '$repo' --dry-run"
# gate refuses a dirty tree and a HEAD that does not contain origin/main before dry-running; both are the verb working, so
# only those two named refusals are accepted here — any other non-zero exit is a red step.
step "gate --dry-run"        "out=\$('$HERE/ctl' gate \$(/usr/bin/git -C '$repo' rev-parse HEAD) --repo '$repo' --dry-run 2>&1); [ \$? -eq 0 ] || printf '%s' \"\$out\" | grep -q 'tree is dirty\\|is not an ancestor of HEAD'"
step "gate refuses a base that is not main or release/*" "out=\$('$HERE/ctl' gate \$(/usr/bin/git -C '$repo' rev-parse HEAD) --repo '$repo' --base feat/x --dry-run 2>&1); [ \$? -eq 1 ] && printf '%s' \"\$out\" | grep -q 'main or release/'"
step "pr open --dry-run refuses main" "! '$HERE/ctl' pr open main --title t --body '$HERE/README.md' --repo '$repo' --dry-run"
step "land refuses a merged PR" "'$HERE/ctl' land 638 --repo '$repo' --dry-run; [ \$? -eq 1 ]"
step "anchor --dry-run"      "'$HERE/ctl' anchor 0 --title t --body '$HERE/README.md' --repo '$repo' --dry-run"
# A detached checkout (the gate scripts and CI) has no branch name; check-pr then takes HEAD.
step "check-pr --dry-run"    "b=\$(/usr/bin/git -C '$repo' branch --show-current); '$HERE/ctl' check-pr \"\${b:-HEAD}\" --repo '$repo' --dry-run || /usr/bin/git -C '$repo' status --porcelain | grep -q ."
step "reconcile --dry-run"   "'$HERE/ctl' reconcile --repo '$repo' --dry-run"
step "lanes"                 "'$HERE/ctl' lanes"
step "dispatch --dry-run refuses a missing file" "! '$HERE/ctl' dispatch 2 /nonexistent --dry-run"
step "restart --dry-run refuses window 0" "! '$HERE/ctl' restart 0 '$repo' '$HERE/README.md' --dry-run"
step "rebuild --dry-run"     "'$HERE/ctl' rebuild --dry-run"
step "tipmerge refuses main as the branch" "out=\$('$HERE/ctl' tipmerge main --base release/x --expect abcdef0 --repo '$repo' --dry-run 2>&1); [ \$? -eq 1 ] && printf '%s' \"\$out\" | grep -q 'not a task branch'"
step "close refuses window 0" "! '$HERE/ctl' close 0 --dry-run"
[ "$fails" -eq 0 ] && ctl_ok selftest "$n steps" || ctl_fail selftest "$fails steps red"
