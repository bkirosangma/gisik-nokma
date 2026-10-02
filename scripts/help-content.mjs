#!/usr/bin/env node
/**
 * The in-app manual and FAQ: parse the two source documents into the block model
 * three renderers share, and refuse to let the generated copy go stale.
 *
 * Usage:
 *   node scripts/help-content.mjs            # regenerate the module
 *   node scripts/help-content.mjs --check    # fail if the module is out of date
 *
 * ## Why a build-time parse at all
 *
 * The owner's instruction was that the manual and FAQ be a real feature reachable
 * from the web app AND the native mobile and desktop apps. React Native cannot
 * render HTML, so the web's renderer can never be the phone's — which rules out
 * both obvious shortcuts (ship markdown and parse per platform; ship rendered
 * HTML). Parsing once into a closed set of block kinds is what lets one sentence
 * be drawn three ways without three parsers disagreeing about it.
 *
 * ## Why this is a script and not a module in `packages/app-core`
 *
 * The generated module lives in `app-core/src`, so a parser that also lived
 * there would have to be built before it could produce the file that is part of
 * what gets built. Putting the parser here breaks that circle without adding a
 * dependency: no markdown library, no `tsx` at the root, nothing to install.
 *
 * ## THE FRESHNESS GATE IS THE POINT, not a nicety
 *
 * A generated artifact with no check that it matches its source is a stale
 * artifact waiting to happen — and this one would go stale *silently*, showing
 * users an old manual while `docs/manual.md` said something else. That failure
 * has no symptom until somebody follows an instruction that stopped being true.
 *
 * This is also the base's own idea, applied to itself: *"the view is generated;
 * a freshness gate (`--check`) refuses a stale view."* It is one of the five
 * ideas the README still says this product is built on.
 *
 * ## AND THE PARSER SELF-TESTS AGAINST PLANTED DEFECTS
 *
 * Same convention as `check-runbook-commands.mjs`, and for the same reason: a
 * parser that reports "42 entries" tells you it ran, not that it was right. The
 * suite below feeds it inputs whose correct parse is known and inputs that are
 * deliberately broken, and `--check` refuses to certify the real content until
 * every one of them behaves. A gate whose own instrument is unverified is the
 * shape this repository keeps getting caught by.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'packages/app-core/src/help/content.generated.ts';
const BASELINE = 'scripts/help-quoted-strings-absent.json';

const SOURCES = [
  { id: 'manual', source: 'docs/manual.md' },
  { id: 'faq', source: 'docs/faq.md' },
];

// ── Inline spans ─────────────────────────────────────────────────────────────

/**
 * Split one line of markdown into spans.
 *
 * Ordered alternation, longest-marker-first: `**` must be tried before `*` or a
 * bold run is read as two italics wrapping the text. Links are matched before
 * emphasis so that emphasis *inside* a link label does not split the link.
 *
 * Anything unmatched stays literal text, which is the honest default: an
 * unsupported construct renders as the characters the author typed rather than
 * disappearing.
 */
export function parseInline(line) {
  const spans = [];
  let rest = line;
  const pattern =
    /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|_([^_]+)_/;
  for (;;) {
    const m = pattern.exec(rest);
    if (m === null) break;
    if (m.index > 0) spans.push({ kind: 'text', text: rest.slice(0, m.index) });
    if (m[1] !== undefined) spans.push({ kind: 'link', text: m[1], href: m[2] });
    else if (m[3] !== undefined) spans.push({ kind: 'bold', text: m[3] });
    else if (m[4] !== undefined) spans.push({ kind: 'italic', text: m[4] });
    else if (m[5] !== undefined) spans.push({ kind: 'code', text: m[5] });
    else spans.push({ kind: 'italic', text: m[6] });
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest.length > 0) spans.push({ kind: 'text', text: rest });
  return spans;
}

// ── Blocks ───────────────────────────────────────────────────────────────────

