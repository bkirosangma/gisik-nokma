import { purgeDueAt, type EventEnvelope, type LifecycleKind } from '@gisik-nokma/domain';
import type { Refusal } from '@gisik-nokma/rule-engine';
import type { Queryable } from '../db/queryable.js';

/**
 * State refusals (trash series, Plan 1 Task 4; spec §4). Every `*.deleted`,
 * `*.undeleted`/`*.restored` and `purge.marked`/`purge.unmarked` claim is
 * answered against the item's OWN row (Task 2's `proj_workspaces`/
 * `proj_projects`/`proj_tickets`/`proj_notes` columns), never against the
 * event's payload — none of these payloads carry state to check.
 *
 * Wired into `checkPermission`'s chain after `checkPrefixReservation` and
 * before `checkVisibilityPermission`.
 */

export const LIFECYCLE_RULE = 'lifecycle.state';

export const WORKSPACE_DELETED_REASON =
  'This workspace is deleted. Restore it from Deleted items on your Account page first.';
export const PROJECT_DELETED_REASON =
  'This project is deleted. Restore it from Deleted items on your Account page first.';
export const ALREADY_DELETED_REASON = (kind: LifecycleKind): string => `This ${kind} is already deleted.`;
export const NOT_DELETED_REASON = (kind: LifecycleKind): string => `This ${kind} is not deleted.`;
export const DELETE_FIRST_REASON = (kind: LifecycleKind): string =>
  `Delete this ${kind} before marking it for permanent deletion.`;
export const ALREADY_MARKED_REASON = (kind: LifecycleKind): string =>
  `This ${kind} is already marked for permanent deletion.`;
export const NOT_MARKED_REASON = (kind: LifecycleKind): string =>
  `This ${kind} is not marked for permanent deletion.`;
export const UNMARK_FIRST_REASON = (kind: LifecycleKind): string =>
  `Unmark this ${kind} for permanent deletion before restoring it.`;
export const PURGE_DUE_REASON = (kind: LifecycleKind): string => `This ${kind} is already being permanently deleted.`;

function refuse(reason: string): Refusal {
  return { refused: true, rule: LIFECYCLE_RULE, reason };
}

const LIFECYCLE_TABLE: Record<LifecycleKind, readonly [table: string, key: string]> = {
  workspace: ['proj_workspaces', 'workspace_id'],
  project: ['proj_projects', 'project_id'],
  ticket: ['proj_tickets', 'ticket_id'],
  note: ['proj_notes', 'note_id'],
};

type LifecycleState = { deletedAt: string | null; purgeMarkedAt: string | null };

/**
 * A missing `proj_workspaces` row means live and unmarked (Task 2); every
 * other kind's row always exists once the item is founded, since
 * `checkProjectExists`/ticket- and note-creation already guarantee it before
 * this runs. Either way, an absent row reads the same as a live, unmarked one.
 */
async function readLifecycle(db: Queryable, kind: LifecycleKind, id: string): Promise<LifecycleState> {
  const [table, key] = LIFECYCLE_TABLE[kind];
  const { rows } = await db.query<{ deleted_at: Date | null; purge_marked_at: Date | null }>(
    `SELECT deleted_at, purge_marked_at FROM ${table} WHERE ${key} = $1`,
    [id],
  );
  const row = rows[0];
  return {
    deletedAt: row?.deleted_at ? row.deleted_at.toISOString() : null,
    purgeMarkedAt: row?.purge_marked_at ? row.purge_marked_at.toISOString() : null,
  };
}

/** The project a ticket's mark is contained by, or `null` if the ticket has no row. */
async function ticketProjectId(db: Queryable, ticketId: string): Promise<string | null> {
  const { rows } = await db.query<{ project_id: string }>(
    'SELECT project_id FROM proj_tickets WHERE ticket_id = $1',
    [ticketId],
  );
  return rows[0]?.project_id ?? null;
}

