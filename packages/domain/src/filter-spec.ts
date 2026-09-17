import { z } from 'zod';
import { IST_DAY_REGEX } from './ist-day.js';
import { stateCategorySchema } from './workflow.js';

export const GROUPINGS = ['epic', 'status', 'assignee', 'type', 'flat'] as const;
export const groupingSchema = z.enum(GROUPINGS);
export type Grouping = z.infer<typeof groupingSchema>;

/**
 * The one byte this schema refuses on sight, rather than on shape or on length.
 *
 * Every string slot below ends up bound into a query, and Postgres `text`
 * cannot hold U+0000: the driver raises `invalid byte sequence for encoding
 * "UTF8": 0x00` (SQLSTATE 22021) before the statement runs. A door that admits
 * it has not been generous — it has moved the refusal from a 400 the caller can
 * read to a 500 nobody asked for, reached through a value that parsed, compiled
 * and bound correctly the whole way.
 *
 * NUL ALONE, not a wider control-character class. Measured against this
 * product's own Postgres, through both `text` and `websearch_to_tsquery`: BEL,
 * TAB, LF, ESC, DEL and even a lone surrogate all round-trip without error, and
 * only 0x00 raises. Refusing the rest would refuse values the store can carry —
 * a pasted multi-line search term is the obvious one — which is the door
 * inventing a policy nothing downstream needs. The rule enforced here is
 * exactly "what the store can hold", and it stays that narrow on purpose: a
 * guard wider than its reason is a guard whose reason cannot be checked.
 *
 * It REFUSES, it does not strip. Stripping would hand the compiler a value the
 * actor never sent, and the bounds below are refusals at the door precisely so
 * that nothing here rewrites anything.
 *
 * Here and nowhere else. The compiler binds; it does not inspect bytes. A
 * second NUL check beside `params.add()` would be the "second, weaker line of
 * defence pretending to be the first" the note below warns against.
 */
const NUL = '\u0000';
const hasNoNul = (value: string): boolean => !value.includes(NUL);
const NO_NUL = 'must not contain U+0000 — Postgres text cannot carry a NUL byte';
/**
 * EXPORTED so `preferences.ts` can apply the same refusal to the two string
 * slots the schemas in this file do not reach (a saved filter's `id` and
 * `name`, and a stored column id), rather than spelling the rule a second time.
 *
 * The reason transfers exactly, and it was re-measured for the second store
 * before this was exported: a preferences document lands in a `jsonb` column,
 * and `SELECT $1::jsonb` raises SQLSTATE 22P05 ("unsupported Unicode escape
 * sequence") for U+0000 in a KEY or a VALUE, while BEL and LF round-trip. Same
 * byte, same store, same "what the store can hold" bound — so one statement of
 * it, imported, rather than two free to drift.
 */
export const noNul = (schema: z.ZodString) => schema.refine(hasNoNul, NO_NUL);

/**
 * What a FULL-TEXT SEARCH TERM is, stated once.
 *
 * There are two doors into the same `websearch_to_tsquery` call: a `FilterSpec`'s
 * own `text` key, compiled by `compile-filter.ts`, and `GET /v1/search`'s `q`,
 * which the search route declares to be THE text term (a filter carrying its own
 * `text` beside `q` is refused outright, `invalid_filter` — one text source, no
 * ambiguity). Two doors with two separately-written bounds would be two answers
 * to "how long may a search term be" and two answers to the NUL question, free
 * to drift the day one of them is widened.
 *
 * The NUL refusal is the load-bearing half and the reason this is a shared
 * schema rather than a shared number. `q` travels as a bound parameter into
 * `websearch_to_tsquery`, so a `q` carrying U+0000 is not a bad search, it is
 * SQLSTATE 22021 raised inside the route — a 500 reached through a value that
 * parsed, bound and compiled correctly the whole way. Refusing it at the door
 * makes it the 400 the caller can read. `test/routes/search.test.ts` sends the
 * byte and asserts the status is 400 and not 500.
 */
export const searchTermSchema = noNul(z.string().min(1).max(500));

