import type { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  ObjectNotFoundError,
  assertValidObjectKey,
  type ObjectMeta,
  type ObjectStore,
} from './object-store.js';

export type S3StoreConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Default true: path-style addressing works on every S3-compatible endpoint (MinIO, R2). */
  forcePathStyle?: boolean;
};

/**
 * Prod implementation of the same three-verb `ObjectStore` contract
 * `LocalDiskStore` satisfies — same key validation (`assertValidObjectKey`,
 * called before any network call in every method), same error shape
 * (`ObjectNotFoundError` on a miss). The two stores are interchangeable
 * behind `createObjectStoreFromEnv` (store-config.ts) precisely because
 * neither adds behaviour the interface does not already promise.
 */
export class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client;

  constructor(
    private readonly config: S3StoreConfig,
    client?: S3Client,
  ) {
    this.client =
      client ??
      new S3Client({
        region: config.region,
        ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
        forcePathStyle: config.forcePathStyle ?? true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
  }

  async put(key: string, stream: Readable, meta: ObjectMeta): Promise<void> {
    assertValidObjectKey(key);
    // Upload handles multipart chunking for streams; below the part
    // threshold it issues a single PutObject, where ContentLength is passed
    // through verbatim as the (correct, whole-body) header. Above it, the
    // installed SDK's UploadPartCommand call explicitly sets
    // `ContentLength: undefined` on every part despite spreading the same
    // params object (@aws-sdk/lib-storage dist-cjs/index.js) — so this
    // field is never forwarded, wrong, onto a part. Verified by reading the
    // installed package rather than assumed; kept rather than dropped.
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.config.bucket,
        Key: key,
        Body: stream,
        ContentType: meta.mime,
        ContentLength: meta.size,
      },
    });
    await upload.done();
  }

  async getStream(key: string): Promise<Readable> {
    assertValidObjectKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return result.Body as Readable;
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') {
        throw new ObjectNotFoundError(key);
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertValidObjectKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}
