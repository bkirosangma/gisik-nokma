import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B10 — cases 20.291–20.292 (§20.30). An AUDIT task: no CSS changed. */
const PREFIXES = ['.gn-my-work', '.gn-attention'];

describe('20.291 My work inherits the refresh', () => {
  it('20.291 no flat boundary; the scan reads the row-title rules', () => {
    const css = cssOf('ui');
    const rules = parseRules(css).filter((rule) => rule.selectors.some((s) => PREFIXES.some((p) => s.includes(p))));
    expect(rules.length).toBeGreaterThanOrEqual(15);
    const lists = rules.map((rule) => rule.selectors.join(', '));
    expect(lists).toContain('.gn-my-work__title');
    expect(lists).toContain('.gn-attention__title');
    expect(flatBoundaryOffenders(css, PREFIXES, [])).toEqual([]);
  });
});
describe('20.292 the rows keep their in-list floor', () => {
  it('20.292 1.5rem on both titles; the attention item keeps it too', () => {
    expectRow({ sheet: 'ui', selectors: '.gn-my-work__title', declarations: { 'min-height': '1.5rem' } });
    expectRow({ sheet: 'ui', selectors: '.gn-attention__title', declarations: { 'min-height': '1.5rem' } });
    expectRow({ sheet: 'ui', selectors: '.gn-attention__item', declarations: { 'min-height': '1.5rem' } });
  });
});
