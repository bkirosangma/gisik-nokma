import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import type { EffectiveRole } from '../../src/permissions/effective-role.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { attachedTicketsByNote } from '../../src/read/notes.js';
import { restrictedParentsFor } from '../../src/read/restricted-parents.js';
import { SqlParams } from '../../src/read/sql-params.js';
import { visibleNotesWhere } from '../../src/read/visible-where.js';
import { reconcileHeldIds, reconcileHeldNoteIds } from '../../src/sync/reconcile-route.js';
import { ARM_MAX_DEPTH, assigneeArmTickets, assigneeReachWhere } from '../../src/visibility/assignee-arm.js';
import { canReadNote, loadNoteForVisibility, noteArmReach } from '../../src/visibility/can-read-note.js';
import { assigneeSees, canSee } from '../../src/visibility/can-see.js';
import { isGrantBackfillTrigger } from '../../src/visibility/grant-backfill.js';
import { rollupFor } from '../../src/visibility/rollup.js';
import { visibleEventsFor, type SyncItem } from '../../src/visibility/visible-events-for.js';
import { listVisibleTickets } from '../../src/visibility/visible-tickets.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
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

/** One note through BOTH spellings: `canReadNote` (with the arm reach its callers compute) and `visibleNotesWhere`. */
async function noteReadable(userId: string, workspaceId: string, noteId: string): Promise<{ ts: boolean; sql: boolean }> {
  const loaded = await loadNoteForVisibility(db.pool, noteId);
  expect(loaded).not.toBeNull();
  const e = await resolveEffectiveRole(db.pool, userId, workspaceId);
  const armReach = await noteArmReach(db.pool, userId, loaded!.attachedVisibilities);
  const ts = canReadNote(e, userId, loaded!.note, loaded!.attachedVisibilities, armReach);
  const params = new SqlParams();
  const { rows } = await db.pool.query<{ note_id: string }>(
    `SELECT n.note_id FROM proj_notes n
      WHERE n.note_id = ${params.add(noteId)} AND ${visibleNotesWhere(e, userId, params)}`,
    params.toArray(),
  );
  return { ts, sql: rows.length === 1 };
}

describe('6.191 (amended by 6.273) a note attached to the assigned ticket is opened by the assignment', () => {
  it('6.191 the assignee of the attached ticket reads the inherit note; CONTROL: a project-scope note stays closed, the listed guest still reads it', async () => {
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

    expect(await noteReadable(f.ids.guestUnlisted, f.WS, f.NOTES.nInherit)).toEqual({ ts: true, sql: true });
    expect(await noteReadable(f.ids.guestUnlisted, f.WS, f.NOTES.nProject)).toEqual({ ts: false, sql: false });
    expect(await noteReadable(f.ids.guestListed, f.WS, f.NOTES.nInherit)).toEqual({ ts: true, sql: true });
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

// ---------------------------------------------------------------------------
// Access follow-ups R1 (2026-09-29) — cases 6.268–6.279. The assignee's read-time
// reach extends to the notes and sub-tickets that INHERIT the assigned ticket's
// audience. The list is never written.
// ---------------------------------------------------------------------------

/** d0 assigned to the guest; d1 inherits; g1 inherits from d1; d2 has its OWN explicit list (not the guest); d3 inherits from d2. */
async function tree() {
  const ws = newUlid(); const project = newUlid(); const guest = newUlid(); const other = newUlid();
  const up = newUlid(); const d0 = newUlid(); const d1 = newUlid(); const g1 = newUlid(); const d2 = newUlid(); const d3 = newUlid();
  const sib = newUlid();
  await seedProject(db.pool, ws, project);
  await seedGuest(db.pool, ws, guest);
  await seedGuest(db.pool, ws, other);
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: up });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: d0, parentId: up, assigneeId: guest });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: sib, parentId: up });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: d1, parentId: d0 });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: g1, parentId: d1 });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: d2, parentId: d1 });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: d3, parentId: d2 });
  await applyAll(db.pool, [setVisibilityEnv(ws, d2, 'explicit', [other])]);
  return { ws, project, guest, other, up, d0, d1, g1, d2, d3, sib };
}

