import { BUILTIN_TICKET_TYPE_SEEDS } from '@gisik-nokma/domain';

/** How far up a parent chain an ancestry walk will climb before giving up. */
export const MAX_ANCESTRY_DEPTH = 32;

/**
 * The epic rank, READ FROM THE BUILT-IN SEED and never written as a literal `1`.
 *
 * Grouping by epic resolves the nearest ancestor-or-self whose TYPE carries this
 * rank, so a workspace that renamed its top rung — "Initiative", "Campaign" —
 * gets its own headings without asking anybody's permission (owner sign-off
 * 2026-08-20). The rank is the concept; `'epic'` is one id of it, and the
 * planted-defect case in `test/routes/list.test.ts` fails on a route that
 * matched the id.
 *
 * Looked up rather than indexed, and it THROWS rather than falling back: a
 * missing epic seed means the built-in ladder changed shape underneath this
 * module, and silently grouping everything into `no-epic` would be that change
 * arriving as a UI that lost its headings instead of as an error.
 *
 * A rank no seed carries cannot mean "no epic here": the walk would then group
 * every card under one heading, silently, which is the change arriving as a UI
 * that lost its headings rather than as an error. So this THROWS.
 *
 * ## Why this is a MODULE and no longer a local in `routes/list.ts`
 *
 * Two readers need the same number and they must not each spell it. The list
 * route groups a PAGE by it (`epicAncestors`, one recursive CTE), and the ticket
 * detail route walks a SINGLE ticket's ancestry with `canSee` per hop — a
 * different shape for a different question, reading the same rung. A second
 * `epicRank()` beside the first is the drift this repo names everywhere: two
 * expressions of one rule, free to disagree about which rung is the top one.
 */
export const EPIC_RANK: number = epicRank();

function epicRank(): number {
  const seed = BUILTIN_TICKET_TYPE_SEEDS.find((candidate) => candidate.id === 'epic');
  if (seed === undefined) {
    throw new Error(
      "BUILTIN_TICKET_TYPE_SEEDS carries no 'epic' seed, so there is no epic rank to resolve an ancestry by",
    );
  }
  return seed.rank;
}
