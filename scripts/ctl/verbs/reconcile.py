#!/usr/bin/env python3
"""reconcile.py <repo> — ledger ids vs report headings by membership (aliases + withdrawn markers), plus plan coverage."""
import csv, re, sys, os
repo = sys.argv[1]; L = lambda p: os.path.join(repo, 'docs/lanes', p)
rows = list(csv.reader(open(L('review-scores.tsv'), newline=''), delimiter='\t'))[1:]
led = {}
for r in rows:
    if r[0].startswith('R'): continue
    led.setdefault(r[1], set()).add(r[0])
rep = {'exec1':'review-ui-exec1.md','exec2':'review-ux-exec2.md','exec3':'review-functionality-exec3.md','exec4':'review-ui-exec4.md','exec5':'review-ux-exec5.md','exec6':'review-functionality-exec6.md'}
pat = re.compile(r'^#{2,4} .*?\b(E[1-6]-\d+|P\d+|I\d+|F\d+|V\d+)\b')
def alias2(i):
    m = re.match(r'E2-(\d+)$', i)
    if m:
        n = int(m.group(1))
        if n <= 9: return f'F{n}'
        if n <= 19: return f'V{n-9}'
    return i
bad = 0
for lane, f in rep.items():
    heads = set()
    text = open(L(f), encoding='utf-8').read()
    for line in text.split('\n'):
        m = pat.match(line)
        if m:
            i = m.group(1)
            if lane == 'exec2': i = alias2(i)
            if lane == 'exec3' and not i.startswith(('E3-', 'F')): continue   # exec 3 cites other lanes' ids in its attack sections
            heads.add(i)
    if lane == 'exec3': heads = {i for i in heads if not re.match(r'E3-[1-8]$', i)}  # its round-1 F1..F8 are cited as E3-1..8 in prose
    if lane == 'exec6': heads |= set(re.findall(r'^### (E6-\d+)', open(L('review-refutations-exec6.md'), encoding='utf-8').read(), re.M))
    ledger = {alias2(i) if lane == 'exec2' else i for i in led.get(lane, set())}
    only_report, only_ledger = sorted(heads - ledger), sorted(ledger - heads)
    print(f"{lane}: headings {len(heads)} ledger {len(ledger)} | report-only {only_report} | ledger-only {only_ledger}")
    bad += len(only_report) + len(only_ledger)
plan = L('release-2026-09-22-plan.md')
if os.path.exists(plan):
    tids = set(re.findall(r'^#### (T-[\w./-]+)', open(plan, encoding='utf-8').read(), re.M))
    valid = {(r[0], r[1]) for r in rows if not r[0].startswith('R') and float(r[4] or 0) > 0}
    def tid(fid, lane):
        if fid.startswith('E'): return f'T-{fid}'
        if fid.startswith('F'): return f'T-{fid}-' + ('ux' if lane == 'exec2' else 'fn')
        return f'T-{fid}'
    missing = sorted(tid(f, l) for f, l in valid if tid(f, l) not in tids)
    print(f"plan coverage: {len(valid)} valid rulings, {len(tids)} tasks, missing {missing}")
    bad += len(missing)
print(f"reconcile.py: {bad} discrepancies")
sys.exit(1 if bad else 0)
