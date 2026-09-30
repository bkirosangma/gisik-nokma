import { describe, expect, it } from 'vitest';
import { parseRules, valueOf } from './helpers/css-rules.js';
import { cssOf, expectRow } from './helpers/style-patterns.js';

/** Touch-doors pass, case 20.621 (§20.61): the template chooser's cards answer the pointer as B13's workspace-home door cards do. */
const DOOR = '.template-gallery__door';
const TRANSITION = 'box-shadow var(--gn-motion-lift) var(--gn-motion-ease-out)';

describe('20.621 a template door is P-LIFT: raised, hover deepens, press settles, nothing transforms', () => {
  it('20.621 lift at rest, lift-near on hover, lift-press on press; no transform, no filter', () => {
    // CONTROL — the vocabulary it copies is still what the workspace home's door cards declare.
    expectRow({ sheet: 'globals', selectors: '.gn-workspace-home__link:hover', declarations: { 'box-shadow': 'var(--gn-shadow-lift-near)' } });
    expectRow({
      sheet: 'ui',
      selectors: DOOR,
      declarations: {
        background: 'var(--gn-surface-raised)',
        'box-shadow': 'var(--gn-shadow-lift)',
        'border-radius': 'var(--gn-radius-card)',
        transition: TRANSITION,
        cursor: 'pointer',
      },
    });
    expectRow({ sheet: 'ui', selectors: `${DOOR}:hover`, declarations: { 'box-shadow': 'var(--gn-shadow-lift-near)', 'z-index': '1', position: 'relative' } });
    expectRow({
      sheet: 'ui',
      selectors: `${DOOR}:active`,
      declarations: { 'box-shadow': 'var(--gn-shadow-lift-press)', 'transition-duration': 'var(--gn-motion-feedback)' },
    });
    expectRow({ sheet: 'ui', selectors: `${DOOR}:focus-visible`, declarations: { outline: '2px solid var(--gn-focus-ring)' } });
    let scanned = 0;
    for (const rule of parseRules(cssOf('ui'))) {
      if (!rule.selectors.some((selector) => selector.startsWith(DOOR))) continue;
      scanned += 1;
      for (const property of ['transform', 'filter']) {
        const value = valueOf(rule.body, property);
        expect(value === null || value === 'none', `${rule.selectors.join()}: ${property}`).toBe(true);
      }
      expect(rule.atRule, `${rule.selectors.join()} under an at-rule`).toBeNull();
    }
    expect(scanned).toBeGreaterThanOrEqual(4);
  });
});

describe('20.625 Start blank keeps its own 44px pill beside the doors', () => {
  it('20.625 the blank cell centres its ghost button instead of stretching it to the door row height', () => {
    // CONTROL — the door cells stretch (the door fills its card); only the blank cell centres.
    expectRow({ sheet: 'ui', selectors: '.template-gallery__card', declarations: { display: 'flex' } });
    expectRow({ sheet: 'ui', selectors: '.template-gallery__card--blank', declarations: { 'align-items': 'center' } });
  });
});
