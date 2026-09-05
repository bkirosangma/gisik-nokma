#!/usr/bin/env node
// Guards against a `describe.skipIf(...)`/`it.skipIf(...)` guard eating an
// entire test file while the run still reports green. Vitest's own exit code
// does not distinguish "every test in this file ran" from "every test in this
// file was skipped because the guard's condition was false" -- both are a
// clean run. A file's tests show up in the JSON reporter with
// status:"skipped" rather than being absent, so the signal this script reads
// is: does a skipIf-guarded file contribute zero passed-or-failed tests?
//
// Written ahead of its first real trigger (2026-09-06): no file in this repo
// uses `.skipIf(` yet. Plan 11 T11/T12 add `describe.skipIf(!pgDumpAvailable())`
// around the restore-drill suite -- if the CI runner is ever missing the
// pg_dump/pg_restore binaries this gates on, that whole suite would silently
// stop proving anything while `vitest run` still exits 0. This script is what
// turns that into a loud CI failure instead.
import { readFileSync } from 'node:fs';

const [, , reportPath] = process.argv;
if (!reportPath) {
  console.error('usage: check-no-silent-skips.mjs <vitest-json-report>');
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const fullySkipped = [];
let skipIfFilesChecked = 0;

for (const fileResult of report.testResults ?? []) {
  const filePath = fileResult.name;
  let source;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    // File moved or deleted between the run and this check. Loud rather than
    // silent: a swallowed ENOENT here is exactly the failure mode this
    // script exists to catch in test files, and the same trap in this
    // script's own logic would be an unfalsifiable check about unfalsifiable
    // checks.
    console.warn(`WARNING: could not read '${filePath}' to check for .skipIf( -- skipping it`);
    continue;
  }
  // A literal substring match, not an AST check -- known gap: a guard spelled
  // `describe .skipIf (` with different spacing, a `runIf`-style inverse, or
  // hoisted into a shared helper (`describeIfPgDump`, say) would no longer
  // contain this string and would silently drop out of coverage with no
  // signal here. Not fixed: an AST-based detector is disproportionate for
  // what this script covers today, but a future author changing HOW a skip
  // guard is spelled should know this check would stop seeing it.
  if (!source.includes('.skipIf(')) continue;
  skipIfFilesChecked += 1;

  // No `assertions.length > 0` guard: a file that matched `.skipIf(` but
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
  `check-no-silent-skips: ok (${skipIfFilesChecked} skipIf-guarded file(s) checked, none fully skipped)`,
);
