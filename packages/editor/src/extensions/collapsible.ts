import { Extension, InputRule, type JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

/**
 * The collapsible block (spec §8.4). The NODE is `details`, shipped by
 * `@tiptap/extension-details` and configured in `../schema/extensions.ts`;
 * this extension adds what that package does not deliver ON THIS EXTENSION
 * LIST: the `< ` input rule, and the Enter/Backspace keymap.
 *
 * ## WHY THE KEYMAP IS HERE AFTER ALL — the plan's premise was false, and so
 *    was the fallback it prescribed
 *
 * The plan says the Details extension "defines NO keyboard shortcuts, which is
 * why Task 3 adds Enter and Backspace". **That is false for
 * `@tiptap/extension-details@3.31.3`**: the package ships a `Details.Enter`, a
 * `DetailsContent.Enter` and a `Details.Backspace`. The plan's own escape
 * hatch is conditional — *"If the Details extension's own keymap ALREADY
 * SATISFIES 9.269 or 9.270 … do NOT add a duplicate shortcut"* — so the
 * question is not whether the package has shortcuts but whether they run.
 *
 * **For Enter in a summary, they do not.** Measured: a real `keydown` Enter
 * inside a summary put the cursor in a NEW TOP-LEVEL PARAGRAPH and left the
 * content untouched, and DELETING the branch below reddens 9.269. The
 * package's `Details.Enter` is not what runs there.
 *
 * **WHICH handler does run there is NOT ESTABLISHED, and an earlier version of
 * this docblock named one wrongly.** It said the base keymap runs first and
 * that `handleEnter`'s `createParagraphNear` returns true. Both halves are
 * false, and the second was measured: `editor.commands.first([newlineInCode,
 * createParagraphNear, liftEmptyBlock, splitBlock])` returns FALSE at the
 * summary position and TRUE on the last empty paragraph of a body. The base
 * `keymap` extension IS in the built list (50 extensions; 67 plugins carry a
 * `handleKeyDown`), so the key it gets is decided by the order those 67 are
 * consulted in — an order this file has NOT determined, and one that
 * `sortExtensions([...resolveExtensions(built)].reverse())` does not reproduce
 * (it omits `keymap` from the result, so that call is not the list that
 * matters). What IS measured is the effect: without this branch, 9.269 fails.
 *
 * `priority: 1000` is what makes this file's keymap run first. It is the
 * smallest lever that makes the behaviour deterministic instead of dependent
 * on list order, and it is safe because these handlers return `false` for
 * every key they do not own.
 *
 * ## WHICH OF THE THREE BEHAVIOURS ARE ACTUALLY THIS FILE'S — measured
 *
 * "The package has a handler" does not answer "the package delivers the
 * behaviour", so each branch was deleted on its own and `test/collapsible.test.ts`
 * re-run:
 *
 *   - **Enter in the summary (9.269) — THIS FILE'S.** Delete the branch and
 *     the case fails: as above, the base keymap keeps the key. The package's
 *     `Details.Enter` is reached only after the base keymap declines, and it
 *     does not decline here.
 *   - **Enter to exit the block (9.270) — THE PACKAGE'S.** Delete the branch
 *     and the case stays GREEN: `DetailsContent.Enter` DOES run at that
 *     position, because every base-keymap handler returns false on the last
 *     empty paragraph of a body. The branch that stood here was a duplicate
 *     and was REMOVED — the plan asks for exactly this when the package
 *     already satisfies a case. The case stayed and now witnesses the
 *     package. **Its stated mutation therefore SURVIVES against this file**,
 *     and that is recorded rather than papered over: there is no longer a
 *     branch here to kill.
 *   - **Backspace (9.295) — THIS FILE'S, and NARROWER than the package's.**
 *     The package's `unsetDetails` also removes the block, but it merges the
 *     summary content and inserts a fresh block, so an EMPTY collapsible
 *     becomes two empty paragraphs plus `TrailingNode`'s — three where §8.4
 *     says one. Delete this handler and 9.295 goes red at 3 vs 2.
 *
 * ## EVERY ACTION IS ONE TRANSACTION, AND `replaceWith` IS WHY
 *
 * Delete-then-insert is not equivalent to a single replacement here. Deleting
 * the only block of a document is not representable — `block+` — so ProseMirror
 * leaves an empty paragraph behind and the insert adds a second one. Two of
 * the three handlers below were written that way first and both produced a
 * document with a paragraph nobody asked for.
 */

/** The block the input rule inserts: an open collapsible, empty summary, one empty paragraph. */
const DETAILS: JSONContent = {
  type: 'details',
  attrs: { open: true },
  content: [{ type: 'detailsSummary' }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }],
};

