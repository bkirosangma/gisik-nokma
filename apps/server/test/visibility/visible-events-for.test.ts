import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { canSee } from '../../src/visibility/can-see.js';
import { visibleEventsFor, type SyncItem } from '../../src/visibility/visible-events-for.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { applyAll, seedGuest, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed.js';

/**
 * Plan 4 Task 11 — `visibleEventsFor`, the sync-down visibility filter.
 *
 * ## Why every exclusion here carries a positive control in the same test
 *
 * A generator's tests pass by never generating the interesting case. "No event
 * about an invisible ticket is yielded" is VACUOUSLY TRUE against a fixture
 * with no invisible ticket in it, and equally true against a filter that yields
 * nothing at all. So every `not.toContain` below sits beside a `toContain` over
 * the same call: something IS yielded, and it is the thing that should be.
 * Without that pairing the whole file would go green against `yield* []`.
 *
 * ## The stakes are one-way
 *
 * An event yielded to a replica is on a device the server does not control. No
 * later fix retrieves it. So the failures this file is built against are, in
 * order: an event about a ticket the viewer cannot see; the ticket's ID leaking
 * in an envelope field while its payload is withheld (the existence oracle case
 * 6.12 closed at the read door); and a tombstone that never arrives, which
 * leaves the data on the device forever.
 *
 * ## Fixture rules this file obeys
 *
 * Every id is a ULID — `ticketCreatedPayload.projectId`, the membership
 * payloads' `userId` and `visibilitySetPayload.userIds` are all `ulidString`,
 * and the plan text's `wks_01` / `tkt_1` fixtures throw at the parse. Every
 * test mints its OWN workspace, because `events` is append-only and refuses
 * TRUNCATE, so one test's ledger rows outlive it; the filter's
 * `workspace_id = $1` clause is what keeps them apart.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  // The projections are rebuildable and truncate; `events` does not, which is
  // why each test mints a fresh workspace id above.
  await db.pool.query('TRUNCATE proj_visibility');
  await db.pool.query('TRUNCATE proj_memberships');
  await db.pool.query('TRUNCATE proj_projects');
});

/** Seed an event into BOTH the ledger and the projections, the way ingest does. */
async function record(env: LedgerEvent): Promise<LedgerEvent> {
  await appendTestEvent(db.pool, env);
  await applyAll(db.pool, [env]);
  return env;
}

/** `afterSeq` is the WORKSPACE cursor (coordination §18), never a per-entity seq. */
async function collect(userId: string, workspaceId: string, afterSeq = 0): Promise<SyncItem[]> {
  const items: SyncItem[] = [];
  for await (const item of visibleEventsFor(db.pool, userId, workspaceId, afterSeq)) {
    items.push(item);
  }
  return items;
}

function idsOf(items: readonly SyncItem[]): string[] {
  return items.map((item) =>
    'kind' in item
      ? item.kind === 'purge'
        ? `purge:${item.entityId}`
        : `scope-revoked:${item.projectId ?? item.workspaceId}`
      : item.id,
  );
}

