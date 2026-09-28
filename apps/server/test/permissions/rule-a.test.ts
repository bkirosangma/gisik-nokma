import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import {
  checkPermission,
  GUESTS_CANNOT_CREATE_REASON,
  PERMISSION_ROLE_RULE,
} from '../../src/permissions/check-permission.js';
import { hasProjectAdminRights, resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { SqlParams } from '../../src/read/sql-params.js';
import { visibleProjects } from '../../src/read/visible-projects.js';
import { LIVE_TICKET_WHERE, visibleTicketsWhere } from '../../src/read/visible-where.js';
import { canSee } from '../../src/visibility/can-see.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import {
  applyAll,
  seedGuest,
  seedMember,
  seedProject,
  seedTicket,
  setVisibilityEnv,
} from '../helpers/seed.js';

/**
 * Access plan Task 1 — rule A (owner ruling 2026-09-29: "admins and members see
 * every project in their workspace by default"), cases 6.180–6.186 and 6.217.
 *
 * EVERY project here is FOUNDED with `seedProject` first. Rule A reads
 * `proj_projects`, and `seedTicket`/`seedMember` found nothing on their own
 * (`test/helpers/seed.ts:95-103`), so a fixture that skipped the founding
 * would pass the OLD rule and the new one alike and its mutation would be
 * vacuous.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

async function world() {
  const ws = newUlid();
  const owner = newUlid();
  const admin = newUlid();
  const member = newUlid();
  const guest = newUlid();
  const project = newUlid();
  const ticket = newUlid();
  await seedMember(db.pool, ws, owner, 'owner');
  await seedMember(db.pool, ws, admin, 'admin');
  await seedMember(db.pool, ws, member, 'member');
  await seedGuest(db.pool, ws, guest);
  await seedProject(db.pool, ws, project);
  // Born in project mode — the root default (`proj-visibility.ts:103`).
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: ticket });
  return { ws, owner, admin, member, guest, project, ticket };
}

function createTicket(ws: string, projectId: string, actorId: string): EventEnvelope {
  return testEnvelope({
    workspaceId: ws,
    entity: { kind: 'ticket', id: newUlid() },
    type: 'ticket.created',
    payload: { typeId: 'task', projectId, parentId: null, title: 'Count the float' },
    actorId,
  });
}

async function eventCount(): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM events');
  return rows[0]!.n;
}

describe('6.180 rule A: admins and members see project-mode work in every founded project', () => {
  it('6.180 admin and member on no project see it; a guest does not; CONTROL: the guest sees an explicit ticket naming them', async () => {
    const w = await world();
    expect(await canSee(db.pool, w.admin, w.ticket)).toBe(true);
    expect(await canSee(db.pool, w.member, w.ticket)).toBe(true);
    expect(await canSee(db.pool, w.guest, w.ticket)).toBe(false);

    const named = newUlid();
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: w.project, ticketId: named });
    await applyAll(db.pool, [setVisibilityEnv(w.ws, named, 'explicit', [w.guest])]);
    expect(await canSee(db.pool, w.guest, named)).toBe(true);
  });
});

describe('6.181 rule A merges: an explicit projectAdmin flag survives', () => {
  it('6.181 project admin on their own project, not on the rule-A one; CONTROL: the rule-A one is in the set', async () => {
    const w = await world();
    const lead = newUlid();
    const other = newUlid();
    await seedProject(db.pool, w.ws, other);
    await seedMember(db.pool, w.ws, lead, 'member', [{ projectId: w.project, projectAdmin: true }]);

    const eff = await resolveEffectiveRole(db.pool, lead, w.ws);
    expect(hasProjectAdminRights(eff, w.project)).toBe(true);
    expect(hasProjectAdminRights(eff, other)).toBe(false);
    expect(eff.projects.get(other)).toEqual({ projectAdmin: false });
  });
});

describe('6.182 D1: the owner may create a ticket in a project nobody put them on', () => {
  it('6.182 the gate answers null for the owner; CONTROL: a guest is still refused', async () => {
    const w = await world();
    const gate = (env: EventEnvelope, userId: string) => checkPermission(env, { db: db.pool, sessionUserId: userId });
    expect(await gate(createTicket(w.ws, w.project, w.owner), w.owner)).toBeNull();
    expect(await gate(createTicket(w.ws, w.project, w.guest), w.guest)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: GUESTS_CANNOT_CREATE_REASON,
    });
  });
});

async function deleteProject(ws: string, projectId: string, actorId: string): Promise<void> {
  await applyCommitted(db.pool, [
    makeCommitted({ workspaceId: ws, actorId, entity: { kind: 'project', id: projectId }, type: 'project.deleted', payload: {} }),
  ]);
}

describe('6.183 visibleProjects under rule A keeps trash Plan 1 containment', () => {
  it('6.183 a member gets every live project and not the deleted one; CONTROL: the owner omits it too', async () => {
    const w = await world();
    const gone = newUlid();
    await seedProject(db.pool, w.ws, gone);
    await deleteProject(w.ws, gone, w.owner);

    const eff = await resolveEffectiveRole(db.pool, w.member, w.ws);
    expect(eff.projects.has(gone)).toBe(false);
    expect((await visibleProjects(db.pool, eff, w.ws)).map((p) => p.projectId)).toEqual([w.project]);

    const ownerEff = await resolveEffectiveRole(db.pool, w.owner, w.ws);
    expect((await visibleProjects(db.pool, ownerEff, w.ws)).map((p) => p.projectId)).toEqual([w.project]);
  });
});

describe('6.184 W2: no repair — the production shape sees everything', () => {
  it('6.184 a workspace grant with zero roster rows sees every founded project, and resolving appends nothing', async () => {
    const w = await world();
    const second = newUlid();
    const secondTicket = newUlid();
    await seedProject(db.pool, w.ws, second);
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: second, ticketId: secondTicket });

    const rosterRows = async () =>
      (
        await db.pool.query(
          `SELECT project_id FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'project'`,
          [w.ws, w.member],
        )
      ).rows;
    expect(await rosterRows()).toEqual([]);

    const before = await eventCount();
    const eff = await resolveEffectiveRole(db.pool, w.member, w.ws);
    expect((await visibleProjects(db.pool, eff, w.ws)).map((p) => p.projectId).sort()).toEqual(
      [w.project, second].sort(),
    );
    expect(await canSee(db.pool, w.member, secondTicket)).toBe(true);
    expect(await eventCount()).toBe(before);
    expect(await rosterRows()).toEqual([]);
  });
});

describe('6.185 a guest is not on a project by rule A', () => {
  it('6.185 the guest set is empty beside a founded project; CONTROL: the member set has it', async () => {
    const w = await world();
    expect([...(await resolveEffectiveRole(db.pool, w.guest, w.ws)).projects.keys()]).toEqual([]);
    expect([...(await resolveEffectiveRole(db.pool, w.member, w.ws)).projects.keys()]).toEqual([w.project]);
  });
});

describe('6.186 a deleted project’s tickets stay out of a live list for its explicit member', () => {
  it('6.186 LIVE_TICKET_WHERE drops it though canSee answers true; CONTROL: the live project’s ticket is listed', async () => {
    const w = await world();
    const gone = newUlid();
    const goneTicket = newUlid();
    const insider = newUlid();
    await seedProject(db.pool, w.ws, gone);
    await seedMember(db.pool, w.ws, insider, 'member', [{ projectId: gone }]);
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: gone, ticketId: goneTicket });
    await deleteProject(w.ws, gone, w.owner);

    const eff = await resolveEffectiveRole(db.pool, insider, w.ws);
    const params = new SqlParams();
    const { rows } = await db.pool.query<{ ticket_id: string }>(
      `SELECT t.ticket_id FROM proj_tickets t JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE t.workspace_id = ${params.add(w.ws)} AND ${visibleTicketsWhere(eff, insider, params)}
          AND ${LIVE_TICKET_WHERE}
        ORDER BY t.ticket_id`,
      params.toArray(),
    );
    expect(rows.map((r) => r.ticket_id)).toEqual([w.ticket]);
    // The explicit member's canSee is the pre-rule-A answer, unchanged: the
    // containment gap trash Plan 1 left for explicit members is not closed here.
    expect(await canSee(db.pool, insider, goneTicket)).toBe(true);
  });
});

describe('6.217 rule A does not reach a deleted project (coordinator amendment, 2026-09-29)', () => {
  /**
   * `canSee` is the whole of the question the canSee-only doors ask — ticket
   * history (`routes/ticket-history.ts:281`), attachments, reconcile and the
   * stream all call it and nothing else about deletion — so it is tested here
   * directly rather than through one route. Without the `deleted_at IS NULL`
   * filter every admin and member would reach a deleted project's tickets
   * through those doors; with it, only the people explicitly on the project do,
   * exactly as before rule A.
   */
  it('6.217 a member NOT on the deleted project cannot see its ticket; CONTROL: an explicit member still can', async () => {
    const w = await world();
    const gone = newUlid();
    const goneTicket = newUlid();
    const insider = newUlid();
    await seedProject(db.pool, w.ws, gone);
    await seedMember(db.pool, w.ws, insider, 'member', [{ projectId: gone }]);
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: gone, ticketId: goneTicket });
    // Visible to the member BEFORE the delete, through rule A — so the `false`
    // below is the filter, not a fixture that never worked.
    expect(await canSee(db.pool, w.member, goneTicket)).toBe(true);
    await deleteProject(w.ws, gone, w.owner);

    expect((await resolveEffectiveRole(db.pool, w.member, w.ws)).projects.has(gone)).toBe(false);
    expect(await canSee(db.pool, w.member, goneTicket)).toBe(false);
    expect(await canSee(db.pool, w.admin, goneTicket)).toBe(false);
    expect(await canSee(db.pool, insider, goneTicket)).toBe(true);
  });

  /**
   * Final review (2026-09-29), Important: the assignee arm (W3) ORs the head
   * row's assignee into `canSee` WITHOUT asking whether the project is deleted,
   * so a person NOT on a deleted project who was assigned one of its tickets
   * kept reach to it through every canSee-only door. The arm now excludes a
   * deleted project exactly as rule A does.
   */
  it('6.217 an ASSIGNEE of a ticket in a deleted project cannot see it either; CONTROL: they could before the delete', async () => {
    const w = await world();
    const gone = newUlid();
    const goneTicket = newUlid();
    await seedProject(db.pool, w.ws, gone);
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: gone, ticketId: goneTicket, assigneeId: w.guest });
    expect(await canSee(db.pool, w.guest, goneTicket)).toBe(true);
    await deleteProject(w.ws, gone, w.owner);
    expect(await canSee(db.pool, w.guest, goneTicket)).toBe(false);
  });
});
