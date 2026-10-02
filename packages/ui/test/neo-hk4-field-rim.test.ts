import { describe, expect, it } from 'vitest';
import { readUiCss } from './helpers/css-rules.js';
import { readGlobalsCss } from './helpers/style-patterns.js';
import { CONTRAST_PAIRS, TOKEN_ROLES, colorOf, primitives, themeStylesheet } from '../src/tokens.js';

/**
 * Housekeeping HK-4 (owner 2026-10-02; reviewer A 13:45): neo's dead `fieldRim` role is retired. After N10 (24.040) no
 * CSS rule reads `--gn-field-rim`: every neo field arm is transparent plus the `field` shadow, and hig/minimal fields
 * read `--gn-border`. Cases 24.120–24.123.
 */
const STYLES = ['hig', 'minimal', 'neo'] as const;

describe('24.120 the fieldRim role, its variable and its three primitives are gone', () => {
  it('24.120 no role, no emitted variable, no neoFieldRim primitive; the neighbouring roles are still emitted', () => {
    expect(TOKEN_ROLES as readonly string[]).not.toContain('fieldRim');
    const sheet = themeStylesheet();
    expect(sheet).not.toContain('--gn-field-rim');
    expect(Object.keys(primitives).filter((k) => /fieldrim/i.test(k))).toEqual([]);
    // CONTROL, same it: the sweep is not blind — the roles next to it in the roster are still there and still emitted.
    expect(TOKEN_ROLES as readonly string[]).toContain('surfaceWell');
    expect(sheet).toContain('--gn-surface-well:');
    expect(sheet).toContain('--gn-border:');
  });
});

describe('24.121 the four fieldRim contrast rows are gone and every other row stays', () => {
  it('24.121 no CONTRAST_PAIRS row names fieldRim; the roster is 52 (56 minus the four)', () => {
    expect(CONTRAST_PAIRS.filter((p) => (p.fg as string) === 'fieldRim' || (p.bg as string) === 'fieldRim')).toEqual([]);
    expect(CONTRAST_PAIRS.length).toBe(52);
    // CONTROL: the rows beside them are untouched.
    expect(CONTRAST_PAIRS.some((p) => p.fg === 'border' && p.bg === 'surfaceWell' && p.minimum === 3)).toBe(true);
    expect(CONTRAST_PAIRS.some((p) => p.fg === 'textAccent' && p.bg === 'surfaceTrack' && p.minimum === 4.5)).toBe(true);
  });
});

describe('24.122 no stylesheet reads the retired variable', () => {
  it('24.122 neither ui.css nor globals.css names --gn-field-rim, not even in a comment', () => {
    const css = `${readUiCss()}\n${readGlobalsCss()}`;
    expect(css).not.toContain('field-rim');
    // CONTROL: the scan reads real sources — the field arm still reads the border variable it always did.
    expect(css).toContain('var(--gn-border)');
    expect(css).toContain('.gn-field__input');
  });
});

describe('24.123 the hig/minimal field edge renders what fieldRim used to (zero drift)', () => {
  it('24.123 the border role in hig and minimal is the four hexes the retired role mapped to', () => {
    const was = { light: '#6c6c70', dark: '#98989d' } as const;
    for (const style of STYLES.filter((s) => s !== 'neo')) {
      for (const theme of ['light', 'dark'] as const) {
        expect(colorOf(theme, 'border', style), `${style}/${theme}`).toBe(was[theme]);
      }
    }
    // CONTROL: the two themes differ, so a theme-blind mapping could not pass the loop above; and neo shares the mapping
    // (the ring colours were neo's only departure from `border`, and they are the retired ones).
    expect(was.light).not.toBe(was.dark);
    for (const theme of ['light', 'dark'] as const) expect(colorOf(theme, 'border', 'neo')).toBe(was[theme]);
  });
});
