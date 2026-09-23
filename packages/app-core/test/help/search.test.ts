import { describe, expect, it } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';
import { findHelpEntry, searchHelp } from '../../src/help/search.js';
import { blockSpans, entryText, spansToText } from '../../src/help/types.js';

/**
 * The in-app manual and FAQ — the shared half, which all three apps render.
 *
 * These run against the REAL generated content, not a fixture. A fixture would
 * prove the search algorithm works on a document somebody wrote to make it work;
 * the property that matters is that it works on the two documents the product
 * actually ships, whose shape (sixteen sections, 224 entries, tables, quotes and
 * numbered steps) is not something a fixture would have thought to produce.
 */

describe('the generated content is the documents, not a summary of them', () => {
  it('15.1 carries both documents, with sections and entries', () => {
    expect(HELP_CONTENT.map((d) => d.id)).toEqual(['manual', 'faq']);
    const entries = HELP_CONTENT.flatMap((d) => d.sections.flatMap((s) => s.entries));
    expect(entries.length).toBeGreaterThan(150);
    // Every entry has a non-empty id and title, or a deep link points at nothing.
    expect(entries.filter((e) => e.id.length === 0 || e.title.length === 0)).toEqual([]);
  });

  it('15.2 gives every entry in a document a UNIQUE id, so a deep link is unambiguous', () => {
    for (const document of HELP_CONTENT) {
      const ids = document.sections.flatMap((s) => s.entries.map((e) => e.id));
      expect(new Set(ids).size, `${document.id} has duplicate entry ids`).toBe(ids.length);
    }
  });

  /**
   * 15.3 — the passage the coverage map nearly got wrong, corrected again by
   * help-notes Unit 4d once starting-status gave the New ticket window its
   * own Start/Due date inputs.
   *
   * The map initially believed a "require a field" rule's typing box was a
   * due-date workaround, checked, found it is not, and corrected all three
   * documents rather than shipping the wrong claim. Then the starting-status
   * release (2026-09-23) made the ORIGINAL correction itself read as a wider
   * claim than true — "It will not get you a due date" was about this one
   * typing box, but by then a job's date COULD be set at creation through a
   * different control, and an unqualified sentence would have read as "you
   * cannot set a due date when creating a job". This asserts the
   * RE-corrected, scoped version survived the parse into the app — because a
   * build-time transform is exactly where a carefully corrected sentence
   * could quietly lose its correction and nobody would look again.
   */
  it('15.3 preserves the corrected due-date passage rather than either near-miss', () => {
    const all = HELP_CONTENT.flatMap((d) =>
      d.sections.flatMap((s) => s.entries.map((e) => entryText(e))),
    ).join('\n');
    expect(all).toContain('This particular box will not get you a due date');
    expect(all).toContain('A custom date only ever draws a marker');
    expect(all).toContain('You can still set both dates properly');
    // Neither the original wrong claim nor the unqualified 2026-09-23 near-miss.
    expect(all).not.toContain('is a workaround for a due date');
    expect(all).not.toContain('It will not get you a due date.');
  });

  it('15.4 keeps emphasis rather than flattening it — the documents mark their load-bearing claims with it', () => {
    const spans = HELP_CONTENT.flatMap((d) =>
      d.sections.flatMap((s) => s.entries.flatMap((e) => e.blocks.flatMap(blockSpans))),
    );
    const kinds = new Set(spans.map((s) => s.kind));
    expect(kinds.has('bold')).toBe(true);
    expect(kinds.has('text')).toBe(true);
    // A span kind that carries no text would render as a gap in a sentence.
    expect(spans.filter((s) => typeof s.text !== 'string')).toEqual([]);
  });

  it('15.5 parses numbered steps as an ordered list, because the manual is instructions', () => {
    const lists = HELP_CONTENT.flatMap((d) =>
      d.sections.flatMap((s) => s.entries.flatMap((e) => e.blocks)),
    ).filter((b) => b.kind === 'list');
    const ordered = lists.filter((b) => b.kind === 'list' && b.ordered);
    // Both kinds must be present: if `ordered` were hard-coded either way, one of
    // these two counts would be zero and the other would be all of them.
    expect(ordered.length).toBeGreaterThan(5);
    expect(lists.length - ordered.length).toBeGreaterThan(5);
  });
});

