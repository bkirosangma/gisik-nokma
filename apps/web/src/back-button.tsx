'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@gisik-nokma/ui';

/**
 * The way back off a page a reader arrived at from somewhere else.
 *
 * WHY `history.length > 1` AND NOT `router.back()` ALONE. `back()` on the first
 * entry of a fresh history does nothing at all — no navigation, no error, no
 * feedback — which is exactly what happens when somebody opens `/terms` in a new
 * tab from a link, or lands on it from a search engine. A control that silently
 * does nothing is worse than no control: the reader presses it, sees the same
 * page, and concludes the product is broken. So the fallback is a real
 * destination rather than a no-op.
 *
 * `/sign-in` is the fallback because these two pages are reachable from exactly
 * one place inside the product — the legal line under the sign-in card
 * (`app/sign-in/page.tsx`) — so it is where a reader with no history was most
 * likely headed. It is also the only route a signed-out reader can definitely
 * use; `/workspaces` would bounce them straight back to sign-in with a `next`.
 *
 * WHY THE `aria-label` IS LONGER THAN THE VISIBLE TEXT. "Back" alone is the
 * right visible word — a screen reader user hearing it out of context is not
 * told back *where*. WCAG 2.5.3 (Label in Name) requires the visible label to be
 * CONTAINED in the accessible name, and "Back to the previous page" starts with
 * "Back", so voice control ("click Back") still matches.
 *
 * `typeof window` is guarded because this file is imported by two server
 * components; the guard is what makes the click handler safe to reason about
 * rather than merely safe in practice.
 */
export function BackButton() {
  const router = useRouter();
  return (
    <Button
      className="gn-legal__back"
      aria-label="Back to the previous page"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) router.back();
        else router.push('/sign-in');
      }}
    >
      Back
    </Button>
  );
}
