import { docToPlainText } from './doc-text.js';

/**
 * `chunkDoc` — a ProseMirror document split into the units a meaning search
 * indexes and returns (spec §7.6, Plan 3 of 6).
 *
 * ## Why a chunk is not a paragraph
 *
 * The meaning query returns the CHUNK, and a chunk is what the reader is shown
 * as the snippet. One paragraph is too small a unit for a vector: "Torque it to
 * 45 Nm" embedded alone has almost no signal, and the same sentence under
 * "Compressor > Belt tension" is unambiguous. So the walk carries a heading path
 * and packs consecutive blocks under it.
 *
 * ## The heading path is built from LEVELS, not from nesting
 *
 * ProseMirror headings are flat siblings, not nested nodes — an H2 is not a
 * child of the H1 above it — so "H1 > H2" cannot be read off the tree. It is
 * reconstructed from the levels: a heading at level L truncates the path to
 * L-1 entries and writes itself at L-1. A second H1 therefore REPLACES the path
 * rather than extending it, which is what a document that starts a new top-level
 * section means.
 *
 * Empty segments are dropped when the path is joined, so a document that opens
 * with an H3 reads as one segment rather than as " >  > Roof". That is a
 * judgement, not a derivation: neither reading is wrong, and the one that never
 * emits a stray separator is the one a snippet can show without looking broken.
 *
 * ## The text of a block is `docToPlainText`'s, deliberately
 *
 * Spec §3.5 already defines "the plain text of a body" and that definition is
 * what `proj_note_search` folds; a second walker here would be a second
 * definition of the same fact, and the two would drift on the next node type
 * either one learns. Every node type `docToPlainText` renders — a mention as
 * `@label`, a wiki-link as its stored title, a table cell, a details summary —
 * therefore reaches the embedding through that one function.
 *
 * ## The heading line is part of the chunk text
 *
 * The chunk's text is `headingPath + '\n' + body`, per spec §7.6, so the
 * heading is embedded WITH the body it labels — which is the whole point of the
 * path. When there is no path, the text is the body alone: prepending the
 * separator to a headingless chunk would put a newline at the front of the
 * embedding input and of every snippet cut from it.
 */

export type DocChunk = { headingPath: string; text: string };

/** Spec §7.6's budget, in words. */
const MAX_WORDS = 150;

/** The node types a chunk is packed from. A heading is a PATH, not body text. */
const HEADING = 'heading';

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Level 1 unless the node says otherwise, and clamped to a real depth. A
 * malformed level is not a reason to throw: this runs inside the embedding
 * worker, and a document with `attrs.level: 'two'` should be indexed as a
 * top-level heading rather than stop the worker's batch.
 */
function headingLevel(node: { attrs?: unknown }): number {
  const attrs = (typeof node.attrs === 'object' && node.attrs !== null ? node.attrs : {}) as {
    level?: unknown;
  };
  const level = Number(attrs.level);
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1;
}

export function chunkDoc(doc: unknown): DocChunk[] {
  const content =
    typeof doc === 'object' && doc !== null && Array.isArray((doc as { content?: unknown }).content)
      ? ((doc as { content: unknown[] }).content as unknown[])
      : [];

  const chunks: DocChunk[] = [];
  const path: string[] = [];
  let current: string[] = [];

  const flush = (): void => {
    if (current.length === 0) return;
    const body = current.join('\n');
    const headingPath = path.filter((segment) => typeof segment === 'string' && segment !== '').join(' > ');
    chunks.push({ headingPath, text: headingPath === '' ? body : `${headingPath}\n${body}` });
    current = [];
  };

  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const node = block as { type?: unknown; attrs?: unknown };

    if (node.type === HEADING) {
      flush();
      const level = headingLevel(node);
      path.length = Math.min(path.length, Math.max(level - 1, 0));
      path[level - 1] = docToPlainText(block);
      continue;
    }

    const text = docToPlainText(block);
    if (text === '') continue;
    if (wordCount(current.join(' ')) + wordCount(text) > MAX_WORDS) flush();
    current.push(text);
  }

  flush();
  return chunks;
}
