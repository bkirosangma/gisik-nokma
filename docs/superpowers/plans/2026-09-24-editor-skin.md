# Editor Skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (Native execution chosen: the executor already holds the full measurement context below, which a fresh subagent would have to re-derive; the tasks are also NOT independent — Task 3 turns Task 2's coverage test green, Task 5 depends on Task 4's table skin classes — so subagent-driven-development's per-task fresh-context isolation buys nothing here.)

**Goal:** Skin every node/mark/chip/chrome the editor renders (currently 0 rules in `apps/web/app/globals.css` for any of it), remove the visible escape-suggestion chip while keeping its Backspace-undo repair, and skin + add a floating command toolbar for tables.

**Architecture:** One new "Editor skin" section in `apps/web/app/globals.css`, scoped under `.ticket-editor__content` (the one wrapper class present in every render of the live editor — composer and note document, editing and read-only), using only `var(--gn-*)` tokens. `packages/editor/src/styles/editor.css` stays colour-free per its own header rule. The escape-suggestion chip is deleted from `packages/editor/src/extensions/escape-suggestion.ts`; its `undoInputRule` repair and appendTransaction capture logic are kept unchanged. A new `TableFloatingToolbar` component ports the owner's knowledge-base component into `packages/editor`, styled from the same skin section.

**Tech Stack:** Tiptap 3.30.5 / ProseMirror, React, Vitest + jsdom, the `--gn-*` CSS custom-property token system (`packages/ui/src/tokens.ts`).

**Spec:** The owner's dispatch brief (relayed by planner `gisik-nokma-notes-28 [a875ed]`, 2026-09-24, plus two addenda) — no separate spec doc; the brief IS the spec and travels with this plan by reference. Case-id block `9.338`–`9.367` in `test-cases/09-editor-attachments.md` (reserved by controller commit `4771ae62`).

## Global Constraints

