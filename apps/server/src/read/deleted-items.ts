import { purgeDueAt, ticketKey, type DeletedItem } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { listNotes } from './notes.js';
import { projectPrefixesInWorkspace } from './visible-projects.js';
import { ticketNumbers } from './ticket-numbers.js';
import { workspaceIdentityFromLedger } from '../workspaces/workspace-name.js';

/** A row before the deleter's name is joined on (`withDeleterNames`, below). */
type UnnamedDeletedItem = Omit<DeletedItem, 'deletedByName'>;

/**
 * `GET /v1/me/deleted-items` (trash series, Plan 1 Task 7, spec §6.3's read).
 *
 * One row per deleted workspace, project, ticket or note this caller may
 * currently restore or mark — by CURRENT authority (T3, Review Focus 5), never
 * by who deleted it. An item inside a deleted container is not listed on its
 * own (spec §6.3): the container's own row carries `containedCount` instead.
 *
 * ## Scope: every workspace this caller belongs to, not one named workspace
 *
 * There is no `:workspaceId` in this door — the route is "my deleted items",
 * across the caller's whole membership. So this walks `proj_memberships`
 * (`scope_kind = 'workspace'`) directly rather than taking one workspace as a
 * parameter, and asks each membership two questions in turn: is the WORKSPACE
 * itself deleted, and if not, what does its CURRENT effective role let this
 * caller see inside it.
 *
 * ## A deleted workspace's contents are never separately walked
 *
 * `projects`/`tickets`/`notes` below only ever run for a LIVE workspace row —
 * exactly the containment rule spec §4 states for a deleted workspace's
 * children, applied here by construction rather than by a second filter.
 */
export async function readDeletedItems(db: Queryable, userId: string): Promise<DeletedItem[]> {
  const items: UnnamedDeletedItem[] = [];

  const { rows: memberships } = await db.query<{ workspace_id: string; role: string; deleted_at: Date | null }>(
    `SELECT m.workspace_id, m.role, pw.deleted_at
       FROM proj_memberships m
       LEFT JOIN proj_workspaces pw ON pw.workspace_id = m.workspace_id
      WHERE m.user_id = $1 AND m.scope_kind = 'workspace'`,
    [userId],
  );

  for (const membership of memberships) {
    const workspaceId = membership.workspace_id;

    if (membership.deleted_at !== null) {
      // A deleted workspace: only its OWNER may restore or mark it (T3).
      if (membership.role !== 'owner') continue;
      items.push(await deletedWorkspaceItem(db, workspaceId));
      continue;
    }

    const eff = await resolveEffectiveRole(db, userId, workspaceId);
    const identity = await workspaceIdentityFromLedger(db, workspaceId);
    const workspaceName = identity.name ?? '';
    const isWorkspaceAdmin = eff.workspaceRole === 'owner' || eff.workspaceRole === 'admin';

    if (isWorkspaceAdmin) {
      items.push(...(await deletedProjectItems(db, workspaceId, workspaceName)));
    }

    const adminProjectIds = isWorkspaceAdmin
      ? null // every live project — resolved inside deletedTicketItems
      : [...eff.projects.entries()].filter(([, p]) => p.projectAdmin).map(([projectId]) => projectId);
    if (isWorkspaceAdmin || (adminProjectIds !== null && adminProjectIds.length > 0)) {
      items.push(...(await deletedTicketItems(db, workspaceId, workspaceName, adminProjectIds)));
    }

    const deletedNotes = await listNotes(db, eff, userId, workspaceId, { deleted: true });
    if (deletedNotes.length > 0) {
      items.push(...(await deletedNoteItems(db, workspaceId, workspaceName, deletedNotes)));
    }
  }

  items.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : a.id < b.id ? -1 : 1));
  return withDeleterNames(db, items);
}

