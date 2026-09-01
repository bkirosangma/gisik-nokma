import { z } from 'zod';
import { stateCategorySchema } from './workflow.js';

export const GROUPINGS = ['epic', 'status', 'assignee', 'type', 'flat'] as const;
export const groupingSchema = z.enum(GROUPINGS);
export type Grouping = z.infer<typeof groupingSchema>;

/**
 * A calendar day, the only shape a day claim takes in this product
 * (`dueDateValueSchema`'s `date`). Anchored at both ends: an unanchored
 * pattern would accept `'nonsense 2026-08-31 nonsense'`, and the string
 * reaching SQL as a bound parameter is compared against a stored `date`
 * text — a value that is not a day would compare as a plain string and
 * silently mean something nobody asked for.
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const filterFieldClauseSchema = z
  .object({
    fieldId: z.string().min(1).max(200),
    op: z.enum(['eq', 'contains']),
    value: z.string().max(500),
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
 */
export const filterSpecSchema = z
  .object({
    assigneeId: z.string().min(1).max(200).optional(),
    collaboratorId: z.string().min(1).max(200).optional(),
    typeId: z.string().min(1).max(200).optional(),
    stateId: z.string().min(1).max(200).optional(),
    stateCategory: stateCategorySchema.optional(),
    blocked: z.boolean().optional(),
    text: z.string().min(1).max(500).optional(),
    due: z
      .object({
        before: z.string().regex(ISO_DAY).optional(),
        after: z.string().regex(ISO_DAY).optional(),
      })
      .strict()
      .optional(),
    fields: z.array(filterFieldClauseSchema).max(10).optional(),
  })
  .strict();
export type FilterSpec = z.infer<typeof filterSpecSchema>;
