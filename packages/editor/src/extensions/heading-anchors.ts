import { Extension } from '@tiptap/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { assignHeadingIds } from '../reading/reading-meta.js';
import { copyText } from './copy-text.js';

/**
 * Heading anchors and the "copy link to this heading" button, ported from the
 * knowledge-base app's `HeadingCopyLink.tsx` + its slugged heading node view.
 *
 * ## WHY DECORATIONS, NOT A REPLACEMENT HEADING NODE VIEW
 *
 * The source swaps in a React node view for `heading` that renders the id and
 * the button. Here the `id` is a NODE decoration and the button a WIDGET
 * decoration: the document schema is untouched (a node view owning the heading
 * DOM would also have to answer `ignoreMutation` for the button AND for the id
 * that `extractReadingMeta` stamps), the heading keeps its stock rendering, and
 * the button's own DOM churn is ignored by ProseMirror (a widget's mutations
 * are, by construction).
 *
 * ## OPT-IN
 *
 * Registered only when the host passes `headingLink` (`buildEditorExtensions`).
 * A surface that does not (the ticket sheet, the mobile WebView) gets no ids
 * and no button — a heading id is a page-wide claim, and only the note page
 * has a URL to point at.
 *
 * ## THE IDS
 *
 * From `assignHeadingIds`, the same function `extractReadingMeta` uses, over
 * every non-empty heading H1–H6 in document order: the fragment a copied link
 * carries is the one the table of contents scrolls to. `data-heading-id`
 * carries it, and `extractReadingMeta` prefers it to its own reading of the
 * rendered text.
 */
export type HeadingAnchorsOptions = {
  /** The absolute link for a heading id, or `null` when there is none right now. */
  headingLink?: (id: string) => string | null;
};

export const headingAnchorsKey = new PluginKey<DecorationSet>('headingAnchors');

const FEEDBACK_MS = 1500;
const LINK_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>';

function buildDecorations(
  doc: ProseNode,
  makeButton: (id: string) => HTMLElement,
): DecorationSet {
  const headings: Array<{ pos: number; node: ProseNode; text: string }> = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true;
    const text = node.textContent.trim();
    if (text !== '') headings.push({ pos, node, text });
    return false; // headings hold inline content only
  });
  const ids = assignHeadingIds(headings.map((h) => h.text));
  const decorations: Decoration[] = [];
  headings.forEach(({ pos, node }, index) => {
    const id = ids[index] as string;
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, { id, 'data-heading-id': id }),
      // End of the heading's content: `side: 1` keeps it after the caret when
      // the caret is at the end of the text, so typing does not go past it.
      Decoration.widget(pos + node.nodeSize - 1, () => makeButton(id), {
        side: 1,
        key: `heading-link:${id}`,
        // Nothing the pointer or keyboard does on the button is an edit or a
        // selection change.
        stopEvent: () => true,
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

export const HeadingAnchors = Extension.create<HeadingAnchorsOptions>({
  name: 'headingAnchors',

  addOptions() {
    return {};
  },

  addProseMirrorPlugins() {
    const { headingLink } = this.options;
    if (headingLink === undefined) return [];
    // A visually-hidden live region, created with the editor (a region that
    // appears WITH its message is often not announced) and removed with it.
    let status: HTMLElement | null = null;
    let statusTimer: ReturnType<typeof setTimeout> | null = null;
    const announce = (message: string): void => {
      if (status === null) return;
      status.textContent = message;
      if (statusTimer !== null) clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        if (status !== null) status.textContent = '';
      }, FEEDBACK_MS);
    };

    const makeButton = (id: string): HTMLElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'editor-heading-link';
      button.setAttribute('contenteditable', 'false');
      button.setAttribute('aria-label', 'Copy link to this heading');
      button.title = 'Copy link to this heading';
      // SVG carries no text, so the heading's `textContent` (the reading meta
      // and the table of contents read it) is unchanged by the button.
      button.innerHTML = LINK_ICON;
      // Keep the caret where it was: a click here is not a click into the text.
      button.addEventListener('mousedown', (event) => event.preventDefault());
      let timer: ReturnType<typeof setTimeout> | null = null;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const href = headingLink(id);
        if (href === null) return;
        copyText(href, () => {
          button.setAttribute('data-copied', 'true');
          announce('Link copied');
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(() => button.removeAttribute('data-copied'), FEEDBACK_MS);
        });
      });
      return button;
    };

    return [
      new Plugin<DecorationSet>({
        key: headingAnchorsKey,
        state: {
          init: (_config, state) => buildDecorations(state.doc, makeButton),
          apply: (tr, previous) => (tr.docChanged ? buildDecorations(tr.doc, makeButton) : previous),
        },
        props: {
          decorations: (state) => headingAnchorsKey.getState(state),
        },
        view: () => {
          status = document.createElement('div');
          status.className = 'editor-heading-link__status';
          status.setAttribute('role', 'status');
          status.setAttribute('aria-live', 'polite');
          document.body.appendChild(status);
          return {
            destroy: () => {
              if (statusTimer !== null) clearTimeout(statusTimer);
              status?.remove();
              status = null;
            },
          };
        },
      }),
    ];
  },
});
