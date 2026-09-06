import Fastify from 'fastify';
import pg from 'pg';
import { installShutdownHandlers } from '../../src/shutdown.js';

/**
 * A real server whose `onClose` hook throws SYNCHRONOUSLY, spawned as a child
 * by `test/shutdown.test.ts` (case 13.104) and signalled for real.
 *
 * ## Why a fixture and not `src/index.ts`
 *
 * The fault has to be a genuine synchronous throw from inside avvio's close
 * chain — that is the whole mechanism under test, and it is not reachable from
 * outside the process. The two ways to reach it are an env-var fault seam in
 * the production boot path (test-only branching on the one path a deployment
 * runs, which is why `src/shutdown.ts` was extracted instead) or this: a
 * separate entry that imports THE SAME `installShutdownHandlers` and hands it a
 * broken app.
 *
 * ## What that costs, stated so nobody reads more into a green
 *
 * This is not `index.ts`. It does not build the real app, so it proves nothing
 * about the three real `onClose` hooks or about the composition root — the
 * other cases in `shutdown.test.ts` cover that by booting `index.ts` itself.
 * What it does share with production is the part being tested: the same
 * imported shutdown module, a real Fastify instance, a real `pg.Pool` holding a
 * real backend, a real signal delivered to the process that installed the
 * handler.
 */

const app = Fastify({ logger: { level: 'info' } });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// The fault. Registered FIRST so the hooks after it are the ones a sync throw
// would otherwise strand — the test asserts the later hook still runs.
app.addHook('onClose', () => {
  throw new Error('a close hook threw synchronously');
});
app.addHook('onClose', () => {
  app.log.info('fixture: the close hook after the throwing one ran');
});

// Checks out a real connection so the pool holds a backend against the test
// database. Without this, `pool.end()` would release nothing and the assertion
// that it ran could not fail for the right reason.
await pool.query('SELECT 1');

installShutdownHandlers(app, pool);

await app.listen({ port: Number(process.env.PORT), host: '127.0.0.1' });
