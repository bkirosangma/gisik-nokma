import { describe, expect, it, vi } from 'vitest';
import { newSubmittedEvent, newUlid, parseEvent, type LedgerEvent, type SubmittedEvent } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { createReplica, type BootstrapResponse, type Replica, type TicketBootstrap } from '../src/replica/replica.js';
import type { SyncItem } from '../src/replica/sync-item.js';
import { createOutbox, type Outbox, type SyncEventResult } from '../src/outbox/outbox.js';
import {
  createSyncEngine,
  type StreamHandlers,
  type SyncEngine,
  type SyncStatus,
  type ReconcileAnswer,
  type SyncTransport,
  TicketPullNotFound,
} from '../src/engine/sync-engine.js';
import { createHttpTransport, type WebSocketLike } from '../src/net/http-transport.js';

/**
 * The `invalid` code every fixture in this file carries, taken FROM THE REAL
 * PARSER rather than written down — case 12.327.
 *
 * It used to be the literal `'bad-envelope'`, and no server has ever emitted
 * that code. The envelope arm is `'malformed-envelope'` (`parse-event.ts`), and
 * the union the sync door narrows to is `IngestErrorCode | 'actor-mismatch' |
 * 'reserved-type'`. The fixture had drifted from the vocabulary it was
 * imitating, and nothing could see it: `SyncEventResult.code` is deliberately
 * `string` on this side (a client's job with an invalid answer is to SHOW it,
 * not to classify it — see `outbox.ts`), so no type refused the invention and
 * no assertion read it.
 *
 * Replacing one literal with a better literal would fix today and drift again.
 * So there is no literal: `parseEvent` is `@gisik-nokma/domain`'s and is the
 * SAME function the server's ingest door calls, and the code below is whatever
 * it actually answers for a malformed envelope. The drift class is removed
 * structurally rather than corrected.
 *
 * The `if (answer.ok) throw` is not defensive noise — it is the non-vacuity
 * guard. Without it a `parseEvent` that started ACCEPTING this input would
 * leave `code` undefined and the fixtures would carry `undefined` silently,
 * which is exactly the shape of the defect being closed.
 *
 * **It is deliberately NOT annotated `: string`.** Left to infer, it is
 * `EnvelopeErrorCode` — a member of `IngestErrorCode`, and therefore it
 * survives the narrowing `outbox.ts`'s `SyncEventResult` docblock prices. An
 * explicit `: string` would widen it back and re-create the cost this fixture
 * edit just paid off. The absence of the annotation is load-bearing, so it is
 * named rather than left looking like an oversight.
 *
 * What this canNOT witness, said plainly: that the SERVER SENDS this code over
 * the wire. `parseEvent` is pure and shared, and agreeing with a shared
 * function is not agreeing with a running door. Case 12.362 is that half,
 * against `POST /v1/sync` through `inject()`, and it lives in the server
 * package because this one may not depend on `apps/server`.
 */
