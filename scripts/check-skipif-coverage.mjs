#!/usr/bin/env node
// check-no-silent-skips.mjs is wired into ci.yml's `server-tests` shards
// ONLY -- the one job whose vitest run produces a JSON report and calls it.
// Every `.test.ts`/`.test.tsx` file using `.skipIf(` outside
// `apps/server/test/` (a different package's suite, or even a file inside
// apps/server but outside the `test/` prefix `vitest.config.ts` scans) is
// therefore checked by NOTHING: it could eat its whole suite in silence and
// `other-tests` would still report green, because that job runs `turbo run
// test` across 8 heterogeneous packages with no JSON reporter and no guard.
//
// This is a trip-wire, not the real fix: building genuine per-package
// silent-skip coverage means wiring a JSON reporter + check-no-silent-
// skips.mjs into `other-tests` too, which needs per-package output paths
// turbo's task graph does not make easy. Until that lands, this script
// converts "a skipIf guard appeared somewhere uncovered" into a loud,
// specific CI failure instead of a silent coverage gap -- the same choice
// this repo already makes elsewhere for a gap that is recorded rather than
// closed (see ci.yml's own header comment on the interim-plumbing gate).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files', '--', '*.test.ts', '*.test.tsx'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

if (tracked.length === 0) {
  console.error('check-skipif-coverage: git ls-files returned zero test files -- the detector is broken');
  process.exit(1);
}

const COVERED_PREFIX = 'apps/server/test/';
const uncovered = [];

for (const file of tracked) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes('.skipIf(')) continue;
  if (!file.startsWith(COVERED_PREFIX)) uncovered.push(file);
}

if (uncovered.length > 0) {
  console.error(
    `UNCOVERED .skipIf( usage -- no CI job checks these for a silently-empty suite ` +
      `(only files under ${COVERED_PREFIX} are covered, by check-no-silent-skips.mjs):`,
  );
  for (const f of uncovered) console.error(`  ${f}`);
  console.error(
    "Extend check-no-silent-skips.mjs's coverage to this file's job before merging, " +
      'or move the guard if it belongs under apps/server/test/.',
  );
  process.exit(1);
}

console.log(
  `check-skipif-coverage: ok (${tracked.length} test files scanned, every .skipIf( usage is under ${COVERED_PREFIX})`,
);
