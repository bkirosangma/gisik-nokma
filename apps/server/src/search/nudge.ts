import type { LedgerEvent } from '@gisik-nokma/domain';

/**
 * Which committed events wake the embedding worker (spec §7.6, Plan 3 of 6).
 *
 * ## Why this lives in its own module, and it is not tidiness
 *
 * `app.ts` registers the commit listener that calls this, and `app.ts` is
 * imported by around sixty test files. `embed-worker.ts` imports
 * `embedding.ts`, which imports `@huggingface/transformers` and sets
 * `env.allowRemoteModels = false` at module load — so a predicate declared
 * there would make every one of those sixty files load a machine-learning
 * runtime to ask a question about two event-type strings. This module imports a
 * TYPE and nothing else, so the cost is zero.
 *
 * `embed-worker.ts` re-exports it, so the name is still reachable from the
 * module that owns the loop.
 *
 * ## Which two, and which are deliberately not here
 *
 * `note.created` and `note.body_set` are the plan's two, and the pair is the
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
