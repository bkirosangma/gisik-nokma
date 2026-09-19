import type { ReactNode } from 'react';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import '@gisik-nokma/ui/ui.css';
import '@gisik-nokma/editor/editor.css';
import './globals.css';
import { Providers } from '../src/providers.js';

export const metadata = { title: 'Gisik Nokma' };

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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
