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
    // The senders that exist. `LogOtpSender` writes every one-time code to the
    // process log, so this assembly is not deployable to anywhere a stranger can
    // reach: real delivery through a DLT-registered SMS provider and an email
    // transport is the deployment errand Plan 4 names and does not do. Both
    // implement an interface, so the swap is one line each and touches nothing
    // else.
    otpSender: new LogOtpSender(),
    magicLinkSender: new LogMagicLinkSender(),
    // Both come from validated configuration, not from `process.env` with a
    // fallback: a server that silently signs sessions with a secret checked into
    // the repository is worse than a server that will not start.
    baseUrl: config.betterAuthUrl,
    secret: config.betterAuthSecret,
  });
  const app = buildApp({ db: pool, ingest, auth }, { logLevel: config.logLevel });
  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
