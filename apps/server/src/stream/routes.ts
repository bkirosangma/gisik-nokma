import websocketPlugin from '@fastify/websocket';
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { WebSocket } from 'ws';
import { subscribeFrameSchema, type ServerStreamFrame } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import type { StreamHub, StreamSocket } from './hub.js';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * The hub this app's stream route fans out through.
     *
     * Decorated rather than returned, because `buildApp` returns a
     * `FastifyInstance` and every caller already holds one. It is an
     * OPERATIONAL read as much as a test seam — `stats()` is how a running
     * server answers "how many sockets and subscriptions am I holding", and it
     * is the leak detector: a socket that closed without its subscriptions
     * being released shows up here and nowhere else.
     */
    streamHub: StreamHub;
  }
}

/** Protocol-level heartbeat interval. Two of these unanswered is a dead peer. */
export const DEFAULT_HEARTBEAT_MS = 30_000;

/**
 * Concurrent sockets one signed-in user may hold.
 *
 * The hub refuses a DUPLICATE subscribe, so one connection cannot hold two
 * subscriptions to the same workspace — but nothing in the hub stops one
 * session opening connections until the process runs out of file descriptors,
 * and each one costs a heartbeat timer and a drain per commit. The socket count
 * is the route's, because the route is the only thing that knows who opened it.
 *
 * Eight rather than one: a person legitimately has a phone, a laptop, and
 * several browser tabs, and a cap that a normal day reaches is a cap that gets
 * raised until it means nothing.
 */
export const DEFAULT_MAX_SOCKETS_PER_USER = 8;

/**
 * The largest client frame accepted, in bytes.
 *
 * The only frame a client may send is `{type:'subscribe', workspaceId,
 * afterSeq}` — under a hundred bytes. `ws` defaults `maxPayload` to 100 MB, and
 * a frame is fully BUFFERED before the message handler sees it, so without a
 * bound an authenticated caller can make the server hold 100 MB per message per
 * socket before anything gets the chance to call it malformed. 16 KiB is four
 * hundred times the largest legal frame.
 */
export const MAX_CLIENT_FRAME_BYTES = 16 * 1024;

/**
 * The `not-a-member` refusal, as ONE constant.
 *
 * The property this owes is the one `read/membership.ts` states for
 * `READ_NOT_FOUND_BODY`: a caller must not be able to tell "you are not in this
 * workspace" from "there is no such workspace". `resolveEffectiveRole` answers
 * `workspaceRole: null` to both, so the two take the same branch and there is
 * exactly one emitter — but the reason to hoist it anyway is that two
 * separately-spelled literals have that property by coincidence and lose it the
 * first time one of them grows a field.
 *
 * The frame still carries the `workspaceId`, and that is not an oracle: it is
 * the caller's own input echoed back, and a multiplexed connection needs it to
 * know WHICH subscribe was refused. Everything a caller could read an answer
 * about existence out of — the code, the message, and the fact that the socket
 * is not closed — is identical. 7.148 asserts the two refusals against each
 * other over the bytes, with the echoed id normalised.
 */
export const NOT_A_MEMBER_ERROR = {
  code: 'not-a-member',
  message: 'not a member of this workspace',
} as const;

/** The body a caller over their connection budget gets, and the only one. */
export const TOO_MANY_CONNECTIONS_BODY = { error: 'too_many_connections' } as const;

/**
 * What the heartbeat did, for operators and for the tests that drive it.
 *
 * `pong` in particular is not decoration: a pong is the ONLY evidence a peer is
 * alive, it arrives asynchronously, and without a way to observe that the
 * server saw one, a test asserting "the answering peer survived" can only race
 * the pong against the next tick and hope. See 7.151.
 */
export type HeartbeatEvent = { kind: 'ping' | 'pong' | 'timeout' };

export type HeartbeatTimer = { stop(): void };

/**
 * When the heartbeat CHECK runs. The seam is the timer, not the clock.
 *
 * Two seams rather than one, and they answer different questions. `schedule`
 * decides when the check happens; `now` decides how stale the peer is. A
 * heartbeat that counted TICKS instead of elapsed time would be wrong in
 * production as well as untestable: `setInterval` callbacks coalesce after an
 * event-loop stall, so a burst of delayed ticks would kill a peer whose pongs
 * were sitting in the same queue behind them. Measuring the silence with a
 * clock is what makes the deadline mean two heartbeat intervals of real time.
 */
export type HeartbeatScheduler = (tick: () => void, everyMs: number) => HeartbeatTimer;

const realScheduler: HeartbeatScheduler = (tick, everyMs) => {
  const timer = setInterval(tick, everyMs);
  // A heartbeat must not be the reason a process refuses to exit.
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
};

export type StreamRouteDeps = {
  /** Handed to `resolveEffectiveRole` for the membership check, and to nothing else. */
  pool: Queryable;
  hub: StreamHub;
  heartbeatMs?: number;
  maxSocketsPerUser?: number;
  now?: () => Date;
  schedule?: HeartbeatScheduler;
  onHeartbeat?: (event: HeartbeatEvent) => void;
};

