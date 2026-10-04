import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, ticketKey, type LinkedFromTarget } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { listLinkedFrom } from '../../src/read/linked-from.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { canSee } from '../../src/visibility/can-see.js';
import { canReadNoteById } from '../../src/visibility/can-read-note.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesIntoReadWorld, type ReadWorldNotes } from '../helpers/notes-fixture.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * `listLinkedFrom` (Knowledge Graph spec B §2.2, §3.2), against a REAL database
 * seeded through every projection. The world is `buildReadTestApp`'s with the
 * notes fixture on top, as `test/routes/notes.test.ts` builds it: `guestTaskId`
 * (TARGET) is explicit to [owner, guest], `sharedTaskId` explicit to
 * [owner, member], `nPrivate` the owner's private note, `nExplicit` explicit to
 * the guest. The cases run IN ORDER: 27.129 trashes and restores, 27.131 writes
 * 21 comments against a second target, last.
 */

let db: TestDatabase;
let world: ReadWorld;
let notes: ReadWorldNotes;
let WS: string;
let TARGET: string; // guestTaskId: the guest and the owner can see it
let commentOnShared: string;
let commentOnPrivate: string;

const chip = (ticketId: string) => ({ type: 'ticketRef', attrs: { ticketId, projectId: 'P', key: 'X-1', title: 'July invoices' } });
const body = (...inline: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: inline }] });
const text = (value: string) => ({ type: 'text', text: value });

beforeAll(async () => {
  db = await createTestDatabase();
  world = await buildReadTestApp(db);
  WS = world.world.workspaceId;
  TARGET = world.world.guestTaskId;
  notes = await seedNotesIntoReadWorld(db.pool, {
    workspaceId: WS, projectId: world.world.projectId, authorId: world.userIds.owner,
    guestUserId: world.userIds.guest, TP: world.world.taskInEpicId, TE: world.world.guestTaskId,
  });
  const ev = (kind: 'ticket' | 'note', id: string, type: string, payload: unknown, actorId = world.userIds.owner) =>
    makeCommitted({ workspaceId: WS, actorId, entity: { kind, id }, type, payload });
  // Authored by the MEMBER (on sharedTaskId's explicit list), so 27.127's authorId leg can tell the
  // author from the viewer: every other event here is the owner's, and the owner is the reader.
  const onShared = ev('ticket', world.world.sharedTaskId, 'comment.added', { body: body(text('per '), chip(TARGET)) }, world.userIds.member);
  const onPrivate = ev('note', notes.NOTES.nPrivate, 'comment.added', { body: body(chip(TARGET)) });
  commentOnShared = onShared.id;
  commentOnPrivate = onPrivate.id;
  await applyCommitted(db.pool, [
    ev('ticket', world.world.sharedTaskId, 'ticket.field_set', { fieldId: 'description', value: body(text('needs '), chip(TARGET), text(' and '), chip(TARGET)) }),
    ev('note', notes.NOTES.nPrivate, 'note.body_set', { body: body(chip(TARGET)) }),
    ev('note', notes.NOTES.nExplicit, 'note.body_set', { body: body(text('see '), chip(TARGET)) }),
    ev('ticket', TARGET, 'ticket.field_set', { fieldId: 'description', value: body(chip(TARGET)) }), // self
    onShared,
    onPrivate,
  ]);
});
afterAll(async () => {
  await db.drop();
});

const target = (): LinkedFromTarget => ({ kind: 'ticket', id: TARGET });
async function readAs(role: ReadRole, cursor: string | null = null) {
  const userId = world.userIds[role];
  const eff = await resolveEffectiveRole(db.pool, userId, WS);
  return listLinkedFrom(db.pool, eff, userId, WS, target(), cursor);
}
const ids = (page: { items: Array<{ sourceKind: string; sourceId: string }> }) => page.items.map((i) => `${i.sourceKind}:${i.sourceId}`).sort();

