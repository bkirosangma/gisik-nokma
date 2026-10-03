import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { resolveEffectiveRole, type EffectiveRole } from '../../src/permissions/effective-role.js';
import { SqlParams } from '../../src/read/sql-params.js';
import { ticketIsLive } from '../../src/read/live-ticket.js';
import { LIVE_BASE_WHERE, LIVE_TICKET_WHERE, visibleTicketsWhere } from '../../src/read/visible-where.js';
import { canSee, canSeeResolved, type ResolvedVisibility } from '../../src/visibility/can-see.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedDraftWorld, withDraftsOpened, type DraftWorld } from '../helpers/draft-world.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * Drafts T3, group A (spec §4.1-§4.2): the four shared predicates close a draft for EVERY viewer, the
 * author, the owner and the assignee included (28.046-28.049). The author's doors are T4.
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
const VIEWERS: readonly ReadRole[] = ['owner', 'admin', 'member', 'outsider', 'guest'];

/** A hand-built role for the PURE case, with `can-see.test.ts`'s justification: it feeds a pure function only. */
const effOf = (role: EffectiveRole['workspaceRole'], projects: readonly string[] = []): EffectiveRole =>
  ({ workspaceRole: role, projects: new Map(projects.map((p) => [p, { projectAdmin: false }] as const)) }) as unknown as EffectiveRole;

describe('28.046 canSeeResolved closes a draft for everyone', () => {
  it('false for owner, admin, the author, another member and a listed guest in every mode; control: the same inputs with no draft are true as before', () => {
    const PRJ = newUlid();
    const AUTHOR = newUlid();
    const GUEST = newUlid();
    const viewers = [
      { name: 'owner', eff: effOf('owner'), userId: newUlid() },
      { name: 'admin', eff: effOf('admin', [PRJ]), userId: newUlid() },
      { name: 'the author (member)', eff: effOf('member', [PRJ]), userId: AUTHOR },
      { name: 'another member', eff: effOf('member', [PRJ]), userId: newUlid() },
      { name: 'a guest named in the list', eff: effOf('guest'), userId: GUEST },
    ];
    for (const mode of ['workspace', 'project', 'explicit'] as const) {
      for (const { name, eff, userId } of viewers) {
        const v = (draftAuthorId: string | null): ResolvedVisibility => ({
          workspaceId: 'ws', projectId: PRJ, resolvedMode: mode, resolvedUserIds: [AUTHOR, GUEST, userId], draftAuthorId,
        });
        expect(canSeeResolved(eff, userId, v(AUTHOR)), `${name} / ${mode}: a draft`).toBe(false);
        // the guest's decision table is unchanged: only an explicit list admits it
        const expectedWithoutDraft = name.startsWith('a guest') ? mode === 'explicit' : true;
        expect(canSeeResolved(eff, userId, v(null)), `${name} / ${mode}: control`).toBe(expectedWithoutDraft);
      }
    }
  });
});

describe('28.047 canSee closes it before the owner case and the assignee arm', () => {
  it('nobody sees a draft, the assignee sees the published twin and not the draft; control: opened, the owner and the listed guest see theirs', async () => {
    for (const role of VIEWERS) {
      const userId = read.userIds[role];
      for (const id of world.draftIds) {
        expect(await canSee(db.pool, userId, id), `${role} / ${id}`).toBe(false);
      }
    }
    // the assignee arm is live for the twin and closed for the draft: the SAME assignee, the SAME parent
    expect(await canSee(db.pool, read.userIds.outsider, world.twinId)).toBe(true);
    expect(await canSee(db.pool, read.userIds.outsider, world.draftId)).toBe(false);
    for (const role of ['owner', 'admin', 'member'] as const) {
      expect(await canSee(db.pool, read.userIds[role], world.twinId), `${role} twin`).toBe(true);
    }
    await withDraftsOpened(db.pool, world.draftIds, async () => {
      expect(await canSee(db.pool, read.userIds.owner, world.draftId)).toBe(true);
      expect(await canSee(db.pool, read.userIds.outsider, world.draftId)).toBe(true);
      expect(await canSee(db.pool, read.userIds.guest, world.guestDraftId)).toBe(true);
    });
  });
});

describe('28.048 visibleTicketsWhere agrees with canSee on drafts', () => {
  async function sqlVisible(userId: string): Promise<Set<string>> {
    const eff = await resolveEffectiveRole(db.pool, userId, WS());
    const params = new SqlParams();
    const ws = params.add(WS());
    const where = visibleTicketsWhere(eff, userId, params);
    const { rows } = await db.pool.query<{ ticket_id: string }>(
      `SELECT v.ticket_id FROM proj_visibility v WHERE v.workspace_id = ${ws} AND ${where}`,
      params.toArray(),
    );
    return new Set(rows.map((row) => row.ticket_id));
  }
  const ALL = (): string[] => [world.parentId, world.twinId, world.twinActiveId, ...world.draftIds];

  it('the SQL membership equals canSee for every role and ticket, and no role holds a draft; control: opened, both sides flip together, the owner included', async () => {
    for (const role of VIEWERS) {
      const userId = read.userIds[role];
      const sql = await sqlVisible(userId);
      for (const id of ALL()) expect(sql.has(id), `${role} / ${id}`).toBe(await canSee(db.pool, userId, id));
      for (const id of world.draftIds) expect(sql.has(id), `${role} holds draft ${id}`).toBe(false);
    }
    expect((await sqlVisible(read.userIds.owner)).has(world.twinId)).toBe(true);
    await withDraftsOpened(db.pool, world.draftIds, async () => {
      for (const role of VIEWERS) {
        const userId = read.userIds[role];
        const sql = await sqlVisible(userId);
        for (const id of ALL()) expect(sql.has(id), `opened ${role} / ${id}`).toBe(await canSee(db.pool, userId, id));
      }
      expect((await sqlVisible(read.userIds.owner)).has(world.draftId)).toBe(true); // the owner's constant branch
    });
  });
});

describe('28.049 LIVE_TICKET_WHERE closes a draft and LIVE_BASE_WHERE does not', () => {
  const live = async (where: string, id: string): Promise<boolean> =>
    (await db.pool.query(`SELECT 1 FROM proj_tickets t WHERE t.ticket_id = $1 AND ${where}`, [id])).rowCount === 1;

  it('closed for a draft, open for its twin; the base is the doors view; a soft-deleted ticket is closed by both', async () => {
    expect(await live(LIVE_TICKET_WHERE, world.draftId)).toBe(false);
    expect(await live(LIVE_BASE_WHERE, world.draftId)).toBe(true);
    expect(await live(LIVE_TICKET_WHERE, world.twinId)).toBe(true); // control
    expect(LIVE_TICKET_WHERE).toBe(`${LIVE_BASE_WHERE} AND t.draft_author_id IS NULL`);
    expect(await ticketIsLive(db.pool, WS(), world.draftId)).toBe(false);
    expect(await ticketIsLive(db.pool, WS(), world.twinId)).toBe(true);

    const gone = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS(), actorId: read.world.owner, entity: { kind: 'ticket', id: gone }, type: 'ticket.created',
        payload: { typeId: 'task', projectId: read.world.projectId, parentId: null, title: 'to be deleted' },
      }),
      makeCommitted({ workspaceId: WS(), actorId: read.world.owner, entity: { kind: 'ticket', id: gone }, type: 'ticket.deleted', payload: {} }),
    ]);
    expect(await live(LIVE_BASE_WHERE, gone)).toBe(false);
    expect(await live(LIVE_TICKET_WHERE, gone)).toBe(false);
  });
});
