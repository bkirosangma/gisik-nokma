/**
 * Which workspace holds a note, remembered for the session (smoothness T9, S4).
 *
 * The note route carries only the note's id, so opening one means asking each of the person's workspaces until one answers
 * (`note-document.tsx`). A note change remounts the page, so without this every remount asked again — and could not compute the
 * read cache's key for the note until it had. Once a workspace has answered for a note, the next mount starts from it: the key is
 * known on the first render and the cached note is painted before any read returns. A wrong or stale entry costs one read: the
 * document drops it and asks every workspace again if the remembered one now answers nothing.
 *
 * Its own tiny module so the shell's sign-out doors (`clear-read-caches.ts`, imported by the root layout) can empty it without
 * importing the note document and the editor behind it. Cleared with every other per-person read.
 */
const homes = new Map<string, string>();

export function rememberNoteHome(noteId: string, workspaceId: string): void {
  homes.set(noteId, workspaceId);
}

export function rememberedNoteHome(noteId: string): string | null {
  return homes.get(noteId) ?? null;
}

export function forgetNoteHome(noteId: string): void {
  homes.delete(noteId);
}

export function clearNoteHomes(): void {
  homes.clear();
}
