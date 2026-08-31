### Task 3: The image node — `{attachmentId, wrap, alt}` and layer 1 of image-only embedding

**Files:**
- Create: `packages/editor/src/extensions/ticket-image.ts`
- Create: `packages/editor/src/styles/editor.css`
- Modify: `packages/editor/src/schema/extensions.ts` (add TicketImage)
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/ticket-image.test.ts`

**Interfaces:**
- Consumes: `isEmbeddableImageMime` (Task 2); `buildEditorExtensions` (Task 1).
- Produces (cross-plan API):
  - Node `image` with attrs `{ attachmentId: string; wrap: 'inline-left' | 'inline-right' | 'block'; alt: string }` (coordination amendment 12's wrap vocabulary, exactly).
  - `IMAGE_WRAP_MODES = ['inline-left', 'inline-right', 'block'] as const`; `type ImageWrapMode = (typeof IMAGE_WRAP_MODES)[number]`.
  - Commands: `insertTicketImage(attrs: { attachmentId: string; mime: string; wrap?: ImageWrapMode; alt?: string }): boolean` — **refuses non-image mime (layer 1)**; `setImageWrap(wrap: ImageWrapMode): boolean`.
  - `TicketImageOptions = { resolveAttachmentUrl(attachmentId: string): string }`.
  - BEM classes `editor-image`, `editor-image--inline-left`, `editor-image--inline-right`, `editor-image--block`.

- [ ] **Step 1: Write the failing test**

`packages/editor/test/ticket-image.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';

const IMG = '01J9GIMA000000000000000000';

function imageNodes(json: unknown): Array<{ attrs: Record<string, unknown> }> {
  const found: Array<{ attrs: Record<string, unknown> }> = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const record = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown };
    if (record.type === 'image') found.push({ attrs: record.attrs ?? {} });
    walk(record.content);
  };
  walk(json);
  return found;
}

