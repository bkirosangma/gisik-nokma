import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { lifecycleProjection } from '../../src/projections/lifecycle.js';
import { notesProjection } from '../../src/projections/notes.js';
import { projProjects } from '../../src/projections/proj-projects.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * `proj_lifecycle` (trash series, Plan 1 Task 2). Cases 19.010-19.015,
 * `test-cases/19-trash.md` §19.2. Every case mints its own workspace/project/
 * ticket/note ids so no case can read another's rows, mirroring
 * `projections/proj-notes.test.ts`'s discipline: `events` is append-only by
 * trigger and this file never truncates it.
 *
 * 19.015 runs FIRST, for the same reason `proj-notes.test.ts` puts its own
 * whole-table verifier case first: it is the case that asserts the WHOLE
 * table matches a rebuild from the ledger, and `verifyProjections` compares
 * `proj_workspaces`/`proj_projects`/`proj_tickets`/`proj_notes` in full, not
 * scoped to one workspace. 19.010-19.014 below apply events DIRECTLY to a
 * projection (`applyLifecycle`, a bare `projProjects.apply`, a hand-written
 * `proj_tickets` head row) without also inserting them into `events` — live
 * rows with no ledger backing, which is exactly the drift 19.015 exists to
 * catch. A reordering that moves 19.015 later changes what it asserts — say
 * so in the case, do not silently shuffle.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
});

afterAll(async () => {
  await db.drop();
});

async function applyLifecycle(...events: LedgerEvent[]): Promise<void> {
  const client = await db.pool.connect();
  try {
    for (const event of events) {
      await lifecycleProjection.apply(event, client);
    }
  } finally {
    client.release();
  }
}

async function workspaceRow(workspaceId: string) {
  const { rows } = await db.pool.query(
    'SELECT archived, deleted_at, deleted_by, purge_marked_at, purge_marked_by FROM proj_workspaces WHERE workspace_id = $1',
    [workspaceId],
  );
  return rows[0];
}

