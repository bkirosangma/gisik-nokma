import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import {
  enabledSocialProviders,
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
    onEventCommitted: () => () => {},
  };
}

function appWithProviders(socialProviders: Parameters<typeof createAuth>[0]['socialProviders']) {
  const auth = createAuth({
    pool: offlinePool,
    otpSender: new LogOtpSender(() => {}),
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
    expect(response.json()).toEqual({ google: false, apple: false });
  });

  it('13.324 answers true for exactly the providers the auth instance was built with', async () => {
    const both = await appWithProviders({ google: GOOGLE, apple: APPLE }).inject({
      method: 'GET',
      url: '/v1/auth/methods',
    });
    expect(both.json()).toEqual({ google: true, apple: true });

    // Each alone, because `{google:true, apple:true}` and `{google:false,
    // apple:false}` are both satisfied by a route that returns one boolean twice.
    const googleOnly = await appWithProviders({ google: GOOGLE }).inject({
      method: 'GET',
      url: '/v1/auth/methods',
    });
    expect(googleOnly.json()).toEqual({ google: true, apple: false });

    const appleOnly = await appWithProviders({ apple: APPLE }).inject({
      method: 'GET',
      url: '/v1/auth/methods',
    });
    expect(appleOnly.json()).toEqual({ google: false, apple: true });
  });

  /**
   * The route reads `auth.options.socialProviders` off the CONSTRUCTED instance
   * rather than off a copy the caller kept. This asserts that better-auth
   * actually preserves the object — if a future version normalised absent keys
   * into present-and-disabled ones, every boolean above would silently become
   * `true` and the page would go back to offering a dead button. Read from the
   * instance, not from the argument, on purpose.
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
      expect(response.json()).toEqual(expected);
    });
  }

  /**
   * `APPLE_APP_BUNDLE_IDENTIFIER` is the native app's audience and is optional.
   * The key is OMITTED when unset rather than set to `''` or `undefined` —
   * asserted with `Object.keys`, because `toEqual` treats a key holding
   * `undefined` as absent and would pass against exactly the shape this avoids.
   */
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
