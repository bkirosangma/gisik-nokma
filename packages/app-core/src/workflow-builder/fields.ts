import type { TicketTypeDef } from '@gisik-nokma/domain';

export type FieldChoice = { id: string; name: string; source: string };

/**
 * Display names for the BUILT-IN FIELDS a `require-field` rule may sensibly
 * demand — and, since spec 2026-09-22, **deliberately NOT `BUILTIN_FIELD_IDS`**.
 *
 * ⚠ **This docblock read *"Display names for Plan 3's `BUILTIN_FIELD_IDS` —
 * every ticket carries these"* until 2026-09-22, and it stopped being true the
 * moment `priority` became the fifth built-in.** The two lists still coincided
 * by accident, because nothing came back to this file; they are now different
 * on purpose, and the reason is the point of this comment:
 *
 * - **`priority` is EXCLUDED because a `require-field` rule on it could never
 *   refuse anything.** `evaluateRequireField` (`packages/rule-engine/src/rules/
 *   require-field.ts`) refuses only when the ticket's value is absent, null or
 *   blank — and `applyTicketEvent` writes a non-blank level on every
 *   `ticket.created`, so `fields['priority'].value` is ALWAYS set. Offering it
 *   in this picker would let an author write a rule that looks like a gate and
 *   silently gates nothing, which is the failure mode `adviseWorkflowDef`
 *   exists to warn about. **An option that can only produce a dead rule is
 *   worse than an absent one.**
 * - **`waitForAll` is EXCLUDED** (wtg2 T4, spec ES-2): it is optional, but a
 *   gate on `true` is meaningless as a require-field (a rule on a switch would
 *   force every move to turn it on).
 * - **The six that remain can all be genuinely unset**, so a rule on any of
 *   them can actually refuse: a title can be blank, a description absent,
 *   either date claim can be cleared, and so can either estimate.
 *
 * `test/workflow-builder/summaries.test.ts` pins the difference as a SET
 * DIFFERENCE against `BUILTIN_FIELD_IDS` (case `3.972`, which names both
 * exclusions), so a new built-in forces the question and a well-meaning "fix"
 * that puts `priority` or `waitForAll` back reddens rather than shipping.
 */
export const BUILTIN_FIELD_CHOICES: readonly FieldChoice[] = [
  { id: 'title', name: 'Title', source: 'Built-in' },
  { id: 'description', name: 'Description', source: 'Built-in' },
  { id: 'dueDate', name: 'Due date', source: 'Built-in' },
  { id: 'startDate', name: 'Start date', source: 'Built-in' },
  { id: 'estimate', name: 'Estimate', source: 'Built-in' },
  { id: 'reworkEstimate', name: 'Rework estimate', source: 'Built-in' },
];

/**
 * The require-field picker's universe: built-ins plus the union of custom
 * fields on every ticket type bound to this workflow. Picker-only by design —
 * a free-typed field id would author a rule that can never legally fire.
 */
export function fieldChoicesFor(boundTypes: readonly TicketTypeDef[]): FieldChoice[] {
  const choices: FieldChoice[] = BUILTIN_FIELD_CHOICES.map((choice) => ({ ...choice }));
  const seen = new Set(choices.map((choice) => choice.id));
  for (const type of boundTypes) {
    for (const field of type.fields) {
      if (seen.has(field.id)) continue;
      seen.add(field.id);
      choices.push({ id: field.id, name: field.name, source: type.name });
    }
  }
  return choices;
}
