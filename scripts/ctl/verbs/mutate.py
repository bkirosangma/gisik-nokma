#!/usr/bin/env python3
"""ctl mutate — Stryker plus the custom classes on a branch's CHANGED lines (owner-approved 2026-10-04, process finding P20).

Called by mutate.sh, which owns the trap: every file this script overwrites is first copied into $CTL_MUTATE_TMP and named in
$CTL_MUTATE_TMP/manifest (`restore<TAB>path<TAB>backup`, `rmdir<TAB>path`), so the wrapper can put the worktree back on ANY exit,
SIGINT and SIGTERM included. This script restores after each run as well; the wrapper's pass is the one that cannot be skipped.

Exit codes: 0 no survivor, 1 survivors (triage expected), 2 a tool failure, any crash of this script included (nothing is ever reported
green on a failure, and a traceback never passes for 1).
Seams (tests): CTL_MUTATE_RUN_TESTS (the run-tests command), CTL_MUTATE_SPLIT (300 mutants per run), CTL_MUTATE_MAX_SECS (600 s per
slot-run, counted from the moment the command holds its slot), CTL_MUTATE_BACKSTOP_SECS (slot_run's outer timeout, default backstop_secs),
CTL_MUTATE_PG_HOST / CTL_MUTATE_PG_PORT (the test Postgres, 127.0.0.1:54329), CTL_MUTATE_INJECT_FAIL (mutate-ast.mjs).
Hidden sub-commands: `watchdog <secs> <dir> -- <cmd>...` (slot_run's wrapper inside the slot), and for the unit legs `ranges <diff-file>`,
`filter <path>...`, `reconcile <plan-json> <report-json>`.
"""
import glob
import json
import os
import re
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
CTL = os.path.join(os.path.dirname(HERE), 'ctl')
AST = os.path.join(HERE, 'mutate-ast.mjs')


class ToolFailure(Exception):
    """Exit 2: the sweep (or one file of it) could not be trusted."""


class NoSlot(ToolFailure):
    """run-tests exit 75: no slot came free; the whole sweep stops."""


def env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        raise ToolFailure(f'{name} is not a number: {os.environ.get(name)!r}')


# ---------------------------------------------------------------- the changed lines
HUNK = re.compile(r'^@@ -\S+ \+(\d+)(?:,(\d+))? @@')


def parse_ranges(diff_text):
    """`git diff --unified=0` -> {path: [[first, last], ...]} of ADDED lines in new-file numbering. A pure deletion (`+N,0`) adds no
    range; a deleted file (`+++ /dev/null`) is absent."""
    out, cur = {}, None
    for line in diff_text.splitlines():
        if line.startswith('+++ '):
            cur = None if line.rstrip() == '+++ /dev/null' else line[6:] if line.startswith('+++ b/') else line[4:]
            continue
        m = HUNK.match(line)
        if m and cur is not None:
            start, count = int(m.group(1)), int(m.group(2) if m.group(2) is not None else 1)
            if count > 0:
                out.setdefault(cur, []).append([start, start + count - 1])
    return out


TEST_DIRS = {'test', 'tests', '__tests__'}


def source_verdict(path):
    """None when PATH is a mutable source file, else why it is excluded."""
    base = path.rsplit('/', 1)[-1]
    if not (base.endswith('.ts') or base.endswith('.tsx')):
        return 'not .ts/.tsx'
    if base.endswith('.d.ts'):
        return 'declaration file'
    if re.search(r'\.(test|spec)\.[cm]?tsx?$', base):
        return 'test file'
    if any(seg in TEST_DIRS for seg in path.split('/')[:-1]):
        return 'under a test directory'
    if base.endswith('.generated.ts'):
        return 'generated'
    return None


