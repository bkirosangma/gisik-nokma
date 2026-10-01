'use client';

import { createAuthClient } from 'better-auth/react';
import { magicLinkClient, phoneNumberClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';
import { noteRetryAfter } from './session-retry.js';

/**
 * The client half of the four passwordless methods, matched to the version the
 * SERVER pins rather than to the plan's text.
 *
 * ## One import moved, and it was measured rather than guessed
 *
 * `apps/server/package.json` pins `better-auth@^1.7.2` AND
 * `@better-auth/passkey@^1.7.2` — two packages, because in 1.7 the passkey
 * plugin lives outside core. The plan (written against better-auth 1.2) imports
 * all three client plugins from `better-auth/client/plugins`; at 1.7.2 that
 * module's export list carries `phoneNumberClient` and `magicLinkClient` and
 * does NOT carry `passkeyClient` (enumerated from
 * `node_modules/better-auth/dist/client/plugins/index.d.mts`: 0 occurrences).
 * `passkeyClient` is exported from `@better-auth/passkey/client`, which is the
 * client half of the very package `apps/server/src/auth/auth.ts:4` imports
 * `passkey` from. So the two halves are the same version of the same plugin.
 *
 * Per the plan's own caveat this is the ONLY file the version difference
 * changes; the flows and the copy in `app/sign-in/page.tsx` are untouched.
 *
 * Nothing in this module is proven by `test/sign-in.test.tsx` — that suite
 * replaces this module wholesale with a `vi.mock`, so it cannot fail on a
 * wrong member name. `typecheck` is what checks these names, because `tsc`
 * resolves the real packages: see the docblock on the sign-in test.
 */
export const authClient = createAuthClient({
  /**
   * Same-origin: `/api/auth/*` is proxied to the API server by `next.config.ts`,
   * so cookies stay first-party. The server-side branch is only reached during
   * pre-render, where `window` does not exist and no request is in flight.
   */
  baseURL: typeof window === 'undefined' ? 'http://localhost:3001' : window.location.origin,
  plugins: [phoneNumberClient(), magicLinkClient(), passkeyClient()],
  /**
   * A 429's `Retry-After` is on the response and nowhere on the error the
   * session hook hands back, so it is read here for the shell notice's backoff
   * (`session-retry.ts`, SYS-01).
   */
  fetchOptions: { onResponse: (context) => noteRetryAfter(context.response) },
});
