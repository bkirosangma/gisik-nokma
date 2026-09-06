import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WsWebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import {
  newUlid,
  plainTextToDoc,
  STREAM_CLOSE_CODES,
  type IngestResult,
  type StreamErrorCode,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import {
  createHttpTransport,
  createOutbox,
  createReplica,
  createSyncEngine,
  type Replica,
  type SyncEngine,
  type SyncItem,
  type SyncStatus,
  type SyncStorage,
  type WebSocketLike,
} from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { getTicketStateFromDb } from '../../src/projections/tickets.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * # A REAL socket, really cut — case 12.290's flip condition, measured
 *
 * Ruling P37.1's own flip condition for 12.290 is *"a slow-consumer close
 * MID-PULL followed by convergence on reconnect"*, and until this file the
 * branch could not ask it. `test/dual-client/rig.ts` has **no socket by
 * construction** — its `transport.openStream` throws on purpose, so a scenario
 * cannot believe a subscription exists — and `packages/sync-client`'s engine
 * tests drive a fake transport with no buffer bound at all. So the chain
 * *notice carries no cursor → reconnect at the same cursor → the notice is
 * regenerated → the pull is retried* was argued from the source and measured
 * only link by link. 12.290 stayed 🟡 for exactly that reason, and the reason
 * is quoted in its own entry: *"nothing on this branch can cut a socket"*.
 *
 * ## What is real here, enumerated rather than claimed
 *
 * Everything on both sides of the wire:
 *
 * - a real `buildApp` on a real `listen()`, so a real HTTP **upgrade** happens
 *   — the one request `app.inject` cannot make, which is why no amount of
 *   injection could have reached this;
 * - real Postgres, real projections, real `visibleEventsFor`, the real
 *   `createStreamHub` and the real `registerStreamRoute`, **both unmodified**:
 *   nothing in this file imports a seam into either, and the slow-consumer
 *   bound it trips is the shipped `DEFAULT_MAX_BUFFERED_BYTES` (1 MB), which
 *   `buildApp` does not even expose — not a shrunken test value;
 * - real better-auth sign-in for two people, and a real bearer token on both
 *   the HTTP calls and the WebSocket handshake headers;
 * - the real, unmodified `@gisik-nokma/sync-client` — `createSyncEngine`,
 *   `createReplica`, `createOutbox` and `createHttpTransport` — with only its
 *   two declared seams supplied: `fetchImpl` (to inject one transient network
 *   wobble on one ticket) and `webSocketFactory` (to attach the bearer header
 *   the default `new WebSocket(url)` cannot send, and to record close codes).
 *
 * ## How the socket is cut, and why it is a REAL 1013
 *
 * `hub.ts`'s `send` closes any subscription whose `socket.bufferedAmount`
 * exceeds the bound. `bufferedAmount` is a PROTOTYPE accessor on `ws`'s
 * `WebSocket` (`lib/websocket.js`, `get bufferedAmount()`), so defining an own
 * property of that name on ONE live instance shadows it for that instance and
 * for nothing else — no prototype is touched, no other connection is affected,
 * and the hub is not told anything. The server then genuinely believes that
 * peer is a megabyte behind, and the next ordinary commit makes it say so: a
 * real `close(1013, 'slow-consumer')` frame crosses a real TCP connection, the
 * client's real `ws` fires a real `close` event, `http-transport.ts`'s
 * `socket.onclose` calls the engine's `onClose`, and the engine reconnects on
 * its own timer into a brand-new upgrade.
 *
 * **The close is MEASURED, not assumed.** The `webSocketFactory` records every
 * close code and reason the client actually saw, and each cut below asserts
 * `1013 / 'slow-consumer'` against that record. A fixture that merely timed out
 * into a passing state would show an empty record.
 *
 * ## Why the headline cuts the socket TWICE, which is a finding and not a taste
 *
 * `visible-events-for.ts` scopes its `backfilled` set **per drain** (its own
 * comment: *"a later drain that sees a NEW widening is owed the delivery
 * again"*), and a `reach-granted` advances no cursor — deliberately, so it can
 * be re-delivered. So a client cut before it finishes pulling reconnects at the
 * same cursor, the trigger is re-scanned, and **the notice itself is
 * regenerated**: the first cut is repaired by `applyOne`'s own drain on the
 * re-delivered notice, and `onCaughtUp`'s retry never has to fire. That is
 * exactly the chain 12.290's text describes, and 12.340 measures it end to end
 * for the first time.
 *
 * It also means a one-cut fixture **cannot see `onCaughtUp`'s drain at all**:
 * with the notice back on the wire, deleting that call changes nothing. So the
 * second cut is taken AFTER the client's cursor has moved past the trigger,
 * where no notice can be regenerated and `onCaughtUp`'s pre-cursor drain is the
 * only remaining path to convergence. 12.341 is that claim, and it is the one a
 * mutation of that line kills.
 */

/**
 * The workspace `POST /v1/workspaces` founds ships these two ticket types; the
 * ids are the founding sequence's own and are read here rather than minted, the
 * same way `test/integration/client-contract.test.ts` reads them.
 */
const TASK_TYPE = 'task';
const SUB_TASK_TYPE = 'sub-task';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // An un-awaited rejection between construction and use would be an unhandled
  // rejection; the gate below is always awaited by `fetchImpl`, and this keeps
  // that true even if a case never opens it.
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

type CloseRecord = { code: number; reason: string };

/**
 * What the case may do to one ticket's pulls, set AFTER the fixture has minted
 * the ticket ids and BEFORE the engine starts.
 *
 * `hangFirst` is what makes a cut MID-PULL rather than merely near one: the
 * first `GET /v1/sync/bootstrap/ticket` for the named ticket never settles
 * until the case releases it, so the engine's apply chain is demonstrably
 * parked inside `applyOne` at the moment the socket dies.
 */
type PullFaults = {
  ticketId: string | null;
  hangFirst: boolean;
  /** While true, every attempt after the first fails immediately. */
  blocked: boolean;
};

type Fixture = {
  db: TestDatabase;
  app: FastifyInstance;
  workspaceId: string;
  projectId: string;
  admin: { userId: string; headers: { authorization: string } };
  viewer: { userId: string; token: string };
  /** The three narrowed tickets: a parent and two inheriting children. */
  parentId: string;
  childOneId: string;
  childTwoId: string;
  /** ADMIN's own door: a real `POST /v1/events` with a real bearer token. */
  commit(event: { entity: { kind: string; id: string }; type: string; payload: unknown }): Promise<SubmittedEvent>;
  /** The ledger's own `workspace_seq` for one committed event id. */
  seqOf(eventId: string): Promise<number>;
  /** Every raw `ws` socket the VIEWER's engine has opened, in connection order. */
  viewerSockets: WsWebSocket[];
  /**
   * The CLIENT's end of each of those connections, in the same order.
   *
   * `viewerSockets` above is the SERVER's end — the object
   * `app.websocketServer` emits and `hub.ts` reads `bufferedAmount` off. This
   * is the object `webSocketFactory` built, and the distinction is the whole
   * subject of 12.344: the two ends of one connection see different events,
   * and a protocol ping is visible ONLY here.
   */
  viewerClientSockets: WsWebSocket[];
  /** Every TEXT frame the CLIENT's end actually received, in arrival order. */
  clientFrames: string[];
  /** One entry per PROTOCOL ping the CLIENT's end saw, timestamped. */
  clientPings: number[];
  /** One entry per PROTOCOL pong the SERVER's end saw, timestamped. */
  serverPongs: number[];
  /** Every close code/reason the VIEWER's client actually observed. */
  closes: CloseRecord[];
  /** One entry per `GET /v1/sync/bootstrap/ticket` the transport really issued. */
  pullAttempts: Map<string, number>;
  statuses: SyncStatus[];
  items: SyncItem[];
  replica: Replica;
  engine: SyncEngine;
  faults: PullFaults;
  /** Resolves once the held-open first pull has actually been issued. */
  pullInFlight(): Promise<void>;
  /** Let the held-open pull go, as a transient failure or a real request. */
  releaseHeldPull(outcome: 'fail' | 'pass'): void;
  /** Force the next hub `send()` on this socket to trip the slow-consumer bound. */
  forceSlowConsumer(socket: WsWebSocket): void;
  /** Wait for, and PIN, the nth close the client saw. */
  awaitSlowConsumerClose(nth: number): Promise<CloseRecord>;
  /** Server truth (`proj_tickets`) against replica truth, field for field. */
  expectConverged(ticketId: string, label: string): Promise<void>;
  close(): Promise<void>;
};

const openFixtures: Fixture[] = [];

let phoneCounter = 0;

async function buildFixture(): Promise<Fixture> {
  const db = await createTestDatabase();
  const built = buildTestApp(db);
  const app = built.app;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // TWO REAL SIGN-INS. Not seeded ids: the WS handshake is authenticated by
  // `requireSession` at the UPGRADE, so a fabricated user could not open the
  // socket this file exists to cut. Phone numbers are unique per call because a
  // phone number IS the identity here.
  phoneCounter += 2;
  const adminUser = await signInWithPhone(app, built.otp, `+9197000${String(phoneCounter).padStart(5, '0')}`);
  const viewerUser = await signInWithPhone(app, built.otp, `+9197000${String(phoneCounter + 1).padStart(5, '0')}`);
  const admin = { userId: adminUser.userId, headers: { authorization: `Bearer ${adminUser.token}` } };

  let workspaceId = '';

  async function commit(event: {
    entity: { kind: string; id: string };
    type: string;
    payload: unknown;
  }): Promise<SubmittedEvent> {
    const submitted = {
      id: newUlid(),
      workspaceId,
      version: 1,
      origin: 'web',
      clientTime: new Date().toISOString(),
      actorId: admin.userId,
      entity: event.entity,
      type: event.type,
      payload: event.payload,
    } as unknown as SubmittedEvent;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: admin.headers,
      payload: { events: [submitted] },
    });
    expect(res.statusCode, res.body).toBe(200);
    const { results } = res.json() as { results: IngestResult[] };
    for (const result of results) {
      if (result.status !== 'committed') {
        throw new Error(`${event.type} was not committed: ${JSON.stringify(result)}`);
      }
    }
    return submitted;
  }

  // THE WORKSPACE, founded through the shipped door so its workflow and ticket
  // types are the product's own rather than a fixture's.
  const founded = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: admin.headers,
    payload: { name: 'Socket Cut Corner' },
  });
  expect(founded.statusCode, founded.body).toBe(201);
  workspaceId = (founded.json() as { workspaceId: string }).workspaceId;

  const projectId = newUlid();
  await commit({
    entity: { kind: 'project', id: projectId },
    type: 'project.created',
    payload: { name: 'Aisle three' },
  });
  await commit({
    entity: { kind: 'project', id: projectId },
    type: 'project.member_added',
    payload: { userId: admin.userId, projectAdmin: true },
  });
  // VIEWER joins through the SAME door — `membership.granted` and
  // `project.member_added` authored by the workspace's owner, not a row written
  // behind the projections' back.
  await commit({
    entity: { kind: 'membership', id: `${workspaceId}:${viewerUser.userId}` },
    type: 'membership.granted',
    payload: { userId: viewerUser.userId, role: 'member' },
  });
  await commit({
    entity: { kind: 'project', id: projectId },
    type: 'project.member_added',
    payload: { userId: viewerUser.userId, projectAdmin: false },
  });

  // THE SUBTREE, created and narrowed BEFORE the VIEWER's engine ever starts.
  // That ordering is what makes the pull a pull: `visibleEventsFor` filters
  // against visibility AS OF NOW, so a bootstrap taken after the narrowing
  // carries none of these three, and every row of theirs sits below the
  // VIEWER's opening cursor where only a `reach-granted` can reach it.
  const parentId = newUlid();
  // SORTED, and the sort is load-bearing rather than tidy. `audienceDependents`
  // reads a parent's children `ORDER BY ticket_id`, so that ordering decides
  // which child the drain reaches first — and two ULIDs minted in the SAME
  // millisecond differ only in their random suffix, so their relative order is
  // a coin flip. MEASURED: without this line the mid-drain assertion below
  // ("the second child has not been reached yet") failed once in five runs of
  // this file, because the drain had already passed it — a flake found by the
  // mutation sweep's own unmutated baseline block, which is what that block is
  // for. Naming the smaller id `childOne`
  // makes the drain position of the faulted ticket a fact instead of a
  // probability.
  const sortedChildren: string[] = [newUlid(), newUlid()].sort();
  const childOneId = sortedChildren[0]!;
  const childTwoId = sortedChildren[1]!;
  await commit({
    entity: { kind: 'ticket', id: parentId },
    type: 'ticket.created',
    payload: { typeId: TASK_TYPE, projectId, parentId: null, title: 'Restock the back shelf' },
  });
  // NARROWED TO ADMIN ALONE, and only on the PARENT. The children author no
  // visibility of their own, so `proj_visibility` records them `own_mode =
  // 'inherit'` — which is exactly what `audienceDependents` walks, and what
  // makes ONE widening below name all three ids in ONE notice.
  await commit({
    entity: { kind: 'ticket', id: parentId },
    type: 'visibility.set',
    payload: { ticketId: parentId, mode: 'explicit', userIds: [admin.userId] },
  });
  for (const [childId, title] of [
    [childOneId, 'Count the cartons'],
    [childTwoId, 'Wipe the crate'],
  ] as const) {
    await commit({
      entity: { kind: 'ticket', id: childId },
      type: 'ticket.created',
      payload: { typeId: SUB_TASK_TYPE, projectId, parentId, title },
    });
  }

  // ---- the VIEWER's real client -------------------------------------------

  const viewerSockets: WsWebSocket[] = [];
  const viewerClientSockets: WsWebSocket[] = [];
  const clientFrames: string[] = [];
  const clientPings: number[] = [];
  const serverPongs: number[] = [];
  const closes: CloseRecord[] = [];
  const pullAttempts = new Map<string, number>();
  const statuses: SyncStatus[] = [];
  const items: SyncItem[] = [];
  const faults: PullFaults = { ticketId: null, hangFirst: false, blocked: false };

  // THE SERVER-SIDE HANDLE ON THE VIEWER'S SOCKET. `@fastify/websocket` 11.3.0
  // decorates the app with the underlying `ws` `WebSocketServer` and emits
  // `connection` with the very socket the route hands the hub
  // (`index.js:128`), so this is the same object `send()` reads
  // `bufferedAmount` off. Registered BEFORE the engine ever connects, and
  // appending rather than overwriting, so a later cut can always name the
  // socket that is live NOW.
  app.websocketServer.on('connection', (socket, request) => {
    if (request.headers.authorization !== `Bearer ${viewerUser.token}`) return;
    viewerSockets.push(socket);
    // AN ADDITIONAL `pong` listener, beside the route's own (`routes.ts:290`,
    // which stamps `lastHeardAt`). `ws` emits to every listener, so this
    // observes the heartbeat's answer without standing in for it — and it is
    // the only place the answer is visible at all, because a protocol pong is
    // routed to this event and never to `message`.
    socket.on('pong', () => serverPongs.push(Date.now()));
  });

  const heldPull = deferred<Response>();
  const heldPullReached = deferred<void>();
  /** Set when the held pull is released as `'pass'`, so `fetchImpl` re-issues it for real. */
  let heldPullPassthrough: { input: Parameters<typeof fetch>[0]; init: Parameters<typeof fetch>[1] } | null = null;

  /**
   * The transport's `fetchImpl`, and the ONLY thing in this file that is not
   * the product.
   *
   * It interferes with exactly one ticket's per-ticket pull and calls straight
   * through for everything else — bootstrap, sync, reconcile, and every other
   * ticket's pull — so what a pull costs is measured at the door the engine
   * actually uses. The failure it injects is a GENERIC `Error`, never a 404:
   * a 404 is `TicketPullNotFound`, which `drainPendingPulls` answers by
   * DROPPING the entry (ruling P37.3), and dropping it would delete the very
   * thing whose survival across a socket cut is the subject here.
   */
  const fetchImpl: typeof fetch = async (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const url = new URL(href);
    if (url.pathname === '/v1/sync/bootstrap/ticket') {
      const ticketId = url.searchParams.get('ticketId') ?? '';
      const attempt = (pullAttempts.get(ticketId) ?? 0) + 1;
      pullAttempts.set(ticketId, attempt);
      if (ticketId === faults.ticketId) {
        if (attempt === 1 && faults.hangFirst) {
          // HELD OPEN. The pull is now genuinely in flight and the apply chain
          // is parked inside `applyOne`, which is the state a cut has to find
          // for "MID-PULL" to be a fact rather than a label.
          heldPullPassthrough = { input, init };
          heldPullReached.resolve();
          return await heldPull.promise;
        }
        if (faults.blocked) throw new Error('socket-cut fixture: injected transient pull failure');
      }
    }
    return await fetch(input, init);
  };

  const webSocketFactory = (url: string): WebSocketLike => {
    // The bearer header the default factory (`new WebSocket(url)`) cannot
    // send, passed the way `test/helpers/stream.ts` passes it. The route
    // resolves the session at the UPGRADE, so without this the handshake is
    // refused 401 and there is no socket to cut.
    const socket = new WsWebSocket(url, { headers: { authorization: `Bearer ${viewerUser.token}` } });
    // `on('close')`, not `onclose`: the transport OWNS `onclose` and throws the
    // event away (`socket.onclose = () => handlers.onClose()`), so the code the
    // server sent is visible nowhere else on the client. `ws`'s `onclose`
    // setter adds its own listener and does not clobber this one.
    socket.on('close', (code: number, reason: Buffer) => {
      closes.push({ code, reason: reason.toString() });
    });
    viewerClientSockets.push(socket);
    // `on('message')` for the same reason `on('close')` is here: the transport
    // OWNS `onmessage` and hands the parsed frame to the engine, so the BYTES
    // the server actually sent are visible nowhere else on the client. `ws`'s
    // `onmessage` setter adds its own listener and does not clobber this one.
    socket.on('message', (data: Buffer) => {
      clientFrames.push(data.toString('utf8'));
    });
    // OBSERVING the protocol ping, not answering it. `ws` has ALREADY sent its
    // automatic pong by the time this fires (`lib/websocket.js` pongs inside
    // the receiver's own `ping` handler, before it emits the event), so this
    // listener changes nothing on the wire — which is exactly what makes it a
    // usable control for 12.344, where the case adds a second listener that
    // does.
    socket.on('ping', () => {
      clientPings.push(Date.now());
    });
    return socket as unknown as WebSocketLike;
  };

  const storage: SyncStorage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  const outbox = createOutbox({ storage, replica });
  const transport = createHttpTransport({ baseUrl, token: viewerUser.token, fetchImpl, webSocketFactory });
  // 80ms rather than the shipped 2000: the reconnect is a REAL timer and this
  // fixture waits on it more than once.
  const engine = createSyncEngine({ replica, outbox, transport, reconnectDelayMs: 80 });
  engine.onStatus((status) => statuses.push(status));
  engine.onItem((item) => items.push(item));

  const fixture: Fixture = {
    db,
    app,
    workspaceId,
    projectId,
    admin,
    viewer: { userId: viewerUser.userId, token: viewerUser.token },
    parentId,
    childOneId,
    childTwoId,
    commit,
    async seqOf(eventId) {
      const { rows } = await db.pool.query<{ workspace_seq: string }>(
        'SELECT workspace_seq FROM events WHERE id = $1',
        [eventId],
      );
      const row = rows[0];
      if (row === undefined) throw new Error(`no ledger row for ${eventId}`);
      return Number(row.workspace_seq);
    },
    viewerSockets,
    viewerClientSockets,
    clientFrames,
    clientPings,
    serverPongs,
    closes,
    pullAttempts,
    statuses,
    items,
    replica,
    engine,
    faults,
    pullInFlight: () => heldPullReached.promise,
    releaseHeldPull(outcome) {
      if (outcome === 'fail') {
        heldPull.reject(new Error('socket-cut fixture: the in-flight pull failed'));
        return;
      }
      const held = heldPullPassthrough;
      if (held === null) throw new Error('releaseHeldPull("pass") before the pull was ever issued');
      // Re-issued for real rather than resolved with a fabricated body: what the
      // engine folds must be the SERVER's own answer, or the convergence
      // assertion would be comparing the fixture against itself.
      heldPull.resolve(fetch(held.input, held.init) as unknown as Response);
    },
    forceSlowConsumer(socket) {
      // An OWN property shadows `ws`'s prototype accessor on this instance
      // alone. Nothing else — no other socket, no future socket, and no line of
      // `hub.ts` — is touched.
      Object.defineProperty(socket, 'bufferedAmount', { get: () => 999_999_999, configurable: true });
    },
    async awaitSlowConsumerClose(nth) {
      await vi.waitFor(
        () => {
          expect(
            closes.length,
            `the client never saw close #${nth}; saw ${JSON.stringify(closes)}`,
          ).toBeGreaterThanOrEqual(nth);
        },
        { timeout: 15_000, interval: 10 },
      );
      const record = closes[nth - 1]!;
      // THE MECHANISM, NAMED. A close is not evidence of a SLOW-CONSUMER close:
      // 1011 (a drain that threw) and 1000 (an ordinary hang-up) would both
      // satisfy "the socket went away", and neither is what this fixture claims.
      expect(record.code, `close #${nth} was not the slow-consumer close`).toBe(STREAM_CLOSE_CODES.slowConsumer);
      expect(record.reason, `close #${nth} carried the wrong reason`).toBe('slow-consumer');
      return record;
    },
    async expectConverged(ticketId, label) {
      const server = await getTicketStateFromDb(db.pool, workspaceId, ticketId);
      const local = await replica.getTicket(ticketId);
      expect(server, `${label}: the SERVER holds no state for it`).not.toBeNull();
      expect(local, `${label}: the REPLICA holds no state for it`).not.toBeNull();
      // The comparator `grant-backfill.test.ts` already uses for "server ≡
      // replica": the replica's `confirmed` IS a `TicketState`, and
      // `getTicketStateFromDb` returns the projection's own.
      expect(local?.confirmed, `${label}: replica truth disagrees with server truth`).toEqual(server);
    },
    async close() {
      engine.stop();
      await app.close();
      await storage.close();
      await db.drop();
    },
  };
  openFixtures.push(fixture);
  return fixture;
}

