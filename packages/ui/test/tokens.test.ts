import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers/colour-scan.js';
import { over } from './helpers/contrast.js';
import {
  CONTRAST_PAIRS,
  SHADOW_ROLES,
  TOKEN_ROLES,
  colorOf,
  cssVariableName,
  disabledOpacity,
  disabledOpacityVariableName,
  fontStackOf,
  fontVariableName,
  motionVariableName,
  spaceVariableName,
  primitives,
  radiusVariableName,
  shadowValueOf,
  shadowVariableName,
  themeStylesheet,
  themes,
  titleScale,
  titleVariableName,
  type FontRole,
  type StyleName,
  type ThemeName,
  type TokenRole,
} from '../src/tokens.js';

const THEME_NAMES: ThemeName[] = ['light', 'dark'];
const STYLE_NAMES: StyleName[] = ['hig', 'minimal', 'neo'];
/**
 * Round 3 fix round 1 (2026-09-16, case 13.411): this used to be a SECOND,
 * hand-maintained `ShadowRole[]` literal, unlinked from `tokens.ts`'s own
 * `SHADOW_ROLES` — a role added to one and forgotten in the other would stay
 * invisible to every test in this file (F5 of the coordinator review). Now a
 * direct re-export of the source array, so the two literally cannot diverge:
 * the "declared" set below is built from the same array `themeStylesheet()`
 * emits from.
 */
const SHADOW_ROLE_NAMES = SHADOW_ROLES;
const FONT_ROLE_NAMES: FontRole[] = ['sans', 'mono'];

/** `hig` needs no `[data-style]` predicate — it is the unmarked base, reached through bare `:root`/`[data-theme]`. */
function styleSelectorPredicate(style: StyleName): string {
  return style === 'hig' ? '' : `[data-style="${style}"]`;
}

/** WCAG channel luminance from one `rr`/`gg`/`bb` hex pair. */
function channelLuminance(pair: string): number {
  const srgb = Number.parseInt(pair, 16) / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance from a #rrggbb (or #rrggbbaa — alpha ignored) hex literal. */
function relativeLuminance(hex: string): number {
  return (
    0.2126 * channelLuminance(hex.slice(1, 3)) +
    0.7152 * channelLuminance(hex.slice(3, 5)) +
    0.0722 * channelLuminance(hex.slice(5, 7))
  );
}

function contrastRatio(colorA: string, colorB: string): number {
  const luminanceA = relativeLuminance(colorA);
  const luminanceB = relativeLuminance(colorB);
  const brighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (brighter + 0.05) / (darker + 0.05);
}

describe('token structure', () => {
  it('every primitive is a hex literal', () => {
    for (const [name, value] of Object.entries(primitives)) {
      expect(value, `primitive ${name}`).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
    }
  });

  it('every role in both themes resolves to a declared primitive', () => {
    for (const theme of THEME_NAMES) {
      for (const role of TOKEN_ROLES) {
        const primitiveName = themes[theme][role];
        expect(primitives[primitiveName], `${theme}.${role}`).toBeDefined();
        expect(colorOf(theme, role)).toBe(primitives[primitiveName]);
      }
    }
  });
});

/**
 * 13.337-adjacent: every style now resolves its own surface/fill primitives
 * (the neo-round ruling), so this loop gained a STYLE dimension 2026-09-09 —
 * previously `hig` was the only style and this suite could not have caught
 * `minimal`/`neo` breaking a declared pair.
 */
/**
 * 15.26 — the third dim text role (`textSubtle`) clears 4.5:1 on every surface, in every style AND theme. Covered by this loop at runtime, which is why all THREE rows (surface / surfaceRaised / surfaceSunken) were declared and not just the one `/help` uses — the loop only checks what the array declares.
 */
describe('declared contrast pairs meet their minimums (the base test case 1.1, reborn)', () => {
  for (const style of STYLE_NAMES) {
    for (const theme of THEME_NAMES) {
      for (const pair of CONTRAST_PAIRS) {
        it(`${style}/${theme}: ${pair.fg} on ${pair.bg} ≥ ${pair.minimum}`, () => {
          const ratio = contrastRatio(colorOf(theme, pair.fg, style), colorOf(theme, pair.bg, style));
          expect(ratio).toBeGreaterThanOrEqual(pair.minimum);
        });
      }
    }
  }
});

describe('CSS variable emission', () => {
  it('kebab-cases role names under the --gn prefix', () => {
    expect(cssVariableName('surface')).toBe('--gn-surface');
    expect(cssVariableName('surfaceRaised')).toBe('--gn-surface-raised');
    expect(cssVariableName('categoryTerminal')).toBe('--gn-category-terminal');
  });

  it('ships light as the default, dark by explicit choice, dark by OS preference when unchosen', () => {
    const stylesheet = themeStylesheet();
    expect(stylesheet).toContain(`:root { --gn-surface: ${colorOf('light', 'surface')};`);
    expect(stylesheet).toContain(`[data-theme="dark"] { --gn-surface: ${colorOf('dark', 'surface')};`);
    expect(stylesheet).toContain('@media (prefers-color-scheme: dark)');
    expect(stylesheet).toContain(':root:not([data-theme="light"])');
  });

  /**
   * The gap between the two halves of the discipline, and the one nothing was
   * watching. `token-discipline.test.ts` proves no COLOUR LITERAL is written
   * outside this file; nothing proved that a `var(--gn-…)` written instead
   * names a role that exists. A typo — `var(--gn-custom-marker-)`, or a role
   * renamed in `TOKEN_ROLES` with `ui.css` left behind — resolves to nothing
   * and the element inherits, so the component renders, the suite stays green,
   * and the colour is simply gone. Measured: adding `--gn-nonexistent` to
   * ui.css reddens this and no other test in the repo.
   */
  it('23.070 the type scale is emitted once per step in the bare :root block, as the six --gn-title-* variables', () => {
    const sheet = themeStylesheet();
    const bare = /^:root \{([^}]*)\}/m.exec(sheet)?.[1] ?? '';
    expect(bare.length).toBeGreaterThan(0);
    for (const step of Object.keys(titleScale) as Array<keyof typeof titleScale>) {
      expect(bare).toContain(`${titleVariableName(step)}: ${titleScale[step].size};`);
      expect(bare).toContain(`${titleVariableName(step, true)}: ${titleScale[step].phone};`);
      expect(sheet.split(`${titleVariableName(step)}:`).length - 1).toBe(1);
    }
    // CONTROL (same it): the names are the six the stylesheet rules read.
    expect(Object.keys(titleScale).map((step) => titleVariableName(step as keyof typeof titleScale))).toEqual([
      '--gn-title-page',
      '--gn-title-section',
      '--gn-title-group',
    ]);
  });

  it('every var(--gn-…) in ui.css names a declared role', () => {
    const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
    const referenced = [...new Set([...css.matchAll(/var\((--gn-[a-z0-9-]*)\)/g)].map((hit) => hit[1]))];
    const declared = new Set<string>([
      ...TOKEN_ROLES.map(cssVariableName),
      radiusVariableName('card'),
      radiusVariableName('control'),
      radiusVariableName('track'),
      ...SHADOW_ROLE_NAMES.map(shadowVariableName),
      ...FONT_ROLE_NAMES.map(fontVariableName),
      ...([1, 2, 3] as const).map(spaceVariableName),
      // The prose measure (case 23.043) is declared once in the bare :root block, beside the spacing tokens.
      '--gn-measure',
      // The type scale (case 23.070) is declared once in the bare :root block too: three steps, each with a phone step.
      ...(Object.keys(titleScale) as Array<keyof typeof titleScale>).flatMap((step) => [titleVariableName(step), titleVariableName(step, true)]),
      ...(['feedback', 'move', 'lift', 'done', 'ease-out'] as const).map(motionVariableName),
      // The phone bar / top-bar heights (case 21.003) are declared once in the bare :root block, not as colour roles.
      '--gn-phone-bar-height',
      '--gn-phone-top-height',
      // The one disabled opacity (UX fixes T6, 23.094) is a bare :root declaration like the phone heights.
      disabledOpacityVariableName,
      // `.gn-scroll-fade` (23.092) declares its own three variables on itself and reads them in the same rule family.
      '--gn-scroll-fade-size',
      '--gn-fade-from',
      '--gn-fade-to',
    ]);
    expect(referenced.filter((name) => name !== undefined && !declared.has(name))).toEqual([]);
    // The walk really read a stylesheet that uses variables — an empty match
    // list would pass the assertion above by finding nothing at all.
    expect(referenced.length).toBeGreaterThan(10);
    // And the role Plan 9 Task 9 added is actually reached from the CSS, not
    // merely declared in TypeScript.
    expect(referenced).toContain('--gn-custom-marker');
    expect(themeStylesheet()).toContain(`--gn-custom-marker: ${colorOf('light', 'customMarker')};`);
  });

  /**
   * 23.094 — the token's VALUE. Every other 23.094 check reads only `var(--gn-disabled-opacity)`, so `0.55` would pass them
   * all; this is the one place the number is pinned, and where it is emitted.
   */
  it('23.094 --gn-disabled-opacity is 0.5, emitted exactly once, in the bare :root block', () => {
    expect(disabledOpacity).toBe('0.5');
    const stylesheet = themeStylesheet();
    const declaration = `${disabledOpacityVariableName}: 0.5;`;
    expect(stylesheet.split(declaration)).toHaveLength(2); // exactly once
    const at = stylesheet.indexOf(declaration);
    const block = stylesheet.slice(stylesheet.lastIndexOf('}', at) + 1, stylesheet.indexOf('}', at) + 1).trim();
    expect(block.startsWith(':root {')).toBe(true); // the bare :root, not a themed or media-wrapped one
    // CONTROL — the bare :root is the block that also carries the phone heights, not a different :root.
    expect(block).toContain('--gn-phone-bar-height');
  });

  /**
   * 15.28 — the typefaces are emitted, and emitted ONCE. Before this the
   * product named a font in exactly one place (`apps/web/app/globals.css`), so
   * `apps/desktop`, which loads `ui.css` alone, painted in the browser's
   * default serif. `installTheme` already carries this output into that window,
   * which is why the cure is an emission and not a second stylesheet.
   *
   * The count assertion is the load-bearing half: fonts are invariant across
   * both axes and live OUTSIDE `declarationsFor` for that reason. Moving them
   * inside it would still satisfy a `toContain`, and would silently produce six
   * copies free to diverge one edit later. Mutation: emit them from
   * `declarationsFor` → this reds on the count, naming the actual mistake.
   */
  it('15.28 emits each font stack exactly once, under the bare :root', () => {
    const stylesheet = themeStylesheet();
    for (const role of FONT_ROLE_NAMES) {
      const declaration = `${fontVariableName(role)}: ${fontStackOf(role)};`;
      expect(stylesheet).toContain(declaration);
      expect(stylesheet.split(declaration).length - 1, `${role} should be declared once, not per style×theme`).toBe(1);
    }
    // Reached from the bare `:root`, so it applies with neither axis marked —
    // the state the desktop shell is in, having no style or theme toggle.
    expect(stylesheet.startsWith(':root { --gn-font-')).toBe(true);
  });

  /**
   * 15.29 — the mono stack is actually REFERENCED. `--gn-font-sans` is reached
   * from each app's own base rule (outside this package), but the mono face has
   * exactly one consumer and it is in this file's own stylesheet; without this,
   * deleting `font-family` from `.gn-help__code` would leave inline code back
   * on the UA's default monospace with every test still green.
   */
  it('15.29 ui.css sets inline code in the mono stack', () => {
    const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
    const rule = css.match(/\.gn-help__code \{[^}]*\}/)?.[0] ?? '';
    expect(rule).not.toBe('');
    expect(rule).toContain(`font-family: ${`var(${fontVariableName('mono')})`}`);
  });
});

