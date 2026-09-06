#!/usr/bin/env node
// Every case id in every test-cases/NN-*.md file, extracted from the LINE
// HEAD only -- never from prose, which routinely cross-cites other ids in
// explanatory text (see the fixture below for a planted example of exactly
// that). This repo's test-cases files use at least three id-line styles in
// the same section at once: `- 13.41 ✅ ...` (bare), `- **12.240** ✅ ...`
// (bold, no marker), `- 🧪 **13.1 — ...` (a marker, then a bold id). A
// recount that only recognises one style reports "zero duplicates" through
// a collision it structurally cannot see -- measured today, when two
// styles coexisted in one file and every existing check that matched only
// one of them passed clean.
//
// THE SELF-TEST BELOW IS NOT DECORATION. A matcher that returns zero
// results on every real file looks IDENTICAL, from the outside, to a
// matcher that never fires at all -- both print "0 duplicates" and exit 0.
// Measured while building this: a marker-first regex variant returned 0
// matches on all three real files it was tried against, which is
// indistinguishable from success unless something has actually watched the
// pattern fire on every style it claims to cover. scripts/fixtures/
// check-case-ids-fixture.md plants one of each style (bare, bold,
// marker-first x2) plus a mid-sentence prose citation, with known expected
// counts -- this script asserts those counts BEFORE it sweeps the real
// files, and refuses to report anything about test-cases/ if the self-test
// doesn't hold.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Matches a case id at the head of a markdown bullet line, in any of this
// repo's three known styles. Group 1: an optional marker token (anything
// non-whitespace that does NOT itself start with a digit or `*` -- MUST be
// \S-based to match an emoji marker, which is not a \w word character, but
// excluding a digit/`*` start matters: a bare `\S+` greedily swallowed
// `**7.1,` whole as the "marker" on a real line
// (`- **7.1, 7.2 — written by this task.**`), extracting 7.2 as the id
// when the line's own first-listed number is 7.1 -- found by this script's
// own real sweep, not invented). Group 2: 0-2 asterisks. Group 3: the id
// itself, N.M.
const ID_LINE = /^-\s+(?:([^\s\d*][^\s]*)\s+)?(\*{0,2})(\d+\.\d+)/;

function extract(lines) {
  const byStyle = { bare: 0, bold: 0, markerFirst: 0 };
  const ids = [];
  for (const line of lines) {
    const m = line.match(ID_LINE);
    if (!m) continue;
    const [, marker, asterisks, id] = m;
    if (marker) byStyle.markerFirst += 1;
    else if (asterisks) byStyle.bold += 1;
    else byStyle.bare += 1;
    ids.push(id);
  }
  return { byStyle, ids };
}

// ------------------------------------------------------------- self-test
const fixturePath = join(REPO_ROOT, 'scripts/fixtures/check-case-ids-fixture.md');
const fixtureLines = readFileSync(fixturePath, 'utf8').split('\n');
const fixtureResult = extract(fixtureLines);
const fixtureSum = fixtureResult.byStyle.bare + fixtureResult.byStyle.bold + fixtureResult.byStyle.markerFirst;
const fixtureUnion = new Set(fixtureResult.ids).size;

const EXPECTED = { bare: 1, bold: 1, markerFirst: 2, sum: 4, union: 4 };
const selfTestFailures = [];
if (fixtureResult.byStyle.bare !== EXPECTED.bare) {
  selfTestFailures.push(`bare: expected ${EXPECTED.bare}, got ${fixtureResult.byStyle.bare}`);
}
if (fixtureResult.byStyle.bold !== EXPECTED.bold) {
  selfTestFailures.push(`bold: expected ${EXPECTED.bold}, got ${fixtureResult.byStyle.bold}`);
}
if (fixtureResult.byStyle.markerFirst !== EXPECTED.markerFirst) {
  selfTestFailures.push(`markerFirst: expected ${EXPECTED.markerFirst}, got ${fixtureResult.byStyle.markerFirst}`);
}
if (fixtureSum !== EXPECTED.sum) {
  selfTestFailures.push(`sum: expected ${EXPECTED.sum}, got ${fixtureSum}`);
}
if (fixtureUnion !== EXPECTED.union) {
  selfTestFailures.push(`union: expected ${EXPECTED.union}, got ${fixtureUnion} (the 13.99 prose citation may have leaked in, or two ids were miscounted as one)`);
}
if (fixtureResult.ids.includes('13.99')) {
  selfTestFailures.push('the mid-sentence prose citation of 13.99 was counted as a case id -- the line-head anchor is not working');
}

