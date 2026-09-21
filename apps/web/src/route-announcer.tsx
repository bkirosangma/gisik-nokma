'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * P18 — a client-side navigation used to announce nothing, and the reason is
 * narrower than the finding first wrote it.
 *
 * The App Router DOES mount an announcer:
 * `node_modules/next/dist/client/components/app-router-announcer.js`
 * (`AppRouterAnnouncer`, mounted unconditionally at
 * `next/dist/client/components/app-router.js:423`). What it does, read from the
 * source rather than inferred from the symptom:
 *
 *   - it renders a visually-hidden `role="alert"` / `aria-live="assertive"`
 *     `<div>` into a shadow root on `document.body`;
 *   - on every router-tree change it reads `document.title`, and falls back to
 *     `document.querySelector('h1')` **only when the title is empty**;
 *   - it speaks when that value differs from the one it read last time, and
 *     never on first load.
 *
 * `app/layout.tsx:8` sets one static `metadata.title`, so `document.title` is a
 * non-empty constant on every route in this product. The comparison therefore
 * never differs and the `h1` fallback is unreachable — the announcer is mounted,
 * correct in its own terms, and permanently silent. That is why the finding's
 * third leg ("no live region") was the wrong reason for a right symptom: the
 * mechanism is present and this app's metadata is what defeats it.
 *
 * ## Why this is written to be COMPLEMENTARY to the framework's, not a copy
 *
 * The obvious remedy — mount our own unconditional announcer — restores the
 * announcement today and then doubles every one of them the day per-route titles
 * land (P12, batch B03). So the condition here is the exact complement of the
 * framework's:
 *
 *   - **the title CHANGED** → `AppRouterAnnouncer` has already spoken. Silent.
 *   - **the title is empty** → `AppRouterAnnouncer` takes its `h1` branch and has
 *     already spoken. Silent.
 *   - **the title is non-empty and unchanged** → the framework cannot speak, and
 *     this is the only case left. It announces the new page's own `<h1>`.
 *
 * Each navigation is announced once, before and after P12, and the split is
 * decided by reading the framework's condition rather than by duplicating it.
 * The `<h1>` is the better announcement anyway when both are available: it names
 * the page, where the title would repeat the product name on every route.
 *
 * ## What this does NOT do
 *
 * It does not move focus. The finding offers that as an alternative remedy;
 * announcing is the half that also survives a person who is reading the new page
 * with a screen reader's cursor rather than tabbing, and moving focus on every
 * route change is a bigger behavioural change than this defect warrants. It also
 * does not address P12 (the title staying static) — that is a separate ruling,
 * and the title is read here, never written.
 */
export function RouteAnnouncer() {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef<{ pathname: string; title: string } | null>(null);

  useEffect(() => {
    const title = document.title;
    const seen = previous.current;
    previous.current = { pathname, title };

    // First render: a screen reader announces the document it has just loaded
    // itself, which is the same reason the framework's announcer skips it.
    if (seen === null || seen.pathname === pathname) return;
    // See the docblock: the framework owns both of these cases already.
    if (title === '' || seen.title !== title) return;

    const heading = document.querySelector('main h1, h1');
    // `textContent`, not `innerText`: `innerText` is layout-dependent and answers
    // `''` for anything not currently rendered, which would make the announcement
    // depend on whether the heading happened to be visible.
    const name = (heading?.textContent ?? '').trim() || title;
    if (name !== '') setAnnouncement(name);
  }, [pathname]);

  return (
    <div
      /*
        `role="status"` (polite), not the `role="alert"` the framework's announcer
        uses. Every `role="alert"` in this product is a refusal or a failure — the
        server/transport/editor refusal panels, the board, every dialog — and a
        route change announced through the same channel would be indistinguishable
        from one of those to the person hearing it.
      */
      role="status"
      aria-atomic="true"
      /*
        Visually hidden, inline. The product has no `sr-only` utility class to
        reuse (checked: no clip-based utility in `ui.css` or `globals.css`), and
        this is the same recipe react-aria's own hidden elements carry. Rendered
        on EVERY page, empty, so the region is in the accessibility tree before
        the change it has to announce — a region that mounts together with its
        text is not reliably spoken.
      */
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        margin: -1,
        padding: 0,
        border: 0,
        overflow: 'hidden',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
      }}
    >
      {announcement}
    </div>
  );
}
