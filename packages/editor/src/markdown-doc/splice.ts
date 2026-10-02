import { emptyDoc, isDocJson, type DocJson } from '../doc.js';

export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};
export type BodyEdit = { mode: 'replace' } | { mode: 'append' } | { mode: 'replace_section'; section: string };

const textOf = (node: DocNode): string => (node.text ?? '') + (node.content ?? []).map(textOf).join('');
const isHeading = (node: DocNode | undefined): node is DocNode => node?.type === 'heading';
const levelOf = (node: DocNode): number => Number(node.attrs?.['level'] ?? 1);
const isEmptyParagraph = (node: DocNode | undefined): boolean =>
  node?.type === 'paragraph' && (node.content === undefined || node.content.length === 0);

/**
 * Section and append edits SPLICE the stored JSON: every node outside the edited range is the
 * very object that was stored, so it serializes byte-for-byte as before (spec §3, case 26.010).
 */
export function spliceDoc(current: unknown, incoming: DocJson, edit: BodyEdit): { doc: DocJson } | { problem: string } {
  if (edit.mode === 'replace') return { doc: incoming };
  const base = isDocJson(current) ? current : emptyDoc();
  const blocks = Array.isArray(base['content']) ? (base['content'] as DocNode[]) : [];
  const added = Array.isArray(incoming['content']) ? (incoming['content'] as DocNode[]) : [];
  if (edit.mode === 'append') {
    const kept = blocks.length === 1 && isEmptyParagraph(blocks[0]) ? [] : blocks;
    return { doc: { ...base, content: [...kept, ...added] } };
  }
  const want = edit.section.trim();
  const matches = blocks.flatMap((b, i) => (isHeading(b) && textOf(b).trim() === want ? [i] : []));
  if (matches.length === 0) {
    const names = blocks.filter(isHeading).map((b) => `"${textOf(b).trim()}"`);
    return { problem: `section "${want}" not found; the headings are: ${names.length > 0 ? names.join(', ') : 'none'}` };
  }
  if (matches.length > 1) return { problem: `section "${want}" is ambiguous: ${matches.length} headings read "${want}"; use mode "replace"` };
  const at = matches[0]!;
  const level = levelOf(blocks[at]!);
  let end = at + 1;
  while (end < blocks.length && !(isHeading(blocks[end]) && levelOf(blocks[end]!) <= level)) end++;
  return { doc: { ...base, content: [...blocks.slice(0, at + 1), ...added, ...blocks.slice(end)] } };
}
