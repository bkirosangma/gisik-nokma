import { describe, expect, it } from 'vitest';
import {
  CONTRAST_PAIRS,
  SHADOW_ROLES,
  TOKEN_ROLES,
  colorOf,
  motion,
  motionVariableName,
  primitives,
  radiusOf,
  shadowValueOf,
  spaceVariableName,
  spacing,
  themeStylesheet,
  type StyleName,
  type ThemeName,
  type TokenRole,
} from '../src/tokens.js';
import { contrastRatio } from './helpers/contrast.js';
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Styling refresh Plan A, Tasks 1–2 — cases 20.001–20.004 and 20.011–20.015 (`test-cases/20-styling-system.md`
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
      // Amended UX T1 (owner U8, 2026-10-02; 23.007): neo's track steps to the well fill, no longer the one-hex surface.
      expect(colorOf(theme, 'surfaceTrack', 'neo')).toBe(theme === 'light' ? '#e6dcd2' : '#141a33');
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
      // Amended UX T1 (owner U8, 2026-10-02; 23.007): neo's well steps, no longer the one-hex surface.
      expect(colorOf(theme, 'surfaceWell', 'neo')).toBe(theme === 'light' ? '#e6dcd2' : '#141a33');
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

describe('20.011 a shadow layer can spread', () => {
  it('20.011 the spread renders as a fourth length, and the old layers render as before', () => {
    expect(shadowValueOf('hig', 'light', 'lift')).toContain('0px 8px 16px -8px');
    expect(shadowValueOf('neo', 'light', 'sunken-compact')).toBe(
      'inset 2px 2px 4px #b098848c, inset -2px -2px 4px #fffffff2',
    );
  });
});

const HIG_EXPECTED: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    lift: 'inset 0px 1px 0px #ffffffe6, 0px 1px 2px #273a631f, 0px 8px 16px -8px #273a6338',
    'lift-near':
      'inset 0px 1px 0px #ffffffff, 0px 2px 4px #273a6314, 0px 12px 24px -6px #273a632e, 0px 28px 48px -16px #273a6347',
    'lift-press': 'inset 0px 1px 0px #ffffffe6, 0px 1px 2px #273a6324, 0px 4px 8px -4px #273a6333',
    // Added 2026-09-29 (owner kanban rulings, Task 5A): the dragged card.
    'lift-drag':
      'inset 0px 1px 0px #ffffffff, 0px 4px 8px #273a631f, 0px 20px 32px -8px #273a6338, 0px 40px 64px -20px #273a6347',
    track: 'inset 0px 2px 4px #b0988459, inset 0px -1px 0px #ffffff99',
    action: 'inset 0px 1px 0px #ffffff47, 0px 1px 2px #273a6340, 0px 8px 16px -6px #33629f73',
    'action-near':
      'inset 0px 1px 0px #ffffff66, 0px 2px 4px #273a6333, 0px 10px 20px -6px #33629f73, 0px 20px 36px -14px #33629f80',
    'action-press': 'inset 0px 2px 4px #1016254d, 0px 1px 1px #273a6333',
    sheet: 'inset 1px 0px 0px #ffffffe6, -24px 0px 48px -16px #273a6359',
  },
  dark: {
    lift: 'inset 0px 1px 0px #f2e9e112, 0px 1px 2px #00000080, 0px 8px 16px -8px #00000099',
    'lift-near':
      'inset 0px 1px 0px #f2e9e11f, 0px 2px 4px #00000059, 0px 12px 24px -6px #0000008c, 0px 28px 48px -16px #00000099',
    'lift-press': 'inset 0px 1px 0px #f2e9e112, 0px 1px 2px #0000008c, 0px 4px 8px -4px #00000080',
    'lift-drag':
      'inset 0px 1px 0px #f2e9e11f, 0px 4px 8px #00000059, 0px 20px 32px -8px #0000008c, 0px 40px 64px -20px #00000099',
    track: 'inset 0px 2px 4px #00000073, inset 0px -1px 0px #ffffff0a',
    action: 'inset 0px 1px 0px #ffffff73, 0px 1px 2px #00000080, 0px 8px 16px -6px #0000008c',
    'action-near':
      'inset 0px 1px 0px #ffffff8c, 0px 2px 4px #00000073, 0px 10px 20px -6px #00000099, 0px 20px 36px -14px #000000a6',
    'action-press': 'inset 0px 2px 4px #141a2e73, 0px 1px 1px #00000066',
    sheet: 'inset 1px 0px 0px #f2e9e114, -24px 0px 48px -16px #00000099',
  },
};
const NEW_ROLES = ['lift', 'lift-near', 'lift-press', 'lift-drag', 'track', 'action', 'action-near', 'action-press', 'sheet'] as const;

