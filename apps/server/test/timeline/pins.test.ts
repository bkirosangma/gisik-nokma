import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { pinCountsFor } from '../../src/read/pin-counts.js';
import { computeScope } from '../../src/timeline/compute.js';
import { readTimelineIndex } from '../../src/timeline/read-index.js';
import { readableWorkspaces, type TimelineScope } from '../../src/timeline/scope.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedTimelineWorld, seedWorkspace, type TimelineWorld, type TWorkspace } from './helpers/world.js';

/**
 * 29.297: a ticket's pin counts (TG-11, D-W4-2) on top of `seedTimelineWorld`, read by `pinCountsFor` (the list's pin,
 * `read/pin-counts.ts`; the Timeline's own pin reader, which bound no workspace, was deleted in wtg4-reads FIX 1). On `t.dated`:
 * - a workspace-scope note (both ama and bo see it) and a note-owned attachment on it (`ticket_id` NULL: never counted);
 * - ama's private note (only ama);
 * - a workspace-scope note that is then `note.deleted` (nobody);
 * - a project-scope note homed in A's third project p3 (ama only; bo is not on p3), then `project.deleted` for p3 (nobody:
 *   `NOTE_PROJECT_LIVE_WHERE`; a note with `home_project_id = ''` is not touched by that clause, so only this note exercises it);
 * - one ticket-owned attachment.
 * On `t.other` (ama and bo both see it): an A-homed workspace-scope note and an A-filed attachment (what counts), and two
 * workspace-scope notes homed in ANOTHER workspace and `note.attached` to it (the client door commits that link today, 29.113):
 * one in W2a (ama owns it; bo is not a member), one in W2b (bo owns it; ama is not a member); and a file row filed under W2a.
 * On B's `bTask`: a B-homed workspace-scope note and a B-filed attachment (a scope over A and B pins each core in its own workspace).
 */

const NOW = new Date('2026-10-03T06:00:00.000Z');
let db: TestDatabase;
let w: TimelineWorld;
let W2a: TWorkspace;
let W2b: TWorkspace;
const notes = { ws: newUlid(), priv: newUlid(), deleted: newUlid(), p3: newUlid() };
const p3 = newUlid();
const cross = { home: newUlid(), awayA: newUlid(), awayB: newUlid(), b: newUlid() };

beforeAll(async () => {
  db = await createTestDatabase();
  w = await seedTimelineWorld(db.pool);
  W2a = await seedWorkspace(db.pool, w.ama, []);
  W2b = await seedWorkspace(db.pool, w.bo, []);
  const A = w.A.workspaceId;
  const note = (id: string, type: string, payload: Record<string, unknown>) =>
    makeCommitted({ workspaceId: A, actorId: w.ama, entity: { kind: 'note', id }, type, payload });
  const away = (ws: TWorkspace, actorId: string, id: string): ReturnType<typeof makeCommitted>[] => [
    makeCommitted({ workspaceId: ws.workspaceId, actorId, entity: { kind: 'note', id }, type: 'note.created', payload: { title: 'Elsewhere', homeProjectId: ws.p1, scope: { mode: 'workspace' } } }),
    makeCommitted({ workspaceId: ws.workspaceId, actorId, entity: { kind: 'note', id }, type: 'note.attached', payload: { ticketId: w.t.other } }),
  ];
  await applyCommitted(db.pool, [
    makeCommitted({ workspaceId: A, actorId: w.ama, entity: { kind: 'project', id: p3 }, type: 'project.created', payload: { name: 'Board only' } }),
    makeCommitted({ workspaceId: A, actorId: w.ama, entity: { kind: 'project', id: p3 }, type: 'project.member_added', payload: { userId: w.ama, projectAdmin: true } }),
    note(notes.ws, 'note.created', { title: 'For all', homeProjectId: w.A.p1, scope: { mode: 'workspace' }, attachTicketId: w.t.dated }),
    note(notes.priv, 'note.created', { title: 'Mine', homeProjectId: w.A.p1, scope: { mode: 'private' }, attachTicketId: w.t.dated }),
    note(notes.deleted, 'note.created', { title: 'Gone', homeProjectId: w.A.p1, scope: { mode: 'workspace' }, attachTicketId: w.t.dated }),
    note(notes.deleted, 'note.deleted', {}),
    note(notes.p3, 'note.created', { title: 'Board', homeProjectId: p3, scope: { mode: 'project' }, attachTicketId: w.t.dated }),
    makeCommitted({ workspaceId: A, actorId: w.ama, entity: { kind: 'project', id: p3 }, type: 'project.deleted', payload: {} }),
    note(cross.home, 'note.created', { title: 'Here', homeProjectId: w.A.p1, scope: { mode: 'workspace' }, attachTicketId: w.t.other }),
    ...away(W2a, w.ama, cross.awayA),
    ...away(W2b, w.bo, cross.awayB),
    makeCommitted({ workspaceId: w.B.workspaceId, actorId: w.bo, entity: { kind: 'note', id: cross.b }, type: 'note.created', payload: { title: 'In B', homeProjectId: w.B.p1, scope: { mode: 'workspace' }, attachTicketId: w.t.bTask } }),
  ]);
  await db.pool.query(
    `INSERT INTO attachments (id, workspace_id, ticket_id, note_id, uploader_id, filename, mime, size, object_key)
     VALUES ($1, $2, $3, NULL, $4, 'a.pdf', 'application/pdf', 1, $5), ($6, $2, NULL, $7, $4, 'b.pdf', 'application/pdf', 1, $8)`,
    [newUlid(), A, w.t.dated, w.ama, `k/${newUlid()}`, newUlid(), notes.ws, `k/${newUlid()}`],
  );
  // `t.other`'s two file rows (one filed here, one under W2a: no door writes that today) and `bTask`'s, filed in B
  for (const [workspaceId, ticketId] of [[A, w.t.other], [W2a.workspaceId, w.t.other], [w.B.workspaceId, w.t.bTask]] as const) {
    await db.pool.query(
      `INSERT INTO attachments (id, workspace_id, ticket_id, note_id, uploader_id, filename, mime, size, object_key)
       VALUES ($1, $2, $3, NULL, $4, 'c.pdf', 'application/pdf', 1, $5)`,
      [newUlid(), workspaceId, ticketId, w.ama, `k/${newUlid()}`],
    );
  }
}, 120_000);
afterAll(async () => {
  await db.drop();
});

