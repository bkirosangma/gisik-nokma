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
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'packages/app-core/src/help/content.generated.ts';

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
    if (line.trim() === '') {
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
}

if (import.meta.url === `file://${process.argv[1]}`) main();
