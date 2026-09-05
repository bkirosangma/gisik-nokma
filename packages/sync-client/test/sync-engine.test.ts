import { describe, expect, it, vi } from 'vitest';
import { newSubmittedEvent, newUlid, type LedgerEvent, type SubmittedEvent } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';
import type { SyncItem } from '../src/replica/sync-item.js';
import { createOutbox, type Outbox, type SyncEventResult } from '../src/outbox/outbox.js';
import {
  createSyncEngine,
  type StreamHandlers,
  type SyncEngine,
  type SyncStatus,
  type ReconcileAnswer,
  type SyncTransport,
} from '../src/engine/sync-engine.js';
import { createHttpTransport, type WebSocketLike } from '../src/net/http-transport.js';

/**
 * Plan 10 Task 11 — the sync engine and its HTTP/WS transport. Cases
 * 12.156–12.171, the last two added by the fix round: 12.170 (the THIRD door
 * into `applyServerItem`, which the "both doors of the pair" claim did not
 * cover) and 12.171 (`caught-up.seq`, the value this client PERSISTS, held to
 * the rule the same function already applied to `envelope.workspaceSeq`).
 *
 * ## What this file is the FIRST caller of, and why that matters
 *
 * Two hazards were recorded against the replica (12.154, 12.155) and both name
 * this task as owner, because both only become reachable when something drives
 * `loadBootstrap` and `applyServerItem` with a CURSOR TO ADVANCE. Nothing did
 * until this file. So the cases below are not only "the engine works": FIVE of
 * them exist specifically to say what this door does about a failure measured
 * one layer down, and each carries the mutation that reddens it — 12.163,
 * 12.164, 12.165, 12.166, and 12.170, which the fix round added when the throw
 * turned out to have a third caller here. Written as ids rather than as a
 * number, because the number moved.
 *
 * ## Fixtures are duplicated rather than shared
 *
 * `replica.test.ts`, `outbox.test.ts`, `precheck.test.ts` and
 * `recorded-hazards.test.ts` each build their own ULIDs, workflow definitions
 * and `bootstrapOf`. This file follows that convention — and it is load-bearing
 * here in a way it is not elsewhere: `recorded-hazards.test.ts`'s docblock
 * measures `Tests 2 passed (2)` for its own file and its two cases are quoted
 * with `(22)` denominators in `test-cases/12-offline-sync-apps.md`. Adding the
 * engine's cases to that file would silently falsify both. This file's own
 * denominator is `(16)`; the package's is `Tests 63 passed (63)` — both moved
 * by the fix round's two cases, and both re-run at this tree rather than
 * recomputed from the old pair.
 *
 * ## No `TZ` case here, and that is a decision rather than an omission
 *
 * Nothing this file asserts moves with the local zone: the cursor is an integer,
 * the statuses are string literals, and the one instant that appears
 * (`next_attempt_at`, through `recordFailure`) is asserted by 12.152 in
 * `outbox.test.ts` under a non-IST `TZ` already. Following
 * `apps/server/test/routes/board.test.ts:80-87`'s reasoning — a `TZ`-varying
 * case over a value that does not move with `TZ` is a check that cannot fail —
 * this file adds none.
 */

const WS = newUlid();
const PROJECT = newUlid();
const OTHER_PROJECT = newUlid();
const USER_A = newUlid();
const WF = newUlid();
const TYPE = newUlid();

const SERVER_TIME = '2026-08-20T00:00:00.000Z';
const CLIENT_TIME = '2026-08-19T23:59:00.000Z';

const stateOf = (id: string, name: string, category: string) => ({ id, name, category });

const wfV1 = {
  id: WF,
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [stateOf('todo', 'To do', 'open'), stateOf('doing', 'Doing', 'active'), stateOf('done', 'Done', 'terminal')],
  transitions: [
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
};

const ticketTypeDef = { id: TYPE, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] };

let seqCounter = 0;
let streamCounter = 0;

function envelope(
  entity: { kind: 'ticket' | 'workflow' | 'ticket-type'; id: string },
  type: string,
  payload: unknown,
  opts: { seq?: number } = {},
): LedgerEvent {
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
    seq: opts.seq ?? seqCounter,
    workspaceSeq: streamCounter,
  };
}

const created = (ticketId: string, projectId = PROJECT): LedgerEvent =>
  envelope(
    { kind: 'ticket', id: ticketId },
    'ticket.created',
    { typeId: TYPE, projectId, parentId: null, title: 'Streamed' },
    { seq: 1 },
  );

const transitioned = (ticketId: string, to: string, seq: number): LedgerEvent =>
  envelope({ kind: 'ticket', id: ticketId }, 'ticket.transitioned', { to }, { seq });

function bootstrapOf(overrides: Partial<BootstrapResponse> = {}): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT, OTHER_PROJECT] },
    streamSeq: 7,
    definitions: [
      envelope({ kind: 'workflow', id: WF }, 'workflow.defined', wfV1, { seq: 1 }),
      envelope({ kind: 'ticket-type', id: TYPE }, 'ticket-type.defined', ticketTypeDef, { seq: 1 }),
    ],
    tickets: [],
    ...overrides,
  };
}

type Script = {
  bootstraps: number;
  subscribes: Array<{ afterSeq: number }>;
  closes: number;
  syncBatches: SubmittedEvent[][];
  handlers: StreamHandlers | null;
  bootstrapImpl: () => Promise<BootstrapResponse>;
  syncImpl: (events: SubmittedEvent[]) => Promise<SyncEventResult[]>;
  reconcileCalls: Array<{ workspaceId: string; heldIds: string[] }>;
  reconcileImpl: (workspaceId: string, heldIds: string[]) => Promise<ReconcileAnswer>;
};

const committedFor = (events: SubmittedEvent[]): SyncEventResult[] =>
  events.map((e, i) => ({
    status: 'committed' as const,
    eventId: e.id,
    seq: i + 1,
    workspaceSeq: 100 + i,
    serverTime: '2026-08-20T02:00:00.000Z',
  }));

