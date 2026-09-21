#!/usr/bin/env node
// Guards against a `describe.skipIf(...)`/`it.skipIf(...)` guard eating an
// entire test file while the run still reports green. Vitest's own exit code
// does not distinguish "every test in this file ran" from "every test in this
// file was skipped because the guard's condition was false" -- both are a
// clean run. A file's tests show up in the JSON reporter with
// status:"skipped" rather than being absent, so the signal this script reads
// is: does a skipIf-guarded file contribute zero passed-or-failed tests?
//
// Written ahead of its first real trigger (2026-09-06). Plan 11 T11/T12 add
// `describe.skipIf(!pgDumpAvailable())` around the restore-drill suite -- if the
// CI runner is ever missing the pg_dump/pg_restore binaries this gates on, that
// whole suite would silently stop proving anything while `vitest run` still
// exits 0. This script is what turns that into a loud CI failure instead.
//
// ## E6-6 (2026-09-21): THE INSTRUMENT HAD NO POSITIVE CONTROL ON ITS OWN UNIVERSE
//
// Every rule above is applied to `report.testResults ?? []`. **An empty or
// mis-shaped report therefore printed `ok (0 skipIf-guarded file(s) checked,
// none fully skipped)` with EXIT=0** -- measured with `echo '{}' > /tmp/e.json`
// and with `{"testResults":[]}`, both green. A run that examined NOTHING and a
// run that examined everything and found nothing wrong were the same output.
//
// So the report is now held against the TREE: the tracked `.skipIf(`/`.runIf(`
// files under the covered prefix are counted first (the walk
// `check-skipif-coverage.mjs` already does). Two exist today, both under
// `apps/server/test/ops/`, so an empty report now REFUSES and files two real
// paths beside its complaint instead of reporting a clean sweep of nothing.
//
// ⚠ AND IT REFUSES ON THE REPORT BEING EMPTY, NOT ON THE SHORTFALL — measured
// before writing it, because the obvious form breaks CI. `ci.yml` calls this
// script once per `server-tests` shard with THAT SHARD'S report, and the two
// guarded files can land in different shards, so "the tree holds more than this
// report mentions" is true of three healthy shards out of four. A check that
// cannot pass on a good tree is the mirror of one that cannot fail. The
// shortfall is therefore STATED in the output — names and all — rather than
// refused; making it refusable means checking the union of the four reports in a
// job of its own, which is not this change.
//
// `.runIf(` is recognised as the same guard inverted -- `.runIf(c)` is
// `.skipIf(!c)`, and a file whose condition is false is fully skipped in exactly
// the way this script exists to catch. The old comment named this spelling as a
// known gap; it is a gap no longer.
//
// The remaining gap is unchanged and still named: the substring match cannot see
// a guard spelled `describe .skipIf (` with unusual spacing, or hoisted into a
// shared helper (`describeIfPgDump`, say). Those drop out of the population
// silently. The universe check above narrows that too -- a file that stops
// matching here stops being EXPECTED here, and the two scripts disagree loudly.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const COVERED_PREFIX = 'apps/server/test/';

/** The two spellings of one guard. `.runIf(c)` is `.skipIf(!c)`. */
const GUARDS = ['.skipIf(', '.runIf('];

/** Repo-relative test files under the covered prefix that carry a guard. */
export function guardedTestFiles(tracked, sourceOf) {
  const guarded = [];
  for (const file of tracked) {
    if (!file.startsWith(COVERED_PREFIX)) continue;
    let source;
    try {
      source = sourceOf(file);
    } catch {
      continue;
    }
    if (GUARDS.some((g) => source.includes(g))) guarded.push(file);
  }
  return guarded;
}

/**
 * The whole audit, as a pure function of (report, guarded universe, reader), so
 * the self-test can drive it with both halves supplied deliberately -- the shape
 * every sibling checker in this directory uses.
 *
 * @returns {{checked: number, fullySkipped: string[], missing: string[], expected: number, saw: number, fileCount: number}}
 */