describe('19.015 a mixed sequence of all eight types verifies clean; the covered columns are real coverage', () => {
  it('verifyProjections reports no difference after a mixed sequence, and reports a difference once a lifecycle column is hand-written', async () => {
    const WS = newUlid();
    const OWNER = newUlid();
    const workflowId = newUlid();
    const workflow = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workflow', id: workflowId },
      type: 'workflow.defined',
      payload: {
        id: workflowId,
        version: 1,
        name: 'Basic',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [{ from: 'todo', to: 'done', rules: [] }],
      },
      actorId: OWNER,
    });
    const typeKey = 'task-19-015';
    const ticketType = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'ticket-type', id: newUlid() },
      type: 'ticket-type.defined',
      payload: { id: typeKey, name: typeKey, icon: 'check', rank: 1, workflowId, fields: [] },
      actorId: OWNER,
    });
    const projectId = newUlid();
    const projectCreated = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'project', id: projectId },
      type: 'project.created',
      payload: { name: 'P' },
      actorId: OWNER,
    });
    const ticketId = newUlid();
    const ticketCreated = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.created',
      payload: { typeId: typeKey, projectId, parentId: null, title: 'T' },
      actorId: OWNER,
    });
    const noteId = newUlid();
    const noteCreated = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'note', id: noteId },
      type: 'note.created',
      payload: { title: 'N', homeProjectId: '', scope: { mode: 'private' } },
      actorId: OWNER,
    });

    const wsArchived = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workspace', id: WS },
      type: 'workspace.archived',
      payload: {},
      actorId: OWNER,
    });
    const wsRestored = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workspace', id: WS },
      type: 'workspace.restored',
      payload: {},
      actorId: OWNER,
    });
    const wsDeleted = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workspace', id: WS },
      type: 'workspace.deleted',
      payload: {},
      actorId: OWNER,
    });
    const wsUndeleted = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workspace', id: WS },
      type: 'workspace.undeleted',
      payload: {},
      actorId: OWNER,
    });
    const projDeleted = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'project', id: projectId },
      type: 'project.deleted',
      payload: {},
      actorId: OWNER,
    });
    const projUndeleted = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'project', id: projectId },
      type: 'project.undeleted',
      payload: {},
      actorId: OWNER,
    });
    const ticketMarked = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'ticket', id: ticketId },
      type: 'purge.marked',
      payload: {},
      actorId: OWNER,
    });
    const ticketUnmarked = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'ticket', id: ticketId },
      type: 'purge.unmarked',
      payload: {},
      actorId: OWNER,
    });
    const noteMarked = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'note', id: noteId },
      type: 'purge.marked',
      payload: {},
      actorId: OWNER,
    });

    await applyCommitted(db.pool, [
      workflow,
      ticketType,
      projectCreated,
      ticketCreated,
      noteCreated,
      wsArchived,
      wsRestored,
      wsDeleted,
      wsUndeleted,
      projDeleted,
      projUndeleted,
      ticketMarked,
      ticketUnmarked,
      noteMarked,
    ]);

    const clean = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(formatDiffTables(clean)).toEqual([]);

    // Control 1 (plan's own): hand-write proj_workspaces.archived — dirties the
    // table lifecycleProjection OWNS.
    await db.pool.query('UPDATE proj_workspaces SET archived = NOT archived WHERE workspace_id = $1', [WS]);
    const dirtyWorkspaces = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(formatDiffTables(dirtyWorkspaces)).toEqual(['proj_workspaces']);
    await db.pool.query('UPDATE proj_workspaces SET archived = NOT archived WHERE workspace_id = $1', [WS]);

    // Control 2: hand-write proj_projects.deleted_at — a lifecycle column added
    // to a table `lifecycleProjection.tables` does NOT list (it is covered
    // because `proj_projects` is in `projProjects.tables`, and BOTH projections
    // wrote into the SAME shadow copy during the rebuild).
    await db.pool.query("UPDATE proj_projects SET deleted_at = now() WHERE project_id = $1", [projectId]);
    const dirtyProjects = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(formatDiffTables(dirtyProjects)).toEqual(['proj_projects']);
    await db.pool.query('UPDATE proj_projects SET deleted_at = NULL WHERE project_id = $1', [projectId]);

    // Control 3: hand-write proj_tickets.purge_marked_at (currently NULL, since
    // the ticket was unmarked) — same coverage question for `proj_tickets`,
    // owned by `ticketsProjection.tables`, seeded here through a REAL
    // ticket.created with a real workflow/type behind it (not a hand-inserted
    // row), so this control cannot be confounded by an otherwise-incoherent row.
    await db.pool.query('UPDATE proj_tickets SET purge_marked_at = now() WHERE ticket_id = $1', [ticketId]);
    const dirtyTickets = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(formatDiffTables(dirtyTickets)).toEqual(['proj_tickets']);
    await db.pool.query('UPDATE proj_tickets SET purge_marked_at = NULL WHERE ticket_id = $1', [ticketId]);

    // Control 4: hand-write proj_notes.purge_marked_at to NULL (currently set,
    // since the note was marked and never unmarked) — same question for
    // `proj_notes`, owned by `notesProjection.tables`.
    const originalNoteMark = (
      await db.pool.query('SELECT purge_marked_at FROM proj_notes WHERE note_id = $1', [noteId])
    ).rows[0].purge_marked_at;
    await db.pool.query('UPDATE proj_notes SET purge_marked_at = NULL WHERE note_id = $1', [noteId]);
    const dirtyNotes = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(formatDiffTables(dirtyNotes)).toEqual(['proj_notes']);
    await db.pool.query('UPDATE proj_notes SET purge_marked_at = $2 WHERE note_id = $1', [noteId, originalNoteMark]);

    // Back to clean.
    const cleanAgain = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(formatDiffTables(cleanAgain)).toEqual([]);
  });
});

function formatDiffTables(report: Awaited<ReturnType<typeof verifyProjections>>): string[] {
  return report.diffs.map((diff) => diff.table);
}
describe('19.010 workspace.archived / workspace.restored', () => {
  it('writes archived true then false on a row the first event creates; a workspace with no lifecycle event has no row', async () => {
    const WS = newUlid();
    const ACTOR = newUlid();
    const archived = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workspace', id: WS },
      type: 'workspace.archived',
      payload: {},
      actorId: ACTOR,
    });
    await applyLifecycle(archived);
    expect(await workspaceRow(WS)).toMatchObject({ archived: true });

    const restored = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workspace', id: WS },
      type: 'workspace.restored',
      payload: {},
      actorId: ACTOR,
    });
    await applyLifecycle(restored);
    expect(await workspaceRow(WS)).toMatchObject({ archived: false });

    // control: a workspace with no LIFECYCLE event has no row at all, even
    // one that WAS created — workspace.created is not a lifecycle event.
    const untouched = newUlid();
    await applyLifecycle(
      makeCommitted({
        workspaceId: untouched,
        entity: { kind: 'workspace', id: untouched },
        type: 'workspace.created',
        payload: { name: 'Untouched' },
        actorId: ACTOR,
      }),
    );
    expect(await workspaceRow(untouched)).toBeUndefined();
  });
});

