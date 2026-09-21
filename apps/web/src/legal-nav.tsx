'use client';

import Link from 'next/link';
import { AccountMenu } from './account-menu.js';
import { InboxNavLink } from './inbox-nav-link.js';
import { useCurrentUser } from './providers.js';

/**
 * The bar the refreshed export draws on the two legal routes — `desktop.dc.html`
 * `isLegal`, `:1722-1729` — transcribed as the export's own RULE rather than
 * only its picture.
 *
 * ## What the export draws, and the LINE that decided `BackButton`'s fate
 *
 * `:1722-1729` is a `<div>` with `background:var(--navBg)` and
 * `box-shadow:var(--navShadow)` holding exactly three things: a 30px rounded
 * brand tile carrying a folder glyph, the `Gisik Nokma` wordmark as a `<span>`,
 * and a `Sign in` `<a>`. **There is no back affordance anywhere in the block,
 * and that absence is the whole reason this component replaces `BackButton`**
 * on these two routes rather than sitting beside it — the dispatch made the
 * replacement conditional on exactly that, and `:1720-1755` contains no
 * history-back control of any kind.
 *
 * The escape the reader had is not lost, and it is worth saying why rather than
 * assuming it. The removed `BackButton`'s fallback destination — the branch for
 * a reader with no history, i.e. anyone who opened `/terms` in a new tab — was
 * `/sign-in`, and it was `/sign-in` because these pages are reached from the
 * sign-in card's legal line, so the route the reader came from is the route
 * back. (That control left in Step 2c-2, `17c8345c`, with the component; the
 * REASONING is kept because the destination still has to be a real one, and this
 * paragraph no longer resolves to a docblock that no longer exists.) The `Sign in`
 * link below points at the same route, so the reader with no history still has
 * a real destination, and the reader WITH history has the browser's own chrome
 * that the export leaves them. What genuinely changes is that the product no
 * longer offers a one-press return: stated here because it is a loss, and the
 * accessible-names ratchet is the instrument that would otherwise have been
 * silent about it (see `legal-chrome.tsx`'s note on the label this bar's
 * replacement carries instead).
 *
 * ## Sign in when anonymous; the product's own corner when not
 *
 * The right-hand side is branched, and the branch is the dispatch's instruction
 * read literally: the export's `Sign in` link is drawn for a signed-OUT reader
 * (the export's legal screens are pre-auth, like these), and a signed-in reader
 * gets **the product's nav convention rather than a second one**. That is why
 * this file renders `InboxNavLink` + `AccountMenu` — the exact pair
 * `app-nav.tsx` renders in `.gn-nav__corner` (Round 24) — and adds no
 * destination link of its own. There is deliberately no `Workspaces`/`Help`/
 * `Account` group here: the export does not draw one on this screen, and
 * inventing one would be the "second nav" the instruction forbids.
 *
 * `AccountMenu` returns `null` when signed out (`account-menu.tsx:128`) and
 * `InboxNavLink` gates its own read on a session, so the signed-in branch is
 * rendered only where it can produce something — but the branch is on
 * `user === null` rather than on those components' internals, because a
 * signed-out reader must get the export's `Sign in` link, not an empty corner.
 *
 * ## The chrome is `.gn-nav`, not a new bar
 *
 * Class names are the product's own, so this bar inherits the sticky/floating
 * behaviour, the `--gn-surface` background, the 80rem inner measure that lines
 * it up with `.gn-shell` beneath it, and — the part that would otherwise be
 * missed — `.gn-nav a`'s 2.75rem minimum in BOTH dimensions. That rule is what
 * keeps `Sign in` inside the viewport suite's tap-target floor; a bespoke bar
 * would have had to restate it and could have restated it wrong.
 */
export function LegalNav() {
  const user = useCurrentUser();

  return (
    <nav
      className="gn-nav"
      /* exec1 P31: unnamed, while the TOC below it IS labelled — so
         `/privacy` and `/terms` offered two `navigation` landmarks and only one
         of them said what it was. "Legal" is the reviewer's own word for this
         bar and it is the house's: this component is `LegalNav`, its class
         family is `.gn-legal*`, and the two routes it serves are the legal
         pages. It is what tells a reader which of the two landmarks they are
         in. */
      aria-label="Legal"
    >
      <div className="gn-nav__inner">
        {/* Both halves are `<span>`s, matching the export (`:1723` tile, `:1726` wordmark): it
            draws neither as a link. That is also what keeps this bar from
            adding a destination the product has not decided on — `/` redirects
            to `/workspaces`, which bounces a signed-out reader straight back to
            `/sign-in`, so a wordmark link here would be a third route to the
            page they are already on. */}
        <span className="gn-nav__brand">
          <span className="gn-nav__brand-tile" aria-hidden="true">
            {/* The export's glyph, paths verbatim (`:1724`). */}
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" />
            </svg>
          </span>
          <span className="gn-nav__wordmark">Gisik Nokma</span>
        </span>
        <span className="gn-nav__spacer" />
        {user === null ? (
          <Link className="gn-nav__signin" href="/sign-in">
            Sign in
          </Link>
        ) : (
          <div className="gn-nav__corner">
            <InboxNavLink active={false} />
            <AccountMenu />
          </div>
        )}
      </div>
    </nav>
  );
}
