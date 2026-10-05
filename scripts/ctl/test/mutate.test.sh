#!/usr/bin/env bash
# ctl mutate — Stryker plus the custom classes on a branch's changed lines (test-cases 13.2200–13.2223, 13.2228, 13.2229, 13.2250–13.2259).
# Scratch git repos only (mktemp; never a worktree of this repo). The four real-Stryker legs (13.2206–13.2208 and the real 13.2216) link the
# checkout's own @stryker-mutator, vitest and typescript into the scratch repo and run through a PRIVATE semaphore dir (CTL_SEM_DIR), so the
# suite, itself run inside one slot-run, never waits on a second machine slot; so does 13.2250's real run-tests queue. Every other leg replaces
# run-tests with a recording shim.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CTL="$HERE/ctl"
PY="$HERE/verbs/mutate.py"
AST="$HERE/verbs/mutate-ast.mjs"
FX="$HERE/test/fixtures/mutate"
fails=0
. "$HERE/test/harness.sh"   # check NAME CODE, and the CTL_TEST_ONLY case filter
. "$HERE/lib.sh"; ctl_node22 || exit 1
G=/usr/bin/git
T="$(mktemp -d "${TMPDIR:-/tmp}/ctl-mutate-test.XXXXXX")"
LISTENER=""
cleanup() { [ -n "$LISTENER" ] && kill "$LISTENER" 2>/dev/null; for f in "$T"/*.fake/inner.pid; do [ -f "$f" ] && kill -KILL -- "-$(cat "$f")" 2>/dev/null; done; for f in "$T"/*.fake/fake.pid; do [ -f "$f" ] && kill -TERM -- "-$(ps -o pgid= -p "$(cat "$f")" 2>/dev/null | tr -d ' ')" 2>/dev/null; done; rm -rf "$T"; }
trap cleanup EXIT
export CTL_LOG_DIR="$T/logs" CTL_SEM_DIR="$T/sem"
real() { cd "$REPO" && python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1"; }
VITEST="$(real "$REPO/packages/domain/node_modules/vitest")"
TSC="$(real "$REPO/packages/domain/node_modules/typescript")"

# mkrepo DIR — a scratch repo: base commit, then a change commit (the fixture tree under $FX/after). HEAD~1 is the base.
mkrepo() {
  local d="$1"; mkdir -p "$d"; cp -R "$FX/before/." "$d/"
  $G -C "$d" init -q; $G -C "$d" config user.name fx; $G -C "$d" config user.email fx@example.invalid; $G -C "$d" config commit.gpgsign false
  printf 'node_modules\n' > "$d/.gitignore"
  $G -C "$d" add -A; $G -C "$d" commit -q -m base
  cp -R "$FX/after/." "$d/"; $G -C "$d" add -A; $G -C "$d" commit -q -m change
  mkdir -p "$d/node_modules"
  ln -s "$REPO/node_modules/@stryker-mutator" "$d/node_modules/@stryker-mutator"
  ln -s "$VITEST" "$d/node_modules/vitest"; ln -s "$TSC" "$d/node_modules/typescript"
}
# the recording run-tests shim (sleep mode: DIR.fake/ready once its setup and TERM trap are in place), in DIR.fake (outside the repo: the verb checks the repo's git status): FAKE_MODE fail | sleep | queued |
# backup-left | flips-dup | flips-missing | control-short | bad-report (fake_report.py). The verb's command is `<python> mutate.py watchdog <secs> <dir> -- <the run>`: the shim
# keeps the watchdog (it runs INSIDE the slot) and fakes only the run. FAKE_REAL_RUN_TESTS=<ctl>: the faked run goes through the REAL run-tests (a real queue).
# FAKE_NOREPORT_FILE=<suffix>: the Stryker run of the file ending in <suffix> exits 0 (through the watchdog) and writes NO report; other runs are untouched.
# FAKE_REPORT_THEN_FAIL_FILE=<suffix>: that file's Stryker run writes fake_report.py's normal (valid) report, kept as DIR.fake/rtf-report.json, then exits 3.
# FAKE_LIST_NOJSON_FILE=<base> / FAKE_LIST_FAIL_FILE=<base>: the `vitest list` control of the run labelled mutate-<k>-<base> (its label is mutate-<k>-control)
# exits 0 writing NO --json file (marker DIR.fake/list-nojson-hit) / writes fake_report.py's normal 3-test list (kept as DIR.fake/list-fail.json), then exits 1.
mkfake() {
  mkdir -p "$1.fake"
  cat > "$1.fake/fake-run-tests" <<'SH'
#!/usr/bin/env bash
d="$(dirname "$0")"; echo "$*" >> "$d/calls"; echo $$ > "$d/fake.pid"
label="$2"; shift 2; mm=(); [ "$1" = --max-min ] && { mm=(--max-min "$2"); shift 2; }; [ "$1" = -- ] && shift   # the verb's explicit cap (13.2328)
wd=(); all=("$@"); i=0
while [ "$i" -lt "${#all[@]}" ]; do if [ "${all[$i]}" = -- ]; then wd=("${all[@]:0:$((i + 1))}"); set -- "${all[@]:$((i + 1))}"; break; fi; i=$((i + 1)); done
job=""
trap 'echo "run-tests TERM" >> "$d/signals"; [ -n "$job" ] && { kill -TERM "$job" 2>/dev/null; wait "$job"; }; exit 143' TERM   # as run-tests stops its job on TERM (and waits for it)
case "${FAKE_MODE:-ok}" in
  fail) echo "queue wait: 0s"; echo "log: $d/fake.log"; exit 3;;
  queued) : > "$d/ready"; sleep "${FAKE_SLEEP:-60}" & job=$!; wait "$job"; exit 0;;   # still waiting for a slot: the command never starts
  sleep|backup-left) : > stryker-setup-0.js   # as the vitest runner does (inPlace: in the package); the trap must remove it
    # as a Stryker stopped mid-run leaves things: test/calc.test.ts rewritten in place, its original in <tempDirName>/backup-x/
    td="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["tempDirName"])' "${@: -1}")"
    mkdir -p "$td/backup-x/test" "$td/backup-x/src"; cp test/calc.test.ts "$td/backup-x/test/calc.test.ts"; printf '// @ts-nocheck\n' >> test/calc.test.ts
    cp src/calc.ts "$td/backup-x/src/calc.ts"   # Stryker's "original" of the mutated file is the verb's INJECTED copy: the verb's own backup must win
    [ "$FAKE_MODE" = backup-left ] && { echo "queue wait: 0s"; echo "log: $d/fake.log"; exit 1; }
    : > "$d/ready"
    ${wd[@]+"${wd[@]}"} bash -c 'echo $$ > "$0/inner.pid"; trap "echo \"command TERM\" >> \"\$0/signals\"; exit 143" TERM; sleep "$1" & wait $!' "$d" "${FAKE_SLEEP:-60}" & job=$!
    wait "$job"; rc=$?; echo "queue wait: 0s"; echo "log: $d/fake.log"; exit "$rc";;
esac
if [ -n "${FAKE_NOREPORT_FILE:-}" ] && [[ "${@: -1}" == *.conf.json ]] \
  && python3 -c 'import json,os,sys; sys.exit(0 if json.load(open(sys.argv[1]))["mutate"][0].split(":")[0].endswith(os.environ["FAKE_NOREPORT_FILE"]) else 1)' "${@: -1}"; then
  echo "queue wait: 0s"; echo "log: $d/fake.log"; exec ${wd[@]+"${wd[@]}"} true   # a Stryker that exits 0 without writing its report
fi
if [ -n "${FAKE_REPORT_THEN_FAIL_FILE:-}" ] && [[ "${@: -1}" == *.conf.json ]] \
  && python3 -c 'import json,os,sys; sys.exit(0 if json.load(open(sys.argv[1]))["mutate"][0].split(":")[0].endswith(os.environ["FAKE_REPORT_THEN_FAIL_FILE"]) else 1)' "${@: -1}"; then
  rep="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["jsonReporter"]["fileName"])' "${@: -1}")"
  echo "queue wait: 0s"; echo "log: $d/fake.log"   # a Stryker that writes its (valid) report, then fails: a reporter or teardown error
  exec ${wd[@]+"${wd[@]}"} bash -c 'd="$0" r="$1"; shift; python3 "$d/fake_report.py" "$@" || exit 9; cp "$r" "$d/rtf-report.json"; exit 3' "$d" "$rep" "$@"
fi
k="${label#mutate-}"; k="${k%%-*}"; lj=""; for a in "$@"; do case "$a" in --json=*) lj="${a#--json=}";; esac; done
if [[ "$label" == mutate-*-control ]] && [ -n "${FAKE_LIST_NOJSON_FILE:-}" ] && grep -q -e "^--label mutate-$k-$FAKE_LIST_NOJSON_FILE " "$d/calls"; then
  : > "$d/list-nojson-hit"; echo "queue wait: 0s"; echo "log: $d/fake.log"; exec ${wd[@]+"${wd[@]}"} true   # `vitest list` exits 0 without its JSON
fi
if [[ "$label" == mutate-*-control ]] && [ -n "${FAKE_LIST_FAIL_FILE:-}" ] && grep -q -e "^--label mutate-$k-$FAKE_LIST_FAIL_FILE " "$d/calls"; then
  echo "queue wait: 0s"; echo "log: $d/fake.log"   # `vitest list` writes its full JSON, then exits 1
  exec ${wd[@]+"${wd[@]}"} bash -c 'd="$0" j="$1"; shift; python3 "$d/fake_report.py" "$@" || exit 9; cp "$j" "$d/list-fail.json"; exit 1' "$d" "$lj" "$@"
fi
[ -n "${FAKE_REAL_RUN_TESTS:-}" ] && exec "$FAKE_REAL_RUN_TESTS" run-tests --label "$label" ${mm[@]+"${mm[@]}"} -- ${wd[@]+"${wd[@]}"} python3 "$d/fake_report.py" "$@"
echo "queue wait: 0s"; echo "log: $d/fake.log"
exec ${wd[@]+"${wd[@]}"} python3 "$d/fake_report.py" "$@"
SH
  cp "$FX/fake_report.py" "$1.fake/fake_report.py"; chmod +x "$1.fake/fake-run-tests"
}
mut() { ( cd "$1" && CTL_MUTATE_RUN_TESTS="$1.fake/fake-run-tests" CTL_MUTATE_PG_PORT="${PGPORT_CLOSED}" "$CTL" mutate --repo "$1" --base HEAD~1 "${@:2}" 2>&1 ); }
mdof() { echo "$CTL_LOG_DIR/mutate-$($G -C "$1" branch --show-current | tr / +)-$($G -C "$1" rev-parse HEAD | cut -c1-8).md"; }   # the verb's report file
clean_tree() { [ -z "$($G -C "$1" status --porcelain --untracked-files=all)" ] && ! ls -d "$1"/packages/calc/.stryker-tmp* >/dev/null 2>&1; }
committed() { $G -C "$1" diff --quiet HEAD -- packages/calc/src/calc.ts; }
PGPORT_CLOSED="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"

# ---- (1) the changed lines and the file filter (13.2200, 13.2201) ----
check "13.2200 ranges: an added hunk (+5,3) is 5-7 (not 5-8, not 5-6), a modified hunk (+11,2) is 11-12, a one-line hunk (+30) is 30-30, a pure deletion (+22,0) adds no range, a deleted file is absent; the test and generated files' hunks parse too (the filter, not the parser, drops them)" \
  '[ "$(python3 "$PY" ranges "$FX/ranges.diff")" = "{\"src/a.test.ts\": [[1, 2]], \"src/a.ts\": [[5, 7], [11, 12], [30, 30]], \"src/x.generated.ts\": [[1, 1]]}" ]'
filter_ok() { local out; out="$(python3 "$PY" filter src/ok.ts src/ok.tsx src/a.test.ts src/a.spec.tsx test/h.ts pkg/tests/h.ts src/__tests__/h.ts src/x.generated.ts src/t.d.ts src/x.js src/latest.ts)"
  [ "$out" = "$(printf '%s\n' 'src/ok.ts	mutate' 'src/ok.tsx	mutate' 'src/a.test.ts	test file' 'src/a.spec.tsx	test file' 'test/h.ts	under a test directory' 'pkg/tests/h.ts	under a test directory' 'src/__tests__/h.ts	under a test directory' 'src/x.generated.ts	generated' 'src/t.d.ts	declaration file' 'src/x.js	not .ts/.tsx' 'src/latest.ts	mutate')" ]; }
check "13.2201 filter: *.ts and *.tsx are mutated; *.test.* and *.spec.*, a test/, tests/ or __tests__/ directory, *.generated.ts, *.d.ts and non-TS files are excluded, each clause on its own path (CONTROL: src/latest.ts, whose name holds 'test', is mutated)" 'filter_ok'

# ---- (2) the custom pre-step (13.2202, 13.2203) ----
A="$T/ast"; mkdir -p "$A/node_modules"; cp "$FX/ast/custom.ts" "$A/"; ln -s "$TSC" "$A/node_modules/typescript"
ast() { node "$AST" "$A" "$A" custom.ts '[[1,8]]'; }
ast_ok() { python3 - "$(ast)" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
got = [(c['kind'], c['line'], c['original'], c['alts']) for c in d['customs']]
want = [('numeric', 2, '200', ['2000', '20']), ('numeric', 3, '0.05', ['0.5', '0.005']), ('rounding', 7, 'Math.ceil', ['Math.floor', 'Math.round']),
        ('numeric', 8, '1.1', ['11', '0.11']), ('numeric', 8, '0x10', ['160', '1.6']), ('numeric', 8, '1e3', ['1e4', '1e2'])]
assert got == want, got
assert d['skipped'] == {'zero': 2, 'type': 1, 'enum': 1, 'property': 1}, d['skipped']
assert [c['text'] for c in d['casts']] == ['as number'], d['casts']
assert d['injectParse'] == 'ok', d['injectParse']
PY
}
check "13.2202 pre-step: exactly ×10 and ÷10 on 200 and 0.05 (and 1.1, 0x10, 1e3 without float noise), none on 0, none in a type, an enum or a property name (counted by reason: zero 2, type 1, enum 1, property 1), Math.ceil → floor and → round, and the one 'as number' cast found" 'ast_ok'
inject_ok() { python3 - "$(ast)" "$A/custom.ts" <<'PY'
import json, sys
d = json.loads(sys.argv[1]); src = open(sys.argv[2]).read()
t = d['transformed']
assert t.count('\n') == src.count('\n'), 'a newline was added or removed'
lines = t.split('\n')
assert lines[1] == 'export const LIMIT = (false ? 2000 : false ? 20 : 200);', lines[1]
assert lines[6] == 'export const up = (x: number) => (false ? Math.floor : false ? Math.round : Math.ceil)(x)          ;', repr(lines[6])
for c in d['customs']:
    assert c['switch']['start']['line'] == c['line'], c
    for p in c['tokenPos']:
        assert p['line'] == c['line'] and lines[p['line'] - 1][p['column']:p['column'] + 5] == 'false', (c, p)
assert d['castOnly'].count('\n') == src.count('\n') and 'as number' not in d['castOnly'] and 'false ?' not in d['castOnly']
PY
}
check "13.2203 injection keeps every line: the switch sits on the literal's own line (no newline added), each counted token is a 'false' on that line, the cast is blanked to spaces, and the cast-only copy (the fallback's) has no switch" 'inject_ok'

# ---- the reconcile, on a synthetic Stryker report (13.2204) ----
reconcile_ok() { python3 - "$PY" "$FX/reconcile" <<'PY'
import json, subprocess, sys
py, fx = sys.argv[1], sys.argv[2]
run = lambda rep: json.loads(subprocess.run(['python3', py, 'reconcile', f'{fx}/customs.json', f'{fx}/{rep}'], capture_output=True, text=True, check=True).stdout)
ok = run('report-dup.json')   # each selecting flip twice (BooleanLiteral + ConditionalExpression) and a re-select-the-original flip
assert (ok['injected'], ok['counted'], ok['problems']) == (2, 2, []), ok
assert [(c['line'], c['replacement'], c['status']) for c in ok['custom']] == [(3, '2000', 'Survived'), (3, '20', 'Killed')], ok['custom']
assert [(m['line'], m['mutator'], m['original'], m['replacement']) for m in ok['stryker']] == [(5, 'EqualityOperator', 'n > LIMIT', 'n >= LIMIT'), (3, 'ArithmeticOperator', 'LIMIT + 200', 'LIMIT - 200')], ok['stryker']
miss = run('report-missing.json')
assert miss['counted'] == 1 and miss['injected'] == 2 and len(miss['problems']) == 1 and '200 → 20 has no selecting flip' in miss['problems'][0], miss
PY
}
check "13.2204 reconcile: one counted mutant per custom alternative (a duplicate flip and a flip re-selecting the original are dropped: injected 2 == counted 2), a Stryker mutant spanning a switch reads with the switch put back ('LIMIT + 200 → LIMIT - 200'); a missing flip is a problem naming '200 → 20'" 'reconcile_ok'

# ---- the verb on the scratch repo, with the recording shim (13.2205, 13.2209–13.2216) ----
R1="$T/r1"; mkrepo "$R1"; mkfake "$R1"
dry_ok() { local out rc; : > "$R1.fake/calls"; out="$(PATH="$FX/shims:$PATH" SHIM_LOG="$R1.fake/shimcalls" mut "$R1" --dry-run)"; rc=$?
  [ $rc -eq 0 ] && printf '%s\n' "$out" | grep -q "run 1: stryker on src/calc.ts:2-6" && [ ! -s "$R1.fake/calls" ] && [ ! -e "$R1.fake/shimcalls" ] && clean_tree "$R1" && committed "$R1"; }
check "13.2205 --dry-run prints the ranges and the planned runs and runs NOTHING: the run-tests shim and the stryker/vitest/pnpm/npx PATH shims record no call, the tree and calc.ts are untouched" 'dry_ok'
skips_ok() { local out; out="$(mut "$R1" --dry-run)"
  printf '%s\n' "$out" | grep -q "SKIPPED  packages/harness/src/h.ts: packages/harness has no vitest" \
  && printf '%s\n' "$out" | grep -q "SKIPPED  apps/server/src/s.ts: apps/server: the test Postgres 127.0.0.1:$PGPORT_CLOSED is not reachable" \
  && printf '%s\n' "$out" | grep -q "excluded packages/calc/test/calc.test.ts: test file" \
  && printf '%s\n' "$out" | grep -q "excluded packages/calc/src/calc.generated.ts: generated" \
  && ! printf '%s\n' "$out" | grep -q "file apps/server/"; }
check "13.2209 skips: a package without vitest and apps/server with the test Postgres unreachable are listed as SKIPPED (and the test and generated files as excluded)" 'skips_ok'
pg_up_ok() { local port out; exec 3< <(python3 -c 'import socket,time; s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(); print(s.getsockname()[1], flush=True); time.sleep(30)'); read -r port <&3
  out="$(cd "$R1" && CTL_MUTATE_RUN_TESTS="$R1.fake/fake-run-tests" CTL_MUTATE_PG_PORT="$port" "$CTL" mutate --repo "$R1" --base HEAD~1 --dry-run 2>&1)"; exec 3<&-
  printf '%s\n' "$out" | grep -q "file apps/server/src/s.ts" && ! printf '%s\n' "$out" | grep -q "SKIPPED  apps/server"; }
check "13.2210 CONTROL for 13.2209: with something listening on the Postgres port, apps/server is planned, not skipped" 'pg_up_ok'
fail_ok() { local out rc; out="$(FAKE_MODE=fail mut "$R1")"; rc=$?; [ $rc -eq 2 ] && printf '%s\n' "$out" | tail -1 | grep -q "^FAIL mutate tool failure in 1 file(s): packages/calc/src/calc.ts run 1: Stryker failed (rc 3" && clean_tree "$R1" && committed "$R1"; }
check "13.2211 a tool failure (run-tests exit 3) is exit 2, never a pass, and the tree is clean after it" 'fail_ok'
left_ok() { local out rc; out="$(FAKE_MODE=backup-left mut "$R1")"; rc=$?; [ $rc -eq 2 ] && printf '%s\n' "$out" | tail -1 | grep -q "^FAIL mutate tool failure in 1 file(s): packages/calc/src/calc.ts run 1: Stryker failed (rc 1" && clean_tree "$R1" && committed "$R1"; }
check "13.2211 a Stryker that died with a file rewritten in place (its original in the temp dir's backup-*/) is exit 2 and the file is put back before the temp dir goes" 'left_ok'
flips_ok() { local out rc; out="$(FAKE_MODE=flips-dup mut "$R1")"; rc=$?
  [ $rc -eq 1 ] && printf '%s\n' "$out" | grep -q "SURVIVOR packages/calc/src/calc.ts:3  custom:numeric  200 → 2000" && printf '%s\n' "$out" | grep -q "SURVIVOR packages/calc/src/calc.ts:3  custom:numeric  200 → 20$" \
  && grep -q "custom injected 2 == counted 2" "$CTL_LOG_DIR"/mutate-*.md && clean_tree "$R1" && committed "$R1"; }
