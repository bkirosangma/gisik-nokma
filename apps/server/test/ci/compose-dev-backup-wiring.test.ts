import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * Asserted against the PARSED compose file, for the same reason `ci-workflow-shape.test.ts`
 * parses `ci.yml`: a grep would pass or fail on formatting and say nothing about what the
 * stack actually runs with.
 *
 * This exists because case 13.195's docker half had never been run. When it was, the
 * in-container rehearsal the runbook documents —
 * `node dist/ops/backup-daemon-main.js --once` — refused with "backup object storage
 * needs: BACKUP_S3_BUCKET". The variable had been deliberately omitted, and the recorded
 * reason was sound at the time: nothing read it (measured, 0 hits in `apps/server/src`),
 * and setting a variable no code reads is an undocumented-intent env var. That premise
 * expired when the backup work merged — the same control re-run gives five hits — and
 * nothing was watching the premise.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const compose = parse(readFileSync(join(REPO_ROOT, 'docker-compose.dev.yml'), 'utf8')) as {
  services: Record<string, { environment?: Record<string, string> }>;
};
const serverEnv = compose.services['server']?.environment ?? {};

describe('docker-compose.dev.yml — the backup daemon can actually run in the container', () => {
  /**
   * 13.195 — the docker half of Task 16 Step 4, now RUN rather than deferred: `compose up
   * --build`, `check:db-tz` against the compose database, and the in-container `--once`
   * backup all pass. This is the piece that had to change for the third to work, and it is
   * asserted here so the rehearsal does not have to be re-run by hand to notice it break.
   */
  it('declares BACKUP_S3_BUCKET on the server service', () => {
    expect(serverEnv['BACKUP_S3_BUCKET']).toBeTruthy();
  });

  /**
   * 13.195 — and it is a DISTINCT bucket from the attachment store's. Backups and
   * attachments sharing one bucket is the failure the separate variable exists to prevent:
   * an orphan sweep over the attachment bucket would then be walking the backups too.
   */
  it('points backups at a different bucket from attachments', () => {
    expect(serverEnv['OBJECT_STORE_S3_BUCKET']).toBeTruthy();
    expect(serverEnv['BACKUP_S3_BUCKET']).not.toBe(serverEnv['OBJECT_STORE_S3_BUCKET']);
  });

  /**
   * 13.195 — the bucket the server names must be one `minio-init` actually creates.
   * Naming a bucket nobody made would satisfy both cases above and still refuse at runtime,
   * which is precisely the shape of the defect this row is about.
   */
  it('names a bucket minio-init creates', () => {
    const init = compose.services['minio-init'] as unknown as { entrypoint?: string };
    const bucket = serverEnv['BACKUP_S3_BUCKET'] ?? '';
    expect(init.entrypoint ?? '').toContain(bucket);
  });
});
