import type { LedgerEvent, ServerStreamFrame } from '@gisik-nokma/domain';
import { STREAM_CLOSE_CODES } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import {
  visibleEventsFor as defaultVisibleEvents,
  type SyncItem,
} from '../visibility/visible-events-for.js';

export type StreamSocket = {
  send(data: string): void;
  close(code: number, reason: string): void;
  /**
   * RECORDED, NOT USED. *Owner: Task 15 (the route).* Declared here and faked
   * in `test/helpers/stream-socket.ts`, and **called by nothing in the hub** —
   * every path that gives up on a peer goes through `close(code, reason)`, so
   * the connection is closed with a protocol code and the client can tell why.
   * The route owns the heartbeat, and a heartbeat that has timed out is the one
   * caller with a reason to drop a socket that is no longer answering rather
   * than negotiate with it. Named so Task 15 does not assume the hub already
   * does this.
   */
  terminate(): void;
  readonly bufferedAmount: number;
};

/**
 * The seam the unit tests script. Structurally `visibleEventsFor` — written as
 * a named type rather than `typeof visibleEventsFor` so the return position is
 * `AsyncIterable`, which a plain async generator satisfies without having to
 * reproduce `AsyncGenerator`'s three type arguments.
 */
export type VisibleEventsFn = (
  db: Queryable,
  userId: string,
  workspaceId: string,
  afterSeq: number,
) => AsyncIterable<SyncItem>;

export type StreamHubDeps = {
  /**
   * Handed to `visibleEvents` and never read here. The hub asks no question of
   * the database in its own voice — every decision about what a subscriber may
   * see is Plan 4's, taken per subscriber, per drain.
   */
  pool: Queryable;
  onEventCommitted(listener: (event: LedgerEvent) => void): () => void;
  /** Injectable for unit tests; production uses Plan 4's `visibleEventsFor`. */
  visibleEvents?: VisibleEventsFn;
  maxBufferedBytes?: number;
  onError?(error: unknown): void;
};

export type StreamHub = {
  subscribe(
    userId: string,
    socket: StreamSocket,
    workspaceId: string,
    afterSeq: number,
  ): Promise<'subscribed' | 'already-subscribed'>;
  dropSocket(socket: StreamSocket): void;
  /**
   * Resolves when every in-flight pump has finished.
   *
   * Not a test-only affordance, though it is what lets the tests be
   * deterministic instead of sleeping: a graceful shutdown wants the same
   * promise, and so does any caller that needs "the fan-out for this commit has
   * been attempted" to be a fact rather than a hope.
   */
  settled(): Promise<void>;
  /** What the hub is holding. An operational read, and the leak detector. */
  stats(): { sockets: number; subscriptions: number; workspaces: number };
  close(): void;
};

export const DEFAULT_MAX_BUFFERED_BYTES = 1_000_000;

type Subscription = {
  userId: string;
  workspaceId: string;
  socket: StreamSocket;
  /** The WORKSPACE cursor (`workspace_seq`), never the per-entity `seq`. */
  cursor: number;
  dirty: boolean;
  running: boolean;
  caughtUpSent: boolean;
  ended: boolean;
};

/**
 * The fan-out for `WS /v1/stream`.
 *
 * ## One pump per (socket, workspace); catch-up and live tail are ONE drain
 *
 * A subscription is a cursor and a socket. Both catching up and following the
 * tail are the same operation: drain `visibleEventsFor(pool, sub.userId,
 * sub.workspaceId, sub.cursor)` and advance the cursor past each envelope it
 * yields. `onEventCommitted` does no reading and no sending — it only marks the
 * subscriptions of the committed event's workspace dirty and wakes their pumps.
 *
 * Two consequences, and they are the reason the design is this shape:
 *
 * 1. **The visibility filter is per SUBSCRIBER, and there is exactly one of
 *    it.** Nothing here is broadcast to a workspace. A frame exists because
 *    Plan 4's filter yielded an item for *that* user on *that* drain, and this
 *    module contains no second opinion about who may see what — the defect
 *    Task 5 spent a whole review eliminating. A hub that re-derived visibility
 *    on the live path could disagree with the catch-up path, and the two paths
 *    here are the same code.
 * 2. **A commit landing mid-drain is never lost.** `subscribe` registers the
 *    subscription BEFORE the first drain, so a notification arriving during
 *    catch-up finds it, sets `dirty`, and the pump's do-while runs again.
 *
 * ## What the hub does NOT decide
 *
 * Membership. `subscribe` authorizes nobody: a caller with no role in the
 * workspace simply drains nothing, because `visibleEventsFor` resolves their
 * effective role and returns. That is deliberate — it means the hub cannot
 * disclose anything to a stranger even if the route above it forgets its check
 * — but it is only HALF of the answer. The route (Task 15) owns the
 * `not-a-member` error frame, because "you are not in this workspace" and "you
 * are in it and can see nothing yet" must not be answered by the same silence
 * at the door where the caller can tell them apart.
 *
 * ## Narrowing, and why `scope-revoked` is terminal
 *
 * Visibility can narrow while a subscription is open, and the hub honours it by
 * construction: every drain re-resolves the reader's role and re-asks `canSee`,
 * so a revocation that commits into the workspace both wakes the pump and
 * changes what the next drain yields. Plan 4 answers a narrowing with a
 * `PurgeInstruction` (one entity) or a `ScopeRevokedInstruction` (a whole
 * scope), and both pass through here one-to-one.
 *
 * `scope-revoked` additionally ENDS the subscription. It says "empty your
 * replica for this scope", and there is no coherent resume cursor on the far
 * side of that — the client's correct next move is a bootstrap, not more tail.
 * Ending it is also what bounds the instruction: `visibleEventsFor` yields it
 * to a null-role reader and yields them nothing else, so their cursor never
 * moves, and without a terminal rule an ex-member's abandoned socket would be
 * handed one `scope-revoked` per workspace commit forever — a full ledger
 * re-scan each time, and a running measure of how busy a workspace they were
 * put out of still is. The socket itself stays open; other workspaces
 * multiplexed on it are untouched.
 *
 * ## The slow-consumer bound
 *
 * Before each send, a socket whose `bufferedAmount` exceeds `maxBufferedBytes`
 * is closed with 1013 `slow-consumer`. The ledger is the durable buffer, so
 * this loses nothing the client cannot re-request from its cursor. Buffering
 * indefinitely would trade a bounded reconnect for an unbounded heap.
 */