/** A note (ledger + projections), attached to every ticket in `attach`; `inherit` needs at least one. */
async function seedNote(
  ws: string,
  project: string,
  authorId: string,
  noteId: string,
  scope: { mode: 'inherit' | 'project' | 'workspace' | 'private' },
  attach: readonly string[],
): Promise<void> {
  const [first, ...rest] = attach;
  const envs: LedgerEvent[] = [
    testEnvelope({
      workspaceId: ws,
      entity: { kind: 'note', id: noteId },
      type: 'note.created',
      payload: { title: 'n', homeProjectId: project, scope, ...(first === undefined ? {} : { attachTicketId: first }) },
      actorId: authorId,
    }),
    ...rest.map((ticketId) =>
      testEnvelope({ workspaceId: ws, entity: { kind: 'note', id: noteId }, type: 'note.attached', payload: { ticketId }, actorId: authorId }),
    ),
  ];
  // `applyCommitted` (every projection, ledger insert included): the notes projection is not one of
  // `applyAll`'s four. The envelopes come from `testEnvelope` so their seqs cannot collide with `seedTicket`'s.
  await applyCommitted(db.pool, envs);
}

async function softDelete(ticketId: string, deleted: boolean): Promise<void> {
  await db.pool.query(
    'UPDATE proj_tickets SET deleted_at = $2, deleted_by = $3 WHERE ticket_id = $1',
    [ticketId, deleted ? new Date() : null, deleted ? 'seed-actor' : null],
  );
}

/** The SQL twin of `assigneeArmTickets` over the whole `proj_visibility` table. */
async function armSql(userId: string): Promise<string[]> {
  const params = new SqlParams();
  const { rows } = await db.pool.query<{ ticket_id: string }>(
    `SELECT v.ticket_id FROM proj_visibility v WHERE ${assigneeReachWhere(userId, params)} ORDER BY v.ticket_id`,
    params.toArray(),
  );
  return rows.map((r) => r.ticket_id);
}

/** Point `child`'s parent at `parent` on the projection row — a corrupt cycle no writer produces (case 6.58's shape). */
async function setParent(child: string, parent: string): Promise<void> {
  await db.pool.query('UPDATE proj_visibility SET parent_id = $2 WHERE ticket_id = $1', [child, parent]);
}

