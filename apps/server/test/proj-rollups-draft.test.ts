import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { rollupsFor } from '../src/visibility/rollup.js';
import { applyCommitted, makeCommitted } from './helpers/apply.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { seedDraftWorld, withDraftsOpened, type DraftWorld } from './helpers/draft-world.js';
import { buildReadTestApp, type ReadWorld } from './helpers/read-app.js';

/**
 * Drafts T3, C1 and C2 (spec §4.2): neither the stored rollup (`proj_rollups`) nor the viewer's rollup and
 * `restrictedCount` (`visibility/rollup.ts`) counts a draft child (28.058, 28.059).
 */

let db: TestDatabase;
let read: ReadWorld;
let world: DraftWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  world = await seedDraftWorld(db.pool, read);
}, 120_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

const ws = (): string => read.world.workspaceId;
const project = (): string => read.world.projectId;
const created = (id: string, actorId: string, payload: Record<string, unknown>) =>
  makeCommitted({
    workspaceId: ws(), actorId, entity: { kind: 'ticket', id }, type: 'ticket.created',
    payload: { typeId: 'task', projectId: project(), parentId: null, ...payload },
  });
const draftOf = { start: 'backlog', draft: true } as const;
const rollupRow = async (parentId: string) =>
  (await db.pool.query('SELECT total_children, open_children FROM proj_rollups WHERE parent_ticket_id = $1', [parentId])).rows[0];

describe('28.058 the stored rollup does not count a draft', () => {
  it('one published and one draft child count 1; publishing the draft makes 2; deleting the only published child removes the row of a parent that still has a draft child; control: a parent whose other child is published keeps its row', async () => {
    const { owner, member } = read.world;
    const [q, x, y] = [newUlid(), newUlid(), newUlid()];
    await applyCommitted(db.pool, [
      created(q, owner, { title: 'Q' }),
      created(x, owner, { parentId: q, title: 'X' }),
      created(y, member, { parentId: q, title: 'Y', ...draftOf }),
    ]);
    expect(await rollupRow(q)).toEqual({ total_children: 1, open_children: 1 });
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: ws(), actorId: member, entity: { kind: 'ticket', id: y }, type: 'ticket.published', payload: { projectId: project() } }),
    ]);
    expect(await rollupRow(q)).toEqual({ total_children: 2, open_children: 2 }); // the new `ticket.published` arm

    const [r, x2, y2] = [newUlid(), newUlid(), newUlid()];
    await applyCommitted(db.pool, [
      created(r, owner, { title: 'R' }),
      created(x2, owner, { parentId: r, title: 'X2' }),
      created(y2, member, { parentId: r, title: 'Y2', ...draftOf }),
    ]);
    expect(await rollupRow(r)).toEqual({ total_children: 1, open_children: 1 });
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: ws(), actorId: owner, entity: { kind: 'ticket', id: x2 }, type: 'ticket.deleted', payload: {} }),
    ]);
    expect(await rollupRow(r)).toBeUndefined(); // not a stale `total_children: 1` for a parent with no counted child

    const [s, x3, z3] = [newUlid(), newUlid(), newUlid()];
    await applyCommitted(db.pool, [
      created(s, owner, { title: 'S' }),
      created(x3, owner, { parentId: s, title: 'X3' }),
      created(z3, owner, { parentId: s, title: 'Z3' }),
      makeCommitted({ workspaceId: ws(), actorId: owner, entity: { kind: 'ticket', id: x3 }, type: 'ticket.deleted', payload: {} }),
    ]);
    expect(await rollupRow(s)).toEqual({ total_children: 1, open_children: 1 });
  });
});

describe('28.059 the viewer rollup and restrictedCount do not count a draft', () => {
  it('every viewer reads { total: 2, restrictedCount: 0 } over the draft world parent; control: cleared, total is 4 and nobody is restricted', async () => {
    for (const role of ['owner', 'admin', 'member', 'outsider'] as const) {
      const closed = (await rollupsFor(db.pool, read.userIds[role], [world.parentId])).get(world.parentId);
      expect(closed, role).toMatchObject({ total: 2, restrictedCount: 0 });
      const opened = await withDraftsOpened(db.pool, world.draftIds, async () =>
        (await rollupsFor(db.pool, read.userIds[role], [world.parentId])).get(world.parentId));
      expect(opened, `${role} opened`).toMatchObject({ total: 4, restrictedCount: 0 });
    }
  });
});
