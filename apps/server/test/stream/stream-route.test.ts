import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import {
  newUlid,
  serverStreamFrameSchema,
  type IngestResult,
  type ServerStreamFrame,
} from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable.js';
import type { StreamHub } from '../../src/stream/hub.js';
import {
  NOT_A_MEMBER_ERROR,
  TOO_MANY_CONNECTIONS_BODY,
  realScheduler,
  type HeartbeatEvent,
  type HeartbeatScheduler,
} from '../../src/stream/routes.js';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';
import { signInWithPhone } from '../helpers/session.js';
import { openStream, refusedStream, type TestStream } from '../helpers/stream.js';

/**
 * Plan 5 Task 15 — `WS /v1/stream`: the ROUTE, which is the only door the
 * stream has.
 *
 * ## Why the whole door is in this file
 *
 * `createStreamHub` (Task 14) authorizes nobody, and says so in its own header:
 * a caller with no role in a workspace drains nothing because Plan 4's filter
 * yields them nothing, but "you are not in this workspace" and "you are in it
 * and can see nothing yet" must not be answered by the same silence at the door
 * where the caller can tell them apart. Until this task the hub was mounted by
 * NOTHING. Everything that keeps the wrong person off the stream is here.
 *
 * ## Three MEASURED facts about the upgrade, established before a line of the
 * ## route was written (2026-09-02, `@fastify/websocket` 11.3.0, Node 22.22.2)
 *
 * A WebSocket handshake is an HTTP request, but many WS stacks skip the normal
 * hook chain, and the difference between "refused before a socket exists" and
 * "accepted, then hung up" is the difference between a door and a bouncer. So it
 * was probed rather than assumed:
 *
 * 1. **`preHandler` DOES run on a `websocket: true` route, before the
 *    upgrade.** A reply from it refuses the handshake with an ordinary HTTP
 *    response and **no socket is created at all** — `ws` surfaces it as
 *    `unexpected-response` carrying the whole `IncomingMessage`. So this door's
 *    answer to an anonymous or forged caller is a real `401
 *    {"error":"unauthenticated"}` on the handshake, not a close code, and there
 *    is no socket for a frame to have escaped through. 7.147 asserts the status
 *    and the bytes.
 * 2. **The handler is `(socket, request)`** — a `ws` `WebSocket` first, which
 *    structurally satisfies Task 14's `StreamSocket`.
 * 3. **`app.register(websocket)` followed by a top-level `app.get(…, {websocket:
 *    true})` SILENTLY DEGRADES to a plain HTTP route.** The plugin's `onRoute`
 *    hook does not exist yet when the route registers, so `websocket: true` is
 *    ignored, the handler is called with `(request, reply)`, and the upgrade
 *    ends in a 500. Nothing warns. `registerStreamRoute` therefore registers the
 *    route inside its own `app.register(...)`, and 7.155 pins the arrangement
 *    with a claim only the correct one satisfies.
 *
 * ## The clock is INJECTED, and nothing here sleeps
 *
 * The heartbeat is a timer, and a test that waits on wall-clock time is flaky by
 * construction. Both the tick and the clock are seams (`AppDeps.stream.schedule`
 * and `AppDeps.now`), so 7.151 drives time explicitly: one app, one mutable
 * clock, one tick that the answering peer survives and the silent peer does not.
 * There is no `settle(ms)` in `helpers/stream.ts` either — every absence claim
 * below is ordered by an awaited frame, never by a sleep.
 */

let db: TestDatabase;
let read: ReadWorld;
let port: number;
let hub: StreamHub;
const openStreams: TestStream[] = [];

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  // A REAL listen: an upgrade is the one request `app.inject` cannot make, and
  // the upgrade is the subject of this task.
  await read.app.listen({ port: 0, host: '127.0.0.1' });
  port = (read.app.server.address() as AddressInfo).port;
  hub = read.app.streamHub;
});

afterAll(async () => {
  await read.app.close();
  await db.drop();
});

afterEach(async () => {
  for (const stream of openStreams.splice(0)) await stream.close();
});

async function connect(role: ReadRole, options: { autoPong?: boolean } = {}): Promise<TestStream> {
  const stream = await openStream(port, read.authOf(role), options);
  openStreams.push(stream);
  return stream;
}

type SubmittedEvent = {
  entity: { kind: string; id: string };
  type: string;
  payload: unknown;
  workspaceId?: string;
};

/**
 * Append through the PRODUCT'S OWN DOOR (`POST /v1/events`), not through
 * `applyCommitted`.
 *
 * This is the only shape that drives the live tail at all: the hub wakes on
 * `onEventCommitted`, which the ingest service fires after a transaction
 * commits, and a helper that writes rows straight into `events` fires nothing.
 * It is also what makes the fan-out end-to-end: the events reach the stream
 * through the same ingest instance `buildApp` handed the route's hub.
 */
async function submit(app: FastifyInstance, role: ReadRole, events: SubmittedEvent[]): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: read.authOf(role),
    payload: {
      events: events.map((event) => ({
        id: newUlid(),
        workspaceId: event.workspaceId ?? read.world.workspaceId,
        version: 1,
        origin: 'web',
        // REQUIRED by `eventEnvelopeSchema` — an event with no `clientTime` is
        // answered `malformed-envelope` at the door, not committed.
        clientTime: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
        actorId: read.userIds[role],
        entity: event.entity,
        type: event.type,
        payload: event.payload,
      })),
    },
  });
  expect(response.statusCode).toBe(200);
  const { results } = response.json() as { results: IngestResult[] };
  for (const result of results) {
    if (result.status !== 'committed') {
      throw new Error(`test event not committed: ${JSON.stringify(result)}`);
    }
  }
}

const dueDate = (date: string) => ({ fieldId: 'dueDate', value: { date } });

function asCaughtUp(frame: ServerStreamFrame): Extract<ServerStreamFrame, { type: 'caught-up' }> {
  if (frame.type !== 'caught-up') throw new Error(`expected caught-up, got ${frame.type}`);
  return frame;
}

function asEvent(frame: ServerStreamFrame): Extract<ServerStreamFrame, { type: 'event' }> {
  if (frame.type !== 'event') throw new Error(`expected event, got ${frame.type}`);
  return frame;
}

