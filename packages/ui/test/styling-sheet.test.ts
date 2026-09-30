import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';
import { cssOf } from './helpers/style-patterns.js';

/**
 * Styling refresh Plan A, Task 7 — cases 20.071–20.077 (§20.7). The approved
 * sheet (`Sheet.dc.html:26-101`), translated; its "Start work" primary and its
 * comment footer are not built (plan D16) — the title is the loud element.
 */
const CSS = readUiCss();
const HEADER = ['.gn-dialog__header', '.gn-sheet__header'] as const;
const BODY = ['.gn-dialog__body', '.gn-sheet__body'] as const;
const CLOSE = ['.gn-dialog__close', '.gn-sheet__close'] as const;

/** Every selector Task 7 restyles, for the "no style fork repaints it" claims. */
const SHEET_SELECTORS = [
  '.gn-sheet__full',
  '.gn-dialog__close',
  '.gn-sheet__close',
  '.gn-ticket-sheet__fields',
  '.gn-ticket-sheet__field--tinted',
  '.gn-ticket-sheet__delete',
];

/** Rules under a `[data-style]` scope that name any of `selectors`, in either stylesheet. */
function styleForks(selectors: readonly string[]): string[] {
  return [cssOf('ui'), cssOf('globals')].flatMap((css) =>
    parseRules(css)
      .filter((rule) => rule.selectors.some((s) => s.includes('[data-style') && selectors.some((t) => s.includes(t))))
      .map((rule) => rule.selectors.join(', ')),
  );
}

describe('20.071 the sheet panel', () => {
  it('20.071 track radius on the left corners, the sheet shadow; full screen has neither', () => {
    const sheet = ruleExactly(CSS, '.gn-sheet');
    expect(valueOf(sheet, 'border-radius')).toBe('var(--gn-radius-track) 0 0 var(--gn-radius-track)');
    expect(valueOf(sheet, 'box-shadow')).toBe('var(--gn-shadow-sheet)');
    // CONTROL
    const full = ruleExactly(CSS, '.gn-sheet--full');
    expect(valueOf(full, 'border-radius')).toBe('0');
    expect(valueOf(full, 'box-shadow')).toBe('none');
  });
});

describe('20.072 24 around', () => {
  it('20.072 header 24/24/16 with 8px gaps, body 0/24/24 — one shared rule for dialog and sheet', () => {
    expect(valueOf(ruleExactly(CSS, HEADER), 'padding')).toBe('1.5rem 1.5rem 1rem');
    expect(valueOf(ruleExactly(CSS, HEADER), 'gap')).toBe('0.5rem');
    expect(valueOf(ruleExactly(CSS, BODY), 'padding')).toBe('0 1.5rem 1.5rem');
    // CONTROL
    expect(valueOf(ruleExactly(CSS, BODY), 'overflow-y')).toBe('auto');
  });
});

describe('20.073 the dismiss control is a ghost icon; Full screen is quiet', () => {
  it('20.073 transparent 44px circle, lit fill + ring; Full screen outlined; no style fork', () => {
    const close = ruleExactly(CSS, CLOSE);
    expect(valueOf(close, 'background')).toBe('transparent');
    expect(valueOf(close, 'color')).toBe('var(--gn-text-muted)');
    expect(valueOf(close, 'border-radius')).toBe('999px');
    const lit = ruleExactly(CSS, [
      '.gn-dialog__close:hover',
      '.gn-dialog__close:focus-visible',
      '.gn-sheet__close:hover',
      '.gn-sheet__close:focus-visible',
    ]);
    expect(valueOf(lit, 'background')).toBe('var(--gn-fill-tertiary)');
    expect(
      valueOf(ruleExactly(CSS, ['.gn-dialog__close:focus-visible', '.gn-sheet__close:focus-visible']), 'outline'),
    ).toBe('2px solid var(--gn-focus-ring)');
    const full = ruleExactly(CSS, '.gn-sheet__full');
    expect(valueOf(full, 'background')).toBe('transparent');
    expect(valueOf(full, 'color')).toBe('var(--gn-text-muted)');
    expect(valueOf(full, 'border')).toBe('1px solid var(--gn-border)');
    expect(valueOf(full, 'box-shadow')).toBeNull();
    // No style repaints the fill, the ink or the edge.
    expect(styleForks(['.gn-sheet__full', '.gn-dialog__close', '.gn-sheet__close'])).toEqual([]);
    // CONTROL — 13.1148's floor
    expect(valueOf(close, 'min-height')).toBe('2.75rem');
    expect(valueOf(full, 'min-height')).toBe('2.75rem');
  });
});

