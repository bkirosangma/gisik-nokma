# Reference index and "Linked from" (Knowledge Graph B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In the gisik orchestration, every task is ONE lane session. Follow `gisik-nokma-lanes/STEPS-common-2026-10-03.md`: numbered steps, each ending with a pushed commit + `CHECKPOINT task/<branch> <sha40> step <n>/<N>` + `HANDOFF-<branch>.md`; the sweep list + your own mutation pass before DONE.

**Goal:** every structured reference in a ticket description, a comment or a note body (a `ticketRef` chip, a `wikiLink`, a `mention`) is indexed in `proj_references`, and the ticket sheet, the note document and MCP `get_ticket` / `get_note` show "Linked from": the sources the viewer may see, each with a quoted snippet.

**Architecture:**
- One pure walker in `packages/domain/src/doc-text.ts`, `extractDocReferences`, returns `{ targetKind, targetId, ordinal, snippet }` per reference, in one walk. The existing `collectDocReferences` and `extractMentionedUserIds` keep their contracts; a test proves the three agree.
- One projection, `proj_references`, REPLACES a source's rows on every body change. It reads only `purged_entities`, the `search.ts` pattern, so live equals rebuild, and a purge re-derives survivors through it.
- One read, `listLinkedFrom`, is the only door to the rows. It is a single SQL statement with two `UNION ALL` arms (a ticket parent, a note parent), and each arm applies the shipped visibility predicate. It serves `GET /v1/workspaces/:id/references`, the app's `DataSource.getLinkedFrom`, and MCP.
- One component, `LinkedFromSection` (app-core), is mounted by the ticket sheet and by the web note document.

**Tech stack:** TypeScript, Postgres 16, Fastify 5, React 19, vitest 3 (jsdom for views), `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-10-03-reference-index-design.md`. Read it first; its section numbers (§) are cited below. The series table is in spec A (`2026-10-03-typed-links-design.md`).

## Global Constraints

**Release and identity**
- **Release:** `release/knowledge-graph`, cut from `release/smoothness` after PR #952 lands. Every task branch is cut from `origin/release/knowledge-graph`, and its PR has base `release/knowledge-graph`. Never `main`. Land with `ctl gate <sha> --base release/knowledge-graph` then `ctl land <pr> --base release/knowledge-graph --repo <same checkout>`.
- **Order:** this plan runs AFTER plan A's Task 1 has merged into `release/knowledge-graph`. Plan A's Task 1 CREATES `Features.md` §24 "Knowledge Graph" and `test-cases/27-knowledge-graph.md` with the block table; this plan only ADDS a "B" sub-section to each (Task 1, Step 1). No code in this plan depends on plan A. The ONE shared code file is `packages/app-core/src/views/ticket-sheet.tsx`; this plan anchors its insertion to the existing `<CommentsThread` landmark, not to A's Links section, so the two merges are a union.
- **Case ids:** `27.100`–`27.179` only, in `test-cases/27-knowledge-graph.md` § "27.B". Each task owns the sub-block in its title. Ids are written as id LINES, `- ❌ **27.100 — …**` (`test-cases/18-notes.md:23` is the shape). Test names or comments carry the id. `pnpm check:citations` requires every ✅ id to appear in a test.

**Numbers, copied from the spec or fixed here**
- Snippet: at most **160** characters, the reference wrapped in `[[…]]` (§2.1).
- "Linked from" page size: **20** (§3.2). Past 20, a `Show all N` control loads the rest from the same endpoint.
- Rebuild bar (Task 1, set here, see the Task 1 docblock for why): at the size FLOOR **P = 100 000 body events, Q = 400 000 other events** (planner ruling 2026-10-03: prod size not supplied; a floor comfortably above a 10-day-old small-team prod, as plan E does), `rebuildProjection('proj_references')` **≤ 10 000 ms** and **peak RSS growth ≤ 512 MB**, and the boot backfill's peak RSS growth **≤ 512 MB**. Any one exceeded ⇒ STOP and report.
- **No step waits on the owner's word** (planner ruling 2026-10-03: execution is autonomous, the release to main included). No prod query, no manual prod step: the index fills itself on boot (Task 1 Step 10).
- Migration number: `1791500000000` (the highest on `release/smoothness` is `1791300000000_comment-edit-delete.sql`; `1791400000000` is left for plan A). Re-read `ls apps/server/migrations | tail -3` on `origin/release/knowledge-graph` first; if plan A used a number ≥ `1791500000000`, take the next free one above it. `pnpm check:migrations` decides.

**Decisions this plan takes that the spec did not** (each is reported to the planner)
- **`source_ticket` becomes `source_parent_kind` + `source_parent_id`, both NOT NULL.** `comment.added` is filed against `['ticket', 'note']` (`packages/domain/src/vocabulary.ts:282-284`), so a nullable `source_ticket` cannot hold a note's comment. For a ticket or note source, the parent is the source itself; for a comment, it is the ticket or note the comment is on. The graph's endpoint (spec C) is always `(source_parent_kind, source_parent_id)`.
- **`collectDocReferences` is not changed.** Its shape is pinned by `toEqual` (`packages/domain/test/purge-doc-text.test.ts:59`) and it has three callers (`apps/server/src/purge/purged-lookup.ts:28`, `packages/app-core/src/views/use-purged-predicate.ts:29`, `packages/sync-client/src/replica/replica.ts:1818`). A sibling walker, `extractDocReferences`, is added beside it.
- **One "Linked from" row per SOURCE**, carrying its first reference's snippet (lowest ordinal). The count is distinct visible sources.
- **A source that references itself is not listed** (a note linking to itself, a description chipping its own ticket). A comment on GN-142 that chips GN-142 IS listed: its source is the comment.
- **A reference to a purged item is not indexed**, and a purged chip inside another reference's snippet reads `Deleted item` (`PURGED_ITEM_LABEL`, `packages/domain/src/purge.ts:18`).
- **Ordinals are assigned before the purged filter**, so a rebuild after a purge produces the same `(source, ordinal)` keys as the live path.
- **Literal `[[` / `]]` in a source's own text** are written `[ [` / `] ]` in the snippet, so every snippet holds exactly one marker pair.
- **Placement.** Ticket sheet: between the Notes section and the comment thread (the spec's "at the end of the Details tab, below spec A's Links section" cannot both hold: A puts Links above Notes, and the thread is the tab's last block). Note document: in the document flow between the body and the comments, desktop and phone. The note page's only side column today is the `On this page` TOC aside (`apps/web/src/notes/notes-page.tsx:447`), which is empty on a phone; spec C builds the tabbed side panel and can move the section there.
- **The endpoint serves ticket and note targets only.** A person target is spec C's.

**What must not change**
- No new event types. The vocabulary census is unchanged (§2.3).
- `collectDocReferences`, `extractMentionedUserIds`, `docToPlainText`: same outputs on every existing test.
- The gate's task count: no new package, so it stays at whatever `release/knowledge-graph` has (34, or 36 once G-9's browser package is in). No gate edit.

**Tests and tooling**
- **Node 22** for `pnpm install` in a worktree.
- **Never pipe a test or build run into `head`.** Use `> /tmp/<name>.log 2>&1; tail -N /tmp/<name>.log`.
- **Build before suites.** `pnpm turbo run build --filter=@gisik-nokma/domain --filter=@gisik-nokma/app-core` before any server or web suite: web and server read the packages' `dist`.
- vitest `--maxWorkers=2`.
- **App-core online changes** (Task 3) ⇒ also run the server integration files `apps/server/test/integration/soft-delete-client-surface.test.ts` and `client-contract.test.ts`.
- **Every run quoted in a report is named as LOCAL.** CI runs only on the release→main PR.
- **Controls live in the same `it()`** as the case they guard: every "no row" assertion also proves the same call with one input changed returns the row.
- **Census rule.** No new event type, but the projection's switch has its own census (Task 1, 27.111); a NEW `DataSource` method trips four censuses, all updated in Task 3 (listed there).
- **Features.md and `test-cases/`** change in the same commit as the code.
- **Prose is a claim.** `docs/manual.md:2019` says "There is no list on a note or a ticket showing what else links to it." Task 3 removes it.

## Review Focus

1. **A viewer who can see the target but not the source** (a guest on a ticket shared with them, chipped from a private note or from a ticket they cannot see). They get no row AND a `total` that does not count it, through the endpoint, the app and MCP. Pinned by 27.126 (Task 2) and 27.169 (Task 4).
2. **A purge of a chipped ticket while survivors still quote it.** No `proj_references` row may hold the purged id or its title afterwards, and `verifyProjections` stays clean. Pinned by 27.113 and 27.115 (Task 1), and by 19.134's exact `scan` map staying green.
3. **Literal `[[` or `]]` typed in a description, or a reference longer than the 160-character window.** The UI must still mark exactly the reference, and the snippet must stay ≤ 160. Pinned by 27.102–27.103 (Task 1) and 27.145 (Task 3).
4. **A comment that is edited, then deleted, including while the boot backfill is running.** Edit replaces the comment's rows; delete removes them; a rebuild and the backfill agree; an ingest during the backfill is never lost. Pinned by 27.108, 27.112 and 27.122 (Task 1).
5. **The source in the trash.** A trashed source is hidden and comes back on restore; rows are never deleted by a trash. Pinned by 27.110 (Task 1) and 27.129 (Task 2).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `packages/domain/src/doc-text.ts` | `extractDocReferences`, `DocReference`, `SNIPPET_MAX_CHARS` beside `collectDocReferences` | 1 |
| `packages/domain/test/doc-references.test.ts` (new) | extraction cases | 1 |
| `apps/server/migrations/1791500000000_proj-references.sql` (new) | the table | 1 |
| `apps/server/src/projections/references.ts` (new) | `referencesProjection`, `REFERENCE_BODY_EVENT_TYPES`, `NOT_A_REFERENCE_BODY` | 1 |
| `apps/server/src/projections/index.ts` | register it, appended | 1 |
| `apps/server/src/purge/table-rules.ts`, `erasure.ts`, `survivors.ts` | `rederive` rule, erase by source and target, survivor replay | 1 |
| `apps/server/src/tools/rebuild-projection.ts` | read `DATABASE_CA_CERT` | 1 |
| `apps/server/test/projections/proj-references.test.ts`, `references-census.test.ts`, `references-rebuild-perf.test.ts` (new); `apps/server/test/purge/purge-references.test.ts` (new); `apps/server/test/projection-order.test.ts`, `apps/server/test/tools/rebuild-projection.test.ts` | | 1 |
| `docs/runbook.md` | the deploy step | 1 |
| `packages/domain/src/linked-from.ts` (new), `index.ts` | wire types, `linkedFromSourceTitle`, `splitSnippet`, `parseLinkedFromTarget` | 2 |
| `apps/server/src/read/linked-from.ts` (new) | `listLinkedFrom` | 2 |
| `apps/server/src/read/notes.ts` | export `NOTE_PROJECT_LIVE_WHERE` | 2 |
| `apps/server/src/routes/references.ts` (new), `apps/server/src/app.ts` | the route | 2 |
| `apps/server/test/read/linked-from.test.ts`, `apps/server/test/routes/references.test.ts` (new) | | 2 |
| `packages/app-core/src/data-source.ts`, `online/online-data-source.ts`, `online/mappers.ts`, `replica/replica-data-source.ts` | `getLinkedFrom` | 3 |
| `packages/app-core/src/views/linked-from-section.tsx` (new), `views/ticket-sheet.tsx`, `index.ts` | the section, its mount, the comment hash scroll | 3 |
| `packages/app-core/test/helpers/fake-data-source.ts`, `apps/web/test/helpers/stub-services.ts` | defaults | 3 |
| `apps/server/test/integration/soft-delete-client-surface.test.ts`, `packages/app-core/test/replica/replica-data-source.test.ts` | censuses | 3 |
| `apps/web/src/notes/note-document.tsx` | mount on the note | 3 |
| `packages/ui/src/ui.css` | `.gn-linked-from*`, directly after `.gn-ticket-sheet__note-badges` (`:3473`) | 3 |
| `docs/manual.md` §15 + generated help | the help text | 3 |
| `packages/mcp-server/src/tools/read-tools.ts` (`get_ticket`, `:150`), `note-tools.ts` (`get_note`, `:91`), `reads.ts` | `linkedFrom` | 4 |
| `packages/mcp-server/test/read-tools.test.ts`, `note-tools.test.ts`; `apps/server/test/mcp/mcp-linked-from.test.ts` (new) | | 4 |
| `Features.md` §24 "B", `test-cases/27-knowledge-graph.md` § "27.B", `docs/lanes/task-ledger.tsv` | catalogue | every task its own lines |

**Parallelism:** strictly sequential, T1 → T2 → T3 → T4. Each task consumes the previous one's interface (rows → read → app → MCP).

---

### Task 1: The index: extraction, `proj_references`, purge, the boot backfill, and the rebuild measurement (cases 27.100–27.124)

**Why the backfill and the measurement live here.** The migration creates `proj_references` empty, and nothing rebuilds a projection at deploy: migrations run on container boot (`docs/runbook.md:14-15`), and `rebuild:projection` is a manual tool (`apps/server/src/tools/rebuild-projection.ts`). So this task adds a one-shot BACKFILL that the server runs in the background after `app.listen` on the first boot that finds no marker row.

It does NOT call `rebuildProjection`, which (`apps/server/src/projections/rebuild.ts:12-42`) TRUNCATEs and replays the whole ledger in ONE transaction. That takes an ACCESS EXCLUSIVE lock on the table, so every body-changing ingest would wait for the whole run, and `readLedger` (`apps/server/src/ledger/event-store.ts:154-159`) loads the whole ledger into the serving process's memory (`professional-xs`, `deploy/do/app.yaml:54`).

Instead the backfill walks the ticket and note ENTITIES one short transaction each, under the SAME advisory lock ingest takes for that entity:
- Ingest's transaction runs `lockEntity` (`ingest-service.ts:175`), then `insertEvent` (`:358`), then applies every projection (`:375-376`), then `COMMIT` (`:378`). The lock is `pg_advisory_xact_lock(hashtextextended('kind:id'))` (`event-store.ts:8-10`).
- A comment event is filed on its parent ticket or note, so one entity lock covers the body, every comment on it, and every row whose `source_parent` it is.
- Inside the lock, the backfill deletes the entity's rows and replays `readEntityEvents` (`event-store.ts:132`) through `referencesProjection.apply`. A concurrent ingest on that entity either committed before the lock was granted (READ COMMITTED: the replay's next statement sees it, the `nextSeq` argument at `event-store.ts:15-19`) or waits and applies live on top of the replayed rows. Since every write is "replace this source", the result equals a rebuild either way.
- No event is lost and no ingest waits longer than one entity's replay.

The two bars measure the two paths. `rebuildProjection` stays the recovery and verification path (`rebuild:projection`, `verify-projections`): ≤ 10 s, ≤ 512 MB. The backfill runs inside the serving process: ≤ 512 MB, and its time and longest single-entity transaction are reported. Confirm the instance's RAM with `doctl apps tier instance-size get professional-xs` and say it beside the numbers.

**Files:**
- Create:
  - `packages/domain/test/doc-references.test.ts`
  - `apps/server/migrations/1791500000000_proj-references.sql`
  - `apps/server/src/projections/references.ts`
  - `apps/server/test/projections/proj-references.test.ts`
  - `apps/server/test/projections/references-census.test.ts`
  - `apps/server/test/projections/references-rebuild-perf.test.ts`
  - `apps/server/test/purge/purge-references.test.ts`
  - `apps/server/src/projections/backfill-references.ts`
  - `apps/server/test/projections/references-backfill.test.ts`
