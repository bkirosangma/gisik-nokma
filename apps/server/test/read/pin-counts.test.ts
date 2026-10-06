import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { listNotesForTicket } from '../../src/read/notes.js';
import { NO_PIN, pinCountsFor, pinOf } from '../../src/read/pin-counts.js';
import { readList } from '../../src/routes/list.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';

/**
 * Workflow and Timeline graphs, Part 1, T12 — case 29.113 (TG-11, TV-10). The paper pin counts the notes a viewer may READ and
 * the attachments a ticket owns, and the list page carries the counts so the Timeline view needs no second request.
 *
 * The world is the notes series' 5-notes x 7-people fixture (`helpers/notes-fixture.ts`). TP is a project-mode ticket on
 * project P; TE is explicit-to-guestListed. Four live notes are attached to TP (workspace, project, private, explicit scope),
 * plus two that no one may count: one that was then deleted, and a workspace note homed in a second project that was then
 * deleted (`NOTE_PROJECT_LIVE_WHERE`, the notes list's own clause). `nInherit` is already attached to TE by the fixture. Two
 * attachments belong to TP, one to TE, one to a NOTE (not a ticket). The last case adds what belongs to a SECOND workspace: a
 * note homed there and linked to TP (a link row written directly: the client door refuses it since
 * task/notes-cross-workspace-attach, 18.500), and a file row filed there on TP; neither counts here.
 */
let db: TestDatabase;
let world: NotesFixture;

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedNotesFixture(db.pool);
  const author = world.ids.author;
  const attach = (noteId: string, ticketId: string) =>
    makeCommitted({ workspaceId: world.WS, actorId: author, entity: { kind: 'note', id: noteId }, type: 'note.attached', payload: { ticketId } });
  // A workspace-scope note attached to TP and then deleted: the owner could read it, so only the deleted rule keeps it out of the count.
  const gone = newUlid();
  const goneEvent = (type: string, payload: unknown) =>
    makeCommitted({ workspaceId: world.WS, actorId: author, entity: { kind: 'note', id: gone }, type, payload });
  // A workspace-scope note homed in a second project, attached to TP, and then its PROJECT deleted: the note itself is live, so
  // only `NOTE_PROJECT_LIVE_WHERE` keeps it out of the count.
  const archive = newUlid();
  const orphan = newUlid();
  await applyCommitted(db.pool, [
    attach(world.NOTES.nWorkspace, world.TP),
    attach(world.NOTES.nProject, world.TP),
    attach(world.NOTES.nPrivate, world.TP),
    attach(world.NOTES.nExplicit, world.TP),
    goneEvent('note.created', { title: 'Gone', homeProjectId: world.P, scope: { mode: 'workspace' } }),
    goneEvent('note.attached', { ticketId: world.TP }),
    goneEvent('note.deleted', {}),
    makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'project', id: archive }, type: 'project.created', payload: { name: 'Archive' } }),
    makeCommitted({
      workspaceId: world.WS,
      actorId: author,
      entity: { kind: 'note', id: orphan },
      type: 'note.created',
      payload: { title: 'Homed in a deleted project', homeProjectId: archive, scope: { mode: 'workspace' } },
    }),
    attach(orphan, world.TP),
    makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'project', id: archive }, type: 'project.deleted', payload: {} }),
  ]);
  const file = (ticketId: string | null, noteId: string | null) =>
    db.pool.query(
      `INSERT INTO attachments (id, workspace_id, ticket_id, note_id, uploader_id, filename, mime, size, object_key)
       VALUES ($1, $2, $3, $4, $5, 'a.pdf', 'application/pdf', 3, $6)`,
      [newUlid(), world.WS, ticketId, noteId, world.ids.owner, `k/${newUlid()}`],
    );
  await file(world.TP, null);
  await file(world.TP, null);
  await file(world.TE, null);
  await file(null, world.NOTES.nWorkspace); // a NOTE's attachment: never a ticket's
}, 120_000);

afterAll(async () => {
  await db.drop();
});

async function pinsFor(who: NotesUser) {
  const eff = await resolveEffectiveRole(db.pool, world.ids[who], world.WS);
  return pinCountsFor(db.pool, eff, world.ids[who], world.WS, [world.TP, world.TE]);
}

async function pageFor(who: NotesUser) {
  const eff = await resolveEffectiveRole(db.pool, world.ids[who], world.WS);
  const page = await readList(db.pool, eff, world.ids[who], world.WS, world.P, { spec: {}, limit: 50, groupBy: 'flat' });
  return page.groups.flatMap((g) => g.cards) as Array<{ ticketId: string; title: string; pin?: unknown }>;
}

