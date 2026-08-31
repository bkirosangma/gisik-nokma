import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { docToPlainText } from '@gisik-nokma/domain';
import { mentionLabelOf } from '../src/extensions/mention.js';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

const USERS = [
  { userId: '01J9GUSA000000000000000000', name: 'Anselma' },
  { userId: '01J9GUSB000000000000000000', name: 'Anand' },
];

/** A directory row with no usable display name — the hazard this file is built around. */
const NAMELESS = { userId: '01J9GUSC000000000000000000', name: '   ' };

function mentionNodes(json: unknown): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const record = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown };
    if (record.type === 'mention') found.push(record.attrs ?? {});
    walk(record.content);
  };
  walk(json);
  return found;
}

function pressKey(editor: Editor, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true });
  return editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event)) ?? false;
}

function popupItems(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.mention-popup__item')];
}

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.querySelectorAll('.mention-popup').forEach((el) => el.remove());
});

describe('mention picker', () => {
  it('typing @ plus a query surfaces matching candidates', async () => {
    const queryUsers = vi.fn(async (query: string) =>
      USERS.filter((user) => user.name.toLowerCase().startsWith(query.toLowerCase())),
    );
    editor = createTestEditor({ queryUsers });
    typeText(editor, 'ping @an');
    await vi.waitFor(() => {
      expect(popupItems().length).toBe(2);
    });
    expect(queryUsers).toHaveBeenCalledWith('an');
  });

  it('clicking a candidate inserts a mention node {userId, label} plus a space', async () => {
    editor = createTestEditor({ queryUsers: async () => USERS });
    typeText(editor, '@ans');
    await vi.waitFor(() => {
      expect(popupItems()[0]).toBeDefined();
    });
    // mousedown, not click: it fires before the editor loses focus.
    popupItems()[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const mentions = mentionNodes(editor.getJSON());
    expect(mentions).toEqual([{ userId: USERS[0]!.userId, label: 'Anselma' }]);
    // The trigger text `@ans` was consumed by the insertion.
    expect(editor.getText()).not.toContain('@ans');
    expect(editor.getText()).toBe('@Anselma ');
  });

  it('Enter selects the highlighted candidate', async () => {
    editor = createTestEditor({ queryUsers: async () => USERS });
    typeText(editor, '@an');
    await vi.waitFor(() => {
      expect(popupItems().length).toBe(2);
    });
    pressKey(editor, 'ArrowDown');
    expect(popupItems()[1]!.className).toContain('mention-popup__item--selected');
    pressKey(editor, 'Enter');
    expect(mentionNodes(editor.getJSON())).toEqual([
      { userId: USERS[1]!.userId, label: 'Anand' },
    ]);
  });

  /**
   * THE FAIL-FIRST EVIDENCE FOR THIS CASE IS NOT WHAT THE BRIEF THINKS IT IS,
   * and saying so is the point of this comment.
   *
   * @tiptap/suggestion@3.30.5 handles Escape ITSELF (dist:129-138): it calls
   * the renderer's `onKeyDown`, then `dispatchExit(view)` unconditionally, then
   * returns true — and the exit flips the plugin state to inactive, which the
   * plugin view reads as a `stopped` transition and turns into `onExit`
   * (dist:459-462, 476, 559-563), which removes the popup. So a renderer
   * Escape branch cannot be the thing that dismisses the popup, and deleting
   * one does not redden this case. It was run both ways to check, and the
   * popup file therefore ships without such a branch rather than with dead
   * code dressed as a guard.
   *
   * So be exact about what evidence this case has. Against the unmodified
   * pre-Task-4 tree the whole FILE fails at collection — `mention.js` does not
   * exist to import — and that is the only fail-first observation there is; it
   * is not a `waitFor` timing out, and with the import at the top of this file
   * it could not be. No mutation reddens the dismissal half, because no line in
   * this package delivers it.
   *
   * What the case does pin is the half spec §2 actually cares about, and that
   * half is ours to break: the typed `@an` survives as literal text and no node
   * was created. `@…` never silently becomes markup.
   */
  it('Escape dismisses the picker and the typed text stays literal', async () => {
    editor = createTestEditor({ queryUsers: async () => USERS });
    typeText(editor, '@an');
    await vi.waitFor(() => {
      expect(document.querySelector('.mention-popup')).not.toBeNull();
    });
    expect(pressKey(editor, 'Escape')).toBe(true);
    expect(document.querySelector('.mention-popup')).toBeNull();
    expect(mentionNodes(editor.getJSON())).toEqual([]);
    expect(editor.getText()).toContain('@an');
  });

  it('getText renders a mention as @label', () => {
    editor = createTestEditor({ queryUsers: async () => USERS });
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'ask ' },
            { type: 'mention', attrs: { userId: USERS[0]!.userId, label: 'Anselma' } },
          ],
        },
      ],
    });
    expect(editor.getText()).toContain('@Anselma');
  });

  it('round-trips mention attrs through JSON', () => {
    editor = createTestEditor();
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'mention', attrs: { userId: USERS[1]!.userId, label: 'Anand' } }],
        },
      ],
    };
    editor.commands.setContent(doc);
    expect(mentionNodes(editor.getJSON())).toEqual([
      { userId: USERS[1]!.userId, label: 'Anand' },
    ]);
  });

  /**
   * A picker that is open but empty must not eat the keys the editor needs.
   * `items` resolves asynchronously, so the popup exists with zero candidates
   * from the moment `@` is typed until the first query returns — and typing
   * `@` then Enter is an ordinary thing to do ("email me @ 5pm", newline).
   * Returning true unconditionally for Enter, ArrowUp and ArrowDown swallows
   * every one of those keystrokes and the editor appears frozen.
   */
  it('declines navigation keys while it has nothing to navigate', async () => {
    editor = createTestEditor({ queryUsers: async () => [] });
    typeText(editor, '@');
    await vi.waitFor(() => {
      expect(document.querySelector('.mention-popup')).not.toBeNull();
    });
    // Nothing offered, nothing to move through.
    expect(pressKey(editor, 'ArrowDown')).toBe(false);
    expect(pressKey(editor, 'ArrowUp')).toBe(false);
    // Enter is asserted on its EFFECT, not on what `handleKeyDown` returns.
    // `someProp` walks on to the next plugin when the popup declines, so a
    // `true` here would come from StarterKit's own Enter binding and would
    // prove nothing either way — the question is whether the block split.
    const paragraphsBefore = (editor.getJSON() as { content?: unknown[] }).content?.length ?? 0;
    pressKey(editor, 'Enter');
    expect((editor.getJSON() as { content?: unknown[] }).content?.length).toBe(
      paragraphsBefore + 1,
    );
    expect(mentionNodes(editor.getJSON())).toEqual([]);
  });
});