- Modify:
  - `packages/domain/src/doc-text.ts` (after `collectDocReferences`, `:149-173`)
  - `apps/server/src/projections/index.ts` (append after `registry.register(ticketCommentsProjection);`, `:198`)
  - `apps/server/test/projection-order.test.ts` (the pinned name list in the `it` at `:75`)
  - `apps/server/src/purge/table-rules.ts` (one entry in `PURGE_TABLE_RULES`, after `proj_note_search`)
  - `apps/server/src/purge/erasure.ts` (`eraseRows`' `statements`, `:77-94`)
  - `apps/server/src/purge/survivors.ts` (`rederiveSurvivors`, `:66-107`)
  - `apps/server/src/tools/rebuild-projection.ts` (`:25`)
  - `apps/server/test/tools/rebuild-projection.test.ts`
  - `apps/server/src/index.ts` (start the backfill after `await app.listen(...)`, `:345`; its `onClose` stop registered BEFORE listen, the snapshot-writer reason at `:269-280`)
  - `docs/runbook.md` ("Deploy (routine)", after the search pre-flight paragraphs, before `## Deploy (first time)`)
  - `Features.md` §24, `test-cases/27-knowledge-graph.md`, `docs/lanes/task-ledger.tsv`

**Interfaces:**
- **Produces:**
  - `extractDocReferences(doc: unknown, options?: DocTextOptions): DocReference[]`, with `DocReference = { targetKind: 'ticket' | 'note' | 'person'; targetId: string; ordinal: number; snippet: string }` and `SNIPPET_MAX_CHARS = 160`, all exported from `@gisik-nokma/domain`.
  - Table `proj_references (workspace_id, source_kind, source_id, source_parent_kind, source_parent_id, target_kind, target_id, ordinal, snippet, updated_by, updated_at, seq)`.
  - `referencesProjection` (name `'proj_references'`), `REFERENCE_BODY_EVENT_TYPES`, `NOT_A_REFERENCE_BODY` from `apps/server/src/projections/references.ts`.
  - Table `projection_backfills (name, completed_at, entities)`; `backfillReferences(pool, deps): Promise<BackfillResult>` and `startReferencesBackfill(pool, deps): { run(): void; stop(): Promise<void> }` from `apps/server/src/projections/backfill-references.ts`.
- **Consumes:** `docToPlainText`'s private `render` and `MAX_DEPTH`, `BLOCK_NODE_TYPES` (same file); `purgedResolverFor` (`apps/server/src/purge/purged-lookup.ts:21`); `isRedactedTicketCreated` (`packages/domain/src/purge.ts:38`); `commentAddedPayload`, `commentEditedPayload`, `commentDeletedPayload` (`packages/domain/src/events/ticket-events.ts:211-220`); `readEntityEvents` (as `survivors.ts:2` imports it).

- [ ] **Step 1: Seed the catalogue regions and the ledger rows**

  1. In `test-cases/27-knowledge-graph.md` (created by plan A's Task 1), append after the file's last line:
     ```markdown
     ## 27.B Reference index and "Linked from" (spec B, `27.100`–`27.179`)

     Plan `docs/superpowers/plans/2026-10-03-reference-index.md`; spec `docs/superpowers/specs/2026-10-03-reference-index-design.md`.
     Blocks: T1 `27.100`–`27.124` · T2 `27.125`–`27.139` · T3 `27.140`–`27.164` · T4 `27.165`–`27.179`.

     <!-- KG-B T1 -->
     <!-- KG-B T2 -->
     <!-- KG-B T3 -->
     <!-- KG-B T4 -->
     ```
     Each task writes its id lines directly below its own anchor.
  2. In `Features.md` §24, append after the section's last line:
     ```markdown
     ### 24.B Reference index and "Linked from" (spec B)

     <!-- KG-B bullets -->
     ```
  3. Add the four ledger rows from this plan's `## Ledger rows` to `docs/lanes/task-ledger.tsv` (append; tab-separated). Run `pnpm check:tasks > /tmp/kgb-tasks.log 2>&1; tail -5 /tmp/kgb-tasks.log`. Expected: PASS.
  4. **The size the measurement uses** is the floor in Global Constraints (P = 100 000, Q = 400 000). There is no prod query (planner ruling 2026-10-03). Step 11 measures at it.

  Commit: `KG-B T1: seed catalogue regions and ledger rows`.

- [ ] **Step 2: Write the failing extraction tests (27.100–27.105)**

  `packages/domain/test/doc-references.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    collectDocReferences,
    extractDocReferences,
    extractMentionedUserIds,
    PURGED_ITEM_LABEL,
    SNIPPET_MAX_CHARS,
  } from '../src/index.js';

  const text = (value: string) => ({ type: 'text', text: value });
  const para = (...inline: unknown[]) => ({ type: 'paragraph', content: inline });
  const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks });
  const chip = (ticketId: string, key: string, title: string) => ({ type: 'ticketRef', attrs: { ticketId, projectId: 'P1', key, title } });
  const link = (noteId: string, title: string) => ({ type: 'wikiLink', attrs: { noteId, title } });
  const mention = (userId: string, label: string) => ({ type: 'mention', attrs: { userId, label } });

  describe('27.100 each reference node gives its kind, id, ordinal and a marked snippet', () => {
    it('27.100 ticketRef, wikiLink and mention are found; a bare key in text is not (control)', () => {
      const refs = extractDocReferences(
        doc(para(text('Blocked on '), chip('T1', 'GN-142', 'Chiller'), text(' until Friday')), para(text('see '), link('N1', 'Phone pass rulings'), text(' and ask '), mention('U1', 'Ama'))),
      );
      expect(refs).toEqual([
        { targetKind: 'ticket', targetId: 'T1', ordinal: 0, snippet: 'Blocked on [[GN-142 Chiller]] until Friday' },
        { targetKind: 'note', targetId: 'N1', ordinal: 1, snippet: 'see [[Phone pass rulings]] and ask @Ama' },
        { targetKind: 'person', targetId: 'U1', ordinal: 2, snippet: 'see Phone pass rulings and ask [[@Ama]]' },
      ]);
      // CONTROL: the same words with no node are text, not a reference.
      expect(extractDocReferences(doc(para(text('Blocked on GN-142 until Friday'))))).toEqual([]);
    });
  });

  describe('27.101 nesting: the snippet is the innermost block, ordinals run in document order', () => {
    it('27.101 a list item and a table cell each give their own paragraph as the snippet', () => {
      const list = { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('see '), link('N1', 'Rulings'))] }] };
      const table = {
        type: 'table',
        content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para(mention('U1', 'Ama'), text(' owns it'))] }, { type: 'tableHeader', content: [para(text('x'))] }] }],
      };
      const refs = extractDocReferences(doc(para(chip('T1', 'GN-1', 'One')), list, table));
      expect(refs.map((r) => [r.ordinal, r.targetId, r.snippet])).toEqual([
        [0, 'T1', '[[GN-1 One]]'],
        [1, 'N1', 'see [[Rulings]]'],
        [2, 'U1', '[[@Ama]] owns it'],
      ]);
    });

    it('27.101 two references in one block: each snippet marks its own and not the other', () => {
      const refs = extractDocReferences(doc(para(chip('A', 'GN-1', 'One'), text(' and '), chip('B', 'GN-2', 'Two'))));
      expect(refs.map((r) => r.snippet)).toEqual(['[[GN-1 One]] and GN-2 Two', 'GN-1 One and [[GN-2 Two]]']);
    });
  });

  describe('27.102 the snippet is at most 160 characters, centred on the reference', () => {
    it('27.102 long text is cut on both sides with an ellipsis; the marker is whole; short text is untouched (control)', () => {
      const long = extractDocReferences(doc(para(text('a'.repeat(300)), chip('T1', 'GN-142', 'Chiller'), text('b'.repeat(300)))))[0]!;
      expect(long.snippet.length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS);
      expect(long.snippet).toContain('[[GN-142 Chiller]]');
      expect(long.snippet.startsWith('…')).toBe(true);
      expect(long.snippet.endsWith('…')).toBe(true);
      const short = extractDocReferences(doc(para(text('a short line '), chip('T1', 'GN-142', 'Chiller'))))[0]!;
      expect(short.snippet).toBe('a short line [[GN-142 Chiller]]');
    });

    it('27.102 a reference longer than the window is cut INSIDE its marker and keeps both brackets', () => {
      const giant = extractDocReferences(doc(para(text('x '), chip('T1', 'GN-1', 'z'.repeat(400)))))[0]!;
      expect(giant.snippet.length).toBe(SNIPPET_MAX_CHARS);
      expect(giant.snippet.startsWith('[[GN-1 zzz')).toBe(true);
      expect(giant.snippet.endsWith('…]]')).toBe(true);
    });
  });

  describe('27.103 literal brackets in the text never forge a second marker', () => {
    it('27.103 "[[" and "]]" typed by a person are spaced apart; exactly one pair remains', () => {
      const r = extractDocReferences(doc(para(text('array[[0]] or [[[x]]] '), chip('T1', 'GN-142', 'Chiller'))))[0]!;
      expect(r.snippet).toBe('array[ [0] ] or [ [ [x] ] ] [[GN-142 Chiller]]');
      expect(r.snippet.split('[[').length - 1).toBe(1);
      expect(r.snippet.split(']]').length - 1).toBe(1);
    });
  });

  describe('27.104 purged chips and agreement with the two existing walkers', () => {
    it('27.104 a purged chip reads Deleted item inside another reference’s snippet', () => {
      const refs = extractDocReferences(doc(para(chip('A', 'GN-1', 'Secret'), text(' blocks '), chip('B', 'GN-2', 'Two'))), {
        isPurged: (kind, id) => kind === 'ticket' && id === 'A',
      });
      expect(refs.map((r) => [r.targetId, r.snippet])).toEqual([
        ['A', `[[${PURGED_ITEM_LABEL}]] blocks GN-2 Two`],
        ['B', `${PURGED_ITEM_LABEL} blocks [[GN-2 Two]]`],
      ]);
      expect(JSON.stringify(refs)).not.toContain('Secret');
    });

    it('27.104 ids agree with collectDocReferences and mentions with extractMentionedUserIds on one fixture', () => {
      const fixture = doc(
        para(chip('T1', 'GN-1', 'One'), mention('U1', 'Ama'), link('N1', 'Rulings')),
        { type: 'bulletList', content: [{ type: 'listItem', content: [para(chip('T1', 'GN-1', 'One'), mention('U2', 'Bo'), mention('U1', 'Ama'))] }] },
      );
      const refs = extractDocReferences(fixture);
      const unique = (kind: string) => [...new Set(refs.filter((r) => r.targetKind === kind).map((r) => r.targetId))];
      expect({ ticketIds: unique('ticket'), noteIds: unique('note') }).toEqual(collectDocReferences(fixture));
      expect(unique('person')).toEqual(extractMentionedUserIds(fixture));
      expect(refs).toHaveLength(6); // repeats are kept: one row per occurrence, ordinals 0–5
    });
  });

  describe('27.105 total: any input gives an answer, never a throw', () => {
    it('27.105 null, a string, an empty id and a cycle give [] or the refs before the cycle', () => {
      expect(extractDocReferences(null)).toEqual([]);
      expect(extractDocReferences('GN-142')).toEqual([]);
      expect(extractDocReferences(doc(para(chip('', 'GN-1', 'One'))))).toEqual([]);
      const cyclic: { type: string; content: unknown[] } = { type: 'paragraph', content: [mention('U1', 'Ama')] };
      cyclic.content.push(cyclic);
      expect(() => extractDocReferences(doc(cyclic))).not.toThrow();
      expect(extractDocReferences(doc(cyclic))[0]?.targetId).toBe('U1');
    });
  });
  ```

  Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/doc-references.test.ts --maxWorkers=2 > /tmp/kgb-t1-red.log 2>&1; tail -20 /tmp/kgb-t1-red.log`
  Expected: FAIL, `extractDocReferences is not a function` (or not exported).

- [ ] **Step 3: Implement `extractDocReferences`**

  In `packages/domain/src/doc-text.ts`, after `collectDocReferences` (`:173`), add:
  ```ts
  /**
   * One structured reference in a document (Knowledge Graph spec B §2.1): a
   * `ticketRef`, a `wikiLink` or a `mention`, in document order. Bare text such
   * as `GN-142` is NOT a reference. `ordinal` counts every reference, repeats
   * included, so it is stable for a body however its targets later fare.
   */
  export type DocReferenceKind = 'ticket' | 'note' | 'person';
  export type DocReference = { targetKind: DocReferenceKind; targetId: string; ordinal: number; snippet: string };

  /** Spec B §2.1: a snippet is at most this many characters. */
  export const SNIPPET_MAX_CHARS = 160;

  // Private-use sentinels for the marker while the text is assembled; stripped from
  // every piece of the person's own text first, so only these two can exist.
  const MARK_OPEN = '';
  const MARK_CLOSE = '';
  const stripSentinels = (value: string): string => value.replace(/[]/g, '');

  /**
   * The blocks a snippet may be: the innermost one holding the reference. A
   * list item and a table cell hold a paragraph, so in the editor's own schema
   * the paragraph wins; the outer types are listed for documents from other
   * producers, where a cell may hold text directly.
   */
  const SNIPPET_BLOCK_TYPES = new Set([
    'paragraph', 'heading', 'codeBlock', 'code_block', 'detailsSummary', 'blockquote',
    'listItem', 'list_item', 'taskItem', 'tableCell', 'tableHeader',
  ]);

  function referenceOf(node: unknown): { kind: DocReferenceKind; id: string } | null {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return null;
    const candidate = node as { type?: unknown; attrs?: unknown };
    const attrs = (typeof candidate.attrs === 'object' && candidate.attrs !== null ? candidate.attrs : {}) as Record<string, unknown>;
    const idOf = (key: string): string | null => {
      const value = attrs[key];
      return typeof value === 'string' && value !== '' ? value : null;
    };
    const kinds: Record<string, [DocReferenceKind, string]> = {
      ticketRef: ['ticket', 'ticketId'],
      wikiLink: ['note', 'noteId'],
      mention: ['person', 'userId'],
    };
    const entry = typeof candidate.type === 'string' ? kinds[candidate.type] : undefined;
    if (entry === undefined) return null;
    const id = idOf(entry[1]);
    return id === null ? null : { kind: entry[0], id };
  }

  export function extractDocReferences(doc: unknown, options: DocTextOptions = {}): DocReference[] {
    const found: Array<{ kind: DocReferenceKind; id: string; block: unknown; indexInBlock: number }> = [];
    const perBlock = new Map<unknown, number>();
    const walk = (node: unknown, depth: number, block: unknown): void => {
      if (depth > MAX_DEPTH) return;
      if (Array.isArray(node)) {
        for (const child of node) walk(child, depth, block);
        return;
      }
      if (node === null || typeof node !== 'object') return;
      const ref = referenceOf(node);
      if (ref !== null) {
        const indexInBlock = perBlock.get(block) ?? 0;
        perBlock.set(block, indexInBlock + 1);
        found.push({ ...ref, block, indexInBlock });
        return;
      }
      const candidate = node as { type?: unknown; content?: unknown };
      const here = typeof candidate.type === 'string' && SNIPPET_BLOCK_TYPES.has(candidate.type) ? node : block;
      if (candidate.content !== undefined) walk(candidate.content, depth + 1, here);
    };
    walk(doc, 0, doc);
    return found.map((ref, ordinal) => ({
      targetKind: ref.kind,
      targetId: ref.id,
      ordinal,
      snippet: snippetFor(ref.block, ref.indexInBlock, options),
    }));
  }

  /** The block's text with its `target`-th own reference wrapped in the sentinels. */
  function renderMarked(
    node: unknown,
    depth: number,
    options: DocTextOptions,
    target: number,
    counter: { seen: number },
    counting: boolean,
    isRoot: boolean,
  ): string {
    if (depth > MAX_DEPTH) return '';
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return '';
    const candidate = node as { type?: unknown; text?: unknown; content?: unknown };
    if (referenceOf(node) !== null) {
      const own = stripSentinels(render(node, depth, options));
      if (!counting) return own;
      const mine = counter.seen === target;
      counter.seen += 1;
      return mine ? `${MARK_OPEN}${own}${MARK_CLOSE}` : own;
    }
    if (candidate.type === 'ticketRef' || candidate.type === 'wikiLink' || candidate.type === 'mention') {
      return stripSentinels(render(node, depth, options)); // a chip with no id: its text, never a marker
    }
    if (candidate.type === 'text') return typeof candidate.text === 'string' ? stripSentinels(candidate.text) : '';
    if (candidate.type === 'hardBreak' || candidate.type === 'hard_break') return ' ';
    // A reference inside a NESTED snippet block belongs to that block, not to this one.
    const nested = !isRoot && typeof candidate.type === 'string' && SNIPPET_BLOCK_TYPES.has(candidate.type);
    const children = Array.isArray(candidate.content)
      ? candidate.content.map((child) => renderMarked(child, depth + 1, options, target, counter, counting && !nested, false)).join('')
      : '';
    return typeof candidate.type === 'string' && BLOCK_NODE_TYPES.has(candidate.type) ? `${children} ` : children;
  }

  function snippetFor(block: unknown, indexInBlock: number, options: DocTextOptions): string {
    const flat = renderMarked(block, 0, options, indexInBlock, { seen: 0 }, true, true)
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\[(?=\[)/g, '[ ')
      .replace(/\](?=\])/g, '] ');
    const open = flat.indexOf(MARK_OPEN);
    const close = flat.indexOf(MARK_CLOSE);
    if (open < 0 || close < open) return flat.slice(0, SNIPPET_MAX_CHARS);
    const marked = `${flat.slice(0, open)}[[${flat.slice(open + 1, close)}]]${flat.slice(close + 1)}`;
    return windowAround(marked, open, close + 3);
  }

  /** At most SNIPPET_MAX_CHARS, centred on [start, end), an ellipsis where text was cut. */
  function windowAround(text: string, start: number, end: number): string {
    const max = SNIPPET_MAX_CHARS;
    if (text.length <= max) return text;
    const markLength = end - start;
    if (markLength + 2 > max) return `${text.slice(start, start + max - 3)}…]]`;
    const room = max - markLength;
    let from = Math.max(0, start - Math.floor(room / 2));
    const to = Math.min(text.length, from + max);
    from = Math.max(0, to - max);
    let out = text.slice(from, to);
    if (from > 0) out = `…${out.slice(1)}`;
    if (to < text.length) out = `${out.slice(0, -1)}…`;
    return out;
  }
  ```
  `doc-text.ts` is already re-exported by `packages/domain/src/index.ts:21`, so nothing else is needed for the export.

  Run the Step 2 command. Expected: PASS, 27.100–27.105. Then run the whole domain suite (`pnpm --filter @gisik-nokma/domain exec vitest run --maxWorkers=2 > /tmp/kgb-t1-domain.log 2>&1; tail -8 /tmp/kgb-t1-domain.log`). Expected: green, including `purge-doc-text.test.ts` (19.129) and `doc-mentions.test.ts` unchanged.

  Commit: `KG-B T1: extractDocReferences (27.100–27.105)`.

- [ ] **Step 4: The migration**

  `apps/server/migrations/1791500000000_proj-references.sql` (copy the header style of `1790000000000_proj-ticket-comments.sql`):
  ```sql
  -- Up Migration

  -- Projection: one row per structured reference in a ticket description, a
  -- comment or a note body (Knowledge Graph spec B §2.1). Rebuildable from the
  -- ledger; written only by `src/projections/references.ts`.
  --
  -- `source_parent_kind` / `source_parent_id` replace the spec's `source_ticket`:
  -- a comment may be filed against a ticket OR a note (`vocabulary.ts`,
  -- `entityKind: ['ticket', 'note']`), so the parent is a kind and an id. For a
  -- ticket or note source the parent is the source itself.
  --
  -- text / int / timestamptz / bigint only, no json: `tools/verify-projections.ts`
  -- diffs a rebuild against the live table with EXCEPT.

  CREATE TABLE proj_references (
    workspace_id        text NOT NULL,
    source_kind         text NOT NULL CHECK (source_kind IN ('ticket', 'comment', 'note')),
    source_id           text NOT NULL,
    source_parent_kind  text NOT NULL CHECK (source_parent_kind IN ('ticket', 'note')),
    source_parent_id    text NOT NULL,
    target_kind         text NOT NULL CHECK (target_kind IN ('ticket', 'note', 'person')),
    target_id           text NOT NULL,
    ordinal             int  NOT NULL,
    snippet             text NOT NULL,
    updated_by          text NOT NULL,
    updated_at          timestamptz NOT NULL,
    seq                 bigint NOT NULL,
    PRIMARY KEY (source_kind, source_id, ordinal)
  );
  CREATE INDEX proj_references_target_idx ON proj_references (target_kind, target_id);
  CREATE INDEX proj_references_parent_idx ON proj_references (source_parent_kind, source_parent_id);
  CREATE INDEX proj_references_ws_idx ON proj_references (workspace_id);

  COMMENT ON TABLE proj_references IS 'Knowledge Graph spec B: every ticketRef, wikiLink and mention in a description, comment or note body. A source''s rows are REPLACED on every body change. A reference to a purged item is not indexed. Trash keeps rows; reads hide them. Read only through read/linked-from.ts.';
  COMMENT ON COLUMN proj_references.snippet IS 'At most 160 characters of the enclosing block, the reference wrapped in [[…]] exactly once; a literal [[ or ]] in the person''s text is written [ [ / ] ].';
  COMMENT ON COLUMN proj_references.seq IS 'The workspace_seq of the event that last wrote this source''s body: the read''s newest-first order and its cursor.';

  -- One row per one-shot projection backfill that has COMPLETED (Knowledge Graph B:
  -- `src/projections/backfill-references.ts`). No row = never completed: the server
  -- runs it after boot. Not a projection (never reset, never rebuilt).
  CREATE TABLE projection_backfills (
    name          text PRIMARY KEY,
    completed_at  timestamptz NOT NULL,
    entities      bigint NOT NULL
  );

  -- Down Migration

  DROP TABLE projection_backfills;
  DROP TABLE proj_references;
  ```
  Run: `pnpm check:migrations > /tmp/kgb-mig.log 2>&1; tail -5 /tmp/kgb-mig.log`. Expected: PASS.

- [ ] **Step 5: Write the failing projection tests (27.106–27.113)**

  `apps/server/test/projections/proj-references.test.ts` (fixture discipline copied from `test/projections/proj-notes.test.ts:10-44`: one fresh database, `resetEntitySeqs()` once, fixtures per case):
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
  import { buildProjectionRegistry } from '../../src/projections/index.js';
  import { rebuildProjection } from '../../src/projections/rebuild.js';
  import { referencesProjection } from '../../src/projections/references.js';
  import { verifyProjections } from '../../src/tools/verify-projections.js';
  import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
    resetEntitySeqs();
  });
  afterAll(async () => {
    await db.drop();
  });

  const WS = newUlid();
  const ACTOR = newUlid();
  const text = (value: string) => ({ type: 'text', text: value });
  const body = (...inline: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: inline }] });
  const chip = (ticketId: string) => ({ type: 'ticketRef', attrs: { ticketId, projectId: 'P1', key: 'GN-1', title: 'Chiller' } });
  const link = (noteId: string) => ({ type: 'wikiLink', attrs: { noteId, title: 'Rulings' } });
  const ev = (kind: 'ticket' | 'note', id: string, type: string, payload: unknown, extra: Partial<LedgerEvent> = {}) =>
    makeCommitted({ workspaceId: WS, actorId: ACTOR, entity: { kind, id }, type, payload, ...extra });

  type Row = { source_kind: string; source_id: string; source_parent_kind: string; source_parent_id: string; target_kind: string; target_id: string; ordinal: number; snippet: string };
  async function rowsOf(parentId: string): Promise<Row[]> {
    const { rows } = await db.pool.query<Row>(
      `SELECT source_kind, source_id, source_parent_kind, source_parent_id, target_kind, target_id, ordinal, snippet
         FROM proj_references WHERE source_parent_id = $1 ORDER BY source_kind, source_id, ordinal`,
      [parentId],
    );
    return rows;
  }

  describe('27.106 a description is indexed at birth and REPLACED by every description claim', () => {
    it('27.106 created → field_set → the same field_set again → null; never more rows than the body holds', async () => {
      const T = newUlid(), A = newUlid(), B = newUlid();
      await applyCommitted(db.pool, [ev('ticket', T, 'ticket.created', { typeId: 'task', projectId: 'P1', parentId: null, title: 't', description: body(chip(A)) })]);
      expect((await rowsOf(T)).map((r) => [r.source_kind, r.target_id])).toEqual([['ticket', A]]);
      const next = body(chip(B), text(' and '), chip(A));
      await applyCommitted(db.pool, [ev('ticket', T, 'ticket.field_set', { fieldId: 'description', value: next })]);
      await applyCommitted(db.pool, [ev('ticket', T, 'ticket.field_set', { fieldId: 'description', value: next })]); // CONTROL: same body twice
      expect((await rowsOf(T)).map((r) => [r.ordinal, r.target_id])).toEqual([[0, B], [1, A]]);
      await applyCommitted(db.pool, [ev('ticket', T, 'ticket.field_set', { fieldId: 'title', value: 'renamed' })]); // not a body
      expect(await rowsOf(T)).toHaveLength(2);
      await applyCommitted(db.pool, [ev('ticket', T, 'ticket.field_set', { fieldId: 'description', value: null })]);
      expect(await rowsOf(T)).toEqual([]);
    });
  });

  describe('27.107 a note body is indexed at birth and by note.body_set', () => {
    it('27.107 created with a body, then body_set; the source and the parent are the note', async () => {
      const N = newUlid(), T = newUlid();
      await applyCommitted(db.pool, [ev('note', N, 'note.created', { title: 'n', homeProjectId: '', scope: { mode: 'workspace' }, body: body(chip(T)) })]);
      expect((await rowsOf(N)).map((r) => [r.source_kind, r.source_id, r.source_parent_kind, r.target_kind])).toEqual([['note', N, 'note', 'ticket']]);
      await applyCommitted(db.pool, [ev('note', N, 'note.body_set', { body: body(text('nothing')) })]);
      expect(await rowsOf(N)).toEqual([]);
    });
  });

  describe('27.108 comments on a ticket and on a note: added, edited, deleted', () => {
    it('27.108 the comment is the source, its ticket or note the parent; edit replaces, delete removes', async () => {
      const T = newUlid(), N = newUlid(), X = newUlid(), Y = newUlid();
      const onTicket = ev('ticket', T, 'comment.added', { body: body(link(X)) });
      const onNote = ev('note', N, 'comment.added', { body: body(chip(X)) });
      await applyCommitted(db.pool, [onTicket, onNote]);
      expect((await rowsOf(T)).map((r) => [r.source_kind, r.source_id, r.source_parent_kind])).toEqual([['comment', onTicket.id, 'ticket']]);
      expect((await rowsOf(N)).map((r) => [r.source_kind, r.source_id, r.source_parent_kind])).toEqual([['comment', onNote.id, 'note']]);
      await applyCommitted(db.pool, [ev('ticket', T, 'comment.edited', { commentId: onTicket.id, body: body(link(Y)) })]);
      expect((await rowsOf(T)).map((r) => r.target_id)).toEqual([Y]);
      await applyCommitted(db.pool, [ev('ticket', T, 'comment.deleted', { commentId: onTicket.id })]);
      expect(await rowsOf(T)).toEqual([]);
      expect(await rowsOf(N)).toHaveLength(1); // CONTROL: the other parent's comment is untouched
    });
  });

  describe('27.109 a creation with no description, a redacted creation and a non-body event write nothing', () => {
    it('27.109 ticket.created with no description: no rows; with one: a row (control)', async () => {
      const T = newUlid(), U = newUlid();
      await applyCommitted(db.pool, [
        ev('ticket', T, 'ticket.created', { typeId: 'task', projectId: 'P1', parentId: null, title: 't' }),
        ev('ticket', U, 'ticket.created', { typeId: 'task', projectId: 'P1', parentId: null, title: 'u', description: body(chip(T)) }),
      ]);
      expect(await rowsOf(T)).toEqual([]);
      expect(await rowsOf(U)).toHaveLength(1);
    });

    it('27.109 a REDACTED ticket.created and a transition comment are not bodies (apply called directly: the redaction trigger admits only purge_ledger)', async () => {
      const R = newUlid(), X = newUlid();
      const client = await db.pool.connect();
      try {
        // A redacted creation that still carried a description key would be a forged row; apply must ask isRedactedTicketCreated first.
        await referencesProjection.apply(ev('ticket', R, 'ticket.created', { projectId: 'P1', purged: true, description: body(chip(X)) }), client);
        // `ticket.transitioned`'s comment: copy the payload shape from `ticketTransitionedPayload` in
        // packages/domain/src/events/ticket-events.ts (its comment is plain `{ text }`), with chip-like text.
        await referencesProjection.apply(ev('ticket', R, 'ticket.transitioned', { toStateId: 's2', comment: { text: `see GN-1 ${X}` } }), client);
        expect(await rowsOf(R)).toEqual([]);
        // CONTROL: the same direct call with a real description writes a row.
        await referencesProjection.apply(ev('ticket', R, 'ticket.field_set', { fieldId: 'description', value: body(chip(X)) }), client);
        expect(await rowsOf(R)).toHaveLength(1);
      } finally {
        // These rows have no ledger event: remove them, or 27.112's rebuild-equals-live comparison fails on them.
        await client.query('DELETE FROM proj_references WHERE source_id = $1', [R]);
        client.release();
      }
    });
  });

  describe('27.110 trash keeps the rows; restore changes nothing', () => {
    it('27.110 ticket.deleted / note.deleted and their restores leave every row in place', async () => {
      const T = newUlid(), N = newUlid(), X = newUlid();
      await applyCommitted(db.pool, [
        ev('ticket', T, 'ticket.created', { typeId: 'task', projectId: 'P1', parentId: null, title: 't', description: body(chip(X)) }),
        ev('note', N, 'note.created', { title: 'n', homeProjectId: '', scope: { mode: 'workspace' }, body: body(chip(X)) }),
      ]);
      await applyCommitted(db.pool, [ev('ticket', T, 'ticket.deleted', {}), ev('note', N, 'note.deleted', {})]);
      expect([(await rowsOf(T)).length, (await rowsOf(N)).length]).toEqual([1, 1]);
      await applyCommitted(db.pool, [ev('ticket', T, 'ticket.restored', {}), ev('note', N, 'note.restored', {})]);
      expect([(await rowsOf(T)).length, (await rowsOf(N)).length]).toEqual([1, 1]);
    });
  });

  describe('27.112 the rebuild equals the live table', () => {
    it('27.112 rebuildProjection reproduces every row, and verifyProjections is clean', async () => {
      const before = (await db.pool.query('SELECT * FROM proj_references ORDER BY source_kind, source_id, ordinal')).rows;
      expect(before.length).toBeGreaterThan(0); // CONTROL: the cases above wrote rows
      await rebuildProjection('proj_references', { pool: db.pool, projections: buildProjectionRegistry() });
      const after = (await db.pool.query('SELECT * FROM proj_references ORDER BY source_kind, source_id, ordinal')).rows;
      expect(after).toEqual(before);
      expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
    });
  });
  ```
  The `ticket.created` and `note.created` payloads in this file are written from memory: copy the real required fields from `ticketCreatedPayload` / `noteCreatedPayload` in `packages/domain/src/events/` before the first run.
  27.109's `ticket.created` events must be accepted by `applyCommitted`'s projections: `proj_tickets` folds `ticket.created` through the engine with `typeId: 'task'`. If `proj_tickets` refuses an unknown type in a bare database, seed the workflow and type exactly as `test/helpers/notes-fixture.ts:169-195` does (copy those two `makeCommitted` calls into a `beforeAll`) and say so in the commit.

  `apps/server/test/projections/references-census.test.ts` (DB-free):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { COMMENT_EVENT_TYPES, CONTEST_EVENT_TYPES, NOTE_EVENT_TYPES, TICKET_EVENT_TYPES } from '@gisik-nokma/domain';
  import { NOT_A_REFERENCE_BODY, REFERENCE_BODY_EVENT_TYPES } from '../../src/projections/references.js';

  /** Every event type filed on a ticket or a note stream. A type added to any of these lists must be classified below. */
  const UNIVERSE = [
    ...new Set<string>([
      ...TICKET_EVENT_TYPES, ...NOTE_EVENT_TYPES, ...COMMENT_EVENT_TYPES, ...CONTEST_EVENT_TYPES,
      'visibility.set', 'purge.marked', 'purge.unmarked', 'purge.completed',
    ]),
  ].sort();

  function unclassified(universe: readonly string[]): string[] {
    const handled = new Set<string>([...REFERENCE_BODY_EVENT_TYPES, ...Object.keys(NOT_A_REFERENCE_BODY)]);
    return universe.filter((type) => !handled.has(type));
  }

  describe('27.111 the projection’s own census: every ticket/note/comment type is a body or says why not', () => {
    it('27.111 nothing is unclassified, and an unknown type is reported (control)', () => {
      expect(UNIVERSE.length).toBeGreaterThan(20); // non-empty universe
      expect(unclassified(UNIVERSE)).toEqual([]);
      expect(unclassified([...UNIVERSE, 'ticket.link_added_test'])).toEqual(['ticket.link_added_test']);
      for (const type of REFERENCE_BODY_EVENT_TYPES) expect(NOT_A_REFERENCE_BODY, type).not.toHaveProperty(type);
    });
  });
  ```
  **If plan A's events are already on the branch** (`ticket.link_added`, `ticket.link_removed` in `TICKET_EVENT_TYPES`), 27.111 goes red on them first: classify both in `NOT_A_REFERENCE_BODY` ("a typed link, not a document; spec A's own table holds it").

  Append to `apps/server/test/projection-order.test.ts`'s pinned list (the array in the `it` at `:75`) `'proj_references'` as its LAST element, and add `27.112` to that `it`'s docblock list.

  Run: `pnpm turbo run build --filter=@gisik-nokma/domain > /tmp/kgb-build.log 2>&1; tail -3 /tmp/kgb-build.log; pnpm --filter @gisik-nokma/server exec vitest run test/projections/proj-references.test.ts test/projections/references-census.test.ts test/projection-order.test.ts --maxWorkers=2 > /tmp/kgb-t1-proj-red.log 2>&1; tail -30 /tmp/kgb-t1-proj-red.log`
  Expected: FAIL (`relation "proj_references"` exists after migrate, but the module `references.js` does not; the order list has no `proj_references`).

- [ ] **Step 6: Implement the projection and register it**

  `apps/server/src/projections/references.ts` (sibling copied: `search.ts` for the `purgedResolverFor` read, `ticket-comments.ts` for the comment payload parsing):
  ```ts
  import type { PoolClient } from 'pg';
  import {
    commentAddedPayload,
    commentDeletedPayload,
    commentEditedPayload,
    extractDocReferences,
    isRedactedTicketCreated,
    type LedgerEvent,
  } from '@gisik-nokma/domain';
  import { purgedResolverFor } from '../purge/purged-lookup.js';
  import type { Projection } from './registry.js';

  /**
   * `proj_references` (Knowledge Graph spec B §2.1).
   *
   * ## Replace, never add
   * Every body event DELETEs the source's rows and inserts the body's references
   * afresh, so the same body twice is the same rows, and an edit leaves nothing
   * of the old text behind.
   *
   * ## Determinism
   * Each event touches only its own source's rows, read and written by that
   * source's key. The one other table read is `purged_entities` — not a
   * projection, never reset, the same answer live and on rebuild (`search.ts`'s
   * docblock) — so a reference to a purged item is skipped both ways, and its
   * chip reads `Deleted item` inside any other reference's snippet. Ordinals
   * are assigned BEFORE that filter, so the keys agree too.
   *
   * ## Trash and purge
   * A trash event is not a body event: rows stay, reads hide them
   * (`read/linked-from.ts`). Purge deletes by source parent AND by target
   * (`purge/erasure.ts`) and re-derives survivors through this `apply`
   * (`purge/survivors.ts`).
   */
  export const REFERENCE_BODY_EVENT_TYPES = [
    'ticket.created',
    'ticket.field_set',
    'comment.added',
    'comment.edited',
    'comment.deleted',
    'note.created',
    'note.body_set',
  ] as const;

  /**
   * Every other type on a ticket or note stream, and why it carries no document. 27.111 holds this total.
   * LANE: these keys are written from the plan's memory, NOT read. Fill the list from TICKET_EVENT_TYPES,
   * NOTE_EVENT_TYPES, COMMENT_EVENT_TYPES and CONTEST_EVENT_TYPES as they are on the branch; 27.111 names
   * every missing key and every stale one (a key here that is in no array is dead: delete it).
   */
  export const NOT_A_REFERENCE_BODY: Readonly<Record<string, string>> = {
    'ticket.transitioned': 'its optional comment is plain text `{ text }`, not a document (`mcp-server` `redactedPayload`)',
    'ticket.assigned': 'a person id, not a document',
    'ticket.collaborator_added': 'a person id, not a document',
    'ticket.collaborator_removed': 'a person id, not a document',
    'ticket.reparented': 'structure (spec C reads proj_tickets.parent_id)',
    'ticket.workflow_rebound': 'a workflow id',
    'ticket.closed': 'no body',
    'ticket.reopened': 'no body',
    'ticket.ranked': 'a rank string',
    'ticket.deleted': 'trash: rows stay, reads hide them',
    'ticket.restored': 'trash: rows were never removed',
    'attachment.added': 'a file, not a document',
    'note.renamed': 'a title string',
    'note.scope_set': 'an audience',
    'note.moved': 'a project id',
    'note.attached': 'structure (proj_note_attachments)',
    'note.detached': 'structure (proj_note_attachments)',
    'note.deleted': 'trash: rows stay, reads hide them',
    'note.restored': 'trash: rows were never removed',
    'claim.contested': 'a refused claim; it changed no body',
    'claim.contested_resolved': 'a resolution; it changed no body',
    'visibility.set': 'an audience',
    'purge.marked': 'a purge mark; the purge itself deletes rows (purge/erasure.ts)',
    'purge.unmarked': 'a purge mark',
    'purge.completed': 'the purge deletes rows directly (purge/erasure.ts)',
  };

  type Source = { kind: 'ticket' | 'note' | 'comment'; id: string; parentKind: 'ticket' | 'note'; parentId: string };

  /** Replaces one source's rows with the references in `doc` (`null` = no body). Exported for the purge's survivor replay test. */
  export async function replaceReferences(tx: PoolClient, event: LedgerEvent, source: Source, doc: unknown): Promise<void> {
    await tx.query('DELETE FROM proj_references WHERE source_kind = $1 AND source_id = $2', [source.kind, source.id]);
    if (doc === null || doc === undefined) return;
    const isPurged = await purgedResolverFor(tx, [doc]);
    const refs = extractDocReferences(doc, { isPurged }).filter(
      (ref) => ref.targetKind === 'person' || !isPurged(ref.targetKind, ref.targetId),
    );
    if (refs.length === 0) return;
    await tx.query(
      `INSERT INTO proj_references
         (workspace_id, source_kind, source_id, source_parent_kind, source_parent_id,
          target_kind, target_id, ordinal, snippet, updated_by, updated_at, seq)
       SELECT $1, $2, $3, $4, $5, r.target_kind, r.target_id, r.ordinal, r.snippet, $6, $7, $8
         FROM unnest($9::text[], $10::text[], $11::int[], $12::text[]) AS r(target_kind, target_id, ordinal, snippet)`,
      [
        event.workspaceId, source.kind, source.id, source.parentKind, source.parentId,
        event.actorId, event.serverTime, event.workspaceSeq,
        refs.map((ref) => ref.targetKind), refs.map((ref) => ref.targetId),
        refs.map((ref) => ref.ordinal), refs.map((ref) => ref.snippet),
      ],
    );
  }

  export const referencesProjection: Projection = {
    name: 'proj_references',
    tables: ['proj_references'],

    async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
      const kind = event.entity.kind;
      if (kind !== 'ticket' && kind !== 'note') return;
      const self = (sourceKind: 'ticket' | 'note'): Source => ({ kind: sourceKind, id: event.entity.id, parentKind: kind, parentId: event.entity.id });
      const comment = (id: string): Source => ({ kind: 'comment', id, parentKind: kind, parentId: event.entity.id });
      switch (event.type) {
        case 'ticket.created': {
          // A redacted creation (trash Plan 2) has no description to index.
          if (kind !== 'ticket' || isRedactedTicketCreated(event)) return;
          const payload = event.payload as { description?: unknown };
          await replaceReferences(tx, event, self('ticket'), payload.description ?? null);
          return;
        }
        case 'ticket.field_set': {
          const payload = event.payload as { fieldId?: unknown; value?: unknown };
          if (kind !== 'ticket' || payload.fieldId !== 'description') return;
          await replaceReferences(tx, event, self('ticket'), payload.value ?? null);
          return;
        }
        case 'note.created':
        case 'note.body_set': {
          if (kind !== 'note') return;
          const payload = event.payload as { body?: unknown };
          await replaceReferences(tx, event, self('note'), payload.body ?? null);
          return;
        }
        case 'comment.added': {
          // The comment's id IS the event id (`ticket-comments.ts`, "The id").
          await replaceReferences(tx, event, comment(event.id), commentAddedPayload.parse(event.payload).body);
          return;
        }
        case 'comment.edited': {
          const payload = commentEditedPayload.parse(event.payload);
          await replaceReferences(tx, event, comment(payload.commentId), payload.body);
          return;
        }
        case 'comment.deleted': {
          await replaceReferences(tx, event, comment(commentDeletedPayload.parse(event.payload).commentId), null);
          return;
        }
        default:
          return;
      }
    },

    async reset(tx: PoolClient): Promise<void> {
      await tx.query('TRUNCATE proj_references');
    },
  };
  ```

  In `apps/server/src/projections/index.ts`, import `referencesProjection` from `./references.js` and append after `registry.register(ticketCommentsProjection);` (`:198`):
  ```ts
    // Knowledge Graph spec B. APPENDED: `apply` reads no projection's table (only
    // its own rows and `purged_entities`, which is not a projection), and no
    // projection reads proj_references inside an ingest transaction — its one
    // reader, `read/linked-from.ts`, is a request-path read.
    registry.register(referencesProjection);
  ```
  Also add `proj_references` to the end of the pinned-order sentence in the file docblock (`:28-31`).

  Run the Step 5 command. Expected: PASS 27.106–27.112.

  Commit: `KG-B T1: proj_references projection and census (27.106–27.112)`.

- [ ] **Step 7: Purge — failing tests (27.113–27.117)**

  `apps/server/test/purge/purge-references.test.ts` (world and helpers from `test/purge/world.ts`, structure copied from `purge-survivors.test.ts:1-50`):
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { newUlid, PURGED_ITEM_LABEL } from '@gisik-nokma/domain';
  import { buildProjectionRegistry } from '../../src/projections/index.js';
  import { purgeItem, type PurgeDeps } from '../../src/purge/purge-item.js';
  import { verifyProjections } from '../../src/tools/verify-projections.js';
  import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { scan } from './scan.js';
  import { buildReferenceWorld, doc, dueAt, ev, noteCreated, recordingStore, text, ticketRef } from './world.js';

  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
    resetEntitySeqs();
  }, 60_000);
  afterAll(async () => {
    await db.drop();
  });

  const deps = (now: Date): PurgeDeps => ({ projections: buildProjectionRegistry(), store: recordingStore(), now });
  const clean = async () =>
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  const refRows = async (where: string, params: unknown[]) =>
    (await db.pool.query<{ source_id: string; target_id: string; snippet: string }>(`SELECT source_id, target_id, snippet FROM proj_references WHERE ${where} ORDER BY source_id, ordinal`, params)).rows;

  describe('27.113 a purged TARGET leaves no row and no quote', () => {
    it('27.113 survivors that chipped T lose their rows to T; a neighbour reference in the same block now reads Deleted item', async () => {
      const w = await buildReferenceWorld(db.pool);
      const OTHER = newUlid();
      const NB = newUlid();
      await applyCommitted(db.pool, [
        noteCreated(w, NB, { title: 'Both', homeProjectId: '', scope: { mode: 'workspace' }, body: doc(ticketRef(w.T, w.P, 'PG-1', `Invoice ${w.marker}`), text(' blocks '), ticketRef(OTHER, w.P, 'PG-9', 'Other')) }),
      ]);
      expect((await refRows('target_id = $1', [w.T])).length).toBeGreaterThan(0); // CONTROL
      await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
      expect(await refRows('target_id = $1', [w.T])).toEqual([]);
      expect(await refRows('source_id = $1', [NB])).toEqual([{ source_id: NB, target_id: OTHER, snippet: `${PURGED_ITEM_LABEL} blocks [[PG-9 Other]]` }]);
      expect(Object.keys(await scan(db.pool, [w.T, w.marker])).filter((k) => k.startsWith('proj_references.'))).toEqual([]);
      await clean();
    });
  });

  describe('27.114 a purged SOURCE takes its own rows and its comments’ rows', () => {
    it('27.114 T’s description rows and the rows of comments on T go; a survivor’s rows stay (control)', async () => {
      const w = await buildReferenceWorld(db.pool);
      const X = newUlid();
      await applyCommitted(db.pool, [
        ev(w, 'ticket', w.T, 'ticket.field_set', { fieldId: 'description', value: doc(ticketRef(X, w.P, 'PG-7', 'X')) }),
        ev(w, 'ticket', w.T, 'comment.added', { body: doc(ticketRef(X, w.P, 'PG-7', 'X')) }),
      ]);
      expect((await refRows(`source_parent_id = $1`, [w.T])).length).toBe(2);
      await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
      expect(await refRows(`source_parent_id = $1`, [w.T])).toEqual([]);
      expect((await refRows(`source_parent_id = $1`, [w.N1])).length).toBe(0); // N1 chipped only T
      await clean();
    });
  });

  describe('27.115 a body written AFTER the purge that still chips the purged id', () => {
    it('27.115 writes no row for it, keeps the ordinal of the next reference, and a rebuild agrees', async () => {
      const w = await buildReferenceWorld(db.pool);
      await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
      const LATE = newUlid();
      const Y = newUlid();
      await applyCommitted(db.pool, [
        noteCreated(w, LATE, { title: 'Late', homeProjectId: '', scope: { mode: 'workspace' }, body: doc(ticketRef(w.T, w.P, 'PG-1', 'stale'), text(' then '), ticketRef(Y, w.P, 'PG-3', 'Y')) }),
      ]);
      const rows = (await db.pool.query<{ target_id: string; ordinal: number }>('SELECT target_id, ordinal FROM proj_references WHERE source_id = $1', [LATE])).rows;
      expect(rows).toEqual([{ target_id: Y, ordinal: 1 }]);
      await clean();
    });
  });

  describe('27.116 a workspace purge empties the workspace’s rows', () => {
    it('27.116 every row of the purged workspace goes; another workspace’s rows stay (control)', async () => {
      const keep = await buildReferenceWorld(db.pool);
      const gone = await buildReferenceWorld(db.pool);
      await purgeItem(db.pool, { kind: 'workspace', id: gone.WS }, deps(await dueAt(db.pool, 'workspace', gone.WS)));
      expect(await refRows('workspace_id = $1', [gone.WS])).toEqual([]);
      expect((await refRows('workspace_id = $1', [keep.WS])).length).toBeGreaterThan(0);
    });
  });
  ```
  Add a third `it` to 27.113: a COMMENT ON A NOTE whose body holds `ticketRef(w.T…)` and a second chip in the same paragraph. After the purge the comment's row to the second chip must read `Deleted item` in its snippet, not T's title. This is reachable because `collectSurvivors` (`survivors.ts:22-50`) finds every ticket/note entity whose event payload text contains T's id, and a comment's events are filed on its parent; `rederiveSurvivors` then replays that parent's events, comments included.

  Before writing 27.116, read `world.ts` for how a workspace is marked for purge (`dueAt(pool, 'workspace', id)` throws if it is not marked). If `buildReferenceWorld` marks only the ticket, add the workspace mark the way `purge-kinds.test.ts` does for its workspace case (grep `'workspace'` there) and say so.

  Also extend `purge-survivors.test.ts` 19.134: nothing to edit. Its exact `scan` map is the proof that `proj_references` holds nothing of T after the purge; it must stay green unchanged.

  Run: `pnpm --filter @gisik-nokma/server exec vitest run test/purge/purge-references.test.ts test/purge/table-rules.test.ts test/purge/purge-survivors.test.ts --maxWorkers=2 > /tmp/kgb-t1-purge-red.log 2>&1; tail -40 /tmp/kgb-t1-purge-red.log`
  Expected: FAIL. 19.081 names `proj_references` (no rule); 19.134 gains `proj_references.target_id` / `proj_references.snippet` keys; 27.113 finds rows to T.

