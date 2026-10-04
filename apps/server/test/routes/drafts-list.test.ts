import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { listMyDrafts } from '../../src/read/drafts.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { DRAFT_TITLE, seedDraftWorld, type DraftWorld } from '../helpers/draft-world.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';
import { seedMember, seedTicket } from '../helpers/seed.js';

/**
 * Drafts T4, door G8 (spec §12.2, §13): the two reads of "my drafts". The subject is the session user; nobody
 * else's drafts are ever listed, the owner's and the admins' included, and a draft has no key to list.
 *
 * Order: `listMyDrafts` sorts by the draft's LAST ledger event. `makeCommitted` ticks its clock per event, and the
 * world's two planted transitions carry `STALE_SINCE`, older than every seeded creation, so they move no order:
 * the root draft (created last), the active one (its due date), then the first.
 */

let db: TestDatabase;
let read: ReadWorld;
let world: DraftWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  world = await seedDraftWorld(db.pool, read);
}, 120_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

const WS = (): string => read.world.workspaceId;
const get = (role: ReadRole, url: string) => read.app.inject({ method: 'GET', url, headers: read.authOf(role) });

type Item = { ticketId: string; projectId: string; projectName: string; typeId: string; title: string; parentId: string | null; updatedAt: string; attachmentCount: number; workspaceId?: string };
const items = async (role: ReadRole, url: string): Promise<Item[]> => {
  const res = await get(role, url);
  expect(res.statusCode, `${role} ${url}`).toBe(200);
  return (res.json() as { items: Item[] }).items;
};

describe('28.078 G8: GET /v1/workspaces/:id/drafts', () => {
  const url = (): string => `/v1/workspaces/${WS()}/drafts`;

  it('lists the caller\'s own drafts newest first with no key, counts the draft\'s own attachments, and lists nothing for anyone else', async () => {
    // two uploads on one draft and one on the published twin: only the first two count
    const upload = (ticketId: string, n: number) =>
      db.pool.query(
        `INSERT INTO attachments (id, workspace_id, ticket_id, uploader_id, filename, mime, size, object_key)
         VALUES ($1, $2, $3, $4, $5, 'text/plain', 3, $6)`,
        [newUlid(), WS(), ticketId, read.userIds.member, `f${n}.txt`, `w/${WS()}/a/${newUlid()}`],
      );
    await upload(world.draftId, 1);
    await upload(world.draftId, 2);
    await upload(world.twinId, 3);

    const mine = await items('member', url());
    // the last event of each draft orders them: the root draft, then the active one (its due date), then the first
    expect(mine.map((i) => i.ticketId)).toEqual([world.rootDraftId, world.draftActiveId, world.draftId]);
    const first = mine.find((i) => i.ticketId === world.draftId);
    expect(first).toMatchObject({ projectId: read.world.projectId, typeId: 'task', title: DRAFT_TITLE, parentId: world.parentId, attachmentCount: 2 });
    expect(typeof first?.projectName === 'string' && first.projectName.length > 0).toBe(true);
    expect(Number.isNaN(Date.parse(first?.updatedAt ?? ''))).toBe(false);
    for (const item of mine) expect(Object.keys(item), item.ticketId).not.toContain('key');
    expect(mine.find((i) => i.ticketId === world.rootDraftId)?.attachmentCount).toBe(0);

    // CONTROL: the lead lists exactly theirs
    expect((await items('projectLead', url())).map((i) => i.ticketId)).toEqual([world.guestDraftId]);
    // nobody else has a draft: owner, admin, guest and outsider list nothing, the draft's assignee and the guest
    // named in the lead's draft's audience included
    for (const role of ['owner', 'admin', 'guest', 'outsider'] as const) expect(await items(role, url()), role).toEqual([]);
    for (const role of ['stranger', 'neighbour'] as const) {
      const res = await get(role, url());
      expect(res.statusCode, role).toBe(404);
      expect(res.json(), role).toEqual({ error: 'not_found' });
    }
  });

  it('R18 and the discard flag: an author who is no longer a member lists nothing; a discarded draft is not listed', async () => {
    const { workspaceId, projectId } = read.world;
    const author = newUlid();
    const ticketId = newUlid();
    await seedMember(db.pool, workspaceId, author, 'member');
    await seedTicket(db.pool, { workspaceId, projectId, ticketId, draftBy: author });
    expect((await listMyDrafts(db.pool, author, workspaceId)).map((i) => i.ticketId)).toEqual([ticketId]);
    await db.pool.query('UPDATE proj_tickets SET draft_discarded = true WHERE ticket_id = $1', [ticketId]);
    expect(await listMyDrafts(db.pool, author, workspaceId)).toEqual([]);
    await db.pool.query('UPDATE proj_tickets SET draft_discarded = NULL WHERE ticket_id = $1', [ticketId]);
    expect(await listMyDrafts(db.pool, author, workspaceId)).toHaveLength(1);
    await db.pool.query(
      "UPDATE proj_memberships SET role = 'guest' WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'",
      [workspaceId, author],
    );
    expect(await listMyDrafts(db.pool, author, workspaceId)).toEqual([]); // demoted: closed, not erased
    await db.pool.query(
      "UPDATE proj_memberships SET role = 'member' WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'",
      [workspaceId, author],
    );
    expect(await listMyDrafts(db.pool, author, workspaceId)).toHaveLength(1); // CONTROL: the role was the difference
    await db.pool.query('DELETE FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2', [workspaceId, author]);
    expect(await listMyDrafts(db.pool, author, workspaceId)).toEqual([]);
  });
});

describe('28.079 G8: GET /v1/me/drafts', () => {
  it('lists the caller\'s drafts across workspaces, never another person\'s, and narrows by workspace and project', async () => {
    const nb = read.neighbour;
    const nbDraft = newUlid();
    await seedTicket(db.pool, { workspaceId: nb.workspaceId, projectId: nb.projectId, ticketId: nbDraft, draftBy: read.userIds.neighbour });

    const mine = await items('member', '/v1/me/drafts');
    expect(mine.map((i) => i.ticketId)).toEqual([world.rootDraftId, world.draftActiveId, world.draftId]);
    for (const item of mine) expect(item.workspaceId, item.ticketId).toBe(WS());

    const theirs = await items('neighbour', '/v1/me/drafts');
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({ ticketId: nbDraft, workspaceId: nb.workspaceId, projectId: nb.projectId });

    // narrowing: the right workspace and project answer, the wrong ones answer nothing
    expect((await items('member', `/v1/me/drafts?workspaceId=${WS()}`)).map((i) => i.ticketId)).toEqual(mine.map((i) => i.ticketId));
    expect(await items('member', `/v1/me/drafts?workspaceId=${nb.workspaceId}`)).toEqual([]);
    expect(await items('member', `/v1/me/drafts?projectId=${nb.projectId}`)).toEqual([]);
    expect((await items('member', `/v1/me/drafts?projectId=${read.world.projectId}`)).length).toBe(mine.length);
    for (const role of ['owner', 'admin', 'guest', 'outsider', 'stranger'] as const) expect(await items(role, '/v1/me/drafts'), role).toEqual([]);
  });
});
