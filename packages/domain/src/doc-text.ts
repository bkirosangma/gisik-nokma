/**
 * Dependency-free plain-text rendering of a ProseMirror JSON document
 * (coordination amendment 12). Used by the proj_search projection and by
 * notifications; Plan 7's editor conforms to the shapes read here — in
 * particular the mention node {type: 'mention', attrs: {userId, label?}}.
 *
 * Total function: any unrenderable input yields '' — a search projection
 * must never crash the ingest transaction over a malformed document. That
 * includes shapes no editor produces: a node that is its own descendant
 * (recursion into a JS object graph, not JSON — JSON.parse cannot construct
 * a cycle, but this function takes `unknown`, not a JSON string) and a
 * nesting depth deep enough to exceed the call stack. Both are guarded by
 * one finite recursion-depth cap (MAX_DEPTH below) rather than a "seen node"
 * set: two DIFFERENT positions in a valid document can legitimately share
 * one JS object reference (e.g. a template fragment reused in two places),
 * and a seen-set would render the second occurrence as empty — silently
 * dropping real text. A depth cap cannot tell a genuine 300-level document
 * from a cycle; nothing can. At the cap this renders the subtree as ''
 * (partial text, never a throw) — the safe branch, per this series' rule
 * that an inability to distinguish two cases is a reason to take the safe
 * branch, not the unsafe one. MAX_DEPTH is 200: this product's own schema
 * (packages/editor's document schema v1) never nests past single digits —
 * blockquote > bulletList > listItem > paragraph is 4 — so 200 is generous
 * headroom for any real document and still small next to Node's default
 * stack (tens of thousands of frames), so a cyclic or deep-chain input
 * returns long before the stack itself is at risk.
 */

import { PURGED_ITEM_LABEL } from './purge.js';
export type MentionNodeAttrs = { userId: string; label?: string };

const MAX_DEPTH = 200;

const BLOCK_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'code_block',
  'bulletList',
  'bullet_list',
  'orderedList',
  'ordered_list',
  'listItem',
  'list_item',
  // Schema v2's blocks (spec §8.3, added by the notes editor port). One is
  // load-bearing and the rest are not, and the difference is worth naming
  // because the list reads as uniform: `detailsSummary` holds TEXT directly,
  // so without its entry the summary fuses onto the first line of the content
  // ('Whybecause'). The other four are inert for this schema — a task item,
  // a details content and a details each contain only other blocks, and a
  // task list contains only task items — so their newlines come from the
  // child regardless. They are listed anyway for the same reason
  // `bullet_list` is: the walker carries spellings for documents from other
  // producers, and a node that later gains direct text must not silently
  // fuse. `packages/editor/test/doc-text-conformance.test.ts` measures the
  // load-bearing one by deleting it.
  'taskList',
  'taskItem',
  'details',
  'detailsSummary',
  'detailsContent',
]);

/**
 * Trash series Plan 2 (spec §5.6; owner ruling 2026-09-28 A). A chip to an
 * ERASED item keeps its baked KEY and title in the stored document — a purge
 * does not rewrite other documents — but a caller that knows which ids are
 * erased passes `isPurged`, and the chip then renders as `PURGED_ITEM_LABEL`.
 * Synchronous on purpose: this function runs inside projections and the embed
 * worker, which look the ids up first (`collectDocReferences` below) and pass a
 * predicate over the answer.
 */
export type DocTextOptions = {
  isPurged?: (kind: 'ticket' | 'note', id: string) => boolean;
};

