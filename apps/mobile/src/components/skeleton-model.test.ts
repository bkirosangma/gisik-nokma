import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { colorOf, primitives, type StyleName, type ThemeName } from '@gisik-nokma/ui/tokens';
import { BOARD_ROW_FRAME_STYLE } from '../screens/board-row-frame.js';
import { sweepPressables } from '../screens/pressable-a11y-sweep.js';
import { skeletonFill } from './skeleton-model.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');
const THEMES: ThemeName[] = ['light', 'dark'];

/**
 * The mobile skeleton's FILL and FRAME (spec S-R1, amended plan Task 13). React Native has no classes, so "the component's own container" is
 * its style object: the real board row and the skeleton row take the SAME exported constant. The row declares no box of its own today (the
 * phone screens are unstyled), so the constant is `{}` and a style that lands later lands there once and the skeleton follows.
 */
describe('the mobile skeleton fill and frame (spec S-R1)', () => {
  it('25.218 the fill is the surfacePlaceholder role (not the track, never a neo well), the skeleton rows reuse the real row frame, and no skeleton is pressable', () => {
    for (const theme of THEMES) {
      expect(skeletonFill(theme)).toBe(colorOf(theme, 'surfacePlaceholder'));
      expect(skeletonFill(theme)).toBe(colorOf(theme, 'surfaceTrack')); // hig: the same primitive, so the phones' look is unchanged
      for (const style of ['hig', 'minimal', 'neo'] as StyleName[]) {
        const fill = colorOf(theme, 'surfacePlaceholder', style);
        expect(fill, `${theme}/${style}`).not.toBe(primitives.neoWellLight);
        expect(fill, `${theme}/${style}`).not.toBe(primitives.neoWellDark);
      }
    }
    // CONTROL (same it): in neo the TRACK is the well, so the guard above is not vacuous.
    expect(colorOf('light', 'surfaceTrack', 'neo')).toBe(primitives.neoWellLight);
    expect(colorOf('dark', 'surfaceTrack', 'neo')).toBe(primitives.neoWellDark);
    expect(skeletonFill('light')).not.toBe(skeletonFill('dark'));

    const skeleton = source('components/skeleton.tsx');
    const board = source('screens/board-screen.tsx');
    expect(skeleton).toMatch(/BOARD_ROW_FRAME_STYLE/);
    expect(board).toMatch(/style=\{BOARD_ROW_FRAME_STYLE\}/);
    expect(skeleton).toMatch(/from '\.\.\/screens\/board-row-frame\.js'/);
    expect(board).toMatch(/from '\.\/board-row-frame\.js'/);
    expect(BOARD_ROW_FRAME_STYLE).toEqual({});
    expect(skeleton).toMatch(/accessibilityState=\{\{ busy: true \}\}/);
    expect(skeleton, 'no literal colour').not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(sweepPressables('skeleton.tsx', skeleton).pressableCount, 'a skeleton is not a pressable').toBe(0);
  });
});
