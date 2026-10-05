/**
 * The HTTP-`Origin` check on cookie-authenticated product mutations.
 *
 * ## The name, first, because two unrelated things in this repository are
 * called "origin"
 *
 * **HTTP-Origin** — this file — is the browser `Origin` REQUEST HEADER, and the
 * subject is CSRF. It has nothing to do with **envelope-origin**,
 * `EventEnvelope.origin`, the provenance enum (`'client' | 'server' | …`) the
 * ingest gate reads to refuse a client wearing `origin: 'server'`. The two meet
 * in this module's neighbourhood and nowhere else. Someone who conflates them
 * writes a header check and believes the envelope forgery window is closed; it
 * is a different window, closed by a different guard, in `ingest-service.ts`.
 *
 * ## Why this exists at all — the CSRF ruling (coordination doc, 2026-08-31)
 *
 * The ruling's three items, quoted:
 *
 *   1. *"`SameSite` is not currently a choice this repository has made, and that
 *      is the first thing to fix… Pin it explicitly."* — DONE, elsewhere:
 *      `auth/auth.ts` sets `advanced.defaultCookieAttributes.sameSite = 'lax'`,
 *      and `test/auth/sign-in-flows.test.ts` pins the emitted attribute list
 *      whole (which is also what forbids a `Domain` attribute — item 1b).
 *   2. *"The Origin requirement is scoped to COOKIE-authenticated requests, and
 *      the stated cost disappears… Require and validate `Origin` on product
 *      requests authenticated by cookie; require nothing of bearer-
 *      authenticated requests."* — THIS FILE.
 *   3. *"Lax was never going to protect this deployment, and no future hosting
 *      decision can rescue it short of moving the API to a different registrable
 *      domain."* — the product is `pm.artsourced.in`, the API is
 *      `pm-api.artsourced.in`, `SameSite` is scoped to the REGISTRABLE domain
 *      `artsourced.in`, and the architecture REQUIRES that relaxation for the
 *      web client to reach the API at all. So every sibling subdomain of the
 *      zone is same-site with this API and `Lax` does nothing between them.
 *
 * Item 3 is why item 2 is **the only CSRF defence available on cookie-
 * authenticated product routes, not defence-in-depth.** The ruling calls it its
 * most certain finding.
 *
 * ## CORS is NOT this, and cannot substitute for it
 *
 * CORS governs what a browser lets a page's JavaScript **read** from a
 * response. It does not govern what this server **accepts**: a cross-site
 * `<form method="post">` submission, or a `fetch(..., { mode: 'no-cors' })`,
 * arrives at the handler and commits, and the attacker never needed to read the
 * reply. `@fastify/cors` is registered beside this check for a different reason
 * (bearer-token mobile/desktop callers) and closes none of this.
 *
 * ## How a cookie-authenticated request is told from a bearer one
 *
 * By the presence of a `Cookie` REQUEST HEADER, and not by matching
 * better-auth's cookie NAME.
 *
 * - It is better-auth's own rule, already quoted in this repository at
 *   `auth/auth.ts`: *"any non-GET request that CARRIES A COOKIE must also carry
 *   a trusted `Origin` or `Referer`; a bearer-only request sends no cookie and
 *   is exempt."* This is that rule, applied to the product routes better-auth's
 *   middleware provably never reaches (`validateOrigin` returns immediately
 *   with no request context, and `makeRequireSession` calls
 *   `auth.api.getSession({ headers })` — a direct API call with no request).
 * - Name-matching `better-auth.session_token` would fail **OPEN** the day the
 *   vendor renames its cookie or adds a second one: the check would stop firing
 *   and nothing would go red. Cookie-PRESENCE fails closed — a new cookie can
 *   only cause more requests to be checked, never fewer.
 *
 * The scoping is what dissolves the cost objection the ruling names. A bearer
 * token is not ambient: it is attached deliberately by code that had to hold
 * it, so there is no forgery to prevent, and demanding an `Origin` of a phone
 * or a desktop client would break every non-browser caller for nothing. The
 * whole product-route test suite is bearer-authenticated
 * (`test/helpers/session.ts` states why, at length), which is the discharge:
 * this check changes no existing caller's answer.
 *
 * ## The ONE deployment fact this check depends on, stated so it is checkable
 *
 * The shipped web client does not talk to this API directly: `apps/web`'s Next
 * config REWRITES `/v1/:path*` and `/api/auth/:path*` to `SERVER_ORIGIN`
 * server-side (verified at `apps/web/next.config.ts:74-79`), so the browser
 * makes a SAME-ORIGIN request to `pm.artsourced.in` and Next proxies it here.
 * A browser sends `Origin` on every non-GET request, same-origin included, so
 * the header exists — but it only reaches this check if **Next forwards it**
 * along with the `Cookie` header it already must be forwarding for
 * authentication to work at all.
 *
 * That forwarding is the one link in this chain not measured in this
 * repository, because it needs a real browser against a real deploy. **It is
 * therefore the first thing to check if the web client starts answering 403
 * `forbidden_origin` after this ships**, and the fix if it does is to forward
 * the header in the proxy hop, never to widen the check.
 *
 * ## `Origin` only — not `Origin` or `Referer`
 *
 * Browsers send `Origin` on every cross-origin request and on every same-origin
 * non-GET. `Referer` is suppressible by a page's referrer policy and is
 * truncated or dropped by ordinary privacy settings, so accepting it as a
 * fallback would add a weaker match without admitting a caller that `Origin`
 * turns away. An absent `Origin` on a cookie-carrying mutation is refused: the
 * ruling says *require* and validate.
 */

