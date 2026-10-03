/**
 * The reading surface on its own subpath (`@gisik-nokma/editor/reading`, smoothness T9; audit SM-04): the table of contents, the
 * scroll-progress bar and the heading/word-count reader. Every module here is React and DOM only, with no Tiptap and no other editor
 * file, so a route that shows a note's reading view and its contents does not carry the editor to do it. The root barrel re-exports
 * the same names (the webview and the editor's own tests import them there).
 */
export { extractReadingMeta, headerSlug, readingTimeMinutes, assignHeadingIds, type ReadingMeta } from './reading-meta.js';
export { MIN_HEADINGS, ReadingTOC, type ReadingTOCProps } from './ReadingTOC.js';
export { ReadingProgress, type ReadingProgressProps } from './ReadingProgress.js';
export { findScroller, readingProgress, type Scroller } from './scroller.js';
