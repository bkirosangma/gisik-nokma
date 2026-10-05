import compress from '@fastify/compress';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyRequest, onRouteHookHandler } from 'fastify';
import type { Pool } from 'pg';
import { hstsHeaderFor } from './http/hsts.js';
import { SECURITY_HEADERS } from './http/security-headers.js';
import { FORBIDDEN_ORIGIN_BODY, httpOriginRefused, normalizeOrigin } from './http/http-origin.js';
import { isSignInPath, makeFixedWindowLimiter, rateLimitKeyFor } from './http/rate-limit.js';
import type { Auth } from './auth/auth.js';
import { NoopErrorAlerter, alertWithoutWaiting, type ErrorAlerter } from './alerts/error-alerter.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerAuthMethodRoutes } from './routes/auth-methods.js';
import { makeRequireSession } from './auth/require-session.js';
import type { ClientIngest } from './ingest/ingest-service.js';
import { createNotificationFanout } from './notifications/fanout.js';
import { nudgesEmbedding, nudgesItemEmbedding } from './search/nudge.js';
import { createInAppTransport } from './notifications/transport.js';
import type { ObjectStore } from './attachments/object-store.js';
import { registerAttachmentRoutes } from './routes/attachments.js';
import { registerAttentionRoutes } from './routes/attention.js';
import { registerHomeRoutes } from './routes/home.js';
import { registerBoardRoutes } from './routes/board.js';
import { registerBuilderReadRoutes } from './routes/builder-reads.js';
import { registerEventRoutes } from './routes/events.js';
import { registerConceptRoutes } from './routes/concepts.js';
import { registerGroupRoutes } from './routes/groups.js';
import { registerSimilarRoutes } from './routes/similar.js';
import { registerSuggestionRoutes } from './routes/suggestions.js';
import { registerListRoutes } from './routes/list.js';
import { registerMyWorkRoutes } from './routes/my-work.js';
import { registerGraphRoutes } from './routes/graph.js';
import { registerGraphQueryRoutes } from './routes/graph-query.js';
import { registerMcpDeviceRoutes } from './routes/mcp-device.js';
import { registerMcpTokenRoutes } from './routes/mcp-tokens.js';
import { registerMcpConnectionRoutes } from './routes/mcp-connections.js';
import { registerMeDeviceRoutes } from './routes/me-devices.js';
import { registerMePasskeyRoutes } from './routes/me-passkeys.js';
import { registerMcpHttpRoute } from './routes/mcp-http.js';
import { registerMcpOAuthRoutes } from './routes/mcp-oauth.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerNotificationPreferencesRoutes } from './routes/notification-preferences.js';
import { registerPreferencesRoutes } from './routes/preferences.js';
import { registerSearchRoutes } from './routes/search.js';
import { LogInviteMailer, type InviteMailer } from './invites/invite-mailer.js';
import { redactRequestUrl } from './http/redact-url.js';
import { registerInviteRoutes, type ServerAppend } from './routes/invites.js';
import { registerMemberRoutes } from './routes/members.js';
import { registerPeopleRoutes } from './routes/people.js';
import { registerMyInvitationRoutes } from './routes/my-invitations.js';
import { registerTicketHistoryRoute } from './routes/ticket-history.js';
import { registerTicketLinkRoutes } from './routes/ticket-links.js';
import { registerTicketRoutes } from './routes/tickets.js';
import { registerNoteRoutes } from './routes/notes.js';
import { registerReferenceRoutes } from './routes/references.js';
import { registerWorkspaceRoutes } from './routes/workspaces.js';
import { registerPurgedLookupRoute } from './purge/lookup-route.js';
import { registerDeletedItemsRoutes } from './routes/deleted-items.js';
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
   * The API's own public origin (`MCP_PUBLIC_URL`) — the hosted MCP door's
   * issuer. OPTIONAL and null/absent means the door is not registered at all:
   * 404 on `/mcp`, `/oauth/*` and `/.well-known/oauth-*` (plan FD1).
   */
  mcpPublicUrl?: string | null;
  /**
   * Where invitation letters go (access plan W5). OPTIONAL, and absent means a
   * SILENT `LogInviteMailer`: that is the ~sixty test files' default, which mint
   * invitations and never asked for mail. `index.ts` always passes
   * `selectInviteMailer(config)`, so a deployment decides by `SMTP_URL` alone.
   */
  inviteMailer?: InviteMailer;
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
  /**
   * Knowledge Graph spec D §4.1 (KG-D Task 5): called with the WORKSPACE id once per committed event that reaches
   * `onNoteBodyCommitted` below (`nudgesEmbedding` or `nudgesItemEmbedding`): "an embedded text in this workspace
   * changed", which is what the suggestion job's 200-change trigger counts. The same listener serves both callbacks,
   * registered when EITHER is given; `index.ts` hands this `suggestionScheduler.change`, a test hands it nothing. A
   * callback for the reason `onNoteBodyCommitted` gives: the scheduler owns timers, and `buildApp` starts none.
   */
  onSemanticChange?: (workspaceId: string) => void;
  /**
   * Called once per committed note event whose TEXT changed — `note.created`
   * and `note.body_set`, filtered by `nudgesEmbedding` — and, since Knowledge
   * Graph spec D Task 2, once per committed ticket or ticket-comment event that
   * `nudgesItemEmbedding` names (the id passed is then the TICKET's). The
   * callback now means "a text that is embedded changed"; the name is kept to
   * avoid churn in `index.ts`, and the worker ignores the id anyway.
   *
   * A CALLBACK rather than the worker itself, and that is the whole design: the
   * embedding loop is a timer, and `buildApp` is called by around sixty test
   * files, so starting one here would fire it in every one of them (the
   * snapshot writer's registration makes the same argument at length). What
   * `buildApp` owns is the one thing only it can reach — the commit feed — and
   * it hands the decision to whoever assembled the app. `index.ts` hands it
   * `(noteId) => worker.nudge(noteId)`; the sixty test files hand it nothing,
   * and a listener is registered only when this or `onSemanticChange` is
   * defined, so they subscribe to nothing at all.
   *
   * The argument is accepted for the caller's benefit — a log line, or a
   * future per-note wake-up — and the shipped worker does not need it:
   * staleness is decided by the tables.
   */
  onNoteBodyCommitted?: (noteId: string) => void;
};

