import type { DeletedItem, LifecycleKind } from '@gisik-nokma/domain';
import type { EnvelopeSeed } from '../submit.js';

/**
 * Which events each trash act sends, and in which ORDER (trash series Plan 4).
 * Order matters because the ingest door commits a batch one event at a time,
 * in order (`apps/server/src/ingest/ingest-service.ts`'s `ingestAll`):
 *
 * - a permanent delete is `<kind>.deleted` THEN `purge.marked` — the mark is
 *   refused on a live item (`DELETE_FIRST_REASON`), so it must follow the delete;
 * - a restore of a marked item is `purge.unmarked` THEN the restore — the
 *   restore is refused while marked (`UNMARK_FIRST_REASON`).
 *
 * Every payload is `{}`: Plan 1's lifecycle payloads are empty and `.strict()`,
 * and the due date is derived by the server, never claimed.
 */
export type LifecycleTarget = { kind: LifecycleKind; workspaceId: string; entityId: string };

const DELETE_TYPE: Readonly<Record<LifecycleKind, string>> = {
  workspace: 'workspace.deleted',
  project: 'project.deleted',
  ticket: 'ticket.deleted',
  note: 'note.deleted',
};

/**
 * The UNDELETE of each kind. `project.restored`/`workspace.restored` are
 * UN-ARCHIVE (spec §4, "one type = one meaning") and must never appear here —
 * case 19.212's mutation is exactly that swap.
 */
const RESTORE_TYPE: Readonly<Record<LifecycleKind, string>> = {
  workspace: 'workspace.undeleted',
  project: 'project.undeleted',
  ticket: 'ticket.restored',
  note: 'note.restored',
};

function seed(target: LifecycleTarget, type: string): EnvelopeSeed {
  return {
    workspaceId: target.workspaceId,
    entity: { kind: target.kind, id: target.entityId },
    type,
    payload: {},
  };
}

export function deleteSeeds(target: LifecycleTarget, permanent: boolean): EnvelopeSeed[] {
  const deleted = seed(target, DELETE_TYPE[target.kind]);
  return permanent ? [deleted, seed(target, 'purge.marked')] : [deleted];
}

export function restoreSeeds(target: LifecycleTarget, unmarkFirst: boolean): EnvelopeSeed[] {
  const restore = seed(target, RESTORE_TYPE[target.kind]);
  return unmarkFirst ? [seed(target, 'purge.unmarked'), restore] : [restore];
}

export function markSeeds(target: LifecycleTarget): EnvelopeSeed[] {
  return [seed(target, 'purge.marked')];
}

export function unmarkSeeds(target: LifecycleTarget): EnvelopeSeed[] {
  return [seed(target, 'purge.unmarked')];
}

/** T8 — the workspace archive pair, filed against the workspace in its own stream. */
export function archiveWorkspaceSeeds(workspaceId: string, currentlyArchived: boolean): EnvelopeSeed[] {
  return [
    seed(
      { kind: 'workspace', workspaceId, entityId: workspaceId },
      currentlyArchived ? 'workspace.restored' : 'workspace.archived',
    ),
  ];
}

/** A Deleted items row as the thing its buttons act on. A workspace row's `workspaceId` IS its id (`read/deleted-items.ts`). */
export function targetOf(item: DeletedItem): LifecycleTarget {
  return { kind: item.kind, workspaceId: item.workspaceId, entityId: item.id };
}
