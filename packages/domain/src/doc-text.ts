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
]);

export function docToPlainText(doc: unknown): string {
  return render(doc, 0).replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

function render(node: unknown, depth: number): string {
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
  const children = Array.isArray(candidate.content)
    ? candidate.content.map((child) => render(child, depth + 1)).join('')
    : '';
  const isBlock = typeof candidate.type === 'string' && BLOCK_NODE_TYPES.has(candidate.type);
  return isBlock && children.length > 0 ? `${children}\n` : children;
}
