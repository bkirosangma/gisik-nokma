import { afterEach, describe, expect, it } from 'vitest';
import {
  newSubmittedEvent,
  newUlid,
  type EventEnvelope,
  type LedgerEvent,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';
import { backoffMs, createOutbox, type Outbox } from '../src/outbox/outbox.js';

/**
 * Plan 10 Task 10 — the outbox. Cases 12.144–12.153.
 *
 * The range is a fact about the moment it was written. `grep -cE
 * "^[[:space:]]*it\(" test/outbox.test.ts` prints the number of `it`
 * declarations here; one sits inside a two-zone loop (12.152) and therefore
 * runs twice, so the runner's own count is one higher than the id count.
 *
 * ## The property the whole file is built around
 *
 * **A queued claim is never settled fact.** Nothing in `outbox.ts` writes to
 * `tickets`, `snapshots` or `events`; a claim in transit moves `pendingFor` and
 * `pendingCreatedTickets` and nothing else. 12.150 is the case that fails if
 * that ever stops being true.
 */

const WS = newUlid();
const OTHER_WS = newUlid();
const PROJECT = newUlid();
const USER_A = newUlid();
const WF = newUlid();
const TYPE_TASK = newUlid();

const SERVER_TIME = '2026-08-20T00:00:00.000Z';
const CLIENT_TIME = '2026-08-19T23:59:00.000Z';

const wf = {
  id: WF,
  version: 1,
  name: 'W',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
};

const taskType = { id: TYPE_TASK, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] };

let seqCounter = 0;
let streamCounter = 0;

function committed(entity: EventEnvelope['entity'], type: string, payload: unknown, seq?: number): LedgerEvent {
  seqCounter += 1;
  streamCounter += 1;
  return {
    ...newSubmittedEvent({
      workspaceId: WS,
      entity,
      type,
      payload,
      actorId: USER_A,
      origin: 'server',
      now: () => new Date(CLIENT_TIME),
    }),
    serverTime: SERVER_TIME,
    seq: seq ?? seqCounter,
    workspaceSeq: streamCounter,
  };
}

function bootstrapOf(): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT] },
    streamSeq: 0,
    definitions: [
      committed({ kind: 'workflow', id: WF }, 'workflow.defined', wf, 1),
      committed({ kind: 'ticket-type', id: TYPE_TASK }, 'ticket-type.defined', taskType, 1),
    ],
    tickets: [],
  };
}

type Fixture = { storage: SyncStorage; replica: Replica; outbox: Outbox };

async function fixture(): Promise<Fixture> {
  seqCounter = 0;
  streamCounter = 0;
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  await replica.loadBootstrap(bootstrapOf());
  return { storage, replica, outbox: createOutbox({ storage, replica }) };
}

/** A brand-new root ticket, born offline. PAYLOAD spells the parent `parentId` and the type `typeId`. */
function createTicket(ticketId = newUlid(), title = 'Offline born'): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title },
    actorId: USER_A,
    origin: 'mobile',
  });
}

/**
 * 12.21 — order preservation is asserted at 12.144 (outbox.test.ts:116), the committed/contested/failed result-application clauses at 12.145 (:138), 12.146 (:164) and 12.147 (:198) respectively, and the exponential backoff (doubling from 1s, capped at 60s) at 12.153 (:438) — no single test proves this row; each clause lives in its own named case.
 */
