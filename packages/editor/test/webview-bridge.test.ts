import { describe, expect, it, vi } from 'vitest';
import { parseHostMessage, serializeEditorMessage, type EditorToHostMessage } from '../src/webview/bridge.js';
import { createEditorBridge } from '../src/webview/create-editor-bridge.js';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

const IMG = '01J9GATA000000000000000000';

function harness() {
  const posted: EditorToHostMessage[] = [];
  const editor = createTestEditor();
  const bridge = createEditorBridge({ editor, post: (message) => posted.push(message) });
  return { posted, editor, bridge };
}

describe('parseHostMessage', () => {
  /**
   * 9.77 — `parseHostMessage` accepts each of the five well-formed host-to-editor messages (`loadDoc`, `insertImage`, `requestSubmit`, `mentionResults`, `uploadFailed`), keyed off `kind`.
   */
  it('accepts each well-formed host message', () => {
    expect(parseHostMessage({ bridge: 1, kind: 'loadDoc', doc: { type: 'doc', content: [] }, editable: true })?.kind).toBe('loadDoc');
    expect(parseHostMessage({ bridge: 1, kind: 'insertImage', attachmentId: IMG, mime: 'image/png' })?.kind).toBe('insertImage');
    expect(parseHostMessage({ bridge: 1, kind: 'requestSubmit' })?.kind).toBe('requestSubmit');
    expect(parseHostMessage({ bridge: 1, kind: 'mentionResults', requestId: '1', users: [] })?.kind).toBe('mentionResults');
    expect(parseHostMessage({ bridge: 1, kind: 'uploadFailed', requestId: '1', message: 'x' })?.kind).toBe('uploadFailed');
  });

  /**
   * 9.78 — planted defect: a missing bridge version, a wrong version, an alien `kind`, a `kind` missing its required fields, and a `loadDoc.doc` that is not doc-shaped all answer `null` rather than throwing.
   */
  it('planted defect: malformed, versionless, and alien messages become null, never throws', () => {
    for (const junk of [
      null, undefined, 42, 'loadDoc', [],
      { kind: 'loadDoc' },                                  // missing bridge version
      { bridge: 2, kind: 'loadDoc', doc: null, editable: true }, // wrong version
      { bridge: 1, kind: 'formatHardDrive' },               // alien kind
      { bridge: 1, kind: 'insertImage' },                   // missing fields
      { bridge: 1, kind: 'loadDoc', doc: { type: 'paragraph' }, editable: true }, // non-doc payload
    ]) {
      expect(parseHostMessage(junk), JSON.stringify(junk)).toBeNull();
    }
  });
});

