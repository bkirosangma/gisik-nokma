import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { PERMISSION_ROLE_RULE, SERVER_ORIGIN_REASON } from '../../src/permissions/check-permission.js';
import { readStreamSeq } from '../../src/sync/stream-seq.js';
import { createHarness, TASK_TYPE_ID, USER_A, USER_B, type Harness } from './rig.js';

/**
 * The rig proving itself before Task 15's scenarios trust it (Plan 10 Task 14).
 *
 * Three things a scenario will lean on, each pinned with the control that
 * keeps it from passing for an unrelated reason:
 *
 * 1. A claim made offline reaches the server through `goOnline()`, reaches the
 *    other client through `syncDown()`, and every side holds it EXACTLY ONCE
 *    after any number of further syncs. "Offline" is witnessed at the LEDGER,
 *    not at client B — B has not synced, so B's silence would prove nothing.
 * 2. `ingestInteractive` is the GATED door. A forged envelope-origin is refused
 *    with the gate's own rule and reason; the same claim wearing honest
 *    provenance commits through the same call. The internal door would have
 *    committed both, so this is the case that turns red if someone "fixes"
 *    `ingestClientBatch` back into `ingestBatch`.
 * 3. A client created after the fact starts from the server's cut: the ticket
 *    is there without a sync-down, and its cursor is the stream head, so the
 *    first `syncDown()` has nothing to deliver.
 */

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.drop();
});

function createdBy(
  actorId: string,
  ticketId: string,
  origin: SubmittedEvent['origin'],
  title: string,
): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: h.workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { typeId: TASK_TYPE_ID, projectId: h.projectId, parentId: null, title },
    actorId,
    origin,
  });
}

