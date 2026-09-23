import { isDocJson, type DocJson } from '../doc.js';
import type { MentionCandidate } from '../extensions/mention.js';
import type { NoteLinkCandidate } from '../extensions/wiki-link.js';
import type { TicketRefCandidate } from '../extensions/ticket-ref.js';

/** Protocol version — bump only with a coordinated Plan 10 change. */
export const EDITOR_BRIDGE_VERSION = 1 as const;

export type HostToEditorMessage =
  | { bridge: 1; kind: 'loadDoc'; doc: DocJson | null; editable: boolean }
  | { bridge: 1; kind: 'insertImage'; attachmentId: string; mime: string; alt?: string }
  | { bridge: 1; kind: 'requestSubmit' }
  | { bridge: 1; kind: 'mentionResults'; requestId: string; users: MentionCandidate[] }
  | { bridge: 1; kind: 'noteResults'; requestId: string; candidates: NoteLinkCandidate[] }
  | { bridge: 1; kind: 'ticketResults'; requestId: string; candidates: TicketRefCandidate[] }
  | { bridge: 1; kind: 'uploadFailed'; requestId: string; message: string };

export type EditorToHostMessage =
  | { bridge: 1; kind: 'ready' }
  | { bridge: 1; kind: 'change'; doc: DocJson }
  | { bridge: 1; kind: 'submit'; doc: DocJson }
  | { bridge: 1; kind: 'requestUpload'; requestId: string }
  | { bridge: 1; kind: 'mentionQuery'; requestId: string; query: string }
  | { bridge: 1; kind: 'noteQuery'; requestId: string; query: string }
  | { bridge: 1; kind: 'ticketQuery'; requestId: string; query: string };

/**
 * Host messages arrive from outside this process across a channel that can
 * deliver anything: a hostile page, a stale bundle talking a newer or older
 * protocol, or plain noise. Every field is validated; anything that does not
 * match the shape of a known message answers null, and this function never
 * throws.
 *
 * WHAT COUNTS AS MALFORMED, enumerated so the boundary is explicit rather
 * than implied by whatever the switch happens to check:
 *   - not JSON-shaped at all (a bare string, a number, `undefined`, an array
 *     standing in for an object) — refused by the initial object guard.
 *   - missing the `bridge` version discriminator, or carrying the wrong one
 *     — refused before `kind` is even inspected. A future protocol bump on
 *     one side of the bridge must not be silently coerced into the other's
 *     shape.
 *   - an unrecognised `kind` — refused by the `default` branch. This is the
 *     one case that is ALSO the tolerated-forward-compat case: an older
 *     bundle facing a message kind a newer host invented returns null and
 *     the caller drops it, rather than crashing the composer. Refusal and
 *     graceful degradation are the same code path here on purpose.
 *   - a recognised `kind` missing a required field, or a field of the wrong
 *     type (e.g. `insertImage` with no `mime`, `mentionResults` whose
 *     `users` is not an array, `noteResults` whose `candidates` is not) —
 *     refused per-branch.
 *   - a `loadDoc.doc` that is not doc-shaped AT THE TOP LEVEL — refused via
 *     `isDocJson`, which checks only `typeof value === 'object' &&
 *     value.type === 'doc'`. That stops a payload that isn't a document at
 *     all (a bare string, `{ type: 'paragraph' }` standing in for a doc,
 *     `null` when a doc is required) — it is NOT a deep check, and a value
 *     that passes it can still carry unvalidated content underneath. See
 *     the `loadDoc` bullet below: it is this file's one exception to
 *     "nothing unvalidated reaches downstream".
 *
 * WHAT IS DELIBERATELY TOLERATED, not refused:
 *   - an `insertImage` whose `mime` names something other than an image.
 *     That is layer 1's job (`insertTicketImage` in
 *     `create-editor-bridge.ts`), not the parser's — the parser's contract
 *     is "is this shaped like the message it claims to be", not "is this a
 *     message we are willing to act on".
 *   - a message carrying EXTRA fields beyond the ones a given `kind`
 *     defines. Every branch below returns a freshly constructed object
 *     literal built field-by-field from `record`, never `record` itself
 *     (and never a spread of it) — so for every kind EXCEPT `loadDoc`, an
 *     unrecognised extra field is read by nothing and reaches nothing
 *     downstream.
 *
 *     `loadDoc` is the deliberate exception, and it is a real one, not a
 *     hypothetical: `record.doc` is assigned straight into the returned
 *     message BY REFERENCE — the attacker's own object, not a copy — and
 *     `create-editor-bridge.ts` passes that same reference straight into
 *     `editor.commands.setContent`. Because `isDocJson` validates only the
 *     top level, a `doc` that satisfies `{ type: 'doc' }` can still carry
 *     anything in its nested `content`: an `attachmentId` that is an
 *     object instead of a string, a `wrap` outside `IMAGE_WRAP_MODES`, a
 *     numeric `alt`. All of it reaches the live document unfiltered and is
 *     echoed straight back to the host on the next `change` message.
 *     Nothing in this package validates that interior today — the
 *     per-attribute coercion TicketImage applies (an unknown `wrap` becomes
 *     `block`, for instance) lives in its HTML `parseHTML`, a door this
 *     JSON-in path never opens. This is a tracked gap, not a covered case:
 *     owned by Task 3 (ticket-image attribute validation) or Task 16's
 *     verification pass, not solved by this function.
 *   - `mentionResults.users` similarly parses if merely an array; a
 *     malformed entry inside it is filtered out below rather than voiding
 *     the whole message, since a partial batch of results is still useful
 *     and dropping one bad entry cannot forge a mention (`mentionAttrsOf`
 *     gates that at insertion, elsewhere in this package).
 *
 * ONE CATEGORY THIS FUNCTION DOES NOT SEE: "not JSON at all" — a raw string
 * that fails `JSON.parse`. That is handled one layer up, in `entry.tsx`'s
 * `message` event listener, which try/catches the parse and drops anything
 * that throws before this function is ever called. That listener carries
 * no unit test of its own: it is a three-line DOM shim (`window` /
 * `document` message listeners) that only runs inside a real WebView or a
 * browser tab, so its coverage is the shape of the listener itself, not a
 * red/green check.
 */
