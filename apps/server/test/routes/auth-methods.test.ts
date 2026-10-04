import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender, NullOtpSender, type OtpSender } from '../../src/auth/otp-sender.js';
import {
  enabledSocialProviders,
  readSocialProviderEnv,
  socialProvidersFromEnv,
} from '../../src/auth/social-providers.js';
import { createPool } from '../../src/db.js';
import type { IngestService } from '../../src/ingest/ingest-service.js';

/**
 * `GET /v1/auth/methods`, and the invariant the sign-in screen depends on.
 *
 * THE DEFECT THIS FILE PINS SHIPPED AND THE OWNER FOUND IT BY CLICKING: sign-in
 * rendered `Continue with Google` on a dev stack with `GOOGLE_CLIENT_ID` unset.
 *
 * The interesting property is NOT "the route answers false when the env is
 * empty" — that would pass against a route with the boolean hard-coded to
 * `false`, and against a route reading a completely different variable. It is
 * that the route's answer AGREES WITH THE AUTH INSTANCE for every combination of
 * the inputs, including the mixed ones. That is what the cross-product below
 * asserts, and it is why the fixtures include an id with no secret: that is the
 * state a deployment is in for the seconds between setting two variables, and it
 * must read as OFF rather than as ON-and-broken.
 */

const offlinePool = createPool('postgres://unused:unused@127.0.0.1:1/unused');

function fakeIngest(): IngestService {
  return {
    ingestBatch: async () => [],
    ingestClientBatch: async () => [],
    ingestAtomic: async () => ({ status: 'committed', results: [] }),
    ingestClientAtomic: async () => ({ status: 'committed', results: [] }),
    onEventCommitted: () => () => {},
  };
}

function appWithProviders(
  socialProviders: Parameters<typeof createAuth>[0]['socialProviders'],
  otpSender: OtpSender = new LogOtpSender(() => {}),
) {
  const auth = createAuth({
    pool: offlinePool,
    otpSender,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-not-used-anywhere-real',
    webOrigin: 'http://localhost:3001',
    socialProviders,
  });
  return buildApp({
    db: { query: async () => [{ ok: 1 }] },
    pool: offlinePool,
    ingest: fakeIngest(),
    auth,
    serverAppend: async () => [],
    webOrigin: 'http://localhost:3001',
    store: createObjectStoreFromEnv({}),
  });
}

const GOOGLE = { clientId: 'g-id', clientSecret: 'g-secret' };
const APPLE = { clientId: 'a-id', clientSecret: 'a-secret' };

