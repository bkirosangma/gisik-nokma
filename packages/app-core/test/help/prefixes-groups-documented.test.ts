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
describe('22.227 the manual and FAQ describe prefixes, groups, the Create buttons and the UX fixes', () => {
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
    // The UX series (UX fixes T1-T10, T13): the words a person will meet on a phone, in the Help page
    // and in the views. T10 and T13 are written from their branches until they land.
    ['docs/manual.md', 'On a phone or a narrow window'],
    ['docs/manual.md', 'Edit bottom bar'],
    ['docs/manual.md', 'The Help page'],
    ['docs/manual.md', 'Contents and search'],
    ['docs/manual.md', 'Search help'],
    ['docs/manual.md', 'One column at a time'],
    ['docs/manual.md', 'Not on the timeline yet'],
    ['docs/manual.md', 'Add dates'],
    ['docs/manual.md', 'marks today'],
    ['docs/manual.md', 'Show all'],
    ['docs/manual.md', 'Create note'],
    ['docs/manual.md', 'Move to top'],
    ['docs/manual.md', 'Fit to screen'],
    ['docs/manual.md', 'Assistant connected with a token'],
    ['docs/manual.md', 'Revoke this token'],
    ['docs/manual.md', 'Go to sign in'],
    ['docs/manual.md', 'Only a workspace owner or admin can rename a workspace'],
    ['docs/faq.md', 'Why do I only see one column of the board on my phone?'],
    ['docs/faq.md', 'How do I search the help?'],
    ['docs/faq.md', 'Only a workspace owner or admin can rename a workspace'],
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

/**
 * 22.227 (UX series) — statements the UX fixes made false are gone from the help.
 * The control runs first, on the same patterns, so a pass is not a pattern that cannot match.
 */
describe('22.227 the help no longer describes what the UX fixes removed or corrected', () => {
  const STALE = [
    ['anyone can rename a workspace', /\*anyone\* inside (a|the) workspace can rename/],
    ['a Next pager on the Help page', /\bNext\b[^.\n]*\bsection\b/i],
    ['a Press New note button', /Press \*\*New note\*\*/],
  ] as const;

  it('control: the patterns do match the old wording', () => {
    expect(STALE[0][1].test('at the moment *anyone* inside a workspace can rename it')).toBe(true);
    expect(STALE[0][1].test('right now *anyone* inside the workspace can rename it')).toBe(true);
    expect(STALE[1][1].test('press Next to go to the next section')).toBe(true);
    expect(STALE[2][1].test('Press **New note**. A window opens')).toBe(true);
  });

  it.each(['docs/manual.md', 'docs/faq.md'])('%s carries none of it', (path) => {
    for (const [, pattern] of STALE) expect(pattern.exec(read(path))).toBeNull();
  });

  it('the shipped copy carries none of it', () => {
    for (const [, pattern] of STALE) expect(pattern.exec(shipped)).toBeNull();
  });
});
