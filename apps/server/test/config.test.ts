import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';

const VALID_ENV = {
  DATABASE_URL: 'postgres://gisik:gisik@localhost:54329/gisik_nokma',
  BETTER_AUTH_URL: 'http://localhost:3000',
  // 34 characters, over better-auth's own 32-character floor, and obviously not
  // a key anything real is signed with.
  BETTER_AUTH_SECRET: 'test-secret-not-used-anywhere-real',
  WEB_ORIGIN: 'http://localhost:3001',
};

describe('loadConfig', () => {
  it('reads the required variables and applies defaults for the rest', () => {
    const config = loadConfig(VALID_ENV);
    expect(config).toEqual({
      databaseUrl: 'postgres://gisik:gisik@localhost:54329/gisik_nokma',
      port: 3000,
      host: '127.0.0.1',
      logLevel: 'info',
      betterAuthUrl: 'http://localhost:3000',
      betterAuthSecret: 'test-secret-not-used-anywhere-real',
      webOrigin: 'http://localhost:3001',
      snapshotIntervalMs: 300000,
      snapshotMinEvents: 20,
      // The notes series' search plan (Plan 3 of 6). Its `EMBED_WORKER_ENABLED`
      // is the schema's SECOND string-boolean, and the boolean is made in
      // `loadConfig` the same way `TRUST_PROXY`'s is — so this line pins that
      // conversion as well as the default.
      embedWorkerIntervalMs: 10000,
      embedWorkerEnabled: true,
      // Plan 11 Task 1's nine. Listed here, in the exact-shape assertion,
      // because that is the guard that fails when a field is ADDED without
      // anyone deciding it should exist — a per-field `expect` would not.
      trustProxy: false,
      rateLimitAuthMax: 10,
      rateLimitEventsMax: 120,
      rateLimitWindowSec: 60,
      alertWebhookUrl: null,
      smtpUrl: null,
      magicLinkFrom: 'sign-in@gisik-nokma.local',
      inviteFrom: 'sign-in@gisik-nokma.local',
      databaseCaCert: null,
      deploySha: 'dev',
    });
  });

  /**
   * Plan 10 Task 5's two additive fields. Asserted here as well as in the
   * whole-object case above because the exact-shape assertion states the
   * defaults only as a side effect of stating everything, and a reader looking
   * for "what does SNAPSHOT_MIN_EVENTS default to" should find it named.
   *
   * The refusals are the load-bearing half. `.positive()` on the interval is
   * not tidiness: `setInterval(fn, 0)` runs the snapshot pass on every tick of
   * the event loop, each pass opening a pool connection and folding every due
   * ticket. And a zero MIN_EVENTS makes every ticket due on every pass, which
   * recomputes a snapshot at a seq that already has a row and collides on the
   * snapshots primary key. Both are refused at the door so no environment can
   * reach either.
   */
  it('honours explicit snapshot settings and refuses a non-positive one', () => {
    const config = loadConfig({
      ...VALID_ENV,
      SNAPSHOT_INTERVAL_MS: '60000',
      SNAPSHOT_MIN_EVENTS: '5',
    });
    expect(config.snapshotIntervalMs).toBe(60000);
    expect(config.snapshotMinEvents).toBe(5);

    expect(() => loadConfig({ ...VALID_ENV, SNAPSHOT_INTERVAL_MS: '0' })).toThrowError(
      'invalid server configuration — check: SNAPSHOT_INTERVAL_MS',
    );
    expect(() => loadConfig({ ...VALID_ENV, SNAPSHOT_MIN_EVENTS: '0' })).toThrowError(
      'invalid server configuration — check: SNAPSHOT_MIN_EVENTS',
    );
    expect(() => loadConfig({ ...VALID_ENV, SNAPSHOT_MIN_EVENTS: '2.5' })).toThrowError(
      'invalid server configuration — check: SNAPSHOT_MIN_EVENTS',
    );
  });

  /**
   * The embedding worker's two knobs, named here for the same reason the
   * snapshot pair is: the exact-shape assertion above states these defaults
   * only as a side effect of stating everything.
   *
   * `EMBED_WORKER_ENABLED` is the schema's second string-boolean and the first
   * whose FALSE branch has a consequence an operator would want — with the
   * worker off, meaning search answers from chunks that stop being refreshed.
   * So the `'false'` half is asserted, not only the default.
   */
  it('honours the embedding worker settings and refuses a non-positive interval', () => {
    const config = loadConfig({ ...VALID_ENV, EMBED_WORKER_INTERVAL_MS: '60000', EMBED_WORKER_ENABLED: 'false' });
    expect(config.embedWorkerIntervalMs).toBe(60000);
    expect(config.embedWorkerEnabled).toBe(false);

    expect(() => loadConfig({ ...VALID_ENV, EMBED_WORKER_INTERVAL_MS: '0' })).toThrowError(
      'invalid server configuration — check: EMBED_WORKER_INTERVAL_MS',
    );
    // Any string that is neither 'true' nor 'false' is refused rather than
    // coerced: `Boolean('no')` is true, so a laxer schema would turn a typo
    // into "the worker runs", which is the opposite of what 'no' meant.
    expect(() => loadConfig({ ...VALID_ENV, EMBED_WORKER_ENABLED: 'no' })).toThrowError(
      'invalid server configuration — check: EMBED_WORKER_ENABLED',
    );
  });

  it('honours explicit PORT, HOST, LOG_LEVEL', () => {
    const config = loadConfig({ ...VALID_ENV, PORT: '8080', HOST: '0.0.0.0', LOG_LEVEL: 'debug' });
    expect(config.port).toBe(8080);
    expect(config.host).toBe('0.0.0.0');
    expect(config.logLevel).toBe('debug');
  });

  /**
   * 3.22 — boot refuses a missing `DATABASE_URL` with the variable NAMED. The non-numeric `PORT` half of the row is a test further down this block.
   */
  it('planted defect: a missing DATABASE_URL is refused with the variable named', () => {
    // Only DATABASE_URL removed, not an empty environment: `toThrowError(string)`
    // matches on substring, so `loadConfig({})` — which now names three missing
    // variables — would satisfy this assertion while proving less than it says.
    const { DATABASE_URL: _omitted, ...withoutDatabaseUrl } = VALID_ENV;
    expect(() => loadConfig(withoutDatabaseUrl)).toThrowError(ConfigError);
    expect(() => loadConfig(withoutDatabaseUrl)).toThrowError(
      'invalid server configuration — check: DATABASE_URL',
    );
  });

  it('planted defect: a missing BETTER_AUTH_URL is refused with the variable named', () => {
    const { BETTER_AUTH_URL: _omitted, ...withoutUrl } = VALID_ENV;
    expect(() => loadConfig(withoutUrl)).toThrowError(ConfigError);
    expect(() => loadConfig(withoutUrl)).toThrowError(
      'invalid server configuration — check: BETTER_AUTH_URL',
    );
  });

  /**
   * The one that matters most: the plan's own sketch defaulted this to
   * `'dev-only-secret-change-me'` in the production entrypoint, which would let a
   * deployment boot signing every session with a key printed in this repository.
   * Absent must stop the server.
   */
  it('planted defect: a missing BETTER_AUTH_SECRET is refused with the variable named', () => {
    const { BETTER_AUTH_SECRET: _omitted, ...withoutSecret } = VALID_ENV;
    expect(() => loadConfig(withoutSecret)).toThrowError(ConfigError);
    expect(() => loadConfig(withoutSecret)).toThrowError(
      'invalid server configuration — check: BETTER_AUTH_SECRET',
    );
  });

  /**
   * 31 characters — one short of better-auth's own threshold, below which the
   * library warns and starts anyway. Here it is refused instead, because a
   * warning in a log nobody reads is not a control.
   */
  it('planted defect: a BETTER_AUTH_SECRET under 32 characters is refused with the variable named', () => {
    const short = { ...VALID_ENV, BETTER_AUTH_SECRET: 'x'.repeat(31) };
    expect(() => loadConfig(short)).toThrowError(ConfigError);
    expect(() => loadConfig(short)).toThrowError(
      'invalid server configuration — check: BETTER_AUTH_SECRET',
    );
  });

  it('planted defect: a non-numeric PORT is refused with the variable named', () => {
    expect(() => loadConfig({ ...VALID_ENV, PORT: 'not-a-port' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ...VALID_ENV, PORT: 'not-a-port' })).toThrowError(
      'invalid server configuration — check: PORT',
    );
  });

  it('planted defect: an empty HOST is refused with the variable named', () => {
    expect(() => loadConfig({ ...VALID_ENV, HOST: '' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ...VALID_ENV, HOST: '' })).toThrowError(
      'invalid server configuration — check: HOST',
    );
  });

  it('planted defect: a LOG_LEVEL outside the enum is refused with the variable named', () => {
    expect(() => loadConfig({ ...VALID_ENV, LOG_LEVEL: 'verbose' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ...VALID_ENV, LOG_LEVEL: 'verbose' })).toThrowError(
      'invalid server configuration — check: LOG_LEVEL',
    );
  });

  /**
   * `WEB_ORIGIN` became LIVE with Plan 4 Task 14: it is the host of every
   * invitation link the server mints. Absent, links would read
   * `undefined/invite/<token>` — with the credential already spent on a URL
   * nobody can follow and no way to get it back — so it is required with no
   * default, exactly like the two auth variables above.
   */
  it('planted defect: a missing WEB_ORIGIN is refused with the variable named', () => {
    const { WEB_ORIGIN: _omitted, ...withoutWebOrigin } = VALID_ENV;
    expect(() => loadConfig(withoutWebOrigin)).toThrowError(ConfigError);
    expect(() => loadConfig(withoutWebOrigin)).toThrowError(
      'invalid server configuration — check: WEB_ORIGIN',
    );
  });

  /**
   * The refusal, and the exact bound of it — MEASURED rather than assumed, and
   * the bound MOVED by Plan 11 Task 1.
   *
   * WHAT THIS TEST USED TO SAY. `z.string().url()` delegates to the WHATWG URL
   * parser, which asks only for a scheme, so `'localhost:3001'` PASSED it: the
   * parser reads `localhost:` as the scheme and `3001` as the path. This file
   * recorded that as a deliberate, measured absence — *"Absence, owner Plan 11:
   * neither variable is constrained to an http(s) scheme with a host"* — with
   * an assertion PINNING the laxness, so that a reader could not mistake
   * `.url()` for "an http(s) origin".
   *
   * WHAT IT SAYS NOW. Plan 11 owned the absence and closed it (test case
   * 6.124). A `WEB_ORIGIN` of `localhost:3001` mints invitation links reading
   * `localhost:3001/invite/<token>` — a URL nobody can follow, with a
   * single-use credential already spent on it. A server whose invitation host
   * is malformed must not start, so the pinning assertion is INVERTED here
   * rather than deleted: the line that proved the hole now proves it is shut.
   */
  it('planted defect: a WEB_ORIGIN without an http(s) scheme and a host is refused with the variable named', () => {
    expect(() => loadConfig({ ...VALID_ENV, WEB_ORIGIN: 'not a url' })).toThrowError(
      'invalid server configuration — check: WEB_ORIGIN',
    );
    expect(() => loadConfig({ ...VALID_ENV, WEB_ORIGIN: '' })).toThrowError(
      'invalid server configuration — check: WEB_ORIGIN',
    );
    // The bound that moved. `localhost:3001` parses as a URL and is refused
    // anyway; the same string with a scheme in front of it is accepted.
    expect(() => loadConfig({ ...VALID_ENV, WEB_ORIGIN: 'localhost:3001' })).toThrowError(
      'invalid server configuration — check: WEB_ORIGIN',
    );
    expect(loadConfig({ ...VALID_ENV, WEB_ORIGIN: 'http://localhost:3001' }).webOrigin).toBe(
      'http://localhost:3001',
    );
    expect(loadConfig({ ...VALID_ENV, WEB_ORIGIN: 'https://pm.artsourced.in' }).webOrigin).toBe(
      'https://pm.artsourced.in',
    );
    // A scheme that is neither http nor https parses fine and is still refused:
    // `.url()` alone would have taken this.
    expect(() => loadConfig({ ...VALID_ENV, WEB_ORIGIN: 'file:///etc/passwd' })).toThrowError(
      'invalid server configuration — check: WEB_ORIGIN',
    );
  });

  /**
   * The same bound on `BETTER_AUTH_URL`, which has carried it since Plan 4
   * Task 2 and is the origin better-auth signs magic links and OAuth
   * `redirect_uri`s from. Its own test, not an extra assertion in the one
   * above, so a regression names which variable came loose.
   */
  it('planted defect: a BETTER_AUTH_URL without an http(s) scheme and a host is refused with the variable named', () => {
    expect(() => loadConfig({ ...VALID_ENV, BETTER_AUTH_URL: 'localhost:3000' })).toThrowError(
      'invalid server configuration — check: BETTER_AUTH_URL',
    );
    expect(loadConfig({ ...VALID_ENV, BETTER_AUTH_URL: 'https://pm-api.artsourced.in' }).betterAuthUrl).toBe(
      'https://pm-api.artsourced.in',
    );
  });

  /**
   * `.env.example` tells an operator to copy it and adjust. This proves that
   * doing exactly that produces a server that starts.
   *
   * The gap it closes is specific and was real: `pnpm check:env` verifies every
   * variable code READS is documented, which is a presence check — it has no
   * opinion about the values. So `BETTER_AUTH_SECRET=change-me` sat in the file
   * as a documented, gate-approved, boot-failing value, nine characters against
   * a 32-character floor, and the operator following the instruction met
   * `ConfigError` with nothing saying length was the reason. Presence and
   * validity are different properties and now each has its own check.
   */
  it('the values documented in .env.example actually satisfy the schema', () => {
    const path = fileURLToPath(new URL('../../../.env.example', import.meta.url));
    const raw = readFileSync(path, 'utf8');
    const documented = parseEnvExample(raw);

    // Guard against the check going quiet: if the parser stops finding the live
    // variables, this test would pass on an empty object and prove nothing.
    for (const key of [
      'DATABASE_URL',
      'PORT',
      'HOST',
      'LOG_LEVEL',
      'BETTER_AUTH_URL',
      'BETTER_AUTH_SECRET',
      'WEB_ORIGIN',
      'SNAPSHOT_INTERVAL_MS',
      'SNAPSHOT_MIN_EVENTS',
      // Plan 11 Task 1's variables that carry a VALUE in .env.example.
      'TRUST_PROXY',
      'RATE_LIMIT_AUTH_MAX',
      'RATE_LIMIT_EVENTS_MAX',
      'RATE_LIMIT_WINDOW_SEC',
      'SMTP_URL',
      'MAGIC_LINK_FROM',
      'DEPLOY_SHA',
    ]) {
      expect(documented, `.env.example should document ${key}`).toHaveProperty(key);
    }

    // `ALERT_WEBHOOK_URL` and `DATABASE_CA_CERT` are documented EMPTY on
    // purpose — empty is their meaningful production-optional value — and
    // `parseEnvExample` drops empty values, so they can never appear in
    // `documented` and the loop above cannot cover them. Asserted against the
    // raw file instead, which is the only place the fact lives. Without this,
    // deleting either line from `.env.example` would be invisible here.
    for (const key of ['ALERT_WEBHOOK_URL', 'DATABASE_CA_CERT', 'INVITE_FROM']) {
      expect(raw, `.env.example should document ${key}`).toMatch(new RegExp(`^${key}=`, 'm'));
    }

    expect(() => loadConfig(documented)).not.toThrow();
    expect(loadConfig(documented).betterAuthSecret.length).toBeGreaterThanOrEqual(32);
  });
});

