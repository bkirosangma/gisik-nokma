# Ticket sheet: the prototype's order and editor chrome

**Date:** 2026-09-22
**Branch:** `owner/sheet-prototype-parity` (worktree `/Users/kiro/my_projects/gisik-nokma-owner`)
**Owner's words:** "I want our build's styling (especially on the editors, description and
comment) and the ordering of the fields and sections to follow the prototype." On the
visibility chip: "in our build, this button will open up a context menu that has [the
CHANGE WHO CAN SEE THIS radio group] (follow prototype styling here as well). This is only
a styling, and structural work. no new functionality introduced, and no functionality
lost from the build."
**Clarifications (owner, same session):** keep an explicit **Save description**, in a
footer row; the visibility menu keeps its **Apply** button; **add the Attachments tab**;
header shows the **chips line under the title AND a State row** in the grid, with no state
`<select>`.

**Authority:** `design-system/interactive/desktop.dc.html` — the sheet is `:1100`–`:1336`
(details arm), styles in the view-model at `:3400`–`:3800`. **Not**
`design-system/prototypes/TicketSheet.dc.html`, which nothing cites.

## What this is

`TicketSheet` (`packages/app-core/src/views/ticket-sheet.tsx`) draws the right facts in the
wrong order and the wrong clothes. Measured against the export on 2026-09-22 (owner's
four screenshots):

| Ours today (top to bottom) | Prototype |
|---|---|
| crumbs · title · Full screen · × | same |
| tabs Details · History | **chips line**: state chip, `Restricted` chip, recorded line |
| state chip · provenance · Move… (Close/Reopen) | tabs Details · History · **Attachments** |
| `At project root` / `Subtask of …` | **Description editor** (toolbar tray, sunken body, hint) |
| Subtasks (heading, empty copy, "Adds a Sub-task.", labelled input, button below) | grid: **State** · Assignee · Priority · Due · Type · **Visibility** (alternate rows tinted) |
| grid: Assignee · Priority · Due · Type · **Description** · `title` (a generic row) | **SUBTASKS · 0 OF 1 DONE**, subtask cards, inline add row |
| attachment list inline | **COMMENTS · N**, thread, composer with footer row (hint · Post) |
| Who can see this (heading, chip, note, radios, Apply) | — |
| Comments · N, thread, composer, hint line | — |

Everything in the left column stays reachable. Everything is re-seated to the right column's
order and drawn in its clothes. **Nothing new can be done on the sheet after this change and
nothing that can be done today stops being possible.** That sentence is the test.

## Decisions taken here (state them, do not re-ask)

1. **State row, no select.** The prototype's State row is a `<select>` that sets a state
   directly. Ours moves through `TransitionDialog` because transitions are rule-driven
   (`require-comment`, `require-evidence`, `require-field`). The State row's value side holds
   the state `Chip`, the `Move…` button, and `Close` / `Reopen` when they apply, with the
   provenance sentence (*marked Later by Kiro on 8 Sep 2026*) as the row's note line. A
   select would bypass the rules — new functionality, refused.
2. **Chips line under the title** (`:1128-1133`): the state chip; a `Restricted` chip
   (tone `restricted`) when the standing visibility is explicit; the `Closed by … on …`
   chip when closed. The prototype's *Recorded in this browser · 12:04:18* has no
   counterpart in our data and is **not drawn** — inventing a clock is forbidden.
3. **The parent indicator stays**, as its own line directly under the chips line, unchanged
   in content and behaviour (`At project root` · restricted pill · `Subtask of …` button).
   The prototype has no such line; the owner ruled the chip UP into this indicator on
   2026-09-20 and that ruling stands.
4. **The generic `title` row is deleted.** The title is edited in the header (`titleSlot`);
   the generic field loop draws a second, read-only `title` row because its exclusion list
   names `description`, `dueDate`, `priority` but not `title`. Nothing is lost.
5. **Attachments become the third tab.** `AttachmentList` and the
   `sheet-attachments-unavailable` sentence move out of Details into `tab === 'attachments'`.
   Same components, same props, same three-way rendering.
