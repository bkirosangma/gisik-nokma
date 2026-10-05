#!/usr/bin/env python3
"""`ctl batch <release/name> <pr> <pr> [<pr> <pr>] [--repo <batch worktree>] [--dry-run]` — land 2-4 READY PRs through ONE gate.

Why (planner P42, re-opened 2026-10-05 12:41): while a gate runs the lanes get one test slot (sem.sh `gate-slots`), and every landing was
its own gate — 6 gates in the hour, 105 of 118 slot-wait min/h inside a gate window. More gate concurrency was tried and failed (P31), so
the lever left is the NUMBER of gates. The batch rules are the lanes dir's BATCHING-workflow-graph.md (READY, rules (a)-(d)).

1. The WHOLE call is refused (nothing merged, gated or pushed) unless every PR is open against <base>, READY in roles/QUEUE-review.md at
   its head sha with no later FIX, and breaks none of rules (b) migrations, (c) always alone, (d) shared count pins. Every refusal is
   printed (`REFUSE #<pr> (<rule>) …`); the summary names the PRs that passed.
2. The union is built in the batch tree — never the primary, never the checkout running this ctl, never a tree standing on a branch
   (a lane or reviewer tree stands on its task branch; a batch tree is detached or on batch/*): detached at a fresh origin/<base>, each
   head merged --no-ff in READY order (the queue's order, not the argument order). A conflict aborts that one merge and ejects that PR;
   fewer than 2 left is no batch ('gate singly', exit 3).
3. The union is gated LOCALLY in the batch tree (`ctl gate` needs HEAD = the sha and nothing on origin), and only a GREEN union is pushed:
   branch batch/<pool>-<stamp>, ONE `ctl pr open`, `ctl land`. A red union leaves no branch, no PR and no force-push behind.
4. A member GitHub marked merged (its head is in the landed base) is done; one it did not mark is closed with a comment naming the batch PR
   and the landed sha — only while its head is still the batched sha AND reachable from origin/<base>. Every member's state is printed.
5. RED: the failing turbo task's package -> the members whose diff touches it. Exactly one -> ejected ('FIX candidate'), the rest re-gate
   (from cache); none or several -> bisect in halves (the first half re-gates, the rest is held). At most MAX_GATES gates per call: the
   last red stops the call with the state printed. A gate that did not run (dirty tree, base moved) is no gate, and a red with no failing
   task or with hook timeouts / engine warnings is not a member's: both stop, nothing ejected.
--dry-run fetches and reads only: the refusals, the merge order, the predicted union tree (merge-tree + dangling commit-tree objects, no
ref), the commands. Exit 0 = landed (or a clean dry-run), 1 = refused or failed, 3 = no batch (gate singly).
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime

USAGE = 'usage: ctl batch <release/name> <pr> <pr> [<pr> <pr>] [--repo <batch worktree>] [--dry-run]'
HERE = os.environ.get('CTL_HERE') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CTL = os.environ.get('CTL_BATCH_CTL') or os.path.join(HERE, 'ctl')
GIT = '/usr/bin/git' if os.path.exists('/usr/bin/git') else 'git'
DEFAULT_TREE = '/Users/kiro/my_projects/gisik-nokma-batch2'
LANES = os.environ.get('CTL_LANES_DIR') or '/Users/kiro/my_projects/gisik-nokma-lanes'
PRIMARY = os.environ.get('GISIK_PRIMARY') or '/Users/kiro/my_projects/gisik-nokma'
MAX_GATES = 3
POOLS = {'release/knowledge-graph': 'kg', 'release/workflow-graph': 'wg'}
# A reviewer verdict: `HH:MM DONE <REVIEW time> <READY|needs-tip|FIX> <branch> <sha>` — the verdict is the word right after the cited time
# (autopilot's grammar), so RIDER, VOID and `DONE <t> READY … (FIX 1 delta)` read right; REVIEW, TOOK and NOTE lines are no verdicts.
VERDICT = re.compile(r'^(\d\d:\d\d) DONE (\d\d:\d\d) (READY|needs-tip|FIX) (\S+) ([0-9a-f]{7,40})(?=\s|$)')
MIGRATION = re.compile(r'^apps/server/migrations/(\d+)_[^/]*$')
PACKAGE_ROOT = re.compile(r'^(apps|packages)/[^/]+/package\.json$')
# BATCHING-workflow-graph.md (d): "No two tasks may bump the same count pin … These merge cleanly and then FAIL." A pin is (name, file, line
# pattern): a member bumps it when a line its diff adds OR removes in that file matches the pattern (None: any change to the file), so a
# rewritten pin line still counts through its old form. 13.2300 proves every pattern still matches its file in the checkout running the
# suite, so a renamed pin reddens a test instead of passing every batch.
SHARED_PINS = (
    ('the ticket-state event-type count (17/18/19)', 'packages/domain/test/ticket-state.test.ts', r'TICKET_EVENT_TYPES\)\.toHaveLength\('),
    ('14.555, the final MCP registry', 'packages/mcp-server/test/register.test.ts', r'FINAL\)\.toHaveLength\('),
    ('the MCP registry pin (TOOL_NAMES)', 'packages/mcp-server/test/fixtures/tool-names.ts', None),
    ('the MEMBERS census = the DataSourceQuery member count', 'apps/server/test/integration/soft-delete-client-surface.test.ts', r'MEMBERS\)\.toHaveLength\('),
    ('the generated mobile editor bundle', 'apps/mobile/src/editor/editor-html.generated.ts', None),
)

TREE = BASE = BASE_SHA = None
DRY = False
LOG = None


class Member:
    def __init__(self, n):
        self.n, self.ref, self.sha = n, '?', ''
        self.idx, self.when, self.verdict = 10 ** 9, '', ''
        self.files, self.status = [], 'in the union'

    def tag(self):
        return f'#{self.n} {self.ref} {self.sha[:8]}'


def say(line):
    print(line, flush=True)
    if LOG:
        LOG.write(line + '\n')
        LOG.flush()


def note(text):
    if LOG and text:
        LOG.write(text + '\n')
        LOG.flush()


def finish(code, word, text):
    say(f'{word} batch {text}' + (f' (log {LOG.name})' if LOG else ''))
    sys.exit(code)


def fail(text, code=1):
    finish(code, 'FAIL', text)


def run(argv, env=None, cwd=None):
    r = subprocess.run(argv, cwd=cwd or TREE, env=env, capture_output=True, text=True)
    note(f'$ {" ".join(argv)}  -> exit {r.returncode}')
    note(r.stdout.rstrip())
    note(r.stderr.rstrip())
    return r


def git(*args, env=None, cwd=None):
    return run([GIT, *args], env=env, cwd=cwd)


def out(*args, cwd=None):
    r = git(*args, cwd=cwd)
    return r.stdout.strip() if r.returncode == 0 else None


def is_anc(a, b):
    return git('merge-base', '--is-ancestor', a, b).returncode == 0


def gh_json(*args):
    r = run(['gh', *args])
    try:
        return json.loads(r.stdout) if r.returncode == 0 else None
    except ValueError:
        return None


def last_line(r):
    lines = [l for l in (r.stdout + r.stderr).splitlines() if l.strip()]
    return lines[-1] if lines else f'(no output, exit {r.returncode})'


def verdict_line(r):
    """A ctl verb's verdict: lib.sh's ctl_ok / ctl_fail echo `OK|FAIL <verb> …` on STDOUT as their last act. The verb's stderr (pr-open's
    un-quiet `git push`, gh notices) is a separate stream that `last_line` puts AFTER it, so it is never the verdict; with no such line,
    the last line of either stream."""
    v = [l for l in r.stdout.splitlines() if re.match(r'(OK|FAIL) ', l)]
    return v[-1] if v else last_line(r)


def base_valid(b):
    """lib.sh ctl_base_valid: main or release/<name> — main is refused separately, by name."""
    seg = r'[A-Za-z0-9_][A-Za-z0-9._-]*'
    if b == 'main':
        return True
    if not re.fullmatch(rf'release/{seg}(/{seg})*', b):
        return False
    return not ('..' in b or b.endswith('.') or b.endswith('.lock') or '.lock/' in b)


def parse(argv):
    pos, tree, dry = [], None, os.environ.get('CTL_DRY_RUN') == '1'
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--repo':
            if i + 1 >= len(argv) or not argv[i + 1]:
                fail(f'--repo needs a path ({USAGE})')
            tree, i = argv[i + 1], i + 2
        elif a == '--dry-run':
            dry, i = True, i + 1
        elif a.startswith('-'):
            fail(f'unknown arg {a} ({USAGE})')
        else:
            pos.append(a)
            i += 1
    if not pos:
        fail(USAGE)
    base, prs = pos[0], pos[1:]
    if not base_valid(base):
        fail(f'{base} is not an integration branch — release/<name> only ({USAGE})')
    if base == 'main':
        fail('main refused — a batch lands into a release branch only; a merge to main is the release, the owner\'s word per merge')
    if not 2 <= len(prs) <= 4:
        fail(f'a batch is 2-4 PRs, got {len(prs)} ({USAGE})')
    for p in prs:
        if not re.fullmatch(r'[1-9][0-9]*', p):
            fail(f'{p} is not a PR number ({USAGE})')
    if len(set(prs)) != len(prs):
        fail('a PR is named twice')
    return base, prs, tree or os.environ.get('CTL_BATCH_REPO') or DEFAULT_TREE, dry


def tree_guard(tree):
    real = os.path.realpath(tree)
    top = out('rev-parse', '--show-toplevel', cwd=tree) if os.path.isdir(tree) else None
    if top is None or os.path.realpath(top) != real:
        fail(f'batch tree {tree} is not the top of a git worktree')
    problems = []
    if real == os.path.realpath(PRIMARY):
        problems.append('is the primary checkout (ctl land fast-forwards it; it is never a batch tree)')
    ctl_top = out('rev-parse', '--show-toplevel', cwd=HERE)
    if ctl_top and os.path.realpath(ctl_top) == real:
        problems.append('holds the ctl that is running (a checkout there would rewrite this verb mid-run)')
    branch = out('symbolic-ref', '-q', '--short', 'HEAD', cwd=tree)
    if branch and not branch.startswith('batch/'):
        problems.append(f'stands on {branch}: a batch tree is detached or on batch/* (a lane or reviewer tree stands on its task branch). '
                        f'Detach it first: git -C {tree} checkout --detach')
    st = git('status', '--porcelain', cwd=tree)
    if st.returncode != 0 or st.stdout.strip():
        problems.append('is dirty (git status --porcelain is not empty)')
    if problems:
        fail(f'batch tree {tree} ' + '; '.join(problems) + ' — nothing touched')
    return real


def open_log():
    # Absolute: the batch PR's body is written beside the log, and `ctl pr open` reads --body FILE after its cd into --repo.
    d = os.path.abspath(os.environ.get('CTL_LOG_DIR') or os.path.expanduser('~/.cache/gisik-ctl'))
    os.makedirs(d, exist_ok=True)
    return open(os.path.join(d, f'batch-{datetime.now().strftime("%Y%m%dT%H%M%S")}-{os.getpid()}.log'), 'w')


def take_lock():
    """One batch per tree: a second call would check out over a union the first one is gating."""
    d = os.path.join(out('rev-parse', '--absolute-git-dir'), 'ctl', 'batch.lock.d')
    os.makedirs(os.path.dirname(d), exist_ok=True)
    for _ in range(2):
        try:
            os.mkdir(d)
        except FileExistsError:
            try:
                pid = int(open(os.path.join(d, 'pid')).read().strip())
                os.kill(pid, 0)
                fail(f'another ctl batch (pid {pid}) holds {d}')
            except (ValueError, OSError):
                shutil.rmtree(d, ignore_errors=True)
                continue
        with open(os.path.join(d, 'pid'), 'w') as f:
            f.write(str(os.getpid()))
        return d
    fail(f'cannot take {d}')


def read_queue():
    path = os.path.join(LANES, 'roles', 'QUEUE-review.md')
    try:
        with open(path, encoding='utf-8') as f:
            lines = f.read().splitlines()
    except OSError as e:
        fail(f'cannot read {path} ({e.strerror}) — the READY check fails closed; nothing touched')
    verdicts = []
    for i, line in enumerate(lines):
        m = VERDICT.match(line)
        if m:
            verdicts.append((i, m.group(1), m.group(3), m.group(4), m.group(5), line))
    return verdicts


def tip_merge_chain(sha):
    """[sha, then each first parent down CLEAN tip merges of origin/<base>]: a needs-tip line names the reviewed sha, and `ctl tipmerge`
    (or a hand tip merge that changed nothing by hand) puts a merge on top of it — 2 parents, the 2nd on origin/<base>, the tree exactly
    `git merge-tree` of the two. A merge whose tree differs from the auto-merge was edited by hand, and the walk stops there."""
    chain, c = [sha], sha
    for _ in range(4):
        parts = (out('rev-list', '--parents', '-n', '1', c) or '').split()
        if len(parts) != 3 or not is_anc(parts[2], BASE_SHA):
            break
        r = git('merge-tree', '--write-tree', '--no-messages', parts[1], parts[2])
        if r.returncode != 0 or r.stdout.split('\n', 1)[0].strip() != out('rev-parse', c + '^{tree}'):
            break
        chain.append(parts[1])
        c = parts[1]
    return chain


def ready_problem(m, verdicts):
    """None when the queue holds a READY line naming the head (or a needs-tip line naming it or what a clean tip merge put it on) with no
    LATER FIX of that line's branch; else why not. "Later" is the file's line order: the queue has HH:MM and no dates."""
    chain = tip_merge_chain(m.sha)
    hit = None
    for v in verdicts:
        verdict, sha = v[2], v[4]
        if (verdict == 'READY' and m.sha.startswith(sha)) or (verdict == 'needs-tip' and any(c.startswith(sha) for c in chain)):
            hit = v
    if hit is None:
        return f'no READY or needs-tip line in roles/QUEUE-review.md names {m.sha[:8]} (nor a clean tip merge of a needs-tip sha)'
    m.idx, m.when, m.verdict = hit[0], hit[1], hit[2]
    later = [v for v in verdicts if v[0] > hit[0] and v[2] == 'FIX' and v[3] == hit[3]]
    if later:
        return f'FIX after READY: queue line {later[-1][0] + 1} "{later[-1][5][:120]}"'
    return None


def member_files(m):
    """(status, path) of the member's OWN changes: three dots, from its merge-base with origin/<base> — a two-dot diff of a stale head
    would hand it the tip's own migrations and packages."""
    r = git('diff', '--name-status', '--no-renames', f'{BASE_SHA}...{m.sha}')
    return [(l.split('\t', 1)[0][:1], l.split('\t', 1)[1]) for l in r.stdout.splitlines() if '\t' in l]


