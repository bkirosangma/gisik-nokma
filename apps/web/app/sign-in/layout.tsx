import type { ReactNode } from 'react';
import { documentTitleFor } from '../../src/page-title.js';

/**
 * exec1 P12, and the SECOND time this route's title was built.
 *
 * `app/sign-in/page.tsx` is `'use client'`, so it cannot export Next's
 * `metadata` — the export would be silently ignored. The first version of this
 * fix therefore put a `<DocumentTitle>` in the page, whose effect writes
 * `document.title`.
 *
 * **That effect loses a race with React's head hydration, measured in Chrome**
 * (see `src/document-title.tsx` for the trace: the effect writes at 21 ms, React
 * repairs the `<title>` node at 42 ms, and the repair does not go through the
 * title setter). The tab kept reading `Gisik Nokma` on every client route.
 *
 * A route SEGMENT layout is a SERVER component even when the page beneath it is
 * not, so `metadata` IS honoured here — and the title is rendered into the head
 * by the server, **before any JavaScript runs**. That is strictly better than
 * the effect it replaces: no race, no hydration dependency, and a reader with
 * JavaScript disabled or still loading gets the title too, which is what WCAG
 * 2.2 §2.4.2 (Level A) actually asks for.
 *
 * The layout renders its children unchanged — it exists for the `metadata`
 * export, and adding any wrapper element here would move the page's own
 * `<main>` one level deeper for no reason.
 */
export const metadata = { title: documentTitleFor('Sign in') };

export default function SignInLayout({ children }: { children: ReactNode }): ReactNode {
  return children;
}
