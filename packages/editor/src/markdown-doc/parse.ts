import MarkdownIt from 'markdown-it';
import { MarkdownParser } from 'prosemirror-markdown';
import { emptyDoc, type DocJson } from '../doc.js';
import { INLINE_REF, TICKET_KEY_PATTERN, ULID_PATTERN, type RefResolver } from './refs.js';
import { markdownSchema } from './schema.js';

// markdown-it's own types are reached through its rulers so this file does not
// depend on which `@types/markdown-it` subpath exports them.
type CoreRule = Parameters<MarkdownIt['core']['ruler']['push']>[1];
type StateCore = Parameters<CoreRule>[0];
type Token = StateCore['tokens'][number];
type BlockRule = Parameters<MarkdownIt['block']['ruler']['before']>[2];
type StateBlock = Parameters<BlockRule>[0];

export type ParseEnv = { resolve: RefResolver; problems: string[] };

const IMAGE_ALONE = 'an image must be on a line of its own: write ![alt](attachment:<attachmentId>) alone on its line';
const IMAGE_EXTERNAL =
  'images must be attachments of this ticket or note: upload with add_attachment, then write ![alt](attachment:<attachmentId>)';

/** `[[KEY]]`, `[[note:x]]` and `@[Name](user:id)` inside ONE text token, split into text + ref tokens. */
function refTokens(state: StateCore, parent: Token): void {
  const env = state.env as ParseEnv;
  const out: Token[] = [];
  for (const child of parent.children ?? []) {
    // ONLY plain `text`: an escaped `\[` is a `text_special` token at this point (this rule runs BEFORE
    // `text_join`), and a code span is `code_inline` — so neither can ever form a ref (case 26.006).
    if (child.type !== 'text') {
      out.push(child);
      continue;
    }
    let last = 0;
    for (const m of child.content.matchAll(INLINE_REF)) {
      const ref = refToken(state, env, m);
      if (ref === null) continue; // `[[draft]]`: stays inside the surrounding text
      if (m.index > last) out.push(textToken(state, child.content.slice(last, m.index)));
      out.push(ref);
      last = m.index + m[0].length;
    }
    if (last === 0) out.push(child);
    else if (last < child.content.length) out.push(textToken(state, child.content.slice(last)));
  }
  parent.children = out;
}

function textToken(state: StateCore, content: string): Token {
  const t = new state.Token('text', '', 0);
  t.content = content;
  return t;
}

function refToken(state: StateCore, env: ParseEnv, m: RegExpMatchArray): Token | null {
  if (m[2] !== undefined) {
    const id = m[2];
    const person = ULID_PATTERN.test(id) ? env.resolve.user(id) : null;
    if (person === null) env.problems.push(`unknown mention ${m[0]}`);
    const t = new state.Token('gn_mention', '', 0);
    t.meta = { userId: person?.userId ?? id, label: person?.label ?? m[1] };
    return t;
  }
  const inner = m[3] ?? '';
  if (inner.startsWith('note:') && inner.slice(5).trim() !== '') {
    const ref = inner.slice(5).trim();
    const note = env.resolve.note(ref);
    if (note === null) env.problems.push(`unknown note [[note:${ref}]]`);
    const t = new state.Token('gn_wiki_link', '', 0);
    t.meta = { noteId: note?.noteId ?? '', title: note?.title ?? ref };
    return t;
  }
  if (TICKET_KEY_PATTERN.test(inner)) {
    const ticket = env.resolve.ticket(inner);
    if (ticket === null) env.problems.push(`unknown ticket [[${inner}]]`);
    const t = new state.Token('gn_ticket_ref', '', 0);
    t.meta = ticket ?? { ticketId: '', projectId: '', key: inner, title: '' };
    return t;
  }
  return null;
}

