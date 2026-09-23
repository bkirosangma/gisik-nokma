import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, plainTextToDoc } from '@gisik-nokma/domain';
import {
  createHttpTransport,
  createOutbox,
  createReplica,
  createSyncEngine,
  type Replica,
  type SyncEngine,
  type WebSocketLike,
} from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesIntoReadWorld, type ReadWorldNotes } from '../helpers/notes-fixture.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';

/**
 * THE SEAM THE BRANCH NEVER RAN: the engine, the REAL HTTP transport and the
 * REAL routes, wired to each other (notes series, Plan 2 of 6; cases 18.098–18.099).
 *
 * ## Why a third harness was needed after three already existed
 *
 * Every other note case stops one door short of this seam:
 *
 * - `packages/sync-client/test/sync-engine-notes.test.ts` hands the engine
 *   pre-built `SyncItem`s through a fake transport, so it proves what the
 *   engine does with a notice and nothing about whether a notice ever ARRIVES
 *   in that shape;
 * - `test/sync/reconcile-notes.test.ts` drives the route with `app.inject` and
 *   a hand-written body, so it proves the route and nothing about the body the
 *   CLIENT sends;
 * - the dual-client rig calls `reconcileHeldIds` / `reconcileHeldNoteIds`
 *   directly and its `openStream` throws, so it bypasses the HTTP shell, the
 *   body schema and the frame ladder entirely — a gap its own docblock names.
 *
 * **A whole-branch review found two defects living in exactly this gap, and a
 * green suite could not see either**: the transport's `reach-granted` arm read
 * `frame.tickets`, returned early on an empty list, and read `frame.notes`
 * nowhere — so a note-only widening was dropped whole; and the engine's note
 * arm of reconcile sent `heldIds: []`, which the route's own body schema
 * refuses with a 400 that the automatic caller swallows. This file is the
 * witness for both, and it runs the SHIPPED client against the SHIPPED server
 * rather than a restatement of either.
 */

let db: TestDatabase;
let world: ReadWorld;
let WS: string;
let N: ReadWorldNotes['NOTES'];

type DrivableSocket = WebSocketLike & { sent: string[]; deliver: (frame: unknown) => void };

function drivableSocket(): DrivableSocket {
  const socket: DrivableSocket = {
    sent: [],
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    deliver(frame) {
      socket.onmessage?.({ data: JSON.stringify(frame) });
    },
    send(data: string) {
      socket.sent.push(data);
    },
    close() {
      // The transport's close path is not what this file measures.
    },
  };
  return socket;
}

beforeAll(async () => {
  db = await createTestDatabase();
  world = await buildReadTestApp(db);
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
  for (const e of engines.splice(0)) e.stop();
  await db.drop();
});

const engines: SyncEngine[] = [];

/**
 * An engine on the SHIPPED transport, pointed at the real app.
 *
 * `fetchImpl` bridges to `app.inject`, which is the real route pipeline —
 * fastify's body schema included. That is the whole point: one of the two
 * defects was a SCHEMA refusal, and no test that bypassed `inject` could see
 * it.
 */
async function engineOnRealRoutes(role: 'member' | 'owner' = 'member'): Promise<{
  engine: SyncEngine;
  replica: Replica;
  socket: DrivableSocket;
}> {
  const storage = createBetterSqliteStorage(':memory:');
  const replica = await createReplica({ storage });
  const socket = drivableSocket();
  const transport = createHttpTransport({
    baseUrl: 'http://test.invalid',
    token: world.tokens[role],
    fetchImpl: async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : String(input));
      const res = await world.app.inject({
        method: (init?.method ?? 'GET') as 'GET' | 'POST',
        url: `${url.pathname}${url.search}`,
        headers: (init?.headers ?? {}) as Record<string, string>,
        ...(init?.body === undefined ? {} : { payload: JSON.parse(String(init.body)) }),
      });
      return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } });
    },
    webSocketFactory: () => socket,
  });
  const engine = createSyncEngine({ replica, outbox: createOutbox({ storage, replica }), transport });
  engines.push(engine);
  await engine.start(WS);
  await engine.settled();
  return { engine, replica, socket };
}

