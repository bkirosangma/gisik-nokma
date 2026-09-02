import { isDocJson, type DocJson } from '../doc.js';
import type { MentionCandidate } from '../extensions/mention.js';

/** Protocol version — bump only with a coordinated Plan 10 change. */
export const EDITOR_BRIDGE_VERSION = 1 as const;

export type HostToEditorMessage =
  | { bridge: 1; kind: 'loadDoc'; doc: DocJson | null; editable: boolean }
  | { bridge: 1; kind: 'insertImage'; attachmentId: string; mime: string; alt?: string }
  | { bridge: 1; kind: 'requestSubmit' }
  | { bridge: 1; kind: 'mentionResults'; requestId: string; users: MentionCandidate[] }
  | { bridge: 1; kind: 'uploadFailed'; requestId: string; message: string };

export type EditorToHostMessage =
  | { bridge: 1; kind: 'ready' }
  | { bridge: 1; kind: 'change'; doc: DocJson }
  | { bridge: 1; kind: 'submit'; doc: DocJson }
  | { bridge: 1; kind: 'requestUpload'; requestId: string }
  | { bridge: 1; kind: 'mentionQuery'; requestId: string; query: string };

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
 *     `users` is not an array) — refused per-branch.
 *   - a `loadDoc.doc` that is present but not doc-shaped — refused via
 *     `isDocJson`, so a hostile or corrupt payload cannot smuggle an
 *     arbitrary object into `editor.commands.setContent`.
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
 *     (and never a spread of it) — so an unrecognised extra field is read
 *     by nothing and reaches nothing downstream. Tolerating it is not a gap
 *     in validation; it is the same discipline as refusing a wrong `kind`,
 *     applied one level down: forward-compatible against a host that later
 *     adds a field this bundle does not know about yet, with no way for
 *     that field to smuggle anything past the parser because it is never
 *     copied through.
 *   - `mentionResults.users` similarly parses if merely an array; a
 *     malformed entry inside it is filtered out below rather than voiding
 *     the whole message, since a partial batch of results is still useful
 *     and dropping one bad entry cannot forge a mention (`mentionAttrsOf`
 *     gates that at insertion, elsewhere in this package).
 *
 * ONE CATEGORY THIS FUNCTION DOES NOT SEE: "not JSON at all" — a raw string
 * that fails `JSON.parse`. That is handled one layer up, in `entry.tsx`'s
 * `message` event listener, which try/catches the parse and drops anything
 * that throws before this function is ever called. `entry.tsx` is the
 * untested DOM shim by design (see its own file for why), so that half of
 * "malformed" has no unit test here — the coverage for it is the shape of
 * the listener itself, not a red/green check.
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