describe('6.268–6.272 R1 — the arm reaches what inherits', () => {
  it('6.268 assigneeArmTickets walks up inherit links only; CONTROL: nobody-assigned is empty', async () => {
    const t = await tree();
    const all = [t.up, t.d0, t.d1, t.g1, t.d2, t.d3, t.sib];
    expect([...(await assigneeArmTickets(db.pool, t.guest, all))].sort()).toEqual([t.d0, t.d1, t.g1].sort());
    expect((await assigneeArmTickets(db.pool, t.other, all)).size).toBe(0); // control
    expect((await assigneeArmTickets(db.pool, t.guest, [])).size).toBe(0);
  });

  it('6.268 terminates on a parent CYCLE and on a chain deeper than the bound; CONTROL: the same walk answers correctly without the cycle', async () => {
    const t = await tree();
    // Control first: without a cycle d1 is reached through d0.
    expect((await assigneeArmTickets(db.pool, t.guest, [t.d1])).has(t.d1)).toBe(true);
    // d0 (assigned) becomes its own ancestor: d0 -> up -> d0 is not possible (up is unassigned
    // root), so build the loop d0 <- d1 <- g1 <- d0 (g1 is d0's parent now).
    await setParent(t.d0, t.g1);
    const started = Date.now();
    const reached = await assigneeArmTickets(db.pool, t.guest, [t.up, t.d0, t.d1, t.g1, t.sib]);
    expect([...reached].sort()).toEqual([t.d0, t.d1, t.g1].sort());
    expect(Date.now() - started).toBeLessThan(5000);
    // The SQL spelling walks DOWN the same corrupt loop (d0 -> d1 -> g1 -> d0) and must also return.
    expect([...new Set(await armSql(t.guest))].sort()).toEqual([t.d0, t.d1, t.g1].sort());
    expect(Date.now() - started).toBeLessThan(5000);
    // A cycle containing NO assigned ticket answers empty and returns.
    await setParent(t.up, t.sib);
    await setParent(t.sib, t.up);
    expect((await assigneeArmTickets(db.pool, t.other, [t.up, t.sib])).size).toBe(0);
  });

  it('6.268 a chain deeper than ARM_MAX_DEPTH is cut at the bound in BOTH spellings; CONTROL: the ticket AT the bound is reached', async () => {
    const ws = newUlid(); const project = newUlid(); const guest = newUlid();
    await seedProject(db.pool, ws, project);
    await seedGuest(db.pool, ws, guest);
    const ids: string[] = [];
    for (let i = 0; i <= ARM_MAX_DEPTH + 1; i += 1) {
      const id = newUlid();
      ids.push(id);
      await seedTicket(db.pool, {
        workspaceId: ws, projectId: project, ticketId: id,
        ...(i === 0 ? { assigneeId: guest } : { parentId: ids[i - 1]! }),
      });
    }
    const atBound = ids[ARM_MAX_DEPTH]!;
    const pastBound = ids[ARM_MAX_DEPTH + 1]!;
    const ts = await assigneeArmTickets(db.pool, guest, ids);
    const sql = new Set(await armSql(guest));
    expect(ts.has(atBound)).toBe(true); // control
    expect(sql.has(atBound)).toBe(true);
    expect(ts.has(pastBound)).toBe(false);
    expect(sql.has(pastBound)).toBe(false);
    expect([...ts].sort()).toEqual(ids.slice(0, ARM_MAX_DEPTH + 1).sort());
  }, 60_000);

  it('6.269 canSee admits a guest to the INHERITING child and grandchild of a ticket assigned to them, and still not to its parent or sibling; CONTROL: the own-audience child stays refused', async () => {
    const t = await tree();
    expect(await canSee(db.pool, t.guest, t.d0)).toBe(true);
    expect(await canSee(db.pool, t.guest, t.d1)).toBe(true);
    expect(await canSee(db.pool, t.guest, t.g1)).toBe(true);
    expect(await canSee(db.pool, t.guest, t.up)).toBe(false);
    expect(await canSee(db.pool, t.guest, t.sib)).toBe(false);
    expect(await canSee(db.pool, t.guest, t.d2)).toBe(false); // control
  });

  it('6.270 stops at an own-audience ticket; CONTROL: naming the guest there opens d2 and d3 by audience', async () => {
    const t = await tree();
    expect(await canSee(db.pool, t.guest, t.d1)).toBe(true);
    expect(await canSee(db.pool, t.guest, t.d2)).toBe(false);
    expect(await canSee(db.pool, t.guest, t.d3)).toBe(false);
    await applyAll(db.pool, [setVisibilityEnv(t.ws, t.d2, 'explicit', [t.other, t.guest])]);
    expect(await canSee(db.pool, t.guest, t.d2)).toBe(true);
    expect(await canSee(db.pool, t.guest, t.d3)).toBe(true);
  });

  it('6.271 reassigning the parent removes the whole inherited subtree at once, and a child assigned separately keeps its own subtree; CONTROL: the new assignee sees the subtree', async () => {
    const t = await tree();
    expect(await canSee(db.pool, t.guest, t.g1)).toBe(true);
    await reassign(t.d0, t.other);
    for (const id of [t.d0, t.d1, t.g1]) expect(await canSee(db.pool, t.guest, id), id).toBe(false);
    for (const id of [t.d0, t.d1, t.g1]) expect(await canSee(db.pool, t.other, id), id).toBe(true); // control
    // The guest is assigned d1 separately: d1 and its inheriting child g1 come back, d0 does not.
    await reassign(t.d1, t.guest);
    expect(await canSee(db.pool, t.guest, t.d0)).toBe(false);
    expect(await canSee(db.pool, t.guest, t.d1)).toBe(true);
    expect(await canSee(db.pool, t.guest, t.g1)).toBe(true);
    // Fresh reads every time: the reach is never cached or written to the list.
    expect(await armSql(t.guest)).toEqual([t.d1, t.g1].sort());
    const { rows } = await db.pool.query<{ resolved_user_ids: string[] }>(
      'SELECT resolved_user_ids FROM proj_visibility WHERE ticket_id = $1',
      [t.d1],
    );
    expect(rows[0]!.resolved_user_ids).not.toContain(t.guest);
  });

  it('6.272 listVisibleTickets agrees with canSee over the tree; CONTROL: the exact set', async () => {
    const t = await tree();
    const listed = (await listVisibleTickets(db.pool, t.guest, t.ws)).map((r) => r['ticket_id'] as string).sort();
    expect(listed).toEqual([t.d0, t.d1, t.g1].sort());
    for (const id of [t.up, t.d0, t.d1, t.g1, t.d2, t.d3, t.sib]) {
      expect(await canSee(db.pool, t.guest, id), id).toBe(listed.includes(id));
    }
  });

  it('6.272 the two spellings agree for EVERY viewer over a wide fixture, tickets and (6.273) notes; CONTROL: exact guest sets', async () => {
    const w = await wide();
    const allIds = Object.values(w.t);
    for (const [name, viewer] of Object.entries(w.people)) {
      const listed = new Set((await listVisibleTickets(db.pool, viewer, w.ws)).map((r) => r['ticket_id'] as string));
      for (const [tname, id] of Object.entries(w.t)) {
        expect(await canSee(db.pool, viewer, id), `${name} canSee ${tname}`).toBe(listed.has(id));
      }
      // The arm alone, so a role that sees everything by audience (owner, member) cannot mask a drifted twin.
      expect([...(await assigneeArmTickets(db.pool, viewer, allIds))].sort(), `${name} arm`).toEqual(await armSql(viewer));
      for (const [nname, noteId] of Object.entries(w.n)) {
        const r = await noteReadable(viewer, w.ws, noteId);
        expect(r.ts, `${name} note ${nname}: ts vs sql`).toBe(r.sql);
      }
    }
    const listedNames = async (viewer: string) => {
      const ids = new Set((await listVisibleTickets(db.pool, viewer, w.ws)).map((r) => r['ticket_id'] as string));
      return Object.entries(w.t).filter(([, id]) => ids.has(id)).map(([k]) => k).sort();
    };
    // guestA: the assigned tree down to (not through) the own-audience ticket a4; b0/b1 inherit a2; d* are the deleted-middle shape.
    expect(await listedNames(w.people.guestA)).toEqual(['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'd0', 'd1', 'd2', 'dd'].sort());
    expect(await listedNames(w.people.guestB)).toEqual(['b0', 'b1']); // assigned a child of someone else's tree
    expect(await listedNames(w.people.guestNone)).toEqual(['a4', 'a5']); // by its explicit list, not by arm
    expect(await listedNames(w.people.memberAsg)).toEqual(expect.arrayContaining(['m0', 'm1'])); // a member assignee
  }, 120_000);
});

function idsFor<K extends string>(keys: readonly K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = newUlid();
  return out;
}

/**
 * The wide agreement fixture. Guest assignee (guestA) through 4 levels; a child that authors its own list (a4);
 * a child assigned to someone else (b0); a member assignee (m0); a workspace-scope and a project-scope child (aw, ap);
 * an unassigned tree (u0, u1); an assigned DELETED ticket with a live child and grandchild (d0 -> d1 -> d2) and a deleted child (dd).
 */
async function wide() {
  const ws = newUlid(); const project = newUlid();
  const people = {
    owner: newUlid(), admin: newUlid(), member: newUlid(), memberAsg: newUlid(), author: newUlid(),
    guestA: newUlid(), guestB: newUlid(), guestNone: newUlid(),
  };
  await seedProject(db.pool, ws, project);
  await seedMember(db.pool, ws, people.owner, 'owner', [{ projectId: project, projectAdmin: true }]);
  await seedMember(db.pool, ws, people.admin, 'admin');
  await seedMember(db.pool, ws, people.member, 'member', [{ projectId: project }]);
  await seedMember(db.pool, ws, people.memberAsg, 'member', [{ projectId: project }]);
  await seedMember(db.pool, ws, people.author, 'member', [{ projectId: project }]);
  await seedGuest(db.pool, ws, people.guestA);
  await seedGuest(db.pool, ws, people.guestB);
  await seedGuest(db.pool, ws, people.guestNone);
  const t = idsFor(['up', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'aw', 'ap', 'b0', 'b1', 'm0', 'm1', 'u0', 'u1', 'd0', 'd1', 'd2', 'dd'] as const);
  const mk = (k: keyof typeof t, extra: { parentId?: string; assigneeId?: string } = {}) =>
    seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: t[k], ...extra });
  await mk('up');
  await mk('a0', { parentId: t.up, assigneeId: people.guestA });
  await mk('a1', { parentId: t.a0 });
  await mk('a2', { parentId: t.a1 });
  await mk('a3', { parentId: t.a2 });
  await mk('a4', { parentId: t.a3 });
  await mk('a5', { parentId: t.a4 });
  await mk('aw', { parentId: t.a1 });
  await mk('ap', { parentId: t.a1 });
  await mk('b0', { parentId: t.a2, assigneeId: people.guestB });
  await mk('b1', { parentId: t.b0 });
  await mk('m0', { assigneeId: people.memberAsg });
  await mk('m1', { parentId: t.m0 });
  await mk('u0');
  await mk('u1', { parentId: t.u0 });
  await mk('d0', { assigneeId: people.guestA });
  await mk('d1', { parentId: t.d0 });
  await mk('d2', { parentId: t.d1 });
  await mk('dd', { parentId: t.d0 });
  await applyAll(db.pool, [
    setVisibilityEnv(ws, t.a4, 'explicit', [people.guestNone]),
    setVisibilityEnv(ws, t.aw, 'workspace'),
    setVisibilityEnv(ws, t.ap, 'project'),
  ]);
  await softDelete(t.d0, true);
  await softDelete(t.dd, true);
  const n = idsFor(['a1', 'mix', 'up', 'del', 'd1', 'proj', 'm1', 'a5'] as const);
  const inherit = { mode: 'inherit' } as const;
  await seedNote(ws, project, people.author, n.a1, inherit, [t.a1]);
  await seedNote(ws, project, people.author, n.mix, inherit, [t.u1, t.a2]); // two tickets: FD7
  await seedNote(ws, project, people.author, n.up, inherit, [t.up]); // the PARENT of the assigned ticket only
  await seedNote(ws, project, people.author, n.del, inherit, [t.dd]); // a DELETED ticket is not a door
  await seedNote(ws, project, people.author, n.d1, inherit, [t.d1]); // live child of a deleted assigned ticket
  await seedNote(ws, project, people.author, n.proj, { mode: 'project' }, [t.a1]); // project scope on an arm ticket: closed to a guest
  await seedNote(ws, project, people.author, n.m1, inherit, [t.m1]);
  await seedNote(ws, project, people.author, n.a5, inherit, [t.a5]); // under a4's own explicit list
  return { ws, project, people, t, n };
}

