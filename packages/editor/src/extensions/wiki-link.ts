import { mergeAttributes, Node } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { createWikiLinkPopup } from './wiki-link-popup.js';

/** A note this editor may link to: the id it stores and the title it shows. */
export type NoteLinkCandidate = { noteId: string; title: string };

export type WikiLinkOptions = {
  /** The host's note search. Absent → the picker offers nothing (spec §8.5). */
  queryNotes: (query: string) => Promise<NoteLinkCandidate[]>;
  /**
   * The live title for a note id, or `null` when the target is missing or the
   * reader may not see it. **`undefined` is a THIRD answer and must stay
   * distinguishable**: it means the host supplied no resolver at all, and the
   * stored title is then the best available one. `null` is a statement that
   * the note is gone; `undefined` is silence.
   */
  resolveNoteTitle?: (noteId: string) => string | null;
  /** First ~200 characters of the target's plain text, for the hover card. */
  previewNote?: (noteId: string) => Promise<string | null>;
  /** Following the link is the HOST's navigation, not the editor's. */
  onNavigateNote?: (noteId: string) => void;
};

export const wikiLinkSuggestionKey = new PluginKey('wikiLinkSuggestion');
export const noteRefSuggestionKey = new PluginKey('noteRefSuggestion');

/** The `:note` trigger. No trailing space: see `ticket-ref.ts`'s identical note on `char`. */
const NOTE_TRIGGER = ':note';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      insertWikiLink: (attrs: NoteLinkCandidate) => ReturnType;
    };
  }
}

/**
 * The `wikiLink` node of schema v2 (spec §8.5): `{ noteId, title }`, inline and
 * atomic, rendered as a link to `/notes/<id>`.
 *
 * ## TWO ATTRS, AND THE SECOND IS A CACHE WITH A RULE
 *
 * `noteId` is the identity; `title` is the title AS IT WAS when the link was
 * made. Keeping the title is what lets a document still read as prose when the
 * resolver is silent, or when the reader cannot see the target — the
 * alternative, storing only the id, makes every link render as a ULID in every
 * surface that has no note list. The display rule is therefore a three-way
 * choice and lives in the node view below: resolver says a string → show it
 * (rename-following); resolver says `null` → the target is gone, show the pill;
 * there is no resolver → show the stored title.
 *
 * ## THE DOM SHAPE IS THE MESSAGE
 *
 * `data-note-id` is the parse discriminator, exactly as `data-mention-user-id`
 * is on the mention node: an `<a>` pasted from any web page is not one of this
 * product's wiki-links, and matching the bare tag would turn arbitrary markup
 * into a claim about a note. `href` is written for the cases where the element
 * survives without a node view (HTML export, a paste round trip).
 */