def alone(st, f):
    """BATCHING (c), the tasks that always go alone."""
    b = f.rsplit('/', 1)[-1]
    if b == 'pnpm-lock.yaml':
        return f'touches {f}'
    if b.startswith('Dockerfile'):
        return f'touches {f} (Dockerfile*)'
    if f == 'scripts/ctl/verbs/gate.sh' or f.startswith('docs/lanes/gate-lock/'):
        return f'touches {f} (the gate itself; ctl gate runs the batch tree\'s gate-lock copy)'
    if st == 'A' and PACKAGE_ROOT.match(f):
        return f'creates a package ({f})'
    return None


def pin_bumped(m, path, pattern):
    if path not in {f for _, f in m.files}:
        return False
    if pattern is None:
        return True
    diff = git('diff', '-U0', f'{BASE_SHA}...{m.sha}', '--', path).stdout
    return any(re.search(pattern, l) for l in diff.splitlines() if l[:1] in '+-' and l[:3] not in ('+++', '---'))


def rule_problems(members):
    probs = []
    tip = (out('ls-tree', '-r', '--name-only', BASE_SHA, '--', 'apps/server/migrations') or '').splitlines()
    tip_max = max((int(x.group(1)) for x in map(MIGRATION.match, tip) if x), default=-1)
    first_mig = None
    for m in members:
        migs = [f for st, f in m.files if st == 'A' and MIGRATION.match(f)]
        for f in migs:
            p = int(MIGRATION.match(f).group(1))
            if p <= tip_max:
                probs.append((m, 'b', f'migration {f}: prefix {p} is not above the highest on origin/{BASE} ({tip_max})'))
        if len(migs) > 1:
            probs.append((m, 'b', f'{len(migs)} migrations in one PR — at most ONE per batch'))
        elif migs and first_mig:
            probs.append((m, 'b', f'a second migration in the union: {migs[0]} (#{first_mig[0].n} brings {first_mig[1]}) — at most ONE per batch'))
        if migs and not first_mig:
            first_mig = (m, migs[0])
        for st, f in m.files:
            why = alone(st, f)
            if why:
                probs.append((m, 'c', f'always alone: {why}'))
    for name, path, pattern in SHARED_PINS:
        first = None
        for m in members:
            if pin_bumped(m, path, pattern):
                if first:
                    probs.append((m, 'd', f'shared count pin "{name}" ({path}) is also bumped by #{first.n}'))
                else:
                    first = m
    return probs


