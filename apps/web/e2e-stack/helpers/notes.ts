import { expect, type Page } from '@playwright/test';

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

/** The page's own unfiltered notes read for a workspace (`getNotes`); `?deleted=1` and the filtered reads do not match. */
const NOTES_LIST = /\/v1\/workspaces\/[^/]+\/notes$/;

/**
 * Open `/notes` (through `goto`) and return the href of a note to open — an existing one, else a freshly created one.
 *
 * The dev stack's database always holds notes (earlier specs and people made them); the CI stack is a fresh database
 * with none, and a spec that sorts before notes.spec.ts cannot count on that spec's notes. The decision is taken on the
 * ANSWER to the page's own notes read, not on the rendered tree: the tree draws nothing for an empty workspace (no
 * "No notes yet" — that copy is for a person with no workspace at all), so "no link yet" cannot be told from "not
 * rendered yet", and a count read straight after navigation would create a note that already existed. A note is created
 * only when that read answered with none, so the dev database gains none and a second call finds the first call's note.
 */
export async function openNoteFromList(page: Page, goto: () => Promise<void>): Promise<{ href: string; created: boolean }> {
  const listed = page.waitForResponse((r) => r.request().method() === 'GET' && NOTES_LIST.test(new URL(r.url()).pathname), {
    timeout: 20_000,
  });
  await goto();
  const response = await listed;
  expect(response.ok(), `GET ${response.url()} answered ${response.status()}`).toBe(true);
  const { notes } = (await response.json()) as { notes: { noteId: string }[] };
  if (notes.length > 0) return { href: `/notes/${notes[0]!.noteId}`, created: false };
  return { href: await createNote(page, `Neo clip fixture ${Date.now().toString(36)}`), created: true };
}
