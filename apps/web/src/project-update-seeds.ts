import type { EnvelopeSeed } from '@gisik-nokma/app-core';

/**
 * The claim an Edit form makes about a project (MCP CRUD plan Task 2): ONE
 * `project.updated` carrying ONLY the keys that changed, or none at all.
 *
 * - **Only the changed keys**, because an absent key is "leave it alone" in the
 *   projection (`proj-projects.ts`) while a present one is a claim — sending
 *   the unchanged name along would make a description edit also a rename in the
 *   ledger's history.
 * - **An emptied description is `null`**, the one value the payload schema
 *   reserves for "clear it" (`projectUpdatedPayload`); `''` is refused there as
 *   blank. Whitespace is trimmed here for that reason: it is the form repairing
 *   its own input, not the ledger's claim.
 * - **Nothing changed → `[]`**, so the caller can close the form without a
 *   round trip that would only add an empty-looking entry to the ledger.
 *
 * The prefix is not a parameter and never will be: it is immutable after
 * creation, and the schema refuses the key.
 *
 * Pure, and exported (re-exported from the workspace home page beside
 * `archiveSeeds`), so a test reads the SHAPE without mounting anything.
 */
export function updateSeeds(
  workspaceId: string,
  projectId: string,
  before: { name: string; description: string | null },
  after: { name: string; description: string },
): EnvelopeSeed[] {
  const name = after.name.trim();
  const description = after.description.trim();
  const payload: { name?: string; description?: string | null } = {};
  if (name !== before.name) payload.name = name;
  const nextDescription = description === '' ? null : description;
  if (nextDescription !== before.description) payload.description = nextDescription;
  if (Object.keys(payload).length === 0) return [];
  return [{ workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.updated', payload }];
}