def report(members):
    for m in members:
        say(f'MEMBER {m.tag()} {m.status}')


def build(members):
    """The union on a detached HEAD at origin/<base>: each head merged --no-ff in order (its own merge commit, so the batch PR's first-parent
    line shows every member, and a tip-merged head is never fast-forwarded into the base line). A conflict aborts that merge, ejects that PR."""
    if git('checkout', '-q', '--detach', BASE_SHA).returncode != 0:
        fail(f'cannot check out origin/{BASE} {BASE_SHA[:12]} in {TREE}')
    kept = []
    for m in members:
        if is_anc(m.sha, 'HEAD'):
            say(f'CONTAINED {m.tag()}: already in the union (an earlier member carries it)')
            kept.append(m)
            continue
        r = git('merge', '--no-ff', '--no-edit', '-m', f'batch: merge #{m.n} {m.ref} {m.sha[:8]} ({m.verdict} {m.when})', m.sha)
        if r.returncode != 0:
            paths = sorted(set((out('diff', '--name-only', '--diff-filter=U') or '').split()))
            git('merge', '--abort')
            if not paths:
                fail(f'git merge of {m.tag()} failed and is no conflict: {last_line(r)}')
            m.status = f'ejected: conflict ({", ".join(paths)})'
            say(f'EJECT {m.tag()} conflict: {" ".join(paths)}')
            continue
        say(f'MERGE {m.tag()} -> {out("rev-parse", "HEAD")[:12]}')
        kept.append(m)
    return out('rev-parse', 'HEAD'), kept


