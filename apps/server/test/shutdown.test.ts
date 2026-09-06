import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import net from 'node:net';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from './helpers/db.js';
import type { TestDatabase } from './helpers/db.js';

/**
 * The graceful-shutdown path in `src/index.ts` (SIGTERM / SIGINT).
 *
 * ## Why this file spawns a process instead of calling a function
 *
 * Installing a handler and then calling it directly proves the handler's BODY
 * and nothing else — it would pass with `process.on('SIGTERM', …)` deleted,
 * which is the entire defect this errand exists to close. So every case here
 * boots THE REAL `src/index.ts` as a child process, against a real throwaway
 * database, and delivers a REAL signal with `child.kill()`.
 *
 * The child is spawned as `node --import tsx src/index.ts` rather than through
 * the `tsx` bin, deliberately: a CLI shim that spawns a grandchild would make
 * `child.kill()` test the shim's signal forwarding instead of this server's
 * handler. Measured — the pino `pid` field in the child's own log lines equals
 * `child.pid`, asserted below, so the process being signalled IS the process
 * that installed the handler.
 *
 * ## What this file does NOT prove, stated so nobody reads more into a green
 *
 * The child is **not PID 1**. On PID 1 there are no default signal
 * dispositions, which is why an unhandled SIGTERM is IGNORED in the container
 * and the deploy ends in SIGKILL — that property was measured against the
 * built image (`docker stop -t 3`: 3197 ms ignored vs 172 ms handled) and is
 * recorded at the handler. Here, under a normal parent, node's DEFAULT
 * disposition applies, so deleting the handler makes the child die BY SIGNAL
 * (`code: null, signal: 'SIGTERM'`) instead of exiting 0 with the sequence
 * completed. That is still a specific, falsifiable red — it just fails for the
 * neighbouring reason. What this file proves is: the handlers are installed on
 * the one non-test boot path, a real signal reaches them, every step runs in
 * order, a second signal does not start a second shutdown, a hung `app.close()`
 * does not skip `pool.end()` or hang forever, and the clean exit code is 0.
 *
 * `test-cases/13-deployment-dogfooding.md` carries these as **13.101–13.104**,
 * minted from Lane E's allocated block (13.101–13.200); each case names its own
 * id below.
 */

const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url));
const INDEX_PATH = 'src/index.ts';
/** A real server whose `onClose` hook throws synchronously; see the file. */
const SYNC_THROW_FIXTURE = 'test/fixtures/sync-throw-close-hook.ts';
/** Measured clean shutdown: ~15 ms. 3 s is a bound no healthy path approaches
 *  and one that no unhealthy path can reach — the shutdown's own deadlines are
 *  5 s / 2 s / 8 s, and pg's idle-connection reaper is ~10 s, so nothing can
 *  sneak under 3 s by accident. */
const CLEAN_EXIT_BUDGET_MS = 3_000;

type Child = {
  process: ChildProcessByStdio<null, Readable, Readable>;
  port: number;
  stdout: () => string;
  stderr: () => string;
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

let db: TestDatabase;
const running: Child[] = [];

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('no port'));
        return;
      }
      const { port } = address;
      probe.close(() => {
        resolve(port);
      });
    });
  });
}

/** Boots an entry file and resolves once it has logged that it is listening. */
async function startServer(entry: string = INDEX_PATH): Promise<Child> {
  const port = await freePort();
  const child = spawn(process.execPath, ['--import', 'tsx', entry], {
    cwd: SERVER_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: db.url,
      PORT: String(port),
      HOST: '127.0.0.1',
      LOG_LEVEL: 'info',
      BETTER_AUTH_URL: `http://127.0.0.1:${String(port)}`,
      BETTER_AUTH_SECRET: 'shutdown-test-secret-shutdown-test-secret',
      WEB_ORIGIN: 'http://127.0.0.1:3001',
      OBJECT_STORE: 'local',
      OBJECT_STORE_DIR: `${SERVER_ROOT}var/shutdown-test-attachments`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk: Buffer) => {
    out += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    err += chunk.toString();
  });
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });
  const handle: Child = { process: child, port, stdout: () => out, stderr: () => err, exit };
  running.push(handle);

  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline && !out.includes('Server listening')) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!out.includes('Server listening')) {
    throw new Error(`server did not start.\nstdout:\n${out}\nstderr:\n${err}`);
  }
  return handle;
}

