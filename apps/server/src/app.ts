import Fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyRequest } from 'fastify';
import type { Auth } from './auth/auth.js';
import { registerAuthRoutes } from './auth/routes.js';
import { makeRequireSession } from './auth/require-session.js';
import type { ClientIngest } from './ingest/ingest-service.js';
import { registerEventRoutes } from './routes/events.js';
import { redactInviteToken, registerInviteRoutes, type ServerAppend } from './routes/invites.js';
import { registerTicketRoutes } from './routes/tickets.js';
import { registerWorkspaceRoutes } from './routes/workspaces.js';
import { registerContestsRoute } from './sync/contests-route.js';
import type { Queryable } from './db/queryable.js';

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
   * The query handle the READ routes use. Separate from `db` rather than a
   * widening of it: `HealthDb` is deliberately the narrowest thing /healthz can
   * ask for — one string, no parameters — and app.test.ts hands it a hand-rolled
   * object so that file can stay database-free while proving /healthz answers
   * 503 when the database is down. A read route needs parameterised queries and
   * a real driver, so it gets its own field with its own type.
   */
  pool: Queryable;
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
  /**
   * The INTERNAL, ungated append path — for invite acceptance and nothing else.
   *
   * A separate, differently-named field rather than a widening of `ingest` back
   * to `IngestService`. The narrowing above exists because the dangerous door
   * has the shorter name and a route author reaches for it by reflex; undoing it
   * to serve one route would ungate every future route too. A named capability
   * has to be passed deliberately, at one call site, and shows up in a diff.
   *
   * Acceptance genuinely needs it: every event in the acceptance sequence is
   * refused at the client door by design (`routes/invites.ts` enumerates the
   * three). It is FORCED, not chosen.
   */
  serverAppend: ServerAppend;
  /**
   * Where the product's web client lives (`WEB_ORIGIN`) — the host of the
   * invitation links this server mints. Required rather than defaulted: a wrong
   * or absent value produces links that go nowhere, and a default would produce
   * them silently.
   */
  webOrigin: string;
};

export function buildApp(
  deps: AppDeps,
  /**
   * `logStream` is a real operational option (a transport, a file) and it is
   * also the only way the token redaction above can be OBSERVED rather than
   * inferred: without a stream to read back, a test could assert the serializer
   * function in isolation and never learn whether it was wired in.
   */
  options: { logLevel?: string; logStream?: NodeJS.WritableStream } = {},
): FastifyInstance {
  const app = Fastify({
    logger:
      options.logLevel === undefined
        ? false
        : {
            level: options.logLevel,
            ...(options.logStream === undefined ? {} : { stream: options.logStream }),
            serializers: {
              /**
               * MEASURED, not assumed: Fastify's default `info` request line
               * carries `req.url` verbatim, and `GET /v1/invites/:token` carries
               * an invitation CREDENTIAL in that path. Without this serializer
               * every issued link lands in the process log of any deployment
               * running at `info` or below, and log access becomes workspace
               * access.
               *
               * The route cannot be reshaped instead — it is Plan 6's pinned
               * contract, consumed verbatim — so the log is what changes. The
               * rest of the path survives, so the operator still sees which
               * route was called.
               *
               * Everything else here reproduces Fastify's own default request
               * serializer: dropping a field would quietly remove operational
               * detail nobody asked to lose.
               */
              req(request: FastifyRequest) {
                return {
                  method: request.method,
                  url: redactInviteToken(request.url),
                  host: request.headers.host,
                  remoteAddress: request.socket.remoteAddress,
                  remotePort: request.socket.remotePort,
                };
              },
            },
          },
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

  // The events door reads `request.currentUserId`, so it is assembled WITH the
  // preHandler that writes it — the rule `require-session.ts` states, made
  // structural: `registerEventRoutes` takes the preHandler as an argument, so
  // there is no version of this line that forgets it and still compiles.
  const requireSession = makeRequireSession(deps.auth);
  registerEventRoutes(app, deps.ingest, requireSession);
  // The contests read surface (Plan 10 Task 4). It takes the same preHandler by
  // parameter for the same reason the events door does: a route that reads
  // `request.currentUserId` cannot be assembled without the thing that sets it.
  registerContestsRoute(app, { pool: deps.pool }, requireSession);
  // The ticket read surface (Plan 4 Task 8) — list, single read, and history,
  // each enforcing visibility server-side. Same preHandler by parameter, same
  // reason: all three handlers read `request.currentUserId`.
  registerTicketRoutes(app, { pool: deps.pool }, requireSession);
  // The founding door and the workspace directory (Plan 4 Task 13). It takes
  // `deps.ingest` — the NARROWED `ClientIngest`, same as the events door — so
  // the route that creates workspaces cannot reach the internal append path
  // either, and the same preHandler by parameter, for the same reason: both
  // handlers read `request.currentUserId`.
  registerWorkspaceRoutes(app, { pool: deps.pool, ingest: deps.ingest }, requireSession);
  // The invitation surface (Plan 4 Task 14): issue, read a link, accept a link,
  // list what is outstanding. It takes BOTH doors — the gated `ingest` for
  // issuance, so the admin-only refusal fires exactly as it would on
  // `POST /v1/events`, and the named `serverAppend` for acceptance, whose three
  // events are all refused at the client door by design.
  registerInviteRoutes(
    app,
    { pool: deps.pool, ingest: deps.ingest, serverAppend: deps.serverAppend, webOrigin: deps.webOrigin },
    requireSession,
  );
  registerAuthRoutes(app, deps.auth);

  return app;
}
