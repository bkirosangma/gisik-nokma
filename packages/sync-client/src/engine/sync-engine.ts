import type { LedgerEvent, SubmittedEvent } from '@gisik-nokma/domain';
import type { BootstrapResponse, Replica, TicketBootstrap } from '../replica/replica.js';
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

/**
 * One id this device presented that it may no longer hold.
 *
 * The `{ kind: 'restricted', id }` register the product already uses for "this
 * is not yours and nothing further travels" (`ParentRef` at the read door). It
 * asserts LESS here than it does there: at the read door the arm means the
 * parent exists, and on this door it means only that the answer to `canSee` was
 * no — the server never consults existence, so a fabricated id comes back
 * identical to a genuine loss. That is deliberate and is the reason the door is
 * safe; `apps/server/src/sync/reconcile-route.ts` carries the argument.
 */
export type ReconcileRestriction = { kind: 'restricted'; id: string };

export type ReconcileAnswer = {
  workspaceId: string;
  restricted: ReconcileRestriction[];
  /**
   * The same answer for the NOTE ids presented (notes series, Plan 2 of 6).
   * REQUIRED, not optional: the server always sends it (`reconcile-route.ts`),
   * and this series' signature failure is a mocked contract that excuses the
   * server from existing — a fake that omits the field should stop compiling
   * rather than quietly narrow what the engine tests.
   */
  restrictedNotes: ReconcileRestriction[];
};

export type SyncTransport = {
  bootstrap(workspaceId: string): Promise<BootstrapResponse>;
  /** `POST /v1/sync`. The server answers index-aligned with the request array. */
  sync(events: SubmittedEvent[]): Promise<SyncEventResult[]>;
  openStream(workspaceId: string, afterSeq: number, handlers: StreamHandlers): StreamHandle;
  /**
   * `POST /v1/sync/reconcile` — closure 5's NARROW half (ruling P37).
   *
   * The client names the ids it holds; the server answers ONLY about those.
   * The direction is the whole design: a server-initiated purge would name an
   * entity to a device that may never have held it, which is the disclosure
   * that cost the per-event purge walk its life (cases 6.100, 6.101, and P23's
   * disposition, not reopened). Here the device's own holding is the
   * relationship, so nothing in the answer is news to its recipient.
   *
   * `heldIds` is bounded by the server at 1..100 (`MAX_BATCH_SIZE`,
   * `apps/server/src/routes/events.ts`); `SyncEngine.reconcile` chunks to it.
   *
   * `heldNoteIds` is the NOTE arm of the same door (Plan 2 of 6) — the ids this
   * device holds, answered by `canReadNoteById` rather than `canSee`, because a
   * note has no `proj_visibility` row and a shared predicate would restrict
   * every note for every caller. It is OPTIONAL on the wire (the server declares
   * it outside `required`, so an old client's body still validates, case 18.072)
   * and REQUIRED here, because this engine always sends it.
   */
  reconcile(workspaceId: string, heldIds: string[], heldNoteIds?: string[]): Promise<ReconcileAnswer>;
  /**
   * `GET /v1/sync/bootstrap/ticket` — closure 5b(d)'s pull door, ruling P37.1.
   *
   * One ticket's snapshot, tail and the definitions needed to fold it. The
   * server answers 404 identically for a ticket the caller may not see and one
   * that never existed; an implementation MUST surface that as a rejection like
   * any other failure rather than as `null`, because the two are the same
   * answer here and a caller that could tell them apart would have the
   * existence oracle this whole shape refuses.
   *
   * It is the fifth method on this type. The fourth (`reconcile`) needed an
   * enumeration ruling because the interface has implementors a grep cannot
   * find — the compiler is the enumerator, and it located five last time.
   */
  bootstrapTicket(workspaceId: string, ticketId: string): Promise<TicketBootstrap>;
  /**
   * `GET /v1/notes/:noteId/events` — the note pull (notes series, Plan 2 of 6,
   * spec §5.1).
   *
   * ## Why the payback is a bare event list and not a `BootstrapTicket` twin
   *
   * A ticket's pull carries a snapshot because tickets ARE snapshotted. Notes
   * are not (spec §5.3), so the note's whole history is its events and there is
   * nothing else to carry. The route is the READ door's
   * (`routes/notes.ts`), whose dialect is the row-shaped `LedgerEventView`; an
   * implementor is responsible for handing the engine ENVELOPES, and
   * `http-transport.ts` owns that conversion at its own edge.
   *
   * 404 means the same thing it means for tickets, and MUST surface as
   * `NotePullNotFound` rather than as `null` — the route answers 404
   * identically for a note the caller may not see and one that never existed,
   * so a caller able to tell them apart would have the existence oracle this
   * shape exists to deny.
   *
   * It is the sixth method on this type, and the fourth to need the
   * enumeration ruling: the interface has implementors a grep cannot find, so
   * the compiler is the enumerator.
   */
  bootstrapNote(workspaceId: string, noteId: string): Promise<{ events: LedgerEvent[] }>;
};

