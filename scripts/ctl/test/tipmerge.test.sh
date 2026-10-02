#!/usr/bin/env bash
# scripts/ctl/test/tipmerge.test.sh — assertions for `ctl tipmerge`; run by `ctl selftest`.
# Every case builds a throwaway bare "origin", a runner clone (the checkout the verb is run FROM, standing on main with a
# dirty file) and, where a case needs one, a second clone that moves origin behind the verb's back. No network, no gh.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fails=0
check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi; }
G=/usr/bin/git
BASE=release/2026-10-99
unset CTL_DRY_RUN

cfg() { $G -C "$1" config user.name fixture; $G -C "$1" config user.email fixture@example.invalid; $G -C "$1" config commit.gpgsign false; }
tip() { $G -C "$bare" rev-parse -q --verify "refs/heads/$1^{commit}" 2>/dev/null; }
commit_in() { # commit_in CLONE BRANCH FILE SEDEXPR MSG — edit FILE on BRANCH (checked out in CLONE), commit, push
  $G -C "$1" checkout -q "$2" && ( cd "$1" && sed -i.bak "$4" "$3" && rm -f "$3.bak" ) && $G -C "$1" commit -q -am "$5" && $G -C "$1" push -q origin "$2" 2>/dev/null
}
# mk KIND builds $root/{origin.git,w}. KIND: clean (disjoint files) | text (one file, distant hunks) | conflict (same line) |
# contains (the branch already holds the base tip) | unrelated (the branch shares no history with the base).
mk() {
  root=$(cd "$(mktemp -d)" && pwd -P); bare="$root/origin.git"; w="$root/w"; o="$root/o"
  $G init -q --bare -b main "$bare"; $G clone -q "$bare" "$w" 2>/dev/null; cfg "$w"
  ( cd "$w" && seq 1 30 > a.txt && echo b > b.txt && echo c > c.txt && $G add -A && $G commit -q -m base && $G push -q origin main 2>/dev/null )
  $G -C "$w" branch "$BASE"; $G -C "$w" push -q origin "$BASE" 2>/dev/null
  if [ "$1" = unrelated ]; then
    $G -C "$w" checkout -q --orphan task/x && $G -C "$w" rm -rfq . && echo z > "$w/z.txt" && $G -C "$w" add z.txt && $G -C "$w" commit -q -m orphan && $G -C "$w" push -q origin task/x 2>/dev/null
    commit_in "$w" "$BASE" b.txt 's/^b$/release/' "release change"
  else
    $G -C "$w" branch task/x; $G -C "$w" push -q origin task/x 2>/dev/null
    case "$1" in
      clean)    commit_in "$w" task/x a.txt '2s/.*/task/' "task change"; commit_in "$w" "$BASE" b.txt 's/^b$/release/' "release change";;
      text)     commit_in "$w" task/x a.txt '2s/.*/task/' "task change"; commit_in "$w" "$BASE" a.txt '28s/.*/release/' "release change";;
      conflict) commit_in "$w" task/x a.txt '2s/.*/task/' "task change"; commit_in "$w" "$BASE" a.txt '2s/.*/release/' "release change";;
      contains) commit_in "$w" task/x a.txt '2s/.*/task/' "task change"; commit_in "$w" "$BASE" b.txt 's/^b$/release/' "release change"
                $G -C "$w" checkout -q task/x && $G -C "$w" merge -q --no-edit "$BASE" && $G -C "$w" push -q origin task/x 2>/dev/null;;
    esac
  fi
  $G -C "$w" fetch -q origin
  # the runner stands on main with a dirty tracked file, an untracked file and a staged change: the verb must leave all of it alone
  $G -C "$w" checkout -q main; echo dirty >> "$w/c.txt"; echo new > "$w/untracked.txt"; echo staged >> "$w/b.txt"; $G -C "$w" add b.txt
  # an independent merge, computed BEFORE the verb runs, is the tree the verb's merge must equal
  if [ "$1" != unrelated ]; then
    $G clone -q "$bare" "$o" 2>/dev/null; cfg "$o"; $G -C "$o" checkout -q task/x 2>/dev/null; $G -C "$o" merge -q --no-edit "origin/$BASE" 2>/dev/null
    itree=$($G -C "$o" rev-parse 'HEAD^{tree}'); itip=$($G -C "$o" rev-parse HEAD); $G -C "$o" reset -q --hard origin/task/x
  fi
  exp=$(tip task/x)
}
run() { out=$("$HERE/ctl" tipmerge task/x --base "$BASE" --expect "$exp" --repo "$w" "$@" 2>&1); rc=$?; last=$(printf '%s\n' "$out" | tail -1); }
okline_sha() { printf '%s\n' "$last" | awk '{print $4}'; }
refs_but() { $G -C "$bare" for-each-ref --format='%(refname) %(objectname)' | grep -v "^refs/heads/$1 " ; }
runner_state() { printf '%s|%s|%s|%s|%s\n' "$($G -C "$w" rev-parse HEAD)" "$($G -C "$w" status --porcelain)" "$(cat "$w/c.txt" "$w/untracked.txt")" "$($G -C "$w" for-each-ref --format='%(refname) %(objectname)' refs/heads)" "$($G -C "$w" diff --cached | $G hash-object --stdin)"; }

