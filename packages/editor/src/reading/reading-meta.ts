/**
 * Reading extras for long documents (spec §8.2's `reading/` entries), ported
 * from the knowledge-base app's `MarkdownEditor.tsx` and `MarkdownPane.tsx`.
 *
 * The source reads the RENDERED DOM rather than the document, and that is the
 * point of the port too: the headings are whatever the reader can see, and the
 * ids are stamped on the live elements so the table of contents can scroll to
 * them without a second lookup or a re-parse.
 */

export type ReadingMeta = {
  /** Words in the rendered text — what the reading-time estimate divides. */
  wordCount: number;
  /** H1–H3 in document order, with the ids `extractReadingMeta` stamped. */
  headings: Array<{ id: string; level: 1 | 2 | 3; text: string }>;
};

/** Words per minute the reading-time estimate assumes. */
const WORDS_PER_MINUTE = 200;

/**
 * Heading text → a stable, URL-safe id.
 *
 * Accents are stripped through NFKD so `Café` and `Cafe` do not produce two
 * different anchors for one word, and the punctuation sweep is what makes the
 * result usable as a fragment. `.normalize` is the one method here that can
 * throw (on a lone surrogate), and it does not in practice — but the caller
 * treats an empty slug as "no id" and falls back, so a heading made entirely
 * of punctuation is handled rather than producing `id=""`.
 */
export function headerSlug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Elements whose text ENDS a word — see `readText`. */
const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE',
  'DIV', 'TD', 'TH', 'TR', 'TABLE', 'UL', 'OL', 'DETAILS', 'SUMMARY',
]);

/**
 * The rendered text, with a space after every block.
 *
 * ## WHY NOT `root.textContent`, WHICH IS WHAT THE SOURCE USES
 *
 * `textContent` concatenates with NO separator, so two adjacent blocks fuse:
 * `<h1>GST filing</h1><p>due soon</p>` reads as `GST filingdue soon`, and the
 * word count comes out one short per block boundary — measured, 8 where the
 * document has 12 words. A reading-time estimate is the only consumer of this
 * number, and an estimate that is wrong by a third on a short document is
 * wrong on the direction that matters (it says a document is quicker to read
 * than it is). The separator is inserted after each BLOCK's text and nowhere
 * else, so inline text is untouched and no word is split.
 */
function readText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const inner = Array.from(el.childNodes).map(readText).join('');
  return BLOCK_TAGS.has(el.tagName) ? `${inner} ` : inner;
}

/**
 * Word count and the H1–H3 list, read off the rendered node.
 *
 * ## ONE DIVERGENCE FROM THE SOURCE, AND IT IS A FIX
 *
 * The source counts collisions against the FINAL id rather than the base one:
 * it computes `id = base`, suffixes it, and then records `seen.set(id, …)`
 * under the SUFFIXED key. With two headings reading `Notes` that gives `notes`
 * and `notes-2` — correct. With THREE it gives `notes`, `notes-2`, `notes-2`:
 * the third looks up `notes`, sees the count for a key nobody wrote, and
 * produces a duplicate id. Two elements with one id is exactly what the
 * stamping below exists to prevent, since the table of contents resolves each
 * entry with `querySelector('#id')` and would send both to the first one.
 * Counting against the BASE fixes it and leaves the two-heading case — the one
 * the case names — identical.
 */
export function extractReadingMeta(root: HTMLElement): ReadingMeta {
  const text = readText(root);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const headings: ReadingMeta['headings'] = [];
  const seen = new Map<string, number>();
  for (const node of Array.from(root.querySelectorAll('h1, h2, h3'))) {
    const el = node as HTMLElement;
    const heading = el.textContent?.trim() ?? '';
    if (heading === '') continue;
    const tag = el.tagName.toLowerCase();
    const level: 1 | 2 | 3 = tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3;
    const base = headerSlug(heading) || `heading-${headings.length + 1}`;
    const collisions = seen.get(base) ?? 0;
    const id = collisions === 0 ? base : `${base}-${collisions + 1}`;
    seen.set(base, collisions + 1);
    // Stamped on the LIVE node, which is what lets the TOC scroll to it and
    // what makes the ids "stable" in the only sense that matters here: the
    // same document produces the same ids, and they are already on screen.
    if (el.id !== id) el.id = id;
    headings.push({ id, level, text: heading });
  }

  return { wordCount, headings };
}

/**
 * Minutes at `WORDS_PER_MINUTE`, rounded, with a floor of one for any
 * non-empty document — a note of five words is not a zero-minute read. Zero
 * words is zero: the empty composer has no reading time to report, and the
 * floor must not turn "nothing" into "one minute".
 */
export function readingTimeMinutes(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}
