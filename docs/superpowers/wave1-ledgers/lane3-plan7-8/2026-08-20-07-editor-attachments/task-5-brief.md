### Task 5: The escape-suggestion mechanic (spec §2's named requirement)

**Files:**
- Create: `packages/editor/src/extensions/escape-suggestion.ts`
- Modify: `packages/editor/src/schema/extensions.ts` (add EscapeSuggestion)
- Modify: `packages/editor/src/styles/editor.css` (chip structure)
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/escape-suggestion.test.ts`

**Interfaces:**
- Consumes: `buildEditorExtensions`, `typeText` (Task 1).
- Produces:
  - Extension `EscapeSuggestion` (part of `buildEditorExtensions` — every surface gets it).
  - `getEscapeSuggestion(state: EditorState): { literal: string } | null` — the observable suggestion state (tests and toolbars read it).
  - Behavior contract (the spec mechanic, exactly): when a typed reserved sequence triggers markdown-style autoformatting, the formatting applies **and** an inline chip appears offering the escaped literal. **Accepting** (click the chip, or Backspace — Tiptap's core keymap already routes Backspace through `undoInputRule` first) reverts the autoformat so the typed characters stand as literal text; **dismissing** (Escape, or simply continuing to type/click elsewhere) keeps the formatting and drops the chip. Nothing silently becomes markup: every conversion is announced and reversible at the moment it happens, and the literal is always reachable.
  - The reserved-sequence trigger table (exhaustive for schema v1 — these are precisely the enabled input rules):

| Typed sequence (at block start where marked ⏎) | Would become |
|---|---|
| `# ` … `###### ` ⏎ | heading 1–6 |
| `- `, `* `, `+ ` ⏎ | bullet list |
| `1. ` (any number) ⏎ | ordered list |
| `> ` ⏎ | blockquote |
| ```` ``` ```` ⏎ | code block |
| `---` ⏎ | horizontal rule |
| `**x**`, `__x__` | bold |
| `*x*`, `_x_` | italic |
| `~~x~~` | strike |
| `` `x` `` | inline code |

  - Non-triggers, asserted literal in the same suite: `[text](url)` (no markdown-link input rule in schema v1), `|` (tables come from the toolbar, never autoformat), bare URLs (autolink off — Task 1), `@` (mention picker with its own Escape path — Task 4).
  - BEM classes `escape-chip`, `escape-chip__label`, `escape-chip__hint`.

- [ ] **Step 1: Verify the input-rule store against the installed @tiptap/core**

The extension reads the same store Tiptap's own `undoInputRule` command reads: the input-rules plugin flags itself and keeps the last-applied rule as `{ transform, from, to, text }` until the next doc- or selection-changing transaction. Confirm both facts before building on them:

Run: `grep -rn "isInputRules" node_modules/@tiptap/core/dist/ | head -5` and `grep -rn "undoInputRule" node_modules/@tiptap/core/dist/index.js | head -5`
Expected: the plugin spec carries `isInputRules: true` (or an equivalently named flag) and `undoInputRule` scans `state.plugins` for it, reading a stored object with a `transform`. If the flag name differs in the installed minor, use the name found here in `findAppliedInputRule` below — the lookup strategy stays identical to the core command's.

- [ ] **Step 2: Write the failing tests**

`packages/editor/test/escape-suggestion.test.ts`:

```ts
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
  { typed: '``` ', label: 'code block', formatted: (e) => firstBlock(e).type === 'codeBlock' },
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
];

const MARK_TRIGGERS: Trigger[] = [
  { typed: 'x **bold**', label: 'bold **', formatted: (e) => e.getHTML().includes('<strong') },
  { typed: 'x __bold__', label: 'bold __', formatted: (e) => e.getHTML().includes('<strong') },
  { typed: 'x *it*', label: 'italic *', formatted: (e) => e.getHTML().includes('<em') },
  { typed: 'x _it_', label: 'italic _', formatted: (e) => e.getHTML().includes('<em') },
  { typed: 'x ~~st~~', label: 'strike', formatted: (e) => e.getHTML().includes('<s') },
  { typed: 'x `co`', label: 'inline code', formatted: (e) => e.getHTML().includes('<code') },
];

