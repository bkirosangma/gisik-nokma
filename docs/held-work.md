# Held work — paused by the owner, to resume on the owner's word

**Written 2026-09-24 ~01:05 IST** by the planner session, on the owner's instruction: *"persist the held items somewhere so they are not lost."*
Every item below was **paused by the owner** so that the notes release could ship. Nothing here is abandoned. Each has its branch pushed, its commit recorded, and its full brief copied into `docs/lanes/held/`, because the originals live in `gisik-nokma-lanes/`, which is not under git.

**To resume any item:**
1. The owner says so.
2. Merge the current release branch into the item's branch first. Never rebase.
3. Give the lane its brief from `docs/lanes/held/`. The lane restarts at the first task or unit with no commit.

**Update this file in the same change set** whenever an item resumes, lands, or is dropped. (Housekeeping 2026-10-02, HK-6: items 1 to 4 are marked SHIPPED here, with their release PR, rather than deleted. Prune them whenever the owner says.)

**State as of 2026-10-02 ~20:00 IST: items 1 to 4 are all in `main`, shipped by the `release/trash` release, PR #761 (merge `bd7440bc`, 2026-09-29).** Ancestry was checked on 2026-10-02: each branch tip below is an ancestor of that merge. Only §5 is still open work.

---

## 1. Trash & purge: archive, soft delete, 15-day permanent purge. SHIPPED

