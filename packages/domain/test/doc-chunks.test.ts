import { describe, expect, it } from 'vitest';
import { chunkDoc } from '../src/doc-chunks.js';

/**
 * 18.125 — `chunkDoc` (spec §7.6, Plan 3 of 6).
 *
 * The unit is the CHUNK, not the block: a meaning search returns the piece of
 * the document that is close to the query, and a chunk that is one paragraph is
 * a paragraph the reader has to re-read the whole note to place. So the walk
 * keeps a heading path and packs blocks under it, and this file pins the three
 * things that decide where a chunk ends: a heading, the word budget, and
 * nothing at all.
 *
 * The CONTROL — one short paragraph, no heading — is the one that pins what the
 * chunk text IS when there is no heading to prepend: the paragraph, exactly, with
 * no leading newline. A literal reading of the spec's `headingPath + '\n' + text`
 * would prepend a newline to every headingless chunk, and a newline is not a
 * neutral byte: it is the first character of the embedding input and the first
 * character of the snippet a meaning hit displays.
 */

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string };

function paragraph(text: string): Node {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function heading(text: string, level: number): Node {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

function doc(...content: Node[]): Node {
  return { type: 'doc', content };
}

describe('18.125 — chunkDoc', () => {
  it('splits on headings, prepends the heading path, honours the word budget, and is empty for an empty doc', () => {
    // CONTROL: one short paragraph under no heading → ONE chunk, whose text is
    // the paragraph itself. No heading path, and no newline where one would be.
    const control = chunkDoc(doc(paragraph('the compressor stopped')));
    expect(control).toHaveLength(1);
    expect(control[0]?.headingPath).toBe('');
    expect(control[0]?.text, 'a headingless chunk is the text, not a newline then the text').toBe(
      'the compressor stopped',
    );

    // A heading changes the path, and does NOT contribute body text of its own.
    const withHeadings = chunkDoc(
      doc(heading('Cold room', 1), paragraph('first body'), heading('Compressor', 2), paragraph('second body')),
    );
    expect(withHeadings.map((chunk) => chunk.headingPath)).toEqual(['Cold room', 'Cold room > Compressor']);
    expect(withHeadings[0]?.text).toBe('Cold room\nfirst body');
    expect(withHeadings[1]?.text).toBe('Cold room > Compressor\nsecond body');

    // A second H1 ABOVE the previous path resets it rather than appending.
    const reset = chunkDoc(doc(heading('Cold room', 1), paragraph('a'), heading('Roof', 1), paragraph('b')));
    expect(reset.map((chunk) => chunk.headingPath)).toEqual(['Cold room', 'Roof']);

    // The word budget: 200 one-word paragraphs under one heading → 150 then 50.
    const long = chunkDoc(doc(heading('Long', 1), ...Array.from({ length: 200 }, () => paragraph('word'))));
    expect(long).toHaveLength(2);
    const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
    // Both counts carry the heading line's own word, which is the point of
    // prepending it: 150 body words + the heading, then the 50 left over + the
    // same heading. The BUDGET is measured on the body, so the two bodies are
    // 150 and 50 — asserting the totals is what pins that the heading is in the
    // text rather than only in `headingPath`.
    expect(wordCount(long[0]?.text ?? '')).toBe(151);
    expect(wordCount(long[1]?.text ?? '')).toBe(51);
    expect(long[1]?.headingPath, 'the new chunk keeps the heading it was cut under').toBe('Long');

    // Empty documents produce nothing at all, by every route into "empty".
    expect(chunkDoc(doc())).toEqual([]);
    expect(chunkDoc({ type: 'doc' })).toEqual([]);
    expect(chunkDoc(null)).toEqual([]);
    expect(chunkDoc({ type: 'doc', content: [paragraph('')] }), 'a blank paragraph is no chunk').toEqual([]);
  });
});
