import { describe, expect, it } from 'vitest';
import { extractMentionedUserIds } from '../src/doc-mentions.js';

describe('extractMentionedUserIds', () => {
  it('finds mention nodes at any depth, unique, in first-appearance order', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { userId: 'user_kiro' } },
            { type: 'text', text: ' and ' },
            { type: 'mention', attrs: { userId: 'user_anselma' } },
          ],
        },
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'mention', attrs: { userId: 'user_kiro' } }] },
          ],
        },
      ],
    };
    expect(extractMentionedUserIds(doc)).toEqual(['user_kiro', 'user_anselma']);
  });

  it('ignores nodes that merely look mention-ish', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'mention' },
        { type: 'mention', attrs: {} },
        { type: 'mention', attrs: { userId: 42 } },
        { type: 'mention', attrs: { userId: '' } },
        { type: 'mention', attrs: { userId: ['user_kiro'] } },
        { type: 'text', text: '@not_a_mention_node' },
        // type is the discriminator, not the presence of attrs.userId: a
        // non-mention node carrying a userId (an assignee chip, an image's
        // uploader) must not be harvested as a mention.
        { type: 'assigneeChip', attrs: { userId: 'user_never_mentioned' } },
        { type: 'image', attrs: { userId: 'user_uploader', src: 'https://example.test/x.png' } },
      ],
    };
    expect(extractMentionedUserIds(doc)).toEqual([]);
  });

  it('yields [] for malformed input', () => {
    expect(extractMentionedUserIds(undefined)).toEqual([]);
    expect(extractMentionedUserIds('a string')).toEqual([]);
  });

  it('does not overflow the stack on a self-referential node, and returns partial results', () => {
    const cyclic: Record<string, unknown> = { type: 'paragraph' };
    cyclic.content = [{ type: 'mention', attrs: { userId: 'user_before_cycle' } }, cyclic];
    expect(() => extractMentionedUserIds(cyclic)).not.toThrow();
    expect(extractMentionedUserIds(cyclic)).toEqual(['user_before_cycle']);
  });
});
