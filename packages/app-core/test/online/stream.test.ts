import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newUlid, serverStreamFrameSchema } from '@gisik-nokma/domain';
import type { ServerStreamFrame } from '../../src/data-source.js';
import {
  BACKOFF_CAP_MS,
  BACKOFF_INITIAL_MS,
  backoffDelayMs,
  createStreamSubscriber,
  parseFrame,
  streamUrl,
  type WebSocketLike,
} from '../../src/online/stream.js';

class FakeWebSocket implements WebSocketLike {
  sent: string[] = [];
  closedByClient = false;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closedByClient = true;
  }
  serverOpen(): void {
    this.onopen?.({});
  }
  serverSend(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  serverClose(): void {
    this.onclose?.({});
  }
}

/**
 * A `WebSocketLike` whose `close()` dispatches `onclose` SYNCHRONOUSLY, before it
 * returns.
 *
 * The DOM WebSocket does not do this — `close()` starts a handshake and `onclose`
 * arrives on a later task — and neither does `FakeWebSocket` above. But
 * `WebSocketLike` is an injected seam whose whole purpose is that Plan 10's Tauri
 * and React Native shells supply their own implementation, and nothing in the type
 * promises the dispatch is deferred. A shell that closes synchronously turns the
 * subscriber's own shutdown into a `close` → `onclose` → `setTimeout(connect)`
 * re-entry. `connect()`'s `if (closed) return` still refuses to open a socket, so
 * what actually escapes is a scheduled timer nothing clears — which is why the
 * case below measures `vi.getTimerCount()` and not only `sockets.length`. This
 * class is what makes the flag ordering inside `shutDown` a testable property
 * instead of a claim.
 */
