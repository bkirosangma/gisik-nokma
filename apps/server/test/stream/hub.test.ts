import { describe, expect, it, vi } from 'vitest';
import { newUlid, type LedgerEvent, type ServerStreamFrame } from '@gisik-nokma/domain';
import { serverStreamFrameSchema } from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable.js';
import type { SyncItem } from '../../src/visibility/visible-events-for.js';
import {
  createStreamHub,
  type StreamHubDeps,
  type StreamSocket,
  type VisibleEventsFn,
} from '../../src/stream/hub.js';

/**
 * Plan 5 Task 14 — the subscription hub, unit level.
 *
 * ## What this file can and cannot prove
 *
 * `visibleEvents` is injected here, so every visibility decision is SCRIPTED.
 * That means this file proves the hub's *plumbing* — which subscriber a drain
 * is run for, which workspace a commit wakes, what a frame looks like, when a
 * subscription ends — and proves NOTHING about whether the real filter is
 * correct. The claim "a subscriber never receives an event they may not see"
 * is only worth anything when the real `visibleEventsFor` runs against a real
 * database, which is `hub-integration.test.ts`. Neither file stands alone: this
 * one can be fooled by a correct-looking script, that one cannot make the
 * dozen plumbing states appear on demand.
 *
 * ## No test here waits on the clock
 *
 * The plan's version settles with `setTimeout(20)`. A wall-clock wait is flaky
 * by construction — it passes on a fast machine and fails under load without
 * anything changing — so the hub exposes `settled()`, which resolves when every
 * in-flight pump has finished. It is not a test-only affordance: a graceful
 * shutdown wants exactly the same promise.
 *
 * ## Fixtures keep `seq` and `workspaceSeq` apart
 *
 * Deliberately, and it is the point of several cases below: the resume cursor
 * is `workspaceSeq`, and a fixture where the two counters coincide makes a
 * cursor assertion pass whether the hub read the right one or the wrong one.
 * `sync/stream-seq.ts` states the hazard; these fixtures make it observable.
 */

const WS_A = newUlid();
const WS_B = newUlid();
const USER = newUlid();

/**
 * The hub must not query the database itself — it hands the handle to
 * `visibleEvents` and nothing else. A stub that throws on `query` makes that a
 * measured fact rather than an assumption: a hub that reached for the pool
 * would redden every case in this file.
 */
const POISONED_POOL = {
  query() {
    throw new Error('the hub queried the pool directly; visibleEvents owns every read');
  },
} as unknown as Queryable;

function event(workspaceId: string, entityId: string, workspaceSeq: number): LedgerEvent {
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'ticket', id: entityId },
    type: 'ticket.created',
    version: 1,
    payload: { typeId: 'task', projectId: newUlid(), parentId: null, title: 'A ticket' },
    actorId: USER,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:01.000Z',
    // Never equal to `workspaceSeq`: see the header. 1 is a per-entity seq that
    // every ticket's first event carries, so a hub that advanced the cursor by
    // `seq` would report 1 where these fixtures expect a workspace position.
    seq: 1,
    workspaceSeq,
  };
}

type FakeSocket = StreamSocket & {
  frames: ServerStreamFrame[];
  closes: Array<{ code: number; reason: string }>;
  buffered: number;
};

function fakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    frames: [],
    closes: [],
    buffered: 0,
    get bufferedAmount() {
      return socket.buffered;
    },
    send(data: string) {
      // Parsed through the published schema, not `JSON.parse` alone: every
      // frame this hub emits must be one a Plan 10 replica can accept, and a
      // shape drift would otherwise only show up in that plan's session.
      socket.frames.push(serverStreamFrameSchema.parse(JSON.parse(data)) as ServerStreamFrame);
    },
    close(code: number, reason: string) {
      socket.closes.push({ code, reason });
    },
    terminate() {
      socket.closes.push({ code: -1, reason: 'terminated' });
    },
  };
  return socket;
}

/** What a scripted ledger may hold: envelopes and Plan 4's two instructions. */
type ScriptedInstruction =
  | { kind: 'purge'; entityId: string; workspaceId: string; atSeq: number }
  | { kind: 'scope-revoked'; workspaceId: string; projectId?: string; atSeq: number };
