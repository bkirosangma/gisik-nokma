import { Node, mergeAttributes } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { createMentionPopup } from './mention-popup.js';
import { createMentionReplacePlugin } from './mention-replace.js';

export type MentionCandidate = { userId: string; name: string };

export type MentionOptions = {
  queryUsers(query: string): Promise<MentionCandidate[]>;
};

export const mentionSuggestionKey = new PluginKey('mentionSuggestion');

export type MentionAttrs = { userId: string; label: string };

/**
 * THE ONE ORIGIN OF THE INSERT-TIME MENTION ATTRS, and the reason it needs one.
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
 * BOTH FIELDS ARE JUDGED HERE, AND THE SECOND IS THE DANGEROUS ONE. An empty
 * label is VISIBLY wrong — a reader sees a ULID where a name belongs and
 * reports it. An empty `userId` is INVISIBLY wrong: `{ userId: '', name:
 * 'Anselma' }` renders `@Anselma` perfectly, reads correctly to every human who
 * sees it, and addresses nobody. Nothing downstream catches it either; a
 * repo-wide sweep found no gate on mention userIds anywhere outside the walker
 * and this task's own files. A silent failure with no downstream net is worth
 * more of a guard than a loud one, not less, which is why this function judges
 * the pair and returns the attrs to store rather than just the label.
 *
 * The rule is the same for both: TRIM, AND REFUSE WHAT TRIMS AWAY. Trimming is
 * what makes the empty and the blank case one rule — a name of three spaces
 * passes the walker's `length > 0` and prints `@   `, a mention of nobody that
 * no length check on the raw string would catch. Refusal rather than
 * substitution follows this package's own precedent: `insertTicketImage`
 * returns false for a non-image mime instead of coercing it, and the
 * alternative is worse than it looks — a stand-in like 'unknown' would put a
 * name nobody has into a stored document and from there into someone's inbox.
 *
 * WHAT THIS DOES NOT GUARD, stated so it cannot be read wider: the insert path
 * only. The JSON door and the HTML door both reach `attrs` directly, and the
 * reasons they stay open are DIFFERENT reasons — see the node's docblock below,
 * which spells out why one of them is not the precedent it looks like.
 */
