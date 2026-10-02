import { useCallback, useSyncExternalStore } from 'react';

/**
 * Smoothness add-on G-6 (owner 2026-10-02): "in the ticket and notes comment editors, the toolbars should not
 * always be visible. just have a small format button." Whether a comment editor draws its formatting toolbar is
 * ONE per-device setting, shared by every comment editor on the page (the sheet's composer and its edit, the note
 * comments' composer and edit). Default: hidden.
 */
export const COMMENT_TOOLBAR_KEY = 'gn-comment-toolbar';
const CHANGED = 'gn-comment-toolbar-changed';

// Where the choice lives ONLY while storage refuses it (a private window, a browser set to refuse site data): the
// toggle still works for the life of the page, it is just not remembered. `null` = storage is the truth.
let refused: boolean | null = null;

function read(): boolean {
  if (refused !== null) return refused;
  try {
    return window.localStorage.getItem(COMMENT_TOOLBAR_KEY) === 'shown';
  } catch {
    return false;
  }
}

function write(shown: boolean): void {
  try {
    window.localStorage.setItem(COMMENT_TOOLBAR_KEY, shown ? 'shown' : 'hidden');
    refused = null;
  } catch {
    refused = shown;
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key === COMMENT_TOOLBAR_KEY || event.key === null) onChange();
  };
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** `[shown, setShown]`: hidden on the server render and on first visit; every mounted caller follows a change. */
export function useCommentToolbarShown(): readonly [boolean, (shown: boolean) => void] {
  const shown = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => write(next), []);
  return [shown, set] as const;
}
