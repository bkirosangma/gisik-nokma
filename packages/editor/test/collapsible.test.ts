import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

/**
 * 9.268–9.271 and 9.295 — spec §8.4, the collapsible block.
 *
 * The shape is `details(open) > detailsSummary + detailsContent > paragraph…`.
 *
 * ## WHY THIS FILE DISPATCHES REAL `keydown` EVENTS
 *
 * `editor.commands.keyboardShortcut('Enter')` runs the extension handlers
 * inside `editor.captureTransaction` (core `keyboardShortcut`, dist:890), and
 * that helper replays only the captured TRANSACTION STEPS onto its own
 * transaction — the SELECTION it set is dropped. Measured: an Enter that moves
 * the cursor into the body leaves the selection exactly where it was under
 * `keyboardShortcut`, while the same Enter dispatched as a DOM event moves it.
 * So the two cases that assert a cursor position cannot be driven through that
 * command at all, and all of them are driven the way the browser does it —
 * a `keydown` on the editor's own host, which is the pattern the notes plan's
 * Task 5 uses for its suggestion keys.
 */
function key(editor: Editor, name: string): void {
  editor.view.dom.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  );
}

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

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** A collapsible with a title and one body line; `open` is the document's own attribute. */
function detailsDoc(open: boolean): unknown {
  return {
    type: 'doc',
    content: [
      {
        type: 'details',
        attrs: { open },
        content: [
          { type: 'detailsSummary', content: [{ type: 'text', text: 'Why it broke' }] },
          { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the body' }] }] },
        ],
      },
      { type: 'paragraph' },
    ],
  };
}

/** The pieces of the rendered block a person interacts with. */
function parts(editor: Editor): { root: HTMLElement; toggle: HTMLButtonElement; body: HTMLElement } {
  const root = editor.view.dom.querySelector<HTMLElement>('.editor-details')!;
  return {
    root,
    toggle: root.querySelector<HTMLButtonElement>(':scope > button')!,
    body: root.querySelector<HTMLElement>('[data-type="detailsContent"]')!,
  };
}

describe('9.268-9.271 collapsible block', () => {
  /**
   * The `< ` trigger, and the two controls that keep it from being a greedy
   * rule: `<div>` has no space after the `<`, and `abc< ` is not at the start
   * of the line. Both controls are in the same `it` as the positive case, so a
   * rule that matched too much cannot pass by the positive case alone.
   */
  it('9.268 "< " opens a details block; "<div>" and "abc< " do not', () => {
    const editor = createTestEditor();
    typeText(editor, '< Why it broke');
    const first = asJson(editor).content?.[0];
    expect(first?.type).toBe('details');
    expect(first?.attrs?.open).toBe(true);
    expect(first?.content?.[0]?.type).toBe('detailsSummary');
    expect(first?.content?.[0]?.content?.[0]?.text).toBe('Why it broke');
    expect(first?.content?.[1]?.type).toBe('detailsContent');
    editor.commands.clearContent();
    typeText(editor, '<div>');
    expect(asJson(editor).content?.[0]?.type).toBe('paragraph');
    editor.commands.clearContent();
    typeText(editor, 'abc< ');
    expect(asJson(editor).content?.[0]?.type).toBe('paragraph');
    editor.destroy();
  });

  it('9.269 Enter in the summary moves into the content', () => {
    const editor = createTestEditor();
    typeText(editor, '< Title');
    key(editor, 'Enter');
    const { $from } = editor.state.selection;
    expect($from.parent.type.name).toBe('paragraph');
    expect($from.node(-1).type.name).toBe('detailsContent');
    editor.destroy();
  });

  it('9.270 Enter on the empty last paragraph exits the block', () => {
    const editor = createTestEditor();
    typeText(editor, '< Title');
    key(editor, 'Enter');
    typeText(editor, 'body');
    key(editor, 'Enter'); // new empty paragraph inside content
    key(editor, 'Enter'); // exit
    const doc = asJson(editor);
    expect(doc.content?.[0]?.type).toBe('details');
    expect(doc.content?.[0]?.content?.[1]?.content).toHaveLength(1); // the empty paragraph was removed
    expect(doc.content?.[1]?.type).toBe('paragraph');
    expect(editor.state.selection.$from.depth).toBe(1); // cursor is at top level
    editor.destroy();
  });

  it('9.271 open is document state for editors; readers get persist:false', () => {
    const editor = createTestEditor();
    typeText(editor, '< T');
    editor.commands.updateAttributes('details', { open: false });
    expect(asJson(editor).content?.[0]?.attrs?.open).toBe(false);
    editor.destroy();
    const reader = createTestEditor({ readOnly: true });
    const details = reader.extensionManager.extensions.find((e) => e.name === 'details');
    expect(details?.options.persist).toBe(false);
    reader.destroy();
  });

  /**
   * 9.295 — spec §8.4's Backspace rule: at the start of an empty summary of an
   * empty collapsible, the whole block goes and ONE paragraph takes its place.
   *
   * THE CONTROL IS THE OFFSET, and it is in the same `it` because it is the
   * half that makes "at the start" mean something. One position in from the
   * start, Backspace must delete a CHARACTER and leave the block standing — a
   * handler that removed the block whenever it saw Backspace in a summary
   * would satisfy the first arm and eat a titled section on the first
   * keystroke of an edit.
   */
  it('9.295 Backspace at the start of an EMPTY summary removes the block and leaves one paragraph', () => {
    const editor = createTestEditor();
    typeText(editor, '< '); // the rule fires on the space: empty summary, empty body
    const before = asJson(editor).content ?? [];
    expect(before[0]?.type).toBe('details');
    key(editor, 'Backspace');
    const after = asJson(editor).content ?? [];
    // The block is GONE — no `details` anywhere in the document.
    expect(JSON.stringify(after)).not.toContain('"details"');
    // AND EXACTLY ONE BLOCK TOOK ITS PLACE. The count is asserted as a DELTA
    // rather than as a literal, because `TrailingNode` keeps an empty
    // paragraph as a document's last block: a document ending in a collapsible
    // always carries one behind it, so `toHaveLength(1)` would be counting the
    // editor's trailing node. What §8.4 asks for is a 1:1 replacement, and
    // that is what a delta measures.
    //
    // THIS ARM IS WHY THE HANDLER IS THIS FILE'S RATHER THAN THE PACKAGE'S.
    // Removing the handler leaves this case RED at 3 — the Details
    // extension's own Backspace calls `unsetDetails`, which merges the
    // summary content AND inserts a fresh block, so an empty collapsible
    // becomes two empty paragraphs plus the trailing one. Both "leave a
    // paragraph"; only one leaves ONE.
    expect(after).toHaveLength(before.length);
    expect(after[0]?.type).toBe('paragraph');
    editor.destroy();

    const kept = createTestEditor();
    typeText(kept, '< Ti');
    kept.commands.setTextSelection(4); // one position in from the start of "Ti"
    key(kept, 'Backspace');
    const keptDoc = asJson(kept);
    expect(keptDoc.content?.[0]?.type).toBe('details');
    expect(keptDoc.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('T');
    kept.destroy();
  });
});

/**
 * 9.272 — THE COLLAPSIBLE'S SELECTORS HAVE TO MATCH WHAT THE EDITOR DRAWS.
 *
 * Found by the plan-close audit, and it is the gap that let two dead rules
 * stand: `editor.css` declared `.editor-details > summary { cursor: pointer }`
 * and the case asserted that DECLARATION — which a stylesheet read can see. The
 * Details extension renders its own node view, whose DOM is
 * `<div class="editor-details"><button></button><div><summary>…</summary>…`, so
 * the summary is a GRANDCHILD and the child combinator matched nothing. Neither
 * that rule nor the `:empty::before` placeholder beside it could ever apply.
 *
 * The assertion below is the one that would have caught them: `matches()` asks
 * the DOM, not the file.
 */
describe('9.272 the collapsible selectors match the rendered DOM', () => {
  it('9.272 every selector the stylesheet declares for the block matches a real element', async () => {
    // Loaded rather than typed: the node view adds `is-open` on a `setTimeout`
    // (Tiptap's own) and an `update` in the SAME tick — which synchronous
    // `typeText` produces — flips it straight back off, so a typed block is
    // folded in the DOM while its document says `open: true`. A loaded one is
    // open once that tick has run, which the `.is-open` selectors need.
    const editor = createTestEditor({}, detailsDoc(true));
    await tick();
    const root = editor.view.dom.querySelector('.editor-details');
    expect(root, 'the node view did not render .editor-details').not.toBeNull();
    const summary = root!.querySelector('summary');
    const toggle = root!.querySelector('button');
    expect(summary, 'the block rendered no summary').not.toBeNull();
    expect(toggle, 'the block rendered no fold control').not.toBeNull();

    // THE SELECTORS ARE READ OUT OF THE STYLESHEET, not typed here, and that is
    // the whole point: asserting the DOM against a literal this file carries
    // would pass while `editor.css` declared something else — which is exactly
    // the state that shipped, with the stylesheet naming `.editor-details >
    // summary` and no element matching it.
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles/editor.css'), 'utf8');
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...bare.matchAll(/(\.editor-details[^{,]*)\s*\{/g)].map((m) => m[1]!.trim());
    // CONTROL FIRST: an extractor that found nothing would make the loop below
    // vacuous, which is the failure mode this whole assertion exists to close.
    expect(selectors.length, 'no .editor-details selectors extracted — the extractor is broken').toBeGreaterThan(0);
    for (const selector of selectors) {
      // `matches()` cannot see a pseudo-element (`::before`) or a state a
      // static DOM is not in (`:hover`, `:focus-visible`); both are removed so
      // the selector is asked about the ELEMENT it styles.
      const element = selector.replace(/::(?:before|after)/g, '').replace(/:(?:hover|focus-visible|focus)/g, '');
      const matched = [root, summary, toggle].some((el) => el!.matches(element));
      expect(matched, `editor.css declares \`${selector}\`, which matches nothing the editor draws`).toBe(true);
    }
    // …and the CONTROL for the other direction: the selector that USED to be
    // declared must still match nothing, so this case cannot pass by the DOM
    // bending to the old spelling.
    expect(summary!.matches('.editor-details > summary')).toBe(false);
    editor.destroy();
  });
});


/**
 * 9.451-9.454 — THE FOLD CONTROL IS SEEN, ANNOUNCED AND OPERABLE (owner report,
 * 2026-09-29: "the collapsible does not seem to be working. i dont see anyway i
 * can collapse the section.").
 *
 * The control was always THERE and always worked — the Details node view's
 * `<button>` toggled the body — but the extension renders it EMPTY and expects
 * the host stylesheet to draw its indicator, and `editor.css` reset it to
 * `border: none; background: none; padding: 0` and drew nothing: MEASURED in a
 * browser, a 0 x 0 box. A person cannot press what has no box.
 *
 * jsdom applies no stylesheet, so the DRAWING is asserted against the file
 * (9.451, comment-stripped, like every css-binding case in this package) and the
 * BEHAVIOUR against a real mounted editor (9.452-9.454).
 */
describe('9.451-9.454 the collapsible fold control', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles/editor.css'), 'utf8');
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

  /** The declarations of the rule whose selector list is EXACTLY `selector`. */
  function body(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
    const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(bare);
    expect(match, `no rule for \`${selector}\` in editor.css`).not.toBeNull();
    return match![1]!;
  }
  const value = (rule: string, property: string): string | null =>
    new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(rule)?.[1]?.trim() ?? null;
  const px = (v: string | null): number => {
    const m = /^([\d.]+)(px|rem)$/.exec(v ?? '');
    return m === null ? 0 : parseFloat(m[1]!) * (m[2] === 'rem' ? 16 : 1);
  };

  it('9.451 the fold button has a hit area of at least 24px, a drawn chevron, and it turns when open', () => {
    const button = body('.editor-details > button');
    // CONTROL: this is the BUTTON's rule, not the block's.
    expect(value(button, 'cursor')).toBe('pointer');
    // A 0 x 0 button is the defect; WCAG 2.2 target size (minimum) is 24 x 24.
    expect(px(value(button, 'width')), 'width').toBeGreaterThanOrEqual(24);
    expect(px(value(button, 'height')), 'height').toBeGreaterThanOrEqual(24);
    // The extension renders the button EMPTY: the indicator is a pseudo-element
    // or it does not exist.
    const chevron = body('.editor-details > button::before');
    expect(value(chevron, 'content')).not.toBeNull();
    expect(value(chevron, 'content')).not.toBe('none');
    const closed = value(chevron, 'transform');
    const open = value(body('.editor-details.is-open > button::before'), 'transform');
    expect(closed, 'the closed chevron is rotated').toMatch(/rotate\(/);
    expect(open, 'the open chevron is rotated').toMatch(/rotate\(/);
    expect(open, 'open and closed must differ').not.toBe(closed);
    // Keyboard focus is visible (this button is the ONLY way to fold).
    expect(value(body('.editor-details > button:focus-visible'), 'outline')).not.toBeNull();
    // The summary leaves room for the button rather than running under it.
    expect(px(value(body('.editor-details summary'), 'padding-left'))).toBeGreaterThanOrEqual(24);
    // Reduced motion: the turn is not animated for people who ask for none.
    expect(bare).toMatch(/prefers-reduced-motion[^{]*\{[^}]*\.editor-details > button::before[^}]*transition:\s*none/);
  });

  it('9.452 aria-expanded follows the state and a click folds and unfolds the body, in the document too', async () => {
    const editor = createTestEditor({}, detailsDoc(true));
    await tick();
    const { root, toggle, body: content } = parts(editor);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(content.hasAttribute('hidden')).toBe(false);
    expect(root.classList.contains('is-open')).toBe(true);

    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(content.hasAttribute('hidden')).toBe(true);
    expect(root.classList.contains('is-open')).toBe(false);
    expect(asJson(editor).content?.[0]?.attrs?.open).toBe(false); // folded state is saved with the note (D10)

    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(content.hasAttribute('hidden')).toBe(false);
    expect(asJson(editor).content?.[0]?.attrs?.open).toBe(true);
    editor.destroy();

    // A document saved folded arrives folded.
    const folded = createTestEditor({}, detailsDoc(false));
    await tick();
    expect(parts(folded).toggle.getAttribute('aria-expanded')).toBe('false');
    expect(parts(folded).body.hasAttribute('hidden')).toBe(true);
    folded.destroy();
  });

  it('9.453 a reader folds and unfolds too, and nothing reaches the document', async () => {
    const reader = createTestEditor({ readOnly: true }, detailsDoc(true));
    await tick();
    const { toggle, body: content } = parts(reader);
    // `persist: false` drops the attribute, so a reader starts folded.
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(content.hasAttribute('hidden')).toBe(true);
    const before = JSON.stringify(reader.getJSON());
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(content.hasAttribute('hidden')).toBe(false);
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(content.hasAttribute('hidden')).toBe(true);
    expect(JSON.stringify(reader.getJSON())).toBe(before);
    reader.destroy();
  });

  /**
   * MEASURED in a browser: with the button focused, a real Enter is consumed
   * by ProseMirror's keymap (`defaultPrevented` at bubble, no `click`), and it
   * SPLITS A BLOCK in the document instead — so the keyboard could not fold at
   * all and typing at the button edited the note. Enter and Space on the button
   * therefore have to be answered by the button.
   */
  it('9.454 Enter and Space on the focused fold button toggle it and edit nothing else', async () => {
    const editor = createTestEditor({}, detailsDoc(true));
    await tick();
    const { toggle, body: content } = parts(editor);
    const blocks = (): number => asJson(editor).content?.length ?? 0;
    const before = blocks();

    const press = (name: string): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
      toggle.dispatchEvent(event);
      return event;
    };
    press('Enter');
    expect(toggle.getAttribute('aria-expanded'), 'Enter folds').toBe('false');
    expect(content.hasAttribute('hidden')).toBe(true);
    press(' ');
    expect(toggle.getAttribute('aria-expanded'), 'Space unfolds').toBe('true');
    expect(content.hasAttribute('hidden')).toBe(false);
    expect(blocks(), 'the keys must not split or add a block').toBe(before);

    // CONTROL, same `it`: Enter in the SUMMARY is still 9.269's — it goes into
    // the body and does not toggle.
    editor.commands.setTextSelection(3);
    key(editor, 'Enter');
    expect(editor.state.selection.$from.node(-1).type.name).toBe('detailsContent');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    editor.destroy();
  });
});
