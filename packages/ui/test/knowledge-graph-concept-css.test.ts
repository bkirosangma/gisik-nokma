import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, existingClientSourceRoots, findColourLiterals, scanTreeForColourLiterals } from './helpers/colour-scan.js';
import { parseRules, readUiCss } from './helpers/css-rules.js';

/**
 * Knowledge Graph spec D §6 (KG-D Task 8, case 27.531): the concept inspector's `/* KG: D concept *\/` block. It sits in
 * plan C's Knowledge Graph region, after the T9 block and directly above `/* KG: end *\/` (so the loading placeholders
 * stay last, 25.019), it holds every concept rule, and the colour scan (`token-discipline.test.ts`'s gate) reads it and
 * finds no raw colour.
 */
const CSS = readUiCss();
const START = '/* KG: D concept */';
const END = '/* KG: end */';
const lineOf = (index: number) => CSS.slice(0, index).split('\n').length;

describe('27.531 the concept block', () => {
  it('27.531 sits in the KG region, after plan C\'s T9 block and directly above KG: end, above the loading placeholders, and holds every concept rule', () => {
    const t9 = CSS.indexOf('/* KG: T9 tab+panel */');
    const d = CSS.indexOf(START);
    const end = CSS.indexOf(END);
    const loading = CSS.indexOf('LOADING PLACEHOLDERS');
    expect([t9, d, end, loading].every((i) => i > 0)).toBe(true);
    expect(CSS.indexOf(START, d + 1)).toBe(-1);
    expect(t9 < d && d < end && end < loading).toBe(true);
    // nothing of another block between it and the end marker
    expect(CSS.slice(d + START.length, end)).not.toContain('/* KG: ');
    const outside = CSS.slice(0, d) + CSS.slice(end);
    // control: the outside text is real CSS the parser reads (plan C's inspector rule is in it)
    expect(parseRules(outside).some((r) => r.selectors.includes('.gn-kg-insp'))).toBe(true);
    expect(parseRules(outside).flatMap((r) => r.selectors).filter((s) => s.includes('gn-kg-concept'))).toEqual([]);
  });

  it('27.531 the colour scan reads the block and finds no raw colour; precondition: the block\'s first selector is in the scanned text; control: a colour planted in it is found, by the matcher and by the gate\'s walk', () => {
    const block = CSS.slice(CSS.indexOf(START), CSS.indexOf(END));
    expect(parseRules(block)[0]?.selectors[0]).toBe('.gn-kg-concept-inspector');
    const planted = block.replace('{', '{ color: #b3261e;');
    expect(findColourLiterals(planted, 'css')).toEqual(['#b3261e']);
    expect(findColourLiterals(block, 'css')).toEqual([]);
    // The gate walks packages/ui/src and reads a .css file there: proven on a copy of the planted block.
    expect(existingClientSourceRoots()).toContain(join(REPO_ROOT, 'packages/ui/src'));
    const dir = mkdtempSync(join(tmpdir(), 'kg-d-css-'));
    try {
      writeFileSync(join(dir, 'ui.css'), planted);
      expect(scanTreeForColourLiterals(dir).map((h) => h.match)).toEqual(['#b3261e']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const [from, to] = [lineOf(CSS.indexOf(START)), lineOf(CSS.indexOf(END))];
    const hits = scanTreeForColourLiterals(join(REPO_ROOT, 'packages/ui/src')).filter((h) => h.file === 'packages/ui/src/ui.css' && h.line >= from && h.line <= to);
    expect(hits).toEqual([]);
  });
});
