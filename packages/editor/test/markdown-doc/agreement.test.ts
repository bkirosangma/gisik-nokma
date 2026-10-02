import { describe, expect, it } from 'vitest';
import { exportMarkdown } from '../../src/markdown/serializer.js';
import { markdownToDoc, type RefResolver } from '../../src/markdown-doc/index.js';

const none: RefResolver = { user: () => null, ticket: () => null, note: () => null };
const t = (text: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>) =>
  marks === undefined ? { type: 'text', text } : { type: 'text', text, marks };
const doc = (...content: unknown[]) => ({ type: 'doc', attrs: { schemaVersion: 2 }, content });

/** The node set BOTH serializers speak. Excluded by name: wikiLink, ticketRef, mention, details, taskList, table, image. */
const SHARED = [
  doc({ type: 'paragraph', content: [t('plain')] }),
  doc({ type: 'heading', attrs: { level: 2 }, content: [t('Title')] }),
  doc({ type: 'paragraph', content: [t('b', [{ type: 'bold' }]), t(' '), t('i', [{ type: 'italic' }]), t(' '), t('s', [{ type: 'strike' }]), t(' '), t('c', [{ type: 'code' }])] }),
  doc({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [t('one')] }] }] }),
  doc({ type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [t('one')] }] }] }),
  doc({ type: 'blockquote', content: [{ type: 'paragraph', content: [t('q')] }] }),
  doc({ type: 'codeBlock', attrs: { language: 'ts' }, content: [t('const a = 1;')] }),
  doc({ type: 'horizontalRule' }),
];

describe('26.011 the browser serializer and the converter agree on the shared node set', () => {
  it('26.011 markdownToDoc(exportMarkdown(doc)) equals doc for every shared node', () => {
    for (const d of SHARED) {
      const { doc: back, problems } = markdownToDoc(exportMarkdown(d), none);
      expect(problems).toEqual([]);
      expect(back, JSON.stringify(d)).toEqual(d);
    }
  });
});
