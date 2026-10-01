import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { insertEvent } from '../../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { projProjects } from '../../src/projections/proj-projects.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';

/**
 * Cases 13.1616–13.1617. `proj_projects.founding_name` — the name a project was
 * FOUNDED under, which its derived key is computed from for life.
 *
 * `project.updated` rewrites `name`; it must never touch `founding_name`
 * (13.1613–13.1615 pin what that buys the read). This file pins the column
 * itself: the migration that adds and backfills it, and the projection that
 * keeps it reproducible from the ledger.
 */

const MIGRATION = new URL('../../migrations/1791000000000_proj-projects-founding-name.sql', import.meta.url);

/** The `-- Up Migration` and `-- Down Migration` halves, as node-pg-migrate splits them. */
function halves(): { up: string; down: string } {
  const text = readFileSync(fileURLToPath(MIGRATION), 'utf8');
  const [upPart, downPart] = text.split('-- Down Migration');
  return { up: upPart!.replace('-- Up Migration', ''), down: downPart! };
}

let db: TestDatabase;
const WS = newUlid();

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function created(projectId: string, name: string) {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'project', id: projectId },
    type: 'project.created',
    payload: { name },
    actorId: newUlid(),
  });
}

function updated(projectId: string, name: string) {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'project', id: projectId },
    type: 'project.updated',
    payload: { name },
    actorId: newUlid(),
  });
}

async function ledgerAndLive(events: Array<ReturnType<typeof created>>): Promise<void> {
  const client = await db.pool.connect();
  try {
    for (const event of events) {
      await insertEvent(client, event);
      await projProjects.apply(event, client);
    }
  } finally {
    client.release();
  }
}

