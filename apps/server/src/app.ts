import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { IngestService } from './ingest/ingest-service.js';
import { registerEventRoutes } from './routes/events.js';

export type HealthDb = { query(sql: string): Promise<unknown> };

export type AppDeps = {
  db: HealthDb;
  ingest: IngestService;
};

export function buildApp(deps: AppDeps, options: { logLevel?: string } = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logLevel === undefined ? false : { level: options.logLevel },
    // The events door refuses what it does not understand: silent scalar→array wrapping violated the stated non-array→400 contract.
    // Unknown keys are refused, not silently dropped: `additionalProperties: false` declares reject-intent; AJV's removeAdditional default would have silently stripped them instead.
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });

  app.get('/healthz', async (_request, reply) => {
    try {
      await deps.db.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  registerEventRoutes(app, deps.ingest);

  return app;
}
