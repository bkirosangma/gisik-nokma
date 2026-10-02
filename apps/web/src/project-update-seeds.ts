import type { EnvelopeSeed } from '@gisik-nokma/app-core';
import type { GroupRow } from '@gisik-nokma/domain';
import { groupSeeds } from './group-picker-seeds.js';
import type { ProjectEditValues } from './project-edit-form.js';

/**
 * The claims an Edit form makes about a project (MCP CRUD plan Task 2; prefixes and groups plan Task
 * 10): the `group.created` events its group choice needs, FIRST, then ONE `project.updated` carrying
 * ONLY the keys that changed, or none at all.
 *
 * - **Only the changed keys**, because an absent key is "leave it alone" in the projection
 *   (`proj-projects.ts`) while a present one is a claim — sending the unchanged name along would make a
 *   description edit also a rename in the ledger's history.
 * - **An emptied description is `null`**, the one value the payload schema reserves for "clear it"
 *   (`projectUpdatedPayload`); `''` is refused there as blank. Whitespace is trimmed here for that
 *   reason: it is the form repairing its own input, not the ledger's claim.
 * - **`prefix` is upper-cased here too** (`prefixSchema` refuses a lower-case one rather than fixing it,
 *   so the form repairs its own input), and sent only when it differs from the project's own.
 * - **`groupId` is the deepest group of the choice**: an existing one, a group made by the
 *   `group.created` events that precede it, or `null` to take the project out of its group.
 * - **Group events first, in one batch, in order.** The batch is NOT atomic (FD3): each event commits or
 *   is refused on its own, so a refused `group.created` (`group.name-taken`) leaves the project event
 *   refused behind it and the form re-reads (22.187).
 * - **Nothing changed → `[]`**, so the caller can close the form without a round trip that would only
 *   add an empty-looking entry to the ledger.
 *
 * Pure, with the id source injected, and exported (re-exported from the workspace home page beside
 * `archiveSeeds`), so a test reads the SHAPE without mounting anything.
 */
export function updateSeeds(
  workspaceId: string,
  projectId: string,
  before: { name: string; description: string | null; prefix: string; groupId: string | null },
  after: ProjectEditValues,
  groups: GroupRow[],
  newId: () => string,
): EnvelopeSeed[] {
  const name = after.name.trim();
  const description = after.description.trim();
  const prefix = after.prefix.trim().toUpperCase();
  const payload: { name?: string; description?: string | null; prefix?: string; groupId?: string | null } = {};
  if (name !== before.name) payload.name = name;
  const nextDescription = description === '' ? null : description;
  if (nextDescription !== before.description) payload.description = nextDescription;
  if (prefix !== before.prefix) payload.prefix = prefix;

  let created: EnvelopeSeed[] = [];
  if (after.group.pendingNames.length > 0 || after.group.groupId !== before.groupId) {
    const chosen = groupSeeds(workspaceId, groups, after.group, newId);
    created = chosen.seeds;
    if (chosen.groupId !== before.groupId) payload.groupId = chosen.groupId;
  }
  if (Object.keys(payload).length === 0) return [];
  return [
    ...created,
    { workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.updated', payload },
  ];
}
