import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ErrorAlerter } from '../../src/alerts/error-alerter.js';
import {
  backupRetentionDaysFromEnv,
  DEFAULT_BACKUP_RETENTION_DAYS,
  pruneBackups,
  runThenPrune,
  type PruneReport,
} from '../../src/ops/prune-backups.js';

/**
 * Spec §5.8 (T4) — backup retention. Cases 19.153–19.158
 * (`test-cases/19-trash.md` §19.18). S3 is mocked the way
 * `test/ops/object-sink.test.ts` mocks it; the clock is a fixed `now`.
 */

const s3Mock = mockClient(S3Client);
const target = { client: new S3Client({ region: 'us-east-1' }), bucket: 'gisik-nokma-backups' };
const NOW = new Date('2026-09-28T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

beforeEach(() => {
  s3Mock.reset();
});

function listing(prefix: string, contents: Array<{ Key: string; LastModified: Date }>) {
  s3Mock.on(ListObjectsV2Command, { Prefix: prefix }).resolves({ Contents: contents, IsTruncated: false });
}

function deletedKeys(): string[] {
  return s3Mock.commandCalls(DeleteObjectCommand).map((call) => call.args[0].input.Key ?? '');
}

describe('19.153 older than the window is deleted; the boundary and the newest are kept', () => {
  it('deletes only the 31-day-old dump', async () => {
    listing('pg/', [
      { Key: 'pg/2026-08-28T21-00.dump', LastModified: daysAgo(31) },
      { Key: 'pg/2026-08-29T21-00.dump', LastModified: daysAgo(30) },
      { Key: 'pg/2026-09-27T21-00.dump', LastModified: daysAgo(1) },
    ]);
    listing('ledger/', []);
    s3Mock.on(DeleteObjectCommand).resolves({});
    const report = await pruneBackups(target, { now: NOW, retentionDays: 30 });
    expect(report.deleted).toEqual(['pg/2026-08-28T21-00.dump']);
    expect(deletedKeys()).toEqual(['pg/2026-08-28T21-00.dump']);
    // CONTROL
    expect(report.examined).toBe(3);
    expect(report.keptNewest).toEqual(['pg/2026-09-27T21-00.dump']);
  });
});

describe('19.154 the newest backup under a prefix is never deleted', () => {
  it('keeps a lone 90-day-old dump, and still prunes an old export that is not the newest', async () => {
    listing('pg/', [{ Key: 'pg/2026-06-30T21-00.dump', LastModified: daysAgo(90) }]);
    listing('ledger/', [
      { Key: 'ledger/2026-06-30.ndjson.gz', LastModified: daysAgo(90) },
      { Key: 'ledger/2026-07-30.ndjson.gz', LastModified: daysAgo(60) },
    ]);
    s3Mock.on(DeleteObjectCommand).resolves({});
    const report = await pruneBackups(target, { now: NOW, retentionDays: 30 });
    expect(report.deleted).not.toContain('pg/2026-06-30T21-00.dump');
    expect(report.keptNewest).toEqual(['pg/2026-06-30T21-00.dump', 'ledger/2026-07-30.ndjson.gz']);
    // CONTROL — the window still applies to everything that is not the newest.
    expect(report.deleted).toEqual(['ledger/2026-06-30.ndjson.gz']);
  });
});

describe('19.155 pagination is followed', () => {
  it('deletes old objects from both pages and sends the continuation token', async () => {
    s3Mock
      .on(ListObjectsV2Command, { Prefix: 'pg/' })
      .resolvesOnce({
        Contents: [{ Key: 'pg/a.dump', LastModified: daysAgo(40) }],
        IsTruncated: true,
        NextContinuationToken: 'page-2',
      })
      .resolvesOnce({
        Contents: [
          { Key: 'pg/b.dump', LastModified: daysAgo(35) },
          { Key: 'pg/c.dump', LastModified: daysAgo(1) },
        ],
        IsTruncated: false,
      });
    listing('ledger/', []);
    s3Mock.on(DeleteObjectCommand).resolves({});
    const report = await pruneBackups(target, { now: NOW, retentionDays: 30 });
    expect(report.deleted).toContain('pg/b.dump');
    const tokens = s3Mock
      .commandCalls(ListObjectsV2Command)
      .filter((call) => call.args[0].input.Prefix === 'pg/')
      .map((call) => call.args[0].input.ContinuationToken);
    expect(tokens).toEqual([undefined, 'page-2']);
    expect(report.deleted).toContain('pg/a.dump'); // CONTROL
  });
});

describe('19.156 a failed delete is reported, not thrown', () => {
  it('records the failure and still deletes the other old object', async () => {
    listing('pg/', [
      { Key: 'pg/a.dump', LastModified: daysAgo(40) },
      { Key: 'pg/b.dump', LastModified: daysAgo(35) },
      { Key: 'pg/c.dump', LastModified: daysAgo(1) },
    ]);
    listing('ledger/', []);
    s3Mock.on(DeleteObjectCommand, { Key: 'pg/a.dump' }).rejects(new Error('AccessDenied'));
    s3Mock.on(DeleteObjectCommand, { Key: 'pg/b.dump' }).resolves({});
    const report = await pruneBackups(target, { now: NOW, retentionDays: 30 });
    expect(report.errors).toEqual(['pg/a.dump: AccessDenied']);
    expect(report.deleted).toEqual(['pg/b.dump']); // CONTROL
  });
});

describe('19.157 BACKUP_RETENTION_DAYS is a positive integer, default 30', () => {
  it('defaults, accepts 45, and refuses every non-positive or non-integer spelling by name', () => {
    expect(backupRetentionDaysFromEnv({})).toBe(DEFAULT_BACKUP_RETENTION_DAYS); // CONTROL
    expect(DEFAULT_BACKUP_RETENTION_DAYS).toBe(30);
    expect(backupRetentionDaysFromEnv({ BACKUP_RETENTION_DAYS: '' })).toBe(30);
    expect(backupRetentionDaysFromEnv({ BACKUP_RETENTION_DAYS: '45' })).toBe(45);
    for (const bad of ['abc', '0', '-3', '1.5']) {
      expect(() => backupRetentionDaysFromEnv({ BACKUP_RETENTION_DAYS: bad })).toThrow(/BACKUP_RETENTION_DAYS/);
    }
  });
});

describe('19.158 the prune follows a successful backup and never fails it', () => {
  it('alerts a thrown prune and a prune with errors, resolves both; a failing job never prunes', async () => {
    const calls: Array<{ context: string; message: string }> = [];
    const alerter: ErrorAlerter = {
      async notify(context, error) {
        calls.push({ context, message: error instanceof Error ? error.message : String(error) });
      },
    };
    const quiet = () => {};
    await expect(
      runThenPrune('pg-dump', async () => {}, async () => {
        throw new Error('list failed');
      }, alerter, quiet),
    ).resolves.toBeUndefined();
    const withErrors: PruneReport = { examined: 2, deleted: [], keptNewest: ['pg/c.dump'], errors: ['pg/a.dump: AccessDenied'] };
    await expect(runThenPrune('ledger-export', async () => {}, async () => withErrors, alerter, quiet)).resolves.toBeUndefined();
    expect(calls.map((call) => call.context)).toEqual(['backup:prune-after-pg-dump', 'backup:prune-after-ledger-export']);
    expect(calls[0]?.message).toBe('list failed');
    // CONTROL — a failed backup rejects, and is never followed by a prune.
    let pruned = false;
    await expect(
      runThenPrune('pg-dump', async () => {
        throw new Error('pg_dump exited 1');
      }, async () => {
        pruned = true;
        return withErrors;
      }, alerter, quiet),
    ).rejects.toThrow('pg_dump exited 1');
    expect(pruned).toBe(false);
  });
});