/**
 * Plan 11 Task 1 — the deployment knobs. Nine variables `.env.example` had
 * documented ahead of their reader; this is the reader arriving.
 *
 * The DEFAULTS are asserted by the exact-shape `toEqual` at the top of this
 * file rather than repeated here, because that assertion is the one that also
 * fails when a field appears without anyone deciding it should. What lives
 * below is what that assertion cannot say: that overrides are read, and that
 * every one of these refuses a malformed value by NAME instead of coercing it.
 */
describe('loadConfig — the deployment surface', () => {
  /**
   * 13.105 — the nine deployment env vars plus `DEPLOY_SHA`, each parsed when the environment sets one — and each refused BY NAME when malformed, in the tests below.
   */
  it('reads every deployment knob when the environment sets one', () => {
    const config = loadConfig({
      ...VALID_ENV,
      TRUST_PROXY: 'true',
      RATE_LIMIT_AUTH_MAX: '60',
      RATE_LIMIT_EVENTS_MAX: '600',
      RATE_LIMIT_WINDOW_SEC: '30',
      ALERT_WEBHOOK_URL: 'https://hooks.example/T/B',
      SMTP_URL: 'smtp://mailpit:1025',
      MAGIC_LINK_FROM: 'hello@gisik.example',
      DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
      DEPLOY_SHA: '9a5275c',
    });
    expect(config.trustProxy).toBe(true);
    expect(config.rateLimitAuthMax).toBe(60);
    expect(config.rateLimitEventsMax).toBe(600);
    expect(config.rateLimitWindowSec).toBe(30);
    expect(config.alertWebhookUrl).toBe('https://hooks.example/T/B');
    expect(config.smtpUrl).toBe('smtp://mailpit:1025');
    expect(config.magicLinkFrom).toBe('hello@gisik.example');
    expect(config.databaseCaCert).toContain('BEGIN CERTIFICATE');
    expect(config.deploySha).toBe('9a5275c');
  });

  /**
   * An empty string is what a hosting platform hands a process for a variable
   * its spec declares without a value — `ALERT_WEBHOOK_URL=` is exactly how
   * `.env.example` documents "no webhook". If `''` were read as a VALUE, every
   * one of these would refuse an ordinary deploy. Asserted for all nine at
   * once because the mistake, if it is made, is made in one helper.
   */
  /**
   * 13.106 — an empty string reads as UNSET and falls back to the documented default, which is what a deploy spec actually hands over. Note `WEB_ORIGIN` is deliberately NOT among them and throws instead.
   */
  it('reads an empty string as UNSET, not as a malformed value — that is what a deploy spec hands over', () => {
    const config = loadConfig({
      ...VALID_ENV,
      TRUST_PROXY: '',
      RATE_LIMIT_AUTH_MAX: '',
      RATE_LIMIT_EVENTS_MAX: '',
      RATE_LIMIT_WINDOW_SEC: '',
      ALERT_WEBHOOK_URL: '',
      SMTP_URL: '',
      MAGIC_LINK_FROM: '',
      DATABASE_CA_CERT: '',
      DEPLOY_SHA: '',
    });
    expect(config.trustProxy).toBe(false);
    expect(config.rateLimitAuthMax).toBe(10);
    expect(config.rateLimitEventsMax).toBe(120);
    expect(config.rateLimitWindowSec).toBe(60);
    expect(config.alertWebhookUrl).toBeNull();
    expect(config.smtpUrl).toBeNull();
    expect(config.magicLinkFrom).toBe('sign-in@gisik-nokma.local');
    expect(config.databaseCaCert).toBeNull();
    expect(config.deploySha).toBe('dev');
  });

  /**
   * `z.coerce.boolean()` is JS truthiness: it turns ANY non-empty string into
   * `true`, including the string `'false'` — the one spelling an operator is
   * most likely to write for "off". So the schema uses an enum, and this test
   * is the proof, not the docblock: `'false'` must come back false, and `'yes'`
   * must be refused rather than silently accepted as on.
   *
   * It matters because trusting `X-Forwarded-*` from an untrusted hop lets a
   * caller choose its own source IP, and the rate limiter and the audit trail
   * both believe it.
   */
  /**
   * 13.107 — planted defect: `TRUST_PROXY` takes only the literal `'true'`/`'false'` — `'yes'` is refused by name rather than coerced by truthiness.
   */
  it("planted defect: TRUST_PROXY takes only 'true'/'false' — 'false' is FALSE, and 'yes' is refused by name", () => {
    expect(loadConfig({ ...VALID_ENV, TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(loadConfig({ ...VALID_ENV, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(() => loadConfig({ ...VALID_ENV, TRUST_PROXY: 'yes' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ...VALID_ENV, TRUST_PROXY: 'yes' })).toThrowError(
      'invalid server configuration — check: TRUST_PROXY',
    );
    expect(() => loadConfig({ ...VALID_ENV, TRUST_PROXY: '1' })).toThrowError(
      'invalid server configuration — check: TRUST_PROXY',
    );
  });

  /**
   * Each of the three named separately, because "a rate limit is refused" is
   * satisfied by one of them working. A zero max refuses every request on the
   * limited routes; a zero window is a division by zero in any limiter that
   * computes a rate.
   */
  /**
   * 13.108 — planted defect: a rate-limit var that is non-integer, zero, negative or fractional is refused with its own name.
   */
  it('planted defect: a non-integer or non-positive rate limit is refused with the variable named', () => {
    expect(() => loadConfig({ ...VALID_ENV, RATE_LIMIT_AUTH_MAX: 'lots' })).toThrowError(ConfigError);
    expect(() => loadConfig({ ...VALID_ENV, RATE_LIMIT_AUTH_MAX: 'lots' })).toThrowError(
      'invalid server configuration — check: RATE_LIMIT_AUTH_MAX',
    );
    expect(() => loadConfig({ ...VALID_ENV, RATE_LIMIT_AUTH_MAX: '0' })).toThrowError(
      'invalid server configuration — check: RATE_LIMIT_AUTH_MAX',
    );
    expect(() => loadConfig({ ...VALID_ENV, RATE_LIMIT_EVENTS_MAX: '-1' })).toThrowError(
      'invalid server configuration — check: RATE_LIMIT_EVENTS_MAX',
    );
    expect(() => loadConfig({ ...VALID_ENV, RATE_LIMIT_WINDOW_SEC: '2.5' })).toThrowError(
      'invalid server configuration — check: RATE_LIMIT_WINDOW_SEC',
    );
  });

  /**
   * The four value-shaped optionals. Each is a string that LOOKS configured
   * and fails somewhere far from here: a webhook that never posts, a transport
   * that throws while a user waits for a sign-in link, a From address the
   * server rejects at send, a CA that produces an opaque TLS handshake error
   * on the first query. Boot-time refusal naming the variable is cheaper than
   * every one of those.
   */
  /**
   * 13.109 — planted defect: `ALERT_WEBHOOK_URL` and `SMTP_URL` are scheme-DISCRIMINATED against each other — an http URL rejected as SMTP and vice versa, not merely "any string fails".
   */
  it('planted defect: a malformed ALERT_WEBHOOK_URL, SMTP_URL, MAGIC_LINK_FROM or DATABASE_CA_CERT is refused with the variable named', () => {
    expect(() => loadConfig({ ...VALID_ENV, ALERT_WEBHOOK_URL: 'hooks.example/T/B' })).toThrowError(
      'invalid server configuration — check: ALERT_WEBHOOK_URL',
    );
    // A URL by the parser's standards, and still not a webhook.
    expect(() => loadConfig({ ...VALID_ENV, ALERT_WEBHOOK_URL: 'smtp://localhost:1025' })).toThrowError(
      'invalid server configuration — check: ALERT_WEBHOOK_URL',
    );
    expect(() => loadConfig({ ...VALID_ENV, SMTP_URL: 'localhost:1025' })).toThrowError(
      'invalid server configuration — check: SMTP_URL',
    );
    // The mirror of the case above: an http URL is not an SMTP transport.
    expect(() => loadConfig({ ...VALID_ENV, SMTP_URL: 'http://localhost:1025' })).toThrowError(
      'invalid server configuration — check: SMTP_URL',
    );
    expect(() => loadConfig({ ...VALID_ENV, MAGIC_LINK_FROM: 'sign-in-at-example' })).toThrowError(
      'invalid server configuration — check: MAGIC_LINK_FROM',
    );
    expect(() => loadConfig({ ...VALID_ENV, DATABASE_CA_CERT: 'not-a-certificate' })).toThrowError(
      'invalid server configuration — check: DATABASE_CA_CERT',
    );
  });
});

/**
 * `createPool`'s TLS parameter (Plan 11 Task 1). It lives in this file rather
 * than beside the pool because what it proves is a CONFIG fact — that
 * `DATABASE_CA_CERT` reaches the driver — and because these two assertions and
 * the schema they depend on should redden together.
 *
 * Neither test opens a connection: `new pg.Pool()` stores its options and
 * connects lazily, on the first `query`/`connect`, which is why this stays in
 * the database-free half of the suite. `new pg.Client()` is likewise inert —
 * it computes its connection parameters in the constructor and connects only
 * on `connect()`.
 *
 * ## Why these read `connectionParameters` and not `pool.options`
 *
 * `pool.options` is the object HANDED to the constructor. It is not what a
 * client connects with: `pg` applies the parsed connection string ON TOP of it
 * (pg 8.23.0, lib/connection-parameters.js:60,
 * `Object.assign({}, config, parse(config.connectionString))`), so a URL
 * carrying any of `ssl`, `sslmode`, `sslnegotiation`, `sslcert`, `sslkey` or
 * `sslrootcert` REPLACES the caller's `ssl` outright.
 *
 * An earlier version of these tests asserted `pool.options.ssl.ca` against a
 * URL with no query string. It passed while the CA was being discarded for
 * every managed-Postgres URL in existence — every one of them ends in
 * `?sslmode=require` — because it asked the wrong object a question whose
 * answer could not change. Reading `connectionParameters` is the whole point:
 * it is the value the driver actually uses.
 */
describe('createPool TLS', () => {
  const URL_ = 'postgres://gisik:gisik@localhost:54329/gisik_nokma';
  // The shape every managed provider hands out; DigitalOcean's ends exactly so.
  const MANAGED_URL = 'postgres://doadmin:sEcr%2Bet@db-pg-blr1.k.db.ondigitalocean.com:25060/defaultdb?sslmode=require';

  /**
   * What the driver will really connect with, as opposed to what it was handed.
   *
   * `connectionParameters` is a genuine property of a `pg.Client` — the
   * constructor assigns it (pg 8.23.0, lib/client.js:54) — but `@types/pg`
   * 8.23.1 does not declare it, so it can only be reached through a cast. The
   * cast asserts as little as it can get away with: just the fields these
   * tests read, and `ssl` as `unknown` because its shape is the very thing
   * under test and a friendlier type here would be a claim, not a check.
   */
  interface EffectiveConnection {
    ssl: unknown;
    options?: string;
    user?: string;
    password?: string;
    database?: string;
    host?: string;
    port?: number;
    application_name?: string;
  }

  const connectionFor = (config: pg.ClientConfig): EffectiveConnection =>
    (new pg.Client(config) as unknown as { connectionParameters: EffectiveConnection })
      .connectionParameters;

  const effective = (pool: Pool): EffectiveConnection => connectionFor(pool.options);

  it('carries the CA into the connection the driver actually makes', async () => {
    const pool = createPool(URL_, { caCert: 'PEM' });
    expect((effective(pool).ssl as { ca: string }).ca).toBe('PEM');
    // The timezone startup parameter must SURVIVE the addition — `ssl` sits
    // beside it, and an edit that replaced the object would be silent
    // otherwise (every stored timestamptz is unchanged; only what an ad-hoc
    // query PRINTS would quietly move off India time).
    expect(effective(pool).options).toBe('-c timezone=Asia/Kolkata');
    await pool.end();
  });

  /**
   * 13.110 — the regression pin: a CA cert reaches the real driver through a `?sslmode=require` managed-Postgres-shaped URL. This fails on the code that shipped before it.
   */
  it('carries the CA even when the URL carries an sslmode — the managed-Postgres case', async () => {
    const pool = createPool(MANAGED_URL, { caCert: 'PEM' });
    // Before the ssl parameters were stripped this was `{}`: the parsed
    // connection string overwrote `ssl: { ca }` and the CA never reached the
    // driver. This is the regression pin — it fails on the code that shipped.
    expect((effective(pool).ssl as { ca: string }).ca).toBe('PEM');
    expect(effective(pool).options).toBe('-c timezone=Asia/Kolkata');
    await pool.end();
  });

  /**
   * 13.111 — rewriting the connection string for TLS preserves user, password, host, port and database BYTE-FOR-BYTE — nothing but `ssl` changes.
   */
  it('changes nothing but ssl when it rewrites the URL', async () => {
    // Stripping query parameters re-serializes the URL, so everything that
    // identifies the database has to be shown to survive it — a rewrite that
    // dropped a password character would fail as an auth error at T15, far
    // from here.
    const before = connectionFor({ connectionString: MANAGED_URL });
    const pool = createPool(MANAGED_URL, { caCert: 'PEM' });
    const after = effective(pool);
    expect({
      user: after.user,
      password: after.password,
      database: after.database,
      host: after.host,
      port: after.port,
    }).toEqual({
      user: before.user,
      password: before.password,
      database: before.database,
      host: before.host,
      port: before.port,
    });
    // Spelled out as a literal too, so this cannot pass by both sides being
    // equally wrong: the `%2B` is a real plus in the password.
    expect(after.password).toBe('sEcr+et');
    expect(after.host).toBe('db-pg-blr1.k.db.ondigitalocean.com');
    expect(after.port).toBe(25060);
    expect(after.database).toBe('defaultdb');
    await pool.end();
  });

  it('keeps the non-ssl query parameters, decoded value for decoded value', async () => {
    // `URLSearchParams` re-serialization writes a space as `+`. The parser that
    // reads the query string decodes `+` back to a space, so the DECODED value
    // is unchanged — asserted here rather than assumed, because if that ever
    // stops holding, a startup parameter changes meaning silently.
    const url = `${MANAGED_URL}&application_name=gisik%20server&options=-c%20statement_timeout%3D5000`;
    const pool = createPool(url, { caCert: 'PEM' });
    const after = effective(pool);
    expect(after.application_name).toBe('gisik server');
    // The URL's own `options` wins over the pool's timezone — pg applies the
    // connection string on top. Asserted as the measured fact it is, so this
    // test tells the truth about what a DATABASE_URL can do rather than
    // implying the timezone is safe from it.
    expect(after.options).toBe('-c statement_timeout=5000');
    await pool.end();
  });

  it('accepts a connection string a URL parser would reject, when it carries no ssl', async () => {
    // A bare socket path is a valid pg connection string — pg reads it as the
    // host — and `new URL()` throws TypeError on it. Rewriting is therefore
    // gated on an ssl parameter actually being present, so this reaches the
    // driver untouched with the CA attached rather than dying at boot.
    const pool = createPool('/var/run/postgresql', { caCert: 'PEM' });
    expect(pool.options.connectionString).toBe('/var/run/postgresql');
    expect((effective(pool).ssl as { ca: string }).ca).toBe('PEM');
    expect(effective(pool).host).toBe('/var/run/postgresql');
    await pool.end();
  });

  /**
   * 13.113 — an unparseable connection string that ALSO carries an ssl parameter is refused by name, rather than silently discarding the CA.
   */
  it('refuses, by name, a URL it cannot rewrite but must', () => {
    // Carries an ssl parameter AND cannot be parsed: passing it through would
    // silently hand ssl back to the connection string and drop the CA, which is
    // the whole defect. It raises instead, naming both variables.
    expect(() => createPool('/var/run/postgresql?sslmode=require', { caCert: 'PEM' })).toThrow(
      /DATABASE_URL carries an ssl query parameter.*DATABASE_CA_CERT/s,
    );
  });

  it('leaves ssl unset and the URL untouched without a CA', async () => {
    const pool = createPool(URL_);
    expect(pool.options.ssl).toBeUndefined();
    expect(pool.options.options).toBe('-c timezone=Asia/Kolkata');
    await pool.end();
  });

  it('does not rewrite the URL when there is no CA to protect', async () => {
    // The no-CA path must be byte-identical to what every other call site had
    // before this parameter existed, so the URL's own ssl config still decides.
    const pool = createPool(MANAGED_URL);
    expect(pool.options.connectionString).toBe(MANAGED_URL);
    expect(effective(pool).ssl).toEqual({});
    await pool.end();
  });
});

/**
 * A deliberately small `.env.example` reader: `KEY=value`, `#` comments, and a
 * trailing `# …` note stripped off a value. It is not a dotenv implementation —
 * no quoting, no escapes, no multi-line values — because `.env.example` uses
 * none of those, and a parser that handled more would be untested surface.
 */
function parseEnvExample(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).split('#')[0]?.trim() ?? '';
    if (value !== '') env[key] = value;
  }
  return env;
}
