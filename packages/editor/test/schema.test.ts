import { describe, expect, it, vi } from 'vitest';
import { Fragment, Slice } from '@tiptap/pm/model';
import { DOC_SCHEMA_VERSION, emptyDoc, isDocJson } from '../src/doc.js';
import { createTestEditor } from './helpers/create-editor.js';

/**
 * Document schema v1's vocabulary, stated once. The spec calls this set
 * CLOSED, so the assertions below are equalities, not containments: a node
 * or mark that appears without being named here is as much a defect as one
 * that goes missing. StarterKit ships extensions this product never chose
 * (v3.30.5 bundles `underline`), and a `toContain` check would let every one
 * of them into the stored document while staying green.
 *
 * Tasks 3 and 4 add `image` and `mention` here when they add them to the
 * schema. That edit is the point — a closed vocabulary should cost one line
 * to widen and should be impossible to widen by accident.
 */
const SCHEMA_V1_NODES = [
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
];

const SCHEMA_V1_MARKS = ['bold', 'italic', 'strike', 'code', 'link'];

describe('document schema v1', () => {
  it('exposes every node and mark the spec names', () => {
    const editor = createTestEditor();
    const nodes = Object.keys(editor.schema.nodes);
    const marks = Object.keys(editor.schema.marks);
    for (const node of SCHEMA_V1_NODES) {
      expect(nodes, `schema is missing node "${node}"`).toContain(node);
    }
    for (const mark of SCHEMA_V1_MARKS) {
      expect(marks, `schema is missing mark "${mark}"`).toContain(mark);
    }
    editor.destroy();
  });

  it('exposes NOTHING the spec does not name — the vocabulary is closed', () => {
    const editor = createTestEditor();
    expect(Object.keys(editor.schema.nodes).sort()).toEqual([...SCHEMA_V1_NODES].sort());
    expect(Object.keys(editor.schema.marks).sort()).toEqual([...SCHEMA_V1_MARKS].sort());
    editor.destroy();
  });

  it('stamps schemaVersion 1 into the serialized doc', () => {
    const editor = createTestEditor();
    const json = editor.getJSON() as { type: string; attrs?: { schemaVersion?: number } };
    expect(json.type).toBe('doc');
    expect(json.attrs?.schemaVersion).toBe(DOC_SCHEMA_VERSION);
    editor.destroy();
  });

  it('round-trips its own JSON byte-stably', () => {
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'GST filing' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'due ', marks: [] },
            { type: 'text', text: 'soon', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    });
    const first = editor.getJSON();
    editor.commands.setContent(first);
    expect(editor.getJSON()).toEqual(first);
    editor.destroy();
  });

  it('accepts a version-less doc (attrs default fills in)', () => {
    const editor = createTestEditor(undefined, { type: 'doc', content: [{ type: 'paragraph' }] });
    const json = editor.getJSON() as { attrs?: { schemaVersion?: number } };
    expect(json.attrs?.schemaVersion).toBe(1);
    editor.destroy();
  });

  it('planted defect: a doc claiming a node outside schema v1 is refused', () => {
    const editor = createTestEditor();
    expect(() =>
      editor.commands.setContent(
        { type: 'doc', content: [{ type: 'marquee', content: [] }] },
        { errorOnInvalidContent: true },
      ),
    ).toThrow();
    editor.destroy();
  });

  it('and without errorOnInvalidContent the same doc is stripped with only a console warning', () => {
    // The refusal above is only as load-bearing as the flag that produces it.
    // Without the flag Tiptap drops what it cannot parse and RETURNS NORMALLY,
    // so a caller that forgets the flag stores a document missing content the
    // user wrote. Pinned so the previous test cannot pass for some other reason.
    //
    // The warning is captured rather than left to stderr. It was printing a
    // twelve-line stack on every run, which is noise a reader learns to skip
    // past — and skipping past it is how the day it stops appearing goes
    // unnoticed. Asserting it turns the noise into the claim: Tiptap tells
    // nobody but the console, which is exactly why the flag has to be passed.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const editor = createTestEditor();
      editor.commands.setContent({ type: 'doc', content: [{ type: 'marquee', content: [] }] });
      expect(JSON.stringify(editor.getJSON())).not.toContain('marquee');
      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0]?.[0])).toContain('Invalid content');
      editor.destroy();
    } finally {
      warn.mockRestore();
    }
  });

  /**
   * The Produces contract says `heading (levels 1–6)` and nothing enforced it.
   * It takes TWO checks, because the clause spans two things that Tiptap keeps
   * entirely separate, and each is blind to the other's failure.
   *
   * What a document may STORE is not constrained by the `levels` option at all
   * — ProseMirror validates attribute names, not their values, so `level: 99`
   * round-trips intact even under `errorOnInvalidContent`, and so does level 6
   * with Heading configured to `levels: [1,2,3]`. That mutant was run and it
   * survived this round-trip case. Range enforcement, if it is ever wanted,
   * belongs at the server door; it cannot be done here.
   *
   * What the toolbar and input rules OFFER is the `levels` option, and that is
   * where narrowing would actually show up. So the option is asserted directly
   * below, and the round-trip case keeps the storage half honest — dropping
   * Heading from the schema fails both.
   */
  it('offers exactly the heading levels the contract names', () => {
    const editor = createTestEditor();
    const heading = editor.extensionManager.extensions.find((e) => e.name === 'heading');
    expect((heading?.options as { levels?: unknown } | undefined)?.levels).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    editor.destroy();
  });

  it('round-trips every heading level the contract names, 1 through 6', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const editor = createTestEditor();
      editor.commands.setContent(
        {
          type: 'doc',
          content: [{ type: 'heading', attrs: { level }, content: [{ type: 'text', text: 'H' }] }],
        },
        { errorOnInvalidContent: true },
      );
      const json = editor.getJSON() as {
        content?: Array<{ type?: string; attrs?: { level?: number } }>;
      };
      expect(json.content?.[0]?.type, `level ${level} did not survive as a heading`).toBe('heading');
      expect(json.content?.[0]?.attrs?.level, `level ${level} was altered`).toBe(level);
      editor.destroy();
    }
  });

  it('emptyDoc is a paragraph-bearing doc and isDocJson agrees', () => {
    const doc = emptyDoc();
    expect(isDocJson(doc)).toBe(true);
    expect(isDocJson({ type: 'paragraph' })).toBe(false);
    expect(isDocJson(null)).toBe(false);
    expect(isDocJson('doc')).toBe(false);
    const editor = createTestEditor(undefined, doc);
    expect(editor.getText()).toBe('');
    editor.destroy();
  });
});

