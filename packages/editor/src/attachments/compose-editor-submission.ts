import type { DocJson } from '../doc.js';

/**
 * The two ledger events an editor submit can become. The shapes are Plan 3's,
 * read off `packages/domain/src/events/ticket-events.ts` on the branch rather
 * than off the plan text: `commentAddedPayload` is `{ body: <record> }`
 * (line 99) and `ticketFieldSetPayload` is `{ fieldId, value }` (line 89),
 * where `value` is REQUIRED — an absent `value` used to be folded into a null
 * clearing claim, which is why the door refuses it. Composing the payload here
 * rather than at each call site is what keeps that key from going missing.
 */
export type EditorSubmission =
  | { type: 'comment.added'; payload: { body: DocJson } }
  | { type: 'ticket.field_set'; payload: { fieldId: 'description'; value: DocJson } };

/**
 * The single place the editor's two composer modes map onto ledger events.
 * A description edit is not a mutation of a field — it is one more
 * `ticket.field_set` claim, so the history of a description is the history of
 * the claims that wrote it.
 *
 * There is deliberately no third mode and no default branch: `mode` is a
 * closed union of two, and adding a third composer mode has to come here and
 * name its event rather than fall through to a description save.
 */
export function composeEditorSubmission(mode: 'comment' | 'description', doc: DocJson): EditorSubmission {
  return mode === 'comment'
    ? { type: 'comment.added', payload: { body: doc } }
    : { type: 'ticket.field_set', payload: { fieldId: 'description', value: doc } };
}
