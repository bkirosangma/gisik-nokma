/**
 * The server-safe Markdown ⇄ document converter (MCP-everything spec §3, M-E8), exported on its
 * own subpath because the package root carries React. Nothing here may import a component, `react`,
 * `@tiptap/react` or `../markdown/serializer.js` (the browser copy-as-Markdown, which needs a DOM).
 */
export { markdownToDoc, scanRefs as scanMarkdownRefs } from './parse.js';
export { docToMarkdown } from './serialize.js';
export { spliceDoc, type BodyEdit, type DocNode } from './splice.js';
export { markdownSchema } from './schema.js';
export { MARKDOWN_SYNTAX_HELP, TICKET_KEY_PATTERN, type MarkdownRefs, type RefResolver } from './refs.js';
export { emptyDoc, isDocJson, type DocJson } from '../doc.js';
