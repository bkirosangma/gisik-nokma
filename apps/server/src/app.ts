import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';
import type { IngestService } from './ingest/ingest-service.js';
import { registerEventRoutes } from './routes/events.js';

export type HealthDb = { query(sql: string): Promise<unknown> };

/**
 * The only body a 5xx ever carries. Fixed, so it can never grow a field that
 * happens to hold an exception message; shaped like Fastify's 4xx bodies, so a
 * client parses one envelope for both.
 */
export const INTERNAL_ERROR_BODY = {
  statusCode: 500,
  error: 'Internal Server Error',
  message: 'the server could not complete this request',
} as const;

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

  // A refusal explains itself; a breakage does not get to. Schema refusals
  // (FST_ERR_VALIDATION and every other 4xx) are the door's answer to a
  // malformed request and must reach the client verbatim — re-sending the error
  // lets Fastify's own serializer produce exactly the body it always has.
  // A 5xx is a different thing entirely: its message is Postgres internals —
  // SQL fragments, constraint and table names — so it is replaced by a fixed
  // structured body. The operator gets the detail through the log; the caller
  // gets the truth that this request did not complete, and nothing else.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? INTERNAL_ERROR_BODY.statusCode;
    if (statusCode < 500) {
      return reply.status(statusCode).send(error);
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(INTERNAL_ERROR_BODY.statusCode).send(INTERNAL_ERROR_BODY);
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
