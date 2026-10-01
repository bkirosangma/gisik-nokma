import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import '@gisik-nokma/ui/ui.css';
import '@gisik-nokma/editor/editor.css';
import './globals.css';
import { Providers } from '../src/providers.js';
import { SkipLink } from '../src/skip-link.js';
import { RouteAnnouncer } from '../src/route-announcer.js';

export const metadata = { title: 'Gisik Nokma', icons: { icon: '/favicon.svg' } };

/**
 * The phone layer's two opt-ins (mobile-web plan Task 1, FD9, case 21.002).
 *
 * `viewportFit: 'cover'` is what makes `env(safe-area-inset-*)` non-zero on iOS:
 * without it the browser letterboxes the page inside the safe area and every
 * `env()` the bottom bar reads resolves to 0, so the bar would sit under the
 * home indicator the day a device has one. `interactiveWidget:
 * 'resizes-content'` makes the on-screen keyboard shrink the layout viewport
 * (Chrome/Android), so a fixed bottom element rides above it instead of being
 * painted over the field being typed in. `width`/`initialScale` are what every
 * page already got from Next's default and are spelled out so this export
 * REPLACES that default without losing it.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

/**
 * `@gisik-nokma/ui/tokens`, not `@gisik-nokma/ui`.
 *
 * This layout is a SERVER component, and the package root is a barrel: reaching
 * it drags `Dialog` and `Sheet` — both of which call `useEffect` — into a
 * server module graph, and `next build` refuses the whole app with "You're
 * importing a component that needs `useEffect`". `tokens.ts` imports nothing
 * from React (it is strings and a stylesheet-generator), so the subpath added
 * to `packages/ui/package.json` for this import gives a server context the
 * colours without the components. The alternative — `'use client'` at the root
 * layout — would make the entire tree a client tree to fetch one string.
 */

/** Applies a stored explicit theme before first paint — no flash, and the
 * OS-preference default (from themeStylesheet) still wins when unset. */
const themeInitScript =
  "try{var stored=localStorage.getItem('gn-theme');if(stored==='light'||stored==='dark'){document.documentElement.dataset.theme=stored;}}catch(error){}";

/**
 * Applies the stored style, or `neo` (the default, case 13.345) before first
 * paint — parallel to `themeInitScript`, but style has no "unset" state: `hig`
 * is only ever reached by an explicit stored choice, never by an absent one.
 */
const styleInitScript =
  "try{var stored=localStorage.getItem('gn-style');document.documentElement.dataset.style=(stored==='hig'||stored==='minimal'||stored==='neo')?stored:'neo';}catch(error){document.documentElement.dataset.style='neo';}";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: styleInitScript }} />
        <style dangerouslySetInnerHTML={{ __html: themeStylesheet() }} />
      </head>
      <body>
        {/* exec1 P13 — the FIRST focusable element on every route, which is what
            makes it a skip control rather than one more thing to Tab past. It
            must stay before `<Providers>` and outside it: rendering it inside
            the app tree would put it after whatever that tree draws first.
            The target `#gn-main` is carried by each route's own `<main>` and is
            swept in `test/skip-link.test.tsx`, so a route added without one
            reddens instead of shipping a dead anchor. */}
        <SkipLink />
        {/*
          P18 — outside `Providers` deliberately. It reads the route and the
          document, and nothing from the app's service seam; mounting it here
          means a route change is announced on every page in the product,
          including the pages that render no shell.
        */}
        <RouteAnnouncer />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
