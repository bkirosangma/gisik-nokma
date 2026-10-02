import { describe, expect, it } from 'vitest';
import { parseRules, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';
import { TABLET_BAR_QUERY } from '../src/use-tablet-bar.js';

/**
 * Smoothness T8 (spec S1, §4.3; amendment S-R1) — the CSS this task adds. Cases 25.136 (the new skeleton rules lay out and
 * paint nothing: never a fill, never the well, never a style attribute) and 25.146 (the corner's Notes/Inbox links are hidden
 * by CSS at the tablet arm, the belt behind the script gate, so the first paint is right even before any script).
 */
const css = readGlobalsCss();
const MARK = 'SECONDARY SCREEN SKELETONS (smoothness T8';
const start = css.indexOf(MARK);
const block = start < 0 ? '' : css.slice(start);

describe('25.136 the T8 skeleton rules lay out and paint nothing', () => {
  it('25.136 the block exists, is appended after every earlier rule, and no rule in it names a fill, a border, a shadow, a colour or a style attribute (control: the sign-in slot rule DOES reserve a height)', () => {
    expect(start, 'the T8 block is missing from globals.css').toBeGreaterThan(0);
    const rules = parseRules(block);
    expect(rules.length).toBeGreaterThanOrEqual(2);
    for (const rule of rules) {
      for (const property of ['background', 'background-color', 'border', 'box-shadow', 'color', 'fill']) {
        expect(valueOf(rule.body, property), `${rule.selectors} ${property}`).toBeNull();
      }
      expect(rule.selectors.join(','), 'style attribute').not.toContain('data-style');
    }
    expect(block).not.toMatch(/well/i);
    const slot = ruleExactly(css, '.gn-sign-in__methods-slot[data-state="pending"]');
    expect(valueOf(slot, 'min-height')).not.toBeNull();
    // Nothing of the project's later CSS follows the block (the placeholder blocks stay last, 25.019).
    expect(css.lastIndexOf('/* ──')).toBeGreaterThanOrEqual(start);
  });
});

describe('25.146 the corner links are hidden by CSS at the tablet arm', () => {
  it('25.146 `@media (max-width: 64rem)` hides `.gn-nav__corner > .gn-nav__notes` and `> .gn-nav__inbox`, and the query is the script gate\'s own (control: above the arm nothing hides them)', () => {
    const arm = `@media ${TABLET_BAR_QUERY}`;
    const hidden = ruleExactly(css, ['.gn-nav__corner > .gn-nav__notes', '.gn-nav__corner > .gn-nav__inbox'], arm);
    expect(valueOf(hidden, 'display')).toBe('none');
    const wide = parseRules(css).filter(
      (rule) => rule.atRule === null && rule.selectors.some((selector) => selector === '.gn-nav__corner > .gn-nav__notes' || selector === '.gn-nav__corner > .gn-nav__inbox') && valueOf(rule.body, 'display') === 'none',
    );
    expect(wide).toEqual([]);
  });
});
