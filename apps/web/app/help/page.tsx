'use client';

import { HelpBrowser } from '@gisik-nokma/app-core';
import { AppNav } from '../../src/app-nav.js';
import { DocumentTitle } from '../../src/document-title.js';

/**
 * `/help` — the manual and FAQ, in the product.
 *
 * A client component because the browser has a search box with state, and the
 * whole page is one component from `app-core` so that this shell and the desktop
 * app cannot drift into two different help screens.
 *
 * No session is required to reach it. That is deliberate: the FAQ's answers to
 * "why can't I sign in" are worth least behind a sign-in.
 */
export default function HelpPage() {
  return (
    <main id="gn-main" className="gn-shell">
      <DocumentTitle title="Help" />
      <AppNav />
      <HelpBrowser />
    </main>
  );
}
