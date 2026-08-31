import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IMAGE_WRAP_MODES } from '../src/extensions/ticket-image.js';
import { createTestEditor } from './helpers/create-editor.js';

const IMG = '01J9GIMA000000000000000000';

function imageNodes(json: unknown): Array<{ attrs: Record<string, unknown> }> {
  const found: Array<{ attrs: Record<string, unknown> }> = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const record = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown };
    if (record.type === 'image') found.push({ attrs: record.attrs ?? {} });
    walk(record.content);
  };
  walk(json);
  return found;
}

describe('image node', () => {
  it('insertTicketImage inserts an image node with wrap defaulting to block', () => {
    const editor = createTestEditor();
    const ok = editor.commands.insertTicketImage({
      attachmentId: IMG,
      mime: 'image/png',
      alt: 'receipt',
    });
    expect(ok).toBe(true);
    const images = imageNodes(editor.getJSON());
    expect(images).toHaveLength(1);
    expect(images[0]!.attrs).toMatchObject({ attachmentId: IMG, wrap: 'block', alt: 'receipt' });
    editor.destroy();
  });

  it('planted defect (layer 1): a non-image mime is refused and the doc is untouched', () => {
    const editor = createTestEditor();
    const before = editor.getJSON();
    for (const mime of ['application/pdf', 'video/mp4', 'image/svg+xml', 'text/html']) {
      expect(
        editor.commands.insertTicketImage({ attachmentId: IMG, mime }),
        `${mime} must be refused`,
      ).toBe(false);
    }
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  /**
   * The brief validates `attrs.wrap` inside `insertTicketImage` and specifies
   * no test for it. A refusal with no failing test behind it is exactly the
   * defect class this branch keeps finding, so it gets one: the guard is a
   * SECOND refusal on the same command, independent of the mime guard, and
   * deleting either one has to turn a case red.
   */
  it('planted defect: insertTicketImage refuses a wrap outside the vocabulary', () => {
    const editor = createTestEditor();
    const before = editor.getJSON();
    expect(
      editor.commands.insertTicketImage({
        attachmentId: IMG,
        mime: 'image/png',
        wrap: 'float-up' as never,
      }),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it('setImageWrap updates the selected image and refuses invented modes', () => {
    const editor = createTestEditor();
    editor.commands.insertTicketImage({ attachmentId: IMG, mime: 'image/jpeg', wrap: 'block' });
    // Select the image node it just inserted.
    let imagePos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imagePos = pos;
      return imagePos === -1;
    });
    expect(imagePos).toBeGreaterThanOrEqual(0);
    editor.commands.setNodeSelection(imagePos);
    expect(editor.commands.setImageWrap('inline-left')).toBe(true);
    expect(imageNodes(editor.getJSON())[0]!.attrs.wrap).toBe('inline-left');
    // Planted defect: a wrap outside the vocabulary is refused.
    expect(editor.commands.setImageWrap('float-up' as never)).toBe(false);
    expect(imageNodes(editor.getJSON())[0]!.attrs.wrap).toBe('inline-left');
    editor.destroy();
  });

  it('renders src via resolveAttachmentUrl and a BEM wrap class', () => {
    const editor = createTestEditor({ resolveAttachmentUrl: (id) => `/test-url/${id}` });
    editor.commands.insertTicketImage({
      attachmentId: IMG,
      mime: 'image/webp',
      wrap: 'inline-right',
      alt: 'shelf',
    });
    const html = editor.getHTML();
    expect(html).toContain(`src="/test-url/${IMG}"`);
    expect(html).toContain(`data-attachment-id="${IMG}"`);
    expect(html).toContain('editor-image--inline-right');
    expect(html).toContain('alt="shelf"');
    editor.destroy();
  });

  /**
   * The default route lives in `addOptions` and is stated ONCE; the schema
   * origin does not restate it. Both shapes of "no resolver" are driven,
   * because they are not the same shape to `configure`: `mergeDeep` (core
   * dist:4654-4661) copies every key of its source, so an explicit
   * `undefined` REPLACES the default and the render throws "not a function".
   * `exactOptionalPropertyTypes` is off, so
   * `{ resolveAttachmentUrl: props.maybeUndefined }` — the ordinary way a
   * React host forwards an optional prop — type-checks straight into it.
   */
  it('falls back to the default resolver whether the option is absent or undefined', () => {
    for (const options of [{}, { resolveAttachmentUrl: undefined }]) {
      const editor = createTestEditor(options);
      editor.commands.insertTicketImage({ attachmentId: IMG, mime: 'image/png' });
      expect(editor.getHTML(), JSON.stringify(options)).toContain(
        `src="/v1/attachments/${IMG}"`,
      );
      editor.destroy();
    }
  });

  it('renders no src at all for an image node carrying no attachmentId', () => {
    // Reachable from junk doc JSON: attribute defaults fill in, so the node
    // exists with `attachmentId: null`. Fabricating `/v1/attachments/null`
    // would turn a malformed document into a real request.
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [{ type: 'image' }],
    });
    const html = editor.getHTML();
    expect(html).toContain('editor-image');
    expect(html).not.toContain('src=');
    editor.destroy();
  });

  it('round-trips through JSON with attrs intact', () => {
    const editor = createTestEditor();
    editor.commands.insertTicketImage({
      attachmentId: IMG,
      mime: 'image/png',
      wrap: 'inline-left',
      alt: 'a',
    });
    const json = editor.getJSON();
    editor.commands.setContent(json);
    expect(editor.getJSON()).toEqual(json);
    editor.destroy();
  });

  /**
   * THE PARSE PATH IS A THIRD DOOR INTO `wrap`, AND IT IS THE ONE A HOSTILE
   * DOCUMENT USES. Both commands validate; parsed HTML reaches the same
   * attribute without passing either.
   *
   * The brief validated it in the node-level `parseHTML().getAttrs`, which
   * does not work: `injectExtensionAttributesToParseRule`
   * (@tiptap/core@3.30.5 dist:1452-1472) spreads the per-attribute results
   * AFTER `getAttrs`'s, and the per-attribute default is
   * `fromString(node.getAttribute('wrap'))` — so a bare `wrap` attribute
   * silently overrides the validated one. The brief's own `renderHTML` emitted
   * that bare attribute, because an `addAttributes` entry with no `renderHTML`
   * is written out under its own name. Validation therefore has to live in the
   * per-attribute `parseHTML`, which is the last writer.
   */
  it('planted defect: a bare `wrap` attribute cannot outrank the validated one', () => {
    const editor = createTestEditor();
    editor.commands.setContent(
      `<img data-attachment-id="${IMG}" data-wrap="block" wrap="float-up" alt="hostile">`,
    );
    const images = imageNodes(editor.getJSON());
    expect(images).toHaveLength(1);
    expect(images[0]!.attrs.wrap).toBe('block');
    editor.destroy();
  });

  it('coerces an unknown data-wrap to the default rather than storing it', () => {
    const editor = createTestEditor();
    editor.commands.setContent(`<img data-attachment-id="${IMG}" data-wrap="float-up">`);
    expect(imageNodes(editor.getJSON())[0]!.attrs.wrap).toBe('block');
    editor.destroy();
  });

  it('serializes each attribute under exactly one name', () => {
    // The render half of the same defect: a duplicate, unvalidated spelling of
    // an attribute in the HTML is a second origin for the doc's own state.
    const editor = createTestEditor();
    editor.commands.insertTicketImage({
      attachmentId: IMG,
      mime: 'image/gif',
      wrap: 'inline-left',
      alt: 'x',
    });
    const html = editor.getHTML();
    expect(html).toContain('data-wrap="inline-left"');
    expect(html).not.toMatch(/\swrap=/);
    expect(html).not.toMatch(/\sattachmentid=/i);
    editor.destroy();
  });

  it('survives a full HTML round trip with every attr intact', () => {
    const editor = createTestEditor();
    editor.commands.insertTicketImage({
      attachmentId: IMG,
      mime: 'image/png',
      wrap: 'inline-right',
      alt: 'the receipt',
    });
    const json = editor.getJSON();
    editor.commands.setContent(editor.getHTML());
    expect(imageNodes(editor.getJSON())).toEqual(imageNodes(json));
    editor.destroy();
  });

  /**
   * THE JSON DOOR IS LEFT OPEN ON PURPOSE (the node's docblock says why: a
   * ProseMirror `validate` is available and forwarded, but it throws at load,
   * so layer 3 rejects and layer 1 coerces). What must NOT survive that choice
   * is the node emitting two spellings of one fact that DISAGREE — the exact
   * thing the per-attribute `renderHTML` was introduced to kill. A stored
   * `wrap: 'float-up'` renders one coerced answer in both places or neither.
   */
  it('renders a coerced wrap in both spellings when the stored one is junk', () => {
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [{ type: 'image', attrs: { attachmentId: IMG, wrap: 'float-up', alt: '' } }],
    });
    // The stored attribute is untouched — the JSON door really is open.
    expect(imageNodes(editor.getJSON())[0]!.attrs.wrap).toBe('float-up');
    const html = editor.getHTML();
    expect(html).toContain('data-wrap="block"');
    expect(html).toContain('editor-image--block');
    expect(html).not.toContain('float-up');
    editor.destroy();
  });

  /**
   * THE STYLESHEET IS A FOURTH SPELLING OF THE VOCABULARY and the only one
   * TypeScript cannot see. `renderHTML` builds the class from the attribute
   * (`editor-image--${wrap}`), so a mode added to `IMAGE_WRAP_MODES` without a
   * matching rule renders an unstyled image and nothing goes red — the
   * quietest possible failure, since the markup is correct and only the
   * appearance is missing.
   *
   * Set-equality in both directions, for the same reason schema.test.ts uses
   * it: a rule for a mode that no longer exists is dead CSS nobody deletes.
   * `fileURLToPath(import.meta.url)` then `resolve`, rather than
   * `new URL('…', import.meta.url)`, because Vite statically rewrites the
   * latter under Vitest — the reason is written out in
   * packages/ui/test/helpers/colour-scan.ts.
   */
  it('the stylesheet carries a wrap rule for exactly the vocabulary', () => {
    const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles/editor.css');
    const css = readFileSync(cssPath, 'utf8');
    const declared = [...css.matchAll(/\.editor-image--([a-z-]+)\s*\{/g)].map((match) => match[1]!);
    expect(declared.sort()).toEqual([...IMAGE_WRAP_MODES].sort());
    // And the unmodified base class every mode is layered on.
    expect(css).toMatch(/\.editor-image\s*\{/);
  });
});
