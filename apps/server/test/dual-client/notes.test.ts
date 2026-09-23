import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, plainTextToDoc, type LedgerEvent, type SubmittedEvent } from '@gisik-nokma/domain';
import { USER_A, USER_B, TASK_TYPE_ID, createHarness, type Harness } from './rig.js';

/**
 * Notes across two devices (notes series, Plan 2 of 6, spec §5.1–§5.2; cases
 * 18.093–18.097).
 *
 * ## What this file is the only witness for
 *
 * Every other note case measures one side. The server's stream tests use a
 * fixture database; the replica tests use a fake transport; the engine tests
 * use a fake server. **These run the REAL `visibleEventsFor`, the REAL
 * reconcile rule and the REAL replica together, with two devices whose
 * holdings actually differ** — which is the only place "A widened it and B has
 * it now" is a measurement rather than a claim.
 *
 * ## The rig calls the route's own functions, so these are not restatements
 *
 * `rig.ts`'s transport calls `reconcileHeldIds` / `reconcileHeldNoteIds` — the
 * bodies of `POST /v1/sync/reconcile` — and `canReadNoteById`, the predicate
 * the note pull route uses. What the rig does NOT reach is any HTTP shell, and
 * the rig's own docblock says so at each door.
 *
 * ## A widening reaches B and a NARROWING does not — so reconcile is driven explicitly
 *
 * This repo emits no server-initiated per-entity purge (ruling P23): a device
 * that lost reach is told nothing on the stream, and `syncDown` does not
 * reconcile (the rig mirrors the drain, not the engine's `onCaughtUp`
 * schedule). So every "B lost it" case calls `engine.reconcile(workspaceId)`
 * — the shipped public method — and asserts the purge it causes. That IS the
 * product's mechanism; the product just calls it on catch-up.
 */

let h: Harness;
let ws: string;
let project: string;

beforeAll(async () => {
  h = await createHarness();
  ws = h.workspaceId;
  project = h.projectId;
});

afterAll(async () => {
  await h.drop();
});

/**
 * A ticket visible to exactly the people named.
 *
 * `newUlid()`, never a hand-typed id: a ULID is Crockford base32 and excludes
 * I, L, O and U, so a readable id like `01J9NOTETICKET…` is REFUSED by the
 * envelope parser — every claim in this file came back `invalid` when the first
 * draft used one. The failure reads as a permission problem and is a spelling
 * one.
 */
async function seedTicket(visibleTo: string[]): Promise<string> {
  const ticketId = newUlid();
  const results = await h.ingestInteractive(USER_A, [
    newSubmittedEvent({
      workspaceId: ws,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.created',
      payload: { typeId: TASK_TYPE_ID, projectId: project, parentId: null, title: 'Note ticket' },
      actorId: USER_A,
      // Provenance the way a shell stamps it, and never `'server'`, which the
      // GATED door refuses from a client.
      //
      // The actor is USER_A and NOT `USER_ADMIN`, which is the harness's owner:
      // `USER_ADMIN` is `01J9HPERS0NADM…` and contains an `O`, which Crockford
      // base32 excludes, so the envelope parser refuses every event it signs.
      // The harness seeds with it (projections do not parse) and no scenario
      // may use it as an actor.
      origin: 'mobile',
    }),
  ]);
  expect(results.map((r) => r.status)).toEqual(['committed']);
  const vis = await h.ingestInteractive(USER_A, [
    newSubmittedEvent({
      workspaceId: ws,
      entity: { kind: 'ticket', id: ticketId },
      type: 'visibility.set',
      payload: { ticketId, mode: 'explicit', userIds: visibleTo },
      actorId: USER_A,
      origin: 'mobile',
    }),
  ]);
  expect(vis.map((r) => r.status)).toEqual(['committed']);
  return ticketId;
}


function noteEvent(
  noteId: string,
  type: string,
  payload: unknown,
  actorId = USER_A,
): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: ws,
    entity: { kind: 'note', id: noteId },
    type,
    payload,
    actorId,
    origin: 'desktop',
  });
}

async function commit(events: SubmittedEvent[]): Promise<void> {
  const results = await h.ingestInteractive(USER_A, events);
  // EVERY claim committed, or the scenario is measuring a refusal it did not
  // intend — the harness's own rule for the ticket fixtures.
  expect(results.map((r) => r.status)).toEqual(events.map(() => 'committed'));
}