afterEach(async () => {
  for (const fixture of openFixtures.splice(0)) await fixture.close();
});

async function awaitCursorAtLeast(f: Fixture, seq: number, label: string): Promise<void> {
  await vi.waitFor(
    async () => {
      const cursor = await f.replica.getCursor(f.workspaceId);
      expect(cursor, `${label} (last status seen: ${f.statuses.at(-1) ?? 'none'})`).toBeGreaterThanOrEqual(seq);
    },
    { timeout: 20_000, interval: 20 },
  );
}

async function awaitLive(f: Fixture, label: string): Promise<void> {
  await vi.waitFor(
    () => {
      expect(f.engine.status(), `${label}: status never returned to live`).toBe('live');
    },
    { timeout: 20_000, interval: 20 },
  );
}

/**
 * Every `reach-granted` the ENGINE actually applied, in arrival order.
 *
 * Announced AFTER `applyOne`'s own drain, not before it — `applyOne` calls its
 * item listeners at the end of the link — so a notice appears here only once
 * the pulls it caused have been attempted. That ordering is why the mid-pull
 * assertions below read the replica's pending set rather than this list.
 */
function notices(items: readonly SyncItem[]): Array<{ tickets: Array<{ id: string }> }> {
  return items.filter(
    (item): item is Extract<SyncItem, { kind: 'reach-granted' }> => 'kind' in item && item.kind === 'reach-granted',
  );
}

