import type { MentionCandidate } from './mention.js';
import { bindSuggestionPopupPosition, type SuggestionPopupPositionBinding } from './suggestion-popup-position.js';

export type MentionPopupProps = {
  items: MentionCandidate[];
  command: (item: MentionCandidate) => void;
  clientRect?: (() => DOMRect | null) | null;
  /**
   * Narrowed to what this file touches. `@tiptap/suggestion` passes the whole
   * `Editor`; the popup needs one thing from it — the contenteditable element
   * that keeps focus while the popup is open, and therefore the element that
   * has to carry the combobox relationship.
   */
  editor: { view: { dom: Element } };
};

export type MentionPopupRenderer = {
  onStart(props: MentionPopupProps): void;
  onUpdate(props: MentionPopupProps): void;
  onKeyDown(props: { event: KeyboardEvent }): boolean;
  onExit(): void;
};

/** Ids must be unique per document; two editors can be mounted at once. */
let popupSequence = 0;

/**
 * The result count, stated ONCE. It is user-facing copy that only a screen
 * reader ever receives, which is exactly the kind of string that rots unnoticed
 * — so it is a function with a test rather than three template literals.
 */
export function mentionResultAnnouncement(count: number): string {
  if (count === 0) return 'No people match';
  return count === 1 ? '1 person matches' : `${count} people match`;
}

/**
 * Plain-DOM suggestion popup — no React, so the exact same code serves
 * the Next.js client, Tauri, the RN webview bundle, and headless tests
 * (the knowledge-base convention: plugin UI stays out of the React tree).
 *
 * THE ROWS ARE `role="option"` ELEMENTS, NOT BUTTONS, and that is a correctness
 * change rather than a stylistic one. A `<button>` is in the tab order, so Tab
 * from the editor moved focus INTO the popup — working directly against the
 * `mousedown`-not-`click` trick two lines below, which exists precisely to stop
 * the editor losing focus. It is also the wrong role: in the combobox pattern
 * the listbox is not a set of buttons the user visits, it is a set of options
 * the user points at from the input. "Semantic HTML before ARIA" is the right
 * default and this is its exception — the semantic element here carries
 * behaviour (focusability) the pattern must not have. A test asserts the popup
 * contains nothing tabbable.
 *
 * FOCUS NEVER MOVES. The editor keeps it, and the relationship is expressed
 * with `aria-activedescendant` pointing at the selected option's id, which is
 * how a screen reader is told what Enter will take without the caret leaving
 * the text. Selection was previously communicated by class name alone, so a
 * screen-reader user got no signal at all; `aria-selected` is the machine-
 * readable half and the `--selected` outline the visual one, neither of them
 * colour (spec: colour is never the only indicator, and this stylesheet may not
 * name a colour at all).
 *
 * PROSEMIRROR ALREADY SETS `role="textbox"` on the editor element — observed,
 * not assumed — so the combobox attributes are SAVED AND RESTORED rather than
 * set and removed. Blindly removing `role` on exit would strip ProseMirror's
 * own and leave the editor unannounced.
 */