describe('12.144–12.146 ordering, and what each server answer does to a row', () => {
  it('12.144 preserves enqueue order and offers only rows that are due', async () => {
    const { storage, outbox } = await fixture();
    const create = createTicket();
    const rename = newSubmittedEvent({
      workspaceId: WS,
      entity: create.entity,
      type: 'ticket.field_set',
      payload: { fieldId: 'title', value: 'Renamed while offline' },
      actorId: USER_A,
      origin: 'mobile',
    });

    expect(await outbox.enqueue(create)).toEqual({ queued: true, eventId: create.id });
    expect(await outbox.enqueue(rename)).toEqual({ queued: true, eventId: rename.id });

    // Enumerated in order, not counted: a batch that lost the order would
    // replay a field_set against a ticket the server has not been told about.
    expect((await outbox.nextBatch()).map((item) => item.eventId)).toEqual([create.id, rename.id]);
    expect((await outbox.nextBatch(1)).map((item) => item.eventId)).toEqual([create.id]);
    await storage.close();
  });

  it('12.145 a committed answer folds the claim into the local ledger and clears the row', async () => {
    const { storage, replica, outbox } = await fixture();
    const create = createTicket();
    await outbox.enqueue(create);

    await outbox.applyResult(create.id, {
      status: 'committed',
      eventId: create.id,
      seq: 1,
      workspaceSeq: 11,
      serverTime: '2026-08-20T01:00:00.000Z',
    });

    expect(await storage.all('SELECT event_id FROM outbox')).toEqual([]);
    const confirmed = (await replica.getTicket(create.entity.id))?.confirmed;
    expect(confirmed?.stateId).toBe('todo');
    // The SERVER's instant, not the device's — the claim became fact through
    // `applyServerItem`, which stores what it was handed.
    expect((await replica.listEntityEvents(create.entity.id)).map((env) => env.serverTime)).toEqual([
      '2026-08-20T01:00:00.000Z',
    ]);
    // And it is now a settled ticket, so it is no longer a pending one.
    expect(await outbox.pendingCreatedTickets(WS)).toEqual([]);
    await storage.close();
  });

  it('12.146 a contested answer records the contest locally and clears the row — nothing vanishes', async () => {
    const { storage, replica, outbox } = await fixture();
    const create = createTicket();
    await outbox.enqueue(create);
    const contestEventId = newUlid();

    await outbox.applyResult(create.id, {
      status: 'contested',
      eventId: create.id,
      rule: 'hierarchy.parent-terminal',
      reason: 'planted',
      contestEventId,
    });

    expect(await outbox.queuedCount(WS)).toBe(0);
    const contests = await replica.listContests(WS, { open: true });
    expect(contests).toHaveLength(1);
    expect(contests[0]).toMatchObject({
      contestedEventId: contestEventId,
      originalEventId: create.id,
      rule: 'hierarchy.parent-terminal',
      // The actor of the REFUSED CLAIM, never of the contest the server filed.
      claimantId: USER_A,
      resolved: false,
    });
    // The claim itself is preserved verbatim, which is the whole point of the
    // stub: if visibility was lost with the refusal, the real `claim.contested`
    // envelope never streams in and this is the claimant's only record.
    expect(contests[0]?.originalEvent.id).toBe(create.id);
    await storage.close();
  });
});

