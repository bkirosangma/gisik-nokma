import Fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { Auth } from './auth/auth.js';
import { registerAuthRoutes } from './auth/routes.js';
import { makeRequireSession } from './auth/require-session.js';
import type { ClientIngest } from './ingest/ingest-service.js';
import { createNotificationFanout } from './notifications/fanout.js';
import { createInAppTransport } from './notifications/transport.js';
import type { ObjectStore } from './attachments/object-store.js';
import { registerAttachmentRoutes } from './routes/attachments.js';
import { registerAttentionRoutes } from './routes/attention.js';
import { registerBoardRoutes } from './routes/board.js';
import { registerBuilderReadRoutes } from './routes/builder-reads.js';
import { registerEventRoutes } from './routes/events.js';
import { registerListRoutes } from './routes/list.js';
import { registerMyWorkRoutes } from './routes/my-work.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerPreferencesRoutes } from './routes/preferences.js';
import { registerSearchRoutes } from './routes/search.js';
import { redactInviteToken, registerInviteRoutes, type ServerAppend } from './routes/invites.js';
import { registerTicketHistoryRoute } from './routes/ticket-history.js';
import { registerTicketRoutes } from './routes/tickets.js';
import { registerWorkspaceRoutes } from './routes/workspaces.js';
import { registerContestsRoute } from './sync/contests-route.js';
import { registerSyncRoutes } from './sync/sync-routes.js';
import { createStreamHub } from './stream/hub.js';
import { registerStreamRoute, type StreamRouteDeps } from './stream/routes.js';
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
   * Where attachment BYTES live — the `ObjectStore` behind `POST /v1/attachments`
   * and `GET /v1/attachments/:id`.
   *
   * Required, not optional, for the same reason `auth` above is and stated in
   * the same terms: an assembled app with no attachment store is not a degraded
   * product, it is a different one. The optional version of this field would
   * have `buildApp` decide, silently and per-caller, whether half of the editor
   * works — and the failure it produces is not a 500 anybody would trace back
   * here. `image-embed-gate` refuses an embedded image whose `attachmentId` has
   * no row, so an app assembled without a store answers every inline image with
   * a correct-sounding refusal about a rule, and nothing says the bytes had
   * nowhere to go.
   *
   * It costs no caller a database or a filesystem: `createObjectStoreFromEnv({})`
   * defaults `OBJECT_STORE` to `'local'` and returns a `LocalDiskStore`, whose
   * constructor stores a string and touches no `fs` — every `fs` call is inside
   * `put`/`getStream`/`delete`. So `test/app.test.ts`, which is deliberately
   * database-free, stays database-free.
   */
  store: ObjectStore;
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
  /**
   * The clock the ATTENTION strip computes against. Optional, and the only
   * dependency here that a test would ever want to freeze: the strip is the one
   * read whose answer changes while the database does not, so a test that could
   * not pin `now` would be asserting against the day it happened to run.
   *
   * There is deliberately no default here. `registerAttentionRoutes` owns it, so
   * "the real clock" is defined once; a second default in this file would be a
   * second thing to keep in step. Every other route on this branch reads no
   * clock at all, which is why this is one optional field rather than a `Clock`
   * threaded through `AppDeps`.
   */
  now?: () => Date;
  /**
   * The knobs `WS /v1/stream` exposes — heartbeat interval, per-user connection
   * budget, and the two seams that make the heartbeat testable without a
   * sleep (`schedule`, `onHeartbeat`).
   *
   * One optional field rather than four, because they are one subject and a
   * caller either cares about the stream's timing or does not. Every default
   * lives in `registerStreamRoute`, so this stays UNDEFAULTED here for the same
   * reason `now` does: one definition of each real value, in the module that
   * owns it.
   *
   * `now` is deliberately NOT in here. The stream's deadline and the attention
   * strip's Indian day are the same clock — a server does not get to be at two
   * times at once — and giving the stream its own would make that expressible.
   */
  stream?: Omit<StreamRouteDeps, 'pool' | 'hub' | 'now'>;
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
  // The replica bootstrap (Plan 10 Task 6) — first-run sync without replaying
  // full history. It genuinely needs a `pg.Pool`, not the narrower `Queryable`
  // this field is typed as: the whole read runs inside one
  // `REPEATABLE READ` transaction it opens itself with `deps.pool.connect()`,
  // and `PoolClient` has no `.connect()` of its own. The cast is safe for every
  // real caller (`index.ts` and `buildTestApp` both pass a real `Pool` here) —
  // the one caller it is NOT safe for is a test that swaps in
  // `BuildTestAppOverrides.pool`, a wrapper built to observe/delay/fail a read
  // for the stream route's races; such a wrapper has no `.connect()` and this
  // route would throw against it. No test does that today. Same preHandler by
  // parameter, same reason as every route above: the handler reads
  // `request.currentUserId` and resolves its whole gate from it.
  // Both doors, and which is which is the whole of Plan 10 Task 7: the client's
  // offline claims go through the GATED `deps.ingest` (`ClientIngest`, no
  // `ingestBatch` on it at all), and the server's own `claim.contested` appends
  // through the named `serverAppend` — the same two-door shape
  // `registerInviteRoutes` takes below, for the same reason. The plan's snippet
  // asked for the full `IngestService` here, which is exactly what would let a
  // client claim reach the ungated door and skip `checkPermission`.
  registerSyncRoutes(
    app,
    { pool: deps.pool as Pool, ingest: deps.ingest, serverAppend: deps.serverAppend },
    requireSession,
  );
  // The ticket read surface (Plan 4 Task 8) — list, single read, and history,
  // each enforcing visibility server-side. Same preHandler by parameter, same
  // reason: all three handlers read `request.currentUserId`.
  registerTicketRoutes(app, { pool: deps.pool }, requireSession);
  // One ticket's history at a workspace-free path (Plan 3 Task 13) — the ledger
  // filtered to that ticket, paged by `afterSeq`/`limit`, as
  // `TicketHistoryEvent`s. It is NOT a duplicate of the `/events` door
  // registered directly above: different path, different contract, both owed by
  // their plans, and `routes/ticket-history.ts` carries the argument plus the
  // cross-route agreement test that keeps the two from drifting. Same
  // preHandler by parameter, same reason as its three neighbours: the handler
  // reads `request.currentUserId`.
  registerTicketHistoryRoute(app, { pool: deps.pool }, requireSession);
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
  // The project board (Plan 5 Task 8) — one column per state of every workflow
  // in use, cards filtered to what the caller may see. Same preHandler by
  // parameter, same reason as its neighbours: the handler reads
  // `request.currentUserId`, and its whole tenancy gate is resolved from it.
  registerBoardRoutes(app, { pool: deps.pool }, requireSession);
  // The project list (Plan 5 Task 9) — the same project's tickets as a filtered,
  // grouped, keyset-paged flat list. Registered beside the board rather than
  // inside it: same door, same visibility predicate, different arrangement.
  registerListRoutes(app, { pool: deps.pool }, requireSession);
  // The builder read surface (Plan 5 Task 9b) — the workflow roster, one
  // definition by version, the ticket types bound to them, the workspace roster
  // with guests withheld from non-admins, and the admin-only state occupancy and
  // type population a publish mapping is built from. Same preHandler by
  // parameter, same reason as every route above it: each handler reads
  // `request.currentUserId` and resolves its whole tenancy gate from it.
  registerBuilderReadRoutes(app, { pool: deps.pool, ingest: deps.ingest }, requireSession);
  // Workspace-wide full text (Plan 5 Task 10) — the FIRST cross-project read
  // here. Board, list and the builder surface all take their scope from a path
  // parameter the door resolves; this one spans a whole workspace, so
  // `visibleTicketsWhere` and the tenancy clause beside it are the entire
  // boundary. Same preHandler by parameter, same reason as every route above:
  // the handler reads `request.currentUserId` and resolves its gate from it.
  registerSearchRoutes(app, { pool: deps.pool }, requireSession);
  // My Work (Plan 5 Task 11) — the first PER-VIEWER read: not "what is in this
  // container" but "what is mine", so the session's user id is the filter as
  // well as the security boundary. Registered with the same preHandler by
  // parameter as every route above it, and here that matters most: the handler
  // does not merely read `request.currentUserId`, that id IS the subject of the
  // answer, and there is deliberately no parameter by which a caller could name
  // somebody else's.
  registerMyWorkRoutes(app, { pool: deps.pool }, requireSession);
  // The attention strip (Plan 5 Task 12) — the first read that is COMPUTED from
  // the stored claims AND THE CLOCK, and stored nowhere: blocked flags, an IST
  // staleness window and an IST due window, with the two thresholds read from
  // the workspace's own `workspace.settings_set` claim rather than from
  // constants. `deps.now` is threaded through UNDEFAULTED on purpose — the
  // default lives in `registerAttentionRoutes` — but NOT only there: Task 15's
  // `registerStreamRoute` defaults it too, for the heartbeat deadline. Both get
  // this same optional field, so pinning it pins both. There is not one definition of
  // the real clock. Same preHandler by parameter, same reason as every route
  // above it: the handler reads `request.currentUserId` and resolves its whole
  // tenancy gate from it.
  registerAttentionRoutes(app, { pool: deps.pool, now: deps.now }, requireSession);
  // View preferences (Plan 5 Task 13) — the FIRST WRITE surface among these
  // routes, and the one thing this server stores that is NOT an attributed
  // claim: preferences arrange the record rather than say anything about it
  // (coordination amendment 14), so they are per-user rows and a PUT appends no
  // events. It takes `deps.pool` and the same preHandler by parameter as every
  // route above it, and here that is load-bearing twice over: the handler does
  // not merely read `request.currentUserId`, that id is the KEY it writes
  // under, and there is deliberately no parameter by which a caller could name
  // somebody else's.
  registerPreferencesRoutes(app, { pool: deps.pool }, requireSession);
  // The notification inbox (Plan 9 Task 7) — cursor-paged list, unread count,
  // and idempotent mark-read, all three scoped to `request.currentUserId` by
  // construction. Same preHandler by parameter as every route above it, and
  // here it is a read-enforcement surface: another user's notification id
  // must read as `not_found`, never as a different, more informative refusal.
  registerNotificationRoutes(app, { pool: deps.pool }, requireSession);
  // The realtime fan-out (Plan 5 Tasks 14–15) — the FIRST thing here that is
  // not a request/response at all, and the first that decides who ELSE hears
  // about a change. The hub is created HERE, beside the ingest service whose
  // commits it listens to: `onEventCommitted` is on `ClientIngest`, so the
  // narrowed door is enough and the route still cannot reach the internal
  // append path. Same preHandler by parameter as every route above it, and here
  // it is the whole door — `stream/hub.ts` authorizes nobody by design.
  const hub = createStreamHub({
    pool: deps.pool,
    onEventCommitted: (listener) => deps.ingest.onEventCommitted(listener),
  });
  // A hub outlives a request, so it has to be let go of explicitly: `close()`
  // drops the commit-feed subscription and every socket's subscriptions. Without
  // this, a test file that builds several apps over one database leaves a live
  // listener on each ingest service it ever made.
  app.addHook('onClose', () => {
    hub.close();
  });
  app.decorate('streamHub', hub);
  registerStreamRoute(app, { ...deps.stream, pool: deps.pool, hub, now: deps.now }, requireSession);
  // The notification fan-out (Plan 9 Task 5) — the SECOND listener on the commit
  // feed, and the only one that addresses a person rather than a connection.
  //
  // ADAPTATION, recorded: the plan says wire this in `src/index.ts`. It goes
  // here instead, beside the stream hub, because this is where the commit feed
  // is actually reachable — `index.ts` builds the ingest service but hands it
  // straight to `buildApp`, and a subscription made there would be one the app
  // could neither observe nor unsubscribe. Here it is also inside the one
  // composition path every assembled app takes, so it is pinned by a test
  // (`test/notifications/fanout.test.ts`, 'boot wiring') rather than only by a
  // typecheck that cannot notice an unsubscribed listener.
  //
  // FIRE-AND-FORGET, and that is the disclosure property, not an optimisation:
  // `onCommitted` is not awaited, so no request's response — and no request's
  // TIMING — can depend on whether a mention was delivered or silently refused.
  // The mention gate's silence rests on this line as much as on the gate.
  // `onCommitted` never rejects (it logs its own failures), so the floating
  // promise can carry nothing back here.
  //
  // The listener receives `LedgerEvent = EventEnvelope & { workspaceSeq: number }`.
  // That is a structural extension, so it passes as an `EventEnvelope` with no
  // cast, and the fan-out deliberately ignores the cursor: a notification is
  // addressed to a person, never resumed from a stream position. The hub above
  // is the listener that needs `workspaceSeq`; this one does not.
  const notificationFanout = createNotificationFanout({
    pool: deps.pool,
    transports: [createInAppTransport(deps.pool)],
  });
  const unsubscribeNotifications = deps.ingest.onEventCommitted((event) => {
    void notificationFanout.onCommitted(event);
  });
  // Same reason the hub is closed above, and the same failure if it is not: a
  // test file that builds several apps over one ingest service would otherwise
  // leave a live fan-out on each, and every later commit would be delivered
  // once per app ever built.
  app.addHook('onClose', () => {
    unsubscribeNotifications();
  });
  // The attachment doors (Plan 7 Tasks 9 and 10) — upload and download. This
  // line is the whole of what was missing: the module was complete and tested
  // and reachable from nothing, so on the server this repo booted the
  // `attachments` table could never gain a row, and `image-embed-gate`'s
  // `attachment.embed-unknown` branch therefore refused EVERY inline image —
  // correct about the rule, useless as a product. `src/index.ts` carries the
  // record of how that was found.
  //
  // ## `app.register`, not a direct call — MEASURED, three variants
  //
  // `registerAttachmentRoutes` is `async` and `await`s a nested
  // `app.register(multipart, …)` before declaring its routes. That awaited-then-
  // declare shape is exactly what `stream/routes.ts` records as failing SILENTLY
  // for `@fastify/websocket`, so it was probed against this repo's own fastify
  // 5.12.1 and the real `@fastify/multipart` rather than reasoned about:
  //
  //   `app.register(fn, deps)` from this synchronous builder → POST /v1/attachments 201
  //   no registration at all (negative control)              → 404
  //   `void registerAttachmentRoutes(app, deps)`             → `app.ready()` never resolves
  //
  // `void registerAttachmentRoutes(app, deps)` is NOT the alternative it looks
  // like, and it fails HARDER than "the route is declared too late". MEASURED,
  // as a mutation of this line: the app never becomes ready at all — `app.ready()`
  // does not resolve, and every test on it dies on a 30 s hook timeout with no
  // route and no error to name the cause. Reproduced outside this file in
  // fourteen lines: `await app.register(multipart, …)` on the ROOT instance from
  // outside avvio's boot makes the awaited promise wait on a boot that is itself
  // waiting on that registration. A server assembled that way would hang before
  // it could listen.
  //
  // `await`ing the function here is not the escape either: it would make
  // `buildApp` async, and every one of its nine call sites would have to await a
  // builder that is synchronous by decision (see `AppDeps.auth`). `register`
  // hands the whole thing to avvio, which is the one arrangement that finishes
  // before the instance is ready.
  //
  // ## The encapsulation is load-bearing, not stylistic
  //
  // `register` also puts the multipart content-type parser in a CHILD scope, and
  // that containment is the point. Measured with `multipart` moved to the root
  // instance: `POST /v1/attachments` still answered 201, and a
  // `multipart/form-data` POST to `/v1/events` — which must answer 415, this
  // server understanding no such body — answered `400 FST_ERR_VALIDATION`
  // "body must be object" instead, with `request.body` undefined. Every other
  // door in this file would have silently changed its refusal. `auth/routes.ts`
  // encapsulates for the same reason. `test/routes/attachments-wired.test.ts`
  // pins both halves on ONE assembled app, because until it existed no test in
  // this repo sent a multipart body anywhere but the upload suite, and a root
  // registration would have broken every other door with nothing to notice.
  //
  // ## The ONE way this differs from every neighbour above: it takes `auth`
  //
  // Every other route here takes `requireSession` by parameter. This one takes
  // `deps.auth` and builds its own `makeRequireSession` internally.
  // `routes/attachments.ts`'s "`requireSession`, and the rule it discharges"
  // section says that is deliberate — it is the cross-plan signature Task 10's
  // download half was written against — and it discharges the same rule the
  // same way: there is no way to call the function without supplying an
  // identity source. NAMED here, not corrected: making it
  // match its neighbours is a change to a signature another plan's half is
  // written against, and belongs in that change set, not this one.
  //
  // `deps.pool as Pool` is a TYPE accommodation and nothing more, and it is a
  // WEAKER cast than the identically-spelled one on `registerSyncRoutes` above.
  // That route genuinely needs a `Pool` — it calls `.connect()` — which is why
  // its comment names the one caller the cast is unsafe for. This route calls
  // only `.query` — checked, all five uses: `getResolvedVisibility`, `canSee`,
  // `insertAttachment` and `getAttachment`, every one of which takes
  // `Queryable` and none of which reaches `.connect()`. The cast exists
  // solely because `AttachmentRouteDeps.pool` is DECLARED `Pool`. Narrowing
  // that declaration to `Queryable` would delete this line, and it is a change
  // to the signature Task 10's download half is written against, so it belongs
  // to that owner rather than here.
  app.register(registerAttachmentRoutes, {
    pool: deps.pool as Pool,
    store: deps.store,
    auth: deps.auth,
  });
  registerAuthRoutes(app, deps.auth);

  return app;
}
