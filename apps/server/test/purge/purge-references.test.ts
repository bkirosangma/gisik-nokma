import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, PURGED_ITEM_LABEL } from '@gisik-nokma/domain';
import { backfillReferences } from '../../src/projections/backfill-references.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem, type PurgeDeps } from '../../src/purge/purge-item.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scan } from './scan.js';
import { makeCommitted } from '../helpers/apply.js';
import { buildReferenceWorld, buildWorkspacePair, doc, dueAt, ev, noteCreated, recordingStore, text, ticketRef } from './world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);
afterAll(async () => {
  await db.drop();
});

const deps = (now: Date): PurgeDeps => ({ projections: buildProjectionRegistry(), store: recordingStore(), now });
const clean = async () =>
  expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
const refRows = async (where: string, params: unknown[]) =>
  (await db.pool.query<{ source_id: string; target_id: string; snippet: string }>(`SELECT source_id, target_id, snippet FROM proj_references WHERE ${where} ORDER BY source_id, ordinal`, params)).rows;

describe('27.113 a purged TARGET leaves no row and no quote', () => {
  it('27.113 survivors that chipped T lose their rows to T; a neighbour reference in the same block now reads Deleted item', async () => {
    const w = await buildReferenceWorld(db.pool);
    const OTHER = newUlid();
    const NB = newUlid();
    await applyCommitted(db.pool, [
      noteCreated(w, NB, { title: 'Both', homeProjectId: '', scope: { mode: 'workspace' }, body: doc(ticketRef(w.T, w.P, 'PG-1', `Invoice ${w.marker}`), text(' blocks '), ticketRef(OTHER, w.P, 'PG-9', 'Other')) }),
    ]);
    expect((await refRows('target_id = $1', [w.T])).length).toBeGreaterThan(0); // CONTROL
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(await refRows('target_id = $1', [w.T])).toEqual([]);
    expect(await refRows('source_id = $1', [NB])).toEqual([{ source_id: NB, target_id: OTHER, snippet: `${PURGED_ITEM_LABEL} blocks [[PG-9 Other]]` }]);
    expect(Object.keys(await scan(db.pool, [w.T, w.marker])).filter((k) => k.startsWith('proj_references.'))).toEqual([]);
    await clean();
  });

  it('27.113 a COMMENT ON A NOTE that chips T and a second item: after the purge its row reads Deleted item for T, not T’s title', async () => {
    const w = await buildReferenceWorld(db.pool);
    const OTHER = newUlid();
    const NC = newUlid();
    await applyCommitted(db.pool, [
      noteCreated(w, NC, { title: 'Host', homeProjectId: '', scope: { mode: 'workspace' }, body: doc(text('plain')) }),
      ev(w, 'note', NC, 'comment.added', { body: doc(ticketRef(w.T, w.P, 'PG-1', `Invoice ${w.marker}`), text(' and '), ticketRef(OTHER, w.P, 'PG-9', 'Other')) }),
    ]);
    const before = await refRows(`source_parent_id = $1`, [NC]);
    expect(before.map((r) => r.target_id)).toEqual([w.T, OTHER]); // CONTROL: both references are indexed before the purge
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    const after = await refRows(`source_parent_id = $1`, [NC]);
    expect(after.map((r) => [r.target_id, r.snippet])).toEqual([[OTHER, `${PURGED_ITEM_LABEL} and [[PG-9 Other]]`]]);
    expect(JSON.stringify(after)).not.toContain(w.marker);
    await clean();
  });
});

describe('27.114 a purged SOURCE takes its own rows and its comments’ rows', () => {
  it('27.114 T’s description rows and the rows of comments on T go; a survivor’s rows stay (control)', async () => {
    const w = await buildReferenceWorld(db.pool);
    const X = newUlid();
    const NX = newUlid();
    await applyCommitted(db.pool, [
      ev(w, 'ticket', w.T, 'ticket.field_set', { fieldId: 'description', value: doc(ticketRef(X, w.P, 'PG-7', 'X')) }),
      ev(w, 'ticket', w.T, 'comment.added', { body: doc(ticketRef(X, w.P, 'PG-7', 'X')) }),
      // CONTROL: a source OUTSIDE T that chips the same X. Its row to X is not T's and not to T: it must outlive the purge.
      noteCreated(w, NX, { title: 'Outside', homeProjectId: '', scope: { mode: 'workspace' }, body: doc(text('also '), ticketRef(X, w.P, 'PG-7', 'X')) }),
    ]);
    expect((await refRows(`source_parent_id = $1`, [w.T])).length).toBe(2);
    const keep = await refRows(`source_id = $1`, [NX]);
    expect(keep).toEqual([{ source_id: NX, target_id: X, snippet: 'also [[PG-7 X]]' }]);
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(await refRows(`source_parent_id = $1`, [w.T])).toEqual([]);
    expect(await refRows(`source_id = $1`, [NX])).toEqual(keep);
    await clean();
  });
});