/**
 * The project a note's mark is contained by, or `null` for a workspace-level
 * note (`home_project_id = ''`) — that note's immediate container is the
 * WORKSPACE, which Task 5's own workspace-wide gate covers, not this one. Only a
 * project of the note's OWN workspace contains it (18.523): a note filed under
 * another workspace's project before 18.520 refused that is not frozen by, and
 * so learns nothing of, that project's deletion.
 */
async function noteHomeProjectId(db: Queryable, noteId: string): Promise<string | null> {
  const { rows } = await db.query<{ home_project_id: string }>(
    `SELECT n.home_project_id FROM proj_notes n
       JOIN proj_projects p ON p.project_id = n.home_project_id AND p.workspace_id = n.workspace_id
      WHERE n.note_id = $1`,
    [noteId],
  );
  const id = rows[0]?.home_project_id;
  return id === undefined || id === '' ? null : id;
}

/**
 * The project that CONTAINS this event, for the project-wide gate below — or
 * `null` for an event with no project affiliation at all (a workflow, a
 * ticket-type, a workspace act, …), which the gate then leaves alone.
 *
 * `ticket.created` and `note.created` are read from their OWN PAYLOAD, not
 * from a row: their entity has no `proj_tickets`/`proj_notes` row yet at door
 * time, the same reason Task 4's `readLifecycle` docblock gives for every
 * other kind.
 */
async function projectIdForGate(db: Queryable, env: EventEnvelope): Promise<string | null> {
  switch (env.entity.kind) {
    case 'project':
      return env.entity.id;
    case 'ticket': {
      if (env.type === 'ticket.created') {
        const payload = env.payload as { projectId: string };
        return payload.projectId;
      }
      return ticketProjectId(db, env.entity.id);
    }
    case 'note': {
      if (env.type === 'note.created') {
        const payload = env.payload as { homeProjectId: string };
        return payload.homeProjectId === '' ? null : payload.homeProjectId;
      }
      return noteHomeProjectId(db, env.entity.id);
    }
    default:
      return null;
  }
}