- [ ] **Step 8: Implement the purge half**

  `apps/server/src/purge/table-rules.ts`, after `proj_note_search`'s entry:
  ```ts
    proj_references: {
      rule: 'rederive',
      by: ['workspace_id'],
      why: 'Knowledge Graph spec B: rows whose source parent OR target is in the set are deleted (erasure.ts); a survivor that chipped a purged item is replayed so its snippets read Deleted item (survivors.ts).',
    },
    projection_backfills: {
      rule: 'not-entity-bearing',
      why: 'Knowledge Graph spec B: one marker row per completed one-shot backfill (a projection name, a time, a count); it names no ticket, note, project or person.',
    },
  ```
  (Copy the exact shape of an existing `not-entity-bearing` entry; if that rule takes no `by`, give none.)
  `apps/server/src/purge/erasure.ts`, in `eraseRows`' `statements` after the `proj_note_search` line (`:89`):
  ```ts
      [
        `DELETE FROM proj_references
          WHERE (source_parent_kind = 'ticket' AND source_parent_id = ANY($1::text[]))
             OR (source_parent_kind = 'note' AND source_parent_id = ANY($2::text[]))
             OR (target_kind = 'ticket' AND target_id = ANY($1::text[]))
             OR (target_kind = 'note' AND target_id = ANY($2::text[]))`,
        [T, N],
      ],
  ```
  `apps/server/src/purge/survivors.ts`, in `rederiveSurvivors` after the invites loop (`:106`):
  ```ts
    // Knowledge Graph spec B: a survivor's own rows and its comments' rows are
    // replayed AFTER recordPurged, so the projection skips the purged targets and
    // renders their chips as Deleted item, exactly as a rebuild over the
    // post-purge ledger does.
    const references = projectionNamed(registry, 'proj_references');
    for (const [kind, ids] of [['ticket', survivors.ticketIds], ['note', survivors.noteIds]] as const) {
      for (const id of ids) {
        // The boot backfill replays an entity under this same lock; taking it here keeps
        // a purge and a concurrent backfill from interleaving on one survivor. A purge
        // holds the target's lock (purge-item.ts:107) and then each survivor's, in sorted
        // order; the backfill holds one lock at a time, so no cycle. Before landing, grep
        // purge-item.ts for lockWorkspace: if the purge takes it, the order is still
        // workspace → target → survivors, the same direction as ingest's workspace → entity.
        await lockEntity(db, kind, id);
        await db.query('DELETE FROM proj_references WHERE source_parent_kind = $1 AND source_parent_id = $2', [kind, id]);
        for (const event of await readEntityEvents(db, kind, id)) {
          await references.apply(event, db);
        }
      }
    }
  ```
  Add `import { lockEntity } from '../ledger/event-store.js';` to `survivors.ts`.

  Run the Step 7 command. Expected: PASS, 19.081–19.083, 19.130–19.136 and 27.113–27.116. Then run the whole purge folder and the projections folder:
  `pnpm --filter @gisik-nokma/server exec vitest run test/purge test/projections test/projection-order.test.ts --maxWorkers=2 > /tmp/kgb-t1-purge.log 2>&1; tail -12 /tmp/kgb-t1-purge.log`. Expected: green.

  Commit: `KG-B T1: purge erases and re-derives proj_references (27.113–27.116)`.

- [ ] **Step 9: The recovery tool reads the CA (27.117)**

  In `apps/server/src/tools/rebuild-projection.ts`, export the pool builder and use it in `main` (copied from `search-preflight.ts:237-238`):
  ```ts
  import { optionalDatabaseCaCert } from '../ops/backup-env.js';

  /** The pool this tool writes through: a managed database presents a CA the trust store does not carry (runbook, TLS paragraph). */
  export function toolPool(databaseUrl: string, env: NodeJS.ProcessEnv): Pool {
    return createPool(databaseUrl, { caCert: optionalDatabaseCaCert(env) });
  }
  ```
  (`import type { Pool } from 'pg';` at the top) and replace `const pool = createPool(databaseUrl);` (`:25`) with `const pool = toolPool(databaseUrl, process.env);`.

  Append to `apps/server/test/tools/rebuild-projection.test.ts`:
  ```ts
  describe('27.117 rebuild:projection can reach a managed database', () => {
    it('27.117 a DATABASE_CA_CERT turns TLS on; without one the pool has no ssl (control)', async () => {
      const { toolPool } = await import('../../src/tools/rebuild-projection.js');
      const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
      const withCa = toolPool('postgres://u:p@localhost:5432/x', { DATABASE_CA_CERT: pem });
      const without = toolPool('postgres://u:p@localhost:5432/x', {});
      expect((withCa as unknown as { options: { ssl?: unknown } }).options.ssl).toBeDefined();
      expect((without as unknown as { options: { ssl?: unknown } }).options.ssl).toBeUndefined();
      await Promise.all([withCa.end(), without.end()]);
    });
  });
  ```
  Before writing the assertion, read `optionalDatabaseCaCert` in `apps/server/src/ops/backup-env.ts` for the env key and the PEM shape it accepts, and `createPool` (`apps/server/src/db.ts:138`) for where it puts `ssl`; adjust the two property reads to the real shape.

  Run the rebuild-projection test file. Expected: PASS.

  Commit: `KG-B T1: rebuild:projection reads the CA (27.117)`.

