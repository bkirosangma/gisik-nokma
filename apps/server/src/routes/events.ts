import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { ClientIngest } from '../ingest/ingest-service.js';

export const MAX_BATCH_SIZE = 100;

/**
 * Batch ingest. HTTP errors mean "this was not a batch" (schema refusal);
 * per-event results mean "this batch was heard" — envelope errors and rule
 * refusals ride inside results, index-aligned with the request array.
 *
 * This is the CLIENT-SUBMITTED door, which is why it calls `ingestClientBatch`
 * and not `ingestBatch`. Everything arriving here is a stranger's claim, so it
 * goes through the permission gate; the server's own appends use `ingestBatch`
 * directly and are not gated. Switching this call back to `ingestBatch` would
 * silently reopen the envelope-origin forgery — a client wearing
 * `origin: 'server'` to walk past `contest.server-only` — and would now also
 * ungate every role and membership check. It no longer compiles, which is the
 * better guard: `ingestBatch` is not on `ClientIngest`, and `ingestClientBatch`
 * cannot be called without a session.
 *
 * ## `requireSession`, and the identity it supplies
 *
 * `request.currentUserId` is the whole reason the gate can ask "is this actor
 * the person submitting?". Task 2 built the preHandler; Task 5 is where the
 * dependency lands, because without it `ingestClientBatch` has no caller that
 * can supply its second argument and the role gate is unreachable code.
 * The rule stated in `../auth/require-session.ts` — *a route that reads
 * `currentUserId` registers `requireSession`* — is discharged here by taking
 * the preHandler as a PARAMETER rather than reading it off a module: the route
 * cannot be assembled without one.
 *
 * ## HTTP-Origin on this route: YES, since Plan 11 Task 2 — and this section
 * used to say the opposite
 *
 * **"HTTP-Origin" here is the browser `Origin` HEADER — CSRF. It is unrelated
 * to `EventEnvelope.origin`, the provenance enum the ingest gate reads
 * (directly above).** The two meet on this route and nowhere else; conflating
 * them is how someone writes a header check and believes the envelope forgery
 * window is closed.
 *
 * better-auth's `originCheckMiddleware` binds `/api/auth/*` and nothing else:
 * `validateOrigin` returns immediately when there is no `ctx.request`, and
 * `makeRequireSession` calls `auth.api.getSession({ headers })` — a direct API
 * call with no request object. So a cookie-authenticated `POST /v1/events` with
 * a forged `Origin` reached this handler and answered **200**, and it always
 * had. Task 5 recorded that, declined the fix as out of its scope, and named
 * *"Plan 11's deployment hardening"* as an owner. **This is that owner
 * arriving.** `app.ts` now registers the check; `http/http-origin.ts` carries
 * the rule, the ruling it discharges, and the routes it covers.
 *
 * **What CHANGED THE ANSWER, and it is a fact rather than a preference.** The
 * declined version rested on one argument: *"a cross-site browser POST never
 * carries the cookie in the first place — `SameSite=Lax` withholds it."* That
 * is false for this deployment, and the CSRF ruling (2026-08-31) calls it the
 * most certain of its three findings. The product is `pm.artsourced.in` and
 * this API is `pm-api.artsourced.in`: two sibling subdomains of one registrable
 * domain, `artsourced.in`. `SameSite` is scoped to the REGISTRABLE domain, so
 * those two are same-site — and they HAVE to be, because the session cookie
 * must reach this API for the web client to work at all. The relaxation that
 * removes the protection is load-bearing for the product. Everything else on
 * that zone inherits it. **`Lax` was never going to protect this deployment**,
 * and no hosting change rescues it short of moving the API to a different
 * registrable domain.
 *
 * So the HTTP-Origin check is not defence-in-depth here; it is the only
 * defence. `SameSite=Lax` remains SET rather than inherited
 * (`../auth/auth.ts`, `advanced.defaultCookieAttributes.sameSite`) with its
 * emitted value pinned whole by `test/auth/sign-in-flows.test.ts` — the pin
 * that also forbids a `Domain` attribute — and it still does real work against
 * any origin OUTSIDE `artsourced.in`. It simply does none against a sibling.
 *
 * **Scope, which is what makes it free.** The check fires only on requests that
 * carry a `Cookie` header — an AMBIENT credential the browser attaches whether
 * the page meant it or not. A bearer-authenticated caller sends no cookie, has
 * nothing ambient to forge, and is untouched: every mobile and desktop client,
 * and every test in this repository (`test/helpers/session.ts` says why it
 * signs in with a bearer token, at length).
 */
export function registerEventRoutes(
  app: FastifyInstance,
  ingest: ClientIngest,
  requireSession: preHandlerHookHandler,
): void {
  app.post(
    '/v1/events',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['events'],
          additionalProperties: false,
          properties: {
            events: { type: 'array', minItems: 1, maxItems: MAX_BATCH_SIZE },
          },
        },
      },
    },
    async (request) => {
      const { events } = request.body as { events: unknown[] };
      const results = await ingest.ingestClientBatch(events, request.currentUserId);
      return { results };
    },
  );
}