describe('13.324 the page is told which social methods this server will actually accept', () => {
  /**
   * 13.324 — THE LOAD-BEARING CASE. With nothing configured, the route says so,
   * and the sign-in page renders no social button at all.
   *
   * `socialProviders: {}` is not a stand-in for the dev stack — it is what
   * `socialProvidersFromEnv` RETURNS for the dev stack's environment, and the
   * case below proves that separately rather than assuming it.
   */
  it('13.324 answers false for every provider when none is configured', async () => {
    const response = await appWithProviders({}).inject({
      method: 'GET',
      url: '/v1/auth/methods',
    });
    expect(response.statusCode).toBe(200);
    // `toEqual`, not a partial match: the point is that this route says NOTHING
    // ELSE. A body that grew a client id would still satisfy `toMatchObject`.
    expect(response.json()).toEqual({ google: false, apple: false, phone: true });
  });

  it('13.324 answers true for exactly the providers the auth instance was built with', async () => {
    const both = await appWithProviders({ google: GOOGLE, apple: APPLE }).inject({
      method: 'GET',
      url: '/v1/auth/methods',
    });
    expect(both.json()).toEqual({ google: true, apple: true, phone: true });

    // Each alone, because `{google:true, apple:true}` and `{google:false,
    // apple:false}` are both satisfied by a route that returns one boolean twice.
    const googleOnly = await appWithProviders({ google: GOOGLE }).inject({
      method: 'GET',
      url: '/v1/auth/methods',
    });
    expect(googleOnly.json()).toEqual({ google: true, apple: false, phone: true });

    const appleOnly = await appWithProviders({ apple: APPLE }).inject({
      method: 'GET',
      url: '/v1/auth/methods',
    });
    expect(appleOnly.json()).toEqual({ google: false, apple: true, phone: true });
  });

  /**
   * 13.324 — THE INSTANCE IS THE SOURCE, and this case is deliberately weak in a
   * way worth stating rather than dressing up.
   *
   * At `better-auth@1.7.2` `auth.options` is the caller's own object BY
   * REFERENCE, so `auth.options.socialProviders` IS the literal passed three
   * lines up. As an assertion about better-auth's behaviour that is close to a
   * tautology, and a reviewer called it one. **It is kept because a tautology
   * today is a tripwire tomorrow**: if a future version clones or normalises
   * `options` — turning absent keys into present-and-disabled ones — every
   * boolean here flips to `true`, the page goes back to offering a dead button,
   * and this is the only case in the suite that would say so. That upgrade-time
   * failure is exactly what the route's design exists to prevent.
   *
   * What it is NOT is evidence that the route consults the instance rather than
   * its argument. The cases above establish that, by going through the real
   * route on a real app.
   */
  it('13.324 better-auth preserves the absence of an unconfigured provider in `options`', () => {
    const auth = createAuth({
      pool: offlinePool,
      otpSender: new LogOtpSender(() => {}),
      magicLinkSender: new LogMagicLinkSender(() => {}),
      baseUrl: 'http://localhost:3000',
      secret: 'test-secret-not-used-anywhere-real',
      webOrigin: 'http://localhost:3001',
      socialProviders: { google: GOOGLE },
    });
    const options = auth.options.socialProviders ?? {};
    expect(Object.keys(options).sort()).toEqual(['google']);
    expect(enabledSocialProviders(options)).toEqual({ google: true, apple: false });
  });
});

describe('13.336 the page is told whether phone sign-in can work, from the running instance', () => {
  /**
   * 13.336 — THE LOAD-BEARING HALF. `selectOtpSender()` returns a
   * `NullOtpSender`, which throws `PHONE_SIGN_IN_UNAVAILABLE` on every send, so
   * the honest answer to "will you accept a phone sign-in" is no — and the page
   * renders no Phone tab on the strength of it.
   *
   * Mutation witnessed: hard-coding `phone: true` in `registerAuthMethodRoutes`
   * reddens this case and this case alone, naming `/v1/auth/methods`.
   */
  it('13.336 answers phone:false when the selected sender is a NullOtpSender', async () => {
    const response = await appWithProviders({}, new NullOtpSender()).inject({
      method: 'GET',
      url: '/v1/auth/methods',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ google: false, apple: false, phone: false });
  });

  /**
   * 13.336 — AND THE OTHER DIRECTION, which is what makes the case above mean
   * anything. A route that answered `phone: false` unconditionally would pass
   * the first case forever; only a sender that CAN deliver, answering true,
   * shows the value is read rather than written.
   *
   * Mutation witnessed: hard-coding `phone: false` reddens this case alone.
   */
  it('13.336 answers phone:true when the selected sender can deliver', async () => {
    const response = await appWithProviders({}, new LogOtpSender(() => {})).inject({
      method: 'GET',
      url: '/v1/auth/methods',
    });
    expect(response.json()).toEqual({ google: false, apple: false, phone: true });
  });

  /**
   * 13.336 — IT COMES FROM THE SELECTION, NOT FROM THE ENVIRONMENT, and this is
   * the case that proves it rather than asserting it.
   *
   * Both apps are built inside ONE process, so `process.env` is byte-identical
   * for both. They disagree. An answer derived from any environment variable —
   * an `SMS_ENABLED` flag, a `NODE_ENV` branch — could not produce two different
   * booleans here, because there is nothing different for it to read. The only
   * thing that differs is the sender object each auth instance holds, which is
   * the property `phoneSignInAvailable` exists to expose.
   *
   * This is also the case that fails if someone "simplifies" the route by
   * calling `selectOtpSender()` itself instead of reading `auth.otpSender`:
   * that version answers false for BOTH apps, because it re-decides rather than
   * reporting, and the instance it reports on stops being the instance that
   * sends.
   */
  it('13.336 two instances in one process, one env, disagree', async () => {
    const refusing = await appWithProviders({}, new NullOtpSender()).inject({
      method: 'GET',
      url: '/v1/auth/methods',
    });
    const delivering = await appWithProviders({}, new LogOtpSender(() => {})).inject({
      method: 'GET',
      url: '/v1/auth/methods',
    });

    expect(refusing.json().phone).toBe(false);
    expect(delivering.json().phone).toBe(true);
  });
});

