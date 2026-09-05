import { plainTextToDoc } from '@gisik-nokma/domain';

/**
 * Seed bodies are the record's text, verbatim and literal. No markdown
 * parsing: a '**' in the frozen record renders as typed characters, which
 * is the editor's own literal-text honesty (spec §2) applied to seeds.
 *
 * Built from `@gisik-nokma/domain`'s own `plainTextToDoc`, which already
 * produces one correctly-shaped ProseMirror paragraph for a single line
 * (empty for an empty line). Splitting on newline and mapping each line
 * through it reuses that shape rather than re-deriving it here.
 */
export function plainTextDoc(text: string): Record<string, unknown> {
  const lines = text.split('\n');
  const paragraphs = lines.map((line) => (plainTextToDoc(line).content as unknown[])[0]);
  return { type: 'doc', content: paragraphs };
}
