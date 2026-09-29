# Trash — Plan 3 of 4: Replica + Sync (devices learn a purge, drop what they held, say so, and draw "Deleted item") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 6, 7, 8 and 10 touch a screen. They ALSO invoke `ui-ux-pro-max` beside the workflow skill (workspace `CLAUDE.md`, "UI/UX Design"). The design decisions are pinned under Global Constraints → Design, so the skill is a second opinion on contrast, focus and touch targets. It is not a licence to restyle.

**Goal:** A device that held something now permanently erased stops holding it. Its local events, rows, snapshots, contests (its own included) and queued offline changes are removed. Each dropped change is turned into a visible notice, never a silent delete. A chip or link to an erased item, in a document that survives, renders **Deleted item** on the web, over a replica, and in the phone's editor. The device learns all this without a delivery channel that cannot reach it.

**Architecture:**
- **One server read: `POST /v1/purged-lookup`.** It takes `{ ids }` (≤ 500 ULIDs) and returns the subset in Plan 2's `purged_entities` registry, as `{ kind, id }`. It carries no content, only whether an id the caller already holds was erased. This replaces spec §5.7's "the replica receives `purge.completed` through normal sync": measured, the stream cannot deliver most tombstones (D3).
- **Replica erase (`packages/sync-client`).** `replica.eraseEntities(refs)` is a new operation, distinct from `purgeEntity` ("lost access").
  - It recomputes the local subtree: a ticket's children by `parent_id`, a project's tickets and notes, a workspace's everything.
  - It deletes every local row for that subtree, INCLUDING the device's own contest stubs.
  - It turns each outbox row into a content-free `sync_notices` row.
  - It records every erased id in a new `purged_ids` table and strips the ids from the Deleted-items cache.