/** Every structured log line the child wrote, parsed. */
function logLines(child: Child): { msg?: string; pid?: number; signal?: string }[] {
  return child
    .stdout()
    .split('\n')
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as { msg?: string; pid?: number; signal?: string }];
      } catch {
        return [];
      }
    });
}

function messages(child: Child): string[] {
  return logLines(child).flatMap((entry) => (entry.msg === undefined ? [] : [entry.msg]));
}

/**
 * POSITIVE CONTROL for the `pool.end()` assertions. If the child never checked
 * out a connection, nothing holds its event loop and a missing `pool.end()`
 * would let the process exit anyway — a check that cannot fail. This asserts
 * the child really is holding a backend against the throwaway database before
 * any signal is sent. `pg_backend_pid()` excludes this observer's own
 * connection, and the database is unique to this file, so any remaining
 * backend is the child's.
 */
async function childBackendCount(): Promise<number> {
  const client = new pg.Client({ connectionString: db.url });
  await client.connect();
  try {
    const result = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()',
    );
    return result.rows[0]?.n ?? 0;
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await db.drop();
});

afterEach(async () => {
  // Mutation runs deliberately produce children that never exit on their own.
  // None of them outlive this file.
  for (const child of running.splice(0)) {
    if (child.process.exitCode === null && child.process.signalCode === null) {
      child.process.kill('SIGKILL');
      await child.exit;
    }
  }
});

