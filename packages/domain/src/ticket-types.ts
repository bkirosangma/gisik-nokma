import { z } from 'zod';
import { IST_DAY_REGEX } from './ist-day.js';

export const CUSTOM_FIELD_KINDS = ['text', 'number', 'date', 'select', 'person'] as const;
export type CustomFieldKind = (typeof CUSTOM_FIELD_KINDS)[number];

export const BUILTIN_FIELD_IDS = ['title', 'description', 'dueDate', 'startDate'] as const;
export type BuiltinFieldId = (typeof BUILTIN_FIELD_IDS)[number];

export const customFieldDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(CUSTOM_FIELD_KINDS),
    options: z.array(z.string().min(1)).min(1).optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type === 'select' && field.options === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a select field needs options' });
    }
    if (field.type !== 'select' && field.options !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'only select fields take options' });
    }
  });
export type CustomFieldDef = z.infer<typeof customFieldDefSchema>;

export const ticketTypeDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    icon: z.string().min(1),
    rank: z.number().int().min(1),
    workflowId: z.string().min(1),
    fields: z.array(customFieldDefSchema),
  })
  .superRefine((type, ctx) => {
    const seen = new Set<string>();
    for (const field of type.fields) {
      if (seen.has(field.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate field id "${field.id}"` });
      }
      seen.add(field.id);
      if ((BUILTIN_FIELD_IDS as readonly string[]).includes(field.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `field id "${field.id}" shadows a built-in field`,
        });
      }
    }
  });
export type TicketTypeDef = z.infer<typeof ticketTypeDefSchema>;

export const SUB_TASK_TYPE_ID = 'sub-task';

/**
 * The floor of the hierarchy — the built-in sub-task's rank. A ticket whose
 * TYPE sits at this rank OR BELOW it (`rank >= DEEPEST_RANK`) requires a parent
 * (owner decision 2026-08-20): the requirement follows the rank, so a custom
 * type defined at rank 4 carries it exactly as `sub-task` does, and one defined
 * at rank 7 — smaller work still — carries it a fortiori.
 *
 * Deliberately a constant and NOT a maximum computed over the workspace's
 * defined types: a computed max would silently change the rule's meaning the
 * moment an admin defined a deeper type — a workspace that had defined nothing
 * below Task would suddenly find its tasks unable to sit at project root — and
 * a refusal that shifts underfoot is exactly what this product refuses to ship.
 * A fixed floor plus `>=` gives both properties at once: the meaning never
 * moves, and nothing slips underneath it.
 */
export const DEEPEST_RANK = 4;

export const BUILTIN_TICKET_TYPE_SEEDS = [
  { id: 'epic', name: 'Epic', icon: 'flag', rank: 1 },
  { id: 'story', name: 'Story', icon: 'book', rank: 2 },
  { id: 'task', name: 'Task', icon: 'check', rank: 3 },
  { id: SUB_TASK_TYPE_ID, name: 'Sub-task', icon: 'list', rank: 4 },
] as const;

/**
 * Built-ins are seed data: each workspace materialises them as ordinary
 * `ticket-type.defined` events at creation time (Plan 4 founds the workspace),
 * bound to that workspace's default workflow. Type resolution is uniform —
 * every lookup reads event-defined types, and nothing special-cases a built-in.
 */
export function builtinTicketTypeDefs(defaultWorkflowId: string): TicketTypeDef[] {
  return BUILTIN_TICKET_TYPE_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    icon: seed.icon,
    rank: seed.rank,
    workflowId: defaultWorkflowId,
    fields: [],
  }));
}

/**
 * A day claim: { date, note? }, rendered with its author. Both day-shaped
 * built-ins use it — `dueDate` and `startDate` have identical value shapes, so
 * they share one schema rather than growing a second copy to drift from.
 *
 * The day is an INDIAN day (owner decision 2026-08-20, "time is Asia/Kolkata").
 * This plan stores and validates the claim and nothing else — but every
 * consumer that asks "is this overdue?", "is this due today?", "which calendar
 * cell is it?" or "how many days has this been in flight?" answers it with
 * `istDayOf`/`istDayBounds` from `@gisik-nokma/domain`, never with `new Date()`
 * locale math, never with the viewer's device, and never by dividing a
 * millisecond difference by 86_400_000. The day shape has ONE origin —
 * `IST_DAY_REGEX` in the same package's dependency-free `ist-day.ts` — and this
 * schema imports it rather than restating it, because a due date IS an IST day
 * and two statements of one shape are two chances to disagree about what a day
 * claim looks like.
 */
export const dueDateValueSchema = z.object({
  date: z.string().regex(IST_DAY_REGEX, 'a due date is a day in YYYY-MM-DD form'),
  note: z.string().optional(),
});
export type DueDateValue = z.infer<typeof dueDateValueSchema>;
