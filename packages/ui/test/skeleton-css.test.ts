import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

const css = readUiCss();

/** From the opening of the marker comment to the end of the sheet (the marker sits INSIDE a comment, which must open in the slice). */
function placeholderBlock(): string {
  const marker = css.indexOf('LOADING PLACEHOLDERS');
  return css.slice(css.lastIndexOf('/*', marker));
}

describe('the placeholder block in ui.css (spec §4.2, §4.3; amendment S-R1)', () => {
  it('25.017 the skeleton fill is the placeholder role, the shape is radius tokens, and the pulse is one named keyframe on opacity only', () => {
    const base = ruleExactly(css, '.gn-skeleton');
    expect(valueOf(base, 'background')).toBe('var(--gn-surface-placeholder)');
    expect(valueOf(base, 'border-radius')).toBe('var(--gn-radius-control)');
    expect(valueOf(base, 'box-shadow')).toBeNull();
    expect(valueOf(base, 'animation')).toBe('gnPulse 1600ms var(--gn-motion-ease-out) infinite');
    expect(valueOf(ruleExactly(css, '.gn-skeleton--card'), 'border-radius')).toBe('var(--gn-radius-card)');
    const pulse = css.match(/@keyframes gnPulse\s*\{([\s\S]*?)\}\s*\}/)?.[1] ?? '';
    expect(pulse).toMatch(/opacity/);
    expect(pulse).not.toMatch(/transform|background|width|height/);
    // S-R1: no skeleton rule paints the track, the well or the plain surface.
    const block = placeholderBlock();
    expect(block).not.toMatch(/--gn-surface-(track|well|sunken)/);
    // Control: the mutation "fill from surface" fails this line.
    expect(valueOf(base, 'background')).not.toBe('var(--gn-surface)');
  });

  it('25.017b every selector with an animation declaration in ui.css has a prefers-reduced-motion: reduce arm naming it', () => {
    const rules = parseRules(css);
    const animated = rules.filter((r) => r.atRule === null && /(^|;|\s)animation\s*:/.test(r.body)).flatMap((r) => r.selectors);
    const reduced = new Set(rules.filter((r) => r.atRule === '@media (prefers-reduced-motion: reduce)').flatMap((r) => r.selectors));
    const ungated = animated.filter((s) => !reduced.has(s));
    expect(ungated, ungated.join('\n')).toEqual([]);
    // Control: a planted ungated animation in a copy of the sheet is caught.
    const planted = parseRules(`${css}\n.gn-planted { animation: gnPulse 1s infinite; }`);
    const plantedAnimated = planted.filter((r) => r.atRule === null && /animation\s*:/.test(r.body)).flatMap((r) => r.selectors);
    expect(plantedAnimated.filter((s) => !reduced.has(s))).toEqual(['.gn-planted']);
  });

  it('25.018 reduced motion stops the pulse and leaves a static block; the block names no style attribute', () => {
    const reduced = ruleExactly(css, '.gn-skeleton', '@media (prefers-reduced-motion: reduce)');
    expect(valueOf(reduced, 'animation')).toBe('none');
    expect(valueOf(reduced, 'opacity')).toBe('0.8');
    const block = placeholderBlock();
    expect(block).not.toMatch(/\[data-style=/);
    expect(parseRules(block).filter((r) => r.selectors.some((s) => s.startsWith('.gn-skeleton')))).not.toHaveLength(0);
  });

  it('25.019 the block is appended after every earlier rule, so earlier line ranges do not move', () => {
    expect(css.indexOf('LOADING PLACEHOLDERS')).toBeGreaterThan(0);
    // keyframe steps (`0%, 100%`) are not selectors: the one keyframe is named by its own case (25.017)
    const rulesAfter = parseRules(placeholderBlock()).filter((r) => !(r.atRule ?? '').startsWith('@keyframes')).map((r) => r.selectors.join(','));
    expect(rulesAfter.length).toBeGreaterThan(0);
    // The region's rule is `:where(.gn-skeleton-region)`, zero specificity (kg-walk-fixes-2 item 5, 27.695): the same family.
    for (const sel of rulesAfter) expect(sel).toMatch(/^(\.gn-skeleton|\.gn-pending|\.gn-skeleton__rows|\.gn-skeleton-region|:where\(\.gn-skeleton-region\))/);
    // Control: a rule of any other family would be caught by the same pattern.
    expect('.gn-board-card').not.toMatch(/^(\.gn-skeleton|\.gn-pending|\.gn-skeleton__rows|\.gn-skeleton-region|:where\(\.gn-skeleton-region\))/);
  });
});
