#!/usr/bin/env bash
# ctl checks — the eight repo checks under Node 22, then two controls that MUST fail, each restored and verified clean.
set -u
. "$(cd "$(dirname "$0")/.." && pwd)/lib.sh"
ctl_parse_common "$@" || exit 1
ctl_node22 || exit 1
cd "$CTL_REPO" || exit 1
log="$(ctl_log checks)"
CHECKS="check:env check:tasks check:runbook check:citations check:help check:migrations"
[ "${CTL_IN_SELFTEST:-0}" = 1 ] || CHECKS="$CHECKS check:ctl"
n=$(( $(echo $CHECKS | wc -w) + 1 ))   # + check-case-ids; 8 normally, 7 under CTL_IN_SELFTEST (no recursion)
for c in $CHECKS; do
  if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: pnpm -s $c"; continue; fi
  pnpm -s "$c" >> "$log" 2>&1 || ctl_fail checks "$c rc=$? (log $log)"
done
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: node scripts/check-case-ids.mjs"; else
  node scripts/check-case-ids.mjs >> "$log" 2>&1 || ctl_fail checks "check-case-ids rc=$? (log $log)"; fi
# The controls append to two TRACKED files. An interrupted run (ctl_fail exits, ^C, a kill) must not leave
# either dirty, so every exit path restores whatever backup is still pending; a verified restore clears its own.
f=test-cases/06-auth-visibility.md
g=docs/lanes/task-ledger.tsv
c1bak=""; c2bak=""
restore_pending() { [ -n "$c1bak" ] && cp "$c1bak" "$f"; [ -n "$c2bak" ] && cp "$c2bak" "$g"; return 0; }
trap restore_pending EXIT INT TERM
# control 1: a duplicated case id must redden check-case-ids
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: control duplicate-id on $f"; else
  c1bak="$log.c1.bak"; cp "$f" "$c1bak"; printf '\n- **6.83** ❌ CONTROL duplicate id\n' >> "$f"
  node scripts/check-case-ids.mjs >> "$log" 2>&1; rc=$?; cp "$c1bak" "$f"
  [ "$rc" -ne 0 ] || ctl_fail checks "control 1 (duplicate id) returned 0 — the check cannot fail"
  [ -z "$(/usr/bin/git status --porcelain -- "$f")" ] || ctl_fail checks "control 1 left $f dirty"
  c1bak=""
fi
# control 2: a malformed ledger row must redden check:tasks
if [ "$CTL_DRY_RUN" = 1 ]; then echo "DRY: control malformed-row on $g"; else
  c2bak="$log.c2.bak"; cp "$g" "$c2bak"; printf 'CONTROL\tmalformed\n' >> "$g"
  pnpm -s check:tasks >> "$log" 2>&1; rc=$?; cp "$c2bak" "$g"
  [ "$rc" -ne 0 ] || ctl_fail checks "control 2 (malformed row) returned 0 — the check cannot fail"
  [ -z "$(/usr/bin/git status --porcelain -- "$g")" ] || ctl_fail checks "control 2 left $g dirty"
  c2bak=""
fi
[ "$CTL_DRY_RUN" = 1 ] && ctl_ok checks "dry-run"
ctl_ok checks "$n checks rc=0, 2 controls non-zero, tree clean (log $log)"