async function deletedWorkspaceItem(db: Queryable, workspaceId: string): Promise<UnnamedDeletedItem> {
  const identity = await workspaceIdentityFromLedger(db, workspaceId);
  const { rows } = await db.query<{ deleted_at: Date; deleted_by: string; purge_marked_at: Date | null }>(
    'SELECT deleted_at, deleted_by, purge_marked_at FROM proj_workspaces WHERE workspace_id = $1',
    [workspaceId],
  );
  const row = rows[0]!;
  const purgeMarkedAt = row.purge_marked_at?.toISOString() ?? null;
  return {
    kind: 'workspace',
    id: workspaceId,
    workspaceId,
    workspaceName: identity.name ?? '',
    projectId: null,
    projectName: null,
    label: identity.name ?? '',
    deletedBy: row.deleted_by,
    deletedAt: row.deleted_at.toISOString(),
    purgeMarkedAt,
    purgeDueAt: purgeMarkedAt === null ? null : purgeDueAt(purgeMarkedAt),
    containedCount: await containedCount(
      db,
      'SELECT count(*) FROM proj_projects WHERE workspace_id = $1 AND deleted_at IS NULL',
      'SELECT count(*) FROM proj_tickets WHERE workspace_id = $1 AND deleted_at IS NULL',
      'SELECT count(*) FROM proj_notes WHERE workspace_id = $1 AND deleted = FALSE',
      workspaceId,
    ),
  };
}

async function deletedProjectItems(db: Queryable, workspaceId: string, workspaceName: string): Promise<UnnamedDeletedItem[]> {
  const { rows } = await db.query<{
    project_id: string;
    name: string;
    deleted_at: Date;
    deleted_by: string;
    purge_marked_at: Date | null;
  }>(
    'SELECT project_id, name, deleted_at, deleted_by, purge_marked_at FROM proj_projects WHERE workspace_id = $1 AND deleted_at IS NOT NULL',
    [workspaceId],
  );
  const items: UnnamedDeletedItem[] = [];
  for (const row of rows) {
    const purgeMarkedAt = row.purge_marked_at?.toISOString() ?? null;
    items.push({
      kind: 'project',
      id: row.project_id,
      workspaceId,
      workspaceName,
      projectId: row.project_id,
      projectName: row.name,
      label: row.name,
      deletedBy: row.deleted_by,
      deletedAt: row.deleted_at.toISOString(),
      purgeMarkedAt,
      purgeDueAt: purgeMarkedAt === null ? null : purgeDueAt(purgeMarkedAt),
      containedCount: await containedCount(
        db,
        null,
        'SELECT count(*) FROM proj_tickets WHERE project_id = $1 AND deleted_at IS NULL',
        // The project's own workspace's notes only, as the purge's erasure set takes (18.523, migration 1792500000000).
        'SELECT count(*) FROM proj_notes WHERE home_project_id = $1 AND deleted = FALSE AND workspace_id = (SELECT workspace_id FROM proj_projects WHERE project_id = $1)',
        row.project_id,
      ),
    });
  }
  return items;
}

/**
 * `adminProjectIds === null` means "every live project" (workspace owner/admin);
 * an array means exactly those project ids (a project admin elsewhere).
 */
async function deletedTicketItems(
  db: Queryable,
  workspaceId: string,
  workspaceName: string,
  adminProjectIds: readonly string[] | null,
): Promise<UnnamedDeletedItem[]> {
  const params: unknown[] = [workspaceId];
  let projectFilter = '';
  if (adminProjectIds !== null) {
    params.push(adminProjectIds);
    projectFilter = ' AND t.project_id = ANY($2)';
  }
  const { rows } = await db.query<{
    ticket_id: string;
    project_id: string;
    deleted_at: Date;
    deleted_by: string;
    purge_marked_at: Date | null;
    title: string | null;
  }>(
    `SELECT t.ticket_id, t.project_id, t.deleted_at, t.deleted_by, t.purge_marked_at, t.fields -> 'title' ->> 'value' AS title
       FROM proj_tickets t
       JOIN proj_projects dp ON dp.project_id = t.project_id
      WHERE t.workspace_id = $1 AND t.deleted_at IS NOT NULL AND dp.deleted_at IS NULL${projectFilter}`,
    params,
  );
  if (rows.length === 0) return [];

  const identity = await workspaceIdentityFromLedger(db, workspaceId);
  const prefixes = await projectPrefixesInWorkspace(db, workspaceId);
  const numbers = await ticketNumbers(
    db,
    workspaceId,
    rows.map((row) => row.ticket_id),
  );
  const projectNames = await projectNamesInWorkspace(db, workspaceId);

  return rows.map((row) => {
    const projectPrefix = prefixes.get(row.project_id) ?? null;
    const number = numbers.get(row.ticket_id) ?? null;
    const key =
      identity.prefix === null || projectPrefix === null || number === null
        ? ''
        : ticketKey(identity.prefix, projectPrefix, number);
    const title = row.title ?? '';
    const purgeMarkedAt = row.purge_marked_at?.toISOString() ?? null;
    return {
      kind: 'ticket',
      id: row.ticket_id,
      workspaceId,
      workspaceName,
      projectId: row.project_id,
      projectName: projectNames.get(row.project_id) ?? null,
      label: key === '' ? title : `${key} ${title}`,
      deletedBy: row.deleted_by,
      deletedAt: row.deleted_at.toISOString(),
      purgeMarkedAt,
      purgeDueAt: purgeMarkedAt === null ? null : purgeDueAt(purgeMarkedAt),
      containedCount: 0,
    };
  });
}

