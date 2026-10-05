#!/usr/bin/env bash
# scripts/ctl/test/batch.test.sh — assertions for `ctl batch` (cases 13.2296–13.2305); run by `ctl selftest`.
# Every case builds a throwaway world: a bare "origin" (main → release/test, task/a…d each changing its own package packages/<x>, PRs #11–#14),
# a batch tree (a clone detached at the release tip), a stand-in primary, and a lanes dir holding roles/QUEUE-review.md. `gh` is a stub on
# PATH and the ctl the verb calls (gate / pr open / land) is a stub through CTL_BATCH_CTL; both log every call (ctl.log; mut.log = every
# mutating call). The gate stub plays a scripted queue (state/gates: green | red <pkg#task>… [timeouts=N] | refuse), records each gated
# sha and tree (state/gated), and refuses a HEAD that is not the sha or a dirty tree, as the real gate does; land merges the batch PR's head
# into origin's base --no-ff, as `gh pr merge --merge` does; the gh stub reports a member MERGED once its head is in that base (GitHub's
# rule) unless a case removes state/automark. No network, no real gate, no real PR.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fails=0
. "$HERE/test/harness.sh"   # check NAME CODE, and the CTL_TEST_ONLY case filter
G=/usr/bin/git
BASE=release/test
unset CTL_DRY_RUN CTL_BATCH_REPO
TOP="$(cd "$(mktemp -d "${TMPDIR:-/tmp}/ctl-batch-test.XXXXXX")" && pwd -P)"
STUBS="$TOP/stubs"; mkdir -p "$STUBS/bin"
trap 'rm -rf "$TOP"' EXIT
export GIT_AUTHOR_NAME=fixture GIT_AUTHOR_EMAIL=fixture@example.invalid GIT_COMMITTER_NAME=fixture GIT_COMMITTER_EMAIL=fixture@example.invalid

cat > "$STUBS/bin/gh" <<'PY'
#!/usr/bin/env python3
# gh stub: PR #n is $BT_STATE/pr-<n>.json; `pr view --json` reads (and reports MERGED once the head is in origin's base, while state/automark
# exists); every other call is a mutation, logged to mut.log; `pr close` records the state and the comment.
import json, os, subprocess, sys
S, a = os.environ['BT_STATE'], sys.argv[1:]
with open(os.path.join(S, 'gh.log'), 'a') as f:
    f.write(' '.join(a) + '\n')
path = lambda n: os.path.join(S, f'pr-{n}.json')
if a[:2] == ['pr', 'view'] and '--json' in a:
    if not os.path.exists(path(a[2])):
        sys.stderr.write('no pull requests found\n')
        sys.exit(1)
    d = json.load(open(path(a[2])))
    if d['state'] == 'OPEN' and os.path.exists(os.path.join(S, 'automark')):
        r = subprocess.run(['git', '-C', os.environ['BT_BARE'], 'merge-base', '--is-ancestor', d['headRefOid'], 'refs/heads/' + d['baseRefName']], capture_output=True)
        if r.returncode == 0:
            d['state'] = 'MERGED'
    print(json.dumps({k: d.get(k) for k in a[a.index('--json') + 1].split(',')}))
    sys.exit(0)
with open(os.path.join(S, 'mut.log'), 'a') as f:
    f.write('gh ' + ' '.join(a) + '\n')
if a[:2] == ['pr', 'close'] and os.path.exists(path(a[2])):
    d = json.load(open(path(a[2])))
    d['state'], d['comment'] = 'CLOSED', (a[a.index('--comment') + 1] if '--comment' in a else '')
    json.dump(d, open(path(a[2]), 'w'))
    sys.exit(0)
sys.exit(1)
PY
cat > "$STUBS/ctl" <<'PY'
#!/usr/bin/env python3
# ctl stub (CTL_BATCH_CTL): gate | pr open | land, each logged to ctl.log and mut.log.
import json, os, shutil, subprocess, sys
S, a = os.environ['BT_STATE'], sys.argv[1:]
for log, pre in (('ctl.log', ''), ('mut.log', 'ctl ')):
    with open(os.path.join(S, log), 'a') as f:
        f.write(pre + ' '.join(a) + '\n')
opt = lambda k: a[a.index(k) + 1]
git = lambda *x, cwd: subprocess.run(['git', *x], cwd=cwd, capture_output=True, text=True)
def say(line, rc):
    print(line)
    sys.exit(rc)
if a[0] == 'gate':
    sha, repo = a[1], opt('--repo')
    head = git('rev-parse', 'HEAD', cwd=repo).stdout.strip()
    if head != sha:
        say(f'FAIL gate HEAD {head} is not {sha}', 1)
    if git('status', '--porcelain', cwd=repo).stdout.strip():
        say('FAIL gate tree is dirty', 1)
    gated = os.path.join(S, 'gated')
    k = len(open(gated).read().splitlines()) if os.path.exists(gated) else 0
    plan = open(os.path.join(S, 'gates')).read().splitlines() if os.path.exists(os.path.join(S, 'gates')) else []
    step = plan[k].split() if k < len(plan) and plan[k].strip() else ['green']
    if step[0] == 'refuse':
        say(f'FAIL gate origin/{opt("--base")} 0123456789ab is not an ancestor of HEAD {sha[:12]} — a --merge landing would produce a tree this gate never saw', 1)
    with open(gated, 'a') as f:
        f.write(f'{sha} {git("rev-parse", "HEAD^{tree}", cwd=repo).stdout.strip()}\n')
    if step[0] == 'green':
        mv = os.path.join(S, 'move-on-gate')   # "<n> <sha>": PR #n's head moves while the gate runs
        if os.path.exists(mv):
            n, new = open(mv).read().split()
            p = os.path.join(S, f'pr-{n}.json')
            d = json.load(open(p))
            d['headRefOid'] = new
            json.dump(d, open(p, 'w'))
        say(f'OK gate {sha} EXIT=0 · mode=cached · Tasks: 46 successful, 46 total', 0)
    log = os.path.join(S, f'gate-{k + 1}.log')
    with open(log, 'w') as f:
        f.write(' Tasks:    30 successful, 46 total\n' + ''.join(f'Failed:    {t}\n' for t in step[1:] if '#' in t))
    extra = ' '.join(t for t in step[1:] if '=' in t) or 'engine=0 timeouts=0 orphans=0'
    say(f'FAIL gate EXIT=1 · mode=cached · Tasks: 30 successful, 46 total · NODE=v22.22.2 · {extra} (log {log})', 1)
