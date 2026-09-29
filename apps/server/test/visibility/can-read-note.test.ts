import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { SqlParams } from '../../src/read/sql-params.js';
import { visibleNotesWhere } from '../../src/read/visible-where.js';
import { canReadNote, canReadNoteById, loadNoteForVisibility, noteArmReach } from '../../src/visibility/can-read-note.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { seedNotesFixture } from '../helpers/notes-fixture.js';

/**
 * The reader predicate's fixture: 5 notes × 7 people.
 *
 * ## Why it is its own world rather than `seedReadScenario`'s
 *
 * `helpers/read-scenario.ts` seeds 4 people (owner, member, outsider, guest) and
 * no `admin` at all — its own docblock names that absence ("There is no viewer
 * with workspace role `'admin'`") — and it REFUSES a second seed into the same
 * database, because its workflow and ticket types have fixed entity ids. The
 * roles this file is about cannot be added to it, so this file builds the world
 * it needs and says so.
 *
 * ## The cells, and what each one is FOR
 *
 * - `memberIn` is on project P by a roster row; `memberOut` is a workspace member
 *   with NO roster row. AMENDED 2026-09-29, owner ruling (A): both read P's
 *   project-mode notes, because an admin/member is on every founded project. The
 *   pair still separates a roster row from rule A's implicit membership.
 * - `admin` is a workspace admin with no roster row on P. Under rule A the admin
 *   reads P's `project` notes (it used to be the matrix's `false` cell, the "no
 *   admin read bypass" witness, now retired); the admin's `false` cells are the
 *   `private`, `explicit` and `inherit`-via-explicit notes. The `project` row's
 *   no-read witnesses are the guests.
 * - `guestListed` is a guest named in two explicit audiences; `guestUnlisted` is
 *   a guest named in none. A single guest cannot tell "explicit admits guests"
 *   from "explicit admits everyone".
 * - `author` is a member on P and the author of every note, so the author arm is
 *   exercised separately from every scope arm.
 *
 * ## The tickets
 *
 * `TP` is a plain ticket in P with no authored audience, so it resolves to
 * `project`. `TE` is `explicit: [guestListed]`. They exist to give `nInherit`
 * something to inherit from, and their two modes are what make 18.022's union
 * observable.
 */
type U = 'owner' | 'admin' | 'memberIn' | 'memberOut' | 'guestListed' | 'guestUnlisted' | 'author';

/** `seedReadScenario`'s own id, copied with the events below that need it. */
const SCENARIO_WORKFLOW_ID = 'wf-errands';
const USERS: U[] = ['owner', 'admin', 'memberIn', 'memberOut', 'guestListed', 'guestUnlisted', 'author'];

/**
 * Spec §4.1 compiled to a table — one row per note, one column per person.
 *
 * This is the assertion, and its SHAPE is the point: every cell is stated, so a
 * predicate that widened (`return true`) or narrowed (`return false`) reddens
 * somewhere by name rather than matching a smaller expected set by accident.
 */
const EXPECTED: Record<string, Record<U, boolean>> = {
  nPrivate: {
    owner: true,
    admin: false,
    memberIn: false,
    memberOut: false,
    guestListed: false,
    guestUnlisted: false,
    author: true,
  },
  nWorkspace: {
    owner: true,
    admin: true,
    memberIn: true,
    memberOut: true,
    guestListed: false,
    guestUnlisted: false,
    author: true,
  },
  // AMENDED 2026-09-29, owner ruling (A): an admin/member is on every founded
  // project, so `admin` and `memberOut` READ a `project` note. The no-read
  // witnesses on this row are the two guests, which reach no project by any rule.
  nProject: {
    owner: true,
    admin: true,
    memberIn: true,
    memberOut: true,
    guestListed: false,
    guestUnlisted: false,
    author: true,
  },
  nExplicit: {
    owner: true,
    admin: false,
    memberIn: false,
    memberOut: false,
    guestListed: true,
    guestUnlisted: false,
    author: true,
  },
  nInherit: {
    owner: true,
    admin: false,
    memberIn: false,
    memberOut: false,
    guestListed: true,
    guestUnlisted: false,
    author: true,
  },
};

