'use client';

import dynamic from 'next/dynamic';
import { AppNav } from '../../src/app-nav.js';
import { HelpLoading } from '../../src/skeletons/route-loading.js';

/**
 * The manual's text and its search load on this route only (smoothness T10; spec D6, S9): `HelpBrowser` comes from its own
 * `./help` subpath through `import()`, so no other route carries the manual, and this one paints its nav and a frame first.
 */
const HelpBrowser = dynamic(() => import('@gisik-nokma/app-core/help').then((module) => module.HelpBrowser), {
  loading: () => <HelpLoading />,
});

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
      <AppNav />
      <HelpBrowser />
    </main>
  );
}
