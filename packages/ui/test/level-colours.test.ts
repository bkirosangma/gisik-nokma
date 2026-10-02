import { describe, expect, it } from 'vitest';
import { CONTRAST_PAIRS, colorOf, cssVariableName, themeStylesheet, type StyleName, type ThemeName } from '../src/tokens.js';
import { contrastRatio } from './helpers/contrast.js';

/**
 * Prefixes and groups plan Task 7, case 22.143: the four group-level colours (ruling R5: one colour per
 * LEVEL, the same for every group at that level). Each must clear 3:1 against the card surface in every
 * style x theme, and the four must differ in every one of them — one shared colour would make a level
 * strip say nothing.
 */
const LEVELS = ['level1', 'level2', 'level3', 'level4'] as const;
const STYLES: readonly StyleName[] = ['hig', 'minimal', 'neo'];
const THEMES: readonly ThemeName[] = ['light', 'dark'];

describe('22.143 the level tokens differ per level and clear 3:1 on the card surface', () => {
  it('22.143 four distinct colours that clear 3:1 on surfaceRaised in neo/hig/minimal x light/dark, exposed as --gn-level-N', () => {
    for (const style of STYLES) {
      for (const theme of THEMES) {
        const colours = LEVELS.map((role) => colorOf(theme, role, style));
        expect(new Set(colours).size, `${style}/${theme}: the four levels must differ`).toBe(4);
        for (const role of LEVELS) {
          expect(
            contrastRatio(colorOf(theme, role, style), colorOf(theme, 'surfaceRaised', style)),
            `${style}/${theme}: ${role} on surfaceRaised`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
    // The CSS variable names the plan fixes, and a declaration of each in the emitted stylesheet.
    expect(LEVELS.map(cssVariableName)).toEqual(['--gn-level-1', '--gn-level-2', '--gn-level-3', '--gn-level-4']);
    expect(themeStylesheet()).toContain(`--gn-level-1: ${colorOf('light', 'level1')};`);
    // CONTROL: each level is held to its floor by a declared pair, so a palette edit cannot quietly drop it.
    for (const role of LEVELS) {
      expect(CONTRAST_PAIRS.some((pair) => pair.fg === role && pair.bg === 'surfaceRaised' && pair.minimum >= 3), role).toBe(true);
    }
  });
});
