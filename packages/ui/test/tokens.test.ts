import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers/colour-scan.js';
import {
  CONTRAST_PAIRS,
  SHADOW_ROLES,
  TOKEN_ROLES,
  colorOf,
  cssVariableName,
  fontStackOf,
  fontVariableName,
  primitives,
  radiusVariableName,
  shadowValueOf,
  shadowVariableName,
  themeStylesheet,
  themes,
  type FontRole,
  type StyleName,
  type ThemeName,
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
  it('every var(--gn-…) in ui.css names a declared role', () => {
    const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
    const referenced = [...new Set([...css.matchAll(/var\((--gn-[a-z0-9-]*)\)/g)].map((hit) => hit[1]))];
    const declared = new Set<string>([
      ...TOKEN_ROLES.map(cssVariableName),
      radiusVariableName('card'),
      radiusVariableName('control'),
      ...SHADOW_ROLE_NAMES.map(shadowVariableName),
      ...FONT_ROLE_NAMES.map(fontVariableName),
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
    const EXPECTED_SHADOW_ROLES = ['raised', 'sunken', 'overlay', 'sunken-compact', 'selected'] as const;
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
 * whole visual language is shadow-only depth in both themes now.
 *
 * Mutation: reintroduce `neo` into `DARK_SEPARATION_FLOORS` with any floor
 * above `1.0` → reddens, naming the exact regression this exemption guards
 * against (`neoNavyRaised`/`neoNavySunken` drifting away from `neoNavy`
 * again without updating this test to match).
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

  it('neo/dark: surface, surfaceRaised and surfaceSunken are the SAME hex — depth comes from shadow, not fill, matching neo/light', () => {
    const surface = colorOf('dark', 'surface', 'neo');
    const raised = colorOf('dark', 'surfaceRaised', 'neo');
    const sunken = colorOf('dark', 'surfaceSunken', 'neo');
    expect(raised).toBe(surface);
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
   * not as a shipped 4.40.
   */
  it('keeps green700 because Apple’s increased-contrast green fails successText at 4.40', () => {
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
    expect(withApple).toBeCloseTo(4.12, 1);
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
    // see `tokens.ts`'s `neoNavyRaised` docblock), and a darker background
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
    expect(primitives.textAccentLight).toBe('#325d97');
    expect(primitives.textAccentDark).toBe('#8bb1e6');
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
   * Mutation: reverting either primitive to a value that only clears the two
   * declared rows (e.g. the intermediate `#33619c`/pre-composite pass this
   * derivation actually went through) reddens this case alone.
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
    // The roster is unchanged in SIZE by this change — a floor removed is a
    // guarantee removed, and it would show up here first. (Features.md states
    // the same 33.)
    expect(CONTRAST_PAIRS.length).toBe(33);
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
});
