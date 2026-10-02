import { describe, expect, it } from 'vitest';
import { parseRules, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/** Smoothness T5 (spec S1, P10; amendment S-R1). Case 25.055. */
const css = readGlobalsCss();
const SHELL_SELECTORS = ['.gn-nav--skeleton', '.gn-shell--skeleton', '.gn-project__tabs-skeleton'];

describe('shell CSS for placeholders (spec S1, P10)', () => {
  it('25.055 the nav reserves its height; the pending hint animates opacity only after a 100ms delay; reduced motion keeps it static', () => {
    expect(valueOf(ruleExactly(css, '.gn-nav--skeleton'), 'min-height')).toBe('var(--app-nav-offset)');
    const hint = ruleExactly(css, '.gn-nav__pending[data-pending="true"]');
    expect(valueOf(hint, 'animation')).toBe('gnPulse 1600ms var(--gn-motion-ease-out) 100ms infinite');
    expect(valueOf(hint, 'transform')).toBeNull();
    // The wrapper must not break the bar's ellipsis chain (link > .gn-nav__label): a shrinkable flex box, never inline-block.
    const box = ruleExactly(css, '.gn-nav__pending');
    expect(valueOf(box, 'display')).toBe('inline-flex');
    expect(valueOf(box, 'min-width')).toBe('0');
    expect(valueOf(ruleExactly(css, '.gn-nav__pending[data-pending="true"]', '@media (prefers-reduced-motion: reduce)'), 'animation')).toBe('none');
  });

  it('25.055 the shell rules lay out only (S-R1: the real container paints; no skeleton rule names a fill, a border, a shadow, a colour or a style attribute, so never the well)', () => {
    const own = parseRules(css).filter((rule) => rule.selectors.some((selector) => SHELL_SELECTORS.some((name) => selector.includes(name))));
    expect(own.length).toBeGreaterThanOrEqual(3);
    for (const rule of own) {
      for (const property of ['background', 'background-color', 'border', 'box-shadow', 'color']) expect(valueOf(rule.body, property), `${rule.selectors} ${property}`).toBeNull();
      expect(rule.selectors.join(','), 'style attribute').not.toContain('data-style');
    }
    // Control: a rule that does animate (the hint) is not one of them, and the height it reserves is the bar's own token, which is
    // declared (4.35rem, measured 69.6px at 1440) and re-pointed on the phone (52px measured at 390), so the skeleton tracks the real bar.
    expect(valueOf(ruleExactly(css, '.gn-nav__pending[data-pending="true"]'), 'animation')).not.toBeNull();
    expect(parseRules(css).filter((rule) => rule.atRule === null && rule.selectors.includes(':root') && valueOf(rule.body, '--app-nav-offset') !== null)).toHaveLength(1);
    expect(css).toContain('--app-nav-offset: var(--gn-phone-top-height)');
    expect(css).not.toContain('--gn-nav-height');
  });
});
