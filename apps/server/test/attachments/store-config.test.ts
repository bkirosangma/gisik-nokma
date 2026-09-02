import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config.js';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import { S3ObjectStore } from '../../src/attachments/s3-store.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';

const S3_ENV = {
  OBJECT_STORE: 's3',
  OBJECT_STORE_S3_REGION: 'ap-south-1',
  OBJECT_STORE_S3_BUCKET: 'gisik-attachments',
  OBJECT_STORE_S3_ACCESS_KEY_ID: 'key',
  OBJECT_STORE_S3_SECRET_ACCESS_KEY: 'secret',
};

describe('createObjectStoreFromEnv', () => {
  it('defaults to the local store', () => {
    expect(createObjectStoreFromEnv({})).toBeInstanceOf(LocalDiskStore);
  });

  it('builds the S3 store when fully configured', () => {
    expect(createObjectStoreFromEnv(S3_ENV)).toBeInstanceOf(S3ObjectStore);
  });

  it('planted defect: missing s3 variables are named, all of them, in one refusal', () => {
    const env = { OBJECT_STORE: 's3', OBJECT_STORE_S3_REGION: 'ap-south-1' };
    try {
      createObjectStoreFromEnv(env);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const message = (err as Error).message;
      for (const name of ['OBJECT_STORE_S3_BUCKET', 'OBJECT_STORE_S3_ACCESS_KEY_ID', 'OBJECT_STORE_S3_SECRET_ACCESS_KEY']) {
        expect(message).toContain(name);
      }
      expect(message).not.toContain('OBJECT_STORE_S3_REGION');
    }
  });

  it('planted defect: an invented OBJECT_STORE value is refused by name', () => {
    expect(() => createObjectStoreFromEnv({ OBJECT_STORE: 'ftp' })).toThrow(/OBJECT_STORE.*ftp/);
  });
});
