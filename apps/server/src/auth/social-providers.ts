/**
 * WHICH SOCIAL PROVIDERS ARE CONFIGURED — asked once, answered once, and both
 * readers derive from the SAME expression.
 *
 * THE DEFECT THIS EXISTS TO PREVENT, which shipped and the owner found it by
 * clicking: `/sign-in` rendered `Continue with Google` unconditionally while
 * `GOOGLE_CLIENT_ID` was unset on the running dev server. The button was a dead
 * end for every user. The audit's own principle, inverted — *a permission
 * control that is invisible in the mockup is one somebody deletes while matching
 * the design* — and its mirror is **a control that can never succeed and is
 * shown anyway**.
 *
 * THE OBVIOUS FIX IS THE ONE THAT DRIFTS. A route that answers the question by
 * reading the Google client id out of the environment itself, beside a
 * `createAuth` that builds its config from a slightly different expression, is
 * two sources for one fact, and the day they disagree the page shows a button
 * the server refuses — which is exactly the bug, restored by the fix for it.
 *
 * *(That sentence used to SPELL the variable access inline, and the spelling was
 * a defect: `scripts/check-env-example.mjs` reads raw lines, comments included,
 * so the prose registered as a code site and the gate reported the key as read
 * by this file when nothing here read it that way. The gate was green for the
 * wrong reason on Google and blind on all three Apple keys at the same time.
 * `SOCIAL_PROVIDER_ENV` below is the fix: one real, literal read per key.)*
 *
 * So there is ONE function. `socialProvidersFromEnv` returns the object handed
 * to better-auth, containing a key **only** for a provider that is fully
 * configured. `enabledSocialProviders` then reads that same object back. The
 * page's answer is therefore not *derived from the same env* — it is derived
 * from *the very object the auth instance was built with*, which is a stronger
 * property and a checkable one: `test/auth/social-providers.test.ts` asserts the
 * two agree for every combination of the four variables, including the mixed
 * cases where an id is set and a secret is not.
 *
 * "EMPTY DISABLES" IS NOW STRUCTURAL, not a vendor's falsy check. `.env.example`
 * has claimed `empty disables` beside `GOOGLE_CLIENT_ID` since Plan 4, and it was
 * true only because better-auth happens to treat `''` as absent internally. The
 * key was still PRESENT in the config, so nothing our code could read said the
 * provider was off. Omitting the key makes the claim something this repo asserts
 * rather than inherits.
 *
 * BOTH HALVES OF A PAIR ARE REQUIRED. An id with no secret is not a usable
 * provider: better-auth's own `apple.ts:94` refuses on
 * `!getPrimaryClientId(options.clientId) || !options.clientSecret`, and Google's
 * token exchange cannot be made without the secret either. A half-configured
 * provider is the state a deployment is in for the seconds between setting two
 * variables, and it must read as OFF, not as ON-and-broken.
 */

/** The providers this product offers. Adding one here is what makes it visible. */
export const SOCIAL_PROVIDER_NAMES = ['google', 'apple'] as const;

export type SocialProviderName = (typeof SOCIAL_PROVIDER_NAMES)[number];

/** What `GET /v1/auth/methods` answers: one boolean per known provider. */
export type EnabledSocialProviders = Record<SocialProviderName, boolean>;

export type SocialProviderConfig = {
  clientId: string;
  clientSecret: string;
  /**
   * Apple only. Absent for Google, whose options have no such member.
   *
   * **AND IT DOES NOT MEAN WHAT AN EARLIER VERSION OF THIS COMMENT SAID.** That
   * version read "the web flow's audience is the Services ID in `clientId`",
   * which implies setting a bundle id is harmless for web. It is not.
   * better-auth builds ONE id-token audience for the provider, not one per
   * flow: `options.audience ?? options.appBundleIdentifier ?? options.clientId`
   * (`@better-auth/core@1.7.2`, `apple.ts`, the `idToken` block). So a bundle id
   * present with no explicit `audience` REPLACES the Services ID, and every WEB
   * sign-in — whose id-token carries the Services ID as `aud` — fails
   * validation. The day the owner set that variable for the native app, Apple
   * sign-in on the web would have broken, and the documentation said it was
   * safe. Found in review.
   */
  appBundleIdentifier?: string;
  /**
   * Set ALONGSIDE `appBundleIdentifier` and never alone: the explicit list of
   * audiences better-auth accepts, which is the only way both flows validate.
   * `AppleOptions.audience` is `string | string[] | undefined` in the installed
   * package and takes precedence over both fallbacks above.
   */
  audience?: string[];
};

/** Trims, because a variable set to a lone space is not configuration. */
function readable(env: NodeJS.ProcessEnv, key: string): string {
  return (env[key] ?? '').trim();
}

/**
 * THE REAL ENVIRONMENT, READ WITH ONE LITERAL ACCESS PER KEY — and the literals
 * are the point, not a style choice.
 *
 * `socialProvidersFromEnv` takes its environment as an argument so it can be
 * driven from a fixture, and reads it as `env[key]` with `key` a variable. That
 * is invisible to `scripts/check-env-example.mjs`, whose detectors anchor on
 * the literal environment access with the key spelled inline — so routing every read
 * through a helper silently removed `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
 * from the gate's view (they were direct accesses in `auth.ts` before) and never
 * added the three Apple keys. **An operator-facing variable the env gate cannot
 * see is exactly what that gate exists to prevent, and the refactor that hid
 * them would have reported clean.**
 *
 * So the five keys are spelled here, once, literally. This function is also the
 * single place that names the contract between this module and an operator: add
 * a provider above and you must add its keys here or the gate stops watching
 * them, which is a failure a reader can see rather than one they must remember.
 */