if a[:2] == ['pr', 'open']:
    branch, repo, base, body = a[2], opt('--repo'), opt('--base'), opt('--body')
    if git('branch', '--show-current', cwd=repo).stdout.strip() != branch:
        say(f'FAIL pr-open checked-out branch is not {branch}', 1)
    if not os.path.isabs(body) or not os.path.isfile(body):
        say('FAIL pr-open usage: ctl pr open <branch> --title T --body FILE', 1)
    head = git('rev-parse', 'HEAD', cwd=repo).stdout.strip()
    if git('push', '-q', '-u', 'origin', branch, cwd=repo).returncode:
        say('FAIL pr-open push rejected', 1)
    n = 900 + len([f for f in os.listdir(S) if f.startswith('pr-9')])
    json.dump({'number': n, 'state': 'OPEN', 'baseRefName': base, 'headRefName': branch, 'headRefOid': head, 'title': opt('--title')},
              open(os.path.join(S, f'pr-{n}.json'), 'w'))
    shutil.copy(body, os.path.join(S, f'body-{n}.md'))
    say(f'OK pr-open #{n} head {head[:12]} base {base}', 0)
if a[0] == 'land':
    n, base = a[1], opt('--base')
    p, L = os.path.join(S, f'pr-{n}.json'), os.path.join(S, 'lander')
    d = json.load(open(p))
    if not os.path.isdir(L):
        subprocess.run(['git', 'clone', '-q', os.environ['BT_BARE'], L], capture_output=True)
    git('fetch', '-q', 'origin', cwd=L)
    git('checkout', '-q', '-B', base, 'origin/' + base, cwd=L)
    if not os.path.exists(os.path.join(S, 'land-hollow')):   # land-hollow: reports MERGED but moves nothing (the reachability guard's fixture)
        git('merge', '-q', '--no-ff', '--no-edit', d['headRefOid'], cwd=L)
        git('push', '-q', 'origin', base, cwd=L)
    mc = git('rev-parse', 'HEAD', cwd=L).stdout.strip()
    mv = os.path.join(S, 'move-on-land')   # "<n> <sha>": PR #n's head moves right after the landing
    if os.path.exists(mv):
        m, new = open(mv).read().split()
        q = os.path.join(S, f'pr-{m}.json')
        e = json.load(open(q))
        e['headRefOid'] = new
        json.dump(e, open(q, 'w'))
    d['state'], d['mergeCommit'] = 'MERGED', {'oid': mc}
    json.dump(d, open(p, 'w'))
    say(f'OK land #{n} merge {mc[:12]} {base} {mc[:12]} primary untouched', 0)
say(f'FAIL stub-ctl unknown verb {a}', 64)
PY
chmod +x "$STUBS/bin/gh" "$STUBS/ctl"

