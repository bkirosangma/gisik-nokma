import type { FastifyInstance } from 'fastify';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { type SecurityOptions, buildApp, type AppDeps } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import type { ObjectStore } from '../../src/attachments/object-store.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import type { ErrorAlerter } from '../../src/alerts/error-alerter.js';
import type { InviteMailer } from '../../src/invites/invite-mailer.js';
import type { Queryable } from '../../src/db/queryable.js';
import type { ProjectionRegistry } from '../../src/projections/registry.js';
import type { TestDatabase } from './db.js';

/** The `WEB_ORIGIN` every test app mints invitation links against. */
export const TEST_WEB_ORIGIN = 'http://localhost:3001';

export type TestApp = {
  app: FastifyInstance;
  /** The OTP sender THIS app issues codes through — `signInWithPhone` reads it. */
  otp: LogOtpSender;
  /**
   * The magic-link sender THIS app delivers through — `signInWithEmail` reads
   * it. Returned for the same reason `otp` is: it belongs to the app instance
   * that sent the link, and a shared one would hand a test a link a different
   * server minted.
   *
   * It is the ONLY way to get a caller with a VERIFIED email in a test, which
   * Task 17's caller-scoped invitations read requires. `signInWithPhone` cannot
   * produce one: better-auth's phone plugin mints a synthetic address at
   * `phone.gisik-nokma.invalid` and never touches `emailVerified`, while the
   * magic-link plugin creates its user with `emailVerified: true`.
   */
  magic: LogMagicLinkSender;
  /** The full, UNGATED ingest service, for tests that need the internal door. */
  ingest: IngestService;
};

/**
 * The one thing a caller may swap, and the reason it is a parameter rather than
 * a fifth hand-assembled copy of this function.
 *
 * `workspace-bootstrap-failure.test.ts` needs an ingest whose projection set
 * contains one that FAILS partway through the founding sequence — there is no
 * other way to observe what a half-landed bootstrap actually does to the HTTP
 * caller, and reasoning about it from the absence of a `try/catch` is an
 * inference rather than an observation. Everything else stays the real thing:
 * the real `buildApp`, the real auth, the real gated ingest.
 */
export type BuildTestAppOverrides = {
  /** `AppDeps.mcpPublicUrl` — the hosted MCP door's switch. Unset = the door is not built. */
  mcpPublicUrl?: string;
  /**
   * Turns the app's logger ON and captures what it writes. Off by default, as
   * every other test file expects; `invites.test.ts` uses it to OBSERVE that
   * the invitation token is redacted out of the request log rather than
   * inferring it from the serializer's source.
   */
  logStream?: NodeJS.WritableStream;
  /**
   * Replaces `buildProjectionRegistry()`. A caller that passes this owns
   * registering the real projections it still wants — the default is NOT merged
   * in, because a silent merge would make "the registry under test" and "the
   * registry that ships" differ in a way no test could name.
   */
  projections?: ProjectionRegistry;
  /**
   * Freezes the clock the ATTENTION strip computes against (`AppDeps.now`).
   * Off by default, so an app built here reads the real clock exactly as the
   * shipped one does; `read-app.ts` pins it to `SCENARIO_NOW` because that world
   * is seeded with instants measured from it.
   */
  now?: () => Date;
  /**
   * `AppDeps.stream` — the heartbeat interval, the per-user connection budget,
   * and the two seams (`schedule`, `onHeartbeat`) that let a test drive the
   * heartbeat instead of waiting on one. Off by default, so an app built here
   * heartbeats on a real `setInterval` exactly as the shipped one does;
   * `stream-route.test.ts` builds its own app with all four, because the shared
   * read world's clock is FROZEN and a deadline measured against a constant
   * never expires.
   */
  stream?: AppDeps['stream'];
  /**
   * Replaces `AppDeps.pool` — the handle every read, permission and stream
   * membership check goes through — and NOTHING else. `db`, the auth instance
   * and the ingest service keep the real pool, so a wrapper passed here can
   * observe, delay or fail a READ without breaking a commit or a sign-in.
   *
   * Written for 7.160 and 7.162, which need the membership round trip inside
   * `handleMessage` to be a thing the test controls: one needs it still
   * suspended at a moment the test chooses (the close-during-subscribe race is
   * otherwise decided by whether Postgres or a TCP close handshake wins, which
   * is not a fact a suite may rest on), and the other needs it to THROW, which
   * is the only way the route's server-fault path executes at all.
   */
  pool?: Queryable;
  /**
   * `AppDeps.store` — where `POST /v1/attachments` puts the bytes.
   *
   * Defaults to `createObjectStoreFromEnv({})`, which is a `LocalDiskStore`
   * rooted at the relative path `var/attachments`. That default is fine for
   * every caller that never uploads anything (the constructor touches no
   * filesystem; every `fs` call is inside `put`/`getStream`/`delete`) and is
   * exactly WRONG for one that does: a completed upload would write into the
   * repository working tree, which is not gitignored, and leave it there for
   * the next run and the next `git status`. So a test that actually uploads
   * passes a `LocalDiskStore` over an `mkdtemp` directory it removes itself —
   * `attachments-wired.test.ts` is the one that does.
   */
  store?: ObjectStore;
  /**
   * `AppDeps.security` — the deployment security surface.
   *
   * Widened 2026-09-07 for the HSTS wiring test, which cannot be written
   * without it: the header is emitted only for an https request, and
   * `request.protocol` reports https only when Fastify was CONSTRUCTED with
   * `trustProxy` and the caller sends `x-forwarded-proto`. `trustProxy` is a
   * constructor option, so no per-request header can substitute for it and no
   * test could otherwise reach the branch that matters.
   *
   * Undefaulted, so every existing caller keeps `trustProxy: false` — which is
   * the honest default and the one under which the HSTS hook must stay silent.
   */
  security?: SecurityOptions;
  /** Where invitation letters go (`AppDeps.inviteMailer`); absent is a silent log mailer. */
  inviteMailer?: InviteMailer;
  /** The error alerter (`BuildAppOptions.alerter`); absent is the no-op one. */
  alerter?: ErrorAlerter;
};

