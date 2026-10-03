#!/usr/bin/env python3
"""run-tests-summary.py LOG MAXLINES [RC] — the digest of a test / typecheck / build log, never more than MAXLINES lines.

Counts first (they are the answer), then the first failure: its name and its assertion. ANSI codes and turbo's `@scope/pkg:task: ` line
prefixes are stripped before anything is matched. A log with no recognisable summary prints `no test summary found` and its last lines.
"""
import re
import sys

ANSI = re.compile(r'\x1b\[[0-9;?]*[ -/]*[@-~]')
TURBO = re.compile(r'^(?:@[\w.-]+/[\w.-]+|[\w.-]+(?=:(?:build|test|lint|typecheck|check|tsc)\b)):[\w:-]+: ?')
WIDTH = 180


def clean(log):
    out = []
    for raw in open(log, errors='replace'):
        line = TURBO.sub('', ANSI.sub('', raw.rstrip('\n')).replace('\r', ''))
        out.append(line)
    return out


def cut(s):
    s = s.rstrip()
    return s if len(s) <= WIDTH else s[:WIDTH - 1] + '…'


def first_failure(lines):
    for i, line in enumerate(lines):
        m = re.match(r'^\s*FAIL\s+(\S.*?)\s*$', line)
        if not m:
            continue
        block = ['first failure: ' + m.group(1)]
        for j in range(i + 1, min(i + 14, len(lines))):
            if re.match(r'^\s*(?:\w*Error|Error)\b', lines[j]):
                block.append('  ' + lines[j].strip())
                for k in range(j + 1, min(j + 8, len(lines))):
                    t = lines[k].strip()
                    if t.startswith('❯') or t.startswith('FAIL'):
                        break
                    if t:
                        block.append('  ' + t)
                break
        return block
    return []


def main():
    log, maxlines = sys.argv[1], int(sys.argv[2])
    rc = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    lines = clean(log)
    head, detail = [], []
    for key in (r'Test Files', r'Tests'):
        hits = [re.sub(r'^\s+', '', l).rstrip() for l in lines if re.match(r'^\s*' + key + r'\s{2,}\S', l)]
        if hits:
            head += hits[-3:]
            if len(hits) > 3:
                head.append('(+%d earlier "%s" lines in the log)' % (len(hits) - 3, key))
    ts = [l.strip() for l in lines if re.search(r'\berror TS\d+:', l)]
    if ts:
        head.append('tsc: %d error%s' % (len(ts), '' if len(ts) == 1 else 's'))
        detail = ['first error: ' + ts[0]]
    for key in ('Tasks:', 'Failed:'):
        hits = [l.strip() for l in lines if re.match(r'^\s*' + key + r'\s', l)]
        if hits:
            head.append(hits[-1])
    if not detail:
        detail = first_failure(lines)
    if not head and not detail:
        tail = [l for l in lines if l.strip()][-(3 if rc == 0 else 8):]
        head = ['no test summary found; last lines of the log:'] + ['  ' + l.strip() for l in tail]
    out = [cut(l) for l in head]
    room = max(maxlines - len(out), 0)
    out += [cut(l) for l in detail[:room]]
    print('\n'.join(out[:maxlines]))


main()
