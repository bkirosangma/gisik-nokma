import type { PoolClient } from 'pg';
import { isTicketLinkEvent, ticketLinkAddedPayload, type LedgerEvent } from '@gisik-nokma/domain';
import { purgedIdsAmong } from '../purge/purged-lookup.js';
import type { Projection } from './registry.js';

/**
 * `proj_ticket_links` (Knowledge Graph spec A §2.5, typed-links T2). One row per stored link, keyed by its SOURCE
 * ticket: the one whose stream holds its events, or, for a link filed on a draft's stream, its `from` (drafts R42).
 * `proj_tickets.links` holds the same links as the folded `TicketState.links` of the ticket whose stream holds them
 * (the source's; a draft's for its from entries); this table is the queryable copy, read in both directions by the
 * graph's ring read (`read/graph-neighbours.ts`) and, from typed-links T4, by `read/ticket-links.ts`.
 *
 * `link_added` inserts (`ON CONFLICT DO NOTHING` mirrors the reducer's idempotent add; the engine refuses a duplicate
 * before it reaches the ledger, typed-links T3) and `link_removed` deletes exactly that `(source, target, kind)`.
 * A draft-side link (`from`, drafts R42) is keyed by its source, not by the draft whose stream holds it. The publish
 * re-file's plain event inserts the same primary key and `DO NOTHING` keeps the first row (drafts T6 decision 13),
 * so a rebuild and the live table agree.
 * Every stored fact is the EVENT's (actor, `serverTime`, origin, `workspaceSeq`), never the moment of applying, so a
 * rebuild writes the same row.
 *
 * ## Trash keeps the row; purge erases it
 *
 * A ticket moved to the trash keeps its rows (spec §2.5); reads hide a trashed end. A purge deletes every row naming
 * the ticket at EITHER end (`purge/erasure.ts`), and a link to an ERASED ticket is never written, live or on rebuild,
 * because the purge registry answers the same both ways: the rule `projections/notes.ts:282-291` keeps for a note
 * attached to an erased ticket.
 *
 * What stays, decided (typed-links plan, Task 2 Step 3): the surviving source's `proj_tickets.links` still names the
 * erased id. The ledger keeps its `link_added`, and a rebuild folds it again, so live and rebuild agree. Every read
 * joins the other end through `proj_tickets` and the viewer's visibility, which drop it. A `link_removed` naming it
 * is refused by `checkPurged` (`purge/check-purged.ts`, the link arm of `payloadIds`), which is acceptable: nothing
 * can show the link to remove.
 *
 * The projection reads no other projection's table (only its own rows and `purged_entities`).
 */
export const ticketLinksProjection: Projection = {
  name: 'proj_ticket_links',
  tables: ['proj_ticket_links'],

  async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
    if (!isTicketLinkEvent(event.type) || event.entity.kind !== 'ticket') return;
    // One schema parses both: `ticketLinkRemovedPayload` is the same `{ kind, targetId, from? }`, strict.
    const { kind, targetId, from } = ticketLinkAddedPayload.parse(event.payload);
    // Drafts R42: a link filed from the other end is stored on the DRAFT's stream but belongs to its SOURCE.
    const sourceId = from ?? event.entity.id;
    if (event.type === 'ticket.link_removed') {
      await tx.query('DELETE FROM proj_ticket_links WHERE source_id = $1 AND target_id = $2 AND kind = $3', [sourceId, targetId, kind]);
      return;
    }
    if ((await purgedIdsAmong(tx, 'ticket', [sourceId, targetId])).size > 0) return;
    await tx.query(
      `INSERT INTO proj_ticket_links (workspace_id, source_id, target_id, kind, created_by, created_at, origin, seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (source_id, target_id, kind) DO NOTHING`,
      [event.workspaceId, sourceId, targetId, kind, event.actorId, event.serverTime, event.origin, event.workspaceSeq],
    );
  },

  async reset(tx: PoolClient): Promise<void> {
    // TRUNCATE, not DELETE (controller ruling P4), matching every shipped
    // projection.
    await tx.query('TRUNCATE proj_ticket_links');
  },
};