check "13.2212 every selecting flip reported twice (dedupe): 'custom injected 2 == counted 2', both custom survivors on line 3, exit 1" 'flips_ok'
missing_ok() { local out rc; out="$(FAKE_MODE=flips-missing mut "$R1")"; rc=$?; [ $rc -eq 2 ] && printf '%s\n' "$out" | tail -1 | grep -q "custom injected 2 != counted 1" && clean_tree "$R1"; }
check "13.2213 a custom alternative with no selecting flip in the report is exit 2 ('custom injected 2 != counted 1'), never a silent pass" 'missing_ok'
short_ok() { local out rc; out="$(FAKE_MODE=control-short mut "$R1")"; rc=$?; [ $rc -eq 2 ] && printf '%s\n' "$out" | tail -1 | grep -q "control: the injected copy registers 1 tests, the unmutated tree 3" && clean_tree "$R1"; }
check "13.2214 the control: fewer tests registered on the injected copy than vitest list finds on the unmutated tree is exit 2" 'short_ok'
# signals: the shim sleeps with the injected calc.ts in place; the verb gets the signal; the trap must put calc.ts back
sig_ok() { local sig="$1" want="$2" vp n=0 rc; rm -f "$R1.fake/fake.pid" "$R1.fake/signals" "$R1.fake/ready"
  set -m; ( cd "$R1" && FAKE_MODE=sleep CTL_MUTATE_RUN_TESTS="$R1.fake/fake-run-tests" CTL_MUTATE_PG_PORT="$PGPORT_CLOSED" exec "$CTL" mutate --repo "$R1" --base HEAD~1 > "$R1.fake/sig.out" 2>&1 ) & vp=$!; set +m
  while [ ! -f "$R1.fake/ready" ] && [ $n -lt 300 ]; do sleep 0.2; n=$((n+1)); done
  [ -f "$R1.fake/ready" ] || { echo "       (precondition: the shim never reached its sleep in 60 s; the verb said: $(tail -2 "$R1.fake/sig.out" | tr '\n' ' ' | cut -c1-200))"; kill "-$sig" "$vp"; wait "$vp"; return 1; }
  grep -q 'false ? 2000' "$R1/packages/calc/src/calc.ts" && [ -f "$R1/packages/calc/stryker-setup-0.js" ] && grep -q '@ts-nocheck' "$R1/packages/calc/test/calc.test.ts" || { echo "       (precondition: calc.ts is not injected, or no setup file, or no Stryker in-place edit, during the run)"; return 1; }
  kill "-$sig" "$vp"; wait "$vp"; rc=$?
  [ $rc -eq "$want" ] && committed "$R1" && clean_tree "$R1" && grep -qx 'run-tests TERM' "$R1.fake/signals" && ! kill -0 "$(cat "$R1.fake/fake.pid")" 2>/dev/null; }
