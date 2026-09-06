import { pathToFileURL } from 'node:url';
import { createPool } from '../db.js';
import { createObjectStoreFromEnv } from '../attachments/store-config.js';
import { assertValidObjectKey, type ObjectStore } from '../attachments/object-store.js';
import type { Queryable } from '../db/queryable.js';

/**
 * How long an unnamed object survives before it is collected.
 *
 * ## Where an orphan comes from
 *
 * `routes/attachments.ts` writes bytes first and the `attachments` row second
 * (its own comment above the two calls says so): "this order can leave an
 * object no row names, which is invisible and collectable." The window is the
 * gap between `store.put()` succeeding and `insertAttachment()` committing —
 * a crash, a killed process, a database hiccup in exactly that instant — and
 * nothing else in this codebase ever produces bytes with no name. That is what
 * makes deleting an unnamed, sufficiently old object safe rather than a guess:
 * there is no OTHER shape of legitimate, still-in-progress upload that could
 * look like one.
 *
 * **Thirty days, matching `REVOKED_MEMBER_PREFERENCE_RETENTION_MS`** — a
 * default under uncertainty, one constant in one place, and deliberately not a
 * parameter of the sweep for the same reason that sibling gives: a window the
 * caller passes is a window no test ever exercises at its real value. *Owner:
 * the product owner, to confirm or replace.*
 */
export const ORPHAN_OBJECT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type OrphanSweepReport = {
  dryRun: boolean;
  /** Every object the store's `list()` returned. */
  examined: number;
  /** Objects a name was found for — attachments row, ledger event, or both. Never candidates. */
  named: number;
  /**
   * Keys that do not have the shape `w/<workspaceId>/a/<id>` — NEVER touched,
   * whatever their age. Named rather than silently skipped, same discipline as
   * `noRevocationEvidence` on the preferences sweep: an operator watching a
   * count needs to see which objects the sweep refuses to reason about and why.
   */
  unrecognizedShape: string[];
  /** Unnamed, recognized-shape objects younger than the retention window. */
  withinWindow: string[];
  /** Unnamed, recognized-shape objects at least as old as the window: deleted on a live run. */
  swept: string[];
  /** Objects actually deleted: 0 on a dry run, `swept.length` on a live run. */
  deleted: number;
};

/**
 * `w/<workspaceId>/a/<id>` — exactly four `/`-separated segments, each one
 * matching the store's OWN per-segment rule (`assertValidObjectKey`,
 * letters/digits/`_`/`-` only, no dot), with `segments[0] === 'w'` and
 * `segments[2] === 'a'`.
 *
 * The per-segment re-check is not redundant with the four-segment count. A
 * torn upload can leave `LocalDiskStore`'s own temp file behind —
 * `<key>.tmp-<pid>-<ms>` — and split on `/` that is STILL four segments
 * shaped exactly like an attachment key (`w`, `<ws>`, `a`,
 * `<id>.tmp-123-456`), because the extra suffix rides on the LAST segment
 * rather than adding one. Without this check that file would be accepted as
 * a recognized, unnamed, agable object; once 30 days old it would be handed
 * to `store.delete`, which calls `assertValidObjectKey` and throws
 * `InvalidObjectKeyError` on the dot in its own suffix — rejecting the WHOLE
 * sweep, forever, on one stray temp file. Reusing the store's own validator
 * means the sweep can only ever hand `delete` a key the store itself could
 * have minted for a real attachment.
 */
function recognizeAttachmentKey(key: string): { workspaceId: string; id: string } | null {
  try {
    assertValidObjectKey(key);
  } catch {
    return null;
  }
  const segments = key.split('/');
  if (segments.length !== 4 || segments[0] !== 'w' || segments[2] !== 'a') return null;
  const workspaceId = segments[1];
  const id = segments[3];
  if (workspaceId === undefined || id === undefined) return null;
  return { workspaceId, id };
}

/**
 * Is this attachment id named by something the product would use to serve it?
 *
 * ## Why this is a UNION of two signals, and neither alone
 *
 * There are two things that can name an upload attachment: the `attachments`
 * table row `routes/attachments.ts` inserts after the bytes land, and the
 * event-sourced `attachment.added` event (`kind: 'upload'`) that Plan 3
 * defined for the ledger. Both exist in this codebase. **The web client does
 * not currently post the ledger event at all** — grepping `apps/web/src` for
 * it turns up nothing — so an attachment can be fully live, served every day,
 * visible on its ticket, and have NO `attachment.added` row. Treating the
 * ledger event as the only survival signal would flag essentially every live
 * attachment in this product as an orphan.
 *
 * The `attachments` table, symmetrically, is not guaranteed to be the only
 * signal forever either: it is what THIS sweep can verify today, but a future
 * upload path could in principle register an attachment through the ledger
 * without ever inserting that row (a Drive-style reference by another name).
 * So the check is a union — named if EITHER query returns a row — deliberately
 * the MORE CONSERVATIVE choice: it can only make the sweep keep an object
 * longer than strictly necessary, never delete one that something still
 * names. A future reader "simplifying" this to one signal reintroduces
 * whichever failure mode the dropped half was covering.
 */
