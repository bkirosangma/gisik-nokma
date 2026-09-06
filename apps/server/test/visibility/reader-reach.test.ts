import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { canSee } from '../../src/visibility/can-see.js';
import { visibleEventsFor, type SyncItem } from '../../src/visibility/visible-events-for.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { applyAll, seedMember, seedProject, seedTicket, setVisibilityEnv } from '../helpers/seed.js';

/**
 * Case 12.283 — visibility that widens because the READER's reach grew.
 * Closure 5b(a), ruling P37.1.
 *
 * ## Why this is a file of its own and not another case beside the others
 *
 * `grant-backfill.test.ts` covers widenings of a TICKET's audience: a
 * `visibility.set` or a `ticket.reparented` lands, and the walk starts from the
 * ticket it names. This is the other shape, and it is not a variation on that
 * one — `membership.granted` and `project.member_added` are ROSTER events filed
 * against the roster entity, so there is no ticket to start a subtree walk
 * from. The question inverts with the widening: not "who can now see this
 * ticket" but "which tickets can this viewer now see". Different trigger,
 * different entity kind, different function (`readerReachNoticeFor`), and it is
 * wired into a different arm of `visibleEventsFor` — the roster arm, beside its
 * own narrowing siblings.
 *
 * ## The gap it closes is the same gap
 *
 * Every ticket such an event reveals carries the identical pre-cursor problem:
 * the client's cursor advanced past that history while the tickets were
 * invisible to it, so re-widening delivers only the widening. Closure 5 was
 * scoped by ruling P37 to "the visibility event itself", so this was RECORDED
 * as 12.283 and not built; closure 5b builds it, as the same bounded notice.
 *
 * ## The roster seed here goes into the LEDGER, unlike everywhere else
 *
 * `seedMember` calls `applyAll` only — it writes the projections and NOT the
 * ledger — so in most fixtures no `membership.granted` row exists to be drained
 * at all. That is fine for tests about who can see what; it is fatal for a test
 * about an event ARRIVING, which is what this one is. So the trigger is recorded
 * through `record()` below, and the seeds that merely establish state still are
 * not. A reader copying this file into another must keep that distinction or the
 * notice will silently never fire and the case will pass for the wrong reason.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('TRUNCATE proj_visibility');
  await db.pool.query('TRUNCATE proj_memberships');
  await db.pool.query('TRUNCATE proj_projects');
});

/** Into the ledger AND the projections, the way ingest does. */
async function record(env: LedgerEvent): Promise<LedgerEvent> {
  await appendTestEvent(db.pool, env);
  await applyAll(db.pool, [env]);
  return env;
}

async function collect(userId: string, workspaceId: string, afterSeq = 0): Promise<SyncItem[]> {
  const items: SyncItem[] = [];
  for await (const item of visibleEventsFor(db.pool, userId, workspaceId, afterSeq)) {
    items.push(item);
  }
  return items;
}

const noticesIn = (items: SyncItem[]): string[][] =>
  items
    .filter((i): i is Extract<SyncItem, { kind: 'reach-granted' }> => 'kind' in i && i.kind === 'reach-granted')
    .map((i) => [...i.ticketIds].sort());