check "13.2215 SIGINT mid-run (the injected calc.ts in place: precondition checked): exit 130, calc.ts restored, a file Stryker rewrote in place put back from its backup-*/, no Stryker temp dir and no new stryker-setup-<n>.js, git status unchanged, the running run-tests got TERM" 'sig_ok INT 130'
check "13.2216 SIGTERM mid-run: exit 143, the same restore" 'sig_ok TERM 143'
watchdog_ok() { local out rc; rm -f "$R1.fake/signals"; out="$(FAKE_MODE=sleep FAKE_SLEEP=5 CTL_MUTATE_MAX_SECS=1 mut "$R1")"; rc=$?
  [ $rc -eq 2 ] && printf '%s\n' "$out" | tail -1 | grep -q "^FAIL mutate tool failure in 1 file(s): mutate-1-calc.ts: the slot-run passed 1 s in its slot and was stopped (P10: no slot-run over 10 min; the file needs a smaller split) (the other files" \
  && grep -qx 'command TERM' "$R1.fake/signals" && ! grep -q 'run-tests TERM' "$R1.fake/signals" && clean_tree "$R1" && committed "$R1"; }
check "13.2217 a command that holds its slot past CTL_MUTATE_MAX_SECS is stopped by the watchdog INSIDE the slot (TERM to the command's group, run-tests itself untouched) and is exit 2; CONTROL 13.2218 below" 'watchdog_ok'
under_ok() { local out rc; out="$(FAKE_MODE=flips-dup FAKE_SLEEP=0 CTL_MUTATE_MAX_SECS=10 mut "$R1")"; rc=$?; [ $rc -eq 1 ]; }
check "13.2218 CONTROL for 13.2217: a run under the cap completes (exit 1, its survivors); the defaults are pinned: 600 s per slot-run and 300 mutants per run" \
  'under_ok && [ "$(grep -c "env_int(.CTL_MUTATE_MAX_SECS., 600)" "$PY")" = 1 ] && [ "$(grep -c "env_int(.CTL_MUTATE_SPLIT., 300)" "$PY")" = 1 ]'
