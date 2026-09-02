import { ConfigError } from '../config.js';
import { LocalDiskStore } from './local-disk-store.js';
import { S3ObjectStore } from './s3-store.js';
import type { ObjectStore } from './object-store.js';

/**
 * Builds the `ObjectStore` the rest of the server depends on, from
 * `NodeJS.ProcessEnv` — the one seam that decides local disk vs S3 so no
 * other file needs an `if (env.OBJECT_STORE === ...)`. Every variable is
 * destructured here (rather than read as `env.NAME`) so the env-contract
 * gate (`scripts/check-env-example.mjs`, detector D2) can see them; each is
 * documented in `.env.example`.
 */
export function createObjectStoreFromEnv(env: NodeJS.ProcessEnv): ObjectStore {
  const {
    OBJECT_STORE,
    OBJECT_STORE_DIR,
    OBJECT_STORE_S3_REGION,
    OBJECT_STORE_S3_BUCKET,
    OBJECT_STORE_S3_ACCESS_KEY_ID,
    OBJECT_STORE_S3_SECRET_ACCESS_KEY,
    OBJECT_STORE_S3_ENDPOINT,
    OBJECT_STORE_S3_FORCE_PATH_STYLE,
  } = env;

  const kind = OBJECT_STORE ?? 'local';

  if (kind === 'local') {
    return new LocalDiskStore(OBJECT_STORE_DIR ?? 'var/attachments');
  }

  if (kind === 's3') {
    const required: Record<string, string | undefined> = {
      OBJECT_STORE_S3_REGION,
      OBJECT_STORE_S3_BUCKET,
      OBJECT_STORE_S3_ACCESS_KEY_ID,
      OBJECT_STORE_S3_SECRET_ACCESS_KEY,
    };
    const missing = Object.entries(required)
      .filter(([, value]) => value === undefined || value === '')
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new ConfigError(`object store 's3' needs: ${missing.join(', ')}`);
    }
    return new S3ObjectStore({
      region: OBJECT_STORE_S3_REGION as string,
      bucket: OBJECT_STORE_S3_BUCKET as string,
      accessKeyId: OBJECT_STORE_S3_ACCESS_KEY_ID as string,
      secretAccessKey: OBJECT_STORE_S3_SECRET_ACCESS_KEY as string,
      ...(OBJECT_STORE_S3_ENDPOINT === undefined ? {} : { endpoint: OBJECT_STORE_S3_ENDPOINT }),
      forcePathStyle: OBJECT_STORE_S3_FORCE_PATH_STYLE !== 'false',
    });
  }

  throw new ConfigError(`OBJECT_STORE must be 'local' or 's3', got '${kind}'`);
}
