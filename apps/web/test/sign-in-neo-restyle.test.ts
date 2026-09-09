import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Round 2d (2026-09-09) — `/sign-in` neo alignment, the CSS-source half.
 *
 * SOURCE scans, not rendered ones, for the same reason `neo-card-radius.test.ts`
 * (13.355) gives: `packages/ui/test/tokens.test.ts`'s own "every var(--gn-…) in
 * ui.css names a declared role" case scans `packages/ui/src/ui.css` ONLY — it
 * does not read `apps/web/app/globals.css` at all, so a typo in a `--gn-…`
 * variable name written HERE (e.g. `var(--gn-text-accnet)`) resolves to nothing
 * at runtime, the element silently inherits its ancestor's colour, and every
 * existing suite (including that one) stays green. These cases close that gap
 * for the specific properties Round 2d touched in this file.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');

/**
 * Extracts one rule's FULL body (selector line through its matching closing
 * brace), not just the selector's own line — `neo-card-radius.test.ts`'s
 * single-line `ruleFor` only works for rules with every declaration on the
 * selector's own line, which most of this file's rules are NOT (this file
 * mixes both styles). A rule opened with a multi-selector list (`a,\nb {`)
 * is matched from whichever of its selector lines `selectorPattern` hits.
 */
function ruleFor(css: string, selectorPattern: RegExp): string | undefined {
  const lines = css.split('\n');
  const startIndex = lines.findIndex((line) => selectorPattern.test(line));
  if (startIndex === -1) return undefined;
  // Walk forward from the first line the OPENING brace appears on (which may
  // be a later line than the selector match, for a multi-selector rule).
  const openIndex = lines.findIndex((line, i) => i >= startIndex && line.includes('{'));
  if (openIndex === -1) return undefined;
  const closeIndex = lines.findIndex((line, i) => i >= openIndex && line.includes('}'));
  if (closeIndex === -1) return undefined;
  return lines.slice(startIndex, closeIndex + 1).join('\n');
}

