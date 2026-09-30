import { describe, expect, it } from 'vitest';
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

function stillDeclared(list: string): boolean {
  return (['ui', 'globals'] as const).some((sheet) =>
    parseRules(cssOf(sheet)).some((rule) => rule.selectors.join(', ') === list),
  );
}

/** Styling refresh Plan B, Task B2 — cases 20.211–20.213 (§20.22). */
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.gn-field__input', declarations: { 'box-shadow': 'var(--gn-shadow-track)', border: '1px solid var(--gn-border)' } },
  {
    sheet: 'ui',
    selectors: '.gn-segmented',
    declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)', 'border-radius': '999px', padding: '0.25rem' },
  },
  { sheet: 'ui', selectors: '.gn-segmented__item', declarations: { 'border-radius': '999px', color: 'var(--gn-text-muted)' } },
  { sheet: 'ui', selectors: '.gn-segmented__item--on', declarations: { 'box-shadow': 'var(--gn-shadow-lift)', color: 'var(--gn-text)' } },
  { sheet: 'ui', selectors: '.gn-ticket-sheet__attach-file', pattern: 'P-QUIET' },
  { sheet: 'ui', selectors: '.gn-visibility__viewer', declarations: { 'box-shadow': 'none', background: 'var(--gn-fill-tertiary)' } },
];
const PREFIXES = ['.gn-field', '.gn-segmented', '.gn-ticket-sheet__attach-file', '.gn-visibility'];
const KEPT = ['.gn-field__input:disabled', '[data-style="neo"] .gn-field__input', '[data-style="neo"] .gn-segmented__item--on'];

describe('20.211 shared fields are recessed; the segmented control is a pill track', () => {
  it('20.211 every audited rule takes its row', () => {
    for (const row of ROWS) expectRow(row);
  });
});
describe('20.212 no flat boundary on shared fields/segmented; kept rules intact', () => {
  it('20.212 offenders are none; the kept rules are still declared', () => {
    expect(flatBoundaryOffenders(cssOf('ui'), PREFIXES, KEPT)).toEqual([]);
    for (const kept of KEPT) expect(stillDeclared(kept), kept).toBe(true);
  });
});
describe('20.213 neo keeps its selected tab pressed', () => {
  it('20.213 neo restates the inset `selected` shadow the base rule no longer reads', () => {
    const neo = ruleExactly(cssOf('ui'), '[data-style="neo"] .gn-segmented__item--on');
    expect(valueOf(neo, 'box-shadow')).toBe('var(--gn-shadow-selected)');
    // CONTROL — the base rule (hig/minimal) reads `lift`, so the neo line is what keeps neo pressed.
    const base = ruleExactly(cssOf('ui'), '.gn-segmented__item--on');
    expect(valueOf(base, 'box-shadow')).toBe('var(--gn-shadow-lift)');
  });
});