export type SyncStatus = 'offline' | 'connecting' | 'catching-up' | 'live';

/**
 * The per-ticket pull door answered "nothing travels" — ruling P37.3.
 *
 * A TYPE rather than a status code or a message match, because every
 * `SyncTransport` implementor has to be able to raise it and only one of them
 * speaks HTTP. The rig raises it from its own `canSee` refusal; the HTTP
 * transport raises it on a 404.
 *
 * **What it does NOT mean is the point.** The route answers 404 identically for
 * a ticket the caller may not see and one that never existed — deliberately, so
 * that presence-versus-absence is not an oracle — so this carries no
 * information about which. That is exactly why the drop it triggers is keyed to
 * the NOTICE that issued the pull rather than to this error: see
 * `Replica.dropPendingPullIfUnchanged`.
 */
export class TicketPullNotFound extends Error {
  readonly ticketId: string;
  constructor(ticketId: string) {
    super(`bootstrapTicket: nothing travels for ${ticketId}`);
    this.name = 'TicketPullNotFound';
    this.ticketId = ticketId;
  }
}

/**
 * The same answer for a note pull (notes series, Plan 2 of 6). Every word of
 * `TicketPullNotFound`'s docblock applies — a TYPE rather than a status code,
 * no information about which of the two 404 cases this is, and a drop keyed to
 * the NOTICE rather than to the error.
 *
 * A SEPARATE CLASS rather than a shared one with a `kind` field, because the
 * two are caught in the same loop and a shared type would have to be narrowed
 * before it could clear the right pending set — and the set is what the
 * discriminator would be used for, which is exactly what the catch clause below
 * already knows from the loop it is in.
 */
export class NotePullNotFound extends Error {
  readonly noteId: string;
  constructor(noteId: string) {
    super(`bootstrapNote: nothing travels for ${noteId}`);
    this.name = 'NotePullNotFound';
    this.noteId = noteId;
  }
}

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
   * What an abandoned per-ticket pull said when it finally answered, or null.
   *
   * A pull the timeout gave up on is not cancelled — it is still in flight, and
   * it may still fail. That failure is observed rather than left to become an
   * unhandled rejection, and reported here rather than discarded.
   */
  lastAbandonedPull(): { ticketId: string; message: string } | null;
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
  /**
   * A PULL landed — its events are folded and the entity's row is current.
   * Returns the unsubscribe. See `notifyPullApplied` for the whole argument.
   *
   * Separate from `onItem` because it answers a different question: `onItem`
   * reports what the STREAM delivered, and a pull happens after the stream has
   * gone quiet, so nothing on that channel announces it.
   */
  onPullApplied(cb: (info: { kind: 'ticket' | 'note'; id: string }) => void): () => void;
  /**
   * Ask the server which of the tickets this replica holds are no longer this
   * user's, and delete those — closure 5's NARROW half, case 6.104's residual.
   *
   * Resolves to what was asked and what went, so a caller can tell "nothing was
   * stale" from "nothing was asked". Those are different facts and a bare void
   * return would hide the second inside the first.
   *
   * **WIRED, since closure 5b — this docblock said the opposite for one commit
   * and the branch review caught it.** Two callers run it automatically:
   * `onCaughtUp` (case 12.288), bounded by `RECONCILE_MIN_INTERVAL_MS`; and the
   * `reach-granted` handler, over the ids a notice NAMED (closure 5c's minimal
   * form). It remains public for a shell's pull-to-refresh, and the
   * single-flight latch is what makes that overlap safe.
   *
   * **The automatic one is once per RECONNECT, not once per catch-up**, because
   * `hub.ts` sends `caught-up` once per subscription (`caughtUpSent`). That is
   * why the notice handler reconciles the named ids itself rather than trusting
   * the schedule — on a stable socket the schedule never fires again.
   */
  reconcile(workspaceId: string): Promise<{ presented: number; purged: string[] }>;
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
/**
 * The server's `heldIds` bound, restated.
 *
 * `MAX_BATCH_SIZE = 100` lives in `apps/server/src/routes/events.ts` and this
 * package cannot import from the server, so the number is duplicated — the same
 * duplication, with the same citation, that `app-core`'s
 * `online-data-source.ts` already carries for the same constant. **Nothing
 * checks that the two agree.** Raising the server's bound without raising this
 * one only wastes requests; LOWERING the server's bound without lowering this
 * one makes every reconcile fail its schema, loudly, at the first call. The
 * loud direction is the dangerous one being loud, which is why this is
 * acceptable rather than merely tolerated.
 */
