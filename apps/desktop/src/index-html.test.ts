import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { colorOf } from '@gisik-nokma/ui/tokens';

/**
 * Smoothness T13 (spec §3.3; audit SM-12): the desktop window is never white before React.
 *
 * The desktop shell sets no `data-style`, so `themeStylesheet()`'s bare `:root` block is the hig one: the window's `--gn-surface` is hig's.
 * The expected grounds are therefore READ from `tokens.ts` (`colorOf`), not written here as literals — a change to those two roles reddens
 * this case instead of leaving `index.html` painting a stale colour (`index.html` is outside the colour scanner's roots).
 */
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ground = html.match(/<style[^>]*data-gn-ground[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? '';

describe('the desktop window is never white before React (spec §3.3; audit SM-12)', () => {
  it("25.211 index.html paints the stored theme's ground from the first byte, honours the OS dark preference when nothing is stored, and the grounds are the tokens' own hig surface", () => {
    const light = colorOf('light', 'surface');
    const dark = colorOf('dark', 'surface');
    expect(ground, 'a <style data-gn-ground> block exists').not.toBe('');
    // The style block comes BEFORE the module script, so the first paint already has it.
    expect(html.indexOf('data-gn-ground')).toBeGreaterThan(-1);
    expect(html.indexOf('data-gn-ground')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
    expect(ground).toMatch(new RegExp(`html\\s*\\{\\s*background:\\s*${light};`));
    expect(ground).toMatch(new RegExp(`prefers-color-scheme:\\s*dark\\)\\s*\\{\\s*html\\s*\\{\\s*background:\\s*${dark};`));
    expect(ground).toMatch(new RegExp(`html\\[data-theme="light"\\]\\s*\\{\\s*background:\\s*${light};`));
    expect(ground).toMatch(new RegExp(`html\\[data-theme="dark"\\]\\s*\\{\\s*background:\\s*${dark};`));
    // The default text colour follows the ground (no black-on-navy): `color-scheme` flips CanvasText with it.
    expect(ground).toMatch(/html\[data-theme="dark"\][^}]*color-scheme:\s*dark/);
    expect(ground).toMatch(/prefers-color-scheme:\s*dark\)[^}]*\{[^}]*color-scheme:\s*dark/);
    // The stored choice is read before the first paint, with the same key and values the web shell uses.
    expect(html).toMatch(/localStorage\.getItem\('gn-theme'\)/);
    expect(html).toMatch(/dataset\.theme\s*=/);
    expect(html.indexOf("getItem('gn-theme')")).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
    // CONTROL (same it): the two grounds differ, so a swapped pair or a single colour cannot satisfy the four patterns above.
    expect(light).not.toBe(dark);
    expect(ground).not.toMatch(new RegExp(`html\\[data-theme="dark"\\]\\s*\\{\\s*background:\\s*${light}`));
  });
});
