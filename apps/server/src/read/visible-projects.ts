import type { EffectiveRole } from '../permissions/effective-role.js';
import type { Queryable } from '../db/queryable.js';
import { resolveProjectPrefixes } from '@gisik-nokma/domain';

export type VisibleProject = {
  projectId: string;
  name: string;
  archived: boolean;
  /**
   * **`null` is NOT DESCRIBED, and it is not `''`** (door A, 2026-09-19).
   *
   * The column is nullable for the reason the migration states: `''` would be
   * the CLAIM "this project has no description" — a fact about the project —
   * while NULL is the absence of any claim, which is what a project nobody has
   * described actually has. A reader that collapsed the two would put a claim
   * in the render that no event ever made, which is the same
   * withheld-vs-empty distinction `ticketCount` draws one field over.
   *
   * **It rides with the NAME, exactly as `archived` does.** `visibleProjects`
   * filters ROWS and not columns, so a caller who is not on a project receives
   * no row and therefore no description: the disclosure decision was already
   * made by the filter, and this column introduces no new rule of its own.
   */
  description: string | null;
  /**
   * The second half of every ticket key in this project — `SO` in `CCSO-1183`
   * (owner spec 2026-09-20). **Never null, and that is the whole design:** the
   * column is nullable because no founding event before 2026-09-20 could carry
   * one, but a project with no stored prefix still needs a key, so a reader
   * resolves the two cases with ONE rule — the stored value where there is one,
   * `derivePrefix(foundingName)` where there is not (`packages/domain/src/prefix.ts`).
   * **The derivation reads the FOUNDING name, never the current one** (owner,
   * 2026-10-01): a rename never moves a key, entered or derived, so this value
   * is the same before and after `project.updated`.
   * What comes out is a value no read site has to think about, which is the
   * only way an enumeration of eight render sites stays honest.
   *
   * **Resolved across the WHOLE workspace, before the role filter**, because
   * the half must be unique within one — see the call below.
   */
  prefix: string;
  /** The group this project is filed under, `null` when ungrouped (prefixes and groups Task 6). */
  groupId: string | null;
};

/**
 * The projects a viewer may be told the NAME of, in one workspace.
 *
 * ## The rule is applied, not authored (rulings P32 and P38)
 *
 * `canSeeResolved` decides against a TICKET's audience, and a project has no
 * audience — no `resolvedMode`, no `resolvedUserIds` — so that function has
 * nothing to say here directly. What it does supply is the shape of the answer,
 * and its four branches are not uniform:
 *
 * - `owner` returns `true` unconditionally, so an owner sees every project.
 *   The exemption is the shipped switch's own, named there, not invented here.
 * - every other role reads `eff.projects`, which rule A fills with every
 *   founded project for an admin or member, and which is a guest's explicit
 *   rows only. Ruling P38 extends that branch to this door rather than the
 *   `workspace`-mode branch, because P32 had already ruled the identical
 *   question one door over for `WorkItem.projectName`: a project's NAME is a
 *   disclosure and is not served for any other project, role-independent.
 *
 * ## Why a partial workspace is the CORRECT answer and not a defect
 *
 * A GUEST outside project Y is told nothing about Y here. An admin or member is
 * on every project (rule A), so for them this list is the whole live workspace.
 * A guest may still hold Y's project ID — `TicketCard` carries `projectId`
 * (`read/ticket-cards.ts`) — so this list is not an existence secret. It is a
 * NAME one, which is exactly the distinction P32 drew.
 *
 * The tie-break, recorded because the alternative is defensible: serving MORE
 * later is a widening and reversible; serving a name and retracting it is not.
 *
 * ## `archived` rides with the NAME, and is never withheld
 *
 * Task 16 added it. A project's archived flag is a fact about a project this
 * caller is already being told the name of, so there is nothing left to
 * withhold: the disclosure decision was made one line down, by the filter. It is
 * deliberately NOT one of the counts — the counts are withheld from a guest
 * (`workspace-counts.ts`), and giving `archived` the same treatment would make a
 * guest's card unable to say why a project it CAN name is not in the live list.
 *
 * ## Ordering
 *
 * By `project_id`, so the answer is a function of the SET and not of insertion
 * order — the same reason `latestWorkflowDefs` sorts its input.
 */
