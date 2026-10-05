import type { LedgerEvent } from '@gisik-nokma/domain';

/**
 * Which committed events wake the embedding worker (spec §7.6, Plan 3 of 6):
 * `nudgesEmbedding` for notes, and since Knowledge Graph spec D Task 2 a second
 * predicate, `nudgesItemEmbedding`, for tickets and ticket comments.
 *
 * ## Why this lives in its own module, and it is not tidiness
 *
 * `app.ts` registers the commit listener that calls this, and `app.ts` is
 * imported by around sixty test files. `embed-worker.ts` imports
 * `embedding.ts` — this module imports a TYPE and nothing else, so a
 * predicate declared there cannot make any of those sixty files pay for
 * anything `embedding.ts` does. (Before task/notes-3-runtime-fix, that
 * mattered more than it does now: `embedding.ts` used to import
 * `@huggingface/transformers`, which dlopens `onnxruntime-node` at module
 * load — every import was a native-runtime load, not merely a heavy one.
 * `embedding.ts` no longer imports that package, and today's `embedding.ts`
 * does nothing eager at import time — `loadTable`/`loadTokenizer` only run
 * on first `embedBatch` call. The separation stays because it is still free
 * and the loop's own module should be the one thing that can trigger it, not
 * because importing `embedding.ts` is still expensive.)
 *
 * `embed-worker.ts` re-exports it, so the name is still reachable from the
 * module that owns the loop.
 *
 * ## Which two note events, and which are deliberately not here
 *
 * `note.created` and `note.body_set` are the notes plan's two for
 * `nudgesEmbedding` (the ticket and comment events are `nudgesItemEmbedding`'s,
 * below), and the pair is the
 * right pair: those are the events that put TEXT in the note. `note.created` is
 * included even though a new note's body is usually `EMPTY_NOTE_DOC`, because
 * its TITLE becomes searchable then — the worker's title fallback means a note
 * with no body still has a chunk worth building.
 *
 * `note.renamed` is NOT here, and that is a recorded gap rather than an
 * oversight: a rename changes a note's title, and therefore the title-fallback
 * chunk of a note that has no body. The plan names the two types, the worker's
 * interval (10 s) picks a rename up on its own, and widening the set would be a
 * change to an interface the plan fixes — so it is named here, and in the
 * ledger, and left for the owner to decide.
 */
const NUDGE_EVENT_TYPES = new Set(['note.created', 'note.body_set']);

export function nudgesEmbedding(event: LedgerEvent): boolean {
  return event.entity.kind === 'note' && NUDGE_EVENT_TYPES.has(event.type);
}

/**
 * Knowledge Graph spec D §2: the events that change a ticket's or a ticket comment's embedded text, or whether
 * it exists. A SEPARATE predicate, so `nudgesEmbedding` and 18.140 stay exactly as pinned. `ticket.field_set`
 * is taken whole: the worker's hash, not this list, decides whether the text moved, and a nudge that finds
 * nothing stale costs one query.
 */
const ITEM_NUDGE_TICKET_TYPES = new Set([
  'ticket.created', 'ticket.field_set', 'ticket.deleted', 'ticket.restored',
  'comment.added', 'comment.edited', 'comment.deleted',
]);

export function nudgesItemEmbedding(event: LedgerEvent): boolean {
  return event.entity.kind === 'ticket' && ITEM_NUDGE_TICKET_TYPES.has(event.type);
}