/** A paragraph whose only content is one `attachment:` image becomes a block `image`; any other image is a problem. */
function liftImages(state: StateCore): void {
  const env = state.env as ParseEnv;
  const out: Token[] = [];
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i]!;
    const body = tokens[i + 1];
    const close = tokens[i + 2];
    if (open.type === 'paragraph_open' && body?.type === 'inline' && close?.type === 'paragraph_close') {
      const meaningful = (body.children ?? []).filter((c) => !(c.type === 'text' && c.content.trim() === '') && c.type !== 'softbreak');
      if (meaningful.length === 1 && meaningful[0]!.type === 'image') {
        const image = meaningful[0]!;
        const src = image.attrGet('src') ?? '';
        const id = src.startsWith('attachment:') ? src.slice('attachment:'.length) : '';
        if (!ULID_PATTERN.test(id)) env.problems.push(IMAGE_EXTERNAL);
        const block = new state.Token('gn_image', 'img', 0);
        block.meta = { attachmentId: id, wrap: 'block', alt: image.content };
        out.push(block);
        i += 2;
        continue;
      }
    }
    out.push(open);
  }
  state.tokens = out;
  // Every image still INLINE (beside text, in a heading, in a cell) is a problem, and becomes its alt text
  // so the parser never meets an `image` token it has no handler for (case 26.007).
  for (const tok of out) {
    if (tok.type !== 'inline') continue;
    tok.children = (tok.children ?? []).map((c) => {
      if (c.type !== 'image') return c;
      env.problems.push((c.attrGet('src') ?? '').startsWith('attachment:') ? IMAGE_ALONE : IMAGE_EXTERNAL);
      return textToken(state, c.content);
    });
  }
}

/** `- [ ] x` / `- [x] x`: a bullet list whose EVERY item starts with a box is a task list (core runs before `inline`). */
function taskLists(state: StateCore): void {
  const t = state.tokens;
  for (let i = 0; i < t.length; i++) {
    if (t[i]!.type !== 'bullet_list_open') continue;
    const level = t[i]!.level;
    let close = i + 1;
    while (close < t.length && !(t[close]!.type === 'bullet_list_close' && t[close]!.level === level)) close++;
    const items: number[] = [];
    for (let j = i + 1; j < close; j++) if (t[j]!.type === 'list_item_open' && t[j]!.level === level + 1) items.push(j);
    const boxes = items.map((j) => /^\[([ xX])\] /.exec(t[j + 2]?.type === 'inline' ? t[j + 2]!.content : ''));
    if (items.length === 0 || boxes.some((b) => b === null)) continue;
    t[i]!.type = 'task_list_open';
    t[close]!.type = 'task_list_close';
    items.forEach((j, k) => {
      t[j]!.type = 'task_item_open';
      t[j]!.meta = { checked: boxes[k]![1] !== ' ' };
      t[j + 2]!.content = t[j + 2]!.content.slice(4);
      let end = j + 1;
      while (!(t[end]!.type === 'list_item_close' && t[end]!.level === level + 1)) end++;
      t[end]!.type = 'task_item_close';
    });
  }
}

/** A table cell holds blocks in schema v2; markdown-it puts its inline straight inside `th`/`td`. */
function cellParagraphs(state: StateCore): void {
  const out: Token[] = [];
  for (const tok of state.tokens) {
    if (tok.type === 'th_close' || tok.type === 'td_close') out.push(new state.Token('paragraph_close', 'p', -1));
    out.push(tok);
    if (tok.type === 'th_open' || tok.type === 'td_open') {
      tok.attrs = null; // alignment is not part of schema v2
      out.push(new state.Token('paragraph_open', 'p', 1));
    }
  }
  state.tokens = out;
}

/** `<details>` / `<summary>…</summary>` / … / `</details>`, each tag on its own line (html stays OFF). */
function detailsBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const lineText = (n: number): string => state.src.slice(state.bMarks[n]! + state.tShift[n]!, state.eMarks[n]!).trim();
  const open = /^<details( open)?>$/.exec(lineText(startLine));
  if (open === null || startLine + 1 >= endLine) return false;
  const summary = /^<summary>(.*)<\/summary>$/.exec(lineText(startLine + 1));
  if (summary === null) return false;
  let depth = 1;
  let close = startLine + 2;
  for (; close < endLine; close++) {
    const text = lineText(close);
    if (/^<details( open)?>$/.test(text)) depth++;
    else if (text === '</details>' && --depth === 0) break;
  }
  if (depth !== 0) return false;
  if (silent) return true;
  const opened = state.push('details_open', 'details', 1);
  opened.meta = { open: open[1] !== undefined };
  state.push('details_summary_open', 'summary', 1);
  const inline = state.push('inline', '', 0);
  inline.content = summary[1] ?? '';
  inline.map = [startLine + 1, startLine + 2];
  inline.children = [];
  state.push('details_summary_close', 'summary', -1);
  state.push('details_content_open', 'div', 1);
  const oldMax = state.lineMax;
  state.lineMax = close;
  state.md.block.tokenize(state, startLine + 2, close);
  state.lineMax = oldMax;
  state.push('details_content_close', 'div', -1);
  state.push('details_close', 'details', -1);
  state.line = close + 1;
  return true;
}

