import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteAnnouncer } from '../src/route-announcer.js';

/**
 * `usePathname` answers a MUTABLE module-level variable, so a case can move the
 * route by assigning to it and re-rendering — the same shape
 * `test/app-nav.test.tsx` uses for its own route-dependent cases. A static mock
 * would let every assertion here pass over a route that never changed.
 */
let currentPath = '/workspaces';
vi.mock('next/navigation', () => ({
  usePathname: () => currentPath,
}));

/** The shell's shape in miniature: the announcer plus the page it is describing. */
function Page({ heading }: { heading: string }) {
  return (
    <>
      <RouteAnnouncer />
      <main>
        <h1>{heading}</h1>
      </main>
    </>
  );
}

beforeEach(() => {
  currentPath = '/workspaces';
  // Mirrors the app: `app/layout.tsx:8` sets one static `metadata.title`, so
  // `document.title` is a non-empty constant on every route.
  document.title = 'Gisik Nokma';
});

/**
 * P18 (case 13.1050) — a client-side navigation used to announce nothing at all.
 *
 * The judge's line corrected the finding's third leg: the App Router DOES mount
 * an announcer. `next/dist/client/components/app-router-announcer.js` reads
 * `document.title`, falls back to `document.querySelector('h1')` **only when the
 * title is empty**, and speaks when the title it read differs from the last one
 * it read. This app's title is one static string (`app/layout.tsx:8`), so that
 * comparison never differs and the h1 fallback is unreachable — the announcer is
 * mounted and permanently silent, which is why "no live region" was the wrong
 * reason for a right symptom.
 *
 * The remedy is therefore NOT a second unconditional announcer: with a static
 * title, a plain copy would restore the announcement today and then double every
 * one of them the day per-route titles land (P12, batch B03). This component is
 * written to be exactly COMPLEMENTARY to the framework's —
 *
 *   - title CHANGED  → the App Router has already announced it; stay silent.
 *   - title UNCHANGED and non-empty → the App Router cannot speak; announce the
 *     new page's own `<h1>`, which is the more specific claim anyway.
 *
 * — so the product announces each navigation exactly once, before and after P12.
 */
describe('RouteAnnouncer — P18: a client-side navigation says which page you are on', () => {
  it('P18: announces nothing on the first render, because the screen reader announces the loaded document itself', () => {
    render(<Page heading="Workspaces" />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('P18: a route change announces the NEW page heading', async () => {
    const { rerender } = render(<Page heading="Workspaces" />);
    // Control, run first: the region exists and is silent before the change, so
    // the assertion below is a reading of a change and not of a region that
    // announces on every render.
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    currentPath = '/w/ws1/p/p1';
    rerender(<Page heading="Board" />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Board'));
    // The load-bearing half: it read the page it ARRIVED at, not the one it left.
    expect(screen.getByRole('status')).not.toHaveTextContent('Workspaces');
  });

  it('P18: stays silent when the title changed, because the App Router has already announced that', async () => {
    const { rerender } = render(<Page heading="Workspaces" />);
    document.title = 'Board · Gisik Nokma';
    currentPath = '/w/ws1/p/p1';
    rerender(<Page heading="Board" />);

    // Let the announcer's effect (and any deferred work behind it) settle before
    // reading the silence, so this cannot pass by simply not having run yet.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    // Control: the run really did change the page underneath it, so the silence
    // above is a decision about who announces and not a run where nothing moved.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Board');
  });

  it('P18: the announcement lands in a live region that exists before the change', () => {
    // The region is rendered unconditionally, empty, on every page — an
    // announcement written into a region that mounts WITH its text is not
    // reliably spoken, because the region was not in the accessibility tree when
    // the change happened.
    render(<Page heading="Workspaces" />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-atomic', 'true');
  });

  it('P18: the root layout mounts it, so it runs on every route', () => {
    const layout = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../app/layout.tsx'), 'utf8');
    // Positive control on the READ, first: a scan of an empty string finds
    // nothing and reports success, which is the failure mode this assertion
    // would otherwise hide.
    expect(layout.length, 'layout.tsx read as an empty string — the scan is reading nothing').toBeGreaterThan(0);
    expect(layout).toContain("from '../src/route-announcer.js'");
    expect(layout).toMatch(/<RouteAnnouncer\s*\/>/);
  });
});
