import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid } from '@gisik-nokma/domain';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesIntoReadWorld, type ReadWorldNotes } from '../helpers/notes-fixture.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';

/**
 * `POST /v1/sync/reconcile` — the NOTE half of the narrowing door (notes
 * series, Plan 2 of 6, spec §5.1; cases 18.070–18.072).
 *
 * ## Why narrowing for notes is client-driven here, restated where it is measured
 *
 * Plan 2's header records the deviation from spec §5.1's "else if
 * `isNoteRevokeTrigger` → yield purge": this repo emits no server-initiated
 * per-entity purge (the removed walk is recorded inside
 * `visible-events-for.ts`'s ticket branch, case 6.101, ruling P23). Notes
 * therefore reach a device with a stale copy through exactly the door tickets
 * use — the client presents what it holds and the server answers only about
 * what was presented — and this file is what proves the door answers for NOTES.
 *
 * The property being bought is the one spec §5.1 wants: *a device holds no note
 * its user cannot read.* It is bought by the client calling this route on every
 * catch-up, not by the server pushing anything.
 *
 * ## The world is `buildReadTestApp`'s, and the notes are seeded into it
 *
 * `seedNotesIntoReadWorld`'s docblock says why: the notes have to land in the
 * world the signed-in roles belong to, or every case would answer for the wrong
 * reason, and the author has to be the OWNER so that `member` is a genuine
 * non-reader of `nPrivate` rather than its author (the author arm admits the
 * author whatever the scope).
 *
 * ## Every negative carries its positive control in the SAME request
 *
 * The two arms of this endpoint are answered from one body, so a control placed
 * in the same request is a control over the same code path — and it is the only
 * shape that can tell "notes are answered" from "notes are always restricted".
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

/** A ticket `member` may see — the control arm's id, so `restricted` stays empty. */
const KEPT_TICKET = (): string => world.world.taskInEpicId;
/** A ticket `member` may NOT see — `explicit [owner]` in the read scenario. */
const LOST_TICKET = (): string => world.world.hiddenTaskId;

async function reconcile(
  headers: Record<string, string>,
  body: { heldIds: string[]; heldNoteIds?: string[] },
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/sync/reconcile',
    headers,
    payload: { workspaceId: WS, ...body },
  });
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

describe('POST /v1/sync/reconcile — the note ids a device holds (Plan 2 of 6)', () => {
  it('18.070 heldNoteIds are answered by canReadNoteById', async () => {
    const { statusCode, body } = await reconcile(world.authOf('member'), {
      heldIds: [LOST_TICKET()],
      heldNoteIds: [N.nPrivate, N.nWorkspace],
    });
    expect(statusCode).toBe(200);
    // Exact, both arms, one request: the ticket arm still answers tickets (the
    // control the case names) and the note arm answers ONLY the note `member`
    // may not read. `nWorkspace` must not appear, and there must be nothing
    // else — a `toContainEqual` would pass on an answer that restricted both,
    // which is the answer that wipes a device's notes.
    expect(body).toEqual({
      workspaceId: WS,
      restricted: [{ kind: 'restricted', id: LOST_TICKET() }],
      restrictedNotes: [{ kind: 'restricted', id: N.nPrivate }],
    });

    // The reader who may read both, same two note ids: an empty answer. This is
    // what separates "the predicate was asked" from "notes are restricted by
    // construction", and it is the arm a `canSee`-based implementation cannot
    // produce for ANY caller.
    const asOwner = await reconcile(world.authOf('owner'), {
      heldIds: [KEPT_TICKET()],
      heldNoteIds: [N.nPrivate, N.nWorkspace],
    });
    expect(asOwner.body).toEqual({ workspaceId: WS, restricted: [], restrictedNotes: [] });
  });

  it('18.071 an unknown note id is restricted', async () => {
    const neverMinted = newUlid();
    const fabricated = await reconcile(world.authOf('member'), {
      heldIds: [KEPT_TICKET()],
      heldNoteIds: [neverMinted],
    });
    const genuine = await reconcile(world.authOf('member'), {
      heldIds: [KEPT_TICKET()],
      heldNoteIds: [N.nPrivate],
    });
    expect(fabricated.statusCode).toBe(genuine.statusCode);
    // The two answers differ ONLY in the id echoed back, which is the id the
    // caller typed: substituting one for the other makes them identical, so the
    // response carries no bit distinguishing "you lost it" from "it never was".
    // `canReadNoteById` answers false for an unknown id by design — the same
    // sentence `canSee` states for tickets and the reason 12.286 exists.
    expect(JSON.stringify(fabricated.body).split(neverMinted).join(N.nPrivate)).toBe(
      JSON.stringify(genuine.body),
    );

    // Mixed and repeated, on the note arm alone: ordering is the caller's, both
    // are named, and a repeated id is answered once so the answer's LENGTH is
    // not a second channel.
    const mixed = await reconcile(world.authOf('member'), {
      heldIds: [KEPT_TICKET()],
      heldNoteIds: [neverMinted, N.nWorkspace, N.nPrivate],
    });
    expect(mixed.body.restrictedNotes).toEqual([
      { kind: 'restricted', id: neverMinted },
      { kind: 'restricted', id: N.nPrivate },
    ]);
    const repeated = await reconcile(world.authOf('member'), {
      heldIds: [KEPT_TICKET()],
      heldNoteIds: [N.nPrivate, N.nPrivate],
    });
    expect(repeated.body.restrictedNotes).toEqual([{ kind: 'restricted', id: N.nPrivate }]);
  });

  it('18.072 a body without heldNoteIds is still valid and returns restrictedNotes: []', async () => {
    // An OLD CLIENT — one that predates notes and names only tickets — must not
    // start failing. `heldNoteIds` is declared and not required, which is why
    // this is a compatibility case rather than a schema nicety.
    const { statusCode, body } = await reconcile(world.authOf('member'), {
      heldIds: [KEPT_TICKET()],
    });
    expect(statusCode).toBe(200);
    expect(body).toEqual({ workspaceId: WS, restricted: [], restrictedNotes: [] });

    // Control: in the same absence-of-notes shape the ticket arm still answers
    // exactly as it always did, so `restrictedNotes: []` is a note-arm answer
    // rather than a door that has stopped answering anything.
    const lost = await reconcile(world.authOf('member'), { heldIds: [LOST_TICKET()] });
    expect(lost.statusCode).toBe(200);
    expect(lost.body).toEqual({
      workspaceId: WS,
      restricted: [{ kind: 'restricted', id: LOST_TICKET() }],
      restrictedNotes: [],
    });
  });
});
