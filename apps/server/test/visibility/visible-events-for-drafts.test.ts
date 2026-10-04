import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { visibleEventsFor, type SyncItem } from '../../src/visibility/visible-events-for.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { applyAll, seedMember, seedProject, seedTicket, setVisibilityEnv } from '../helpers/seed.js';

/**
 * Drafts T3, C4 (spec §4.2): `nowInvisibleTicketsInScope` never names another person's draft in a scope-lost
 * purge list (28.062). The local helpers are `visible-events-for.test.ts`'s (`record`, `collect`, `idsOf`,
 * `ticketEvent`, `revocationEnv` and the truncating `beforeEach`); the world is 6.103's with one more ticket.
 * Drafts T4 adds door G2, the stream (28.073: the author's devices receive the draft's events, nobody else's
 * do, and no `reach-granted` names a draft, whether the trigger is the draft's own or a published parent's), and
 * C4 refined (28.080: the recipient's OWN draft is named only once they can no longer open it).
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

it('28.073 the author receives their draft\'s events, nobody else does, and no reach-granted names the draft, from its own assignment past its history or a published parent\'s walk; control: the published twin reaches all, its assignment is noticed, the published sibling is named', async () => {
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
  // a grant trigger on the published twin: the control of the mid-cursor leg at the end
  await record(ticketEvent(ws, 'ticket.assigned', twin, { assigneeId: assignee }, author));

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

  // The published-parent leg, for the case line's own subjects. A grant trigger on a published parent walks its
  // `inherit` children (`audienceDependents`), so a draft child IS a candidate there, and only the per-candidate
  // `canSee` in `grantNoticeFor` keeps it off the notice. All three tickets are created below the cursor, so
  // `withHeadSeq` keeps every one the filter admits; the published sibling, named in the same item, is the control.
  // It runs BEFORE the author's mid-cursor leg, which deleting that `canSee` would also red.
  const [parent, draftChild, sibling] = [newUlid(), newUlid(), newUlid()];
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: parent });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: draftChild, parentId: parent, draftBy: author, birthAssigneeId: assignee });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: sibling, parentId: parent });
  const parentAssign = await record(ticketEvent(ws, 'ticket.assigned', parent, { assigneeId: assignee }, owner));
  for (const [name, viewer] of [['owner', owner], ['admin', admin], ['assignee', assignee]] as const) {
    const notices = idsOf(await collect(viewer, ws, parentAssign.workspaceSeq - 1)).filter((id) => id.startsWith('reach-granted'));
    expect(notices, `parent leg: ${name}`).toEqual([`reach-granted:${parent},${sibling}`]);
  }

  // The author's leg at a cursor PAST the draft's creation and edit. From cursor 0 `withHeadSeq` drops every
  // candidate, so the cursor-0 assert above holds whatever the filter does; from `edit`, the draft's own
  // `ticket.assigned` is a grant trigger with history at or below the cursor, and only `canSee` keeps it unnamed.
  const mid = idsOf(await collect(author, ws, edit.workspaceSeq));
  expect(mid, 'author mid-cursor').toContain(assign.id); // the draft's trigger is on this stream, past G2
  // CONTROL in one assert with the leg: the twin's trigger at the same cursor IS noticed, the draft's is not
  expect(mid.filter((id) => id.startsWith('reach-granted')), 'author mid-cursor').toEqual([`reach-granted:${twin}`]);
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

/** Ledger row plus EVERY projection: `record` applies only the visibility-side ones, and a publish also moves `proj_tickets`. */
async function recordFull(env: LedgerEvent): Promise<LedgerEvent> {
  await appendTestEvent(db.pool, env);
  const client = await db.pool.connect();
  try {
    for (const projection of buildProjectionRegistry().all()) await projection.apply(env, client);
  } finally {
    client.release();
  }
  return env;
}

