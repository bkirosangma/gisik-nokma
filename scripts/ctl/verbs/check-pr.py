#!/usr/bin/env python3
"""check-pr.py <repo> <plan.md> <progress.md> <body-or-empty> [base] — the mechanical half of the plan's §4. Exits 1 with every failed condition listed.
base (default main; main or release/<name> only) is the integration branch the diff and the commit list are taken against, as origin/<base>."""
import re, subprocess, sys, os
repo, plan, progress, body = sys.argv[1:5]
base = sys.argv[5] if len(sys.argv) > 5 else 'main'
# Same rule as lib.sh's ctl_base_valid: main, or release/<segments>; nothing else is an integration branch.
_seg = r'[A-Za-z0-9_][A-Za-z0-9._-]*'
if not (base == 'main' or (re.fullmatch(rf'release/{_seg}(/{_seg})*', base) and '..' not in base and not base.endswith(('.', '.lock')) and '.lock/' not in base)):
    print(f"check-pr.py: base {base!r} is not an integration branch — main or release/<name> only"); sys.exit(2)
def git(*a): return subprocess.run(['/usr/bin/git', '-C', repo, *a], capture_output=True, text=True).stdout
ids = set(re.findall(r'^#### (T-[\w./-]+)', open(os.path.join(repo, plan), encoding='utf-8').read(), re.M))
ruling_of = {t: t[2:] for t in ids}  # T-E6-15 -> E6-15 ; T-F3-ux -> F3-ux (commit subjects use the ruling id: F3)
def ruling_id(subject):
    m = re.match(r'([A-Z]+\d*-?\d+)\b', subject); return m.group(1) if m else None
fails = []
files = [f for f in git('diff', '--name-only', f'origin/{base}...HEAD').split('\n') if f]
# A branch satisfies the gate's "contains origin/<base>" by MERGING origin/<base> (never rebasing: PR bodies and DONE reports
# cite lane commits by sha), so the merge commit's subject is not a task and is not held to the ruling-id rule.
# Every batch branch carries protocol commits whose subjects start with the batch id ("B05: …", "B05 PR body …",
# "| B05 | claimed") or with "Progress:" (a lane's per-task progress-row commits). Controller rulings 2026-09-21:
#   - such a commit whose diff stays in the bookkeeping/catalogue paths below is BOOKKEEPING (not a task, not a failure);
#   - such a commit whose diff also touches apps/, packages/ or scripts/ is a batch-labelled FIX-UP: lanes squash a task's
#     code into its progress commit, or label a ratchet fix "Bnn:"; history is never rewritten, so it is COUNTED AND LISTED
#     in the record rather than failed;
#   - any other non-ruling-id subject still fails. No plan task id begins with B or Progress, so the prefix cannot shadow
#     a ruling id.
BOOKKEEPING = re.compile(r'^\|?\s*(B\d\d\b|Progress\b)')
BOOKKEEPING_PATHS = ('docs/lanes/release-2026-09-22-progress.md', 'docs/lanes/pr-bodies/', 'test-cases/', 'Features.md', 'docs/')
commits = [c.split('\x00', 1) for c in git('log', '--no-merges', '--format=%H%x00%s', f'origin/{base}..HEAD').split('\n') if c]
tasks, bookkeeping, fixups = [], [], []
for sha, s in commits:
    if BOOKKEEPING.match(s):
        touched = [f for f in git('show', '--name-only', '--format=', sha).split('\n') if f]
        outside = [f for f in touched if not f.startswith(BOOKKEEPING_PATHS)]
        if outside:
            fixups.append((sha[:8], s, outside)); continue
        bookkeeping.append(s); continue
    rid = ruling_id(s)
    if not rid or not any(ruling_of[t].startswith(rid) for t in ids):
        fails.append(f"commit subject does not start with a ruling id in the plan: {s!r}"); continue
    tasks.append(rid)
if not tasks: fails.append("no task commits on this branch")
allowed_free = ('Features.md', 'test-cases/', 'docs/lanes/release-2026-09-22-progress.md')
if files and not any(f.startswith(allowed_free) or f.startswith(('apps/', 'packages/', 'docs/', 'scripts/', '.github/', 'deploy/', 'design-system/')) for f in files):
    fails.append("diff touches nothing a task can claim")
if any(f.startswith(('apps/', 'packages/')) for f in files) and not any(f.startswith(('Features.md', 'test-cases/')) for f in files):
    fails.append("apps/ or packages/ changed but neither Features.md nor test-cases/ did")
prog = open(os.path.join(repo, progress), encoding='utf-8').read() if os.path.exists(os.path.join(repo, progress)) else ''
for rid in tasks:
    if not re.search(r'^\| T-' + re.escape(rid) + r'\S* \| (done|skipped|blocked|needs-owner) \|', prog, re.M):
        fails.append(f"progress file has no line for {rid}")
