import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

// ── Graceful shutdown (SIGTERM / SIGINT) ───────────────────────────────────
//
// THE DEFECT THIS CLOSES, measured against the image this repo builds
// (`apps/server/Dockerfile`), not reasoned about. The entrypoint is
// `sh -c '… exec "$@"'` with `CMD ["node","dist/index.js"]`, and `exec` makes
// sh REPLACE itself with node — so node is **PID 1**. PID 1 has no default
// signal dispositions: the kernel delivers a signal to it only if the process
// installed a handler, so with `index.ts` as it stood, **SIGTERM was ignored**.
// Timed with `docker stop -t 3`:
//
//     no handler        3197 ms   signal ignored; docker fell through to SIGKILL
//     with a handler     172 ms   handler ran, process exited on its own
//
// Every deploy was therefore a hard kill after the grace period: in-flight
// requests severed mid-response, the snapshot writer's interval never stopped,
// the stream hub's sockets and the notification fan-out's subscription never
// released, `pool.end()` never called.
//
// The fix is A HANDLER, not `tini` or `--init`. `exec` already gives node PID 1,
// so there is no orphan-reaping or signal-forwarding problem for an init shim to
// solve here, and the 172 ms row above is the whole proof that a handler is
// sufficient. No init shim was added.
//
// ## Why this is a module and not the top of `index.ts`
//
// It started there. It moved so that a test can hand these handlers a Fastify
// instance carrying a DELIBERATELY BROKEN `onClose` hook — see
// `test/fixtures/sync-throw-close-hook.ts` and the uncaught-exception note
// below. The alternative was an env-var fault seam inside the production boot
// path, which is worse: it puts test-only branching on the one path a
// deployment runs. `index.ts` still owns the composition and calls this before
// `app.listen`; nothing about the sequence changed in the move.
//
// ## The bounds, and why these numbers
//
// A shutdown that never completes is the same outage as no shutdown — the
// platform SIGKILLs you at the end of the grace period either way, and the
// difference is only whether the log says what was stuck. So every step is
// bounded and the total is bounded under the SMALLEST grace period this image
// can meet in the wild: `docker stop`'s default is 10 s (Kubernetes'
// `terminationGracePeriodSeconds` default is 30 s, and App Platform's is
// larger still, so docker is the binding constraint). 5 s for `app.close()`
// plus 2 s for `pool.end()` is 7 s worst case, and the whole-process deadline
// sits at 8 s — inside 10 s with room for the process to actually exit, and
// far enough above a healthy shutdown (measured in milliseconds) that the
// bound never fires on a working server.
const APP_CLOSE_TIMEOUT_MS = 5_000;
const POOL_END_TIMEOUT_MS = 2_000;
const FORCED_EXIT_MS = 8_000;

/**
 * True from the first signal onward. Read in two places: the second signal's
 * guard below, and `main().catch` at the bottom of `index.ts` — a signal that
 * lands while `app.listen` is still in flight can reject that await, and
 * without this flag that tail would turn a clean stop into `exit(1)`.
 */
let shutdownStarted = false;

/** Whether a shutdown sequence has begun. See `shutdownStarted` above. */
export function isShuttingDown(): boolean {
  return shutdownStarted;
}

/**
 * Await `work`, but give up after `ms`.
 *
 * A CORRECTION, because the first version of this function carried a comment
 * that was false and a `void work.catch(() => {})` line that existed only to
 * serve it. That comment said the abandoned loser of the race would otherwise
 * surface as an `unhandledRejection` and kill the process mid-shutdown. **It
 * cannot.** `Promise.race` subscribes to every entrant — it calls
 * `work.then(resolve, reject)` before returning — so `work` ALWAYS carries a
 * rejection handler by the time it can settle, and a rejection arriving after
 * the deadline is delivered to a race that has already settled and discarded,
 * never to Node's unhandled-rejection path.
 *
 * Measured under node v22.22.2, three ways, with a positive control that
 * proves the probe can detect the failure it is looking for: a late-rejecting
 * promise with genuinely NO handler fires `unhandledRejection` and sets a
 * non-zero exit code; the same promise passed through `Promise.race` against a
 * shorter deadline does not, with or without an explicit `.catch`. The
 * swallow-catch was therefore deleted rather than re-documented: it changed
 * behaviour on no path, and keeping it would have kept a hazard-shaped comment
 * next to code that guards nothing.
 */
async function withDeadline(work: Promise<unknown>, ms: number, label: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} did not finish within ${String(ms)}ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Installs the SIGTERM and SIGINT handlers. Called BEFORE `app.listen` on
 * purpose: on PID 1 the window between "process is alive" and "handler
 * installed" is a window in which the signal is ignored, so it is made as
 * small as the boot path can make it. Closing a Fastify instance that has not
 * started listening is legal and simply runs the `onClose` hooks.
 *
 * The order is `app.close()` then `pool.end()`, and it is not interchangeable.
 * This function takes whatever app it is given, and for the one `index.ts`
 * builds that means `app.close()` runs the two `onClose` hooks `app.ts`
 * registers (stop the stream hub, unsubscribe the notification fan-out) plus
 * the one registered in `main()` (stop the snapshot writer) — three, counted by
 * reading their registration sites, not observed by any assertion here.
 * All three can still touch the database, so ending the pool first would pull
 * the connection out from under them.
 *
 * NOT installed for the life of the process, deliberately: `unhandledRejection`
 * and `uncaughtException`. Registering those SUPPRESSES Node's own crash, so a
 * bug that today kills the process would instead leave it listening in an
 * unknown state. See the note beside `alerter` in `index.ts`'s `main()` for where that
 * deferral was first recorded — it named this errand as the owner, and this is
 * the errand declining it on the merits rather than passing it on again. The
 * `uncaughtException` handler installed inside `shutdown()` below is the narrow
 * exception, and it is narrow in exactly the way that objection requires: it
 * exists only while the process is already on its way out.
 */
