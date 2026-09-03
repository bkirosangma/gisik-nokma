'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { UnreadBadge } from '@gisik-nokma/app-core';
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
 * ## What the badge does when the read fails, and why it is not zero
 *
 * `unread` starts at 0 and `UnreadBadge` renders nothing at 0, so before the
 * first answer there is no badge — an absence, which claims nothing. After an
 * answer, a FAILED refresh leaves the last count standing rather than resetting
 * it: "you have 3 unread" that is a minute stale is a smaller error than "you
 * have none" asserted from a request that failed. Nothing here surfaces the
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
export function InboxNavLink() {
  const { notifications } = useAppServices();
  const session = useSessionStatus();
  const signedIn = session.kind === 'signed-in';
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
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

  return (
    <Link href="/inbox" className="gn-nav__inbox">
      Inbox <UnreadBadge count={unread} />
    </Link>
  );
}