R2="$T/r2"; mkrepo "$R2"; mkfake "$R2"; cp "$FX/big.ts" "$FX/small.ts" "$R2/packages/calc/src/"; $G -C "$R2" add -A; $G -C "$R2" commit -q -m big
runs_of() { mut "$R2" --dry-run | grep -c "run [0-9]*: stryker on src/$1"; }
caps() { local out; out="$(mut "$R2" --dry-run)"; printf '%s\n' "$out" | grep "stryker on src/$1" | sed -E 's/.*\(~([0-9]+) mutants\).*/\1/'; }
split_ok() { local b s; b="$(runs_of big.ts)"; s="$(runs_of small.ts)"
  [ "$b" -ge 2 ] && [ "$s" -eq 1 ] && [ -z "$(caps big.ts | awk '$1 > 300')" ] && [ "$(CTL_MUTATE_SPLIT=3000 runs_of big.ts)" -eq 1 ]; }
check "13.2219 split: a file above 300 mutants is split into runs of at most 300 each, a file between 30 and 300 is one run (CONTROL: with the cap at 3000 the big file is one run)" 'split_ok'
edge_ok() { local n; n="$(caps small.ts)"; [ "$(CTL_MUTATE_SPLIT="$n" runs_of small.ts)" -eq 1 ] && [ "$(CTL_MUTATE_SPLIT=$((n - 1)) runs_of small.ts)" -ge 2 ]; }
check "13.2220 split boundary: a cap EQUAL to the file's count is one run; one below it splits" 'edge_ok'
check "13.2221 exit 2 on an unknown argument, and when Stryker is not installed in the repo" \
  'out=$(mut "$R1" --nope); [ $? -eq 2 ] && printf "%s" "$out" | tail -1 | grep -q "^FAIL mutate unknown arg --nope" && R3="$T/r3" && mkrepo "$R3" && mkfake "$R3" && rm "$R3/node_modules/@stryker-mutator" && out=$(mut "$R3"); [ $? -eq 2 ] && printf "%s" "$out" | tail -1 | grep -q "Stryker is not installed"'
fallback_ok() { local out rc; : > "$R1.fake/calls"; out="$(FAKE_MODE=flips-dup CTL_MUTATE_INJECT_FAIL='calc\.ts$' mut "$R1")"; rc=$?
  printf '%s\n' "$out" | grep -q "FALLBACK (A) for this file only" && [ "$(grep -c -- '-- node .*vitest.mjs run --maxWorkers=2' "$R1.fake/calls")" -eq 2 ] && [ $rc -eq 0 ] && clean_tree "$R1" && committed "$R1"; }
