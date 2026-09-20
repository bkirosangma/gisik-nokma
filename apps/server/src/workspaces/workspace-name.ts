import type { Queryable } from '../db/queryable.js';
import { derivePrefix } from '@gisik-nokma/domain';

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
  // ONE query for both halves of the identity — see `workspaceIdentityFromLedger`,
  // which this delegates to. The pair is read together on every directory row,
  // and a second round trip per row to fetch the prefix would be a cost paid on
  // the hot path for no answer the first query could not carry.
  const { name } = await workspaceIdentityFromLedger(db, workspaceId);
  return name;
}

/**
 * A workspace's name AND the prefix that forms the first half of every ticket
 * key it holds — `CC` in `CCSO-1183` (owner spec 2026-09-20).
 *
 * ## One query, one order, two ends of it
 *
 * The two halves of the identity are read from OPPOSITE ENDS of the same
 * workspace_seq-ordered list, and that is the only thing that makes the pair
 * coherent:
 *
 * - the NAME is the LAST naming event — a rename is a later claim about what
 *   the workspace is called;
 * - the PREFIX is the FIRST naming event that carries one — because a prefix is
 *   IMMUTABLE. `workspace.renamed` does not carry one and deliberately cannot
 *   (`events/membership.ts`): moving the prefix on a rename would change every
 *   ticket key in the workspace under readers who had already quoted one, and a
 *   key's whole job is to name one thing durably.
 *
 * A single `ORDER BY workspace_seq DESC LIMIT 1`, which the name's own fold used
 * before this function existed, cannot answer the prefix at all once a rename
 * has happened — the latest event has no prefix on it. So the query takes the
 * whole naming history for the workspace (two event types, and in practice two
 * rows) and the two ends are read off it.
 *
 * ## The prefix is never absent for a NAMED workspace
 *
 * `prefix` is `null` only where `name` is `null` — a workspace with no naming
 * event at all, which has nothing to derive from and nothing to render. For
 * every named workspace the answer is the stored prefix where the founding
 * claim carried one, and `derivePrefix(name)` where it did not.
 *
 * **The derivation is a READER'S rule, not a column's.** Nothing writes it
 * back: every workspace in the ledger today was founded before the field
 * existed, and the founding event cannot be amended (`events` refuses UPDATE —
 * `events_append_only`), so a stored prefix could only ever be what a founding
 * claim actually said. Deriving here keeps the answer a pure function of the
 * ledger, which is what makes it stable across replays — and it is why the
 * owner's three named rows come out right without a data migration:
 * `Convenience Corner` → `CC`, `Shop operations` → `SO`, `gggg` → `GG`.
 */
export async function workspaceIdentityFromLedger(
  db: Queryable,
  workspaceId: string,
): Promise<{ name: string | null; prefix: string | null }> {
  const { rows } = await db.query<{ payload: { name?: unknown; prefix?: unknown } }>(
    `SELECT payload FROM events
      WHERE workspace_id = $1 AND type IN ('workspace.created', 'workspace.renamed')
      ORDER BY workspace_seq ASC`,
    [workspaceId],
  );
  const name = rows.at(-1)?.payload.name;
  const named = typeof name === 'string' ? name : null;
  if (named === null) {
    return { name: null, prefix: null };
  }
  // `?? null` over the FIRST row and not `Array.prototype.find`: a founding
  // claim written before the field existed has no key at all, so `find` would
  // walk the history looking for a prefix no later event can carry — there is
  // exactly one candidate and it is the first.
  const stored = rows[0]?.payload.prefix;
  return { name: named, prefix: typeof stored === 'string' ? stored : derivePrefix(named) };
}
