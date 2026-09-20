import type { PoolClient } from 'pg';
import { commentAddedPayload, type LedgerEvent } from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * A ticket's comments, one row per `comment.added` (executor 2's comment-thread
 * dispatch). This is the READ the event has never had: `comment.added` was
 * fully wired — vocabulary, reducer, mention fan-out, sync, a `require-comment`
 * seed rule — and the only place its text landed was `proj_search.comments`, a
 * concatenated TEXT column built for full-text search with no author, no time
 * and no per-comment identity.
 *
 * ## Determinism
 *
 * Per-entity `seq` order is the only ordering replay guarantees, and it is
 * enough here: a comment is filed against the TICKET (`entityKind: 'ticket'`,
 * `packages/domain/src/vocabulary.ts:224`), so every event this projection
 * applies belongs to one entity and arrives in that entity's own order. The
 * projection reads NO other table — not another projection's, not its own — so
 * nothing above it must run first, and nothing below it must run after; that is
 * why it APPENDS in `index.ts` rather than inserting at a §8 position (whose
 * list ends at `proj_visibility` and names none for this).
 *
 * The two stored non-payload facts are both properties of the EVENT, never of
 * the moment it was applied: `serverTime` was assigned at ingest and is on the
 * ledger row, and `workspaceSeq` is written once under
 * `UNIQUE(workspace_id, workspace_seq)`. No clock is read here.
 *
 * ## What is deliberately NOT stored
 *
 * The comment's FILES. They are the attachment ids its own document embeds,
 * derived by `collectImageAttachmentIds` (`packages/domain/src/doc-embeds.ts:25`)
 * from `body` — a pure function of a column this table already holds, total on
 * every body the door accepts. Storing the derived ids would be one fact with
 * two spellings that can disagree, and the disagreement would be invisible: the
 * derivation cannot fail, so nothing would ever notice the copy going stale.
 *
 * ## The id
 *
 * `comment_id` IS the event id. The payload carries none — it is
 * `z.object({ body })` and nothing else (`events/ticket-events.ts:108`) — so the
 * envelope's id is the only identity a comment has, and it is the one the read
 * serves. That is the same construction `proj_contested` uses for
 * `contested_event_id`.
 */
export const ticketCommentsProjection: Projection = {
  name: 'proj_ticket_comments',
  tables: ['proj_ticket_comments'],

  async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
    if (event.type !== 'comment.added') {
      return;
    }

    // Belt-and-braces rather than a reachable branch, for `search.ts`'s reason:
    // the registry binds `comment.added` to `entityKind: 'ticket'` and
    // `parseEvent` refuses a mismatch, but `apply` is also called by replay
    // paths that read the ledger directly — and a comment filed against a
    // non-ticket entity would put a row in this table that no route could ever
    // scope to a ticket.
    if (event.entity.kind !== 'ticket') {
      return;
    }

    // PARSED rather than cast, matching `proj_contested`'s treatment of its own
    // payload. A cast would make an absent body `JSON.stringify(undefined)` —
    // a throw from the driver, inside the ingest transaction, naming nothing.
    // The door validates this shape before any projection runs, so a refusal
    // here is a replay-integrity break and should read like one.
    const payload = commentAddedPayload.parse(event.payload);

    await tx.query(
      `INSERT INTO proj_ticket_comments
         (comment_id, workspace_id, ticket_id, author_id, body, recorded_at, workspace_seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.id,
        event.workspaceId,
        event.entity.id,
        event.actorId,
        JSON.stringify(payload.body),
        event.serverTime,
        event.workspaceSeq,
      ],
    );
  },

  async reset(tx: PoolClient): Promise<void> {
    // TRUNCATE, not DELETE (controller ruling P4), matching every shipped
    // projection.
    await tx.query('TRUNCATE proj_ticket_comments');
  },
};
