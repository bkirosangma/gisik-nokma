import { describe, expect, it } from 'vitest';
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

  it('and without errorOnInvalidContent the same doc is silently stripped', () => {
    // The refusal above is only as load-bearing as the flag that produces it.
    // Without the flag Tiptap drops what it cannot parse and reports nothing,
    // so a caller that forgets the flag stores a document missing content the
    // user wrote. Pinned so the previous test cannot pass for some other reason.
    const editor = createTestEditor();
    editor.commands.setContent({ type: 'doc', content: [{ type: 'marquee', content: [] }] });
    expect(JSON.stringify(editor.getJSON())).not.toContain('marquee');
    editor.destroy();
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