/**
 * `WS /v1/stream` (coordination amendment 13) — the ONLY door the stream has.
 *
 * ## Where the session is resolved, and what a refused caller actually gets
 *
 * At the UPGRADE, by the same `requireSession` every HTTP route on this branch
 * stands behind, taken by parameter for the same reason
 * (`auth/require-session.ts`: a route that reads `currentUserId` registers
 * `requireSession`, made structural by making it an argument).
 *
 * That it works at all was MEASURED rather than assumed (2026-09-02,
 * `@fastify/websocket` 11.3.0): many WS stacks skip the normal hook chain, and
 * the difference between refusing before a socket exists and accepting one then
 * closing it is the difference between a door and a bouncer. It does run, and
 * a reply from it refuses the handshake with an ordinary HTTP response — **no
 * socket is created**, so an anonymous or forged-bearer caller gets
 * `401 {"error":"unauthenticated"}` on the handshake and there is no socket for
 * a frame to have escaped through. That is the strong form, and it is why there
 * is no `if (userId === undefined) socket.close(1008, 'unauthorized')` fallback
 * here even though the plan text has one: it is unreachable, and `hub.ts`
 * argues in its own header why an unreachable guard is worse than no guard — a
 * later reader trusts it, and no test can tell it from its own deletion. The
 * behaviour if somebody ever registers this route WITHOUT the preHandler is
 * still fail-closed rather than open: `currentUserId` is then `undefined`,
 * `resolveEffectiveRole` resolves no membership for it, and every subscribe is
 * answered `not-a-member`.
 *
 * ## Why the route is registered inside its own `register`
 *
 * MEASURED, and it fails SILENTLY: `app.register(websocketPlugin)` followed by
 * a top-level `app.get('/v1/stream', { websocket: true }, …)` produces a plain
 * HTTP route. The plugin installs its `onRoute` hook when it loads, which is
 * after the synchronous `app.get` has already registered the route, so
 * `websocket: true` is never read, the handler is invoked with
 * `(request, reply)` instead of `(socket, request)`, and the upgrade ends in a
 * 500. Nothing warns. Both registrations therefore happen here, in order, and
 * the route goes inside an encapsulated plugin so avvio has finished loading
 * the first before the second declares anything. 7.155 pins the arrangement
 * with a claim only the correct one can satisfy — `@fastify/websocket` replaces
 * a websocket route's HTTP handler with a 404 responder, so a plain
 * `GET /v1/stream` from a signed-in caller answers 404 here and 500 there.
 *
 * ## Membership is per SUBSCRIBE, not per connection
 *
 * One socket multiplexes several workspaces, so there is no single workspace to
 * check at the door. Each `subscribe` resolves the caller's effective role in
 * the workspace it names, and a null role is answered with `NOT_A_MEMBER_ERROR`
 * and no subscription — which is the half the hub deliberately cannot do (its
 * header: a stranger and a member who can see nothing yet must not get the same
 * silence at the door where the caller can tell them apart). The hub remains
 * the second defence: it registers nothing this route did not ask it to, and
 * `visibleEventsFor` yields a null-role reader nothing regardless.
 *
 * ## The heartbeat, and the one caller of `terminate()`
 *
 * `StreamSocket.terminate()` was declared by Task 14 and called by nothing; its
 * docblock named this task as the owner and the heartbeat timeout as the
 * reason. That is exactly what it is used for and the only thing: every other
 * give-up path closes with a protocol code so the client can tell why, and a
 * peer that has stopped answering pings is by definition not going to read one.
 *
 * The deadline is **more than two heartbeat intervals of silence**, which is
 * the plan's own stated contract ("a peer that misses two pings is
 * terminated"). The plan's implementation does not meet it: it clears its
 * `alive` flag on the same tick it sends the ping, so a SINGLE unanswered ping
 * is fatal at the next tick and a peer on the default 30 s heartbeat is dropped
 * after ~60 s having been pinged once, not the ~90 s and two pings the contract
 * promises. 7.151 asserts the second ping, and drives the whole thing off the
 * injected clock and the injected scheduler so nothing sleeps.
 */
