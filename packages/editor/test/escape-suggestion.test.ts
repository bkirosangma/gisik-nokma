import { describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import { getEscapeSuggestion } from '../src/extensions/escape-suggestion.js';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

function pressEscape(editor: Editor): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  return editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event)) ?? false;
}

function firstBlock(editor: Editor): { type: string; text: string } {
  const node = editor.state.doc.firstChild;
  return { type: node?.type.name ?? 'none', text: node?.textContent ?? '' };
}

type Trigger = { typed: string; formatted: (editor: Editor) => boolean; label: string };

const BLOCK_TRIGGERS: Trigger[] = [
  { typed: '# ', label: 'heading 1', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '## ', label: 'heading 2', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '### ', label: 'heading 3', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '#### ', label: 'heading 4', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '##### ', label: 'heading 5', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '###### ', label: 'heading 6', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '- ', label: 'bullet (dash)', formatted: (e) => firstBlock(e).type === 'bulletList' },
  { typed: '* ', label: 'bullet (star)', formatted: (e) => firstBlock(e).type === 'bulletList' },
  { typed: '+ ', label: 'bullet (plus)', formatted: (e) => firstBlock(e).type === 'bulletList' },
  { typed: '1. ', label: 'ordered list', formatted: (e) => firstBlock(e).type === 'orderedList' },
  { typed: '> ', label: 'blockquote', formatted: (e) => firstBlock(e).type === 'blockquote' },
  { typed: '``` ', label: 'code block (backtick fence)', formatted: (e) => firstBlock(e).type === 'codeBlock' },
  { typed: '~~~ ', label: 'code block (tilde fence)', formatted: (e) => firstBlock(e).type === 'codeBlock' },
  {
    typed: '---',
    label: 'horizontal rule',
    formatted: (e) => {
      let found = false;
      e.state.doc.descendants((node) => {
        if (node.type.name === 'horizontalRule') found = true;
        return !found;
      });
      return found;
    },
  },
  { typed: '[] ', label: 'task item', formatted: (e) => firstBlock(e).type === 'taskList' },
  { typed: '< ', label: 'collapsible', formatted: (e) => firstBlock(e).type === 'details' },
];

const MARK_TRIGGERS: Trigger[] = [
  { typed: 'x **bold**', label: 'bold **', formatted: (e) => e.getHTML().includes('<strong') },
  { typed: 'x __bold__', label: 'bold __', formatted: (e) => e.getHTML().includes('<strong') },
  { typed: 'x *it*', label: 'italic *', formatted: (e) => e.getHTML().includes('<em') },
  { typed: 'x _it_', label: 'italic _', formatted: (e) => e.getHTML().includes('<em') },
  { typed: 'x ~~st~~', label: 'strike', formatted: (e) => e.getHTML().includes('<s') },
  { typed: 'x `co`', label: 'inline code', formatted: (e) => e.getHTML().includes('<code') },
  // E2-46 — the TYPED markdown link, which `markdownLinks: true` (owner ruling
  // "both", 2026-09-20) made an input-rule trigger. It belongs in this table
  // because the escape mechanic's coverage is defined as "every trigger that
  // fires an input rule", and this one does. ⚠ Its `typed` string carries NO
  // TRAILING TEXT, and that is load-bearing rather than tidy — see 9.260, which
  // measures what happens when there is some. Every other row here is in the
  // same condition, which is what makes this table a uniform measurement.
  {
    typed: 'see [the doc](https://gst.gov.in)',
    label: 'typed markdown link',
    formatted: (e) => e.getHTML().includes('<a '),
  },
];

