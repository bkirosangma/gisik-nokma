import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { insertEvent } from '../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import { getWorkflowDefFromProjection, workflowsProjection } from '../src/projections/workflows.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

const WORKSPACE = newUlid();
const WORKFLOW = newUlid();
const GHOST_WORKFLOW = newUlid();
const ACTOR = newUlid();

const basicStates = [
  { id: 'todo', name: 'To do', category: 'open' },
  { id: 'doing', name: 'Doing', category: 'active' },
  { id: 'done', name: 'Done', category: 'terminal' },
];
const basicTransitions = [
  { from: 'todo', to: 'doing', rules: [] },
  { from: 'doing', to: 'done', rules: [] },
  { from: 'done', to: 'doing', rules: [] },
];

/**
 * `seq` is the per-entity counter; `workspaceSeq` is the workspace stream
 * position (coordination §18) and is what the projection records as the
 * publish position. They are given different values deliberately: the two
 * counters coincide only when the entity IS the workspace, and a test that
 * let them coincide here would pass even if the code stored the wrong one.
 */
function workflowDefined(
  version: number,
  name: string,
  seq: number,
  workspaceSeq: number,
): LedgerEvent {
  return {
    id: newUlid(),
    workspaceId: WORKSPACE,
    entity: { kind: 'workflow', id: WORKFLOW },
    type: 'workflow.defined',
    version: 1,
    payload: {
      id: WORKFLOW,
      version,
      name,
      initialStateId: 'todo',
      states: basicStates,
      transitions: basicTransitions,
    },
    actorId: ACTOR,
    origin: 'server',
    clientTime: '2026-08-20T00:00:00.000Z',
    serverTime: '2026-08-20T00:00:00.000Z',
    seq,
    workspaceSeq,
  };
}

/** Two publishes of one workflow, at deliberately non-adjacent stream positions. */
const V1 = workflowDefined(1, 'Basic', 1, 10);
const V2 = workflowDefined(2, 'Basic v2', 2, 40);

async function withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

/**
 * 4.30 — cited on the block: `proj_workflows` serves the latest version by default and historical versions on request, ignores foreign events, and replay and reset-then-reapply are both idempotent. Each clause is its own test here.
 */
