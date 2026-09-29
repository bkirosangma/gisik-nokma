import type { Queryable } from '../db/queryable.js';
import type { SqlParams } from '../read/sql-params.js';

/**
 * How many inheritance links the arm walks, in BOTH spellings. Nothing in the domain refuses a
 * reparent that makes a ticket its own ancestor (`grant-backfill.ts` records it, case 6.58), so
 * termination cannot rest on "the tree is a tree": `UNION` alone dedupes a plain cycle, and this
 * bound is what stops the walk once a depth column is carried. Real trees are a handful of levels
 * deep; 64 is far above any and far below anything that costs a read.
 */
export const ARM_MAX_DEPTH = 64;

/**
 * THE ASSIGNEE ARM, EXTENDED (owner ruling 2026-09-29: "keep today's behaviour and
 * just extend it to cover those notes and sub-tickets"). The explicit list is NOT
 * written; this is a read-time reach, gone the moment the assignment moves.
 *
 * X is reached by U iff some ticket on X's INHERITANCE CHAIN — X itself, then X's
 * parent while X's `own_mode` is 'inherit', and so on up — is currently assigned
 * to U in a project that is not deleted. A ticket that authors its own audience
 * ends the chain: its subtree is judged by that audience alone.
 *
 * ## What it deliberately does NOT do
 *
 * - **No workspace-role term.** Every caller holds an EffectiveRole and ANDs
 *   `eff.workspaceRole !== null` itself (case 6.276).
 * - **No soft-delete term.** Deletion is not visibility (`LIVE_TICKET_WHERE`'s docblock): `canSee`
 *   answers for a deleted ticket exactly as the audience does, and the VIEW readers — which AND
 *   `LIVE_TICKET_WHERE` (lists, board) or `ticketIsLive` (a note's attached tickets) — hide it.
 *   The arm therefore reaches a deleted ticket and its live descendants precisely as an audience
 *   would (case 6.278).
 *
 * Two spellings, pinned equal by case 6.272: this upward walk for "these ids", and
 * `assigneeReachWhere` (a downward CTE) for list reads. Both stop at `ARM_MAX_DEPTH` links.
 */
export async function assigneeArmTickets(db: Queryable, userId: string, ticketIds: readonly string[]): Promise<Set<string>> {
  if (ticketIds.length === 0) return new Set();
  const { rows } = await db.query<{ start_id: string }>(
    `WITH RECURSIVE chain(start_id, ticket_id, own_mode, parent_id, depth) AS (
       SELECT v.ticket_id, v.ticket_id, v.own_mode, v.parent_id, 0
         FROM proj_visibility v WHERE v.ticket_id = ANY ($1::text[])
       UNION
       SELECT c.start_id, p.ticket_id, p.own_mode, p.parent_id, c.depth + 1
         FROM chain c JOIN proj_visibility p ON p.ticket_id = c.parent_id
        WHERE c.own_mode = 'inherit' AND c.depth < ${ARM_MAX_DEPTH}
     )
     SELECT DISTINCT c.start_id
       FROM chain c JOIN proj_tickets t ON t.ticket_id = c.ticket_id
      WHERE t.assignee_id = $2
        AND NOT EXISTS (SELECT 1 FROM proj_projects dp WHERE dp.project_id = t.project_id AND dp.deleted_at IS NOT NULL)`,
    [ticketIds, userId],
  );
  return new Set(rows.map((r) => r.start_id));
}

/**
 * The list-read twin over `column` (default `v.ticket_id`; the note arm passes `na.ticket_id`):
 * TRUE exactly for the tickets `assigneeArmTickets` would return (case 6.272). It starts at every
 * ticket assigned to the viewer, so `proj_tickets_assignee_idx` (migration 1790700000000) drives
 * it, and descends through `proj_visibility_children` while a child's `own_mode` is 'inherit'.
 * An uncorrelated subquery: Postgres evaluates it once per statement, not once per row.
 */
export function assigneeReachWhere(userId: string, params: SqlParams, column = 'v.ticket_id'): string {
  return `${column} IN (
    WITH RECURSIVE reach(ticket_id, depth) AS (
      SELECT t.ticket_id, 0 FROM proj_tickets t
       WHERE t.assignee_id = ${params.add(userId)}
         AND NOT EXISTS (SELECT 1 FROM proj_projects dp WHERE dp.project_id = t.project_id AND dp.deleted_at IS NOT NULL)
      UNION
      SELECT c.ticket_id, r.depth + 1 FROM proj_visibility c JOIN reach r ON c.parent_id = r.ticket_id
       WHERE c.own_mode = 'inherit' AND r.depth < ${ARM_MAX_DEPTH}
    ) SELECT ticket_id FROM reach)`;
}