const RECONCILE_CHUNK_SIZE = 100;

/**
 * How long one per-ticket pull may take before it is abandoned.
 *
 * **This is not a polish item, and closure 5b(d) does not work without it.**
 * `net/http-transport.ts` calls bare `fetch` with no `AbortSignal` anywhere in
 * the file, and this engine's `applyChain` is strictly serial. A pull that
 * never settles therefore never rejects and never resolves: the chain simply
 * stops. Status stays `live`, `stalled` stays false, `settled()` never
 * resolves, `lastApplyFailure()` stays null, and nothing anywhere surfaces it.
 * Without a timeout, (d) would trade today's LOUD terminal brick for a silent
 * one, which is the worse of the two by this repo's stated preference for a
 * check whose failure is loud.
 *
 * Enforced HERE rather than in the transport deliberately: the transport is an
 * interface with other implementors (the dual-client rig's, app-core's), and a
 * bound that lives in one implementation is a bound the others do not have.
 * `Promise.race` against a timer is implementation-independent — it bounds the
 * engine's wait, which is the thing that must be bounded, rather than the
 * request, which only one implementor even makes.
 *
 * *What it does NOT do: cancel the underlying request.* Nothing here can — that
 * needs the `AbortSignal` the transport does not take. The abandoned fetch runs
 * to completion and its result is dropped. *Owner: unassigned; threading an
 * `AbortSignal` through `SyncTransport` closes it and is a signature change to
 * a type with five implementors, which is why it is recorded rather than
 * bundled into this change set.*
 */
const PULL_TIMEOUT_MS = 15_000;

/**
 * The least time between two automatic reconciles of one workspace.
 *
 * Case 12.288 asked for a schedule and named the cost: one request per 100
 * tickets held. The schedule chosen is *on catch-up completion* — which is once
 * per SUBSCRIPTION, not once per catch-up, because `hub.ts` gates the frame on
 * `caughtUpSent`. **So this is a per-RECONNECT schedule**, and saying "every
 * catch-up" overstated it for one commit until the branch review measured the
 * latch. It is why the `reach-granted` handler reconciles its named ids itself
 * rather than trusting this to fire. The
 * moment a device's cursor is current is exactly the moment its HOLDINGS may be
 * stale, because a narrowing sends the losing device nothing at all
 * (`reconcile-route.ts` on case 6.104). That is also why the tempting cheaper
 * trigger is wrong: **gating on "the catch-up delivered something" would skip
 * the zero-frame catch-up, which is precisely the case reconcile exists for.**
 *
 * So the bound is time, not activity. Measured reason it needs one:
 * `reconnectDelayMs` is a FIXED 2000 with no growth and no jitter, and the hub
 * sends one `caught-up` per subscription unconditionally — so a flapping socket
 * is a reconcile every two seconds, forever, at `ceil(held / 100)` requests
 * each. A device holding a thousand tickets would issue ten requests every two
 * seconds while the network wobbles.
 *
 * In-memory rather than stored, and that is correct rather than a shortcut:
 * this engine takes no storage dependency, and a process restart SHOULD
 * reconcile promptly — a device that was off is a device whose holdings had the
 * longest time to go stale.
 */
