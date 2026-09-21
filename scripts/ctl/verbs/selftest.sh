#!/usr/bin/env bash
# ctl selftest — hook table, lib tests, every verb's --dry-run. Wired as `pnpm check:ctl`.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/lib.sh"
export CTL_IN_SELFTEST=1
repo="$(ctl_repo "$PWD")" || exit 1
fails=0
step() { if bash -c "$2" > /dev/null 2>&1; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }
step "hook self-test"        "python3 '$HERE/hooks/ctl-scripts-only.py' --self-test"
step "lib tests"             "bash '$HERE/test/lib.test.sh'"
step "checks --dry-run"      "'$HERE/ctl' checks --repo '$repo' --dry-run"
step "gate --dry-run"        "'$HERE/ctl' gate \$(/usr/bin/git -C '$repo' rev-parse HEAD) --repo '$repo' --dry-run || /usr/bin/git -C '$repo' status --porcelain | grep -q ."
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
[ "$fails" -eq 0 ] && ctl_ok selftest "13 steps" || ctl_fail selftest "$fails steps red"
