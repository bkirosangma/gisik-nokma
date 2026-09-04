import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp } from './app.js';
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
  const pool = createPool(config.databaseUrl);
  const projections = buildProjectionRegistry();
  // `gates` switches on the server-owned refusals: an embedded attachment must
  // be this ticket's own image, and named evidence must exist on this ticket.
  // This is the only NON-TEST site that passes them, and
  // `test/gates/gate-seam.test.ts` pins what `buildServerGates()` covers.
  //
  // Two corrections to what this comment used to say, both found by review:
  //
  // 1. It claimed "every test suite" leaves `gates` out and gets the ungated
  //    default. **Three do not.** `test/gates/gate-seam.test.ts`,
  //    `evidence-gate.test.ts` and `image-embed-gate.test.ts` all pass
  //    `buildServerGates()` deliberately — measured, 3 of the 13 test files
  //    that build an ingest service. The false absolute had already been
  //    copied from here into a `Features.md` bullet before anyone checked it.
  //
  // 2. It said "nothing boots this composition root". **`pnpm dev` boots it**
  //    (`tsx src/index.ts`). What is true is narrower and worth stating
  //    precisely: there is no `start` script, no Dockerfile and no deployment
  //    target, so there is no PRODUCTION for these gates to be real in. "Wired
  //    at the one composition root the repo has" is the honest claim.
  //
  // AND THE CONSEQUENCE NEITHER SENTENCE DREW, which is the part that matters:
  // `buildApp` does not call `registerAttachmentRoutes` — swept, and the only
  // occurrence in `src/` is its own definition at `routes/attachments.ts:211`,
  // against a positive control where `registerEventRoutes` resolves to its real
  // call site at `app.ts:204`. So on the server this repo actually starts, the
  // `attachments` table can never gain a row, because the only writer is the
  // POST handler in that unregistered module. `image-embed-gate`'s
  // `attachment.embed-unknown` branch fires whenever an embedded attachmentId
  // has no row for the ticket — so **every inline image would be refused**, and
  // the refusal would be correct about the rule and useless as a product.
  // Recorded, not fixed: registering those routes is not in Plan 7's task text,
  // and turning an editor plan into a deployment change is not this step's call.
  // **Owner: Plan 11's deployment work** — which owns the boot path, the
  // `start` script and the deployment target this all waits on.
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
    },
    { logLevel: config.logLevel },
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
  //    boot path** (see the `attachments` note above, which defers to it for the
  //    same reason). So the stop function is hung on the hook Fastify already
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
