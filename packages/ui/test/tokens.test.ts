import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers/colour-scan.js';
import {
  CONTRAST_PAIRS,
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
  type ShadowRole,
  type StyleName,
  type ThemeName,
} from '../src/tokens.js';

const THEME_NAMES: ThemeName[] = ['light', 'dark'];
const STYLE_NAMES: StyleName[] = ['hig', 'minimal', 'neo'];
const SHADOW_ROLE_NAMES: ShadowRole[] = ['raised', 'sunken', 'overlay'];
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
    expect(withApple).toBeCloseTo(4.4, 1);
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
   * 13.360 — the retired accent hex measured, both directions. The neo-round
   * accent (`#3A6DB0`/`#7FA9E4`) is legible as a FILL (`accentText` on
   * `accent`, below) but NOT as text on a neutral surface — this pins the
   * actual regression the rest of Round 2d exists to close, so a future
   * reader can see the number rather than take the split on faith.
   *
   * Mutation: reverting `blue600`/`blue300` to the pre-Round-2d hexes
   * (`#0040dd`/`#409cff`) would flip this case's own assertions (both would
   * then clear 4.5) without touching `textAccent` at all — the two roles are
   * independent primitives now, which is the property this pins.
   */
  it("13.360 the retired accent hex does not clear 4.5 as text on a bare surface, in either theme", () => {
    expect(primitives.blue600).toBe('#3a6db0');
    expect(primitives.blue300).toBe('#7fa9e4');
    expect(contrastRatio(colorOf('light', 'accent'), colorOf('light', 'surface'))).toBeLessThan(4.5);
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
   */
  it('13.360 accentText on the new accent still clears 4.5 in both themes, unnudged', () => {
    expect(contrastRatio(colorOf('light', 'accentText'), colorOf('light', 'accent'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colorOf('dark', 'accentText'), colorOf('dark', 'accent'))).toBeGreaterThanOrEqual(4.5);
    expect(primitives.white).toBe('#ffffff');
    expect(primitives.navy900).toBe('#101625');
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
    expect(light).toBeCloseTo(2.87, 1);
    expect(dark).toBeGreaterThanOrEqual(4.5);
    // And no CONTRAST_PAIRS row was added to paper over it — the exemption is
    // stated in the `brand` role's docblock, not silently un-enforced.
    expect(CONTRAST_PAIRS.some((pair) => pair.fg === 'brand' || pair.bg === 'brand')).toBe(false);
  });
});
