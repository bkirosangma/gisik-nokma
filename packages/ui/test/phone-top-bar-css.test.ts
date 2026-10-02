import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers/colour-scan.js';
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';
import { readGlobalsCss } from './helpers/style-patterns.js';

/** The web app on phones, Plan Task 2 — the CSS half of cases 21.012–21.013 (§21.2). */
const PHONE = '@media (max-width: 40rem)';
const css = readGlobalsCss();

describe('21.012 the phone top bar lives inside the 40rem arm', () => {
  it('21.012 the member links and the scope note are hidden and the switcher shown at ≤40rem, hidden above; no top-level .gn-nav* rule changed', () => {
    expect(valueOf(ruleExactly(css, '.gn-nav__links--member', PHONE), 'display')).toBe('none');
    expect(valueOf(ruleExactly(css, '.gn-nav__scope', PHONE), 'display')).toBe('none');
    expect(valueOf(ruleExactly(css, '.gn-phone-switcher', PHONE), 'display')).toBe('inline-flex');
    // Above 40rem the switcher is not painted: its UNCONDITIONAL rule hides it, the arm above reveals it.
    expect(valueOf(ruleExactly(css, '.gn-phone-switcher'), 'display')).toBe('none');
    // The scope note is untouched above 40rem (case 13.391's subject keeps its subject).
    expect(valueOf(ruleExactly(css, '.gn-nav__scope'), 'display')).toBeNull();
    // `.gn-nav__links--member` has NO top-level rule at all: it is a hook the arm above paints, nothing more.
    expect(parseRules(css).filter((r) => r.atRule === null && r.selectors.includes('.gn-nav__links--member'))).toEqual([]);

    // CONTROL — the desktop/tablet bar is byte-identical outside the 40rem arm: every top-level
    // `.gn-nav*` rule body equals the one snapshotted from `origin/release/mobile` before Task 2 — re-snapshotted deliberately by UX fixes Task 14 (cases 23.250–23.257: the hover bridge, the capped scrolling panel and the workspace-name wrapper add four top-level rules) and by UX fixes Task 3 (case 23.044: the 24px gutter on `.gn-nav__inner`, the last-project divider and label, the lit link's indicator bar), by neo refresh T3 (case 24.041: the neo current item reads `recess`) and by neo refresh T6 (case 24.083: the nav reads `raised-lg`, the two menu panels `near-lg`) and by smoothness T5 (cases 25.055: the skeleton bar's reserved height and the pending hint's box and pulse add three top-level rules).
    const baseline = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/ui/test/fixtures/gn-nav-top-level.json'), 'utf8')) as Record<string, string>;
    const now: Record<string, string> = {};
    for (const rule of parseRules(css)) {
      if (rule.atRule !== null) continue;
      const key = rule.selectors.join(', ');
      if (!key.includes('.gn-nav')) continue;
      now[key] = (now[key] === undefined ? '' : `${now[key]} | `) + rule.body.replace(/\s+/g, ' ').trim();
    }
    expect(now).toEqual(baseline);
  });
});

describe('21.013 the page title is one line at ≤40rem', () => {
  it('21.013 nowrap + ellipsis at the phone size, on the shared title and the account override; above 40rem the title rule is unchanged', () => {
    for (const selector of ['.gn-page-title', '.gn-account .gn-page-title']) {
      const phone = ruleExactly(css, selector, PHONE);
      expect(valueOf(phone, 'font-size'), selector).toBe('var(--gn-title-page-phone)'); // 22px: the token (AMENDED 2026-10-02, UX fixes Task 5, case 23.070)
      expect(valueOf(phone, 'line-height'), selector).toBe('1.75rem');
    }
    const title = ruleExactly(css, '.gn-page-title', PHONE);
    expect(valueOf(title, 'white-space')).toBe('nowrap');
    expect(valueOf(title, 'overflow')).toBe('hidden');
    expect(valueOf(title, 'text-overflow')).toBe('ellipsis');
    // CONTROL — above 40rem the display size is still 34px/41px and nothing truncates.
    const base = ruleExactly(css, '.gn-page-title');
    expect(valueOf(base, 'font-size')).toBe('var(--gn-title-page)'); // 34px (AMENDED 2026-10-02, case 23.070)
    expect(valueOf(base, 'white-space')).toBeNull();
    expect(valueOf(base, 'text-overflow')).toBeNull();
    expect(valueOf(ruleExactly(css, '.gn-account .gn-page-title'), 'font-size')).toBe('var(--gn-title-page)');
  });
});