describe('image node', () => {
  it('insertTicketImage inserts an image node with wrap defaulting to block', () => {
    const editor = createTestEditor();
    const ok = editor.commands.insertTicketImage({ attachmentId: IMG, mime: 'image/png', alt: 'receipt' });
    expect(ok).toBe(true);
    const images = imageNodes(editor.getJSON());
    expect(images).toHaveLength(1);
    expect(images[0]!.attrs).toMatchObject({ attachmentId: IMG, wrap: 'block', alt: 'receipt' });
    editor.destroy();
  });

  it('planted defect (layer 1): a non-image mime is refused and the doc is untouched', () => {
    const editor = createTestEditor();
    const before = editor.getJSON();
    for (const mime of ['application/pdf', 'video/mp4', 'image/svg+xml', 'text/html']) {
      expect(editor.commands.insertTicketImage({ attachmentId: IMG, mime }), `${mime} must be refused`).toBe(false);
    }
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it('setImageWrap updates the selected image and refuses invented modes', () => {
    const editor = createTestEditor();
    editor.commands.insertTicketImage({ attachmentId: IMG, mime: 'image/jpeg', wrap: 'block' });
    // Select the image node it just inserted.
    let imagePos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imagePos = pos;
      return imagePos === -1;
    });
    expect(imagePos).toBeGreaterThanOrEqual(0);
    editor.commands.setNodeSelection(imagePos);
    expect(editor.commands.setImageWrap('inline-left')).toBe(true);
    expect(imageNodes(editor.getJSON())[0]!.attrs.wrap).toBe('inline-left');
    // Planted defect: a wrap outside the vocabulary is refused.
    expect(editor.commands.setImageWrap('float-up' as never)).toBe(false);
    expect(imageNodes(editor.getJSON())[0]!.attrs.wrap).toBe('inline-left');
    editor.destroy();
  });

  it('renders src via resolveAttachmentUrl and a BEM wrap class', () => {
    const editor = createTestEditor({ resolveAttachmentUrl: (id) => `/test-url/${id}` });
    editor.commands.insertTicketImage({ attachmentId: IMG, mime: 'image/webp', wrap: 'inline-right', alt: 'shelf' });
    const html = editor.getHTML();
    expect(html).toContain(`src="/test-url/${IMG}"`);
    expect(html).toContain(`data-attachment-id="${IMG}"`);
    expect(html).toContain('editor-image--inline-right');
    expect(html).toContain('alt="shelf"');
    editor.destroy();
  });

  it('round-trips through JSON with attrs intact', () => {
    const editor = createTestEditor();
    editor.commands.insertTicketImage({ attachmentId: IMG, mime: 'image/png', wrap: 'inline-left', alt: 'a' });
    const json = editor.getJSON();
    editor.commands.setContent(json);
    expect(editor.getJSON()).toEqual(json);
    editor.destroy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/ticket-image.test.ts`
Expected: FAIL — `insertTicketImage is not a function` (command unregistered).

- [ ] **Step 3: Implement the node**

`packages/editor/src/extensions/ticket-image.ts`:

```ts
import { Node, mergeAttributes } from '@tiptap/core';
import { isEmbeddableImageMime } from '@gisik-nokma/domain';

export const IMAGE_WRAP_MODES = ['inline-left', 'inline-right', 'block'] as const;
export type ImageWrapMode = (typeof IMAGE_WRAP_MODES)[number];

export type TicketImageOptions = {
  /** Maps an attachmentId to a fetchable URL. The doc stores only the id. */
  resolveAttachmentUrl(attachmentId: string): string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ticketImage: {
      /**
       * Layer 1 of image-only inline embedding: insertion is refused for a
       * non-image mime. The mime comes from the server's sniffed upload
       * answer, never from the file's name.
       */
      insertTicketImage: (attrs: { attachmentId: string; mime: string; wrap?: ImageWrapMode; alt?: string }) => ReturnType;
      /** Change the wrap mode of the selected image node. */
      setImageWrap: (wrap: ImageWrapMode) => ReturnType;
    };
  }
}

export const TicketImage = Node.create<TicketImageOptions>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return {
      resolveAttachmentUrl: (attachmentId: string) => `/v1/attachments/${attachmentId}`,
    };
  },

  addAttributes() {
    return {
      attachmentId: { default: null },
      wrap: { default: 'block' },
      alt: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-attachment-id]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const wrap = el.getAttribute('data-wrap');
          return {
            attachmentId: el.getAttribute('data-attachment-id'),
            wrap: IMAGE_WRAP_MODES.includes(wrap as ImageWrapMode) ? wrap : 'block',
            alt: el.getAttribute('alt') ?? '',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { attachmentId, wrap, alt } = node.attrs as { attachmentId: string; wrap: ImageWrapMode; alt: string };
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        src: this.options.resolveAttachmentUrl(attachmentId),
        'data-attachment-id': attachmentId,
        'data-wrap': wrap,
        alt,
        class: `editor-image editor-image--${wrap}`,
      }),
    ];
  },

  addCommands() {
    return {
      insertTicketImage:
        (attrs) =>
        ({ commands }) => {
          if (!isEmbeddableImageMime(attrs.mime)) return false;
          if (attrs.wrap !== undefined && !IMAGE_WRAP_MODES.includes(attrs.wrap)) return false;
          return commands.insertContent({
            type: this.name,
            attrs: {
              attachmentId: attrs.attachmentId,
              wrap: attrs.wrap ?? 'block',
              alt: attrs.alt ?? '',
            },
          });
        },
      setImageWrap:
        (wrap) =>
        ({ commands }) => {
          if (!IMAGE_WRAP_MODES.includes(wrap)) return false;
          return commands.updateAttributes(this.name, { wrap });
        },
    };
  },
});
```

- [ ] **Step 4: Wire it into the schema and the stylesheet**

In `packages/editor/src/schema/extensions.ts`, add the import and append to the returned array (after `TableCell`):

```ts
import { TicketImage } from '../extensions/ticket-image.js';
```

```ts
    TicketImage.configure({
      resolveAttachmentUrl: options.resolveAttachmentUrl ?? ((attachmentId) => `/v1/attachments/${attachmentId}`),
    }),
```

Create `packages/editor/src/styles/editor.css` (structural only — zero colour literals, per Global Constraints):

```css
/* Image embedding: the three wrap modes of spec §2. */
.editor-image {
  max-width: 100%;
  height: auto;
}
.editor-image--block {
  display: block;
  margin: 0.5rem 0;
}
.editor-image--inline-left {
  float: left;
  margin: 0 1rem 0.5rem 0;
  max-width: 50%;
}
.editor-image--inline-right {
  float: right;
  margin: 0 0 0.5rem 1rem;
  max-width: 50%;
}
```

Append to `packages/editor/src/index.ts`:

```ts
export { IMAGE_WRAP_MODES, TicketImage, type ImageWrapMode, type TicketImageOptions } from './extensions/ticket-image.js';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/ticket-image.test.ts test/schema.test.ts`
Expected: PASS (image tests plus the Task 1 suite — the schema test's node list now also sees `image`).

- [ ] **Step 6: Commit**

```bash
git add packages/editor
git commit -m "Image node: attachmentId + the three wrap modes, with insertion refusing non-image mime — layer 1 of image-only inline embedding, planted-defect proven"
```

---