let db: TestDatabase;
let WS: string;
let P: string;
let TP: string;
let TE: string;
let ids: Record<U, string>;
let NOTES: Record<string, string>;

beforeAll(async () => {
  db = await createTestDatabase();
  // The world is `test/helpers/notes-fixture.ts`’s, shared with the writer matrix
  // (18.024) so the two cannot come to disagree about what "the world" is. It
  // resets the helper’s process-local seq counter itself, which is why the ids it
  // mints and the seqs `applyCommitted` writes cannot collide.
  const fixture = await seedNotesFixture(db.pool);
  ({ WS, P, TP, TE, ids, NOTES } = fixture);
});

afterAll(async () => {
  await db.drop();
});

describe('18.020 canReadNote', () => {
  it('18.020 canReadNote matches EXPECTED for every cell', async () => {
    for (const [noteKey, noteId] of Object.entries(NOTES)) {
      for (const u of USERS) {
        const eff = await resolveEffectiveRole(db.pool, ids[u], WS);
        const loaded = await loadNoteForVisibility(db.pool, noteId);
        expect(loaded, noteKey).not.toBeNull();
        const armReach = await noteArmReach(db.pool, ids[u], loaded!.attachedVisibilities);
        expect(canReadNote(eff, ids[u], loaded!.note, loaded!.attachedVisibilities, armReach), `${noteKey}/${u}`).toBe(
          EXPECTED[noteKey]![u],
        );
      }
    }
  });
});

describe('18.021 visibleNotesWhere', () => {
  it('18.021 visibleNotesWhere agrees with canReadNote per user', async () => {
    for (const u of USERS) {
      const eff = await resolveEffectiveRole(db.pool, ids[u], WS);
      const params = new SqlParams();
      const where = visibleNotesWhere(eff, ids[u], params);
      const { rows } = await db.pool.query<{ note_id: string }>(
        `SELECT n.note_id FROM proj_notes n WHERE n.workspace_id = ${params.add(WS)} AND ${where}`,
        params.toArray(),
      );
      const got = new Set(rows.map((r) => r.note_id));
      const want = new Set(
        Object.entries(NOTES)
          .filter(([k]) => EXPECTED[k]![u])
          .map(([, id]) => id),
      );
      expect(got, u).toEqual(want);
    }
  });
});

describe('18.022 inherit is a union', () => {
  it('18.022 inherit is a union over attached visible tickets', async () => {
    // attached to TE only → memberIn cannot read it.
    expect(await canReadNoteById(db.pool, ids.memberIn, NOTES.nInherit!)).toBe(false);
    // attach it to TP as well → memberIn now reads it, and so does the guest.
    const ws = { workspaceId: WS, actorId: ids.author };
    await applyCommitted(db.pool, [
      makeCommitted({ ...ws, entity: { kind: 'note', id: NOTES.nInherit! }, type: 'note.attached', payload: { ticketId: TP } }),
    ]);
    expect(await canReadNoteById(db.pool, ids.memberIn, NOTES.nInherit!)).toBe(true);
    // delete TP → memberIn loses it again; guestListed keeps it THROUGH TE,
    // which is the union direction a `every` would have broken.
    await applyCommitted(db.pool, [
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: TP }, type: 'ticket.deleted', payload: {} }),
    ]);
    expect(await canReadNoteById(db.pool, ids.memberIn, NOTES.nInherit!)).toBe(false);
    expect(await canReadNoteById(db.pool, ids.guestListed, NOTES.nInherit!)).toBe(true);
  });
});

describe('18.023 the arms a scope cannot explain', () => {
  it('18.023 owner reads all, author reads own private, non-member reads nothing', async () => {
    const stranger = newUlid();
    expect(await canReadNoteById(db.pool, stranger, NOTES.nWorkspace!)).toBe(false);
    expect(await canReadNoteById(db.pool, ids.owner, NOTES.nPrivate!)).toBe(true);
    expect(await canReadNoteById(db.pool, ids.author, NOTES.nPrivate!)).toBe(true);
  });
});
