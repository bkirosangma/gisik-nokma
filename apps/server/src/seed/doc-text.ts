import { plainTextToDoc } from '@gisik-nokma/domain';
import { markdownToDoc } from './markdown-doc.js';

/**
 * ## SUPERSEDED IN PLACE — 2026-09-20. The original docblock is kept below, verbatim.
 *
 * The decision recorded here was CHOSEN ONCE AND CHANGED DELIBERATELY. It is
 * kept because a reader who finds the parser needs to know that literal seeds
 * were a considered position rather than an oversight, and because the reversal
 * cites the same spec §2 the original did — the owner overrode that principle
 * for seeds, they did not disprove it.
 *
 * What was here, verbatim:
 *
 * > Seed bodies are the record's text, verbatim and literal. No markdown
 * > parsing: a `'**'` in the frozen record renders as typed characters, which
 * > is the editor's own literal-text honesty (spec §2) applied to seeds.
 * >
 * > Built from `@gisik-nokma/domain`'s own `plainTextToDoc`, which already
 * > produces one correctly-shaped ProseMirror paragraph for a single line
 * > (empty for an empty line). Splitting on newline and mapping each line
 * > through it reuses that shape rather than re-deriving it here.
 *
 * ## What replaced it, and why
 *
 * The owner ruled on 2026-09-20, verbatim *"both"*, on a dispatch that showed
 * them this decision and the `markdownLinks` option — both citing §2 — and
 * asked whether to reverse each. Both were reversed. So a seed's PROSE is now
 * parsed: `**Gates:**` reaches the editor as a bold run, not as four characters
 * of punctuation the reader has to look past.
 *
 * ## ⚠ THE NAME NOW UNDER-DESCRIBES THE FUNCTION, AND THAT IS DELIBERATE
 *
 * `plainTextDoc` is no longer about plain text. It is kept because the
 * reversal's record belongs on the symbol the decision was written about, and a
 * rename would detach the two. The accurate spelling is `markdownToDoc`, in
 * `markdown-doc.ts`, which this delegates to — call that one when what you mean
 * is "parse markdown".
 *
 * The literal renderer still EXISTS and still has a job: the machine-ish
 * `— tracker record —` block (`literalTextDoc` below). See `seedDescriptionDoc`
 * for how the two are told apart, and note that the split is by CONSTRUCTION —
 * the builder says which lines are prose — rather than by inspecting the string
 * for things that look like markdown.
 */
export function plainTextDoc(text: string): Record<string, unknown> {
  return markdownToDoc(text);
}

/**
 * One literal paragraph per line, blank lines becoming empty paragraphs — the
 * body this module shipped as `plainTextDoc` until 2026-09-20, kept under its
 * own name rather than deleted.
 *
 * It renders the part of a seed description that is a RECORD rather than prose:
 * `tracker id: ops:duns`, `origin: operations/registrations/duns.md`,
 * `clears week 1 · needed week 15 · slack 14`. Those lines are `key: value`
 * pairs a reader scans, and `errandDescriptionText` builds them from the
 * tracker's own fields — parsing them would let a `-` at the start of a note
 * become a bullet that nobody wrote. Measured before choosing: no record line
 * in the shipped corpus starts with a markdown block marker, so the split is
 * not propping up a defect — it is what keeps that true when a note changes.
 */
export function literalTextDoc(text: string): Record<string, unknown> {
  const lines = text.split('\n');
  const paragraphs = lines.map((line) => (plainTextToDoc(line).content as unknown[])[0]);
  return { type: 'doc', content: paragraphs };
}

/**
 * Which renderer a part of a seed description gets. `markdown` for the record's
 * own prose (its body and its quoted ask); `literal` for the tracker-record
 * block. The kind is chosen by the BUILDER that wrote the lines, never inferred
 * from the text.
 */
export type SeedTextPart = { kind: 'markdown' | 'literal'; text: string };

/**
 * Compose a description from its parts. Parts are separated by exactly one empty
 * paragraph, which is what the single-string form this replaced put between them.
 */
export function seedDescriptionDoc(parts: SeedTextPart[]): Record<string, unknown> {
  const content: unknown[] = [];
  for (const part of parts) {
    if (content.length > 0) content.push({ type: 'paragraph' });
    const rendered = part.kind === 'markdown' ? plainTextDoc(part.text) : literalTextDoc(part.text);
    content.push(...(rendered.content as unknown[]));
  }
  return { type: 'doc', content };
}
