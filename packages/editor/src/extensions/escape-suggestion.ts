import { Extension } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Spec §2 originally named a visible mechanic here: when a typed reserved
 * character sequence triggered formatting, an inline chip offered the
 * escaped literal, so nothing silently became markup. **That visible offer
 * is WITHDRAWN (owner ruling 2026-09-24)** — the chip, the `Escape`
 * keyboard shortcut that dismissed it, and the `dismissed` bookkeeping that
 * shortcut needed are all deleted. What remains, and is unchanged in
 * substance, is the REPAIR below: pressing Backspace immediately after a
 * reserved sequence still reverts the conversion and restores the literal
 * typed characters, for every one of the 21 registered input rules. Nothing
 * renders to advertise that window; it is simply what Backspace does if you
 * use it right away.
 *
 * THE MECHANISM DESCRIBED IN THIS PLAN'S TASK TEXT DOES NOT WORK AS WRITTEN,
 * and the gap is not cosmetic — it is the reason this file does not read
 * back the way Step 4 specifies it. What follows is what was verified
 * (Task 5 Step 1, extended past what the plan step asked for) and the
 * design built to survive it.
 *
 * Tiptap's own input-rules plugin (@tiptap/core@3.30.5, one instance PER
 * extension — dist:5220-5226) stores the just-applied rule as `{ transform,
 * from, to, text }` on itself via `tr.setMeta(plugin, ...)` the moment a
 * rule fires (dist:4788), and `undoInputRule` (dist:2895-2911) reads that
 * same per-plugin state. The store IS the trigger signal — for a rule that
 * changes a MARK (bold, italic, strike, code) or inserts a leaf node that
 * leaves a paragraph in its wake (horizontalRule). It is NOT the signal for
 * a rule that changes the BLOCK TYPE of the last node in the document
 * (heading, blockquote, bulletList, orderedList, codeBlock): StarterKit
 * bundles `TrailingNode` (@tiptap/extensions@3.30.5 dist:609-653), whose
 * `appendTransaction` runs an `ensure the doc ends in a paragraph` check
 * after EVERY doc-changing transaction and, finding the just-converted
 * heading/list/quote/code-block sitting last with no trailing paragraph
 * after it, appends ITS OWN transaction inserting one. That second,
 * unrelated transaction has `docChanged: true` and carries none of the
 * input-rule plugin's meta, so that plugin's OWN `state.apply` (dist:4788:
 * `return tr.selectionSet || tr.docChanged ? null : prev`) reads it as "the
 * doc changed for an unrelated reason" and clears the very state
 * `undoInputRule` was about to read — inside the SAME dispatch, before any
 * external code (a test, a decoration, `editor.commands.undoInputRule`)
 * gets a chance to observe it. Verified empirically (not just read from the
 * dists): typing "# " leaves EVERY one of the ten input-rule plugins'
 * `getState()` null even though `tr.getMeta(theHeadingPlugin)` was true on
 * the very transaction that fired; typing "x **bold**" or "---" leaves the
 * record intact, because a mark change and a horizontalRule (which inserts
 * itself BEFORE the existing paragraph, per `nodeInputRule`'s no-capture-
 * group branch, dist:6906+) both still end the doc in a paragraph.
 *
 * Concretely: 11 of the trigger table's 13 declared block triggers (all six
 * heading levels, bulletList, orderedList, blockquote, codeBlock's two
 * rules) are wiped before Tiptap's own `undoInputRule` could ever see them;
 * only horizontalRule and the six mark triggers survive Tiptap's own
 * mechanism. `editor.commands.undoInputRule()` — which the plan's own test
 * file calls directly on all nineteen cases, and which core's Backspace
 * keymap also calls (dist:5670) — would return `false` on those eleven no
 * matter what this extension's plugin state holds, because it is CORE's
 * command, reading CORE's plugins.
 *
 * THE FIX, in two parts:
 *
 * 1. Detection that does not depend on the wiped state surviving. This
 *    plugin's OWN `appendTransaction(transactions, oldState, newState)`
 *    scans `transactions` directly for the meta — including the ORIGINAL
 *    one that carried it, which is never mutated or stripped, only
 *    superseded in the OTHER plugin's derived state.
 *
 *    ProseMirror's `appendTransaction` contract is NOT "every plugin is
 *    rerun each round with the complete set" — it is per-plugin and
 *    incremental (prosemirror-state@1.4.4 dist:800-822, the body of
 *    `applyTransaction`'s `for (;;)`): each plugin tracks its own count `n`
 *    of transactions already shown to it, is called with only the
 *    transactions added since (`n ? trs.slice(n) : trs`), and is
 *    SKIPPED — its `appendTransaction` never invoked — on a round where
 *    `n >= trs.length`, i.e. nothing new arrived for it since its last
 *    look. A plugin reordered earlier in the extension list can genuinely
 *    stop seeing a later plugin's append.
 *
 *    That contract still leaves this scan safe, and not because of this
 *    plugin's position: `n` starts at 0 for every plugin's first-ever call
 *    in a dispatch (dist:805, `seen ? seen[i].n : 0`), and `n = 0` always
 *    yields the FULL `trs`, never a skip. The transaction carrying the
 *    input-rule meta is `trs[0]`, set (dist:796, `trs = [rootTr]`) before
 *    the `for (;;)` loop (dist:800) even starts — so it is inside
 *    every plugin's first look, this one's included, regardless of
 *    registration order. Verified, not just read from source: moving a
 *    throwaway `appendTransaction` plugin in after this one — so this
 *    plugin is no longer the last such plugin registered — left all 27
 *    escape-suggestion tests green; reverted immediately after. (Contrast
 *    part 2 below: the `undoInputRule` COMMAND override genuinely does
 *    depend on this extension being last — that is a different resolution
 *    mechanism, Tiptap's command table, not this one.)
 *    Once found, it appends a second, DOC-INERT transaction (no steps, one
 *    `setMeta`, `addToHistory: false`) carrying the captured record — a
 *    transaction this plugin's own `state.apply` DOES read (checked first,
 *    before the generic "doc or selection changed, clear" rule that mirrors
 *    core's), so the capture survives as the trailing entry in whatever
 *    sequence of transactions the dispatch produced.
 *
 * 2. `undoInputRule` is a command name, not a fixed function — Tiptap's
 *    `ExtensionManager.commands` builds the resolved command table with
 *    `extensions.reduce((commands, ext) => ({ ...commands, ...ext.
 *    addCommands() }), {})` (dist:5172-5185), and core's Backspace keymap
 *    calls `this.editor.commands.undoInputRule()` — the LIVE resolved
 *    command, not a captured reference (dist:5670) — so a later extension
 *    naming the same command replaces it everywhere, keymap included.
 *    Verified empirically before relying on it: a throwaway extension
 *    appended after this package's full list intercepted both the direct
 *    call and confirmed the override is total. `EscapeSuggestion` is the
 *    LAST entry `buildEditorExtensions` returns (schema/extensions.ts), so
 *    its `addCommands` is the one that wins. The command inverts the
 *    captured transform's own steps — never anything that happened after it
 *    (TrailingNode's appended paragraph is a separate transaction with its
 *    own steps, untouched) — the same construction core's own
 *    `undoInputRule` uses (dist:2903-2911), just reading from a record this
 *    plugin kept alive instead of one core already dropped.
 *
 * A REAL Backspace keypress (`view.someProp('handleKeyDown', ...)` with a
 * genuine event, exactly how the browser drives it) exercises this command
 * once and produces the correct literal. Tiptap's OWN test-only
 * `editor.commands.keyboardShortcut(name)` helper does not: it runs the
 * shortcut inside `editor.captureTransaction(...)` (core dist:895-902),
 * replaying the captured transaction's steps onto a SEPARATE outer
 * transaction via `step.map(outerMapping)` + `outerTr.maybeStep(...)` —
 * `maybeStep` swallows a step that fails to apply rather than throwing, and
 * empirically the trailing `replaceWith` (this command's last step) is the
 * one that does not survive that replay, silently dropping the restored
 * character. Confirmed by isolating the two paths: the real-event
 * dispatch's committed doc is correct on the first try; the helper's is
 * one character short every time.
 *
 * NOT JUST ASSERTED — DRIVEN, the same way Task 4's report insists a claim
 * about another component be driven rather than guessed at. This file's own
 * `addCommands` was temporarily deleted (a planted-defect-style isolation,
 * reverted immediately after) so core's UNMODIFIED `undoInputRule` ran
 * instead, on a mark trigger ("x **bold**") whose input-rule record this
 * file never touches — Tiptap's own store, unwiped, exactly as it is
 * without this file. `editor.commands.keyboardShortcut('Backspace')` still
 * mishandled it: not a one-character drop this time but a hard
 * `RangeError: Position 11 out of range` thrown from inside the helper's
 * own replay. Worse than this file's failure mode, not better — and with
 * zero code from this file on the call stack. The fault is in
 * `keyboardShortcut`'s capture-and-replay (core dist:895-902) for any
 * multi-step transaction ending in a position-shifting step; both core's
 * `undoInputRule` and this one build exactly that shape. Nothing in this
 * file can fix a core test helper, so the test drives a real keydown
 * instead of the helper.
 *
 * The literal itself is also not `record.text` alone — that field is only
 * the ONE character that completed the match (the not-yet-inserted
 * keystroke; confirmed empirically: typing "x **bold**" stores
 * `text: "*"`, not `"**bold**"`). `deriveLiteral` reconstructs the full
 * typed sequence from the transform's OWN pre-image (`transform.before`,
 * the doc as it stood immediately before the rule fired) plus that trailing
 * character — exactly the string Tiptap's own rule matcher tested
 * (`getTextContentFromNodes($from) + text`, dist:4753), so it is guaranteed
 * to contain whatever the rule's regex matched, not just echo the plan's
 * one-character sample.
 */

type InputRuleRecord = { transform: Transaction; from: number; to: number; text: string };

type EscapePluginState = { record: InputRuleRecord | null };

export const escapeSuggestionKey = new PluginKey<EscapePluginState>('escapeSuggestion');

/** Is this an input-rules plugin's stored record shape? Same fields core's own undoInputRule checks (dist:2903-2911). */
function isInputRuleRecord(value: unknown): value is InputRuleRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<InputRuleRecord>;
  return (
    candidate.transform !== undefined &&
    typeof candidate.from === 'number' &&
    typeof candidate.text === 'string'
  );
}

/**
 * Scans every transaction in the current dispatch group for a meta entry
 * belonging to one of the editor's own isInputRules plugins (one per
 * extension — census in test/rule-census.test.ts). Reads `transactions`
 * directly rather than any plugin's derived `getState`, which is exactly
 * the state TrailingNode's appendTransaction can — and for block-type
 * triggers, does — clear before this code runs (see file docblock).
 */
function findInputRuleRecordIn(transactions: readonly Transaction[], state: EditorState): InputRuleRecord | null {
  for (const tr of transactions) {
    for (const plugin of state.plugins) {
      const spec = plugin.spec as { isInputRules?: boolean };
      if (!spec.isInputRules) continue;
      const stored = tr.getMeta(plugin);
      if (isInputRuleRecord(stored)) return stored;
    }
  }
  return null;
}

/**
 * The full literal the user typed, reconstructed from the transform's own
 * pre-image rather than trusting `record.text` alone (see file docblock —
 * that field is one character). `record.from` is a position in
 * `record.transform.before` by construction (core computed it against
 * `view.state` before dispatching that same transform), so resolving it
 * there is always valid.
 *
 * For a MARK trigger this returns the whole block-text-before-the-match
 * plus the trailing character, not just the substring the rule regex
 * matched — so "x **bold**" derives literal "x **bold**", chip included,
 * even though only "**bold**" was ever at risk of becoming markup ("x "
 * was plain text before the rule fired and stays plain text after
 * accepting). This is a deliberate in-scope tradeoff, not deferred work:
 * `InputRuleRecord` does not carry the rule's own matched span, only
 * `from`/`to` (the ONE inserted character) and the pre-image, so narrowing
 * to the exact match would mean re-running each rule's own regex here,
 * duplicating logic this file does not own. It does not break the
 * mechanic — the prefix was literal both before and after either way, so
 * accepting still produces exactly the doc text the chip promised.
 */
function deriveLiteral(record: InputRuleRecord): string {
  const before = record.transform.before;
  const $pos = before.resolve(record.from);
  const blockTextBefore = $pos.parent.textBetween(0, $pos.parentOffset);
  return blockTextBefore + record.text;
}

/**
 * Whether there is a pending undo-able record — tests read this to check
 * internal state. No visible chip renders from this any more (owner ruling
 * 2026-09-24, withdrawing spec §2's chip mechanic); the record it reports
 * still drives `undoInputRule` below.
 */
export function getEscapeSuggestion(state: EditorState): { literal: string } | null {
  const pluginState = escapeSuggestionKey.getState(state);
  if (!pluginState?.record) return null;
  return { literal: deriveLiteral(pluginState.record) };
}

/**
 * Reverts exactly the captured transform's own steps — never anything a
 * later transaction (TrailingNode's appended paragraph, most notably) did —
 * then restores the one trailing character the rule consumed but never
 * placed in the document. Identical construction to core's own
 * `undoInputRule` (dist:2903-2911); the difference is only the source of
 * the record, which here survives the wipe described in the file docblock.
 */
function revertRecord(record: InputRuleRecord, state: EditorState): Transaction {
  const tr = state.tr;
  const toUndo = record.transform;
  for (let j = toUndo.steps.length - 1; j >= 0; j -= 1) {
    tr.step(toUndo.steps[j]!.invert(toUndo.docs[j]!));
  }
  if (record.text) {
    const marks = tr.doc.resolve(record.from).marks();
    tr.replaceWith(record.from, record.to, state.schema.text(record.text, marks));
  } else {
    tr.delete(record.from, record.to);
  }
  return tr;
}

export const EscapeSuggestion = Extension.create({
  name: 'escapeSuggestion',

  addCommands() {
    return {
      // Overrides core's own `undoInputRule` (see file docblock, part 2):
      // Tiptap resolves commands by name from the LAST extension that
      // defines them, and core's Backspace keymap calls the resolved
      // `editor.commands.undoInputRule()` at press-time, not a captured
      // reference — so this is the command Backspace runs too.
      undoInputRule:
        () =>
        ({ state, dispatch }: { state: EditorState; dispatch?: (tr: Transaction) => void }) => {
          const record = escapeSuggestionKey.getState(state)?.record ?? null;
          if (!record) return false;
          if (dispatch) dispatch(revertRecord(record, state));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<EscapePluginState>({
        key: escapeSuggestionKey,
        state: {
          init: () => ({ record: null }),
          apply(tr, prev) {
            const meta = tr.getMeta(escapeSuggestionKey) as { capture: InputRuleRecord } | undefined;
            if (meta && typeof meta === 'object') return { record: meta.capture };
            // A transaction ProseMirror itself appended within the CURRENT
            // dispatch group (prosemirror-state tags every one with this
            // meta, pointing at the group's root tr — dist:714) is a
            // companion of whatever just happened, not a new, separate user
            // action. Concretely: TrailingNode's own appendTransaction fires
            // in the same group as a heading/list/blockquote/codeBlock
            // conversion (see file docblock) to keep the doc ending in a
            // paragraph, and its insert has `docChanged: true` — without this
            // guard it would clear the record THIS plugin just captured from
            // that very same conversion, one line above.
            if (tr.getMeta('appendedTransaction')) return prev;
            // Anything else that changed the doc or the selection is a new
            // user action (more typing, a click, an external edit), and the
            // undo window closes: `undoInputRule` only reverts IMMEDIATELY
            // after the trigger, never after further typing.
            if (tr.docChanged || tr.selectionSet) return { record: null };
            return prev;
          },
        },
        appendTransaction(transactions, _oldState, newState) {
          const current = escapeSuggestionKey.getState(newState);
          const found = findInputRuleRecordIn(transactions, newState);
          if (!found || current?.record === found) return null;
          // `addToHistory: false`: this is bookkeeping, not an edit — it
          // must not become its own undo step.
          return newState.tr.setMeta(escapeSuggestionKey, { capture: found }).setMeta('addToHistory', false);
        },
      }),
    ];
  },
});