function fakeTransport(script: Script): SyncTransport {
  return {
    async bootstrap() {
      script.bootstraps += 1;
      return script.bootstrapImpl();
    },
    async sync(events) {
      script.syncBatches.push(events);
      return script.syncImpl(events);
    },
    async reconcile(workspaceId, heldIds) {
      // Recorded, not merely answered: the reconcile cases assert WHAT was
      // presented, and a fake that only returned a verdict could not tell a
      // request naming three ids from one naming none.
      script.reconcileCalls.push({ workspaceId, heldIds });
      return script.reconcileImpl(workspaceId, heldIds);
    },
    openStream(_ws, afterSeq, handlers) {
      script.subscribes.push({ afterSeq });
      script.handlers = handlers;
      return {
        // `close()` DISPATCHES `onClose` SYNCHRONOUSLY, and that is the whole
        // reason this fake is written out rather than stubbed. A handle whose
        // `close()` only counted itself would make 12.163's "no reconnect was
        // scheduled" un-failable: the engine's own `closeStream` would never
        // re-enter `onClose`, so the branch that schedules a stray retry timer
        // is never reached and the assertion passes whatever `stall()` does.
        // `packages/app-core/test/online/stream.test.ts` reached this exact
        // conclusion one package over, with `SynchronousCloseWebSocket` and for
        // the stated reason that "a socket-count assertion cannot see this and
        // would have left the claim untested prose".
        close: () => {
          script.closes += 1;
          handlers.onClose();
        },
      };
    },
  };
}

type Fixture = { script: Script; replica: Replica; outbox: Outbox; engine: SyncEngine };

async function fixture(
  over: Partial<Pick<Script, 'syncImpl' | 'bootstrapImpl' | 'reconcileImpl'>> = {},
): Promise<Fixture> {
  seqCounter = 0;
  streamCounter = 0;
  const script: Script = {
    bootstraps: 0,
    subscribes: [],
    closes: 0,
    syncBatches: [],
    handlers: null,
    bootstrapImpl: over.bootstrapImpl ?? (async () => bootstrapOf()),
    syncImpl: over.syncImpl ?? (async (events) => committedFor(events)),
    reconcileCalls: [],
    // The default answer is "everything you named is still yours" — the state a
    // reconcile finds when nothing was narrowed, and the one that must purge
    // nothing.
    reconcileImpl:
      over.reconcileImpl ?? (async (workspaceId) => ({ workspaceId, restricted: [] })),
  };
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  const outbox = createOutbox({ storage, replica });
  const engine = createSyncEngine({ replica, outbox, transport: fakeTransport(script), reconnectDelayMs: 5 });
  return { script, replica, outbox, engine };
}

