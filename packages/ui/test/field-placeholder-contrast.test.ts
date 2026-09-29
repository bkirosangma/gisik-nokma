import { describe, expect, it } from 'vitest';
import { colorOf, type StyleName, type ThemeName } from '../src/tokens.js';

/**
 * Case 18.306–18.307 — Unit 6d (owner, 2026-09-23: "Today placeholders have
 * the same colour as the input text. they should be much lighter"). Case
 * ids live in `test-cases/18-notes.md`, block `18.301`–`18.320`.
 *
 * ## Why this is NOT a `CONTRAST_PAIRS` entry
 *
 * The brief's own text asked for `{ fg: 'textSubtle', bg: 'fillQuaternary',
 * minimum: 4.5 }` in the shared array `tokens.test.ts` walks. Measured
 * before writing it: `tokens.test.ts`'s own `relativeLuminance` reads its
 * doc comment aloud — *"alpha ignored"* — and `fillQuaternary` is
 * translucent in every style (`primitives.fillWarmHig4` etc. all carry an
 * 8th hex byte under 0x20, 5–10% opacity). Feeding that raw, alpha-bearing
 * hex through a luminance function that ignores the alpha channel computes
 * the contrast of the fill's own DARK RGB against text, as if the fill were
 * opaque — nothing like what a reader actually sees, which is that dark
 * colour bleeding faintly over whatever surface sits behind the field. Run
 * once as a check: the raw (uncomposited) ratio for `hig`/light is 1.738 —
 * a `CONTRAST_PAIRS` entry at `minimum: 4.5` would fail EVERY style/theme
 * for a reason that has nothing to do with the rendered page, and a
 * REAL failure (below) would be indistinguishable from this artefact.
 *
 * So this file composites the fill over each surface a `.gn-field__input`
 * can actually sit on FIRST, then measures the composited, opaque result —
 * the same WCAG formula `tokens.test.ts` uses, just given a colour that
 * corresponds to a pixel someone can point at.
 *
 * ## The owner's ruling this file pins (2026-09-28, given these numbers)
 *
 * `neo` clears 4.5:1 on every surface in both themes (~5.03–5.05). `hig`/
 * `minimal` do NOT: `hig`/light on `surfaceSunken` is 4.208, `hig`/dark on
 * `surfaceRaised` is 4.290 and on `surfaceSunken` is 3.622 — all below 4.5,
 * all still above 3. Told this, the owner accepted 3:1 for `hig`/`minimal`
 * rather than holding every style to 4.5, because 6c's own 24-site label
 * sweep already guarantees every field keeps a REAL name once its
 * placeholder vanishes on focus — a placeholder that is merely dimmer,
 * never the reader's only way to identify the field.
 */
function channelLuminance(pair: string): number {
  const srgb = Number.parseInt(pair, 16) / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgbHex: string): number {
  return (
    0.2126 * channelLuminance(rgbHex.slice(1, 3)) +
    0.7152 * channelLuminance(rgbHex.slice(3, 5)) +
    0.0722 * channelLuminance(rgbHex.slice(5, 7))
  );
}

function contrastRatio(a: string, b: string): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const brighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (brighter + 0.05) / (darker + 0.05);
}

function channel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16);
}

/** `fg` (opaque `#rrggbb` or translucent `#rrggbbaa`) alpha-composited over an opaque `bg`. */
function compositeOver(fgHex: string, bgHex: string): string {
  const alpha = fgHex.length > 7 ? channel(fgHex, 7) / 255 : 1;
  const mix = (offset: number) =>
    Math.round(channel(fgHex, offset) * alpha + channel(bgHex, offset) * (1 - alpha)).toString(16).padStart(2, '0');
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

const STYLES: StyleName[] = ['hig', 'minimal', 'neo'];
const THEMES: ThemeName[] = ['light', 'dark'];
const SURFACES = ['surface', 'surfaceRaised', 'surfaceSunken'] as const;

describe('18.306 textSubtle on the field background, composited, clears its style-specific floor', () => {
  for (const style of STYLES) {
    const minimum = style === 'neo' ? 4.5 : 3;
    for (const theme of THEMES) {
      for (const surfaceRole of SURFACES) {
        it(`${style}/${theme} on ${surfaceRole}: textSubtle on composited fillQuaternary ≥ ${minimum}`, () => {
          const textSubtle = colorOf(theme, 'textSubtle', style);
          const fillQuaternary = colorOf(theme, 'fillQuaternary', style);
          const surface = colorOf(theme, surfaceRole, style);
          const composited = compositeOver(fillQuaternary, surface);
          const ratio = contrastRatio(textSubtle, composited);
          expect(ratio, `${style}/${theme}/${surfaceRole}: composited=${composited} ratio=${ratio}`).toBeGreaterThanOrEqual(
            minimum,
          );
        });
      }
    }
  }
});

describe('18.307 the self-test: composite/contrastRatio are proven against known values before they are trusted', () => {
  it('18.307a compositeOver a fully-opaque fg returns the fg unchanged, ignoring bg', () => {
    expect(compositeOver('#123456', '#ffffff')).toBe('#123456');
  });

  it('18.307b compositeOver a fully-transparent fg (alpha 00) returns the bg unchanged', () => {
    expect(compositeOver('#12345600', '#abcdef')).toBe('#abcdef');
  });

  it('18.307c black on white is the WCAG canonical 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it("18.307d the RAW (uncomposited) ratio would have failed 4.5 for a reason that isn't the rendered page — the whole reason this file composites first", () => {
    const textSubtle = colorOf('light', 'textSubtle', 'hig');
    const fillQuaternary = colorOf('light', 'fillQuaternary', 'hig');
    const rawRatio = contrastRatio(textSubtle, fillQuaternary);
    expect(rawRatio).toBeLessThan(4.5);
    // And the COMPOSITED reading for the exact same pair passes comfortably —
    // proof the two numbers really do diverge, not a restatement of 18.306.
    const composited = compositeOver(fillQuaternary, colorOf('light', 'surface', 'hig'));
    expect(contrastRatio(textSubtle, composited)).toBeGreaterThanOrEqual(4.5);
  });
});
