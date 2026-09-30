import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTRAST_PAIRS, colorOf, type StyleName, type ThemeName, type TokenRole } from '@gisik-nokma/ui/tokens';
import { contrastRatio } from '../../../packages/ui/test/helpers/contrast.js';

/**
 * 9.500–9.502 — owner screenshot 2026-09-30 ~21:25: a wrapped long line in a note's code block
 * ran UNDER the Copy button ("horizon[Copy]tal") and the text showed through it.
 *
 * Cause, read: `.editor-codeblock__copy` is `position: absolute; top/right: 0.375rem` in
 * `editor.css`, the block reserved NO inline-end space for it, and the web skin painted the
 * button on `--gn-fill-tertiary`, an ALPHA fill. jsdom computes no layout, so these cases pin the
 * RULES that produce the geometry; the geometry itself (a text run never intersecting the
 * button's rect, at 1280px and 390px) is the browser cases 9.503–9.505.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_CSS = readFileSync(resolve(TEST_DIR, '../app/globals.css'), 'utf8');
const EDITOR_CSS = readFileSync(resolve(TEST_DIR, '../../../packages/editor/src/styles/editor.css'), 'utf8');

/** Comments BLANKED, so a `}` or a deleted rule discussed in prose cannot answer for a rule. */
function bare(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (hit) => ' '.repeat(hit.length));
}

/**
 * The body of the TOP-LEVEL rule whose selector LIST is exactly `selector` (a lone selector, not a
 * group; an arm inside an `@media` is a different rule and is skipped by brace depth).
 */
function bodyOf(css: string, selector: string): string {
  const text = bare(css);
  const hits = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((hit) => {
    const before = text.slice(0, hit.index);
    const depth = before.split('{').length - before.split('}').length;
    return depth === 0 && (hit[1] ?? '').split(',').map((part) => part.trim()).join(', ') === selector;
  });
  expect(hits, `exactly one rule for \`${selector}\``).toHaveLength(1);
  return hits[0]?.[2] ?? '';
}

function declaration(body: string, property: string): string | null {
  const hit = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+);`).exec(body);
  return hit ? (hit[1] ?? '').trim() : null;
}

const BLOCK = '.ticket-editor__content .editor-codeblock';
const COPY = '.ticket-editor__content .editor-codeblock__copy';
const WIDTH_VAR = '--gn-codeblock-copy-width';
const STYLES: StyleName[] = ['hig', 'minimal', 'neo'];
const THEMES: ThemeName[] = ['light', 'dark'];

describe('9.500 the code block reserves the Copy button on its inline end', () => {
  it('9.500 the gutter is derived from the button width var and the editor.css inset, after the padding shorthand', () => {
    const block = bodyOf(WEB_CSS, BLOCK);
    const copy = bodyOf(WEB_CSS, COPY);

    // The width is ONE declared value: the button takes it as a floor (so "Copy" -> "Copied" does
    // not change the box) and the block derives its gutter from the same var.
    const width = declaration(block, WIDTH_VAR);
    expect(width, `${WIDTH_VAR} on the block`).toMatch(/^\d+(\.\d+)?rem$/);
    // "Copied" at 0.75rem is ~2.5rem of glyphs + the button's 2 x 0.5rem padding.
    expect(Number.parseFloat(width ?? '0')).toBeGreaterThanOrEqual(4);
    expect(declaration(copy, 'min-width')).toBe(`var(${WIDTH_VAR})`);
    expect(declaration(copy, 'box-sizing')).toBe('border-box');

    // The button's inset is editor.css's `right`; the gutter must clear it AND leave 0.5rem air.
    const inset = declaration(bodyOf(EDITOR_CSS, '.editor-codeblock__copy'), 'right');
    expect(inset).toBe('0.375rem');
    expect(declaration(block, 'padding-inline-end')).toBe(`calc(var(${WIDTH_VAR}) + ${inset} + 0.5rem)`);

    // `padding-inline-end` must come AFTER the shorthand or the shorthand overwrites it.
    expect(block.indexOf('padding-inline-end')).toBeGreaterThan(block.indexOf('padding:'));

    // CONTROL (stays green when the padding line is removed): the rest of the block is unchanged,
    // and the button is still the block's corner child — a short one-line block keeps its corner.
    expect(declaration(block, 'padding')).toBe('0.75rem 1rem');
    const corner = bodyOf(EDITOR_CSS, '.editor-codeblock__copy');
    expect(declaration(corner, 'position')).toBe('absolute');
    expect(declaration(corner, 'top')).toBe('0.375rem');
    expect(declaration(bodyOf(EDITOR_CSS, '.editor-codeblock'), 'position')).toBe('relative');
  });

  it('9.501 the gutter is on the outer block, so a scrolling pre ends at the gutter edge and the button stays pinned', () => {
    const block = bodyOf(WEB_CSS, BLOCK);
    const pre = bodyOf(WEB_CSS, `${BLOCK} pre`);
    expect(declaration(block, 'padding-inline-end')).not.toBeNull();
    expect(pre).not.toMatch(/padding/);
    // The scroll lives on the inner pre; the outer block (the button's containing block) does not scroll.
    expect(block).not.toMatch(/overflow/);
    // CONTROL (stays green when the gutter moves onto the pre): overflow is still the pre's.
    expect(declaration(pre, 'overflow-x')).toBe('auto');
  });
});

/** `var(--gn-surface)` -> `surface`; `var(--gn-fill-tertiary)` -> `fillTertiary`. */
function roleOf(value: string | null): TokenRole {
  const name = /^var\(--gn-([a-z-]+)\)$/.exec(value ?? '')?.[1];
  expect(name, `background is one solid \`var(--gn-*)\` token, got ${value}`).toBeDefined();
  return (name ?? '').replace(/-([a-z])/g, (_all, letter: string) => letter.toUpperCase()) as TokenRole;
}

describe('9.502 the Copy button has an opaque ground and keeps 4.5:1 ink in every style × theme', () => {
  it('9.502 background is a solid role (7-digit hex everywhere), text on it is a declared >=4.5 pair and measures >=4.5', () => {
    const copy = bodyOf(WEB_CSS, COPY);
    const role = roleOf(declaration(copy, 'background'));

    // An ALPHA role (the fill hierarchy) is 9 digits; a solid ground is 7 in all six combinations.
    for (const style of STYLES) {
      for (const theme of THEMES) {
        expect(colorOf(theme, role, style), `${style}/${theme}: ${role}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
    expect(CONTRAST_PAIRS.some((pair) => pair.fg === 'text' && pair.bg === role && pair.minimum >= 4.5)).toBe(true);
    for (const style of STYLES) {
      for (const theme of THEMES) {
        expect(
          contrastRatio(colorOf(theme, 'text', style), colorOf(theme, role, style)),
          `${style}/${theme}: text on ${role}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    // The chip's edge is the house border line (a solid ground alone would vanish into the block).
    expect(declaration(copy, 'border')).toBe('1px solid var(--gn-border)');

    // CONTROL (stays green when the fill is restored): the ink is still the existing `--gn-text`.
    expect(declaration(copy, 'color')).toBe('var(--gn-text)');
  });
});
