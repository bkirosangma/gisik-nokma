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
  it('keys a from-form row by its source, deletes exactly that row, survives the publish under the re-file and rebuilds clean; CONTROL: a plain row is keyed by the entity', async () => {
    const [s, s2, d] = [newUlid(), newUlid(), newUlid()].sort(); // s < d: the removal leg below needs S's stream replayed first
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

    const plainSeq = (await w.linkRows(d)).find((r) => r.source_id === d)?.seq;
    expect(await w.send('member', 'ticket.published', d, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' });
    // the row survives and the re-file on S's stream takes it over: its seq and actor, one row per key
    const [refile] = await w.linkEventsOn(s);
    expect(refile?.payload).toEqual({ kind: 'blocks', targetId: d });
    expect((await w.linkRows(d)).map((r) => [r.source_id, r.target_id, r.kind, r.seq, r.created_by])).toEqual([
      [d, s2, 'blocks', plainSeq, member], [s, d, 'blocks', refile?.seq, member],
    ]);
    const after = await w.stateOf('member', d);
    expect(after.ticketState.links).toEqual([{ kind: 'blocks', targetId: s2 }]); // no `from` entry survives
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });

    // Removed after the publish: the rebuild replays stream by stream (`readLedger`), S's first here, so D's from-form
    // add comes AFTER S's removal and must not bring the row back. Precondition pinned, or the leg passes either way.
    const order = await db.pool.query<{ entity_id: string }>(
      'SELECT DISTINCT entity_kind, entity_id FROM events WHERE entity_id = ANY($1) ORDER BY entity_kind, entity_id',
      [[s, d]],
    );
    expect(order.rows.map((r) => r.entity_id)).toEqual([s, d]);
    expect(await w.send('owner', 'ticket.link_removed', s, { kind: 'blocks', targetId: d })).toMatchObject({ status: 'committed' });
    expect((await w.linkRows(d)).map((r) => [r.source_id, r.target_id, r.kind])).toEqual([[d, s2, 'blocks']]);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});
