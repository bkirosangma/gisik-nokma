import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import { ORPHAN_OBJECT_RETENTION_MS, sweepOrphanObjects } from '../../src/tools/sweep-orphans.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';

/**
 * A REAL `LocalDiskStore` over a `mkdtemp`'d directory, not a mock — the
 * point of this file is the real interaction between the store's own
 * key-validity rule and the sweep's shape recognizer (see the `.tmp-`
 * case below), which a fake store could not exercise honestly.
 *
 * Every fixture mints fresh workspace/attachment/ticket ULIDs, and the store
 * gets a fresh subdirectory per test, so tests never share state through
 * either the database or the disk.
 */
let db: TestDatabase;
let sandbox = '';

beforeAll(async () => {
  db = await createTestDatabase();
  sandbox = await mkdtemp(join(tmpdir(), 'gisik-orphans-'));
});

afterAll(async () => {
  await db.drop();
  await rm(sandbox, { recursive: true, force: true });
});

let root = '';
let store: LocalDiskStore;

beforeEach(async () => {
  await db.pool.query('TRUNCATE attachments');
  root = join(sandbox, `store-${newUlid()}`);
  await mkdir(root, { recursive: true });
  store = new LocalDiskStore(root);
});

const SEED_ACTOR = '01J0SEEDADM1N0000000000000';

async function putBytes(key: string): Promise<void> {
  await store.put(key, Readable.from(Buffer.from('attachment bytes')), {
    mime: 'image/png',
    size: 17,
  });
}

/**
 * Writes a file directly onto disk at the given key's path, bypassing
 * `store.put` — needed for the `.tmp-` fixture below, since a real dotted
 * suffix is exactly what `store.put` itself refuses to write
 * (`assertValidObjectKey`). This reproduces the artifact a torn `rename()`
 * actually leaves, rather than a key the store's own contract could mint.
 */
async function putRawFile(key: string): Promise<void> {
  const path = join(root, ...key.split('/'));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, 'stray bytes from a torn write');
}

async function backdate(key: string, days: number): Promise<void> {
  const path = join(root, ...key.split('/'));
  const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  await utimes(path, when, when);
}

async function storeHasKey(key: string): Promise<boolean> {
  const listing = await store.list();
  return listing.some((entry) => entry.key === key);
}

async function seedAttachmentRow(id: string, workspaceId: string): Promise<void> {
  await insertAttachment(db.pool, {
    id,
    workspaceId,
    ticketId: newUlid(),
    uploaderId: SEED_ACTOR,
    filename: 'evidence.png',
    mime: 'image/png',
    size: 17,
    objectKey: `w/${workspaceId}/a/${id}`,
  });
}

/**
 * The OTHER survival signal — `attachment.added`, `kind: 'upload'` — through
 * the ledger, exactly the shape `evidence-gate.ts` reads back. The web client
 * does not post this event today (see `sweep-orphans.ts`'s docblock), so this
 * fixture is deliberately the only place in the file an attachment survives
 * WITHOUT an `attachments` row, proving the union really has two live halves.
 */
async function seedAttachmentAddedEvent(
  attachmentId: string,
  workspaceId: string,
  ticketId: string,
): Promise<void> {
  await appendTestEvent(
    db.pool,
    testEnvelope({
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'attachment.added',
      payload: {
        kind: 'upload',
        attachmentId,
        filename: 'x',
        mime: 'image/png',
        size: 1,
        sha256: '0'.repeat(64),
      },
      actorId: SEED_ACTOR,
    }),
  );
}

