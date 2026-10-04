import { z } from 'zod';
import { displayName } from './display-name.js';
import { IST_DAY_REGEX, isRealIstDay } from './ist-day.js';

export const CUSTOM_FIELD_KINDS = ['text', 'number', 'date', 'select', 'person'] as const;
export type CustomFieldKind = (typeof CUSTOM_FIELD_KINDS)[number];

export const BUILTIN_FIELD_IDS = ['title', 'description', 'dueDate', 'startDate', 'priority', 'estimate', 'waitForAll', 'reworkEstimate'] as const;
export type BuiltinFieldId = (typeof BUILTIN_FIELD_IDS)[number];

/**
 * `required` — the author's declaration that this type expects a value for this
 * field (owner ruling 2026-09-18, decision-list item 1: *"1 - yes"*, after the
 * prototype delta recorded the toggle as a schema gap rather than a design one).
 *
 * ## OPTIONAL, not defaulted, and that is not the same choice as it looks
 *
 * `z.boolean().optional()` follows the member directly above it: a `text` field
 * has no `options` key either, and `FieldsEditor` mints one as
 * `{id, name, type}` (`fields-editor.tsx:165`). A field definition says what it
 * has to say and nothing more.
 *
 * The alternative — `z.boolean().default(false)` — was rejected for the reason
 * this plan has now paid for twice. A default is applied AT PARSE, so every
 * `ticket-type.defined` ever recorded would come back saying `required: false`
 * — a claim its author never made. That is the identical defect class as the
 * `p.value ?? null` that folded an absent value into "a clearing nobody made"
 * (`rule-engine/src/checks/fields.ts:77-83`, corrected in this plan), and the
 * projection would then carry the invented claim forward as fact. Absence means
 * *the definition never said*; `false` means *the definition said optional*.
 * They are different states and the schema keeps them different.
 *
 * As a consequence this member needs NO MIGRATION. `ticketTypeDefSchema.parse`
 * is called on read by the projection, the offline replica and the engine's
 * memory context alike (`apps/server/src/projections/ticket-types.ts:56`,
 * `sync-client/src/replica/replica.ts:295`,
 * `rule-engine/src/memory-context.ts:136`); an optional member leaves every
 * stored event parsing exactly as it did before, and the projector's
 * `JSON.stringify(def.fields)` (`:79`) carries the key through verbatim once it
 * survives the parse.
 *
 * **THE FIRST PARSE SITE IS THE INGEST DOOR, AND IT IS THE ONE THAT MATTERS
 * MOST.** Those three are reads; `parseEvent` runs at submission and stores the
 * schema's OUTPUT — `payload.data`, not the raw payload — into the ledger
 * (`packages/domain/src/parse-event.ts`, bound by `vocabulary.ts:100`). So
 * without this member the flag would be stripped *before it was ever recorded*,
 * and every later reader would be looking at an event that never carried it.
 * An independent reviewer raised this on 2026-09-18 and was right: the three
 * read sites were the wrong list to lead with. The conclusion is unchanged and
 * stronger — a member this schema does not declare cannot reach the ledger at
 * all, which is what makes the declaration load-bearing rather than cosmetic.
 *
 * ## NOTHING ENFORCES IT. That is a recorded absence, not an oversight.
 *
 * Measured 2026-09-18 at `d069fd94`, before the toggle was designed: no code
 * path reads a type-level requirement, because none existed to read. The
 * product's only `require-field` is EDGE-SCOPED — a workflow rule evaluated
 * when a ticket crosses one transition (`rule-engine/src/rules/require-field.ts:5`,
 * surfaced by `app-core/src/views/transition-dialog.tsx:216,220`) — which is a
 * different question ("may this move happen?") from this one ("does this type
 * expect a value?"). `checkTicketFieldSet` refuses a field that does not exist
 * on the type and a value that does not fit its kind, and accepts a clear of any
 * custom field unconditionally (`rule-engine/src/checks/fields.ts:148-155`).
 * `ticket.created` reads no fields at all.
 *
 * Enforcement is therefore a capability, not a wiring job, and it is NOT this
 * change's. Building it honestly would need the engine to answer "what did this
 * type require when this ticket was created?" — and it cannot: the type
 * projection is last-definition-wins BY DESIGN and keeps no superseded row
 * (`apps/server/src/projections/ticket-types.ts:39-46`, which states that
 * omission as deliberate). An admin toggling a field to Required would place
 * every existing ticket of that type out of compliance, and no claim already
 * recorded can be retroactively refused. Named absence, owner: the plan that
 * takes up type-level field enforcement.
 */
export const customFieldDefSchema = z
  .object({
    id: z.string().min(1),
    // The field's name and each select option are labels someone reads: P15's
    // refinement, from the one module (E6-20). A `" "` option is a choice
    // with no label.
    name: displayName,
    type: z.enum(CUSTOM_FIELD_KINDS),
    options: z.array(displayName).min(1).optional(),
    required: z.boolean().optional(),
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
    name: displayName,
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
  // Shape from the one origin, then existence from the one definition of a
  // real day (E6-19): `2026-02-30` is the right shape and no day at all.
  date: z
    .string()
    .regex(IST_DAY_REGEX, 'a due date is a day in YYYY-MM-DD form')
    .refine(isRealIstDay, 'a due date is a day the calendar has'),
  note: z.string().optional(),
});
export type DueDateValue = z.infer<typeof dueDateValueSchema>;

/**
 * Priority is a BUILT-IN with three properties the other built-ins do not
 * share (owner ruling 2026-09-22, spec `docs/superpowers/specs/2026-09-22-priority-builtin-design.md`):
 * it is ALWAYS present (no never-claimed state, no clearing), it STARTS AT P2
 * (the reducer writes the claim on `ticket.created`, attributed to the creator),
 * and its value set is CLOSED. This is the ONE origin of the three spellings —
 * the engine, the filter spec, the sheet's control and the new-ticket dialog all
 * import from here and none restates the list.
 */
export const PRIORITIES = ['P1', 'P2', 'P3'] as const;
export const prioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof prioritySchema>;
/** Where every ticket starts (owner: "everything starts at p2 the middle"). Applied by the REDUCER, never at parse. */
export const DEFAULT_PRIORITY: Priority = 'P2';

/** Estimate and rework estimate: whole calendar days, 1 to 365 (spec ES-1, decision 2). `null` clears; that is the engine's branch. */
export const estimateValueSchema = z.number().int().min(1).max(365);
/** Wait for all incoming: `true`, cleared with `null` at the engine; absent means off. `false` is not a value, so "on" and "never said" are the only readings. */
export const waitForAllValueSchema = z.literal(true);

type ClaimBag = Readonly<Record<string, { readonly value: unknown } | undefined>>;
/** Total: a stored claim that fails the schema reads as no estimate. T10/T11 read estimates through these, never `fields.x.value` directly. */
export function claimedEstimate(fields: ClaimBag, id: 'estimate' | 'reworkEstimate'): number | null {
  const parsed = estimateValueSchema.safeParse(fields[id]?.value);
  return parsed.success ? parsed.data : null;
}
export function claimedWaitForAll(fields: ClaimBag): boolean {
  return waitForAllValueSchema.safeParse(fields['waitForAll']?.value).success;
}
