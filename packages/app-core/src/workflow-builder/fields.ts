import type { TicketTypeDef } from '@gisik-nokma/domain';

export type FieldChoice = { id: string; name: string; source: string };

/** Display names for Plan 3's BUILTIN_FIELD_IDS — every ticket carries these. */
export const BUILTIN_FIELD_CHOICES: readonly FieldChoice[] = [
  { id: 'title', name: 'Title', source: 'Built-in' },
  { id: 'description', name: 'Description', source: 'Built-in' },
  { id: 'dueDate', name: 'Due date', source: 'Built-in' },
  { id: 'startDate', name: 'Start date', source: 'Built-in' },
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