/**
 * `value` is the one string slot with NO `.min(1)`, and that is a decision
 * rather than an omission: `{ op: 'eq', value: '' }` is a real claim — "this
 * field's value is the empty string" — so the identifier slots' reasoning ("an
 * empty assignee is not *any* assignee") does not transfer to it.
 *
 * The consequence, declared here rather than left for whoever next reads a
 * query plan to discover: with `op: 'contains'`, `value: ''` compiles to
 * `ILIKE '%%'`, which every non-NULL text matches. That predicate means "this
 * ticket carries this field with a non-null value" — a field-PRESENCE test, not
 * a match on content. It is admitted deliberately, and it is still narrowing
 * like every other clause the compiler emits: a ticket that does not carry the
 * key yields SQL NULL there and does NOT match, so it cannot widen a read.
 */
export const filterFieldClauseSchema = z
  .object({
    fieldId: noNul(z.string().min(1).max(200)),
    op: z.enum(['eq', 'contains']),
    value: noNul(z.string().max(500)),
  })
  .strict();
export type FilterFieldClause = z.infer<typeof filterFieldClauseSchema>;

/**
 * The one composable filter shape every list-like read accepts (board's
 * sibling, list, search, saved filters). Compiled to parameterized SQL by
 * the server (`apps/server/src/read/compile-filter.ts`) — never interpolated.
 *
 * `.strict()` everywhere: an unknown key is a refused claim about what to
 * show, not a silent match-all. A typo'd `asigneeId` that parsed would widen
 * a filtered read to the whole project, which is the failure mode where a
 * viewer sees more than they asked for and believes they asked for it.
 *
 * The bounds (10 field clauses, 500-character strings, 200-character field
 * ids) are refusals at the door, not sanitisation: nothing here rewrites a
 * value. Hostile bytes survive `parse` unchanged and are the compiler's
 * problem, which it solves by binding them as parameters — a schema that
 * stripped quotes would be a second, weaker line of defence pretending to
 * be the first.
 *
 * ONE byte is excepted, and it is not an exception to that rule but an
 * application of it: `NUL` above is refused because the STORE cannot hold it,
 * so admitting it would not be tolerance of hostile input, it would be a
 * guaranteed 500. It is still a refusal and still not a rewrite.
 */
export const filterSpecSchema = z
  .object({
    assigneeId: noNul(z.string().min(1).max(200)).optional(),
    collaboratorId: noNul(z.string().min(1).max(200)).optional(),
    typeId: noNul(z.string().min(1).max(200)).optional(),
    stateId: noNul(z.string().min(1).max(200)).optional(),
    stateCategory: stateCategorySchema.optional(),
    blocked: z.boolean().optional(),
    /**
     * The closed flag (backlog/closed spec §3.2, 2026-09-17): `true` = closed
     * only, `false` = not closed, absent = all. A single value, so the
     * client's `toServerFilterSpec` can send it as is — unlike `stateCategory`
     * or `stateId`, there is no list of closed-ness to choose among, only the
     * one boolean the compiler turns into `t.closed_at IS [NOT] NULL`
     * (`apps/server/src/read/compile-filter.ts`).
     */
    closed: z.boolean().optional(),
    text: searchTermSchema.optional(),
    /**
     * A due bound is a day claim in the shape the STORED claim carries, and the
     * pattern is imported rather than restated: `IST_DAY_REGEX` in this
     * package's `ist-day.ts` is the single origin of the day shape, exactly as
     * `dueDateValueSchema` says when it imports the same constant. A second
     * spelling of the same pattern here would be a second statement of what a
     * day looks like, free to drift from the one it is compared against.
     *
     * It constrains SHAPE, not calendar existence: `9999-99-99` passes, and
     * that is correct rather than an oversight. The compiled clause compares
     * this bound as TEXT against `t.fields -> 'dueDate' -> 'value' ->> 'date'`,
     * and what makes a text `<=` mean a chronological `<=` is fixed-width
     * zero-padding — precisely what this pattern constrains, and all it needs
     * to. Demanding a real calendar day here would also make the FILTER
     * stricter than the STORAGE schema that admits the values being compared,
     * i.e. a bound the store would hold but the door would refuse to name.
     * Anchored at both ends because an unanchored pattern would accept
     * `'nonsense 2026-08-31 nonsense'`, which is not a day at all and would
     * compare as a plain string meaning something nobody asked for. The `\d`
     * classes also make these two slots NUL-proof without the guard above.
     */
    due: z
      .object({
        before: z.string().regex(IST_DAY_REGEX).optional(),
        after: z.string().regex(IST_DAY_REGEX).optional(),
      })
      .strict()
      .optional(),
    fields: z.array(filterFieldClauseSchema).max(10).optional(),
  })
  .strict();
export type FilterSpec = z.infer<typeof filterSpecSchema>;
