import { getSchema } from '@tiptap/core';
import { DOMSerializer, Node as PMNode } from '@tiptap/pm/model';
import MarkdownIt from 'markdown-it';
import { buildEditorExtensions } from '../schema/extensions.js';

/**
 * Markdown in and out (spec §8.6), ported from the knowledge-base app's
 * `extensions/markdownSerializer.ts`.
 *
 * ## WHAT THE PORT DROPPED, AND WHY IT IS NAMED RATHER THAN SILENT
 *
 * **`data-raw-block`.** The source has two branches and two cases for it, and
 * they exist because that editor has a raw/revealed mode where a block's text
 * IS markdown syntax. Spec §8.7 lists `rawBlock` and `rawSyntaxEngine` among
 * the things this port does NOT bring over, so the branches are gone with the
 * feature. A block whose text happens to look like markdown is, here, simply a
 * block whose text looks like markdown.
 *
 * **The wiki-link form is re-keyed.** The source's `wiki-link` span carries a
 * vault PATH plus an optional `#section` and a `|display` alias, because a
 * knowledge base addresses a file. A note is addressed by an ID that markdown
 * has no syntax for, so the port emits and accepts the TITLE:
 * `<a data-note-id title>` ↔ `[[title]]`. The consequence is stated where it
 * bites rather than left to be discovered — see `markdownToHtml` below.
 *
 * **`details`/`summary` is ADDED**, because the source had no collapsibles.
 * Spec §8.4 names the exact form and the test pins it in both directions.
 */

const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

/** A note node's own attribute names, used in both directions. */
const NOTE_ID = 'data-note-id';
const NOTE_TITLE = 'data-note-title';

/**
 * The paste-in heuristic (spec §8.6, case 9.284): does this plain text look
 * like Markdown at all?
 *
 * A LINE-START test for the block forms and a containment test for the two
 * inline ones. The line-start anchor is the whole of the discrimination and is
 * why `10 * 3` is prose while `* a` is a list: `*` anywhere is what the
 * mutation gets wrong, and it would turn every sentence containing an asterisk
 * into a list.
 */
