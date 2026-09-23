import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, markdownToHtml } from '../src/markdown/serializer.js';

/**
 * 9.283 — the ported serializer suite (spec §8.6).
 *
 * Ported case by case from the knowledge-base app's
 * `markdownSerializer.test.ts`, keeping its `DOC-4.4-NN` numbering in the `it`
 * names AFTER the `9.283` prefix so a reader can find the original. Three
 * changes, each deliberate and each named rather than silent:
 *
 *   - **`DOC-4.4-15` and `-15b` are NOT ported.** They cover `data-raw-block`,
 *     the revealed-markdown mode that spec §8.7 leaves behind; the branches
 *     they test are gone with the feature.
 *   - **The wiki-link cases are RE-KEYED.** The source addresses a vault file
 *     (`[[path#section|display]]`); a note is addressed by an id markdown
 *     cannot spell, so the port carries the TITLE in both directions and the
 *     import side deliberately yields plain text.
 *   - **`details`/`summary` is ADDED**, in both directions, because the source
 *     editor had no collapsibles.
 */
describe('9.283 htmlToMarkdown — block elements', () => {
  it('9.283 DOC-4.4-01: H1–H6 render as #-prefixed markdown', () => {
    expect(htmlToMarkdown('<h1>A</h1>')).toBe('# A');
    expect(htmlToMarkdown('<h2>A</h2>')).toBe('## A');
    expect(htmlToMarkdown('<h3>A</h3>')).toBe('### A');
    expect(htmlToMarkdown('<h4>A</h4>')).toBe('#### A');
    expect(htmlToMarkdown('<h5>A</h5>')).toBe('##### A');
    expect(htmlToMarkdown('<h6>A</h6>')).toBe('###### A');
  });

  it('9.283 DOC-4.4-02: bold / italic / strike / inline-code marks', () => {
    expect(htmlToMarkdown('<p><strong>bold</strong></p>')).toBe('**bold**');
    expect(htmlToMarkdown('<p><b>bold</b></p>')).toBe('**bold**');
    expect(htmlToMarkdown('<p><em>italic</em></p>')).toBe('*italic*');
    expect(htmlToMarkdown('<p><i>italic</i></p>')).toBe('*italic*');
    expect(htmlToMarkdown('<p><s>strike</s></p>')).toBe('~~strike~~');
    expect(htmlToMarkdown('<p><del>strike</del></p>')).toBe('~~strike~~');
    expect(htmlToMarkdown('<p><code>inline</code></p>')).toBe('`inline`');
  });

  it('9.283 DOC-4.4-03: bullet list (<ul><li>) → "- "', () => {
    expect(htmlToMarkdown('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b');
  });

  it('9.283 DOC-4.4-04: ordered list (<ol><li>) preserves 1. 2. …', () => {
    expect(htmlToMarkdown('<ol><li>a</li><li>b</li><li>c</li></ol>')).toBe('1. a\n2. b\n3. c');
  });

  it('9.283 DOC-4.4-05: task list items', () => {
    expect(htmlToMarkdown('<ul><li><input type="checkbox">a</li></ul>')).toBe('- [ ] a');
    expect(htmlToMarkdown('<ul><li><input type="checkbox" checked>a</li></ul>')).toBe('- [x] a');
  });

  it('9.283 DOC-4.4-06: blockquote prefixes each line with "> "', () => {
    expect(htmlToMarkdown('<blockquote>a<br>b</blockquote>')).toBe('> a\n> b');
  });

  it('9.283 DOC-4.4-07: code block with language hint, and without one', () => {
    expect(htmlToMarkdown('<pre><code class="language-ts">const x = 1;</code></pre>')).toBe(
      '```ts\nconst x = 1;\n```',
    );
    expect(htmlToMarkdown('<pre><code>plain</code></pre>')).toBe('```\nplain\n```');
  });

  it('9.283 DOC-4.4-16: horizontal rule', () => {
    expect(htmlToMarkdown('<hr>')).toBe('---');
  });

  /**
   * THE ADDED CASE, both directions. Spec §8.4 names the exported form
   * exactly, and the import half rides on markdown-it's `html: true` — which
   * is what makes a collapsible survive a copy and a paste at all.
   */
  it('9.283 details/summary export and re-import in the form §8.4 names', () => {
    expect(htmlToMarkdown('<details open><summary>T</summary><p>b</p></details>')).toBe(
      '<details open>\n<summary>T</summary>\n\nb\n\n</details>',
    );
    // Closed: the `open` attribute is simply absent, which is the same
    // distinction the document makes (`details.open`).
    expect(htmlToMarkdown('<details><summary>T</summary><p>b</p></details>')).toBe(
      '<details>\n<summary>T</summary>\n\nb\n\n</details>',
    );
    // …and the import side passes the raw HTML through untouched.
    const back = markdownToHtml('<details open>\n<summary>T</summary>\n\nb\n\n</details>');
    expect(back).toContain('<details open>');
    expect(back).toContain('<summary>T</summary>');
    expect(back).toContain('b');
  });
});

describe('9.283 htmlToMarkdown — tables', () => {
  it('9.283 DOC-4.4-08: GFM pipe table with header separator', () => {
    const html = '<table><tr><th>h1</th><th>h2</th></tr><tr><td>a</td><td>b</td></tr></table>';
    expect(htmlToMarkdown(html)).toBe('| h1 | h2 |\n| --- | --- |\n| a | b |');
  });

  it('9.283 DOC-4.4-09: literal "|" in a cell is backslash-escaped', () => {
    const html = '<table><tr><th>h</th></tr><tr><td>a|b</td></tr></table>';
    expect(htmlToMarkdown(html)).toBe('| h |\n| --- |\n| a\\|b |');
  });

  it('9.283 a cell with multiple block children joins with <br>, and marks survive', () => {
    expect(
      htmlToMarkdown('<table><tr><th>h</th></tr><tr><td><p>a</p><p>b</p></td></tr></table>'),
    ).toBe('| h |\n| --- |\n| a<br>b |');
    expect(
      htmlToMarkdown(
        '<table><tr><th>h</th></tr><tr><td><p><strong>bold</strong></p></td></tr></table>',
      ),
    ).toBe('| h |\n| --- |\n| **bold** |');
  });
});

describe('9.283 htmlToMarkdown — links, note links and images', () => {
  it('9.283 DOC-4.4-10: link mark', () => {
    expect(htmlToMarkdown('<p><a href="https://example.com">text</a></p>')).toBe(
      '[text](https://example.com)',
    );
  });

  /**
   * THE RE-KEYED CASES. Four source cases become two: a note link carries a
   * title and an id, and the id is NOT in the markdown — so there is no
   * `|display` alias form to test, because there is no separate address to
   * alias.
   */
  it('9.283 DOC-4.4-11/12/13/14: a note link exports as [[title]], in both renderings', () => {
    expect(
      htmlToMarkdown('<p><a data-note-id="n1" data-note-title="Cold room" href="/notes/n1">Cold room</a></p>'),
    ).toBe('[[Cold room]]');
    // The MISSING pill is the same node rendered as a span; it exports the same.
    expect(
      htmlToMarkdown(
        '<p><span data-note-id="n1" data-note-title="Old title" class="editor-wikilink--missing">Old title</span></p>',
      ),
    ).toBe('[[Old title]]');
    // …and a note link is NOT read as a generic anchor, which is the failure a
    // first-cut `a` branch would produce: `[Cold room](/notes/n1)`.
    expect(htmlToMarkdown('<p><a data-note-id="n1" data-note-title="Cold room">Cold room</a></p>')).not.toContain(
      '](/notes/',
    );
  });

  it('9.283 image mark round-trips alt text and src', () => {
    expect(htmlToMarkdown('<p><img src="/a.png" alt="caption"></p>')).toBe('![caption](/a.png)');
  });
});

describe('9.283 markdownToHtml — parse', () => {
  it('9.283 DOC-4.4-17: a note link becomes the literal text a person typed', () => {
    const html = markdownToHtml('[[Cold room]]');
    // The brackets survive so a copy → paste round trip is lossless at the
    // TEXT level, and the span is INERT — no `data-note-id`, so the editor
    // parses it as text rather than inventing a link to `/notes/`.
    expect(html).toContain('[[Cold room]]');
    expect(html).not.toContain('data-note-id');
    expect(htmlToMarkdown(html)).toBe('[[Cold room]]');
    // A DOUBLE QUOTE IN THE TITLE is escaped too, and the first cut did not:
    // the unescaped `"` closed the attribute early, so the span was written
    // out as literal TEXT and the document read
    // `see <span data-note-title-text="He said "hi" now">[[He said "hi" now]]`.
    // The words survived; the text was dirtied.
    const quoted = markdownToHtml('see [[He said "hi" now]]');
    // The span is written out as MARKUP, not escaped into text — the failure
    // an unescaped quote produces is `&lt;span data-note-title-text=&quot;…`.
    expect(quoted).not.toContain('&lt;span');
    expect(quoted).toContain('data-note-title-text');
    const quotedBack = htmlToMarkdown(quoted);
    expect(quotedBack).toBe('see [[He said "hi" now]]');
  });

  it('9.283 DOC-4.4-18: blank lines between table rows are collapsed', () => {
    const html = markdownToHtml('| h |\n| --- |\n\n| a |\n\n| b |');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>a</td>');
    expect(html).toContain('<td>b</td>');
  });

  it('9.283 DOC-4.4-19: task list markers become disabled checkbox inputs', () => {
    const html = markdownToHtml('- [ ] unchecked\n- [x] checked');
    expect(html).toMatch(/<input type="checkbox" disabled>\s*unchecked/);
    expect(html).toMatch(/<input type="checkbox" checked disabled>\s*checked/);
  });

  it('9.283 DOC-4.4-20/21: linkify autolinks bare URLs, and HTML passes through', () => {
    expect(markdownToHtml('visit https://example.com today')).toMatch(
      /<a href="https:\/\/example\.com"/,
    );
    expect(markdownToHtml('before <em>middle</em> after')).toContain('<em>middle</em>');
  });

  it('9.283 renders standard markdown blocks', () => {
    const html = markdownToHtml('# Title\n\nA **bold** word.');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
  });
});

describe('9.283 round-trip', () => {
  it('9.283 DOC-4.4-22: bold mark survives HTML → markdown → HTML', () => {
    const md = htmlToMarkdown('<p><strong>hello</strong> world</p>');
    const rt = markdownToHtml(md);
    expect(rt).toContain('<strong>hello</strong>');
    expect(rt).toContain('world');
  });

  it('9.283 heading + paragraph + list structural round-trip', () => {
    const md = htmlToMarkdown('<h1>Title</h1><p>intro</p><ul><li>a</li><li>b</li></ul>');
    const rt = markdownToHtml(md);
    expect(rt).toContain('<h1>Title</h1>');
    expect(rt).toMatch(/<p>intro<\/p>/);
    expect(rt).toContain('<li>a</li>');
    expect(rt).toContain('<li>b</li>');
  });

  it('9.283 table structural round-trip, and a pipe survives it', () => {
    const orig = '<table><tr><th>h1</th><th>h2</th></tr><tr><td>a</td><td>b</td></tr></table>';
    const rt = markdownToHtml(htmlToMarkdown(orig));
    expect(rt).toContain('<table>');
    expect(rt).toContain('<th>h1</th>');
    expect(rt).toContain('<td>a</td>');
    expect(rt).toContain('<td>b</td>');

    const piped = htmlToMarkdown('<table><tr><th>h</th></tr><tr><td>a|b</td></tr></table>');
    expect(piped).toContain('a\\|b');
    expect(markdownToHtml(piped)).toContain('<td>a|b</td>');
  });

  /**
   * 9.298 — THE TWO STRUCTURES THE FIRST PORT GOT WRONG, both found by the
   * Task 9 review by measuring rather than reading.
   *
   * A NESTED LIST was GLUED into its parent: `li(p("a"), ul(li(p("b"))))`
   * exported as `"- a- b\n"`, so the child's text joined the parent's and its
   * marker became text. It is reachable from the UI — StarterKit ships
   * ListKeymap and its Tab runs `sinkListItem` — so the comment that called it
   * unreachable was true of the plan and false of the product.
   *
   * A TWO-PARAGRAPH BLOCKQUOTE was MERGED into one, because the old branch
   * dropped every blank line (`split('\n').filter(Boolean)`), and a blank line
   * is exactly what separates two paragraphs inside a quote.
   */
  it('9.298 a nested list keeps its nesting and a two-paragraph quote keeps both paragraphs', () => {
    const nested = htmlToMarkdown(
      '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li><li><p>c</p></li></ul>',
    );
    expect(nested).toBe('- a\n  - b\n- c');
    // …and it re-imports as a list inside a list item, not as text.
    const back = markdownToHtml(nested);
    expect(back).toMatch(/<ul>[\s\S]*<ul>[\s\S]*<li>b<\/li>/);

    // A PARAGRAPH AFTER THE NESTED LIST, which is two keystrokes away: Enter
    // at the end of a nested item makes a paragraph inside it, and Enter again
    // on that empty paragraph lifts it to the PARENT item. The first cut of
    // the indent fix glued its text onto the nested item's line (`- a\n  - bc`).
    const after = htmlToMarkdown(
      '<ul><li><p>a</p><ul><li><p>b</p></li></ul><p>c</p></li></ul>',
    );
    expect(after).toBe('- a\n  - b\n\n  c');
    // …and 'c' is a paragraph of the OUTER item, not a second word in 'b'.
    const afterBack = markdownToHtml(after);
    expect(afterBack).not.toContain('bc');
    expect(afterBack.match(/<li>/g)?.length).toBe(2);

    const quote = htmlToMarkdown('<blockquote><p>first</p><p>second</p></blockquote>');
    expect(quote).toBe('> first\n>\n> second');
    // Two paragraphs out, two paragraphs back — the blank line is the
    // separator and dropping it is what merged them.
    const quoteBack = markdownToHtml(quote);
    expect(quoteBack.match(/<p>/g)?.length).toBe(2);
  });

  it('9.283 task-list checkbox markdown round-trips bit-for-bit', () => {
    for (const md of ['- [ ] todo', '- [x] done']) {
      const html = markdownToHtml(md);
      expect(html).toMatch(/<input type="checkbox"(?:\s+checked)?\s+disabled>/);
      expect(htmlToMarkdown(html).replace(/\s+$/, '')).toBe(md);
    }
  });
});
