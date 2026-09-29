import { mergeAttributes, Node } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { PURGED_ITEM_LABEL, type PurgedPredicate } from '@gisik-nokma/domain';
import Suggestion from '@tiptap/suggestion';
import { placePopover } from '../components/popover-position.js';
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
  /** Trash series Plan 3 (T11): the linked note was permanently erased — asked before `resolveNoteTitle`. */
  isPurged?: PurgedPredicate;
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
    if (this.options.isPurged?.('note', String(node.attrs['noteId'])) === true) {
      return ['span', mergeAttributes(HTMLAttributes, { class: 'editor-wikilink editor-wikilink--purged' }), PURGED_ITEM_LABEL];
    }
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
    if (this.options.isPurged?.('note', String(node.attrs['noteId'])) === true) return PURGED_ITEM_LABEL;
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
      if (this.options.isPurged?.('note', noteId) === true) {
        const dom = document.createElement('span');
        dom.className = 'editor-wikilink editor-wikilink--purged';
        dom.setAttribute('data-note-id', noteId);
        dom.setAttribute('data-note-title', stored);
        dom.textContent = PURGED_ITEM_LABEL;
        return { dom };
      }
      const resolver = this.options.resolveNoteTitle;
      const resolved = resolver === undefined ? stored : resolver(noteId);
      const missing = resolved === null;
      let dismissPreview: (() => void) | undefined;
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
        if (preview !== undefined) dismissPreview = attachHoverPreview(dom, () => preview(noteId));
      }
      return { dom, destroy: () => dismissPreview?.() };
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
/**
 * How long the card outlives the pointer leaving the link, so a pointer that
 * crosses the gap between the link and the card (or overshoots it) does not
 * lose the card on the way. The knowledge-base reference's own figure.
 */
const LEAVE_GRACE_MS = 60;
/** Characters of the target's plain text the card shows. */
const PREVIEW_CHARS = 200;

let previewSeq = 0;

/**
 * The hover card (spec §8.5): rest on a link for 400 ms and see the first 200
 * characters of what it points at. Plain DOM, like the node and the popup —
 * this package's plugin UI stays out of the React tree.
 *
 * ## KB EDITOR PARITY — what the reference's `WikiLinkHoverCard` taught it
 *
 * The first cut appended a `position: absolute` card with NO offsets, so it
 * landed wherever the body's flow ended — not beside the link. Now it is
 * `position: fixed`, placed from the link's own rect by the shared
 * `placePopover` (below the link, flipped above when it would clip, clamped to
 * the viewport). It is HOVERABLE: leaving the link starts a 60 ms grace, and
 * entering the card cancels it, so the card can be reached and its text
 * selected. It is dismissed by scrolling, by any key (an edit is coming), by
 * Escape, and by the link leaving the document. The delay stays 400 ms — spec
 * §8.5's number — where the reference's is 200 ms.
 *
 * Not ported: the reference's heading line and "N backlinks · size" footer.
 * `previewNote` answers with plain text only, and a backlink count is the
 * follow-up the brief says to report, not build.
 *
 * A `null` from `load` shows NOTHING rather than an empty card: the target is
 * gone or unreadable, and a card that opened to say so would be a second,
 * quieter version of the missing pill the link already wears. The timer is
 * cleared on `mouseleave` so a passing pointer never fires a fetch, and a
 * fetch that resolves AFTER the pointer left shows nothing either.
 */
function attachHoverPreview(element: HTMLElement, load: () => Promise<string | null>): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | null = null;
  let card: HTMLDivElement | null = null;
  // Bumped on every leave/dismiss: a fetch started under an older value is stale.
  let generation = 0;

  const cancelLeave = (): void => {
    if (leaveTimer !== null) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
  };

  const onScroll = (): void => dismiss();
  const onKeyDown = (): void => dismiss();

  function dismiss(): void {
    generation += 1;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    cancelLeave();
    card?.remove();
    card = null;
    element.removeAttribute('aria-describedby');
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('keydown', onKeyDown, true);
  }

  const scheduleLeave = (): void => {
    cancelLeave();
    leaveTimer = setTimeout(dismiss, LEAVE_GRACE_MS);
  };

  const show = (text: string): void => {
    card?.remove();
    card = document.createElement('div');
    card.className = 'wikilink-preview';
    card.id = `wikilink-preview-${(previewSeq += 1)}`;
    card.setAttribute('role', 'tooltip');
    card.textContent = text.slice(0, PREVIEW_CHARS);
    card.addEventListener('mouseenter', cancelLeave);
    card.addEventListener('mouseleave', scheduleLeave);
    document.body.appendChild(card);
    // Placed after it is in the document, so its own size is known.
    const anchor = element.getBoundingClientRect();
    const { top, left } = placePopover({
      anchor: { top: anchor.top, bottom: anchor.bottom, left: anchor.left },
      size: { width: card.offsetWidth, height: card.offsetHeight },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      gap: 8,
    });
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
    element.setAttribute('aria-describedby', card.id);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKeyDown, true);
  };

  element.addEventListener('mouseenter', () => {
    cancelLeave();
    // Back on the link while its card is up: keep the card, start nothing.
    if (card !== null) return;
    if (timer !== null) clearTimeout(timer);
    const started = generation;
    timer = setTimeout(() => {
      timer = null;
      void load().then(
        (text) => {
          if (text === null || started !== generation) return;
          show(text);
        },
        () => undefined,
      );
    }, HOVER_DELAY_MS);
  });

  element.addEventListener('mouseleave', () => {
    if (timer !== null) {
      // Not shown yet: nothing to grace, cancel the fetch outright.
      dismiss();
      return;
    }
    if (card !== null) scheduleLeave();
    else generation += 1; // a fetch in flight is now stale
  });

  // The node view's `destroy`: a link deleted while its card is up (or its
  // fetch is in flight) must not leave the card on the body.
  return dismiss;
}
