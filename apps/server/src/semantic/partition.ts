import type { NoteScopeMode } from '@gisik-nokma/domain';

export type TicketAudienceRow = { resolvedMode: 'workspace' | 'project' | 'explicit'; projectId: string; resolvedUserIds: readonly string[] };
export type NoteAudienceRow = {
  scopeMode: NoteScopeMode;
  authorId: string;
  homeProjectId: string;
  scopeUserIds: readonly string[];
  /** `ticketAudienceKey` of each LIVE attached ticket (for `inherit`). */
  inheritedKeys: readonly string[];
};

/**
 * Spec D §4.1 step 2 (D4): the visibility partition, "mode + project + explicit set". It is a CLUSTERING
 * boundary, not the security boundary: it does not model the assignee arm (R1, `assigneeReachWhere`) or a
 * project note's author arm. Every read of a suggestion or concept re-checks D4 per reader (Task 4).
 * A bare switch with no `default`, as `ticketAudienceWhere` (`visible-where.ts:104`) is, so a new mode is a
 * TS2366 here.
 */
export function ticketAudienceKey(row: TicketAudienceRow): string {
  switch (row.resolvedMode) {
    case 'workspace':
      return 'w';
    case 'project':
      return `p:${row.projectId}`;
    case 'explicit':
      return `e:${[...new Set(row.resolvedUserIds)].sort().join(',')}`;
  }
}

export function noteAudienceKey(row: NoteAudienceRow): string {
  switch (row.scopeMode) {
    case 'private':
      return `a:${row.authorId}`;
    case 'workspace':
      return 'w';
    case 'project':
      return `p:${row.homeProjectId}`;
    case 'explicit':
      return `e:${[...new Set([...row.scopeUserIds, row.authorId])].sort().join(',')}`;
    case 'inherit': {
      const keys = [...new Set(row.inheritedKeys)].sort();
      return keys.length === 1 ? (keys[0] as string) : `i:${keys.join('|')}`;
    }
  }
}
