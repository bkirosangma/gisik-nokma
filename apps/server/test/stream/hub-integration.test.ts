import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { createStreamHub } from '../../src/stream/hub.js';
import { readStreamSeq } from '../../src/sync/stream-seq.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { resetTestSequences, testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { applyAll, seedMember, seedTicket } from '../helpers/seed.js';
import { fakeSocket, frameIds, type FakeSocket } from '../helpers/stream-socket.js';

/**
 * Plan 5 Task 14 — the hub against a REAL database and the REAL
 * `visibleEventsFor`.
 *
 * ## Why this file exists beside `hub.test.ts`
 *
 * A subscription hub is a fan-out, and a fan-out is a disclosure surface: every
 * read route on this branch answered one caller's question, and this is the
 * first thing that decides who ELSE hears about a change. `hub.test.ts` scripts
 * the visibility filter, so it can prove which subscriber a drain is run for
 * and nothing at all about whether the drain was right. The claim that carries
 * the weight — *a frame never reaches a subscriber who must not see its
 * subject* — is only worth something when the real filter runs against real
 * projections. That is this file.
 *
 * It is also the answer to the second thing this task is on the floor list for.
 * Plans 6, 9 and 10 will mock this protocol, and a field that exists only in a
 * TYPE is a field a mock can fake and the server can quietly fail to produce.
 * So every frame here is written by the real server out of real ledger rows,
 * and `fakeSocket` re-parses each one through `serverStreamFrameSchema` on the
 * way in. `envelope.workspaceSeq` in particular is asserted against the value
 * the ledger assigned, because it is the resume cursor and it is the one field
 * a hand-written fake has nothing true to put in.
 *
 * ## Two residuals this file PINS rather than fixes
 *
 * 1. `caught-up.seq` is the position of the last envelope YIELDED to that
 *    subscriber, which is not the workspace high-water `readStreamSeq` reports
 *    whenever the newest events are invisible to them. A client that took its
 *    bootstrap cursor from one and its resume cursor from the other would
 *    re-request the gap forever. *Owner: Plan 10 (bootstrap and the resume
 *    protocol).* The case below measures the disagreement rather than asserting
 *    it away.
 * 2. `scope-revoked` ends the subscription, and a guest re-granted inside the
 *    same window therefore stops receiving a tail they could legitimately have
 *    kept receiving. That is deliberate — the instruction says "empty this
 *    scope", and the client's correct next move is a bootstrap, not more tail
 *    — and it is what bounds the instruction for an ex-member. See `hub.ts`.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  // `events` is append-only and refuses TRUNCATE, so every test mints its own
  // workspace; the projections rebuild and are emptied here.
  await db.pool.query('TRUNCATE proj_visibility');
  await db.pool.query('TRUNCATE proj_memberships');
  await db.pool.query('TRUNCATE proj_projects');
  resetTestSequences();
});

/** Into the ledger AND the projections, the way ingest does. */
async function record(env: LedgerEvent): Promise<LedgerEvent> {
  await appendTestEvent(db.pool, env);
  await applyAll(db.pool, [env]);
  return env;
}

function ticketEvent(
  workspaceId: string,
  ticketId: string,
  body: string,
  actorId: string,
): LedgerEvent {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'comment.added',
    payload: { body },
    actorId,
  });
}

function revocationEnv(workspaceId: string, userId: string): LedgerEvent {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
    type: 'membership.revoked',
    payload: { userId },
    actorId: newUlid(),
  });
}

/**
 * A hub over the real filter, with the commit feed driven by hand — `ingest`
 * would add a second moving part without adding a fact, since what the hub
 * consumes is one `LedgerEvent` per commit and nothing about how it got there.
 */