function ticketEvent(
  workspaceId: string,
  type: string,
  ticketId: string,
  payload: unknown,
  actorId: string,
): LedgerEvent {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type,
    payload,
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

describe('visibleEventsFor — what reaches a replica', () => {
  it('6.16 never yields an event about a ticket the MEMBER cannot see, and the id itself does not travel', async () => {
    const ws = newUlid();
    const mine = newUlid();
    const other = newUlid();
    const viewer = newUlid();
    const hidden = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: mine }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: newUlid() });
    const visibleTicket = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: visibleTicket });
    await seedTicket(db.pool, { workspaceId: ws, projectId: other, ticketId: hidden });

    const seen = await record(ticketEvent(ws, 'ticket.transitioned', visibleTicket, { to: 'doing' }, viewer));
    await record(ticketEvent(ws, 'ticket.transitioned', hidden, { to: 'done' }, newUlid()));

    const items = await collect(viewer, ws);
    // The positive control: without it, `yield* []` passes the next assertion.
    expect(idsOf(items)).toContain(seen.id);
    // Not "the payload is absent" — the ID ITSELF must not appear in ANY field
    // of ANY yielded item. An envelope that named the ticket and withheld the
    // body would still disclose that it exists.
    expect(JSON.stringify(items)).not.toContain(hidden);
  });

  it('6.16 the same rule for a GUEST: only the ticket an explicit list names them in', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const guest = newUlid();
    const shared = newUlid();
    const hidden = newUlid();
    await seedGuest(db.pool, ws, guest);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: shared });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: hidden });
    await applyAll(db.pool, [setVisibilityEnv(ws, shared, 'explicit', [guest])]);

    const seen = await record(ticketEvent(ws, 'comment.added', shared, { body: 'for you' }, newUlid()));
    await record(ticketEvent(ws, 'comment.added', hidden, { body: 'not for you' }, newUlid()));

    const items = await collect(guest, ws);
    expect(idsOf(items)).toContain(seen.id);
    expect(JSON.stringify(items)).not.toContain(hidden);
  });

  it('6.17 revocation by visibility.set yields a purge tombstone INSTEAD of the event', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const ticket = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: ticket });
    // Held by this member a moment ago — the control that makes the purge mean
    // something: there was something on the device to take away.
    expect(await canSee(db.pool, viewer, ticket)).toBe(true);

    const revoke = await record(setVisibilityEnv(ws, ticket, 'explicit', [newUlid()]));

    expect(await canSee(db.pool, viewer, ticket)).toBe(false);
    // Exactly the tombstone, and NOT the visibility.set event itself — that
    // event is about a ticket this viewer may no longer see.
    expect(await collect(viewer, ws, revoke.workspaceSeq - 1)).toEqual([
      { kind: 'purge', entityId: ticket },
    ]);
  });

  it('6.17 an ancestor revocation purges the whole INHERITING subtree, and 6.90 leaves an authored one standing', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const parent = newUlid();
    const child = newUlid();
    const grandchild = newUlid();
    const authored = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parent });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: child, parentId: parent });
    await seedTicket(db.pool, {
      workspaceId: ws,
      projectId: prj,
      ticketId: grandchild,
      parentId: child,
    });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: authored, parentId: parent });
    // `authored` decides for itself, so nothing above it can change its audience.
    await applyAll(db.pool, [setVisibilityEnv(ws, authored, 'workspace')]);

    const revoke = await record(setVisibilityEnv(ws, parent, 'explicit', [newUlid()]));

    const items = await collect(viewer, ws, revoke.workspaceSeq - 1);
    // TWO levels of inheritance, so a walk that stopped at the direct children
    // would drop `grandchild` and leave it on the device forever.
    expect(idsOf(items).sort()).toEqual(
      [`purge:${parent}`, `purge:${child}`, `purge:${grandchild}`].sort(),
    );
    // The positive control for the prune: `authored` is still VISIBLE, so
    // purging it would have deleted a ticket this member may still read.
    expect(await canSee(db.pool, viewer, authored)).toBe(true);
    expect(idsOf(items)).not.toContain(`purge:${authored}`);
  });

  it('6.17 a REPARENT under an unreachable parent purges the moved subtree; a reparent that keeps it visible purges nothing', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const unreachable = newUlid();
    const openParent = newUlid();
    const moved = newUlid();
    const movedChild = newUlid();
    const staysPut = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: unreachable });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: openParent });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: moved });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: movedChild, parentId: moved });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: staysPut });
    await applyAll(db.pool, [setVisibilityEnv(ws, unreachable, 'explicit', [newUlid()])]);
    // Both are on this member's device right now — the reparent is what takes
    // them away, so a fixture where they were already invisible would prove
    // nothing.
    expect(await canSee(db.pool, viewer, moved)).toBe(true);
    expect(await canSee(db.pool, viewer, movedChild)).toBe(true);

    const reparent = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'ticket', id: moved },
        type: 'ticket.reparented',
        payload: { newParentId: unreachable },
        actorId: viewer,
      }),
    );
    // The control in the same window: a reparent onto a parent the viewer CAN
    // reach must purge nothing, or "purges on every reparent" would pass.
    const harmless = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'ticket', id: staysPut },
        type: 'ticket.reparented',
        payload: { newParentId: openParent },
        actorId: viewer,
      }),
    );

    const ids = idsOf(await collect(viewer, ws, reparent.workspaceSeq - 1));
    // The moved ticket AND the subtree that inherits from it.
    expect(ids).toContain(`purge:${moved}`);
    expect(ids).toContain(`purge:${movedChild}`);
    // `staysPut` is still visible, so its own reparent event comes through as
    // an ordinary event and draws no tombstone.
    expect(ids).toContain(harmless.id);
    expect(ids).not.toContain(`purge:${staysPut}`);
    // And the event that did the damage is not itself yielded: it is about a
    // ticket this viewer may no longer see.
    expect(ids).not.toContain(reparent.id);
  });

  it('6.17 losing a PROJECT purges that project’s now-invisible tickets and nothing else', async () => {
    const ws = newUlid();
    const lost = newUlid();
    const kept = newUlid();
    const viewer = newUlid();
    const inLost = newUlid();
    const inKept = newUlid();
    const workspaceWide = newUlid();
    const neverHeldInKept = newUlid();
    const neverHeldInLost = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: lost }, { projectId: kept }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: lost, ticketId: inLost });
    await seedTicket(db.pool, { workspaceId: ws, projectId: kept, ticketId: inKept });
    await seedTicket(db.pool, { workspaceId: ws, projectId: lost, ticketId: workspaceWide });
    await seedTicket(db.pool, { workspaceId: ws, projectId: kept, ticketId: neverHeldInKept });
    await seedTicket(db.pool, { workspaceId: ws, projectId: lost, ticketId: neverHeldInLost });
    // A workspace-mode ticket that happens to live in the lost project: losing
    // the project does not take it away, and a purge naming it would delete
    // something the member may still read.
    await applyAll(db.pool, [setVisibilityEnv(ws, workspaceWide, 'workspace')]);
    // In the KEPT project and invisible to this viewer both before and after.
    // What it discriminates is the SCOPE OF THE SCAN — widening it to the whole
    // workspace reddens the line below, because nothing else in the workspace
    // is invisible. It is NOT, and never was, a control for "never held, never
    // purged": the same ticket planted in the LOST project IS purged, which is
    // the pair asserted below.
    await applyAll(db.pool, [setVisibilityEnv(ws, neverHeldInKept, 'explicit', [newUlid()])]);
    // The twin, in the LOST project. Invisible to this viewer before the
    // removal and after it, so nothing took it away and it was never on this
    // device.
    await applyAll(db.pool, [setVisibilityEnv(ws, neverHeldInLost, 'explicit', [newUlid()])]);
    expect(await canSee(db.pool, viewer, neverHeldInLost)).toBe(false);

    const removal = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'project', id: lost },
        type: 'project.member_removed',
        payload: { userId: viewer },
        actorId: newUlid(),
      }),
    );

    const ids = idsOf(await collect(viewer, ws, removal.workspaceSeq - 1));
    expect(ids).toContain(`purge:${inLost}`);
    // Two positive controls: the other project's ticket survives (so this is
    // not "purge everything"), and the roster event itself still reaches this
    // member (so this is not "yield only purges").
    expect(ids).not.toContain(`purge:${inKept}`);
    expect(ids).not.toContain(`purge:${workspaceWide}`);
    // The scan is PROJECT-SCOPED, so it never reaches the KEPT project's
    // invisible ticket. That is the whole of what this line proves. The comment
    // it replaces read "never on this device, so never purged from it", which
    // was false as a guarantee — the twin below is exactly as never-held and is
    // purged, because `nowInvisibleTicketsInScope` asks `canSee` NOW and cannot
    // tell a ticket taken away from one never held.
    expect(ids).not.toContain(`purge:${neverHeldInKept}`);
    // The real guarantee, pinned rather than described: inside the lost scope a
    // member IS told an id they never held. Disclosed, not accidental — spec §6
    // declined full concealment within a workspace and this viewer is still
    // standing in it (`PurgeInstruction`'s docblock, cases 6.14 and 6.101).
    expect(ids).toContain(`purge:${neverHeldInLost}`);
    expect(ids).toContain(removal.id);
  });

  it('6.95 two revocations touching one ticket in the same window yield ONE purge for it', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const parent = newUlid();
    const child = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parent });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: child, parentId: parent });

    // TWO events on the SAME parent inside one window. Both are
    // visibility-affecting, so the subtree walk runs twice and reaches `parent`
    // and its inheriting `child` a second time.
    //
    // The obvious fixture — revoke the parent, then revoke the child — does NOT
    // exercise this: the filter judges visibility AS OF NOW, so by query time
    // the child's own mode is `explicit` and the parent's walk prunes at it,
    // reaching each ticket exactly once. It was written that way first and the
    // dedup mutation survived it.
    const first = await record(setVisibilityEnv(ws, parent, 'explicit', [newUlid()]));
    await record(setVisibilityEnv(ws, parent, 'explicit', [newUlid()]));

    // Exact, and in stream order: a replica handed the same tombstone twice is
    // not harmed, but the contract says deduplicated per call, and an exact
    // list is the only assertion that can tell one from two.
    expect(await collect(viewer, ws, first.workspaceSeq - 1)).toEqual([
      { kind: 'purge', entityId: parent },
      { kind: 'purge', entityId: child },
    ]);
  });

  it('6.92 a user REVOKED inside the range is told the workspace is gone — the plan’s own branch could never fire', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const witness = newUlid();
    const ticket = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedMember(db.pool, ws, witness, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: ticket });
    const held = await record(ticketEvent(ws, 'comment.added', ticket, { body: 'held' }, witness));

    const revocation = await record(revocationEnv(ws, viewer));

    // The revocation deletes the workspace-scope row, so `resolveEffectiveRole`
    // answers null for this user — which is exactly why the plan text's in-loop
    // `membership.revoked` branch, sitting under `if (role === null) return`,
    // could never run for the person it was written to serve.
    expect(await collect(viewer, ws, held.workspaceSeq - 1)).toEqual([
      { kind: 'scope-revoked', workspaceId: ws },
    ]);
    // Non-vacuity, in the same test: over the SAME range someone still inside
    // the workspace receives the event, so the range is real and the empty
    // answer above is about this user and not about an empty window.
    expect(idsOf(await collect(witness, ws, held.workspaceSeq - 1))).toContain(revocation.id);
    expect(idsOf(await collect(witness, ws, held.workspaceSeq - 1))).not.toContain(
      `scope-revoked:${ws}`,
    );
  });

  it('6.92 a re-grant DOWN TO GUEST inside the range still says the scope went, and the guest keeps only what names them', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const projectWide = newUlid();
    const shared = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: projectWide });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: shared });
    await applyAll(db.pool, [setVisibilityEnv(ws, shared, 'explicit', [viewer])]);
    const before = await record(ticketEvent(ws, 'comment.added', projectWide, { body: 'was mine' }, viewer));
    const stillMine = await record(ticketEvent(ws, 'comment.added', shared, { body: 'still mine' }, viewer));

    await record(revocationEnv(ws, viewer));
    await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'membership', id: membershipId(ws, viewer) },
        type: 'membership.granted',
        payload: { userId: viewer, role: 'guest' },
        actorId: newUlid(),
      }),
    );

    const ids = idsOf(await collect(viewer, ws, before.workspaceSeq - 1));
    expect(ids).toContain(`scope-revoked:${ws}`);
    // The positive control: the explicitly-shared ticket's event still arrives,
    // so this is a narrowing and not a blackout — and the project-wide one does
    // not, so the narrowing really happened.
    expect(ids).toContain(stillMine.id);
    expect(ids).not.toContain(before.id);
  });

  it('6.99 a CYCLE in the parent graph terminates the subtree walk instead of hanging the stream', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const root = newUlid();
    const a = newUlid();
    const b = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: root });
    await applyAll(db.pool, [setVisibilityEnv(ws, root, 'workspace')]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: a, parentId: root });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: b, parentId: a });

    // Case 6.58's own fixture: this closes A → B → A. Nothing on this branch
    // refuses it — Plan 3's reparent command does not exist and the gate does
    // not look at ancestry — so the cycle is reachable from real data today.
    // `ticket.reparented` is itself visibility-affecting, so THIS event is what
    // starts the descending walk into the loop it just created.
    const reparent = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'ticket', id: a },
        type: 'ticket.reparented',
        payload: { newParentId: b },
        actorId: viewer,
      }),
    );

    // Termination is the property. Without the `seen` guard this call never
    // returns: A's child is B, B's child is A, and both inherit.
    const ids = idsOf(await collect(viewer, ws, reparent.workspaceSeq - 1));
    // Each id at most once, so a guard that terminated by some other means
    // (a depth cap, say) could not pass by re-emitting the loop a few times.
    expect(new Set(ids).size).toBe(ids.length);
    // Non-vacuity: the window really did carry the cycle-closing event, so the
    // walk was entered rather than skipped. Without this the case passes
    // against a filter that yields nothing at all.
    expect(ids).toContain(reparent.id);
  });

  it('6.89 a non-member of the workspace receives nothing at all', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const member = newUlid();
    const stranger = newUlid();
    const ticket = newUlid();
    await seedMember(db.pool, ws, member, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: ticket });
    await record(ticketEvent(ws, 'ticket.transitioned', ticket, { to: 'doing' }, member));

    expect(await collect(stranger, ws)).toEqual([]);
    // The control that separates "nothing to send" from "sends nothing": the
    // same window, non-empty for someone who belongs here. A stranger also gets
    // no `scope-revoked` — that instruction is owed only to someone the range
    // itself put out (6.92).
    expect(await collect(member, ws)).not.toEqual([]);
  });

  it('6.21 resumes by the WORKSPACE cursor, and every yielded event carries its own', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const ticket = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: ticket });
    const first = await record(ticketEvent(ws, 'comment.added', ticket, { body: 'one' }, viewer));
    const second = await record(ticketEvent(ws, 'comment.added', ticket, { body: 'two' }, viewer));

    const tail = await collect(viewer, ws, first.workspaceSeq);
    expect(idsOf(tail)).toEqual([second.id]);
    // The consumer resumes from what it was handed, so the cursor must travel
    // on the item — a stream whose items carried no cursor could not be resumed
    // at all.
    expect((tail[0] as LedgerEvent).workspaceSeq).toBe(second.workspaceSeq);
  });

  it('6.21 planted defect: a ticket born after the cursor is never skipped — the cursor counts the WORKSPACE', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const old = newUlid();
    const newborn = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: old });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: newborn });
    await record(ticketEvent(ws, 'comment.added', old, { body: 'one' }, viewer));
    const older = await record(ticketEvent(ws, 'comment.added', old, { body: 'two' }, viewer));
    const firstOfNewborn = await record(
      ticketEvent(ws, 'comment.added', newborn, { body: 'hello' }, viewer),
    );

    // The two counters really do disagree here — asserted, not assumed, because
    // if they agreed the case would pass against the very defect it names.
    expect(firstOfNewborn.seq).toBeLessThan(older.seq);
    expect(firstOfNewborn.workspaceSeq).toBeGreaterThan(older.workspaceSeq);
    // An iterator ordering by per-entity `seq > afterSeq` drops this event and
    // never recovers it: every entity restarts at 1, so a young entity's whole
    // early history sits below any cursor an old entity has already pushed past.
    expect(idsOf(await collect(viewer, ws, older.workspaceSeq))).toEqual([firstOfNewborn.id]);
  });

  it('6.22 planted defect: clocks arrive as ISO instants, not stringified Dates — a +05:30 claim as the equivalent Z', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const ticket = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: ticket });
    // 2026-08-20T14:30:00+05:30 IS 2026-08-20T09:00:00Z. Both columns are
    // timestamptz, so pg hands back a Date, and `String(aDate)` would yield
    // 'Wed Aug 19 2026 …GMT+0530 (India Standard Time)' — which no replica in
    // any other runtime could parse as the instant `EventEnvelope` promises.
    const claim = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'ticket', id: ticket },
        type: 'comment.added',
        payload: { body: 'filed from a phone in Shillong' },
        actorId: viewer,
        clientTime: '2026-08-20T14:30:00.000+05:30',
        serverTime: '2026-08-20T09:00:02.000Z',
      }),
    );

    const yielded = (await collect(viewer, ws, claim.workspaceSeq - 1))[0] as LedgerEvent;
    expect(yielded.clientTime).toBe('2026-08-20T09:00:00.000Z');
    expect(yielded.serverTime).toBe('2026-08-20T09:00:02.000Z');
    expect(new Date(yielded.clientTime).toISOString()).toBe(yielded.clientTime);
    // The skew between the two clocks survives: two facts, still two.
    expect(Date.parse(yielded.serverTime) - Date.parse(yielded.clientTime)).toBe(2000);
  });

  it('6.91 definition events reach guests; roster events do not', async () => {
    const ws = newUlid();
    const guest = newUlid();
    const member = newUlid();
    const newcomer = newUlid();
    await seedGuest(db.pool, ws, guest);
    const workflow = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'workflow', id: newUlid() },
        type: 'workflow.defined',
        payload: { name: 'default' },
        actorId: newUlid(),
      }),
    );
    const grant = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'membership', id: membershipId(ws, newcomer) },
        type: 'membership.granted',
        payload: { userId: newcomer, role: 'member' },
        actorId: newUlid(),
      }),
    );

    const guestItems = idsOf(await collect(guest, ws));
    // A guest with no ticket at all still gets the definition: withholding it
    // is what makes an explicitly-shared ticket's status unrenderable later.
    expect(guestItems).toContain(workflow.id);
    expect(guestItems).not.toContain(grant.id);

    await seedMember(db.pool, ws, member, 'member');
    const memberItems = idsOf(await collect(member, ws));
    expect(memberItems).toContain(workflow.id);
    expect(memberItems).toContain(grant.id);
  });

  it('6.93 invite events are withheld from everyone on this branch, owners included', async () => {
    const ws = newUlid();
    const owner = newUlid();
    await seedMember(db.pool, ws, owner, 'owner');
    const definition = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'ticket-type', id: newUlid() },
        type: 'ticket-type.defined',
        payload: { id: 'task', name: 'Task' },
        actorId: owner,
      }),
    );
    const invite = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'invite', id: newUlid() },
        type: 'invite.sent',
        payload: { address: 'someone@example.com' },
        actorId: owner,
      }),
    );

    const ids = idsOf(await collect(owner, ws));
    // The positive control is the definition beside it: this owner's stream is
    // not empty, so the invite's absence is a decision and not a dead call.
    expect(ids).toContain(definition.id);
    expect(ids).not.toContain(invite.id);
    // The address is PII (case 6.38) and nothing may carry it yet.
    expect(JSON.stringify(await collect(owner, ws))).not.toContain('someone@example.com');
  });

  it('6.100 the purge walk never hands a GUEST a ticket id — a re-authoring elsewhere in the workspace is not their business', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const guest = newUlid();
    const admin = newUlid();
    const shared = newUlid();
    const foreign = newUlid();
    await seedGuest(db.pool, ws, guest);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: shared });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: foreign });
    await applyAll(db.pool, [setVisibilityEnv(ws, shared, 'explicit', [guest])]);
    await applyAll(db.pool, [setVisibilityEnv(ws, foreign, 'explicit', [newUlid()])]);
    // Asserted, so the case is about a ticket that really was out of reach and
    // not about a fixture that forgot to share one.
    expect(await canSee(db.pool, guest, shared)).toBe(true);
    expect(await canSee(db.pool, guest, foreign)).toBe(false);

    const mine = await record(ticketEvent(ws, 'comment.added', shared, { body: 'for you' }, admin));
    // Routine activity by someone else, on a ticket this guest has never held:
    // an admin re-authors its audience. `visibility.set` is visibility-affecting,
    // so this is the event that used to start the walk for everyone alike.
    await record(setVisibilityEnv(ws, foreign, 'explicit', [newUlid()], admin));

    const items = await collect(guest, ws, mine.workspaceSeq - 1);
    // The positive control FIRST: this guest's stream is non-empty over this
    // range, so the exclusion below is a decision and not an empty result —
    // without it the assertion passes against a filter that yields nothing.
    expect(idsOf(items)).toContain(mine.id);
    // Not `not.toContain('purge:…')` — the id must not appear in ANY field of
    // ANY item, the standard 6.16 holds the envelopes to. A guest is an
    // external collaborator (spec §6); an id pushed to their device is a
    // standing assertion that the ticket exists, and ULIDs date it too.
    expect(JSON.stringify(items)).not.toContain(foreign);
  });

  it('6.101 a MEMBER is handed the id of a ticket in a project they were never on — the spec §6 trade, pinned rather than left to be rediscovered', async () => {
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const viewer = newUlid();
    const held = newUlid();
    const foreign = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: mine }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: held });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: foreign });
    expect(await canSee(db.pool, viewer, held)).toBe(true);
    expect(await canSee(db.pool, viewer, foreign)).toBe(false);

    const seen = await record(ticketEvent(ws, 'comment.added', held, { body: 'mine' }, viewer));
    const reauthored = await record(setVisibilityEnv(ws, foreign, 'explicit', [newUlid()]));

    const ids = idsOf(await collect(viewer, ws, seen.workspaceSeq - 1));
    // The positive control, in the same call.
    expect(ids).toContain(seen.id);
    // The EVENT is still withheld — it is about a ticket this member cannot see.
    expect(ids).not.toContain(reauthored.id);
    // The tombstone names the id anyway, and that is the disclosed behaviour:
    // `nowInvisibleInheritSubtree` asks `canSee` NOW, which is true of a ticket
    // taken away and equally true of one never held, and this module cannot ask
    // the other question — `proj_visibility` keeps no prior audience and neither
    // payload carries a before-image (`PurgeInstruction`'s docblock). Spec §6
    // decided the trade for someone standing INSIDE the workspace; case 6.14 is
    // the same trade at the read door. Anyone narrowing this must argue with
    // that sentence rather than change the line quietly.
    expect(ids).toContain(`purge:${foreign}`);
  });

  it('6.101 the same through `ticket.reparented`, and the guest standing beside them receives neither the event nor the id', async () => {
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const viewer = newUlid();
    const guest = newUlid();
    const held = newUlid();
    const sharedWithGuest = newUlid();
    const foreignParent = newUlid();
    const foreign = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: mine }]);
    await seedGuest(db.pool, ws, guest);
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: held });
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: sharedWithGuest });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: foreignParent });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: foreign });
    await applyAll(db.pool, [setVisibilityEnv(ws, sharedWithGuest, 'explicit', [guest])]);
    // Out of reach of BOTH, and by two different branches of `canSee`: the
    // member is not on its project, the guest is named by no list.
    expect(await canSee(db.pool, viewer, foreign)).toBe(false);
    expect(await canSee(db.pool, guest, foreign)).toBe(false);

    const memberControl = await record(
      ticketEvent(ws, 'comment.added', held, { body: 'mine' }, viewer),
    );
    const guestControl = await record(
      ticketEvent(ws, 'comment.added', sharedWithGuest, { body: 'yours' }, viewer),
    );
    // The OTHER visibility-affecting type, on a ticket neither of them holds.
    await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'ticket', id: foreign },
        type: 'ticket.reparented',
        payload: { newParentId: foreignParent },
        actorId: newUlid(),
      }),
    );

    const memberIds = idsOf(await collect(viewer, ws, memberControl.workspaceSeq - 1));
    expect(memberIds).toContain(memberControl.id);
    expect(memberIds).toContain(`purge:${foreign}`);

    // One event, one workspace, two recipients: the ONLY difference is the role,
    // which is the whole of the rule `PurgeInstruction` states.
    const guestItems = await collect(guest, ws, memberControl.workspaceSeq - 1);
    expect(idsOf(guestItems)).toContain(guestControl.id);
    expect(JSON.stringify(guestItems)).not.toContain(foreign);
  });

  it('6.103 an OWNER re-granted as a member inside one window is told, ticket by ticket, what the owner bypass used to reach', async () => {
    const ws = newUlid();
    const theirs = newUlid();
    const viewer = newUlid();
    const openToAll = newUlid();
    const projectOnly = newUlid();
    const explicitElsewhere = newUlid();
    // No projects: the owner reads everything in the workspace by the bypass
    // alone (owner decision 2026-08-27), so the downgrade takes real tickets
    // away rather than merely renaming the role.
    await seedMember(db.pool, ws, viewer, 'owner');
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: openToAll });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: projectOnly });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: explicitElsewhere });
    await applyAll(db.pool, [setVisibilityEnv(ws, openToAll, 'workspace')]);
    await applyAll(db.pool, [setVisibilityEnv(ws, explicitElsewhere, 'explicit', [newUlid()])]);
    // All three were on this device a moment ago. Without this the purges below
    // would be naming tickets that were never held — a different case (6.101),
    // and the one that makes an itemised list look gratuitous.
    expect(await canSee(db.pool, viewer, openToAll)).toBe(true);
    expect(await canSee(db.pool, viewer, projectOnly)).toBe(true);
    expect(await canSee(db.pool, viewer, explicitElsewhere)).toBe(true);

    const opener = await record(
      ticketEvent(ws, 'comment.added', openToAll, { body: 'still readable' }, viewer),
    );
    await record(revocationEnv(ws, viewer));
    await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'membership', id: membershipId(ws, viewer) },
        type: 'membership.granted',
        payload: { userId: viewer, role: 'member' },
        actorId: newUlid(),
      }),
    );

    const ids = idsOf(await collect(viewer, ws, opener.workspaceSeq - 1));
    // GENUINE retractions: the owner bypass was the only thing serving these
    // two, and a member on no project reaches neither.
    expect(ids).toContain(`purge:${projectOnly}`);
    expect(ids).toContain(`purge:${explicitElsewhere}`);
    // The control that separates this from "purge everything you hold": the
    // workspace-mode ticket survives the downgrade and is not named.
    expect(ids).not.toContain(`purge:${openToAll}`);
    expect(ids).toContain(opener.id);
    // And NOT the scope instruction. That is the guest answer (6.92); this
    // recipient is standing inside the workspace, where spec §6 declined full
    // concealment, so they get the itemised list. The list also names ids they
    // never held — none in this fixture, all of them in the degenerate
    // member→member re-grant, where nothing was lost at all — which is the
    // accepted count-leak recorded on `ScopeRevokedInstruction`.
    expect(ids).not.toContain(`scope-revoked:${ws}`);
  });
});