describe('createEditorBridge', () => {
  /**
   * 9.79 — `createEditorBridge` posts `{kind:'ready'}` as the first message on construction, before any host message has arrived.
   */
  it('announces ready on creation', () => {
    const { posted, editor } = harness();
    expect(posted[0]).toEqual({ bridge: 1, kind: 'ready' });
    editor.destroy();
  });

  /**
   * 9.80 — `loadDoc` replaces the editor's content and posts no `change` message for the replacement it just caused, so a host pushing a doc never sees its own push echoed back.
   */
  it('loadDoc replaces the content without echoing a change', () => {
    const { posted, editor, bridge } = harness();
    const before = posted.length;
    bridge.handleHostMessage({
      bridge: 1,
      kind: 'loadDoc',
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'from the host' }] }] },
      editable: true,
    });
    expect(editor.getText()).toContain('from the host');
    expect(posted.slice(before).filter((m) => m.kind === 'change')).toHaveLength(0);
    editor.destroy();
  });

  /**
   * 9.81 — typing in the bridged editor posts a `change` message per update carrying the serialized current doc — the onChange verb.
   */
  it('typing posts change messages with the serialized doc (onChange)', () => {
    const { posted, editor } = harness();
    typeText(editor, 'typed in the webview');
    const changes = posted.filter((m) => m.kind === 'change');
    expect(changes.length).toBeGreaterThan(0);
    expect(JSON.stringify(changes.at(-1))).toContain('typed in the webview');
    editor.destroy();
  });

  /**
   * 9.82 — `requestSubmit` answers with a `submit` message carrying the current doc — the onSubmit verb.
   */
  it('requestSubmit answers submit with the current doc (onSubmit)', () => {
    const { posted, editor, bridge } = harness();
    typeText(editor, 'the comment');
    bridge.handleHostMessage({ bridge: 1, kind: 'requestSubmit' });
    const submit = posted.filter((m) => m.kind === 'submit').at(-1);
    expect(JSON.stringify(submit)).toContain('the comment');
    editor.destroy();
  });

  /**
   * 9.83 — `insertImage` inserts an image node carrying the given `attachmentId` — the insertImage(attachmentId) verb.
   */
  it('insertImage inserts an image node (insertImage(attachmentId))', () => {
    const { editor, bridge } = harness();
    bridge.handleHostMessage({ bridge: 1, kind: 'insertImage', attachmentId: IMG, mime: 'image/png', alt: 'shelf' });
    expect(JSON.stringify(editor.getJSON())).toContain(IMG);
    editor.destroy();
  });

  /**
   * 9.84 — planted defect: `insertImage` with a non-image `mime` inserts nothing — layer 1's mime refusal holds unchanged when reached through the webview bridge.
   */
  it('planted defect: insertImage with a non-image mime inserts nothing (layer 1 holds inside the webview)', () => {
    const { editor, bridge } = harness();
    const before = editor.getJSON();
    bridge.handleHostMessage({ bridge: 1, kind: 'insertImage', attachmentId: IMG, mime: 'application/pdf' });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  /**
   * 9.85 — `requestUpload` posts the verb, and a `resolveMentions` query round-trips: the posted `mentionQuery`'s own `requestId` is the one a `mentionResults` reply must carry to resolve that pending promise.
   */
  it('requestUpload posts the verb; mention queries round-trip by requestId', async () => {
    const { posted, editor, bridge } = harness();
    bridge.requestUpload();
    expect(posted.some((m) => m.kind === 'requestUpload')).toBe(true);

    const pending = bridge.resolveMentions('an');
    const query = posted.filter((m) => m.kind === 'mentionQuery').at(-1) as { requestId: string; query: string };
    expect(query.query).toBe('an');
    bridge.handleHostMessage({
      bridge: 1,
      kind: 'mentionResults',
      requestId: query.requestId,
      users: [{ userId: '01J9GUSA000000000000000000', name: 'Anselma' }],
    });
    await expect(pending).resolves.toEqual([{ userId: '01J9GUSA000000000000000000', name: 'Anselma' }]);
    editor.destroy();
  });

  /**
   * 9.86 — hostile input fed to `handleHostMessage` never throws, and `dispose()` stops the change stream — typing after `dispose()` posts nothing further.
   */
  it('hostile input never throws and dispose stops the change stream', () => {
    const { posted, editor, bridge } = harness();
    expect(() => {
      bridge.handleHostMessage('�garbage�');
      bridge.handleHostMessage({ bridge: 1, kind: 'formatHardDrive' });
    }).not.toThrow();
    bridge.dispose();
    const before = posted.length;
    typeText(editor, 'after dispose');
    expect(posted.length).toBe(before);
    editor.destroy();
  });

  /**
   * 9.87 — `serializeEditorMessage` round-trips through `JSON.parse` stably — what goes in comes back out unchanged.
   */
  it('serializeEditorMessage is JSON.parse-stable', () => {
    const message: EditorToHostMessage = { bridge: 1, kind: 'mentionQuery', requestId: '7', query: 'an' };
    expect(JSON.parse(serializeEditorMessage(message))).toEqual(message);
  });
});