/**
 * The DEPLOYMENT security surface: CORS, the HTTP-`Origin` check, the rate
 * limiters, and whether `X-Forwarded-*` may be believed.
 *
 * ## Absent means OFF, and that is the contract, not a convenience
 *
 * When `security` is undefined this app behaves EXACTLY as it did before Plan
 * 11 Task 2: no CORS headers, no HTTP-Origin check, no limiter hook registered
 * at all. Around sixty test files build this app and several hammer
 * `POST /v1/events` in a loop; making the controls opt-in is what keeps a
 * throughput they never asked about from becoming a fact they depend on. The
 * server main (`index.ts`) passes the real config; a test opts in when it is
 * testing these controls and not otherwise.
 */
export type SecurityOptions = {
  /**
   * `WEB_ORIGIN` — the ONE origin CORS allows and the ONE origin the
   * HTTP-`Origin` check accepts.
   *
   * **`null` turns BOTH off, and there is deliberately no independent switch
   * for the CSRF check.** Stated because the coupling is a hazard worth naming:
   * the HTTP-`Origin` check is the ONLY CSRF defence available on
   * cookie-authenticated product mutations (`http/http-origin.ts` — `SameSite`
   * cannot help between two subdomains of `artsourced.in`), so anyone who sets
   * this to `null` to switch CORS off switches that off with it, and nothing
   * about the request that then succeeds says so. There is no separate flag
   * BECAUSE both controls answer to the same fact — which single origin this
   * API belongs to — and a second knob would be a second place for that fact to
   * be wrong. The rate-limit tests pass `null` here, which is how they say the
   * origin check is not their subject; `test/http/security-middleware.test.ts`
   * pins the coupling as a decision rather than leaving it an accident.
   */
  webOrigin: string | null;
  /**
   * The three buckets' budgets and the window they share. `null` registers no
   * limiter hook.
   *
   * `inviteMax` is a DEVIATION from the plan's stated shape
   * (`{ authMax, eventsMax, windowSec }`) and it is the second inherited
   * errand: `permissions/check-permission.ts` and test case 6.123 both name
   * *"Plan 11, which owns rate limiting"* as the owner of invite-issuance
   * limiting, and neither of the plan's two buckets covers
   * `POST /v1/workspaces/:workspaceId/invites` — where **each request mints a
   * credential**. It is a field rather than a constant so the value is chosen
   * at the wire site, in view, and so a future `RATE_LIMIT_INVITE_MAX` has one
   * line to land on. No new environment variable is introduced for it: see
   * `index.ts` for which existing knob feeds it and why.
   */
  rateLimit: {
    authMax: number;
    eventsMax: number;
    inviteMax: number;
    /**
     * The device-flow bucket. Fed by `RATE_LIMIT_AUTH_MAX` at the wire site, not
     * by a new environment variable — the `inviteMax` precedent exactly. Its own
     * bucket rather than sharing `auth:` because the two contend in both
     * directions: a CLI polling every 12s must not lock a person out of signing
     * in from the same machine, and a sweep of the 8-character user code must
     * not be able to spend the sign-in budget.
     */
    mcpMax: number;
    /**
     * The sign-in family's own bucket, charged ON TOP OF `authMax` — the fifth
     * bucket, and the only one that classifies by PATH rather than by Fastify
     * route pattern (`isSignInPath`).
     *
     * It exists to repay a loss the controller ruling of 2026-09-08 named when
     * it disabled better-auth's built-in limiter: that vendor limiter gave
     * `/sign-in*` and `/magic-link*` tighter rules than its global default, and
     * with it off the whole mount sat behind one flat `authMax` budget, so a
     * client could spend its entire auth allowance on sign-in attempts.
     *
     * **ADDITIVE, not replacing, and the arithmetic is the reason.** Were a
     * matching path to be charged to THIS bucket INSTEAD of `auth:`, one client
     * would get `authMax + signInMax` requests against the mount where it gets
     * `authMax` today — a LOOSENING shipped under a parity headline, and the
     * exact reversal of the ruling's third ground ("per attacker, ours is
     * TIGHTER"). Charging both means a sign-in is bounded by the SMALLER of the
     * two budgets, so this can only ever tighten, and a path the matcher misses
     * degrades to precisely today's behaviour rather than to no bound at all.
     *
     * Fed from `RATE_LIMIT_AUTH_MAX` at the wire site — the `inviteMax` and
     * `mcpMax` precedent, no new environment variable. See `index.ts` for the
     * derivation and why it is a fraction rather than a constant.
     */
    signInMax: number;
    windowSec: number;
  } | null;
  /**
   * Whether Fastify may believe `X-Forwarded-For` — i.e. whether `request.ip`
   * is the CLIENT or the last hop.
   *
   * This is not decoration on a rate limiter, it is the difference between a
   * limiter and a self-inflicted outage. Behind App Platform every request
   * arrives from the router, so with this off **every client in the world
   * shares one bucket** and the first hundred requests of a minute lock out the
   * hundred-and-first user. Enabling rate limiting without wiring this is worse
   * than not enabling it.
   *
   * Defaulting to `false` is the other half: trusting a forwarded header from
   * an UNTRUSTED hop lets a caller choose its own source address and buy itself
   * an unlimited number of buckets. `config.trustProxy` is the deployment's
   * statement that there is a proxy in front, and `TRUST_PROXY` is a
   * `z.enum(['true','false'])` precisely so that `TRUST_PROXY=false` cannot be
   * read as `true`.
   */
  trustProxy?: boolean;
  /**
   * The clock the LIMITER windows are measured against, in milliseconds.
   * Defaults to `Date.now`.
   *
   * A DEVIATION from the plan's options shape, and the reason is the one thing
   * an app-level limiter test otherwise cannot prove without sleeping: that the
   * window REOPENS. `makeFixedWindowLimiter` already takes `nowMs` per call, so
   * the seam exists — this is what connects it to a test through the HTTP
   * surface. A test that instead shrank the window and slept would be asserting
   * against a `windowSec` no deployment uses, and would spend a real second per
   * assertion.
   *
   * Deliberately NOT `AppDeps.now`, which is a `() => Date` and is the calendar
   * clock the attention strip's Indian day and the stream's heartbeat deadline
   * share. Two test files FREEZE that clock at a fixed instant; a frozen
   * calendar clock here would produce a window that never reopens, so a
   * suite-wide constant would silently turn every limited route into a
   * permanent 429 after `max` requests. Different subject, different seam,
   * milliseconds rather than a `Date` so nothing has to convert per request.
   */
  now?: () => number;
};