function markdownIt(): MarkdownIt {
  // `html: false`: Claude must not be able to store raw HTML (case 26.008). `linkify: false`: a bare
  // URL is text, as the editor's own `autolink: false` keeps it (`schema/extensions.ts`).
  const md = new MarkdownIt('default', { html: false, linkify: false, typographer: false });
  md.validateLink = (url: string): boolean => /^(https?:|mailto:)/i.test(url) || /^[/#]/.test(url) || url.startsWith('attachment:');
  md.block.ruler.before('table', 'gn_details', detailsBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.core.ruler.before('inline', 'gn_task_lists', taskLists);
  md.core.ruler.before('inline', 'gn_cell_paragraphs', cellParagraphs);
  md.core.ruler.after('inline', 'gn_images', liftImages);
  md.core.ruler.before('text_join', 'gn_refs', (state) => {
    for (const tok of state.tokens) if (tok.type === 'inline') refTokens(state, tok);
  });
  return md;
}

let parser: MarkdownParser | null = null;

function markdownParser(): MarkdownParser {
  parser ??= new MarkdownParser(markdownSchema(), markdownIt(), {
    blockquote: { block: 'blockquote' },
    paragraph: { block: 'paragraph' },
    list_item: { block: 'listItem' },
    bullet_list: { block: 'bulletList' },
    ordered_list: { block: 'orderedList', getAttrs: (tok) => ({ start: Number(tok.attrGet('start') ?? 1) }) },
    task_list: { block: 'taskList' },
    task_item: { block: 'taskItem', getAttrs: (tok) => ({ checked: (tok.meta as { checked: boolean }).checked }) },
    heading: { block: 'heading', getAttrs: (tok) => ({ level: Number(tok.tag.slice(1)) }) },
    code_block: { block: 'codeBlock', noCloseToken: true },
    fence: { block: 'codeBlock', getAttrs: (tok) => ({ language: tok.info.trim() || null }), noCloseToken: true },
    hr: { node: 'horizontalRule' },
    hardbreak: { node: 'hardBreak' },
    table: { block: 'table' },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: 'tableRow' },
    th: { block: 'tableHeader' },
    td: { block: 'tableCell' },
    details: { block: 'details', getAttrs: (tok) => ({ open: (tok.meta as { open: boolean }).open }) },
    details_summary: { block: 'detailsSummary' },
    details_content: { block: 'detailsContent' },
    gn_image: { node: 'image', getAttrs: (tok) => tok.meta as Record<string, unknown> },
    gn_mention: { node: 'mention', getAttrs: (tok) => tok.meta as Record<string, unknown> },
    gn_ticket_ref: { node: 'ticketRef', getAttrs: (tok) => tok.meta as Record<string, unknown> },
    gn_wiki_link: { node: 'wikiLink', getAttrs: (tok) => tok.meta as Record<string, unknown> },
    em: { mark: 'italic' },
    strong: { mark: 'bold' },
    s: { mark: 'strike' },
    link: { mark: 'link', getAttrs: (tok) => ({ href: tok.attrGet('href') }) },
    code_inline: { mark: 'code', noCloseToken: true },
  });
  return parser;
}

/** Markdown → schema-v2 JSON. Any problem ⇒ `emptyDoc()` and the problems, so a caller can only refuse. */
export function markdownToDoc(markdown: string, resolve: RefResolver): { doc: DocJson; problems: string[] } {
  const env: ParseEnv = { resolve, problems: [] };
  const node = markdownParser().parse(markdown, env);
  if (env.problems.length > 0) return { doc: emptyDoc(), problems: env.problems };
  return { doc: node.toJSON() as DocJson, problems: [] };
}

/** The refs a body names, by the SAME tokenizer (so a key in a code span is not one). */
export function scanRefs(markdown: string): { userIds: string[]; ticketKeys: string[]; noteRefs: string[] } {
  const userIds = new Set<string>();
  const ticketKeys = new Set<string>();
  const noteRefs = new Set<string>();
  const recording: RefResolver = {
    user: (id) => (userIds.add(id), { userId: id, label: id }),
    ticket: (key) => (ticketKeys.add(key), { ticketId: '', projectId: '', key, title: '' }),
    note: (ref) => (noteRefs.add(ref), { noteId: '', title: ref }),
  };
  markdownIt().parse(markdown, { resolve: recording, problems: [] } satisfies ParseEnv);
  return { userIds: [...userIds], ticketKeys: [...ticketKeys], noteRefs: [...noteRefs] };
}