export function auditSkips({ report, guarded, sourceOf }) {
  const results = report.testResults ?? [];
  const names = results.map((r) => r.name);

  // THE POSITIVE CONTROL. A report may legitimately mention a file the tree no
  // longer guards, but it may not OMIT a file the tree does: an absence here is
  // about the report, not about the suite, and it is exactly what an empty or
  // truncated report looks like.
  const mentioned = guarded.filter((g) => names.some((n) => n === g || n.endsWith(`/${g}`)));
  const missing = guarded.filter((g) => !mentioned.includes(g));

  const fullySkipped = [];
  let checked = 0;
  for (const fileResult of results) {
    const filePath = fileResult.name;
    let source;
    try {
      source = sourceOf(filePath);
    } catch {
      // File moved or deleted between the run and this check. Loud rather than
      // silent: a swallowed ENOENT here is exactly the failure mode this
      // script exists to catch in test files, and the same trap in this
      // script's own logic would be an unfalsifiable check about unfalsifiable
      // checks.
      console.warn(`WARNING: could not read '${filePath}' to check for a skip guard -- skipping it`);
      continue;
    }
    if (!GUARDS.some((g) => source.includes(g))) continue;
    checked += 1;

    // No `assertions.length > 0` guard: a file that matched a guard but
    // contributed ZERO assertionResults at all is the WORST case this script
    // exists to catch, not an exemption from it -- `assertions.length > 0 &&
    // ran.length === 0` let exactly that case (a guard whose condition
    // resolves an empty fixture list, e.g. `for (const f of fixtures) it(...)`
    // over an empty `fixtures`) print "ok" while proving nothing.
    const assertions = fileResult.assertionResults ?? [];
    const ran = assertions.filter((a) => a.status === 'passed' || a.status === 'failed');
    if (ran.length === 0) {
      fullySkipped.push(filePath);
    }
  }

  return {
    checked,
    fullySkipped,
    missing,
    expected: guarded.length,
    saw: mentioned.length,
    // The report's OWN size, which is what "empty" must be judged on: a report
    // naming twenty-five files, none of them guarded, is not empty and must not
    // be told it is.
    fileCount: results.length,
  };
}

// ── The self-test, run before the real report is judged ──────────────────────

const CASES = [
  {
    name: 'PLANTED: an EMPTY report is refused rather than reporting a clean sweep of nothing',
    run: () => {
      const guarded = ['apps/server/test/ops/a.test.ts', 'apps/server/test/ops/b.test.ts'];
      const { missing, expected, saw, fileCount } = auditSkips({
        report: {},
        guarded,
        sourceOf: () => 'describe.skipIf(x)("s", () => {});',
      });
      // fileCount is what the CLI refuses on, so the empty judgement is pinned
      // here rather than only at the call site.
      return missing.length === 2 && expected === 2 && saw === 0 && fileCount === 0;
    },
  },
  {
    name: 'PLANTED: a report naming ONE of two guarded files is refused, and names the other',
    run: () => {
      const guarded = ['apps/server/test/ops/a.test.ts', 'apps/server/test/ops/b.test.ts'];
      const { missing, saw } = auditSkips({
        report: { testResults: [{ name: '/repo/apps/server/test/ops/a.test.ts', assertionResults: [{ status: 'passed' }] }] },
        guarded,
        sourceOf: () => 'describe.skipIf(x)("s", () => {});',
      });
      return saw === 1 && missing.length === 1 && missing[0].endsWith('b.test.ts');
    },
  },
  {
    name: 'a report naming every guarded file, all running, is clean',
    run: () => {
      const guarded = ['apps/server/test/ops/a.test.ts'];
      const { missing, fullySkipped, checked } = auditSkips({
        report: { testResults: [{ name: '/repo/apps/server/test/ops/a.test.ts', assertionResults: [{ status: 'passed' }] }] },
        guarded,
        sourceOf: () => 'describe.skipIf(x)("s", () => {});',
      });
      return missing.length === 0 && fullySkipped.length === 0 && checked === 1;
    },
  },
  {
    name: 'PLANTED: a guarded file whose every assertion was skipped is still a SILENT SKIP',
    run: () => {
      const guarded = ['apps/server/test/ops/a.test.ts'];
      const { fullySkipped } = auditSkips({
        report: { testResults: [{ name: '/repo/apps/server/test/ops/a.test.ts', assertionResults: [{ status: 'skipped' }] }] },
        guarded,
        sourceOf: () => 'describe.skipIf(x)("s", () => {});',
      });
      return fullySkipped.length === 1;
    },
  },
  {
    name: 'PLANTED: `.runIf(` is the same guard and is in the universe',
    run: () => {
      const guarded = guardedTestFiles(['apps/server/test/ops/c.test.ts'], () =>
        'describe.runIf(available)("s", () => {});',
      );
      return guarded.length === 1 && guarded[0].endsWith('c.test.ts');
    },
  },
  {
    name: 'known-good: a file under a DIFFERENT prefix is not part of this universe',
    run: () => {
      const guarded = guardedTestFiles(['apps/web/test/z.test.ts'], () => 'describe.skipIf(x)("s", () => {});');
      return guarded.length === 0;
    },
  },
];
export const EXPECTED_CASES = CASES.length;

