import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable.js';
import { createStreamHub } from '../../src/stream/hub.js';
import {
  visibleEventsFor,
  type ReachGrantedInstruction,
  type SyncItem,
} from '../../src/visibility/visible-events-for.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';
import { fakeSocket } from '../helpers/stream-socket.js';

/**
 * The note stream (notes series, Plan 2 of 6, spec §5.1; cases 18.061–18.066).
 *
 * ## What this file is the only witness for
 *
 * `audienceClassOf` returned `'withheld'` for `'note'` until this plan, by
 * decision — Plan 1 shipped no replica table, so every note event streamed
 * before Plan 2 landed would have reached a client that cannot fold it. The
 * consequence is that the note class has NO other runtime witness anywhere:
 * `visible-events-for.test.ts` never seeds a note, and the reads that Plan 1
 * built (`GET /v1/notes/:id`, the list, the ticket's notes) go through the
 * tables, not the filter. A wrong arm here is invisible to every other suite in
 * the repository, which is why each case below pairs its exclusion with a
 * positive control in the same `it`.
 *
 * ## One fixture, seeded once
 *
 * `seedNotesFixture` refuses a second call in one process and truncating
 * `proj_notes` between cases would break the fixture's own world, so the file
 * seeds once in `beforeAll` and every case appends to it with `makeCommitted` +
 * `applyCommitted` — the same two helpers the fixture uses, against the same
 * process-local counters, so a minted `workspaceSeq` continues the fixture's
 * sequence exactly as ingest would.
 *
 * **Cases therefore append rather than isolate, and two consequences follow.**
 * A case that drains from 0 sees every earlier case's events (harmless: each
 * asserts about a note id no earlier case named), and a case that CHANGES an
 * existing note's audience must run after every case that depends on the old
 * audience. 18.063 widens `nPrivate` to `workspace`, which is why 18.062 —
 * whose whole assertion is that `memberIn` may NOT read `nPrivate` — is
 * declared above it, and why 18.066 mints its own private note instead of
 * reusing `nPrivate`: by the time it runs, `nPrivate` is a workspace note and
 * would no longer be the non-reader's note the case is about.
 *
 * ## The author is not a witness for the reader rule
 *
 * `author` reads every note whatever its scope (spec §4.1), so a case
 * asserting only about `author` would pass against a filter with no visibility
 * check at all. Every tier below is asserted for a NON-author reader, with the
 * author's copy as the control that the events exist.
 */

let db: TestDatabase;
let world: NotesFixture;

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedNotesFixture(db.pool);
});

afterAll(async () => {
  await db.drop();
});

async function drain(userId: string, afterSeq = 0): Promise<SyncItem[]> {
  const items: SyncItem[] = [];
  for await (const item of visibleEventsFor(db.pool, userId, world.WS, afterSeq)) {
    items.push(item);
  }
  return items;
}

const eventsOf = (items: SyncItem[], noteId: string): LedgerEvent[] =>
  items.filter(
    (i): i is LedgerEvent => !('kind' in i) && i.entity.kind === 'note' && i.entity.id === noteId,
  );

const notices = (items: SyncItem[]): ReachGrantedInstruction[] =>
  items.filter((i) => 'kind' in i && i.kind === 'reach-granted') as ReachGrantedInstruction[];

/** The workspace cursor — the highest `workspace_seq` the ledger holds for `world.WS`. */
async function workspaceHead(): Promise<number> {
  const { rows } = await db.pool.query<{ head: string | null }>(
    'SELECT MAX(workspace_seq) AS head FROM events WHERE workspace_id = $1',
    [world.WS],
  );
  return Number(rows[0]?.head ?? 0);
}

function noteEvent(noteId: string, type: string, payload: unknown): LedgerEvent {
  return makeCommitted({
    workspaceId: world.WS,
    actorId: world.ids.author,
    entity: { kind: 'note', id: noteId },
    type,
    payload,
  });
}

function ticketEvent(ticketId: string, type: string, payload: unknown): LedgerEvent {
  return makeCommitted({
    workspaceId: world.WS,
    actorId: world.ids.owner,
    entity: { kind: 'ticket', id: ticketId },
    type,
    payload,
  });
}

