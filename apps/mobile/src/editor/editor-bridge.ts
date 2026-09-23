import {
  EDITOR_BRIDGE_VERSION,
  type EditorToHostMessage,
  type HostToEditorMessage,
} from '@gisik-nokma/editor/webview-bridge';

/**
 * The HOST half of Plan 7's webview bridge protocol. `packages/editor`
 * exports the protocol types plus `parseHostMessage` (validates
 * host→editor messages, used INSIDE the webview bundle) and
 * `serializeEditorMessage` (serialises editor→host messages, same side).
 * Neither direction this file needs is exported: the mobile app is the
 * HOST, so it must SEND `HostToEditorMessage` (trivial — we construct these
 * ourselves, `JSON.stringify` is enough) and PARSE `EditorToHostMessage`
 * arriving from the webview, which has no exported validator on either
 * side of the bridge. This file is that missing half, scoped to this app
 * only — NOT added to `packages/editor`, because Task 16 (Tauri) may need
 * the identical function and duplicating a few lines here is cheaper and
 * safer during parallel lane execution than two lanes racing to edit the
 * same shared package file. Recorded in the executor handoff for whoever
 * next touches the bridge package.
 *
 * Validation mirrors `parseHostMessage`'s rigor: reject anything not
 * shaped like a known message rather than trusting `JSON.parse` output,
 * even though this app's own bundled webview content is the only sender
 * today.
 */
export function serializeHostMessage(message: HostToEditorMessage): string {
  return JSON.stringify(message);
}

type ChangeMessage = Extract<EditorToHostMessage, { kind: 'change' }>;
type SubmitMessage = Extract<EditorToHostMessage, { kind: 'submit' }>;

/**
 * `doc`'s real shape is `DocJson`, defined in `packages/editor/src/doc.ts`
 * as `isDocJson` checks it: an object, not null, not an array, with
 * `type === 'doc'`. Reimplemented here rather than imported — NOT because
 * of Tiptap/react-dom bundle weight (`doc.ts` has zero imports of its own,
 * so that concern does not actually apply to it), but because the narrow
 * `./webview-bridge` subpath does not re-export `isDocJson`/`DocJson`, and
 * adding that re-export means editing a file Task 16 (Tauri) may also be
 * touching in parallel. A prior version of this comment claimed a bundle
 * inflation risk that does not hold for this specific function; corrected
 * after an opus review caught the four-check gap this left (`{}`, `[]`
 * and `{type:'paragraph'}` all passed the old one-check version and would
 * have been persisted as a ticket comment body that the REAL `isDocJson`
 * — which every consumer downstream eventually reads through — refuses.
 * Nothing here reads inside `doc`'s content, matching the depth
 * `parseHostMessage`'s own `loadDoc` case draws for the same field.
 */
function isDocShaped(value: unknown): value is ChangeMessage['doc'] {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as { type?: unknown }).type === 'doc';
}

export function parseEditorMessage(raw: unknown): EditorToHostMessage | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.bridge !== EDITOR_BRIDGE_VERSION) return null;
  // THE DISCRIMINANT IS TYPED, AND ONLY THE DISCRIMINANT. `record.kind` is
  // `unknown` because this function validates untrusted JSON, and a switch on
  // `unknown` cannot be exhaustive — there is no `never` for a `default` to
  // assert. Naming the union here is a TYPE claim, not a runtime guard: a
  // value outside it still matches no `case` and reaches the `default`, which
  // refuses it, exactly as before. What it buys is the check below.
  const kind = record.kind as EditorToHostMessage['kind'];
  switch (kind) {
    case 'ready':
      return { bridge: 1, kind: 'ready' };
    case 'change':
      if (!isDocShaped(record.doc)) return null;
      return { bridge: 1, kind: 'change', doc: record.doc } satisfies ChangeMessage;
    case 'submit':
      if (!isDocShaped(record.doc)) return null;
      return { bridge: 1, kind: 'submit', doc: record.doc } satisfies SubmitMessage;
    case 'requestUpload':
      if (typeof record.requestId !== 'string') return null;
      return { bridge: 1, kind: 'requestUpload', requestId: record.requestId };
    case 'mentionQuery':
      if (typeof record.requestId !== 'string' || typeof record.query !== 'string') return null;
      return { bridge: 1, kind: 'mentionQuery', requestId: record.requestId, query: record.query };
    // The SECOND request/response pair (Plan 4's notes port). Named here
    // because the `default` arm REFUSES an unrecognised kind — which is right
    // for forward compatibility and was wrong for this one: the editor sent
    // `noteQuery` and this host dropped it, so the `[[` picker's pending
    // promise never settled. `editor-web-view.tsx` answers it.
    case 'noteQuery':
      if (typeof record.requestId !== 'string' || typeof record.query !== 'string') return null;
      return { bridge: 1, kind: 'noteQuery', requestId: record.requestId, query: record.query };
    // The THIRD request/response pair (Plan 7 Task 3), the same shape and the
    // same reason `noteQuery` needed one: an unrecognised kind is refused by
    // `default` below, which would drop this one silently and leave the
    // editor's `:ticket` picker pending forever.
    case 'ticketQuery':
      if (typeof record.requestId !== 'string' || typeof record.query !== 'string') return null;
      return { bridge: 1, kind: 'ticketQuery', requestId: record.requestId, query: record.query };
    default:
      // ⚠ EXHAUSTIVENESS MADE A COMPILE ERROR. This switch had NO such check,
      // and a kind added to `EditorToHostMessage` without a branch above was
      // matched by nothing and refused in silence — which is exactly what
      // happened to `noteQuery`, whose request then never settled and left the
      // editor's `[[` picker pending forever.
      //
      // At RUNTIME this branch still refuses an unknown kind, which is the
      // documented forward-compatibility path. At COMPILE TIME `kind` is
      // `never` only while every kind is handled above; add one and it becomes
      // a non-never, failing the build at the line that must decide what the
      // new kind does. MEASURED by adding a seventh kind to the union.
      kind satisfies never;
      return null;
  }
}

export function parseRawEditorMessage(raw: string): EditorToHostMessage | null {
  try {
    return parseEditorMessage(JSON.parse(raw));
  } catch {
    return null;
  }
}
