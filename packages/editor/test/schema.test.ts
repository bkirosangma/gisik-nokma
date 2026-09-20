import { describe, expect, it, vi } from 'vitest';
import { Fragment, Slice } from '@tiptap/pm/model';
import { DOC_SCHEMA_VERSION, emptyDoc, isDocJson } from '../src/doc.js';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

/**
 * Document schema v1's vocabulary, stated once. The spec calls this set
 * CLOSED, so the assertions below are equalities, not containments: a node
 * or mark that appears without being named here is as much a defect as one
 * that goes missing. StarterKit ships extensions this product never chose
 * (v3.30.5 bundles `underline`), and a `toContain` check would let every one
 * of them into the stored document while staying green.
 *
 * `image` arrived with Task 3 and was added here in the same change set;
 * Task 4 adds `mention` the same way. That edit is the point — a closed
 * vocabulary should cost one line to widen and should be impossible to widen
 * by accident.
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
  'image',
  'mention',
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

  /**
   * 9.37 — the node and mark vocabulary of the built extension list is pinned by SET equality, not containment, so an extension adding an unnamed node or mark fails here.
   */
  it('exposes NOTHING the spec does not name — the vocabulary is closed', () => {
    const editor = createTestEditor();
    expect(Object.keys(editor.schema.nodes).sort()).toEqual([...SCHEMA_V1_NODES].sort());
    expect(Object.keys(editor.schema.marks).sort()).toEqual([...SCHEMA_V1_MARKS].sort());
    editor.destroy();
  });

  /**
   * 9.38 — `VersionedDocument` stamps `schemaVersion 1` into the serialized doc.
   */
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
   * — `levels` is not a `validate` and Heading declares no `validate`, so
   * `level: 99` round-trips intact even under `errorOnInvalidContent`, and so
   * does level 6 with Heading configured to `levels: [1,2,3]`. That mutant was
   * run and it survived this round-trip case. (An attribute spec CAN validate
   * its value — `checkAttrs` runs it on every `Node.fromJSON` — so "it cannot
   * be done here" would be false; what is true is that it would THROW AT LOAD.
   * The trade is reasoned out in src/extensions/ticket-image.ts.) Range
   * enforcement, if it is ever wanted, is cheaper at the server door.
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

  /**
   * 9.36 — `isDocJson` accepts a `{type:'doc'}` object and refuses everything else; `emptyDoc()` round-trips through it.
   */
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

  function linkHrefsIn(doc: unknown): string[] {
    const hrefs: string[] = [];
    JSON.stringify(doc, (_key, value) => {
      const mark = value as { type?: unknown; attrs?: { href?: unknown } };
      if (mark && typeof mark === 'object' && mark.type === 'link') {
        if (typeof mark.attrs?.href === 'string') hrefs.push(mark.attrs.href);
      }
      return value;
    });
    return hrefs;
  }

  function selectAllOf(text: string) {
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    editor.commands.selectAll();
    return editor;
  }

  /**
   * 9.41 — the link lever really is shut where it can be: no paste-to-link plugin is registered at all, verified against the resolved plugin list rather than the option's documentation.
   */
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

  /**
   * Replicates the META-SETTING TAIL of `doPaste` (prosemirror-view@1.42.3
   * dist:3754-3765) — NOT the whole function. It consults `handlePaste` first
   * and, if that declines, dispatches the replacement with
   * `.setMeta('paste', true).setMeta('uiEvent', 'paste')`.
   *
   * What is skipped, deliberately: the real `doPaste` takes
   * `sliceSingleNode(slice)` and uses `replaceSelectionWith(singleNode,
   * preferPlain)` where that yields a node, and adds `scrollIntoView()`. This
   * helper always uses `replaceSelection(slice)` and never scrolls. Both are
   * outcome-equivalent for the single-text-node slices used here, and
   * `scrollIntoView` is a no-op in jsdom — but the difference is written down
   * rather than papered over with the word "full", because the meta is the only
   * part these tests actually depend on.
   *
   * BOTH HALVES ARE LOAD-BEARING and the second is the one an earlier version
   * of this test omitted. `handlePaste` is a synchronous prop; paste RULES run
   * from `pasteRulesPlugin`'s `appendTransaction`, gated on that `uiEvent`
   * meta, which `doPaste` sets only AFTER `handlePaste` declines. A test that
   * calls `someProp('handlePaste')` alone therefore cannot observe a paste
   * rule at all — it will report "no link was created" no matter what the
   * product does on that same keystroke.
   */
  function pasteInto(editor: ReturnType<typeof createTestEditor>, text: string): void {
    const { view } = editor;
    const slice = new Slice(Fragment.from(view.state.schema.text(text)), 0, 0);
    const handled = view.someProp('handlePaste', (handler) =>
      handler(view, new Event('paste') as ClipboardEvent, slice),
    );
    if (handled) return;
    view.dispatch(
      view.state.tr.replaceSelection(slice).setMeta('paste', true).setMeta('uiEvent', 'paste'),
    );
  }

  it('declines the paste in handlePaste — the linkOnPaste path really is shut', () => {
    const editor = selectAllOf('the portal');
    const { view } = editor;
    const slice = new Slice(Fragment.from(view.state.schema.text(PASTED_URL)), 0, 0);
    const handled = view.someProp('handlePaste', (handler) =>
      handler(view, new Event('paste') as ClipboardEvent, slice),
    );
    expect(handled).toBeFalsy();
    editor.destroy();
  });

  /**
   * DOCUMENTS CURRENT BEHAVIOUR, WHICH SPEC §2 DOES NOT WANT. Pending Task 5
   * (the escape-suggestion mechanic), which owns this decision.
   *
   * This case asserts that a pasted URL DOES become a link, because that is
   * what the product does. Its predecessor asserted the opposite and passed,
   * by driving an entry point that structurally cannot see the behaviour —
   * a green check certifying a property the product does not have, which is
   * this branch's named defect class with our own name on it.
   *
   * `Link.addPasteRules()` returns a plain-URL `markPasteRule`
   * unconditionally when `markdownLinks` is false, and no option here gates
   * it. When Task 5 closes this path, this test fails — and that failure is
   * the notification that the fix landed, which is exactly what it is for.
   * Flip the expectations then; do not delete the case.
   */
  /**
   * 9.42 — CURRENT BEHAVIOUR, pinned as current and not as desired: a pasted URL becomes a link anyway, because no value of `markdownLinks` stops the link extension's plain-URL paste rule.
   */
  it('CURRENT BEHAVIOUR pending Task 5: a pasted URL becomes a link anyway', () => {
    const overSelection = selectAllOf('the portal');
    pasteInto(overSelection, PASTED_URL);
    expect(linkHrefsIn(overSelection.getJSON())).toEqual([PASTED_URL]);
    overSelection.destroy();

    // Broader than the round-1 defect: `pasteHandler` returned early on an
    // empty selection, so this path catches a plain cursor that one missed.
    const bareCursor = createTestEditor(undefined, emptyDoc());
    pasteInto(bareCursor, PASTED_URL);
    expect(linkHrefsIn(bareCursor.getJSON())).toEqual([PASTED_URL]);
    bareCursor.destroy();

    // And a bare domain acquires a protocol it was never given. The `http`
    // comes from linkifyjs's own `find()` default inside `findPlainUrls`, not
    // from Link's `defaultProtocol` option.
    const bareDomain = createTestEditor(undefined, emptyDoc());
    pasteInto(bareDomain, 'gst.gov.in');
    expect(linkHrefsIn(bareDomain.getJSON())).toEqual(['http://gst.gov.in']);
    bareDomain.destroy();
  });

  /**
   * 9.95 — a TYPED `[text](url)` becomes a link, and the text survives as the link's
   * text. This is the behaviour the owner's 2026-09-20 ruling ("both") turned on by
   * reversing `markdownLinks`.
   *
   * ⚠ ASSERTED ON THE TYPING PATH AND NOT THE PASTE ONE, and that is the whole
   * design of the case: the sibling above MEASURES that a pasted plain URL becomes a
   * link at EITHER value of `markdownLinks`, so a case that pasted would stay green
   * with the option off and prove nothing about the reversal. `typeText` routes each
   * character through `handleTextInput`, which is where input rules — and only input
   * rules — fire.
   *
   * ⚠ AND IT RECORDS AN ASYMMETRY RATHER THAN ABSORBING IT: typing this link does NOT
   * offer the escape suggestion that `**due soon**` offers, even though both fire an
   * input rule and both are formatting the escape mechanic exists to let a user keep
   * literal. Measured, not inferred — a probe typed both and read
   * `getEscapeSuggestion` on each. **The cause is NOT established here, and this
   * comment says so rather than guessing at one.** Owner: whoever next touches
   * `extensions/escape-suggestion.ts`'s trigger coverage.
   */
  it('turns a TYPED [text](url) into a link, with its text intact', () => {
    const editor = createTestEditor(undefined, emptyDoc());
    typeText(editor, 'see [the doc](https://gst.gov.in) now');
    const json = editor.getJSON();

    expect(linkHrefsIn(json)).toEqual(['https://gst.gov.in']);
    // The link's TEXT is what the reader sees, and the syntax must not survive into
    // it: a rule that linked the whole literal would leave the brackets on screen.
    expect(JSON.stringify(json)).toContain('"text":"the doc"');
    expect(JSON.stringify(json)).not.toContain('[the doc]');
    // The prose around it is untouched, so the rule consumed the link and not the
    // sentence.
    expect(editor.state.doc.textContent).toBe('see the doc now');
    editor.destroy();
  });

  /**
   * The same path, and part of why Task 5's decision is bigger than links:
   * five configured extensions register seven paste rules between them
   * (`bold` 2, `italic` 2, `code` 1, `strike` 1, `link` 1). Its TYPED
   * sibling — eighteen input rules across ten extensions, behind
   * `enableInputRules` rather than `enablePasteRules` — is a disjoint rule
   * set: disabling either lever was verified to leave the other set firing,
   * so no single lever settles Task 5's decision. Census and dist citations
   * in src/schema/extensions.ts. Also pending Task 5; also flip rather than
   * delete.
   */
  it('CURRENT BEHAVIOUR pending Task 5: pasted markdown syntax becomes marks', () => {
    for (const [pasted, mark, text] of [
      ['**due soon**', 'bold', 'due soon'],
      ['*soon*', 'italic', 'soon'],
      ['`npm run gst`', 'code', 'npm run gst'],
      ['~~gone~~', 'strike', 'gone'],
    ] as const) {
      const editor = createTestEditor(undefined, emptyDoc());
      pasteInto(editor, pasted);
      const json = editor.getJSON() as {
        content?: Array<{ content?: Array<{ text?: string; marks?: Array<{ type?: string }> }> }>;
      };
      const leaf = json.content?.[0]?.content?.[0];
      expect(leaf?.text, `${pasted} should have lost its delimiters`).toBe(text);
      expect(leaf?.marks?.[0]?.type, `${pasted} should have become ${mark}`).toBe(mark);
      editor.destroy();
    }
  });

  /**
   * `enableContentCheck` IS THE HINGE OF A SHIPPED COMMENT and nothing pinned
   * it. `src/extensions/ticket-image.ts` explains why the `wrap` attribute
   * carries no ProseMirror `validate`, and the whole argument rests on what
   * this editor does when a document fails to load: `Editor` passes
   * `enableContentCheck` in as `errorOnInvalidContent` (core dist:6419 →
   * `createDocument` dist:1052-1058 → `createNodeFromContent` dist:592-602),
   * and on the false branch the catch does NOT rethrow — it warns once and
   * returns an empty document. A later task setting the option true would
   * silently falsify that comment, and it is the one falsification a reviewer
   * could not catch by reading, because the comment would still be internally
   * consistent.
   *
   * Asserted on the RESOLVED editor option, never on the absence of a key in
   * the helper's source: an absent key proves nothing about what Tiptap
   * resolved, and the gap between what a citation proves and what a sentence
   * claims is this paragraph's entire history.
   *
   * The second half is the consequence, driven rather than described, so the
   * pin and the comment cannot drift apart while both stay green. `marquee`
   * reaches the same catch a `validate` throw would — `schema.nodeType` throws
   * on an unknown type — so the path is the product's own, with no invented
   * validating node in it. Note WHAT is lost: two paragraphs the user wrote,
   * neither of which has anything to do with the node that failed.
   */
  it('resolves enableContentCheck false, and that is what empties an unloadable document', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const editor = createTestEditor();
      expect(editor.options.enableContentCheck).toBe(false);
      editor.destroy();

      const loaded = createTestEditor(undefined, {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'the GST receipt is attached' }] },
          { type: 'marquee' },
          { type: 'paragraph', content: [{ type: 'text', text: 'filed on the 20th' }] },
        ],
      });
      const json = loaded.getJSON() as { content?: unknown[] };
      expect(json.content).toEqual([{ type: 'paragraph' }]);
      expect(loaded.getText()).toBe('');
      expect(JSON.stringify(json)).not.toContain('GST');
      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0]?.[0])).toContain('Invalid content');
      loaded.destroy();
    } finally {
      warn.mockRestore();
    }
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
    // ⚠ REVERSED 2026-09-21 ON THE OWNER'S RULING ("both"), superseding the value
    // this line pinned until then. It read `false`, citing spec §2's "nothing
    // silently becomes markup" — but that option never delivered §2: a pasted plain
    // URL becomes a link at EITHER value, which the sibling case above MEASURES
    // rather than assumes. So the reversal does not weaken §2's hold; it widens what
    // a user can TYPE. src/schema/extensions.ts carries the full argument.
    expect((byName.get('link') as { markdownLinks?: unknown } | undefined)?.markdownLinks).toBe(
      true,
    );
    expect((byName.get('table') as { resizable?: unknown } | undefined)?.resizable).toBe(false);
    editor.destroy();
  });
});