- `packages/editor/src/styles/editor.css` — **structural only, no colour of any kind** (its header rule; `var(--gn-*)` references are the one precedented exception, already used in that file's composer-chrome/toolbar blocks, but new rules for THIS task go in `globals.css` per the brief's explicit instruction).
- All new colour comes from `var(--gn-<kebab-role>)` — no hex/rgb/hsl/color-mix (the colour scanner in `packages/ui/test/helpers/colour-scan.ts` bans them in every root it covers, `apps/web/app` included).
- Under the shipped `neo` style, `surface`/`surfaceRaised`/`surfaceSunken` are the SAME hex — never use `surfaceSunken` for a "sunken" look; use a `fill*` role or a shadow.
- Scope root for every content-element selector: `.ticket-editor__content` (confirmed present in the note document, the comment composer, and the note's read-only view — all three route through `TicketEditorSlot`/`TicketEditor.tsx:269`). Selectors on bare elements (`table`, `code`, `pre`, `blockquote`, `hr`, `h1`-`h3`) MUST be scoped this way or they leak onto the rest of the product.
- Out of scope, do not touch: `.mention-popup*`, `.wikilink-popup*`, `.ticketref-popup*` (suggestion popups) and `.ticket-editor__toolbar`/`.ticket-editor__tool*` (the main `EditorToolbar`) — both already fully skinned, and both are `task/editor-polish`'s Unit 3/4. If a defect is found there, record it in the PR body; do not fix it.
- Case ids for this lane: `9.338`–`9.367` (30 total; `task/editor-polish` separately holds `9.313`–`9.337`). This plan mints `9.338`, `9.339`, `9.341`, `9.344`, `9.348`, `9.349`, `9.350`, `9.351`, `9.352` (9 ids, not a contiguous run — this repo's convention allows non-contiguous minting from a block, e.g. case `9.295`'s "taken from the block's own spare tail") and leaves `9.340`, `9.342`-`9.343`, `9.345`-`9.347`, `9.353`-`9.367` unspent for the controller's tail. Task 7 recounts against what was actually written before finalizing the catalogue, since edits during implementation may shift which ids end up spent.
- Branch `task/editor-skin` off `origin/release/notes`; PR `--base release/notes`. CI does not run on this PR (only the release→`main` PR runs `ci.yml`); the merge into `release/notes` is reviewed and merged autonomously per the coordination doc's standing authorization, on a LOCAL green run, reported as local.
- This worktree has **no `node_modules`** (fresh worktree). Step 1 of Task 0 installs before anything else runs.

## Measurements already taken (do not re-derive)

1. **CSS load order**: `apps/web/app/layout.tsx:3-5` loads `ui.css`, then `editor.css`, then `globals.css` — `globals.css` is LAST, so a single-class rule there wins over anything of equal specificity in `editor.css` (`.editor-details`, `.wikilink-preview`, `.editor-wikilink--missing`, etc.). No specificity workaround needed.
2. **`apps/web/app/globals.css` currently has ZERO rules for any editor-drawn class** — corrected from the brief's own claim of one (`.mention-popup`): the only hit is a docblock comment at `globals.css:1826` citing `.mention-popup`'s z-index for unrelated reasoning; the real `.mention-popup { z-index: 30; … }` rule lives in `editor.css:40-45`. `apps/web/app/globals.css` contributes nothing to editor styling today.
3. **The note's "read view" is NOT a separate static renderer.** `apps/web/src/notes/note-document.tsx:459-462` always mounts the live `TicketEditorSlot` with `readOnly={!canEdit}` — reading a note uses the exact same Tiptap DOM/node-views as editing it (confirmed: only one `.editor-*` rendering path to skin for notes).
4. **Comment THREAD bodies are a separate, static renderer** — `packages/app-core/src/views/comment-body.tsx`'s `renderCommentBody`/`renderNode` builds React elements directly from the stored doc JSON, with its OWN class family (`gn-comment__*`: `__list`, `__quote`, `__code`, `__mention`, `__details`, `__wikilink`, `__ticketref`, `__task`) — entirely disjoint from `.editor-*`. **It has NO case for `table`/`tableRow`/`tableCell`/`tableHeader`** — a table in a comment currently falls through to the "unknown type renders its children" branch (`comment-body.tsx:297`), producing nested `<Fragment>`s with no `<table>`/`<tr>`/`<td>` at all. **AND `gn-comment__*` carries zero CSS anywhere** (confirmed: 0 matches in `globals.css`). Table support for comment bodies is IN this plan's scope (the brief names it explicitly); skinning the other seven `gn-comment__*` families (already unstyled today, for every mark/list/quote/code/details/task in every comment ever rendered) is a separate, much larger gap — **out of scope, flagged as a follow-up in the PR body, not fixed here.**
5. **`.ticket-editor { position: relative; }`** already (`editor.css:106-108`) and it wraps `EditorToolbar` + `EditorContent` (`TicketEditor.tsx:255-269`) in both note and comment modes. This is the anchor for the table toolbar — absolutely positioned against `.ticket-editor`, never `position: fixed` (which breaks inside a transformed `Sheet`/`Dialog`, where the ticket description editor lives).
6. **`@tiptap/extension-table@3.22.3`+ wraps its table in `<div class="tableWrapper"><table>…</table></div>`** by default (`renderWrapper` defaults true; confirmed in the installed dist at `knowledge-base/node_modules/@tiptap/extension-table/dist/index.js:230,500`). `.tableWrapper` is the horizontal-scroll container; `.selectedCell` is ProseMirror-tables' own class for a multi-cell selection, applied as-is (confirmed by the brief, standard prosemirror-tables behaviour).
7. **TaskItem renders `li[data-type="taskItem"]`** (confirmed by this repo's own prior measurement, quoted twice in `markdown-clipboard.test.ts:88,157`); TaskList renders the sibling `ul[data-type="taskList"]` by the same Tiptap convention. Not independently re-verified against the installed dist in this pass — Task 3's first step renders the gallery fixture and reads `editor.view.dom.outerHTML` to confirm before the selector is relied on, the same discipline `editor.css:539-551` already records for `.editor-details > summary`.
8. **Escape-suggestion trigger coverage is stale.** `escape-suggestion.test.ts`'s trigger table has 20 rows (13 block + 7 mark); `extensions.ts`'s own rule census is **21 input rules across 13 extensions** (heading×6, bold×2, italic×2, codeBlock×2, blockquote, bulletList, code, orderedList, strike, horizontalRule, link, **taskItem, collapsible**). The table is missing **taskItem** (`[ ] `/`[x] `) and **collapsible** (`< ` at an empty line start) entirely, and codeBlock's SECOND input-rule variant is untested. The owner's addendum ("for ANY markdown shortcut") requires all 21.
9. **`getEscapeSuggestion` has exactly one consumer outside the extension and its own test**: `packages/editor/src/index.ts:26` (a barrel re-export). Nothing else imports it — safe to keep it exported (tests still use it) or simplify; no toolbar currently reads it despite the old docblock's "tests and toolbars read this."
10. **`docs/manual.md` and `docs/faq.md` have ZERO mentions of the chip** (`escape`/`Keep … as text`/`Backspace or click` all return no hits), and no section discusses editor markdown shortcuts at all. The addendum's "remove any mention of the chip" has nothing to act on; recorded as measured rather than silently skipped. Not adding new documentation structure for this (out of proportion to a CSS/behaviour lane) — flagged as a follow-up.
11. **Token roles available** (`packages/ui/src/tokens.ts`'s `TOKEN_ROLES`): `surface`, `surfaceRaised`, `surfaceSunken`, `surfaceOverlay`, `text`, `textMuted`, `textSubtle`, `textInverted`, `textAccent`, `border`, `borderStrong`, `fillPrimary…Quaternary`, `tintWarning`, `focusRing`, `shadow`, `brand`, `accent`, `accentText`, `danger*`, `warning*`, `success*`, plus category roles. **No `divider` or `selection` role exists** — table borders use `border`/`borderStrong`; the selected-cell highlight uses `fillQuaternary` (a background wash, consistent with `.editor-slot__footer`'s existing use of the same role for a "tray" surface). `--gn-radius-control`, `--gn-shadow-raised`, `--gn-font-mono` are confirmed live CSS vars already used elsewhere in this file set.
12. **No icon library exists anywhere in `packages/ui` or `packages/editor`** (`lucide`, `svg`, `"icons"` all return zero hits in both `package.json`s). The house pattern (`EditorToolbar.tsx`) is short text/glyph labels (`B`, `i`, `code`, `☐`, `</>`, `▸`) with a descriptive `aria-label` — the table toolbar follows this pattern instead of adding `lucide-react`.
13. **Tap-target precedent**: the main toolbar's buttons are `min-height: 32px; min-width: 34px` (`editor.css:157-170`), not the 44px standalone floor (`.gn-skip`) — that floor is for standalone controls; grouped toolbar buttons use 32/34px. The table toolbar and the code-block copy button follow the 32/34px precedent.
14. **`ResizeObserver` is not global under jsdom** by default; `packages/app-core/test/setup.ts:35` already ships a `ResizeObserverShim` class. The table toolbar's positioning `useEffect` (ported from the KB component) must be guarded/shimmed in tests the same way.
15. **`task/editor-polish`'s own diff against `release/notes`** (`Features.md`, `apps/web/src/ticket-ref-callbacks.ts`, its test, `test-cases/09…md`) shows **no tooltip component has landed yet** — the table toolbar ships with `title` + `aria-label` only, with a one-line note in the PR body that a shared tooltip should replace it once editor-polish's lands.

## Review Focus

- **A table pasted or created inside a COMMENT** (not a note) currently produces malformed, unstructured HTML with no `<table>` at all — silent data-shape loss the owner's screenshot didn't show but the brief's own instruction ("confirm it gets the skin") surfaces. Task 4 fixes the table case only; the other seven `gn-comment__*` families stay unstyled (recorded, not fixed).
- **A wide table must scroll inside the document, never widen the page** — `.tableWrapper` needs `overflow-x: auto` and a `max-width: 100%`; without it a long table pushes `.ticket-editor__content` (and the page) wider, the same class of bug the `overflow-wrap: anywhere` comments throughout `globals.css` exist to prevent elsewhere.
- **The code-block copy button must never leave the keyboard tab order** — an opacity-based show/hide (not `display`/`visibility`) is required so Tab still reaches it even when the pointer isn't hovering the block; Task 3's coverage test pins this as a real assertion, not a comment.
- **Removing the escape chip must not silently break Backspace-undo for the two 2026-09-23 block additions (taskItem, collapsible)** — the docblock's own empirical proof only covers heading/list/quote/codeBlock; collapsible ships its OWN Backspace keymap, so the interaction between the two overrides must be measured, not assumed, before the case is written.
- **The table floating toolbar must never render in a read-only mount** (comment thread view, or `readOnly` note) — a control that runs a mutating table command against a document the surface won't let you save is a worse defect than no control at all; Task 5 asserts this as a mutation-tested case, not a visual check alone.

---

## Task 0: Environment, baseline

**Files:** none changed.

- [ ] **Step 1: Install dependencies.** This worktree has no `node_modules`. Run:
  ```bash
  node --version   # confirm a Node 22.x is first on PATH — Node 24 fails pnpm install silently in this repo (recorded lesson)
  pnpm install
  ```
- [ ] **Step 2: Baseline green.** Run the two suites this plan will touch, to have a clean before/after:
  ```bash
  pnpm --filter @gisik-nokma/editor test 2>&1 | tail -40
  pnpm --filter @gisik-nokma/web test 2>&1 | tail -40
  ```
  Expected: both pass (or record any pre-existing failure here verbatim before touching anything, so this lane is never blamed for it).
- [ ] **Step 3: Render the gallery fixture's raw DOM once**, to settle Measurement 7 (taskItem/taskList attributes) before Task 3 relies on them. Add a throwaway scratch file (not committed) `packages/editor/test/.scratch-dom.test.ts`:
  ```ts
  import { it } from 'vitest';
  import { createTestEditor } from './helpers/create-editor.js';
  import { typeText } from './helpers/type-text.js';

  it('scratch: print task list DOM', () => {
    const editor = createTestEditor();
    typeText(editor, '[] a task\n');
    // eslint-disable-next-line no-console
    console.log(editor.view.dom.innerHTML);
    editor.destroy();
  });
  ```
  Run `pnpm --filter @gisik-nokma/editor vitest run .scratch-dom -t "scratch"`, read the printed HTML, confirm `li[data-type="taskItem"]` / `ul[data-type="taskList"]` (or record the actual attributes if different), then delete the scratch file.

---

## Task 1: Unit R — remove the escape chip, keep the undo repair, extend trigger coverage

**Files:**
- Modify: `packages/editor/src/extensions/escape-suggestion.ts`
- Modify: `packages/editor/test/escape-suggestion.test.ts`
- Modify: `packages/editor/src/schema/extensions.ts:136-152,333-338` (prose only — the comment blocks describing the chip mechanic)
- Modify: `packages/editor/src/styles/editor.css:81-101` (delete `.escape-chip`/`.escape-chip__label`/`.escape-chip__hint`; fix `.ticket-editor__hint`'s "see `.escape-chip__hint`" cross-reference at line ~187-189)
- Modify: `test-cases/09-editor-attachments.md` (catalogue: flip 3 cases to 🚫, edit 1 description)

**Interfaces:**
- Consumes: nothing new.
- Produces: `getEscapeSuggestion(state): { literal: string } | null` (unchanged signature, simplified body — Task 3's coverage test and any future caller can still use it to check "is there a pending undo record" without a DOM chip to query).

- [ ] **Step 1: Measure collapsible's Backspace behaviour BEFORE changing anything.** Collapsible ships its own Backspace keymap (`packages/editor/src/extensions/collapsible.ts`, case `9.295`). Write a throwaway probe:
  ```ts
  import { it } from 'vitest';
  import { createTestEditor } from './helpers/create-editor.js';
  import { typeText } from './helpers/type-text.js';

  it('scratch: collapsible backspace-immediately', () => {
    const editor = createTestEditor();
    typeText(editor, '< ');
    const before = editor.state.doc.toJSON();
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    const handled = editor.view.someProp('handleKeyDown', (h) => h(editor.view, event));
    console.log({ handled, doc: editor.state.doc.toJSON(), before });
    editor.destroy();
  });
  ```
  Run it, and separately with `EscapeSuggestion`'s `undoInputRule` override temporarily commented out of `addCommands`, to see whether collapsible's own keymap already handles Backspace-immediately independent of the override (i.e. whether removing the override changes collapsible's outcome at all). Record the finding in this file before Step 2, then delete the probe.

- [ ] **Step 2: Rewrite `escape-suggestion.ts`** — delete `buildChip`, the `props: { decorations… }` block, and `addKeyboardShortcuts` (the `Escape` dismiss). Simplify plugin state to drop `dismissed` (it existed only to gate the chip's Escape-dismiss; the record-clearing on continued typing/selection, which the undo window's "immediately" requirement depends on, is untouched):
  ```ts
  type EscapePluginState = { record: InputRuleRecord | null };

  export const escapeSuggestionKey = new PluginKey<EscapePluginState>('escapeSuggestion');

  // ... isInputRuleRecord, findInputRuleRecordIn, deriveLiteral, revertRecord: UNCHANGED ...

  /** Whether there is a pending undo-able record — tests read this to check internal state (no visible chip). */
  export function getEscapeSuggestion(state: EditorState): { literal: string } | null {
    const pluginState = escapeSuggestionKey.getState(state);
    if (!pluginState?.record) return null;
    return { literal: deriveLiteral(pluginState.record) };
  }

  export const EscapeSuggestion = Extension.create({
    name: 'escapeSuggestion',

    addCommands() {
      return {
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
              if (tr.getMeta('appendedTransaction')) return prev;
              if (tr.docChanged || tr.selectionSet) return { record: null };
              return prev;
            },
          },
          appendTransaction(transactions, _oldState, newState) {
            const current = escapeSuggestionKey.getState(newState);
            const found = findInputRuleRecordIn(transactions, newState);
            if (!found || current?.record === found) return null;
            return newState.tr.setMeta(escapeSuggestionKey, { capture: found }).setMeta('addToHistory', false);
          },
        }),
      ];
    },
  });
  ```
  Delete the now-unused `Decoration`/`DecorationSet` import.

- [ ] **Step 3: Rewrite `escape-suggestion.test.ts`'s trigger tables to all 21 rules**, add case `9.338` (chip absence + positive control + Escape no-op) and `9.339` (Backspace-immediately for block rules, mark rules as control):
  ```ts
  const BLOCK_TRIGGERS: Trigger[] = [
    // ...existing 13 rows unchanged...
    { typed: '[] ', label: 'task item', formatted: (e) => firstBlock(e).type === 'taskList' },
    { typed: '~~~ ', label: 'code block (tilde fence)', formatted: (e) => firstBlock(e).type === 'codeBlock' },
    { typed: '< ', label: 'collapsible', formatted: (e) => firstBlock(e).type === 'details' },
  ];
  // MARK_TRIGGERS: existing 7 rows unchanged. 13 + 3 + 7 = 23 rows testing 21 registered
  // rules (bullet's 3 marker variants and codeBlock's 2 fence variants both collapse to
  // one rule each in the census; every registered rule is exercised at least once).

  /**
   * 9.338 — no visible escape affordance for ANY markdown shortcut (owner ruling
   * 2026-09-24, withdrawing spec §2's chip mechanic): no `[data-escape-chip]` and
   * no `.escape-chip` element in the DOM after any of the 21 rules, with a
   * positive control that the conversion actually fired (so a no-op `typeText`
   * cannot pass this vacuously); Escape performs no special handling any more.
   */
  it.each([...BLOCK_TRIGGERS, ...MARK_TRIGGERS])(
    '$label: no chip in the DOM, formatting still applies',
    ({ typed, formatted }) => {
      const editor = createTestEditor();
      typeText(editor, typed);
      expect(formatted(editor), `"${typed}" should have autoformatted`).toBe(true);
      expect(editor.view.dom.querySelector('[data-escape-chip]')).toBeNull();
      expect(editor.view.dom.querySelector('.escape-chip')).toBeNull();
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      expect(editor.view.someProp('handleKeyDown', (h) => h(editor.view, event)) ?? false).toBe(false);
      editor.destroy();
    },
  );

  /**
   * 9.339 — Backspace immediately after a BLOCK-type shortcut still reverts it to
   * literal text (owner's ADDENDUM wording), via a real keydown. Mark triggers
   * are the CONTROL: the mutation below must leave them green, proving the
   * override — not some other mechanism — is what block triggers depend on.
   */
  const BLOCK_UNDO_CASES = [
    { typed: '# ', label: 'heading' },
    { typed: '> ', label: 'blockquote' },
    { typed: '- ', label: 'bulletList' },
    { typed: '1. ', label: 'orderedList' },
    { typed: '``` ', label: 'codeBlock (backtick)' },
    { typed: '[] ', label: 'taskItem' },
    { typed: '< ', label: 'collapsible' },
  ];
  it.each(BLOCK_UNDO_CASES)('$label: Backspace immediately reverts to literal text', ({ typed }) => {
    const editor = createTestEditor();
    typeText(editor, typed);
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    const handled = editor.view.someProp('handleKeyDown', (h) => h(editor.view, event));
    expect(handled, `Backspace after "${typed}" should be handled`).toBe(true);
    expect(editor.state.doc.textContent).toContain(typed.trim());
    editor.destroy();
  });

  it('CONTROL — a mark trigger stays green under the same Backspace path', () => {
    const editor = createTestEditor();
    typeText(editor, 'x **bold**');
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    expect(editor.view.someProp('handleKeyDown', (h) => h(editor.view, event))).toBe(true);
    expect(editor.getHTML()).not.toContain('<strong');
    editor.destroy();
  });
  ```
  Delete `buildChip`-dependent tests `9.90` ("clicking the chip accepts") and `9.91`/`9.93` (Escape dismiss/no-op) entirely from this file — their catalogue rows are flipped to 🚫 in Step 6, not deleted from the catalogue. Edit case `9.88`'s remaining assertions to drop the `[data-escape-chip]` checks (keep the formatting + `undoInputRule` assertions). Leave `9.92` and `9.260` as-is (neither queries the DOM chip).

- [ ] **Step 4: Run the suite, confirm every rewritten/added test passes and the deleted-mechanism tests are gone, not just skipped:**
  ```bash
  pnpm --filter @gisik-nokma/editor vitest run escape-suggestion
  ```

- [ ] **Step 5: Delete the CSS.** In `packages/editor/src/styles/editor.css`, remove the `.escape-chip`/`.escape-chip__hint` block (lines 81-101) and fix `.ticket-editor__hint`'s comment (lines ~186-189) which cites `.escape-chip__hint` as its floor precedent — rewrite to cite the type-scale file directly instead:
  ```
  /* 0.75rem — the prototype's own 12px (`:1173`), and this file's established
     floor for secondary text (`apps/web/e2e-viewport/type-scale.ts`). */
  ```

- [ ] **Step 6: Update prose in `schema/extensions.ts`.** At the block spanning roughly `:136-152` (the E2-46 paragraph about the escape mechanic covering the typed link) and `:333-338` (the Task 5 summary comment), replace every sentence describing the CHIP as user-visible with a note that the visible offer was withdrawn by owner ruling 2026-09-24 and only the Backspace-undo repair remains; do not leave a docblock asserting a chip that no longer renders (this repo has a named failure mode for exactly that: `docblock-asserting-a-gap-is-not-the-gap`).

- [ ] **Step 7: Flip the catalogue.** In `test-cases/09-editor-attachments.md`, within the `9.338`-`9.367` block (or amending the pre-existing rows they reference — the ✅/🚫 rows for `9.88`/`9.90`/`9.91`/`9.93` live earlier in the file, in the `9.261`-`9.312` range read in Task-0):
  - `9.90` → 🚫 — reason: "visible chip removed, owner ruling 2026-09-24 (spec §2's chip mechanic withdrawn)"
  - `9.91` → 🚫 — same reason
  - `9.93` → 🚫 — same reason (the Escape-dismiss gate this asserted no longer exists)
  - `9.88` → edit description in place (still ✅): drop "...and surfaces the escape suggestion (a `[data-escape-chip]` in the DOM)"; keep "...applies its formatting AND accepting via `undoInputRule` reverses it, leaving the literal typed characters."
  - Add `9.338`, `9.339` as new ✅ rows under the block header, each naming its mutation per Step 3's tests, plus a one-line note recording Step 1's collapsible measurement.

- [ ] **Step 8: Commit.**
  ```bash
  git add packages/editor/src/extensions/escape-suggestion.ts packages/editor/test/escape-suggestion.test.ts packages/editor/src/schema/extensions.ts packages/editor/src/styles/editor.css test-cases/09-editor-attachments.md
  git commit -m "Unit R: remove the escape-suggestion chip, keep Backspace-undo, extend coverage to all 21 rules"
  ```

---

## Task 2: Skin coverage test (RED — written before the skin exists)

**Files:**
- Create: `apps/web/test/editor-skin-coverage.test.ts`

**Interfaces:**
- Consumes: `createTestEditor` (`packages/editor/test/helpers/create-editor.js` — re-import path from `apps/web/test/`, adjust relative path or import the built package `@gisik-nokma/editor`'s test helper is NOT exported; this test imports `buildEditorExtensions` from `@gisik-nokma/editor` directly and builds its own headless `Editor`, mirroring `create-editor.ts`'s shape rather than reaching into `packages/editor/test/`).
- Produces: a documented, explicit class list (`EDITOR_CONTENT_CLASSES`) that Task 3/4/5 extend as they add rules — this is the "self-checking exclusion list" the brief asks for.

- [ ] **Step 1: Write the fixture doc and the two-armed coverage test.** Comments are stripped before any search (the repo's own recorded failure mode: a docblock naming a selector satisfies a raw-text search). Class matching is by CSS-class BOUNDARY, not substring (`.editor-codeblock` must not be satisfied by `.editor-codeblock__copy`).
  ```ts
  import { readFileSync } from 'node:fs';
  import { dirname, resolve } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { describe, expect, it } from 'vitest';
  import { Editor } from '@tiptap/core';
  import { buildEditorExtensions } from '@gisik-nokma/editor';

  const TEST_DIR = dirname(fileURLToPath(import.meta.url));
  const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');

  function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
  }

  /**
   * Every class this plan skins, EXPLICITLY excluding:
   * - task/editor-polish's scope: suggestion popups and the main EditorToolbar
   *   (`.mention-popup*`, `.wikilink-popup*`, `.ticketref-popup*`,
   *   `.ticket-editor__toolbar`, `.ticket-editor__tool*`) — already fully
   *   skinned in editor.css and not this lane's to touch.
   * - `.attachment-item--upload` / `.attachment-item__name` — an EXISTING test
   *   (`test/attachment-list-item.test.tsx`) asserts these are deliberately
   *   unstyled; a coverage list that included them would fight that contract.
   * Task 3 adds the content/chip/chrome rows here as it writes their CSS; Task
   * 4/5 add the table + toolbar rows. A class present in this list with no CSS
   * rule is what turns this test red.
   */
  const EDITOR_CONTENT_CLASSES = [
    // -- filled in by Task 3, 4, 5 --
  ] as const;

  describe('9.341 editor skin — declared coverage', () => {
    const bare = stripComments(readFileSync(GLOBALS_CSS_PATH, 'utf8'));

    it.each(EDITOR_CONTENT_CLASSES)('globals.css declares a rule matching .%s', (cls) => {
      // Class-boundary match: the selector text contains `.cls` not immediately
      // followed by a class-name character (letter/digit/-/_).
      const pattern = new RegExp(`\\.${cls}(?![\\w-])`);
      expect(pattern.test(bare), `no rule selecting .${cls} in apps/web/app/globals.css`).toBe(true);
    });
  });

  describe('9.341 editor skin — matched-DOM coverage (paired arm)', () => {
    // A rule can exist and still match nothing the editor actually draws — the
    // repo's own recorded failure (`editor.css:539-551`, `.editor-details >
    // summary`). Task 3 fills GALLERY_DOC with one instance of every node/mark/
    // chip this plan skins and asserts each class from the list above matches
    // at least one real element.
  });
  ```
- [ ] **Step 2: Run it — confirm it is currently vacuous (empty list, 0 tests) rather than passing for the wrong reason:**
  ```bash
  pnpm --filter @gisik-nokma/web vitest run editor-skin-coverage
  ```
  Expected: 0 tests collected (the list is empty). This file is NOT committed yet — Task 3 fills in the class list and the gallery doc together, so the red→green transition is visible in one diff per class family.

---

## Task 3: Skin — content nodes/marks, chips, chrome

**Files:**
- Modify: `apps/web/app/globals.css` (new section, appended — does not touch editor-polish's future popup/toolbar section)
- Modify: `apps/web/test/editor-skin-coverage.test.ts` (fill `EDITOR_CONTENT_CLASSES` and `GALLERY_DOC`, add the matched-DOM arm)

**Interfaces:**
- Consumes: `EDITOR_CONTENT_CLASSES` array shape from Task 2.
- Produces: the "Editor skin" globals.css section other tasks append to (Task 4 adds a `## Tables` sub-section to the SAME header block, not a new one).

- [ ] **Step 1: Add the skin section to `apps/web/app/globals.css`** (append at end of file):
  ```css
  /* ── Editor skin — everything packages/editor draws ─────────────────────────
     packages/editor/src/styles/editor.css is structure-only (its own header
     rule); this is where that content gets its colour, from --gn-* tokens only.
     Scoped under .ticket-editor__content, the one wrapper class present in the
     note document, the comment composer, and the note's read-only view alike
     (TicketEditor.tsx:269) — never a bare element selector, or `table`/`code`/
     `blockquote` here would restyle every table and code element in the
     product. Excludes the suggestion popups and the main toolbar
     (task/editor-polish's own scope, already skinned in editor.css). */

  .ticket-editor__content h1 { margin: 1rem 0 0.5rem; font-size: 1.5rem; line-height: 2rem; font-weight: 700; }
  .ticket-editor__content h2 { margin: 0.875rem 0 0.5rem; font-size: 1.25rem; line-height: 1.75rem; font-weight: 600; }
  .ticket-editor__content h3 { margin: 0.75rem 0 0.375rem; font-size: 1.0625rem; line-height: 1.5rem; font-weight: 600; }
  .ticket-editor__content p { margin: 0.5rem 0; }
  .ticket-editor__content blockquote {
    margin: 0.5rem 0;
    padding-left: 0.75rem;
    border-left: 3px solid var(--gn-border-strong);
    color: var(--gn-text-muted);
  }
  .ticket-editor__content ul,
  .ticket-editor__content ol {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }
  .ticket-editor__content hr {
    margin: 1rem 0;
    border: none;
    border-top: 1px solid var(--gn-border);
  }
  .ticket-editor__content code {
    background: var(--gn-fill-quaternary);
    border-radius: 4px;
    padding: 0.1em 0.35em;
    font-family: var(--gn-font-mono);
    font-size: 0.875em;
  }
  /* Task list (spec's checklist). Selector confirmed against the real gallery
     DOM in Task 0 Step 3, not assumed — see this plan's Measurement 7. */
  .ticket-editor__content ul[data-type='taskList'] {
    list-style: none;
    padding-left: 0;
  }
  .ticket-editor__content li[data-type='taskItem'] {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  /* The fenced code block. `.editor-codeblock`'s own `position: relative` is
     editor.css's; this is its surface. `pre code` resets the inline-code rule
     above so the block does not draw a fill inside a fill. */
  .ticket-editor__content .editor-codeblock {
    background: var(--gn-fill-quaternary);
    border-radius: var(--gn-radius-control);
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    overflow-x: auto;
  }
  .ticket-editor__content .editor-codeblock pre {
    margin: 0;
    font-family: var(--gn-font-mono);
    font-size: 0.875rem;
    line-height: 1.5;
  }
  .ticket-editor__content .editor-codeblock code {
    background: none;
    padding: 0;
    font-size: inherit;
  }
  /* Quiet, opacity-shown: `display`/`visibility` would drop the button from
     the tab order, and a keyboard user tabbing into the block must still find
     it — hence :focus-visible and the hover:none arm for touch, not only
     :hover/:focus-within on the block. */
  .ticket-editor__content .editor-codeblock__copy {
    opacity: 0;
    background: var(--gn-fill-tertiary);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    color: var(--gn-text);
    transition: opacity 150ms;
  }
  .ticket-editor__content .editor-codeblock:hover .editor-codeblock__copy,
  .ticket-editor__content .editor-codeblock:focus-within .editor-codeblock__copy,
  .ticket-editor__content .editor-codeblock__copy:focus-visible {
    opacity: 1;
  }
  @media (hover: none) {
    .ticket-editor__content .editor-codeblock__copy { opacity: 1; }
  }
  .ticket-editor__content .editor-codeblock__copy:focus-visible {
    outline: 2px solid var(--gn-focus-ring);
    outline-offset: 2px;
  }

  /* The collapsible block, promoted from editor.css's bare currentColor
     border to the house surface treatment. */
  .ticket-editor__content .editor-details {
    background: var(--gn-fill-quaternary);
    border: none;
  }

  /* Chips: distinguished from plain text and from each other WITHOUT colour
     alone (house rule), and never underlined on hover (the note-badge rule,
     extended to every chip). */
  .ticket-editor__content .editor-mention {
    background: var(--gn-fill-tertiary);
    border-radius: 3px;
    padding: 0 0.25em;
  }
  .ticket-editor__content .editor-ticketref {
    border: 1px solid var(--gn-border);
    border-radius: 3px;
    padding: 0 0.25em;
  }
  .ticket-editor__content .editor-wikilink {
    color: var(--gn-text-accent);
    text-decoration: none;
  }
  .ticket-editor__content .editor-wikilink:hover { text-decoration: none; }
  .ticket-editor__content .editor-wikilink--missing { color: var(--gn-text-muted); }
  .ticket-editor__content .editor-mention:focus-visible,
  .ticket-editor__content .editor-ticketref:focus-visible,
  .ticket-editor__content .editor-wikilink:focus-visible {
    outline: 2px solid var(--gn-focus-ring);
    outline-offset: 2px;
  }

  /* The wiki-link hover preview: the house popover surface, replacing
     editor.css's system `Canvas` colour keyword (packages/editor cannot reach
     these tokens; this file can). */
  .wikilink-preview {
    background: var(--gn-surface-raised);
    box-shadow: var(--gn-shadow-raised);
    border: none;
  }

  /* Images: the frame the three wrap modes (editor.css) never got. */
  .ticket-editor__content .editor-image {
    border-radius: var(--gn-radius-control);
    box-shadow: var(--gn-shadow-raised);
  }
  ```
- [ ] **Step 2: Fill in `EDITOR_CONTENT_CLASSES` and the gallery doc in `editor-skin-coverage.test.ts`**:
  ```ts
  const EDITOR_CONTENT_CLASSES = [
    'editor-codeblock',
    'editor-codeblock__copy',
    'editor-details',
    'editor-mention',
    'editor-ticketref',
    'editor-wikilink',
    'editor-wikilink--missing',
    'editor-image',
  ] as const;

  const GALLERY_DOC = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'H1' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H2' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'H3' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Body ' }, { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }] }] },
      { type: 'horizontalRule' },
      { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] },
      { type: 'details', content: [
        { type: 'detailsSummary', content: [{ type: 'text', text: 'Summary' }] },
        { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }] },
      ] },
      { type: 'paragraph', content: [{ type: 'mention', attrs: { userId: 'u1', label: 'ana' } }] },
      { type: 'paragraph', content: [{ type: 'ticketRef', attrs: { ticketId: 't1', projectId: 'p1', key: 'AB-1', title: 'x' } }] },
      { type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Note' } }] },
      { type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: '', title: 'Missing' } }] },
    ],
  };

  describe('9.341 editor skin — matched-DOM coverage (paired arm)', () => {
    const editor = new Editor({ element: document.createElement('div'), extensions: buildEditorExtensions(), content: GALLERY_DOC });
    const root = editor.view.dom;

    it.each(EDITOR_CONTENT_CLASSES)('.%s matches at least one rendered element', (cls) => {
      expect(root.querySelector(`.${cls}`), `no element in the gallery matches .${cls}`).not.toBeNull();
    });
  });

  /**
   * 9.344 — the copy button stays in the tab order at rest: its hidden state
   * must be opacity, never `display`/`visibility` (a keyboard user tabbing
   * into the block must still be able to reach it before hovering).
   */
  describe('9.344 the code-block copy button hides via opacity, not display/visibility', () => {
    function ruleBody(css: string, selector: string): string {
      const start = css.indexOf(`${selector} {`);
      expect(start, `no rule for \`${selector}\``).toBeGreaterThan(-1);
      return css.slice(start, css.indexOf('}', start));
    }
    it('the base rule sets opacity: 0 and no display/visibility', () => {
      const body = ruleBody(bare, '.ticket-editor__content .editor-codeblock__copy');
      expect(body).toContain('opacity: 0');
      expect(body).not.toMatch(/display\s*:\s*none/);
      expect(body).not.toMatch(/visibility\s*:\s*hidden/);
    });
    it('a hover/focus-within/focus-visible rule restores opacity: 1', () => {
      expect(bare).toMatch(/\.editor-codeblock:hover \.editor-codeblock__copy,[\s\S]{0,300}opacity:\s*1/);
    });
  });
  ```
- [ ] **Step 3: Run, confirm green; then apply the mutation from the coverage test's own docblock** (delete the `.editor-codeblock` rules) and confirm it reddens both arms, then restore:
  ```bash
  pnpm --filter @gisik-nokma/web vitest run editor-skin-coverage
  ```
- [ ] **Step 4: Commit.**
  ```bash
  git add apps/web/app/globals.css apps/web/test/editor-skin-coverage.test.ts
  git commit -m "Editor skin: content nodes, marks, chips, and code-block/collapsible/wikilink-preview chrome"
  ```

---

## Task 4: Table skin + comment-body table rendering

**Files:**
- Modify: `apps/web/app/globals.css` (append `## Tables` under the skin section header)
- Modify: `apps/web/test/editor-skin-coverage.test.ts` (extend the class list + gallery doc with a table)
- Modify: `packages/app-core/src/views/comment-body.tsx` (add `table`/`tableRow`/`tableCell`/`tableHeader` cases)
- Create/Modify: `packages/app-core/test/views/comment-body.test.ts` (new cases for table rendering)

