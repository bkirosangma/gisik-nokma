import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp } from './app.js';
import { createAuth } from './auth/auth.js';
import { LogMagicLinkSender } from './auth/magic-link-sender.js';
import { LogOtpSender } from './auth/otp-sender.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createIngestService } from './ingest/ingest-service.js';
import { buildProjectionRegistry } from './projections/index.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = createPool(config.databaseUrl);
  const projections = buildProjectionRegistry();
  const ingest = createIngestService({ pool, evaluate: evaluateEvent, projections });
  const auth = createAuth({
    pool,
    // The senders that exist, and neither is deployable.
    //
    // `LogOtpSender` does two things a production process must not. It writes
    // every one-time code to the process log, so anyone with log access can sign
    // in as anyone. And it accumulates every code it has ever issued in an
    // unbounded in-process array (`otp-sender.ts`'s `sent`) — memory that grows
    // for the life of the process, and a heap dump that discloses the lot. The
    // array exists so a test can read the code that was issued; nothing on this
    // path ever reads it.
    //
    // Real delivery through a DLT-registered SMS provider and an email transport
    // is the deployment errand Plan 4 names and does not do. Both are behind an
    // interface, so the swap is one line each and touches nothing else — and
    // both faults leave with the implementation, because neither is in the
    // interface.
    otpSender: new LogOtpSender(),
    magicLinkSender: new LogMagicLinkSender(),
    // Both come from validated configuration, not from `process.env` with a
    // fallback: a server that silently signs sessions with a secret checked into
    // the repository is worse than a server that will not start.
    baseUrl: config.betterAuthUrl,
    secret: config.betterAuthSecret,
  });
  const app = buildApp({ db: pool, pool, ingest, auth }, { logLevel: config.logLevel });
  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