describe('12.147–12.149 the two kinds of failure, and the echo that arrives first', () => {
  it('12.147 a refused answer is TERMINAL: the row is visibly failed and no longer offered', async () => {
    const { storage, outbox } = await fixture();
    const create = createTicket();
    await outbox.enqueue(create);

    await outbox.applyResult(create.id, {
      status: 'refused',
      eventId: create.id,
      rule: 'restrict-to',
      reason: 'Only admins may make this move.',
    });

    expect(await outbox.nextBatch()).toEqual([]);
    expect(await outbox.queuedCount(WS)).toBe(0);
    const failed = await outbox.failedItems(WS);
    expect(failed.map((item) => item.eventId)).toEqual([create.id]);
    expect(failed[0]?.status).toBe('failed');
    // The reason travels with the row, so the UI can say what the server said
    // rather than "something went wrong".
    expect(await storage.all('SELECT last_error FROM outbox WHERE event_id = ?', [create.id])).toEqual([
      { last_error: 'restrict-to: Only admins may make this move.' },
    ]);
    await storage.close();
  });

  /**
   * 12.960 — E6-5: a claim enqueued AFTER a transient failure cannot overtake
   * the backing-off claims it depends on. The batch is the longest DUE PREFIX
   * of the queue, so while the head is backing off the flush is offered
   * nothing, and when the head comes due the whole queue is offered in order.
   *
   * RED before the fix (the reviewer's Appendix D, reproduced here): batch1 =
   * [CREATE, RENAME-1] fails transiently, RENAME-2 is enqueued, and 500 ms
   * later `nextBatch` offered `[RENAME-2]` alone — a `field_set` for a ticket
   * the server had never been told about, which the sync door turned into a
   * false, unresolved `claim.contested` on the user's own ticket.
   */
  it('E6-5 / 12.960 a claim enqueued after a transient failure waits for the backing-off head', async () => {
    const { storage, outbox } = await fixture();
    const create = createTicket();
    const rename = (value: string): SubmittedEvent =>
      newSubmittedEvent({
        workspaceId: WS,
        entity: create.entity,
        type: 'ticket.field_set',
        payload: { fieldId: 'title', value },
        actorId: USER_A,
        origin: 'mobile',
      });
    const rename1 = rename('first rename');
    expect(await outbox.enqueue(create)).toEqual({ queued: true, eventId: create.id });
    expect(await outbox.enqueue(rename1)).toEqual({ queued: true, eventId: rename1.id });

    const t0 = new Date('2026-09-21T10:00:00.000Z');
    const batch1 = (await outbox.nextBatch(50, () => t0)).map((item) => item.eventId);
    expect(batch1).toEqual([create.id, rename1.id]);
    // The transport threw: both back off by backoffMs(1).
    await outbox.recordFailure(batch1, 'network', () => t0);
    // The user keeps working on the ticket they can see.
    const rename2 = rename('second rename');
    expect(await outbox.enqueue(rename2)).toEqual({ queued: true, eventId: rename2.id });

    // Before the head is due: NOTHING, not [rename2].
    const t1 = new Date(t0.getTime() + 500);
    expect(await outbox.nextBatch(50, () => t1)).toEqual([]);
    // Once the head is due: everything, in enqueue order.
    const t2 = new Date(t0.getTime() + backoffMs(1) + 1);
    expect((await outbox.nextBatch(50, () => t2)).map((item) => item.eventId)).toEqual([
      create.id,
      rename1.id,
      rename2.id,
    ]);
    // And the limit still cuts a PREFIX, never a due subset.
    expect((await outbox.nextBatch(2, () => t2)).map((item) => item.eventId)).toEqual([create.id, rename1.id]);
    await storage.close();
  });

  /**
   * 12.961 — the control for 12.960, on the shape 12.960 cannot see: a
   * not-due row in the MIDDLE of the queue (a state a device may already hold
   * from before this rule, or that a partial failure can leave). A due head
   * followed by a backing-off row followed by a due row offers the head ALONE
   * — the prefix stops at the first row not yet due — rather than skipping the
   * middle. Without this case, "empty while the head is not due" passes
   * equally well against the old due-subset filter plus a head check.
   */
  it('12.961 the batch stops at the first row not yet due, even when later rows are due', async () => {
    const { storage, outbox } = await fixture();
    const a = createTicket(newUlid(), 'A');
    const b = createTicket(newUlid(), 'B');
    const c = createTicket(newUlid(), 'C');
    for (const event of [a, b, c]) {
      expect(await outbox.enqueue(event)).toEqual({ queued: true, eventId: event.id });
    }
    const t0 = new Date('2026-09-21T10:00:00.000Z');
    await outbox.recordFailure([b.id], 'network', () => t0);

    expect((await outbox.nextBatch(50, () => t0)).map((item) => item.eventId)).toEqual([a.id]);
    const later = new Date(t0.getTime() + backoffMs(1) + 1);
    expect((await outbox.nextBatch(50, () => later)).map((item) => item.eventId)).toEqual([a.id, b.id, c.id]);
    await storage.close();
  });

  it('12.148 recordFailure is TRANSIENT: it backs off, holds the batch, and leaves the row queued', async () => {
    const { storage, outbox } = await fixture();
    const create = createTicket();
    await outbox.enqueue(create);
    const t0 = new Date('2026-08-20T00:00:00.000Z');

    await outbox.recordFailure([create.id], 'network down', () => t0);

    expect(await outbox.nextBatch(50, () => t0)).toEqual([]); // not due yet
    const later = new Date(t0.getTime() + backoffMs(1) + 1);
    expect((await outbox.nextBatch(50, () => later)).map((item) => item.eventId)).toEqual([create.id]);
    // STILL QUEUED, and this is the assertion that stops a future reader
    // "tidying" recordFailure into a `status = 'failed'` write: that would
    // strand every retryable claim on the device forever, silently.
    expect(await outbox.queuedCount(WS)).toBe(1);
    expect(await outbox.failedItems(WS)).toEqual([]);

    // A second failure doubles the wait, from the same clock.
    await outbox.recordFailure([create.id], 'network down', () => t0);
    expect(await outbox.nextBatch(50, () => later)).toEqual([]);
    expect((await outbox.nextBatch(50, () => new Date(t0.getTime() + backoffMs(2) + 1))).length).toBe(1);
    await storage.close();
  });

  /**
   * WHY THIS IS A RE-BOOTSTRAP AND NOT THE ECHO RACE, which is what the first
   * draft of this case tested and what its comment claimed.
   *
   * A stream ECHO that beats the HTTP answer home is `{applied: true}` — the
   * first arrival of that id — so `applyServerItem` reaches its OWN
   * `DELETE FROM outbox` and clears the row without help. Measured: after the
   * echo, `queuedCount` is already 0. A case built on that shape has to
   * re-INSERT the row by hand to have anything left to clear, which tests only
   * that a hand-inserted row can be deleted.
   *
   * The path where `applyResult`'s delete is the ONLY thing that clears the row
   * needs `applyServerItem` to return `{applied: false}` while an outbox row
   * still stands, and `loadBootstrap` is the door that produces it: it inserts
   * the device's own already-committed claim into `events` and touches the
   * outbox not at all. That is a live sequence, not a contrivance — the flush
   * goes out, the server commits, the device re-bootstraps before the answer
   * comes home, and the claim arrives back in its own ticket history.
   */
  it('12.149 a claim that came home through a re-bootstrap is still cleared by its own answer', async () => {
    const { storage, replica, outbox } = await fixture();
    const create = createTicket();
    await outbox.enqueue(create);
    const landed: LedgerEvent = { ...create, serverTime: '2026-08-20T01:00:00.000Z', seq: 1, workspaceSeq: 11 };

    await replica.loadBootstrap({
      ...bootstrapOf(),
      tickets: [{ ticketId: create.entity.id, snapshot: null, events: [landed] }],
    });
    // The bootstrap took the claim into the ledger and left the outbox alone.
    expect(await outbox.queuedCount(WS)).toBe(1);
    expect((await replica.listEntityEvents(create.entity.id)).map((env) => env.id)).toEqual([create.id]);

    // So the HTTP answer's own `applyServerItem` is a DUPLICATE: it returns
    // before reaching the delete that would otherwise clear the row.
    expect(await replica.applyServerItem(landed)).toEqual({ applied: false });
    expect(await outbox.queuedCount(WS)).toBe(1);

    await outbox.applyResult(create.id, {
      status: 'committed',
      eventId: create.id,
      seq: 1,
      workspaceSeq: 11,
      serverTime: '2026-08-20T01:00:00.000Z',
    });
    expect(await storage.all('SELECT event_id FROM outbox')).toEqual([]);
    // And nothing folded twice.
    expect(await replica.listEntityEvents(create.entity.id)).toHaveLength(1);
    await storage.close();
  });
});