# A cited log is judged by the CLAIM its citing line makes about it — green must be green, red must be red, a log cited
# without a claim need only exist. The plan's §4 body cites both halves of every TDD pair on one row ("1 failed → 18
# passed | x-red.log · x-green.log"), turbo build logs, mutation probes and browser measurements; a rule that demanded a
# green vitest summary of every path failed every real batch (B03: 7 conditions, B04: 15; controller ruling 2026-09-21).
LOG_RE = re.compile(r'(/[\w./-]+\.log)')
RTK_RE = re.compile(r'PASS \((\d+)\) FAIL \((\d+)\)')
def log_state(path, typecheck=False):
    """What the log says: ('green'|'red'|'none', detail). Vitest's own summary sits in the last 30 lines; a run captured
    through the rtk proxy prints `PASS (n) FAIL (m)` near the TOP and a stack trace as its tail (controller ruling
    2026-09-21: read the first 5 lines too). A typecheck log has no suite summary: `EXIT=0` with no `error TS` is green."""
    lines = open(path, errors='replace').readlines()
    tail = ''.join(lines[-30:]); head = ''.join(lines[:5])
    m = re.search(r'Test Files\s+(?:(\d+) failed)?(?: \| )?(?:(\d+) passed)?', tail)
    if m and 'Test Files' in tail:
        return ('red', f"vitest: Test Files {m.group(1)} failed") if m.group(1) else ('green', f"vitest: Test Files {m.group(2)} passed")
    r = RTK_RE.search(head) or RTK_RE.search(tail)
    if r:
        return ('red', f"rtk: FAIL ({r.group(2)})") if int(r.group(2)) > 0 else ('green', f"rtk: PASS ({r.group(1)}) FAIL (0)")
    t = re.search(r'Tasks:\s+(\d+) successful, (\d+) total', tail)
    if t:
        ok = t.group(1) == t.group(2) and 'error TS' not in tail
        return ('green' if ok else 'red', f"turbo: Tasks {t.group(1)}/{t.group(2)}" + ('' if ok else ' or error TS'))
    if 'help-content: ok' in tail: return ('green', 'help-content: ok')
    if re.search(r'^> tsc\b', tail, re.M): return ('red', 'tsc: error TS') if 'error TS' in tail else ('green', 'tsc: no error TS')
    if typecheck or re.search(r'\b(typecheck|tsc)\b', tail):
        if 'error TS' in tail: return ('red', 'typecheck: error TS')
        if re.search(r'^EXIT=0\s*$', tail, re.M): return ('green', 'typecheck: EXIT=0, no error TS')
    return ('none', 'no summary in the first 5 / last 30 lines')
RED_NAME, GREEN_NAME = re.compile(r'(^|[-_.])(red\d*|probe\d*|mut\w*)([-_.]|$)'), re.compile(r'(^|[-_.])(green\d*|pass\w*|final\d*|g\d*)([-_.]|$)')
RED_WORDS, GREEN_WORDS = re.compile(r'\b(red|RED|probe|mutation|witnessed)\b'), re.compile(r'\b(green|GREEN|passed|PASS|ok|exit 0|EXIT=0)\b')
def claim(line, path, paths):
    """RED | GREEN | None, from (1) the path's own name — which WINS over the row: a row cites both halves of a TDD pair, so
    `…-red2.log` is red whatever green words sit beside it — (2) the summary adjacent to the path, (3) an arrow pair, (4) the line."""
    name = os.path.basename(path)
    if RED_NAME.search(name): return 'RED'
    if GREEN_NAME.search(name): return 'GREEN'
    i = line.index(path); after = line[i + len(path):]; before = line[:i]
    for other in paths:
        if other != path:
            if other in after: after = after[:after.index(other)]
            if other in before: before = before[before.rindex(other) + len(other):]
    after = after.split(' | ')[0][:120]; before = before.split(' | ')[-1][-120:]
    for seg in (after, before):
        if re.search(r'\bfailed\b', seg): return 'RED'
        if GREEN_WORDS.search(seg): return 'GREEN'
    if len(paths) == 2 and re.search(r'failed\b.*→.*\bpassed|→\s*\d+ passed', line):
        return 'RED' if paths.index(path) == 0 else 'GREEN'
    if GREEN_WORDS.search(line) and not RED_WORDS.search(line) and 'failed' not in line: return 'GREEN'
    return None
if body and os.path.exists(body):
    for line in open(body, encoding='utf-8').read().splitlines():
        paths = LOG_RE.findall(line)
        for lp in dict.fromkeys(paths):
            if not os.path.exists(lp): fails.append(f"PR body names a log that does not exist: {lp}"); continue
            c = claim(line, lp, paths); state, detail = log_state(lp, typecheck=bool(re.search(r'\b(tc\d*|typecheck|tsc)\b', os.path.basename(lp) + ' ' + line)))
            if c == 'GREEN' and state != 'green': fails.append(f"log cited as green is not green ({detail}): {lp}")
            elif c == 'RED' and state != 'red': fails.append(f"log cited as red is not red ({detail}): {lp}")
else:
    fails.append("no PR body file given (--body FILE) — the reviewer pass needs the log paths")
for sha, subj, outside in fixups: print(f"  ~ fix-up: {sha} {subj} -> {', '.join(outside)}")
for f in fails: print("  -", f)
fx = f", {len(fixups)} batch-labelled fix-ups ({', '.join(x[0] for x in fixups)})" if fixups else ""
print(f"check-pr.py: {len(tasks)} task commits, {len(bookkeeping)} bookkeeping commits{fx}, {len(files)} files, {len(fails)} failures")
sys.exit(1 if fails else 0)
