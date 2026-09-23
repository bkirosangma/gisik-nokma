import type { TicketRefCandidate } from './ticket-ref.js';

export type TicketRefPopupProps = {
  items: TicketRefCandidate[];
  command: (item: TicketRefCandidate) => void;
  clientRect?: (() => DOMRect | null) | null;
  /**
   * Narrowed to what this file touches, exactly as `mention-popup.ts` narrows
   * it: `@tiptap/suggestion` passes the whole `Editor`, and the popup needs
   * one thing from it — the contenteditable element that keeps focus while
   * the popup is open, and therefore the element that carries the combobox
   * relationship.
   */
  editor: { view: { dom: Element } };
};

export type TicketRefPopupRenderer = {
  onStart(props: TicketRefPopupProps): void;
  onUpdate(props: TicketRefPopupProps): void;
  onKeyDown(props: { event: KeyboardEvent }): boolean;
  onExit(): void;
};

/** Ids must be unique per document; two editors can be mounted at once. */
let popupSequence = 0;

/**
 * The result count, stated ONCE — the same shape and the same reason as
 * `mentionResultAnnouncement` and `wikiLinkResultAnnouncement`. It is
 * user-facing copy only a screen reader receives, which is exactly the kind
 * of string that rots unnoticed.
 */
export function ticketRefResultAnnouncement(count: number): string {
  if (count === 0) return 'No tickets match';
  return count === 1 ? '1 ticket matches' : `${count} tickets match`;
}

/**
 * The `:ticket` suggestion popup — a port of `mention-popup.ts` and
 * `wiki-link-popup.ts`, and the port is deliberate rather than incidental:
 * the three popups share every mechanic those files' docblocks argue for —
 * `role="option"` rows rather than buttons, focus never moving out of the
 * editor, `aria-activedescendant` carrying the selection to a screen reader,
 * and ProseMirror's own `role="textbox"` being SAVED AND RESTORED rather than
 * stripped. What differs is the data, the row text (`KEY title` rather than a
 * name or a title alone) and four class names.
 */
export function createTicketRefPopup(): TicketRefPopupRenderer {
  const popupId = `ticketref-popup-${(popupSequence += 1)}`;
  const listboxId = `${popupId}__list`;
  const optionId = (index: number): string => `${popupId}__option-${index}`;

  let container: HTMLDivElement | null = null;
  let listbox: HTMLDivElement | null = null;
  let status: HTMLDivElement | null = null;
  let editorDom: Element | null = null;
  let savedRole: string | null = null;
  let items: TicketRefCandidate[] = [];
  let command: (item: TicketRefCandidate) => void = () => {};
  let selectedIndex = 0;

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
          ? 'ticketref-popup__item ticketref-popup__item--selected'
          : 'ticketref-popup__item';
      option.textContent = `${item.key} ${item.title}`;
      // mousedown, not click: it fires before the editor loses focus.
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        command(item);
      });
      listbox?.appendChild(option);
    });
    status.textContent = ticketRefResultAnnouncement(items.length);
    const selected = items[selectedIndex];
    if (editorDom && selected) {
      editorDom.setAttribute('aria-activedescendant', optionId(selectedIndex));
    } else {
      editorDom?.removeAttribute('aria-activedescendant');
    }
  }

  function position(clientRect?: (() => DOMRect | null) | null): void {
    if (!container) return;
    const rect = clientRect?.();
    if (!rect) return; // jsdom / detached: leave it unpositioned but present
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.bottom}px`;
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
    container?.remove();
    container = null;
    listbox = null;
    status = null;
  }

  return {
    onStart(props) {
      container = document.createElement('div');
      container.className = 'ticketref-popup';
      container.style.position = 'absolute';

      listbox = document.createElement('div');
      listbox.id = listboxId;
      listbox.className = 'ticketref-popup__list';
      listbox.setAttribute('role', 'listbox');
      listbox.setAttribute('aria-label', 'Tickets you can see');

      // Outside the listbox on purpose: a listbox's children must be options.
      status = document.createElement('div');
      status.className = 'ticketref-popup__status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');

      container.append(listbox, status);
      document.body.appendChild(container);

      claimEditor(props.editor.view.dom);
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
      // NOTHING TO NAVIGATE MEANS DECLINE — see `mention-popup.ts`, where the
      // same guard is argued at length: `items` resolves asynchronously, so
      // typing `:ticket` then Enter is ordinary, and claiming those keystrokes
      // makes the editor look frozen.
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
      // ESCAPE IS NOT HANDLED HERE, for the reason recorded in
      // `mention-popup.ts`: `@tiptap/suggestion` owns Escape, calls this
      // hook, then dispatches the exit unconditionally — so a branch here
      // would run before that and change nothing. The typed `:ticket …`
      // staying literal is delivered by that mechanism and is pinned by a
      // test (9.305).
      return false;
    },
    onExit() {
      destroy();
    },
  };
}
