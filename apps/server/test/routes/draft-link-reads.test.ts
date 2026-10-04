import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { linkWorld } from '../helpers/draft-link-world.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';

let db: TestDatabase;
let read: ReadWorld;
let w: ReturnType<typeof linkWorld>;
beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  w = linkWorld(read, db);
}, 120_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

describe('28.115 projection and rebuild', () => {
  it('keys a from-form row by its source, deletes exactly that row, survives the publish and rebuilds clean; CONTROL: a plain row is keyed by the entity', async () => {
    const [s, s2, d] = [newUlid(), newUlid(), newUlid()];
    await w.published(s);
    await w.published(s2);
    await w.draft(d);
    expect(await w.fromLink(d, s)).toMatchObject({ status: 'committed' });
    expect(await w.fromLink(d, s, 'relates')).toMatchObject({ status: 'committed' });
    expect(await w.send('member', 'ticket.link_added', d, { kind: 'blocks', targetId: s2 })).toMatchObject({ status: 'committed' }); // CONTROL: plain, d is the source

    const member = read.userIds.member;
    expect((await w.linkRows(d)).map((r) => [r.source_id, r.target_id, r.kind, r.created_by])).toEqual([
      [s, d, 'blocks', member], [s, d, 'relates', member], [d, s2, 'blocks', member],
    ]);
    const before = await w.stateOf('member', d);
    expect(before.ticketState.links).toEqual([
      { kind: 'blocks', targetId: d, from: s }, { kind: 'relates', targetId: d, from: s }, { kind: 'blocks', targetId: s2 },
    ]);

    expect(await w.send('member', 'ticket.link_removed', d, { kind: 'relates', targetId: d, from: s })).toMatchObject({ status: 'committed' });
    expect((await w.linkRows(d)).map((r) => [r.source_id, r.target_id, r.kind])).toEqual([[s, d, 'blocks'], [d, s2, 'blocks']]);

    const seqBefore = (await w.linkRows(d)).map((r) => r.seq);
    expect(await w.send('member', 'ticket.published', d, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' });
    // the row survives, with its first provenance; the re-file's plain event inserted nothing new
    expect((await w.linkRows(d)).map((r) => [r.source_id, r.target_id, r.kind, r.seq])).toEqual([
      [s, d, 'blocks', seqBefore[0]], [d, s2, 'blocks', seqBefore[1]],
    ]);
    const after = await w.stateOf('member', d);
    expect(after.ticketState.links).toEqual([{ kind: 'blocks', targetId: s2 }]); // no `from` entry survives
    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report).toEqual({ clean: true, diffs: [] });
  });
});
