import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const shipped = JSON.stringify(HELP_CONTENT);

/**
 * 22.227 — prefixes, groups and the Create buttons are in the help corpus, not
 * only in the code. Each phrase is asserted in the SOURCE document and in the
 * GENERATED module the app ships (the two only agree because `pnpm check:help`
 * says so — this pins the words themselves). A phrase here is the name of a
 * control or a rule the product really has; `check:help` separately refuses a
 * quoted string the product does not say.
 */
describe('22.227 the manual and FAQ describe prefixes, groups and the Create buttons', () => {
  it.each([
    ['docs/manual.md', 'The three Create buttons'],
    ['docs/manual.md', 'Change a prefix'],
    ['docs/manual.md', 'Group your projects'],
    ['docs/manual.md', 'The Groups page'],
    ['docs/manual.md', 'Old numbers still find the job'],
    ['docs/manual.md', 'A retired prefix cannot be taken by another project'],
    ['docs/manual.md', 'Notes keep the key they were written with'],
    ['docs/manual.md', 'Edit prefix'],
    ['docs/manual.md', 'Grouped'],
    ['docs/manual.md', 'Settings → Groups'],
    ['docs/faq.md', 'Can I change a project\'s prefix, or the workspace\'s?'],
    ['docs/faq.md', 'What happens to the old job numbers when a prefix changes?'],
    ['docs/faq.md', 'Why can\'t I use a prefix a project used to have?'],
    ['docs/faq.md', 'How do I put my projects into groups?'],
    ['docs/faq.md', 'What are Grouped and Plain on the workspace page?'],
    ['docs/faq.md', 'Where do I create a workspace, a project or a job?'],
  ])('%s says "%s" — and so does the shipped copy', (path, words) => {
    expect(read(path)).toContain(words);
    expect(shipped).toContain(words);
  });
});

/**
 * 22.154 / 22.228 — the founding and ticket buttons are called "Create …" in the
 * product, so the help must not send a reader looking for a "New ticket" or
 * "New project" button. The control runs first, on the same patterns: it proves
 * the check would catch the old wording, so a pass is not a pattern that cannot
 * match.
 */
describe('22.154 / 22.228 the help says Create ticket and Create project, never New ticket or New project', () => {
  const OLD_WORDING = /\bNew\s+(ticket|project)\b|\bAdd\s+a\s+ticket\b/;

  it('control: the patterns do match the old wording', () => {
    expect(OLD_WORDING.test('Find the **New ticket** button')).toBe(true);
    expect(OLD_WORDING.test('gets a **New project** form')).toBe(true);
    expect(OLD_WORDING.test('click **Add a ticket** in an empty stage')).toBe(true);
    // a hard-wrapped line is the form the first sweep missed
    expect(OLD_WORDING.test('get a **New\n   project** form')).toBe(true);
  });

  it.each(['docs/manual.md', 'docs/faq.md'])('%s has none of it', (path) => {
    expect(OLD_WORDING.exec(read(path))).toBeNull();
  });

  it('the shipped copy has none of it either', () => {
    expect(OLD_WORDING.exec(shipped)).toBeNull();
  });
});

/**
 * 22.229 — two carry-overs the lanes handed to this pass: the bar's last-project
 * item carries its label (U-T3/U-T4) and the board card says what happened in
 * words (23.123), not a "who · when" button.
 */
describe('22.229 the manual and FAQ carry the bar label and the card line', () => {
  it.each([
    ['docs/manual.md', 'Last project:'],
    ['docs/manual.md', 'Moved to Doing by'],
    ['docs/faq.md', 'What\'s the line at the bottom of a card?'],
  ])('%s says "%s" — and so does the shipped copy', (path, words) => {
    expect(read(path)).toContain(words);
    expect(shipped).toContain(words);
  });

  it('neither document still describes a "who · when" button', () => {
    expect(read('docs/manual.md')).not.toContain('who · when');
    expect(read('docs/faq.md')).not.toContain('who · when');
  });
});