describe('12.283 a widening on the READER’s side of canSee is owed the same notice', () => {
  it('12.283 project.member_added names the project’s tickets to the person added, and to nobody else', async () => {
    const ws = newUlid();
    const joined = newUlid();
    const other = newUlid();
    const owner = newUlid();
    const newcomer = newUlid();
    const bystander = newUlid();

    await seedProject(db.pool, ws, joined, owner);
    await seedProject(db.pool, ws, other, owner);
    await seedMember(db.pool, ws, owner, 'owner', [
      { projectId: joined, projectAdmin: true },
      { projectId: other, projectAdmin: true },
    ]);
    // Both are workspace members and on NEITHER project, so neither can see a
    // project-mode ticket in either one to begin with.
    await seedMember(db.pool, ws, newcomer, 'member');
    await seedMember(db.pool, ws, bystander, 'member');

    const inJoined = newUlid();
    const alsoInJoined = newUlid();
    const inOther = newUlid();
    for (const [ticketId, projectId] of [
      [inJoined, joined],
      [alsoInJoined, joined],
      [inOther, other],
    ] as const) {
      await seedTicket(db.pool, { workspaceId: ws, ticketId, projectId, createdBy: owner });
      await applyAll(db.pool, [setVisibilityEnv(ws, ticketId, 'project', undefined, owner)]);
    }

    // THE TICKET THAT MAKES THE PROJECT SCOPE KILLABLE, and without it the scope
    // filter is unconstrained — measured, not assumed: a mutation deleting the
    // filter SURVIVED the first version of this case with everything green.
    //
    // The reason it survived is worth keeping: `listVisibleTickets` already
    // excludes `inOther` (project mode, a project this member is not in), so
    // dropping the scope filter changed nothing this fixture could see. What the
    // filter actually withholds is a ticket the reader can ALREADY see, in a
    // project this event did not add them to — so it must be WORKSPACE mode
    // (visible to any member) and live in `other`.
    //
    // A workspace-mode ticket in `joined` would NOT work and the distinction is
    // the design rather than a fixture detail: the filter keys on the ticket's
    // project, so it names that one too. That is the documented over-naming —
    // the notice answers "what can this reader see in the project they were just
    // added to", not "what did this event newly admit", because there is no
    // before-image to subtract. Over-naming inside the scope is accepted; naming
    // things OUTSIDE it is what inflates every notice toward the 200 cap.
    const alreadyVisibleElsewhere = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, ticketId: alreadyVisibleElsewhere, projectId: other, createdBy: owner });
    await applyAll(db.pool, [setVisibilityEnv(ws, alreadyVisibleElsewhere, 'workspace', undefined, owner)]);

    // THE TRIGGER, and it is in the ledger so a drain can reach it.
    await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'project', id: joined },
        type: 'project.member_added',
        payload: { userId: newcomer, projectAdmin: false },
        actorId: owner,
      }),
    );

    // THE PRECONDITION, asked of `canSee` directly. An earlier draft asserted
    // `(await collect(newcomer, ws)).length > 0` here, which the NOTICE ITSELF
    // satisfies — a control that could not fail for the reason it named, in a
    // case written to exclude something. What the exclusion below needs is that
    // this member CAN see `alreadyVisibleElsewhere`, so that only the project
    // scope keeps it out of the notice.
    expect(await canSee(db.pool, newcomer, alreadyVisibleElsewhere)).toBe(true);
    expect(await canSee(db.pool, newcomer, inOther)).toBe(false);

    const forNewcomer = noticesIn(await collect(newcomer, ws));
    // EXACTLY the joined project's two tickets — not the workspace-mode ticket
    // this member could already see, and not the other project's. Not
    // `toContain`: an implementation that named everything visible would satisfy
    // "contains inJoined" while dragging in both.
    expect(forNewcomer).toEqual([[inJoined, alsoInJoined].sort()]);
    expect(JSON.stringify(forNewcomer)).not.toContain(inOther);
    // THE ASSERTION THE SCOPE-FILTER MUTATION REDDENS. This member CAN see
    // `alreadyVisibleElsewhere` — it is workspace mode — so `canSee` admits it
    // and `listVisibleTickets` returns it. Only the project scope keeps it out
    // of the notice, which is what makes this a test of the scope rather than of
    // `canSee` a second time.
    expect(JSON.stringify(forNewcomer)).not.toContain(alreadyVisibleElsewhere);

    // THE EXCLUDING HALF. The bystander's reach did not grow, so no notice is
    // owed them at all — and this runs against the SAME trigger in the SAME
    // ledger, so it cannot be satisfied by a fixture where nothing happened.
    expect(noticesIn(await collect(bystander, ws))).toEqual([]);
  });

  it('12.283 membership.granted cannot scope, so it names what the reader can see now — and only for them', async () => {
    const ws = newUlid();
    const project = newUlid();
    const owner = newUlid();
    const promoted = newUlid();
    const bystander = newUlid();

    await seedProject(db.pool, ws, project, owner);
    await seedMember(db.pool, ws, owner, 'owner', [{ projectId: project, projectAdmin: true }]);
    await seedMember(db.pool, ws, bystander, 'member');
    // A member of the workspace and of the project — which is what makes the
    // workspace-mode ticket below visible to them, so the notice has something
    // true to name.
    await seedMember(db.pool, ws, promoted, 'member', [{ projectId: project }]);

    const visible = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, ticketId: visible, projectId: project, createdBy: owner });
    await applyAll(db.pool, [setVisibilityEnv(ws, visible, 'workspace', undefined, owner)]);

    // Explicitly shared with the OWNER alone — the control that proves the
    // notice is asking `canSee` per ticket rather than listing the workspace.
    const ownerOnly = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, ticketId: ownerOnly, projectId: project, createdBy: owner });
    await applyAll(db.pool, [setVisibilityEnv(ws, ownerOnly, 'explicit', [owner], owner)]);

    await record(
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'membership', id: newUlid() },
        type: 'membership.granted',
        payload: { userId: promoted, role: 'member' },
        actorId: owner,
      }),
    );

    const forPromoted = noticesIn(await collect(promoted, ws));
    expect(forPromoted).toEqual([[visible]]);
    // The owner-only ticket is in the same workspace and the same project. A
    // notice built from a workspace listing rather than from the visibility
    // predicate would name it.
    expect(JSON.stringify(forPromoted)).not.toContain(ownerOnly);

    // The trigger names `promoted`, so the bystander is owed nothing — even
    // though the bystander CAN see `visible` and would be a plausible
    // recipient for an implementation that keyed on the ticket rather than on
    // the event's subject.
    expect(noticesIn(await collect(bystander, ws))).toEqual([]);
  });
});