describe('12.150–12.151 pending is never settled fact', () => {
  it('12.150 a ticket that exists only as a queued claim appears in NO settled listing', async () => {
    const { storage, replica, outbox } = await fixture();
    const create = createTicket(newUlid(), 'Never settled');
    await outbox.enqueue(create);
    const ticketId = create.entity.id;

    // Every settled surface the replica offers, enumerated rather than sampled.
    expect(await replica.getTicket(ticketId)).toBeNull();
    expect(await replica.listTickets(WS)).toEqual([]);
    expect(await replica.listEntityEvents(ticketId)).toEqual([]);
    expect(await replica.searchLocal(WS, 'Never settled')).toEqual([]);
    expect(await storage.all('SELECT ticket_id FROM tickets')).toEqual([]);
    expect(await storage.all('SELECT entity_id FROM snapshots')).toEqual([]);

    // And exactly one surface knows about it, with the claim named.
    const pending = await outbox.pendingCreatedTickets(WS);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.pending.id).toBe(ticketId);
    expect(pending[0]?.pending.stateId).toBe('todo');
    expect(pending[0]?.pendingEventIds).toEqual([create.id]);
    // Another workspace's caller sees nothing of it.
    expect(await outbox.pendingCreatedTickets(OTHER_WS)).toEqual([]);
    await storage.close();
  });

  /**
   * 12.20 — a queued transition leaves the confirmed ticket state and its transition log unmoved while pendingFor exposes the pending stateId/category separately and pendingEventIds names the queued (badge) ids.
   */
  it('12.151 a queued transition moves the pending reading only; the confirmed state is unmoved', async () => {
    const { storage, replica, outbox } = await fixture();
    const create = createTicket();
    const ticketId = create.entity.id;
    // Confirmed by the server first, so there IS a settled fact to protect.
    await replica.applyServerItem({ ...create, serverTime: SERVER_TIME, seq: 1, workspaceSeq: 11 });

    const move = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
      actorId: USER_A,
      origin: 'mobile',
    });
    await outbox.enqueue(move);

    expect((await replica.getTicket(ticketId))?.confirmed?.stateId).toBe('todo');
    expect((await replica.getTicket(ticketId))?.confirmed?.transitions).toEqual([]);
    const pending = await outbox.pendingFor(ticketId);
    expect(pending?.pending.stateId).toBe('done');
    expect(pending?.pending.stateCategory).toBe('terminal');
    expect(pending?.pendingEventIds).toEqual([move.id]);
    // The provisional position sits ABOVE the confirmed log, which is the one
    // property require-different-user's sort depends on.
    expect(pending?.pending.transitions.map((entry) => entry.seq)).toEqual([1]);

    // A ticket with nothing queued has no pending reading at all — `null`, not
    // confirmed state wearing a pending label.
    await outbox.applyResult(move.id, {
      status: 'refused',
      eventId: move.id,
      rule: 'restrict-to',
      reason: 'no',
    });
    expect(await outbox.pendingFor(ticketId)).toBeNull();
    await storage.close();
  });
});

