import type { SubmittedEvent } from '@gisik-nokma/domain';
import type { BootstrapResponse, Replica } from '../replica/replica.js';
import { isSyncInstruction, type SyncItem } from '../replica/sync-item.js';
import type { Outbox, SyncEventResult } from '../outbox/outbox.js';

export type StreamHandlers = {
  /**
   * One item off the stream: an event envelope, a `PurgeInstruction`, or a
   * `ScopeRevokedInstruction`. All THREE, not two — see `sync-item.ts` for why
   * dropping the third is the failure that leaves a revoked device showing work
   * it was removed from.
   */
  onItem(item: SyncItem): void;
  /** Amendment 19: only for THIS subscription's workspace. */
  onCaughtUp(seq: number): void;
  /** Amendment 19's error frame — surfaced, never swallowed. */
  onError(err: { code: string; message: string }): void;
  onClose(): void;
};

export type StreamHandle = { close(): void };

export type SyncTransport = {
  bootstrap(workspaceId: string): Promise<BootstrapResponse>;
  /** `POST /v1/sync`. The server answers index-aligned with the request array. */
  sync(events: SubmittedEvent[]): Promise<SyncEventResult[]>;
  openStream(workspaceId: string, afterSeq: number, handlers: StreamHandlers): StreamHandle;
};

export type SyncStatus = 'offline' | 'connecting' | 'catching-up' | 'live';

/**
 * A frame this replica could not fold.
 *
 * SEPARATE FROM `lastError()` ON PURPOSE, and the separation is the point. The
 * two are different facts with different owners: `lastError()` is the server's
 * own amendment-19 error frame, kept verbatim because the server named a
 * reason; this is a LOCAL fold failure, where the server said nothing wrong and
 * this device could not apply what it was correctly sent. Putting both in one
 * slot would give the accessor two meanings while its docblock claimed one.
 */
export type ApplyFailure = {
  code: 'apply-failed';
  /** `applyTicketEvent`'s own words, unedited. */
  message: string;
  /**
   * The item that could not be applied, or `null` when this engine does not
   * hold one to name.
   *
   * TWO DIFFERENT REASONS FOR `null`, and the second was added by the flush
   * door's fix, which is why this sentence no longer reads "when the failure
   * was not an item's": a `caught-up` link that fails has no item at all, while
   * a failing `applyResult` DOES have one — the `LedgerEvent` `outbox.ts` builds
   * from the queued row plus the server's verdict — and the engine deliberately
   * does not rebuild it here. `lastError()`'s message carries the reducer's own
   * words either way.
   */
  item: SyncItem | null;
};