export function installShutdownHandlers(app: FastifyInstance, pool: Pool): void {
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    // IDEMPOTENCE. A platform that sends SIGTERM and then, impatient, sends it
    // again must not start a second sequence: `pool.end()` called twice throws
    // ('Called end on pool more than once'), and two `app.close()` runs would
    // race the hooks against their own teardown. The second signal is logged
    // and dropped.
    if (shutdownStarted) {
      app.log.warn({ signal }, 'shutdown: already in progress, signal ignored');
      return;
    }
    shutdownStarted = true;
    const startedAt = Date.now();
    app.log.info({ signal }, 'shutdown: signal received');

    // A CLOSE HOOK THAT THROWS **SYNCHRONOUSLY**, and why this handler exists
    // when the docblock above declines process-level handlers.
    //
    // The `try`/`catch` around each step below catches a REJECTION. A close
    // hook that throws synchronously never produces one: avvio invokes close
    // hooks synchronously (`avvio@9.3.0/index.js:569`, reached from the http
    // server's own `'close'` event), so the throw unwinds into Node's callback
    // context, not into the promise `app.close()` returned. Measured without
    // this handler: the sequence stopped dead after 'signal received', the
    // remaining hooks never ran, the pool was never ended, nothing logged
    // 'complete', and the process exited 1 in 12 ms — a graceful stop reported
    // to the orchestrator as a crash, which is the exact failure the bounds
    // above exist to prevent.
    //
    // Measured WITH it, same fault: the remaining close hooks still run,
    // `app.close()`'s promise never settles so the 5 s bound below is what
    // moves the sequence on, `pool.end()` runs, and 'complete' is logged.
    //
    // Three things keep this from being the suppression the docblock refuses.
    // It is installed only after a signal has been received, so it cannot mask
    // a crash during normal operation. It is `once`, so a SECOND uncaught
    // exception inside the shutdown window still kills the process. And it is
    // removed below when the sequence ends. What it does cost, stated plainly:
    // an unrelated uncaught exception that happens to land inside the shutdown
    // window is absorbed too, and shows up only as this log line.
    const absorbUncaught = (error: unknown): void => {
      app.log.error({ err: error, signal }, 'shutdown: uncaught exception during shutdown, continuing');
    };
    process.once('uncaughtException', absorbUncaught);

    // The last resort, and `unref`'d so it is not itself a reason to stay
    // alive. If every step finished and released what it held, the event loop
    // empties and the process exits 0 on its own before this ever fires — that
    // natural drain is the design, not `process.exit(0)`, precisely so that
    // anything still holding the loop (a socket that was never closed, a pool
    // that was never ended) shows up as a forced exit instead of being papered
    // over by an explicit exit call.
    const forcedExit = setTimeout(() => {
      app.log.error(
        { signal, deadlineMs: FORCED_EXIT_MS },
        'shutdown: forced exit, something still holds the event loop',
      );
      process.exit(1);
    }, FORCED_EXIT_MS);
    forcedExit.unref();

    // Each step is bounded AND caught, so a step that REJECTS or HANGS cannot
    // skip the steps after it. A step that throws synchronously is a different
    // mechanism and is covered by the `uncaughtException` handler above, not by
    // these `catch` blocks — that distinction was measured, not assumed.
    try {
      await withDeadline(app.close(), APP_CLOSE_TIMEOUT_MS, 'app.close()');
      app.log.info({ signal }, 'shutdown: http server closed');
    } catch (error: unknown) {
      app.log.error({ err: error, signal }, 'shutdown: http server did not close cleanly');
    }
    try {
      await withDeadline(pool.end(), POOL_END_TIMEOUT_MS, 'pool.end()');
      app.log.info({ signal }, 'shutdown: database pool closed');
    } catch (error: unknown) {
      app.log.error({ err: error, signal }, 'shutdown: database pool did not close cleanly');
    }

    // The window is over: hand uncaught exceptions back to Node. `once` has
    // already removed the listener if it fired, so this line matters only in
    // the case where it did NOT — and it matters there because the process is
    // not gone yet. The loop still has to drain, which on the hung path is
    // another ~3 s under the watchdog, and Node's own crash behaviour should
    // own that tail rather than this listener. Removing a listener that is not
    // registered is a no-op, so it is correct either way. STATED PLAINLY: no
    // test observes this removal — the process exits too soon after it for the
    // difference to be visible — so it is reasoned, not measured. It is written
    // because the docblock claims the window closes, and a claimed removal that
    // is not performed is the defect class this whole file was reviewed for.
    process.off('uncaughtException', absorbUncaught);

    // Exit code 0 is what an orchestrator reads as a clean stop, and it is
    // reached by letting the loop drain rather than by calling `process.exit`,
    // which would also risk truncating these very log lines on a pipe. The
    // only non-zero exit from this path is the forced one above.
    app.log.info({ signal, durationMs: Date.now() - startedAt }, 'shutdown: complete');
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }
}
