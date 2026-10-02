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
  "A ticket's own notes",
  'Mentioning somebody in a note',
  'Linking to a ticket or another note',
  'Deleting a note, and getting it back',
  'What notes cannot do yet',
];

describe('15.36 the generated corpus carries the notes release sections', () => {
  it('15.36 the manual has a "§15 — Notes" section, between §14 and §16, with its ten subsections', () => {
    const manual = document('manual');
    const notes = manual.sections.find((section) => section.id === '15-notes');
    expect(notes).toBeDefined();
    expect(notes?.title).toBe('§15 — Notes');
    // Immediately after §14 and immediately before §16 (added 2026-09-30, hosted
    // MCP Task 9 — it was the LAST section until then) — not merely present. A
    // section spliced in ahead of it would be a different defect than a missing one.
    const at = manual.sections.findIndex((section) => section.id === '15-notes');
    expect(manual.sections[at - 1]?.id).toBe('14-the-time-zone-and-other-things-worth-knowing');
    expect(manual.sections[at + 1]?.id).toBe('16-connecting-claude-or-chatgpt');
    expect(notes?.entries.map((entry) => entry.title)).toEqual(MANUAL_NOTES_SUBSECTIONS);
  });

  it('15.36 the FAQ has a "Notes" section, with a real question count', () => {
    const faq = document('faq');
    const notes = faq.sections.find((section) => section.title === 'Notes');
    expect(notes).toBeDefined();
    // 8–15 real questions, per the planner's brief (BRIEF-help-notes-2026-09-23.md:22, sized 8–12
    // before kb-editor-parity) — not a placeholder count. Widened to 14 (planner ruling, 2026-09-29):
    // the three questions kb-editor-parity (#744) added for its note-only ports (ReadingProgress,
    // HeadingCopyLink, DraftRestoreBanner) stay in Notes rather than being miscategorised as general
    // editor questions — none of the three is wired anywhere but note-document.tsx (HeadingAnchors is
    // gated on the `headingLink` option, passed only there; DraftRestoreBanner is imported only there),
    // so moving them to "Writing, comments and files" would describe a control readers of THAT section
    // cannot find. Widened to 15 (note mentions, 2026-09-29): "If I mention someone in a note, do they
    // get told?" answers the who-is-told and told-once rules, which belong with the note, not with the
    // ticket comment box.
    expect(notes?.entries.length).toBeGreaterThanOrEqual(8);
    expect(notes?.entries.length).toBeLessThanOrEqual(15);
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
  it('15.36 control: the notes section is genuinely §15 — present exactly once, and not the last chapter', () => {
    const manual = document('manual');
    const last = manual.sections[manual.sections.length - 1];
    expect(last?.id).not.toBe('14-the-time-zone-and-other-things-worth-knowing');
    expect(last?.id).not.toBe('15-notes');
    expect(manual.sections.filter((section) => section.id === '15-notes')).toHaveLength(1);
  });
});