**Interfaces:**
- Consumes: `.tableWrapper` DOM shape from Measurement 6; `EDITOR_CONTENT_CLASSES`/`GALLERY_DOC` from Task 3.
- Produces: `.gn-comment__table`/`__table-row`/`__cell`/`__header-cell` classes, styled alongside `.ticket-editor__content table` in the same globals.css section.

- [ ] **Step 1: Add table CSS**, appended to the same "Editor skin" section:
  ```css
  /* ── Tables ── */
  .ticket-editor__content .tableWrapper { overflow-x: auto; max-width: 100%; }
  .ticket-editor__content table,
  .gn-comment__table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5rem 0;
  }
  .ticket-editor__content th,
  .ticket-editor__content td,
  .gn-comment__table th,
  .gn-comment__table td {
    border: 1px solid var(--gn-border);
    padding: 0.375rem 0.625rem;
    text-align: left;
  }
  .ticket-editor__content th,
  .gn-comment__table th {
    background: var(--gn-fill-quaternary);
    font-weight: 600;
  }
  .ticket-editor__content .selectedCell {
    background: var(--gn-fill-quaternary);
  }
  ```
  (`text-align: left` on `th` closes the brief's "header text should align with its column's body" note — both inherit the same rule.)
- [ ] **Step 2: Extend the coverage test.** Add `'tableWrapper'` is a substring of no other class so no boundary issue; add a table to `GALLERY_DOC`:
  ```ts
  // append to GALLERY_DOC.content:
  { type: 'table', content: [
    { type: 'tableRow', content: [
      { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H' }] }] },
    ] },
    { type: 'tableRow', content: [
      { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] },
    ] },
  ] },
  ```
  Add `'tableWrapper'` to `EDITOR_CONTENT_CLASSES`; the plain `table`/`th`/`td`/`.selectedCell` selectors are asserted directly (not via the class-list loop, since they are element selectors, not classes) in a small dedicated `it()` beneath the loop:
  ```ts
  it('9.352 table/th/td and .selectedCell all have a declared rule', () => {
    for (const selector of ['table', 'th', 'td', '.selectedCell']) {
      expect(new RegExp(`(?:^|[\\s>])${selector.replace('.', '\\.')}(?![\\w-])`).test(bare)).toBe(true);
    }
  });
  it('9.352 table/th/td all render in the gallery', () => {
    expect(root.querySelector('table')).not.toBeNull();
    expect(root.querySelector('th')).not.toBeNull();
    expect(root.querySelector('td')).not.toBeNull();
  });
  ```
- [ ] **Step 3: Add table rendering to `comment-body.tsx`.** Insert before the `paragraph`/`heading`/`doc` branch (around line 292):
  ```ts
  if (node.type === 'table') {
    return createElement('table', { className: 'gn-comment__table', key }, createElement('tbody', null, children));
  }
  if (node.type === 'tableRow') {
    return createElement('tr', { key }, children);
  }
  if (node.type === 'tableHeader') {
    return createElement('th', { key }, children);
  }
  if (node.type === 'tableCell') {
    return createElement('td', { key }, children);
  }
  ```
  Note: `tableHeader`/`tableCell`'s content is itself a `paragraph`, which `childrenOf` already unwraps to a `<p>` — leave that as-is (a `<p>` inside a `<td>` is valid and matches what the live editor's own DOM produces).