describe('13.360/13.361 — globals.css wires the retired accent hex through --gn-text-accent, not --gn-accent', () => {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');

  /**
   * 13.360 — the global `a` rule, the one `CONTRAST_PAIRS`' own docblock cites
   * by name as needing this guarantee. A mistyped variable here would silently
   * hand every unstyled link in the product `inherit` instead of a colour, and
   * no existing suite reads this specific line.
   */
  it('the global `a` rule uses --gn-text-accent, not the retired --gn-accent', () => {
    const rule = ruleFor(css, /^a\s*\{/);
    expect(rule, `a { } rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('var(--gn-text-accent)');
    expect(rule).not.toContain('var(--gn-accent)');
  });

  /**
   * 13.361 — `.gn-notfound__link` SELECTOR-OVERRIDES the global `a` rule above
   * (same specificity, declared later), so fixing only the global rule would
   * have left this one page's recovery links on the retired, now text-unsafe
   * `--gn-accent`. This is the site the advisor's review caught: "flag it" was
   * the wrong call once specificity was actually traced.
   */
  it('.gn-notfound__link uses --gn-text-accent, not the retired --gn-accent', () => {
    const rule = ruleFor(css, /\.gn-notfound__link\s*\{/);
    expect(rule, `.gn-notfound__link rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('var(--gn-text-accent)');
    expect(rule).not.toContain('var(--gn-accent)');
  });
});

describe('13.361 — .gn-sign-in__mark geometry and the neo raised-square treatment', () => {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');

  it('the base rule sets min-width:3.5rem (56px), matching the export, min-height unchanged at 2.75rem', () => {
    const rule = ruleFor(css, /^\.gn-sign-in__mark\s*\{/m);
    expect(rule, `.gn-sign-in__mark rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('min-width: 3.5rem');
    expect(rule).toContain('min-height: 2.75rem');
  });

  it('a [data-style="neo"]-scoped rule gives the mark a raised surface and shadow, not a global one', () => {
    const rule = ruleFor(css, /\[data-style="neo"\]\s+\.gn-sign-in__mark\s*\{/);
    expect(rule, `[data-style="neo"] .gn-sign-in__mark rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('var(--gn-surface)');
    expect(rule).toContain('var(--gn-shadow-raised)');
  });

  /**
   * Negative half of the same case — `hig`/`minimal` must NOT pick up a raised
   * background from an unscoped rule, or the "export's own hig rendering stays
   * flat" reasoning in the CSS docblock would be false. The unscoped
   * `.gn-sign-in__mark {}` rule (checked above) sets only sizing/padding, never
   * `background`/`box-shadow` — asserted here as an absence, the same shape
   * `neo-card-radius.test.ts` uses for its own negative checks.
   */
  it('the unscoped .gn-sign-in__mark rule sets no background or box-shadow of its own', () => {
    const rule = ruleFor(css, /^\.gn-sign-in__mark\s*\{/m);
    expect(rule?.includes('background'), `.gn-sign-in__mark: ${String(rule)}`).toBe(false);
    expect(rule?.includes('box-shadow'), `.gn-sign-in__mark: ${String(rule)}`).toBe(false);
  });
});

describe('13.361 — the sign-in footer link gets an underline affordance beyond colour, on hover and focus', () => {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');

  /**
   * The controller's dispatch requirement, stated plainly: "a link must still
   * be identifiable by more than colour" — a deliberate departure from the
   * export's own `a:hover,a:focus-visible{text-decoration:none;opacity:.68}`,
   * which never underlines a link at all.
   */
  it('.gn-sign-in__legal a underlines on hover and focus-visible', () => {
    const block = css.match(/\.gn-sign-in__legal a:hover,\s*\n\.gn-sign-in__legal a:focus-visible\s*\{([^}]*)\}/);
    expect(block, 'no .gn-sign-in__legal a:hover/:focus-visible rule found').not.toBeNull();
    expect(block?.[1]).toContain('text-decoration: underline');
  });

  it('.gn-sign-in__legal a also gets the branded focus ring, not just the browser default', () => {
    // `.gn-sign-in__legal a:focus-visible` is the LAST selector in a
    // multi-selector list shared with `.gn-notfound__link:focus-visible` and
    // `.gn-legal a:focus-visible` — `ruleFor`'s forward-only walk cannot find
    // the block from this selector's own (last) line, so the whole
    // multi-selector list is matched directly instead.
    //
    // ORDER-DEPENDENT ON PURPOSE, not a latent gap: this pattern requires the
    // three selectors in THIS exact order. If globals.css is ever edited to
    // reorder that list, this regex simply fails to match — the earlier
    // "no shared :focus-visible rule ... found" assertion below reddens
    // loudly rather than silently passing against the wrong block (the
    // sibling underline rule a few lines down shares the selector text but
    // not the `outline` declaration this test checks for, so there is no
    // adjacent block this could mistakenly match instead).
    const block = css.match(
      /\.gn-notfound__link:focus-visible,\s*\n\.gn-legal a:focus-visible,\s*\n\.gn-sign-in__legal a:focus-visible\s*\{([^}]*)\}/,
    );
    expect(block, 'no shared :focus-visible rule naming all three selectors was found').not.toBeNull();
    expect(block?.[1]).toContain('outline: 2px solid var(--gn-focus-ring)');
  });
});

describe('13.359 — the text ladder on /sign-in is wired to text/textMuted, unchanged by this round', () => {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');

  /**
   * None of these roles or their hexes changed in Round 2d — this pins that
   * the WIRING on this specific screen still reaches them, since the round
   * touched several sibling selectors in the same file.
   */
  it('.gn-sign-in__hint and .gn-sign-in__legal read --gn-text-muted', () => {
    const rule = ruleFor(css, /\.gn-sign-in__hint,/);
    expect(rule, `.gn-sign-in__hint,.gn-sign-in__legal rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('var(--gn-text-muted)');
  });

  it('.gn-page-header__tagline reads --gn-text-muted (packages/ui/src/ui.css)', () => {
    const UI_CSS_PATH = resolve(TEST_DIR, '../../../packages/ui/src/ui.css');
    const uiCss = readFileSync(UI_CSS_PATH, 'utf8');
    const rule = ruleFor(uiCss, /\.gn-page-header__tagline\s*\{/);
    expect(rule, `.gn-page-header__tagline rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('var(--gn-text-muted)');
  });
});
