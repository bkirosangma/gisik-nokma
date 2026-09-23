import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';
import { wikiLinkResultAnnouncement } from '../src/extensions/wiki-link-popup.js';

/**
 * 9.276–9.279 — spec §8.5, wiki-links to notes.
 *
 * The four cases split by CONCERN, not by node: 9.276 is the `[[` suggestion
 * and the insertion, 9.277/9.278 are the three rendering outcomes of the
 * resolver, and 9.279 is what the document actually STORES. The last is
 * separate on purpose — the rendered text and the stored attrs are two
 * different answers to "what is this link", and a change that swapped one for
 * the other (storing the resolved title, say) would leave every rendering case
 * green while making the document wrong.
 */
/**
 * THE POPUP AND THE HOVER CARD LIVE ON `document.body`, NOT IN THE EDITOR'S
 * OWN DOM, so a case that throws before its `editor.destroy()` leaves one
 * behind — and the NEXT case then fails for a reason that is not its subject.
 * Observed: a mutation failed 9.276 early and 9.297's "no popup opened" arm
 * found the abandoned popup and went red too, which reads as one mutation
 * killing two cases when it killed one.
 *
 * Cleaning up here makes each case independent of the previous one's
 * cleanliness, so a failure names its own cause.
 */
afterEach(() => {
  for (const el of document.querySelectorAll('.wikilink-popup, .wikilink-preview')) el.remove();
});

const NOTES = [
  { noteId: 'n1', title: 'Cold room' },
  { noteId: 'n2', title: 'Compressor log' },
];

/**
 * `asJson(editor)` types its `content` as Tiptap's `Content` union
 * (`NodeType | TextType`), so reading a CHILD's `content` or `attrs` off it is
 * a type error even though the runtime object has them. The cast is local and
 * named rather than sprinkled: this is the shape the assertions below read.
 */
type Json = { type?: string; attrs?: Record<string, unknown>; content?: Json[]; text?: string };

function asJson(node: { getJSON(): unknown }): Json {
  return node.getJSON() as Json;
}