- [ ] **Step 4: Write the failing test first**, in `packages/app-core/test/views/comment-body.test.tsx`:
  ```ts
  it('9.348 renders a table node as real table/tr/th/td elements', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ada' }] }] }] },
        ],
      }],
    };
    const { container } = render(<>{renderCommentBody(doc)}</>);
    expect(container.querySelector('table.gn-comment__table')).not.toBeNull();
    expect(container.querySelectorAll('tr')).toHaveLength(2);
    expect(container.querySelector('th')?.textContent).toBe('Name');
    expect(container.querySelector('td')?.textContent).toBe('Ada');
  });
  ```
  Run it — expect FAIL (no `table` case exists yet) before Step 3, then re-run after Step 3 — expect PASS.
- [ ] **Step 5: Run both suites, commit.**
  ```bash
  pnpm --filter @gisik-nokma/web vitest run editor-skin-coverage
  pnpm --filter @gisik-nokma/app-core vitest run comment-body
  git add apps/web/app/globals.css apps/web/test/editor-skin-coverage.test.ts packages/app-core/src/views/comment-body.tsx packages/app-core/test/views/comment-body.test.tsx
  git commit -m "Editor skin: table borders/header/selected-cell + comment-body table rendering"
  ```

---

## Task 5: Table floating toolbar

