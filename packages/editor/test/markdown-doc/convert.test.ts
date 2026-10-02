// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { plainTextToDoc } from '@gisik-nokma/domain';
import {
  docToMarkdown,
  markdownToDoc,
  scanMarkdownRefs,
  type DocNode,
  type RefResolver,
} from '../../src/markdown-doc/index.js';

const ulid = (tag: string): string => `01J0${tag}`.padEnd(26, '0');
const ASHA = ulid('ASHA');
const IMG = ulid('1MG');
const NOTE = ulid('N0TE');
const TICKET = ulid('TKT');
const PROJECT = ulid('PRJ');

const resolve: RefResolver = {
  user: (id) => (id === ASHA ? { userId: ASHA, label: 'Asha Marak' } : null),
  ticket: (key) => (key === 'CCSO-4' ? { ticketId: TICKET, projectId: PROJECT, key: 'CCSO-4', title: 'Chiller' } : null),
  note: (ref) => (ref === 'Cold room' || ref === NOTE ? { noteId: NOTE, title: 'Cold room' } : null),
};

const blocks = (md: string): DocNode[] => {
  const { doc, problems } = markdownToDoc(md, resolve);
  expect(problems).toEqual([]);
  return (doc as { content: DocNode[] }).content;
};
const types = (nodes: DocNode[] | undefined): string[] => (nodes ?? []).map((n) => n.type);
const inline = (md: string): DocNode[] => blocks(md)[0]?.content ?? [];

