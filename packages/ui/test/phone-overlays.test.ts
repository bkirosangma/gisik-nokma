import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * The web app on phones, Plan Task 6 — the CSS half of cases 21.070–21.073 (§21.6).
 * 21.074 (the four dialogs fully visible at 360px) is a browser case and stays 🧪.
 *
 * Every phone rule sits inside the existing 40rem arm (FD1). The arms must come AFTER the
 * base rules they override — same specificity, so source order decides — and the order is
 * asserted here, because a phone arm that sits above its base rule paints nothing and
 * passes every value check.
 */
const PHONE = '@media (max-width: 40rem)';
/** The sheet's own full-width rules moved here (UX fixes Task 4, owner ruling U3, case 23.053); the dialogs and the Move shortcut stayed on PHONE. */
const BAND = '@media (max-width: 64rem)';
const REDUCED = '@media (prefers-reduced-motion: reduce)';
const css = readUiCss();

/** Index of the (single) rule in the stylesheet, so source order can be compared. */
function position(selectors: string[], atRule: string | null): number {
  const index = parseRules(css).findIndex(
    (rule) =>
      rule.atRule === atRule &&
      rule.selectors.length === selectors.length &&
      rule.selectors.every((selector, i) => selector === selectors[i]),
  );
  if (index === -1) throw new Error(`no rule ${selectors.join(', ')} under ${atRule ?? 'top level'}`);
  return index;
}

describe('21.070 the ticket sheet is full screen at ≤64rem (was ≤40rem; amended 2026-10-02, UX fixes Task 4, case 23.053)', () => {
  it('21.070 .gn-sheet is 100% wide, square and flat through the tablet band and the Full-screen toggle is hidden; above 64rem it keeps min(40rem, 94vw) and its toggle', () => {
    const phone = ruleExactly(css, '.gn-sheet', BAND);
    expect(valueOf(phone, 'width')).toBe('100%');
    expect(valueOf(phone, 'max-width')).toBe('none');
    expect(valueOf(phone, 'border-radius')).toBe('0');
    expect(valueOf(phone, 'box-shadow')).toBe('none');
    expect(valueOf(ruleExactly(css, '.gn-sheet__full', BAND), 'display')).toBe('none');
    expect(valueOf(ruleExactly(css, '.gn-sheet__full', PHONE), 'display')).toBe('none');
    // It is the `.gn-sheet--full` FORM, so the same ground as the explicit full state.
    expect(valueOf(phone, 'background')).toBe(valueOf(ruleExactly(css, '.gn-sheet--full'), 'background'));
    // Source order: the arm must come after the base rule it overrides.
    expect(position(['.gn-sheet'], BAND)).toBeGreaterThan(position(['.gn-sheet'], null));

    // CONTROL — above 64rem the panel is unchanged: docked, left-rounded, 40rem wide.
    const base = ruleExactly(css, '.gn-sheet');
    expect(valueOf(base, 'width')).toBe('min(40rem, 94vw)');
    expect(valueOf(base, 'border-radius')).toBe('var(--gn-radius-track) 0 0 var(--gn-radius-track)');
    expect(valueOf(base, 'box-shadow')).toBe('var(--gn-shadow-sheet)');
    expect(valueOf(ruleExactly(css, '.gn-sheet__full'), 'display')).not.toBe('none');
  });
});

describe('21.071 the sheet header sticks and carries the phone-only Move shortcut (CSS half)', () => {
  it('21.071 .gn-sheet__header is sticky at the top at ≤64rem (amended 2026-10-02, case 23.053) and the Move shortcut is shown only at ≤40rem; the base header is not sticky', () => {
    const phone = ruleExactly(css, '.gn-sheet__header', BAND);
    expect(valueOf(phone, 'position')).toBe('sticky');
    expect(valueOf(phone, 'top')).toBe('0');
    expect(valueOf(phone, 'background')).toBe('var(--gn-surface)');
    expect(position(['.gn-sheet__header'], BAND)).toBeGreaterThan(position(['.gn-dialog__header', '.gn-sheet__header'], null));

    expect(valueOf(ruleExactly(css, '.gn-sheet__move', PHONE), 'display')).toBe('inline-flex');
    // CONTROL — above 40rem the shortcut is not painted and the base header is a plain flex row.
    expect(valueOf(ruleExactly(css, '.gn-sheet__move'), 'display')).toBe('none');
    expect(position(['.gn-sheet__move'], PHONE)).toBeGreaterThan(position(['.gn-sheet__move'], null));
    expect(valueOf(ruleExactly(css, ['.gn-dialog__header', '.gn-sheet__header']), 'position')).toBeNull();
  });
});

describe('21.072 dialogs are bottom sheets at ≤40rem', () => {
  it('21.072 the scrim aligns flex-end; the dialog is full width, rounded on top only, 90dvh tall and clears the safe area; above 40rem it stays centred at min(34rem, 92vw)', () => {
    expect(valueOf(ruleExactly(css, '.gn-dialog__scrim', PHONE), 'align-items')).toBe('flex-end');
    const phone = ruleExactly(css, '.gn-dialog', PHONE);
    expect(valueOf(phone, 'width')).toBe('100%');
    expect(valueOf(phone, 'max-width')).toBe('none');
    expect(valueOf(phone, 'border-radius')).toBe('var(--gn-radius-track) var(--gn-radius-track) 0 0');
    expect(valueOf(phone, 'max-height')).toBe('90dvh');
    expect(valueOf(phone, 'padding-bottom')).toBe('max(1rem, env(safe-area-inset-bottom))');
    expect(position(['.gn-dialog__scrim'], PHONE)).toBeGreaterThan(position(['.gn-dialog__scrim'], null));
    expect(position(['.gn-dialog'], PHONE)).toBeGreaterThan(position(['.gn-dialog'], null));

    // CONTROL — above 40rem: centred, a card, all four corners round.
    expect(valueOf(ruleExactly(css, '.gn-dialog__scrim'), 'align-items')).toBe('center');
    const base = ruleExactly(css, '.gn-dialog');
    expect(valueOf(base, 'width')).toBe('min(34rem, 92vw)');
    expect(valueOf(base, 'border-radius')).toBe('var(--gn-radius-track)');
  });
});

describe('21.073 the bottom-sheet dialog rises and holds still under reduced motion', () => {
  it('21.073 the dialog keeps its gnRise entrance, the phone arm does not restate the animation, and reduced motion turns it off', () => {
    const base = ruleExactly(css, '.gn-dialog');
    expect(valueOf(base, 'animation')).toBe('gnRise 240ms cubic-bezier(0.32, 0.72, 0, 1)');
    expect(css).toMatch(/@keyframes gnRise\s*\{/);
    // The reduced-motion arm exists and is NOT overridden by the phone arm: a phone arm that restated
    // `animation` (equal specificity, later in the file) would switch the motion back on for people
    // who asked for none.
    expect(valueOf(ruleExactly(css, '.gn-dialog', REDUCED), 'animation')).toBe('none');
    expect(valueOf(ruleExactly(css, '.gn-dialog', PHONE), 'animation')).toBeNull();
    // CONTROL — the phone scrim adds no second animation either.
    expect(valueOf(ruleExactly(css, '.gn-dialog__scrim', PHONE), 'animation')).toBeNull();
  });
});