def predict(members):
    """--dry-run's union: the same merges as build(), computed by `git merge-tree` and chained through dangling commit-tree objects (no ref,
    no checkout) so each next merge finds the merge base the real merge will."""
    env = dict(os.environ, GIT_AUTHOR_NAME='ctl batch dry-run', GIT_AUTHOR_EMAIL='ctl-batch@dry-run.invalid',
               GIT_COMMITTER_NAME='ctl batch dry-run', GIT_COMMITTER_EMAIL='ctl-batch@dry-run.invalid',
               GIT_AUTHOR_DATE='1700000000 +0000', GIT_COMMITTER_DATE='1700000000 +0000')
    cur, kept = BASE_SHA, []
    for m in members:
        if is_anc(m.sha, cur):
            say(f'PREDICT CONTAINED {m.tag()}')
            kept.append(m)
            continue
        r = git('merge-tree', '--write-tree', '--name-only', '--no-messages', cur, m.sha)
        lines = r.stdout.splitlines()
        if r.returncode == 1:
            paths = sorted(set(l for l in lines[1:lines.index('')] if l)) if '' in lines else sorted(set(lines[1:]))
            say(f'PREDICT EJECT {m.tag()} conflict: {" ".join(paths)}')
            continue
        if r.returncode != 0 or not lines:
            fail(f'git merge-tree failed for {m.tag()} (exit {r.returncode}) — not a conflict')
        c = git('commit-tree', lines[0], '-p', cur, '-p', m.sha, '-m', f'ctl batch dry-run: #{m.n}', env=env)
        if c.returncode != 0:
            fail(f'git commit-tree failed for {m.tag()}: {last_line(c)}')
        cur = c.stdout.strip()
        say(f'PREDICT MERGE {m.tag()}')
        kept.append(m)
    return out('rev-parse', cur + '^{tree}'), kept


