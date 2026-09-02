import { EVIDENCE_DRIVE_REFERENCE_REASON, RULE_EVIDENCE_DRIVE_REFERENCE } from '@gisik-nokma/domain';
import type { GateRefusal, ServerGate } from './server-gate.js';

export const RULE_EVIDENCE_UNKNOWN = 'attachment.evidence-unknown';
export { RULE_EVIDENCE_DRIVE_REFERENCE };

/**
 * Plan 2's `require-evidence` rule checks that a transition CARRIES evidence;
 * this gate checks that the named evidence is something this product can
 * vouch for. Three outcomes, in this order:
 *
 *  1. The id names a real UPLOAD on this ticket — an `attachments` row with
 *     bytes this product holds. Committed.
 *  2. The id names a DRIVE REFERENCE on this ticket (spec §2, Drive rule 1):
 *     it exists — the user can see it in this ticket's own attachment list —
 *     and it is still not evidence, because a file we do not hold can be
 *     renamed, edited, moved or deleted after it is attached. Refused
 *     `attachment.evidence-drive-reference`, with the ONE sentence that
 *     explains why and names the remedy — `EVIDENCE_DRIVE_REFERENCE_REASON`,
 *     imported from `@gisik-nokma/domain` rather than retyped, so the gate,
 *     the editor's evidence picker (Task 13a) and every test read the exact
 *     same words. Saying "does not exist" here would be a small lie about
 *     something the user can already see, and would withhold the remedy.
 *  3. The id names nothing on THIS ticket — either nothing at all, or an
 *     upload/reference that belongs to another ticket. These two cannot be
 *     told apart without exposing an enumeration oracle (an actor could walk
 *     every id and learn, one refusal at a time, which ones exist anywhere in
 *     the deployment), so both answer the same `attachment.evidence-unknown`
 *     with a byte-identical reason template. This is the same
 *     indistinguishability the embed gate keeps, for the same reason.
 *
 * A transition with NO `evidenceAttachmentId` is not this gate's business —
 * whether evidence was required at all is the workflow's question, and Plan
 * 2's rule answers it. This gate only judges evidence that was named.
 */
export function makeEvidenceGate(): ServerGate {
  return {
    eventType: 'ticket.transitioned',
    async check(event, db): Promise<GateRefusal | null> {
      const payload = event.payload as { evidenceAttachmentId?: unknown };
      const evidenceId = payload.evidenceAttachmentId;
      if (typeof evidenceId !== 'string') return null;

      const uploaded = await db.query('SELECT 1 FROM attachments WHERE id = $1 AND ticket_id = $2', [
        evidenceId,
        // The ticket, for the same registry reason the embed gate records:
        // `ticket.transitioned` is bound to `entityKind: 'ticket'`, so
        // `parseEvent` has already refused anything whose entity is not one.
        event.entity.id,
      ]);
      if ((uploaded.rows as unknown[]).length > 0) return null;

      // Not an upload. A Drive reference has no bytes and therefore no
      // `attachments` row — its whole record is the ledger — so ask the
      // ledger, scoped to THIS ticket, before deciding which truth to tell.
      const reference = await db.query(
        `SELECT 1 FROM events
          WHERE entity_kind = 'ticket'
            AND entity_id = $1
            AND type = 'attachment.added'
            AND payload->>'kind' = 'drive-reference'
            AND payload->>'attachmentId' = $2
          LIMIT 1`,
        [event.entity.id, evidenceId],
      );
      if ((reference.rows as unknown[]).length > 0) {
        return { rule: RULE_EVIDENCE_DRIVE_REFERENCE, reason: EVIDENCE_DRIVE_REFERENCE_REASON };
      }

      return {
        rule: RULE_EVIDENCE_UNKNOWN,
        reason: `The attachment named as evidence (${evidenceId}) does not exist on this ticket, so this move cannot carry it as evidence.`,
      };
    },
  };
}