describe('the rig', () => {
  it('a claim from A reaches B through sync exactly once, and syncing again changes nothing', async () => {
    const a = await h.client(USER_A);
    const b = await h.client(USER_B);
    const ticketId = newUlid();
    const created = createdBy(USER_A, ticketId, 'desktop', 'Crosses the wire');

    expect(await a.submit(created)).toEqual({ status: 'pending', eventId: created.id });
    // Offline means NOTHING reached the server. The ledger is the witness.
    expect(await h.ledger(ticketId)).toEqual([]);
    expect(await h.projTicket(ticketId)).toBeNull();
    // ...and A holds it only as a queued claim, never as settled state.
    expect(await a.outbox.queuedCount(h.workspaceId)).toBe(1);
    expect(await a.outbox.pendingFor(ticketId)).toMatchObject({ pendingEventIds: [created.id] });
    expect(await a.replica.getTicket(ticketId)).toBeNull();
    expect(await b.ds.query.getTicket(h.workspaceId, ticketId)).toBeNull();

    await a.goOnline();

    // The server holds it once, committed by A, at per-entity seq 1.
    expect(await h.ledger(ticketId)).toEqual([{ id: created.id, type: 'ticket.created', seq: 1, actorId: USER_A }]);
    expect((await h.projTicket(ticketId))?.stateId).toBe('todo');
    // A's outbox is empty and A's replica now holds the claim as fact — folded
    // through `applyResult`, the flush door, before any sync-down echoed it.
    expect(await a.outbox.queuedCount(h.workspaceId)).toBe(0);
    expect(await a.outbox.pendingFor(ticketId)).toBeNull();
    expect((await a.replica.getTicket(ticketId))?.confirmed?.stateId).toBe('todo');
    // Nothing pushes: B does not have it until B asks.
    expect(await b.ds.query.getTicket(h.workspaceId, ticketId)).toBeNull();

    await b.syncDown();

    const onA = await a.ds.query.getTicket(h.workspaceId, ticketId);
    const onB = await b.ds.query.getTicket(h.workspaceId, ticketId);
    expect(onA?.ticket.stateId).toBe('todo');
    expect(onB?.ticket.stateId).toBe('todo');
    // Replica ≡ replica, and both ≡ the SERVER's own read model. The second is
    // the property scenarios exist to assert, so the rig asserts it first.
    expect(onB?.ticket).toEqual(onA?.ticket);
    expect(onB?.ticket).toEqual(await h.projTicket(ticketId));

    // Idempotent all the way: another sync-down on either side moves no
    // cursor and duplicates no event. A's copy arrived through TWO doors —
    // the flush echo and the stream — and is still held once.
    const cursorA = await a.replica.getCursor(h.workspaceId);
    const cursorB = await b.replica.getCursor(h.workspaceId);
    expect(cursorB).toBe(await readStreamSeq(h.pool, h.workspaceId));
    await a.syncDown();
    await b.syncDown();
    expect(await a.replica.getCursor(h.workspaceId)).toBe(cursorA);
    expect(await b.replica.getCursor(h.workspaceId)).toBe(cursorB);
    expect(await a.replica.listEntityEvents(ticketId)).toHaveLength(1);
    expect(await b.replica.listEntityEvents(ticketId)).toHaveLength(1);
    expect(await h.ledger(ticketId)).toHaveLength(1);
  });

  it('ingestInteractive is the GATED door: forged server provenance is refused, the honest claim commits', async () => {
    const ticketId = newUlid();

    // `checkRolePermission` refuses envelope-origin `'server'` from a client.
    // The internal door has no gate and would commit this.
    const forged = createdBy(USER_A, ticketId, 'server', 'Wears the server provenance');
    const [refusal] = await h.ingestInteractive(USER_A, [forged]);
    expect(refusal).toEqual({
      status: 'refused',
      eventId: forged.id,
      rule: PERMISSION_ROLE_RULE,
      reason: SERVER_ORIGIN_REASON,
    });
    expect(await h.ledger(ticketId)).toEqual([]);

    // Control, same door, same call: honest provenance commits — so the
    // refusal above was the gate, not a broken fixture.
    const honest = createdBy(USER_A, ticketId, 'web', 'Wears its own provenance');
    const [commit] = await h.ingestInteractive(USER_A, [honest]);
    expect(commit).toMatchObject({ status: 'committed', eventId: honest.id, seq: 1 });
    expect(await h.ledger(ticketId)).toEqual([{ id: honest.id, type: 'ticket.created', seq: 1, actorId: USER_A }]);
  });

  /**
   * THE BACKFILL LIST IS THE SERVER'S, AND UNTIL THIS CASE NOTHING PROVED IT.
   *
   * `bootstrapFor` sends a ticket's snapshot plus every event ABOVE the
   * snapshot's seq, PLUS every `BOOTSTRAP_BACKFILL_TYPES` event regardless of
   * position — because those are the ticket-entity types the reducer never
   * folds, so a snapshot never carries them. The rig imports that constant from
   * `sync-routes.ts` rather than restating it, and the plan text's hand-copied
   * list was missing `visibility.set`.
   *
   * MEASURED: replacing the import with the plan's four-entry literal left all
   * three cases above GREEN. The mutation ran — the edit was confirmed present
   * before the run — so that was an unconstrained path, not a mutation that
   * never fired. This case constrains it: a `visibility.set` filed BELOW the
   * snapshot line is invisible to a fresh client unless the backfill carries
   * its type, and a bootstrap that quietly drops it hands the replica a
   * different audience for the ticket than the server has.
   *
   * The snapshot pass runs BETWEEN the visibility claim and the new client, so
   * the event is genuinely below the snapshot's seq — without that ordering the
   * event would arrive as an ordinary above-the-line event and the case would
   * pass for a reason that has nothing to do with the backfill.
   */
  it('a visibility.set below the snapshot line still reaches a fresh client — the backfill is the server\'s list', async () => {
    const ticketId = newUlid();
    const born = createdBy(USER_A, ticketId, 'web', 'Audience changes below the snapshot');
    const [commit] = await h.ingestInteractive(USER_A, [born]);
    expect(commit).toMatchObject({ status: 'committed' });

    const scoped = newSubmittedEvent({
      workspaceId: h.workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'visibility.set',
      payload: { ticketId, mode: 'project' },
      actorId: USER_A,
      origin: 'web',
    });
    const [set] = await h.ingestInteractive(USER_A, [scoped]);
    expect(set).toMatchObject({ status: 'committed', eventId: scoped.id });

    // Snapshot AFTER both, so the visibility claim sits below the line.
    await h.snapshotPass();

    const fresh = await h.client(USER_B);
    const events = await fresh.replica.listEntityEvents(ticketId);
    const types = events.map((e) => e.type);
    expect(types, 'the visibility claim must survive the snapshot line').toContain('visibility.set');
    expect(events.find((e) => e.type === 'visibility.set')?.id).toBe(scoped.id);
    // Control: the snapshot really did cover this ticket, so "below the line"
    // is a fact about this run and not an assumption. Without it, a snapshot
    // pass that skipped the ticket would make this case prove nothing.
    expect(types).not.toContain('ticket.created');
  });

  it('a client created after the fact bootstraps from the server cut: ticket present, cursor at the head', async () => {
    const ticketId = newUlid();
    const born = createdBy(USER_B, ticketId, 'mobile', 'Born before the client');
    const [commit] = await h.ingestInteractive(USER_B, [born]);
    expect(commit).toMatchObject({ status: 'committed' });

    const late = await h.client(USER_A);
    // No sync-down has run: this came through `loadBootstrap` or not at all.
    const onLate = await late.ds.query.getTicket(h.workspaceId, ticketId);
    expect(onLate?.ticket).toEqual(await h.projTicket(ticketId));
    const head = await readStreamSeq(h.pool, h.workspaceId);
    expect(await late.replica.getCursor(h.workspaceId)).toBe(head);
    // ...so the first sync-down has nothing to deliver and moves nothing.
    await late.syncDown();
    expect(await late.replica.getCursor(h.workspaceId)).toBe(head);
    expect(await late.replica.listEntityEvents(ticketId)).toHaveLength(1);
  });
});