function selfTest() {
  const failed = CASES.filter((c) => {
    try {
      return c.run() !== true;
    } catch {
      return true;
    }
  });
  if (failed.length > 0) {
    console.error('check-no-silent-skips: SELF-TEST FAILED — the audit is not trustworthy, so nothing below it is:');
    for (const c of failed) console.error(`  - ${c.name}`);
    process.exit(1);
  }
  const planted = CASES.filter((c) => c.name.startsWith('PLANTED')).length;
  console.log(
    `check-no-silent-skips: self-test passed (${CASES.length} cases, ${planted} of them planted defects)`,
  );
}

// ── Entry point ──────────────────────────────────────────────────────────────

function main() {
  const [, , reportPath] = process.argv;
  if (!reportPath) {
    console.error('usage: check-no-silent-skips.mjs <vitest-json-report>');
    process.exit(1);
  }

  selfTest();

  const report = JSON.parse(readFileSync(reportPath, 'utf8'));

  const tracked = execFileSync('git', ['ls-files', '--', '*.test.ts', '*.test.tsx'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  if (tracked.length === 0) {
    console.error(
      'check-no-silent-skips: git ls-files returned zero test files — the universe is broken, so every count below would be about nothing',
    );
    process.exit(1);
  }

  const guarded = guardedTestFiles(tracked, (f) => readFileSync(f, 'utf8'));
  const { checked, fullySkipped, missing, expected, saw, fileCount } = auditSkips({
    report,
    guarded,
    sourceOf: (f) => readFileSync(f, 'utf8'),
  });

  // ── THE UNIVERSAL REFUSAL: AN EMPTY REPORT IS NEVER EVIDENCE ───────────────
  //
  // This is the finding's measured case. `echo '{}' > /tmp/e.json` and
  // `{"testResults":[]}` both printed `ok (0 …)` with EXIT=0: a run that read
  // nothing and a run that read everything and found nothing wrong produced the
  // same output. There is no reading of an empty report on which the rest of
  // this script is a check.
  if (fileCount === 0) {
    console.error(
      `check-no-silent-skips: this report is EMPTY — it mentions no test file at all. ` +
        `${expected} skipIf-guarded file(s) exist under ${COVERED_PREFIX} and this report names none of ` +
        `them, so "ok" from here would be an ok about nothing:`,
    );
    for (const f of missing) console.error(`  ${f}`);
    console.error(
      'Look at what wrote the report (a crashed runner, a wrong --outputFile path, a reporter that was ' +
        'never wired) before believing any green below it.',
    );
    process.exit(1);
  }

  // ── WHAT THIS REPORT DID NOT SEE, SAID OUT LOUD ────────────────────────────
  //
  // ⚠ THE REPORT IS PER SHARD, AND THAT IS WHY THIS DOES NOT REFUSE. `ci.yml`
  // calls this script once per `server-tests` shard with that shard's own report
  // (`--shard=N/4`), so a shard legitimately contains A SUBSET of the guarded
  // files — today two exist, both under `apps/server/test/ops/`, and they can
  // land in different shards. Refusing on "the tree holds more than this report
  // mentions" would therefore fail three shards out of four on a healthy tree:
  // a check that cannot pass is the mirror of one that cannot fail. The full
  // "expected 2, saw 0" comparison is sound only for a WHOLE-suite report, which
  // this pipeline does not produce; making it sound here means checking the
  // union of the four shard reports in a job of its own, which is not this
  // change. So the shortfall is STATED — a stated blind spot is worth more than
  // a silent zero, and the next reader of a green line can see the shape of it.
  if (missing.length > 0) {
    console.log(
      `check-no-silent-skips: note — this report names ${saw} of the ${expected} skipIf-guarded file(s) ` +
        `under ${COVERED_PREFIX} (${missing.join(', ')}). That is expected for a per-shard report; the ` +
        `rest belong to another shard and are not covered by this run.`,
    );
  }

  if (fullySkipped.length > 0) {
    console.error(
      'SILENT SKIP: every test in the following skipIf-guarded file(s) was skipped this run:',
    );
    for (const f of fullySkipped) console.error(`  ${f}`);
    console.error(
      'A guard that eats an entire suite must be investigated (missing binary, missing env var, ' +
        'wrong platform assumption), not left green.',
    );
    process.exit(1);
  }

  console.log(
    `check-no-silent-skips: ok (${checked} of the ${expected} skipIf-guarded file(s) in the tree checked ` +
      `by this report, none fully skipped)`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
