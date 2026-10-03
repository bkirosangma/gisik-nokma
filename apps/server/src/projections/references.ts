import type { PoolClient } from 'pg';
import {
  commentAddedPayload,
  commentDeletedPayload,
  commentEditedPayload,
  extractDocReferences,
  isRedactedTicketCreated,
  isRedactedTicketPublished,
  type LedgerEvent,
} from '@gisik-nokma/domain';
import { purgedResolverFor } from '../purge/purged-lookup.js';
import type { Projection } from './registry.js';

/**
 * `proj_references` (Knowledge Graph spec B §2.1).
 *
 * ## Replace, never add
 * Every body event DELETEs the source's rows and inserts the body's references
 * afresh, so the same body twice is the same rows, and an edit leaves nothing
 * of the old text behind.
 *
 * ## Determinism
 * Each event touches only its own source's rows, read and written by that
 * source's key. The other tables read are the ledger itself (`events`: the
 * draft arm below, by per-entity seq) and `purged_entities` — neither is a
 * projection, never reset, the same answer live and on rebuild (`search.ts`'s
 * docblock) — so a reference to a purged item is skipped both ways, and its
 * chip reads `Deleted item` inside any other reference's snippet. Ordinals
 * are assigned BEFORE that filter, so the keys agree too.
 *
 * ## Known cost
 * Each body event costs three round trips — the `purged_entities` lookup, the
 * DELETE of the source's rows, the INSERT. (Drafts T3 kept that: a description's
 * draft test rides in the DELETE's statement; only `ticket.published`, rare, adds
 * a fourth, the read of the description it publishes.) At the size floor (100 000 body +
 * 400 000 other events) `rebuildProjection` took 86 401 ms against 40 059 ms
 * for `proj_search` in the same run (2.16 x), 193 332 rows (27.118 quotes the
 * run). Left as is on purpose (planner ruling 2026-10-03 13:24, ⚑ LANE 6 KG-B T1
 * rebuild bar, RULING A: the bar is 3 x the `proj_search` baseline of the same
 * run; no optimisation at prod's size, far under the floor). The deploy path is
 * the boot backfill: its longest single-entity transaction was 40 ms in that
 * run (two runs under heavier load reached 110 and 159 ms, one spike each).
 *
 * ## Drafts (drafts T3, errata E1)
 * A draft leaves no trace outside its author's view until publish (owner ruling
 * 2026-10-04): its bodies are NOT indexed, or another ticket it mentions would
 * gain a "Linked from" row and a count. A `ticket.created {draft: true}` writes
 * nothing; a description `ticket.field_set` asks whether the ticket is a draft
 * AS OF that event, in the same statement as its DELETE (no extra round trip);
 * `ticket.published` indexes the then-current description, attributed to the
 * publish. "A draft as of this event" is read from the LEDGER (a draft creation
 * and no earlier `ticket.published`), never from `proj_tickets`: the ledger is
 * the same answer live, in `rebuildProjection` (which replays this projection
 * alone against today's sibling tables), in the boot backfill and in the purge's
 * survivor replay. A discard writes nothing; the erase (T5) deletes the events.
 *
 * ## Trash and purge
 * A trash event is not a body event: rows stay, reads hide them
 * (`read/linked-from.ts`). Purge deletes by source parent AND by target
 * (`purge/erasure.ts`) and re-derives survivors through this `apply`
 * (`purge/survivors.ts`).
 */
export const REFERENCE_BODY_EVENT_TYPES = [
  'ticket.created',
  'ticket.field_set',
  // A draft's description is indexed at its publish (drafts T3, E1): the publish is a body event.
  'ticket.published',
  'comment.added',
  'comment.edited',
  'comment.deleted',
  'note.created',
  'note.body_set',
] as const;

/**
 * Every other type on a ticket or note stream, and why it carries no document. 27.111 holds this total.
 * 27.111 reports every type of TICKET_/NOTE_/COMMENT_/CONTEST_EVENT_TYPES (domain) that is in neither this table nor `REFERENCE_BODY_EVENT_TYPES`
 * (and fails on a body type listed here). It does not flag a key that is in no list: delete an entry by
 * hand when its event type is removed.
 */
