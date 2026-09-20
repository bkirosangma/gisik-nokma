import { docToPlainText } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { errandItems, readCcBoard } from '../../src/seed/cc-board.js';
import { errandDescriptionParts } from '../../src/seed/cc-map.js';
import { literalTextDoc, plainTextDoc, seedDescriptionDoc, type SeedTextPart } from '../../src/seed/doc-text.js';

type Doc = { type: string; content: Array<{ type: string; content?: unknown[]; marks?: unknown[] }> };

const boardPath = new URL('../../../../reference/convenience-corner-tracker/board.data.js', import.meta.url).pathname;
const board = readCcBoard(boardPath);
const titleById = new Map(board.items.map((item) => [item.id, item.title]));

/**
 * THE REAL 23 — every description the convenience-corner seed writes, built by
 * the seed's own path from the FROZEN board in `reference/`. Not a fixture
 * anyone wrote: `reference/` cannot change, and the count is asserted below
 * against the dev database's own row count (23) so a corpus that silently
 * shrank cannot make the corpus cases below vacuous.
 */
const descriptions: SeedTextPart[][] = errandItems(board).map((item) => errandDescriptionParts(item, titleById));
const markdownParts = descriptions.flat().filter((part) => part.kind === 'markdown');
const literalParts = descriptions.flat().filter((part) => part.kind === 'literal');

const textOf = (node: unknown): string => {
  let out = '';
  const walk = (current: unknown): void => {
    if (!current || typeof current !== 'object') return;
    const candidate = current as { type?: string; text?: string; content?: unknown[] };
    if (candidate.type === 'text' && typeof candidate.text === 'string') out += candidate.text;
    if (Array.isArray(candidate.content)) candidate.content.forEach(walk);
  };
  walk(node);
  return out;
};

/**
 * The document as LINES — one element per line of the text it was built from.
 *
 * ⚠ NOT `docToPlainText`, and not a plain concatenation of text nodes, because BOTH
 * lose the one thing the losslessness case is about: the line boundaries. A
 * paragraph renders as its line; an EMPTY paragraph renders as the empty line a
 * blank source line became; a list renders as one line per item, because that is
 * what a run of `- ` or `1. ` lines became. Joining with `\n` therefore makes
 * this directly comparable with `proseOf(markdown).split('\n')`, in the same
 * unit, with nothing to reconcile.
 */
function linesOf(doc: unknown): string[] {
  const content = (doc as { content?: unknown[] } | null)?.content ?? [];
  const lines: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') {
      lines.push('');
      continue;
    }
    const node = block as { type?: string; content?: unknown[] };
    if (node.type === 'paragraph' || node.type === 'heading') {
      lines.push(textOf(node));
      continue;
    }
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      for (const item of node.content ?? []) lines.push(textOf(item));
      continue;
    }
    lines.push(textOf(node));
  }
  return lines;
}

/**
 * THE ORIGINAL, WITH ITS MARKDOWN SYNTAX REMOVED — written from the SYNTAX
 * RULES, never by calling the parser. That independence is the whole point: a
 * comparison against the parser's own output could not fail, and this project
 * has paid for that mistake more than once.
 *
 * It is only a valid oracle on a corpus with BALANCED delimiters, which is
 * asserted below rather than assumed — an unpaired `*` is literal text the
 * parser is right to keep, and stripping it here would report a loss that did
 * not happen.
 */