describe('29.113 the paper pin counts what the viewer may read, plus the ticket-owned attachments', () => {
  it('29.113 per viewer: the owner reads all four live notes on TP, a member on P two, an unlisted guest none; the attachments are the ticket\'s two whoever asks; a deleted note and a note homed in a deleted project count for nobody', async () => {
    const owner = await pinsFor('owner');
    // Four, not six: the owner may read every note, so only the deleted rule and the live-project rule keep the other two out.
    expect(owner.get(world.TP)).toEqual({ notes: 4, attachments: 2 });
    const memberIn = await pinsFor('memberIn');
    // workspace + project scope; not the private one (author only), not the explicit one (guestListed only). A note the member
    // cannot read adds nothing, so the count does not reveal that it exists.
    expect(memberIn.get(world.TP)).toEqual({ notes: 2, attachments: 2 });
    const guest = await pinsFor('guestUnlisted');
    // A guest reads neither the workspace nor the project note; the ticket's attachments still count.
    expect(guest.get(world.TP)).toEqual({ notes: 0, attachments: 2 });
    // CONTROL, same it: TP really holds SIX note links (the deleted note's and the deleted project's included), so the owner's 4 is
    // the two rules at work and not links the fixture failed to write.
    const links = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM proj_note_attachments WHERE ticket_id = $1', [world.TP]);
    expect(links.rows[0]?.n).toBe(6);
    // Only the asked-for tickets are keys: the note-owned file (ticket_id NULL) adds no key of its own.
    expect([...owner.keys()].sort()).toEqual([world.TP, world.TE].sort());
  });

  it('29.113 an inherited note reaches a guest through its ticket; a note-owned attachment is never a ticket\'s; an empty id list reads nothing', async () => {
    const listed = await pinsFor('guestListed');
    // nInherit is attached to TE, which guestListed may read (explicit audience); the attachment on TE counts.
    expect(listed.get(world.TE)).toEqual({ notes: 1, attachments: 1 });
    // The workspace note's own attachment (ticket_id NULL) did not become an attachment of TP: TP has exactly the two files.
    expect((await pinsFor('owner')).get(world.TP)?.attachments).toBe(2);
    const eff = await resolveEffectiveRole(db.pool, world.ids.owner, world.WS);
    // Only the asked-for ids are read: asked for TE alone, TP (six note links, two files) is not in the answer.
    expect([...(await pinCountsFor(db.pool, eff, world.ids.owner, world.WS, [world.TE])).entries()]).toEqual([[world.TE, { notes: 1, attachments: 1 }]]);
    // "Reads nothing" is a statement about the database: no query is sent for an empty page (an `ANY('{}')` query would also
    // answer an empty map, so the map's size alone cannot tell).
    const queries = vi.spyOn(db.pool, 'query');
    expect((await pinCountsFor(db.pool, eff, world.ids.owner, world.WS, [])).size).toBe(0);
    expect(queries).not.toHaveBeenCalled();
    queries.mockRestore();
    // The literal, not `NO_PIN`: comparing with the module's own constant would pass whatever that constant held.
    expect(pinOf(new Map(), 'no-such-ticket')).toEqual({ notes: 0, attachments: 0 });
    expect(NO_PIN).toEqual({ notes: 0, attachments: 0 });
  });

  it('29.113 a viewer\'s page counts only its own rows: the listed guest\'s page holds TE with one note and one attachment and no TP, and the unlisted guest\'s page holds no card', async () => {
    // The route passes only the ids of the page it already filtered, so a ticket the viewer cannot see carries no count anywhere.
    const listed = await pageFor('guestListed');
    expect(listed.map((c) => c.ticketId)).toEqual([world.TE]);
    expect(listed[0]?.pin).toEqual({ notes: 1, attachments: 1 });
    expect(await pageFor('guestUnlisted')).toEqual([]);
    // CONTROL, same it: the member on P sees TP with its two readable notes, and the owner sees both tickets with their counts.
    const member = await pageFor('memberIn');
    expect(member.map((c) => [c.ticketId, c.pin])).toEqual([[world.TP, { notes: 2, attachments: 2 }]]);
    expect((await pageFor('owner')).length).toBe(2);
  });

  it('29.113 the list page carries the pin on every row, and the row of a ticket with nothing is {notes: 0, attachments: 0}, never absent', async () => {
    const cards = await pageFor('owner');
    expect(cards.length).toBe(2);
    const byId = new Map(cards.map((c) => [c.ticketId, c]));
    expect(byId.get(world.TP)?.pin).toEqual({ notes: 4, attachments: 2 });
    expect(byId.get(world.TE)?.pin).toEqual({ notes: 1, attachments: 1 });
    // A third ticket with no note and no file: the route answers zeros.
    const bareId = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'ticket', id: bareId }, type: 'ticket.created', payload: { typeId: 'task', projectId: world.P, parentId: null, title: 'Bare' } }),
    ]);
    const bare = (await pageFor('owner')).find((c) => c.title === 'Bare');
    expect(bare).toBeDefined();
    expect(bare?.pin).toEqual({ notes: 0, attachments: 0 });
    // Then a note alone (no file): the notes-only path of the merge, which neither TP nor TE exercises (both hold files).
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: world.WS, actorId: world.ids.author, entity: { kind: 'note', id: world.NOTES.nProject }, type: 'note.attached', payload: { ticketId: bareId } }),
    ]);
    const noteOnly = (await pageFor('owner')).find((c) => c.ticketId === bareId);
    expect(noteOnly?.pin).toEqual({ notes: 1, attachments: 0 });
  });

  it('29.113 a note homed in ANOTHER workspace counts for nobody here, though a link row ties it to TP, and nor does a file row filed under that workspace on TP', async () => {
    // W2 is a second workspace owned by `author`, who is also a member on P here, so TP is a ticket the author may open. Its
    // note is live, workspace-scope and homed in a live project: every clause of the count but the workspace bind admits it
    // for this workspace's owner (`visibleNotesWhere` is TRUE) and members (the unbound `scope_mode = 'workspace'` arm).
    const W2 = newUlid();
    const P2 = newUlid();
    const away = newUlid();
    const inW2 = { workspaceId: W2, actorId: world.ids.author };
    await applyCommitted(db.pool, [
      makeCommitted({ ...inW2, entity: { kind: 'workspace', id: W2 }, type: 'workspace.created', payload: { name: 'Elsewhere' } }),
      makeCommitted({
        ...inW2,
        entity: { kind: 'membership', id: `${W2}:${world.ids.author}` },
        type: 'membership.granted',
        payload: { userId: world.ids.author, role: 'owner' },
      }),
      makeCommitted({ ...inW2, entity: { kind: 'project', id: P2 }, type: 'project.created', payload: { name: 'Elsewhere' } }),
      makeCommitted({
        ...inW2,
        entity: { kind: 'note', id: away },
        type: 'note.created',
        payload: { title: 'Homed in the second workspace', homeProjectId: P2, scope: { mode: 'workspace' } },
      }),
    ]);
    const onTP = async (table: 'proj_note_attachments' | 'attachments') =>
      (await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ticket_id = $1`, [world.TP])).rows[0]?.n;
    const linksBefore = await onTP('proj_note_attachments');
    const filesBefore = await onTP('attachments');
    // The link row is written DIRECTLY (task/notes-cross-workspace-attach): until that task the client door committed a
    // W2 note's link to a WS ticket for a person in both workspaces (the planner's write-door question, 09:54), and
    // production may still hold such rows. The door now refuses it (18.500), so the row a pre-fix link left is seeded
    // as the projection writes it (`insertAttachment`: the NOTE's workspace on the row); the note's attached ids are
    // read back from this table, so `proj_notes` needs nothing more.
    await db.pool.query(
      `INSERT INTO proj_note_attachments (note_id, ticket_id, workspace_id, attached_at, workspace_seq)
       VALUES ($1, $2, $3, '2026-10-06T10:00:00.000Z', 5)`,
      [away, world.TP, W2],
    );
    // No door files a ticket's attachment under another workspace (the upload route takes the TICKET's own workspace,
    // `routes/attachments.ts`), but no constraint forbids the row either, so it is written directly, as this file's others are.
    await db.pool.query(
      `INSERT INTO attachments (id, workspace_id, ticket_id, note_id, uploader_id, filename, mime, size, object_key)
       VALUES ($1, $2, $3, NULL, $4, 'b.pdf', 'application/pdf', 3, $5)`,
      [newUlid(), W2, world.TP, world.ids.author, `k/${newUlid()}`],
    );
    // CONTROL, same it: both rows exist and name TP, and W2's own Notes read lists the note on TP, so the counts below are the
    // workspace binds at work and not rows the world failed to write.
    expect(await onTP('proj_note_attachments')).toBe((linksBefore ?? 0) + 1);
    expect(await onTP('attachments')).toBe((filesBefore ?? 0) + 1);
    const effW2 = await resolveEffectiveRole(db.pool, world.ids.author, W2);
    expect((await listNotesForTicket(db.pool, effW2, world.ids.author, W2, world.TP)).map((note) => note.noteId)).toEqual([away]);
    // Here nobody counts either row: not the owner (who may read every note), not a member (the workspace-scope arm), not the
    // owner's list page, whose route binds its own workspace.
    expect((await pinsFor('owner')).get(world.TP)).toEqual({ notes: 4, attachments: 2 });
    expect((await pinsFor('memberIn')).get(world.TP)).toEqual({ notes: 2, attachments: 2 });
    expect((await pageFor('owner')).find((c) => c.ticketId === world.TP)?.pin).toEqual({ notes: 4, attachments: 2 });
    // Bound to W2 instead, the same TP counts exactly W2's note and W2's file: the binds pick the home workspace, they do not
    // drop the rows.
    expect([...(await pinCountsFor(db.pool, effW2, world.ids.author, W2, [world.TP])).entries()]).toEqual([
      [world.TP, { notes: 1, attachments: 1 }],
    ]);
  });
});