type ScriptedItem = LedgerEvent | ScriptedInstruction;

type Script = {
  ledger: ScriptedItem[];
  /** Per-user visibility: a user absent from the map sees everything. */
  hiddenFrom?: Map<string, ReadonlySet<string>>;
  /** Fires once, in the middle of the first drain — a commit landing mid-catch-up. */
  midDrain?: () => void;
};

/**
 * A `visibleEventsFor` stand-in over a mutable ledger: yields items past
 * `afterSeq`, in order, mirroring Plan 4's semantics — instructions ride along
 * after the envelope that caused them and carry no cursor of their own.
 */
function scriptedVisibleEvents(script: Script): VisibleEventsFn {
  let midDrainFired = false;
  return async function* visibleEvents(
    _db: Queryable,
    userId: string,
    workspaceId: string,
    afterSeq: number,
  ): AsyncGenerator<SyncItem> {
    const hidden = script.hiddenFrom?.get(userId) ?? new Set<string>();
    let yielded = 0;
    for (const item of [...script.ledger]) {
      if ('kind' in item) {
        if (item.workspaceId !== workspaceId || item.atSeq <= afterSeq) continue;
        if (item.kind === 'purge') yield { kind: 'purge', entityId: item.entityId };
        else
          yield {
            kind: 'scope-revoked',
            workspaceId: item.workspaceId,
            ...(item.projectId === undefined ? {} : { projectId: item.projectId }),
          };
      } else if (item.workspaceId === workspaceId && item.workspaceSeq > afterSeq) {
        if (hidden.has(item.entity.id)) continue;
        yield item;
      } else {
        continue;
      }
      yielded += 1;
      if (yielded === 1 && !midDrainFired && script.midDrain !== undefined) {
        midDrainFired = true;
        script.midDrain();
      }
    }
  };
}

function hubWith(script: Script, overrides: Partial<StreamHubDeps> = {}) {
  let committedListener: ((e: LedgerEvent) => void) | undefined;
  let unsubscribed = false;
  const hub = createStreamHub({
    pool: POISONED_POOL,
    onEventCommitted: (listener) => {
      committedListener = listener;
      return () => {
        unsubscribed = true;
        committedListener = undefined;
      };
    },
    visibleEvents: scriptedVisibleEvents(script),
    ...overrides,
  });
  return {
    hub,
    ledger: script.ledger,
    commit: (e: LedgerEvent) => committedListener?.(e),
    listenerAttached: () => committedListener !== undefined,
    wasUnsubscribed: () => unsubscribed,
  };
}

/**
 * A socket that records what was written WITHOUT putting it through
 * `serverStreamFrameSchema`.
 *
 * Used by exactly one case: the prototype-key one. `serverStreamFrameSchema`
 * types every frame's `workspaceId` as a ULID, so a frame naming `__proto__`
 * is refused by the published protocol — which is the right answer, and which
 * makes the validating socket above unable to observe the hub's keying at all
 * (the parse throws, the pump catches it, and the socket is closed 1011 with no
 * frames). This one steps around the wire layer to look at the data structure
 * underneath it.
 */
function rawSocket(): FakeSocket {
  const socket = fakeSocket();
  socket.send = (data: string) => {
    socket.frames.push(JSON.parse(data) as ServerStreamFrame);
  };
  return socket;
}

const types = (socket: FakeSocket): string[] => socket.frames.map((f) => f.type);

/** Every frame about one workspace, whichever field of the frame names it. */
const framesAbout = (socket: FakeSocket, workspaceId: string): ServerStreamFrame[] =>
  socket.frames.filter((f) =>
    f.type === 'event' ? f.envelope.workspaceId === workspaceId : f.workspaceId === workspaceId,
  );