describe('20.012 hig takes the mockup, minimal takes none', () => {
  it('20.012 every new role, pinned exactly in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const role of NEW_ROLES) {
        expect(shadowValueOf('hig', theme, role), `hig/${theme}/${role}`).toBe(HIG_EXPECTED[theme][role]);
        expect(shadowValueOf('minimal', theme, role), `minimal/${theme}/${role}`).toBe('none');
        // CONTROL — a new role is a new value, not the old raised shadow renamed.
        expect(shadowValueOf('hig', theme, role)).not.toBe(shadowValueOf('hig', theme, 'raised'));
      }
      // CONTROL — the drag shadow is its own, deeper value, not the hover one renamed.
      expect(shadowValueOf('hig', theme, 'lift-drag')).not.toBe(shadowValueOf('hig', theme, 'lift-near'));
    }
    for (const role of NEW_ROLES) expect(SHADOW_ROLES).toContain(role);
  });
});

describe('20.013 neo speaks its own depth language', () => {
  it('20.013 reuses and scales neo’s dual shadows, never the hig drop shadow', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(shadowValueOf('neo', theme, 'lift')).toBe(shadowValueOf('neo', theme, 'raised'));
      expect(shadowValueOf('neo', theme, 'track')).toBe(shadowValueOf('neo', theme, 'sunken'));
      expect(shadowValueOf('neo', theme, 'sheet')).toBe(shadowValueOf('neo', theme, 'overlay'));
      expect(shadowValueOf('neo', theme, 'action-press')).toBe(shadowValueOf('neo', theme, 'selected'));
      expect(shadowValueOf('neo', theme, 'action-near')).toBe(shadowValueOf('neo', theme, 'raised'));
      expect(shadowValueOf('neo', theme, 'lift-near')).toMatch(/^10px 10px 24px /);
      expect(shadowValueOf('neo', theme, 'lift-drag')).toMatch(/^14px 14px 32px /);
      expect(shadowValueOf('neo', theme, 'lift-press')).toMatch(/^4px 4px 10px /);
      expect(shadowValueOf('neo', theme, 'action')).toMatch(/^4px 4px 10px /);
      // CONTROL — no hig primitive leaks into neo. Amended UX T1 (owner U8, 2026-10-02): neo's dark raised highlight is now
      // `#f2e9e11f`, the same hex as hig's `lift-near` highlight, so the hex alone no longer tells them apart; hig's is the
      // INSET `0px 1px 0px` layer, and neo draws none.
      for (const role of NEW_ROLES) {
        expect(shadowValueOf('neo', theme, role), `neo/${theme}/${role}`).not.toMatch(/#273a63|#33629f|inset 0px 1px 0px #f2e9e1/);
      }
    }
  });
});

describe('20.014 the track radius is the card radius plus the 8px padding', () => {
  it('20.014 per style', () => {
    for (const style of ['hig', 'minimal', 'neo'] as const) {
      const card = Number.parseFloat(radiusOf(style, 'card'));
      expect(Number.parseFloat(radiusOf(style, 'track')), style).toBe(card + 8);
    }
    // CONTROL — the card radius itself is unchanged.
    expect([radiusOf('hig', 'card'), radiusOf('minimal', 'card'), radiusOf('neo', 'card')]).toEqual(['16px', '16px', '20px']);
    expect(themeStylesheet()).toContain('--gn-radius-track: 28px;');
  });
});

describe('20.015 spacing and motion are emitted once, under the bare :root', () => {
  it('20.015 exact values, one declaration each, font block still first', () => {
    const stylesheet = themeStylesheet();
    expect(stylesheet.startsWith(':root { --gn-font-')).toBe(true);
    const firstBlock = stylesheet.split('\n')[0] ?? '';
    const expected: Array<[string, string]> = [
      [spaceVariableName(1), '0.5rem'],
      [spaceVariableName(2), '1rem'],
      [spaceVariableName(3), '1.5rem'],
      [motionVariableName('feedback'), '100ms'],
      [motionVariableName('move'), '200ms'],
      [motionVariableName('lift'), '220ms'],
      [motionVariableName('done'), '300ms'],
      [motionVariableName('ease-out'), 'cubic-bezier(0.2, 0.8, 0.2, 1)'],
    ];
    for (const [name, value] of expected) {
      const declaration = `${name}: ${value};`;
      expect(firstBlock, name).toContain(declaration);
      expect(stylesheet.split(declaration).length - 1, `${name} declared once`).toBe(1);
    }
    expect(spacing).toEqual({ 1: '0.5rem', 2: '1rem', 3: '1.5rem' });
    // CONTROL — rule 06: 150–300ms for a move, 100ms for feedback. Nothing outside 100–300.
    for (const key of ['feedback', 'move', 'lift', 'done'] as const) {
      const ms = Number.parseFloat(motion[key]);
      expect(ms).toBeGreaterThanOrEqual(100);
      expect(ms).toBeLessThanOrEqual(300);
    }
  });
});
