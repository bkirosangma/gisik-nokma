/**
 * `foldSearchText` — the one function both sides of a note search run over
 * their text (spec §7.2, Plan 3 of 6).
 *
 * ## Why the folding is in TypeScript and not in SQL
 *
 * The index path is `proj_note_search`'s columns and the query path is a URL
 * parameter. If the fold lived in the migration's generated columns, the query
 * side would need a second spelling of it in the `WHERE` clause, and two
 * spellings of one rule is how the two sides come to index one string and
 * search for another — silently, with both sides green. So the fold happens
 * once, here, before either side sees the text, and the migration's columns
 * hold its output.
 *
 * ## The four marks are one letter
 *
 * Garo writes the raka with any of `·` (U+00B7 MIDDLE DOT), `'` (U+0027
 * APOSTROPHE), `’` (U+2019 RIGHT SINGLE QUOTATION MARK) and `ʼ` (U+02BC
 * MODIFIER LETTER APOSTROPHE) — the same habit that reaches English text as
 * `don't`, and the reason this function is not called "strip apostrophes".
 * All four are removed, none is substituted for another: `a'chik` must find
 * `a·chik`, and a substitution would make each spelling match only itself.
 *
 * ## The position test, and why it is not decoration
 *
 * A mark is removed only when there is a LETTER on both sides. Without the
 * test, `'quoted'` loses its quotes and stops matching a note that contains
 * `'quoted'` — the fold would be destroying the difference between a quotation
 * and a word. With it, `don't` folds (n and t are letters on either side) and
 * `'quoted'` does not.
 *
 * ## NFC first, and the order matters
 *
 * Normalising to NFC before lowercasing means a decomposed `Café` and a
 * composed `Café` are one string by the time anything else looks at it. The
 * projection and the query path both call this function, so a difference here
 * would be a difference in what the two sides believe they are matching —
 * which is precisely the failure this module exists to prevent.
 */

/**
 * A mark flanked by two letters. `\p{L}` with the `u` flag, because "letter"
 * has to mean the Unicode property and not `[a-z]`: a Garo word is Latin, but
 * the text a person searches is not guaranteed to be, and a fold that dropped
 * a mark between two Cyrillic letters but kept one between two Latin ones
 * would be a rule nobody could state.
 */
const MARK_BETWEEN_LETTERS = /(?<=\p{L})[·'’ʼ](?=\p{L})/gu;

export function foldSearchText(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(MARK_BETWEEN_LETTERS, '')
    .replace(/\s+/g, ' ')
    .trim();
}