const pinsOf = async (who: string, ticketIds: string[]) =>
  pinCountsFor(db.pool, await resolveEffectiveRole(db.pool, who, w.A.workspaceId), who, w.A.workspaceId, ticketIds);
const indexOf = async (who: string, scope: TimelineScope) => readTimelineIndex(db.pool, await readableWorkspaces(db.pool, who, scope), who, scope, NOW);

describe('29.297 pins', () => {
  it("29.297 the viewer's visible live notes and the ticket-owned attachments; control: the owner's count differs only by her private note", async () => {
    const amaPins = await pinsOf(w.ama, [w.t.dated, w.t.mine]);
    const boPins = await pinsOf(w.bo, [w.t.dated]);
    expect(amaPins.get(w.t.dated)).toEqual({ notes: 2, attachments: 1 }); // workspace note + her private note; the deleted note and the deleted project's note are not counted
    expect(boPins.get(w.t.dated)).toEqual({ notes: 1, attachments: 1 }); // control: bo does not see ama's private note
    expect(amaPins.has(w.t.mine)).toBe(false); // a ticket with nothing pinned has no row (the assembler reads it as zero)
    expect(await pinsOf(w.ama, [])).toEqual(new Map());
  });

  it('29.297 the index entry carries the pin (loaded for the in-scope tickets); control: an unpinned entry reads zero', async () => {
    const scope = { workspaceIds: [w.A.workspaceId], projectIds: [], mine: false };
    const c = await computeScope(db.pool, await readableWorkspaces(db.pool, w.ama, scope), w.ama, scope, NOW);
    expect(c.entries.find((e) => e.id === w.t.dated)?.pin).toEqual({ notes: 2, attachments: 1 });
    expect(c.entries.find((e) => e.id === w.t.mine)?.pin).toEqual({ notes: 0, attachments: 0 });
  });

  it("29.297 a note homed in ANOTHER workspace and linked to the ticket counts for nobody here, nor does a file row filed under another workspace (the Notes tab's clauses, as 29.113); control: the A-homed note and the A-filed row on the same ticket count", async () => {
    // the haystack holds its subject: all three links and both file rows name `t.other`
    const links = await db.pool.query<{ note_id: string }>('SELECT note_id FROM proj_note_attachments WHERE ticket_id = $1', [w.t.other]);
    expect(links.rows.map((r) => r.note_id).sort()).toEqual([cross.home, cross.awayA, cross.awayB].sort());
    const files = await db.pool.query<{ workspace_id: string }>('SELECT workspace_id FROM attachments WHERE ticket_id = $1', [w.t.other]);
    expect(files.rows.map((r) => r.workspace_id).sort()).toEqual([w.A.workspaceId, W2a.workspaceId].sort());
    // through the read: bo is not in W2a (its note reached him through the unbound workspace arm), ama is not in W2b (the owner arm)
    const scope: TimelineScope = { workspaceIds: [w.A.workspaceId], projectIds: [], mine: false };
    const served = async (who: string) => (await indexOf(who, scope)).items.find((e) => e.id === w.t.other)?.pin;
    expect({ ama: await served(w.ama), bo: await served(w.bo) }).toEqual({ ama: { notes: 1, attachments: 1 }, bo: { notes: 1, attachments: 1 } });
    // the reader itself, bound to A
    const read = async (who: string) => (await pinsOf(who, [w.t.other])).get(w.t.other);
    expect({ ama: await read(w.ama), bo: await read(w.bo) }).toEqual({ ama: { notes: 1, attachments: 1 }, bo: { notes: 1, attachments: 1 } });
  });

  it("29.297 each workspace's core pins in its OWN workspace: over A and B, B's ticket counts its B-homed note and B-filed row; control: an A ticket's pin in the same index", async () => {
    const scope: TimelineScope = { workspaceIds: [w.A.workspaceId, w.B.workspaceId].sort(), projectIds: [], mine: false };
    const idx = await indexOf(w.ama, scope);
    expect(idx.items.find((e) => e.id === w.t.bTask)?.pin).toEqual({ notes: 1, attachments: 1 });
    expect(idx.items.find((e) => e.id === w.t.dated)?.pin).toEqual({ notes: 2, attachments: 1 }); // control: A's core, same index
  });
});