export function registerStreamRoute(
  app: FastifyInstance,
  deps: StreamRouteDeps,
  requireSession: preHandlerHookHandler,
): void {
  const heartbeatMs = deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const maxSocketsPerUser = deps.maxSocketsPerUser ?? DEFAULT_MAX_SOCKETS_PER_USER;
  const now = deps.now ?? (() => new Date());
  const schedule = deps.schedule ?? realScheduler;
  // A Map keyed by a user id resolved from a SESSION, never from a frame — but
  // a Map anyway, for the same reason the hub gives: an object indexed by a
  // string that came from anywhere outside this file has `__proto__` and
  // `toString` in it.
  const socketsPerUser = new Map<string, number>();

  /**
   * The connection budget, as a preHandler AFTER `requireSession`.
   *
   * The order is load-bearing and is why these are one array rather than two
   * options: this hook keys on `request.currentUserId`, and running before the
   * session is resolved would key every caller on `undefined` — one shared
   * global bucket that refuses everyone past the cap while still looking like a
   * per-user one. 7.152 is written to catch exactly that: user A is filled to
   * the cap and refused, and user B's FIRST socket opens in the same case.
   */
  const requireConnectionBudget = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const held = socketsPerUser.get(request.currentUserId) ?? 0;
    if (held >= maxSocketsPerUser) {
      await reply.code(429).send(TOO_MANY_CONNECTIONS_BODY);
    }
  };

  app.register(websocketPlugin, { options: { maxPayload: MAX_CLIENT_FRAME_BYTES } });

  app.register(async (instance) => {
    instance.get(
      '/v1/stream',
      { websocket: true, preHandler: [requireSession, requireConnectionBudget] },
      (socket: WebSocket, request: FastifyRequest) => {
        const userId = request.currentUserId;
        socketsPerUser.set(userId, (socketsPerUser.get(userId) ?? 0) + 1);

        let released = false;
        function release(): void {
          if (released) return;
          released = true;
          const held = socketsPerUser.get(userId) ?? 0;
          // Emptied buckets are deleted, not left at zero: one entry per user
          // who has ever connected, for the life of the process, is a leak with
          // a slower clock than a subscription's.
          if (held <= 1) socketsPerUser.delete(userId);
          else socketsPerUser.set(userId, held - 1);
        }

        // The peer is alive when it arrives; the first deadline is measured
        // from here, not from the first ping.
        let lastHeardAt = now().getTime();
        socket.on('pong', () => {
          lastHeardAt = now().getTime();
          deps.onHeartbeat?.({ kind: 'pong' });
        });

        const heartbeat = schedule(() => {
          // STRICTLY greater: at exactly two intervals the peer has had two
          // pings and no more time than the contract allows, so this is the
          // tick that sends the second one. It dies on the tick after.
          if (now().getTime() - lastHeardAt > 2 * heartbeatMs) {
            deps.onHeartbeat?.({ kind: 'timeout' });
            heartbeat.stop();
            release();
            // The one caller of `terminate()` in the product. No close frame:
            // a peer that has answered nothing for three intervals is not
            // reading one, and waiting for its close handshake is how a dead
            // socket stays half-open.
            socket.terminate();
            return;
          }
          socket.ping();
          deps.onHeartbeat?.({ kind: 'ping' });
        }, heartbeatMs);

        function sendFrame(frame: ServerStreamFrame): void {
          socket.send(JSON.stringify(frame));
        }

        function badMessage(message: string): void {
          // `workspaceId: null` — a frame the server could not parse is a frame
          // whose workspace it does not know, and guessing one would attribute
          // the complaint to a subscription the client may not have.
          sendFrame({ type: 'error', workspaceId: null, code: 'bad-message', message });
        }

        async function handleMessage(data: Buffer): Promise<void> {
          let raw: unknown;
          try {
            raw = JSON.parse(data.toString('utf8'));
          } catch {
            badMessage('frames are JSON');
            return;
          }
          const parsed = subscribeFrameSchema.safeParse(raw);
          if (!parsed.success) {
            // Deliberately not zod's own message: its issue paths name the
            // schema's internals, and this is the one frame an unauthenticated
            // — well, unvalidated — input reaches.
            badMessage('expected {type:"subscribe", workspaceId, afterSeq}');
            return;
          }
          const { workspaceId, afterSeq } = parsed.data;
          const effective = await resolveEffectiveRole(deps.pool, userId, workspaceId);
          if (effective.workspaceRole === null) {
            sendFrame({ type: 'error', workspaceId, ...NOT_A_MEMBER_ERROR });
            return;
          }
          const outcome = await deps.hub.subscribe(
            userId,
            socket as unknown as StreamSocket,
            workspaceId,
            afterSeq,
          );
          if (outcome === 'already-subscribed') {
            sendFrame({
              type: 'error',
              workspaceId,
              code: 'already-subscribed',
              message: 'one subscription per workspace per connection',
            });
          }
        }

        socket.on('message', (data: Buffer) => {
          void handleMessage(data).catch((error: unknown) => {
            request.log.error({ err: error }, 'stream: frame handling failed');
            badMessage('this frame could not be served');
          });
        });

        const teardown = (): void => {
          heartbeat.stop();
          release();
          // Without this every closed socket leaves its subscriptions standing
          // in the hub: a drain per commit, per workspace, forever, writing to
          // a socket nobody is reading. 7.153 asserts `stats()` back to where
          // it started, with the non-zero reading while the socket was open as
          // the control.
          deps.hub.dropSocket(socket as unknown as StreamSocket);
        };
        socket.on('close', teardown);
        socket.on('error', teardown);
      },
    );
  });
}