cfg() { $G -C "$1" config user.name fixture; $G -C "$1" config user.email fixture@example.invalid; $G -C "$1" config commit.gpgsign false; }
sha() { $G -C "$bare" rev-parse "refs/heads/$1"; }
# mem NAME [SHELL] — task/NAME cut from origin's CURRENT release tip and pushed; SHELL (run in the clone) makes its change, by default a line
# in its own package file packages/NAME/NAME.txt.
mem() {
  local name="$1" cmd="${2:-echo $1-change >> packages/$1/$1.txt}"
  ( cd "$w" && $G fetch -q origin && $G checkout -q -B "task/$name" "origin/$BASE" && eval "$cmd" && $G add -A && $G commit -q -m "task $name" && $G push -q origin "task/$name" 2>/dev/null )
}
# pr N BRANCH [STATE] [BASE] — the gh stub's PR #N at BRANCH's origin tip.
pr() { printf '{"number":%s,"state":"%s","baseRefName":"%s","headRefName":"%s","headRefOid":"%s"}\n' "$1" "${3:-OPEN}" "${4:-$BASE}" "$2" "$(sha "$2")" > "$S/pr-$1.json"; }
# ready BRANCH VERDICT [SHA] — a reviewer verdict line appended to the queue (the live grammar: HH:MM DONE <time> <verdict> <branch> <sha8>).
ready() { local s="${3:-$(sha "$1")}"; printf '13:%02d DONE 12:00 %s %s %s (reviewer A, FULL; scan-tests 1/1)\n' "$(( $(wc -l < "$Q") % 60 ))" "$2" "$1" "${s:0:8}" >> "$Q"; }
# mk — a fresh world. task/a and task/b are cut BEFORE a second release commit (they need the tip), task/c and task/d after it (they contain it,
# so a fast-forward could swallow them). PRs #11–#14 = a–d, READY in that queue order. The batch tree is detached at the release tip.
NMK=0
mk() {
  NMK=$((NMK+1)); root="$TOP/w$NMK"; mkdir -p "$root"
  bare="$root/origin.git"; w="$root/w"; T="$root/batch"; P="$root/primary"; S="$root/state"; Q="$root/lanes/roles/QUEUE-review.md"
  mkdir -p "$S" "$root/lanes/roles" "$root/logs"
  $G init -q --bare -b main "$bare"; $G clone -q "$bare" "$w" 2>/dev/null; cfg "$w"
  ( cd "$w" && for x in a b c d; do mkdir -p "packages/$x"; printf '{"name":"@t/%s"}\n' "$x" > "packages/$x/package.json"; echo "$x" > "packages/$x/$x.txt"; done
    mkdir -p apps/server/migrations packages/domain/test apps/mobile/src/editor
    echo 'create table a();' > apps/server/migrations/1000_a.sql
    for i in $(seq 1 20); do echo "line $i"; done > shared.txt
    printf '%s\n' "describe('x', () => {" "    expect(TICKET_EVENT_TYPES).toHaveLength(17);" "  // 1" "  // 2" "  // 3" "  // 4" "  // 5" "    expect(other).toBe(1);" "  // 6" "});" > packages/domain/test/ticket-state.test.ts
    echo 'export const html = "v1";' > apps/mobile/src/editor/editor-html.generated.ts
    echo 'lock: 1' > pnpm-lock.yaml
    $G add -A && $G commit -q -m base && $G push -q origin main 2>/dev/null
    $G checkout -q -b "$BASE" && echo r1 > rel.txt && $G add rel.txt && $G commit -q -m "release 1" && $G push -q origin "$BASE" 2>/dev/null )
  mem a; mem b
  ( cd "$w" && $G checkout -q "$BASE" && $G pull -q --ff-only origin "$BASE" 2>/dev/null; echo r2 > rel2.txt && $G add rel2.txt && $G commit -q -m "release 2" && $G push -q origin "$BASE" 2>/dev/null )
  mem c; mem d
  $G clone -q "$bare" "$T" 2>/dev/null; cfg "$T"; $G -C "$T" checkout -q --detach "origin/$BASE"
  $G clone -q "$bare" "$P" 2>/dev/null
  : > "$Q"; touch "$S/automark"
  export BT_STATE="$S" BT_BARE="$bare" CTL_LANES_DIR="$root/lanes" GISIK_PRIMARY="$P" CTL_LOG_DIR="$root/logs"
  local n=11 x; for x in a b c d; do pr "$n" "task/$x"; ready "task/$x" READY; n=$((n+1)); done
}
CTLBIN="$HERE/ctl"
run() { out=$(PATH="$STUBS/bin:$PATH" CTL_BATCH_CTL="$STUBS/ctl" CTL_BATCH_INSTALL="echo install >> '$S/install.log'" CTL_BATCH_NOW=20261005T1441 CTL_BATCH_POLL=2 CTL_BATCH_POLL_SECS=0 "$CTLBIN" batch "$@" 2>&1); rc=$?; last=$(printf '%s\n' "$out" | tail -1); }
b() { run "$BASE" "$@" --repo "$T"; }                       # b <pr>… [--dry-run]
says() { printf '%s\n' "$out" | grep -q -- "$1"; }
summary() { printf '%s\n' "$last" | grep -q -- "$1"; }
ncalls() { cat "$S/ctl.log" 2>/dev/null | awk -v p="$1 " 'index($0, p) == 1 {n++} END {print n + 0}'; }
ngated() { cat "$S/gated" 2>/dev/null | wc -l | tr -d ' '; }
gated() { sed -n "${1}p" "$S/gated" | cut -d' ' -f1; }      # the sha gate k ran on
gtree() { sed -n "${1}p" "$S/gated" | cut -d' ' -f2; }      # and its tree
inside() { $G -C "$T" merge-base --is-ancestor "$1" "$2"; }  # inside <sha> <union>
originrefs() { $G -C "$bare" for-each-ref --format='%(refname) %(objectname)' | $G hash-object --stdin; }
treestate() { printf '%s|%s|%s|%s\n' "$($G -C "$T" rev-parse HEAD)" "$($G -C "$T" symbolic-ref -q HEAD)" "$($G -C "$T" status --porcelain)" "$($G -C "$T" for-each-ref --format='%(refname) %(objectname)' refs/heads)"; }
seconds() { $G -C "$T" rev-list --first-parent --reverse --parents "$2..$1" | awk 'NF == 3 {printf "%s ", $3}'; }   # 2nd parents, union $1 back to $2
prf() { python3 - "$S/pr-$1.json" "$2" <<'PY'
import json, sys
v = json.load(open(sys.argv[1]))
for k in sys.argv[2].split('.'):
    v = v.get(k) if isinstance(v, dict) else None
print('' if v is None else v)
PY
}
shared_edit() { mem "$1" "sed -i.bak 2s/.*/$1/ shared.txt && rm -f shared.txt.bak"; pr "$2" "task/$1"; ready "task/$1" READY; }   # line 2 of shared.txt: two of these conflict
mig() { mem "$1" "$3"; pr "$2" "task/$1"; ready "task/$1" READY; }
TS=packages/domain/test/ticket-state.test.ts
rewrite() { mem "$1" "sed -i.bak 's/expect(TICKET_EVENT_TYPES).toHaveLength(17)/expect(TICKET_EVENT_TYPES.length).toBe(18)/' $TS && rm -f $TS.bak"; pr "$2" "task/$1"; ready "task/$1" READY; }   # the pin line rewritten: only its OLD form matches
bump() { mem "$1" "sed -i.bak 's/toHaveLength(17)/toHaveLength(18)/' $TS && rm -f $TS.bak"; pr "$2" "task/$1"; ready "task/$1" READY; }
other_line() { mem "$1" "sed -i.bak 's/toBe(1)/toBe(2)/' $TS && rm -f $TS.bak"; pr "$2" "task/$1"; ready "task/$1" READY; }
tail_line() { mem "$1" "echo '// tail' >> $TS"; pr "$2" "task/$1"; ready "task/$1" READY; }
bundle() { mem "$1" "echo 'export const html = \"$1\";' > apps/mobile/src/editor/editor-html.generated.ts"; pr "$2" "task/$1"; ready "task/$1" READY; }
# tipmerge_a [hand|side] — task/a merges origin's release tip (the tip moved since a was cut) and is pushed; PR #11 moves to that merge. `hand`
# amends the merge with an edit of its own: two parents still, but its tree is no longer the auto-merge. `side` merges task/c (not on the
# base) instead: a clean auto-merge, but of unreviewed work.
tipmerge_a() {
  local with="origin/$BASE"; [ "${1:-}" != side ] || with=origin/task/c
  ( cd "$w" && $G fetch -q origin && $G checkout -q -B task/a origin/task/a && $G merge -q --no-edit "$with" \
    && { [ "${1:-}" != hand ] || { echo hand >> packages/a/a.txt && $G commit -q -a --amend --no-edit; }; } && $G push -q origin task/a 2>/dev/null ) && pr 11 task/a
}
noise_lines() { local h; h=$(sha "$1"); printf '%s\n' "13:51 DONE 12:00 RIDER $h $1 ${h:0:8} (reviewer C)" "13:52 DONE 12:00 $1 ${h:0:8} (reviewer A, VOID)" \
  "13:53 REVIEW $1 $h base=origin/$BASE" "13:54 TOOK 13:53 $1 ${h:0:8} (reviewer B, pull, FULL)" >> "$Q"; }

