/**
 * Markdown → ProseMirror doc, for the SEEDS ONLY.
 *
 * ## Why this exists, and what it reverses
 *
 * Until 2026-09-20 the seeds rendered their record text LITERALLY: a `'**'` in
 * a frozen record reached the editor as two asterisks, and `doc-text.ts`'s own
 * docblock defended that as spec §2 — *"nothing silently becomes markup"* —
 * applied to seeds. The owner reversed it (verbatim: *"both"*), so record prose
 * is now PARSED and only the machine-ish `key: value` record block stays
 * literal. `doc-text.ts` carries that record where the decision was written;
 * this file is the parser the reversal brought in.
 *
 * ## It is deliberately SMALLER than markdown
 *
 * The texts it parses are FROZEN RECORDS. A construct this parser
 * half-understands would silently rewrite prose that was never markup, and the
 * damage is invisible — the characters would simply be gone. So the vocabulary
 * is exactly what the 23 real descriptions were MEASURED to contain
 * (`doc-text.test.ts` holds the census and the losslessness proof), and
 * everything else is left as characters:
 *
 *   HANDLED   `**bold**` · `*italic*` · `` `code` `` · `[text](url)` ·
 *             `# …` heading (1–6) · `- `/`+ `/`* ` bullet list · `1. ` ordered
 *             list · blank line as an empty paragraph
 *
 *   REFUSED   `_italic_` and `__bold__` — the real records write `submitted_on`
 *             and `enroling_in_apple_developer_program`, so a naive `_…_` rule
 *             would emphasise an intraword run that no reader wrote as markup.
 *             (`*` is safe here precisely because it has no intraword use.)
 *             `~~strike~~`, `> quote`, ``` fences ```, `---` rules, tables —
 *             none appears in the measured corpus, and each is left literal
 *             rather than guessed at. A bare URL is NOT autolinked: this parser
 *             reads delimiters, it does not discover URLs.
 *
 * ## Unmatched delimiters stay characters, and that is the rule that matters
 *
 * `2 * 3 * 4` is `2 * 3 * 4`. A delimiter pair is consumed only when the
 * opening run is followed by a non-space, the closing run is preceded by a
 * non-space, and (for the single-`*` form) the content does not itself open
 * with `*` — so a stray `**` cannot be re-paired into an italic. An unmatched
 * delimiter costs nothing: it survives as characters, which is what it was.
 *
 * ## It does NOT make markdown the stored format
 *
 * The output is schema-v1 doc JSON — `heading`, `bulletList`, `listItem`,
 * `codeBlock` and the `bold`/`italic`/`code`/`link` marks are all in the
 * editor's closed vocabulary (`packages/editor/test/schema.test.ts`), and only
 * what is in that vocabulary is emitted. Nothing here is re-serialised back to
 * markdown.
 */

type Mark = { type: string; attrs?: Record<string, unknown> };
type Inline = { type: 'text'; text: string; marks?: Mark[] };
type Block = Record<string, unknown>;

/** `**bold**` — content may hold single `*` (so bold can wrap italic) but never `**`. */
const BOLD = /^\*\*(\S(?:[\s\S]*?\S)?)\*\*/;
/** `*italic*` — content may not OPEN with `*`, which is what stops `**b*` re-pairing. */
const ITALIC = /^\*([^\s*](?:[\s\S]*?\S)?)\*/;
/** `` `code` `` — one line, no nesting; its content is literal. */
const CODE = /^`([^`\n]+)`/;
/** `[text](destination)` — the destination carries no `)` and no whitespace. */
const LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)/;

/** Inline parse. `carried` accumulates enclosing marks, so `**a *b* c**` nests. */
function inline(text: string, carried: Mark[] = []): Inline[] {
  const out: Inline[] = [];
  let buffer = '';
  let index = 0;

  const flush = (): void => {
    if (buffer === '') return;
    out.push(carried.length > 0 ? { type: 'text', text: buffer, marks: [...carried] } : { type: 'text', text: buffer });
    buffer = '';
  };

  while (index < text.length) {
    const rest = text.slice(index);

    // Order is load-bearing: `**` before `*`, and both after the two constructs
    // whose content is literal or already delimited.
    const code = CODE.exec(rest);
    if (code) {
      flush();
      out.push({ type: 'text', text: code[1]!, marks: [...carried, { type: 'code' }] });
      index += code[0].length;
      continue;
    }

    const link = LINK.exec(rest);
    if (link) {
      flush();
      // The link's TEXT is prose and may carry marks; its destination is not text
      // at all — it lives in the mark's `href` and must not appear in the document.
      out.push(...inline(link[1]!, [...carried, { type: 'link', attrs: { href: link[2]! } }]));
      index += link[0].length;
      continue;
    }

    const bold = BOLD.exec(rest);
    if (bold) {
      flush();
      out.push(...inline(bold[1]!, [...carried, { type: 'bold' }]));
      index += bold[0].length;
      continue;
    }

    const italic = ITALIC.exec(rest);
    if (italic) {
      flush();
      out.push(...inline(italic[1]!, [...carried, { type: 'italic' }]));
      index += italic[0].length;
      continue;
    }

    buffer += text[index];
    index += 1;
  }

  flush();
  return out;
}

/** A paragraph holding whatever the inline pass produced — or nothing, for a blank line. */
function paragraph(text: string): Block {
  const content = inline(text);
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-+]\s+(.*)$/;
/** `* ` is a bullet only when a space follows; `*italic*` has none, so it stays inline prose. */
const STAR_BULLET = /^\s*\*\s+(.*)$/;
const ORDERED = /^\s*\d+\.\s+(.*)$/;

export function markdownToDoc(markdown: string): Record<string, unknown> {
  const lines = markdown.split('\n');
  const content: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.trim() === '') {
      content.push({ type: 'paragraph' });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const inner = inline(heading[2]!);
      content.push({ type: 'heading', attrs: { level: heading[1]!.length }, ...(inner.length > 0 ? { content: inner } : {}) });
      index += 1;
      continue;
    }

    const ordered = ORDERED.test(line);
    const bulleted = !ordered && (BULLET.test(line) || STAR_BULLET.test(line));
    if (ordered || bulleted) {
      const pattern = ordered ? ORDERED : BULLET;
      const fallback = ordered ? null : STAR_BULLET;
      const items: Block[] = [];
      // Consecutive lines only. A blank line ends the list rather than being
      // swallowed into an empty item.
      while (index < lines.length) {
        const match = pattern.exec(lines[index]!) ?? fallback?.exec(lines[index]!) ?? null;
        if (!match) break;
        items.push({ type: 'listItem', content: [paragraph(match[1]!)] });
        index += 1;
      }
      content.push({ type: ordered ? 'orderedList' : 'bulletList', content: items });
      continue;
    }

    content.push(paragraph(line));
    index += 1;
  }

  return { type: 'doc', content };
}