describe('WS /v1/stream — the door, the frames and the heartbeat', () => {
  it('7.144 a member subscribes: visibility-filtered catch-up, exactly one caught-up carrying the WORKSPACE cursor, then a live tail', async () => {
    const stream = await connect('member');
    stream.subscribe(read.world.workspaceId, 0);
    const caughtUp = await stream.next((frame) => frame.type === 'caught-up');

    const events = stream.frames.filter((frame) => frame.type === 'event');
    const ticketIds = events
      .filter((frame) => frame.envelope.entity.kind === 'ticket')
      .map((frame) => frame.envelope.entity.id);
    expect(ticketIds).toContain(read.world.taskInEpicId);
    expect(ticketIds).toContain(read.world.epicId);
    // The cursor is the WORKSPACE sequence, never the per-entity `seq`. Every
    // envelope here carries both and they disagree, so a `caught-up` computed
    // from the wrong counter is a different number rather than a coincidence.
    const maxWorkspaceSeq = Math.max(...events.map((frame) => frame.envelope.workspaceSeq));
    const maxEntitySeq = Math.max(...events.map((frame) => frame.envelope.seq));
    expect(maxEntitySeq).toBeLessThan(maxWorkspaceSeq);
    expect(caughtUp).toEqual({
      type: 'caught-up',
      workspaceId: read.world.workspaceId,
      seq: maxWorkspaceSeq,
    });

    // Live tail: a new legal event lands as an event frame AFTER caught-up.
    await submit(read.app, 'member', [
      {
        entity: { kind: 'ticket', id: read.world.taskInEpicId },
        type: 'ticket.field_set',
        payload: dueDate('2026-08-28'),
      },
    ]);
    const live = await stream.next(
      (frame) =>
        frame.type === 'event' &&
        frame.envelope.type === 'ticket.field_set' &&
        frame.envelope.entity.id === read.world.taskInEpicId &&
        (frame.envelope.payload as { value?: { date?: string } }).value?.date === '2026-08-28',
    );
    expect(stream.frames.indexOf(live)).toBeGreaterThan(stream.frames.indexOf(caughtUp));
    // EXACTLY one caught-up — a hub that sent one per drain would have two by
    // now, because the live commit ran a second drain.
    expect(stream.frames.filter((frame) => frame.type === 'caught-up')).toHaveLength(1);
  });

  it('7.145 PLANTED DEFECT: the hidden ticket never crosses the wire — not in catch-up, not live — while a visible event ingested AFTER it does arrive', async () => {
    const stream = await connect('member');
    stream.subscribe(read.world.workspaceId, 0);
    await stream.next((frame) => frame.type === 'caught-up');
    expect(stream.raw.join('\n')).not.toContain(read.world.hiddenTaskId);
    // The positive control for that absence: the ids the member MAY see are in
    // the same bytes, so an empty stream cannot pass this.
    expect(stream.raw.join('\n')).toContain(read.world.taskInEpicId);

    const before = stream.raw.length;
    // The owner touches the hidden ticket; the member must hear nothing…
    await submit(read.app, 'owner', [
      {
        entity: { kind: 'ticket', id: read.world.hiddenTaskId },
        type: 'ticket.field_set',
        payload: dueDate('2026-08-29'),
      },
    ]);
    // …and a VISIBLE event ingested after it is what orders the assertion.
    // Nothing here sleeps: the silence is proved by a frame that arrived, not
    // by a timer that expired.
    await submit(read.app, 'member', [
      {
        entity: { kind: 'ticket', id: read.world.taskInEpicId },
        type: 'ticket.field_set',
        payload: dueDate('2026-08-30'),
      },
    ]);
    await stream.next(
      (frame) =>
        frame.type === 'event' &&
        frame.envelope.entity.id === read.world.taskInEpicId &&
        (frame.envelope.payload as { value?: { date?: string } }).value?.date === '2026-08-30',
    );
    const since = stream.raw.slice(before).join('\n');
    expect(since).not.toContain(read.world.hiddenTaskId);
    expect(since).toContain(read.world.taskInEpicId);
  });

  it('7.146 PLANTED DEFECT: a revocation mid-stream reaches the subscriber as purge frames for exactly what they lost, over the open socket', async () => {
    // `projectLead` and the SIBLING project, deliberately: this case takes
    // somebody off a project for good, and doing that to `member` or to the
    // seeded project would change the world every other case in this file — and
    // every other Plan 5 suite standing on `read-app.ts` — is measuring.
    // Nothing else here uses `projectLead`.
    const stream = await connect('projectLead');
    stream.subscribe(read.world.workspaceId, 0);
    await stream.next((frame) => frame.type === 'caught-up');
    // They hold both of the sibling project's tickets to begin with — without
    // this the purges below would be instructions to forget something they
    // never had.
    expect(stream.raw.join('\n')).toContain(read.sibling.ticketId);
    expect(stream.raw.join('\n')).toContain(read.sibling.choreTicketId);

    await submit(read.app, 'owner', [
      {
        entity: { kind: 'project', id: read.sibling.projectId },
        type: 'project.member_removed',
        payload: { userId: read.userIds.projectLead },
      },
    ]);
    await stream.next(
      (frame) => frame.type === 'purge' && frame.entityId === read.sibling.ticketId,
    );
    await stream.next(
      (frame) => frame.type === 'purge' && frame.entityId === read.sibling.choreTicketId,
    );
    const purges = stream.frames.filter((frame) => frame.type === 'purge');
    expect(purges.every((frame) => frame.workspaceId === read.world.workspaceId)).toBe(true);
    // The socket lives on and the subscription with it — a narrowing inside a
    // workspace is a retraction, not an eviction. `scope-revoked` is the other
    // instruction and it is NOT this one.
    expect(stream.socket.readyState).toBe(stream.socket.OPEN);
    // The positive control this branch requires of every `toEqual([])`: the
    // SAME filter over the SAME array finds frames when there are frames to
    // find, so the empty result below is "no scope-revoked" rather than "no
    // frames at all" or a predicate that matches nothing.
    expect(purges.length).toBeGreaterThanOrEqual(2);
    expect(stream.frames.filter((frame) => frame.type === 'scope-revoked')).toEqual([]);

    // And the narrowing really narrowed: the next event on a ticket they just
    // lost does not arrive. The ordering event is a PROJECT founding, not
    // another ticket: `projectLead` was on the sibling project and no other, so
    // after the removal there is no ticket left in the workspace they may see —
    // a ticket-shaped control here would be absent for the same reason the
    // subject of the test is, and would prove nothing. A project founding
    // reaches every non-guest member, so it orders the silence without
    // depending on the visibility this case just took away.
    const before = stream.raw.length;
    const freshProjectId = newUlid();
    await submit(read.app, 'owner', [
      {
        entity: { kind: 'ticket', id: read.sibling.ticketId },
        type: 'ticket.field_set',
        payload: dueDate('2026-09-10'),
      },
      {
        entity: { kind: 'project', id: freshProjectId },
        type: 'project.created',
        payload: { name: 'Founded after the removal' },
      },
    ]);
    await stream.next(
      (frame) => frame.type === 'event' && frame.envelope.entity.id === freshProjectId,
    );
    expect(stream.raw.slice(before).join('\n')).not.toContain('2026-09-10');
    expect(stream.raw.slice(before).join('\n')).not.toContain(read.sibling.ticketId);
  });

  it('7.158 RECORDED, NOT FIXED: a per-TICKET narrowing mid-stream sends no purge at all — the events simply stop, and the replica keeps what it may no longer see', async () => {
    // *Owner: Plan 4 (`visibility/visible-events-for.ts`), which records this in
    // its own words as case 6.104 — "the under-purge that leaves … the
    // member-side sibling of 6.102".* The plan text for this task asserts the
    // opposite: it expects `visibility.set` to yield purge frames for the epic
    // and its inheriting child. That per-event purge walk WAS in
    // `visibleEventsFor` and was removed by the controller's ruling on case
    // 6.101 — it disclosed ids for tickets the recipient stood in no
    // relationship to — so on this branch the narrowing is silent. FOLLOW THE
    // BRANCH: this case pins what the code does, which is the honest shape of
    // the residual, and it turns red the day the gap is closed.
    const epicId = newUlid();
    const childId = newUlid();
    await submit(read.app, 'owner', [
      {
        entity: { kind: 'ticket', id: epicId },
        type: 'ticket.created',
        payload: { typeId: 'epic', projectId: read.world.projectId, parentId: null, title: 'Licences drive' },
      },
      {
        entity: { kind: 'ticket', id: childId },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: read.world.projectId, parentId: epicId, title: 'Collect the forms' },
      },
    ]);

    const stream = await connect('member');
    stream.subscribe(read.world.workspaceId, 0);
    await stream.next((frame) => frame.type === 'caught-up');
    expect(stream.raw.join('\n')).toContain(epicId);
    expect(stream.raw.join('\n')).toContain(childId);

    const before = stream.raw.length;
    await submit(read.app, 'owner', [
      {
        entity: { kind: 'ticket', id: epicId },
        type: 'visibility.set',
        payload: { ticketId: epicId, mode: 'explicit', userIds: [read.userIds.owner] },
      },
      // A visible event committed AFTER the narrowing, so the silence is
      // ordered by a frame that arrived rather than by a timer.
      {
        entity: { kind: 'ticket', id: read.world.taskInEpicId },
        type: 'ticket.field_set',
        payload: dueDate('2026-09-12'),
      },
    ]);
    await stream.next(
      (frame) =>
        frame.type === 'event' &&
        (frame.envelope.payload as { value?: { date?: string } }).value?.date === '2026-09-12',
    );
    const since = stream.raw.slice(before).join('\n');
    // No purge, no scope-revoked, and not the revoking event either: the client
    // is told nothing and goes on holding a subtree it may no longer see.
    expect(since).not.toContain('"type":"purge"');
    expect(since).not.toContain('scope-revoked');
    expect(since).not.toContain('visibility.set');
    expect(since).not.toContain(epicId);
    // The positive control for four absences in a row: the bytes are not empty
    // and the stream is live.
    expect(since).toContain(read.world.taskInEpicId);

    // What the narrowing DID do, so this is not merely "nothing happened": the
    // subtree stops arriving. The child inherits, so it goes too.
    const quiet = stream.raw.length;
    await submit(read.app, 'owner', [
      { entity: { kind: 'ticket', id: childId }, type: 'ticket.field_set', payload: dueDate('2026-09-13') },
      { entity: { kind: 'ticket', id: read.world.taskInEpicId }, type: 'ticket.field_set', payload: dueDate('2026-09-14') },
    ]);
    await stream.next(
      (frame) =>
        frame.type === 'event' &&
        (frame.envelope.payload as { value?: { date?: string } }).value?.date === '2026-09-14',
    );
    expect(stream.raw.slice(quiet).join('\n')).not.toContain('2026-09-13');
  });

  it('7.147 the door refuses at the HANDSHAKE: no session and a forged bearer both draw HTTP 401 before any socket exists, byte-identical to each other, while a real session upgrades', async () => {
    const anonymous = await refusedStream(port, {});
    const forged = await refusedStream(port, {
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.forged.not-a-real-session',
    });

    expect(anonymous.statusCode).toBe(401);
    expect(JSON.parse(anonymous.body)).toEqual(UNAUTHENTICATED_BODY);
    // Byte-identical to each other, not merely each equal to a literal: two
    // separately-spelled refusals have that property by coincidence and lose it
    // the first time one grows a field.
    expect(forged.statusCode).toBe(anonymous.statusCode);
    expect(forged.body).toBe(anonymous.body);
    const strip = (headers: Record<string, string | string[] | undefined>) => {
      const { date: _date, ...rest } = headers;
      return rest;
    };
    expect(strip(forged.headers)).toEqual(strip(anonymous.headers));
    expect(anonymous.headers['content-length']).toBe(String(anonymous.body.length));

    // The positive control: the same URL upgrades once a real session is
    // attached, so the 401 is a door and not a route that refuses everyone.
    const stream = await connect('member');
    expect(stream.socket.readyState).toBe(stream.socket.OPEN);
  });

  it('7.148 not-a-member and no-such-workspace are the SAME answer on one connection, and neither yields an event', async () => {
    const nonexistentWorkspaceId = newUlid();
    // The neighbour is a real member of a real workspace — so their own
    // workspace is the control that keeps the two refusals from being a route
    // that refuses everything.
    const stream = await connect('neighbour');
    stream.subscribe(read.world.workspaceId, 0);
    const notAMember = await stream.next(
      (frame) => frame.type === 'error' && frame.workspaceId === read.world.workspaceId,
    );
    stream.subscribe(nonexistentWorkspaceId, 0);
    const noSuchWorkspace = await stream.next(
      (frame) => frame.type === 'error' && frame.workspaceId === nonexistentWorkspaceId,
    );
    stream.subscribe(read.neighbour.workspaceId, 0);
    const own = await stream.next(
      (frame) => frame.type === 'caught-up' && frame.workspaceId === read.neighbour.workspaceId,
    );

    expect(notAMember).toEqual({
      type: 'error',
      workspaceId: read.world.workspaceId,
      ...NOT_A_MEMBER_ERROR,
    });
    // The frames differ ONLY in the workspace id the caller themselves sent
    // back. Everything a caller could read an existence answer out of — the
    // code, the message, the absence of a close — is the same string. Compared
    // over the BYTES with the echoed id normalised, because that is the only
    // difference the protocol permits.
    const normalise = (raw: string, workspaceId: string) => raw.replaceAll(workspaceId, '<ws>');
    const rawNotAMember = stream.raw.find((line) => line.includes(read.world.workspaceId));
    const rawNoSuch = stream.raw.find((line) => line.includes(nonexistentWorkspaceId));
    expect(rawNotAMember).toBeDefined();
    expect(rawNoSuch).toBeDefined();
    expect(normalise(rawNotAMember ?? '', read.world.workspaceId)).toBe(
      normalise(rawNoSuch ?? '', nonexistentWorkspaceId),
    );
    expect(own).toEqual({
      type: 'caught-up',
      workspaceId: read.neighbour.workspaceId,
      seq: expect.any(Number),
    });

    // A refused subscribe registers nothing, so a later commit in that
    // workspace must reach this socket as nothing at all. Ordered by the
    // MEMBER's frame on a second socket, not by a sleep.
    const witness = await connect('member');
    witness.subscribe(read.world.workspaceId, 0);
    await witness.next((frame) => frame.type === 'caught-up');
    const before = stream.raw.length;
    await submit(read.app, 'member', [
      {
        entity: { kind: 'ticket', id: read.world.taskInEpicId },
        type: 'ticket.field_set',
        payload: dueDate('2026-09-01'),
      },
    ]);
    await witness.next(
      (frame) =>
        frame.type === 'event' &&
        (frame.envelope.payload as { value?: { date?: string } }).value?.date === '2026-09-01',
    );
    expect(stream.raw.slice(before)).toEqual([]);
    // Narrowed to the workspace they were REFUSED — their own workspace's
    // catch-up legitimately filled this socket with events, and that is the
    // positive control that keeps the emptiness below from being an idle
    // connection.
    expect(
      stream.frames.filter(
        (frame) => frame.type === 'event' && frame.envelope.workspaceId === read.world.workspaceId,
      ),
    ).toEqual([]);
    expect(
      stream.frames.filter(
        (frame) =>
          frame.type === 'event' && frame.envelope.workspaceId === read.neighbour.workspaceId,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('7.149 malformed frames are answered with bad-message, the socket keeps serving, and the refusals subscribe NOTHING', async () => {
    // From a QUIESCENT hub, for the same reason 7.153 waits for one: the
    // client's close and the server's release are a turn apart, so a count read
    // here without waiting is the previous case's release racing this case's
    // zero. The absolute numbers below are what make the refusals measurable on
    // their own.
    await waitFor(() => hub.stats().sockets === 0);
    const stream = await connect('member');
    const junk: Array<[string, string]> = [
      ['not json at all', 'not json at all'],
      ['a JSON scalar', '42'],
      ['an unknown frame type', JSON.stringify({ type: 'unsubscribe', workspaceId: read.world.workspaceId, afterSeq: 0 })],
      ['an unknown key', JSON.stringify({ type: 'subscribe', workspaceId: read.world.workspaceId, afterSeq: 0, replay: true })],
      ['a negative cursor', JSON.stringify({ type: 'subscribe', workspaceId: read.world.workspaceId, afterSeq: -1 })],
      // A prototype key: zod 3.25.76 parses `{"__proto__": …}` into `{}`
      // SUCCESSFULLY, so this reaches the schema as a frame with no `type` and
      // is refused for that; and `__proto__` as a workspace id is refused by
      // `ulidString` rather than becoming a lookup key anywhere.
      ['a prototype-polluting body', '{"__proto__":{"type":"subscribe"}}'],
      ['__proto__ as a workspace id', JSON.stringify({ type: 'subscribe', workspaceId: '__proto__', afterSeq: 0 })],
    ];
    for (const [label, payload] of junk) {
      const before = stream.frames.length;
      stream.sendRaw(payload);
      const error = await stream.next(
        (frame) => frame.type === 'error' && stream.frames.indexOf(frame) >= before,
      );
      expect({ label, frame: error }).toEqual({
        label,
        frame: {
          type: 'error',
          workspaceId: null,
          code: 'bad-message',
          message: expect.any(String),
        },
      });
      expect(stream.socket.readyState).toBe(stream.socket.OPEN);
    }
    // NOTHING was subscribed by any of the seven refusals — measured on the
    // refusals ALONE, before a single well-formed subscribe has been sent on
    // this connection. That ordering is the whole assertion. This case used to
    // read `hub.stats().subscriptions > 0` AFTER subscribing legitimately,
    // which the case's own good subscribe satisfied: MEASURED by mutating the
    // `!parsed.success` branch to call `hub.subscribe` with the frame's raw
    // `workspaceId`, that assertion killed nothing while the mutated path was
    // plainly running (it printed `subscribed`, `subscribed`,
    // `already-subscribed` ×3, `subscribed` — six executions, three distinct
    // Map keys). The property it owes is what keeps an unvalidated
    // actor-supplied string out of the hub's Map keys, and the hub validates
    // nothing itself: its header says the second Map is its own second defence
    // precisely because it trusts no caller.
    expect(hub.stats()).toEqual({ sockets: 0, subscriptions: 0, workspaces: 0 });

    // Still alive AND still serving — a socket that answered bad-message by
    // going deaf would pass every assertion above. This is also the positive
    // control for the three zeroes: the same hub, the same socket, one legal
    // frame, and all three move.
    stream.subscribe(read.world.workspaceId, 0);
    await stream.next((frame) => frame.type === 'caught-up');
    expect(hub.stats()).toEqual({ sockets: 1, subscriptions: 1, workspaces: 1 });
  });

  it('7.150 one connection multiplexes two workspaces with independent cursors, and a duplicate subscribe is refused without disturbing the first', async () => {
    // Nobody in the seeded world belongs to two workspaces — the `neighbour` is
    // deliberately somebody else's tenancy — so the owner founds a second one
    // through the product's own founding door rather than the world growing a
    // fixture every other Plan 5 suite would then be standing on.
    const founded = await read.app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: read.authOf('owner'),
      payload: { name: 'Second shop' },
    });
    expect(founded.statusCode).toBe(201);
    const secondWorkspaceId = (founded.json() as { workspaceId: string }).workspaceId;

    const stream = await connect('owner');
    stream.subscribe(read.world.workspaceId, 0);
    const first = await stream.next(
      (frame) => frame.type === 'caught-up' && frame.workspaceId === read.world.workspaceId,
    );
    stream.subscribe(secondWorkspaceId, 0);
    const second = await stream.next(
      (frame) => frame.type === 'caught-up' && frame.workspaceId === secondWorkspaceId,
    );
    // Two subscriptions, two cursors, demultiplexed by the workspace id each
    // frame names — and the cursors differ, so neither is the other's answer.
    expect(first).not.toEqual(second);
    expect(hub.stats().subscriptions).toBeGreaterThanOrEqual(2);
    // Every event frame on this socket belongs to one of the two, and the
    // seeded workspace's own ids never appear under the second workspace's
    // caught-up: the second workspace is brand new, so its catch-up is its
    // founding sequence and nothing else.
    const secondIndex = stream.frames.indexOf(second);
    const firstIndex = stream.frames.indexOf(first);
    const betweenTheTwo = stream.raw.slice(firstIndex + 1, secondIndex).join('\n');
    expect(betweenTheTwo).toContain(secondWorkspaceId);
    expect(betweenTheTwo).not.toContain(read.world.taskInEpicId);

    const before = stream.frames.length;
    stream.subscribe(read.world.workspaceId, 0);
    const duplicate = await stream.next(
      (frame) => frame.type === 'error' && stream.frames.indexOf(frame) >= before,
    );
    expect(duplicate).toEqual({
      type: 'error',
      workspaceId: read.world.workspaceId,
      code: 'already-subscribed',
      message: expect.any(String),
    });
    // The refusal did not re-run catch-up: still exactly one caught-up PER
    // WORKSPACE, which is the protocol's own rule (`stream-frames.ts`: a
    // subscribe's first drain ends with exactly one of caught-up or
    // scope-revoked, never both and never neither).
    expect(stream.frames.filter((frame) => frame.type === 'caught-up')).toHaveLength(2);
  });

  it('7.153 a closed socket leaves no subscription behind in the hub', async () => {
    // Absolute numbers, from a quiescent hub. `afterEach` closes the client's
    // end of every earlier socket, but the SERVER's release happens on its own
    // close event a turn later, so a relative baseline read here races that
    // release and is off by one at random. Waiting for zero is what makes the
    // reading a fact.
    await waitFor(() => hub.stats().sockets === 0);

    const stream = await connect('member');
    stream.subscribe(read.world.workspaceId, 0);
    await stream.next((frame) => frame.type === 'caught-up');
    // The positive control for the zeroes below: while the socket is open the
    // hub is holding all three, so "nothing held" afterwards is a release and
    // not a hub that never held anything.
    expect(hub.stats()).toEqual({ sockets: 1, subscriptions: 1, workspaces: 1 });

    await stream.close();
    openStreams.splice(openStreams.indexOf(stream), 1);
    await waitFor(() => hub.stats().sockets === 0);
    expect(hub.stats()).toEqual({ sockets: 0, subscriptions: 0, workspaces: 0 });
  });

  it('7.154 an entity BORN after caught-up arrives, though its per-entity seq is 1 and far below the cursor', async () => {
    const stream = await connect('member');
    stream.subscribe(read.world.workspaceId, 0);
    const caughtUp = asCaughtUp(await stream.next((frame) => frame.type === 'caught-up'));
    expect(caughtUp.seq).toBeGreaterThan(1);

    const freshId = newUlid();
    await submit(read.app, 'member', [
      {
        entity: { kind: 'ticket', id: freshId },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: read.world.projectId, parentId: null, title: 'Born after the cursor' },
      },
    ]);
    const born = asEvent(
      await stream.next((frame) => frame.type === 'event' && frame.envelope.entity.id === freshId),
    );
    // The plan pinned this as an `it.fails` "PINNED SERIES DEFECT". Task 14's
    // hub advances `sub.cursor` by `envelope.workspaceSeq`, which is what fixed
    // it, so the case is a passing `it` here rather than a pinned failure — and
    // this assertion is the proof: the ledger's per-entity counter for a brand
    // new entity is 1, far below the cursor catch-up left behind.
    expect(born.envelope.seq).toBe(1);
    expect(born.envelope.workspaceSeq).toBeGreaterThan(caughtUp.seq);
  });

  it('7.157 RECORDED, NOT FIXED: every frame satisfies the published schema except the envelopes whose entity ids this world seeds past the door', async () => {
    const stream = await connect('member');
    stream.subscribe(read.world.workspaceId, 0);
    await stream.next((frame) => frame.type === 'caught-up');

    // *Owner: whoever owns `test/helpers/read-scenario.ts` — Plan 5 Task 8's
    // shared world.* `eventEnvelopeSchema` requires a non-membership
    // `entity.id` to be a ULID, and the product's own founding sequence obeys
    // it (`bootstrap-workspace.ts` mints `newUlid()` for both the workflow and
    // every ticket type). The world seeds `wf-errands`, `epic`, `task` — fixed
    // ids that reach the ledger only because `makeCommitted` writes past the
    // envelope check — so those rows are a ledger no door would have admitted,
    // and the stream is the first surface that hands them back to a client. It
    // is NOT fixed here: four suites assert on `wf-errands` and `epic` by name,
    // and renaming a fixture to satisfy this task's schema check would make
    // this suite pass by rewriting what the others measure.
    //
    // What IS asserted is the BOUNDARY: every violation is that one class, so
    // this stays a known, bounded disagreement rather than a place any future
    // malformed frame can hide.
    expect(stream.schemaViolations.length).toBeGreaterThan(0);
    for (const violation of stream.schemaViolations) {
      expect(violation.issues).toEqual(['envelope.entity.id: must be a ULID']);
      const { envelope } = JSON.parse(violation.raw) as {
        envelope: { entity: { kind: string } };
      };
      expect(['workflow', 'ticket-type']).toContain(envelope.entity.kind);
    }
    // The positive control for that `toEqual`: the check CAN fire on something
    // else. A frame the world does not produce is fed through the same schema
    // and lands a different issue, so the loop above is a filter and not a
    // predicate that accepts everything.
    const forged = { type: 'caught-up', workspaceId: read.world.workspaceId, seq: -1 };
    expect(() => serverStreamFrameSchema.parse(forged)).toThrow();
  });

  it('7.155 the route is a WEBSOCKET route: a plain HTTP GET on the same path is 404 for a signed-in caller and 401 without a session', async () => {
    // The pin for a MEASURED silent-degradation trap: registering the plugin and
    // then declaring the route at the top level leaves `websocket: true`
    // unread, the route serving plain HTTP, and the upgrade ending in a 500
    // with no warning anywhere. `@fastify/websocket` replaces the HTTP handler
    // of a real websocket route with a 404 responder, so this status is
    // available only to the correct arrangement.
    const signedIn = await read.app.inject({
      method: 'GET',
      url: '/v1/stream',
      headers: read.authOf('member'),
    });
    expect(signedIn.statusCode).toBe(404);
    const anonymous = await read.app.inject({ method: 'GET', url: '/v1/stream' });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual(UNAUTHENTICATED_BODY);
  });
});