class SynchronousCloseWebSocket implements WebSocketLike {
  sent: string[] = [];
  closedByClient = false;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closedByClient = true;
    this.onclose?.({});
  }
  serverOpen(): void {
    this.onopen?.({});
  }
  serverSend(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

function harness() {
  const sockets: FakeWebSocket[] = [];
  const subscribe = createStreamSubscriber({
    baseUrl: 'http://server.test',
    webSocketFactory: () => {
      const socket = new FakeWebSocket();
      sockets.push(socket);
      return socket;
    },
    random: () => 0.5, // jitter factor exactly 1.0
  });
  /**
   * The n-th connection, or a loud failure. `sockets[n]` under
   * `noUncheckedIndexedAccess` is `FakeWebSocket | undefined`, and
   * `undefined?.serverOpen()` is a silent no-op — a case that believed it was
   * driving a reconnection would drive nothing and then pass by asserting on
   * frames nobody sent. Every reconnect assertion in this file goes through here.
   */
  function socketAt(index: number): FakeWebSocket {
    const socket = sockets[index];
    if (socket === undefined) {
      throw new Error(`connection #${index} was never opened (only ${sockets.length} exist)`);
    }
    return socket;
  }
  /** The n-th frame this connection SENT, parsed — same fail-loud contract. */
  function sentFrame(index: number, frameIndex = 0): unknown {
    const raw = socketAt(index).sent[frameIndex];
    if (raw === undefined) {
      throw new Error(`connection #${index} sent no frame #${frameIndex}`);
    }
    return JSON.parse(raw);
  }
  return { sockets, subscribe, socketAt, sentFrame };
}

/**
 * The two cursor fields are DELIBERATELY different numbers, and that is the whole
 * point of this fixture. `seq: 12` is the per-ENTITY counter; `workspaceSeq: 4` is
 * the workspace stream position the resume protocol is defined in terms of. A
 * fixture where they agreed could not tell a subscriber that resumes from the
 * right field apart from one that resumes from the wrong one.
 */
const ENVELOPE = {
  id: '01J9GEVT000000000000000000',
  workspaceId: 'ws_1',
  entity: { kind: 'ticket', id: 't_1' },
  type: 'ticket.assigned',
  version: 1,
  payload: { assigneeId: null },
  actorId: 'user_a',
  origin: 'web',
  clientTime: 'c',
  serverTime: 's',
  seq: 12,
  workspaceSeq: 4,
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('streamUrl and backoff', () => {
  it('translates the HTTP origin to ws and appends /v1/stream', () => {
    expect(streamUrl('http://server.test')).toBe('ws://server.test/v1/stream');
    expect(streamUrl('https://gisik.example')).toBe('wss://gisik.example/v1/stream');
  });

  it('doubles from 500ms and caps at 30s, jitter within ±20%', () => {
    const flat = (attempt: number) => backoffDelayMs(attempt, () => 0.5);
    expect(flat(0)).toBe(BACKOFF_INITIAL_MS);
    expect(flat(1)).toBe(1000);
    expect(flat(2)).toBe(2000);
    expect(flat(10)).toBe(BACKOFF_CAP_MS);
    expect(backoffDelayMs(0, () => 0)).toBe(400);
    expect(backoffDelayMs(0, () => 1)).toBe(600);
  });
});

describe('subscribe / resume protocol (amendments 13 + 19, verbatim frames)', () => {
  it('sends the subscribe frame on open and delivers event, purge, caught-up and error frames', () => {
    const { subscribe, socketAt, sentFrame } = harness();
    const seen: ServerStreamFrame[] = [];
    subscribe('ws_1', 41, (item) => seen.push(item));
    socketAt(0).serverOpen();
    expect(sentFrame(0)).toEqual({ type: 'subscribe', workspaceId: 'ws_1', afterSeq: 41 });
    socketAt(0).serverSend({ type: 'event', envelope: ENVELOPE });
    socketAt(0).serverSend({ type: 'purge', workspaceId: 'ws_1', entityId: 't_gone' });
    socketAt(0).serverSend({ type: 'caught-up', workspaceId: 'ws_1', seq: 12 });
    socketAt(0).serverSend({ type: 'error', workspaceId: 'ws_1', code: 'not-a-member', message: 'not a member of this workspace' });
    expect(seen.map((item) => item.type)).toEqual(['event', 'purge', 'caught-up', 'error']);
    // Amendment 19's workspaceId survives into the item — a multi-workspace host
    // must be able to tell which stream a purge or a cursor belongs to.
    expect(seen[1]).toEqual({ type: 'purge', workspaceId: 'ws_1', entityId: 't_gone' });
    expect(seen[2]).toEqual({ type: 'caught-up', workspaceId: 'ws_1', seq: 12 });
  });

  /**
   * DRIFT 1, closed. `ServerStreamFrame` had four members and no `scope-revoked`, so the
   * one instruction that tells a removed device to empty itself arrived as an
   * unrecognised `type` and was dropped — leaving stale authorization in any cache
   * fed by this stream. This is the named case that dies when the union is
   * narrowed back or the parser's branch is removed.
   */
  it('DRIFT 1: a `scope-revoked` frame reaches the callback — it is a fifth member, not an unknown type', () => {
    const { subscribe, socketAt } = harness();
    const seen: ServerStreamFrame[] = [];
    subscribe('ws_1', 7, (item) => seen.push(item));
    socketAt(0).serverOpen();
    socketAt(0).serverSend({ type: 'scope-revoked', workspaceId: 'ws_1' });
    // Verbatim, and no invented `projectId`: `stream-frames.ts` declares it
    // `?: never` and the hub REFUSES an instruction carrying one, so a client
    // that materialised the field would be describing a frame nobody sends.
    expect(seen).toEqual([{ type: 'scope-revoked', workspaceId: 'ws_1' }]);
    expect(seen[0]).not.toHaveProperty('projectId');
  });

  it('PLANTED DEFECT: drops purge/caught-up frames addressed to another workspace', () => {
    const { subscribe, socketAt, sentFrame } = harness();
    const seen: ServerStreamFrame[] = [];
    subscribe('ws_1', 5, (item) => seen.push(item));
    socketAt(0).serverOpen();
    socketAt(0).serverSend({ type: 'purge', workspaceId: 'ws_OTHER', entityId: 't_gone' });
    socketAt(0).serverSend({ type: 'caught-up', workspaceId: 'ws_OTHER', seq: 9999 });
    expect(seen).toEqual([]);
    // and the foreign cursor did NOT move ours: reconnect still resumes at 5
    socketAt(0).serverClose();
    vi.advanceTimersByTime(BACKOFF_INITIAL_MS);
    socketAt(1).serverOpen();
    expect(sentFrame(1)).toEqual({ type: 'subscribe', workspaceId: 'ws_1', afterSeq: 5 });
  });

  it("a foreign workspace's `scope-revoked` neither reaches the callback nor ends this subscription", () => {
    const { sockets, subscribe, socketAt } = harness();
    const seen: ServerStreamFrame[] = [];
    subscribe('ws_1', 5, (item) => seen.push(item));
    socketAt(0).serverOpen();
    socketAt(0).serverSend({ type: 'scope-revoked', workspaceId: 'ws_OTHER' });
    expect(seen).toEqual([]);
    // Still alive: the amendment-19 guard is the only thing standing between one
    // workspace's revocation and every other subscription on the socket.
    socketAt(0).serverClose();
    vi.advanceTimersByTime(BACKOFF_INITIAL_MS);
    expect(sockets).toHaveLength(2);
  });

  /**
   * This case replaces the plan's `PLANTED DEFECT: an event frame never advances
   * the cursor`. That case could only assert "the cursor stayed put", because the
   * client's event frame carried a bare `EventEnvelope` with no workspace position
   * in it at all. DRIFT 2 closed puts `workspaceSeq` on the frame, so the claim
   * that actually matters is now expressible and is asserted here instead: the
   * cursor moves by `workspaceSeq`, NEVER by the per-entity `seq`. The old
   * case's hazard is still pinned — `afterSeq: 12` is asserted against explicitly
   * — and one more is pinned with it, that the cursor moves at all.
   */
  it('the resume cursor advances by the envelope `workspaceSeq` and never by the per-entity `seq`', () => {
    const { subscribe, socketAt, sentFrame } = harness();
    subscribe('ws_1', 3, () => {});
    socketAt(0).serverOpen();
    socketAt(0).serverSend({ type: 'event', envelope: ENVELOPE }); // seq 12 per-ENTITY, workspaceSeq 4
    socketAt(0).serverClose();
    vi.advanceTimersByTime(BACKOFF_INITIAL_MS);
    socketAt(1).serverOpen();
    const resumed = sentFrame(1) as { afterSeq: number };
    // Resuming at 12 would mean 'give me the workspace stream after position 12'
    // when 12 is only this entity's twelfth event — every other entity's early
    // events would be skipped forever (coordination amendment 18).
    expect(resumed.afterSeq).not.toBe(12);
    // Resuming at 3 would replay this event and everything after it on every
    // reconnect: `stream/hub.ts` sends `caught-up` exactly once per subscription
    // (`caughtUpSent`), so a long-lived connection would have no other cursor.
    expect(resumed.afterSeq).not.toBe(3);
    expect(resumed).toEqual({ type: 'subscribe', workspaceId: 'ws_1', afterSeq: 4 });
  });

  it('DRIFT 2: the envelope `workspaceSeq` survives parseFrame and reaches the callback', () => {
    const parsed = parseFrame(JSON.stringify({ type: 'event', envelope: ENVELOPE }));
    expect(parsed).toEqual({ type: 'event', envelope: ENVELOPE });
    expect(parsed).toHaveProperty('envelope.workspaceSeq', 4);

    const { subscribe, socketAt } = harness();
    const seen: ServerStreamFrame[] = [];
    subscribe('ws_1', 0, (item) => seen.push(item));
    socketAt(0).serverOpen();
    socketAt(0).serverSend({ type: 'event', envelope: ENVELOPE });
    expect(seen).toHaveLength(1);
    const delivered = seen[0] as Extract<ServerStreamFrame, { type: 'event' }>;
    expect(delivered.envelope.workspaceSeq).toBe(4);
    // Control, same assertion site: the per-entity counter is still there too, so
    // this is not "the envelope was replaced by a cursor".
    expect(delivered.envelope.seq).toBe(12);
  });

  it('refuses an event frame whose envelope carries no usable `workspaceSeq` rather than resuming from nothing', () => {
    const { workspaceSeq: _dropped, ...noCursor } = ENVELOPE;
    expect(parseFrame(JSON.stringify({ type: 'event', envelope: noCursor }))).toBeNull();
    // 0 is a CURSOR value (`readStreamSeq` returns 0 for an empty workspace) and
    // never an event's position, which is why `ledgerEventSchema` says `.positive()`.
    expect(parseFrame(JSON.stringify({ type: 'event', envelope: { ...ENVELOPE, workspaceSeq: 0 } }))).toBeNull();
    expect(parseFrame(JSON.stringify({ type: 'event', envelope: { ...ENVELOPE, workspaceSeq: '4' } }))).toBeNull();
    // Positive control, same run: the identical envelope WITH the cursor parses.
    expect(parseFrame(JSON.stringify({ type: 'event', envelope: ENVELOPE }))).not.toBeNull();
  });

  it('does not advance the cursor when the consumer callback throws — delivery is not durability', () => {
    const { subscribe, socketAt, sentFrame } = harness();
    subscribe('ws_1', 3, () => {
      throw new Error('consumer blew up applying this event');
    });
    socketAt(0).serverOpen();
    expect(() => socketAt(0).serverSend({ type: 'event', envelope: ENVELOPE })).toThrow(
      'consumer blew up',
    );
    socketAt(0).serverClose();
    vi.advanceTimersByTime(BACKOFF_INITIAL_MS);
    socketAt(1).serverOpen();
    // Still 3, not 4: the event was received and never applied, so re-delivering
    // it is the only safe move. At-least-once plus dedupe-by-id makes the replay
    // free; advancing past an unapplied event would lose it permanently.
    expect(sentFrame(1)).toEqual({ type: 'subscribe', workspaceId: 'ws_1', afterSeq: 3 });
  });

  it('does not advance the cursor from a `caught-up` the consumer callback threw on', () => {
    // The event half of this claim is pinned in the case above. `caught-up` is
    // the PRIMARY cursor — `stream/hub.ts` sends one per subscription and it is
    // what the plan's protocol was written around — so the same "applied, not
    // received" rule has to hold for it, and a comment covering both advances
    // while only one is tested is the shape of claim this repo keeps finding.
    const { subscribe, socketAt, sentFrame } = harness();
    subscribe('ws_1', 3, () => {
      throw new Error('consumer blew up applying this cursor');
    });
    socketAt(0).serverOpen();
    expect(() => socketAt(0).serverSend({ type: 'caught-up', workspaceId: 'ws_1', seq: 40 })).toThrow(
      'consumer blew up',
    );
    socketAt(0).serverClose();
    vi.advanceTimersByTime(BACKOFF_INITIAL_MS);
    socketAt(1).serverOpen();
    expect(sentFrame(1)).toEqual({ type: 'subscribe', workspaceId: 'ws_1', afterSeq: 3 });
  });

  it('never drags the cursor backwards when an at-least-once replay arrives below it', () => {
    const { subscribe, socketAt, sentFrame } = harness();
    subscribe('ws_1', 0, () => {});
    socketAt(0).serverOpen();
    socketAt(0).serverSend({ type: 'caught-up', workspaceId: 'ws_1', seq: 40 });
    socketAt(0).serverSend({ type: 'event', envelope: { ...ENVELOPE, workspaceSeq: 9 } });
    socketAt(0).serverSend({ type: 'caught-up', workspaceId: 'ws_1', seq: 11 });
    socketAt(0).serverClose();
    vi.advanceTimersByTime(BACKOFF_INITIAL_MS);
    socketAt(1).serverOpen();
    expect(sentFrame(1)).toEqual({ type: 'subscribe', workspaceId: 'ws_1', afterSeq: 40 });
  });

  it('a purge carries no cursor and moves nothing — purges are re-emitted and must stay idempotent', () => {
    const { subscribe, socketAt, sentFrame } = harness();
    const seen: ServerStreamFrame[] = [];
    subscribe('ws_1', 6, (item) => seen.push(item));
    socketAt(0).serverOpen();
    socketAt(0).serverSend({ type: 'purge', workspaceId: 'ws_1', entityId: 't_gone' });
    socketAt(0).serverSend({ type: 'purge', workspaceId: 'ws_1', entityId: 't_gone' });
    expect(seen).toHaveLength(2); // both delivered; de-duplication is the consumer's
    socketAt(0).serverClose();
    vi.advanceTimersByTime(BACKOFF_INITIAL_MS);
    socketAt(1).serverOpen();
    expect(sentFrame(1)).toEqual({ type: 'subscribe', workspaceId: 'ws_1', afterSeq: 6 });
  });

  /**
   * 12.360 — A TEXT `ping` IS NEITHER ANSWERED NOR DELIVERED.
   *
   * This case replaces `answers ping with pong without delivering it`, and the
   * replacement is the whole point: that test agreed with a protocol nothing on
   * the other side implements (12.328). The server's heartbeat is
   * `socket.ping()` — a WebSocket PROTOCOL control frame the platform socket
   * answers below JavaScript — and its message door accepts
   * `subscribeFrameSchema` and nothing else, so a client that replied with a
   * TEXT `{type:'pong'}` would earn `bad-message`. The arms were deleted; this
   * is the fixture that keeps them deleted.
   *
   * It asserts the SENT LIST EXACTLY rather than `not.toContain('pong')`,
   * because a `not.toContain` also passes when the subscriber sends nothing at
   * all — including when it never opened. The `subscribe` frame is that
   * assertion's own positive control: it proves sends are observable on this
   * fake in this run, so the absence of a second one is a fact about the
   * client rather than about the harness.
   *
   * *Mutation: restore `if (frame.type === 'ping') { socket?.send(…pong…); }`
   * in `stream.ts`'s `onmessage` → red HERE and nowhere else in this file.*
   */
  it('12.360 a text ping is neither answered nor delivered', () => {
    const { subscribe, socketAt } = harness();
    const seen: ServerStreamFrame[] = [];
    subscribe('ws_1', 0, (item) => seen.push(item));
    socketAt(0).serverOpen();
    socketAt(0).serverSend({ type: 'ping' });
    expect(socketAt(0).sent).toEqual([JSON.stringify({ type: 'subscribe', workspaceId: 'ws_1', afterSeq: 0 })]);
    expect(seen).toEqual([]);
  });

  it('reconnects after backoff and resumes from the last caught-up cursor — not the original afterSeq', () => {
    const { sockets, subscribe, socketAt, sentFrame } = harness();
    subscribe('ws_1', 0, () => {});
    socketAt(0).serverOpen();
    socketAt(0).serverSend({ type: 'event', envelope: ENVELOPE });
    socketAt(0).serverSend({ type: 'caught-up', workspaceId: 'ws_1', seq: 12 }); // the stream position
    socketAt(0).serverClose();
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(BACKOFF_INITIAL_MS);
    expect(sockets).toHaveLength(2);
    socketAt(1).serverOpen();
    expect(sentFrame(1)).toEqual({ type: 'subscribe', workspaceId: 'ws_1', afterSeq: 12 });
  });

  it('backs off exponentially across consecutive failures and resets after a successful open', () => {
    const { sockets, subscribe, socketAt } = harness();
    subscribe('ws_1', 0, () => {});
    socketAt(0).serverClose();
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    socketAt(1).serverClose();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2); // second retry waits 1000ms
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
    socketAt(2).serverOpen(); // success resets the attempt counter
    socketAt(2).serverClose();
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(4);
  });

  it('unsubscribe closes the socket and stops reconnecting', () => {
    const { sockets, subscribe, socketAt } = harness();
    const unsubscribe = subscribe('ws_1', 0, () => {});
    socketAt(0).serverOpen();
    unsubscribe();
    expect(socketAt(0).closedByClient).toBe(true);
    socketAt(0).serverClose();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('`scope-revoked` is TERMINAL: the subscriber closes and never reconnects into a workspace it was removed from', () => {
    const { sockets, subscribe, socketAt } = harness();
    const seen: ServerStreamFrame[] = [];
    const unsubscribe = subscribe('ws_1', 0, (item) => seen.push(item));
    socketAt(0).serverOpen();
    socketAt(0).serverSend({ type: 'scope-revoked', workspaceId: 'ws_1' });
    // Delivered first — it is the only notice a connected guest gets — and then
    // shut down. Reconnecting would earn a `not-a-member` on a capped backoff,
    // forever; the correct move after this frame is a fresh bootstrap, which is
    // the host's call and not this seam's.
    expect(seen.map((item) => item.type)).toEqual(['scope-revoked']);
    expect(socketAt(0).closedByClient).toBe(true);
    socketAt(0).serverClose();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    // Idempotent: the handle the caller still holds is safe to use afterwards.
    expect(() => unsubscribe()).not.toThrow();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('a shell whose close() dispatches onclose synchronously is stopped clean — no socket, and no timer left scheduled', () => {
    const sockets: SynchronousCloseWebSocket[] = [];
    const subscribe = createStreamSubscriber({
      baseUrl: 'http://server.test',
      webSocketFactory: () => {
        const socket = new SynchronousCloseWebSocket();
        sockets.push(socket);
        return socket;
      },
      random: () => 0.5,
    });

    const unsubscribe = subscribe('ws_1', 0, () => {});
    expect(sockets).toHaveLength(1);
    sockets[0]?.serverOpen();
    unsubscribe();
    expect(sockets[0]?.closedByClient).toBe(true);
    // The `onclose` this close dispatched must find the stop flag ALREADY UP, and
    // the timer count is what measures that. `connect()`'s own `if (closed)`
    // guard means a retry scheduled here would open no socket — so a socket-count
    // assertion alone cannot see this, and the flag ordering inside `shutDown`
    // would be untested prose. What is actually left behind is a live timer that
    // outlives the subscription and fires into a dead one.
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);

    // The same re-entry through the OTHER shutdown path: `scope-revoked`.
    const second = subscribe('ws_1', 0, () => {});
    expect(sockets).toHaveLength(2);
    sockets[1]?.serverOpen();
    sockets[1]?.serverSend({ type: 'scope-revoked', workspaceId: 'ws_1' });
    expect(sockets[1]?.closedByClient).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
    second();
  });

  it('ignores unparseable and unknown frames — never guesses', () => {
    expect(parseFrame('not json')).toBeNull();
    expect(parseFrame(JSON.stringify({ type: 'mystery' }))).toBeNull();
    expect(parseFrame(42)).toBeNull();
    expect(parseFrame(JSON.stringify(null))).toBeNull();
  });
});

describe('parseFrame against the published schema', () => {
  /**
   * `serverStreamFrameSchema` is the domain's runtime declaration of all five
   * frames, written for this consumer. `parseFrame` does not CALL it — the reasons
   * are argued at the function — so the relationship is pinned here instead, in
   * the one direction that matters: **everything the published schema accepts,
   * this parser accepts.** A frame type added to the server union and forgotten
   * here fails this case rather than being silently dropped at runtime.
   *
   * The fixtures are ULID-shaped because the schema requires it. That requirement
   * is exactly why `parseFrame` is hand-rolled: it is a fact about the SERVER's
   * ids, not a rule a client should enforce against the server.
   */
  const WORKSPACE_ID = newUlid();
  const SCHEMA_FIXTURES: Record<string, unknown> = {
    event: {
      type: 'event',
      envelope: {
        id: newUlid(),
        workspaceId: WORKSPACE_ID,
        entity: { kind: 'ticket', id: newUlid() },
        type: 'ticket.assigned',
        version: 1,
        payload: { assigneeId: null },
        actorId: newUlid(),
        origin: 'web',
        clientTime: '2026-09-02T03:00:00.000Z',
        serverTime: '2026-09-02T03:00:00.100Z',
        seq: 12,
        workspaceSeq: 4,
      },
    },
    purge: { type: 'purge', workspaceId: WORKSPACE_ID, entityId: newUlid() },
    'scope-revoked': { type: 'scope-revoked', workspaceId: WORKSPACE_ID },
    // Closure 5b(d), ruling P37.1. This entry exists because the case below
    // DEMANDED it: adding the union member without a fixture reddened
    // "covers every member of the published union" and nothing else. It is the
    // SIXTH consumer of this union on the branch and the only one the COMPILER
    // could not find — the other five were type errors. A runtime completeness
    // guard is what catches a wire member that typechecks everywhere and is
    // simply never exercised, which is the shape a new frame arrives in.
    'reach-granted': {
      type: 'reach-granted',
      workspaceId: WORKSPACE_ID,
      // `{id, headSeq}` since ruling P37.2 — an id-only notice could not tell a
      // COMPLETE local copy from a stale partial one. `headSeq` is `>= 1` in
      // the published schema, so a fixture carrying 0 is refused here, which is
      // the check working rather than a fixture detail.
      tickets: [
        { id: newUlid(), headSeq: 4 },
        { id: newUlid(), headSeq: 9 },
      ],
    },
    'caught-up': { type: 'caught-up', workspaceId: WORKSPACE_ID, seq: 4 },
    error: {
      type: 'error',
      workspaceId: WORKSPACE_ID,
      code: 'not-a-member',
      message: 'not a member of this workspace',
    },
  };

  for (const [name, frame] of Object.entries(SCHEMA_FIXTURES)) {
    it(`accepts the \`${name}\` frame that serverStreamFrameSchema accepts`, () => {
      // The oracle first: if this throws, the fixture is wrong and the case below
      // would be asserting against nothing.
      expect(serverStreamFrameSchema.parse(frame)).toBeDefined();
      expect(parseFrame(JSON.stringify(frame))).toEqual(frame);
    });
  }

  it('covers every member of the published union — no frame type is silently unhandled', () => {
    // Derived, not transcribed: the schema's own option list. A sixth frame added
    // to `ServerStreamFrame` lands here as a missing fixture rather than as a
    // client that drops it.
    const published = serverStreamFrameSchema.options
      .map((option) => option.shape.type.value as string)
      .sort();
    expect(published).toEqual(Object.keys(SCHEMA_FIXTURES).sort());
    expect(published).toContain('scope-revoked');
  });
});
