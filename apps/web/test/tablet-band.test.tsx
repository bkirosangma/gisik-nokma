import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { parseRules, readUiCss, ruleExactly, rulesNaming, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';
import { AppNav } from '../src/app-nav.js';
import { Providers } from '../src/providers.js';
import { PHONE_QUERY } from '../src/use-is-phone.js';
import { TABLET_BAR_QUERY } from '../src/use-tablet-bar.js';
import { clearLastProjectCache } from '../src/use-last-project.js';
import { clearLastWorkspaceCache } from '../src/use-last-workspace.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * UX fixes Task 4 — the tablet band, 641–1120px (audit U3). Cases 23.050–23.054, and 23.042 (shared with Task 3: the nav's
 * hand-over point is exactly 64rem).
 *
 * The CSS cases read the sheets' rule structure (`css-rules.ts`: which at-rule a rule sits under, and the source order that
 * decides at equal specificity); the script cases render `AppNav` against a `matchMedia` that EVALUATES the query it is
 * handed against a chosen viewport width, so "the bar shows at exactly 1024px and not at 1025px" is a computed fact about
 * the query string the code really passes, not a stub that answers yes to everything.
 */
const PHONE = '@media (max-width: 40rem)';
const TABLET = '@media (max-width: 64rem)';
const DESKTOP = '@media (min-width: 64.0625rem)';
const globals = readGlobalsCss();
const ui = readUiCss();

let currentPath = '/w/w1';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u1', name: 'Kiro', email: 'kiro@example.com' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

/** jsdom has no `matchMedia`: answer `(max-width: Nrem)` / `(min-width: Nrem)` for a viewport `px` wide (1rem = 16px). */
function viewport(px: number): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => {
      const m = /\((max|min)-width:\s*([\d.]+)rem\)/.exec(media);
      const limit = m === null ? Number.NaN : Number(m[2]) * 16;
      const matches = m === null ? false : m[1] === 'max' ? px <= limit : px >= limit;
      return { matches, media, addEventListener: () => undefined, removeEventListener: () => undefined };
    },
  });
}

const row: WorkspaceRef = {
  id: 'w1',
  name: 'Convenience Corner',
  prefix: 'CC',
  role: 'owner',
  archived: false,
  memberCount: 3,
  nameRestrictedProjectCount: 0,
  projects: [],
};
function nav() {
  return (
    <Providers services={stubServices({ getMyWorkspaces: async () => [row] }, { notifications: { unreadCount: async () => 0 } })}>
      <AppNav />
    </Providers>
  );
}
const bar = (): HTMLElement | null => document.querySelector('nav[aria-label="Phone"]');

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  clearLastWorkspaceCache();
  clearWorkspaceNameCache();
  clearLastProjectCache();
  clearWorkspaceProjectsCache();
  currentPath = '/w/w1';
  window.localStorage.setItem('gn-last-workspace', JSON.stringify({ userId: 'u1', workspaceId: 'w1' }));
});
afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('23.050 the bottom bar is the tablet band’s navigation too', () => {
  it('23.050 TABLET_BAR_QUERY is (max-width: 64rem) and PHONE_QUERY stays 40rem; AppNav renders the bar at 1024px and 800px but not at 1100px', async () => {
    expect(TABLET_BAR_QUERY).toBe('(max-width: 64rem)');
    // FD3: widening PHONE_QUERY would also move the phone top bar's switcher, the dialogs' bottom sheets and the byline.
    expect(PHONE_QUERY).toBe('(max-width: 40rem)');

    viewport(800);
    render(nav());
    await waitFor(() => expect(bar()).not.toBeNull());
    // The bar carries Notes and Inbox, so the corner stops rendering them (one place each).
    expect(document.querySelector('.gn-nav__corner a[href="/notes"], .gn-nav__corner a[href="/inbox"]')).toBeNull();

    // CONTROL — above 64rem the same component renders no bar and the corner keeps Notes and Inbox.
    cleanup();
    viewport(1100);
    render(nav());
    await screen.findByRole('link', { name: 'Notes' });
    expect(bar()).toBeNull();
    expect(document.querySelector('.gn-nav__corner a[href="/notes"]')).not.toBeNull();
  });
});

