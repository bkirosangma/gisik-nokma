import { describe, expect, it } from 'vitest';
import { EDITOR_BRIDGE_VERSION, parseHostMessage, type HostToEditorMessage } from '@gisik-nokma/editor/webview-bridge';
import { parseEditorMessage, parseRawEditorMessage, serializeHostMessage } from './editor-bridge.js';

/**
 * 12.226 — parseEditorMessage (this file's host-side reader for the versioned {bridge,kind} editor→host protocol) parses all five EditorToHostMessage kinds (ready, change, submit, requestUpload, mentionQuery) and rejects, without throwing, a wrong bridge version, a missing version field, an unrecognised kind, a recognised kind missing its required field, a doc failing all four isDocJson checks, non-object/array payloads, and unparseable JSON strings — one clause per it() across this describe block.
 */
describe('editor bridge protocol — host side', () => {
  it('serialises a host→editor message as-is', () => {
    expect(serializeHostMessage({ bridge: 1, kind: 'requestSubmit' })).toBe(
      JSON.stringify({ bridge: 1, kind: 'requestSubmit' }),
    );
  });

  it('round-trips every host→editor kind through the REAL editor-side parser (packages/editor), not just this file\'s own inverse', () => {
    // ⚠ A `Record` KEYED BY `kind`, NOT A HAND-WRITTEN ARRAY, and the
    // difference is the whole point of this case's NAME. The array it replaced
    // was typed `HostToEditorMessage[]`, which does NOT force exhaustiveness —
    // and it had drifted: the case said "every host→editor kind" while omitting
    // `noteResults`, which Plan 4's notes port had added to the union. A
    // `Record<HostToEditorMessage['kind'], …>` makes a missing or unknown kind a
    // COMPILE ERROR — MEASURED: deleting one key gives `TS2741: Property
    // 'uploadFailed' is missing in type …` — so "every" is enforced by the type
    // rather than by a list somebody has to remember to extend.
    const oneOfEachKind: Record<HostToEditorMessage['kind'], HostToEditorMessage> = {
      loadDoc: { bridge: 1, kind: 'loadDoc', doc: null, editable: true },
      insertImage: { bridge: 1, kind: 'insertImage', attachmentId: 'a1', mime: 'image/png' },
      requestSubmit: { bridge: 1, kind: 'requestSubmit' },
      mentionResults: { bridge: 1, kind: 'mentionResults', requestId: 'r1', users: [] },
      noteResults: {
        bridge: 1,
        kind: 'noteResults',
        requestId: 'r2',
        candidates: [{ noteId: 'n1', title: 'Cold room' }],
      },
      ticketResults: {
        bridge: 1,
        kind: 'ticketResults',
        requestId: 'r3',
        candidates: [{ ticketId: 't1', projectId: 'p1', key: 'SHOP-7', title: 'Fix the freezer' }],
      },
      uploadFailed: { bridge: 1, kind: 'uploadFailed', requestId: 'r1', message: 'boom' },
    };
    const messages: HostToEditorMessage[] = [
      ...Object.values(oneOfEachKind),
      // A second `loadDoc`, because the interesting half of that kind is the
      // two shapes its `doc` takes and the Record can carry only one.
      { bridge: 1, kind: 'loadDoc', doc: { type: 'doc', content: [] }, editable: false },
    ];
    for (const message of messages) {
      expect(parseHostMessage(JSON.parse(serializeHostMessage(message)))).toEqual(message);
    }
  });

  it('parses each known editor→host message kind', () => {
    expect(parseEditorMessage({ bridge: 1, kind: 'ready' })).toEqual({ bridge: 1, kind: 'ready' });
    const doc = { type: 'doc', content: [] };
    expect(parseEditorMessage({ bridge: 1, kind: 'change', doc })).toEqual({ bridge: 1, kind: 'change', doc });
    expect(parseEditorMessage({ bridge: 1, kind: 'submit', doc })).toEqual({ bridge: 1, kind: 'submit', doc });
    expect(parseEditorMessage({ bridge: 1, kind: 'requestUpload', requestId: 'r1' })).toEqual({
      bridge: 1,
      kind: 'requestUpload',
      requestId: 'r1',
    });
    expect(parseEditorMessage({ bridge: 1, kind: 'mentionQuery', requestId: 'r2', query: 'ki' })).toEqual({
      bridge: 1,
      kind: 'mentionQuery',
      requestId: 'r2',
      query: 'ki',
    });
    // `noteQuery` is the SECOND request/response pair the editor can send, and
    // this host IGNORED it until Plan 4's closing audit: the kind was added to
    // the protocol for the notes editor's `[[` picker, and a host that does not
    // name it falls to `default: return null` — so the request was dropped and
    // the picker's pending promise never settled. The sibling arm's own comment
    // states the rule ("an unanswered mentionQuery leaves the popup pending
    // forever — always reply in-protocol"); this pair needed it too.
    expect(parseEditorMessage({ bridge: 1, kind: 'noteQuery', requestId: 'r3', query: 'co' })).toEqual({
      bridge: 1,
      kind: 'noteQuery',
      requestId: 'r3',
      query: 'co',
    });
  });

  it('refuses a noteQuery missing its query, like every other partial message', () => {
    expect(parseEditorMessage({ bridge: 1, kind: 'noteQuery', requestId: 'r3' })).toBeNull();
    expect(parseEditorMessage({ bridge: 1, kind: 'noteQuery', query: 'co' })).toBeNull();
  });

  it('rejects the wrong bridge version rather than coercing it', () => {
    expect(parseEditorMessage({ bridge: 2, kind: 'ready' })).toBeNull();
    expect(parseEditorMessage({ kind: 'ready' })).toBeNull();
  });

  it('rejects an unknown kind — the tolerated-forward-compat case', () => {
    expect(parseEditorMessage({ bridge: EDITOR_BRIDGE_VERSION, kind: 'somethingNewer' })).toBeNull();
  });

  it('rejects a recognised kind missing its required field', () => {
    expect(parseEditorMessage({ bridge: 1, kind: 'change' })).toBeNull();
    expect(parseEditorMessage({ bridge: 1, kind: 'requestUpload' })).toBeNull();
    expect(parseEditorMessage({ bridge: 1, kind: 'mentionQuery', requestId: 'r1' })).toBeNull();
  });

  it('rejects a `doc` that is not doc-shaped, matching the real isDocJson boundary exactly', () => {
    // An opus review caught the first version of this check accepting all three —
    // it tested "is this a non-null object" only, one check short of isDocJson's
    // four (object, non-null, not-array, type === 'doc'). A `change`/`submit`
    // carrying any of these would have been persisted as a comment body that
    // packages/editor's own real validator refuses on the next load.
    for (const doc of [[], {}, { type: 'paragraph' }]) {
      expect(parseEditorMessage({ bridge: 1, kind: 'change', doc })).toBeNull();
      expect(parseEditorMessage({ bridge: 1, kind: 'submit', doc })).toBeNull();
    }
  });

  it('rejects non-object and array payloads without throwing', () => {
    expect(parseEditorMessage('not an object')).toBeNull();
    expect(parseEditorMessage(null)).toBeNull();
    expect(parseEditorMessage([1, 2, 3])).toBeNull();
  });

  it('parseRawEditorMessage parses a JSON string and rejects noise without throwing', () => {
    expect(parseRawEditorMessage(JSON.stringify({ bridge: 1, kind: 'ready' }))).toEqual({ bridge: 1, kind: 'ready' });
    expect(parseRawEditorMessage('not json')).toBeNull();
    expect(parseRawEditorMessage(JSON.stringify({ bridge: 1, kind: 'unknown' }))).toBeNull();
  });
});
