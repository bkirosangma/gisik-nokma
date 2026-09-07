/**
 * `Strict-Transport-Security` — the one part of "force HTTPS" that is this
 * app's job rather than the platform's.
 *
 * ## What the platform already does, so this file does not
 *
 * The deployment target is DigitalOcean App Platform (`deploy/do/app.yaml`,
 * the only file that knows the provider). Its router terminates TLS and
 * redirects plain HTTP to HTTPS before a request ever reaches this process, so
 * **an in-app redirect would be dead code**: by the time Fastify sees a
 * request, it arrived over HTTPS or it arrived from the router's own health
 * check. Writing one anyway would be a security control that cannot fire,
 * which reads to a later auditor exactly like one that does.
 *
 * The `Secure` cookie attribute is likewise already handled and is NOT
 * restated here: better-auth derives it from `BETTER_AUTH_URL`'s protocol,
 * which `deploy/do/app.yaml` sets to `https://pm-api.artsourced.in`, and
 * `test/auth/sign-in-flows.test.ts` pins the behaviour over http and https as
 * two different cookie NAMES. See `auth/auth.ts`'s `defaultCookieAttributes`
 * docblock, which is the single authority for that.
 *
 * **What no layer supplies is HSTS.** A redirect protects the request that is
 * redirected; HSTS protects the NEXT one, by telling the browser never to try
 * plain HTTP against this host again. Without it, every fresh visit begins with
 * one interceptable cleartext request — the exact window `sslstrip` was written
 * for — and the redirect is what closes it too late.
 *
 * ## Why this is a function of the protocol, and refuses on http
 *
 * RFC 6797 §7.2 is a MUST NOT: *"An HSTS Host MUST NOT include the STS header
 * field in HTTP responses conveyed over non-secure transport."* So this returns
 * `null` for http rather than emitting a header a compliant browser is required
 * to ignore. That is not defensive tidiness — emitting it in dev would train
 * every developer's browser to refuse `http://localhost`, which is a
 * self-inflicted outage that survives uninstalling the app.
 *
 * Behind the platform router the protocol this reads is derived from
 * `X-Forwarded-Proto`, which is only trustworthy because `TRUST_PROXY=true` is
 * set for that deployment and the router overwrites the header. With
 * `trustProxy: false` (local dev, and the default) Fastify reports the real
 * socket's protocol, so this correctly stays silent.
 *
 * ## The two attributes chosen, and the one deliberately absent
 *
 * - `max-age=31536000` — one year, the value the browser-preload programme and
 *   OWASP both name as the floor for a site that means it.
 * - `includeSubDomains` — scoped to the host that sends it. This app is served
 *   at `pm.artsourced.in` and `pm-api.artsourced.in`, two sibling single-label
 *   subdomains; the directive therefore covers `*.pm-api.artsourced.in` and
 *   friends, and does NOT reach `artsourced.in` or anything else in the zone.
 *   Checked against `deploy/do/app.yaml`'s `domains:` block rather than
 *   assumed, because the failure mode of getting this wrong is taking an
 *   unrelated sibling service offline for every visitor who has been here once.
 * - **`preload` is deliberately NOT sent.** It is a one-way door: it asks for
 *   inclusion in a list compiled into browser binaries, removal takes months
 *   and reaches users only as they upgrade, and it implies the whole zone.
 *   That is an owner's decision about a domain the product does not solely
 *   own, not an implementer's. Recorded in `docs/pre-launch-checklist.md`.
 */

/** One year, in seconds — the floor for a host that means it. */
export const HSTS_MAX_AGE_SECONDS = 31_536_000;

export const HSTS_HEADER_VALUE = `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`;

/**
 * The header value for a request that arrived over `protocol`, or `null` when
 * no header may be sent.
 *
 * A pure function of one string so the RFC rule above is testable without a
 * socket, a proxy or a running app — the property is "https gets it, nothing
 * else does", and that is worth being able to state in one assertion.
 */
export function hstsHeaderFor(protocol: string | undefined): string | null {
  return protocol === 'https' ? HSTS_HEADER_VALUE : null;
}
