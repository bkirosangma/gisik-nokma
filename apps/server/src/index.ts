import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { alerterFromConfig } from './alerts/error-alerter.js';
import { buildApp } from './app.js';
import { createObjectStoreFromEnv } from './attachments/store-config.js';
import { createAuth } from './auth/auth.js';
import { LogMagicLinkSender } from './auth/magic-link-sender.js';
import { LogOtpSender } from './auth/otp-sender.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { buildServerGates } from './gates/index.js';
import { createIngestService } from './ingest/ingest-service.js';
import { buildProjectionRegistry } from './projections/index.js';
import { startSnapshotWriter } from './sync/snapshot-writer.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  // The CA for managed Postgres, when one is configured. Local runs set nothing
  // and the pool is byte-for-byte what it was.
  const pool = createPool(config.databaseUrl, { caCert: config.databaseCaCert });
  const projections = buildProjectionRegistry();
  // `gates` switches on the server-owned refusals: an embedded attachment must
  // be this ticket's own image, and named evidence must exist on this ticket.
  // This is the only NON-TEST site that passes them, and
  // `test/gates/gate-seam.test.ts` pins what `buildServerGates()` covers.
  //
  // Two corrections to what this comment used to say, both found by review —
  // and, third, the consequence neither sentence drew, which has since been
  // fixed rather than only recorded:
  //
  // 1. It claimed "every test suite" leaves `gates` out and gets the ungated
  //    default. **Three do not.** `test/gates/gate-seam.test.ts`,
  //    `evidence-gate.test.ts` and `image-embed-gate.test.ts` all pass
  //    `buildServerGates()` deliberately — measured, 3 of the 13 test files
  //    that build an ingest service. The false absolute had already been
  //    copied from here into a `Features.md` bullet before anyone checked it.
  //
  // 2. It said "nothing boots this composition root". **`pnpm dev` boots it**
  //    (`tsx src/index.ts`). Its replacement claim — "there is no `start`
  //    script, no Dockerfile and no deployment target" — has now been overtaken
  //    TWICE, and both halves are worth stating precisely rather than quietly
  //    deleting.
  //
  //    The `start` half was **already false when it was written**: `apps/web`
  //    has carried `"start": "next start -p 3001"` since before this comment
  //    landed (`git log -S` puts the script at an earlier commit than the
  //    sentence). What was true, and is what the sentence meant, is that
  //    `apps/server` has no `start` script — it still does not.
  //
  //    The Dockerfile half is false as of THIS lane: `apps/server/Dockerfile`
  //    and `apps/web/Dockerfile` exist and both build. So the honest claim is
  //    now narrower again: there is a way to package this server, and there is
  //    still **no deployment** — nothing has been applied to a live host, by
  //    deliberate scope. These gates are real in an image nobody has run in
  //    production yet.
  //
  // 3. THE CONSEQUENCE NEITHER SENTENCE DREW — **now FIXED, and recorded here
  //    because the defect is the useful part.** `buildApp` did not call
  //    `registerAttachmentRoutes`: swept, and the only occurrence in `src/` was
  //    its own definition, against a positive control where
  //    `registerEventRoutes` resolved to a real call site. So on the server this
  //    repo starts, the `attachments` table could never gain a row — the only
  //    writer is the POST handler in that module — and `image-embed-gate`'s
  //    `attachment.embed-unknown` branch fires whenever an embedded
  //    attachmentId has no row for its ticket, so **every inline image was
  //    refused**, correctly about the rule and uselessly as a product.
  //
  //    Plan 11 (this lane) owned it as deployment work and did it:
  //    `app.ts` now registers both attachment routes, `AppDeps.store` carries
  //    the `ObjectStore` they need, and it is built from `OBJECT_STORE*` right
  //    below. What made the gap survive so long is the shape worth remembering:
  //    the two attachment suites mount a bare `Fastify()` and register the
  //    routes BY HAND, so both were green with the composition root empty. The
  //    test that can actually fail on it is
  //    `test/routes/attachments-wired.test.ts`, which registers nothing and
  //    goes through `buildApp`.
  const ingest = createIngestService({
    pool,
    evaluate: evaluateEvent,
    projections,
    gates: buildServerGates(),
  });
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
  const app = buildApp(
    {
      db: pool,
      pool,
      ingest,
      auth,
      // The internal door, handed over as a named capability. `ingest` above is
      // the same object, narrowed to `ClientIngest` on the way in, so no route
      // but the one that was given this can reach the ungated path.
      serverAppend: (events) => ingest.ingestBatch(events),
      webOrigin: config.webOrigin,
      // Where attachment bytes land, decided by `OBJECT_STORE` and nothing
      // else: local disk in dev, S3-compatible where one is configured.
      // `createObjectStoreFromEnv` is the ONE seam that reads those names, so
      // no other file needs an `if (env.OBJECT_STORE === …)`; this is its only
      // non-test call site. No new variable is introduced here — every name it
      // reads is already documented in `.env.example` and already checked by
      // `scripts/check-env-example.mjs`.
      store: createObjectStoreFromEnv(process.env),
    },
    {
      logLevel: config.logLevel,
      // The one non-test boot path, so the one place the deploy sha reaches
      // `/healthz`. Everything else gets the `'dev'` default, which is honest
      // about what it is.
      deploySha: config.deploySha,
      // The one non-test boot path, so the one place errors that reach
      // Fastify's error handler actually phone somewhere (Plan 11 Task 3).
      // NOT every 5xx: `/healthz` answers its own 503 without throwing and so
      // pages nobody — the boundary and its reason are recorded at that route
      // in `app.ts`. `ALERT_WEBHOOK_URL` unset yields a
      // `NoopErrorAlerter`, which is the dev default and not a degraded server;
      // the error is in the structured log either way.
      //
      // PROCESS-LEVEL handlers (`unhandledRejection`, `uncaughtException`) are
      // NOT installed here, against the plan text — see the deviation recorded
      // beside the snapshot writer's shutdown note below: registering them
      // suppresses Node's own crash, so a bug that today kills the process
      // would instead leave it listening in an unknown state. That belongs with
      // the SIGTERM/shutdown errand this file still owes, not with an alerting
      // hook.
      alerter: alerterFromConfig(config.alertWebhookUrl),
      // The one non-test boot path, so the one place the security surface is
      // ON (Plan 11 Task 2). Absent everywhere else, which is the contract
      // `SecurityOptions` states: the controls are opt-in so that around sixty
      // test files keep the throughput they were written against.
      security: {
        // Feeds BOTH the CORS allow-list and the HTTP-`Origin` check the CSRF
        // ruling requires on cookie-authenticated product mutations. It is the
        // same value that hosts every invitation link this server mints, which
        // is the point: there is one web client, and one origin it lives at.
        webOrigin: config.webOrigin,
        rateLimit: {
          authMax: config.rateLimitAuthMax,
          eventsMax: config.rateLimitEventsMax,
          // NO NEW ENVIRONMENT VARIABLE, deliberately. The invite bucket takes
          // the AUTH budget (10/min by default), not the events one (120/min),
          // because minting an invitation is the same KIND of scarce act as
          // asking for a sign-in code: each one produces a credential that
          // reaches a person's inbox and grants membership when spent. 120 a
          // minute is a batch-ingest budget and would be no bound at all here.
          // It is a separate LIMITER over the same number, so invite issuance
          // and sign-in cannot spend each other's window. The day this wants
          // its own knob, `RATE_LIMIT_INVITE_MAX` lands on this line and on
          // `.env.example`, and nothing else moves.
          inviteMax: config.rateLimitAuthMax,
          windowSec: config.rateLimitWindowSec,
        },
        // Without this, `request.ip` behind App Platform's router is the ROUTER
        // for every client, so all of them share one bucket and the limiter
        // becomes a shared outage. `config.trustProxy` is the deployment saying
        // there is a trusted proxy in front; the default is `false` because
        // believing `X-Forwarded-For` from an untrusted hop lets a caller pick
        // its own source address and mint unlimited buckets.
        trustProxy: config.trustProxy,
      },
    },
  );
  // The snapshot writer (Plan 10 Task 5), and THREE deliberate departures from
  // what the plan text said to do here. Each is a place the repo disagreed with
  // the plan, and the repo won.
  //
  // 1. **Not inside `buildApp`.** Every route in this server is registered
  //    there, so that is where a reader looks first — but this is an interval
  //    timer, not a route, and `buildApp` is called by around sixty test files.
  //    Registering it there would start a five-minute timer in each of them, and
  //    a pass firing mid-test would write snapshots into a fixture database
  //    nothing expects them in. `index.ts` is the one non-test boot path, which
  //    makes it the honest home for a background sweep.
  //
  // 2. **Before `app.listen`, not after.** The plan says "after the server
  //    starts listening". Fastify refuses `addHook` once the instance has
  //    started — probed against this repo's fastify 5, which throws
  //    `FST_ERR_INSTANCE_ALREADY_LISTENING: Fastify instance is already
  //    listening. Cannot call "addHook"!` — so the registration has to happen
  //    first, and
  //    splitting the pair across the listen call would leave the writer running
  //    with nothing arranged to stop it. Nothing fires immediately — the first
  //    pass is one whole interval away — so starting before listen costs
  //    nothing.
  //
  // 3. **Stopped on Fastify's `onClose`, because the shutdown path the plan
  //    named DOES NOT EXIST.** The plan says to "call `stopSnapshots()` in the
  //    shutdown path beside the existing pool/app close calls". There is no
  //    SIGTERM handler in this file, no `pool.end()` and no `app.close()` — this
  //    process runs until it is killed. Inventing a signal handler here would be
  //    turning a snapshot task into a deployment change, and **Plan 11 owns the
  //    boot path** — the same owner the `attachments` note above named, and that
  //    note has since been discharged; THIS claim has not, and stands: there is
  //    still no SIGTERM handler here. So the stop function is hung on the hook
  //    Fastify already
  //    provides: today nothing calls `app.close()` and the writer runs for the
  //    life of the dev process — which is correct, an unref'd interval holds
  //    nothing open — and on the day Plan 11 adds a real shutdown, the writer
  //    stops without anyone having to remember it exists.
  const stopSnapshots = startSnapshotWriter(pool, {
    intervalMs: config.snapshotIntervalMs,
    minEvents: config.snapshotMinEvents,
    log: (msg) => {
      app.log.warn(msg);
    },
  });
  app.addHook('onClose', () => {
    stopSnapshots();
  });

  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
