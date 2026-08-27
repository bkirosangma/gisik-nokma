import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createIngestService } from './ingest/ingest-service.js';
import { buildProjectionRegistry } from './projections/index.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = createPool(config.databaseUrl);
  const projections = buildProjectionRegistry();
  const ingest = createIngestService({ pool, evaluate: evaluateEvent, projections });
  const app = buildApp({ db: pool, ingest }, { logLevel: config.logLevel });
  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