describe('12.156-12.164 + 12.169-12.170 sync engine lifecycle and flush', () => {
  it('12.156 bootstraps once, subscribes at the bootstrap cursor, and goes live at caught-up', async () => {
    const { script, replica, engine } = await fixture();
    await engine.start(WS);
    expect(script.bootstraps).toBe(1);
    expect(script.subscribes).toEqual([{ afterSeq: 7 }]);
    expect(engine.status()).toBe('catching-up');

    script.handlers!.onCaughtUp(9);
    await vi.waitFor(async () => expect(await replica.getCursor(WS)).toBe(9));
    expect(engine.status()).toBe('live');
    engine.stop();
    expect(engine.status()).toBe('offline');
  });

  it('12.157 a second start skips bootstrap and resumes from the persisted cursor', async () => {
    const { script, replica, engine } = await fixture();
    await engine.start(WS);
    script.handlers!.onCaughtUp(9);
    await vi.waitFor(async () => expect(await replica.getCursor(WS)).toBe(9));
    engine.stop();

    await engine.start(WS);
    expect(script.bootstraps).toBe(1); // no re-bootstrap
    expect(script.subscribes.at(-1)).toEqual({ afterSeq: 9 });
    engine.stop();
  });

  it('12.158 applies event and purge frames to the replica', async () => {
    const { script, replica, engine } = await fixture();
    await engine.start(WS);
    const ticketId = newUlid();

    script.handlers!.onItem(created(ticketId));
    await vi.waitFor(async () => expect((await replica.getTicket(ticketId))?.confirmed).not.toBeUndefined());

    script.handlers!.onItem({ kind: 'purge', entityId: ticketId });
    await vi.waitFor(async () => expect(await replica.getTicket(ticketId)).toBeNull());
    engine.stop();
  });

  it('12.159 caught-up triggers a flush of the queued outbox, in order', async () => {
    const { script, outbox, engine } = await fixture();
    await engine.start(WS);
    const t = newUlid();
    const e1 = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: t },
      type: 'ticket.created',
      payload: { typeId: TYPE, projectId: PROJECT, parentId: null, title: 'Queued' },
      actorId: USER_A,
      origin: 'desktop',
    });
    const e2 = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: t },
      type: 'ticket.transitioned',
      payload: { to: 'doing' },
      actorId: USER_A,
      origin: 'desktop',
    });
    expect(await outbox.enqueue(e1)).toMatchObject({ queued: true });
    expect(await outbox.enqueue(e2)).toMatchObject({ queued: true });

    script.handlers!.onCaughtUp(8);
    await vi.waitFor(async () => expect(await outbox.queuedCount(WS)).toBe(0));
    expect(script.syncBatches[0]!.map((e) => e.id)).toEqual([e1.id, e2.id]);
    engine.stop();
  });

  it('12.160 transport failure records a backoff and the claim is never lost', async () => {
    let calls = 0;
    const { outbox, engine } = await fixture({
      syncImpl: async (events) => {
        calls += 1;
        if (calls === 1) throw new Error('network down');
        return committedFor(events);
      },
    });
    await engine.start(WS);
    const e1 = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: newUlid() },
      type: 'ticket.created',
      payload: { typeId: TYPE, projectId: PROJECT, parentId: null, title: 'Retry me' },
      actorId: USER_A,
      origin: 'desktop',
    });
    expect(await outbox.enqueue(e1)).toMatchObject({ queued: true });

    await engine.flush();
    expect(calls).toBe(1);
    expect(await outbox.queuedCount(WS)).toBe(1); // still queued, not lost, not `failed`
    const items = await outbox.nextBatch(10, () => new Date('2100-01-01T00:00:00.000Z'));
    expect(items.map((i) => ({ id: i.eventId, attempts: i.attempts, status: i.status }))).toEqual([
      { id: e1.id, attempts: 1, status: 'queued' },
    ]);
    engine.stop();
  });

  it('12.161 stream close goes connecting and reconnects at the persisted cursor', async () => {
    const { script, replica, engine } = await fixture();
    await engine.start(WS);
    script.handlers!.onCaughtUp(9);
    await vi.waitFor(async () => expect(await replica.getCursor(WS)).toBe(9));

    const statuses: SyncStatus[] = [];
    engine.onStatus((s) => statuses.push(s));
    script.handlers!.onClose();
    await vi.waitFor(() => expect(script.subscribes.length).toBeGreaterThanOrEqual(2));
    expect(statuses).toContain('connecting');
    expect(script.subscribes.at(-1)).toEqual({ afterSeq: 9 });
    engine.stop();
  });

  it('12.162 an amendment-19 error frame is kept verbatim and does NOT advance the cursor', async () => {
    const { script, engine, replica } = await fixture();
    await engine.start(WS);
    const before = await replica.getCursor(WS);
    expect(engine.lastError()).toBeNull();

    // The server named a reason; the engine keeps it word for word so a shell
    // can show it. Swallowing it would leave the user staring at a stream that
    // has silently stopped delivering.
    script.handlers!.onError({ code: 'not-a-member', message: 'not a member of this workspace' });
    expect(engine.lastError()).toEqual({ code: 'not-a-member', message: 'not a member of this workspace' });
    expect(await replica.getCursor(WS)).toBe(before); // an errored stream has NOT caught up
    engine.stop();
  });

  /**
   * 12.163 — THE WEDGED-STREAM OBLIGATION (12.155's owner line), first half.
   *
   * `applyServerItem` throws per-arrival and rolls the envelope insert back with
   * it, so an item this replica cannot fold leaves NO local trace. 12.155 pins
   * that throw and hands this task the consequence: this engine is the first
   * caller with a cursor to advance, and the two obvious things to do with the
   * throw are both defects.
   *
   * - Swallow it and let `caught-up` advance the cursor anyway — the plan's own
   *   snippet, `.catch(() => undefined)` on both chains — and the item is
   *   skipped PERMANENTLY, silently, with the local ledger missing a row the
   *   server believes was delivered.
   * - Swallow it and pin the cursor — the item is redelivered on every
   *   reconnect and throws again on every reconnect: a hot loop that never
   *   converges and never says anything. That is the wedge the obligation names.
   *
   * So the engine STALLS instead: it stops the stream, does not reconnect, does
   * not move the cursor, and keeps the failure where a shell can read it. One
   * visible terminal state beats an invisible infinite one — the same
   * "prefer the failure that is loud" the 12.154 measurement reached from the
   * other side.
   *
   * *Mutation: replace `stall(...)` in `onItem`'s catch with `() => undefined`
   * (the plan's snippet) → red HERE AND ON 12.164, `Tests 2 failed | 12 passed
   * (14)`. This note first said "12.164 stays green", reasoning that a
   * swallowed item is exactly what lets `caught-up` advance past it — which is
   * true of the cursor and false of the case, because 12.164 waits for
   * `lastApplyFailure()` to appear before it sends the `caught-up` at all, and
   * a swallowed failure never appears. The mutation that separates the two is
   * 12.164's own, below.*
   */
  it('12.163 an item that throws stalls the stream instead of wedging it, and moves no cursor', async () => {
    const { script, replica, engine } = await fixture();
    await engine.start(WS);
    script.handlers!.onCaughtUp(9);
    await vi.waitFor(async () => expect(await replica.getCursor(WS)).toBe(9));

    const ticketId = newUlid();
    script.handlers!.onItem(created(ticketId));
    await vi.waitFor(async () => expect(await replica.getTicket(ticketId)).not.toBeNull());

    // A POSITIVE CONTROL from the same door: this fold succeeds, so the throw
    // below is the revocation and not a malformed fixture.
    script.handlers!.onItem(transitioned(ticketId, 'doing', 2));
    await vi.waitFor(async () =>
      expect((await replica.getTicket(ticketId))?.confirmed?.stateId).toBe('doing'),
    );
    expect(engine.lastApplyFailure()).toBeNull();

    // The project goes; the in-flight transition for its deleted ticket cannot
    // fold (12.155's project-scoped half).
    script.handlers!.onItem({ kind: 'scope-revoked', workspaceId: WS, projectId: PROJECT });
    await vi.waitFor(async () => expect(await replica.getTicket(ticketId)).toBeNull());
    const subscribesBefore = script.subscribes.length;

    // Every status the engine publishes from here on. `setStatus` de-duplicates,
    // and the engine is `live` at this point, so a correct stall publishes
    // exactly one: `offline`.
    const afterFailure: SyncStatus[] = [];
    engine.onStatus((next) => afterFailure.push(next));

    script.handlers!.onItem(transitioned(ticketId, 'done', 3));
    await vi.waitFor(() => expect(engine.lastApplyFailure()).not.toBeNull());
    expect(engine.lastApplyFailure()!.code).toBe('apply-failed');
    expect(engine.lastApplyFailure()!.message).toContain('never created');
    expect(engine.status()).toBe('offline');
    expect(await replica.getCursor(WS)).toBe(9); // the cursor did not move past what did not apply
    // …and the engine is not looping. The fake's `close()` dispatches `onClose`
    // synchronously, so this really does exercise the reconnect branch — and the
    // wait is LONGER THAN `reconnectDelayMs` (5 ms), because a timer that was
    // scheduled and never cleared fires later, not now, and an immediate
    // assertion would pass while it was still pending.
    expect(script.closes).toBeGreaterThanOrEqual(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(script.subscribes.length).toBe(subscribesBefore);
    // AND THE STATUS SEQUENCE, which is what makes the line above able to fail.
    // `stall()` sets `stalled` BEFORE it closes, so the re-entrant `onClose`
    // returns without publishing `connecting` and without arming a retry timer.
    // Set the flag AFTER the close instead and the engine publishes
    // `['connecting', 'offline']` and leaves a timer nothing clears — a timer
    // that outlives the stall. The subscription count alone cannot see that,
    // because the timer's own guard reads `stalled` when it fires; this can.
    expect(afterFailure).toEqual(['offline']);
    engine.stop();
  });

  /**
   * 12.164 — THE SECOND DOOR OF THE SAME PAIR.
   *
   * The plan's snippet writes `.catch(() => undefined)` TWICE — once on
   * `onItem`'s chain and once on `onCaughtUp`'s — and the cursor advance lives
   * on the second one. Fixing only the first leaves the skip intact: the item
   * fails, nothing stops the stream, `caught-up` arrives and writes a cursor
   * that claims the failed item was handled.
   *
   * This case exists because the highest-yield defect shape in this codebase is
   * a behaviour implemented on one door of a pair, and this pair is inside a
   * single function.
   *
   * *Mutation: drop the `stalled` guard from `onCaughtUp`'s chain → red here
   * ALONE (`Tests 1 failed | 13 passed (14)`); 12.163 stays green because it
   * never sends a `caught-up` after the throw.*
   */
  /**
   * 12.169 — A RESULTS ARRAY THAT DOES NOT MATCH ITS BATCH APPLIES NOTHING.
   *
   * `sync-routes.ts` states the answer is index-aligned with the request array,
   * so index IS the contract — and every result but `invalid` also carries its
   * own `eventId`, which makes the contract checkable. Applying a verdict to
   * the wrong claim is the one outcome that cannot be walked back: `committed`
   * folds a server position into the local ledger and deletes the row, and
   * `refused` marks a claim terminally failed. A transient failure loses
   * nothing by comparison — every row stays queued and is offered again.
   *
   * THE CHECK RUNS OVER THE WHOLE BATCH BEFORE ANYTHING IS APPLIED, and the
   * second half below is why. An array shifted by one disagrees at the
   * positions carrying an id and NOT at a position carrying an `invalid` with
   * `eventId: null` — so a per-position check that applied as it went would
   * have already filed a stranger's verdict against that row by the time it
   * reached the position that proves the shift.
   *
   * *Mutation: apply per position and record the disagreements afterwards —
   * the shape this loop had first — → red here alone; the `invalid` result
   * lands on `e1` and `queuedCount` comes back 1 instead of 2.*
   */
  it('12.169 a misaligned or short results array records a failure and applies nothing', async () => {
    // A FRESH FIXTURE PER HALF, and it is not tidiness. `recordFailure` pushes
    // `next_attempt_at` out by `backoffMs(1)` = 2 s, so a second `flush()` on
    // the same outbox finds NOTHING due, returns immediately, and never reaches
    // the transport — the second half would then assert over a batch that was
    // never sent, which is a check that cannot fail. `flush()` takes no clock,
    // so a new outbox is how the halves stay independent.
    async function runOne(answer: SyncEventResult[]): Promise<{
      queued: Array<{ id: string; status: string }>;
      failed: number;
      sent: number;
      ids: [string, string];
    }> {
      const { script, outbox, engine } = await fixture({ syncImpl: async () => answer });
      await engine.start(WS);
      const claim = (title: string): SubmittedEvent =>
        newSubmittedEvent({
          workspaceId: WS,
          entity: { kind: 'ticket', id: newUlid() },
          type: 'ticket.created',
          payload: { typeId: TYPE, projectId: PROJECT, parentId: null, title },
          actorId: USER_A,
          origin: 'desktop',
        });
      const e1 = claim('First');
      const e2 = claim('Second');
      expect(await outbox.enqueue(e1)).toMatchObject({ queued: true });
      expect(await outbox.enqueue(e2)).toMatchObject({ queued: true });
      // The answer is written against THESE ids, which only exist now.
      for (const r of answer) {
        if (r.status === 'committed' && r.eventId === 'SECOND') r.eventId = e2.id;
        if (r.status === 'committed' && r.eventId === 'FIRST') r.eventId = e1.id;
      }
      await engine.flush();
      const rows = await outbox.nextBatch(10, () => new Date('2100-01-01T00:00:00.000Z'));
      const out = {
        queued: rows.map((r) => ({ id: r.eventId, status: r.status })),
        failed: (await outbox.failedItems(WS)).length,
        sent: script.syncBatches.length,
        ids: [e1.id, e2.id] as [string, string],
      };
      engine.stop();
      return out;
    }

    // HALF ONE — the server answered for one event out of two.
    const short = await runOne([
      { status: 'committed', eventId: 'FIRST', seq: 1, workspaceSeq: 200, serverTime: '2026-08-20T02:00:00.000Z' },
    ]);
    expect(short.sent).toBe(1); // the batch really did reach the transport
    expect(short.queued).toEqual([
      { id: short.ids[0], status: 'queued' },
      { id: short.ids[1], status: 'queued' },
    ]);
    expect(short.failed).toBe(0);

    // HALF TWO — two answers, but SHIFTED: e2's verdict sits at e1's position
    // and an id-less `invalid` sits at e2's. A per-position loop applies the
    // first entry to e1 before it ever sees a disagreement, because the entry
    // that would disagree is the one carrying no id to disagree with.
    const shifted = await runOne([
      { status: 'committed', eventId: 'SECOND', seq: 1, workspaceSeq: 201, serverTime: '2026-08-20T02:00:00.000Z' },
      { status: 'invalid', eventId: null, code: 'bad-envelope', message: 'unreadable' },
    ]);
    expect(shifted.sent).toBe(1);
    expect(shifted.queued).toEqual([
      { id: shifted.ids[0], status: 'queued' },
      { id: shifted.ids[1], status: 'queued' },
    ]);
    expect(shifted.failed).toBe(0); // nothing was judged
  });

  it('12.164 a caught-up arriving after a failed item does NOT advance the cursor', async () => {
    const { script, replica, engine } = await fixture();
    await engine.start(WS);
    script.handlers!.onCaughtUp(9);
    await vi.waitFor(async () => expect(await replica.getCursor(WS)).toBe(9));

    const ticketId = newUlid();
    script.handlers!.onItem(transitioned(ticketId, 'doing', 1)); // a ticket that was never created
    await vi.waitFor(() => expect(engine.lastApplyFailure()).not.toBeNull());

    script.handlers!.onCaughtUp(42);
    // Nothing to wait for — assert the absence after the chain has drained.
    await engine.settled();
    expect(await replica.getCursor(WS)).toBe(9);
    engine.stop();
  });

  /**
   * 12.170 — THE THIRD DOOR INTO `applyServerItem`, WHICH "BOTH DOORS OF THE
   * PAIR" DID NOT COVER.
   *
   * 12.163 and 12.164 pin the two CURSOR chains, and the sentence they earned —
   * "the guard is on both doors of the pair" — was true of those two and blind
   * to a third: `outbox.applyResult` on a `committed` verdict folds the
   * envelope through the SAME `replica.applyServerItem`, and the flush loop
   * called it with no catch. The highest-yield defect shape in this codebase is
   * a behaviour implemented on one door of a pair; this is the same shape with
   * the pair miscounted, which is worse, because the count was written down and
   * believed.
   *
   * MEASURED BEFORE THE FIX, on exactly this sequence: `flush()` REJECTED with
   * `applyTicketEvent: ticket.transitioned for ticket … that was never
   * created`; `status()` was `catching-up`, not stalled; `lastApplyFailure()`
   * was `null`, so a shell could see nothing at all; the outbox row stood at
   * `attempts: 0, status: 'queued'` because `recordFailure` never ran, so
   * `next_attempt_at` was never pushed out; and the next `flush()` re-sent the
   * IDENTICAL batch. That is verbatim the failure `sync-engine.ts`'s own
   * docblock says the engine exists to prevent — "the same item is redelivered
   * and throws again: a hot loop that never converges and never says anything."
   *
   * And `onCaughtUp` reaches this same code through its own
   * `await engine.flush()`, where the rejection instead became `stall(err,
   * null)`. So identical input yielded a visible terminal stall on one path and
   * a silent no-backoff resubmit on the other, one `await` apart.
   *
   * *Mutation: delete the `try`/`catch` around `outbox.applyResult` in `flush`
   * (the shape the loop shipped in) → red HERE ALONE
   * (`Tests 1 failed | 15 passed (16)` in this file), with
   * `Error: applyTicketEvent: … that was never created` thrown out of the
   * unguarded `await engine.flush()`. 12.163 and 12.164 stay green, because
   * neither of them flushes a claim the replica cannot fold — which is the
   * whole reason this door went unnoticed.*
   */
  it('12.170 a committed verdict the replica cannot fold stalls the flush door, with backoff and no resubmit', async () => {
    const { script, replica, outbox, engine } = await fixture();
    await engine.start(WS);
    script.handlers!.onCaughtUp(9);
    await vi.waitFor(async () => expect(await replica.getCursor(WS)).toBe(9));

    const ticketId = newUlid();
    script.handlers!.onItem(created(ticketId));
    await vi.waitFor(async () => expect(await replica.getTicket(ticketId)).not.toBeNull());

    // Queued while the ticket is still here, so the pre-check passes: the claim
    // is legal when it is made and unfoldable by the time it is answered. That
    // gap is the whole scenario, and it is not contrived — it is 12.155's
    // project-scoped half with a claim already in the outbox.
    const claim = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.transitioned',
      payload: { to: 'doing' },
      actorId: USER_A,
      origin: 'desktop',
    });
    expect(await outbox.enqueue(claim)).toMatchObject({ queued: true });

    // The project goes; the ticket goes with it and the outbox row deliberately
    // stays (`buildPendingOverlay`'s note: the claim is unrenderable, not lost).
    script.handlers!.onItem({ kind: 'scope-revoked', workspaceId: WS, projectId: PROJECT });
    await vi.waitFor(async () => expect(await replica.getTicket(ticketId)).toBeNull());
    expect(await outbox.queuedCount(WS)).toBe(1);

    // The server says `committed`. The fold throws anyway — and this line
    // RESOLVING rather than rejecting is half of what the case asserts.
    await engine.flush();

    expect(engine.lastApplyFailure()).not.toBeNull();
    expect(engine.lastApplyFailure()!.code).toBe('apply-failed');
    expect(engine.lastApplyFailure()!.message).toContain('never created');
    expect(engine.status()).toBe('offline'); // the same terminal state 12.163 reaches

    // Backoff was applied, so nothing is due now — printed as the rows, not as
    // a count, on both sides of the clock.
    expect(await outbox.nextBatch()).toEqual([]);
    const later = await outbox.nextBatch(10, () => new Date('2100-01-01T00:00:00.000Z'));
    expect(later.map((i) => ({ id: i.eventId, attempts: i.attempts, status: i.status }))).toEqual([
      { id: claim.id, attempts: 1, status: 'queued' },
    ]);

    // …and the batch is not re-sent. Enumerated as the ids that reached the
    // transport rather than counted: before the fix this read the same id twice.
    await engine.flush();
    expect(script.syncBatches.map((b) => b.map((e) => e.id))).toEqual([[claim.id]]);
    engine.stop();
  });
});

