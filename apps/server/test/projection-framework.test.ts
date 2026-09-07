import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { insertEvent } from '../src/ledger/event-store.js';
import { createProjectionRegistry, type Projection } from '../src/projections/registry.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { committed, submittedWorkspaceCreated } from './helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function recordingProjection(name: string): {
  projection: Projection;
  applied: string[];
  resets: () => number;
} {
  const applied: string[] = [];
  let resets = 0;
  const projection: Projection = {
    name,
    tables: [],
    async apply(event) {
      applied.push(`${event.entity.kind}:${event.entity.id}:${event.seq}`);
    },
    async reset() {
      resets += 1;
      applied.length = 0;
    },
  };
  return { projection, applied, resets: () => resets };
}

describe('projection registry', () => {
  it('registers, retrieves by name, and lists all', () => {
    const registry = createProjectionRegistry();
    const { projection } = recordingProjection('proj_a');
    registry.register(projection);
    expect(registry.get('proj_a')).toBe(projection);
    expect(registry.all()).toEqual([projection]);
  });

  it('planted defect: refuses a duplicate projection name', () => {
    const registry = createProjectionRegistry();
    registry.register(recordingProjection('proj_a').projection);
    expect(() => registry.register(recordingProjection('proj_a').projection)).toThrowError(
      'projection already registered: proj_a',
    );
  });
});

/**
 * 3.18 — cited on the block: `rebuildProjection` resets ONCE then applies the whole ledger in canonical order rather than arrival order, and an unknown projection name is refused.
 */
describe('rebuildProjection', () => {
  it('planted defect: refuses an unknown projection name', async () => {
    const registry = createProjectionRegistry();
    await expect(rebuildProjection('proj_nope', { pool: db.pool, projections: registry })).rejects.toThrowError(
      'unknown projection: proj_nope',
    );
  });

  it('resets once, then applies the whole ledger in canonical order — not arrival order', async () => {
    // Two workspaces; arrival order deliberately interleaves and inverts entity grouping.
    const a = submittedWorkspaceCreated();
    const b = submittedWorkspaceCreated();
    const [first, second] =
      a.entity.id < b.entity.id ? [a, b] : [b, a]; // 'first' sorts before 'second'
    const client = await db.pool.connect();
    try {
      await insertEvent(client, committed(second, 1));
      await insertEvent(client, committed(first, 1));
      await insertEvent(
        client,
        committed({ ...second, id: newUlid(), type: 'workspace.renamed', payload: { name: 'B2' } }, 2),
      );
      await insertEvent(
        client,
        committed({ ...first, id: newUlid(), type: 'workspace.renamed', payload: { name: 'A2' } }, 2),
      );
    } finally {
      client.release();
    }

    const registry = createProjectionRegistry();
    const { projection, applied, resets } = recordingProjection('proj_recording');
    registry.register(projection);

    await rebuildProjection('proj_recording', { pool: db.pool, projections: registry });

    expect(resets()).toBe(1);
    expect(applied).toEqual([
      `workspace:${first.entity.id}:1`,
      `workspace:${first.entity.id}:2`,
      `workspace:${second.entity.id}:1`,
      `workspace:${second.entity.id}:2`,
    ]);
  });
});
