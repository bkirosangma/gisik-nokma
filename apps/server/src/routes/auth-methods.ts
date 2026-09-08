import type { FastifyInstance } from 'fastify';
import type { Auth } from '../auth/auth.js';
import { enabledSocialProviders, type EnabledSocialProviders } from '../auth/social-providers.js';

/**
 * `GET /v1/auth/methods` — which social sign-in methods this server will
 * actually accept.
 *
 * ## Why it exists
 *
 * `/sign-in` rendered `Continue with Google` unconditionally while
 * `GOOGLE_CLIENT_ID` was unset on the dev stack, so the button failed at the
 * server for every user who pressed it. The page had no way to know: provider
 * configuration lived inside `createAuth` and was never read back out.
 *
 * ## Why a route rather than a `NEXT_PUBLIC_*` build flag
 *
 * A build flag is a SECOND declaration of the same fact, baked into a bundle at
 * image-build time and read by a browser that may be talking to a server
 * deployed later with different secrets. **This answer comes from the very
 * object the running auth instance was constructed with** — `app.ts` passes
 * `deps.socialProviders` to `createAuth` and to this route, and
 * `enabledSocialProviders` reads that object rather than the environment. There
 * is no arrangement of variables under which the page can offer a provider this
 * server would refuse, which is a stronger property than "both read the same
 * env" and is what `test/routes/auth-methods.test.ts` pins.
 *
 * ## Why it is unauthenticated, stated rather than assumed
 *
 * It is reached from `/sign-in`, where by definition nobody has a session, so a
 * session gate would make it useless. What it discloses is **exactly what the
 * sign-in page already shows any anonymous visitor** — that this deployment
 * offers Google, or does not. It carries no client id, no secret, no redirect
 * URI and no user-specific fact; the response body is two booleans with fixed
 * key names, so it cannot grow a leak by accident the way a passthrough of the
 * config object could. `enabledSocialProviders` returns booleans for exactly
 * this reason: it takes the config and gives back nothing that came out of it.
 *
 * ## Not in `HTTP_ORIGIN_PROTECTED_ROUTES`
 *
 * That gate covers the four mutating methods on cookie-authenticated product
 * routes (the CSRF boundary, §7). This is a `GET` that reads no cookie and
 * changes nothing, so it is outside the set by construction rather than by
 * omission — stated here so a later reader does not "fix" a gap that is not one.
 */
export function registerAuthMethodRoutes(app: FastifyInstance, auth: Auth): void {
  // Computed ONCE, at registration, from the object the auth instance holds.
  // Provider configuration cannot change without a restart — it is read from the
  // environment at assembly — so re-deriving per request would suggest a
  // liveness this server does not have.
  const enabled: EnabledSocialProviders = enabledSocialProviders(
    auth.options.socialProviders ?? {},
  );

  app.get('/v1/auth/methods', async (_request, reply) => {
    return reply.send(enabled);
  });
}
