import { spawn } from 'node:child_process';
import type { ObjectSink } from './object-sink.js';

/**
 * Splits a connection URL into the argv `pg_dump` gets and the environment it
 * gets, so the PASSWORD never appears in argv. Every process on the host can
 * read another's argv (`ps -ef`, `/proc/<pid>/cmdline`), and the backup worker
 * runs with the database's production credentials; `PGPASSWORD` is the channel
 * libpq provides for exactly this. The rest of the URL still goes as a URI,
 * which libpq expands itself, so query parameters (`sslmode=require`) survive.
 *
 * A URL this cannot parse is passed through untouched rather than rejected —
 * libpq accepts conninfo strings (`host=... dbname=...`) that are not URLs at
 * all, and refusing one here would break a form the tool supports.
 */
export function splitDatabaseUrl(databaseUrl: string): { dsn: string; password?: string } {
  try {
    const url = new URL(databaseUrl);
    if (!url.password) return { dsn: databaseUrl };
    const password = decodeURIComponent(url.password);
    url.password = '';
    return { dsn: url.toString(), password };
  } catch {
    return { dsn: databaseUrl };
  }
}

/** Nightly full dump, custom format, streamed straight to object storage. */
export async function dumpDatabaseToSink(
  databaseUrl: string,
  sink: ObjectSink,
  now: () => Date,
): Promise<string> {
  const stamp = now().toISOString().slice(0, 16).replace(':', '-');
  const key = `pg/${stamp}.dump`;
  const { dsn, password } = splitDatabaseUrl(databaseUrl);
  const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--dbname', dsn], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(password === undefined ? {} : { PGPASSWORD: password }) },
  });
  const stderr: Buffer[] = [];
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

  // Settle the upload's outcome into a VALUE rather than leaving a live
  // rejection unhandled while we wait on the exit code: if pg_dump fails we
  // throw its stderr below without ever awaiting `uploaded`, and a rejected
  // promise nobody awaited would crash the daemon with an unhandled rejection
  // that names the upload rather than the real cause.
  const uploaded = sink.put(key, child.stdout, 'application/octet-stream');
  const uploadOutcome: Promise<unknown> = uploaded.then(
    () => undefined,
    (error: unknown) => error ?? new Error('object upload failed'),
  );

  // THE ALERT IS NOT ENOUGH. `sink.put` was handed `child.stdout` before the
  // exit code existed, so by the time anything goes wrong a TRUNCATED (or
  // empty) archive is either uploaded or on its way to `pg/<stamp>.dump` — a
  // dated key indistinguishable at rest from a good dump, which is exactly
  // what a restore drill reaching for "the latest dump" would pick up. So:
  // stop feeding it, abort/delete the key, and only then throw. `discard`
  // starts before `uploadOutcome` is awaited on purpose, so an in-flight
  // multipart upload is ABORTED rather than allowed to complete and then
  // deleted.
  //
  // ONE closure, called from BOTH failure paths, because there are two and
  // only one of them used to run this. The other is the child's `error` event
  // — `pg_dump` missing, off `PATH`, or not executable — which happens AFTER
  // `sink.put` already has the stream, and which used to reject straight out
  // of the `await` below with no cleanup at all, leaving a ZERO-BYTE object at
  // the dated key. A zero-byte dump is the worst of the three outcomes: it is
  // the one a restore drill picks up and the one an operator's bucket listing
  // shows as a successful night. Sharing the code, rather than copying it, is
  // what keeps the two paths from drifting apart again.
  const discardAbandonedUpload = async (): Promise<void> => {
    child.stdout.destroy();
    const discarded = sink.discard(key).then(
      () => undefined,
      (error: unknown) => error ?? new Error('discard failed'),
    );
    await uploadOutcome;
    const discardError = await discarded;
    if (discardError !== undefined) {
      // Reported, never rethrown: losing the cleanup must not replace the real
      // cause with a message about the cleanup. The key may still hold a short
      // archive, so this line is what tells an operator to go and delete it.
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'failed dump left an object behind — delete it by hand',
          key,
          error: discardError instanceof Error ? discardError.message : String(discardError),
        }),
      );
    }
  };

  let exitCode: number;
  try {
    exitCode = await new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
  } catch (spawnError: unknown) {
    // The spawn itself failed — there is no exit code and no stderr to quote,
    // so the original error is rethrown unwrapped (`spawn pg_dump ENOENT`
    // names the cause better than anything this could add).
    await discardAbandonedUpload();
    throw spawnError;
  }
  if (exitCode !== 0) {
    const failure = new Error(
      `pg_dump exited ${exitCode}: ${Buffer.concat(stderr).toString('utf8').slice(-500)}`,
    );
    await discardAbandonedUpload();
    throw failure;
  }
  const uploadError = await uploadOutcome;
  if (uploadError !== undefined) throw uploadError;
  return key;
}
