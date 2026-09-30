import { describe, expect, it } from 'vitest';
import { parseRules, valueOf } from './helpers/css-rules.js';
import { cssOf, expectRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B13 — cases 20.321–20.323 (§20.33). */
// Shadow only (owner ruling 2026-09-29): no scale, no guard, no reduced-motion arm.
const HOVER = ['.gn-card:has(> .gn-workspace-card__door:hover)', '.gn-card:has(> .gn-project-card__door:hover)'];
const PRESS = ['.gn-card:has(> .gn-workspace-card__door:active)', '.gn-card:has(> .gn-project-card__door:active)'];
const DOOR_RULE = /\.gn-workspace-card(__door)?\b|\.gn-project-card(__door)?\b|\.gn-workspace-home__link\b/;
const TRANSITION = 'box-shadow var(--gn-motion-lift) var(--gn-motion-ease-out)';

describe('20.321 one hover vocabulary: the shadow', () => {
  it('20.321 doors deepen their shadow and settle on press; no brightness remains', () => {
    const css = cssOf('globals');
    // CONTROL — no brightness filter survives ANYWHERE in globals.css: the three
    // families that used one (the two door cards, the section cards, the project
    // card's action button) were the only ones on `8b11d76e`.
    for (const rule of parseRules(css)) {
      expect(valueOf(rule.body, 'filter') ?? '', rule.selectors.join(', ')).not.toMatch(/brightness\(/);
    }
    expectRow({ sheet: 'globals', selectors: HOVER, declarations: { 'box-shadow': 'var(--gn-shadow-lift-near)', 'z-index': '1' } });
    expectRow({
      sheet: 'globals',
      selectors: PRESS,
      declarations: { 'box-shadow': 'var(--gn-shadow-lift-press)', 'transition-duration': 'var(--gn-motion-feedback)' },
    });
    expectRow({ sheet: 'globals', selectors: '.gn-workspace-home__link:hover', declarations: { 'box-shadow': 'var(--gn-shadow-lift-near)', 'z-index': '1' } });
    expectRow({
      sheet: 'globals',
      selectors: '.gn-workspace-home__link:active',
      declarations: { 'box-shadow': 'var(--gn-shadow-lift-press)', 'transition-duration': 'var(--gn-motion-feedback)' },
    });
    // each card's transition names `box-shadow` alone, and the two `z-index` lifts need a positioned card
    for (const selectors of [['.gn-workspace-card'], ['.gn-project-card'], ['.gn-workspace-home__link']]) {
      expectRow({ sheet: 'globals', selectors, declarations: { transition: TRANSITION } });
    }
    expectRow({ sheet: 'globals', selectors: '.gn-workspace-card', declarations: { position: 'relative' } });
    // no per-theme arm: nothing keyed on the theme names a door, and the Archive button's
    // brightness rules (deleted) are not back under another spelling
    for (const rule of parseRules(css)) {
      const named = rule.selectors.filter((s) => DOOR_RULE.test(s) || s.includes('.gn-project-card__actions .gn-button:hover'));
      for (const selector of named) {
        expect(selector, 'a per-theme arm on a door card').not.toMatch(/data-theme/);
      }
      if (rule.atRule !== null && named.length > 0) {
        expect(rule.atRule, `${named.join(', ')} under an at-rule`).not.toMatch(/prefers-color-scheme|prefers-reduced-motion/);
      }
    }
    expect(parseRules(css).some((rule) => rule.selectors.some((s) => s.includes('.gn-project-card__actions .gn-button:hover')))).toBe(false);
  });
});
describe('20.322 no door card transforms or filters', () => {
  it('20.322 every door-card rule declares neither transform nor filter', () => {
    let scanned = 0;
    for (const rule of parseRules(cssOf('globals'))) {
      if (!rule.selectors.some((s) => DOOR_RULE.test(s))) continue;
      scanned += 1;
      for (const property of ['transform', 'filter']) {
        const value = valueOf(rule.body, property);
        expect(value === null || value === 'none', `${rule.selectors.join(', ')}: ${property}`).toBe(true);
      }
    }
    // CONTROL — the scan reaches the rules this task writes, the door hover/press rules
    // included (their selectors name `__door`, which the pattern above admits on purpose).
    expect(scanned).toBeGreaterThanOrEqual(6);
  });
});
describe('20.323 raised panels on the home', () => {
  it('20.323 section cards and the founding panel on lift; the project card stays positioned', () => {
    // CONTROL — `.gn-project-card` keeps `position: relative` (its door's `::after` hit area depends on it).
    expectRow({ sheet: 'globals', selectors: '.gn-project-card', declarations: { position: 'relative' } });
    expectRow({ sheet: 'globals', selectors: '.gn-workspace-home__link', pattern: 'P-RAISED' });
    expectRow({ sheet: 'globals', selectors: '.gn-project-founding', pattern: 'P-RAISED' });
  });
});
