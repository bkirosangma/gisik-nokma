import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { membershipId, newUlid, SIMPLE_KANBAN_TEMPLATE, type LedgerEvent } from '@gisik-nokma/domain';
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
 * order: an event about a ticket the viewer cannot see; and the ticket's ID
 * leaking in an envelope field while its payload is withheld (the existence
 * oracle case 6.12 closed at the read door).
 *
 * A tombstone that never arrives used to sit third on that list. It is no
 * longer a failure this file is built against, and that is a decision rather
 * than an omission: the per-event purge walk emitted ids for entities the
 * recipient stood in no relationship to (6.100, 6.101) and could not be gated
 * on the property it needed, so it is gone and the missing tombstones it leaves
 * are cases 6.102 and 6.104, owned by Plan 10. The two directions are not
 * symmetric — stale local data is corrected by the next full resync, and a
 * disclosed id never is — so this file hardens the disclosure side and
 * deliberately declines to pin the retention side.
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
    // standing in it (`PurgeInstruction`'s docblock, cases 6.14 and 6.103).
    // This is the SCOPE boundary, where that trade is settled: it fires once,
    // for a NAMED scope taken from a NAMED person, and every id it can emit is
    // bounded by that scope. The per-EVENT version of the same trade was struck
    // down for having no such bound and no relationship to the recipient
    // (6.101); this one was explicitly not reopened.
    expect(ids).toContain(`purge:${neverHeldInLost}`);
    expect(ids).toContain(removal.id);
  });

  it('6.95 two SCOPE revocations touching one ticket in the same window yield ONE purge for it', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const inProject = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: inProject });
    // Project-mode and this member is on the project, so the ticket is on the
    // device right now: the tombstone below is a genuine retraction rather than
    // an id they never held.
    expect(await canSee(db.pool, viewer, inProject)).toBe(true);

    // TWO scope boundaries inside one window, the second scan a SUPERSET of the
    // first: losing the project scans that project, and the revoke/re-grant
    // pair then scans the whole workspace over the same ticket. Reached twice,
    // emitted once.
    //
    // The fixture that used to reach the dedup was two `visibility.set`s on one
    // parent, driving the per-event subtree walk twice. That walk is gone
    // (6.101), so the property is re-pinned on the emitters that remain — and
    // the walk's departure is exactly why it had to be: a dedup case whose only
    // route to the branch has been deleted is a check that cannot fail.
    const removal = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'project', id: prj },
        type: 'project.member_removed',
        payload: { userId: viewer },
        actorId: newUlid(),
      }),
    );
    const revoked = await record(revocationEnv(ws, viewer));
    const regranted = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'membership', id: membershipId(ws, viewer) },
        type: 'membership.granted',
        payload: { userId: viewer, role: 'member' },
        actorId: newUlid(),
      }),
    );

    // Exact, and in stream order: a replica handed the same tombstone twice is
    // not harmed, but the contract says deduplicated per call, and an exact
    // list is the only assertion that can tell one from two. The three roster
    // events beside it are the positive control — the call is not empty, and
    // the single purge is a decision rather than a stream that yields nothing.
    expect(idsOf(await collect(viewer, ws, removal.workspaceSeq - 1))).toEqual([
      `purge:${inProject}`,
      removal.id,
      revoked.id,
      regranted.id,
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

  /**
   * 6.93 CLOSED by Plan 4 Task 14, and rewritten rather than deleted.
   *
   * This case used to assert that invite events reached NOBODY, owners
   * included — the fail-closed placeholder Task 11 left because the role split
   * had no implementation to defer to and shipping a PII-bearing event to
   * everyone in the meantime would have been the worse error. Task 14 supplies
   * the split, so the assertion inverts: the OWNER now receives it, and who
   * does not is case 6.38's block at the foot of this file.
   *
   * Kept here, at its own id, rather than folded into 6.38: an owner receiving
   * their own workspace's invitations is the direction 6.93 was standing in for,
   * and a reader who greps 6.93 must find what happened to it.
   */
  it('6.93 invite events now reach the OWNER — the fail-closed placeholder is closed by Task 14', async () => {
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
    const inviteId = newUlid();
    const invite = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'invite', id: inviteId },
        type: 'invite.sent',
        payload: { inviteId, address: 'someone@example.com', channel: 'email', role: 'member' },
        actorId: owner,
      }),
    );

    const ids = idsOf(await collect(owner, ws));
    // The definition beside it still separates "the invite arrived" from "this
    // owner's stream is the whole ledger unfiltered".
    expect(ids).toContain(definition.id);
    expect(ids).toContain(invite.id);
    // And the address really does travel to an owner, which is the fact the
    // withholding at every other role exists to bound. Asserted rather than
    // implied, because "an owner sees invitations" and "an owner sees the
    // ADDRESS on an invitation" are different disclosures.
    expect(JSON.stringify(await collect(owner, ws))).toContain('someone@example.com');
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
    // an admin re-authors its audience. `visibility.set` is the event that used
    // to start the subtree walk for everyone alike. The walk was first gated on
    // `!isGuest` to close this case, and has since been removed outright
    // (6.101).
    //
    // MEASURED, and not the flattering answer: re-adding the walk leaves this
    // case GREEN, because the walk as it last shipped carried the `!isGuest`
    // gate. What reddens it is dropping the `canSee` guard on ticket events —
    // the guest is then handed the `visibility.set` ENVELOPE, whose entity id
    // is `foreign`, and the stringify finds it. So this assertion is real and
    // worth keeping, but it is held by the guard 6.16 already pins, not by
    // anything purge-shaped. Do not cite this case as evidence that a purge
    // gate exists; there is none left to gate. (6.97 carries the numbers.)
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

  it('6.101 the per-event purge walk is GONE: a MEMBER is never handed the id of a ticket in a project they were never on', async () => {
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const viewer = newUlid();
    const held = newUlid();
    const foreign = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: mine }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: held });
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: foreign });
    // Asserted, so this is a ticket that really was out of reach and not a
    // fixture that forgot to seed one. It measures the RELATIONSHIP the ruling
    // turns on: `foreign` was never on this device — the viewer is on none of
    // its project and no list names them — so there is nothing this recipient
    // holds that its id could name.
    expect(await canSee(db.pool, viewer, held)).toBe(true);
    expect(await canSee(db.pool, viewer, foreign)).toBe(false);

    const seen = await record(ticketEvent(ws, 'comment.added', held, { body: 'mine' }, viewer));
    // Routine activity by someone else, on a ticket this member has never held:
    // a re-authoring of its audience. `visibility.set` is what used to start the
    // subtree walk.
    const reauthored = await record(setVisibilityEnv(ws, foreign, 'explicit', [newUlid()]));

    const items = await collect(viewer, ws, seen.workspaceSeq - 1);
    // The positive control FIRST: this member's stream is non-empty over this
    // range, so both exclusions below are decisions and not an empty result —
    // without it they pass against a filter that yields nothing.
    expect(idsOf(items)).toContain(seen.id);
    // The EVENT is withheld: it is about a ticket this member cannot see.
    expect(idsOf(items)).not.toContain(reauthored.id);
    // And the ID does not travel either. Not `not.toContain('purge:…')` — the
    // id must not appear in ANY field of ANY item, the standard 6.16 and 6.100
    // hold the stream to, because an item naming the ticket and withholding
    // everything else is still the oracle.
    //
    // **This reverses what the case asserted before, and the reason is
    // RELATIONSHIP, not size.** It used to pin the id as arriving, arguing from
    // spec §6's within-a-workspace existence-leak and from case 6.14. The
    // controller rejected that reading of 6.14: 6.14 is tolerable because the
    // viewer ALREADY HOLDS THE CHILD whose unreachable parent's id it
    // discloses, so the id names something they stand in a relationship to;
    // strip that axis and 6.14 reduces to "small leaks are fine", which is not
    // what it says. The two `canSee` assertions above are the measurement that
    // the axis is absent here. So this was case 6.100's guest disclosure at a
    // smaller radius, and it is closed the same way — by not walking at all,
    // since the gate it would have needed ("could they see it BEFORE") is one
    // this module cannot ask and may not reconstruct (6.82, 6.94).
    //
    // What that costs is an under-purge, recorded as case 6.104 and NOT pinned
    // by a test here: a ticket genuinely taken away now outlives its tombstone
    // until a full resync. Stale local data is recoverable; an id on a device
    // the server does not control is not.
    expect(JSON.stringify(items)).not.toContain(foreign);
  });

  it('6.101 the same through `ticket.reparented`, and the guest standing beside them is now answered identically', async () => {
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
    // member is not on its project, the guest is named by no list. Neither
    // holds it, so neither may be told its id.
    expect(await canSee(db.pool, viewer, foreign)).toBe(false);
    expect(await canSee(db.pool, guest, foreign)).toBe(false);

    const memberControl = await record(
      ticketEvent(ws, 'comment.added', held, { body: 'mine' }, viewer),
    );
    const guestControl = await record(
      ticketEvent(ws, 'comment.added', sharedWithGuest, { body: 'yours' }, viewer),
    );
    // The OTHER visibility-affecting type, on a ticket neither of them holds —
    // the second of the two events that used to start the walk.
    await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'ticket', id: foreign },
        type: 'ticket.reparented',
        payload: { newParentId: foreignParent },
        actorId: newUlid(),
      }),
    );

    const memberItems = await collect(viewer, ws, memberControl.workspaceSeq - 1);
    expect(idsOf(memberItems)).toContain(memberControl.id);
    expect(JSON.stringify(memberItems)).not.toContain(foreign);

    // One event, one workspace, two recipients. The ROLE used to be the whole
    // of the rule at this site and no longer is: the member half of this pair
    // used to assert `purge:${foreign}` PRESENT while the guest half asserted
    // it absent, and the ruling collapsed the difference. Both halves are kept
    // and both now assert absence, because the case's job is to hold the two
    // recipients against the SAME event — what changed is the answer, not the
    // question. The role still splits their streams elsewhere (6.91).
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
    // would be naming tickets that were never held — 6.17's `neverHeldInLost`,
    // the count-leak this branch accepts at a scope boundary — and that is the
    // shape that makes an itemised list look gratuitous.
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