/**
 * THE LABEL IS NOT DECORATION, AND THE COST OF AN EMPTY ONE IS NOT COSMETIC.
 *
 * `packages/domain/src/doc-text.ts` shipped before this package and its header
 * names Plan 7's editor as the thing that conforms to it. Its mention branch
 * takes `attrs.label` only when it is a string of NON-ZERO length; otherwise it
 * falls back to `attrs.userId`, which in this product is a ULID. So a mention
 * carrying an empty label does not render as a slightly worse mention — it
 * renders as `@01J9GUSA000000000000000000` in every search projection and every
 * notification the walker feeds. The first case below is that fact, asserted
 * against the shipped walker rather than described.
 *
 * The guard is therefore on the INSERT PATH, stated once in `mentionLabelOf`
 * and read from both doors the picker owns: `items` never offers a candidate it
 * could not label, and `command` refuses one handed to it anyway. Refusal, not
 * substitution, follows the local precedent — `insertTicketImage` returns false
 * for a non-image mime rather than coercing it — and the alternative was worse
 * on inspection: a fabricated stand-in like 'unknown' would put a name nobody
 * has into a stored document and then into someone's notifications.
 *
 * SCOPE, STATED SO IT CANNOT BE READ WIDER THAN IT IS. Two other doors reach
 * `attrs.label` and neither is closed here: a document loaded from JSON, and
 * one parsed from HTML. Both are pinned open by the last case in this block,
 * for the reason `src/extensions/ticket-image.ts` sets out at length — a
 * ProseMirror `validate` throws at load, `enableContentCheck` defaults false,
 * and the catch replaces the WHOLE document with an empty one. Layer 3, the
 * server ingest gate, is the cheaper place to refuse a stored empty label.
 */