- [ ] **Step 10: The automatic one-shot backfill on boot (27.119–27.122), and the runbook**

  **Failing tests first.** `apps/server/test/projections/references-backfill.test.ts`:
  ```ts
  import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
  import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
  import { insertEvent, lockEntity, lockWorkspace } from '../../src/ledger/event-store.js';
  import { backfillReferences } from '../../src/projections/backfill-references.js';
  import { buildProjectionRegistry } from '../../src/projections/index.js';
  import { verifyProjections } from '../../src/tools/verify-projections.js';
  import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

  let db: TestDatabase;
  const WS = newUlid();
  const ACTOR = newUlid();
  const T1 = newUlid(), T2 = newUlid(), N1 = newUlid(), X = newUlid();
  const chip = (ticketId: string) => ({ type: 'ticketRef', attrs: { ticketId, projectId: 'P1', key: 'GN-1', title: 'Chiller' } });
  const body = (...inline: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: inline }] });
  const ev = (kind: 'ticket' | 'note', id: string, type: string, payload: unknown): LedgerEvent =>
    makeCommitted({ workspaceId: WS, actorId: ACTOR, entity: { kind, id }, type, payload });
  const deps = (probe?: Parameters<typeof backfillReferences>[1]['probe']) => ({ projections: buildProjectionRegistry(), ...(probe === undefined ? {} : { probe }) });
  const snapshot = async () => (await db.pool.query('SELECT * FROM proj_references ORDER BY source_kind, source_id, ordinal')).rows;
  /** The state the migration leaves on a ledger that predates it: an empty table, no marker. */
  const asIfJustMigrated = async () => {
    await db.pool.query('TRUNCATE proj_references');
    await db.pool.query('DELETE FROM projection_backfills');
  };

  /**
   * Ingest's own locking skeleton (ingest-service.ts:170-378: BEGIN, lockWorkspace, lockEntity,
   * insertEvent, every projection's apply, COMMIT). `applyCommitted` takes NO locks
   * (helpers/apply.ts:123-125), so a race test built on it would observe nothing.
   */
  async function ingestLike(envelope: LedgerEvent): Promise<void> {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await lockWorkspace(client, envelope.workspaceId);
      await lockEntity(client, envelope.entity.kind, envelope.entity.id);
      await insertEvent(client, envelope);
      for (const projection of buildProjectionRegistry().all()) await projection.apply(envelope, client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    resetEntitySeqs();
    await applyCommitted(db.pool, [
      ev('ticket', T1, 'ticket.field_set', { fieldId: 'description', value: body(chip(X)) }),
      ev('ticket', T1, 'comment.added', { body: body(chip(T2)) }),
      ev('ticket', T2, 'ticket.field_set', { fieldId: 'description', value: body(chip(T1)) }),
      ev('note', N1, 'note.body_set', { body: body(chip(T1)) }),
    ]);
  });
  afterAll(async () => {
    await db.drop();
  });

  describe('27.119 first boot: the backfill fills the table from the ledger and records the marker', () => {
    it('27.119 rows equal the live-applied rows, verifyProjections is clean, the marker names the entity count', async () => {
      const live = await snapshot();
      expect(live.length).toBe(4); // CONTROL: the live path wrote four rows
      await asIfJustMigrated();
      expect(await snapshot()).toEqual([]);
      const result = await backfillReferences(db.pool, deps());
      expect(result).toMatchObject({ ran: true, entities: 3 });
      expect(await snapshot()).toEqual(live);
      expect((await db.pool.query('SELECT name, entities FROM projection_backfills')).rows).toEqual([{ name: 'proj_references', entities: '3' }]);
      expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
    });
  });

  describe('27.120 second boot: the marker is there, so the backfill does nothing', () => {
    it('27.120 with the marker an emptied table stays empty; without it the same call fills it (control)', async () => {
      await db.pool.query('TRUNCATE proj_references'); // marker kept
      expect(await backfillReferences(db.pool, deps())).toMatchObject({ ran: false });
      expect(await snapshot()).toEqual([]);
      await db.pool.query('DELETE FROM projection_backfills');
      expect(await backfillReferences(db.pool, deps())).toMatchObject({ ran: true });
      expect((await snapshot()).length).toBe(4);
    });
  });

  describe('27.121 a crash mid-run leaves no marker, and the next boot re-runs to completion', () => {
    it('27.121 a throw after the first entity: the run rejects, no marker, partial rows; the next run completes', async () => {
      const live = await snapshot();
      await asIfJustMigrated();
      const crash = deps(async (stage, _entity, index) => {
        if (stage === 'committed' && index === 0) throw new Error('simulated crash');
      });
      await expect(backfillReferences(db.pool, crash)).rejects.toThrow('simulated crash');
      expect((await db.pool.query('SELECT 1 FROM projection_backfills')).rowCount).toBe(0);
      expect((await snapshot()).length).toBeLessThan(4);
      // The session lock was released with the crashed run, or this second run would report ran: false.
      expect(await backfillReferences(db.pool, deps())).toMatchObject({ ran: true });
      expect(await snapshot()).toEqual(live);
    });
  });

  describe('27.122 an event committed DURING the backfill is in the table afterwards', () => {
    // One envelope for both its: the control runs FIRST, before the event exists in the ledger.
    const late = ev('ticket', T1, 'comment.added', { body: body(chip(N1)) });
    const lateRow = async () => (await db.pool.query('SELECT 1 FROM proj_references WHERE source_kind = $1 AND source_id = $2', ['comment', late.id])).rowCount;

    it('27.122 control: the same run, the same probe point, no concurrent event: no such row, four rows', async () => {
      await asIfJustMigrated();
      let reached = false;
      await backfillReferences(db.pool, deps(async (stage, entity) => {
        if (stage === 'replaying' && entity.id === T1) reached = true;
      }));
      expect(reached).toBe(true);
      expect(await lateRow()).toBe(0);
      expect((await snapshot()).length).toBe(4);
    });

    it('27.122 an ingest on the entity being replayed waits for its lock, then lands; the backfill completes', async () => {
      await asIfJustMigrated();
      let pending: Promise<void> | null = null;
      const result = await backfillReferences(
        db.pool,
        deps(async (stage, entity) => {
          if (stage !== 'replaying' || entity.id !== T1 || pending !== null) return;
          pending = ingestLike(late);
          // Wait until the ingest is BLOCKED on T1's entity lock, which this transaction holds.
          for (let i = 0; i < 200; i += 1) {
            const { rows } = await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted");
            if ((rows[0]?.n ?? 0) > 0) return;
            await new Promise((r) => setTimeout(r, 10));
          }
          throw new Error('the concurrent ingest never waited on the entity lock');
        }),
      );
      await pending;
      expect(result).toMatchObject({ ran: true });
      expect(await lateRow()).toBe(1);
      expect((await snapshot()).length).toBe(5);
      expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
    });
  });
  ```
  The 27.122 `ingestLike` mirrors ingest's locks; if `ingest-service.ts` exports an ingest function a test can call without HTTP, use it instead and say so. The `entities` column comes back as a string (`bigint`); keep `'3'`.

  Run: `pnpm --filter @gisik-nokma/server exec vitest run test/projections/references-backfill.test.ts --maxWorkers=2 > /tmp/kgb-t1-bf-red.log 2>&1; tail -20 /tmp/kgb-t1-bf-red.log`. Expected: FAIL, module `backfill-references.js` not found.

  **Implementation.** `apps/server/src/projections/backfill-references.ts`:
  ```ts
  import type { Pool } from 'pg';
  import { lockEntity, readEntityEvents } from '../ledger/event-store.js';
  import type { ProjectionRegistry } from './registry.js';

  /**
   * The one-shot backfill of `proj_references` (Knowledge Graph B; planner ruling
   * 2026-10-03: no manual prod step). Run by `index.ts` in the BACKGROUND after
   * `app.listen`; the Linked-from read answers from whatever is there meanwhile.
   *
   * ## Why not rebuildProjection
   * It truncates and replays the whole ledger in one transaction (rebuild.ts):
   * an ACCESS EXCLUSIVE lock on the table for the whole run, and the whole ledger
   * in memory (`readLedger`). This walks ENTITIES instead, one short transaction
   * each.
   *
   * ## Why no live event is lost
   * Each entity's transaction takes `lockEntity` — the lock ingest holds from
   * before `insertEvent` until after every projection's `apply` and `COMMIT`
   * (ingest-service.ts:175, :358, :375-378). A comment is filed on its parent,
   * so the entity's lock covers every source whose parent it is. Inside the lock
   * this DELETEs the entity's rows and replays its events: an ingest that
   * committed first is in the replay (READ COMMITTED, event-store.ts:15-19); one
   * that arrives during it waits, then applies live on the replayed rows. Every
   * write replaces one source's rows, so both orders give the rebuild's rows.
   *
   * ## Restart-safe and idempotent
   * The marker is written only after the last entity. A crash or a shutdown
   * mid-run leaves no marker; the next boot replays every entity again, which is
   * harmless (delete + replay). A session advisory lock lets one instance run it
   * at a time; another instance that finds it taken skips (the holder finishes,
   * or crashes and releases it, and the next boot runs it).
   */
  export const REFERENCES_BACKFILL = 'proj_references';

  export type BackfillProbe = (stage: 'replaying' | 'committed', entity: { kind: 'ticket' | 'note'; id: string }, index: number) => Promise<void>;
  export type BackfillDeps = { projections: ProjectionRegistry; probe?: BackfillProbe; shouldStop?: () => boolean; log?: (message: string) => void };
  export type BackfillResult = { ran: boolean; entities: number; ms: number; maxEntityMs: number };

  export async function backfillReferences(pool: Pool, deps: BackfillDeps): Promise<BackfillResult> {
    const skipped: BackfillResult = { ran: false, entities: 0, ms: 0, maxEntityMs: 0 };
    const projection = deps.projections.get(REFERENCES_BACKFILL);
    if (projection === undefined) throw new Error(`backfill: projection ${REFERENCES_BACKFILL} is not registered`);
    const guard = await pool.connect();
    const lockKey = `backfill:${REFERENCES_BACKFILL}`;
    let locked = false;
    try {
      locked = (await guard.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok', [lockKey])).rows[0]?.ok === true;
      if (!locked) return skipped;
      const done = await guard.query('SELECT 1 FROM projection_backfills WHERE name = $1', [REFERENCES_BACKFILL]);
      if (done.rowCount !== 0) return skipped;

      const started = performance.now();
      let maxEntityMs = 0;
      const { rows: entities } = await guard.query<{ entity_kind: 'ticket' | 'note'; entity_id: string }>(
        `SELECT DISTINCT entity_kind, entity_id FROM events WHERE entity_kind IN ('ticket', 'note') ORDER BY entity_kind, entity_id`,
      );
      for (const [index, row] of entities.entries()) {
        if (deps.shouldStop?.() === true) return { ...skipped, entities: index }; // shutdown: no marker, next boot re-runs
        const entity = { kind: row.entity_kind, id: row.entity_id };
        const client = await pool.connect();
        const entityStarted = performance.now();
        let failed: Error | undefined;
        try {
          await client.query('BEGIN');
          await lockEntity(client, entity.kind, entity.id);
          await client.query('DELETE FROM proj_references WHERE source_parent_kind = $1 AND source_parent_id = $2', [entity.kind, entity.id]);
          await deps.probe?.('replaying', entity, index);
          for (const event of await readEntityEvents(client, entity.kind, entity.id)) {
            await projection.apply(event, client);
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch((cause: unknown) => {
            failed = cause instanceof Error ? cause : new Error(String(cause));
          });
          throw error;
        } finally {
          client.release(failed);
        }
        maxEntityMs = Math.max(maxEntityMs, performance.now() - entityStarted);
        await deps.probe?.('committed', entity, index);
      }
      await guard.query(
        'INSERT INTO projection_backfills (name, completed_at, entities) VALUES ($1, now(), $2) ON CONFLICT (name) DO NOTHING',
        [REFERENCES_BACKFILL, entities.length],
      );
      const ms = performance.now() - started;
      deps.log?.(`backfill ${REFERENCES_BACKFILL}: ${entities.length} entities in ${ms.toFixed(0)} ms (longest entity ${maxEntityMs.toFixed(0)} ms)`);
      return { ran: true, entities: entities.length, ms, maxEntityMs };
    } finally {
      if (locked) await guard.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]).catch(() => undefined);
      guard.release();
    }
  }

  /** The boot wiring: `run()` after `listen` (never awaited by boot), `stop()` from `onClose`. A failure is logged, never thrown into the process. */
  export function startReferencesBackfill(pool: Pool, deps: Omit<BackfillDeps, 'shouldStop'>): { run(): void; stop(): Promise<void> } {
    let stopping = false;
    let running: Promise<unknown> = Promise.resolve();
    return {
      run() {
        running = backfillReferences(pool, { ...deps, shouldStop: () => stopping }).catch((error: unknown) => {
          deps.log?.(`backfill ${REFERENCES_BACKFILL} failed; the next boot re-runs it: ${error instanceof Error ? error.message : String(error)}`);
        });
      },
      async stop() {
        stopping = true;
        await running;
      },
    };
  }
  ```
  Check `readEntityEvents`' parameter list at `event-store.ts:132` (it may take an `afterSeq`; pass `0` if so).

  In `apps/server/src/index.ts`: build the starter and register its stop BEFORE `listen` (Fastify refuses `addHook` once listening, `index.ts:269-280`), and start it AFTER:
  ```ts
    // Knowledge Graph B: the one-shot proj_references backfill. Started AFTER listen and
    // never awaited, so boot and health checks never wait for it; stopped on onClose
    // so a SIGTERM mid-run ends it between entities (no marker: the next boot re-runs it).
    const referencesBackfill = startReferencesBackfill(pool, {
      projections: buildProjectionRegistry(),
      log: (msg) => {
        app.log.warn(msg);
      },
    });
    app.addHook('onClose', async () => {
      await referencesBackfill.stop();
    });
  ```
  placed beside the embed worker's block, and after `await app.listen({ port: config.port, host: config.host });` (`:345`):
  ```ts
    referencesBackfill.run();
  ```
  `onClose` hooks run before `installShutdownHandlers` ends the pool (`shutdown.ts`), so `stop()` awaiting the run is safe. If `index.ts` already holds a registry instance, pass that one.

  **The runbook.** In `docs/runbook.md`, "Deploy (routine)", after the search pre-flight's last paragraph (the one ending "…before connecting).") and before `## Deploy (first time)`, add:
  ```markdown
  **The Linked-from index fills itself.** The deploy that carries `1791500000000_proj-references.sql`
  (Knowledge Graph B) creates `proj_references` empty. On its first boot the server backfills the
  table from the ledger in the background, one ticket or note at a time, after it is already
  serving. Until that finishes, "Linked from" lists only what it has indexed so far. When it is
  done it logs `backfill proj_references: N entities in M ms` and writes a row to
  `projection_backfills`; later boots see that row and skip it. A crash or a redeploy mid-run
  leaves no row, and the next boot starts again from the beginning, which is safe. Nothing to run by hand.
  ```
  Run: `pnpm check:runbook > /tmp/kgb-runbook.log 2>&1; tail -5 /tmp/kgb-runbook.log`, then the Step 10 test command. Expected: PASS 27.119–27.122.

  Commit: `KG-B T1: automatic one-shot proj_references backfill on boot (27.119–27.122)`.

- [ ] **Step 11: The rebuild and backfill measurement (27.118), and the stop bar**

  `apps/server/test/projections/references-rebuild-perf.test.ts` (gating shape copied from `test/search/perf.test.ts:36-60`: `it.skip` with a printed line, never `skipIf`, so `check-no-silent-skips` is not involved):
  ```ts
  import { cpus } from 'node:os';
  import { performance } from 'node:perf_hooks';
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { newUlid } from '@gisik-nokma/domain';
  import { backfillReferences } from '../../src/projections/backfill-references.js';
  import { buildProjectionRegistry } from '../../src/projections/index.js';
  import { rebuildProjection } from '../../src/projections/rebuild.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

  /**
   * Knowledge Graph spec B §2.1 / §8: the rebuild AND the boot backfill of
   * proj_references, measured before shipping (case 27.118). Prod size was not
   * supplied; the size is the planner's FLOOR (P = 100 000 body events,
   * Q = 400 000 other events), the defaults below.
   *
   * REFS_PERF=1 [REFS_PERF_BODY_EVENTS=<n>] [REFS_PERF_OTHER_EVENTS=<m>]
   * The ledger is written straight into `events` (bulk INSERT): the rebuild reads
   * `events` alone, and seeding through `applyCommitted` at prod size would take
   * longer than the thing measured. Bodies carry two ticket chips, a note link and a
   * mention each, in three paragraphs — denser than a typical body, so the number errs high.
   */
  const ENABLED = process.env['REFS_PERF'] === '1';
  const BODY_EVENTS = Number(process.env['REFS_PERF_BODY_EVENTS'] ?? '100000');
  const OTHER_EVENTS = Number(process.env['REFS_PERF_OTHER_EVENTS'] ?? '400000');
  const BAR_MS = 10_000;
  const BAR_RSS_MB = 512;

  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 600_000);
  afterAll(async () => {
    await db.drop();
  });

  const para = (...inline: unknown[]) => ({ type: 'paragraph', content: inline });
  const text = (value: string) => ({ type: 'text', text: value });

  /** Seeds the ledger and returns the number of distinct SOURCES it wrote: a repeated description or note body REPLACES its source's rows, only a comment is a new source each time. */
  async function seed(bodyEvents: number, otherEvents: number): Promise<number> {
    const WS = newUlid();
    const ACTOR = newUlid();
    const tickets = Array.from({ length: Math.max(2, Math.floor(bodyEvents / 10)) }, () => newUlid());
    const notes = Array.from({ length: Math.max(1, Math.floor(bodyEvents / 20)) }, () => newUlid());
    const sources = new Set<string>();
    const entitySeq = new Map<string, number>();
    let workspaceSeq = 0;
    const columns: unknown[][] = Array.from({ length: 13 }, () => []);
    const flush = async () => {
      if (columns[0]!.length === 0) return;
      await db.pool.query(
        `INSERT INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq, workspace_seq)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::jsonb[], $8::text[], $9::text[], $10::timestamptz[], $11::timestamptz[], $12::bigint[], $13::bigint[])`,
        columns,
      );
      for (const column of columns) column.length = 0;
    };
    for (let i = 0; i < bodyEvents + otherEvents; i += 1) {
      const isBody = i < bodyEvents;
      const onNote = isBody && i % 3 === 2;
      const entityId = onNote ? notes[i % notes.length]! : tickets[i % tickets.length]!;
      const key = `${onNote ? 'note' : 'ticket'}:${entityId}`;
      const seq = (entitySeq.get(key) ?? 0) + 1;
      entitySeq.set(key, seq);
      workspaceSeq += 1;
      const docBody = {
        type: 'doc',
        content: [
          para(text(`Line ${i} about `), { type: 'ticketRef', attrs: { ticketId: tickets[(i + 1) % tickets.length], projectId: 'P', key: 'GN-1', title: 'Chiller' } }),
          para(text('and '), { type: 'wikiLink', attrs: { noteId: notes[(i + 3) % notes.length], title: 'Rulings' } }, text(' with '), { type: 'mention', attrs: { userId: ACTOR, label: 'Ama' } }),
          para(text('blocked by '), { type: 'ticketRef', attrs: { ticketId: tickets[(i + 7) % tickets.length], projectId: 'P', key: 'GN-2', title: 'Compressor' } }, text(' until the part arrives.')),
        ],
      };
      const [type, payload] = !isBody
        ? ['ticket.ranked', { rank: 'a0' }]
        : onNote
          ? ['note.body_set', { body: docBody }]
          : i % 3 === 0
            ? ['ticket.field_set', { fieldId: 'description', value: docBody }]
            : ['comment.added', { body: docBody }];
      const at = new Date(Date.UTC(2026, 8, 22) + i * 1000).toISOString();
      const eventId = newUlid();
      if (type === 'comment.added') sources.add(`comment:${eventId}`);
      else if (isBody) sources.add(`${onNote ? 'note' : 'ticket'}:${entityId}`);
      const row = [eventId, WS, onNote ? 'note' : 'ticket', entityId, type, 1, JSON.stringify(payload), ACTOR, 'web', at, at, seq, workspaceSeq];
      row.forEach((value, index) => columns[index]!.push(value));
      if (columns[0]!.length === 5_000) await flush();
    }
    await flush();
    return sources.size;
  }

  async function measure(name: string): Promise<{ ms: number; rssMb: number }> {
    const base = process.memoryUsage().rss;
    let peak = base;
    const timer = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 25);
    const started = performance.now();
    await rebuildProjection(name, { pool: db.pool, projections: buildProjectionRegistry() });
    const ms = performance.now() - started;
    clearInterval(timer);
    peak = Math.max(peak, process.memoryUsage().rss);
    return { ms, rssMb: (peak - base) / 1_048_576 };
  }

  async function measureBackfill(): Promise<{ ms: number; rssMb: number; maxEntityMs: number; entities: number }> {
    await db.pool.query('TRUNCATE proj_references');
    await db.pool.query('DELETE FROM projection_backfills');
    const base = process.memoryUsage().rss;
    let peak = base;
    const timer = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 25);
    const result = await backfillReferences(db.pool, { projections: buildProjectionRegistry() });
    clearInterval(timer);
    peak = Math.max(peak, process.memoryUsage().rss);
    return { ms: result.ms, rssMb: (peak - base) / 1_048_576, maxEntityMs: result.maxEntityMs, entities: result.entities };
  }

  describe('27.118 the rebuild and the boot backfill at the size floor', () => {
    if (!ENABLED) {
      console.log('refs-perf: SKIPPED — set REFS_PERF=1 to measure the proj_references rebuild and backfill at the floor (P=100 000, Q=400 000) against the bar (rebuild ≤ 10 000 ms and ≤ +512 MB RSS; backfill ≤ +512 MB RSS).');
      it.skip('measures the proj_references rebuild (set REFS_PERF=1)', () => undefined);
      return;
    }
    it('27.118 proj_references rebuilds and backfills within the bar; proj_search on the same ledger is the baseline', async () => {
      expect(BODY_EVENTS).toBeGreaterThan(0);
      const sourceCount = await seed(BODY_EVENTS, OTHER_EVENTS);
      const baseline = await measure('proj_search');
      const refs = await measure('proj_references');
      const { rows } = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM proj_references');
      console.log(
        `refs-perf: ${BODY_EVENTS} body + ${OTHER_EVENTS} other events on ${cpus()[0]?.model ?? 'unknown cpu'}; ` +
          `proj_search ${baseline.ms.toFixed(0)} ms (+${baseline.rssMb.toFixed(0)} MB); ` +
          `proj_references ${refs.ms.toFixed(0)} ms (+${refs.rssMb.toFixed(0)} MB), ${rows[0]?.n ?? 0} rows`,
      );
      // Four references per body, one body per SOURCE (a later body replaces an earlier one): the rebuild did the work.
      // A miss here is a fixture fault, NOT the stop bar — the bar is the two lines below.
      expect(rows[0]?.n).toBe(sourceCount * 4);
      const backfill = await measureBackfill();
      const after = (await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM proj_references')).rows[0]?.n;
      console.log(
        `refs-perf: backfill ${backfill.entities} entities in ${backfill.ms.toFixed(0)} ms (+${backfill.rssMb.toFixed(0)} MB), ` +
          `longest entity transaction ${backfill.maxEntityMs.toFixed(0)} ms, ${after ?? 0} rows`,
      );
      expect(after).toBe(rows[0]?.n); // the backfill reaches the rebuild's rows
      expect(refs.ms).toBeLessThanOrEqual(BAR_MS);
      expect(refs.rssMb).toBeLessThanOrEqual(BAR_RSS_MB);
      expect(backfill.rssMb).toBeLessThanOrEqual(BAR_RSS_MB);
    }, 3_600_000);
  });
  ```
  Run it twice, LOCALLY: at the floor, then at 10× the floor:
  ```
  REFS_PERF=1 pnpm --filter @gisik-nokma/server exec vitest run test/projections/references-rebuild-perf.test.ts --maxWorkers=1 > /tmp/kgb-perf-1x.log 2>&1; tail -15 /tmp/kgb-perf-1x.log
  REFS_PERF=1 REFS_PERF_BODY_EVENTS=1000000 REFS_PERF_OTHER_EVENTS=4000000 pnpm --filter @gisik-nokma/server exec vitest run test/projections/references-rebuild-perf.test.ts --maxWorkers=1 > /tmp/kgb-perf-10x.log 2>&1; tail -15 /tmp/kgb-perf-10x.log
  ```
  - **The floor run is the bar.** If it fails any of the three bar `expect`s (rebuild time, rebuild memory, backfill memory): **STOP. Do not continue to Step 12 or Task 2.** Push what you have and report the three `refs-perf:` lines to the planner. A miss on the row-count `expect` is a fixture fault, not the bar: fix the fixture.
  - **The baseline is light.** `proj_search`'s `field_set` / `comment.added` branches are `UPDATE … WHERE ticket_id = $1` (`search.ts:95-120`), so on these unborn entities they render the body and update nothing. It is a floor for "render every body once", not a like-for-like projection; say so beside its number.
  - **The 10× run is headroom, not the bar.** Report its line either way; a fail at 10× is a finding for the report, not a stop.
  - Machine: the lane machine is not the prod instance. Say so next to the numbers.

  Commit with the three `refs-perf:` lines quoted in the message.