# ---------------------------------------------------------------- git and the repo
def git(repo, *args, check=True):
    r = subprocess.run(['/usr/bin/git', '-C', repo, *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise ToolFailure(f'git {" ".join(args)}: {r.stderr.strip() or r.returncode}')
    return r.stdout


def resolve_base(repo, given):
    """(base-sha, how). Given: the ref itself, or origin/<ref>. Default: the merge-base with the origin/release/* the branch shares the
    most history with (fewest commits on HEAD not in it); a tie between releases is a refusal (pass --base)."""
    if given:
        for ref in (given, f'origin/{given}'):
            sha = git(repo, 'rev-parse', '--verify', '-q', f'{ref}^{{commit}}', check=False).strip()
            if sha:
                return git(repo, 'merge-base', 'HEAD', sha).strip(), f'--base {given}'
        raise ToolFailure(f'--base {given} is not a commit here (nor origin/{given})')
    refs = [r for r in git(repo, 'for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/release/').split() if r]
    if not refs:
        raise ToolFailure('no origin/release/* ref to take the default base from: pass --base <ref>')
    scored = sorted((int(git(repo, 'rev-list', '--count', f'{r}..HEAD').strip()), r) for r in refs)
    if len(scored) > 1 and scored[0][0] == scored[1][0]:
        raise ToolFailure(f'{scored[0][1]} and {scored[1][1]} are equally close: pass --base <ref>')
    rel = scored[0][1]
    return git(repo, 'merge-base', 'HEAD', rel).strip(), f'merge-base with {rel}'


def package_of(repo, path):
    """The nearest directory holding a package.json below the repo root, or None."""
    d = os.path.dirname(path)
    while d:
        if os.path.isfile(os.path.join(repo, d, 'package.json')):
            return d
        d = os.path.dirname(d)
    return None


def has_vitest(repo, pkg):
    try:
        manifest = json.load(open(os.path.join(repo, pkg, 'package.json')))
    except (OSError, ValueError):
        return False
    deps = {**manifest.get('dependencies', {}), **manifest.get('devDependencies', {})}
    return 'vitest' in deps


def pg_reachable():
    host = os.environ.get('CTL_MUTATE_PG_HOST', '127.0.0.1')
    port = env_int('CTL_MUTATE_PG_PORT', 54329)
    try:
        with socket.create_connection((host, port), timeout=1.5):
            return True, f'{host}:{port}'
    except OSError:
        return False, f'{host}:{port}'


def find_up(start, rel):
    d = start
    while True:
        p = os.path.join(d, rel)
        if os.path.exists(p):
            return p
        if os.path.dirname(d) == d:
            return None
        d = os.path.dirname(d)


# ---------------------------------------------------------------- planning
def ast_plan(repo, pkg, relfile, ranges):
    r = subprocess.run(['node', AST, repo, os.path.join(repo, pkg), relfile, json.dumps(ranges)], capture_output=True, text=True)
    if r.returncode != 0:
        raise ToolFailure(f'mutate-ast {pkg}/{relfile}: {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else r.returncode}')
    return json.loads(r.stdout)


def split_lines(ranges, counts, cap):
    """Split the changed lines into consecutive chunks of at most CAP Stryker mutants (one line above CAP is a chunk alone).
    -> [(ranges, mutants)]. counts maps line -> mutants; a line without mutants rides along with its neighbours."""
    lines = [ln for a, b in ranges for ln in range(a, b + 1)]
    chunks, cur, n = [], [], 0
    for ln in lines:
        c = counts.get(ln, 0)
        if cur and n + c > cap:
            chunks.append((cur, n))
            cur, n = [], 0
        cur.append(ln)
        n += c
    if cur:
        chunks.append((cur, n))
    out = []
    for lns, n in chunks:
        rs = []
        for ln in lns:
            if rs and rs[-1][1] == ln - 1:
                rs[-1][1] = ln
            else:
                rs.append([ln, ln])
        out.append((rs, n))
    return out


def in_ranges(line, ranges):
    return any(a <= line <= b for a, b in ranges)


# ---------------------------------------------------------------- the report mapping (ruling 16:40 (1), (2))
SWITCH = re.compile(r'\(false \? (?:[^():?]+|Math\.\w+) : (?:false \? (?:[^():?]+|Math\.\w+) : )?([^():?]+|Math\.\w+)\)')


def unswitch(s):
    """Text of a Stryker mutant that spans an injected switch, with each switch put back to its original."""
    prev = None
    while prev != s:
        prev, s = s, SWITCH.sub(r'\1', s)
    return s


def reconcile(customs, mutants, source):
    """Split Stryker's mutants of one run into (custom results, stryker results, problems).
    customs: the run's custom mutants (mutate-ast entries); mutants: the report's mutant list; source: the report's file source.
    A custom alternative k is COUNTED by the first flip of its k-th `false` token to `true`; every other mutant inside a switch is
    scaffold (re-selects the original, or duplicates a counted flip) and is dropped. problems lists every alternative counted 0 or
    more than 1 time, so the caller can assert injected == counted."""
    tok = {}
    spans = []
    for i, c in enumerate(customs):
        for k, p in enumerate(c['tokenPos']):
            tok[(p['line'], p['column'] + 1)] = (i, k)  # Stryker columns are 1-based
        spans.append((c['switch']['start'], c['switch']['end']))
    lines = source.split('\n')

    def inside(loc, span):
        (s, e) = span
        a = (loc['start']['line'], loc['start']['column'] - 1)
        b = (loc['end']['line'], loc['end']['column'] - 1)
        return (s['line'], s['column']) <= a and b <= (e['line'], e['column'])

    def text_at(loc):
        (sl, sc), (el, ec) = (loc['start']['line'], loc['start']['column'] - 1), (loc['end']['line'], loc['end']['column'] - 1)
        if sl == el:
            return lines[sl - 1][sc:ec]
        return '\n'.join([lines[sl - 1][sc:]] + lines[sl:el - 1] + [lines[el - 1][:ec]])

    counted = []  # [((i, k), mutant)], one per alternative once deduped
    stryker = []
    for m in mutants:
        loc = m['location']
        key = (loc['start']['line'], loc['start']['column'])
        if key in tok and (m.get('replacement') or '').strip() == 'true' and text_at(loc) == 'false':
            if any(ik == tok[key] for ik, _ in counted):
                continue  # dedupe: a second flip selecting the same alternative (e.g. ConditionalExpression beside BooleanLiteral)
            counted.append((tok[key], m))
            continue
        if any(inside(loc, sp) for sp in spans):
            continue  # scaffold: a flip that re-selects the original, or a mutant of the switch's own syntax
        stryker.append({'line': loc['start']['line'], 'mutator': m['mutatorName'], 'status': m['status'],
                        'original': ' '.join(unswitch(text_at(loc)).split()), 'replacement': ' '.join(unswitch(m.get('replacement') or '').split())})
    custom = []
    problems = []
    first = {}
    for ik, m in counted:
        first.setdefault(ik, m)
    for i, c in enumerate(customs):
        for k, alt in enumerate(c['alts']):
            m = first.get((i, k))
            if m is None:
                problems.append(f"line {c['line']}: {c['original']} → {alt} has no selecting flip in the report")
                continue
            custom.append({'line': c['line'], 'mutator': f"custom:{c['kind']}", 'status': m['status'], 'original': c['original'], 'replacement': alt})
    return custom, stryker, problems, sum(len(c['alts']) for c in customs), len(counted)


# ---------------------------------------------------------------- running
class Manifest:
    def __init__(self, tmp):
        self.tmp = tmp
        self.path = os.path.join(tmp, 'manifest')
        self.n = 0

    def backup(self, path):
        self.n += 1
        b = os.path.join(self.tmp, f'backup-{self.n}')
        shutil.copy2(path, b)
        with open(self.path, 'a') as f:
            f.write(f'restore\t{path}\t{b}\n')
        return b

    def created(self, path):
        with open(self.path, 'a') as f:
            f.write(f'rmdir\t{path}\n')

    def setup_glob(self, pkgdir, had):
        """The wrapper removes every stryker-setup-<n>.js in PKGDIR that is not in HAD (the ones there before the run)."""
        with open(self.path, 'a') as f:
            f.write(f'rmsetup\t{pkgdir}\t{",".join(sorted(had))}\n')


def run_tests_cmd():
    raw = os.environ.get('CTL_MUTATE_RUN_TESTS')
    return shlex.split(raw) if raw else ['bash', CTL, 'run-tests']


GRACE = 3  # s from the watchdog's TERM to its KILL of the command's group: under run-tests' own 5 s (stop_child), so run-tests never KILLs the watchdog first


class Interrupted(Exception):
    """The watchdog got TERM (run-tests stopping its job; nothing in ctl sends it INT): stop the command's group, then exit 128 + the signal."""


def stop_group(p):
    """TERM to P's process group, KILL GRACE s later (a command that ignores TERM, or a straggler worker), then reap P."""
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    try:
        os.killpg(p.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        p.wait(timeout=GRACE)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(p.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    p.wait()


def watchdog(argv):
    """`watchdog <secs> <dir> -- <cmd>...`: the command slot_run hands to run-tests, which starts it only once it HOLDS a slot, so the cap
    counts slot time and never the queue wait (CTL_SEM_MAX_WAIT, up to 1800 s, a gate first). Runs CMD in its own process group and stops
    that group after SECS (TERM, KILL after GRACE s); a TERM to the watchdog itself is passed on to the group the same way.
    <dir>/started: the command got its slot; <dir>/stopped: SECS passed (each holds its epoch time). -> CMD's exit code; 124 when
    stopped, 128 + the signal when interrupted."""
    secs, d, cmd = int(argv[0]), argv[1], argv[3:]

    def interrupted(sig, _frame):
        raise Interrupted(sig)

    signal.signal(signal.SIGTERM, interrupted)
    p = None
    try:
        write(os.path.join(d, 'started'), f'{time.time():.3f}\n')
        p = subprocess.Popen(cmd, process_group=0)
        return p.wait(timeout=secs)
    except subprocess.TimeoutExpired:
        write(os.path.join(d, 'stopped'), f'{time.time():.3f}\n')
        print(f'mutate watchdog: the command passed {secs} s in its slot; stopping its process group', flush=True)
        stop_group(p)
        return 124
    except Interrupted as e:
        if p is not None:
            stop_group(p)
        return 128 + e.args[0]


def backstop_secs(max_secs):
    """slot_run's outer timeout, a backstop only: the slot cap, the longest queue wait run-tests allows (CTL_SEM_MAX_WAIT, sem.sh), the
    watchdog's GRACE, and a margin for run-tests' last poll and probes. Only a run still queued, or a watchdog that failed, reaches it."""
    return env_int('CTL_MUTATE_BACKSTOP_SECS', max_secs + env_int('CTL_SEM_MAX_WAIT', 1800) + GRACE + 60)


def run_tests_cap_min(max_secs):
    """The explicit `--max-min` this verb hands run-tests (planner ruling 2026-10-05 14:36: every ctl internal caller names its cap): above the
    watchdog's cap + GRACE by at least a minute, so the watchdog (exit 2, `stopped`) always fires first and run-tests' 124 is only a backstop."""
    return max_secs // 60 + 2


def slot_run(label, cwd, cmd, max_secs):
    """One ctl run-tests call (one slot). -> (rc, slot_secs, log). The command runs under `watchdog`, INSIDE the slot: past max_secs of slot
    time it is stopped and this is a tool failure (P10's 10-minute rule is never broken quietly); the queue wait before the slot is not
    counted. A run still queued at the backstop is NoSlot, never "a smaller split"."""
    d = tempfile.mkdtemp(prefix='watchdog-', dir=os.environ.get('CTL_MUTATE_TMP') or None)
    try:
        return slot_run_in(label, cwd, cmd, max_secs, d)
    finally:
        shutil.rmtree(d, ignore_errors=True)


def slot_run_in(label, cwd, cmd, max_secs, d):
    argv = run_tests_cmd() + ['--label', label, '--max-min', str(run_tests_cap_min(max_secs)), '--', sys.executable, os.path.abspath(__file__), 'watchdog', str(max_secs), d, '--'] + cmd
    backstop = backstop_secs(max_secs)
    t0 = time.time()
    p = subprocess.Popen(argv, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        out, _ = p.communicate(timeout=backstop)
    except subprocess.TimeoutExpired:
        p.send_signal(signal.SIGTERM)
        try:
            p.communicate(timeout=30)
        except subprocess.TimeoutExpired:
            p.kill()
            p.communicate()
        if not os.path.exists(os.path.join(d, 'started')):
            raise NoSlot(f'{label}: no test slot within {backstop} s (still queued when the backstop fired); nothing was run')
        raise ToolFailure(f'{label}: the slot-run was still running {backstop} s after it was queued and was stopped (its watchdog did not stop it at {max_secs} s)')
    if os.path.exists(os.path.join(d, 'stopped')):
        raise ToolFailure(f'{label}: the slot-run passed {max_secs} s in its slot and was stopped (P10: no slot-run over 10 min; the file needs a smaller split)')
    wall = time.time() - t0
    m = re.search(r'queue wait: (\d+)s', out or '')
    wait = int(m.group(1)) if m else 0
    lm = re.findall(r'^log: (.+)$', out or '', re.M)
    if p.returncode == 75:
        raise NoSlot(f'{label}: no test slot came free (run-tests exit 75); nothing was run')
    return p.returncode, max(0.0, wall - wait), (lm[-1].strip() if lm else '(no log line)'), out


def recover_stryker_backup(pkgdir, tempdir):
    """Stryker in place keeps the original of every file it rewrote under <tempdir>/backup-*/ and moves them back as it exits. A Stryker that
    died first (stopped by the watchdog, crashed, killed) leaves them there: put them back BEFORE the temp dir is removed (mutate.sh's trap
    does the same on a signal), or its edits stay in the tree. The caller then restores its own backup of the mutated file over this."""
    for bk in glob.glob(os.path.join(pkgdir, tempdir, 'backup-*')):
        for dp, _, names in os.walk(bk):
            for name in names:
                src = os.path.join(dp, name)
                dst = os.path.join(pkgdir, os.path.relpath(src, bk))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.move(src, dst)


def write(path, text):
    with open(path, 'w') as f:
        f.write(text)


# Stryker's vitest runner forces the threads pool (one worker). A test that sets process.env.TZ changes nothing inside a worker thread,
# so the repo's TZ CONTROLs ("setting process.env.TZ really does change local time") fail its dry run. vitest 3's own default is forks,
# the pool those tests were written for: this per-run wrapper of the package's config sends every file to forks, one at a time
# (poolMatchGlobs beats the runner's `pool` override; the runner's poolOptions.threads is left alone).
FORKS_WRAPPER = '''// ctl mutate: generated per run, removed after it
import base from {base};
export default async (env) => {{
  const b = typeof base === 'function' ? await base(env) : await base;
  const t = b.test || {{}};
  const po = t.poolOptions || {{}};
  return {{ ...b, test: {{ ...t, poolMatchGlobs: [['**', 'forks']], poolOptions: {{ ...po, forks: {{ ...(po.forks || {{}}), maxForks: 1, minForks: 1 }} }} }} }};
}};
'''
VITEST_CONFIGS = ('vitest.config.ts', 'vitest.config.mts', 'vitest.config.js', 'vitest.config.mjs')


def stryker_conf(repo, mutate, report, tempdir, vitest_config=None):
    runner = os.path.realpath(os.path.join(repo, 'node_modules', '@stryker-mutator', 'vitest-runner'))
    vt = {'related': True}  # only the tests that import the mutated file (vitest related): a whole-package dry run of apps/server would pass P10's cap
    if vitest_config:
        vt['configFile'] = vitest_config
    return {
        'plugins': [os.path.join(runner, 'dist', 'src', 'index.js')],  # by absolute path: the name alone failed in the spike
        'testRunner': 'vitest',
        'vitest': vt,
        'coverageAnalysis': 'perTest',
        'concurrency': 2,
        'timeoutMS': 10000,
        'mutate': mutate,
        'incremental': False,
        'ignoreStatic': False,  # module-level statics run (range O2: IDLE_MS = 200)
        'reporters': ['json', 'clear-text'],
        'jsonReporter': {'fileName': report},
        'clearTextReporter': {'allowColor': False, 'logTests': False, 'allowEmojis': False},
        # In place, not in a sandbox: a sandbox nests the package one level down, and a test that reads a sibling package by a path relative
        # to its own file (apps/server's 7.201 reads ../../packages/app-core/src) fails the dry run. The file is this run's own backed-up
        # copy (the manifest restores it on any exit), and Stryker restores it as well.
        'inPlace': True,
        'tempDirName': tempdir,
        'cleanTempDir': 'always',
        # Off: Stryker would otherwise write a `// @ts-nocheck` header into EVERY src/test/lib file of the package IN PLACE (measured: 534 apps/server
        # files left edited when a run was stopped). vitest never type-checks (esbuild strips the types), so the header buys nothing; with it
        # off, the only file Stryker rewrites in place is the mutated one, which the manifest backs up (13.2216 real-Stryker leg).
        'disableTypeChecks': False,
    }


STATUSES = ['Killed', 'Survived', 'NoCoverage', 'Timeout', 'RuntimeError', 'CompileError']


def main_run(args):
    repo = os.path.realpath(git(args.repo, 'rev-parse', '--show-toplevel').strip())
    tmp = os.environ.get('CTL_MUTATE_TMP') or ''
    if not args.dry_run and not os.path.isdir(tmp):
        raise ToolFailure('CTL_MUTATE_TMP is not set: run ctl mutate, not mutate.py')
    head = git(repo, 'rev-parse', 'HEAD').strip()
    branch = git(repo, 'branch', '--show-current').strip() or 'detached'
    if git(repo, 'status', '--porcelain', '--untracked-files=no').strip():
        raise ToolFailure('the worktree has uncommitted tracked changes: commit them first (the sweep mutates committed lines)')
    base, how = resolve_base(repo, args.base)
    cap = env_int('CTL_MUTATE_SPLIT', 300)
    max_secs = env_int('CTL_MUTATE_MAX_SECS', 600)
    diff = git(repo, 'diff', '--unified=0', '--no-color', '--no-ext-diff', f'{base}..HEAD', '--', '*.ts', '*.tsx')
    ranges = parse_ranges(diff)
    lines = [f'ctl mutate: {branch} {head[:8]} against {base[:8]} ({how})']
    excluded, skipped, files = [], [], []
    pg = None
    for path in sorted(ranges):
        why = source_verdict(path)
        if why:
            excluded.append((path, why))
            continue
        pkg = package_of(repo, path)
        if pkg is None:
            skipped.append((path, 'no package.json below the repo root'))
            continue
        if not has_vitest(repo, pkg):
            skipped.append((path, f'{pkg} has no vitest'))
            continue
        if pkg == 'apps/server':
            if pg is None:
                pg = pg_reachable()
            if not pg[0]:
                skipped.append((path, f'apps/server: the test Postgres {pg[1]} is not reachable'))
                continue
        files.append((pkg, path[len(pkg) + 1:], ranges[path]))
    plan = []
    skipped_counts = {}
    for pkg, rel, rs in files:
        a = ast_plan(repo, pkg, rel, rs)
        for k, v in a['skipped'].items():
            skipped_counts[k] = skipped_counts.get(k, 0) + v
        counts = {int(k): v for k, v in (a['strykerCount'] or {}).items()}
        if a['strykerCount'] is None:  # the instrumenter could not count: 2 per changed line, said so
            counts = {ln: 2 for x, y in rs for ln in range(x, y + 1)}
            lines.append(f'  note: {pkg}/{rel}: mutant count estimated (instrumenter: {a["countError"]})')
        fallback = a['injectParse'] != 'ok'
        chunks = split_lines(rs, counts, cap)
        plan.append({'pkg': pkg, 'rel': rel, 'ranges': rs, 'ast': a, 'fallback': fallback, 'chunks': chunks})
    for path, why in excluded:
        lines.append(f'  excluded {path}: {why}')
    for path, why in skipped:
        lines.append(f'  SKIPPED  {path}: {why}')
    lines.append('  custom literals not injected: ' + (', '.join(f'{k} {v}' for k, v in sorted(skipped_counts.items())) or 'none'))
    runs = 0
    for f in plan:
        cust = sum(len(c['alts']) for c in f['ast']['customs'])
        lines.append(f"  file {f['pkg']}/{f['rel']}: ranges {','.join(f'{a}-{b}' for a, b in f['ranges'])}; "
                     f"{len(f['ast']['customs'])} custom sites ({cust} mutants), {len(f['ast']['casts'])} casts stripped")
        if f['fallback']:
            lines.append(f"    FALLBACK (A) for this file only: the injected copy is {f['ast']['injectParse']}; each custom mutant runs as one vitest run")
        for k, (rs, n) in enumerate(f['chunks']):
            if n == 0 and f['ast']['strykerCount'] is not None:
                lines.append(f"    {f['rel']}:{','.join(f'{a}-{b}' for a, b in rs)}: no mutant on these lines, not run")
                continue
            runs += 1
            lines.append(f"    run {runs}: stryker on {f['rel']}:{','.join(f'{a}-{b}' for a, b in rs)} (~{n} mutants) in {f['pkg']}, one slot-run")
        if f['fallback']:
            runs += cust
            lines.append(f"    runs: {cust} x vitest run (one slot-run each), the custom mutants of {f['rel']}")
    print('\n'.join(lines), flush=True)
    if args.dry_run:
        print(f'mutate: dry-run, {len(plan)} files, {runs} slot-runs planned, nothing run')
        return 0, None
    if plan:
        core = os.path.join(repo, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js')
        if not os.path.isfile(core) or not os.path.isdir(os.path.join(repo, 'node_modules', '@stryker-mutator', 'vitest-runner')):
            raise ToolFailure(f'Stryker is not installed in {repo} (root devDependencies @stryker-mutator/core + vitest-runner: pnpm install)')
    man = Manifest(tmp)
    st = {'slot_secs': 0.0, 'k': 0, 'runlog': []}
    results, failures = [], []
    for f in plan:
        path = f'{f["pkg"]}/{f["rel"]}'
        try:
            results.append((path, run_file(repo, tmp, man, f, core, max_secs, st)))
        except NoSlot:
            raise
        except ToolFailure as e:  # this file's results cannot be trusted; the other files' still can, and the sweep exits 2
            failures.append((path, str(e)))
            st['runlog'].append(f'TOOL FAILURE {path}: {e}')
    return 0, {'repo': repo, 'branch': branch, 'head': head, 'base': base, 'how': how, 'lines': lines, 'results': results, 'failures': failures,
               'slot_secs': st['slot_secs'], 'runlog': st['runlog'], 'skipped': skipped, 'excluded': excluded, 'skipped_counts': skipped_counts}


def setup_files(pkgdir):
    return {n for n in os.listdir(pkgdir) if re.fullmatch(r'stryker-setup-\d+\.js', n)}


def run_file(repo, tmp, man, f, core, max_secs, st):
    """Stryker run(s) for ONE file (one slot-run per chunk), then its fallback custom runs if any. -> the file's mutant results."""
    runlog = st['runlog']
    pkgdir = os.path.join(repo, f['pkg'])
    src = os.path.join(pkgdir, f['rel'])
    vitest = find_up(pkgdir, os.path.join('node_modules', 'vitest', 'vitest.mjs'))
    if not vitest:
        raise ToolFailure(f'{f["pkg"]}: node_modules/vitest/vitest.mjs not found above {pkgdir}')
    original = open(src).read()
    backup = man.backup(src)
    file_res = []
    for rs, n in f['chunks']:
        if n == 0 and f['ast']['strykerCount'] is not None:
            runlog.append(f'{f["pkg"]}/{f["rel"]}:{",".join(f"{a}-{b}" for a, b in rs)}: no mutant on these lines, not run')
            continue
        st['k'] += 1
        k = st['k']
        customs = [] if f['fallback'] else [c for c in f['ast']['customs'] if in_ranges(c['line'], rs)]
        report = os.path.join(tmp, f'report-{k}.json')
        tempdir = f'.stryker-tmp-ctlmutate-{os.getpid()}-{k}'
        man.created(os.path.join(pkgdir, tempdir))
        had = setup_files(pkgdir)  # the vitest runner writes stryker-setup-<worker>.js beside the config (inPlace: in the package itself)
        man.setup_glob(pkgdir, had)
        wrapper = None
        base_cfg = next((c for c in VITEST_CONFIGS if os.path.isfile(os.path.join(pkgdir, c))), None)
        if base_cfg:  # beside the package (its node_modules resolve), in a dir the manifest removes on any exit
            cfgdir = os.path.join(pkgdir, f'{tempdir}-vitest')
            man.created(cfgdir)
            os.makedirs(cfgdir, exist_ok=True)
            wrapper = os.path.join(cfgdir, 'vitest.config.mjs')
            write(wrapper, FORKS_WRAPPER.format(base=json.dumps(os.path.join(pkgdir, base_cfg))))
        conf = os.path.join(tmp, f'stryker-{k}.conf.json')
        write(conf, json.dumps(stryker_conf(repo, [f"{f['rel']}:{a}-{b}" for a, b in rs], report, tempdir, wrapper), indent=1))
        write(src, f['ast']['castOnly'] if f['fallback'] else f['ast']['transformed'])
        try:
            rc, secs, log, _ = slot_run(f'mutate-{k}-{os.path.basename(f["rel"])}', pkgdir, ['node', core, 'run', conf], max_secs)
        finally:
            recover_stryker_backup(pkgdir, tempdir)
            shutil.copy2(backup, src)
            shutil.rmtree(os.path.join(pkgdir, tempdir), ignore_errors=True)
            shutil.rmtree(os.path.join(pkgdir, f'{tempdir}-vitest'), ignore_errors=True)
            for name in setup_files(pkgdir) - had:
                os.remove(os.path.join(pkgdir, name))
        st['slot_secs'] += secs
        runlog.append(f'stryker run {k} {f["pkg"]}/{f["rel"]}:{",".join(f"{a}-{b}" for a, b in rs)}: rc {rc}, {secs:.0f} s, log {log}')
        # CONTROL (ruling 16:40 (4)): Stryker's own dry run on the injected copy (every switch at the original) must be green and
        # see as many tests as the same test files hold on the unmutated tree.
        if rc != 0 or not os.path.isfile(report):
            raise ToolFailure(f'{f["pkg"]}/{f["rel"]} run {k}: Stryker failed (rc {rc}: the dry run on the injected copy is red, or the config is wrong); log {log}')
        rep = json.load(open(report))
        tfiles = {os.path.normpath(os.path.join(pkgdir, t)): len(v.get('tests', [])) for t, v in rep.get('testFiles', {}).items()}
        if tfiles:  # the same test files, listed on the RESTORED (unmutated) tree: collection only, no test runs
            lj = os.path.join(tmp, f'list-{k}.json')
            lrc, lsecs, llog, _ = slot_run(f'mutate-{k}-control', pkgdir, ['node', vitest, 'list', *sorted(os.path.relpath(t, pkgdir) for t in tfiles), f'--json={lj}'], max_secs)
            st['slot_secs'] += lsecs
            if lrc != 0 or not os.path.isfile(lj):
                raise ToolFailure(f'{f["pkg"]}/{f["rel"]} run {k}: control: `vitest list` on the unmutated tree failed (rc {lrc}); log {llog}')
            want = sum(1 for t in json.load(open(lj)) if os.path.normpath(t.get('file', '')) in tfiles)
            seen = sum(tfiles.values())
            runlog.append(f'  control: {seen} tests in {len(tfiles)} files on the injected copy, {want} unmutated')
            if seen != want:
                raise ToolFailure(f'{f["pkg"]}/{f["rel"]} run {k}: control: the injected copy registers {seen} tests, the unmutated tree {want} (an injected switch broke a test file\'s import?); log {log}')
        entry = rep['files'].get(f['rel'])
        mutants = entry['mutants'] if entry else []
        custom, stryker, problems, injected, counted = reconcile(customs, mutants, entry['source'] if entry else '')
        runlog.append(f'  custom injected {injected} == counted {counted}' if not problems and injected == counted else f'  custom injected {injected} != counted {counted}')
        if problems or injected != counted:
            raise ToolFailure(f'{f["pkg"]}/{f["rel"]} run {k}: custom injected {injected} != counted {counted}: ' + '; '.join(problems[:5]))
        file_res += stryker + custom
    if f['fallback']:
        for c in f['ast']['customs']:
            for alt in c['alts']:
                st['k'] += 1
                k = st['k']
                write(src, original[:c['origStart']] + alt + original[c['origEnd']:])
                try:
                    rc, secs, log, _ = slot_run(f'mutate-{k}-{os.path.basename(f["rel"])}-custom', pkgdir, ['node', vitest, 'run', '--maxWorkers=2'], max_secs)
                finally:
                    shutil.copy2(backup, src)
                st['slot_secs'] += secs
                runlog.append(f'vitest run {k} {f["rel"]}:{c["line"]} {c["original"]} → {alt}: rc {rc}, {secs:.0f} s, log {log}')
                file_res.append({'line': c['line'], 'mutator': f"custom:{c['kind']}", 'status': 'Survived' if rc == 0 else 'Killed', 'original': c['original'], 'replacement': alt})
    return file_res


def report(res, as_json):
    rows, surv, trouble = [], [], []
    s_n = c_n = 0
    for path, ms in res['results']:
        cnt = {s: 0 for s in STATUSES}
        for m in ms:
            cnt[m['status']] = cnt.get(m['status'], 0) + 1
            if m['status'] in ('Survived', 'NoCoverage'):
                surv.append((path, m))
                if m['mutator'].startswith('custom:'):
                    c_n += 1
                else:
                    s_n += 1
            elif m['status'] in ('RuntimeError', 'CompileError'):
                trouble.append((path, m))
        rows.append((path, len(ms), cnt))
    md = ['# ctl mutate ' + f"{res['branch']} {res['head'][:8]}", '', f"base {res['base'][:8]} ({res['how']}); repo {res['repo']}", '']
    md += ['| file | mutants | killed | survived | no-coverage | timeout | runtime-error |', '|---|---|---|---|---|---|---|']
    for path, n, c in rows:
        md.append(f"| {path} | {n} | {c['Killed']} | {c['Survived']} | {c['NoCoverage']} | {c['Timeout']} | {c['RuntimeError'] + c['CompileError']} |")
    md += ['', f'## Survivors ({len(surv)}: survived or no coverage)']
    md += [f"- `{p}:{m['line']}  {m['mutator']}  {m['original']} → {m['replacement']}`" + ('  (no coverage)' if m['status'] == 'NoCoverage' else '') for p, m in surv] or ['none']
    md += ['', f'## RuntimeError / CompileError ({len(trouble)}: triage items, NOT kills)']
    md += [f"- `{p}:{m['line']}  {m['mutator']}  {m['original']} → {m['replacement']}`  ({m['status']})" for p, m in trouble] or ['none']
    md += ['', f"## Tool failures ({len(res['failures'])}: these files' results are missing; the sweep exits 2)"]
    md += [f'- {p}: {w}' for p, w in res['failures']] or ['none']
    md += ['', '## Skipped and excluded'] + [f'- SKIPPED {p}: {w}' for p, w in res['skipped']] + [f'- excluded {p}: {w}' for p, w in res['excluded']]
    md += ['- custom literals not injected: ' + (', '.join(f'{k} {v}' for k, v in sorted(res['skipped_counts'].items())) or 'none')]
    md += ['', '## Runs'] + [f'- {r}' for r in res['runlog']] + ['', '## Plan'] + res['lines']
    d = os.environ.get('CTL_LOG_DIR') or os.path.expanduser('~/.cache/gisik-ctl')
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, f"mutate-{res['branch'].replace('/', '+')}-{res['head'][:8]}.md")
    write(path, '\n'.join(md) + '\n')
    mins = res['slot_secs'] / 60
    files_n = sum(1 for _, ms in res['results'] if ms)
    summary = f'mutate: {s_n + c_n} survived ({s_n} stryker + {c_n} custom) in {files_n} files, {mins:.1f} slot-min; log {path}'
    if as_json:
        print(json.dumps({'branch': res['branch'], 'head': res['head'], 'base': res['base'], 'log': path, 'slot_min': round(mins, 2),
                          'files': [{'path': p, 'mutants': n, **{k.lower(): v for k, v in c.items()}} for p, n, c in rows],
                          'survivors': [{'path': p, **m} for p, m in surv], 'triage': [{'path': p, **m} for p, m in trouble],
                          'skipped': [{'path': p, 'why': w} for p, w in res['skipped']],
                          'failures': [{'path': p, 'why': w} for p, w in res['failures']]}))
    else:
        for path_, n, c in rows:
            print(f"  {path_}: {n} mutants, {c['Killed']} killed, {c['Survived']} survived, {c['NoCoverage']} no-coverage, {c['Timeout']} timeout, {c['RuntimeError'] + c['CompileError']} runtime-error")
        for p, w in res['skipped']:
            print(f'  SKIPPED {p}: {w}')
        for p, m in surv:
            print(f"  SURVIVOR {p}:{m['line']}  {m['mutator']}  {m['original']} → {m['replacement']}")
        for p, m in trouble:
            print(f"  TRIAGE {p}:{m['line']}  {m['mutator']}  {m['original']} → {m['replacement']} ({m['status']})")
        for p, w in res['failures']:
            print(f'  TOOL-FAILURE {p}: {w}')
    print(summary)
    return (2 if res['failures'] else 1 if surv else 0), s_n + c_n, path


class Args:
    pass


def main(argv):
    if argv and argv[0] == 'watchdog':
        return watchdog(argv[1:])
    if argv and argv[0] == 'ranges':
        print(json.dumps(parse_ranges(open(argv[1]).read()), sort_keys=True))
        return 0
    if argv and argv[0] == 'filter':
        for p in argv[1:]:
            print(f'{p}\t{source_verdict(p) or "mutate"}')
        return 0
    if argv and argv[0] == 'reconcile':
        customs = json.load(open(argv[1]))
        rep = json.load(open(argv[2]))
        entry = next(iter(rep['files'].values()))
        custom, stryker, problems, injected, counted = reconcile(customs, entry['mutants'], entry['source'])
        print(json.dumps({'custom': custom, 'stryker': stryker, 'problems': problems, 'injected': injected, 'counted': counted}, sort_keys=True))
        return 0
    a = Args()
    a.repo, a.base, a.dry_run, a.json = os.getcwd(), '', False, False
    it = iter(argv)
    for x in it:
        if x == '--repo':
            a.repo = next(it, '')
        elif x == '--base':
            a.base = next(it, '')
        elif x == '--dry-run':
            a.dry_run = True
        elif x == '--json':
            a.json = True
        else:
            print(f'FAIL mutate unknown arg {x} — usage: ctl mutate [--repo <worktree>] [--base <ref>] [--dry-run] [--json]')
            return 2
    try:
        _, res = main_run(a)
        if res is None:
            print('OK mutate dry-run')
            return 0
        code, n, path = report(res, a.json)
        if code == 2:
            print(f'FAIL mutate tool failure in {len(res["failures"])} file(s): {res["failures"][0][1]} (the other files: {n} survivors; log {path})')
        elif code == 0:
            print(f'OK mutate 0 survivors (log {path})')
        else:
            print(f'FAIL mutate {n} survivors to triage: add a leg or write an equivalence line for each (log {path})')
        return code
    except ToolFailure as e:
        print(f'FAIL mutate tool failure: {e}')
        return 2
    except Exception as e:  # a crash (a malformed report, a KeyError): Python's own exit 1 would read as "survivors", so it is a tool failure
        traceback.print_exc()
        sys.stderr.flush()
        print(f'FAIL mutate tool failure: {type(e).__name__}: {e}')
        return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
