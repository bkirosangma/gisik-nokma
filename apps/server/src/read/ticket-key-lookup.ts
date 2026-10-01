import { parseTicketKey } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { workspaceIdentityFromLedger } from '../workspaces/workspace-name.js';
import { ticketIdsAtNumber } from './ticket-numbers.js';
import { projectPrefixHistory } from './visible-projects.js';

/**
 * The tickets a piece of search text NAMES as a key, or `[]` when it is not key-shaped or names none
 * (prefixes and groups plan Task 4, FD1 — nothing turned a key back into a ticket before this).
 *
 * A key is `<workspace prefix><project prefix>-<number>`, and the letters carry no marker between
 * the two halves, so the split is tried against what the workspace actually HAS: the workspace's
 * current and former prefixes × each project's current and former prefixes (Task 2's history). A
 * key a ticket wore before a prefix change therefore still finds it (R1), and R2 — project
 * prefixes unique within a workspace, former ones reserved — leaves at most one project per split.
 *
 * ROLE-FREE on purpose, like the two readers it composes: this says which tickets the TEXT names,
 * never which the caller may see. The caller feeds the ids into the SAME visibility predicate the
 * text search uses, so there is one visibility rule in `readSearch` and not two.
 */
export async function ticketIdsForKey(db: Queryable, workspaceId: string, text: string): Promise<string[]> {
  const key = parseTicketKey(text);
  if (key === null) {
    return [];
  }
  const [identity, history] = await Promise.all([
    workspaceIdentityFromLedger(db, workspaceId),
    projectPrefixHistory(db, workspaceId),
  ]);
  if (identity.prefix === null) {
    return [];
  }
  const workspacePrefixes = [identity.prefix, ...identity.formerPrefixes.map((former) => former.prefix)];
  const projectIds: string[] = [];
  for (const workspacePrefix of workspacePrefixes) {
    if (!key.letters.startsWith(workspacePrefix)) {
      continue;
    }
    const rest = key.letters.slice(workspacePrefix.length);
    for (const [projectId, prefixes] of history) {
      const held = prefixes.current === rest || prefixes.former.some((former) => former.prefix === rest);
      if (held && !projectIds.includes(projectId)) {
        projectIds.push(projectId);
      }
    }
  }
  return ticketIdsAtNumber(db, workspaceId, projectIds, key.number);
}
