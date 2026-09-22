import { STREAM_ERROR_CODES } from '@gisik-nokma/domain';
import type { LedgerEvent, StreamErrorCode } from '@gisik-nokma/domain';
import type { ServerStreamFrame, Unsubscribe } from '../data-source.js';

/** The subset of the DOM WebSocket the stream needs — injectable for tests and non-browser shells. */
export type WebSocketLike = {
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
};

export type StreamDeps = {
  baseUrl: string;
  webSocketFactory?: (url: string) => WebSocketLike;
  random?: () => number;
};

export const BACKOFF_INITIAL_MS = 500;
export const BACKOFF_CAP_MS = 30_000;

export function streamUrl(baseUrl: string): string {
  return `${baseUrl.replace(/^http/, 'ws')}/v1/stream`;
}

/** Exponential with ±20% jitter: honest retry pressure without thundering herds. */
export function backoffDelayMs(attempt: number, random: () => number): number {
  const base = Math.min(BACKOFF_INITIAL_MS * 2 ** attempt, BACKOFF_CAP_MS);
  const jitterFactor = 0.8 + random() * 0.4;
  return Math.round(base * jitterFactor);
}

/**
 * One frame off the wire, or `null` for anything this client does not recognise.
 *
 * ## Why this is hand-rolled and does NOT call `serverStreamFrameSchema`
 *
 * `@gisik-nokma/domain` publishes `serverStreamFrameSchema`, a zod discriminated
 * union over every published frame — FIVE when this was written, SIX since closure 5b added
 * `reach-granted` — and it was written for exactly this consumer. It is
 * used HERE as the test's oracle rather than as this function's implementation,
 * for three measured reasons:
 *
 * 1. **It is stricter than a client should be about identity SHAPE.** Every id in
 *    it is `ulidString`. A server that one day emits a non-ULID workspace id — or
 *    a shell whose test fixtures are not ULIDs — would have its frames refused
 *    here, and a client that hard-drops a frame it could have delivered fails
 *    SILENTLY, which is the worse direction for a client reading a server it
 *    trusts. Measured against the schema today: all FOUR of the frame fixtures
 *    the plan's own test file carries are REFUSED by it — purge, caught-up and
 *    error on id shape alone, and the event frame on id shape plus its
 *    `clientTime`/`serverTime` ISO-8601 format plus the `workspaceSeq` the
 *    plan's envelope did not carry at all.
 * 2. **The schema's own docblock states that nothing in this repository parses a
 *    frame with it and that it "is not a security boundary."** Wiring it into the
 *    live client path would make that sentence false in `domain`, in a file this
 *    task does not own.
 * 3. A value import of `@gisik-nokma/domain` resolves through `./dist`, so this
 *    module's runtime behaviour would depend on build order. The `LedgerEvent`
 *    import above is a TYPE import and is erased.
 *
 * What the test does instead: it feeds `serverStreamFrameSchema`-valid fixtures of
 * every published frame through `parseFrame` and asserts each survives — which is
 * what caught `reach-granted` being dropped here in silence, twice: first for a
 * missing fixture, then for a missing branch. The relationship
 * pinned is one-directional and deliberate — **everything the published schema
 * accepts, this parser accepts** — and this parser is additionally permissive
 * about id shape, which is what reason 1 argues for.
 *
 * The ONE place this parser is exactly as strict as the schema is
 * `envelope.workspaceSeq`: a positive integer, required. `ledgerEventSchema`
 * requires it (`.positive()`, because `readStreamSeq` returns 0 for an empty
 * workspace, so 0 is a cursor value and never an event's position), and an event
 * frame without it is a frame this subscriber cannot resume from — accepting it
 * would either put `undefined` into a `LedgerEvent`-typed value or turn the
 * resume cursor into `NaN` on the next `Math.max`. Refusing is the only honest
 * answer, and the schema agrees.
 */
