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
 * ## HTTP-Origin on this route: no, and now by decision rather than by omission
 *
 * **"HTTP-Origin" here is the browser `Origin` HEADER — CSRF. It is unrelated
 * to `EventEnvelope.origin`, the provenance enum the ingest gate reads.** The
 * two meet in this task and nowhere else; conflating them is how someone writes
 * a header check and believes the envelope forgery window is closed.
 *
 * better-auth's `originCheckMiddleware` binds `/api/auth/*` and nothing else:
 * `validateOrigin` returns immediately when there is no `ctx.request`, and
 * `makeRequireSession` calls `auth.api.getSession({ headers })` — a direct API
 * call with no request object. So a cookie-authenticated `POST /v1/events` with
 * no `Origin` reaches this handler, and it always has. The coordination doc
 * (§7) left the question open in as many words: *"Whoever adds the guard should
 * decide deliberately whether to require an `Origin` on product routes too;
 * today the answer is no, by omission rather than by decision."* This is that
 * decision, and the answer is still no:
 *
 * - A cross-site browser POST never carries the cookie in the first place —
 *   `SameSite=Lax` withholds it — so the request arrives unauthenticated and
 *   meets `requireSession`'s 401. An `Origin` requirement refuses the same
 *   requests one step earlier.
 * - The residual §7 actually names — a NON-browser client replaying a stolen
 *   cookie — sets any header it likes, `Origin` included. An `Origin`
 *   requirement does not touch it.
 *
 * So the mechanism is `SameSite=Lax`, and the two things that make that a
 * position rather than a hope are both now explicit: the attribute is SET in
 * `../auth/auth.ts` (`advanced.defaultCookieAttributes.sameSite`) instead of
 * inherited from a library default, and its emitted value is pinned whole by
 * `test/auth/sign-in-flows.test.ts`. That pin is also what forbids a `Domain`
 * attribute, which would hand the session cookie to every subdomain of the
 * zone.
 *
 * **RECORDED, not fixed:** this is one mechanism where a defended route would
 * have two, and it is a browser behaviour rather than a server check. Requiring
 * a trusted `Origin` on cookie-carrying product requests — better-auth's own
 * half-one rule, applied here — is real defence-in-depth against a future
 * `SameSite` regression, and it is out of Task 5's scope because it CHANGES
 * what the door accepts. *Owner: Plan 4 Task 13, which builds the rest of the
 * product HTTP surface, or Plan 11's deployment hardening, whichever is first.*
 * It needs `trustedOrigins`/`WEB_ORIGIN` (Task 14) to be meaningful anyway:
 * until the web app's origin is known, there is nothing to trust.
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