describe('27.126 visibility follows the SOURCE: no row and no count from a source the viewer cannot see', () => {
  it('27.126 the guest sees only the explicit note; the owner sees all five sources (control)', async () => {
    const owner = await readAs('owner');
    expect(ids(owner)).toEqual(
      [`ticket:${world.world.sharedTaskId}`, `note:${notes.NOTES.nPrivate}`, `note:${notes.NOTES.nExplicit}`, `comment:${commentOnShared}`, `comment:${commentOnPrivate}`].sort(),
    );
    expect(owner.total).toBe(5);
    const guest = await readAs('guest');
    expect(ids(guest)).toEqual([`note:${notes.NOTES.nExplicit}`]);
    expect(guest.total).toBe(1);
    expect(guest.items[0]!.snippet).toBe('see [[X-1 July invoices]]'); // the explicit note's own snippet, nothing of the shared ticket's ('needs …')
  });

  it('27.126 a source in ANOTHER workspace that chips the target is never listed, though its row is in the index', async () => {
    // The owner's predicate is `TRUE`, so only the workspace pins (`firsts`' `r.workspace_id` and each
    // arm's parent `workspace_id`) keep the neighbour's ticket out.
    const N = world.neighbour;
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: N.workspaceId, actorId: world.userIds.neighbour, entity: { kind: 'ticket', id: N.ticketId }, type: 'ticket.field_set', payload: { fieldId: 'description', value: body(chip(TARGET)) } }),
    ]);
    const raw = await db.pool.query('SELECT 1 FROM proj_references WHERE source_id = $1 AND target_id = $2', [N.ticketId, TARGET]);
    expect(raw.rowCount).toBe(1); // the haystack holds its subject
    const owner = await readAs('owner');
    expect(ids(owner)).not.toContain(`ticket:${N.ticketId}`);
    expect(owner.total).toBe(5);
  });
});

describe('27.127 one row per source, its first reference; parents carry key, title and category', () => {
  it('27.127 the shared ticket chips the target twice and is ONE row with ordinal 0’s snippet', async () => {
    const owner = await readAs('owner');
    expect(owner.items.filter((i) => i.sourceKind === 'ticket')).toHaveLength(1); // one row, not one per chip
    const shared = owner.items.find((i) => i.sourceKind === 'ticket')!;
    expect(shared.snippet).toBe('needs [[X-1 July invoices]] and X-1 July invoices');
    // The world has no entered prefixes: both halves are derived, `CC` + `RE` (`test/read/ticket-cards.test.ts:687-703`).
    const numbers = await ticketNumbers(db.pool, WS, [world.world.sharedTaskId]);
    expect(shared.parent).toEqual({
      kind: 'ticket', ticketId: world.world.sharedTaskId, projectId: world.world.projectId,
      key: ticketKey('CC', 'RE', numbers.get(world.world.sharedTaskId)!), title: 'Renew the trade licence',
      stateCategory: 'active', // sharedTaskId sits in `waiting`, category active (`read-scenario.ts:162`, `:240-247`); the fallback is 'open'
    });
    const onShared = owner.items.find((i) => i.sourceId === commentOnShared)!;
    expect(onShared.parent).toEqual(shared.parent); // a comment's parent key is composed from the PARENT ticket's number
    expect(onShared.authorId).toBe(world.userIds.member); // the comment's author, not the viewer (the owner)
    const comment = owner.items.find((i) => i.sourceId === commentOnPrivate)!;
    expect(comment.parent).toEqual({ kind: 'note', noteId: notes.NOTES.nPrivate, title: 'Private' });
    expect(comment.authorId).toBe(world.userIds.owner);
  });

  it('27.127 a ticket whose key cannot be composed (its project has no prefix) is still listed, key ""; a composed key beside it (control)', async () => {
    // A THIRD target (hiddenTaskId, the owner's alone), so no other case's counts move. `phantom` is
    // filed in a project no `project.created` named: `projectPrefixesInWorkspace` has no prefix for it.
    const H = world.world.hiddenTaskId;
    const phantom = newUlid();
    const ev = (id: string, type: string, payload: unknown) => makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind: 'ticket', id }, type, payload });
    await applyCommitted(db.pool, [
      ev(phantom, 'ticket.created', { typeId: 'task', projectId: newUlid(), parentId: null, title: 'Orphan' }),
      ev(phantom, 'ticket.field_set', { fieldId: 'description', value: body(chip(H)) }),
      ev(world.world.taskInEpicId, 'ticket.field_set', { fieldId: 'description', value: body(chip(H)) }),
    ]);
    const eff = await resolveEffectiveRole(db.pool, world.userIds.owner, WS);
    const page = await listLinkedFrom(db.pool, eff, world.userIds.owner, WS, { kind: 'ticket', id: H }, null);
    const byId = new Map(page.items.map((i) => [i.sourceId, i.parent]));
    expect(byId.get(phantom)).toMatchObject({ kind: 'ticket', ticketId: phantom, key: '', title: 'Orphan' });
    const numbers = await ticketNumbers(db.pool, WS, [world.world.taskInEpicId]);
    expect(byId.get(world.world.taskInEpicId)).toMatchObject({ key: ticketKey('CC', 'RE', numbers.get(world.world.taskInEpicId)!) });
  });
});

