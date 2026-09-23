import { z } from 'zod';

/**
 * `''` MEANS UNSET, everywhere in this schema.
 *
 * Not a convenience: it is what a hosting platform actually hands a process.
 * App Platform's spec lists every variable a component declares, and one left
 * without a value arrives as an empty string rather than as an absent key. A
 * schema that read `''` as a VALUE would refuse an ordinary deploy —
 * `ALERT_WEBHOOK_URL=` is precisely how `.env.example` documents "no webhook" —
 * so the emptiness is normalised to `undefined` before the inner schema, which
 * is where `.default()` and `.optional()` already live.
 *
 * `z.preprocess` keeps the issue path on the OBJECT KEY, so a refusal still
 * names the variable. Measured, not assumed: an empty `TRUST_PROXY` parses to
 * the default, and a `TRUST_PROXY=yes` still fails with `path: ['TRUST_PROXY']`.
 */
function unsetWhenEmpty<T extends z.ZodTypeAny>(inner: T): z.ZodEffects<T, T['_output'], unknown> {
  return z.preprocess((value) => (value === '' ? undefined : value), inner);
}

/**
 * An http(s) URL WITH A HOST — the bound `z.string().url()` does not carry.
 *
 * `.url()` delegates to the WHATWG parser, which asks only for a scheme. So
 * `localhost:3001` PASSED it: the parser reads `localhost:` as the scheme and
 * `3001` as the path. That was measured and recorded as a known absence in
 * `config.test.ts` ("*Absence, owner Plan 11: neither variable is constrained
 * to an http(s) scheme with a host*") — and it is not a cosmetic one. A
 * `WEB_ORIGIN` of `localhost:3001` mints invitation links reading
 * `localhost:3001/invite/<token>`: a URL nobody can follow, with the
 * single-use credential already spent on it and no way to get it back. Plan 11
 * closes it (test case 6.124), for `WEB_ORIGIN` and for `BETTER_AUTH_URL`,
 * which has had the same bound since Plan 4 Task 2 and mints OAuth
 * `redirect_uri`s and magic links from it.
 *
 * Scheme AND host, and deliberately NOT "and no path": a legitimate
 * `http://localhost:3001` already has `pathname === '/'`, so a naive
 * no-path rule would refuse the value every dev environment uses.
 */
function httpUrl(): z.ZodEffects<z.ZodString, string, string> {
  return z
    .string()
    .url()
    .refine(
      (value) => {
        let parsed: URL;
        try {
          parsed = new URL(value);
        } catch {
          return false;
        }
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname !== '';
      },
      { message: 'must be an http(s) URL with a host, e.g. https://pm.artsourced.in' },
    );
}

/**
 * An SMTP URL. Same reasoning as `httpUrl`, one scheme along: a `SMTP_URL`
 * that parses as a URL but is not an SMTP one produces a transport that fails
 * at send time, which is the moment a user is waiting for a sign-in link. A
 * boot-time refusal naming the variable is the cheaper failure.
 */
function smtpUrl(): z.ZodEffects<z.ZodString, string, string> {
  return z
    .string()
    .url()
    .refine(
      (value) => {
        let parsed: URL;
        try {
          parsed = new URL(value);
        } catch {
          return false;
        }
        return (parsed.protocol === 'smtp:' || parsed.protocol === 'smtps:') && parsed.hostname !== '';
      },
      { message: 'must be an smtp(s) URL with a host, e.g. smtp://localhost:1025' },
    );
}

/**
 * A PEM certificate, checked only for its envelope. The alternative is an
 * opaque TLS handshake failure on the first query against managed Postgres,
 * long after the process reported itself started.
 */