/** A note id's events as B holds them. */
async function heldEventIds(client: Awaited<ReturnType<Harness['client']>>, noteId: string): Promise<string[]> {
  return (await client.replica.listEntityEvents(noteId, 'note')).map((e: LedgerEvent) => e.id);
}

describe('notes across two devices (Plan 2 of 6)', () => {
  it('18.093 reach lost by a scope change leaves B holding nothing of the note', async () => {
    const noteId = newUlid();
    await commit([noteEvent(noteId, 'note.created', { title: 'Shared', homeProjectId: project, scope: { mode: 'workspace' } })]);
    await commit([noteEvent(noteId, 'note.body_set', { body: plainTextToDoc('body') })]);

    const b = await h.client(USER_B);
    await b.syncDown();
    // B holds it, events and all — the positive control the purge below needs.
    expect((await heldEventIds(b, noteId)).length).toBeGreaterThan(0);
    expect((await b.replica.getNote(noteId))?.scope).toEqual({ mode: 'workspace' });

    // A narrows it. NOTHING is streamed to B for this — a narrowing
    // self-excludes (`grant-backfill.ts`'s own asymmetry) — so B keeps the copy
    // until reconcile asks.
    await commit([noteEvent(noteId, 'note.scope_set', { mode: 'private' })]);
    await b.syncDown();
    expect(await b.replica.getNote(noteId)).not.toBeNull();

    await b.engine.reconcile(ws);

    expect(await b.replica.getNote(noteId)).toBeNull();
    expect(await b.replica.listEntityEvents(noteId, 'note')).toEqual([]);
    expect(await b.replica.listNoteComments(noteId)).toEqual([]);
    // Control: A still holds it, so the purge is about B's reach and not about
    // the note having been removed for everybody.
    const a = await h.client(USER_A);
    await a.syncDown();
    expect(await a.replica.getNote(noteId)).not.toBeNull();
  });

  it('18.094 reach lost by the LAST DETACH drops the note from B', async () => {
    const visibleTicket = await seedTicket([USER_A, USER_B]);
    const noteId = newUlid();
    // Born `inherit`, so the detach rule remembers NOTHING and falls back to
    // `private` — the case where B genuinely loses the note rather than moving
    // to a scope B happens to reach.
    await commit([
      noteEvent(noteId, 'note.created', {
        title: 'Inherited',
        homeProjectId: project,
        scope: { mode: 'inherit' },
        attachTicketId: visibleTicket,
      }),
    ]);

    const b = await h.client(USER_B);
    await b.syncDown();
    expect(await b.replica.getNote(noteId)).not.toBeNull();

    await commit([noteEvent(noteId, 'note.detached', { ticketId: visibleTicket })]);
    // The detach event itself does NOT reach B: by the time the row is
    // classified the note is private again, so B learns nothing from the
    // stream and keeps a copy it may no longer read.
    await b.syncDown();
    await b.engine.reconcile(ws);

    expect(await b.replica.getNote(noteId)).toBeNull();
    expect(await b.replica.listEntityEvents(noteId, 'note')).toEqual([]);
    // Control: the note is ALIVE and A still reads it — a purge is not a
    // deletion, and the two must not be confused by this case's assertion.
    const a = await h.client(USER_A);
    await a.syncDown();
    const held = await a.replica.getNote(noteId);
    expect(held).not.toBeNull();
    expect(held?.deleted).toBe(false);
    expect(held?.scope).toEqual({ mode: 'private' });
  });

  it('18.095 reach gained by a scope change pulls the note’s whole history', async () => {
    const noteId = newUlid();
    await commit([
      noteEvent(noteId, 'note.created', { title: 'Widened', homeProjectId: project, scope: { mode: 'private' } }),
      noteEvent(noteId, 'note.body_set', { body: plainTextToDoc('one') }),
      noteEvent(noteId, 'note.body_set', { body: plainTextToDoc('two') }),
      noteEvent(noteId, 'note.body_set', { body: plainTextToDoc('three') }),
    ]);

    const b = await h.client(USER_B);
    await b.syncDown();
    expect(await b.replica.getNote(noteId)).toBeNull();

    // The widening. Every one of the note's events sits BELOW B's cursor — they
    // were committed while B could not read the note, so they were never
    // delivered and the cursor never moved past them... which is exactly why a
    // notice is needed at all: the trigger alone would deliver only itself.
    await commit([noteEvent(noteId, 'note.scope_set', { mode: 'workspace' })]);
    await b.syncDown();

    expect(b.notePulls).toEqual([noteId]);
    // THE WHOLE LEDGER — the four events the note already had, PLUS the
    // widening that granted it. The plan's sentence counts four; the pull
    // fetches every row for the entity, and the trigger is one of them, so
    // four would be a claim about the note's PAST rather than about what
    // arrived. The property the case is for is that the pre-cursor history is
    // here at all — the three bodies are the ones a notice alone could never
    // have delivered.
    const events = await b.replica.listEntityEvents(noteId, 'note');
    expect(events.map((e) => e.type)).toEqual([
      'note.created',
      'note.body_set',
      'note.body_set',
      'note.body_set',
      'note.scope_set',
    ]);
    expect((await b.replica.getNote(noteId))?.body).toEqual(plainTextToDoc('three'));
    // Control: A, who could read it all along, holds the same four — so the
    // count above is the note's history and not a partial pull.
    const a = await h.client(USER_A);
    await a.syncDown();
    expect((await heldEventIds(a, noteId)).sort()).toEqual((await heldEventIds(b, noteId)).sort());
  });

  it('18.096 a ticket becoming visible brings its inherit note, and taking it away does not', async () => {
    const hiddenTicket = await seedTicket([USER_A]);
    const noteId = newUlid();
    await commit([
      noteEvent(noteId, 'note.created', {
        title: 'Cascade',
        homeProjectId: project,
        scope: { mode: 'inherit' },
        attachTicketId: hiddenTicket,
      }),
    ]);

    const b = await h.client(USER_B);
    await b.syncDown();
    expect(await b.replica.getNote(noteId)).toBeNull();

    // T widens: B reaches the ticket, so it reaches the note through it.
    const widened = await h.ingestInteractive(USER_A, [
      newSubmittedEvent({
        workspaceId: ws,
        entity: { kind: 'ticket', id: hiddenTicket },
        type: 'visibility.set',
        payload: { ticketId: hiddenTicket, mode: 'workspace' },
        actorId: USER_A,
        origin: 'mobile',
      }),
    ]);
    expect(widened.map((r) => r.status)).toEqual(['committed']);
    await b.syncDown();

    expect(b.notePulls).toEqual([noteId]);
    expect(await b.replica.getNote(noteId)).not.toBeNull();

    // And back. B keeps the copy — a ticket narrowing is invisible to the
    // reader who just lost it — so reconcile is what takes it.
    const narrowed = await h.ingestInteractive(USER_A, [
      newSubmittedEvent({
        workspaceId: ws,
        entity: { kind: 'ticket', id: hiddenTicket },
        type: 'visibility.set',
        payload: { ticketId: hiddenTicket, mode: 'explicit', userIds: [USER_A] },
        actorId: USER_A,
        origin: 'mobile',
      }),
    ]);
    expect(narrowed.map((r) => r.status)).toEqual(['committed']);
    await b.syncDown();
    await b.engine.reconcile(ws);

    expect(await b.replica.getNote(noteId)).toBeNull();
    expect(await b.replica.listEntityEvents(noteId, 'note')).toEqual([]);
  });

  it('18.097 delete reaches B, and a restore makes the row live again', async () => {
    const noteId = newUlid();
    await commit([noteEvent(noteId, 'note.created', { title: 'Undo', homeProjectId: project, scope: { mode: 'workspace' } })]);

    const b = await h.client(USER_B);
    await b.syncDown();
    expect((await b.replica.getNote(noteId))?.deleted).toBe(false);

    // The delete travels as an ordinary event: a deleted note is still readable
    // (`canReadNote` ignores `deleted`), which is what makes the undo window a
    // window rather than a wall.
    await commit([noteEvent(noteId, 'note.deleted', {})]);
    await b.syncDown();
    expect((await b.replica.getNote(noteId))?.deleted).toBe(true);

    await commit([noteEvent(noteId, 'note.restored', {})]);
    await b.syncDown();
    const live = await b.replica.getNote(noteId);
    expect(live).not.toBeNull();
    expect(live?.deleted).toBe(false);
    // Control: the row is the SAME note rather than a second one — an id is not
    // evidence that anything came back.
    expect(live?.noteId).toBe(noteId);
    expect(await b.replica.listEntityEvents(noteId, 'note')).toHaveLength(3);
  });
});
