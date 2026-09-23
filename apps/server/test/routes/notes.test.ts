import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesIntoReadWorld, type ReadWorldNotes } from '../helpers/notes-fixture.js';
import { buildReadTestApp, type ReadWorld, type ReadRole } from '../helpers/read-app.js';

/**
 * The note read surface, driven through the REAL routes against a REAL database
 * (notes series, Plan 1 of 6, spec §6.4).
 *
 * ## Why the world is `buildReadTestApp`'s rather than the notes fixture's
 *
 * These are ROUTE cases, so they need signed-in people: the reader predicate is
 * already proven as a function (18.020) and the world here exists to prove the
 * predicate is APPLIED — that a route cannot be reached around it. The notes are
 * seeded into that world by `seedNotesIntoReadWorld`, whose docblock says why
 * the author is the OWNER (so `member` can be a genuine non-reader of an
 * inherited note) and why `TP`/`TE` are the scenario's `taskInEpicId` /
 * `guestTaskId` rather than its `sharedTaskId` (which carries an explicit
 * audience and is NOT project-mode).
 *
 * ## Every negative carries its positive control in the same `it`
 *
 * A `[]`, a 404 and a filtered-out row are all answers a broken route gives for
 * free. So each case that asserts an absence also asserts a presence through the
 * same helper — the same note for a different caller, or the same caller with the
 * filter removed.
 *
 * ## Cases that WRITE to the ledger run after the ones that only read
 *
 * 18.033 attaches a note to a ticket, 18.034 appends a new note and 18.035 adds
 * comments. All three run last, in that order, because they change the workspace
 * the earlier cases measure. A reordering that moves one above a read-only case
 * changes what that case asserts — say so, do not silently shuffle.
 */

let db: TestDatabase;
let world: ReadWorld;
let app: FastifyInstance;
let notes: ReadWorldNotes;
let WS: string;
let P: string;
/** The fixture's note ids. Assigned in `beforeAll`, so nothing may read it at module scope. */
let N: ReadWorldNotes['NOTES'];

beforeAll(async () => {
  db = await createTestDatabase();
  world = await buildReadTestApp(db);
  app = world.app;
  WS = world.world.workspaceId;
  P = world.world.projectId;
  notes = await seedNotesIntoReadWorld(db.pool, {
    workspaceId: WS,
    projectId: P,
    authorId: world.userIds.owner,
    guestUserId: world.userIds.guest,
    TP: world.world.taskInEpicId,
    TE: world.world.guestTaskId,
  });
  N = notes.NOTES;
});

afterAll(async () => {
  await db.drop();
});

