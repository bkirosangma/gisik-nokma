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
 * **NO `priority` IS SET, AND SETTING ONE WAS A MISTAKE.** This file carried
 * `priority: 1000`, justified in this very paragraph and written before it was
 * tested: *"the smallest lever that makes the behaviour deterministic instead
 * of dependent on list order"*. **Measured, and the lever does nothing** — the
 * constant was deleted and `test/collapsible.test.ts` re-run: **5/5 green**.
 * This file's handlers already win both keys on the natural order.
 *
 * It is gone rather than kept as insurance. A priority that is not needed is a
 * real cost: it moves this extension ahead of EVERY other one in the keymap
 * order, which is how an extension silently takes another's key — the hazard
 * the plan-close review checked this file for. That price was being paid for a
 * benefit that does not exist. If a future change to the extension list does
 * disturb the order, 9.269 and 9.270 are what catch it, and a test catching a
 * real break is worth more than a constant holding a position nobody
 * contested.
 *
 * ## WHICH OF THE THREE BEHAVIOURS ARE ACTUALLY THIS FILE'S — measured
 *
 * "The package has a handler" does not answer "the package delivers the
 * behaviour", so each branch was deleted on its own and
 * `test/collapsible.test.ts` re-run:
 *
 *   - **Enter in the summary (9.269) — THIS FILE'S.** Delete the branch and
 *     the case fails: the cursor lands outside the block instead of in the
 *     content.
 *   - **Enter to exit the block (9.270) — THE PACKAGE'S.** Delete the branch
 *     and the case stays GREEN, so `DetailsContent.Enter` is what delivers
 *     that exit. The branch that stood here was a duplicate and was REMOVED —
 *     the plan asks for exactly this when the package already satisfies a
 *     case. The case stayed and now witnesses the package. **Its stated
 *     mutation therefore SURVIVES against this file**, recorded rather than
 *     papered over: there is no longer a branch here to kill.
 *   - **Backspace (9.295) — THIS FILE'S, and NARROWER than the package's.**
 *     The package's `unsetDetails` also removes the block, but it merges the
 *     summary content and inserts a fresh block, so an EMPTY collapsible
 *     becomes two empty paragraphs plus `TrailingNode`'s — three where §8.4
 *     says one. Delete this handler and 9.295 goes red at 3 vs 2.
 *
 * AN EARLIER VERSION OF THE TWO ENTRIES ABOVE EXPLAINED BOTH BY THE BASE
 * KEYMAP, and said opposite things about it: that it "does not decline" at the
 * summary, and that "every base-keymap handler returns false" at the exit.
 * **Both are false, and both were measured**: the base keymap's
 * `first([newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock])`
 * returns FALSE at the summary position and TRUE at the exit position. Whatever
 * decides those two keys, it is not that predicate — it is the order the 67
 * `handleKeyDown` plugins are consulted in, which this file has NOT determined.
 * The two DELETIONS above are what these claims rest on, and those are effects,
 * not causes.
 *
 * ## ONE TRANSACTION PER ACTION — A CHOICE, NOT A REPAIR
 *
 * An earlier version of this section claimed `replaceWith` was a FIX: that
 * delete-then-insert left "a document with a paragraph nobody asked for",
 * because deleting a document's only block is not representable under `block+`
 * and ProseMirror supplies one. **Measured, and it is false.** Both handlers
 * were reverted to delete-then-insert and the documents printed: the input rule
 * gave `[details, paragraph]`, Backspace gave `[paragraph, paragraph]` —
 * exactly what `replaceWith` gives. That trailing paragraph belongs to
 * `TrailingNode`, which keeps a paragraph as a document's last block, and it is
 * there under EITHER spelling. The "paragraph nobody asked for" that prompted
 * the change was that node, misattributed.
 *
 * `replaceWith` is kept because it states one intent in one step, which is the
 * smaller thing to read. It is NOT load-bearing: no case reddens if it is
 * reverted.
 */

/** The block the input rule inserts: an open collapsible, empty summary, one empty paragraph. */
const DETAILS: JSONContent = {
  type: 'details',
  attrs: { open: true },
  content: [{ type: 'detailsSummary' }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }],
};

export const Collapsible = Extension.create({
  name: 'collapsible',
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
