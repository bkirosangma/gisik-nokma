import { describe, expect, it } from 'vitest';
import { EDITOR_BRIDGE_VERSION, parseHostMessage, type HostToEditorMessage } from '@gisik-nokma/editor/webview-bridge';
import { parseEditorMessage, parseRawEditorMessage, serializeHostMessage } from './editor-bridge.js';

describe('editor bridge protocol — host side', () => {
  it('serialises a host→editor message as-is', () => {
    expect(serializeHostMessage({ bridge: 1, kind: 'requestSubmit' })).toBe(
      JSON.stringify({ bridge: 1, kind: 'requestSubmit' }),
    );
  });

  it('round-trips every host→editor kind through the REAL editor-side parser (packages/editor), not just this file\'s own inverse', () => {
    const messages: HostToEditorMessage[] = [
      { bridge: 1, kind: 'loadDoc', doc: null, editable: true },
      { bridge: 1, kind: 'loadDoc', doc: { type: 'doc', content: [] }, editable: false },
      { bridge: 1, kind: 'insertImage', attachmentId: 'a1', mime: 'image/png' },
      { bridge: 1, kind: 'requestSubmit' },
      { bridge: 1, kind: 'mentionResults', requestId: 'r1', users: [] },
      { bridge: 1, kind: 'uploadFailed', requestId: 'r1', message: 'boom' },
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
