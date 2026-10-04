#!/usr/bin/env node
/**
 * The `test-cases/` <-> test citation gap, made falsifiable.
 *
 * WHY THIS EXISTS. The coordination doc records the gap by name (2026-08-31,
 * "What a catalogue entry is actually worth" and the Wave-1 "Recorded with
 * owners, not fixed" section): "No test in the repo cites a catalogue case
 * id, so the test-cases/ <-> test citation is one-directional: a test can be
 * deleted and its case keeps its checkmark." A `check-case-ids.mjs` catalogue
 * entry says a behaviour is proven; nothing today proves the PROOF is still
 * there. This script is the other half.
 *
 * THE CONVENTION IT ENFORCES: a checked ("checkmark") case id must appear
 * literally -- as a test name or a comment -- somewhere under a test
 * directory, in a `*.test.ts`/`*.test.tsx` file, or in an e2e spec. That is
 * "the naming is all the linkage there is" from the coordination doc's own
 * words: a plain-text citation, not an AST-verified assertion. This script
 * cannot tell you the case is tested CORRECTLY, only that a test still
 * claims it by name -- the same honest limit `check-runbook-commands.mjs`
 * states for itself.
 *
 * WHY A RATCHET. Measured at this script's own first correct run (after a
 * review round fixed a range-line extraction bug and a version-string
 * false-positive in isCited -- see both functions' docblocks): 1525 checked
 * ids, 815 uncited. Citing 815 existing tests is a backfill project, not a script
 * PR. So this checks a per-file BASELINE (scripts/fixtures/check-case-
 * citations-baseline.json) that may only ever equal reality exactly:
 *   - actual uncited > baseline -- something got WORSE (a citing test was
 *     deleted, or a new checked case landed uncited). FAILS.
 *   - actual uncited < baseline -- the baseline is STALE; someone improved
 *     citations and forgot to tighten the ratchet, or the ceiling was set
 *     loose to start with. FAILS too -- an exact match is the whole property
 *     of a ratchet that can only tighten; a ceiling nobody has to keep
 *     current is not a ceiling, and it is the false-positive-adjacent shape
 *     ("no violation the whole run") a review would otherwise have to catch
 *     by hand every time. Whoever improves a file's citations updates its
 *     baseline number in the SAME change, which is the only place progress
 *     is visible at all.
 *   - a file with no committed baseline entry -- FAILS, naming it. Every
 *     test-cases/NN-*.md file gets an explicit ceiling, including a 0.
 *
 * A NOTE ON WHAT THIS DOES NOT PROVE. A citation is a bare substring match --
 * `13.201` inside a comment or an `it(...)` string. It cannot distinguish a
 * genuine cross-reference from a coincidental numeric literal, and it cannot
 * tell a citation that documents the WRONG behaviour from one that documents
 * the right one. That is the honest boundary a text-matching check has; the
 * property it DOES enforce -- deleting the last citing test for a checked
 * case makes the count visible and the ratchet catch it -- is real and is
 * what this script is for.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_CASES_DIR = join(REPO_ROOT, 'test-cases');
const BASELINE_PATH = join(REPO_ROOT, 'scripts/fixtures/check-case-citations-baseline.json');
const FIXTURE_PATH = join(REPO_ROOT, 'scripts/fixtures/check-case-citations-fixture.md');

// --------------------------------------------------------------- extraction
//
// Anchored at the line head, exactly like check-case-ids.mjs's own ID_LINE --
// a case id is never read from prose, which routinely cross-cites other ids
// in explanatory text. HEAD only matches the marker/bold prefix and the
// FIRST id; everything after it (a range, a status marker, malformed
// trailing digits) is parsed separately in `extractCheckedIds` below,
// because those three shapes can't be told apart by one regex without
// making it unreadable. Group 1: an optional leading marker token
// (`- ✅ **13.201 — ...`, `- 🧪 **13.1 — ...`). Group 2: 0-2 leading
// asterisks. Group 3: the first id.
const ID_HEAD = /^-\s+(?:([^\s\d*][^\s]*)\s+)?(\*{0,2})(\d+\.\d+)/;
const STATUS_MARKERS = new Set(['✅', '🧪', '🟡', '❌', '🚫']);

/**
 * Every checked (✅) id in `text` -- expanding RANGE lines to every id they
 * cover -- plus every line that LOOKED like a case line but carried a
 * malformed id, reported rather than silently misparsed.
 *
 * THREE shapes have to be told apart in what follows the first id, and
 * getting this wrong is exactly the "check that cannot fail" class this
 * whole series keeps finding:
 *
 *  1. RANGE: `- **3.89–3.94** ✅ ...` -- ids 3.89 THROUGH 3.94 are each
 *     independently checked by the cited test(s); dropping the range
 *     silently exempted every id but the range's own leader from the
 *     citation ratchet entirely (found by review: 10 range lines in
 *     `03-foundation-ledger.md` alone hide 50 checked ids, all real and
 *     all, at review time, actually cited -- the check would have reported
 *     a false "0 uncited" for every one of them, forever, while `check-
 *     case-ids.mjs`'s own extractor DOES count them). The en-dash sits
 *     directly against both numbers, no spaces, matching every real
 *     instance measured.
 *  2. MALFORMED: `13.2.1` is not an N.M id, but `(\d+\.\d+)` in `ID_HEAD`
 *     greedily matches its first two segments ("13.2") -- a three-part
 *     number would silently misfile as a real, shorter id if nothing
 *     looked at what immediately follows (no range dash, `.` then a digit
 *     with no space between).
 *  3. ORDINARY: a single id, optionally closed by `**`, then either
 *     nothing, a status marker, or unrelated prose.
 *
 * A real id's tail is checked in that order -- range before malformed,
 * because a range's second number also starts with a digit and must not be
 * mistaken for a malformed continuation of the first.
 */