describe('proj_workflows', () => {
  beforeEach(async () => {
    await withClient((client) => workflowsProjection.reset(client));
  });

  it('serves the latest version by default and historical versions on request', async () => {
    await withClient(async (client) => {
      await workflowsProjection.apply(V1, client);
      await workflowsProjection.apply(V2, client);
    });
    expect((await getWorkflowDefFromProjection(db.pool, WORKSPACE, WORKFLOW))?.version).toBe(2);
    expect((await getWorkflowDefFromProjection(db.pool, WORKSPACE, WORKFLOW, 1))?.name).toBe('Basic');
    expect(await getWorkflowDefFromProjection(db.pool, WORKSPACE, GHOST_WORKFLOW)).toBeNull();
  });

  it('stores the full payload, stateMapping included — the version walk needs the intermediates', async () => {
    const dropping: LedgerEvent = {
      ...workflowDefined(2, 'Basic v2', 2, 40),
      payload: {
        id: WORKFLOW,
        version: 2,
        name: 'Basic v2',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [{ from: 'todo', to: 'done', rules: [] }],
        stateMapping: { doing: 'todo' },
      },
    };
    await withClient(async (client) => {
      await workflowsProjection.apply(V1, client);
      await workflowsProjection.apply(dropping, client);
    });
    const stored = await getWorkflowDefFromProjection(db.pool, WORKSPACE, WORKFLOW);
    expect(stored?.stateMapping).toEqual({ doing: 'todo' });
  });

  /**
   * 4.39 — `getWorkflowDefFromProjection` answers AS OF a ledger position: the version in force at that `workspace_seq`, not the newest one.
   */
  it('answers as of a ledger position — the version in force there, not the newest', async () => {
    await withClient(async (client) => {
      await workflowsProjection.apply(V1, client);
      await workflowsProjection.apply(V2, client);
    });
    // Position 25 sits between the two publishes: v1 was in force there. A
    // projection replaying an event stamped 25 must see v1, however many
    // versions the table has grown by the time the replay runs — this is the
    // whole reason the column exists.
    expect(
      (await getWorkflowDefFromProjection(db.pool, WORKSPACE, WORKFLOW, { asOfWorkspaceSeq: 25 }))?.version,
    ).toBe(1);
    // On the publish position itself the new version is already in force: the
    // definition and the event that carries it are one and the same fact.
    expect(
      (await getWorkflowDefFromProjection(db.pool, WORKSPACE, WORKFLOW, { asOfWorkspaceSeq: 40 }))?.version,
    ).toBe(2);
    expect(
      (await getWorkflowDefFromProjection(db.pool, WORKSPACE, WORKFLOW, { asOfWorkspaceSeq: 999 }))?.version,
    ).toBe(2);
    // Before the workflow existed there is no honest answer but "none".
    expect(
      await getWorkflowDefFromProjection(db.pool, WORKSPACE, WORKFLOW, { asOfWorkspaceSeq: 9 }),
    ).toBeNull();
  });

  it('records the publish position off the event, not the per-entity counter', async () => {
    await withClient(async (client) => {
      await workflowsProjection.apply(V1, client);
      await workflowsProjection.apply(V2, client);
    });
    const stored = await db.pool.query<{ version: number; published_workspace_seq: number }>(
      'SELECT version, published_workspace_seq FROM proj_workflows WHERE workflow_id = $1 ORDER BY version',
      [WORKFLOW],
    );
    // The seqs were 1 and 2; storing those instead of 10 and 40 is the
    // transposition this test exists to catch.
    expect(stored.rows).toEqual([
      { version: 1, published_workspace_seq: 10 },
      { version: 2, published_workspace_seq: 40 },
    ]);
  });

  it('ignores events that are not workflow.defined', async () => {
    const other: LedgerEvent = {
      ...V1,
      type: 'workspace.renamed',
      entity: { kind: 'workspace', id: WORKSPACE },
      payload: { name: 'CC HQ' },
    };
    await withClient((client) => workflowsProjection.apply(other, client));
    expect(await getWorkflowDefFromProjection(db.pool, WORKSPACE, WORKFLOW)).toBeNull();
  });

  it('replaying the same event is a no-op — rebuilds are deterministic', async () => {
    await withClient(async (client) => {
      await workflowsProjection.apply(V1, client);
      await workflowsProjection.apply(V1, client);
    });
    const { rows } = await db.pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM proj_workflows',
    );
    expect(rows[0]?.count).toBe(1);
  });

  it('reset then re-apply reproduces identical rows', async () => {
    await withClient(async (client) => {
      await workflowsProjection.apply(V1, client);
      await workflowsProjection.apply(V2, client);
    });
    const before = (
      await db.pool.query('SELECT * FROM proj_workflows ORDER BY workflow_id, version')
    ).rows;
    await withClient(async (client) => {
      await workflowsProjection.reset(client);
      await workflowsProjection.apply(V1, client);
      await workflowsProjection.apply(V2, client);
    });
    const after = (
      await db.pool.query('SELECT * FROM proj_workflows ORDER BY workflow_id, version')
    ).rows;
    expect(after).toEqual(before);
  });
});

describe('proj_workflows rebuilt from the ledger', () => {
  it('the registry knows it by name, and a rebuild derives every version from the raw events', async () => {
    // Not the same claim as reset-then-re-apply above: this one goes through
    // buildProjectionRegistry and readLedger, so it fails if the projection was
    // never registered, if its name is misspelled, or if its migration never
    // ran — none of which the direct-apply tests can see.
    await withClient(async (client) => {
      await insertEvent(client, V1);
      await insertEvent(client, V2);
    });
    await rebuildProjection('proj_workflows', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });
    const rows = await db.pool.query<{
      workspace_id: string;
      workflow_id: string;
      version: number;
      name: string;
      defined_by: string;
      published_workspace_seq: number;
    }>(
      `SELECT workspace_id, workflow_id, version, name, defined_by, published_workspace_seq
         FROM proj_workflows ORDER BY workflow_id, version`,
    );
    expect(rows.rows).toEqual([
      {
        workspace_id: WORKSPACE,
        workflow_id: WORKFLOW,
        version: 1,
        name: 'Basic',
        defined_by: ACTOR,
        published_workspace_seq: 10,
      },
      {
        workspace_id: WORKSPACE,
        workflow_id: WORKFLOW,
        version: 2,
        name: 'Basic v2',
        defined_by: ACTOR,
        published_workspace_seq: 40,
      },
    ]);
  });
});
