import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, flatBoundaryOffenders } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B14 — case 20.332 (§20.34). 20.331 is a DOM case in `apps/web/test/workspaces-invitation-banner.test.tsx`. */
describe('20.332 no flat boundary on /workspaces', () => {
  it('20.332 none', () => {
    const css = cssOf('globals');
    const prefixes = ['.gn-workspaces', '.gn-workspace-card', '.gn-invitations', '.gn-card-menu'];
    // CONTROL — the scan reads a real family, not an empty set.
    expect(parseRules(css).filter((rule) => rule.selectors.some((s) => prefixes.some((p) => s.includes(p)))).length).toBeGreaterThan(20);
    expect(flatBoundaryOffenders(css, prefixes, [])).toEqual([]);
  });
});
