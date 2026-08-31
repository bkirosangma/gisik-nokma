import type { FastifyInstance } from 'fastify';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import type { TestDatabase } from './db.js';

export type TestApp = {
  app: FastifyInstance;
  /** The OTP sender THIS app issues codes through — `signInWithPhone` reads it. */
  otp: LogOtpSender;
  /** The full, UNGATED ingest service, for tests that need the internal door. */
  ingest: IngestService;
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
export function buildTestApp(db: TestDatabase): TestApp {
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
    projections: buildProjectionRegistry(),
  });
  return { app: buildApp({ db: db.pool, pool: db.pool, ingest, auth }), otp, ingest };
}