export const NOT_A_REFERENCE_BODY: Readonly<Record<string, string>> = {
  'ticket.transitioned': 'its optional comment is plain text `{ text }`, not a document (`mcp-server` `redactedPayload`)',
  'ticket.assigned': 'a person id, not a document',
  'ticket.collaborator_added': 'a person id, not a document',
  'ticket.collaborator_removed': 'a person id, not a document',
  'ticket.reparented': 'structure (spec C reads proj_tickets.parent_id)',
  'ticket.link_added': 'a typed link {kind, targetId} between tickets, not a document (spec A; spec C reads it)',
  'ticket.link_removed': 'a typed link {kind, targetId} between tickets, not a document (spec A; spec C reads it)',
  'ticket.workflow_rebound': 'a workflow id',
  'ticket.closed': 'no body',
  'ticket.reopened': 'no body',
  'ticket.ranked': 'a rank string',
  'ticket.discarded': 'the author\'s intent to erase a draft: empty, no document, and a draft wrote no row to remove (drafts T3, E1)',
  'ticket.deleted': 'trash: rows stay, reads hide them',
  'ticket.restored': 'trash: rows were never removed',
  'attachment.added': 'a file, not a document',
  'note.renamed': 'a title string',
  'note.scope_set': 'an audience',
  'note.moved': 'a project id',
  'note.attached': 'structure (proj_note_attachments)',
  'note.detached': 'structure (proj_note_attachments)',
  'note.deleted': 'trash: rows stay, reads hide them',
  'note.restored': 'trash: rows were never removed',
  'claim.contested': 'a refused claim; it changed no body',
  'claim.contested_resolved': 'a resolution; it changed no body',
  'visibility.set': 'an audience',
  'purge.marked': 'a purge mark; the purge itself deletes rows (purge/erasure.ts)',
  'purge.unmarked': 'a purge mark',
  'purge.completed': 'the purge deletes rows directly (purge/erasure.ts)',
};

type Source = { kind: 'ticket' | 'note' | 'comment'; id: string; parentKind: 'ticket' | 'note'; parentId: string };

/**
 * True when `ticketId` is a DRAFT as of the event at per-entity `seq`: born `draft: true` (a purge's
 * redaction keeps that marker) and no `ticket.published` before `seq`. `$3` and `$4` (drafts T3, E1).
 */
const DRAFT_AS_OF_SQL = `EXISTS (SELECT 1 FROM events c WHERE c.entity_kind = 'ticket' AND c.entity_id = $3
                                    AND c.type = 'ticket.created' AND c.payload->>'draft' = 'true')
   AND NOT EXISTS (SELECT 1 FROM events p WHERE p.entity_kind = 'ticket' AND p.entity_id = $3
                                    AND p.type = 'ticket.published' AND p.seq < $4)`;

/**
 * Replaces one source's rows with the references in `doc` (`null` = no body). Exported for the purge's survivor
 * replay test. `unlessDraft` (a ticket's own description): when the ticket is a draft as of `event`, the rows are
 * deleted and nothing is indexed, asked in the DELETE's own statement.
 */
export async function replaceReferences(tx: PoolClient, event: LedgerEvent, source: Source, doc: unknown, unlessDraft = false): Promise<void> {
  if (unlessDraft) {
    const { rows } = await tx.query<{ draft: boolean }>(
      `WITH gone AS (DELETE FROM proj_references WHERE source_kind = $1 AND source_id = $2)
       SELECT ${DRAFT_AS_OF_SQL} AS draft`,
      [source.kind, source.id, event.entity.id, event.seq],
    );
    if (rows[0]?.draft === true) return;
  } else {
    await tx.query('DELETE FROM proj_references WHERE source_kind = $1 AND source_id = $2', [source.kind, source.id]);
  }
  if (doc === null || doc === undefined) return;
  const isPurged = await purgedResolverFor(tx, [doc]);
  const refs = extractDocReferences(doc, { isPurged }).filter(
    (ref) => ref.targetKind === 'person' || !isPurged(ref.targetKind, ref.targetId),
  );
  if (refs.length === 0) return;
  await tx.query(
    `INSERT INTO proj_references
       (workspace_id, source_kind, source_id, source_parent_kind, source_parent_id,
        target_kind, target_id, ordinal, snippet, updated_by, updated_at, seq)
     SELECT $1, $2, $3, $4, $5, r.target_kind, r.target_id, r.ordinal, r.snippet, $6, $7, $8
       FROM unnest($9::text[], $10::text[], $11::int[], $12::text[]) AS r(target_kind, target_id, ordinal, snippet)`,
    [
      event.workspaceId, source.kind, source.id, source.parentKind, source.parentId,
      event.actorId, event.serverTime, event.workspaceSeq,
      refs.map((ref) => ref.targetKind), refs.map((ref) => ref.targetId),
      refs.map((ref) => ref.ordinal), refs.map((ref) => ref.snippet),
    ],
  );
}