- **The engine learns at four moments:**
  1. every reconcile pass (in its own `try`, fed reconcile's own `purged[]`);
  2. a `not-a-member` stream error;
  3. a 403 from bootstrap;
  4. a `purge.completed` envelope that does reach the stream (project tombstones), which is never stored.
- **The outbox:**
  - A claim the door refuses with `PURGE_RULE` is removed and becomes a notice.
  - Every other refusal stays a failed row, which now carries its `lastError` and can be dismissed.
  - `SyncNotices` (app-core) draws both on desktop; the phone draws them natively.
- **Chips:**
  - `renderCommentBody`, the editor's `ticketRef`/`wikiLink` nodes and the webview bridge each take one predicate, `(kind, id) => boolean`.
  - `DataSourceQuery.purgedAmong(ids)` feeds that predicate. The online twin calls the lookup; the replica twin reads `purged_ids`.
  - `usePurgedPredicate` caches answers per session.
  - An editor mounts only once its document's answer has settled. A ProseMirror node view does not re-render when a predicate changes.
- **Deleted items offline:**
  - The replica data source caches the last online `GET /v1/me/deleted-items`.
  - Offline, it rejects with `DeletedItemsFromCache` carrying those items and their instant. Plan 4's section draws that as an "as of" view.
  - A cold cache still rejects with `ReplicaGapError`, which Plan 4 draws as **Deleted items needs a connection.**

**Tech Stack:** TypeScript monorepo (pnpm + turbo), zod in `packages/domain`, Fastify + `pg` in `apps/server` (test Postgres on 54329), SQLite through the `SyncStorage` seam (`better-sqlite3` in tests), React 19 + Testing Library + jsdom in `packages/app-core`, `packages/editor` (Tiptap 3) and `apps/web`, React Native (typecheck only) in `apps/mobile`, vitest everywhere.

**Spec:** `docs/superpowers/specs/2026-09-23-trash-and-purge-design.md`. This plan implements:
- §5.7 (offline devices), all of it except the server door, which is Plan 2's;
- §5.6's survivor chips on screen (T11: "the chip renders 'Deleted item' (Plan 3)");
- §6.3's last line ("the replica serves it offline").

Read §2 (T1, T5, T11), §5.3, §5.6 and §5.7 before Task 1. Plan 2 (`docs/superpowers/plans/2026-09-28-trash-2-purge-engine.md`, landed as #745) hands this plan four items:
- its D4 (chips need the client to know purged ids);
- its D6 (tombstone delivery is Plan 3's);
- its D7 (the client folds switch to `foldTicketEvent`);
- its Task 8 ("the device-side notice and outbox drop are Plan 3's").

**The series.**

| Plan | Spec sections | Depends on | Case block |
|---|---|---|---|
| 1 Lifecycle core (landed, #737) | §4, §6.3 read, T8–T10 | — | `19.001`–`19.080` |
| 2 Purge engine + backup retention (landed, #745) | §5.1–§5.6, §5.8, §7 (+ §5.7 server door) | 1 | `19.081`–`19.160` |
| **3 Replica + sync (this plan)** | §5.7, §5.6 on screen, §6.3's last line | 1, 2 (and 4 for Task 10) | `19.161`–`19.200` |
| 4 UI: dialog, cards, Account → Deleted items (landed, #746) | §6.1, §6.2, §6.3 screen | 1 | `19.201`–`19.260` |

**Case ids per task** (a block per task, not a tip. Memory: a shared id space needs blocks):

| Task | Section | Ids | Count |
|---|---|---|---|
| 1 The lookup | `## 19.30 The purged-id lookup` | 19.161–19.164 | 4 |
| 2 The door, through sync | `## 19.31 The door, through sync` | 19.165–19.166 | 2 |
| 3 The replica erases | `## 19.32 The replica erases` | 19.167–19.173 | 7 |
| 4 Client folds | `## 19.33 Client folds` | 19.174–19.175 | 2 |
| 5 The engine learns | `## 19.34 When a device learns` | 19.176–19.182 | 7 |
| 6 The outbox notice | `## 19.35 The outbox notice` | 19.183–19.187 | 5 |
| 7 Chips — data, comments | `## 19.36 Deleted item chips` | 19.188–19.191 | 4 |
| 8 Chips — the editor and the webview | `## 19.37 Deleted item chips in the editor` | 19.192–19.195 | 4 |
| 9 Deleted items cache | `## 19.38 Deleted items offline` | 19.196–19.197 | 2 |
| 10 The section's cached view | `## 19.39 The cached Deleted items view` | 19.198–19.199 | 2 |
| — | spare, never allocated by this plan | 19.200 | 1 |

## Global Constraints

- **Branch shape.**
  - Cut `task/trash-3-replica-sync` from `origin/release/trash` (Plan 2 is on it: `git log origin/release/trash --oneline | grep -c 'Trash 2/'` printed `12` at `265d029f`). One commit per task.
  - Open the PR with `bash scripts/ctl/ctl pr open task/trash-3-replica-sync --repo <worktree> --base release/trash --title T --body FILE`. Keep that command out of a compound chain.
  - Never use `--base main`. Never push to `main` or `release/trash`.
  - CI does not run on a dev PR into a release branch. The verification is your LOCAL run: say which run you quote, and paste `NODE=` beside it.
- **Node 22 for every run.** `node --version` prints `v22.*` in the same shell.
- **Build before suites:** `pnpm turbo run build` at the repo root before any package's vitest run.
  - `sync-client`, `app-core`, `apps/*` import `@gisik-nokma/domain`, `@gisik-nokma/sync-client` and `@gisik-nokma/editor` from `dist/`. A stale build turns a correct change into a false RED downstream (memory: suites-before-build-false-red). It cuts both ways, so rebuild before believing a GREEN as well.
- **Run a suite as** `cd <package> && pnpm exec vitest run --no-file-parallelism <files> > /tmp/trash3-<pkg>.log 2>&1; tail -20 /tmp/trash3-<pkg>.log`.
  - `<pkg>` is `server`, `domain`, `sync`, `appcore`, `editor`, `web` or `mobile`.
  - **Never pipe a test run into `head`**, and never `grep -m`. Either one orphans the worker pool (repo `CLAUDE.md`).
  - Never trust `$?` of a chain. Read the summary line. A log with no summary line is a crash, not a pass.
- **Server suites need the test Postgres:** `docker compose up -d postgres` (port 54329). Never touch 54330 (the dev DB).
- **Every case follows the same cycle:**
  1. RED first.
  2. A control in the same `it`.
  3. Commit.
  4. Apply the named mutation, show it red, and paste the red summary line.
  5. Restore with `git checkout -- <file>`.

  Commit BEFORE you mutate: `git checkout --` reverts to HEAD and silently destroys uncommitted work. A mutation must change the compiled artifact the test runs: rebuild the package before running a downstream suite against it (memory: mutation-must-reach-the-compiled-artifact). A mutation that reddens ZERO tests because the file failed to compile is not a kill. Read the run count.
- **Case ids.** This plan owns block **`19.161`–`19.200`** in `test-cases/19-trash.md` (3-digit padded), allocated per task in the table above.
  - Plans 2 and 4 have landed. Plan 4 holds `## 19.19`–`## 19.28`. Plan 2's review-fix section was renumbered on the merge to `## 19.29 Whole-branch review fixes` (`test-cases/19-trash.md:261` at `265d029f`), and it is the file's last section. This plan therefore starts at **`## 19.30`**.
  - Write each case as a `- ❌ **19.1NN — …**` id LINE, one id per line. Never put an id in a table, a heading, backticks, or two ids in one sentence: `scripts/check-case-ids.mjs` cannot see those.
  - After adding a task's cases, run `node scripts/check-case-ids.mjs` and confirm the count moved by EXACTLY that task's count. At `265d029f` it printed `ok (3605 unique ids, highest 19.260)`.
  - Flip `❌`→`✅` in the commit that adds the citing test. Test names contain the id. `pnpm check:citations` stays green, and the `"19-trash.md": 0` baseline stays 0.
  - **Amending an existing case** keeps its id and its marker. Append one sentence: "Amended 2026-09-29 by 19.1NN (trash Plan 3): …". Never renumber. This plan amends 19.071.
- **`Features.md`:** each task appends its bullet(s) at the END of `## 16. Archive, delete and purge` (`Features.md:3415` at `265d029f`; the section runs to EOF) in the same commit as its code. Where a task changes a feature described elsewhere, it ALSO appends a `  - ✅ …` / `  - ⚙️ …` sub-bullet under that existing bullet and does not rewrite it.
- **Copy (exact strings, exported constants; tests import and pin the constant):**
  - `PURGED_OUTBOX_NOTICE = 'A change to an item that was permanently deleted could not be saved, and was removed.'` (`packages/domain/src/purge.ts`, Task 1)
  - `failedClaimNotice(lastError)` → `` `A change could not be saved — ${lastError}` ``, or `'A change could not be saved.'` when `lastError` is null (`packages/app-core/src/sync/sync-notices.tsx`, Task 6)
  - `SYNC_NOTICE_DISMISS = 'Dismiss'` (Task 6)
  - `PURGED_ITEM_LABEL = 'Deleted item'` is Plan 2's (`packages/domain/src/purge.ts:16`). This plan renders it and never re-spells it.
  - `deletedItemsAsOf(when)` → `` `Deleted items as of ${when}, saved on this device. Restoring and marking need a connection.` `` (`packages/app-core/src/trash/copy.ts`, Task 10)
- **The rule id is one constant.** `PURGE_RULE = 'purge.erased'` moves to `packages/domain/src/purge.ts` (Task 1). `apps/server/src/purge/check-purged.ts` re-exports it. No other file spells `'purge.erased'`.
- **The lookup cap is one constant.** `PURGED_LOOKUP_MAX_IDS = 500` (domain). The route schema, the engine's chunking and the online twin's chunking all read it.
- **Design (ui-ux-pro-max, through this repo's tokens and components).** No new tokens and no raw colours (`packages/ui/test/token-discipline.test.ts`). `packages/editor/src/styles/editor.css` forbids every colour form (its header), so editor rules use shape and weight only.
  - **Deleted-item chip:**
    - text `Deleted item`, never a link;
    - italic, so colour is never the only signal;
    - `cursor: default`, no underline;
    - in comments, `color: var(--gn-text-muted)` (`--gn-text-muted` already styles `.gn-sync-status-bar`, `packages/ui/src/ui.css:4963`).
    - No `title=` tooltip. The chip keeps its `data-ticket-id`/`data-note-id` so the document round-trips unchanged.
  - **Notices:**
    - a region with `aria-live="polite"` and `aria-label="Sync notices"`;
    - each notice is a sentence plus a **Dismiss** button;
    - the button is `min-height: 2.75rem` (44 px touch target), with a visible `:focus-visible` ring `outline: 2px solid var(--gn-focus-ring)` (the ring `editor.css` uses for `.editor-slot__submit`);
    - its accessible name starts with its visible text (`Dismiss: <sentence>`, WCAG 2.5.3);
    - text colour `--gn-text`, and a left border `--gn-warning`, the colour `.gn-sync-status-bar__error` uses for a server-named reason;
    - no motion.
  - **Cached Deleted items view:** the rows only, with no Restore/Mark/Unmark buttons (a door is shown only to whoever may use it, and offline nobody can), and one `gn-account__note` line above the list naming the instant.
- **Help corpus.** `docs/manual.md` and `docs/faq.md` generate `packages/app-core/src/help/content.generated.ts`. `pnpm check:help` refuses a stale copy AND compares every double-quoted span in the two documents against the product (baseline `scripts/help-quoted-strings-absent.json`).
  - A task that edits either document runs `pnpm help:generate`, then `pnpm check:help`, and commits the regenerated module.
  - Quote with double quotes ONLY a product constant (`PURGED_OUTBOX_NOTICE`). Put button labels and `Deleted item` in **bold**, never in quotes.
- **Plan 4 (UI) has landed (#746, `265d029f`).**
  - Its code is on this plan's base:
    - `DeletedItemsSection`, `trash/copy.ts`;
    - its edits to `ticket-sheet.tsx`, `note-document.tsx`, `mappers.ts`, `index.ts`, `docs/manual.md` and `Features.md`.
  - Every citation below was read on that merged tree.
  - Before the PR:
    1. `git fetch origin && git merge origin/release/trash` again.
    2. If a later lane landed, keep its sections and §16 bullets before this plan's.
    3. Re-run `pnpm help:generate` after the merge; never hand-edit the generated module.
    4. The guard must then read your count plus exactly the id lines the merge brought in.
- **Never `AskUserQuestion`.** A question goes into your progress line for the controller.
- **Line numbers** in this plan were read at `origin/release/trash` **`265d029f`** (Plans 1, 2 and 4 landed). Plan-2 files there are byte-identical to the Plan-2 branch tip `ba2afed3` except `apps/server/src/ops/prune-backups.ts`, which this plan does not touch. Open the file; trust the symbol, not the number.

## Recorded deviations from the spec (and from the brief)

- **D1 — a new server read, `POST /v1/purged-lookup`, that the spec does not have.**
  - Body `{ ids: string[] }`: ≤ `PURGED_LOOKUP_MAX_IDS` (500), each matching `ULID_REGEX`. Answer `{ purged: Array<{ kind, id }> }`, the subset present in `purged_entities`, restricted to the four lifecycle kinds, sorted by kind then id.
  - Any signed-in caller may ask. The answer is only "was this id erased". The ids are ULIDs the device received legitimately. No name, title or workspace is returned.
  - It is the only way a device can learn of a purge it can no longer see (D3). It is also the only way the web renderer, which holds no replica, can draw a chip as **Deleted item**.
  - Every client sends ULIDs only (the engine's `learnPurges` and the online twin filter with `ULID_REGEX`), so one legacy chip id cannot 400 a whole chunk.
  - The SQL crosses the asked ids with `PURGEABLE_KINDS` so each probe hits `purged_entities`' primary key `(entity_kind, entity_id)` (`apps/server/migrations/1790600000000_purge-engine.sql:7-13`). No new index or migration is needed.
- **D2 — `replica.eraseEntities` is new; it is not `purgeEntity`.**
  - `purgeEntity` (`packages/sync-client/src/replica/replica.ts:1409-1442`) means "this device lost access". It keeps the device's own contest stubs (`:1430-1431`, `claimant_id <> me`) and every outbox row, because that work may still be the person's to resolve.
  - A purge is not a loss of access. It is an erasure, and spec §5.7 says the device "deletes every local row and local event for the erasure set". `eraseEntities` deletes the stubs too. It turns outbox rows into notices, never silently.
  - Two new local tables:
    - `purged_ids`, what was erased, content-free;
    - `sync_notices`, content-free: event id, target and type, NEVER the payload, which is purged content.

    They are tables, not columns, because `migrateLocal` runs `CREATE TABLE IF NOT EXISTS` and nothing else (`packages/sync-client/src/storage/schema.ts:60-78`).
  - A guard (19.172) mirrors Plan 2's 19.081. `LOCAL_TABLE_RULES` names every local table, and a table added later without a rule reddens.
  - Survivors need no local rewrite. A surviving note that listed an erased ticket in `attached_ticket_ids` is still read correctly, because the replica's badge reader omits every ticket the device does not hold (`packages/app-core/src/replica/replica-data-source.ts:854-860`).
- **D3 — delivery is the lookup, not the stream (spec §5.7: "the replica receives `purge.completed` through normal sync").** Measured at `265d029f`:
  - A ticket tombstone never reaches a device: `canSee` is false once `proj_visibility` is erased (`apps/server/src/visibility/visible-events-for.ts:484-485`).
  - A note tombstone never reaches a device: `loadNoteForVisibility` finds no note (`:697-698`).
  - A project tombstone reaches non-guests (`:250-256`, `:645-647`), but the replica would only have stored it.
  - A workspace purge delivers nothing: the role is null (`:451-459`), and the subscribe is answered `not-a-member` (`apps/server/src/stream/routes.ts:73-76`), a frame the engine only stores (`packages/sync-client/src/engine/sync-engine.ts:894-900`).
  - So the lookup is the delivery. The replica recomputes locally only the SUBTREE (a ticket's children, a project's tickets and notes, a workspace's everything), which Plan 2's registry already lists id by id (`apps/server/src/purge/erasure.ts:128-136` records every member of the erasure set). The local recompute makes a device whose registry lookup missed a child still drop it.
  - A `purge.completed` envelope that does arrive is **never inserted** into local `events`. It triggers a FULL lookup pass, which covers the "entity + local subtree" the brief names, and more.
- **D4 — "a device offline for longer than the purge window resyncs from a snapshot" (§5.7) needs no new mechanism.** There is no cursor floor and no forced resync today. The first reconcile pass after reconnecting sends every id the device holds, and every one that was erased is removed then. A device that never reaches `caught-up` because its workspace was purged learns through D5's `not-a-member` arm instead.
- **D5 — when the device asks (brief design 3, adapted).**
  1. **After every reconcile pass**, in its OWN `try`, so a failed reconcile does not skip it. It is fed reconcile's own `purged[]`.

     This matters because reconcile runs first and `purgeEntity`s every erased ticket and note (`canSee` is false). A lookup built afterwards from `listTickets`/`listNoteIds` alone would miss exactly those ids. The candidate set is therefore the union of:
     - the workspace id;
     - held tickets and notes;
     - reconcile's purged ids;
     - every `contests.ticket_id`;
     - every outbox `entity_id`;
     - every chip id inside a locally held body: note bodies, note comments, ticket comments and descriptions, via `collectDocReferences` (`packages/domain/src/doc-text.ts:149-173`).

     The last one is what lets a chip to a never-held erased item render **Deleted item** offline.

     The pass runs under the same 60-second gate as reconcile (`sync-engine.ts:435`, `:880-890`), so a flapping socket cannot storm the lookup.
  2. **A `not-a-member` stream error** (`sync-engine.ts:894-900`) queues a lookup that includes the workspace id. Only if the answer names the workspace does the device erase it and end the stream, the way a whole-workspace `scope-revoked` does (`:827-830`). A plain membership revoke answers nothing here, and stays `revokeScope`'s business.
  3. **A 403 from bootstrap** is now a typed `WorkspaceAccessLost` (message unchanged, `bootstrap failed: 403`, `packages/sync-client/src/net/http-transport.ts:192`). `start()` asks the lookup. If the workspace was erased, `start()` resolves with the device emptied. Otherwise it rethrows as before.
  4. **A `purge.completed` envelope** (D3).

  A reconcile 403 needs no arm of its own: it is swallowed (`sync-engine.ts:885-890`), and pass 1 still runs with the workspace id among the candidates.
- **D6 — the brief's "a new `failedItems()` detail read" already exists** (`packages/sync-client/src/outbox/outbox.ts:199`, `:483-489`). This plan widens `OutboxItem` with `lastError` (it is written at `:457` and dropped by `rowToItem` at `:206-215`). It adds `dismissFailed`, `notices`, `dismissNotice`.
  - A claim refused with `PURGE_RULE` is removed and becomes a notice rather than a permanent failed row.
  - The rule id moves to the domain because `sync-client` may not import `apps/server` (`outbox.ts:8-14` states that rule for its own mirror).
- **D7 — where the chip predicate travels, and what it cannot reach.**
  - One predicate type everywhere: the domain's own `NonNullable<DocTextOptions['isPurged']>`, `(kind: 'ticket' | 'note', id) => boolean` (`packages/domain/src/doc-text.ts:75-77`).
  - `DataSourceQuery` gains `purgedAmong(ids)`. That grows the `keyof DataSourceQuery` tripwire (`apps/server/test/integration/soft-delete-client-surface.test.ts:465-510`, `:825`) by one row, which this plan writes. The verdict is `excluded`, `carries: false`: the read returns ids and kinds only.
  - **The brief's "desktop" witness does not exist**, and nothing is claimed for it:
    - The desktop shell renders no document at all, only a ticket list (`apps/desktop/src/app.tsx:173-196`).
    - The replica data source cannot serve ticket comments: `getTicketComments` is in `REPLICA_GAPS` (`packages/app-core/src/replica/replica-data-source.ts:637`).
    - The replica twin of `purgedAmong` is witnessed directly (19.189). The rendering is witnessed through the ticket sheet over a fake `DataSource`, and on the web's note comments (19.191).
  - **The phone's editor is only an empty comment composer** (`apps/mobile/src/screens/ticket-screen.tsx:134-142`, `initialDoc={draft}` seeded empty). So the webview case (19.194) pins the BRIDGE: `loadDoc` carries `purgedIds`, and they apply before `setContent`. It pins no phone screen.
  - **Late answers.** A ProseMirror node view is built when the node is. A predicate that changes later does not redraw it.
    - So an editor whose stored document contains chips mounts only after that document's lookup has settled (`ready`: never before the caller's documents are `loaded`, sticky once true; a failed lookup settles as "nothing purged").
    - The ticket sheet keeps two predicates over one session cache, so its description waits only for its own chips.
    - A document with no chips is ready at once, so no existing mount waits.
    - Comment bodies are React and simply re-render.
- **D8 — client folds** (Plan 2's D7). `refoldTicket` (`replica.ts:921`) and `buildPendingOverlay` (`packages/sync-client/src/precheck/local-context.ts:151`) switch to `foldTicketEvent` (`packages/domain/src/ticket-state.ts:483-490`).
  - The server never delivers a redacted row (D3), so this is a guard.
  - Without it, `applyTicketEvent`'s named throw (`ticket-state.ts:129-133`) would stall the engine on one.
- **D9 — Deleted items offline (spec §6.3's last line; brief design 8), resolved with Plan 4's screen in mind.**
  - The replica has no lifecycle state to compute the list, so the replica data source caches the last ONLINE answer in a local `deleted_items_cache` table.
  - Desktop and mobile hold no online data source (`apps/desktop/src/init-replica.ts:33-54`), so the online read is fetched through a new `SyncTransport.deletedItems()`.
  - **Offline it does not RESOLVE with the cached list.** It rejects with `DeletedItemsFromCache`, which carries the items and their `fetchedAt`.
    - `getDeletedItems(): Promise<DeletedItem[]>` promises the current list. A cached list resolved through it would be indistinguishable from one, the claim the replica's gap entries exist to refuse (`replica-data-source.ts:346-353`).
    - The alternative, a second `DataSourceQuery` method, would grow the tripwire again for a value only one screen reads.
  - Plan 4's (landed) `DeletedItemsSection` recognises the error by NAME, as it already recognises `ReplicaGapError` (`packages/app-core/src/account/deleted-items-section.tsx:88`). It draws the rows read-only under "Deleted items as of <time>, saved on this device…" (Task 10).
  - **A cold cache still rejects with `ReplicaGapError`.** So `REPLICA_GAPS.getDeletedItems` is NARROWED, not removed (the brief said remove):
    - `REPLICA_GAPS` is documented as "every refusal this source makes" (`:631-632`), and a device that has never been online since this landed still refuses.
    - The entry becomes `DELETED_ITEMS_NOT_CACHED`, whose owner still matches 12.185's owner pattern (`packages/app-core/test/replica/replica-data-source.test.ts:559-561`).
  - Plan 4's `DELETED_ITEMS_OFFLINE` ("Deleted items needs a connection.") stays, and now means exactly "never cached".
  - Case 19.071 is amended in place (its prose and its assertion on the absence's field). Its id and ✅ stay.
  - **No shell mounts the section over a replica today:** the Account page is web-only, and the desktop and phone have none. The cached view is reachable the day a replica-backed shell mounts the section. This plan does not add that screen.
- **D10 — the door, through sync (brief design 10; UNVERIFIED in the brief, read here).**
  - A NEW `ticket.created` whose parent is erased is refused at the client door (`apps/server/src/purge/check-purged.ts:32-36`). Because it is a ticket, `processOne` then files a `claim.contested` on the NEW ticket's id through the internal door (`apps/server/src/sync/sync-service.ts:416-417`, `:197-206`).
  - `checkPurged` has no `claim.contested` arm (`check-purged.ts:32-52`, `default: break`). The new id is not in the registry, so the contest COMMITS. The device is told `contested`, and the ledger gains a contest embedding a claim about an erased parent.
  - The same holds for a `ticket.reparented` under an erased ticket.
  - Task 2 pins it RED first. The fix recurses `payloadIds` one level into `originalEvent` (its entity and its payload's container ids). After the fix, the contest append is refused and `contest()` answers the claim's own refusal (`sync-service.ts:254-290`).
- **D11 — the hub is not woken by a purge** (`purgeItem` runs in the backup worker and writes with `insertEvent`; the hub wakes on `ingest.onEventCommitted`, `apps/server/src/app.ts:981`, `apps/server/src/stream/hub.ts:347-351`). Accepted: devices learn at their next reconcile pass, `not-a-member`, bootstrap, or tombstone. No NOTIFY bridge in this plan.
- **D12 — the two new `SyncTransport` methods are REQUIRED, not optional.** An optional `purgedLookup` would compile on every fake and silently never erase. Seven implementers are updated in the tasks that add them:
  - `packages/sync-client/test/sync-engine.test.ts:232`
  - `packages/sync-client/test/sync-engine-notes.test.ts` (its `reconcile` at `:142`)
  - `packages/app-core/test/replica/replica-data-source.test.ts:145` and `:657`
  - `packages/app-core/test/replica/replica-data-source-notes.test.ts` (its `reconcile` at `:136`)
  - `packages/app-core/test/replica/replica-deleted-reads.test.ts` (its `reconcile` at `:65`)
  - `apps/server/test/dual-client/rig.ts:405-509`
  - `createHttpTransport`

  The desktop and mobile `init-replica` tests stub the transport as `({}) as never` and need no change.

## Review Focus

Inputs and conditions the spec implies that no happy path exercises, most likely first. Each has its test in the owning task.

1. **An offline edit to a ticket that was purged while the device was offline.**
   - Expected: on reconnect the claim is refused with the purge reason, removed from the outbox, and shown as `PURGED_OUTBOX_NOTICE`. It never becomes a permanent failed row, and the device's copy of the ticket is gone.
   - Owner: Task 6, case 19.187 (the real server, through the dual-client rig); the unit arm is 19.183.
2. **The device's OWN contest stub on a purged ticket.**
   - Expected: it is erased. `purgeEntity` would keep it, and a contest embeds the claim whole, which is purged content.
   - Owner: Task 3, case 19.167.
3. **A membership revoke that is not a purge.**
   - Expected: the `not-a-member` frame triggers a lookup, the lookup answers nothing, and nothing is erased. The device keeps what `revokeScope` alone decides.
   - Owner: Task 5, case 19.180.
4. **A device holding more than 500 ids, with one lookup chunk failing.**
   - Expected: every call carries ≤ 500 ids. The failing chunk is recorded, and ids answered by later chunks are still erased.
   - Owner: Task 5, case 19.178.
5. **A chip to a purged note inside a SURVIVING comment.**
   - Expected: it renders **Deleted item** with no link, both through the ticket sheet's thread and on the web's note comments. The comment's stored body is unchanged (T11).
   - Owner: Task 7, case 19.191; the replica twin of the same predicate is 19.189.

---

## File map

| File | Responsibility in this plan |
|---|---|
| `packages/domain/src/purge.ts` | `PURGE_RULE`, `PURGED_LOOKUP_MAX_IDS`, `PurgedRef`, `PurgedPredicate`, `PURGED_OUTBOX_NOTICE`, `isPurgedRef` |
| `apps/server/src/purge/check-purged.ts` | re-exports `PURGE_RULE`; the `claim.contested` arm (D10) |
| `apps/server/src/purge/purged-lookup.ts` | `purgedRefsAmong` |
| `apps/server/src/purge/lookup-route.ts` (new) | `POST /v1/purged-lookup` |
| `apps/server/src/app.ts` | registers the route beside Deleted items (`:876`) |
| `packages/sync-client/src/storage/schema.ts` | `purged_ids`, `sync_notices`, `deleted_items_cache`; `LOCAL_TABLE_RULES`; version 3 |
| `packages/sync-client/src/outbox/notices.ts` (new) | `SyncNotice`, `dropOutboxRowsAsNotices`, `listNotices`, `deleteNotice` |
| `packages/sync-client/src/replica/replica.ts` | `eraseEntities`, `purgedAmong`, `purgeLookupCandidates`, `cacheDeletedItems`, `readDeletedItemsCache`; the `purge.completed` branch; `foldTicketEvent` |
| `packages/sync-client/src/precheck/local-context.ts` | `foldTicketEvent` |
| `packages/sync-client/src/outbox/outbox.ts` | `lastError`, `dismissFailed`, `notices`, `dismissNotice`, the `PURGE_RULE` arm |
| `packages/sync-client/src/engine/sync-engine.ts` | `purgedLookup`/`deletedItems` on `SyncTransport`; `WorkspaceAccessLost`; `learnPurges`; the four triggers; `fetchDeletedItems` |
| `packages/sync-client/src/net/http-transport.ts` | the two HTTP methods; the typed bootstrap 403 |
| `packages/sync-client/src/index.ts` | exports |
| `packages/app-core/src/data-source.ts` | `DataSourceQuery.purgedAmong` |
| `packages/app-core/src/online/online-data-source.ts`, `online/mappers.ts` | the online twin, `mapPurgedLookup` |
| `packages/app-core/src/replica/replica-data-source.ts` | the replica twin of `purgedAmong`; `syncNotices`/`dismissSyncNotice`; `getDeletedItems` over the cache; `DELETED_ITEMS_NOT_CACHED` |
| `packages/app-core/src/deleted-items-from-cache.ts` (new) | `DeletedItemsFromCache`, `cachedDeletedItemsOf` |
| `packages/app-core/src/sync/sync-notices.tsx` (new) | `SyncNotices`, `failedClaimNotice`, `SYNC_NOTICE_DISMISS`, `SyncNoticeView` |
| `packages/app-core/src/views/use-purged-predicate.ts` (new) | `usePurgedPredicate` |
| `packages/app-core/src/views/comment-body.tsx`, `comments-thread.tsx` | the purged arm of both chips |
| `packages/app-core/src/views/editor-slot.tsx`, `ticket-sheet.tsx` | `isPurged` through the slot; the sheet's predicate and deferred description |
| `packages/app-core/src/index.ts` | exports |
| `packages/editor/src/extensions/ticket-ref.ts`, `wiki-link.ts`, `schema/extensions.ts`, `components/TicketEditor.tsx`, `components/TicketEditorSlot.tsx`, `styles/editor.css` | the editor's purged arm |
| `packages/editor/src/webview/bridge.ts`, `create-editor-bridge.ts`, `entry.tsx` | `loadDoc.purgedIds` |
| `apps/mobile/src/editor/editor-bridge.ts`, `editor-web-view.tsx`, `editor-html.generated.ts`, `screens/board-screen.tsx`, `app.tsx` | the phone: `loadDocMessage` with `purgedIds`; notices |
| `apps/desktop/src/app.tsx` | mounts `SyncNotices` |
| `apps/web/src/notes/note-comments.tsx`, `note-document.tsx` | the web's predicate |
| `packages/ui/src/ui.css` | `.gn-sync-notices*`, `.gn-comment__ref--purged` |
| `packages/app-core/src/trash/copy.ts`, `account/deleted-items-section.tsx` (Plan 4's) | the cached view (Task 10) |
| `docs/manual.md`, `docs/faq.md`, `packages/app-core/src/help/content.generated.ts` | the notice and the chip, in the manual |
| `test-cases/19-trash.md`, `Features.md` | cases and the catalogue |

Tests (new unless stated):
- `packages/domain/test/purge-client.test.ts`
- `apps/server/test/purge/lookup-route.test.ts`
- `apps/server/test/purge/door-sync.test.ts`
- `apps/server/test/integration/soft-delete-client-surface.test.ts` (existing: one row)
- `apps/server/test/dual-client/rig.ts` (existing: transport) and `apps/server/test/dual-client/purge.test.ts`
- `packages/sync-client/test/purge-world.ts`, `purge-erase.test.ts`, `purge-folds.test.ts`, `purge-sync.test.ts`, `purge-outbox.test.ts`
- `packages/sync-client/test/storage.test.ts`, `replica-notes.test.ts`, `sync-engine.test.ts`, `sync-engine-notes.test.ts` (existing: pins and fakes)
- `packages/app-core/test/views/comment-body.test.tsx` (existing: one describe)
- `packages/app-core/test/views/use-purged-predicate.test.tsx`
- `packages/app-core/test/views/ticket-sheet-purged.test.tsx`
- `packages/app-core/test/online/online-data-source.test.ts` (existing: one describe)
- `packages/app-core/test/replica/replica-purged.test.ts`
- `packages/app-core/test/replica/replica-deleted-items-cache.test.ts`
- `packages/app-core/test/replica/replica-data-source.test.ts` (existing: 19.071, transports)
- `packages/app-core/test/replica/replica-data-source-notes.test.ts`, `replica-deleted-reads.test.ts` (existing: transports)
- `packages/app-core/test/sync-notices.test.tsx`
- `packages/app-core/test/replica/replica-sync-notices.test.ts`
- `packages/app-core/test/account/deleted-items-section.test.tsx` (Plan 4's: one describe)
- `packages/editor/test/purged-chips.test.ts`
- `packages/editor/test/webview-bridge.test.ts` (existing: one describe)
- `packages/editor/test/ticket-editor-slot.test.tsx` (existing: the transcription gains `isPurged`)
- `apps/web/test/editor-skin-coverage.test.ts` (existing: gallery and measured list)
- `apps/web/test/note-comments.test.tsx` (existing: one case)
- `apps/mobile/src/editor/editor-web-view.test.ts` (existing: one case)

---
### Task 1: The purged-id lookup — the domain vocabulary a device speaks, and `POST /v1/purged-lookup`

**Files:**
- Modify:
  - `packages/domain/src/purge.ts` (append after `isRedactedTicketCreated`, `:36-41`)
  - `apps/server/src/purge/check-purged.ts:1,10`
  - `apps/server/src/purge/purged-lookup.ts:1` (import) and EOF
  - `apps/server/src/app.ts:876` (register beside `registerDeletedItemsRoutes`)
  - `test-cases/19-trash.md` (new `## 19.30` at EOF), `Features.md` (§16 EOF)
- Create: `apps/server/src/purge/lookup-route.ts`, `apps/server/test/purge/lookup-route.test.ts`, `packages/domain/test/purge-client.test.ts`

**Interfaces:**
- Consumes:
  - `purged_entities` (Plan 2, `migrations/1790600000000_purge-engine.sql:7-13`);
  - `PURGEABLE_KINDS`, `LifecycleKind` (`packages/domain/src/lifecycle.ts:4-5`);
  - `ULID_REGEX` (`packages/domain/src/ids.ts:9`);
  - `DocTextOptions` (`packages/domain/src/doc-text.ts:75-77`);
  - `Queryable` (`apps/server/src/db/queryable.js`);
  - `requireSession` (`app.ts:817`).
- Produces (every later task relies on these names):
  - `PURGE_RULE = 'purge.erased'`, `PURGED_LOOKUP_MAX_IDS = 500`, `PURGED_OUTBOX_NOTICE` (domain)
  - `type PurgedRef = { kind: LifecycleKind; id: string }`
  - `type PurgedPredicate = NonNullable<DocTextOptions['isPurged']>`, i.e. `(kind: 'ticket' | 'note', id: string) => boolean`
  - `isPurgedRef(value: unknown): value is PurgedRef`
  - `purgedRefsAmong(db: Queryable, ids: readonly string[]): Promise<PurgedRef[]>` (server)
  - `registerPurgedLookupRoute(app, deps: { pool: Queryable }, requireSession): void`, answering `POST /v1/purged-lookup` `{ ids: string[] }` → `200 { purged: PurgedRef[] }` | `400` | `401`

Cases (`## 19.30 The purged-id lookup`, 4 ids):

```markdown
## 19.30 The purged-id lookup

- ❌ **19.161 — `POST /v1/purged-lookup` answers, of the ids asked, exactly those in `purged_entities` whose kind is a lifecycle kind, as `{ kind, id }` sorted by kind then id;** control: a live id asked beside them is absent, and a registry row of kind `workflow` for an asked id is absent. Mutation: join on the id alone (drop the `PURGEABLE_KINDS` cross join) — the `workflow` row appears.
- ❌ **19.162 — the body is refused with 400 for 501 ids and for an id that is not a ULID;** control: exactly 500 ULIDs answer 200, and an empty list answers `{ purged: [] }`. Mutation: raise `maxItems` to 1000.
- ❌ **19.163 — a signed-out caller gets 401;** control: the same body with a session answers 200. Mutation: drop `preHandler: requireSession`.
- ❌ **19.164 — the device vocabulary is pinned: `PURGED_OUTBOX_NOTICE` verbatim, `PURGE_RULE` is `purge.erased` and the server's re-export is the same constant, `PURGED_LOOKUP_MAX_IDS` is 500, and `isPurgedRef` admits the four lifecycle kinds with a non-empty id;** control: a `workflow` ref, an empty id and a ref without an id are refused. Mutation: `isPurgedRef` accepts any string kind.
```

- [ ] **Step 1: Write the cases** at the end of `test-cases/19-trash.md`. Run `node scripts/check-case-ids.mjs` and confirm the count moved from 3605 by exactly 4.

- [ ] **Step 2: Write the failing domain test** `packages/domain/test/purge-client.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  isPurgedRef,
  PURGE_RULE,
  PURGED_LOOKUP_MAX_IDS,
  PURGED_OUTBOX_NOTICE,
} from '../src/purge.js';

/**
 * Trash series Plan 3, Task 1 — the purge vocabulary a DEVICE speaks. The
 * server's re-export of `PURGE_RULE` is pinned beside the route (19.164's
 * second arm, `apps/server/test/purge/lookup-route.test.ts`).
 */
describe('19.164 the device purge vocabulary', () => {
  it('19.164 pins the notice, the rule id and the lookup cap; isPurgedRef admits the four lifecycle kinds', () => {
    expect(PURGED_OUTBOX_NOTICE).toBe(
      'A change to an item that was permanently deleted could not be saved, and was removed.',
    );
    expect(PURGE_RULE).toBe('purge.erased');
    expect(PURGED_LOOKUP_MAX_IDS).toBe(500);
    for (const kind of ['workspace', 'project', 'ticket', 'note']) {
      expect(isPurgedRef({ kind, id: '01J9GTKA000000000000000000' }), kind).toBe(true);
    }
    // CONTROL
    expect(isPurgedRef({ kind: 'workflow', id: '01J9GTKA000000000000000000' })).toBe(false);
    expect(isPurgedRef({ kind: 'ticket', id: '' })).toBe(false);
    expect(isPurgedRef({ kind: 'ticket' })).toBe(false);
    expect(isPurgedRef(null)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to see it fail.** `cd packages/domain && pnpm exec vitest run --no-file-parallelism test/purge-client.test.ts > /tmp/trash3-domain.log 2>&1; tail -20 /tmp/trash3-domain.log`. Expected: FAIL — `isPurgedRef` (and the three constants) are not exported.

- [ ] **Step 4: Implement the domain half.** At the top of `packages/domain/src/purge.ts`, below its existing `import type { EventEnvelope } from './envelope.js';` (line 1), add:

```ts
import type { DocTextOptions } from './doc-text.js';
import { PURGEABLE_KINDS, type LifecycleKind } from './lifecycle.js';
```

and append at the end of the file:

```ts
/**
 * The rule id every purge refusal carries. Declared by trash Plan 2 in
 * `apps/server/src/purge/check-purged.ts`; moved here by Plan 3 because the
 * DEVICE must recognise it (the outbox turns such a refusal into a notice) and
 * `packages/sync-client` may not import `apps/server`. The server re-exports
 * this constant; nothing else spells the string.
 */
export const PURGE_RULE = 'purge.erased';

/** The most ids one `POST /v1/purged-lookup` accepts. Every caller chunks at this size. */
export const PURGED_LOOKUP_MAX_IDS = 500;

/** One erased item as the lookup names it: its kind and id, and nothing else. */
export type PurgedRef = { kind: LifecycleKind; id: string };

/** The one predicate every chip renderer asks (the `DocTextOptions` shape Plan 2 gave search). */
export type PurgedPredicate = NonNullable<DocTextOptions['isPurged']>;

/**
 * What a device shows for an offline change it removed from its outbox because
 * the item it was about was permanently deleted (spec §5.7: "dropped from its
 * outbox with a visible notice — never silently").
 */
export const PURGED_OUTBOX_NOTICE =
  'A change to an item that was permanently deleted could not be saved, and was removed.';

const PURGEABLE: readonly string[] = PURGEABLE_KINDS;

/** A wire entry of the lookup's answer, read defensively: a lifecycle kind and a non-empty id. */
export function isPurgedRef(value: unknown): value is PurgedRef {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { kind?: unknown; id?: unknown };
  return (
    typeof candidate.kind === 'string' &&
    PURGEABLE.includes(candidate.kind) &&
    typeof candidate.id === 'string' &&
    candidate.id !== ''
  );
}
```

(`doc-text.ts` imports `PURGED_ITEM_LABEL` from this module as a VALUE. This module imports only a TYPE back, which is erased at compile time, so there is no runtime cycle.)

- [ ] **Step 5: Run the domain test to see it pass** (same command). Then `pnpm turbo run build --filter @gisik-nokma/domain`.

- [ ] **Step 6: Write the failing server test** `apps/server/test/purge/lookup-route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, PURGE_RULE as DOMAIN_PURGE_RULE, PURGED_LOOKUP_MAX_IDS, type PurgedRef } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { PURGE_RULE } from '../../src/purge/check-purged.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Trash series Plan 3, Task 1 (deviation D1): the content-free lookup a device
 * and the web renderer use to learn that an id they hold was erased. Rows are
 * inserted straight into `purged_entities` — it is not a trigger-protected
 * table, and these cases are about the READ, not about how Plan 2 fills it.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let headers: { authorization: string };

const WS = newUlid();
const T = newUlid();
const W = newUlid();
const LIVE = newUlid();
const WF = newUlid();

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();
  const user = await signInWithPhone(app, otp, '+919004400001');
  headers = { authorization: `Bearer ${user.token}` };
  await db.pool.query(
    `INSERT INTO purged_entities (entity_kind, entity_id, workspace_id, purged_at) VALUES
       ('ticket', $1, $2, now()), ('workspace', $3, $3, now()), ('workflow', $4, $2, now())`,
    [T, WS, W, WF],
  );
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

async function lookup(ids: unknown, withSession = true): Promise<{ status: number; purged: PurgedRef[] }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/purged-lookup',
    ...(withSession ? { headers } : {}),
    payload: { ids },
  });
  const purged = res.statusCode === 200 ? (res.json() as { purged: PurgedRef[] }).purged : [];
  return { status: res.statusCode, purged };
}

describe('19.161 the lookup answers the erased subset, lifecycle kinds only', () => {
  it('19.161 names the purged ticket and workspace in order; the live id and the workflow row are absent', async () => {
    const answer = await lookup([LIVE, W, T, WF]);
    expect(answer.status).toBe(200);
    expect(answer.purged).toEqual([
      { kind: 'ticket', id: T },
      { kind: 'workspace', id: W },
    ]);
    // CONTROL
    expect(answer.purged.map((ref) => ref.id)).not.toContain(LIVE);
    expect(answer.purged.map((ref) => ref.id)).not.toContain(WF);
  });
});

describe('19.162 the body is bounded and typed', () => {
  it('19.162 refuses 501 ids and a non-ULID with 400; 500 ULIDs and an empty list answer 200', async () => {
    const tooMany = Array.from({ length: PURGED_LOOKUP_MAX_IDS + 1 }, () => newUlid());
    expect((await lookup(tooMany)).status).toBe(400);
    expect((await lookup(['not-a-ulid'])).status).toBe(400);
    // CONTROL
    const atCap = Array.from({ length: PURGED_LOOKUP_MAX_IDS }, () => newUlid());
    expect((await lookup(atCap)).status).toBe(200);
    expect(await lookup([])).toEqual({ status: 200, purged: [] });
  });
});

describe('19.163 the lookup needs a session', () => {
  it('19.163 answers 401 without one and 200 with one', async () => {
    expect((await lookup([T], false)).status).toBe(401);
    // CONTROL
    expect((await lookup([T])).status).toBe(200);
  });
});

describe('19.164 the rule id is one constant', () => {
  it('19.164 the server re-exports the domain PURGE_RULE', () => {
    expect(PURGE_RULE).toBe(DOMAIN_PURGE_RULE);
    // CONTROL: the spelling the device matches on
    expect(DOMAIN_PURGE_RULE).toBe('purge.erased');
  });
});
```

- [ ] **Step 7: Run it to see it fail.** `cd apps/server && pnpm exec vitest run --no-file-parallelism test/purge/lookup-route.test.ts > /tmp/trash3-server.log 2>&1; tail -20 /tmp/trash3-server.log`. Expected: FAIL. 19.161–19.163 get 404 because the route does not exist; 19.164 passes only after Step 8's re-export (it compiles today because `check-purged.ts` exports its own literal).

- [ ] **Step 8: Implement the server half.**

In `apps/server/src/purge/check-purged.ts`, replace line 1 and line 10:

```ts
import { PURGE_RULE, PURGE_SERVER_ONLY_REASON, PURGED_REASON, type EventEnvelope } from '@gisik-nokma/domain';
```

```ts
// Moved to the domain by trash Plan 3 (the device matches on it); re-exported
// so every existing importer of this module keeps compiling unchanged.
export { PURGE_RULE };
```

In `apps/server/src/purge/purged-lookup.ts`, replace line 1 with:

```ts
import { collectDocReferences, PURGEABLE_KINDS, type DocTextOptions, type PurgedRef } from '@gisik-nokma/domain';
```

and append:

```ts
/**
 * The subset of `ids` that a purge erased, as `{ kind, id }` (trash Plan 3,
 * D1). Restricted to the four lifecycle kinds — a workspace purge registers
 * every entity of the workspace, workflows and memberships included, and a
 * device acts only on these four. The asked ids are crossed with the kinds so
 * each probe is a primary-key lookup on `(entity_kind, entity_id)`; duplicates
 * in the input are asked once.
 */
export async function purgedRefsAmong(db: Queryable, ids: readonly string[]): Promise<PurgedRef[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const { rows } = await db.query<{ entity_kind: PurgedRef['kind']; entity_id: string }>(
    `SELECT p.entity_kind, p.entity_id
       FROM unnest($1::text[]) AS q(id)
       CROSS JOIN unnest($2::text[]) AS k(kind)
       JOIN purged_entities p ON p.entity_kind = k.kind AND p.entity_id = q.id
      ORDER BY p.entity_kind, p.entity_id`,
    [unique, [...PURGEABLE_KINDS]],
  );
  return rows.map((row) => ({ kind: row.entity_kind, id: row.entity_id }));
}
```

Create `apps/server/src/purge/lookup-route.ts`:

```ts
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { PURGED_LOOKUP_MAX_IDS, ULID_REGEX, type PurgedRef } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { purgedRefsAmong } from './purged-lookup.js';

/**
 * `POST /v1/purged-lookup` (trash series Plan 3, deviation D1). A signed-in
 * caller names up to `PURGED_LOOKUP_MAX_IDS` ids it already holds and learns
 * which were permanently erased. Content-free by construction: the answer is
 * kinds and ids the caller sent, never a name, a title or a workspace. It is
 * the delivery a device cannot get from the stream (a purged ticket's
 * tombstone is invisible to everyone, `visibility/visible-events-for.ts`) and
 * the only way the web can draw a chip to an erased item as "Deleted item".
 */
export type PurgedLookupResponse = { purged: PurgedRef[] };

export function registerPurgedLookupRoute(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.post<{ Body: { ids: string[] } }>(
    '/v1/purged-lookup',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['ids'],
          additionalProperties: false,
          properties: {
            ids: {
              type: 'array',
              maxItems: PURGED_LOOKUP_MAX_IDS,
              items: { type: 'string', pattern: ULID_REGEX.source },
            },
          },
        },
      },
    },
    async (request): Promise<PurgedLookupResponse> => ({
      purged: await purgedRefsAmong(deps.pool, request.body.ids),
    }),
  );
}
```

In `apps/server/src/app.ts`, add `import { registerPurgedLookupRoute } from './purge/lookup-route.js';` beside the `registerDeletedItemsRoutes` import (`:38`), and directly after `registerDeletedItemsRoutes(app, { pool: deps.pool }, requireSession);` (`:876`) add:

```ts
  // The purged-id lookup (trash series Plan 3, D1): which of the ids a caller
  // holds were permanently erased. Same "me"-scoped door as Deleted items.
  registerPurgedLookupRoute(app, { pool: deps.pool }, requireSession);
```

- [ ] **Step 9: Run both tests to see them pass.** Then run the neighbours that import `check-purged.ts`, and read their summary lines: `test/purge/door.test.ts test/purge/purge-ticket.test.ts test/routes/deleted-items.test.ts`.

- [ ] **Step 10: Flip 19.161–19.164 to ✅, and append to `Features.md` §16:**

```markdown
- ⚙️ **The purged-id lookup** (`apps/server/src/purge/lookup-route.ts`, `purge/purged-lookup.ts`'s `purgedRefsAmong`; trash Plan 3 Task 1, deviation D1) — `POST /v1/purged-lookup { ids }` (≤ `PURGED_LOOKUP_MAX_IDS` = 500 ULIDs, a session required) answers `{ purged: [{ kind, id }] }`, the asked ids that Plan 2's `purged_entities` registry holds, restricted to workspace/project/ticket/note and sorted. Content-free: it says only whether an id the caller already holds was erased. It is how a device learns of a purge the stream cannot deliver, and how the web draws a chip to an erased item as "Deleted item". `PURGE_RULE` (`purge.erased`) moved to `packages/domain/src/purge.ts` beside `PURGED_OUTBOX_NOTICE`, `PurgedRef`, `PurgedPredicate` and `isPurgedRef`; `check-purged.ts` re-exports it. Cases 19.161–19.164.
```

- [ ] **Step 11: Commit** `Trash 3/Task 1: the purged-id lookup (19.161-19.164)`, with the RED and GREEN summary lines in the body. Then work through the mutations: mutate, rebuild if the file is in `packages/domain`, show red, restore.

---

### Task 2: The door, through sync — a claim that names an erased container is refused, not contested

**Files:**
- Modify:
  - `apps/server/src/purge/check-purged.ts:23-54` (`payloadIds`) and `:61` (its call)
  - `test-cases/19-trash.md`, `Features.md`
- Create: `apps/server/test/purge/door-sync.test.ts`

**Interfaces:**
- Consumes:
  - `createSyncService` (`apps/server/src/sync/sync-service.ts:126`);
  - `createIngestService`, `buildProjectionRegistry`, `purgeItem`;
  - Plan 2's worlds `buildTicketWorld`/`buildProjectWorld`/`dueAt`/`recordingStore`/`TYPE_ID` (`apps/server/test/purge/world.ts`);
  - `PURGE_RULE` (Task 1), `PURGED_REASON`.
- Produces: no new names. `checkPurged` now also refuses a `claim.contested` whose embedded original event names an erased entity or container.

**Why (D10).** `processOne` sends every ticket refusal to `contest()` (`sync-service.ts:416-417`). The contest is filed on the SAME entity as the refused claim (`contest-coherence.ts:193-205`). For a `ticket.created` under an erased parent, that entity is the NEW ticket. It is not in the registry, and `payloadIds` has no `claim.contested` arm (`check-purged.ts:50-51`, `default: break`). So the contest commits and the device is told `contested`. The fix reads one level into the contest's `originalEvent`, the same fields `payloadIds` already reads for the original types.

Cases (`## 19.31 The door, through sync`, 2 ids):

```markdown
## 19.31 The door, through sync

- ❌ **19.165 — through `POST /v1/sync`'s service, a `ticket.created` whose parent was purged is answered `refused` with `PURGED_REASON` and rule `purge.erased`, and no row of any kind is written for the new ticket (no `claim.contested`);** control: the same creation under the live sibling commits. Mutation: delete the `claim.contested` arm of `payloadIds` — the answer becomes `contested`.
- ❌ **19.166 — through sync, a `ticket.created` in a purged project and a `ticket.reparented` of a live ticket under a purged one are both refused with `PURGED_REASON`, and the live ticket's stream is unchanged;** control: a creation in the kept project commits. Mutation: read only the original event's ENTITY, not its payload — both answers become `contested`.
```

- [ ] **Step 1: Write the cases.** Confirm the count moved by exactly 2.

- [ ] **Step 2: Write the failing test** `apps/server/test/purge/door-sync.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { newUlid, PURGED_REASON, type SubmittedEvent } from '@gisik-nokma/domain';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { PURGE_RULE } from '../../src/purge/check-purged.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { createSyncService, type SyncService } from '../../src/sync/sync-service.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  buildProjectWorld,
  buildTicketWorld,
  dueAt,
  recordingStore,
  TYPE_ID,
  type ProjectWorld,
  type TicketWorld,
} from './world.js';

/**
 * Trash series Plan 3, Task 2 (deviation D10) — Plan 2's door, reached the way
 * an offline device reaches it: through the sync service, whose refused ticket
 * claims become server-appended contests on the claim's OWN entity. Wired as
 * `apps/server/test/dual-client/rig.ts` wires it: the gated door for the claim,
 * `ingestBatch` as the named internal append.
 */

let db: TestDatabase;
let sync: SyncService;
let w: TicketWorld;
let pw: ProjectWorld;

function claim(workspaceId: string, actorId: string, ticketId: string, type: string, payload: unknown): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type,
    version: 1,
    payload,
    actorId,
    origin: 'desktop',
    clientTime: '2026-09-29T10:00:00.000Z',
  };
}

async function typesOn(entityId: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ type: string }>(
    'SELECT type FROM events WHERE entity_id = $1 ORDER BY seq',
    [entityId],
  );
  return rows.map((row) => row.type);
}

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  const projections = buildProjectionRegistry();
  const ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections });
  sync = createSyncService({ pool: db.pool, ingest, serverAppend: (events) => ingest.ingestBatch(events) });
  w = await buildTicketWorld(db.pool);
  await purgeItem(db.pool, { kind: 'ticket', id: w.T }, {
    projections,
    store: recordingStore(),
    now: await dueAt(db.pool, 'ticket', w.T),
  });
  pw = await buildProjectWorld(db.pool);
  await purgeItem(db.pool, { kind: 'project', id: pw.P2 }, {
    projections,
    store: recordingStore(),
    now: await dueAt(db.pool, 'project', pw.P2),
  });
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('19.165 a creation under a purged parent is refused, not contested', () => {
  it('19.165 answers refused with PURGED_REASON and writes nothing for the new ticket; under the live sibling it commits', async () => {
    const child = newUlid();
    const [answer] = await sync.processBatch(w.OWNER, [
      claim(w.WS, w.OWNER, child, 'ticket.created', {
        typeId: TYPE_ID,
        projectId: w.P,
        parentId: w.T,
        title: 'Written offline',
      }),
    ]);
    expect(answer).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    expect(await typesOn(child)).toEqual([]);
    // CONTROL
    const [ok] = await sync.processBatch(w.OWNER, [
      claim(w.WS, w.OWNER, newUlid(), 'ticket.created', {
        typeId: TYPE_ID,
        projectId: w.P,
        parentId: w.S1,
        title: 'Under the survivor',
      }),
    ]);
    expect(ok?.status).toBe('committed');
  });
});

describe('19.166 a container named in the payload is enough', () => {
  it('19.166 refuses a creation in the purged project and a reparent under the purged ticket; a creation in the kept project commits', async () => {
    const orphan = newUlid();
    const [inProject] = await sync.processBatch(pw.OWNER, [
      claim(pw.WS, pw.OWNER, orphan, 'ticket.created', {
        typeId: TYPE_ID,
        projectId: pw.P2,
        parentId: null,
        title: 'Offline, in a purged project',
      }),
    ]);
    expect(inProject).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    expect(await typesOn(orphan)).toEqual([]);

    const before = await typesOn(w.S2);
    const [reparent] = await sync.processBatch(w.OWNER, [
      claim(w.WS, w.OWNER, w.S2, 'ticket.reparented', { newParentId: w.T }),
    ]);
    expect(reparent).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    expect(await typesOn(w.S2)).toEqual(before);
    // CONTROL
    const [kept] = await sync.processBatch(pw.OWNER, [
      claim(pw.WS, pw.OWNER, newUlid(), 'ticket.created', {
        typeId: TYPE_ID,
        projectId: pw.Q,
        parentId: null,
        title: 'In the kept project',
      }),
    ]);
    expect(kept?.status).toBe('committed');
  });
});
```

- [ ] **Step 3: Run it to see it fail.** `cd apps/server && pnpm exec vitest run --no-file-parallelism test/purge/door-sync.test.ts > /tmp/trash3-server.log 2>&1; tail -20 /tmp/trash3-server.log`.
  - Expected: FAIL on the first `toMatchObject` of each case, with `status: 'contested'`. That is the measured prediction (D10).
  - **If it is already `refused`, the brief's fear did not hold on this tree.** Record the GREEN-without-fix run in the commit body. Keep both cases as pins. Skip Step 4. Name that in your progress line.

- [ ] **Step 4: Implement.** Replace `payloadIds` (`check-purged.ts:23-54`) with:

```ts
function payloadIds(type: string, rawPayload: unknown, depth = 0): Array<[kind: string, id: string]> {
  const payload = (typeof rawPayload === 'object' && rawPayload !== null ? rawPayload : {}) as Record<
    string,
    unknown
  >;
  const named: Array<[string, string]> = [];
  const add = (kind: string, value: unknown): void => {
    if (typeof value === 'string' && value !== '') named.push([kind, value]);
  };
  switch (type) {
    case 'ticket.created':
      add('project', payload['projectId']);
      add('ticket', payload['parentId']);
      break;
    case 'ticket.reparented':
      add('ticket', payload['newParentId']);
      break;
    case 'note.created':
      add('project', payload['homeProjectId']);
      add('ticket', payload['attachTicketId']);
      break;
    case 'note.moved':
      add('project', payload['homeProjectId']);
      break;
    case 'note.attached':
      add('ticket', payload['ticketId']);
      break;
    case 'claim.contested': {
      // Trash Plan 3 (D10). A refused ticket claim comes back as a contest on
      // the claim's OWN entity (`sync/sync-service.ts`'s `contest()`), and for a
      // NEW ticket under an erased parent that entity is not in the registry —
      // so the contest must be judged by what its embedded claim names. One
      // level only: a contest never embeds a contest (`sync-service.ts` refuses
      // a client-submitted `claim.contested` before ingest).
      const original = payload['originalEvent'];
      if (depth === 0 && typeof original === 'object' && original !== null) {
        const embedded = original as { entity?: { kind?: unknown; id?: unknown }; type?: unknown; payload?: unknown };
        if (typeof embedded.entity?.kind === 'string') add(embedded.entity.kind, embedded.entity.id);
        if (typeof embedded.type === 'string') named.push(...payloadIds(embedded.type, embedded.payload, depth + 1));
      }
      break;
    }
    default:
      break;
  }
  return named;
}
```

and change the call inside `checkPurged` (`:61`) from `...payloadIds(env),` to `...payloadIds(env.type, env.payload),`.

- [ ] **Step 5: Run to see it pass** (same command). Then run Plan 2's door suite and the sync suites, and read each summary line: `test/purge/door.test.ts test/sync/sync-route.test.ts test/sync/contest-coherence-door.test.ts test/dual-client/scenarios.test.ts`. Every contest the old arm let through was about an entity that is not erased, so none of these should move. A red here is a finding, not a flake.

- [ ] **Step 6: Flip 19.165–19.166 to ✅, and append to `Features.md` §16:**

```markdown
- ⚙️ **The door after a purge, through sync** (`apps/server/src/purge/check-purged.ts`'s `payloadIds`; trash Plan 3 Task 2, deviation D10) — a `claim.contested` is judged by the claim it embeds: its entity and the containers its payload names (`ticket.created` parent/project, `ticket.reparented` new parent, the note arms). Before this, an offline `ticket.created` under an erased parent was refused at the client door and then COMMITTED as a contest on the new ticket's id, which is not in the registry — the device heard `contested` and the ledger gained a claim about an erased parent. Now the contest is refused too and `POST /v1/sync` answers `refused` with `PURGED_REASON`, rule `purge.erased`. Cases 19.165–19.166.
```

- [ ] **Step 7: Commit** `Trash 3/Task 2: a contest naming an erased container is refused (19.165-19.166)`. Then the mutations.

---
### Task 3: The replica erases — `eraseEntities`, the local erasure set, notices, the registry, and a rule for every local table

**Files:**
- Modify:
  - `packages/sync-client/src/storage/schema.ts`: `LOCAL_SCHEMA_VERSION` (`:17`); `TABLES` (`:27-166`, three tables appended before `meta`); `LOCAL_TABLE_RULES` after `TABLES`.
  - `packages/sync-client/src/replica/replica.ts`:
    - the domain import (`:1-22`);
    - `Replica` (`:211-324`);
    - new private helpers after `contestsFor` (`:1070-1075`);
    - new methods on the `replica` object after `revokeScope` (`:1444-1509`).
  - `packages/sync-client/src/outbox/outbox.ts`: `Outbox` (`:192-204`), the returned object (`:320-511`).
  - `packages/sync-client/src/index.ts` (`:10-35`).
  - `packages/sync-client/test/storage.test.ts:29-30,37-38`, `packages/sync-client/test/replica-notes.test.ts:159`: the pinned table list and version.
  - `test-cases/19-trash.md`, `Features.md`.
- Create: `packages/sync-client/src/outbox/notices.ts`, `packages/sync-client/test/purge-world.ts`, `packages/sync-client/test/purge-erase.test.ts`

**Interfaces:**
- Consumes: `PurgedRef` (Task 1); `collectDocReferences` (`doc-text.ts:149-173`); `parsePendingPulls`, `pendingPullsKey` (`replica.ts:876-906`).
- Produces:
  - `LOCAL_TABLE_RULES: Readonly<Record<string, { rule: 'erase' | 'registry'; why: string }>>`, `LOCAL_SCHEMA_VERSION = 3`
  - `type SyncNotice = { noticeId: string; workspaceId: string; kind: 'purged'; entityKind: string; entityId: string; eventType: string; recordedAt: string }`
  - `dropOutboxRowsAsNotices(tx: SyncStorage, rows: readonly SqlRow[], recordedAt: string): Promise<void>`
  - `listNotices(storage: SyncStorage, workspaceId: string): Promise<SyncNotice[]>`, `deleteNotice(storage: SyncStorage, noticeId: string): Promise<void>`
  - On `Replica`:
    - `eraseEntities(refs: readonly PurgedRef[]): Promise<{ erased: PurgedRef[] }>`
    - `purgedAmong(ids: readonly string[]): Promise<PurgedRef[]>`
    - `purgeLookupCandidates(workspaceId: string): Promise<string[]>`
    - `cacheDeletedItems(body: unknown, fetchedAt: string): Promise<void>`
    - `readDeletedItemsCache(): Promise<{ body: unknown; fetchedAt: string } | null>`
  - On `Outbox`: `notices(workspaceId: string): Promise<SyncNotice[]>`, `dismissNotice(noticeId: string): Promise<void>`

Cases (`## 19.32 The replica erases`, 7 ids):

```markdown
## 19.32 The replica erases

- ❌ **19.167 — `eraseEntities([{ticket T}])` removes T's events, row, snapshot and provenance, T's local child, and EVERY contest on T — the device's own stub included;** control: the sibling S keeps its row, its snapshot and its own stub. Mutation: delete contests with `purgeEntity`'s rule (`claimant_id <> me`) — the own stub survives.
- ❌ **19.168 — an erased ticket's queued claim leaves the outbox as a `sync_notices` row naming only its event id, target and type (never the payload), and is neither silently deleted nor left failed;** control: another ticket's queued claim stays queued. Mutation: delete the outbox rows without recording a notice.
- ❌ **19.169 — erasing a note removes its events, its row and its comments, and its queued claim becomes a notice;** control: a second note and its comment are untouched. Mutation: skip `note_comments`.
- ❌ **19.170 — erasing a project recomputes the local subtree: every ticket whose state names the project (children included) and every note homed in it;** control: the other project's ticket and note stay. Mutation: expand by `parent_id` only, skipping the project scan.
- ❌ **19.171 — erasing the workspace empties every workspace-scoped local table, the definitions, the cursor and BOTH pending-pull keys, and records the workspace;** control: the device identity (`me`) is kept. Mutation: forget `pending-note-pulls:<ws>` (the key `revokeScope` also leaves behind).
- ❌ **19.172 — every local table has an entry in `LOCAL_TABLE_RULES`, and every entry names a real table;** control: the rules minus `contests` leave exactly `contests` uncovered. Mutation: delete the `contests` entry.
- ❌ **19.173 — `purgedAmong` answers only recorded ids, and an erase strips the Deleted-items cache of the erased ticket and, for a workspace, of every item in it;** control: an unrecorded id is absent and an item of another workspace stays cached. Mutation: skip the cache strip.
```

- [ ] **Step 1: Write the cases.** Confirm the count moved by exactly 7.

- [ ] **Step 2: Write the shared world** `packages/sync-client/test/purge-world.ts`. Tasks 3–6 import it.

```ts
import {
  newSubmittedEvent,
  newUlid,
  plainTextToDoc,
  type EventEnvelope,
  type LedgerEvent,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';

/**
 * The trash series' Plan 3 world for the replica: one workspace, two projects,
 * one workflow and ticket type, and helpers that build envelopes the way the
 * server hands them over (`sync-engine.test.ts`'s `envelope`). Every case
 * builds a FRESH replica; the ids below are shared constants and never collide
 * across cases because no storage outlives its case.
 */
export const WS = newUlid();
export const P = newUlid();
export const P_OTHER = newUlid();
export const ME = newUlid();
export const OTHER = newUlid();
export const WF = newUlid();
export const TYPE = newUlid();
export const TIME = '2026-09-29T09:00:00.000Z';

let seq = 0;
let stream = 0;

export function envelope(
  entity: EventEnvelope['entity'],
  type: string,
  payload: unknown,
  opts: { actorId?: string; seq?: number } = {},
): LedgerEvent {
  seq += 1;
  stream += 1;
  return {
    ...newSubmittedEvent({
      workspaceId: WS,
      entity,
      type,
      payload,
      actorId: opts.actorId ?? OTHER,
      origin: 'server',
      now: () => new Date(TIME),
    }),
    serverTime: TIME,
    seq: opts.seq ?? seq,
    workspaceSeq: stream,
  };
}

export function bootstrap(): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: ME, workspaceRole: 'member', projectIds: [P, P_OTHER] },
    streamSeq: 1,
    definitions: [
      envelope(
        { kind: 'workflow', id: WF },
        'workflow.defined',
        {
          id: WF,
          version: 1,
          name: 'Basic',
          initialStateId: 'todo',
          states: [
            { id: 'todo', name: 'To do', category: 'open' },
            { id: 'done', name: 'Done', category: 'terminal' },
          ],
          transitions: [
            { from: '*', to: 'done', rules: [] },
            { from: '*', to: 'todo', rules: [] },
          ],
        },
        { seq: 1 },
      ),
      envelope(
        { kind: 'ticket-type', id: TYPE },
        'ticket-type.defined',
        { id: TYPE, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] },
        { seq: 1 },
      ),
    ],
    tickets: [],
  };
}

export const ticketCreated = (id: string, projectId: string = P, parentId: string | null = null): LedgerEvent =>
  envelope(
    { kind: 'ticket', id },
    'ticket.created',
    { typeId: TYPE, projectId, parentId, title: `Ticket ${id.slice(-4)}` },
    { seq: 1 },
  );

export const commentOnTicket = (ticketId: string, body: unknown): LedgerEvent =>
  envelope({ kind: 'ticket', id: ticketId }, 'comment.added', { body });

/** `homeProjectId: ''` is a workspace note; anything else is homed in that project. */
export const noteCreated = (noteId: string, homeProjectId: string): LedgerEvent =>
  envelope(
    { kind: 'note', id: noteId },
    'note.created',
    { title: 'Minutes', homeProjectId, scope: homeProjectId === '' ? { mode: 'workspace' } : { mode: 'project' } },
    { seq: 1 },
  );

export const commentOnNote = (noteId: string, text: string): LedgerEvent =>
  envelope({ kind: 'note', id: noteId }, 'comment.added', { body: plainTextToDoc(text) });

/** A server-recorded contest on `ticketId` whose refused claim is `claimantId`'s. */
export function contestOn(ticketId: string, claimantId: string): LedgerEvent {
  const original = newSubmittedEvent({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.transitioned',
    payload: { to: 'done' },
    actorId: claimantId,
    origin: 'desktop',
    now: () => new Date(TIME),
  });
  return envelope({ kind: 'ticket', id: ticketId }, 'claim.contested', {
    originalEvent: original,
    rule: 'workflow.transition-not-allowed',
    reason: 'Not from here.',
  });
}

export const ticketRefChip = (ticketId: string) => ({
  type: 'ticketRef',
  attrs: { ticketId, projectId: P, key: 'AB-1', title: 'The title its author saw' },
});

export const docWith = (...inline: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: inline }] });

export function claim(entity: SubmittedEvent['entity'], type: string, payload: unknown): SubmittedEvent {
  return newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: ME, origin: 'desktop' });
}

/** Queues a claim WITHOUT the local pre-check — these cases are about what leaves the outbox, not what enters it. */
export async function queue(storage: SyncStorage, event: SubmittedEvent): Promise<void> {
  await storage.run(
    'INSERT INTO outbox (event_id, workspace_id, entity_kind, entity_id, envelope) VALUES (?, ?, ?, ?, ?)',
    [event.id, event.workspaceId, event.entity.kind, event.entity.id, JSON.stringify(event)],
  );
}

export async function freshReplica(): Promise<{ storage: SyncStorage; replica: Replica }> {
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  await replica.loadBootstrap(bootstrap());
  return { storage, replica };
}

export async function apply(replica: Replica, events: readonly LedgerEvent[]): Promise<void> {
  for (const env of events) await replica.applyServerItem(env);
}

export async function count(storage: SyncStorage, sql: string, params: string[] = []): Promise<number> {
  const rows = await storage.all(sql, params);
  return Number(rows[0]?.['n'] ?? 0);
}
```

- [ ] **Step 3: Write the failing test** `packages/sync-client/test/purge-erase.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { LOCAL_TABLE_RULES, migrateLocal } from '../src/storage/schema.js';
import { createOutbox } from '../src/outbox/outbox.js';
import {
  ME,
  OTHER,
  P,
  P_OTHER,
  WS,
  apply,
  claim,
  commentOnNote,
  commentOnTicket,
  contestOn,
  count,
  docWith,
  freshReplica,
  noteCreated,
  queue,
  ticketCreated,
} from './purge-world.js';

/**
 * Trash series Plan 3, Task 3 (deviations D2, D3) — the device's half of spec
 * §5.7: "deletes every local row and local event for the erasure set (it
 * recomputes the set locally from its own tables)". Every case drives the real
 * replica over better-sqlite3.
 */

describe('19.167 a ticket erase takes the local subtree and every contest', () => {
  it("19.167 removes T, its child and every contest on T — the device's own stub included; the sibling keeps everything", async () => {
    const { storage, replica } = await freshReplica();
    const [T, C, S] = [newUlid(), newUlid(), newUlid()];
    await apply(replica, [
      ticketCreated(T),
      ticketCreated(C, P, T),
      ticketCreated(S),
      commentOnTicket(T, docWith({ type: 'text', text: 'about the lease' })),
      contestOn(T, ME),
      contestOn(T, OTHER),
      contestOn(S, ME),
    ]);
    for (const id of [T, S]) {
      await storage.run("INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ('ticket', ?, 1, '{}')", [id]);
      await storage.run(
        "INSERT INTO snapshot_provenance (entity_kind, entity_id, state_claim, assigned_claim) VALUES ('ticket', ?, '{}', NULL)",
        [id],
      );
    }

    const { erased } = await replica.eraseEntities([{ kind: 'ticket', id: T }]);

    expect(erased).toEqual(expect.arrayContaining([{ kind: 'ticket', id: T }, { kind: 'ticket', id: C }]));
    for (const id of [T, C]) {
      expect(await replica.getTicket(id)).toBeNull();
      expect(await count(storage, 'SELECT count(*) AS n FROM events WHERE entity_id = ?', [id])).toBe(0);
    }
    expect(await count(storage, 'SELECT count(*) AS n FROM snapshots WHERE entity_id = ?', [T])).toBe(0);
    expect(await count(storage, 'SELECT count(*) AS n FROM snapshot_provenance WHERE entity_id = ?', [T])).toBe(0);
    expect(await count(storage, 'SELECT count(*) AS n FROM contests WHERE ticket_id = ?', [T])).toBe(0);
    // CONTROL
    expect((await replica.getTicket(S))?.contests.map((c) => c.claimantId)).toEqual([ME]);
    expect(await count(storage, 'SELECT count(*) AS n FROM snapshots WHERE entity_id = ?', [S])).toBe(1);
    expect(await count(storage, 'SELECT count(*) AS n FROM snapshot_provenance WHERE entity_id = ?', [S])).toBe(1);
  });
});

describe('19.168 an erased ticket\'s queued claims become notices', () => {
  it('19.168 records a content-free notice, leaves no failed row, and keeps the other ticket\'s claim queued', async () => {
    const { storage, replica } = await freshReplica();
    const outbox = createOutbox({ storage, replica });
    const [T, S] = [newUlid(), newUlid()];
    await apply(replica, [ticketCreated(T), ticketCreated(S)]);
    const edit = claim({ kind: 'ticket', id: T }, 'ticket.field_set', { fieldId: 'title', value: 'SECRET offline title' });
    const keep = claim({ kind: 'ticket', id: S }, 'ticket.field_set', { fieldId: 'title', value: 'Kept' });
    await queue(storage, edit);
    await queue(storage, keep);

    await replica.eraseEntities([{ kind: 'ticket', id: T }]);

    expect(await outbox.notices(WS)).toEqual([
      {
        noticeId: edit.id,
        workspaceId: WS,
        kind: 'purged',
        entityKind: 'ticket',
        entityId: T,
        eventType: 'ticket.field_set',
        recordedAt: expect.any(String),
      },
    ]);
    expect(await outbox.failedItems(WS)).toEqual([]);
    expect(JSON.stringify(await storage.all('SELECT * FROM sync_notices'))).not.toContain('SECRET');
    // CONTROL
    expect(await outbox.queuedCount(WS)).toBe(1);
    const due = await outbox.nextBatch(10, () => new Date('2100-01-01T00:00:00.000Z'));
    expect(due.map((item) => item.eventId)).toEqual([keep.id]);
  });
});

describe('19.169 a note erase', () => {
  it('19.169 removes the note, its events and comments, and turns its claim into a notice; the other note is untouched', async () => {
    const { storage, replica } = await freshReplica();
    const outbox = createOutbox({ storage, replica });
    const [N, M] = [newUlid(), newUlid()];
    await apply(replica, [noteCreated(N, ''), commentOnNote(N, 'first'), noteCreated(M, ''), commentOnNote(M, 'second')]);
    await queue(storage, claim({ kind: 'note', id: N }, 'note.renamed', { title: 'Offline rename' }));

    await replica.eraseEntities([{ kind: 'note', id: N }]);

    expect(await replica.getNote(N)).toBeNull();
    expect(await replica.listNoteComments(N)).toEqual([]);
    expect(await count(storage, 'SELECT count(*) AS n FROM events WHERE entity_id = ?', [N])).toBe(0);
    expect((await outbox.notices(WS)).map((notice) => notice.entityId)).toEqual([N]);
    // CONTROL
    expect(await replica.getNote(M)).not.toBeNull();
    expect(await replica.listNoteComments(M)).toHaveLength(1);
  });
});

describe('19.170 a project erase recomputes the local subtree', () => {
  it("19.170 takes the project's tickets (children too) and homed notes; the other project's stay", async () => {
    const { replica } = await freshReplica();
    const [A, A1, Q1, NP, NQ] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
    await apply(replica, [
      ticketCreated(A, P),
      ticketCreated(A1, P, A),
      ticketCreated(Q1, P_OTHER),
      noteCreated(NP, P),
      noteCreated(NQ, P_OTHER),
    ]);

    const { erased } = await replica.eraseEntities([{ kind: 'project', id: P }]);

    expect(erased).toEqual(
      expect.arrayContaining([
        { kind: 'project', id: P },
        { kind: 'ticket', id: A },
        { kind: 'ticket', id: A1 },
        { kind: 'note', id: NP },
      ]),
    );
    expect(await replica.getTicket(A)).toBeNull();
    expect(await replica.getTicket(A1)).toBeNull();
    expect(await replica.getNote(NP)).toBeNull();
    // CONTROL
    expect(await replica.getTicket(Q1)).not.toBeNull();
    expect(await replica.getNote(NQ)).not.toBeNull();
  });
});

describe('19.171 a workspace erase', () => {
  it('19.171 empties every workspace-scoped table, the definitions, the cursor and both pending-pull keys; the device identity stays', async () => {
    const { storage, replica } = await freshReplica();
    const outbox = createOutbox({ storage, replica });
    const [T, N] = [newUlid(), newUlid()];
    await apply(replica, [ticketCreated(T), noteCreated(N, ''), commentOnNote(N, 'hello'), contestOn(T, ME)]);
    await storage.run("INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ('ticket', ?, 1, '{}')", [T]);
    await queue(storage, claim({ kind: 'ticket', id: T }, 'ticket.field_set', { fieldId: 'title', value: 'x' }));
    await replica.setCursor(WS, 9);
    await replica.addPendingPulls(WS, [{ id: newUlid(), headSeq: 3 }]);
    await replica.addPendingPulls(WS, [{ id: newUlid(), headSeq: 3 }], 'note');

    await replica.eraseEntities([{ kind: 'workspace', id: WS }]);

    for (const table of ['events', 'tickets', 'notes', 'note_comments', 'contests', 'outbox', 'workflows', 'ticket_types', 'snapshots']) {
      expect(await count(storage, `SELECT count(*) AS n FROM ${table}`), table).toBe(0);
    }
    expect(await replica.getCursor(WS)).toBe(0);
    expect(await replica.listPendingPulls(WS)).toEqual([]);
    expect(await replica.listPendingPulls(WS, 'note')).toEqual([]);
    expect((await outbox.notices(WS)).map((notice) => notice.entityId)).toEqual([T]);
    expect(await replica.purgedAmong([WS])).toEqual([{ kind: 'workspace', id: WS }]);
    // CONTROL
    expect((await replica.getMe())?.userId).toBe(ME);
  });
});

describe('19.172 every local table has an erase rule', () => {
  it('19.172 LOCAL_TABLE_RULES names exactly the tables migrateLocal creates', async () => {
    const storage = createBetterSqliteStorage();
    await migrateLocal(storage);
    const tables = (
      await storage.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    ).map((row) => row['name'] as string);
    expect(Object.keys(LOCAL_TABLE_RULES).sort()).toEqual(tables);
    // CONTROL: the check can name a gap
    const withoutContests = Object.keys(LOCAL_TABLE_RULES).filter((name) => name !== 'contests');
    expect(tables.filter((table) => !withoutContests.includes(table))).toEqual(['contests']);
  });
});

describe('19.173 the registry and the Deleted-items cache', () => {
  it('19.173 purgedAmong answers only what was recorded; an erase strips the cache by item and by workspace', async () => {
    const { replica } = await freshReplica();
    const [T, S, stranger, otherWs, otherItem] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
    await apply(replica, [ticketCreated(T), ticketCreated(S)]);
    await replica.cacheDeletedItems(
      {
        items: [
          { kind: 'ticket', id: T, workspaceId: WS },
          { kind: 'ticket', id: S, workspaceId: WS },
          { kind: 'project', id: otherItem, workspaceId: otherWs },
        ],
      },
      '2026-09-29T10:00:00.000Z',
    );

    await replica.eraseEntities([{ kind: 'ticket', id: T }]);

    expect(await replica.purgedAmong([T, S, stranger])).toEqual([{ kind: 'ticket', id: T }]);
    const afterTicket = await replica.readDeletedItemsCache();
    expect(afterTicket?.fetchedAt).toBe('2026-09-29T10:00:00.000Z');
    expect((afterTicket?.body as { items: Array<{ id: string }> }).items.map((item) => item.id)).toEqual([S, otherItem]);

    await replica.eraseEntities([{ kind: 'workspace', id: WS }]);
    const afterWorkspace = await replica.readDeletedItemsCache();
    // CONTROL: the other workspace's item is still cached
    expect((afterWorkspace?.body as { items: Array<{ id: string }> }).items.map((item) => item.id)).toEqual([otherItem]);
    expect(await replica.purgedAmong([stranger])).toEqual([]);
  });
});
```

- [ ] **Step 4: Run it to see it fail.** `cd packages/sync-client && pnpm exec vitest run --no-file-parallelism test/purge-erase.test.ts > /tmp/trash3-sync.log 2>&1; tail -20 /tmp/trash3-sync.log`. Expected: FAIL. `LOCAL_TABLE_RULES`, `eraseEntities`, `outbox.notices` and `cacheDeletedItems` do not exist.

- [ ] **Step 5: Implement the schema.** In `packages/sync-client/src/storage/schema.ts`:

Change `export const LOCAL_SCHEMA_VERSION = 2;` to `export const LOCAL_SCHEMA_VERSION = 3;`. Append to its docblock:

```ts
 * Raised to 3 by trash series Plan 3, which added `purged_ids`, `sync_notices`
 * and `deleted_items_cache` — three NEW tables, for the same reason the notes
 * tables were: `CREATE TABLE IF NOT EXISTS` is the only DDL this file runs.
```

Insert these three entries into `TABLES` directly before the `meta` entry (`:165`):

```ts
  /**
   * What a permanent purge erased (trash series Plan 3, D2) — kind and id,
   * content-free. Written by `replica.eraseEntities`, read by `purgedAmong`
   * (the chips' predicate) and to keep an id out of the next lookup. Never
   * erased itself: it is the record of an erasure.
   */
  `CREATE TABLE IF NOT EXISTS purged_ids (
     entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, recorded_at TEXT NOT NULL,
     PRIMARY KEY (entity_kind, entity_id)
   )`,
  /**
   * Claims this device REMOVED from its outbox and must tell the person about
   * (spec §5.7: "never silently"). CONTENT-FREE on purpose: the claim's
   * payload is content of an erased item, so only its event id (the notice's
   * key), its target and its type are kept.
   */
  `CREATE TABLE IF NOT EXISTS sync_notices (
     notice_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, kind TEXT NOT NULL,
     entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, event_type TEXT NOT NULL, recorded_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS sync_notices_workspace_idx ON sync_notices (workspace_id, recorded_at)`,
  /**
   * The last ONLINE answer of `GET /v1/me/deleted-items` (spec §6.3's last
   * line; D9) — the body as served, keyed `'me'` because the read is the
   * signed-in person's, not a workspace's. An erase strips its rows.
   */
  `CREATE TABLE IF NOT EXISTS deleted_items_cache (
     cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at TEXT NOT NULL
   )`,
```

Append after the `TABLES` array (before `migrateLocal`):

```ts
/**
 * Every local table's rule when a permanent purge reaches this device (trash
 * series Plan 3, D2) — the device's mirror of Plan 2's `PURGE_TABLE_RULES`.
 * Case 19.172 compares these keys against `sqlite_master`, so a table added
 * next month without a rule reddens rather than silently keeping erased data.
 */
export const LOCAL_TABLE_RULES: Readonly<Record<string, { rule: 'erase' | 'registry'; why: string }>> = {
  events: { rule: 'erase', why: "an erased entity's events by (entity_kind, entity_id); a workspace's by workspace_id" },
  snapshots: { rule: 'erase', why: "an erased ticket's baseline; a workspace erase deletes its tickets' rows" },
  snapshot_provenance: { rule: 'erase', why: 'the sibling of snapshots, by the same key' },
  tickets: { rule: 'erase', why: 'the erased ticket and its LOCAL subtree (parent_id), or every ticket naming an erased project' },
  notes: { rule: 'erase', why: 'the erased note, or every note homed in an erased project' },
  note_comments: { rule: 'erase', why: "an erased note's comments" },
  contests: {
    rule: 'erase',
    why: "EVERY contest on an erased ticket, the device's own included — unlike purgeEntity (lost access), a purge is an erasure and a stub embeds the claim whole",
  },
  outbox: { rule: 'erase', why: 'every queued claim about an erased entity — each one becomes a sync_notices row' },
  workflows: { rule: 'erase', why: 'a workspace erase only (the replica holds one workspace, as revokeScope assumes)' },
  ticket_types: { rule: 'erase', why: 'a workspace erase only, as workflows' },
  meta: { rule: 'erase', why: "a workspace erase deletes its cursor and both pending-pull keys; an entity erase strips it from the pending-pull lists" },
  deleted_items_cache: { rule: 'erase', why: 'the cached Deleted items body loses every row whose item or workspace was erased' },
  purged_ids: { rule: 'registry', why: 'the record of what was erased — content-free, never erased' },
  sync_notices: { rule: 'registry', why: 'the content-free record of removed claims; the person dismisses each one' },
};
```

In `packages/sync-client/test/storage.test.ts`, replace the pinned list's two lines (`:29-30`) with

```ts
      'contests', 'deleted_items_cache', 'events', 'meta', 'note_comments', 'notes', 'outbox', 'purged_ids',
      'snapshot_provenance', 'snapshots', 'sync_notices', 'ticket_types', 'tickets', 'workflows',
```

append to that list's comment: `// \`purged_ids\`, \`sync_notices\` and \`deleted_items_cache\` joined with trash Plan 3 (version 3), new tables for the same reason.` Change `:37-38` to `toBe(3)` and `toBe('3')`. In `packages/sync-client/test/replica-notes.test.ts:159`, change `toBe(2)` to `toBe(3)`.

- [ ] **Step 6: Implement the notices module** `packages/sync-client/src/outbox/notices.ts`:

```ts
import type { SqlRow, SyncStorage } from '../storage/storage.js';

/**
 * A claim this device REMOVED from its outbox (trash series Plan 3, D2/D6):
 * the item it was about was permanently erased, so it can never commit, and
 * spec §5.7 forbids dropping it silently. Content-free: `noticeId` is the
 * removed claim's event id; the payload — content of an erased item — is not
 * kept.
 */
export type SyncNotice = {
  noticeId: string;
  workspaceId: string;
  kind: 'purged';
  entityKind: string;
  entityId: string;
  eventType: string;
  recordedAt: string;
};

/** Each row becomes a notice, then leaves the outbox. `rows` are `SELECT * FROM outbox` rows. */
export async function dropOutboxRowsAsNotices(
  tx: SyncStorage,
  rows: readonly SqlRow[],
  recordedAt: string,
): Promise<void> {
  for (const row of rows) {
    const envelope = JSON.parse(row['envelope'] as string) as { type?: unknown };
    await tx.run(
      `INSERT INTO sync_notices (notice_id, workspace_id, kind, entity_kind, entity_id, event_type, recorded_at)
       VALUES (?, ?, 'purged', ?, ?, ?, ?)
       ON CONFLICT(notice_id) DO NOTHING`,
      [
        row['event_id'] as string,
        row['workspace_id'] as string,
        row['entity_kind'] as string,
        row['entity_id'] as string,
        typeof envelope.type === 'string' ? envelope.type : 'unknown',
        recordedAt,
      ],
    );
    await tx.run('DELETE FROM outbox WHERE event_id = ?', [row['event_id'] as string]);
  }
}

function rowToNotice(row: SqlRow): SyncNotice {
  return {
    noticeId: row['notice_id'] as string,
    workspaceId: row['workspace_id'] as string,
    kind: 'purged',
    entityKind: row['entity_kind'] as string,
    entityId: row['entity_id'] as string,
    eventType: row['event_type'] as string,
    recordedAt: row['recorded_at'] as string,
  };
}

export async function listNotices(storage: SyncStorage, workspaceId: string): Promise<SyncNotice[]> {
  const rows = await storage.all(
    'SELECT * FROM sync_notices WHERE workspace_id = ? ORDER BY recorded_at, notice_id',
    [workspaceId],
  );
  return rows.map(rowToNotice);
}

export async function deleteNotice(storage: SyncStorage, noticeId: string): Promise<void> {
  await storage.run('DELETE FROM sync_notices WHERE notice_id = ?', [noticeId]);
}
```

In `packages/sync-client/src/outbox/outbox.ts`:
- add `import { deleteNotice, listNotices, type SyncNotice } from './notices.js';`;
- add to the `Outbox` type, after `failedItems` (`:199`):

```ts
  /** Claims removed because their item was permanently erased (trash Plan 3), oldest first. */
  notices(workspaceId: string): Promise<SyncNotice[]>;
  /** The person has read it. */
  dismissNotice(noticeId: string): Promise<void>;
```

and to the returned object, after `failedItems` (`:483-489`):

```ts
    notices: (workspaceId) => listNotices(storage, workspaceId),

    dismissNotice: (noticeId) => deleteNotice(storage, noticeId),
```

- [ ] **Step 7: Implement the replica half.** In `packages/sync-client/src/replica/replica.ts`:

1. Add `collectDocReferences` and `type PurgedRef` to the `@gisik-nokma/domain` import (`:1-22`). Below the `sync-item.js` import (`:26`), add `import { dropOutboxRowsAsNotices } from '../outbox/notices.js';`.
2. Add to the `Replica` type, after `revokeScope` (`:264`):

```ts
  /**
   * PERMANENT ERASURE (trash series Plan 3, D2) — NOT `purgeEntity`. Deletes
   * everything this device holds of the named items and their LOCAL subtree
   * (a ticket's children by `parent_id`; a project's tickets and homed notes; a
   * workspace's every row), the device's own contest stubs included; turns
   * each queued claim about them into a `sync_notices` row; records every
   * erased id in `purged_ids`; strips them from the Deleted-items cache.
   * Answers what was recorded, subtree included.
   */
  eraseEntities(refs: readonly PurgedRef[]): Promise<{ erased: PurgedRef[] }>;
  /** Of `ids`, those `eraseEntities` recorded — the chips' predicate on a replica. */
  purgedAmong(ids: readonly string[]): Promise<PurgedRef[]>;
  /**
   * Every id this device could hold something of in `workspaceId`, for the
   * purged-id lookup (D5): the workspace, held tickets and notes, contest and
   * outbox targets (a `purgeEntity`d ticket's own stub and queued claims
   * survive it), and every chip id inside a held body. Ids already recorded
   * are left out.
   */
  purgeLookupCandidates(workspaceId: string): Promise<string[]>;
  /** The last online `GET /v1/me/deleted-items` body (D9), as served. */
  cacheDeletedItems(body: unknown, fetchedAt: string): Promise<void>;
  readDeletedItemsCache(): Promise<{ body: unknown; fetchedAt: string } | null>;
```

3. Add these private helpers inside `createReplica`, directly after `contestsFor` (`:1070-1075`):

```ts
  /**
   * The LOCAL erasure set (trash Plan 3, D3): the named items plus what this
   * device holds under them. The server's registry already lists every member
   * of its own set, so this is the belt for a lookup that named only the top.
   */
  async function localErasureSet(
    tx: SyncStorage,
    refs: readonly PurgedRef[],
  ): Promise<{ workspaces: Set<string>; projects: Set<string>; tickets: Set<string>; notes: Set<string> }> {
    const workspaces = new Set<string>();
    const projects = new Set<string>();
    const tickets = new Set<string>();
    const notes = new Set<string>();
    for (const ref of refs) {
      if (ref.kind === 'workspace') workspaces.add(ref.id);
      else if (ref.kind === 'project') projects.add(ref.id);
      else if (ref.kind === 'ticket') tickets.add(ref.id);
      else notes.add(ref.id);
    }
    if (projects.size > 0) {
      for (const row of await tx.all('SELECT ticket_id, state FROM tickets', [])) {
        const state = JSON.parse(row['state'] as string) as TicketState;
        if (projects.has(state.projectId)) tickets.add(row['ticket_id'] as string);
      }
      for (const row of await tx.all('SELECT note_id, home_project_id FROM notes', [])) {
        if (projects.has(row['home_project_id'] as string)) notes.add(row['note_id'] as string);
      }
    }
    let frontier = [...tickets];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const parentId of frontier) {
        for (const row of await tx.all('SELECT ticket_id FROM tickets WHERE parent_id = ?', [parentId])) {
          const childId = row['ticket_id'] as string;
          if (!tickets.has(childId)) {
            tickets.add(childId);
            next.push(childId);
          }
        }
      }
      frontier = next;
    }
    return { workspaces, projects, tickets, notes };
  }

  async function eraseTicketIn(tx: SyncStorage, ticketId: string, at: string): Promise<void> {
    await dropOutboxRowsAsNotices(
      tx,
      await tx.all("SELECT * FROM outbox WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]),
      at,
    );
    await tx.run("DELETE FROM events WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]);
    await tx.run('DELETE FROM tickets WHERE ticket_id = ?', [ticketId]);
    await tx.run("DELETE FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]);
    await tx.run("DELETE FROM snapshot_provenance WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]);
    // EVERY contest, the device's own stub included — the one line on which this
    // differs from `purgeEntity` (D2). A stub embeds the refused claim whole, and
    // a purge is an erasure, not a loss of access.
    await tx.run('DELETE FROM contests WHERE ticket_id = ?', [ticketId]);
  }

  async function eraseNoteIn(tx: SyncStorage, noteId: string, at: string): Promise<void> {
    await dropOutboxRowsAsNotices(
      tx,
      await tx.all("SELECT * FROM outbox WHERE entity_kind = 'note' AND entity_id = ?", [noteId]),
      at,
    );
    await tx.run("DELETE FROM events WHERE entity_kind = 'note' AND entity_id = ?", [noteId]);
    await tx.run('DELETE FROM notes WHERE note_id = ?', [noteId]);
    await tx.run('DELETE FROM note_comments WHERE note_id = ?', [noteId]);
  }

  /** Everything the workspace owns on this device; answers the ticket and note ids it held. */
  async function eraseWorkspaceIn(
    tx: SyncStorage,
    workspaceId: string,
    at: string,
  ): Promise<{ tickets: string[]; notes: string[] }> {
    await dropOutboxRowsAsNotices(tx, await tx.all('SELECT * FROM outbox WHERE workspace_id = ?', [workspaceId]), at);
    const tickets = (await tx.all('SELECT ticket_id FROM tickets WHERE workspace_id = ?', [workspaceId])).map(
      (row) => row['ticket_id'] as string,
    );
    const notes = (await tx.all('SELECT note_id FROM notes WHERE workspace_id = ?', [workspaceId])).map(
      (row) => row['note_id'] as string,
    );
    // `snapshots`/`snapshot_provenance` carry no workspace id: by ticket.
    for (const ticketId of tickets) {
      await tx.run("DELETE FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]);
      await tx.run("DELETE FROM snapshot_provenance WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]);
    }
    for (const table of ['events', 'tickets', 'notes', 'note_comments', 'contests']) {
      await tx.run(`DELETE FROM ${table} WHERE workspace_id = ?`, [workspaceId]);
    }
    // One workspace per replica — the assumption `revokeScope`'s whole-workspace
    // arm already makes for these two tables.
    await tx.run('DELETE FROM workflows', []);
    await tx.run('DELETE FROM ticket_types', []);
    // BOTH pending-pull keys (revokeScope forgets the note one).
    for (const key of [`cursor:${workspaceId}`, pendingPullsKey(workspaceId), pendingPullsKey(workspaceId, 'note')]) {
      await tx.run('DELETE FROM meta WHERE key = ?', [key]);
    }
    return { tickets, notes };
  }

  async function stripPendingPulls(tx: SyncStorage, ids: ReadonlySet<string>): Promise<void> {
    const rows = await tx.all(
      "SELECT key, value FROM meta WHERE key LIKE 'pending-pulls:%' OR key LIKE 'pending-note-pulls:%'",
      [],
    );
    for (const row of rows) {
      const held = parsePendingPulls(row['value']).filter((entry) => !ids.has(entry.id));
      await tx.run('UPDATE meta SET value = ? WHERE key = ?', [JSON.stringify(held), row['key'] as string]);
    }
  }

  async function stripDeletedItemsCache(
    tx: SyncStorage,
    ids: ReadonlySet<string>,
    workspaces: ReadonlySet<string>,
  ): Promise<void> {
    for (const row of await tx.all('SELECT cache_key, payload FROM deleted_items_cache', [])) {
      const body = JSON.parse(row['payload'] as string) as { items?: unknown };
      if (!Array.isArray(body.items)) continue;
      const kept = body.items.filter((item: unknown) => {
        const entry = (typeof item === 'object' && item !== null ? item : {}) as { id?: unknown; workspaceId?: unknown };
        if (typeof entry.id === 'string' && ids.has(entry.id)) return false;
        return !(typeof entry.workspaceId === 'string' && workspaces.has(entry.workspaceId));
      });
      await tx.run('UPDATE deleted_items_cache SET payload = ? WHERE cache_key = ?', [
        JSON.stringify({ ...body, items: kept }),
        row['cache_key'] as string,
      ]);
    }
  }
```

4. Add these methods to the `replica` object, directly after `revokeScope` (`:1444-1509`):

```ts
    async eraseEntities(refs) {
      if (refs.length === 0) return { erased: [] };
      const at = new Date().toISOString();
      const erased = await storage.transaction(async (tx) => {
        const set = await localErasureSet(tx, refs);
        const recorded: PurgedRef[] = [];
        for (const workspaceId of set.workspaces) {
          const held = await eraseWorkspaceIn(tx, workspaceId, at);
          recorded.push({ kind: 'workspace', id: workspaceId });
          for (const id of held.tickets) set.tickets.add(id);
          for (const id of held.notes) set.notes.add(id);
        }
        for (const id of set.projects) recorded.push({ kind: 'project', id });
        for (const id of set.tickets) {
          await eraseTicketIn(tx, id, at);
          recorded.push({ kind: 'ticket', id });
        }
        for (const id of set.notes) {
          await eraseNoteIn(tx, id, at);
          recorded.push({ kind: 'note', id });
        }
        for (const ref of recorded) {
          await tx.run(
            `INSERT INTO purged_ids (entity_kind, entity_id, recorded_at) VALUES (?, ?, ?)
             ON CONFLICT(entity_kind, entity_id) DO NOTHING`,
            [ref.kind, ref.id, at],
          );
        }
        const ids = new Set(recorded.map((ref) => ref.id));
        await stripPendingPulls(tx, ids);
        await stripDeletedItemsCache(tx, ids, set.workspaces);
        return recorded;
      });
      notify();
      return { erased };
    },

    async purgedAmong(ids) {
      if (ids.length === 0) return [];
      const rows = await storage.all(
        `SELECT entity_kind, entity_id FROM purged_ids
          WHERE entity_id IN (SELECT value FROM json_each(?))
          ORDER BY entity_kind, entity_id`,
        [JSON.stringify(ids)],
      );
      return rows.map((row) => ({ kind: row['entity_kind'] as PurgedRef['kind'], id: row['entity_id'] as string }));
    },

    async purgeLookupCandidates(workspaceId) {
      const ids = new Set<string>([workspaceId]);
      const take = (rows: SqlRow[], column: string): void => {
        for (const row of rows) {
          const value = row[column];
          if (typeof value === 'string' && value !== '') ids.add(value);
        }
      };
      take(await storage.all('SELECT ticket_id FROM tickets WHERE workspace_id = ?', [workspaceId]), 'ticket_id');
      take(await storage.all('SELECT note_id FROM notes WHERE workspace_id = ?', [workspaceId]), 'note_id');
      take(await storage.all('SELECT ticket_id FROM contests WHERE workspace_id = ?', [workspaceId]), 'ticket_id');
      take(
        await storage.all(
          "SELECT entity_id FROM outbox WHERE workspace_id = ? AND entity_kind IN ('ticket', 'note')",
          [workspaceId],
        ),
        'entity_id',
      );
      const bodies: unknown[] = [];
      for (const row of await storage.all('SELECT body FROM notes WHERE workspace_id = ?', [workspaceId])) {
        bodies.push(JSON.parse(row['body'] as string));
      }
      for (const row of await storage.all('SELECT body FROM note_comments WHERE workspace_id = ?', [workspaceId])) {
        bodies.push(JSON.parse(row['body'] as string));
      }
      for (const row of await storage.all(
        "SELECT payload FROM events WHERE workspace_id = ? AND type IN ('comment.added', 'ticket.field_set')",
        [workspaceId],
      )) {
        const payload = JSON.parse(row['payload'] as string) as { body?: unknown; value?: unknown };
        bodies.push(payload.body ?? payload.value);
      }
      for (const body of bodies) {
        const refs = collectDocReferences(body);
        for (const id of [...refs.ticketIds, ...refs.noteIds]) ids.add(id);
      }
      const known = new Set(
        (await storage.all('SELECT entity_id FROM purged_ids', [])).map((row) => row['entity_id'] as string),
      );
      return [...ids].filter((id) => !known.has(id)).sort();
    },

    async cacheDeletedItems(body, fetchedAt) {
      await storage.run(
        `INSERT INTO deleted_items_cache (cache_key, payload, fetched_at) VALUES ('me', ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
        [JSON.stringify(body), fetchedAt],
      );
    },

    async readDeletedItemsCache() {
      const rows = await storage.all("SELECT payload, fetched_at FROM deleted_items_cache WHERE cache_key = 'me'", []);
      const row = rows[0];
      return row === undefined
        ? null
        : { body: JSON.parse(row['payload'] as string) as unknown, fetchedAt: row['fetched_at'] as string };
    },
```

5. In `packages/sync-client/src/index.ts`, change `export { LOCAL_SCHEMA_VERSION, migrateLocal } from './storage/schema.js';` to `export { LOCAL_SCHEMA_VERSION, LOCAL_TABLE_RULES, migrateLocal } from './storage/schema.js';`. Add `export type { SyncNotice } from './outbox/notices.js';` after the outbox exports (`:34-35`).

- [ ] **Step 8: Run to see it pass.** Then run the whole package: `cd packages/sync-client && pnpm exec vitest run --no-file-parallelism > /tmp/trash3-sync.log 2>&1; tail -20 /tmp/trash3-sync.log`. `storage.test.ts` and `replica-notes.test.ts` must be green on the new pins. `barrel.test.ts`'s reachable-file list (`:100-132`, an exact sorted `toEqual`) must gain `outbox/notices.ts`. Add `'outbox/notices.ts',` directly above `'outbox/outbox.ts',` (`:121`).

- [ ] **Step 9: Flip 19.167–19.173 to ✅, and append to `Features.md` §16:**

```markdown
- ⚙️ **The replica erases what a purge erased** (`packages/sync-client/src/replica/replica.ts`'s `eraseEntities`, `purgedAmong`, `purgeLookupCandidates`; `outbox/notices.ts`; `storage/schema.ts`'s `LOCAL_TABLE_RULES`; trash Plan 3 Task 3, deviation D2) — distinct from `purgeEntity` ("lost access"): it recomputes the local subtree (a ticket's children, a project's tickets and homed notes, a workspace's everything), deletes every local event, row, snapshot and contest of it — the device's OWN contest stubs included — turns each queued claim about it into a content-free `sync_notices` row (event id, target, type; never the payload), records every erased id in `purged_ids`, strips them from the Deleted-items cache and from the pending-pull lists, and for a workspace also the definitions, the cursor and both pending-pull keys. Local schema version 3 (`purged_ids`, `sync_notices`, `deleted_items_cache` — new tables, the file's only DDL). Case 19.172 fails any local table without a rule. Cases 19.167–19.173.
```

- [ ] **Step 10: Commit** `Trash 3/Task 3: the replica erases a purge's subtree (19.167-19.173)`. Then the mutations.

---

### Task 4: Client folds tolerate a redacted creation (Plan 2's D7)

**Files:**
- Modify:
  - `packages/sync-client/src/replica/replica.ts:921` (`refoldTicket`) and its domain import (`:1-22`)
  - `packages/sync-client/src/precheck/local-context.ts:1-10,151`
  - `test-cases/19-trash.md`, `Features.md`
- Create: `packages/sync-client/test/purge-folds.test.ts`

**Interfaces:**
- Consumes: `foldTicketEvent(state, env, deps): TicketState | undefined` (`packages/domain/src/ticket-state.ts:483-490`); `buildPendingOverlay` (`local-context.ts:113-158`); the Task 3 world.
- Produces: no new names.

Cases (`## 19.33 Client folds`, 2 ids):

```markdown
## 19.33 Client folds

- ❌ **19.174 — the replica applies a redacted `ticket.created` (`{ projectId, purged: true }`) without throwing and folds no ticket from it;** control: an ordinary creation beside it folds. Mutation: fold with `applyTicketEvent` again — its named throw rejects the apply.
- ❌ **19.175 — `buildPendingOverlay` over a queued redacted creation produces no state and does not mark the ticket unfoldable;** control: an ordinary queued creation folds into `states`. Mutation: fold with `applyTicketEvent` — the ticket lands in `unfoldable`.
```

- [ ] **Step 1: Write the cases.** Confirm the count moved by exactly 2.

- [ ] **Step 2: Write the failing test** `packages/sync-client/test/purge-folds.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildPendingOverlay } from '../src/precheck/local-context.js';
import { P, TYPE, claim, envelope, freshReplica, queue, ticketCreated } from './purge-world.js';

/**
 * Trash series Plan 3, Task 4 (deviation D8; Plan 2's D7). The server never
 * delivers a redacted `ticket.created` (a purged ticket is invisible), so these
 * are guards: without them `applyTicketEvent`'s NAMED throw would stall the
 * engine, or poison the pending overlay, on the first one that did arrive.
 */

describe('19.174 the replica folds no ticket from a redacted creation', () => {
  it('19.174 applies it without throwing and holds no ticket; an ordinary creation folds', async () => {
    const { replica } = await freshReplica();
    const R = newUlid();
    const redacted = envelope({ kind: 'ticket', id: R }, 'ticket.created', { projectId: P, purged: true }, { seq: 1 });
    await expect(replica.applyServerItem(redacted)).resolves.toEqual({ applied: true });
    expect(await replica.getTicket(R)).toBeNull();
    // CONTROL
    const L = newUlid();
    await replica.applyServerItem(ticketCreated(L));
    expect((await replica.getTicket(L))?.confirmed?.id).toBe(L);
  });
});

describe('19.175 the pending overlay skips a redacted creation', () => {
  it('19.175 produces no state and no unfoldable mark; an ordinary queued creation folds', async () => {
    const { storage, replica } = await freshReplica();
    const R = newUlid();
    await queue(storage, claim({ kind: 'ticket', id: R }, 'ticket.created', { projectId: P, purged: true }));
    const L = newUlid();
    await queue(
      storage,
      claim({ kind: 'ticket', id: L }, 'ticket.created', { typeId: TYPE, projectId: P, parentId: null, title: 'Queued' }),
    );

    const overlay = await buildPendingOverlay({ storage, replica });

    expect(overlay.unfoldable.has(R)).toBe(false);
    expect(overlay.states.has(R)).toBe(false);
    expect(overlay.queuedEventIds.get(R)).toHaveLength(1);
    // CONTROL
    expect(overlay.states.get(L)?.id).toBe(L);
  });
});
```

- [ ] **Step 3: Run it to see it fail.** `cd packages/sync-client && pnpm exec vitest run --no-file-parallelism test/purge-folds.test.ts > /tmp/trash3-sync.log 2>&1; tail -20 /tmp/trash3-sync.log`. Expected: FAIL.
  - 19.174: the apply rejects with `applyTicketEvent: ticket.created for ticket … is a purged (redacted) row`.
  - 19.175: `R` is in `unfoldable`.

- [ ] **Step 4: Implement.**
  - In `replica.ts`, replace `applyTicketEvent,` in the domain import (`:3`) with `foldTicketEvent,`. Line 921 is its only use (`grep -n applyTicketEvent` at `265d029f`), and an unused import fails the typecheck. Replace line 921 with:

    ```ts
          if (FOLDING_TICKET_TYPES.includes(env.type)) state = foldTicketEvent(state, env, localDeps);
    ```

  - In `local-context.ts`, add `foldTicketEvent,` to the import (`:1-10`; `applyTicketEvent` is then unused, so remove it). Replace line 151 with:

    ```ts
          const next = foldTicketEvent(states.get(ticketId), env, localDeps);
          // A purged ticket's redacted creation folds to nothing (trash Plan 2 D7):
          // no state, and — unlike a throw — not "unfoldable" either.
          if (next !== undefined) states.set(ticketId, next);
    ```

- [ ] **Step 5: Run to see it pass**, then the whole `sync-client` suite (same command, no file argument).

- [ ] **Step 6: Flip 19.174–19.175 to ✅, and append to `Features.md` §16:**

```markdown
- ⚙️ **Client folds tolerate a redacted creation** (`packages/sync-client/src/replica/replica.ts`'s `refoldTicket`, `precheck/local-context.ts`'s `buildPendingOverlay`; trash Plan 3 Task 4, Plan 2's D7) — both fold with the domain's `foldTicketEvent`, so a purged ticket's `{ projectId, purged: true }` creation produces no ticket rather than `applyTicketEvent`'s named throw stalling the engine or marking the overlay unfoldable. The server never sends one (a purged ticket is invisible); this is the guard for the day something does. Cases 19.174–19.175.
```

- [ ] **Step 7: Commit** `Trash 3/Task 4: client folds use foldTicketEvent (19.174-19.175)`. Then the mutations.

---
### Task 5: When a device learns — the transport, `learnPurges`, and its four triggers

**Files:**
- Modify:
  - `packages/sync-client/src/engine/sync-engine.ts`:
    - the domain import (`:1`);
    - `SyncTransport` (`:49-114`);
    - a new `WorkspaceAccessLost` after `NotePullNotFound` (`:154-161`);
    - `SyncEngine` (`:192-297`);
    - state (`:446-482`);
    - `applyOne` (`:792-843`);
    - `subscribe`'s `onCaughtUp` (`:852-893`) and `onError` (`:894-900`);
    - `start` (`:969-986`);
    - the `engine` object (`:968-1169`).
  - `packages/sync-client/src/replica/replica.ts:1352-1356` (`applyServerItem`: the `purge.completed` branch)
  - `packages/sync-client/src/net/http-transport.ts:1-10,188-228`
  - `packages/sync-client/src/index.ts:36-46`
  - The seven transport implementers (D12):
    - `packages/sync-client/test/sync-engine.test.ts:232-295`
    - `packages/sync-client/test/sync-engine-notes.test.ts:130-154`
    - `packages/app-core/test/replica/replica-data-source.test.ts:145-152` and `:657-667`
    - `packages/app-core/test/replica/replica-data-source-notes.test.ts:136-145`
    - `packages/app-core/test/replica/replica-deleted-reads.test.ts:59-66`
    - `apps/server/test/dual-client/rig.ts:405-509`
  - `test-cases/19-trash.md`, `Features.md`
- Create: `packages/sync-client/test/purge-sync.test.ts`

**Interfaces:**
- Consumes:
  - `PURGED_LOOKUP_MAX_IDS`, `PurgedRef`, `isPurgedRef` (Task 1);
  - `replica.purgeLookupCandidates`, `replica.eraseEntities` (Task 3);
  - the route `POST /v1/purged-lookup` (Task 1);
  - `purgedRefsAmong` and `readDeletedItems` (server, for the rig).
- Produces:
  - `SyncTransport.purgedLookup(ids: string[]): Promise<PurgedRef[]>`, `SyncTransport.deletedItems(): Promise<unknown>`
  - `class WorkspaceAccessLost extends Error { readonly workspaceId: string }`
  - `SyncEngine.learnPurges(workspaceId: string, extraIds?: readonly string[]): Promise<{ erased: string[] }>`
  - `SyncEngine.lastPurgeLookupError(): string | null`
  - `SyncEngine.fetchDeletedItems(): Promise<unknown>` (Task 9 consumes it)

Cases (`## 19.34 When a device learns`, 7 ids):

```markdown
## 19.34 When a device learns

- ❌ **19.176 — at `caught-up`, after the reconcile pass, the engine sends the ids it holds to the lookup and erases what comes back;** control: a held ticket the lookup does not name stays. Mutation: remove the `learnPurges` call from `onCaughtUp`.
- ❌ **19.177 — the lookup asks about more than the held rows: an id reconcile just evicted (whose own contest stub `purgeEntity` kept) and a chip id inside a held comment;** control: the untouched held ticket is still held. Mutation: build the candidates from `listTickets` alone — the chip id is never asked and never recorded.
- ❌ **19.178 — a device holding 1,102 ids asks in chunks of at most 500; one chunk failing is recorded in `lastPurgeLookupError` and the next chunk's answer is still erased;** control: an id answered only by the failing chunk is not erased. Mutation: stop at the first failing chunk.
- ❌ **19.179 — a `not-a-member` stream error whose lookup names the workspace erases the workspace and ENDS the stream: status `offline`, no resubscribe;** control: the recorded workspace answers `purgedAmong`. Mutation: erase without setting `streamEnded` — the engine reconnects.
- ❌ **19.180 — a `not-a-member` whose lookup names nothing erases nothing (a revoke is `revokeScope`'s), and a bootstrap 403 asks the lookup and rethrows `WorkspaceAccessLost`;** control: the same 403 when the lookup names the workspace resolves `start()` with the workspace recorded and no subscribe. Mutation: erase the workspace on any `not-a-member` without asking.
- ❌ **19.181 — a `purge.completed` envelope for a project is never stored and makes the device erase that project's local subtree;** control: the other project's ticket stays. Mutation: drop the replica's `purge.completed` branch — the tombstone lands in `events`.
- ❌ **19.182 — the HTTP transport POSTs `{ ids }` to `/v1/purged-lookup` with the bearer token and keeps only well-formed lifecycle refs, GETs `/v1/me/deleted-items`, and answers a bootstrap 403 with `WorkspaceAccessLost` (message `bootstrap failed: 403`);** control: a bootstrap 500 is a plain `Error`, and a lookup 502 throws `purged-lookup failed: 502`. Mutation: throw a plain `Error` on 403.
```

- [ ] **Step 1: Write the cases.** Confirm the count moved by exactly 7.

- [ ] **Step 2: Write the failing test** `packages/sync-client/test/purge-sync.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { newUlid, type PurgedRef } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';
import { createOutbox } from '../src/outbox/outbox.js';
import {
  createSyncEngine,
  WorkspaceAccessLost,
  type StreamHandlers,
  type SyncEngine,
  type SyncTransport,
} from '../src/engine/sync-engine.js';
import { createHttpTransport } from '../src/net/http-transport.js';
import {
  ME,
  OTHER,
  P,
  P_OTHER,
  TIME,
  WS,
  apply,
  bootstrap,
  commentOnTicket,
  contestOn,
  count,
  docWith,
  envelope,
  freshReplica,
  ticketCreated,
  ticketRefChip,
} from './purge-world.js';

/**
 * Trash series Plan 3, Task 5 (deviations D3–D5, D12): how a device learns of
 * a purge the stream cannot deliver. Every case runs the real engine over the
 * real replica; only the transport is scripted.
 */

type Calls = { lookups: string[][]; subscribes: number; handlers: StreamHandlers | null };

function transportFor(
  opts: {
    lookup?: (ids: string[]) => Promise<PurgedRef[]>;
    bootstrap?: () => Promise<BootstrapResponse>;
    reconcile?: SyncTransport['reconcile'];
  } = {},
): { transport: SyncTransport; calls: Calls } {
  const calls: Calls = { lookups: [], subscribes: 0, handlers: null };
  const transport: SyncTransport = {
    bootstrap: opts.bootstrap ?? (async () => bootstrap()),
    async sync() {
      return [];
    },
    openStream(_ws, _afterSeq, handlers) {
      calls.subscribes += 1;
      calls.handlers = handlers;
      return { close: () => handlers.onClose() };
    },
    reconcile: opts.reconcile ?? (async (workspaceId) => ({ workspaceId, restricted: [], restrictedNotes: [] })),
    async bootstrapTicket(_ws, ticketId) {
      throw new Error(`no pull in this fixture: ${ticketId}`);
    },
    async bootstrapNote(_ws, noteId) {
      throw new Error(`no pull in this fixture: ${noteId}`);
    },
    async purgedLookup(ids) {
      calls.lookups.push(ids);
      return (opts.lookup ?? (async () => []))(ids);
    },
    async deletedItems() {
      return { items: [] };
    },
  };
  return { transport, calls };
}

function engineOver(storage: SyncStorage, replica: Replica, transport: SyncTransport): SyncEngine {
  return createSyncEngine({ replica, outbox: createOutbox({ storage, replica }), transport, reconnectDelayMs: 5 });
}

const ticketRef = (id: string): PurgedRef => ({ kind: 'ticket', id });

describe('19.176 the reconcile pass asks', () => {
  it('19.176 erases what the lookup names at caught-up; the unnamed ticket stays', async () => {
    const { storage, replica } = await freshReplica();
    const [T1, T2] = [newUlid(), newUlid()];
    await apply(replica, [ticketCreated(T1), ticketCreated(T2)]);
    const { transport, calls } = transportFor({ lookup: async (ids) => ids.filter((id) => id === T1).map(ticketRef) });
    const engine = engineOver(storage, replica, transport);
    await engine.start(WS);

    calls.handlers!.onCaughtUp(5);

    await vi.waitFor(async () => expect(await replica.getTicket(T1)).toBeNull());
    expect(calls.lookups.flat()).toEqual(expect.arrayContaining([WS, T1, T2]));
    expect(await replica.purgedAmong([T1, T2])).toEqual([ticketRef(T1)]);
    // CONTROL
    expect(await replica.getTicket(T2)).not.toBeNull();
    engine.stop();
  });
});

describe('19.177 the candidates reach past the held rows', () => {
  it("19.177 asks about reconcile's evicted id and a chip id in a held comment, and erases both", async () => {
    const { storage, replica } = await freshReplica();
    const [T3, T2, X] = [newUlid(), newUlid(), newUlid()];
    await apply(replica, [
      ticketCreated(T3),
      contestOn(T3, ME),
      ticketCreated(T2),
      commentOnTicket(T2, docWith({ type: 'text', text: 'see ' }, ticketRefChip(X))),
    ]);
    const { transport, calls } = transportFor({
      reconcile: async (workspaceId, heldIds) => ({
        workspaceId,
        restricted: heldIds.includes(T3) ? [{ kind: 'restricted', id: T3 }] : [],
        restrictedNotes: [],
      }),
      lookup: async (ids) => ids.filter((id) => id === T3 || id === X).map(ticketRef),
    });
    const engine = engineOver(storage, replica, transport);
    await engine.start(WS);

    calls.handlers!.onCaughtUp(5);

    await vi.waitFor(async () => expect(await replica.purgedAmong([X])).toEqual([ticketRef(X)]));
    expect(calls.lookups.flat()).toEqual(expect.arrayContaining([T3, X]));
    expect(await count(storage, 'SELECT count(*) AS n FROM contests WHERE ticket_id = ?', [T3])).toBe(0);
    // CONTROL
    expect(await replica.getTicket(T2)).not.toBeNull();
    engine.stop();
  });
});

describe('19.178 chunks of 500, one failing', () => {
  it('19.178 asks in chunks of at most 500; a failed chunk is recorded and the next chunk still erases', async () => {
    const { storage, replica } = await freshReplica();
    const T = newUlid();
    const chips = Array.from({ length: 1100 }, () => newUlid());
    await apply(replica, [ticketCreated(T), commentOnTicket(T, docWith(...chips.map(ticketRefChip)))]);
    const sortedChips = [...chips].sort();
    const inLastChunk = sortedChips[sortedChips.length - 1]!;
    const inFailingChunk = sortedChips[600]!;
    let call = 0;
    const { transport, calls } = transportFor({
      lookup: async (ids) => {
        call += 1;
        if (call === 2) throw new Error('purged-lookup failed: 503');
        return ids.filter((id) => id === inLastChunk || id === inFailingChunk).map(ticketRef);
      },
    });
    const engine = engineOver(storage, replica, transport);

    await engine.learnPurges(WS);

    expect(calls.lookups.map((chunk) => chunk.length)).toEqual([500, 500, 102]);
    expect(calls.lookups[1]).toContain(inFailingChunk);
    expect(engine.lastPurgeLookupError()).toBe('purged-lookup failed: 503');
    expect(await replica.purgedAmong([inLastChunk])).toEqual([ticketRef(inLastChunk)]);
    // CONTROL
    expect(await replica.purgedAmong([inFailingChunk])).toEqual([]);
  });
});

describe('19.179 a purged workspace ends the stream', () => {
  it('19.179 erases the workspace on not-a-member when the lookup names it, and does not reconnect', async () => {
    const { storage, replica } = await freshReplica();
    const T = newUlid();
    await apply(replica, [ticketCreated(T)]);
    const { transport, calls } = transportFor({
      lookup: async (ids) => (ids.includes(WS) ? [{ kind: 'workspace', id: WS }] : []),
    });
    const engine = engineOver(storage, replica, transport);
    await engine.start(WS);
    expect(calls.subscribes).toBe(1);

    calls.handlers!.onError({ code: 'not-a-member', message: 'not a member of this workspace' });

    await vi.waitFor(async () => expect(await replica.listTickets(WS)).toEqual([]));
    expect(engine.status()).toBe('offline');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(calls.subscribes).toBe(1);
    // CONTROL
    expect(await replica.purgedAmong([WS])).toEqual([{ kind: 'workspace', id: WS }]);
    engine.stop();
  });
});

describe('19.180 a revoke is not a purge', () => {
  it('19.180 erases nothing when the lookup names nothing; a bootstrap 403 asks and rethrows', async () => {
    const held = await freshReplica();
    const T = newUlid();
    await apply(held.replica, [ticketCreated(T)]);
    const revoked = transportFor({ lookup: async () => [] });
    const engine = engineOver(held.storage, held.replica, revoked.transport);
    await engine.start(WS);
    revoked.calls.handlers!.onError({ code: 'not-a-member', message: 'not a member of this workspace' });
    await vi.waitFor(() => expect(revoked.calls.lookups).toHaveLength(1));
    expect(await held.replica.getTicket(T)).not.toBeNull();
    expect(await held.replica.purgedAmong([WS, T])).toEqual([]);
    engine.stop();

    const coldStorage = createBetterSqliteStorage();
    const coldReplica = await createReplica({ storage: coldStorage });
    const refused = transportFor({
      bootstrap: async () => {
        throw new WorkspaceAccessLost(WS, 'bootstrap failed: 403');
      },
      lookup: async () => [],
    });
    await expect(engineOver(coldStorage, coldReplica, refused.transport).start(WS)).rejects.toBeInstanceOf(
      WorkspaceAccessLost,
    );
    expect(refused.calls.lookups).toEqual([[WS]]);

    // CONTROL: the same 403 on a purged workspace resolves, recorded, without a subscribe
    const goneStorage = createBetterSqliteStorage();
    const goneReplica = await createReplica({ storage: goneStorage });
    const gone = transportFor({
      bootstrap: async () => {
        throw new WorkspaceAccessLost(WS, 'bootstrap failed: 403');
      },
      lookup: async (ids) => (ids.includes(WS) ? [{ kind: 'workspace', id: WS }] : []),
    });
    await expect(engineOver(goneStorage, goneReplica, gone.transport).start(WS)).resolves.toBeUndefined();
    expect(await goneReplica.purgedAmong([WS])).toEqual([{ kind: 'workspace', id: WS }]);
    expect(gone.calls.subscribes).toBe(0);
  });
});

describe('19.181 a tombstone that does arrive', () => {
  it("19.181 is never stored and erases the project's local subtree", async () => {
    const { storage, replica } = await freshReplica();
    const [A, A1, Q1] = [newUlid(), newUlid(), newUlid()];
    await apply(replica, [ticketCreated(A, P), ticketCreated(A1, P, A), ticketCreated(Q1, P_OTHER)]);
    const { transport, calls } = transportFor({
      lookup: async (ids) => (ids.includes(P) ? [{ kind: 'project', id: P }] : []),
    });
    const engine = engineOver(storage, replica, transport);
    await engine.start(WS);

    calls.handlers!.onItem(
      envelope({ kind: 'project', id: P }, 'purge.completed', { kind: 'project', markedBy: OTHER, markedAt: TIME }),
    );

    await vi.waitFor(async () => expect(await replica.getTicket(A)).toBeNull());
    expect(await replica.getTicket(A1)).toBeNull();
    expect(await count(storage, "SELECT count(*) AS n FROM events WHERE type = 'purge.completed'")).toBe(0);
    expect(calls.lookups.flat()).toContain(P);
    // CONTROL
    expect(await replica.getTicket(Q1)).not.toBeNull();
    engine.stop();
  });
});

describe('19.182 the HTTP transport', () => {
  function fetchAnswering(status: number, body: unknown) {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    return { fetchImpl, calls };
  }
  const over = (fetchImpl: typeof fetch) => createHttpTransport({ baseUrl: 'https://api.example', token: 'tok', fetchImpl });

  it('19.182 posts the lookup, reads Deleted items, and types a bootstrap 403', async () => {
    const T = newUlid();
    const ok = fetchAnswering(200, { purged: [{ kind: 'ticket', id: T }, { kind: 'workflow', id: T }, { nope: true }] });
    expect(await over(ok.fetchImpl).purgedLookup([T])).toEqual([{ kind: 'ticket', id: T }]);
    expect(ok.calls[0]?.url).toBe('https://api.example/v1/purged-lookup');
    expect(ok.calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(ok.calls[0]?.init?.body))).toEqual({ ids: [T] });
    expect((ok.calls[0]?.init?.headers as Record<string, string>)['authorization']).toBe('Bearer tok');

    const listed = fetchAnswering(200, { items: [] });
    expect(await over(listed.fetchImpl).deletedItems()).toEqual({ items: [] });
    expect(listed.calls[0]?.url).toBe('https://api.example/v1/me/deleted-items');

    const forbidden = await over(fetchAnswering(403, { error: 'not_a_member' }).fetchImpl)
      .bootstrap(WS)
      .catch((cause: unknown) => cause);
    expect(forbidden).toBeInstanceOf(WorkspaceAccessLost);
    expect((forbidden as WorkspaceAccessLost).message).toBe('bootstrap failed: 403');
    expect((forbidden as WorkspaceAccessLost).workspaceId).toBe(WS);
    // CONTROL
    const broken = await over(fetchAnswering(500, {}).fetchImpl)
      .bootstrap(WS)
      .catch((cause: unknown) => cause);
    expect(broken).not.toBeInstanceOf(WorkspaceAccessLost);
    expect((broken as Error).message).toBe('bootstrap failed: 500');
    await expect(over(fetchAnswering(502, {}).fetchImpl).purgedLookup([T])).rejects.toThrow('purged-lookup failed: 502');
  });
});
```

- [ ] **Step 3: Run it to see it fail.** `cd packages/sync-client && pnpm exec vitest run --no-file-parallelism test/purge-sync.test.ts > /tmp/trash3-sync.log 2>&1; tail -20 /tmp/trash3-sync.log`. Expected: FAIL. `WorkspaceAccessLost` is not exported, and `purgedLookup` is not a member of `SyncTransport`.

- [ ] **Step 4: Implement the engine.** In `packages/sync-client/src/engine/sync-engine.ts`:

1. Line 1 becomes:

```ts
import { PURGED_LOOKUP_MAX_IDS, ULID_REGEX, type LedgerEvent, type PurgedRef, type SubmittedEvent } from '@gisik-nokma/domain';
```

2. Add to `SyncTransport`, after `bootstrapNote` (`:113`):

```ts
  /**
   * `POST /v1/purged-lookup` (trash series Plan 3, D1): which of `ids` were
   * permanently erased. At most `PURGED_LOOKUP_MAX_IDS` per call — the engine
   * chunks. REQUIRED, not optional (D12): an optional member compiles on every
   * fake and silently never erases anything.
   */
  purgedLookup(ids: string[]): Promise<PurgedRef[]>;
  /** `GET /v1/me/deleted-items`, the body as served — the replica data source maps and caches it (D9). */
  deletedItems(): Promise<unknown>;
```

3. After `NotePullNotFound` (`:154-161`), add:

```ts
/**
 * The server answered 403 `not_a_member` on bootstrap (trash series Plan 3,
 * D5). The message is exactly the one the transport threw before this class
 * existed (`bootstrap failed: 403`), so nothing reading it changes; the TYPE
 * is what lets `start()` ask whether the workspace was purged.
 */
export class WorkspaceAccessLost extends Error {
  readonly workspaceId: string;
  constructor(workspaceId: string, message: string) {
    super(message);
    this.name = 'WorkspaceAccessLost';
    this.workspaceId = workspaceId;
  }
}

/** The stream's membership refusal (`apps/server/src/stream/routes.ts`'s `NOT_A_MEMBER_ERROR`), mirrored: this package may not import the server. */
const NOT_A_MEMBER_CODE = 'not-a-member';
```

4. Add to `SyncEngine`, after `reconcile` (`:296`):

```ts
  /**
   * Asks the purged-id lookup about everything this device could hold in
   * `workspaceId` (`replica.purgeLookupCandidates`) plus `extraIds`, in chunks
   * of `PURGED_LOOKUP_MAX_IDS`, and erases what comes back (trash Plan 3, D5).
   * A failing chunk is recorded (`lastPurgeLookupError`) and the rest still
   * run. When the workspace itself is named, the stream ends.
   */
  learnPurges(workspaceId: string, extraIds?: readonly string[]): Promise<{ erased: string[] }>;
  lastPurgeLookupError(): string | null;
  /** The online Deleted-items body through the transport (D9); rejects when offline. */
  fetchDeletedItems(): Promise<unknown>;
```

5. Add a state variable after `let lastReconcileAt = 0;` (`:479`): `let purgeLookupError: string | null = null;`

6. Add this function inside `createSyncEngine`, directly after `withTimeout` (`:665-699`):

```ts
  async function learnPurges(ws: string, extraIds: readonly string[] = []): Promise<{ erased: string[] }> {
    // ULIDs only: the route refuses a whole body for one malformed id (19.162),
    // and a legacy chip id inside a stored document would otherwise cost its
    // entire chunk on every pass.
    const ids = [...new Set([...(await replica.purgeLookupCandidates(ws)), ...extraIds])].filter((id) =>
      ULID_REGEX.test(id),
    );
    const asked = new Set(ids);
    const found: PurgedRef[] = [];
    purgeLookupError = null;
    for (let i = 0; i < ids.length; i += PURGED_LOOKUP_MAX_IDS) {
      const chunk = ids.slice(i, i + PURGED_LOOKUP_MAX_IDS);
      try {
        // Only what was asked: a server naming an id this device never sent
        // changes nothing here.
        for (const ref of await transport.purgedLookup(chunk)) if (asked.has(ref.id)) found.push(ref);
      } catch (err) {
        // One chunk failing must not cost the others their answer; the next
        // pass asks again.
        purgeLookupError = messageOf(err);
      }
    }
    if (found.length === 0) return { erased: [] };
    const { erased } = await replica.eraseEntities(found);
    if (found.some((ref) => ref.kind === 'workspace' && ref.id === ws)) {
      // The whole-workspace `scope-revoked` precedent (`applyOne`): nothing is
      // left to stream, and a reconnect would only earn `not-a-member` again.
      // `streamEnded` BEFORE `closeStream`, so `onClose` does not reconnect.
      streamEnded = true;
      closeStream();
    }
    return { erased: erased.map((ref) => ref.id) };
  }
```

7. In `applyOne`, directly after the whole-workspace `scope-revoked` block (`:827-830`), add:

```ts
    // Trash Plan 3 (D3): a tombstone that DID reach this device (a project's —
    // the only kind the stream can deliver) is never stored; it is a reason to
    // ask, and the answer erases the item and its local subtree.
    if (!isSyncInstruction(item) && item.type === 'purge.completed') {
      try {
        await learnPurges(item.workspaceId, [item.entity.id]);
      } catch {
        // The next reconcile pass asks again.
      }
    }
```

8. In `onCaughtUp`, replace the reconcile `try { … } catch { … }` (`:880-890`) with:

```ts
            // `null` = the interval gate did not open this time; an ARRAY (even
            // empty) = a pass ran, and the lookup follows it in its own `try`
            // (trash Plan 3, D5) — reconcile has just `purgeEntity`d every
            // erased ticket and note (`canSee` is false), so its `purged` ids go
            // along as extras or they would never be asked about.
            let reconciled: string[] | null = null;
            try {
              if (Date.now() - lastReconcileAt >= RECONCILE_MIN_INTERVAL_MS) {
                lastReconcileAt = Date.now();
                reconciled = [];
                reconciled = (await engine.reconcile(ws)).purged;
              }
            } catch {
              // See above. `lastReconcileAt` is deliberately stamped BEFORE the
              // attempt rather than after it: a reconcile that fails fast would
              // otherwise be retried at full rate on a flapping socket, which
              // is the storm the interval exists to prevent.
            }
            if (reconciled !== null) {
              try {
                await learnPurges(ws, reconciled);
              } catch {
                // Idempotent and retried at the next pass, like reconcile.
              }
            }
```

9. Replace `onError` (`:894-900`) with:

```ts
      onError: (err) => {
        // The server named a reason (`not-a-member`, `bad-message`,
        // `already-subscribed`). Record it and do NOT advance the cursor: a
        // stream that errors has not caught up, and pretending otherwise would
        // silently skip whatever it did not send.
        lastStreamError = err;
        // Trash Plan 3 (D5): a purged workspace answers every subscribe with
        // `not-a-member` and never reaches `caught-up`, so this is the only
        // moment such a device can ask. A plain revoke answers nothing here.
        if (err.code === NOT_A_MEMBER_CODE && workspaceId !== null) {
          const ws = workspaceId;
          applyChain = applyChain.then(() => learnPurges(ws)).then(
            () => undefined,
            () => undefined,
          );
        }
      },
```

10. In `start`, replace

```ts
      if (await needsBootstrap(ws)) {
        const body = await transport.bootstrap(ws);
        await replica.loadBootstrap(body);
      }
```

with

```ts
      if (await needsBootstrap(ws)) {
        let body: BootstrapResponse;
        try {
          body = await transport.bootstrap(ws);
        } catch (err) {
          // Trash Plan 3 (D5): a 403 is either a revoke or a purge. Ask; a
          // purge empties this device and ends here, anything else is the
          // failure it always was.
          if (err instanceof WorkspaceAccessLost) {
            await learnPurges(ws);
            if (streamEnded) return;
          }
          throw err;
        }
        await replica.loadBootstrap(body);
      }
```

11. Add to the `engine` object, after `lastAbandonedPull` (`:1119`):

```ts
    learnPurges: (ws, extraIds) => learnPurges(ws, extraIds),
    lastPurgeLookupError: () => purgeLookupError,
    fetchDeletedItems: () => transport.deletedItems(),
```

- [ ] **Step 5: Implement the replica branch.** In `replica.ts`'s `applyServerItem`, directly after `const env = item;` (`:1355`), add:

```ts
      // Trash Plan 3 (D3): a tombstone is NEVER stored — it names an item this
      // device must now erase, and the engine answers it with a lookup. Storing
      // it would put a row about an erased entity into the local ledger.
      if (env.type === 'purge.completed') return { applied: false };
```

- [ ] **Step 6: Implement the HTTP transport.** In `packages/sync-client/src/net/http-transport.ts`:

1. Line 1 becomes `import { isPurgedRef, type LedgerEvent, type PurgedRef, type ServerStreamFrame, type SubmittedEvent } from '@gisik-nokma/domain';`.
2. Line 3 becomes `import { NotePullNotFound, TicketPullNotFound, WorkspaceAccessLost } from '../engine/sync-engine.js';`.
3. In `bootstrap` (`:189-194`), before `if (!res.ok)`, add `if (res.status === 403) throw new WorkspaceAccessLost(workspaceId, \`bootstrap failed: ${res.status}\`);`.
4. Add after `reconcile` (`:206-228`):

```ts
    async purgedLookup(ids: string[]): Promise<PurgedRef[]> {
      const res = await doFetch(`${opts.baseUrl}/v1/purged-lookup`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(`purged-lookup failed: ${res.status}`);
      const body = (await res.json()) as { purged?: unknown };
      // Read defensively, as every frame above is: an entry that is not a
      // lifecycle ref is dropped, never guessed at.
      return Array.isArray(body.purged) ? body.purged.filter(isPurgedRef) : [];
    },

    async deletedItems(): Promise<unknown> {
      const res = await doFetch(`${opts.baseUrl}/v1/me/deleted-items`, { headers });
      if (!res.ok) throw new Error(`deleted-items failed: ${res.status}`);
      return res.json();
    },
```

5. In `packages/sync-client/src/index.ts`, change `export { createSyncEngine, TicketPullNotFound } from './engine/sync-engine.js';` to `export { createSyncEngine, TicketPullNotFound, WorkspaceAccessLost } from './engine/sync-engine.js';`.

- [ ] **Step 7: Give every other transport the two members (D12).**

`packages/sync-client/test/sync-engine.test.ts`'s `fakeTransport` (after `reconcile`, `:267-273`) and `sync-engine-notes.test.ts`'s `fakeTransport` (after `reconcile`, `:142-145`) each gain:

```ts
    async purgedLookup() {
      return [];
    },
    async deletedItems() {
      return { items: [] };
    },
```

`packages/app-core/test/replica/replica-data-source.test.ts`'s `idleTransport` (`:145-152`) and `replica-deleted-reads.test.ts`'s `idleTransport` (`:59-66`) each gain, after `reconcile`:

```ts
  purgedLookup: () => Promise.reject(new Error('offline')),
  deletedItems: () => Promise.reject(new Error('offline')),
```

`replica-data-source.test.ts`'s inline transport (`:657-667`) and `replica-data-source-notes.test.ts`'s transport (after `reconcile`, `:136-138`) each gain:

```ts
        purgedLookup: () => Promise.resolve([]),
        deletedItems: () => Promise.resolve({ items: [] }),
```

In the notes file the object is written in method syntax. There, write `async purgedLookup() { return []; },` and `async deletedItems() { return { items: [] }; },`.

`apps/server/test/dual-client/rig.ts`:
- add the imports `import { purgedRefsAmong } from '../../src/purge/purged-lookup.js';` and `import { readDeletedItems } from '../../src/read/deleted-items.js';`;
- add to the `transport` object, after `bootstrapNote` (`:492-501`):

```ts
      // Trash Plan 3: the ROUTE's own function, the discipline the ticket and
      // note pulls state above — a restated rule would let a harness prove
      // replicas against a server that does not exist.
      purgedLookup: (ids) => purgedRefsAmong(pool, ids),
      deletedItems: async () => ({ items: await readDeletedItems(pool, userId) }),
```

- [ ] **Step 8: Run to see it pass.**
  1. `pnpm turbo run build`.
  2. The new file: `cd packages/sync-client && pnpm exec vitest run --no-file-parallelism test/purge-sync.test.ts > /tmp/trash3-sync.log 2>&1; tail -20 /tmp/trash3-sync.log`.
  3. The whole of `sync-client`.
  4. `cd packages/app-core && pnpm exec vitest run --no-file-parallelism test/replica > /tmp/trash3-appcore.log 2>&1; tail -20 /tmp/trash3-appcore.log`.
  5. `cd apps/server && pnpm exec vitest run --no-file-parallelism test/dual-client > /tmp/trash3-server.log 2>&1; tail -20 /tmp/trash3-server.log`.

  Case 12.162 (`sync-engine.test.ts:455-468`) now queues a lookup on its `not-a-member` frame. Its fake answers `[]`, so its assertions hold. Read its line in the log.

- [ ] **Step 9: Flip 19.176–19.182 to ✅, and append to `Features.md` §16:**

```markdown
- ⚙️ **A device learns of a purge** (`packages/sync-client/src/engine/sync-engine.ts`'s `learnPurges`, `net/http-transport.ts`'s `purgedLookup`/`deletedItems`, `WorkspaceAccessLost`; trash Plan 3 Task 5, deviations D3–D5, D12) — the stream cannot deliver most tombstones (a purged ticket or note is invisible; a purged workspace answers `not-a-member`), so the device ASKS: after every reconcile pass (in its own `try`, fed reconcile's evicted ids; under reconcile's 60 s gate), on a `not-a-member` stream error, on a bootstrap 403, and on a `purge.completed` envelope that does arrive (never stored). It asks about the workspace, held tickets and notes, contest and outbox targets and every chip id in a held body, in chunks of 500; a failing chunk is recorded (`lastPurgeLookupError`) and the others still count; whatever comes back is erased (Task 3). A named workspace ends the stream. A plain membership revoke is answered with nothing and erases nothing. Cases 19.176–19.182.
```

- [ ] **Step 10: Commit** `Trash 3/Task 5: devices ask the purged-id lookup (19.176-19.182)`. Then the mutations.

---
### Task 6: The outbox notice — refused-by-purge becomes a notice; every failed claim can be read and dismissed; desktop and phone show them

**Files:**
- Modify:
  - `packages/sync-client/src/outbox/outbox.ts`: `OutboxItem` (`:131-138`), `Outbox` (`:192-204`), `rowToItem` (`:206-215`), `applyResult`'s terminal arm (`:451-457`), the returned object.
  - `packages/app-core/src/replica/replica-data-source.ts`: `ReplicaOnlyQuery` (`:236-280`); the `query` object after `syncStatus` (`:1765-1771`).
  - `packages/app-core/src/index.ts` (exports)
  - `packages/ui/src/ui.css` (after `.gn-sync-status-bar__error`, `:4978`)
  - `apps/desktop/src/app.tsx:9-14,42-115,140-147`
  - `apps/mobile/src/app.tsx:22-27,52-57,91-98`, `apps/mobile/src/screens/board-screen.tsx:1-17,51-52`
  - `docs/manual.md` (the status-strip list, `:1403-1409`), `packages/app-core/src/help/content.generated.ts` (regenerated)
  - `test-cases/19-trash.md`, `Features.md`
- Create:
  - `packages/app-core/src/sync/sync-notices.tsx`
  - `packages/sync-client/test/purge-outbox.test.ts`
  - `packages/app-core/test/sync-notices.test.tsx`
  - `packages/app-core/test/replica/replica-sync-notices.test.ts`
  - `apps/server/test/dual-client/purge.test.ts`

**Interfaces:**
- Consumes: `PURGE_RULE`, `PURGED_OUTBOX_NOTICE` (Task 1); `dropOutboxRowsAsNotices`, `outbox.notices`, `outbox.dismissNotice` (Task 3); `engine.learnPurges`, the rig's `purgedLookup` (Task 5).
- Produces:
  - `OutboxItem.lastError: string | null`; `Outbox.dismissFailed(eventId: string): Promise<void>`
  - `type SyncNoticeView = { id: string; text: string }`
  - `SYNC_NOTICE_DISMISS = 'Dismiss'`
  - `failedClaimNotice(lastError: string | null): string`
  - `SyncNotices(props: { notices: readonly SyncNoticeView[]; onDismiss(id: string): void }): ReactElement`
  - `ReplicaOnlyQuery.syncNotices(workspaceId: string): Promise<SyncNoticeView[]>` (purge notices first, then failed claims, each oldest first; ids `purged:<eventId>` / `failed:<eventId>`)
  - `ReplicaOnlyQuery.dismissSyncNotice(id: string): Promise<void>`

Cases (`## 19.35 The outbox notice`, 5 ids):

```markdown
## 19.35 The outbox notice

- ❌ **19.183 — a claim the server refuses with rule `purge.erased` leaves the outbox as a notice and is NOT a failed row;** control: a claim refused by any other rule stays a failed row carrying its `rule: reason` as `lastError`. Mutation: delete the `PURGE_RULE` arm — the purge refusal becomes a permanent failed row.
- ❌ **19.184 — `failedItems` carries `lastError`, `dismissFailed` deletes a failed row, and `dismissNotice` deletes a notice;** control: `dismissFailed` on a QUEUED row's id leaves it queued. Mutation: `dismissFailed` without the `status = 'failed'` guard.
- ❌ **19.185 — `SyncNotices` draws each notice's sentence with a Dismiss button named `Dismiss: <sentence>`, calls `onDismiss` with its id, draws an empty live region for none, and every `gn-sync-notices*` class it renders has a rule in `ui.css` and vice versa;** control: no button for zero notices. Mutation: drop the `aria-label` — the button's name loses the sentence.
- ❌ **19.186 — the replica data source's `syncNotices` lists purge notices as `PURGED_OUTBOX_NOTICE` and failed claims as `failedClaimNotice(lastError)`, and `dismissSyncNotice` routes `purged:`/`failed:` ids to the right delete;** control: an unknown id changes nothing. Mutation: route `failed:` ids to `dismissNotice`.
- ❌ **19.187 — end to end against the real server: device A edits T offline, T is deleted, marked and purged, A reconnects — the edit comes back refused, leaves A's outbox as a notice (no failed row), A's lookup erases T, and A lists `PURGED_OUTBOX_NOTICE`;** control: A's offline edit to the surviving S commits. Mutation: delete the `PURGE_RULE` arm in `applyResult`.
```

- [ ] **Step 1: Write the cases.** Confirm the count moved by exactly 5.

- [ ] **Step 2: Write the failing sync-client test** `packages/sync-client/test/purge-outbox.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newUlid, PURGE_RULE, PURGED_REASON } from '@gisik-nokma/domain';
import { createOutbox } from '../src/outbox/outbox.js';
import { WS, apply, claim, freshReplica, queue, ticketCreated } from './purge-world.js';

/**
 * Trash series Plan 3, Task 6 (deviation D6) — spec §5.7: a claim "refused at
 * the door ('This item was permanently deleted') and dropped from its outbox
 * with a visible notice — never silently".
 */

describe('19.183 a purge refusal becomes a notice', () => {
  it('19.183 removes the claim into a notice; another refusal stays a failed row with its lastError', async () => {
    const { storage, replica } = await freshReplica();
    const outbox = createOutbox({ storage, replica });
    const [T, S] = [newUlid(), newUlid()];
    await apply(replica, [ticketCreated(T), ticketCreated(S)]);
    const gone = claim({ kind: 'ticket', id: T }, 'ticket.field_set', { fieldId: 'title', value: 'offline' });
    const other = claim({ kind: 'ticket', id: S }, 'ticket.field_set', { fieldId: 'title', value: 'offline too' });
    await queue(storage, gone);
    await queue(storage, other);

    await outbox.applyResult(gone.id, { status: 'refused', eventId: gone.id, rule: PURGE_RULE, reason: PURGED_REASON });
    await outbox.applyResult(other.id, {
      status: 'refused',
      eventId: other.id,
      rule: 'restrict-to',
      reason: 'Only admins may make this move.',
    });

    expect((await outbox.notices(WS)).map((notice) => notice.noticeId)).toEqual([gone.id]);
    const failed = await outbox.failedItems(WS);
    expect(failed.map((item) => item.eventId)).toEqual([other.id]);
    // CONTROL
    expect(failed[0]?.lastError).toBe('restrict-to: Only admins may make this move.');
  });
});

describe('19.184 failed rows and notices can be read and dismissed', () => {
  it('19.184 dismissFailed deletes only a failed row; dismissNotice deletes a notice', async () => {
    const { storage, replica } = await freshReplica();
    const outbox = createOutbox({ storage, replica });
    const [T, S, Q] = [newUlid(), newUlid(), newUlid()];
    await apply(replica, [ticketCreated(T), ticketCreated(S), ticketCreated(Q)]);
    const refused = claim({ kind: 'ticket', id: S }, 'ticket.field_set', { fieldId: 'title', value: 'x' });
    const purged = claim({ kind: 'ticket', id: T }, 'ticket.field_set', { fieldId: 'title', value: 'y' });
    const waiting = claim({ kind: 'ticket', id: Q }, 'ticket.field_set', { fieldId: 'title', value: 'z' });
    for (const event of [refused, purged, waiting]) await queue(storage, event);
    await outbox.applyResult(refused.id, { status: 'refused', eventId: refused.id, rule: 'restrict-to', reason: 'No.' });
    await outbox.applyResult(purged.id, { status: 'refused', eventId: purged.id, rule: PURGE_RULE, reason: PURGED_REASON });

    expect((await outbox.failedItems(WS))[0]?.lastError).toBe('restrict-to: No.');
    await outbox.dismissFailed(refused.id);
    await outbox.dismissNotice(purged.id);

    expect(await outbox.failedItems(WS)).toEqual([]);
    expect(await outbox.notices(WS)).toEqual([]);
    // CONTROL: a queued row is not a failed row
    await outbox.dismissFailed(waiting.id);
    expect(await outbox.queuedCount(WS)).toBe(1);
  });
});
```

- [ ] **Step 3: Run it to see it fail.** `cd packages/sync-client && pnpm exec vitest run --no-file-parallelism test/purge-outbox.test.ts > /tmp/trash3-sync.log 2>&1; tail -20 /tmp/trash3-sync.log`. Expected: FAIL. 19.183 finds no notice (the purge refusal became a failed row). 19.184 finds `lastError` undefined and `dismissFailed` not a function.

- [ ] **Step 4: Implement the outbox half.** In `packages/sync-client/src/outbox/outbox.ts`:

1. Add `import { PURGE_RULE, type EventEnvelope, type LedgerEvent, type SubmittedEvent, type TicketState } from '@gisik-nokma/domain';` in place of the type-only import at `:2`. Change the notices import to `import { deleteNotice, dropOutboxRowsAsNotices, listNotices, type SyncNotice } from './notices.js';`.
2. `OutboxItem` gains, after `status` (`:137`):

```ts
  /** The server's words when a claim was refused or invalid (`rule: reason`), or the last transport error. */
  lastError: string | null;
```

3. `rowToItem` gains, after `status` (`:213`): `lastError: (row.last_error as string | null) ?? null,`
4. `Outbox` gains, after `failedItems` (`:199`):

```ts
  /** The person has read a refused claim's reason and lets it go. Only a FAILED row is deleted. */
  dismissFailed(eventId: string): Promise<void>;
```

5. In `applyResult`, directly above the `// \`refused\` or \`invalid\`: TERMINAL.` comment (`:451`), add:

```ts
      // Trash Plan 3 (D6): refused because the item was permanently erased. It
      // can never commit, and keeping it as a failed row would keep a copy of
      // content that no longer exists; spec §5.7 wants it gone WITH a visible
      // notice. `dropOutboxRowsAsNotices` records the notice and deletes the row
      // in one transaction.
      if (result.status === 'refused' && result.rule === PURGE_RULE) {
        await storage.transaction(async (tx) => {
          await dropOutboxRowsAsNotices(
            tx,
            await tx.all('SELECT * FROM outbox WHERE event_id = ?', [eventId]),
            new Date().toISOString(),
          );
        });
        return;
      }
```

6. Add to the returned object, after `failedItems`:

```ts
    async dismissFailed(eventId) {
      await storage.run("DELETE FROM outbox WHERE event_id = ? AND status = 'failed'", [eventId]);
    },
```

- [ ] **Step 5: Run to see it pass**, then the whole `sync-client` suite. `outbox.test.ts:206-222` (the existing refused-row case) must stay green.

- [ ] **Step 6: Write the failing app-core tests.**

`packages/app-core/test/sync-notices.test.tsx`:

```tsx
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PURGED_OUTBOX_NOTICE } from '@gisik-nokma/domain';
import { SYNC_NOTICE_DISMISS, SyncNotices, failedClaimNotice } from '../src/sync/sync-notices.js';

/**
 * Trash series Plan 3, Task 6 — the notices a device owes the person
 * (spec §5.7). The CSS half mirrors `sync-ux-css-binding.test.tsx` (12.199):
 * the classes rendered and the rules in `ui.css` are one fact.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PREFIX = 'gn-sync-notices';

function styledClasses(css: string): string[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...new Set([...bare.matchAll(new RegExp(`\\.(${PREFIX}[A-Za-z0-9_-]*)`, 'g'))].map((m) => m[1] as string))].sort();
}

function renderedClasses(root: HTMLElement): string[] {
  const found = new Set<string>();
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const name of Array.from(el.classList)) if (name.startsWith(PREFIX)) found.add(name);
  }
  return [...found].sort();
}

describe('19.185 SyncNotices', () => {
  it('19.185 draws each sentence with a named Dismiss, reports the id, and is one fact with ui.css', async () => {
    const onDismiss = vi.fn();
    const failed = failedClaimNotice('restrict-to: Only admins may make this move.');
    const { container, unmount } = render(
      <SyncNotices
        notices={[
          { id: 'purged:e1', text: PURGED_OUTBOX_NOTICE },
          { id: 'failed:e2', text: failed },
        ]}
        onDismiss={onDismiss}
      />,
    );
    const region = screen.getByRole('region', { name: 'Sync notices' });
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText(PURGED_OUTBOX_NOTICE)).toBeInTheDocument();
    expect(failed).toBe('A change could not be saved — restrict-to: Only admins may make this move.');
    expect(failedClaimNotice(null)).toBe('A change could not be saved.');
    await userEvent.click(screen.getByRole('button', { name: `${SYNC_NOTICE_DISMISS}: ${PURGED_OUTBOX_NOTICE}` }));
    expect(onDismiss).toHaveBeenCalledWith('purged:e1');
    const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
    expect(renderedClasses(container)).toEqual(styledClasses(css));
    unmount();

    // CONTROL: nothing to say, nothing to press — but the live region stays mounted
    render(<SyncNotices notices={[]} onDismiss={onDismiss} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('region', { name: 'Sync notices' })).toBeEmptyDOMElement();
  });
});
```

`packages/app-core/test/replica/replica-sync-notices.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, PURGE_RULE, PURGED_OUTBOX_NOTICE, PURGED_REASON } from '@gisik-nokma/domain';
import { createOutbox, createReplica, createSyncEngine, type SyncTransport } from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { createReplicaDataSource } from '../../src/replica/replica-data-source.js';
import { failedClaimNotice } from '../../src/sync/sync-notices.js';

/** Trash series Plan 3, Task 6 — the replica data source's view of the outbox's notices. */

const WS = newUlid();

const offline: SyncTransport = {
  bootstrap: () => Promise.reject(new Error('offline')),
  sync: () => Promise.reject(new Error('offline')),
  openStream: () => ({ close: () => undefined }),
  bootstrapTicket: () => Promise.reject(new Error('offline')),
  bootstrapNote: () => Promise.reject(new Error('offline')),
  reconcile: () => Promise.reject(new Error('offline')),
  purgedLookup: () => Promise.reject(new Error('offline')),
  deletedItems: () => Promise.reject(new Error('offline')),
};

describe('19.186 syncNotices and dismissSyncNotice', () => {
  it('19.186 lists purge notices then failed claims, and routes each dismissal to its own delete', async () => {
    const storage = createBetterSqliteStorage();
    const replica = await createReplica({ storage });
    const outbox = createOutbox({ storage, replica });
    const engine = createSyncEngine({ replica, outbox, transport: offline });
    const ds = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });
    const events = [newUlid(), newUlid()].map((ticketId) =>
      newSubmittedEvent({
        workspaceId: WS,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.field_set',
        payload: { fieldId: 'title', value: 'offline' },
        actorId: newUlid(),
        origin: 'desktop',
      }),
    );
    for (const event of events) {
      await storage.run(
        'INSERT INTO outbox (event_id, workspace_id, entity_kind, entity_id, envelope) VALUES (?, ?, ?, ?, ?)',
        [event.id, WS, 'ticket', event.entity.id, JSON.stringify(event)],
      );
    }
    const [purged, refused] = events as [(typeof events)[0], (typeof events)[0]];
    await outbox.applyResult(purged.id, { status: 'refused', eventId: purged.id, rule: PURGE_RULE, reason: PURGED_REASON });
    await outbox.applyResult(refused.id, { status: 'refused', eventId: refused.id, rule: 'restrict-to', reason: 'No.' });

    expect(await ds.query.syncNotices(WS)).toEqual([
      { id: `purged:${purged.id}`, text: PURGED_OUTBOX_NOTICE },
      { id: `failed:${refused.id}`, text: failedClaimNotice('restrict-to: No.') },
    ]);

    await ds.query.dismissSyncNotice(`failed:${refused.id}`);
    expect(await outbox.failedItems(WS)).toEqual([]);
    expect(await outbox.notices(WS)).toHaveLength(1);
    await ds.query.dismissSyncNotice(`purged:${purged.id}`);
    expect(await outbox.notices(WS)).toEqual([]);
    // CONTROL
    await ds.query.dismissSyncNotice('something-else');
    expect(await ds.query.syncNotices(WS)).toEqual([]);
  });
});
```

- [ ] **Step 7: Run them to see them fail.** `pnpm turbo run build --filter @gisik-nokma/sync-client`, then `cd packages/app-core && pnpm exec vitest run --no-file-parallelism test/sync-notices.test.tsx test/replica/replica-sync-notices.test.ts > /tmp/trash3-appcore.log 2>&1; tail -20 /tmp/trash3-appcore.log`. Expected: FAIL. `../src/sync/sync-notices.js` does not exist, and `syncNotices` is not on the query.

- [ ] **Step 8: Implement the app-core half.**

Create `packages/app-core/src/sync/sync-notices.tsx`:

```tsx
import type { ReactElement } from 'react';

/**
 * The notices a device owes the person (trash series Plan 3, D6; spec §5.7,
 * "a visible notice — never silently"): a queued change the device removed
 * because its item was permanently deleted, and any change the server refused
 * for another reason. Drawn under the sync strip; each can be dismissed.
 */
export type SyncNoticeView = { id: string; text: string };

export const SYNC_NOTICE_DISMISS = 'Dismiss';

/** A refused change's line: the server's own `rule: reason`, verbatim, as the strip's error line is. */
export function failedClaimNotice(lastError: string | null): string {
  return lastError === null || lastError === '' ? 'A change could not be saved.' : `A change could not be saved — ${lastError}`;
}

/**
 * The live region stays MOUNTED when empty (`.gn-sync-notices:empty` hides it):
 * a region inserted together with its first notice is not reliably announced.
 * Each button's name starts with its visible word (WCAG 2.5.3) and ends with
 * the sentence it dismisses, so a list of them is not five identical "Dismiss".
 */
export function SyncNotices(props: { notices: readonly SyncNoticeView[]; onDismiss(id: string): void }): ReactElement {
  return (
    <section className="gn-sync-notices" aria-label="Sync notices" aria-live="polite">
      {props.notices.length === 0 ? null : (
        <ul className="gn-sync-notices__list">
          {props.notices.map((notice) => (
            <li key={notice.id} className="gn-sync-notices__item">
              <span className="gn-sync-notices__text">{notice.text}</span>
              <button
                type="button"
                className="gn-sync-notices__dismiss"
                aria-label={`${SYNC_NOTICE_DISMISS}: ${notice.text}`}
                onClick={() => props.onDismiss(notice.id)}
              >
                {SYNC_NOTICE_DISMISS}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

In `packages/app-core/src/replica/replica-data-source.ts`:
- add `PURGED_OUTBOX_NOTICE` to its `@gisik-nokma/domain` import;
- add `import { failedClaimNotice, type SyncNoticeView } from '../sync/sync-notices.js';`;
- add to `ReplicaOnlyQuery`, after `syncStatus` (`:279`):

```ts
  /** Purge notices (oldest first), then failed claims with the server's words — trash Plan 3. */
  syncNotices(workspaceId: string): Promise<SyncNoticeView[]>;
  /** `purged:<eventId>` dismisses a notice; `failed:<eventId>` deletes a failed claim; anything else is ignored. */
  dismissSyncNotice(id: string): Promise<void>;
```

- add to the `query` object, after `syncStatus` (`:1765-1771`):

```ts
    async syncNotices(workspaceId) {
      const purged = (await outbox.notices(workspaceId)).map(
        (notice): SyncNoticeView => ({ id: `purged:${notice.noticeId}`, text: PURGED_OUTBOX_NOTICE }),
      );
      const failed = (await outbox.failedItems(workspaceId)).map(
        (item): SyncNoticeView => ({ id: `failed:${item.eventId}`, text: failedClaimNotice(item.lastError) }),
      );
      return [...purged, ...failed];
    },

    async dismissSyncNotice(id) {
      if (id.startsWith('purged:')) await outbox.dismissNotice(id.slice('purged:'.length));
      else if (id.startsWith('failed:')) await outbox.dismissFailed(id.slice('failed:'.length));
    },
```

In `packages/app-core/src/index.ts`, add beside the `SyncStatusBar` export: `export { SyncNotices, SYNC_NOTICE_DISMISS, failedClaimNotice, type SyncNoticeView } from './sync/sync-notices.js';`.

In `packages/ui/src/ui.css`, directly after `.gn-sync-status-bar__error { color: var(--gn-warning); }` (`:4978`), add:

```css
/* Trash Plan 3 — changes the device removed or could not save (spec §5.7: "a
   visible notice — never silently"). The left rule is the warning ink the
   strip's own server-reason line uses; the sentence carries the meaning, so
   colour is never the only signal. The live region stays mounted and empty
   when there is nothing to say. */
.gn-sync-notices:empty { display: none; }
.gn-sync-notices { background: var(--gn-surface); padding: 0.3rem 0.75rem; }
.gn-sync-notices__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.gn-sync-notices__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-left: 3px solid var(--gn-warning);
  padding-left: 0.6rem;
}
.gn-sync-notices__text { flex: 1; color: var(--gn-text); font-size: 0.85rem; }
.gn-sync-notices__dismiss {
  min-height: 2.75rem;
  padding: 0 0.9rem;
  background: transparent;
  color: var(--gn-text);
  border: 1px solid var(--gn-border);
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
}
.gn-sync-notices__dismiss:focus-visible { outline: 2px solid var(--gn-focus-ring); outline-offset: 2px; }
```

- [ ] **Step 9: Mount them.**

`apps/desktop/src/app.tsx`:
- add `SyncNotices` and `type SyncNoticeView` to the app-core import (`:9-14`);
- add `const [notices, setNotices] = useState<SyncNoticeView[]>([]);` after `const [failed, setFailed] = useState(0);` (`:46`);
- inside `refreshCounts` (`:88-93`), after the `syncStatus` call, add `void dataSource.query.syncNotices(workspaceId).then(setNotices);`;
- directly after the `app-shell__sync-status` `</div>` (`:146`), add:

```tsx
      <SyncNotices
        notices={notices}
        onDismiss={(id) => {
          if (ds === null) return;
          void ds.query
            .dismissSyncNotice(id)
            .then(() => ds.query.syncNotices(workspaceId))
            .then(setNotices);
        }}
      />
```

`apps/mobile/src/app.tsx`:
- add `import type { SyncNoticeView } from '@gisik-nokma/app-core';` (or add it to the existing app-core import, `:5`);
- add `const [notices, setNotices] = useState<SyncNoticeView[]>([]);` after `:26`;
- inside `refreshQueue` (`:52-57`) add `void dataSource.query.syncNotices(workspaceId).then(setNotices);`;
- pass to `BoardScreen` (`:91-98`):

```tsx
              notices={notices}
              onDismissNotice={(id) => {
                if (ds === null) return;
                void ds.query
                  .dismissSyncNotice(id)
                  .then(() => ds.query.syncNotices(workspaceId))
                  .then(setNotices);
              }}
```

`apps/mobile/src/screens/board-screen.tsx`:
- line 2 becomes `import { Button, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';`;
- line 4 becomes `import { SYNC_NOTICE_DISMISS, syncStatusLabel, type ReplicaDataSource, type SyncNoticeView, type TicketSummary } from '@gisik-nokma/app-core';`;
- the props type (`:10-17`) gains `notices: readonly SyncNoticeView[];` and `onDismissNotice(id: string): void;`;
- after the `failed` line (`:52`) add:

```tsx
      {/* Trash Plan 3 — the same notices desktop draws with `SyncNotices`, in
          native views (RN cannot mount its <section>). RN's own `Button`, the
          one `ticket-screen.tsx` uses, so the pressable census (13.1188) is
          unchanged. */}
      <View accessibilityLiveRegion="polite">
        {props.notices.map((notice) => (
          <View key={notice.id}>
            <Text accessibilityRole="text">{notice.text}</Text>
            <Button
              title={SYNC_NOTICE_DISMISS}
              accessibilityLabel={`${SYNC_NOTICE_DISMISS}: ${notice.text}`}
              onPress={() => props.onDismissNotice(notice.id)}
            />
          </View>
        ))}
      </View>
```

- [ ] **Step 10: Write the end-to-end test** `apps/server/test/dual-client/purge.test.ts` (Review Focus 1):

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, PURGED_OUTBOX_NOTICE, type SubmittedEvent } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { dueAt, recordingStore } from '../purge/world.js';
import { createHarness, TASK_TYPE_ID, USER_A, USER_ADMIN, type Harness, type HarnessClient } from './rig.js';

/**
 * Trash series Plan 3, Task 6 — Review Focus 1, through the real server: a
 * device's offline edit to a ticket that is purged while it is offline.
 */

let h: Harness;
let a: HarnessClient;

beforeEach(async () => {
  h = await createHarness();
  a = await h.client(USER_A);
});

afterEach(async () => {
  await h.drop();
});

function ticketEvent(
  actorId: string,
  ticketId: string,
  type: string,
  payload: unknown,
  origin: SubmittedEvent['origin'] = 'web',
): SubmittedEvent {
  return newSubmittedEvent({ workspaceId: h.workspaceId, entity: { kind: 'ticket', id: ticketId }, type, payload, actorId, origin });
}

describe('19.187 an offline edit to a ticket purged meanwhile', () => {
  it('19.187 comes back refused, becomes a notice, and the lookup erases the ticket; the edit to the survivor commits', async () => {
    const [T, S] = [newUlid(), newUlid()];
    const created = await h.ingestInteractive(USER_ADMIN, [
      ticketEvent(USER_ADMIN, T, 'ticket.created', {
        typeId: TASK_TYPE_ID,
        projectId: h.projectId,
        parentId: null,
        title: 'Doomed while A is offline',
      }),
      ticketEvent(USER_ADMIN, S, 'ticket.created', {
        typeId: TASK_TYPE_ID,
        projectId: h.projectId,
        parentId: null,
        title: 'Survives',
      }),
    ]);
    expect(created.map((result) => result.status)).toEqual(['committed', 'committed']);
    await a.syncDown();
    expect(await a.replica.getTicket(T)).not.toBeNull();

    const edit = ticketEvent(USER_A, T, 'ticket.field_set', { fieldId: 'title', value: 'Edited offline' }, 'desktop');
    const keep = ticketEvent(USER_A, S, 'ticket.field_set', { fieldId: 'title', value: 'Also edited offline' }, 'desktop');
    await a.submit(edit);
    await a.submit(keep);

    const marked = await h.ingestInteractive(USER_ADMIN, [
      ticketEvent(USER_ADMIN, T, 'ticket.deleted', {}),
      ticketEvent(USER_ADMIN, T, 'purge.marked', {}),
    ]);
    expect(marked.map((result) => result.status)).toEqual(['committed', 'committed']);
    await purgeItem(h.pool, { kind: 'ticket', id: T }, {
      projections: buildProjectionRegistry(),
      store: recordingStore(),
      now: await dueAt(h.pool, 'ticket', T),
    });

    await a.goOnline();
    await a.engine.learnPurges(h.workspaceId);

    expect(await a.outbox.notices(h.workspaceId)).toEqual([
      expect.objectContaining({ noticeId: edit.id, entityKind: 'ticket', entityId: T, eventType: 'ticket.field_set' }),
    ]);
    expect(await a.outbox.failedItems(h.workspaceId)).toEqual([]);
    expect(await a.replica.getTicket(T)).toBeNull();
    expect(await a.ds.query.syncNotices(h.workspaceId)).toEqual([{ id: `purged:${edit.id}`, text: PURGED_OUTBOX_NOTICE }]);
    // CONTROL
    expect(await a.outbox.queuedCount(h.workspaceId)).toBe(0);
    expect((await h.projTicket(S))?.fields['title']?.value).toBe('Also edited offline');
  });
});
```

- [ ] **Step 11: Run everything this task touches.**
  1. `pnpm turbo run build`.
  2. `packages/app-core`: the two new files plus `test/sync-ux-css-binding.test.tsx` (its prefixes do not include `gn-sync-notices`, so it must not move).
  3. `apps/server`: `test/dual-client/purge.test.ts test/dual-client/scenarios.test.ts`.
  4. `apps/mobile`: `pnpm exec vitest run > /tmp/trash3-mobile.log 2>&1; tail -20 /tmp/trash3-mobile.log`. 13.1188's census stays 2.
  5. `pnpm turbo run typecheck --filter @gisik-nokma/desktop --filter @gisik-nokma/mobile`.

- [ ] **Step 12: The manual.** In `docs/manual.md`, directly after the list line `- a separate "needs attention" count for changes that were permanently refused` (`:1409`), add a blank line and:

```markdown
**A change to something that was permanently deleted while you were offline cannot be saved.** When the
app reconnects it takes that change out of its queue and puts a note in its place — "A change to an item
that was permanently deleted could not be saved, and was removed." — with a **Dismiss** button. Any other
change the server refused is listed the same way, with the server's reason, and **Dismiss** lets it go.
```

Run `pnpm help:generate`, then `pnpm check:help`. The one quoted span is `PURGED_OUTBOX_NOTICE` verbatim.
- If `check:help` reports it as undeclared because its product scan does not read `packages/domain`, replace the quotes with bold. Never add it to `scripts/help-quoted-strings-absent.json`.
- Commit the regenerated `content.generated.ts`.

- [ ] **Step 13: Flip 19.183–19.187 to ✅, and append to `Features.md` §16:**

```markdown
- ✅ **The outbox notice** (`packages/sync-client/src/outbox/outbox.ts`'s `applyResult`/`dismissFailed`/`notices`/`dismissNotice`, `packages/app-core/src/sync/sync-notices.tsx`'s `SyncNotices`, `replica/replica-data-source.ts`'s `syncNotices`/`dismissSyncNotice`; mounted by `apps/desktop/src/app.tsx` and `apps/mobile/src/screens/board-screen.tsx`; trash Plan 3 Task 6, deviation D6; spec §5.7) — a queued change the server refuses with rule `purge.erased` leaves the outbox as a notice ("A change to an item that was permanently deleted could not be saved, and was removed.") instead of a permanent failed row; every other refusal stays a failed row and now carries the server's words (`OutboxItem.lastError`), shown as "A change could not be saved — <rule: reason>". Each has a **Dismiss** (a failed row is deleted; a queued one never is). The notices sit in a polite live region under the sync strip, 44 px buttons named "Dismiss: <sentence>". Proven end to end against the real server in the dual-client rig. Cases 19.183–19.187.
  - ✅ The manual's status-strip section says so (`docs/manual.md`, "The status strip").
```

- [ ] **Step 14: Commit** `Trash 3/Task 6: purge refusals become notices; failed claims can be dismissed (19.183-19.187)`. Then the mutations.

---
### Task 7: Deleted item chips — the predicate's data, comment bodies, the ticket sheet's thread, the web's note comments

**Files:**
- Modify:
  - `packages/app-core/src/data-source.ts:243-251` (`DataSourceQuery`, after `getDeletedItems`)
  - `packages/app-core/src/online/online-data-source.ts:150-153` (the query, after `getDeletedItems`)
  - `packages/app-core/src/online/mappers.ts` (after `mapDeletedItems`, `:2904`)
  - `packages/app-core/src/replica/replica-data-source.ts:1184` (the query, after `getDeletedItems`)
  - `packages/app-core/src/views/comment-body.tsx:162-171,259-291,346-348`
  - `packages/app-core/src/views/comments-thread.tsx:109,132-145,180-186,247`
  - `packages/app-core/src/views/ticket-sheet.tsx` (a hook before `if (read.error !== null) {`, `:992`; `<CommentsThread`, `:3901-3912`)
  - `packages/app-core/src/index.ts`
  - `apps/web/src/notes/note-comments.tsx:4,57-87`
  - `packages/app-core/test/helpers/fake-data-source.ts:32-34`, `apps/web/test/helpers/stub-services.ts:112-123`
  - `apps/server/test/integration/soft-delete-client-surface.test.ts:465-500,612-625,752-756,822-825`
  - `packages/ui/src/ui.css` (after `.gn-comment__ticketref`, `:7351`)
  - `docs/manual.md` (after the `:note` paragraph, `:1695-1696`), `packages/app-core/src/help/content.generated.ts`
  - `test-cases/19-trash.md`, `Features.md`
- Create:
  - `packages/app-core/src/views/use-purged-predicate.ts`
  - `packages/app-core/test/views/use-purged-predicate.test.tsx`
  - `packages/app-core/test/replica/replica-purged.test.ts`
- Tests appended:
  - `packages/app-core/test/views/comment-body.test.tsx`
  - `packages/app-core/test/online/online-data-source.test.ts`
  - `packages/app-core/test/views/ticket-sheet-comments.test.tsx`
  - `apps/web/test/note-comments.test.tsx`

**Interfaces:**
- Consumes: `PurgedRef`, `PurgedPredicate`, `PURGED_LOOKUP_MAX_IDS` (Task 1); `PURGED_ITEM_LABEL` (Plan 2, `packages/domain/src/purge.ts:16`); `collectDocReferences`; `replica.purgedAmong` (Task 3); the route (Task 1).
- Produces:
  - `DataSourceQuery.purgedAmong(ids: readonly string[]): Promise<PurgedRef[]>`
  - `mapPurgedLookup(raw: unknown): PurgedRef[]`
  - `usePurgedPredicate(query: Pick<DataSourceQuery, 'purgedAmong'>, docs: readonly unknown[], loaded = true): { isPurged: PurgedPredicate; ready: boolean }`. `ready` is false until `loaded`, true in the same render every referenced id has an answer, and sticky once true.
  - `renderCommentBody(doc, ticketHref?, isPurged?: PurgedPredicate)`
  - `CommentsThreadProps.isPurged?: PurgedPredicate`

Cases (`## 19.36 Deleted item chips`, 4 ids):

```markdown
## 19.36 Deleted item chips

- ❌ **19.188 — `renderCommentBody` draws a `ticketRef` and a `wikiLink` whose target the predicate names as `PURGED_ITEM_LABEL`, in a span with `gn-comment__ref--purged`, with no link even when the href resolver answers one;** control: a live chip beside them keeps `KEY title` and its link. Mutation: resolve the href before asking the predicate.
- ❌ **19.189 — the online twin of `purgedAmong` POSTs the unique ULIDs (a non-ULID is never sent) to `/v1/purged-lookup` in chunks of at most 500 and maps each row, refusing one that is not a lifecycle ref; the replica twin answers from `purged_ids`;** control: an empty list sends no request, and an unrecorded id is absent on the replica. Mutation: send every id in one request.
- ❌ **19.190 — `usePurgedPredicate` is not `ready` before its documents are `loaded`, asks once per id per session (a second mount of the same document asks nothing), is `ready` in the same render for a document without chips, and settles `ready` with nothing purged when the lookup fails — which it retries on the next mount;** control: the predicate names the purged id and not the live one. Mutation: drop the session cache.
- ❌ **19.191 — a SURVIVING comment's chip to a purged note reads "Deleted item" with no link, both in the ticket sheet's thread and in the web's note comments, and the stored comment body is unchanged;** control: the live ticket chip in the same comment keeps `SHOP-9 Fix the freezer` and its link. Mutation: do not pass `isPurged` from the sheet to `CommentsThread`.
```

- [ ] **Step 1: Write the cases.** Confirm the count moved by exactly 4.

- [ ] **Step 2: Write the failing tests.**

Append to `packages/app-core/test/views/comment-body.test.tsx` (it already imports `render` and `renderCommentBody`; add `import { PURGED_ITEM_LABEL } from '@gisik-nokma/domain';` if it is not imported):

```tsx
describe('19.188 a chip to an erased item', () => {
  it('19.188 renders PURGED_ITEM_LABEL with no link for a purged ticketRef and wikiLink; a live chip keeps its text and link', () => {
    const body = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'ticketRef', attrs: { ticketId: 'gone_ticket', projectId: 'p1', key: 'SHOP-7', title: 'Invoice' } },
            { type: 'text', text: ' / ' },
            { type: 'wikiLink', attrs: { noteId: 'gone_note', title: 'Cold room' } },
            { type: 'text', text: ' / ' },
            { type: 'ticketRef', attrs: { ticketId: 'live_ticket', projectId: 'p1', key: 'SHOP-9', title: 'Fix the freezer' } },
          ],
        },
      ],
    };
    const isPurged = (_kind: 'ticket' | 'note', id: string) => id === 'gone_ticket' || id === 'gone_note';
    const { container } = render(<>{renderCommentBody(body, () => '/w/x/p/p1?ticket=t', isPurged)}</>);
    const purged = [...container.querySelectorAll('.gn-comment__ref--purged')];
    expect(purged.map((el) => [el.tagName, el.textContent])).toEqual([
      ['SPAN', PURGED_ITEM_LABEL],
      ['SPAN', PURGED_ITEM_LABEL],
    ]);
    expect(container.textContent).not.toContain('Invoice');
    expect(container.textContent).not.toContain('Cold room');
    // CONTROL
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.textContent)).toEqual(['SHOP-9 Fix the freezer']);
  });
});
```

Append to `packages/app-core/test/online/online-data-source.test.ts` (it has `recordingFetch`, `:50-63`, and imports `createOnlineDataSource`; add `import { newUlid, PURGED_LOOKUP_MAX_IDS } from '@gisik-nokma/domain';` and `import { MappingError } from '../../src/online/mappers.js';` if absent):

```ts
describe('19.189 purgedAmong — the online twin', () => {
  it('19.189 posts unique ids in chunks of at most 500, maps the answer, and refuses a malformed row', async () => {
    const hit = newUlid();
    const { fetchImpl, calls } = recordingFetch({ '/v1/purged-lookup': { purged: [{ kind: 'ticket', id: hit }] } });
    const source = createOnlineDataSource({ baseUrl: 'http://server.test', fetchImpl });
    const ulids = Array.from({ length: 1001 }, () => newUlid());
    // A duplicate is asked once; a legacy non-ULID chip id is never sent (the route would 400 its chunk).
    const answer = await source.query.purgedAmong([...ulids, ulids[0]!, 'legacy-chip-id']);
    expect(calls.map((call) => JSON.parse(String(call.init?.body)).ids.length)).toEqual([500, 500, 1]);
    expect(calls.flatMap((call) => JSON.parse(String(call.init?.body)).ids as string[])).not.toContain('legacy-chip-id');
    expect(calls.every((call) => call.input === 'http://server.test/v1/purged-lookup')).toBe(true);
    expect(answer).toContainEqual({ kind: 'ticket', id: hit });
    expect(PURGED_LOOKUP_MAX_IDS).toBe(500);

    const bad = recordingFetch({ '/v1/purged-lookup': { purged: [{ kind: 'workflow', id: hit }] } });
    await expect(
      createOnlineDataSource({ baseUrl: '', fetchImpl: bad.fetchImpl }).query.purgedAmong([hit]),
    ).rejects.toBeInstanceOf(MappingError);
    // CONTROL
    const none = recordingFetch({});
    expect(await createOnlineDataSource({ baseUrl: '', fetchImpl: none.fetchImpl }).query.purgedAmong([])).toEqual([]);
    expect(none.calls).toEqual([]);
  });
});
```

Create `packages/app-core/test/replica/replica-purged.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createOutbox, createReplica, createSyncEngine, type SyncTransport } from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { createReplicaDataSource } from '../../src/replica/replica-data-source.js';

const WS = newUlid();
const offline: SyncTransport = {
  bootstrap: () => Promise.reject(new Error('offline')),
  sync: () => Promise.reject(new Error('offline')),
  openStream: () => ({ close: () => undefined }),
  bootstrapTicket: () => Promise.reject(new Error('offline')),
  bootstrapNote: () => Promise.reject(new Error('offline')),
  reconcile: () => Promise.reject(new Error('offline')),
  purgedLookup: () => Promise.reject(new Error('offline')),
  deletedItems: () => Promise.reject(new Error('offline')),
};

describe('19.189 purgedAmong — the replica twin', () => {
  it('19.189 answers from purged_ids, offline; an unrecorded id is absent', async () => {
    const storage = createBetterSqliteStorage();
    const replica = await createReplica({ storage });
    const outbox = createOutbox({ storage, replica });
    const engine = createSyncEngine({ replica, outbox, transport: offline });
    const ds = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });
    const [gone, live] = [newUlid(), newUlid()];
    await replica.eraseEntities([{ kind: 'note', id: gone }]);
    expect(await ds.query.purgedAmong([gone, live])).toEqual([{ kind: 'note', id: gone }]);
    // CONTROL
    expect(await ds.query.purgedAmong([live])).toEqual([]);
  });
});
```

Create `packages/app-core/test/views/use-purged-predicate.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PurgedRef } from '@gisik-nokma/domain';
import { usePurgedPredicate } from '../../src/views/use-purged-predicate.js';

const chip = (ticketId: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'ticketRef', attrs: { ticketId, projectId: 'p', key: 'K-1', title: 't' } }] }],
});

describe('19.190 usePurgedPredicate', () => {
  it('19.190 waits for loaded, asks once per id per session, is ready in the same render without chips, and fails open then retries', async () => {
    const purgedAmong = vi.fn(async (ids: readonly string[]): Promise<PurgedRef[]> =>
      ids.filter((id) => id === 'gone').map((id) => ({ kind: 'ticket', id })),
    );
    const query = { purgedAmong };
    const docs = [chip('gone'), chip('live')];

    // Not loaded yet: never ready, even with nothing to ask about.
    const pending = renderHook(({ loaded }) => usePurgedPredicate(query, [], loaded), { initialProps: { loaded: false } });
    expect(pending.result.current.ready).toBe(false);
    pending.rerender({ loaded: true });
    expect(pending.result.current.ready).toBe(true);
    pending.unmount();

    const first = renderHook(() => usePurgedPredicate(query, docs));
    expect(first.result.current.ready).toBe(false);
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    expect(first.result.current.isPurged('ticket', 'gone')).toBe(true);
    // CONTROL
    expect(first.result.current.isPurged('ticket', 'live')).toBe(false);
    first.unmount();

    const second = renderHook(() => usePurgedPredicate(query, docs));
    expect(second.result.current.ready).toBe(true);
    expect(second.result.current.isPurged('ticket', 'gone')).toBe(true);
    expect(purgedAmong).toHaveBeenCalledTimes(1);

    const plain = renderHook(() => usePurgedPredicate(query, [{ type: 'doc', content: [] }]));
    expect(plain.result.current.ready).toBe(true);
    expect(purgedAmong).toHaveBeenCalledTimes(1);

    const failing = { purgedAmong: vi.fn(async (): Promise<PurgedRef[]> => Promise.reject(new Error('offline'))) };
    const down = renderHook(() => usePurgedPredicate(failing, [chip('x')]));
    await waitFor(() => expect(down.result.current.ready).toBe(true));
    expect(down.result.current.isPurged('ticket', 'x')).toBe(false);
    down.unmount();
    const again = renderHook(() => usePurgedPredicate(failing, [chip('x')]));
    await waitFor(() => expect(failing.purgedAmong).toHaveBeenCalledTimes(2));
    again.unmount();
  });
});
```

Append to `packages/app-core/test/views/ticket-sheet-comments.test.tsx` (it has `source`, `renderSheet`, `TICKET`, `within`, `screen`):

```tsx
describe('19.191 a surviving comment chips a purged note', () => {
  it('19.191 the sheet draws "Deleted item" with no link, leaves the stored body alone, and keeps the live chip', async () => {
    const GONE = '01J9GNOTEGONE0000000000000';
    const surviving: TicketComment = {
      commentId: '01COMMENTTHREE',
      authorId: 'user_anselma',
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'wikiLink', attrs: { noteId: GONE, title: 'Cold room' } },
              { type: 'text', text: ' and ' },
              { type: 'ticketRef', attrs: { ticketId: TICKET, projectId: 'p_other', key: 'SHOP-9', title: 'Fix the freezer' } },
            ],
          },
        ],
      },
      recordedAt: '2026-09-23T09:00:00.000Z',
      files: [],
    };
    const before = JSON.stringify(surviving.body);
    renderSheet(
      source({
        getTicketComments: async () => [surviving],
        purgedAmong: async (ids: readonly string[]) =>
          ids.includes(GONE) ? [{ kind: 'note' as const, id: GONE }] : [],
      }),
      { resolveTicketHref: ({ ticketId }: { ticketId: string }) => `/t/${ticketId}` },
    );
    const section = await screen.findByTestId('sheet-comments');
    expect(await within(section).findByText('Deleted item')).toBeInTheDocument();
    expect(within(section).queryByText('Cold room')).toBeNull();
    expect(JSON.stringify(surviving.body)).toBe(before);
    // CONTROL
    expect(within(section).getByRole('link', { name: 'SHOP-9 Fix the freezer' })).toHaveAttribute('href', `/t/${TICKET}`);
  });
});
```

Append to `apps/web/test/note-comments.test.tsx`:

```tsx
describe('19.191 note comments on the web', () => {
  it('19.191 a chip to a purged note reads "Deleted item" with no link; the live ticket chip keeps its link', async () => {
    const GONE = '01J9GNOTEGONE0000000000000';
    const LIVE_TICKET = '01J9GTKLIVE000000000000000';
    render(
      <Providers
        services={stubServices({
          getNoteComments: async () => [
            comment({
              commentId: 'c1',
              body: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'wikiLink', attrs: { noteId: GONE, title: 'Cold room' } },
                      { type: 'text', text: ' and ' },
                      { type: 'ticketRef', attrs: { ticketId: LIVE_TICKET, projectId: 'p1', key: 'SHOP-9', title: 'Fix the freezer' } },
                    ],
                  },
                ],
              },
            }),
          ],
          purgedAmong: async (ids) => (ids.includes(GONE) ? [{ kind: 'note', id: GONE }] : []),
        })}
      >
        <NoteComments workspaceId={WS} noteId={NOTE} nameOf={nameOf} canComment />
      </Providers>,
    );
    expect(await screen.findByText('Deleted item')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cold room' })).toBeNull();
    // CONTROL
    expect(screen.getByRole('link', { name: 'SHOP-9 Fix the freezer' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to see them fail.** `cd packages/app-core && pnpm exec vitest run --no-file-parallelism test/views/comment-body.test.tsx test/online/online-data-source.test.ts test/replica/replica-purged.test.ts test/views/use-purged-predicate.test.tsx test/views/ticket-sheet-comments.test.tsx > /tmp/trash3-appcore.log 2>&1; tail -20 /tmp/trash3-appcore.log`. Expected: FAIL (compile errors: `purgedAmong` is not on `DataSourceQuery`, and the hook module does not exist).

- [ ] **Step 4: Implement the data.**

`packages/app-core/src/data-source.ts`: add `PurgedRef` to its type import from `@gisik-nokma/domain` (`:1-9`). Add to `DataSourceQuery` after `getDeletedItems(): Promise<DeletedItem[]>;` (`:251`):

```ts
  /**
   * Of `ids`, those a permanent purge erased (trash series Plan 3, D7) — the
   * data behind every "Deleted item" chip. Online: `POST /v1/purged-lookup`,
   * chunked at `PURGED_LOOKUP_MAX_IDS`. Replica: the local `purged_ids`
   * registry, offline. Content-free either way: kinds and ids.
   */
  purgedAmong(ids: readonly string[]): Promise<PurgedRef[]>;
```

`packages/app-core/src/online/mappers.ts`: add `PurgedRef` to its type import from `@gisik-nokma/domain` (`:2-18`), and after `mapDeletedItems`:

```ts
/** `POST /v1/purged-lookup`'s body (trash Plan 3). A row that is not a lifecycle ref is a `MappingError`, never skipped. */
export function mapPurgedLookup(raw: unknown): PurgedRef[] {
  const record = asRecord(raw, 'purged-lookup');
  return asArray(record['purged'], 'purged-lookup.purged').map((entry, index) => {
    const path = `purged-lookup.purged[${index}]`;
    const item = asRecord(entry, path);
    return { kind: asDeletedItemKind(item['kind'], `${path}.kind`), id: asString(item['id'], `${path}.id`) };
  });
}
```

`packages/app-core/src/online/online-data-source.ts`:
- add `mapPurgedLookup` to the `./mappers.js` import (`:5-39`);
- add `import { PURGED_LOOKUP_MAX_IDS, ULID_REGEX, type PurgedRef } from '@gisik-nokma/domain';`;
- add after `getDeletedItems` (`:153`):

```ts
    purgedAmong: async (ids) => {
      // ULIDs only, for the reason `learnPurges` gives: one malformed chip id
      // would 400 its whole chunk, and every chip in the document would fail open.
      const unique = [...new Set(ids)].filter((id) => ULID_REGEX.test(id));
      const found: PurgedRef[] = [];
      for (let i = 0; i < unique.length; i += PURGED_LOOKUP_MAX_IDS) {
        const chunk = unique.slice(i, i + PURGED_LOOKUP_MAX_IDS);
        found.push(...mapPurgedLookup(await http.post('/v1/purged-lookup', { ids: chunk })));
      }
      return found;
    },
```

`packages/app-core/src/replica/replica-data-source.ts`: after `getDeletedItems:` in the query (`:1184`) add `purgedAmong: (ids) => replica.purgedAmong(ids),`.

`packages/app-core/test/helpers/fake-data-source.ts`: after `getDeletedItems: async () => [],` (`:34`) add `purgedAmong: async () => [],`.

`apps/web/test/helpers/stub-services.ts`: after `getDeletedItems: unstubbed('getDeletedItems'),` (`:123`) add:

```ts
    // Every document render asks this in the background (trash Plan 3); "nothing
    // was purged" is exactly what every page saw before the read existed, so a
    // case that does not care is not made to stub it. A case that does, stubs it.
    purgedAmong: async () => [],
```

`apps/server/test/integration/soft-delete-client-surface.test.ts`:
- add `  | 'purgedAmong'` after `  | 'getDeletedItems'` in `AbsenceDecision` (`:500`), moving the `;`;
- add to `DECIDED`, after the `getDeletedItems` row (`:612-625`):

```ts
  purgedAmong: {
    verdict: 'excluded',
    carries: false,
    why: 'trash Plan 3: answers kinds and ids from purged_entities and nothing else — no title, key or body can travel through it, and a soft delete is not a purge',
  },
```

- add to the call map, after `getDeletedItems: () => ds.getDeletedItems(),` (`:755`): `    purgedAmong: () => ds.purgedAmong([childId]),`;
- change `expect(MEMBERS).toHaveLength(25);` (`:825`) to `26` and append to its comment `; 25 until trash Plan 3 added \`purgedAmong\``.

- [ ] **Step 5: Implement the hook** `packages/app-core/src/views/use-purged-predicate.ts`:

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { collectDocReferences, type PurgedPredicate } from '@gisik-nokma/domain';
import type { DataSourceQuery } from '../data-source.js';

export type PurgedLookupQuery = Pick<DataSourceQuery, 'purgedAmong'>;
export type PurgedPredicateState = { isPurged: PurgedPredicate; ready: boolean };

/**
 * Answers per data source for the life of the page (trash Plan 3, D7: "cache
 * per session"). An erasure is permanent, so a cached "purged" never goes
 * stale; a cached "live" may, until the next page load — the same bound every
 * other read on the page has. A FAILED lookup is not cached, so the next mount
 * asks again.
 */
const SESSION = new WeakMap<PurgedLookupQuery, Map<string, boolean>>();

function sessionCacheOf(query: PurgedLookupQuery): Map<string, boolean> {
  let cache = SESSION.get(query);
  if (cache === undefined) {
    cache = new Map();
    SESSION.set(query, cache);
  }
  return cache;
}

function referencedIds(docs: readonly unknown[]): string[] {
  const ids = new Set<string>();
  for (const doc of docs) {
    const refs = collectDocReferences(doc);
    for (const id of refs.ticketIds) ids.add(id);
    for (const id of refs.noteIds) ids.add(id);
  }
  return [...ids].sort();
}

/**
 * The chips' predicate for a set of stored documents (trash series Plan 3).
 *
 * `ready` is the mount signal for an editor (a node view is built once and
 * does not redraw when a predicate changes later):
 * - it is false until the caller says its documents are `loaded` (the sheet's
 *   ticket read may still be in flight: an empty document list then means "not
 *   read yet", not "no chips");
 * - it becomes true in the SAME render in which every referenced id has an
 *   answer (cached this session, or tried by this instance) — so a document
 *   without chips mounts with no extra render;
 * - it is STICKY: a later lookup (a comment added, a document reloaded) never
 *   unmounts an editor.
 * A failed lookup settles as "nothing purged": the stored text is what a page
 * showed before this read existed.
 */
export function usePurgedPredicate(
  query: PurgedLookupQuery,
  docs: readonly unknown[],
  loaded = true,
): PurgedPredicateState {
  const cache = sessionCacheOf(query);
  const ids = referencedIds(docs);
  const key = ids.join(',');
  // Ids this instance has asked about whose answer did not reach the session
  // cache (the lookup failed) — they count as answered for `ready`.
  const attempted = useRef(new Set<string>());
  const readyRef = useRef(false);
  const [answered, setAnswered] = useState(0);

  if (!readyRef.current && loaded && ids.every((id) => cache.has(id) || attempted.current.has(id))) {
    readyRef.current = true;
  }

  useEffect(() => {
    const unknown = key === '' ? [] : key.split(',').filter((id) => !cache.has(id) && !attempted.current.has(id));
    if (unknown.length === 0) return;
    let live = true;
    void query
      .purgedAmong(unknown)
      .then(
        (refs) => {
          const hit = new Set(refs.map((ref) => ref.id));
          for (const id of unknown) cache.set(id, hit.has(id));
        },
        () => {
          // Fail open, uncached: see the docblock.
        },
      )
      .finally(() => {
        for (const id of unknown) attempted.current.add(id);
        if (live) setAnswered((n) => n + 1);
      });
    return () => {
      live = false;
    };
  }, [query, key, cache]);

  // A new function each time an answer lands, so a memoised child re-renders.
  const isPurged = useMemo<PurgedPredicate>(() => {
    void answered;
    return (_kind, id) => cache.get(id) === true;
  }, [cache, answered]);

  return { isPurged, ready: readyRef.current };
}
```

Export it from `packages/app-core/src/index.ts`: `export { usePurgedPredicate, type PurgedLookupQuery, type PurgedPredicateState } from './views/use-purged-predicate.js';`.

- [ ] **Step 6: Implement the comment body and thread.**

`packages/app-core/src/views/comment-body.tsx`:
- add `import { PURGED_ITEM_LABEL, type PurgedPredicate } from '@gisik-nokma/domain';` below line 1;
- give `childrenOf` and `renderNode` (`:164-171`) a trailing parameter `isPurged: PurgedPredicate`, passed through in `childrenOf`'s `renderNode(...)` call and in `renderNode`'s `childrenOf(node, depth, key, ticketHref)` call (`:201`), which becomes `childrenOf(node, depth, key, ticketHref, isPurged)`;
- in the `wikiLink` branch, directly after `noteId` is read (`:261`), add:

```ts
    // Trash Plan 3 (T11): the target was permanently erased. The stored title
    // stays in the stored document; what is DRAWN is the label, with no link.
    if (noteId !== '' && isPurged('note', noteId)) {
      return createElement('span', { className: 'gn-comment__wikilink gn-comment__ref--purged', key }, PURGED_ITEM_LABEL);
    }
```

- in the `ticketRef` branch, directly after `ticketId` is read (`:273`), add:

```ts
    // Asked BEFORE the href resolver: an erased ticket has no page to link to.
    if (ticketId !== '' && isPurged('ticket', ticketId)) {
      return createElement('span', { className: 'gn-comment__ticketref gn-comment__ref--purged', key }, PURGED_ITEM_LABEL);
    }
```

- replace `renderCommentBody` (`:346-348`) with:

```ts
export function renderCommentBody(
  doc: unknown,
  ticketHref: TicketHrefResolver = () => null,
  isPurged: PurgedPredicate = () => false,
): ReactNode {
  return renderNode(doc, 0, 'b', ticketHref, isPurged);
}
```

`packages/app-core/src/views/comments-thread.tsx`:
- add `import type { PurgedPredicate } from '@gisik-nokma/domain';`;
- add to `CommentsThreadProps` after `ticketHref` (`:109`):

```ts
  /** Trash Plan 3: which chips point at erased items (they draw "Deleted item"). */
  isPurged?: PurgedPredicate;
```

- `CommentItem` takes `isPurged?: PurgedPredicate` beside `ticketHref` (`:132-140`). Its `text` line (`:145`) becomes:

```ts
  const text = renderCommentBody(comment.body, ticketHref ?? (() => null), isPurged ?? (() => false));
```

- `CommentsThread` destructures `isPurged` (`:180-186`) and passes `isPurged={isPurged}` to `<CommentItem …>` (`:247`).

`packages/app-core/src/views/ticket-sheet.tsx`:
- add `import { usePurgedPredicate } from './use-purged-predicate.js';`;
- directly above `if (read.error !== null) {` (`:992`, after the `ticketTypes` query at `:988`), add:

```ts
  /**
   * Trash Plan 3 — which chips in this ticket's STORED documents point at
   * permanently erased items. Hooks run before the early returns below, so the
   * documents are read off `read.data` rather than off `descriptionClaim`.
   */
  // Two predicates, one session cache: the description's editor waits only for
  // the description's own chips (Task 8), never for the thread's.
  const purgedDescription = usePurgedPredicate(
    dataSource.query,
    [read.data?.ticket.fields['description']?.value],
    read.data !== null,
  );
  const purgedComments = usePurgedPredicate(
    dataSource.query,
    (comments.data ?? []).map((comment) => comment.body),
  );
```

- on `<CommentsThread` (`:3901-3912`), next to `{...(resolveTicketHref === undefined ? {} : { ticketHref: resolveTicketHref })}`, add `isPurged={purgedComments.isPurged}`.

`apps/web/src/notes/note-comments.tsx`:
- add `usePurgedPredicate` to the app-core import (`:4`);
- after the `comments` query (`:60-63`) add `const purged = usePurgedPredicate(dataSource.query, (comments.data ?? []).map((row) => row.body));`;
- on `<CommentsThread` (`:83-87`) add `isPurged={purged.isPurged}`.

`packages/ui/src/ui.css`, after `.gn-comment__ticketref { overflow-wrap: anywhere; }` (`:7351`):

```css
/* Trash Plan 3 (T11) — a chip whose target was permanently erased. Never a link;
   italic as well as muted, so the ink is not the only difference, and the words
   themselves ("Deleted item") carry the meaning. */
.gn-comment__ref--purged { color: var(--gn-text-muted); font-style: italic; cursor: default; }
```

- [ ] **Step 7: Run to see them pass.**
  1. `pnpm turbo run build`.
  2. The five `packages/app-core` files from Step 3.
  3. `cd apps/web && pnpm exec vitest run --no-file-parallelism test/note-comments.test.tsx > /tmp/trash3-web.log 2>&1; tail -20 /tmp/trash3-web.log`.
  4. `cd apps/server && pnpm exec vitest run --no-file-parallelism test/integration/soft-delete-client-surface.test.ts > /tmp/trash3-server.log 2>&1; tail -20 /tmp/trash3-server.log`.
  5. The whole of `packages/app-core` and `apps/web`, once. `packages/ui/test/token-discipline.test.ts` must be green.

- [ ] **Step 8: The manual.** In `docs/manual.md`, after the paragraph beginning "Typing `:note ` (or `[[`)" (`:1695-1696`), add a blank line and:

```markdown
**A chip or link to something that was permanently deleted reads Deleted item** — no key, no title, and
nothing to open. The comment or note that holds it is not changed: only the chip is drawn differently,
because the thing it pointed at no longer exists.
```

Run `pnpm help:generate` and `pnpm check:help` (nothing is quoted), and commit the regenerated module.

- [ ] **Step 9: Flip 19.188–19.191 to ✅, and append to `Features.md` §16:**

```markdown
- ✅ **"Deleted item" chips in comments** (`packages/app-core/src/views/comment-body.tsx`, `comments-thread.tsx`'s `isPurged`, `views/use-purged-predicate.ts`, `DataSourceQuery.purgedAmong` — online `POST /v1/purged-lookup` chunked at 500, replica `purged_ids`; wired in the ticket sheet's thread and `apps/web/src/notes/note-comments.tsx`; trash Plan 3 Task 7, T11, deviation D7) — a `ticketRef` or `wikiLink` whose target was permanently erased is drawn as **Deleted item**, italic and muted, never a link; the stored comment is not changed. Answers are cached per data source for the page's life; a failed lookup shows the stored text and is asked again on the next mount. Cases 19.188–19.191.
  - ✅ The manual says so (`docs/manual.md`, "Linking to a job or another note").
```

- [ ] **Step 10: Commit** `Trash 3/Task 7: Deleted item chips in comments (19.188-19.191)`. Then the mutations.

---
### Task 8: Deleted item chips in the editor, the webview bridge, and the deferred mount

**Files:**
- Modify:
  - `packages/editor/src/extensions/ticket-ref.ts:1-21,61-63,94-107,109-129`
  - `packages/editor/src/extensions/wiki-link.ts:1-25,94-110,112-142`
  - `packages/editor/src/schema/extensions.ts:53-64,308-327`
  - `packages/editor/src/components/TicketEditor.tsx:30-43,171-192`
  - `packages/editor/src/components/TicketEditorSlot.tsx:110-123,444-456`
  - `packages/editor/src/styles/editor.css` (after `.editor-ticketref`, `:1028`)
  - `packages/editor/src/webview/bridge.ts:9-16,104-112`, `create-editor-bridge.ts:8-11,54-64`, `entry.tsx:20-76`
  - `packages/app-core/src/views/editor-slot.tsx:171-181`
  - `packages/app-core/src/views/ticket-sheet.tsx` (the description `<EditorSlot`, `:3243-3261`)
  - `apps/web/src/notes/note-document.tsx` (`NoteEditorPane`, `:804-902`)
  - `apps/mobile/src/editor/editor-bridge.ts`, `editor-web-view.tsx:21-55,100-103`, `editor-html.generated.ts` (regenerated)
  - `packages/editor/test/ticket-editor-slot.test.tsx:124-125` (the transcription)
  - `apps/web/test/editor-skin-coverage.test.ts:252-265,321-405,443-446`
  - `test-cases/19-trash.md`, `Features.md`
- Create: `packages/editor/test/purged-chips.test.ts`
- Tests appended:
  - `packages/editor/test/webview-bridge.test.ts`
  - `apps/mobile/src/editor/editor-web-view.test.ts`
  - `packages/app-core/test/views/ticket-sheet-comments.test.tsx`

**Interfaces:**
- Consumes: `PurgedPredicate`, `PURGED_ITEM_LABEL` (domain); `usePurgedPredicate` (Task 7).
- Produces:
  - `EditorSchemaOptions.isPurged?: PurgedPredicate`
  - `TicketRefOptions.isPurged: PurgedPredicate` (default `() => false`)
  - `WikiLinkOptions.isPurged?: PurgedPredicate`
  - `TicketEditorProps.isPurged?(kind, id): boolean`
  - `EditorSlotProps.isPurged?: (kind: 'ticket' | 'note', id: string) => boolean`, the same field in all THREE declarations that 9.75 compares
  - `HostToEditorMessage` `loadDoc` gains `purgedIds?: string[]`
  - `EditorBridgeDeps.onPurgedIds?(ids: readonly string[]): void`
  - `loadDocMessage(doc, editable, purgedIds?)` (`apps/mobile/src/editor/editor-bridge.ts`)

Cases (`## 19.37 Deleted item chips in the editor`, 4 ids):

```markdown
## 19.37 Deleted item chips in the editor

- ❌ **19.192 — the editor's `ticketRef` whose target is purged renders `span.editor-ticketref.editor-ticketref--purged` reading `PURGED_ITEM_LABEL` with no href (node view, `renderHTML` and `renderText` alike), and the node's attrs in `getJSON()` still hold the stored key and title;** control: a live chip beside it is `a.editor-ticketref` reading `SHOP-9 Fix the freezer`. Mutation: resolve the href before asking the predicate in the node view.
- ❌ **19.193 — a purged `wikiLink` renders `PURGED_ITEM_LABEL` in `span.editor-wikilink--purged` even when `resolveNoteTitle` answers a title, and a click does not navigate;** control: a live link resolves its title and navigates. Mutation: ask `resolveNoteTitle` first.
- ❌ **19.194 — the webview bridge's `loadDoc` carries `purgedIds` (non-strings dropped), and they are applied BEFORE `setContent`, so a loaded chip to a purged id renders `PURGED_ITEM_LABEL`; the phone builds the message with them;** control: a `loadDoc` without the field parses without the key and renders the stored text. Mutation: call `onPurgedIds` after `setContent`.
- ❌ **19.195 — the ticket sheet mounts its description editor only once the description's chips have an answer, then hands it `isPurged`;** control: a description with no chips mounts on the first render. Mutation: mount the description slot without waiting for `ready`.
```

- [ ] **Step 1: Write the cases.** Confirm the count moved by exactly 4.

- [ ] **Step 2: Write the failing editor test** `packages/editor/test/purged-chips.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { PURGED_ITEM_LABEL } from '@gisik-nokma/domain';
import { createTestEditor } from './helpers/create-editor.js';

/**
 * Trash series Plan 3, Task 8 (T11) — the editor draws a chip to an erased item
 * as "Deleted item" and keeps the stored bytes: the document round-trips
 * unchanged, which is what keeps the note editor's autosave from rewriting it.
 */

const para = (...content: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
const isPurged = (_kind: 'ticket' | 'note', id: string) => id === 'gone';

describe('19.192 a purged ticketRef in the editor', () => {
  it('19.192 draws the label with no href in the node view, HTML and text, and keeps the stored attrs', () => {
    const doc = para(
      { type: 'ticketRef', attrs: { ticketId: 'gone', projectId: 'p1', key: 'SHOP-7', title: 'Invoice' } },
      { type: 'text', text: ' ' },
      { type: 'ticketRef', attrs: { ticketId: 'live', projectId: 'p1', key: 'SHOP-9', title: 'Fix the freezer' } },
    );
    const editor = createTestEditor({ isPurged, resolveTicketHref: () => '/w/x/p/p1?ticket=t' }, doc);
    const purged = editor.view.dom.querySelector('.editor-ticketref--purged');
    expect(purged?.tagName).toBe('SPAN');
    expect(purged?.textContent).toBe(PURGED_ITEM_LABEL);
    expect(purged?.getAttribute('href')).toBeNull();
    expect(purged?.getAttribute('data-ticket-id')).toBe('gone');
    expect(editor.getHTML()).toContain(`>${PURGED_ITEM_LABEL}<`);
    expect(editor.getText()).toContain(PURGED_ITEM_LABEL);
    expect(editor.getText()).not.toContain('Invoice');
    // The stored bytes are untouched (T11): the chip node still carries its key and title.
    const chipNode = (editor.getJSON() as { content: Array<{ content: Array<{ attrs: unknown }> }> }).content[0]!.content[0]!;
    expect(chipNode.attrs).toEqual({ ticketId: 'gone', projectId: 'p1', key: 'SHOP-7', title: 'Invoice' });
    // CONTROL
    const live = editor.view.dom.querySelector('a.editor-ticketref');
    expect(live?.textContent).toBe('SHOP-9 Fix the freezer');
    editor.destroy();
  });
});

describe('19.193 a purged wikiLink in the editor', () => {
  it('19.193 draws the label even when a title resolves, and does not navigate; a live link does', () => {
    const onNavigateNote = vi.fn();
    const doc = para(
      { type: 'wikiLink', attrs: { noteId: 'gone', title: 'Cold room' } },
      { type: 'text', text: ' ' },
      { type: 'wikiLink', attrs: { noteId: 'live', title: 'Old title' } },
    );
    const editor = createTestEditor({ isPurged, resolveNoteTitle: () => 'Resolved title', onNavigateNote }, doc);
    const purged = editor.view.dom.querySelector('.editor-wikilink--purged');
    expect(purged?.tagName).toBe('SPAN');
    expect(purged?.textContent).toBe(PURGED_ITEM_LABEL);
    expect(purged?.classList.contains('editor-wikilink--missing')).toBe(false);
    (purged as HTMLElement).click();
    expect(onNavigateNote).not.toHaveBeenCalled();
    const linkNode = (editor.getJSON() as { content: Array<{ content: Array<{ attrs: unknown }> }> }).content[0]!.content[0]!;
    expect(linkNode.attrs).toEqual({ noteId: 'gone', title: 'Cold room' });
    // CONTROL
    const live = editor.view.dom.querySelector('a.editor-wikilink');
    expect(live?.textContent).toBe('Resolved title');
    (live as HTMLElement).click();
    expect(onNavigateNote).toHaveBeenCalledWith('live');
    editor.destroy();
  });
});
```

Append to `packages/editor/test/webview-bridge.test.ts`:

```ts
describe('19.194 loadDoc carries the purged ids', () => {
  it('19.194 parses purgedIds, drops non-strings, and applies them before setContent', () => {
    const parsed = parseHostMessage({ bridge: 1, kind: 'loadDoc', doc: null, editable: true, purgedIds: ['gone', 7, 'x'] });
    expect(parsed).toEqual({ bridge: 1, kind: 'loadDoc', doc: null, editable: true, purgedIds: ['gone', 'x'] });

    let purged: ReadonlySet<string> = new Set();
    const editor = createTestEditor({ isPurged: (_kind, id) => purged.has(id) });
    const bridge = createEditorBridge({
      editor,
      post: () => undefined,
      onPurgedIds: (ids) => {
        purged = new Set(ids);
      },
    });
    bridge.handleHostMessage({
      bridge: 1,
      kind: 'loadDoc',
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'ticketRef', attrs: { ticketId: 'gone', projectId: 'p', key: 'K-1', title: 'Stored title' } }],
          },
        ],
      },
      editable: true,
      purgedIds: ['gone'],
    });
    expect(editor.view.dom.querySelector('.editor-ticketref--purged')?.textContent).toBe('Deleted item');
    editor.destroy();
    // CONTROL
    expect(parseHostMessage({ bridge: 1, kind: 'loadDoc', doc: null, editable: true })).toEqual({
      bridge: 1,
      kind: 'loadDoc',
      doc: null,
      editable: true,
    });
  });
});
```

Append to `apps/mobile/src/editor/editor-web-view.test.ts` (add `loadDocMessage` to its `./editor-bridge.js` import):

```ts
describe('19.194 the phone sends the purged ids with the document', () => {
  it('19.194 loadDocMessage carries purgedIds when given, and the editor-side parser keeps them', () => {
    const message = loadDocMessage(null, true, ['gone']);
    expect(message).toEqual({ bridge: 1, kind: 'loadDoc', doc: null, editable: true, purgedIds: ['gone'] });
    expect(parseHostMessage(JSON.parse(serializeHostMessage(message)))).toEqual(message);
    // CONTROL
    expect(loadDocMessage(null, false)).toEqual({ bridge: 1, kind: 'loadDoc', doc: null, editable: false });
  });
});
```

Append to `packages/app-core/test/views/ticket-sheet-comments.test.tsx` (add `act` and `ticketStateSeed` to its imports if absent, and `import type { PurgedPredicate, PurgedRef } from '@gisik-nokma/domain';`):

```tsx
describe('19.195 the description editor waits for its chips', () => {
  it('19.195 mounts the description slot only after the lookup answers, with isPurged; a chipless description mounts at once', async () => {
    const GONE = '01J9GTKGONE000000000000000';
    const at = '2026-09-20T10:00:00.000Z';
    const withDescription = (value: unknown): TicketRead => ({
      ...read(),
      ticket: ticketStateSeed({ fields: { description: { value, actorId: 'user_kiro', clientTime: at, serverTime: at } } }),
    });
    const chipDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'ticketRef', attrs: { ticketId: GONE, projectId: 'p1', key: 'SHOP-7', title: 'Invoice' } }],
        },
      ],
    };
    let release: (refs: PurgedRef[]) => void = () => undefined;
    const answer = new Promise<PurgedRef[]>((resolve) => {
      release = resolve;
    });
    const captured: Array<Record<string, unknown>> = [];
    const StubSlot: EditorSlotComponent = (props) => {
      captured.push(props as unknown as Record<string, unknown>);
      return <div data-testid={`stub-${props.mode}-editor`} />;
    };
    renderSheet(source({ getTicket: async () => withDescription(chipDoc), purgedAmong: () => answer }), {
      editorSlot: StubSlot,
    });
    await screen.findByTestId('stub-comment-editor');
    expect(captured.some((props) => props['mode'] === 'description')).toBe(false);

    await act(async () => {
      release([{ kind: 'ticket', id: GONE }]);
    });
    await screen.findByTestId('stub-description-editor');
    const description = captured.filter((props) => props['mode'] === 'description').at(-1);
    expect((description?.['isPurged'] as PurgedPredicate)('ticket', GONE)).toBe(true);
  });

  it('19.195 (control) a description with no chips mounts with the first render', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const StubSlot: EditorSlotComponent = (props) => {
      captured.push(props as unknown as Record<string, unknown>);
      return <div data-testid={`stub-${props.mode}-editor`} />;
    };
    renderSheet(source(), { editorSlot: StubSlot });
    await screen.findByTestId('stub-description-editor');
    expect(captured.find((props) => props['mode'] === 'description')?.['isPurged']).toBeDefined();
  });
});
```

- [ ] **Step 3: Run them to see them fail.**
  - `cd packages/editor && pnpm exec vitest run --no-file-parallelism test/purged-chips.test.ts test/webview-bridge.test.ts > /tmp/trash3-editor.log 2>&1; tail -20 /tmp/trash3-editor.log`. Expected: FAIL. `isPurged` is not an option, so both chips render their stored text, and `purgedIds` is dropped by the parser.
  - The sheet case: `cd packages/app-core && pnpm exec vitest run --no-file-parallelism test/views/ticket-sheet-comments.test.tsx > /tmp/trash3-appcore.log 2>&1; tail -20 /tmp/trash3-appcore.log`. Expected: FAIL, because the description mounts before the answer.
  - The phone case: `cd apps/mobile && pnpm exec vitest run src/editor/editor-web-view.test.ts > /tmp/trash3-mobile.log 2>&1; tail -20 /tmp/trash3-mobile.log`. Expected: FAIL, because `loadDocMessage` is not exported.

- [ ] **Step 4: Implement the nodes.**

`packages/editor/src/extensions/ticket-ref.ts`:
- add `import { PURGED_ITEM_LABEL, type PurgedPredicate } from '@gisik-nokma/domain';`;
- add to `TicketRefOptions` (`:9-21`):

```ts
  /**
   * Trash series Plan 3 (T11): the chip's target was permanently erased. Asked
   * BEFORE `resolveTicketHref` — an erased ticket has no page — and it changes
   * only what is DRAWN: the node's attrs, and so `getJSON()`, keep the stored
   * key and title.
   */
  isPurged: PurgedPredicate;
```

- `addOptions` (`:61-63`) returns `{ queryTickets: async () => [], resolveTicketHref: () => null, isPurged: () => false }`;
- `renderHTML` (`:94-103`) becomes:

```ts
  renderHTML({ node, HTMLAttributes }) {
    const ticketId = String(node.attrs['ticketId']);
    const projectId = String(node.attrs['projectId']);
    if (this.options.isPurged('ticket', ticketId)) {
      return ['span', mergeAttributes(HTMLAttributes, { class: 'editor-ticketref editor-ticketref--purged' }), PURGED_ITEM_LABEL];
    }
    const href = this.options.resolveTicketHref({ ticketId, projectId });
    const text = ticketRefText(node.attrs);
    if (href === null) {
      return ['span', mergeAttributes(HTMLAttributes, { class: 'editor-ticketref' }), text];
    }
    return ['a', mergeAttributes(HTMLAttributes, { class: 'editor-ticketref', href }), text];
  },
```

- `renderText` (`:105-107`) becomes:

```ts
  renderText({ node }) {
    return this.options.isPurged('ticket', String(node.attrs['ticketId'])) ? PURGED_ITEM_LABEL : ticketRefText(node.attrs);
  },
```

- in the node view (`:113-128`), directly after `const title = String(node.attrs['title']);`, add:

```ts
      if (this.options.isPurged('ticket', ticketId)) {
        const dom = document.createElement('span');
        dom.className = 'editor-ticketref editor-ticketref--purged';
        dom.setAttribute('data-ticket-id', ticketId);
        dom.setAttribute('data-project-id', projectId);
        dom.setAttribute('data-ticket-key', key);
        dom.setAttribute('data-ticket-title', title);
        dom.textContent = PURGED_ITEM_LABEL;
        return { dom };
      }
```

`packages/editor/src/extensions/wiki-link.ts`:
- add `import { PURGED_ITEM_LABEL, type PurgedPredicate } from '@gisik-nokma/domain';`;
- add to `WikiLinkOptions` (`:10-25`):

```ts
  /** Trash series Plan 3 (T11): the linked note was permanently erased — asked before `resolveNoteTitle`. */
  isPurged?: PurgedPredicate;
```

- `renderHTML` (`:94-103`) begins:

```ts
  renderHTML({ node, HTMLAttributes }) {
    if (this.options.isPurged?.('note', String(node.attrs['noteId'])) === true) {
      return ['span', mergeAttributes(HTMLAttributes, { class: 'editor-wikilink editor-wikilink--purged' }), PURGED_ITEM_LABEL];
    }
```

  (the existing `return ['a', …]` follows unchanged);
- `renderText` (`:105-110`) returns `PURGED_ITEM_LABEL` first when `this.options.isPurged?.('note', String(node.attrs['noteId'])) === true`;
- in the node view (`:115-141`), directly after `const noteId: string = String(node.attrs['noteId']);`, add:

```ts
      if (this.options.isPurged?.('note', noteId) === true) {
        const dom = document.createElement('span');
        dom.className = 'editor-wikilink editor-wikilink--purged';
        dom.setAttribute('data-note-id', noteId);
        dom.setAttribute('data-note-title', stored);
        dom.textContent = PURGED_ITEM_LABEL;
        return { dom };
      }
```

`packages/editor/src/schema/extensions.ts`:
- add `import type { PurgedPredicate } from '@gisik-nokma/domain';`;
- add to `EditorSchemaOptions`, after `resolveTicketHref` (`:64`):

```ts
  /** Trash series Plan 3 (T11): which chips point at permanently erased items. Absent → none. */
  isPurged?: PurgedPredicate;
```

- `WikiLink.configure({ … })` (`:308-317`) gains `...(options.isPurged === undefined ? {} : { isPurged: options.isPurged }),`;
- `TicketRef.configure({ … })` (`:324-327`) gains `isPurged: options.isPurged ?? (() => false),`.

`packages/editor/src/components/TicketEditor.tsx`:
- add to the props, after `resolveTicketHref?` (`:43`): `isPurged?(kind: 'ticket' | 'note', id: string): boolean;`;
- add to the `buildEditorExtensions({ … })` call, after `resolveTicketHref:` (`:192`):

```ts
        // Trash Plan 3. Read at node-view construction; a host whose answer
        // arrives later remounts the editor (it defers the mount, `usePurgedPredicate`'s `ready`).
        ...(props.isPurged === undefined
          ? {}
          : { isPurged: (kind: 'ticket' | 'note', id: string) => propsRef.current.isPurged?.(kind, id) ?? false }),
```

`packages/editor/src/components/TicketEditorSlot.tsx`:
- add to `EditorSlotProps` after `resolveTicketHref?` (`:123`):

```ts
  // Trash series Plan 3 — the twin of `packages/app-core/src/views/editor-slot.tsx`'s field (9.75 compares names).
  isPurged?: (kind: 'ticket' | 'note', id: string) => boolean;
```

- pass it to `<TicketEditor>` after the `resolveTicketHref` spread (`:454-456`): `{...(props.isPurged === undefined ? {} : { isPurged: props.isPurged })}`.

`packages/app-core/src/views/editor-slot.tsx`: add the same field after `resolveTicketHref?` (`:181`):

```ts
  // Trash series Plan 3 — which chips point at permanently erased items; the twin
  // of `packages/editor/src/components/TicketEditorSlot.tsx`'s field.
  isPurged?: (kind: 'ticket' | 'note', id: string) => boolean;
```

`packages/editor/test/ticket-editor-slot.test.tsx`: add the same line to `AppCoreEditorSlotProps` after `resolveTicketHref?` (`:125`): `  isPurged?: (kind: 'ticket' | 'note', id: string) => boolean;`.

`packages/editor/src/styles/editor.css`, after `.editor-ticketref { overflow-wrap: anywhere; }` (`:1028`):

```css
/* Trash Plan 3 (T11) — a chip whose target was permanently erased. No colour
   (this file's rule); italic and no underline tell it apart, and the words
   ("Deleted item") carry the meaning. `cursor: default`: nothing to open. */
.editor-ticketref--purged,
.editor-wikilink--purged { font-style: italic; text-decoration: none; cursor: default; }
```

- [ ] **Step 5: Implement the webview bridge.**

`packages/editor/src/webview/bridge.ts`:
- the `loadDoc` member (`:10`) becomes `| { bridge: 1; kind: 'loadDoc'; doc: DocJson | null; editable: boolean; purgedIds?: string[] }`;
- its parse arm (`:109-112`) becomes:

```ts
    case 'loadDoc': {
      if (record.doc !== null && !isDocJson(record.doc)) return null;
      if (typeof record.editable !== 'boolean') return null;
      const purgedIds = Array.isArray(record.purgedIds)
        ? record.purgedIds.filter((id): id is string => typeof id === 'string')
        : undefined;
      return {
        bridge: 1,
        kind: 'loadDoc',
        doc: record.doc as DocJson | null,
        editable: record.editable,
        ...(purgedIds === undefined ? {} : { purgedIds }),
      };
    }
```

`packages/editor/src/webview/create-editor-bridge.ts`:
- `EditorBridgeDeps` (`:8-11`) gains:

```ts
  /** Trash Plan 3: the ids a loaded document's erased chips point at, handed over BEFORE its content is set. */
  onPurgedIds?(ids: readonly string[]): void;
```

- in `case 'loadDoc':` (`:54`), as its first line: `deps.onPurgedIds?.(message.purgedIds ?? []);`.

`packages/editor/src/webview/entry.tsx`:
- add `const purgedRef = useRef<ReadonlySet<string>>(new Set());` after `bridgeRef` (`:22`);
- change `createEditorBridge({ editor, post })` (`:27`) to

```ts
    const bridge = createEditorBridge({
      editor,
      post,
      onPurgedIds: (ids) => {
        purgedRef.current = new Set(ids);
      },
    });
```

- give `<TicketEditor` (`:54`) the prop `isPurged={(_kind, id) => purgedRef.current.has(id)}`.

`apps/mobile/src/editor/editor-bridge.ts`: append

```ts
type LoadDocMessage = Extract<HostToEditorMessage, { kind: 'loadDoc' }>;

/** The document the webview opens with, and (trash Plan 3) which of its chips point at erased items. */
export function loadDocMessage(doc: LoadDocMessage['doc'], editable: boolean, purgedIds?: readonly string[]): LoadDocMessage {
  return { bridge: 1, kind: 'loadDoc', doc, editable, ...(purgedIds === undefined ? {} : { purgedIds: [...purgedIds] }) };
}
```

`apps/mobile/src/editor/editor-web-view.tsx`:
- import `loadDocMessage` from `./editor-bridge.js` (`:4`);
- add to `EditorWebViewProps` after `editable?` (`:34`):

```ts
  /** Trash Plan 3: ids of permanently erased items; chips to them in `initialDoc` draw "Deleted item". */
  purgedIds?: readonly string[];
```

- destructure `purgedIds` (`:69`);
- the `ready` arm (`:100-103`) sends `send(loadDocMessage(initialDoc, editable, purgedIds));`;
- add `purgedIds` to that callback's dependency array (`:146`).

The phone's only mount is an empty comment composer (`screens/ticket-screen.tsx:134-142`), so no screen passes `purgedIds` yet (D7).

Regenerate the phone's bundle: `pnpm --filter @gisik-nokma/mobile generate:editor-html`. Commit `apps/mobile/src/editor/editor-html.generated.ts`. `pnpm --filter @gisik-nokma/mobile test` runs `--check` first.

- [ ] **Step 6: Implement the deferred mounts.**

`packages/app-core/src/views/ticket-sheet.tsx`, the description `<EditorSlot mode="description" … />` (`:3243-3261`):
- put `{purgedDescription.ready ? (` on the line before `<EditorSlot`;
- add `isPurged={purgedDescription.isPurged}` after `{...(resolveTicketHref === undefined ? {} : { resolveTicketHref })}`;
- put `) : null}` after the `/>`.

The comment composer's `<EditorSlot mode="comment"` (`:3915-3932`) gains `isPurged={purgedComments.isPurged}` in the same position. It is NOT deferred, because it opens empty (`doc={null}`).

`apps/web/src/notes/note-document.tsx`, inside `NoteEditorPane`:
- add `usePurgedPredicate` to the `@gisik-nokma/app-core` import;
- directly above `const [bannerKept, setBannerKept] = useState(false);` add:

```ts
  // Trash Plan 3 (D7): chips in the stored body that point at erased items. The
  // editor mounts on `ready` — a node view is built once, and the autosave must
  // never see a remount mid-edit, so the wait happens before the first draw.
  const purged = usePurgedPredicate(dataSource.query, [autosave.initialDoc]);
```

- put `{purged.ready ? (` before `<TicketEditorSlot` whose `mode="note"`;
- add `isPurged={purged.isPurged}` after its `resolveTicketHref={ticketRefHrefIn(note.workspaceId)}`;
- put `) : null}` after its `/>`.

- [ ] **Step 7: Keep the web skin coverage true.** In `apps/web/test/editor-skin-coverage.test.ts`:
- add `'editor-ticketref--purged',` and `'editor-wikilink--purged',` to the `measured` list (`:252-265`), in sorted position;
- add to `GALLERY_DOC.content` (`:321-405`), after the `noteId: 'gone'` paragraph (`:378`):

```ts
    { type: 'paragraph', content: [{ type: 'ticketRef', attrs: { ticketId: 'purged', projectId: 'p1', key: 'AB-2', title: 'y' } }] },
    { type: 'paragraph', content: [{ type: 'wikiLink', attrs: { noteId: 'purged', title: 'Erased' } }] },
```

- give the matched-DOM editor's `buildEditorExtensions({ … })` (`:443-446`) the option `isPurged: (_kind, id) => id === 'purged',`.

- [ ] **Step 8: Run to see them pass.**
  1. `pnpm turbo run build`.
  2. The four RED files.
  3. The whole of `packages/editor`: `ticket-editor-slot.test.tsx`'s 9.75 must be green with the three declarations equal.
  4. `apps/web`'s `test/editor-skin-coverage.test.ts test/note-document.test.tsx test/notes-states.test.tsx`.
  5. `packages/app-core`'s `test/views`.
  6. `pnpm --filter @gisik-nokma/mobile test`.

- [ ] **Step 9: Flip 19.192–19.195 to ✅, and append to `Features.md` §16:**

```markdown
- ✅ **"Deleted item" chips in the editor** (`packages/editor/src/extensions/ticket-ref.ts`, `wiki-link.ts`, `schema/extensions.ts`'s `isPurged`, threaded through `TicketEditor`/`TicketEditorSlot`/app-core's `EditorSlot`; the webview bridge's `loadDoc.purgedIds`; trash Plan 3 Task 8, T11, deviation D7) — a `ticketRef` or `wikiLink` whose target was permanently erased draws **Deleted item** (node view, HTML and plain text alike), italic, no link, no navigation, no hover card; its attrs — and so the saved document — are unchanged, so autosave never rewrites a survivor. The ticket sheet's description and the note page's body mount their editor only after their chips have an answer (a node view does not redraw later; a chipless document mounts at once). The phone's webview takes the ids with `loadDoc` and applies them before the content; no phone screen loads a stored document yet. Cases 19.192–19.195.
```

- [ ] **Step 10: Commit** `Trash 3/Task 8: Deleted item chips in the editor and the webview (19.192-19.195)`. Then the mutations. A mutation in `packages/editor` must be rebuilt, AND the phone bundle regenerated, before the app-core, web or mobile suites can see it.

---
### Task 9: Deleted items offline — the replica caches the last online answer (spec §6.3's last line)

**Files:**
- Modify:
  - `packages/app-core/src/replica/replica-data-source.ts:346-353` (`DELETED_ITEMS_ABSENCES` → `DELETED_ITEMS_NOT_CACHED`), `:634` (`REPLICA_GAPS`), `:1184` (`getDeletedItems`)
  - `packages/app-core/src/data-source.ts:245-250` (the docblock)
  - `packages/app-core/src/index.ts`
  - `packages/app-core/test/replica/replica-data-source.test.ts:573-594` (19.071's docblock, name and field assertion)
  - `test-cases/19-trash.md:87` (19.071, amended in place), `Features.md:3424` (a sub-bullet) and §16 EOF
- Create:
  - `packages/app-core/src/deleted-items-from-cache.ts`
  - `packages/app-core/test/replica/replica-deleted-items-cache.test.ts`

**Interfaces:**
- Consumes:
  - `engine.fetchDeletedItems()` and `SyncTransport.deletedItems()` (Task 5);
  - `replica.cacheDeletedItems`, `replica.readDeletedItemsCache`, and the erase's cache strip (Task 3);
  - `mapDeletedItems` (`packages/app-core/src/online/mappers.ts:2904`).
- Produces:
  - `class DeletedItemsFromCache extends Error { readonly items: DeletedItem[]; readonly fetchedAt: string }` (`name === 'DeletedItemsFromCache'`)
  - `cachedDeletedItemsOf(cause: unknown): { items: DeletedItem[]; fetchedAt: string } | null`, the by-NAME reader a view uses without importing the replica
  - `DELETED_ITEMS_NOT_CACHED`, the narrowed `REPLICA_GAPS.getDeletedItems`

**The contract (D9).**
- Online: `getDeletedItems()` resolves with the server's list, and the body is cached with the instant it was read.
- A transport failure with a cache rejects with `DeletedItemsFromCache` carrying the cached items and that instant. A cached list is not the current list, and a resolve would be indistinguishable from one.
- A transport failure with no cache rejects with `ReplicaGapError`, whose absence is now `DELETED_ITEMS_NOT_CACHED`.
- A body the mapper refuses is a `MappingError` and is never cached: a server fault is surfaced, never papered over with a stale list.

Cases (`## 19.38 Deleted items offline`, 2 ids; 19.071 amended):

```markdown
## 19.38 Deleted items offline

- ❌ **19.196 — the replica returns and caches an online `getDeletedItems`; offline it rejects with `DeletedItemsFromCache` holding the cached items and when they were read, and an erase strips an erased item from that cache;** control: back online the answer is a plain list again. Mutation: resolve the cached items instead of rejecting with them.
- ❌ **19.197 — a device that has never cached the list rejects with `ReplicaGapError` naming `DELETED_ITEMS_NOT_CACHED` (the entry `REPLICA_GAPS` lists), and a malformed online body is a `MappingError` that the cache does not mask;** control: a transport failure with a cache is `DeletedItemsFromCache`. Mutation: map inside the transport `try`, so a mapping failure falls back to the cache.
```

- [ ] **Step 1: Write the cases.** Amend 19.071's line (`test-cases/19-trash.md:87`) by appending, keeping its id and ✅:

```markdown
 Amended 2026-09-29 by 19.197 (trash Plan 3): the rejection now happens only while nothing is cached — the absence is `DELETED_ITEMS_NOT_CACHED` ("DeletedItem[] — until one online read is cached on this device"); with a cache the replica rejects with `DeletedItemsFromCache` instead (19.196).
```

Confirm the count moved by exactly 2. An amendment adds no id line.

- [ ] **Step 2: Write the failing test** `packages/app-core/test/replica/replica-deleted-items-cache.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createOutbox, createReplica, createSyncEngine, type SyncTransport } from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { DeletedItemsFromCache, cachedDeletedItemsOf } from '../../src/deleted-items-from-cache.js';
import { MappingError } from '../../src/online/mappers.js';
import {
  DELETED_ITEMS_NOT_CACHED,
  REPLICA_GAPS,
  ReplicaGapError,
  createReplicaDataSource,
} from '../../src/replica/replica-data-source.js';

/**
 * Trash series Plan 3, Task 9 (deviation D9; spec §6.3: "the replica serves it
 * offline"). The replica has no lifecycle state of its own, so it keeps the last
 * ONLINE answer and says, when it serves it, that it is a saved copy.
 */

const WS = newUlid();
const USER = newUlid();

const row = (id: string) => ({
  kind: 'ticket',
  id,
  workspaceId: WS,
  workspaceName: 'Convenience Corner',
  projectId: newUlid(),
  projectName: 'Shop operations',
  label: 'CCSO-3 Renew the lease',
  deletedBy: USER,
  // Plan 4 adds this key and its mapper requires it; an older mapper ignores it.
  deletedByName: 'Kiro',
  deletedAt: '2026-09-28T10:00:00.000Z',
  purgeMarkedAt: null,
  purgeDueAt: null,
  containedCount: 0,
});

async function fixture(serve: () => Promise<unknown>) {
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  const outbox = createOutbox({ storage, replica });
  const transport: SyncTransport = {
    bootstrap: () => Promise.reject(new Error('offline')),
    sync: () => Promise.reject(new Error('offline')),
    openStream: () => ({ close: () => undefined }),
    bootstrapTicket: () => Promise.reject(new Error('offline')),
    bootstrapNote: () => Promise.reject(new Error('offline')),
    reconcile: () => Promise.reject(new Error('offline')),
    purgedLookup: () => Promise.reject(new Error('offline')),
    deletedItems: serve,
  };
  const engine = createSyncEngine({ replica, outbox, transport });
  const ds = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });
  return { ds, replica };
}

describe('19.196 the cached list, offline', () => {
  it('19.196 caches an online answer, rejects offline with it and its instant, and loses an erased item', async () => {
    const [T, other] = [newUlid(), newUlid()];
    let online = true;
    const { ds, replica } = await fixture(async () => {
      if (!online) throw new Error('deleted-items failed: 503');
      return { items: [row(T), row(other)] };
    });

    expect((await ds.query.getDeletedItems()).map((item) => item.id)).toEqual([T, other]);

    online = false;
    const cause = await ds.query.getDeletedItems().catch((e: unknown) => e);
    expect(cause).toBeInstanceOf(DeletedItemsFromCache);
    const cached = cachedDeletedItemsOf(cause);
    expect(cached?.items.map((item) => item.id)).toEqual([T, other]);
    expect(Number.isNaN(Date.parse(cached?.fetchedAt ?? ''))).toBe(false);

    await replica.eraseEntities([{ kind: 'ticket', id: T }]);
    const after = cachedDeletedItemsOf(await ds.query.getDeletedItems().catch((e: unknown) => e));
    expect(after?.items.map((item) => item.id)).toEqual([other]);

    // CONTROL
    online = true;
    await expect(ds.query.getDeletedItems()).resolves.toHaveLength(2);
  });
});

describe('19.197 never cached, and a malformed body', () => {
  it('19.197 a cold device refuses with the narrowed gap; a mapping failure is not masked by the cache', async () => {
    const cold = await fixture(() => Promise.reject(new Error('offline')));
    const gap = await cold.ds.query.getDeletedItems().catch((e: unknown) => e);
    expect(gap).toBeInstanceOf(ReplicaGapError);
    expect((gap as ReplicaGapError).absences).toEqual(DELETED_ITEMS_NOT_CACHED);
    expect(REPLICA_GAPS['getDeletedItems']).toBe(DELETED_ITEMS_NOT_CACHED);

    let answer: () => Promise<unknown> = async () => ({ items: [row(newUlid())] });
    const warm = await fixture(() => answer());
    await warm.ds.query.getDeletedItems();
    answer = async () => ({ items: [{ kind: 'ticket' }] });
    await expect(warm.ds.query.getDeletedItems()).rejects.toBeInstanceOf(MappingError);
    // CONTROL
    answer = () => Promise.reject(new Error('offline'));
    await expect(warm.ds.query.getDeletedItems()).rejects.toBeInstanceOf(DeletedItemsFromCache);
  });
});
```

Update 19.071 in `packages/app-core/test/replica/replica-data-source.test.ts:586-594`:
- rename it `'19.071 getDeletedItems rejects with ReplicaGapError while nothing is cached; control: getTicketTypes on the same replica resolves'`;
- its field assertion becomes `expect(err.absences.map((a) => a.field)).toEqual(['DeletedItem[] — until one online read is cached on this device']);`;
- append to its docblock (`:573-585`): `Amended by trash Plan 3 (19.197): this fixture's transport answers \`deletedItems\` with a failure and nothing is cached, which is now the only way this read refuses.`

- [ ] **Step 3: Run it to see it fail.** `pnpm turbo run build --filter @gisik-nokma/sync-client`, then `cd packages/app-core && pnpm exec vitest run --no-file-parallelism test/replica/replica-deleted-items-cache.test.ts test/replica/replica-data-source.test.ts > /tmp/trash3-appcore.log 2>&1; tail -20 /tmp/trash3-appcore.log`. Expected: FAIL. The module and `DELETED_ITEMS_NOT_CACHED` do not exist, and 19.071 names the old field.

- [ ] **Step 4: Implement.**

Create `packages/app-core/src/deleted-items-from-cache.ts`:

```ts
import type { DeletedItem } from '@gisik-nokma/domain';

/**
 * The Deleted items list as last read ONLINE on this device, served while the
 * device cannot reach the server (trash series Plan 3, D9; spec §6.3: "the
 * replica serves it offline").
 *
 * A REJECTION, not a resolve: `getDeletedItems()` promises the current list,
 * and a saved copy is not that. A view that knows the difference draws the
 * copy with its instant and without its buttons; a caller that does not is
 * told something went wrong rather than shown an old list as a fresh one. It
 * lives in its own module so a view can read it — by NAME, like
 * `ReplicaGapError` — without importing the replica.
 */
export class DeletedItemsFromCache extends Error {
  readonly items: DeletedItem[];
  readonly fetchedAt: string;
  constructor(items: DeletedItem[], fetchedAt: string) {
    super(`Deleted items as read online at ${fetchedAt}; the device cannot reach the server now`);
    this.name = 'DeletedItemsFromCache';
    this.items = items;
    this.fetchedAt = fetchedAt;
  }
}

export function cachedDeletedItemsOf(cause: unknown): { items: DeletedItem[]; fetchedAt: string } | null {
  if (!(cause instanceof Error) || cause.name !== 'DeletedItemsFromCache') return null;
  const candidate = cause as Partial<DeletedItemsFromCache>;
  return Array.isArray(candidate.items) && typeof candidate.fetchedAt === 'string'
    ? { items: candidate.items, fetchedAt: candidate.fetchedAt }
    : null;
}
```

In `packages/app-core/src/replica/replica-data-source.ts`:
1. Add `import { DeletedItemsFromCache } from '../deleted-items-from-cache.js';` and `import { mapDeletedItems } from '../online/mappers.js';`.
2. Replace `DELETED_ITEMS_ABSENCES` (`:346-353`) with:

```ts
/**
 * Trash series Plan 3 (D9) NARROWED this entry rather than deleting it: the
 * replica now serves the last ONLINE answer (as `DeletedItemsFromCache`), but a
 * device that has never read the list online since then still has nothing it
 * may honestly show — `[]` would tell a person nothing was deleted.
 */
export const DELETED_ITEMS_NOT_CACHED: readonly ReplicaAbsence[] = [
  {
    field: 'DeletedItem[] — until one online read is cached on this device',
    because:
      'the local schema holds no lifecycle state (no deleted_at or purge_marked_at on any local table), so the list is never computed here; it is the last GET /v1/me/deleted-items body, kept in deleted_items_cache, and this device has not read it online yet',
    owner: 'Trash series Plan 3 — the cache fills on the first online read of Deleted items on this device',
  },
];
```

3. In `REPLICA_GAPS` (`:634`), `getDeletedItems: DELETED_ITEMS_NOT_CACHED,`.
4. Replace `getDeletedItems: () => Promise.reject(new ReplicaGapError('getDeletedItems', DELETED_ITEMS_ABSENCES)),` (`:1184`) with:

```ts
    getDeletedItems: async () => {
      let body: unknown;
      try {
        body = await engine.fetchDeletedItems();
      } catch {
        const cached = await replica.readDeletedItemsCache();
        if (cached === null) throw new ReplicaGapError('getDeletedItems', DELETED_ITEMS_NOT_CACHED);
        throw new DeletedItemsFromCache(mapDeletedItems(cached.body), cached.fetchedAt);
      }
      // Mapped BEFORE it is cached and OUTSIDE the transport `try`: a body the
      // mapper refuses is a server fault to surface, never a reason to fall
      // back to an old list (19.197).
      const items = mapDeletedItems(body);
      await replica.cacheDeletedItems(body, new Date().toISOString());
      return items;
    },
```

In `packages/app-core/src/data-source.ts`, the `getDeletedItems` docblock's replica sentence (`:248-249`) becomes:

```ts
   * `GET /v1/me/deleted-items`. Replica (trash Plan 3): the online answer when
   * the server can be reached, cached; otherwise it REJECTS — with
   * `DeletedItemsFromCache` (the saved list and when it was read) or, before
   * anything was cached, `ReplicaGapError`. Never a silent `[]`.
```

In `packages/app-core/src/index.ts`, add `export { DeletedItemsFromCache, cachedDeletedItemsOf } from './deleted-items-from-cache.js';`.

- [ ] **Step 5: Run to see it pass.** Run the two files, then all of `packages/app-core/test/replica`. 12.185 (`replica-data-source.test.ts:487-571`) must stay green: `getDeletedItems` is still in its refusal list and in `REPLICA_GAPS`, and the new owner matches `/^(Plan 10|Plan 2 of the notes series|Trash series Plan 3) — /`.

- [ ] **Step 6: Flip 19.196–19.197 to ✅.** Append a sub-bullet under `Features.md:3424` (the `getDeletedItems()` client-contract bullet):

```markdown
  - ⚙️ Amended by trash Plan 3 (Task 9, D9): the replica no longer refuses unconditionally. It returns and caches the online answer (`SyncTransport.deletedItems`, `deleted_items_cache`); offline it rejects with `DeletedItemsFromCache` (the saved list and its instant, `packages/app-core/src/deleted-items-from-cache.ts`); only a device that has never cached it rejects with `ReplicaGapError` (`DELETED_ITEMS_NOT_CACHED`). A malformed online body is a `MappingError`, never masked by the cache. Cases 19.196–19.197; 19.071 amended.
```

and append to §16:

```markdown
- ⚙️ **Deleted items offline** (`packages/app-core/src/replica/replica-data-source.ts`'s `getDeletedItems`, `deleted-items-from-cache.ts`; trash Plan 3 Task 9, spec §6.3's last line, deviation D9) — see the amended `getDeletedItems()` bullet above: the replica keeps the last online list and serves it offline as an explicitly saved copy with its instant; a purge strips erased items from it. Cases 19.196–19.197.
```

- [ ] **Step 7: Commit** `Trash 3/Task 9: the replica serves Deleted items offline from its last online read (19.196-19.197)`. Then the mutations.

---

### Task 10: Account → Deleted items draws the saved copy (Plan 4's section)

Plan 4 landed as #746. `git log origin/release/trash --oneline | grep -c 'Trash 4/'` printed `10` at `265d029f`. The section, its copy and its test below were read there, byte-identical to Plan 4's branch tip `4b742bbc` (`diff` of the three files printed nothing).

**Files:**
- Modify:
  - `packages/app-core/src/trash/copy.ts` (after `DELETED_ITEMS_OFFLINE`, `:94`)
  - `packages/app-core/src/account/deleted-items-section.tsx`:
    - its imports (`:1-32`);
    - `Load` (`:41-45`);
    - `reload` (`:84-92`);
    - the render (`:132-208`);
    - its docblock (`:55-63`).
  - `test-cases/19-trash.md`, `Features.md` (a sub-bullet under Plan 4's "Account → Deleted items" bullet)
- Test appended: `packages/app-core/test/account/deleted-items-section.test.tsx` (Plan 4's; `mount` at `:56-74`, rows at `:24-54`)

**Interfaces:**
- Consumes: `cachedDeletedItemsOf`, `DeletedItemsFromCache` (Task 9); `formatIstInstant` (`packages/domain/src/clock-skew.ts:51`); Plan 4's `DELETED_ITEMS_OFFLINE`, `DELETED_ITEMS_EMPTY`, `UNMARK_BEFORE_RESTORE`, `PURGE_UNDER_WAY`.
- Produces: `deletedItemsAsOf(when: string): string` in `packages/app-core/src/trash/copy.ts`.

**What changes on screen (D9, the planner's direction 2026-09-29).**
- A `DeletedItemsFromCache` answer draws the saved rows with one line above them: "Deleted items as of <IST instant>, saved on this device. Restoring and marking need a connection."
- It draws NO Restore/Mark/Unmark buttons, and no "Unmark it to restore it." reason, because every one of them needs a connection.
- "Deleted items needs a connection." (Plan 4's `DELETED_ITEMS_OFFLINE`) now means exactly "never cached", and stays.
- The section is mounted only by the web's Account page, which is online. No shell mounts it over a replica today (D9).

Cases (`## 19.39 The cached Deleted items view`, 2 ids):

```markdown
## 19.39 The cached Deleted items view

- ❌ **19.198 — a `DeletedItemsFromCache` answer draws the saved rows under `deletedItemsAsOf(<IST instant>)`, with no button in the list and no "Unmark it to restore it.";** control: a `ReplicaGapError` still reads "Deleted items needs a connection." and never "Nothing deleted.". Mutation: render the row actions for a cached answer.
- ❌ **19.199 — `deletedItemsAsOf` is pinned verbatim, and an EMPTY saved list reads "Nothing deleted." together with the as-of line, never the offline line;** control: an empty live list reads "Nothing deleted." with no as-of line. Mutation: treat an empty cached list as offline.
```

- [ ] **Step 1: Write the cases.** Confirm the count moved by exactly 2.

- [ ] **Step 2: Write the failing test.** Append to `packages/app-core/test/account/deleted-items-section.test.tsx`. Add `import { formatIstInstant } from '@gisik-nokma/domain';` and `import { DeletedItemsFromCache } from '../../src/deleted-items-from-cache.js';`, and add `DELETED_ITEMS_OFFLINE`, `UNMARK_BEFORE_RESTORE`, `DELETED_ITEMS_EMPTY` and `deletedItemsAsOf` to its `../../src/trash/copy.js` import (the first three are already there at `:8-16`).

```tsx
describe('19.198–19.199 the saved copy, offline', () => {
  const READ_AT = '2026-09-30T04:30:00.000Z';

  it('19.198 draws the saved rows read-only under the as-of line', async () => {
    mount([new DeletedItemsFromCache([TICKET_ROW, MARKED_NOTE], READ_AT)]);
    expect(await screen.findByText(deletedItemsAsOf(formatIstInstant(READ_AT)))).toBeInTheDocument();
    expect(rowOf('tkt1')).toBeInTheDocument();
    expect(rowOf('note1')).toBeInTheDocument();
    expect(within(screen.getByRole('list')).queryAllByRole('button')).toEqual([]);
    expect(screen.queryByText(UNMARK_BEFORE_RESTORE)).toBeNull();
    expect(screen.queryByText(DELETED_ITEMS_OFFLINE)).toBeNull();
    cleanup();
    // CONTROL
    mount([new ReplicaGapError('getDeletedItems', [])]);
    expect(await screen.findByText(DELETED_ITEMS_OFFLINE)).toBeInTheDocument();
    expect(screen.queryByText(DELETED_ITEMS_EMPTY)).toBeNull();
  });

  it('19.199 pins the copy; an empty saved list is "Nothing deleted." as of then', async () => {
    expect(deletedItemsAsOf('30 Sep 2026, 10:00')).toBe(
      'Deleted items as of 30 Sep 2026, 10:00, saved on this device. Restoring and marking need a connection.',
    );
    mount([new DeletedItemsFromCache([], READ_AT)]);
    expect(await screen.findByText(DELETED_ITEMS_EMPTY)).toBeInTheDocument();
    expect(screen.getByText(deletedItemsAsOf(formatIstInstant(READ_AT)))).toBeInTheDocument();
    expect(screen.queryByText(DELETED_ITEMS_OFFLINE)).toBeNull();
    cleanup();
    // CONTROL
    mount([[]]);
    expect(await screen.findByText(DELETED_ITEMS_EMPTY)).toBeInTheDocument();
    expect(screen.queryByText(/saved on this device/)).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to see it fail.** `cd packages/app-core && pnpm exec vitest run --no-file-parallelism test/account/deleted-items-section.test.tsx > /tmp/trash3-appcore.log 2>&1; tail -20 /tmp/trash3-appcore.log`. Expected: FAIL. `deletedItemsAsOf` is not exported, and a `DeletedItemsFromCache` falls into the section's `failed` arm.

- [ ] **Step 4: Implement.**

`packages/app-core/src/trash/copy.ts`: replace the docblock line above `DELETED_ITEMS_OFFLINE` with `/** D13, narrowed by trash Plan 3: this device has never read the list online (nothing is cached); never shown as "Nothing deleted." */`. After `DELETED_ITEMS_LOADING`, add:

```ts
/** Trash Plan 3 (D9): the saved copy, offline — when it was read, and why nothing can be pressed. */
export function deletedItemsAsOf(when: string): string {
  return `Deleted items as of ${when}, saved on this device. Restoring and marking need a connection.`;
}
```

`packages/app-core/src/account/deleted-items-section.tsx`:
1. Imports: add `formatIstInstant` to the domain import (line 2 becomes `import { formatIstInstant, type DeletedItem, type LifecycleKind } from '@gisik-nokma/domain';`). Add `import { cachedDeletedItemsOf } from '../deleted-items-from-cache.js';`. Add `deletedItemsAsOf` to the `../trash/copy.js` import.
2. `Load` gains the arm `| { at: 'cached'; items: DeletedItem[]; fetchedAt: string }`.
3. `reload`'s rejection handler becomes:

```ts
      (cause: unknown) => {
        // Trash Plan 3 (D9): the saved copy is a list, just not a current one.
        const cached = cachedDeletedItemsOf(cause);
        if (cached !== null) setLoad({ at: 'cached', items: cached.items, fetchedAt: cached.fetchedAt });
        else if (cause instanceof Error && cause.name === 'ReplicaGapError') setLoad({ at: 'offline' });
        else setLoad({ at: 'failed', message: cause instanceof Error ? cause.message : String(cause) });
      },
```

4. Directly after `const at = now();` add:

```ts
  // A live list and a saved copy draw the same rows; only the live one can be acted on.
  const rows = load.at === 'ready' || load.at === 'cached' ? load.items : null;
  const readOnly = load.at === 'cached';
```

5. In the render:
   - after the `offline` line, add `{load.at === 'cached' ? <p className="gn-account__note">{deletedItemsAsOf(formatIstInstant(load.fetchedAt))}</p> : null}`;
   - replace `load.at === 'ready' && load.items.length === 0` with `rows !== null && rows.length === 0`;
   - replace `load.at === 'ready' && load.items.length > 0` with `rows !== null && rows.length > 0`;
   - replace `load.items.map(` with `rows.map(`;
   - the reason line `{marked ? (` becomes `{marked && !readOnly ? (`;
   - wrap the whole `<span className="gn-deleted-items__actions">…</span>` in `{readOnly ? null : ( … )}`.
6. Append to the component's docblock, under "## Three states that are NOT the empty list (D13)": "Trash Plan 3 adds a fourth: the SAVED copy (`DeletedItemsFromCache`), drawn read-only under its instant. `DELETED_ITEMS_OFFLINE` now means only that nothing was ever saved."

- [ ] **Step 5: Run to see it pass**, then the whole of `packages/app-core/test/account` and `apps/web/test/account-page.test.tsx`. `apps/web/test/trash-css.test.tsx` (Plan 4's CSS binding) must stay green: no class was added.

- [ ] **Step 6: The help corpus.** Nothing to change. At `265d029f`, `grep -n "needs a connection" docs/manual.md docs/faq.md` printed nothing. The manual's "Deleted items, and getting things back" (`docs/manual.md:216-231`) describes the web's section, which is online. Re-run the grep; if it now finds a line, append a sentence saying a device that read the list before shows the saved copy, and regenerate.

- [ ] **Step 7: Flip 19.198–19.199 to ✅.** Append under Plan 4's "✅ **Account → Deleted items**" bullet in §16:

```markdown
  - ✅ Offline, a device that has read the list before shows that saved copy — the rows, read-only, under "Deleted items as of <IST instant>, saved on this device. Restoring and marking need a connection." — and "Deleted items needs a connection." only when nothing was ever saved (trash Plan 3 Task 10, D9; cases 19.198–19.199). The section is mounted only by the web's Account page today, which is online.
```

- [ ] **Step 8: Commit** `Trash 3/Task 10: Deleted items draws the saved copy offline (19.198-19.199)`. Then the mutations.

---

## Wrap-up (after Task 10)

- [ ] **Whole-repo run, in order, Node 22.** Paste every summary line with `NODE=`:
  1. `pnpm turbo run build`;
  2. `pnpm turbo run typecheck`;
  3. each suite with the command in Global Constraints — `packages/domain`, `packages/sync-client`, `packages/editor`, `packages/app-core`, `packages/ui`, `apps/web`, `apps/mobile` (`pnpm --filter @gisik-nokma/mobile test`, whose `--check` proves the editor bundle is current), and `apps/server`'s `test/purge test/dual-client test/sync test/integration/soft-delete-client-surface.test.ts test/routes/deleted-items.test.ts`;
  4. `pnpm check:citations`, `pnpm check:help`, `pnpm check:migrations` (no migration is added; it must still pass), `node scripts/check-case-ids.mjs`.
- [ ] **Orphan check.** After any run that returned suspiciously fast, reap ONLY orphaned workers with `ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}'` (repo `CLAUDE.md`). Never `pkill -f vitest`.
- [ ] **Re-read the catalogue.** Read `Features.md` §16's new bullets and the two amended sub-bullets (`getDeletedItems()`, and Plan 4's Account → Deleted items when Task 10 ran) against the code. Then read every `test-cases/19-trash.md` line you flipped, and 19.071's amended sentence.
  - The id count moves by **39**:

    | Task | Cases |
    |---|---|
    | 1 | 4 |
    | 2 | 2 |
    | 3 | 7 |
    | 4 | 2 |
    | 5 | 7 |
    | 6 | 5 |
    | 7 | 4 |
    | 8 | 4 |
    | 9 | 2 |
    | 10 | 2 |

  - `19.200` is reserved, unused, and never back-filled by another lane.
- [ ] **Merge forward before the PR** (Global Constraints, Plan 4):
  1. Record the guard count.
  2. `git fetch origin && git merge origin/release/trash`.
  3. Resolve by keeping the other lane's content first:
     - `test-cases/19-trash.md` holds every other lane's sections before this plan's `## 19.30`+;
     - `Features.md` §16 holds Plan 4's bullets before this plan's;
     - regenerate `content.generated.ts`.
  4. Re-run build, typecheck, the client suites and the checks.
  5. Confirm the guard count is yours plus exactly the id lines the merge brought in.
- [ ] **PR body** (`bash scripts/ctl/ctl pr open task/trash-3-replica-sync --repo <worktree> --base release/trash --title "Trash Plan 3: devices learn a purge, drop what they held, say so, and draw Deleted item" --body FILE`). It lists:
  - every deviation D1–D12, in one line each;
  - 19.071's amendment;
  - each mutation with its red summary line;
  - whether Task 2's RED was `contested` (the predicted D10 defect) or already `refused`;
  - the gaps, each in one line:
    - D7: no desktop document renderer, and no phone screen loads a stored document;
    - D9: no replica-backed shell mounts Deleted items;
    - D11: the hub is not woken by a purge;
  - which local run each summary line comes from.

  CI does not run on this PR. The run you quote is the verification.
