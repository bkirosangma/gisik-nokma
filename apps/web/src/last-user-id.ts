/**
 * The id of the last person who had a session in this browser, kept in `localStorage` so a screen can
 * ask "whose remembered tab is this?" in its FIRST frame, before the session read has answered (spec
 * D9; audit SM-02). The record behind it (`use-last-project.ts`'s tab map) is keyed by user and refuses
 * anyone else's, so this id only picks WHICH key to read: a stale or wrong id returns `null` from the
 * reader, never another person's value. `resolveSession` (`providers.tsx`) writes it on sign-in and
 * clears it on a settled signed-out answer.
 */
const KEY = 'gn-last-user-id';

export function readLastUserId(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // Site data blocked: the accessor throws, not the value. The session still answers, a frame later.
    return null;
  }
}

export function rememberLastUserId(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, id);
  } catch {
    // Storage refused: a lost convenience, never a failure the page should surface.
  }
}
