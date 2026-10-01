import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem, type PurgeDeps } from '../../src/purge/purge-item.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { dueAt, ev, projectCreated, recordingStore, seedWorkspace, type Base } from './world.js';

/**
 * Cases 22.028–22.029 (prefixes and groups plan Task 2, found by the gate): a
 * project's FORMER prefixes (`proj_project_prefixes`) are entity-bearing
 * (`project_id`, `workspace_id`), so a permanent purge must delete them with the
 * project or the workspace — like `proj_projects`, whose row they qualify. The
 * guard in `table-rules.test.ts` (19.081/19.083) demands the rule; these two
 * prove the rule DELETES, by purging and counting the table's rows.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);
afterAll(async () => {
  await db.drop();
});

function deps(now: Date): PurgeDeps {
  return { projections: buildProjectionRegistry(), store: recordingStore(), now };
}

async function formerRows(where: 'project_id' | 'workspace_id', id: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM proj_project_prefixes WHERE ${where} = $1`,
    [id],
  );
  return rows[0]?.n ?? 0;
}

/** A workspace with two projects, each of which has been re-prefixed once (so each holds one former prefix). */
async function worldWithFormerPrefixes(): Promise<Base & { P: string; Q: string }> {
  const base = await seedWorkspace(db.pool);
  const [P, Q] = [newUlid(), newUlid()];
  await applyCommitted(db.pool, [
    projectCreated(base, P, 'Doomed', 'DM'),
    projectCreated(base, Q, 'Kept', 'KP'),
    ev(base, 'project', P, 'project.updated', { prefix: 'DN' }),
    ev(base, 'project', Q, 'project.updated', { prefix: 'KQ' }),
  ]);
  return { ...base, P, Q };
}

describe('22.028 a project purge deletes the project’s former prefixes', () => {
  it('22.028 — after purging P, no proj_project_prefixes row names P; control: before it had one (DM) and Q’s (KP) is still there', async () => {
    const w = await worldWithFormerPrefixes();
    expect(await formerRows('project_id', w.P), 'control: P held a former prefix before the purge').toBe(1);
    await applyCommitted(db.pool, [ev(w, 'project', w.P, 'project.deleted', {}), ev(w, 'project', w.P, 'purge.marked', {})]);

    const outcome = await purgeItem(db.pool, { kind: 'project', id: w.P }, deps(await dueAt(db.pool, 'project', w.P)));

    expect(outcome.status).toBe('purged');
    expect(await formerRows('project_id', w.P)).toBe(0);
    expect(await formerRows('project_id', w.Q), 'control: the sibling project keeps its former prefix').toBe(1);
  });
});

describe('22.029 a workspace purge deletes every former prefix in it and none elsewhere', () => {
  it('22.029 — after purging W1, no row carries its workspace id; control: W2’s former prefix is untouched', async () => {
    const w1 = await worldWithFormerPrefixes();
    const w2 = await worldWithFormerPrefixes();
    expect(await formerRows('workspace_id', w1.WS), 'control: W1 held two before the purge').toBe(2);
    await applyCommitted(db.pool, [
      ev(w1, 'workspace', w1.WS, 'workspace.deleted', {}),
      ev(w1, 'workspace', w1.WS, 'purge.marked', {}),
    ]);

    const outcome = await purgeItem(db.pool, { kind: 'workspace', id: w1.WS }, deps(await dueAt(db.pool, 'workspace', w1.WS)));

    expect(outcome.status).toBe('purged');
    expect(await formerRows('workspace_id', w1.WS)).toBe(0);
    expect(await formerRows('workspace_id', w2.WS), 'control: the other workspace keeps both').toBe(2);
  });
});
