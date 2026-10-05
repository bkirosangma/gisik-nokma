import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { computeScope } from '../../src/timeline/compute.js';
import { loadPins } from '../../src/timeline/load.js';
import { readableWorkspaces } from '../../src/timeline/scope.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedTimelineWorld, type TimelineWorld } from './helpers/world.js';

/**
 * 29.297: a ticket's pin counts (TG-11, D-W4-2) on top of `seedTimelineWorld`. On `t.dated`:
 * - a workspace-scope note (both ama and bo see it) and a note-owned attachment on it (`ticket_id` NULL: never counted);
 * - ama's private note (only ama);
 * - a workspace-scope note that is then `note.deleted` (nobody);
 * - a project-scope note homed in A's third project p3 (ama only; bo is not on p3), then `project.deleted` for p3 (nobody:
 *   `NOTE_PROJECT_LIVE_WHERE`; a note with `home_project_id = ''` is not touched by that clause, so only this note exercises it);
 * - one ticket-owned attachment.
 */

const NOW = new Date('2026-10-03T06:00:00.000Z');
let db: TestDatabase;
let w: TimelineWorld;
const notes = { ws: newUlid(), priv: newUlid(), deleted: newUlid(), p3: newUlid() };
const p3 = newUlid();

beforeAll(async () => {
  db = await createTestDatabase();
  w = await seedTimelineWorld(db.pool);
  const A = w.A.workspaceId;
  const note = (id: string, type: string, payload: Record<string, unknown>) =>
    makeCommitted({ workspaceId: A, actorId: w.ama, entity: { kind: 'note', id }, type, payload });
  await applyCommitted(db.pool, [
    makeCommitted({ workspaceId: A, actorId: w.ama, entity: { kind: 'project', id: p3 }, type: 'project.created', payload: { name: 'Board only' } }),
    makeCommitted({ workspaceId: A, actorId: w.ama, entity: { kind: 'project', id: p3 }, type: 'project.member_added', payload: { userId: w.ama, projectAdmin: true } }),
    note(notes.ws, 'note.created', { title: 'For all', homeProjectId: w.A.p1, scope: { mode: 'workspace' }, attachTicketId: w.t.dated }),
    note(notes.priv, 'note.created', { title: 'Mine', homeProjectId: w.A.p1, scope: { mode: 'private' }, attachTicketId: w.t.dated }),
    note(notes.deleted, 'note.created', { title: 'Gone', homeProjectId: w.A.p1, scope: { mode: 'workspace' }, attachTicketId: w.t.dated }),
    note(notes.deleted, 'note.deleted', {}),
    note(notes.p3, 'note.created', { title: 'Board', homeProjectId: p3, scope: { mode: 'project' }, attachTicketId: w.t.dated }),
    makeCommitted({ workspaceId: A, actorId: w.ama, entity: { kind: 'project', id: p3 }, type: 'project.deleted', payload: {} }),
  ]);
  await db.pool.query(
    `INSERT INTO attachments (id, workspace_id, ticket_id, note_id, uploader_id, filename, mime, size, object_key)
     VALUES ($1, $2, $3, NULL, $4, 'a.pdf', 'application/pdf', 1, $5), ($6, $2, NULL, $7, $4, 'b.pdf', 'application/pdf', 1, $8)`,
    [newUlid(), A, w.t.dated, w.ama, `k/${newUlid()}`, newUlid(), notes.ws, `k/${newUlid()}`],
  );
}, 120_000);
afterAll(async () => {
  await db.drop();
});

const pinsOf = async (who: string, ticketIds: string[]) => loadPins(db.pool, await resolveEffectiveRole(db.pool, who, w.A.workspaceId), who, ticketIds);

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
});
