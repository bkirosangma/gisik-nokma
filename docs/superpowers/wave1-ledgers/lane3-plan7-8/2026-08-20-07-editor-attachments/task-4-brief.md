### Task 4: Mention node and picker

**Files:**
- Create: `packages/editor/src/extensions/mention.ts`
- Create: `packages/editor/src/extensions/mention-popup.ts`
- Modify: `packages/editor/src/schema/extensions.ts` (add Mention)
- Modify: `packages/editor/src/styles/editor.css` (popup structure)
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/mention.test.ts`

**Interfaces:**
- Consumes: `buildEditorExtensions` (Task 1), `typeText` helper (Task 1).
- Produces (cross-plan API):
  - Node `mention`, inline atom, attrs `{ userId: string; label: string }`. `label` is the person's display name **captured at insertion time** — a claim like any other, and the reason the dependency-free `docToPlainText` can render `@name` without a user directory (see Task 6 and Open questions 2).
  - `type MentionCandidate = { userId: string; name: string }`.
  - `MentionOptions = { queryUsers(query: string): Promise<MentionCandidate[]> }` — wired through `buildEditorExtensions`' `queryUsers`.
  - Behavior contract: typing `@` opens the picker; Enter/click inserts a mention node plus a trailing space; **Escape dismisses and the typed text stays literal** (`@…` never silently becomes markup — spec §2's escape principle applied to the one non-input-rule trigger).
  - BEM classes `mention-popup`, `mention-popup__item`, `mention-popup__item--selected`, `editor-mention`.

- [ ] **Step 1: Write the failing test**

`packages/editor/test/mention.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

const USERS = [
  { userId: '01J9GUSA000000000000000000', name: 'Anselma' },
  { userId: '01J9GUSB000000000000000000', name: 'Anand' },
];

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
      expect(document.querySelectorAll('.mention-popup__item').length).toBe(2);
    });
    expect(queryUsers).toHaveBeenCalledWith('an');
  });

  it('clicking a candidate inserts a mention node {userId, label} plus a space', async () => {
    editor = createTestEditor({ queryUsers: async () => USERS });
    typeText(editor, '@ans');
    await vi.waitFor(() => {
      expect(document.querySelector('.mention-popup__item')).not.toBeNull();
    });
    const first = document.querySelector('.mention-popup__item') as HTMLButtonElement;
    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const mentions = mentionNodes(editor.getJSON());
    expect(mentions).toEqual([{ userId: USERS[0]!.userId, label: 'Anselma' }]);
    // The trigger text `@ans` was consumed by the insertion.
    expect(editor.getText()).not.toContain('@ans');
    editor.destroy();
    editor = null;
  });

  it('Enter selects the highlighted candidate', async () => {
    editor = createTestEditor({ queryUsers: async () => USERS });
    typeText(editor, '@an');
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.mention-popup__item').length).toBe(2);
    });
    pressKey(editor, 'ArrowDown');
    pressKey(editor, 'Enter');
    const mentions = mentionNodes(editor.getJSON());
    expect(mentions).toEqual([{ userId: USERS[1]!.userId, label: 'Anand' }]);
  });

  it('planted defect: Escape dismisses the picker and the typed text stays literal', async () => {
    editor = createTestEditor({ queryUsers: async () => USERS });
    typeText(editor, '@an');
    await vi.waitFor(() => {
      expect(document.querySelector('.mention-popup')).not.toBeNull();
    });
    pressKey(editor, 'Escape');
    expect(document.querySelector('.mention-popup')).toBeNull();
    expect(mentionNodes(editor.getJSON())).toEqual([]);
    expect(editor.getText()).toContain('@an');
  });

  it('getText renders a mention as @label', async () => {
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
        { type: 'paragraph', content: [{ type: 'mention', attrs: { userId: USERS[1]!.userId, label: 'Anand' } }] },
      ],
    };
    editor.commands.setContent(doc);
    const json = editor.getJSON();
    expect(mentionNodes(json)).toEqual([{ userId: USERS[1]!.userId, label: 'Anand' }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/mention.test.ts`
Expected: FAIL — `mention` is not a schema node (setContent test throws / picker never appears).

- [ ] **Step 3: Implement the popup**

`packages/editor/src/extensions/mention-popup.ts`:

```ts
import type { MentionCandidate } from './mention.js';

export type MentionPopupProps = {
  items: MentionCandidate[];
  command: (item: MentionCandidate) => void;
  clientRect?: (() => DOMRect | null) | null;
};

export type MentionPopupRenderer = {
  onStart(props: MentionPopupProps): void;
  onUpdate(props: MentionPopupProps): void;
  onKeyDown(props: { event: KeyboardEvent }): boolean;
  onExit(): void;
};

/**
 * Plain-DOM suggestion popup — no React, so the exact same code serves
 * the Next.js client, Tauri, the RN webview bundle, and headless tests
 * (the knowledge-base convention: plugin UI stays out of the React tree).
 */
export function createMentionPopup(): MentionPopupRenderer {
  let container: HTMLDivElement | null = null;
  let items: MentionCandidate[] = [];
  let command: (item: MentionCandidate) => void = () => {};
  let selectedIndex = 0;

  function paint(): void {
    if (!container) return;
    container.replaceChildren();
    items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        index === selectedIndex
          ? 'mention-popup__item mention-popup__item--selected'
          : 'mention-popup__item';
      button.textContent = item.name;
      // mousedown, not click: it fires before the editor loses focus.
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        command(item);
      });
      container?.appendChild(button);
    });
  }

  function position(clientRect?: (() => DOMRect | null) | null): void {
    if (!container) return;
    const rect = clientRect?.();
    if (!rect) return; // jsdom / detached: leave it unpositioned but present
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.bottom}px`;
  }

  function destroy(): void {
    container?.remove();
    container = null;
  }

  return {
    onStart(props) {
      container = document.createElement('div');
      container.className = 'mention-popup';
      container.style.position = 'absolute';
      document.body.appendChild(container);
      items = props.items;
      command = props.command;
      selectedIndex = 0;
      paint();
      position(props.clientRect);
    },
    onUpdate(props) {
      items = props.items;
      command = props.command;
      if (selectedIndex >= items.length) selectedIndex = 0;
      paint();
      position(props.clientRect);
    },
    onKeyDown({ event }) {
      const count = Math.max(items.length, 1);
      if (event.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % count;
        paint();
        return true;
      }
      if (event.key === 'ArrowUp') {
        selectedIndex = (selectedIndex - 1 + count) % count;
        paint();
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) command(item);
        return true;
      }
      if (event.key === 'Escape') {
        // Dismiss: the typed `@…` stays literal text — nothing silently
        // becomes markup (spec §2).
        destroy();
        return true;
      }
      return false;
    },
    onExit() {
      destroy();
    },
  };
}
```