describe('stream hub — catch-up', () => {
  it('drains past the cursor, then sends caught-up once carrying the WORKSPACE cursor', async () => {
    const t1 = newUlid();
    const { hub } = hubWith({
      ledger: [event(WS_A, t1, 11), event(WS_A, t1, 12), event(WS_A, t1, 13)],
    });
    const socket = fakeSocket();
    expect(await hub.subscribe(USER, socket, WS_A, 11)).toBe('subscribed');

    expect(types(socket)).toEqual(['event', 'event', 'caught-up']);
    expect(socket.frames.map((f) => (f.type === 'event' ? f.envelope.workspaceSeq : null))).toEqual([
      12, 13, null,
    ]);
    // 13, not 1: `seq` on every fixture event is 1, so a hub advancing the
    // cursor by the per-entity counter reports 1 here and this case reddens.
    expect(socket.frames[2]).toEqual({ type: 'caught-up', workspaceId: WS_A, seq: 13 });
  });

  it('answers caught-up at the client cursor when there is nothing to catch up', async () => {
    const { hub } = hubWith({ ledger: [] });
    const socket = fakeSocket();
    await hub.subscribe(USER, socket, WS_A, 7);
    expect(socket.frames).toEqual([{ type: 'caught-up', workspaceId: WS_A, seq: 7 }]);
  });

  it('a commit landing MID-DRAIN is re-drained rather than lost', async () => {
    const t1 = newUlid();
    const ledger: ScriptedItem[] = [event(WS_A, t1, 11), event(WS_A, t1, 12)];
    let late: LedgerEvent | undefined;
    const world = hubWith({
      ledger,
      midDrain: () => {
        // The subscription is registered BEFORE the first drain, so this
        // notification finds it and marks it dirty; the pump's do-while runs a
        // second drain rather than dropping the event on the floor.
        late = event(WS_A, t1, 13);
        ledger.push(late);
        world.commit(late);
      },
    });
    const socket = fakeSocket();
    await world.hub.subscribe(USER, socket, WS_A, 10);
    await world.hub.settled();

    expect(late).toBeDefined();
    expect(socket.frames.map((f) => (f.type === 'event' ? f.envelope.workspaceSeq : f.type))).toEqual([
      11,
      12,
      'caught-up',
      13,
    ]);
  });
});