if (selfTestFailures.length > 0) {
  console.error('SELF-TEST FAILED against scripts/fixtures/check-case-ids-fixture.md:');
  for (const f of selfTestFailures) console.error(`  ${f}`);
  console.error(
    'This script does not trust its own regex against the real test-cases/ files until it has ' +
      'proven, on a fixture with known answers, that every style it claims to cover actually fires. ' +
      'A silent 0 on the real files would be indistinguishable from success.',
  );
  process.exit(1);
}
console.log(
  `check-case-ids: self-test passed (bare ${fixtureResult.byStyle.bare}, bold ${fixtureResult.byStyle.bold}, ` +
    `marker-first ${fixtureResult.byStyle.markerFirst}, union ${fixtureUnion} == sum ${fixtureSum}, prose citation excluded)`,
);

// --------------------------------------------------------------- real sweep
const DIR = join(REPO_ROOT, 'test-cases');
const files = readdirSync(DIR).filter((f) => /^\d+-.*\.md$/.test(f));

if (files.length === 0) {
  console.error('check-case-ids: no test-cases/NN-*.md files found -- the detector is broken');
  process.exit(1);
}

const totalByStyle = { bare: 0, bold: 0, markerFirst: 0 };
const seen = new Map(); // id -> [locations]

for (const file of files) {
  const lines = readFileSync(join(DIR, file), 'utf8').split('\n');
  const { byStyle, ids } = extract(lines);
  totalByStyle.bare += byStyle.bare;
  totalByStyle.bold += byStyle.bold;
  totalByStyle.markerFirst += byStyle.markerFirst;

  lines.forEach((line, i) => {
    const m = line.match(ID_LINE);
    if (!m) return;
    const id = m[3];
    if (!seen.has(id)) seen.set(id, []);
    seen.get(id).push(`${file}:${i + 1}`);
  });
  void ids;
}

const totalSum = totalByStyle.bare + totalByStyle.bold + totalByStyle.markerFirst;
const totalUnion = seen.size;

console.log(
  `check-case-ids: real sweep -- bare ${totalByStyle.bare}, bold ${totalByStyle.bold}, ` +
    `marker-first ${totalByStyle.markerFirst}, sum ${totalSum}, union ${totalUnion}, ` +
    `${files.length} files scanned`,
);

// union < sum means the SAME id text was extracted more than once -- a
// duplicate, reported in detail below. union > sum cannot happen (every id
// extracted is counted in exactly one style bucket). This comparison is the
// machine-readable signal that something is wrong, stronger than eyeballing
// two printed numbers.
if (totalUnion < totalSum) {
  const dupes = [...seen.entries()].filter(([, locs]) => locs.length > 1);
  console.error(`DUPLICATE case ids found (union ${totalUnion} < sum ${totalSum}):`);
  for (const [id, locs] of dupes) {
    console.error(`  ${id}: ${locs.join(', ')}`);
  }
  process.exit(1);
}

let maxId = null;
for (const id of seen.keys()) {
  if (maxId === null) { maxId = id; continue; }
  const [aSec, aNum] = id.split('.').map(Number);
  const [bSec, bNum] = maxId.split('.').map(Number);
  if (aSec > bSec || (aSec === bSec && aNum > bNum)) maxId = id;
}
console.log(`check-case-ids: ok (${totalUnion} unique ids, highest ${maxId ?? 'NONE'})`);
