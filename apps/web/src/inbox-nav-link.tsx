'use client';

import Link from 'next/link';
import { NavPending } from './nav-pending.js';
import { useEffect, useState } from 'react';
import { useAppServices, useSessionStatus } from './providers.js';

/** The plan's cadence: "the badge and the list update within a minute". */
export const REFRESH_MS = 60_000;

/**
 * The inbox's entry point in the nav, carrying the unread count.
 *
 * ## The poll is gated on a session, and that is not an optimisation
 *
 * `AppNav` renders on `/sign-in`'s siblings and on every page a signed-out
 * viewer can reach. An ungated interval there fires `GET
 * /v1/me/notifications/unread-count` every sixty seconds for as long as the tab
 * is open, and every one of them is a 401 — a request that cannot succeed,
 * repeated forever, in the browser of someone who is not signed in.
 *
 * The gate is `useSessionStatus`, and the reason is NOT that `useCurrentUser`
 * would misbehave — that was CHECKED rather than assumed, and the first draft of
 * this docblock claimed it and was wrong. Swapping this file to
 * `useCurrentUser() !== null` leaves all six cases green: both hooks answer "not
 * signed in" during the load window and both flip when the session lands, so the
 * derived boolean moves identically and the effect re-runs either way. It is
 * `useSessionStatus` because this component's question is specifically
 * `kind === 'signed-in'` and those three states are named rather than collapsed
 * — the same choice the project page makes, where the difference IS load-bearing
 * because it gates a WRITE. The load window is pinned as its own case (11.154),
 * so the equivalence stays a measured fact rather than a hope.
 *
 * ## What the indicator does when a REFRESH fails, and why that is not zero
 *
 * `unread` starts at 0 and nothing renders at 0, so before the first answer
 * there is no dot — an absence, which claims nothing. After an answer, a FAILED
 * refresh leaves the last count standing rather than resetting it: "you have 3
 * unread" that is a minute stale is a smaller error than "you have none"
 * asserted from a request that failed.
 *
 * Round 24 turned the visible count into a dot and moved the number into the
 * accessible name. ⚠ CORRECTED 2026-09-21 (E2-25): this read "`UnreadBadge` is
 * untouched and still carries the count on `/inbox` itself", and that is false
 * on both halves — `UnreadBadge` is mounted NOWHERE (`apps/web/app/inbox/page.tsx`
 * renders no count and no badge; measured across `apps/` and `packages/`, the
 * component has zero production renders), so there is no screen that shows a
 * numbered unread badge. This paragraph's promise is unchanged by that — it is
 * about the VALUE of `unread`, not about how it is drawn.
 *
 * That promise is about a failed REFRESH and nothing else, and the wording is
 * narrow on purpose. It does NOT extend across a session ending: a count that
 * outlives the session it was read for is not a stale honest value, it is the
 * previous viewer's. The `!signedIn` arm below clears it, and 11.169 is the case
 * that would catch its removal. The first version of this file had the early
 * return without the clear and this paragraph promising "its last honest value"
 * — the prose was the part that was wrong. Nothing here surfaces the
 * error, deliberately — a nav that grew a refusal panel would put a network
 * complaint on every page in the product, and the inbox page itself says the
 * true thing when it is opened.
 *
 * ## `cancelled` guards the state write, and `clearInterval` the timer
 *
 * Both are needed and neither substitutes for the other: an in-flight request
 * resolving after unmount would set state on a dead component, and a live
 * interval would keep firing after the nav is gone.
 */
export function InboxNavLink({ active = false }: { active?: boolean } = {}) {
  const unread = useInboxUnread();

  return (
    <Link
      href="/inbox"
      className="gn-nav__inbox"
      aria-current={active ? 'page' : undefined}
      /* THE COUNT DID NOT GO AWAY — it moved into the accessible name (Round 24,
         owner ruling: "dot visually, count in the accessible name").

         The visible signal is now a dot, and a dot can only say "some". If the
         accessible name were also just "Inbox", this change would have deleted
         the unread count from the product's chrome for exactly the people least
         able to go looking for it, which is a downgrade wearing a restyle's
         clothes. It would also leave the unread state signalled by COLOUR ALONE
         (WCAG 1.4.1); the name is what keeps that honest.

         At zero the name is a bare "Inbox" and no dot renders: an absence, which
         claims nothing, exactly as `UnreadBadge` returning null did. */
      aria-label={
        unread > 0
          ? `Inbox, ${unread} unread notification${unread === 1 ? '' : 's'}`
          : 'Inbox'
      }
    >
      <NavPending><InboxIcon /></NavPending>
      {unread > 0 ? <span className="gn-nav__inbox-dot" aria-hidden="true" /> : null}
    </Link>
  );
}

/**
 * Inline rather than from an icon package: this repo ships no icon dependency,
 * and adding one for a single glyph would put a package in the bundle of every
 * page in the product. `aria-hidden` because the link's own `aria-label` is the
 * accessible name — an unlabelled `<svg>` here would be announced as a second,
 * nameless thing inside the link.
 */
/**
 * The unread count, polled once a minute while a session exists — the effect `InboxNavLink`'s own
 * docblock above is about, extracted unchanged so the phone bottom bar's Inbox slot
 * (`bottom-bar.tsx`, mobile-web Task 3) shows the same number from the same rule. Every sentence of
 * that docblock about gating on the session, a failed refresh keeping the last count, and the count
 * not outliving its session describes THIS hook. At ≤40rem the bar replaces the corner link rather
 * than joining it (`AppNav` renders one or the other), so the two never poll together.
 */
export function useInboxUnread(): number {
  const { notifications } = useAppServices();
  const session = useSessionStatus();
  const signedIn = session.kind === 'signed-in';
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!signedIn) {
      // NOT just an early return, and the difference is a sentence on screen.
      // A session can end IN PLACE — a cookie expiring while the tab sits open —
      // and this component stays mounted through it. Without this line the nav
      // keeps rendering the PREVIOUS session's count to whoever is looking now,
      // which is a stranger's unread total in someone else's chrome. The Sign
      // out button hides the bug rather than avoiding it: it navigates, so the
      // nav unmounts and the count goes with it. Witnessed at 11.169, which is
      // the signed-in -> signed-out direction neither 11.153 (signed out from
      // mount) nor 11.154 (loading -> signed in) walks.
      setUnread(0);
      return;
    }
    let cancelled = false;

    async function refresh(): Promise<void> {
      try {
        const count = await notifications.unreadCount();
        if (!cancelled) setUnread(count);
      } catch {
        // Signed out mid-session, or offline: the badge keeps its last honest
        // value. See the docblock — a reset to 0 would be a claim.
      }
    }

    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [notifications, signedIn]);
  return unread;
}

function InboxIcon() {
  return (
    <svg
      className="gn-nav__inbox-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 13h4l1.5 3h5L16 13h4" />
      <path d="M5.5 5h13l1.5 8v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4z" />
    </svg>
  );
}