export const WikiLink = Node.create<WikiLinkOptions>({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { queryNotes: async () => [] };
  },

  addAttributes() {
    return {
      noteId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-note-id') ?? '',
        renderHTML: (attributes) => ({ 'data-note-id': attributes.noteId }),
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-note-title') ?? element.textContent ?? '',
        renderHTML: (attributes) => ({ 'data-note-title': attributes.title }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-note-id]' }, { tag: 'span[data-note-id]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        class: 'editor-wikilink',
        href: `/notes/${String(node.attrs['noteId'])}`,
      }),
      String(node.attrs['title']),
    ];
  },

  renderText({ node }) {
    // The plain-text projection (`docToPlainText`) is the reader this serves,
    // and it must agree with the node's own `wikiLink` branch there: the TITLE,
    // never the id.
    return String(node.attrs['title']);
  },

  addNodeView() {
    // An arrow so `this` stays the extension: `options` is read once, when the
    // view is built, which is the same lifetime `configure` has.
    return ({ node }) => {
      const stored: string = String(node.attrs['title']);
      const noteId: string = String(node.attrs['noteId']);
      const resolver = this.options.resolveNoteTitle;
      const resolved = resolver === undefined ? stored : resolver(noteId);
      const missing = resolved === null;
      const dom = document.createElement(missing ? 'span' : 'a');
      dom.className = missing
        ? 'editor-wikilink editor-wikilink--missing'
        : 'editor-wikilink';
      dom.setAttribute('data-note-id', noteId);
      dom.setAttribute('data-note-title', stored);
      dom.textContent = missing ? stored : resolved;
      if (!missing) {
        dom.setAttribute('href', `/notes/${noteId}`);
        dom.addEventListener('click', (event) => {
          const navigate = this.options.onNavigateNote;
          if (navigate === undefined) return;
          event.preventDefault();
          navigate(noteId);
        });
        const preview = this.options.previewNote;
        if (preview !== undefined) attachHoverPreview(dom, () => preview(noteId));
      }
      return { dom };
    };
  },

  addCommands() {
    return {
      insertWikiLink:
        (attrs) =>
        ({ chain, state }) => {
          // THE SECOND DOOR, and it is not redundant: `allow` gates the
          // PICKER, and this is a public command a host can call directly —
          // the toolbar's `[[` button does. Both refuse for the same measured
          // reason: the insertion splits a code block around the caret.
          if (state.selection.$from.parent.type.spec.code === true) return false;
          return chain()
            .insertContent([{ type: this.name, attrs }, { type: 'text', text: ' ' }])
            .run();
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<NoteLinkCandidate, NoteLinkCandidate>({
        editor: this.editor,
        pluginKey: wikiLinkSuggestionKey,
        char: '[[',
        // A note title routinely contains a space, so the match must not stop
        // at the first one — `@tiptap/suggestion`'s own option.
        allowSpaces: true,
        // NO PICKER IN CODE. `[[` is literal text there, and the command it
        // would run inserts a node beside the caret — measured, it split a
        // code block in two exactly as a Markdown paste did. The gate is here
        // rather than only in `command` so the popup never opens and no query
        // is ever sent.
        allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.spec.code !== true,
        items: async ({ query }) => (await this.options.queryNotes(query)).slice(0, 8),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertWikiLink(props)
            .run();
        },
        render: () => createWikiLinkPopup(),
      }),
      // Plan 7 Task 2 (spec §14, D26): a SECOND trigger on the same node —
      // `:note` inserts the identical `wikiLink { noteId, title }` node `[[`
      // does, through the same command and the same popup. A distinct
      // `PluginKey` is required: ProseMirror refuses two plugins sharing one
      // key at construction time, which is this task's own mutation (9.307).
      Suggestion<NoteLinkCandidate, NoteLinkCandidate>({
        editor: this.editor,
        pluginKey: noteRefSuggestionKey,
        char: NOTE_TRIGGER,
        allowSpaces: true,
        allow: ({ state, range }) => {
          // The same code-block gate the `[[` plugin uses above.
          if (state.doc.resolve(range.from).parent.type.spec.code === true) return false;
          // NO wiki-link COUNTERPART FOR THE SECOND HALF, for the reason
          // `ticket-ref.ts`'s identical gate explains: `char` carries no
          // trailing space, so the library's own matcher accepts a run-on
          // word right after the trigger — `:notebook` would otherwise match
          // with query `book`. Case 9.308 pins one behaviour: legitimate only
          // when the query is empty (nothing typed yet) or starts with
          // whitespace (a real word boundary). `[[` needs no such gate — it is
          // punctuation, not a prefix any English word starts with.
          const matched = state.doc.textBetween(range.from, range.to);
          const query = matched.slice(NOTE_TRIGGER.length);
          return query.length === 0 || /^\s/.test(query);
        },
        // TRIMMED, UNLIKE THE `[[` PLUGIN ABOVE: `:note co` matches with query
        // ` co` (a leading space, the same shape `:ticket comp` has in
        // `ticket-ref.ts`) — `[[co` has no leading space to trim because `[[`
        // itself carries none of the query's own characters.
        items: async ({ query }) => (await this.options.queryNotes(query.trim())).slice(0, 8),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertWikiLink(props)
            .run();
        },
        render: () => createWikiLinkPopup(),
      }),
    ];
  },
});

/** How long the pointer must rest on a link before the card is fetched (spec §8.5). */
const HOVER_DELAY_MS = 400;
/** Characters of the target's plain text the card shows. */
const PREVIEW_CHARS = 200;

/**
 * The hover card (spec §8.5): rest on a link for 400 ms and see the first 200
 * characters of what it points at. Plain DOM, like the node and the popup —
 * this package's plugin UI stays out of the React tree.
 *
 * A `null` from `load` shows NOTHING rather than an empty card: the target is
 * gone or unreadable, and a card that opened to say so would be a second,
 * quieter version of the missing pill the link already wears. The timer is
 * cleared on `mouseleave` so a passing pointer never fires a fetch, and the
 * card is removed on both `mouseleave` and a second `mouseenter`.
 */
function attachHoverPreview(element: HTMLElement, load: () => Promise<string | null>): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let card: HTMLDivElement | null = null;

  const removeCard = (): void => {
    card?.remove();
    card = null;
  };

  element.addEventListener('mouseenter', () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void load().then(
        (text) => {
          if (text === null) return;
          removeCard();
          card = document.createElement('div');
          card.className = 'wikilink-preview';
          card.textContent = text.slice(0, PREVIEW_CHARS);
          document.body.appendChild(card);
        },
        () => undefined,
      );
    }, HOVER_DELAY_MS);
  });

  element.addEventListener('mouseleave', () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    removeCard();
  });
}
