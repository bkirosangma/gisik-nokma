import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = createPool(config.databaseUrl);
  const app = buildApp({ db: pool }, { logLevel: config.logLevel });
  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