async function deletedNoteItems(
  db: Queryable,
  workspaceId: string,
  workspaceName: string,
  deletedNotes: readonly { noteId: string; homeProjectId: string; title: string }[],
): Promise<UnnamedDeletedItem[]> {
  const { rows } = await db.query<{
    note_id: string;
    deleted_at: Date;
    deleted_by: string;
    purge_marked_at: Date | null;
  }>('SELECT note_id, deleted_at, deleted_by, purge_marked_at FROM proj_notes WHERE note_id = ANY($1)', [
    deletedNotes.map((note) => note.noteId),
  ]);
  const meta = new Map(rows.map((row) => [row.note_id, row]));
  const projectNames = await projectNamesInWorkspace(db, workspaceId);

  const items: UnnamedDeletedItem[] = [];
  for (const note of deletedNotes) {
    const row = meta.get(note.noteId);
    if (row === undefined) continue;
    const purgeMarkedAt = row.purge_marked_at?.toISOString() ?? null;
    const projectId = note.homeProjectId === '' ? null : note.homeProjectId;
    items.push({
      kind: 'note',
      id: note.noteId,
      workspaceId,
      workspaceName,
      projectId,
      projectName: projectId === null ? null : (projectNames.get(projectId) ?? null),
      label: note.title,
      deletedBy: row.deleted_by,
      deletedAt: row.deleted_at.toISOString(),
      purgeMarkedAt,
      purgeDueAt: purgeMarkedAt === null ? null : purgeDueAt(purgeMarkedAt),
      containedCount: 0,
    });
  }
  return items;
}

async function projectNamesInWorkspace(db: Queryable, workspaceId: string): Promise<Map<string, string>> {
  const { rows } = await db.query<{ project_id: string; name: string }>(
    'SELECT project_id, name FROM proj_projects WHERE workspace_id = $1',
    [workspaceId],
  );
  return new Map(rows.map((row) => [row.project_id, row.name]));
}

async function containedCount(
  db: Queryable,
  projectsSql: string | null,
  ticketsSql: string,
  notesSql: string,
  id: string,
): Promise<number> {
  let total = 0;
  if (projectsSql !== null) {
    const { rows } = await db.query<{ count: string }>(projectsSql, [id]);
    total += Number(rows[0]!.count);
  }
  {
    const { rows } = await db.query<{ count: string }>(ticketsSql, [id]);
    total += Number(rows[0]!.count);
  }
  {
    const { rows } = await db.query<{ count: string }>(notesSql, [id]);
    total += Number(rows[0]!.count);
  }
  return total;
}

/**
 * Joins each row's deleter onto a display name in ONE read (trash Plan 4, D1,
 * case 19.206). `"user"` is better-auth's table; the LEFT-JOIN semantics of
 * `routes/my-invitations.ts`'s `pendingFor` — a user who has gone is `null` —
 * are reproduced by the `?? null` on the map lookup, and a blank name is `null`
 * too (`NULLIF(btrim(…), '')`), so the screen says "someone" rather than
 * printing an empty name.
 */
async function withDeleterNames(db: Queryable, items: readonly UnnamedDeletedItem[]): Promise<DeletedItem[]> {
  if (items.length === 0) return [];
  const ids = [...new Set(items.map((item) => item.deletedBy))];
  const { rows } = await db.query<{ id: string; name: string | null }>(
    `SELECT "id", NULLIF(btrim("name"), '') AS name FROM "user" WHERE "id" = ANY($1)`,
    [ids],
  );
  const names = new Map(rows.map((row) => [row.id, row.name]));
  return items.map((item) => ({ ...item, deletedByName: names.get(item.deletedBy) ?? null }));
}