describe('27.128 the target’s own description is not "Linked from"', () => {
  it('27.128 the self-reference is absent; the other sources are present (control, 27.126)', async () => {
    // Precondition: the self row IS in the index, so its absence below is the read's doing.
    const raw = await db.pool.query(
      `SELECT 1 FROM proj_references WHERE source_kind = 'ticket' AND source_id = $1 AND target_kind = 'ticket' AND target_id = $1`, [TARGET]);
    expect(raw.rowCount).toBe(1);
    expect(ids(await readAs('owner'))).not.toContain(`ticket:${TARGET}`);
    // A comment ON the target that chips it IS listed (plan decision: its source is the comment). Deleted again
    // in the same it(), so 27.129–27.130's counts are unchanged.
    const onTarget = makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind: 'ticket', id: TARGET }, type: 'comment.added', payload: { body: body(chip(TARGET)) } });
    await applyCommitted(db.pool, [onTarget]);
    expect(ids(await readAs('owner'))).toContain(`comment:${onTarget.id}`);
    await applyCommitted(db.pool, [makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind: 'ticket', id: TARGET }, type: 'comment.deleted', payload: { commentId: onTarget.id } })]);
    expect((await readAs('owner')).total).toBe(5);
  });
});

describe('27.129 a trashed source is hidden and comes back on restore', () => {
  it('27.129 delete the shared ticket: its row and its comment’s row go; restore: both back', async () => {
    const ev = (type: string) => makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind: 'ticket', id: world.world.sharedTaskId }, type, payload: {} });
    const before = ids(await readAs('owner'));
    expect(before).toContain(`comment:${commentOnShared}`); // precondition: both rows are listed before the trash
    await applyCommitted(db.pool, [ev('ticket.deleted')]);
    const during = await readAs('owner');
    expect(ids(during)).not.toContain(`ticket:${world.world.sharedTaskId}`);
    expect(ids(during)).not.toContain(`comment:${commentOnShared}`);
    expect(during.total).toBe(3);
    await applyCommitted(db.pool, [ev('ticket.restored')]);
    expect(ids(await readAs('owner'))).toEqual(before); // the same five sources, not merely five
  });

  it('27.129 a trashed source NOTE hides its row and its comment’s; a deleted home project hides every source filed in it; restore and undelete bring them back', async () => {
    const before = ids(await readAs('owner'));
    expect(before).toHaveLength(5); // precondition: the five sources, the trash above undone
    const onNote = (type: string) => makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind: 'note', id: notes.NOTES.nPrivate }, type, payload: {} });
    await applyCommitted(db.pool, [onNote('note.deleted')]);
    const during = await readAs('owner');
    expect(ids(during)).toEqual(before.filter((id) => id !== `note:${notes.NOTES.nPrivate}` && id !== `comment:${commentOnPrivate}`));
    expect(during.total).toBe(3);
    await applyCommitted(db.pool, [onNote('note.restored')]);
    expect(ids(await readAs('owner'))).toEqual(before);
    // Every source here is filed in the world's one project: its tickets go by `LIVE_TICKET_WHERE`'s
    // container clause, its notes (and their comments) by `NOTE_PROJECT_LIVE_WHERE`.
    const onProject = (type: string) => makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind: 'project', id: world.world.projectId }, type, payload: {} });
    await applyCommitted(db.pool, [onProject('project.deleted')]);
    const gone = await readAs('owner');
    expect([gone.total, ids(gone)]).toEqual([0, []]);
    await applyCommitted(db.pool, [onProject('project.undeleted')]);
    expect(ids(await readAs('owner'))).toEqual(before);
  });
});