- [ ] **Step 12: Catalogue, mutations, DONE**
  - **`test-cases/27-knowledge-graph.md`**, under `<!-- KG-B T1 -->`, one id line per case, ✅ in this commit: 27.100–27.122 as written above (27.111 "the projection's census"; 27.119–27.122 the boot backfill; 27.118 with its three measured `refs-perf:` lines in the shape of `test-cases/18-notes.md:182`, and the line opening `prod size not supplied; floor used (P=100 000, Q=400 000)`). 27.123–27.124 are reserved and unused; write `- 27.123–27.124 reserved, unused (T1).` as a plain line, not an id line.
  - **`Features.md` §24.B**, replace `<!-- KG-B bullets -->` with:
    ```markdown
    - ⚙️ **The reference index, `proj_references`** (KG-B T1; `packages/domain/src/doc-text.ts` `extractDocReferences`, `apps/server/src/projections/references.ts`, migration `apps/server/migrations/1791500000000_proj-references.sql`, `apps/server/src/purge/{table-rules,erasure,survivors}.ts`) — every `ticketRef`, `wikiLink` and `mention` in a description, a comment (on a ticket or a note) or a note body, one row each with a ≤ 160-character snippet marking it `[[…]]`; a body change replaces its source's rows; trash keeps them; a purge erases by source and target and re-derives survivors. Filled automatically on the first boot after the migration (`apps/server/src/projections/backfill-references.ts`, started from `apps/server/src/index.ts` after listen): one entity per transaction under ingest's entity lock, so no live event is lost; restart-safe, marked in `projection_backfills` (`docs/runbook.md`). Prod size not supplied; floor used (P=100 000, Q=400 000): <the three refs-perf lines>. Cases 27.100–27.122.
    <!-- KG-B bullets -->
    ```
    (keep the anchor below the bullet for Tasks 2–4).
  - **Mutations** (each must turn a named case red; revert after):

    | Case | Mutation |
    |---|---|
    | 27.101 | `SNIPPET_BLOCK_TYPES.has` → `false` (the doc root becomes every snippet) |
    | 27.103 | drop the `.replace(/\[(?=\[)/g, '[ ')` line |
    | 27.106 | drop the `DELETE` in `replaceReferences` |
    | 27.108 | `comment(event.id)` → `comment(newUlid())` |
    | 27.113 | drop the `!isPurged(...)` filter |
    | 27.115 | renumber ordinals after the purged filter |
    | 27.114 | drop the `source_parent_*` arms of the erasure `DELETE` |
    | 27.120 | drop the `projection_backfills` check (the second run re-fills the emptied table) |
    | 27.121 | write the marker BEFORE the entity loop |
    | 27.122 | drop `lockEntity` from the backfill's entity transaction (the ingest no longer waits: the probe's wait throws, or the INSERT collides) |

  - **Sweeps:** build domain; domain WHOLE; server `test/projections`, `test/purge`, `test/tools`, `test/projection-order.test.ts`, `test/search`, and any test that boots `index.ts` (grep `test/` for `src/index.js`); `pnpm check:tasks`, `check:migrations`, `check:runbook`, `check:citations`. Quote each as a LOCAL run.

  Push. DONE.

---

### Task 2: The read: `listLinkedFrom` and `GET /v1/workspaces/:id/references` (cases 27.125–27.139)

**Files:**
- Create:
  - `packages/domain/src/linked-from.ts`
  - `packages/domain/test/linked-from.test.ts`
  - `apps/server/src/read/linked-from.ts`
  - `apps/server/src/routes/references.ts`
  - `apps/server/test/read/linked-from.test.ts`
  - `apps/server/test/routes/references.test.ts`
- Modify:
  - `packages/domain/src/index.ts` (export `./linked-from.js`, beside `./doc-text.js` at `:21`)
  - `apps/server/src/read/notes.ts` (`:25`, export `NOTE_PROJECT_LIVE_WHERE`)
  - `apps/server/src/app.ts` (after `registerNoteRoutes(...)`, `:936`)
  - `Features.md` §24.B, `test-cases/27-knowledge-graph.md`

**Interfaces:**
- **Consumes:** `proj_references` (Task 1); `visibleTicketsWhere`, `visibleNotesWhere`, `LIVE_TICKET_WHERE` (`read/visible-where.ts:136`, `:294`, `:231`); `SqlParams` (`read/sql-params.ts`); `ticketKey`, `workspaceIdentityFromLedger`, `projectPrefixesInWorkspace`, `ticketNumbers` (as `read/notes.ts:137-150` composes keys); `canSee` (`visibility/can-see.ts:283`), `canReadNoteById` (`visibility/can-read-note.ts:148`), `ticketIsLive` (`read/live-ticket.ts:51`), `getNoteStateFromDb` (`projections/notes.js`), `resolveEffectiveRole`, `NOT_FOUND_BODY` (`routes/tickets.js`).
- **Produces** (in `@gisik-nokma/domain`):
  ```ts
  export type LinkedFromTarget = { kind: 'ticket' | 'note'; id: string };
  export type LinkedFromParent =
    | { kind: 'ticket'; ticketId: string; projectId: string; key: string; title: string; stateCategory: StateCategory }
    | { kind: 'note'; noteId: string; title: string };
  export type LinkedFromRow = { sourceKind: 'ticket' | 'note' | 'comment'; sourceId: string; parent: LinkedFromParent; authorId: string; snippet: string; updatedAt: string };
  export type LinkedFromPage = { total: number; items: LinkedFromRow[]; nextCursor: string | null };
  export const LINKED_FROM_PAGE_SIZE = 20;
  export const EMPTY_LINKED_FROM: LinkedFromPage;
  export function parseLinkedFromTarget(raw: unknown): LinkedFromTarget | null;
  export function linkedFromSourceTitle(row: LinkedFromRow): string;
  export function splitSnippet(snippet: string): { before: string; marked: string; after: string } | null;
  ```
  and `listLinkedFrom(db, eff, userId, workspaceId, target, cursor: string | null): Promise<LinkedFromPage>`; route `GET /v1/workspaces/:workspaceId/references?target=<kind>:<id>&cursor=<seq>` → `LinkedFromPage`, `400 { error: 'invalid_target' | 'invalid_cursor' }`, `404 NOT_FOUND_BODY`.

- [ ] **Step 1: Write the failing domain tests (27.125)**

  `packages/domain/test/linked-from.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { linkedFromSourceTitle, parseLinkedFromTarget, splitSnippet, type LinkedFromRow } from '../src/index.js';

  const T = '01J9TICKET00000000000000000';
  const row = (over: Partial<LinkedFromRow>): LinkedFromRow => ({
    sourceKind: 'ticket', sourceId: T, authorId: 'u1', snippet: 'a [[GN-1 One]] b', updatedAt: '2026-10-03T10:00:00.000Z',
    parent: { kind: 'ticket', ticketId: T, projectId: 'P', key: 'GN-118', title: 'Phone pass', stateCategory: 'open' }, ...over,
  });

  describe('27.125 the wire helpers', () => {
    it('27.125 a source title per kind; a ticket with no key falls back to its title', () => {
      expect(linkedFromSourceTitle(row({}))).toBe('GN-118 Phone pass');
      expect(linkedFromSourceTitle(row({ parent: { kind: 'note', noteId: 'N', title: 'Phone pass rulings' }, sourceKind: 'note' }))).toBe('Note: Phone pass rulings');
      expect(linkedFromSourceTitle(row({ sourceKind: 'comment', sourceId: 'C' }))).toBe('Comment on GN-118');
      expect(linkedFromSourceTitle(row({ sourceKind: 'comment', parent: { kind: 'note', noteId: 'N', title: 'Rulings' } }))).toBe('Comment on note Rulings');
      expect(linkedFromSourceTitle(row({ parent: { kind: 'ticket', ticketId: T, projectId: 'P', key: '', title: 'Phone pass', stateCategory: 'open' } }))).toBe('Phone pass');
    });

    it('27.125 splitSnippet finds the one marker; a snippet without one is null (control)', () => {
      expect(splitSnippet('a [[GN-1 One]] b')).toEqual({ before: 'a ', marked: 'GN-1 One', after: ' b' });
      expect(splitSnippet('no marker here')).toBeNull();
    });

    it('27.125 parseLinkedFromTarget takes ticket:/note: and a ULID; anything else is null', () => {
      expect(parseLinkedFromTarget(`ticket:${T}`)).toEqual({ kind: 'ticket', id: T });
      expect(parseLinkedFromTarget(`note:${T}`)).toEqual({ kind: 'note', id: T });
      for (const bad of [undefined, '', `person:${T}`, 'ticket:', `ticket:${T}x`, ['ticket', T]]) expect(parseLinkedFromTarget(bad)).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Implement `packages/domain/src/linked-from.ts`**

  ```ts
  import { ULID_REGEX } from './ulid.js';
  import type { StateCategory } from './workflow.js';

  /** Knowledge Graph spec B §3–§4: the "Linked from" wire shape, shared by the server read, the app and MCP. */
  export type LinkedFromTarget = { kind: 'ticket' | 'note'; id: string };
  export type LinkedFromParent =
    | { kind: 'ticket'; ticketId: string; projectId: string; key: string; title: string; stateCategory: StateCategory }
    | { kind: 'note'; noteId: string; title: string };
  export type LinkedFromRow = {
    sourceKind: 'ticket' | 'note' | 'comment';
    sourceId: string;
    parent: LinkedFromParent;
    /** Who last wrote the source's body; for a comment, its author (only the author may edit one). */
    authorId: string;
    snippet: string;
    updatedAt: string;
  };
  export type LinkedFromPage = { total: number; items: LinkedFromRow[]; nextCursor: string | null };

  /** Spec B §3.1–§3.2: twenty rows per page; "Show all N" pages the rest. */
  export const LINKED_FROM_PAGE_SIZE = 20;
  export const EMPTY_LINKED_FROM: LinkedFromPage = Object.freeze({ total: 0, items: [], nextCursor: null }) as LinkedFromPage;

  export function parseLinkedFromTarget(raw: unknown): LinkedFromTarget | null {
    if (typeof raw !== 'string') return null;
    const at = raw.indexOf(':');
    const kind = raw.slice(0, at);
    const id = raw.slice(at + 1);
    if (at < 0 || (kind !== 'ticket' && kind !== 'note') || !ULID_REGEX.test(id)) return null;
    return { kind, id };
  }

  function parentName(parent: LinkedFromParent): string {
    if (parent.kind === 'note') return parent.title;
    return parent.key === '' ? parent.title : `${parent.key} ${parent.title}`;
  }

  /** "GN-118 Phone pass", "Note: Phone pass rulings", "Comment on GN-118". The app adds " by <name>" to a comment. */
  export function linkedFromSourceTitle(row: LinkedFromRow): string {
    if (row.sourceKind !== 'comment') return row.parent.kind === 'note' ? `Note: ${row.parent.title}` : parentName(row.parent);
    if (row.parent.kind === 'note') return `Comment on note ${row.parent.title}`;
    return `Comment on ${row.parent.key === '' ? row.parent.title : row.parent.key}`;
  }

  /** The snippet's one `[[…]]` pair (Task 1 guarantees exactly one), or null. */
  export function splitSnippet(snippet: string): { before: string; marked: string; after: string } | null {
    const open = snippet.indexOf('[[');
    const close = snippet.indexOf(']]', open + 2);
    if (open < 0 || close < 0) return null;
    return { before: snippet.slice(0, open), marked: snippet.slice(open + 2, close), after: snippet.slice(close + 2) };
  }
  ```
  Before writing the first import, grep where `ULID_REGEX` is defined (`git grep -n "export const ULID_REGEX" packages/domain/src`) and import from that file. Add `export * from './linked-from.js';` to `packages/domain/src/index.ts` after `:21`.

  Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/linked-from.test.ts --maxWorkers=2 > /tmp/kgb-t2-dom.log 2>&1; tail -10 /tmp/kgb-t2-dom.log`. Expected: PASS.

  Commit: `KG-B T2: Linked-from wire types and helpers (27.125)`.