/**
 * The heartbeat and the connection budget stand on their OWN app, and both need
 * one that the shared read world cannot give them.
 *
 * The read world's clock is frozen at `SCENARIO_NOW` — a constant function — so
 * a staleness deadline computed against it is always zero and "a socket that
 * answers stays open" would pass for the wrong reason, forever. The budget
 * likewise needs a cap small enough to reach, and lowering the shared world's
 * would change what every other case in this file is standing on.
 *
 * Same database, second app: `buildTestApp` builds its own auth over the same
 * tables and the same secret, so sign-in works exactly as it does next door.
 */
type StreamApp = {
  app: FastifyInstance;
  port: number;
  hub: StreamHub;
  token(phone: string): Promise<string>;
  close(): Promise<void>;
};

async function buildStreamApp(overrides: {
  now?: () => Date;
  heartbeatMs?: number;
  maxSocketsPerUser?: number;
  schedule?: HeartbeatScheduler;
  onHeartbeat?: (event: HeartbeatEvent) => void;
  /** `AppDeps.pool` — the handle the route's membership check runs on. See 7.160. */
  pool?: Queryable;
}): Promise<StreamApp> {
  const { now, pool, ...stream } = overrides;
  const built = buildTestApp(db, { now, pool, stream });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  return {
    app: built.app,
    port: (built.app.server.address() as AddressInfo).port,
    hub: built.app.streamHub,
    token: async (phone) => (await signInWithPhone(built.app, built.otp, phone)).token,
    close: () => built.app.close(),
  };
}

