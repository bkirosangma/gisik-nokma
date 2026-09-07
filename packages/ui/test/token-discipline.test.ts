import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REPO_ROOT,
  existingClientSourceRoots,
  findColourLiterals,
  scanTreeForColourLiterals,
} from './helpers/colour-scan.js';

describe('the scanner itself is proven against planted defects before it is trusted', () => {
  it('catches hex (3–8 digit), rgb(), rgba(), hsl(), oklch() and color-mix() IN APPLIED POSITION', () => {
    // CSS: a declaration VALUE. `kind` is explicit on every call now, because the
    // same three characters mean different things in the two languages and a
    // scanner that guessed would be the bug this file exists to prevent.
    expect(findColourLiterals('color: #fff;', 'css')).toEqual(['#fff']);
    expect(findColourLiterals('background: #b3261e;', 'css')).toEqual(['#b3261e']);
    // Script: inside a string, which is the only way a colour reaches a screen
    // from JavaScript.
    expect(findColourLiterals("const scrim = '#1c1b1866';", 'script')).toEqual(['#1c1b1866']);
    expect(findColourLiterals('const c = "#fff";', 'script')).toEqual(['#fff']);
    expect(findColourLiterals('const c = `#fff`;', 'script')).toEqual(['#fff']);
    // Colour FUNCTIONS need no positional argument: the name is unambiguous.
    expect(findColourLiterals('border: 1px solid rgb(0, 0, 0);', 'css')).toEqual(['rgb(']);
    expect(findColourLiterals('color: rgba(0,0,0,.5)', 'css')).toEqual(['rgba(']);
    expect(findColourLiterals('color: hsl(9 80% 40%)', 'css')).toEqual(['hsl(']);
    expect(findColourLiterals('color: oklch(0.7 0.1 250)', 'css')).toEqual(['oklch(']);
    expect(findColourLiterals('color: color-mix(in srgb, red, blue)', 'css')).toEqual(['color-mix(']);
  });

  it('lets colour-free source through', () => {
    expect(findColourLiterals("import { colorOf } from '@gisik-nokma/ui';", 'script')).toEqual([]);
    expect(findColourLiterals('color: var(--gn-text);', 'css')).toEqual([]);
    expect(findColourLiterals("const ULID = '01J9GTKA000000000000000000';", 'script')).toEqual([]);
  });

  /**
   * THE FALSE POSITIVE THAT TURNED `main` RED, 2026-09-07.
   *
   * `#270` — a PULL REQUEST NUMBER in a prose comment — is three hex digits, which
   * is a legal CSS shorthand colour. **No tightening of the SHAPE can separate the
   * two**: `#270` and `#fff` are the same token. Only position can.
   *
   * Each case below is PAIRED with the real colour it must still catch in the same
   * position, so "no longer matches" can never be satisfied by a scanner that
   * stopped matching anything.
   */
  describe('a hex-shaped token outside applied position is not a colour', () => {
    it('a PR reference in a line comment is ignored — and a real literal beside it is not', () => {
      expect(findColourLiterals('// the fix createRegion made in PR #270', 'script')).toEqual([]);
      expect(findColourLiterals("const c = '#270'; // PR #270", 'script')).toEqual(['#270']);
    });

    it('THE EXACT SHAPE THAT BROKE THE GATE: a block comment whose middle line carries no marker', () => {
      // The line holding `#270` has no `/*`, no `*/` and no `//`. A per-line
      // scanner — which is what this was — cannot tell it is inside a comment,
      // which is why comments are stripped over the whole file.
      const source = ['/*', '  createRegion was making until PR #270, and it has the identical fix:', '*/'].join('\n');
      expect(findColourLiterals(source, 'script')).toEqual([]);
      // POSITIVE CONTROL, same three-line shape, one line changed: a real literal
      // on the line AFTER the comment closes is still caught, so the strip is not
      // eating the file.
      const planted = ['/*', '  createRegion was making until PR #270', '*/', "const c = '#b3261e';"].join('\n');
      expect(findColourLiterals(planted, 'script')).toEqual(['#b3261e']);
    });

    it('a CSS ID SELECTOR is not a colour — a latent false positive, found while fixing the other', () => {
      expect(findColourLiterals('#abc { padding: 0; }', 'css')).toEqual([]);
      // Same selector, now with a colour actually applied inside it.
      expect(findColourLiterals('#abc { color: #abc; }', 'css')).toEqual(['#abc']);
    });

    it('an unquoted hex-shaped token in script is not a colour', () => {
      expect(findColourLiterals('const issue = 270; // see #270', 'script')).toEqual([]);
      expect(findColourLiterals("const bg = '#fff';", 'script')).toEqual(['#fff']);
    });
  });

  /**
   * The tree walk is exercised END TO END against a planted file, not only through
   * `findColourLiterals`. The unit cases above prove the PATTERN; this proves the
   * thing the gate actually runs — that `walk` reads the file, strips comments
   * whole-file, judges position, and reports the right LINE.
   */
  it('the walk itself still finds a planted literal, and reports its line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'colour-scan-'));
    writeFileSync(
      join(dir, 'planted.css'),
      ['/* a comment mentioning PR #270 */', '.a { padding: 0; }', '.b { color: #b3261e; }'].join(
        '\n',
      ),
    );
    const hits = scanTreeForColourLiterals(dir);
    expect(hits.map((hit) => ({ line: hit.line, match: hit.match }))).toEqual([
      { line: 3, match: '#b3261e' },
    ]);
  });
});

describe('token discipline (coordination amendment 11)', () => {
  it('finds no colour literal outside packages/ui/src/tokens.ts across client source trees', () => {
    const hits = existingClientSourceRoots().flatMap((root) => scanTreeForColourLiterals(root));
    const report = hits.map((hit) => `${hit.file}:${hit.line} ${hit.match}`).join('\n');
    expect(hits, `colour literals outside the origin:\n${report}`).toEqual([]);
  });

  it('tokens.ts itself is exempt because it is the origin — and it does hold colours', () => {
    const origin = readFileSync(join(REPO_ROOT, 'packages/ui/src/tokens.ts'), 'utf8');
    expect(findColourLiterals(origin, 'script').length).toBeGreaterThan(0);
  });
});
