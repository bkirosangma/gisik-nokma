import { Node, mergeAttributes } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { createTicketRefPopup } from './ticket-ref-popup.js';

/** A ticket this editor may reference: the ids, key and title it stores. */
export type TicketRefCandidate = { ticketId: string; projectId: string; key: string; title: string };

export type TicketRefOptions = {
  /** The host's ticket search. Absent → the picker offers nothing (spec §14.1). */
  queryTickets: (query: string) => Promise<TicketRefCandidate[]>;
  /**
   * The URL a chip links to, or `null` for no link at all. Unlike the
   * wiki-link node's `resolveNoteTitle`, this option has no third "host
   * supplied none" answer — the Interfaces this node was built from name a
   * two-way choice only: a string renders an `<a>`, `null` renders a `<span>`
   * (spec §14.2's "the server route gains `key`" note applies to Task 4's
   * mapper, not to this resolver).
   */
  resolveTicketHref: (ref: { ticketId: string; projectId: string }) => string | null;
};

export const ticketRefSuggestionKey = new PluginKey('ticketRefSuggestion');

/** The literal trigger. No trailing space: see `schema/extensions.ts`'s Global Constraints note on `char`. */
const TICKET_TRIGGER = ':ticket';

/**
 * The chip's ONE spelling of its text, read by the node view, the static
 * `renderHTML` fallback and `renderText` alike — the same discipline
 * `mentionText` and wiki-link's `renderText` keep for their own nodes.
 */
function ticketRefText(attrs: Record<string, unknown>): string {
  const key = typeof attrs.key === 'string' ? attrs.key : '';
  const title = typeof attrs.title === 'string' ? attrs.title : '';
  return `${key} ${title}`;
}

/**
 * The `ticketRef` node of schema v2 (spec §14.2, D26): `{ ticketId, projectId,
 * key, title }`, inline and atomic, rendered as a chip reading `KEY title`.
 *
 * THE TITLE IS THE STORED ONE, ALWAYS — unlike the wiki-link node, this task's
 * Interfaces name no live-title resolver, and case 9.304 pins exactly that: a
 * chip's text never changes after insertion, only whether it links anywhere.
 * `resolveTicketHref` decides the SECOND question — whether the chip is an
 * `<a>` — and nothing else.
 *
 * `data-ticket-id` is the parse discriminator, exactly as `data-mention-user-id`
 * and `data-note-id` are on their own nodes: an element pasted from any web
 * page is not one of this product's ticket references, and matching a bare
 * tag would turn arbitrary markup into a claim about a ticket.
 */