describe('19.011 workspace.deleted / workspace.undeleted', () => {
  it('writes deleted_at/deleted_by from the event, undeleted nulls both, archived is untouched', async () => {
    const WS = newUlid();
    const ACTOR = newUlid();
    const archived = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workspace', id: WS },
      type: 'workspace.archived',
      payload: {},
      actorId: ACTOR,
    });
    await applyLifecycle(archived);

    const deletedBy = newUlid();
    const deleted = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workspace', id: WS },
      type: 'workspace.deleted',
      payload: {},
      actorId: deletedBy,
    });
    await applyLifecycle(deleted);
    const afterDelete = await workspaceRow(WS);
    expect(new Date(afterDelete.deleted_at).toISOString()).toBe(deleted.serverTime);
    expect(afterDelete.deleted_by).toBe(deletedBy);
    // control: archived untouched by the delete
    expect(afterDelete.archived).toBe(true);

    const undeleted = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workspace', id: WS },
      type: 'workspace.undeleted',
      payload: {},
      actorId: ACTOR,
    });
    await applyLifecycle(undeleted);
    const afterUndelete = await workspaceRow(WS);
    expect(afterUndelete.deleted_at).toBeNull();
    expect(afterUndelete.deleted_by).toBeNull();
    expect(afterUndelete.archived).toBe(true);
  });
});

async function projectRow(projectId: string) {
  const { rows } = await db.pool.query(
    'SELECT archived, deleted_at, deleted_by, purge_marked_at, purge_marked_by FROM proj_projects WHERE project_id = $1',
    [projectId],
  );
  return rows[0];
}

describe('19.012 project.deleted / project.undeleted', () => {
  it('writes and clears proj_projects.deleted_at/deleted_by; archived is untouched', async () => {
    const WS = newUlid();
    const ACTOR = newUlid();
    const projectId = newUlid();
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await projProjects.apply(
        makeCommitted({
          workspaceId: WS,
          entity: { kind: 'project', id: projectId },
          type: 'project.created',
          payload: { name: 'P' },
          actorId: ACTOR,
        }),
        client,
      );
      await projProjects.apply(
        makeCommitted({
          workspaceId: WS,
          entity: { kind: 'project', id: projectId },
          type: 'project.archived',
          payload: {},
          actorId: ACTOR,
        }),
        client,
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const deletedBy = newUlid();
    const deleted = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'project', id: projectId },
      type: 'project.deleted',
      payload: {},
      actorId: deletedBy,
    });
    await applyLifecycle(deleted);
    const afterDelete = await projectRow(projectId);
    expect(new Date(afterDelete.deleted_at).toISOString()).toBe(deleted.serverTime);
    expect(afterDelete.deleted_by).toBe(deletedBy);
    // control: archived untouched
    expect(afterDelete.archived).toBe(true);

    const undeleted = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'project', id: projectId },
      type: 'project.undeleted',
      payload: {},
      actorId: ACTOR,
    });
    await applyLifecycle(undeleted);
    const afterUndelete = await projectRow(projectId);
    expect(afterUndelete.deleted_at).toBeNull();
    expect(afterUndelete.deleted_by).toBeNull();
    expect(afterUndelete.archived).toBe(true);
  });
});