const comment = (body: string): { body: unknown } => ({ body: plainTextToDoc(body) });

describe('12.290 — a real socket, really cut, mid-pull', () => {
  /**
   * ## One continuous run of one real client, and two independently-mutable claims
   *
   * 12.340 and 12.341 are two mechanisms and are catalogued separately, but they
   * share one narrative because building the mid-pull state twice would make the
   * second build a fixture of the first rather than a repeat of it. Each claim
   * is marked where it is measured.
   */
  it(
    '12.340 + 12.341 a 1013 slow-consumer close MID-PULL, and convergence on reconnect — first by the regenerated notice, then by onCaughtUp alone',
    async () => {
      const f = await buildFixture();
      // The wobble lands on ONE child. The parent and the other child pull
      // normally in the same drain, which is what makes "C1 alone stayed owed"
      // a statement about the failure rather than about the drain.
      f.faults.ticketId = f.childOneId;
      f.faults.hangFirst = true;
      f.faults.blocked = true;

      // ---- (1) the VIEWER starts, and holds none of the three --------------
      await f.engine.start(f.workspaceId);
      await awaitLive(f, 'first subscription');
      for (const [id, name] of [
        [f.parentId, 'P'],
        [f.childOneId, 'C1'],
        [f.childTwoId, 'C2'],
      ] as const) {
        expect(await f.replica.getTicket(id), `${name} must be invisible before the widening`).toBeNull();
      }
      expect(await f.replica.listPendingPulls(f.workspaceId)).toEqual([]);
      expect(f.viewerSockets, 'the engine opened no real socket').toHaveLength(1);
      const openingCursor = await f.replica.getCursor(f.workspaceId);

      // ---- (2) ADMIN widens the parent; ONE notice names all three ---------
      const widen = await f.commit({
        entity: { kind: 'ticket', id: f.parentId },
        type: 'visibility.set',
        payload: { ticketId: f.parentId, mode: 'project' },
      });
      const widenSeq = await f.seqOf(widen.id);
      expect(widenSeq, 'the trigger must sit ABOVE the cursor or nothing is regenerated later').toBeGreaterThan(
        openingCursor,
      );

      // THE PULL IS IN FLIGHT. Not "probably" — the transport is holding C1's
      // request open, so the engine's apply chain is parked inside `applyOne`.
      await f.pullInFlight();
      // THE DRAIN IS DEMONSTRABLY MID-WAY, and it is read off the REPLICA rather
      // than off `items`: the notice's own listener does not fire until
      // `applyOne` finishes, which is precisely what the held pull is stopping.
      // P landed and was cleared per ticket; C1 is in flight; C2 is still owed —
      // and the three together are the notice's whole named subtree.
      expect(await f.replica.getTicket(f.parentId), 'P was pulled before C1 was reached').not.toBeNull();
      expect(await f.replica.getTicket(f.childTwoId), 'C2 is behind C1 in the drain').toBeNull();
      expect(
        (await f.replica.listPendingPulls(f.workspaceId)).map((t) => t.id),
        'mid-drain: C1 in flight and C2 still owed, P already cleared',
      ).toEqual([f.childOneId, f.childTwoId]);

      // ---- (3) CUT #1, mid-pull, with a real 1013 -------------------------
      f.forceSlowConsumer(f.viewerSockets[0]!);
      const nudge = await f.commit({
        entity: { kind: 'ticket', id: f.parentId },
        type: 'comment.added',
        payload: comment('the commit that trips the bound'),
      });
      const firstClose = await f.awaitSlowConsumerClose(1);
      expect(firstClose).toEqual({ code: 1013, reason: 'slow-consumer' });
      // The cursor did NOT move under the cut — which is the property the whole
      // re-delivery chain rests on, and it is asserted rather than assumed.
      expect(await f.replica.getCursor(f.workspaceId)).toBe(openingCursor);

      // The in-flight pull now fails, as a request whose moment has passed.
      f.releaseHeldPull('fail');

      // ---- (4) 12.340: the REGENERATED NOTICE repairs the first cut --------
      // The engine reconnects on its own timer at the unchanged cursor; the
      // trigger is re-scanned and the notice comes back. C1 is still blocked, so
      // what this measures is the RE-DELIVERY, not yet the convergence.
      const nudgeSeq = await f.seqOf(nudge.id);
      await awaitCursorAtLeast(f, nudgeSeq, 'the second subscription never caught up');
      await awaitLive(f, 'second subscription');
      expect(f.viewerSockets.length, 'the engine really opened a second socket').toBeGreaterThanOrEqual(2);
      // THE NOTICE CAME BACK. `visible-events-for.ts` scopes `backfilled` per
      // drain and the notice moves no cursor, so a reconnect at the unchanged
      // cursor re-scans the trigger and regenerates it. This is the link 12.290
      // said was argued rather than measured.
      const seen = notices(f.items);
      expect(seen.length, 'the notice was REGENERATED on the reconnect').toBeGreaterThanOrEqual(2);
      expect(seen[0]!.tickets.map((t) => t.id).sort(), 'the first notice named the whole subtree').toEqual(
        [f.parentId, f.childOneId, f.childTwoId].sort(),
      );
      expect(seen[1]!.tickets.map((t) => t.id), 'the regenerated notice still names the un-pulled child').toContain(
        f.childOneId,
      );

      // C1 alone is still owed, and it is owed DURABLY — across a socket that no
      // longer exists. P and C2 landed and were cleared per ticket.
      expect((await f.replica.listPendingPulls(f.workspaceId)).map((t) => t.id)).toEqual([f.childOneId]);
      expect(await f.replica.getTicket(f.childOneId), 'C1 must still be missing').toBeNull();
      await f.expectConverged(f.parentId, 'P after cut #1');
      await f.expectConverged(f.childTwoId, 'C2 after cut #1');
      // Every pull that was going to be attempted has been; C1 cost more than
      // one attempt and the other two cost exactly one each.
      expect(f.pullAttempts.get(f.parentId), 'P was fetched once').toBe(1);
      expect(f.pullAttempts.get(f.childTwoId), 'C2 was fetched once').toBe(1);
      expect(f.pullAttempts.get(f.childOneId) ?? 0, 'C1 was retried after the cut').toBeGreaterThan(1);

      // ---- (5) 12.341: a second cut, with the cursor PAST the trigger ------
      // Now the notice cannot come back — `visibleEventsFor` only regenerates it
      // from a trigger ABOVE the reader's cursor, and the cursor is past it. So
      // `onCaughtUp`'s pre-cursor drain is the ONLY path left to C1.
      expect(
        await f.replica.getCursor(f.workspaceId),
        'the cursor must be past the trigger or 12.341 is 12.340 again',
      ).toBeGreaterThan(widenSeq);
      const noticesBefore = notices(f.items).length;
      f.faults.blocked = false;

      const liveSocket = f.viewerSockets.at(-1)!;
      f.forceSlowConsumer(liveSocket);
      const nudgeTwo = await f.commit({
        entity: { kind: 'ticket', id: f.parentId },
        type: 'comment.added',
        payload: comment('the commit that trips the bound a second time'),
      });
      const secondClose = await f.awaitSlowConsumerClose(2);
      expect(secondClose).toEqual({ code: 1013, reason: 'slow-consumer' });

      // ---- (6) CONVERGENCE ------------------------------------------------
      await vi.waitFor(
        async () => {
          expect(
            await f.replica.listPendingPulls(f.workspaceId),
            `C1 never converged (last status: ${f.statuses.at(-1) ?? 'none'}, attempts: ${String(f.pullAttempts.get(f.childOneId))})`,
          ).toEqual([]);
        },
        { timeout: 20_000, interval: 25 },
      );
      await awaitCursorAtLeast(f, await f.seqOf(nudgeTwo.id), 'the third subscription never caught up');
      await awaitLive(f, 'third subscription');

      // NO NOTICE CARRIED IT. Without this line the convergence above would be
      // satisfied by the same regeneration 12.340 already measured, and 12.341
      // would be a second copy of it rather than a claim about `onCaughtUp`.
      expect(notices(f.items).length, 'the third catch-up must carry NO reach-granted').toBe(noticesBefore);

      expect(await f.replica.getTicket(f.childOneId), 'C1 finally landed').not.toBeNull();
      await f.expectConverged(f.parentId, 'P at convergence');
      await f.expectConverged(f.childOneId, 'C1 at convergence');
      await f.expectConverged(f.childTwoId, 'C2 at convergence');
      // The comment that tripped each bound is on the replica too, so
      // convergence covers the events the cuts were made of and not only the
      // pulled subtree.
      const localParentEvents = (await f.replica.listEntityEvents(f.parentId)).map((e) => e.id);
      expect(localParentEvents, 'the first cut’s own commit converged').toContain(nudge.id);
      expect(localParentEvents, 'the second cut’s own commit converged').toContain(nudgeTwo.id);

      // THE STATUS SEQUENCE IS THE EVIDENCE THE RECONNECTS REALLY RAN. A fixture
      // that timed out into a pass shows one 'live' and no 'connecting' after it.
      expect(f.statuses).toEqual([
        'connecting',
        'catching-up',
        'live',
        'connecting',
        'catching-up',
        'live',
        'connecting',
        'catching-up',
        'live',
      ]);
      expect(f.closes, 'exactly two closes, both slow-consumer').toEqual([
        { code: 1013, reason: 'slow-consumer' },
        { code: 1013, reason: 'slow-consumer' },
      ]);
      // EXACTLY three upgrades, counted at the SERVER's door. The status
      // sequence above counts subscriptions this engine believes it made; this
      // counts the connections the server actually accepted, and only both
      // together rule out a reconnect that opened a socket the engine then
      // abandoned. The control asserts `toHaveLength(1)` on the same array, so
      // the bound is asserted on both sides of its line rather than one — the
      // shape this repo has already paid for twice.
      expect(f.viewerSockets, 'three real upgrades: the original and two reconnects').toHaveLength(3);
    },
    120_000,
  );

  /**
   * ## The control, and why it is a case rather than a step of the sweep
   *
   * Ruling P37.1's flip condition is about a CUT, so a red run under a mutation
   * only means what it says if the same harness is green without one. Kept as a
   * permanent case rather than a transient edit during the mutation sweep: run
   * together, "control green, headline red" is one run's evidence instead of two
   * runs a reader has to trust were the same harness.
   */
  it(
    '12.342 the control: with no cut and no injected failure, the same real client pulls the whole subtree once on the first socket',
    async () => {
      const f = await buildFixture();
      // No faults at all: `faults.ticketId` stays null, so `fetchImpl` is a
      // pass-through for every request in the run.
      await f.engine.start(f.workspaceId);
      await awaitLive(f, 'first subscription');
      expect(await f.replica.getTicket(f.parentId)).toBeNull();
      const openingCursor = await f.replica.getCursor(f.workspaceId);

      const widen = await f.commit({
        entity: { kind: 'ticket', id: f.parentId },
        type: 'visibility.set',
        payload: { ticketId: f.parentId, mode: 'project' },
      });

      await vi.waitFor(
        async () => {
          expect(await f.replica.listPendingPulls(f.workspaceId)).toEqual([]);
          expect(await f.replica.getTicket(f.childOneId)).not.toBeNull();
        },
        { timeout: 20_000, interval: 25 },
      );

      // ## THE MEASUREMENT THAT MAKES THE HEADLINE'S SECOND CUT NECESSARY
      //
      // The widening committed and was delivered — the pull it caused is done —
      // and the CURSOR HAS NOT MOVED. `hub.ts` gates `caught-up` on
      // `caughtUpSent`, so it is sent once per SUBSCRIPTION and never again on a
      // socket that stays up; the client persists a cursor only from that frame.
      // MEASURED here rather than cited, because it is the reason `onCaughtUp`'s
      // retry is unreachable without a reconnect and therefore the reason 12.341
      // has to cut a second time to reach it at all.
      expect(await f.seqOf(widen.id), 'the widening really is above the cursor').toBeGreaterThan(openingCursor);
      expect(
        await f.replica.getCursor(f.workspaceId),
        'a never-cut socket sends one caught-up, so the cursor stands still',
      ).toBe(openingCursor);

      await f.expectConverged(f.parentId, 'P, uncut');
      await f.expectConverged(f.childOneId, 'C1, uncut');
      await f.expectConverged(f.childTwoId, 'C2, uncut');
      // ONE pull each, and it is the same counter the headline reads.
      expect(f.pullAttempts.get(f.parentId)).toBe(1);
      expect(f.pullAttempts.get(f.childOneId)).toBe(1);
      expect(f.pullAttempts.get(f.childTwoId)).toBe(1);
      // NOTHING WAS CUT. The positive control on the whole close-recording
      // apparatus: the headline's two 1013s are a mechanism firing, not a socket
      // this harness drops on its own.
      expect(f.closes, 'no socket was closed in the control').toEqual([]);
      expect(f.viewerSockets, 'one socket, start to finish').toHaveLength(1);
      expect(f.statuses).toEqual(['connecting', 'catching-up', 'live']);
    },
    120_000,
  );

  /**
   * ## Per-ticket persistence, measured where batching would differ
   *
   * `drainPendingPulls` clears each id INSIDE the loop, immediately after that
   * ticket's own pull lands. A loop that ran to its natural end would reach an
   * identical final state either way, so the difference is only observable when
   * the loop is genuinely interrupted part-way — which is what `stop()` during
   * an in-flight pull produces, and what a device being closed mid-drain is.
   *
   * The discriminator is the NETWORK ATTEMPT COUNT for the ticket that already
   * landed: exactly one. Under all-or-nothing persistence its clear never
   * happens, the id survives the restart, and it is fetched a second time — the
   * old wedge's shape in miniature, and the thing per-ticket persistence buys.
   */
  it(
    '12.343 a stop() with a pull in flight keeps what already landed: the restart re-fetches only what was still owed',
    async () => {
      const f = await buildFixture();
      f.faults.ticketId = f.parentId;
      f.faults.hangFirst = true;
      f.faults.blocked = false;

      await f.engine.start(f.workspaceId);
      await awaitLive(f, 'first subscription');

      await f.commit({
        entity: { kind: 'ticket', id: f.parentId },
        type: 'visibility.set',
        payload: { ticketId: f.parentId, mode: 'project' },
      });
      await f.pullInFlight();

      // INTERRUPTED. `stop()` sets the flag the drain re-reads at the TOP of its
      // next iteration, so the in-flight pull still completes and persists and
      // the two ids behind it are never reached.
      f.engine.stop();
      f.releaseHeldPull('pass');

      await vi.waitFor(
        async () => {
          expect(await f.replica.getTicket(f.parentId), 'the in-flight pull still landed').not.toBeNull();
        },
        { timeout: 20_000, interval: 25 },
      );
      // THE CLAIM: P was cleared on its own, while the drain was cut short before
      // the other two. Under all-or-nothing persistence all three would be here.
      expect((await f.replica.listPendingPulls(f.workspaceId)).map((t) => t.id).sort()).toEqual(
        [f.childOneId, f.childTwoId].sort(),
      );
      expect(await f.replica.getTicket(f.childOneId)).toBeNull();

      // A DEVICE RESTART: a fresh `start()` on the same durable replica.
      await f.engine.start(f.workspaceId);
      await vi.waitFor(
        async () => {
          expect(
            await f.replica.listPendingPulls(f.workspaceId),
            `still owed after the restart (attempts: ${JSON.stringify([...f.pullAttempts])})`,
          ).toEqual([]);
        },
        { timeout: 20_000, interval: 25 },
      );
      await awaitLive(f, 'the restarted subscription');

      // THE DISCRIMINATOR. Exactly one network attempt for the ticket that had
      // already landed and been cleared — and one each for the two the restart
      // legitimately owed.
      expect(f.pullAttempts.get(f.parentId), 'P must NOT have been fetched twice').toBe(1);
      expect(f.pullAttempts.get(f.childOneId), 'C1 was owed and fetched once').toBe(1);
      expect(f.pullAttempts.get(f.childTwoId), 'C2 was owed and fetched once').toBe(1);

      await f.expectConverged(f.parentId, 'P after the restart');
      await f.expectConverged(f.childOneId, 'C1 after the restart');
      await f.expectConverged(f.childTwoId, 'C2 after the restart');
      // `stop()` publishes `offline`, and the restart climbs back — the sequence
      // is what says the restart was real rather than the first run continuing.
      expect(f.statuses).toEqual([
        'connecting',
        'catching-up',
        'live',
        'offline',
        'connecting',
        'catching-up',
        'live',
      ]);
    },
    120_000,
  );
});