export function parseFrame(data: unknown): ServerStreamFrame | null {
  if (typeof data !== 'string') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object') return null;
  const frame = raw as Record<string, unknown>;
  if (frame.type === 'event' && frame.envelope !== null && typeof frame.envelope === 'object') {
    const envelope = frame.envelope as Record<string, unknown>;
    const workspaceSeq = envelope.workspaceSeq;
    // See the docblock: the resume cursor is the one field held to the server's
    // own rule, because a frame without it is not resumable.
    if (typeof workspaceSeq !== 'number' || !Number.isInteger(workspaceSeq) || workspaceSeq <= 0) {
      return null;
    }
    return { type: 'event', envelope: frame.envelope as LedgerEvent };
  }
  if (frame.type === 'purge' && typeof frame.entityId === 'string' && typeof frame.workspaceId === 'string') {
    return { type: 'purge', workspaceId: frame.workspaceId, entityId: frame.entityId };
  }
  // Amendment 13's fifth frame. It carries NO cursor and, per `stream-frames.ts`,
  // `projectId` is declared `?: never` on the server side and the hub REFUSES an
  // instruction carrying one — so a `projectId` on the wire is not a narrowing
  // this client may honour, and nothing here reads one.
  if (frame.type === 'scope-revoked' && typeof frame.workspaceId === 'string') {
    return { type: 'scope-revoked', workspaceId: frame.workspaceId };
  }
  // Closure 5b(d), ruling P37.1 — "your reach grew, and here are the ids it now
  // admits". This is the SECOND independent reader of this wire; the other is
  // `@gisik-nokma/sync-client`'s `net/http-transport.ts`, and the two are linked
  // by nothing but `serverStreamFrameSchema` and the case that walks its option
  // list. **The compiler could not find this branch** — the five other consumers
  // of the union on this branch were type errors and this one was a runtime
  // `null`, caught only because `test/online/stream.test.ts` asserts every
  // published member round-trips. Without it the notice would be silently
  // dropped here while the trigger behind it was accepted, which is exactly the
  // failure mode `parseFrame`'s own closing comment warns about.
  //
  // Elements are FILTERED rather than the frame refused whole, matching the
  // transport's handling and for its reason: a dropped id costs one un-pulled
  // ticket that the next widening names again, where refusing the frame would
  // discard the good ids with the bad one.
  if (frame.type === 'reach-granted' && typeof frame.workspaceId === 'string' && Array.isArray(frame.tickets)) {
    const tickets = frame.tickets.filter(
      (t): t is { id: string; headSeq: number } =>
        typeof t === 'object' &&
        t !== null &&
        typeof (t as { id?: unknown }).id === 'string' &&
        (t as { id: string }).id !== '' &&
        // `headSeq` decides whether a ticket is fetched at all, and `NaN < n` is
        // false — so a junk value would SILENTLY skip the pull this notice
        // exists to cause, rather than failing loudly. Checked, not trusted.
        Number.isInteger((t as { headSeq?: unknown }).headSeq),
    );
    if (tickets.length === 0) return null;
    return { type: 'reach-granted', workspaceId: frame.workspaceId, tickets };
  }
  if (frame.type === 'caught-up' && typeof frame.seq === 'number' && typeof frame.workspaceId === 'string') {
    return { type: 'caught-up', workspaceId: frame.workspaceId, seq: frame.seq };
  }
  if (frame.type === 'error' && isStreamErrorCode(frame.code) && typeof frame.message === 'string') {
    // workspaceId is null for connection-level errors (bad-message before any subscribe).
    return {
      type: 'error',
      workspaceId: typeof frame.workspaceId === 'string' ? frame.workspaceId : null,
      code: frame.code,
      message: frame.message,
    };
  }
  return null; // unknown frames are ignored, never guessed at
}

/**
 * `code` is VALIDATED against the shipped enum rather than accepted as any
 * string, which is the one divergence closure 3 removed: this client's own copy
 * of the frame union declared `code: string`, so a server that sent — or a
 * refactor that introduced — a code nothing handles produced a runtime surprise
 * instead of a compile error.
 *
 * **The cost is named rather than hidden: an error frame carrying an
 * unrecognised code is now DROPPED**, exactly as any other unreadable frame is,
 * per this parser's stated policy that unknown frames are ignored and never
 * guessed at. Dropping a server error is not free — it is a message the user
 * does not see — and the alternative was worse: to surface it this client would
 * have to invent a code the type does not admit, which is the same class of
 * fabrication `mapListView` used to refuse a truncated page for — that mapper
 * is now `mapListPage` and ruling P41 moved the refusal one level up into
 * `getTickets`'s paging loop, so the ANALOGY still holds and the present tense
 * did not (corrected in place per ruling P40: a false sentence a maintainer
 * reasons from is worse than a missing one). The day the server
 * grows a fourth code, `STREAM_ERROR_CODES` is the single place that changes and
 * this function follows it automatically.
 */
