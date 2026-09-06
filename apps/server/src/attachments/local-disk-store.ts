import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  InvalidObjectKeyError,
  ObjectNotFoundError,
  assertValidObjectKey,
  type ObjectListing,
  type ObjectMeta,
  type ObjectStore,
} from './object-store.js';

/**
 * Dev/test implementation: objects are files under rootDir. Writes go to a
 * temp name and rename into place, so a torn write can never surface as a
 * readable half-object.
 */
export class LocalDiskStore implements ObjectStore {
  constructor(private readonly rootDir: string) {}

  private pathFor(key: string): string {
    assertValidObjectKey(key); // throws InvalidObjectKeyError before any I/O
    return join(this.rootDir, ...key.split('/'));
  }

  async put(key: string, stream: Readable, _meta: ObjectMeta): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
    try {
      await pipeline(stream, createWriteStream(tempPath, { flags: 'wx' }));
      await rename(tempPath, path);
    } catch (err) {
      await rm(tempPath, { force: true });
      throw err;
    }
  }

  async getStream(key: string): Promise<Readable> {
    const path = this.pathFor(key);
    try {
      await stat(path);
    } catch {
      throw new ObjectNotFoundError(key);
    }
    return createReadStream(path);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  /**
   * Walks `rootDir` and reports every regular file as a key (the reverse of
   * `pathFor`'s join: the path relative to `rootDir`, with '/' separators
   * regardless of host OS). Never reads or reports anything OUTSIDE
   * `rootDir` and never follows a symlink to do so — not by a check, but
   * structurally: `readdir(..., { withFileTypes: true })` reports a
   * symlink's `Dirent` as neither `isDirectory()` nor `isFile()` (that's
   * `isSymbolicLink()`), so this walk recurses into real directories only
   * and reports real files only. A symlink planted inside `rootDir`,
   * however far it points, is silently skipped rather than followed.
   */
  async list(prefix?: string): Promise<ObjectListing[]> {
    const results: ObjectListing[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          const key = relative(this.rootDir, full).split(sep).join('/');
          const info = await lstat(full);
          results.push({ key, lastModified: info.mtime });
        }
        // Anything else (symlink, socket, ...) is neither branch: skipped.
      }
    };
    await walk(this.rootDir);
    return prefix === undefined ? results : results.filter((entry) => entry.key.startsWith(prefix));
  }
}

// Re-export so route code has one import site in dev wiring.
export { InvalidObjectKeyError };