check "13.2222 an injected copy that fails to parse falls back to (A) for that file only and says so: Stryker on the cast-only copy, then each custom mutant as one vitest run (2 runs, each killed by the shim's rc) — exit 0" 'fallback_ok'
json_ok() { FAKE_MODE=flips-dup mut "$R1" --json | grep '^{' | python3 -c 'import json,sys; d=json.load(sys.stdin); assert [(s["line"], s["replacement"]) for s in d["survivors"]] == [(3, "2000"), (3, "20")], d["survivors"]; assert d["files"][0]["path"] == "packages/calc/src/calc.ts"'; }
check "13.2223 --json prints one JSON object (files, survivors with line and replacement, skipped) before the summary line" 'json_ok'

partial_ok() { local out rc; out="$(FAKE_MODE=flips-dup FAKE_FAIL_FILE=small.ts mut "$R2")"; rc=$?
  [ $rc -eq 2 ] && printf '%s\n' "$out" | grep -q "^  TOOL-FAILURE packages/calc/src/small.ts: packages/calc/src/small.ts run [0-9]*: Stryker failed (rc 3" \
  && printf '%s\n' "$out" | grep -q "^  packages/calc/src/big.ts: [1-9][0-9]* mutants" && printf '%s\n' "$out" | grep -q "^  SURVIVOR packages/calc/src/big.ts:" \
  && printf '%s\n' "$out" | tail -1 | grep -q "^FAIL mutate tool failure in 1 file(s)" && clean_tree "$R2"; }
check "13.2228 one file's tool failure does not drop the others: small.ts fails (TOOL-FAILURE listed), big.ts's table row and survivors are still reported, and the sweep exits 2" 'partial_ok'
check "13.2229 wiring: ctl help lists mutate, selftest.sh runs this suite and the harness suite as live steps, and the verb resolves Stryker from the --repo root, never from this checkout" \
  '"$CTL" help | grep -q "^  mutate \[--base REF\]" && grep -q "^step \"mutate suite" "$HERE/verbs/selftest.sh" && grep -q "^step \"harness suite" "$HERE/verbs/selftest.sh" && [ "$(grep -c "os.path.join(repo, .node_modules., .@stryker-mutator., .core., .bin., .stryker.js.)" "$PY")" = 1 ]'

# ---- FIX 1 (13.2250–13.2255): the cap counts slot time, a crash is exit 2, the Stryker config, a custom on a range's last line ----
queue_ok() { local hp n=0 out rc md rt w; rm -f "$T/held"
  CTL_TEST_SLOTS=1 CTL_SEM_SAMPLE_SECS=1 CTL_SEM_POLL_SECS=1 "$CTL" run-tests --label holder -- bash -c ": > '$T/held'; sleep 9" > "$T/holder.out" 2>&1 & hp=$!
  while [ ! -f "$T/held" ] && [ $n -lt 300 ]; do sleep 0.2; n=$((n+1)); done
  [ -f "$T/held" ] || { echo "       (precondition: the holder never got the private slot: $(tail -1 "$T/holder.out"))"; wait "$hp"; return 1; }
  out="$(FAKE_MODE=flips-dup FAKE_REAL_RUN_TESTS="$CTL" CTL_TEST_SLOTS=1 CTL_SEM_SAMPLE_SECS=1 CTL_SEM_POLL_SECS=1 CTL_MUTATE_MAX_SECS=3 mut "$R1")"; rc=$?; wait "$hp"
  md="$(mdof "$R1")"; rt="$([ -f "$md" ] && sed -n 's/^- stryker run 1 .*, log \(.*\)$/\1/p' "$md")"
  w="$([ -f "$rt" ] && sed -n 's/^# queue wait: \([0-9]*\)s.*/\1/p' "$rt")"
  [ "${w:-0}" -ge 4 ] || { echo "       (precondition: the Stryker slot-run waited ${w:-?} s for its slot, not more than the 3 s cap; rc $rc: $(printf '%s' "$out" | tail -1 | cut -c1-160))"; return 1; }
  [ $rc -eq 1 ] && printf '%s\n' "$out" | grep -q "SURVIVOR packages/calc/src/calc.ts:3  custom:numeric  200 → 2000" && ! printf '%s\n' "$out" | grep -q "TOOL-FAILURE" \
  && printf '%s\n' "$out" | tail -1 | grep -q "^FAIL mutate 2 survivors to triage" && clean_tree "$R1" && committed "$R1"; }
check "13.2250 the cap counts SLOT time, not the queue wait: a private semaphore's only slot held 9 s, a run that waits longer than CTL_MUTATE_MAX_SECS=3 for it (precondition: its run-tests log says so) and then finishes under the cap is its real result, exit 1 with its survivors, never a tool failure (CONTROL: 13.2217 still stops a run that overruns IN its slot)" 'queue_ok'
backstop_ok() { local out rc
  rm -f "$R1.fake/signals"; out="$(FAKE_MODE=queued FAKE_SLEEP=20 CTL_MUTATE_BACKSTOP_SECS=2 mut "$R1")"; rc=$?
  [ $rc -eq 2 ] && [ "$(printf '%s\n' "$out" | tail -1)" = "FAIL mutate tool failure: mutate-1-calc.ts: no test slot within 2 s (still queued when the backstop fired); nothing was run" ] \
  && grep -qx 'run-tests TERM' "$R1.fake/signals" && clean_tree "$R1" || { echo "       (queued: rc $rc: $(printf '%s' "$out" | tail -1 | cut -c1-200))"; return 1; }
  rm -f "$R1.fake/signals"; out="$(FAKE_MODE=sleep FAKE_SLEEP=20 CTL_MUTATE_MAX_SECS=60 CTL_MUTATE_BACKSTOP_SECS=2 mut "$R1")"; rc=$?
  [ $rc -eq 2 ] && [ "$(printf '%s\n' "$out" | tail -1)" = "FAIL mutate tool failure in 1 file(s): mutate-1-calc.ts: the slot-run was still running 2 s after it was queued and was stopped (its watchdog did not stop it at 60 s) (the other files: 0 survivors; log $(mdof "$R1"))" ] \
  && grep -qx 'command TERM' "$R1.fake/signals" && clean_tree "$R1" && committed "$R1" || { echo "       (started: rc $rc: $(printf '%s' "$out" | tail -1 | cut -c1-240))"; return 1; }
  [ "$(grep -c "env_int(.CTL_MUTATE_BACKSTOP_SECS., max_secs + env_int(.CTL_SEM_MAX_WAIT., 1800) + GRACE + 60)" "$PY")" = 1 ]; }