export function extractCheckedIds(text) {
  const ids = [];
  const malformed = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const head = line.match(ID_HEAD);
    if (!head) continue;
    const [, leadingMarker, leadingAsterisks, startId] = head;
    const rest = line.slice(head[0].length);

    const range = rest.match(/^–(\d+\.\d+)(\*{0,2})\s*(\S*)/);
    let nextToken;
    let idsOnLine;
    if (range) {
      const [, endId, , token] = range;
      nextToken = token;
      const [startSection, startNum] = startId.split('.').map(Number);
      const [endSection, endNum] = endId.split('.').map(Number);
      if (startSection !== endSection || endNum < startNum) {
        malformed.push({ line: i + 1, raw: line.trim() });
        continue;
      }
      idsOnLine = [];
      for (let n = startNum; n <= endNum; n += 1) idsOnLine.push(`${startSection}.${n}`);
    } else if (/^\.\d/.test(rest)) {
      malformed.push({ line: i + 1, raw: line.trim() });
      continue;
    } else {
      const ordinary = rest.match(/^(\*{0,2})\s*(\S*)/);
      nextToken = ordinary ? ordinary[2] : '';
      idsOnLine = [startId];
    }

    const status = STATUS_MARKERS.has(leadingMarker)
      ? leadingMarker
      : STATUS_MARKERS.has(nextToken)
        ? nextToken
        : null;
    if (status === '✅') ids.push(...idsOnLine);
  }
  return { ids, malformed };
}