describe('visibleEventsFor — the note audience class', () => {
  it('18.061 a note event is yielded, and the invite class is still admin-only (control)', async () => {
    // The CLASS is not exported, so the first witness is the build: adding
    // `'note'` to `AudienceClass` without the arm is TS2366, and that is the
    // guard the plan's Global Constraints name. What is asserted here is the
    // runtime consequence — a `withheld` class yields nothing — beside the
    // control the case names, which is the one class whose answer this change
    // must not have disturbed.
    const inviteId = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: world.WS,
        actorId: world.ids.owner,
        entity: { kind: 'invite', id: inviteId },
        type: 'invite.sent',
        payload: { inviteId, address: 'accountant@example.com', channel: 'email', role: 'member' },
      }),
    ]);

    const countInvites = (items: SyncItem[]): number =>
      items.filter((i) => !('kind' in i) && i.entity.kind === 'invite' && i.entity.id === inviteId)
        .length;

    const memberItems = await drain(world.ids.memberIn);
    const ownerItems = await drain(world.ids.owner);

    // Control: `'invite'` still resolves to `'admin'` — a plain member gets
    // nothing, an owner gets the event. Read as a pair, because "the member got
    // nothing" is equally true of a drain that is broken outright.
    expect(countInvites(memberItems)).toBe(0);
    expect(countInvites(ownerItems)).toBe(1);

    // The note arm: the fixture's workspace note is IN the stream. Under the
    // pre-Plan-2 `'withheld'` answer this is 0, which is the mutation.
    expect(eventsOf(memberItems, world.NOTES.nWorkspace).length).toBeGreaterThan(0);
  });

  it('18.062 a note event reaches a reader and not a non-reader', async () => {
    const memberItems = await drain(world.ids.memberIn);
    expect(eventsOf(memberItems, world.NOTES.nWorkspace).length).toBeGreaterThan(0);
    expect(eventsOf(memberItems, world.NOTES.nPrivate).length).toBe(0);

    // Control: the same events ARE in the stream for somebody — the author of
    // every note in this fixture reads `nPrivate` whatever its scope. Without
    // this, "memberIn did not get it" would pass against `yield* []`.
    const authorItems = await drain(world.ids.author);
    expect(eventsOf(authorItems, world.NOTES.nPrivate).length).toBeGreaterThan(0);
  });

  it('18.063 a widening trigger precedes its event with a reach-granted notice carrying notes', async () => {
    // `nPrivate`'s head BELOW the cursor, read from the stream rather than from
    // the query the implementation uses — a fixture that derived the expected
    // number with the same SQL the code runs would agree with any wrong answer
    // the SQL gives. `author` is the reader the note is unambiguously visible
    // to before the widening.
    const preItems = await drain(world.ids.author);
    const headBelow = Math.max(
      ...eventsOf(preItems, world.NOTES.nPrivate).map((e) => e.workspaceSeq),
    );
    expect(headBelow).toBeGreaterThan(0);

    const before = await workspaceHead();
    const widened = noteEvent(world.NOTES.nPrivate, 'note.scope_set', { mode: 'workspace' });
    await applyCommitted(db.pool, [widened]);

    const items = await drain(world.ids.memberIn, before);
    const found = notices(items);
    expect(found).toHaveLength(1);
    expect(found[0]!.notes).toEqual([{ id: world.NOTES.nPrivate, headSeq: headBelow }]);
    // `tickets` is carried and empty: a notice about notes names no ticket, and
    // the frame's shape is the same one the ticket notices use.
    expect(found[0]!.tickets).toEqual([]);

    // Before, not after. A notice that arrives with (or behind) its trigger is
    // one a client cannot act on ahead of the event that made it necessary.
    const envIndex = items.findIndex((i) => !('kind' in i) && i.id === widened.id);
    expect(envIndex).toBeGreaterThan(0);
    expect(items.indexOf(found[0]!)).toBe(envIndex - 1);

    // Control: a note event that is NOT in `NOTE_GRANT_TRIGGERS` yields no
    // notice — and the event itself still arrives, which is what separates "no
    // notice" from "this drain is empty".
    const before2 = await workspaceHead();
    const renamed = noteEvent(world.NOTES.nWorkspace, 'note.renamed', { title: 'Workspace, renamed' });
    await applyCommitted(db.pool, [renamed]);
    const items2 = await drain(world.ids.memberIn, before2);
    expect(notices(items2)).toHaveLength(0);
    expect(eventsOf(items2, world.NOTES.nWorkspace)).toHaveLength(1);
  });

  it('18.064 the notice is emitted once per drain', async () => {
    // Two triggers on ONE note inside one range. The `backfilled` set is what
    // holds this: without it the client is told twice to pull one note, and the
    // second pull re-fetches what the first already delivered.
    const before = await workspaceHead();
    await applyCommitted(db.pool, [
      noteEvent(world.NOTES.nWorkspace, 'note.attached', { ticketId: world.TP }),
      noteEvent(world.NOTES.nWorkspace, 'note.attached', { ticketId: world.TE }),
    ]);

    const items = await drain(world.ids.memberIn, before);
    expect(notices(items)).toHaveLength(1);
    expect(notices(items)[0]!.notes?.map((n) => n.id)).toEqual([world.NOTES.nWorkspace]);
    // Control: both events are in the range being drained, so one notice is a
    // statement about the ledger rather than about an empty window.
    expect(eventsOf(items, world.NOTES.nWorkspace)).toHaveLength(2);
  });

  it('18.065 the hub forwards notes on the reach-granted frame unchanged', async () => {
    // The hub is the only door a notice reaches a socket through, and it is a
    // hand-written translation of the instruction — a field added to the
    // instruction and not added here is dropped in silence.
    const workspaceId = newUlid();
    const noteId = newUlid();
    const instruction: SyncItem = {
      kind: 'reach-granted',
      workspaceId,
      tickets: [],
      notes: [{ id: noteId, headSeq: 7 }],
    };
    const poisonedPool = {
      query() {
        throw new Error('the hub queried the pool directly; visibleEvents owns every read');
      },
    } as unknown as Queryable;
    const hub = createStreamHub({
      pool: poisonedPool,
      onEventCommitted: () => () => {},
      visibleEvents: async function* scripted(): AsyncGenerator<SyncItem> {
        yield instruction;
      },
    });
    const socket = fakeSocket();
    await hub.subscribe(newUlid(), socket, workspaceId, 0);
    await hub.settled();

    const frame = socket.frames.find((f) => f.type === 'reach-granted');
    expect(frame).toEqual({
      type: 'reach-granted',
      workspaceId,
      tickets: [],
      notes: [{ id: noteId, headSeq: 7 }],
    });
  });

  it('18.066 a comment filed against a note follows the note audience, not the ticket rule', async () => {
    // Its OWN private note, not `nPrivate`: 18.063 above widened that one to
    // `workspace`, so by the time this runs it is a note `memberIn` MAY read and
    // the case would assert nothing.
    const noteId = newUlid();
    const before = await workspaceHead();
    await applyCommitted(db.pool, [
      noteEvent(noteId, 'note.created', {
        title: 'Internal',
        homeProjectId: world.P,
        scope: { mode: 'private' },
      }),
      noteEvent(noteId, 'comment.added', { body: { type: 'doc', content: [] } }),
    ]);

    // A comment on a note is filed against the NOTE, so it is classified by the
    // note's audience. Routed through the ticket branch instead — the mutation —
    // `canSee` is asked about a note id, answers false for everybody, and the
    // author's own copy disappears with the reader's.
    expect(eventsOf(await drain(world.ids.memberIn, before), noteId)).toHaveLength(0);
    expect(eventsOf(await drain(world.ids.author, before), noteId)).toHaveLength(2);
  });
});