function isStreamErrorCode(value: unknown): value is StreamErrorCode {
  return typeof value === 'string' && (STREAM_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Amendment 13's client half. Reconnects with capped jittered backoff; every
 * (re)subscribe resumes from the highest WORKSPACE position the consumer has
 * actually handled, so a flaky link never re-plays what the client already holds —
 * and never skips what it does not.
 *
 * ## Decision: the cursor advances from EVENT frames too, not only `caught-up`
 *
 * The plan header says `afterSeq` is carried "only by `caught-up`" and the client
 * treats it as opaque. That was written when the client's event frame carried a
 * bare `EventEnvelope` and genuinely had no workspace position to read. It does
 * now (`LedgerEvent.workspaceSeq`), and never advancing from events is a defect
 * once you look at what the server does: `stream/hub.ts` guards `caught-up` with a
 * one-shot `caughtUpSent` boolean, so a subscription gets **exactly one**
 * `caught-up`, after its first drain. A connection that then stays up through ten
 * thousand live events and drops would resume from the first-drain cursor and
 * replay all ten thousand. "Only `caught-up` advances it" is therefore not the
 * conservative reading; it is a guarantee of unbounded replay.
 *
 * The asymmetry that decides HOW is stated in `stream-frames.ts`: delivery is
 * at-least-once, frames at or below the cursor may repeat, and the consumer
 * dedupes by envelope id — so under-advancing costs a replay the consumer is
 * already built to absorb, while over-advancing skips an event **permanently**.
 * That docblock's own wording is "the highest `envelope.workspaceSeq` it has
 * APPLIED", not received. So:
 *
 * - the cursor moves to `envelope.workspaceSeq` **after `cb(item)` returns**, and
 *   not at all if `cb` throws. A synchronous callback returning is the only
 *   durability signal this seam has, and it is a weak one — this subscriber is
 *   honest about that rather than pretending delivery is durability;
 * - it moves by `workspaceSeq` and NEVER by `envelope.seq`. `seq` is the
 *   per-ENTITY counter and restarts at 1 for every entity, so resuming from it
 *   would skip every other entity's early events forever. That is the exact
 *   defect coordination amendment 18 exists to kill;
 * - `Math.max` guards it, so an at-least-once replay below the cursor never drags
 *   it backwards;
 * - `purge` and `scope-revoked` carry no cursor and move nothing. Purges are
 *   idempotent by contract precisely because a purge-only drain may re-emit them.
 *
 * ## Decision: `scope-revoked` ENDS this subscription — no reconnect
 *
 * `stream-frames.ts` states it is TERMINAL for the subscription, that it carries
 * no cursor, and that the correct client move afterwards is a fresh bootstrap
 * rather than a resume. Reconnecting into a workspace you were just revoked from
 * is a defect: the server would answer `not-a-member`, forever, on a capped
 * backoff. So the frame is delivered to the consumer first — it is the ONLY
 * notice a connected guest gets, and the host needs it to empty its caches — and
 * then this subscriber shuts itself down exactly as `unsubscribe()` would. The
 * returned `Unsubscribe` stays safe to call afterwards.
 *
 * ## OWNER RULE — case 12.328. A shell that injects `ws` must not answer a
 * ## protocol ping with a TEXT frame.
 *
 * The default below is the PLATFORM `WebSocket`, and on that API a
 * protocol-level ping is answered by the implementation and never surfaces to
 * JavaScript — which is why the TEXT `{type:'ping'}` / `{type:'pong'}` arms
 * this module used to carry were dead on both sides and were deleted. The
 * server's `stream/routes.ts:319` sends `socket.ping()`, a control frame; its
 * message door (`:342`) accepts `subscribeFrameSchema` and NOTHING else, and
 * answers `bad-message` to anything it cannot parse.
 *
 * `webSocketFactory` is an INJECTED seam, so that is a property of what gets
 * injected, not of this file — and **the repository already injects a raw `ws`
 * socket here**: `apps/server/test/dual-client/socket-cut.test.ts:384`
 * constructs `new WsWebSocket(url, …)` and hands it to `createHttpTransport`.
 * An earlier draft of this rule said "never inject a raw `ws` socket" flatly,
 * and a maintainer obeying it would have deleted that fixture. The prohibition
 * was wrong; the property it was reaching for is narrower:
 *
 * **`ws` surfaces protocol pings on `socket.on('ping')`, which `WebSocketLike`
 * does not expose** — the seam carries `onmessage` and nothing else — so an
 * injected `ws` socket cannot deliver one to this parser and `socket-cut`'s
 * injection is safe. What WOULD be a live defect is a shell that wired
 * `on('ping')` to a TEXT `{type:'pong'}` reply: `routes.ts:342` answers that
 * `bad-message`. **Do not do that.**
 *
 * Measured at the deletion, and re-measured after the rebase that brought
 * `socket-cut.test.ts` onto this tree: only `apps/server` depends on `ws`, no
 * client package does, and **four** test files inject a factory — three fakes
 * plus that one real socket. The first count said three and was written before
 * the rebase; it is corrected here rather than left, because 12.328's own text
 * calls that enumeration load-bearing.
 *
 * This is a docblock, not a check — see 12.361, which records exactly that, and
 * now records the buildable assertion this correction exposes.
 */
/**
 * ## ONE SOCKET PER CLIENT, fanned out to every subscriber (2026-09-23)
 *
 * This function used to open a socket per `subscribe()` call, and that was the
 * live-update defect the owner reported: *"when the ticket is created, it required
 * a manual reload before the new ticket is available in the client."* The chain,
 * every link measured against the running stack rather than reasoned about:
 *
 * 1. every `useLiveQuery` instance calls `subscribe()` once, and a board page mounts
 *    several — **six sockets within 3 ms** on one page load;
 * 2. the server caps concurrent sockets at **eight per USER**
 *    (`apps/server/src/stream/routes.ts`, `DEFAULT_MAX_SOCKETS_PER_USER`), a budget
 *    whose own docblock reasons about "a phone, a laptop, and several browser tabs"
 *    — roughly ONE socket per tab. One tab spent six of the eight;
 * 3. a reload (the old page's sockets still held while the new page's six dial), a
 *    second tab, or any reconnect churn crossed eight, and `requireConnectionBudget`
 *    answered **HTTP 429 during the upgrade**;
 * 4. a 429 on a handshake never becomes a close frame, so the browser reports
 *    `close` code **1006** and the server logs an ordinary level-30 response —
 *    the client looks broken while the server log looks clean;
 * 5. the backoff below then retried into the same refusal: **205 `/v1/stream`
 *    requests, 160 of them 429**, measured over forty minutes;
 * 6. with no established socket the debounced re-read never fired.
 *
 * The cap is not wrong — eight is a sane budget for a person. Spending six of it on
 * one tab is. The protocol already anticipated the fix: `routes.ts` states "One
 * socket multiplexes several workspaces" and the client's `subscribe` frame names
 * its own workspace, so one connection can carry them all.
 *
 * ## What a caller can and cannot rely on
 *
 * Subscribers to the SAME workspace share one server-side subscription, because the
 * hub REFUSES a duplicate subscribe on one connection and there is no unsubscribe
 * frame — the client's message door accepts `subscribeFrameSchema` and nothing else.
 * Two consequences, stated rather than discovered later:
 *
 * - **A late joiner does not get a replay.** The room's cursor belongs to whoever
 *   opened it; a second subscriber arriving with a lower `afterSeq` cannot rewind it
 *   without a second connection, which is the thing this change exists to stop. The
 *   one production consumer (`use-live-query.ts`) passes `0` and uses the callback
 *   purely as a change signal before doing its own full read, so this costs it
 *   nothing — but a consumer that wanted history must read it, not listen for it.
 * - **`scope-revoked` ends ONE room, not the connection.** It names a workspace, and
 *   another workspace's subscribers have had nothing revoked. The socket closes only
 *   when the last room is gone, which for a single-room client is the old behaviour
 *   exactly.
 */
export function createStreamSubscriber(deps: StreamDeps) {
  const factory = deps.webSocketFactory ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
  const random = deps.random ?? Math.random;

  /** One workspace's shared subscription: its cursor and everyone listening to it. */
  type Room = { lastSeq: number; listeners: Set<(item: ServerStreamFrame) => void> };
  const rooms = new Map<string, Room>();

  let socket: WebSocketLike | null = null;
  let opened = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function sendSubscribe(workspaceId: string, room: Room): void {
    socket?.send(JSON.stringify({ type: 'subscribe', workspaceId, afterSeq: room.lastSeq }));
  }

  /** A copy, because a listener may unsubscribe from inside its own callback. */
  function deliver(room: Room, frame: ServerStreamFrame): void {
    for (const listener of [...room.listeners]) listener(frame);
  }

  function connect(): void {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    // Nothing to listen for, or already connected: either way, do not spend a socket.
    if (rooms.size === 0 || socket !== null) return;
    socket = factory(streamUrl(deps.baseUrl));
    socket.onopen = () => {
      attempt = 0;
      opened = true;
      // Every room re-subscribes from ITS OWN cursor, which is what makes a
      // reconnect resume rather than replay — see the cursor docblock above.
      for (const [workspaceId, room] of rooms) sendSubscribe(workspaceId, room);
    };
    socket.onmessage = (event) => {
      const frame = parseFrame(event.data);
      if (frame === null) return;
      // ROUTING. An event frame names its workspace inside the envelope; every
      // other frame names it at the top level, and `null` there means the frame is
      // about the CONNECTION (a malformed client frame, say) and belongs to
      // everyone. A frame for a workspace nobody holds is a crossed stream: drop
      // it rather than move a cursor by a number that means nothing here.
      // Read the workspace ONCE and branch on the answer. The first draft tested
      // `frame.type !== 'event' && frame.workspaceId === null` and then derived the
      // id below, which is the same logic and does not TYPECHECK: narrowing a
      // property of one arm of a union does not survive into a later ternary over
      // that union, so `workspaceId` stayed `string | null` and `rooms.get` refused
      // it. It cost a broken build rather than a broken behaviour, and only because
      // the build ran before the edit — `vitest` strips types without checking them,
      // so 1967 green tests said nothing about it.
      const workspaceId = frame.type === 'event' ? frame.envelope.workspaceId : frame.workspaceId;
      if (workspaceId === null) {
        // A connection-level frame — a malformed client frame, say — names no
        // workspace and belongs to everyone listening.
        for (const room of [...rooms.values()]) deliver(room, frame);
        return;
      }
      // A frame for a workspace nobody holds is a crossed stream: drop it rather
      // than move a cursor by a number that means nothing here.
      const room = rooms.get(workspaceId);
      if (room === undefined) return;
      deliver(room, frame);
      // Everything below this line is "the consumer handled it". A throw from a
      // listener skips it, which is the whole point — see the docblock.
      if (frame.type === 'event') room.lastSeq = Math.max(room.lastSeq, frame.envelope.workspaceSeq);
      if (frame.type === 'caught-up') room.lastSeq = Math.max(room.lastSeq, frame.seq);
      if (frame.type === 'scope-revoked') {
        rooms.delete(workspaceId);
        if (rooms.size === 0) shutDownConnection();
      }
    };
    socket.onclose = () => {
      socket = null;
      opened = false;
      // No rooms left means this close was ours. Scheduling a retry here is how a
      // timer outlives the thing it was retrying for — the case that measures
      // `vi.getTimerCount()` exists because a socket count cannot see it.
      if (rooms.size === 0) return;
      retryTimer = setTimeout(connect, backoffDelayMs(attempt, random));
      attempt += 1;
    };
    socket.onerror = () => {
      socket?.close();
    };
  }

  /**
   * Drop the connection for good.
   *
   * `socket` is cleared BEFORE `close()`, and the ordering is load-bearing for the
   * same reason it was when this was per-subscription: `WebSocketLike` is an
   * INJECTED seam, a shell may dispatch `onclose` synchronously from inside
   * `close()`, and the handler above must find the state already torn down. It
   * does — `rooms` is emptied by the caller before this runs, so that re-entrant
   * `onclose` takes its `rooms.size === 0` return and schedules nothing.
   */
  function shutDownConnection(): void {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    const closing = socket;
    socket = null;
    opened = false;
    closing?.close();
  }

  return function subscribe(
    workspaceId: string,
    afterSeq: number,
    cb: (item: ServerStreamFrame) => void,
  ): Unsubscribe {
    const existing = rooms.get(workspaceId);
    const room: Room = existing ?? { lastSeq: afterSeq, listeners: new Set() };
    if (existing === undefined) rooms.set(workspaceId, room);
    room.listeners.add(cb);

    if (socket === null) {
      // `connect` is a no-op while a retry is pending only because it clears the
      // timer and reconnects NOW: a fresh subscriber is a reason to stop waiting
      // out a backoff, and letting the timer also fire would open a second socket.
      connect();
    } else if (existing === undefined && opened) {
      // The connection is already up and this workspace is new to it. A room that
      // already existed must NOT be re-subscribed: the hub refuses a duplicate.
      sendSubscribe(workspaceId, room);
    }

    let stopped = false;
    return function unsubscribe(): void {
      if (stopped) return;
      stopped = true;
      const current = rooms.get(workspaceId);
      if (current === undefined) return;
      current.listeners.delete(cb);
      // There is no unsubscribe frame in the protocol, so an emptied room is
      // dropped locally and simply stops being re-subscribed on the next connect.
      if (current.listeners.size === 0) rooms.delete(workspaceId);
      if (rooms.size === 0) shutDownConnection();
    };
  };
}