describe('12.165-12.166 the bootstrap door, which this engine is the first production caller of', () => {
  /**
   * 12.165 — THE BASELINE-LOWERING OBLIGATION (12.154's owner line).
   *
   * 12.154 measures the hazard one layer down: `writeSnapshot`'s unconditional
   * `ON CONFLICT … DO UPDATE SET seq = excluded.seq` lowers a baseline the
   * stream door raised, and the obvious `Math.max` guard was applied, measured
   * and REJECTED — it trades a loud throw for a silent divergence in the
   * transition log `require-different-user` sorts on.
   *
   * So this task does not re-apply the rejected remedy. It closes the door it
   * actually owns: THIS ENGINE NEVER RE-BOOTSTRAPS A REPLICA THAT HOLDS A LOCAL
   * BASELINE. The plan's guard is `cursor === 0 && getMe() === null`, and the
   * `me` half is what fails here — a replica whose bootstrap carried
   * `streamSeq: 0` (an empty workspace) has a cursor of 0 and a `me`, then folds
   * a streamed ticket and raises a snapshot baseline while the cursor is still
   * 0 because no `caught-up` has arrived. A restart with the plan's guard sees
   * `cursor === 0`, sees `me`, skips the bootstrap — and the plan's OTHER
   * branch, `cursor === 0 && me === null`, is the one that would have
   * re-bootstrapped. Neither reading is safe on its own, so the engine asks the
   * question the hazard is actually about: is there a local baseline for a
   * stale server snapshot to lower?
   *
   * *Mutation: make `needsBootstrap` ask `cursor === 0` alone — the repair
   * 12.166 invites, with the baseline question dropped — → red HERE ALONE,
   * `Tests 1 failed | 13 passed (14)`: `bootstraps` comes back 2. The plan's
   * guard verbatim (`cursor === 0 && me === null`) leaves this case GREEN and
   * reddens 12.166 instead, which is measured on that case; this note claimed
   * the opposite until both mutations were actually run.*
   *
   * *WHAT THIS CASE DOES NOT CLAIM: that a re-bootstrap here would throw. The
   * harm a lowered baseline does is 12.154's, measured there against a stale
   * server snapshot; this case pins the engine's refusal to open that door, and
   * nothing more. "Unreachable through this door" is one sentence away from
   * "unreachable because nothing calls `loadBootstrap` twice", which this branch
   * already falsified once — so the reachability claim is scoped to the caller
   * this task owns and is stated as a mutation, not as prose.*
   */
  it('12.165 does not re-bootstrap a replica that holds a local baseline, even at cursor 0', async () => {
    const { script, replica, engine } = await fixture({ bootstrapImpl: async () => bootstrapOf({ streamSeq: 0 }) });
    await engine.start(WS);
    expect(script.bootstraps).toBe(1);
    expect(await replica.getCursor(WS)).toBe(0);

    const ticketId = newUlid();
    const createdEvent = created(ticketId);
    script.handlers!.onItem(createdEvent);
    await vi.waitFor(async () => expect(await replica.getTicket(ticketId)).not.toBeNull());
    engine.stop();

    // The cursor is still 0 — no `caught-up` ever arrived — but the replica now
    // holds a folded ticket, which is exactly what a stale server snapshot would
    // lower the baseline of.
    expect(await replica.getCursor(WS)).toBe(0);
    await engine.start(WS);
    expect(script.bootstraps).toBe(1);
    expect(script.subscribes.at(-1)).toEqual({ afterSeq: 0 });
    // Re-delivery from 0 is safe and is the protocol's own failure mode:
    // duplicates are no-ops by envelope id.
    script.handlers!.onItem(createdEvent);
    await engine.settled();
    expect(engine.lastApplyFailure()).toBeNull();
    engine.stop();
  });

  /**
   * 12.166 — WHERE THE TWO OBLIGATIONS MEET.
   *
   * `revokeScope` on a workspace-wide instruction deletes the tickets, the
   * definitions AND `meta cursor:<workspaceId>` — but NOT `me`. So the replica
   * afterwards has `cursor === 0` and a non-null `me`, which is precisely the
   * combination the plan's guard refuses to bootstrap. Refusing would resume a
   * stream at 0 into a replica with no `workflows` and no `ticket_types`, where
   * 12.155's workspace-wide half says every `ticket.created` throws
   * `unknown ticket type` — a wedge on the first frame.
   *
   * `stream-frames.ts` prescribes the other answer in words: a scope revocation
   * carries no cursor and "the correct client move afterwards is a fresh
   * bootstrap rather than a resume". The baseline hazard does not apply, because
   * the revocation deleted every local baseline first.
   *
   * *Mutation: the plan's guard verbatim (`cursor === 0 && me === null`) → red
   * here ALONE (`Tests 1 failed | 13 passed (14)`), `bootstraps` stays 1. That
   * is the same mutation 12.165's note names as leaving 12.165 green, and the
   * pair is the point: neither half of the plan's condition is the question
   * this door has to ask.*
   */
  it('12.166 re-bootstraps after a workspace-wide revocation, which clears the cursor but not `me`', async () => {
    const { script, replica, engine } = await fixture();
    await engine.start(WS);
    script.handlers!.onCaughtUp(9);
    await vi.waitFor(async () => expect(await replica.getCursor(WS)).toBe(9));

    script.handlers!.onItem({ kind: 'scope-revoked', workspaceId: WS });
    await vi.waitFor(async () => expect(await replica.getCursor(WS)).toBe(0));
    expect(await replica.getMe()).not.toBeNull(); // the state the plan's guard trips over
    // A workspace-wide revocation is terminal for the subscription: reconnecting
    // into a workspace you were just removed from earns `not-a-member` forever.
    expect(engine.status()).toBe('offline');

    await engine.start(WS);
    expect(script.bootstraps).toBe(2);
    expect(script.subscribes.at(-1)).toEqual({ afterSeq: 7 });
    engine.stop();
  });
});

