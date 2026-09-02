import type { GateRefusal, ServerGate } from './server-gate.js';

export const RULE_EVIDENCE_UNKNOWN = 'attachment.evidence-unknown';

/**
 * Plan 2's `require-evidence` rule checks that a transition CARRIES evidence;
 * this gate checks that the named evidence EXISTS ON THIS TICKET. Together they
 * close the fabricated-evidence hole without the pure engine ever touching a
 * table — which it cannot do, because a client replica has no `attachments`
 * table to consult and an engine rule that read one would make client and
 * server disagree by construction.
 *
 * Same indistinguishability as the embed gate, for the same reason: "no such
 * attachment" and "that attachment is another ticket's" answer with one rule
 * and one reason template. An actor who could tell those apart could enumerate
 * attachment ids across the whole deployment one transition at a time.
 *
 * A transition with NO `evidenceAttachmentId` is not this gate's business —
 * whether evidence was required at all is the workflow's question, and Plan 2's
 * rule answers it. This gate only judges evidence that was named.
 */
export function makeEvidenceGate(): ServerGate {
  return {
    eventType: 'ticket.transitioned',
    async check(event, db): Promise<GateRefusal | null> {
      const payload = event.payload as { evidenceAttachmentId?: unknown };
      const evidenceId = payload.evidenceAttachmentId;
      if (typeof evidenceId !== 'string') return null;
      const result = await db.query('SELECT 1 FROM attachments WHERE id = $1 AND ticket_id = $2', [
        evidenceId,
        // The ticket, for the same registry reason the embed gate records:
        // `ticket.transitioned` is bound to `entityKind: 'ticket'`, so
        // `parseEvent` has already refused anything whose entity is not one.
        event.entity.id,
      ]);
      if ((result.rows as unknown[]).length === 0) {
        return {
          rule: RULE_EVIDENCE_UNKNOWN,
          reason: `The attachment named as evidence (${evidenceId}) does not exist on this ticket, so this move cannot carry it as evidence.`,
        };
      }
      return null;
    },
  };
}