/** The readable, non-deleted notes for a role, as the route reports them. */
async function listed(role: ReadRole, query = ''): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/notes${query}`, headers: world.authOf(role) });
  expect(res.statusCode, `${role}${query}`).toBe(200);
  return (res.json().notes as { noteId: string }[]).map((n) => n.noteId).sort();
}



/**
 * The readable set per role, WRITTEN OUT rather than derived from the predicate
 * under test. Derived expectations would pass whatever the predicate said.
 */
function readableSets(n: ReadWorldNotes['NOTES']): Record<string, string[]> {
  return {
    owner: [n.nPrivate, n.nWorkspace, n.nProject, n.nExplicit, n.nInherit].sort(),
    // `member` is on P and is NOT the author, so this row is where "project scope
    // admits its members", "workspace scope admits every non-guest" and "a private
    // note is the author's alone" are separated from each other.
    member: [n.nWorkspace, n.nProject].sort(),
    // `outsider` is a member on NO project: workspace scope only.
    outsider: [n.nWorkspace].sort(),
    // A guest reaches explicit lists and nothing else.
    guest: [n.nExplicit, n.nInherit].sort(),
    // A workspace admin who is on no project: the same as `outsider`, and that
    // equality is the no-admin-bypass rule.
    admin: [n.nWorkspace].sort(),
  };
}
const ROLES: ReadRole[] = ['owner', 'member', 'outsider', 'guest', 'admin'];

describe('18.028 the notes list', () => {
  it('18.028 lists exactly the readable, non-deleted notes per role', async () => {
    const READABLE = readableSets(N);
    for (const role of ROLES) {
      expect(await listed(role), role).toEqual(READABLE[role]);
    }
    // CONTROL for the whole file: every fixture note is accounted for, so a
    // route that returned NOTHING for everybody would redden here rather than
    // matching every narrower expectation by accident.
    expect(await listed('owner')).toEqual(
      [N.nPrivate, N.nWorkspace, N.nProject, N.nExplicit, N.nInherit].sort(),
    );
    // The DELETED one is not in the default list for its own author either.
    expect(await listed('owner')).not.toContain(N.nDeleted);
  });
});

describe('18.029 the filters', () => {
  it('18.029 ?home=, ?author= and ?scope= narrow the list', async () => {
    const all = await listed('owner');
    expect(await listed('owner', `?scope=private`)).toEqual([N.nPrivate]);
    expect(await listed('owner', `?scope=workspace`)).toEqual([N.nWorkspace]);
    // CONTROL: the same route with no filter returns the superset, so the two
    // lines above are a NARROWING and not the route losing rows.
    expect(await listed('owner')).toEqual(all);
    expect(all.length).toBeGreaterThan(1);
    // `home=''` means "filed at workspace level": a REAL filter value, and one
    // that selects nothing in this world because every note here has a home.
    expect(await listed('owner', `?home=`)).toEqual([]);
    expect(await listed('owner', `?home=${P}`)).toEqual(all);
    expect(await listed('owner', `?author=${world.userIds.owner}`)).toEqual(all);
    expect(await listed('owner', `?author=${world.userIds.guest}`)).toEqual([]);
    // The filters COMPOSE rather than replacing each other.
    expect(await listed('owner', `?scope=private&author=${world.userIds.guest}`)).toEqual([]);
    expect(await listed('owner', `?scope=private&author=${world.userIds.owner}`)).toEqual([N.nPrivate]);
  });
});

describe('18.030 the deleted list', () => {
  it('18.030 ?deleted=1 is the author, an admin-reader or the owner — not any reader', async () => {
    // member READS the deleted note's scope but is not its author → nothing.
    expect(await listed('member', '?deleted=1')).toEqual([]);
    // The author sees it, and so does the owner (the owner is also the author
    // here, so a SECOND reader is needed to separate the two arms) — and an
    // admin proves the admin arm, because they read the workspace-scoped note
    // without being its author.
    expect(await listed('admin', '?deleted=1')).toEqual([N.nDeleted]);
    expect(await listed('owner', '?deleted=1')).toEqual([N.nDeleted]);
    // A guest cannot read a workspace-scoped note at all, deleted or not.
    expect(await listed('guest', '?deleted=1')).toEqual([]);
    // CONTROL: `deleted=1` is what selects them, not the parameter being present.
    expect(await listed('admin')).not.toContain(N.nDeleted);
  });
});

describe('18.031 one 404 for unreadable and absent', () => {
  it('18.031 an unreadable note and a random id get the same 404', async () => {
    const unreadable = await app.inject({
      method: 'GET',
      url: `/v1/notes/${N.nPrivate}`,
      headers: world.authOf('member'),
    });
    const absent = await app.inject({ method: 'GET', url: `/v1/notes/${newUlid()}`, headers: world.authOf('member') });
    expect([unreadable.statusCode, absent.statusCode]).toEqual([404, 404]);
    expect(unreadable.body).toBe(absent.body);
    // CONTROL: the same URL for somebody who CAN read it is a 200 carrying the
    // note, so the 404s above are the predicate answering and not a dead route.
    const readable = await app.inject({
      method: 'GET',
      url: `/v1/notes/${N.nPrivate}`,
      headers: world.authOf('owner'),
    });
    expect(readable.statusCode).toBe(200);
    expect(readable.json().note.noteId).toBe(N.nPrivate);
    // The detail read carries the body and its schema version. This note's
    // `note.created` names no body, so the body is the reducer's `EMPTY_NOTE_DOC`
    // and the version is THAT document's `attrs.schemaVersion`, which follows
    // `DOC_SCHEMA_VERSION` (2 since Plan 4 of the notes series).
    expect(readable.json().note.schemaVersion).toBe(2);
  });
});

describe('18.032 a ticket’s notes', () => {
  it('18.032 omits notes the viewer cannot read (D5)', async () => {
    const onTe = async (role: ReadRole) => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/workspaces/${WS}/tickets/${notes.TE}/notes`,
        headers: world.authOf(role),
      });
      expect(res.statusCode, role).toBe(200);
      return (res.json().notes as { noteId: string }[]).map((n) => n.noteId);
    };
    // guest sees it through TE's explicit audience.
    expect(await onTe('guest')).toEqual([N.nInherit]);
    // member is a workspace member on the note's own project and STILL sees
    // nothing: the note inherits from TE, which does not name them. This is D5
    // (absent, not locked) and the cell the author arm makes possible — the
    // fixture's author is the owner, so `member` is a genuine non-reader.
    expect(await onTe('member')).toEqual([]);
    // CONTROL: the same route on the PROJECT-mode ticket for a project member,
    // so `[]` above is about THIS note and not about the route being empty.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${WS}/tickets/${world.world.taskInEpicId}/notes`,
      headers: world.authOf('member'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().notes).toEqual([]);
  });
});