describe('12.167-12.168 + 12.171 the HTTP/WS transport', () => {
  class FakeSocket implements WebSocketLike {
    sent: string[] = [];
    closed = 0;
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    send(data: string): void {
      this.sent.push(data);
    }
    close(): void {
      this.closed += 1;
    }
  }

  function transportFixture() {
    let socket: FakeSocket | null = null;
    const urls: string[] = [];
    const transport = createHttpTransport({
      baseUrl: 'https://api.example',
      token: 'tok',
      webSocketFactory: (url) => {
        urls.push(url);
        socket = new FakeSocket();
        return socket;
      },
    });
    return { transport, urls, socketOf: (): FakeSocket => socket! };
  }

  /**
   * 12.167 — EVERY FRAME THE SERVER CAN SEND REACHES A HANDLER.
   *
   * The plan's `openStream` snippet declares a five-member frame union inline
   * and `scope-revoked` is not one of them, so a revoked device would be told
   * nothing and keep showing work it was removed from — the exact failure
   * `visible-events-for.ts` names when it explains why the instruction exists.
   * Executor ruling: no local frame union at all. This transport switches on
   * `ServerStreamFrame['type']` from `@gisik-nokma/domain`, and
   * `http-transport.ts` carries a compile-time assertion that the switch covers
   * every member of it.
   *
   * The assertion pins the frame TYPE STRINGS, not that the handling is right —
   * which is what this case is for.
   */
  it('12.167 delivers all five server frames and answers ping with pong', async () => {
    const { transport, urls, socketOf } = transportFixture();
    const seen: string[] = [];
    const items: SyncItem[] = [];
    const handle = transport.openStream(WS, 4, {
      onItem: (item) => {
        seen.push('item');
        items.push(item);
      },
      onCaughtUp: (seq) => seen.push(`caught-up:${seq}`),
      onError: (err) => seen.push(`error:${err.code}`),
      onClose: () => seen.push('close'),
    });
    expect(urls).toEqual(['wss://api.example/v1/stream']);
    const socket = socketOf();
    socket.onopen!({});
    expect(JSON.parse(socket.sent[0]!)).toEqual({ type: 'subscribe', workspaceId: WS, afterSeq: 4 });

    const env = created(newUlid());
    const send = (frame: unknown): void => socket.onmessage!({ data: JSON.stringify(frame) });
    send({ type: 'event', envelope: env });
    send({ type: 'purge', workspaceId: WS, entityId: 'ticket_x' });
    send({ type: 'scope-revoked', workspaceId: WS });
    send({ type: 'caught-up', workspaceId: WS, seq: 12 });
    send({ type: 'error', workspaceId: WS, code: 'bad-message', message: 'nope' });
    send({ type: 'ping' });

    expect(seen).toEqual(['item', 'item', 'item', 'caught-up:12', 'error:bad-message']);
    expect(items).toEqual([env, { kind: 'purge', entityId: 'ticket_x' }, { kind: 'scope-revoked', workspaceId: WS }]);
    expect(socket.sent.map((s) => JSON.parse(s).type)).toEqual(['subscribe', 'pong']);

    socket.onclose!({});
    expect(seen.at(-1)).toBe('close');
    handle.close();
    expect(socket.closed).toBe(1);
  });

  /**
   * 12.168 — WHAT THE PARSER REFUSES, AND WHY IT IS LENIENT EVERYWHERE ELSE.
   *
   * The same one-directional relationship `app-core/src/online/stream.ts`
   * argues for: this client is deliberately MORE permissive than
   * `serverStreamFrameSchema` about id shape, because a client that hard-drops
   * a frame it could have delivered fails silently. The one field held to the
   * server's own rule is `envelope.workspaceSeq` — a positive integer — because
   * a frame without it is one this subscriber cannot resume from.
   *
   * Cross-workspace **`purge`, `scope-revoked` and `caught-up`** frames are
   * dropped rather than delivered: those three carry a top-level `workspaceId`,
   * one socket holds one subscription, and honouring one from another workspace
   * would advance THIS cursor by a number that means nothing here, or empty a
   * replica nobody revoked (amendment 19). The `error` frame is the exception —
   * it carries `workspaceId: null` for connection-level errors raised before any
   * subscribe.
   *
   * **AN `event` FRAME IS NOT IN THAT LIST, and this docblock used to say it
   * was.** The `event` branch returns before the `frame.workspaceId !==
   * workspaceId` line, and it checks `envelope.workspaceSeq` and nothing else —
   * so an envelope naming another workspace IS delivered to `onItem`. The
   * transport's own inline comment enumerates the three correctly; only this
   * summary and `Features.md`'s overstated it. *Recorded, not fixed: the guard
   * is a behaviour change with its own case, not a prose repair, and the honest
   * move is to say what the code does. Owner: Plan 10 Task 12, which owns the
   * transport seam next.* The row below is the enumeration of what this case
   * actually drops.
   */
  it('12.168 drops unparseable, unresumable and cross-workspace purge/caught-up/scope-revoked frames, and keeps connection-level errors', () => {
    const { transport, socketOf } = transportFixture();
    const seen: string[] = [];
    transport.openStream(WS, 0, {
      onItem: () => seen.push('item'),
      onCaughtUp: (seq) => seen.push(`caught-up:${seq}`),
      onError: (err) => seen.push(`error:${err.code}`),
      onClose: () => seen.push('close'),
    });
    const socket = socketOf();
    const send = (raw: unknown): void => socket.onmessage!({ data: raw });
    const sendFrame = (frame: unknown): void => send(JSON.stringify(frame));

    send('{not json');
    send({ type: 'caught-up', workspaceId: WS, seq: 3 }); // not a string
    sendFrame({ type: 'unknown-frame', workspaceId: WS });
    sendFrame({ type: 'event', envelope: { ...created(newUlid()), workspaceSeq: 0 } });
    sendFrame({ type: 'purge', workspaceId: newUlid(), entityId: 'ticket_y' });
    sendFrame({ type: 'caught-up', workspaceId: newUlid(), seq: 99 });
    sendFrame({ type: 'scope-revoked', workspaceId: newUlid() });
    expect(seen).toEqual([]);

    sendFrame({ type: 'error', workspaceId: null, code: 'bad-message', message: 'before subscribe' });
    expect(seen).toEqual(['error:bad-message']);
  });

  /**
   * 12.171 — `caught-up.seq` IS HELD TO THE SAME RULE AS
   * `envelope.workspaceSeq`, AND IT IS THE ONE THAT PERSISTS.
   *
   * The `event` branch four lines above refuses a frame whose `workspaceSeq` is
   * not a positive integer, with a docblock arguing that a frame carrying no
   * resumable position must be refused. The `caught-up` branch accepted its
   * `seq` on `typeof 'number'` alone — and THAT is the value written to durable
   * storage: `replica.setCursor` stores `String(seq)` and `getCursor` returns
   * `Number(value)`. So the weaker check guarded the more dangerous field.
   *
   * `1e999` IS THE REACHABLE ONE. JSON has no NaN literal, but `1e999` is legal
   * JSON and `JSON.parse` yields `Infinity` with `typeof 'number'` — asserted
   * below rather than asserted about, and sent as a RAW STRING rather than
   * through `JSON.stringify`, because `JSON.stringify(Infinity)` is `"null"`
   * and a round-tripped fixture would test a frame the wire cannot send.
   * Measured one layer down before the fix: the cursor persisted as
   * `"Infinity"`, `getCursor` returned `Infinity`, `needsBootstrap` was false
   * forever because `Infinity !== 0`, and every later subscribe serialised as
   * `{"afterSeq":null}` — a device that can neither resume nor re-bootstrap,
   * silently, across process restarts.
   *
   * `seq: 0` IS ACCEPTED, and that half is the non-vacuity control rather than
   * a courtesy: `readStreamSeq` answers 0 for an empty workspace, so copying
   * the event branch's `> 0` here would strand every empty workspace at
   * `catching-up` forever. The two branches are deliberately different bounds.
   *
   * *Mutation: restore `if (typeof frame.seq !== 'number') return;` → red HERE
   * ALONE (`Tests 1 failed | 15 passed (16)` in this file), with
   * `['caught-up:Infinity', 'caught-up:-1', 'caught-up:1.5']` delivered where
   * the case expects nothing. Every other case in this file drives
   * `onCaughtUp` through the fake handlers directly and never through the
   * parser, which is exactly why nothing caught this.*
   */
  it('12.171 refuses a caught-up seq that is not a non-negative integer, and accepts zero', () => {
    // The premise, checked rather than asserted: this is what the wire can send.
    expect((JSON.parse('{"seq":1e999}') as { seq: number }).seq).toBe(Infinity);

    const { transport, socketOf } = transportFixture();
    const seen: string[] = [];
    transport.openStream(WS, 0, {
      onItem: () => seen.push('item'),
      onCaughtUp: (seq) => seen.push(`caught-up:${seq}`),
      onError: (err) => seen.push(`error:${err.code}`),
      onClose: () => seen.push('close'),
    });
    const socket = socketOf();
    const send = (raw: string): void => socket.onmessage!({ data: raw });

    send(`{"type":"caught-up","workspaceId":"${WS}","seq":1e999}`);
    send(`{"type":"caught-up","workspaceId":"${WS}","seq":-1}`);
    send(`{"type":"caught-up","workspaceId":"${WS}","seq":1.5}`);
    send(`{"type":"caught-up","workspaceId":"${WS}","seq":"9"}`);
    expect(seen).toEqual([]);

    // Both legitimate positions: an empty workspace, and a populated one.
    send(`{"type":"caught-up","workspaceId":"${WS}","seq":0}`);
    send(`{"type":"caught-up","workspaceId":"${WS}","seq":12}`);
    expect(seen).toEqual(['caught-up:0', 'caught-up:12']);
  });
});