describe('visibleEventsFor — the ticket cascade into inherit notes', () => {
  it('18.067 a ticket grant trigger announces the inherit notes attached to it', async () => {
    // `TE` is `explicit [guestListed]` in the fixture, so `memberIn` cannot see
    // it — nor `nInherit`, which inherits from it and from nothing else. The
    // widening is the ONE event that can tell them: the note's own stream says
    // nothing, because its `note.created` sits below their cursor and the
    // event that changed its readership is filed against the TICKET.
    const headBelow = Math.max(
      ...eventsOf(await drain(world.ids.author), world.NOTES.nInherit).map((e) => e.workspaceSeq),
    );
    const before = await workspaceHead();
    const widened = ticketEvent(world.TE, 'visibility.set', {
      ticketId: world.TE,
      mode: 'workspace',
    });
    await applyCommitted(db.pool, [widened]);

    const items = await drain(world.ids.memberIn, before);
    const found = notices(items);
    expect(found).toHaveLength(1);
    expect(found[0]!.notes?.map((n) => n.id)).toEqual([world.NOTES.nInherit]);
    expect(found[0]!.notes?.[0]!.headSeq).toBe(headBelow);
    // The notice precedes its trigger, as the note branch's and the ticket
    // branch's already do — a client cannot apply an event whose entity it has
    // not pulled.
    const envIndex = items.findIndex((i) => !('kind' in i) && i.id === widened.id);
    expect(envIndex).toBeGreaterThan(0);
    expect(items.indexOf(found[0]!)).toBe(envIndex - 1);
  });

  it('18.068 a ticket the reader still cannot see grants nothing for its notes (control)', async () => {
    // The control arm of 18.067, one `it` later rather than inside it (the plan
    // said "in the same `it`"; its own scenario needs 18.067's widening to have
    // happened first, so the two are ordered rather than merged, which also
    // leaves each case cited by a test naming exactly its own id).
    //
    // Read the case text's mutation as a statement about WHICH guard holds
    // this, and the answer is that two do and neither is singly mutable: with
    // `canSee` in place the narrowing's row never enters the ticket branch at
    // all, and with `canSee` removed `noteGrantNoticeFor`'s `canReadNote`
    // refuses the note. BOTH single mutations were run and both left this case
    // GREEN. It is not vacuous, though — 18.067's mutation (skip
    // `notesAttachedTo`) reddens it through the `guestListed` control below —
    // it is simply a case whose own named mutation is unreachable by
    // construction, which is a property of the case rather than a gap in it.
    const narrowed = ticketEvent(world.TE, 'visibility.set', {
      ticketId: world.TE,
      mode: 'explicit',
      userIds: [world.ids.guestListed],
    });
    await applyCommitted(db.pool, [narrowed]);

    // The liveness control, and it is what makes the absence above mean
    // something: `guestListed` is named by the new explicit list, so the SAME
    // narrowing IS a grant for them and their drain carries the notice. An
    // empty drain for `memberIn` is therefore a statement about reach, not
    // about a range with nothing in it.
    const guestItems = await drain(world.ids.guestListed, narrowed.workspaceSeq - 1);
    expect(notices(guestItems)).toHaveLength(1);
    expect(notices(guestItems)[0]!.notes?.map((n) => n.id)).toEqual([world.NOTES.nInherit]);

    // And `memberIn` gets nothing at all: not the envelope, not a notice.
    const memberItems = await drain(world.ids.memberIn, narrowed.workspaceSeq - 1);
    expect(notices(memberItems)).toHaveLength(0);
  });

  it('18.069 a note that does not depend on the ticket is not announced by a ticket trigger', async () => {
    // `nProject` is `project`-scoped and memberIn is on P, so they can already
    // read it — and its readership has nothing to do with `TE`. Attaching it to
    // a ticket does not change that: the attachment is a door for an
    // `inherit`-scoped note and is inert for every other scope.
    await applyCommitted(db.pool, [
      noteEvent(world.NOTES.nProject, 'note.attached', { ticketId: world.TE }),
    ]);

    const before = await workspaceHead();
    await applyCommitted(db.pool, [
      ticketEvent(world.TE, 'visibility.set', { ticketId: world.TE, mode: 'workspace' }),
    ]);

    const named = notices(await drain(world.ids.memberIn, before)).flatMap(
      (n) => n.notes?.map((x) => x.id) ?? [],
    );
    // Control: the notice is live and names the note that DOES depend on `TE`,
    // so the exclusion below is about the scope clause rather than about a
    // notice that never happened.
    expect(named).toContain(world.NOTES.nInherit);
    expect(named).not.toContain(world.NOTES.nProject);
  });
});
