import type { EnvelopeSeed } from '@gisik-nokma/app-core';
import { rankBetween, type GroupRow } from '@gisik-nokma/domain';

/**
 * What a project form's group field says it wants: an EXISTING group (the deepest
 * one picked) and, under it, the names of groups that do not exist yet, top-down.
 * The picker produces it; `groupSeeds` turns it into events.
 */
export type GroupChoice = { groupId: string | null; pendingNames: string[] };

/** The deepest a group may sit (`GROUP_MAX_LEVEL` in the domain's group events). */
const MAX_LEVEL = 4;

/**
 * The `group.created` events a choice needs, and the group id the project then
 * files under (prefixes and groups plan Task 9, FD3).
 *
 * - **One event per pending name**, parent = the previous one (the first hangs
 *   from the deepest existing pick, or the root), level = its parent's + 1.
 * - **Rank** — the first new group goes AFTER the parent's last existing child
 *   (a group made here lands at the end of its siblings, where the Groups page
 *   would put it too); every later one is an only child, so the midpoint.
 * - **The returned id is the deepest** — the new leaf when there is one, else the
 *   existing pick, else `null` (a project with no group).
 *
 * Pure, with the id source injected, so a test reads the SHAPE without a clock or
 * a random. The events are meant to be submitted in ONE batch ahead of the
 * project's own claim, so the whole thing lands or none of it does.
 */
export function groupSeeds(
  workspaceId: string,
  groups: GroupRow[],
  choice: GroupChoice,
  newId: () => string,
): { seeds: EnvelopeSeed[]; groupId: string | null } {
  const parentRow = choice.groupId === null ? undefined : groups.find((row) => row.id === choice.groupId);
  if (choice.groupId !== null && parentRow === undefined) {
    throw new Error(`groupSeeds: no group ${choice.groupId} in the list it was given`);
  }
  let parentId: string | null = choice.groupId;
  let level = (parentRow?.level ?? 0) + 1;
  if (level + choice.pendingNames.length - 1 > MAX_LEVEL) {
    throw new Error(`groupSeeds: ${choice.pendingNames.length} new groups under level ${level - 1} pass level ${MAX_LEVEL}`);
  }
  const lastSiblingRank = groups
    .filter((row) => row.parentId === parentId)
    .reduce<string | null>((max, row) => (max === null || row.rank > max ? row.rank : max), null);

  const seeds: EnvelopeSeed[] = [];
  choice.pendingNames.forEach((name, index) => {
    const id = newId();
    seeds.push({
      workspaceId,
      entity: { kind: 'group', id },
      type: 'group.created',
      payload: { parentId, level, name: name.trim(), rank: rankBetween(index === 0 ? lastSiblingRank : null, null) },
    });
    parentId = id;
    level += 1;
  });
  return { seeds, groupId: parentId };
}