6. **The visibility chip becomes a menu trigger.** Clicking it opens a popover holding the
   editor's EXISTING controls — the `Change who can see this` radio fieldset, the `Who,
   exactly` people checklist when *Only the people I name* is chosen, the lockout warning,
   `Apply`, and the refusal / unreached lines. Apply closes the menu on success and leaves
   it open on refusal. Every control keeps its role, name and behaviour; only its container
   changes.
7. **Under the visibility chip, read-only:** the owner-always-sees note (ours), the standing
   claim line (`set by … on …`), and — when explicit — the prototype's `WHO CAN SEE IT`
   caption with one **read-only** chip per named person (`:1214-1222`, name + why). **No ×
   on the chips and no `Add someone…` select**: both are per-person writes this build does
   not have; the people checklist inside the menu is the one write path and it stays.
8. **Editor chrome is shared by both composers.** `TicketEditorSlot` (`packages/editor`) is
   restyled once: toolbar tray on top, sunken body, a **footer row** with the Markdown hint
   on the left and the submit button on the right (`Save description` / `Post`). The comment
   composer's hint sentence *Posting records an event citing you.* moves into that footer
   (the prototype's `cmtHint` slot). No `Attach` button is added: the composer already
   accepts files by paste/drop through `uploadAttachment`, and a button would be a new
   control.
9. **`Comment` is relabelled `Post`** on the comment composer's submit — the prototype's
   word (`:1330`). A label change only.
10. **Subtask rows become cards** (`:3629`): tinted card, title, then a chip row (state chip ·
    `typeId · Due <day>` from the `ListRow` the sheet already holds). **No tick box**: the
    prototype's box advances the child's state on click; drawing one that does nothing would
    be a control that lies, and wiring it would be new functionality. The add row goes
    inline (input + button in one flex row, `:1258-1261`); the visible `New subtask title`
    label becomes the input's placeholder AND its `aria-label`, and *Adds a Sub-task.* stays
    as the row's note.
11. **Section headings** (`Subtasks · …`, `Comments · N`) take the prototype's caption style:
    13px, uppercase, `letter-spacing: 0.6px`, muted ink. Text unchanged, so every existing
    text query still matches (`text-transform` is paint, not content).
12. **Alternating tinted rows** in the field grid (`rowLabelB`/`rowValueB`, `:3755-3756`):
    every second `<dt>/<dd>` pair sits on `--gn-fill-quaternary` with 8px outer radii. The
    grid columns become the prototype's `minmax(96px, 150px) minmax(0, 1fr)`; values are
    right-aligned (`align-items: flex-end; text-align: right`). The E4-7 phone rule (label
    column collapses under 390px) is kept.

## Components and files

### `packages/ui` — a `Popover` primitive (new)

`packages/ui/src/components/popover.tsx`: `Popover({ triggerRef, open, onClose, 'aria-label', children })`
built on the same `@react-aria/overlays` pieces `Select` already uses (`useOverlay`,
`useOverlayPosition`, `FocusScope`, `DismissButton`, `createPortal`). Dismiss on Escape and
outside click; focus moves into the panel on open and returns to the trigger on close;
`role="dialog"` with the given label. Class `.gn-popover` (raised surface, control radius,
`--gn-shadow-raised`, 12px padding, `max-width: min(22rem, calc(100vw - 2rem))`). It is the
one new component, and it exists because the visibility menu is the first popover in the
product; `Select`'s listbox is not reusable for a fieldset.

### `packages/app-core/src/views/visibility-editor.tsx`

- The `<h3>Who can see this</h3>` heading is dropped (the row label `Visibility` names it).
- The standing chip becomes a `<button type="button" aria-haspopup="dialog" aria-expanded>`
  wearing the prototype's pill (`visBtnStyle`, `:3786`): 36px, `999px` radius, tinted
  ground and matching ink (`--gn-restricted` tint when restricted, success tint otherwise),
  dot first. Disabled with the existing read-only arm when `canEdit` is false (that arm's
  text stays as the note line).
- `.gn-visibility__controls` (fieldset · people · lockout · Apply · refusal · unreached)
  renders inside `Popover`, unchanged markup. Apply success calls `onChanged` then closes.
- New read-only block when explicit: `.gn-visibility__viewers` caption + chips from
  `namedAudience(current)`, or the existing *The list itself is not being served* sentence
  when the read carries no names.

### `packages/editor/src/components/TicketEditorSlot.tsx` + `styles/editor.css`

- `.editor-slot` becomes the chrome: `overflow: hidden`, control radius, sunken field
  ground and shadow for the body. `TicketEditor` renders toolbar → content → (hint), so the
  hint moves: `TicketEditor` gains `hintSlot?: 'below' | 'none'` (default `'below'` keeps
  every other mount identical) and the slot passes `'none'`, drawing the hint itself in the
  footer. Footer row `.editor-slot__footer`: hint left (`flex: 1`, 12px muted), submit
  right, on `--gn-fill-quaternary`.
- `.ticket-editor__toolbar` loses its `margin-top: 1rem` inside the slot (`.editor-slot
  .ticket-editor__toolbar { margin-top: 0; border-radius: 0 }`) and keeps its tray fill.
- `.editor-slot__submit` becomes the prototype's Post button (`:1330`): 40px, accent ground,
  on-accent ink, control radius, weight 600, `--gn-shadow-raised`; disabled state keeps the
  existing `title` + `aria-describedby` reason.
- Label: `props.mode === 'comment' ? 'Post' : 'Save description'`.

### `packages/app-core/src/views/ticket-sheet.tsx`

Details tab, in order: `sheet-chips` line · `sheet-parent-indicator` · tabs · then per tab:

- **Details:** `field-description` block (full width, above the grid, labelled by the same
  `id`) · `<dl class="gn-ticket-sheet__fields">` with rows `field-state`, `field-assignee`,
  `field-priority`, `field-due`, `field-type`, `field-visibility` (the `VisibilityEditor`
  mount moves INTO this row's `<dd>`), then the generic custom-field rows (loop skips
  `title`, `description`, `dueDate`, `startDate`, `priority`) · `sheet-subtasks` ·
  `sheet-comments` · the delete footer, unchanged.
- **History:** unchanged.
- **Attachments:** `AttachmentList` / `sheet-attachments-unavailable`.
- `tab` state type widens to `'details' | 'history' | 'attachments'`; the answer slots
  (refusal / transport / precheck) stay outside the tabs as today.
- The state line's markup (`.gn-ticket-sheet__state`) moves into `field-state`'s `<dd>`;
  the class is kept so `ticket-sheet.test.tsx:1308`'s selector still resolves.

### `packages/ui/src/ui.css`

New or changed rules, all in the sheet's block near `:2032-2140`: `.gn-ticket-sheet__chips`,
`.gn-ticket-sheet__field--tinted`, the grid columns and right alignment,
`.gn-ticket-sheet__caption` (shared by the Subtasks and Comments headings — `gn-comments__heading`
adopts it), `.gn-ticket-sheet__subtask-card`, `.gn-ticket-sheet__subtask-add` (flex row),
`.gn-visibility__trigger`, `.gn-visibility__viewers`, `.gn-popover`. Every colour is an
existing token; no new token and no literal colour. Danger/accent/restricted pairs cited by
the file's own measured contrast notes.

### Copy and catalogue

- `docs/manual.md` §5 "the job panel": the order of the rows, the Attachments tab, the
  visibility menu ("click the visibility pill, choose, Apply"). `pnpm help:generate`.
- `Features.md` §3 sheet bullet (line ~75) and the visibility bullet: order, tab, menu.
- `test-cases/16-remaining-doors.md`: new cases in **`16.110`–`16.129`**; §13 cases (the
  popover, the editor chrome) in **`13.1267`–`13.1286`**, filed in `13-board-prototype-port.md`.
  **Both blocks are written into the allocation tables in this same commit** (`16-remaining-doors.md`
  "THE BLOCKS" and `13-hig-per-screen.md` "§13 blocks"), beside rows recording the priority
  built-in plan's `16.100`–`16.109` and `13.1227`–`13.1266` as landed in #672 — measured
  2026-09-22 against `origin/main` `5de12392`: §16 catalogue tip `16.99`, §13 tip `13.1218`
  with `13.1217`–`13.1226` held by `rel/browser-findings`. An executor takes from these rows
  and never from the tip. Amended cases: `16.81` (tabs are three), `16.23`–`16.30` (row
  order), `13.1178` unchanged, the visibility suite's 30 cases (open the menu first).

## Testing — the "nothing lost" contract

- **Ratchet on test count:** `ticket-sheet.test.tsx` has 140 `it(` and
  `visibility-editor.test.tsx` has 30 at `origin/main` `476d027d`. After this change both
  numbers are **≥** those, and every pre-existing case still passes with at most these
  edits: (a) a visibility case clicks the trigger before touching a radio; (b) an
  attachments case switches to the Attachments tab first; (c) `16.81` expects three tabs.
  (d) two fixture edits the plan names in Task 7, where the comment composer's footer sentence
  moves into the editor slot (`comments-thread.test.tsx`, `ticket-sheet-comments.test.tsx`).
  A case that needs any other edit is a functionality change and stops the work.
- **Order** is asserted once, structurally: a case collects the `data-testid`s
  `sheet-chips`, `sheet-parent-indicator`, `field-description`, `field-state`,
  `field-assignee`, `field-priority`, `field-due`, `field-type`, `field-visibility`,
  `sheet-subtasks`, `sheet-comments` and asserts `compareDocumentPosition` order pairwise.
- **Popover:** opens on click, `role="dialog"` named `Change who can see this`, focus lands
  inside, Escape closes and returns focus to the trigger, outside click closes, Apply on
  success closes, Apply on refusal leaves it open with the refusal visible.
- **Editor chrome:** css-binding cases (the pattern `ticket-sheet-crumb-css-binding.test.tsx`
  uses) assert the classes `.editor-slot__footer`, `.editor-slot__submit` exist in
  `editor.css` and are applied; the `Post` label; the hint inside the footer for both modes.
- **Attachments tab:** the list renders under the third tab and NOT under Details; the
  failure sentence too.
- **Viewport run** (`pnpm test:e2e:viewport`) at 390 and 1280 against the prototype
  screenshots the owner supplied, recorded in the PR body.

## Sequencing and risk

- **Depends on the priority built-in work** (`docs/superpowers/plans/2026-09-22-priority-builtin.md`,
  in flight with the controller). Both edit the same rows of `ticket-sheet.tsx`. This work
  is planned now and **executed after that PR lands**, branched from the `main` that
  contains it. The plan says so in its header.
- The visibility suite drives the component directly; moving controls into a portal means
  `screen.getByRole('radio', …)` still finds them (portals are in `document.body`) once the
  menu is open.
- `TicketEditorSlot` is also mounted by the desktop app; the `hintSlot` default keeps that
  mount pixel-identical.

## Out of scope

- A state `<select>`; a tick box on subtask cards; per-chip remove or an add-someone select
  in the visibility row; an Attach button in the composer; the *Recorded in this browser*
  line; any change to what the sheet reads or writes.
- The phone sheet shell (B14) beyond the existing E4-7 label collapse.