describe('reconcile — closure 5, the narrow half (ruling P37)', () => {
  /**
   * The engine presents what the replica holds and deletes what comes back
   * `restricted`. Two properties matter here and neither is the server's:
   *
   * 1. **What is presented is what is held**, not a guess and not everything.
   * 2. **What is purged is a subset of what was presented.** The server cannot
   *    name anything else — its reply is built by walking the request — but a
   *    purge is destructive and LOCAL, and this device does not need to trust a
   *    remote party to be safe from it. That guard is the one 12.287 kills.
   */
  async function withTickets(
    reconcileImpl?: Script['reconcileImpl'],
  ): Promise<{ f: Fixture; a: string; b: string }> {
    const a = newUlid();
    const b = newUlid();
    const f = await fixture(reconcileImpl === undefined ? {} : { reconcileImpl });
    await f.replica.loadBootstrap(bootstrapOf());
    for (const id of [a, b]) {
      await f.replica.applyServerItem(
        envelope({ kind: 'ticket', id }, 'ticket.created', {
          typeId: TYPE,
          projectId: PROJECT,
          parentId: null,
          title: `Ticket ${id}`,
        }),
      );
    }
    // The fixture is real before anything is asked of it: a reconcile against a
    // replica holding nothing would satisfy every assertion below vacuously.
    expect((await f.replica.listTickets(WS)).map((t) => t.ticketId).sort()).toEqual([a, b].sort());
    return { f, a, b };
  }

  it('12.287 presents exactly the ids it holds, purges only those the server named among them, and refuses an id it never presented', async () => {
    const { f, a, b } = await withTickets();
    // First: the ordinary answer. Nothing is stale, so nothing goes — and
    // `presented` still says the question was asked, which a bare void return
    // could not distinguish from "there was nothing to ask about".
    const quiet = await f.engine.reconcile(WS);
    expect(quiet).toEqual({ presented: 2, purged: [] });
    expect(f.script.reconcileCalls).toHaveLength(1);
    expect(f.script.reconcileCalls[0]?.workspaceId).toBe(WS);
    expect([...(f.script.reconcileCalls[0]?.heldIds ?? [])].sort()).toEqual([a, b].sort());
    expect((await f.replica.listTickets(WS)).map((t) => t.ticketId).sort()).toEqual([a, b].sort());

    // Now an answer that restricts one HELD id and one the client never
    // presented.
    //
    // `neverPresented` is a fresh ULID the replica has never seen. An earlier
    // version of this comment called it "a ticket the device legitimately holds
    // in this very fixture", which was FALSE — the branch review caught it. The
    // distinction matters for what the case proves: with a stranger id the
    // guard's absence is observable only as an extra `purgeEntity` call on
    // nothing, so the assertion that carries the property is `result.purged`
    // being exactly one entry. That is asserted below, and `purged` is pushed
    // only after the purge runs, so an unguarded engine would report two.
    const neverPresented = newUlid();
    // The answer names the FIRST id the replica presents plus one it did not.
    // Reading the presented list inside the impl keeps the two in step without
    // a forward reference to a value the fixture has not minted yet.
    const { f: f2, b: b2 } = await withTickets(async (workspaceId, heldIds) => ({
      workspaceId,
      restricted: [
        { kind: 'restricted' as const, id: heldIds[0] ?? '' },
        { kind: 'restricted' as const, id: neverPresented },
      ],
    }));
    const presentedFirst = (await f2.replica.listTickets(WS)).map((t) => t.ticketId)[0] ?? '';
    const result = await f2.engine.reconcile(WS);
    // ONLY the presented one went. The unpresented id named in the same answer
    // purged nothing — and it is a ticket this replica really holds, so a client
    // that trusted the answer wholesale would have deleted it.
    expect(result.purged).toEqual([presentedFirst]);
    expect(result.presented).toBe(2);
    expect(await f2.replica.getTicket(presentedFirst)).toBeNull();
    expect(await f2.replica.listEntityEvents(presentedFirst)).toEqual([]);
    const survivors = (await f2.replica.listTickets(WS)).map((t) => t.ticketId);
    expect(survivors).toHaveLength(1);
    expect(survivors[0]).not.toBe(presentedFirst);
    expect(neverPresented).not.toBe(b2);
  });
});
