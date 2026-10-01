import { describe, expect, it } from 'vitest';
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B9 — cases 20.281–20.282 (§20.29). */
const ROWS: RosterRow[] = [
  {
    sheet: 'ui',
    selectors: '.gn-board--empty',
    declarations: { background: 'var(--gn-surface-track)', 'box-shadow': 'var(--gn-shadow-track)', 'border-radius': 'var(--gn-radius-track)' },
  },
  { sheet: 'ui', selectors: '.gn-board__empty-create', pattern: 'P-QUIET', declarations: { 'font-size': '0.9375rem' } },
  { sheet: 'ui', selectors: '.gn-board__column-empty', declarations: { background: 'transparent' } },
];
const PREFIXES = ['.gn-board--empty', '.gn-board__empty', '.gn-board__column-empty'];

describe('20.281 empty states follow the rules', () => {
  it('20.281 every row; no accent fill on the create action; the icon disc keeps its fill', () => {
    const css = cssOf('ui');
    for (const row of ROWS) expectRow(row);
    // The create action is quiet: the loud fill belongs to the header's New ticket.
    const create = ruleExactly(css, '.gn-board__empty-create', null);
    expect(valueOf(create, 'background')).not.toMatch(/accent|fill-tertiary/);
    // Control: the icon disc is not a boundary job and keeps its fill.
    expectRow({ sheet: 'ui', selectors: '.gn-board__column-empty-icon', declarations: { background: 'var(--gn-fill-tertiary)' } });
  });
});
describe('20.282 no flat boundary in the empty states', () => {
  it('20.282 none; the scan reads them; the reset still precedes the rule', () => {
    const css = cssOf('ui');
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => PREFIXES.some((p) => s.includes(p)))).length).toBeGreaterThan(5);
    expect(flatBoundaryOffenders(css, PREFIXES, [])).toEqual([]);
    const resetAt = css.indexOf('.gn-board__empty-create,\n.add-rule-menu__trigger {');
    const styledAt = css.indexOf('.gn-board__empty-create {');
    expect(resetAt).toBeGreaterThan(-1);
    expect(styledAt).toBeGreaterThan(resetAt);
  });
});