# --- 13.1775: what may be pushed to (the biggest risk is the verb's own push path) ---------------------------------------
refuse_branch() { # refuse_branch NAME MSG — the verb refuses NAME with MSG before fetching or pushing; origin unchanged. --expect is NAME'"'"'s own tip where it exists,
  # so a missing guard cannot hide behind a "moved" refusal.
  mk clean; before=$($G -C "$bare" for-each-ref | $G hash-object --stdin); e=$(tip "$1"); [ -n "$e" ] || e=$exp
  out=$("$HERE/ctl" tipmerge "$1" --base "$BASE" --expect "$e" --repo "$w" 2>&1); rc=$?
  [ $rc -eq 1 ] && printf '%s\n' "$out" | tail -1 | grep -q "^FAIL tipmerge.*$2" && [ "$($G -C "$bare" for-each-ref | $G hash-object --stdin)" = "$before" ]
}
check "13.1775 refuses main as the branch (a push there deploys production)" 'refuse_branch main "not a task branch"'
check "13.1775 refuses release/<name> as the branch (the integration branch moves by PR, not by this verb)" 'refuse_branch release/2026-10-99 "not a task branch" && refuse_branch release/other "not a task branch"'
check "13.1775 refuses HEAD, an empty name, a leading dash and an invalid ref name" 'refuse_branch HEAD "not a task branch" && refuse_branch "task/a..b" "not a task branch" && refuse_branch "task/a b" "not a task branch" && refuse_branch refs/heads/task/x "not a task branch" && refuse_branch "" usage && refuse_branch -x "unknown arg"'
check "13.1775 CONTROL — an ordinary task/* branch is accepted (the refusals above are the validation, not a broken fixture)" 'mk clean; run; [ $rc -eq 0 ]'
check "13.1775 refuses a branch that is not on origin" 'mk clean; out=$("$HERE/ctl" tipmerge task/nope --base "$BASE" --expect "$exp" --repo "$w" 2>&1); [ $? -eq 1 ] && printf "%s\n" "$out" | tail -1 | grep -q "^FAIL tipmerge.*cannot fetch"'

# --- 13.1776: arguments ---------------------------------------------------------------------------------------------------
argfail() { local m="$1"; shift; out=$("$HERE/ctl" tipmerge "$@" --repo "$w" 2>&1); rc=$?; [ $rc -eq 1 ] && printf '%s\n' "$out" | tail -1 | grep -q "^FAIL tipmerge.*$m"; }
check "13.1776 --base is required, and must be main or release/<name>" 'mk clean; argfail "--base is required" task/x --expect "$exp" && argfail "main or release/" task/x --base feat/y --expect "$exp" && argfail "needs a value" task/x --base "" --expect "$exp" && out=$("$HERE/ctl" tipmerge task/x --base feat/y --expect "$exp" --repo "$w" 2>&1); printf "%s\n" "$out" | grep -q "main or release/"'
check "13.1776 --expect is required, and must be 7-40 hex characters" 'mk clean; argfail "needs the READY sha" task/x --base "$BASE" && argfail "needs the READY sha" task/x --base "$BASE" --expect zzzzzzz && argfail "needs the READY sha" task/x --base "$BASE" --expect abc12 && argfail "needs the READY sha" task/x --base "$BASE" --expect ""'
check "13.1776 no branch, an extra positional and an unknown flag all refuse" 'mk clean; argfail "usage" --base "$BASE" --expect "$exp" && argfail "unexpected argument" task/x extra --base "$BASE" --expect "$exp" && argfail "unknown arg" task/x --base "$BASE" --expect "$exp" --force'

