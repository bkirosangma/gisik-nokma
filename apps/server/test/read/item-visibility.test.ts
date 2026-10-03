import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hiddenItems, type ItemRef } from '../../src/read/item-visibility.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { canSee } from '../../src/visibility/can-see.js';
import { canReadNoteById } from '../../src/visibility/can-read-note.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { NOTES_USERS, seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';

/**
 * Spec D D4's primitive (Task 1, 27.411–27.412): of a set of items, the LIVE ones a viewer cannot see.
 *
 * ## STALE-CITE drift, recorded (plan text vs this base)
 * The plan's 27.411 expects `memberOut` to lose `TP` and `nProject`. Rule A (owner ruling 2026-09-29, the
 * header of `can-read-note.test.ts`) made every member and admin a reader of every founded project, so
 * `memberOut` now sees both. The reader who loses project-mode items is a GUEST; `guestListed` (named in two
 * explicit audiences, on no project) is used, and `memberOut` is kept as the control that Rule A holds.
 */
let db: TestDatabase;
let fx: NotesFixture;
beforeAll(async () => {
  db = await createTestDatabase();
  fx = await seedNotesFixture(db.pool);
}, 120_000);
afterAll(async () => {
  await db.drop();
});

async function hiddenFor(who: NotesUser, items: readonly ItemRef[]): Promise<ItemRef[]> {
  const uid = fx.ids[who];
  const eff = await resolveEffectiveRole(db.pool, uid, fx.WS);
  return hiddenItems(db.pool, eff, uid, fx.WS, items);
}
const key = (items: readonly ItemRef[]): string[] => items.map((item) => `${item.kind}:${item.id}`).sort();
const t = (id: string): ItemRef => ({ kind: 'ticket', id });
const n = (id: string): ItemRef => ({ kind: 'note', id });

describe('27.412 hiddenItems agrees with the single-item definitions', () => {
  it('for every user and every item, hidden ⇔ ¬canSee / ¬canReadNoteById; control: the table is not constant', async () => {
    const items: ItemRef[] = [t(fx.TP), t(fx.TE), ...Object.values(fx.NOTES).map(n)];
    let someHidden = false;
    let someClear = false;
    for (const who of NOTES_USERS) {
      const uid = fx.ids[who];
      const hidden = new Set(key(await hiddenFor(who, items)));
      for (const item of items) {
        const single = item.kind === 'ticket' ? await canSee(db.pool, uid, item.id) : await canReadNoteById(db.pool, uid, item.id);
        expect(hidden.has(`${item.kind}:${item.id}`), `${who} ${item.kind}:${item.id}`).toBe(!single);
      }
      if (hidden.size > 0) someHidden = true;
      if (hidden.size === 0) someClear = true;
    }
    expect(someHidden).toBe(true); // control
    expect(someClear).toBe(true); // control
  });
});

describe('27.411 hiddenItems: live minus visible, fail-closed, trash ignored', () => {
  it('lists what the viewer cannot see; a missing visibility row hides; a trashed ticket is ignored; control: members and the owner lose nothing', async () => {
    const mixed = [t(fx.TP), n(fx.NOTES.nProject), n(fx.NOTES.nWorkspace), t(fx.TE), n(fx.NOTES.nExplicit)];
    // A listed guest: no project, no workspace scope — loses TP, nProject, nWorkspace; keeps TE and nExplicit.
    expect(key(await hiddenFor('guestListed', mixed))).toEqual(key([t(fx.TP), n(fx.NOTES.nProject), n(fx.NOTES.nWorkspace)]));
    // Controls: Rule A readers and the owner lose nothing.
    expect(await hiddenFor('memberIn', [t(fx.TP), n(fx.NOTES.nProject), n(fx.NOTES.nWorkspace)])).toEqual([]);
    expect(await hiddenFor('memberOut', [t(fx.TP), n(fx.NOTES.nProject), n(fx.NOTES.nWorkspace)])).toEqual([]);
    expect(await hiddenFor('owner', mixed)).toEqual([]);

    // FAIL-CLOSED: with TP's visibility row gone, even a reader who saw it a moment ago has it HIDDEN.
    // Inside a transaction that is rolled back, so the row is restored on the same connection.
    expect(await hiddenFor('memberIn', [t(fx.TP)])).toEqual([]);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM proj_visibility WHERE ticket_id = $1', [fx.TP]);
      const uid = fx.ids.memberIn;
      const eff = await resolveEffectiveRole(client, uid, fx.WS);
      expect(await hiddenItems(client, eff, uid, fx.WS, [t(fx.TP)])).toEqual([t(fx.TP)]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(await hiddenFor('memberIn', [t(fx.TP)])).toEqual([]); // restored

    // TRASH: a trashed ticket is ignored, not counted as hidden.
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: fx.WS, entity: { kind: 'ticket', id: fx.TP }, type: 'ticket.deleted', payload: {}, actorId: fx.ids.owner }),
    ]);
    expect(key(await hiddenFor('guestListed', mixed))).toEqual(key([n(fx.NOTES.nProject), n(fx.NOTES.nWorkspace)]));
    expect(await hiddenFor('owner', mixed)).toEqual([]);

    // A deleted NOTE is ignored the same way. nProject is hidden from the guest (above); once its author
    // deletes it, the guest's hidden set drops it, and the owner's stays empty.
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: fx.WS, actorId: fx.ids.author, entity: { kind: 'note', id: fx.NOTES.nProject }, type: 'note.deleted', payload: {} }),
    ]);
    expect(key(await hiddenFor('guestListed', mixed))).toEqual(key([n(fx.NOTES.nWorkspace)]));
    expect(await hiddenFor('owner', mixed)).toEqual([]);
  });
});