describe('6.273–6.274 R1 — the arm reaches the inherit notes', () => {
  it('6.273 an inherit note attached to a ticket assigned to the guest is readable by both spellings; CONTROL: a project-scope note on the same ticket stays unreadable', async () => {
    const w = await wide();
    // a1 is inside guestA's reach; nA1 inherits from it.
    expect(await noteReadable(w.people.guestA, w.ws, w.n.a1)).toEqual({ ts: true, sql: true });
    expect(await noteReadable(w.people.guestA, w.ws, w.n.proj)).toEqual({ ts: false, sql: false }); // control
    // FD7: a note attached to an assigned-reach ticket AND an unrelated one is readable — ANY attached ticket admits.
    expect(await noteReadable(w.people.guestA, w.ws, w.n.mix)).toEqual({ ts: true, sql: true });
    expect(await noteReadable(w.people.guestB, w.ws, w.n.mix)).toEqual({ ts: false, sql: false });
  });

  it('6.274 an inherit note attached to an inheriting CHILD of the assigned ticket is readable too; CONTROL: a note on the assigned ticket\'s PARENT, on a deleted ticket, or under an own list is not', async () => {
    const w = await wide();
    expect(await noteReadable(w.people.guestA, w.ws, w.n.a1)).toEqual({ ts: true, sql: true }); // child of the assigned a0
    expect(await noteReadable(w.people.guestA, w.ws, w.n.d1)).toEqual({ ts: true, sql: true }); // live child of a DELETED assigned ticket, as canSee treats it
    expect(await noteReadable(w.people.guestA, w.ws, w.n.up)).toEqual({ ts: false, sql: false }); // control: the parent
    expect(await noteReadable(w.people.guestA, w.ws, w.n.del)).toEqual({ ts: false, sql: false }); // a deleted ticket is not a door
    expect(await noteReadable(w.people.guestA, w.ws, w.n.a5)).toEqual({ ts: false, sql: false }); // beneath a4's own list
    expect(await noteReadable(w.people.guestNone, w.ws, w.n.a5)).toEqual({ ts: true, sql: true }); // by that list, not the arm
    expect(await noteReadable(w.people.memberAsg, w.ws, w.n.m1)).toEqual({ ts: true, sql: true });
  });
});