def install_argv():
    cmd = os.environ.get('CTL_BATCH_INSTALL')
    if cmd is not None:
        return ['sh', '-c', cmd], dict(os.environ)
    b = os.environ.get('GISIK_NODE22_BIN') or os.path.expanduser('~/.nvm/versions/node/v22.22.2/bin')
    if not os.access(os.path.join(b, 'node'), os.X_OK):
        fail(f'node 22 not found at {b} — nothing gated')
    return ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'], dict(os.environ, PATH=b + os.pathsep + os.environ.get('PATH', ''))


def gate(sha):
    """('green' | 'red' | 'refused', the gate's verdict line, the failing turbo tasks). A FAIL line with no `(log <file>)` is a refusal before
    the run (HEAD, dirty tree, base moved, orphans): no gate ran."""
    r = run([CTL, 'gate', sha, '--base', BASE, '--repo', TREE])
    last = verdict_line(r)
    say(f'  {last}')
    if r.returncode == 0 and last.startswith('OK gate'):
        return 'green', last, []
    lm = re.search(r'\(log (\S+)\)\s*$', last)
    if not lm or not os.path.isfile(lm.group(1)):
        return 'refused', last, []
    tasks = []
    with open(lm.group(1), errors='replace') as f:
        for line in f:
            fm = re.match(r'\s*Failed:\s+(.*)$', line)
            if fm:
                tasks += [t for t in re.split(r'[,\s]+', fm.group(1)) if '#' in t and t not in tasks]
    return 'red', last, tasks


def attribute(union, tasks, members):
    """The members whose own diff touches a package a failing task belongs to (package name -> directory from the union's package.json)."""
    dirs = {}
    for f in (out('ls-tree', '-r', '--name-only', union, '--', 'apps', 'packages') or '').splitlines():
        if PACKAGE_ROOT.match(f):
            try:
                name = json.loads(out('show', f'{union}:{f}') or '{}').get('name')
            except ValueError:
                name = None
            if name:
                dirs[name] = f[:-len('package.json')]
    red = {dirs[t.split('#')[0]] for t in tasks if t.split('#')[0] in dirs}
    return [m for m in members if any(f.startswith(d) for _, f in m.files for d in red)]


