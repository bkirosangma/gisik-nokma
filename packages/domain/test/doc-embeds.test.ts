import { describe, expect, it } from 'vitest';
import {
  EMBEDDABLE_IMAGE_MIME,
  collectImageAttachmentIds,
  isEmbeddableImageMime,
} from '../src/doc-embeds.js';

const IMG_A = '01J9GIMA000000000000000000';
const IMG_B = '01J9GIMB000000000000000000';

describe('isEmbeddableImageMime', () => {
  it('accepts exactly the embeddable set', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(isEmbeddableImageMime(mime)).toBe(true);
    }
  });

  it('planted defect: refuses svg, pdf, video, and lookalikes', () => {
    for (const mime of [
      'image/svg+xml',
      'application/pdf',
      'video/mp4',
      'image/PNG',
      'image/png ',
      'text/html',
    ]) {
      expect(isEmbeddableImageMime(mime), `${mime} must not be embeddable`).toBe(false);
    }
  });

  it('the set itself is what the predicate reads', () => {
    expect([...EMBEDDABLE_IMAGE_MIME].sort()).toEqual([
      'image/gif',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });
});

describe('collectImageAttachmentIds', () => {
  it('finds top-level and nested image nodes, unique, in order', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { attachmentId: IMG_A, wrap: 'block', alt: '' } },
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
            { type: 'image', attrs: { attachmentId: IMG_B, wrap: 'inline-left', alt: '' } },
          ],
        },
        { type: 'image', attrs: { attachmentId: IMG_A, wrap: 'block', alt: 'dup' } },
      ],
    };
    expect(collectImageAttachmentIds(doc)).toEqual([IMG_A, IMG_B]);
  });

  it('ignores non-image nodes and images without a string attachmentId', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'no images here' }] },
        { type: 'image', attrs: { attachmentId: null, wrap: 'block', alt: '' } },
        // Not in the brief's fixture, and it had to be: an implementation that
        // coerced with String() instead of narrowing with typeof survived every
        // other case here, because null and undefined are the only non-strings
        // the rest of this doc offers.
        { type: 'image', attrs: { attachmentId: 42, wrap: 'block', alt: '' } },
        { type: 'image', attrs: {} },
        { type: 'image' },
      ],
    };
    expect(collectImageAttachmentIds(doc)).toEqual([]);
  });

  it('never throws on junk input', () => {
    for (const junk of [
      null,
      undefined,
      42,
      'doc',
      [],
      { type: 'doc', content: 'nope' },
      { content: [null, 7, []] },
    ]) {
      expect(collectImageAttachmentIds(junk)).toEqual([]);
    }
  });
});
