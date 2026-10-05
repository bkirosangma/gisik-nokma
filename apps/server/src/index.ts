import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { alerterFromConfig } from './alerts/error-alerter.js';
import { buildApp } from './app.js';
import { createObjectStoreFromEnv } from './attachments/store-config.js';
import { createAuth } from './auth/auth.js';
import type { SmtpLog } from './auth/smtp-magic-link-sender.js';
import { selectInviteMailer } from './invites/invite-mailer.js';
import { selectMagicLinkSender, selectOtpSender } from './auth/select-senders.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { buildServerGates } from './gates/index.js';
import { signInMaxFor } from './http/rate-limit.js';
import { createIngestService } from './ingest/ingest-service.js';
import { startReferencesBackfill } from './projections/backfill-references.js';
import { buildProjectionRegistry } from './projections/index.js';
import { discardDraft } from './purge/discard-draft.js';
import { installShutdownHandlers, isShuttingDown } from './shutdown.js';
import { startSnapshotWriter } from './sync/snapshot-writer.js';
import { startEmbedWorker } from './search/embed-worker.js';

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
  // The SMTP connection-phase records (`connectionPhaseLogger`) go to the app
  // logger, which only exists after `buildApp` — the same holder trick as
  // `nudgeEmbedWorker` below. Null for the few statements before the
  // assignment; nothing sends mail in that window.
  let appLog: { info: (fields: object, message: string) => void } | null = null;
  const smtpLog: SmtpLog = (fields, message) => appLog?.info(fields, message);
  const auth = createAuth({
    pool,
    // The senders, chosen by `select-senders.ts` and by nothing here.
    //
    // Both decisions used to be inline at this spot, which made them decisions
    // no test could reach: `main()` opens a pool on its first line, so nothing
    // in the suite could observe that the production OTP sender had quietly
    // become the one that logs codes again. They are pure functions of config
    // now, and `test/auth/select-senders.test.ts` fails if either flips.
    //
    // What changed here, and it is the errand Plan 4 recorded and left open:
    // this line used to read `new LogOtpSender()`. That sender wrote every
    // one-time code to the process log AND kept every code it ever issued in an
    // unbounded in-process array, on the path a real deployment runs. Both are
    // gone from production because the class is gone from production —
    // `selectOtpSender()` returns a `NullOtpSender`, which holds no state and
    // refuses with a 501 a client can render, because there is no
    // DLT-registered SMS channel for it to be honest about.
    otpSender: selectOtpSender(),
    // `SMTP_URL` set means real mail (Mailpit in dev-compose, any SMTP provider
    // in production — the vendor stays out of this repository); unset keeps the
    // log sender, which is the dev path and not a degraded server.
    magicLinkSender: selectMagicLinkSender(config, smtpLog),
    // Both come from validated configuration, not from `process.env` with a
    // fallback: a server that silently signs sessions with a secret checked into
    // the repository is worse than a server that will not start.
    baseUrl: config.betterAuthUrl,
    secret: config.betterAuthSecret,
    // The origin the browser is served from, so better-auth trusts the product's
    // own client. Without it `trustedOrigins` holds only this server's origin,
    // which is not what any browser sends, and every cookie-carrying POST from
    // the web app is refused with INVALID_ORIGIN. Measured against the shipped
    // compose stack, not inferred.
    webOrigin: config.webOrigin,
  });
  // The embedding worker (notes series, Plan 3 of 6, spec §7.6) is created
  // BELOW, beside the snapshot writer, but `buildApp` registers its commit
  // listener at build time — so the callback has to exist first, and the loop
  // wants `app.log` for its failures, which only exists afterwards. Hence a
  // holder: it is null for exactly the few statements between here and its
  // assignment, and nothing can call it in that window because nothing is
  // listening yet.
  let nudgeEmbedWorker: ((noteId: string) => void) | null = null;
  // Where attachment bytes land, decided by `OBJECT_STORE` and nothing
  // else: local disk in dev, S3-compatible where one is configured.
  // `createObjectStoreFromEnv` is the ONE seam that reads those names, so
  // no other file needs an `if (env.OBJECT_STORE === …)`. No new variable is
  // introduced here — every name it reads is already documented in
  // `.env.example` and already checked by `scripts/check-env-example.mjs`.
  // Hoisted out of `buildApp`'s deps so the draft erasure below deletes from
  // the same store the attachment routes write to.
  const store = createObjectStoreFromEnv(process.env);
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
      mcpPublicUrl: config.mcpPublicUrl,
      inviteMailer: selectInviteMailer(config, smtpLog),
      // The commit-feed listener `app.ts` registers when this is given. It
      // forwards to the worker created below; `EMBED_WORKER_ENABLED=false`
      // leaves the worker uncreated, and this closure then drops the nudge on
      // the floor — which is the honest behaviour, since there is nothing to
      // nudge and the alternative (not passing the callback at all) would mean
      // the boot path branched around a config knob it should read in one place.
      onNoteBodyCommitted: (noteId) => {
        nudgeEmbedWorker?.(noteId);
      },
      // The draft erasure (drafts spec R15): the real thing, over this process's pool, registry and object store. The
      // purge sweep (`backup-daemon-main.ts`, job `purge`) retries whatever this misses.
      onDraftDiscarded: async (ticketId) => {
        await discardDraft(pool, ticketId, { projections, store, now: new Date() });
      },
      store,
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
      // NOT installed here, against the plan text: registering them suppresses
      // Node's own crash, so a bug that today kills the process would instead
      // leave it listening in an unknown state. This comment used to defer them
      // to "the SIGTERM/shutdown errand this file still owes". **That errand has
      // landed** — `installShutdownHandlers`, called below and living in
      // `shutdown.ts` — and it declined them on the same merits rather than
      // passing the deferral on again, so the deferral is closed, not
      // outstanding. The one narrow exception is an `uncaughtException`
      // listener that exists only WHILE a shutdown is running, for a close hook
      // that throws synchronously; the reason it does not reopen this decision
      // is argued where it is installed.
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
          // Same knob as invites, for the reason `SecurityOptions.rateLimit`
          // gives: a fourth bucket, no fourth environment variable.
          mcpMax: config.rateLimitAuthMax,
          // HALF the auth budget. At the shipped `RATE_LIMIT_AUTH_MAX=10` this
          // is 5 — the same integer better-auth's magic-link plugin enforced,
          // but NOT the same budget and NOT parity: better-auth keyed per
          // (ip, path), so each leg of a cycle had its own 5, where this is one
          // bucket across the whole sign-in family and a cycle costs two of it.
          // Two complete cycles per window, not five. `signInMaxFor`'s docblock
          // carries the arithmetic and why the tightening is kept anyway; an
          // earlier version of this comment called it parity and was wrong.
          //
          // A hard-coded 5 was measured and rejected. The e2e stack runs seven
          // sign-in cycles per run, and better-auth's rule matched BOTH
          // `/sign-in/magic-link` and `/magic-link/verify`, so a cycle costs
          // two: fourteen charges against a bucket of five. The dev stack sets
          // `RATE_LIMIT_AUTH_MAX=60` precisely because its web container
          // proxies every browser into ONE client key, and half of that is 30 —
          // so the same expression that ships parity in production leaves the
          // suite the headroom that same collapse requires. One knob, two
          // correct answers.
          //
          // `Math.max(1, …)` because `authMax` is only constrained positive:
          // at `RATE_LIMIT_AUTH_MAX=1` the floor would be 0, and a bucket of
          // zero refuses the first request, turning a tightening into a total
          // sign-in outage.
          signInMax: signInMaxFor(config.rateLimitAuthMax),
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
  appLog = app.log;
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
  // 3. **Stopped on Fastify's `onClose` — and that day has now arrived.** The
  //    plan said to "call `stopSnapshots()` in the shutdown path beside the
  //    existing pool/app close calls", and when this was written there was no
  //    such path: no SIGTERM handler, no `pool.end()`, no `app.close()`. The
  //    stop function was hung on the hook Fastify already provides, with the
  //    note that "on the day Plan 11 adds a real shutdown, the writer stops
  //    without anyone having to remember it exists". **This file now installs
  //    that shutdown** (`installShutdownHandlers`, called below and defined in
  //    `shutdown.ts`), so the hook below is no longer a hook nothing calls: it
  //    awaits `app.close()` on SIGTERM/SIGINT, which fires this hook alongside
  //    the two `app.ts` registers, and only then ends the pool. The deferral was the
  //    right call and it cost nothing: not one line of this registration
  //    changed when the shutdown landed.
  //
  //    What is unchanged: the writer still runs for the life of a `pnpm dev`
  //    process that is never signalled, which is correct — an unref'd interval
  //    holds nothing open.
  const stopSnapshots = startSnapshotWriter(pool, {
    intervalMs: config.snapshotIntervalMs,
    minEvents: config.snapshotMinEvents,
    // wtg2 T9: the first pass runs at boot, so snapshots written before work periods are restated at deploy. Until it
    // settles, a ticket whose row is still stale is refused with a 503 (`bootRestate`, wtg2 fold-version bootstrap), and
    // after it one whose stale row was created after the pass read its due set (an old instance's, wtg2 fold-version overlap).
    immediate: true,
    log: (msg) => {
      app.log.warn(msg);
    },
  });
  app.addHook('onClose', () => {
    stopSnapshots();
  });

  // The embedding worker (notes series, Plan 3 of 6, spec §7.6), the second
  // background loop beside the snapshot writer and here for the same three
  // reasons its comment gives: not inside `buildApp` (around sixty test files
  // call it), started before `listen` (an unref'd interval fires nothing for a
  // whole interval), and stopped on `onClose` so `installShutdownHandlers`'
  // `app.close()` reaches it.
  //
  // `EMBED_WORKER_ENABLED=false` is the operator's escape from the model's
  // 130 MB: without this loop a box short on memory serves the whole product
  // except `mode=meaning` search, which then answers from chunks that stop
  // being refreshed rather than failing. The interval is ALSO the backfill and
  // the re-index after a model change, so a disabled worker means a database
  // that has never embedded anything stays that way until it is re-enabled.
  const embedWorker = config.embedWorkerEnabled
    ? startEmbedWorker(pool, {
        intervalMs: config.embedWorkerIntervalMs,
        log: (msg) => {
          app.log.warn(msg);
        },
      })
    : null;
  nudgeEmbedWorker =
    embedWorker === null
      ? null
      : (noteId) => {
          embedWorker.nudge(noteId);
        };
  app.addHook('onClose', () => {
    embedWorker?.stop();
  });

  // Knowledge Graph B: the one-shot proj_references backfill. Started AFTER listen and
  // never awaited, so boot and health checks never wait for it; stopped on onClose
  // so a SIGTERM mid-run ends it between entities (no marker: the next boot re-runs it).
  const referencesBackfill = startReferencesBackfill(pool, {
    projections,
    log: (msg) => {
      app.log.warn(msg);
    },
  });
  app.addHook('onClose', async () => {
    await referencesBackfill.stop();
  });

  // BEFORE `listen`, so there is no window in which this process is alive and
  // ignoring SIGTERM — on PID 1 that window is not a race with a default
  // disposition, it is a window with NO disposition at all. See `shutdown.ts`
  // for the measurement and the bounds.
  installShutdownHandlers(app, pool);

  await app.listen({ port: config.port, host: config.host });
  referencesBackfill.run();
}

main().catch((error: unknown) => {
  // A signal that arrives while `app.listen` is still in flight can reject that
  // await — `app.close()` from the shutdown path is one way it happens. Exiting
  // 1 there would report a clean, requested stop as a crash, so the shutdown
  // path keeps the exit it already owns.
  if (isShuttingDown()) return;
  console.error(error);
  process.exit(1);
});