// ------------------------------------------------------------------ corpus
//
// Every directory/extension the workspace convention names: any file under a
// `test/` directory (helpers included -- a citation can live in a shared
// fixture comment, not only inside the `it(...)` that uses it), any
// `*.test.ts`/`*.test.tsx` file wherever it lives (five apps/mobile and
// apps/desktop tests are co-located under `src/`, not under `test/`), and
// the e2e specs under `apps/web/e2e*/`, the canvas browser suite's `packages/workflow-canvas-browser/tests/` (G-9 T1), the Knowledge Graph's (KG-C T1) and the flow/time suite's `packages/flow-graph-browser/tests/` (WTG Part 1 T1).
export function isTestPath(relPath) {
  if (relPath.includes('/node_modules/')) return false;
  if (/(^|\/)test\//.test(relPath)) return true;
  if (/\.test\.tsx?$/.test(relPath)) return true;
  // The whole e2e/e2e-stack directory, not only its *.spec.ts files -- a
  // `test/` directory counts every file under it (helpers included, on the
  // reasoning that a citation can live in a shared fixture comment); an e2e
  // directory is the same kind of test-scoped tree and review found the
  // narrower *.spec.ts-only rule silently excluded its own helpers
  // (apps/web/e2e-stack/helpers/*.ts, global-setup.ts).
  if (/^apps\/web\/e2e[^/]*\//.test(relPath)) return true;
  // G-9 T1: the canvas browser suite is a package of its own (Playwright against a Vite harness, on the gate), its specs live in `tests/`.
  if (/^packages\/workflow-canvas-browser\/tests\//.test(relPath)) return true;
  // KG-C T1: the Knowledge Graph browser suite is a package of its own (Playwright against a Vite harness, on the gate), its specs live in `tests/`.
  if (/^packages\/knowledge-graph-browser\/tests\//.test(relPath)) return true;
  // WTG Part 1 T1: the flow/time browser suite is a package of its own (Playwright against a Vite harness, on the gate), its specs live in `tests/`.
  if (/^packages\/flow-graph-browser\/tests\//.test(relPath)) return true;
  return false;
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
}

function buildCorpus() {
  const all = [];
  for (const top of ['apps', 'packages']) {
    const dir = join(REPO_ROOT, top);
    if (existsSync(dir)) walk(dir, all);
  }
  let text = '';
  let fileCount = 0;
  for (const abs of all) {
    const rel = relative(REPO_ROOT, abs);
    if (!isTestPath(rel)) continue;
    try {
      text += readFileSync(abs, 'utf8') + '\n';
      fileCount += 1;
    } catch {
      // unreadable (broken symlink, permissions) -- skip rather than crash
    }
  }
  return { text, fileCount };
}

/**
 * A bare substring match, boundary-guarded so `13.201` cannot be satisfied
 * by `13.2010`, `113.201`, or a THIRD number segment (`3.25.76`, a zod
 * version string that genuinely appears in test files that pin dependency
 * versions in their own assertions or descriptions). The trailing guard
 * checks for a digit AND for `.` immediately followed by a digit -- found
 * by review: without the second half, bumping zod/tiptap/fastify in a
 * routine dependency update would silently satisfy ids `3.25`/`3.30`/`5.12`
 * via version strings alone, so DELETING the real citation for one of those
 * ids would not redden the check, and a LATER version bump could make an
 * already-correct citation start looking present for the wrong reason.
 * `.` immediately followed by NON-digit (a sentence-ending "case 5.18.")
 * still matches -- only a further digit after the dot is excluded. This is
 * the documented limit from the top of this file: it cannot tell a real
 * cross-reference from a coincidental decimal literal, only that the exact
 * digit sequence appears with no digit touching either side and no further
 * numeric segment extending it on either end.
 */
export function isCited(id, corpusText) {
  const escaped = id.replace('.', '\\.');
  const re = new RegExp(`(?<![\\d.])${escaped}(?!\\d)(?!\\.\\d)`);
  return re.test(corpusText);
}

export function computeUncited(caseFilesMap, corpusText) {
  const result = {};
  for (const [file, ids] of Object.entries(caseFilesMap)) {
    const uncitedIds = ids.filter((id) => !isCited(id, corpusText));
    result[file] = {
      total: ids.length,
      cited: ids.length - uncitedIds.length,
      uncited: uncitedIds.length,
      uncitedIds,
    };
  }
  return result;
}

/**
 * A ratchet that may only ever equal reality. `actual > baseline` is a
 * regression (a citing test was deleted, or a new checked case shipped
 * uncited). `actual < baseline` is a STALE ceiling -- also a failure, on
 * purpose: a baseline nobody has to tighten when things improve is a
 * baseline that stops meaning anything, and it is the shape that would let
 * a REAL regression on one file hide next to unrelated improvement on
 * another if this only checked a repo-wide sum instead of per file.
 */
export function checkRatchet(actual, baseline) {
  const violations = [];
  const files = new Set([...Object.keys(actual), ...Object.keys(baseline)]);
  for (const file of files) {
    if (!(file in baseline)) {
      violations.push({ file, reason: 'missing-baseline', actual: actual[file]?.uncited });
      continue;
    }
    const a = actual[file]?.uncited ?? 0;
    const b = baseline[file];
    if (a > b) violations.push({ file, reason: 'increased', actual: a, baseline: b });
    else if (a < b) violations.push({ file, reason: 'stale', actual: a, baseline: b });
  }
  return violations;
}


// Importable without running: a test that wants `check`/`extractCheckedIds` must not
// also execute the CLI. Without this the whole sweep runs on import and, on a repo in
// a failing state, `process.exit(1)` would kill the importing vitest worker mid-run.
const executedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (executedDirectly) {
  // ------------------------------------------------------------------- self-test
  //
  // PLANTED, in the check-runbook-commands.mjs shape: one defect per SHAPE the
  // mechanism claims to catch, not one per matcher, plus the mirror positive
  // control of every legitimate shape this repo actually uses. A run that
  // finds nothing on the real files must be distinguishable from a run whose
  // matchers never fired at all.
  const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8');
  const extracted = extractCheckedIds(FIXTURE_TEXT);
  const selfTestFailures = [];

  const EXPECTED_CHECKED = ['90.1', '90.2', '90.3', '90.4', '90.6', '90.7', '90.8'].sort();
  if (JSON.stringify([...extracted.ids].sort()) !== JSON.stringify(EXPECTED_CHECKED)) {
    selfTestFailures.push(
      `extraction: expected checked ids ${JSON.stringify(EXPECTED_CHECKED)}, got ${JSON.stringify([...extracted.ids].sort())} -- ` +
        'a status-marker style (bare/bold/marker-first/range) is not firing, or a non-✅/prose/absorbed line leaked in',
    );
  }
  const malformedRaw = extracted.malformed.map((m) => m.raw);
  if (
    extracted.malformed.length !== 2 ||
    !malformedRaw.some((r) => r.includes('90.5.1')) ||
    !malformedRaw.some((r) => r.includes('90.30–91.2'))
  ) {
    selfTestFailures.push(
      `malformed-id guard: expected exactly two malformed lines (90.5.1, a 90.30-91.2 cross-section ` +
        `range), got ${JSON.stringify(extracted.malformed)}`,
    );
  }

  // Citation matching: a real comment citation, a real test-name citation, an
  // absent id, the near-miss (99.9990 must not satisfy 99.999), and a THIRD
  // numeric segment extending the id the way a dependency version string does
  // (found by review: "zod 3.25.76" was satisfying id 3.25 with no real
  // citation anywhere) -- a trailing sentence period with no digit after it
  // must still count, or the fix would over-correct and break the ordinary
  // "case 5.18." shape real prose actually uses. All deliberately NOT real
  // case ids anywhere in this repo, so a reader never has to wonder whether
  // the number means something.
  const CITED_CORPUS = [
    '// case 90.1 is covered here, in a comment',
    "it('90.2 the thing it proves', () => {})",
    'const nearMiss = 90.10; // must not satisfy 90.1 above via prefix match',
    'the fix landed for case 90.40. so did the test',
  ].join('\n');
  if (!isCited('90.1', CITED_CORPUS)) selfTestFailures.push('isCited: a comment citation was not detected');
  if (!isCited('90.2', CITED_CORPUS)) selfTestFailures.push('isCited: a test-name citation was not detected');
  if (isCited('90.3', CITED_CORPUS)) selfTestFailures.push('isCited: a false positive -- 90.3 is not in the corpus at all');
  if (!isCited('90.40', CITED_CORPUS)) {
    selfTestFailures.push('isCited: a sentence-ending "90.40." (period, no following digit) was wrongly rejected');
  }
  const NEAR_MISS_ONLY = 'const x = 99.9990;';
  if (isCited('99.999', NEAR_MISS_ONLY)) {
    selfTestFailures.push('isCited: 99.999 matched inside 99.9990 -- the digit-boundary guard is not firing');
  }
  const VERSION_STRING_ONLY = 'devDependency "some-lib": "90.50.3"';
  if (isCited('90.50', VERSION_STRING_ONLY)) {
    selfTestFailures.push('isCited: 90.50 matched inside the version string 90.50.3 -- the third-segment guard is not firing');
  }

  // Ratchet: an increase (deleted citing test / new uncited case) must fail
  // with reason 'increased'; a stale ceiling (baseline higher than reality --
  // the "a baseline that went up [relative to truth]" shape) must fail with
  // reason 'stale'; an exact match must pass; a file with no baseline entry
  // at all must fail, named.
  const ratchetIncrease = checkRatchet({ 'fake.md': { uncited: 5 } }, { 'fake.md': 3 });
  if (ratchetIncrease.length !== 1 || ratchetIncrease[0].reason !== 'increased') {
    selfTestFailures.push(`ratchet: an increase (5 actual vs baseline 3) was not caught as 'increased' -- got ${JSON.stringify(ratchetIncrease)}`);
  }
  const ratchetStale = checkRatchet({ 'fake.md': { uncited: 2 } }, { 'fake.md': 5 });
  if (ratchetStale.length !== 1 || ratchetStale[0].reason !== 'stale') {
    selfTestFailures.push(`ratchet: a stale ceiling (2 actual vs baseline 5) was not caught as 'stale' -- got ${JSON.stringify(ratchetStale)}`);
  }
  const ratchetExact = checkRatchet({ 'fake.md': { uncited: 4 } }, { 'fake.md': 4 });
  if (ratchetExact.length !== 0) {
    selfTestFailures.push(`ratchet: an exact match (4 == 4) was wrongly flagged -- got ${JSON.stringify(ratchetExact)}`);
  }
  const ratchetMissing = checkRatchet({ 'new-file.md': { uncited: 0 } }, {});
  if (ratchetMissing.length !== 1 || ratchetMissing[0].reason !== 'missing-baseline') {
    selfTestFailures.push(`ratchet: a file with no baseline entry was not caught -- got ${JSON.stringify(ratchetMissing)}`);
  }

  if (selfTestFailures.length > 0) {
    console.error('check-case-citations: SELF-TEST FAILED:');
    for (const f of selfTestFailures) console.error(`  ${f}`);
    console.error(
      '  This script does not trust a result from the real files until every shape it claims to ' +
        'catch (an uncited ✅, a deleted-citing-test-shaped increase, a stale/too-generous baseline, ' +
        'a malformed id) has fired on a fixture with a known answer, alongside a positive control ' +
        'proving legitimate input is left alone.',
    );
    process.exit(1);
  }
  console.log(
    `check-case-citations: self-test passed (7 checked ids extracted across bare/bold/marker-first/range ` +
      `styles, 2 malformed lines caught (a truncated three-part id, a cross-section range), ` +
      `non-✅/absorbed/prose lines excluded, citation matching -- including the version-string and ` +
      `sentence-period edge cases -- and the ratchet's four shapes all fired correctly)`,
  );

  // ----------------------------------------------------------------- real sweep
  if (!existsSync(TEST_CASES_DIR)) {
    console.error(`check-case-citations: ${TEST_CASES_DIR} does not exist`);
    process.exit(1);
  }
  const caseFiles = readdirSync(TEST_CASES_DIR).filter((f) => /^\d+-.*\.md$/.test(f));
  if (caseFiles.length === 0) {
    console.error('check-case-citations: no test-cases/NN-*.md files found -- the detector is broken');
    process.exit(1);
  }

  const caseFilesMap = {};
  let totalMalformed = 0;
  for (const file of caseFiles) {
    const text = readFileSync(join(TEST_CASES_DIR, file), 'utf8');
    const { ids, malformed } = extractCheckedIds(text);
    caseFilesMap[file] = ids;
    if (malformed.length > 0) {
      totalMalformed += malformed.length;
      console.error(`check-case-citations: MALFORMED id-shaped line(s) in ${file}, not counted either way:`);
      for (const m of malformed) console.error(`  ${file}:${m.line}: ${m.raw}`);
    }
  }

  const { text: corpusText, fileCount } = buildCorpus();
  if (fileCount === 0) {
    console.error('check-case-citations: zero test files matched -- the corpus builder is broken');
    process.exit(1);
  }

  const actual = computeUncited(caseFilesMap, corpusText);
  const totalChecked = Object.values(actual).reduce((n, r) => n + r.total, 0);
  const totalCited = Object.values(actual).reduce((n, r) => n + r.cited, 0);
  const totalUncited = Object.values(actual).reduce((n, r) => n + r.uncited, 0);

  console.log(
    `check-case-citations: real sweep -- ${totalChecked} checked (✅) ids across ${caseFiles.length} ` +
      `files, ${fileCount} test/e2e files scanned, ${totalCited} cited, ${totalUncited} uncited` +
      (totalMalformed > 0 ? `, ${totalMalformed} malformed id line(s) (see above)` : ''),
  );
  for (const [file, r] of Object.entries(actual)) {
    console.log(`  ${file}: ${r.cited} cited / ${r.uncited} uncited / ${r.total} total`);
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(`check-case-citations: no baseline at ${BASELINE_PATH} -- run once to bootstrap it, then commit it`);
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

  const violations = checkRatchet(actual, baseline);
  if (violations.length > 0) {
    console.error(`check-case-citations: ${violations.length} ratchet violation(s):`);
    for (const v of violations) {
      if (v.reason === 'missing-baseline') {
        console.error(`  ${v.file}: no baseline entry -- add one (currently ${v.actual} uncited)`);
      } else if (v.reason === 'increased') {
        console.error(
          `  ${v.file}: uncited count REGRESSED -- baseline ${v.baseline}, now ${v.actual}. ` +
            `A citing test was likely deleted, or a new ✅ case shipped without a citation. Uncited ids:`,
        );
        for (const id of actual[v.file]?.uncitedIds ?? []) console.error(`    ${id}`);
      } else {
        console.error(
          `  ${v.file}: baseline is STALE -- committed ${v.baseline}, reality is ${v.actual}. ` +
            `Tighten scripts/fixtures/check-case-citations-baseline.json's "${v.file}" entry to ${v.actual}.`,
        );
      }
    }
    process.exit(1);
  }
  console.log('check-case-citations: ok (ratchet holds exactly on every file)');
}
