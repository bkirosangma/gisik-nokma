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
// itself, N.M with an OPTIONAL LETTER SUFFIX.
//
// The suffix was added 2026-09-08 and it fixed a live red. `(\d+\.\d+)`
// truncated `14.27b` to `14.27` and `14.88b` to `14.88`, so two pairs of
// genuinely distinct, separately-cited cases were reported as DUPLICATE case
// ids and this script exited 1 on `main`. The limitation was even documented
// in prose (`test-cases/13-deploy-and-ops.md:196`) without being fixed.
// A letter suffix is the same shape the plans' own task ids use (`4a`, `12c`,
// read by `check-task-ledger.mjs` as `\d+[a-z]?`), so this makes the two
// readers agree rather than inventing a convention.
//
// Note the direction the old bug failed in: it INVENTED duplicates, which is
// the loud direction. A matcher that silently dropped the suffixed line
// entirely would have been worse, and the fixture below now pins both — the
// suffixed id must be present AND distinct.
const ID_LINE = /^-\s+(?:([^\s\d*][^\s]*)\s+)?(\*{0,2})(\d+\.\d+[a-z]?)/;

// A FOURTH style, added 2026-09-19: a marker, then a bold id, then the id
// BACKTICKED inside that bold --
//   `- ✅ **`13.989` — the description is editable on the door that already exists.`
// It READS exactly like the marker-first style above and matched none of the
// three, because `(\d+\.\d+)` demands a digit immediately after the asterisks
// and the backtick stops it at the first character. Measured cost: case
// `13.989` sat on `main` through several greens, unseen by this script, and the
// duplicate it could have formed was caught by a human reading instead.
//
// ## Why this is a SECOND regex and not one optional-backtick group
//
// The obvious repair -- make the backtick optional in `ID_LINE` -- is WRONG,
// and it was measured rather than reasoned. Both the marker group and the
// asterisk group are themselves optional, so an optional backtick lets the
// engine SKIP the marker and match an ordinary prose bullet that merely begins
// with a quoted id:
//   `- `13.439`/`13.444` retired (their subject — the mirror note — no longer exists); ...`
// On the real `test-cases/` files that change gained FOUR lines and manufactured
// THREE DUPLICATE ids (13.439, 13.447, 13.517) -- a red `main` introduced by the
// fix meant to prevent one. It is the same shape as the greedy-marker bug this
// file already records: the loose matcher does not merely miss, it INVENTS.
//
// So a MARKER and BOLD are both required here. A prose bullet that begins with
// a quoted id is not an id line, and the fixture now pins that with a line that
// must NOT be counted.
// ## And a fifth thing that is NOT a declaration: the POSSESSIVE
//
// Added 2026-09-19, because this matcher took `main` RED within the hour of
// landing. `test-cases/16-remaining-doors.md` carries a line whose whole job is
// to say that case `3.72`'s arms live in a particular test file:
//
//   `- ✅ **`3.72`'s SIX new arms** — `packages/app-core/test/views/transition-dialog.test.tsx`, …`
//
// That is a CITATION of `3.72`, which is declared once, in
// `03-foundation-ledger.md:79`. But it wears marker + bold + backticked id, so
// it matched the rule above and was read as a SECOND declaration — `union 2447 <
// sum 2448`, duplicate `3.72`. **The loose matcher does not merely miss, it
// INVENTS**, which is the failure this file already records twice; it has now
// invented one on `main`, from a line that was trying to be helpful.
//
// The rule: **a declaration's id STANDS ALONE.** `**`3.72`'s**` is a possessive,
// not a declaration — the `'s` continues the id into a word, so the id is being
// USED rather than claimed. A closing backtick followed by an apostrophe or any
// letter is therefore not the end of a declared id, and the lookahead rejects
// it. Both apostrophes are covered: the ASCII `'` and the typographic `’`, since
// the two are indistinguishable on screen and a rule that held for one and not
// the other would be a trap for whoever typed the other one.
//
// **What must keep matching**: the archetype this rule exists for,
// `- ✅ **`13.94` — …`, whose closing backtick is followed by a SPACE. The
// fixture pins both directions, and the possessive line is asserted NOT to be
// counted — the same way the prose citation at the foot of that file is.
const ID_LINE_BOLD_BACKTICK = /^-\s+(?:([^\s\d*][^\s]*)\s+)?\*\*`(\d+\.\d+[a-z]?)`(?![A-Za-z'’])/;

/**
 * Resolve a line to the id-line style it is written in, or `null`.
 *
 * Kept as one place so the style COUNTS (`byStyle`) and the id shown in a
 * failure cannot disagree about which style a line was read as.
 *
 * @returns {{marker: string|undefined, asterisks: string, id: string}|null}
 */
function idLineOf(line) {
  const plain = line.match(ID_LINE);
  if (plain) return { marker: plain[1], asterisks: plain[2], id: plain[3] };
  const backticked = line.match(ID_LINE_BOLD_BACKTICK);
  // `'**'` rather than the captured text: the backticked style IS the bold one,
  // and reporting it as bare would make a style tally say something untrue.
  if (backticked) return { marker: backticked[1], asterisks: '**', id: backticked[2] };
  return null;
}

function extract(lines) {
  const byStyle = { bare: 0, bold: 0, markerFirst: 0 };
  const ids = [];
  for (const line of lines) {
    const found = idLineOf(line);
    if (found === null) continue;
    if (found.marker) byStyle.markerFirst += 1;
    else if (found.asterisks) byStyle.bold += 1;
    else byStyle.bare += 1;
    ids.push(found.id);
  }
  return { byStyle, ids };
}

// ------------------------------------------------------------- self-test
const fixturePath = join(REPO_ROOT, 'scripts/fixtures/check-case-ids-fixture.md');
const fixtureLines = readFileSync(fixturePath, 'utf8').split('\n');
const fixtureResult = extract(fixtureLines);
const fixtureSum = fixtureResult.byStyle.bare + fixtureResult.byStyle.bold + fixtureResult.byStyle.markerFirst;
const fixtureUnion = new Set(fixtureResult.ids).size;

// bold is 2 and both totals are 5 because of the `13.91b` line. If the suffix
// is ever dropped from ID_LINE again, that line collapses onto `13.91`, union
// falls to 4 while sum stays 5, and this self-test fails BEFORE the real sweep
// runs — which is the whole point of having it.
const EXPECTED = { bare: 1, bold: 2, markerFirst: 3, sum: 6, union: 6 };
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
if (!fixtureResult.ids.includes('13.91b')) {
  selfTestFailures.push(
    "the letter-suffixed id 13.91b was not extracted -- ID_LINE has lost its `[a-z]?`, so 14.27b " +
      'and 14.88b will be read as 14.27 and 14.88 and reported as duplicates they are not',
  );
}
if (fixtureResult.ids.includes('13.99')) {
  selfTestFailures.push('the mid-sentence prose citation of 13.99 was counted as a case id -- the line-head anchor is not working');
}
if (fixtureResult.ids.includes('13.97')) {
  selfTestFailures.push(
    "the POSSESSIVE `- ✅ **`13.97`'s six arms**` was counted as a declaration -- the closing backtick " +
      'must be followed by something that does not continue the id, or a citation of another case is ' +
      'read as a second declaration of it and the sweep INVENTS a duplicate. This is the exact shape that ' +
      'took main red on 2026-09-19 (union 2447 < sum 2448, duplicate 3.72)',
  );
}
if (!fixtureResult.ids.includes('13.94')) {
  selfTestFailures.push(
    'the backticked-inside-bold DECLARATION (13.94) was not extracted -- the possessive lookahead has ' +
      'over-reached and killed the very style the backticked rule exists to see',
  );
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
  const { byStyle } = extract(lines);
  totalByStyle.bare += byStyle.bare;
  totalByStyle.bold += byStyle.bold;
  totalByStyle.markerFirst += byStyle.markerFirst;

  lines.forEach((line, i) => {
    // THE SAME RESOLVER `extract` USES, and that is not tidiness. Until
    // 2026-09-19 this loop called `line.match(ID_LINE)` for itself while
    // `extract` matched separately: TWO matchers that had to agree, deciding
    // the same question. Teaching `extract` a fourth style left this one on the
    // old regex, so the SUM counted a line the UNION did not -- and the report
    // that came out was "DUPLICATE case ids found", a diagnosis of something
    // that had not happened. Found by building the fourth style, not by reading
    // it. One resolver, one answer.
    const found = idLineOf(line);
    if (found === null) return;
    const id = found.id;
    if (!seen.has(id)) seen.set(id, []);
    seen.get(id).push(`${file}:${i + 1}`);
  });
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
