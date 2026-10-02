import { describe, expect, it } from 'vitest';
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';
import { readUiCss } from './helpers/css-rules.js';

/**
 * Smoothness add-on G-5 (owner 2026-10-02): on a phone the ticket sheet's lighter field rows "look chopped off".
 * Cause, measured at 390 (neo dark): the tinted row is a two-column grid on desktop, `dt` the left cell (left corners
 * rounded) and `dd` the right cell (right corners rounded); the phone arm stacks them into one column, so the label
 * strip was square on its right and the control block square on its left, two boxes with mismatched edges, and the
 * control sat flush against the band's left edge while its label sat 12px in. The fix is the phone arm making the ROW
 * the band. Cases 25.370-25.373 (bucket 25, `test-cases/25-smoothness.md`); 25.373 is the browser frame.
 */
const css = readUiCss();
const PHONE = '@media (max-width: 40rem)';
const TABLET = '@media (max-width: 64rem)';
const ROW = '.gn-ticket-sheet__field--tinted';
const INNER = 'calc(var(--gn-radius-card) - 0.5rem)';

/** Source position of the rule with exactly these selectors under `atRule`. */
function at(selectors: string | readonly string[], atRule: string | null): number {
  const wanted = typeof selectors === 'string' ? [selectors] : [...selectors];
  return parseRules(css).findIndex(
    (r) => r.atRule === atRule && r.selectors.length === wanted.length && r.selectors.every((s, i) => s === wanted[i]),
  );
}

describe('25.370 on a phone the tinted row is ONE band: the row paints it, its two cells paint nothing', () => {
  it('25.370 the phone arm gives .gn-ticket-sheet__field--tinted the fill and the full radius, and makes its dt and dd transparent and square, after the base rules', () => {
    const band = ruleExactly(css, ROW, PHONE);
    expect(valueOf(band, 'background')).toBe('var(--gn-fill-quaternary)');
    expect(valueOf(band, 'border-radius')).toBe(INNER);
    const cells = ruleExactly(css, [`${ROW} dt`, `${ROW} dd`], PHONE);
    expect(valueOf(cells, 'background')).toBe('transparent');
    expect(valueOf(cells, 'border-radius')).toBe('0');
    // Source order decides at equal specificity: the phone rules come after the base cell rules they override.
    expect(at(ROW, PHONE)).toBeGreaterThan(at(`${ROW} dd`, null));
    expect(at([`${ROW} dt`, `${ROW} dd`], PHONE)).toBeGreaterThan(at(`${ROW} dd`, null));
    // CONTROL — desktop is unchanged: still two cells, the label cell rounded on the left, the control cell on the right.
    expect(valueOf(ruleExactly(css, `${ROW} dt`), 'border-radius')).toBe(`${INNER} 0 0 ${INNER}`);
    expect(valueOf(ruleExactly(css, `${ROW} dd`), 'border-radius')).toBe(`0 ${INNER} ${INNER} 0`);
    expect(valueOf(ruleExactly(css, `${ROW} dd`), 'background')).toBe('var(--gn-fill-quaternary)');
    // ... and the row itself paints nothing outside the phone arm.
    expect(parseRules(css).filter((r) => r.atRule === null && r.selectors.includes(ROW))).toEqual([]);
  });
});

describe('25.371 the control shares the label’s inset inside the band', () => {
  it('25.371 on a phone the tinted dd takes the label’s 0.75rem left padding (the base dd has none); the untinted rows are not touched', () => {
    expect(valueOf(ruleExactly(css, `${ROW} dd`, PHONE), 'padding-left')).toBe('0.75rem');
    expect(valueOf(ruleExactly(css, '.gn-ticket-sheet__field dt', PHONE), 'padding')).toBe('0.5rem 0.75rem 0 0.75rem');
    // CONTROL — the base dd still has no left padding (desktop: the label cell carries the inset), and no phone rule
    // pads the plain `.gn-ticket-sheet__field dd`.
    expect(valueOf(ruleExactly(css, '.gn-ticket-sheet__field dd'), 'padding')).toBe('0.75rem 0.75rem 0.75rem 0');
    expect(valueOf(ruleExactly(css, '.gn-ticket-sheet__field dd', PHONE), 'padding-left')).toBeNull();
  });
});

describe('25.372 the full-screen sheet draws no focus ring along the screen edges', () => {
  it('25.372 .gn-sheet:focus-visible is outline: none in the tablet/phone arm (the panel is a tabindex=-1 focus container, not a control); the close button keeps its ring', () => {
    expect(valueOf(ruleExactly(css, '.gn-sheet:focus-visible', TABLET), 'outline')).toBe('none');
    // CONTROL — the operable controls still have a visible ring.
    expect(valueOf(ruleExactly(css, ['.gn-dialog__close:focus-visible', '.gn-sheet__close:focus-visible']), 'outline')).toBe(
      '2px solid var(--gn-focus-ring)',
    );
    // ... and the arm is the narrow one: nothing removes the ring above 64rem, where the panel floats.
    expect(parseRules(css).filter((r) => r.atRule === null && r.selectors.includes('.gn-sheet:focus-visible'))).toEqual([]);
  });
});