describe('13.325 "empty disables" is a property of this repo, not a vendor coincidence', () => {
  /**
   * The whole cross-product. A provider is enabled if and only if BOTH halves of
   * its pair are non-empty — and the two mixed rows are the ones that matter,
   * because a half-configured provider was previously indistinguishable from a
   * configured one: the key was in the config either way.
   */
  const CASES: ReadonlyArray<{
    readonly label: string;
    readonly env: NodeJS.ProcessEnv;
    readonly expected: { google: boolean; apple: boolean };
  }> = [
    { label: 'nothing set', env: {}, expected: { google: false, apple: false } },
    {
      label: 'google id only',
      env: { GOOGLE_CLIENT_ID: 'g-id' },
      expected: { google: false, apple: false },
    },
    {
      label: 'google secret only',
      env: { GOOGLE_CLIENT_SECRET: 'g-secret' },
      expected: { google: false, apple: false },
    },
    {
      label: 'google pair',
      env: { GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' },
      expected: { google: true, apple: false },
    },
    {
      label: 'google pair set to empty strings — what .env.example ships',
      env: { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' },
      expected: { google: false, apple: false },
    },
    {
      label: 'google pair set to whitespace — a variable set to a lone space is not configuration',
      env: { GOOGLE_CLIENT_ID: '  ', GOOGLE_CLIENT_SECRET: ' ' },
      expected: { google: false, apple: false },
    },
    {
      // The row a reviewer found missing. Without it the `appleId !== ''` half of
      // Apple's pair check was asserted by NOTHING — Google had both mixed rows
      // and Apple had one, so a mutation deleting Apple's id check survived the
      // whole cross-product.
      label: 'apple secret only',
      env: { APPLE_CLIENT_SECRET: 'a-jwt' },
      expected: { google: false, apple: false },
    },
    {
      label: 'apple id only',
      env: { APPLE_CLIENT_ID: 'a-id' },
      expected: { google: false, apple: false },
    },
    {
      label: 'apple pair',
      env: { APPLE_CLIENT_ID: 'a-id', APPLE_CLIENT_SECRET: 'a-jwt' },
      expected: { google: false, apple: true },
    },
    {
      label: 'both pairs',
      env: {
        GOOGLE_CLIENT_ID: 'g-id',
        GOOGLE_CLIENT_SECRET: 'g-secret',
        APPLE_CLIENT_ID: 'a-id',
        APPLE_CLIENT_SECRET: 'a-jwt',
      },
      expected: { google: true, apple: true },
    },
  ];

  for (const { label, env, expected } of CASES) {
    it(`13.325 ${label}`, async () => {
      const providers = socialProvidersFromEnv(env);

      // (a) the config the auth instance would be built with.
      expect(enabledSocialProviders(providers)).toEqual(expected);

      // (b) and the answer the PAGE gets, through the real route, from a real
      // auth instance built with that config. Asserting (a) alone would pass
      // against a route that never consulted the config at all.
      const response = await appWithProviders(providers).inject({
        method: 'GET',
        url: '/v1/auth/methods',
      });
      // `phone` is invariant across this table BY CONSTRUCTION and stays in the
      // `toEqual`: every row varies social ENV, none varies the sender, and the
      // helper's default is a `LogOtpSender`, which can deliver. Spreading it in
      // rather than dropping to `toMatchObject` keeps the "says NOTHING ELSE"
      // property these rows exist for. 13.336 is where the sender varies.
      expect(response.json()).toEqual({ ...expected, phone: true });
    });
  }

  /**
   * `APPLE_APP_BUNDLE_IDENTIFIER` is the native app's audience and is optional.
   * The key is OMITTED when unset rather than set to `''` or `undefined` —
   * asserted with `Object.keys`, because `toEqual` treats a key holding
   * `undefined` as absent and would pass against exactly the shape this avoids.
   */
  /**
   * 13.325 — `readSocialProviderEnv()` IS THE ONLY PATH A REAL DEPLOYMENT TAKES,
   * and until a reviewer said so it was exercised by nothing.
   *
   * Every case above supplies its own env literal or its own providers object,
   * so the five actual `process.env` reads — the ones an operator's variables
   * flow through, and the ones that exist in that shape so `check:env` can SEE
   * them — were covered by no test at all. A typo in one key name would have
   * disabled a provider in production with the whole suite green.
   *
   * `vi.stubEnv` drives the real function. The key set is asserted with
   * `Object.keys` because that is the contract `check:env` depends on: a key
   * missing here is a variable the gate stops watching, silently.
   */
  it('13.325 readSocialProviderEnv reads the five real keys, and nothing else', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'g-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'g-secret');
    vi.stubEnv('APPLE_CLIENT_ID', 'a-id');
    vi.stubEnv('APPLE_CLIENT_SECRET', 'a-jwt');
    vi.stubEnv('APPLE_APP_BUNDLE_IDENTIFIER', 'in.example.app');
    try {
      const env = readSocialProviderEnv();
      expect(Object.keys(env).sort()).toEqual([
        'APPLE_APP_BUNDLE_IDENTIFIER',
        'APPLE_CLIENT_ID',
        'APPLE_CLIENT_SECRET',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
      ]);
      // And the values are the ones the environment actually holds — a reader
      // that returned the right KEY SET with wrong values would pass the line
      // above while disabling every provider.
      expect(env['GOOGLE_CLIENT_ID']).toBe('g-id');
      expect(env['APPLE_CLIENT_SECRET']).toBe('a-jwt');

      // End to end through the real reader: both providers enabled, and the
      // bundle id carried WITH an explicit audience list containing BOTH the
      // Services ID and the bundle id. Alone, a bundle id REPLACES the Services
      // ID as better-auth's id-token audience and breaks every web sign-in.
      const providers = socialProvidersFromEnv(env);
      expect(enabledSocialProviders(providers)).toEqual({ google: true, apple: true });
      expect(providers.apple?.audience).toEqual(['a-id', 'in.example.app']);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('13.325 the optional Apple bundle id is omitted, not set to an empty value', () => {
    const without = socialProvidersFromEnv({
      APPLE_CLIENT_ID: 'a-id',
      APPLE_CLIENT_SECRET: 'a-jwt',
    });
    expect(Object.keys(without.apple ?? {}).sort()).toEqual(['clientId', 'clientSecret']);

    const with_ = socialProvidersFromEnv({
      APPLE_CLIENT_ID: 'a-id',
      APPLE_CLIENT_SECRET: 'a-jwt',
      APPLE_APP_BUNDLE_IDENTIFIER: 'in.artsourced.gisiknokma',
    });
    expect(with_.apple?.appBundleIdentifier).toBe('in.artsourced.gisiknokma');
  });
});
