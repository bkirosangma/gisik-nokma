/**
 * Dependency-free plain-text rendering of a ProseMirror JSON document
 * (coordination amendment 12). Used by the proj_search projection and by
 * notifications; Plan 7's editor conforms to the shapes read here — in
 * particular the mention node {type: 'mention', attrs: {userId, label?}}.
 *
 * Total function: any unrenderable input yields '' — a search projection
 * must never crash the ingest transaction over a malformed document.
 */
export type MentionNodeAttrs = { userId: string; label?: string };

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
]);

export function docToPlainText(doc: unknown): string {
  return render(doc).replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

function render(node: unknown): string {
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
  const children = Array.isArray(candidate.content) ? candidate.content.map(render).join('') : '';
  const isBlock = typeof candidate.type === 'string' && BLOCK_NODE_TYPES.has(candidate.type);
  return isBlock && children.length > 0 ? `${children}\n` : children;
}
