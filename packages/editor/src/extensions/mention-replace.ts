import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { MentionAttrs, MentionCandidate } from './mention.js';
import { createMentionPopup, type MentionPopupRenderer } from './mention-popup.js';

/**
 * CLICKING A MENTION IN AN EDITABLE EDITOR REOPENS THE PICKER, TO REPLACE IT
 * (owner request, 2026-09-29: "on edit mode, clicking on an @mention should
 * reopen the list to replace the clicked mention.").
 *
 * ## THE DESIGN
 *
 * - **The list is the SAME popup** (`createMentionPopup`, its rows, its
 *   ARIA, its positioning) — not a second list. The `@` trigger drives it
 *   through `@tiptap/suggestion`; this drives the same renderer directly,
 *   because there is no typed text to be a query: it asks `queryUsers('')` for
 *   the full list and highlights the person the chip already names.
 * - **Doors in:** a plain click on the chip (`handleClickOn`, editable views
 *   only — a read-only view is handed the same click by ProseMirror and must
 *   ignore it), or Enter / Space while the chip is node-selected.
 * - **Doors out:** Escape and a mousedown outside the popup close it and leave
 *   the mention alone; so does anything that moves the selection off the chip
 *   (an arrow key, a click elsewhere, typing). Choosing the SAME person is a
 *   no-op and adds nothing to the undo history.
 * - **Choosing another person is ONE transaction** (`setNodeMarkup` on the
 *   chip), so one undo brings the old mention back. Only what `queryUsers`
 *   offers, and only what `mentionAttrsOf` could store, is ever a row — the
 *   same rule the `@` picker applies.
 *
 * ## KEYS ARE HANDLED AS DOM EVENTS
 *
 * `handleDOMEvents.keydown` runs BEFORE ProseMirror's own keydown handling and
 * the keymap extensions, which is what lets Enter on a selected chip open the
 * picker instead of replacing the chip with a paragraph split — with no
 * extension `priority` to move (see `collapsible.ts` for why that is avoided).
 * While the picker is open, Enter and the arrows are consumed even when the
 * list is empty, for the same reason: a declined Enter would split the note.
 */
export type MentionReplaceOptions = {
  /** The node's name in the schema. */
  nodeName: string;
  queryUsers(query: string): Promise<MentionCandidate[]>;
  /** `mentionAttrsOf` — the one rule for what a mention may store. */
  toAttrs(candidate: MentionCandidate): MentionAttrs | null;
};

type Session = { popup: MentionPopupRenderer; stopClickAway: () => void };

export function createMentionReplacePlugin(options: MentionReplaceOptions): Plugin {
  /**
   * The chip being replaced, as a position. It lives in plugin STATE so it maps
   * through every transaction (a remote edit above the chip must not leave the
   * popup pointing at the wrong node). `null` = no replacement in progress.
   */
  const key = new PluginKey<number | null>('mentionReplace');
  let session: Session | null = null;
  /** Bumped on every open and close: an answer from `queryUsers` that arrives after either is dropped. */
  let generation = 0;

  const isMention = (view: EditorView, pos: number): boolean =>
    view.state.doc.nodeAt(pos)?.type.name === options.nodeName;

  function closeSession(): void {
    generation += 1;
    if (session === null) return;
    session.stopClickAway();
    session.popup.onExit();
    session = null;
  }

  /** Close on the user's own act: also clears the plugin state. */
  function close(view: EditorView): void {
    closeSession();
    if (key.getState(view.state) !== null) view.dispatch(view.state.tr.setMeta(key, 'close'));
  }

  function choose(view: EditorView, candidate: MentionCandidate): void {
    const pos = key.getState(view.state);
    const attrs = options.toAttrs(candidate);
    const node = pos === null || pos === undefined ? null : view.state.doc.nodeAt(pos);
    if (pos === null || pos === undefined || node === null || node.type.name !== options.nodeName || attrs === null) {
      close(view);
      return;
    }
    if (node.attrs.userId === attrs.userId) {
      close(view);
      view.focus();
      return;
    }
    const tr = view.state.tr.setNodeMarkup(pos, undefined, attrs);
    // The caret goes to the end of the chip: the person just chose, and the
    // next keystroke continues the sentence.
    tr.setSelection(TextSelection.create(tr.doc, pos + node.nodeSize));
    tr.setMeta(key, 'close').scrollIntoView();
    view.dispatch(tr);
    closeSession();
    view.focus();
  }

  function open(view: EditorView, pos: number): boolean {
    if (!view.editable || !isMention(view, pos)) return false;
    closeSession();
    const mine = generation;
    const current = view.state.doc.nodeAt(pos)!.attrs.userId as string;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).setMeta(key, { pos }));

    const start = (candidates: MentionCandidate[]): void => {
      if (mine !== generation) return; // closed, or reopened, while the list was loading
      // …or the selection left the chip while it loaded (a click elsewhere): the
      // session-less window has no other way to notice.
      const at = key.getState(view.state);
      const { selection } = view.state;
      if (at === null || at === undefined || !(selection instanceof NodeSelection) || selection.from !== at) return;
      const popup = createMentionPopup();
      const onMouseDown = (event: MouseEvent): void => {
        const target = event.target;
        if (target instanceof Element && target.closest('.mention-popup') !== null) return;
        close(view);
      };
      document.addEventListener('mousedown', onMouseDown, true);
      session = { popup, stopClickAway: () => document.removeEventListener('mousedown', onMouseDown, true) };
      popup.onStart({
        items: candidates.filter((candidate) => options.toAttrs(candidate) !== null),
        command: (candidate) => choose(view, candidate),
        // Anchored at the chip, wherever it has moved to.
        clientRect: () => {
          const at = key.getState(view.state);
          const dom = at === null || at === undefined ? null : view.nodeDOM(at);
          return dom instanceof Element ? dom.getBoundingClientRect() : null;
        },
        editor: { view },
        selectedUserId: current,
      });
    };
    options.queryUsers('').then(start, () => {
      // A directory that cannot answer opens nothing, and the mention stays.
    });
    return true;
  }

  return new Plugin<number | null>({
    key,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(key) as { pos: number } | 'close' | undefined;
        if (meta === 'close') return null;
        if (meta !== undefined) return meta.pos;
        return value === null || !tr.docChanged ? value : tr.mapping.map(value);
      },
    },
    props: {
      handleClickOn(view, _pos, node, nodePos, event) {
        if (node.type.name !== options.nodeName) return false;
        // Editable views only, plain primary clicks only: a modified click is
        // the browser's or the host's (open in a new tab, extend a selection).
        if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
        return open(view, nodePos);
      },
      handleDOMEvents: {
        keydown(view, event) {
          if (session !== null) {
            if (event.key === 'Escape') {
              event.preventDefault();
              // The Escape is this picker's: a surrounding dialog must not close with it.
              event.stopPropagation();
              close(view);
              return true;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
              session.popup.onKeyDown({ event });
              event.preventDefault();
              return true;
            }
            return false;
          }
          if (!view.editable || (event.key !== 'Enter' && event.key !== ' ')) return false;
          if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
          const { selection } = view.state;
          if (!(selection instanceof NodeSelection) || selection.node.type.name !== options.nodeName) return false;
          event.preventDefault();
          return open(view, selection.from);
        },
      },
    },
    view() {
      return {
        update(view) {
          if (session === null) return;
          const pos = key.getState(view.state);
          const { selection } = view.state;
          const onChip =
            pos !== null && pos !== undefined && selection instanceof NodeSelection && selection.from === pos;
          if (!onChip || !isMention(view, pos)) closeSession();
        },
        destroy: closeSession,
      };
    },
  });
}
