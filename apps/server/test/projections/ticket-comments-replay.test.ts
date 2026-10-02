import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { doc, ev, projectCreated, seedWorkspace, text, ticketCreated } from '../purge/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);
afterAll(async () => {
  await db.drop();
});

const row = async (commentId: string) =>
  (await db.pool.query('SELECT * FROM proj_ticket_comments WHERE comment_id = $1', [commentId])).rows[0];

describe('26.047 the projection keeps its replay guards (events applied through applyCommitted, bypassing the gate)', () => {
  it("26.047 an edit filed against another ticket leaves the row alone; an edit after the delete leaves the body NULL", async () => {
    const base = await seedWorkspace(db.pool);
    const P = newUlid();
    const A = newUlid();
    const B = newUlid();
    const onA = ev(base, 'ticket', A, 'comment.added', { body: doc(text('original')) });
    await applyCommitted(db.pool, [
      projectCreated(base, P, 'Replay', 'RP'),
      ticketCreated(base, A, P, 'Ticket A'),
      ticketCreated(base, B, P, 'Ticket B'),
      onA,
    ]);
    const untouched = await row(onA.id);

    // 1. the parent is part of the key: ticket B's edit naming A's comment touches nothing
    await applyCommitted(db.pool, [ev(base, 'ticket', B, 'comment.edited', { commentId: onA.id, body: doc(text('hijacked')) })]);
    expect(await row(onA.id)).toEqual(untouched);

    // 3. control: the proper edit on A changes the row
    await applyCommitted(db.pool, [ev(base, 'ticket', A, 'comment.edited', { commentId: onA.id, body: doc(text('edited')) })]);
    const edited = await row(onA.id);
    expect(edited.body).toEqual(doc(text('edited')));
    expect(edited.edited_at).not.toBeNull();

    // 2. a deleted comment is final: a late edit neither resurrects the text nor moves edited_at
    await applyCommitted(db.pool, [ev(base, 'ticket', A, 'comment.deleted', { commentId: onA.id })]);
    const deleted = await row(onA.id);
    expect(deleted.body).toBeNull();
    await applyCommitted(db.pool, [ev(base, 'ticket', A, 'comment.edited', { commentId: onA.id, body: doc(text('zombie')) })]);
    const after = await row(onA.id);
    expect(after.body).toBeNull();
    expect(after.edited_at).toEqual(deleted.edited_at);
    expect(after).toEqual(deleted);
  });
});
