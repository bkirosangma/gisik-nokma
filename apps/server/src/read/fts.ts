/**
 * The text-search configuration, named ONCE for every query that asks Postgres a
 * full-text question.
 *
 * ## Why it is `simple`
 *
 * The reason is the migration's and is not restated here: this product's
 * audience writes in more than one language, and an English stemmer applied to
 * Garo, Hindi or Bengali text does not merely fail to help — it conflates words
 * that share an English-looking suffix. The cost is honest and accepted:
 * `return` does not match `returns`. See
 * `migrations/1788278094725_proj-search.sql`, which owns that argument.
 *
 * ## Why it is a constant
 *
 * The configuration is a MATCHING RULE, and a matching rule has to be the same
 * on both sides or it is not a rule at all: `to_tsvector` decides what lexemes
 * are stored, `websearch_to_tsquery` decides what lexemes are looked for, and
 * two sides that disagree produce a search that quietly finds nothing rather
 * than an error anybody notices. Before this file there were three unlinked
 * places spelling `'simple'` and Task 10 was about to add a fourth (the search
 * route's query, its `ts_headline`, and its `ts_rank_cd` share one). The plan's
 * own migration note asks for exactly this: "the day it is revisited, the query
 * side names the same configuration and both must move together."
 *
 * ## What this constant does NOT reach, stated rather than implied
 *
 * The migration's GENERATED column is SQL that runs before any TypeScript
 * exists, so it cannot import this and still spells `'simple'` itself. That
 * fourth site is therefore linked by BEHAVIOUR rather than by the compiler, and
 * the link is executable in two places: `test/projections/search.test.ts` asserts
 * the stored vector is unstemmed, and `test/routes/search.test.ts` case 7.95
 * sends `licence` and `licences` through the live route with a positive control
 * beside the negative. That pair is what makes the agreement checkable — under
 * an `english` index AND query the negative reddens, under a mixed pair the
 * positive control reddens, and only two `simple` sides pass both.
 *
 * It is interpolated into SQL text rather than bound as a parameter, and that is
 * required rather than lax: a text-search configuration is an identifier
 * position, not a value position, and no actor input reaches it. It is a module
 * constant of this repository's own choosing — Task 2's allowlist of
 * actor-varying identifiers is the empty set and nothing here widens it.
 */
export const FTS_CONFIG = 'simple';
