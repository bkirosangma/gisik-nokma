import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REPO_ROOT,
  existingClientSourceRoots,
  findColourLiterals,
  scanTreeForColourLiterals,
} from './helpers/colour-scan.js';

describe('the scanner itself is proven against planted defects before it is trusted', () => {
  it('catches hex (3–8 digit), rgb(), rgba(), hsl(), oklch() and color-mix()', () => {
    expect(findColourLiterals('color: #fff;')).toEqual(['#fff']);
    expect(findColourLiterals('background: #b3261e;')).toEqual(['#b3261e']);
    expect(findColourLiterals("const scrim = '#1c1b1866';")).toEqual(['#1c1b1866']);
    expect(findColourLiterals('border: 1px solid rgb(0, 0, 0);')).toEqual(['rgb(']);
    expect(findColourLiterals('color: rgba(0,0,0,.5)')).toEqual(['rgba(']);
    expect(findColourLiterals('color: hsl(9 80% 40%)')).toEqual(['hsl(']);
    expect(findColourLiterals('color: oklch(0.7 0.1 250)')).toEqual(['oklch(']);
    expect(findColourLiterals('color: color-mix(in srgb, red, blue)')).toEqual(['color-mix(']);
  });

  it('lets colour-free source through', () => {
    expect(findColourLiterals("import { colorOf } from '@gisik-nokma/ui';")).toEqual([]);
    expect(findColourLiterals('color: var(--gn-text);')).toEqual([]);
    expect(findColourLiterals("const ULID = '01J9GTKA000000000000000000';")).toEqual([]);
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
    expect(findColourLiterals(origin).length).toBeGreaterThan(0);
  });
});
