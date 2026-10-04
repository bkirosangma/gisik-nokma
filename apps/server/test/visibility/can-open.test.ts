import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { canOpen, isOpenableDraft, ticketAccess } from '../../src/visibility/can-open.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedDraftWorld, withDraftsOpened, type DraftWorld } from '../helpers/draft-world.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';
import { seedMember, seedProject, seedTicket } from '../helpers/seed.js';

/**
 * Drafts T4, case 28.070 (spec §4.2, group D): the door predicate. `canSee` is closed for every draft (T3), the
 * author included, so the author's way in is `isOpenableDraft`, and `ticketAccess` is the three-way answer every
 * door asks. R18 (the author must still be able to create in the draft's project) lives in `holdsDraftRights`.
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

describe('28.070 ticketAccess, canOpen and isOpenableDraft', () => {
  it('the author opens a draft, nobody else does; a published ticket is visible as before; the flag is what decides', async () => {
    const author = read.userIds.member; // seedDraftWorld's draft author
    expect(await ticketAccess(db.pool, author, world.draftId)).toBe('own-draft');
    expect(await canOpen(db.pool, author, world.draftId)).toBe(true);
    expect(await isOpenableDraft(db.pool, author, world.draftId)).toBe(true);
    // one planted in `doing` and a root one are the author's too
    expect(await ticketAccess(db.pool, author, world.draftActiveId)).toBe('own-draft');
    expect(await ticketAccess(db.pool, author, world.rootDraftId)).toBe('own-draft');

    for (const role of ['owner', 'admin', 'outsider', 'guest', 'projectLead'] as const) {
      const userId = read.userIds[role];
      expect(await ticketAccess(db.pool, userId, world.draftId), role).toBe('none'); // outsider is the draft's assignee
      expect(await canOpen(db.pool, userId, world.draftId), role).toBe(false);
      expect(await isOpenableDraft(db.pool, userId, world.draftId), role).toBe(false);
    }
    // another person's draft is not the author's to open; the guest named in its planted audience does not open it either
    expect(await ticketAccess(db.pool, author, world.guestDraftId)).toBe('none');
    expect(await ticketAccess(db.pool, read.userIds.guest, world.guestDraftId)).toBe('none');
    expect(await ticketAccess(db.pool, read.userIds.projectLead, world.guestDraftId)).toBe('own-draft');

    // CONTROL: the published twin is `visible` to the readers who saw it before, and the author is not special there
    for (const role of ['owner', 'admin', 'member', 'outsider'] as const) {
      expect(await ticketAccess(db.pool, read.userIds[role], world.twinId), role).toBe('visible');
    }
    // unknown user, unknown ticket
    expect(await ticketAccess(db.pool, newUlid(), world.draftId)).toBe('none');
    expect(await ticketAccess(db.pool, author, newUlid())).toBe('none');

    // the flag decides: cleared, the owner reads it as an ordinary ticket and the author is `visible` too
    await withDraftsOpened(db.pool, [world.draftId], async () => {
      expect(await ticketAccess(db.pool, read.userIds.owner, world.draftId)).toBe('visible');
      expect(await ticketAccess(db.pool, author, world.draftId)).toBe('visible');
      expect(await isOpenableDraft(db.pool, author, world.draftId)).toBe(false); // no longer a draft
    });
  });

  it('R18: demoted to guest, revoked, discarded or with the project in the trash, the author no longer opens it; restored, they do', async () => {
    const { workspaceId, projectId } = read.world;
    const author = newUlid();
    const ticketId = newUlid();
    await seedMember(db.pool, workspaceId, author, 'member');
    await seedTicket(db.pool, { workspaceId, projectId, ticketId, draftBy: author });
    const access = (): Promise<string> => ticketAccess(db.pool, author, ticketId);
    expect(await access()).toBe('own-draft');

    const setRole = (role: string): Promise<unknown> =>
      db.pool.query(
        "UPDATE proj_memberships SET role = $3 WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'",
        [workspaceId, author, role],
      );
    await setRole('guest');
    expect(await access()).toBe('none');
    expect(await isOpenableDraft(db.pool, author, ticketId)).toBe(false);
    await setRole('member');
    expect(await access()).toBe('own-draft'); // CONTROL: the role was the only difference

    await db.pool.query('UPDATE proj_tickets SET draft_discarded = true WHERE ticket_id = $1', [ticketId]);
    expect(await access()).toBe('none');
    await db.pool.query('UPDATE proj_tickets SET draft_discarded = NULL WHERE ticket_id = $1', [ticketId]);
    expect(await access()).toBe('own-draft');

    // R18's project half: rule A puts only LIVE projects in a member's reach, so a draft whose project is in the
    // trash is closed to its author; restored, it opens again
    const trashed = newUlid();
    const inTrash = newUlid();
    await seedProject(db.pool, workspaceId, trashed);
    await seedTicket(db.pool, { workspaceId, projectId: trashed, ticketId: inTrash, draftBy: author });
    expect(await ticketAccess(db.pool, author, inTrash)).toBe('own-draft');
    await db.pool.query('UPDATE proj_projects SET deleted_at = now() WHERE project_id = $1', [trashed]);
    expect(await ticketAccess(db.pool, author, inTrash)).toBe('none');
    await db.pool.query('UPDATE proj_projects SET deleted_at = NULL WHERE project_id = $1', [trashed]);
    expect(await ticketAccess(db.pool, author, inTrash)).toBe('own-draft');

    await db.pool.query('DELETE FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2', [workspaceId, author]);
    expect(await access()).toBe('none');
  });
});
