#!/usr/bin/env python3
"""anchor.py <state.md> <history.md> <N> <title> <body-file> <main-sha> <last-pr> <open-prs> <ctl-branch> <stack-line> <windows> <stamp>
Rotates the newest cycle to the history file, rewrites the card's mechanical rows, appends cycle N. Pure text; no git."""
import re, sys
state, hist, n, title, bodyf, main_sha, last_pr, open_prs, ctl_branch, stack, windows, stamp = sys.argv[1:13]
t = open(state, encoding='utf-8').read(); h = open(hist, encoding='utf-8').read(); body = open(bodyf, encoding='utf-8').read().rstrip()
m = re.search(r'^## 🔄 .*$', t, re.M)
if not m: sys.exit("FAIL anchor: no cycle section found")
prev = t[m.start():].rstrip()
if prev.endswith('---'): prev = prev[:-3].rstrip()
head = t[:m.start()]
i = h.index('\n---\n') + len('\n---\n')
open(hist, 'w', encoding='utf-8').write(h[:i] + '\n' + prev + '\n\n---\n' + h[i:])
def row(label, value):
    global head
    pat = re.compile(r'^(\| ' + re.escape(label) + r' \| )(.*?)( \| [^|]*\|)$', re.M)
    if not pat.search(head): sys.exit(f"FAIL anchor: card row '{label}' not found")
    head = pat.sub(lambda mm: mm.group(1) + value + mm.group(3), head, count=1)
row('`origin/main`', f'`{main_sha[:8]}` (#{last_pr})')
row('open PRs', f'**{open_prs}**')
row('controller worktree', f'`/Users/kiro/my_projects/gisik-nokma-ctl` — on `{ctl_branch}` | `git -C … status`'.split(' | ')[0])
row('dev stack', stack)
stamp_pat = re.compile(r'Last rewritten \*\*[^*]+\*\* at `origin/main` \*\*`[0-9a-f]+`\*\* \([^)]*\) by the cycle-\d+ controller, on branch `[^`]+`\.')
if not stamp_pat.search(head): sys.exit("FAIL anchor: card 'Last rewritten' stamp not found")
head = stamp_pat.sub(f'Last rewritten **{stamp}** at `origin/main` **`{main_sha[:8]}`** (#{last_pr}) by the cycle-{n} controller, on branch `{ctl_branch}`.', head, count=1)
head = re.sub(r'(\| \*\*REVIEW[^\n]*?\| )([^|]*)( \| `tmux list-windows -t gisik`)', lambda mm: mm.group(1) + mm.group(2) + mm.group(3), head)
cycle = f"## 🔄 {stamp} — **CYCLE {n}: {title}** `main` is **`{main_sha[:8]}`**; windows: {windows}.\n\n{body}\n\n---\n"
open(state, 'w', encoding='utf-8').write(head + cycle)
print(f"anchor.py: cycle {n} written, previous cycle rotated")