describe('9.276-9.279 wiki-links', () => {
  it('9.276 [[ opens the suggestion; Enter inserts the node; Escape keeps the text', async () => {
    const queryNotes = vi.fn(async (q: string) =>
      NOTES.filter((n) => n.title.toLowerCase().includes(q.toLowerCase())),
    );
    const editor = createTestEditor({ queryNotes });
    typeText(editor, 'see [[co');
    await vi.waitFor(() => {
      expect(queryNotes).toHaveBeenCalledWith('co');
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.wikilink-popup')).not.toBeNull();
    });
    // ⚠ WAITING FOR THE POPUP IS NOT WAITING FOR ITS ROWS, and the difference
    // is the whole case. `onStart` creates the container the moment `[[` is
    // typed; the candidates arrive a microtask later, and until they do the
    // popup's `onKeyDown` DECLINES every key by design (an empty list means
    // nothing to navigate — see `wiki-link-popup.ts`). Pressing Enter in that
    // window falls through to the base keymap and SPLITS THE PARAGRAPH. So the
    // case waits for a row.
    await vi.waitFor(() => {
      expect(document.querySelector('.wikilink-popup__item')).not.toBeNull();
    });
    // THE STATUS LINE THE POPUP ANNOUNCES, asserted against the RENDERED
    // element as well as as a function — the mention popup's counterpart is
    // tested this way, and its docblock says why it exists as "a function with
    // a test rather than three template literals": it is screen-reader-only
    // copy, which is the kind that rots unnoticed. This one shipped WITHOUT
    // one while claiming "the same reason as `mentionResultAnnouncement`",
    // found by the plan-close audit. 'co' matches both fixture notes.
    expect(document.querySelector('.wikilink-popup__status')?.textContent).toBe('2 notes match');
    expect(wikiLinkResultAnnouncement(0)).toBe('No notes match');
    expect(wikiLinkResultAnnouncement(1)).toBe('1 note matches');
    expect(wikiLinkResultAnnouncement(2)).toBe('2 notes match');
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const para = asJson(editor).content?.[0];
    const link = para?.content?.find((n) => n.type === 'wikiLink');
    expect(link?.attrs).toEqual({ noteId: 'n1', title: 'Cold room' });
    // THE TRAILING SPACE the case's own text names, and which the first cut
    // did not assert: without it the next word the reader types is glued to
    // the link.
    expect(editor.getText()).toBe('see Cold room ');
    editor.commands.clearContent();
    typeText(editor, '[[co');
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(editor.getText()).toBe('[[co');
    editor.destroy();
  });

  /**
   * THE THREE RENDERINGS, in one case, because they are three answers to one
   * question and the interesting property is that they are DISTINGUISHED: a
   * node view that always showed the stored title would pass the second arm
   * and fail the first, and one that always linked would pass the first two
   * and fail the third.
   */
  it('9.277/9.278 rendering follows the resolver: live title, stored title, or the missing pill', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Old title' } }],
        },
      ],
    };
    const live = createTestEditor({ resolveNoteTitle: () => 'New title' }, doc);
    expect(live.view.dom.querySelector('a.editor-wikilink')?.textContent).toBe('New title');
    expect(live.view.dom.querySelector('a.editor-wikilink')?.getAttribute('href')).toBe('/notes/n1');
    live.destroy();

    // No resolver at all: the STORED title is the best available answer, and it
    // is still a link — the target may be perfectly readable, this editor just
    // cannot check.
    const plain = createTestEditor(undefined, doc);
    expect(plain.view.dom.querySelector('a.editor-wikilink')?.textContent).toBe('Old title');
    plain.destroy();

    const missing = createTestEditor({ resolveNoteTitle: () => null }, doc);
    const pill = missing.view.dom.querySelector('.editor-wikilink--missing');
    expect(pill?.tagName).toBe('SPAN');
    expect(pill?.getAttribute('href')).toBeNull();
    expect(pill?.textContent).toBe('Old title');
    missing.destroy();
  });

  it('9.279 the stored attrs are exactly noteId and title', () => {
    const editor = createTestEditor();
    editor.commands.insertWikiLink({ noteId: 'n2', title: 'Compressor log' });
    const link = asJson(editor).content?.[0]?.content?.find((n) => n.type === 'wikiLink');
    expect(Object.keys(link?.attrs ?? {}).sort()).toEqual(['noteId', 'title']);
    editor.destroy();
  });

  /**
   * THE HTML → DOCUMENT DIRECTION, which had no witness: 9.277/9.278 build a
   * document from JSON and read the DOM, and nothing went the other way. The
   * mention node has exactly this case ("survives a full HTML round trip with
   * both attrs intact"), so the omission is a gap rather than a decision.
   *
   * It is the direction a PASTE takes — `data-note-id` is the parse
   * discriminator — and the anchor the node renders is the HTML a host would
   * hand back.
   */
  /**
   * ⚠ A CROSS-NODE TABLE LIVING IN A WIKI-LINK FILE, and the placement is a
   * judgement rather than an accident: this port's case block (9.261–9.300) is
   * fully allocated, and taking an id outside it risks colliding with Plan 5's
   * allocation — which this lane cannot check. So the property is guarded HERE,
   * in the case that found the defect class, and the case text says so.
   *
   * WHAT IT GUARDS. The note link's loss was an ATTRIBUTE loss (the id survived
   * only inside the href), so the generalisation worth pinning is "every v2
   * node's attributes survive HTML", not just "the node types do". Measured
   * across the whole set before this arm existed: all five are byte-identical.
   * The next change to any parse rule in this schema now has somewhere to fail.
   */
  it('9.279 every v2 node survives an HTML round trip with its attributes intact', () => {
    const cases: Array<[string, unknown]> = [
      [
        'taskItem.checked=true',
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }],
            },
          ],
        },
      ],
      [
        'taskItem.checked=false',
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'todo' }] }],
            },
          ],
        },
      ],
      [
        'details.open=true',
        {
          type: 'details',
          attrs: { open: true },
          content: [
            { type: 'detailsSummary', content: [{ type: 'text', text: 'S' }] },
            {
              type: 'detailsContent',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }],
            },
          ],
        },
      ],
      ['codeBlock.language', { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'x' }] }],
      [
        'image.attrs',
        {
          type: 'image',
          attrs: { attachmentId: '01J9GIMA000000000000000000', wrap: 'inline-left', alt: 'a' },
        },
      ],
    ];
    for (const [name, node] of cases) {
      const editor = createTestEditor(undefined, { type: 'doc', content: [node] });
      const before = JSON.stringify((asJson(editor).content ?? [])[0]);
      editor.commands.setContent(editor.getHTML());
      const after = JSON.stringify((asJson(editor).content ?? [])[0]);
      expect(after, `${name} changed across an HTML round trip`).toBe(before);
      editor.destroy();
    }
  });

  it('9.279 a rendered link round-trips back through HTML with both attrs intact', () => {
    const editor = createTestEditor(
      { resolveNoteTitle: () => 'Cold room' },
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Cold room' } }] }] },
    );
    const html = editor.getHTML();
    expect(html).toContain('data-note-id="n1"');
    editor.commands.setContent(html);
    const link = asJson(editor).content?.[0]?.content?.find((n) => n.type === 'wikiLink');
    expect(link?.attrs).toEqual({ noteId: 'n1', title: 'Cold room' });
    editor.destroy();
  });
});