describe('stream hub — live tail', () => {
  it('re-drains from the cursor on a commit, only for the subscribed workspace, and never re-sends caught-up', async () => {
    const t1 = newUlid();
    const { hub, commit, ledger } = hubWith({ ledger: [event(WS_A, t1, 11)] });
    const socket = fakeSocket();
    await hub.subscribe(USER, socket, WS_A, 0);
    expect(types(socket)).toEqual(['event', 'caught-up']);

    const live = event(WS_A, t1, 12);
    ledger.push(live);
    commit(live);
    await hub.settled();
    expect(types(socket)).toEqual(['event', 'caught-up', 'event']);
    expect(socket.frames.filter((f) => f.type === 'caught-up')).toHaveLength(1);

    // The negative half — and its positive control is the assertion directly
    // above, over the same socket: something DOES arrive when the workspace
    // matches, so "nothing new" here is the demux answering rather than a hub
    // that never delivers.
    const foreign = event(WS_B, newUlid(), 12);
    ledger.push(foreign);
    commit(foreign);
    await hub.settled();
    expect(socket.frames).toHaveLength(3);
  });

  it('filters every drain for the subscription\'s OWN user', async () => {
    const shared = newUlid();
    const secret = newUlid();
    const other = newUlid();
    const { hub, commit, ledger } = hubWith({
      ledger: [event(WS_A, shared, 11), event(WS_A, secret, 12)],
      hiddenFrom: new Map([[other, new Set([secret])]]),
    });
    const mine = fakeSocket();
    const theirs = fakeSocket();
    await hub.subscribe(USER, mine, WS_A, 0);
    await hub.subscribe(other, theirs, WS_A, 0);

    const seen = (s: FakeSocket) =>
      s.frames.flatMap((f) => (f.type === 'event' ? [f.envelope.entity.id] : []));
    // Positive control in the same test: `other` is not simply starved — they
    // receive the shared ticket, and only the secret one is withheld. Without
    // this pair a hub that sent `other` nothing at all would pass.
    expect(seen(mine)).toEqual([shared, secret]);
    expect(seen(theirs)).toEqual([shared]);
    expect(seen(theirs)).not.toContain(secret);

    // And on the LIVE path too, which is the same drain: a hub that filtered
    // catch-up per user and broadcast the tail would pass everything above.
    const live = event(WS_A, secret, 13);
    ledger.push(live);
    commit(live);
    await hub.settled();
    expect(seen(mine)).toEqual([shared, secret, secret]);
    expect(seen(theirs)).toEqual([shared]);
  });

  it('keys workspaces by Map, so a workspace id that is also an Object.prototype member cannot collide', async () => {
    // `subscribeFrameSchema` refuses these at the door and
    // `serverStreamFrameSchema` refuses a frame that names one, so no such id
    // can travel the real wire. This is the THIRD defence, and it is the one
    // that matters if either of the other two is ever loosened: the hub's
    // `subscribe` takes a plain string, and its indexes must not collide on it.
    // `__proto__` assigns through an accessor and creates no own key — a plain
    // object would make this subscription vanish — while `toString` creates one
    // that shadows. `rawSocket` is used here for the reason its docblock gives.
    const hostile = '__proto__';
    const shadowing = 'toString';
    const tA = newUlid();
    const tH = newUlid();
    const { hub, commit, ledger } = hubWith({
      ledger: [event(WS_A, tA, 11), event(hostile, tH, 11)],
    });
    const socket = rawSocket();
    await hub.subscribe(USER, socket, WS_A, 0);
    await hub.subscribe(USER, socket, hostile, 0);
    await hub.subscribe(USER, socket, shadowing, 0);

    const caughtUp = socket.frames.filter((f) => f.type === 'caught-up');
    expect(caughtUp).toEqual([
      { type: 'caught-up', workspaceId: WS_A, seq: 11 },
      // Computed keys: a literal `__proto__:` in an object literal sets the
      // prototype instead of a property, which is how a previous proof on this
      // branch passed while checking nothing.
      { type: 'caught-up', [String('workspaceId')]: hostile, seq: 11 },
      { type: 'caught-up', [String('workspaceId')]: shadowing, seq: 0 },
    ]);

    const live = event(hostile, tH, 12);
    ledger.push(live);
    commit(live);
    await hub.settled();
    const delivered = socket.frames.flatMap((f) =>
      f.type === 'event' ? [f.envelope.workspaceId] : [],
    );
    expect(delivered).toEqual([WS_A, hostile, hostile]);
  });

  it('demultiplexes several workspaces on one socket and refuses a duplicate subscription', async () => {
    const tA = newUlid();
    const tB = newUlid();
    const { hub } = hubWith({
      ledger: [event(WS_A, tA, 11), event(WS_B, tB, 12), event(WS_B, tB, 13)],
    });
    const socket = fakeSocket();
    await hub.subscribe(USER, socket, WS_A, 0);
    await hub.subscribe(USER, socket, WS_B, 12);
    expect(socket.frames.filter((f) => f.type === 'caught-up')).toEqual([
      { type: 'caught-up', workspaceId: WS_A, seq: 11 },
      { type: 'caught-up', workspaceId: WS_B, seq: 13 },
    ]);
    expect(await hub.subscribe(USER, socket, WS_A, 0)).toBe('already-subscribed');
    // Refused means REFUSED: no second catch-up ran for WS_A.
    expect(socket.frames.filter((f) => f.type === 'caught-up')).toHaveLength(2);
  });
});