# --- 13.2296: arguments, main, the batch tree --------------------------------------------------------------------------------------------
check "13.2296 main is refused before any call: exit 1, the FAIL names main, no gh call, no ctl call, the batch tree untouched" \
  'mk && s0=$(treestate) && run main 11 12 --repo "$T" && [ $rc -eq 1 ] && summary "^FAIL batch main refused" && [ ! -e "$S/gh.log" ] && [ ! -e "$S/ctl.log" ] && [ "$(treestate)" = "$s0" ]'
check "13.2296 CONTROL — the same call against the release base reads the PRs (a non-empty gh log), so main's empty log is the guard working" \
  'mk && b 11 12 --dry-run && [ $rc -eq 0 ] && [ -s "$S/gh.log" ]'
check "13.2296 a base that is no release branch, 1 or 5 PRs, a non-number, a PR named twice and an unknown flag each refuse, exit 1, before any gh call" \
  'mk && run feat/x 11 12 --repo "$T" && [ $rc -eq 1 ] && summary "release/<name> only" && b 11 && [ $rc -eq 1 ] && summary "2-4 PRs, got 1" \
   && b 11 12 13 14 15 && [ $rc -eq 1 ] && summary "got 5" && b 11 x1 && [ $rc -eq 1 ] && summary "not a PR number" && b 11 11 && [ $rc -eq 1 ] && summary "named twice" \
   && b 11 12 --force && [ $rc -eq 1 ] && summary "unknown arg --force" && [ ! -e "$S/gh.log" ]'
check "13.2296 the batch tree may not be the primary, a tree standing on a branch (a lane's task/*: the remedy names checkout --detach), a dirty tree or no worktree; nothing is read from GitHub" \
  'mk && run "$BASE" 11 12 --repo "$P" && [ $rc -eq 1 ] && says "is the primary checkout" \
   && $G -C "$T" checkout -q task/a && b 11 12 --dry-run && [ $rc -eq 1 ] && says "stands on task/a" && says "checkout --detach" \
   && $G -C "$T" checkout -q --detach && echo x >> "$T/rel.txt" && b 11 12 --dry-run && [ $rc -eq 1 ] && says "is dirty" \
   && $G -C "$T" checkout -q -- rel.txt && run "$BASE" 11 12 --repo "$root/nowhere" && [ $rc -eq 1 ] && says "not the top of a git worktree" && [ ! -e "$S/gh.log" ]'
check "13.2296 CONTROL — a tree on a batch/* branch is a batch tree (the previous batch leaves it there)" \
  'mk && $G -C "$T" checkout -q -b batch/test-old && b 11 12 --dry-run && [ $rc -eq 0 ]'
check "13.2296 the checkout holding the running ctl is refused as the batch tree (a checkout there would rewrite the verb mid-run)" \
  'mk && mkdir -p "$T/scripts" && cp -R "$HERE" "$T/scripts/ctl" && $G -C "$T" add -A && $G -C "$T" commit -q -m ctl-copy && CTLBIN="$T/scripts/ctl/ctl" b 11 12 --dry-run && [ $rc -eq 1 ] && says "holds the ctl that is running" && [ ! -e "$S/gh.log" ]'
check "13.2296 one batch per tree: a lock held by a live pid refuses (nothing gated); a dead holder's lock is taken over and released at the end" \
  'mk && d="$($G -C "$T" rev-parse --absolute-git-dir)/ctl/batch.lock.d" && mkdir -p "$d" && echo $$ > "$d/pid" && b 11 12 && [ $rc -eq 1 ] && summary "another ctl batch (pid $$)" && [ ! -e "$S/ctl.log" ] \
   && echo 999999 > "$d/pid" && b 11 12 && [ $rc -eq 0 ] && [ ! -e "$d" ]'

# --- 13.2297: READY ------------------------------------------------------------------------------------------------------------------------
check "13.2297 a PR with no READY / needs-tip line naming its head is refused (the PR and the rule named); the WHOLE call refuses, nothing merged, gated or pushed" \
  'mk && : > "$Q" && ready task/a READY && o0=$(originrefs) && s0=$(treestate) && b 11 12 && [ $rc -eq 1 ] && says "^REFUSE #12 (ready) no READY or needs-tip line" && ! says "^REFUSE #11" \
   && summary "^FAIL batch refused: 1 refusal(s) on #12" && [ "$(originrefs)" = "$o0" ] && [ "$(treestate)" = "$s0" ] && [ ! -e "$S/ctl.log" ] && [ ! -e "$S/mut.log" ]'
check "13.2297 a needs-tip line names a head as a READY line does (CONTROL for the refusals around it)" \
  'mk && : > "$Q" && ready task/a needs-tip && ready task/b READY && b 11 12 --dry-run && [ $rc -eq 0 ]'
