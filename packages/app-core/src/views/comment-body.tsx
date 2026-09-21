import { createElement, Fragment, type ReactNode } from 'react';

/**
 * F3 — the comment thread's body, rendered as the DOCUMENT the composer wrote
 * rather than as its plain text.
 *
 * ## The defect this closes
 *
 * The composer is the real editor: it offers **Bold, Italic, Code, Link, List,
 * Quote**, and it writes all of them into the `comment.added` body. The thread
 * then rendered that body through `docToPlainText` (`@gisik-nokma/domain`),
 * which reads a node's `type`/`text`/`attrs` and **never reads `marks`** — so
 * the emphasis, the code span and, worst, the link's destination were all
 * discarded on the way to the screen. A person who typed `[the doc](https://…)`
 * saw the label and could not recover the URL from anywhere on the surface.
 * Bulleted and numbered lists lost their markers and a blockquote lost its
 * quotation.
 *
 * ## Why a NEW projection rather than a change to `docToPlainText`
 *
 * **Because the plain-text one is a SEARCH projection and its plainness is the
 * point.** `docToPlainText` feeds `proj_search` and notifications, and
 * `packages/editor/test/doc-text-conformance.test.ts` pins exactly this:
 * *"renders a link as its text, not its href — the URL is never indexed"*. A
 * search decision became a display decision because one function served both,
 * and the fix is to stop serving both from one function — **not** to teach the
 * index about hrefs, which would have changed what search matches.
 *
 * ## What it renders, and the two things it refuses to invent
 *
 * Marks: `bold` → `<strong>`, `italic` → `<em>`, `strike` → `<s>`, `code` →
 * `<code>`, `link` → `<a href>` (sanitised — see below). Blocks: `paragraph` →
 * `<p>`, `heading` → `<p>`, `bulletList`/`orderedList`/`listItem` → the real
 * list elements, so the browser supplies the markers the plain-text renderer
 * dropped, `blockquote` → `<blockquote>`, `codeBlock` → `<pre><code>`,
 * `hardBreak` → `<br>`, `mention` → the same `@label` the plain renderer
 * produces.
 *
 * 1. **An `image` node renders as NOTHING**, which is the existing, declared
 *    decision (`test-cases/16-remaining-doors.md` — a comment's files are
 *    CHIPS, not inline images) and is unchanged here. The chip row is the only
 *    place an embedded file is reachable from this screen, and this file does
 *    not become a second one.
 * 2. **An unknown node type renders its CHILDREN**, not nothing. A node this
 *    file has not learned still shows the text inside it — strictly more than
 *    the plain renderer does, and never a blank where somebody wrote something.
 *
 * ## The href is UNTRUSTED INPUT, and that is the one place this file could
 *    hand a stranger a loaded gun
 *
 * A comment body is another person's data. React does not sanitise an `href`:
 * `<a href="javascript:…">` is a live script for anyone who clicks it, and the
 * markdown-link input rule only validates what THIS client types — the server
 * stores whatever an event carries. So `safeHref` allows exactly three things
 * and refuses everything else: an `http`/`https`/`mailto` scheme, a
 * root-relative path that is not protocol-relative (`/` but never `//`, which
 * is another origin), and a fragment. **A refused href renders the LABEL as
 * plain text** — never the label as a dead anchor, and never the raw URL as
 * text, which would put a `javascript:` string on screen as though it were a
 * destination somebody could use.
 *
 * The scheme test runs on a control-character-stripped copy, because browsers
 * ignore tabs and newlines inside a URL: `java&#9;script:…` is a working
 * payload that a naive `startsWith('javascript:')` check reads as harmless.
 *
 * ## Totality
 *
 * Like `docToPlainText`, this is a total function: unrenderable input yields
 * nothing rather than throwing, capped by the same `MAX_DEPTH` discipline and
 * for the same reason (a cyclic object graph, not a document, must not take
 * down the render). The cap is generous next to this schema's real nesting —
 * `blockquote > bulletList > listItem > paragraph` is four.
 */

const MAX_DEPTH = 200;

/**
 * `http`/`https`/`mailto`, a root-relative path, or a fragment — and nothing
 * else. See this file's docblock for why a refusal renders as text.
 */
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Browsers strip ASCII whitespace and control characters when parsing a URL,
  // so the scheme test must see the string they would. `java\tscript:` executes
  // and does not start with `javascript:`.
  const collapsed = raw.replace(/[\u0000- \u007f]/g, '');
  if (collapsed === '') return null;
  if (collapsed.startsWith('#')) return collapsed;
  // Root-relative, but NOT protocol-relative: `//evil.example` is another
  // origin wearing a path's clothes.
  if (collapsed.startsWith('/') && !collapsed.startsWith('//')) return collapsed;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(collapsed);
  if (scheme === null) return null;
  const protocol = `${scheme[1]!.toLowerCase()}:`;
  return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' ? collapsed : null;
}

/**
 * A node, read defensively. The index signature is load-bearing rather than
 * decorative: `attrs` is `unknown` (it is whatever the stored JSON holds), so
 * reading `attrs['href']` off a narrowed object needs somewhere for that lookup
 * to land. Without it the compiler is right to refuse — the access is genuinely
 * unchecked, and `unknown` is the honest type for its result.
 */