async function isNamed(db: Queryable, attachmentId: string): Promise<boolean> {
  const [byRow, byEvent] = await Promise.all([
    db.query('SELECT 1 FROM attachments WHERE id = $1', [attachmentId]),
    db.query(
      `SELECT 1 FROM events WHERE type = 'attachment.added' AND payload->>'attachmentId' = $1 LIMIT 1`,
      [attachmentId],
    ),
  ]);
  return (byRow.rows as unknown[]).length > 0 || (byEvent.rows as unknown[]).length > 0;
}

/**
 * Collect the bytes nothing names: `store.list()`'s own contents against the
 * database's two survival signals (see `isNamed` above), aged past
 * `ORPHAN_OBJECT_RETENTION_MS`.
 *
 * A wrong delete here is UNRECOVERABLE — there is no undo, unlike the
 * preferences and invite-token sweeps beside this one, which only lose a few
 * hundred bytes of re-derivable state. That is why every branch below either
 * proves a key is unnamed by TWO independent queries or refuses to touch it
 * at all (`unrecognizedShape`), and why `now` is an injected parameter for
 * the same testability reason `sweepUserPreferences` gives: the window is the
 * whole behaviour, and a function that read its own clock could only be
 * tested by sleeping through thirty days.
 *
 * **Known ceiling, recorded rather than discovered (the same class 13.34
 * already names for `readLedger`):** `store.list()` is called with no prefix
 * and its whole result is materialised in memory before this loop starts, so
 * peak memory scales with the OBJECT COUNT in the bucket, not with anything
 * bounded. On the same `basic-xxs` worker the backup daemon runs on, a bucket
 * large enough could OOM this job before it deletes anything. Not fixed here:
 * a constant-memory sweep needs a paged or streaming `list()`, which is a
 * change to the `ObjectStore` contract, not to this function alone.
 */
export async function sweepOrphanObjects(
  store: ObjectStore,
  db: Queryable,
  options: { now: Date; dryRun: boolean },
): Promise<OrphanSweepReport> {
  const listing = await store.list();

  const report: OrphanSweepReport = {
    dryRun: options.dryRun,
    examined: listing.length,
    named: 0,
    unrecognizedShape: [],
    withinWindow: [],
    swept: [],
    deleted: 0,
  };

  for (const object of listing) {
    const recognized = recognizeAttachmentKey(object.key);
    if (recognized === null) {
      report.unrecognizedShape.push(object.key);
      continue;
    }

    if (await isNamed(db, recognized.id)) {
      report.named += 1;
      continue;
    }

    if (options.now.getTime() - object.lastModified.getTime() < ORPHAN_OBJECT_RETENTION_MS) {
      report.withinWindow.push(object.key);
      continue;
    }

    report.swept.push(object.key);
    if (!options.dryRun) {
      await store.delete(object.key);
      report.deleted += 1;
    }
  }

  return report;
}

export function formatOrphanSweepReport(report: OrphanSweepReport): string {
  const verb = report.dryRun ? 'would sweep' : 'swept';
  const lines = [
    `sweep-orphans${report.dryRun ? ' (dry run)' : ''}: ` +
      `${report.examined} object(s) examined, ${report.named} named, ` +
      `${report.unrecognizedShape.length} unrecognized shape, ` +
      `${report.withinWindow.length} inside the retention window, ${verb} ${report.swept.length}`,
  ];
  for (const key of report.swept) {
    lines.push(`  swept ${key}`);
  }
  // Named rather than silent: an operator watching a count that never falls
  // needs to be able to see WHICH keys the sweep refuses to reason about.
  for (const key of report.unrecognizedShape) {
    lines.push(`  IGNORED, unrecognized shape: ${key}`);
  }
  return lines.join('\n');
}

/**
 * One sweep, from a shell — and the ONLY place in this module that reads a
 * clock. See `sweepOrphanObjects` for why that separation is the design and
 * not a convenience.
 *
 * `--dry-run` is a plain `includes` check, matching every sibling in this
 * directory: nothing here needs a value, so there is no reason to reach for
 * the one general flag-value parser this repo has.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const dryRun = process.argv.includes('--dry-run');
  const pool = createPool(databaseUrl);
  const store = createObjectStoreFromEnv(process.env);
  try {
    const report = await sweepOrphanObjects(store, pool, { now: new Date(), dryRun });
    console.log(formatOrphanSweepReport(report));
  } finally {
    await pool.end();
  }
}

const executedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  main().catch((error: unknown) => {
    console.error('sweep-orphans failed', error);
    process.exit(1);
  });
}