/**
 * The refusal, and the only one. `403`, shaped like every other named refusal
 * this server sends (`{ error: 'unauthenticated' }`,
 * `{ error: 'rate_limited', … }`), and deliberately contentless beyond its
 * name: a caller learns that the request was declined for its provenance, not
 * which origin would have been accepted. The configured `WEB_ORIGIN` is not a
 * secret, but echoing it back turns this endpoint into a way to ask.
 */
export const FORBIDDEN_ORIGIN_BODY = { error: 'forbidden_origin' } as const;

/**
 * The routes that require a valid HTTP-`Origin` when the request carries a
 * cookie — **exactly the set the CSRF ruling scopes item 2 to**, and matched by
 * `request.routeOptions.url`, which is the route PATTERN.
 *
 * `routeOptions.url`, never `request.raw.url` — MEASURED against this repo's
 * own fastify 5.12.1 (`scratchpad/probe-t2.mjs`, and the wiring test in
 * `test/http/security-middleware.test.ts` prints the same table). `raw.url`
 * carries the QUERY STRING, so an exact-match set keyed on it is bypassed
 * completely by appending `?x=1`: the request reaches the handler and commits,
 * with no error and nothing in a log to notice. `routeOptions.url` is
 * `'/v1/events'` for both spellings, and it is the parameterised PATTERN for
 * the invite mint — `'/v1/workspaces/:workspaceId/invites'`, with the colon —
 * which is why that entry is spelled the way it is here.
 *
 * ## What is deliberately NOT in this set, and who owns each
 *
 * The ruling scopes item 2 to *product mutations*: `POST /v1/events`,
 * `POST /v1/attachments`, `POST /v1/sync`, and the invite MINT. Two other
 * cookie-authenticatable mutations exist and are excluded here rather than
 * silently omitted:
 *
 * - **`POST /v1/invites/:token/accept`.** A forced cross-site acceptance makes
 *   the victim join a workspace an attacker controls — real, but it requires
 *   the attacker to already hold a valid unspent invitation token, and the
 *   result is an attributed `invite.accepted` event naming the victim, in a
 *   workspace they can leave. Adding it is a product decision about whether
 *   acceptance may ever be initiated from anywhere but the product's own
 *   invite page. *Owner: Plan 4 Task 14's successor, or Plan 6 at the invite
 *   page, whichever revisits acceptance first.*
 * - **`PUT /v1/me/preferences`.** The one write in this server that is not an
 *   attributed claim (coordination amendment 14): it arranges the record rather
 *   than saying anything about it, so a forced write is a nuisance the victim
 *   can undo, not a claim in the ledger. *Owner: Plan 5 Task 13's successor.*
 *
 * `GET` routes are absent by definition and not by oversight — CSRF is about
 * causing a state change with an ambient credential, and this server's reads
 * change none. `GET /v1/sync/bootstrap` is the largest read here and is
 * rate-limited for that reason (`app.ts`), which is a different control.
 *
 * **`GET /v1/stream` is the one exception, and it is not in this set** (E6-15):
 * `httpOriginRefused` checks it by NAME (`STREAM_ROUTE_URL`), for any method,
 * because a WebSocket upgrade is exempt from the same-origin policy that makes
 * every other `GET` here safe to leave unchecked — see that function's own
 * comment.
 */