/**
 * Set-equality above proves what a document may CONTAIN. It proves nothing
 * about what the editor DOES to a document, and that is the other half of a
 * schema origin: a library default can alter a user's content without adding
 * a single node or mark type, so no vocabulary check would ever see it.
 *
 * These cases exist because exactly that happened. `linkOnPaste` defaults to
 * true in @tiptap/extension-link@3.30.5 and the plan's verbatim config omits
 * it, so a URL pasted over selected text became link markup — two properties
 * away from the `autolink: false` that was set to prevent the typed version of
 * the same thing, and directly under a comment quoting spec §2's "nothing
 * silently becomes markup".
 */
describe('behavioural options that spec §2 constrains', () => {
  const PASTED_URL = 'https://gst.gov.in';

  function selectAllOf(text: string) {
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    editor.commands.selectAll();
    return editor;
  }

  it('registers no paste-to-link plugin at all', () => {
    // Structural, not just a config read: the option is only meaningful
    // because Link pushes `handlePasteLink` into the plugin list when it is
    // true. Asserting the plugin is absent proves the wiring is gone, where
    // asserting `options.linkOnPaste === false` would only echo the source.
    const editor = createTestEditor();
    const keys = editor.state.plugins.map((plugin) => String((plugin as { key?: unknown }).key));
    expect(keys.some((key) => key.startsWith('handlePasteLink'))).toBe(false);
    // Its typed sibling, for the same reason.
    expect(keys.some((key) => key.startsWith('autolink'))).toBe(false);
    editor.destroy();
  });

  it('leaves a URL pasted over a selection as literal text', () => {
    const editor = selectAllOf('the portal');
    const { view } = editor;
    const slice = new Slice(Fragment.from(view.state.schema.text(PASTED_URL)), 0, 0);
    const handled = view.someProp('handlePaste', (handler) =>
      handler(view, new Event('paste') as ClipboardEvent, slice),
    );
    expect(handled).toBeFalsy();
    expect(JSON.stringify(editor.getJSON())).not.toContain('"link"');
    editor.destroy();
  });

  it('keeps openOnClick and resizable at the values the schema origin chose', () => {
    // The rest of the resolved-option sweep found nothing else contradicting a
    // stated constraint; these two are the other options the plan sets on
    // purpose, pinned so a later edit cannot drop them silently.
    const editor = createTestEditor();
    const byName = new Map(editor.extensionManager.extensions.map((e) => [e.name, e.options]));
    expect((byName.get('link') as { openOnClick?: unknown } | undefined)?.openOnClick).toBe(false);
    expect((byName.get('link') as { autolink?: unknown } | undefined)?.autolink).toBe(false);
    expect((byName.get('link') as { linkOnPaste?: unknown } | undefined)?.linkOnPaste).toBe(false);
    expect((byName.get('link') as { markdownLinks?: unknown } | undefined)?.markdownLinks).toBe(
      false,
    );
    expect((byName.get('table') as { resizable?: unknown } | undefined)?.resizable).toBe(false);
    editor.destroy();
  });
});