export const Collapsible = Extension.create({
  name: 'collapsible',
  // Runs before the base keymap — see the docblock. Not a tuning knob.
  priority: 1000,

  addInputRules() {
    return [
      new InputRule({
        // Anchored at BOTH ends on purpose: `^` is the start of the textblock,
        // so `abc< ` cannot match, and `$` is the cursor, so `<div>` (no
        // space) cannot either. Spec §8.4 names both controls.
        find: /^<\s$/,
        handler: ({ chain, state }) => {
          const { $from } = state.selection;
          if ($from.parent.type.name !== 'paragraph') return null;
          const from = $from.before();
          const to = $from.after();
          // The work happens on the RULE'S OWN transaction. Its `chain` is
          // built over `view.state.tr` (core `run$1`'s `createChainableState`
          // call), and the runner dispatches that same transaction once the
          // handler returns — so a second transaction taken from
          // `editor.state` is both stale (the insert has not been dispatched,
          // so its doc does not contain the block yet) and never dispatched
          // itself.
          chain()
            .command(({ tr }) => {
              tr.replaceWith(from, to, state.schema.nodeFromJSON(DETAILS));
              // Two positions past the block's start: one for `<details>`,
              // one for `<summary>`. Inside the empty summary, which is where
              // the rest of the typed line has to land.
              tr.setSelection(TextSelection.near(tr.doc.resolve(from + 2)));
              return true;
            })
            .run();
          // The handler's return type is `void | null` — returning the chain's
          // boolean is a type error, and `null` is read as "no match".
          return undefined;
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;

        // IN THE SUMMARY: go into the body rather than splitting the title.
        if ($from.parent.type.name === 'detailsSummary') {
          const contentPos = $from.after() + 1; // the first child of detailsContent
          const tr = state.tr;
          // A paragraph is inserted only when the body has none — the input
          // rule always leaves one, so this is the guard for a document that
          // arrived from elsewhere. Inserting unconditionally (which is what
          // the package's own handler does) adds a paragraph per Enter.
          if (tr.doc.resolve(contentPos).nodeAfter === null) {
            tr.insert(contentPos, state.schema.nodes['paragraph']!.create());
          }
          tr.setSelection(TextSelection.near(tr.doc.resolve(contentPos + 1)));
          view.dispatch(tr);
          return true;
        }

        return false;
      },

      // Backspace at the start of a summary whose text — and whose body — is
      // empty: the block goes and ONE paragraph takes its place.
      //
      // The `textContent.length !== 0` guard is spec §8.4's own qualifier
      // ("an empty summary with empty content"), and it is load-bearing
      // rather than defensive: without it this handler would consume the
      // keystroke and remove a block the author had titled. Returning `false`
      // here instead hands the key to the Details extension, whose own
      // Backspace UNWRAPS the block at the same position — its summary text
      // survives as a paragraph, so nothing a person wrote is lost either
      // way. That is the division this file draws: the spec's case is
      // implemented here exactly, and the case the spec does not describe is
      // left to the package.
      Backspace: ({ editor }) => {
        const { state, view } = editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.parentOffset !== 0 || $from.parent.type.name !== 'detailsSummary') {
          return false;
        }
        const details = $from.node(-1);
        if (details.textContent.length !== 0) return false;
        const node = state.schema.nodes['paragraph']!.createAndFill();
        if (node === null) return false;
        const from = $from.before(-1);
        const tr = state.tr;
        tr.replaceWith(from, from + details.nodeSize, node);
        tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)));
        view.dispatch(tr);
        return true;
      },
    };
  },
});