export const HTTP_ORIGIN_PROTECTED_ROUTES: ReadonlySet<string> = new Set([
  '/v1/events',
  '/v1/sync',
  '/v1/attachments',
  '/v1/workspaces/:workspaceId/invites',
  // The three below were MISSING from the first cut of this set while the
  // docblock above claimed the exclusion list was exhaustive — found by
  // printing the assembled app's whole route table and injecting a
  // cookie-carrying forged-Origin request at EVERY non-GET route, rather than
  // by re-reading the list that was already believed complete. Each one is a
  // cookie-authenticatable mutation that appends events or writes rows:
  '/v1/workspaces', // creates a workspace and appends its founding events
  '/v1/workspaces/:workspaceId/ticket-types/:typeId/migrate', // admin bulk migration, envelope-origin 'web'
  '/v1/me/notifications/:id/read', // per-user write
  // The BULK form of the line above, and it is registered separately because
  // that is the whole hazard this set has: `has(input.routeUrl)` is an EXACT
  // match on the string, so `/v1/me/notifications/:id/read` does NOT cover
  // `/v1/me/notifications/read` and the new route would have shipped
  // CSRF-unprotected while the list above LOOKED complete. Same category as the
  // three the note above records as missing from the first cut — a
  // cookie-authenticatable mutation, writable by a page the victim visits.
  // Found by MEASURING rather than by reading: the ruling on this task named it
  // as the omission to watch for, and the string below is the fix.
  '/v1/me/notifications/read', // per-user BULK write, both directions
  // A cookie-authenticatable mutation that DESTROYS a credential. The same
  // category as the approve POST that mints one, and it needs the control for
  // the mirror-image reason: without it, a page the victim visits can revoke
  // their assistant's access with their ambient cookie. Denial of service
  // rather than escalation, which is why it is easy to leave out — and
  // `SameSite=Lax` does not close it, because the product and the API are
  // same-site siblings of one registrable domain (see this file's own notes).
  '/v1/me/mcp-tokens/:id',
  // Disconnecting a hosted assistant (remote-MCP plan Task 8) — the same denial-of-
  // service-by-ambient-cookie as the token revoke above.
  '/v1/me/mcp-connections/:id',
  // Signing another of the caller's devices out — the same denial-of-service-by-ambient-cookie (devices plan Task 3).
  '/v1/me/devices/:key/sign-out',
  // A cookie-authenticated POST that MINTS A CREDENTIAL — the same category as
  // the invite route three lines up, and the reason that one is here.
  '/v1/mcp/device/approve',
  // Hosted MCP consent decision — a cookie POST from the web host that mints an
  // authorization code (remote-MCP plan Task 3).
  '/v1/mcp/oauth/requests/:requestId/decision',
  // Its DENIAL sibling, added 2026-09-19. The attack is the MIRROR of the one
  // above and no less real for being a refusal rather than a grant: without
  // this entry, a page the victim visits can kill a grant out from under
  // whoever was mid-approval. A sibling PATH rather than a `deny` flag on
  // approve — see the route's own note for why that shape is refused.
  '/v1/mcp/device/deny',
  // E3-14 — three UNRECORDED omissions found by the same measurement (the
  // assembled route table, probed with a cookie-carrying forged-Origin
  // request at every non-GET route) that first found the three above. Unlike
  // the invite TOKEN accept and `PUT /v1/me/preferences` — excluded above by
  // a recorded ruling this task does not revisit — nothing excludes these:
  '/v1/me/notification-preferences',
  '/v1/me/invitations/:inviteId/accept', // membership-granting, cookie-authenticated
  '/v1/me/invitations/:inviteId/decline',
  // My work preferences (my-work-global plan, Task 2): a per-user write, the
  // same category as notification preferences two lines up.
  '/v1/me/my-work-preferences',
  // Access plan Task 6 (case 6.216). The lookup answers "does this address have
  // an account"; the outsider door GRANTS a workspace role. Both are
  // cookie-authenticated POSTs a page the victim visits could otherwise send.
  '/v1/workspaces/:workspaceId/people-lookup',
  '/v1/workspaces/:workspaceId/assign-outsider',
  // Access follow-ups R5 (case 6.216's shape): a cookie-authenticated POST that
  // ends a person's access, so a page the victim visits must not be able to send it.
  '/v1/workspaces/:workspaceId/members/:userId/remove',
]);