- [ ] **Step 4: Implement the mention node**

`packages/editor/src/extensions/mention.ts`:

```ts
import { Node, mergeAttributes } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { createMentionPopup, type MentionPopupRenderer } from './mention-popup.js';

export type MentionCandidate = { userId: string; name: string };

export type MentionOptions = {
  queryUsers(query: string): Promise<MentionCandidate[]>;
};

export const mentionSuggestionKey = new PluginKey('mentionSuggestion');

export const Mention = Node.create<MentionOptions>({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { queryUsers: async () => [] };
  },

  addAttributes() {
    return {
      userId: { default: null },
      /** Display name at insertion time — the claim `docToPlainText` renders as @label. */
      label: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention-user-id]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          return {
            userId: el.getAttribute('data-mention-user-id'),
            label: (el.textContent ?? '').replace(/^@/, ''),
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-mention-user-id': node.attrs.userId as string,
        class: 'editor-mention',
      }),
      `@${node.attrs.label as string}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label as string}`;
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<MentionCandidate>({
        editor: this.editor,
        pluginKey: mentionSuggestionKey,
        char: '@',
        items: ({ query }) => this.options.queryUsers(query),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: this.name, attrs: { userId: props.userId, label: props.name } },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        render: (): {
          onStart: MentionPopupRenderer['onStart'];
          onUpdate: MentionPopupRenderer['onUpdate'];
          onKeyDown: MentionPopupRenderer['onKeyDown'];
          onExit: MentionPopupRenderer['onExit'];
        } => createMentionPopup(),
      }),
    ];
  },
});
```

- [ ] **Step 5: Wire into the schema, styles, and exports**

In `packages/editor/src/schema/extensions.ts`, add the import and append after `TicketImage.configure(...)`:

```ts
import { Mention } from '../extensions/mention.js';
```

```ts
    Mention.configure({ queryUsers: options.queryUsers ?? (async () => []) }),
```

Append to `packages/editor/src/styles/editor.css`:

```css
/* Mention picker popup (structure only; colours come from ui tokens later). */
.mention-popup {
  position: absolute;
  z-index: 30;
  display: flex;
  flex-direction: column;
  min-width: 10rem;
}
.mention-popup__item {
  text-align: left;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
}
.editor-mention {
  white-space: nowrap;
}
```

Append to `packages/editor/src/index.ts`:

```ts
export { Mention, mentionSuggestionKey, type MentionCandidate, type MentionOptions } from './extensions/mention.js';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/mention.test.ts test/schema.test.ts`
Expected: PASS. If `Suggestion`'s generic import differs in the installed minor (`Suggestion<MentionCandidate>` vs untyped `Suggestion`), drop the generic and cast `props` inside `command` — the runtime call shape is stable.

- [ ] **Step 7: Commit**

```bash
git add packages/editor
git commit -m "Mention node and picker: {userId, label} atoms via @tiptap/suggestion with a plain-DOM popup; Escape leaves the typed text literal, planted-defect proven"
```

---