export function mentionAttrsOf(candidate: MentionCandidate): MentionAttrs | null {
  const userId = typeof candidate.userId === 'string' ? candidate.userId.trim() : '';
  const label = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  if (userId.length === 0 || label.length === 0) return null;
  return { userId, label };
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
 *
 * TWO DOORS PAST THE INSERT-TIME GUARD STAY OPEN, FOR TWO DIFFERENT REASONS,
 * and an earlier version of this comment gave the first reason for both.
 *
 * THE JSON DOOR is `ticket-image.ts`'s case exactly, and its reasoning carries
 * over unchanged: an attribute spec may declare a `validate`, `checkAttrs` runs
 * it on every `Node.fromJSON` (prosemirror-model@1.25.11 dist:2058-2066) and
 * Tiptap forwards it (core dist:1491) — but it THROWS AT LOAD,
 * `enableContentCheck` defaults false (core dist:6150) and is set nowhere in
 * this repo, so the catch replaces the WHOLE document with an empty one. One
 * stored junk mention would take every surrounding paragraph with it.
 *
 * THE HTML DOOR IS NOT THAT CASE, and citing ticket-image for it would be
 * citing a precedent that reaches the OPPOSITE conclusion — ticket-image
 * guards its parse door, coercing every unknown `wrap` to `block`, and says so.
 * Nor is a `validate` needed to close this one: a node-level `getAttrs`
 * returning `false` cancels the rule outright, no load-time throw involved. The
 * real reason is that neither move available here is an improvement — FOR THE
 * SHAPE THIS PARAGRAPH IS ABOUT, which is a PRESENT id with a missing name.
 * COERCION HAS NO LEGAL TARGET: `wrap` has a `block` to fall back to, and a
 * missing name has nothing — inventing one is precisely what the insert path
 * refuses to do. And REFUSAL DISCARDS EVIDENCE: cancelling the rule on
 * `<span data-mention-user-id="01J9…"></span>` demotes it to the literal text
 * `@`, throwing away the one fact the markup actually carried, and turning a
 * mention that renders badly — visibly, repairably — into text that cannot be
 * repaired at all. Left open deliberately; layer 3 is where a stored mention
 * with no name gets rejected, and a test pins both doors open so this stays a
 * decision rather than an oversight.
 *
 * THE OTHER SHAPE IS NOT THAT SHAPE, and the scoped re-review caught this
 * paragraph being read as if it covered both. `<span data-mention-user-id="">`
 * and `<span data-mention-user-id="   ">` carry a name and NO id, and both
 * halves of the reasoning above invert on them:
 *
 *   - Nothing is discarded by refusing. `getAttrs` returning `false` demotes
 *     the span to the literal text `@Anselma` — the name survives, in full,
 *     as text. The evidence-discarding argument protects an id with no name;
 *     it says nothing about a name with no id.
 *   - And the failure it lets through is the INVISIBLE one. A blank id stores
 *     `{"userId":"","label":"Anselma"}`, renders `@Anselma` perfectly, reads
 *     correctly to every human who sees it, and addresses nobody — with no
 *     downstream gate anywhere (swept: no consumer validates a mention userId).
 *     That is the exact defect the insert path was rewritten to close, and
 *     leaving it open on a neighbouring door closed nothing.
 *
 * So a blank-or-whitespace id is refused HERE, at the node level, where a
 * `false` short-circuits before the per-attribute handlers ever run — the one
 * thing a node-level `getAttrs` still does after this file's own forgery fix
 * established that its RETURNED ATTRS are dead code. A silent failure with no
 * net under it deserves more of a guard than a loud one, not less.
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
    //
    // The node-level `getAttrs` returns only `false` or `null` — never an
    // attrs object. That is not style: `injectExtensionAttributesToParseRule`
    // merges `{ ...nodeLevelResult, ...perAttributeResults }`, so attrs
    // returned here are overwritten, which is the forgery this file was fixed
    // for. It checks `oldAttributes === false` BEFORE that merge, so refusal
    // is the one verdict a node-level handler can still deliver.
    return [
      {
        tag: 'span[data-mention-user-id]',
        getAttrs: (element) =>
          ((element as HTMLElement).getAttribute('data-mention-user-id') ?? '').trim().length === 0
            ? false
            : null,
      },
    ];
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
        // THE DOOR THE ATTRS RULE ACTUALLY CLOSES. A candidate this editor
        // could not STORE is never offered — one it cannot name, and equally
        // one it cannot address — so there is no row to click and no silent
        // no-op when one is clicked, which is what a refusal inside `command`
        // alone would produce.
        items: async ({ query }) => {
          const candidates = await this.options.queryUsers(query);
          return candidates.filter((candidate) => mentionAttrsOf(candidate) !== null);
        },
        command: ({ editor, range, props }) => {
          const attrs = mentionAttrsOf(props);
          // UNREACHABLE THROUGH THE PICKER WHILE THE FILTER ABOVE STANDS, and
          // said plainly rather than dressed up: deleting this line alone
          // leaves every test green, which was run. A test that cannot fail is
          // not evidence; a runtime guard is not evidence, it is a second door.
          // It narrows `attrs` from `MentionAttrs | null` to `MentionAttrs` at
          // the one site that writes the node, and it is live the moment the
          // filter is not — deleting the filter alone and deleting both redden
          // the same case with DIFFERENT documents, an empty one versus a
          // mention labelled with three spaces, and that difference is this
          // branch.
          if (attrs === null) return;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: this.name, attrs },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        render: () => createMentionPopup(),
      }),
      // Clicking a mention in an editable editor reopens the same picker to
      // replace it (`mention-replace.ts`). It rides on the node so EVERY host
      // that has mentions — ticket description and comments, note body and
      // comments, the mobile webview — gets it from the one extension.
      createMentionReplacePlugin({
        nodeName: this.name,
        queryUsers: (query) => this.options.queryUsers(query),
        toAttrs: mentionAttrsOf,
      }),
    ];
  },
});