function pemCertificate(): z.ZodEffects<z.ZodString, string, string> {
  return z
    .string()
    .refine((value) => value.includes('-----BEGIN CERTIFICATE-----'), {
      message: 'must be a PEM certificate containing -----BEGIN CERTIFICATE-----',
    });
}

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /**
   * Where this server is reachable. better-auth signs magic links and OAuth
   * redirect_uris from it, so a wrong value produces links that go somewhere
   * else — and passing it explicitly is what stops better-auth from ever
   * deriving an origin from an attacker-supplied Host header.
   *
   * `httpUrl()`, not `z.string().url()`, since Plan 11 Task 1: see that
   * helper for why a scheme alone was not enough.
   */
  BETTER_AUTH_URL: httpUrl(),
  /**
   * The key every session cookie and bearer token is signed with. Required with
   * NO default: the plan's own sketch reached for `?? 'dev-only-secret-change-me'`
   * here, which would let a production deploy boot happily on a signing key
   * printed in the repository — anyone could then mint a session for any user.
   * A missing variable must stop the server, and `loadConfig` already names it.
   *
   * 32 is better-auth's own threshold, not one invented here: below it the
   * library logs *"your BETTER_AUTH_SECRET should be at least 32 characters long
   * for adequate security"* (`context/create-context.mjs`) and starts anyway.
   * A warning nobody reads is not a control, so it is refused instead.
   */
  BETTER_AUTH_SECRET: z.string().min(32),
  /**
   * Where the product's web client lives. It is the HOST OF EVERY INVITATION
   * LINK this server mints (`routes/invites.ts`), so a wrong value produces
   * links that go somewhere else and an absent one produces links to
   * `undefined/invite/<token>` — with the credential already spent on a URL
   * nobody can follow, and no way to get it back.
   *
   * Required with NO default, for that reason. `.env.example` has documented it
   * since Plan 11's section was written ahead of its reader; Plan 4 Task 14 is
   * the reader arriving, so it moves into the LIVE set there in the same change.
   *
   * `httpUrl()` since Plan 11 Task 1: `z.string().url()` accepted
   * `localhost:3001`, which is exactly the value that mints the unfollowable
   * link this docblock describes. See the helper.
   */
  WEB_ORIGIN: httpUrl(),
  /**
   * How often the snapshot writer sweeps for tickets whose replay has grown
   * past the threshold, and how far past it a ticket must be to earn a
   * snapshot (Plan 10 Task 5). Both are `.positive()`, and on the interval that
   * is not decoration: `setInterval(fn, 0)` runs the pass on every tick of the
   * event loop, and the pass opens a pool connection and folds every due
   * entity — a zero here would spend the server on itself. A zero MIN_EVENTS
   * makes every ticket due on every pass, which then recomputes a snapshot at a
   * seq that already has a row and collides on the snapshots primary key; the
   * writer guards that path for its programmatic callers, but the environment
   * cannot reach it at all.
   *
   * Neither is a correctness knob. Snapshots bound replay COST; a server that
   * never writes one still answers with exactly the same state, only slower —
   * which is why these carry defaults and `DATABASE_URL` does not.
   */
  SNAPSHOT_INTERVAL_MS: z.coerce.number().int().positive().default(300000),
  SNAPSHOT_MIN_EVENTS: z.coerce.number().int().positive().default(20),

  // ── The embedding worker (notes series, Plan 3 of 6) ─────────────────────
  //
  // The second background loop this server owns, and the same kind of knob as
  // the pair above: neither is a correctness setting. The worker is also the
  // backfill and the re-index after a model change, and both of those happen
  // whether or not a commit ever nudges it — a longer interval only makes them
  // later.
  //
  // `EMBED_WORKER_ENABLED` exists for the operator who needs to stop embedding
  // WITHOUT stopping the server: the model is 130 MB resident (measured, case
  // 18.129: Δ 274.8 MB on first use), and a box that is short on memory must be
  // able to serve the rest of the product while somebody decides what to do
  // about it. Search keeps answering lexically; only `mode=meaning` goes stale.
  EMBED_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
  EMBED_WORKER_ENABLED: z.enum(['true', 'false']).default('true'),

  // ── Deployment surface (Plan 11 Task 1) ──────────────────────────────────
  //
  // Nine variables `.env.example` has documented ahead of their reader since
  // Plan 11's section was written. This task is the READER arriving: from here
  // they are parsed, defaulted and REFUSED at boot with the variable named.
  //
  // What that does and does not claim. `DATABASE_CA_CERT` and `DEPLOY_SHA` get
  // real consumers in this same change (`createPool`'s TLS, `/healthz`'s
  // answer). The other seven are validated here and consumed by later tasks —
  // rate limiting, the SMTP magic-link sender, the alert webhook, the proxy
  // trust setting. Validating a knob early is honest (a typo fails at boot
  // rather than at first use); pretending the knob does something is not, so
  // `.env.example` says per-variable which task turns it on.

  /**
   * Whether to trust `X-Forwarded-*`. `z.enum`, NOT `z.coerce.boolean()`:
   * coercion is JS truthiness, so `TRUST_PROXY=false` would become `true` —
   * the one spelling an operator is most likely to write for "off", read as
   * "on". Trusting a forwarded header from an untrusted hop is how a client
   * picks its own source IP, so the failure mode is a rate limiter and an
   * audit trail believing whatever the caller says.
   */
  TRUST_PROXY: unsetWhenEmpty(z.enum(['true', 'false']).default('false')),

  /**
   * Rate limits: attempts per window, and the window. All three are positive
   * integers with production defaults. A zero max would refuse every request
   * on the limited routes; a zero window is a division by zero in every
   * limiter implementation that computes a rate — both refused at the door
   * rather than discovered in production, exactly as the snapshot knobs above.
   */
  RATE_LIMIT_AUTH_MAX: unsetWhenEmpty(z.coerce.number().int().positive().default(10)),
  RATE_LIMIT_EVENTS_MAX: unsetWhenEmpty(z.coerce.number().int().positive().default(120)),
  RATE_LIMIT_WINDOW_SEC: unsetWhenEmpty(z.coerce.number().int().positive().default(60)),

  /** Where error alerts POST. Optional — absent means no alerting, not a broken deploy. */
  ALERT_WEBHOOK_URL: unsetWhenEmpty(httpUrl().optional()),

  /**
   * The email transport for magic links. Optional: absent keeps the log
   * sender, which is dev-only and says so at its own definition.
   */
  SMTP_URL: unsetWhenEmpty(smtpUrl().optional()),

  /**
   * The From address on sign-in mail. The default is the DEV value and is
   * deliberately a `.local` address: a real production sender belongs in the
   * deploy spec (Task 15), never in a code default, where it would be a
   * live-looking address in a repository nobody had decided to send from.
   */
  MAGIC_LINK_FROM: unsetWhenEmpty(z.string().email().default('sign-in@gisik-nokma.local')),

  /** The CA managed Postgres presents. Optional; PEM. Consumed by `createPool`. */
  DATABASE_CA_CERT: unsetWhenEmpty(pemCertificate().optional()),

  /**
   * The commit this build was made from — the ONE thing `/healthz` discloses
   * beyond up/down (Ruling P33; the reasoning is recorded at the handler).
   *
   * From the ENVIRONMENT, not from `package.json`: the semver in that file
   * moves on release, while what an operator watching a rollout needs to know
   * is which COMMIT is answering. The deploy spec (Task 15) sets it; nothing
   * on App Platform supplies a commit sha on its own, so this is a variable
   * the spec must fill, not one the platform provides.
   *
   * Defaults to `'dev'` rather than to an empty string, so a missing wire-up
   * reads as "this is not a deploy" instead of as a blank nobody notices.
   */
  DEPLOY_SHA: unsetWhenEmpty(z.string().min(1).default('dev')),
});

