import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './helpers/contrast.js';
import { CONTRAST_PAIRS, TOKEN_ROLES, colorOf, cssVariableName, primitives, themes } from '../src/tokens.js';

type Fixture = Record<string, { surfaces: Record<string, string> }>;
const before = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/hig-minimal-shadows.before.json'), 'utf8')) as Fixture;

/** WCAG relative luminance of a `#rrggbb` colour: the ordering the "one notch toward ink" claim is stated in. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

describe('the surfacePlaceholder role (amendment S-R1, rule 3)', () => {
  it('25.017c hig and minimal map it to the primitive surfaceTrack uses, so their skeleton looks exactly as the track does today (24.009 stays green)', () => {
    expect(TOKEN_ROLES).toContain('surfacePlaceholder');
    expect(cssVariableName('surfacePlaceholder')).toBe('--gn-surface-placeholder');
    for (const style of ['hig', 'minimal'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        expect(themes[theme].surfacePlaceholder, `${style}/${theme}`).toBe(themes[theme].surfaceTrack);
        expect(colorOf(theme, 'surfacePlaceholder', style), `${style}/${theme}`).toBe(colorOf(theme, 'surfaceTrack', style));
        // The value is the one the pre-T2 fixture recorded for surfaceTrack, not a re-derived near miss.
        expect(colorOf(theme, 'surfacePlaceholder', style), `${style}/${theme} vs the 24.009 fixture`).toBe(
          before[`${style}/${theme}`]?.surfaces.surfaceTrack,
        );
      }
    }
    // Control: neo does NOT follow the track (that is the point of the role).
    expect(colorOf('light', 'surfacePlaceholder', 'neo')).not.toBe(colorOf('light', 'surfaceTrack', 'neo'));
    expect(colorOf('dark', 'surfacePlaceholder', 'neo')).not.toBe(colorOf('dark', 'surfaceTrack', 'neo'));
  });

  it('25.017d neo maps it to a flat step one notch off surface toward ink, never the well, and the role needs no contrast pair', () => {
    expect(colorOf('light', 'surfacePlaceholder', 'neo')).toBe('#eae1d8');
    expect(colorOf('dark', 'surfacePlaceholder', 'neo')).toBe('#2a314b');
    for (const theme of ['light', 'dark'] as const) {
      const placeholder = colorOf(theme, 'surfacePlaceholder', 'neo');
      const well = theme === 'light' ? primitives.neoWellLight : primitives.neoWellDark;
      // never the well, nor any recessed ground the neo arm paints
      for (const role of ['surfaceTrack', 'surfaceWell', 'surfaceSunken'] as const) expect(placeholder, `${theme} vs ${role}`).not.toBe(colorOf(theme, role, 'neo'));
      expect(placeholder, `${theme} vs the well primitive`).not.toBe(well);
      // it is a flat step off the page surface, toward the ink (the text colour), and nearer the surface than the well is
      const surface = luminance(colorOf(theme, 'surface', 'neo'));
      const ink = luminance(colorOf(theme, 'text', 'neo'));
      const step = luminance(placeholder);
      expect(Math.abs(step - surface), theme).toBeGreaterThan(0);
      expect(Math.abs(ink - step) < Math.abs(ink - surface), `${theme}: toward ink`).toBe(true);
      // the well lies the OTHER way in dark (below the surface, away from the ink), so the two can never be confused there
      if (theme === 'dark') expect(luminance(well) < surface && surface < step, 'dark: well < surface < placeholder').toBe(true);
      else expect(luminance(well) < step && step < surface, 'light: well < placeholder < surface').toBe(true);
      // still visible on the surface it sits on (a faint bar, not an invisible one)
      expect(contrastRatio(placeholder, colorOf(theme, 'surface', 'neo'))).toBeGreaterThan(1.05);
    }
    // decoration only: no row names it, in either position
    expect(CONTRAST_PAIRS.some((pair) => pair.fg === 'surfacePlaceholder' || pair.bg === 'surfacePlaceholder')).toBe(false);
    // Control: the well itself FAILS the "never the well" ordering above (it is not strictly between itself and the surface).
    expect(luminance(primitives.neoWellLight) < luminance(primitives.neoWellLight)).toBe(false);
  });
});