function realHub() {
  let listener: ((event: LedgerEvent) => void) | undefined;
  const hub = createStreamHub({
    pool: db.pool,
    onEventCommitted: (fn) => {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
  });
  return { hub, commit: (event: LedgerEvent) => listener?.(event) };
}

const eventFrames = (socket: FakeSocket): LedgerEvent[] =>
  socket.frames.flatMap((f) => (f.type === 'event' ? [f.envelope] : []));

describe('stream hub over the real visibility filter', () => {
  it('7.32 filters the fan-out PER SUBSCRIBER on both the catch-up and the live path', async () => {
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const insider = newUlid();
    const outsider = newUlid();
    const shared = newUlid();
    const withheld = newUlid();
    // Two members of ONE workspace with genuinely different slices of it: both
    // are on `mine`, only `insider` is on `theirs`. Without this the whole
    // per-subscriber claim would be untestable — a hub with a single hardcoded
    // viewer answers identically when everyone sees everything.
    await seedMember(db.pool, ws, insider, 'member', [
      { projectId: mine },
      { projectId: theirs },
    ]);
    await seedMember(db.pool, ws, outsider, 'member', [{ projectId: mine }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: shared });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: withheld });

    const onShared = await record(ticketEvent(ws, shared, 'everyone', insider));
    const onWithheld = await record(ticketEvent(ws, withheld, 'not everyone', insider));

    const { hub, commit } = realHub();
    const insiderSocket = fakeSocket();
    const outsiderSocket = fakeSocket();
    await hub.subscribe(insider, insiderSocket, ws, 0);
    await hub.subscribe(outsider, outsiderSocket, ws, 0);

    const insiderIds = frameIds(insiderSocket);
    const outsiderIds = frameIds(outsiderSocket);
    // The positive control sits in the same test and over the same range:
    // `outsider` is not starved, they receive the shared ticket's event. So the
    // absence below is the visibility predicate answering, not an empty stream.
    expect(insiderIds).toContain(onShared.id);
    expect(outsiderIds).toContain(onShared.id);
    expect(insiderIds).toContain(onWithheld.id);
    expect(outsiderIds).not.toContain(onWithheld.id);
    // Not merely the payload: the withheld TICKET's id must not appear in any
    // field of any frame that reached the outsider.
    expect(JSON.stringify(outsiderSocket.frames)).not.toContain(withheld);

    // The live path is the same drain, and this is where a hub that filtered
    // catch-up and broadcast the tail would come apart — every assertion above
    // would still pass.
    const liveWithheld = await record(ticketEvent(ws, withheld, 'still not everyone', insider));
    const liveShared = await record(ticketEvent(ws, shared, 'still everyone', insider));
    commit(liveWithheld);
    commit(liveShared);
    await hub.settled();

    expect(frameIds(insiderSocket)).toEqual(
      expect.arrayContaining([liveWithheld.id, liveShared.id]),
    );
    expect(frameIds(outsiderSocket)).toContain(liveShared.id);
    expect(frameIds(outsiderSocket)).not.toContain(liveWithheld.id);
    expect(JSON.stringify(outsiderSocket.frames)).not.toContain(withheld);

    // Every field of the event frame came off a real ledger row, `workspaceSeq`
    // included — the resume cursor, assigned inside the appending transaction
    // and the one field a mock has nothing true to put in.
    const delivered = eventFrames(outsiderSocket).find((e) => e.id === liveShared.id);
    expect(delivered).toBeDefined();
    expect(delivered?.workspaceSeq).toBe(liveShared.workspaceSeq);
    expect(delivered?.serverTime).toBe(liveShared.serverTime);
    expect(delivered?.actorId).toBe(insider);
    hub.close();
  });

  it('7.32 caught-up carries the last position YIELDED to that subscriber, which can lag the workspace high-water', async () => {
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const viewer = newUlid();
    const witness = newUlid();
    const seen = newUlid();
    const unseen = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: mine }]);
    await seedMember(db.pool, ws, witness, 'member', [{ projectId: theirs }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: seen });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: unseen });

    const lastVisible = await record(ticketEvent(ws, seen, 'mine', viewer));
    // The trailing events are invisible to `viewer`, which is what makes the
    // two numbers disagree. A fixture whose last event was visible to everyone
    // would let a hub reporting the high-water pass.
    const highWaterEvent = await record(ticketEvent(ws, unseen, 'not mine', witness));

    const { hub } = realHub();
    const socket = fakeSocket();
    await hub.subscribe(viewer, socket, ws, 0);

    const caughtUp = socket.frames.filter((f) => f.type === 'caught-up');
    expect(caughtUp).toEqual([
      { type: 'caught-up', workspaceId: ws, seq: lastVisible.workspaceSeq },
    ]);
    const highWater = await readStreamSeq(db.pool, ws);
    expect(highWater).toBe(highWaterEvent.workspaceSeq);
    // Pinned, not asserted away: the resume cursor a subscriber is handed here
    // and the bootstrap cursor `readStreamSeq` answers are DIFFERENT numbers
    // whenever the newest events are invisible to them. *Owner: Plan 10.*
    expect(caughtUp[0]).not.toEqual({ type: 'caught-up', workspaceId: ws, seq: highWater });
    hub.close();
  });

  it('7.32 a stranger to the workspace is told nothing but their own cursor back', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const member = newUlid();
    const stranger = newUlid();
    const ticket = newUlid();
    await seedMember(db.pool, ws, member, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: ticket });
    const live = await record(ticketEvent(ws, ticket, 'members only', member));

    const { hub, commit } = realHub();
    const strangerSocket = fakeSocket();
    const memberSocket = fakeSocket();
    await hub.subscribe(stranger, strangerSocket, ws, 3);
    await hub.subscribe(member, memberSocket, ws, 0);

    // The cursor comes straight back — the hub invented no number, and told
    // them nothing about how far the workspace has actually got.
    expect(strangerSocket.frames).toEqual([{ type: 'caught-up', workspaceId: ws, seq: 3 }]);
    // The control that separates "nothing to send" from "sends nothing": the
    // same workspace, over a range that is very much non-empty for a member.
    expect(frameIds(memberSocket)).toContain(live.id);

    const after = await record(ticketEvent(ws, ticket, 'still members only', member));
    commit(after);
    await hub.settled();
    expect(strangerSocket.frames).toHaveLength(1);
    expect(strangerSocket.closes).toEqual([]);
    expect(frameIds(memberSocket)).toContain(after.id);
    hub.close();
  });

  it('7.32 a narrowing that lands MID-SUBSCRIPTION reaches the subscriber as purge frames', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const witness = newUlid();
    const ticket = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedMember(db.pool, ws, witness, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: ticket });
    const held = await record(ticketEvent(ws, ticket, 'while I could see it', viewer));

    const { hub, commit } = realHub();
    const socket = fakeSocket();
    const witnessSocket = fakeSocket();
    await hub.subscribe(viewer, socket, ws, 0);
    await hub.subscribe(witness, witnessSocket, ws, 0);
    expect(frameIds(socket)).toContain(held.id);

    // Taken off the project inside the open subscription. They are still in
    // the workspace, so they are answered with an ITEMISED purge rather than a
    // scope instruction, and the subscription lives on.
    //
    // The first fixture here revoked and re-granted at `member` and produced no
    // purge at all. That was a missing fixture, not a hub defect: a revocation
    // deletes the workspace-scope row and leaves the project row standing, so
    // the re-granted member was still on the project and had lost nothing.
    // `project.member_removed` is the boundary that actually narrows.
    const removal = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'project', id: prj },
        type: 'project.member_removed',
        payload: { userId: viewer },
        actorId: newUlid(),
      }),
    );
    commit(removal);
    await hub.settled();

    // A ticket they held a moment ago is retracted, by id, over the open
    // socket — the whole point of the instruction existing.
    expect(frameIds(socket)).toContain(`purge:${ticket}`);
    // The roster event itself travels too — they are still inside the workspace
    // — which is the positive control that this drain ran and yielded.
    expect(frameIds(socket)).toContain(removal.id);
    // And the narrowing really narrowed: the next event about that ticket does
    // not arrive, while the witness — same workspace, same commit — gets it.
    const afterNarrowing = await record(ticketEvent(ws, ticket, 'after', witness));
    commit(afterNarrowing);
    await hub.settled();
    expect(frameIds(witnessSocket)).toContain(afterNarrowing.id);
    expect(frameIds(socket)).not.toContain(afterNarrowing.id);
    expect(socket.closes).toEqual([]);
    hub.close();
  });

  it('7.32 an ex-member is told the scope went ONCE, and the subscription ends there', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const witness = newUlid();
    const ticket = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedMember(db.pool, ws, witness, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: ticket });
    const held = await record(ticketEvent(ws, ticket, 'while I was here', viewer));

    const { hub, commit } = realHub();
    const socket = fakeSocket();
    const witnessSocket = fakeSocket();
    await hub.subscribe(viewer, socket, ws, 0);
    await hub.subscribe(witness, witnessSocket, ws, 0);
    expect(frameIds(socket)).toContain(held.id);
    expect(hub.stats()).toEqual({ sockets: 2, subscriptions: 2, workspaces: 1 });

    const revoked = await record(revocationEnv(ws, viewer));
    commit(revoked);
    await hub.settled();
    expect(frameIds(socket)).toContain(`scope-revoked:${ws}`);
    // Not the revoking event itself, and not a ticket list: an ex-member is
    // answered at scope level or not at all (`visible-events-for.ts`, 6.100).
    expect(frameIds(socket)).not.toContain(revoked.id);
    expect(JSON.stringify(socket.frames.slice(-1))).not.toContain(ticket);

    // ONCE. Their cursor cannot advance — the filter yields them nothing that
    // carries one — so without a terminal subscription every later commit in
    // this workspace would re-scan the ledger and re-send the instruction,
    // metering a workspace they are no longer in. Two more commits, and the
    // witness receiving both is what proves the feed is live rather than idle.
    const frozen = socket.frames.length;
    const next = await record(ticketEvent(ws, ticket, 'after they left', witness));
    const later = await record(ticketEvent(ws, ticket, 'and again', witness));
    commit(next);
    commit(later);
    await hub.settled();
    expect(socket.frames).toHaveLength(frozen);
    expect(frameIds(witnessSocket)).toEqual(expect.arrayContaining([next.id, later.id]));
    // The connection is not punished for the revocation, and the hub is not
    // holding the dead subscription.
    expect(socket.closes).toEqual([]);
    expect(hub.stats()).toEqual({ sockets: 1, subscriptions: 1, workspaces: 1 });
    hub.close();
    expect(hub.stats()).toEqual({ sockets: 0, subscriptions: 0, workspaces: 0 });
  });
});
