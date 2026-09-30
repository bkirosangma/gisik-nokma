import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B17 — cases 20.361–20.362 (§20.37). 20.363 is a DOM case in `packages/app-core/test/account/passkeys-section.test.tsx`. */
describe('20.361 Account follows the rules', () => {
  it('20.361 raised sections; the Deleted items row actions keep 44px', () => {
    // CONTROL — the Deleted items row actions keep their 44px floor (they are quiet buttons, not restyled).
    expectRow({ sheet: 'globals', selectors: '.gn-deleted-items__actions .gn-button', declarations: { 'min-height': '2.75rem' } });
    expectRow({ sheet: 'globals', selectors: '.gn-account__section', pattern: 'P-RAISED' });
  });
});

describe('20.362 no flat boundary on Account', () => {
  it('20.362 none', () => {
    const css = cssOf('globals');
    const prefixes = ['.gn-account', '.gn-deleted-items'];
    // CONTROL — the scan reads the account and Deleted-items rules, not an empty set. (The plan's `> 30` counted
    // `.gn-account` alone, which is 28; the Deleted-items rules are in the scan's prefixes, so they are in the count.)
    const scanned = parseRules(css).filter((rule) => rule.selectors.some((s) => prefixes.some((p) => s.includes(p))));
    expect(scanned.length).toBeGreaterThan(30);
    expect(scanned.some((rule) => rule.selectors.some((s) => s.includes('.gn-deleted-items')))).toBe(true);
    expect(scanned.some((rule) => rule.selectors.some((s) => s.includes('.gn-account')))).toBe(true);
    expect(flatBoundaryOffenders(css, prefixes, [])).toEqual([]);
  });
});
