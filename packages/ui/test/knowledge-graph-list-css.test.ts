import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * The Knowledge Graph's list under the canvas (KG-C T8 FIX 1, F5; case 27.660, planner ruling 2026-10-06 00:00 (3)): spec
 * §3.5 puts the accessible list "Under the canvas". In two columns the inspector spans both rows and the keys line and the
 * list (`.gn-kg__below`) sit in the canvas's column, row 2, so the inspector's height never moves the list; one column keeps
 * its stacking. These read the rules; the browser half (the list's header at one height, 921 against 920, 768, 360, the
 * phone) is `packages/knowledge-graph-browser/tests/inspector.spec.ts`.
 */
const CSS = readUiCss();
const DESKTOP = '@media (min-width: 57.5625rem)';
const ONE_COLUMN = '@media (max-width: 57.5rem)';
const PLACEMENT = ['grid-area', 'grid-row', 'grid-row-start', 'grid-row-end', 'grid-column', 'grid-column-start', 'grid-column-end'];

describe('27.660 the list sits under the canvas, in its column, on a desktop', () => {
  it('27.660 the desktop block spans the inspector over both rows and puts the keys line and the list in column 1, row 2; nothing else, the one-column block included, places either', () => {
    const aside = ruleExactly(CSS, '.gn-kg:not(.gn-kg--phone) .gn-kg-insp', DESKTOP);
    expect(valueOf(aside, 'grid-row')).toBe('1 / span 2');
    const below = ruleExactly(CSS, '.gn-kg:not(.gn-kg--phone) .gn-kg__below', DESKTOP);
    expect(valueOf(below, 'grid-column')).toBe('1');
    expect(valueOf(below, 'grid-row')).toBe('2');
    // row 1 is the canvas alone and row 2 takes whatever more the inspector needs; the keys line stays 10px under the canvas
    const body = ruleExactly(CSS, '.gn-kg:not(.gn-kg--phone) .gn-kg__body', DESKTOP);
    expect(valueOf(body, 'grid-template-rows')).toBe('auto 1fr');
    expect(valueOf(body, 'row-gap')).toBe('0.625rem');
    const placing = parseRules(CSS).filter(
      (r) => r.selectors.some((s) => /\.gn-kg-insp$|\.gn-kg__below$/.test(s)) && PLACEMENT.some((p) => valueOf(r.body, p) !== null),
    );
    expect(placing.map((r) => `${r.atRule} ${r.selectors.join(', ')}`)).toEqual([
      `${DESKTOP} .gn-kg:not(.gn-kg--phone) .gn-kg-insp`,
      `${DESKTOP} .gn-kg:not(.gn-kg--phone) .gn-kg__below`,
    ]);
    // CONTROL: the one-column block is there and is the one-column rule, so "places neither" is not read off a renamed block
    expect(valueOf(ruleExactly(CSS, '.gn-kg__body', ONE_COLUMN), 'grid-template-columns')).toBe('minmax(0, 1fr)');
  });
});
