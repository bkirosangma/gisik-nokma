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
subjects = [s for s in git('log', '--format=%s', 'origin/main..HEAD').split('\n') if s]
tasks = []
for s in subjects:
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
print(f"check-pr.py: {len(tasks)} task commits, {len(files)} files, {len(fails)} failures")
sys.exit(1 if fails else 0)