/**
 * 12.152 — the one clock-sensitive property this task owns, and the honest
 * ceiling on what varying `TZ` buys.
 *
 * `backoffMs` is pure integer arithmetic and moves with no timezone; neither
 * does `nextBatch`'s comparison, PROVIDED both sides of it are Z-normalised
 * strings. That proviso is the property under test: `recordFailure` renders
 * `next_attempt_at` with `toISOString()`, and `schema.ts` stakes "string
 * comparison IS instant comparison" on the whole store. A hand-rolled local
 * render there — `2026-08-20T05:30:02+05:30` — still parses, still sorts
 * plausibly, and makes claims fall due at the wrong moment on every machine
 * whose zone is not the one the test ran in.
 *
 * So the assertion is on the exact stored STRING, under a non-IST zone, with a
 * positive control proving the zone switch took effect. Both clocks on this
 * project are Asia/Kolkata, which is exactly why an IST-only run would be
 * evidence about the machine.
 *
 * The ceiling, stated the way `board.test.ts` states its refusal to vary `TZ`
 * at all. MEASURED: replacing the `toISOString()` in `recordFailure` with a
 * hand-rolled `getFullYear()/getMonth()/getHours()` render that still appends
 * `Z` reddens BOTH zones of this case (and 12.148 besides), so the non-IST run
 * catches no bug the IST run misses. What it establishes is the NEGATIVE — that
 * nothing on this path moves with the machine's zone — which is not knowable
 * from an IST-only run on an IST machine, and which is what the later day-math
 * layers (Tasks 12 and 13) will stand on. Every other assertion in this file is
 * zone-free and deliberately does not vary `TZ`; a case that cannot fail is
 * worse than no case.
 *
 * `process.env.TZ` is live for V8's `Date` under vitest's `forks` pool (this
 * package sets no `pool`, so it gets the v3 default) and INERT under `threads`,
 * where the reassignment silently does nothing — the control below is what
 * would catch that.
 */
describe('12.152 next_attempt_at is a Z instant under any TZ', () => {
  const ORIGINAL_TZ = process.env.TZ;
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  for (const [tz, localHourOfT0] of [
    ['America/Los_Angeles', 17],
    ['Asia/Kolkata', 5],
  ] as const) {
    it(`holds under TZ=${tz}`, async () => {
      process.env.TZ = tz;
      // 2026-08-20T00:00:00Z is 17:00 the previous day in Los Angeles and
      // 05:30 the same day in Kolkata. POSITIVE CONTROL: without this the case
      // could pass while the process never left the machine's own zone.
      expect(new Date('2026-08-20T00:00:00.000Z').getHours()).toBe(localHourOfT0);

      const { storage, outbox } = await fixture();
      const create = createTicket();
      await outbox.enqueue(create);
      const t0 = new Date('2026-08-20T00:00:00.000Z');

      await outbox.recordFailure([create.id], 'network down', () => t0);

      // backoffMs(1) is 2000 ms. The stored string is the Z instant and nothing
      // else — not the same moment wearing a device offset.
      expect(await storage.all('SELECT next_attempt_at FROM outbox WHERE event_id = ?', [create.id])).toEqual([
        { next_attempt_at: '2026-08-20T00:00:02.000Z' },
      ]);
      // And the due comparison agrees with it in this zone.
      expect(await outbox.nextBatch(50, () => new Date('2026-08-20T00:00:01.999Z'))).toEqual([]);
      expect((await outbox.nextBatch(50, () => new Date('2026-08-20T00:00:02.000Z'))).length).toBe(1);
      await storage.close();
    });
  }
});

describe('12.153 backoffMs is the outbox flush curve, not the stream reconnect curve', () => {
  it('12.153 doubles from one second and caps at sixty, with no jitter', async () => {
    // Enumerated, because a cap assertion at one point cannot distinguish
    // "capped" from "constant".
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(backoffMs)).toEqual([
      1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000,
    ]);
    // Deterministic: no jitter, unlike `app-core`'s `backoffDelayMs`, whose
    // ±20% spread exists because reconnect storms are a thundering herd and one
    // device's outbox is not. Two surfaces, two curves — do not dedupe them.
    expect(backoffMs(3)).toBe(backoffMs(3));
  });
});