export function docToPlainText(doc: unknown, options: DocTextOptions = {}): string {
  return render(doc, 0, options).replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

function render(node: unknown, depth: number, options: DocTextOptions): string {
  if (depth > MAX_DEPTH) return '';
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return '';
  const candidate = node as { type?: unknown; text?: unknown; attrs?: unknown; content?: unknown };
  if (candidate.type === 'text') {
    return typeof candidate.text === 'string' ? candidate.text : '';
  }
  if (candidate.type === 'mention') {
    const attrs = (
      typeof candidate.attrs === 'object' && candidate.attrs !== null ? candidate.attrs : {}
    ) as { userId?: unknown; label?: unknown };
    const label =
      typeof attrs.label === 'string' && attrs.label.length > 0
        ? attrs.label
        : typeof attrs.userId === 'string'
          ? attrs.userId
          : 'unknown';
    return `@${label}`;
  }
  if (candidate.type === 'hardBreak' || candidate.type === 'hard_break') return '\n';
  // A wiki-link (spec §3.5) contributes its stored TITLE, never its noteId.
  // The id is what the editor navigates by; the title is what a person read,
  // and a search index that carried `01J9GNOTE…` would match nothing anyone
  // typed. An absent or non-string title renders '', the same safe branch the
  // mention node takes for a missing label. A link to an ERASED note renders
  // `PURGED_ITEM_LABEL` (trash Plan 2).
  if (candidate.type === 'wikiLink') {
    const attrs = (
      typeof candidate.attrs === 'object' && candidate.attrs !== null ? candidate.attrs : {}
    ) as { title?: unknown; noteId?: unknown };
    if (typeof attrs.noteId === 'string' && options.isPurged?.('note', attrs.noteId) === true) {
      return PURGED_ITEM_LABEL;
    }
    return typeof attrs.title === 'string' ? attrs.title : '';
  }
  // A ticket reference (spec §14.2, Plan 7 Task 1) contributes `KEY title`,
  // never its ticketId — the same rule the wiki-link branch above follows for
  // its own id. A missing key falls back to the title alone rather than
  // gluing an empty string onto the front of it. A reference to an ERASED
  // ticket renders `PURGED_ITEM_LABEL` (trash Plan 2).
  if (candidate.type === 'ticketRef') {
    const attrs = (
      typeof candidate.attrs === 'object' && candidate.attrs !== null ? candidate.attrs : {}
    ) as { key?: unknown; title?: unknown; ticketId?: unknown };
    if (typeof attrs.ticketId === 'string' && options.isPurged?.('ticket', attrs.ticketId) === true) {
      return PURGED_ITEM_LABEL;
    }
    const key = typeof attrs.key === 'string' ? attrs.key : '';
    const title = typeof attrs.title === 'string' ? attrs.title : '';
    return key.length > 0 ? `${key} ${title}` : title;
  }
  const children = Array.isArray(candidate.content)
    ? candidate.content.map((child) => render(child, depth + 1, options)).join('')
    : '';
  const isBlock = typeof candidate.type === 'string' && BLOCK_NODE_TYPES.has(candidate.type);
  return isBlock && children.length > 0 ? `${children}\n` : children;
}

export type DocReferences = { ticketIds: string[]; noteIds: string[] };

/**
 * Every ticket a `ticketRef` chips and every note a `wikiLink` links, once each,
 * in document order — what a caller must look up before it can build an
 * `isPurged` predicate. Total, and depth-capped by the same `MAX_DEPTH` as
 * `render`, for the same reasons.
 */
export function collectDocReferences(doc: unknown): DocReferences {
  const ticketIds: string[] = [];
  const noteIds: string[] = [];
  const walk = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const candidate = node as { type?: unknown; attrs?: unknown; content?: unknown };
    const attrs = (
      typeof candidate.attrs === 'object' && candidate.attrs !== null ? candidate.attrs : {}
    ) as { ticketId?: unknown; noteId?: unknown };
    if (candidate.type === 'ticketRef' && typeof attrs.ticketId === 'string' && attrs.ticketId !== '') {
      if (!ticketIds.includes(attrs.ticketId)) ticketIds.push(attrs.ticketId);
    }
    if (candidate.type === 'wikiLink' && typeof attrs.noteId === 'string' && attrs.noteId !== '') {
      if (!noteIds.includes(attrs.noteId)) noteIds.push(attrs.noteId);
    }
    if (candidate.content !== undefined) walk(candidate.content, depth + 1);
  };
  walk(doc, 0);
  return { ticketIds, noteIds };
}

/**
 * One structured reference in a document (Knowledge Graph spec B §2.1): a
 * `ticketRef`, a `wikiLink` or a `mention`, in document order. Bare text such
 * as `GN-142` is NOT a reference. `ordinal` counts every reference, repeats
 * included, so it is stable for a body however its targets later fare.
 */
export type DocReferenceKind = 'ticket' | 'note' | 'person';
export type DocReference = { targetKind: DocReferenceKind; targetId: string; ordinal: number; snippet: string };

/** Spec B §2.1: a snippet is at most this many characters. */
export const SNIPPET_MAX_CHARS = 160;

// Private-use sentinels for the marker while the text is assembled; stripped from
// every piece of the person's own text first, so only these two can exist.
const MARK_OPEN = '\uE000';
const MARK_CLOSE = '\uE001';
const stripSentinels = (value: string): string => value.replace(/[\uE000\uE001]/g, '');

/**
 * The blocks a snippet may be: the innermost one holding the reference. A
 * list item and a table cell hold a paragraph, so in the editor's own schema
 * the paragraph wins; the outer types are listed for documents from other
 * producers, where a cell may hold text directly.
 */
const SNIPPET_BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'codeBlock', 'code_block', 'detailsSummary', 'blockquote',
  'listItem', 'list_item', 'taskItem', 'tableCell', 'tableHeader',
]);

function referenceOf(node: unknown): { kind: DocReferenceKind; id: string } | null {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return null;
  const candidate = node as { type?: unknown; attrs?: unknown };
  const attrs = (typeof candidate.attrs === 'object' && candidate.attrs !== null ? candidate.attrs : {}) as Record<string, unknown>;
  const idOf = (key: string): string | null => {
    const value = attrs[key];
    return typeof value === 'string' && value !== '' ? value : null;
  };
  const kinds: Record<string, [DocReferenceKind, string]> = {
    ticketRef: ['ticket', 'ticketId'],
    wikiLink: ['note', 'noteId'],
    mention: ['person', 'userId'],
  };
  const entry = typeof candidate.type === 'string' ? kinds[candidate.type] : undefined;
  if (entry === undefined) return null;
  const id = idOf(entry[1]);
  return id === null ? null : { kind: entry[0], id };
}

