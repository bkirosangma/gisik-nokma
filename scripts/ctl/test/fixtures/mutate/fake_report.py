#!/usr/bin/env python3
"""The fake behind mutate.test.sh's run-tests shim: answers `vitest list --json=F` with 3 tests in test/calc.test.ts, `stryker run CONF` with a
report holding one BooleanLiteral flip per injected `false` token of the file in place (FAKE_MODE flips-dup: each twice, the second as a
ConditionalExpression; flips-missing: the last token's flip left out; control-short: 1 test instead of 3; bad-report: a report that is not
JSON), and `vitest run` with exit 1. Every Stryker config it is handed is kept beside it as conf.json (13.2254 reads it), and appended to confs.jsonl.
The report's testFiles are the CAP the verb's vitest wrapper names (`const ONLY = [...]`): 3 tests each, the sentinel 1 (FAKE_SENTINEL_TESTS)
and every mutant NoCoverage when the sentinel is the only file; FAKE_CAP_LEAK=<file> adds a test file outside the cap, FAKE_CAP_NONE=1 reports none. The wrapper is kept as wrapper.mjs; `vitest list`
answers 3 tests per listed file. With ignoreStatic on,
the mutants on a module-level `export const LIMIT` line report Ignored (a static, as Stryker does)."""
import json, os, re, sys
mode = os.environ.get('FAKE_MODE', 'flips-dup')
argv = sys.argv[1:]
cwd = os.getcwd()
if len(argv) >= 2 and argv[1].endswith('vitest.mjs') and 'list' in argv:
    out = next(a.split('=', 1)[1] for a in argv if a.startswith('--json='))
    listed = [a for a in argv[argv.index('list') + 1:] if not a.startswith('--')] or ['test/calc.test.ts']
    json.dump([{'name': f't{i}', 'file': os.path.join(cwd, f)} for f in listed for i in range(3)], open(out, 'w'))
    sys.exit(0)
if len(argv) >= 2 and argv[1].endswith('vitest.mjs') and 'run' in argv:
    sys.exit(1)
conf = json.load(open(argv[-1]))
json.dump(conf, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'conf.json'), 'w'))
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'confs.jsonl'), 'a').write(json.dumps(conf) + '\n')
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
cfg = conf.get('vitest', {}).get('configFile')
m = re.search(r'^const ONLY = (\[.*\]);$', open(cfg).read(), re.M) if cfg else None
if cfg:
    open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wrapper.mjs'), 'w').write(open(cfg).read())
only = [x.replace('\\', '') for x in json.loads(m.group(1))] if m else ['test/calc.test.ts']
sentinel = len(only) == 1 and only[0].endswith('sentinel.test.mjs')
lines = src.split('\n')
for mu in mutants:
    if sentinel:
        mu['status'] = 'NoCoverage'
    elif conf.get('ignoreStatic') and lines[mu['location']['start']['line'] - 1].startswith('export const LIMIT'):
        mu['status'] = 'Ignored'
        mu['statusReason'] = 'Static mutant (and "ignoreStatic" was enabled)'
def count(f):
    return int(os.environ.get('FAKE_SENTINEL_TESTS', '1')) if f.endswith('sentinel.test.mjs') else 1 if mode == 'control-short' else 3
files = [] if os.environ.get('FAKE_CAP_NONE') else only + ([os.environ['FAKE_CAP_LEAK']] if os.environ.get('FAKE_CAP_LEAK') else [])
rep = {'files': {rel: {'source': src, 'mutants': mutants}}, 'testFiles': {f: {'tests': [{'id': f'{f}#{i}', 'name': f't{i}'} for i in range(count(f))]} for f in files}}
json.dump(rep, open(conf['jsonReporter']['fileName'], 'w'))