def pick_branch(stamp):
    pool = POOLS.get(BASE) or BASE.split('/', 1)[1].replace('/', '-')
    name, k = f'batch/{pool}-{stamp}', 1
    while out('rev-parse', '--verify', '-q', f'refs/heads/{name}') or out('rev-parse', '--verify', '-q', f'refs/remotes/origin/{name}'):
        k += 1
        name = f'batch/{pool}-{stamp}-{k}'
    return name


def write_body(path, members, kept, union, gates):
    lines = [f'Batch of {len(kept)} READY PRs into `{BASE}`, gated as ONE union by `ctl batch` (planner P42; BATCHING-workflow-graph.md).', '',
             f'Union `{union}`, green at gate {gates} of {MAX_GATES}. Members, merged --no-ff in READY order:', '']
    lines += [f'- #{m.n} `{m.ref}` `{m.sha}` ({m.verdict} {m.when}, QUEUE-review line {m.idx + 1})' for m in kept]
    rest = [m for m in members if m not in kept]
    if rest:
        lines += ['', 'Not in this batch:', ''] + [f'- #{m.n} `{m.ref}` `{m.sha}`: {m.status}' for m in rest]
    with open(path, 'w') as f:
        f.write('\n'.join(lines) + '\n')


def poll_state(m):
    tries = int(os.environ.get('CTL_BATCH_POLL', '6'))
    for i in range(tries):
        d = gh_json('pr', 'view', m.n, '--json', 'state,headRefOid') or {}
        if d.get('state') == 'MERGED' or i == tries - 1:
            return d.get('state') or '?', d.get('headRefOid') or ''
        time.sleep(float(os.environ.get('CTL_BATCH_POLL_SECS', '5')))
    return '?', ''


def land(members, kept, union, stamp, gates):
    for m in kept:  # a head that moved since the build would land the old sha under the PR's name
        d = gh_json('pr', 'view', m.n, '--json', 'state,headRefOid') or {}
        if d.get('state') != 'OPEN' or d.get('headRefOid') != m.sha:
            report(members)
            fail(f'#{m.n} moved since the union was built (state {d.get("state")}, head {(d.get("headRefOid") or "?")[:8]}, batched {m.sha[:8]}) — not landed; re-run ctl batch')
    branch = pick_branch(stamp)
    if git('switch', '-q', '-c', branch).returncode != 0:
        fail(f'cannot create {branch} in {TREE}')
    body = os.path.join(os.path.dirname(LOG.name), os.path.basename(LOG.name)[:-len('.log')] + '-body.md')
    write_body(body, members, kept, union, gates)
    title = f'batch {branch[len("batch/"):]}: ' + ' '.join(f'#{m.n}' for m in kept)
    r = run([CTL, 'pr', 'open', branch, '--title', title, '--body', body, '--base', BASE, '--repo', TREE])
    last = verdict_line(r)
    say(f'  {last}')
    pm = re.match(r'OK pr-open #(\d+) ', last)
    if r.returncode != 0 or not pm:
        report(members)
        fail(f'ctl pr open {branch}: {last} — not landed')
    pr = pm.group(1)
    r = run([CTL, 'land', pr, '--base', BASE, '--repo', TREE])
    last = verdict_line(r)
    say(f'  {last}')
    if r.returncode != 0 or not last.startswith('OK land'):
        report(members)
        fail(f'ctl land #{pr}: {last} — the batch PR stays open, no member closed')
    mc = ((gh_json('pr', 'view', pr, '--json', 'mergeCommit') or {}).get('mergeCommit') or {}).get('oid') or '?'
    git('fetch', '-q', 'origin')
    hands = []
    for m in kept:
        state, head = poll_state(m)
        if state == 'MERGED':
            m.status = f'merged (GitHub marked it; landed in #{pr})'
        elif not is_anc(m.sha, f'origin/{BASE}'):
            m.status = f'NOT in origin/{BASE} after #{pr} landed — left {state}'
            hands.append(m)
        elif state != 'OPEN' or head != m.sha:
            m.status = f'left {state}: its head is {head[:8] or "?"} now, the batch landed {m.sha[:8]}'
            hands.append(m)
        else:
            c = run(['gh', 'pr', 'close', m.n, '--comment',
                     f'Landed by `ctl batch` in #{pr} (merge `{mc}`) into `{BASE}`: this PR\'s head `{m.sha}` is in it. '
                     f'GitHub did not mark this PR merged, so it is closed by hand.'])
            m.status = f'closed (landed in #{pr} at {mc[:12]})' if c.returncode == 0 else f'close FAILED: {last_line(c)}'
            if c.returncode != 0:
                hands.append(m)
    report(members)
    if hands:
        fail(f'#{pr} landed {mc[:12]} into {BASE}, but {len(hands)} member(s) need a hand: ' + ' '.join(f'#{m.n}' for m in hands))
    finish(0, 'OK', f'#{pr} landed {mc[:12]} into {BASE} after {gates} gate(s): ' + ' '.join(f'#{m.n}' for m in kept)
           + ''.join(f'; #{m.n} {m.status}' for m in members if m not in kept))