**Files:**
- Create: `packages/editor/src/components/TableFloatingToolbar.tsx`
- Create: `packages/editor/test/table-floating-toolbar.test.tsx`
- Modify: `packages/editor/src/components/TicketEditor.tsx` (mount it inside `.ticket-editor`)
- Modify: `packages/editor/src/index.ts` (export it, if the package barrel exports components — check the existing `EditorToolbar` export line and mirror it)
- Modify: `apps/web/app/globals.css` (toolbar chrome, appended to the skin section)
- Modify: `apps/web/test/editor-skin-coverage.test.ts` (add `table-toolbar` classes)

**Interfaces:**
- Consumes: `Editor` from `@tiptap/core`, the `.ticket-editor` positioned ancestor (Measurement 5).
- Produces: `TableFloatingToolbar({ editor, editable }: { editor: Editor | null; editable: boolean })` — no `containerRef` prop (unlike the KB source): positioning is `absolute` against `.ticket-editor`, not `fixed` against the viewport, so no outer scroll-container ref is needed. This is the KB component's hover-only mode DROPPED per the brief (caret-inside-table only) and Tailwind/lucide swapped for BEM + text glyphs (Measurements 12, "drop the KB hover-only mode" instruction).

- [ ] **Step 1: Write the component**, adapted from `/Users/kiro/my_projects/knowledge-base/.../TableFloatingToolbar.tsx` (read in full already) — caret-tracking only, absolute-positioned against `.ticket-editor`, BEM classes, text-glyph buttons, guarded `ResizeObserver`:
  ```tsx
  import { useEffect, useRef, useState } from 'react';
  import type { Editor } from '@tiptap/react';

  export type TableFloatingToolbarProps = {
    editor: Editor | null;
    editable: boolean;
  };

  type Cmd =
    | 'addRowBefore' | 'addRowAfter' | 'deleteRow'
    | 'addColumnBefore' | 'addColumnAfter' | 'deleteColumn'
    | 'toggleHeaderRow' | 'toggleHeaderColumn' | 'deleteTable';

  const BUTTONS: { cmd: Cmd; label: string; name: string; sep?: boolean }[] = [
    { cmd: 'addRowBefore', label: '↑', name: 'Add row above' },
    { cmd: 'addRowAfter', label: '↓', name: 'Add row below' },
    { cmd: 'deleteRow', label: '−row', name: 'Delete row' },
    { cmd: 'addColumnBefore', label: '←', name: 'Add column left', sep: true },
    { cmd: 'addColumnAfter', label: '→', name: 'Add column right' },
    { cmd: 'deleteColumn', label: '−col', name: 'Delete column' },
    { cmd: 'toggleHeaderRow', label: 'H row', name: 'Toggle header row', sep: true },
    { cmd: 'toggleHeaderColumn', label: 'H col', name: 'Toggle header column' },
    { cmd: 'deleteTable', label: '−table', name: 'Delete table', sep: true },
  ];

  function findActiveCellDom(editor: Editor): HTMLElement | null {
    const { $head } = editor.state.selection;
    for (let d = $head.depth; d > 0; d -= 1) {
      const name = $head.node(d).type.name;
      if (name === 'tableCell' || name === 'tableHeader') {
        const dom = editor.view.nodeDOM($head.before(d));
        return dom instanceof HTMLElement ? dom : null;
      }
    }
    return null;
  }

  export function TableFloatingToolbar({ editor, editable }: TableFloatingToolbarProps): React.JSX.Element | null {
    const [table, setTable] = useState<HTMLTableElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      if (!editor) return;
      const update = () => {
        if (editor.isDestroyed) return;
        const cell = findActiveCellDom(editor);
        setTable(cell ? (cell.closest('table') as HTMLTableElement | null) : null);
      };
      update();
      editor.on('selectionUpdate', update);
      editor.on('transaction', update);
      return () => {
        editor.off('selectionUpdate', update);
        editor.off('transaction', update);
      };
    }, [editor]);

    useEffect(() => {
      if (!table) {
        setPos(null);
        return;
      }
      const anchor = table.closest('.ticket-editor') as HTMLElement | null;
      const updatePos = () => {
        if (!anchor || !table.isConnected) {
          setPos(null);
          return;
        }
        const a = anchor.getBoundingClientRect();
        const t = table.getBoundingClientRect();
        setPos({ top: t.top - a.top - 36, left: t.left - a.left });
      };
      updatePos();
      // jsdom has no ResizeObserver; guard rather than crash under test.
      const RO = typeof ResizeObserver === 'undefined' ? null : ResizeObserver;
      const ro = RO ? new RO(updatePos) : null;
      ro?.observe(table);
      window.addEventListener('scroll', updatePos, true);
      window.addEventListener('resize', updatePos);
      return () => {
        ro?.disconnect();
        window.removeEventListener('scroll', updatePos, true);
        window.removeEventListener('resize', updatePos);
      };
    }, [table]);

    if (!editor || editor.isDestroyed || !editable || !table || !pos) return null;

    const editorAny = editor as unknown as { chain: () => any; can: () => any };
    const run = (cmd: Cmd) => editorAny.chain().focus()[cmd]().run();
    const canRun = (cmd: Cmd) => editorAny.can()[cmd]();

    return (
      <div
        ref={ref}
        className="table-toolbar"
        role="toolbar"
        aria-label="Table"
        style={{ position: 'absolute', top: pos.top, left: pos.left }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {BUTTONS.map((b) => (
          <span key={b.cmd} className="table-toolbar__group">
            {b.sep ? <span className="table-toolbar__sep" /> : null}
            <button
              type="button"
              className="table-toolbar__btn"
              disabled={!canRun(b.cmd)}
              aria-label={b.name}
              title={b.name}
              onClick={() => run(b.cmd)}
            >
              {b.label}
            </button>
          </span>
        ))}
      </div>
    );
  }
  ```
