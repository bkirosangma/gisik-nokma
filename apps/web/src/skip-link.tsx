/**
 * "Skip to content" — exec1 P13.
 *
 * ## The defect, and the careful part of the finding
 *
 * Nothing in the product let a keyboard user past the chrome. The reviewer's
 * sweep — `grep -rniE 'skip[ -]?(to|link)|gn-skip'` over `apps/web/app`,
 * `apps/web/src`, `packages/app-core/src` and `packages/ui/src` — returned ZERO
 * lines, while the same sweep with the needle `aria-label` returned 166, so the
 * instrument traverses. A keyboard-only user Tabbed the whole nav on every
 * navigation.
 *
 * **The lane WITHDREW the WCAG 2.4.1 *Bypass Blocks* citation, and that
 * withdrawal is honoured here**: landmarks satisfy that criterion, so this is
 * NOT argued from a criterion the product already meets. It is filed MINOR and
 * argued from the thing that was measured — a person pressing Tab.
 *
 * ## Why it lives in `layout.tsx` and why it needs an id
 *
 * `layout.tsx` is the only place that renders before every page's own chrome, so
 * a control put there is the document's first focusable element on every route.
 * Rendering it inside `AppNav` would put it after the bar it exists to skip.
 *
 * A same-page link needs a target, and the `<main>` belongs to each PAGE rather
 * than to the layout — so every route's rendering `<main>` carries
 * `id="gn-main"`, swept in `test/skip-link.test.tsx` so the next route added
 * without one reddens rather than quietly shipping a dead anchor.
 *
 * ⚠ **A dead anchor is the failure mode this shape invites**: `href="#gn-main"`
 * with no such element navigates nowhere and announces a control that does
 * nothing. The sweep is what holds the other half.
 *
 * ## No `'use client'`, on purpose
 *
 * This is an anchor and nothing else — no state, no effect, no handler — so it
 * renders identically on the server and needs no client boundary. A directive
 * here would push the app's whole shell tree client-side for one `<a>`.
 */

/** The `id` every route's rendering `<main>` carries, and the skip link's target. */
export const SKIP_TARGET_ID = 'gn-main';

export function SkipLink(): React.JSX.Element {
  return (
    /* Visually hidden until focused (`.gn-skip` in `globals.css`). Hidden by
       clipping rather than `display: none`, which would remove it from the tab
       order and leave nothing to reach. */
    <a className="gn-skip" href={`#${SKIP_TARGET_ID}`}>
      Skip to content
    </a>
  );
}