/**
 * Every frame of one type the CLIENT's raw socket actually received, parsed.
 *
 * Read off the BYTES rather than off the engine: `http-transport.ts`'s
 * `onmessage` drops what it does not recognise and hands the rest to the
 * engine already narrowed, so a frame the client is not supposed to get is
 * exactly the frame that vanishes there. Everything the server sends on this
 * socket is JSON — `sendFrame` is `socket.send(JSON.stringify(frame))` — so a
 * parse failure here would itself be a finding.
 */
function framesOfType(raw: readonly string[], type: string): Array<Record<string, unknown>> {
  return raw
    .map((text) => JSON.parse(text) as Record<string, unknown>)
    .filter((frame) => frame.type === type);
}

/**
 * The code is TYPED rather than spelled inline: `StreamErrorCode` is the union
 * `stream-frames.ts` exports, so renaming the member reddens this at COMPILE
 * time instead of leaving a literal that quietly stops matching — 12.327's own
 * lesson, applied to the other end of the same wire. **The MESSAGE has no
 * constant to read** — it is an inline literal at `stream/routes.ts:347` — so
 * it is copied deliberately, and a re-wording is meant to redden this case.
 */
const BAD_MESSAGE_CODE: StreamErrorCode = 'bad-message';
const BAD_MESSAGE_TEXT = 'expected {type:"subscribe", workspaceId, afterSeq}';