function proseOf(markdown: string): string[] {
  return markdown.split('\n').map((line) =>
    line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\s*(?:[-+*]|\d+\.)\s+/, '')
      .replace(/\[([^\]\n]*)\]\([^)\s]*\)/g, '$1')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`/g, ''),
  );
}

/** Every mark applied to every text node, in document order. */
function marksOf(doc: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const candidate = node as { marks?: Array<{ type: string }>; content?: unknown[] };
    for (const mark of candidate.marks ?? []) out.push(mark.type);
    if (Array.isArray(candidate.content)) candidate.content.forEach(walk);
  };
  walk(doc);
  return out;
}

describe('plainTextDoc — the seed text renderer', () => {
  /**
   * 13.45 — REVERSED 2026-09-20, and flipped rather than deleted. Until the owner's ruling
   * (*"both"*) `plainTextDoc` kept record text literal and this case asserted the asterisks
   * survived. The decision, its §2 citation and the reversal are recorded in the docblock at
   * `src/seed/doc-text.ts` — the record stays on the symbol it was written about.
   */
  it('PARSES markdown now — a `**Gates:**` in a record becomes a bold mark, not two asterisks', () => {
    const doc = plainTextDoc('**Gates:** every SMS the platform will ever send — OTP included');

    expect(docToPlainText(doc)).toBe('Gates: every SMS the platform will ever send — OTP included');
    expect(marksOf(doc)).toEqual(['bold']);
  });

  /**
   * The other half of the same reversal, and the half a test of the flip alone
   * would leave unpinned: the record block is rendered by `literalTextDoc`, and
   * it must still keep its characters. Without this, a fix that made BOTH
   * renderers parse would pass the case above and quietly reformat the record.
   */
  it('literalTextDoc keeps text literal — the renderer the tracker-record block uses', () => {
    const doc = literalTextDoc('**Who:** Accountant');
    expect(docToPlainText(doc)).toContain('**Who:**');
    expect(marksOf(doc)).toEqual([]);
  });

  /**
   * 13.46 — one paragraph per line; blank lines become empty paragraphs.
   */
  it('one paragraph per line; blank lines become empty paragraphs', () => {
    const doc = literalTextDoc('line one\n\nline three') as Doc;
    expect(doc.content).toHaveLength(3);
    expect(doc.content[1]!.content).toBeUndefined();
  });

  /**
   * 13.47 — an empty string is still a valid one-paragraph doc, in BOTH renderers:
   * a doc with `content: []` is not a document the editor can put a cursor in.
   */
  it('an empty string is still a valid one-paragraph doc', () => {
    for (const build of [literalTextDoc, plainTextDoc]) {
      const doc = build('') as Doc;
      expect(doc.type).toBe('doc');
      expect(doc.content).toHaveLength(1);
    }
  });
});

describe('seedDescriptionDoc — the prose/record split, which is the decision this parse makes', () => {
  it('parses the markdown parts and leaves the literal ones alone, in one doc', () => {
    const doc = seedDescriptionDoc([
      { kind: 'markdown', text: '**Gates:** everything' },
      { kind: 'literal', text: 'tracker id: ops:x' },
    ]);
    // `docToPlainText` collapses runs of blank lines, so the separating paragraph
    // shows as ONE newline here and as a paragraph of its own in `linesOf` below.
    expect(docToPlainText(doc)).toBe('Gates: everything\ntracker id: ops:x');
    expect(linesOf(doc)).toEqual(['Gates: everything', '', 'tracker id: ops:x']);
    expect(marksOf(doc)).toEqual(['bold']);
  });

  it('separates two parts with exactly one empty paragraph, whatever the parts hold', () => {
    const doc = seedDescriptionDoc([
      { kind: 'markdown', text: 'first' },
      { kind: 'literal', text: 'second' },
    ]) as Doc;
    expect(doc.content.map((block) => block.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    expect(doc.content[1]!.content).toBeUndefined();
  });
});

describe('the parse over the REAL 23 descriptions', () => {
  /**
   * 16.77 — the corpus IS the database's: 23 descriptions, and every one of them carries
   * a `literal` record part beside at least one `markdown` part.
   *
   * ⚠ THE EQUALITY WITH THE STORED ROWS IS A FACT ABOUT THE PRE-CHANGE BUILD, NOT ABOUT
   * THIS ONE, and this comment said it in the present tense until an independent
   * review measured the difference. Measured read-only on 54330: the 23 stored
   * descriptions are all LITERAL-TEXT docs, and the text this build's parts join
   * to reproduces them **23 of 23** — which is what makes the corpus real. The
   * DOCS this build renders are the parsed shape and therefore match **0 of 23**,
   * deliberately: that is the change. The dev rows keep the old shape because the
   * seed is idempotent on `seedUlid`; the remedy and its owner are recorded in
   * `test-cases/16-remaining-doors.md`.
   */
  it('is the corpus the database holds — 23 descriptions, each with a record part', () => {
    expect(descriptions).toHaveLength(23);
    expect(descriptions.every((parts) => parts.some((part) => part.kind === 'literal'))).toBe(true);
    expect(descriptions.every((parts) => parts.some((part) => part.kind === 'markdown'))).toBe(true);
    // One markdown part for the body, and a SECOND for the quoted ask — so the
    // markdown count is 23 plus the number of records that carry an ask, which is
    // derived here rather than pinned as a number that would drift silently.
    const withAsk = descriptions.filter((parts) => parts.some((part) => part.text.startsWith('ask (verbatim')));
    expect(withAsk.length).toBeGreaterThan(0);
    expect(markdownParts.length).toBe(23 + withAsk.length);
  });

  /**
   * ⚠ THE PRECONDITION OF THE LOSSLESSNESS ORACLE, measured rather than assumed: `proseOf`
   * strips delimiters by count, so it is only a valid oracle where every `*` and every
   * backtick is PAIRED. The real corpus is clean on both (measured: zero lines with an odd
   * count of either). If this case ever reddens, the losslessness case below is not evidence
   * and must not be read as such.
   */
  it('every delimiter in the corpus is PAIRED — the oracle below depends on it', () => {
    const odd = markdownParts.flatMap((part) =>
      part.text
        .split('\n')
        .filter((line) => (line.match(/\*/g) ?? []).length % 2 === 1 || (line.match(/`/g) ?? []).length % 2 === 1),
    );
    expect(odd).toEqual([]);
  });

  /**
   * 16.77 — the parse is LOSSLESS over the 23 real descriptions: every prose character
   * survives.
   *
   * ⛔ THE CASE THE DISPATCH PUTS FIRST, and its control is INSIDE IT rather than
   * beside it: if `proseOf` were an identity, losslessness would be satisfied by
   * a parser that did nothing at all, so the non-identity is asserted first, in
   * the same `it()`. ⚠ **This was two sibling cases until an independent review
   * measured that the control was not in the same invocation at all — they are
   * separate rows to vitest, the guarded case reddens while the control stays
   * green, and deleting the control changes nothing. A control that gates
   * nothing is a sentence, not a check.**
   *
   * ⚠ AND WHAT THIS CASE CANNOT CATCH, stated because the comment claimed it could: it
   * compares TEXT, so a mark silently dropped — every `**bold**` losing its
   * `bold` — leaves it GREEN. Measured by mutation. **The net for mark loss is
   * the census case below, not this one**; they fail for different reasons and
   * neither substitutes for the other.
   */
  it('LOSSLESS: every prose character of all 23 survives the parse', () => {
    // The control, FIRST and in this same invocation.
    const raw = markdownParts.reduce((sum, part) => sum + part.text.length, 0);
    const stripped = markdownParts.reduce((sum, part) => sum + proseOf(part.text).join('\n').length, 0);
    expect(raw - stripped, 'the oracle is an identity — this case would prove nothing').toBeGreaterThan(1000);

    for (const part of markdownParts) {
      expect(linesOf(plainTextDoc(part.text)), `lost prose in: ${part.text.slice(0, 60)}`).toEqual(proseOf(part.text));
    }
  });

  /**
   * ⛔ THE LITERAL HALF, and it is not decoration: 172 record lines ride through the same
   * builder, and a parse that touched them would turn `— tracker record —` and
   * `clears week 1 · needed week 15 · slack 14` into prose with marks. Asserted
   * as exact equality with the input, so a single consumed character fails.
   */
  it('LOSSLESS: not one character of any record block is touched, and none gains a mark', () => {
    for (const part of literalParts) {
      const doc = literalTextDoc(part.text);
      expect(linesOf(doc).join('\n')).toBe(part.text);
      expect(marksOf(doc)).toEqual([]);
    }
  });

  /**
   * The marks the real corpus actually produces, pinned per construct so a
   * change that moved one between constructs cannot reconcile against a total.
   * Counted on this corpus by the parser; the raw-text census that corroborates
   * it is in the case below, in its own unit.
   */
  it('PRODUCES the marks the corpus holds — the assertion a no-op parser fails', () => {
    const counts: Record<string, number> = {};
    const nodes: Record<string, number> = {};
    for (const part of markdownParts) {
      const doc = plainTextDoc(part.text);
      for (const mark of marksOf(doc)) counts[mark] = (counts[mark] ?? 0) + 1;
      const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        const candidate = node as { type?: string; content?: unknown[] };
        if (typeof candidate.type === 'string') nodes[candidate.type] = (nodes[candidate.type] ?? 0) + 1;
        if (Array.isArray(candidate.content)) candidate.content.forEach(walk);
      };
      walk(doc);
    }

    // Counted on THIS corpus. Pinned per construct rather than as a total so a
    // change that moved a mark between constructs could not reconcile against a
    // sum — the shape `rule-census.test.ts` uses for the same reason.
    expect(counts).toEqual({ bold: 148, italic: 39, code: 44, link: 2 });
    expect(nodes['heading']).toBe(32);
    expect(nodes['bulletList']).toBe(3);
    expect(nodes['orderedList']).toBe(4);
    expect(nodes['listItem']).toBe(32);

    // Two of the four are EXACTLY derivable from the raw text in a different unit,
    // so they are not restatements of the parser's own output: a code span and a
    // link each consume exactly one delimiter pair, and neither nests.
    const raw = markdownParts.map((part) => part.text).join('\n');
    expect(counts['code']).toBe((raw.match(/`/g) ?? []).length / 2);
    expect(counts['link']).toBe((raw.match(/\]\(/g) ?? []).length);
    // One list item per marker line, counted from the raw text rather than from
    // the parse: 32, which the shipped docs corroborate — the dev database's
    // descriptions hold 15 dash-marker lines and 17 numbered ones.
    const markerLines = raw.split('\n').filter((line) => /^\s*(?:[-+*]|\d+\.)\s+/.test(line)).length;
    expect(nodes['listItem']).toBe(markerLines);
    // Bold and italic are floored rather than equalled: a `**a *b* c**` run is ONE
    // pair and THREE bold-carrying nodes, so pair count is a lower bound and the
    // exact number above is the measurement.
    expect(counts['bold']).toBeGreaterThanOrEqual((raw.match(/\*\*/g) ?? []).length / 2);
    expect(counts['italic']).toBeGreaterThanOrEqual((raw.match(/(^|[^*])\*(?!\*)/g) ?? []).length / 2);
  });

  /**
   * The same corpus, counted in the RAW TEXT's own unit: how many text NODES
   * (lines, in the shipped docs) carry each construct as literal characters.
   * A different unit from the case above on purpose — this is the input side,
   * measured, so the output census above is corroborated rather than merely
   * restated.
   */
  it('corroboration: the raw text carries the constructs the parse consumed', () => {
    const raw = markdownParts.map((part) => part.text).join('\n');
    expect((raw.match(/\*\*/g) ?? []).length).toBeGreaterThan(0);
    expect((raw.match(/`/g) ?? []).length).toBeGreaterThan(0);
    expect((raw.match(/\]\(/g) ?? []).length).toBe(2);
    // The parse really did consume the delimiters: none survives into the text.
    const text = markdownParts.map((part) => textOf(plainTextDoc(part.text))).join('\n');
    expect(text).not.toContain('**');
    expect(text).not.toContain('`');
  });

  /**
   * ⚠ WHAT THE PARSE DOES *NOT* DO, asserted rather than left to prose: the stored
   * records hold TWO `[text](url)` links, and both become real link marks with their
   * destination in `href`. That is a DECISION — those links were written into
   * records while the editor's own typed-link rule was off, so the editor's rules
   * would not have produced them. The alternative (leaving them literal) is the
   * other defensible answer; this case names which one shipped.
   */
  it('turns the corpus’s two [text](url) pairs into links, destination and all', () => {
    const hrefs = markdownParts.flatMap((part) => {
      const found: string[] = [];
      const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        const candidate = node as { marks?: Array<{ type: string; attrs?: { href?: string } }>; content?: unknown[] };
        for (const mark of candidate.marks ?? []) if (mark.type === 'link' && mark.attrs?.href) found.push(mark.attrs.href);
        if (Array.isArray(candidate.content)) candidate.content.forEach(walk);
      };
      walk(plainTextDoc(part.text));
      return found;
    });
    expect(hrefs).toEqual([
      '../../README.md#cloud',
      'https://www.reddit.com/r/iOSProgramming/comments/1fapajq/enroling_in_apple_developer_program_as_a_sole/',
    ]);
  });
});