check "13.2297 a FIX after the READY line refuses the PR (rule ready, the FIX line quoted); CONTROL — a FIX BEFORE the READY line, or a later FIX of ANOTHER branch, does not" \
  'mk && : > "$Q" && ready task/a READY && ready task/b READY && ready task/a FIX && b 11 12 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #11 (ready) FIX after READY: queue line 3" \
   && : > "$Q" && ready task/a FIX && ready task/a READY && ready task/b READY && ready task/c FIX && b 11 12 --dry-run && [ $rc -eq 0 ]'
check "13.2297 RIDER, VOID, REVIEW and TOOK lines naming the head are no READY; a READY naming an OLDER sha of the branch is none either" \
  'mk && : > "$Q" && noise_lines task/a && ready task/b READY && b 11 12 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #11 (ready) no READY" \
   && : > "$Q" && ready task/a READY "$($G -C "$bare" rev-parse task/a^)" && ready task/b READY && b 11 12 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #11 (ready) no READY"'
check "13.2297 a needs-tip line admits the CLEAN tip merge of the sha it names; a hand-edited merge (its tree is not the auto-merge), a clean merge of a branch NOT on the base, and a READY (not needs-tip) naming the pre-merge sha are refused" \
  'mk && : > "$Q" && ready task/a needs-tip && ready task/b READY && tipmerge_a && b 11 12 --dry-run && [ $rc -eq 0 ] \
   && mk && : > "$Q" && ready task/a needs-tip && ready task/b READY && tipmerge_a hand && b 11 12 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #11 (ready) no READY" \
   && mk && : > "$Q" && ready task/a needs-tip && ready task/b READY && tipmerge_a side && [ "$($G -C "$bare" rev-list --parents -n 1 task/a | wc -w)" -eq 3 ] && b 11 12 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #11 (ready) no READY" \
   && mk && : > "$Q" && ready task/a READY && ready task/b READY && tipmerge_a && b 11 12 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #11 (ready) no READY"'
check "13.2297 a head already on origin/<base>, a PR that is not OPEN and a PR against another base are refused, each naming the PR" \
  'mk && pr 11 "$BASE" && ready "$BASE" READY && pr 12 task/b CLOSED && pr 13 task/c OPEN release/other && b 11 12 13 --dry-run && [ $rc -eq 1 ] \
   && says "^REFUSE #11 (ready) head .* is already on origin/$BASE" && says "^REFUSE #12 (pr) is CLOSED, not OPEN" && says "^REFUSE #13 (pr) targets release/other, not $BASE"'

# --- 13.2298: rule (b), migrations ---------------------------------------------------------------------------------------------------------
check "13.2298 two migrations in the union refuse the second PR in READY order (rule b, naming the first); CONTROL — one migration above the tip passes" \
  'mk && mig e 15 "echo x > apps/server/migrations/1001_e.sql" && mig f 16 "echo x > apps/server/migrations/1002_f.sql" && b 16 15 --dry-run && [ $rc -eq 1 ] \
   && says "^REFUSE #16 (b) a second migration in the union: apps/server/migrations/1002_f.sql (#15 brings apps/server/migrations/1001_e.sql)" && ! says "^REFUSE #15" \
   && b 15 11 --dry-run && [ $rc -eq 0 ]'
check "13.2298 a migration whose prefix is not above every one on the tip (equal, below) is refused; one PR bringing two migrations is refused" \
  'mk && mig g 15 "echo x > apps/server/migrations/1000_g.sql" && mig h 16 "echo x > apps/server/migrations/0999_h.sql" && mig i 17 "echo x > apps/server/migrations/1003_i.sql && echo y > apps/server/migrations/1004_i.sql" \
   && b 15 11 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #15 (b) migration apps/server/migrations/1000_g.sql: prefix 1000 is not above the highest on origin/$BASE (1000)" \
   && b 16 11 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #16 (b) migration apps/server/migrations/0999_h.sql: prefix 999" && b 17 11 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #17 (b) 2 migrations in one PR"'