/**
 * 9.307–9.308 — Plan 7 Task 2 (spec §14, D26): a SECOND trigger, `:note`, on
 * the same `wikiLink` node — inserted through the same command, rendered by
 * the same node view, offered by the same popup.
 */
describe('9.307-9.308 the :note trigger on wiki-links', () => {
  it('9.307 :note co opens the same picker and inserts the same node [[co would; [[ still works', async () => {
    const queryNotes = vi.fn(async (q: string) =>
      NOTES.filter((n) => n.title.toLowerCase().includes(q.toLowerCase())),
    );
    let editor!: ReturnType<typeof createTestEditor>;
    // THE MUTATION THIS CASE NAMES throws here: two `Suggestion` plugins
    // sharing one `PluginKey` fail at ProseMirror construction time.
    expect(() => {
      editor = createTestEditor({ queryNotes });
    }).not.toThrow();

    // CONTROL: `[[` is untouched by the second plugin's addition.
    typeText(editor, 'a [[co');
    await vi.waitFor(() => {
      expect(document.querySelector('.wikilink-popup__item')).not.toBeNull();
    });
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const bracketLink = asJson(editor).content?.[0]?.content?.find((n) => n.type === 'wikiLink');
    expect(bracketLink?.attrs).toEqual({ noteId: 'n1', title: 'Cold room' });
    editor.commands.clearContent();

    typeText(editor, ':note co');
    await vi.waitFor(() => {
      expect(queryNotes).toHaveBeenCalledWith('co');
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.wikilink-popup__item')).not.toBeNull();
    });
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const noteTriggerLink = asJson(editor).content?.[0]?.content?.find((n) => n.type === 'wikiLink');
    expect(noteTriggerLink?.attrs).toEqual({ noteId: 'n1', title: 'Cold room' });
    editor.destroy();
  });

  it('9.308 :notebook in prose opens nothing', async () => {
    const queryNotes = vi.fn(async () => NOTES);
    const editor = createTestEditor({ queryNotes });
    typeText(editor, 'read the :notebook please');
    await Promise.resolve();
    await Promise.resolve();
    expect(queryNotes).not.toHaveBeenCalledWith('book');
    await vi.waitFor(() => {
      expect(document.querySelector('.wikilink-popup')).toBeNull();
    });
    editor.destroy();
  });
});

