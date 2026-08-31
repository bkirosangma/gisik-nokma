import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { insertEvent } from '../../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { projectExists, projProjects } from '../../src/projections/proj-projects.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';

/**
 * Plan 4 Task 9 Step 3b. `proj_projects` exists to answer one question —
 * was this project ever founded — for `checkProjectExists`.
 *
 * The ledger is NOT emptied between tests: `events` is append-only and its
 * trigger refuses a TRUNCATE. Every project id here is a fresh ULID, so the
 * rebuild case below replays earlier tests' events harmlessly and the scoped
 * assertions stay disjoint.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('TRUNCATE proj_projects');
});

const WS = newUlid();

function projectCreated(projectId: string, workspaceId = WS, name = 'First project') {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.created',
    payload: { name },
    actorId: newUlid(),
  });
}

async function apply(...events: ReturnType<typeof projectCreated>[]): Promise<void> {
  const client = await db.pool.connect();
  try {
    for (const event of events) {
      await projProjects.apply(event, client);
    }
  } finally {
    client.release();
  }
}

async function rowsFor(projectId: string) {
  const { rows } = await db.pool.query(
    'SELECT project_id, workspace_id, name, created_by, created_at FROM proj_projects WHERE project_id = $1',
    [projectId],
  );
  return rows;
}

describe('projProjects — what a founding records', () => {
  it('a project.created lands one row scoped to its workspace, carrying its creator and the RECEIVED instant', async () => {
    // Mutation: write `event.workspaceId` into created_by, or `new Date()` into
    // created_at — each reddens naming its own field. The clock one matters
    // beyond tidiness: a projection that read a clock would rebuild differently
    // on every run and the verifier below would report permanent drift.
    const projectId = newUlid();
    const event = projectCreated(projectId, WS, 'Kitchen refit');
    await apply(event);

    const rows = await rowsFor(projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      project_id: projectId,
      workspace_id: WS,
      name: 'Kitchen refit',
      created_by: event.actorId,
    });
    expect(rows[0].created_at).toEqual(new Date(event.serverTime));
  });

  it('a re-delivered duplicate does not double-insert, and does not overwrite the first claim', async () => {
    // Two assertions, because ON CONFLICT DO UPDATE would also keep the count
    // at one while silently letting a replayed event rewrite the row. Under
    // canonical replay order the second delivery can be an OLDER event, so
    // last-writer-wins here is a rebuild that disagrees with live.
    const projectId = newUlid();
    const first = projectCreated(projectId, WS, 'Founded once');
    await apply(first, first, projectCreated(projectId, WS, 'A later, different claim'));

    const rows = await rowsFor(projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Founded once', created_by: first.actorId });
  });

  it('an event type it does not read leaves the table empty', async () => {
    // Mutation: drop the `event.type !== 'project.created'` guard and a roster
    // event founds a project.
    const projectId = newUlid();
    const client = await db.pool.connect();
    try {
      await projProjects.apply(
        testEnvelope({
          workspaceId: WS,
          entity: { kind: 'project', id: projectId },
          type: 'project.member_added',
          payload: { userId: newUlid(), projectAdmin: false },
          actorId: newUlid(),
        }),
        client,
      );
    } finally {
      client.release();
    }
    expect(await rowsFor(projectId)).toHaveLength(0);
  });

  it('reset empties the table it declares', async () => {
    const projectId = newUlid();
    await apply(projectCreated(projectId));
    expect(await rowsFor(projectId)).toHaveLength(1);

    const client = await db.pool.connect();
    try {
      await projProjects.reset(client);
    } finally {
      client.release();
    }
    expect(await rowsFor(projectId)).toHaveLength(0);
  });
});

describe('projectExists — scoped by workspace, deliberately', () => {
  it('answers false for a REAL project id asked under a different workspace', async () => {
    // The planted defect is the unscoped lookup: `WHERE project_id = $1` alone
    // passes the true case below and turns this table into an oracle — anyone
    // holding one workspace could confirm the existence of a project in
    // another. Both directions are asserted, so "always false" cannot pass.
    const projectId = newUlid();
    const otherWorkspace = newUlid();
    await apply(projectCreated(projectId, WS));

    expect(await projectExists(db.pool, WS, projectId)).toBe(true);
    expect(await projectExists(db.pool, otherWorkspace, projectId)).toBe(false);
  });

  it('answers false for a project id nobody founded', async () => {
    expect(await projectExists(db.pool, WS, newUlid())).toBe(false);
  });
});

/**
 * The projection contract's shadow-schema fence, on this table.
 *
 * "Verify is clean" would catch neither way of falling off it: with no shadow
 * copy the verifier skips the diff, and a rebuild into live agrees with itself.
 * So what is asserted is that a PLANTED live corruption is REPORTED — which
 * only happens if `tables: ['proj_projects']` is declared and a shadow copy
 * therefore exists to disagree with it.
 */
describe('proj_projects under verify-projections', () => {
  it('a corrupted live row is reported against the ledger rebuild, and live is left alone', async () => {
    const projectId = newUlid();
    const event = projectCreated(projectId, WS, 'Honest name');

    const client = await db.pool.connect();
    try {
      await insertEvent(client, event);
    } finally {
      client.release();
    }

    const projections = buildProjectionRegistry();
    for (const projection of projections.all()) {
      await rebuildProjection(projection.name, { pool: db.pool, projections });
    }
    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({ clean: true, diffs: [] });

    await db.pool.query('UPDATE proj_projects SET name = $1 WHERE project_id = $2', [
      'renamed behind the ledger',
      projectId,
    ]);

    const report = await verifyProjections({ pool: db.pool, projections });
    expect(report.clean).toBe(false);
    expect(report.diffs.map((diff) => diff.table)).toEqual(['proj_projects']);
    expect(report.diffs[0]).toMatchObject({ missingFromLive: 1, extraInLive: 1 });

    // The verify wrote nothing live: the planted corruption survives, which it
    // would not if the rebuild had escaped the shadow schema into public.
    expect((await rowsFor(projectId))[0]).toMatchObject({ name: 'renamed behind the ledger' });
  });
});
