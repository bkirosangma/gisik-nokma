import { render } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnnounceRegion } from '../src/announce-region.js';
import { AppNavSkeleton } from '../src/skeletons/app-nav-skeleton.js';
import { FormPageShell, ListPageShell, NotesPageShell, ProjectPageSkeleton } from '../src/skeletons/page-shells.js';
import ProjectLoading from '../app/w/[workspaceId]/p/[projectId]/loading.js';

/**
 * Smoothness T5 (spec D5, S1; amendment S-R1 structural skeletons; audit SM-02). Cases 25.051-25.053, 25.056-25.058
 * (bucket 25, `test-cases/25-smoothness.md`; 25.054 is `nav-pending.test.tsx`, 25.055 `shell-css.test.ts`).
 */
const APP = join(__dirname, '..', 'app');
const SRC = join(__dirname, '..', 'src');
const ROUTES_WITH_SHELLS = ['workspaces', 'w/[workspaceId]', 'w/[workspaceId]/p/[projectId]', 'w/[workspaceId]/my-work', 'my-work', 'w/[workspaceId]/members', 'w/[workspaceId]/settings', 'inbox', 'notes', 'notes/[noteId]', 'account', 'settings'];
const read = (...parts: string[]) => readFileSync(join(...parts), 'utf8');