export const TicketRef = Node.create<TicketRefOptions>({
  name: 'ticketRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { queryTickets: async () => [], resolveTicketHref: () => null };
  },

  addAttributes() {
    return {
      ticketId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-ticket-id') ?? '',
        renderHTML: (attributes) => ({ 'data-ticket-id': attributes.ticketId }),
      },
      projectId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-project-id') ?? '',
        renderHTML: (attributes) => ({ 'data-project-id': attributes.projectId }),
      },
      key: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-ticket-key') ?? '',
        renderHTML: (attributes) => ({ 'data-ticket-key': attributes.key }),
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-ticket-title') ?? '',
        renderHTML: (attributes) => ({ 'data-ticket-title': attributes.title }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-ticket-id]' }, { tag: 'span[data-ticket-id]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const ticketId = String(node.attrs['ticketId']);
    const projectId = String(node.attrs['projectId']);
    const href = this.options.resolveTicketHref({ ticketId, projectId });
    const text = ticketRefText(node.attrs);
    if (href === null) {
      return ['span', mergeAttributes(HTMLAttributes, { class: 'editor-ticketref' }), text];
    }
    return ['a', mergeAttributes(HTMLAttributes, { class: 'editor-ticketref', href }), text];
  },

  renderText({ node }) {
    return ticketRefText(node.attrs);
  },

  addNodeView() {
    // An arrow so `this` stays the extension — the same lifetime `wiki-link.ts`'s
    // node view relies on, and the reason `resolveTicketHref` reads live rather
    // than at configure time: the href resolves at MOUNT time.
    return ({ node }) => {
      const ticketId = String(node.attrs['ticketId']);
      const projectId = String(node.attrs['projectId']);
      const key = String(node.attrs['key']);
      const title = String(node.attrs['title']);
      const href = this.options.resolveTicketHref({ ticketId, projectId });
      const dom = document.createElement(href === null ? 'span' : 'a');
      dom.className = 'editor-ticketref';
      dom.setAttribute('data-ticket-id', ticketId);
      dom.setAttribute('data-project-id', projectId);
      dom.setAttribute('data-ticket-key', key);
      dom.setAttribute('data-ticket-title', title);
      dom.textContent = `${key} ${title}`;
      if (href !== null) dom.setAttribute('href', href);
      return { dom };
    };
  },

  addProseMirrorPlugins() {
    // A PER-EDITOR FLAG, read only by this session's popup (Ruling 1,
    // 2026-09-23 — the plan's own text had no channel for this: `items`
    // returning a plain array is all `TicketRefCandidate`, the twin contracts
    // and the bridge carry, and @tiptap/suggestion@3.30.5's own async-fetch
    // error path — `plugin/view.ts`'s non-`resolved` arm — reaches the
    // renderer as `loading: false` with `items` unchanged, no error prop).
    // `items` below sets it when `queryTickets` rejects (offline: the
    // replica's search gap, spec §14.1) and CLEARS it at the START of every
    // call, so a query typed after reconnecting shows the count-based status
    // again (case 18.272).
    let searchUnavailable = false;
    // THE SEQUENCE GUARD (Unit 3 ruling, planner via owner, 2026-09-24 —
    // Unit 3's styling draws this status line visibly, so a wrong one is now
    // owner-visible, not only a screen-reader defect). `@tiptap/suggestion`'s
    // own `fetch()` (dist `plugin/async.ts`) issues a NEW `items()` call on
    // every keystroke without waiting for the previous one to settle, and its
    // `AbortController` guard only protects the ITEMS it renders — it does
    // not reach into this callback, so an EARLIER call's rejection can still
    // resolve AFTER a LATER call's success and clobber `searchUnavailable`
    // back to `true` next to a populated list. `requestId` pins each call to
    // the `latestRequestId` at the moment IT STARTED; only a call still the
    // latest one when it SETTLES may write the flag, so a stale rejection
    // arriving after a newer success is a no-op.
    let latestRequestId = 0;
    return [
      Suggestion<TicketRefCandidate, TicketRefCandidate>({
        editor: this.editor,
        pluginKey: ticketRefSuggestionKey,
        char: TICKET_TRIGGER,
        // A ticket title routinely contains a space — `@tiptap/suggestion`'s
        // own option, the same reason `wiki-link.ts` sets it.
        allowSpaces: true,
        allow: ({ state, range }) => {
          // NO PICKER IN CODE, the same gate `wiki-link.ts:169` uses and for
          // the same measured reason: the insertion would split a code block
          // around the caret.
          if (state.doc.resolve(range.from).parent.type.spec.code === true) return false;
          // THE SECOND HALF OF THIS GATE HAS NO wiki-link COUNTERPART, AND IS
          // WHY IT IS WRITTEN HERE RATHER THAN COPIED WHOLESALE. `char` carries
          // no trailing space (Global Constraints: unverified in this
          // library), so `@tiptap/suggestion`'s own matcher accepts a
          // run-on word immediately after the trigger — `:ticketfoo` matches
          // with query `foo`. Case 9.302 pins one behaviour: the trigger
          // needs whitespace or end directly after `:ticket`, so a query is
          // legitimate only when it is empty (nothing typed yet) or starts
          // with whitespace (a real word boundary).
          const matched = state.doc.textBetween(range.from, range.to);
          const query = matched.slice(TICKET_TRIGGER.length);
          return query.length === 0 || /^\s/.test(query);
        },
        items: async ({ query }) => {
          const requestId = (latestRequestId += 1);
          try {
            const results = (await this.options.queryTickets(query.trim())).slice(0, 8);
            if (requestId === latestRequestId) searchUnavailable = false;
            return results;
          } catch {
            // A REJECTED, NOT A THROWN, RESULT: @tiptap/suggestion's own
            // catch (async.ts) would have swallowed this identically, minus
            // the flag — catching it here rather than there is what lets the
            // popup say why the list is empty. An empty resolved array is
            // exactly as benign to the library as a real zero-match answer,
            // which is the whole of "the editor still mounts" (case 18.272).
            if (requestId === latestRequestId) searchUnavailable = true;
            return [];
          }
        },
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([{ type: 'ticketRef', attrs: props }, { type: 'text', text: ' ' }])
            .run();
        },
        render: () => createTicketRefPopup(() => searchUnavailable),
      }),
    ];
  },
});
