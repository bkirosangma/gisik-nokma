import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { visibleEventsFor, type SyncItem } from '../../src/visibility/visible-events-for.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { applyAll, seedMember, seedProject, seedTicket, setVisibilityEnv } from '../helpers/seed.js';

/**
 * Drafts T3, C4 (spec §4.2): `nowInvisibleTicketsInScope` never names another person's draft in a scope-lost
 * purge list (28.062). The local helpers are `visible-events-for.test.ts`'s (`record`, `collect`, `idsOf`,
 * `ticketEvent`, `revocationEnv` and the truncating `beforeEach`); the world is 6.103's with one more ticket.
 * Drafts T4 adds door G2, the stream (28.073: the author's devices receive the draft's events, nobody else's
 * do), and C4 refined (28.080: the recipient's OWN draft is named only once they can no longer open it).
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
  // why each test mints a fresh workspace id.
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
        : item.kind === 'reach-granted'
          ? // The ids, not a count: two notices naming different tickets must
            // not compare equal — see the same spelling in `stream-socket.ts`.
            `reach-granted:${item.tickets.map((t) => t.id).join(',')}`
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

it('28.062 an owner re-granted as a member is told what only the owner bypass reached, and never another person\'s draft; control: cleared, the draft id is named', async () => {
  const ws = newUlid();
  const theirs = newUlid();
  const viewer = newUlid();
  const author = newUlid();
  const openToAll = newUlid();
  const explicitElsewhere = newUlid();
  const otherDraft = newUlid();
  await seedProject(db.pool, ws, theirs);
  await seedMember(db.pool, ws, viewer, 'owner');
  await seedMember(db.pool, ws, author, 'member', [{ projectId: theirs }]);
  await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: openToAll });
  await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: explicitElsewhere });
  await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: otherDraft, draftBy: author });
  await applyAll(db.pool, [setVisibilityEnv(ws, openToAll, 'workspace')]);
  await applyAll(db.pool, [setVisibilityEnv(ws, explicitElsewhere, 'explicit', [newUlid()])]);
  // an audience that does NOT name the viewer: once the flag is cleared the draft is "invisible to a member",
  // so only the flag, not the audience, can keep its id out of the list
  await applyAll(db.pool, [setVisibilityEnv(ws, otherDraft, 'explicit', [author])]);

  const opener = await record(ticketEvent(ws, 'comment.added', openToAll, { body: 'still readable' }, viewer));
  await record(revocationEnv(ws, viewer));
  await record(testEnvelope({
    workspaceId: ws, entity: { kind: 'membership', id: membershipId(ws, viewer) },
    type: 'membership.granted', payload: { userId: viewer, role: 'member' }, actorId: newUlid(),
  }));

  const ids = idsOf(await collect(viewer, ws, opener.workspaceSeq - 1));
  expect(ids).toContain(`purge:${explicitElsewhere}`); // CONTROL: the list is real and itemised
  expect(ids).not.toContain(`purge:${otherDraft}`);     // an id the recipient stands in no relationship to
  await db.pool.query('UPDATE proj_visibility SET draft_author_id = NULL WHERE ticket_id = $1', [otherDraft]);
  expect(idsOf(await collect(viewer, ws, opener.workspaceSeq - 1))).toContain(`purge:${otherDraft}`);
});

const entityIds = (items: readonly SyncItem[]): string[] =>
  items.filter((item): item is LedgerEvent => 'entity' in item).map((event) => event.entity.id);

it('28.073 the author receives their draft\'s events, nobody else does, and a draft assignment names no reach-granted; control: the published twin reaches all', async () => {
  const ws = newUlid();
  const project = newUlid();
  const [author, owner, admin, assignee, other] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
  await seedProject(db.pool, ws, project);
  await seedMember(db.pool, ws, owner, 'owner');
  await seedMember(db.pool, ws, admin, 'admin');
  await seedMember(db.pool, ws, author, 'member');
  await seedMember(db.pool, ws, assignee, 'member');
  await seedMember(db.pool, ws, other, 'member');
  const draft = newUlid();
  const twin = newUlid();
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: draft, draftBy: author, birthAssigneeId: assignee });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: twin, createdBy: author });
  const edit = await record(ticketEvent(ws, 'ticket.field_set', draft, { fieldId: 'title', value: 'edited' }, author));
  const assign = await record(ticketEvent(ws, 'ticket.assigned', draft, { assigneeId: assignee }, author));
  const twinEdit = await record(ticketEvent(ws, 'ticket.field_set', twin, { fieldId: 'title', value: 'twin edited' }, author));

  const mine = await collect(author, ws, 0);
  expect(idsOf(mine)).toEqual(expect.arrayContaining([edit.id, assign.id, twinEdit.id]));
  expect(entityIds(mine)).toContain(draft); // the creation event too
  expect(idsOf(mine).filter((id) => id.startsWith('reach-granted'))).toEqual([]);

  for (const [name, viewer] of [['owner', owner], ['admin', admin], ['assignee', assignee], ['another member', other]] as const) {
    const items = await collect(viewer, ws, 0);
    expect(idsOf(items), name).toContain(twinEdit.id); // CONTROL: the stream is live for this viewer
    expect(idsOf(items), name).not.toContain(edit.id);
    expect(idsOf(items), name).not.toContain(assign.id);
    expect(entityIds(items), name).not.toContain(draft);
    expect(idsOf(items).join('|'), name).not.toContain(draft); // no notice, purge or scope item names it
  }
});

it('28.080 an author keeps their own draft off the purge list while they can still open it, and is told to drop it once they cannot; another person\'s draft is never named', async () => {
  async function scenario(regrantAs: 'member' | 'guest', ownDiscarded = false): Promise<{ ids: string[]; ws: string; own: string; explicit: string; theirs: string }> {
    const ws = newUlid();
    const project = newUlid();
    const viewer = newUlid();
    const other = newUlid();
    const [openToAll, explicitElsewhere, own, theirs] = [newUlid(), newUlid(), newUlid(), newUlid()];
    await seedProject(db.pool, ws, project);
    await seedMember(db.pool, ws, viewer, 'member');
    await seedMember(db.pool, ws, other, 'member');
    await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: openToAll });
    await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: explicitElsewhere });
    await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: own, draftBy: viewer });
    await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: theirs, draftBy: other });
    await applyAll(db.pool, [setVisibilityEnv(ws, explicitElsewhere, 'explicit', [other])]);
    const opener = await record(ticketEvent(ws, 'comment.added', openToAll, { body: 'still readable' }, viewer));
    await record(revocationEnv(ws, viewer));
    await record(testEnvelope({
      workspaceId: ws, entity: { kind: 'membership', id: membershipId(ws, viewer) },
      type: 'membership.granted', payload: { userId: viewer, role: regrantAs }, actorId: newUlid(),
    }));
    if (ownDiscarded) await db.pool.query('UPDATE proj_tickets SET draft_discarded = true WHERE ticket_id = $1', [own]);
    return { ids: idsOf(await collect(viewer, ws, opener.workspaceSeq - 1)), ws, own, explicit: explicitElsewhere, theirs };
  }
  // Re-granted as a member: the author still holds R18 (rule A puts every project in a member's reach), so the draft
  // is still theirs to open and their device keeps it.
  const asMember = await scenario('member');
  expect(asMember.ids).toContain(`purge:${asMember.explicit}`); // CONTROL: the list is real and itemised
  expect(asMember.ids).not.toContain(`purge:${asMember.own}`); // still openable
  expect(asMember.ids).not.toContain(`purge:${asMember.theirs}`);
  // The same re-grant with the own draft flagged discarded: no longer openable (`ticketAccess` is `none`), so it is
  // named. Only the flag differs from the leg above.
  const discarded = await scenario('member', true);
  expect(discarded.ids).toContain(`purge:${discarded.explicit}`);
  expect(discarded.ids).toContain(`purge:${discarded.own}`);
  expect(discarded.ids).not.toContain(`purge:${discarded.theirs}`);
  // Re-granted as a guest: a guest cannot create in the project, so the draft is no longer theirs to open. A guest's
  // revocation is not itemised (`scope-revoked`: the device drops its whole copy of the workspace, the draft with
  // it), and still no item names either draft.
  const asGuest = await scenario('guest');
  expect(asGuest.ids).toContain(`scope-revoked:${asGuest.ws}`);
  expect(asGuest.ids.join('|')).not.toContain(asGuest.theirs);
  expect(asGuest.ids.filter((id) => id.startsWith('purge:'))).toEqual([]);
});