/**
 * Normalise `WEB_ORIGIN` to a serialized origin, ONCE, at app assembly.
 *
 * `config.webOrigin` is validated as an http(s) URL with a host, which admits
 * `https://pm.artsourced.in/` — trailing slash and all. A browser's `Origin`
 * header never carries one, so a raw string comparison against the configured
 * value would refuse every legitimate request from a deployment that happened
 * to write the slash. `new URL(...).origin` is exactly `scheme://host[:port]`,
 * which is the grammar of the header.
 *
 * The HEADER is deliberately NOT parsed the same way. Comparing
 * `new URL(header).origin` would accept `https://pm.artsourced.in/anything`,
 * and more importantly it would silently accept whatever else the WHATWG parser
 * is willing to normalise into that origin. The header is compared as an exact
 * string against this one normalised value: `null` (a sandboxed iframe, some
 * redirect chains) fails it, an absent header fails it, and there is no parse
 * to be clever with.
 */
export function normalizeOrigin(webOrigin: string): string {
  return new URL(webOrigin).origin;
}

/**
 * The whole decision, as a pure function of what a request carries — so the
 * hook in `app.ts` is a wiring statement and this is the thing with the rule in
 * it.
 *
 * Returns `true` when the request must be REFUSED.
 */
// Exported so a test asserting "every mutating route in the real app is
// covered" (E3-15) filters on the SAME set this file refuses by, rather than
// a second, hand-copied literal that could drift from it unnoticed.
export const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * `/v1/stream`'s route pattern (`stream/routes.ts`) — checked by
 * `httpOriginRefused` for ANY method, not just the four in `MUTATING_METHODS`
 * above. See E6-15's comment on the check itself for why: a WebSocket upgrade
 * is a GET, and this is the one GET route a forged cross-site request can
 * still hijack something by reaching.
 */
export const STREAM_ROUTE_URL = '/v1/stream';

export function httpOriginRefused(input: {
  method: string;
  /** `request.routeOptions.url` — the route PATTERN, `undefined` for an unmatched path. */
  routeUrl: string | undefined;
  /** `request.headers.cookie` — presence is the whole ambient-credential test. */
  cookie: string | undefined;
  /** `request.headers.origin` — the HTTP-Origin header itself. */
  origin: string | undefined;
  /** The output of `normalizeOrigin(config.webOrigin)`. */
  expectedOrigin: string;
}): boolean {
  // Mutations only. A preflight (`OPTIONS`) carries an `Origin` and changes
  // nothing, and `routeOptions.url` is `undefined` for it anyway — measured.
  //
  // ALL FOUR mutating methods, not just POST. This read `input.method !== 'POST'`
  // until 2026-09-08, and it was a hole with no symptom: every route in the set
  // above happened to be a POST, so the control looked complete while being
  // unable to protect a PUT, a PATCH or a DELETE that was added to the set. It
  // was found the only way it could be — by adding `DELETE /v1/me/mcp-tokens/:id`
  // to the set and watching the forged-Origin request sail through to the
  // session gate, which answered 401 for the wrong reason and would have read as
  // a refusal to anyone not looking closely.
  //
  // This change refuses nothing that was previously admitted: when it was made,
  // every route in the set was reached by POST alone, so widening the method
  // gate altered behaviour for exactly one route — the new one.
  //
  // ⚠ **THE COUNT IS DELIBERATELY ABSENT, and it was removed rather than
  // updated.** This paragraph read "the eight routes in the set"; the set holds
  // more than that now and has held a DELETE since 2026-09-08, so the number was
  // a reading that had already expired. **A count in a comment about a PAST
  // decision has no maintainer** — nothing fails when it drifts — so the honest
  // form states the property (all-POST-when-widened) and leaves the arithmetic
  // to whoever next measures the set.
  if (input.routeUrl === undefined) return false;
  // E6-15 — the ONE non-mutating door this check covers, and covered by NAME
  // rather than by widening `MUTATING_METHODS`. Opening `/v1/stream` changes
  // no state, so it is not the CSRF this file otherwise refuses — it is
  // cross-site WEBSOCKET HIJACKING: a cookie-carrying GET upgrade from a
  // foreign page hands that page the victim's live event stream, same-origin
  // policy notwithstanding, because a WebSocket handshake is exempt from it.
  // `SameSite=Lax` does not close this either — a top-level GET navigation
  // still attaches a `Lax` cookie, and an upgrade IS a GET. Checked before
  // `requireSession` (this hook runs first in `app.ts`), so a forged-origin
  // handshake never reaches the socket at all.
  if (input.routeUrl === STREAM_ROUTE_URL) {
    if (input.cookie === undefined) return false;
    return input.origin !== input.expectedOrigin;
  }
  if (!MUTATING_METHODS.has(input.method)) return false;
  if (!HTTP_ORIGIN_PROTECTED_ROUTES.has(input.routeUrl)) return false;
  // No ambient credential, nothing to forge. A bearer client lands here.
  if (input.cookie === undefined) return false;
  return input.origin !== input.expectedOrigin;
}