type Node = {
  type?: unknown;
  text?: unknown;
  attrs?: unknown;
  marks?: unknown;
  content?: unknown;
  [key: string]: unknown;
};

function asNode(value: unknown): Node | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Node;
}

/** The `href` a link mark carries, when it carries a usable one. */
function hrefOf(mark: { attrs?: unknown }): string | null {
  const attrs = asNode(mark.attrs);
  return safeHref(attrs === null ? undefined : attrs['href']);
}

/**
 * Wrap a text node in its marks. The nesting order is fixed rather than taken
 * from the mark array, so the same document always renders the same tree —
 * `code` innermost (a `<code>` inside `<strong>` reads as emphasised code; the
 * other way round does not), `link` outermost.
 */
function applyMarks(text: string, marks: unknown, key: string): ReactNode {
  if (!Array.isArray(marks)) return text;
  const byType = new Map<string, { attrs?: unknown }>();
  for (const raw of marks) {
    const mark = asNode(raw);
    if (mark === null || typeof mark.type !== 'string') continue;
    byType.set(mark.type, { attrs: mark.attrs });
  }
  let node: ReactNode = text;
  let n = 0;
  if (byType.has('link')) {
    const href = hrefOf(byType.get('link')!);
    // A refused href leaves the LABEL standing as text — see the docblock.
    node =
      href === null
        ? node
        : createElement(
            'a',
            { href, target: '_blank', rel: 'noopener noreferrer nofollow', key: `${key}-a${n}` },
            node,
          );
    n += 1;
  }
  if (byType.has('bold')) node = createElement('strong', { key: `${key}-b${n}` }, node);
  if (byType.has('italic')) node = createElement('em', { key: `${key}-i${n}` }, node);
  if (byType.has('strike')) node = createElement('s', { key: `${key}-s${n}` }, node);
  if (byType.has('code')) node = createElement('code', { key: `${key}-c${n}` }, node);
  return node;
}

function childrenOf(node: Node, depth: number, keyPrefix: string): ReactNode[] {
  if (!Array.isArray(node.content)) return [];
  return node.content
    .map((child, index) => renderNode(child, depth + 1, `${keyPrefix}.${index}`))
    .filter((child): child is ReactNode => child !== null);
}

function renderNode(value: unknown, depth: number, key: string): ReactNode | null {
  if (depth > MAX_DEPTH) return null;
  const node = asNode(value);
  if (node === null) return null;
  if (typeof node.type !== 'string') return null;

  if (node.type === 'text') {
    return typeof node.text === 'string' ? applyMarks(node.text, node.marks, key) : null;
  }
  if (node.type === 'mention') {
    const attrs = asNode(node.attrs);
    const label = attrs === null ? undefined : attrs['label'];
    const userId = attrs === null ? undefined : attrs['userId'];
    const shown =
      typeof label === 'string' && label.length > 0
        ? label
        : typeof userId === 'string'
          ? userId
          : 'unknown';
    // The same `@label` the plain-text projection produces — a mention is the
    // one thing that renderer already kept, and the two must not disagree.
    return createElement('span', { className: 'gn-comment__mention', key }, `@${shown}`);
  }
  if (node.type === 'hardBreak' || node.type === 'hard_break') {
    return createElement('br', { key });
  }
  // A comment's files are CHIPS, and this renderer does not become a second
  // place they are drawn — the declared decision, unchanged.
  if (node.type === 'image') return null;

  const children = childrenOf(node, depth, key);

  if (node.type === 'bulletList' || node.type === 'bullet_list') {
    return createElement('ul', { className: 'gn-comment__list', key }, children);
  }
  if (node.type === 'orderedList' || node.type === 'ordered_list') {
    return createElement('ol', { className: 'gn-comment__list', key }, children);
  }
  if (node.type === 'listItem' || node.type === 'list_item') {
    // A list item's own paragraph is unwrapped: `<li><p>…</p></li>` is legal
    // but draws an extra line box per item, which is not what a comment wants.
    const inner = children.length === 1 ? children[0] : createElement(Fragment, null, children);
    return createElement('li', { key }, inner);
  }
  if (node.type === 'blockquote') {
    return createElement('blockquote', { className: 'gn-comment__quote', key }, children);
  }
  if (node.type === 'codeBlock' || node.type === 'code_block') {
    return createElement('pre', { className: 'gn-comment__code', key }, createElement('code', null, children));
  }
  if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'doc') {
    const element = node.type === 'doc' ? Fragment : 'p';
    return createElement(element, node.type === 'doc' ? { key } : { key }, children);
  }
  // An unknown type renders its CHILDREN — see the docblock.
  return createElement(Fragment, { key }, children);
}

/**
 * The comment body, as elements. Total: unrenderable input yields `null`, and
 * a malformed node yields nothing rather than throwing, so one bad comment
 * cannot take down the thread it sits in.
 */
export function renderCommentBody(doc: unknown): ReactNode {
  return renderNode(doc, 0, 'b');
}