const isHeading = (l) => /^#{1,6} /.test(l);
const isBullet = (l) => /^[-*] /.test(l);
const isOrdered = (l) => /^\d+\. /.test(l);
const isListItem = (l) => isBullet(l) || isOrdered(l);
const isQuote = (l) => /^> ?/.test(l);
const isTableRow = (l) => /^\|/.test(l);
const isTableRule = (l) => /^\|[\s:|-]+\|?\s*$/.test(l);
/**
 * A markdown horizontal rule (`---`, `***`, `___`).
 *
 * Dropped rather than modelled. It is a VISUAL separator whose whole job — "a
 * new part starts here" — is already done by the section headings and their
 * spacing in every renderer. Without this it fell through to the paragraph
 * branch and rendered as a literal `---` on the page, which is exactly how it
 * was found: the real screen showed it between the manual's intro and its first
 * heading. A block model that carried it would oblige three renderers to draw a
 * line none of them needs.
 */
const isThematicBreak = (l) => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l);

/** Markdown's soft-wrap rule: lines inside one paragraph join with a space. */
const joinWrapped = (lines) => lines.map((l) => l.trim()).join(' ');

const splitRow = (line) =>
  line
    .replace(/^\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => parseInline(cell.trim()));

/**
 * Parse a run of body lines into blocks.
 *
 * Deliberately NOT recursive: a blockquote's spans are flattened, because
 * neither source document nests a list or a table inside one. If one ever does,
 * this refuses rather than silently flattening — see the throw below. A parser
 * that quietly drops structure is how a document says one thing on disk and
 * another on screen.
 */