/**
 * 9.297 — `[[` INSIDE A CODE BLOCK.
 *
 * The same review that found 9.296 measured this one rather than assuming it:
 * typing `[[co` with the caret in a code block DID call `queryNotes` and DID
 * open the popup, and `insertWikiLink` then split the block exactly as the
 * markdown paste did. Two things are wrong with that beyond the split — `[[`
 * in code is literal text, and a note picker over a shell snippet is a
 * suggestion nobody asked for.
 *
 * The gate is `@tiptap/suggestion`'s own `allow`, so no popup opens at all;
 * `insertWikiLink` refuses independently, because it is a public command and a
 * host may call it directly.
 */
describe('9.297 no note picker inside a code block', () => {
  it('9.297 the suggestion does not open in a code block, and insertWikiLink refuses', async () => {
    const queryNotes = vi.fn(async () => [{ noteId: 'n1', title: 'Cold room' }]);
    const editor = createTestEditor(
      { queryNotes },
      { type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }] },
    );
    typeText(editor, ' [[co');
    await Promise.resolve();
    await Promise.resolve();
    expect(queryNotes).not.toHaveBeenCalled();
    expect(document.querySelector('.wikilink-popup')).toBeNull();

    // …and the COMMAND refuses too. `[[` stays literal text in the block.
    editor.commands.insertWikiLink({ noteId: 'n1', title: 'Cold room' });
    const json = asJson(editor);
    // One code block, intact. The empty paragraph behind it is
    // `TrailingNode`'s, which keeps a paragraph as a document's last block.
    expect(json.content?.[0]?.type).toBe('codeBlock');
    expect(JSON.stringify(json)).not.toContain('wikiLink');
    expect(JSON.stringify(json)).not.toContain('Cold room');
    editor.destroy();
  });
});

/**
 * 9.300 — THE HOVER CARD. Spec §8.5 names it, the plan's Interfaces name
 * `previewNote`, and the plan allocated no case to it: `attachHoverPreview`
 * shipped with no witness. Minted from the block's last spare id.
 *
 * The delay is the case's spine. A card that opened on `mouseenter` would
 * satisfy every assertion about its CONTENT while firing a fetch at every
 * pointer that crossed a link — so the assertions below are ordered around the
 * 400 ms boundary: nothing at 399, the card after it, and a fetch count of
 * zero for a pointer that leaves early.
 */