- [ ] **Step 2: Mount it in `TicketEditor.tsx`**, as a sibling of `EditorContent` inside `.ticket-editor` (after `EditorContent`, so it paints above in source order — `.ticket-editor`'s `position: relative` from `editor.css:106-108` is the containing block):
  ```tsx
  <EditorContent editor={editor} className="ticket-editor__content gn-field__input" />
  <TableFloatingToolbar editor={editor} editable={editable} />
  ```
  Add the import at the top of the file: `import { TableFloatingToolbar } from './TableFloatingToolbar.js';`.
- [ ] **Step 3: Export it from the package barrel.** Check `packages/editor/src/index.ts` for how `EditorToolbar` is exported and add `TableFloatingToolbar`/`TableFloatingToolbarProps` the same way.
- [ ] **Step 4: Toolbar chrome**, appended to the skin section in `globals.css`:
  ```css
  .table-toolbar {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    padding: 0.25rem;
    background: var(--gn-surface-raised);
    box-shadow: var(--gn-shadow-raised);
    border-radius: var(--gn-radius-control);
    z-index: 30;
  }
  .table-toolbar__group { display: flex; align-items: center; }
  .table-toolbar__sep {
    width: 1px;
    height: 1.25rem;
    background: var(--gn-border);
    margin: 0 0.25rem;
  }
  .table-toolbar__btn {
    min-height: 32px;
    min-width: 34px;
    padding: 0 0.5rem;
    border: none;
    border-radius: 4px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
  }
  .table-toolbar__btn:hover:not(:disabled) { background: var(--gn-fill-tertiary); }
  .table-toolbar__btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .table-toolbar__btn:focus-visible {
    outline: 2px solid var(--gn-focus-ring);
    outline-offset: 2px;
  }
  ```
  `editor-skin-coverage.test.ts` mounts a bare `@tiptap/core` `Editor`, not the React `TicketEditor` tree the toolbar needs, so `.table-toolbar`/`.table-toolbar__btn` cannot join the matched-DOM arm there without pulling React Testing Library into that file — declared coverage only, in a small sibling list:
  ```ts
  // Declared-only: these classes render from a React component
  // (TableFloatingToolbar), not from the headless Editor this file mounts —
  // their matched-DOM coverage lives in table-floating-toolbar.test.tsx's own
  // 9.349 case instead (it already asserts `.table-toolbar` appears).
  const TOOLBAR_DECLARED_ONLY_CLASSES = ['table-toolbar', 'table-toolbar__btn'] as const;

  describe('9.341 editor skin — declared coverage (toolbar, component-rendered)', () => {
    it.each(TOOLBAR_DECLARED_ONLY_CLASSES)('globals.css declares a rule matching .%s', (cls) => {
      const pattern = new RegExp(`\\.${cls}(?![\\w-])`);
      expect(pattern.test(bare), `no rule selecting .${cls} in apps/web/app/globals.css`).toBe(true);
    });
  });
  ```
- [ ] **Step 5: Write the tests** in `table-floating-toolbar.test.tsx` (uses React Testing Library the way `ticket-editor.test.tsx` does — mirror its `mount`/`Harness` helper):
  ```tsx
  import { describe, expect, it } from 'vitest';
  import { render, fireEvent } from '@testing-library/react';
  import { TicketEditor } from '../src/components/TicketEditor.js';
  // ... Harness/mount pattern copied from ticket-editor.test.tsx:19-45 ...

  const TABLE_DOC = {
    type: 'doc',
    content: [{
      type: 'table',
      content: [
        { type: 'tableRow', content: [
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
        ] },
      ],
    }],
  };

  describe('table floating toolbar', () => {
    it('9.349 does not render read-only, even with the caret in a table cell', async () => {
      const { container } = await mount({ editable: false, initialDoc: TABLE_DOC });
      expect(container.querySelector('.table-toolbar')).toBeNull();
    });

    it('9.349 renders once the caret enters a table cell (editable)', async () => {
      const { container, editorRef } = await mount({ editable: true, initialDoc: TABLE_DOC });
      editorRef.current!.commands.setTextSelection(3); // inside the first cell
      await Promise.resolve();
      expect(container.querySelector('.table-toolbar')).not.toBeNull();
    });

    // TABLE_DOC's one row has two cells, 'a' then 'b'. The caret is set inside
    // 'a' (column 0) below, so "before"/"after" cases assert WHICH SIDE the new
    // row/column lands on — a swapped addRowBefore<->addRowAfter mapping still
    // grows the count by exactly 1, so a count-only assertion would not catch
    // the mutation the brief asks for; the position check does.
    const CASES: { label: string; assert: (e: import('@tiptap/core').Editor) => void }[] = [
      { label: 'Add row above', assert: (e) => {
        const rows = Array.from(e.view.dom.querySelectorAll('tr'));
        expect(rows).toHaveLength(2);
        expect(rows[1]!.textContent).toContain('a');
      } },
      { label: 'Add row below', assert: (e) => {
        const rows = Array.from(e.view.dom.querySelectorAll('tr'));
        expect(rows).toHaveLength(2);
        expect(rows[0]!.textContent).toContain('a');
      } },
      { label: 'Delete row', assert: (e) => {
        expect(e.view.dom.querySelectorAll('tr')).toHaveLength(0);
      } },
      { label: 'Add column left', assert: (e) => {
        const cells = Array.from(e.view.dom.querySelector('tr')!.children);
        expect(cells).toHaveLength(3);
        expect(cells[1]!.textContent).toBe('a');
      } },
      { label: 'Add column right', assert: (e) => {
        const cells = Array.from(e.view.dom.querySelector('tr')!.children);
        expect(cells).toHaveLength(3);
        expect(cells[0]!.textContent).toBe('a');
      } },
      { label: 'Delete column', assert: (e) => {
        expect(e.view.dom.querySelector('tr')!.children).toHaveLength(1);
      } },
      { label: 'Toggle header row', assert: (e) => {
        expect(e.view.dom.querySelector('th')).not.toBeNull();
      } },
      { label: 'Toggle header column', assert: (e) => {
        expect(e.view.dom.querySelector('th')).not.toBeNull();
      } },
    ];
    it.each(CASES)('9.350 $label runs its command and changes the table structurally', async ({ label, assert }) => {
      const { container, editorRef } = await mount({ editable: true, initialDoc: TABLE_DOC });
      editorRef.current!.commands.setTextSelection(3);
      await Promise.resolve();
      const button = Array.from(container.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === label)!;
      fireEvent.click(button);
      assert(editorRef.current!);
    });

    it('9.351 Delete table removes the table node entirely', async () => {
      const { container, editorRef } = await mount({ editable: true, initialDoc: TABLE_DOC });
      editorRef.current!.commands.setTextSelection(3);
      await Promise.resolve();
      const button = Array.from(container.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Delete table')!;
      fireEvent.click(button);
      let found = false;
      editorRef.current!.state.doc.descendants((n) => { if (n.type.name === 'table') found = true; return !found; });
      expect(found).toBe(false);
    });
  });
  ```
  Fill in the `Harness`/`mount` boilerplate by copying `ticket-editor.test.tsx:19-45` verbatim and adding `initialDoc` passthrough to `TicketEditor`'s existing content prop.
- [ ] **Step 6: Run, then apply each case's own mutation** (e.g. map "Add row below" to `addRowBefore` in `BUTTONS`) to confirm the position assertion actually reddens before restoring:
  ```bash
  pnpm --filter @gisik-nokma/editor vitest run table-floating-toolbar
  ```
- [ ] **Step 7: Regenerate the mobile bundle once**, now that every `packages/editor` source change in this plan (Task 1's extension rewrite, this task's new component and wiring) is in — a later regen would just repeat this step for no reason, and a webview-specific rendering check happens for real in Task 6's dev-stack pass, not here. RN decision: yes, the toolbar shows on mobile too (touch: tap a cell, same component, no separate mobile variant — it is plain React mounted inside the same webview bundle):
  ```bash
  pnpm --filter @gisik-nokma/editor run build:webview
  node apps/mobile/scripts/generate-editor-html.mjs
  git status  # confirm apps/mobile/src/editor/editor-html.generated.ts changed
  ```
  Note in the PR body (per Measurement 3): the mobile WebView loads `editor.css` alone, without `ui.css`/`globals.css` — every `var(--gn-*)` in this plan's skin resolves to `initial` there, so **this skin does not reach the phone**. State this plainly rather than attempting a workaround; it is pre-existing, not a regression this lane introduces.
- [ ] **Step 8: Report the two "consider, don't build" items in the PR body**: an "Insert table" button on the main toolbar (owner has not asked — follow-up for the planner), and the tooltip mechanism (editor-polish's shared tooltip hasn't landed yet per Measurement 15 — `title`+`aria-label` used for now, swap later).
- [ ] **Step 9: Commit.**
  ```bash
  git add packages/editor/src/components/TableFloatingToolbar.tsx packages/editor/test/table-floating-toolbar.test.tsx packages/editor/src/components/TicketEditor.tsx packages/editor/src/index.ts apps/web/app/globals.css apps/web/test/editor-skin-coverage.test.ts apps/mobile/src/editor/editor-html.generated.ts
  git commit -m "Table floating toolbar: 9 row/column/header/delete actions, ported from the owner's knowledge-base component"
  ```

---

## Task 6: Gallery fixture + dev-stack visual pass

**Files:** none new — reuses `GALLERY_DOC` from Task 3/4 by seeding it into a real note via the dev stack.

- [ ] **Step 1: Start the dev stack from this branch** (per the `run` skill / workspace convention — `ctl rebuild`/whatever this repo's dev-stack launcher is, built from `task/editor-skin`).
- [ ] **Step 2: Create a note containing one instance of every skinned node** (headings, marks, code block, blockquote, lists incl. a task item, hr, a table, a collapsible, a mention, a ticket ref, a wiki-link — live and missing) — either by typing it or by seeding `GALLERY_DOC`'s JSON directly if the stack has a seed/import path.
- [ ] **Step 3: Screenshot the note in light and dark**, and the table with the floating toolbar open (click into a cell), and a comment containing a table. Save under `gisik-nokma-lanes/evidence-editor-skin/` (create the directory if it does not exist):
  ```
  gisik-nokma-lanes/evidence-editor-skin/gallery-light.png
  gisik-nokma-lanes/evidence-editor-skin/gallery-dark.png
  gisik-nokma-lanes/evidence-editor-skin/table-toolbar-light.png
  gisik-nokma-lanes/evidence-editor-skin/comment-table.png
  ```
- [ ] **Step 4: Visually confirm** against the brief's own checklist: code blocks have a visible sunken surface and a copy button that appears on hover/focus; the escape hint no longer appears after any shortcut; chips read distinctly without colour-only cues; table borders are visible in both themes; the toolbar anchors above the table and follows scroll.
- [ ] **Step 5: Commit the screenshots** (binary files — confirm they're not already gitignored before adding):
  ```bash
  git add gisik-nokma-lanes/evidence-editor-skin/
  git commit -m "Editor skin: dev-stack visual evidence, light + dark"
  ```

---

## Task 7: Catalogue, Features.md, local battery, merge, PR

**Files:**
- Modify: `Features.md` (§9 bullet)
- Modify: `test-cases/09-editor-attachments.md` (finalize all case rows from Tasks 1/3/4/5)

- [ ] **Step 1: Add the Features.md §9 bullet** for the skin + table toolbar (one to two lines, file path, `✅` since it's user-observable), per the workspace's Features.md discipline.
- [ ] **Step 2: Finalize the catalogue.** Confirm every case id this plan minted (`9.338`–`9.341`, `9.348`–`9.352`, whichever subset was actually spent — recount against what Tasks 1/3/4/5 actually wrote, do not assume the plan's own preview numbering survived edits) is present with its mutation named, and that the three 🚫 flips from Task 1 carry the owner's one-line reason. No manual.md edit needed (Measurement 10 — nothing to remove, nothing existing to update).
- [ ] **Step 3: Merge `release/notes` into this branch** (the collision-avoidance step — editor-polish is editing `globals.css` in parallel):
  ```bash
  git fetch origin release/notes
  git merge origin/release/notes
  ```
  Resolve any conflict in `globals.css` by keeping both sections (this lane's "Editor skin" section and editor-polish's popup/toolbar section are textually disjoint per Global Constraints — a real conflict here means one lane touched the other's section and needs a look, not a blind `--ours`/`--theirs`).
- [ ] **Step 4: Local battery, build before suites** (per this repo's own recorded lesson — a suite run before a build reports a false red):
  ```bash
  pnpm turbo run build
  pnpm --filter @gisik-nokma/editor test
  pnpm --filter @gisik-nokma/web test
  pnpm --filter @gisik-nokma/app-core test
  pnpm --filter @gisik-nokma/mobile test   # runs the --check freshness gate on the regenerated bundle
  ```
  Record which run (branch, sha) these results are quoted from in the PR body — CI does not gate this PR.
- [ ] **Step 5: Open the PR**, `--base release/notes`, body naming: the escape-chip removal + owner ruling, the skin's scope and the comment-body-table-only fix (with the seven-family follow-up named explicitly), the table toolbar and its two "consider, don't build" items, the mobile-bundle caveat (skin doesn't reach the phone), and the local battery's exact run.
- [ ] **Step 6: Report** `PROGRESS`/`DONE`/`BLOCKED` editor-skin — `<sha>`, per the dispatch brief's own reporting instruction.