check "13.2251 the backstop (CTL_MUTATE_BACKSTOP_SECS): a run still QUEUED when it fires is 'no test slot within 2 s … nothing was run' (exit 2, never 'a smaller split'), a run that got its slot and outlived it is 'its watchdog did not stop it' (exit 2, its command stopped); the default is pinned: the cap + CTL_SEM_MAX_WAIT (1800) + GRACE + 60" 'backstop_ok'
wd_ok() { local W="$T/wd" rc out wp n=0; rm -rf "$W"; mkdir -p "$W/a" "$W/b" "$W/c" "$W/d"
  python3 "$PY" watchdog 30 "$W/a" -- bash -c 'exit 3'; rc=$?
  [ $rc -eq 3 ] && [ -f "$W/a/started" ] && [ ! -f "$W/a/stopped" ] || { echo "       (passthrough: rc $rc)"; return 1; }
  out="$(python3 - "$PY" "$W/b" <<'PY'
import subprocess, sys, time
py, d = sys.argv[1], sys.argv[2]
r = subprocess.run(['python3', py, 'watchdog', '1', d, '--', 'bash', '-c', 'trap "" TERM; echo $$ > "$0/pid"; sleep 30', d], capture_output=True, text=True)
end = time.time()
st, sp = float(open(f'{d}/started').read()), float(open(f'{d}/stopped').read())
ok = r.returncode == 124 and 1.0 <= sp - st < 1.9 and 2.9 <= end - sp < 3.9 and r.stdout == 'mutate watchdog: the command passed 1 s in its slot; stopping its process group\n'
print('ok' if ok else f'rc {r.returncode}, started->stopped {sp - st:.2f} s, stopped->exit {end - sp:.2f} s, stdout {r.stdout!r}')
PY
)"
  [ "$out" = ok ] && ! kill -0 "$(cat "$W/b/pid")" 2>/dev/null || { echo "       (over the cap, TERM ignored: ${out:-no output})"; return 1; }
  python3 "$PY" watchdog 60 "$W/c" -- bash -c 'echo $$ > "$0/pid"; trap "echo TERM > \"\$0/got\"; exit 143" TERM; sleep 30 & wait $!' "$W/c" & wp=$!
  while [ ! -f "$W/c/pid" ] && [ $n -lt 100 ]; do sleep 0.1; n=$((n+1)); done
  kill -TERM "$wp"; wait "$wp"; rc=$?
  [ $rc -eq 143 ] && grep -qx TERM "$W/c/got" && [ ! -f "$W/c/stopped" ] && ! kill -0 "$(cat "$W/c/pid")" 2>/dev/null || { echo "       (TERM to the watchdog: rc $rc)"; return 1; }
  python3 "$PY" watchdog 60 "$W/d" -- bash -c 'trap "" TERM; echo $$ > "$0/pid"; sleep 30' "$W/d" & wp=$!; n=0
  while [ ! -f "$W/d/pid" ] && [ $n -lt 100 ]; do sleep 0.1; n=$((n+1)); done
  kill -TERM "$wp"; sleep 0.5; kill -TERM "$wp" 2>/dev/null; wait "$wp"; rc=$?
  [ $rc -eq 143 ] && ! kill -0 "$(cat "$W/d/pid")" 2>/dev/null || { echo "       (a second TERM while stopping: rc $rc)"; return 1; }; }
check "13.2252 the watchdog: the command's exit code passes through (3) and <dir>/started is written; past SECS (started->stopped in [1.0, 1.9) s for SECS 1) a command that IGNORES TERM is KILLed GRACE (3) s after the TERM (stopped->exit in [2.9, 3.9) s; exit 124; stdout exactly 'mutate watchdog: the command passed 1 s in its slot; stopping its process group'; the command gone); a TERM to the watchdog itself reaches the command's group (exit 143, the command got TERM and is gone); a second TERM while it stops a TERM-ignoring command does not cancel the KILL (exit 143, the command gone)" 'wd_ok'
crash_ok() { local out rc; out="$(FAKE_MODE=bad-report mut "$R1")"; rc=$?
  [ $rc -eq 2 ] && printf '%s\n' "$out" | tail -1 | grep -q "^FAIL mutate tool failure: JSONDecodeError: Expecting value" && clean_tree "$R1" && committed "$R1"; }
check "13.2253 a crash is a tool failure, never 'survivors': a report that is not JSON (run-tests exit 0) is exit 2 with 'FAIL mutate tool failure: JSONDecodeError: …' as the last line, and the tree is clean" 'crash_ok'
conf_ok() { rm -f "$R1.fake/conf.json"; FAKE_MODE=flips-dup mut "$R1" > /dev/null; python3 - "$R1.fake/conf.json" <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))
want = {'testRunner': 'vitest', 'coverageAnalysis': 'perTest', 'concurrency': 2, 'timeoutMS': 10000, 'incremental': False, 'ignoreStatic': False,
        'inPlace': True, 'cleanTempDir': 'always', 'disableTypeChecks': False}
got = {k: c.get(k, 'MISSING') for k in want}
assert got == want and all(type(got[k]) is type(want[k]) for k in want), got
assert c['vitest']['related'] is True and c['mutate'] == ['src/calc.ts:2-6'], (c['vitest'], c['mutate'])
PY
}
check "13.2254 the generated Stryker config, as run-tests is handed it: concurrency 2 (one slot's worth of workers), coverageAnalysis perTest, timeoutMS 10000, incremental false, ignoreStatic false, inPlace true, cleanTempDir always, disableTypeChecks false, vitest.related true, mutate = the changed range" 'conf_ok'
R7="$T/r7"; mkrepo "$R7"; mkfake "$R7"; python3 -c 'import sys; p=sys.argv[1]; s=open(p).read(); assert s.count("LIMIT = 200;")==1; open(p,"w").write(s.replace("LIMIT = 200;", "LIMIT = 250;"))' "$R7/packages/calc/src/calc.ts"; $G -C "$R7" commit -q -am one-line
lastline_ok() { local out rc; out="$(FAKE_MODE=flips-dup mut "$R7")"; rc=$?
  printf '%s\n' "$out" | grep -q "file packages/calc/src/calc.ts: ranges 3-3;" || { echo "       (precondition: the change is not the one-line range 3-3)"; return 1; }
  [ $rc -eq 1 ] && [ "$(printf '%s\n' "$out" | grep -c '^  SURVIVOR')" -eq 2 ] && printf '%s\n' "$out" | grep -qx "  SURVIVOR packages/calc/src/calc.ts:3  custom:numeric  250 → 2500" \
  && printf '%s\n' "$out" | grep -qx "  SURVIVOR packages/calc/src/calc.ts:3  custom:numeric  250 → 25" && ! printf '%s\n' "$out" | grep -q "BooleanLiteral" \
  && grep -q "custom injected 2 == counted 2" "$(mdof "$R7")" && clean_tree "$R7"; }
check "13.2255 a custom literal on the LAST (and first) line of its range, a one-line hunk (3-3), is assigned to its run: reported as custom:numeric 250 → 2500 and → 25, never as a plain 'BooleanLiteral false → true' row (injected 2 == counted 2)" 'lastline_ok'

# ---- FIX 2 (13.2256): Stryker exiting 0 without a report is THAT file's tool failure, not a crash of the whole sweep ----
noreport_ok() { local out rc; out="$(FAKE_MODE=flips-dup FAKE_NOREPORT_FILE=small.ts mut "$R2")"; rc=$?
  [ $rc -eq 2 ] && printf '%s\n' "$out" | grep -q "^  TOOL-FAILURE packages/calc/src/small.ts: packages/calc/src/small.ts run [0-9]*: Stryker failed (rc 0" \
  && printf '%s\n' "$out" | grep -q "^  packages/calc/src/big.ts: [1-9][0-9]* mutants" && printf '%s\n' "$out" | grep -q "^  SURVIVOR packages/calc/src/big.ts:" \
  && printf '%s\n' "$out" | tail -1 | grep -q "^FAIL mutate tool failure in 1 file(s)" && ! printf '%s\n' "$out" | grep -q "FileNotFoundError" && clean_tree "$R2" \
  || { echo "       (rc $rc)"; printf '%s\n' "$out" | tail -3 | cut -c1-160 | sed 's/^/       /'; return 1; }; }
