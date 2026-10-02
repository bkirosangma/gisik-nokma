/**
 * The Markdown hint the description composer's footer draws. Its own module (strings only, no React, no Tiptap) so the web app's
 * editor SKELETON can lay out the very same sentence before the editor chunk arrives: the hint wraps to a different number of lines
 * at different widths, and a skeleton that drew one fixed line made the footer grow when the editor landed (smoothness T10, 25.182).
 * `EditorToolbar` re-exports `MARKDOWN_HINT` from here, so there is one sentence.
 */
export const MARKDOWN_ENTRIES: { key: string; markdown: string }[] = [
  { key: 'bold', markdown: '**bold**' },
  { key: 'italic', markdown: '*italic*' },
  { key: 'code', markdown: '`code`' },
  { key: 'quote', markdown: '> quote' },
  { key: 'list', markdown: '- list' },
  { key: 'link', markdown: '[text](url)' },
];
export const MARKDOWN_HINT = `Markdown: ${MARKDOWN_ENTRIES.map((entry) => entry.markdown).join(', ')}`;
