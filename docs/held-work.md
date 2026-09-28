# Held work — paused by the owner, to resume on the owner's word

**Written 2026-09-24 ~01:05 IST** by the planner session, on the owner's instruction: *"persist the held items somewhere so they are not lost."*
Every item below was **paused by the owner** so that the notes release could ship. Nothing here is abandoned. Each has its branch pushed, its commit recorded, and its full brief copied into `docs/lanes/held/`, because the originals live in `gisik-nokma-lanes/`, which is not under git.

**To resume any item:**
1. The owner says so.
2. Merge the current release branch into the item's branch first. Never rebase.
3. Give the lane its brief from `docs/lanes/held/`. The lane restarts at the first task or unit with no commit.

**Update this file in the same change set** whenever an item resumes, lands, or is dropped. Delete the item when it lands; no tombstones.

Readings (commits) were taken at 2026-09-24 ~01:05 IST. Re-check each with `git rev-parse origin/<branch>` before relying on it.

---

## 1. Trash & purge — archive, soft delete, 15-day permanent purge

- **RESUMED 2026-09-28 ~21:5x IST** (owner: *"have the controller tell the executors to resume the held works."*). `release/trash` was fast-forwarded to `main` `dd6d7ed7` (it now carries the whole notes release); the task branch merges `origin/release/trash` before Task 7.

