'use client';

import { useEffect } from 'react';
import { documentTitleFor } from './page-title.js';

/**
 * Sets the document's title for a CLIENT-rendered route — exec1 P12.
 *
 * Next's `export const metadata` is honoured in server components only, and 19
 * of this app's 23 routes are `'use client'`. A route that exports `metadata`
 * while being a client component is not an error Next reports: the export is
 * simply ignored, and the page keeps whatever the previous route left in
 * `document.title`. That is why this component exists and why the sweep in
 * `test/document-title.test.tsx` counts it.
 *
 * It renders nothing. It is a route's title and no part of its UI, so putting it
 * at the top of a page's returned tree is the whole usage:
 *
 * ```tsx
 * return (
 *   <>
 *     <DocumentTitle title="Inbox" />
 *     …
 *   </>
 * );
 * ```
 *
 * ## ⚠ MEASURED LIMIT: this is LOSING A RACE ON FIRST LOAD, and the trace is below
 *
 * Read this before putting it on a route whose title is known at build time.
 * It PASSES in jsdom — `test/document-title.test.tsx` mounts it and reads
 * `document.title` back — and **it does not take effect in a real browser on
 * first load.** Traced in Chrome against the built app on `/sign-in`, with a
 * forwarding `document.title` setter and a 20 ms poll of the real value:
 *
 * ```
 *   atMs  0   value ""                             ← no <title> yet, still loading
 *   atMs 21   set   "Sign in · Gisik Nokma"        ← THIS effect
 *   atMs 21   value "Sign in · Gisik Nokma"        ← it took
 *   atMs 42   value "Gisik Nokma"                  ← REACT PUT IT BACK
 * ```
 *
 * The 42 ms repair **does not go through the `title` setter** — React mutates
 * the `<title>` NODE while hydrating Next's `<head>`, repairing the text it
 * finds changed under it. So the tab, the window title and the history entry
 * kept reading the product name on every client route: the exact defect P12
 * exists to close. Reproduced on `/help` as well (`setter` at 127 ms,
 * `finalTitle` still `Gisik Nokma`).
 *
 * **Two fixes were tried against that trace and BOTH are measured failures**,
 * recorded so neither is re-attempted:
 *
 * 1. **`useSyncExternalStore` as a hydration gate** — `getServerSnapshot` →
 *    `false`, `getSnapshot` → `true`, so the write waits for hydration. It does
 *    not help: the write still landed at 21 ms, because React's head repair
 *    comes AFTER hydration of this subtree, so no hydration signal can precede
 *    it.
 * 2. **Returning `<title>` and letting React 19 hoist it** — produced THREE
 *    `<title>` elements in the hydrated document (`["Gisik Nokma", "Sign in ·
 *    Gisik Nokma", "Gisik Nokma"]`), React does not deduplicate them, and
 *    `document.title` read the FIRST, which is Next's. Strictly worse.
 *
 * **A write made once the page has settled survives indefinitely** — measured
 * on the same page: setting `document.title` 4 s after load left every
 * subsequent sample unchanged for 2 s. That is why this component is still the
 * right tool for a title that **cannot be known server-side**: the workspace and
 * project names arrive from a READ, so those writes land long after the repair.
 *
 * **For a title that IS known at build time, use a server `layout.tsx`
 * exporting `metadata` instead** — the shape `privacy`, `terms` and `mcp/tokens`
 * already use, which renders in the head before any JavaScript runs. `app/`'s
 * route layouts are swept for exactly this.
 *
 * ⚠ **What is NOT claimed anywhere: that the tab shows the right title on a
 * client route.** The browser reading above is the state of the world.
 */
export function DocumentTitle({ title }: { title: string }): null {
  useEffect(() => {
    document.title = documentTitleFor(title);
  }, [title]);
  return null;
}