export type SyncEngine = {
  start(workspaceId: string): Promise<void>;
  stop(): void;
  /** Drain every due outbox batch now. */
  flush(): Promise<void>;
  status(): SyncStatus;
  /** The last error frame the server sent on this stream (amendment 19), or null. */
  lastError(): { code: string; message: string } | null;
  /** The item this replica could not fold, or null. Non-null means the stream is STALLED. */
  lastApplyFailure(): ApplyFailure | null;
  /**
   * Resolves once every frame handed to the handlers so far has been applied
   * and any in-flight flush has finished.
   *
   * NOT DECORATION AND NOT ONLY FOR TESTS. `onItem` and `onCaughtUp` are
   * synchronous callbacks over an asynchronous replica, so "the frame arrived"
   * and "the frame was applied" are different moments and nothing else on this
   * interface can tell them apart. A caller asserting that something did NOT
   * happen — the case this engine's two hardest obligations are about — has no
   * other way to wait: `vi.waitFor` can only wait for a change to appear, and
   * the absence of a cursor advance never appears.
   */
  settled(): Promise<void>;
  onStatus(cb: (status: SyncStatus) => void): () => void;
  /**
   * Every item this engine applied FROM THE STREAM, in arrival order, after the
   * replica folded it. Returns the unsubscribe.
   *
   * ## The OTHER door into `applyServerItem`, named rather than left to be found
   *
   * `flush()` reaches `applyServerItem` too — through `outbox.applyResult`,
   * which rebuilds the device's own committed claim into a `LedgerEvent` and
   * folds it. **This observer does not fire there**, and the reason it is safe
   * is a property of the protocol rather than of this file: a flush only runs
   * while the engine is `live`, i.e. subscribed, and the server streams every
   * event this device may see — so the same envelope arrives on the stream and
   * IS announced, by id, through the branch above. `applyServerItem` ignores it
   * as the duplicate it is; this observer still reports it, which is what a
   * view needs. Announcing at both doors would fire twice for one claim.
   * Enumerated from the call graph (`applyOne`, `outbox.applyResult`), not from
   * a count in a docblock — the third door into this function is exactly what
   * Task 11's fix round found by counting a docblock's word "pair".
   *
   * ## Why an observer and not `replica.onChange`
   *
   * `onChange` is a bare "something moved" signal with no frame in it, and Plan
   * 10 Task 12's `DataSource.subscribe` must hand its callback the real 5-kind
   * `ServerStreamFrame` — the executor ruling forbids declaring a parallel or
   * truncated frame union to get around that. This engine is the only component
   * that ever holds a frame-shaped value, so the choice was to expose the one
   * it already has (`SyncItem`, no new union) or to let the replica source
   * synthesize frames it was never sent. `packages/app-core/src/views/
   * use-live-query.ts` re-queries only on `event` and `purge`, so the
   * synthesizing option ends in every offline view frozen while looking wired
   * up — a failure that surfaces as "the app does not refresh", never as a type
   * error.
   *
   * AFTER the fold, deliberately: a subscriber told about an item the replica
   * then failed to apply would re-query and read a store that does not contain
   * it. A stalling item (`stall`) is therefore never announced, which is the
   * same rule the cursor follows.
   *
   * A listener that throws must not take the apply chain down with it — the
   * chain's rejection path is `stall`, and a view's render error is not a fold
   * failure. Errors are swallowed here for that reason.
   */
  onItem(cb: (item: SyncItem) => void): () => void;
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Orchestrates the honest loop: bootstrap once, catch up from the cursor, apply
 * every frame (duplicates are no-ops — re-delivery is the protocol's failure
 * mode, silence is not), persist the cursor only at caught-up, and push claims
 * up in order whenever we are live.
 *
 * ## THE CURSOR IS THIS MODULE'S WHOLE RESPONSIBILITY, and it inherits two
 * ## hazards that only exist because something finally advances one
 *
 * Two hazards were recorded against `replica.ts` with this task named as owner
 * (cases 12.154 and 12.155), and neither is reachable until a caller drives the
 * replica with a cursor. Both are answered here rather than there:
 *
 * 1. **The bootstrap door can LOWER a baseline the stream door raised.**
 *    `writeSnapshot` is an unconditional `ON CONFLICT … DO UPDATE SET seq =
 *    excluded.seq`, and the obvious `Math.max` guard was applied, measured and
 *    REJECTED — it removes a loud throw and silently drops a transition from
 *    the log `require-different-user` sorts on (12.154 carries the
 *    measurement). So this engine does not re-apply the rejected remedy and
 *    does not re-bootstrap a replica that holds a local baseline at all. See
 *    `needsBootstrap`.
 * 2. **A frame this replica cannot fold throws out of `applyServerItem`**, per
 *    the deliberate per-arrival-rollback contract (12.125), where the pre-check
 *    door catches the identical fold. The engine STALLS on it — see `stall` —
 *    rather than skipping the item or re-delivering it forever.
 *
 *    **THREE CALLERS REACH THAT THROW FROM THIS FILE, not two, and the count is
 *    written as an enumeration because the two-door version of this sentence
 *    stood here while the third door was open.** `onItem`'s chain calls
 *    `applyOne` → `replica.applyServerItem`; `onCaughtUp`'s chain calls
 *    `engine.flush()`; and `flush` itself calls `outbox.applyResult`, which
 *    folds a `committed` verdict through `replica.applyServerItem` too. The
 *    first two had `.catch(… stall)` from the first draft; the third had
 *    nothing, so a fold failure on the flush path rejected `flush()`, left
 *    `status()` at `catching-up` and `lastApplyFailure()` at `null`, and — with
 *    no `recordFailure` — re-sent the identical batch on the next flush.
 *    Case 12.170.
 *
 * ## What is NOT decided here
 *
 * An amendment-19 `error` frame is recorded and nothing else: this engine
 * reconnects after it, on the same delay as any other close. `not-a-member` on
 * a live socket therefore retries on a fixed delay rather than giving up — the
 * same behaviour `packages/app-core/src/online/stream.ts` has today, where it
 * is also unaddressed. The revocation path that actually matters is
 * `scope-revoked`, which IS terminal here. *RECORDED, NOT FIXED: a policy per
 * `StreamErrorCode` (give up on `not-a-member`, retry on `bad-message`).*
 *
 * SPLIT BY RULING P34 (2026-09-06), because "belongs with whoever owns the
 * client's error surface" ran two different things together:
 * - The SURFACE is done. `syncStatusBar`'s `syncErrorNotice`
 *   (`packages/app-core/src/sync/sync-status-bar.tsx`, Plan 10 Task 13) shows
 *   `lastError()` — the code verbatim and the server's own message. It states
 *   that this client is STILL RETRYING, because that is what the code below
 *   does for every one of the three `STREAM_ERROR_CODES`; a surface saying
 *   otherwise would assert a decision on this engine's behalf.
 * - The POLICY is still open and still lives HERE, not there. Whether
 *   `not-a-member` should end the retry loop is a judgement about a membership
 *   that may be restored, and no view can take it. **Owner: unassigned.**
 */
export function createSyncEngine(deps: {
  replica: Replica;
  outbox: Outbox;
  transport: SyncTransport;
  reconnectDelayMs?: number;
}): SyncEngine {
  const { replica, outbox, transport } = deps;
  const reconnectDelayMs = deps.reconnectDelayMs ?? 2000;

  let currentStatus: SyncStatus = 'offline';
  let handle: StreamHandle | null = null;
  let workspaceId: string | null = null;
  let stopped = true;
  /** Set when a frame could not be applied. The cursor is frozen while it holds. */
  let stalled = false;
  /** Set when the subscription ended for good (a workspace revocation): no reconnect. */
  let streamEnded = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Frames apply strictly in arrival order. Never rejects: every link ends in a handler. */
  let applyChain: Promise<unknown> = Promise.resolve();
  let flushing: Promise<void> | null = null;
  let lastStreamError: { code: string; message: string } | null = null;
  let applyFailure: ApplyFailure | null = null;
  const statusListeners = new Set<(s: SyncStatus) => void>();
  const itemListeners = new Set<(item: SyncItem) => void>();

  function setStatus(next: SyncStatus): void {
    if (next === currentStatus) return;
    currentStatus = next;
    for (const cb of statusListeners) cb(next);
  }

  function closeStream(): void {
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    handle?.close();
    handle = null;
    setStatus('offline');
  }

  /**
   * A frame did not apply. Stop, loudly, and move nothing.
   *
   * The two alternatives are both worse and both quiet. Swallowing the throw and
   * letting `caught-up` advance the cursor SKIPS the item permanently — the
   * local ledger then misses a row the server believes was delivered, and the
   * rollback means there is no trace to find it by. Swallowing it and pinning
   * the cursor re-delivers the same item on every reconnect, where it throws
   * again: a hot loop that never converges and never says anything. That is the
   * wedged stream 12.155's owner line names.
   *
   * Stalling converts an invisible infinite state into one visible terminal
   * one. Recovery is a deliberate `start()`, which is where a shell can decide
   * to re-bootstrap — and where `needsBootstrap` will refuse to if there is a
   * local baseline to lose.
   *
   * **THE FLUSH DOOR CAN REACH THIS WITH `handle === null`, and that is fine
   * for a stated reason rather than by luck.** `flush()` is public and takes no
   * stream: a caller may drain the outbox before `start()` or after `stop()`,
   * and a fold failure there lands here with no socket open. `closeStream`'s
   * `handle?.close()` absorbs it and `setStatus('offline')` is already true, so
   * the whole function reduces to recording the failure — which is the honest
   * outcome, because the failure is the replica's and not the stream's. Written
   * down rather than left to the `?.`: a caller reaching this function by a
   * route no case walks is the shape that produced the third-door defect one
   * screen down.
   */
  function stall(err: unknown, item: SyncItem | null): void {
    if (stalled) return;
    // `stalled` IS SET BEFORE `closeStream()`, and the value of that ordering is
    // measured rather than asserted — the same lesson
    // `app-core/src/online/stream.ts`'s `shutDown` records about its own flag.
    // `StreamHandle` is an injected seam: a transport whose `close()` dispatches
    // `onClose` synchronously re-enters the close handler while this function is
    // still running. With the flag set last, that handler publishes `connecting`
    // and arms a retry timer AFTER `closeStream` has already cleared timers, so
    // nothing ever clears it — a timer outliving the stall. Measured: moving
    // this line below `closeStream()` reddens 12.163 with
    // `expected ['connecting', 'offline'] to deeply equal ['offline']`. The
    // SUBSCRIPTION COUNT cannot see it, because the stray timer's own guard
    // reads `stalled` by the time it fires; the status sequence can, which is
    // why 12.163 asserts that too.
    stalled = true;
    applyFailure = { code: 'apply-failed', message: messageOf(err), item };
    closeStream();
  }

  async function applyOne(item: SyncItem): Promise<void> {
    if (stopped || stalled || streamEnded) return;
    await replica.applyServerItem(item);
    // A workspace-wide revocation is TERMINAL for the subscription
    // (`stream-frames.ts`): it carries no cursor, and reconnecting into a
    // workspace you were just removed from earns `not-a-member` forever. It is
    // delivered to the replica FIRST — emptying itself is the only thing the
    // instruction is for — and the socket is dropped afterwards.
    //
    // A PROJECT-scoped instruction is not terminal: membership stands. The wire
    // cannot carry one today (`ServerStreamFrame` declares `projectId?: never`
    // and the hub refuses an instruction with one), but `ScopeRevokedInstruction`
    // admits it and this door is the one that would see it.
    if (isSyncInstruction(item) && item.kind === 'scope-revoked' && item.projectId === undefined) {
      streamEnded = true;
      closeStream();
    }
    // AFTER the fold and after the revocation branch, so a subscriber that
    // re-queries on this signal reads a store that already contains the item —
    // or, for a revocation, one that has already emptied itself. A listener
    // that throws is swallowed: this link's rejection path is `stall`, and a
    // view's render error is not a fold failure.
    for (const cb of itemListeners) {
      try {
        cb(item);
      } catch {
        // deliberately ignored — see `onItem`
      }
    }
  }

  function subscribe(afterSeq: number): void {
    if (stopped || stalled || streamEnded || workspaceId === null) return;
    setStatus('catching-up');
    handle = transport.openStream(workspaceId, afterSeq, {
      onItem: (item) => {
        applyChain = applyChain.then(() => applyOne(item)).catch((err: unknown) => stall(err, item));
      },
      onCaughtUp: (seq) => {
        // Queued onto the SAME chain, so the cursor is only written after every
        // item that arrived before this frame has actually applied. And the
        // stall check is read INSIDE the link, not at enqueue time: a caught-up
        // queued behind an item that has not failed *yet* must still see the
        // failure when its turn comes.
        applyChain = applyChain
          .then(async () => {
            if (stopped || stalled || streamEnded || workspaceId === null) return;
            await replica.setCursor(workspaceId, seq);
            setStatus('live');
            await engine.flush();
          })
          .catch((err: unknown) => stall(err, null));
      },
      onError: (err) => {
        // The server named a reason (`not-a-member`, `bad-message`,
        // `already-subscribed`). Record it and do NOT advance the cursor: a
        // stream that errors has not caught up, and pretending otherwise would
        // silently skip whatever it did not send.
        lastStreamError = err;
      },
      onClose: () => {
        handle = null;
        if (stopped || stalled || streamEnded) return;
        setStatus('connecting');
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          void (async () => {
            if (stopped || stalled || streamEnded || workspaceId === null) return;
            subscribe(await replica.getCursor(workspaceId));
          })();
        }, reconnectDelayMs);
      },
    });
  }

  /**
   * Whether `start` may call the bootstrap door.
   *
   * THE PLAN'S GUARD IS `cursor === 0 && getMe() === null`, AND WHAT IS WRONG
   * WITH IT IS NOT WHAT IT LOOKS LIKE — which is why this is a named function
   * with a docblock rather than an inline condition, and why both directions
   * below are stated as measurements rather than as reasoning.
   *
   * **`me` is written once and never cleared.** `loadBootstrap` upserts it
   * (`replica.ts:525`) and the only `DELETE FROM meta` in the file is the
   * cursor row (`replica.ts:683`), inside `revokeScope`. So `me === null` is
   * true exactly once in a replica's life: before its first bootstrap.
   *
   * - **It is safe against 12.154, but by accident rather than by asking.**
   *   `me` is not a fact about the baseline; it is a fact about whether a
   *   bootstrap has ever happened. Dropping it — asking `cursor === 0` alone,
   *   which is the repair the OTHER direction below invites — re-bootstraps a
   *   replica that folded a streamed ticket while its cursor was still 0,
   *   because a bootstrap carrying `streamSeq: 0` leaves the cursor at 0 until
   *   the first `caught-up`. Measured: that mutation is red on 12.165 alone
   *   (`Tests 1 failed | 13 passed (14)`).
   * - **It refuses to bootstrap when it must.** `revokeScope` on a
   *   workspace-wide instruction deletes the tickets, the definitions and
   *   `meta cursor:<workspaceId>` — but NOT `me`. So the replica lands on
   *   `cursor === 0` with a non-null `me`, the plan's guard skips the
   *   bootstrap, and the stream resumes at 0 into a store with no `workflows`
   *   and no `ticket_types`, where 12.155's workspace-wide half says the first
   *   `ticket.created` throws `unknown ticket type` — a wedge on the first
   *   frame. `stream-frames.ts` prescribes the opposite in words: after a
   *   revocation "the correct client move afterwards is a fresh bootstrap
   *   rather than a resume". Measured: the plan's guard verbatim is red on
   *   12.166 alone (`Tests 1 failed | 13 passed (14)`).
   *
   * So the question asked here is the one the hazard is actually about: **is
   * there a local baseline for a stale server snapshot to lower?**
   * `listTickets` answers it — snapshots exist only for tickets, and the
   * revocation deletes both together. Where the answer is unclear the engine
   * errs toward NOT bootstrapping, because re-delivery from a low cursor is the
   * failure mode the protocol is built to absorb (duplicates are no-ops by
   * envelope id) while a lowered baseline is the one it is not.
   *
   * WHAT THIS DOES NOT CLAIM: that 12.154 is fixed. It is not, and the guard
   * measured and rejected there is deliberately not re-applied. This closes the
   * only production path that reaches it; the hazard stands one layer down for
   * any future caller that re-bootstraps by another route.
   */
  async function needsBootstrap(ws: string): Promise<boolean> {
    if ((await replica.getCursor(ws)) !== 0) return false;
    if ((await replica.getMe()) === null) return true;
    return (await replica.listTickets(ws)).length === 0;
  }

  const engine: SyncEngine = {
    async start(ws) {
      workspaceId = ws;
      stopped = false;
      stalled = false;
      streamEnded = false;
      // Both belong to a subscription attempt, not to the device: a caller that
      // deliberately restarts is asking for a fresh answer, and leaving the old
      // one standing would make `lastError()` describe a stream that no longer
      // exists.
      applyFailure = null;
      lastStreamError = null;
      setStatus('connecting');
      if (await needsBootstrap(ws)) {
        const body = await transport.bootstrap(ws);
        await replica.loadBootstrap(body);
      }
      subscribe(await replica.getCursor(ws));
    },

    stop() {
      stopped = true;
      closeStream();
    },

    async flush() {
      if (flushing !== null) return flushing; // one drain at a time, so order holds
      flushing = (async () => {
        try {
          let previousHead: string | null = null;
          for (;;) {
            const batch = await outbox.nextBatch();
            if (batch.length === 0) return;
            const ids = batch.map((b) => b.eventId);
            // A batch whose head did not move means the previous pass left every
            // row queued and due — flushing again would spin. Recording a
            // failure pushes them out by `backoffMs` and ends the drain.
            if (ids[0] === previousHead) {
              await outbox.recordFailure(ids, 'flush made no progress on this batch');
              return;
            }
            previousHead = ids[0] ?? null;

            let results: SyncEventResult[];
            try {
              results = await transport.sync(batch.map((b) => b.envelope));
            } catch (err) {
              // TRANSIENT: `recordFailure` bumps `attempts`, pushes
              // `next_attempt_at` out by `backoffMs` and leaves the rows QUEUED.
              // The claim is not lost and is not `failed` — the server never
              // answered, so nothing has been judged.
              await outbox.recordFailure(ids, messageOf(err));
              return;
            }

            // `sync-routes.ts` states the answer is index-aligned with the
            // request array, so index is the contract — but every result except
            // `invalid` also carries its `eventId`, and a disagreement between
            // the two means applying one claim's verdict to another claim.
            //
            // THE CHECK RUNS OVER THE WHOLE BATCH BEFORE ANYTHING IS APPLIED,
            // and that ordering is the substance rather than tidiness. A
            // results array shifted by one disagrees at SOME positions and, at
            // the positions carrying an `invalid` with `eventId: null`, at
            // none — so a per-position check that applied as it went would file
            // an unrelated verdict against those rows before reaching the
            // position that proves the array is shifted. One suspicious entry
            // condemns the array, the batch is recorded as a transient failure,
            // and every row stays queued.
            //
            // THE RESIDUAL, STATED RATHER THAN GUARDED: an array in which EVERY
            // member is `invalid` with `eventId: null` carries no id
            // information at all, so index alignment is the only contract there
            // is and this check cannot see a shift. `invalid` with a null
            // `eventId` means the server could not even read an id off the
            // submission, so a batch of nothing but those is a batch the device
            // sent garbage for — and the verdicts are identical anyway.
            if (results.length !== batch.length) {
              await outbox.recordFailure(ids, `sync answered ${results.length} results for ${batch.length} events`);
              return;
            }
            const misaligned = batch
              .filter((item, i) => {
                const result = results[i]!;
                return result.eventId !== null && result.eventId !== item.eventId;
              })
              .map((item) => item.eventId);
            if (misaligned.length > 0) {
              await outbox.recordFailure(
                ids,
                `sync results were not index-aligned with the batch (${misaligned.length} of ${batch.length} disagreed)`,
              );
              return;
            }
            // THE THIRD DOOR INTO `applyServerItem`, AND IT WAS THE OPEN ONE.
            //
            // `applyResult` on a `committed` verdict folds the envelope through
            // `replica.applyServerItem` (`outbox.ts`), which throws per-arrival
            // by the same 12.125/12.155 contract the stream door lives under.
            // This engine's stall design was written for `onItem` and
            // `onCaughtUp` and called that "both doors of the pair"; the flush
            // loop is a third caller of the same throwing function and it had
            // no catch at all. MEASURED before the fix, on the sequence 12.170
            // now runs: `flush()` REJECTED, `status()` stayed `catching-up`,
            // `lastApplyFailure()` stayed `null` — a shell could see nothing —
            // and because `recordFailure` never ran, `next_attempt_at` was
            // never pushed out, so the very next `flush()` re-sent the
            // IDENTICAL batch. That is verbatim the failure this module's
            // docblock says the engine exists to prevent.
            //
            // The two moves are ordered, and the order is the substance:
            //
            // 1. `recordFailure(ids.slice(i))` — rows `0..i-1` were judged and
            //    their outbox rows are gone; the row at `i` still stands,
            //    because `applyServerItem` threw before `applyResult` reached
            //    its own `DELETE`; rows `i+1..n` were never judged. Failing the
            //    whole unjudged tail is what applies backoff, and backoff is
            //    what makes the resubmit loop impossible rather than unlikely.
            //    (`recordFailure` skips ids with no row, so a raced delete is
            //    absorbed rather than throwing here.)
            // 2. `stall(err, null)` — the flush door then reaches the same
            //    visible terminal state the stream door does. Before this,
            //    identical input produced a stall on one path and a silent
            //    no-backoff resubmit on the other, because `onCaughtUp` reaches
            //    this same code through its own `await engine.flush()`.
            //
            // `item` is `null` rather than the folded envelope: the `LedgerEvent`
            // is built inside `applyResult` from the row plus the verdict, and
            // rebuilding it here to decorate a failure would be a second
            // construction of the same value — one more door of a pair to keep
            // in step, which is the shape this file keeps being bitten by.
            for (let i = 0; i < batch.length; i += 1) {
              try {
                await outbox.applyResult(batch[i]!.eventId, results[i]!);
              } catch (err) {
                await outbox.recordFailure(ids.slice(i), messageOf(err));
                stall(err, null);
                return;
              }
            }
          }
        } finally {
          flushing = null;
        }
      })();
      return flushing;
    },

    status: () => currentStatus,
    lastError: () => lastStreamError,
    lastApplyFailure: () => applyFailure,

    async settled() {
      // The chain grows while it is awaited — an item's link can enqueue a
      // flush — so wait until it stops moving rather than once.
      let seen: Promise<unknown> | null = null;
      while (seen !== applyChain) {
        seen = applyChain;
        await applyChain;
      }
      if (flushing !== null) await flushing;
    },

    onStatus(cb) {
      statusListeners.add(cb);
      return () => {
        statusListeners.delete(cb);
      };
    },

    onItem(cb) {
      itemListeners.add(cb);
      return () => {
        itemListeners.delete(cb);
      };
    },
  };
  return engine;
}