/**
 * Every project prefix in use in one workspace — STORED OR DERIVED.
 *
 * ## Why this exists beside `visibleProjects` rather than inside it
 *
 * The door needs the same answer a reader gets, and it needs it for a viewer
 * who is not looking at anything: an admin founding a project has to be refused
 * a prefix another project already answers to. `visibleProjects` cannot serve
 * that — it filters ROWS by role, deliberately, and a prefix that is invisible
 * to this caller is still a prefix the KEY of the project they can see must not
 * collide with.
 *
 * So this is the role-free half, over the same query, with the same
 * `resolveProjectPrefixes` call and therefore the same ORDER (`project_id`).
 * Two callers, one rule: a door that resolved prefixes its own way would accept
 * a prefix the read then hands to somebody else.
 *
 * ## Derived from the FOUNDING name
 *
 * `projectPrefixRows` feeds `founding_name` to the resolver, not `name`. A
 * rename (`project.updated`) rewrites `name` and must never re-key the project
 * or shift a neighbour's derived prefix; reading `name` here did exactly that
 * for every project founded without an entered prefix, from #862 until this fix.
 *
 * ## Derived prefixes COUNT, and that is the whole point of the check
 *
 * A project founded with no entered prefix derives one, and `resolveProjectPrefixes`
 * lets an ENTERED prefix outrank a derived one. So if this set held only stored
 * prefixes, an admin could found a project entering `SO` while another project
 * already ANSWERS to `SO` — the new one would take the value at read time and
 * the older project would silently move to `SO2`, changing every ticket key in
 * it under readers who had already quoted one. The refusal is what stops that,
 * and it exists only because the derived values are in here.
 */
export async function projectPrefixesInWorkspace(
  db: Queryable,
  workspaceId: string,
): Promise<Map<string, string>> {
  const rows = await projectPrefixRows(db, workspaceId);
  const resolved = resolveProjectPrefixes(
    rows.map((row) => ({ name: row.foundingName, prefix: row.prefix })),
    await reservedPrefixes(db, workspaceId),
  );
  // A MAP keyed by project id, not a Set of values, and the caller needs the
  // key: a project re-delivering its OWN `project.created` must not be refused
  // by a prefix it already holds. A Set cannot answer "is this value held by
  // somebody else", and asking it the wrong question made an idempotent retry
  // fail with `project.prefix-taken` instead of the `duplicate-event-id` the
  // ledger answers — see `checkProjectPrefixUnique`.
  return new Map(rows.map((row, index) => [row.project_id, resolved[index]!]));
}

/**
 * The workspace's RESERVED prefixes: every prefix any of its projects used to
 * hold (`proj_project_prefixes`, prefixes and groups plan Task 2). A derived
 * prefix flees them; an entered one does not (`resolveProjectPrefixes`).
 * Both prefix readers load the same set, so the door and a reader never answer
 * differently for one workspace.
 */
async function reservedPrefixes(db: Queryable, workspaceId: string): Promise<Set<string>> {
  const { rows } = await db.query<{ prefix: string }>(
    'SELECT prefix FROM proj_project_prefixes WHERE workspace_id = $1',
    [workspaceId],
  );
  return new Set(rows.map((row) => row.prefix));
}

/**
 * Every project's current prefix and its former ones, with the instant each
 * stopped being its prefix (`until`, an ISO-8601 string — the `serverTime` of
 * the `project.updated` that moved it), oldest first. Role-free, like
 * `projectPrefixesInWorkspace`, whose answer `current` is.
 */
export async function projectPrefixHistory(
  db: Queryable,
  workspaceId: string,
): Promise<Map<string, { current: string; former: Array<{ prefix: string; until: string }> }>> {
  const current = await projectPrefixesInWorkspace(db, workspaceId);
  const { rows } = await db.query<{ project_id: string; prefix: string; until_time: Date }>(
    `SELECT project_id, prefix, until_time FROM proj_project_prefixes
      WHERE workspace_id = $1
      ORDER BY until_time, prefix`,
    [workspaceId],
  );
  const history = new Map(
    [...current].map(([projectId, prefix]) => [
      projectId,
      { current: prefix, former: [] as Array<{ prefix: string; until: string }> },
    ]),
  );
  for (const row of rows) {
    history.get(row.project_id)?.former.push({ prefix: row.prefix, until: row.until_time.toISOString() });
  }
  return history;
}