describe('26.001–26.009 the converter', () => {
  it('26.001 runs with no DOM', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    expect(inline('**x**')[0]).toMatchObject({ type: 'text', text: 'x', marks: [{ type: 'bold' }] });
  });

  it('26.002 every supported node and mark round-trips Markdown → document → Markdown', () => {
    const canonical = [
      '# One\n\n## Two\n\n###### Six',
      'Plain **bold** *italic* ~~gone~~ `code` [site](https://example.com)',
      '- a\n- b\n  - nested',
      '1. one\n2. two',
      '- [ ] open\n- [x] done',
      '> quoted\n>\n> two',
      '```ts\nconst a = 1;\n```',
      '---',
      'line one\\\nline two',
      '| A | B |\n| --- | --- |\n| 1 | 2 |',
      `@[Asha Marak](user:${ASHA}) see [[CCSO-4]] and [[note:Cold room]]`,
      `![chart](attachment:${IMG})`,
      '<details>\n<summary>More</summary>\n\nHidden text\n\n</details>',
    ];
    for (const md of canonical) {
      const { doc, problems } = markdownToDoc(md, resolve);
      expect(problems, md).toEqual([]);
      expect(docToMarkdown(doc).markdown, md).toBe(md);
    }
    // CONTROL: a non-canonical spelling comes back canonical.
    expect(docToMarkdown(markdownToDoc('* a\n* b\n\n__bold__', resolve).doc).markdown).toBe('- a\n- b\n\n**bold**');
  });

  it('26.003 document → Markdown → document is equal, minus exactly the declared lossy kinds', () => {
    const image = (wrap: string): DocNode => ({ type: 'image', attrs: { attachmentId: IMG, wrap, alt: 'chart' } });
    const doc = (content: DocNode[]) => ({ type: 'doc', attrs: { schemaVersion: 2 }, content });
    const clean = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }, image('block')]);
    expect(docToMarkdown(clean).lossy).toEqual([]); // CONTROL
    expect(markdownToDoc(docToMarkdown(clean).markdown, resolve).doc).toEqual(clean);

    const wrapped = doc([image('inline-left')]);
    const out = docToMarkdown(wrapped);
    expect(out.lossy).toEqual(['image.wrap']);
    expect(markdownToDoc(out.markdown, resolve).doc).toEqual(doc([image('block')]));

    const cell = (type: string, text: string, attrs: Record<string, unknown> = {}): DocNode => ({
      type,
      attrs: { colspan: 1, rowspan: 1, colwidth: null, ...attrs },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const table = (second: DocNode): DocNode => ({
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'A'), cell('tableHeader', 'B')] },
        { type: 'tableRow', content: [cell('tableCell', '1'), second] },
      ],
    });
    expect(docToMarkdown(doc([table(cell('tableCell', '2', { colspan: 2 }))])).lossy).toEqual(['table.span']);
    expect(docToMarkdown(doc([table(cell('tableCell', '2', { colwidth: [120] }))])).lossy).toEqual(['table.colwidth']);
  });

  it('26.004 an unresolvable mention, ticket or note is a problem naming it, and the document is empty', () => {
    const stranger = ulid('STRNGR');
    const { doc, problems } = markdownToDoc(
      `Hi @[Asha](user:${stranger}), see [[CCSO-99]] and [[note:Nowhere]] and @[Ravi](user:not-an-id)`,
      resolve,
    );
    expect(problems).toEqual([
      `unknown mention @[Asha](user:${stranger})`,
      'unknown ticket [[CCSO-99]]',
      'unknown note [[note:Nowhere]]',
      'unknown mention @[Ravi](user:not-an-id)',
    ]);
    expect(doc).toEqual({ type: 'doc', attrs: { schemaVersion: 2 }, content: [{ type: 'paragraph' }] });
    // CONTROL: the resolvable three, with RESOLVED label/key/title (not the typed ones).
    expect(inline(`@[Asha](user:${ASHA}) [[CCSO-4]] [[note:${NOTE}]]`).filter((n) => n.type !== 'text')).toEqual([
      { type: 'mention', attrs: { userId: ASHA, label: 'Asha Marak' } },
      { type: 'ticketRef', attrs: { ticketId: TICKET, projectId: PROJECT, key: 'CCSO-4', title: 'Chiller' } },
      { type: 'wikiLink', attrs: { noteId: NOTE, title: 'Cold room' } },
    ]);
  });

  it("26.005 the owner's 13:37 comment stores headings and a bullet list", () => {
    const md = "# Achri's Brief\n\n### 1. Where we are\n\n- responding to the cold-room ticket\n- waiting on the chiller part";
    const out = blocks(md);
    expect(types(out)).toEqual(['heading', 'heading', 'bulletList']);
    expect(out[0]?.attrs?.level).toBe(1);
    expect(out[1]?.attrs?.level).toBe(3);
    expect(types(out[2]?.content)).toEqual(['listItem', 'listItem']);
    // CONTROL: the defect — plainTextToDoc keeps it as ONE paragraph of raw Markdown.
    expect(types((plainTextToDoc(md) as { content: DocNode[] }).content)).toEqual(['paragraph']);
  });

  it('26.006 a literal [[ that is not a ref stays literal', () => {
    for (const md of ['[[draft]]', '[[ CCSO-4 ]]', '[[ccso-4]]']) {
      expect(inline(md), md).toEqual([{ type: 'text', text: md }]);
    }
    expect(inline('`[[CCSO-4]]`')).toEqual([{ type: 'text', text: '[[CCSO-4]]', marks: [{ type: 'code' }] }]);
    expect(types(blocks('```\n[[note:x]]\n```'))).toEqual(['codeBlock']);
    expect(inline('\\[\\[CCSO-4\\]\\]')).toEqual([{ type: 'text', text: '[[CCSO-4]]' }]);
    // A document holding the TEXT "[[CCSO-4]]" must not grow a ref on the way back.
    const literal = { type: 'doc', attrs: { schemaVersion: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '[[CCSO-4]]' }] }] };
    expect(markdownToDoc(docToMarkdown(literal).markdown, resolve).doc).toEqual(literal);
    // CONTROL: in prose it IS a ref.
    expect(inline('see [[CCSO-4]]')[1]?.type).toBe('ticketRef');
  });

  it('26.007 an image is an attachment on a line of its own', () => {
    expect(blocks(`![chart](attachment:${IMG})`)).toEqual([
      { type: 'image', attrs: { attachmentId: IMG, wrap: 'block', alt: 'chart' } },
    ]);
    expect(markdownToDoc(`see ![chart](attachment:${IMG})`, resolve).problems).toEqual([
      'an image must be on a line of its own: write ![alt](attachment:<attachmentId>) alone on its line',
    ]);
    expect(markdownToDoc('![x](https://example.com/x.png)', resolve).problems).toEqual([
      'images must be attachments of this ticket or note: upload with add_attachment, then write ![alt](attachment:<attachmentId>)',
    ]);
  });

  it('26.008 raw HTML is text; only http(s), mailto and relative links are links', () => {
    expect(inline('<script>x</script>')).toEqual([{ type: 'text', text: '<script>x</script>' }]);
    expect(inline('[a](javascript:alert(1))')).toEqual([{ type: 'text', text: '[a](javascript:alert(1))' }]);
    expect(inline(`[a](user:${ASHA})`)).toEqual([{ type: 'text', text: `[a](user:${ASHA})` }]);
    expect(inline('[a](https://x.in)')[0]?.marks?.[0]).toMatchObject({ type: 'link', attrs: { href: 'https://x.in' } });
  });

  it('26.009 scanMarkdownRefs uses the same tokenizer', () => {
    expect(scanMarkdownRefs(`@[A](user:${ASHA}) [[CCSO-4]] [[CCSO-4]] [[note:Cold room]] \`[[ZZ-9]]\``)).toEqual({
      userIds: [ASHA],
      ticketKeys: ['CCSO-4'],
      noteRefs: ['Cold room'],
    });
  });
});