describe('9.300 the note-link hover card', () => {
  it('9.300 shows the first 200 characters after 400 ms, nothing on null, and no fetch on an early leave', async () => {
    vi.useFakeTimers();
    try {
      const long = 'x'.repeat(300);
      const previewNote = vi.fn(async () => long);
      const editor = createTestEditor(
        { previewNote, resolveNoteTitle: () => 'Cold room' },
        {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Cold room' } }],
            },
          ],
        },
      );
      const link = editor.view.dom.querySelector('a.editor-wikilink');
      expect(link).not.toBeNull();

      // LEAVING BEFORE THE DELAY: no fetch, no card.
      link!.dispatchEvent(new MouseEvent('mouseenter'));
      await vi.advanceTimersByTimeAsync(399);
      expect(document.querySelector('.wikilink-preview')).toBeNull();
      link!.dispatchEvent(new MouseEvent('mouseleave'));
      await vi.advanceTimersByTimeAsync(5000);
      expect(previewNote).not.toHaveBeenCalled();

      // RESTING PAST IT: the card, carrying exactly the first 200 characters.
      link!.dispatchEvent(new MouseEvent('mouseenter'));
      await vi.advanceTimersByTimeAsync(401);
      await vi.waitFor(() => {
        expect(document.querySelector('.wikilink-preview')).not.toBeNull();
      });
      const card = document.querySelector('.wikilink-preview');
      expect(card?.textContent).toHaveLength(200);
      expect(card?.textContent).toBe(long.slice(0, 200));

      // …and leaving removes it.
      link!.dispatchEvent(new MouseEvent('mouseleave'));
      expect(document.querySelector('.wikilink-preview')).toBeNull();
      editor.destroy();

      // A NULL ANSWER SHOWS NOTHING — the target is gone or unreadable, and a
      // card that opened to say so would be a second, quieter missing pill.
      const missing = createTestEditor(
        { previewNote: async () => null, resolveNoteTitle: () => 'Cold room' },
        {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Cold room' } }],
            },
          ],
        },
      );
      missing.view.dom
        .querySelector('a.editor-wikilink')!
        .dispatchEvent(new MouseEvent('mouseenter'));
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
      expect(document.querySelector('.wikilink-preview')).toBeNull();
      missing.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * THE STYLESHEET IS A SPELLING OF THE BEM CONTRACT THAT TYPESCRIPT CANNOT SEE —
 * the same guard `mention.test.ts` carries for the mention popup, and the
 * reason it exists is recorded there: *"a rename on either side leaves correct
 * markup with no styling and nothing red."* The notes port shipped WITHOUT it,
 * so `wikilink-popup__status` could have been renamed on either side and the
 * whole suite stayed green; found by the plan-close audit sweeping the CLASS
 * rather than the instance.
 *
 * The mention's docblock also records that its own emit half was an OVERCLAIM
 * until measured — it spot-checked three of six names. So the emit side here
 * COLLECTS every matching class the code actually puts in the DOM (node view,
 * missing pill, popup and hover card) rather than asserting a list someone
 * typed, and both directions compare against the same `WIKILINK_BEM`.
 */
const WIKILINK_BEM = [
  'editor-wikilink',
  'editor-wikilink--missing',
  'wikilink-popup',
  'wikilink-popup__item',
  'wikilink-popup__item--selected',
  'wikilink-popup__list',
  'wikilink-popup__status',
  'wikilink-preview',
];

const CLASS_RE = /\.((?:wikilink-popup|wikilink-preview|editor-wikilink)[a-z_-]*)\s*\{/g;

describe('9.282 the BEM classes the wiki-link surface names', () => {
  it('9.282 the stylesheet declares exactly the wiki-link classes the code emits', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles/editor.css'), 'utf8');
    const declared = [...css.matchAll(CLASS_RE)].map((m) => m[1]!);
    expect(declared.sort()).toEqual([...WIKILINK_BEM].sort());
  });

  it('9.282 and the code emits every one of them, collected rather than named', async () => {
    const emitted = new Set<string>();
    const collect = (root: ParentNode): void => {
      for (const el of root.querySelectorAll('*')) {
        for (const token of el.classList) {
          if (WIKILINK_BEM.includes(token)) emitted.add(token);
        }
      }
    };

    // The node view, live and missing.
    const live = createTestEditor(
      { resolveNoteTitle: () => 'Cold room' },
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Cold room' } }] }] },
    );
    collect(live.view.dom);
    live.destroy();
    const missing = createTestEditor(
      { resolveNoteTitle: () => null },
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Cold room' } }] }] },
    );
    collect(missing.view.dom);
    missing.destroy();

    // The popup, opened through the real suggestion path — every class it puts
    // in the DOM, not the three a hand might name.
    const editor = createTestEditor({ queryNotes: async () => NOTES });
    typeText(editor, '[[co');
    await vi.waitFor(() => {
      expect(document.querySelector('.wikilink-popup__item')).not.toBeNull();
    });
    collect(document);
    editor.destroy();

    // …and the hover card.
    vi.useFakeTimers();
    try {
      const card = createTestEditor(
        { previewNote: async () => 'text', resolveNoteTitle: () => 'Cold room' },
        { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Cold room' } }] }] },
      );
      card.view.dom.querySelector('a.editor-wikilink')!.dispatchEvent(new MouseEvent('mouseenter'));
      await vi.advanceTimersByTimeAsync(500);
      await vi.waitFor(() => {
        expect(document.querySelector('.wikilink-preview')).not.toBeNull();
      });
      collect(document);
      card.destroy();
    } finally {
      vi.useRealTimers();
    }

    expect([...emitted].sort()).toEqual([...WIKILINK_BEM].sort());
  });
});