/**
 * One macrotask boundary. NOT a sleep and not a settle: `setImmediate` runs
 * after the microtask queue has drained, so every `await` continuation already
 * queued has executed by the time this resolves. It is how 7.160 reads the hub
 * at a point strictly after a resumed `handleMessage` would have registered its
 * subscription, without waiting on a clock for it.
 */
const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * A `Queryable` that can take ONE membership read hostage.
 *
 * `resolveEffectiveRole`'s query is the suspension point the route's
 * close-during-subscribe race lives inside, and left to itself the race is
 * decided by whether Postgres answers before a TCP close handshake completes —
 * a coin the suite must not toss. This wrapper stands in for `AppDeps.pool`
 * (and nothing else: `db`, auth and ingest keep the real pool), spots the
 * membership statement by its `FROM proj_memberships`, and lets a case say
 * exactly when it may proceed, or that it must fail.
 */
type MembershipGate = {
  pool: Queryable;
  /**
   * Holds the NEXT membership read until `hook()` resolves, then runs the real
   * query. The returned promise resolves once that real query has SETTLED —
   * which is one microtask ahead of the route's own resumption, hence the
   * `turn()` every caller pairs it with.
   */
  once(hook: () => Promise<unknown>): Promise<void>;
  /** Makes the NEXT membership read throw, which is a SERVER fault. */
  fail(error: Error): Promise<void>;
};