# --- 13.2299: rule (c), always alone -------------------------------------------------------------------------------------------------------
alone_leg() { mk && mem e "$1" && pr 15 task/e && ready task/e READY && b 15 11 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #15 (c) always alone: $2"; }
check "13.2299 always alone (rule c): pnpm-lock.yaml, a Dockerfile*, scripts/ctl/verbs/gate.sh, docs/lanes/gate-lock/*, a new workspace package" \
  'alone_leg "echo lock: 2 > pnpm-lock.yaml" "touches pnpm-lock.yaml" && alone_leg "mkdir -p apps/web && echo FROM x > apps/web/Dockerfile.dev" "touches apps/web/Dockerfile.dev (Dockerfile" \
   && alone_leg "mkdir -p scripts/ctl/verbs && echo x > scripts/ctl/verbs/gate.sh" "touches scripts/ctl/verbs/gate.sh (the gate itself" \
   && alone_leg "mkdir -p docs/lanes/gate-lock && echo x > docs/lanes/gate-lock/locked-test.sh" "touches docs/lanes/gate-lock/locked-test.sh (the gate itself" \
   && alone_leg "mkdir -p packages/zeta && echo {} > packages/zeta/package.json" "creates a package (packages/zeta/package.json)"'
check "13.2299 CONTROL — changing an EXISTING package.json, and adding one outside apps/* and packages/* (a test fixture), create no package" \
  'mk && mem e "echo \" \" >> packages/a/package.json && mkdir -p scripts/fx/packages/pk && echo {} > scripts/fx/packages/pk/package.json" && pr 15 task/e && ready task/e READY && b 15 12 --dry-run && [ $rc -eq 0 ]'

# --- 13.2300: rule (d), shared count pins --------------------------------------------------------------------------------------------------
check "13.2300 two PRs bumping one shared count pin refuse the later in READY order (rule d), naming the pin and the earlier PR — they merge cleanly and then fail" \
  'mk && bump e 15 && bump f 16 && b 16 15 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #16 (d) shared count pin \"the ticket-state event-type count (17/18/19)\" ($TS) is also bumped by #15" && ! says "^REFUSE #15"'
check "13.2300 CONTROL — two PRs changing OTHER lines of a pin's file pass (the pin is its line); a whole-file pin (the generated editor bundle) changed by two refuses" \
  'mk && other_line e 15 && tail_line f 16 && b 15 16 --dry-run && [ $rc -eq 0 ] && mk && bundle e 15 && bundle f 16 && b 15 16 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #16 (d) shared count pin \"the generated mobile editor bundle\""'
check "13.2300 a pin line REWRITTEN by the second PR still counts through its old form (the removed line matches)" \
  'mk && bump e 15 && rewrite f 16 && b 15 16 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #16 (d) shared count pin \"the ticket-state event-type count"'
# tip_moves — after every member was cut, the tip bumps the ticket-state count and changes pnpm-lock.yaml: changes no member made.
tip_moves() { ( cd "$w" && $G fetch -q origin && $G checkout -q -B "$BASE" "origin/$BASE" && sed -i.bak 's/toHaveLength(17)/toHaveLength(18)/' $TS && rm -f $TS.bak && echo 'lock: 9' > pnpm-lock.yaml \
  && $G commit -q -am "tip moves" && $G push -q origin "$BASE" 2>/dev/null ); }
check "13.2300 the rules read each member's OWN diff (three dots, from its merge base): a pin bump and a pnpm-lock.yaml change the tip made after the members were cut are charged to no member" \
  'mk && other_line e 15 && tail_line f 16 && tip_moves && b 15 16 11 --dry-run && [ $rc -eq 0 ] && ! says "^REFUSE"'
# pins_live PY [EXTRA] — every SHARED_PINS file exists in the checkout running this suite and each pattern matches a line of it (EXTRA: one
# more pin as a JSON triple, for the control).
pins_live() { python3 - "$1" "$($G -C "$HERE" rev-parse --show-toplevel)" "${2:-}" <<'PY'
import importlib.util, json, os, re, sys
spec = importlib.util.spec_from_file_location('batch', sys.argv[1])
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
pins = list(b.SHARED_PINS) + ([tuple(json.loads(sys.argv[3]))] if sys.argv[3] else [])
bad = [p for p in pins if not os.path.isfile(os.path.join(sys.argv[2], p[1]))
       or (p[2] and not any(re.search(p[2], l) for l in open(os.path.join(sys.argv[2], p[1]), errors='replace')))]
for p in bad:
    print(f'       (pin not live: {p[0]} {p[1]})')
sys.exit(1 if bad or len(b.SHARED_PINS) < 5 else 0)
PY
}
check "13.2300 every SHARED_PINS file exists in this checkout and its pattern matches a line (a renamed pin reddens here instead of passing every batch); CONTROL — a pin that matches nothing is caught" \
  'pins_live "$HERE/verbs/batch.py" && ! pins_live "$HERE/verbs/batch.py" "[\"x\", \"$TS\", \"NO_SUCH_PIN\"]" >/dev/null'

# --- 13.2301: the union --------------------------------------------------------------------------------------------------------------------
check "13.2301 READY order, not argument order, and every member its OWN --no-ff merge commit: second parents along the union's first-parent line = the heads in queue order, even for heads that contain the tip (a fast-forward would swallow them)" \
  'mk && : > "$Q" && ready task/c READY && ready task/d READY && ready task/a READY && bt=$(sha "$BASE") && b 11 13 14 && [ $rc -eq 0 ] \
   && [ "$(printf "%s\n" "$out" | grep "^ORDER" | cut -d" " -f3 | tr "\n" " ")" = "#13 #14 #11 " ] && [ "$(seconds "$(gated 1)" "$bt")" = "$(sha task/c) $(sha task/d) $(sha task/a) " ] \
   && [ "$($G -C "$T" rev-parse "$(gated 1)~3")" = "$bt" ]'
check "13.2301 a conflict aborts that ONE merge and ejects that PR (EJECT names the path), the rest are merged and gated in a clean tree, and the ejected PR is reported" \
  'mk && shared_edit e 15 && shared_edit f 16 && b 15 16 11 && [ $rc -eq 0 ] && says "^EJECT #16 task/f .* conflict: shared.txt" && [ "$(ngated)" = 1 ] \
   && inside "$(sha task/e)" "$(gated 1)" && ! inside "$(sha task/f)" "$(gated 1)" && inside "$(sha task/a)" "$(gated 1)" && says "^MEMBER #16 task/f .* ejected: conflict (shared.txt)" && [ "$(prf 16 state)" = OPEN ]'
check "13.2301 fewer than 2 left after the conflicts: gate singly, exit 3, no gate, no PR, nothing pushed" \
  'mk && shared_edit e 15 && shared_edit f 16 && b 15 16 && [ $rc -eq 3 ] && summary "^FAIL batch gate singly" && [ ! -e "$S/ctl.log" ] && [ -z "$($G -C "$bare" for-each-ref refs/heads/batch)" ]'
check "13.2301 a member an earlier member already carries (a stack whose upper task is READY first) is CONTAINED, merged once, and lands with it" \
  'mk && ( cd "$w" && $G checkout -q -B task/g origin/task/a && echo g >> packages/a/a.txt && $G commit -q -am g && $G push -q origin task/g 2>/dev/null ) && pr 15 task/g \
   && : > "$Q" && ready task/g READY && ready task/a READY && b 11 15 && [ $rc -eq 0 ] && says "^CONTAINED #11 task/a" && [ "$(ncalls gate)" = 1 ] && says "^MEMBER #11 task/a .* merged"'

# --- 13.2302: green ------------------------------------------------------------------------------------------------------------------------
check "13.2302 green: ONE gate (the union sha, --base, --repo the batch tree), ONE pr open of batch/<pool>-<stamp> (the gated sha, a body listing every member PR and head sha), ONE land of that PR; install ran once" \
  'mk && b 11 12 && [ $rc -eq 0 ] && [ "$(ncalls gate)" = 1 ] && [ "$(ncalls "pr open")" = 1 ] && [ "$(ncalls land)" = 1 ] && grep -Fqx "gate $(gated 1) --base $BASE --repo $T" "$S/ctl.log" \
   && grep -Eq "^pr open batch/test-20261005T1441 --title .* --base $BASE --repo $T\$" "$S/ctl.log" && grep -Fqx "land 900 --base $BASE --repo $T" "$S/ctl.log" \
   && [ "$(sha batch/test-20261005T1441)" = "$(gated 1)" ] && grep -Fq "#11 \`task/a\` \`$(sha task/a)\`" "$S/body-900.md" && grep -Fq "#12 \`task/b\` \`$(sha task/b)\`" "$S/body-900.md" \
   && [ "$(wc -l < "$S/install.log" | tr -d " ")" = 1 ]'
check "13.2302 green: members GitHub marked merged are reported merged and NOT closed; OK summary, exit 0, a MEMBER line each, every head in origin/<base>" \
  'mk && b 11 12 13 && [ $rc -eq 0 ] && summary "^OK batch #900 landed" && says "^MEMBER #11 task/a .* merged" && says "^MEMBER #13 task/c .* merged" && ! grep -q "pr close" "$S/mut.log" \
   && $G -C "$bare" merge-base --is-ancestor "$(sha task/a)" "$BASE" && $G -C "$bare" merge-base --is-ancestor "$(sha task/c)" "$BASE"'
closed_by_batch() { [ "$(prf "$1" state)" = CLOSED ] && prf "$1" comment | grep -q "#900" && prf "$1" comment | grep -q "$(prf 900 mergeCommit.oid)"; }
check "13.2302 a member GitHub did not mark merged is closed with a comment naming the batch PR and the landed sha" \
  'mk && rm "$S/automark" && b 11 12 && [ $rc -eq 0 ] && closed_by_batch 11 && closed_by_batch 12 && says "^MEMBER #11 task/a .* closed (landed in #900 at"'
check "13.2302 a member whose head is NOT in origin/<base> after the landing is never closed: left open, the call FAILS naming it" \
  'mk && rm "$S/automark" && touch "$S/land-hollow" && b 11 12 && [ $rc -eq 1 ] && [ "$(prf 11 state)" = OPEN ] && [ "$(prf 12 state)" = OPEN ] && ! grep -q "pr close" "$S/mut.log" \
   && says "^MEMBER #11 task/a .* NOT in origin/$BASE" && summary "need a hand: #11 #12"'
check "13.2302 a member whose PR head moved right after the landing is never closed (live work): left open, the call FAILS naming it" \
  'mk && rm "$S/automark" && echo "12 $(sha task/c)" > "$S/move-on-land" && b 11 12 && [ $rc -eq 1 ] && [ "$(prf 12 state)" = OPEN ] && closed_by_batch 11 && says "^MEMBER #12 task/b .* left OPEN: its head is" && summary "need a hand: #12 (log"'
check "13.2302 a member whose PR head moved after the union was built is not landed: no pr open, no land, the FAIL names it" \
  'mk && echo "12 $(sha task/c)" > "$S/move-on-gate" && b 11 12 && [ $rc -eq 1 ] && [ "$(ncalls gate)" = 1 ] && [ "$(ncalls "pr open")" = 0 ] && [ "$(ncalls land)" = 0 ] && summary "#12 moved since the union was built"'

# --- 13.2303: red, one member --------------------------------------------------------------------------------------------------------------
check "13.2303 red in ONE member's package: FIX candidate names it, the union is rebuilt WITHOUT it and gated again (two gates, one install), then lands; the candidate stays open and out of the base" \
  'mk && printf "red @t/b#test\ngreen\n" > "$S/gates" && b 11 12 13 && [ $rc -eq 0 ] && [ "$(ngated)" = 2 ] && says "^FIX candidate: #12 " && inside "$(sha task/b)" "$(gated 1)" \
   && ! inside "$(sha task/b)" "$(gated 2)" && [ "$(gtree 1)" != "$(gtree 2)" ] && inside "$(sha task/a)" "$(gated 2)" && inside "$(sha task/c)" "$(gated 2)" && [ "$(prf 12 state)" = OPEN ] \
   && ! $G -C "$bare" merge-base --is-ancestor "$(sha task/b)" "$BASE" && says "^MEMBER #12 task/b .* ejected: FIX candidate" && [ "$(ncalls land)" = 1 ] && [ "$(wc -l < "$S/install.log" | tr -d " ")" = 1 ]'

# --- 13.2304: red, several or none; a gate that did not run; a red that is not a member's ---------------------------------------------------
check "13.2304 red touching SEVERAL members: bisect — the first half in READY order re-gates, the rest is HELD (left open, not landed); the green half lands" \
  'mk && printf "red @t/a#test,@t/c#test\ngreen\n" > "$S/gates" && b 11 12 13 14 && [ $rc -eq 0 ] && [ "$(ngated)" = 2 ] && says "^BISECT after gate 1: 2 members" && says "^HELD #13 " && says "^HELD #14 " \
   && inside "$(sha task/a)" "$(gated 2)" && inside "$(sha task/b)" "$(gated 2)" && ! inside "$(sha task/c)" "$(gated 2)" && ! inside "$(sha task/d)" "$(gated 2)" && [ "$(prf 13 state)" = OPEN ] \
   && says "^MEMBER #14 task/d .* held: bisect" && says "^MEMBER #12 task/b .* merged"'
check "13.2304 red touching NO member with 2 in the union: halves of one are no batch — gate singly, exit 3, no second gate, nothing landed" \
  'mk && printf "red @t/nope#test\n" > "$S/gates" && b 11 12 && [ $rc -eq 3 ] && [ "$(ngated)" = 1 ] && says "^BISECT after gate 1: 0 members" && [ "$(ncalls land)" = 0 ] && [ "$(ncalls "pr open")" = 0 ] \
   && says "^MEMBER #11 task/a .* gate singly" && says "^MEMBER #12 task/b .* gate singly"'
check "13.2304 a gate that refused to run is no gate and no member's: stop, exit 1, nothing ejected or bisected, no PR; a red with timeouts>0, or with no failing task, stops the same way" \
  'mk && printf "refuse\n" > "$S/gates" && b 11 12 && [ $rc -eq 1 ] && [ "$(ncalls gate)" = 1 ] && [ "$(ngated)" = 0 ] && summary "the gate did not run" && ! says "FIX candidate" && ! says "^BISECT" && [ "$(ncalls "pr open")" = 0 ] \
   && mk && printf "red @t/b#test timeouts=2\n" > "$S/gates" && b 11 12 13 && [ $rc -eq 1 ] && [ "$(ngated)" = 1 ] && summary "not a member.s (timeouts=2)" && ! says "FIX candidate" \
   && mk && printf "red\n" > "$S/gates" && b 11 12 13 && [ $rc -eq 1 ] && summary "no failing turbo task" && ! says "^BISECT"'

# --- 13.2305: the cap, --dry-run, wiring ---------------------------------------------------------------------------------------------------
check "13.2305 the cap: the THIRD red stops the call (exit 1) with the state printed — exactly 3 gates, the third red NOT attributed (no third FIX candidate, no gate singly), nothing landed" \
  'mk && printf "red @t/d#test\nred @t/c#test\nred @t/b#test\n" > "$S/gates" && b 11 12 13 14 && [ $rc -eq 1 ] && [ "$(ngated)" = 3 ] && says "^FIX candidate: #14 " && says "^FIX candidate: #13 " \
   && ! says "^FIX candidate: #12 " && ! says "gate singly" && summary "stopped: 3 red gates, the cap" && says "^MEMBER #12 task/b .* in the red union of gate 3" && [ "$(ncalls land)" = 0 ]'
check "13.2305 --dry-run makes no mutating call (no ctl call, gh only pr view), leaves origin and the batch tree as they were, and prints the order, the predicted union tree and the commands" \
  'mk && o0=$(originrefs) && s0=$(treestate) && b 13 11 12 --dry-run && [ $rc -eq 0 ] && [ ! -e "$S/mut.log" ] && [ ! -e "$S/ctl.log" ] && ! grep -v "^pr view " "$S/gh.log" | grep -q . \
   && [ "$(originrefs)" = "$o0" ] && [ "$(treestate)" = "$s0" ] && says "^ORDER 1. #11 " && says "^PREDICT union tree [0-9a-f]\{40\} (3 members" && says "^DRY: .* gate <union sha> --base $BASE --repo $T" \
   && says "^DRY: .* pr open batch/test-20261005T1441 " && says "^DRY: .* land <batch PR> --base $BASE --repo $T" && summary "^OK batch dry-run: 3 members"'
check "13.2305 the dry-run's predicted union tree IS the tree the real run then gates, and a predicted conflict is the real run's EJECT; a dry-run with a refusal still prints the order for the rest and exits 1" \
  'mk && shared_edit e 15 && shared_edit f 16 && b 11 15 16 --dry-run && [ $rc -eq 0 ] && pt=$(printf "%s\n" "$out" | sed -n "s/^PREDICT union tree \([0-9a-f]*\).*/\1/p") && says "^PREDICT EJECT #16 task/f .* conflict: shared.txt" \
   && b 11 15 16 && [ $rc -eq 0 ] && [ -n "$pt" ] && [ "$(gtree 1)" = "$pt" ] && says "^EJECT #16" \
   && mk && : > "$Q" && ready task/a READY && ready task/b READY && b 11 12 13 --dry-run && [ $rc -eq 1 ] && says "^REFUSE #13 (ready)" && says "^ORDER 2. #12 " && says "^PREDICT union tree" && summary "ctl batch $BASE 11 12"'
V="$HERE/verbs/batch.py"
FORBID="'push'|'pr', 'merge'|'pr', 'create'|--force|'--hard'|'-D'"
FORBID_SAMPLES="git('push', 'origin', b)
run(['gh', 'pr', 'merge', n])
run(['gh', 'pr', 'create', '--base', b])
git('push', '--force', 'origin')
git('reset', '--hard', x)
git('branch', '-D', b)"
check "13.2305 the verb pushes, merges and creates nothing by itself (no git push, gh pr merge/create, force, reset --hard, branch -D in batch.py): the batch branch reaches origin only through ctl pr open, the base only through ctl land" \
  '[ -f "$V" ] && ! grep -Eq "$FORBID" "$V"'
check "13.2305 CONTROL — the detector flags each forbidden form" 'printf "%s\n" "$FORBID_SAMPLES" | while IFS= read -r l; do printf "%s\n" "$l" | grep -Eq "$FORBID" || exit 1; done'
check "13.2305 ctl help lists batch, and selftest.sh runs this suite and a batch refusal step as live (uncommented) steps" \
  '"$HERE/ctl" help | grep -q "^  batch " && /usr/bin/grep -Eq "^step .*batch\.test\.sh" "$HERE/verbs/selftest.sh" && /usr/bin/grep -Eq "^step \"batch [^\"]*refuses" "$HERE/verbs/selftest.sh"'

ctl_test_only_end batch.test.sh
[ "$fails" -eq 0 ] && echo "batch.test.sh: ok" || { echo "batch.test.sh: $fails FAILED"; exit 1; }
