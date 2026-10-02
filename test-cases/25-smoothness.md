# §25 — Smoothness: loading, optimism and placeholders

**Opened 2026-10-02 by smoothness T1** (`docs/superpowers/plans/2026-10-02-smoothness.md`; spec `docs/superpowers/specs/2026-10-02-smoothness-design.md`, owner decisions D1–D13; audit `gisik-nokma-lanes/smoothness-2026-10-02/AUDIT.md`, findings SM-01–SM-16). Mirrors `Features.md` §22.

3-DIGIT PADDED `25.001`–`25.999`, blocks per task: T1 25.001–25.009 · T2 25.010–25.019 · T3 25.020–25.039 · T4 25.040–25.049 · T5 25.050–25.069 · T6 25.070–25.089 · T7 25.090–25.119 · T8 25.120–25.149 · T9 25.150–25.169 · T10 25.170–25.189 · T11 25.190–25.199 · T12 25.200–25.209 · T13 25.210–25.229 · T14 25.230–25.239.

## 25.1 Catalogue (T1)

- ❌ **25.001 — the bucket is registered in `test-cases/README.md` and the citations baseline, and `pnpm check:citations` passes with it empty (audit: none, the bucket's own registration).** Control: a case id cited by no test reddens the check.

## 25.4 Notes read-only by default, the phone layout, and the last note (G-3, owner-approved add-on)

Tests: `apps/web/test/note-document.test.tsx` (25.340–25.345), `apps/web/test/notes-phone.test.tsx` (25.346–25.349), `apps/web/test/notes-last-note.test.tsx` (25.350–25.354). Case block 25.340–25.359 (25.355–25.359 free).

- ✅ **25.340 — an existing note opens to a READING view: the editor is not contenteditable, there is no toolbar, the title is static, a tap below the text raises no caret, and an "Edit note" button (a `.gn-button`, 44px floor) sits in the header row.** Control, same test: Edit flips every one of those.
- ✅ **25.341 — Edit leads to the existing editor and Done returns to reading, any number of times.** Control: the Edit button is gone while editing and Done is gone while reading.
- ✅ **25.342 — Done saves what was typed (the editor pane's unmount flush); a Done with nothing typed writes no `note.body_set`.** The unsaved-change handling is the editor's own.
- ✅ **25.343 — a NEW note opens straight in edit mode, once: the next open of the same note is a reading view.** Control: the mark is consumed.
- ✅ **25.344 — a person without edit permission sees no Edit button (the editor's own `canEdit`), and a deleted note offers none.** Control: the author of a live note has it.
- ✅ **25.345 — a note link in the reading view still opens its note.** Mentions and ticket references are the same read-only editor's node views.
- ✅ **25.346 — on a phone (≤47.9375rem, /help's own query) the floating button opens a panel with a Notes/Contents switch: Contents lists this note's headings in document order with /help's contents classes, Notes lists the notes; the drawer toggle and the bottom-left launcher are not drawn.** Control: a desktop viewport draws none of it.
- ✅ **25.347 — the floating button sits where /help's does: the same class list as /help's launcher, one `ui.css` rule places it, and `globals.css` has no rule of its own for it.** Control: it is read off a rendered /help.
- ✅ **25.348 — the panel holds the page's ONE search box, and it narrows the Contents list ("No headings match." when nothing does).** Control: on desktop the same box is in the page header, outside any panel.
- ✅ **25.349 — with no note open the phone panel opens onto the list and offers no Contents segment.** Control: with a note open the switch is there.
- ✅ **25.350 — opening a note writes `gn-last-note:<userId>:<workspaceId>` = the note id, reading or editing, under no other key; a deleted note is not remembered.** Control: the other workspace's and the other user's keys are untouched.
- ✅ **25.351 — entering `/notes` with no note id resumes the remembered note (desktop), which opens read-only; a second workspace has its own key.** Control: nothing remembered or another user's key resumes nothing.
- ✅ **25.352 — a remembered note that is gone, deleted, or not under the key's workspace is ignored silently, its key cleared, the list shown, with no "no longer shared" sentence.** Control: a readable remembered note's key is kept.
- ✅ **25.353 — with `localStorage` throwing on every call the list shows, the note opens and nothing is resumed or broken.** Control: the stubs were reached.
- ✅ **25.354 — on a phone the remembered note is NOT forced over the list: no replace, the panel open on Notes with the note marked current (`aria-current="page"`).** Control: a desktop viewport opens it directly.
