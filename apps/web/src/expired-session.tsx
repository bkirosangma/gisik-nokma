'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The ONE author of "a 401 is not a refusal, it is a session that ended".
 *
 * ## Why this file exists at all
 *
 * `Features.md` and case 3.86 both said, unconditionally, that a 401 in this
 * shell redirects to `/sign-in` rather than rendering a refusal panel. Exactly
 * ONE of the three data-reading pages did it — `app/workspaces/page.tsx`, which
 * spelled the rule inline — so an expired session on `/w/<id>/my-work` or
 * `/w/<id>/p/<id>` drew *"My Work cannot be shown yet — HTTP 401 for
 * /v1/me/work"*: a panel telling a person their work "cannot be read", when the
 * true and actionable sentence is *sign in again*. A rule documented for three
 * surfaces and built on one is a false claim in prose, so the rule moved here
 * and all three pages call it.
 *
 * ## The predicate is a STRING MATCH, and here is exactly what it can and
 * ## cannot do
 *
 * The transport has the status as a number — `HttpError.status`
 * (`packages/app-core/src/online/http.ts:50`) — and this shell cannot see it.
 * Every read on these pages arrives through `useLiveQuery`, whose
 * `LiveQueryResult.error` is `string | null`: the hook stringifies the cause and
 * throws the class away. Widening that type would cascade through `board.tsx`,
 * `my-work.tsx`, `attention-strip.tsx`, `ticket-list.tsx` and `ticket-sheet.tsx`
 * — five view modules and their suites — which is a redesign, not this fix. So
 * the status is recovered from the message.
 *
 * It is recovered from a format `HttpError` OWNS and is the only producer of:
 * `HTTP ${status} for ${path}`, one line, that constructor. The match is
 * ANCHORED at the start for that reason. A looser `message.includes('401')` —
 * which is what `app/workspaces/page.tsx` used to carry — would also fire on a
 * `ServingGapError`, whose message concatenates every absence's prose and owner
 * and could contain those three digits in a URL, a route name or an
 * explanation; that check could pass for the wrong reason and could not be shown
 * to fail cleanly.
 *
 * What it CANNOT do, said plainly rather than left for the next reader to
 * discover: it cannot see a 401 that never became an `HttpError` (a gateway that
 * answers HTML, a fetch that rejects at the network layer), and it cannot tell
 * an expired session from a session the server never accepted. Both land as an
 * ordinary refusal panel, which is the safe direction — a wrong redirect throws
 * away whatever the reader had on screen.
 */
export const EXPIRED_SESSION_PREFIX = 'HTTP 401 ';

/** True when this message is the transport's own 401 and nothing else. */
export function isExpiredSession(message: string | null): boolean {
  return message !== null && message.startsWith(EXPIRED_SESSION_PREFIX);
}

/**
 * Redirect to `/sign-in` when any of these reads failed with a 401, and answer
 * whether that happened so the caller can suppress the refusal it would
 * otherwise render.
 *
 * The return value is the half that keeps the two claims from disagreeing. A
 * hook that only pushed would leave the page rendering *"cannot be shown yet"*
 * for the frame or two before the router moves — and under `next/navigation`'s
 * test double it never moves at all, so the panel would simply stay. The caller
 * gates on this, and case 3.141 asserts BOTH: the push happened AND no refusal
 * is on the page.
 */
export function useSignInOnExpiredSession(messages: ReadonlyArray<string | null>): boolean {
  const router = useRouter();
  const expired = messages.some(isExpiredSession);
  useEffect(() => {
    if (expired) router.push('/sign-in');
  }, [expired, router]);
  return expired;
}

/**
 * What the three pages put on screen for the frame between "this read came back
 * 401" and the router arriving at `/sign-in`.
 *
 * It exists because the alternative was `<p>Loading…</p>`. With the refusal
 * suppressed, every one of these pages falls through to its loading arm — a
 * spinner over a read that has already failed, which is the exact falsehood
 * `src/shell-refusal.tsx` was written to remove, wearing a different hat. This
 * says the true thing instead, and it says it once for all three.
 *
 * `role="status"` so it joins the same list the refusal panels are asserted as,
 * printed rather than counted.
 */
export const EXPIRED_SESSION_COPY = 'Your session has ended. Taking you to sign in…';

export function ExpiredSessionNotice() {
  return (
    <p role="status" className="gn-shell__expired">
      {EXPIRED_SESSION_COPY}
    </p>
  );
}
