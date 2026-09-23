import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid } from '@gisik-nokma/domain';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesIntoReadWorld, type ReadWorldNotes } from '../helpers/notes-fixture.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';

/**
 * A note's ledger, and the notes a device is handed at bootstrap (notes series,
 * Plan 2 of 6, spec §5.1; cases 18.073–18.075).
 *
 * ## What these two doors are FOR, because it decides what they must carry
 *
 * `GET /v1/notes/:noteId/events` is the pull a device makes when a
 * `reach-granted` notice names a note it does not hold. `/v1/sync/bootstrap` is
 * what a device gets when it has no cursor at all, or has one for a workspace
 * it is newly a member of. Between them they are the whole of "how a note
 * reaches a device", and they must agree — a device that pulled one note from
 * the route and the rest from the bootstrap folds one payload shape.
 *
 * ## Every negative carries its positive control
 *
 * A `404` and an absent array are both answers a broken handler gives for free.
 * So the non-reader's 404 sits beside the reader's 200 for the SAME note, and
 * "an unreadable note's events are absent" sits beside "a readable one's are
 * present" in the SAME bootstrap payload.
 *
 * ## The world is `buildReadTestApp`'s
 *
 * `seedNotesIntoReadWorld`'s docblock says why the author is the OWNER: so
 * `member` is a genuine non-reader of `nPrivate` rather than its author, which
 * is the only way the 404 in 18.073 is a statement about the predicate.
 */

let db: TestDatabase;
let world: ReadWorld;
let app: FastifyInstance;
let WS: string;
let N: ReadWorldNotes['NOTES'];

beforeAll(async () => {
  db = await createTestDatabase();
  world = await buildReadTestApp(db);
  app = world.app;
  WS = world.world.workspaceId;
  N = (
    await seedNotesIntoReadWorld(db.pool, {
      workspaceId: WS,
      projectId: world.world.projectId,
      authorId: world.userIds.owner,
      guestUserId: world.userIds.guest,
      TP: world.world.taskInEpicId,
      TE: world.world.guestTaskId,
    })
  ).NOTES;
});

afterAll(async () => {
  await db.drop();
});

async function get(
  headers: Record<string, string>,
  url: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url, headers });
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

/** One event view, with the fields these cases turn on. */
type EventView = { type: string; entity_id: string; seq: number; workspace_seq: number };

describe('a note ledger on the wire (Plan 2 of 6)', () => {
  it('18.073 the note events route returns the note ledger to a reader and 404 to a non-reader', async () => {
    const readable = await get(world.authOf('member'), `/v1/notes/${N.nWorkspace}/events`);
    expect(readable.statusCode).toBe(200);
    const events = readable.body.events as EventView[];
    // `nWorkspace` carries exactly one event, and the route answers with the
    // whole ledger rather than a filtered view of it.
    expect(events.map((e) => e.type)).toEqual(['note.created']);
    expect(events[0]?.entity_id).toBe(N.nWorkspace);

    // The same request for a note `member` may not read, and for an id nothing
    // was ever filed against. Same status, same body — an existence oracle
    // would be the difference between them, and this file's opening rule (and
    // its sibling routes') is that there is none.
    const unreadable = await get(world.authOf('member'), `/v1/notes/${N.nPrivate}/events`);
    const neverMinted = await get(world.authOf('member'), `/v1/notes/${newUlid()}/events`);
    expect(unreadable.statusCode).toBe(404);
    expect(neverMinted.statusCode).toBe(404);
    expect(unreadable.body).toEqual(neverMinted.body);

    // Control: the author reads `nPrivate` and gets its ledger, so the 404
    // above is the predicate refusing rather than the note having no events.
    const asAuthor = await get(world.authOf('owner'), `/v1/notes/${N.nPrivate}/events`);
    expect(asAuthor.statusCode).toBe(200);
    expect((asAuthor.body.events as EventView[]).map((e) => e.entity_id)).toEqual([N.nPrivate]);
  });

  it('18.074 the workspace bootstrap carries the readable notes and none of the unreadable ones', async () => {
    const { statusCode, body } = await get(world.authOf('member'), `/v1/sync/bootstrap?workspaceId=${WS}`);
    expect(statusCode).toBe(200);
    const notes = body.notes as { events: EventView[] } | undefined;
    expect(notes).toBeDefined();
    const noteIds = new Set((notes?.events ?? []).map((e) => e.entity_id));

    // Present: the workspace-scope note `member` reads.
    expect(noteIds.has(N.nWorkspace)).toBe(true);
    // Absent: the private one. `nInherit` is absent too — it hangs off `TE`,
    // which is explicit to the guest, so `member` reaches neither.
    expect(noteIds.has(N.nPrivate)).toBe(false);
    expect(noteIds.has(N.nInherit)).toBe(false);

    // Control: the SAME payload for the owner, who reads every note here. This
    // is what separates "the notes section is filtered" from "the section is
    // empty", which no assertion over `member` alone could do.
    const asOwner = await get(world.authOf('owner'), `/v1/sync/bootstrap?workspaceId=${WS}`);
    const ownerIds = new Set(((asOwner.body.notes as { events: EventView[] }).events).map((e) => e.entity_id));
    expect(ownerIds.has(N.nWorkspace)).toBe(true);
    expect(ownerIds.has(N.nPrivate)).toBe(true);
    expect(ownerIds.size).toBeGreaterThan(noteIds.size);
  });

  it('18.075 the note events route speaks the same dialect as the ticket events route', async () => {
    // Both routes are read by the same client parser, so what is compared is
    // the KEY SET of a row, not the values: the failure this catches is a
    // renamed or dropped column, which a value assertion cannot see.
    const noteRes = await get(world.authOf('owner'), `/v1/notes/${N.nWorkspace}/events`);
    const ticketRes = await get(
      world.authOf('owner'),
      `/v1/workspaces/${WS}/tickets/${world.world.taskInEpicId}/events`,
    );
    expect(noteRes.statusCode).toBe(200);
    expect(ticketRes.statusCode).toBe(200);
    const noteKeys = Object.keys((noteRes.body.events as EventView[])[0] ?? {}).sort();
    const ticketKeys = Object.keys((ticketRes.body.events as EventView[])[0] ?? {}).sort();
    expect(noteKeys.length).toBeGreaterThan(0);
    expect(noteKeys).toEqual(ticketKeys);
    // Named explicitly as well, because `toEqual` on two equally-wrong key sets
    // would pass and this is the column the mutation renames.
    expect(noteKeys).toContain('workspace_seq');

    // And the BOOTSTRAP's notes are the same shape as the route's, since a
    // device folds both with one parser.
    const boot = await get(world.authOf('owner'), `/v1/sync/bootstrap?workspaceId=${WS}`);
    const bootKeys = Object.keys(((boot.body.notes as { events: EventView[] }).events)[0] ?? {}).sort();
    expect(bootKeys).toEqual(noteKeys);
  });
});
