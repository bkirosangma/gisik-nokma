import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { halo, spacing } from '@gisik-nokma/ui/tokens';
import { describe, expect, it } from 'vitest';
import { ruleFor } from './helpers/css-rule-scan.js';

/**
 * F-10 (neo refresh T8 finding 1; owner 2026-10-02: "Fix in neo now", ALL styles). Cases 23.350–23.351 here, 23.352 in `e2e-stack/`.
 *
 * The sign-in card's email form is a bare `<form>`: label+field, the hint, then the primary, as block siblings with NO gap between
 * them (the card's `gap: 1rem` is on `.gn-sign-in`, one level up). Measured on the stack at 1933a073, in hig and neo alike: field
 * bottom 305.3 = hint top, hint bottom 351.7 = primary top. In hig that read as tight type; in neo the primary's 14px fall
 * (`--gn-halo`) lands on the sentence, which breaks the N7 rule ("readable text sits at least the halo from a raised edge").
 *
 * Source scans, because the fix is a margin declaration and its tokens; the rendered boxes are 23.352 in `e2e-stack/`.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(TEST_DIR, '../app/globals.css'), 'utf8');
const page = readFileSync(resolve(TEST_DIR, '../app/sign-in/page.tsx'), 'utf8');

const HINT_IN_FORM = /^\.gn-sign-in__method-form \.gn-sign-in__hint\s*\{/;
const SHARED = /^\.gn-sign-in__hint,/;

/** `margin: <top> <inline> <bottom>` as written: three space-separated values, each a `var()` or a bare `0`. */
function margin3(rule: string): { top: string; inline: string; bottom: string } | undefined {
  const m = /margin:\s*(var\([^)]*\)|\S+)\s+(var\([^)]*\)|\S+)\s+(var\([^)]*\)|\S+)\s*;/.exec(rule);
  return m === null ? undefined : { top: m[1]!, inline: m[2]!, bottom: m[3]! };
}

const px = (length: string): number => (length.endsWith('rem') ? Number.parseFloat(length) * 16 : Number.parseFloat(length));

describe('23.350 the hint in the email form clears the field above and the primary below, in every style', () => {
  it('23.350 `.gn-sign-in__method-form .gn-sign-in__hint` sets its top and bottom margin from the spacing tokens, with no length literal; the shared hint/legal rule and the "Or continue with" hint are untouched', () => {
    // CONTROLS (first): the shared rule still zeroes the margin, and the second hint ("Or continue with") is OUTSIDE the form, so the
    // scoped rule cannot reach it. A rule that moved every hint would fail here.
    const shared = ruleFor(css, SHARED);
    expect(shared, 'control: the shared .gn-sign-in__hint,.gn-sign-in__legal rule exists').toBeDefined();
    expect(shared).toMatch(/margin:\s*0\s*;/);
    const form = /<form\s+className="gn-sign-in__method-form"[\s\S]*?<\/form>/.exec(page)?.[0] ?? '';
    expect(form.match(/gn-sign-in__hint/g)?.length, 'control: exactly one hint inside the email form').toBe(1);
    expect(page.match(/gn-sign-in__hint/g)?.length, 'control: the page has the form hint and "Or continue with"').toBe(2);
    const LITERAL = /-?\d*\.?\d+(?:px|rem|em)\b/;
    expect(LITERAL.test(shared ?? ''), 'control: the literal detector finds `font-size: 1rem` in the shared rule').toBe(true);

    const rule = ruleFor(css, HINT_IN_FORM);
    expect(rule, 'the scoped hint rule exists').toBeDefined();
    const margin = margin3(rule!);
    expect(margin, `margin is a three-value shorthand; got:\n${String(rule)}`).toBeDefined();
    expect(margin!.top, 'the field above: space-1, which clears its 3px focus offset').toBe('var(--gn-space-1)');
    expect(margin!.inline).toBe('0');
    expect(margin!.bottom, 'the primary below: space-2, which clears the neo halo').toBe('var(--gn-space-2)');
    const declarations = rule!.slice(rule!.indexOf('{') + 1, rule!.lastIndexOf('}'));
    expect(LITERAL.test(declarations), `tokens only, no length literal in:\n${declarations}`).toBe(false);
  });
});

describe("23.351 the bottom clearance is at least the primary's halo, in hig, minimal and neo", () => {
  it('23.351 space-2 >= halo.card in every style; space-1 does NOT clear the neo halo, so the bottom margin is the one that matters', () => {
    const below = px(spacing[2]);
    const above = px(spacing[1]);
    // CONTROL (first): the neo halo is 14px, bigger than the 8px space-1, so a bottom margin of space-1 would leave the text in the fall.
    expect(px(halo.neo.card)).toBe(14);
    expect(above).toBeLessThan(px(halo.neo.card));
    for (const style of ['hig', 'minimal', 'neo'] as const) {
      expect(below, `${style}: ${below}px under the hint vs the ${halo[style].card} halo`).toBeGreaterThanOrEqual(px(halo[style].card));
    }
  });
});
