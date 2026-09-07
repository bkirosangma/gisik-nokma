/**
 * The in-app manual and FAQ, as a structure three different renderers can share.
 *
 * ## Why a block model and not the markdown
 *
 * The owner's instruction was that the manual and FAQ be a real feature of the
 * product, reachable from the web app **and** the native mobile and desktop
 * apps — not files in a repository. That rules out the obvious shortcut twice
 * over:
 *
 * - **Shipping the markdown and rendering it per platform** would need a
 *   markdown parser in each app, and React Native cannot render HTML at all, so
 *   the web's renderer could never be the phone's. Three parsers, three
 *   opportunities to disagree about the same sentence.
 * - **Shipping rendered HTML** is the same problem wearing a different hat: it
 *   is exactly what `apps/mobile` already has to do for the editor
 *   (`editor-html.generated.ts` is a whole web view in a string), and that is a
 *   heavy thing to reach for when the content is prose.
 *
 * So the markdown is parsed ONCE, at build time, into the blocks below, and each
 * platform maps a small closed set of block kinds onto its own primitives. The
 * parse is shared; only the drawing differs. A sentence cannot render
 * differently on the phone than on the web, because the phone and the web are
 * reading the same parsed object.
 *
 * ## The inline model is deliberately small
 *
 * `bold`, `italic`, `code` and `link` — and nothing else. The source documents
 * use bold heavily and load-bearingly (it is how they mark the claims that
 * matter: *"you cannot create a project"*, *"We never store a password"*), so
 * dropping emphasis to plain text would lose the part of the sentence the writer
 * was doing the most work with. Everything beyond those four is not used by the
 * two documents this model exists for, and a span kind nothing produces is a
 * branch nothing tests.
 */

/** A run of text, optionally emphasised. `text` is always the literal to draw. */
export type HelpSpan =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

/**
 * One drawable block.
 *
 * `quote` carries spans rather than nested blocks: the two source documents use
 * blockquotes for a single emphasised passage and never nest a list or a table
 * inside one, and a recursive block type would oblige three renderers to handle
 * a shape that does not occur. If that changes, this is the type to widen, and
 * the parser will refuse the input rather than flatten it silently.
 */
export type HelpBlock =
  | { kind: 'paragraph'; spans: HelpSpan[] }
  | {
      kind: 'list';
      /**
       * `true` for `1.` `2.` `3.`, `false` for bullets.
       *
       * Not cosmetic: the manual is largely step-by-step instructions, and an
       * ordered list that renders unnumbered stops telling a reader what order to
       * do things in. The first parser had no ordered branch at all, so every
       * numbered step fell through to the paragraph rule and forty-odd sequences
       * came out as run-on prose — present, and unusable as instructions.
       */
      ordered: boolean;
      items: HelpSpan[][];
    }
  | { kind: 'quote'; spans: HelpSpan[] }
  | { kind: 'table'; head: HelpSpan[][]; rows: HelpSpan[][][] };

/**
 * A named, linkable unit of content — a `###` subsection of the manual, or one
 * question of the FAQ. This is the granularity search returns and the
 * granularity a deep link addresses, which is why both documents are flattened
 * to it despite being shaped differently in markdown.
 */
export type HelpEntry = {
  /** Stable, slugified, unique within its document. Deep links use it. */
  id: string;
  title: string;
  blocks: HelpBlock[];
};

export type HelpSection = {
  id: string;
  title: string;
  /** Blocks between the section heading and its first entry. Often empty. */
  intro: HelpBlock[];
  entries: HelpEntry[];
};

export type HelpDocument = {
  id: 'manual' | 'faq';
  title: string;
  /** The source file, so a reader can find the text this was built from. */
  source: string;
  /**
   * Blocks between the document's title and its first section.
   *
   * Present because the first version of the parser DROPPED them: content only
   * landed once a section existed, so the manual's opening — the paragraphs
   * telling a reader what the manual is and that it will not send them hunting
   * for a button that was never built — silently never reached the app. Found by
   * measuring retention against the source (98.8%, and this was most of the
   * missing 1.2%), not by reading the output, which looked entirely reasonable.
   */
  intro: HelpBlock[];
  sections: HelpSection[];
};

/** Everything the help surface has, in the order it should be offered. */
export type HelpContent = readonly HelpDocument[];

/** Flatten spans to their literal text — for search, and for a plain-text fallback. */
export function spansToText(spans: readonly HelpSpan[]): string {
  return spans.map((span) => span.text).join('');
}

/** Every span in a block, in reading order. */
export function blockSpans(block: HelpBlock): HelpSpan[] {
  switch (block.kind) {
    case 'paragraph':
    case 'quote':
      return [...block.spans];
    case 'list':
      return block.items.flat();
    case 'table':
      return [...block.head.flat(), ...block.rows.flat(2)];
  }
}

/** An entry's whole text, heading included — the haystack search matches against. */
export function entryText(entry: HelpEntry): string {
  return [entry.title, ...entry.blocks.map((b) => spansToText(blockSpans(b)))].join('\n');
}
