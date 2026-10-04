#!/usr/bin/env python3
"""The fake behind mutate.test.sh's run-tests shim: answers `vitest list --json=F` with 3 tests in test/calc.test.ts, `stryker run CONF` with a
report holding one BooleanLiteral flip per injected `false` token of the file in place (FAKE_MODE flips-dup: each twice, the second as a
ConditionalExpression; flips-missing: the last token's flip left out; control-short: 1 test instead of 3; bad-report: a report that is not
JSON), and `vitest run` with exit 1. Every Stryker config it is handed is kept beside it as conf.json (13.2254 reads it)."""
import json, os, re, sys
mode = os.environ.get('FAKE_MODE', 'flips-dup')
argv = sys.argv[1:]
cwd = os.getcwd()
if len(argv) >= 2 and argv[1].endswith('vitest.mjs') and 'list' in argv:
    out = next(a.split('=', 1)[1] for a in argv if a.startswith('--json='))
    json.dump([{'name': f't{i}', 'file': os.path.join(cwd, 'test', 'calc.test.ts')} for i in range(3)], open(out, 'w'))
    sys.exit(0)
if len(argv) >= 2 and argv[1].endswith('vitest.mjs') and 'run' in argv:
    sys.exit(1)
conf = json.load(open(argv[-1]))
json.dump(conf, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'conf.json'), 'w'))
if mode == 'bad-report':
    open(conf['jsonReporter']['fileName'], 'w').write('{"files": ')
    sys.exit(0)
rel = conf['mutate'][0].split(':')[0]
if os.environ.get('FAKE_FAIL_FILE') and rel.endswith(os.environ['FAKE_FAIL_FILE']):
    sys.exit(3)
spans = [tuple(map(int, m.split(':')[1].split('-'))) for m in conf['mutate']]
src = open(os.path.join(cwd, rel)).read()
mutants = []
for ln, line in enumerate(src.split('\n'), 1):
    if not any(a <= ln <= b for a, b in spans):
        continue
    for mm in re.finditer(r'(?<=[(:] )false|(?<=\()false', line):
        loc = {'start': {'line': ln, 'column': mm.start() + 1}, 'end': {'line': ln, 'column': mm.end() + 1}}
        mutants.append({'id': str(len(mutants)), 'mutatorName': 'BooleanLiteral', 'location': loc, 'replacement': 'true', 'status': 'Survived'})
        if mode == 'flips-dup':
            mutants.append({'id': str(len(mutants)), 'mutatorName': 'ConditionalExpression', 'location': loc, 'replacement': 'true', 'status': 'Survived'})
if mode == 'flips-missing' and mutants:
    mutants.pop()
tests = 1 if mode == 'control-short' else 3
rep = {'files': {rel: {'source': src, 'mutants': mutants}}, 'testFiles': {'test/calc.test.ts': {'tests': [{'id': str(i), 'name': f't{i}'} for i in range(tests)]}}}
json.dump(rep, open(conf['jsonReporter']['fileName'], 'w'))
