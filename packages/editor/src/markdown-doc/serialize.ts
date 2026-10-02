import { MarkdownSerializer, defaultMarkdownSerializer, type MarkdownSerializerState } from 'prosemirror-markdown';
import type { Node as PMNode } from '@tiptap/pm/model';
import { markdownSchema } from './schema.js';

/** Markdown for one node's inline content, through a fresh serializer (table cells need it as a string). */
function inlineOf(node: PMNode | null, lossy: Set<string>): string {
  if (node === null) return '';
  const schema = markdownSchema();
  const para = node.type.name === 'paragraph' ? node : schema.nodes.paragraph!.create(null, node.content);
  return serializer(lossy).serialize(schema.topNodeType.create(null, [para]), { tightLists: true }).trim();
}

function serializer(lossy: Set<string>): MarkdownSerializer {
  return new MarkdownSerializer(
    {
      paragraph(state, node) {
        state.renderInline(node);
        state.closeBlock(node);
      },
      heading(state, node) {
        state.write(`${'#'.repeat(Number(node.attrs['level']))} `);
        state.renderInline(node, false);
        state.closeBlock(node);
      },
      blockquote(state, node) {
        state.wrapBlock('> ', null, node, () => state.renderContent(node));
      },
      codeBlock(state, node) {
        const runs = node.textContent.match(/`{3,}/gm);
        const fence = runs ? `${[...runs].sort().slice(-1)[0]}\`` : '```';
        state.write(`${fence}${(node.attrs['language'] as string | null) ?? ''}\n`);
        state.text(node.textContent, false);
        state.write('\n');
        state.write(fence);
        state.closeBlock(node);
      },
      horizontalRule(state, node) {
        state.write('---');
        state.closeBlock(node);
      },
      bulletList(state, node) {
        state.renderList(node, '  ', () => '- ');
      },
      orderedList(state, node) {
        const start = Number(node.attrs['start'] ?? 1);
        const width = String(start + node.childCount - 1).length;
        state.renderList(node, ' '.repeat(width + 2), (i) => {
          const n = String(start + i);
          return `${' '.repeat(width - n.length)}${n}. `;
        });
      },
      listItem(state, node) {
        state.renderContent(node);
      },
      taskList(state, node) {
        state.renderList(node, '  ', (i) => `- [${node.child(i).attrs['checked'] === true ? 'x' : ' '}] `);
      },
      taskItem(state, node) {
        state.renderContent(node);
      },
      hardBreak(state, node, parent, index) {
        for (let i = index + 1; i < parent.childCount; i++) {
          if (parent.child(i).type !== node.type) {
            state.write('\\\n');
            return;
          }
        }
      },
      text(state, node) {
        state.text(node.text ?? '');
      },
      image(state, node) {
        if (node.attrs['wrap'] !== 'block') lossy.add('image.wrap');
        state.write(`![${state.esc(String(node.attrs['alt'] ?? ''))}](attachment:${String(node.attrs['attachmentId'])})`);
        state.closeBlock(node);
      },
      mention(state, node) {
        const label = String(node.attrs['label'] ?? '').replace(/[\]\n]/g, '');
        state.write(`@[${label}](user:${String(node.attrs['userId'])})`);
      },
      ticketRef(state, node) {
        const key = String(node.attrs['key'] ?? '');
        if (key === '') {
          lossy.add('ticketRef.key');
          state.text(String(node.attrs['title'] ?? ''));
        } else state.write(`[[${key}]]`);
      },
      wikiLink(state, node) {
        const title = String(node.attrs['title'] ?? '');
        state.write(`[[note:${title !== '' && !/[\]\n]/.test(title) ? title : String(node.attrs['noteId'])}]]`);
      },
      details(state, node) {
        state.write(node.attrs['open'] === true ? '<details open>' : '<details>');
        state.ensureNewLine();
        state.renderContent(node);
        state.write('</details>');
        state.closeBlock(node);
      },
      detailsSummary(state, node) {
        state.write('<summary>');
        state.renderInline(node);
        state.write('</summary>');
        state.closeBlock(node);
      },
      detailsContent(state, node) {
        state.renderContent(node);
      },
      table(state: MarkdownSerializerState, node) {
        const rows: string[][] = [];
        node.forEach((row, _offset, r) => {
          const cells: string[] = [];
          row.forEach((cell) => {
            if (r === 0 && cell.type.name !== 'tableHeader') lossy.add('table.header');
            if (Number(cell.attrs['colspan'] ?? 1) > 1 || Number(cell.attrs['rowspan'] ?? 1) > 1) lossy.add('table.span');
            const widths = cell.attrs['colwidth'];
            if (Array.isArray(widths) && widths.some((w) => typeof w === 'number' && w > 0)) lossy.add('table.colwidth');
            if (cell.childCount > 1) lossy.add('table.cell-blocks');
            cells.push(inlineOf(cell.firstChild, lossy).replace(/\|/g, '\\|').replace(/\n/g, ' '));
          });
          rows.push(cells);
        });
        const line = (cells: string[]): string => `| ${cells.join(' | ')} |`;
        rows.forEach((cells, i) => {
          state.write(line(cells));
          state.ensureNewLine();
          if (i === 0) {
            state.write(line(cells.map(() => '---')));
            state.ensureNewLine();
          }
        });
        state.closeBlock(node);
      },
      tableRow() {},
      tableHeader() {},
      tableCell() {},
    },
    {
      italic: defaultMarkdownSerializer.marks['em']!,
      bold: defaultMarkdownSerializer.marks['strong']!,
      code: defaultMarkdownSerializer.marks['code']!,
      link: defaultMarkdownSerializer.marks['link']!,
      strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    },
  );
}

/** Schema-v2 JSON → Markdown, and the kinds Markdown could not carry (spec §3, SC3/SC4). Total. */
export function docToMarkdown(doc: unknown): { markdown: string; lossy: string[] } {
  if (doc === null || typeof doc !== 'object' || (doc as { type?: unknown }).type !== 'doc') return { markdown: '', lossy: [] };
  const node = markdownSchema().nodeFromJSON(doc);
  const lossy = new Set<string>();
  const markdown = serializer(lossy).serialize(node, { tightLists: true }).trim();
  return { markdown, lossy: [...lossy].sort() };
}
