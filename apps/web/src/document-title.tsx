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
 * ## What this costs, stated rather than implied
 *
 * The title is set in an effect, so it lands AFTER the route's first paint; a
 * reader watching the tab during a client-side navigation sees the previous
 * route's title for a frame. Next's `metadata` has no such gap, which is why the
 * four server routes use it instead. For the client routes there is no cheaper
 * mechanism that keeps `'use client'` — a server wrapper per route would be 19
 * new files to fetch one string.
 *
 * The effect runs on `title` alone, so a route whose topic resolves late (a
 * workspace name off a read) sets the generic title first and the named one when
 * it arrives, rather than never. There is no cleanup: the next route's title
 * replaces this one, and reverting on unmount would blank the tab mid-navigation.
 */
export function DocumentTitle({ title }: { title: string }): null {
  useEffect(() => {
    document.title = documentTitleFor(title);
  }, [title]);
  return null;
}