describe('sweepOrphanObjects', () => {
  /**
   * 9.247 — an object named ONLY by an `attachments` table row survives, however old.
   */
  it('an object named ONLY by an attachments-table row survives, however old', async () => {
    const ws = newUlid();
    const id = newUlid();
    const key = `w/${ws}/a/${id}`;
    await putBytes(key);
    await backdate(key, 40);
    await seedAttachmentRow(id, ws);

    const report = await sweepOrphanObjects(store, db.pool, { now: new Date(), dryRun: false });
    expect(report.swept).toEqual([]);
    expect(report.named).toBe(1);
    expect(await storeHasKey(key)).toBe(true);
  });

  /**
   * 9.248 — an object named ONLY by an `attachment.added` ledger event (`kind: 'upload'`) survives, however old — the union's OTHER half.
   */
  it('an object named ONLY by an attachment.added ledger event survives, however old', async () => {
    const ws = newUlid();
    const id = newUlid();
    const ticketId = newUlid();
    const key = `w/${ws}/a/${id}`;
    await putBytes(key);
    await backdate(key, 40);
    await seedAttachmentAddedEvent(id, ws, ticketId);

    const report = await sweepOrphanObjects(store, db.pool, { now: new Date(), dryRun: false });
    expect(report.swept).toEqual([]);
    expect(report.named).toBe(1);
    expect(await storeHasKey(key)).toBe(true);
  });

  /**
   * 9.249 — an unnamed object 10 days old survives, inside the 30-day retention window.
   */
  it('an unnamed object 10 days old survives — inside the retention window', async () => {
    const ws = newUlid();
    const id = newUlid();
    const key = `w/${ws}/a/${id}`;
    await putBytes(key);
    await backdate(key, 10);

    const report = await sweepOrphanObjects(store, db.pool, { now: new Date(), dryRun: false });
    expect(report.swept).toEqual([]);
    expect(report.withinWindow).toEqual([key]);
    expect(await storeHasKey(key)).toBe(true);
  });

  /**
   * 9.250 — an unnamed object 40 days old is swept on the first run, and a second run at the same clock finds nothing left to sweep — the idempotence property.
   */
  it('an unnamed object 40 days old is swept on the first run; a second run finds nothing left', async () => {
    const ws = newUlid();
    const id = newUlid();
    const key = `w/${ws}/a/${id}`;
    await putBytes(key);
    await backdate(key, 40);

    const now = new Date();
    const first = await sweepOrphanObjects(store, db.pool, { now, dryRun: false });
    expect(first.swept).toEqual([key]);
    expect(first.deleted).toBe(1);
    expect(await storeHasKey(key)).toBe(false);

    const second = await sweepOrphanObjects(store, db.pool, { now, dryRun: false });
    expect(second.swept).toEqual([]);
    expect(second.deleted).toBe(0);
  });

  /**
   * 9.251 — a key that does not match the `w/<workspaceId>/a/<id>` shape is left alone whatever its age or naming — recorded in `unrecognizedShape`, never `swept`.
   */
  it('a key that does not match w/<workspaceId>/a/<id> is left alone, whatever its age or naming', async () => {
    const key = 'w/ws1/other-thing';
    await putBytes(key);
    await backdate(key, 400);

    const report = await sweepOrphanObjects(store, db.pool, { now: new Date(), dryRun: false });
    expect(report.swept).not.toContain(key);
    expect(report.unrecognizedShape).toEqual([key]);
    expect(await storeHasKey(key)).toBe(true);
  });

  /**
   * The fixture the advisor's review caught before it shipped: a torn-write
   * `.tmp-<pid>-<ms>` leftover splits into four `/`-segments shaped exactly
   * like `w/<ws>/a/<id>` — the dotted suffix rides on the LAST segment rather
   * than adding a fifth — so a shape check that only counted segments would
   * accept it, age it past the window, and hand it to `store.delete`, which
   * throws `InvalidObjectKeyError` on that same dot and would take the WHOLE
   * sweep down. `recognizeAttachmentKey` reuses the store's own
   * `assertValidObjectKey`, so this lands in `unrecognizedShape` instead and
   * the file is untouched.
   */
  /**
   * 9.252 — a torn-write `.tmp-<pid>-<ms>` leftover is refused as unrecognized shape rather than accepted and later crashing `store.delete`.
   */
  it('a torn-write .tmp- leftover is refused as unrecognized shape, not deleted', async () => {
    const ws = newUlid();
    const id = newUlid();
    const key = `w/${ws}/a/${id}.tmp-999-123456`;
    await putRawFile(key);
    await backdate(key, 400);

    const report = await sweepOrphanObjects(store, db.pool, { now: new Date(), dryRun: false });
    expect(report.swept).not.toContain(key);
    expect(report.unrecognizedShape).toEqual([key]);
    expect(await storeHasKey(key)).toBe(true);
  });

  /**
   * 9.253 — a dry run makes no `store.delete` calls and reports the identical `swept` list a live run at the same clock would actually delete.
   */
  it('a dry run makes no store.delete calls and reports the same swept list a live run would delete', async () => {
    const ws = newUlid();
    const id = newUlid();
    const key = `w/${ws}/a/${id}`;
    await putBytes(key);
    await backdate(key, 40);

    const now = new Date();
    const dry = await sweepOrphanObjects(store, db.pool, { now, dryRun: true });
    expect(dry.swept).toEqual([key]);
    expect(dry.deleted).toBe(0);
    expect(await storeHasKey(key)).toBe(true);

    const live = await sweepOrphanObjects(store, db.pool, { now, dryRun: false });
    expect(live.swept).toEqual(dry.swept);
    expect(live.deleted).toBe(1);
    expect(await storeHasKey(key)).toBe(false);
  });

  /**
   * The `<` in `sweepOrphanObjects`, pinned directly rather than only implied
   * by the 10-day/40-day fixtures above: those two are comfortably on either
   * side of the line and would stay green even if the comparison were `<=`
   * or off by a day. Here `now` is fixed once and the object's mtime is set
   * relative to THAT same value (not `Date.now()` re-read at fixture time, as
   * `backdate()` does above — that gap would swallow the very boundary this
   * test exists to hit), so "exactly `ORPHAN_OBJECT_RETENTION_MS` old" is
   * true to the millisecond, not "approximately 30 days depending on how
   * long setup took". The "just inside" half uses a 1-second margin rather
   * than 1ms, to stay clear of filesystems whose mtime resolution is coarser
   * than a millisecond.
   */
  /**
   * 9.256 — the retention boundary is "sweep at or past 30 days," not "sweep only when older": an object aged to EXACTLY `ORPHAN_OBJECT_RETENTION_MS` is swept, and one 1 second inside the window survives.
   */
  it('the retention boundary is a "sweep at or past 30 days", not "sweep only when older"', async () => {
    const now = new Date();

    const ws1 = newUlid();
    const id1 = newUlid();
    const exactlyAtBoundaryKey = `w/${ws1}/a/${id1}`;
    await putBytes(exactlyAtBoundaryKey);
    const exactlyAtBoundary = new Date(now.getTime() - ORPHAN_OBJECT_RETENTION_MS);
    const exactlyAtBoundaryPath = join(root, ...exactlyAtBoundaryKey.split('/'));
    await utimes(exactlyAtBoundaryPath, exactlyAtBoundary, exactlyAtBoundary);

    const ws2 = newUlid();
    const id2 = newUlid();
    const justInsideKey = `w/${ws2}/a/${id2}`;
    await putBytes(justInsideKey);
    const justInside = new Date(now.getTime() - ORPHAN_OBJECT_RETENTION_MS + 1000);
    const justInsidePath = join(root, ...justInsideKey.split('/'));
    await utimes(justInsidePath, justInside, justInside);

    const report = await sweepOrphanObjects(store, db.pool, { now, dryRun: false });
    expect(report.swept).toEqual([exactlyAtBoundaryKey]);
    expect(report.withinWindow).toEqual([justInsideKey]);
  });

  /**
   * 9.254 — `ORPHAN_OBJECT_RETENTION_MS` is exactly 30 days — the boundary constant every fixture above is measured against.
   */
  it('the retention constant is exactly 30 days — a boundary sanity check the fixtures above rely on', () => {
    expect(ORPHAN_OBJECT_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
