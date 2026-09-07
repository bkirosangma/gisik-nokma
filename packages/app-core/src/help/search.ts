import {
  entryText,
  spansToText,
  type HelpContent,
  type HelpDocument,
  type HelpEntry,
  type HelpSection,
} from './types.js';

/**
 * Search over the manual and FAQ, shared by all three apps.
 *
 * ## Why this is not a text box wired to `String.includes`
 *
 * The product has **no search on the web at all** — that is one of the eight gaps
 * the README names. So this is, today, the only search a web user can reach, and
 * the first one they meet sets their expectation for the rest. It gets the two
 * behaviours that make a search usable rather than merely present:
 *
 * - **All terms must match, in any order.** "due date" and "date due" find the
 *   same thing; a substring search finds neither unless the words are adjacent.
 * - **A title hit outranks a body hit.** Somebody typing "passkey" wants the
 *   entry *about* passkeys above the eleven that mention one in passing.
 *
 * ## And it answers WHY it found nothing
 *
 * `NoHelpMatch` is returned rather than an empty array, because "no results" is
 * the same useless message the calendar refuses to show: this product tells you
 * *which kind* of empty you are looking at. A blank query and a real miss are
 * different situations and get different sentences.
 */

export type HelpMatch = {
  document: HelpDocument['id'];
  documentTitle: string;
  sectionId: string;
  sectionTitle: string;
  entry: HelpEntry;
  /** Higher is better. Title hits are worth more; see `scoreEntry`. */
  score: number;
  /** The sentence the match was found in, for showing under the title. */
  excerpt: string;
};

export type NoHelpMatch =
  | { kind: 'empty-query' }
  | { kind: 'no-match'; query: string; searched: number };

export type HelpSearchResult =
  | { kind: 'matches'; matches: HelpMatch[] }
  | { kind: 'none'; reason: NoHelpMatch };

const TERM_SPLIT = /\s+/;

export function helpTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(TERM_SPLIT)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * A title hit is worth five body hits.
 *
 * Five rather than "sort titles first" because a body that mentions a term six
 * times really is more relevant than a title that happens to contain it once,
 * and a hard ordering could never express that. The number is a judgement, not a
 * measurement, and it is written here as one.
 */
const TITLE_WEIGHT = 5;

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  return haystack.split(needle).length - 1;
}

function scoreEntry(entry: HelpEntry, terms: readonly string[]): number {
  const title = entry.title.toLowerCase();
  const body = entryText(entry).toLowerCase();
  let score = 0;
  for (const term of terms) {
    // EVERY term must appear somewhere, or this entry is not a match at all.
    // Returning 0 here is what makes the search conjunctive; scoring the terms
    // that did match would quietly turn it into an OR and flood the results.
    if (!body.includes(term)) return 0;
    score += countOccurrences(body, term);
    score += countOccurrences(title, term) * TITLE_WEIGHT;
  }
  return score;
}

/** The first block's text, trimmed to something that fits under a heading. */
function excerptOf(entry: HelpEntry, terms: readonly string[]): string {
  const blocks = entry.blocks
    .map((block) => (block.kind === 'paragraph' || block.kind === 'quote' ? spansToText(block.spans) : ''))
    .filter((text) => text.length > 0);
  // Prefer a paragraph that actually contains the first term — an excerpt that
  // does not show why the entry matched is decoration.
  const first = terms[0] ?? '';
  const hit = blocks.find((text) => text.toLowerCase().includes(first)) ?? blocks[0] ?? '';
  return hit.length > 180 ? `${hit.slice(0, 177)}…` : hit;
}

export function searchHelp(content: HelpContent, query: string, limit = 20): HelpSearchResult {
  const terms = helpTerms(query);
  if (terms.length === 0) return { kind: 'none', reason: { kind: 'empty-query' } };

  const matches: HelpMatch[] = [];
  let searched = 0;
  for (const document of content) {
    for (const section of document.sections) {
      for (const entry of section.entries) {
        searched += 1;
        const score = scoreEntry(entry, terms);
        if (score === 0) continue;
        matches.push({
          document: document.id,
          documentTitle: document.title,
          sectionId: section.id,
          sectionTitle: section.title,
          entry,
          score,
          excerpt: excerptOf(entry, terms),
        });
      }
    }
  }

  if (matches.length === 0) {
    return { kind: 'none', reason: { kind: 'no-match', query, searched } };
  }
  // Ties break on title, so the same query always returns the same order. A
  // search whose results reshuffle between identical queries reads as broken.
  matches.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
  return { kind: 'matches', matches: matches.slice(0, limit) };
}

/** Find one entry by document and entry id — what a deep link resolves through. */
export function findHelpEntry(
  content: HelpContent,
  documentId: string,
  entryId: string,
): { document: HelpDocument; section: HelpSection; entry: HelpEntry } | null {
  for (const document of content) {
    if (document.id !== documentId) continue;
    for (const section of document.sections) {
      for (const entry of section.entries) {
        if (entry.id === entryId) return { document, section, entry };
      }
    }
  }
  return null;
}
