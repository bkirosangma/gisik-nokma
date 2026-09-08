import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers/colour-scan.js';
import {
  CONTRAST_PAIRS,
  TOKEN_ROLES,
  colorOf,
  cssVariableName,
  primitives,
  radiusVariableName,
  shadowValueOf,
  shadowVariableName,
  themeStylesheet,
  themes,
  type ShadowRole,
  type StyleName,
  type ThemeName,
} from '../src/tokens.js';

const THEME_NAMES: ThemeName[] = ['light', 'dark'];
const STYLE_NAMES: StyleName[] = ['hig', 'minimal', 'neo'];
const SHADOW_ROLE_NAMES: ShadowRole[] = ['raised', 'sunken', 'overlay'];

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
    const shadowPrimitiveValues = new Set(shadowPrimitiveNames.map((name) => primitives[name as keyof typeof primitives]));
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
   * 13.284 — the fill does NOT carry identification and the accent label does, and the case asserts both halves.
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
        contrastRatio(colorOf(theme, 'accent'), filled),
        `${theme}: the accent label on a filled control no longer clears 4.5`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
