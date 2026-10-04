#!/usr/bin/env bash
# ctl mutate — Stryker plus the custom classes on a branch's changed lines (test-cases 13.2200–13.2223, 13.2228, 13.2229).
# Scratch git repos only (mktemp; never a worktree of this repo). The real-Stryker legs (13.2206–13.2208) link the checkout's own
# @stryker-mutator, vitest and typescript into the scratch repo and run through a PRIVATE semaphore dir (CTL_SEM_DIR), so the suite,
# itself run inside one slot-run, never waits on a second machine slot. Every other leg replaces run-tests with a recording shim.
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
cleanup() { [ -n "$LISTENER" ] && kill "$LISTENER" 2>/dev/null; for f in "$T"/*.fake/fake.pid; do [ -f "$f" ] && kill -TERM -- "-$(ps -o pgid= -p "$(cat "$f")" 2>/dev/null | tr -d ' ')" 2>/dev/null; done; rm -rf "$T"; }
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
# the recording run-tests shim, in DIR.fake (outside the repo: the verb checks the repo's git status): FAKE_MODE fail | sleep | flips-dup |
# flips-missing | control-short (fake_report.py)
mkfake() {
  mkdir -p "$1.fake"
  cat > "$1.fake/fake-run-tests" <<'SH'
#!/usr/bin/env bash
d="$(dirname "$0")"; echo "$*" >> "$d/calls"; echo $$ > "$d/fake.pid"
shift 2; [ "$1" = -- ] && shift
case "${FAKE_MODE:-ok}" in
  fail) echo "queue wait: 0s"; echo "log: $d/fake.log"; exit 3;;
  sleep) : > stryker-setup-0.js   # as the vitest runner does (inPlace: in the package); the trap must remove it
    trap 'echo TERM >> "$d/signals"; exit 143' TERM; sleep "${FAKE_SLEEP:-60}" & wait $!; echo "queue wait: 0s"; exit 0;;
esac
echo "queue wait: 0s"; echo "log: $d/fake.log"
exec python3 "$d/fake_report.py" "$@"
SH
  cp "$FX/fake_report.py" "$1.fake/fake_report.py"; chmod +x "$1.fake/fake-run-tests"
}
mut() { ( cd "$1" && CTL_MUTATE_RUN_TESTS="$1.fake/fake-run-tests" CTL_MUTATE_PG_PORT="${PGPORT_CLOSED}" "$CTL" mutate --repo "$1" --base HEAD~1 "${@:2}" 2>&1 ); }
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
flips_ok() { local out rc; out="$(FAKE_MODE=flips-dup mut "$R1")"; rc=$?
  [ $rc -eq 1 ] && printf '%s\n' "$out" | grep -q "SURVIVOR packages/calc/src/calc.ts:3  custom:numeric  200 → 2000" && printf '%s\n' "$out" | grep -q "SURVIVOR packages/calc/src/calc.ts:3  custom:numeric  200 → 20$" \
  && grep -q "custom injected 2 == counted 2" "$CTL_LOG_DIR"/mutate-*.md && clean_tree "$R1" && committed "$R1"; }
check "13.2212 every selecting flip reported twice (dedupe): 'custom injected 2 == counted 2', both custom survivors on line 3, exit 1" 'flips_ok'
missing_ok() { local out rc; out="$(FAKE_MODE=flips-missing mut "$R1")"; rc=$?; [ $rc -eq 2 ] && printf '%s\n' "$out" | tail -1 | grep -q "custom injected 2 != counted 1" && clean_tree "$R1"; }
check "13.2213 a custom alternative with no selecting flip in the report is exit 2 ('custom injected 2 != counted 1'), never a silent pass" 'missing_ok'
short_ok() { local out rc; out="$(FAKE_MODE=control-short mut "$R1")"; rc=$?; [ $rc -eq 2 ] && printf '%s\n' "$out" | tail -1 | grep -q "control: the injected copy registers 1 tests, the unmutated tree 3" && clean_tree "$R1"; }
check "13.2214 the control: fewer tests registered on the injected copy than vitest list finds on the unmutated tree is exit 2" 'short_ok'
# signals: the shim sleeps with the injected calc.ts in place; the verb gets the signal; the trap must put calc.ts back
sig_ok() { local sig="$1" want="$2" vp n=0 rc; rm -f "$R1.fake/fake.pid" "$R1.fake/signals"
  set -m; ( cd "$R1" && FAKE_MODE=sleep CTL_MUTATE_RUN_TESTS="$R1.fake/fake-run-tests" CTL_MUTATE_PG_PORT="$PGPORT_CLOSED" exec "$CTL" mutate --repo "$R1" --base HEAD~1 > "$R1.fake/sig.out" 2>&1 ) & vp=$!; set +m
  while [ ! -f "$R1.fake/fake.pid" ] && [ $n -lt 100 ]; do sleep 0.2; n=$((n+1)); done
  grep -q 'false ? 2000' "$R1/packages/calc/src/calc.ts" && [ -f "$R1/packages/calc/stryker-setup-0.js" ] || { echo "       (precondition: calc.ts is not injected, or no setup file, during the run)"; return 1; }
  kill "-$sig" "$vp"; wait "$vp"; rc=$?
  [ $rc -eq "$want" ] && committed "$R1" && clean_tree "$R1" && grep -q TERM "$R1.fake/signals" && ! kill -0 "$(cat "$R1.fake/fake.pid")" 2>/dev/null; }
check "13.2215 SIGINT mid-run (the injected calc.ts in place: precondition checked): exit 130, calc.ts restored, no Stryker temp dir and no new stryker-setup-<n>.js, git status unchanged, the running run-tests got TERM" 'sig_ok INT 130'
check "13.2216 SIGTERM mid-run: exit 143, the same restore" 'sig_ok TERM 143'
watchdog_ok() { local out rc; rm -f "$R1.fake/signals"; out="$(FAKE_MODE=sleep FAKE_SLEEP=5 CTL_MUTATE_MAX_SECS=1 mut "$R1")"; rc=$?
  [ $rc -eq 2 ] && printf '%s\n' "$out" | tail -1 | grep -q "passed 1 s and was stopped" && grep -q TERM "$R1.fake/signals" && clean_tree "$R1" && committed "$R1"; }
check "13.2217 a slot-run over CTL_MUTATE_MAX_SECS is stopped (TERM to run-tests) and is exit 2; CONTROL 13.2218 below" 'watchdog_ok'
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

ctl_test_only_end mutate.test.sh
[ "$fails" -eq 0 ] && echo "mutate.test.sh: ok" || { echo "mutate.test.sh: $fails FAILED"; exit 1; }