describe('6.275 R1 (FD1) — the rollup and the restricted-parent chip ask the same reach as canSee', () => {
  it('6.275 a child the viewer reaches by assignment is not counted restricted, nor a parent they are assigned; CONTROL: an unreached sibling still is', async () => {
    const t = await tree();
    // `up` has two children: d0 (assigned to the guest) and sib (unreached).
    expect((await rollupFor(db.pool, t.guest, t.up))?.restrictedCount).toBe(1); // sib only
    // d0's children: d1 (inherits: reached).
    expect((await rollupFor(db.pool, t.guest, t.d0))?.restrictedCount).toBe(0);
    // d1's children: g1 (inherits: reached) and d2 (own list, not the guest: restricted).
    const d1 = await rollupFor(db.pool, t.guest, t.d1);
    expect(d1?.total).toBe(2);
    expect(d1?.restrictedCount).toBe(1);

    const restricted = await restrictedParentsFor(db.pool, t.guest, [
      { ticket_id: t.d0, parent_id: t.up }, // parent up is not reached: restricted
      { ticket_id: t.d1, parent_id: t.d0 }, // parent d0 is assigned to the guest: NOT restricted
      { ticket_id: t.g1, parent_id: t.d1 }, // parent d1 is in reach: NOT restricted
      { ticket_id: t.d3, parent_id: t.d2 }, // parent d2 has its own list: restricted
    ]);
    expect([...restricted].sort()).toEqual([t.d0, t.d3].sort());
  });
});

