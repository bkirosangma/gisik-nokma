import type { Readable } from 'node:stream';

export type ObjectMeta = { mime: string; size: number };

/**
 * Where attachment bytes live. Implementations: S3-compatible (prod),
 * local disk (dev/tests). The interface is deliberately three verbs —
 * events reference objects, they never carry them (spec §2 Attachments).
 */
export interface ObjectStore {
  put(key: string, stream: Readable, meta: ObjectMeta): Promise<void>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

export class ObjectNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`object not found: ${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

export class InvalidObjectKeyError extends Error {
  constructor(public readonly key: string) {
    super(`invalid object key: ${key}`);
    this.name = 'InvalidObjectKeyError';
  }
}

const OBJECT_KEY_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * Refuse anything that could steer a filesystem path or an S3 key outside
 * its root. Our keys are `w/<ulid>/a/<ulid>` — letters, digits, `_`, `-`
 * per segment; no dots at all, so `.`/`..` traversal is unrepresentable.
 */
export function assertValidObjectKey(key: string): void {
  const segments = key.split('/');
  const valid =
    key.length > 0 &&
    key.length <= 512 &&
    segments.every((segment) => OBJECT_KEY_SEGMENT.test(segment));
  if (!valid) throw new InvalidObjectKeyError(key);
}