export type AppConfig = {
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  betterAuthUrl: string;
  betterAuthSecret: string;
  webOrigin: string;
  snapshotIntervalMs: number;
  snapshotMinEvents: number;
  embedWorkerIntervalMs: number;
  embedWorkerEnabled: boolean;
  trustProxy: boolean;
  rateLimitAuthMax: number;
  rateLimitEventsMax: number;
  rateLimitWindowSec: number;
  alertWebhookUrl: string | null;
  smtpUrl: string | null;
  magicLinkFrom: string;
  databaseCaCert: string | null;
  deploySha: string;
};

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string>): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new ConfigError(`invalid server configuration — check: ${variables}`);
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    port: parsed.data.PORT,
    host: parsed.data.HOST,
    logLevel: parsed.data.LOG_LEVEL,
    betterAuthUrl: parsed.data.BETTER_AUTH_URL,
    betterAuthSecret: parsed.data.BETTER_AUTH_SECRET,
    webOrigin: parsed.data.WEB_ORIGIN,
    snapshotIntervalMs: parsed.data.SNAPSHOT_INTERVAL_MS,
    snapshotMinEvents: parsed.data.SNAPSHOT_MIN_EVENTS,
    embedWorkerIntervalMs: parsed.data.EMBED_WORKER_INTERVAL_MS,
    // `'true'`/`'false'` is what the schema accepts, and the boolean is made
    // here once, matching `TRUST_PROXY` above.
    embedWorkerEnabled: parsed.data.EMBED_WORKER_ENABLED === 'true',
    // `'true'`/`'false'` is what the SCHEMA accepts (see TRUST_PROXY above);
    // the boolean is made here, once, so no caller re-parses the string.
    trustProxy: parsed.data.TRUST_PROXY === 'true',
    rateLimitAuthMax: parsed.data.RATE_LIMIT_AUTH_MAX,
    rateLimitEventsMax: parsed.data.RATE_LIMIT_EVENTS_MAX,
    rateLimitWindowSec: parsed.data.RATE_LIMIT_WINDOW_SEC,
    // `?? null`, not `?? undefined`: an absent optional is a VALUE the config
    // states, so a consumer that forgets to handle it fails a type check
    // rather than reading `undefined` and treating it as "not configured yet".
    alertWebhookUrl: parsed.data.ALERT_WEBHOOK_URL ?? null,
    smtpUrl: parsed.data.SMTP_URL ?? null,
    magicLinkFrom: parsed.data.MAGIC_LINK_FROM,
    databaseCaCert: parsed.data.DATABASE_CA_CERT ?? null,
    deploySha: parsed.data.DEPLOY_SHA,
  };
}
