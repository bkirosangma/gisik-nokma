import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, plainTextToDoc, type SubmittedEvent } from '@gisik-nokma/domain';
import { readStreamSeq } from '../../src/sync/stream-seq.js';
import {
  createHarness,
  TASK_TYPE_ID,
  USER_A,
  USER_B,
  type Harness,
  type HarnessClient,
} from './rig.js';

/**
 * Closure 5's GRANT half against two real replicas (ruling P37, 2026-09-06).
 *
 * `test/visibility/grant-backfill.test.ts` carries who is excluded and which
 * tickets the walk reaches; those are questions about a generator. THESE two
 * are questions about a replica, and neither can be asked anywhere else:
 *
 * - **12.275 is case 12.274's own probe, re-aimed.** 12.274 recorded a PRODUCT
 *   DEFECT measured twice — narrow, one unrelated visible commit, re-widen, and
 *   client B ends holding 2 events where the server holds 4, permanently, with
 *   no purge, no backfill and no resync path. P37 constraint 3 makes that probe
 *   the GREEN case. It is written here as the same script, with the control that
 *   made it a defect kept as an assertion: B's cursor must actually have run
 *   PAST the narrowing before the re-widening, or this is S4's quiet shape
 *   (12.270) and proves nothing about backfill.
 * - **12.276 measures replay idempotence**, which P37 names as the condition on
 *   which over-delivery is acceptable. The condition is not cited from
 *   `applyServerItem`'s duplicate guard — it is measured, and then the guard is
 *   mutated out to show the measurement can fail.
 */

let h: Harness;
let a: HarnessClient;
let b: HarnessClient;

beforeEach(async () => {
  h = await createHarness();
  a = await h.client(USER_A);
  b = await h.client(USER_B);
});

afterEach(async () => {
  await h.drop();
});

function ticketEvent(actorId: string, ticketId: string, type: string, payload: unknown): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: h.workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type,
    payload,
    actorId,
    origin: actorId === USER_A ? 'desktop' : 'mobile',
  });
}

async function commit(userId: string, event: SubmittedEvent): Promise<void> {
  const [result] = await h.ingestInteractive(userId, [event]);
  expect(result, `${event.type} by ${userId} should commit`).toMatchObject({
    status: 'committed',
    eventId: event.id,
  });
}

/** A root ticket both members can see — no authored visibility, so `'project'` mode. */
async function seedSharedTicket(title: string): Promise<{ ticketId: string; created: SubmittedEvent }> {
  const ticketId = newUlid();
  const created = ticketEvent(USER_A, ticketId, 'ticket.created', {
    typeId: TASK_TYPE_ID,
    projectId: h.projectId,
    parentId: null,
    title,
  });
  await commit(USER_A, created);
  await a.syncDown();
  await b.syncDown();
  expect((await b.replica.getTicket(ticketId))?.confirmed?.stateId).toBe('todo');
  return { ticketId, created };
}

