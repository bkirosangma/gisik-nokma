import { describe, expect, it } from 'vitest';
import { docToPlainText } from '../src/doc-text.js';

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: string) => ({ type: 'text', text: t });

describe('docToPlainText', () => {
  it('renders paragraphs with a newline between blocks', () => {
    expect(docToPlainText(doc(p(text('File the GST return')), p(text('before Friday'))))).toBe(
      'File the GST return\nbefore Friday',
    );
  });

  it('renders a mention as @label, falling back to @userId', () => {
    expect(
      docToPlainText(
        doc(
          p(
            text('Ask '),
            { type: 'mention', attrs: { userId: 'usr_01', label: 'Kiro' } },
            text(' about the OTP'),
          ),
        ),
      ),
    ).toBe('Ask @Kiro about the OTP');
    expect(docToPlainText(doc(p({ type: 'mention', attrs: { userId: 'usr_01' } })))).toBe('@usr_01');
  });

  it('renders hard breaks as newlines', () => {
    expect(docToPlainText(doc(p(text('line one'), { type: 'hardBreak' }, text('line two'))))).toBe(
      'line one\nline two',
    );
  });

  it('descends into unknown node types rather than dropping their text', () => {
    const exotic = doc({ type: 'calloutOfTheFuture', content: [p(text('still reachable'))] });
    expect(docToPlainText(exotic)).toBe('still reachable');
  });

  it('renders image nodes as nothing — attachments are not text', () => {
    expect(docToPlainText(doc(p(text('before ')), { type: 'image', attrs: { src: 'x' } }, p(text('after'))))).toBe(
      'before\nafter',
    );
  });

  it('is total: junk input renders as the empty string, never throws', () => {
    expect(docToPlainText(null)).toBe('');
    expect(docToPlainText(undefined)).toBe('');
    expect(docToPlainText(42)).toBe('');
    expect(docToPlainText('a bare string')).toBe('');
    expect(docToPlainText({ type: 'doc' })).toBe('');
    expect(docToPlainText({ type: 'doc', content: [{ type: 'text' }] })).toBe('');
    expect(docToPlainText([p(text('an array is not a doc'))])).toBe('');
  });
});