describe('searchHelp', () => {
  it('15.6 requires EVERY term, in any order', () => {
    const forward = searchHelp(HELP_CONTENT, 'due date');
    const reversed = searchHelp(HELP_CONTENT, 'date due');
    expect(forward.kind).toBe('matches');
    expect(reversed.kind).toBe('matches');
    if (forward.kind !== 'matches' || reversed.kind !== 'matches') return;
    // Same set, whatever the word order — a substring search would find the
    // first and nothing for the second.
    expect(new Set(reversed.matches.map((m) => m.entry.id))).toEqual(
      new Set(forward.matches.map((m) => m.entry.id)),
    );

    // And a term that appears nowhere kills the whole query, rather than the
    // search quietly falling back to OR and returning everything about dates.
    const withNonsense = searchHelp(HELP_CONTENT, 'due zzzznotaword');
    expect(withNonsense.kind).toBe('none');
  });

  it('15.7 ranks a title hit above a body mention', () => {
    const result = searchHelp(HELP_CONTENT, 'passkey');
    expect(result.kind).toBe('matches');
    if (result.kind !== 'matches') return;
    const top = result.matches[0];
    expect(top).toBeDefined();
    // The best match's own title contains the term. Without the title weighting
    // this is whichever entry happens to say "passkey" most often in passing.
    expect(top?.entry.title.toLowerCase()).toContain('passkey');
  });

  it('15.8 says WHICH KIND of nothing it found, rather than an empty list', () => {
    const blank = searchHelp(HELP_CONTENT, '   ');
    expect(blank).toEqual({ kind: 'none', reason: { kind: 'empty-query' } });

    const miss = searchHelp(HELP_CONTENT, 'zzzznotawordanywhere');
    expect(miss.kind).toBe('none');
    if (miss.kind !== 'none' || miss.reason.kind !== 'no-match') throw new Error('expected no-match');
    // It reports how many entries it looked through: "nothing matched" and
    // "nothing was searched" are different failures and the second is a bug.
    expect(miss.reason.searched).toBeGreaterThan(150);
    expect(miss.reason.query).toBe('zzzznotawordanywhere');
  });

  it('15.9 returns an excerpt that shows WHY the entry matched', () => {
    const result = searchHelp(HELP_CONTENT, 'password');
    expect(result.kind).toBe('matches');
    if (result.kind !== 'matches') return;
    const withText = result.matches.filter((m) => m.excerpt.length > 0);
    expect(withText.length).toBeGreaterThan(0);
    // At least one excerpt contains the term — an excerpt that never shows the
    // match is decoration.
    expect(withText.some((m) => m.excerpt.toLowerCase().includes('password'))).toBe(true);
  });

  it('15.10 is stable: the same query twice gives the same order', () => {
    const a = searchHelp(HELP_CONTENT, 'workspace');
    const b = searchHelp(HELP_CONTENT, 'workspace');
    expect(a).toEqual(b);
  });
});

describe('findHelpEntry — what a deep link resolves through', () => {
  it('15.11 finds an entry by document and id, and answers null for a wrong one', () => {
    // The FIRST section of the manual has intro prose and no `###` subsections,
    // so it has no entries — an earlier version of this case reached for
    // `sections[0].entries[0]` and got undefined. Take the first section that
    // actually has one; a section without entries is a real, valid shape here.
    const manual = HELP_CONTENT.find((d) => d.id === 'manual');
    const first = manual?.sections.find((s) => s.entries.length > 0)?.entries[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    const found = findHelpEntry(HELP_CONTENT, 'manual', first.id);
    expect(found?.entry.id).toBe(first.id);
    expect(found?.document.id).toBe('manual');
    // The same id under the wrong document must not resolve — ids are unique
    // per document, not globally, so a cross-document lookup is a real mistake.
    expect(findHelpEntry(HELP_CONTENT, 'faq', first.id)?.entry.id ?? null).not.toBe(first.id);
    expect(findHelpEntry(HELP_CONTENT, 'manual', 'no-such-entry-at-all')).toBeNull();
  });
});

describe('spansToText', () => {
  it('15.12 joins without inventing whitespace, so a bold word does not gain spaces', () => {
    expect(
      spansToText([
        { kind: 'text', text: 'a ' },
        { kind: 'bold', text: 'bold' },
        { kind: 'text', text: ' word' },
      ]),
    ).toBe('a bold word');
  });
});