export function createMentionPopup(): MentionPopupRenderer {
  const popupId = `mention-popup-${(popupSequence += 1)}`;
  const listboxId = `${popupId}__list`;
  const optionId = (index: number): string => `${popupId}__option-${index}`;

  let container: HTMLDivElement | null = null;
  let listbox: HTMLDivElement | null = null;
  let status: HTMLDivElement | null = null;
  let editorDom: Element | null = null;
  let savedRole: string | null = null;
  let items: MentionCandidate[] = [];
  let command: (item: MentionCandidate) => void = () => {};
  let selectedIndex = 0;
  let positionBinding: SuggestionPopupPositionBinding | null = null;

  function paint(): void {
    if (!listbox || !status) return;
    listbox.replaceChildren();
    items.forEach((item, index) => {
      const option = document.createElement('div');
      option.id = optionId(index);
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === selectedIndex));
      option.className =
        index === selectedIndex
          ? 'mention-popup__item mention-popup__item--selected'
          : 'mention-popup__item';
      option.textContent = item.name;
      // mousedown, not click: it fires before the editor loses focus.
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        command(item);
      });
      listbox?.appendChild(option);
    });
    status.textContent = mentionResultAnnouncement(items.length);
    const selected = items[selectedIndex];
    if (editorDom && selected) {
      editorDom.setAttribute('aria-activedescendant', optionId(selectedIndex));
    } else {
      editorDom?.removeAttribute('aria-activedescendant');
    }
  }

  function claimEditor(dom: Element): void {
    editorDom = dom;
    savedRole = dom.getAttribute('role');
    dom.setAttribute('role', 'combobox');
    dom.setAttribute('aria-expanded', 'true');
    dom.setAttribute('aria-controls', listboxId);
    dom.setAttribute('aria-autocomplete', 'list');
    dom.setAttribute('aria-haspopup', 'listbox');
  }

  function releaseEditor(): void {
    if (!editorDom) return;
    if (savedRole === null) editorDom.removeAttribute('role');
    else editorDom.setAttribute('role', savedRole);
    for (const name of [
      'aria-expanded',
      'aria-controls',
      'aria-autocomplete',
      'aria-haspopup',
      'aria-activedescendant',
    ]) {
      editorDom.removeAttribute(name);
    }
    editorDom = null;
    savedRole = null;
  }

  function destroy(): void {
    releaseEditor();
    positionBinding?.unbind();
    positionBinding = null;
    container?.remove();
    container = null;
    listbox = null;
    status = null;
  }

  return {
    onStart(props) {
      container = document.createElement('div');
      container.className = 'mention-popup';

      listbox = document.createElement('div');
      listbox.id = listboxId;
      listbox.className = 'mention-popup__list';
      listbox.setAttribute('role', 'listbox');
      // The listbox is detached from the text it belongs to, so it needs its
      // own name; without one a screen reader announces an unlabelled list.
      listbox.setAttribute('aria-label', 'People you can mention');

      // Outside the listbox on purpose: a listbox's children must be options.
      status = document.createElement('div');
      status.className = 'mention-popup__status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');

      container.append(listbox, status);
      document.body.appendChild(container);

      claimEditor(props.editor.view.dom);
      items = props.items;
      command = props.command;
      selectedIndex = 0;
      paint();
      positionBinding = bindSuggestionPopupPosition(container);
      positionBinding.reposition(props.clientRect);
    },
    onUpdate(props) {
      items = props.items;
      command = props.command;
      if (selectedIndex >= items.length) selectedIndex = 0;
      paint();
      positionBinding?.reposition(props.clientRect);
    },
    onKeyDown({ event }) {
      // NOTHING TO NAVIGATE MEANS DECLINE, and this is not a nicety. `items`
      // resolves asynchronously, so the popup exists with zero candidates from
      // the moment `@` is typed until the first query returns, and typing `@`
      // then Enter is an ordinary thing to do. Claiming those keystrokes makes
      // the editor look frozen; the plan's version returned true for Enter,
      // ArrowUp and ArrowDown unconditionally and a test caught it.
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % items.length;
        paint();
        return true;
      }
      if (event.key === 'ArrowUp') {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        paint();
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (!item) return false;
        command(item);
        return true;
      }
      // ESCAPE IS NOT HANDLED HERE, DELIBERATELY. @tiptap/suggestion@3.30.5
      // owns it (dist:129-138): it calls this hook, then `dispatchExit(view)`
      // unconditionally, then returns true whatever this returns — and the exit
      // flips the plugin state to inactive, which the plugin view reads as a
      // `stopped` transition and turns into `onExit` (dist:459-462, 476,
      // 559-563), which is what removes this popup. A branch here would run
      // before all of that and change nothing; it was written, tested both
      // ways, and found to be a guard that cannot fail. The behaviour spec §2
      // asks for — the typed `@…` staying literal — is still pinned by a test,
      // against the mechanism that actually delivers it.
      return false;
    },
    onExit() {
      destroy();
    },
  };
}