# --- 13.1777: a clean merge ------------------------------------------------------------------------------------------------
check "13.1777 clean (disjoint files): exit 0, the printed sha IS origin/branch, OK line last" 'mk clean; run; [ $rc -eq 0 ] && printf "%s\n" "$last" | grep -qE "^OK tipmerge task/x [0-9a-f]{40} " && [ "$(okline_sha)" = "$(tip task/x)" ] && [ "$(tip task/x)" != "$exp" ]'
check "13.1777 clean: parents are exactly [old branch tip, base tip], in that order" 'mk clean; bt=$(tip "$BASE"); run; [ "$($G -C "$bare" rev-parse "$(okline_sha)^1")" = "$exp" ] && [ "$($G -C "$bare" rev-parse "$(okline_sha)^2")" = "$bt" ] && ! $G -C "$bare" rev-parse -q --verify "$(okline_sha)^3" >/dev/null'
check "13.1777 clean: the pushed tree equals the tree of an independent git merge made before the verb ran" 'mk clean; run; [ "$($G -C "$bare" rev-parse "$(okline_sha)^{tree}")" = "$itree" ]'
check "13.1777 clean: the pushed commit is the independent merge in content, and that merge differs from both parents (a real merge)" 'mk clean; run; t=$($G -C "$bare" rev-parse "$(okline_sha)^{tree}"); [ $rc -eq 0 ] && [ "$t" != "$($G -C "$bare" rev-parse "$exp^{tree}")" ] && [ "$t" != "$($G -C "$bare" rev-parse "$BASE^{tree}")" ]'
check "13.1777 clean: base is now an ancestor of the branch (what ctl gate --base requires)" 'mk clean; run; $G -C "$bare" merge-base --is-ancestor "$BASE" "$(okline_sha)"'
check "13.1777 clean: no other ref on origin moved" 'mk clean; before=$(refs_but task/x); run; [ $rc -eq 0 ] && [ "$(refs_but task/x)" = "$before" ] && [ -n "$before" ]'
check "13.1777 clean: the commit message names the base and the branch" 'mk clean; run; $G -C "$bare" log -1 --format=%s "$(okline_sha)" | grep -q "^Merge origin/$BASE .*into task/x"'
check "13.1777 clean: the OK line prints the gate command for the new sha" 'mk clean; run; printf "%s\n" "$last" | grep -q "ctl gate $(okline_sha) --base $BASE"'
check "13.1778 clean (one file, distant hunks): exit 0 and the tree equals the independent merge's" 'mk text; run; [ $rc -eq 0 ] && [ "$($G -C "$bare" rev-parse "$(okline_sha)^{tree}")" = "$itree" ] && $G -C "$bare" show "$(okline_sha):a.txt" | sed -n "2p;28p" | tr "\n" " " | grep -q "^task release $"'

# --- 13.1779: no working tree is touched ------------------------------------------------------------------------------------
check "13.1779 the runner clone is byte-identical after a push: HEAD, status, dirty/untracked/staged files, local refs" 'mk clean; s0=$(runner_state); run; [ $rc -eq 0 ] && [ "$(runner_state)" = "$s0" ] && [ -n "$($G -C "$w" status --porcelain)" ]'
check "13.1779 the runner clone is untouched after a refusal too (conflict)" 'mk conflict; s0=$(runner_state); run; [ $rc -eq 3 ] && [ "$(runner_state)" = "$s0" ]'

