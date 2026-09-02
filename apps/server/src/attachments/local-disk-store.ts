import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  InvalidObjectKeyError,
  ObjectNotFoundError,
  assertValidObjectKey,
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
}

// Re-export so route code has one import site in dev wiring.
export { InvalidObjectKeyError };