check "13.2256 a Stryker run that exits 0 but writes NO report (small.ts) is that file's TOOL-FAILURE '… Stryker failed (rc 0 …', never a FileNotFoundError crash of the whole sweep: big.ts's table row and survivors are still reported, the last line is 'FAIL mutate tool failure in 1 file(s)', exit 2, and the tree is clean" 'noreport_ok'

# ---- FIX 3 (13.2257–13.2259, and 13.2221's half-installed legs): each clause of the report, `vitest list` and install guards on its own ----
# one_failure OUT RC WANT: 13.2256's shape on R2 — small.ts is the TOOL-FAILURE line WANT and has no table row; big.ts (the control) keeps its row and a SURVIVOR
one_failure() { local out="$1" rc="$2"
  [ "$rc" -eq 2 ] && printf '%s\n' "$out" | grep -q -e "$3" && ! printf '%s\n' "$out" | grep -q "^  packages/calc/src/small.ts: [0-9]* mutants" \
  && printf '%s\n' "$out" | grep -q "^  packages/calc/src/big.ts: [1-9][0-9]* mutants" && printf '%s\n' "$out" | grep -q "^  SURVIVOR packages/calc/src/big.ts:" \
  && printf '%s\n' "$out" | tail -1 | grep -q "^FAIL mutate tool failure in 1 file(s)" && ! printf '%s\n' "$out" | grep -q "FileNotFoundError" && clean_tree "$R2" \
  || { echo "       (rc $rc)"; printf '%s\n' "$out" | tail -3 | cut -c1-160 | sed 's/^/       /'; return 1; }; }
rtf_ok() { local out rc; rm -f "$R2.fake/rtf-report.json"; out="$(FAKE_MODE=flips-dup FAKE_REPORT_THEN_FAIL_FILE=small.ts mut "$R2")"; rc=$?
  python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); assert [k for k in r["files"] if k.endswith("small.ts")] and r["testFiles"]' "$R2.fake/rtf-report.json" 2>/dev/null \
    || { echo "       (precondition: small.ts's Stryker run wrote no valid report before it failed)"; return 1; }
  one_failure "$out" "$rc" '^  TOOL-FAILURE packages/calc/src/small.ts: packages/calc/src/small.ts run [0-9]*: Stryker failed (rc 3'; }
check "13.2257 a Stryker run that writes a VALID report and then exits non-zero (small.ts: rc 3 after its report) is that file's TOOL-FAILURE '… Stryker failed (rc 3 …' and its rows are never posted: no small.ts table row; big.ts's row and survivors are still reported, the last line is 'FAIL mutate tool failure in 1 file(s)', exit 2, the tree clean" 'rtf_ok'
nojson_ok() { local out rc; rm -f "$R2.fake/list-nojson-hit"; : > "$R2.fake/calls"; out="$(FAKE_MODE=flips-dup FAKE_LIST_NOJSON_FILE=small.ts mut "$R2")"; rc=$?
  [ -f "$R2.fake/list-nojson-hit" ] || { echo "       (precondition: small.ts's \`vitest list\` control never ran)"; return 1; }
  one_failure "$out" "$rc" '^  TOOL-FAILURE packages/calc/src/small.ts: packages/calc/src/small.ts run [0-9]*: control: `vitest list` on the unmutated tree failed (rc 0'; }
check "13.2258 a \`vitest list\` control that exits 0 but writes NO JSON (small.ts's) is that file's TOOL-FAILURE '… control: \`vitest list\` on the unmutated tree failed (rc 0', never a FileNotFoundError crash of the whole sweep: big.ts's row (its own control passed) and survivors are still reported, exit 2, the tree clean" 'nojson_ok'
listfail_ok() { local out rc; rm -f "$R2.fake/list-fail.json"; : > "$R2.fake/calls"; out="$(FAKE_MODE=flips-dup FAKE_LIST_FAIL_FILE=small.ts mut "$R2")"; rc=$?
  python3 -c 'import json,sys; assert len(json.load(open(sys.argv[1]))) == 3' "$R2.fake/list-fail.json" 2>/dev/null \
    || { echo "       (precondition: small.ts's \`vitest list\` control did not write the full 3-test JSON before it failed)"; return 1; }
  one_failure "$out" "$rc" '^  TOOL-FAILURE packages/calc/src/small.ts: packages/calc/src/small.ts run [0-9]*: control: `vitest list` on the unmutated tree failed (rc 1'; }
check "13.2259 a \`vitest list\` control that writes its FULL JSON (3 tests, so the counts agree) and then exits 1 is that file's TOOL-FAILURE '… failed (rc 1', never a silent pass: no small.ts row; big.ts's row and survivors are still reported, exit 2, the tree clean" 'listfail_ok'
half_ok() { local R="$T/r3$1" out rc; mkrepo "$R"; mkfake "$R"; rm "$R/node_modules/@stryker-mutator"; mkdir -p "$R/node_modules/@stryker-mutator"
  case "$1" in core) mkdir -p "$R/node_modules/@stryker-mutator/core/bin"; : > "$R/node_modules/@stryker-mutator/core/bin/stryker.js";; runner) mkdir -p "$R/node_modules/@stryker-mutator/vitest-runner";; esac
  out="$(mut "$R")"; rc=$?
  [ $rc -eq 2 ] && printf '%s\n' "$out" | tail -1 | grep -q "Stryker is not installed in" && [ ! -s "$R.fake/calls" ] \
  || { echo "       ($1 only: rc $rc, $(wc -l < "$R.fake/calls" 2>/dev/null || echo 0) run-tests calls: $(printf '%s' "$out" | tail -1 | cut -c1-160))"; return 1; }; }
check "13.2221 Stryker HALF installed is 'not installed' too, before any slot is taken: a real @stryker-mutator dir holding only core/bin/stryker.js (no vitest-runner), then one holding only vitest-runner/ (no core), each exit 2 with 'Stryker is not installed in' as the last line and ZERO run-tests calls" 'half_ok core && half_ok runner'

# ---- FIX 4 (13.2219's and 13.2220's legs): a first changed line above the cap, and the estimated count when the instrumenter cannot count ----
first_ok() { local out n; out="$(CTL_MUTATE_SPLIT=1 mut "$R2" --dry-run)"
  n="$(printf '%s\n' "$out" | sed -nE 's/.* run [0-9]+: stryker on src\/small\.ts:1-1 \(~([0-9]+) mutants\).*/\1/p')"
  [ "${n:-0}" -gt 1 ] && ! printf '%s\n' "$out" | grep -q "src/small.ts:: " \
  || { echo "       (small.ts line 1 as a run alone: ~${n:-no} mutants against a cap of 1)"; printf '%s\n' "$out" | grep "src/small.ts" | sed -n 1,4p | cut -c1-160 | sed 's/^/       /'; return 1; }; }
