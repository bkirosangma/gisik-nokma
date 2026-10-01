import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers/colour-scan.js';
import { parseRules, readUiCss } from './helpers/css-rules.js';
import { PHONE_OWNERS, listPageRoutes, unownedRoutes } from './helpers/style-patterns.js';
import { readGlobalsCss } from './helpers/style-patterns.js';
import { themeStylesheet } from '../src/tokens.js';

/** The web app on phones, Plan Task 1 — cases 21.001–21.003 (§21.1). */
describe('21.001 every route has a phone owner', () => {
  it('21.001 26 routes, all owned, none stale', () => {
    const routes = listPageRoutes();
    expect(routes).toHaveLength(26);
    expect(unownedRoutes(routes, PHONE_OWNERS)).toEqual({ unowned: [], stale: [] });
    // CONTROL — a planted route and a planted owner are both reported.
    const planted = unownedRoutes([...routes, 'apps/web/app/zz/page.tsx'], { ...PHONE_OWNERS, 'apps/web/app/gone/page.tsx': 'T0' });
    expect(planted).toEqual({ unowned: ['apps/web/app/zz/page.tsx'], stale: ['apps/web/app/gone/page.tsx'] });
  });
});

describe('21.002 the viewport opts into the safe area', () => {
  it('21.002 viewportFit cover + interactiveWidget resizes-content', () => {
    const layout = readFileSync(join(REPO_ROOT, 'apps/web/app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/export const viewport\b/);
    expect(layout).toMatch(/viewportFit:\s*'cover'/);
    expect(layout).toMatch(/interactiveWidget:\s*'resizes-content'/);
    // CONTROL — the two settings every page already relied on are kept.
    expect(layout).toMatch(/width:\s*'device-width'/);
    expect(layout).toMatch(/initialScale:\s*1/);
  });
});

describe('21.003 phone tokens', () => {
  it('21.003 bar and top heights declared once, in the bare :root block; no phone rule hard-codes the bar height', () => {
    const stylesheet = themeStylesheet();
    const firstBlock = stylesheet.split('\n')[0] ?? '';
    for (const declaration of ['--gn-phone-bar-height: 3.5rem;', '--gn-phone-top-height: 3.25rem;']) {
      expect(firstBlock, declaration).toContain(declaration);
      expect(stylesheet.split(declaration).length - 1, `${declaration} declared once`).toBe(1);
    }
    // CONTROL — no rule inside a 40rem arm of either sheet spells the bar height as a literal.
    for (const css of [readUiCss(), readGlobalsCss()]) {
      const phone = parseRules(css).filter((rule) => rule.atRule === '@media (max-width: 40rem)');
      for (const rule of phone) expect(rule.body, rule.selectors.join(', ')).not.toMatch(/(?:^|[;\s])height:\s*3\.5rem/);
    }
  });
});