def batch(members, stamp):
    union, kept = build(members)
    gates, installed = 0, False
    while True:
        if len(kept) < 2:
            for m in kept:
                m.status = 'gate singly'
            report(members)
            fail('gate singly: fewer than 2 members left (' + (' '.join(f'#{m.n}' for m in kept) or 'none') + ') — no batch, nothing pushed', code=3)
        if not installed:
            argv, env = install_argv()
            say(f'INSTALL {" ".join(argv)}')
            r = run(argv, env=env)
            if r.returncode != 0:
                fail(f'install failed (exit {r.returncode}): {last_line(r)} — nothing gated')
            installed = True
        gates += 1
        say(f'GATE {gates}/{MAX_GATES} {union} ' + ' '.join(f'#{m.n}' for m in kept))
        verdict, last, tasks = gate(union)
        if verdict == 'refused':
            report(members)
            fail(f'the gate did not run: {last} — no gate counted, nothing pushed; fix the cause and re-run')
        if verdict == 'green':
            break
        say(f'RED gate {gates}/{MAX_GATES} {union[:12]}: ' + (', '.join(tasks) or 'no failing turbo task in its log'))
        if gates >= MAX_GATES:
            for m in kept:
                m.status = f'in the red union of gate {gates} (not landed)'
            report(members)
            fail(f'stopped: {gates} red gates, the cap — nothing landed; the last red: {last}')
        infra = re.search(r'\b(timeouts|engine|orphans)=([1-9][0-9]*)', last)
        if infra or not tasks:
            for m in kept:
                m.status = f'in the red union of gate {gates} (not landed)'
            report(members)
            fail(f'gate {gates} red but not a member\'s (' + (f'{infra.group(1)}={infra.group(2)}' if infra else 'no failing turbo task')
                 + ') — nothing ejected, no bisect; re-gate on a quiet box')
        culprits = attribute(union, tasks, kept)
        if len(culprits) == 1:
            c = culprits[0]
            c.status = f'ejected: FIX candidate (gate {gates} red: {", ".join(tasks)})'
            say(f'FIX candidate: #{c.n} ({c.ref} {c.sha[:8]} is the one member touching the red package)')
            kept = [m for m in kept if m is not c]
        else:
            half = kept[:math.ceil(len(kept) / 2)]
            say(f'BISECT after gate {gates}: {len(culprits)} members touch the red package(s) — the first half re-gates: ' + ' '.join(f'#{m.n}' for m in half))
            if len(half) < 2:
                for m in kept:
                    m.status = f'gate singly (bisect after gate {gates}: a half of one is no batch)'
                report(members)
                fail('gate singly: the red union cannot be bisected into batches (' + ' '.join(f'#{m.n}' for m in kept) + ') — nothing pushed', code=3)
            for m in kept[len(half):]:
                m.status = f'held: bisect after gate {gates} (not in the gated half; re-batch it)'
                say(f'HELD {m.tag()} (bisect)')
            kept = half
        union, kept = build(kept)
    land(members, kept, union, stamp, gates)