- **Owner ruling (2026-09-23 ~22:5x):** *"pause it after task 6 is done. i wanna leave the remaining for the notes release."*
- **Release branch:** `release/trash`, at `cd84f0027f9cd4fe6f7a9d4c5b0b326f9507ac96` when held; fast-forwarded to `dd6d7ed790eb66d1dccaeb339d0a94513edc21b4` on resume. It was stacked on `release/notes` because trash depends on notes code (the note entity, notes projections, note authority); notes shipped to `main` on 2026-09-24 (#733), and the resume fast-forward means `release/trash` now contains all of it.
- **Spec:** `docs/superpowers/specs/2026-09-23-trash-and-purge-design.md` (owner-approved; decisions T1–T10).
- **Plan 1:** `docs/superpowers/plans/2026-09-23-trash-1-lifecycle-core.md`.
- **Branch:** `task/trash-1-lifecycle-core` at `0236d334f362754593ed31f24447d1718ff30bf1`. Tasks 1–6 are done: vocabulary, projection, authority, state refusals, deleted-workspace containment, deleted-project containment.
- **Left in Plan 1:**
  - Task 7: `GET /v1/me/deleted-items`.
  - Task 8: the client `getDeletedItems()` contract.
  - Then the PR `--base release/trash`.
- **Left in the series (not yet written):**
  - Plan 2: the purge engine and backup retention.
  - Plan 3: replica and sync.
  - Plan 4: UI (the delete dialog with its "Delete permanently" switch, archive/delete on cards, Account → Deleted items).
  - Plans are written only after Plan 1 lands, against the landed tree.
- **Case block:** `test-cases/19-trash.md`. P1 `19.001`–`19.080`, P2 `19.081`–`19.160`, P3 `19.161`–`19.200`, P4 `19.201`–`19.260`.
- **Before Plan 2:** two read-only production measurements need the owner's OK.
  - Can the migration role create a `SECURITY DEFINER` function on DO managed Postgres?
  - Does the backup bucket already have a lifecycle rule?
- **Briefs:** `docs/lanes/held/LANE-trash-plan-2026-09-23.md` and `docs/lanes/held/CTL-HANDOFF-trash-series-2026-09-23.md`. PRs go `--base release/trash`, not `release/notes`.

## 2. Editor polish — the units not in the notes release

- **RESUMED 2026-09-28 ~21:5x IST** (owner: *"resume the held works"*). Integration branch **`release/trash`** (owner, 2026-09-28: one release branch for all resumed work — a separate `release/2026-09-28` was cut and deleted the same evening); the task branch merges `origin/release/trash` first and PRs `--base release/trash`. The editor fixes therefore ship when `release/trash` ships.

- **Owner ruling (2026-09-24 ~00:47):** *"and pause Editor-polish".* Units 1 and 3 landed in the notes release as #727: the `:ticket` fix, and the inline pickers placed, styled and kept above the sheet.
- **Branch:** `task/editor-polish` at `a7462363a87d824a898a1126cd36a30bdf19f2ff`. That is the controller's forward-merge of `release/notes` onto the held unit tip `2a30141ad8c63d97acdb30ea90acb0d130d637a2`.
- **DONE 2026-09-28, on the branch, not yet merged into `release/trash`:**
  - **Unit 2:** the Attach-note button and its menu now draw the house treatment (cases `9.323`–`9.325`).
  - **Unit 4:** the toolbar restyled — hover/active/focus states, a tooltip on every tool (name + platform-aware shortcut + markdown hint), `[[` replaced by **Insert note**/**Insert ticket**, no `@` (cases `9.326`–`9.332`).
  - **Unit 5:** an Attach button in the comment composer footer and on the Attachments tab, both through the existing `uploadAttachment` path (cases `9.333`–`9.337`).
  - **Unit 6a–c:** the notes search placeholder, the filter-wrap fix, and focus-hides-placeholder product-wide, with the 24-site label sweep (cases `18.301`–`18.305`).
  - **Unit 6d:** placeholders now read `--gn-text-subtle`. Measured composited (the field background is translucent, so a raw-hex reading is meaningless) — `neo` clears 4.5:1 everywhere; `hig`/`minimal` do not (3.6–4.3:1 in three of six real contexts). **Owner ruling, 2026-09-28: accept 3:1 for `hig`/`minimal`** rather than hold every style to 4.5, given Unit 6c's own label sweep already guarantees a real name survives the placeholder vanishing. Cases `18.306`–`18.309`.
- **Owed from Unit 3, still open:** the live browser check 9.317 (the popup above `.gn-sheet__scrim`) — not reached this pass.
- **Case blocks:** Units 1–5 `9.313`–`9.337`, fully spent; Unit 6 is §18's new row, `18.301`–`18.320` (`18.301`–`18.309` minted, `18.310`–`18.320` unused).
- **Brief:** `docs/lanes/held/BRIEF-editor-polish-2026-09-23.md`, including ADDENDUM 2 and ADDENDUM 3 at its end.

## 3. Editor skin — everything the editor draws, and tables

- **RESUMED 2026-09-28 ~21:5x IST** (owner: *"resume the held works"*). Integration branch **`release/trash`** (owner, 2026-09-28: one release branch for all resumed work — a separate `release/2026-09-28` was cut and deleted the same evening); the task branch merges `origin/release/trash` first and PRs `--base release/trash`. The editor fixes therefore ship when `release/trash` ships.

- **Owner ruling (2026-09-24 ~00:45):** *"pause Editor-skin".* Unit R (the "Keep … as text" chip removed, Backspace-undo kept) is going into the notes release on the owner's word, ~01:02.
- **Branch:** `task/editor-skin` at `d7eb16ec6a491076b8a451978480cb164201be65`. That is Unit R on top of the lane's plan doc `docs/superpowers/plans/2026-09-24-editor-skin.md` (`dec19452`).
- **Root cause:** `packages/editor/src/styles/editor.css` is colour-free by rule, and the web skin in `apps/web/app/globals.css` was never written. It has rules for one editor class only (`.mention-popup`).
- **Left:**
  - The content skin: code blocks, inline code, headings, lists, task lists, quotes, rules, images, collapsibles, links.
  - The chips: mention, `:ticket`, note link, and the missing-target pill. No underline on hover.
  - In-document chrome: the code block's Copy button, the note-link preview.
  - **T1:** table skin.
  - **T2:** port the owner's knowledge-base `TableFloatingToolbar.tsx` (9 actions).
  - A coverage check driven from the classes the editor emits.
  - A light and dark gallery pass with screenshots.
  - Regenerate the mobile bundle.
- **Case block:** `9.338`–`9.367`.
- **Brief:** `docs/lanes/held/BRIEF-editor-skin-2026-09-24.md`.

## 4. Knowledge-base editor parity — never started

- **RESUMED 2026-09-28 ~21:5x IST, sequenced:** it starts only after items 2 AND 3 have landed on `release/trash` (same files). Base `release/trash`.

- **Owner ruling (2026-09-24 ~00:2x):** *"lets pause it for now."* The owner's instruction that created it: *"i took a lot of time to refine the editor in knowledgebase. make sure to study them and implement them here. without the live reveal of the markdown syntax."*
- **Branch:** none. It was never cut.
- **The reference:** `/Users/kiro/my_projects/knowledge-base/src/app/knowledge_base/features/document/` (43 files, 8,623 lines, at the knowledge-base commit `10d3350`).
- **Excluded:** the `markdownReveal*` / `rawSyntaxEngine` / `RawBlock` family.
- **Sequence:** it runs **after** items 2 and 3, because they touch the same files.
- **Brief:** `docs/lanes/held/BRIEF-kb-editor-parity-2026-09-24.md`. It holds the per-file inventory and needs a written port/adapt/already-here/n-a verdict per file.

## 5. Smaller follow-ups the owner has not scheduled

- **Backlinks and unlinked mentions:** notes spec §13 lists them as a follow-up, and the knowledge-base has `BacklinksRail.tsx` / `UnlinkedMentions.tsx`.
- **An "Insert table" button:** the knowledge-base has `TablePicker.tsx`. This is covered by item 4 when it runs.
- **Reference-chip titles for readers who cannot see the target:** the owner ruled (2026-09-24) to **ship as is** (option A). Option B, where the server redacts the stored key/title, is not scheduled. It is recorded only so it isn't re-raised as new.
- **Two browser-test defects found at the notes release (2026-09-24), test-only:** (a) `getByRole('textbox', { name: 'Title' })` is ambiguous on /notes (it also matches "Filter by title"), so 18.257/18.282/18.283 fail — fix with `{ exact: true }` at the 3 sites; (b) 18.254–18.256 and 18.330 time out finding the "Find a note" box after Attach note, yet the owner verified the flow BY HAND on the dev stack and a hand probe passes — root-cause the spec (traces were kept under `apps/web/test-results/` on the dev machine).
- **Two small behaviours found at the notes release, owner's call:** Backspace straight after ``` deletes the new code block instead of restoring the three backticks (older behaviour, documented in #731); in a note with no project, `:ticket` says "Search needs a connection", the wrong reason on screen.
- **Case 13.1430 (Docker build cache) needs one more deploy:** the notes release was the first build of the new Dockerfiles, so the `RUN pnpm fetch` layer was not cached on web, server or backup (3 × "No cached layer found"), and backup did not reuse server's layers. The next production deploy should show "Found cached layer" for that step — read its build log then.
- **The remaining notes-spec follow-ups (§13):** inline anchored comments, nested notes, notes on the mobile/desktop apps, a Garo-language search model.