describe('escape suggestion — every reserved sequence, planted-defect style', () => {
  it.each([...BLOCK_TRIGGERS, ...MARK_TRIGGERS])(
    '$label: formatting applies, the suggestion appears, accepting yields literal text',
    ({ typed, formatted }) => {
      const editor = createTestEditor();
      typeText(editor, typed);

      // The autoformat happened (dismissing would keep exactly this)…
      expect(formatted(editor), `"${typed}" should have autoformatted`).toBe(true);
      // …and the suggestion is on offer, with a chip in the DOM.
      const suggestion = getEscapeSuggestion(editor.state);
      expect(suggestion, `no suggestion after typing "${typed}"`).not.toBeNull();
      expect(editor.view.dom.querySelector('[data-escape-chip]')).not.toBeNull();

      // Accept: the literal typed characters stand, the formatting is gone.
      expect(editor.commands.undoInputRule()).toBe(true);
      expect(formatted(editor), `accepting the escape must undo "${typed}"`).toBe(false);
      expect(editor.state.doc.textContent).toContain(typed.trim());
      expect(getEscapeSuggestion(editor.state)).toBeNull();
      expect(editor.view.dom.querySelector('[data-escape-chip]')).toBeNull();
      editor.destroy();
    },
  );

  it('Backspace accepts (core keymap routes it through undoInputRule)', () => {
    const editor = createTestEditor();
    typeText(editor, '# ');
    expect(firstBlock(editor).type).toBe('heading');
    expect(editor.commands.keyboardShortcut('Backspace')).toBe(true);
    expect(firstBlock(editor)).toEqual({ type: 'paragraph', text: '# ' });
    editor.destroy();
  });

  it('clicking the chip accepts', () => {
    const editor = createTestEditor();
    typeText(editor, 'x **bold**');
    const chip = editor.view.dom.querySelector('[data-escape-chip]') as HTMLButtonElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain('**bold**');
    chip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(editor.getHTML()).not.toContain('<strong');
    expect(editor.state.doc.textContent).toContain('**bold**');
    editor.destroy();
  });

  it('Escape dismisses: the formatting stays, the chip goes', () => {
    const editor = createTestEditor();
    typeText(editor, '# ');
    expect(getEscapeSuggestion(editor.state)).not.toBeNull();
    expect(pressEscape(editor)).toBe(true);
    expect(getEscapeSuggestion(editor.state)).toBeNull();
    expect(editor.view.dom.querySelector('[data-escape-chip]')).toBeNull();
    expect(firstBlock(editor).type).toBe('heading');
    editor.destroy();
  });

  it('continuing to type dismisses: the formatting stays', () => {
    const editor = createTestEditor();
    typeText(editor, '# ');
    expect(getEscapeSuggestion(editor.state)).not.toBeNull();
    typeText(editor, 'title');
    expect(getEscapeSuggestion(editor.state)).toBeNull();
    expect(firstBlock(editor)).toEqual({ type: 'heading', text: 'title' });
    editor.destroy();
  });

  it('Escape without an active suggestion is not consumed', () => {
    const editor = createTestEditor();
    typeText(editor, 'plain');
    expect(pressEscape(editor)).toBe(false);
    editor.destroy();
  });
});