def dry_run(members, refusals, stamp):
    tree, kept = predict(members)
    say(f'PREDICT union tree {tree} ({len(kept)} members: ' + ' '.join(f'#{m.n}' for m in kept) + ')')
    say(f'DRY: git -C {TREE} checkout -q --detach {BASE_SHA}   # origin/{BASE}')
    for m in members:
        say(f'DRY: git -C {TREE} merge --no-ff --no-edit {m.sha}   # #{m.n} {m.ref}')
    say(f'DRY: {" ".join(install_argv()[0])}   # in {TREE}, once')
    say(f'DRY: {CTL} gate <union sha> --base {BASE} --repo {TREE}   # at most {MAX_GATES} gates: red -> eject the one member touching the red package, or bisect; rebuild; re-gate')
    pool = POOLS.get(BASE) or BASE.split('/', 1)[1].replace('/', '-')
    say(f'DRY: git -C {TREE} switch -c batch/{pool}-{stamp}   # green only')
    say(f'DRY: {CTL} pr open batch/{pool}-{stamp} --title "batch {pool}-{stamp}: …" --body <log>-body.md --base {BASE} --repo {TREE}')
    say(f'DRY: {CTL} land <batch PR> --base {BASE} --repo {TREE}')
    say('DRY: gh pr close <member> --comment "Landed by ctl batch in #<batch PR> …"   # only a member GitHub did not mark merged')
    if refusals:
        fail(f'dry-run: {len(refusals)} refusal(s) — the real run refuses the whole call; the order above is for the PRs that passed: '
             + (f'ctl batch {BASE} ' + ' '.join(m.n for m in members) if len(members) >= 2 else 'fewer than 2'))
    if len(kept) < 2:
        fail('dry-run: gate singly — fewer than 2 members would be left after the conflicts', code=3)
    finish(0, 'OK', f'dry-run: {len(kept)} members, predicted union tree {tree} — nothing merged, gated or pushed')


def main(argv):
    global TREE, BASE, BASE_SHA, DRY, LOG
    BASE, prs, tree, DRY = parse(argv)
    TREE = tree_guard(tree)
    stamp = os.environ.get('CTL_BATCH_NOW') or datetime.now().strftime('%Y%m%dT%H%M')
    LOG = open_log()
    if not DRY:
        lock = take_lock()
        import atexit
        atexit.register(shutil.rmtree, lock, True)
    say(f'batch {BASE} ' + ' '.join(f'#{p}' for p in prs) + f' in {TREE}' + (' (dry-run: reads only)' if DRY else ''))
    members, refusals = [], []
    for n in prs:
        m = Member(n)
        members.append(m)
        d = gh_json('pr', 'view', n, '--json', 'number,state,baseRefName,headRefName,headRefOid')
        if not d or not d.get('headRefOid'):
            refusals.append((m, 'pr', f'cannot read PR #{n} (gh pr view)'))
            continue
        m.ref, m.sha = d.get('headRefName') or '?', d['headRefOid']
        if d.get('state') != 'OPEN':
            refusals.append((m, 'pr', f'is {d.get("state")}, not OPEN'))
        if d.get('baseRefName') != BASE:
            refusals.append((m, 'pr', f'targets {d.get("baseRefName")}, not {BASE} (one pool per batch)'))
    if git('fetch', '-q', 'origin').returncode != 0:
        fail('cannot fetch origin (offline?) — nothing touched')
    BASE_SHA = out('rev-parse', '--verify', '-q', f'origin/{BASE}^{{commit}}') or fail(f'no origin/{BASE} after the fetch')
    verdicts = read_queue()
    checked = []
    for m in members:
        if not m.sha:
            continue
        if git('cat-file', '-e', m.sha + '^{commit}').returncode != 0:
            refusals.append((m, 'pr', f'head {m.sha[:8]} is not in the batch tree after the fetch (its branch is not on origin?)'))
            continue
        if is_anc(m.sha, BASE_SHA):
            refusals.append((m, 'ready', f'head {m.sha[:8]} is already on origin/{BASE}'))
            continue
        p = ready_problem(m, verdicts)
        if p:
            refusals.append((m, 'ready', p))
        m.files = member_files(m)
        checked.append(m)
    members.sort(key=lambda m: m.idx)
    checked.sort(key=lambda m: m.idx)
    refusals += rule_problems(checked)
    for m, rule, text in refusals:
        say(f'REFUSE #{m.n} ({rule}) {text}')
    refused = {m.n for m, _, _ in refusals}
    passing = [m for m in members if m.n not in refused]
    if refusals and not DRY:
        fail(f'refused: {len(refusals)} refusal(s) on ' + ' '.join(sorted({f'#{n}' for n in refused})) + ' — nothing merged, gated or pushed'
             + (f'; the PRs that passed: ctl batch {BASE} ' + ' '.join(m.n for m in passing) if len(passing) >= 2 else ''))
    for k, m in enumerate(passing, 1):
        say(f'ORDER {k}. {m.tag()} ({m.verdict} {m.when}, QUEUE-review line {m.idx + 1})')
    if DRY:
        dry_run(passing, refusals, stamp)
    batch(passing, stamp)


if __name__ == '__main__':
    main(sys.argv[1:])
