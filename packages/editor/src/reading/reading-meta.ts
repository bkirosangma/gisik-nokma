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
  /**
   * H1–H3 in document order, with the ids `extractReadingMeta` stamped. Only
   * these three levels are LISTED (the rail's rule, and `MIN_HEADINGS` counts
   * them); every level H1–H6 is STAMPED, so a copied heading link to an H4
   * resolves.
   */
  headings: Array<{ id: string; level: 1 | 2 | 3; text: string }>;
};

/** Words per minute the reading-time estimate assumes. */
const WORDS_PER_MINUTE = 200;

/**
 * Heading text → a stable, URL-safe id.
 *
 * Accents are stripped through NFKD so `Café` and `Cafe` do not produce two
 * different anchors for one word, and the punctuation sweep is what makes the
 * result usable as a fragment.
 *
 * **AN EARLIER VERSION OF THIS PARAGRAPH SAID `.normalize` "is the one method
 * here that can throw (on a lone surrogate)". That is false, and it was
 * measured**: `'\uD800'.normalize('NFKD')` returns the same lone surrogate
 * rather than throwing, as does `'a\uDFFFb'` and a doubled `'\uD800\uD800'`.
 * None of them throws, so this function is TOTAL on its input — no method in it
 * can throw at all.
 *
 * The fallback it really needs is for a DIFFERENT case, and the caller has it:
 * a heading made entirely of punctuation slugs to the empty string, and
 * `extractReadingMeta` substitutes `heading-N` rather than stamping `id=""` on
 * every such heading (which would put them all on one anchor).
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

/**
 * The ids for a run of NON-EMPTY heading texts, in document order — THE one
 * place ids are decided. The table of contents, the stamped `id` attributes and
 * the copy-link fragment (`extensions/heading-anchors.ts`) all come from here,
 * so a copied link is the fragment the table of contents already uses.
 *
 * Collisions are counted against the BASE slug (see `extractReadingMeta`), and a
 * text that slugs to nothing becomes `heading-N` where N is its 1-based
 * position in `texts`.
 */
export function assignHeadingIds(texts: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return texts.map((text, index) => {
    const base = headerSlug(text) || `heading-${index + 1}`;
    const collisions = seen.get(base) ?? 0;
    seen.set(base, collisions + 1);
    return collisions === 0 ? base : `${base}-${collisions + 1}`;
  });
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
 * Word count, the H1–H3 list and the H1–H6 ids, read off the rendered node.
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

  // Every level is stamped (H1–H6); only H1–H3 are listed. The ids are computed
  // over ALL non-empty headings in one pass, so the suffix an H2 gets counts an
  // earlier H4 of the same text — one id per element, page-wide.
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')).filter(
    (el) => (el.textContent?.trim() ?? '') !== '',
  );
  // A heading the anchor extension already gave an id (`data-heading-id`) keeps
  // exactly that one: the extension slugs the DOCUMENT's text and this reads the
  // rendered DOM's, and the two can differ on a mention chip or a hard break —
  // the stamped id and the copied link must not.
  const computed = assignHeadingIds(nodes.map((el) => el.textContent?.trim() ?? ''));
  const headings: ReadingMeta['headings'] = [];
  nodes.forEach((el, index) => {
    const id = el.getAttribute('data-heading-id') || (computed[index] as string);
    // Stamped on the LIVE node, which is what lets the TOC scroll to it and
    // what makes the ids "stable" in the only sense that matters here: the
    // same document produces the same ids, and they are already on screen.
    if (el.id !== id) el.id = id;
    const level = Number(el.tagName.slice(1));
    if (level <= 3) headings.push({ id, level: level as 1 | 2 | 3, text: el.textContent?.trim() ?? '' });
  });

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
