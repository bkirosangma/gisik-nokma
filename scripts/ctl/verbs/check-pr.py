#!/usr/bin/env python3
"""check-pr.py <repo> <plan.md> <progress.md> <body-or-empty> — the mechanical half of the plan's §4. Exits 1 with every failed condition listed."""
import re, subprocess, sys, os
repo, plan, progress, body = sys.argv[1:5]
def git(*a): return subprocess.run(['/usr/bin/git', '-C', repo, *a], capture_output=True, text=True).stdout
ids = set(re.findall(r'^#### (T-[\w./-]+)', open(os.path.join(repo, plan), encoding='utf-8').read(), re.M))
ruling_of = {t: t[2:] for t in ids}  # T-E6-15 -> E6-15 ; T-F3-ux -> F3-ux (commit subjects use the ruling id: F3)
def ruling_id(subject):
    m = re.match(r'([A-Z]+\d*-?\d+)\b', subject); return m.group(1) if m else None
fails = []
files = [f for f in git('diff', '--name-only', 'origin/main...HEAD').split('\n') if f]
# A branch satisfies the gate's "contains origin/main" by MERGING origin/main (never rebasing: PR bodies and DONE reports
# cite lane commits by sha), so the merge commit's subject is not a task and is not held to the ruling-id rule.
# Every batch branch carries two protocol bookkeeping commits — the progress claim line and the PR body — whose subjects
# start with the batch id ("B05: …", "B05 PR body …", "| B05 | claimed"). Controller ruling 2026-09-21: such a commit is
# bookkeeping (not a task, not a failure) only when its diff touches nothing but the progress file and/or
# docs/lanes/pr-bodies/; any other non-ruling-id subject still fails. Lane history is never rewritten. No plan task id
# begins with B, so the prefix cannot shadow a ruling id.
BOOKKEEPING = re.compile(r'^\|?\s*B\d\d\b')
BOOKKEEPING_PATHS = ('docs/lanes/release-2026-09-22-progress.md', 'docs/lanes/pr-bodies/')
commits = [c.split('\x00', 1) for c in git('log', '--no-merges', '--format=%H%x00%s', 'origin/main..HEAD').split('\n') if c]
tasks, bookkeeping = [], []
for sha, s in commits:
    if BOOKKEEPING.match(s):
        touched = [f for f in git('show', '--name-only', '--format=', sha).split('\n') if f]
        outside = [f for f in touched if not f.startswith(BOOKKEEPING_PATHS)]
        if outside:
            fails.append(f"batch-id subject but the diff touches files outside the progress file / docs/lanes/pr-bodies/: {s!r} -> {', '.join(outside)}"); continue
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
if body and os.path.exists(body):
    b = open(body, encoding='utf-8').read()
    for lp in re.findall(r'(/[\w./-]+\.log)', b):
        if not os.path.exists(lp): fails.append(f"PR body names a log that does not exist: {lp}"); continue
        tail = ''.join(open(lp, errors='replace').readlines()[-30:])
        if 'Test Files' not in tail or 'passed' not in tail: fails.append(f"log has no green summary in its last 30 lines: {lp}")
else:
    fails.append("no PR body file given (--body FILE) — the reviewer pass needs the log paths")
for f in fails: print("  -", f)
print(f"check-pr.py: {len(tasks)} task commits, {len(bookkeeping)} bookkeeping commits, {len(files)} files, {len(fails)} failures")
sys.exit(1 if fails else 0)
