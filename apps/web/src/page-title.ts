/**
 * The product's document titles, in ONE place — exec1 P12.
 *
 * ## The defect
 *
 * `app/layout.tsx` set `{ title: 'Gisik Nokma' }` and NOTHING set a per-route
 * title, so `/sign-in`, `/inbox`, `/help`, a board, a ticket sheet, `/settings`,
 * `/privacy`, `/terms` and the 404 all carried the same string. WCAG 2.2 §2.4.2
 * *Page Titled* is Level A, and its Understanding document is explicit about
 * this shape of application: *"for web applications (single page applications)
 * where the view changes dynamically, the title should also be changed
 * dynamically to reflect the content or topic of the current view."* Gisik Nokma
 * is exactly that — an SPA whose view changes and whose title never did.
 *
 * ## Why the suffix lives here and not in `layout.tsx`'s `metadata`
 *
 * Next's own idiom is `title: { template: '%s | Gisik Nokma' }` in the root
 * layout, with each route exporting `metadata.title = 'Privacy'`. **That
 * mechanism reaches SERVER components only**, and 19 of this app's 23 routes are
 * `'use client'`, where a `metadata` export is ignored without a word — the
 * quietest possible failure for a check that is supposed to be about silence.
 * So client routes use `<DocumentTitle>` (the sibling of this module) and server
 * routes use `metadata`, and **both read the format from `documentTitleFor`
 * here**, which is the point of this file existing: one source for the string,
 * so the two mechanisms cannot disagree about what a title looks like.
 *
 * ⚠ **This module carries NO `'use client'` directive, deliberately.** It is
 * imported by `layout.tsx`-side server code and by client components alike, and
 * a directive here would make every export a client reference — the helper would
 * stop being a plain function on the server. It must stay React-free for the same
 * reason `packages/ui/tokens` does (see `layout.tsx`'s own note on that).
 */

/** The product's name, and the tail of every title this app sets. */
export const APP_NAME = 'Gisik Nokma';

/**
 * `'Privacy'` → `'Privacy | Gisik Nokma'`.
 *
 * Idempotent on the product name itself: a route whose topic IS the product
 * (`/workspaces`, say) must not read `Gisik Nokma | Gisik Nokma`. Returning the
 * name unchanged is the honest answer there — the topic and the product are the
 * same thing — rather than a doubled suffix nobody meant.
 *
 * A blank or whitespace-only topic is treated as NO topic and answers the
 * product name, because `' | Gisik Nokma'` is a title that begins with a
 * separator. Nothing in the product passes one; the guard is here so that the
 * failure is a sensible title rather than a leading glyph.
 */
export function documentTitleFor(topic: string): string {
  const trimmed = topic.trim();
  if (trimmed === '' || trimmed === APP_NAME) return APP_NAME;
  return `${trimmed} | ${APP_NAME}`;
}