export function extractDocReferences(doc: unknown, options: DocTextOptions = {}): DocReference[] {
  const found: Array<{ kind: DocReferenceKind; id: string; block: unknown; indexInBlock: number }> = [];
  const perBlock = new Map<unknown, number>();
  const walk = (node: unknown, depth: number, block: unknown): void => {
    if (depth > MAX_DEPTH) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth, block);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const ref = referenceOf(node);
    if (ref !== null) {
      const indexInBlock = perBlock.get(block) ?? 0;
      perBlock.set(block, indexInBlock + 1);
      found.push({ ...ref, block, indexInBlock });
      return;
    }
    const candidate = node as { type?: unknown; content?: unknown };
    const here = typeof candidate.type === 'string' && SNIPPET_BLOCK_TYPES.has(candidate.type) ? node : block;
    if (candidate.content !== undefined) walk(candidate.content, depth + 1, here);
  };
  walk(doc, 0, doc);
  return found.map((ref, ordinal) => ({
    targetKind: ref.kind,
    targetId: ref.id,
    ordinal,
    snippet: snippetFor(ref.block, ref.indexInBlock, options),
  }));
}

/** The block's text with its `target`-th own reference wrapped in the sentinels. */
function renderMarked(
  node: unknown,
  depth: number,
  options: DocTextOptions,
  target: number,
  counter: { seen: number },
  counting: boolean,
  isRoot: boolean,
): string {
  if (depth > MAX_DEPTH) return '';
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return '';
  const candidate = node as { type?: unknown; text?: unknown; content?: unknown };
  if (referenceOf(node) !== null) {
    const own = stripSentinels(render(node, depth, options));
    if (!counting) return own;
    const mine = counter.seen === target;
    counter.seen += 1;
    return mine ? `${MARK_OPEN}${own}${MARK_CLOSE}` : own;
  }
  if (candidate.type === 'ticketRef' || candidate.type === 'wikiLink' || candidate.type === 'mention') {
    return stripSentinels(render(node, depth, options)); // a chip with no id: its text, never a marker
  }
  if (candidate.type === 'text') return typeof candidate.text === 'string' ? stripSentinels(candidate.text) : '';
  if (candidate.type === 'hardBreak' || candidate.type === 'hard_break') return ' ';
  // A reference inside a NESTED snippet block belongs to that block, not to this one.
  const nested = !isRoot && typeof candidate.type === 'string' && SNIPPET_BLOCK_TYPES.has(candidate.type);
  const children = Array.isArray(candidate.content)
    ? candidate.content.map((child) => renderMarked(child, depth + 1, options, target, counter, counting && !nested, false)).join('')
    : '';
  return typeof candidate.type === 'string' && BLOCK_NODE_TYPES.has(candidate.type) ? `${children} ` : children;
}

function snippetFor(block: unknown, indexInBlock: number, options: DocTextOptions): string {
  const flat = renderMarked(block, 0, options, indexInBlock, { seen: 0 }, true, true)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\[(?=\[)/g, '[ ')
    .replace(/\](?=\])/g, '] ')
    // A bracket TOUCHING the marker would join it into "[[[" / "]]]" and move the pair for
    // Task 2's splitSnippet (the first "[[", then the first "]]" after it): keep a space between.
    .replace(/\[(?=\uE000)/g, '[ ')
    .replace(/(?<=\uE000)\[/g, ' [')
    .replace(/\](?=\uE001)/g, '] ')
    .replace(/(?<=\uE001)\]/g, ' ]');
  const open = flat.indexOf(MARK_OPEN);
  const close = flat.indexOf(MARK_CLOSE);
  if (open < 0 || close < open) return flat.slice(0, SNIPPET_MAX_CHARS);
  const marked = `${flat.slice(0, open)}[[${flat.slice(open + 1, close)}]]${flat.slice(close + 1)}`;
  return windowAround(marked, open, close + 3);
}

/** At most SNIPPET_MAX_CHARS, centred on [start, end), an ellipsis where text was cut. */
function windowAround(text: string, start: number, end: number): string {
  const max = SNIPPET_MAX_CHARS;
  if (text.length <= max) return text;
  const markLength = end - start;
  if (markLength + 2 > max) return `${text.slice(start, start + max - 3)}…]]`;
  const room = max - markLength;
  let from = Math.max(0, start - Math.floor(room / 2));
  const to = Math.min(text.length, from + max);
  from = Math.max(0, to - max);
  let out = text.slice(from, to);
  if (from > 0) out = `…${out.slice(1)}`;
  if (to < text.length) out = `${out.slice(0, -1)}…`;
  return out;
}
