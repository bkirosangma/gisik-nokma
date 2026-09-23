import { describe, expect, it } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';
import type { HelpDocument } from '../../src/help/types.js';

/**
 * Case 15.36 — the generated corpus carries the notes release's two new
 * sections, against the REAL generated content rather than a fixture, for
 * the same reason `search.test.ts` and `groups.test.ts` give: a fixture
 * would only prove the parser works on a document written to make it work.
 *
 * Two mutations pin this pair, and both live OUTSIDE this file because they
 * are `check:help`'s own machinery, not this test's: delete the section
 * from `docs/manual.md` WITHOUT regenerating and `pnpm check:help` reports
 * `content.generated.ts` stale and exits 1 (the freshness half); delete it
 * AND regenerate, and this test goes red instead, because the content the
 * corpus carries is genuinely gone (the content half).
 */
function document(id: HelpDocument['id']): HelpDocument {
  const found = HELP_CONTENT.find((doc) => doc.id === id);
  if (found === undefined) throw new Error(`no help document "${id}"`);
  return found;
}

const MANUAL_NOTES_SUBSECTIONS = [
  'What a note is',
  'Making a note',
  'Who can see your note',
  'Writing a note',
  'Finding a note',
  "A job's own notes",
  'Linking to a job or another note',
  'Deleting a note, and getting it back',
  'What notes cannot do yet',
];

describe('15.36 the generated corpus carries the notes release sections', () => {
  it('15.36 the manual has a "§15 — Notes" section, last in document order, with its nine subsections', () => {
    const manual = document('manual');
    const notes = manual.sections.find((section) => section.id === '15-notes');
    expect(notes).toBeDefined();
    expect(notes?.title).toBe('§15 — Notes');
    // Last, not merely present — §15 follows §14, and a section spliced in
    // ahead of it would be a different defect than a missing one.
    expect(manual.sections[manual.sections.length - 1]?.id).toBe('15-notes');
    expect(notes?.entries.map((entry) => entry.title)).toEqual(MANUAL_NOTES_SUBSECTIONS);
  });

  it('15.36 the FAQ has a "Notes" section, with a real question count', () => {
    const faq = document('faq');
    const notes = faq.sections.find((section) => section.title === 'Notes');
    expect(notes).toBeDefined();
    // 8–12 real questions, per the owner's brief — not a placeholder count.
    expect(notes?.entries.length).toBeGreaterThanOrEqual(8);
    expect(notes?.entries.length).toBeLessThanOrEqual(12);
    // Every entry is a real question, not an empty heading.
    for (const entry of notes?.entries ?? []) {
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.blocks.length).toBeGreaterThan(0);
    }
  });

  /**
   * The control half of the ordering assertion above: a sequence comparison
   * (not a `toContain`) is what would catch the manual section landing
   * somewhere OTHER than last — e.g. spliced in before §14 by an editor
   * mistake, or duplicated. Both leave `notes` defined and would pass a
   * weaker existence check.
   */
  it('15.36 control: the manual’s last section is genuinely the notes section, not merely present', () => {
    const manual = document('manual');
    const last = manual.sections[manual.sections.length - 1];
    expect(last?.id).not.toBe('14-the-time-zone-and-other-things-worth-knowing');
    expect(manual.sections.filter((section) => section.id === '15-notes')).toHaveLength(1);
  });
});
