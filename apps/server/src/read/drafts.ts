import type { TicketState } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { holdsDraftRights } from '../visibility/can-open.js';
import { visibleProjects } from './visible-projects.js';

/** One row of the Drafts page and of `list_my_drafts`. It never carries a key: a draft has none (T2). */
export type DraftListItem = {
  ticketId: string;
  projectId: string;
  projectName: string;
  typeId: string;
  title: string;
  parentId: string | null;
  /** The server instant of the draft's last ledger event (its creation when nothing followed). */
  updatedAt: string;
  /** `attachments` rows uploaded to THIS draft (R60); a sub-draft's are counted on the sub-draft. */
  attachmentCount: number;
};

type Row = {
  ticket_id: string;
  project_id: string;
  type_id: string;
  parent_id: string | null;
  fields: TicketState['fields'];
  updated_at: Date;
  attachment_count: string;
};

/**
 * The caller's own drafts in one workspace, newest first (drafts spec §12.2, R55). This is the ONE reader of
 * "my drafts": the Drafts page, `GET /v1/me/drafts`, the full bootstrap (G4) and the graph series call it.
 *
 * The filter is the flag and the viewer, not the audience: `draft_author_id = $2`, not discarded, and R18's
 * test through `holdsDraftRights`, which is the same function `isOpenableDraft` calls, so the list and the
 * doors cannot disagree about who still owns a draft. A project whose name the caller may not be told is
 * skipped (an author who can open a draft is on its project, so in practice nothing is).
 */
export async function listMyDrafts(
  db: Queryable,
  userId: string,
  workspaceId: string,
  opts: { projectId?: string } = {},
): Promise<DraftListItem[]> {
  const eff = await resolveEffectiveRole(db, userId, workspaceId);
  if (eff.workspaceRole === null) return [];
  const { rows } = await db.query<Row>(
    `SELECT t.ticket_id, t.project_id, t.type_id, t.parent_id, t.fields,
            COALESCE(
              (SELECT max(e.server_time) FROM events e WHERE e.entity_kind = 'ticket' AND e.entity_id = t.ticket_id),
              t.draft_at
            ) AS updated_at,
            (SELECT count(*) FROM attachments a WHERE a.ticket_id = t.ticket_id) AS attachment_count
       FROM proj_tickets t
      WHERE t.workspace_id = $1 AND t.draft_author_id = $2 AND t.draft_discarded IS NOT TRUE
      ORDER BY updated_at DESC, t.ticket_id DESC`,
    [workspaceId, userId],
  );
  const names = new Map((await visibleProjects(db, eff, workspaceId)).map((p) => [p.projectId, p.name] as const));
  const items: DraftListItem[] = [];
  for (const row of rows) {
    if (opts.projectId !== undefined && row.project_id !== opts.projectId) continue;
    if (!holdsDraftRights(eff, row.project_id)) continue;
    const projectName = names.get(row.project_id);
    if (projectName === undefined) continue;
    const title = row.fields['title']?.value;
    items.push({
      ticketId: row.ticket_id,
      projectId: row.project_id,
      projectName,
      typeId: row.type_id,
      title: typeof title === 'string' ? title : '',
      parentId: row.parent_id,
      updatedAt: row.updated_at.toISOString(),
      attachmentCount: Number(row.attachment_count),
    });
  }
  return items;
}
