import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scan } from './scan.js';
import { doc, dueAt, ev, newMarker, projectCreated, recordingStore, seedWorkspace, text, ticketCreated } from './world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);
afterAll(async () => {
  await db.drop();
});

describe("26.059 purge takes a comment's edits and deletion with its ticket", () => {
  it('26.059 no edited text survives; the sibling is whole', async () => {
    const base = await seedWorkspace(db.pool);
    const marker = newMarker();
    const P = newUlid();
    const T = newUlid();
    const S = newUlid();
    const addedT = ev(base, 'ticket', T, 'comment.added', { body: doc(text('first')) });
    const addedS = ev(base, 'ticket', S, 'comment.added', { body: doc(text('sibling first')) });
    await applyCommitted(db.pool, [
      projectCreated(base, P, 'Edits', 'ED'),
      ticketCreated(base, T, P, 'Purged'),
      ticketCreated(base, S, P, 'Sibling'),
      addedT,
      ev(base, 'ticket', T, 'comment.edited', { commentId: addedT.id, body: doc(text(`edited ${marker}`)) }),
      ev(base, 'ticket', T, 'comment.deleted', { commentId: addedT.id }),
      addedS,
      ev(base, 'ticket', S, 'comment.edited', { commentId: addedS.id, body: doc(text('sibling edited')) }),
    ]);
    await applyCommitted(db.pool, [ev(base, 'ticket', T, 'ticket.deleted', {}), ev(base, 'ticket', T, 'purge.marked', {})]);
    await purgeItem(db.pool, { kind: 'ticket', id: T }, { projections: buildProjectionRegistry(), store: recordingStore(), now: await dueAt(db.pool, 'ticket', T) });
    expect(await scan(db.pool, [marker])).toEqual({});
    const { rows } = await db.pool.query(`SELECT count(*)::int AS n FROM events WHERE entity_id = $1 AND type IN ('comment.edited', 'comment.deleted')`, [T]);
    expect(rows[0].n).toBe(0);
    const sibling = await db.pool.query('SELECT body FROM proj_ticket_comments WHERE comment_id = $1', [addedS.id]);
    expect(sibling.rows[0]?.body).toEqual(doc(text('sibling edited'))); // control
  });
});
