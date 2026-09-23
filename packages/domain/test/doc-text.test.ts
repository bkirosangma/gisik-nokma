import { describe, expect, it } from 'vitest';
import { docToPlainText } from '../src/doc-text.js';

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: string) => ({ type: 'text', text: t });

describe('docToPlainText', () => {
  /**
   * 7.1 — the row’s first clause: paragraphs render with a newline BETWEEN blocks rather than after each. Its other clauses — hard breaks as newlines, and a mention as `@label` falling back to `@userId` — are the neighbouring tests in this block.
   */
  it('renders paragraphs with a newline between blocks', () => {
    expect(docToPlainText(doc(p(text('File the GST return')), p(text('before Friday'))))).toBe(
      'File the GST return\nbefore Friday',
    );
  });

  it('renders a mention as @label, falling back to @userId', () => {
    expect(
      docToPlainText(
        doc(
          p(
            text('Ask '),
            { type: 'mention', attrs: { userId: 'usr_01', label: 'Kiro' } },
            text(' about the OTP'),
          ),
        ),
      ),
    ).toBe('Ask @Kiro about the OTP');
    expect(docToPlainText(doc(p({ type: 'mention', attrs: { userId: 'usr_01' } })))).toBe('@usr_01');
  });

  it('renders hard breaks as newlines', () => {
    expect(docToPlainText(doc(p(text('line one'), { type: 'hardBreak' }, text('line two'))))).toBe(
      'line one\nline two',
    );
  });

  it('descends into unknown node types rather than dropping their text', () => {
    const exotic = doc({ type: 'calloutOfTheFuture', content: [p(text('still reachable'))] });
    expect(docToPlainText(exotic)).toBe('still reachable');
  });

  it('renders image nodes as nothing — attachments are not text', () => {
    expect(docToPlainText(doc(p(text('before ')), { type: 'image', attrs: { src: 'x' } }, p(text('after'))))).toBe(
      'before\nafter',
    );
  });

  /**
   * 7.2 — `docToPlainText` is TOTAL: `null`, `undefined`, a number, a bare string, an array of paragraphs, a doc with no `content` and a text node with no `text` all render `''` rather than throwing.
   */
  it('is total: junk input renders as the empty string, never throws', () => {
    expect(docToPlainText(null)).toBe('');
    expect(docToPlainText(undefined)).toBe('');
    expect(docToPlainText(42)).toBe('');
    expect(docToPlainText('a bare string')).toBe('');
    expect(docToPlainText({ type: 'doc' })).toBe('');
    expect(docToPlainText({ type: 'doc', content: [{ type: 'text' }] })).toBe('');
    expect(docToPlainText([p(text('an array is not a doc'))])).toBe('');
  });

  /**
   * 7.159 — the first of three termination cases the row states: a root that is its own descendant. The cycle-one-level-down case (so the guard is not a root special-case) and the no-cycle deep chain are the two tests below.
   */
  it('terminates on a root node that is its own descendant, no editor can produce this', () => {
    const cyclic: Record<string, unknown> = { type: 'doc' };
    cyclic.content = [cyclic];
    let result = '';
    expect(() => {
      result = docToPlainText(cyclic);
    }).not.toThrow();
    expect(typeof result).toBe('string');
  });

  it('terminates on a cycle one level down, not just a root special-case', () => {
    const cyclicParagraph: Record<string, unknown> = { type: 'paragraph' };
    cyclicParagraph.content = [text('x'), cyclicParagraph];
    const wrapper = doc(cyclicParagraph);
    let result = '';
    expect(() => {
      result = docToPlainText(wrapper);
    }).not.toThrow();
    expect(typeof result).toBe('string');
  });

  it('terminates on a chain deeper than any stack, with no cycle at all', () => {
    let node: Record<string, unknown> = p(text('bottom'));
    for (let i = 0; i < 100_000; i++) {
      node = { type: 'paragraph', content: [node] };
    }
    let result = '';
    expect(() => {
      result = docToPlainText(doc(node));
    }).not.toThrow();
    expect(typeof result).toBe('string');
  });

  it('still renders ordinary, non-adversarial nesting fully — the cap does not truncate real documents', () => {
    // Real ProseMirror nesting from this product's own schema (see
    // packages/editor's document schema v1) never approaches the cap: a
    // blockquote containing a bulletList containing a listItem containing a
    // paragraph is 4 levels. This checks the cap is far above that, not at it.
    let nested = p(text('deep but real'));
    for (let i = 0; i < 20; i++) {
      nested = { type: 'blockquote', content: [nested] } as unknown as ReturnType<typeof p>;
    }
    expect(docToPlainText(doc(nested))).toBe('deep but real');
  });

  it('renders two blocks that legitimately share one text node object, not just visually identical ones', () => {
    // A depth cap must not be a "seen node" set: valid ProseMirror trees can
    // reuse one JS object reference across two positions in the tree (e.g. a
    // shared template fragment), and that is not a cycle.
    const shared = text('reused');
    expect(docToPlainText(doc(p(shared), p(shared)))).toBe('reused\nreused');
  });

  /**
   * 9.265 — spec §3.5 names four v2 shapes that must reach the search index and
   * every notification. Each contributes its TEXT and nothing else: the task
   * item's paragraph, the collapsible's summary then its content, the code
   * block's text; a wiki-link contributes its stored `title`, never its
   * `noteId`. The control (the trailing paragraph and the `see ` text before
   * the link) is in the same document as the new shapes, so a walker that
   * started emitting separators or dropping prose would fail here too.
   */
  it('9.265 v2 blocks get their own lines; wiki-link contributes its title', () => {
    const v2doc = { type: 'doc', content: [
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'buy milk' }] }] },
        { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'call CA' }] }] },
      ] },
      { type: 'details', attrs: { open: false }, content: [
        { type: 'detailsSummary', content: [{ type: 'text', text: 'Why' }] },
        { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'because' }] }] },
      ] },
      { type: 'paragraph', content: [{ type: 'text', text: 'see ' }, { type: 'wikiLink', attrs: { noteId: 'n1', title: 'Cold room' } }] },
    ] };
    expect(docToPlainText(v2doc)).toBe('buy milk\ncall CA\nWhy\nbecause\nsee Cold room');
  });

  /**
   * 9.311 — spec §14.2, Plan 7 Task 1's `ticketRef` node: contributes `KEY
   * title`, never `ticketId` — the id is what the editor navigates by, the
   * key and title are what a person read, the same rule the wiki-link node
   * follows for its own id. Control in the same `it`: a node with no `key`
   * (a malformed document — every real insertion supplies one) falls back to
   * the stored title alone, so a missing key never glues an empty string to
   * the front.
   */
  it('9.311 ticketRef contributes "KEY title"; a missing key falls back to the title', () => {
    expect(
      docToPlainText(
        doc(
          p(
            text('see '),
            { type: 'ticketRef', attrs: { ticketId: 't2', projectId: 'p1', key: 'SHOP-8', title: 'Compressor log' } },
          ),
        ),
      ),
    ).toBe('see SHOP-8 Compressor log');
    expect(
      docToPlainText(
        doc(p({ type: 'ticketRef', attrs: { ticketId: 't2', projectId: 'p1', title: 'Compressor log' } })),
      ),
    ).toBe('Compressor log');
  });
});