/**
 * One assembled server for route tests: the real `buildApp`, the real auth, the
 * real ingest service over the real projection registry. Nothing is stubbed, so
 * a test built on it exercises the routes as they ship.
 *
 * A shared helper rather than a per-file copy of `events-route.test.ts`'s
 * `buildServer()`, because the copies drift: the same assembly now appears in
 * four files and every new route registered in `buildApp` has to be reachable
 * from all of them. Later Plan 10 tasks (`registerSyncRoutes`, Tasks 6/7)
 * extend `buildApp` and therefore extend this helper for free.
 *
 * The OTP sender is returned rather than kept module-scoped: it belongs to the
 * app instance that issued the code, and a shared one would hand a test a code
 * a different server sent.
 *
 * `ingest` is the FULL `IngestService`, which the app itself never gets —
 * `AppDeps.ingest` is narrowed to `ClientIngest` so no route can reach the
 * internal append path. A test may legitimately need that door (it is how the
 * server's own appends reach the ledger), so it is handed back here, once,
 * beside the app rather than reassembled with different dependencies.
 */
export function buildTestApp(
  db: TestDatabase,
  overrides: BuildTestAppOverrides = {},
): TestApp {
  const otp = new LogOtpSender(() => {});
  const magic = new LogMagicLinkSender(() => {});
  const auth = createAuth({
    pool: db.pool,
    otpSender: otp,
    magicLinkSender: magic,
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-not-used-anywhere-real',
    // The browser's origin, so better-auth trusts the product's own client.
    webOrigin: 'http://localhost:3001',
  });
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: overrides.projections ?? buildProjectionRegistry(),
  });
  const app = buildApp(
    {
      db: db.pool,
      pool: overrides.pool ?? db.pool,
      ingest,
      auth,
      // The internal door as a named capability, exactly as `src/index.ts`
      // passes it: `ingest` reaches the app narrowed to `ClientIngest`, so this
      // is the only route into `ingestBatch` any handler has.
      serverAppend: (events) => ingest.ingestBatch(events),
      webOrigin: TEST_WEB_ORIGIN,
      mcpPublicUrl: overrides.mcpPublicUrl,
      inviteMailer: overrides.inviteMailer,
      // Undefaulted: `registerAttentionRoutes` owns the real-clock default, and
      // passing `undefined` here is what lets it.
      now: overrides.now,
      stream: overrides.stream,
      // Defaulted HERE rather than left to `buildApp`, because `AppDeps.store`
      // is required and deliberately so — see its docblock. This helper owns
      // the cheap honest default for the ~sixty test files that never upload.
      store: overrides.store ?? createObjectStoreFromEnv({}),
    },
    overrides.logStream === undefined
      ? { security: overrides.security, alerter: overrides.alerter }
      : { logLevel: 'info', logStream: overrides.logStream, security: overrides.security, alerter: overrides.alerter },
  );
  return { app, otp, magic, ingest };
}
