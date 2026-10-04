import { z } from 'zod';

/** A link label: a branch name such as "Yes" (workflow-timeline-graphs LK-2). 1..60 characters. */
export const LINK_LABEL_MAX = 60;

/**
 * Built like `displayName` (`display-name.ts`): it REFUSES a blank label and stores padding verbatim, because the
 * ledger keeps the claim as it was made. Comparisons go through `normaliseLinkLabel`, never through the stored text.
 * The `value.length === 0 ||` guard keeps an empty label to ONE issue, as `displayName`'s does.
 */
export const linkLabelSchema = z
  .string()
  .min(1)
  .max(LINK_LABEL_MAX)
  .refine((value) => value.length === 0 || value.trim() !== '', 'must not be blank: a label of only spaces names nothing');

/** The one comparison key for labels (LK-3): trim, then fold case. */
export function normaliseLinkLabel(label: string): string {
  return label.trim().toLocaleLowerCase('en');
}
