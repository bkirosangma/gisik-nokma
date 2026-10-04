import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkRatchet,
  extractCheckedIds,
  isCited,
  isTestPath,
} from '../../../../scripts/check-case-citations.mjs';

/**
 * `scripts/check-case-citations.mjs` guards its own answers with a self-test against a
 * planted fixture, and that self-test is real — but it lives in `scripts/`, which
 * `isTestPath` does not admit into the citation corpus, so nothing there can carry a
 * citation and nothing there is run by `pnpm turbo run test`. These cases port the same
 * properties onto the gate, against the SAME fixture, so the script's guarantees are
 * asserted by the suite rather than only by the script's own run.
 *
 * The script is importable without running because its CLI body sits behind an
 * `executedDirectly` guard. Before that guard existed, importing it executed the whole
 * sweep and could `process.exit(1)` out of the vitest worker.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const FIXTURE = readFileSync(
  join(REPO_ROOT, 'scripts/fixtures/check-case-citations-fixture.md'),
  'utf8',
);

describe('check-case-citations extraction, against the fixture the script self-tests with', () => {
  /**
   * 13.204 — `extractCheckedIds` reads every checked-id line shape the catalogue actually
   * uses — bare-trailing, bold-trailing, marker-first bold, marker-first bare, and a range
   * expanded to EVERY id it covers — and leaves non-checked shapes alone. The range arm is
   * the one that mattered: reading only the leader silently dropped five of six ids per
   * range line across §03.
   */
  it('extracts all five id shapes, with the range expanded to every id it covers', () => {
    const { ids } = extractCheckedIds(FIXTURE);
    expect([...ids].sort()).toEqual(['90.1', '90.2', '90.3', '90.4', '90.6', '90.7', '90.8']);
  });

  /**
   * 13.205 — a three-segment id is reported MALFORMED rather than silently truncated to a
   * shorter real-looking id. `(\d+\.\d+)` would happily match `90.5` out of `90.5.1` and
   * contribute a checked id nobody wrote, which is worse than an error: it is a wrong
   * answer with no symptom.
   */
  it('reports a three-segment id as malformed instead of truncating it to a real-looking one', () => {
    const { ids, malformed } = extractCheckedIds(FIXTURE);
    expect(ids).not.toContain('90.5');
    expect(malformed.some((m) => m.raw.includes('90.5.1'))).toBe(true);
    // The cross-section range is the second planted malformed line; asserting the count
    // stops a mutation that reports everything as malformed from passing the line above.
    expect(malformed).toHaveLength(2);
  });

  /**
   * 13.209 — `isCited` requires the id to be the WHOLE number, not a prefix of a longer
   * decimal. Found live by review: without the third-segment guard, bumping a dependency
   * to `90.50.3` would satisfy id `90.50` from a version string alone, so DELETING that
   * id's real citation would not redden the check.
   */
  it('does not accept a version string as a citation, and still accepts ordinary prose', () => {
    expect(isCited('90.50', 'devDependency "some-lib": "90.50.3"')).toBe(false);
    // The positive control one field apart: a sentence-ending period is a non-digit, so it
    // must still match. Without this, a guard that rejected everything would pass above.
    expect(isCited('90.40', 'proven by case 90.40.')).toBe(true);
    expect(isCited('90.40', 'no mention here')).toBe(false);
  });
});

describe('check-case-citations ratchet', () => {
  /**
   * 13.207 — `checkRatchet` classifies all four shapes: an increase is a regression, a
   * baseline looser than reality is STALE and also a failure (a ceiling nobody has to
   * tighten stops meaning anything), an exact match passes, and a file with no baseline
   * entry is caught rather than silently ignored.
   */
  it('catches an increase, a stale ceiling and a missing baseline, and passes on an exact match', () => {
    expect(checkRatchet({ 'f.md': { uncited: 5 } }, { 'f.md': 3 })).toEqual([
      { file: 'f.md', reason: 'increased', actual: 5, baseline: 3 },
    ]);
    expect(checkRatchet({ 'f.md': { uncited: 2 } }, { 'f.md': 5 })).toEqual([
      { file: 'f.md', reason: 'stale', actual: 2, baseline: 5 },
    ]);
    expect(checkRatchet({ 'f.md': { uncited: 4 } }, { 'f.md': 4 })).toEqual([]);
    expect(checkRatchet({ 'new.md': { uncited: 0 } }, {})).toEqual([
      { file: 'new.md', reason: 'missing-baseline', actual: 0 },
    ]);
  });
});

describe('check-case-citations corpus', () => {
  /**
   * 29.007 — the flow/time browser suite's specs and the viewport package's tests are citation corpus, so a ✅ case in
   * `test-cases/29-workflow-timeline-graphs.md` can be carried by a Playwright spec. Controls in the same `it`: the
   * package's harness pages, its README and the viewport SOURCE are not corpus (an id written in prose would otherwise
   * keep a case green with no test), and a `node_modules` copy of a spec directory is not either.
   */
  it('29.007 admits packages/flow-graph-browser/tests and packages/viewport/test; refuses the harness, the README, the source and node_modules', () => {
    expect(isTestPath('packages/flow-graph-browser/tests/stress.spec.ts')).toBe(true);
    expect(isTestPath('packages/viewport/test/pack.test.ts')).toBe(true);
    expect(isTestPath('packages/knowledge-graph-browser/tests/stress.spec.ts')).toBe(true);
    expect(isTestPath('packages/flow-graph-browser/harness/stress.tsx')).toBe(false);
    expect(isTestPath('packages/flow-graph-browser/README.md')).toBe(false);
    expect(isTestPath('packages/viewport/src/pack.ts')).toBe(false);
    expect(isTestPath('packages/flow-graph-browser/node_modules/pkg/tests/a.spec.ts')).toBe(false);
  });
});