describe('the client seam: the shipped transport against the shipped routes', () => {
  it('18.098 a note-only reach-granted frame survives the transport frame ladder', async () => {
    // The frame the server actually emits for a note widening
    // (`visible-events-for.ts` yields `tickets: []` beside `notes`), delivered
    // through the transport's own `onmessage` so the frame LADDER is what is
    // under test — not a `SyncItem` handed straight to the engine.
    //
    // THE OBSERVER IS `onItem`, and NOT the replica's pending set. The pending
    // set was the first shape tried here and it is the wrong witness: a notice
    // is followed immediately by a drain (`applyOne` drains after every
    // `reach-granted`), the pull for a note this reader cannot see answers 404,
    // and ruling P37.3 DROPS the entry on an unchanged 404 — correctly. So an
    // empty pending set means "the ladder worked and the pull was refused",
    // which is indistinguishable from "the ladder dropped the frame". `onItem`
    // is the only door that shows the item itself.
    const { engine, socket } = await engineOnRealRoutes();
    const items: unknown[] = [];
    const off = engine.onItem((item) => items.push(item));
    const noteId = newUlid();

    socket.deliver({
      type: 'reach-granted',
      workspaceId: WS,
      tickets: [],
      notes: [{ id: noteId, headSeq: 1 }],
    });
    await engine.settled();
    off();

    // EXACTLY the frame's own content, with the ticket arm empty rather than
    // absent — the shape `visible-events-for.ts` yields and `stream/hub.ts`
    // forwards. The old ladder produced NO item here at all.
    expect(items).toEqual([
      { kind: 'reach-granted', workspaceId: WS, tickets: [], notes: [{ id: noteId, headSeq: 1 }] },
    ]);
    // And the device is not stalled by the pair the server sends next: the
    // notice was acted on, so the note's own event is not the first thing this
    // replica sees for that note.
    expect(engine.lastApplyFailure()).toBeNull();
  });

  it('18.099 the engine’s note reconcile is accepted by the route, and purges', async () => {
    // The engine's OWN request, through the real body schema. A device holding
    // notes and no tickets sends `heldIds: []`, and the route refuses an empty
    // `heldIds` — so the 400 is swallowed by the automatic caller and the note
    // survives on the device for ever.
    //
    // The note's id is one the SERVER does not know, and that is deliberate
    // rather than convenient: the route consults no existence
    // (`reconcile-route.ts`'s whole safety argument), so an unknown id and a
    // genuinely narrowed one get the SAME answer. A purge is what a 200
    // produces and a 400 does not, which is the whole assertion.
    const { engine, replica } = await engineOnRealRoutes('member');
    const noteId = newUlid();
    await replica.loadNoteEvents([
      {
        id: newUlid(),
        workspaceId: WS,
        entity: { kind: 'note', id: noteId },
        type: 'note.created',
        version: 1,
        payload: { title: 'Held', homeProjectId: world.world.projectId, scope: { mode: 'workspace' } },
        actorId: world.userIds.owner,
        origin: 'web',
        clientTime: '2026-08-20T09:00:00.000Z',
        serverTime: '2026-08-20T09:00:01.000Z',
        seq: 1,
        workspaceSeq: 9_000,
      },
    ]);
    // The precondition, asserted rather than assumed: without it the purge
    // below would pass against a replica that never held the note.
    expect(await replica.getNote(noteId)).not.toBeNull();

    await engine.reconcile(WS);

    expect(await replica.getNote(noteId)).toBeNull();
    expect(await replica.listEntityEvents(noteId, 'note')).toEqual([]);
  });

  it('18.099 the control: a note the server ADMITS survives the same reconcile', async () => {
    // One field apart from the case above, and it is what makes that purge a
    // statement about the server's ANSWER rather than about reconcile deleting
    // whatever it is handed. `nWorkspace` is a real server-side note the member
    // may read, and it reaches this replica through the workspace bootstrap —
    // so this case also witnesses Task 4's `notes` section and Task 8's fold,
    // end to end, which nothing else runs.
    const { engine, replica } = await engineOnRealRoutes('member');
    expect(await replica.getNote(N.nWorkspace)).not.toBeNull();

    await engine.reconcile(WS);

    // NOT restricted, so nothing was purged.
    expect(await replica.getNote(N.nWorkspace)).not.toBeNull();
    expect(await replica.getNote(N.nPrivate)).toBeNull();
  });
});
