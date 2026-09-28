import { describe, expect, it } from 'vitest';
import { extractReadingMeta, readingTimeMinutes } from '../src/reading/reading-meta.js';

/**
 * 9.288–9.289 — the reading extras (spec §8.2), ported from the knowledge-base
 * app. The source reads the RENDERED DOM rather than the document, and so does
 * this, so the fixture is DOM rather than a ProseMirror document.
 */
function root(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('9.288 extractReadingMeta', () => {
  it('9.288 counts words, lists h1–h3 with slug ids, and stamps them on the elements', () => {
    const el = root(
      '<h1>GST filing</h1><p>due soon or else</p><h2>The cold room</h2><h3>Compressor</h3><h4>Not listed</h4>',
    );
    const meta = extractReadingMeta(el);
    // EVERY word in the rendered node, including the h4's — the count is of
    // the text a reader sees, not of the headings the rail lists.
    // "GST filing" (2) + "due soon or else" (4) + "The cold room" (3) +
    // "Compressor" (1) + "Not listed" (2) = 12.
    expect(meta.wordCount).toBe(12);
    expect(meta.headings).toEqual([
      { id: 'gst-filing', level: 1, text: 'GST filing' },
      { id: 'the-cold-room', level: 2, text: 'The cold room' },
      { id: 'compressor', level: 3, text: 'Compressor' },
    ]);
    // THE IDS ARE ON THE LIVE NODES — that is what lets the rail scroll to a
    // heading without re-querying or re-parsing.
    expect(el.querySelector('h1')?.id).toBe('gst-filing');
    expect(el.querySelector('h2')?.id).toBe('the-cold-room');
    // …and an h4 is not LISTED (`ReadingMeta.headings` is typed 1 | 2 | 3, and
    // the rail's `MIN_HEADINGS` counts those) but IS stamped, since KB parity: a
    // copied link to an H4 has to resolve (9.414).
    expect(el.querySelector('h4')?.id).toBe('not-listed');
  });

  it('9.288 two headings with the same text get -2 suffixes; an empty one falls back', () => {
    const el = root('<h2>Notes</h2><p>x</p><h2>Notes</h2><h2>...</h2>');
    const ids = extractReadingMeta(el).headings.map((h) => h.id);
    // TWO ids for two headings with one name — without the suffix the rail's
    // `querySelector('#notes')` would send both entries to the first.
    expect(ids[0]).toBe('notes');
    expect(ids[1]).toBe('notes-2');
    // A heading of pure punctuation slugs to nothing, and gets a positional
    // id rather than `id=""` (which would put every such heading on one
    // target).
    expect(ids[2]).toBe('heading-3');
  });

  /**
   * THREE IS THE CASE THE SOURCE GETS WRONG and this port fixes, asserted so
   * the fix cannot silently revert: the source counts collisions against the
   * SUFFIXED id, so a third `Notes` looks up a key nobody wrote and produces
   * `notes-2` a second time.
   */
  it('9.288 three headings with the same text get three distinct ids', () => {
    const el = root('<h2>Notes</h2><h2>Notes</h2><h2>Notes</h2>');
    const ids = extractReadingMeta(el).headings.map((h) => h.id);
    expect(ids).toEqual(['notes', 'notes-2', 'notes-3']);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('9.289 readingTimeMinutes', () => {
  it('9.289 0→0, 1→1, 199→1, 300→2', () => {
    expect(readingTimeMinutes(0)).toBe(0);
    expect(readingTimeMinutes(1)).toBe(1);
    expect(readingTimeMinutes(199)).toBe(1);
    expect(readingTimeMinutes(300)).toBe(2);
    // The two ends of the same rule: 200 is exactly one minute, and a negative
    // count is nothing to report rather than a negative read.
    expect(readingTimeMinutes(200)).toBe(1);
    expect(readingTimeMinutes(-5)).toBe(0);
  });
});