export function buildApp(
  deps: AppDeps,
  /**
   * `logStream` is a real operational option (a transport, a file) and it is
   * also the only way the token redaction above can be OBSERVED rather than
   * inferred: without a stream to read back, a test could assert the serializer
   * function in isolation and never learn whether it was wired in.
   */
  options: {
    logLevel?: string;
    logStream?: NodeJS.WritableStream;
    deploySha?: string;
    security?: SecurityOptions;
    /**
     * Where 5xx failures phone (Plan 11 Task 3). Absent means a
     * `NoopErrorAlerter` — no webhook, no network, and NOT a degraded server:
     * `index.ts` builds one from `ALERT_WEBHOOK_URL` and every other caller,
     * this suite's sixty-odd apps included, gets silence.
     */
    alerter?: ErrorAlerter;
    /**
     * TEST-ONLY (E3-15). Attached before any route is registered, so it
     * observes every route this app actually serves — see the wiring's own
     * comment, just below the `Fastify(...)` call, for why a hook added by a
     * caller AFTER `buildApp` returns cannot do the same.
     */
    onRoute?: onRouteHookHandler;
  } = {},
): FastifyInstance {
  const app = Fastify({
    // See `SecurityOptions.trustProxy`. It belongs on the CONSTRUCTOR so
    // `request.ip` means what the deployment configured it to mean — that is
    // what a log line should carry.
    //
    // THIS COMMENT USED TO SAY that one derivation must serve every consumer,
    // "the limiter keys below" included, and that a hook re-deriving an address
    // from headers would be a second definition free to disagree. **That was
    // wrong, and the disagreement is the point.** Measured: with
    // `trustProxy: true`, `request.ip` is the LEFTMOST `X-Forwarded-For` entry,
    // which the CALLER writes — so keying a limiter on it lets one caller mint
    // a fresh bucket per request by varying one header. The limiter therefore
    // derives its own key (`rateLimitKeyFor`), from the RIGHTMOST entry, which
    // the nearest trusted proxy wrote. A log wants the configured answer; a
    // limiter key must be unforgeable. Two requirements, two derivations.
    trustProxy: options.security?.trustProxy ?? false,
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
               * The same holds for credentials in the QUERY (a magic-link
               * `token`, an OAuth `code` and `state`): `redactRequestUrl`
               * replaces those values too, keeping the parameter names.
               *
               * Everything else here reproduces Fastify's own default request
               * serializer: dropping a field would quietly remove operational
               * detail nobody asked to lose.
               */
              req(request: FastifyRequest) {
                return {
                  method: request.method,
                  url: redactRequestUrl(request.url),
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

  // E3-15 — a TEST-ONLY seam, wired before a single route is registered.
  // `onRoute` fires at REGISTRATION time (`fastify@5.12.1`'s `lib/route.js`),
  // and every root-level route below is registered SYNCHRONOUSLY as this
  // function runs — a caller that received `app` back and attached its own
  // `onRoute` hook would have already missed all of them; only the two
  // routes declared inside a child `app.register(...)` scope (deferred to the
  // `ready()` boot sequence) would still fire for it. `options.onRoute`,
  // absent in every non-test caller, is therefore attached HERE, first, so a
  // test can observe every route this app actually serves rather than a
  // second, hand-maintained list of them.
  if (options.onRoute) {
    app.addHook('onRoute', options.onRoute);
  }

  // A refusal explains itself; a breakage does not get to. Schema refusals
  // (FST_ERR_VALIDATION and every other 4xx) are the door's answer to a
  // malformed request and must reach the client verbatim — re-sending the error
  // lets Fastify's own serializer produce exactly the body it always has.
  // A 5xx is a different thing entirely: its message is Postgres internals —
  // SQL fragments, constraint and table names — so it is replaced by a fixed
  // structured body. The operator gets the detail through the log; the caller
  // gets the truth that this request did not complete, and nothing else.
  //
  // A 5xx also PAGES, and a sub-500 deliberately does not. A schema refusal and
  // an `unauthenticated` are the door working; paging on them is how an alerting
  // channel gets muted, and a muted channel is worse than none because it still
  // looks like coverage.
  //
  // Read "a 5xx that REACHES THIS HANDLER". A 5xx sent by a route that catches
  // its own failure never arrives here and so never pages; `/healthz` below is
  // that case, and the only one in this file. The reason it stays that way is
  // recorded at that route.
  const alerter = options.alerter ?? new NoopErrorAlerter();
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? INTERNAL_ERROR_BODY.statusCode;
    if (statusCode < 500) {
      return reply.status(statusCode).send(error);
    }
    request.log.error({ err: error }, 'unhandled error');
    // FIRE-AND-FORGET, through the containment helper — never a bare `notify`.
    // No response, and no response's TIMING, may depend on whether an alert was
    // delivered, and an alerter that throws, rejects or hangs must leave this
    // 500 exactly as it is. See `alerts/error-alerter.ts` for why one `catch` is
    // not enough, and why this does not copy the fan-out's bare `void` below.
    //
    // The context carries the same REDACTED url the request logger uses: with
    // `request.url` verbatim, a 5xx anywhere under `/v1/invites/:token` would
    // post an unspent invitation CREDENTIAL to a chat channel, where it outlives
    // the incident in everyone's scrollback.
    alertWithoutWaiting(alerter, `${request.method} ${redactRequestUrl(request.url)}`, error);
    return reply.status(INTERNAL_ERROR_BODY.statusCode).send(INTERNAL_ERROR_BODY);
  });

  // ── HSTS, on every response that arrived over HTTPS ────────────────────────
  //
  // Registered UNCONDITIONALLY, outside the `options.security` block below, and
  // that placement is the point: `buildTestApp` and roughly sixty test call
  // sites do not pass `security`, so a header registered inside that block
  // would be absent from every test that could otherwise witness it — a control
  // that exists only in the configuration nobody exercises.
  //
  // It is a root `onRequest`, so it also covers the two ENCAPSULATED surfaces
  // (`POST /v1/attachments`, `/api/auth/*`) and unmatched routes, on the same
  // measured basis the section below records for its own hooks. Setting the
  // header here rather than in `onSend` means it is present on error and 404
  // replies too, which is where a browser is most likely to first meet this
  // host.
  //
  // `hstsHeaderFor` returns `null` for anything but https, so this is silent in
  // local dev by construction — see its docblock for why emitting it there
  // would be a self-inflicted, uninstallable outage.
  // The three unconditional headers ride in the SAME hook, for the same reason
  // it is registered here rather than inside `options.security`: roughly sixty
  // test call sites build the app without that block, and a header only present
  // in the configuration nobody exercises is a control nobody can witness.
  // Unlike HSTS they carry no protocol condition — see `http/security-headers.ts`
  // for why each is a property of what this server is rather than a policy.
  app.addHook('onRequest', async (request, reply) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      void reply.header(name, value);
    }
    const hsts = hstsHeaderFor(request.protocol);
    if (hsts !== null) void reply.header('strict-transport-security', hsts);
    return undefined;
  });

  // ── Compressed responses (smoothness T11, spec D7, audit SM-06) ────────────
  //
  // gzip and brotli for anything over 1 KB, for a client that sends `Accept-Encoding`; a request
  // without that header gets the plain bytes, which is what the in-process MCP door
  // (`mcp/in-process-fetch.ts`: `app.inject` with the package's own headers, body parsed as text)
  // relies on. A board answer is ~146 KB of JSON and compresses about six-fold; the baseline
  // (item 7) could not say whether the edge does it for production (it saw only 401s of 27
  // bytes), so the server does not assume it. A response that already carries a
  // `content-encoding` is left alone by the plugin.
  //
  // UNCONDITIONAL, outside the `security` block and the `webOrigin` branch below, for the reason
  // HSTS is: `cors` lives inside `if (security?.webOrigin)`, so "beside cors" (the plan's
  // placement) would leave every call site that does not pass `security` — roughly sixty test
  // files and any deployment without it — uncompressed, and no test could witness it.
  //
  // CALLED, NOT `register`ed — MEASURED, and the reason is the whole of this paragraph. The plugin
  // works through an `onRoute` hook, and a hook added by a plugin that has not loaded yet reaches no
  // route declared before it does. `buildApp` is synchronous (around sixty call sites depend on
  // that) and declares nearly every route straight on `app`, so `void app.register(compress, …)`
  // compressed ONLY the routes declared inside a child `register` and answered `/v1/…/board`,
  // `/v1/me/workspaces` and the rest uncompressed — with no error and a green build (the first
  // draft of `test/http/compression.test.ts`, case 25.193, failed on exactly this: a bare
  // `Fastify()` with `register(compress)` then `get('/big')` returns 7,100 plain bytes). The
  // plugin is an ordinary `(instance, options, done)` function, so it is applied to the root
  // directly: its `onRoute` hook exists before the first route below is declared, and reaches the
  // encapsulated surfaces too (case 25.198). The `done` it calls is synchronous; a refusal of its
  // options throws here, at build time, not at the first request.
  compress(app, { encodings: ['br', 'gzip'], threshold: 1024 }, (err) => {
    if (err) throw err;
  });

  // ── The deployment security surface (Plan 11 Task 2) ───────────────────────
  //
  // Three controls, all keyed on `request.routeOptions.url` and all registered
  // as ROOT `onRequest` hooks.
  //
  // ## `routeOptions.url`, never `request.raw.url` — MEASURED, and the bypass
  // is total
  //
  // Probed against this repo's own fastify 5.12.1: with an exact-match set on
  // `raw.url`, `POST /v1/events` answered 429 and `POST /v1/events?x=1`
  // answered **200 with the handler run** — the limiter never fired, no error,
  // nothing in a log. `routeOptions.url` was `'/v1/events'` for BOTH. The same
  // property is what makes the invite mint expressible at all: its
  // `routeOptions.url` is the PATTERN `'/v1/workspaces/:workspaceId/invites'`,
  // colon included, so no resolved path ever has to be pattern-matched here.
  // `test/http/security-middleware.test.ts` carries a query-string bypass test
  // for each limited route; switching either hook back to `raw.url` reddens it.
  //
  // ## Root hooks DO reach the encapsulated routes — measured, not assumed
  //
  // `POST /v1/attachments` is declared inside `app.register(...)` and
  // `/api/auth/*` inside `void app.register(...)`, and this file has twice been
  // surprised by that boundary (the `websocket: true` `onRoute` silence, the
  // multipart content-type parser's scope). So it was probed rather than
  // reasoned about: a root `onRequest` fires for every route in this app,
  // including both encapsulated ones. `security-middleware.test.ts` keeps that
  // as a permanent wiring check which PRINTS the route patterns it saw — a hook
  // that fired nowhere would satisfy every other test in that file.
  //
  // ## Order: the limiter first, then HTTP-Origin
  //
  // A budget refusal precedes a provenance refusal. The limiter is what bounds
  // how much work an unauthenticated flood can make this process do, so it must
  // sit in front of everything, including the check that would refuse the same
  // request for a different reason.
  const security = options.security;
  if (security?.rateLimit) {
    const { authMax, eventsMax, inviteMax, mcpMax, signInMax, windowSec } = security.rateLimit;
    const now = security.now ?? Date.now;
    // Three INDEPENDENT limiters, not one keyed by prefix. A sign-in storm must
    // not spend the invite budget, and an offline client flushing a sync batch
    // must not lock a user out of signing in.
    const authLimiter = makeFixedWindowLimiter(authMax, windowSec);
    const eventsLimiter = makeFixedWindowLimiter(eventsMax, windowSec);
    const inviteLimiter = makeFixedWindowLimiter(inviteMax, windowSec);
    const mcpLimiter = makeFixedWindowLimiter(mcpMax, windowSec);
    const signInLimiter = makeFixedWindowLimiter(signInMax, windowSec);
    app.addHook('onRequest', async (request, reply) => {
      const routeUrl = request.routeOptions.url;
      const method = request.method;
      // NOT `request.ip` — see `rateLimitKeyFor`. Under `trustProxy: true`
      // `request.ip` is the leftmost X-Forwarded-For entry, which the caller
      // writes, and six requests varying it were measured to buy six buckets.
      const clientKey = rateLimitKeyFor(
        request.headers['x-forwarded-for'],
        request.ip,
        options.security?.trustProxy ?? false,
      );
      let verdict: { allowed: boolean; retryAfterSeconds: number } | null = null;
      if (routeUrl === '/api/auth/*') {
        // Every method the vendor mount answers (`GET` and `POST` — enumerated
        // in `auth/routes.ts`) EXCEPT `OPTIONS`. A CORS preflight is a browser
        // asking permission, not an attempt: charging it against a 10-per-
        // minute sign-in budget would let five genuine sign-ins exhaust the
        // window. Preflights reach this hook with `routeOptions.url` undefined
        // today, so this is belt-and-braces against the day `@fastify/cors`
        // matches one to a route.
        if (method !== 'OPTIONS') {
          verdict = authLimiter.check(`auth:${clientKey}`, now());
          // The fifth bucket, and the only PATH-classified one. Charged in
          // ADDITION to `auth:` above, never instead of it — see
          // `SecurityOptions.rateLimit.signInMax` for why replacing would
          // loosen the mount rather than tighten it.
          //
          // Charged even when `auth:` has ALREADY refused, deliberately: a
          // refused attempt is still an attempt, and letting it go unrecorded
          // would hand a client that has exhausted its general budget a fresh
          // sign-in budget the moment the general window rolls over.
          if (isSignInPath(request.url)) {
            const signInVerdict = signInLimiter.check(`signin:${clientKey}`, now());
            // Whichever bucket refuses, refuses, and when BOTH do the caller
            // is told the longer of the two waits.
            //
            // ## `retry-after` IS A LOWER BOUND HERE, and the earlier version
            // ## of this comment claimed it was not
            //
            // It read: "a `retry-after` that expires while the other bucket is
            // still shut is an invitation to come back and be refused again" —
            // stated as an invariant this code upholds. It does not. The
            // `Math.max` below covers only the case where both buckets refuse
            // the SAME request. The other shape is reachable and was MEASURED:
            // `auth:` refuses while `signin:` is still allowed but filling (it
            // is charged anyway, two lines up), so the two windows OPEN AT
            // DIFFERENT INSTANTS and `signin:` can stay shut long after `auth:`
            // reopens. At the shipped `RATE_LIMIT_AUTH_MAX=10` / 60s, a caller
            // was told **1 second** and was in fact refused for **59 more**.
            //
            // The overshoot is bounded by `windowSec` and it is a HINT, never a
            // bound: the caller that comes back early gets another 429 carrying
            // a fresh figure, and no request is admitted that should not be. It
            // is left as a lower bound rather than fixed here because the fix
            // is not local — a correct answer needs each bucket's window END,
            // which `RateLimitVerdict` does not carry, and widening that
            // contract touches all five buckets to sharpen an advisory header.
            // **Owner: whoever next changes `RateLimitVerdict`.** Case 13.280
            // pins the current behaviour so the fix has something to flip.
            if (!signInVerdict.allowed) {
              verdict = verdict.allowed
                ? signInVerdict
                : {
                    allowed: false,
                    retryAfterSeconds: Math.max(
                      verdict.retryAfterSeconds,
                      signInVerdict.retryAfterSeconds,
                    ),
                  };
            }
          }
        }
      } else if (method === 'POST' && (routeUrl === '/v1/events' || routeUrl === '/v1/sync')) {
        verdict = eventsLimiter.check(`events:${clientKey}`, now());
      } else if (method === 'GET' && routeUrl === '/v1/sync/bootstrap') {
        // DEVIATION from the plan's wire contract, which limits `POST /v1/sync`
        // and stops. `GET /v1/sync/bootstrap` is the most expensive read this
        // server serves — one `REPEATABLE READ` transaction spanning a whole
        // workspace's history — and an exact-match limiter on the POST beside
        // it would cap the cheap door and leave the expensive one open. It
        // shares the `events:` bucket deliberately: it is the same client doing
        // the same job (first-run sync), and two budgets would let one client
        // spend both.
        verdict = eventsLimiter.check(`events:${clientKey}`, now());
      } else if (method === 'POST' && routeUrl === '/v1/attachments') {
        // Charged to the `events:` bucket rather than left unlimited, and the
        // trade is worth naming. It is the most BYTE-expensive write this
        // server takes — a multipart body straight into the object store, up to
        // ATTACHMENT_MAX_BYTES each — and it was the one route in no bucket at
        // all, which is a strange place for the most expensive write to sit.
        //
        // Sharing the events budget rather than taking a fourth: it is the same
        // client doing the same job (adding content to a ticket), it needs no
        // fourth environment variable, and a separate budget would let one
        // client spend both. The cost of sharing, stated: a client uploading
        // heavily spends budget an event flush would otherwise have, so the two
        // contend. That is the correct direction for a shared resource — the
        // wrong direction is the one this replaces, where uploads were bounded
        // by nothing.
        verdict = eventsLimiter.check(`events:${clientKey}`, now());
      } else if (
        method === 'POST' &&
        (routeUrl === '/v1/workspaces/:workspaceId/invites' ||
          // Deviation D9: the lookup answers "does this address have an
          // account" — an address oracle, the same scarcity as minting a
          // credential, so it spends the same budget.
          routeUrl === '/v1/workspaces/:workspaceId/people-lookup')
      ) {
        // The second inherited errand — see `SecurityOptions.rateLimit`.
        // Per IP, not per user: `request.currentUserId` is written by
        // `requireSession`, which is a route-level `preHandler` and therefore
        // runs AFTER every `onRequest` hook. A per-issuer bucket is a different
        // seam (a `preHandler` on that one route) and a different control; this
        // one bounds the door, which is what a limiter is for.
        verdict = inviteLimiter.check(`invite:${clientKey}`, now());
      } else if (
        (method === 'GET' && routeUrl === '/oauth/authorize') ||
        (method === 'POST' &&
        (routeUrl === '/v1/mcp/device/code' ||
          routeUrl === '/v1/mcp/device/approve' ||
          routeUrl === '/v1/mcp/device/token' ||
          // The hosted door's public endpoints (register, token, revoke): open to
          // anyone, so they share the device flow's bucket rather than having none.
          // `GET /oauth/authorize` is charged too (the first clause above): it is
          // unauthenticated and writes a pending-consent row per call.
          routeUrl === '/oauth/register' ||
          routeUrl === '/oauth/token' ||
          routeUrl === '/oauth/revoke' ||
          // The hosted MCP endpoint itself (14.269): unauthenticated callers reach the
          // token lookup, and an authenticated one drives nine tools, so it is
          // charged here — per IP like its neighbours, since the bearer is only
          // resolved inside the handler.
          routeUrl === '/mcp'))
      ) {
        // The device flow's own bucket. Without this branch a route under
        // `/v1/mcp/...` matches NO bucket at all, which would leave the
        // 8-character user code an unlimited brute-force surface.
        verdict = mcpLimiter.check(`mcp:${clientKey}`, now());
      }
      // `/v1/stream` is deliberately absent, and this is a decision rather than
      // an omission. It is a GET WebSocket UPGRADE, and this hook does fire on
      // it (measured). A 429 sent there does not reach the client as
      // `{ error, retryAfterSeconds }` — it arrives as an opaque failed
      // upgrade, which a reconnecting client answers by reconnecting, which is
      // the loop a limiter is supposed to break. The control that actually
      // bounds that route already exists and is shaped for it:
      // `requireConnectionBudget` in `stream/routes.ts` caps concurrent sockets
      // PER USER, after `requireSession`, and refuses with a body the client
      // can read.
      if (verdict && !verdict.allowed) {
        // `return reply`, not a bare `await reply.send(...)`. The plan's form
        // was probed and answers 429 correctly too — Fastify does not run the
        // handler after it — so this is style, not a defect being fixed; it is
        // written this way because a reader should not have to know that.
        return reply
          .code(429)
          .header('retry-after', String(verdict.retryAfterSeconds))
          .send({ error: 'rate_limited', retryAfterSeconds: verdict.retryAfterSeconds });
      }
      return undefined;
    });
  }
  if (security?.webOrigin) {
    // The CSRF ruling's item 2, and the ONLY defence available on these routes
    // — not defence-in-depth. The reasoning, the term collision, and the
    // enumerated exclusions all live in `http/http-origin.ts`; this is the
    // wiring.
    const expectedOrigin = normalizeOrigin(security.webOrigin);
    app.addHook('onRequest', async (request, reply) => {
      if (
        httpOriginRefused({
          method: request.method,
          routeUrl: request.routeOptions.url,
          cookie: request.headers.cookie,
          origin: request.headers.origin,
          expectedOrigin,
        })
      ) {
        return reply.code(403).send(FORBIDDEN_ORIGIN_BODY);
      }
      return undefined;
    });
    // CORS, registered LAST of the three and for a caller that does not exist
    // yet — stated plainly rather than sold as a fix.
    //
    // **This closes no live breakage.** The shipped web client never makes a
    // cross-origin request: `apps/web`'s Next config REWRITES `/v1/*` and
    // `/api/auth/*` to `SERVER_ORIGIN` server-side, so the browser only ever
    // talks to its own origin and no preflight is ever issued. The reason to
    // ship it anyway is the callers the product is built for — the bearer-token
    // mobile and desktop clients — and any future browser client served from
    // `WEB_ORIGIN` directly rather than through a rewrite. A single allowed
    // origin, not a reflector: `origin: expectedOrigin` means a foreign origin
    // gets no `access-control-allow-origin` header at all.
    //
    // `credentials: true` is what makes the cookie usable from such a client,
    // and it is exactly why the HTTP-Origin hook above is registered BEFORE
    // this: CORS decides what a browser may READ, never what this server
    // ACCEPTS.
    //
    // `void app.register`, matching `auth/routes.ts` and the reason stated
    // there: `register` hands the plugin to avvio, which finishes before the
    // instance is ready, and `buildApp` stays synchronous — around sixty call
    // sites depend on that.
    //
    // The PREDICATE form, not `origin: expectedOrigin` — MEASURED, and the
    // difference is visible to anyone reading a response. Given a plain string,
    // `@fastify/cors` treats it as a STATIC value and emits
    // `access-control-allow-origin: http://localhost:3001` on a preflight from
    // `https://evil.example` too; the browser then refuses, because the header
    // does not name the asking origin. Correct, and unreadable: the wrong
    // origin gets an allow header addressed to somebody else, and anyone
    // checking this control by looking at a response sees an allow where there
    // is a refusal. With a predicate, a foreign origin gets **no**
    // `access-control-allow-origin` at all, which is what the refusal actually
    // is. `test/http/security-middleware.test.ts` pins both halves.
    void app.register(cors, {
      origin: (requestOrigin, callback) => {
        callback(null, requestOrigin === expectedOrigin);
      },
      credentials: true,
    });
  }

  /**
   * The probe, and the ONE fact it discloses beyond up/down.
   *
   * ## Unauthenticated, deliberately
   *
   * Two callers need this without a session and neither can get one: App
   * Platform's health probe, which decides whether a container joins the
   * router, and an operator watching a rollout, who is checking precisely
   * whether the thing that mints sessions came up. A gate here would make the
   * route useless to both.
   *
   * ## The sha, and only the sha (Ruling P33, 2026-09-06)
   *
   * This is a DELIBERATE, BOUNDED disclosure, in the same register as the
   * `{ kind: 'restricted', id }` this codebase already returns for an entity a
   * viewer may not read: the smallest fact that answers the operational
   * question, chosen over both silence and the fuller answer.
   *
   * What it answers: "which build is live?" — the question every rollback,
   * every "is my fix out yet", and every "the deploy said success" turns on.
   * A version an operator has to infer from a changelog is not an answer.
   *
   * What it deliberately does NOT carry, and why: the semver from
   * `package.json` (it moves on release, not on deploy, so two different
   * builds share it — and it is the number an attacker maps to a CVE list);
   * dependency versions (the same, multiplied); uptime, database name, pool
   * counts, migration state (each an inference about internals, none of them
   * something a probe needs). A commit sha is opaque to anyone without the
   * repository and exact to everyone with it, which is the property that makes
   * it the right size of leak.
   *
   * ## The 503 branch carries it too — decided, not overlooked
   *
   * The plan is silent here and the 503 body is the one an unauthenticated
   * prober is most likely to see, so it is worth stating the case both ways.
   *
   * AGAINST: an unhealthy service is a service under some kind of stress, and
   * the instinct is to say less on the failure path than on the success one.
   *
   * FOR, and this is what decides it: withholding the sha on 503 buys nothing,
   * because the same prober gets it from any healthy replica of the same
   * deployment on the very next request — the fact is not made secret by being
   * omitted here, only made unavailable at the one moment it matters. And it
   * matters most exactly here: a 503 during a rollout is the difference
   * between "the NEW build is broken, roll back" and "the database is down for
   * every build, rolling back changes nothing". A body that says `unavailable`
   * and nothing else cannot tell those apart, and that is the diagnosis an
   * operator is making at 2am. A shape that differed between branches would
   * also be its own small trap: a monitor written against the 200 body would
   * read `undefined` for the sha on the failure it exists to report.
   */
  app.get('/healthz', async (_request, reply) => {
    // `'dev'` when nothing wired a sha in — see `DEPLOY_SHA` in config.ts. A
    // blank would read as an answered question; `'dev'` reads as "this is not
    // a deploy", which is what an un-wired build actually is.
    const sha = options.deploySha ?? 'dev';
    try {
      await deps.db.query('SELECT 1');
      return { status: 'ok', sha };
    } catch {
      // THIS 503 DOES NOT PAGE, and the boundary is stated here rather than
      // only in `alerts/error-alerter.ts` because this is the route that
      // violates the general claim. The catch returns instead of rethrowing, so
      // `setErrorHandler` above never runs and `alertWithoutWaiting` is never
      // called: a deployment whose database has gone away answers 503 to the
      // load balancer and sends nothing to the webhook.
      //
      // That is a decision, not an omission. Task 3's alerting has no
      // coalescing, and a load balancer probes on a fixed cadence — alerting
      // from here would post one webhook per probe for the whole outage, until
      // the receiver rate-limits and drops the message that mattered. The
      // database-down case belongs with the process-level handlers `index.ts`
      // defers to the shutdown errand, which can fire once. Whoever adds
      // coalescing should revisit this line together with that errand.
      return reply.status(503).send({ status: 'unavailable', sha });
    }
  });

  // The events door reads `request.currentUserId`, so it is assembled WITH the
  // preHandler that writes it — the rule `require-session.ts` states, made
  // structural: `registerEventRoutes` takes the preHandler as an argument, so
  // there is no version of this line that forgets it and still compiles.
  const requireSession = makeRequireSession(deps.auth, deps.pool);
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
  // The note read surface (notes series, Plan 1 of 6) — list, one note, a
  // ticket's notes, comments, history and one version. Same preHandler by
  // parameter, same reason: every handler reads `request.currentUserId`, and the
  // three note-addressed paths learn their workspace from the note's own row
  // rather than from the URL (see `routes/notes.ts`).
  registerNoteRoutes(app, { pool: deps.pool }, requireSession);
  // "Linked from" (Knowledge Graph spec B): the backlinks read of proj_references.
  registerReferenceRoutes(app, { pool: deps.pool }, requireSession);
  // One ticket's history at a workspace-free path (Plan 3 Task 13) — the ledger
  // filtered to that ticket, paged by `afterSeq`/`limit`, as
  // `TicketHistoryEvent`s. It is NOT a duplicate of the `/events` door
  // registered directly above: different path, different contract, both owed by
  // their plans, and `routes/ticket-history.ts` carries the argument plus the
  // cross-route agreement test that keeps the two from drifting. Same
  // preHandler by parameter, same reason as its three neighbours: the handler
  // reads `request.currentUserId`.
  registerTicketHistoryRoute(app, { pool: deps.pool }, requireSession);
  // One ticket's typed links, both directions, visible ends only (typed-links
  // plan T4; spec A §2.4). Same preHandler by parameter, same reason.
  registerTicketLinkRoutes(app, { pool: deps.pool }, requireSession);
  // The founding door and the workspace directory (Plan 4 Task 13). It takes
  // `deps.ingest` — the NARROWED `ClientIngest`, same as the events door — so
  // the route that creates workspaces cannot reach the internal append path
  // either, and the same preHandler by parameter, for the same reason: both
  // handlers read `request.currentUserId`.
  registerWorkspaceRoutes(app, { pool: deps.pool, ingest: deps.ingest }, requireSession);
  // The Deleted items read (trash series, Plan 1 Task 7, spec §6.3) — every
  // deleted workspace, project, ticket or note this caller may currently
  // restore or mark. Registered beside the workspace directory: same door,
  // same "me"-scoped shape, no workspace id in the path.
  registerDeletedItemsRoutes(app, { pool: deps.pool }, requireSession);
  // The purged-id lookup (trash series Plan 3, D1): which of the ids a caller
  // holds were permanently erased. Same "me"-scoped door as Deleted items.
  registerPurgedLookupRoute(app, { pool: deps.pool }, requireSession);
  // The invitation surface (Plan 4 Task 14): issue, read a link, accept a link,
  // list what is outstanding. It takes BOTH doors — the gated `ingest` for
  // issuance, so the admin-only refusal fires exactly as it would on
  // `POST /v1/events`, and the named `serverAppend` for acceptance, whose three
  // events are all refused at the client door by design.
  registerInviteRoutes(
    app,
    {
      // A `Pool` because the mint takes a dedicated client for its advisory lock
      // (`AppDeps.pool` is declared `Queryable`; `buildApp` is always handed a Pool).
      pool: deps.pool as Pool,
      ingest: deps.ingest,
      serverAppend: deps.serverAppend,
      webOrigin: deps.webOrigin,
      mailer: deps.inviteMailer ?? new LogInviteMailer(() => {}),
      alerter,
    },
    requireSession,
  );
  // Access plan Task 6 — the exact-email lookup and the outsider door.
  registerPeopleRoutes(app, { pool: deps.pool, ingest: deps.ingest, serverAppend: deps.serverAppend }, requireSession);
  registerMemberRoutes(app, { pool: deps.pool, ingest: deps.ingest }, requireSession);
  // The CALLER-scoped half of that surface (Task 17): the invitations addressed
  // to the signed-in person's verified email, plus Accept and Decline for them.
  // A separate module rather than four more handlers in `routes/invites.ts`,
  // because the question it answers is a different one — that file is
  // admin-and-token shaped and keys on a workspace or a link, this one keys on
  // WHO IS ASKING and on nothing the caller sends, which is the family
  // `/v1/me/work` and `/v1/me/notifications` belong to.
  //
  // It takes `serverAppend` and NOT `ingest`: both of its mutations append
  // `invite.accepted` / `invite.declined`, and both are refused at every client
  // door by design, so there is no gated path either could travel.
  registerMyInvitationRoutes(
    app,
    { pool: deps.pool, serverAppend: deps.serverAppend },
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
  // The project-group tree (prefixes and groups Task 6): one flat read, owner/admin/member only.
  registerGroupRoutes(app, { pool: deps.pool }, requireSession);
  // Knowledge Graph spec D §5.1 `similar` (KG-D T2): the nearest visible tickets and notes to one item by
  // meaning, read from the embed worker's chunk caches. Same door as the group tree: a member read, 404 otherwise.
  registerSimilarRoutes(app, { pool: deps.pool }, requireSession);
  // Knowledge Graph spec D §5.1 concepts (KG-D T4): list, get, history, audience; D4 decided at read time, 404 otherwise.
  registerConceptRoutes(app, { pool: deps.pool }, requireSession);
  // KG-D T5: the suggestion job's cache, member read, D4 per reader at read time, 404 otherwise.
  registerSuggestionRoutes(app, { pool: deps.pool }, requireSession);
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
  // The Knowledge Graph's ring read (spec C §2.2): one ring per call, the viewer from the session, visibility per workspace;
  // and spec D's path and trace (§5.1), walked through the ring read's own visibility.
  registerGraphRoutes(app, { pool: deps.pool }, requireSession);
  registerGraphQueryRoutes(app, { pool: deps.pool }, requireSession);
  // The attention strip (Plan 5 Task 12) — the first read that is COMPUTED from
  // the stored claims AND THE CLOCK, and stored nowhere: blocked flags, an IST
  // staleness window and an IST due window, with the two thresholds read from
  // the workspace's own `workspace.settings_set` claim rather than from
  // constants. `deps.now` is threaded through UNDEFAULTED on purpose — the
  // default lives in `registerAttentionRoutes` — but NOT only there: Task 15's
  // `registerStreamRoute` defaults it too, for the heartbeat deadline, and so does
  // spec E's `registerHomeRoutes`. All three get this same optional field, so
  // pinning it pins all three. There is not one definition of the real clock. Same preHandler by parameter, same reason as every route
  // above it: the handler reads `request.currentUserId` and resolves its whole
  // tenancy gate from it.
  registerAttentionRoutes(app, { pool: deps.pool, now: deps.now }, requireSession);
  // Home (Knowledge Graph spec E): six numbers over the viewer's visible items, IST due days from `deps.now`.
  registerHomeRoutes(app, { pool: deps.pool, now: deps.now }, requireSession);
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
  // Notification preferences (account/help-screens plan, Task 5) — a global,
  // per-kind mute list. Same preHandler by parameter as every route above
  // it, and no `requireMember` gate: unlike `registerPreferencesRoutes`,
  // there is no workspace here to be a member OF — the Inbox itself is a
  // global route, and so is this.
  registerNotificationPreferencesRoutes(app, { pool: deps.pool }, requireSession);

  registerMcpDeviceRoutes(app, { pool: deps.pool, webOrigin: deps.webOrigin }, requireSession);

  registerMcpTokenRoutes(app, { pool: deps.pool }, requireSession);
  registerMcpConnectionRoutes(app, { pool: deps.pool, publicUrl: deps.mcpPublicUrl ?? null }, requireSession);
  registerMeDeviceRoutes(app, { pool: deps.pool }, requireSession);
  registerMePasskeyRoutes(app, { pool: deps.pool }, requireSession);
  // The hosted MCP door — present only when the API knows its own public URL.
  if (deps.mcpPublicUrl) {
    registerMcpOAuthRoutes(
      app,
      { pool: deps.pool, webOrigin: deps.webOrigin, publicUrl: deps.mcpPublicUrl },
      requireSession,
    );
    registerMcpHttpRoute(app, {
      pool: deps.pool,
      publicUrl: deps.mcpPublicUrl,
      // The two hosts that call this door from a browser-shaped context, and our own web.
      allowedOrigins: ['https://claude.ai', 'https://chatgpt.com', deps.webOrigin],
    });
  }
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
  // The embedding worker's NUDGE (Plan 3 of 6, spec §7.6) — the third listener on
  // the commit feed, and the only one that tells a background loop rather than a
  // person or a socket. Since KG-D T2 it is "a text that is embedded changed":
  // a note's (`nudgesEmbedding`) or a ticket's or ticket comment's
  // (`nudgesItemEmbedding`); the callback keeps its note-era name. The loop itself is started in `index.ts` beside the
  // snapshot writer; see `AppDeps.onNoteBodyCommitted` for why the split is
  // where it is.
  //
  // FIRE-AND-FORGET, like the fan-out above and for a stronger reason: the
  // callback's whole job is to schedule work for later, so there is nothing for
  // a request to wait on and nothing a slow embedding could slow down.
  //
  // Since KG-D T5 the same filtered event also tells the suggestion scheduler which WORKSPACE changed
  // (`onSemanticChange`, its 200-change trigger): one listener, one predicate, two callbacks.
  //
  // Registered ONLY when the caller supplied either callback. Without this guard
  // every `buildApp` in the suite would take a subscription it has no use for
  // and could never observe — and the suite's own app fixtures would each hold
  // a live listener on the ingest service they were built over.
  if (deps.onNoteBodyCommitted !== undefined || deps.onSemanticChange !== undefined) {
    const { onNoteBodyCommitted, onSemanticChange } = deps;
    const unsubscribeEmbedNudge = deps.ingest.onEventCommitted((event) => {
      if (!(nudgesEmbedding(event) || nudgesItemEmbedding(event))) return;
      onNoteBodyCommitted?.(event.entity.id);
      onSemanticChange?.(event.workspaceId);
    });
    app.addHook('onClose', () => {
      unsubscribeEmbedNudge();
    });
  }
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
// Which social methods this instance will accept, read back off the auth
// instance itself so the sign-in page cannot offer one the server refuses.
registerAuthMethodRoutes(app, deps.auth);

  return app;
}
