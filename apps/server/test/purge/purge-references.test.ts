import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, PURGED_ITEM_LABEL } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem, type PurgeDeps } from '../../src/purge/purge-item.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scan } from './scan.js';
import { buildReferenceWorld, doc, dueAt, ev, noteCreated, recordingStore, text, ticketRef } from './world.js';

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
    await applyCommitted(db.pool, [
      ev(w, 'ticket', w.T, 'ticket.field_set', { fieldId: 'description', value: doc(ticketRef(X, w.P, 'PG-7', 'X')) }),
      ev(w, 'ticket', w.T, 'comment.added', { body: doc(ticketRef(X, w.P, 'PG-7', 'X')) }),
    ]);
    expect((await refRows(`source_parent_id = $1`, [w.T])).length).toBe(2);
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(await refRows(`source_parent_id = $1`, [w.T])).toEqual([]);
    expect((await refRows(`source_parent_id = $1`, [w.N1])).length).toBe(0); // N1 chipped only T
    await clean();
  });
});

describe('27.115 a body written AFTER the purge that still chips the purged id', () => {
  it('27.115 writes no row for it, keeps the ordinal of the next reference, and a rebuild agrees', async () => {
    const w = await buildReferenceWorld(db.pool);
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    const LATE = newUlid();
    const Y = newUlid();
    await applyCommitted(db.pool, [
      noteCreated(w, LATE, { title: 'Late', homeProjectId: '', scope: { mode: 'workspace' }, body: doc(ticketRef(w.T, w.P, 'PG-1', 'stale'), text(' then '), ticketRef(Y, w.P, 'PG-3', 'Y')) }),
    ]);
    const rows = (await db.pool.query<{ target_id: string; ordinal: number }>('SELECT target_id, ordinal FROM proj_references WHERE source_id = $1', [LATE])).rows;
    expect(rows).toEqual([{ target_id: Y, ordinal: 1 }]);
    await clean();
  });
});

describe('27.116 a workspace purge empties the workspace’s rows', () => {
  it('27.116 every row of the purged workspace goes; another workspace’s rows stay (control)', async () => {
    const keep = await buildReferenceWorld(db.pool);
    const gone = await buildReferenceWorld(db.pool);
    await purgeItem(db.pool, { kind: 'workspace', id: gone.WS }, deps(await dueAt(db.pool, 'workspace', gone.WS)));
    expect(await refRows('workspace_id = $1', [gone.WS])).toEqual([]);
    expect((await refRows('workspace_id = $1', [keep.WS])).length).toBeGreaterThan(0);
  });
});
