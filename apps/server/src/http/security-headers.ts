/**
 * The response headers that are correct for THIS server on every response,
 * unconditionally — and the two that deliberately are not here.
 *
 * ## What was missing, measured rather than recalled
 *
 * Before 2026-09-08 this server sent exactly one security header, `hsts.ts`'s
 * `Strict-Transport-Security`. A sweep of `apps/server/src` for `helmet`,
 * `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
 * `Referrer-Policy` and `Permissions-Policy` returned nothing else. The gap had
 * been recorded as open in the executor handoff for days; the owner ruled on
 * 2026-09-08 to close the unambiguous part of it and defer CSP.
 *
 * ## Why these three need no policy decision
 *
 * They are properties of what this server IS, not of what a page it serves
 * happens to load:
 *
 * - **`nosniff`** — every route here answers JSON. Content sniffing exists to
 *   guess at a type the server did not state; this server always states one, so
 *   turning the guess off can never change a correct response. What it stops is
 *   a browser deciding a JSON body containing markup is HTML and running it.
 * - **`DENY`** — nothing this server returns is a document meant to be framed.
 *   The product's only browser surface is `apps/web`, a different host, which
 *   carries its own copy of this header.
 * - **`no-referrer`** — a browser never navigates FROM an API response, so there
 *   is no referrer this server needs any downstream to see. `apps/web` sets
 *   `strict-origin-when-cross-origin` instead, and the difference is deliberate:
 *   that one IS a document origin, and a page whose own links stop carrying
 *   their origin breaks flows that legitimately read it.
 *
 * ## What is NOT here, and why that is a decision rather than an oversight
 *
 * **No `Content-Security-Policy`.** A CSP is a statement about what a DOCUMENT
 * may load, and this server serves no documents — so the honest place for one is
 * `apps/web`, where it is a real design problem (a Next.js app on webpack with
 * `output: 'standalone'`, whose failure mode is breaking in production only).
 * Deferred by the owner on 2026-09-08 rather than guessed at here.
 *
 * **No `Permissions-Policy`.** Same reason, and worse: its directives govern
 * browser features a document uses, and a wrong one silently disables a feature
 * the product needs, in production, with no server-side symptom.
 *
 * `SECURITY_HEADERS` is a plain frozen record rather than a function of the
 * request, because none of the three depends on anything about the request —
 * and a function taking arguments it ignores invites a later reader to add a
 * condition none of these should have. `hsts.ts` is a function precisely
 * because its header IS conditional.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
});
