import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';
import type { Auth } from './auth/auth.js';
import { registerAuthRoutes } from './auth/routes.js';
import type { ClientIngest } from './ingest/ingest-service.js';
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
  /**
   * The GATED door only (`ClientIngest`), never the full `IngestService`: an
   * assembled HTTP app has no business reaching the internal append path, and
   * narrowing it here means a future route cannot reach it either. A full
   * `IngestService` is still what callers pass — it is assignable.
   */
  ingest: ClientIngest;
  /**
   * Required, not optional, and deliberately so: an assembled app with no
   * identity surface is not a degraded product, it is a different one, and the
   * only way to get it should be to write a different builder. Constructing it
   * costs a caller nothing it does not already have — `createAuth` opens no
   * connection (checked: it returns in ~2ms over a pool pointed at a port
   * nothing listens on), so a test that never signs anyone in still needs no
   * database.
   *
   * The instance is built by the caller rather than here, which is what keeps
   * `buildApp` synchronous: `createAuth` is itself synchronous, so nothing here
   * forces the return type to a Promise that every call site would have to
   * await.
   */
  auth: Auth;
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
  registerAuthRoutes(app, deps.auth);

  return app;
}