it('28.095 publish reaches the readers: an online reader is sent a reach-granted notice naming the ticket (not its draft child), an away reader gets the events in order, and before the publish neither is sent anything', async () => {
  const ws = newUlid();
  const project = newUlid();
  const [author, online, away] = [newUlid(), newUlid(), newUlid()];
  await seedProject(db.pool, ws, project);
  for (const user of [author, online, away]) await seedMember(db.pool, ws, user, 'member');
  // A publish re-pins the ticket to its type's CURRENT binding, so the real ticket projection must find the type
  // and its workflow; `proj_workflows` belongs to one workspace per workflow id, so this world publishes its own.
  const workflowId = `wf-reach-${ws.slice(-8).toLowerCase()}`;
  await recordFull(
    testEnvelope({
      workspaceId: ws, entity: { kind: 'workflow', id: workflowId }, type: 'workflow.defined', actorId: author,
      payload: {
        id: workflowId, version: 1, name: 'Reach flow', initialStateId: 'todo',
        states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }],
        transitions: [{ from: 'todo', to: 'done', rules: [] }],
      },
    }),
  );
  await recordFull(
    testEnvelope({
      workspaceId: ws, entity: { kind: 'ticket-type', id: newUlid() }, type: 'ticket-type.defined', actorId: author,
      payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId, fields: [] },
    }),
  );
  const parent = newUlid();
  const child = newUlid();
  const twin = newUlid();
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: parent, workflowId, draftBy: author });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: child, parentId: parent, workflowId, draftBy: author });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: twin, workflowId, createdBy: author });
  const edit = await record(ticketEvent(ws, 'ticket.field_set', parent, { fieldId: 'title', value: 'drafted' }, author));
  // a reach-grant TRIGGER on the draft before the publish (the owner's ruling: probe the grant for a leak): the draft
  // is assigned to the online reader, and still nothing about it may reach them until the publish
  const assign = await recordFull(ticketEvent(ws, 'ticket.assigned', parent, { assigneeId: online }, author));
  const twinEdit = await record(ticketEvent(ws, 'ticket.field_set', twin, { fieldId: 'title', value: 'twin edited' }, author));

  // BEFORE the publish: the stream is live for both readers (the twin's edit) and says nothing of the draft
  for (const [name, viewer] of [['online', online], ['away', away]] as const) {
    const items = await collect(viewer, ws, 0);
    expect(idsOf(items), name).toContain(twinEdit.id);
    expect(idsOf(items), name).not.toContain(edit.id);
    expect(idsOf(items), name).not.toContain(assign.id);
    expect(idsOf(items), name).not.toContain(`reach-granted:${parent}`); // the assignment granted nothing
    expect(entityIds(items), name).not.toContain(parent);
    expect(idsOf(items).join('|'), name).not.toContain(parent);
  }

  const published = await recordFull(ticketEvent(ws, 'ticket.published', parent, { projectId: project }, author));

  // the online reader's cursor ran past the drafting: a notice, then the event
  const onlineIds = idsOf(await collect(online, ws, twinEdit.workspaceSeq));
  expect(onlineIds.filter((id) => id === `reach-granted:${parent}`)).toHaveLength(1); // once, at the publish
  expect(onlineIds.indexOf(`reach-granted:${parent}`)).toBeLessThan(onlineIds.indexOf(published.id));
  expect(onlineIds.join('|')).not.toContain(child); // the child is still a draft: not named

  // the away reader's cursor is at the start: the ordinary stream carries everything, in order
  const awayIds = idsOf(await collect(away, ws, 0));
  expect(awayIds).toEqual(expect.arrayContaining([edit.id, assign.id, published.id]));
  expect(awayIds.indexOf(edit.id)).toBeLessThan(awayIds.indexOf(assign.id));
  expect(awayIds.indexOf(assign.id)).toBeLessThan(awayIds.indexOf(published.id));
  expect(awayIds.join('|')).not.toContain(child);
});

it('28.119 the author\'s device receives a draft-side link, nobody else does, and S\'s own stream is unchanged; control: a published twin\'s link reaches all', async () => {
  const ws = newUlid();
  const project = newUlid();
  const [author, owner, admin, third] = [newUlid(), newUlid(), newUlid(), newUlid()];
  await seedProject(db.pool, ws, project);
  await seedMember(db.pool, ws, owner, 'owner');
  await seedMember(db.pool, ws, admin, 'admin');
  await seedMember(db.pool, ws, author, 'member');
  await seedMember(db.pool, ws, third, 'member');
  const [s, s2, draft] = [newUlid(), newUlid(), newUlid()];
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: s, createdBy: owner });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: s2, createdBy: owner });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: draft, draftBy: author });
  const draftSide = await record(ticketEvent(ws, 'ticket.link_added', draft, { kind: 'blocks', targetId: draft, from: s }, author));
  const twin = await record(ticketEvent(ws, 'ticket.link_added', s2, { kind: 'blocks', targetId: s }, owner));

  expect(idsOf(await collect(author, ws, 0))).toContain(draftSide.id);
  for (const [name, viewer] of [['owner', owner], ['admin', admin], ['third', third]] as const) {
    const items = await collect(viewer, ws, 0);
    expect(idsOf(items), name).toContain(twin.id); // CONTROL: the stream is live for this viewer
    expect(idsOf(items), name).not.toContain(draftSide.id);
    expect(entityIds(items), name).not.toContain(draft);
    expect(JSON.stringify(items), name).not.toContain(draft); // S's own events name no draft
  }
});