describe('13.1616 the migration backfills founding_name from each project’s project.created', () => {
  it('a row founded as Alpha and renamed to Beta gets founding_name = Alpha, and the column ends NOT NULL', async () => {
    const { up, down } = halves();
    const renamed = newUlid();
    const untouched = newUlid();
    const other = newUlid();
    // The ledger holds what production's holds: the founding claim, then a rename.
    const client = await db.pool.connect();
    try {
      for (const event of [
        created(renamed, 'Alpha'),
        updated(renamed, 'Beta'),
        created(untouched, 'Gamma'),
        created(other, 'Delta'),
      ]) {
        await insertEvent(client, event);
      }
    } finally {
      client.release();
    }

    // Put the table back where production stands BEFORE this migration (the
    // Down half is itself under test: it must drop the column cleanly), then
    // plant the rows exactly as the pre-migration projection wrote them — the
    // RENAMED value in `name`, because that is all the old projection kept.
    await db.pool.query(down);
    await db.pool.query(
      `INSERT INTO proj_projects (project_id, workspace_id, name, created_by, created_at)
       VALUES ($1, $4, 'Beta',  'seed', now()),
              ($2, $4, 'Gamma', 'seed', now()),
              ($3, $4, 'Delta', 'seed', now())`,
      [renamed, untouched, other, WS],
    );
    await db.pool.query(up);

    const { rows } = await db.pool.query<{ project_id: string; name: string; founding_name: string }>(
      'SELECT project_id, name, founding_name FROM proj_projects WHERE project_id = ANY($1) ORDER BY name',
      [[renamed, untouched, other]],
    );
    // CONTROL, same `it`: the rows that were never renamed backfill to their
    // own name — so the Alpha answer below is the backfill reading the EVENT,
    // not a column copy of `name` that happens to look right for them.
    expect(rows.map((r) => [r.name, r.founding_name])).toEqual([
      ['Beta', 'Alpha'],
      ['Delta', 'Delta'],
      ['Gamma', 'Gamma'],
    ]);

    // NOT NULL: a founding without a name is not a state the table may hold.
    const { rows: nullable } = await db.pool.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'proj_projects' AND column_name = 'founding_name'`,
    );
    expect(nullable).toEqual([{ is_nullable: 'NO' }]);
  });
});

describe('13.1618 the backfill takes the FIRST project.created by seq', () => {
  it('a project with two founding claims backfills to the LOWER-seq name, and a rebuild agrees', async () => {
    const { up, down } = halves();
    const twice = newUlid();
    const once = newUlid();
    // Nothing at the door refuses a second `project.created` (fresh event id)
    // for an already-founded project, so a ledger can hold two. The projection
    // is first-writer-wins (`ON CONFLICT DO NOTHING`) and a rebuild replays by
    // seq: the backfill must pick the same claim or `verify-projections` drifts.
    const first = created(twice, 'Alpha');
    const second = created(twice, 'Gamma');
    expect(first.seq).toBeLessThan(second.seq);
    const client = await db.pool.connect();
    try {
      for (const event of [first, second, updated(twice, 'Beta'), created(once, 'Delta')]) {
        await insertEvent(client, event);
      }
    } finally {
      client.release();
    }

    // The pre-migration row exactly as the projection wrote it: the first
    // claim's name, then renamed.
    await db.pool.query(down);
    await db.pool.query(
      `INSERT INTO proj_projects (project_id, workspace_id, name, created_by, created_at)
       VALUES ($1, $3, 'Beta',  'seed', now()),
              ($2, $3, 'Delta', 'seed', now())`,
      [twice, once, WS],
    );
    await db.pool.query(up);

    const { rows } = await db.pool.query<{ project_id: string; founding_name: string }>(
      'SELECT project_id, founding_name FROM proj_projects WHERE project_id = ANY($1)',
      [[twice, once]],
    );
    const byId = new Map(rows.map((r) => [r.project_id, r.founding_name]));
    // CONTROL, same `it`: a project with ONE claim backfills to that claim's
    // name, so the Alpha answer is the ORDER being read, not a lucky pick.
    expect(byId.get(once)).toBe('Delta');
    expect(byId.get(twice)).toBe('Alpha');

    // Bonus: the rebuild (first writer wins) lands on the same value, and the
    // verifier finds the backfilled live table equal to it.
    const projections = buildProjectionRegistry();
    for (const projection of projections.all()) {
      await rebuildProjection(projection.name, { pool: db.pool, projections });
    }
    const rebuilt = await db.pool.query(
      'SELECT founding_name FROM proj_projects WHERE project_id = $1',
      [twice],
    );
    expect(rebuilt.rows).toEqual([{ founding_name: 'Alpha' }]);
    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({ clean: true, diffs: [] });
  });
});

describe('13.1617 verify-projections stays green after a rename, and founding_name is reproducible', () => {
  it('created → updated rebuilds to the same table, with founding_name still the founding name', async () => {
    const projectId = newUlid();
    await ledgerAndLive([created(projectId, 'One'), updated(projectId, 'Two')]);

    const projections = buildProjectionRegistry();
    for (const projection of projections.all()) {
      await rebuildProjection(projection.name, { pool: db.pool, projections });
    }
    const { rows } = await db.pool.query(
      'SELECT name, founding_name FROM proj_projects WHERE project_id = $1',
      [projectId],
    );
    // The rebuild replays created THEN updated: the name folds forward, the
    // founding name does not. Both in one assertion so neither can be skipped.
    expect(rows).toEqual([{ name: 'Two', founding_name: 'One' }]);
    // CONTROL: the verifier reports no drift between live and a fresh shadow.
    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({ clean: true, diffs: [] });

    // And the verifier can SEE the column: a founding_name rewritten behind the
    // ledger is reported, so "clean" above means the column was compared.
    await db.pool.query(`UPDATE proj_projects SET founding_name = 'Two' WHERE project_id = $1`, [projectId]);
    const report = await verifyProjections({ pool: db.pool, projections });
    expect(report.clean).toBe(false);
    expect(report.diffs.map((diff) => diff.table)).toEqual(['proj_projects']);
  });
});

describe('13.1619 the migration does not fail a deploy on a row no project.created made', () => {
  it('a proj_projects row with NO ledger event completes the migration and takes its own name', async () => {
    const { up, down } = halves();
    const orphan = newUlid();
    const normal = newUlid();
    const client = await db.pool.connect();
    try {
      await insertEvent(client, created(normal, 'Alpha'));
    } finally {
      client.release();
    }

    await db.pool.query(down);
    await db.pool.query(
      `INSERT INTO proj_projects (project_id, workspace_id, name, created_by, created_at)
       VALUES ($1, $3, 'Renamed', 'seed', now()),
              ($2, $3, 'Orphan',  'seed', now())`,
      [normal, orphan, WS],
    );
    // Without the fallback line, `SET NOT NULL` throws here and the deploy dies.
    await expect(db.pool.query(up)).resolves.toBeDefined();

    const { rows } = await db.pool.query<{ project_id: string; name: string; founding_name: string }>(
      'SELECT project_id, name, founding_name FROM proj_projects WHERE project_id = ANY($1)',
      [[normal, orphan]],
    );
    const byId = new Map(rows.map((r) => [r.project_id, r]));
    // CONTROL, same `it`: the row WITH an event still backfills from the event
    // (not from its renamed `name`), so the fallback is confined to the orphan.
    expect(byId.get(normal)).toMatchObject({ name: 'Renamed', founding_name: 'Alpha' });
    expect(byId.get(orphan)).toMatchObject({ name: 'Orphan', founding_name: 'Orphan' });

    // Not a state a rebuild reproduces — leave none behind for the verifier.
    await db.pool.query('DELETE FROM proj_projects WHERE project_id = $1', [orphan]);
  });
});