const RECONCILE_MIN_INTERVAL_MS = 60_000;

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
  /**
   * What an ABANDONED per-ticket pull said when it finally answered, or null.
   *
   * `withTimeout` races the pull against a timer, and when the timer wins the
   * pull is abandoned in flight — it is not cancelled, and it may still fail.
   *
   * That later failure was INVISIBLE, which is what this fixes. It was never a
   * crash: `Promise.race` subscribes to every input, so the abandoned loser
   * always has a handler and its rejection is never "unhandled" (measured
   * directly — a standalone probe reproduces the shape and no
   * `unhandledRejection` fires). The engine was therefore safe and simply
   * silent, and the silence is the defect worth closing: "we stopped waiting"
   * and "it later failed, and here is why" are different facts, and the second
   * is the one that explains a ticket that keeps coming back owed.
   */
  let abandonedPull: { ticketId: string; message: string } | null = null;
  /** Single-flight latch for `reconcile`, modelled on `flushing` — see `reconcile`. */
  let reconciling: Promise<{ presented: number; purged: string[] }> | null = null;
  /** When the last automatic reconcile ran. See `RECONCILE_MIN_INTERVAL_MS`. */
  let lastReconcileAt = 0;
  const statusListeners = new Set<(s: SyncStatus) => void>();
  const itemListeners = new Set<(item: SyncItem) => void>();
  const pullAppliedListeners = new Set<(info: { kind: 'ticket' | 'note'; id: string }) => void>();

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

  /**
   * Fetch every ticket this device has been told it may now read and does not
   * hold. Closure 5b(d), ruling P37.1.
   *
   * ## Why a failure here is SWALLOWED, when every other failure in this file stalls
   *
   * `stall()` is a one-way latch: `stalled` is set in exactly one place and
   * cleared in exactly one other, `start()`. Mobile never calls `start()` again
   * and the shell renders the state as plain "Offline", so a stall is terminal
   * until the process restarts. That is the RIGHT answer for a frame this
   * replica could not fold — the alternative is a permanent silent skip. It is
   * the WRONG answer for a pull, because a pull crosses the network on its own
   * and a five-second wobble would brick the device where, before closure 5b,
   * the same wobble merely lost a backfill.
   *
   * Swallowing alone is not enough either: it advances the cursor past the
   * trigger with the ids never fetched, and `needsBootstrap` refuses to
   * re-bootstrap over a local baseline, so they would be lost until a manual
   * reinstall. So the id STAYS in the replica's durable pending set and the
   * next catch-up tries again. Three outcomes, one of them acceptable, and this
   * is the one.
   *
   * ## The ORDER is the property, and it is why this is awaited inside `applyOne`
   *
   * `onItem` and `onCaughtUp` are queued onto ONE promise chain, and the
   * caught-up link re-reads its guards INSIDE the link rather than at enqueue
   * time. So a drain awaited here completes before any `setCursor` behind it,
   * and a drain that leaves work owed is a drain whose ids are still pending
   * when the cursor moves — which is safe precisely because the pending set is
   * durable. Putting this in an `onItem` LISTENER instead would look identical
   * and be wrong: listeners are called synchronously, their return values are
   * not awaited and their throws are swallowed, so the cursor would advance
   * while the pull was still in flight.
   */
  async function drainPendingPulls(ws: string): Promise<void> {
    if (stopped || stalled || streamEnded) return;
    for (const { id: ticketId, headSeq } of await replica.listPendingPulls(ws)) {
      if (stopped || stalled || streamEnded) return;
      try {
        // Bounded HERE and not in the transport — see `PULL_TIMEOUT_MS`. A
        // transport that never settles would otherwise stop this chain in
        // total silence, which is the one failure mode worse than the stall
        // this function exists to avoid.
        const payload = await withTimeout(transport.bootstrapTicket(ws, ticketId), ticketId);
        await replica.loadTicketBootstrap(payload);
        await replica.clearPendingPull(ws, ticketId);
        notifyPullApplied({ kind: 'ticket', id: ticketId });
      } catch (err) {
        // RULING P37.3. "Nothing travels" drops the entry — but only if no
        // newer notice has re-named it since this pull was issued, which is
        // what `headSeq` keys. Without this, a revoked project left one request
        // per catch-up for ever; with an UNCONDITIONAL drop, a re-widening
        // racing the pull would be discarded. The device still cannot tell "may
        // not see" from "never existed" and does not need to: the next notice
        // is the recovery path, not the status code.
        if (err instanceof TicketPullNotFound) {
          await replica.dropPendingPullIfUnchanged(ws, ticketId, headSeq);
        }
        // Every OTHER failure is deliberately silent and deliberately does NOT
        // clear the id: a network wobble is not an answer, and the next
        // catch-up retries.
      }
    }
    // The note half of the same loop, over its own durable set and its own
    // door. Written as a SECOND loop rather than one loop with a branch,
    // because the two differ in more than the call: a note pull loads events
    // rather than a `TicketBootstrap`, and the two pending sets are separate
    // keys (`Replica.listPendingPulls`'s `kind`).
    for (const { id: noteId, headSeq } of await replica.listPendingPulls(ws, 'note')) {
      if (stopped || stalled || streamEnded) return;
      try {
        const payload = await withTimeout(transport.bootstrapNote(ws, noteId), noteId);
        await replica.loadNoteEvents(payload.events);
        await replica.clearPendingPull(ws, noteId, 'note');
        notifyPullApplied({ kind: 'note', id: noteId });
      } catch (err) {
        if (err instanceof NotePullNotFound) {
          await replica.dropPendingPullIfUnchanged(ws, noteId, headSeq, 'note');
        }
      }
    }
  }

  /**
   * A pull landed: its events are folded and the entity's row is current.
   *
   * ## Why this exists, and what it is NOT
   *
   * A localStorage view that is open when a notice-driven pull lands has no way
   * to know its data changed — the pull happens on `onCaughtUp`, after the
   * stream has gone quiet, so no `event` frame announces it and no `caught-up`
   * follows. Plan 2's exploration found that hole at
   * `replica-data-source.ts`'s `subscribe`: it forwards stream frames and
   * nothing else, so a note that arrived by PULL never refreshed the screen
   * showing it.
   *
   * This is the engine's half of the repair: a listener the data source turns
   * into a `refresh` frame (Plan 2 Task 7). It fires AFTER `loadNoteEvents`
   * resolves, so a listener that re-reads the replica synchronously sees the
   * new row — firing it before the load would announce a change that had not
   * happened yet, which is worse than not announcing it.
   *
   * Tickets fire it too. They had the same hole and nobody had looked; a
   * listener that only heard about notes would be a second, narrower rule
   * waiting to be discovered.
   */
  function notifyPullApplied(info: { kind: 'ticket' | 'note'; id: string }): void {
    for (const cb of pullAppliedListeners) {
      // A listener is a shell's callback and its throw is its own business:
      // one bad subscriber must not abort a pull that has already landed, nor
      // stop the other listeners being told.
      try {
        cb(info);
      } catch {
        // swallowed deliberately — see above.
      }
    }
  }

  /** `Promise.race` with a timer, so an unsettling transport cannot stop the chain. */
  async function withTimeout<T>(work: Promise<T>, ticketId: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            // ATTACHED HERE, inside the timer, and deliberately not at the call
            // site. This is the only moment we know the pull was ABANDONED
            // rather than answered: a pull that rejects on its own loses the
            // race first, `finally` clears this timer, and this line never
            // runs — so a genuine `TicketPullNotFound` is still handled by the
            // caller and is never mis-recorded as an abandonment.
            //
            // `Promise.race` does not CANCEL the loser, so the pull is still
            // in flight and may still fail. It is not left unhandled — `race`
            // subscribes to both inputs — so this is not a crash fix; the
            // failure was simply invisible, and a pull that quietly failed
            // after being abandoned is the thing that explains a ticket which
            // keeps coming back owed. Observing is not swallowing: the reason
            // is kept for `lastAbandonedPull()` rather than discarded.
            void work.catch((cause: unknown) => {
              abandonedPull = {
                ticketId,
                message: cause instanceof Error ? cause.message : String(cause),
              };
            });
            reject(new Error(`sync: a per-ticket pull exceeded ${PULL_TIMEOUT_MS}ms and was abandoned`));
          }, PULL_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * `true` when a fold failure was answered by owing a pull instead of stalling.
   *
   * Deliberately narrow. It answers `false` — so the caller rethrows and the
   * engine stalls — for an instruction, for a non-ticket entity, and for a
   * ticket this device HOLDS. Only the one case it can actually repair is
   * swallowed.
   *
   * `getTicket` answers `null` for a ticket held solely as unfolded events with
   * no `tickets` row, so such a ticket is treated as not held and is pulled.
   * That is over-delivery, and over-delivery is the safe side here:
   * `loadTicketBootstrap` is idempotent by event id.
   */
  async function recoverByPull(item: SyncItem): Promise<boolean> {
    if (isSyncInstruction(item)) return false;
    if (item.entity.kind !== 'ticket') return false;
    if ((await replica.getTicket(item.entity.id)) !== null) return false;
    // Keyed by the failing event's own `workspaceSeq` — the server's position
    // for this ticket as far as this device can know it. That is what a later
    // notice must exceed to supersede this entry (P37.3).
    await replica.addPendingPulls(item.workspaceId, [{ id: item.entity.id, headSeq: item.workspaceSeq }]);
    // Drain immediately rather than waiting for the next catch-up: `onCaughtUp`
    // fires once per SUBSCRIPTION (`hub.ts`'s `caughtUpSent`), so "the next
    // catch-up" can be the next reconnect, which may be hours away.
    await drainPendingPulls(item.workspaceId);
    return true;
  }

  /**
   * Apply a frame, and — for a ticket-entity event this device does NOT hold —
   * fetch the ticket instead of stalling on it.
   *
   * ## This is "bootstrap-before-apply on any event for an entity not held",
   * ## and until the branch review it was a CLAIM rather than a rule
   *
   * `grant-backfill.ts` said the refold hazard closes by that rule. It did not.
   * `applyServerItem` refolds on ANY folding ticket event with no holdings
   * check; `refoldTicket` starts from `state === undefined` when there is no
   * snapshot; and `applyTicketEvent` throws *"… that was never created"*. The
   * only bootstrap-before-apply that existed was for ids a notice had named AND
   * whose pull had already succeeded — which is the narrow case, not the rule.
   *
   * **Two sequences reached the terminal stall through the gap, and the second
   * had no recovery at all:**
   *
   * 1. A pull fails transiently, its id stays owed, and the TRIGGER for that
   *    same ticket arrives one link later. `ticket.reparented` is folded, so the
   *    refold throws and `stall()` latches — the exact outcome the swallow at
   *    `drainPendingPulls` was written to prevent, produced one link past where
   *    that docblock was looking. The claim was true of the pull's own rejection
   *    and false of the chain behind it.
   * 2. `GRANT_BACKFILL_MAX_TICKETS` truncates a notice, so ticket 201 is never
   *    named; a later ORDINARY event on it — not a trigger, so no notice —
   *    throws the same way. `needsBootstrap` refuses to re-bootstrap over a
   *    local baseline and the next widening slices identically, so a restart
   *    does not clear it.
   *
   * ## What this does instead, and what it deliberately still refuses to swallow
   *
   * A fold failure for a ticket the replica DOES hold is a real fold bug and
   * still stalls, loudly, because a device that mis-folds state it holds must
   * not quietly diverge. A fold failure for a ticket it does NOT hold is not a
   * bug at all — it is the ordinary consequence of the ticket's history sitting
   * below this device's cursor — so the id is recorded as owed and the drain
   * fetches it. The ticket's own bootstrap payload carries the event that just
   * failed, so dropping the streamed copy loses nothing.
   *
   * That asymmetry is the whole design: **held-and-unfoldable is loud;
   * not-held-and-unfoldable is a pull.**
   */
  async function applyOne(item: SyncItem): Promise<void> {
    if (stopped || stalled || streamEnded) return;
    try {
      await replica.applyServerItem(item);
    } catch (err) {
      if (!(await recoverByPull(item))) throw err;
      return;
    }
    // A notice records what this device is owed; fetching it is this engine's
    // job, and it happens HERE — inside the chain, ahead of the cursor write
    // queued behind it — so the trigger event that follows folds against a
    // ticket that is already held. That ordering is the whole reason the
    // notice is yielded before its trigger on the server side.
    if (isSyncInstruction(item) && item.kind === 'reach-granted') {
      // The notice's own `headSeq` per ticket decides what is pulled — see
      // `replica.ts`'s `reach-granted` arm. An earlier round tried reconciling
      // the NAMED ids here instead (closure 5c's first form) and it was a
      // structural no-op: a notice only names ids the viewer can see NOW, and
      // reconcile only answers about ids they CANNOT, so the intersection is
      // empty by construction. Deleted rather than left with a docblock —
      // ruling P37.2(c), because dead code with an explanation is a false
      // sentence waiting to be reasoned from. Case 12.316 holds the
      // measurement.
      await drainPendingPulls(item.workspaceId);
    }
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
            const ws = workspaceId;
            // BEFORE the cursor: anything still owed from a pull that failed
            // earlier is retried while this link still holds the chain. It is
            // safe for it to fail again — the ids stay pending and the next
            // catch-up tries once more.
            await drainPendingPulls(ws);
            await replica.setCursor(ws, seq);
            setStatus('live');
            await engine.flush();
            // AND the schedule case 12.288 asked for. The moment this device's
            // cursor is current is the moment its HOLDINGS may be stale: a
            // narrowing sends the losing device nothing at all, so there is no
            // frame to notice and no other trigger available.
            //
            // Wrapped in its own try/catch, INSIDE the link and ahead of the
            // link's own `.catch(stall)`. A 500 from `/v1/sync/reconcile` must
            // not brick this client: reconcile is idempotent (every action it
            // takes is a delete) and a missed one is retried at the next
            // catch-up, so there is nothing a stall would protect.
            try {
              if (Date.now() - lastReconcileAt >= RECONCILE_MIN_INTERVAL_MS) {
                lastReconcileAt = Date.now();
                await engine.reconcile(ws);
              }
            } catch {
              // See above. `lastReconcileAt` is deliberately stamped BEFORE the
              // attempt rather than after it: a reconcile that fails fast would
              // otherwise be retried at full rate on a flapping socket, which
              // is the storm the interval exists to prevent.
            }
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
    lastAbandonedPull: () => abandonedPull,

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

    onPullApplied(cb) {
      pullAppliedListeners.add(cb);
      return () => {
        pullAppliedListeners.delete(cb);
      };
    },

    async reconcile(ws) {
      // SINGLE-FLIGHT, modelled verbatim on `flush`'s `flushing` latch and for
      // the same reason: this method is public, so a shell's pull-to-refresh can
      // overlap the automatic call in `onCaughtUp`. Two concurrent runs would
      // present the same ids twice and race each other's purges. Handing back
      // the in-flight promise means no caller is refused and none is duplicated.
      if (reconciling !== null) return reconciling;
      reconciling = (async () => {
        try {
          return await runReconcile(ws);
        } finally {
          reconciling = null;
        }
      })();
      return reconciling;
    },
  };

  async function runReconcile(ws: string): Promise<{ presented: number; purged: string[] }> {
    {
      const held = (await replica.listTickets(ws)).map((t) => t.ticketId);
      // The note ids, from `listNoteIds` and NOT `listNotes`: a device must
      // offer up every id it holds, and it still holds the DELETED ones. Asking
      // about only the live ones would leave a deleted note this user can no
      // longer read on the device for ever — which is precisely the residual
      // this door exists to close, wearing the undo list's clothes.
      const heldNotes = await replica.listNoteIds(ws);
      const purged: string[] = [];
      // ONE LOOP PER ARM, chunked independently. A single request carrying both
      // arms is legal on the wire and was the first shape here, but the two sets
      // have different sizes and one `RECONCILE_CHUNK_SIZE` budget cannot be
      // shared between them without a rule for which arm spends it — and that
      // rule is exactly the kind of quiet budget bug that leaves a note
      // un-reconciled when a device holds many tickets. Two loops cost at most
      // one extra round trip per catch-up.
      for (let i = 0; i < held.length; i += RECONCILE_CHUNK_SIZE) {
        const chunk = held.slice(i, i + RECONCILE_CHUNK_SIZE);
        const answer = await transport.reconcile(ws, chunk);
        for (const item of answer.restricted) {
          // THE CLIENT'S OWN HALF of "the answer contains only ids I presented".
          // The server cannot name anything else — its reply is built by walking
          // the request — but this device does not need to trust that to be safe,
          // and a purge is destructive and local. Without this line a wrong or
          // hostile answer deletes tickets this user still holds legitimately.
          // Case 12.287 hands the engine an answer naming an unpresented id and
          // requires that nothing extra goes.
          if (!chunk.includes(item.id)) continue;
          await replica.purgeEntity(item.id);
          purged.push(item.id);
        }
      }
      for (let i = 0; i < heldNotes.length; i += RECONCILE_CHUNK_SIZE) {
        const chunk = heldNotes.slice(i, i + RECONCILE_CHUNK_SIZE);
        const answer = await transport.reconcile(ws, [], chunk);
        // The same guard on the note arm, for the same reason and against the
        // same case: `purgeEntity` is destructive and local, and it takes the
        // note's events and comments with it.
        for (const item of answer.restrictedNotes) {
          if (!chunk.includes(item.id)) continue;
          await replica.purgeEntity(item.id);
          purged.push(item.id);
        }
      }
      return { presented: held.length + heldNotes.length, purged };
    }
  }

  return engine;
}