describe('23.051 the bar’s rules sit in the 64rem arm; the phone top bar’s stay in the 40rem arm', () => {
  it('23.051 every .gn-bottom-bar* rule (and the shell’s :has() padding) is under 64rem, none under 40rem; the switcher and the hidden link row stay under 40rem', () => {
    const barSelectors = [
      '.gn-bottom-bar',
      '.gn-bottom-bar[data-keyboard="open"]',
      '.gn-shell:has(.gn-bottom-bar)',
      '.gn-bottom-bar__item',
      '.gn-bottom-bar__indicator',
      '.gn-bottom-bar__dot',
    ];
    for (const selector of barSelectors) {
      expect(rulesNaming(globals, selector).filter((r) => r.atRule === PHONE), `${selector} under 40rem`).toEqual([]);
      expect(rulesNaming(globals, selector).filter((r) => r.atRule === TABLET).length, `${selector} under 64rem`).toBe(1);
    }
    expect(valueOf(ruleExactly(globals, '.gn-bottom-bar', TABLET), 'position')).toBe('fixed');
    // The 64rem arm comes AFTER the hidden-by-default base rule it overrides.
    const order = parseRules(globals);
    const base = order.findIndex((r) => r.atRule === null && r.selectors.join() === '.gn-bottom-bar');
    const arm = order.findIndex((r) => r.atRule === TABLET && r.selectors.join() === '.gn-bottom-bar');
    expect(base).toBeGreaterThan(-1);
    expect(arm).toBeGreaterThan(base);

    // CONTROL — the phone top bar is still the 40rem arm's: the switcher is painted, the link row is hidden, there.
    expect(valueOf(ruleExactly(globals, '.gn-phone-switcher', PHONE), 'display')).toBe('inline-flex');
    expect(valueOf(ruleExactly(globals, '.gn-nav__links--member', PHONE), 'display')).toBe('none');
    expect(valueOf(ruleExactly(globals, '.gn-bottom-bar'), 'display')).toBe('none');
  });
});