describe('27.130 agreement: every row the read returns passes canSee / canReadNoteById, per role', () => {
  it('27.130 for each role the read equals the owner’s rows filtered by the per-row predicates', async () => {
    const all = (await readAs('owner')).items;
    expect(all).toHaveLength(5); // precondition: the loop below runs over every source
    const sizes: Record<string, number> = {};
    for (const role of ['owner', 'member', 'outsider', 'guest'] as ReadRole[]) {
      const userId = world.userIds[role];
      const expected: string[] = [];
      for (const item of all) {
        const ok = item.parent.kind === 'ticket' ? await canSee(db.pool, userId, item.parent.ticketId) : await canReadNoteById(db.pool, userId, item.parent.noteId);
        if (ok) expected.push(`${item.sourceKind}:${item.sourceId}`);
      }
      sizes[role] = expected.length;
      expect(ids(await readAs(role)), role).toEqual(expected.sort());
    }
    // The agreement is not vacuous: the predicates admit different sets per role (member: the shared
    // ticket and its comment; guest: the explicit note; outsider: nothing).
    expect(sizes).toEqual({ owner: 5, member: 2, outsider: 0, guest: 1 });
  });
});

describe('27.131 paging: 20 per page, newest first, at exactly 20 and at 21', () => {
  it('27.131 20 sources → one page, no cursor; one more → a cursor and a second page of one', async () => {
    // A SECOND target with no sources yet, so the visibility cases' counts above do not move.
    const T2 = world.world.taskInEpicId;
    const onT2 = (n: number) =>
      Array.from({ length: n }, () => makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind: 'note', id: notes.NOTES.nWorkspace }, type: 'comment.added', payload: { body: body(chip(T2)) } }));
    await applyCommitted(db.pool, onT2(20));
    const eff = await resolveEffectiveRole(db.pool, world.userIds.owner, WS);
    const at20 = await listLinkedFrom(db.pool, eff, world.userIds.owner, WS, { kind: 'ticket', id: T2 }, null);
    expect([at20.items.length, at20.total, at20.nextCursor]).toEqual([20, 20, null]);
    await applyCommitted(db.pool, onT2(1));
    const first = await listLinkedFrom(db.pool, eff, world.userIds.owner, WS, { kind: 'ticket', id: T2 }, null);
    expect([first.items.length, first.total]).toEqual([20, 21]);
    expect(first.nextCursor).not.toBeNull();
    const second = await listLinkedFrom(db.pool, eff, world.userIds.owner, WS, { kind: 'ticket', id: T2 }, first.nextCursor);
    expect([second.items.length, second.nextCursor]).toEqual([1, null]);
    const all = [...first.items, ...second.items].map((i) => i.updatedAt);
    expect(all).toEqual([...all].sort().reverse()); // newest first
    expect(new Set([...first.items, ...second.items].map((i) => i.sourceId)).size).toBe(21);
  });
});
