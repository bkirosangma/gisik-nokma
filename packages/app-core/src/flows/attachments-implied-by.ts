import type { SubmittedEvent } from '@gisik-nokma/domain';
import type { MakeSubmitted } from '../submit.js';

/**
 * Tagging a note in a ticket comment attaches it (Plan 7 Task 5, spec §14.3,
 * D27–D28): every distinct `wikiLink` a comment's document references implies
 * one `note.attached { ticketId }`, filed after the comment itself commits
 * (`ticket-sheet.tsx`'s `submitComment`). A `ticketRef` beside it implies
 * nothing — spec §14.3 names only note references, and case 18.279 pins the
 * distinction against the node this feature could easily have confused it
 * with (`ticket-ref.ts` ships in the same plan).
 *
 * `workspaceId` is a parameter here though the plan's own text omitted it:
 * `MakeSubmitted`'s `EnvelopeSeed` requires it (`../submit.ts`), and every
 * other call site in this package that builds a `note.attached` — the Attach
 * picker, the Notes section's own detach/undo — supplies it. There is no
 * value this function could substitute.
 */

const MAX_DEPTH = 200;

export type NoteReference = { noteId: string; title: string };

function collectWikiLinkReferences(node: unknown, depth: number, seen: Set<string>, out: NoteReference[]): void {
  if (depth > MAX_DEPTH) return;
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return;
  const candidate = node as { type?: unknown; attrs?: unknown; content?: unknown };
  if (candidate.type === 'wikiLink') {
    const attrs = (
      typeof candidate.attrs === 'object' && candidate.attrs !== null ? candidate.attrs : {}
    ) as { noteId?: unknown; title?: unknown };
    const noteId = typeof attrs.noteId === 'string' ? attrs.noteId : '';
    if (noteId.length > 0 && !seen.has(noteId)) {
      seen.add(noteId);
      out.push({ noteId, title: typeof attrs.title === 'string' ? attrs.title : '' });
    }
    // An atom node — nothing to descend into, and a wikiLink never contains
    // another wikiLink in this schema regardless.
    return;
  }
  // A `ticketRef` (or any other node) is not descended into specially — its
  // own `content` (it has none, being an atom too) would yield nothing
  // either way. Falling through to the generic branch below is what keeps
  // this function from needing a name for every node type schema v2 has.
  if (Array.isArray(candidate.content)) {
    for (const child of candidate.content) collectWikiLinkReferences(child, depth + 1, seen, out);
  }
}

/**
 * Every DISTINCT `wikiLink` reference a document makes, in first-seen order —
 * the noteId and the title the link was made with, for a caller (the toast in
 * `submitComment`) that wants the words rather than the id. Total: unrenderable
 * input yields `[]`, the same discipline `docToPlainText`/`renderCommentBody`
 * keep for a document that arrived through the ledger rather than fresh from
 * the editor.
 */
export function noteReferencesIn(body: unknown): NoteReference[] {
  const seen = new Set<string>();
  const out: NoteReference[] = [];
  collectWikiLinkReferences(body, 0, seen, out);
  return out;
}

/**
 * One `note.attached { ticketId }` per distinct note the document references
 * that is not already in `alreadyAttached` — `[]` for a body with no
 * references, or where every reference is already attached (`note.attached`
 * is itself idempotent server-side, but a caller that files it anyway is
 * making a claim about a note it already knows is attached, which is not
 * this feature's business to assert).
 */
export function attachmentsImpliedBy(
  body: unknown,
  workspaceId: string,
  ticketId: string,
  alreadyAttached: readonly string[],
  make: MakeSubmitted,
): SubmittedEvent[] {
  const already = new Set(alreadyAttached);
  return noteReferencesIn(body)
    .filter((ref) => !already.has(ref.noteId))
    .map((ref) =>
      make({
        workspaceId,
        entity: { kind: 'note', id: ref.noteId },
        type: 'note.attached',
        payload: { ticketId },
      }),
    );
}
