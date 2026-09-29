import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

/**
 * 18.415 — note mentions are in the help corpus, not only in the code. The
 * manual explains the picker and the two rules a person can be surprised by
 * (told once; told only if they can read the note), the Inbox list names note
 * mentions, and the FAQ answers "do they get told?". Each is asserted in the
 * SOURCE document and in the GENERATED module the app ships (the two only
 * agree because `pnpm check:help` says so — this pins the words themselves).
 */
describe('18.415 the manual and FAQ describe note mentions', () => {
  const shipped = JSON.stringify(HELP_CONTENT);

  it.each([
    ['docs/manual.md', 'Mentioning somebody in a note'],
    ['docs/manual.md', 'Only people who can read the note are told'],
    ['docs/manual.md', 'in a note or one of its comments'],
    ['docs/faq.md', 'If I mention someone in a note, do they get told?'],
  ])('%s says "%s" — and so does the shipped copy', (path, words) => {
    expect(read(path)).toContain(words);
    expect(shipped).toContain(words);
  });

  it('the Account → Notifications row for the mention kind names notes', () => {
    expect(read('packages/app-core/src/account/notifications-section.tsx')).toContain(
      "mention: 'You are mentioned in a comment, description or note'",
    );
  });
});