describe('6.276 R1 — a revoked assignee reaches nothing through the extension', () => {
  it('6.276 not the assigned ticket, not its inheriting children, not its inherit notes; CONTROL: proj_tickets still names them and they could read before', async () => {
    const t = await tree();
    const note = newUlid();
    const author = newUlid();
    await seedMember(db.pool, t.ws, author, 'member');
    await seedNote(t.ws, t.project, author, note, { mode: 'inherit' }, [t.d1]);
    for (const id of [t.d0, t.d1, t.g1]) expect(await canSee(db.pool, t.guest, id), id).toBe(true);
    expect(await noteReadable(t.guest, t.ws, note)).toEqual({ ts: true, sql: true });

    await revokeMember(db.pool, t.ws, t.guest);
    const { rows } = await db.pool.query<{ assignee_id: string }>('SELECT assignee_id FROM proj_tickets WHERE ticket_id = $1', [t.d0]);
    expect(rows).toEqual([{ assignee_id: t.guest }]); // control
    for (const id of [t.d0, t.d1, t.g1]) expect(await canSee(db.pool, t.guest, id), id).toBe(false);
    expect(await noteReadable(t.guest, t.ws, note)).toEqual({ ts: false, sql: false });
    expect(await listVisibleTickets(db.pool, t.guest, t.ws)).toEqual([]);
    expect((await rollupFor(db.pool, t.guest, t.d0))?.restrictedCount).toBe(1); // d1 is restricted again
  });
});

