### Task 2: Domain walkers — embeddable-image mime and image-reference collection

**Files:**
- Create: `packages/domain/src/doc-embeds.ts`
- Modify: `packages/domain/src/index.ts` (append one export line)
- Test: `packages/domain/test/doc-embeds.test.ts`

**Interfaces:**
- Consumes: nothing (pure, dependency-free — the same discipline as Plan 5's `docToPlainText`).
- Produces (cross-plan API — the editor's layer 1, the paste handler's layer 2, and the server gate's layer 3 all read THIS definition, so "image" can never mean different things on different layers):
  - `EMBEDDABLE_IMAGE_MIME: ReadonlySet<string>` = `{'image/png', 'image/jpeg', 'image/gif', 'image/webp'}` (SVG deliberately absent: no magic bytes to sniff and a script vector — see Open questions 5).
  - `isEmbeddableImageMime(mime: string): boolean`
  - `collectImageAttachmentIds(doc: unknown): string[]` — walks opaque doc JSON; returns unique `attachmentId`s of `image` nodes in first-seen order; never throws on junk.

- [ ] **Step 1: Write the failing test**

`packages/domain/test/doc-embeds.test.ts`:

```ts
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
    for (const mime of ['image/svg+xml', 'application/pdf', 'video/mp4', 'image/PNG', 'image/png ', 'text/html']) {
      expect(isEmbeddableImageMime(mime), `${mime} must not be embeddable`).toBe(false);
    }
  });

  it('the set itself is what the predicate reads', () => {
    expect([...EMBEDDABLE_IMAGE_MIME].sort()).toEqual(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
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
        { type: 'image', attrs: {} },
        { type: 'image' },
      ],
    };
    expect(collectImageAttachmentIds(doc)).toEqual([]);
  });

  it('never throws on junk input', () => {
    for (const junk of [null, undefined, 42, 'doc', [], { type: 'doc', content: 'nope' }, { content: [null, 7, []] }]) {
      expect(collectImageAttachmentIds(junk)).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/doc-embeds.test.ts`
Expected: FAIL — cannot resolve `../src/doc-embeds.js`.

- [ ] **Step 3: Implement the walker**

`packages/domain/src/doc-embeds.ts`:

```ts
/**
 * The closed set of mimes that may embed inline in a document (spec §2
 * Attachments: only images embed; everything else is a list attachment).
 * One definition serves all three enforcement layers — editor command,
 * paste/drop handler, and the server's ingest gate — so they cannot
 * disagree about what an "image" is. Case-sensitive on purpose: sniffed
 * mimes are produced lowercase, and a lookalike is not a match.
 */
export const EMBEDDABLE_IMAGE_MIME: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export function isEmbeddableImageMime(mime: string): boolean {
  return EMBEDDABLE_IMAGE_MIME.has(mime);
}

/**
 * Dependency-free walk over opaque ProseMirror doc JSON collecting the
 * attachmentId of every `image` node — unique, first-seen order. Tolerant
 * of any junk shape: the caller may be validating a hostile payload.
 */
export function collectImageAttachmentIds(doc: unknown): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  walk(doc);
  return ids;

  function walk(node: unknown): void {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    const record = node as { type?: unknown; attrs?: unknown; content?: unknown };
    if (record.type === 'image') {
      const attachmentId = (record.attrs as { attachmentId?: unknown } | undefined)?.attachmentId;
      if (typeof attachmentId === 'string' && !seen.has(attachmentId)) {
        seen.add(attachmentId);
        ids.push(attachmentId);
      }
    }
    walk(record.content);
  }
}
```

Append to `packages/domain/src/index.ts`:

```ts
export * from './doc-embeds.js';
```

- [ ] **Step 4: Run the domain tests and build**

Run: `pnpm --filter @gisik-nokma/domain test && pnpm --filter @gisik-nokma/domain build`
Expected: all PASS (new and pre-existing); `dist/` emitted.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "Domain: one definition of 'embeddable image' and a junk-tolerant walker for embedded attachment ids, shared by all three enforcement layers"
```

---

