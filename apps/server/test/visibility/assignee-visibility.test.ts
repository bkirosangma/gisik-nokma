import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { EffectiveRole } from '../../src/permissions/effective-role.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { SqlParams } from '../../src/read/sql-params.js';
import { visibleNotesWhere } from '../../src/read/visible-where.js';
import { canReadNote, loadNoteForVisibility } from '../../src/visibility/can-read-note.js';
import { assigneeSees, canSee } from '../../src/visibility/can-see.js';
import { isGrantBackfillTrigger } from '../../src/visibility/grant-backfill.js';
import { listVisibleTickets } from '../../src/visibility/visible-tickets.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture } from '../helpers/notes-fixture.js';
import {
  applyAll,
  revokeMember,
  seedGuest,
  seedMember,
  seedProject,
  seedTicket,
  setVisibilityEnv,
} from '../helpers/seed.js';

/**
 * Access plan Task 3 — the assignee sees their own ticket (owner ruling
 * 2026-09-29, W3), cases 6.187–6.193.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/** Hand-built for the pure case only — the same named-cast site `can-see.test.ts` uses. */
function eff(role: EffectiveRole['workspaceRole']): EffectiveRole {
  return { workspaceRole: role, projects: new Map() } as unknown as EffectiveRole;
}

/**
 * Moves the assignee on the HEAD ROW, the way `seedTicket`'s `insertTicketHead`
 * writes it (`test/helpers/seed.ts`): the seeded world has no workflow
 * definition for `proj_tickets`' reducer to fold a `ticket.assigned` through, and
 * what `canSee` reads is exactly this column.
 */
async function reassign(ticketId: string, assigneeId: string | null): Promise<void> {
  await db.pool.query('UPDATE proj_tickets SET assignee_id = $2 WHERE ticket_id = $1', [ticketId, assigneeId]);
}

async function world() {
  const ws = newUlid();
  const project = newUlid();
  const guest = newUlid();
  const member = newUlid();
  const assigned = newUlid();
  const sibling = newUlid();
  const parent = newUlid();
  const child = newUlid();
  const explicit = newUlid();
  await seedProject(db.pool, ws, project);
  await seedMember(db.pool, ws, member, 'member');
  await seedGuest(db.pool, ws, guest);
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: assigned, assigneeId: guest });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: sibling });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: parent });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: child, parentId: parent, assigneeId: guest });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: explicit });
  await applyAll(db.pool, [setVisibilityEnv(ws, explicit, 'explicit', [guest])]);
  return { ws, project, guest, member, assigned, sibling, parent, child, explicit };
}

describe('6.187 assigneeSees — pure', () => {
  it('6.187 true for the assignee at any role, false for a non-assignee, false with no role', () => {
    for (const role of ['guest', 'member', 'admin'] as const) {
      expect(assigneeSees(eff(role), 'u', 'u')).toBe(true);
      expect(assigneeSees(eff(role), 'u', 'someone-else')).toBe(false);
      expect(assigneeSees(eff(role), 'u', null)).toBe(false);
    }
    expect(assigneeSees(eff(null), 'u', 'u')).toBe(false);
  });
});

describe('6.188–6.190 the assignee arm against the real projections', () => {
  it('6.188 a guest sees the ticket assigned to them and nothing near it; CONTROL: the assigned child', async () => {
    const w = await world();
    expect(await canSee(db.pool, w.guest, w.assigned)).toBe(true);
    expect(await canSee(db.pool, w.guest, w.sibling)).toBe(false);
    expect(await canSee(db.pool, w.guest, w.parent)).toBe(false);
    expect(await canSee(db.pool, w.guest, w.child)).toBe(true);
  });

  it('6.189 reassigning takes it back; CONTROL: the new assignee sees it', async () => {
    const w = await world();
    const other = newUlid();
    await seedGuest(db.pool, w.ws, other);
    await reassign(w.assigned, other);
    expect(await canSee(db.pool, w.guest, w.assigned)).toBe(false);
    expect(await canSee(db.pool, other, w.assigned)).toBe(true);
  });

  it('6.190 listVisibleTickets agrees with canSee ticket by ticket; CONTROL: the exact set', async () => {
    const w = await world();
    const listed = (await listVisibleTickets(db.pool, w.guest, w.ws)).map((row) => row['ticket_id'] as string).sort();
    expect(listed).toEqual([w.assigned, w.child, w.explicit].sort());
    for (const id of [w.assigned, w.sibling, w.parent, w.child, w.explicit]) {
      expect(await canSee(db.pool, w.guest, id), id).toBe(listed.includes(id));
    }
  });
});

describe('6.191 a note is not opened by an assignment', () => {
  it('6.191 the assignee of the attached ticket cannot read the inherit note; CONTROL: the listed guest can', async () => {
    const f = await seedNotesFixture(db.pool);
    // TE is explicit to `guestListed` (the fixture's own shape); assign it to
    // `guestUnlisted`, who is on no list and no project.
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: f.WS,
        actorId: f.ids.owner,
        entity: { kind: 'ticket', id: f.TE },
        type: 'ticket.assigned',
        payload: { assigneeId: f.ids.guestUnlisted },
      }),
    ]);
    expect(await canSee(db.pool, f.ids.guestUnlisted, f.TE)).toBe(true);

    const loaded = await loadNoteForVisibility(db.pool, f.NOTES.nInherit);
    expect(loaded).not.toBeNull();
    const readable = async (userId: string) => {
      const e = await resolveEffectiveRole(db.pool, userId, f.WS);
      const ts = canReadNote(e, userId, loaded!.note, loaded!.attachedVisibilities);
      const params = new SqlParams();
      const { rows } = await db.pool.query<{ note_id: string }>(
        `SELECT n.note_id FROM proj_notes n
          WHERE n.note_id = ${params.add(f.NOTES.nInherit)} AND ${visibleNotesWhere(e, userId, params)}`,
        params.toArray(),
      );
      return { ts, sql: rows.length === 1 };
    };
    expect(await readable(f.ids.guestUnlisted)).toEqual({ ts: false, sql: false });
    expect(await readable(f.ids.guestListed)).toEqual({ ts: true, sql: true });
  });
});

describe('6.192 ticket.assigned is a grant-backfill trigger', () => {
  it('6.192 it is; CONTROL: ticket.transitioned is not', () => {
    expect(isGrantBackfillTrigger('ticket.assigned')).toBe(true);
    expect(isGrantBackfillTrigger('ticket.transitioned')).toBe(false);
  });
});

describe('6.193 a revoked assignee sees nothing', () => {
  it('6.193 revoked from the workspace, still named on the row, canSee false', async () => {
    const w = await world();
    await revokeMember(db.pool, w.ws, w.guest);
    const { rows } = await db.pool.query<{ assignee_id: string }>(
      'SELECT assignee_id FROM proj_tickets WHERE ticket_id = $1',
      [w.assigned],
    );
    expect(rows).toEqual([{ assignee_id: w.guest }]);
    expect(await canSee(db.pool, w.guest, w.assigned)).toBe(false);
  });
});