- [ ] **Step 3: Write the failing read tests (27.126–27.131)**

  `apps/server/test/read/linked-from.test.ts`. The world is `buildReadTestApp`'s (`test/helpers/read-app.ts:209`) with the notes seeded by `seedNotesIntoReadWorld` (`test/helpers/notes-fixture.ts:261`), exactly as `test/routes/notes.test.ts:45-60` builds it. In that world, `guestTaskId` is explicit to `[owner, guest]` and `sharedTaskId` is explicit to `[owner, member]` (`test/helpers/read-scenario.ts:178`, `:189`), so the guest can see `guestTaskId` and cannot see `sharedTaskId`; `nPrivate` is the owner's private note and `nExplicit` is explicit to the guest.
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { newUlid, type LinkedFromTarget } from '@gisik-nokma/domain';
  import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
  import { listLinkedFrom } from '../../src/read/linked-from.js';
  import { canSee } from '../../src/visibility/can-see.js';
  import { canReadNoteById } from '../../src/visibility/can-read-note.js';
  import { applyCommitted, makeCommitted } from '../helpers/apply.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { seedNotesIntoReadWorld, type ReadWorldNotes } from '../helpers/notes-fixture.js';
  import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

  let db: TestDatabase;
  let world: ReadWorld;
  let notes: ReadWorldNotes;
  let WS: string;
  let TARGET: string; // guestTaskId: the guest and the owner can see it
  let commentOnShared: string;
  let commentOnPrivate: string;

  const chip = (ticketId: string) => ({ type: 'ticketRef', attrs: { ticketId, projectId: 'P', key: 'X-1', title: 'July invoices' } });
  const body = (...inline: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: inline }] });
  const text = (value: string) => ({ type: 'text', text: value });

  beforeAll(async () => {
    db = await createTestDatabase();
    world = await buildReadTestApp(db);
    WS = world.world.workspaceId;
    TARGET = world.world.guestTaskId;
    notes = await seedNotesIntoReadWorld(db.pool, {
      workspaceId: WS, projectId: world.world.projectId, authorId: world.userIds.owner,
      guestUserId: world.userIds.guest, TP: world.world.taskInEpicId, TE: world.world.guestTaskId,
    });
    const ev = (kind: 'ticket' | 'note', id: string, type: string, payload: unknown) =>
      makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind, id }, type, payload });
    const onShared = ev('ticket', world.world.sharedTaskId, 'comment.added', { body: body(text('per '), chip(TARGET)) });
    const onPrivate = ev('note', notes.NOTES.nPrivate, 'comment.added', { body: body(chip(TARGET)) });
    commentOnShared = onShared.id;
    commentOnPrivate = onPrivate.id;
    await applyCommitted(db.pool, [
      ev('ticket', world.world.sharedTaskId, 'ticket.field_set', { fieldId: 'description', value: body(text('needs '), chip(TARGET), text(' and '), chip(TARGET)) }),
      ev('note', notes.NOTES.nPrivate, 'note.body_set', { body: body(chip(TARGET)) }),
      ev('note', notes.NOTES.nExplicit, 'note.body_set', { body: body(text('see '), chip(TARGET)) }),
      ev('ticket', TARGET, 'ticket.field_set', { fieldId: 'description', value: body(chip(TARGET)) }), // self
      onShared,
      onPrivate,
    ]);
  });
  afterAll(async () => {
    await db.drop();
  });

  const target = (): LinkedFromTarget => ({ kind: 'ticket', id: TARGET });
  async function readAs(role: ReadRole, cursor: string | null = null) {
    const userId = world.userIds[role];
    const eff = await resolveEffectiveRole(db.pool, userId, WS);
    return listLinkedFrom(db.pool, eff, userId, WS, target(), cursor);
  }
  const ids = (page: { items: Array<{ sourceKind: string; sourceId: string }> }) => page.items.map((i) => `${i.sourceKind}:${i.sourceId}`).sort();

  describe('27.126 visibility follows the SOURCE: no row and no count from a source the viewer cannot see', () => {
    it('27.126 the guest sees only the explicit note; the owner sees all five sources (control)', async () => {
      const owner = await readAs('owner');
      expect(ids(owner)).toEqual(
        [`ticket:${world.world.sharedTaskId}`, `note:${notes.NOTES.nPrivate}`, `note:${notes.NOTES.nExplicit}`, `comment:${commentOnShared}`, `comment:${commentOnPrivate}`].sort(),
      );
      expect(owner.total).toBe(5);
      const guest = await readAs('guest');
      expect(ids(guest)).toEqual([`note:${notes.NOTES.nExplicit}`]);
      expect(guest.total).toBe(1);
      expect(JSON.stringify(guest)).not.toContain('needs '); // the shared ticket's text does not leak
    });
  });

  describe('27.127 one row per source, its first reference; parents carry key, title and category', () => {
    it('27.127 the shared ticket chips the target twice and is ONE row with ordinal 0’s snippet', async () => {
      const owner = await readAs('owner');
      const shared = owner.items.find((i) => i.sourceKind === 'ticket')!;
      expect(shared.snippet).toBe('needs [[X-1 July invoices]] and X-1 July invoices');
      expect(shared.parent).toMatchObject({ kind: 'ticket', ticketId: world.world.sharedTaskId, title: 'Renew the trade licence', stateCategory: expect.any(String) });
      expect((shared.parent as { key: string }).key).not.toBe(''); // the key is composed, not left blank
      const comment = owner.items.find((i) => i.sourceId === commentOnPrivate)!;
      expect(comment.parent).toEqual({ kind: 'note', noteId: notes.NOTES.nPrivate, title: 'Private' });
      expect(comment.authorId).toBe(world.userIds.owner);
    });
  });

  describe('27.128 the target’s own description is not "Linked from"', () => {
    it('27.128 the self-reference is absent; the other sources are present (control, 27.126)', async () => {
      expect(ids(await readAs('owner'))).not.toContain(`ticket:${TARGET}`);
    });
  });

  describe('27.129 a trashed source is hidden and comes back on restore', () => {
    it('27.129 delete the shared ticket: its row and its comment’s row go; restore: both back', async () => {
      const ev = (type: string) => makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind: 'ticket', id: world.world.sharedTaskId }, type, payload: {} });
      await applyCommitted(db.pool, [ev('ticket.deleted')]);
      const during = await readAs('owner');
      expect(ids(during)).not.toContain(`ticket:${world.world.sharedTaskId}`);
      expect(ids(during)).not.toContain(`comment:${commentOnShared}`);
      expect(during.total).toBe(3);
      await applyCommitted(db.pool, [ev('ticket.restored')]);
      expect((await readAs('owner')).total).toBe(5);
    });
  });

  describe('27.130 agreement: every row the read returns passes canSee / canReadNoteById, per role', () => {
    it('27.130 for each role the read equals the owner’s rows filtered by the per-row predicates', async () => {
      const all = (await readAs('owner')).items;
      for (const role of ['owner', 'member', 'outsider', 'guest'] as ReadRole[]) {
        const userId = world.userIds[role];
        const expected: string[] = [];
        for (const item of all) {
          const ok = item.parent.kind === 'ticket' ? await canSee(db.pool, userId, item.parent.ticketId) : await canReadNoteById(db.pool, userId, item.parent.noteId);
          if (ok) expected.push(`${item.sourceKind}:${item.sourceId}`);
        }
        expect(ids(await readAs(role)), role).toEqual(expected.sort());
      }
    });
  });

  describe('27.131 paging: 20 per page, newest first, at exactly 20 and at 21', () => {
    it('27.131 20 sources → one page, no cursor; one more → a cursor and a second page of one', async () => {
      // A SECOND target with no sources yet, so the visibility cases' counts above do not move.
      const T2 = world.world.taskInEpicId;
      const onT2 = (n: number) =>
        Array.from({ length: n }, () => makeCommitted({ workspaceId: WS, actorId: world.userIds.owner, entity: { kind: 'note', id: notes.NOTES.nWorkspace }, type: 'comment.added', payload: { body: body(chip(T2)) } }));
      await applyCommitted(db.pool, onT2(20));
      const eff = await resolveEffectiveRole(db.pool, world.userIds.owner, WS);
      const at20 = await listLinkedFrom(db.pool, eff, world.userIds.owner, WS, { kind: 'ticket', id: T2 }, null);
      expect([at20.items.length, at20.total, at20.nextCursor]).toEqual([20, 20, null]);
      await applyCommitted(db.pool, onT2(1));
      const first = await listLinkedFrom(db.pool, eff, world.userIds.owner, WS, { kind: 'ticket', id: T2 }, null);
      expect([first.items.length, first.total]).toEqual([20, 21]);
      expect(first.nextCursor).not.toBeNull();
      const second = await listLinkedFrom(db.pool, eff, world.userIds.owner, WS, { kind: 'ticket', id: T2 }, first.nextCursor);
      expect([second.items.length, second.nextCursor]).toEqual([1, null]);
      const all = [...first.items, ...second.items].map((i) => i.updatedAt);
      expect(all).toEqual([...all].sort().reverse()); // newest first
      expect(new Set([...first.items, ...second.items].map((i) => i.sourceId)).size).toBe(21);
    });
  });
  ```
  **Fixture counts.** `seedNotesIntoReadWorld` creates its notes with NO body (`notes-fixture.ts:279-302`, titles and scopes only) and attaches `nInherit` to `TE` (an attachment, not a chip), so before this file's own events nothing references `TARGET` or `T2`. Re-read those lines on the branch; if a body was added since, recount 27.126/27.129/27.131/27.132.
  27.131 runs last in the file because it writes 21 comments. 27.129 must run before it and after 27.126–27.128 (vitest runs a file's `it`s in order). Read `nWorkspace`'s and `nPrivate`'s titles in `notes-fixture.ts` and put the real title in 27.127's `toEqual` (`'Private'` above is a stand-in to replace). Do the same for `sharedTaskId`'s title in `read-scenario.ts:189`.

  Run: `pnpm turbo run build --filter=@gisik-nokma/domain > /tmp/kgb-build.log 2>&1; pnpm --filter @gisik-nokma/server exec vitest run test/read/linked-from.test.ts --maxWorkers=2 > /tmp/kgb-t2-red.log 2>&1; tail -20 /tmp/kgb-t2-red.log`. Expected: FAIL, module `read/linked-from.js` not found.

- [ ] **Step 4: Implement `listLinkedFrom`**

  In `apps/server/src/read/notes.ts:25`, change `const NOTE_PROJECT_LIVE_WHERE` to `export const NOTE_PROJECT_LIVE_WHERE`.

  `apps/server/src/read/linked-from.ts` (key composition copied from `attachedTicketsByNote`, `read/notes.ts:112-156`):
  ```ts
  import {
    LINKED_FROM_PAGE_SIZE,
    ticketKey,
    type LinkedFromPage,
    type LinkedFromRow,
    type LinkedFromTarget,
    type StateCategory,
  } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import type { EffectiveRole } from '../permissions/effective-role.js';
  import { workspaceIdentityFromLedger } from '../workspaces/workspace-name.js';
  import { NOTE_PROJECT_LIVE_WHERE } from './notes.js';
  import { SqlParams } from './sql-params.js';
  import { ticketNumbers } from './ticket-numbers.js';
  import { LIVE_TICKET_WHERE, visibleNotesWhere, visibleTicketsWhere } from './visible-where.js';
  import { projectPrefixesInWorkspace } from './visible-projects.js';

  /**
   * "Linked from" (Knowledge Graph spec B §2.2, §3.2): the ONLY read of
   * `proj_references`. A row is returned only when the viewer may see its SOURCE
   * — the ticket arm applies `visibleTicketsWhere` + `LIVE_TICKET_WHERE`, the
   * note arm `visibleNotesWhere` + `n.deleted = FALSE` + `NOTE_PROJECT_LIVE_WHERE`
   * (a comment is seen through its parent) — and `total` is counted from the
   * same statement, so a hidden source is never a count either. The target's
   * own visibility is the CALLER's check (routes/references.ts).
   *
   * One row per source (its lowest ordinal); a source that IS the target is
   * left out. Newest source first by `seq` (unique per source: one event wrote
   * its body), which is also the cursor.
   */
  type VisRow = {
    source_kind: 'ticket' | 'note' | 'comment';
    source_id: string;
    source_parent_kind: 'ticket' | 'note';
    source_parent_id: string;
    snippet: string;
    updated_by: string;
    updated_at: Date;
    seq: string;
    ticket_project_id: string | null;
    parent_title: string | null;
    ticket_state_category: StateCategory | null;
  };

  function visibleSources(eff: EffectiveRole, userId: string, workspaceId: string, target: LinkedFromTarget, params: SqlParams): string {
    const ws = params.add(workspaceId);
    const kind = params.add(target.kind);
    const id = params.add(target.id);
    const ticketArm = visibleTicketsWhere(eff, userId, params);
    const noteArm = visibleNotesWhere(eff, userId, params);
    return `WITH firsts AS (
        SELECT DISTINCT ON (r.source_kind, r.source_id)
               r.source_kind, r.source_id, r.source_parent_kind, r.source_parent_id, r.snippet, r.updated_by, r.updated_at, r.seq
          FROM proj_references r
         WHERE r.workspace_id = ${ws} AND r.target_kind = ${kind} AND r.target_id = ${id}
           AND NOT (r.source_kind = ${kind} AND r.source_id = ${id})
         ORDER BY r.source_kind, r.source_id, r.ordinal
      ),
      vis AS (
        SELECT f.*, t.project_id AS ticket_project_id, t.fields -> 'title' ->> 'value' AS parent_title, t.state_category AS ticket_state_category
          FROM firsts f
          JOIN proj_tickets t ON t.ticket_id = f.source_parent_id
          JOIN proj_visibility v ON v.ticket_id = f.source_parent_id
         WHERE f.source_parent_kind = 'ticket' AND t.workspace_id = ${ws} AND ${LIVE_TICKET_WHERE} AND ${ticketArm}
        UNION ALL
        SELECT f.*, NULL::text, n.title, NULL::text
          FROM firsts f
          JOIN proj_notes n ON n.note_id = f.source_parent_id
         WHERE f.source_parent_kind = 'note' AND n.workspace_id = ${ws} AND n.deleted = FALSE AND ${NOTE_PROJECT_LIVE_WHERE} AND ${noteArm}
      )`;
  }

  export async function listLinkedFrom(
    db: Queryable,
    eff: EffectiveRole,
    userId: string,
    workspaceId: string,
    target: LinkedFromTarget,
    cursor: string | null,
  ): Promise<LinkedFromPage> {
    const countParams = new SqlParams();
    const countSql = `${visibleSources(eff, userId, workspaceId, target, countParams)} SELECT count(*)::int AS n FROM vis`;
    const total = (await db.query<{ n: number }>(countSql, countParams.toArray())).rows[0]?.n ?? 0;
    if (total === 0) return { total: 0, items: [], nextCursor: null };

    const params = new SqlParams();
    const cte = visibleSources(eff, userId, workspaceId, target, params);
    const after = cursor === null ? '' : `WHERE seq < ${params.add(cursor)}::bigint`;
    const { rows } = await db.query<VisRow>(
      `${cte} SELECT * FROM vis ${after} ORDER BY seq DESC, source_kind, source_id LIMIT ${LINKED_FROM_PAGE_SIZE + 1}`,
      params.toArray(),
    );
    const page = rows.slice(0, LINKED_FROM_PAGE_SIZE);
    const ticketIds = page.filter((row) => row.source_parent_kind === 'ticket').map((row) => row.source_parent_id);
    const identity = await workspaceIdentityFromLedger(db, workspaceId);
    const prefixes = await projectPrefixesInWorkspace(db, workspaceId);
    const numbers = await ticketNumbers(db, workspaceId, ticketIds);
    const items = page.map((row): LinkedFromRow => {
      const base = { sourceKind: row.source_kind, sourceId: row.source_id, authorId: row.updated_by, snippet: row.snippet, updatedAt: row.updated_at.toISOString() };
      if (row.source_parent_kind === 'note') {
        return { ...base, parent: { kind: 'note', noteId: row.source_parent_id, title: row.parent_title ?? '' } };
      }
      const projectId = row.ticket_project_id ?? '';
      const projectPrefix = prefixes.get(projectId) ?? null;
      const number = numbers.get(row.source_parent_id) ?? null;
      const key = identity.prefix === null || projectPrefix === null || number === null ? '' : ticketKey(identity.prefix, projectPrefix, number);
      return {
        ...base,
        parent: { kind: 'ticket', ticketId: row.source_parent_id, projectId, key, title: row.parent_title ?? '', stateCategory: row.ticket_state_category ?? 'open' },
      };
    });
    const last = page[page.length - 1];
    return { total, items, nextCursor: rows.length > LINKED_FROM_PAGE_SIZE && last !== undefined ? String(last.seq) : null };
  }
  ```
  `f.*` in both arms: the `firsts` columns come first and in the same order, so the two `SELECT` lists line up for `UNION ALL`. If Postgres refuses a `NULL` column type in the note arm, cast each to the ticket arm's type (`NULL::text`), which the code above already does.

  Run the Step 3 command. Expected: PASS 27.126–27.131.

  Commit: `KG-B T2: listLinkedFrom (27.126–27.131)`.

- [ ] **Step 5: The route — failing tests, then the route (27.132–27.134)**

  `apps/server/test/routes/references.test.ts` (same world as Step 3; it is a separate file and so a separate database):
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { newUlid } from '@gisik-nokma/domain';
  import { applyCommitted, makeCommitted } from '../helpers/apply.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { seedNotesIntoReadWorld, type ReadWorldNotes } from '../helpers/notes-fixture.js';
  import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';

  let db: TestDatabase;
  let world: ReadWorld;
  let notes: ReadWorldNotes;
  beforeAll(async () => {
    db = await createTestDatabase();
    world = await buildReadTestApp(db);
    notes = await seedNotesIntoReadWorld(db.pool, {
      workspaceId: world.world.workspaceId, projectId: world.world.projectId, authorId: world.userIds.owner,
      guestUserId: world.userIds.guest, TP: world.world.taskInEpicId, TE: world.world.guestTaskId,
    });
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: world.world.workspaceId, actorId: world.userIds.owner, entity: { kind: 'note', id: notes.NOTES.nWorkspace }, type: 'note.body_set',
        payload: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'ticketRef', attrs: { ticketId: world.world.taskInEpicId, projectId: world.world.projectId, key: 'X-1', title: 'GST' } }] }] } },
      }),
    ]);
  });
  afterAll(async () => {
    await db.drop();
  });

  const get = (role: Parameters<ReadWorld['authOf']>[0], query: string, ws = world.world.workspaceId) =>
    world.app.inject({ method: 'GET', url: `/v1/workspaces/${ws}/references${query}`, headers: world.authOf(role) });

  describe('27.132 the route answers a visible target with the page', () => {
    it('27.132 200 with { total, items, nextCursor } for a ticket and for a note target', async () => {
      const ticket = await get('member', `?target=ticket:${world.world.taskInEpicId}`);
      expect(ticket.statusCode).toBe(200);
      expect(ticket.json()).toMatchObject({ total: 1, nextCursor: null, items: [{ sourceKind: 'note', sourceId: notes.NOTES.nWorkspace }] });
      const note = await get('member', `?target=note:${notes.NOTES.nWorkspace}`);
      expect(note.json()).toEqual({ total: 0, items: [], nextCursor: null });
    });
  });

  describe('27.133 an invisible, foreign or unknown target is the same 404', () => {
    it('27.133 the guest on a project-mode ticket, another workspace’s id and a random id all 404; the member is 200 (control)', async () => {
      const bodies = await Promise.all([
        get('guest', `?target=ticket:${world.world.taskInEpicId}`),
        get('member', `?target=ticket:${newUlid()}`),
        get('neighbour', `?target=ticket:${world.world.taskInEpicId}`, world.neighbour.workspaceId),
        get('member', `?target=note:${notes.NOTES.nPrivate}`),
      ]);
      for (const res of bodies) expect(res.statusCode).toBe(404);
      expect(new Set(bodies.map((res) => res.body)).size).toBe(1);
      expect((await get('member', `?target=ticket:${world.world.taskInEpicId}`)).statusCode).toBe(200);
    });
  });

  describe('27.134 malformed input is a 400 that names nothing back', () => {
    it('27.134 missing target, a person target, a bad cursor', async () => {
      expect((await get('owner', '')).json()).toEqual({ error: 'invalid_target' });
      expect((await get('owner', `?target=person:${world.userIds.owner}`)).statusCode).toBe(400);
      expect((await get('owner', `?target=ticket:${world.world.taskInEpicId}&cursor=abc`)).json()).toEqual({ error: 'invalid_cursor' });
      expect((await get('owner', `?target=ticket:${world.world.taskInEpicId}&cursor=999999`)).statusCode).toBe(200); // control
    });
  });
  ```
  Check `world.neighbour.workspaceId`'s field name in `read-app.ts:158` (`NeighbourWorkspace`) before relying on it.

  `apps/server/src/routes/references.ts` (shape copied from `routes/notes.ts:40-96`):
  ```ts
  import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
  import { parseLinkedFromTarget, type LinkedFromTarget } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { resolveEffectiveRole } from '../permissions/effective-role.js';
  import { getNoteStateFromDb } from '../projections/notes.js';
  import { listLinkedFrom } from '../read/linked-from.js';
  import { ticketIsLive } from '../read/live-ticket.js';
  import { canSee } from '../visibility/can-see.js';
  import { canReadNoteById } from '../visibility/can-read-note.js';
  import { NOT_FOUND_BODY } from './tickets.js';

  /**
   * `GET /v1/workspaces/:workspaceId/references?target=<ticket|note>:<id>&cursor=<seq>` —
   * "Linked from" (Knowledge Graph spec B §3.2). The TARGET is checked here (the
   * viewer must be able to see it, in THIS workspace); the sources are filtered by
   * `listLinkedFrom`. An invisible, foreign and unknown target are one 404.
   */
  async function targetVisible(db: Queryable, userId: string, workspaceId: string, target: LinkedFromTarget): Promise<boolean> {
    if (target.kind === 'ticket') {
      // `ticketIsLive` pins the workspace AND refuses a trashed ticket, like the detail route.
      return (await ticketIsLive(db, workspaceId, target.id)) && (await canSee(db, userId, target.id));
    }
    const state = await getNoteStateFromDb(db, target.id);
    if (state === null || state.workspaceId !== workspaceId) return false;
    return canReadNoteById(db, userId, target.id);
  }

  export function registerReferenceRoutes(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
    app.get<{ Params: { workspaceId: string }; Querystring: { target?: string; cursor?: string } }>(
      '/v1/workspaces/:workspaceId/references',
      { preHandler: requireSession },
      async (request, reply) => {
        const userId = request.currentUserId;
        const { workspaceId } = request.params;
        const target = parseLinkedFromTarget(request.query.target);
        if (target === null) return reply.code(400).send({ error: 'invalid_target' });
        const cursor = request.query.cursor ?? null;
        if (cursor !== null && !/^\d{1,18}$/.test(cursor)) return reply.code(400).send({ error: 'invalid_cursor' });
        if (!(await targetVisible(deps.pool, userId, workspaceId, target))) return reply.code(404).send(NOT_FOUND_BODY);
        const eff = await resolveEffectiveRole(deps.pool, userId, workspaceId);
        return listLinkedFrom(deps.pool, eff, userId, workspaceId, target, cursor);
      },
    );
  }
  ```
  In `apps/server/src/app.ts`, import it beside `registerNoteRoutes` (`:47`) and register after `registerNoteRoutes(app, { pool: deps.pool }, requireSession);` (`:936`):
  ```ts
    // "Linked from" (Knowledge Graph spec B): the one read of proj_references.
    registerReferenceRoutes(app, { pool: deps.pool }, requireSession);
  ```
  `getNoteStateFromDb` returns a state whose workspace field is named in `projections/notes.ts`; read its return type and use the real field name.

  Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/references.test.ts test/read/linked-from.test.ts --maxWorkers=2 > /tmp/kgb-t2.log 2>&1; tail -20 /tmp/kgb-t2.log`. Expected: PASS 27.126–27.134.

  Commit: `KG-B T2: GET /v1/workspaces/:id/references (27.132–27.134)`.

- [ ] **Step 6: Catalogue, mutations, DONE**
  - Id lines under `<!-- KG-B T2 -->`: 27.125–27.134 ✅. 27.135–27.139 reserved, unused (plain line).
  - Features §24.B bullet above the anchor: `⚙️ **"Linked from" read and route** (KG-B T2; `apps/server/src/read/linked-from.ts`, `apps/server/src/routes/references.ts`, `packages/domain/src/linked-from.ts`) — GET /v1/workspaces/:id/references?target=ticket|note:<id>, 20 per page newest first, one row per source; a row only when the viewer can see its SOURCE (ticket, note, or a comment's parent), a trashed source hidden, the count from the same predicate; an invisible target is the uniform 404. Cases 27.125–27.134.`
  - Mutations:

    | Case | Mutation |
    |---|---|
    | 27.126 | the ticket arm's `${ticketArm}` → `TRUE` |
    | 27.126 | `total` counted from `firsts` instead of `vis` |
    | 27.128 | drop the `NOT (r.source_kind = … )` line |
    | 27.129 | drop `${LIVE_TICKET_WHERE}` |
    | 27.131 | `LIMIT ${LINKED_FROM_PAGE_SIZE + 1}` → `LIMIT ${LINKED_FROM_PAGE_SIZE}` |
    | 27.133 | drop `ticketIsLive(...)` from `targetVisible` |

  - Sweeps: build domain; domain WHOLE; server `test/read`, `test/routes`, `test/visibility`; `check:citations`. LOCAL.

  Push. DONE.

---

### Task 3: The app: `getLinkedFrom`, the section on the ticket sheet and the note, the comment scroll, help (cases 27.140–27.164)

Invoke `frontend-design:frontend-design` for this task (house rule for UI work). `NEEDS: browser` (desktop and 390 px).

**Files:**
- Create:
  - `packages/app-core/src/views/linked-from-section.tsx`
  - `packages/app-core/test/views/linked-from-section.test.tsx`
  - `packages/app-core/test/online/linked-from-mapper.test.ts`
- Modify:
  - `packages/app-core/src/data-source.ts` (beside `getNotesForTicket`, `:387`)
  - `packages/app-core/src/online/mappers.ts` (after `mapNoteSummaries`, `:2833`), `online/online-data-source.ts` (beside `getNotesForTicket`, `:463`)
  - `packages/app-core/src/replica/replica-data-source.ts` (an absence constant beside `NOTE_SEARCH_ABSENCES` `:425`; the method beside `searchNotes` `:1343`; `REPLICA_GAPS` last key)
  - `packages/app-core/src/views/ticket-sheet.tsx` (a live query after `notes`, `:1026-1028`; the mount between `<TicketNotesSection … />` `:4424-4435` and the `THE COMMENT THREAD AND ITS BOX` comment `:4437`; the hash-scroll effect after `comments`, `:1015-1017`)
  - `packages/app-core/src/index.ts` (beside `TicketNotesSection`, `:125`)
  - `packages/app-core/test/helpers/fake-data-source.ts` (a default)
  - `packages/app-core/test/replica/replica-data-source.test.ts` (12.185's list, `:489+`)
  - `packages/app-core/test/views/ticket-notes-section.test.tsx` (no edit; it must stay green)
  - `apps/server/test/integration/soft-delete-client-surface.test.ts` (`AbsenceDecision` `:470-505`, `DECIDED`, `callers` `:742+`, the fixture `:417+`)
  - `apps/web/src/notes/note-document.tsx` (between the editor `</div>` `:785` and `<NoteComments` `:787`)
  - `apps/web/test/helpers/stub-services.ts` (a default), `apps/web/test/note-document.test.tsx`
  - `packages/ui/src/ui.css` (after `.gn-ticket-sheet__note-badges`, `:3473`)
  - `docs/manual.md` §15 (`### Linking to a ticket or another note` `:1979`, and the last bullet of `### What notes cannot do yet` `:2019`), then `pnpm help:generate`
  - `Features.md` §24.B, `test-cases/27-knowledge-graph.md`

**Interfaces:**
- **Consumes:** `LinkedFromPage`, `LinkedFromRow`, `LinkedFromTarget`, `EMPTY_LINKED_FROM`, `linkedFromSourceTitle`, `splitSnippet` (Task 2); the route (Task 2).
- **Produces:**
  - `DataSourceQuery.getLinkedFrom(workspaceId: string, target: LinkedFromTarget, cursor?: string): Promise<LinkedFromPage>`;
  - `mapLinkedFromPage(raw: unknown): LinkedFromPage`;
  - `LinkedFromSection(props: LinkedFromSectionProps)`, `linkedFromHref(row, ticketHref): string | null`, exported from `@gisik-nokma/app-core`.

- [ ] **Step 1: `getLinkedFrom` on every source — failing tests (27.140–27.142)**

  `packages/app-core/test/online/linked-from-mapper.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { MappingError, mapLinkedFromPage } from '../../src/online/mappers.js';
  import { createOnlineDataSource } from '../../src/online/online-data-source.js';

  const WS = '01J9GWS0000000000000000000';
  const T = '01J9GTKT000000000000000000';
  const ROW = {
    sourceKind: 'comment', sourceId: 'C1', authorId: 'u1', snippet: 'per [[X-1 Invoices]]', updatedAt: '2026-10-03T10:00:00.000Z',
    parent: { kind: 'ticket', ticketId: T, projectId: 'P', key: 'GN-1', title: 'Shared', stateCategory: 'active' },
  };

  describe('27.140 the online source maps the page and folds a 404 to an empty page', () => {
    it('27.140 a page maps field by field; a malformed row is a MappingError; a 404 is EMPTY (control: 200 is not)', async () => {
      expect(mapLinkedFromPage({ total: 1, items: [ROW], nextCursor: null })).toEqual({ total: 1, items: [ROW], nextCursor: null });
      expect(() => mapLinkedFromPage({ total: 1, items: [{ ...ROW, parent: { kind: 'project' } }], nextCursor: null })).toThrow(MappingError);
      const calls: string[] = [];
      const fetchImpl = async (input: string) => {
        calls.push(input);
        const ok = input.includes(`target=ticket%3A${T}`);
        return { ok, status: ok ? 200 : 404, json: async () => ({ total: 1, items: [ROW], nextCursor: '42' }) } as Response;
      };
      const source = createOnlineDataSource({ baseUrl: 'http://server.test', fetchImpl });
      expect((await source.query.getLinkedFrom(WS, { kind: 'ticket', id: T })).nextCursor).toBe('42');
      expect(await source.query.getLinkedFrom(WS, { kind: 'note', id: T })).toEqual({ total: 0, items: [], nextCursor: null });
      await source.query.getLinkedFrom(WS, { kind: 'ticket', id: T }, '42');
      expect(calls.at(-1)).toBe(`http://server.test/v1/workspaces/${WS}/references?target=ticket%3A${T}&cursor=42`);
    });
  });
  ```
  In `packages/app-core/test/replica/replica-data-source.test.ts`, 12.185's `refusals` list: append as the LAST element, after `putPreferences`:
  ```ts
      // Added by Knowledge Graph B (case 27.141), LAST because REPLICA_GAPS gained the key last: the local
      // store holds no reference index, and an empty page would claim nothing links here.
      ['getLinkedFrom', () => ds.query.getLinkedFrom(WS, { kind: 'ticket', id: newUlid() })],
  ```
  and rename the case title's count word (`ELEVEN`) to the new count you measure from the list, plus `27.141` in the title.

  `apps/server/test/integration/soft-delete-client-surface.test.ts` (27.142):
  - add `| 'getLinkedFrom'` as the last member of `AbsenceDecision` (after `'purgedAmong'`);
  - in the fixture, directly after the two notes are created and before `TOMBSTONES.push(...)` (`:441`), plant the marker's route into "Linked from":
    ```ts
    // ⚠ A COMMENT ON THE CHILD THAT LINKS THE LIVE NOTE, carrying the marker (Knowledge Graph B, 27.142):
    // without it the `getLinkedFrom` row below would be a `carries: true` row that construes nothing.
    await post({
      workspaceId,
      entity: { kind: 'ticket', id: childId },
      type: 'comment.added',
      payload: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Linked ${MARKER} ` }, { type: 'wikiLink', attrs: { noteId, title: 'Boundary note live' } }] }] } },
    });
    ```
  - `DECIDED` row:
    ```ts
    getLinkedFrom: {
      verdict: 'excluded',
      carries: true,
      why: 'Knowledge Graph B: the live note is linked from a comment on the child, and the snippet quotes the marker. The read hides a source whose parent ticket is tombstoned (`LIVE_TICKET_WHERE` in `read/linked-from.ts`’s ticket arm), so after the delete the row, its snippet and its count are gone.',
    },
    ```
  - `callers`: `getLinkedFrom: () => ds.getLinkedFrom(workspaceId, { kind: 'note', id: noteId }),`.

  Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/online/linked-from-mapper.test.ts test/replica/replica-data-source.test.ts --maxWorkers=2 > /tmp/kgb-t3-red.log 2>&1; tail -20 /tmp/kgb-t3-red.log`. Expected: FAIL (`getLinkedFrom` is not a function; `mapLinkedFromPage` not exported).

- [ ] **Step 2: Implement `getLinkedFrom` on the interface, the online source, the replica and the fakes**

  `packages/app-core/src/data-source.ts`, after `getNotesForTicket` (`:387`):
  ```ts
    /**
     * "Linked from" (Knowledge Graph spec B §3): the sources that reference a
     * ticket or note and that this viewer may see, twenty per page, newest first.
     * An invisible target answers the EMPTY page (the route's 404), the
     * `getNotesForTicket` treatment: "nothing links here" and "you may not ask"
     * are one answer on purpose.
     */
    getLinkedFrom(workspaceId: string, target: LinkedFromTarget, cursor?: string): Promise<LinkedFromPage>;
  ```
  (import the two types from `@gisik-nokma/domain` at the top; mind the docblock rule at `:361-365`: no braces inside this block.)

  `packages/app-core/src/online/mappers.ts`, after `mapNoteSummaries`:
  ```ts
  /** `GET /v1/workspaces/:id/references` (Knowledge Graph B). */
  export function mapLinkedFromPage(raw: unknown): LinkedFromPage {
    const record = asRecord(raw, 'linkedFrom');
    const items = asArray(record['items'], 'linkedFrom.items').map((entry, index): LinkedFromRow => {
      const path = `linkedFrom.items[${index}]`;
      const row = asRecord(entry, path);
      const parent = asRecord(row['parent'], `${path}.parent`);
      const sourceKind = asString(row['sourceKind'], `${path}.sourceKind`);
      if (sourceKind !== 'ticket' && sourceKind !== 'note' && sourceKind !== 'comment') {
        throw new MappingError(`${path}.sourceKind`, 'ticket | note | comment', sourceKind);
      }
      const parentKind = parent['kind'];
      const mapped: LinkedFromRow['parent'] =
        parentKind === 'ticket'
          ? {
              kind: 'ticket',
              ticketId: asString(parent['ticketId'], `${path}.parent.ticketId`),
              projectId: asString(parent['projectId'], `${path}.parent.projectId`),
              key: asString(parent['key'], `${path}.parent.key`),
              title: asString(parent['title'], `${path}.parent.title`),
              stateCategory: asStateCategory(parent['stateCategory'], `${path}.parent.stateCategory`),
            }
          : parentKind === 'note'
            ? { kind: 'note', noteId: asString(parent['noteId'], `${path}.parent.noteId`), title: asString(parent['title'], `${path}.parent.title`) }
            : (() => {
                throw new MappingError(`${path}.parent.kind`, 'ticket | note', parentKind);
              })();
      return {
        sourceKind,
        sourceId: asString(row['sourceId'], `${path}.sourceId`),
        parent: mapped,
        authorId: asString(row['authorId'], `${path}.authorId`),
        snippet: asString(row['snippet'], `${path}.snippet`),
        updatedAt: asString(row['updatedAt'], `${path}.updatedAt`),
      };
    });
    const next = record['nextCursor'];
    return {
      total: asNumber(record['total'], 'linkedFrom.total'),
      items,
      nextCursor: next === null ? null : asString(next, 'linkedFrom.nextCursor'),
    };
  }
  ```
  Read `MappingError`'s constructor in `mappers.ts` before the two `throw`s and pass its real arguments.

  `online-data-source.ts`, after `getNotesForTicket`:
  ```ts
    getLinkedFrom: async (workspaceId, target, cursor) => {
      const q = new URLSearchParams({ target: `${target.kind}:${target.id}` });
      if (cursor !== undefined) q.set('cursor', cursor);
      const raw = await http.get(`/v1/workspaces/${workspaceId}/references?${q.toString()}`);
      return raw === null ? EMPTY_LINKED_FROM : mapLinkedFromPage(raw);
    },
  ```
  `replica-data-source.ts`: beside `NOTE_SEARCH_ABSENCES`:
  ```ts
  const LINKED_FROM_ABSENCES: readonly ReplicaAbsence[] = [
    {
      field: 'LinkedFromPage (every field)',
      because: 'the device holds no reference index (proj_references is server-side) and no audience for another person’s notes; an empty page would claim nothing links here',
      owner: 'a local reference table folded from the replicated bodies, and the note/ticket audiences to filter it',
    },
  ];
  ```
  the method beside `searchNotes`: `getLinkedFrom: () => Promise.reject(new ReplicaGapError('getLinkedFrom', LINKED_FROM_ABSENCES)),` and `getLinkedFrom: LINKED_FROM_ABSENCES,` as the LAST key of `REPLICA_GAPS` (after `putPreferences`).

  `packages/app-core/test/helpers/fake-data-source.ts`: `getLinkedFrom: async () => ({ total: 0, items: [], nextCursor: null }),` beside `getNotesForTicket` with the same comment shape as its neighbours ("a view test that has not stubbed this read is rendering an item nothing links to").

  `apps/web/test/helpers/stub-services.ts`: `getLinkedFrom: async () => ({ total: 0, items: [], nextCursor: null }),` with the `purgedAmong` argument: every ticket sheet and note document asks it in the background; "nothing links here" is what every page showed before the read existed, so a case that does not care is not made to stub it.

  Run the Step 1 command, then `pnpm turbo run build --filter=@gisik-nokma/app-core > /tmp/kgb-build.log 2>&1; tail -3 /tmp/kgb-build.log; pnpm --filter @gisik-nokma/server exec vitest run test/integration/soft-delete-client-surface.test.ts test/integration/client-contract.test.ts --maxWorkers=2 > /tmp/kgb-t3-int.log 2>&1; tail -20 /tmp/kgb-t3-int.log`. Expected: PASS 27.140–27.142 and both integration files green. (The `absenceTripwire` resolves through `app-core`'s `dist`: build first, or tsc passes on a stale type.)

  Commit: `KG-B T3: getLinkedFrom on online, replica and fakes (27.140–27.142)`.

- [ ] **Step 3: The section — failing tests (27.143–27.148)**

  `packages/app-core/test/views/linked-from-section.test.tsx`:
  ```tsx
  import { act, cleanup, render, screen, within } from '@testing-library/react';
  import { userEvent } from '@testing-library/user-event';
  import { afterEach, describe, expect, it, vi } from 'vitest';
  import type { LinkedFromPage, LinkedFromRow } from '@gisik-nokma/domain';
  import { LinkedFromSection, linkedFromHref } from '../../src/views/linked-from-section.js';
  import type { LiveQueryResult } from '../../src/views/use-live-query.js';

  afterEach(cleanup);

  const T = '01J9GTKT000000000000000000';
  const N = '01J9GNTE000000000000000000';
  function row(i: number, over: Partial<LinkedFromRow> = {}): LinkedFromRow {
    return {
      sourceKind: 'ticket', sourceId: `S${i}`, authorId: 'u_ama', snippet: `line ${i} [[GN-142 Chiller]] end`, updatedAt: '2026-10-03T10:00:00.000Z',
      parent: { kind: 'ticket', ticketId: `S${i}`, projectId: 'P', key: `GN-${i}`, title: `Source ${i}`, stateCategory: 'active' }, ...over,
    };
  }
  function live(data: LinkedFromPage | null, error: string | null = null): LiveQueryResult<LinkedFromPage> {
    return { data, error, settled: data !== null || error !== null, hasAnswered: data !== null, reload: vi.fn() } as unknown as LiveQueryResult<LinkedFromPage>;
  }
  const props = (page: LiveQueryResult<LinkedFromPage>, over: Partial<Parameters<typeof LinkedFromSection>[0]> = {}) => ({
    page,
    loadMore: vi.fn(async () => ({ total: 0, items: [], nextCursor: null })),
    hrefOf: (r: LinkedFromRow) => linkedFromHref(r, (ref) => `/t/${ref.ticketId}`),
    nameOf: (id: string) => (id === 'u_ama' ? 'Ama Rangsa' : id),
    ...over,
  });

  describe('27.143 the section draws its heading, count, glyphs, names and the marked snippet', () => {
    it('27.143 a ticket, a note and a comment row; the snippet’s reference is a <mark>', () => {
      const page = { total: 3, nextCursor: null, items: [
        row(1),
        row(2, { sourceKind: 'note', sourceId: N, parent: { kind: 'note', noteId: N, title: 'Phone pass rulings' } }),
        row(3, { sourceKind: 'comment', sourceId: 'C9', parent: { kind: 'ticket', ticketId: 'S3', projectId: 'P', key: 'GN-160', title: 'x', stateCategory: 'open' } }),
      ] };
      render(<LinkedFromSection {...props(live(page))} />);
      const section = screen.getByTestId('linked-from');
      expect(within(section).getByRole('heading').textContent).toBe('Linked from3');
      const items = within(section).getAllByRole('listitem');
      expect(items.map((li) => li.querySelector('.gn-linked-from__name')?.textContent)).toEqual([
        'GN-1 Source 1', 'Note: Phone pass rulings', 'Comment on GN-160 by Ama Rangsa',
      ]);
      expect(items[0]!.querySelector('mark')?.textContent).toBe('GN-142 Chiller');
      expect(items[0]!.querySelector('.gn-linked-from__dot--active')).not.toBeNull();
      expect(items[1]!.querySelector('.gn-linked-from__glyph--note')).not.toBeNull();
      expect(items[2]!.querySelector('.gn-linked-from__glyph--comment')).not.toBeNull();
    });
  });

  describe('27.144 nothing to say: the section is absent', () => {
    it('27.144 total 0 and a load in flight render nothing; one row renders the section (control)', () => {
      const { container, rerender } = render(<LinkedFromSection {...props(live({ total: 0, items: [], nextCursor: null }))} />);
      expect(container.innerHTML).toBe('');
      rerender(<LinkedFromSection {...props(live(null))} />);
      expect(container.innerHTML).toBe('');
      rerender(<LinkedFromSection {...props(live({ total: 1, items: [row(1)], nextCursor: null }))} />);
      expect(screen.getByTestId('linked-from')).toBeTruthy();
    });
  });

  describe('27.145 a snippet with no marker is drawn as plain text', () => {
    it('27.145 no <mark>, the words intact', () => {
      render(<LinkedFromSection {...props(live({ total: 1, items: [row(1, { snippet: 'plain words' })], nextCursor: null }))} />);
      expect(screen.getByTestId('linked-from').querySelector('mark')).toBeNull();
      expect(screen.getByText('plain words')).toBeTruthy();
    });
  });

  describe('27.146 a click opens the source; a comment opens its parent at the comment', () => {
    it('27.146 onNavigate gets the ticket path, the note path, and path#comment-<id>', async () => {
      const onNavigate = vi.fn();
      const page = { total: 3, nextCursor: null, items: [
        row(1),
        row(2, { sourceKind: 'note', sourceId: N, parent: { kind: 'note', noteId: N, title: 'R' } }),
        row(3, { sourceKind: 'comment', sourceId: 'C9', parent: { kind: 'note', noteId: N, title: 'R' } }),
      ] };
      render(<LinkedFromSection {...props(live(page), { onNavigate })} />);
      for (const link of screen.getAllByRole('link')) await userEvent.click(link);
      expect(onNavigate.mock.calls.map((c) => c[0])).toEqual(['/t/S1', `/notes/${N}`, `/notes/${N}#comment-C9`]);
      expect(linkedFromHref(row(4), () => null)).toBeNull(); // no ticket href → not a link
    });
  });

  describe('27.147 "Show all N" pages the rest from the same read', () => {
    it('27.147 21 sources: 20 drawn and a Show all 21 button; clicking loads the 21st and the button goes', async () => {
      const first = { total: 21, nextCursor: '100', items: Array.from({ length: 20 }, (_, i) => row(i)) };
      const loadMore = vi.fn(async (cursor: string) => (cursor === '100' ? { total: 21, nextCursor: null, items: [row(20)] } : { total: 21, nextCursor: null, items: [] }));
      render(<LinkedFromSection {...props(live(first), { loadMore })} />);
      expect(screen.getAllByRole('listitem')).toHaveLength(20);
      await userEvent.click(screen.getByRole('button', { name: 'Show all 21' }));
      expect(loadMore).toHaveBeenCalledWith('100');
      expect(screen.getAllByRole('listitem')).toHaveLength(21);
      expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
    });
  });

  describe('27.148 a failed read says so, in one line', () => {
    it('27.148 an error renders the heading and an alert; a good read has no alert (control)', () => {
      const { rerender } = render(<LinkedFromSection {...props(live(null, 'answered 500'))} />);
      expect(screen.getByRole('alert').textContent).toContain('answered 500');
      rerender(<LinkedFromSection {...props(live({ total: 1, items: [row(1)], nextCursor: null }))} />);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
  ```
  Read `LiveQueryResult`'s real fields in `use-live-query.ts` and make `live()` build exactly those (the cast only hides fields the section does not read; the ones it reads must be real).

- [ ] **Step 4: Implement `LinkedFromSection`**

  `packages/app-core/src/views/linked-from-section.tsx` (shape copied from `ticket-notes-section.tsx`: caption class, the error sentence, the testid):
  ```tsx
  import { useState, type MouseEvent } from 'react';
  import { linkedFromSourceTitle, splitSnippet, type LinkedFromPage, type LinkedFromRow } from '@gisik-nokma/domain';
  import { PageIcon } from '@gisik-nokma/ui';
  import type { LiveQueryResult } from './use-live-query.js';

  export type LinkedFromSectionProps = {
    page: LiveQueryResult<LinkedFromPage>;
    loadMore: (cursor: string) => Promise<LinkedFromPage>;
    hrefOf: (row: LinkedFromRow) => string | null;
    nameOf: (userId: string) => string;
    onNavigate?: (href: string) => void;
  };

  /** Where a row opens (spec B §3.1): the source; a comment opens its parent at `#comment-<id>`. */
  export function linkedFromHref(
    row: LinkedFromRow,
    ticketHref: (ref: { ticketId: string; projectId: string }) => string | null,
  ): string | null {
    const parent = row.parent;
    const base = parent.kind === 'ticket' ? ticketHref({ ticketId: parent.ticketId, projectId: parent.projectId }) : `/notes/${parent.noteId}`;
    if (base === null) return null;
    return row.sourceKind === 'comment' ? `${base}#comment-${row.sourceId}` : base;
  }

  function Glyph({ row }: { row: LinkedFromRow }) {
    if (row.sourceKind === 'comment') return <span className="gn-linked-from__glyph gn-linked-from__glyph--comment" aria-hidden="true">”</span>;
    if (row.parent.kind === 'note') return <span className="gn-linked-from__glyph gn-linked-from__glyph--note" aria-hidden="true"><PageIcon /></span>;
    return <span className={`gn-linked-from__dot gn-linked-from__dot--${row.parent.stateCategory}`} aria-hidden="true" />;
  }

  function Snippet({ snippet }: { snippet: string }) {
    const parts = splitSnippet(snippet);
    if (parts === null) return <span className="gn-linked-from__snippet">{snippet}</span>;
    return (
      <span className="gn-linked-from__snippet">
        {parts.before}
        <mark>{parts.marked}</mark>
        {parts.after}
      </span>
    );
  }

  /**
   * "Linked from" (Knowledge Graph spec B §3.1): the sources that reference this
   * ticket or note and that the viewer may see. ABSENT while loading and when
   * nothing links here ("nothing to say"); a failed read says so in one line,
   * the `TicketNotesSection` sentence.
   */
  export function LinkedFromSection({ page, loadMore, hrefOf, nameOf, onNavigate }: LinkedFromSectionProps) {
    const [extra, setExtra] = useState<{ forPage: LinkedFromPage; rows: LinkedFromRow[] } | null>(null);
    const [loading, setLoading] = useState(false);
    const [moreError, setMoreError] = useState<string | null>(null);

    if (page.error !== null) {
      return (
        <section className="gn-linked-from" data-testid="linked-from">
          <h3 className="gn-ticket-sheet__caption">Linked from</h3>
          <p className="gn-linked-from__error" role="alert">
            {`What links here could not be read: ${page.error}. That is a failure of this read, not a statement about this item: it may answer on a retry.`}
          </p>
        </section>
      );
    }
    const first = page.data;
    if (first === null || first.total === 0) return null;
    // Rows paged in by "Show all" belong to the first page they were loaded under; a reload starts over.
    const rows = [...first.items, ...(extra !== null && extra.forPage === first ? extra.rows : [])];

    async function showAll(start: LinkedFromPage): Promise<void> {
      setLoading(true);
      setMoreError(null);
      const collected: LinkedFromRow[] = [];
      let cursor = start.nextCursor;
      try {
        while (cursor !== null) {
          const next = await loadMore(cursor);
          collected.push(...next.items);
          cursor = next.nextCursor;
        }
        setExtra({ forPage: start, rows: collected });
      } catch (cause) {
        setMoreError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    }

    const open = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (onNavigate === undefined) return;
      event.preventDefault();
      onNavigate(href);
    };

    return (
      <section className="gn-linked-from" data-testid="linked-from">
        <h3 className="gn-ticket-sheet__caption">
          Linked from<span className="gn-linked-from__count">{first.total}</span>
        </h3>
        <ul className="gn-linked-from__list">
          {rows.map((row) => {
            const name = `${linkedFromSourceTitle(row)}${row.sourceKind === 'comment' ? ` by ${nameOf(row.authorId)}` : ''}`;
            const body = (
              <>
                <Glyph row={row} />
                <span className="gn-linked-from__name">{name}</span>
                <Snippet snippet={row.snippet} />
              </>
            );
            const href = hrefOf(row);
            return (
              <li key={`${row.sourceKind}:${row.sourceId}`} className="gn-linked-from__row">
                {href === null ? <span className="gn-linked-from__link">{body}</span> : <a className="gn-linked-from__link" href={href} onClick={open(href)}>{body}</a>}
              </li>
            );
          })}
        </ul>
        {first.total > rows.length ? (
          <button type="button" className="gn-button gn-button--ghost gn-linked-from__more" disabled={loading} onClick={() => void showAll(first)}>
            {`Show all ${first.total}`}
          </button>
        ) : null}
        {moreError === null ? null : <p className="gn-linked-from__error" role="alert">{`The rest could not be read: ${moreError}.`}</p>}
      </section>
    );
  }
  ```
  Check `PageIcon`'s props in `packages/ui/src/select/select-icons.ts(x)` (exported at `packages/ui/src/index.ts:68`) and pass what it requires. Export from `packages/app-core/src/index.ts` after `:125`:
  `export { LinkedFromSection, linkedFromHref, type LinkedFromSectionProps } from './views/linked-from-section.js';`

  CSS in `packages/ui/src/ui.css`, directly after `.gn-ticket-sheet__note-badges { … }` (`:3473`), not at EOF:
  ```css
  /* Knowledge Graph B: "Linked from" */
  .gn-linked-from { margin-top: 1rem; }
  .gn-linked-from__count { margin-left: 0.5rem; padding: 0 0.4rem; border-radius: 999px; font-size: 0.75rem; line-height: 1.25rem; background: var(--gn-surface-2); color: var(--gn-text-muted); }
  .gn-linked-from__list { list-style: none; margin: 0.5rem 0; padding: 0; display: grid; gap: 0.5rem; }
  .gn-linked-from__link { display: grid; grid-template-columns: 1rem 1fr; column-gap: 0.5rem; align-items: start; color: inherit; text-decoration: none; padding: 0.25rem; border-radius: 0.5rem; }
  a.gn-linked-from__link:hover, a.gn-linked-from__link:focus-visible { background: var(--gn-surface-2); }
  .gn-linked-from__name { font-weight: 600; overflow-wrap: anywhere; }
  .gn-linked-from__snippet { grid-column: 2; color: var(--gn-text-muted); font-size: 0.875rem; overflow-wrap: anywhere; }
  .gn-linked-from__snippet mark { background: var(--gn-highlight); color: inherit; border-radius: 0.2rem; padding: 0 0.1rem; }
  .gn-linked-from__dot { width: 0.5rem; height: 0.5rem; margin: 0.4rem 0.25rem; border-radius: 50%; }
  .gn-linked-from__dot--open { background: var(--gn-category-open); }
  .gn-linked-from__dot--active { background: var(--gn-category-active); }
  .gn-linked-from__dot--terminal { background: var(--gn-category-terminal); }
  .gn-linked-from__glyph { display: inline-flex; justify-content: center; color: var(--gn-text-muted); }
  ```
  `--gn-category-*` exist (`ui.css:248-250`). Before writing, grep `packages/ui/src/tokens.ts` for the real names of a second surface, a muted text and a highlight token; replace `--gn-surface-2`, `--gn-text-muted` and `--gn-highlight` with them and name your choices in DONE. Check both themes in the browser step.

  Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/views/linked-from-section.test.tsx --maxWorkers=2 > /tmp/kgb-t3-sec.log 2>&1; tail -20 /tmp/kgb-t3-sec.log`. Expected: PASS 27.143–27.148.

  Commit: `KG-B T3: LinkedFromSection (27.143–27.148)`.

- [ ] **Step 5: Mount on the ticket sheet, and scroll to `#comment-<id>` (27.149–27.151)**

  Tests, appended to `packages/app-core/test/views/linked-from-section.test.tsx` (mounting `<TicketSheet>` with `createFakeDataSource` and the `MINIMAL_READ` shape copied from `test/views/ticket-notes-section.test.tsx:64-80`; copy the props that file passes to `TicketSheet`):
  - **27.149** the sheet asks `getLinkedFrom(WS, { kind: 'ticket', id: TICKET })` once; with one row the `linked-from` section is in the Details tab, AFTER `[data-testid="ticket-notes"]` and BEFORE the comment thread's first element (`Node.compareDocumentPosition` both ways). Control in the same `it`: with `total: 0`, no `linked-from` element.
  - **27.150** with `window.location.hash = '#comment-c1'` and `getTicketComments` answering one comment `c1`, `Element.prototype.scrollIntoView` (spied with `vi.spyOn`, defined on the prototype first since jsdom lacks it) is called once on `#comment-c1`; after `comments.reload()` it is NOT called again; with `#heading-x` it is never called (control). Reset the hash in `afterEach`.
  - **27.151** a click on a comment row calls the sheet's `onNavigate` with `<resolveTicketHref result>#comment-<id>`.

  Implementation in `ticket-sheet.tsx`:
  - after the `notes` live query (`:1026-1028`):
    ```ts
    /** "Linked from" (Knowledge Graph B): the first page; "Show all" pages the rest through the same read. */
    const linkedFrom = useLiveQuery(dataSource, workspaceId, `${ticketId}:linked-from`, () =>
      dataSource.query.getLinkedFrom(workspaceId, { kind: 'ticket', id: ticketId }),
    );
    ```
  - after the `comments` live query (`:1015-1017`), the hash scroll, copied from `apps/web/src/notes/note-comments.tsx:92-106`:
    ```ts
    // A "Linked from" row (or a notification) opens `<sheet>#comment-<id>`. The thread
    // is fetched after the sheet paints, so once it is here bring the named comment
    // into view — once per hash, so a later reload does not pull the reader back.
    const scrolledCommentHash = useRef<string | null>(null);
    useEffect(() => {
      if (comments.data == null || typeof window === 'undefined') return;
      const hash = window.location.hash;
      if (!hash.startsWith('#comment-') || scrolledCommentHash.current === hash) return;
      const target = document.getElementById(hash.slice(1));
      if (target === null) return;
      scrolledCommentHash.current = hash;
      target.scrollIntoView?.({ block: 'center' });
    }, [comments.data]);
    ```
    (`CommentsThread` gives each comment `id="comment-<commentId>"`, `comments-thread.tsx:192`, `:242`.)
  - the mount, between the `<TicketNotesSection … />` element (ends `:4435`) and the `{/* THE COMMENT THREAD AND ITS BOX` comment (`:4437`):
    ```tsx
          {/*
            "LINKED FROM" (Knowledge Graph spec B §3.1) — after the ticket's own
            content (fields, spec A's Links, Notes) and before the conversation.
            The spec's "end of Details, below Links" cannot hold both ways: Links
            sits above Notes and the thread is the tab's last block, so this is
            the last block that is ABOUT the ticket.
          */}
          <LinkedFromSection
            page={linkedFrom}
            loadMore={(cursor) => dataSource.query.getLinkedFrom(workspaceId, { kind: 'ticket', id: ticketId }, cursor)}
            hrefOf={(row) => linkedFromHref(row, (ref) => resolveTicketHref?.(ref) ?? null)}
            nameOf={nameOf}
            {...(onNavigate === undefined ? {} : { onNavigate })}
          />
    ```
  Import `LinkedFromSection`, `linkedFromHref` from `./linked-from-section.js`; confirm `useEffect`/`useRef` are already imported in the file's `react` import. `nameOf` and `resolveTicketHref`'s argument shape are NOT verified by this plan: read the sheet's own name resolver (what `CommentsThread` is given for author names) and `resolveTicketHref?`'s type at `:277`, and adapt the two lambdas to them.

  Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/views --maxWorkers=2 > /tmp/kgb-t3-views.log 2>&1; tail -15 /tmp/kgb-t3-views.log`. Expected: PASS 27.149–27.151 and every existing view test green (in particular `ticket-notes-section.test.tsx` and `ticket-sheet-comments.test.tsx`).

  Commit: `KG-B T3: Linked from on the ticket sheet; comment hash scroll (27.149–27.151)`.

- [ ] **Step 6: Mount on the note document (27.152–27.153)**

  Tests in `apps/web/test/note-document.test.tsx` (extend `world()` with an optional `getLinkedFrom` and pass it to `stubServices` the way `getNoteComments` is passed at `:125`):
  - **27.152** with `getLinkedFrom` answering one ticket row for `{ kind: 'note', id: NOTE }`, `screen.getByTestId('linked-from')` exists, is AFTER `[data-testid="note-editor"]` and BEFORE the comments region; the stub was called with `(WS_A, { kind: 'note', id: NOTE })`. Control: the default stub (total 0) renders no `linked-from`.
  - **27.153** a click on a note-comment row calls `routerPush` with `/notes/<id>#comment-<cid>`; a ticket row calls it with the path `ticketRefHrefIn(WS_A)` returns for that ticket.

  Implementation in `apps/web/src/notes/note-document.tsx` (`NoteDocumentBody`; `dataSource` is from `useAppServices()` at `:135`, `router` at `:146`, `nameOf` at `:575`):
  ```tsx
  const linkedFrom = useLiveQuery(dataSource, note.workspaceId, `${note.noteId}:linked-from`, () =>
    dataSource.query.getLinkedFrom(note.workspaceId, { kind: 'note', id: note.noteId }),
  );
  ```
  (place it with the component's other hooks, before any early return; add `useLiveQuery`, `LinkedFromSection`, `linkedFromHref` to the `@gisik-nokma/app-core` import at `:16-34`), and between the editor's closing `</div>` (`:785`) and `<NoteComments` (`:787`):
  ```tsx
        {/* "Linked from" (Knowledge Graph spec B §3.1): in the document flow, desktop and phone.
            The page's only side column is the `On this page` TOC (notes-page.tsx), empty on a phone;
            spec C's tabbed side panel is where this moves. */}
        <LinkedFromSection
          page={linkedFrom}
          loadMore={(cursor) => dataSource.query.getLinkedFrom(note.workspaceId, { kind: 'note', id: note.noteId }, cursor)}
          hrefOf={(row) => linkedFromHref(row, ticketRefHrefIn(note.workspaceId))}
          nameOf={nameOf}
          onNavigate={(href) => router.push(href)}
        />
  ```
  Run: `pnpm turbo run build --filter=@gisik-nokma/app-core > /tmp/kgb-build.log 2>&1; pnpm --filter @gisik-nokma/web exec vitest run test/note-document.test.tsx --maxWorkers=2 > /tmp/kgb-t3-web.log 2>&1; tail -15 /tmp/kgb-t3-web.log`. Expected: PASS 27.152–27.153 and the file's existing cases. (Web 5 s timeouts: rerun the file alone before calling it red.)

  Commit: `KG-B T3: Linked from on the note document (27.152–27.153)`.

- [ ] **Step 7: Help (27.154), browser check, catalogue, mutations, DONE**
  - **`docs/manual.md` §15.** Delete the bullet `- There is no list on a note or a ticket showing what else links to it.` (`:2019`). At the end of `### Linking to a ticket or another note` (after the paragraph ending "…does not attach anything anywhere."), add, in the manual's voice:
    ```markdown
    **Linked from.** A ticket and a note each show what links to them: under the ticket's Notes, and under a
    note's text, a **Linked from** list names every ticket, note and comment that chips or mentions it, with
    the sentence it sits in and the reference highlighted. Click a row to open it; a comment opens its ticket or
    note scrolled to the comment. Only what *you* can see is listed, and the number beside the heading counts
    only those. Past twenty, **Show all** loads the rest. A plain `GN-142` typed as text is not a link — only a
    chip is. Nothing to list, no list.
    ```
    Run `pnpm help:generate` then `pnpm check:help > /tmp/kgb-help.log 2>&1; tail -5 /tmp/kgb-help.log`. Expected: PASS. Commit the generated files with the manual. Case **27.154**: cite it in the commit and in a comment in `linked-from-section.test.tsx` beside 27.143 ("the manual's Linked from paragraph describes this section").
  - **Browser** (`NEEDS: browser`), desktop and 390 px, light and dark, on a lane port with the branch built: a ticket chipped from a note, a comment and another ticket shows three rows with the right glyphs; a click on the comment row lands on the comment; a note chipped from a ticket shows the section above its comments; the guest of a shared ticket sees only what they can open. Screenshots to the lane's handoff.
  - **Catalogue:** id lines under `<!-- KG-B T3 -->`: 27.140–27.154 ✅; 27.155–27.164 reserved, unused (plain line).
  - **Features §24.B** bullet above the anchor: `✅ **"Linked from" on the ticket sheet and the note** (KG-B T3; `packages/app-core/src/views/linked-from-section.tsx`, `views/ticket-sheet.tsx`, `apps/web/src/notes/note-document.tsx`, `packages/app-core/src/online/{online-data-source,mappers}.ts`, `replica/replica-data-source.ts`) — after Notes on the sheet, after the body on a note, desktop and phone: a count, one row per visible source (status dot / page / speech-mark glyph, "GN-118 Phone pass", "Note: …", "Comment on GN-160 by …"), the snippet with the reference marked; a click opens the source, a comment at `#comment-<id>` (the sheet now scrolls to it); "Show all N" past 20; absent when nothing links; offline it is a replica gap. Cases 27.140–27.154.`
  - **Mutations:**

    | Case | Mutation |
    |---|---|
    | 27.142 | drop `${LIVE_TICKET_WHERE}` from the ticket arm (Task 2's file) — the census must go red |
    | 27.144 | `first.total === 0` → `false` |
    | 27.146 | drop the `#comment-` suffix in `linkedFromHref` |
    | 27.147 | `while (cursor !== null)` → `if (cursor !== null)` with one more page queued |
    | 27.150 | drop the `scrolledCommentHash.current === hash` guard |

  - **Sweeps:** `ui.css` changed ⇒ ui + app-core + web WHOLE; app-core online changed ⇒ the two server integration files; `check:citations`, `check:help`. LOCAL.

  Push. DONE + REVIEW (`NEEDS: browser`, desktop + 390 px).

---

### Task 4: MCP `linkedFrom` on `get_ticket` and `get_note`, and the hosted-door parity (cases 27.165–27.179)

**Files:**
- Create: `apps/server/test/mcp/mcp-linked-from.test.ts`
- Modify:
  - `packages/mcp-server/src/tools/reads.ts` (a `readLinkedFrom` helper beside `readOrNotFound`)
  - `packages/mcp-server/src/tools/read-tools.ts` (`get_ticket`, `:149-171`)
  - `packages/mcp-server/src/tools/note-tools.ts` (`get_note`, `:90-101`)
  - `packages/mcp-server/test/read-tools.test.ts` (14.66 at `:125-137`, and new cases)
  - `packages/mcp-server/test/note-tools.test.ts` (new case)
  - `Features.md` §24.B, `test-cases/27-knowledge-graph.md`

**Interfaces:**
- **Consumes:** the route (Task 2), `linkedFromSourceTitle`, `LINKED_FROM_PAGE_SIZE`, `LinkedFromPage` (Task 2).
- **Produces:** `get_ticket` and `get_note` answers gain `linkedFrom: { total: number; items: Array<{ sourceKind: 'ticket' | 'note' | 'comment'; sourceId: string; title: string; snippet: string }> }` — the FIRST 20 visible sources; `total` counts visible sources only (spec B §4). No new tool; `tool-names.ts` is unchanged.

- [ ] **Step 1: Failing package tests (27.165–27.167)**

  In `packages/mcp-server/test/read-tools.test.ts`, add a routing fake beside `sessionRecording` (`:16`), copied from `note-tools.test.ts`'s `fake` (`:26-45`):
  ```ts
  /** A route matches its exact path or `path?…`; anything else is a 404, as the server answers. */
  function sessionRouting(routes: Record<string, unknown>): { session: Session; paths: string[] } {
    const paths: string[] = [];
    const session: Session = {
      userId: () => '01J0USER0000000000000000AA',
      get: async (path) => {
        paths.push(path);
        const hit = Object.keys(routes).filter((k) => path === k || path.startsWith(`${k}?`)).sort((a, b) => b.length - a.length)[0];
        if (hit === undefined) throw new HttpError(404, { error: 'not_found' });
        return routes[hit];
      },
      post: async () => { throw new Error('not a read'); },
      ...NO_TRANSFER,
      postEvents: async () => { throw new Error('not a read'); },
    };
    return { session, paths };
  }
  const LINKED = {
    total: 2, nextCursor: null,
    items: [
      { sourceKind: 'note', sourceId: 'n1', authorId: 'u1', snippet: 'see [[CCSO-4 Chiller]]', updatedAt: '2026-10-03T10:00:00.000Z', parent: { kind: 'note', noteId: 'n1', title: 'Rulings' } },
      { sourceKind: 'comment', sourceId: 'c1', authorId: 'u1', snippet: '[[CCSO-4 Chiller]] again', updatedAt: '2026-10-03T09:00:00.000Z', parent: { kind: 'ticket', ticketId: 't2', projectId: 'p1', key: 'CCSO-9', title: 'Pump', stateCategory: 'open' } },
    ],
  };
  ```
  Rewrite **14.66** (`:125-137`) to keep its two claims — the server body passes through untouched, and the paths asked are exactly the ones named — with the new second read:
  ```ts
  it('14.66 get_ticket passes both casings through untouched; 27.165 it asks the references route second', async () => {
    const body = {
      ticket: { ticket_id: 't1', workspace_id: 'w1', project_id: 'p1', parent_id: null, own_mode: 'inherit', resolved_mode: 'project', seq: 3 },
      ticketState: { kind: 'ticket', id: 't1', assigneeId: null, collaboratorIds: [] },
      title: 'A ticket', stateProvenance: null, parent: null, rollup: null,
    };
    const { session, paths } = sessionRouting({ '/v1/workspaces/w1/tickets/t1': body, '/v1/workspaces/w1/references': { total: 0, items: [], nextCursor: null } });
    expect(await tool('get_ticket', session).handler({ workspaceId: 'w1', ticketId: 't1' })).toEqual({
      ...body, description: { markdown: '', lossy: [] }, linkedFrom: { total: 0, items: [] },
    });
    expect(paths).toEqual(['/v1/workspaces/w1/tickets/t1', '/v1/workspaces/w1/references?target=ticket%3At1']);
  });
  ```
  New cases in the same `describe` as 14.456:
  ```ts
  it('27.166 get_ticket answers linkedFrom { total, items[{ sourceKind, sourceId, title, snippet }] } — no parent object, no authorId', async () => {
    const { session } = sessionRouting({ '/v1/workspaces/w1/tickets/t1': { key: 'CCSO-4', title: 'Chiller', ticketState: { fields: {} } }, '/v1/workspaces/w1/references': LINKED });
    const out = (await tool('get_ticket', session).handler({ workspaceId: 'w1', ticketId: 't1' })) as { linkedFrom: unknown };
    expect(out.linkedFrom).toEqual({
      total: 2,
      items: [
        { sourceKind: 'note', sourceId: 'n1', title: 'Note: Rulings', snippet: 'see [[CCSO-4 Chiller]]' },
        { sourceKind: 'comment', sourceId: 'c1', title: 'Comment on CCSO-9', snippet: '[[CCSO-4 Chiller]] again' },
      ],
    });
  });

  it('27.167 a refused references read does not fail get_ticket: linkedFrom is the empty answer; a 500 still throws (control)', async () => {
    const { session } = sessionRouting({ '/v1/workspaces/w1/tickets/t1': { key: 'CCSO-4', title: 'Chiller', ticketState: { fields: {} } } });
    expect(((await tool('get_ticket', session).handler({ workspaceId: 'w1', ticketId: 't1' })) as { linkedFrom: unknown }).linkedFrom).toEqual({ total: 0, items: [] });
    const failing = { ...session, get: async (path: string) => { if (path.includes('/references')) throw new HttpError(500, { error: 'boom' }); return { key: 'CCSO-4', title: 'Chiller', ticketState: { fields: {} } }; } };
    await expect(tool('get_ticket', failing).handler({ workspaceId: 'w1', ticketId: 't1' })).rejects.toThrow();
  });
  ```
  In `packages/mcp-server/test/note-tools.test.ts`, inside `describe('14.400–14.407 note tools')` after 14.401:
  ```ts
  it('27.168 get_note answers linkedFrom from the note’s own workspace', async () => {
    const f = fake({ ...NOTE_ROUTES, [`/v1/workspaces/${WS}/references`]: { total: 1, nextCursor: null, items: [{ sourceKind: 'ticket', sourceId: T, authorId: ME, snippet: 'per [[Cold room]]', updatedAt: '2026-10-03T10:00:00.000Z', parent: { kind: 'ticket', ticketId: T, projectId: 'P', key: 'CCSO-2', title: 'Fridge', stateCategory: 'active' } }] } });
    const got = (await tool('get_note', f.session).handler({ noteId: N })) as { linkedFrom: unknown };
    expect(got.linkedFrom).toEqual({ total: 1, items: [{ sourceKind: 'ticket', sourceId: T, title: 'CCSO-2 Fridge', snippet: 'per [[Cold room]]' }] });
    expect(f.asked).toEqual([`/v1/notes/${N}`, `/v1/workspaces/${WS}/references?target=note%3A${N}`]);
  });
  ```
  (27.168 here; the hosted-door case is 27.169.)

  Run: `pnpm turbo run build --filter=@gisik-nokma/domain > /tmp/kgb-build.log 2>&1; pnpm --filter @gisik-nokma/mcp-server exec vitest run test/read-tools.test.ts test/note-tools.test.ts --maxWorkers=2 > /tmp/kgb-t4-red.log 2>&1; tail -20 /tmp/kgb-t4-red.log`. Expected: FAIL (no `linkedFrom`; one path, not two).

- [ ] **Step 2: Implement**

  `packages/mcp-server/src/tools/reads.ts`, beside `readOrNotFound`:
  ```ts
  import { linkedFromSourceTitle, type LinkedFromPage } from '@gisik-nokma/domain';

  /** Spec B §4: the first 20 visible sources, as an assistant reads them. `total` counts visible sources only. */
  export type LinkedFromAnswer = { total: number; items: Array<{ sourceKind: string; sourceId: string; title: string; snippet: string }> };

  /** A 404 here is the route's "you cannot see the target", which the caller has just been allowed to read: it reads as nothing links. Any other failure throws. */
  export async function readLinkedFrom(session: Session, workspaceId: string, target: { kind: 'ticket' | 'note'; id: string }): Promise<LinkedFromAnswer> {
    let page: LinkedFromPage;
    try {
      const q = new URLSearchParams({ target: `${target.kind}:${target.id}` });
      page = (await session.get(`/v1/workspaces/${encodeURIComponent(workspaceId)}/references?${q.toString()}`)) as LinkedFromPage;
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return { total: 0, items: [] };
      throw error;
    }
    return {
      total: page.total,
      items: page.items.map((row) => ({ sourceKind: row.sourceKind, sourceId: row.sourceId, title: linkedFromSourceTitle(row), snippet: row.snippet })),
    };
  }
  ```
  (`HttpError` and `Session` are already imported in `reads.ts` if `readOrNotFound` maps a 404; if not, import them as `read-tools.ts:3-4` does.)

  `read-tools.ts`, `get_ticket`: import `readLinkedFrom`, add to the description: `"linkedFrom lists the first 20 tickets, notes and comments you can see that reference this ticket, with the sentence each sits in (the reference marked [[…]]); total counts only those."`, and return:
  ```ts
        return {
          ...detail,
          ...(detail.ticketState === undefined ? {} : { ticketState: { ...detail.ticketState, ...(detail.ticketState.fields === undefined ? {} : { fields }) } }),
          description: bodyAsMarkdown(description?.value ?? null),
          linkedFrom: await readLinkedFrom(session, parsed.workspaceId, { kind: 'ticket', id: parsed.ticketId }),
        };
  ```
  `note-tools.ts`, `get_note`: same sentence (with "note"), and
  ```ts
        const note = await readNote(session, z.object({ noteId: id }).parse(args).noteId);
        const { body, ...meta } = note;
        const linkedFrom = await readLinkedFrom(session, note.workspaceId, { kind: 'note', id: note.noteId });
        return { ...meta, ...bodyAsMarkdown(body), images: collectImageAttachmentIds(body), linkedFrom };
  ```
  Run the Step 1 command. Expected: PASS 14.66, 14.456, 14.458, 14.401, 27.165–27.168. Run the whole mcp-server package (`exec vitest run --maxWorkers=2`). Expected: green (`register.test.ts` and `tool-sweep` unchanged: no new tool).

  Commit: `KG-B T4: get_ticket / get_note linkedFrom (27.165–27.168)`.

- [ ] **Step 3: The hosted-door parity (27.169)**

  `apps/server/test/mcp/mcp-linked-from.test.ts` (world from `test/mcp/helpers/door-matrix.ts:37`, as `mcp-notes.test.ts` uses it):
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { newUlid } from '@gisik-nokma/domain';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { buildDoorWorld, callTool } from './helpers/door-matrix.js';

  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  });
  afterAll(async () => {
    await db.drop();
  });

  describe('27.169 MCP linkedFrom equals the endpoint for the same viewer, through the hosted door', () => {
    it('27.169 the member does not get the owner’s private note (row or count); the owner gets both; MCP = endpoint for each', async () => {
      const w = await buildDoorWorld(db, '2769');
      const chip = { type: 'ticketRef', attrs: { ticketId: w.ticketId, projectId: w.projectId, key: w.ticketKey, title: 'Matrix ticket' } };
      const bodyWith = (words: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${words} ` }, chip] }] });
      const ev = (noteId: string, payload: unknown) => ({ id: newUlid(), workspaceId: w.workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.body_set', version: 1, payload, actorId: w.owner.userId, origin: 'web', clientTime: new Date().toISOString() });
      const res = await w.app.inject({ method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${w.owner.sessionToken}` }, payload: { events: [
        ev(w.privateNoteId, { body: bodyWith('private says') }),
        ev(w.workspaceNoteId, { body: bodyWith('shared says') }),
      ] } });
      for (const r of res.json<{ results: Array<{ status: string; reason?: string }> }>().results) expect(r.status, r.reason).toBe('committed');

      for (const [caller, expected] of [[w.owner, 2], [w.member, 1]] as const) {
        const mcp = await callTool(w.app, caller.token, 'get_ticket', { workspaceId: w.workspaceId, ticketId: w.ticketId });
        expect(mcp.isError, mcp.text).toBe(false);
        const linked = (mcp.json as { linkedFrom: { total: number; items: Array<{ sourceId: string; snippet: string }> } }).linkedFrom;
        const http = (await w.app.inject({ method: 'GET', url: `/v1/workspaces/${w.workspaceId}/references?target=ticket:${w.ticketId}`, headers: { authorization: `Bearer ${caller.sessionToken}` } })).json<{ total: number; items: Array<{ sourceId: string; snippet: string }> }>();
        expect(linked.total).toBe(expected);
        expect(linked.total).toBe(http.total);
        expect(linked.items.map((i) => [i.sourceId, i.snippet])).toEqual(http.items.map((i) => [i.sourceId, i.snippet]));
      }
      const memberText = (await callTool(w.app, w.member.token, 'get_ticket', { workspaceId: w.workspaceId, ticketId: w.ticketId })).text;
      expect(memberText).not.toContain('private says');
      expect(memberText).toContain('shared says'); // control
    });
  });
  ```
  Run: `pnpm turbo run build --filter=@gisik-nokma/domain --filter=@gisik-nokma/mcp-server > /tmp/kgb-build.log 2>&1; pnpm --filter @gisik-nokma/server exec vitest run test/mcp/mcp-linked-from.test.ts test/mcp/mcp-notes.test.ts test/mcp/mcp-tickets.test.ts --maxWorkers=2 > /tmp/kgb-t4-door.log 2>&1; tail -20 /tmp/kgb-t4-door.log`. Expected: PASS.

  Commit: `KG-B T4: hosted-door parity for linkedFrom (27.169)`.

- [ ] **Step 4: Catalogue, Features close-out, mutations, DONE**
  - Id lines under `<!-- KG-B T4 -->`: 27.165–27.169 ✅; 27.170–27.179 reserved, unused (plain line).
  - Features §24.B: add `✅ **MCP: get_ticket and get_note answer "linkedFrom"** (KG-B T4; `packages/mcp-server/src/tools/{reads,read-tools,note-tools}.ts`) — the first 20 visible sources as { sourceKind, sourceId, title, snippet } and a total of visible sources only, through the same route the app reads, so an assistant and the person see the same list. No new tool (spec D's graph_neighbours reads the same index). Cases 27.165–27.169.`, then delete the `<!-- KG-B bullets -->` anchor. Re-read the whole §24.B and confirm every bullet still describes the code (Task 1's rebuild line carries the measured numbers).
  - Remove the `<!-- KG-B T1 -->` … `<!-- KG-B T4 -->` anchors from file 27 only if every task's lines are present.
  - Mutations:

    | Case | Mutation |
    |---|---|
    | 27.166 | `title: linkedFromSourceTitle(row)` → `title: row.sourceId` |
    | 27.167 | the 404 branch rethrows |
    | 27.169 | in `readLinkedFrom`, return `{ total: page.items.length + 1, … }` (the MCP count no longer equals the endpoint's, so parity must go red) |

  - Sweeps: mcp-server WHOLE; server `test/mcp`; `check:citations`, `check:tasks`. LOCAL.

  Push. DONE.

---

## Self-review (writing-plans §Self-Review, done 2026-10-03 against the spec)

**1. Spec coverage**

| Spec section | Tasks |
|---|---|
| §1 (what exists) | Global Constraints, decisions (walkers kept) |
| §2.1 table, projection, extraction, snippet | T1 Steps 2–6 |
| §2.1 trash / restore / purge | T1 Steps 5 (27.110), 7–8 |
| §2.1 backfill, measured first | T1 Step 10 (automatic boot backfill + runbook, 27.119–27.122), Step 11 (bar at the floor, 27.118), Step 9 (recovery tool CA) |
| §2.2 visibility | T2 Steps 3–5 (27.126, 27.130, 27.133) |
| §2.3 census | T1 Step 5 (27.111) |
| §3.1 sheet and note | T3 Steps 3–6 |
| §3.1 count, paging, empty | T3 27.143, 27.144, 27.147 |
| §3.2 endpoint | T2 Steps 4–5 (27.131–27.134) |
| §4 MCP | T4 |
| §5.1–§5.6 | T1 (1, 2), T2 (3, 4), T3 (5), T4 (6) |
| §6 files | file map; corrected: `get_ticket` is `read-tools.ts:150`, not `ticket-tools.ts` |
| §8 risks | T1 Steps 10–11; T2 27.126/27.130 |

No gaps.

**2. Placeholders.** Three values are deliberately read rather than invented, each with the grep named in its step: the CSS token names (`tokens.ts`), `MappingError`'s constructor, and `getNoteStateFromDb`'s workspace field. The measured size is the planner's floor (P = 100 000, Q = 400 000), not a prod count. No "TBD".

**3. Type consistency.** These names are used identically across tasks: `extractDocReferences`, `DocReference`, `SNIPPET_MAX_CHARS` (T1); `referencesProjection`, `REFERENCE_BODY_EVENT_TYPES`, `NOT_A_REFERENCE_BODY`, `replaceReferences` (T1); `LinkedFromTarget`, `LinkedFromParent`, `LinkedFromRow`, `LinkedFromPage`, `LINKED_FROM_PAGE_SIZE`, `EMPTY_LINKED_FROM`, `parseLinkedFromTarget`, `linkedFromSourceTitle`, `splitSnippet`, `listLinkedFrom` (T2); `getLinkedFrom`, `mapLinkedFromPage`, `LinkedFromSection`, `linkedFromHref` (T3); `readLinkedFrom`, `LinkedFromAnswer` (T4). Columns `source_parent_kind` / `source_parent_id` throughout.

**4. Review focus.** Each line has its case in the owning task: 27.126/27.169 (T2/T4), 27.113 (T1), 27.102–27.103/27.145 (T1/T3), 27.108 (T1), 27.110/27.129 (T1/T2).

## Execution handoff

Execution follows the gisik orchestration: the orchestrator dispatches each task to a lane as one fresh session, with reviewers A/B and `ctl gate --base release/knowledge-graph`, landing into `release/knowledge-graph`.
- **Order:** plan A T1 → B T1 → B T2 → B T3 → B T4 (B runs after A per spec A's series order; only A's T1 is a hard prerequisite).
- **Stop point:** T1 Step 11. If the floor run misses the bar, the lane stops and reports the numbers to the planner before T2 is dispatched.
- **Pointers:** T3 carries `NEEDS: browser`. Nothing waits on the owner: no prod query, and the backfill runs itself on the first boot after the release.
- **Reviewer focus:** the Review Focus lines.

## Ledger rows

```tsv
reference-index	1	todo	-	-	not started (needs plan A T1 merged into release/knowledge-graph; stops at Step 11 if the floor run misses the bar)
reference-index	2	todo	-	-	not started (waits for T1)
reference-index	3	todo	-	-	not started (waits for T2)
reference-index	4	todo	-	-	not started (waits for T3)
```