check "13.2220 first line: a FIRST changed line that alone holds more mutants than the cap (small.ts line 1 at CTL_MUTATE_SPLIT=1) is a run alone, 'run N: stryker on src/small.ts:1-1', never preceded by an empty chunk ('src/small.ts:: no mutant on these lines')" 'first_ok'
est_ok() { local R="$T/r9" out one; mkrepo "$R"; mkfake "$R"; cp "$FX/small.ts" "$R/packages/calc/src/"; $G -C "$R" add -A; $G -C "$R" commit -q -m small
  rm "$R/node_modules/@stryker-mutator"   # mutate-ast.mjs cannot load Stryker's instrumenter (countError set); --dry-run returns before the install guard
  out="$(mut "$R" --dry-run)"; one="$(CTL_MUTATE_SPLIT=1 mut "$R" --dry-run)"
  printf '%s\n' "$out" | grep -q "^  note: packages/calc/src/small.ts: mutant count estimated (instrumenter: " \
  && printf '%s\n' "$out" | grep -q "run 1: stryker on src/small.ts:1-12 (~24 mutants)" \
  && printf '%s\n' "$one" | grep -q "run 1: stryker on src/small.ts:1-1 (~2 mutants)" && ! printf '%s\n' "$one" | grep -q -e "src/small.ts: (" -e "(~0 mutants)" \
  && printf '%s\n' "$one" | grep -q "^mutate: dry-run, 1 files, 12 slot-runs planned, nothing run" \
  || { printf '%s\n' "$out" | grep -e "note: " -e "stryker on" | cut -c1-160 | sed 's/^/       (cap 300) /'
       printf '%s\n' "$one" | grep -e "stryker on" -e "dry-run, " | sed -n '1,2p;$p' | cut -c1-160 | sed 's/^/       (cap 1) /'; return 1; }; }
check "13.2219 estimate: when Stryker's instrumenter cannot count (no @stryker-mutator in the repo, a dry run), each changed line counts 2 and the plan says 'mutant count estimated': small.ts's 12 changed lines are one run of ~24; at CTL_MUTATE_SPLIT=1 run 1 is line 1 alone (~2), 12 runs, never an empty one" 'est_ok'

# ---- the real Stryker legs (13.2206–13.2208): one private-slot run each ----
R4="$T/r4"; mkrepo "$R4"
realrun() { ( cd "$1" && CTL_MUTATE_PG_PORT="$PGPORT_CLOSED" "$CTL" mutate --repo "$1" --base HEAD~1 2>&1 ); }
weak_ok() { local out rc; out="$(realrun "$R4")"; rc=$?; printf '%s\n' "$out" > "$T/weak.out"
  [ $rc -eq 1 ] && [ "$(printf '%s\n' "$out" | grep -c '^  SURVIVOR')" -eq 2 ] \
  && printf '%s\n' "$out" | grep -qx '  SURVIVOR packages/calc/src/calc.ts:5  EqualityOperator  n > LIMIT → n >= LIMIT' \
  && printf '%s\n' "$out" | grep -qx '  SURVIVOR packages/calc/src/calc.ts:3  custom:numeric  200 → 2000' \
  && printf '%s\n' "$out" | tail -2 | head -1 | grep -q '^mutate: 2 survived (1 stryker + 1 custom) in 1 files' && clean_tree "$R4" && committed "$R4"; }
check "13.2206 end to end (real Stryker, one slot): the WEAK test reports exactly two survivors, 'calc.ts:5 n > LIMIT → n >= LIMIT' (inside an 'as boolean' cast: found only because the cast is stripped) and 'calc.ts:3 200 → 2000' (the literal's own line 3), exit 1, the tree clean; the same test file's TZ leg (a TZ a test sets takes effect) passes the dry run only on the forks pool the verb's config wrapper restores" 'weak_ok'
strong_ok() { local out rc; cp "$FX/strong.test.ts" "$R4/packages/calc/test/calc.test.ts"; $G -C "$R4" commit -q -am strong; out="$(cd "$R4" && CTL_MUTATE_PG_PORT="$PGPORT_CLOSED" "$CTL" mutate --repo "$R4" --base HEAD~2 2>&1)"; rc=$?
  printf '%s\n' "$out" > "$T/strong.out"; [ $rc -eq 0 ] && printf '%s\n' "$out" | tail -1 | grep -q '^OK mutate 0 survivors' && clean_tree "$R4"; }
check "13.2207 end to end: the STRONG test reports 0 survivors, exit 0" 'strong_ok'
R5="$T/r5"; mkrepo "$R5"; cp "$FX/throwing/calc.ts" "$R5/packages/calc/src/calc.ts"; cp "$FX/throwing/calc.test.ts" "$R5/packages/calc/test/calc.test.ts"; $G -C "$R5" commit -q -am throwing
throw_ok() { local out rc; out="$(cd "$R5" && CTL_MUTATE_PG_PORT="$PGPORT_CLOSED" "$CTL" mutate --repo "$R5" --base HEAD~2 2>&1)"; rc=$?; printf '%s\n' "$out" > "$T/throw.out"
  [ $rc -eq 2 ] && printf '%s\n' "$out" | tail -1 | grep -q "control: the injected copy registers 1 tests, the unmutated tree 3" && clean_tree "$R5"; }
check "13.2208 the dry-run control (real Stryker): a module whose INJECTED copy throws at import (its test registers 1 test instead of 3) is exit 2" 'throw_ok'
R6="$T/r6"; mkrepo "$R6"   # 13.2216 with real Stryker: a related test holds the dry run open while Stryker's own in-place edits are live
cat > "$R6/packages/calc/test/slow.test.ts" <<EOF
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { over } from '../src/calc';
it('slow', async () => { writeFileSync('$T/r6-started', String(over(1))); await new Promise((r) => setTimeout(r, 60000)); }, 120000);
EOF
$G -C "$R6" add -A; $G -C "$R6" commit -q -m slow
realterm_ok() { local vp n=0 rc; rm -f "$T/r6-started"
  set -m; ( cd "$R6" && CTL_MUTATE_PG_PORT="$PGPORT_CLOSED" exec "$CTL" mutate --repo "$R6" --base HEAD~2 > "$T/r6.out" 2>&1 ) & vp=$!; set +m
  while [ ! -f "$T/r6-started" ] && [ $n -lt 300 ]; do sleep 0.2; n=$((n+1)); done
  [ -f "$T/r6-started" ] || { echo "       (precondition: the slow test never started)"; kill -TERM "$vp"; wait "$vp"; return 1; }
  local mid; mid="$($G -C "$R6" status --porcelain --untracked-files=no)"
  kill -TERM "$vp"; wait "$vp"; rc=$?
  [ "$mid" = " M packages/calc/src/calc.ts" ] || { echo "       (mid-run, tracked files other than calc.ts are modified: $(printf '%s' "$mid" | tr '\n' ' ' | cut -c1-200))"; return 1; }
  [ $rc -eq 143 ] && committed "$R6" && clean_tree "$R6" || { echo "       (rc $rc)"; tail -4 "$T/r6.out" | cut -c1-160 | sed 's/^/       /'; return 1; }; }
check "13.2216 (real Stryker) mid dry run the ONLY tracked file Stryker has changed in place is the mutated calc.ts (no '// @ts-nocheck' written into the package: disableTypeChecks off); SIGTERM then is exit 143 with git status empty" 'realterm_ok'

ctl_test_only_end mutate.test.sh
[ "$fails" -eq 0 ] && echo "mutate.test.sh: ok" || { echo "mutate.test.sh: $fails FAILED"; exit 1; }
