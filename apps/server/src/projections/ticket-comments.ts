import type { PoolClient } from 'pg';
import { commentAddedPayload, type LedgerEvent } from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * Comments, one row per `comment.added` — a ticket's in `proj_ticket_comments`
 * and a NOTE's in `proj_note_comments` (the notes series, Plan 1 of 6, spec
 * §6.3). This is the READ the event has never had: `comment.added` was fully
 * wired — vocabulary, reducer, mention fan-out, sync, a `require-comment` seed
 * rule — and the only place its text landed was `proj_search.comments`, a
 * concatenated TEXT column built for full-text search with no author, no time
 * and no per-comment identity.
 *
 * ## Why ONE projection owns two tables
 *
 * Because the event is one TYPE with two kinds (`entityKind: ['ticket',
 * 'note']`, `packages/domain/src/vocabulary.ts`). Two projections would put the
 * same event in front of two `apply` functions, each of which would have to
 * re-state which kind it takes — and the second one's guard is the kind of
 * belt-and-braces branch that is easy to get backwards and invisible when it is.
 * One `apply`, one branch, one place to read the rule.
 *
 * ## Determinism
 *
 * Per-entity `seq` order is the only ordering replay guarantees, and it is
 * enough here: a comment is filed against the entity it is about — a ticket or
 * a note, and still exactly one of them — so every event this projection applies
 * belongs to one entity and arrives in that entity's own order. The projection
 * reads NO other table — not another projection's, not its own — so nothing
 * above it must run first, and nothing below it must run after; that is why it
 * APPENDS in `index.ts` rather than inserting at a §8 position (whose list ends
 * at `proj_visibility` and names none for this).
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
  tables: ['proj_ticket_comments', 'proj_note_comments'],

  async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
    if (event.type !== 'comment.added') {
      return;
    }

    // The TWO kinds `comment.added` may be filed against, since the notes series
    // (Plan 1 of 6): a comment on a ticket and a comment on a note are the same
    // claim about a different subject, and the registry now declares both
    // (`vocabulary.ts`, `entityKind: ['ticket', 'note']`). ONE projection owns
    // both tables because the event is one type: splitting them would put the
    // same event in front of two `apply` functions, each of which would have to
    // re-state which kind it takes.
    //
    // Anything else still returns, and that guard is still belt-and-braces for
    // `search.ts`'s reason: `parseEvent` refuses a third kind at the door, but
    // `apply` is also called by replay paths that read the ledger directly, and
    // a comment filed against, say, a project would put a row in the ticket
    // table that no route could ever scope to a ticket.
    if (event.entity.kind !== 'ticket' && event.entity.kind !== 'note') {
      return;
    }

    // PARSED rather than cast, matching `proj_contested`'s treatment of its own
    // payload. A cast would make an absent body `JSON.stringify(undefined)` —
    // a throw from the driver, inside the ingest transaction, naming nothing.
    // The door validates this shape before any projection runs, so a refusal
    // here is a replay-integrity break and should read like one.
    const payload = commentAddedPayload.parse(event.payload);

    // The two tables differ in ONE column's NAME and in nothing else — the
    // owning entity — which is why this is a branch over the owner rather than
    // one parameterised table name. Interpolating the table and the column from
    // `event.entity.kind` would put caller-adjacent bytes into SQL text, and the
    // read layer's own rule (`SqlParams`) is that nothing does.
    await tx.query(
      event.entity.kind === 'note'
        ? `INSERT INTO proj_note_comments
             (comment_id, workspace_id, note_id, author_id, body, recorded_at, workspace_seq)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`
        : `INSERT INTO proj_ticket_comments
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
    await tx.query('TRUNCATE proj_ticket_comments, proj_note_comments');
  },
};
