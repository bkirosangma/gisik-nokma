import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Smoothness add-on G-8 (owner 2026-10-02): the phone ticket-sheet header compacts with the scroll by TRANSFORMING the same
 * elements, with NO jitter. The mechanism is `useSheetHeaderCompact` (app-core); this file holds the STYLESHEET half of the
 * contract — the half jsdom cannot see — as source-order and shape facts. The painted result is the browser spec
 * `apps/web/e2e-stack/sheet-header-compact.spec.ts` (25.431-25.433). Case 25.434.
 */
const css = readUiCss();
const rules = parseRules(css);
const PHONE = '@media (max-width: 40rem)';
const PHONE_REDUCED = '@media (max-width: 40rem) and (prefers-reduced-motion: reduce)';
const flat = (value: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim();
const compact = (selector: string): string => ruleExactly(css, `.gn-sheet[data-compact] ${selector}`, PHONE);

describe('25.434 the header leaves the flow and every child moves by transform alone', () => {
  it('25.434 every [data-compact] rule is inside the phone arm; the only base rules for the new parts say display: none', () => {
    const keyed = rules.filter((r) => r.selectors.some((s) => s.includes('[data-compact')));
    expect(keyed.length).toBeGreaterThan(10);
    for (const r of keyed) expect([PHONE, PHONE_REDUCED], r.selectors.join(', ')).toContain(r.atRule);
    // CONTROL — desktop keeps no compact rule at all, and the two new containers are display: none outside the arm.
    expect(rules.filter((r) => r.atRule === null && r.selectors.some((s) => s.includes('[data-compact')))).toEqual([]);
    const base = ruleExactly(css, ['.gn-sheet__title-hit', '.gn-sheet__peek']);
    expect(flat(valueOf(base, 'display'))).toBe('none');
  });

  it('25.434 the header is an absolute overlay and the body reserves its FULL height once, as padding (nothing in the flow follows --p)', () => {
    const header = compact('.gn-sheet__header');
    expect(flat(valueOf(header, 'position'))).toBe('absolute');
    expect(flat(valueOf(header, 'height'))).toContain('var(--p, 0)');
    expect(flat(valueOf(header, 'height'))).toContain('var(--gh-h0)');
    expect(valueOf(header, 'transition')).toBeNull();
    const body = compact('.gn-sheet__body');
    // `--gh-h0` is the FULL height, constant for a measurement: no `--p` anywhere in the body's rule.
    expect(flat(valueOf(body, 'padding-top'))).toBe('calc(var(--gh-h0, 0) * 1px)');
    expect(body).not.toContain('--p');
    expect(flat(valueOf(body, 'overflow-anchor'))).toBe('none');
    // CONTROL — the rule it overrides is the sticky, in-flow header of the tablet arm: that is the jitter this replaces.
    expect(flat(valueOf(ruleExactly(css, '.gn-sheet__header', '@media (max-width: 64rem)'), 'position'))).toBe('sticky');
  });

  it('25.434 each moving child sits at the origin and is placed by transform from --p: no top/left/margin animation, no transition', () => {
    const children = [
      '.gn-ticket-sheet__crumbs > *',
      '.gn-ticket-sheet__title-input',
      '.gn-sheet__close',
      '.gn-sheet__move',
    ];
    for (const selector of children) {
      const rule = compact(selector);
      expect(flat(valueOf(rule, 'position')), selector).toBe('absolute');
      expect(flat(valueOf(rule, 'left')), selector).toBe('0');
      expect(flat(valueOf(rule, 'top')), selector).toBe('0');
      expect(flat(valueOf(rule, 'transform')), selector).toContain('var(--p, 0)');
      expect(flat(valueOf(rule, 'transform')), selector).toContain('translate(');
      expect(valueOf(rule, 'transition'), selector).toBeNull();
      expect(valueOf(rule, 'margin'), selector).toBeNull();
    }
    // The title also scales; the crumb parts and Move fade; the ✕ scales.
    expect(flat(valueOf(compact('.gn-ticket-sheet__title-input'), 'transform'))).toContain('scale(var(--gs))');
    expect(flat(valueOf(compact('.gn-ticket-sheet__crumbs > *'), 'opacity'))).toContain('var(--p, 0)');
    // The title's height is capped (the inline height `TitleField` sets is never fought with !important).
    expect(css).not.toMatch(/\.gn-ticket-sheet__title-input[^}]*!important/);
    expect(flat(valueOf(compact('.gn-ticket-sheet__title-input'), 'max-height'))).toContain('var(--p, 0)');
  });

  it('25.434 Move is gone by the half-way point (where it goes inert) and returns beside the full title while that overlay is open', () => {
    expect(flat(valueOf(compact('.gn-sheet__move'), 'opacity'))).toBe('calc(1 - var(--p, 0) * 2)');
    const open = ruleExactly(css, '.gn-sheet[data-compact][data-peek="title"] .gn-sheet__move', PHONE);
    expect(flat(valueOf(open, 'opacity'))).toBe('1');
    expect(flat(valueOf(open, 'transform'))).toContain('var(--gmx2)');
    // Reduced motion: no overlay animation and no Move transition.
    const reduced = ruleExactly(
      css,
      ['.gn-sheet[data-compact] .gn-sheet__peek', '.gn-sheet[data-compact][data-peek="title"] .gn-sheet__move'],
      PHONE_REDUCED,
    );
    expect(flat(valueOf(reduced, 'animation'))).toBe('none');
    expect(flat(valueOf(reduced, 'transition'))).toBe('none');
  });

  it('25.434 at p = 0 (data-top) every crumb part wraps whole as the un-compacted header does; the folded middle shows only "…" once settled (G-8 FIX 1 F2, F3)', () => {
    const top = ruleExactly(
      css,
      ['.gn-sheet[data-compact][data-top] .gn-ticket-sheet__crumbs > *', '.gn-sheet[data-compact] .gn-ticket-sheet__crumbs > [data-collapsed]'],
      PHONE,
    );
    expect(flat(valueOf(top, 'height'))).toBe('auto');
    expect(flat(valueOf(top, 'white-space'))).toBe('normal');
    expect(flat(valueOf(top, 'text-overflow'))).toBe('clip');
    expect(flat(valueOf(top, 'overflow'))).toBe('visible');
    // CONTROL — the generic compact rule it overrides is the one-line nowrap form with an ellipsis, and it comes FIRST (the override wins on source order).
    const generic = compact('.gn-ticket-sheet__crumbs > *');
    expect(flat(valueOf(generic, 'white-space'))).toBe('nowrap');
    expect(flat(valueOf(generic, 'text-overflow'))).toBe('ellipsis');
    expect(css.indexOf('.gn-sheet[data-compact] .gn-ticket-sheet__crumbs > * {')).toBeLessThan(css.indexOf('[data-top] .gn-ticket-sheet__crumbs > *'));
    // F3: the dots are hidden by default and swap with the name only when settled.
    expect(flat(valueOf(ruleExactly(css, '.gn-ticket-sheet__fold-dots', PHONE), 'display'))).toBe('none');
    expect(flat(valueOf(ruleExactly(css, '.gn-sheet[data-compact][data-settled] .gn-ticket-sheet__fold-label', PHONE), 'display'))).toBe('none');
    expect(flat(valueOf(ruleExactly(css, '.gn-sheet[data-compact][data-settled] .gn-ticket-sheet__fold-dots', PHONE), 'display'))).toBe('inline');
  });

  it('25.434 the ✕ keeps a 44px hit area while shrunk, and the overlays hang below the compact header without a layout of their own', () => {
    expect(flat(valueOf(compact('.gn-sheet__close::after'), 'inset'))).toBe('calc(var(--p, 0) * -13px)');
    const peek = compact('.gn-sheet__peek');
    expect(flat(valueOf(peek, 'position'))).toBe('absolute');
    expect(flat(valueOf(peek, 'top'))).toContain('var(--gh-h1)');
    // Opacity only on the way out (130ms): nothing the overlay does touches the body's flow.
    expect(flat(valueOf(peek, 'transition'))).toBe('opacity 130ms ease-in');
  });
});