export function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || isThematicBreak(line)) {
      i += 1;
      continue;
    }
    if (isListItem(line)) {
      // Ordered-ness is decided by the FIRST item and held for the run, so a
      // stray bullet inside a numbered sequence cannot silently renumber it.
      const ordered = isOrdered(line);
      const items = [];
      while (
        i < lines.length &&
        (isListItem(lines[i]) || /^\s+\S/.test(lines[i] ?? '')) &&
        (!isListItem(lines[i]) || isOrdered(lines[i]) === ordered)
      ) {
        if (isListItem(lines[i])) items.push([lines[i].replace(/^(?:[-*]|\d+\.) /, '')]);
        else if (items.length > 0) items[items.length - 1].push(lines[i]);
        i += 1;
      }
      blocks.push({ kind: 'list', ordered, items: items.map((l) => parseInline(joinWrapped(l))) });
      continue;
    }
    if (isQuote(line)) {
      const buf = [];
      while (i < lines.length && isQuote(lines[i])) {
        const inner = lines[i].replace(/^> ?/, '');
        if (isListItem(inner) || isTableRow(inner)) {
          throw new Error(
            `blockquote contains a ${isListItem(inner) ? 'list' : 'table'}, which HelpBlock['quote'] cannot carry: ${inner.slice(0, 60)}`,
          );
        }
        buf.push(inner);
        i += 1;
      }
      // A quote's own heading marker is emphasis, not structure: `> ### Note`
      // becomes bold text rather than a heading that would break the section
      // model open.
      const text = joinWrapped(buf.map((l) => l.replace(/^#{1,6} /, '')));
      blocks.push({ kind: 'quote', spans: parseInline(text) });
      continue;
    }
    if (isTableRow(line)) {
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        if (!isTableRule(lines[i])) rows.push(splitRow(lines[i]));
        i += 1;
      }
      const [head, ...body] = rows;
      blocks.push({ kind: 'table', head: head ?? [], rows: body });
      continue;
    }
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isHeading(lines[i]) &&
      !isListItem(lines[i]) &&
      !isQuote(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    if (buf.length > 0) blocks.push({ kind: 'paragraph', spans: parseInline(joinWrapped(buf)) });
  }
  return blocks;
}

// ── Documents ────────────────────────────────────────────────────────────────

export function slug(text, taken) {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section';
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  // Suffix rather than overwrite: two entries with the same title are a real
  // possibility across sixteen sections, and a collision that silently reused an
  // id would make one of them unreachable by deep link.
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/**
 * The manual: `##` sections, `###` entries.
 * The FAQ: `##` sections, and each **bold line on its own** is a question.
 *
 * Both flatten to the same section/entry shape, because that is the granularity
 * search returns and a deep link addresses — not because the two documents are
 * shaped alike in markdown. They are not.
 */
export function parseDocument({ id, source }, text) {
  const lines = text.split('\n');
  const taken = new Set();
  let title = id;
  const sections = [];

  const isQuestion = (l) => /^\*\*.+\*\*\s*$/.test(l.trim());
  const pushEntry = (section, entryTitle, body) => {
    if (entryTitle === null) {
      section.intro.push(...parseBlocks(body));
      return;
    }
    section.entries.push({
      id: slug(entryTitle, taken),
      title: entryTitle,
      blocks: parseBlocks(body),
    });
  };

  let section = null;
  let entryTitle = null;
  let body = [];
  const intro = [];
  /**
   * Body before the first `##` belongs to the DOCUMENT, not to nowhere.
   *
   * The first version of this dropped it on the floor — `section` is null until
   * a `##` arrives, and `pushEntry` was guarded on `section !== null`, so the
   * manual's whole opening vanished without any error. It was found by measuring
   * how much of the source survived the parse rather than by reading the output,
   * which looked perfectly plausible with a fifth of a page missing from it.
   */
  const flush = () => {
    if (section !== null) pushEntry(section, entryTitle, body);
    else intro.push(...parseBlocks(body));
    body = [];
  };

  for (const line of lines) {
    const h = /^(#{1,3}) (.+)$/.exec(line);
    if (h !== null && h[1].length === 1) {
      title = h[2].trim();
      continue;
    }
    if (h !== null && h[1].length === 2) {
      flush();
      entryTitle = null;
      section = { id: slug(h[2].trim(), taken), title: h[2].trim(), intro: [], entries: [] };
      sections.push(section);
      continue;
    }
    if (h !== null && h[1].length === 3 && section !== null) {
      flush();
      entryTitle = h[2].trim();
      continue;
    }
    // A bold line alone is a FAQ question. Only in the FAQ: the manual uses the
    // same shape mid-paragraph for emphasis, and treating those as headings
    // would shred it into hundreds of one-line entries.
    if (id === 'faq' && isQuestion(line) && section !== null) {
      flush();
      entryTitle = line.trim().replace(/^\*\*|\*\*$/g, '');
      continue;
    }
    body.push(line);
  }
  flush();

  return { id, title, source, intro, sections: sections.filter((s) => s.intro.length > 0 || s.entries.length > 0) };
}

export function buildContent(readFile) {
  return SOURCES.map((spec) => parseDocument(spec, readFile(spec.source)));
}

// ── Emit ─────────────────────────────────────────────────────────────────────

export function render(content) {
  return `// GENERATED by scripts/help-content.mjs from ${SOURCES.map((s) => s.source).join(' and ')}.
// Do not hand-edit — \`pnpm check:help\` fails when this file and those documents
// disagree, and it is regenerated with:
//   node scripts/help-content.mjs
//
// The manual and FAQ are a FEATURE of this product, not files in a repository:
// this module is what the web, mobile and desktop apps all render from, so one
// sentence cannot say different things on different screens.
import type { HelpContent } from './types.js';

export const HELP_CONTENT: HelpContent = ${JSON.stringify(content, null, 2)} as const;
`;
}

// ── THE SECOND PROPERTY: is any of this TRUE OF THE PRODUCT? ─────────────────
//
// WHAT THIS IS FOR. `--check` above verifies that the generated module matches
// its sources. It cannot fail on whether either document is true of the build,
// so the corpus can drift arbitrarily far from the product and the gate stays
// green by construction. F2 (2026-09-21) is the finding; F1 is eight rows of the
// drift it permits, all of which passed this gate.
//
// WHAT IT CAN CHECK, MEASURED BEFORE WRITING IT. Not the general claim — no
// instrument can decide whether prose describes the product — but the part that
// is a literal: a string the help puts in front of a person. **Population
// measured at 2026-09-21: 130 quoted strings in `docs/manual.md`, 96 in
// `docs/faq.md`, 226 in all, and ZERO absent from `apps/` + `packages/`.** So it
// ships green and ratchets from there.
//
// WHY QUOTES AND NOT BACKTICKS — measured, not assumed, and it corrects the
// remedy's own wording. The review says "every back-ticked control name".
// `docs/manual.md` contains EIGHT backticks in total and three distinct tokens
// (`2026-08-30`, `Mark N read`, `/settings`); a rule built on them would have a
// population of three. The manual names its controls and product strings in
// DOUBLE QUOTES, and that is what is swept below.
//
// WHAT IT DOES NOT CATCH — named, not implied, and this one was MEASURED
// against the very rows the remedy names. It would not have caught F1. Run
// against the pre-F1 manual (at `e33b7b8a^`) with today's product: 127 spans,
// zero absent — because F1's drift was BOLD names and prose describing where a
// control sits ("use the **Sign out** button on the right of the bar"), and
// `Sign out` still exists in the product, one menu deeper. **A string can be
// present and the sentence about it still false.** That gap is real and stays
// open; this closes the half that is a literal.

/**
 * A double-quoted span, which may WRAP onto the next line once (U-T11b, 2026-10-02). The first version
 * matched `"[^"\n]+"`, so a quotation that the document's own line width broke in two was never looked
 * up in the product: reviewer B's probe found 14 such strings absent from the product, four of them
 * U-T11 copy a reader sees in /help. ONE newline, not any number: a stray `"` (an inch mark, an
 * unclosed quote) would otherwise pair with a distant one and swallow a paragraph.
 */
const QUOTED_SPAN = /"[^"\n]+(?:\n[^"\n]+)?"/g;
/** The seam of a wrapped span: the newline, the indent or `>` of the continuation line, and the padding either side. */
const WRAP_JOINT = /[ \t]*\n[ \t>]*/g;

/**
 * Every string a help document puts in double quotes, deduped. A span wrapped over two lines is joined
 * with ONE space, so it is compared as the person reads it.
 *
 * A span whose CONTENT carries `*` is dropped: those are artefacts of emphasis
 * beside a quotation mark, not product strings, and two of them are in the
 * manual today. A span that is italic-WRAPPED (`*"…"*`) is NOT dropped — the
 * asterisks sit outside the quotes, and the sentence inside is a real string.
 */
export function quotedSpans(text) {
  return [
    ...new Set(
      (text.match(QUOTED_SPAN) ?? [])
        .map((s) => s.slice(1, -1).replace(WRAP_JOINT, ' '))
        .filter((s) => !s.includes('*') && !s.includes('`')),
    ),
  ];
}

const PRODUCT_DIRS = ['apps', 'packages'];
const PRODUCT_EXT = /\.(ts|tsx|js|jsx|mjs|css|json|md)$/;
const PRODUCT_SKIP = new Set(['node_modules', '.next', 'dist', 'coverage', '.turbo']);

/**
 * The haystack, and the ONE FILE THAT MUST NOT BE IN IT.
 *
 * `packages/app-core/src/help/content.generated.ts` is a COPY OF THE CORPUS —
 * it is what this script writes from the two documents. Left in, every string
 * the manual quotes is "found in the product" inside the manual's own generated
 * copy, and the check cannot fail for any string the corpus currently contains.
 *
 * **That is not a hypothesis: it is the first version of this check, and it was
 * caught only by running the mutation below.** A quoted string that no product
 * file contains was appended to `manual.md`, the generated copy was regenerated
 * so the freshness half was satisfied, and the gate printed `EXIT=0`. A check
 * whose haystack contains the thing it is checking is the defect class this
 * whole batch exists for, so the exclusion is stated here by name.
 */
const GENERATED_COPY = 'packages/app-core/src/help/content.generated.ts';

/**
 * Source text with its COMMENTS removed (U-T11b addendum, reviewer B 13:18).
 *
 * The haystack used to include every comment, so a docblock that quoted a string once
 * (`rollup-text.ts`: "5 of 8 done · 2 restricted") satisfied a manual heading that quotes it
 * still, long after the product changed to a comma: a comment is not something a person
 * reads in the product. Measured on the tree at 4f86b959: 13 quoted strings were found ONLY
 * in comments.
 *
 * A single pass over code / '…' / "…" / `…` / `//` / `/* *​/`. JSX text is "code", so an
 * apostrophe in it (`can't`) would open a string that never closes: a quote that meets a
 * newline ends, which bounds that mistake to its own line (a template literal is the one
 * string that may span lines, and is exempt from the rule). `lineComments` is false for
 * CSS, where `//` is an ordinary character in a url.
 *
 * @param {string} text
 * @param {{lineComments?: boolean}} [options]
 * @returns {string}
 */
export function stripComments(text, { lineComments = true } = {}) {
  if (!text.includes('/')) return text;
  const tokens = lineComments ? COMMENT_TOKENS : BLOCK_COMMENT_TOKENS;
  return text.replace(tokens, (token) => {
    if (token.startsWith('/*')) return ' ';
    if (token.startsWith('//')) return '';
    return token;
  });
}

// One native pass instead of a character loop (the loop added ~3 s to a tree walk of ~10 000 files). Strings are
// matched so a `//` or `/*` inside one is text; a '…' or "…" that meets a newline ends there; a `…` may span lines.
const COMMENT_TOKENS =
  /\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\[\s\S]|[^`\\])*`?/g;
const BLOCK_COMMENT_TOKENS = /\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\[\s\S]|[^`\\])*`?/g;

const COMMENTED_EXT = /\.(ts|tsx|js|jsx|mjs|css)$/;

/**
 * Every product file's text, joined — the haystack a quoted string is looked for in.
 * Comments are removed from source and stylesheets (see `stripComments`); JSON and
 * Markdown are read whole.
 *
 * @param {string} root
 * @returns {string}
 */
export function productText(root) {
  const parts = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (PRODUCT_SKIP.has(entry.name)) continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (PRODUCT_EXT.test(entry.name) && !p.endsWith(GENERATED_COPY)) {
        const raw = readFileSync(p, 'utf8');
        parts.push(COMMENTED_EXT.test(entry.name) ? stripComments(raw, { lineComments: !entry.name.endsWith('.css') }) : raw);
      }
    }
  };
  for (const dir of PRODUCT_DIRS) walk(join(root, dir));
  return parts.join('\n');
}

/**
 * THE RULE, AND WHY IT IS A RATCHET RATHER THAN THE OBVIOUS ASSERTION.
 *
 * The obvious rule — every quoted string must exist in the product — was
 * measured before it was written, and it is FALSE of this corpus: of 226 quoted
 * strings, 74 are legitimately absent. They are the manual's worked examples
 * (`"Marak Design"`, `"Fix Mrs. Patel's leaking pipe."`), its illustrative
 * labels (`"3 of 5 done"`), and its paraphrases of what a screen says
 * (`"you don't have permission"`). Asserting the obvious rule would have put 74
 * false failures on the gate, which is how a check earns the right to be
 * ignored.
 *
 * So the baseline IS THE MEASUREMENT: the 74 strings that were absent when this
 * landed, recorded in `<baseline>` as absent rather than as "not a product
 * string" — a reviewer can challenge any one of them, and the file says so. The
 * check then fails in BOTH directions, like the case-citation ratchet:
 *
 *   * a quoted string absent from the product and NOT in the baseline — the
 *     corpus now says something the product does not, which is the drift F2 is
 *     about;
 *   * a baselined string the product NOW contains — the baseline has rotted and
 *     the entry must be deleted, so it cannot quietly become a blanket
 *     permission.
 *
 * @returns {{checked: number, undeclared: {source: string, span: string}[], resolved: string[]}}
 */
export function compareAbsent({ documents, product, baseline }) {
  const undeclared = [];
  const absentNow = new Set();
  let checked = 0;
  for (const doc of documents) {
    for (const span of quotedSpans(doc.text)) {
      checked += 1;
      if (product.includes(span)) continue;
      absentNow.add(span);
      if (!baseline.absent.includes(span)) undeclared.push({ source: doc.source, span });
    }
  }
  const resolved = baseline.absent.filter((s) => !absentNow.has(s)).sort();
  return { checked, undeclared, resolved };
}

// ── The self-test, run before any --check certifies anything ─────────────────

const CASES = [
  {
    name: 'bold before italic, so ** is never read as two *',
    run: () => {
      const spans = parseInline('a **bold** and *italic* and `code`');
      return (
        spans.length === 6 &&
        spans[1].kind === 'bold' &&
        spans[1].text === 'bold' &&
        spans[3].kind === 'italic' &&
        spans[5].kind === 'code'
      );
    },
  },
  {
    name: 'a link keeps its href and does not split on emphasis inside the label',
    run: () => {
      const spans = parseInline('see [the manual](docs/manual.md) now');
      return spans[1].kind === 'link' && spans[1].href === 'docs/manual.md' && spans[1].text === 'the manual';
    },
  },
  {
    name: 'soft-wrapped lines join into ONE paragraph with a space',
    run: () => {
      const blocks = parseBlocks(['one line', 'and its continuation']);
      return (
        blocks.length === 1 &&
        blocks[0].kind === 'paragraph' &&
        blocks[0].spans[0].text === 'one line and its continuation'
      );
    },
  },
  {
    name: 'PLANTED: a horizontal rule is DROPPED, not rendered as a literal ---',
    run: () => {
      const blocks = parseBlocks(['Before.', '', '---', '', 'After.']);
      return (
        blocks.length === 2 &&
        blocks.every((b) => b.kind === 'paragraph') &&
        blocks[0].spans[0].text === 'Before.' &&
        blocks[1].spans[0].text === 'After.'
      );
    },
  },
  {
    name: 'a bulleted item is not swallowed as a rule, and a rule is not read as a bullet',
    run: () => {
      const blocks = parseBlocks(['- an item', '- another']);
      return blocks.length === 1 && blocks[0].kind === 'list' && blocks[0].items.length === 2;
    },
  },
  {
    name: 'PLANTED: numbered steps become an ORDERED list, not run-on prose',
    run: () => {
      const blocks = parseBlocks(['1. Open the app.', '2. Press Send.', '3. Wait.']);
      return (
        blocks.length === 1 &&
        blocks[0].kind === 'list' &&
        blocks[0].ordered === true &&
        blocks[0].items.length === 3 &&
        blocks[0].items[1][0].text === 'Press Send.'
      );
    },
  },
  {
    name: 'a bulleted list is NOT marked ordered, and does not merge with a numbered one',
    run: () => {
      const blocks = parseBlocks(['- one', '- two', '', '1. first', '2. second']);
      return (
        blocks.length === 2 &&
        blocks[0].ordered === false &&
        blocks[0].items.length === 2 &&
        blocks[1].ordered === true &&
        blocks[1].items.length === 2
      );
    },
  },
  {
    name: 'a table drops its rule row and keeps head and body separate',
    run: () => {
      const blocks = parseBlocks(['| a | b |', '|---|---|', '| 1 | 2 |']);
      return (
        blocks.length === 1 &&
        blocks[0].kind === 'table' &&
        blocks[0].head.length === 2 &&
        blocks[0].rows.length === 1 &&
        blocks[0].rows[0][1][0].text === '2'
      );
    },
  },
  {
    name: 'PLANTED: a list inside a blockquote is REFUSED, not silently flattened',
    run: () => {
      try {
        parseBlocks(['> - an item']);
        return false;
      } catch {
        return true;
      }
    },
  },
  {
    name: 'PLANTED: a duplicate title gets a distinct id rather than overwriting one',
    run: () => {
      const taken = new Set();
      return slug('Signing in', taken) === 'signing-in' && slug('Signing in', taken) === 'signing-in-2';
    },
  },
  {
    name: 'a quoted string absent from the product is reported ONLY when it is undeclared',
    run: () => {
      const documents = [
        { id: 'd', source: 'docs/d.md', text: 'Press "Sign out", or "No such thing".' },
      ];
      const { undeclared, checked, resolved } = compareAbsent({
        documents,
        product: 'Sign out',
        baseline: { absent: ['No such thing'] },
      });
      // Declared absent -> silent. The same call with an EMPTY baseline must
      // report it, or this case would pass under a rule that never fires.
      const bare = compareAbsent({ documents, product: 'Sign out', baseline: { absent: [] } });
      return (
        checked === 2 &&
        undeclared.length === 0 &&
        resolved.length === 0 &&
        bare.undeclared.length === 1 &&
        bare.undeclared[0].span === 'No such thing'
      );
    },
  },
  {
    name: 'PLANTED: a baselined absence the product NOW contains is a STALE entry, and reported',
    run: () => {
      // The ratchet's other direction, and the one that stops the baseline
      // becoming a blanket permission: an entry that no longer describes
      // anything must be deleted, not left for the next absence to hide behind.
      const documents = [{ id: 'd', source: 'docs/d.md', text: 'Press "Sign out".' }];
      const { undeclared, resolved } = compareAbsent({
        documents,
        product: 'Sign out',
        baseline: { absent: ['Sign out', 'a string nobody quotes any more'] },
      });
      return undeclared.length === 0 && resolved.length === 2;
    },
  },
  {
    name: 'PLANTED: an emphasis ARTEFACT beside a quote is not read as a product string',
    run: () => {
      // The content carries `*`, so it is a fragment of emphasis and not a
      // string anyone put in the product. Two of these are live in the manual,
      // and treating them as claims would redden the gate on prose.
      return quotedSpans('a " — an epic * is real work" b').length === 0;
    },
  },
  {
    name: 'PLANTED: a quote WRAPPED over two lines is still checked; a wrapped CORRECT one stays green',
    run: () => {
      // U-T11b. The stale quote wraps exactly as the manual's do; before the fix it matched no span at all.
      const stale = [{ id: 'd', source: 'docs/d.md', text: 'It says "No such\nthing here" now.' }];
      const right = [{ id: 'd', source: 'docs/d.md', text: 'It says "Sign\n  out" now.' }];
      const bare = { absent: [] };
      const a = compareAbsent({ documents: stale, product: 'Sign out', baseline: bare });
      const b = compareAbsent({ documents: right, product: 'Sign out', baseline: bare });
      // The bound: ONE newline. A stray quote must not pair with one a paragraph away.
      const stray = quotedSpans('a "stray\n\nb" c');
      return (
        a.undeclared.length === 1 &&
        a.undeclared[0].span === 'No such thing here' &&
        b.checked === 1 &&
        b.undeclared.length === 0 &&
        stray.length === 0
      );
    },
  },
  {
    name: 'PLANTED: a stale quote that survives only inside a COMMENT is reported; the same text in a string stays found',
    run: () => {
      // U-T11b addendum. A docblock quoted the old "5 of 8 done · 2 restricted" and kept the stale manual heading green.
      const doc = [{ id: 'd', source: 'docs/d.md', text: 'It reads "5 of 8 done · 2 restricted" now.' }];
      const bare = { absent: [] };
      const commented = '/** "5 of 8 done · 2 restricted" */\nconst a = 1; // "5 of 8 done · 2 restricted"\n';
      const literal = "const a = '5 of 8 done · 2 restricted';\n";
      const red = compareAbsent({ documents: doc, product: stripComments(commented), baseline: bare });
      // CONTROL 1: the same text as a string literal is still the product's, so the red above is the comment being dropped.
      const green = compareAbsent({ documents: doc, product: stripComments(literal), baseline: bare });
      // CONTROL 2: `//` inside a string is text, and a JSX apostrophe does not swallow the line after it.
      const url = stripComments("const u = 'http://x'; // gone\n");
      const jsx = stripComments("<p>can't</p>\n/* gone */ const keep = 1;\n");
      return (
        red.undeclared.length === 1 &&
        green.undeclared.length === 0 &&
        url.includes('http://x') && !url.includes('gone') &&
        jsx.includes('const keep = 1;') && !jsx.includes('gone')
      );
    },
  },
  {
    name: 'PLANTED: prose before the first ## reaches the document intro, not the floor',
    run: () => {
      const doc = parseDocument(
        { id: 'manual', source: 'x' },
        '# Title\n\nOpening prose that belongs to nobody.\n\n## First\n\nBody.\n',
      );
      return (
        doc.intro.length === 1 &&
        doc.intro[0].spans[0].text === 'Opening prose that belongs to nobody.' &&
        doc.sections.length === 1
      );
    },
  },
  {
    name: 'a bold line is a QUESTION in the faq and ordinary emphasis in the manual',
    run: () => {
      const md = '# T\n\n## S\n\n**Is this a question?**\nYes.\n';
      const faq = parseDocument({ id: 'faq', source: 'x' }, md);
      const manual = parseDocument({ id: 'manual', source: 'x' }, md);
      return (
        faq.sections[0].entries.length === 1 &&
        faq.sections[0].entries[0].title === 'Is this a question?' &&
        manual.sections[0].entries.length === 0 &&
        manual.sections[0].intro.length > 0
      );
    },
  },
];

function selfTest() {
  const failed = CASES.filter((c) => {
    try {
      return c.run() !== true;
    } catch {
      return true;
    }
  });
  if (failed.length > 0) {
    console.error('help-content: SELF-TEST FAILED — the parser is not trustworthy, so nothing below it is:');
    for (const c of failed) console.error(`  - ${c.name}`);
    process.exit(1);
  }
  // Counted, not stated: this line used to hard-code "2 planted" and was wrong
  // within the hour of adding two more. A number in output is a claim.
  const planted = CASES.filter((c) => c.name.startsWith('PLANTED')).length;
  console.log(`help-content: self-test passed (${CASES.length} cases, ${planted} of them planted defects)`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

function main() {
  const check = process.argv.includes('--check');
  selfTest();

  const content = buildContent((rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8'));
  const rendered = render(content);
  const outPath = resolve(REPO_ROOT, OUT);

  const entries = content.reduce((n, d) => n + d.sections.reduce((m, s) => m + s.entries.length, 0), 0);
  const sections = content.reduce((n, d) => n + d.sections.length, 0);

  if (!check) {
    writeFileSync(outPath, rendered, 'utf8');
    console.log(`help-content: wrote ${OUT} — ${content.length} documents, ${sections} sections, ${entries} entries`);
    return;
  }

  let current = null;
  try {
    current = readFileSync(outPath, 'utf8');
  } catch {
    console.error(`help-content: ${OUT} does not exist. Run: node scripts/help-content.mjs`);
    process.exit(1);
  }
  if (current !== rendered) {
    console.error(
      `help-content: ${OUT} is STALE — it disagrees with ${SOURCES.map((s) => s.source).join(' / ')}.\n` +
        '  The apps render the generated module, so users would be reading the old text.\n' +
        '  Regenerate with: node scripts/help-content.mjs',
    );
    process.exit(1);
  }
  console.log(`help-content: ok (${content.length} documents, ${sections} sections, ${entries} entries, generated copy matches source)`);

  // ── AND IS ANY OF IT TRUE OF THE PRODUCT? See the block above the extractor.
  const baselinePath = resolve(REPO_ROOT, BASELINE);
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const { checked, undeclared, resolved } = compareAbsent({
    documents: SOURCES.map((s) => ({
      ...s,
      text: readFileSync(resolve(REPO_ROOT, s.source), 'utf8'),
    })),
    product: productText(REPO_ROOT),
    baseline,
  });

  if (undeclared.length > 0) {
    console.error(
      `help-content: ${undeclared.length} quoted string(s) in the help do NOT appear anywhere in ` +
        '`apps/` or `packages/`, and are not declared as known-absent in ' +
        `${BASELINE}. The document names something the product does not say, which is how a reader ` +
        'ends up following an instruction that stopped being true:',
    );
    for (const u of undeclared) console.error(`  ${u.source}: "${u.span}"`);
    console.error(
      '  Either the product lost the string (fix the document) or the document invented it (check the ' +
        'claim). If the absence is intended — a worked example, a paraphrase of a screen — declare it in ' +
        `${BASELINE} with that reason beside it.`,
    );
    process.exit(1);
  }
  if (resolved.length > 0) {
    console.error(
      `help-content: ${resolved.length} string(s) declared known-absent in ${BASELINE} are in the ` +
        'product NOW. The baseline has rotted: an entry that no longer describes anything is a permission ' +
        'nobody re-reads, and the next absence would hide behind it. Delete these:',
    );
    for (const s of resolved) console.error(`  "${s}"`);
    process.exit(1);
  }
  console.log(
    `help-content: ${checked} quoted string(s) checked against the product; ${
      baseline.absent.length
    } declared known-absent and still absent`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