export function readSocialProviderEnv(): NodeJS.ProcessEnv {
  return {
    GOOGLE_CLIENT_ID: process.env['GOOGLE_CLIENT_ID'],
    GOOGLE_CLIENT_SECRET: process.env['GOOGLE_CLIENT_SECRET'],
    APPLE_CLIENT_ID: process.env['APPLE_CLIENT_ID'],
    APPLE_CLIENT_SECRET: process.env['APPLE_CLIENT_SECRET'],
    APPLE_APP_BUNDLE_IDENTIFIER: process.env['APPLE_APP_BUNDLE_IDENTIFIER'],
  };
}

/**
 * THE ONE EXPRESSION. Everything downstream reads its result, never the env.
 *
 * A provider appears in the returned object if and only if BOTH its id and its
 * secret are non-empty after trimming. `appBundleIdentifier` is OMITTED rather
 * than set to `''` or to `undefined`, and the spread is how: better-auth reads
 * it as `options.appBundleIdentifier ? … : options.clientId` when choosing the
 * id-token audience (`apple.ts`, the `idToken.audience` branch), so an empty
 * string is falsy and would land on the same branch as absent — but an
 * `undefined` VALUE under a PRESENT key is a different thing to any code that
 * asks `'appBundleIdentifier' in options`, and this repo does not set
 * `exactOptionalPropertyTypes` (checked: `tsconfig.base.json` sets `strict` and
 * `noUncheckedIndexedAccess` and not that one), so the compiler would not have
 * caught the difference. Omitting the key is the shape that needs no reader to
 * be careful.
 */
export function socialProvidersFromEnv(
  env: NodeJS.ProcessEnv,
): Partial<Record<SocialProviderName, SocialProviderConfig>> {
  const providers: Partial<Record<SocialProviderName, SocialProviderConfig>> = {};

  const googleId = readable(env, 'GOOGLE_CLIENT_ID');
  const googleSecret = readable(env, 'GOOGLE_CLIENT_SECRET');
  if (googleId !== '' && googleSecret !== '') {
    providers.google = { clientId: googleId, clientSecret: googleSecret };
  }

  const appleId = readable(env, 'APPLE_CLIENT_ID');
  /**
   * APPLE'S `clientSecret` IS A PRE-SIGNED JWT, NOT A STATIC STRING — and this
   * was CONFIRMED FROM THE INSTALLED PACKAGE rather than from Apple's docs or
   * from memory, because the two libraries in this space differ on it.
   *
   * `@better-auth/core@1.7.2`'s `src/social-providers/apple.ts` contains no
   * signing at all: it imports `decodeJwt` and `importJWK` from `jose` solely to
   * VERIFY Apple's id_token against Apple's published keys, and hands
   * `options.clientSecret` to the shared `validateAuthorizationCode`, which does
   * `body.set("client_secret", options.clientSecret)`
   * (`src/oauth2/token-endpoint-auth.ts:113`) — the string goes on the wire
   * verbatim. There is no `SignJWT` on that path.
   *
   * So `APPLE_CLIENT_SECRET` holds a **client secret JWT** (ES256, `iss` = Team
   * ID, `sub` = Services ID, `aud` = `https://appleid.apple.com`, ≤ 6 months),
   * minted by `scripts/mint-apple-client-secret.mjs` from the `.p8` key, and it
   * EXPIRES — rotation is an operational task, recorded in the runbook. The key
   * material variables (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`)
   * are read by that script and NEVER by the server, which is why they are not
   * consulted here.
   *
   * Also confirmed: `apple.ts` sets no `authentication` option, so
   * `getDefaultTokenEndpointAuth` returns `client_secret_post` whenever a secret
   * is present (`token-endpoint-auth.ts:48-53`) — which is the method Apple's
   * token endpoint requires. Nothing to configure.
   */
  const appleSecret = readable(env, 'APPLE_CLIENT_SECRET');
  if (appleId !== '' && appleSecret !== '') {
    const bundleId = readable(env, 'APPLE_APP_BUNDLE_IDENTIFIER');
    providers.apple = {
      clientId: appleId,
      clientSecret: appleSecret,
      // A bundle id is carried WITH an explicit audience list, never on its own.
      // Alone it REPLACES the Services ID as better-auth's id-token audience and
      // breaks every WEB sign-in; the pair makes better-auth accept both, which
      // is what "the native app also uses this provider" actually requires.
      ...(bundleId === ''
        ? {}
        : { appBundleIdentifier: bundleId, audience: [appleId, bundleId] }),
    };
  }

  return providers;
}

/**
 * The page's answer, read back off the object the auth instance was built with.
 *
 * Deliberately takes the CONFIG, not the env. Passing the env here would
 * reintroduce the second source this module exists to remove.
 *
 * The parameter is typed structurally — `{ google?: unknown; apple?: unknown }`
 * — rather than as this module's own config type, and that is the point rather
 * than looseness: it lets the route pass `auth.options.socialProviders`, which
 * is better-auth's OWN view of what the running instance was built with. The
 * answer is then read off the constructed auth instance, not off a copy some
 * caller kept, and there is no arrangement of arguments that makes the two
 * disagree. `unknown` because only presence is ever asked; a shape that let this
 * function read a client id would be a shape that could leak one.
 */
export function enabledSocialProviders(providers: {
  google?: unknown;
  apple?: unknown;
}): EnabledSocialProviders {
  return {
    google: providers.google !== undefined,
    apple: providers.apple !== undefined,
  };
}