export function looksLikeMarkdown(text: string): boolean {
  return /^(#{1,6} |[-*] |\d+\. |> |```)/m.test(text) || /\*\*|\[\[/.test(text);
}

/**
 * Note markup is written as the literal bracketed title inside a span that
 * nothing claims, so a paste of `[[Cold room]]` arrives as the TEXT a person
 * typed. This is the "re-imports as plain text" half of spec §8.6's
 * round-trip note, and it is deliberate rather than a gap: markdown has no way
 * to spell a note id, so inventing one here (an `<a data-note-id="">`) would
 * produce a link to `/notes/` — a broken target dressed as a working one.
 */
function noteTextToHtml(title: string): string {
  // The DOUBLE QUOTE is escaped too, and leaving it out was a real defect: an
  // unescaped `"` closes the attribute mid-value, markdown-it writes the span
  // out as literal TEXT, and the document reads
  // `see <span data-note-title-text="He said "hi" now">…` — the words survive
  // and the text is dirtied.
  const escaped = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<span data-note-title-text="${escaped}">[[${escaped}]]</span>`;
}

/** Tiptap HTML → markdown. */
export function htmlToMarkdown(html: string): string {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  return nodeToMarkdown(dom.body).trim();
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(nodeToMarkdown).join('');

  switch (tag) {
    case 'h1': return `# ${children}\n\n`;
    case 'h2': return `## ${children}\n\n`;
    case 'h3': return `### ${children}\n\n`;
    case 'h4': return `#### ${children}\n\n`;
    case 'h5': return `##### ${children}\n\n`;
    case 'h6': return `###### ${children}\n\n`;
    case 'p': return `${children}\n\n`;
    case 'strong': case 'b': return `**${children}**`;
    case 'em': case 'i': return `*${children}*`;
    case 's': case 'del': return `~~${children}~~`;
    case 'code': {
      if (el.parentElement?.tagName.toLowerCase() === 'pre') return children;
      return `\`${children}\``;
    }
    case 'pre': {
      const lang = el.querySelector('code')?.className?.replace('language-', '') ?? '';
      const code = (el.querySelector('code')?.textContent ?? children).replace(/\n+$/, '');
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }
    case 'blockquote':
      // A BLANK LINE IS THE SEPARATOR BETWEEN TWO PARAGRAPHS IN A QUOTE, so
      // dropping it (`filter(Boolean)`, the first cut) merged them into one.
      // An empty line becomes a bare `>`, which is what markdown uses for a
      // blank line inside a quote.
      return (
        children
          .replace(/\n+$/, '')
          .split('\n')
          .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
          .join('\n') + '\n\n'
      );
    case 'ul': return `${children}\n`;
    case 'ol': return `${children}\n`;
    case 'li': {
      const parent = el.parentElement?.tagName.toLowerCase();
      const index = el.parentElement === null ? 0 : Array.from(el.parentElement.children).indexOf(el);
      const prefix = parent === 'ol' ? `${index + 1}. ` : '- ';
      // A PARAGRAPH IS UNWRAPPED TO ITS INLINE MARKDOWN, and this is a
      // divergence from the source that a measurement forced. The source's
      // cases feed it hand-written `<li>a</li>`, which has no block child; the
      // CLIPBOARD path feeds it what `DOMSerializer` produces from the schema,
      // which is `<li><p>a</p></li>` — and the `p` case appends `\n\n` for
      // block context, so every pair of items came out separated by two blank
      // lines. The task item's own `div` wrapper is unwrapped for the same
      // reason. A nested LIST inside an item is not handled -- the source did
      // not handle it either, and it is not reachable from this plan's cases.
      let sawNestedList = false;
      const inner = Array.from(el.childNodes)
        .map((child) => {
          if (child.nodeType !== Node.ELEMENT_NODE) return nodeToMarkdown(child);
          const childTag = (child as HTMLElement).tagName.toLowerCase();
          if (childTag === 'p' || childTag === 'div') {
            const text = Array.from(child.childNodes)
              .map(nodeToMarkdown)
              .join('')
              .replace(/\n+$/, '');
            // A BLOCK AFTER A NESTED LIST IS ITS OWN, INDENTED PARAGRAPH.
            // Without this its text ran on from the nested item's line —
            // `- a\n  - bc` — gluing it into the child. Reachable in two
            // keystrokes: Enter at the end of a nested item, then Enter again
            // on the empty paragraph, which lifts it to the parent item.
            return sawNestedList ? `\n\n  ${text}` : text;
          }
          if (childTag === 'ul' || childTag === 'ol') {
            sawNestedList = true;
            // A NESTED LIST IS INDENTED UNDER ITS PARENT ITEM. Without this the
            // child's markdown ran straight on from the parent's text — `- a- b`
            // — gluing the child's words into the parent's and turning its
            // marker into prose. Reachable from the UI: StarterKit ships
            // ListKeymap and Tab runs `sinkListItem`.
            const nested = nodeToMarkdown(child).replace(/\n+$/, '');
            return `\n${nested.split('\n').map((line) => `  ${line}`).join('\n')}`;
          }
          return nodeToMarkdown(child);
        })
        .join('')
        // The task item's checkbox contributes no text but IS followed by a
        // space in the HTML `markdownToHtml` writes, so the leading run has to
        // go or the marker gains a second space on every round trip.
        .replace(/^\s+/, '')
        .replace(/\n+$/, '');
      const checkbox = el.querySelector('input[type=checkbox]');
      if (checkbox !== null) {
        const checked = (checkbox as HTMLInputElement).checked;
        return `${prefix}[${checked ? 'x' : ' '}] ${inner}\n`;
      }
      return `${prefix}${inner}\n`;
    }
    case 'hr': return '---\n\n';
    case 'br': return '\n';
    case 'a': {
      // A NOTE LINK IS CHECKED FIRST, and it has to be: the node renders as an
      // `<a>`, so the generic link branch below would turn it into
      // `[Cold room](/notes/n1)` — a markdown link to an id, which is not what
      // the form means and which a paste would bring back as a plain URL.
      const noteId = el.getAttribute(NOTE_ID);
      if (noteId !== null) return `[[${el.getAttribute(NOTE_TITLE) ?? el.textContent ?? noteId}]]`;
      return `[${children}](${el.getAttribute('href') ?? ''})`;
    }
    case 'img': {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      return `![${alt}](${src})`;
    }
    case 'span': {
      // The MISSING pill — the same node, rendered as a span when the resolver
      // said the target was gone. It exports the same `[[title]]`.
      const noteId = el.getAttribute(NOTE_ID);
      if (noteId !== null) return `[[${el.getAttribute(NOTE_TITLE) ?? el.textContent ?? noteId}]]`;
      return children;
    }
    case 'details': {
      // Spec §8.4's exact form: `<details open>\n<summary>T</summary>\n\nbody\n\n</details>`.
      // The raw HTML passes through `markdownToHtml` unchanged because
      // markdown-it runs with `html: true`.
      const open = el.hasAttribute('open') ? ' open' : '';
      const summary = el.querySelector('summary');
      const summaryMd = summary === null ? '' : Array.from(summary.childNodes).map(nodeToMarkdown).join('');
      const body = Array.from(el.childNodes)
        .filter((child) => child !== summary)
        .map(nodeToMarkdown)
        .join('')
        .trim();
      return `<details${open}>\n<summary>${summaryMd}</summary>\n\n${body}\n\n</details>\n\n`;
    }
    case 'summary': return children;
    case 'table': return `${tableToMarkdown(el)}\n\n`;
    case 'div': return children;
    default: return children;
  }
}

