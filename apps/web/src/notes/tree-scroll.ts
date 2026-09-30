/**
 * The notes tree's scroll offset, carried across the remount a note change is (case 18.488, 18.489).
 *
 * App Router keys a dynamic segment by its param VALUE, so `/notes/a` → `/notes/b` does not re-render
 * `NotesPage`, it mounts a new one (measured in a real browser, N1b: the tree's `scrollTop` went
 * 800 → 0), and `/notes` ↔ `/notes/<id>` are two route files. The alternative — lifting the tree into
 * `app/notes/layout.tsx` so it never unmounts — was not taken: the tree's state (`workspaces`, the
 * filters, the search) lives beside the document that also reads it, `getMyWorkspaces` would stop
 * re-running per note, and `pendingLostAccessToast` (read once by a fresh mount) and the drawer state
 * (`treeOpen`, which a pick should close) depend on the remount. So the offset is a module-level value,
 * the same device `notes-page.tsx` uses for that toast: a module variable survives the remount,
 * component state does not.
 *
 * The new tree is "Loading…" and short, and a browser CLAMPS `scrollTop` to what is scrollable, so
 * setting it on mount lands on 0: the offset is re-applied each time the tree's rows change, until it
 * sticks. The reader taking over (wheel, touch, key, pointer) cancels it, and so does a five-second cap
 * (the rows that held the offset may be gone). While it is pending a `scroll` event is the clamp's, not
 * the reader's, and is not recorded.
 */
let savedTreeScrollTop = 0;

const GIVE_UP_MS = 5000;
const TAKEOVER = ['wheel', 'touchstart', 'keydown', 'pointerdown'];

/** Attach to the tree element; returns the detach. */
export function carryTreeScroll(tree: HTMLElement): () => void {
  let restoring = savedTreeScrollTop > 0;
  const restore = () => {
    if (!restoring) return;
    tree.scrollTop = savedTreeScrollTop;
    if (Math.abs(tree.scrollTop - savedTreeScrollTop) < 2) restoring = false;
  };
  const stop = () => {
    restoring = false;
  };
  const record = () => {
    if (!restoring) savedTreeScrollTop = tree.scrollTop;
  };
  const observer = new MutationObserver(restore);
  observer.observe(tree, { childList: true, subtree: true });
  restore();
  tree.addEventListener('scroll', record, { passive: true });
  for (const type of TAKEOVER) tree.addEventListener(type, stop, { passive: true });
  const giveUp = window.setTimeout(stop, GIVE_UP_MS);
  return () => {
    window.clearTimeout(giveUp);
    observer.disconnect();
    tree.removeEventListener('scroll', record);
    for (const type of TAKEOVER) tree.removeEventListener(type, stop);
  };
}
