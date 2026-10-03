import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { colorOf, primitives, type StyleName, type ThemeName } from '@gisik-nokma/ui/tokens';
import { BOARD_ROW_FRAME_STYLE } from '../screens/board-row-frame.js';
import { sweepPressables } from '../screens/pressable-a11y-sweep.js';
import {
  SKELETON_BAR_HEIGHT,
  SKELETON_BAR_MARGIN,
  SKELETON_BLOCK_GAP,
  SKELETON_LINE_HEIGHT,
  skeletonBarMetrics,
  skeletonFill,
  skeletonGround,
} from './skeleton-model.js';

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
    expect(skeleton, 'the skeleton row IS the real row frame, not just an import of it').toMatch(/<View key=\{index\} style=\{BOARD_ROW_FRAME_STYLE\}>/);
    expect(board).toMatch(/style=\{BOARD_ROW_FRAME_STYLE\}/);
    expect(skeleton).toMatch(/from '\.\.\/screens\/board-row-frame\.js'/);
    expect(board).toMatch(/from '\.\/board-row-frame\.js'/);
    expect(BOARD_ROW_FRAME_STYLE).toEqual({});
    expect(skeleton).toMatch(/accessibilityState=\{\{ busy: true \}\}/);
    expect(skeleton, 'no literal colour').not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(sweepPressables('skeleton.tsx', skeleton).pressableCount, 'a skeleton is not a pressable').toBe(0);
  });

  it('25.218 the fill names the surfacePlaceholder role in the source (not the track), because in hig both resolve to one primitive and the values cannot tell them apart', () => {
    const model = source('components/skeleton-model.ts');
    expect(model).toMatch(/colorOf\(theme, 'surfacePlaceholder'\)/);
    expect(model, 'the plan says "not the track colour"').not.toMatch(/surfaceTrack/);
    // CONTROL (same it): the value check alone is blind to the swap — which is why the source is read.
    expect(colorOf('light', 'surfacePlaceholder')).toBe(colorOf('light', 'surfaceTrack'));
  });

  it('25.218 a text-line part is shorter than the line with margins that sum back to it (air between rows, the row height unchanged); a block takes no margin; the ticket skeleton has a gap above its body', () => {
    expect(SKELETON_BAR_HEIGHT).toBeLessThan(SKELETON_LINE_HEIGHT);
    expect(SKELETON_BAR_HEIGHT + 2 * SKELETON_BAR_MARGIN, 'a row is still the height of the row it stands in (S1)').toBe(SKELETON_LINE_HEIGHT);
    const line = skeletonBarMetrics();
    expect(line.height + 2 * line.marginVertical).toBe(SKELETON_LINE_HEIGHT);
    // Two stacked rows: the visible gap between their bars is the sum of the margins, not zero.
    expect(2 * line.marginVertical).toBeGreaterThan(0);
    // CONTROL (same it): a block of an explicit height is exactly that tall, with no margin, so the editor band stays 108 dp.
    expect(skeletonBarMetrics(108)).toEqual({ height: 108, marginVertical: 0 });
    expect(SKELETON_BLOCK_GAP).toBeGreaterThan(0);
    const skeleton = source('components/skeleton.tsx');
    expect(skeleton).toMatch(/\.\.\.skeletonBarMetrics\(props\.height\)/);
    expect(skeleton, 'the body block sits below a gap').toMatch(/<View style=\{\{ marginTop: SKELETON_BLOCK_GAP \}\}>\s*<SkeletonBar width="100%" height=\{96\} \/>/);
  });

  it('25.218 the editor overlay ground is the surface role in both themes', () => {
    for (const theme of THEMES) expect(skeletonGround(theme)).toBe(colorOf(theme, 'surface'));
    expect(skeletonGround('light')).not.toBe(skeletonGround('dark'));
  });
});