const MALFORMED_ENVELOPE_CODE = (() => {
  const answer = parseEvent({ not: 'an envelope' });
  if (answer.ok) throw new Error('12.327 precondition: parseEvent accepted a malformed envelope');
  return answer.code;
})();

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
 * engine's cases to that file would silently falsify both.
 *
 * This file's own denominator is `Tests 27 passed (27)` **on Node v22.22.2**,
 * re-measured at this tree after closure 5c added 12.309–12.313 AND after ruling
 * P37.2 changed the notice from `ticketIds: string[]` to
 * `tickets: { id, headSeq }[]` mid-lane — every notice literal in this file
 * carries a head now, and 12.305, 12.312 and 12.313 assert the comparison rather
 * than a holdings test. It read `(22)`
 * until then, and that number was itself RED rather than stale when this lane
 * arrived: the branch's own fix had turned 12.163 and 12.164 from stall cases
 * into pull cases, `Tests 2 failed | 20 passed (22)`, and both were re-witnessed
 * here rather than deleted (see 12.163's docblock). **The MUTATION numbers quoted
 * per case were measured at the pre-P37.2 tree and are labelled as such; the
 * ledger at the foot of this file says which were re-run and which are
 * predictions.** It
 * read `(16)` before closure 5b and was ALREADY WRONG at 17 before those five landed —
 * the same written-down-count staleness the parenthesis two paragraphs up spends
 * a page recording, caught here only because a lane re-ran the number instead of
 * copying it. **The Node version is part of the measurement, not decoration:**
 * `package.json` declares `>=22.0.0 <23` and `better-sqlite3`'s native binding
 * refuses any other major, so on the Node 24 that is default on some machines
 * this file reddens 14 of its cases with `NODE_MODULE_VERSION 127 … requires
 * 137` and nothing wrong in it. A denominator that does not name its Node is
 * not evidence.
 *
 * The package's `Tests 63 passed (63)` is quoted as the number it WAS and is
 * deliberately not restated as current: closure 5b's lane is authorized for
 * this one file and did not re-run the package, and a count carried forward
 * under a fresh sentence is exactly the move this docblock exists to refuse.
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
  /** Closure 5b(d): every per-ticket pull the engine made, in order. */
  pullCalls: Array<{ workspaceId: string; ticketId: string }>;
  pullImpl: (workspaceId: string, ticketId: string) => Promise<TicketBootstrap>;
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
    async bootstrapTicket(workspaceId, ticketId) {
      // Recorded for the same reason `reconcile` is: the closure 5b(d) cases
      // assert WHICH tickets were pulled and in what order, and a fake that
      // only returned a payload could not tell a drain that fetched two from
      // one that fetched the same one twice.
      script.pullCalls.push({ workspaceId, ticketId });
      return script.pullImpl(workspaceId, ticketId);
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
  over: Partial<Pick<Script, 'syncImpl' | 'bootstrapImpl' | 'reconcileImpl' | 'pullImpl'>> = {},
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
    pullCalls: [],
    // The default REFUSES. A pull that silently succeeded with an empty payload
    // would let every case here pass whether or not the drain ran, which is the
    // shape of check this repo has paid for more than once. Cases that expect a
    // pull override this; cases that do not are asserting `pullCalls` is empty,
    // and an accidental pull must be loud rather than invisible.
    pullImpl:
      over.pullImpl ??
      (async (_workspaceId, ticketId) => {
        throw new Error(`fakeTransport: unexpected per-ticket pull for ${ticketId}`);
      }),
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
   * ## THE WITNESS CHANGED UNDER CLOSURE 5C, AND THE PROPERTY DID NOT
   *
   * This case used to reach the throw by revoking the project out from under a
   * ticket and then delivering an in-flight `ticket.transitioned` for it —
   * 12.155's project-scoped half, *"… for ticket … that was never created"*.
   * **That sequence stopped being a stall sequence.** `applyOne`'s
   * `recoverByPull` now answers a fold failure for a ticket this device does
   * NOT hold by owing a pull instead of stalling, and a purged ticket is by
   * definition not held — so the old trigger is now the exact input the swallow
   * was written for. Measured on this branch before the rewrite:
   * `Tests 2 failed | 20 passed (22)`, this case and 12.164, both on
   * `expected null not to be null`.
   *
   * So the trigger is now a HELD ticket transitioning into a state `wfV1` does
   * not have — the other half of closure 5c's asymmetry, the half that still
   * stalls (12.310). Everything this case actually pins is untouched by that
   * substitution: the cursor does not move, no reconnect is armed, and the
   * status sequence is exactly `['offline']`.
   *
   * *SIDE-EFFECT WORTH NAMING, because this case used to be where a reader met
   * it: the revoked-project sequence is now answered by a pull that 403s and an
   * id that stays owed on every catch-up, rather than by a stall. That is the
   * disclosed cost in `drainPendingPulls` ("an id that is genuinely gone costs
   * one request per catch-up rather than a wrong deletion. Owner: unassigned"),
   * reached by a route that docblock does not mention.*
   *
   * *Mutation: replace `stall(...)` in `onItem`'s catch with `() => undefined`
   * (the plan's snippet) → `Tests 3 failed | 24 passed (27)`, re-measured
   * against the new witness at the PRE-P37.2 tree: this case, 12.164 and now
   * 12.310, all three on `expected null not to be null`. It took two cases when
   * the denominator was 14 and takes three now, because closure 5c's 12.310 pins
   * the same stall from the other side. This note first
   * said "12.164 stays green", reasoning that a swallowed item is exactly what
   * lets `caught-up` advance past it — which is true of the cursor and false of
   * the case, because 12.164 waits for `lastApplyFailure()` to appear before it
   * sends the `caught-up` at all, and a swallowed failure never appears. The
   * mutation that separates the two is 12.164's own, below.*
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
    // below is the destination and not a malformed fixture.
    script.handlers!.onItem(transitioned(ticketId, 'doing', 2));
    await vi.waitFor(async () =>
      expect((await replica.getTicket(ticketId))?.confirmed?.stateId).toBe('doing'),
    );
    expect(engine.lastApplyFailure()).toBeNull();
    const subscribesBefore = script.subscribes.length;

    // Every status the engine publishes from here on. `setStatus` de-duplicates,
    // and the engine is `live` at this point, so a correct stall publishes
    // exactly one: `offline`.
    const afterFailure: SyncStatus[] = [];
    engine.onStatus((next) => afterFailure.push(next));

    // A transition into a state `wfV1` does not have, on the ticket the device
    // HOLDS. See the docblock: the witness changed, the property did not.
    script.handlers!.onItem(transitioned(ticketId, 'nowhere', 3));
    await vi.waitFor(() => expect(engine.lastApplyFailure()).not.toBeNull());
    expect(engine.lastApplyFailure()!.code).toBe('apply-failed');
    expect(engine.lastApplyFailure()!.message).toContain('has no state "nowhere"');
    // No pull was attempted: `recoverByPull` refuses a ticket this device holds,
    // and the fixture's default `pullImpl` throws, so a swallow here would be
    // loud twice over.
    expect(script.pullCalls).toEqual([]);
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
      { status: 'invalid', eventId: null, code: MALFORMED_ENVELOPE_CODE, message: 'unreadable' },
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

    // HELD FIRST, and that is the case's substance rather than its setup. This
    // case used to send `transitioned(ticketId, 'doing', 1)` for a ticket that
    // was never created; closure 5c answers that with a PULL, not a stall
    // (12.309), so `lastApplyFailure()` would stay null and the wait below
    // would run out the clock. Same substitution 12.163 makes, same reason.
    const ticketId = newUlid();
    script.handlers!.onItem(created(ticketId));
    await vi.waitFor(async () => expect(await replica.getTicket(ticketId)).not.toBeNull());
    script.handlers!.onItem(transitioned(ticketId, 'nowhere', 2)); // a state `wfV1` does not have
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
   *
   * **The `ping` half was deleted, and its absence is now the assertion (12.328).**
   * This case used to send a TEXT `{type:'ping'}` and expect `pong` back — a
   * protocol nothing on the other side implements. The server's heartbeat is
   * `socket.ping()`, a control frame the platform socket answers below
   * JavaScript, and `stream/routes.ts:342` answers `bad-message` to any text
   * frame that is not a `subscribe`. So the ping is still SENT here and the
   * sent-list is asserted EXACTLY as `['subscribe']`: the frame goes in, nothing
   * comes back, and `subscribe` is that absence's own positive control that
   * sends are observable at all.
   *
   * *Mutation: restore the `pong` arm in `http-transport.ts`'s `onmessage` →
   * red HERE alone (`['subscribe','pong']` against `['subscribe']`).*
   */
  it('12.167 delivers all five server frames and answers a text ping with nothing', async () => {
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
    expect(socket.sent.map((s) => JSON.parse(s).type)).toEqual(['subscribe']);

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

/**
 * Closure 5b(d) / 5b(b), ruling P37.1 — the grant side is PULL-SHAPED, and this
 * describe covers the engine's half of it: the drain that turns a notice into
 * per-ticket fetches, and what it does when one of those fetches does not come
 * back.
 *
 * ## Why the fixture's default `pullImpl` THROWS, restated where the cases are
 *
 * A fake that answered every pull with an empty payload would make every case
 * in the describes ABOVE — none of which expects a pull, and none of which
 * asserts `pullCalls` — pass whether or not a drain ran behind their backs, and
 * would make an applied-nothing payload look like an applied ticket. The
 * default refuses instead, so an unexpected pull is a loud rejection naming the
 * id rather than a silent success. The cases below that DO expect a pull say so
 * by overriding it, which makes the override itself the statement of intent.
 *
 * It is not what makes 12.305's exactness work — `pullCalls` is asserted as a
 * whole array there, which catches a stray pull whatever the fake returns. The
 * default's job is the cases that assert nothing about pulls at all.
 */
describe('12.305-12.308 the per-ticket pull door (closure 5b(d), ruling P37.1)', () => {
  /**
   * The engine's `PULL_TIMEOUT_MS`, restated here because it is module-private.
   *
   * The same duplication `RECONCILE_CHUNK_SIZE` carries against the server's
   * `MAX_BATCH_SIZE`, and it is safe for the same reason: 12.308 brackets the
   * timeout from BOTH sides — parked at `TIMEOUT - 1`, drained at `TIMEOUT + 1`
   * — so moving the constant in `sync-engine.ts` without moving this one fails
   * that case loudly rather than weakening it.
   */
  const PULL_TIMEOUT_MS = 15_000;

  /**
   * One ticket's pull payload, built against the SAME definition envelopes the
   * bootstrap carried.
   *
   * Not a shortcut: `loadTicketBootstrap` dedupes definitions by event id and
   * `applyDefinition` is an `ON CONFLICT … DO UPDATE`, so re-sending the
   * workspace's own definitions is exactly what the real door does — the server
   * sends the full version chain every time because a pulled ticket may sit on
   * a workflow version the device has never seen, and it cannot know which.
   * Handing this door an EMPTY `definitions` would also pass here (the replica
   * already holds them from `loadBootstrap`), which is precisely the vacuity
   * `ticket-bootstrap.test.ts`'s 12.297 exists to refuse; this file does not
   * re-prove that property, it just declines to depend on its absence.
   */
  const pullPayloadOf = (body: BootstrapResponse, ticketId: string): TicketBootstrap => ({
    workspaceId: WS,
    definitions: body.definitions,
    ticket: { ticketId, snapshot: null, events: [created(ticketId)] },
  });

  /**
   * 12.305 — A NOTICE PULLS EXACTLY THE IDS THIS DEVICE IS BEHIND ON.
   *
   * `visibility.set` is not refused when it grants what a principal already
   * had (`check-permission.ts` does not check), and the hub does not model a
   * device's holdings and must not start — so a notice naming ten ids reaches a
   * device that is already current on nine of them, routinely, and P37.1's cost
   * argument ("a repeated no-op `visibility.set` costs a holding client
   * nothing") is a claim about THIS filter and nothing else. The filter lives
   * in `replica.applyServerItem`'s `reach-granted` arm, but only the engine can
   * be observed doing it: the replica records ids and stops, and what actually
   * crosses the network is the drain's `bootstrapTicket` calls.
   *
   * ## THE FILTER IS AN INTEGER COMPARISON NOW, NOT A HOLDINGS TEST (ruling P37.2)
   *
   * This case read "pulls exactly the ids the device does not HOLD" until the
   * ruling, and the id-only notice it described was measured not to work: the
   * client cannot tell a complete local copy from a STALE PARTIAL one by asking
   * whether it holds the ticket, and a narrowed-then-re-widened device holds
   * exactly the latter. So the notice carries `{ id, headSeq }` and the rule is
   * *pull iff this device's own highest local `workspaceSeq` for that ticket is
   * BELOW the server's head*. The old test survives as the degenerate case:
   * a ticket never seen has local head 0, which is below any real head.
   *
   * The skipped id here is therefore skipped for a STATED reason — its
   * `headSeq` is the workspace position of the very envelope this device folded,
   * read off that envelope rather than written as a literal, so the case cannot
   * drift into asserting "current" against a number that stopped being current.
   *
   * So the load-bearing assertion is `pullCalls` as an EXACT array rather than
   * a count or a `toContain`. A count of two is satisfied by pulling the current
   * id and one behind one; `toContain` is satisfied by pulling all three.
   *
   * The current ticket is asserted READABLE before the notice is sent. Without
   * that line "the current id was not pulled" is equally satisfied by a replica
   * that never held it — the notice would then have named three ids the device
   * lacks and pulled two, and the case would be measuring nothing.
   */
  it('12.305 pulls exactly the ids the device is behind on, skips the one it is current on, and each pulled ticket becomes readable', async () => {
    const held = newUlid();
    const missingA = newUlid();
    const missingB = newUlid();
    const body = bootstrapOf();
    const { script, replica, engine } = await fixture({
      bootstrapImpl: async () => body,
      pullImpl: async (_workspaceId, ticketId) => pullPayloadOf(body, ticketId),
    });
    await engine.start(WS);

    // The device really holds one of the three ids the notice will name, and it
    // holds it CURRENT — the notice's head for it is this envelope's own
    // workspace position. This is the non-vacuity control for the whole case.
    const heldCreated = created(held);
    script.handlers!.onItem(heldCreated);
    await engine.settled();
    expect((await replica.getTicket(held))?.confirmed?.stateId).toBe('todo');
    expect(await replica.getTicket(missingA)).toBeNull();
    expect(await replica.getTicket(missingB)).toBeNull();
    expect(script.pullCalls).toEqual([]);

    script.handlers!.onItem({
      kind: 'reach-granted',
      workspaceId: WS,
      tickets: [
        { id: held, headSeq: heldCreated.workspaceSeq },
        { id: missingA, headSeq: 1 },
        { id: missingB, headSeq: 1 },
      ],
    });
    await engine.settled();

    // EXACTLY these two, in the order the notice named them. The current id is
    // absent, and its absence is the whole property.
    expect(script.pullCalls).toEqual([
      { workspaceId: WS, ticketId: missingA },
      { workspaceId: WS, ticketId: missingB },
    ]);
    // …and a pull that landed is a ticket that READS, not merely a row that
    // exists: `stateId` is the folded initial state, so a payload that inserted
    // envelopes without refolding would fail here rather than pass on presence.
    expect((await replica.getTicket(missingA))?.confirmed?.stateId).toBe('todo');
    expect((await replica.getTicket(missingB))?.confirmed?.stateId).toBe('todo');
    expect((await replica.getTicket(held))?.confirmed?.stateId).toBe('todo');
    // Nothing is still owed — a drain that fetched but never cleared would
    // re-fetch both ids on every catch-up for the life of the install.
    expect(await replica.listPendingPulls(WS)).toEqual([]);
    // The pull door writes no cursor (`loadTicketBootstrap` takes no
    // `streamSeq`), and no `caught-up` has arrived on this stream.
    expect(await replica.getCursor(WS)).toBe(7);
    expect(engine.lastApplyFailure()).toBeNull();
    engine.stop();
  });

  /**
   * 12.306 — A FAILING PULL MUST NOT STALL, AND MUST NOT FORGET.
   *
   * The most important case in this set, because the failure it excludes is
   * terminal and silent-looking. `stall()` is a ONE-WAY LATCH: `stalled` is set
   * in exactly one place and cleared in exactly one other, `start()`. Mobile
   * never calls `start()` a second time and the shell renders the state as a
   * plain "Offline", so a stall is terminal until the process restarts. Letting
   * a pull's rejection reach it would mean a five-second network wobble bricks
   * the device where, before closure 5b, the identical wobble merely lost a
   * backfill.
   *
   * Swallowing alone is not enough and is the other half of this case. The
   * cursor advances past the trigger, the notice is not regenerated, and
   * `needsBootstrap` refuses to re-bootstrap over a local baseline — so a
   * swallowed-and-forgotten id is lost until a reinstall. The id therefore
   * stays in the replica's DURABLE pending set and the next catch-up tries
   * again. Three outcomes, one of them acceptable.
   *
   * ## What makes "nothing stalled" able to fail here
   *
   * `lastApplyFailure()` being null is a "nothing happened" assertion, so it is
   * paired with two positive facts from the SAME run: a frame that arrives
   * AFTER the failed pull still folds (the chain is alive, not parked), and the
   * later catch-up drives the engine to `live` with the cursor at 9 (the
   * caught-up link ran to its end rather than being short-circuited by a
   * `stalled` guard). A stalled engine reaches neither.
   *
   * *Mutation: `catch (err) { throw err; }` — re-raise inside
   * `drainPendingPulls`'s per-id catch instead of swallowing → red here with
   * `expected { code: 'apply-failed', …(2) } to be null`: the rejection reaches
   * `stall()` through `applyOne`'s `.catch`, so `lastApplyFailure()` is the
   * pull's own message and `status()` is `offline`. RED ON 12.308 TOO
   * (`Tests 2 failed | 20 passed (22)`), and that is not a defect in either
   * case — a swallow removed is a swallow removed for both failure shapes, and
   * the two cases differ in the SHAPE (a rejection here, a promise that never
   * settles there), not in the property. Nothing separates them, and this note
   * says so rather than claiming an "alone" that was not measured.*
   */
  it('12.306 a failing pull leaves the id owed and the engine running, and the next catch-up converges', async () => {
    const owed = newUlid();
    const anchor = newUlid();
    const body = bootstrapOf();
    const { script, replica, engine } = await fixture({
      bootstrapImpl: async () => body,
      pullImpl: async (_workspaceId, ticketId) => {
        throw new Error(`transport refused the pull for ${ticketId}`);
      },
    });
    await engine.start(WS);

    // A control that the fold door works in this fixture at all, taken BEFORE
    // the failure so a broken fixture cannot masquerade as a handled one.
    script.handlers!.onItem(created(anchor));
    await engine.settled();
    expect((await replica.getTicket(anchor))?.confirmed?.stateId).toBe('todo');

    // `headSeq: 1` and not a computed value: `owed` is a ticket this device has
    // never seen, so `localHeadSeq` answers 0 and ANY positive head is above it
    // (ruling P37.2). The number is the server's position, and this case does
    // not care which one it is — 12.313 is where the comparison itself is pinned.
    script.handlers!.onItem({ kind: 'reach-granted', workspaceId: WS, tickets: [{ id: owed, headSeq: 1 }] });
    await engine.settled();

    // The pull was attempted and it failed.
    expect(script.pullCalls).toEqual([{ workspaceId: WS, ticketId: owed }]);
    expect(await replica.getTicket(owed)).toBeNull();
    // The id is STILL OWED — the whole recovery depends on this row surviving.
    expect((await replica.listPendingPulls(WS)).map((t) => t.id)).toEqual([owed]);
    // And nothing latched. `status()` is the one that would read `offline` on a
    // stall, and `lastApplyFailure()` the one a shell would render.
    expect(engine.lastApplyFailure()).toBeNull();
    expect(engine.status()).toBe('catching-up');

    // POSITIVE CONTROL, same run: the apply chain still applies. A stalled
    // engine returns from `applyOne` at its first line and this transition
    // would never land.
    script.handlers!.onItem(transitioned(anchor, 'doing', 2));
    await engine.settled();
    expect((await replica.getTicket(anchor))?.confirmed?.stateId).toBe('doing');

    // The network comes back. `fakeTransport` reads `script.pullImpl` at call
    // time, so reassigning it here is the wobble ending.
    script.pullImpl = async (_workspaceId, ticketId) => pullPayloadOf(body, ticketId);
    script.handlers!.onCaughtUp(9);
    await engine.settled();

    // The retry is the SECOND entry, enumerated rather than counted: a drain
    // that re-read the pending set twice in one link would show three.
    expect(script.pullCalls).toEqual([
      { workspaceId: WS, ticketId: owed },
      { workspaceId: WS, ticketId: owed },
    ]);
    expect((await replica.getTicket(owed))?.confirmed?.stateId).toBe('todo');
    expect(await replica.listPendingPulls(WS)).toEqual([]);
    // The caught-up link ran to its END: the drain is awaited BEFORE
    // `setCursor`, so a cursor at 9 and a status of `live` are only reachable
    // through a drain that returned.
    expect(await replica.getCursor(WS)).toBe(9);
    expect(engine.status()).toBe('live');
    expect(engine.lastApplyFailure()).toBeNull();
    engine.stop();
  });

  /**
   * 12.308 — A PULL THAT NEVER SETTLES IS ABANDONED, AND THE ID STAYS OWED.
   *
   * This is the failure mode that would be WORSE than the terminal stall
   * `drainPendingPulls` exists to avoid, and it is not hypothetical:
   * `net/http-transport.ts` calls bare `fetch` with no `AbortSignal` anywhere
   * in the file, and `applyChain` is strictly serial. A promise that neither
   * resolves nor rejects therefore does not fail — the chain simply STOPS.
   * Status stays where it was, `stalled` stays false, `lastApplyFailure()`
   * stays null, and `settled()` never resolves. Nothing anywhere surfaces it.
   *
   * ## How this is asserted without asserting a hang
   *
   * "The chain is parked" is an absence, and the only honest way to see it is
   * to bracket the timeout from both sides in ONE run. `settled()` is raced
   * against the fake clock: at `PULL_TIMEOUT_MS - 1` it has NOT resolved (a
   * shorter or absent bound fails this line), and one millisecond past the
   * bound it HAS (no bound at all fails by running the case out to vitest's own
   * timeout, loudly, rather than by passing). The `pullCalls` assertion before
   * either is the control that the pull was really started and the case is not
   * bracketing an empty drain.
   *
   * Fake timers are installed AFTER `start()` and the anchor fold deliberately:
   * `createReplica` runs migrations and `better-sqlite3` is synchronous, but a
   * faked clock around setup buys nothing and costs the ability to tell a
   * fixture problem from a timeout problem.
   *
   * *Mutation: call `transport.bootstrapTicket(ws, ticketId)` directly in
   * `drainPendingPulls`, dropping `withTimeout` → red HERE ALONE,
   * `Tests 1 failed | 21 passed (22)`, with `expected false to be true //
   * Object.is equality` on the line one millisecond past the bound.*
   *
   * *This note first predicted the mutant would red as a vitest TIMEOUT rather
   * than an assertion, and the measurement says otherwise:
   * `advanceTimersByTimeAsync` returns on its own real-timer yields whether or
   * not the chain moved, so the parked `settled()` is caught by the `drained`
   * flag in 7 ms instead of by the runner's 5 s clock. Written down because the
   * distinction is worth something — the case detects the hang, it does not
   * merely survive it, so it stays fast and says which side of the bound broke.*
   */
  it('12.308 a pull that never settles is abandoned after the timeout, and the id stays owed', async () => {
    const owed = newUlid();
    const anchor = newUlid();
    const body = bootstrapOf();
    const { script, replica, engine } = await fixture({
      bootstrapImpl: async () => body,
      // Neither resolves nor rejects. This is what a `fetch` with no
      // `AbortSignal` against a black-holed connection looks like from here.
      pullImpl: () => new Promise<TicketBootstrap>(() => undefined),
    });
    await engine.start(WS);
    script.handlers!.onItem(created(anchor));
    await engine.settled();
    expect((await replica.getTicket(anchor))?.confirmed?.stateId).toBe('todo');

    vi.useFakeTimers();
    try {
      let drained = false;
      script.handlers!.onItem({ kind: 'reach-granted', workspaceId: WS, tickets: [{ id: owed, headSeq: 1 }] });
      void engine.settled().then(() => {
        drained = true;
      });

      // Every microtask between the notice and the pull runs during this tick;
      // the timeout timer is armed at 15_000 and fires in none of it.
      await vi.advanceTimersByTimeAsync(0);
      expect(script.pullCalls).toEqual([{ workspaceId: WS, ticketId: owed }]);
      expect(drained).toBe(false);

      await vi.advanceTimersByTimeAsync(PULL_TIMEOUT_MS - 1);
      // STILL PARKED one millisecond short of the bound. A timeout shorter than
      // `PULL_TIMEOUT_MS` — or a drain that gave up on its own — fails here.
      expect(drained).toBe(false);

      await vi.advanceTimersByTimeAsync(2);
      expect(drained).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    await engine.settled();
    // Abandoned, not cleared: the same conservative reading a rejected pull
    // gets, and for a stronger reason — a request that never answered says
    // nothing at all about whether the ticket is still this device's.
    expect((await replica.listPendingPulls(WS)).map((t) => t.id)).toEqual([owed]);
    expect(await replica.getTicket(owed)).toBeNull();
    // The abandonment is not a fold failure and must not read as one.
    expect(engine.lastApplyFailure()).toBeNull();
    expect(engine.status()).toBe('catching-up');
    // POSITIVE CONTROL: the chain resumed. Without the timeout this line is
    // never reached, because `settled()` above never returns.
    script.handlers!.onItem(transitioned(anchor, 'doing', 2));
    await engine.settled();
    expect((await replica.getTicket(anchor))?.confirmed?.stateId).toBe('doing');
    engine.stop();
  });
});

/**
 * The reconcile SCHEDULE — case 12.288's owner line, answered.
 *
 * `SyncEngine.reconcile`'s docblock used to end "Deliberately NOT wired into
 * `start()` or the reconnect path … **Owner: unassigned; case 12.288.**", and
 * 12.288 was a RECORD in `test-cases/12-offline-sync-apps.md` that nothing
 * called the primitive on a schedule. It is a case now, and the two below split
 * the answer: that there IS a schedule, and what bounds it.
 */
describe('12.288 + 12.307 the reconcile schedule (closure 5b(b))', () => {
  /**
   * 12.288 — CATCH-UP COMPLETION IS THE TRIGGER, AND NOTHING CALLS RECONCILE
   * BY HAND IN THIS CASE.
   *
   * The moment a device's cursor is current is exactly the moment its HOLDINGS
   * may be stale, and the two facts are unrelated on purpose: a narrowing sends
   * the losing device NOTHING AT ALL (`reconcile-route.ts`, case 6.104), so
   * there is no frame to notice, no purge to apply, and no other trigger
   * available anywhere in the protocol. That is also why the cheaper trigger is
   * wrong — gating on "the catch-up delivered something" skips the zero-frame
   * catch-up, which is precisely the shape a silent narrowing produces.
   *
   * The case asserts both halves of a schedule, because either alone is
   * satisfiable by an accident:
   *
   * 1. `transport.reconcile` was called, with the ids the replica holds, and
   *    `reconcileCalls` was EMPTY immediately before the `caught-up` — so the
   *    call belongs to the catch-up and not to `start()` or the bootstrap.
   * 2. A ticket the server names `restricted` is GONE from the replica. A
   *    schedule that asked and dropped the answer would satisfy (1) alone.
   *
   * The surviving ticket is the positive control for (2): the purge is targeted
   * rather than a store that emptied itself.
   *
   * *Mutation: neutralise the whole `if (Date.now() - lastReconcileAt >= …)`
   * block in `onCaughtUp` → red here with `expected [] to have a length of 1
   * but got +0`. **NOT red alone, measured**: `Tests 2 failed | 20 passed (22)`
   * — 12.307 goes with it, and no honest 12.307 survives a schedule that does
   * not exist, because a case bounding the interval has to observe the
   * interval's first firing. The mutation that DOES separate them is this
   * case's own half (2): keep the schedule and skip `replica.purgeEntity` in
   * `runReconcile` → `Tests 2 failed | 20 passed (22)` again, but the two are
   * this case and 12.287 (`expected { …(3) } to be null` on both), with 12.307
   * green. Two mutations, neither of them "alone", and the pair is what pins
   * the case: the first says a schedule exists, the second says it acts.*
   */
  it('12.288 reconciles on catch-up completion with no manual call, and a restricted ticket really leaves', async () => {
    const stale = newUlid();
    const kept = newUlid();
    const { script, replica, engine } = await fixture({
      // The server narrows exactly one of the two ids the device presents. The
      // answer is computed from `heldIds` rather than written out, so it stays
      // in step with whatever the replica actually presents.
      reconcileImpl: async (workspaceId, heldIds) => ({
        workspaceId,
        restricted: heldIds.filter((id) => id === stale).map((id) => ({ kind: 'restricted' as const, id })),
      }),
    });
    await engine.start(WS);
    script.handlers!.onItem(created(stale));
    script.handlers!.onItem(created(kept));
    await engine.settled();
    expect((await replica.listTickets(WS)).map((t) => t.ticketId).sort()).toEqual([stale, kept].sort());
    // Nothing has asked yet — so the call below is the catch-up's and no
    // earlier door's.
    expect(script.reconcileCalls).toEqual([]);

    script.handlers!.onCaughtUp(9);
    await engine.settled();

    // Asked, once, about what this device holds. `settled()` rather than
    // `vi.waitFor`: the reconcile is awaited INSIDE the caught-up link, so the
    // chain covers it — and `reconcileCalls` is pushed on ENTRY to the
    // transport, so waiting on it would race the purge that follows.
    expect(script.reconcileCalls).toHaveLength(1);
    expect(script.reconcileCalls[0]!.workspaceId).toBe(WS);
    expect([...script.reconcileCalls[0]!.heldIds].sort()).toEqual([stale, kept].sort());
    // And ACTED on: the narrowed ticket is gone, its events with it.
    expect(await replica.getTicket(stale)).toBeNull();
    expect(await replica.listEntityEvents(stale)).toEqual([]);
    // The positive control — a purge that is targeted, not a store that
    // emptied itself.
    expect((await replica.getTicket(kept))?.confirmed?.stateId).toBe('todo');
    expect(await replica.getCursor(WS)).toBe(9);
    engine.stop();
  });

  /**
   * 12.307 — THE MINIMUM INTERVAL, WHICH IS WHAT MAKES THE SCHEDULE AFFORDABLE.
   *
   * `reconnectDelayMs` is a FIXED 2000 with no growth and no jitter, and the
   * hub sends one `caught-up` per subscription unconditionally — so without a
   * bound a flapping socket is a reconcile every two seconds, forever, at
   * `ceil(held / 100)` requests each. A device holding a thousand tickets would
   * issue ten requests every two seconds while the network wobbles. The bound
   * is TIME rather than activity, because gating on activity would skip the
   * zero-frame catch-up the whole feature exists for.
   *
   * ## Time is controlled honestly, and the two halves control it differently
   *
   * The first half needs NO clock control at all and that is not luck:
   * `lastReconcileAt` starts at 0 and `Date.now()` is ~1.8e12, so the first
   * catch-up passes the gate unconditionally and stamps the clock; the second,
   * milliseconds later, cannot. The cursor reaching the SECOND `caught-up`'s
   * seq is what makes "one call" able to fail for the right reason — without
   * it, a second link that never ran at all would satisfy the count.
   *
   * The second half needs the interval to EXPIRE, which real time cannot
   * deliver in a test. `vi.useFakeTimers({ toFake: ['Date'] })` fakes `Date`
   * and NOTHING ELSE — `setTimeout` stays real, so the engine's reconnect timer
   * and `withTimeout`'s timer are untouched and nothing in this file's
   * machinery is asked to run on a clock it does not control. The base instant
   * is captured from the real clock first, because sinon's default epoch is 0
   * and a fake `Date.now()` of 0 against a real `lastReconcileAt` would compute
   * a NEGATIVE age — which fails closed, and would have made this half pass for
   * the opposite reason.
   *
   * *Mutation: drop the `Date.now() - lastReconcileAt >= RECONCILE_MIN_INTERVAL_MS`
   * guard, reconciling on every catch-up → red HERE ALONE,
   * `Tests 1 failed | 21 passed (22)`, with
   * `expected [ { …(2) }, { …(2) } ] to have a length of 1 but got 2`.*
   *
   * *TWO mutations, because the first one stops at the first assertion and the
   * expiry half below it is then a line nobody has watched fail. Second
   * mutation: `if (lastReconcileAt === 0)` — reconcile ONCE PER PROCESS, which
   * is the plausible wrong implementation this docblock argues against and the
   * one a count-shaped case cannot tell from a time-shaped one → red HERE
   * ALONE, `Tests 1 failed | 21 passed (22)`, with `expected [ { …(2) } ] to
   * have a length of 2 but got 1` on the line after the clock is moved. Half
   * one stays green under it (the first catch-up still stamps, the second is
   * still refused) and so does 12.288, which sends a single catch-up.*
   */
  it('12.307 two catch-ups in quick succession reconcile once, and the bound is time rather than count', async () => {
    const { script, replica, engine } = await fixture();
    await engine.start(WS);
    script.handlers!.onItem(created(newUlid()));
    await engine.settled();

    script.handlers!.onCaughtUp(9);
    await engine.settled();
    expect(script.reconcileCalls).toHaveLength(1);
    expect(await replica.getCursor(WS)).toBe(9);

    script.handlers!.onCaughtUp(10);
    await engine.settled();
    // THE CONTROL FIRST: the second caught-up link really ran to its end. A
    // link that was dropped, queued behind a stall, or short-circuited would
    // leave the cursor at 9 and satisfy the count below for the wrong reason.
    expect(await replica.getCursor(WS)).toBe(10);
    expect(script.reconcileCalls).toHaveLength(1);

    // …and the interval EXPIRES. `RECONCILE_MIN_INTERVAL_MS` is 60_000 in
    // `sync-engine.ts` and module-private; 61_000 clears it with a margin, and
    // raising the constant past that fails this line loudly rather than
    // weakening it.
    const base = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(base + 61_000));
      script.handlers!.onCaughtUp(11);
      await engine.settled();
      expect(await replica.getCursor(WS)).toBe(11);
      expect(script.reconcileCalls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
    engine.stop();
  });
});

/**
 * Closure 5c — THE REFOLD HAZARD, AND THE TWO RULES THAT CLOSE IT.
 *
 * `grant-backfill.ts` said the hazard closes "as bootstrap-before-apply on any
 * event for an entity not held". No such rule existed when that sentence was
 * written, and the branch review measured its absence:
 * `replica.applyServerItem` refolds on ANY folding ticket event with no
 * holdings check; `refoldTicket` starts from `state === undefined` when there
 * is no snapshot; `applyTicketEvent` throws *"… that was never created"*; that
 * rejection reaches `.catch(err => stall(err, item))`; and `stalled` is a
 * ONE-WAY LATCH cleared only by `start()`, which mobile never calls again.
 *
 * The rule exists now, in `applyOne`'s catch, and it is deliberately NARROW —
 * `recoverByPull` answers `false` for an instruction, for a non-ticket entity,
 * and for a ticket this device HOLDS. The asymmetry is the whole design:
 * **held-and-unfoldable is loud; not-held-and-unfoldable is a pull.** So the
 * two cases below are a matched pair and neither means anything alone: 12.309
 * says the swallow happens, 12.310 says it is not a blanket. A file with only
 * the first is satisfied by `catch {}`.
 *
 * ## WHAT THIS DESCRIBE DID TO 12.163 AND 12.164, stated here because a reader
 * ## arriving at those two will otherwise think the rewrite was cosmetic
 *
 * Both of them drove their stall with `ticket.transitioned` for a ticket the
 * device did NOT hold — 12.163 by revoking the project out from under it,
 * 12.164 by never creating it. That sequence STOPPED BEING A STALL SEQUENCE
 * when this rule landed: it is now the exact input `recoverByPull` swallows.
 * Measured on this branch before either case was touched:
 * `Tests 2 failed | 20 passed (22)`, both of them, on
 * `expected null not to be null`. They were re-witnessed against a HELD
 * ticket — the half of the asymmetry that still stalls — rather than deleted,
 * because the property each pins (the cursor does not move past what did not
 * apply; the second door reads the flag too) is untouched by closure 5c. Only
 * the trigger changed.
 */
describe('12.309-12.310 the refold hazard, and the narrowness of the swallow (closure 5c)', () => {
  /** One pulled ticket's payload. Local to this describe, per the file's fixture convention. */
  const pullPayloadOf = (
    definitions: LedgerEvent[],
    ticketId: string,
    events: LedgerEvent[],
  ): TicketBootstrap => ({
    workspaceId: WS,
    definitions,
    ticket: { ticketId, snapshot: null, events },
  });

  /**
   * 12.309 — THE CRITICAL'S SEQUENCE (a): A TRANSIENT PULL FAILURE FOLLOWED BY
   * THE TRIGGER ITSELF, WHICH USED TO BE TERMINAL.
   *
   * The sequence is three links long and every one of them is ordinary:
   *
   * 1. A notice names ticket T this device does not hold, and the pull for it
   *    fails — a wobble, a 502, a captive portal. `drainPendingPulls` swallows
   *    it and leaves T owed, which is 12.306's property and is correct.
   * 2. The FOLDED TRIGGER for that same T arrives one link later.
   *    `ticket.transitioned` is in `FOLDING_TICKET_TYPES`, T has no snapshot
   *    and no events, so `refoldTicket` reaches `applyTicketEvent` with
   *    `state === undefined` and throws *"… that was never created"*.
   * 3. Before closure 5c that throw reached `stall()`. The claim in
   *    `drainPendingPulls`'s docblock — that a failed pull costs a backfill and
   *    not the device — was true of the pull's OWN rejection and false of the
   *    chain one link behind it. The brick was produced by the recovery path,
   *    not in spite of it.
   *
   * ## What makes "nothing stalled" able to fail here
   *
   * Three positive facts from the SAME run, because `lastApplyFailure()` being
   * null is an absence and an absence proves nothing on its own:
   *
   * - an ordinary item that arrives AFTER the trigger still folds (the chain is
   *   alive, not parked behind a `stalled` guard that returns at `applyOne`'s
   *   first line);
   * - T is STILL OWED, enumerated — a swallow that forgot the id converges
   *   never, and `needsBootstrap` refuses to re-bootstrap over a local baseline;
   * - and once the network is back, the next catch-up drives T to the state the
   *   FAILED TRIGGER described. That last one is why the pull payload carries
   *   the trigger envelope: the streamed copy was rolled back with its own
   *   transaction (the per-arrival contract, 12.125), so the ticket's own
   *   bootstrap is the only thing that can still deliver it — which is exactly
   *   the sentence `applyOne`'s docblock uses to justify dropping the streamed
   *   copy, asserted rather than restated.
   *
   * `pullCalls` is an exact array rather than a count: the two failures and the
   * retry are three attempts on one id, and a drain that re-read the pending
   * set twice in one link would show four.
   *
   * *Mutation: `return false` at the top of `recoverByPull` → red HERE ALONE,
   * `Tests 1 failed | 26 passed (27)`, with `expected [ { …(2) } ] to deeply
   * equal [ { …(2) }, { …(2) } ]` — the trigger's own recovery attempt missing
   * from `pullCalls`. It reddens on the PULL rather than on
   * `lastApplyFailure()` because the pull assertion is the earlier line; the
   * stall is one line further down and would have failed too.
   * **MEASURED AT THE PRE-P37.2 TREE**, when the notice was id-only; the three
   * lines of `recoverByPull` the mutation targets are untouched by that ruling
   * and are present verbatim, but the run itself has not been repeated. See the
   * mutation ledger at the foot of this file.*
   *
   * *That mutant is also the proof that this case is the one the branch's fix
   * was FOR. Run against this file before 12.163 and 12.164 were re-witnessed,
   * it read `Tests 1 failed | 26 passed (27)` with both of those GREEN — i.e.
   * the old stall cases and this new one are the same behaviour measured from
   * opposite sides, and no version of the engine satisfies all three.*
   */
  it('12.309 a failed pull followed by the ticket’s own trigger converges instead of stalling', async () => {
    const owed = newUlid();
    const anchor = newUlid();
    const body = bootstrapOf();
    // The trigger is minted BEFORE the run so the pull payload can carry the
    // very envelope the stream rolled back — which is what the server's
    // per-ticket bootstrap really does, and what makes the last assertion
    // ('doing') say something the created-only payload could not.
    const trigger = transitioned(owed, 'doing', 2);
    const owedHistory = [created(owed), trigger];
    let network: 'down' | 'up' = 'down';
    const { script, replica, engine } = await fixture({
      bootstrapImpl: async () => body,
      pullImpl: async (_workspaceId, ticketId) => {
        if (network === 'down') throw new Error(`transport refused the pull for ${ticketId}`);
        return pullPayloadOf(body.definitions, ticketId, owedHistory);
      },
    });
    await engine.start(WS);

    // The fold door works in this fixture, established BEFORE anything fails so
    // a broken fixture cannot pass itself off as a handled failure.
    script.handlers!.onItem(created(anchor));
    await engine.settled();
    expect((await replica.getTicket(anchor))?.confirmed?.stateId).toBe('todo');

    // LINK 1: the notice, and the pull that fails. The head the notice carries
    // is the trigger's own workspace position — the server really is that far
    // ahead of this device, which holds nothing for `owed` at all.
    script.handlers!.onItem({
      kind: 'reach-granted',
      workspaceId: WS,
      tickets: [{ id: owed, headSeq: trigger.workspaceSeq }],
    });
    await engine.settled();
    expect(script.pullCalls).toEqual([{ workspaceId: WS, ticketId: owed }]);
    expect((await replica.listPendingPulls(WS)).map((t) => t.id)).toEqual([owed]);
    // NOTHING WAS RECONCILED, and that is a property rather than an incidental
    // zero. Ruling P37.2(c) deleted the reconcile from the notice arm — a
    // notice only names ids the viewer can see NOW and reconcile only answers
    // about ids they CANNOT, so the arm was a structural no-op. This line is
    // what fails if it comes back; it also makes the reconcile at the catch-up
    // below unambiguously the SCHEDULE's (12.288) and not this branch's.
    expect(script.reconcileCalls).toEqual([]);

    // LINK 2: the trigger for that same ticket. This is the throw.
    script.handlers!.onItem(trigger);
    await engine.settled();
    // It was answered by a second pull attempt, not by a stall.
    expect(script.pullCalls).toEqual([
      { workspaceId: WS, ticketId: owed },
      { workspaceId: WS, ticketId: owed },
    ]);
    expect(engine.lastApplyFailure()).toBeNull();
    expect(engine.status()).toBe('catching-up');
    expect(await replica.getTicket(owed)).toBeNull();
    expect((await replica.listPendingPulls(WS)).map((t) => t.id)).toEqual([owed]);

    // POSITIVE CONTROL, same run: the chain is alive. A stalled engine returns
    // from `applyOne` at its first line and this transition never lands.
    script.handlers!.onItem(transitioned(anchor, 'doing', 2));
    await engine.settled();
    expect((await replica.getTicket(anchor))?.confirmed?.stateId).toBe('doing');

    // LINK 3: the wobble ends and the next catch-up converges. `fakeTransport`
    // reads `script.pullImpl` at call time, so flipping the flag is the network
    // coming back.
    network = 'up';
    script.handlers!.onCaughtUp(9);
    await engine.settled();
    expect(script.pullCalls).toEqual([
      { workspaceId: WS, ticketId: owed },
      { workspaceId: WS, ticketId: owed },
      { workspaceId: WS, ticketId: owed },
    ]);
    // AT THE STATE THE ROLLED-BACK TRIGGER DESCRIBED — not merely present. A
    // pull that inserted envelopes without refolding, or a payload the drain
    // never applied, leaves this at 'todo' or null.
    expect((await replica.getTicket(owed))?.confirmed?.stateId).toBe('doing');
    expect(await replica.listPendingPulls(WS)).toEqual([]);
    // The caught-up link ran to its END: the drain is awaited BEFORE
    // `setCursor`, so a cursor at 9 and a status of `live` are only reachable
    // through a drain that returned.
    expect(await replica.getCursor(WS)).toBe(9);
    expect(engine.status()).toBe('live');
    expect(engine.lastApplyFailure()).toBeNull();
    engine.stop();
  });

  /**
   * 12.310 — THE SWALLOW IS NOT A BLANKET, AND THIS IS THE CASE THAT SAYS SO.
   *
   * `recoverByPull` refuses three inputs, and each refusal is a different line
   * of the same function. Two of them are measured here in one run each:
   *
   * - **A ticket the device HOLDS whose fold throws.** That is a real fold bug
   *   or a real disagreement about state, and a device that mis-folds what it
   *   holds must not quietly diverge — the pull would paper over it by
   *   overwriting local history with the server's, which is the outcome the
   *   whole per-arrival-rollback contract (12.125) exists to refuse.
   * - **A NON-TICKET entity.** A malformed `workflow.defined` cannot be
   *   repaired by fetching a ticket, and there is no per-definition bootstrap
   *   door to fetch it from.
   *
   * ## THE THIRD REFUSAL — an instruction — IS NOT ASSERTED, and that is a gap
   * ## rather than an omission
   *
   * `applyInstruction`'s three arms are `purgeEntity`, `revokeScope` and the
   * `reach-granted` recorder, and every statement in the first two is a DELETE:
   * nothing in this fixture can make one throw without stubbing the replica,
   * and a stubbed replica would be measuring the stub. `isSyncInstruction(item)
   * → false` therefore stands on the type and on reading, unmeasured. Written
   * down rather than faked: an instruction is also the one input for which the
   * `entity` access the next line performs would be a type error, so the branch
   * cannot be reached wrongly by accident.
   *
   * ## How "it stalled" is kept falsifiable
   *
   * The failing item is asserted BY ID, not by the fact that some failure
   * exists — `lastApplyFailure().item` is the envelope this device could not
   * fold, and a stall recorded against the wrong frame is a shell showing the
   * wrong thing. And the stall's CONSEQUENCE is paired both ways in the same
   * run: a fold that succeeded before it (the control) and a fold that is
   * refused after it (the chain really is parked, not merely flagged).
   *
   * ## THREE MUTATIONS, because the obvious one is not this case's own
   *
   * *`return true` at the top of `recoverByPull` → `Tests 4 failed | 23 passed
   * (27)`: this case, 12.163, 12.164 AND 12.309, all but the last on `expected
   * null not to be null`. It is a blunt mutant — returning early also skips the
   * `addPendingPulls`/`drain` body, so it breaks the swallow it claims to widen.*
   *
   * *Surgical, and the one this case's FIRST half is about: drop only
   * `if ((await replica.getTicket(item.entity.id)) !== null) return false;` →
   * `Tests 3 failed | 24 passed (27)`, this case with 12.163 and 12.164, 12.309
   * green. **Nothing reddens this half alone, and that is by construction**:
   * 12.163 and 12.164 were re-witnessed onto the same held-ticket throw when
   * closure 5c took their old one away, so three cases now share it. Stated
   * rather than claimed as an "alone" that was not measured.*
   *
   * *Surgical, and the SECOND half's own: drop only
   * `if (item.entity.kind !== 'ticket') return false;` → red HERE ALONE,
   * `Tests 1 failed | 26 passed (27)`, on the malformed definition —
   * `expected null not to be null`. The engine tries to pull a TICKET for a
   * `workflow.defined` it could not parse, the fixture's default `pullImpl`
   * throws, `drainPendingPulls` swallows that, and the definition failure
   * vanishes. That is the line no other case in this file covers.*
   *
   * *All three MEASURED AT THE PRE-P37.2 TREE and not repeated since — the
   * targeted lines are unchanged by that ruling. Mutation ledger at the foot of
   * this file.*
   */
  it('12.310 a fold failure on a ticket the device DOES hold stalls, and so does one on a non-ticket entity', async () => {
    const held = newUlid();
    const later = newUlid();
    const { script, replica, engine } = await fixture();
    await engine.start(WS);
    script.handlers!.onCaughtUp(9);
    await engine.settled();
    expect(await replica.getCursor(WS)).toBe(9);

    // The device really holds it, and the door really folds — the control the
    // throw below is measured against.
    script.handlers!.onItem(created(held));
    await engine.settled();
    expect((await replica.getTicket(held))?.confirmed?.stateId).toBe('todo');
    expect(engine.lastApplyFailure()).toBeNull();

    // A transition into a state `wfV1` does not have. The reducer resolves the
    // destination against the workflow and refuses it — a HELD ticket whose
    // fold throws for a reason that is not "never created", which is the input
    // the swallow must not touch.
    const bad = transitioned(held, 'nowhere', 2);
    script.handlers!.onItem(bad);
    await engine.settled();
    expect(engine.lastApplyFailure()).not.toBeNull();
    expect(engine.lastApplyFailure()!.code).toBe('apply-failed');
    expect(engine.lastApplyFailure()!.message).toContain('has no state "nowhere"');
    // The failure names the frame that caused it, by id.
    expect((engine.lastApplyFailure()!.item as LedgerEvent).id).toBe(bad.id);
    expect(engine.status()).toBe('offline');
    // No pull was attempted for a ticket the device holds. (The fixture's
    // default `pullImpl` throws, so a stray pull would also be loud — but this
    // line is what says the door refused rather than tried and failed.)
    expect(script.pullCalls).toEqual([]);
    // The cursor did not move past what did not apply, and the ticket kept the
    // state it folded to before the throw — the arrival was rolled back whole.
    expect(await replica.getCursor(WS)).toBe(9);
    expect((await replica.getTicket(held))?.confirmed?.stateId).toBe('todo');
    // AND THE CHAIN IS PARKED, which is the half a flag alone cannot show: an
    // item arriving after the stall is not applied at all.
    script.handlers!.onItem(created(later));
    await engine.settled();
    expect(await replica.getTicket(later)).toBeNull();
    engine.stop();

    // SECOND REFUSAL, fresh fixture: a non-ticket entity. `applyDefinition`
    // parses the payload with `workflowDefinedPayloadSchema` — a definition
    // this client cannot read throws there, and no ticket pull can repair it.
    const second = await fixture();
    await second.engine.start(WS);
    second.script.handlers!.onCaughtUp(9);
    await second.engine.settled();
    // Control first: a WELL-FORMED definition applies through this same door,
    // so the throw below is the payload and not the fixture.
    second.script.handlers!.onItem(envelope({ kind: 'workflow', id: WF }, 'workflow.defined', { ...wfV1, version: 2 }));
    await second.engine.settled();
    expect(second.engine.lastApplyFailure()).toBeNull();

    const malformed = envelope({ kind: 'workflow', id: WF }, 'workflow.defined', { id: WF, version: 'three' });
    second.script.handlers!.onItem(malformed);
    await second.engine.settled();
    expect(second.engine.lastApplyFailure()).not.toBeNull();
    expect(second.engine.lastApplyFailure()!.code).toBe('apply-failed');
    expect((second.engine.lastApplyFailure()!.item as LedgerEvent).id).toBe(malformed.id);
    expect(second.engine.status()).toBe('offline');
    expect(second.script.pullCalls).toEqual([]);
    second.engine.stop();
  });
});

/**
 * The per-ticket bootstrap door FOLDS, and the notice door COMPARES A POSITION
 * — the two halves the branch review found missing, closed here.
 *
 * They are unrelated mechanisms and share a describe only because they share a
 * branch and a review. 12.311 is `loadTicketBootstrap`'s own omission; 12.312
 * and 12.313 are ruling P37.2's `localHeadSeq(...) < headSeq`, the pair that
 * replaced the holdings test.
 *
 * *These two were written against closure 5c's FIRST form — `reconcileNamed`,
 * reconciling the ids a notice named — and that function was deleted under the
 * same ruling: a notice only names ids the viewer can see NOW and reconcile only
 * answers about ids they CANNOT, so the intersection is empty by construction
 * and the arm was a structural no-op. The ids were kept and the cases rewritten
 * rather than retired, because the QUESTION they were asking — does a notice
 * about a ticket the device already holds cost a fetch, and when — is the
 * question the new rule answers.*
 */
describe('12.311-12.313 the pull door’s fold, and the notice door’s head comparison', () => {
  /** v2 drops 'doing' entirely; the mandatory `stateMapping` says where its tickets go. */
  const wfV2Dropped = {
    ...wfV1,
    version: 2,
    states: [stateOf('todo', 'To do', 'open'), stateOf('done', 'Done', 'terminal')],
    transitions: [
      { from: '*', to: 'done', rules: [] },
      { from: '*', to: 'todo', rules: [] },
    ],
    stateMapping: { doing: 'todo' },
  };
  /** v3 changes nothing but the number, which is all the control needs to see. */
  const wfV3 = { ...wfV1, version: 3 };

  const createdWithTitle = (ticketId: string, title: string): LedgerEvent =>
    envelope(
      { kind: 'ticket', id: ticketId },
      'ticket.created',
      { typeId: TYPE, projectId: PROJECT, parentId: null, title },
      { seq: 1 },
    );

  /**
   * 12.311 — A DEFINITION THAT ARRIVES THROUGH THE PULL DOOR MOVES THE TICKETS
   * THIS DEVICE ALREADY HOLDS, AND THE STREAM WILL NOT DO IT LATER.
   *
   * `loadTicketBootstrap` stored every `workflow.defined` through
   * `applyDefinition` and never called `foldTicketsOntoVersion`. That looks
   * like a missing line and is worse than one, because the omission was
   * SELF-SEALING: the door inserts the definition envelope, so the SAME
   * `workflow.defined` arriving afterwards over the stream hits
   * `applyServerItem`'s duplicate-event-id early return and becomes a no-op
   * FOREVER. A client that pulled one ticket across a workflow publish kept the
   * old categories until the NEXT publish — the precise divergence
   * refresh-on-publish exists to prevent, on a client that looks fully caught
   * up. Category is what drives board columns, rollups, the open-children check
   * behind the parent-terminal invariant and the attention strip, so the visible
   * symptom is a desktop that disagrees with the web tab beside it about which
   * tickets are still open, with nothing saying so.
   *
   * ## The second half is the sealing, and it needs a control to be a claim
   *
   * "The stream's copy is inert" is a nothing-happened assertion, so the same
   * run delivers a v3 definition over that same door and watches the ticket
   * move. That separates "the stream door refused a duplicate" from "the stream
   * door is broken in this fixture" — and it is what makes the mutation land
   * alone: dropping `foldTicketsOntoVersion` from `loadTicketBootstrap` leaves
   * `applyDefinition` storing v2 in `workflows`, so the v1→v2→v3 chain stays
   * walkable and the v3 control still passes while both halves above go red.
   *
   * The delivered-frame observer (`engine.onItem`) is what says the duplicate
   * really reached the door rather than being dropped before it: `applyOne`
   * announces an item whose fold was a no-op, so an inert frame and an absent
   * one are distinguishable here and nowhere else on this interface.
   *
   * *Mutation: drop `await foldTicketsOntoVersion(tx, published);` from
   * `loadTicketBootstrap` in `replica.ts` → red HERE ALONE,
   * `Tests 1 failed | 26 passed (27)`, with
   * `expected { kind: 'ticket', …(13) } to match object { workflowVersion: 2, …(2) }`
   * and the received block reading `{ stateCategory: 'active', stateId: 'doing',
   * workflowVersion: 1 }` — the held ticket left standing in a state v2 does not
   * have. The v3 control stays green under it, which is what makes the mutant
   * land alone: `applyDefinition` still stores v2, so the version chain the
   * stream door walks is intact. **MEASURED AT THE PRE-P37.2 TREE**; the fold
   * this case is about is on the bootstrap door and the ruling did not touch it,
   * but the run has not been repeated. Mutation ledger at the foot of this file.*
   */
  it('12.311 a definition arriving in a pull payload folds the tickets already held, and the stream’s later copy is inert', async () => {
    const heldTicket = newUlid();
    const pulled = newUlid();
    const body = bootstrapOf();
    const v2 = envelope({ kind: 'workflow', id: WF }, 'workflow.defined', wfV2Dropped, { seq: 2 });
    const { script, replica, engine } = await fixture({
      bootstrapImpl: async () => body,
      pullImpl: async (_workspaceId, ticketId) => ({
        workspaceId: WS,
        // The server sends the whole version chain every time: a pulled ticket
        // may sit on a version this device has never seen and it cannot know
        // which. v1 is a duplicate here and is re-sent anyway, exactly as the
        // real door does.
        definitions: [...body.definitions, v2],
        ticket: { ticketId, snapshot: null, events: [created(ticketId)] },
      }),
    });
    await engine.start(WS);

    // The device holds a ticket standing in 'doing', on v1 — the state v2 is
    // about to drop. Without this the fold below would have nothing to move and
    // every assertion after it would be vacuous.
    script.handlers!.onItem(created(heldTicket));
    script.handlers!.onItem(transitioned(heldTicket, 'doing', 2));
    await engine.settled();
    expect((await replica.getTicket(heldTicket))?.confirmed).toMatchObject({
      workflowVersion: 1,
      stateId: 'doing',
      stateCategory: 'active',
    });

    // A pull happens for an unrelated ticket, and its payload carries v2.
    script.handlers!.onItem({ kind: 'reach-granted', workspaceId: WS, tickets: [{ id: pulled, headSeq: 1 }] });
    await engine.settled();
    expect(script.pullCalls).toEqual([{ workspaceId: WS, ticketId: pulled }]);

    // THE HELD TICKET MOVED. `stateId` rather than the version alone: v2 has no
    // 'doing' at all, so a device left on v1 is standing in a state its own
    // workflow no longer has, which is the failure a version-only assertion
    // would miss.
    expect((await replica.getTicket(heldTicket))?.confirmed).toMatchObject({
      workflowVersion: 2,
      stateId: 'todo',
      stateCategory: 'open',
    });
    // …and the pulled ticket landed on v2 too, because `buildLocalDeps` is
    // built after the definitions in that same transaction.
    expect((await replica.getTicket(pulled))?.confirmed?.workflowVersion).toBe(2);

    // SECOND HALF: the stream's own copy of that same `workflow.defined`.
    const seen: string[] = [];
    engine.onItem((item) => {
      if (!('kind' in item)) seen.push(item.id);
    });
    script.handlers!.onItem(v2);
    await engine.settled();
    // It ARRIVED — the observer fires after the fold, so this is the door
    // accepting a duplicate rather than the frame never reaching it.
    expect(seen).toEqual([v2.id]);
    // And it changed nothing, in either direction. Under the mutation this
    // reads `{ workflowVersion: 1, stateId: 'doing' }` — the fold that never
    // happened is not repaired here, which is the sealing.
    expect((await replica.getTicket(heldTicket))?.confirmed).toMatchObject({
      workflowVersion: 2,
      stateId: 'todo',
    });
    expect(engine.lastApplyFailure()).toBeNull();

    // THE CONTROL: a definition the stream has NOT seen folds through the same
    // door, so "inert" above is about the duplicate id and not about a stream
    // door that cannot fold at all.
    script.handlers!.onItem(envelope({ kind: 'workflow', id: WF }, 'workflow.defined', wfV3, { seq: 3 }));
    await engine.settled();
    expect((await replica.getTicket(heldTicket))?.confirmed?.workflowVersion).toBe(3);
    engine.stop();
  });

  /**
   * 12.312 — A NOTICE NAMING A TICKET THE DEVICE HOLDS *STALE* PULLS IT, AND
   * THE MISSING TAIL LANDS.
   *
   * This is the case ruling P37.2 exists for, and the rule it replaced failed
   * it. "Do I hold this ticket" cannot tell a COMPLETE local copy from a STALE
   * PARTIAL one, and a device that was narrowed and then re-widened holds
   * exactly the latter: a narrowing sends the losing device nothing at all
   * (6.101 struck the walk; 6.104 is the disclosed residual), so the local rows
   * simply stop growing while the server's ledger moves on. Under the old
   * id-only notice the device answered "I hold that one", fetched nothing, and
   * kept a copy it had no way to know was behind — the re-widening that was
   * supposed to repair the divergence was the event that skipped it.
   *
   * The notice therefore carries `{ id, headSeq }` and the client compares
   * ONE INTEGER: its own highest local `workspaceSeq` for that ticket against
   * the server's head. Below means fetch.
   *
   * ## What makes this able to fail for the reason it names
   *
   * The stale ticket is really held and really behind, and both halves are
   * asserted before the notice: it READS at its local state, and the tail the
   * server holds is an envelope this device does not have. `headSeq` is that
   * tail's own `workspaceSeq`, read off the envelope rather than written as a
   * literal — a number typed by hand would keep passing after the fixture moved
   * under it.
   *
   * Then the convergence itself is the assertion, not the pull alone: the
   * ticket ends in the state the MISSING event describes, and its local event
   * ids are exactly the two the server has. A pull that fetched and dropped the
   * payload leaves the first of those green and the second red.
   *
   * The unnamed sibling is the exactness control. A door that drained every
   * held id, or re-fetched the whole workspace on any notice, satisfies every
   * line above and fails on `pullCalls`.
   */
  it('12.312 a notice naming a ticket the device holds stale pulls it, and the missing tail lands', async () => {
    const stale = newUlid();
    const untouched = newUlid();
    const body = bootstrapOf();
    // The device folds the creation; the server has one more event on top of it.
    const staleCreated = created(stale);
    const serverTail = transitioned(stale, 'done', 2);
    const { script, replica, engine } = await fixture({
      bootstrapImpl: async () => body,
      // The per-ticket bootstrap ships the ticket's whole history. `created` is
      // a duplicate by event id and is skipped; the tail is what actually lands.
      pullImpl: async (_workspaceId, ticketId) => ({
        workspaceId: WS,
        definitions: body.definitions,
        ticket: { ticketId, snapshot: null, events: [staleCreated, serverTail] },
      }),
    });
    await engine.start(WS);

    script.handlers!.onItem(staleCreated);
    script.handlers!.onItem(created(untouched));
    await engine.settled();
    // HELD, and BEHIND — the two facts the notice's comparison is about, both
    // established before the notice arrives.
    expect((await replica.getTicket(stale))?.confirmed?.stateId).toBe('todo');
    expect((await replica.listEntityEvents(stale)).map((e) => e.id)).toEqual([staleCreated.id]);
    expect(serverTail.workspaceSeq).toBeGreaterThan(staleCreated.workspaceSeq);
    expect(script.pullCalls).toEqual([]);

    script.handlers!.onItem({
      kind: 'reach-granted',
      workspaceId: WS,
      tickets: [{ id: stale, headSeq: serverTail.workspaceSeq }],
    });
    await engine.settled();

    // IT WAS PULLED — a ticket the device holds, which the old holdings filter
    // would have skipped.
    expect(script.pullCalls).toEqual([{ workspaceId: WS, ticketId: stale }]);
    // …and it CONVERGED: the tail is in the local ledger and folded, not merely
    // requested. `listEntityEvents` is per-entity `seq` order, so this is the
    // whole local history for that ticket and nothing else.
    expect((await replica.listEntityEvents(stale)).map((e) => e.id)).toEqual([staleCreated.id, serverTail.id]);
    expect((await replica.getTicket(stale))?.confirmed?.stateId).toBe('done');
    expect((await replica.getTicket(stale))?.confirmed?.stateCategory).toBe('terminal');
    // Nothing left owed, nothing latched.
    expect(await replica.listPendingPulls(WS)).toEqual([]);
    expect(engine.lastApplyFailure()).toBeNull();
    expect(engine.status()).toBe('catching-up');
    // THE EXACTNESS CONTROL: the ticket the notice did not name was not pulled
    // and did not move.
    expect((await replica.getTicket(untouched))?.confirmed?.stateId).toBe('todo');
    expect((await replica.listEntityEvents(untouched)).length).toBe(1);
    engine.stop();
  });

  /**
   * 12.313 — AND A NOTICE NAMING A TICKET THE DEVICE IS ALREADY CURRENT ON
   * COSTS NO PULL.
   *
   * The control for 12.312, and without it that case is satisfied by a door
   * that fetches every id a notice names. That is not a hypothetical wrong
   * implementation, it is the cheap one: `check-permission.ts` does not refuse
   * a grant of what a principal already had, so a repeated no-op
   * `visibility.set` is ordinary traffic, and a door with no comparison in it
   * would re-download the granted subtree every time one arrived. P37.1's cost
   * argument — "a repeated no-op `visibility.set` costs a holding client
   * nothing" — is a claim about exactly this line and nothing else.
   *
   * ## The absence is paired with its own positive, in the same notice
   *
   * "No pull happened" is trivially true of a broken drain, a stalled engine,
   * or a notice that never arrived. So the notice names TWO ids: one the device
   * is current on and one it is behind on, and the assertion is the exact
   * one-entry `pullCalls` array. The same comparison, in the same run, in both
   * directions — a door that pulls everything shows two entries and a door that
   * pulls nothing shows none.
   *
   * `headSeq` for the current one is `>=`, not `>` — the device's local head
   * EQUALS it here, which is the boundary the rule is written on
   * (`localHeadSeq(...) < headSeq`). An off-by-one that used `<=` would pull a
   * ticket that is exactly current, and that is the mutant this case is FOR —
   * not one it kills alone. 12.305's skipped id sits on the same boundary for
   * the same reason, so the off-by-one reddens both, and this case's own
   * contribution is the two-directions-in-one-notice shape: 12.305's equal id
   * and its behind ids arrive in one notice too, but its behind ids are tickets
   * the device has never seen, where the comparison degenerates to the old
   * holdings test. Here the behind id is likewise unseen — so **neither case
   * covers a ticket the device HOLDS and is behind on; 12.312 is the only one
   * that does.** The three together are what pin the rule; none of them alone.
   */
  it('12.313 a notice naming a ticket the device is current on costs no pull, while a behind one in the same notice is fetched', async () => {
    const current = newUlid();
    const behind = newUlid();
    const body = bootstrapOf();
    const currentCreated = created(current);
    const { script, replica, engine } = await fixture({
      bootstrapImpl: async () => body,
      pullImpl: async (_workspaceId, ticketId) => ({
        workspaceId: WS,
        definitions: body.definitions,
        ticket: { ticketId, snapshot: null, events: [created(ticketId)] },
      }),
    });
    await engine.start(WS);

    script.handlers!.onItem(currentCreated);
    await engine.settled();
    const before = (await replica.listEntityEvents(current)).map((e) => e.id);
    expect(before).toEqual([currentCreated.id]);
    expect(await replica.getTicket(behind)).toBeNull();

    script.handlers!.onItem({
      kind: 'reach-granted',
      workspaceId: WS,
      tickets: [
        // Exactly the position this device already stands at.
        { id: current, headSeq: currentCreated.workspaceSeq },
        // And one it has never seen: local head 0, so any real head is above it.
        { id: behind, headSeq: 1 },
      ],
    });
    await engine.settled();

    // ONE entry, and it is the behind one. The current id is absent, and its
    // absence is the property; the behind one is what stops the absence from
    // being satisfied by a door that did nothing at all.
    expect(script.pullCalls).toEqual([{ workspaceId: WS, ticketId: behind }]);
    // The current ticket was not touched: same events, same state.
    expect((await replica.listEntityEvents(current)).map((e) => e.id)).toEqual(before);
    expect((await replica.getTicket(current))?.confirmed?.stateId).toBe('todo');
    // The behind one really landed, so the positive half is a fetch that worked
    // rather than a request that was merely counted.
    expect((await replica.getTicket(behind))?.confirmed?.stateId).toBe('todo');
    expect(await replica.listPendingPulls(WS)).toEqual([]);
    expect(engine.lastApplyFailure()).toBeNull();
    expect(engine.status()).toBe('catching-up');
    engine.stop();
  });
});

/**
 * 12.317-12.318 — RULING P37.3: A 404 DROPS THE OWED ID, KEYED TO THE NOTICE
 * THAT ISSUED THE PULL.
 *
 * The Critical's fix — `recoverByPull` swallowing a fold failure for a ticket
 * the device does not hold — turned the revoked-project sequence from a loud
 * stall into a QUIET PERMANENT LEAK: a pull that 404s and an id owed on every
 * catch-up, for ever. The obvious bound (drop on 404) was deliberately not
 * built at first, because `bootstrapTicket` answers "you may not see it" and
 * "it never existed" with the SAME 404 — deliberately, so that
 * presence-versus-absence is not an oracle — so the device cannot tell a
 * genuine phantom from a race in which visibility narrowed again between the
 * notice and the pull. Dropping on the status code would discard a re-widening
 * that arrived a millisecond late.
 *
 * The ruling's deciding fact is that **a 404 is never the last word; the next
 * notice is.** Every re-widening emits a fresh grant/reach notice naming the
 * id, so the notice mechanism IS the recovery path. Each pending entry
 * therefore carries the `workspaceSeq` of the notice that named it, and a 404
 * drops the entry only if that recorded seq is still the one the pull was
 * issued for. The drop is keyed to the NOTICE, not to the status code.
 *
 * ## These two cases are a matched pair and neither means anything alone
 *
 * 12.317 says the drop HAPPENS; 12.318 says it is not UNCONDITIONAL. A file
 * with only the first ratifies the leak's fix and the race's regression in one
 * breath; a file with only the second cannot tell the keyed drop from no drop
 * at all. So each is written to redden under its own mutation and to SURVIVE
 * the other's — 12.318 deliberately does not re-assert 12.317's property, and
 * that omission is the design rather than a gap:
 *
 * | mutation | 12.317 | 12.318 |
 * |---|---|---|
 * | the `TicketPullNotFound` arm deleted (never drop) | RED | passes |
 * | the `headSeq` guard deleted (always drop) | passes | RED |
 *
 * If 12.318 also reddened under the first, its racing write would not be doing
 * the work and the case would be measuring 12.317 twice.
 *
 * ## ⚠️ THE RACE 12.318 MODELS IS NOT REACHABLE THROUGH THE SOCKET TODAY
 *
 * Derived at this tree before the case was written, and it is the case's whole
 * justification for existing in the shape it has. `applyChain` is STRICTLY
 * SERIAL, and every `drainPendingPulls` call site — `applyOne`'s
 * `reach-granted` arm, `recoverByPull`, and `onCaughtUp` — sits on that chain.
 * A second notice arriving over the socket is queued BEHIND the link that is
 * holding the in-flight pull, so it cannot write between the pull's issue and
 * its 404. `withTimeout`'s abandonment cannot deliver a late 404 to the `catch`
 * either: `Promise.race` has already settled, so that rejection is unhandled
 * and never reaches `dropPendingPullIfUnchanged`.
 *
 * **So through the socket path alone, the keyed drop and an unconditional drop
 * are behaviourally identical** — the second notice has not written at drop
 * time, and it re-adds the id afterwards either way. A fixture driven purely
 * through `onItem` would let the unconditional mutation survive, and would
 * report a green case for a guard that does nothing.
 *
 * The honest second writer is the one `replica.ts`'s own docblock names when it
 * explains why `addPendingPulls` reads inside its transaction: *"the set is
 * public API and a shell may add to it too."* 12.318 therefore applies the
 * racing notice through `replica.applyServerItem` from inside `pullImpl` —
 * off-chain, exactly as a shell would, and through the REAL `reach-granted`
 * filter rather than around it. The keying becomes socket-load-bearing the
 * moment the drain ever runs off the apply chain, and this case is what will
 * already be there when it does.
 */
describe('12.317-12.318 the 404 drop, keyed to the notice (ruling P37.3)', () => {
  /** As `12.305-12.308`'s, and local for the same reason: that one is describe-scoped. */
  const pullPayloadOf = (body: BootstrapResponse, ticketId: string): TicketBootstrap => ({
    workspaceId: WS,
    definitions: body.definitions,
    ticket: { ticketId, snapshot: null, events: [created(ticketId)] },
  });

  /**
   * 12.317 — ONE 404 FORGETS THE ID FOR GOOD.
   *
   * The revoked-project sequence, which is the one that reliably produces the
   * leak: a notice names a ticket, visibility is withdrawn before the device
   * pulls it, and the pull answers 404 for ever after. Before the ruling the id
   * sat in the pending set and cost one HTTP request on every single catch-up
   * for the life of the install.
   *
   * ## Two ids, two failure kinds, one drain
   *
   * "No request was issued" is trivially true of a drain that stopped running,
   * of a stalled engine, and of a catch-up that never fired — so the phantom
   * does not travel alone. Beside it is an id whose pull fails with an ORDINARY
   * error, which is 12.306's property and must NOT drop: a network wobble is
   * not an answer. Both ids ride the same notice, the same drain and the same
   * catch-ups, so the assertion is a contrast measured in one run rather than
   * an absence measured against nothing. A drain that stopped running shows the
   * wobbling id missing too, and the case fails loudly instead of passing.
   *
   * ## TWO later catch-ups, not one
   *
   * "No request on ANY later catch-up" is a claim about the steady state. One
   * catch-up cannot distinguish it from one-shot suppression — a bug that
   * skipped the first retry and resumed on the second would read as green. The
   * wobbling id supplies the positive on both of them, so each catch-up is
   * independently known to have drained.
   */
  it('12.317 one 404 forgets the owed id for good, while a wobbling id beside it is retried on every catch-up', async () => {
    const phantom = newUlid();
    const wobble = newUlid();
    const body = bootstrapOf();
    const { script, replica, engine } = await fixture({
      bootstrapImpl: async () => body,
      pullImpl: async (_workspaceId, ticketId) => {
        // "Nothing travels" — the route's answer for a ticket the caller may
        // not see AND for one that never existed, indistinguishably.
        if (ticketId === phantom) throw new TicketPullNotFound(ticketId);
        // An ordinary transport failure, which carries no answer at all.
        throw new Error(`transport refused the pull for ${ticketId}`);
      },
    });
    await engine.start(WS);

    script.handlers!.onItem({
      kind: 'reach-granted',
      workspaceId: WS,
      tickets: [
        { id: phantom, headSeq: 5 },
        { id: wobble, headSeq: 5 },
      ],
    });
    await engine.settled();

    // Both were attempted: the drop is a fact about a pull that RAN.
    expect(script.pullCalls).toEqual([
      { workspaceId: WS, ticketId: phantom },
      { workspaceId: WS, ticketId: wobble },
    ]);
    // And the outcomes diverge. The 404'd id is gone from the set; the wobbling
    // one is still owed, at the head the notice gave it. This exact array is
    // the case — a `toContain` would be satisfied by dropping neither.
    expect(await replica.listPendingPulls(WS)).toEqual([{ id: wobble, headSeq: 5 }]);
    // Nothing latched: the 404 is handled, not survived.
    expect(engine.lastApplyFailure()).toBeNull();

    // FIRST later catch-up. The wobbling id is retried — which is what proves
    // the drain ran — and the phantom is not.
    script.handlers!.onCaughtUp(9);
    await engine.settled();
    expect(script.pullCalls).toEqual([
      { workspaceId: WS, ticketId: phantom },
      { workspaceId: WS, ticketId: wobble },
      { workspaceId: WS, ticketId: wobble },
    ]);

    // SECOND later catch-up, and the same again. One catch-up could not tell
    // "forgotten" from "skipped once".
    script.handlers!.onCaughtUp(11);
    await engine.settled();
    expect(script.pullCalls).toEqual([
      { workspaceId: WS, ticketId: phantom },
      { workspaceId: WS, ticketId: wobble },
      { workspaceId: WS, ticketId: wobble },
      { workspaceId: WS, ticketId: wobble },
    ]);

    // The set is unchanged across both. The exact equality on the line above is
    // what carries this — an empty payload would have called `clearPendingPull`
    // and shown up there. The `getTicket` null below is NOT doing work: this
    // fixture's `pullImpl` throws for both ids, so nothing can ever write a
    // tickets row for the phantom and the line cannot fail under any reachable
    // product behaviour. Kept as a cheap tripwire against a future edit that
    // makes the payload path reachable, and labelled so nobody counts it as
    // evidence. (Found by this branch's fixture review, reading the runs.)
    expect(await replica.listPendingPulls(WS)).toEqual([{ id: wobble, headSeq: 5 }]);
    expect(await replica.getTicket(phantom)).toBeNull();
    expect(engine.lastApplyFailure()).toBeNull();
    expect(engine.status()).toBe('live');
    engine.stop();
  });

  /**
   * 12.318 — A NOTICE ARRIVING DURING THE PULL SURVIVES THE 404.
   *
   * The race the ruling refused to lose. Visibility is withdrawn, the pull is
   * issued, visibility is RE-WIDENED while it is in flight, and the 404 lands
   * afterwards answering a question nobody is asking any more. An unconditional
   * drop discards the re-widening and the device never learns it may read the
   * ticket — silently, because there is no error and nothing to retry.
   *
   * The second notice is applied through `replica.applyServerItem` from inside
   * `pullImpl` rather than through `onItem`, and the block comment above this
   * describe carries the derivation for why it MUST be: the apply chain is
   * serial, so a socket-delivered notice cannot land inside the pull's window,
   * and a case driven that way would let the unconditional mutant live. This
   * models the public-API writer `replica.ts` documents, through the real
   * `reach-granted` filter.
   *
   * ## What the assertions are shaped to exclude
   *
   * `headSeq: 9` is asserted, not merely presence. "The id is still owed" is
   * also true of a drop that never ran at all, so the number is what says the
   * racing notice REPLACED the recorded seq and that the guard compared against
   * the new value — the whole mechanism, in one integer. And `pullCalls` is
   * asserted before it, so the survival is a fact about a 404 that was actually
   * received rather than about a pull that never happened.
   *
   * This case deliberately does NOT also assert that an unraced 404 drops.
   * That is 12.317's property, and re-asserting it here would make this case
   * redden under 12.317's mutation too — at which point the pair would no
   * longer discriminate and the racing write would be doing no work.
   */
  it('12.318 a notice arriving during the pull keeps the id owed through its 404, and the next catch-up fetches it', async () => {
    const raced = newUlid();
    const body = bootstrapOf();
    const { script, replica, engine } = await fixture({ bootstrapImpl: async () => body });
    await engine.start(WS);

    // The re-widening, landing while the pull is in flight. `fakeTransport`
    // reads `script.pullImpl` at call time, so this is the pull's own window.
    script.pullImpl = async (_workspaceId, ticketId) => {
      await replica.applyServerItem({
        kind: 'reach-granted',
        workspaceId: WS,
        tickets: [{ id: ticketId, headSeq: 9 }],
      });
      throw new TicketPullNotFound(ticketId);
    };

    script.handlers!.onItem({
      kind: 'reach-granted',
      workspaceId: WS,
      tickets: [{ id: raced, headSeq: 5 }],
    });
    await engine.settled();

    // The pull ran and answered 404 — without this line the survival below is
    // a claim about a request that was never made.
    expect(script.pullCalls).toEqual([{ workspaceId: WS, ticketId: raced }]);
    // It survived, AT THE NEWER NOTICE'S HEAD. The 9 is the mechanism: the
    // recorded seq was replaced mid-pull, so the guard's comparison against the
    // 5 the pull was issued for could not match, and the entry stayed.
    expect(await replica.listPendingPulls(WS)).toEqual([{ id: raced, headSeq: 9 }]);
    // Same caveat as 12.317's: `pullImpl` throws before returning, so this null
    // is not falsifiable here. The falsifiable readability assertion is the one
    // AFTER the catch-up, where a payload really lands.
    expect(await replica.getTicket(raced)).toBeNull();
    expect(engine.lastApplyFailure()).toBeNull();

    // The re-widening is real on the server side now, so the next catch-up's
    // drain converges. This is the half that makes the survival worth having.
    script.pullImpl = async (_workspaceId, ticketId) => pullPayloadOf(body, ticketId);
    script.handlers!.onCaughtUp(9);
    await engine.settled();

    expect(script.pullCalls).toEqual([
      { workspaceId: WS, ticketId: raced },
      { workspaceId: WS, ticketId: raced },
    ]);
    // A ticket that READS, not a row that exists.
    expect((await replica.getTicket(raced))?.confirmed?.stateId).toBe('todo');
    expect(await replica.listPendingPulls(WS)).toEqual([]);
    expect(engine.lastApplyFailure()).toBeNull();
    expect(engine.status()).toBe('live');
    engine.stop();
  });
});

/**
 * THE MUTATION LEDGER — what was measured, against WHICH tree, and what is still
 * only a prediction.
 *
 * This block exists because two things happened during closure 5c's test lane
 * that a per-case footnote cannot carry honestly.
 *
 * ## 1. Every measurement below was taken BEFORE ruling P37.2
 *
 * P37.2 changed the notice's wire shape mid-lane — `ticketIds: string[]` became
 * `tickets: { id, headSeq }[]` — and deleted `reconcileNamed` from
 * `applyOne`'s `reach-granted` arm. The cases were rewritten against the new
 * rule and are green at the new tree (`Tests 27 passed (27)`, Node v22.22.2).
 * The MUTATIONS were not re-run there. Each targeted line was checked to still
 * exist verbatim, which is a reason to expect the same result and is NOT the
 * same thing as having it — this file's own header spends a page on the
 * difference, so the notes say "measured at the pre-P37.2 tree" rather than
 * carrying the numbers forward under a fresh sentence.
 *
 * ## 2. Mutating shared source while another lane commits is not safe here
 *
 * Measured, at a cost: a mutation applied to `sync-engine.ts` at 09:13:20 was
 * swept into commit `75657f2` at 09:13:21 by a concurrent lane staging that
 * path by name, and stood in `HEAD` for two further commits. One of those
 * commits reported a measurement taken against the mutated tree. Staging
 * explicit paths does not prevent this; nothing in git does. **The remaining
 * mutations were therefore handed to the branch owner to run under the gate lock
 * rather than run here — and it ran them; see the section below.**
 *
 * ## MEASURED, pre-P37.2 tree, Node v22.22.2, denominator (27)
 *
 * | edit | file | red |
 * |---|---|---|
 * | `return false` at the top of `recoverByPull` | `src/engine/sync-engine.ts` | 12.309 alone — `1 failed \| 26 passed` |
 * | `return true` at the top of `recoverByPull` | `src/engine/sync-engine.ts` | 12.163, 12.164, 12.309, 12.310 — `4 failed \| 23 passed` |
 * | drop `if ((await replica.getTicket(item.entity.id)) !== null) return false;` | `src/engine/sync-engine.ts` | 12.163, 12.164, 12.310 — `3 failed \| 24 passed` |
 * | drop `if (item.entity.kind !== 'ticket') return false;` | `src/engine/sync-engine.ts` | 12.310 alone — `1 failed \| 26 passed` |
 * | drop `await foldTicketsOntoVersion(tx, published);` from `loadTicketBootstrap` | `src/replica/replica.ts` | 12.311 alone — `1 failed \| 26 passed` |
 * | `.catch(() => undefined)` for `.catch((err) => stall(err, item))` in `onItem` | `src/engine/sync-engine.ts` | 12.163, 12.164, 12.310 — `3 failed \| 24 passed` |
 *
 * Two more were measured against the DELETED `reconcileNamed` arm and are kept
 * only as the record of why 12.312/12.313 are shaped as a pair: neutralising
 * `reconcileNamed` reddened both (`2 failed | 25 passed`), and dropping the
 * re-owe `addPendingPulls(purged)` reddened 12.312 alone (`1 failed | 26
 * passed`). Neither edit exists any more.
 *
 * ## ~~NOT MEASURED~~ — MEASURED 2026-09-06 12:49 IST at `bc45bba`. BOTH RAN.
 *
 * The branch owner ran both under the gate lock, in one quiet window, against
 * the WHOLE package (8 files / 87 tests) rather than this file's 27. Baseline
 * `87 passed (87)` before and after; every restore left the tree clean; each
 * edit was grep-confirmed present before its run. **Never below → 9 red**
 * (12.305, 12.306, 12.308, 12.309, 12.311, 12.312, 12.313, **12.317, 12.318**),
 * 12.310 surviving as predicted. **Always pull (`<=`) → 12.305 + 12.313**,
 * `2 failed | 85 passed`, exactly as predicted.
 *
 * **The SEVEN below was right when it was derived and is wrong now, and the
 * reason is worth more than the number.** The enumeration was exhaustive over
 * this file AS IT THEN STOOD; 12.317 and 12.318 were added afterwards and both
 * assert a `pullCalls` array reached through that same line, so the clause
 * "every case that asserts a `pullCalls` array" stopped being true the moment
 * they landed — without anything in it changing. A derived enumeration is a
 * fact about a tree, and this one outlived its tree by one commit. The three
 * numbers are kept separately — predicted-at-derivation 7, predicted-at-this-
 * tree 9, measured 9 — because collapsing them would make a correct
 * measurement read as a finding. Full table in `test-cases/12-offline-sync-apps.md`.
 *
 * ### The predictions as they were written, kept verbatim
 *
 * Both target the one line ruling P37.2 turns on, `src/replica/replica.ts`'s
 * `if ((await localHeadSeq(storage, id)) < headSeq) missing.push(id);`:
 *
 * The expected red sets below are DERIVED, by enumerating every `headSeq`
 * literal in this file, and the enumeration is the whole method: exactly TWO
 * notices name an id whose head EQUALS the device's local head — 12.305's
 * `{ id: held, headSeq: heldCreated.workspaceSeq }` and 12.313's
 * `{ id: current, headSeq: currentCreated.workspaceSeq }`. Every other notice
 * here names only ids the device is behind on.
 *
 * - **Never below** (`if (false) missing.push(id);` — the comparison behaving as
 *   though every local head were already equal): expected red on SEVEN cases —
 *   12.305, 12.306, 12.308, 12.309, 12.311, 12.312 and 12.313 — every case that
 *   asserts a `pullCalls` array reached through this line, each of which becomes
 *   `[]`. Only 12.310, which sends no notice at all, should survive. A blunt
 *   mutant, and predicted as one: it says the line is load-bearing and nothing
 *   finer.
 * - **Always pull** (`missing.push(id);` unconditionally, which is also what an
 *   off-by-one `<=` for `<` does at the boundary): expected red on 12.305 AND
 *   12.313 — the two cases above, each gaining one unwanted entry in an exact
 *   `pullCalls` array. 12.313 fails as
 *   `expected [ { …(2) }, { …(2) } ] to deeply equal [ { …(2) } ]`; 12.305 as a
 *   three-entry array led by `held`.
 *
 * The second is the one that matters — the boundary is where a `<=` hides — and
 * it is pinned by two independent cases rather than one. *An earlier draft of
 * this ledger predicted "12.313 alone" and was wrong: it forgot that 12.305's
 * own rewrite under P37.2 gave the skipped id an equal head for exactly the same
 * reason. Two witnesses is the better outcome, and the correction is recorded
 * rather than quietly widened.*
 */
