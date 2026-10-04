import { collectImageAttachmentIds, isEmbeddableImageMime } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { GateRefusal, ServerGate } from './server-gate.js';

export const RULE_EMBED_UNKNOWN = 'attachment.embed-unknown';
export const RULE_EMBED_NOT_IMAGE = 'attachment.embed-not-image';

/**
 * Layer 3 of image-only inline embedding (spec §2 Attachments): a stored
 * document may embed only image-mime attachments belonging to ITS OWN ticket.
 *
 * The three layers are not redundant, and this one is the only one that is not
 * optional. Layer 1 is the editor's `insertTicketImage` command refusing a
 * non-image mime; layer 2 is paste/drop routing. Both run in the client, and a
 * client that simply POSTs an event to `/v1/events` never executes either. This
 * gate is the door itself, so its tests construct the event payload directly
 * rather than driving the editor — driving the editor would only re-prove layer
 * 1.
 *
 * TWO REFUSALS, and conflating them is the trap:
 *
 *  - `attachment.embed-not-image` — the id resolves ON THIS TICKET and is not
 *    an embeddable image. Safe to be precise about: the actor already knows
 *    this attachment exists, because it is on the ticket in front of them.
 *  - `attachment.embed-unknown` — the id does not resolve on this ticket. ONE
 *    rule and ONE reason template covers both "nothing anywhere" and "belongs
 *    to a different ticket", because the two must be indistinguishable. An
 *    actor-supplied attachment id resolved with no ticket predicate is exactly
 *    the cross-ticket disclosure hazard this project has already paid for once
 *    (P14); a refusal that said "that one is not yours" rather than "that one
 *    is not here" would turn this gate into an existence oracle for every
 *    attachment id in the deployment.
 *
 * The ticket the document belongs to is `event.entity.id`. That is sound
 * because the registry binds `comment.added` and `ticket.field_set` to
 * `entityKind: 'ticket'` and `parseEvent` refuses any event whose entity kind
 * disagrees with its registration — so by the time a gate runs, the entity is a
 * ticket. An editor who ever registers one of these types against another kind
 * silently turns the ticket predicate below into a comparison against
 * something that is not a ticket id; the binding is load-bearing.
 */
async function checkDocEmbeds(doc: unknown, ticketId: string, db: Queryable): Promise<GateRefusal | null> {
  const ids = collectImageAttachmentIds(doc);
  if (ids.length === 0) return null;

  // ONE round trip for the whole document, then the verdict is decided in
  // document order. Deciding in document order rather than in row order is what
  // makes the refusal reproducible: two ids that both offend produce the same
  // refusal every time, naming the one the author would find first.
  //
  // The ticket predicate is in the WHERE clause rather than in a post-filter on
  // purpose. A query that fetched by id and compared afterwards would answer
  // correctly today and disclose on the first refactor that logged, counted or
  // short-circuited on the fetched row.
  //
  // Deliberately NOT also scoped by workspace. What binds this ticket to this
  // event's workspace is the entity↔workspace guard in `commitInTx`, which runs
  // before any gate and refuses an event filing a ticket under a workspace it
  // does not belong to; adding `workspace_id = ...` here would restate that
  // guard in a place that cannot be the one enforcing it, and would read as
  // though it were.
  const result = await db.query(
    'SELECT id, mime FROM attachments WHERE ticket_id = $1 AND id = ANY($2::text[])',
    [ticketId, ids],
  );
  const mimeById = new Map<string, string>(
    (result.rows as Array<{ id: string; mime: string }>).map((row) => [row.id, row.mime]),
  );

  for (const id of ids) {
    const mime = mimeById.get(id);
    if (mime === undefined) {
      return {
        rule: RULE_EMBED_UNKNOWN,
        reason: `This document embeds an attachment (${id}) that does not exist on this ticket, so the claim cannot be accepted.`,
      };
    }
    if (!isEmbeddableImageMime(mime)) {
      return {
        rule: RULE_EMBED_NOT_IMAGE,
        reason: `Only images may be embedded inline. Attachment ${id} is ${mime}; add it to the ticket's attachment list instead.`,
      };
    }
  }
  return null;
}

export function makeImageEmbedGates(): ServerGate[] {
  return [
    {
      eventType: 'comment.added',
      async check(event, db) {
        const payload = event.payload as { body?: unknown };
        return checkDocEmbeds(payload.body ?? null, event.entity.id, db);
      },
    },
    {
      // An edit is a new document for the same comment: held to the same rule as the comment it replaces.
      eventType: 'comment.edited',
      async check(event, db) {
        const payload = event.payload as { body?: unknown };
        return checkDocEmbeds(payload.body ?? null, event.entity.id, db);
      },
    },
    {
      eventType: 'ticket.field_set',
      async check(event, db) {
        const payload = event.payload as { fieldId?: unknown; value?: unknown };
        // Only `description` is a document. Every other field's value is
        // opaque scalar data, and walking it for `type: 'image'` nodes would
        // be inventing a document where the product never stored one — a
        // custom text field whose value happened to be JSON shaped like a doc
        // would start being refused for embedding an attachment nobody
        // embedded.
        if (payload.fieldId !== 'description') return null;
        return checkDocEmbeds(payload.value ?? null, event.entity.id, db);
      },
    },
  ];
}