describe('the label a mention is stored with', () => {
  it("empty label, and the shipped walker prints the person's ULID", () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'mention', attrs: { userId: USERS[0]!.userId, label: '' } }],
        },
      ],
    };
    expect(docToPlainText(doc)).toBe(`@${USERS[0]!.userId}`);
  });

  it('mentionLabelOf trims, and refuses what trims to nothing', () => {
    expect(mentionLabelOf({ userId: 'x', name: 'Anselma' })).toBe('Anselma');
    expect(mentionLabelOf({ userId: 'x', name: '  Anselma  ' })).toBe('Anselma');
    expect(mentionLabelOf({ userId: 'x', name: '' })).toBeNull();
    expect(mentionLabelOf({ userId: 'x', name: '   ' })).toBeNull();
    expect(mentionLabelOf({ userId: 'x', name: '\t\n' })).toBeNull();
  });

  it('planted defect: a candidate with no usable name is never offered', async () => {
    editor = createTestEditor({ queryUsers: async () => [NAMELESS, ...USERS] });
    typeText(editor, '@an');
    await vi.waitFor(() => {
      expect(popupItems().length).toBeGreaterThan(0);
    });
    expect(popupItems().map((item) => item.textContent)).toEqual(['Anselma', 'Anand']);
  });

  /**
   * The nameless row is FIRST in what the directory returns, so it is what a
   * click and what Enter both land on — which makes what sits in that slot a
   * correctness question, not a cosmetic one. The stored label would be three
   * spaces: a string the walker's `length > 0` accepts, so the search index and
   * the notification would read `@   `, a mention of nobody, which no check on
   * the raw string's length would have caught.
   *
   * The case clicks whatever is actually in the first slot and then asserts on
   * the DOCUMENT. An earlier draft waited on `.mention-popup` and clicked
   * everything it found, and was vacuous: the popup is created synchronously
   * with zero rows and only fills in when `items` settles, so with the fix in
   * place there was nothing to click and the case passed without exercising
   * anything. Two mutants caught that — it stayed green with the guard removed.
   */
  it('planted defect: nothing this editor cannot label ever reaches the document', async () => {
    editor = createTestEditor({ queryUsers: async () => [NAMELESS, USERS[0]!] });
    typeText(editor, '@an');
    await vi.waitFor(() => {
      expect(popupItems().length).toBeGreaterThan(0);
    });
    popupItems()[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const json = editor.getJSON();
    expect(mentionNodes(json)).toEqual([{ userId: USERS[0]!.userId, label: 'Anselma' }]);
    expect(docToPlainText(json)).toBe('@Anselma');
  });

  it('and every label that does reach it is one the walker will print', async () => {
    editor = createTestEditor({ queryUsers: async () => [NAMELESS, ...USERS] });
    typeText(editor, '@an');
    await vi.waitFor(() => {
      expect(popupItems().length).toBe(2);
    });
    popupItems()[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const json = editor.getJSON();
    const mentions = mentionNodes(json);
    expect(mentions).toHaveLength(1);
    expect(String(mentions[0]!.label).length).toBeGreaterThan(0);
    // And the consequence that number exists for.
    expect(docToPlainText(json)).toContain('@Anselma');
    expect(docToPlainText(json)).not.toContain(NAMELESS.userId);
    expect(docToPlainText(json)).not.toContain(USERS[0]!.userId);
  });

  it('trims a padded name rather than storing the padding', async () => {
    editor = createTestEditor({ queryUsers: async () => [{ userId: USERS[0]!.userId, name: '  Anselma  ' }] });
    typeText(editor, '@an');
    await vi.waitFor(() => {
      expect(popupItems().length).toBe(1);
    });
    popupItems()[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(mentionNodes(editor.getJSON())).toEqual([
      { userId: USERS[0]!.userId, label: 'Anselma' },
    ]);
  });

  it('leaves the JSON and parse doors open, exactly as the image node does', () => {
    editor = createTestEditor(undefined, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'mention', attrs: { userId: USERS[0]!.userId, label: '' } }],
        },
      ],
    });
    expect(mentionNodes(editor.getJSON())[0]!.label).toBe('');
    editor.destroy();

    editor = createTestEditor();
    editor.commands.setContent(`<p><span data-mention-user-id="${USERS[0]!.userId}"></span></p>`);
    expect(mentionNodes(editor.getJSON())[0]!.label).toBe('');
  });
});