describe('6.277 R1 — sync follows the same definition', () => {
  const collect = async (userId: string, workspaceId: string, afterSeq: number): Promise<SyncItem[]> => {
    const items: SyncItem[] = [];
    for await (const item of visibleEventsFor(db.pool, userId, workspaceId, afterSeq)) items.push(item);
    return items;
  };
  const headSeq = async (workspaceId: string): Promise<number> => {
    const { rows } = await db.pool.query<{ max: string | null }>('SELECT MAX(workspace_seq)::text AS max FROM events WHERE workspace_id = $1', [workspaceId]);
    return Number(rows[0]?.max ?? 0);
  };

  it('6.277 a ticket.assigned streamed to the new assignee is preceded by a reach-granted notice naming the ticket, its inheriting children AND their inherit notes; CONTROL: an own-audience child is not named; and reassigned AWAY, reconcile retracts them', async () => {
    const t = await tree();
    // Start with d0 UNASSIGNED so the guest's cursor is behind it.
    await reassign(t.d0, null);
    const note = newUlid();
    const author = newUlid();
    await seedMember(db.pool, t.ws, author, 'member');
    await seedNote(t.ws, t.project, author, note, { mode: 'inherit' }, [t.d1]);
    const cursor = await headSeq(t.ws);

    const assigned = testEnvelope({
      workspaceId: t.ws, entity: { kind: 'ticket', id: t.d0 }, type: 'ticket.assigned',
      payload: { assigneeId: t.guest }, actorId: author,
    });
    await appendTestEvent(db.pool, assigned);
    await reassign(t.d0, t.guest);

    const items = await collect(t.guest, t.ws, cursor);
    const first = items[0];
    expect(first && 'kind' in first && first.kind === 'reach-granted').toBe(true);
    if (!(first && 'kind' in first && first.kind === 'reach-granted')) throw new Error('no notice first');
    expect(first.tickets.map((x) => x.id).sort()).toEqual([t.d0, t.d1, t.g1].sort());
    expect(first.tickets.map((x) => x.id)).not.toContain(t.d2); // control: own audience
    expect((first.notes ?? []).map((x) => x.id)).toEqual([note]);
    expect(items.some((i) => !('kind' in i) && i.id === assigned.id)).toBe(true);

    // Held by the guest's replica now. While assigned, reconcile keeps them; d2 (own list) it retracts.
    const held = [t.d0, t.d1, t.g1, t.d2];
    expect((await reconcileHeldIds(db.pool, t.guest, held)).map((r) => r.id)).toEqual([t.d2]);
    expect(await reconcileHeldNoteIds(db.pool, t.guest, [note])).toEqual([]);
    // Assigned away: the whole extended subtree and its note are told to drop.
    await reassign(t.d0, t.other);
    expect((await reconcileHeldIds(db.pool, t.guest, held)).map((r) => r.id).sort()).toEqual([...held].sort());
    expect((await reconcileHeldNoteIds(db.pool, t.guest, [note])).map((r) => r.id)).toEqual([note]);
  });
});

