import type { FastifyInstance } from 'fastify';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import type { ProjectionRegistry } from '../../src/projections/registry.js';
import type { TestDatabase } from './db.js';

/** The `WEB_ORIGIN` every test app mints invitation links against. */
export const TEST_WEB_ORIGIN = 'http://localhost:3001';

export type TestApp = {
  app: FastifyInstance;
  /** The OTP sender THIS app issues codes through — `signInWithPhone` reads it. */
  otp: LogOtpSender;
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
  const auth = createAuth({
    pool: db.pool,
    otpSender: otp,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-not-used-anywhere-real',
  });
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: overrides.projections ?? buildProjectionRegistry(),
  });
  const app = buildApp(
    {
      db: db.pool,
      pool: db.pool,
      ingest,
      auth,
      // The internal door as a named capability, exactly as `src/index.ts`
      // passes it: `ingest` reaches the app narrowed to `ClientIngest`, so this
      // is the only route into `ingestBatch` any handler has.
      serverAppend: (events) => ingest.ingestBatch(events),
      webOrigin: TEST_WEB_ORIGIN,
      // Undefaulted: `registerAttentionRoutes` owns the real-clock default, and
      // passing `undefined` here is what lets it.
      now: overrides.now,
    },
    overrides.logStream === undefined ? {} : { logLevel: 'info', logStream: overrides.logStream },
  );
  return { app, otp, ingest };
}
