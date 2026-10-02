import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_NAME, documentTitleFor } from '../src/page-title.js';
import { DocumentTitle } from '../src/document-title.js';

/**
 * **P12 — every route names its view, and the product's name is not the answer.**
 * Case `13.1057` (`test-cases/13-hig-per-screen.md`).
 *
 * The finding, measured: `app/layout.tsx` set `{ title: 'Gisik Nokma' }` and
 * nothing else in the product set a title, so `/sign-in`, `/inbox`, `/help`, a
 * board, a ticket sheet, `/settings`, `/privacy`, `/terms` and the 404 all
 * carried the same string. WCAG 2.2 §2.4.2 *Page Titled* is Level A, and its
 * Understanding document says of exactly this shape of application: *"for web
 * applications (single page applications) where the view changes dynamically,
 * the title should also be changed dynamically to reflect the content or topic
 * of the current view."*
 *
 * ## Why this file is mostly a SOURCE SWEEP, and what that can and cannot prove
 *
 * The defect is not one route's title; it is that **a route can have NO title and
 * nothing notices**. Twenty-three pages exist and the finding's own instrument
 * was `grep -rln -E 'generateMetadata|export const metadata' apps/web` returning
 * one file — so the sweep is rebuilt here as a case that reddens on the NEXT
 * route added without one, which no runtime arm can do.
 *
 * ⚠ **The sweep proves a mechanism is DECLARED, never that it runs**, and the two
 * halves of the mechanism are not equally visible to a test:
 *
 * - a `'use client'` route's `<DocumentTitle>` is mounted by the runtime arm
 *   below and its effect is real in jsdom;
 * - a server route's `export const metadata` is applied by NEXT's runtime, which
 *   a bare `render()` of the page never invokes. This file cannot execute it.
 *   It is declared-and-counted here, and the honest statement is that its
 *   behaviour is witnessed by `next build` accepting it and by the browser;
 *   `test/next-config.test.ts`'s neighbours are the closest static instrument.
 *
 * Neither half is a claim that a reader SEES the title. That is a browser
 * reading, and it is owed rather than asserted here.
 */

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(WEB_ROOT, 'app');

/**
 * Every routing file under `app/` that draws a view, as app-relative paths.
 *
 * `not-found.tsx` is in the walk and not an afterthought: the finding names the
 * 404 among the routes that all read "Gisik Nokma", and it is the one route a
 * reader reaches with NO context — the title is the only thing that says the
 * page was not found before the heading is. It may not export Next's `metadata`
 * (that is `layout`/`page`/`route` only), so it uses the component.
 */
function pageRoutes(dir: string = APP_DIR): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...pageRoutes(full));
    } else if (entry === 'page.tsx' || entry === 'not-found.tsx') {
      found.push(relative(APP_DIR, full));
    }
  }
  return found.sort();
}

/**
 * Routes that render NO view and therefore name none.
 *
 * `app/page.tsx` is `redirect('/workspaces')` and nothing else — the browser
 * leaves before a title could describe anything, and giving it one would be a
 * claim about a screen that never draws. Excluded rather than exempted: the arm
 * below asserts the route still IS a bare redirect, so this set cannot quietly
 * become the place an unwanted page is hidden.
 */
const NO_VIEW_ROUTES = ['page.tsx'];

/** How a route declares its title, or `null` when it declares none. */
function declaredTitle(source: string): 'metadata' | 'generateMetadata' | 'DocumentTitle' | null {
  if (/export\s+(?:async\s+)?function\s+generateMetadata\b/.test(source)) return 'generateMetadata';
  if (/export\s+const\s+metadata\b/.test(source)) return 'metadata';
  if (/<DocumentTitle\b/.test(source)) return 'DocumentTitle';
  return null;
}

const originalTitle = document.title;
afterEach(() => {
  document.title = originalTitle;
});

