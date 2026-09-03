import { DEEPEST_RANK, type TicketTypeDef } from '@gisik-nokma/domain';

export type RankImplications = { parents: TicketTypeDef[]; mustHaveParent: boolean };

/**
 * A child's type must rank strictly below its parent's (Plan 3). Requires-parent
 * follows the RANK, not the built-in id (owner decision 2026-08-20): a type at
 * DEEPEST_RANK or below it always needs a parent — the built-in sub-task, an
 * Invoice this workspace invented beside it, and anything deeper still.
 *
 * `>=` rather than `===`: a type deeper than sub-task is smaller work again, so
 * exempting it would invert the rule's own justification and leave an escape
 * hatch at rank 5.
 *
 * DEEPEST_RANK is imported from domain — the same constant Plan 3's engine
 * refuses on, declared once at packages/domain/src/ticket-types.ts with the
 * matching `rank >= DEEPEST_RANK` wording — and is deliberately NOT a maximum
 * computed over `allTypes`. In a workspace that has defined nothing below Task,
 * a locally computed max would make this screen promise that Task needs a
 * parent while the server accepted one at project root: the builder would be
 * describing a rule that does not exist (design decision 4). The shallow
 * workspace is covered by a standing test rather than left to the comment.
 */
export function rankImplications(
  typeId: string,
  rank: number,
  allTypes: readonly TicketTypeDef[],
): RankImplications {
  const parents = allTypes
    .filter((candidate) => candidate.rank < rank && candidate.id !== typeId)
    .sort((a, b) => a.rank - b.rank);
  return { parents, mustHaveParent: rank >= DEEPEST_RANK };
}

export function rankImplicationsCopy(implications: RankImplications): string {
  const names = implications.parents.map((parent) => parent.name).join(', ');
  if (implications.mustHaveParent) {
    return `Must sit under a parent — this is the smallest kind of work, so tickets of this type always belong to something bigger. Can sit under: ${names}.`;
  }
  if (implications.parents.length === 0) return 'Top of the hierarchy — sits at the project root.';
  return `Can sit under: ${names} · or at the project root.`;
}