describe('route shells (spec D5, S1; audit SM-02)', () => {
  it("25.060 the notes shell's tree is the real CLOSED drawer (`nav.gn-notes__tree.gn-notes__tree--drawer`, data-open=false), so the <=60rem arm hides it as it hides the real one and the document does not jump", () => {
    const tree = render(<NotesPageShell />).container.querySelector('.gn-notes__body > .gn-notes__tree')!;
    expect(tree.tagName).toBe('NAV');
    expect(tree.getAttribute('data-open')).toBe('false');
    // CONTROL: the class list equals the real page's own tree, read from its source.
    const real = read(SRC, 'notes/notes-page.tsx').match(/<nav[^>]*id="gn-notes-tree"[^>]*className="([^"]+)"/)?.[1];
    expect(real, 'the real tree element was found').toBe('gn-notes__tree gn-notes__tree--drawer');
    expect(tree.className).toBe(real);
  });

  it('25.051 every signed-in route segment has a loading.tsx; the sign-in and legal routes do not', () => {
    for (const route of ROUTES_WITH_SHELLS) expect(existsSync(join(APP, route, 'loading.tsx')), route).toBe(true);
    for (const route of ['sign-in', 'privacy', 'terms', 'invite/[token]']) expect(existsSync(join(APP, route, 'loading.tsx')), route).toBe(false);
  });

  it("25.052 the project shell is the page's own `main.gn-shell--wide`, busy, has no link or button, and draws the remembered tab's shape out of the board's own column and card classes", () => {
    const { container } = render(<ProjectPageSkeleton tab="list" />);
    const main = container.querySelector('main')!;
    expect(main.className).toContain('gn-shell gn-shell--wide');
    expect(main).toHaveAttribute('aria-busy', 'true');
    expect(main.querySelectorAll('a, button, input')).toHaveLength(0);
    // EXACT: the list tab is the list's own table (smoothness T6, S-R1 rule 1) with eight real rows (a 7-row list must fail,
    // not just a 2-row one), and each row's state chip is one block: five tab blocks + the header's three control places (search, Filters, Create ticket; G1 25.242) + eight chips.
    expect(main.querySelectorAll('.gn-list .gn-list__table-wrap table.gn-table.gn-list__table tbody tr.gn-list__table-row')).toHaveLength(8);
    expect(main.querySelectorAll('.gn-skeleton--block')).toHaveLength(5 + 3 + 8);
    expect(main.querySelectorAll('.gn-board__column')).toHaveLength(0);
    // Control: the board tab draws three real columns of three real cards (S-R1 rule 1: the frame is the real element),
    // and no stand-in `card` shape.
    const board = render(<ProjectPageSkeleton tab="board" />).container;
    expect(board.querySelectorAll('section.gn-board__column')).toHaveLength(3);
    expect(board.querySelectorAll('.gn-board__column .gn-board__cards > li > .gn-card.gn-board-card')).toHaveLength(9);
    expect(board.querySelectorAll('.gn-skeleton--card')).toHaveLength(0);
  });

  it("25.053 loading.tsx for the project route renders the SAME shell component as the page's Suspense fallback; a list shell carries the nav skeleton and its rows", () => {
    const fromRoute = render(<ProjectLoading />).container.innerHTML;
    const fromShell = render(<ProjectPageSkeleton />).container.innerHTML;
    expect(fromRoute).toBe(fromShell);
    const list = render(<ListPageShell title="Members" rows={5} />).container;
    expect(list.querySelector('nav.gn-nav--skeleton')).not.toBeNull();
    expect(list.querySelectorAll('.gn-shell__main .gn-skeleton--block')).toHaveLength(5);
    // Control: the page fallback uses the shell, not an empty main.
    const page = read(APP, 'w/[workspaceId]/p/[projectId]/page.tsx');
    expect(page).toContain('fallback={<ProjectPageSkeleton');
    expect(page).not.toContain('fallback={<main className="gn-shell gn-shell--wide" />}');
  });

  it('25.057 the nav skeleton is the real bar: .gn-nav > .gn-nav__inner with the real brand, a member link row and the corner; busy; no link or button', () => {
    const { container } = render(<AppNavSkeleton />);
    const nav = container.querySelector('nav')!;
    expect(nav.className).toBe('gn-nav gn-nav--skeleton');
    expect(nav).toHaveAttribute('aria-busy', 'true');
    expect(nav.querySelector('.gn-nav__inner > .gn-nav__brand .gn-nav__wordmark')?.textContent).toBe('Gisik Nokma');
    expect(nav.querySelector('.gn-nav__inner > .gn-nav__links.gn-nav__links--member > .gn-nav__more .gn-skeleton--line')).not.toBeNull();
    expect(nav.querySelector('.gn-nav__inner > .gn-nav__corner .gn-skeleton--circle')).not.toBeNull();
    expect(nav.querySelectorAll('a, button, input')).toHaveLength(0);
    // Control: the notes and form shells are built from the same bar, and the centred form shell has none.
    expect(render(<NotesPageShell />).container.querySelector('main.gn-notes-page nav.gn-nav--skeleton')).not.toBeNull();
    expect(render(<FormPageShell title="Account" />).container.querySelector('nav.gn-nav--skeleton')).not.toBeNull();
    expect(render(<FormPageShell title="Sign in" centred />).container.querySelector('nav')).toBeNull();
  });

  it('25.056 layout.tsx mounts exactly one <AnnounceRegion /> after the route announcer and before <Providers>, and the desktop entry mounts one beside <App />', () => {
    const layout = read(APP, 'layout.tsx');
    expect(layout.match(/<AnnounceRegion/g)).toHaveLength(1);
    expect(layout.indexOf('<AnnounceRegion')).toBeGreaterThan(layout.indexOf('<RouteAnnouncer'));
    expect(layout.indexOf('<AnnounceRegion')).toBeLessThan(layout.indexOf('<Providers>{children}'));
    const desktop = read(__dirname, '..', '..', 'desktop', 'src', 'main.tsx');
    expect(desktop.match(/<AnnounceRegion/g)).toHaveLength(1);
    expect(desktop.indexOf('<AnnounceRegion')).toBeLessThan(desktop.indexOf('<App'));
    // The web layout mounts the CLIENT WRAPPER, so render it: exactly one polite status region (a wrapper that returns null leaves the layout's source sweep green).
    const { container } = render(<AnnounceRegion />);
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(layout).toContain("from '../src/announce-region.js'");
  });

  it('25.058 every nav link wraps its label in <NavPending>: per file the <Link count EQUALS the <NavPending> count (the bar, both hover menus, the notes and inbox links, the bottom-bar slots and the More-sheet rows)', () => {
    for (const file of ['app-nav.tsx', 'nav-hover-menu.tsx', 'bottom-bar.tsx', 'notes-nav-link.tsx', 'inbox-nav-link.tsx']) {
      const source = read(SRC, file);
      const links = source.match(/<Link\b/g)?.length ?? 0;
      expect(links, `${file} has links`).toBeGreaterThan(0);
      expect(source.match(/<NavPending>/g)?.length ?? 0, `${file}: every <Link wraps its label`).toBe(links);
    }
    // Control: the skeleton never draws a link.
    expect(read(SRC, 'skeletons/app-nav-skeleton.tsx')).not.toContain('next/link');
  });
});