export function parseHostMessage(raw: unknown): HostToEditorMessage | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.bridge !== EDITOR_BRIDGE_VERSION) return null;
  switch (record.kind) {
    case 'loadDoc':
      if (record.doc !== null && !isDocJson(record.doc)) return null;
      if (typeof record.editable !== 'boolean') return null;
      return { bridge: 1, kind: 'loadDoc', doc: record.doc as DocJson | null, editable: record.editable };
    case 'insertImage':
      if (typeof record.attachmentId !== 'string' || typeof record.mime !== 'string') return null;
      return {
        bridge: 1,
        kind: 'insertImage',
        attachmentId: record.attachmentId,
        mime: record.mime,
        ...(typeof record.alt === 'string' ? { alt: record.alt } : {}),
      };
    case 'requestSubmit':
      return { bridge: 1, kind: 'requestSubmit' };
    case 'mentionResults': {
      if (typeof record.requestId !== 'string' || !Array.isArray(record.users)) return null;
      const users = record.users.filter(
        (user): user is MentionCandidate =>
          user !== null &&
          typeof user === 'object' &&
          typeof (user as { userId?: unknown }).userId === 'string' &&
          typeof (user as { name?: unknown }).name === 'string',
      );
      return { bridge: 1, kind: 'mentionResults', requestId: record.requestId, users };
    }
    // The note-lookup batch, mirroring `mentionResults` exactly: a partial
    // batch is still useful, so a malformed ENTRY is filtered out rather than
    // voiding the whole message, and a `candidates` that is not an array at all
    // is refused per-branch like every other partial message.
    case 'noteResults': {
      if (typeof record.requestId !== 'string' || !Array.isArray(record.candidates)) return null;
      const candidates = record.candidates.filter(
        (candidate): candidate is NoteLinkCandidate =>
          candidate !== null &&
          typeof candidate === 'object' &&
          typeof (candidate as { noteId?: unknown }).noteId === 'string' &&
          typeof (candidate as { title?: unknown }).title === 'string',
      );
      return { bridge: 1, kind: 'noteResults', requestId: record.requestId, candidates };
    }
    // The ticket-lookup batch (spec §14.4, Plan 7 Task 3), mirroring
    // `noteResults` exactly, four fields instead of two.
    case 'ticketResults': {
      if (typeof record.requestId !== 'string' || !Array.isArray(record.candidates)) return null;
      const candidates = record.candidates.filter(
        (candidate): candidate is TicketRefCandidate =>
          candidate !== null &&
          typeof candidate === 'object' &&
          typeof (candidate as { ticketId?: unknown }).ticketId === 'string' &&
          typeof (candidate as { projectId?: unknown }).projectId === 'string' &&
          typeof (candidate as { key?: unknown }).key === 'string' &&
          typeof (candidate as { title?: unknown }).title === 'string',
      );
      return { bridge: 1, kind: 'ticketResults', requestId: record.requestId, candidates };
    }
    case 'uploadFailed':
      if (typeof record.requestId !== 'string' || typeof record.message !== 'string') return null;
      return { bridge: 1, kind: 'uploadFailed', requestId: record.requestId, message: record.message };
    default:
      return null;
  }
}

export function serializeEditorMessage(message: EditorToHostMessage): string {
  return JSON.stringify(message);
}
