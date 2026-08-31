import { Node, mergeAttributes } from '@tiptap/core';
import { isEmbeddableImageMime } from '@gisik-nokma/domain';

/**
 * The wrap vocabulary, stated ONCE for the whole product (coordination
 * amendment 12). Every guard below reads this array; none restates the
 * literals. Three spellings of one union is the drift this series keeps
 * finding, and a union spelled in a type alias alone is not readable at
 * runtime — which is where the parse path needs it.
 */
export const IMAGE_WRAP_MODES = ['inline-left', 'inline-right', 'block'] as const;
export type ImageWrapMode = (typeof IMAGE_WRAP_MODES)[number];

/** The one origin of the fallback wrap; the literal appears here and nowhere else. */
const DEFAULT_IMAGE_WRAP: ImageWrapMode = 'block';

function isImageWrapMode(value: unknown): value is ImageWrapMode {
  return IMAGE_WRAP_MODES.includes(value as ImageWrapMode);
}

/** Coerce an untrusted wrap to a member of the vocabulary. */
function toImageWrapMode(value: unknown): ImageWrapMode {
  return isImageWrapMode(value) ? value : DEFAULT_IMAGE_WRAP;
}

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
      insertTicketImage: (attrs: {
        attachmentId: string;
        mime: string;
        wrap?: ImageWrapMode;
        alt?: string;
      }) => ReturnType;
      /** Change the wrap mode of the selected image node. */
      setImageWrap: (wrap: ImageWrapMode) => ReturnType;
    };
  }
}

/**
 * The `image` node of document schema v1: `{ attachmentId, wrap, alt }`.
 *
 * The document stores an ATTACHMENT ID, never a URL. A URL is a fact about
 * one deployment's storage and one moment's signature; an id survives both,
 * and `resolveAttachmentUrl` turns it back into a URL at render time.
 *
 * THREE DOORS REACH `wrap` AND EACH ONE IS GUARDED HERE: `insertTicketImage`,
 * `setImageWrap`, and HTML parsing. The third is the one a hostile document
 * uses, and it is the one whose guard has to sit in a specific place.
 * `injectExtensionAttributesToParseRule` (@tiptap/core@3.30.5 dist:1452-1472)
 * builds each parse rule's `getAttrs` as `{ ...oldAttributes, ...newAttributes }`
 * — the node-level `getAttrs` result first, the per-attribute `parseHTML`
 * results second — so the per-attribute handler is the LAST writer and a
 * validation placed in the node-level `getAttrs` is overwritten by it. The
 * per-attribute default, when an attribute defines no `parseHTML`, is
 * `fromString(node.getAttribute(name))` (dist:1461), which reads the bare
 * attribute `wrap`. So validation lives in the per-attribute `parseHTML`
 * below, and a test pins a bare `wrap="float-up"` losing to it.
 *
 * The same reason each attribute defines `renderHTML`: an `addAttributes`
 * entry without one is written out under its own name, so the node would
 * serialize both `wrap="inline-left"` and `data-wrap="inline-left"` — two
 * spellings of one fact in the HTML, of which only one is validated on the
 * way back in. A test pins the single spelling.
 *
 * WHAT IS NOT ENFORCED HERE, DELIBERATELY. ProseMirror validates attribute
 * NAMES, not their values (the same reason `heading` cannot pin its levels —
 * see the note in schema/extensions.ts), so a doc JSON claiming
 * `{ type: 'image', attrs: { wrap: 'float-up' } }` round-trips with the
 * 'float-up' intact. Layer 1 is the editor's own doors; the server's ingest
 * gate is layer 3 and owns the stored-document question.
 */
export const TicketImage = Node.create<TicketImageOptions>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return {
      // The one origin of the default route. `buildEditorExtensions` passes
      // `resolveAttachmentUrl` through only when its caller supplied one, so
      // this spelling is not repeated at the configure site.
      resolveAttachmentUrl: (attachmentId: string) => `/v1/attachments/${attachmentId}`,
    };
  },

  addAttributes() {
    return {
      attachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-attachment-id'),
        renderHTML: (attributes) => ({ 'data-attachment-id': attributes.attachmentId }),
      },
      wrap: {
        default: DEFAULT_IMAGE_WRAP,
        parseHTML: (element) => toImageWrapMode(element.getAttribute('data-wrap')),
        renderHTML: (attributes) => ({ 'data-wrap': attributes.wrap }),
      },
      alt: {
        default: '',
        parseHTML: (element) => element.getAttribute('alt') ?? '',
        renderHTML: (attributes) => ({ alt: attributes.alt }),
      },
    };
  },

  parseHTML() {
    // `data-attachment-id` is the discriminator, not `img` alone: a plain
    // `<img src="https://…">` pasted from a web page is NOT one of this
    // product's images, and matching it would put a remote URL in the doc.
    // Per-attribute `parseHTML` above supplies every attr, including the
    // coercion of an unknown wrap.
    return [{ tag: 'img[data-attachment-id]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { attachmentId, wrap } = node.attrs as { attachmentId: unknown; wrap: unknown };
    // A node with no attachmentId is reachable — attribute defaults fill in
    // for a doc JSON that omits them — and fabricating `/v1/attachments/null`
    // for it would turn a malformed document into a real request. No id, no
    // `src`: ProseMirror drops a null attribute rather than writing it.
    const src = typeof attachmentId === 'string' && attachmentId.length > 0
      ? this.options.resolveAttachmentUrl(attachmentId)
      : null;
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        src,
        class: `editor-image editor-image--${toImageWrapMode(wrap)}`,
      }),
    ];
  },

  addCommands() {
    return {
      insertTicketImage:
        (attrs) =>
        ({ commands }) => {
          if (!isEmbeddableImageMime(attrs.mime)) return false;
          if (attrs.wrap !== undefined && !isImageWrapMode(attrs.wrap)) return false;
          return commands.insertContent({
            type: this.name,
            attrs: {
              attachmentId: attrs.attachmentId,
              wrap: attrs.wrap ?? DEFAULT_IMAGE_WRAP,
              alt: attrs.alt ?? '',
            },
          });
        },
      setImageWrap:
        (wrap) =>
        ({ commands }) => {
          if (!isImageWrapMode(wrap)) return false;
          return commands.updateAttributes(this.name, { wrap });
        },
    };
  },
});