describe('escape suggestion — every reserved sequence, planted-defect style', () => {
  /**
   * 9.88 — every reserved autoformat sequence (16 block triggers, 7 mark
   * triggers, 23 rows, table-driven) applies its formatting AND leaves an
   * internal undo-able record, and accepting via `undoInputRule` reverses the
   * formatting and leaves the literal typed characters. 23 rows exercise all
   * 21 registered input rules (bullet's 3 marker variants and codeBlock's 2
   * fence variants each collapse to one registered rule). No visible chip
   * is asserted here any more — the offer is withdrawn (owner ruling
   * 2026-09-24); see 9.338 for the no-chip assertion.
   */
  it.each([...BLOCK_TRIGGERS, ...MARK_TRIGGERS])(
    '$label: formatting applies, accepting yields literal text',
    ({ typed, formatted }) => {
      const editor = createTestEditor();
      typeText(editor, typed);

      // The autoformat happened (accepting would revert exactly this)…
      expect(formatted(editor), `"${typed}" should have autoformatted`).toBe(true);
      // …and an internal undo-able record exists.
      const suggestion = getEscapeSuggestion(editor.state);
      expect(suggestion, `no pending record after typing "${typed}"`).not.toBeNull();

      // Accept: the literal typed characters stand, the formatting is gone.
      expect(editor.commands.undoInputRule()).toBe(true);
      expect(formatted(editor), `accepting the escape must undo "${typed}"`).toBe(false);
      expect(editor.state.doc.textContent).toContain(typed.trim());
      expect(getEscapeSuggestion(editor.state)).toBeNull();
      editor.destroy();
    },
  );

  /**
   * 9.338 — no visible escape affordance for ANY markdown shortcut (owner
   * ruling 2026-09-24, withdrawing spec §2's chip mechanic): no
   * `[data-escape-chip]` and no `.escape-chip` element in the DOM after any
   * of the 23 rows above, with the SAME positive control 9.88 already
   * proves (formatting fired) so this case cannot pass on a no-op
   * `typeText`. Escape performs no special handling any more, on any row.
   */
  it.each([...BLOCK_TRIGGERS, ...MARK_TRIGGERS])(
    '9.338 $label: no chip in the DOM, Escape does nothing special',
    ({ typed, formatted }) => {
      const editor = createTestEditor();
      typeText(editor, typed);
      expect(formatted(editor), `"${typed}" should have autoformatted`).toBe(true);
      expect(editor.view.dom.querySelector('[data-escape-chip]')).toBeNull();
      expect(editor.view.dom.querySelector('.escape-chip')).toBeNull();
      expect(pressEscape(editor)).toBe(false);
      editor.destroy();
    },
  );

  /**
   * 9.339 — Backspace immediately after a BLOCK-type shortcut still reverts
   * it to literal text (the owner's ADDENDUM), via a REAL keydown — not
   * `editor.commands.undoInputRule()` directly (which 9.88 already proves),
   * because a real keydown is routed through core's Backspace keymap, which
   * is a different code path (see escape-suggestion.ts's docblock on why
   * `keyboardShortcut('Backspace')` cannot substitute for it either).
   *
   * COLLAPSIBLE IS DELIBERATELY EXCLUDED from this table — see the ledger's
   * Task 1 ruling. Measured: collapsible.ts's OWN keymap (case 9.295, spec
   * §8.4) wins the real-keydown race before escape-suggestion's override
   * ever runs, for the "cursor at the start of the freshly-created empty
   * block" state, and deletes the empty summary's whole block, leaving one
   * paragraph. The regression case below confirms it is unchanged. THE CODE
   * BLOCK ROWS ARE ALSO EXCLUDED HERE but no longer as an exception: they
   * have their own 9.359 cases below (owner ruling 2026-09-29), where the
   * upstream code-block Backspace used to win and no longer does.
   *
   * Mark triggers are the CONTROL, in their own `it` beneath: the mutation
   * this case names (removing the `undoInputRule` override) must leave them
   * green, proving the override is what the REMAINING block triggers depend
   * on and not some other mechanism.
   */
  const BLOCK_UNDO_CASES: Trigger[] = BLOCK_TRIGGERS.filter(
    (t) => t.label !== 'collapsible' && !t.label.startsWith('code block'),
  );
  it.each(BLOCK_UNDO_CASES)('9.339 $label: Backspace immediately reverts to literal text (real keydown)', ({ typed }) => {
    const editor = createTestEditor();
    typeText(editor, typed);
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    const handled = editor.view.someProp('handleKeyDown', (h) => h(editor.view, event));
    expect(handled, `Backspace after "${typed}" should be handled`).toBe(true);
    expect(editor.state.doc.textContent).toContain(typed.trim());
    editor.destroy();
  });

  it('9.339 CONTROL — a mark trigger stays green under the same real-keydown path', () => {
    const editor = createTestEditor();
    typeText(editor, 'x **bold**');
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    expect(editor.view.someProp('handleKeyDown', (h) => h(editor.view, event))).toBe(true);
    expect(editor.getHTML()).not.toContain('<strong');
    expect(editor.state.doc.textContent).toContain('**bold**');
    editor.destroy();
  });

  /**
   * 9.339 REGRESSION — collapsible's OWN Backspace behaviour (case 9.295,
   * unaffected by the chip removal): an empty summary right after "< " is
   * deleted along with the whole block, leaving one paragraph — not
   * literal "< " text. Mutation: this case reddens if the escape-suggestion
   * rewrite accidentally lets its own `undoInputRule` override win that
   * race instead.
   */
  it('9.339 REGRESSION — collapsible still deletes the empty block on Backspace, not revert-to-literal', () => {
    const editor = createTestEditor();
    typeText(editor, '< ');
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    editor.view.someProp('handleKeyDown', (h) => h(editor.view, event));
    const json = editor.state.doc.toJSON();
    expect(JSON.stringify(json)).not.toContain('"details"');
    expect(editor.state.doc.textContent).not.toContain('<');
    editor.destroy();
  });

  /**
   * 9.359 — A5a (owner ruling 2026-09-29): Backspace pressed IMMEDIATELY after
   * the ``` (or ~~~) input rule fires restores the typed fence as literal
   * text; it does NOT run `@tiptap/extension-code-block`'s own upstream
   * Backspace ("empty code block exits to a paragraph"), which used to win the
   * real-keydown race and left neither the block nor the backticks. Driven by a
   * REAL keydown in a real editor mount. Supersedes the earlier 9.339
   * "code-block exception" regression, which pinned the old behaviour.
   * Mutation: drop the `addKeyboardShortcuts` override in
   * code-block-copy.ts → both rows red.
   */
  it.each([
    { typed: '``` ', fence: '```' },
    { typed: '~~~ ', fence: '~~~' },
  ])('9.359 $fence + Backspace immediately restores the literal fence, not a bare paragraph', ({ typed, fence }) => {
    const editor = createTestEditor();
    typeText(editor, typed);
    expect(firstBlock(editor).type).toBe('codeBlock');
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    expect(editor.view.someProp('handleKeyDown', (h) => h(editor.view, event))).toBe(true);
    expect(JSON.stringify(editor.state.doc.toJSON())).not.toContain('"codeBlock"');
    expect(firstBlock(editor)).toEqual({ type: 'paragraph', text: typed });
    expect(editor.state.doc.textContent).toContain(fence);
    editor.destroy();
  });

  /**
   * 9.359 CONTROL — the upstream exit is untouched when NO input rule just
   * fired: a code block that was already there (here made by the command, not
   * by typing ```), caret at its start, still exits to an empty paragraph on
   * Backspace. Without this, the fix above could pass by making Backspace
   * always restore backticks.
   */
  it('9.359 CONTROL — an empty code block NOT made by the shortcut still exits to a paragraph on Backspace', () => {
    const editor = createTestEditor();
    editor.commands.setCodeBlock();
    expect(firstBlock(editor).type).toBe('codeBlock');
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    editor.view.someProp('handleKeyDown', (h) => h(editor.view, event));
    expect(JSON.stringify(editor.state.doc.toJSON())).not.toContain('"codeBlock"');
    expect(editor.state.doc.textContent).toBe('');
    editor.destroy();
  });

  /**
   * 9.359 CONTROL 2 — the record closes on the first further keystroke, as for
   * every other rule: after typing inside the fresh block, Backspace is NOT
   * claimed by either handler (the browser deletes the character natively —
   * jsdom does not emulate that, so the assertion is "unhandled, block and
   * text untouched", never "restored to backticks").
   */
  it('9.359 CONTROL — after typing inside the fresh block, Backspace is left to the browser and the block stands', () => {
    const editor = createTestEditor();
    typeText(editor, '``` ab');
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    expect(editor.view.someProp('handleKeyDown', (h) => h(editor.view, event))).toBeFalsy();
    expect(firstBlock(editor)).toEqual({ type: 'codeBlock', text: 'ab' });
    editor.destroy();
  });

  /**
   * 9.89 — Backspace accepts through a real `keydown` (core's Backspace keymap routes it through `undoInputRule`), proven with a genuine event rather than the `keyboardShortcut` test helper.
   */
  it('Backspace accepts (core keymap routes it through undoInputRule)', () => {
    // A real keydown, not `editor.commands.keyboardShortcut('Backspace')`:
    // that test-only helper replays the shortcut's captured transaction
    // onto a second, outer transaction (core dist:895-902), and the replay
    // mishandles a multi-step transaction ending in a position-shifting
    // step — verified independent of this file: with this extension's
    // addCommands removed so core's OWN unmodified undoInputRule runs on a
    // mark trigger whose record this file never touches, the helper still
    // fails, this time with a hard `RangeError` from inside its own replay
    // (see escape-suggestion.ts's docblock for the isolation). A genuine
    // keydown event is what core's Backspace keymap and every real user
    // actually drive, and it is what `pressEscape` above already uses for
    // the same reason.
    const editor = createTestEditor();
    typeText(editor, '# ');
    expect(firstBlock(editor).type).toBe('heading');
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    const handled = editor.view.someProp('handleKeyDown', (h) => h(editor.view, event));
    expect(handled).toBe(true);
    expect(firstBlock(editor)).toEqual({ type: 'paragraph', text: '# ' });
    editor.destroy();
  });

  /**
   * 9.92 — continuing to type dismisses the suggestion the same way Escape does, and the formatting stays.
   */
  it('continuing to type dismisses: the formatting stays', () => {
    const editor = createTestEditor();
    typeText(editor, '# ');
    expect(getEscapeSuggestion(editor.state)).not.toBeNull();
    typeText(editor, 'title');
    expect(getEscapeSuggestion(editor.state)).toBeNull();
    expect(firstBlock(editor)).toEqual({ type: 'heading', text: 'title' });
    editor.destroy();
  });

  /**
   * 9.260 / E2-46 — THE TYPED LINK IS COVERED BY THE ESCAPE MECHANIC, and the
   * "asymmetry" the code and two catalogues recorded was the PROBE, not the
   * trigger.
   *
   * What was recorded (`src/schema/extensions.ts`, `test/schema.test.ts` 9.95,
   * `test-cases/16-remaining-doors.md`): *"a typed link fires an input rule but
   * offers no escape suggestion where `**due soon**` does"*, with the cause
   * explicitly left unestablished and an owner named for whoever came next.
   * The two probes were not run under the same conditions: the link probe typed
   * `'see [the doc](https://gst.gov.in) now'` — text AFTER the trigger — while
   * the bold probe it was compared against typed `'x **b**'` with nothing after.
   * **Continuing to type dismisses the suggestion**, which is 9.92's whole
   * subject and the spec's own words (`escape-suggestion.ts`'s `apply`: "dismiss
   * by continuing to type or clicking elsewhere"). So the link probe measured a
   * dismissed chip and the bold probe a live one.
   *
   * This case is a 2x2, not a single reading: BOTH triggers, each under BOTH
   * conditions. The bold row is the control — it shows the same fall-off without
   * any link involved — so a green result here cannot be explained by "links are
   * special". Reverse the fix and this case fails on the link-at-end row, which
   * is the row the table above now carries.
   */
  it('9.260 — the typed link is offered the escape suggestion, and continuing to type dismisses it exactly as it does for bold', () => {
    const LINK = 'see [the doc](https://gst.gov.in)';
    const BOLD = 'x **b**';
    const read = (typed: string): ReturnType<typeof getEscapeSuggestion> => {
      const editor = createTestEditor();
      typeText(editor, typed);
      const suggestion = getEscapeSuggestion(editor.state);
      editor.destroy();
      return suggestion;
    };

    // The trigger is offered the suggestion — the claim the code denied.
    expect(read(LINK)).toEqual({ literal: LINK });
    // The control: same condition, the trigger everyone agreed was covered.
    expect(read(BOLD)).toEqual({ literal: BOLD });

    // And continuing to type dismisses it for BOTH — so the two conditions, not
    // the two triggers, are what the recorded comparison actually differed by.
    expect(read(`${LINK} now`)).toBeNull();
    expect(read(`${BOLD} tail`)).toBeNull();
  });

});