describe('20.074 the title is loud', () => {
  it('20.074 26/32 at 700, tracked in, on both title elements', () => {
    for (const selector of ['.gn-sheet__title', '.gn-ticket-sheet__title-input']) {
      const body = ruleExactly(CSS, selector);
      expect(valueOf(body, 'font-size'), selector).toBe('1.625rem');
      expect(valueOf(body, 'line-height'), selector).toBe('2rem');
      expect(valueOf(body, 'font-weight'), selector).toBe('700');
      expect(valueOf(body, 'letter-spacing'), selector).toBe('-0.01em');
    }
    // CONTROL — the dialog title keeps its own step.
    expect(valueOf(ruleExactly(CSS, ['.gn-dialog__title', '.gn-sheet__title']), 'font-size')).toBe('1.05rem');
  });
});

describe('20.075 the fields sit in a well', () => {
  it('20.075 well ground, track inset, card radius, 8px padding; rows at card − 8; no style fork', () => {
    const fields = ruleExactly(CSS, '.gn-ticket-sheet__fields');
    expect(valueOf(fields, 'background')).toBe('var(--gn-surface-well)');
    expect(valueOf(fields, 'box-shadow')).toBe('var(--gn-shadow-track)');
    expect(valueOf(fields, 'border-radius')).toBe('var(--gn-radius-card)');
    expect(valueOf(fields, 'padding')).toBe('0.5rem');
    expect(valueOf(fields, 'margin')).toBe('1.5rem 0 0');
    const inner = 'calc(var(--gn-radius-card) - 0.5rem)';
    expect(valueOf(ruleExactly(CSS, '.gn-ticket-sheet__field--tinted dt'), 'border-radius')).toBe(`${inner} 0 0 ${inner}`);
    expect(valueOf(ruleExactly(CSS, '.gn-ticket-sheet__field--tinted dd'), 'border-radius')).toBe(`0 ${inner} ${inner} 0`);
    expect(styleForks(['.gn-ticket-sheet__fields', '.gn-ticket-sheet__field--tinted'])).toEqual([]);
    // CONTROL — the stripe itself (16.116) is still painted.
    expect(valueOf(ruleExactly(CSS, '.gn-ticket-sheet__field--tinted dt'), 'background')).toBe('var(--gn-fill-quaternary)');
    expect(valueOf(ruleExactly(CSS, '.gn-ticket-sheet__field--tinted dd'), 'background')).toBe('var(--gn-fill-quaternary)');
  });
});

describe('20.076 captions and labels', () => {
  it('20.076 sentence-case 15/600 captions in text; 13px text3 labels', () => {
    const caption = ruleExactly(CSS, '.gn-ticket-sheet__caption');
    expect(valueOf(caption, 'font-size')).toBe('0.9375rem');
    expect(valueOf(caption, 'font-weight')).toBe('600');
    expect(valueOf(caption, 'color')).toBe('var(--gn-text)');
    expect(valueOf(caption, 'text-transform')).toBe('none');
    expect(valueOf(caption, 'letter-spacing')).toBe('0');
    const label = ruleExactly(CSS, '.gn-ticket-sheet__field dt');
    expect(valueOf(label, 'font-size')).toBe('0.8125rem');
    expect(valueOf(label, 'color')).toBe('var(--gn-text-subtle)');
    // CONTROL — values set no colour of their own; they inherit `text`.
    expect(valueOf(ruleExactly(CSS, '.gn-ticket-sheet__field dd'), 'color')).toBeNull();
  });
});

describe('20.077 the footer and Delete', () => {
  it('20.077 decorative hairline + 24px; Delete a pill with a soft hover fill; no style fork', () => {
    const footer = ruleExactly(CSS, '.gn-ticket-sheet__footer');
    expect(valueOf(footer, 'border-top')).toBe('1px solid var(--gn-fill-secondary)');
    expect(valueOf(footer, 'margin-top')).toBe('1.5rem');
    const del = ruleExactly(CSS, '.gn-ticket-sheet__delete');
    expect(valueOf(del, 'border-radius')).toBe('999px');
    expect(valueOf(ruleExactly(CSS, '.gn-ticket-sheet__delete:hover:not(:disabled)'), 'background')).toBe(
      'var(--gn-fill-quaternary)',
    );
    expect(styleForks(['.gn-ticket-sheet__delete'])).toEqual([]);
    // CONTROL — 16.84's Delete: danger ink, transparent, borderless.
    expect(valueOf(del, 'color')).toBe('var(--gn-danger)');
    expect(valueOf(del, 'background')).toBe('transparent');
    expect(valueOf(del, 'border')).toBe('none');
  });
});
