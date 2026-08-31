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
