import type { SessionsClient, SessionSummary } from '@gisik-nokma/app-core';
import { authClient } from '../auth-client.js';

/**
 * `authClient.listSessions`/`authClient.revokeSession` — better-auth's core
 * session routes, present without any extra plugin (confirmed in the
 * installed `better-auth@1.7.2` package: `dist/api/routes/session.mjs`
 * declares `listSessions`/`revokeSession` unconditionally, and the client's
 * `PathToObject`/`CamelCase` machinery, `dist/client/path-to-object.d.mts`,
 * maps their server paths `/list-sessions`/`/revoke-session` to exactly
 * these two camelCase client method names — there is no separate
 * `client/index.d.mts` listing to grep for the plan's own check to find,
 * because base-client methods are generated from the server's endpoint map
 * rather than hand-declared).
 *
 * Two things the plan's assumed shape got wrong, found by reading the
 * installed `.d.mts` rather than trusting the assumption:
 *
 * 1. `listSessions()`'s resolved `data` array items type `createdAt`/
 *    `updatedAt`/`expiresAt` as `Date`, not `string` — the server handler's
 *    own return type flows through to the client type unchanged, and
 *    better-auth's fetch client revives ISO date strings back into real
 *    `Date` instances on the way in (`dist/client/parser.mjs`,
 *    `parseDates: true` by default). `SessionSummary.createdAt`/`updatedAt`
 *    are `string` (this package's own abstract type, matching what
 *    `SessionsSection` hands to `formatDateTime` for display), so `list()`
 *    below calls `.toISOString()` on each. `apps/web/test/account-page.test.tsx`'s
 *    mock of this module constructs real `Date` instances for these fields
 *    for exactly this reason — a mock built from a STRING literal would stop
 *    this conversion from ever running against the shape it actually exists
 *    to convert, the same gap a `Date | string`-accepting version of this
 *    conversion would have left standing on the untested branch.
 * 2. The current session's own token is `authClient.useSession().data
 *    .session.token` (verified against `getSession`'s declared return type,
 *    `{ session: Session, user: User } | null`) — passed into
 *    `createSessionsClient` by the caller (`apps/web/app/account/page.tsx`)
 *    rather than read in here, so this module stays about the two session
 *    routes only.
 */

/**
 * Device labels never fabricate specificity: two INDEPENDENT lookups (OS,
 * then browser), never one ordered regex per combination. **A real defect,
 * found and fixed after this file shipped:** the first version matched
 * `/Chrome.*Mac/i` — browser token BEFORE the OS token — which is backwards
 * from every real user-agent string, where the OS/device segment comes
 * first and the browser tokens come last (`Mozilla/5.0 (Macintosh; Intel
 * Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0
 * Safari/537.36`). The only reason any test passed was a hand-abbreviated
 * fixture (`'Mozilla/5.0 Chrome Mac'`) with the tokens in the wrong-but-
 * matching order; against 8 realistic real-world UA strings (real Chrome/
 * Safari/Firefox × Mac/Windows/Android/iPhone/iPad) the old code answered
 * "Unknown device" for all eight — the feature did not do the one thing it
 * exists to do. `apps/web/test/account-clients.test.ts` now drives this
 * function with full, realistic UA strings rather than abbreviated ones, so
 * a token-order regression like this one fails a test again.
 *
 * `browserOf` checks Edge and Safari-without-Chrome LAST-to-first in the
 * sense that both Edge and ordinary Chrome-on-desktop Safari UAs also carry
 * a `Safari/` token (inherited WebKit boilerplate), so a bare `Safari/` test
 * would misname a Chrome or Edge session; Edge is checked before Chrome for
 * the same reason (an Edge UA also carries `Chrome/`). Anything neither
 * lookup can name — including a missing `userAgent`, which better-auth's
 * own type allows (`ipAddress?`/`userAgent?: string | null | undefined`) —
 * falls back to "Unknown device" rather than inventing a browser or OS this
 * adapter cannot actually name.
 */
function osOf(userAgent: string): string | null {
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Mac OS X|Macintosh/.test(userAgent)) return 'Mac';
  if (/Windows/.test(userAgent)) return 'Windows';
  return null;
}

function browserOf(userAgent: string): string | null {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/Chrome\//.test(userAgent)) return 'Chrome';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Safari\//.test(userAgent) && !/Chrome/.test(userAgent)) return 'Safari';
  return null;
}

function deviceLabelOf(userAgent: string | null | undefined): string {
  if (userAgent === null || userAgent === undefined) return 'Unknown device';
  const os = osOf(userAgent);
  const browser = browserOf(userAgent);
  if (os === null || browser === null) return 'Unknown device';
  return `${browser} on ${os}`;
}

export function createSessionsClient(currentToken: string | null): SessionsClient {
  return {
    async list(): Promise<SessionSummary[]> {
      const result = await authClient.listSessions();
      return (result.data ?? []).map((session) => ({
        token: session.token,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        deviceLabel: deviceLabelOf(session.userAgent),
        isCurrent: session.token === currentToken,
      }));
    },
    async revoke(token: string) {
      // A refused revoke's `error` is read here and discarded by the caller
      // (`apps/web/app/account/page.tsx`'s `revokeSession`) — unlike
      // `ProfileSection`'s save refusal, nothing on screen tells a caller a
      // "Sign out" click was refused; the list simply fails to shrink.
      // Disclosed as a named absence in `Features.md`'s bullet rather than
      // silently decided; a `role="alert"` treatment matching Profile's own
      // is a small addition if a reviewer wants it.
      const result = await authClient.revokeSession({ token });
      return { error: result.error?.message ?? null };
    },
  };
}