describe('P12 the product names each view', () => {
  it('every route under app/ declares a title — metadata, generateMetadata, or <DocumentTitle>', () => {
    const routes = pageRoutes();
    // POSITIVE CONTROL: the walk found a real tree. A regex that matches nothing
    // in an EMPTY list and a regex that matches nothing in a real one produce the
    // same green below, and only this arm tells them apart.
    expect(routes.length).toBeGreaterThan(20);

    // ⚠ THE RULE THIS ARM ENFORCES WAS TIGHTENED ON 2026-09-21, after a browser
    // reading, and the tightening is the point: a `<DocumentTitle>` is NOT an
    // acceptable title mechanism for a route whose topic is known at build time.
    // It writes `document.title` from an effect, and React's head hydration
    // repairs the `<title>` node 21 ms later — measured in the built app, the
    // trace is in `src/document-title.tsx`. **The old arm passed on every one of
    // those routes while not one of their tabs showed the right title.**
    //
    // So a route is now titled by whichever of these it can actually use:
    //   - its own `metadata`/`generateMetadata` (`page.tsx` or `layout.tsx`), or
    //   - a SIBLING `layout.tsx` exporting `metadata` (a segment layout is a
    //     server component even when the page under it is `'use client'`), or
    //   - `<DocumentTitle>`, which is correct ONLY where the topic resolves from
    //     a READ — the workspace and project names land long after the repair.
    const undeclared = routes
      .filter((route) => !NO_VIEW_ROUTES.includes(route))
      .filter((route) => {
        const dir = dirname(route);
        const own = readFileSync(join(APP_DIR, route), 'utf8');
        if (declaredTitle(own) !== null) return false;
        const sibling = join(APP_DIR, dir, 'layout.tsx');
        return !existsSync(sibling) || declaredTitle(readFileSync(sibling, 'utf8')) === null;
      });
    expect(undeclared, `routes with no title mechanism: ${undeclared.join(', ')}`).toEqual([]);
  });

  it('a client page names its title from a SERVER layout, never from <DocumentTitle> alone', () => {
    // The discrimination the arm above cannot make on its own: a client page
    // that reaches for `<DocumentTitle>` with a LITERAL topic is the measured
    // failure, and it must carry a sibling layout instead. The two exceptions
    // are named, and they are named because their titles come from a read.
    const DYNAMIC_TITLE_ROUTES = new Set([
      'w/[workspaceId]/page.tsx',
      'w/[workspaceId]/p/[projectId]/page.tsx',
    ]);

    const racy: string[] = [];
    for (const route of pageRoutes()) {
      if (DYNAMIC_TITLE_ROUTES.has(route)) continue;
      const source = readFileSync(join(APP_DIR, route), 'utf8');
      if (declaredTitle(source) === 'DocumentTitle') racy.push(route);
    }
    expect(
      racy,
      `routes titling themselves from a client effect with a literal topic — the ` +
        `effect loses to React's head hydration:\n${racy.join('\n')}`,
    ).toEqual([]);

    // And the two exceptions really are the dynamic ones: each must BOTH render
    // `<DocumentTitle>` (for the resolved name) AND have a server layout (for
    // the generic title shown until that read answers).
    for (const route of DYNAMIC_TITLE_ROUTES) {
      expect(pageRoutes()).toContain(route);
      expect(declaredTitle(readFileSync(join(APP_DIR, route), 'utf8'))).toBe('DocumentTitle');
      const sibling = join(APP_DIR, dirname(route), 'layout.tsx');
      expect(existsSync(sibling), `${route} has no server layout for its generic title`).toBe(true);
      expect(declaredTitle(readFileSync(sibling, 'utf8'))).toBe('metadata');
    }
  });

  it('the excluded routes are still bare redirects, so the exclusion cannot hide a page', () => {
    for (const route of NO_VIEW_ROUTES) {
      const source = readFileSync(join(APP_DIR, route), 'utf8');
      // The control that keeps this a NAMED absence: the route must still be a
      // redirect and still render nothing. A page that grew a view would fail
      // here rather than slipping past the sweep above.
      expect(source, `${route} no longer redirects`).toMatch(/redirect\(/);
      expect(source, `${route} renders something`).not.toMatch(/<[a-z]/);
      expect(declaredTitle(source)).toBeNull();
    }
  });

  it('no route declares a title mechanism it cannot use — a client page gets <DocumentTitle> or nothing', () => {
    // The trap this arm exists for, and it is the reason the sweep above cannot
    // be the only one: `export const metadata` in a `'use client'` module is not
    // an error Next reports. The export is silently IGNORED and the page keeps
    // the previous route's title — a route that LOOKS titled in source and is
    // not in the browser. So a client page may use the component and may not
    // lean on `metadata`.
    const wrongMechanism = pageRoutes().filter((route) => {
      const source = readFileSync(join(APP_DIR, route), 'utf8');
      const isClient = /^\s*['"]use client['"]/m.test(source);
      if (!isClient) return false;
      const kind = declaredTitle(source);
      return kind === 'metadata' || kind === 'generateMetadata';
    });
    expect(wrongMechanism, `client routes relying on an ignored metadata export: ${wrongMechanism.join(', ')}`).toEqual(
      [],
    );
  });

  it('every declared topic is a real topic — nothing renders the bare product name as a route title', () => {
    // The defect, restated as a property: the title named the PRODUCT and never
    // the view. A route whose topic is the product name is the old behaviour
    // wearing the new mechanism, and `documentTitleFor` would return it
    // unchanged — so it is caught here rather than by the suffix.
    // ⚠ THE UNIVERSE MOVED WITH THE FIX, and this is the correction rather than
    // a loosening: the literal topics used to live in `<DocumentTitle
    // title="…">` elements and now live in the layouts' `metadata` —
    // `documentTitleFor('Help')` — because that is the only mechanism that
    // survives hydration. Reading only the old spelling found ZERO topics and
    // reported it as `expected 0 to be greater than 10`, which is the positive
    // control doing its job.
    const sources = [
      ...pageRoutes().map((route) => ({ route, file: join(APP_DIR, route) })),
      ...pageRoutes()
        .map((route) => ({ route, file: join(APP_DIR, dirname(route), 'layout.tsx') }))
        .filter((entry) => existsSync(entry.file)),
    ];
    const topics = sources.flatMap(({ route, file }) => {
      const source = readFileSync(file, 'utf8');
      const fromElement = [...source.matchAll(/<DocumentTitle\s+title=(?:"([^"]*)"|\{`([^`]*)`\})/g)];
      const fromFor = [...source.matchAll(/documentTitleFor\(\s*'([^']*)'\s*\)/g)];
      return [
        ...fromElement.map((m) => ({ route, topic: m[1] ?? m[2] ?? '' })),
        ...fromFor.map((m) => ({ route, topic: m[1] ?? '' })),
      ];
    });
    // POSITIVE CONTROL: the extraction found declarations at all.
    expect(topics.length).toBeGreaterThan(10);
    const empty = topics.filter((entry) => entry.topic.trim() === '');
    expect(empty, `blank topics: ${empty.map((e) => e.route).join(', ')}`).toEqual([]);
    const bareProduct = topics.filter((entry) => entry.topic.trim() === APP_NAME);
    expect(bareProduct.map((e) => e.route)).toEqual([]);
  });
});

describe('P12 the mechanism', () => {
  it('documentTitleFor suffixes the topic, and is idempotent on the product name', () => {
    expect(documentTitleFor('Inbox')).toBe('Inbox | Gisik Nokma');
    // A route whose topic IS the product must not read `Gisik Nokma | Gisik Nokma`.
    expect(documentTitleFor(APP_NAME)).toBe(APP_NAME);
    // A blank topic is no topic, and must not produce a title that begins with
    // the separator.
    expect(documentTitleFor('   ')).toBe(APP_NAME);
  });

  it('a mounted <DocumentTitle> sets document.title, and follows the topic when it changes', async () => {
    document.title = 'whatever the last route left';
    const { rerender } = render(<DocumentTitle title="Inbox" />);
    await waitFor(() => {
      expect(document.title).toBe('Inbox | Gisik Nokma');
    });
    // The late-resolving topic arm: a route that reads its name from the server
    // sets a generic title first and the named one when it arrives.
    rerender(<DocumentTitle title="Shop operations" />);
    await waitFor(() => {
      expect(document.title).toBe('Shop operations | Gisik Nokma');
    });
  });
});