describe('the style axis (Task 14, 2026-09-09)', () => {
  /**
   * 13.337 — every token role has a value for every (style × theme), and it
   * reaches `themeStylesheet()`'s output under the right selector. Mutation:
   * drop one style×theme combination from the emitted stylesheet → RED
   * naming that combination (not a generic "something changed").
   */
  it('every role appears under every style×theme selector in themeStylesheet()', () => {
    const stylesheet = themeStylesheet();
    for (const style of STYLE_NAMES) {
      for (const theme of THEME_NAMES) {
        for (const role of TOKEN_ROLES) {
          const declaration = `${cssVariableName(role)}: ${colorOf(theme, role, style)};`;
          expect(
            stylesheet,
            `${style}/${theme}/${role} — expected "${declaration}" under a selector combining ${styleSelectorPredicate(style) || '(bare :root)'} and ${theme === 'dark' ? '[data-theme="dark"] (or its OS-preference arm)' : '(unmarked light)'}`,
          ).toContain(declaration);
        }
      }
    }
  });

  it('the OS-dark arm exists for every non-hig style, not only hig', () => {
    const stylesheet = themeStylesheet();
    for (const style of ['minimal', 'neo'] as const) {
      expect(stylesheet).toContain(`[data-style="${style}"]:not([data-theme="light"])`);
      expect(stylesheet).toContain(`[data-style="${style}"][data-theme="dark"]`);
    }
  });

  /**
   * 13.338 — every shadow layer colour is an alpha primitive (8-digit hex),
   * and `CONTRAST_PAIRS` names none of them — `relativeLuminance` ignores
   * alpha, so a declared row on one would be exactly the false-green mode
   * the fill primitives' own docblock warns against. Mutation: add a
   * `CONTRAST_PAIRS` row naming a `shadow*` primitive → this reddens.
   */
  it('every shadow colour is an 8-digit alpha primitive named by no CONTRAST_PAIRS row', () => {
    const shadowPrimitiveNames = Object.keys(primitives).filter((name) => name.startsWith('shadow'));
    expect(shadowPrimitiveNames.length).toBeGreaterThan(0);
    for (const name of shadowPrimitiveNames) {
      const value = primitives[name as keyof typeof primitives];
      expect(value, name).toMatch(/^#[0-9a-f]{6}[0-9a-f]{2}$/);
    }
    // `Set<string>`, explicitly — without the annotation TS infers the
    // literal-union element type from `primitives`' `as const` shape, and
    // `.has()` then refuses `colorOf(...)`'s plain `string` return (it can
    // resolve to ANY role's primitive, across three styles now, not only the
    // ones whose literal types this Set happens to carry). A real mismatch
    // (e.g. comparing numbers) still fails at `.has()`'s call site either way.
    const shadowPrimitiveValues = new Set<string>(
      shadowPrimitiveNames.map((name) => primitives[name as keyof typeof primitives]),
    );
    for (const style of STYLE_NAMES) {
      for (const theme of THEME_NAMES) {
        for (const pair of CONTRAST_PAIRS) {
          expect(shadowPrimitiveValues.has(colorOf(theme, pair.fg, style))).toBe(false);
          expect(shadowPrimitiveValues.has(colorOf(theme, pair.bg, style))).toBe(false);
        }
      }
    }
  });

  it('shadowValueOf renders "none" where a style×theme has no layers, and a real box-shadow otherwise', () => {
    for (const theme of THEME_NAMES) {
      for (const role of SHADOW_ROLE_NAMES) {
        expect(shadowValueOf('minimal', theme, role)).toBe('none');
      }
    }
    expect(shadowValueOf('hig', 'light', 'sunken')).toBe('none');
    expect(shadowValueOf('hig', 'light', 'raised')).not.toBe('none');
    expect(shadowValueOf('neo', 'light', 'sunken')).toContain('inset');
    // `sunken-compact` — owner round 3 (2026-09-16): `hig`/`minimal` stay `[]`
    // (the prototype's `--chipShadow:none`), `neo` is a real inset pair, and
    // it must be a SMALLER box-shadow than `sunken`, not just a different one
    // — the whole point of the correction was the geometry, not the colour.
    expect(shadowValueOf('hig', 'light', 'sunken-compact')).toBe('none');
    expect(shadowValueOf('neo', 'light', 'sunken-compact')).toContain('inset');
    expect(shadowValueOf('neo', 'light', 'sunken-compact')).toContain('2px 2px 4px');
    expect(shadowValueOf('neo', 'dark', 'sunken-compact')).toContain('2px 2px 4px');
    expect(shadowValueOf('neo', 'light', 'sunken-compact')).not.toBe(shadowValueOf('neo', 'light', 'sunken'));
    expect(shadowValueOf('neo', 'dark', 'sunken-compact')).not.toBe(shadowValueOf('neo', 'dark', 'sunken'));
    // Pinned full values, not just shape: the `toContain` checks above would
    // stay green even if a future edit swapped in the WRONG reused primitive
    // (e.g. `shadowNeoSunkenDarkLight` for `shadowNeoRaisedDarkLight`) —
    // still inset, still 2px/2px/4px, still a different string than
    // `sunken`, but the wrong rendered colour. These two lock the exact
    // layer colours the prototype's `--chipShadow` measures to (see
    // `shadowNeoSunkenCompactDarkDark`'s docblock in tokens.ts for the
    // rgba→hex arithmetic).
    expect(shadowValueOf('neo', 'light', 'sunken-compact')).toBe(
      'inset 2px 2px 4px #b098848c, inset -2px -2px 4px #fffffff2',
    );
    expect(shadowValueOf('neo', 'dark', 'sunken-compact')).toBe(
      'inset 2px 2px 4px #0000008c, inset -2px -2px 4px #ffffff0d',
    );
  });

  /**
   * 13.347 — the positive control the axis needs: switching style changes a
   * WITNESSED RENDERED value, not just two numbers that happen to differ in
   * memory. Both `hig` and `neo`'s `raised` box-shadow must appear in
   * `themeStylesheet()`'s own output, under their own declaration — reusing
   * 13.337's machinery — and the two values must differ. 13.337 only proves
   * every combination is PRESENT; it says nothing about whether any two of
   * them are actually different, which is exactly the gap a style axis that
   * silently did nothing would hide in.
   *
   * Mutation: make `SHADOWS.neo[theme].raised` identical to
   * `SHADOWS.hig[theme].raised` → the inequality assertion reddens, alone.
   */
  it('13.347 switching style changes a rendered value — hig and neo emit different raised box-shadows', () => {
    const stylesheet = themeStylesheet();
    for (const theme of THEME_NAMES) {
      const higValue = shadowValueOf('hig', theme, 'raised');
      const neoValue = shadowValueOf('neo', theme, 'raised');
      expect(neoValue, `${theme}: hig and neo must not render the same "raised" box-shadow`).not.toBe(higValue);
      expect(stylesheet).toContain(`${shadowVariableName('raised')}: ${higValue};`);
      expect(stylesheet).toContain(`${shadowVariableName('raised')}: ${neoValue};`);
    }
  });

  /**
   * 13.411 — closes the gap the coordinator review's F5 named: `SHADOW_ROLES`
   * (`tokens.ts`, the array `declarationsFor` actually emits from) and the
   * test file's own role list were two independent arrays with NOTHING
   * cross-checking them. 13.337 iterates `TOKEN_ROLES` only (colours, no
   * shadows) and 13.347 pins `raised` alone — so had `sunken-compact` been
   * left out of `SHADOW_ROLES` (the emission list) while still present in
   * `ShadowRole`/`SHADOWS`/the test file's own role list, every existing case
   * would have stayed green while `--gn-shadow-sunken-compact` never reached
   * the stylesheet and the chip/badge's `box-shadow` resolved to nothing in
   * the browser.
   *
   * DELIBERATELY NOT built from `SHADOW_ROLE_NAMES`/`SHADOW_ROLES` — now that
   * `SHADOW_ROLE_NAMES` above is a direct re-export of `tokens.ts`'s own
   * array (good for the "declared" set above, which should track it), a test
   * that iterated the SAME reference could never observe a role vanishing
   * from it: the loop would just silently shrink with the array and pass.
   * This hardcodes the expected role list as its own literal instead, so a
   * role dropped from `SHADOW_ROLES` is still EXPECTED here and the mismatch
   * is what fails.
   *
   * Mutation, performed and reverted live to capture the failure text below
   * verbatim (not invented): dropping `'sunken-compact'` from `SHADOW_ROLES`
   * in `tokens.ts` and running `vitest run -t 13.411` failed exactly 1 test
   * (the loop's `toContain` throws on the FIRST missing declaration and stops
   * there — it does not continue on to fail once per style×theme):
   *
   *   FAIL  test/tokens.test.ts > the style axis (Task 14, 2026-09-09) >
   *   13.411 every declared shadow role reaches the emitted stylesheet
   *   AssertionError: hig/light/sunken-compact — expected declaration
   *   "--gn-shadow-sunken-compact: none;" in themeStylesheet()'s output:
   *   expected ':root { --gn-font-sans: -apple-system…' to contain
   *   '--gn-shadow-sunken-compact: none;'
   *   Tests  1 failed | 304 skipped (305)
   *
   * `hig`/`light` is first in loop order, which is why the FIRST missing
   * declaration named is `none` rather than the neo inset geometry — every
   * style×theme's `sunken-compact` line was in fact absent from the emitted
   * stylesheet, confirmed by reading the "Received" stylesheet dump in the
   * same failure: it lists `--gn-shadow-raised`/`--gn-shadow-sunken`/
   * `--gn-shadow-overlay` for every block and `--gn-shadow-sunken-compact`
   * nowhere. Reverted immediately after capture (`SHADOW_ROLES` restored from
   * a pre-mutation copy, then `packages/ui`'s full suite re-run green).
   */
  it('13.411 every declared shadow role reaches the emitted stylesheet', () => {
    // A literal, not an import — see the docblock above for why.
    // `'selected'` added owner round 5 (2026-09-16, case 13.412) — this
    // literal does NOT track `SHADOW_ROLES` automatically (that is the whole
    // point, see the docblock above), so a role added to `SHADOWS`/`ShadowRole`
    // without a matching addition HERE stays uncovered by this case, silently.
    // The nine styling-refresh roles added 2026-09-29 (Plan A Task 2, 20.012; lift-drag for Task 5A) — added HERE by hand, which is the point of this literal.
    const EXPECTED_SHADOW_ROLES = ['raised', 'sunken', 'overlay', 'sunken-compact', 'selected', 'lift', 'lift-near', 'lift-press', 'lift-drag', 'track', 'action', 'action-near', 'action-press', 'sheet'] as const;
    const stylesheet = themeStylesheet();
    for (const style of STYLE_NAMES) {
      for (const theme of THEME_NAMES) {
        for (const role of EXPECTED_SHADOW_ROLES) {
          const declaration = `${shadowVariableName(role)}: ${shadowValueOf(style, theme, role)};`;
          expect(
            stylesheet,
            `${style}/${theme}/${role} — expected declaration "${declaration}" in themeStylesheet()'s output`,
          ).toContain(declaration);
        }
      }
    }
  });

  /**
   * 13.412 — owner round 5 (2026-09-16), the `selected` shadow role: the
   * prototype's `--segOnShadow`, RAISED under `hig`, `none` under `minimal`,
   * INSET under `neo` — see `ShadowRole`'s own docblock in `tokens.ts` for
   * the per-line citations. Pinned as exact strings, not just shape, for the
   * same reason 13.411's own sibling case in `tokens.ts` gives:
   * `toContain('inset')` alone would stay green even if a future edit swapped
   * in a wrong-but-still-inset primitive.
   *
   * `hig`'s two themes are asserted to be ASYMMETRIC on purpose — light has
   * two layers, dark has one — matching the export exactly rather than
   * assuming symmetry every other role in this table happens to have.
   *
   * Mutation, performed and reverted live: temporarily dropping `'selected'`
   * from `SHADOW_ROLES` in `tokens.ts` (leaving `ShadowRole`/`SHADOWS`
   * untouched) reddened this exact case with
   * `AssertionError: hig/light/selected — expected declaration
   * "--gn-shadow-selected: 0px 3px 8px #273a6329, 0px 3px 1px #273a630f;" in
   * themeStylesheet()'s output`, confirming 13.411 (with `'selected'` added
   * to its own hardcoded `EXPECTED_SHADOW_ROLES`) actually catches a missed
   * emission for this role rather than merely being extended to look like it
   * does. `SHADOW_ROLES` restored immediately after capture, full suite
   * re-run green before this case was written down.
   */
  it('13.412 selected is pinned to the prototype\'s --segOnShadow, exactly, per style×theme', () => {
    expect(shadowValueOf('hig', 'light', 'selected')).toBe('0px 3px 8px #273a6329, 0px 3px 1px #273a630f');
    expect(shadowValueOf('hig', 'dark', 'selected')).toBe('0px 3px 8px #060a16a8');
    expect(shadowValueOf('minimal', 'light', 'selected')).toBe('none');
    expect(shadowValueOf('minimal', 'dark', 'selected')).toBe('none');
    expect(shadowValueOf('neo', 'light', 'selected')).toBe(
      'inset 3px 3px 6px #b098848c, inset -3px -3px 6px #fffffff2',
    );
    expect(shadowValueOf('neo', 'dark', 'selected')).toBe(
      'inset 3px 3px 6px #0000008c, inset -3px -3px 6px #ffffff0d',
    );
    // Discriminating checks beyond the exact strings above: `hig` is a real
    // (non-'none') drop shadow with no `inset`, `neo` is `inset` and a
    // DIFFERENT geometry than both `sunken` (4px/4px/9px) and
    // `sunken-compact` (2px/2px/4px) — the whole reason this role exists
    // rather than reusing either.
    expect(shadowValueOf('hig', 'light', 'selected')).not.toContain('inset');
    expect(shadowValueOf('hig', 'light', 'selected')).not.toBe('none');
    expect(shadowValueOf('neo', 'light', 'selected')).toContain('inset');
    expect(shadowValueOf('neo', 'light', 'selected')).toContain('3px 3px 6px');
    expect(shadowValueOf('neo', 'light', 'selected')).not.toContain('4px 4px 9px');
    expect(shadowValueOf('neo', 'light', 'selected')).not.toContain('2px 2px 4px');
    expect(shadowValueOf('neo', 'dark', 'selected')).toContain('3px 3px 6px');
    expect(shadowValueOf('neo', 'dark', 'selected')).not.toContain('4px 4px 9px');
    expect(shadowValueOf('neo', 'dark', 'selected')).not.toContain('2px 2px 4px');
  });
});

/**
 * 13.341 — dark theme, per style: `surface`, `surfaceRaised` and
 * `surfaceSunken` separate from one another by FILL (rule (c): dark
 * separates by fill, measured; a shadow does not count toward separation
 * there) — for `hig`/`minimal`. Every floor below is a LITERAL pinned from
 * Task 13's report / the neo-round ruling — never a value derived from the
 * same `colorOf` call the assertion reads, which would make the test
 * unable to fail.
 *
 * **`neo` is EXEMPT from rule (c) in BOTH themes now, not only light**
 * (owner, 2026-09-10: "revert to prototype's exact dark hex"). It used to
 * carry a narrower `1.20` floor in dark (`tokens.ts`'s `neoNavyRaised`
 * docblock has the full history: lightening `neoNavy` far enough to clear
 * hig/minimal's own `1.214` floor pushed the THEN-bare `accent` role below
 * 4.5 as text against it — a real collision at the time). That collision
 * stopped binding the same day it was written, once `accent` split into
 * `accent` (fill-only) and `textAccent` (the actually-derived text role);
 * with `neoNavyRaised`/`neoNavySunken` reverted to `neoNavy`, holding dark
 * to ANY separation floor while light already gets `neoPaper` — one hex,
 * zero separation, depth from shadow alone — was the inconsistency. `neo`'s
 * visual language is shadow-first depth in both themes.
 *
 * Mutation: reintroduce `neo` into `DARK_SEPARATION_FLOORS` with any floor
 * above `1.0` → reddens, naming the exact regression this exemption guards
 * against (`neoNavySunken` drifting away from `neoNavy` again without updating
 * this test to match).
 *
 * **Amended UX T1 (owner U8, 2026-10-02; 23.006): `neoNavyRaised` is the one
 * dark neo surface that DID step**, `#1b2340` → `#232c50` (1.14 off the page),
 * so the neo/dark case below no longer says raised is the SAME hex. It still
 * pins that depth is mostly shadow (sunken stays the surface hex) and the step
 * is pinned as a literal so a drift reddens here.
 */
describe('13.341 dark-theme fill separation per style (rule (c))', () => {
  const DARK_SEPARATION_FLOORS: Record<'hig' | 'minimal', { surfaceRaised: number; surfaceSunken: number; raisedSunken: number }> = {
    hig: { surfaceRaised: 1.21, surfaceSunken: 1.45, raisedSunken: 1.2 },
    minimal: { surfaceRaised: 1.21, surfaceSunken: 1.45, raisedSunken: 1.2 },
  };

  for (const style of ['hig', 'minimal'] as const) {
    it(`${style}/dark: surface, raised and sunken separate by at least the recorded floor`, () => {
      const surface = colorOf('dark', 'surface', style);
      const raised = colorOf('dark', 'surfaceRaised', style);
      const sunken = colorOf('dark', 'surfaceSunken', style);
      const floor = DARK_SEPARATION_FLOORS[style];
      expect(contrastRatio(surface, raised), `${style} surface↔raised`).toBeGreaterThanOrEqual(floor.surfaceRaised);
      expect(contrastRatio(surface, sunken), `${style} surface↔sunken`).toBeGreaterThanOrEqual(floor.surfaceSunken);
      expect(contrastRatio(raised, sunken), `${style} raised↔sunken`).toBeGreaterThanOrEqual(floor.raisedSunken);
    });
  }

  it('neo/dark: surface and surfaceSunken are the SAME hex; surfaceRaised steps to #232c50 (U8, 23.006) — depth is shadow first, fill second', () => {
    const surface = colorOf('dark', 'surface', 'neo');
    const raised = colorOf('dark', 'surfaceRaised', 'neo');
    const sunken = colorOf('dark', 'surfaceSunken', 'neo');
    expect(raised).toBe('#232c50');
    expect(raised).not.toBe(surface);
    expect(sunken).toBe(surface);
  });
});

/**
 * The two places the HIG adoption did NOT follow Apple, each pinned against the
 * tidy-up that would undo it.
 *
 * Both are cases where the obvious "finish the job" edit — use Apple's green,
 * reunite two greys that look alike — reintroduces a measured failure. Neither
 * is visible from reading the palette: the values look reasonable, and the harm
 * is a ratio you have to compute against a specific background.
 */
describe('HIG adoption — the deliberate departures', () => {
  /**
   * 13.281 — `success` is NOT Apple's increased-contrast green, and swapping it in is measurably why.
   *
   * `docs/hig-adoption-brief.md` §8 records `#248A3D` as the Apple value and
   * notes it is the ONE pair in the whole roster that still fails. The owner
   * ruled on 2026-09-08 to keep the incumbent. This asserts the ARITHMETIC
   * behind that ruling rather than the ruling itself, so the day someone
   * "completes" the palette the failure arrives as a red test naming the pair,
   * not as a shipped 4.1233.
   */
  it('keeps green700 because Apple’s increased-contrast green fails successText at 4.1233', () => {
    expect(primitives.green700).toBe('#1e7a34');
    const shipped = contrastRatio(colorOf('light', 'successText'), colorOf('light', 'success'));
    expect(shipped).toBeGreaterThanOrEqual(4.5);
    // The counterfactual, computed rather than quoted: Apple's value against
    // the same foreground this palette actually puts on it.
    const appleGreen = '#248a3d';
    const withApple = contrastRatio(colorOf('light', 'successText'), appleGreen);
    expect(withApple).toBeLessThan(4.5);
    // Owner round 4 (2026-09-16): `successText` moved off pure `white` to the
    // prototype's warm `onColorWarmLight` (`#fbf7f3`), which is darker than
    // `#ffffff` — so this counterfactual against Apple's green moved too
    // (4.40 → 4.12). Re-measured, not assumed; still clears "less than 4.5".
    expect(withApple).toBeCloseTo(4.1233, 3);
  });

  /**
   * 13.282 — `textMuted` and `categoryOpen` must NOT resolve to the same primitive, because one grey cannot hold both jobs.
   *
   * They shared `inkMuted` before the HIG adoption, which is exactly the shape
   * that invites reuniting them again. Apple's accessible grey `#6C6C70` is the
   * right answer for a chip dot (3:1) and the WRONG one for read text: it
   * measures **4.16 on `surfaceSunken`** against the 4.5 that pair demands, and
   * `textMuted on surfaceSunken` is a declared pair precisely because
   * `/mcp/tokens` puts muted text on a sunken row.
   *
   * The second assertion is the load-bearing one — the first would still pass if
   * both roles were pointed at a grey that happened to satisfy neither job well.
   */
  it('splits the status-dot grey from the muted-text grey, and the dot grey would fail the text job', () => {
    expect(themes.light.textMuted).not.toBe(themes.light.categoryOpen);
    expect(themes.dark.textMuted).not.toBe(themes.dark.categoryOpen);
    // Why they cannot be reunited on the dot's grey.
    const dotGrey = colorOf('light', 'categoryOpen');
    expect(contrastRatio(dotGrey, colorOf('light', 'surfaceSunken'))).toBeLessThan(4.5);
    // And that the grey actually carrying the text job clears it.
    expect(
      contrastRatio(colorOf('light', 'textMuted'), colorOf('light', 'surfaceSunken')),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * The control affordance after R1(c), asserted at the token level because that
 * is where the two candidate signals can be computed exactly.
 */
describe('a control without a boundary — which signal identifies it', () => {
  /**
   * 13.284 — the fill does NOT carry identification and the label does, and the case asserts both halves.
   *
   * Ruling R1(c) removes the boundary from non-primary controls, and the
   * controller's ruling of 2026-09-08 explicitly declined to assert whether
   * what replaces it satisfies WCAG 1.4.11 — *"that is a reading, not a
   * measurement, and it is not mine to assert into your case text."* So the
   * measurement lives here and the reading lives in the catalogue.
   *
   * **Both halves are asserted, and the first is the one that would be tempting
   * to omit.** A test that only checked the label passes just as well in a world
   * where someone has quietly given the fill a 3:1 value and changed what the
   * control means — and, more importantly, it would let a reader believe the
   * fill was doing work it is not. The fill is asserted to be BELOW 3:1
   * precisely so the case states the uncomfortable half of its own conclusion.
   *
   * **`accent` → `textAccent`, Round 2d (2026-09-09).** This case originally
   * read `colorOf(theme, 'accent')`, because `.gn-button--ghost`'s label was
   * `var(--gn-accent)` at the time. `ui.css` now sets that label to
   * `var(--gn-text-accent)` (see `TOKEN_ROLES`'s `textAccent` docblock for why
   * the split exists), so the role this case measures moved with the CSS it
   * pins — checking `accent` here would now be testing a colour nothing on
   * screen actually uses for this label.
   */
  it('identifies a non-primary control by its label, not its fill — and says so in both directions', () => {
    /** `src` over `dst` — the compositing `relativeLuminance` deliberately lacks. */
    const over = (src: string, dst: string): string => {
      const hex = (h: string, i: number): number => Number.parseInt(h.slice(i, i + 2), 16);
      const alpha = src.length === 9 ? hex(src, 7) / 255 : 1;
      const channel = (i: number): number =>
        Math.round(hex(src, i) * alpha + hex(dst, i) * (1 - alpha));
      return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
    };

    for (const theme of THEME_NAMES) {
      const surface = colorOf(theme, 'surface');
      const filled = over(colorOf(theme, 'fillTertiary'), surface);

      // (1) The fill cannot be the identifying signal. Stated as an assertion
      // rather than left implicit, because it is the half a reader would
      // otherwise assume went the other way.
      expect(
        contrastRatio(filled, surface),
        `${theme}: the tertiary fill is being treated as the thing that identifies a control`,
      ).toBeLessThan(3);

      // (2) The label is, and it clears the 4.5 it owes as TEXT — which is more
      // than the 3:1 1.4.11 asks of a non-text identifier.
      expect(
        contrastRatio(colorOf(theme, 'textAccent'), filled),
        `${theme}: the textAccent label on a filled control no longer clears 4.5`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/**
 * `tintWarning` — the invitation banner's wash (2026-09-15). Case 13.403
 * (test-cases/13-deployment-dogfooding.md), minted by the workspaces-
 * prototype-port plan's Task 10 — left uncased when this block was written,
 * since Task 1 had no visibility into numbers concurrent work might claim.
 *
 * It is ALPHA, so no `CONTRAST_PAIRS` row may name it (`tokens.ts:228`):
 * `relativeLuminance` ignores alpha, and a declared pair would measure the
 * tint's own colour against a background it is actually blended INTO. The
 * obligation is against the COMPOSITE, which is what this block measures —
 * the same shape as the `fillTertiary` accent-on-filled check above.
 *
 * The banner sits at page level, so its ground is `surface` and only
 * `surface`. If it is ever nested inside a card, this check is measuring the
 * wrong ground and must gain the `surfaceRaised` composite too.
 *
 * ## SECOND CONSUMER (2026-09-18) — the attention strip, and why this block is unchanged
 *
 * `tintWarning` stopped being a single-consumer role when `.gn-attention` took
 * the fill (`ui.css`, owner ruling 2026-09-18). That role's `tokens.ts` note
 * said "consumed at exactly one place"; it now names two. **The strip's ground
 * is re-established, not inherited**: it mounts inside `.gn-shell__main` on
 * `/w/<id>/my-work`, above `--gn-surface`, so it is the SAME composite the
 * banner already measures — and the roster's real-browser reading for that
 * element records exactly that backdrop (`e2e-stack/non-text-contrast-roster.json`'s
 * `aside.gn-attention` entry: `rgb(241,234,227)`).
 *
 * **No assertion was added, deliberately.** The strip's text is `--gn-text` —
 * the heading (which inherits, since nothing between `body` and `.gn-attention`
 * sets a colour), `.gn-attention__title`, and the `Chip` itself, whose tone
 * modifiers all set only `.gn-chip__dot`'s background — and `--gn-text-muted`
 * for the reason and the claim. Those are precisely the two roles the two
 * assertions below already cover, in all six style×theme combinations. A third block asserting the same two pairs against the same
 * wash would be a check that cannot fail for a reason of its own, which is the
 * shape case 11.213 was RETRACTED for (see its entry above).
 */
describe('tintWarning composites legibly on every surface it can reach', () => {
  /** `src` over `dst` — the compositing `relativeLuminance` deliberately lacks. */
  const over = (src: string, dst: string): string => {
    const hex = (h: string, i: number): number => Number.parseInt(h.slice(i, i + 2), 16);
    const alpha = src.length === 9 ? hex(src, 7) / 255 : 1;
    const channel = (i: number): number =>
      Math.round(hex(src, i) * alpha + hex(dst, i) * (1 - alpha));
    return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
  };

  for (const style of STYLE_NAMES) {
    for (const theme of THEME_NAMES) {
      it(`${style}/${theme}: the banner's heading and body clear 4.5 on the composite`, () => {
        const surface = colorOf(theme, 'surface', style);
        const washed = over(colorOf(theme, 'tintWarning', style), surface);

        // THE ANTI-VACUOUS CONTROL, and it is not decoration: a fully
        // transparent tint composites to `surface` itself, and both
        // assertions below would then pass by measuring text on a bare
        // surface — which already passes. Without this line the check
        // cannot fail for the reason it exists.
        expect(washed, `${style}/${theme}: the tint composites to nothing`).not.toBe(surface);

        expect(
          contrastRatio(colorOf(theme, 'text', style), washed),
          `${style}/${theme}: the banner heading no longer clears 4.5 on the wash`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(colorOf(theme, 'textMuted', style), washed),
          `${style}/${theme}: the banner body no longer clears 4.5 on the wash`,
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

/**
 * 13.1453 — AMENDED 2026-09-29 by the styling refresh (Plan A Task 6, case
 * 20.057). The per-priority card tint (owner request 2026-09-23) is retired:
 * the owner-approved mockup draws no tint, and the ink is neutral except
 * Urgent. The property this case now holds is the one a reader needs: every
 * ink the priority badge draws clears 4.5 on the card's own ground, in every
 * style × theme — and the four tint/ink roles are gone, so nothing can paint
 * them by accident.
 */
describe('13.1453 the priority ink clears 4.5 on the card ground; the tint roles are retired', () => {
  const INKS: { label: string; ink: TokenRole }[] = [
    { label: 'P1', ink: 'danger' },
    { label: 'P2', ink: 'textMuted' },
    { label: 'P3', ink: 'textSubtle' },
  ];
  for (const { label, ink } of INKS) {
    for (const style of STYLE_NAMES) {
      for (const theme of THEME_NAMES) {
        it(`13.1453 ${label} ${style}/${theme}: ${ink} on surfaceRaised ≥ 4.5`, () => {
          expect(
            contrastRatio(colorOf(theme, ink, style), colorOf(theme, 'surfaceRaised', style)),
          ).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
  it('13.1453 the four priority tint/ink roles no longer exist', () => {
    for (const role of ['priorityP1Tint', 'priorityP2Tint', 'priorityP3Tint', 'priorityP3']) {
      expect((TOKEN_ROLES as readonly string[]).includes(role), role).toBe(false);
    }
  });
});

/**
 * RETRACTED, Ruling 24 (coordinator review, 2026-09-16) — case 11.213 was
 * minted here for a block that read:
 *
 *     contrastRatio(colorOf(theme, 'customMarker', style), colorOf(theme, 'surface', style)) >= 4.5
 *
 * looped over every style/theme, framed as a "dedicated 6-combination gate"
 * for the Task 10 follow-up's contrast fix (`.gn-calendar__items { background:
 * var(--gn-surface) }`, `ui.css`). It was wrong on its own stated premise: the
 * docblock claimed "no `CONTRAST_PAIRS` row names this pairing", and one has —
 * `{ fg: 'customMarker', bg: 'surface', minimum: 4.5 }` — since commit
 * `e09666ce` (Plan 9, 2026-09-04), already exercised across every style/theme
 * by this file's own "declared contrast pairs meet their minimums" loop
 * above. The six assertions this block added were a byte-for-byte duplicate
 * of coverage that already existed; deleting them changes nothing this suite
 * can see.
 *
 * Worse than redundant: this block does two `tokens.ts` LOOKUPS
 * (`colorOf(...)` on a role, twice) and never reads `ui.css` — so it could
 * not have caught the regression it was written to guard. Deleting the
 * `.gn-calendar__items` declaration this fix depends on left this block, and
 * the entire suite, green. See `packages/ui/test/in-transit.test.ts`'s case
 * **11.214** for the real gate — the one that reads the actual stylesheet,
 * proven (by deliberately deleting the declaration and watching it redden)
 * to catch exactly this regression.
 *
 * The id `11.213` is RETIRED, not reused — see `test-cases/
 * 11-calendar-notifications.md`'s permanently-unused-ranges section, which
 * already holds this file's own precedent for the same discipline (a
 * renumber's vacated id "stays vacated rather than being reused by a later,
 * unrelated case").
 */

/**
 * `.gn-chip` (hig/minimal) — `text` on `fillTertiary`, composited. Case
 * 13.404 (test-cases/13-deployment-dogfooding.md), minted by the
 * workspaces-prototype-port plan's Task 10 — left uncased when this block
 * was written, since the highest number this block's author could confirm
 * taken was 13.399, with no visibility into concurrent work's claims above
 * it. Task 3 fix round 1 (task-3-report.md, finding 3): the existing fillTertiary
 * checks in this file (13.360's ghost-button case, and the ratio above it)
 * both measure `textAccent`, which is a DIFFERENT foreground from the chip's
 * own `color: var(--gn-text)`, and both composite `fillTertiary` over
 * `surface`, a DIFFERENT ground from the chip's actual one — it sits on
 * `.gn-card`, whose background is `surfaceRaised`. Nothing existing measures
 * `text`-on-fillTertiary-over-`surfaceRaised`, so it is not obligated by any
 * `CONTRAST_PAIRS` row (`fillTertiary` is alpha; `tokens.ts:228` says alpha
 * roles cannot be named in that array — the obligation is against the
 * composite, same reasoning as the `tintWarning` block above). The
 * `surface` composite is checked too, for the same "cannot yet prove no
 * chip is ever rendered directly on bare page" reason 13.360's own case
 * checks both fillTertiary composites it does.
 */
describe('the chip label composites legibly on fillTertiary, over every ground it can reach', () => {
  /** `src` over `dst` — the compositing `relativeLuminance` deliberately lacks. */
  const over = (src: string, dst: string): string => {
    const hex = (h: string, i: number): number => Number.parseInt(h.slice(i, i + 2), 16);
    const alpha = src.length === 9 ? hex(src, 7) / 255 : 1;
    const channel = (i: number): number =>
      Math.round(hex(src, i) * alpha + hex(dst, i) * (1 - alpha));
    return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
  };

  for (const style of STYLE_NAMES) {
    for (const theme of THEME_NAMES) {
      it(`${style}/${theme}: the chip's text clears 4.5 on the fillTertiary composite`, () => {
        const fill = colorOf(theme, 'fillTertiary', style);
        const raised = colorOf(theme, 'surfaceRaised', style);
        const surface = colorOf(theme, 'surface', style);
        const overRaised = over(fill, raised);
        const overSurface = over(fill, surface);

        // THE ANTI-VACUOUS CONTROL: a fully transparent fill composites to
        // the bare ground itself, and the assertions below would then pass
        // by measuring `text` on a plain surface — which already passes per
        // `CONTRAST_PAIRS`. Without this the check cannot fail for the
        // reason it exists.
        expect(overRaised, `${style}/${theme}: the fill composites to nothing over surfaceRaised`).not.toBe(raised);
        expect(overSurface, `${style}/${theme}: the fill composites to nothing over surface`).not.toBe(surface);

        expect(
          contrastRatio(colorOf(theme, 'text', style), overRaised),
          `${style}/${theme}: the chip's text no longer clears 4.5 on the card-composited fill`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(colorOf(theme, 'text', style), overSurface),
          `${style}/${theme}: the chip's text no longer clears 4.5 on the page-composited fill`,
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

/**
 * `.gn-avatar`'s NEUTRAL fill — the one state of that element that had no
 * boundary at all. Case **13.732** (`test-cases/13-deployment-dogfooding.md`).
 *
 * THE BUG (owner report, 2026-09-18: *"in neomorphic style, the gn-avatar
 * background is not visible. check the bg colour applied here"*), measured
 * here rather than inferred from the report: the base rule declared
 * `background: var(--gn-surface-sunken)` — the rule is `ui.css:202`, and it
 * now declares `fill-tertiary` — and under `neo` — the
 * SHIPPED DEFAULT — `surface`, `surfaceRaised` and `surfaceSunken` are the same
 * hex, `neoPaper #F1EAE3`. An untinted avatar on a card was therefore
 * `#F1EAE3` on `#F1EAE3`: a boundary ratio of exactly **1.0000**, which is to
 * say no boundary. It read as intermittent rather than always-broken because
 * the tint is OPT-IN (`components/avatar.tsx:63` sets the class only when
 * `tint !== undefined`) and all four `--gn-avatar--tint-*` rules set their own
 * fill — so only an avatar with no `tint` prop fell through to the invisible
 * base.
 *
 * THE REPO HAD ALREADY PREDICTED IT, ONE ELEMENT OVER.
 * `apps/web/app/globals.css:1516-1522` records rejecting `surface-sunken` for
 * the members monogram *"although it is the role `.gn-avatar` declares,
 * because under `neo` … a disc filled with it disappears into the card it sits
 * in; a boundary that is not drawn is not a disc."* The monogram was moved to
 * `--gn-fill-tertiary`; `.gn-avatar` was left behind, so the comment named the
 * bug, the element, and the fix. This case is the gate that sentence lacked.
 *
 * WHY IT READS THE STYLESHEET **AND** THE ROLE TABLE. `CONTRAST_PAIRS` cannot
 * carry this obligation: `fillTertiary` is an ALPHA primitive (`#b0988429`)
 * and `tokens.ts:284`'s fill-hierarchy docblock forbids naming an alpha role in
 * that array, because `relativeLuminance` ignores alpha and the pair would
 * then be measured against a ground the fill is actually blended INTO — a
 * false green. The obligation is against the COMPOSITE, so this case derives
 * the declared role FROM `ui.css` and measures THAT — the shape case **11.214**
 * (`in-transit.test.ts`) established, and for its reason: a case that
 * hard-coded `fillTertiary` would stay green if `.gn-avatar` were repointed at
 * a role that vanishes, which is the exact regression it exists to catch.
 * (11.213 is the tombstone for getting this wrong the other way — two
 * `colorOf` lookups, never a read of the stylesheet, green through the very
 * deletion it was written to guard.)
 *
 * WHAT IT ASSERTS, AND WHAT IT DELIBERATELY DOES NOT. The boundary is asserted
 * to EXIST — the composited fill is not the colour of the ground it sits on —
 * and NOT to clear 3:1, which no neutral avatar fill does in any style
 * (measured: 1.12–1.35) and which WCAG 1.4.11 does not owe here: the disc
 * carries no state and identifies no control, while the initials carry the
 * content and `aria-label` carries the identity. Inventing a floor the product
 * has never met would be a number with no principle behind it. The initials
 * ARE held to the floor they really owe — 4.5, as read text — on the composite,
 * in every style and theme, over both grounds the element can sit on.
 *
 * THE LIMIT OF THAT ASSERTION, measured rather than left implicit. `!==` is an
 * EXISTENCE test, not a perceptibility test: a fill at alpha 2/255 of the
 * shipped hue composites to `#f0e9e2` over `neoPaper` — a boundary ratio of
 * **1.0091**, which no reader can see — and would satisfy it. Alpha 1/255 does
 * fail (it composites back to the ground exactly), so the assertion is not
 * vacuous, but the gap between "differs" and "visible" is real and this case
 * does not close it. It deliberately does not invent a perceptibility floor to
 * close it either: the product has never declared one, and 1.1228 is simply
 * what its own chosen role measures under `neo`. A green here means a boundary
 * is DRAWN; it is not a guarantee that one is SEEN. Recorded so the next reader
 * does not misread it. Owner: whoever next changes the avatar's fill.
 *
 * THE GROUND IS DERIVED, NOT ASSUMED — see `cardGround` below. An earlier
 * version hard-coded `surfaceRaised` where the claim is "the avatar is not the
 * colour of the thing it sits on", which measures an assumed card rather than
 * the one `ui.css` draws. Reading `.gn-card`'s declared role out of the same
 * stylesheet is a correctness fix to the MEASUREMENT. An independent reviewer
 * raised it, and one half of what it predicted did NOT reproduce, which is
 * recorded rather than tidied away: repointing `.gn-card` to `surface-sunken`
 * does not resurrect the bug, because the avatar no longer fills with that role
 * — measured, PASS(2) FAIL(1), the single red being the witness's `hig` control
 * and the primary boundary assertion staying green. So the derivation buys a
 * case that measures the ground it names; it does not close a live hole.
 *
 * `over()` is a local copy, matching the two blocks above, because
 * `relativeLuminance` is documented as ignoring alpha by design and the
 * compositing it lacks is what this case is about.
 */
describe('13.732 — an untinted avatar draws its own boundary in every style, not only where the surface roles differ', () => {
  /** `src` over `dst` — the compositing `relativeLuminance` deliberately lacks. */
  const over = (src: string, dst: string): string => {
    const hex = (h: string, i: number): number => Number.parseInt(h.slice(i, i + 2), 16);
    const alpha = src.length === 9 ? hex(src, 7) / 255 : 1;
    const channel = (i: number): number =>
      Math.round(hex(src, i) * alpha + hex(dst, i) * (1 - alpha));
    return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
  };

  /** The declarations of the FIRST rule whose selector is exactly `selector`. */
  const declarationsFor = (css: string, selector: string): string | null => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? null;
  };

  const UI_CSS_TEXT = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');

  /**
   * The role `.gn-avatar` actually names for `property`, resolved back to its
   * `TokenRole` entry. Throws rather than returning a sentinel — the
   * `expect(x).not.toBeNull()` shape does not narrow for TypeScript here (the
   * same trap 13.464's mutation witness documents in `components.test.tsx`),
   * and a case that silently measured `undefined` would be the failure mode
   * this whole file exists to prevent.
   */
  const declaredRole = (selector: string, declarations: string, property: 'background' | 'color'): TokenRole => {
    const named = new RegExp(`(?:^|[\\s;])${property}:\\s*var\\(--gn-([a-z-]+)\\)`).exec(declarations)?.[1];
    if (named === undefined) {
      throw new Error(`${selector} declares no \`${property}: var(--gn-…)\`; it reads: ${declarations.trim()}`);
    }
    const role = TOKEN_ROLES.find((candidate) => cssVariableName(candidate) === `--gn-${named}`);
    if (role === undefined) {
      throw new Error(`${selector}'s ${property} names --gn-${named}, which is not a role in TOKEN_ROLES`);
    }
    return role;
  };

  const bodyOf = (selector: string): string => {
    const body = declarationsFor(UI_CSS_TEXT, selector);
    if (body === null) throw new Error(`${selector} rule not found in ui.css`);
    return body;
  };

  const avatarBody = bodyOf('.gn-avatar');
  /**
   * THE GROUND IS READ FROM `.gn-card` TOO, not assumed to be `surfaceRaised`.
   * Half of this case's claim is "the avatar is not the colour of the thing it
   * sits on", so the ground is part of the measurement — hard-coding it would
   * leave the case green through exactly the kind of repoint the avatar's own
   * role is derived to survive, one level over. `.gn-card` declares
   * `var(--gn-surface-raised)` (`ui.css:161`).
   */
  const cardGround = declaredRole('.gn-card', bodyOf('.gn-card'), 'background');

  it('the neutral avatar is not filled with the same colour as the ground it sits on', () => {
    const bg = declaredRole('.gn-avatar', avatarBody, 'background');

    for (const style of STYLE_NAMES) {
      for (const theme of THEME_NAMES) {
        const raised = colorOf(theme, cardGround, style);
        const filled = over(colorOf(theme, bg, style), raised);

        // THE ASSERTION THE BUG FAILS. Under `neo`, `surfaceRaised` and the
        // old `surfaceSunken` are one hex, so `filled === raised` and this
        // reddens in both themes — naming the style rather than the role,
        // because the ROLE is a legitimate implementation choice and the
        // same-colour-as-its-ground is the defect.
        expect(
          filled,
          `${style}/${theme}: an untinted avatar composites to the card's own colour (${raised}) — no boundary is drawn`,
        ).not.toBe(raised);
      }
    }
  });

  it('and its initials still clear 4.5 on that composite, over every ground it can reach', () => {
    const bg = declaredRole('.gn-avatar', avatarBody, 'background');
    const fg = declaredRole('.gn-avatar', avatarBody, 'color');

    for (const style of STYLE_NAMES) {
      for (const theme of THEME_NAMES) {
        const raised = colorOf(theme, cardGround, style);
        const surface = colorOf(theme, 'surface', style);
        const overRaised = over(colorOf(theme, bg, style), raised);
        const overSurface = over(colorOf(theme, bg, style), surface);

        // Anti-vacuous, same reason as the two blocks above: a fully
        // transparent fill composites to the bare ground, and both
        // assertions would then pass by measuring initials on a plain surface.
        // `hig`/`minimal` DARK is the arm that earns this — there the fill
        // composites to #2d3141/#383e59, lighter than its own grounds.
        expect(overRaised, `${style}/${theme}: the avatar fill composites to nothing over surfaceRaised`).not.toBe(raised);
        expect(overSurface, `${style}/${theme}: the avatar fill composites to nothing over surface`).not.toBe(surface);

        expect(
          contrastRatio(colorOf(theme, fg, style), overRaised),
          `${style}/${theme}: the avatar's initials no longer clear 4.5 on the card-composited fill`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(colorOf(theme, fg, style), overSurface),
          `${style}/${theme}: the avatar's initials no longer clear 4.5 on the page-composited fill`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  /*
   * MUTATION WITNESS. The assertion above is only worth its line count if it
   * fires on the regression it names, so the regression is PLANTED here: the
   * shipped `surface-sunken` fill is put back into the real stylesheet text,
   * the role is re-derived by the same helper the case uses, and the composite
   * is asserted to collapse onto the card's colour under `neo` in both themes.
   *
   * A NEAR-MISS PROVES THE PROBE IS AIMED: under `hig`/`minimal` the two roles
   * genuinely differ, so the SAME planted fill does NOT collapse there. The
   * control at the end states that, so a reader can see the witness is
   * measuring `neo`'s one-hex surface roles and not a general property of the
   * helper. This is also why the assertion above reddens in exactly two of the
   * six combinations when reverted — narrow enough to identify its own cause,
   * which is the standard this repo holds every mutation to.
   */
  it('a planted `surface-sunken` fill is caught, and the near-miss under hig/minimal says why', () => {
    const plantedBody = avatarBody.replace(
      /background:\s*var\(--gn-[a-z-]+\)/,
      'background: var(--gn-surface-sunken)',
    );
    expect(
      plantedBody,
      'planting `surface-sunken` changed nothing in .gn-avatar — either the background declaration moved, or the rule ALREADY declares surface-sunken, which is the defect this case exists to catch',
    ).not.toBe(avatarBody);

    expect(declaredRole('.gn-avatar (planted)', plantedBody, 'background')).toBe('surfaceSunken');

    const neoRaised = colorOf('light', cardGround, 'neo');
    expect(
      over(colorOf('light', 'surfaceSunken', 'neo'), neoRaised),
      `neo/light no longer collapses surface-sunken onto ${cardGround} — the roles have diverged, so this witness no longer demonstrates the bug`,
    ).toBe(neoRaised);

    // THE CONTROL: the same planted fill under `hig`, where the roles differ,
    // does not collapse. Without this line a green witness would also be
    // consistent with `over()` returning its `dst` unconditionally.
    const higRaised = colorOf('light', cardGround, 'hig');
    expect(
      over(colorOf('light', 'surfaceSunken', 'hig'), higRaised),
      'hig/light now collapses too — the witness is no longer isolating neo',
    ).not.toBe(higRaised);
  });
});

/**
 * Round 2d (2026-09-09) — the sign-in neo alignment's token-level changes:
 * the retired accent hex, the new `textAccent` role that replaces it as a
 * text-contrast guarantee, and the new pairless `brand` role.
 */
describe('textAccent — Round 2d (2026-09-09)', () => {
  /**
   * 13.360 — the accent hex measured, both directions.
   *
   * **REWRITTEN 2026-09-18 (Step 2c-1, T1), because T1 made half of this case
   * FALSE and the honest thing is to record the new fact rather than re-tune
   * the assertion until it goes quiet.** Round 2d's premise was that the accent
   * (`#3A6DB0`) is legible as a FILL but never as text on a light surface
   * (4.19–4.30). T1 moved `blue600` to the refreshed export's `#33629F`, which
   * is DARKER, and that premise now holds only in part:
   *
   * | light accent on | before | after |
   * |---|---|---|
   * | `surface` (`warmPaper`) | 4.30 | **5.07** — now clears |
   * | `surfaceRaised` (`warmRaised`) | 4.93 | **5.81** — now clears |
   * | `surfaceSunken` (`warmSunken`) | — | **4.42 — still fails** |
   * | `surface` in `neo` light | 4.30 | **5.20** |
   *
   * So the case asserts the surviving half: `accent` clears the plain and
   * raised light surfaces but STILL fails the sunken one. **The `textAccent`
   * split is unchanged and still justified** — `textAccent` remains the role
   * that carries the 4.5 guarantee on all three surfaces (4.76–5.60 light),
   * and a role that clears two backgrounds and fails the third is exactly the
   * shape that must not be relied on for text. What changed is the reason a
   * reader should give; pinning 4.42 as well as 5.07 keeps both halves visible.
   *
   * Mutation: reverting `blue600`/`blue300` to the pre-Round-2d hexes
   * (`#0040dd`/`#409cff`) still flips the light assertions — `#0040dd` clears
   * 4.5 on every light surface including the sunken one — without touching
   * `textAccent` at all. The two roles are independent primitives, which is the
   * property this pins.
   */
  it("13.360 the accent hex clears 4.5 as text on the light plain and raised surfaces since T1, and still fails the sunken one", () => {
    expect(primitives.blue600).toBe('#33629f');
    expect(primitives.blue300).toBe('#7fa9e4');
    // T1's own consequence, both directions, on the three light surfaces.
    expect(contrastRatio(colorOf('light', 'accent'), colorOf('light', 'surface'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colorOf('light', 'accent'), colorOf('light', 'surfaceRaised'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colorOf('light', 'accent'), colorOf('light', 'surfaceSunken'))).toBeLessThan(4.5);
    expect(contrastRatio(colorOf('dark', 'accent'), colorOf('dark', 'surface'))).toBeGreaterThanOrEqual(4.5);
    // Dark clears bare surface/raised (see `textAccentDark`'s own docblock)
    // AND, since 2026-09-10, the neo sunken surface too — `neoNavySunken`
    // was reverted to `neoNavy` itself (the prototype's exact dark+neo hex;
    // see `tokens.ts`'s `neoNavySunken`, still `neoNavy`), and a darker background
    // only helps a light foreground like `accent` read MORE clearly. This
    // is a changed FACT, not a claim this test still needs to hold the old
    // way — `accent` still carries no GUARANTEE on a sunken background in
    // general (nothing derives it to clear one), which is why sites that
    // render on one (`.gn-help__result-title`) stay on `textAccent` rather
    // than reclaiming `accent` for the job.
    expect(contrastRatio(colorOf('dark', 'accent'), primitives.neoNavySunken)).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * 13.360 — `textAccent` clears the two declared `CONTRAST_PAIRS` rows in
   * EVERY style, which is what the renamed rows above already assert via the
   * generic "declared contrast pairs meet their minimums" loop. This case
   * pins the exact derived hexes so a silent re-derivation (a value that
   * still clears 4.5 by coincidence but was not actually re-measured) shows
   * up as a diff here rather than passing unnoticed.
   */
  it('13.360 textAccent is pinned to its derived hexes', () => {
    expect(primitives.textAccentLight).toBe('#2d5488');
    expect(primitives.textAccentDark).toBe('#97bdf2');
    expect(themes.light.textAccent).toBe('textAccentLight');
    expect(themes.dark.textAccent).toBe('textAccentDark');
  });

  /**
   * 13.360 — the binding constraint `textAccentLight`'s docblock names
   * (the `.gn-button--ghost` fillTertiary-over-surface composite, `hig` and
   * `neo`) actually clears 4.5, and the `.gn-help__result-title` sunken
   * background does too, in both themes. These are NOT declared
   * `CONTRAST_PAIRS` rows (that array only names `surface`/`surfaceRaised`),
   * so nothing else in this suite would catch a regression here — this is
   * the composite/sunken safety margin the derivation bought beyond what the
   * declared rows require.
   *
   * **AND THE THIRD COMPOSITE, case `13.1145`, added 2026-09-21 by round-2 finding E4-31: a
   * ghost button over `fillTertiary` does not only sit on `surface`.** On
   * `/account` and `/mcp/tokens` it sits on `surfaceSunken`, so the ground that
   * has to be cleared is `fillTertiary` composited over `surfaceSunken` —
   * `#CFC7C0` light, `#41496D` dark. **It measured 3.997 light and 3.973 dark
   * in `hig`/`minimal`, below 4.5 in BOTH, and no case measured it** — which is
   * the whole of the finding: `textAccent` was derived against six grounds and
   * a seventh was being painted. Both primitives were stepped for it (see their
   * docblocks), so this case is red before that step and green after.
   *
   * `neo` contributes no separate reading and that is a fact about the style
   * axis, not an omission: `STYLE_COLOR_OVERRIDES` maps `neo`'s
   * `surfaceSunken` to `neoPaper`/`neoNavy` — its own `surface` — so the third
   * composite IS the second one there. Asserted rather than assumed below.
   *
   * Mutation: reverting either primitive to a value that only clears the two
   * declared rows (e.g. the intermediate `#33619c`/pre-composite pass this
   * derivation actually went through) reddens this case alone. Reverting the
   * 2026-09-21 step — `#2d5488`/`#97bdf2` back to `#325d97`/`#8bb1e6` — reddens
   * the THIRD assertion alone, in `hig`/`minimal`, which is the pair that had
   * no coverage.
   */
  it('13.360 textAccent clears 4.5 against the fillTertiary-composited control background and surfaceSunken', () => {
    const over = (src: string, dst: string): string => {
      const hex = (h: string, i: number): number => Number.parseInt(h.slice(i, i + 2), 16);
      const alpha = src.length === 9 ? hex(src, 7) / 255 : 1;
      const channel = (i: number): number =>
        Math.round(hex(src, i) * alpha + hex(dst, i) * (1 - alpha));
      return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
    };
    for (const style of STYLE_NAMES) {
      for (const theme of THEME_NAMES) {
        const surface = colorOf(theme, 'surface', style);
        const composite = over(colorOf(theme, 'fillTertiary', style), surface);
        expect(
          contrastRatio(colorOf(theme, 'textAccent', style), composite),
          `${style}/${theme}: textAccent on the ghost-button composite`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(colorOf(theme, 'textAccent', style), colorOf(theme, 'surfaceSunken', style)),
          `${style}/${theme}: textAccent on surfaceSunken`,
        ).toBeGreaterThanOrEqual(4.5);
        // E4-31 — the THIRD ground. A ghost button on a sunken row paints
        // `fillTertiary` over `surfaceSunken`, not over `surface`.
        const sunkenComposite = over(
          colorOf(theme, 'fillTertiary', style),
          colorOf(theme, 'surfaceSunken', style),
        );
        expect(
          contrastRatio(colorOf(theme, 'textAccent', style), sunkenComposite),
          `${style}/${theme}: textAccent on fillTertiary over surfaceSunken`,
        ).toBeGreaterThanOrEqual(4.5);
        if (style === 'neo') {
          // The style axis, asserted rather than assumed: `neo` maps
          // `surfaceSunken` to its own `surface`, so its third composite is
          // its second one. If that override is ever removed this comparison
          // fails and the third assertion above becomes a real, separate
          // constraint for `neo` too — which is the day it needs its own step.
          expect(
            sunkenComposite,
            'neo no longer maps surfaceSunken to surface — the third composite is a new constraint here',
          ).toBe(composite);
        }
      }
    }
  });

  /**
   * 13.360 — `accentText` on the RETIRED-hex-replaced `accent` still clears
   * 4.5 in both themes (the dispatch's own item 10, "verify"). No nudge was
   * needed; this pins that finding so a future accent change that DOES need
   * one is caught here rather than assumed away.
   *
   * **CORRECTED, round 3 fix round 1 (2026-09-16, coordinator review F4).**
   * The last two assertions used to be `expect(primitives.white).toBe(
   * '#ffffff')` / `expect(primitives.navy900).toBe('#101625')` — pinning
   * *the values `accentText` resolved to* at the time, which is what
   * "unnudged" meant: the role kept its ORIGINAL primitive rather than being
   * stepped to a different one. Owner round 4 (`b05e723f`) re-pointed
   * `accentText` to `onColorWarmLight`/`onColorWarmDark` — the prototype's
   * off-white/off-black, not pure white/navy — and these two lines were left
   * behind, still passing, but no longer pinning anything `accentText`
   * actually touches: `white`/`navy900` are referenced by no role after that
   * change, so the case could no longer fail for the reason it exists (a
   * future re-nudge of `accentText` would sail through it). Re-pointed below
   * at what the role resolves to NOW, both the primitive NAME (so a future
   * change that points `accentText` at a third primitive reds here) and its
   * HEX (so a change to the primitive's own value reds here too) — the same
   * two-level pin `themes.light.accentText`'s sibling assertions elsewhere in
   * this file already use (e.g. 13.358's `brand`/`brandOrange` pair).
   */
  it('13.360 accentText on the new accent still clears 4.5 in both themes, unnudged', () => {
    expect(contrastRatio(colorOf('light', 'accentText'), colorOf('light', 'accent'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colorOf('dark', 'accentText'), colorOf('dark', 'accent'))).toBeGreaterThanOrEqual(4.5);
    expect(themes.light.accentText).toBe('onColorWarmLight');
    expect(primitives.onColorWarmLight).toBe('#fbf7f3');
    expect(themes.dark.accentText).toBe('onColorWarmDark');
    expect(primitives.onColorWarmDark).toBe('#141a2e');
  });
});

/**
 * 13.358, 13.365 — `brand`, the one pairless role, and the measured number
 * that justifies the exemption (see `TOKEN_ROLES`'s `brand` docblock).
 */
describe('brand — Round 2d (2026-09-09)', () => {
  it('13.358 brand has no light/dark split — one primitive, both themes', () => {
    expect(primitives.brandOrange).toBe('#ee7733');
    expect(themes.light.brand).toBe('brandOrange');
    expect(themes.dark.brand).toBe('brandOrange');
    expect(colorOf('light', 'brand')).toBe(colorOf('dark', 'brand'));
  });

  /**
   * 13.358 — a hardcoded literal check, not one derived from `colorOf`/
   * `themes`, so a `STYLE_COLOR_OVERRIDES` entry someone adds for `brand`
   * later (which would make it vary, defeating "no dark variant exists")
   * shows up here even though the generic "every role appears under every
   * style×theme selector" case above would still pass (it derives its
   * expectation from the same function this case does not).
   */
  it('13.358 themeStylesheet() emits the literal brand hex under both :root and [data-theme="dark"]', () => {
    const stylesheet = themeStylesheet();
    /* EVERY bare-`:root` block, not the first one. There are two since the
       2026-09-15 font port — the typefaces are emitted under their own `:root`
       ahead of the colours, being invariant across both axes — and `find`
       silently returned that one, reporting the brand hex missing when it was
       one line further down. A filter states what the case actually means:
       somewhere under an unmarked `:root`, brand is this literal. */
    const rootBlocks = stylesheet
      .split('\n')
      .filter((line) => line.startsWith(':root {'))
      .join('\n');
    const darkLine = stylesheet.split('\n').find((line) => line.startsWith('[data-theme="dark"] {'));
    expect(rootBlocks, ':root block').not.toBe('');
    expect(darkLine, '[data-theme="dark"] block').toBeDefined();
    expect(rootBlocks).toContain('--gn-brand: #ee7733;');
    expect(darkLine).toContain('--gn-brand: #ee7733;');
  });

  /**
   * 13.365 — `brand` is deliberately PAIRLESS (see its `TOKEN_ROLES`
   * docblock): the tile's actual composition (`textInverted` glyph stroke on
   * `brand` fill) measures below even the 3:1 a non-text UI component owes,
   * in light theme specifically. This is not a gap in this file's own
   * enforcement — it is a measured, recorded exemption for a decorative,
   * `aria-hidden="true"` glyph — and this case is what keeps the number from
   * being merely asserted in a docblock nobody re-checks.
   */
  it('13.365 the pairless exemption: textInverted on brand measures below 3:1 in light, clears easily in dark', () => {
    const light = contrastRatio(colorOf('light', 'textInverted'), colorOf('light', 'brand'));
    const dark = contrastRatio(colorOf('dark', 'textInverted'), colorOf('dark', 'brand'));
    expect(light).toBeLessThan(3);
    // Owner round 4 (2026-09-16, coordinator review F7 fixed the wording
    // below — "both" previously read as "both themes", which is false: dark
    // is 6.017, nowhere near the 3:1 floor): `textInverted` moved off pure
    // `white`/`ink` to the prototype's `onColorWarmLight`/`onColorWarmDark`
    // (`#fbf7f3`/`#141a2e`) — light's number moved with it, 2.87 → 2.69,
    // both of those (before and after) still well below the 3:1 this pair is
    // exempted from. Dark is unaffected by this comment and clears 4.5 on its
    // own assertion below. Re-measured, not assumed.
    expect(light).toBeCloseTo(2.69, 1);
    expect(dark).toBeGreaterThanOrEqual(4.5);
    // And no CONTRAST_PAIRS row was added to paper over it — the exemption is
    // stated in the `brand` role's docblock, not silently un-enforced.
    expect(CONTRAST_PAIRS.some((pair) => pair.fg === 'brand' || pair.bg === 'brand')).toBe(false);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Step 2c-1 (2026-09-18) — the refreshed export's token layer.
 *
 * Cases 13.675–13.681. The prototype's `<style>` block moved five things
 * (T1–T5, `docs/design/prototype-delta-2026-09-18.md`); three of them reach
 * this product, and three deliberately do NOT. A case per movement, one for
 * each refusal, and one for the floors — because "we did not port that" is a
 * property that decays silently if nothing asserts it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('Step 2c-1 (2026-09-18) — the refreshed export token layer', () => {
  /** 13.675 — T1: the light accent moved, and the four roles resolving through it followed. */
  it('13.675 T1: the light accent carries the refreshed hex and every role that resolves through it follows', () => {
    expect(primitives.blue600).toBe('#33629f');
    // The three roles that point straight at the primitive in light...
    for (const role of ['accent', 'focusRing', 'categoryActive'] as const) {
      expect(colorOf('light', role), `light/${role}`).toBe('#33629f');
    }
    // ...and the DARK arm did not move: the export's `--accentDark` is untouched
    // by this refresh, so a change here would be drift, not a port.
    expect(primitives.blue300).toBe('#7fa9e4');
    expect(colorOf('dark', 'accent')).toBe('#7fa9e4');
    // The derived text role is darker than either accent, so it still clears
    // every background it was derived against — re-measured after T1 moved the
    // accent, rather than assumed because it passed before.
    expect(contrastRatio(colorOf('light', 'textAccent'), colorOf('light', 'surface'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colorOf('light', 'textAccent'), colorOf('light', 'surfaceSunken'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colorOf('light', 'textAccent'), primitives.neoPaper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colorOf('dark', 'textAccent'), colorOf('dark', 'surfaceSunken'))).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * 13.676 — T2 is NOT ported, and this is the negative case that says so.
   *
   * The export moved its `--accent` ALIAS out of `:root` onto the bare `body`
   * rule. There is nothing to port: this file emits `--gn-accent` per style AND
   * theme from `declarationsFor`, so the relationship the export expresses with
   * a `var()` indirection is already structural here. The hazard this guards is
   * a future reader noticing the export has a `--accent` and adding one.
   */
  it('13.676 T2 is NOT ported: --gn-accent is emitted per style x theme and no bare --accent alias exists', () => {
    const css = themeStylesheet();
    // `--gn-accent` is not `--accent`: the guard below is only meaningful
    // because that substring relationship does NOT hold. Asserted, not assumed.
    expect('--gn-accent').not.toContain('--accent');
    expect(css).not.toContain('--accent:');
    // Positive control, same run: the search shape DOES find the real alias, so
    // the two `not.toContain` checks above are not passing on a broken needle.
    expect(css).toContain('--gn-accent:');
    expect(css).toContain('--gn-accent-text:');
    // One accent per style x theme, each resolving — six colour arms.
    for (const style of ['hig', 'minimal', 'neo'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        expect(colorOf(theme, 'accent', style), `${style}/${theme}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  /** 13.677 — T3: the tint washes halved, and `tintWarning` is the only one that exists. */
  it('13.677 T3: the warning tint halves in both themes, and it is the product\'s only tint role', () => {
    // Alpha 0x1a = 26/255 = 0.102, the export's 0.10 by this file's
    // round-half-up convention (the same arithmetic that gave the old
    // 0.141 -> 0x24 and 0.115 -> 0x1d).
    expect(primitives.tintWarmWarning).toBe('#f07c341a');
    expect(primitives.tintNavyWarning).toBe('#f7a9611a');
    // Hue unchanged in both — only the alpha moved. A hue change would be a
    // different port wearing this case's name.
    expect(primitives.tintWarmWarning.slice(0, 7)).toBe('#f07c34');
    expect(primitives.tintNavyWarning.slice(0, 7)).toBe('#f7a961');
    // The export moved FIVE tints; this product has ONE role for them. The
    // other four are unported by an existing, documented refusal
    // (`ui.css`'s "no --gn-tint-purple role exists or is added here"), so the
    // mapping T3's dispatch asks for is four absences and one movement.
    expect(TOKEN_ROLES.filter((role) => role.startsWith('tint'))).toEqual(['tintWarning']);
    // Both themes resolve it; neither fell back to a bare primitive name.
    expect(themes.light.tintWarning).toBe('tintWarmWarning');
    expect(themes.dark.tintWarning).toBe('tintNavyWarning');
  });

  /** 13.678 — T4 is NOT ported: the export derived a role this product does not have. */
  it('13.678 T4 is NOT ported: no tintAccent role exists and no consumer is left unserved', () => {
    const css = themeStylesheet();
    expect(TOKEN_ROLES.some((role) => /tintAccent/i.test(role))).toBe(false);
    expect(css).not.toContain('--gn-tint-accent');
    // Positive control: the tint role that DOES exist is emitted, so the two
    // negative assertions above are not passing because the sweep is broken.
    expect(css).toContain('--gn-tint-warning:');
  });

  /** 13.679 — T5: the neo light surface and the five semantic colours the export newly declares for it. */
  it('13.679 T5: neo light moves to the refreshed surface and gains five semantic colours that no other style takes', () => {
    expect(primitives.neoPaper).toBe('#f1eae3');
    for (const role of ['surface', 'surfaceRaised', 'surfaceSunken'] as const) {
      expect(colorOf('light', role, 'neo'), `neo/light ${role}`).toBe('#f1eae3');
    }
    // The five, mapped by MEANING: the export's `--pink` is this product's
    // `contested` and its `--purple` is `restricted`. `customMarker` follows
    // `restricted` because it is documented as sharing that primitive.
    expect(colorOf('light', 'danger', 'neo')).toBe('#9e2a20');
    expect(colorOf('light', 'warning', 'neo')).toBe('#8c4708');
    expect(colorOf('light', 'success', 'neo')).toBe('#25644a');
    expect(colorOf('light', 'contested', 'neo')).toBe('#9a3054');
    expect(colorOf('light', 'restricted', 'neo')).toBe('#413f7c');
    expect(colorOf('light', 'customMarker', 'neo')).toBe('#413f7c');
    // The style is the ONLY axis these move on: `hig` and `minimal` must NOT
    // have followed, or the port would have been a product-wide palette change
    // wearing a neo-specific one's name.
    expect(colorOf('light', 'danger', 'hig')).toBe('#d70015');
    expect(colorOf('light', 'danger', 'minimal')).toBe('#d70015');
    expect(colorOf('light', 'contested', 'hig')).toBe('#d30f45');
    expect(colorOf('light', 'restricted', 'hig')).toBe('#8944ab');
    // And the dark-neo arm is untouched by this refresh.
    expect(colorOf('dark', 'surface', 'neo')).toBe('#1b2340');
    expect(colorOf('dark', 'danger', 'neo')).toBe('#ff6961');
  });

  /**
   * 13.680 — the export's new SELECTOR is NOT ported. This is the case the
   * dispatch calls for by name, and it is a NEGATIVE case in the strict sense:
   * what must be true is that the light-neo tokens are reachable with NO
   * `data-theme` attribute anywhere, which is precisely what the export's
   * literal selector would have prevented.
   */
  it('13.680 the light-neo token set is reachable with NO data-theme attribute, and the export\'s literal selector is absent', () => {
    const css = themeStylesheet();
    // The export's compound selector — the thing that must not appear.
    expect(css).not.toContain('[data-theme="light"][data-style="neo"]');
    // The light-neo arm as this product ships it: keyed on `data-style` ALONE.
    const bareNeoLight = css.match(/\[data-style="neo"\] \{([^}]*)\}/);
    expect(bareNeoLight, 'the bare [data-style="neo"] arm should be emitted').not.toBeNull();
    expect(bareNeoLight![1]).toContain('--gn-surface: #f1eae3;');
    // So a user who has never chosen a theme — no `data-theme` at all, the
    // DEFAULT state — still gets the light-neo set. That is the behaviour the
    // literal port would have silently removed.
    expect(colorOf('light', 'surface', 'neo')).toBe('#f1eae3');
    // The dark arm still reaches dark-neo both ways it always did: explicit
    // attribute, and OS preference for an unchosen theme.
    expect(css).toContain('[data-style="neo"][data-theme="dark"]');
    expect(css).toContain('[data-style="neo"]:not([data-theme="light"])');
  });

  /** 13.681 — the floors re-cleared on the re-derived palette, and none lowered to get there. */
  it('13.681 every contrast floor clears on the re-derived palette and the roster was not weakened', () => {
    let checked = 0;
    for (const style of ['hig', 'minimal', 'neo'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        for (const pair of CONTRAST_PAIRS) {
          checked += 1;
          expect(
            contrastRatio(colorOf(theme, pair.fg, style), colorOf(theme, pair.bg, style)),
            `${style}/${theme}: ${pair.fg} on ${pair.bg}`,
          ).toBeGreaterThanOrEqual(pair.minimum);
        }
      }
    }
    expect(checked).toBe(CONTRAST_PAIRS.length * 6);
    // The roster only GROWS: 33 until the styling refresh (Plan A Task 1, 2026-09-29) added 11 rows, then 44 until UX fixes T1 (owner U5/U8, 2026-10-02) added 8 (the field ring on four grounds, and textAccent and the accent fill on the stepped track/well; 23.001/23.007; two candidate rows, textAccent and textSubtle on surfaceRaised, were already present). A floor removed is a guarantee removed, and it would show here first.
    // No two rows share a pair: a duplicate is a row that guards nothing new but inflates the count below (UX fixes T1
    // fix 1). Asserted BEFORE the count so a re-added copy fails here, by name, and not only as a number that moved.
    expect(new Set(CONTRAST_PAIRS.map((pair) => `${pair.fg}|${pair.bg}`)).size, 'duplicate fg|bg rows').toBe(CONTRAST_PAIRS.length);
    expect(CONTRAST_PAIRS.length).toBe(52);
    // And no minimum sits below the floor these rows exist to state, so
    // "re-cleared" cannot have been reached by relaxing a bar to meet a result.
    expect(CONTRAST_PAIRS.every((pair) => pair.minimum >= 3)).toBe(true);
    // The five roles T5 added are GROUNDS (chips, banners), which no
    // CONTRAST_PAIRS row names — so their obligation is measured here rather
    // than left as an unstated assumption.
    for (const role of ['danger', 'warning', 'success'] as const) {
      const text = `${role}Text` as const;
      expect(
        contrastRatio(colorOf('light', text, 'neo'), colorOf('light', role, 'neo')),
        `neo/light: ${text} on ${role}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    /*
     * `contested` / `restricted` / `customMarker` have no `*Text` role of their
     * own. **That is not the same as "never used as text", which the first
     * draft of this comment claimed and an independent reviewer falsified.**
     * `contested` IS read text today: `.gn-sync-status-bar__failed` sets
     * `color: var(--gn-contested)` on `background: var(--gn-surface)`
     * (`packages/ui/src/ui.css:2602`, consumed at
     * `packages/app-core/src/sync/sync-status-bar.tsx:85`, 13.6px normal
     * weight — so AA wants 4.5, not the 3 the `CONTRAST_PAIRS` row declares).
     * `restricted` is text too (`.gn-ticket-sheet__restricted`).
     *
     * **So the declared `{ contested, surface, minimum: 3 }` row is a non-text
     * floor standing in for a text job, and in `hig`/`minimal` LIGHT the real
     * requirement is not met: 4.3746 against 4.5.** PRE-EXISTING — this change
     * neither caused nor moved it (it is the same `magenta600` value either
     * side), and `neo` light is 6.02, so T5 incidentally FIXED it in the one
     * style it touched.
     *
     * It is asserted below at its ACTUAL value rather than blessed at 3: a
     * `toBeGreaterThanOrEqual(3)` here would pass on a real AA failure and read
     * as a guarantee. Same shape as case 13.360's `surfaceSunken` half.
     * Owner: whoever next touches `.gn-sync-status-bar` or the `contested` role.
     * The siblings are recorded with it — measured on `hig`/minimal light,
     * `warning` is 4.2485 and `danger` is 4.4013 against the same surface, and
     * NO `CONTRAST_PAIRS` row names either pair at all.
     */
    expect(
      contrastRatio(colorOf('light', 'contested'), colorOf('light', 'surface')),
      'hig/minimal light: contested as TEXT on surface — below AA. Recorded, not blessed.',
    ).toBeLessThan(4.5);
    expect(
      contrastRatio(colorOf('light', 'contested', 'neo'), colorOf('light', 'surface', 'neo')),
      'neo/light: the same pair, which T5 moved ABOVE 4.5',
    ).toBeGreaterThanOrEqual(4.5);
    // For these two the 3:1 row is slack rather than a stand-in — they clear
    // the TEXT floor in every light style, so nothing is being papered over.
    for (const role of ['restricted', 'customMarker'] as const) {
      expect(
        contrastRatio(colorOf('light', role), colorOf('light', 'surface')),
        `hig/minimal light: ${role} against surface`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  /**
   * 16.84 — `danger` as TEXT on **`surfaceRaised`**, which is the ground the
   * ticket sheet's `Delete` control actually sits on.
   *
   * ## Why this pair is asserted when `danger` on `surface` is recorded as BELOW AA
   *
   * The case above measures `danger` on `surface` at **4.4013** in hig/minimal
   * light and records it, un-blessed, with no `CONTRAST_PAIRS` row naming the
   * pair. **That is not the ground this control has.** The sheet's own footer
   * sits inside `.gn-sheet`, which is `background: var(--gn-surface-raised)`
   * (`ui.css:353`), and the prototype's `Delete` is danger INK on a transparent
   * ground (`desktop.dc.html:1372`). Measured there, the pair clears 4.5 in all
   * six style×theme combinations.
   *
   * ## Why it is ENFORCED rather than written into a comment
   *
   * The `ui.css` block states the figures, and a figure that lives only in a
   * comment is the shape 16.83 was criticised for: recorded and nowhere
   * enforced, so a token edit could cross the floor with every suite green.
   * **Two controls bind this reading, and both are in the assertions below:**
   * `colorOf` must still answer the values `tokens.test.ts` pins elsewhere
   * (`#9e2a20` neo light, `#d70015` hig light), and the SAME computation must
   * still reproduce the recorded `surface` shortfall at 4.4013 — if either
   * drifts, this case is measuring a different token table and says so.
   *
   * 5.0392 is the worst of the six and is `hig`/`minimal` DARK — not the light
   * pair a reader would guess, which is why the loop asserts every combination
   * rather than the two light ones.
   */
  it('16.84 danger-as-ink on surfaceRaised clears AA in all six combinations, on the ground the Delete control really has', () => {
    // CONTROL 1 — the pinned primitive values, from the cases above.
    expect(colorOf('light', 'danger', 'neo')).toBe('#9e2a20');
    expect(colorOf('light', 'danger', 'hig')).toBe('#d70015');
    // CONTROL 2 — the same computation reproduces the RECORDED `surface`
    // shortfall, so this is reading the table the rest of this file reads.
    expect(
      contrastRatio(colorOf('light', 'danger'), colorOf('light', 'surface')),
      'danger on surface in hig/minimal light — the recorded 4.4013',
    ).toBeLessThan(4.5);

    for (const style of ['hig', 'minimal', 'neo'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        expect(
          contrastRatio(colorOf(theme, 'danger', style), colorOf(theme, 'surfaceRaised', style)),
          `${style}/${theme}: danger as ink on surfaceRaised — the Delete control's ground`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  /**
   * 10.160 (W1c, 2026-10-01) — `danger` as TEXT on **`surfaceWell`**, the ground of the quiet danger buttons
   * (`.gn-button--danger-quiet`, which "Remove rule", "Delete transition" and "Delete state" wear) inside the builder's
   * recessed row body. Same two controls as 16.84 bind the reading to THIS token table.
   */
  it('10.160 danger-as-ink on surfaceWell clears AA in all six combinations, on the ground the builder\'s danger buttons really have', () => {
    // CONTROL 1 — the pinned primitives.
    expect(colorOf('light', 'danger', 'neo')).toBe('#9e2a20');
    expect(colorOf('light', 'danger', 'hig')).toBe('#d70015');
    // CONTROL 2 — the same computation still reproduces the recorded `surface` shortfall (4.4013 < 4.5), so it reads the table the rest of the file reads.
    expect(contrastRatio(colorOf('light', 'danger'), colorOf('light', 'surface'))).toBeLessThan(4.5);
    for (const style of ['hig', 'minimal', 'neo'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        const well = colorOf(theme, 'surfaceWell', style);
        expect(
          contrastRatio(colorOf(theme, 'danger', style), well),
          `${style}/${theme}: danger as ink on surfaceWell — the quiet danger buttons' ground`,
        ).toBeGreaterThanOrEqual(4.5);
        // The HOVER state keeps this same ground (a danger ring, no wash — see the control below), so the ratio above IS the hover ratio.
      }
    }
    // CONTROL — why the hover is a ring and not `.gn-button--ghost`'s `fillQuaternary` wash: danger ink on that wash over the
    // well is 4.18 in hig/minimal light (4.47 dark), below 4.5. If a token edit lifts it, this fails and says the wash is back on the table.
    const lightWell = colorOf('light', 'surfaceWell', 'hig');
    expect(contrastRatio(colorOf('light', 'danger', 'hig'), over(colorOf('light', 'fillQuaternary', 'hig'), lightWell))).toBeLessThan(4.5);
  });
});

/**
 * The settings → workflows card grid's state chip and its category bar. Case
 * **13.920** (`test-cases/13-deployment-dogfooding.md`).
 *
 * TWO MEASUREMENTS, and they are two because the chip and the bar answer
 * different questions.
 *
 * **The bar carries DATA, so it owes a ratio.** `WorkflowState.category` is
 * `'open' | 'active' | 'terminal'` (`packages/domain/src/workflow.ts:3-7`) — the
 * bar is the only thing on the chip that says WHICH category, so it is a
 * non-text element conveying information and WCAG 1.4.11 holds it to 3:1
 * against what it sits on. It is measured against the COMPOSITE, because the
 * chip's own fill is alpha-free but its ground is not always what it looks like;
 * the same reasoning case 13.732 records for the avatar.
 *
 * **The chip's fill is a depth problem, and the measurement is what says so.**
 * The prototype fills a state chip with `--trayBg` (`desktop.dc.html:3184`),
 * which is `--gn-surface-sunken` on this product's role layer — and under `neo`
 * `surface`, `surfaceRaised` and `surfaceSunken` are the SAME hex (in LIGHT; neo dark's raised
 * stepped to `#232c50` with UX T1, 2026-10-02, see the dark half below), so a chip on a
 * `.gn-card` composites to exactly the card's own colour and its fill draws no
 * boundary at all. **That is asserted here as a fact about the palette**
 * (1.0000, both themes, exactly as case 13.732 asserts it for the avatar), which
 * is what makes the `[data-style="neo"]` shadow in `ui.css` load-bearing rather
 * than decorative — the chip's boundary comes from the shadow under `neo` and
 * from the fill under the other two styles.
 *
 * The roles are read OUT of `ui.css`, not named here, for the reason 13.732
 * gives: a case that hard-codes the role stays green through a repoint.
 */
describe('13.920 — a workflow state chip keeps a boundary under neo, and its category bar clears 3:1 on the chip', () => {
  /** `src` over `dst` — the compositing `relativeLuminance` deliberately lacks. */
  const over = (src: string, dst: string): string => {
    const hex = (h: string, i: number): number => Number.parseInt(h.slice(i, i + 2), 16);
    const alpha = src.length === 9 ? hex(src, 7) / 255 : 1;
    const channel = (i: number): number =>
      Math.round(hex(src, i) * alpha + hex(dst, i) * (1 - alpha));
    return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
  };

  const declarationsFor = (css: string, selector: string): string | null => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? null;
  };

  const UI_CSS_TEXT = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');

  const declaredRole = (selector: string, declarations: string, property: 'background' | 'color'): TokenRole => {
    const named = new RegExp(`(?:^|[\\s;])${property}:\\s*var\\(--gn-([a-z-]+)\\)`).exec(declarations)?.[1];
    if (named === undefined) {
      throw new Error(`${selector} declares no \`${property}: var(--gn-…)\`; it reads: ${declarations.trim()}`);
    }
    const role = TOKEN_ROLES.find((candidate) => cssVariableName(candidate) === `--gn-${named}`);
    if (role === undefined) {
      throw new Error(`${selector}'s ${property} names --gn-${named}, which is not a role in TOKEN_ROLES`);
    }
    return role;
  };

  const CATEGORY_BAR_SELECTORS = [
    '.workflow-list__state-bar--open',
    '.workflow-list__state-bar--active',
    '.workflow-list__state-bar--terminal',
  ] as const;

  it('every category bar clears 3:1 against the chip composite, in every style and theme', () => {
    const chipBody = declarationsFor(UI_CSS_TEXT, '.workflow-list__state');
    if (chipBody === null) throw new Error('.workflow-list__state rule not found in ui.css');
    const chipFill = declaredRole('.workflow-list__state', chipBody, 'background');

    for (const selector of CATEGORY_BAR_SELECTORS) {
      const body = declarationsFor(UI_CSS_TEXT, selector);
      if (body === null) throw new Error(`${selector} rule not found in ui.css`);
      const barRole = declaredRole(selector, body, 'background');

      for (const style of STYLE_NAMES) {
        for (const theme of THEME_NAMES) {
          const card = colorOf(theme, 'surfaceRaised', style);
          const chip = over(colorOf(theme, chipFill, style), card);
          expect(
            contrastRatio(colorOf(theme, barRole, style), chip),
            `${style}/${theme}: ${selector}'s bar no longer clears 3:1 on the chip it sits on`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('the chip fill collapses onto the card under neo — which is why the neo rule supplies the boundary', () => {
    const chipBody = declarationsFor(UI_CSS_TEXT, '.workflow-list__state');
    if (chipBody === null) throw new Error('.workflow-list__state rule not found in ui.css');
    const chipFill = declaredRole('.workflow-list__state', chipBody, 'background');

    // The measured fact the shadow exists for, stated for BOTH themes rather
    // than one, and asserted as equality so a future palette that separates the
    // surface roles reddens here — which would be the signal to re-derive the
    // rule rather than to keep a shadow that had stopped being needed.
    //
    // Amended UX T1 (owner U8, 2026-10-02; 23.006): neo/dark's raised surface stepped to `#232c50`, so in DARK the chip
    // (`surfaceSunken`, still `neoNavy`) no longer composites to exactly the card. It is a 1.14 step, though, well under
    // the 3:1 a boundary owes, so the shadow is still the chip's boundary and the premise holds in the weaker form
    // asserted for dark below: still no boundary by fill alone.
    const lightCard = colorOf('light', 'surfaceRaised', 'neo');
    expect(
      over(colorOf('light', chipFill, 'neo'), lightCard),
      `neo/light: the chip fill no longer collapses onto the card, so this case's premise has moved`,
    ).toBe(lightCard);
    const darkCard = colorOf('dark', 'surfaceRaised', 'neo');
    expect(
      contrastRatio(over(colorOf('dark', chipFill, 'neo'), darkCard), darkCard),
      `neo/dark: the chip fill now separates from the card by 3:1 or more, so the shadow is no longer what supplies the boundary`,
    ).toBeLessThan(3);

    // THE CONTROL, and it is the whole reason the paragraph above is a claim
    // about `neo` rather than about the palette: under hig/minimal the two roles
    // DO differ, so the same fill draws a boundary with no shadow at all.
    for (const style of ['hig', 'minimal'] as const) {
      const card = colorOf('light', 'surfaceRaised', style);
      expect(
        over(colorOf('light', chipFill, style), card),
        `${style}/light now collapses too — the shadow is no longer the only boundary under neo`,
      ).not.toBe(card);
    }

    // And the shadow is actually declared, on the token layer rather than as a
    // literal — the half a palette measurement cannot see.
    const neoBody = declarationsFor(UI_CSS_TEXT, '[data-style="neo"] .workflow-list__state');
    if (neoBody === null) throw new Error('[data-style="neo"] .workflow-list__state rule not found in ui.css');
    expect(neoBody, 'the neo override must take its shadow from the token layer').toMatch(
      /box-shadow:\s*var\(--gn-shadow-[a-z-]+\)/,
    );
  });
});

/**
 * The ticket-type list's ZEBRA — case **13.894**, the measured half
 * (`packages/app-core/test/ticket-types/ticket-types.test.tsx` carries the
 * render half and the DOM precondition).
 *
 * **A zebra has two properties and a rule-exists check witnesses neither.** The
 * first is its PARITY — the prototype stripes `(i % 2 ? …)` over a 0-based `i`
 * (`desktop.dc.html:3159`, blob `6d7b67c0a52c`), so the tint falls on the
 * **1-indexed EVEN** rows. That is the whole content of the construct and it is
 * silently invertible: **two families in this repo already inverted it**
 * (`.gn-list__table-row`, `ui.css:1088`; `.gn-timeline__row`, `:2703` — both
 * `odd`). The second is that the stripe is VISIBLE — a fill that composites to
 * its own ground is a stripe that draws nothing, the identical defect class
 * 13.920 measured for the state chip under `neo`.
 *
 * **What the control does and does not prove, because a control is where this
 * repo's defects hide.** The parity case reads the selector out of `ui.css`, so
 * the parity it asserts is the stylesheet's and not this file's. The control
 * then reads the two inverted siblings **through the same instrument, on the
 * same token**, and asserts their parity is the OTHER one — proving the two
 * parity strings are distinguishable here and that this rule is not merely
 * matching a sibling. **It does not prove how a browser stripes**, which needs a
 * rendered page and which no case in this repo has; and it does not prove the
 * siblings are *harmonised*, because nothing here changes them. Both limits are
 * stated rather than left to be inferred from a green tick.
 *
 * **The ground is the CARD, not the row.** The zebra rule REPLACES
 * `.ticket-type-list__row`'s own `background` rather than layering over it — one
 * element paints one background — and neither `.ticket-type-list__rows` nor
 * `.ticket-type-list__card` sets one, so the translucent stripe composites over
 * `.gn-card`'s `--gn-surface-raised`. The first draft of this case measured
 * against `surfaceSunken`, the fill the stripe replaces, and two of its four
 * pinned readings therefore described a layer that is not on screen. Under `neo`
 * LIGHT the two roles are the same hex (`neoPaper`), which is why the error hid there
 * and only showed under `hig` (neo dark's raised stepped to `#232c50` with UX T1). 13.920 composites its chip over `surfaceRaised`
 * for the same reason.
 *
 * Amended 2026-09-29 by 20.351 (styling refresh Plan B): the row is now a raised
 * item (`surface-raised` + `shadow-lift`, P-ROW) rather than a sunken one. The
 * ground stays the CARD — an even row's stripe still REPLACES the row's own
 * background (one element paints one background), so it composites over
 * `.gn-card`'s `surface-raised` exactly as before and every measured reading
 * below is unchanged; what an even row keeps of P-ROW is its `shadow-lift`.
 */
describe('13.894 — the ticket-type list stripes the 1-indexed EVEN rows, and the stripe is visible', () => {
  const ZEBRA = '.ticket-type-list__rows li:nth-child(even) .ticket-type-list__row';
  const ZEBRA_HOVER = '.ticket-type-list__rows li .ticket-type-list__row:hover';
  const UI_CSS_TEXT = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');

  /** `src` over `dst` — the compositing `relativeLuminance` deliberately lacks. */
  const over = (src: string, dst: string): string => {
    const hex = (h: string, i: number): number => Number.parseInt(h.slice(i, i + 2), 16);
    const alpha = src.length === 9 ? hex(src, 7) / 255 : 1;
    const channel = (i: number): number => Math.round(hex(src, i) * alpha + hex(dst, i) * (1 - alpha));
    return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
  };

  const declarationsFor = (css: string, selector: string): string | null => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? null;
  };

  it('the parity is EVEN, and the two inverted families read ODD — the control', () => {
    // LOOK THIS STRING UP IN THE FILE FIRST. It is what makes the parity
    // assertions below facts about `ui.css` rather than about a literal in this
    // test: if the selector is not in the stylesheet, nothing after it means
    // anything, and this read is the only reason a `toMatch` on `ZEBRA` is not
    // a tautology.
    expect(declarationsFor(UI_CSS_TEXT, ZEBRA), `${ZEBRA} not found in ui.css`).not.toBeNull();
    expect(ZEBRA).toMatch(/:nth-child\(even\)/);
    expect(ZEBRA).not.toMatch(/odd/);

    // THE CONTROL — same instrument, same TOKEN, the OPPOSITE parity, on the
    // two families this port measured as inverted. See the docblock for what
    // this does and does not prove.
    const inverted = [
      { selector: '.gn-list__table-row:nth-child(odd)', label: 'gn-list' },
      { selector: '.gn-timeline__row:nth-of-type(odd)', label: 'gn-timeline' },
    ] as const;
    const siblingParities = new Set<string>();
    for (const { selector, label } of inverted) {
      const body = declarationsFor(UI_CSS_TEXT, selector);
      expect(body, `control: ${label} not found in ui.css`).not.toBeNull();
      // The SAME token, so parity is the only thing that differs between the
      // control and the rule under test.
      expect(body, `control: ${label} must stripe with the same token`).toMatch(
        /background:\s*var\(--gn-fill-quaternary\)/,
      );
      const parity = /:nth-(?:child|of-type)\((odd|even)\)/.exec(selector)?.[1];
      expect(parity, `control: ${label} carries no parity`).toBe('odd');
      siblingParities.add(parity!);
    }
    // A SET DIFFERENCE rather than a count: the control agrees with the rule
    // under test on the token and disagrees on the parity, and that difference
    // is the whole claim.
    expect(siblingParities.has('even')).toBe(false);
  });

  it('the stripe differs from the row it sits on, in every style and theme', () => {
    // THE ROLE IS READ OUT OF THE RULE, never named here. Hard-coding it would
    // make this test a statement about the palette that no CSS edit could ever
    // falsify — it would go on passing while the row was striped with something
    // else entirely, or with the ground itself. That is the shape 13.920 avoids
    // by declaring no token names, and a mutation proved it matters: repointing
    // the stripe to `--gn-surface-sunken` left a hard-coded version green.
    const body = declarationsFor(UI_CSS_TEXT, ZEBRA);
    if (body === null) throw new Error(`${ZEBRA} rule not found in ui.css`);
    const named = /(?:^|[\s;])background:\s*var\(--gn-([a-z-]+)\)/.exec(body)?.[1];
    if (named === undefined) {
      throw new Error(`${ZEBRA} declares no \`background: var(--gn-…)\`; it reads: ${body.trim()}`);
    }
    const stripeRole = TOKEN_ROLES.find((candidate) => cssVariableName(candidate) === `--gn-${named}`);
    if (stripeRole === undefined) {
      throw new Error(`${ZEBRA}'s background names --gn-${named}, which is not a role in TOKEN_ROLES`);
    }
    // The prototype's `--fill4` maps to `--gn-fill-quaternary` (the mapping
    // `.gn-members__row` already ships for this construct,
    // `apps/web/app/globals.css:1524`); a repoint to any OTHER visible role
    // still has to keep the stripe visible below, and this says which one it
    // is meant to be.
    expect(stripeRole).toBe('fillQuaternary');

    // THE GROUND IS THE CARD, NOT THE ROW'S OWN FILL. The zebra rule REPLACES
    // `.ticket-type-list__row`'s background rather than layering over it — one
    // element paints one background — and neither `.ticket-type-list__rows` nor
    // `.ticket-type-list__card` sets one, so what is behind the translucent
    // stripe is `.gn-card`'s fill. Read from that rule, not named here.
    const cardBody = declarationsFor(UI_CSS_TEXT, '.gn-card');
    if (cardBody === null) throw new Error('.gn-card rule not found in ui.css');
    const groundNamed = /(?:^|[\s;])background:\s*var\(--gn-([a-z-]+)\)/.exec(cardBody)?.[1];
    if (groundNamed === undefined) {
      throw new Error(`.gn-card declares no \`background: var(--gn-…)\`; it reads: ${cardBody.trim()}`);
    }
    const groundRole = TOKEN_ROLES.find((candidate) => cssVariableName(candidate) === `--gn-${groundNamed}`);
    if (groundRole === undefined) throw new Error(`.gn-card's ground names --gn-${groundNamed}`);
    // The intermediary is asserted to carry no fill of its own, so the card
    // really is the layer behind the row rather than an assumption.
    for (const between of ['.ticket-type-list__card', '.ticket-type-list__rows']) {
      const body = declarationsFor(UI_CSS_TEXT, between);
      expect(body, `${between} not found in ui.css`).not.toBeNull();
      expect(body, `${between} must not paint between the card and the stripe`).not.toMatch(
        /(?:^|[\s;])background:/,
      );
    }

    const measured: Record<string, number> = {};
    for (const style of STYLE_NAMES) {
      for (const theme of THEME_NAMES) {
        const ground = colorOf(theme, groundRole, style);
        const stripe = over(colorOf(theme, stripeRole, style), ground);
        const ratio = contrastRatio(ground, stripe);
        measured[`${style}/${theme}`] = ratio;
        expect(ratio, `${style}/${theme}: the stripe composites onto its own ground and draws nothing`).toBeGreaterThan(
          1.05,
        );
      }
    }
    // The floor above is the guarantee; these are the readings it was set from,
    // so a palette nudge that keeps the case green still shows up as a movement.
    // All six combinations are pinned, not four: `minimal` shares `hig`'s
    // primitives today, and a palette edit that separated them would otherwise
    // move a measured value with nothing to catch it.
    expect(measured['hig/light']).toBeCloseTo(1.1026, 3);
    expect(measured['hig/dark']).toBeCloseTo(1.2727, 3);
    expect(measured['minimal/light']).toBeCloseTo(1.1026, 3);
    expect(measured['minimal/dark']).toBeCloseTo(1.2727, 3);
    expect(measured['neo/light']).toBeCloseTo(1.0757, 3);
    // neo/dark moved 1.1727 -> 1.1684 with UX T1 (owner U8, 2026-10-02): the card the stripe sits on is now `#232c50`.
    expect(measured['neo/dark']).toBeCloseTo(1.1684, 3);
  });

  it('the h2 carries the prototype metrics, so the third string is ported and not just relabelled', () => {
    // The dispatch names THREE strings and two of them are witnessed in the
    // component half (the action label, the summary sentence). This is the
    // third: the heading's own TEXT never changed — only its metrics — so a
    // component test that asserts the class cannot see it, and the port would
    // otherwise be unpinned.
    const body = declarationsFor(UI_CSS_TEXT, '.ticket-type-list__title');
    if (body === null) throw new Error('.ticket-type-list__title rule not found in ui.css');
    // `20px/25px/600` at `desktop.dc.html:820`, carried as rem at the 16px root — and, since UX fixes Task 5 (case 23.072,
    // AMENDED 2026-10-02), read through the section-title token, whose value IS that 20px.
    expect(body).toMatch(/font-size:\s*var\(--gn-title-section\)/);
    expect(titleScale.section.size).toBe('1.25rem');
    expect(body).toMatch(/line-height:\s*1\.5625rem/);
    expect(body).toMatch(/font-weight:\s*600/);
    // The metrics are the delta; the text is not. Stated so a reader does not
    // mistake this for a copy change.
    expect(body).not.toMatch(/content:/);
  });

  it('hover still wins on a striped row — the tie is broken by source order, not by !important', () => {
    // A striped row matches BOTH rules. They carry equal specificity (3 classes,
    // 1 element each), so the later one wins; if the hover rule were left as the
    // bare `.ticket-type-list__row:hover` it would lose to the stripe and hover
    // would silently stop responding on exactly the even rows.
    const stripeAt = UI_CSS_TEXT.indexOf(ZEBRA);
    const hoverAt = UI_CSS_TEXT.indexOf(ZEBRA_HOVER);
    expect(stripeAt, 'the zebra rule must exist').toBeGreaterThanOrEqual(0);
    expect(hoverAt, 'the hover rule must exist at the raised selector').toBeGreaterThanOrEqual(0);
    expect(hoverAt, 'hover must come AFTER the stripe to win the specificity tie').toBeGreaterThan(stripeAt);
    expect(declarationsFor(UI_CSS_TEXT, ZEBRA_HOVER)).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);
    // `hover` keeps the `li` that raises it to the tie — the bare selector is
    // the shape that loses, so its absence is the assertion.
    expect(declarationsFor(UI_CSS_TEXT, '.ticket-type-list__row:hover')).toBeNull();

    // `!important` is the OTHER way this tie gets broken, and the name of this
    // case claims it is not the way — so it is READ, not assumed. Without this
    // the whole case would still pass with `!important` on the stripe, which is
    // exactly the defect it exists to prevent: hover dying silently on the
    // striped rows.
    const stripeBody = declarationsFor(UI_CSS_TEXT, ZEBRA);
    expect(stripeBody, `${ZEBRA} not found in ui.css`).not.toBeNull();
    expect(stripeBody, 'the stripe must not reach for !important').not.toMatch(/!\s*important/);
    expect(declarationsFor(UI_CSS_TEXT, ZEBRA_HOVER), 'nor may hover').not.toMatch(/!\s*important/);
  });
});

/**
 * 13.899 — the switch is ONE rule set, in `ui.css`, and its two states are
 * distinguishable.
 *
 * The 2026-09-18 extraction moved `/account`'s notification switch into
 * `@gisik-nokma/ui` so the Settings → Workspace tab could use it without a
 * second copy — the ruling was *"extract it into a shared component and use it
 * in both places rather than copying its CSS; two toggles that drift is the
 * divergence this repo keeps paying for."*
 *
 * **What this case can and cannot see, named rather than implied.** It reads
 * DECLARATIONS out of `ui.css` and resolves their roles through `colorOf`. It
 * does NOT measure a rendered pixel: the track is an alpha fill, so its true
 * contrast against the knob's ring is a COMPOSITING question this instrument is
 * blind to by construction — the same limit `13.894` states for its stripe. What
 * it proves is the two things drift would actually break: that there is exactly
 * one switch rule set, and that the two states are not painted alike.
 */
describe('13.899–13.901 — the shared switch and the info tip, as declarations in ui.css', () => {
  const UI_CSS_TEXT = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
  const GLOBALS_CSS_TEXT = readFileSync(join(REPO_ROOT, 'apps/web/app/globals.css'), 'utf8');

  /**
   * EVERY rule body that names `selector`, not just the first.
   *
   * This exists because the first-match instrument was WRONG here, in the way
   * that costs the most: it made a case fail for a reason unrelated to what it
   * named. `.gn-account__notification-row` is also the TRAILING member of a
   * four-selector list in `globals.css`
   * (`.gn-account__session-row, .gn-account__workspace-row,
   * .gn-account__passkey-row, .gn-account__notification-row { … }`), and that
   * block comes FIRST in the file. A `^`-anchored first-match read therefore
   * returned the SHARED ROW base rule — width, `flex-wrap`, `min-height` — and
   * the edge-alignment assertion reported a declaration missing that is present
   * eighty lines below it.
   */
  const allDeclarationsFor = (css: string, selector: string): string[] => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...css.matchAll(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'gm'))].map((m) => m[1] ?? '');
  };

  const declarationsFor = (css: string, selector: string): string | null => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? null;
  };
  const declaredRole = (selector: string, declarations: string, property: string): TokenRole => {
    // `[^;]*?` rather than nothing between the colon and the var: the knob's
    // ring is written `border: 1px solid var(--gn-border-strong)`, and a strict
    // `property:\s*var(` would have silently declared the rule unreadable — the
    // instrument refusing the input it was built to read is at least loud, but
    // it is still an instrument that did not measure what it named.
    const named = new RegExp(`(?:^|[\\s;])${property}:\\s*[^;]*?var\\(--gn-([a-z-]+)\\)`).exec(declarations)?.[1];
    if (named === undefined) {
      throw new Error(`${selector} declares no \`${property}: var(--gn-…)\`; it reads: ${declarations.trim()}`);
    }
    const role = TOKEN_ROLES.find((candidate) => cssVariableName(candidate) === `--gn-${named}`);
    if (role === undefined) {
      throw new Error(`${selector}'s ${property} names --gn-${named}, which is not a role in TOKEN_ROLES`);
    }
    return role;
  };

  it('the switch is declared here, and the account-scoped rule it replaced is gone — the control', () => {
    // The not-null reads are what make everything below a fact about `ui.css`
    // rather than about a literal in this file.
    expect(declarationsFor(UI_CSS_TEXT, '.gn-switch'), '.gn-switch not found in ui.css').not.toBeNull();
    expect(
      declarationsFor(UI_CSS_TEXT, '.gn-switch::after'),
      '.gn-switch::after not found in ui.css',
    ).not.toBeNull();

    // THE CONTROL, through the SAME instrument on the file the rules moved OUT
    // of. Asserting only that ui.css has them would pass just as well if the
    // originals had been left behind — which is precisely the "two toggles that
    // drift" state the extraction exists to prevent.
    //
    // **Strengthened after review, and both halves of the fix matter.** The
    // first version read ONE selector through the FIRST-MATCH `declarationsFor`
    // helper — so a leftover `.gn-account__notification-row
    // input[type='checkbox']:checked` (or `::after`, or `:focus-visible`)
    // survived it, and would still restyle `/account`'s switch, because the
    // shared `Switch` renders exactly that input. The removed block had five
    // selector bodies, not one. Comments are stripped first, so this change's
    // own prose about the move cannot satisfy the check, and the instrument is
    // proved able to see the shape it claims is absent.
    const LEFT_BEHIND = /\.gn-account__notification-row[^{}]*input\[type=['"]checkbox['"]\][^{}]*\{/;
    const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

    // SELF-TEST: the instrument fires on the ORIGINAL rule. Without this the
    // absence assertion below would pass just as well if the regex were wrong.
    for (const body of ['', ':checked', '::after', ':checked::after', ':focus-visible']) {
      expect(
        LEFT_BEHIND.test(
          `.gn-account__notification-row input[type='checkbox']${body} { color: var(--gn-text); }`,
        ),
        `the instrument cannot see a leftover \`…input[type='checkbox']${body}\` rule`,
      ).toBe(true);
    }
    expect(
      LEFT_BEHIND.test(withoutComments(GLOBALS_CSS_TEXT)),
      'the pre-extraction switch rule is still in globals.css — there are now two switch rule sets',
    ).toBe(false);
  });

  it('the trailing-edge alignment stays on the ACCOUNT row, not on the shared switch', () => {
    // The split this extraction had to get right, and the one a careless hoist
    // gets wrong: `/account`'s rows are full-width and want their switch at the
    // trailing edge, while a switch in a form field wants its control beside its
    // own label. Carrying `justify-content: space-between` into the shared
    // `.gn-switch-row` would have made the Settings → Workspace switch jump to
    // the far edge of its card — a visual defect no case above can see, because
    // both rules would still exist and both states would still differ.
    const sharedRow = allDeclarationsFor(UI_CSS_TEXT, '.gn-switch-row');
    const accountRow = allDeclarationsFor(GLOBALS_CSS_TEXT, '.gn-account__notification-row');
    expect(sharedRow.length, '.gn-switch-row not found in ui.css').toBeGreaterThan(0);
    expect(accountRow.length, '.gn-account__notification-row not found in globals.css').toBeGreaterThan(0);
    // EVERY body, in both directions: the shared row must edge-align in none of
    // its rules, and the account row must edge-align in at least one of its own.
    for (const body of sharedRow) {
      expect(body, 'the shared row must NOT edge-align its control').not.toMatch(/justify-content/);
    }
    expect(
      accountRow.some((body) => /justify-content:\s*space-between/.test(body)),
      'no rule on the account row edge-aligns its switch',
    ).toBe(true);
  });

  it('the checked track is painted with a different role from the unchecked one, in every style and theme', () => {
    const base = declarationsFor(UI_CSS_TEXT, '.gn-switch');
    const checked = declarationsFor(UI_CSS_TEXT, '.gn-switch:checked');
    if (base === null || checked === null) throw new Error('.gn-switch rules not found in ui.css');
    const offRole = declaredRole('.gn-switch', base, 'background');
    const onRole = declaredRole('.gn-switch:checked', checked, 'background');

    // A SET DIFFERENCE, not a count: the two states must name different roles
    // AND resolve to different values in every style×theme. Naming different
    // roles but resolving to one hex is exactly the `neo`-collapses-the-fills
    // failure this suite has already recorded for `surface`/`surfaceRaised`/
    // `surfaceSunken` — and it would look correct in the source.
    expect(onRole).not.toBe(offRole);
    for (const style of STYLE_NAMES) {
      for (const theme of THEME_NAMES) {
        expect(
          colorOf(theme, onRole, style),
          `${style}/${theme}: the ON and OFF tracks resolve to the same colour — the switch shows no state`,
        ).not.toBe(colorOf(theme, offRole, style));
      }
    }
  });

  it('the knob keeps a ring that is a different role from the knob fill it sits on', () => {
    const knob = declarationsFor(UI_CSS_TEXT, '.gn-switch::after');
    if (knob === null) throw new Error('.gn-switch::after not found in ui.css');
    const knobFill = declaredRole('.gn-switch::after', knob, 'background');
    const knobRing = declaredRole('.gn-switch::after', knob, 'border');

    // The claim the original rule was written for: the ring is what guarantees
    // the knob has a visible edge where a bare raised fill would vanish into
    // the unchecked track. A ring resolving to the knob's OWN fill is a
    // boundary that is not drawn.
    expect(knobRing).not.toBe(knobFill);
    for (const style of STYLE_NAMES) {
      for (const theme of THEME_NAMES) {
        expect(
          colorOf(theme, knobRing, style),
          `${style}/${theme}: the knob's ring resolves to its own fill — no boundary is drawn`,
        ).not.toBe(colorOf(theme, knobFill, style));
      }
    }
  });

  it('13.901 the info panel keeps a boundary where the shadow cannot, and the trigger meets the 24px floor', () => {
    const panel = declarationsFor(UI_CSS_TEXT, '.gn-infotip__panel');
    if (panel === null) throw new Error('.gn-infotip__panel not found in ui.css');
    const trigger = declarationsFor(UI_CSS_TEXT, '.gn-infotip__trigger');
    if (trigger === null) throw new Error('.gn-infotip__trigger not found in ui.css');

    // THE BOUNDARY, and the reason it has to be a border rather than a fill or a
    // shadow. The panel is `surfaceRaised` and it sits on a CARD, which is also
    // `surfaceRaised` — the same role on the same role, so the fill separates
    // nothing. The shadow is real under hig and neo and `none` under minimal,
    // which is asserted rather than asserted-about: `SHADOWS.minimal.raised` is
    // `[]` in both themes, so a panel relying on it is invisible there. The
    // border is the only thing that draws the edge in all six combinations.
    expect(panel, 'the panel must declare a border').toMatch(/border:\s*1px solid var\(--gn-border\)/);
    for (const theme of THEME_NAMES) {
      expect(
        shadowValueOf('minimal', theme, 'raised'),
        'minimal has a raised shadow after all — this case\'s premise is stale',
      ).toBe('none');
    }
    // …and the same role as the ground it lands on, which is why fill cannot do
    // the job. Read OUT of both rules rather than named here.
    const cardFill = declaredRole('.gn-infotip__panel', panel, 'background');
    expect(cardFill).toBe('surfaceRaised');

    // THE 24px FLOOR (`ui.css:1246-1249`: dense in-list controls get 24). The
    // review measured the first version at exactly 20x20 — `globals.css:5` is
    // `* { box-sizing: border-box }`, so the declared box IS the hit area, and
    // `padding: 0` means no invisible slack either.
    const rem = (property: string): number => {
      const found = new RegExp(`(?:^|[\\s;])${property}:\\s*([0-9.]+)rem`).exec(trigger)?.[1];
      if (found === undefined) throw new Error(`.gn-infotip__trigger declares no rem \`${property}\``);
      return Number(found) * 16;
    };
    expect(rem('width'), 'the trigger is under the 24px floor').toBeGreaterThanOrEqual(24);
    expect(rem('height'), 'the trigger is under the 24px floor').toBeGreaterThanOrEqual(24);
  });

  it('BOTH call sites reach the one component — the account rows and the workspace form', () => {
    // The extraction is only worth anything if both callers actually use it, so
    // this reads the two SOURCES rather than trusting the component's docblock.
    const account = readFileSync(
      join(REPO_ROOT, 'packages/app-core/src/account/notifications-section.tsx'),
      'utf8',
    );
    const workspaceForm = readFileSync(
      join(REPO_ROOT, 'apps/web/src/workspace-settings-form.tsx'),
      'utf8',
    );
    for (const [label, source] of [
      ['notifications-section.tsx', account],
      ['workspace-settings-form.tsx', workspaceForm],
    ] as const) {
      expect(source, `${label} no longer imports the shared Switch`).toMatch(
        /import \{[^}]*\bSwitch\b[^}]*\} from '@gisik-nokma\/ui'/,
      );
      expect(source, `${label} renders <Switch`).toMatch(/<Switch\b/);
      // …and neither has grown its own `<input type="checkbox">` back, which is
      // the shape a re-fork takes.
      expect(source, `${label} has a hand-rolled checkbox again`).not.toMatch(
        /<input[^>]*type=['"]checkbox['"]/,
      );
    }
  });
});

/**
 * 13.693 — the `green700` calibration is stated on the ground the light theme SHIPS.
 *
 * `tokens.ts:36-38` and the `green700` primitive's own line (`:117`) recorded
 * 4.40 / 5.40 for a long time. Those are the figures you get against PURE
 * WHITE, and white was the right ground until owner round 4 (2026-09-16)
 * repointed `successText` to `onColorWarmLight` `#fbf7f3`. Against the ground
 * the product actually ships the same two hexes measure 4.1233 and 5.0662.
 *
 * The conclusion never moved — Apple's green still fails 4.5, `green700` is
 * still the correct keeper — which is exactly why the arithmetic drifted
 * unnoticed: whoever quoted it forward got a plausible number, not an error.
 * This pins both grounds so the next reader inherits a measured pair rather
 * than a transcribed one.
 */
describe('13.693 — the green700 calibration is computed on the shipped ground', () => {
  it('13.693 pins successText on success at 5.0662 and Apple green at 4.1233, both on #fbf7f3', () => {
    // The ground IS the claim. Assert it first, or the ratios below could be
    // the white-ground figures and this test would still pass.
    expect(themes.light.successText).toBe('onColorWarmLight');
    expect(primitives.onColorWarmLight).toBe('#fbf7f3');

    const ground = colorOf('light', 'successText');
    expect(ground).toBe('#fbf7f3');

    const shipped = contrastRatio(ground, colorOf('light', 'success'));
    expect(shipped).toBeCloseTo(5.0661792, 6);
    expect(shipped).toBeGreaterThanOrEqual(4.5);

    const withApple = contrastRatio(ground, '#248a3d');
    expect(withApple).toBeCloseTo(4.1233220, 6);
    expect(withApple).toBeLessThan(4.5);

    // The stale pair, computed rather than quoted, so the size of the drift is
    // visible here: pure white sits a whole 0.33 apart on the counterfactual.
    expect(contrastRatio('#ffffff', colorOf('light', 'success'))).toBeCloseTo(5.4003956, 6);
    expect(contrastRatio('#ffffff', '#248a3d')).toBeCloseTo(4.3953380, 6);

    // Neither ground flips the DECISION — which is the whole reason this is a
    // documentation defect rather than a contrast one.
    expect(shipped).toBeGreaterThan(withApple);
  });
});

/**
 * Case `13.1146` — P24 — every rule that paints a token colour on
 * `surfaceSunken` names an fg role the roster actually declares for it.
 *
 * The finding's own second half: *"a sweep in the shape the extraction used
 * here — every rule painting a token colour on a token surface, each pair
 * required to appear in `CONTRAST_PAIRS` — is a gate-able check (it reads two
 * files and needs no browser), and it is the instrument this regime has never
 * had."* This is that instrument, deliberately scoped to `surfaceSunken`
 * because that is the surface the finding measured; widening it to every
 * surface is the right next move and is NOT claimed here.
 *
 * **The defect it catches, and why nothing else did:**
 * `.ticket-type-editor__issues` set `color: var(--gn-danger)` on
 * `background: var(--gn-surface-sunken)` at 12.8px — 3.844 in `hig`/`minimal`
 * light, 4.191 dark, both below 4.5 — and the pair was in no `CONTRAST_PAIRS`
 * row, so the enforcement loop above never evaluated it. A pair can only be
 * enforced if it is declared, and nothing was checking that a pair which
 * actually CO-OCCURS has been.
 *
 * A source scan, and it says so: it proves the roster COVERS the pair, not
 * that the pair passes — the loop above is what measures the ratios.
 */
describe('13.1146 token colours on surfaceSunken are declared pairs', () => {
  const UI_CSS_TEXT = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
  /** `surface-sunken` → `surfaceSunken`, the same transform `cssVariableName` inverts. */
  const toRole = (kebab: string): string => kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const declaredSunkenFgs = new Set(
    CONTRAST_PAIRS.filter((pair) => pair.bg === 'surfaceSunken').map((pair) => pair.fg),
  );

  /** Every `color: var(--gn-…)` sitting in a rule whose background is `surfaceSunken`. */
  function undeclaredOnSunken(css: string): string[] {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const found: string[] = [];
    for (const m of noComments.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const head = (m[1] ?? '').trim();
      const body = m[2] ?? '';
      if (head === '' || head.startsWith('@')) continue;
      if (!/background:\s*var\(--gn-surface-sunken\)/.test(body)) continue;
      const colour = body.match(/(?:^|;)\s*color:\s*var\(--gn-([a-z-]+)\)/);
      if (colour?.[1] === undefined) continue;
      const role = toRole(colour[1]);
      if (!declaredSunkenFgs.has(role as (typeof CONTRAST_PAIRS)[number]['fg'])) {
        found.push(`${head} -> color: var(--gn-${colour[1]})`);
      }
    }
    return found;
  }

  it('13.1146 the sweep can see a violation — planted, in the same path', () => {
    // CONTROL, FIRST and in both directions. Without it, a regex that matched
    // nothing would report "no violations" over a stylesheet that had lost the
    // family entirely — the same green-for-the-wrong-reason shape the sweep
    // exists to catch.
    const planted = `${UI_CSS_TEXT}\n.gn-zz-planted { background: var(--gn-surface-sunken); color: var(--gn-danger); }\n`;
    const found = undeclaredOnSunken(planted);
    expect(found, 'the sweep did not see a planted undeclared pair').toContain(
      '.gn-zz-planted -> color: var(--gn-danger)',
    );
    // And the declared-and-passing direction, so "finds something" is not the
    // only reading it can produce:
    const plantedOk = `${UI_CSS_TEXT}\n.gn-zz-planted { background: var(--gn-surface-sunken); color: var(--gn-text); }\n`;
    expect(undeclaredOnSunken(plantedOk)).toHaveLength(0);
  });

  it('13.1146 no rule in ui.css paints an undeclared token colour on surfaceSunken', () => {
    const violations = undeclaredOnSunken(UI_CSS_TEXT);
    expect(
      violations,
      `painted on surfaceSunken but absent from CONTRAST_PAIRS (declared fg roles there: ` +
        `${[...declaredSunkenFgs].join(', ')}): ${violations.join(' | ')}`,
    ).toEqual([]);
  });

  it('13.1146 the rule the finding named carries the tone on its BORDER, not its text', () => {
    // The fix is only correct if the danger signal survives it. `danger` as a
    // 3px non-text boundary owes 3:1, not 4.5, and clears it on this surface.
    const rule = UI_CSS_TEXT.match(/\.ticket-type-editor__issues\s*\{([^}]*)\}/);
    expect(rule, '`.ticket-type-editor__issues` has no rule').not.toBeNull();
    const body = rule?.[1] ?? '';
    expect(body).toMatch(/border-left:\s*3px solid var\(--gn-danger\)/);
    expect(body).toMatch(/color:\s*var\(--gn-text\)/);
    expect(body, 'the danger-toned TEXT came back').not.toMatch(/color:\s*var\(--gn-danger\)/);
  });
});

/**
 * Case `13.1146`, second arm — E4-32 — the advisories title does not override
 * its panel's ink with `warning`.
 *
 * `.advisories-panel` sets `background: var(--gn-surface-sunken)` **and**
 * `color: var(--gn-text-muted)`; `.advisories-panel__title` used to override the
 * second with `color: var(--gn-warning)`, which put **13.6px warning ink on that
 * sunken ground at 3.71:1** in `hig`/`minimal` light (rgb(178,80,0) on
 * rgb(228,216,204)) — below the 4.5 that text of that size owes. `neo` light
 * passed and all three darks passed, which is how a one-style failure stayed
 * invisible; and `warning` is a foreground **no `CONTRAST_PAIRS` row names on
 * any background**, so nothing measured the pair.
 *
 * **This arm exists because the sweep above CANNOT see it, and that limit is
 * the point of writing it here:** that sweep looks for a `color` and a
 * `background` in the SAME rule, and this pair is painted by a rule and its
 * CHILD. The instrument is narrower than the finding, so the finding gets its
 * own assertion rather than being folded into a sweep that would pass over it.
 * The tone is not lost by the fix — the panel's own `border-left: 3px dashed
 * var(--gn-warning)` carries it, at 3:1 as a non-text boundary.
 *
 * Amended 2026-09-29 by 20.351 (styling refresh Plan B): the panel's ground is
 * now `surface-well`, not `surface-sunken`, so the inherited-ink arm reads the
 * `textMuted`/`surfaceWell` pair (declared by Plan A 20.002) instead of
 * `textMuted`/`surfaceSunken`. The warning-edge and no-own-ink arms are unchanged.
 */
describe('13.1146 (second arm) the advisories title inherits a declared ink', () => {
  // Read HERE, not reused from the describe above: `UI_CSS_TEXT` is scoped to
  // that block, and a module-scope read would be a second copy of the same
  // path — the failure mode `check-case-citations` and this file's own
  // "one origin" rule both exist to prevent.
  const UI = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const bodyOf = (selector: string): string => {
    const m = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm').exec(UI);
    if (m?.[1] === undefined) throw new Error(`no rule for ${selector}`);
    return m[1];
  };

  it('13.1146 the title declares no ink of its own, so it inherits the panel\'s', () => {
    expect(bodyOf('.advisories-panel__title')).not.toMatch(/color:/);
  });

  it('13.1146 the panel it inherits from is a DECLARED pair on the well', () => {
    const panel = bodyOf('.advisories-panel');
    expect(panel).toMatch(/background:\s*var\(--gn-surface-well\)/);
    // The ink the title now inherits, and it must be one the roster holds on
    // this surface — otherwise the fix moves the failure rather than removing
    // it.
    expect(panel).toMatch(/color:\s*var\(--gn-text-muted\)/);
    expect(
      CONTRAST_PAIRS.some((pair) => pair.fg === 'textMuted' && pair.bg === 'surfaceWell'),
      'textMuted/surfaceWell is not a declared pair — the inherited ink is unchecked',
    ).toBe(true);
  });

  it('13.1146 the warning tone survives on the panel\'s edge, not its text', () => {
    expect(bodyOf('.advisories-panel')).toMatch(/border-left:\s*3px dashed var\(--gn-warning\)/);
  });
});
