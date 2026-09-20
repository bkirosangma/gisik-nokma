import { docToPlainText } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { markdownToDoc } from '../../src/seed/markdown-doc.js';

type Node = { type: string; text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; attrs?: Record<string, unknown>; content?: Node[] };

const doc = (markdown: string): Node => markdownToDoc(markdown) as Node;
const blocks = (markdown: string): Node[] => doc(markdown).content ?? [];
const marksIn = (markdown: string): string[] => {
  const out: string[] = [];
  const walk = (node: Node | undefined): void => {
    if (!node) return;
    for (const mark of node.marks ?? []) out.push(mark.type);
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc(markdown));
  return out;
};

/**
 * 16.76 — the parser handles exactly the constructs the shipped records were MEASURED
 * to hold, and refuses every other markdown construct rather than guessing at
 * it.
 *
 * The parser is deliberately SMALLER than markdown. Every case below states
 * one construct it handles and the constructs it refuses, because the refusal
 * is the load-bearing half: the texts this parses are FROZEN RECORDS, and a
 * construct the parser half-understands would silently rewrite prose that was
 * never markup. The corpus it must survive is measured and pinned in
 * `doc-text.test.ts`; this file states the rules it is built from.
 */
describe('markdownToDoc — the constructs it handles', () => {
  it('turns **bold** into a bold mark and drops the delimiters', () => {
    const [para] = blocks('**Gates:** every SMS');
    expect(para).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Gates:', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' every SMS' },
      ],
    });
  });

  it('turns *italic* into an italic mark and drops the delimiters', () => {
    const [para] = blocks('see *Check this first* below');
    expect(para).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'see ' },
        { type: 'text', text: 'Check this first', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' below' },
      ],
    });
  });

  it('turns `code` into a code mark, and its content is never re-parsed', () => {
    // The inner `**` is the point: a code span is literal inside, so a parser that
    // recursed into it would bold the halves and lose the asterisks.
    expect(marksIn('see `a **b** c` here')).toEqual(['code']);
    expect(docToPlainText(doc('see `a **b** c` here'))).toBe('see a **b** c here');
  });

  it('turns [text](url) into a link mark carrying href, with the URL out of the text', () => {
    const [para] = blocks("are in the README's [Cloud](../../README.md#cloud) section");
    expect(para?.content?.[1]).toEqual({
      type: 'text',
      text: 'Cloud',
      marks: [{ type: 'link', attrs: { href: '../../README.md#cloud' } }],
    });
    expect(docToPlainText(doc("are in the README's [Cloud](../../README.md#cloud) section"))).toBe(
      "are in the README's Cloud section",
    );
  });

  it('nests a mark inside a mark rather than dropping the inner one', () => {
    // Asserted as the SEGMENTS, not as a flat mark list: the inner run must carry
    // bold AND italic, and a flat list cannot say which node holds which.
    const [para] = blocks('**bold with *inner* italic**');
    expect(para?.content).toEqual([
      { type: 'text', text: 'bold with ', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'inner', marks: [{ type: 'bold' }, { type: 'italic' }] },
      { type: 'text', text: ' italic', marks: [{ type: 'bold' }] },
    ]);
  });

  it('turns a leading # run into a heading at that level', () => {
    const [heading] = blocks('## Where it stands');
    expect(heading).toEqual({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Where it stands' }],
    });
  });

  it('gathers consecutive - lines into ONE bulletList, one listItem each', () => {
    const list = blocks('- **Google Play**: the console\n- **Apple**: the portal')[0];
    expect(list?.type).toBe('bulletList');
    expect(list?.content).toHaveLength(2);
    expect(list?.content?.[0]?.type).toBe('listItem');
    expect(marksIn('- **Google Play**: the console\n- **Apple**: the portal')).toEqual(['bold', 'bold']);
  });

  it('gathers consecutive "N. " lines into ONE orderedList', () => {
    const list = blocks('1. Under reverse charge\n2. Does the forex market')[0];
    expect(list?.type).toBe('orderedList');
    expect(list?.content).toHaveLength(2);
  });

  it('a blank line is an empty paragraph, and it ends a list', () => {
    const out = blocks('1. one\n2. two\n\nplain text');
    expect(out.map((n) => n.type)).toEqual(['orderedList', 'paragraph', 'paragraph']);
    expect(out[2]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'plain text' }] });
  });
});

describe('markdownToDoc — the constructs it REFUSES, and why', () => {
  it('leaves _underscore_ emphasis literal, because the real records use it intraword', () => {
    // `submitted_on` and `enroling_in_apple_developer_program` are the measured
    // shapes. CommonMark would not emphasise them either; a naive `_…_` rule would.
    expect(marksIn('fill `submitted_on` and enroling_in_apple_developer_program now')).toEqual(['code']);
    expect(docToPlainText(doc('a_b_c keeps its underscores'))).toBe('a_b_c keeps its underscores');
  });

  it('leaves an UNMATCHED delimiter literal rather than pairing it with a later one', () => {
    expect(docToPlainText(doc('2 * 3 * 4 = 24'))).toBe('2 * 3 * 4 = 24');
    expect(marksIn('2 * 3 * 4 = 24')).toEqual([]);
    expect(docToPlainText(doc('a ** b'))).toBe('a ** b');
  });

  it('leaves a delimiter that only touches whitespace literal', () => {
    // ⚠ MID-LINE ON PURPOSE. The first version of this case wrote `* leading space*`
    // at the START of the line and was simply wrong: markdown reads that as a BULLET
    // whose text is `leading space*`, and this parser does too — which the test
    // proved by failing. The rule under test is about a delimiter touching
    // whitespace, and a line-leading `* ` is a different rule (the block one).
    expect(marksIn('see * spaced * here')).toEqual([]);
    expect(docToPlainText(doc('see * spaced * here'))).toBe('see * spaced * here');
  });

  it('still reads a line-leading "* " as a bullet, whose text may itself be unclosed', () => {
    const [list] = blocks('* leading space*');
    expect(list?.type).toBe('bulletList');
    expect(list?.content?.[0]).toEqual({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'leading space*' }] }],
    });
  });

  it('leaves __bold__, ~~strike~~, > quote, ``` fences and --- rules literal', () => {
    // Each is a real markdown construct the editor's schema can express — and
    // each is OUT of this parser's vocabulary, so it survives as characters.
    expect(marksIn('x __bold__')).toEqual([]);
    expect(marksIn('x ~~strike~~')).toEqual([]);
    expect(docToPlainText(doc('> quoted'))).toBe('> quoted');
    expect(docToPlainText(doc('```\nfenced\n```'))).toBe('```\nfenced\n```');
    expect(docToPlainText(doc('---'))).toBe('---');
  });

  it('keeps a bare URL as characters — nothing here autolinks', () => {
    // The seed never typed a link into a record that already holds a bare URL, and
    // the parser must not invent one: `markdownToDoc` reads delimiters, not URLs.
    expect(marksIn('see https://gst.gov.in now')).toEqual([]);
  });
});

describe('markdownToDoc — the empty and degenerate inputs', () => {
  it('an empty string is a doc with one empty paragraph, never a doc with none', () => {
    // A doc with `content: []` is not a valid ProseMirror document; the editor
    // would have nothing to put a cursor in.
    expect(doc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('a single newline is two empty paragraphs, matching one-paragraph-per-line', () => {
    expect(doc('\n')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph' }] });
  });
});
