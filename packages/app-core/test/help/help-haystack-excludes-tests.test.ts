import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { compareAbsent, isTestPath, productText, reasonProblems } from '../../../../scripts/help-content.mjs';

/**
 * UX fixes F-7 (reviewer B 13:58, owner follow-up): the help checker's haystack leaves out tests.
 *
 * A manual quotation that appears only in a `.test.ts` literal is a string a test asserts, not one the
 * product shows, so it must not count as "found in the product". Step 4 of the brief (a quotation that
 * wraps a line) was already landed by U-T11b: `QUOTED_SPAN` allows one newline, case 23.196.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const roots: string[] = [];
function plantedRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'help-haystack-'));
  roots.push(root);
  // `productText` walks both product directories, so both exist even when a case plants one file.
  mkdirSync(join(root, 'apps'));
  mkdirSync(join(root, 'packages'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const QUOTE = 'Nothing here can be undone, ever';
const DOC = [{ source: 'doc', text: `The product says "${QUOTE}" at that point.` }];
const NO_BASELINE = { absent: [] as string[] };

describe('23.290 a quotation found only in a test file is reported as absent from the product', () => {
  it('finds it in a src file (control, first) and no longer finds it in a test or e2e file', () => {
    // Control: the SAME quotation in a product source file satisfies the check.
    const inSrc = plantedRoot({ 'apps/x/src/a.ts': `export const m = '${QUOTE}';\n` });
    expect(productText(inSrc)).toContain(QUOTE);
    expect(compareAbsent({ documents: DOC, product: productText(inSrc), baseline: NO_BASELINE }).undeclared).toEqual([]);

    // Each home a test can have: none of them is the product.
    const homes = [
      'apps/x/test/a.test.ts',
      'apps/x/tests/a.ts',
      'apps/x/src/__tests__/a.ts',
      'apps/x/e2e-stack/a.ts',
      'packages/y/src/a.spec.tsx',
      'packages/y/src/b.test.ts',
    ];
    for (const home of homes) {
      const root = plantedRoot({ [home]: `expect(text).toBe('${QUOTE}');\n` });
      expect(productText(root), home).not.toContain(QUOTE);
      const { undeclared } = compareAbsent({ documents: DOC, product: productText(root), baseline: NO_BASELINE });
      expect(undeclared, home).toEqual([{ source: 'doc', span: QUOTE }]);
    }
  });
});

describe('23.291 isTestPath names test files and test directories, and nothing that merely resembles them', () => {
  it('rejects look-alikes (control, first) and accepts test dirs, e2e dirs, .test and .spec files', () => {
    for (const path of [
      'apps/web/src/latest.tsx',
      'apps/web/src/attest.ts',
      'apps/web/src/test-utils.ts',
      'apps/web/src/e2e-notes.tsx',
      'apps/web/src/contest/page.tsx',
      'packages/ui/src/test.css.ts',
      'apps/web/src/testing/index.ts',
      'apps/web/src/',
      'apps/web/src/a.ts',
    ]) {
      expect(isTestPath(path), path).toBe(false);
    }
    for (const path of [
      'apps/web/test/a.tsx',
      'apps/server/tests/a.ts',
      'packages/ui/src/__tests__/a.ts',
      'apps/web/e2e/a.ts',
      'apps/web/e2e-viewport/a.ts',
      'apps/web/test/',
      'apps/web/e2e-stack/',
      'packages/ui/src/button.test.tsx',
      'packages/ui/src/button.spec.ts',
      'apps/web/src/a.test.d.ts',
    ]) {
      expect(isTestPath(path), path).toBe(true);
    }
  });
});

describe('23.292 every declared absence that carries a reason carries a sound one', () => {
  it('flags an orphan and a placeholder (control, first), and finds the real baseline sound', () => {
    expect(reasonProblems({ absent: ['a', 'b'], reasons: { a: 'long enough to say why', ghost: 'a reason for nothing' } })).toEqual([
      'a reason for "ghost", which is not in "absent"',
    ]);
    expect(reasonProblems({ absent: ['a'], reasons: { a: 'todo' } })).toEqual(['the reason for "a" is too short to say why']);
    expect(reasonProblems({ absent: ['an old entry with no reason'] })).toEqual([]);

    const baseline = JSON.parse(readFileSync(resolve(REPO_ROOT, 'scripts/help-quoted-strings-absent.json'), 'utf8'));
    expect(reasonProblems(baseline)).toEqual([]);
    expect(Object.keys(baseline.reasons).length).toBeGreaterThan(0);
  });
});
