import { docToPlainText } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { plainTextDoc } from '../../src/seed/doc-text.js';

describe('plainTextDoc', () => {
  /**
   * 13.45 — `plainTextDoc` keeps record text literal — markdown-looking characters stay characters.
   */
  it('keeps record text literal — markdown-looking characters stay characters', () => {
    const doc = plainTextDoc('**Gates:** every SMS the platform will ever send — OTP included');
    const text = docToPlainText(doc);
    expect(text).toContain('**Gates:**');
  });

  /**
   * 13.46 — `plainTextDoc` renders one paragraph per line; blank lines become empty paragraphs.
   */
  it('one paragraph per line; blank lines become empty paragraphs', () => {
    const doc = plainTextDoc('line one\n\nline three') as { content: Array<{ type: string; content?: unknown[] }> };
    expect(doc.content).toHaveLength(3);
    expect(doc.content[1]!.content).toBeUndefined();
  });

  /**
   * 13.47 — `plainTextDoc('')` is still a valid one-paragraph doc.
   */
  it('an empty string is still a valid one-paragraph doc', () => {
    const doc = plainTextDoc('') as { type: string; content: unknown[] };
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(1);
  });
});
