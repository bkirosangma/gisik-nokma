import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B18 — cases 20.371–20.372 (§20.38). */
describe('20.371 Inbox follows the rules', () => {
  it('20.371 44px rows; quiet more; the unread signal keeps the accent', () => {
    // CONTROL — the unread dot and badge stay on the accent: the one place it marks state rather than the action.
    expectRow({ sheet: 'ui', selectors: '.gn-inbox__dot', declarations: { background: 'var(--gn-accent)' } });
    expectRow({ sheet: 'ui', selectors: '.gn-inbox__badge', declarations: { background: 'var(--gn-accent)' } });
    expectRow({ sheet: 'ui', selectors: '.gn-inbox__row', declarations: { 'min-height': '2.75rem' } });
    expectRow({ sheet: 'ui', selectors: '.gn-inbox__more', pattern: 'P-QUIET' });
  });
});

describe('20.372 no flat boundary in the Inbox', () => {
  it('20.372 none', () => {
    const css = cssOf('ui');
    // CONTROL — the scan reads the inbox rules, not an empty set.
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => s.includes('.gn-inbox'))).length).toBeGreaterThan(10);
    expect(flatBoundaryOffenders(css, ['.gn-inbox'], [])).toEqual([]);
  });
});