/** The workspace's projects in the order the prefix rule is defined over them. */
async function projectPrefixRows(
  db: Queryable,
  workspaceId: string,
): Promise<Array<{ project_id: string; foundingName: string; prefix: string | null }>> {
  // `founding_name`, NOT `name`: the key an un-entered prefix derives from is
  // frozen at founding, so a rename (`project.updated`) cannot re-key a project
  // (only an explicit `prefix` does, and then it is the entered column).
  const { rows } = await db.query<{
    project_id: string;
    founding_name: string;
    prefix: string | null;
  }>(
    `SELECT project_id, founding_name, prefix FROM proj_projects
      WHERE workspace_id = $1
      ORDER BY project_id`,
    [workspaceId],
  );
  return rows.map((row) => ({
    project_id: row.project_id,
    foundingName: row.founding_name,
    prefix: row.prefix,
  }));
}

export async function visibleProjects(
  db: Queryable,
  eff: EffectiveRole,
  workspaceId: string,
): Promise<VisibleProject[]> {
  if (eff.workspaceRole === null) return [];
  const { rows } = await db.query<{
    project_id: string;
    name: string;
    founding_name: string;
    archived: boolean;
    description: string | null;
    prefix: string | null;
    group_id: string | null;
    deleted_at: Date | null;
  }>(
    `SELECT project_id, name, founding_name, archived, description, prefix, group_id, deleted_at FROM proj_projects
      WHERE workspace_id = $1
      ORDER BY project_id`,
    [workspaceId],
  );
  // RESOLVED OVER EVERY ROW IN THE WORKSPACE, deleted rows included, before
  // the role filter AND before the deleted-row filter below, deliberately so.
  // A project's prefix is UNIQUE WITHIN ITS WORKSPACE, so a derivation that
  // dropped a deleted row first would let a live sibling's derived prefix
  // SHIFT (`SO2` -> `SO`) the moment its neighbour is trashed, and shift back
  // on undelete — changing every ticket key in it under readers who already
  // quoted one, for an act that named nothing about them. `visibleProjects`'
  // own rule is that the filter decides what is NAMED, never what is TRUE,
  // and this keeps it for the role filter same as it always did; the T10
  // deleted-row filter below is the same discipline, applied after.
  //
  // The order is the query's `ORDER BY project_id`, which is the order
  // `resolveProjectPrefixes` documents as its input contract: a ULID compares
  // by creation, so the answer is a function of the SET and reproduces on
  // replay.
  //
  // **From `founding_name`, while the SERVED `name` stays `row.name`.** A rename
  // moves the name a reader sees and must never move the key: deriving from the
  // current name re-keyed every ticket of a project with no entered prefix, and
  // could shift a neighbour's derived prefix when two bases collide.
  const resolved = resolveProjectPrefixes(
    rows.map((row) => ({ name: row.founding_name, prefix: row.prefix })),
    // The same reserved set `projectPrefixesInWorkspace` loads: a reader that
    // resolved without it would hand a derived project the prefix the door
    // reserved for a project that once held it.
    await reservedPrefixes(db, workspaceId),
  );
  // The workspace predicate is in the SQL and the ROLE decision is not: this
  // function restates nothing about who may see what, it asks `eff` — which is
  // what makes it an application of `resolveEffectiveRole` rather than a second,
  // quieter visibility rule living in a query.
  const visible: VisibleProject[] = [];
  for (const [index, row] of rows.entries()) {
    // T10: a deleted project is absent from the served list — but its row
    // stayed IN the prefix resolution above.
    if (row.deleted_at !== null) continue;
    visible.push({
      projectId: row.project_id,
      name: row.name,
      archived: row.archived,
      // Passed through as the column holds it. `?? ''` here would be the same
      // mistake the projection refuses one layer down, one layer closer to the
      // render.
      description: row.description,
      prefix: resolved[index]!,
      groupId: row.group_id,
    });
  }
  if (eff.workspaceRole === 'owner') return visible;
  return visible.filter((project) => eff.projects.has(project.projectId));
}
