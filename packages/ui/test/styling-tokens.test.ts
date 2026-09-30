import { describe, expect, it } from 'vitest';
import {
  CONTRAST_PAIRS,
  TOKEN_ROLES,
  colorOf,
  primitives,
  type StyleName,
  type ThemeName,
  type TokenRole,
} from '../src/tokens.js';
import { contrastRatio } from './helpers/contrast.js';
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Styling refresh Plan A, Task 1 — cases 20.001–20.004 (`test-cases/20-styling-system.md`
 * §20.1). The grounds and the edge the twelve rules need, translated from the
 * owner-approved mockup (`Main.dc.html:130-153`, `Sheet.dc.html:111-127`) into roles.
 */
const STYLES: StyleName[] = ['hig', 'minimal', 'neo'];
const THEMES: ThemeName[] = ['light', 'dark'];

function declared(fg: TokenRole, bg: TokenRole, minimum: number): boolean {
  return CONTRAST_PAIRS.some((pair) => pair.fg === fg && pair.bg === bg && pair.minimum === minimum);
}

describe('the exact-selector reader is proven against planted input before it is trusted', () => {
  it('tells a group from a lone selector, and a media arm from the base rule', () => {
    const planted = [
      '/* .gn-x { color: red; } — a DELETED rule, in prose */',
      '.gn-a,',
      '.gn-x { padding: 1rem; }',
      '.gn-x { padding: 2rem; margin: 0; }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .gn-x { transition: none; }',
      '}',
    ].join('\n');
    expect(valueOf(ruleExactly(planted, '.gn-x'), 'padding')).toBe('2rem');
    expect(valueOf(ruleExactly(planted, ['.gn-a', '.gn-x']), 'padding')).toBe('1rem');
    expect(valueOf(ruleExactly(planted, '.gn-x', '@media (prefers-reduced-motion: reduce)'), 'transition')).toBe('none');
    expect(parseRules(planted)).toHaveLength(3);
    expect(() => ruleExactly(`${planted}\n.gn-x { color: blue; }`, '.gn-x')).toThrow(/found 2/);
    expect(valueOf('min-height: 3rem; height: 1rem;', 'height')).toBe('1rem');
  });
});

describe('20.001 surfaceTrack — the recessed track ground', () => {
  it('20.001 pinned per style × theme, and the three text tiers are DECLARED pairs on it that clear 4.5', () => {
    for (const style of ['hig', 'minimal'] as const) {
      expect(colorOf('light', 'surfaceTrack', style)).toBe('#e8ded4');
      expect(colorOf('dark', 'surfaceTrack', style)).toBe('#10152a');
    }
    for (const theme of THEMES) {
      expect(colorOf(theme, 'surfaceTrack', 'neo')).toBe(colorOf(theme, 'surface', 'neo'));
    }
    for (const fg of ['text', 'textMuted', 'textSubtle'] as const) {
      expect(declared(fg, 'surfaceTrack', 4.5), `${fg} on surfaceTrack is not a declared pair`).toBe(true);
      for (const style of STYLES) {
        for (const theme of THEMES) {
          expect(
            contrastRatio(colorOf(theme, fg, style), colorOf(theme, 'surfaceTrack', style)),
            `${style}/${theme}: ${fg} on surfaceTrack`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    // CONTROL — the finding: a flat fill is not a boundary. The sunken fill and
    // the track itself both sit below 1.5:1 on the paper, so the track must be
    // carried by its shadow (20.012).
    expect(contrastRatio(colorOf('light', 'surfaceSunken'), colorOf('light', 'surface'))).toBeLessThan(1.5);
    expect(contrastRatio(colorOf('light', 'surfaceTrack'), colorOf('light', 'surface'))).toBeLessThan(1.5);
  });
});

describe('20.002 surfaceWell — the well inside a raised panel', () => {
  it('20.002 pinned per style × theme, with the three text tiers declared at 4.5', () => {
    for (const style of ['hig', 'minimal'] as const) {
      expect(colorOf('light', 'surfaceWell', style)).toBe('#f3ece5');
      expect(colorOf('dark', 'surfaceWell', style)).toBe('#1a213b');
    }
    for (const theme of THEMES) {
      expect(colorOf(theme, 'surfaceWell', 'neo')).toBe(colorOf(theme, 'surface', 'neo'));
    }
    for (const fg of ['text', 'textMuted', 'textSubtle'] as const) {
      expect(declared(fg, 'surfaceWell', 4.5), `${fg} on surfaceWell is not a declared pair`).toBe(true);
    }
    // CONTROL — a real second ground in hig, not the raised panel's own colour.
    expect(colorOf('light', 'surfaceWell')).not.toBe(colorOf('light', 'surfaceRaised'));
  });
});

describe('20.003 accentEdge — the primary button edge', () => {
  it('20.003 pinned, ≥ 3:1 on surface and surfaceRaised, and accentText on it ≥ 4.5', () => {
    for (const style of STYLES) {
      expect(colorOf('light', 'accentEdge', style)).toBe('#2d5488');
      expect(colorOf('dark', 'accentEdge', style)).toBe('#bcd4f7');
    }
    expect(declared('accentEdge', 'surface', 3)).toBe(true);
    expect(declared('accentEdge', 'surfaceRaised', 3)).toBe(true);
    expect(declared('accentText', 'accentEdge', 4.5)).toBe(true);
    for (const style of STYLES) {
      for (const theme of THEMES) {
        for (const bg of ['surface', 'surfaceRaised'] as const) {
          expect(
            contrastRatio(colorOf(theme, 'accentEdge', style), colorOf(theme, bg, style)),
            `${style}/${theme}: accentEdge on ${bg}`,
          ).toBeGreaterThanOrEqual(3);
          // CONTROL — the fill is itself visible; the edge is a second signal.
          expect(contrastRatio(colorOf(theme, 'accent', style), colorOf(theme, bg, style))).toBeGreaterThanOrEqual(3);
        }
        expect(
          contrastRatio(colorOf(theme, 'accentText', style), colorOf(theme, 'accentEdge', style)),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('20.004 the accessible edge is `border`, and nothing uses lineStrong', () => {
  it('20.004 border is declared on raised and well grounds, and no role resolves to lineStrong', () => {
    expect(declared('border', 'surfaceRaised', 3)).toBe(true);
    expect(declared('border', 'surfaceWell', 3)).toBe(true);
    for (const style of STYLES) {
      for (const theme of THEMES) {
        for (const role of TOKEN_ROLES) {
          expect(colorOf(theme, role, style), `${style}/${theme}/${role} resolves to lineStrong`).not.toBe(
            primitives.lineStrong,
          );
        }
      }
    }
    // CONTROL — the mockup's finding, as a measurement: lineStrong fails the 3:1 edge rule.
    expect(contrastRatio(primitives.lineStrong, primitives.warmPaper)).toBeLessThan(3);
  });
});