describe('graceful shutdown', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)(
    'exits 0 on %s after closing the app and ending the pool (13.101 SIGTERM / 13.102 SIGINT)',
    async (signal) => {
      const child = await startServer();

      // Forces the pool to check out a real connection: /healthz runs SELECT 1.
      const health = await fetch(`http://127.0.0.1:${String(child.port)}/healthz`);
      expect(health.status).toBe(200);
      expect(await childBackendCount()).toBeGreaterThanOrEqual(1);

      const sentAt = Date.now();
      child.process.kill(signal);
      const result = await Promise.race([
        child.exit,
        new Promise<'timeout'>((resolve) =>
          setTimeout(() => {
            resolve('timeout');
          }, CLEAN_EXIT_BUDGET_MS),
        ),
      ]);
      const elapsed = Date.now() - sentAt;

      expect(result, `child did not exit within ${String(CLEAN_EXIT_BUDGET_MS)}ms.\n${child.stdout()}`).not.toBe(
        'timeout',
      );
      // Exit code 0 with NO terminating signal: the process shut itself down.
      // Deleting the handler gives `{ code: null, signal }` here instead, since
      // node's default disposition terminates the process.
      expect(result).toEqual({ code: 0, signal: null });
      expect(elapsed).toBeLessThan(CLEAN_EXIT_BUDGET_MS);

      // The signal reached the process that installed the handler, not a shim.
      const received = logLines(child).filter((entry) => entry.msg === 'shutdown: signal received');
      expect(received).toHaveLength(1);
      expect(received[0]?.pid).toBe(child.process.pid);
      expect(received[0]?.signal).toBe(signal);

      // Every step ran, in order. `pool.end()` in particular: without it the
      // idle backend counted above keeps the loop alive and the exit assertion
      // above fails on time, so this marker is corroboration, not the check.
      const order = messages(child).filter((msg) => msg.startsWith('shutdown: '));
      expect(order).toEqual([
        'shutdown: signal received',
        'shutdown: http server closed',
        'shutdown: database pool closed',
        'shutdown: complete',
      ]);
    },
    60_000,
  );

  it(
    'ignores a second signal, bounds a hung app.close(), and still ends the pool (13.103)',
    async () => {
      const child = await startServer();
      await fetch(`http://127.0.0.1:${String(child.port)}/healthz`);
      expect(await childBackendCount()).toBeGreaterThanOrEqual(1);

      // A client that opened a connection and stalled mid-request. Fastify does
      // not force-close a connection that is not idle, so `app.close()` cannot
      // finish — which is exactly the hang the deadline exists for, and it also
      // holds the shutdown open long enough to deliver a real second signal
      // instead of two kills in one tick (POSIX does not queue those, so a
      // back-to-back pair can collapse into a single delivery and prove
      // nothing).
      const stalled = net.connect(child.port, '127.0.0.1');
      await new Promise((resolve) => stalled.on('connect', resolve));
      stalled.write('GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\n');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const sentAt = Date.now();
      child.process.kill('SIGTERM');
      // Driven off the OBSERVED begin marker, not off a guessed delay.
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline && !child.stdout().includes('shutdown: signal received')) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(child.stdout()).toContain('shutdown: signal received');
      child.process.kill('SIGTERM');

      const result = await Promise.race([
        child.exit,
        new Promise<'timeout'>((resolve) =>
          setTimeout(() => {
            resolve('timeout');
          }, 20_000),
        ),
      ]);
      const elapsed = Date.now() - sentAt;
      stalled.destroy();

      // IDEMPOTENCE: one shutdown, one refusal. Without the guard the second
      // signal starts a second sequence and this is 2.
      expect(messages(child).filter((msg) => msg === 'shutdown: signal received')).toHaveLength(1);
      expect(messages(child).filter((msg) => msg === 'shutdown: already in progress, signal ignored')).toHaveLength(1);

      // A step that hangs is bounded and does NOT skip the steps after it.
      expect(child.stdout()).toContain('app.close() did not finish within 5000ms');
      expect(messages(child)).toContain('shutdown: database pool closed');
      expect(messages(child)).toContain('shutdown: complete');

      // And the process still stops: the stalled socket keeps the loop alive,
      // so the whole-process deadline fires and exits non-zero — an unclean
      // stop reported as one, rather than a hang the platform has to SIGKILL.
      expect(result, `child never exited.\n${child.stdout()}`).not.toBe('timeout');
      expect(result).toEqual({ code: 1, signal: null });
      expect(elapsed).toBeLessThan(12_000);
      expect(messages(child)).toContain('shutdown: forced exit, something still holds the event loop');
    },
    60_000,
  );

  it(
    'a close hook that throws SYNCHRONOUSLY does not skip pool.end() (13.104)',
    async () => {
      // The mechanism, and why the try/catch around each step is not enough for
      // it: avvio runs close hooks synchronously from the http server's own
      // 'close' callback, so a hook that THROWS never rejects `app.close()`'s
      // promise — it unwinds as an uncaughtException, outside the shutdown
      // closure entirely. Measured before the fix: the sequence stopped after
      // 'signal received', the pool was never ended, nothing logged 'complete',
      // and the process exited 1 in 12 ms.
      const child = await startServer(SYNC_THROW_FIXTURE);
      expect(await childBackendCount()).toBeGreaterThanOrEqual(1);

      const sentAt = Date.now();
      child.process.kill('SIGTERM');
      const result = await Promise.race([
        child.exit,
        new Promise<'timeout'>((resolve) =>
          setTimeout(() => {
            resolve('timeout');
          }, 20_000),
        ),
      ]);
      const elapsed = Date.now() - sentAt;

      expect(result, `child never exited.\n${child.stdout()}`).not.toBe('timeout');

      // The throw was absorbed for the length of the shutdown window only, and
      // the hooks queued behind the throwing one still ran.
      expect(messages(child)).toContain('shutdown: uncaught exception during shutdown, continuing');
      expect(messages(child)).toContain('fixture: the close hook after the throwing one ran');

      // The whole point: `pool.end()` is REACHED and the sequence completes.
      const order = messages(child).filter((msg) => msg.startsWith('shutdown: '));
      expect(order).toEqual([
        'shutdown: signal received',
        'shutdown: uncaught exception during shutdown, continuing',
        'shutdown: http server did not close cleanly',
        'shutdown: database pool closed',
        'shutdown: complete',
      ]);

      // Exit 0, and by the route the design says: `app.close()`'s promise never
      // settles after the throw, so it is the 5 s BOUND that moves the sequence
      // on — measured 5010 ms.
      //
      // The DISCRIMINATOR for "the bound fired" is the
      // 'http server did not close cleanly' marker in the ordered list above,
      // which only that path writes; a clean close logs 'http server closed'
      // instead and takes ~15 ms. The timing assertions below are a second,
      // coarser statement of the same thing, and they are deliberately loose on
      // BOTH sides rather than snug against the constants. `elapsed` is
      // measured in the parent from `kill()`, not in the child from the signal,
      // so it is the bound plus delivery and handler-entry latency — asserting
      // `>= 5_000` against a 5000 ms `setTimeout` would leave a ~10 ms margin
      // in which a correct build reddens. 4.5 s is far above the ~15 ms a
      // resolved `app.close()` takes and far below the bound, and 8 s is the
      // watchdog: over it would mean the forced exit fired instead of the loop
      // draining.
      expect(result).toEqual({ code: 0, signal: null });
      expect(elapsed).toBeGreaterThanOrEqual(4_500);
      expect(elapsed).toBeLessThan(8_000);
      expect(messages(child)).not.toContain('shutdown: forced exit, something still holds the event loop');
    },
    60_000,
  );
});
