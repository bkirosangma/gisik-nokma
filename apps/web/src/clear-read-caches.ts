import { clearLiveQueryCache } from '@gisik-nokma/app-core/data';
import { clearNoteHomes } from './notes/note-homes.js';
import { clearMyWorkspacesCache } from './use-my-workspaces.js';

/**
 * Every read this shell keeps in memory for the signed-in person, emptied in one
 * call (smoothness T3, spec D1; case 25.028). The four doors the person changes
 * through call this and nothing else: the account menu's sign-out, a write's 401
 * (`withSignInOnExpiredWrite`), a read's 401 (`useSignInOnExpiredSession`) and the
 * session resolving to somebody else or to nobody (`resolveSession`).
 *
 * A new per-person read cache in this shell is cleared HERE, so the four doors
 * cannot drift apart about what "forget the person" means.
 */
export function clearReadCaches(): void {
  clearLiveQueryCache();
  // The one workspaces read the nav, the project list and the project title share (smoothness T4, FD5).
  clearMyWorkspacesCache();
  // Which workspace holds which note (smoothness T9): another person's note ids are not this device's business.
  clearNoteHomes();
}