- **SHIPPED in PR #761** (`release/trash` into `main`, merge `bd7440bc`, 2026-09-29). `release/trash` tip `a6449c77`.
- **Spec:** `docs/superpowers/specs/2026-09-23-trash-and-purge-design.md` (decisions T1 to T10; owner ruling T11: a purge erases the item, not other documents' quotes of it).
- **Plans:** 1 `docs/superpowers/plans/2026-09-23-trash-1-lifecycle-core.md` (#737); 2 `2026-09-28-trash-2-purge-engine.md` (#745); 3 `2026-09-29-trash-3-replica-sync.md` (#749); 4 `2026-09-29-trash-4-ui.md` (#746).
- **Case block:** `test-cases/19-trash.md` (`19.001` to `19.260`).
- **Still owed from it (moved to §5):** the backup worker's object store in the live app spec, and the dry-run of the 30-day orphan sweep.
- **Briefs:** `docs/lanes/held/LANE-trash-plan-2026-09-23.md` and `docs/lanes/held/CTL-HANDOFF-trash-series-2026-09-23.md`.

## 2. Editor polish. SHIPPED

- **SHIPPED in PR #761** (merge `bd7440bc`, 2026-09-29), via `release/trash`. `task/editor-polish` tip `f79acbd3`; the work landed as #739 (Units 1 to 6e). Units 1 and 3 had already shipped in the notes release (#727).
- **Case blocks:** `9.313` to `9.337`, and §18's `18.301` to `18.311`.
- **Owner ruling kept (2026-09-28):** placeholders accept 3:1 contrast for `hig` and `minimal` (neo clears 4.5:1).
- **Still open (moved to §5):** the live browser check 9.317 is still 🧪 PARTIAL in `test-cases/09-editor-attachments.md`.
- **Brief:** `docs/lanes/held/BRIEF-editor-polish-2026-09-23.md`.

## 3. Editor skin: everything the editor draws, and tables. SHIPPED

- **SHIPPED in PR #761** (merge `bd7440bc`, 2026-09-29), via `release/trash`. `task/editor-skin` tip `4c50a165`; the work landed as #738 (content, chip and table skin, `TableFloatingToolbar`, A5a).
- **Case block:** `9.338` to `9.367`.
- **Brief:** `docs/lanes/held/BRIEF-editor-skin-2026-09-24.md`.

## 4. Knowledge-base editor parity. SHIPPED

- **SHIPPED in PR #761** (merge `bd7440bc`, 2026-09-29), via `release/trash`. `task/kb-editor-parity` tip `4ed6ba7c`; the work landed as #744.
- Includes the Insert-table picker (`packages/editor/src/components/TablePicker.tsx`, `f612840a`, cases 9.380–9.384).
- **Reference:** `/Users/kiro/my_projects/knowledge-base/src/app/knowledge_base/features/document/`, at the knowledge-base commit `10d3350`. The `markdownReveal*` / `rawSyntaxEngine` / `RawBlock` family was excluded (owner: no live reveal of the markdown syntax).
- **Brief:** `docs/lanes/held/BRIEF-kb-editor-parity-2026-09-24.md`.

## 5. Smaller follow-ups the owner has not scheduled

- **Backlinks and unlinked mentions:** notes spec §13 lists them as a follow-up, and the knowledge-base has `BacklinksRail.tsx` / `UnlinkedMentions.tsx`.
- **Reference-chip titles for readers who cannot see the target:** the owner ruled (2026-09-24) to **ship as is** (option A). Option B, where the server redacts the stored key/title, is not scheduled. It is recorded only so it isn't re-raised as new; it stays unscheduled.
- **Two browser-test defects found at the notes release (2026-09-24), test-only:** (a) `getByRole('textbox', { name: 'Title' })` is ambiguous on /notes (it also matches "Filter by title"), so 18.257/18.282/18.283 fail — fix with `{ exact: true }` at the 3 sites; (b) 18.254–18.256 and 18.330 time out finding the "Find a note" box after Attach note, yet the owner verified the flow BY HAND on the dev stack and a hand probe passes — root-cause the spec (traces were kept under `apps/web/test-results/` on the dev machine).
- **Two small behaviours found at the notes release, owner's call — BOTH FIXED, 2026-09-29:** Backspace straight after ``` deleted the new code block instead of restoring the three backticks (older behaviour, documented in #731) — fixed by editor-skin's A5a (owner ruling 2026-09-29, case `9.359`, PR #738). In a note with no project, `:ticket` said "Search needs a connection", the wrong reason on screen — fixed by editor-polish's Unit 6e (cases `18.310`–`18.311`, PR #739): a bare `:ticket` now lists the workspace's recent visible tickets.
- **Case 13.1430 (Docker build cache), read 2026-10-02 (HK-1) on deployment bf9c374b (the first deploy read since 59ccb812; five deploys came between, the one just before being 67b02899, d66c11e, 2026-10-02 10:10 UTC): 🟡.** The `RUN pnpm fetch` layer is now cached on web, server and backup (3 × `Found cached layer, extracting to filesystem`), `pnpm install` is uncached by design (it follows `COPY . .`), and only two stages build. Wall times did NOT drop (web 5m17s, server 5m20s, backup 5m18s, against 4m16s, 5m27s and 4m17s at 67b02899 the same morning, which logged `No cached layer found for cmd RUN pnpm fetch` on all three and primed the cache; 4m40s and 4m09s at the first build, 59ccb812): extracting the cached fetch layer took about 156 s on each, against 115 s (web), 112 s (backup) and 155 s (server) for the uncached fetch at 67b02899. The reading is in `test-cases/13-deploy-and-ops.md` 13.1430; whether to keep the registry cache is open.
- **The remaining notes-spec follow-ups (§13):** inline anchored comments, nested notes, notes on the mobile/desktop apps, a Garo-language search model.
- **The trash backup worker's object store is not applied (HK-2 of the 2026-10-02 housekeeping set, PREPARE ONLY; the owner's word is needed to apply):** `deploy/do/app.yaml` gives the `backup` component `OBJECT_STORE=s3` and `OBJECT_STORE_S3_BUCKET`, the LIVE app spec has neither (trash Plan 2 Task 9's release step). Applying it with `doctl apps update` (from the LIVE spec; a push does not apply the spec) also arms the 30-day orphan sweep against the real attachments bucket for the first time, so dry-run the sweep first.
- **Browser case 9.317 (the `:ticket` popup above `.gn-sheet__scrim`) is still 🧪 PARTIAL** (editor polish Unit 3): measured on a lane dev server on 2026-09-24, not yet on the production build.
