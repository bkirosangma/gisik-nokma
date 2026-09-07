import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LedgerEvent, SubmittedEvent } from '@gisik-nokma/domain';
import { insertEvent } from '../../src/ledger/event-store.js';
import { readStreamSeq } from '../../src/sync/stream-seq.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { committed, submittedWorkflowDefined, submittedWorkspaceCreated } from '../helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/**
 * A workspace.created whose entity IS the workspace it names — the shape ingest
 * produces. `submittedWorkspaceCreated` invents a fresh workspace per call, so
 * overriding `workspaceId` alone would leave the entity pointing at a different
 * workspace and quietly weaken every fixture below.
 *
 * Workspace ids here are readable rather than ULIDs on purpose: `workspace_id`
 * is `text` with no format constraint, each test file gets its own database,
 * and the whole point of these tests is WHICH workspace a row belongs to.
 */
function workspaceCreated(workspaceId: string): SubmittedEvent {
  return submittedWorkspaceCreated({ workspaceId, entity: { kind: 'workspace', id: workspaceId } });
}

async function seed(events: readonly LedgerEvent[]): Promise<void> {
  const client = await db.pool.connect();
  try {
    for (const event of events) {
      await insertEvent(client, event);
    }
  } finally {
    client.release();
  }
}

/**
 * 12.15 — readStreamSeq is 0 (not null/NaN) for an empty workspace, is workspace-scoped against a busier neighbour, and reads the workspace_seq high-water mark even when both entities' own per-entity seq is 1 (the third it(), line 79).
 */
describe('readStreamSeq', () => {
  it('is 0 — not null, not NaN — for a workspace with no events', async () => {
    const streamSeq = await readStreamSeq(db.pool, 'ws-empty');

    // `toBe` is Object.is, so this one assertion already rejects both null and
    // NaN. The other two name what is being rejected, because both have a
    // plausible way in: dropping COALESCE returns SQL NULL (node-postgres hands
    // NULL through untouched, so it arrives as `null`), and wrapping the result
    // in `Number()` would launder that NULL straight back into a convincing 0.
    expect(streamSeq).toBe(0);
    expect(streamSeq).not.toBeNull();
    expect(Number.isNaN(streamSeq)).toBe(false);
  });

  it("is scoped to ONE workspace: a busier neighbour never raises a quiet workspace's cursor", async () => {
    const quiet = 'ws-quiet';
    const busy = 'ws-busy';

    // Deliberately DIFFERENT event counts. With one event each, an unscoped
    // `max(workspace_seq)` returns 1 for both and this test passes on a global
    // cursor — the exact bug it exists to catch. 1 vs 3 is what makes the
    // missing `WHERE workspace_id = $1` fail on a wrong value, not a crash.
    await seed([
      committed(workspaceCreated(quiet), 1),
      committed(workspaceCreated(busy), 1),
      committed(submittedWorkflowDefined(busy), 1, undefined, 2),
      // Deliberately 5, not 3: the cursor is a HIGH-WATER MARK, not a row count.
      // With densely-assigned seqs (1,2,3) count() and max() agree everywhere and
      // a count() implementation survives every mutation. A gap makes them differ.
      committed(submittedWorkflowDefined(busy), 1, undefined, 5),
    ]);

    expect(await readStreamSeq(db.pool, quiet)).toBe(1);
    expect(await readStreamSeq(db.pool, busy)).toBe(5);
  });

  it('reads workspace_seq, not the per-entity seq the two only sometimes agree on', async () => {
    const workspaceId = 'ws-two-entities';

    await seed([
      committed(workspaceCreated(workspaceId), 1), // workspace entity: seq 1, workspace_seq 1
      committed(submittedWorkflowDefined(workspaceId), 1, undefined, 2), // a DIFFERENT entity: seq 1 again, workspace_seq 2
    ]);

    // max(seq) across this workspace is 1 — both entities sit at their own
    // first event. Only max(workspace_seq) is 2. This is coordination §18 in
    // one assertion: a client told "you are caught up at 1" by a seq-based
    // cursor would never fetch the workflow, and never learn it had missed it.
    const streamSeq = await readStreamSeq(db.pool, workspaceId);
    expect(streamSeq).toBe(2);

    // int8 arrives as a string from node-postgres unless src/db.ts's global
    // OID-20 parser is installed and the pool is built through createPool.
    // A string '2' would fail toBe(2) above, but say so plainly here too.
    expect(typeof streamSeq).toBe('number');
  });

  it('reads through a PoolClient as well as a Pool, so an in-transaction caller needs no new signature', async () => {
    const workspaceId = 'ws-in-transaction';
    await seed([committed(workspaceCreated(workspaceId), 1)]);

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await insertEvent(client, committed(submittedWorkflowDefined(workspaceId), 1, undefined, 2));
      // The same client sees its own uncommitted append: the read is
      // transaction-local, which is what lets a future ingest-side caller ask
      // for the cursor it has just advanced.
      expect(await readStreamSeq(client, workspaceId)).toBe(2);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    // And the pool, outside that transaction, only ever saw the committed row.
    expect(await readStreamSeq(db.pool, workspaceId)).toBe(1);
  });
});
