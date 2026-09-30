import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B15 — cases 20.341–20.342 (§20.35). 20.343 is a DOM case in `apps/web/test/settings-page.test.tsx`. */
const ROWS: RosterRow[] = [
  { sheet: 'globals', selectors: '.gn-settings__sidebar', pattern: 'P-RAISED' },
  { sheet: 'globals', selectors: '.gn-workspace-settings__actions', declarations: { 'border-top': '1px solid var(--gn-fill-secondary)' } },
];
describe('20.341 Settings follows the rules', () => {
  it('20.341 every row; fields keep their edge', () => {
    // CONTROL — the form's fields keep their accessible edge (B2): only the ACTION ROW's separator went to a hairline.
    expectRow({ sheet: 'ui', selectors: '.gn-field__input', declarations: { border: '1px solid var(--gn-border)' } });
    for (const row of ROWS) expectRow(row);
  });
});
describe('20.342 no flat boundary in Settings', () => {
  it('20.342 none', () => {
    const css = cssOf('globals');
    const prefixes = ['.gn-settings', '.gn-workspace-settings', '.gn-workspace-list'];
    // CONTROL — the scan reads the settings and workspace-settings rules, not an empty set.
    const scanned = parseRules(css).filter((rule) => rule.selectors.some((s) => prefixes.some((p) => s.includes(p))));
    expect(scanned.length).toBeGreaterThan(15);
    expect(scanned.some((rule) => rule.selectors.some((s) => s.includes('.gn-workspace-settings')))).toBe(true);
    expect(flatBoundaryOffenders(css, prefixes, [])).toEqual([]);
  });
});