export async function checkLifecycle(db: Queryable, env: EventEnvelope, now: Date): Promise<Refusal | null> {
  // Trash series, Plan 1 Task 5 (spec §4 T10). In a DELETED workspace, refuse
  // every event except the ones that manage the WORKSPACE's own lifecycle —
  // its undelete, its own mark/unmark, and (Ruling, ledgered) its own delete,
  // exempted here for the same reason `LIVE_GATE_EXEMPT` exempts
  // `ticket.deleted`: the per-type arm below gives the more specific sentence
  // (`ALREADY_DELETED_REASON`), and without the exemption 19.030's second
  // `workspace.deleted` would answer `WORKSPACE_DELETED_REASON` instead.
  // Checked FIRST, before the per-type switch, so it also refuses types this
  // switch has no case for at all (`ticket.field_set`, `note.body_set`,
  // `workspace.renamed`, …) — the choke point the brief names.
  const isWorkspaceOwnAct =
    env.entity.kind === 'workspace' &&
    (env.type === 'workspace.deleted' ||
      env.type === 'workspace.undeleted' ||
      env.type === 'purge.marked' ||
      env.type === 'purge.unmarked');
  if (!isWorkspaceOwnAct) {
    const workspace = await readLifecycle(db, 'workspace', env.workspaceId);
    if (workspace.deletedAt !== null) {
      return refuse(WORKSPACE_DELETED_REASON);
    }
  }

  // Task 6 (spec §4 T10): the same choke point, one container down. Every
  // event whose CONTAINING project is deleted is refused here, before the
  // per-type switch — which is what catches `ticket.field_set`, `note.body_set`
  // and any other type this switch has no case for.
  //
  // `project.deleted` is NOT exempted (Ruling, matching Task 5's workspace
  // gate): the project IS its own container for a `project.*` event, so
  // exempting only undelete/mark/unmark and not delete would make the FIRST
  // `project.deleted` answer this gate's generic reason instead of falling
  // through — the per-type arm below still needs to run for 19.030's ALREADY
  // case, and it can only do that if `project.deleted` reaches it too. Cost if
  // wrong: a project's own delete would read the wrong refusal reason.
  const isProjectOwnAct =
    env.entity.kind === 'project' &&
    (env.type === 'project.deleted' ||
      env.type === 'project.undeleted' ||
      env.type === 'purge.marked' ||
      env.type === 'purge.unmarked');
  if (!isProjectOwnAct) {
    const projectId = await projectIdForGate(db, env);
    if (projectId !== null) {
      const project = await readLifecycle(db, 'project', projectId);
      if (project.deletedAt !== null) {
        return refuse(PROJECT_DELETED_REASON);
      }
    }
    // A move names a SECOND project, the one it files the note under, and that one must be live too, as a new
    // note's home is (task/notes-cross-workspace-followup, 18.521). The container above is still the CURRENT home.
    // `checkProjectExists` ran first, so the target is a project of this workspace.
    if (env.type === 'note.moved') {
      const target = (env.payload as { homeProjectId: string }).homeProjectId;
      if (target !== '' && (await readLifecycle(db, 'project', target)).deletedAt !== null) {
        return refuse(PROJECT_DELETED_REASON);
      }
    }
  }

  switch (env.type) {
    case 'workspace.deleted':
    case 'project.deleted': {
      const kind: LifecycleKind = env.type === 'workspace.deleted' ? 'workspace' : 'project';
      const state = await readLifecycle(db, kind, env.entity.id);
      if (state.deletedAt !== null) {
        return refuse(ALREADY_DELETED_REASON(kind));
      }
      return null;
    }
    case 'workspace.undeleted':
    case 'project.undeleted': {
      const kind: LifecycleKind = env.type === 'workspace.undeleted' ? 'workspace' : 'project';
      const state = await readLifecycle(db, kind, env.entity.id);
      // Neither type existed before this plan, so nothing else answers this.
      if (state.deletedAt === null) {
        return refuse(NOT_DELETED_REASON(kind));
      }
      if (state.purgeMarkedAt !== null) {
        return refuse(UNMARK_FIRST_REASON(kind));
      }
      return null;
    }
    case 'ticket.restored':
    case 'note.restored': {
      // "Not deleted" is already refused for these two: `checkTicketRestored`
      // (`packages/rule-engine/src/checks/deletion.ts`) for tickets, and the
      // note reducer (`packages/domain/src/note-state.ts`'s `applyNoteEvent`)
      // for notes. Only the marked arm is this check's to add.
      const kind: LifecycleKind = env.type === 'ticket.restored' ? 'ticket' : 'note';
      const state = await readLifecycle(db, kind, env.entity.id);
      if (state.purgeMarkedAt !== null) {
        return refuse(UNMARK_FIRST_REASON(kind));
      }
      return null;
    }
    case 'purge.marked': {
      const kind = env.entity.kind as LifecycleKind;
      const state = await readLifecycle(db, kind, env.entity.id);
      if (state.deletedAt === null) {
        return refuse(DELETE_FIRST_REASON(kind));
      }
      if (state.purgeMarkedAt !== null) {
        return refuse(ALREADY_MARKED_REASON(kind));
      }
      // Containment (spec §4): a child inside a deleted parent is not
      // separately markable — enforced above by the workspace-wide gate
      // (Task 5) and the project-wide gate (Task 6), both of which run before
      // this switch and refuse first for any container that is itself
      // deleted. `purge.marked` is not exempted from either gate (only
      // `undeleted`/`purge.marked`/`purge.unmarked` on the container's OWN
      // entity are), so a mark on a ticket/note/project whose container is
      // deleted never reaches this arm at all.
      return null;
    }
    case 'purge.unmarked': {
      const kind = env.entity.kind as LifecycleKind;
      const state = await readLifecycle(db, kind, env.entity.id);
      if (state.purgeMarkedAt === null) {
        return refuse(NOT_MARKED_REASON(kind));
      }
      if (Date.parse(purgeDueAt(state.purgeMarkedAt)) <= now.getTime()) {
        return refuse(PURGE_DUE_REASON(kind));
      }
      return null;
    }
    default:
      return null;
  }
}