describe('19.013 purge.marked / purge.unmarked, all four kinds', () => {
  it('writes purge_marked_at/purge_marked_by on the row of its own entity kind; the other three tables are untouched', async () => {
    const WS = newUlid();
    const ACTOR = newUlid();
    const projectId = newUlid();
    const noteId = newUlid();

    // Seed one row per kind: workspace (via a prior lifecycle event), project
    // (via project.created), ticket (a hand-written head row — the same shape
    // `seedTicket`'s insertTicketHead writes, since this case is about the
    // lifecycle projection's WRITE onto an existing row, not about how the row
    // got there), note (via note.created).
    await applyLifecycle(
      makeCommitted({
        workspaceId: WS,
        entity: { kind: 'workspace', id: WS },
        type: 'workspace.archived',
        payload: {},
        actorId: ACTOR,
      }),
    );
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await projProjects.apply(
        makeCommitted({
          workspaceId: WS,
          entity: { kind: 'project', id: projectId },
          type: 'project.created',
          payload: { name: 'P' },
          actorId: ACTOR,
        }),
        client,
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const ticketId = newUlid();
    await db.pool.query(
      `INSERT INTO proj_tickets
         (ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id, workflow_version,
          state_id, state_category, assignee_id, collaborator_ids, fields, transitions)
       VALUES ($1,$2,$3,'task',NULL,'wf-seed',1,'todo','open',NULL,'[]','{}','[]')`,
      [ticketId, WS, projectId],
    );
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        entity: { kind: 'note', id: noteId },
        type: 'note.created',
        payload: { title: 'N', homeProjectId: '', scope: { mode: 'private' } },
        actorId: ACTOR,
      }),
    ]);

    const markedBy = newUlid();
    const marks: LedgerEvent[] = [
      makeCommitted({
        workspaceId: WS,
        entity: { kind: 'workspace', id: WS },
        type: 'purge.marked',
        payload: {},
        actorId: markedBy,
      }),
      makeCommitted({
        workspaceId: WS,
        entity: { kind: 'project', id: projectId },
        type: 'purge.marked',
        payload: {},
        actorId: markedBy,
      }),
      makeCommitted({
        workspaceId: WS,
        entity: { kind: 'ticket', id: ticketId },
        type: 'purge.marked',
        payload: {},
        actorId: markedBy,
      }),
      makeCommitted({
        workspaceId: WS,
        entity: { kind: 'note', id: noteId },
        type: 'purge.marked',
        payload: {},
        actorId: markedBy,
      }),
    ];
    for (const mark of marks) {
      await applyLifecycle(mark);
    }

    const ws = await workspaceRow(WS);
    expect(ws.purge_marked_at).not.toBeNull();
    expect(ws.purge_marked_by).toBe(markedBy);
    const proj = await projectRow(projectId);
    expect(proj.purge_marked_at).not.toBeNull();
    expect(proj.purge_marked_by).toBe(markedBy);
    const ticketRow = (
      await db.pool.query('SELECT purge_marked_at, purge_marked_by FROM proj_tickets WHERE ticket_id = $1', [
        ticketId,
      ])
    ).rows[0];
    expect(ticketRow.purge_marked_at).not.toBeNull();
    expect(ticketRow.purge_marked_by).toBe(markedBy);
    const noteRow = (
      await db.pool.query('SELECT purge_marked_at, purge_marked_by FROM proj_notes WHERE note_id = $1', [noteId])
    ).rows[0];
    expect(noteRow.purge_marked_at).not.toBeNull();
    expect(noteRow.purge_marked_by).toBe(markedBy);

    // Unmark the ticket only. control: the other three tables untouched.
    await applyLifecycle(
      makeCommitted({
        workspaceId: WS,
        entity: { kind: 'ticket', id: ticketId },
        type: 'purge.unmarked',
        payload: {},
        actorId: ACTOR,
      }),
    );
    const ticketAfterUnmark = (
      await db.pool.query('SELECT purge_marked_at, purge_marked_by FROM proj_tickets WHERE ticket_id = $1', [
        ticketId,
      ])
    ).rows[0];
    expect(ticketAfterUnmark.purge_marked_at).toBeNull();
    expect(ticketAfterUnmark.purge_marked_by).toBeNull();
    expect((await workspaceRow(WS)).purge_marked_at).not.toBeNull();
    expect((await projectRow(projectId)).purge_marked_at).not.toBeNull();
    expect(
      (await db.pool.query('SELECT purge_marked_at FROM proj_notes WHERE note_id = $1', [noteId])).rows[0]
        .purge_marked_at,
    ).not.toBeNull();
  });
});

describe('19.014 note.deleted / note.restored write deleted_at/deleted_by beside deleted', () => {
  it('writes deleted_at/deleted_by on delete, nulls both on restore; deleted still flips', async () => {
    const WS = newUlid();
    const ACTOR = newUlid();
    const noteId = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS,
        entity: { kind: 'note', id: noteId },
        type: 'note.created',
        payload: { title: 'N', homeProjectId: '', scope: { mode: 'private' } },
        actorId: ACTOR,
      }),
    ]);

    const deletedBy = newUlid();
    const deleted = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'note', id: noteId },
      type: 'note.deleted',
      payload: {},
      actorId: deletedBy,
    });
    const client1 = await db.pool.connect();
    try {
      await client1.query('BEGIN');
      await notesProjection.apply(deleted, client1);
      await client1.query('COMMIT');
    } finally {
      client1.release();
    }
    const afterDelete = (
      await db.pool.query('SELECT deleted, deleted_at, deleted_by FROM proj_notes WHERE note_id = $1', [noteId])
    ).rows[0];
    // control: `deleted` still flips
    expect(afterDelete.deleted).toBe(true);
    expect(new Date(afterDelete.deleted_at).toISOString()).toBe(deleted.serverTime);
    expect(afterDelete.deleted_by).toBe(deletedBy);

    const restored = makeCommitted({
      workspaceId: WS,
      entity: { kind: 'note', id: noteId },
      type: 'note.restored',
      payload: {},
      actorId: ACTOR,
    });
    const client2 = await db.pool.connect();
    try {
      await client2.query('BEGIN');
      await notesProjection.apply(restored, client2);
      await client2.query('COMMIT');
    } finally {
      client2.release();
    }
    const afterRestore = (
      await db.pool.query('SELECT deleted, deleted_at, deleted_by FROM proj_notes WHERE note_id = $1', [noteId])
    ).rows[0];
    expect(afterRestore.deleted).toBe(false);
    expect(afterRestore.deleted_at).toBeNull();
    expect(afterRestore.deleted_by).toBeNull();
  });
});