function membershipGate(): MembershipGate {
  let intercept: ((run: () => Promise<unknown>) => Promise<unknown>) | null = null;
  const real = db.pool;
  const forward = (args: unknown[]): Promise<unknown> =>
    (real.query as unknown as (...rest: unknown[]) => Promise<unknown>).apply(real, args);
  const pool = {
    query(...args: unknown[]): Promise<unknown> {
      const first = args[0];
      const text = typeof first === 'string' ? first : (first as { text?: string } | null)?.text;
      if (intercept !== null && typeof text === 'string' && text.includes('FROM proj_memberships')) {
        const taken = intercept;
        intercept = null;
        return taken(() => forward(args));
      }
      return forward(args);
    },
  };
  return {
    pool: pool as unknown as Queryable,
    once(hook) {
      return new Promise<void>((resolve, reject) => {
        intercept = async (run) => {
          try {
            await hook();
            const result = await run();
            resolve();
            return result;
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        };
      });
    },
    fail(error) {
      return new Promise<void>((resolve) => {
        intercept = () => {
          resolve();
          return Promise.reject(error);
        };
      });
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition never became true');
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('WS /v1/stream — the heartbeat, driven by the injected clock', () => {
  it('7.151 a peer that answers survives the exact tick that terminates a peer that does not', async () => {
    const heartbeatMs = 30_000;
    let clockMs = 1_000_000;
    const ticks: Array<{ everyMs: number; tick: () => void }> = [];
    const beats: HeartbeatEvent[] = [];
    const beatWaiters: Array<{ kind: HeartbeatEvent['kind']; resolve: () => void }> = [];
    const server = await buildStreamApp({
      now: () => new Date(clockMs),
      heartbeatMs,
      schedule: (tick, everyMs) => {
        const entry = { tick, everyMs };
        ticks.push(entry);
        return {
          stop: () => {
            const index = ticks.indexOf(entry);
            if (index >= 0) ticks.splice(index, 1);
          },
        };
      },
      onHeartbeat: (event) => {
        beats.push(event);
        const index = beatWaiters.findIndex((waiter) => waiter.kind === event.kind);
        if (index >= 0) beatWaiters.splice(index, 1)[0]?.resolve();
      },
    });
    const nextBeat = (kind: HeartbeatEvent['kind']) =>
      new Promise<void>((resolve) => beatWaiters.push({ kind, resolve }));

    try {
      const token = await server.token('+911111111150');
      const headers = { authorization: `Bearer ${token}` };
      // ONE app, ONE clock, ONE tick list: the silent peer's death is what
      // makes the answering peer's survival mean anything, and they can only
      // be compared if the same tick reached both.
      // The silent peer holds a real SUBSCRIPTION before it goes quiet. Without
      // one, the hub's stats after the termination would be zero because they
      // were always zero, and the leak assertion at the end of this case would
      // be measuring nothing. The workspace is founded through the product's own
      // door on this app, since this app's database rows are the shared world's
      // but this user is nobody in it.
      const founded = await server.app.inject({
        method: 'POST',
        url: '/v1/workspaces',
        headers,
        payload: { name: 'Heartbeat shop' },
      });
      expect(founded.statusCode).toBe(201);
      const workspaceId = (founded.json() as { workspaceId: string }).workspaceId;

      const silent = await openStream(server.port, headers, { autoPong: false });
      silent.subscribe(workspaceId, 0);
      await silent.next((frame) => frame.type === 'caught-up');
      expect(server.hub.stats()).toEqual({ sockets: 1, subscriptions: 1, workspaces: 1 });
      const healthy = await openStream(server.port, headers);
      expect(ticks).toHaveLength(2);
      expect(ticks.every((entry) => entry.everyMs === heartbeatMs)).toBe(true);

      const tickAll = () => {
        for (const entry of [...ticks]) entry.tick();
      };

      // Tick 1 at +1× the interval: both are pinged, neither is past the
      // deadline. The healthy peer's `ws` answers automatically; the silent one
      // was opened with `autoPong: false` and says nothing.
      clockMs += heartbeatMs;
      const firstPong = nextBeat('pong');
      tickAll();
      await firstPong;
      expect(silent.pings).toBe(1);
      expect(healthy.pings).toBe(1);

      // Tick 2 at +2×: still not past a deadline of "more than two intervals",
      // so a SECOND ping goes out to the peer that has answered nothing. This
      // tick is what the plan's own implementation fails — it clears its
      // `alive` flag on the same tick it pings, so ONE unanswered ping is
      // fatal and this peer would already be gone, having been pinged once.
      clockMs += heartbeatMs;
      const secondPong = nextBeat('pong');
      tickAll();
      await secondPong;
      expect(silent.pings).toBe(2);
      expect(silent.socket.readyState).toBe(silent.socket.OPEN);

      // Tick 3 at +3×. THE DISCRIMINATOR: the silent peer has been quiet for
      // three intervals and is terminated; the healthy one's last pong was one
      // interval ago and it survives the very same tick.
      clockMs += heartbeatMs;
      tickAll();
      const closed = await silent.closed;
      // 1006 — terminated, so no close frame was ever sent. That is
      // `StreamSocket.terminate()`, and this is its only caller.
      expect(closed.code).toBe(1006);
      expect(beats.filter((beat) => beat.kind === 'timeout')).toHaveLength(1);
      expect(healthy.socket.readyState).toBe(healthy.socket.OPEN);
      expect(healthy.pings).toBe(3);

      // …and it keeps surviving, so "still open" is not "not killed yet".
      clockMs += heartbeatMs;
      const thirdPong = nextBeat('pong');
      tickAll();
      await thirdPong;
      expect(healthy.socket.readyState).toBe(healthy.socket.OPEN);

      // The terminated peer left nothing behind — its tick is gone from the
      // scheduler, so a timed-out socket cannot go on being pinged forever, and
      // the hub is holding none of its subscription either. `terminate()` sends
      // no close frame, so this is the path where a leak is most plausible: it
      // works because `ws` still emits `close` locally and teardown runs on it.
      expect(ticks).toHaveLength(1);
      await waitFor(() => server.hub.stats().sockets === 0);
      expect(server.hub.stats()).toEqual({ sockets: 0, subscriptions: 0, workspaces: 0 });
      await healthy.close();
    } finally {
      await server.close();
    }
  });

  it('7.152 the connection budget is per USER: one caller is capped, another caller is untouched, and closing a socket gives the budget back', async () => {
    const server = await buildStreamApp({ maxSocketsPerUser: 2 });
    try {
      const aToken = await server.token('+911111111151');
      const bToken = await server.token('+911111111152');
      const a = { authorization: `Bearer ${aToken}` };
      const b = { authorization: `Bearer ${bToken}` };

      const first = await openStream(server.port, a);
      const second = await openStream(server.port, a);

      const refused = await refusedStream(server.port, a);
      expect(refused.statusCode).toBe(429);
      expect(JSON.parse(refused.body)).toEqual(TOO_MANY_CONNECTIONS_BODY);

      // The control that catches a budget keyed on `undefined` — one shared
      // global bucket refuses everyone past N while still looking like a cap.
      const other = await openStream(server.port, b);
      expect(other.socket.readyState).toBe(other.socket.OPEN);

      // And the budget is returned, so it bounds CONCURRENCY rather than
      // counting a user's connections for the life of the process.
      await first.close();
      const again = await openStream(server.port, a);
      expect(again.socket.readyState).toBe(again.socket.OPEN);

      await Promise.all([second.close(), other.close(), again.close()]);
    } finally {
      await server.close();
    }
  });

  it('7.161 the PRODUCTION scheduler ticks, stops, and does not hold the process open', () => {
    // The gate's blind spot until this case: `realScheduler` is what every app
    // that injects nothing runs on — which is every app that ships and most of
    // the ones in this suite — and NOTHING had ever made it tick. The default
    // heartbeat is 30 s, no test may wait on a clock, and 7.151 proves the
    // heartbeat's arithmetic against an INJECTED substitute, so the seam looked
    // covered while the default behind it was not. Deleting the `setInterval`
    // and returning a no-op timer reddened nothing before this.
    //
    // Fake timers, not a wait: `vi.advanceTimersByTime` moves the timer wheel
    // by hand. No socket I/O happens inside this window — `TestStream.next`'s
    // own 5 s guard is a `setTimeout` and would be advanced along with
    // everything else.
    const fired: number[] = [];
    vi.useFakeTimers();
    try {
      const timer = realScheduler(() => fired.push(fired.length), 30_000);
      vi.advanceTimersByTime(29_999);
      // Not merely "it fired eventually": it fires on the interval it was
      // given, so a scheduler that ignored `everyMs` fails here.
      expect(fired).toHaveLength(0);
      vi.advanceTimersByTime(1);
      expect(fired).toHaveLength(1);
      // REPEATING, not one-shot — a `setTimeout` in this position would pass
      // every assertion above and then stop pinging a live peer forever.
      vi.advanceTimersByTime(90_000);
      expect(fired).toHaveLength(4);

      timer.stop();
      vi.advanceTimersByTime(300_000);
      // The positive control for that stop is the four ticks above: the same
      // rig, the same clock, ten intervals of it, and nothing more arrives.
      expect(fired).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }

    // And the `unref`, which no fake timer can answer: an unref'd handle is
    // absent from `process.getActiveResourcesInfo()`, so a heartbeat left
    // running cannot be the reason a process refuses to exit. A bare
    // `setInterval` beside it is the control that the probe can see a timer at
    // all — without it "no new Timeout" is indistinguishable from a probe that
    // never reports one.
    const before = process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
    const scheduled = realScheduler(() => {}, 30_000);
    const afterScheduler = process
      .getActiveResourcesInfo()
      .filter((kind) => kind === 'Timeout').length;
    const control = setInterval(() => {}, 30_000);
    const afterControl = process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
    clearInterval(control);
    scheduled.stop();
    expect(afterScheduler).toBe(before);
    expect(afterControl).toBe(before + 1);
  });

  it('7.156 an oversized frame is refused by the payload bound rather than buffered', async () => {
    const server = await buildStreamApp({});
    try {
      const token = await server.token('+911111111153');
      const stream = await openStream(server.port, { authorization: `Bearer ${token}` });
      stream.sendRaw('x'.repeat(64 * 1024));
      const closed = await stream.closed;
      // 1009 `Message Too Big` is `ws`'s own answer to `maxPayload`, not one of
      // `STREAM_CLOSE_CODES` — the protocol's three codes are Task 14's and are
      // pinned there. What this case proves is that the bound is SET: without
      // `maxPayload` the default is 100 MB, and a frame this size is buffered,
      // parsed and answered `bad-message` instead.
      expect(closed.code).toBe(1009);
    } finally {
      await server.close();
    }
  });
});

/**
 * What happens on the far side of the ONE suspension point `handleMessage` has,
 * and on the path where the server itself is what went wrong.
 *
 * Both need `AppDeps.pool` to be a thing the case controls, which is what
 * `membershipGate` is for; neither can be reached from the shared read world,
 * whose pool is the real one and whose sockets other cases are standing on.
 */
describe('WS /v1/stream — the membership round trip the socket can disappear across', () => {
  it('7.160 a socket that closes DURING the membership check leaves NO orphan subscription — the subscribe that resumes afterwards is refused', async () => {
    // A LIVE BUG on unmodified source, not a test gap. `handleMessage` suspends
    // at `resolveEffectiveRole` and calls `hub.subscribe` after it. A `close`
    // delivered inside that window runs `teardown` — which stops the heartbeat,
    // hands the connection-budget slot back and calls `dropSocket` on a hub
    // holding nothing yet — and the suspended handler then subscribes anyway.
    // Nothing can ever drop what it registered: the socket is gone, so no
    // second `close` fires. And because the budget slot was already returned,
    // the per-user cap bounds the leak at ZERO — one member can repeat it
    // indefinitely, and every orphan costs a full ledger scan on every
    // subsequent commit to that workspace.
    //
    // 7.153 cannot see it, and the reason is exactly what this case had to
    // invert: 7.153 awaits `caught-up` before closing, and that ordering is
    // what closes the window. Here the close is sent in the same breath as the
    // subscribe, with nothing awaited in between.
    const gate = membershipGate();
    // A cap far above what this case opens: the budget is 7.152's subject, and
    // ten sequential sockets whose server-side release lags the client's close
    // would otherwise make THIS case fail for that unrelated reason.
    const server = await buildStreamApp({ pool: gate.pool, maxSocketsPerUser: 64 });
    try {
      const token = await server.token('+911111111154');
      const headers = { authorization: `Bearer ${token}` };
      const founded = await server.app.inject({
        method: 'POST',
        url: '/v1/workspaces',
        headers,
        payload: { name: 'Race shop' },
      });
      expect(founded.statusCode).toBe(201);
      const workspaceId = (founded.json() as { workspaceId: string }).workspaceId;

      // The POSITIVE CONTROL, on this rig, before anything is claimed empty: a
      // subscribe allowed to finish registers all three. Every zero below is
      // therefore a refusal and not a rig that could never have subscribed
      // anything — the `membershipGate` in front of the pool included.
      const control = await openStream(server.port, headers);
      control.subscribe(workspaceId, 0);
      await control.next((frame) => frame.type === 'caught-up');
      expect(server.hub.stats()).toEqual({ sockets: 1, subscriptions: 1, workspaces: 1 });
      await control.close();
      await waitFor(() => server.hub.stats().sockets === 0);

      // ── The shape the bug takes in the wild: subscribe and close in the SAME
      // breath, ten times. Whether any given cycle lands inside the window is a
      // race, so this half is the realistic reproduction rather than the proof;
      // the forced half below is the proof.
      for (let cycle = 0; cycle < 10; cycle += 1) {
        const stream = await openStream(server.port, headers);
        stream.subscribe(workspaceId, 0);
        await stream.close();
      }
      // Every chance to settle, and then the claim. The `catch` is deliberate:
      // a hub still holding a socket here is holding it FOREVER, and the
      // assertion below says so by name and prints the leak, where the bare
      // wait would only report that a predicate never came true.
      await waitFor(() => server.hub.stats().sockets === 0).catch(() => undefined);
      await turn();
      expect(server.hub.stats()).toEqual({ sockets: 0, subscriptions: 0, workspaces: 0 });

      // ── The same race, DECIDED rather than run. The membership read is held
      // until the client's close handshake has completed, which is strictly
      // after the server socket received the close frame and answered it — so
      // the transport is at least CLOSING when the handler resumes, every time.
      const forced = await openStream(server.port, headers);
      const settled = gate.once(() => forced.closed);
      forced.subscribe(workspaceId, 0);
      await forced.close();
      await settled;
      // `settled` resolves one microtask ahead of the route's own resumption,
      // and everything between that resumption and a registered subscription is
      // microtasks — two `await` continuations and then `hub.subscribe`'s
      // synchronous insert into `bySocket`/`byWorkspace`. One macrotask
      // boundary is therefore strictly after the orphan would exist. This is
      // NOT a settle interval and must not be turned into one.
      await turn();
      expect(server.hub.stats()).toEqual({ sockets: 0, subscriptions: 0, workspaces: 0 });
    } finally {
      await server.close();
    }
  });

  it('7.162 a SERVER fault closes 1011, the way the hub closes 1011 — it is not answered as if the client sent something wrong', async () => {
    // `bad-message` says "you sent something wrong" and the client's only
    // sensible response to it is to stop sending that frame. A throw inside
    // `handleMessage` is the opposite fault, and the hub next door already
    // answers that class by closing `STREAM_CLOSE_CODES.internalError`. The two
    // now agree, and the enum is untouched: `STREAM_ERROR_CODES` is the
    // protocol Plans 6, 9 and 10 mock, and inventing a fourth code to describe
    // a condition that already has a close code would be a protocol change made
    // to avoid a close.
    const gate = membershipGate();
    const server = await buildStreamApp({ pool: gate.pool });
    try {
      const token = await server.token('+911111111155');
      const headers = { authorization: `Bearer ${token}` };
      const founded = await server.app.inject({
        method: 'POST',
        url: '/v1/workspaces',
        headers,
        payload: { name: 'Fault shop' },
      });
      expect(founded.statusCode).toBe(201);
      const workspaceId = (founded.json() as { workspaceId: string }).workspaceId;

      // The CLIENT fault, on its own socket, as the control that keeps the
      // close below from being "this route closes on everything": a genuinely
      // malformed frame is still answered `bad-message` and the socket lives.
      const clientFault = await openStream(server.port, headers);
      clientFault.sendRaw('not json at all');
      const answered = await clientFault.next((frame) => frame.type === 'error');
      expect(answered).toEqual({
        type: 'error',
        workspaceId: null,
        code: 'bad-message',
        message: expect.any(String),
      });
      expect(clientFault.socket.readyState).toBe(clientFault.socket.OPEN);
      await clientFault.close();

      // The SERVER fault: the membership read throws, which is nothing the
      // client did and nothing the client can fix.
      const serverFault = await openStream(server.port, headers);
      const thrown = gate.fail(new Error('membership read exploded'));
      serverFault.subscribe(workspaceId, 0);
      await thrown;
      const closed = await serverFault.closed;
      expect(closed.code).toBe(1011);
      expect(closed.reason).toBe('stream-error');
      // And NOT as a client fault: no `bad-message` frame was sent on the way.
      expect(serverFault.frames).toEqual([]);
      // Which leaves nothing behind either — the close ran teardown.
      await waitFor(() => server.hub.stats().sockets === 0).catch(() => undefined);
      expect(server.hub.stats()).toEqual({ sockets: 0, subscriptions: 0, workspaces: 0 });
    } finally {
      await server.close();
    }
  });
});