/**
 * One table cell, on one line between `|` delimiters. Block-level output is not
 * available here, so paragraph children are unwrapped to their inline markdown,
 * several of them are joined with `<br>` (GFM accepts it as a soft break in a
 * cell and `markdown-it` round-trips it back to a hard break), and a literal
 * `|` is escaped so user content cannot split the row.
 */
function cellToMarkdown(cell: HTMLElement): string {
  const parts: string[] = [];
  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent ?? '').trim();
      if (t !== '') parts.push(t);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'p') {
      // Walk the INLINE children so marks survive; trim drops the `\n\n` the
      // `p` case appends for block context.
      const inner = Array.from(el.childNodes).map(nodeToMarkdown).join('').trim();
      if (inner !== '') parts.push(inner);
      continue;
    }
    // Anything else a user might drop into a cell (a heading, a quote) is
    // inlined; markdown tables cannot represent block-level cell content, so
    // this is a best-effort round trip and the block prefix survives as text.
    const rendered = nodeToMarkdown(el).trim();
    if (rendered !== '') parts.push(rendered);
  }
  return parts.join('<br>').replace(/\|/g, '\\|');
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';
  const lines: string[] = [];
  rows.forEach((row, i) => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    lines.push('| ' + cells.map((c) => cellToMarkdown(c as HTMLElement)).join(' | ') + ' |');
    if (i === 0) lines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
  });
  return lines.join('\n');
}

/** Markdown → HTML for the editor to consume. */
export function markdownToHtml(markdown: string): string {
  // Note markup is replaced BEFORE markdown-it sees it, so the brackets cannot
  // be read as a link. The replacement is the inert span described at
  // `noteTextToHtml` — the text survives, the note id is not invented.
  let processed = markdown.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_match, title: string, alias?: string) =>
    noteTextToHtml((alias ?? title).trim()),
  );

  // Collapse blank lines between table rows so markdown-it recognises a table.
  while (processed.includes('|\n\n|')) {
    processed = processed.replace(/\|\n\n\|/g, '|\n|');
  }

  // Task-list markers become the disabled-checkbox shape BEFORE markdown-it
  // turns them into ordinary list items — that is the shape `htmlToMarkdown`
  // reverses, so the two halves agree and the pair round-trips bit-for-bit.
  processed = processed.replace(/^(\s*)- \[x\]\s+/gm, '$1- <input type="checkbox" checked disabled> ');
  processed = processed.replace(/^(\s*)- \[ \]\s+/gm, '$1- <input type="checkbox" disabled> ');

  return md.render(processed);
}

/**
 * A whole document as Markdown (spec §8.6's `exportMarkdown`), for the Notes
 * page's "Copy as Markdown".
 *
 * The document is rendered through THE EDITOR'S OWN SCHEMA rather than through
 * a hand-written walk: `DOMSerializer.fromSchema` produces exactly the HTML
 * `getJSON` would round-trip, so an export can never disagree with what the
 * editor shows, and a new node type is exported the moment it has a
 * `renderHTML` — no second place to remember.
 *
 * Total, like every other reader of stored JSON in this package: anything that
 * is not a document, or anything the schema refuses, yields `''` rather than a
 * throw. The schema is built once and kept — `getSchema` walks the whole
 * extension list, and an export is not the place to pay for that per call.
 */
let cachedSchema: ReturnType<typeof getSchema> | null = null;

export function exportMarkdown(doc: unknown): string {
  if (doc === null || typeof doc !== 'object' || (doc as { type?: unknown }).type !== 'doc') return '';
  try {
    cachedSchema ??= getSchema(buildEditorExtensions());
    const node = PMNode.fromJSON(cachedSchema, doc);
    const serializer = DOMSerializer.fromSchema(cachedSchema);
    const container = document.createElement('div');
    container.appendChild(serializer.serializeFragment(node.content));
    return htmlToMarkdown(container.innerHTML);
  } catch {
    // A document this schema cannot read is not an export, it is a bug
    // upstream — and a Notes page action that threw would take the page down
    // over one bad body.
    return '';
  }
}