export function createStreamHub(deps: StreamHubDeps): StreamHub {
  const visibleEvents: VisibleEventsFn = deps.visibleEvents ?? defaultVisibleEvents;
  const maxBuffered = deps.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
  // Maps, not objects: `workspaceId` reaches here from an actor-supplied
  // frame, and `__proto__` assigns through an accessor that creates no own key
  // while `toString` creates one that shadows. `subscribeFrameSchema` refuses
  // both at the door; this is the second defence, for callers that do not come
  // through that door.
  const bySocket = new Map<StreamSocket, Map<string, Subscription>>();
  const byWorkspace = new Map<string, Set<Subscription>>();
  const inFlight = new Set<Promise<void>>();

  function detach(sub: Subscription): void {
    sub.ended = true;
    const subs = byWorkspace.get(sub.workspaceId);
    if (subs !== undefined) {
      subs.delete(sub);
      // Emptied buckets are removed, not left standing: a hub that kept them
      // would accumulate one dead `Set` per workspace ever subscribed to, for
      // the life of the process.
      if (subs.size === 0) byWorkspace.delete(sub.workspaceId);
    }
    const socketSubs = bySocket.get(sub.socket);
    if (socketSubs !== undefined) {
      socketSubs.delete(sub.workspaceId);
      if (socketSubs.size === 0) bySocket.delete(sub.socket);
    }
  }

  function removeSocket(socket: StreamSocket): void {
    const socketSubs = bySocket.get(socket);
    if (socketSubs === undefined) return;
    for (const sub of [...socketSubs.values()]) detach(sub);
    bySocket.delete(socket);
  }

  function closeSocket(socket: StreamSocket, code: number, reason: string): void {
    removeSocket(socket);
    socket.close(code, reason);
  }

  /**
   * There is deliberately NO `if (sub.ended) return` here, and its absence is
   * load-bearing rather than an oversight.
   *
   * The hub once carried FOUR `sub.ended` guards — this one, the drain's, the
   * caught-up condition's, and the pump loop's — and mutation testing killed
   * none of them: each masked the others, so removing any one changed no
   * observable behaviour. A guard no test can reach is not defence in depth, it
   * is unmeasured code that a later reader trusts. Exactly two remain, on the
   * two paths that can actually send after a socket has gone — the drain's next
   * iteration, and the caught-up that would follow it — and each of those two
   * is killed on its own by the mid-drain disconnect case in `hub.test.ts`.
   */
  function send(sub: Subscription, frame: ServerStreamFrame): void {
    if (sub.socket.bufferedAmount > maxBuffered) {
      closeSocket(sub.socket, STREAM_CLOSE_CODES.slowConsumer, 'slow-consumer');
      return;
    }
    sub.socket.send(JSON.stringify(frame));
  }

  async function drain(sub: Subscription): Promise<void> {
    for await (const item of visibleEvents(deps.pool, sub.userId, sub.workspaceId, sub.cursor)) {
      if (sub.ended) return;
      if ('kind' in item) {
        // `entity.kind` is nested, so a top-level `kind` is a sound test for an
        // instruction — `visible-events-for.ts` states this discrimination rule
        // where `SyncItem` is defined, because the plan's own header documents
        // a two-way union over a three-member type.
        if (item.kind === 'purge') {
          send(sub, { type: 'purge', workspaceId: sub.workspaceId, entityId: item.entityId });
        } else {
          if (item.projectId !== undefined) {
            // Fail closed. The frame's `projectId` is `?: never` because no
            // emitter produces one; dropping the narrowing here would tell the
            // replica to empty a whole workspace for the loss of one project,
            // and inventing a wire field on the fly would ship a protocol
            // nobody agreed. Reachable only through an injected
            // `visibleEvents`, which is what makes the branch testable today.
            throw new Error(
              `stream: scope-revoked carried a projectId (${item.projectId}) and the frame has no field for it`,
            );
          }
          // `sub.workspaceId`, not `item.workspaceId`: the hub registered the
          // former and vouches for it, while the latter is whatever the
          // injectable filter seam yielded — and this module's header says it
          // holds no second opinion about anything the filter says. They
          // coincide today, which is exactly why the less trustworthy spelling
          // would survive unnoticed. The `purge` two lines above already reads
          // `sub.workspaceId`.
          send(sub, { type: 'scope-revoked', workspaceId: sub.workspaceId });
          // Terminal — see the header. Ends this workspace's subscription and
          // leaves the socket and its other subscriptions alone.
          detach(sub);
          return;
        }
      } else {
        send(sub, { type: 'event', envelope: item });
        // The WORKSPACE cursor. `item.seq` is the per-entity counter and
        // restarts at 1 for every new entity, so resuming by it silently skips
        // every new entity's early events (`sync/stream-seq.ts`).
        if (item.workspaceSeq > sub.cursor) sub.cursor = item.workspaceSeq;
      }
    }
  }

  async function pump(sub: Subscription): Promise<void> {
    if (sub.running) {
      sub.dirty = true;
      return;
    }
    sub.running = true;
    try {
      do {
        sub.dirty = false;
        await drain(sub);
        if (!sub.caughtUpSent && !sub.ended) {
          sub.caughtUpSent = true;
          // The cursor, which is the position of the last envelope YIELDED to
          // this subscriber — not the workspace high-water `readStreamSeq`
          // reports. They differ whenever the newest events are invisible to
          // this reader; see the residual recorded in the test file.
          send(sub, { type: 'caught-up', workspaceId: sub.workspaceId, seq: sub.cursor });
        }
        // `!sub.ended` is the plan's `!sub.closed` under this file's name for
        // the flag. Without it a commit that lands while a drain is suspended
        // leaves `dirty` set, and a drain that then ENDS the subscription
        // (`scope-revoked` detaches) still runs the loop once more: a whole
        // fresh `visibleEventsFor` — a full `workspace_seq > cursor` scan —
        // materialised and thrown away on a detached subscription. No frame
        // escapes; the drain's own `sub.ended` guard is its first statement.
        // It is wasted work, and the unit case below counts the drains.
      } while (sub.dirty && !sub.ended);
    } catch (error) {
      deps.onError?.(error);
      closeSocket(sub.socket, STREAM_CLOSE_CODES.internalError, 'stream-error');
    } finally {
      sub.running = false;
    }
  }

  function schedule(sub: Subscription): Promise<void> {
    // `pump` has already begun synchronously by the time this returns, so a
    // promise is in `inFlight` before control leaves the notification.
    const running: Promise<void> = pump(sub).finally(() => {
      inFlight.delete(running);
    });
    inFlight.add(running);
    return running;
  }

  const unsubscribe = deps.onEventCommitted((committed) => {
    const subs = byWorkspace.get(committed.workspaceId);
    if (subs === undefined) return;
    for (const sub of [...subs]) void schedule(sub);
  });

  return {
    async subscribe(userId, socket, workspaceId, afterSeq) {
      let socketSubs = bySocket.get(socket);
      if (socketSubs === undefined) {
        socketSubs = new Map();
        bySocket.set(socket, socketSubs);
      }
      if (socketSubs.has(workspaceId)) return 'already-subscribed';
      const sub: Subscription = {
        userId,
        workspaceId,
        socket,
        cursor: afterSeq,
        dirty: false,
        running: false,
        caughtUpSent: false,
        ended: false,
      };
      socketSubs.set(workspaceId, sub);
      let workspaceSubs = byWorkspace.get(workspaceId);
      if (workspaceSubs === undefined) {
        workspaceSubs = new Set();
        byWorkspace.set(workspaceId, workspaceSubs);
      }
      // Registered BEFORE the first drain: a commit landing mid-catch-up marks
      // this subscription dirty and is re-drained rather than lost.
      workspaceSubs.add(sub);
      await schedule(sub);
      return 'subscribed';
    },
    dropSocket(socket) {
      removeSocket(socket);
    },
    async settled() {
      // A pump can schedule nothing further itself, but a notification may have
      // arrived while another was running, so drain until the set is empty
      // rather than awaiting one snapshot of it.
      while (inFlight.size > 0) {
        await Promise.all([...inFlight]);
      }
    },
    stats() {
      let subscriptions = 0;
      for (const subs of bySocket.values()) subscriptions += subs.size;
      return { sockets: bySocket.size, subscriptions, workspaces: byWorkspace.size };
    },
    close() {
      unsubscribe();
      for (const socket of [...bySocket.keys()]) removeSocket(socket);
    },
  };
}