# --- 13.1780: a conflicted merge ---------------------------------------------------------------------------------------------
check "13.1780 conflict: exit 3, the conflicted path is printed, nothing is pushed, the summary says conflicted" 'mk conflict; before=$($G -C "$bare" for-each-ref | $G hash-object --stdin); run; [ $rc -eq 3 ] && printf "%s\n" "$out" | grep -qx "CONFLICT a.txt" && printf "%s\n" "$last" | grep -q "^FAIL tipmerge.*conflict" && [ "$($G -C "$bare" for-each-ref | $G hash-object --stdin)" = "$before" ] && [ "$(tip task/x)" = "$exp" ]'
check "13.1780 conflict: CONTROL — the same verb and flags on a clean fixture push (exit 0)" 'mk clean; run; [ $rc -eq 0 ]'
check "13.1780 conflict: several conflicted paths are all listed, each once, and the clean file is not" 'mk conflict; commit_in "$w" task/x c.txt "s/^c$/task-c/" "t2"; commit_in "$w" "$BASE" c.txt "s/^c$/rel-c/" "r2"; $G -C "$w" checkout -q main; exp=$(tip task/x); run; [ $rc -eq 3 ] && [ "$(printf "%s\n" "$out" | grep -c "^CONFLICT ")" = 2 ] && printf "%s\n" "$out" | grep -qx "CONFLICT c.txt" && ! printf "%s\n" "$out" | grep -q "CONFLICT b.txt"'
check "13.1780 conflict: a merge-tree failure that is not a conflict (unrelated histories) is a FAIL with exit 1, not 'conflicted'" 'mk unrelated; run; [ $rc -eq 1 ] && printf "%s\n" "$last" | grep -q "^FAIL tipmerge git merge-tree failed" && ! printf "%s\n" "$out" | grep -qi "conflicted" && [ -n "$exp" ] && [ "$(tip task/x)" = "$exp" ]'

# --- 13.1781: a branch that moved --------------------------------------------------------------------------------------------
check "13.1781 moved: another clone pushed after --expect was read → refuse, exit 1, origin keeps the other push" 'mk clean; $G clone -q "$bare" "$root/m" 2>/dev/null; cfg "$root/m"; commit_in "$root/m" task/x c.txt "s/^c$/moved/" "moved on"; mv_tip=$(tip task/x); run; [ $rc -eq 1 ] && printf "%s\n" "$last" | grep -q "^FAIL tipmerge.*moved" && [ "$(tip task/x)" = "$mv_tip" ] && [ "$mv_tip" != "$exp" ]'
check "13.1781 moved: the refusal names both shas" 'mk clean; $G clone -q "$bare" "$root/m" 2>/dev/null; cfg "$root/m"; commit_in "$root/m" task/x c.txt "s/^c$/moved/" "moved on"; run; printf "%s\n" "$last" | grep -q "${exp:0:12}" && printf "%s\n" "$last" | grep -q "$(tip task/x | cut -c1-12)"'
check "13.1781 moved: CONTROL — with the current tip as --expect the same fixture proceeds" 'mk clean; $G clone -q "$bare" "$root/m" 2>/dev/null; cfg "$root/m"; commit_in "$root/m" task/x c.txt "s/^c$/moved/" "moved on"; exp=$(tip task/x); run; [ $rc -eq 0 ]'
check "13.1782 --expect accepts a 7-character prefix" 'mk clean; exp=${exp:0:7}; run; [ $rc -eq 0 ]'
check "13.1782 --expect that matches no tip refuses even when it is an ancestor of the tip" 'mk clean; exp=$($G -C "$bare" rev-parse "$(tip task/x)^"); run; [ $rc -eq 1 ] && printf "%s\n" "$last" | grep -q "moved"'

# --- 13.1783: a race between the fetch and the push, and a push that did not land ----------------------------------------------
check "13.1783 race: origin/branch moves between the verb's fetch and its push → the plain push is refused, FAIL, origin keeps the racer's commit" 'mk clean; $G clone -q "$bare" "$root/m" 2>/dev/null; cfg "$root/m"; commit_in "$root/m" task/x c.txt "s/^c$/racer/" "racer"; racer=$(tip task/x); $G -C "$bare" update-ref refs/heads/task/x "$exp"; mkdir -p "$w/.git/hooks"; printf "#!/bin/sh\nGIT_DIR=%s git update-ref refs/heads/task/x %s %s\n" "$bare" "$racer" "$exp" > "$w/.git/hooks/pre-push"; chmod +x "$w/.git/hooks/pre-push"; run; [ $rc -eq 1 ] && printf "%s\n" "$last" | grep -q "^FAIL tipmerge" && [ "$(tip task/x)" = "$racer" ]'
check "13.1783 race: CONTROL — the pre-push hook alone (a no-op hook) does not stop a push" 'mk clean; mkdir -p "$w/.git/hooks"; printf "#!/bin/sh\nexit 0\n" > "$w/.git/hooks/pre-push"; chmod +x "$w/.git/hooks/pre-push"; run; [ $rc -eq 0 ]'
check "13.1784 positive proof: a push origin accepted but then undid (post-receive rewind) is a FAIL, not an OK" 'mk clean; mkdir -p "$bare/hooks"; printf "#!/bin/sh\ngit update-ref refs/heads/task/x %s\n" "$exp" > "$bare/hooks/post-receive"; chmod +x "$bare/hooks/post-receive"; run; [ $rc -eq 1 ] && printf "%s\n" "$last" | grep -q "^FAIL tipmerge" && [ "$(tip task/x)" = "$exp" ]'
check "13.1784 an unreachable origin fails (a stale ref must never be merged against)" 'mk clean; $G -C "$w" remote set-url origin "$root/nowhere.git"; run; [ $rc -eq 1 ] && printf "%s\n" "$last" | grep -q "^FAIL tipmerge.*cannot fetch"'