describe('12.344 — a PROTOCOL ping, answered as if it were an application frame', () => {
  /**
   * ## The hazard 12.361 named and left unbuilt, built
   *
   * 12.328 deleted a text `ping`/`pong` protocol nothing implements, on source
   * evidence: `stream/routes.ts:319` sends `socket.ping()`, a WebSocket
   * PROTOCOL control frame, and `ws` answers it automatically and routes the
   * answer to a dedicated `socket.on('pong')` listener (`:290`) — never to
   * `message`. `WebSocketLike` (`http-transport.ts`) exposes only
   * `onopen`/`onmessage`/`onclose`/`onerror`, so **a client built against that
   * abstraction cannot see a protocol ping at all**, let alone mishandle one.
   *
   * 12.361 then recorded what that reasoning does NOT cover: `webSocketFactory`
   * is an injected seam, so the rule is a property of what gets injected, and a
   * shell that injected a real `ws` socket and wired its `on('ping')` to a TEXT
   * reply would be answered `bad-message`. It named this fixture as the one
   * place in the repo where that is buildable — real `ws` on both ends of a
   * real upgrade — and left it to whoever owns the file. This is that case.
   *
   * ## Why it is a PAIR, and what the pairing buys
   *
   * A single run showing `bad-message` after a ping proves nothing on its own:
   * the frame could be an artifact of the connection, of the heartbeat, or of
   * anything else this fixture does. So the control and the hazard are **the
   * same socket, the same `.ping()` call, one line apart** — the only
   * difference between them is the listener the case adds in between. The
   * control must genuinely run and genuinely pass: a heartbeat answered by
   * `ws`'s default alone draws NO complaint, which is also what production does
   * today, on every connection, thirty seconds at a time.
   *
   * ## What is really happening, so the ping is not merely asserted
   *
   * The ping is not waited for — 30 s is `DEFAULT_HEARTBEAT_MS` and this
   * fixture does not inject a scheduler. It is SENT, from the case, on the
   * SERVER's end of the live connection (the same handle
   * `forceSlowConsumer` shadows `bufferedAmount` on), so a real control frame
   * crosses a real TCP connection at a moment the case chooses. Its arrival is
   * measured on the client's own `ws` instance, and the automatic pong is
   * measured coming back on the server's — in BOTH phases, because "the added
   * handler does not disable the default" is only falsifiable if the default is
   * still seen firing underneath it.
   */
  it(
    '12.344 the control draws no complaint; the same socket, wired to answer the ping with a text {"type":"pong"}, earns bad-message',
    async () => {
      const f = await buildFixture();
      await f.engine.start(f.workspaceId);
      await awaitLive(f, 'the only subscription');

      // BOTH ENDS OF ONE CONNECTION, named separately because they see
      // different events: the ping is sendable only from the server's end and
      // observable only on the client's.
      expect(f.viewerSockets, 'one accepted upgrade').toHaveLength(1);
      expect(f.viewerClientSockets, 'one client socket, the other end of it').toHaveLength(1);
      const serverEnd = f.viewerSockets[0]!;
      const clientEnd = f.viewerClientSockets[0]!;

      // THE RECORDER IS ALREADY NON-EMPTY, before anything is pinged. `hub.ts`
      // sends exactly one `caught-up` per subscription, so this is a reading
      // taken from the product rather than a step the case had to arrange — and
      // it is what stops "no error frame" below from being a sentence about a
      // recorder that never worked.
      expect(framesOfType(f.clientFrames, 'caught-up'), 'the subscription sent its one caught-up').toHaveLength(1);
      expect(f.clientPings, 'nothing has been pinged yet').toEqual([]);

      // ---- (1) THE CONTROL: a real ping, and `ws`'s default reaction alone --
      serverEnd.ping();
      await vi.waitFor(
        () => {
          expect(f.clientPings.length, 'the protocol ping never reached the client').toBeGreaterThanOrEqual(1);
          expect(f.serverPongs.length, 'the client never answered at the protocol layer').toBeGreaterThanOrEqual(1);
        },
        { timeout: 15_000, interval: 5 },
      );
      const pongsAfterControl = f.serverPongs.length;

      // THE ORDERING CLOSER, and it is an argument rather than a sleep. Frames
      // reach the client in the order the server wrote them, so if the server
      // were going to answer ANYTHING the client sent in response to that ping,
      // that answer is written before the event frame for a commit made after
      // it was seen. A visible commit, and then its own frame on the wire, is
      // therefore a point past which "no complaint" is a fact about the whole
      // round trip and not about how long the case was willing to wait.
      const looseTicketId = newUlid();
      const nudge = await f.commit({
        entity: { kind: 'ticket', id: looseTicketId },
        type: 'ticket.created',
        payload: { typeId: TASK_TYPE, projectId: f.projectId, parentId: null, title: 'A ticket the VIEWER can see' },
      });
      await vi.waitFor(
        () => {
          expect(
            framesOfType(f.clientFrames, 'event').map((frame) => (frame.envelope as { id?: string } | null)?.id),
            'the ordering closer never arrived on the wire',
          ).toContain(nudge.id);
        },
        { timeout: 20_000, interval: 10 },
      );
      expect(
        framesOfType(f.clientFrames, 'error'),
        'THE CONTROL: a heartbeat answered by ws’s default alone draws no complaint',
      ).toEqual([]);

      // ---- (2) THE HAZARD: one added listener, nothing else changed --------
      // The shell 12.361 describes: something that "answers" a low-level ping
      // the way it would answer an application-level message. `ws`'s automatic
      // pong has already gone out by the time this runs, so this is an EXTRA
      // frame on top of the default rather than a replacement for it — which is
      // why the pong count is asserted to keep growing below.
      clientEnd.on('ping', () => {
        clientEnd.send(JSON.stringify({ type: 'pong' }));
      });
      const pingsBeforeHazard = f.clientPings.length;
      serverEnd.ping();

      await vi.waitFor(
        () => {
          expect(f.clientPings.length, 'the second ping never reached the client').toBeGreaterThan(pingsBeforeHazard);
          expect(
            f.serverPongs.length,
            'the added listener SUPPRESSED ws’s automatic pong — the hazard would then be a different one',
          ).toBeGreaterThan(pongsAfterControl);
          expect(framesOfType(f.clientFrames, 'error').length, 'no complaint came back').toBeGreaterThanOrEqual(1);
        },
        { timeout: 15_000, interval: 5 },
      );

      // EVERY error frame, not just the first. `DEFAULT_HEARTBEAT_MS` is 30 s
      // and this run is far shorter, so in practice there is exactly one — but
      // a spontaneous heartbeat landing while the listener is wired would draw
      // another identical complaint, and a case that pinned the count would go
      // red for a reason that is not its subject. What is pinned is the SHAPE,
      // of all of them.
      const errors = framesOfType(f.clientFrames, 'error');
      for (const error of errors) {
        expect(error, 'the stray text frame was answered as a malformed subscribe').toEqual({
          type: 'error',
          workspaceId: null,
          code: BAD_MESSAGE_CODE,
          message: BAD_MESSAGE_TEXT,
        });
      }

      // ---- (3) A COMPLAINT, NOT A DISCONNECT ------------------------------
      // `routes.ts` answers a malformed frame and keeps the connection; only a
      // THROWN handler closes (1011). Asserted so the case's subject stays "the
      // server answers bad-message" rather than "the socket died somehow", and
      // so the pair above is provably the same socket start to finish.
      expect(f.closes, 'nothing was closed').toEqual([]);
      expect(f.viewerSockets, 'one connection for both halves of the pair').toHaveLength(1);
      expect(f.viewerClientSockets, 'and one client socket for both halves').toHaveLength(1);
      expect(f.engine.status(), 'the engine is still live').toBe('live');
      expect(f.statuses, 'no reconnect happened at any point').toEqual(['connecting', 'catching-up', 'live']);
    },
    120_000,
  );
});