describe('non-triggers stay literal with no suggestion', () => {
  it.each([
    { typed: 'see [the doc](http://x) now', literal: '[the doc](http://x)' },
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/escape-suggestion.test.ts`
Expected: FAIL — cannot resolve `../src/extensions/escape-suggestion.js`.

- [ ] **Step 4: Implement the extension**

`packages/editor/src/extensions/escape-suggestion.ts`:

```ts
import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Spec §2's named mechanic: when a typed reserved character sequence
 * triggers formatting, surface an inline suggestion offering the escaped
 * literal, so nothing silently becomes markup. Accepting keeps the literal
 * text; dismissing keeps the formatting.
 *
 * Mechanism: Tiptap's input-rules plugin stores the just-applied rule as
 * `{ transform, from, to, text }` — the store its own `undoInputRule`
 * command consumes — and clears it on the next doc- or selection-changing
 * transaction. That store IS our trigger signal:
 *   - store holds a record  → an autoformat just happened → offer the chip
 *   - accept               → `undoInputRule` (restores the literal text; the
 *                            revert is a transaction, not typed input, so no
 *                            rule re-fires on it)
 *   - dismiss              → Escape marks the record dismissed; typing or
 *                            moving the selection clears the store natively
 */

type InputRuleRecord = { transform: unknown; from: number; to: number; text: string };

type EscapePluginState = { dismissed: InputRuleRecord | null };

export const escapeSuggestionKey = new PluginKey<EscapePluginState>('escapeSuggestion');

/** Mirrors @tiptap/core's undoInputRule lookup (verified in Task 5 Step 1). */
function findAppliedInputRule(state: EditorState): InputRuleRecord | null {
  for (const plugin of state.plugins) {
    const spec = plugin.spec as { isInputRules?: boolean };
    if (!spec.isInputRules) continue;
    const stored = plugin.getState(state) as Partial<InputRuleRecord> | null | undefined;
    if (
      stored &&
      stored.transform !== undefined &&
      typeof stored.from === 'number' &&
      typeof stored.text === 'string'
    ) {
      return stored as InputRuleRecord;
    }
  }
  return null;
}

/** The suggestion currently on offer, if any — tests and toolbars read this. */
export function getEscapeSuggestion(state: EditorState): { literal: string } | null {
  const record = findAppliedInputRule(state);
  if (!record) return null;
  const dismissed = escapeSuggestionKey.getState(state)?.dismissed ?? null;
  if (dismissed === record) return null;
  return { literal: record.text };
}

function buildChip(literal: string, onAccept: () => void): HTMLElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'escape-chip';
  chip.setAttribute('data-escape-chip', '');
  chip.contentEditable = 'false';

  const label = document.createElement('span');
  label.className = 'escape-chip__label';
  const shown = literal.trim() === '' ? literal : literal.trim();
  label.textContent = `Keep "${shown}" as text`;
  chip.appendChild(label);

  const hint = document.createElement('span');
  hint.className = 'escape-chip__hint';
  hint.textContent = 'Backspace or click · Esc keeps formatting';
  chip.appendChild(hint);

  // mousedown, not click: it fires before the editor loses focus.
  chip.addEventListener('mousedown', (event) => {
    event.preventDefault();
    onAccept();
  });
  return chip;
}

export const EscapeSuggestion = Extension.create({
  name: 'escapeSuggestion',

  addKeyboardShortcuts() {
    return {
      Escape: () => {
        if (!getEscapeSuggestion(this.editor.state)) return false;
        // Dismiss: the formatting stands; only the offer is withdrawn.
        this.editor.view.dispatch(this.editor.state.tr.setMeta(escapeSuggestionKey, 'dismiss'));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<EscapePluginState>({
        key: escapeSuggestionKey,
        state: {
          init: () => ({ dismissed: null }),
          apply(tr, value, _oldState, newState) {
            if (tr.getMeta(escapeSuggestionKey) === 'dismiss') {
              // A setMeta-only transaction changes neither doc nor selection,
              // so the input-rule store still holds the record: mark exactly
              // that object dismissed. New rule applications are new objects.
              return { dismissed: findAppliedInputRule(newState) };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const suggestion = getEscapeSuggestion(state);
            if (!suggestion) return null;
            const chip = Decoration.widget(
              state.selection.from,
              () =>
                buildChip(suggestion.literal, () => {
                  // Accept: revert the autoformat; the typed characters
                  // stand as literal text. undoInputRule dispatches a
                  // doc-changing transaction, which clears the store and
                  // with it the chip.
                  editor.commands.undoInputRule();
                }),
              { side: 1, key: 'escape-suggestion-chip' },
            );
            return DecorationSet.create(state.doc, [chip]);
          },
        },
      }),
    ];
  },
});
```

- [ ] **Step 5: Wire into the schema, styles, and exports**

In `packages/editor/src/schema/extensions.ts`, add the import and append `EscapeSuggestion` as the LAST entry of the returned array (after `Mention.configure(...)`):

```ts
import { EscapeSuggestion } from '../extensions/escape-suggestion.js';
```

```ts
    EscapeSuggestion,
```

Append to `packages/editor/src/styles/editor.css`:

```css
/* Escape-suggestion chip: inline widget after the caret. */
.escape-chip {
  display: inline-flex;
  gap: 0.375rem;
  align-items: baseline;
  margin-left: 0.375rem;
  padding: 0.0625rem 0.375rem;
  font-size: 0.75rem;
  vertical-align: baseline;
  cursor: pointer;
  user-select: none;
}
.escape-chip__hint {
  font-size: 0.625rem;
  opacity: 0.7;
}
```

Append to `packages/editor/src/index.ts`:

```ts
export { EscapeSuggestion, escapeSuggestionKey, getEscapeSuggestion } from './extensions/escape-suggestion.js';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/escape-suggestion.test.ts`
Expected: PASS — 19 trigger cases, 3 accept/dismiss paths, 1 no-op Escape, 3 literal non-triggers. If the `it.each` for `'``` '` trips on the code-block rule wanting a newline instead of a trailing space in the installed minor, adjust that ONE `typed` string to `'```\n'`-equivalent per the rule's regex in `@tiptap/extension-code-block` — the assertion stays identical.

- [ ] **Step 7: Run the whole editor suite (regression: mention + image untouched)**

Run: `pnpm --filter @gisik-nokma/editor test`
Expected: PASS across schema, image, mention, escape suites.

- [ ] **Step 8: Commit**

```bash
git add packages/editor
git commit -m "Escape suggestions: every autoformat announces itself with an inline chip — accept keeps the typed characters literal, dismiss keeps the formatting; all 13 block and 6 mark triggers planted-defect proven, non-triggers proven literal"
```

---