describe('6.278 R1 — a deleted project or ticket is reached by nobody through the arm', () => {
  it('6.278 a deleted project\'s assigned tickets are out of reach in every spelling; CONTROL: the same fixture in a live project is reached', async () => {
    const t = await tree();
    expect(await armSql(t.guest)).toEqual([t.d0, t.d1, t.g1].sort());
    expect(await canSee(db.pool, t.guest, t.d1)).toBe(true);
    await db.pool.query('UPDATE proj_projects SET deleted_at = now() WHERE project_id = $1', [t.project]);
    expect(await armSql(t.guest)).toEqual([]);
    expect((await assigneeArmTickets(db.pool, t.guest, [t.d0, t.d1, t.g1])).size).toBe(0);
    for (const id of [t.d0, t.d1, t.g1]) expect(await canSee(db.pool, t.guest, id), id).toBe(false);
    expect(await listVisibleTickets(db.pool, t.guest, t.ws)).toEqual([]);
  });

  it('6.278 a soft-DELETED assigned ticket and a deleted inheriting child are not shown by a view reader; CONTROL: the live sibling is; restore brings both back', async () => {
    const w = await wide();
    const guest = w.people.guestA;
    // A scratch note attached to d0 (deleted, assigned), dd (deleted child), d1 (live child of the deleted assigned) and a1 (live).
    const scratch = newUlid();
    await seedNote(w.ws, w.project, w.people.author, scratch, { mode: 'workspace' }, [w.t.d0, w.t.dd, w.t.d1, w.t.a1]);
    const shown = async () => {
      const e = await resolveEffectiveRole(db.pool, guest, w.ws);
      const m = await attachedTicketsByNote(db.pool, e, guest, w.ws, [scratch]);
      return (m.get(scratch) ?? []).map((x) => x.ticketId).sort();
    };
    expect(await shown()).toEqual([w.t.a1, w.t.d1].sort()); // deleted d0 and dd are hidden; live siblings shown
    // canSee's own answer for a deleted ticket is UNCHANGED by the arm (deletion is not visibility: the history door keeps serving it).
    expect(await canSee(db.pool, guest, w.t.d0)).toBe(true);
    await softDelete(w.t.d0, false);
    await softDelete(w.t.dd, false);
    expect(await shown()).toEqual([w.t.a1, w.t.d0, w.t.d1, w.t.dd].sort()); // restore brings them back
  }, 120_000);
});

describe('6.279 R1 — the reach walk is indexed', () => {
  it('6.279 proj_tickets_assignee_idx exists on (assignee_id) and the reach CTE plans through it; CONTROL: the recursive step uses proj_visibility_children', async () => {
    const { rows } = await db.pool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'proj_tickets' AND indexname = 'proj_tickets_assignee_idx'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toMatch(/\(assignee_id\)/);

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      // A few-row test table would seq-scan whatever the indexes are; switch it off to ask the planner
      // which index it PREFERS. That is the property (an index exists and fits the query), not a
      // claim about production row counts.
      await client.query('SET LOCAL enable_seqscan = off');
      const params = new SqlParams();
      const sql = `EXPLAIN SELECT v.ticket_id FROM proj_visibility v WHERE ${assigneeReachWhere('u-explain', params)}`;
      const { rows: plan } = await client.query<{ 'QUERY PLAN': string }>(sql, params.toArray());
      const text = plan.map((r) => r['QUERY PLAN']).join('\n');
      expect(text).toContain('proj_tickets_assignee_idx');
      expect(text).toContain('proj_visibility_children'); // control
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