/**
 * A ticket's description just before `event` (per-entity `seq`), from the ledger: the latest of its creation's
 * `description` and its description `ticket.field_set`s. Only `ticket.published` asks, so a draft's bodies are
 * read once, at the publish.
 */
async function descriptionBefore(tx: PoolClient, event: LedgerEvent): Promise<unknown> {
  const { rows } = await tx.query<{ type: string; payload: { description?: unknown; value?: unknown } }>(
    `SELECT type, payload FROM events
      WHERE entity_kind = 'ticket' AND entity_id = $1 AND seq < $2
        AND (type = 'ticket.created' OR (type = 'ticket.field_set' AND payload->>'fieldId' = 'description'))
      ORDER BY seq DESC LIMIT 1`,
    [event.entity.id, event.seq],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return (row.type === 'ticket.created' ? row.payload.description : row.payload.value) ?? null;
}

export const referencesProjection: Projection = {
  name: 'proj_references',
  tables: ['proj_references'],

  async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
    const kind = event.entity.kind;
    if (kind !== 'ticket' && kind !== 'note') return;
    const self = (sourceKind: 'ticket' | 'note'): Source => ({ kind: sourceKind, id: event.entity.id, parentKind: kind, parentId: event.entity.id });
    const comment = (id: string): Source => ({ kind: 'comment', id, parentKind: kind, parentId: event.entity.id });
    switch (event.type) {
      case 'ticket.created': {
        // A redacted creation (trash Plan 2) has no description to index.
        if (kind !== 'ticket' || isRedactedTicketCreated(event)) return;
        const payload = event.payload as { description?: unknown; draft?: unknown };
        // A draft's description is indexed at its publish, never before (drafts T3, E1).
        if (payload.draft === true) return;
        await replaceReferences(tx, event, self('ticket'), payload.description ?? null);
        return;
      }
      case 'ticket.field_set': {
        const payload = event.payload as { fieldId?: unknown; value?: unknown };
        if (kind !== 'ticket' || payload.fieldId !== 'description') return;
        await replaceReferences(tx, event, self('ticket'), payload.value ?? null, true);
        return;
      }
      case 'ticket.published': {
        // A purged ticket's redacted publish (drafts T2) has no ticket left to index.
        if (kind !== 'ticket' || isRedactedTicketPublished(event)) return;
        // The draft's description as it stands at the publish, attributed to the publish (drafts T3, E1).
        await replaceReferences(tx, event, self('ticket'), await descriptionBefore(tx, event));
        return;
      }
      case 'note.created':
      case 'note.body_set': {
        if (kind !== 'note') return;
        const payload = event.payload as { body?: unknown };
        await replaceReferences(tx, event, self('note'), payload.body ?? null);
        return;
      }
      case 'comment.added': {
        // The comment's id IS the event id (`ticket-comments.ts`, "The id").
        await replaceReferences(tx, event, comment(event.id), commentAddedPayload.parse(event.payload).body);
        return;
      }
      case 'comment.edited': {
        const payload = commentEditedPayload.parse(event.payload);
        await replaceReferences(tx, event, comment(payload.commentId), payload.body);
        return;
      }
      case 'comment.deleted': {
        await replaceReferences(tx, event, comment(commentDeletedPayload.parse(event.payload).commentId), null);
        return;
      }
      default:
        return;
    }
  },

  async reset(tx: PoolClient): Promise<void> {
    await tx.query('TRUNCATE proj_references');
  },
};