/**
 * THE PARSE PATH IS THE DOOR A HOSTILE DOCUMENT USES, and Task 3 established
 * where its guard has to sit. `injectExtensionAttributesToParseRule`
 * (@tiptap/core@3.30.5 dist:1452-1472) rebuilds every parse rule's `getAttrs`
 * as `{ ...nodeLevelResult, ...perAttributeResults }` — the per-attribute
 * handler is the LAST writer, and its default when an attribute defines none is
 * `fromString(node.getAttribute(name))` (dist:1460), which reads the bare
 * attribute `userId` / `label`. `getAttribute` is case-insensitive on an HTML
 * element, so `userid="…"` reaches it too.
 *
 * The same mechanism runs in the other direction: `getRenderedAttributes`
 * (dist:1431) writes an attribute with no `renderHTML` out under its own name,
 * so a node whose attributes define none serializes BOTH
 * `data-mention-user-id="…"` and `userid="…"` — two spellings of one fact, of
 * which only one is read back through a guard.
 */
describe('mention HTML, in both directions', () => {
  it('planted defect: bare `userId` / `label` attributes cannot outrank the canonical ones', () => {
    editor = createTestEditor();
    editor.commands.setContent(
      `<p><span data-mention-user-id="${USERS[0]!.userId}" userId="${USERS[1]!.userId}" label="Mallory">@Anselma</span></p>`,
    );
    expect(mentionNodes(editor.getJSON())).toEqual([
      { userId: USERS[0]!.userId, label: 'Anselma' },
    ]);
  });

  it('serializes each attribute under exactly one name', () => {
    editor = createTestEditor(undefined, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'mention', attrs: { userId: USERS[0]!.userId, label: 'Anselma' } }],
        },
      ],
    });
    const html = editor.getHTML();
    expect(html).toContain(`data-mention-user-id="${USERS[0]!.userId}"`);
    expect(html).toContain('editor-mention');
    expect(html).toContain('@Anselma');
    expect(html).not.toMatch(/\suserid=/i);
    expect(html).not.toMatch(/\slabel=/i);
  });

  it('survives a full HTML round trip with both attrs intact', () => {
    editor = createTestEditor(undefined, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'ask ' },
            { type: 'mention', attrs: { userId: USERS[1]!.userId, label: 'Anand' } },
          ],
        },
      ],
    });
    const json = editor.getJSON();
    editor.commands.setContent(editor.getHTML());
    expect(mentionNodes(editor.getJSON())).toEqual(mentionNodes(json));
  });

  it('does not claim a span that carries no mention id', () => {
    // A `<span>` pasted from any web page is not one of this product's
    // mentions; `data-mention-user-id` is the discriminator, not the tag.
    editor = createTestEditor();
    editor.commands.setContent('<p><span class="editor-mention">@Mallory</span></p>');
    expect(mentionNodes(editor.getJSON())).toEqual([]);
    expect(editor.getText()).toContain('@Mallory');
  });
});

/**
 * THE STYLESHEET IS A SPELLING OF THE BEM CONTRACT THAT TYPESCRIPT CANNOT SEE,
 * the same argument `ticket-image.test.ts` makes for the wrap modes. The four
 * class names in the Produces contract are built in two files — the popup
 * builds three of them in JS, the node's `renderHTML` builds the fourth — and a
 * rename on either side leaves correct markup with no styling and nothing red.
 * Equality in both directions, so a rule for a class nobody emits is caught too.
 */
describe('the BEM classes the contract names', () => {
  it('the stylesheet declares exactly the mention classes the code emits', () => {
    const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles/editor.css');
    const css = readFileSync(cssPath, 'utf8');
    const declared = [...css.matchAll(/\.((?:mention-popup|editor-mention)[a-z_-]*)\s*\{/g)].map(
      (match) => match[1]!,
    );
    expect(declared.sort()).toEqual(
      ['editor-mention', 'mention-popup', 'mention-popup__item', 'mention-popup__item--selected'].sort(),
    );
  });

  it('and the code emits exactly those', async () => {
    editor = createTestEditor({ queryUsers: async () => USERS });
    typeText(editor, '@an');
    await vi.waitFor(() => {
      expect(popupItems().length).toBe(2);
    });
    expect(document.querySelector('.mention-popup')).not.toBeNull();
    pressKey(editor, 'ArrowDown');
    expect(document.querySelectorAll('.mention-popup__item--selected')).toHaveLength(1);
    pressKey(editor, 'Enter');
    expect(editor.getHTML()).toContain('class="editor-mention"');
  });
});
