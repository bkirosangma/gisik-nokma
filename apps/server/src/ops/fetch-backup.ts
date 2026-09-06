import { createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3TargetFromEnv } from './object-sink.js';

/**
 * The restore path's first step: pull ONE backup object down to a local file.
 * Deliberately the read half of the same configuration `object-sink.ts`
 * builds — `ObjectSink` is put-only on purpose, so this reaches for the
 * client directly rather than widening that interface with a `get` no backup
 * job needs.
 */
async function main(): Promise<void> {
  const [key, outFile] = process.argv.slice(2);
  if (!key || !outFile) {
    console.error(
      'usage: ops:fetch-backup <object-key> <out-file>   (env: OBJECT_STORE_S3_*, BACKUP_S3_BUCKET)',
    );
    process.exit(2);
  }
  const { client, bucket } = s3TargetFromEnv(process.env, 'BACKUP_S3_BUCKET');
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) throw new Error(`${bucket}/${key} came back with no body`);
  await pipeline(object.Body as Readable, createWriteStream(outFile));
  console.log(`${key} -> ${outFile}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