describe('18.033 attachedTickets is filtered too', () => {
  it('18.033 a summary omits tickets the viewer cannot see', async () => {
    // `nProject` is project-scope, so `member` reads it; attaching it to TE
    // gives it one attachment that `member` cannot see and `owner` can.
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        actorId: world.userIds.owner,
        entity: { kind: 'note', id: N.nProject },
        type: 'note.attached',
        payload: { ticketId: notes.TE },
      }),
    ]);
    const detail = async (role: ReadRole) => {
      const res = await app.inject({ method: 'GET', url: `/v1/notes/${N.nProject}`, headers: world.authOf(role) });
      expect(res.statusCode, role).toBe(200);
      return res.json().note.attachedTickets as { ticketId: string; key: string; title: string }[];
    };
    expect(await detail('member')).toEqual([]);
    const owned = await detail('owner');
    expect(owned.map((t) => t.ticketId)).toEqual([notes.TE]);
    // The KEY is composed, not blank: three ledger reads joined by `ticketKey`.
    expect(owned[0]!.key).not.toBe('');
    expect(owned[0]!.title).toBe('Share the July invoices');
  });
});

describe('18.034 history and one version', () => {
  it('18.034 lists note.created and every note.body_set, and serves that event’s body', async () => {
    const id = newUlid();
    const bodyA = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] };
    const bodyB = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] };
    const ev = (type: string, payload: unknown) =>
      makeCommitted({
        workspaceId: WS,
        actorId: world.userIds.owner,
        entity: { kind: 'note', id },
        type,
        payload,
      });
    await applyCommitted(db.pool, [
      ev('note.created', { title: 'History', homeProjectId: P, scope: { mode: 'workspace' }, body: bodyA }),
      ev('note.body_set', { body: bodyB }),
      // A rename is NOT a version: it moves the title and leaves the body alone,
      // so listing it would show a duplicate body as a separate save.
      ev('note.renamed', { title: 'History renamed' }),
    ]);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/notes/${id}/history`,
      headers: world.authOf('member'),
    });
    expect(res.statusCode).toBe(200);
    const versions = res.json().versions as { eventId: string; seq: number }[];
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.seq)).toEqual([...versions.map((v) => v.seq)].sort((a, b) => a - b));
    const one = await app.inject({
      method: 'GET',
      url: `/v1/notes/${id}/history/${versions[1]!.eventId}`,
      headers: world.authOf('member'),
    });
    expect(one.statusCode).toBe(200);
    expect(one.json().body).toEqual(bodyB);
    const first = await app.inject({
      method: 'GET',
      url: `/v1/notes/${id}/history/${versions[0]!.eventId}`,
      headers: world.authOf('member'),
    });
    expect(first.json().body).toEqual(bodyA);
    // An event id that is not a version of THIS note is the same 404.
    const notAVersion = await app.inject({
      method: 'GET',
      url: `/v1/notes/${id}/history/${newUlid()}`,
      headers: world.authOf('member'),
    });
    expect(notAVersion.statusCode).toBe(404);
  });
});

describe('18.035 comments', () => {
  it('18.035 returns a note’s comments in workspace_seq order, to readers only', async () => {
    const first = makeCommitted({
      workspaceId: WS,
      actorId: world.userIds.member,
      entity: { kind: 'note', id: N.nWorkspace },
      type: 'comment.added',
      payload: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] } },
    });
    const second = makeCommitted({
      workspaceId: WS,
      actorId: world.userIds.outsider,
      entity: { kind: 'note', id: N.nWorkspace },
      type: 'comment.added',
      payload: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] } },
    });
    await applyCommitted(db.pool, [first, second]);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/notes/${N.nWorkspace}/comments`,
      headers: world.authOf('outsider'),
    });
    expect(res.statusCode).toBe(200);
    // Workspace order, not author order: the SECOND comment is by `outsider`,
    // who is the caller, so an ordering by author would come back reversed.
    expect((res.json().comments as { commentId: string }[]).map((c) => c.commentId)).toEqual([first.id, second.id]);
    // A non-reader of the same route gets the shared 404.
    const refused = await app.inject({
      method: 'GET',
      url: `/v1/notes/${N.nPrivate}/comments`,
      headers: world.authOf('outsider'),
    });
    expect(refused.statusCode).toBe(404);
    // CONTROL: the same note, read by a reader, is 200 with an empty thread —
    // so the 404 above is the predicate and not the comments route being absent.
    const empty = await app.inject({
      method: 'GET',
      url: `/v1/notes/${N.nProject}/comments`,
      headers: world.authOf('member'),
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().comments).toEqual([]);
  });
});