describe('stream hub — revocation', () => {
  it('passes a purge instruction through as a frame, and a purge does not move the cursor', async () => {
    const t1 = newUlid();
    const gone = newUlid();
    const { hub } = hubWith({
      ledger: [event(WS_A, t1, 11), { kind: 'purge', entityId: gone, workspaceId: WS_A, atSeq: 11 }],
    });
    const socket = fakeSocket();
    await hub.subscribe(USER, socket, WS_A, 0);
    expect(socket.frames).toEqual([
      { type: 'event', envelope: expect.objectContaining({ workspaceSeq: 11 }) },
      { type: 'purge', workspaceId: WS_A, entityId: gone },
      // 11, the last ENVELOPE's position. An instruction carries no cursor, so
      // a hub that let one advance the resume position would hand the client a
      // number no event ever occupied.
      { type: 'caught-up', workspaceId: WS_A, seq: 11 },
    ]);
  });

  it('ends the subscription when a scope is revoked — one frame, no cursor, nothing after it', async () => {
    // `scope-revoked` means "empty your replica for this scope". There is no
    // resume cursor on the far side of that, so no `caught-up` follows and the
    // subscription is TERMINAL: the client's correct response is to bootstrap,
    // not to keep applying a tail onto an emptied store.
    //
    // It is also the leak this behaviour closes. `visibleEventsFor` yields the
    // instruction for a null-role reader and yields them nothing else, so the
    // cursor never moves: without a terminal rule, an EX-MEMBER's abandoned
    // socket would receive one `scope-revoked` per workspace commit forever —
    // a full ledger re-scan each time, and a running signal of how busy a
    // workspace they were put out of still is.
    const t1 = newUlid();
    const tB = newUlid();
    const world = hubWith({
      ledger: [
        event(WS_A, t1, 11),
        { kind: 'scope-revoked', workspaceId: WS_A, atSeq: 11 },
        event(WS_B, tB, 11),
      ],
    });
    const socket = fakeSocket();
    await world.hub.subscribe(USER, socket, WS_A, 0);
    await world.hub.subscribe(USER, socket, WS_B, 0);

    expect(framesAbout(socket, WS_A)).toEqual([
      { type: 'event', envelope: expect.objectContaining({ workspaceSeq: 11 }) },
      { type: 'scope-revoked', workspaceId: WS_A },
    ]);
    expect(socket.closes).toEqual([]);

    const afterA = event(WS_A, t1, 12);
    world.ledger.push(afterA);
    world.commit(afterA);
    const afterB = event(WS_B, tB, 12);
    world.ledger.push(afterB);
    world.commit(afterB);
    await world.hub.settled();

    // Positive control for the silence: WS_B, on the SAME socket, keeps
    // streaming. Ending one subscription is not closing the connection.
    expect(framesAbout(socket, WS_A)).toHaveLength(2);
    expect(
      socket.frames.filter((f) => f.type === 'event' && f.envelope.workspaceId === WS_B),
    ).toHaveLength(2);
    expect(world.hub.stats().subscriptions).toBe(1);

    // The subscription really is gone rather than merely silent: the same
    // socket may subscribe to WS_A again.
    expect(await world.hub.subscribe(USER, socket, WS_A, 12)).toBe('subscribed');
  });

  it('refuses a project-scoped revocation instead of widening it to the whole workspace', async () => {
    // `ScopeRevokedInstruction` admits a `projectId` and no emitter produces
    // one, which is why the frame's is `?: never`. If one ever appears, sending
    // a bare `{scope-revoked, workspaceId}` would tell the replica to empty a
    // whole workspace for the loss of one project. Fail closed: report, close,
    // let the client bootstrap.
    const t1 = newUlid();
    const onError = vi.fn();
    const world = hubWith(
      {
        ledger: [
          event(WS_A, t1, 11),
          { kind: 'scope-revoked', workspaceId: WS_A, projectId: newUlid(), atSeq: 11 },
        ],
      },
      { onError },
    );
    const socket = fakeSocket();
    await world.hub.subscribe(USER, socket, WS_A, 0);
    expect(types(socket)).toEqual(['event']);
    expect(socket.closes).toEqual([{ code: 1011, reason: 'stream-error' }]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0]?.[0])).toContain('projectId');

    // Positive control: the SAME fixture without the projectId is delivered and
    // closes nothing, so the refusal above is the guard firing on the one thing
    // it names rather than on scope-revoked in general.
    const ok = hubWith({
      ledger: [event(WS_A, t1, 11), { kind: 'scope-revoked', workspaceId: WS_A, atSeq: 11 }],
    });
    const okSocket = fakeSocket();
    await ok.hub.subscribe(USER, okSocket, WS_A, 0);
    expect(types(okSocket)).toEqual(['event', 'scope-revoked']);
    expect(okSocket.closes).toEqual([]);
  });
});