describe('27.115 a body written AFTER the purge that still chips the purged id', () => {
  it('27.115 writes no row for it, keeps the ordinal of the next reference, and a rebuild agrees', async () => {
    const w = await buildReferenceWorld(db.pool);
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    const LATE = newUlid();
    const Y = newUlid();
    // The purge wrote its own events straight to the ledger, past `makeCommitted`'s process-local
    // workspace counter: number this one from the database, as ingest's `nextWorkspaceSeq` does.
    const { rows: top } = await db.pool.query<{ n: number }>('SELECT max(workspace_seq)::int AS n FROM events WHERE workspace_id = $1', [w.WS]);
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: w.WS,
        actorId: w.OWNER,
        entity: { kind: 'note', id: LATE },
        type: 'note.created',
        workspaceSeq: (top[0]?.n ?? 0) + 1,
        payload: { title: 'Late', homeProjectId: '', scope: { mode: 'workspace' }, body: doc(ticketRef(w.T, w.P, 'PG-1', 'stale'), text(' then '), ticketRef(Y, w.P, 'PG-3', 'Y')) },
      }),
    ]);
    const rows = (await db.pool.query<{ target_id: string; ordinal: number }>('SELECT target_id, ordinal FROM proj_references WHERE source_id = $1', [LATE])).rows;
    expect(rows).toEqual([{ target_id: Y, ordinal: 1 }]);
    await clean();
  });
});

describe('27.116 a workspace purge empties the workspace’s rows', () => {
  it('27.116 every row of the purged workspace goes; another workspace’s rows stay (control)', async () => {
    const pair = await buildWorkspacePair(db.pool);
    const X = newUlid();
    const [gone, keep] = [newUlid(), newUlid()];
    await applyCommitted(db.pool, [
      noteCreated(pair.W1, gone, { title: 'Gone', homeProjectId: '', scope: { mode: 'workspace' }, body: doc(ticketRef(pair.T1, pair.P1, 'GN-1', 'Doomed'), text(' and '), ticketRef(X, pair.P1, 'GN-2', 'X')) }),
      noteCreated(pair.W2, keep, { title: 'Keep', homeProjectId: '', scope: { mode: 'workspace' }, body: doc(ticketRef(X, pair.P1, 'GN-2', 'X')) }),
    ]);
    expect((await refRows('workspace_id = $1', [pair.W1.WS])).length).toBe(2); // CONTROL
    await purgeItem(db.pool, { kind: 'workspace', id: pair.W1.WS }, deps(await dueAt(db.pool, 'workspace', pair.W1.WS)));
    expect(await refRows('workspace_id = $1', [pair.W1.WS])).toEqual([]);
    expect((await refRows('workspace_id = $1', [pair.W2.WS])).length).toBe(1);
    await clean();
  });
});

describe('27.123 a purge and the boot backfill meeting on a survivor of the purged item', () => {
  it('27.123 the backfill holds a survivor’s lock when the purge starts: both complete, the rows equal a rebuild, no 40P01 escapes; the same run with no purge is the control', async () => {
    const w = await buildReferenceWorld(db.pool);
    // First boot after the migration, with the rows the live ingest has written since (the world's own events): no marker,
    // and S1 already HAS a row to T. That row is what the purge's erasure DELETE locks and the backfill's DELETE then waits on.
    const firstBoot = async () => {
      await db.pool.query('DELETE FROM projection_backfills');
    };
    const toT = async () => (await db.pool.query<{ p: string }>('SELECT source_parent_id AS p FROM proj_references WHERE target_id = $1 ORDER BY 1', [w.T])).rows.map((r) => r.p);
    // S1 (a ticket whose comment chips T) is a survivor of T's purge. The backfill reaches it, takes its lock, and the purge
    // starts while it is held: the order in which a purge that erased the rows to T FIRST would deadlock with the backfill's
    // DELETE of S1's rows (the purge waiting for S1's lock, the backfill waiting for the purge's rows).
    let purging: Promise<unknown> | null = null;
    const run = async (withPurge: boolean) => {
      await firstBoot();
      purging = null;
      let reached = false;
      const result = await backfillReferences(db.pool, {
        projections: buildProjectionRegistry(),
        probe: async (stage, entity) => {
          if (stage !== 'locked' || entity.id !== w.S1) return;
          reached = true;
          if (!withPurge) return;
          purging = purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
          purging.catch(() => undefined); // its outcome is awaited below; never an unhandled rejection meanwhile
          // Hold the lock until the purge is BLOCKED on an advisory lock (S1's): that is the moment the order matters.
          for (let i = 0; i < 1000; i += 1) {
            const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted");
            if ((rows[0]?.n ?? 0) > 0) return;
            await new Promise((r) => setTimeout(r, 10));
          }
          throw new Error('the purge never waited on the survivor’s entity lock');
        },
      });
      expect(reached).toBe(true);
      return result;
    };

    // CONTROL: the same run, the same probe point, no concurrent transaction: S1's row to T is indexed.
    expect(await run(false)).toMatchObject({ ran: true });
    expect(await toT()).toContain(w.S1);

    const result = await run(true);
    expect(result).toMatchObject({ ran: true });
    expect(await (purging as Promise<unknown> | null)).toMatchObject({ status: 'purged' });
    expect(await toT()).toEqual([]);
    expect((await db.pool.query('SELECT 1 FROM projection_backfills')).rowCount).toBe(1);
    await clean(); // the rows equal a rebuild over the post-purge ledger
  }, 60_000);
});
