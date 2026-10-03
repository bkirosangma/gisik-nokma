#!/usr/bin/env bash
# scripts/ctl/test/check-base.test.sh — ctl check-base (cases 13.2060–13.2064). Run by `ctl selftest`. A scratch repo + bare origin; nothing live is read.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"; CTL="$HERE/ctl"; fails=0
check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }
T="$(cd "$(mktemp -d)" && pwd -P)"; trap 'rm -rf "$T"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
G="/usr/bin/git -C $T/w"; /usr/bin/git init -q --bare "$T/o.git"; /usr/bin/git init -q -b main "$T/w"; $G remote add origin "$T/o.git"
c() { echo "$1" >> "$T/w/f"; $G add f; $G commit -q -m "$1"; }       # c <msg>: one commit on the current branch
# X is shared by every release; SM and KG diverge from it (KG is the longer one), TA and TB each add one commit
c X; $G push -q origin main
for r in sm:2 kg:3 ta:1 tb:1; do n="${r%%:*}"; k="${r##*:}"; $G checkout -q -B "r-$n" main; for i in $(seq 1 $k); do c "$n$i"; done; $G push -q origin "r-$n:refs/heads/release/$([ $n = sm ] && echo smoothness || { [ $n = kg ] && echo knowledge-graph || echo $n; })"; done
$G checkout -q -B from-sm origin/release/smoothness; c a1; $G push -q origin from-sm:refs/heads/task/from-sm            # cut from release/smoothness (tonight's 01:36 case)
$G checkout -q -B stale-kg origin/release/knowledge-graph~1; c b1; $G push -q origin stale-kg:refs/heads/task/stale-kg  # a stale cut of KG (the 01:29 case: behind, but the right base)
$G checkout -q -B at-x main; $G push -q origin at-x:refs/heads/task/at-x                                                  # exactly on X, shared by every release
$G checkout -q -B from-ta origin/release/ta; c d1; $G push -q origin from-ta:refs/heads/task/from-ta
$G checkout -q -B main origin/main; c m1; $G push -q origin main; $G checkout -q -B m-only main; c m2; $G push -q origin m-only:refs/heads/task/m-only
$G fetch -q origin
cb() { "$CTL" check-base "$@" --repo "$T/w" 2>&1; }
check "13.2060 check-base: a branch cut from release/smoothness and stated as knowledge-graph is WRONG-BASE (exit 1, names both refs and the behind counts); CONTROL in the same check: the same branch stated as smoothness is OK (exit 0)" \
  '{ o="$(cb task/from-sm release/knowledge-graph)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "^WRONG-BASE task/from-sm stated=release/knowledge-graph closest=release/smoothness (3 vs 0 behind)" && printf "%s" "$o" | tail -1 | grep -q "^FAIL check-base" && o2="$(cb task/from-sm release/smoothness)" && printf "%s" "$o2" | tail -1 | grep -q "^OK check-base"'
check "13.2061 check-base: a STALE branch (behind its stated base, but cut from it) is OK, not WRONG-BASE — a younger release with fewer new commits is not a closer base; CONTROL in the same check: the same branch stated as a release it was NOT cut from IS WRONG-BASE" \
  'o="$(cb task/stale-kg release/knowledge-graph)" && printf "%s" "$o" | tail -1 | grep -q "^OK check-base" && ! printf "%s" "$o" | grep -q WRONG-BASE && { o2="$(cb task/stale-kg release/smoothness)"; [ $? = 1 ]; } && printf "%s" "$o2" | grep -q "closest=release/knowledge-graph"'
check "13.2062 check-base: a TIE — a branch sitting exactly on the commit two releases share — is OK; CONTROL in the same check: a branch one commit past release/ta stated as release/tb (ta is strictly closer) IS WRONG-BASE" \
  'o="$(cb task/at-x release/ta)" && printf "%s" "$o" | tail -1 | grep -q "^OK check-base" && o="$(cb task/at-x release/tb)" && o="$(cb task/at-x release/knowledge-graph)" && printf "%s" "$o" | tail -1 | grep -q "^OK check-base" && { o2="$(cb task/from-ta release/tb)"; [ $? = 1 ]; } && printf "%s" "$o2" | grep -q "closest=release/ta"'
check "13.2063 check-base: origin/main is a candidate too — a branch cut from main (which moved past X) and stated as a release that lacks those commits is WRONG-BASE, closest=main; CONTROL in the same check: stated main is OK" \
  '{ o="$(cb task/m-only release/ta)"; [ $? = 1 ]; } && printf "%s" "$o" | grep -q "closest=main" && o2="$(cb task/m-only main)" && printf "%s" "$o2" | tail -1 | grep -q "^OK check-base"'
check "13.2064 check-base: usage and bad input are refused (exit 1, no WRONG-BASE line): missing args, a stated base that is not main/release/*, an unknown branch, an unknown release; CONTROL in the same check: a valid call is accepted" \
  'cb task/from-sm release/smoothness >/dev/null && { cb task/from-sm >/dev/null; [ $? = 1 ]; } && { cb task/from-sm feat/x >/dev/null; [ $? = 1 ]; } && { cb task/nope release/smoothness >/dev/null; [ $? = 1 ]; } && { cb task/from-sm release/nope >/dev/null; [ $? = 1 ]; } && ! { cb task/from-sm feat/x | grep -q WRONG-BASE; }'
[ "$fails" -eq 0 ] && { echo "check-base tests: all ok"; exit 0; } || { echo "check-base tests: $fails FAILED"; exit 1; }
