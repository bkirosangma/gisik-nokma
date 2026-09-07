import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type CachedToken = { token: string; userId: string };

/**
 * `null` for absent, unreadable and corrupt alike — three states that mean the
 * same thing to a caller ("there is no usable credential here") and one of
 * which is recoverable by the device flow. Distinguishing them would only give
 * the caller branches with no different action behind them.
 */
export async function readCachedToken(path: string): Promise<CachedToken | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof (parsed as { token?: unknown }).token !== 'string' ||
      typeof (parsed as { userId?: unknown }).userId !== 'string'
    ) {
      return null;
    }
    return { token: (parsed as CachedToken).token, userId: (parsed as CachedToken).userId };
  } catch {
    return null;
  }
}

/**
 * The mode arguments are the point of this function. `0600` on the file and
 * `0700` on its directory: a personal access token that any process on the
 * machine can read is not cached, it is published. `mkdir` is given the mode
 * explicitly rather than relying on the process umask, which is not this
 * module's to assume.
 */
export async function writeCachedToken(path: string, value: CachedToken): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
}

export async function clearCachedToken(path: string): Promise<void> {
  await rm(path, { force: true });
}
