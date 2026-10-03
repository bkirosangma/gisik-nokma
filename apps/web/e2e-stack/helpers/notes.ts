import { expect, type Page, type Response } from '@playwright/test';

/**
 * Create a note through the shipped "Create note" dialog — the flow notes.spec.ts 18.228 drives. Home and Scope stay at
 * their defaults (first workspace, Private), so nothing here depends on a seeded note. The dialog's own Create navigates
 * to `/notes/<id>`, which is what is waited for; the href is returned.
 */
export async function createNote(page: Page, title: string): Promise<string> {
  await page.getByRole('button', { name: 'Create note' }).click();
  const dialog = page.getByRole('dialog', { name: 'New note' });
  await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });
  return new URL(page.url()).pathname;
}

/**
 * The page's own LIVE notes read for a workspace (`getNotes`): `GET /v1/workspaces/<id>/notes` with no query. The pathname
 * alone is not enough: `WorkspaceNotesSection` fires one such read per workspace, and beside each it fires the TRASH read
 * (`getDeletedNotes`, `GET …/notes?deleted=1`), which has the same pathname. A trash read that answers first would be
 * mistaken for the list, so the query string must be empty.
 */
const NOTES_LIST = /\/v1\/workspaces\/[^/]+\/notes$/;

function isLiveNotesRead(r: Response): boolean {
  const url = new URL(r.url());
  return r.request().method() === 'GET' && NOTES_LIST.test(url.pathname) && url.search === '';
}

/**
 * Open `/notes` (through `goto`) and return the href of a note to open — an existing one, else a freshly created one.
 *
 * The dev stack's database always holds notes (earlier specs and people made them); the CI stack is a fresh database
 * with none, and a spec that sorts before notes.spec.ts cannot count on that spec's notes. The decision is taken on the
 * ANSWERS to the page's own live notes reads, not on the rendered tree: the tree draws nothing for an empty workspace (no
 * "No notes yet" — that copy is for a person with no workspace at all), so "no link yet" cannot be told from "not
 * rendered yet", and a count read straight after navigation would create a note that already existed. Every workspace
 * has its own read and they arrive in any order, so they are all collected across `goto` (which waits for the network
 * to go idle) and a note is created only when EVERY one answered with none: the dev database gains none, and a second
 * call finds the first call's note. No live read at all is an error, never a pass.
 */
export async function openNoteFromList(page: Page, goto: () => Promise<void>): Promise<{ href: string; created: boolean }> {
  const live: Response[] = [];
  const onResponse = (r: Response): void => {
    if (isLiveNotesRead(r)) live.push(r);
  };
  page.on('response', onResponse);
  try {
    await goto();
  } finally {
    page.off('response', onResponse);
  }
  expect(live.length, 'no live notes read (GET /v1/workspaces/<id>/notes) was seen while /notes loaded').toBeGreaterThan(0);
  const lists = await Promise.all(
    live.map(async (r) => {
      expect(r.ok(), `GET ${r.url()} answered ${r.status()}`).toBe(true);
      return ((await r.json()) as { notes: { noteId: string }[] }).notes;
    }),
  );
  const first = lists.find((notes) => notes.length > 0)?.[0];
  if (first !== undefined) return { href: `/notes/${first.noteId}`, created: false };
  return { href: await createNote(page, `Neo clip fixture ${Date.now().toString(36)}`), created: true };
}
