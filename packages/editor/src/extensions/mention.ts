import { Node, mergeAttributes } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { createMentionPopup } from './mention-popup.js';

export type MentionCandidate = { userId: string; name: string };

export type MentionOptions = {
  queryUsers(query: string): Promise<MentionCandidate[]>;
};

export const mentionSuggestionKey = new PluginKey('mentionSuggestion');

/**
 * THE ONE ORIGIN OF THE INSERT-TIME LABEL RULE, and the reason it needs one.
 *
 * `packages/domain/src/doc-text.ts` shipped before this package and its header
 * names Plan 7's editor as the thing that conforms to it. Its mention branch
 * takes `attrs.label` only when it is a string of NON-ZERO length, and falls
 * back to `attrs.userId` otherwise — which in this product is a ULID. So a
 * mention stored with an empty label is not a slightly worse mention: it is
 * `@01J9GUSA000000000000000000` in every search projection and every
 * notification that walker feeds. A test asserts that outcome against the
 * shipped walker rather than describing it.
 *
 * The rule is therefore: trim, and REFUSE what trims away. Refusal rather than
 * substitution follows this package's own precedent — `insertTicketImage`
 * returns false for a non-image mime instead of coercing it — and the
 * alternative is worse than it looks: a stand-in like 'unknown' would put a
 * name nobody has into a stored document and from there into someone's inbox.
 * Trimming is what makes the two failures one rule: a name of three spaces
 * passes the walker's `length > 0` and prints `@   `, a mention of nobody that
 * no length check on the raw string would catch.
 *
 * WHAT THIS DOES NOT GUARD, stated so it cannot be read wider. Only the label,
 * and only the insert path. A candidate carrying a blank `userId` is refused by
 * nothing here and would store a mention that resolves to no one while
 * rendering perfectly; and the JSON and HTML doors reach `attrs.label`
 * directly, both left open for the reason `ticket-image.ts` sets out at length
 * — a ProseMirror `validate` throws at load, `enableContentCheck` defaults
 * false, and the catch replaces the WHOLE document with an empty one. Tests pin
 * all three as open.
 */
export function mentionLabelOf(candidate: MentionCandidate): string | null {
  const label = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  return label.length > 0 ? label : null;
}

/**
 * The `@` prefix has ONE origin for this node: HTML text content, plain-text
 * serialization and the parse path all go through here, so the three cannot
 * drift into disagreeing about it. The walker in `@gisik-nokma/domain` spells
 * it a fourth time and deliberately cannot import this — it is dependency-free
 * on purpose — which is what `test/doc-text-conformance.test.ts` is for.
 */
function mentionText(attrs: Record<string, unknown>): string {
  return `@${typeof attrs.label === 'string' ? attrs.label : ''}`;
}

/**
 * The `mention` node of document schema v1: `{ userId, label }`, an inline atom.
 *
 * `label` IS A CLAIM CAPTURED AT INSERTION TIME, not a lookup. That is the
 * whole reason the shape carries it: `docToPlainText` renders `@name` with no
 * user directory in reach, on a server that indexes documents it did not
 * author. A name that changes later goes stale in old documents, which is the
 * accepted cost — the alternative is a search projection that cannot run
 * without joining a directory.
 *
 * BOTH ATTRIBUTES ARE READ AND WRITTEN PER-ATTRIBUTE, NOT NODE-LEVEL, and the
 * reason is the one Task 3 established for the image node's `wrap`.
 * `injectExtensionAttributesToParseRule` (@tiptap/core@3.30.5 dist:1452-1472)
 * rebuilds every parse rule's `getAttrs` as
 * `{ ...nodeLevelResult, ...perAttributeResults }` — the per-attribute handler
 * is the LAST writer — and its default, when an attribute defines none, is
 * `fromString(node.getAttribute(name))` (dist:1460), which reads the bare
 * attribute `userId` / `label`; `getAttribute` is case-insensitive on an HTML
 * element, so `userid="…"` reaches it too. Written node-level, as the plan
 * specifies, the validated values are overwritten by whatever the pasted markup
 * says. That was not reasoned about, it was SHIPPED AND WATCHED: on
 * `<span data-mention-user-id="A" userId="B" label="Mallory">@Anselma</span>`
 * the node came back `{ userId: 'B', label: 'Mallory' }`. For an image that
 * mis-set a float; here it reattributes the mention to a different person.
 *
 * The same mechanism runs outward: `getRenderedAttributes` (dist:1431) writes
 * an attribute with no `renderHTML` out under its own name, so the plan's
 * version serialized `userid="…" label="Anselma"` ALONGSIDE
 * `data-mention-user-id="…"` — two spellings of one fact, of which only one is
 * read back through a guard. Hence a `renderHTML` on both, and a test pinning
 * the single spelling in each direction.
 */
export const Mention = Node.create<MentionOptions>({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { queryUsers: async () => [] };
  },

  addAttributes() {
    return {
      userId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-mention-user-id'),
        renderHTML: (attributes) => ({ 'data-mention-user-id': attributes.userId }),
      },
      /** Display name at insertion time — the claim `docToPlainText` renders as @label. */
      label: {
        default: '',
        parseHTML: (element) => (element.textContent ?? '').replace(/^@/, ''),
        // The label's ONE spelling in the HTML is the span's text content,
        // which `renderHTML` below writes. An empty object here is what keeps
        // `getRenderedAttributes` from adding a second, unguarded spelling.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    // `data-mention-user-id` is the discriminator, not `span`: a `<span>`
    // pasted from any web page is not one of this product's mentions, and
    // matching the bare tag would turn arbitrary markup into a claim about a
    // person. Per-attribute `parseHTML` above supplies both attrs.
    return [{ tag: 'span[data-mention-user-id]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    // `data-mention-user-id` arrives through HTMLAttributes from the attribute's
    // own `renderHTML` and is deliberately not restated here — restating it
    // would be the second spelling this design exists to prevent. A node with no
    // userId renders the attribute as null, which ProseMirror drops.
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'editor-mention' }),
      mentionText(node.attrs),
    ];
  },

  renderText({ node }) {
    return mentionText(node.attrs);
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<MentionCandidate, MentionCandidate>({
        editor: this.editor,
        pluginKey: mentionSuggestionKey,
        char: '@',
        // THE DOOR THE LABEL RULE ACTUALLY CLOSES. A candidate this editor
        // could not label is never offered, so there is no row to click and no
        // silent no-op when one is clicked — which is what a refusal inside
        // `command` alone would produce.
        items: async ({ query }) => {
          const candidates = await this.options.queryUsers(query);
          return candidates.filter((candidate) => mentionLabelOf(candidate) !== null);
        },
        command: ({ editor, range, props }) => {
          const label = mentionLabelOf(props);
          // UNREACHABLE THROUGH THE PICKER WHILE THE FILTER ABOVE STANDS, and
          // said plainly rather than dressed up: deleting this line alone
          // leaves every test green, which was run. It is kept because it is
          // what makes `label` a `string` instead of a `string | null` asserted
          // away, and because it is live the moment the filter is not — deleting
          // the filter alone and deleting both redden the same case with
          // DIFFERENT documents, an empty one versus a mention labelled with
          // three spaces, and that difference is this branch.
          if (label === null) return;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: this.name, attrs: { userId: props.userId, label } },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        render: () => createMentionPopup(),
      }),
    ];
  },
});
