'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  SESSION_EXPIRED_COPY,
  SessionExpiredError,
  type DataSource,
} from '@gisik-nokma/app-core';
import { clearReadCaches } from './clear-read-caches.js';

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
 * It also empties the read caches as it redirects (`clearReadCaches`, smoothness
 * T3, case 25.028): the session ended, and the next person on this device must not
 * be served what this one read.
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
  const pathname = usePathname();
  const expired = messages.some(isExpiredSession);
  useEffect(() => {
    if (!expired) return;
    // The session ended: what this device read for that person is not the next
    // person's to be served (smoothness T3, case 25.028).
    clearReadCaches();
    // E5-32: the destination is CARRIED, not dropped. This hook was the ONE
    // author of the 401 redirect and pushed a bare `/sign-in`, while
    // `docs/manual.md` promises the opposite in two places — *"it puts you back
    // on the page you were trying to reach"* and *"The same is true if you
    // click a link (an invitation, or a link to a job) while signed out: it
    // remembers where you were headed and sends you there afterwards."* The
    // invitation/consent/settings arms already kept theirs; now every one of the
    // hook's five callers does.
    //
    // The PATH comes from `usePathname` (which strips any query) and the QUERY
    // is read off `window` inside the effect rather than taken from
    // `useSearchParams`, deliberately: a hook that calls the latter puts every
    // caller behind a `Suspense` boundary, and this runs only in the browser, at
    // the moment the redirect is decided — exactly when the current URL is what
    // is wanted. `sign-in/page.tsx` constrains `next` to a path on this site, so
    // nothing here can widen it.
    router.push(signInWithNext(pathname + window.location.search));
  }, [expired, pathname, router]);
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
 *
 * **The string itself moved to `@gisik-nokma/app-core` (E5-25)** and this is a
 * re-export, not a second definition: the WRITE path paints the same sentence
 * from the package views, and two declarations of one sentence is a sentence
 * that drifts. Every reader of this module keeps the name it already imported.
 */
export const EXPIRED_SESSION_COPY = SESSION_EXPIRED_COPY;

export function ExpiredSessionNotice() {
  return (
    <p role="status" className="gn-shell__expired">
      {EXPIRED_SESSION_COPY}
    </p>
  );
}

/**
 * A `DataSource` that tells the shell when a WRITE found the session gone
 * (E5-25, round-2 ruling).
 *
 * ## Why the redirect is here rather than in each write's catch
 *
 * Nine write sites painted a 401 as *"We could not reach the server"*, and five
 * of them are `packages/app-core` views — which may not import `HttpError` at
 * all (`packages/app-core/test/no-http-in-views.test.ts`, case 3.35). Those views
 * now paint the right sentence, because the adapter that HAS the status
 * re-throws it as `SessionExpiredError`; but none of them has a router, and the
 * sentence says *"Taking you to sign in…"*.
 *
 * This is the other half: the shell wraps the ONE `DataSource` it hands to every
 * page, so any write that ends in a 401 — a board move, a close, a bulk close, a
 * sheet change, a settings save, a delete's Undo, a backlog start or re-rank —
 * pushes `/sign-in` once. It is deliberately not per-site: a tenth write site
 * added tomorrow would otherwise need a tenth copy of this, and the site that
 * forgot would be silent in the direction nobody audits.
 *
 * The failure is RE-THROWN unchanged. This wrapper's jobs are the redirect and,
 * just before it, emptying the read caches (`clearReadCaches`: a session that
 * ended is a person who may be replaced, smoothness T3, case 25.028); the
 * sentence is the view's, and swallowing the throw here would leave a view
 * rendering a success it never had.
 */
/**
 * The `/sign-in` URL that remembers where the person was (E5-32).
 *
 * One builder for the read hook and the write guard, so the two cannot drift
 * about what a remembered destination looks like — and `sign-in/page.tsx`'s
 * guard is the only thing that has to accept it.
 */
export function signInWithNext(pathAndSearch: string): string {
  return `/sign-in?next=${encodeURIComponent(pathAndSearch)}`;
}

export function withSignInOnExpiredWrite(source: DataSource, onExpired: () => void): DataSource {
  return {
    ...source,
    async ingest(events) {
      try {
        return await source.ingest(events);
      } catch (cause) {
        if (cause instanceof SessionExpiredError) {
          // Before the redirect: the cache is emptied whether or not the router
          // gets there (smoothness T3, case 25.028).
          clearReadCaches();
          onExpired();
        }
        throw cause;
      }
    },
  };
}