describe('23.042 the nav hands over to the bar at exactly 64rem, with no Menu button between', () => {
  it('23.042 at 1024px the bar shows and no "Menu" toggle exists; at 1025px the bar is gone, the desktop links show and still no "Menu"', async () => {
    viewport(1024);
    render(nav());
    await waitFor(() => expect(bar()).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    // The link row is the bar's job now: hidden at ≤64rem, laid out as direct children above it.
    expect(valueOf(ruleExactly(globals, '.gn-nav__more', TABLET), 'display')).toBe('none');
    expect(valueOf(ruleExactly(globals, '.gn-nav__more'), 'display')).toBe('contents');

    // CONTROL — one pixel wider, the reverse: no bar, the links are in the nav, and still no Menu.
    cleanup();
    viewport(1025);
    render(nav());
    await screen.findByRole('link', { name: 'My Work' });
    expect(bar()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(document.querySelector('.gn-nav__more-toggle')).toBeNull();
    // The desktop arm starts one hundredth of a pixel above 64rem: the two arms never both apply, never neither.
    expect(parseRules(globals).some((r) => r.atRule === DESKTOP && r.selectors.includes('.gn-nav__links'))).toBe(true);
    expect(parseRules(globals).some((r) => r.atRule === '@media (min-width: 70.0625rem)')).toBe(false);
    expect(parseRules(globals).some((r) => r.atRule === '@media (max-width: 70rem)')).toBe(false);
  });
});

describe('23.052 the tables stack through the tablet band', () => {
  it('23.052 .gn-list__table and .gn-members__table are blocks at ≤64rem and not at 40rem alone; the table form stays above 64rem', () => {
    expect(valueOf(ruleExactly(ui, '.gn-list__table', TABLET), 'display')).toBe('block');
    expect(valueOf(ruleExactly(ui, '.gn-list__table', TABLET), 'min-width')).toBe('0');
    expect(valueOf(ruleExactly(globals, '.gn-members__table', TABLET), 'display')).toBe('block');
    expect(valueOf(ruleExactly(globals, '.gn-members__table', TABLET), 'min-width')).toBe('0');
    expect(rulesNaming(ui, '.gn-list__table').filter((r) => r.atRule === PHONE)).toEqual([]);
    expect(rulesNaming(globals, '.gn-members__table').filter((r) => r.atRule === PHONE)).toEqual([]);

    // CONTROL — above 64rem both are tables with their floors, and nothing outside the arm gives them `display`.
    expect(valueOf(ruleExactly(ui, '.gn-list__table'), 'min-width')).toBe('51.25rem');
    expect(valueOf(ruleExactly(ui, '.gn-list__table'), 'display')).toBeNull();
    expect(valueOf(ruleExactly(globals, '.gn-members__table'), 'min-width')).toBe('51.25rem');
    expect(valueOf(ruleExactly(globals, '.gn-members__table'), 'display')).toBeNull();
  });
});

describe('23.053 the ticket sheet is full width through the tablet band; dialogs stay bottom sheets only on a phone', () => {
  it('23.053 .gn-sheet is 100% wide with no radius at ≤64rem, its header sticky; .gn-dialog is a bottom sheet only under 40rem', () => {
    const sheet = ruleExactly(ui, '.gn-sheet', TABLET);
    expect(valueOf(sheet, 'width')).toBe('100%');
    expect(valueOf(sheet, 'max-width')).toBe('none');
    expect(valueOf(sheet, 'border-radius')).toBe('0');
    expect(valueOf(ruleExactly(ui, '.gn-sheet__header', TABLET), 'position')).toBe('sticky');
    expect(rulesNaming(ui, '.gn-sheet').filter((r) => r.atRule === PHONE)).toEqual([]);
    expect(rulesNaming(ui, '.gn-sheet__header').filter((r) => r.atRule === PHONE)).toEqual([]);

    // CONTROL (21.070/21.072) — the dialogs' bottom-sheet rules and the sheet's Move shortcut did NOT widen.
    expect(valueOf(ruleExactly(ui, '.gn-dialog__scrim', PHONE), 'align-items')).toBe('flex-end');
    expect(valueOf(ruleExactly(ui, '.gn-dialog', PHONE), 'width')).toBe('100%');
    expect(valueOf(ruleExactly(ui, '.gn-sheet__move', PHONE), 'display')).toBe('inline-flex');
    expect(rulesNaming(ui, '.gn-dialog').filter((r) => r.atRule === TABLET)).toEqual([]);
  });
});

describe('23.054 the project toolbar is two rows through the tablet band', () => {
  it('23.054 at ≤64rem the header dissolves into the head row: identity and the primary on row one (primary right-aligned, never full width), the controls on row two; above 64rem it is the one row it was', () => {
    // The header's children become the head row's own flex items, so the primary can sit beside the identity.
    expect(valueOf(ruleExactly(ui, '.gn-project__header', TABLET), 'display')).toBe('contents');
    const primary = ruleExactly(ui, '.gn-project__header > .gn-button--primary', TABLET);
    expect(valueOf(primary, 'order')).toBe('1');
    expect(valueOf(primary, 'margin-left')).toBe('auto');
    expect(valueOf(primary, 'flex')).toBeNull();
    // A line break between row one and row two: the head's `::after` is a 100%-wide, zero-height item ordered between them.
    const brk = ruleExactly(ui, '.gn-project__head::after', TABLET);
    expect(valueOf(brk, 'flex-basis')).toBe('100%');
    expect(valueOf(brk, 'order')).toBe('2');
    expect(valueOf(ruleExactly(ui, '.gn-project__header > *', TABLET), 'order')).toBe('4');
    expect(valueOf(ruleExactly(ui, '.gn-project__search', TABLET), 'order')).toBe('3');
    expect(valueOf(ruleExactly(ui, '.gn-project__filters', TABLET), 'order')).toBe('3');
    // The primary is never full width, at any width.
    for (const rule of parseRules(ui).filter((r) => r.selectors.some((s) => s.includes('.gn-project__header') && s.includes('.gn-button--primary')))) {
      expect(valueOf(rule.body, 'flex') ?? '', rule.selectors.join()).not.toMatch(/100%/);
    }
    // The old phone arm no longer lifts search/Filters above the identity (orders -2/-1) or stretches the header.
    expect(rulesNaming(ui, '.gn-project__search').filter((r) => r.atRule === PHONE)).toEqual([]);
    expect(rulesNaming(ui, '.gn-project__header').filter((r) => r.atRule === PHONE)).toEqual([]);

    // CONTROL — above 64rem the header is still the wrapping flex row beside the identity: no `contents`, no `::after`.
    const base = ruleExactly(ui, '.gn-project__header');
    expect(valueOf(base, 'display')).toBe('flex');
    expect(valueOf(base, 'flex-wrap')).toBe('wrap');
    expect(rulesNaming(ui, '.gn-project__head::after').filter((r) => r.atRule === null)).toEqual([]);
  });
});
