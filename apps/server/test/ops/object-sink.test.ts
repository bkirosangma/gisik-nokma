import { Readable } from 'node:stream';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { s3SinkFromEnv, s3TargetFromEnv } from '../../src/ops/object-sink.js';

const s3Mock = mockClient(S3Client);

/** The `backup` worker's env block in `deploy/do/app.yaml`, in miniature. */
const ENV: NodeJS.ProcessEnv = {
  OBJECT_STORE_S3_ENDPOINT: 'https://blr1.digitaloceanspaces.com',
  OBJECT_STORE_S3_REGION: 'blr1',
  OBJECT_STORE_S3_ACCESS_KEY_ID: 'k',
  OBJECT_STORE_S3_SECRET_ACCESS_KEY: 's',
  OBJECT_STORE_S3_FORCE_PATH_STYLE: 'false',
  OBJECT_STORE_S3_BUCKET: 'gisik-nokma-attachments',
  BACKUP_S3_BUCKET: 'gisik-nokma-backups',
};

beforeEach(() => {
  s3Mock.reset();
});

describe('s3TargetFromEnv — what it refuses, and what it resolves', () => {
  /**
   * The refusal list is STRICTER than `attachments/store-config.ts`'s on
   * purpose, and this is the case that pins the difference. An unset endpoint
   * lets the SDK resolve Amazon's; an unset region used to default to
   * `us-east-1`. Either one, against a DO Spaces bucket, is a silent upload to
   * the wrong cloud — invisible in dev, because `.env.example` supplies both
   * for MinIO. A backup destination has no local-disk fallback to degrade to,
   * so both are boot-time refusals that name the variable.
   */
  it.each([
    ['OBJECT_STORE_S3_ENDPOINT'],
    ['OBJECT_STORE_S3_REGION'],
    ['OBJECT_STORE_S3_ACCESS_KEY_ID'],
    ['OBJECT_STORE_S3_SECRET_ACCESS_KEY'],
    ['BACKUP_S3_BUCKET'],
  ])('refuses to build a client with %s missing, naming it', (name) => {
    const env = { ...ENV };
    delete env[name];
    expect(() => s3TargetFromEnv(env, 'BACKUP_S3_BUCKET')).toThrowError(new RegExp(name));
  });

  it('names EVERY missing variable in one error, not just the first', () => {
    expect(() =>
      s3TargetFromEnv(
        { OBJECT_STORE_S3_ACCESS_KEY_ID: 'k', OBJECT_STORE_S3_SECRET_ACCESS_KEY: 's' },
        'BACKUP_S3_BUCKET',
      ),
    ).toThrowError(
      'backup object storage needs: BACKUP_S3_BUCKET, OBJECT_STORE_S3_ENDPOINT, OBJECT_STORE_S3_REGION',
    );
  });

  it('an empty string counts as missing, not as a value', () => {
    expect(() => s3TargetFromEnv({ ...ENV, OBJECT_STORE_S3_REGION: '' }, 'BACKUP_S3_BUCKET')).toThrowError(
      /OBJECT_STORE_S3_REGION/,
    );
  });

  it('resolves the endpoint, region and path-style the environment names — no defaults in the way', async () => {
    const { client, bucket } = s3TargetFromEnv(ENV, 'BACKUP_S3_BUCKET');
    const endpoint = await client.config.endpoint!();
    expect(`${endpoint.protocol}//${endpoint.hostname}`).toBe('https://blr1.digitaloceanspaces.com');
    expect(await client.config.region()).toBe('blr1');
    expect(client.config.forcePathStyle).toBe(false);
    expect(bucket).toBe('gisik-nokma-backups');
  });
});

describe('s3SinkFromEnv', () => {
  it('puts to the bucket `bucketVar` names — NEVER the attachment bucket, which is also in this env', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const sink = s3SinkFromEnv(ENV, 'BACKUP_S3_BUCKET');
    await sink.put('pg/2026-08-20T21-00.dump', Readable.from(Buffer.from('PGDMP...')), 'application/octet-stream');
    const input = s3Mock.commandCalls(PutObjectCommand)[0]!.args[0].input;
    expect(input.Bucket).toBe('gisik-nokma-backups');
    expect(input.Bucket).not.toBe(ENV.OBJECT_STORE_S3_BUCKET);
    expect(input.Key).toBe('pg/2026-08-20T21-00.dump');
    expect(input.ContentType).toBe('application/octet-stream');
  });

  /**
   * `pg-dump.test.ts`'s case 13.30 proves `dumpDatabaseToSink` ASKS the sink to
   * discard the key; its `CaptureSink` only records the request. This is the
   * other half — that the real sink then actually deletes the object, from the
   * backup bucket, under the key it was given. Without it, "a failed dump
   * leaves no object behind" would rest on a fake that cannot leave one.
   */
  it('discard deletes the key from the backup bucket', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    await s3SinkFromEnv(ENV, 'BACKUP_S3_BUCKET').discard('pg/2026-08-20T21-00.dump');
    const calls = s3Mock.commandCalls(DeleteObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0].input).toMatchObject({
      Bucket: 'gisik-nokma-backups',
      Key: 'pg/2026-08-20T21-00.dump',
    });
  });

  it('discarding a key nothing was uploaded to is not an error — the cleanup path is idempotent', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    const sink = s3SinkFromEnv(ENV, 'BACKUP_S3_BUCKET');
    await sink.discard('pg/never-written.dump');
    await sink.discard('pg/never-written.dump');
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(2);
  });
});