/**
 * Case 6.38 — `invite.sent` reaches owners and admins and nobody else.
 *
 * This is the FIRST event kind withheld from plain members. The reason is
 * narrower than "invitations are sensitive": the payload carries an ADDRESS
 * somebody gave in confidence to whoever invited them, a member has no screen
 * that needs it and no act it enables, and an event on a replica is on a device
 * the server does not control — no later fix retrieves it.
 *
 * ## The two mutations this block kills, and what each would look like
 *
 * - `audienceClassOf('invite')` back to `'withheld'`: the owner and admin
 *   assertions redden. Nothing else in this file notices.
 * - The `admin` branch written as `!isGuest`, the shape the roster branch above
 *   uses: the MEMBER assertion reddens and every other assertion in this file —
 *   owner, admin, guest and stranger — stays green. That is the whole point of
 *   ranging over four roles rather than testing "a member cannot see it": the
 *   plausible wrong implementation is right for three of the four.
 */
describe('invite events in sync-down (case 6.38)', () => {
  it('reaches the owner and an admin, and not a member, a guest or a stranger', async () => {
    const ws = newUlid();
    const owner = newUlid();
    const admin = newUlid();
    const member = newUlid();
    const guest = newUlid();
    const stranger = newUlid();

    await seedMember(db.pool, ws, owner, 'owner');
    await seedMember(db.pool, ws, admin, 'admin');
    await seedMember(db.pool, ws, member, 'member');
    await seedGuest(db.pool, ws, guest);

    const inviteId = newUlid();
    const sent = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'invite', id: inviteId },
        type: 'invite.sent',
        payload: { inviteId, address: 'accountant@example.com', channel: 'email', role: 'member' },
        actorId: owner,
      }),
    );
    // A workspace event beside it, and it is not decoration: it is what
    // separates "the invite was withheld" from "this reader receives nothing".
    // A member and a guest each have their own control below.
    const renamed = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'workspace', id: ws },
        type: 'workspace.renamed',
        payload: { name: 'The Corner' },
        actorId: owner,
      }),
    );
    // The guest's control has to be a DEFINITION: workspace events do not reach
    // a guest either, so using the rename for them would prove nothing.
    const workflowId = newUlid();
    const defined = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'workflow', id: workflowId },
        type: 'workflow.defined',
        payload: { ...SIMPLE_KANBAN_TEMPLATE, id: workflowId, version: 1 },
        actorId: owner,
      }),
    );

    for (const reader of [owner, admin]) {
      const ids = idsOf(await collect(reader, ws));
      expect(ids, reader === owner ? 'owner' : 'admin').toContain(sent.id);
      expect(ids).toContain(renamed.id);
    }

    const memberIds = idsOf(await collect(member, ws));
    expect(memberIds).not.toContain(sent.id);
    // The control: the member is receiving this workspace's stream, just not
    // the invitation.
    expect(memberIds).toContain(renamed.id);

    const guestIds = idsOf(await collect(guest, ws));
    expect(guestIds).not.toContain(sent.id);
    // The guest's own control — a definition, which reaches everyone.
    expect(guestIds).toContain(defined.id);

    // A stranger receives nothing at all, which is the null-role early return
    // rather than this branch — asserted so the block covers every role a
    // reader could hold.
    expect(idsOf(await collect(stranger, ws))).toEqual([]);
  });

  it('the same rule covers invite.accepted and invite.revoked, not only invite.sent', async () => {
    const ws = newUlid();
    const admin = newUlid();
    const member = newUlid();
    await seedMember(db.pool, ws, admin, 'admin');
    await seedMember(db.pool, ws, member, 'member');

    const inviteId = newUlid();
    const accepted = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'invite', id: inviteId },
        type: 'invite.accepted',
        payload: { inviteId, userId: member },
        actorId: member,
        origin: 'server',
      }),
    );
    const revoked = await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'invite', id: inviteId },
        type: 'invite.revoked',
        payload: { inviteId },
        actorId: admin,
      }),
    );

    const adminIds = idsOf(await collect(admin, ws));
    expect(adminIds).toEqual(expect.arrayContaining([accepted.id, revoked.id]));

    // The class is keyed on the ENTITY KIND, not on the type, so all three go
    // together. A member does not even learn that an invitation they are
    // themselves the subject of exists — which is right: they learn they are in
    // the workspace from `membership.granted`, which does reach them.
    const memberIds = idsOf(await collect(member, ws));
    expect(memberIds).not.toContain(accepted.id);
    expect(memberIds).not.toContain(revoked.id);
  });
});
