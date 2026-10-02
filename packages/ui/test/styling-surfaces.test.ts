import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/** Styling refresh Plan A, Task 4 — cases 20.031–20.032 (§20.4). */
const CSS = readUiCss();

describe('20.031 Card rests on the lift shadow', () => {
  it('20.031 lift, and no hover/active rule on a non-interactive Card', () => {
    expect(valueOf(ruleExactly(CSS, '.gn-card'), 'box-shadow')).toBe('var(--gn-shadow-lift)');
    // CONTROL — a Card never lifts on its own (card.tsx:5).
    const interactive = parseRules(CSS).filter((rule) =>
      rule.selectors.some((selector) => /^\.gn-card:(hover|active)\b/.test(selector)),
    );
    expect(interactive).toEqual([]);
  });
});

describe('20.032 Dialog floats near', () => {
  it('20.032 lift-near shadow and track radius on the dialog panel', () => {
    const dialog = ruleExactly(CSS, '.gn-dialog');
    // N7 (2026-10-02, 24.083): a floating panel rests on `near-lg` (hig/minimal: = `lift-near`).
    expect(valueOf(dialog, 'box-shadow')).toBe('var(--gn-shadow-near-lg)');
    expect(valueOf(dialog, 'border-radius')).toBe('var(--gn-radius-track)');
    // CONTROL — the sheet's lone rule does not carry this task's shadow.
    expect(valueOf(ruleExactly(CSS, '.gn-sheet'), 'box-shadow')).not.toBe('var(--gn-shadow-near-lg)');
  });
});