describe('non-triggers stay literal with no suggestion', () => {
  /**
   * 9.94 — two non-triggers stay literal with no suggestion offered at all: a line
   * containing pipe characters, and a bare URL — no `<a>` in the rendered HTML for
   * either.
   *
   * ⚠ THE THIRD ARM WAS REMOVED 2026-09-21, FOR A MEASURED REASON AND NOT A TIDY ONE.
   * It asserted that a typed `[the doc](http://x)` stays literal — true while
   * `markdownLinks` was false. The owner reversed that option on 2026-09-20, so typing
   * a markdown link now CREATES the link, and the arm could only have been kept by
   * asserting the old behaviour as the current one. What replaced it is in
   * `schema.test.ts`, which pins what the typed link now does, **and in this file's
   * own trigger table plus 9.260**, which pin that the typed link IS offered the
   * escape suggestion. (This sentence previously claimed the opposite — that the
   * suggestion is "measurably NOT offered". E2-46 measured it and that is false;
   * 9.260 is the 2x2 that separates the trigger from the probe's conditions.)
   */
  it.each([
    { typed: 'a | b | c', literal: 'a | b | c' },
    { typed: 'go to https://example.com now', literal: 'https://example.com' },
  ])('"$literal" stays literal', ({ typed, literal }) => {
    const editor = createTestEditor();
    typeText(editor, typed);
    expect(editor.state.doc.textContent).toContain(literal);
    expect(editor.getHTML()).not.toContain('<a ');
    expect(getEscapeSuggestion(editor.state)).toBeNull();
    editor.destroy();
  });
});