# --- 13.1785: nothing to merge -----------------------------------------------------------------------------------------------
check "13.1785 base already in the branch: exit 0, says it contains the base, no commit, nothing pushed, prints the tip" 'mk contains; before=$($G -C "$bare" for-each-ref | $G hash-object --stdin); run; [ $rc -eq 0 ] && printf "%s\n" "$last" | grep -q "^OK tipmerge task/x $exp .*already contains" && [ "$($G -C "$bare" for-each-ref | $G hash-object --stdin)" = "$before" ]'

# --- 13.1786: --dry-run ------------------------------------------------------------------------------------------------------
check "13.1786 --dry-run on a clean pair: exit 0, names the tree and the push it would make, origin unchanged" 'mk clean; before=$($G -C "$bare" for-each-ref | $G hash-object --stdin); run --dry-run; [ $rc -eq 0 ] && printf "%s\n" "$out" | grep -q "^DRY: git push origin .*:refs/heads/task/x" && printf "%s\n" "$last" | grep -q "^OK tipmerge.*dry-run.*clean" && printf "%s\n" "$last" | grep -q "$itree" && [ "$($G -C "$bare" for-each-ref | $G hash-object --stdin)" = "$before" ]'
check "13.1786 --dry-run on a conflicted pair: exit 3 and the paths, as a real run" 'mk conflict; run --dry-run; [ $rc -eq 3 ] && printf "%s\n" "$out" | grep -qx "CONFLICT a.txt"'
check "13.1786 --dry-run still refuses a moved branch" 'mk clean; $G clone -q "$bare" "$root/m" 2>/dev/null; cfg "$root/m"; commit_in "$root/m" task/x c.txt "s/^c$/moved/" "moved on"; run --dry-run; [ $rc -eq 1 ] && printf "%s\n" "$last" | grep -q "moved"'

# --- 13.1787: no force, ever ---------------------------------------------------------------------------------------------------
V="$HERE/verbs/tipmerge.sh"
pushes() { /usr/bin/grep -E '^[^#]*git +push ' "$1" | /usr/bin/grep -v 'echo'; }
forceful() { /usr/bin/grep -Eq -- '(--force|--delete|--mirror| -f( |$)|push[^#]* \+|:refs/heads/\$\{?base)' ; }
check "13.1787 the verb has exactly one push and it carries no force, delete, mirror or + refspec" '[ -f "$V" ] && [ "$(pushes "$V" | wc -l | tr -d " ")" = 1 ] && ! pushes "$V" | forceful'
check "13.1787 CONTROL — the detector flags every forceful form it exists to catch" 'for l in "git push --force origin x" "git push -f origin x" "git push origin +x:refs/heads/b" "git push --force-with-lease origin x" "git push origin :refs/heads/\$base" "git push --delete origin b"; do printf "%s\n" "$l" | forceful || exit 1; done'
check "13.1787 the push names exactly refs/heads/\$branch" 'pushes "$V" | /usr/bin/grep -q ":refs/heads/\$branch"'

# --- 13.1788: wiring ---------------------------------------------------------------------------------------------------------
check "13.1788 ctl help lists tipmerge" '"$HERE/ctl" help | grep -q "^  tipmerge "'
check "13.1788 selftest.sh runs this suite and a tipmerge refusal step" '/usr/bin/grep -q "tipmerge.test.sh" "$HERE/verbs/selftest.sh" && /usr/bin/grep -q "tipmerge.*refuses" "$HERE/verbs/selftest.sh"'

[ "$fails" -eq 0 ] && echo "tipmerge.test.sh: ok" || { echo "tipmerge.test.sh: $fails FAILED"; exit 1; }
