import type { Readable } from 'node:stream';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

/**
 * The backup object sink: put-only, S3 protocol, and deliberately its OWN
 * implementation rather than a reuse of `../attachments/`.
 *
 * WHY THIS FILE DOES NOT IMPORT `assertValidObjectKey` OR `S3ObjectStore`
 * ---------------------------------------------------------------------
 * The attachment store's key validator refuses any key containing a dot, and
 * it is right to. It guards a subsystem whose keys are derived from
 * CALLER-SUPPLIED input, where a `.` or `..` segment is a path-traversal
 * attempt; `test/attachments/s3-store.test.ts` pins that refusal with a
 * planted defect. Backup keys are the opposite case: `ledger/2026-08-23.
 * ndjson.gz` and `pg/2026-08-20T21-00.dump` are generated *here*, from a
 * timestamp, never from a request, and they legitimately carry dots.
 * Widening that validator to admit them would weaken a live security control
 * in a different subsystem to suit this one. So the two stay apart: a
 * distinct interface, a distinct bucket (`BACKUP_S3_BUCKET`, never the
 * attachment bucket), a distinct implementation. Do NOT "fix" this file by
 * importing the attachment validator back in.
 */
export type ObjectSink = {
  put(key: string, body: Readable, contentType: string): Promise<void>;
  /**
   * Undo a `put`: abort it if it is still running, then delete whatever landed
   * at `key`. It exists because `dumpDatabaseToSink` hands the sink
   * `child.stdout` BEFORE `pg_dump`'s exit code is known, so a dump that dies
   * halfway has already streamed a short archive to a normal-looking dated key
   * — and an object a restore drill cannot tell from a good one is worse than
   * no object at all. Idempotent, and not an error when `key` holds nothing.
   */
  discard(key: string): Promise<void>;
};

/** A configured client plus the bucket it was configured for. */
export type BackupS3Target = { client: S3Client; bucket: string };

/**
 * S3 protocol only — MinIO in dev, DO Spaces BLR1 in production, R2 or S3
 * proper if object storage ever moves. No vendor name appears here; the
 * endpoint is env, which is what keeps that move a config change.
 *
 * It reads the SAME `OBJECT_STORE_S3_*` variable NAMES the attachment store
 * reads (`../attachments/store-config.ts`); only the bucket differs, and it is
 * named by `bucketVar` — `BACKUP_S3_BUCKET` when the backup daemon calls in —
 * so backups can never land in the attachment bucket by accident.
 * `deploy/do/app.yaml`'s backup worker recorded that reuse as an UNRESOLVED
 * working assumption; this settles it, and that file now carries the decision
 * plus the endpoint/region/path-style keys the worker needs.
 *
 * WHAT IS REQUIRED HERE IS STRICTER THAN `store-config.ts`, DELIBERATELY.
 * ---------------------------------------------------------------------
 * This is NOT a mirror of that function's `required` map, and the difference
 * is the point rather than drift. `store-config.ts` requires region, bucket
 * and the credential pair, and leaves the ENDPOINT optional because omitting
 * it against real AWS S3 is legitimate — the SDK derives the endpoint from the
 * region there. This function requires the endpoint TOO, and it refuses a
 * missing region rather than defaulting one, because a backup destination has
 * no safe fallback to degrade to:
 *
 *   - No endpoint means the SDK resolves `s3.<region>.amazonaws.com`. Against
 *     the environment `deploy/do/app.yaml`'s backup worker used to supply
 *     (bucket + credential pair, nothing else), an earlier draft of this
 *     function resolved `https://s3.us-east-1.amazonaws.com/gisik-nokma-
 *     backups` and would have posted DO Spaces credentials at Amazon nightly.
 *   - A defaulted region is fatal even once the endpoint is right: SigV4
 *     signed for `us-east-1` against a `blr1` bucket is a 403.
 *
 * Neither failure is visible in dev, because `.env.example` sets both for
 * MinIO. So both are boot-time refusals that NAME the variable instead.
 *
 * Every credential is DESTRUCTURED off `env` rather than read as `env.NAME`,
 * the shape the env contract gate (`scripts/check-env-example.mjs`, detector
 * D2) can see — property access off a local `env` would leave them invisible
 * to it. (D2 attributes these five names to `store-config.ts`, which reads
 * them too and which the walker reaches first; the style is what would make a
 * future BACKUP-ONLY variable visible here — see case 13.20.) The bucket is
 * the one exception: its name is dynamic (`env[bucketVar]`), and it is
 * documented in `.env.example` under its own literal name.
 */
export function s3TargetFromEnv(env: NodeJS.ProcessEnv, bucketVar: string): BackupS3Target {
  const {
    OBJECT_STORE_S3_ENDPOINT,
    OBJECT_STORE_S3_REGION,
    OBJECT_STORE_S3_ACCESS_KEY_ID,
    OBJECT_STORE_S3_SECRET_ACCESS_KEY,
    OBJECT_STORE_S3_FORCE_PATH_STYLE,
  } = env;

  const bucket = env[bucketVar];
  const required: Record<string, string | undefined> = {
    [bucketVar]: bucket,
    OBJECT_STORE_S3_ENDPOINT,
    OBJECT_STORE_S3_REGION,
    OBJECT_STORE_S3_ACCESS_KEY_ID,
    OBJECT_STORE_S3_SECRET_ACCESS_KEY,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value === '')
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`backup object storage needs: ${missing.join(', ')}`);
  }

  const client = new S3Client({
    // Required above, so never absent here — an unset endpoint would let the
    // SDK resolve Amazon's, which is a different cloud, not a default.
    endpoint: OBJECT_STORE_S3_ENDPOINT as string,
    region: OBJECT_STORE_S3_REGION as string,
    // Path style is what MinIO (dev) needs and what R2 accepts; Spaces wants
    // subdomain style, which is why `deploy/do/app.yaml` sets this to 'false'
    // explicitly on BOTH the server and the backup worker. Same default and
    // same expression as `store-config.ts`, for the same reason.
    forcePathStyle: OBJECT_STORE_S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: OBJECT_STORE_S3_ACCESS_KEY_ID as string,
      secretAccessKey: OBJECT_STORE_S3_SECRET_ACCESS_KEY as string,
    },
  });

  return { client, bucket: bucket as string };
}

/**
 * The write half, streamed: `Upload` handles multipart on its own, so a
 * multi-gigabyte dump never has to be buffered in the worker's memory.
 *
 * The running uploads are tracked by key so `discard` can `abort()` one that is
 * still in flight. That is the half a `DeleteObjectCommand` alone cannot do:
 * a multipart upload nobody aborts leaves its already-uploaded parts on the
 * bucket, billed and invisible, because they are not an object yet and no
 * listing shows them.
 */
export function s3SinkFromEnv(env: NodeJS.ProcessEnv, bucketVar: string): ObjectSink {
  const { client, bucket } = s3TargetFromEnv(env, bucketVar);
  const running = new Map<string, Upload>();
  return {
    async put(key, body, contentType) {
      const upload = new Upload({
        client,
        params: { Bucket: bucket, Key: key, Body: body, ContentType: contentType },
      });
      running.set(key, upload);
      try {
        await upload.done();
      } finally {
        running.delete(key);
      }
    },
    async discard(key) {
      const upload = running.get(key);
      if (upload) {
        running.delete(key);
        await upload.abort();
      }
      // Then the object itself, for the case the upload already completed —
      // a short dump fits in one part and lands before the exit code is known.
      // Deleting a key that holds nothing is a 204, not an error.
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
