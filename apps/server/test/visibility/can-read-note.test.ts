import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { SqlParams } from '../../src/read/sql-params.js';
import { visibleNotesWhere } from '../../src/read/visible-where.js';
import { canReadNote, canReadNoteById, loadNoteForVisibility } from '../../src/visibility/can-read-note.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';

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
 * - `memberIn` is on project P; `memberOut` is a workspace member on no project.
 *   Without both, "project scope means membership" and "project scope means
 *   being in the workspace" are the same predicate.
 * - `admin` is a workspace admin who is NOT on P. That is deliberate and it is
 *   what gives the matrix its `admin` column a `false` cell: `canSeeResolved`
 *   grants admins no read bypass (`can-see.ts`), so an admin who was also on P
 *   could not tell a role gate from a membership one.
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
  nProject: {
    owner: true,
    admin: false,
    memberIn: true,
    memberOut: false,
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
  resetEntitySeqs();

  WS = newUlid();
  P = newUlid();
  TP = newUlid();
  TE = newUlid();
  ids = {
    owner: newUlid(),
    admin: newUlid(),
    memberIn: newUlid(),
    memberOut: newUlid(),
    guestListed: newUlid(),
    guestUnlisted: newUlid(),
    author: newUlid(),
  };
  NOTES = {
    nPrivate: newUlid(),
    nWorkspace: newUlid(),
    nProject: newUlid(),
    nExplicit: newUlid(),
    nInherit: newUlid(),
  };

  const ws = { workspaceId: WS, actorId: ids.owner };
  // The roster shapes are copied from `helpers/read-scenario.ts:120` rather than
  // paraphrased, because the projection is the oracle: `membership.granted`
  // DECLARES scope as `z.never()` (the 2026-08-27 collapse), so a `scope` key
  // would be refused inside proj_memberships and the person would silently hold
  // no role at all.
  const ticket = (id: string, title: string) =>
    makeCommitted({ ...ws, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: 'task', projectId: P, parentId: null, title } });
  const noteEv = (id: string, type: string, payload: unknown) =>
    makeCommitted({ ...ws, actorId: ids.author, entity: { kind: 'note', id }, type, payload });

  await applyCommitted(db.pool, [
    makeCommitted({ ...ws, entity: { kind: 'workspace', id: WS }, type: 'workspace.created', payload: { name: 'Convenience Corner' } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: P }, type: 'project.created', payload: { name: 'Registrations' } }),
    ...(
      [
        ['owner', 'owner'],
        ['admin', 'admin'],
        ['memberIn', 'member'],
        ['memberOut', 'member'],
        ['guestListed', 'guest'],
        ['guestUnlisted', 'guest'],
        ['author', 'member'],
      ] as [U, string][]
    ).map(([who, role]) =>
      makeCommitted({
        ...ws,
        entity: { kind: 'membership', id: `${WS}:${ids[who]}` },
        type: 'membership.granted',
        payload: { userId: ids[who], role },
      }),
    ),
    // ON P: owner, memberIn, author. NOT admin, NOT memberOut — those two
    // absences are the cells the `project` row is written from.
    ...(['owner', 'memberIn', 'author'] as U[]).map((who) =>
      makeCommitted({ ...ws, entity: { kind: 'project', id: P }, type: 'project.member_added', payload: { userId: ids[who], projectAdmin: who === 'owner' } }),
    ),
    // The workflow and the ticket type, in `seedReadScenario`'s exact shapes and
    // with its exact ids. Not decoration: `proj_tickets` folds `ticket.created`
    // through the engine, which refuses an unknown type, so a fixture that seeded
    // tickets without these would fail at the projection rather than at an
    // assertion. The ids are fixed rather than minted for the same reason they
    // are fixed there (`type_id = 'task'` is asserted by name elsewhere), and
    // that is safe here because this file uses its own fresh database.
    makeCommitted({
      ...ws,
      entity: { kind: 'workflow', id: SCENARIO_WORKFLOW_ID },
      type: 'workflow.defined',
      payload: {
        id: SCENARIO_WORKFLOW_ID,
        version: 1,
        name: 'Errands',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: '*', to: 'doing', rules: [] },
          { from: '*', to: 'done', rules: [] },
        ],
      },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket-type', id: 'task' },
      type: 'ticket-type.defined',
      payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: SCENARIO_WORKFLOW_ID, fields: [] },
    }),
    ticket(TP, 'Renew the trade licence'),
    ticket(TE, 'Share the July invoices'),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: TE }, type: 'visibility.set', payload: { ticketId: TE, mode: 'explicit', userIds: [ids.guestListed] } }),

    noteEv(NOTES.nPrivate!, 'note.created', { title: 'Private', homeProjectId: P, scope: { mode: 'private' } }),
    noteEv(NOTES.nWorkspace!, 'note.created', { title: 'Workspace', homeProjectId: P, scope: { mode: 'workspace' } }),
    noteEv(NOTES.nProject!, 'note.created', { title: 'Project', homeProjectId: P, scope: { mode: 'project' } }),
    noteEv(NOTES.nExplicit!, 'note.created', { title: 'Explicit', homeProjectId: P, scope: { mode: 'explicit', userIds: [ids.guestListed] } }),
    noteEv(NOTES.nInherit!, 'note.created', {
      title: 'Inherit',
      homeProjectId: P,
      scope: { mode: 'inherit' },
      attachTicketId: TE,
    }),
  ]);
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
        expect(canReadNote(eff, ids[u], loaded!.note, loaded!.attachedVisibilities), `${noteKey}/${u}`).toBe(
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