describe('closure 5 — the copy nobody gives back, against two replicas', () => {
  it('12.275 a re-widened ticket comes back EVEN IF the client read something else meanwhile — case 12.274’s probe, now green', async () => {
    const { ticketId, created } = await seedSharedTicket('The shared one');
    // A second, always-visible ticket. It is the "something else meanwhile"
    // that made 12.274 a defect rather than S4's quiet shape.
    const { ticketId: unrelated } = await seedSharedTicket('The unrelated one');

    // NARROW to A alone. B loses the ticket; B is not told.
    const narrow = ticketEvent(USER_A, ticketId, 'visibility.set', {
      ticketId,
      mode: 'explicit',
      userIds: [USER_A],
    });
    await commit(USER_A, narrow);
    // A row filed on the narrowed ticket while B cannot see it — the row 12.274
    // measured B losing for ever.
    const whileHidden = ticketEvent(USER_A, ticketId, 'comment.added', { body: plainTextToDoc('said while hidden') });
    await commit(USER_A, whileHidden);

    // THE UNRELATED VISIBLE COMMIT. This is the whole difference from 12.270.
    const elsewhere = ticketEvent(USER_A, unrelated, 'comment.added', { body: plainTextToDoc('elsewhere') });
    await commit(USER_A, elsewhere);
    await b.syncDown();

    // THE CONTROL THAT MAKES THIS PROBE MEAN ANYTHING. B's cursor must have run
    // past BOTH the narrowing and the row filed after it. Without this the test
    // is 12.270 wearing a different name, and it would pass with no backfill in
    // the product at all.
    const cursorAfterElsewhere = await b.replica.getCursor(h.workspaceId);
    const { rows: seqRows } = await h.pool.query<{ id: string; workspace_seq: string }>(
      'SELECT id, workspace_seq FROM events WHERE id = ANY($1::text[])',
      [[narrow.id, whileHidden.id]],
    );
    for (const row of seqRows) {
      expect(
        Number(row.workspace_seq),
        `B's cursor must have passed ${row.id} for this to be 12.274's shape`,
      ).toBeLessThan(cursorAfterElsewhere);
    }
    // And B genuinely does not hold the hidden rows yet.
    expect((await b.replica.listEntityEvents(ticketId)).map((e) => e.id)).toEqual([created.id]);

    // RE-WIDEN.
    const widen = ticketEvent(USER_A, ticketId, 'visibility.set', { ticketId, mode: 'project' });
    await commit(USER_A, widen);
    await b.syncDown();
    await a.syncDown();

    // 12.274 measured `bHasNarrow: false` and `replicasEqual: false` here.
    expect((await b.replica.listEntityEvents(ticketId)).map((e) => e.id)).toEqual([
      created.id,
      narrow.id,
      whileHidden.id,
      widen.id,
    ]);
    const onA = await a.replica.getTicket(ticketId);
    const onB = await b.replica.getTicket(ticketId);
    expect(onA).not.toBeNull();
    expect(onB).toEqual(onA);
    expect(await b.replica.listEntityEvents(ticketId)).toEqual(await a.replica.listEntityEvents(ticketId));
    // Server ≡ replica, which is the line that makes convergence mean the
    // product agrees with itself rather than the two clients agreeing.
    expect(await h.projTicket(ticketId)).toEqual(onA?.confirmed);
    // Nothing left undelivered on either side.
    const streamHead = await readStreamSeq(h.pool, h.workspaceId);
    expect(await b.replica.getCursor(h.workspaceId)).toBe(streamHead);
    expect(await a.replica.getCursor(h.workspaceId)).toBe(streamHead);
  });

  it('12.276 over-delivery changes nothing: the same history handed back twice leaves every row identical', async () => {
    const { ticketId } = await seedSharedTicket('Delivered twice');
    await commit(USER_A, ticketEvent(USER_A, ticketId, 'comment.added', { body: plainTextToDoc('one') }));
    await commit(USER_A, ticketEvent(USER_A, ticketId, 'ticket.field_set', { fieldId: 'title', value: 'Renamed' }));
    await b.syncDown();

    const before = {
      ticket: await b.replica.getTicket(ticketId),
      history: await b.replica.listEntityEvents(ticketId),
      contests: await b.replica.listContests(h.workspaceId),
      cursor: await b.replica.getCursor(h.workspaceId),
    };
    // The state B holds is real, not empty — a vacuous "nothing changed" would
    // otherwise pass against a replica holding nothing.
    expect(before.history.length).toBe(3);
    expect(before.ticket?.confirmed).not.toBeNull();

    // Hand B the ticket's ENTIRE history again, envelope by envelope, exactly as
    // `grantBackfillFor` would on a widening. `applied` is the door's own answer,
    // and every one of them must be false: these are all duplicates.
    const applied: boolean[] = [];
    for (const env of before.history) {
      applied.push((await b.replica.applyServerItem(env)).applied);
    }
    expect(applied).toEqual([false, false, false]);

    // THE ROWS, not the count. Equality on the ticket, on the full local history
    // and on the contest table — the three places a re-fold could have doubled
    // or reordered something.
    expect(await b.replica.getTicket(ticketId)).toEqual(before.ticket);
    expect(await b.replica.listEntityEvents(ticketId)).toEqual(before.history);
    expect(await b.replica.listContests(h.workspaceId)).toEqual(before.contests);
    // A re-delivery must not move the cursor either — backfilled envelopes are
    // below it by construction, and nothing here advances it.
    expect(await b.replica.getCursor(h.workspaceId)).toBe(before.cursor);
    // Still agrees with the server after the double delivery.
    expect(await h.projTicket(ticketId)).toEqual((await b.replica.getTicket(ticketId))?.confirmed);
  });
});