describe('stream hub — failure and lifecycle', () => {
  it('closes 1013 and detaches a consumer that has stopped reading', async () => {
    const t1 = newUlid();
    const { hub, commit, ledger } = hubWith({ ledger: [event(WS_A, t1, 11)] }, { maxBufferedBytes: 10 });
    const socket = fakeSocket();
    await hub.subscribe(USER, socket, WS_A, 0);
    expect(types(socket)).toEqual(['event', 'caught-up']);

    socket.buffered = 11;
    const live = event(WS_A, t1, 12);
    ledger.push(live);
    commit(live);
    await hub.settled();
    expect(socket.closes).toEqual([{ code: 1013, reason: 'slow-consumer' }]);

    const framesAtClose = socket.frames.length;
    const more = event(WS_A, t1, 13);
    ledger.push(more);
    commit(more);
    await hub.settled();
    expect(socket.frames).toHaveLength(framesAtClose);
    expect(socket.closes).toHaveLength(1);
    expect(hub.stats()).toEqual({ sockets: 0, subscriptions: 0, workspaces: 0 });
  });

  it('closes 1011 and reports when a drain throws', async () => {
    const onError = vi.fn();
    const boom = new Error('the ledger went away');
    const hub = createStreamHub({
      pool: POISONED_POOL,
      onEventCommitted: () => () => {},
      // eslint-disable-next-line require-yield
      visibleEvents: async function* failing(): AsyncGenerator<SyncItem> {
        throw boom;
      },
      onError,
    });
    const socket = fakeSocket();
    await hub.subscribe(USER, socket, WS_A, 0);
    expect(socket.frames).toEqual([]);
    expect(socket.closes).toEqual([{ code: 1011, reason: 'stream-error' }]);
    expect(onError).toHaveBeenCalledWith(boom);
    expect(hub.stats()).toEqual({ sockets: 0, subscriptions: 0, workspaces: 0 });
  });

  it('dropSocket detaches every workspace on that socket and leaves nothing behind', async () => {
    const t1 = newUlid();
    const { hub, commit, ledger } = hubWith({ ledger: [event(WS_A, t1, 11), event(WS_B, t1, 11)] });
    const socket = fakeSocket();
    const survivor = fakeSocket();
    await hub.subscribe(USER, socket, WS_A, 0);
    await hub.subscribe(USER, socket, WS_B, 0);
    await hub.subscribe(USER, survivor, WS_A, 0);
    expect(hub.stats()).toEqual({ sockets: 2, subscriptions: 3, workspaces: 2 });

    hub.dropSocket(socket);
    // The per-workspace index is emptied too, not merely the per-socket one: a
    // hub that left `WS_B`'s empty bucket behind would report workspaces: 2 and
    // grow one dead bucket per workspace for the life of the process.
    expect(hub.stats()).toEqual({ sockets: 1, subscriptions: 1, workspaces: 1 });

    const live = event(WS_A, t1, 12);
    ledger.push(live);
    commit(live);
    await hub.settled();
    expect(types(socket)).toEqual(['event', 'caught-up', 'event', 'caught-up']);
    expect(types(survivor)).toEqual(['event', 'caught-up', 'event']);

    // Gone, not silenced: the same socket object may subscribe again.
    expect(await hub.subscribe(USER, socket, WS_A, 12)).toBe('subscribed');
  });

  it('close() lets go of the commit feed and of every subscription', async () => {
    const t1 = newUlid();
    const world = hubWith({ ledger: [event(WS_A, t1, 11)] });
    const socket = fakeSocket();
    await world.hub.subscribe(USER, socket, WS_A, 0);
    expect(world.listenerAttached()).toBe(true);

    world.hub.close();
    expect(world.wasUnsubscribed()).toBe(true);
    expect(world.listenerAttached()).toBe(false);
    expect(world.hub.stats()).toEqual({ sockets: 0, subscriptions: 0, workspaces: 0 });

    const live = event(WS_A, t1, 12);
    world.ledger.push(live);
    world.commit(live);
    await world.hub.settled();
    expect(types(socket)).toEqual(['event', 'caught-up']);
  });
});
