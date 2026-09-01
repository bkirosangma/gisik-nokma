import type { Queryable } from '../db/queryable.js';

/**
 * A workspace's current name, read straight from its ledger.
 *
 * ## Why there is no `proj_workspaces` here
 *
 * A workspace's name is carried by exactly two event types and read in exactly
 * one place — the directory (`GET /v1/me/workspaces`), which already runs one
 * query per membership row. A projection for that would be a table this task
 * authored for another plan's concept, and the series has a standing argument
 * against exactly that move (`routes/tickets.ts`: a route must not grow a
 * second, competing definition of another plan's projection). So this is a
 * ledger fold, deliberately, and the plan text says so: *"collapses into a
 * workspace projection if one ever grows."* When one does, this function's
 * callers substitute it and this file goes.
 *
 * ## `workspace_seq`, not `seq`, and not `server_time`
 *
 * `workspace.created` and `workspace.renamed` are filed against the WORKSPACE
 * entity, so today their per-entity `seq` and the workspace cursor happen to
 * agree — but nothing requires a founding event to be filed against an entity
 * whose id equals the workspace id (`check-role-permission.test.ts` has a case
 * built on exactly that), and a rename filed against a differently-identified
 * workspace entity would run its own `seq` counter. Ordering by `server_time`
 * is worse still: it is a clock, and two events inside one ingest can share a
 * millisecond. `workspace_seq` is the workspace's own total order and the only
 * one that answers "which of these came last" without a coincidence holding it
 * up — the same confusion case 6.21 pins one layer down.
 *
 * ## Latest wins, including a second `workspace.created`
 *
 * The client door refuses a second `workspace.created` into a founded workspace
 * (`../permissions/check-permission.ts`, case 6.52), but the INTERNAL door does
 * not and must not, so an older ledger — or a server-side append — can still
 * hold more than one. `ORDER BY workspace_seq DESC LIMIT 1` over both types is
 * therefore "the last thing anyone said this workspace is called", which is the
 * honest answer for a ledger rather than a special case for one type.
 *
 * Returns `null` when the workspace has no naming event at all — a half-founded
 * residue, or an id that names nothing. A caller renders that rather than
 * crashing on it: the directory is a list of memberships, and a membership
 * whose workspace cannot be named is still a membership the person holds.
 */
export async function workspaceNameFromLedger(
  db: Queryable,
  workspaceId: string,
): Promise<string | null> {
  const { rows } = await db.query<{ payload: { name?: unknown } }>(
    `SELECT payload FROM events
      WHERE workspace_id = $1 AND type IN ('workspace.created', 'workspace.renamed')
      ORDER BY workspace_seq DESC
      LIMIT 1`,
    [workspaceId],
  );
  const name = rows[0]?.payload.name;
  return typeof name === 'string' ? name : null;
}
