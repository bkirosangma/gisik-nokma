# MCP graph query and semantic layer (Knowledge Graph spec D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In the gisik orchestration, every task is ONE lane session. Follow `gisik-nokma-lanes/STEPS-common-2026-10-03.md`: numbered steps, each ending with a pushed commit + `CHECKPOINT task/<branch> <sha40> step <n>/<N>` + `HANDOFF-<branch>.md`; the sweep list + your own mutation pass before DONE.

**Goal:** make the Knowledge Graph queryable through MCP (neighbours, paths, traces, meaning), embed tickets and comments beside notes, and add a semantic layer of concepts that a static model suggests, an LLM curates through MCP, and a member can see, attribute and remove in the app.

**Architecture:**
- **Measure first.** Pure modules in `apps/server/src/semantic/` (item vectors, kNN, Louvain, class-based TF-IDF terms, signatures, audience partitions) are written and measured against a labelled 60-item fixture and a seeded corpus before anything is built on them (Task 1). A missed bar stops the plan before the suggestion job and every UI task.
- **Embedding.** A second cache table, `search_item_chunks`, is filled by the SAME worker loop (`startEmbedWorker`) with ticket title + description and ticket-comment bodies; staleness is a text hash, not a seq (Task 2).
- **Concepts.** A new entity kind `concept` with nine event types and three projections. A new door pass, `checkConceptPermission`, applies D4: a reader sees a concept only if they can see every live item in it (Tasks 3–4).
- **Suggestions.** A server job runs kNN and Louvain within one audience partition, and writes the cache table `sem_suggestions`. Confirm writes `concept.created` + tags. Reject writes `workspace.concept_suggestion_rejected` (Task 5).
- **Graph tools.** MCP reads go over HTTP (`packages/mcp-server/src/tools/reads.ts:6`). So `graph_path` and `graph_trace` are new server routes, built on plan C's read layer (Task 6).
- **The app.** Concept pills and the concept inspector in plan C's `KnowledgeGraph`, and a Concepts row in ticket and note Details (Tasks 8–9). The D2 audit test holds every MCP write tool to "visible, attributed, removable" (Task 7).

**Tech stack:**
- Node 22, TypeScript (NodeNext, `verbatimModuleSyntax`), Fastify, Postgres 16 + pgvector (`pgvector/pgvector:pg16`), vitest 3.
- `graphology@0.26.0` and `graphology-communities-louvain@2.0.2`, both pinned EXACTLY in `apps/server` `dependencies`.
- The existing static model `minishlab/potion-base-32M@static` (512 dims).
- React 19 (app-core) and plan C's `packages/knowledge-graph`.

**Spec:** `docs/superpowers/specs/2026-10-03-mcp-graph-semantic-layer-design.md`. Read it first; its section numbers (§) are cited below. The series table is in spec A; plan order A → B → C → E → D. Specs C (`2026-10-03-knowledge-graph-view-design.md` §2.2, §6.4, §9) and A (`2026-10-03-typed-links-design.md` §2.6) are consumed by name.

## Global Constraints

**Release and identity**
- **Release branch:** `release/knowledge-graph`, cut from `release/smoothness` after PR #952 lands. Every task branch is cut from `origin/release/knowledge-graph`, and its PR has `--base release/knowledge-graph`. Never `main`.
- **Case ids:** `27.400`–`27.549` only, in `test-cases/27-knowledge-graph.md`. Each task owns a sub-block (listed in its title). Unused ids at a sub-block's tail stay unused. Ids are written as id LINES: `- ❌ **27.400 — …**`. They start ❌ and flip to ✅ in the same commit as the covering test. The test name or a comment carries the id, because `pnpm check:citations` requires every ✅ id to appear in a test.
- **Catalogue:** plan A's Task 1 CREATES `Features.md` §24 "Knowledge Graph" and `test-cases/27-knowledge-graph.md`. This plan does not create them. Task 1 adds the sub-section `### D — MCP graph query and semantic layer` under §24, and `## 27.D MCP graph query and semantic layer (27.400–27.549)` in file 27. The merges with plans B and C are unions. **Every task needs plan A Task 1 merged** (the files must exist).
- **Migrations:** the prefix is the next `1e8` step above the highest prefix on `origin/release/knowledge-graph` WHEN THE PR IS OPENED (the counter convention, `scripts/check-migration-order.mjs:26-34`). Plans A and B land migrations on the same branch. So re-run `pnpm check:migrations` after every merge of the release tip into your branch, and rename if it fails. The names below use `<P1>`, `<P2>`, `<P3>` for this reason.

**Numbers, copied verbatim from the spec**
- kNN: `k = 10`, `cosine ≥ τ` (τ measured in Task 1).
- Keep communities of `3–12` items that are not already `≥ 50%` tagged into one concept.
- Provisional label: the top `3` class-based TF-IDF terms, joined with `" · "`.
- A rejected signature is skipped unless the item set changed by more than half.
- The job runs nightly, and after `200` item changes in a workspace (debounced `10 min`).
- Quality bars on a labelled 60-item fixture: `similar()` top-5 precision `≥ 0.6`; suggestion purity `≥ 0.7`.
- `get_concept` p95 is measured at `500` items.
- Tool limits: `hops ≤ 4`, `maxHops ≤ 6` (up to 3 shortest paths), `maxDepth ≤ 10`, `similar k ≤ 20`.

**Bars this plan sets where the spec names a measurement but no number** (owner to confirm; each is a stop-and-report line in Task 1)
- `get_concept` p95 at 500 items ≤ **150 ms**. This is spec C §2.2's per-ring budget, reused.
- The suggestion pipeline (kNN + Louvain + terms, vectors already loaded) on a 10 000-item partition ≤ **60 s** on the dev machine.
- At least **4** suggestions on the labelled fixture. This is the control that stops purity from being satisfied by suggesting almost nothing.

**What must not change**
- **D6 is view-only** (spec C §6.4). No workspace setting is added, `workspace.settings_set` is unchanged, and no tool or route takes a semantic-layer parameter.
- **The server never calls an LLM** (§9).
- **The note chunk table** `search_note_chunks`, `meaningNoteSearch`'s answers, and `search_tickets`' answers are unchanged.
- **`ticket.*` types are unchanged**, so `BOOTSTRAP_BACKFILL_TYPES` (`apps/server/src/sync/sync-routes.ts:94`) and `TICKET_EVENT_TYPES` do not move.

**Copy rules** (exact strings)
- `Suggested`, `Confirm`, `Reject`, `Rename`, `Delete`, `Remove from concept`, `Concepts`.
- The narrowing preview: `Fewer people will see this concept: <after> of <members> members`.
- The attribution line: `<assistant>, for <name>` when `origin === 'mcp'`. `<assistant>` is `Claude`, the spec's word. It is one constant, `MCP_ASSISTANT_LABEL`, because the ledger records `origin:'mcp'` and never which client (see Self-review, gap G3).
- Refusal rule names: `permission.concept`, `concept.unknown`, `concept.item-unknown`, `concept.already-tagged`, `concept.not-tagged`, `concept.link-exists`, `concept.link-unknown`, `concept.self`, `suggestion.unknown`.

**Tests and tooling (house rules)**
- **Node 22** for `pnpm install` in a worktree.
- **Never pipe a test or build run into `head`.** Use `| tail -N`, or `> /tmp/x.log 2>&1; tail -N /tmp/x.log`. vitest `--maxWorkers=2`.
- **Build before suites.** Web reads app-core's `dist`, and the server reads `@gisik-nokma/mcp-server`'s `dist`.
- **App-core online/sync changes** (Tasks 8–9 add DataSource reads) ⇒ also run the server integration files that drive those routes, and the server suite WHOLE once.
- **Every run quoted in a report is named as LOCAL.** CI runs only on the release→main PR.
- **Controls live in the same `it()`** as the case they guard. For example, a refusal test also proves that the same call with one input changed is accepted.
- **A new event type ⇒ update EVERY vocabulary census in the same task.** Spec A §2.6 lists them. A new ENTITY KIND widens it: `ENTITY_KINDS` + `envelope.test.ts:309-320`, `audienceClassOf` (`apps/server/src/visibility/visible-events-for.ts:246`, a TS2366 exhaustive switch), the door chain (`check-permission.ts:1915-1998`), `check-purged.ts` `payloadIds`, `PURGE_TABLE_RULES`, `projection-order.test.ts`, `describeEvent`. Add a census test that iterates the registry, so a missing arm fails (Task 3).
- **Features.md and test-cases** change in the same commit as the code.
- **Gate:** no task adds a package. The gate's task count is unchanged (34 on release/smoothness, 36 once G-9's browser package lands). Task 8's browser cases go into plan C's `packages/knowledge-graph-browser`, which plan C counts.
- **Louvain:**
  - It is CommonJS. Under NodeNext the default import is typed as the module record but is `module.exports` at runtime. Measured 2026-10-03 in Node 22.23.2 with `tsc` 5.9 and vitest 3:
    - a plain default import fails `tsc` (TS2339 `detailed`);
    - `.default` alone is `undefined` at runtime.

    The shim in Task 1 (`default ?? module`) passes all three.
  - Always pass a seeded `rng`. The default is `Math.random`, which makes communities, and so signatures, unstable.
  - Spec C §4.1's import check (only `render/sigma/` may import `graphology*`) is scoped to `packages/knowledge-graph`. The server's use is outside it.

## Review Focus

1. **A ticket's audience narrows after it was tagged** (a `visibility.set` to explicit, or a reassignment that removes the assignee arm). Every reader who loses the ticket must lose the concept at once, in the app, MCP and the door, with nothing cached. Pinned by 27.468 (Task 4).
2. **A reader who sees a ticket ONLY through the assignee arm** (R1, `assigneeReachWhere`). The audience partition does not model that arm. So a suggestion or concept whose items they all see must be served to them, and one with an item they lose on reassignment must not. Pinned by 27.469 (Task 4) and 27.494 (Task 5).
3. **A tagged ticket moves to the trash, is restored, then is purged.**
   - Trash hides it from the concept's items and from D4's check.
   - Restore brings it back.
   - Purge removes the row, and `verify:projections` still agrees after the purge, because the projection skips purged ids on replay.

   Pinned by 27.452 (Task 3).
4. **A ticket edited or trashed while the worker is embedding it.**
   - The worker must not write chunks for a trashed ticket. It rechecks under `FOR SHARE`, as notes do (`embed-worker.ts:157-164`).
   - An edit during the pass is re-embedded on the next pass, because the hash moved.

   Pinned by 27.424 (Task 2).
5. **`tag_items` that narrows the audience, called with no `confirm_name` or a wrong one.** It answers a preview, writes nothing, and the preview's numbers match the route's. Pinned by 27.476 (Task 4).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `apps/server/src/semantic/vectors.ts` (new) | `meanUnit`, `dot` over unit `Float32Array`s | 1 |
| `apps/server/src/semantic/knn.ts` (new) | `knnEdges(items, k, tau)`: the symmetric kNN graph | 1 |
| `apps/server/src/semantic/louvain.ts` (new) | `communities(n, edges, seed)`: the ONE file importing `graphology*` on the server, with the CJS shim and a seeded rng | 1 |
| `apps/server/src/semantic/terms.ts` (new) | `topTerms(classTexts, n)`: class-based TF-IDF | 1 |
| `apps/server/src/semantic/signature.ts` (new) | `itemKey`, `signatureOf`, `itemHash`, `changedByMoreThanHalf` | 1 |
| `apps/server/src/semantic/partition.ts` (new) | `ticketAudienceKey`, `noteAudienceKey` | 1 |
| `apps/server/src/semantic/pipeline.ts` (new) | `suggestForPartition`: kNN → Louvain → size/tag/rejection filters → terms | 1 |
| `apps/server/src/semantic/constants.ts` (new) | `SUGGESTION_K`, `SUGGESTION_TAU` (measured), `SUGGESTION_SEED`, sizes | 1 |
| `apps/server/src/read/item-visibility.ts` (new) | `hiddenItems(db, eff, userId, ws, items)`: D4's primitive | 1 |
| `apps/server/test/fixtures/semantic-labelled.json` (new) | The labelled 60-item fixture | 1 |
| `apps/server/src/tools/measure-semantic.ts` (new) + `package.json` script `semantic:measure` | τ sweep, pipeline runtime, embedding rate | 1 |
| `apps/server/migrations/<P1>_item-chunks.sql` (new) | `search_item_chunks` cache | 2 |
| `apps/server/src/search/embed-worker.ts`, `nudge.ts` | Items pass; the nudge set widened | 2 |
| `apps/server/src/read/item-search.ts` (new) | `meaningTicketSearch`, `similarItems` | 2 |
| `apps/server/src/routes/search.ts` (`:186-207`), `routes/similar.ts` (new) | Meaning answers tickets; `GET /v1/workspaces/:id/similar` | 2 |
| `packages/mcp-server/src/tools/read-tools.ts` (`:63-77`), `graph-tools.ts` (new) | `search` description; `similar` | 2 (graph-tools grows in 6) |
| `packages/domain/src/envelope.ts:15-36`, `events/concept-events.ts` (new), `vocabulary.ts`, `concepts.ts` (new read types) | The `concept` kind, nine types | 3 |
| `apps/server/migrations/<P2>_concepts.sql` (new), `projections/proj-concepts.ts` (new), `projections/index.ts` | Three projections | 3 |
| `apps/server/src/permissions/check-concept.ts` (new), `check-permission.ts:1947-1950` | `checkConceptPermission` + `checkConceptRules` | 3 |
| `apps/server/src/visibility/visible-events-for.ts:276-283`, `purge/check-purged.ts:34-69`, `purge/table-rules.ts`, `purge/erasure.ts:77-94` | The census for a new kind | 3 |
| `packages/app-core/src/views/history-copy.ts:125-239` | `concept.*` sentences | 3 |
| `apps/server/src/read/concepts.ts` (new), `routes/concepts.ts` (new) | D4 at read time; list/get/history/audience; items' concepts | 4 |
| `packages/mcp-server/src/tools/concept-tools.ts` (new) | `list_concepts`, `get_concept`, `manage_concept`, `tag_items`, `link_concepts` | 4 (suggestion tools in 5) |
| `apps/server/migrations/<P3>_suggestions.sql` (new), `semantic/suggestion-job.ts` (new), `projections/proj-concept-rejections.ts` (new), `index.ts`, `app.ts` | The job, its triggers, rejections | 5 |
| `apps/server/src/routes/graph-query.ts` (new), `read/graph-trace.ts` (new); concept arm in plan C's `read/graph-neighbours.ts` | `GET /v1/graph/path`, `GET /v1/graph/trace` | 6 |
| `packages/mcp-server/src/tools/write-audit.ts` (new), `apps/server/test/mcp/d2-audit.test.ts` (new) | D2 audit | 7 |
| `packages/app-core/src/views/concept-inspector.tsx` (new), `views/concepts-row.tsx` (new), `data-source.ts`, `online/online-data-source.ts`, `replica/replica-data-source.ts` | App surfaces | 8, 9 |
| `packages/mcp-server/test/fixtures/tool-names.ts`, `tool-sweep.ts`, `test/register.test.ts:87-110` | Tool pins | 2, 4, 5, 6 |
| `Features.md` §24 D, `test-cases/27-knowledge-graph.md` §27.D, `docs/manual.md` | Catalogue and help | each task its own lines; manual in 9 |

**Parallelism and cross-plan dependencies** (every task needs plan A Task 1 merged, for the catalogue)

| Task | Needs merged first | Can run beside |
|---|---|---|
| 1 Measure first | — | 2, 3, and plans A–C |
| 2 Embedding | — | 1, 3, and plans A–C |
| 3 Concept domain | — | 1, 2, and plans A–C. It shares `vocabulary.ts` and `check-permission.ts` with plan A: union merges, different hunks. |
| 4 Concept reads + MCP concept tools | 3 | 2, 5 (the server half) |
| 5 Suggestions | 1 (**bars PASSED**), 2, 4 | — |
| 6 Graph tools | 2, 4; **plan C's** endpoint + `apps/server/src/read/graph-neighbours.ts`; **plan A's** `proj_ticket_links`; **plan B's** `proj_references` | 7's manifest work |
| 7 D2 audit | 4, 5, 6; **plan A's** `link_tickets` | 8 |
| 8 Knowledge Graph concepts + D6 | 4, 5, 6; **plan C's** `KnowledgeGraph` component, the semantic switch (§6.4) and `packages/knowledge-graph-browser` | 7 |
| 9 Details Concepts row + History | 8 | — |

**Day one:** Tasks 1, 2 and 3 run in three lanes, in parallel with plans A–C. Tasks 4 and 5 are server-only and need no plan C work. **Stop gate:** if Task 1 reports a missed bar, Tasks 5, 8 and 9 do not start. Tasks 2–4 and 6 still ship: concepts without suggestions are still useful, and the owner decides the rest.

---

### Task 1: Measure first — the semantic core, the quality bars, τ, run time and D4's cost (cases 27.400–27.419)

**Spec:** §4.1 (pipeline and "Measured first"), §10 (risks), §7 cases 5–6. **This is a STOP-AND-REPORT task.** If 27.408, 27.409, 27.413 or 27.414 misses its bar, the lane does NOT tune the bar or the fixture to pass. It commits the red numbers as 🟡 with the measured value, writes DONE with `STOP: <case> measured <value>, bar <bar>`, and the controller asks the owner before Tasks 5, 8 and 9 start.

**Planning probe (LOCAL, 2026-10-03, not a gate result).** The fixture below was run through the real model files at `apps/server/models/potion-base-32M`, with the same token-mean code as `embedding.ts:213-238` and this task's kNN and Louvain:
- `similar()` top-5 precision: 0.847;
- pairwise cosine p50 / p90 / p99: 0.195 / 0.386 / 0.578;
- τ sweep (suggestions kept / items covered / purity):

  | τ | Suggestions | Covered | Purity |
  |---|---|---|---|
  | 0.30 | 6 | 59 | 0.949 |
  | 0.35 | 6 | 59 | 0.966 |
  | 0.40 | 6 | 58 | 0.966 |
  | 0.45 | 4 | 34 | 0.971 |
  | 0.50 | 5 | 40 | 0.925 |
  | 0.55 | 4 | 27 | 0.926 |
  | 0.60 | 2 | 10 | 1.000 |
  | 0.70 | 0 | 0 | — |

- kNN at 10 000 synthetic vectors with the symmetric half-loop below: 19.7 s; Louvain on the result: 0.1 s.

The lane re-measures all of this; the numbers are what to expect, not what to copy.

**Files:**
- Create:
  - `apps/server/src/semantic/vectors.ts`, `knn.ts`, `louvain.ts`, `terms.ts`, `signature.ts`, `partition.ts`, `pipeline.ts`, `calibration.ts`, `constants.ts`
  - `apps/server/src/read/item-visibility.ts`
  - `apps/server/src/tools/measure-semantic.ts`
  - `apps/server/test/fixtures/semantic-labelled.json`
  - `apps/server/test/semantic/pipeline.test.ts` (27.400–27.407)
  - `apps/server/test/semantic/quality.test.ts` (27.408–27.410)
  - `apps/server/test/read/item-visibility.test.ts` (27.411–27.412)
  - `apps/server/test/semantic/perf.test.ts` (27.413–27.414, `SEMANTIC_PERF=1`)
- Modify:
  - `apps/server/package.json`:
    - `dependencies` gain `"graphology": "0.26.0"`, `"graphology-communities-louvain": "2.0.2"` and `"graphology-types": "0.24.8"`, all EXACT, no caret. They go in `dependencies` because the runtime image is `pnpm deploy --prod`, per the docblock at `embedding.ts:65-71`.
    - `scripts` gains `"semantic:measure": "tsx src/tools/measure-semantic.ts"`, beside `seed:search-corpus` (`:22`).
  - `pnpm-lock.yaml` (by `pnpm install`, Node 22).
  - `Features.md` §24: a new sub-section `### D — MCP graph query and semantic layer`, with one anchor line per task: `<!-- D T1 -->` … `<!-- D T9 -->`.
  - `test-cases/27-knowledge-graph.md`: a new section `## 27.D MCP graph query and semantic layer (27.400–27.549)`, with the anchors `<!-- D T1 -->` … `<!-- D T9 -->`. Each task writes its cases directly below its own anchor.

**Interfaces:**
- **Produces** (later tasks rely on these exact names):
  - `meanUnit(vectors: readonly Float32Array[]): Float32Array`;
  - `knnEdges(vectors: readonly Float32Array[], k: number, tau: number): KnnEdge[]`, with `KnnEdge = { a: number; b: number; weight: number }`;
  - `communities(nodeCount: number, edges: readonly KnnEdge[], seed: number): number[]`;
  - `topTerms(classTexts: readonly (readonly string[])[], n: number): string[][]`;
  - `ItemKind = 'ticket' | 'note'`, `itemKey(kind, id)`, `parseItemKey(key): { kind: ItemKind; id: string }`, `signatureOf(keys)`, `itemHash(key)`, `changedByMoreThanHalf(before, after)`;
  - `ticketAudienceKey(row)`, `noteAudienceKey(row)`;
  - `PipelineItem`, `Suggestion`, `PipelineOptions`, `suggestForPartition(items, opts)`, `suggestAll(items, opts)`;
  - `SUGGESTION_K`, `SUGGESTION_TAU`, `SUGGESTION_SEED`, `SUGGESTION_MIN_SIZE`, `SUGGESTION_MAX_SIZE`, `SUGGESTION_TERMS`;
  - `ItemRef = { kind: ItemKind; id: string }`, `hiddenItems(db, eff, userId, workspaceId, items): Promise<ItemRef[]>`.
- **Consumes:**
  - `embedTexts`, `EMBEDDING_DIM` (`apps/server/src/search/embedding.ts:109,241`);
  - `visibleTicketsWhere`, `visibleNotesWhere`, `LIVE_TICKET_WHERE` (`read/visible-where.ts:136,294,231`);
  - `SqlParams` (`read/sql-params.ts:16`), `EffectiveRole`, `resolveEffectiveRole` (`permissions/effective-role.ts`);
  - `canSee` (`visibility/can-see.ts:283`), `canReadNoteById` (`visibility/can-read-note.ts:148`);
  - `seedNotesFixture` and `NOTES_USERS` (`test/helpers/notes-fixture.ts:61,85`);
  - `seedTicket`, `seedMember`, `seedProject` (`test/helpers/seed.ts:104,152,344`).

- [ ] **Step 1: Seed the shared regions and the catalogue**
  - Add the two anchors blocks (Files above).
  - Add the cases 27.400–27.414 under `<!-- D T1 -->`, all ❌. Each one is a line naming the property and its control, for example: `- ❌ **27.400 — kNN keeps at most k neighbours at cosine ≥ τ and is symmetric (an edge kept by either end); control: τ raised past the pair's cosine drops it**`.
  - 27.415–27.419 are reserved.

  Commit: `KG-D T1: seed D regions (catalogue, Features)`.

- [ ] **Step 2: Add the dependencies**

  Edit `apps/server/package.json` as above. Then run `pnpm install` (Node 22): `pnpm install > /tmp/kgd-t1-install.log 2>&1; tail -5 /tmp/kgd-t1-install.log`.

  Commit with the lockfile.

- [ ] **Step 3: Write the failing pure tests (27.400–27.407)**

  `apps/server/test/semantic/pipeline.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { knnEdges } from '../../src/semantic/knn.js';
  import { communities } from '../../src/semantic/louvain.js';
  import { topTerms } from '../../src/semantic/terms.js';
  import { changedByMoreThanHalf, itemHash, itemKey, signatureOf } from '../../src/semantic/signature.js';
  import { noteAudienceKey, ticketAudienceKey } from '../../src/semantic/partition.js';
  import { suggestAll, suggestForPartition, type PipelineItem } from '../../src/semantic/pipeline.js';

  /** Unit vectors in 4 dims, padded to `dim`, so cosines are exact and readable. */
  function unit(dim: number, ...xs: number[]): Float32Array {
    const v = new Float32Array(dim);
    xs.forEach((x, i) => { v[i] = x; });
    const n = Math.hypot(...xs);
    for (let i = 0; i < dim; i += 1) v[i] = (v[i] ?? 0) / n;
    return v;
  }
  /** Two tight clusters: ids 0–3 near axis 0, ids 4–7 near axis 1. */
  function twoClusters(dim = 8): Float32Array[] {
    return [
      unit(dim, 1, 0.05), unit(dim, 1, 0.1), unit(dim, 1, 0, 0.1), unit(dim, 1, 0.02, 0.05),
      unit(dim, 0.05, 1), unit(dim, 0.1, 1), unit(dim, 0, 1, 0.1), unit(dim, 0.02, 1, 0.05),
    ];
  }
  const item = (key: string, partition: string, vector: Float32Array, text: string): PipelineItem => ({ key, partition, vector, text });
  const BASE = { k: 10, tau: 0.5, seed: 7, minSize: 3, maxSize: 12 };

  describe('27.400 knnEdges', () => {
    it('keeps at most k neighbours at cosine ≥ τ, symmetric, each pair once; control: τ above a pair drops it', () => {
      const edges = knnEdges(twoClusters(), 10, 0.5);
      expect(edges.every((e) => e.a < e.b)).toBe(true);
      expect(edges.some((e) => e.a < 4 && e.b >= 4)).toBe(false); // no cross-cluster edge at τ = 0.5
      expect(edges.filter((e) => e.a < 4 && e.b < 4)).toHaveLength(6); // 4 choose 2
      // Symmetry: at k = 1, x0 and x1 choose each other; x2 = (1, −0.3) is nearer x0 than x1 is to it, so the
      // edge (0, 2) exists ONLY because the higher-index node chose it. Dropping `offer(j, i, …)` loses it.
      const three = [unit(2, 1, 0), unit(2, 1, 0.2), unit(2, 1, -0.3)];
      const capped = knnEdges(three, 1, 0.5);
      expect(capped.some((e) => e.a === 0 && e.b === 2)).toBe(true);
      expect(capped.some((e) => e.a === 1 && e.b === 2)).toBe(false); // at most k per chooser
      expect(knnEdges(twoClusters(), 10, 0.9999).length).toBeLessThan(edges.length); // control
    });
  });

  describe('27.401 communities', () => {
    it('splits two cliques and is identical for the same seed; control: one uniform 8-clique is one community', () => {
      const edges = knnEdges(twoClusters(), 10, 0.5);
      const first = communities(8, edges, 42);
      expect(communities(8, edges, 42)).toEqual(first);
      expect(new Set(first.slice(0, 4)).size).toBe(1);
      expect(new Set(first.slice(4)).size).toBe(1);
      expect(first[0]).not.toBe(first[4]);
      const clique: { a: number; b: number; weight: number }[] = [];
      for (let a = 0; a < 8; a += 1) for (let b = a + 1; b < 8; b += 1) clique.push({ a, b, weight: 1 });
      expect(new Set(communities(8, clique, 42)).size).toBe(1); // control: one uniform clique is one community
    });
  });

  describe('27.402 topTerms (class-based TF-IDF)', () => {
    it('ranks the words that distinguish a class first and drops stop words; control: a word shared by every class ranks below a distinctive one', () => {
      const classes = [
        ['drag the card to the column', 'the board column refuses the drag', 'board drag lag'],
        ['passkey sign in fails', 'the code for sign in expired', 'passkey on a new laptop'],
      ];
      const [board, signIn] = topTerms(classes, 3);
      expect(board).toEqual(expect.arrayContaining(['drag', 'board', 'column']));
      expect(signIn).toEqual(expect.arrayContaining(['passkey', 'sign']));
      expect(board).not.toContain('the');
      const shared = topTerms([['alpha ticket ticket'], ['beta ticket ticket']], 2);
      expect(shared[0]?.[0]).toBe('alpha'); // control
    });
  });

  describe('27.403 signatures and "changed by more than half"', () => {
    it('is order-free; more than half means Jaccard distance > 0.5; control: exactly half is not more than half', () => {
      const keys = ['ticket:B', 'ticket:A', 'note:C'];
      expect(signatureOf(keys)).toBe(signatureOf([...keys].reverse()));
      expect(itemHash('ticket:A')).toMatch(/^[0-9a-f]{32}$/);
      const before = ['a', 'b', 'c', 'd'].map(itemHash);
      expect(changedByMoreThanHalf(before, ['a', 'b', 'c', 'e'].map(itemHash))).toBe(false); // 3/5 shared
      expect(changedByMoreThanHalf(before, ['a', 'b', 'c', 'e', 'f'].map(itemHash))).toBe(false); // control: 3/6 shared, distance exactly 0.5
      expect(changedByMoreThanHalf(before, ['a', 'b', 'e', 'f'].map(itemHash))).toBe(true); // 2/6 shared, distance 0.67
      expect(itemKey('ticket', 'X')).toBe('ticket:X');
    });
  });
  ```
  The control is the boundary the spec's words draw ("more than half"): a `>=` mutation in `changedByMoreThanHalf` reddens it.

  Continue the same file:
  ```ts
  describe('27.404 audience keys', () => {
    it('keys tickets by resolved audience and notes by scope; an explicit note counts its author; control: different project ⇒ different key', () => {
      expect(ticketAudienceKey({ resolvedMode: 'workspace', projectId: 'P', resolvedUserIds: [] })).toBe('w');
      expect(ticketAudienceKey({ resolvedMode: 'project', projectId: 'P', resolvedUserIds: [] })).toBe('p:P');
      expect(ticketAudienceKey({ resolvedMode: 'explicit', projectId: 'P', resolvedUserIds: ['u2', 'u1'] })).toBe('e:u1,u2');
      expect(noteAudienceKey({ scopeMode: 'explicit', authorId: 'u1', homeProjectId: 'P', scopeUserIds: ['u2'], inheritedKeys: [] })).toBe('e:u1,u2');
      expect(noteAudienceKey({ scopeMode: 'private', authorId: 'u1', homeProjectId: 'P', scopeUserIds: [], inheritedKeys: [] })).toBe('a:u1');
      expect(noteAudienceKey({ scopeMode: 'inherit', authorId: 'u1', homeProjectId: 'P', scopeUserIds: [], inheritedKeys: ['p:P', 'p:P'] })).toBe('p:P');
      expect(noteAudienceKey({ scopeMode: 'inherit', authorId: 'u1', homeProjectId: 'P', scopeUserIds: [], inheritedKeys: ['p:P', 'w'] })).toBe('i:p:P|w');
      expect(ticketAudienceKey({ resolvedMode: 'project', projectId: 'Q', resolvedUserIds: [] })).not.toBe('p:P'); // control
    });
  });

  describe('27.405 partitions never mix audiences (§7 case 5)', () => {
    it('two audiences with near-identical text give two suggestions, not one; control: the same items in ONE audience give one', () => {
      const vs = twoClusters().slice(0, 4);
      const mixed = [
        ...vs.map((v, i) => item(`ticket:W${i}`, 'w', v, 'drag card column')),
        ...vs.map((v, i) => item(`ticket:E${i}`, 'e:u1', v, 'drag card column')),
      ];
      const out = suggestAll(mixed, BASE);
      expect(out).toHaveLength(2);
      expect(out.every((s) => new Set(s.itemKeys.map((k) => k.slice(7, 8))).size === 1)).toBe(true);
      expect(() => suggestForPartition(mixed, BASE)).toThrow(/mixed audiences/);
      const one = suggestAll(mixed.map((m) => ({ ...m, partition: 'w' })), { ...BASE, maxSize: 12 });
      expect(one).toHaveLength(1); // control
    });
  });

  describe('27.406 a rejected suggestion is skipped unless its set changed by more than half', () => {
    it('skips the same set; control: a set that changed by more than half comes back', () => {
      const items = twoClusters().slice(0, 4).map((v, i) => item(`ticket:T${i}`, 'w', v, 'drag card'));
      const [s] = suggestAll(items, BASE);
      expect(s).toBeDefined();
      expect(suggestAll(items, { ...BASE, rejected: [{ itemHashes: s!.itemHashes }] })).toHaveLength(0);
      const unrelated = ['x', 'y', 'z', 'q'].map(itemHash);
      expect(suggestAll(items, { ...BASE, rejected: [{ itemHashes: unrelated }] })).toHaveLength(1); // control
    });
  });

  describe('27.407 sizes 3–12, and a community already ≥ 50% in one concept is skipped', () => {
    it('drops a pair and a 13-set, skips a half-tagged set; control: one tagged item of four does not skip', () => {
      const four = twoClusters().slice(0, 4).map((v, i) => item(`ticket:T${i}`, 'w', v, 'drag card'));
      expect(suggestAll(four.slice(0, 2), BASE)).toHaveLength(0);
      expect(suggestAll(four, { ...BASE, maxSize: 3 })).toHaveLength(0);
      const half = new Map([['ticket:T0', ['C1']], ['ticket:T1', ['C1']]]);
      expect(suggestAll(four, { ...BASE, conceptsOf: (k) => half.get(k) ?? [] })).toHaveLength(0);
      const one = new Map([['ticket:T0', ['C1']]]);
      expect(suggestAll(four, { ...BASE, conceptsOf: (k) => one.get(k) ?? [] })).toHaveLength(1); // control
      expect(suggestAll(four, BASE)[0]?.label).toMatch(/·|^\w+$/);
    });
  });
  ```
  Run: `pnpm --filter @gisik-nokma/server exec vitest run test/semantic/pipeline.test.ts --maxWorkers=2 > /tmp/kgd-t1-pure.log 2>&1; tail -20 /tmp/kgd-t1-pure.log`.
  Expected: FAIL (the modules do not exist).

- [ ] **Step 4: Implement the pure modules**

  `apps/server/src/semantic/vectors.ts`:
  ```ts
  import { EMBEDDING_DIM } from '../search/embedding.js';

  /**
   * The mean of unit vectors, re-normalised to unit length (spec D §4.1 step 1: an item's vector is the mean
   * of its chunk vectors; a ticket's comments are folded in the same way). `embedding.ts` does nothing eager
   * at import (`nudge.ts:16-18`), so importing the constant costs nothing.
   */
  export function meanUnit(vectors: readonly Float32Array[]): Float32Array {
    if (vectors.length === 0) throw new Error('meanUnit of no vectors');
    const out = new Float32Array(EMBEDDING_DIM);
    for (const vector of vectors) {
      if (vector.length !== EMBEDDING_DIM) throw new Error(`vector of ${String(vector.length)} dims, expected ${String(EMBEDDING_DIM)}`);
      for (let index = 0; index < EMBEDDING_DIM; index += 1) out[index] = (out[index] ?? 0) + (vector[index] ?? 0);
    }
    let sum = 0;
    for (let index = 0; index < EMBEDDING_DIM; index += 1) sum += (out[index] ?? 0) ** 2;
    const norm = Math.sqrt(sum);
    if (!(norm > 0)) throw new Error('mean vector has zero norm');
    for (let index = 0; index < EMBEDDING_DIM; index += 1) out[index] = (out[index] ?? 0) / norm;
    return out;
  }
  ```
  Unit tests use 8-dim vectors, so `knn.ts` must NOT assume `EMBEDDING_DIM`. It reads the dimension from the first vector.

  `apps/server/src/semantic/knn.ts`:
  ```ts
  export type KnnEdge = { a: number; b: number; weight: number };

  /**
   * The kNN graph of spec D §4.1 step 3: each item's k nearest at cosine ≥ τ, kept when EITHER end chose it,
   * each pair once with a < b. Vectors are unit length, so a dot product IS the cosine.
   *
   * The pair loop runs j > i and offers each cosine to both ends: half the products of the naive loop,
   * measured 2026-10-03 at 19.7 s for 10 000 × 512 against 59.4 s for the naive loop. The four accumulators
   * are the unroll that measurement used.
   */
  export function knnEdges(vectors: readonly Float32Array[], k: number, tau: number): KnnEdge[] {
    const n = vectors.length;
    const dim = vectors[0]?.length ?? 0;
    const flat = new Float32Array(n * dim);
    vectors.forEach((vector, index) => flat.set(vector, index * dim));
    const bestScore = new Float32Array(n * k).fill(-2);
    const bestIndex = new Int32Array(n * k).fill(-1);
    const offer = (owner: number, other: number, score: number): void => {
      const base = owner * k;
      if (score <= (bestScore[base + k - 1] ?? -2)) return;
      let slot = k - 1;
      while (slot > 0 && (bestScore[base + slot - 1] ?? -2) < score) {
        bestScore[base + slot] = bestScore[base + slot - 1] ?? -2;
        bestIndex[base + slot] = bestIndex[base + slot - 1] ?? -1;
        slot -= 1;
      }
      bestScore[base + slot] = score;
      bestIndex[base + slot] = other;
    };
    const tail = dim - (dim % 4);
    for (let i = 0; i < n; i += 1) {
      const oi = i * dim;
      for (let j = i + 1; j < n; j += 1) {
        const oj = j * dim;
        let s0 = 0; let s1 = 0; let s2 = 0; let s3 = 0;
        for (let d = 0; d < tail; d += 4) {
          s0 += (flat[oi + d] ?? 0) * (flat[oj + d] ?? 0);
          s1 += (flat[oi + d + 1] ?? 0) * (flat[oj + d + 1] ?? 0);
          s2 += (flat[oi + d + 2] ?? 0) * (flat[oj + d + 2] ?? 0);
          s3 += (flat[oi + d + 3] ?? 0) * (flat[oj + d + 3] ?? 0);
        }
        let score = s0 + s1 + s2 + s3;
        for (let d = tail; d < dim; d += 1) score += (flat[oi + d] ?? 0) * (flat[oj + d] ?? 0);
        if (score < tau) continue;
        offer(i, j, score);
        offer(j, i, score);
      }
    }
    const pairs = new Map<number, number>();
    for (let i = 0; i < n; i += 1) {
      for (let slot = 0; slot < k; slot += 1) {
        const j = bestIndex[i * k + slot] ?? -1;
        if (j < 0) break;
        const a = Math.min(i, j);
        const b = Math.max(i, j);
        pairs.set(a * n + b, bestScore[i * k + slot] ?? 0);
      }
    }
    return [...pairs]
      .map(([key, weight]) => ({ a: Math.floor(key / n), b: key % n, weight }))
      .sort((x, y) => x.a - y.a || x.b - y.b);
  }
  ```
  A mutation the reviewer will run: drop `offer(j, i, score)`. Then 27.400's `(0, 2)` assertion reddens (traced at planning: with k = 1, node 0 chooses 1, and only node 2's own choice makes the edge).

  `apps/server/src/semantic/louvain.ts`:
  ```ts
  import { UndirectedGraph } from 'graphology';
  import louvainImport from 'graphology-communities-louvain';
  import type { KnnEdge } from './knn.js';

  /**
   * The ONLY server file that imports `graphology*` (spec D §4.1 step 4). The package is CommonJS: under
   * NodeNext `tsc` types the default import as the module record (`.default`), while Node hands back
   * `module.exports` itself, so `.default` alone is undefined at runtime and a bare default import fails
   * `tsc` with TS2339 on `detailed`. Measured 2026-10-03 (Node 22.23.2, tsc 5.9, vitest 3); the shim below
   * passed all three.
   */
  type Louvain = typeof louvainImport.default;
  const louvain: Louvain = (louvainImport as { default?: Louvain }).default ?? (louvainImport as unknown as Louvain);

  /** mulberry32. Louvain's default rng is Math.random, which makes communities — and so signatures — unstable. */
  export function seededRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** One community index per node, in node order. An isolated node is its own community. */
  export function communities(nodeCount: number, edges: readonly KnnEdge[], seed: number): number[] {
    const graph = new UndirectedGraph();
    for (let index = 0; index < nodeCount; index += 1) graph.addNode(String(index));
    for (const edge of edges) graph.addEdge(String(edge.a), String(edge.b), { weight: edge.weight });
    const out = louvain.detailed(graph, { getEdgeWeight: 'weight', rng: seededRng(seed) });
    return Array.from({ length: nodeCount }, (_unused, index) => out.communities[String(index)] ?? -1);
  }
  ```

  `apps/server/src/semantic/terms.ts`:
  ```ts
  /** Words with no topic in them. Short on purpose: class-based IDF already sinks words every class uses. */
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'has', 'have', 'not', 'but', 'its', 'into',
    'one', 'all', 'any', 'can', 'when', 'then', 'than', 'them', 'they', 'their', 'there', 'what', 'which', 'who', 'will',
    'would', 'should', 'could', 'after', 'before', 'only', 'also', 'does', 'did', 'our', 'out', 'off', 'per', 'via', 'too',
    'very', 'just', 'each', 'every', 'new', 'now', 'how', 'why', 'comment',
  ]);

  export function termsOf(text: string): string[] {
    return (text.toLowerCase().match(/[a-z][a-z0-9]+/g) ?? []).filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  }

  /**
   * Class-based TF-IDF (spec D §4.1 step 5): a class is one community's texts. score(t, c) = tf(t, c) ·
   * log(1 + A / f(t)), with tf the term's share of the class's words, A the mean words per class and f(t)
   * the term's count across every class. Ties break alphabetically so the label is deterministic.
   */
  export function topTerms(classTexts: readonly (readonly string[])[], n: number): string[][] {
    const classes = classTexts.map((texts) => {
      const counts = new Map<string, number>();
      let total = 0;
      for (const text of texts) {
        for (const word of termsOf(text)) {
          counts.set(word, (counts.get(word) ?? 0) + 1);
          total += 1;
        }
      }
      return { counts, total };
    });
    const corpus = new Map<string, number>();
    let words = 0;
    for (const { counts, total } of classes) {
      words += total;
      for (const [word, count] of counts) corpus.set(word, (corpus.get(word) ?? 0) + count);
    }
    const meanWords = classes.length === 0 ? 0 : words / classes.length;
    return classes.map(({ counts, total }) =>
      [...counts]
        .map(([word, count]) => ({ word, score: (count / Math.max(total, 1)) * Math.log(1 + meanWords / (corpus.get(word) ?? 1)) }))
        .sort((x, y) => y.score - x.score || (x.word < y.word ? -1 : x.word > y.word ? 1 : 0))
        .slice(0, n)
        .map((entry) => entry.word),
    );
  }
  ```

  `apps/server/src/semantic/signature.ts`:
  ```ts
  import { createHash } from 'node:crypto';

  export type ItemKind = 'ticket' | 'note';
  export function itemKey(kind: ItemKind, id: string): string {
    return `${kind}:${id}`;
  }
  export function parseItemKey(key: string): { kind: ItemKind; id: string } {
    const [kind, id] = key.split(':') as [string, string | undefined];
    if ((kind !== 'ticket' && kind !== 'note') || id === undefined || id === '') throw new Error(`not an item key: ${key}`);
    return { kind, id };
  }
  /** Spec D §4.1 step 6: a hash of the sorted item ids. */
  export function signatureOf(keys: readonly string[]): string {
    return createHash('sha256').update([...keys].sort().join('\n')).digest('hex');
  }
  /**
   * One item, hashed. A rejection records hashes, never ids (Task 5): `workspace.concept_suggestion_rejected`
   * is on the WORKSPACE stream, which every member's replica receives, and an id list would tell a member
   * that a ticket they cannot see exists. A hash tells them nothing they did not already know.
   */
  export function itemHash(key: string): string {
    return createHash('sha256').update(key).digest('hex').slice(0, 32);
  }
  /** "Changed by more than half" (spec D §4.1 step 6) = Jaccard distance > 0.5. Exactly half is not more. */
  export function changedByMoreThanHalf(before: readonly string[], after: readonly string[]): boolean {
    const a = new Set(before);
    const b = new Set(after);
    let shared = 0;
    for (const value of a) if (b.has(value)) shared += 1;
    const union = a.size + b.size - shared;
    return union > 0 && 1 - shared / union > 0.5;
  }
  ```

  `apps/server/src/semantic/partition.ts`:
  ```ts
  import type { NoteScopeMode } from '@gisik-nokma/domain';

  export type TicketAudienceRow = { resolvedMode: 'workspace' | 'project' | 'explicit'; projectId: string; resolvedUserIds: readonly string[] };
  export type NoteAudienceRow = {
    scopeMode: NoteScopeMode;
    authorId: string;
    homeProjectId: string;
    scopeUserIds: readonly string[];
    /** `ticketAudienceKey` of each LIVE attached ticket (for `inherit`). */
    inheritedKeys: readonly string[];
  };

  /**
   * Spec D §4.1 step 2 (D4): the visibility partition, "mode + project + explicit set". It is a CLUSTERING
   * boundary, not the security boundary: it does not model the assignee arm (R1, `assigneeReachWhere`) or a
   * project note's author arm. Every read of a suggestion or concept re-checks D4 per reader (Task 4).
   * A bare switch with no `default`, as `ticketAudienceWhere` (`visible-where.ts:104`) is, so a new mode is a
   * TS2366 here.
   */
  export function ticketAudienceKey(row: TicketAudienceRow): string {
    switch (row.resolvedMode) {
      case 'workspace':
        return 'w';
      case 'project':
        return `p:${row.projectId}`;
      case 'explicit':
        return `e:${[...new Set(row.resolvedUserIds)].sort().join(',')}`;
    }
  }

  export function noteAudienceKey(row: NoteAudienceRow): string {
    switch (row.scopeMode) {
      case 'private':
        return `a:${row.authorId}`;
      case 'workspace':
        return 'w';
      case 'project':
        return `p:${row.homeProjectId}`;
      case 'explicit':
        return `e:${[...new Set([...row.scopeUserIds, row.authorId])].sort().join(',')}`;
      case 'inherit': {
        const keys = [...new Set(row.inheritedKeys)].sort();
        return keys.length === 1 ? (keys[0] as string) : `i:${keys.join('|')}`;
      }
    }
  }
  ```

  `apps/server/src/semantic/constants.ts`:
  ```ts
  /**
   * Spec D §4.1. `SUGGESTION_TAU` is MEASURED (Task 1, 27.410): the τ in `TAU_GRID` that covers the most
   * fixture items while purity ≥ 0.7 and at least 4 suggestions are kept, ties to the higher τ.
   * Planning probe 2026-10-03 (LOCAL): 0.35 → 6 suggestions, 59/60 covered, purity 0.966.
   * Replace the number with what Step 7 prints if it differs, and paste Step 7's table here.
   */
  export const SUGGESTION_K = 10;
  export const SUGGESTION_TAU = 0.35;
  export const SUGGESTION_SEED = 20261003;
  export const SUGGESTION_MIN_SIZE = 3;
  export const SUGGESTION_MAX_SIZE = 12;
  export const SUGGESTION_TERMS = 3;
  ```

  `apps/server/src/semantic/pipeline.ts`:
  ```ts
  import { communities } from './louvain.js';
  import { knnEdges, type KnnEdge } from './knn.js';
  import { changedByMoreThanHalf, itemHash, signatureOf } from './signature.js';
  import { topTerms } from './terms.js';

  export type PipelineItem = { key: string; partition: string; vector: Float32Array; text: string };
  export type Suggestion = {
    partition: string;
    itemKeys: string[];
    signature: string;
    itemHashes: string[];
    terms: string[];
    /** The provisional label: the terms joined with " · " (spec D §4.1 step 5). */
    label: string;
    /** Mean cosine of the community's own kNN edges. */
    score: number;
  };
  export type PipelineOptions = {
    k: number;
    tau: number;
    seed: number;
    minSize: number;
    maxSize: number;
    /** The concept ids an item is tagged into (step 4's "already ≥ 50% tagged into one concept"). */
    conceptsOf?: (key: string) => readonly string[];
    rejected?: readonly { itemHashes: readonly string[] }[];
  };

  function mostlyInOneConcept(keys: readonly string[], conceptsOf: PipelineOptions['conceptsOf']): boolean {
    if (conceptsOf === undefined) return false;
    const counts = new Map<string, number>();
    for (const key of keys) for (const concept of conceptsOf(key)) counts.set(concept, (counts.get(concept) ?? 0) + 1);
    return [...counts.values()].some((count) => count * 2 >= keys.length);
  }

  function internalScore(members: readonly number[], edges: readonly KnnEdge[]): number {
    const inside = new Set(members);
    const weights = edges.filter((edge) => inside.has(edge.a) && inside.has(edge.b)).map((edge) => edge.weight);
    return weights.length === 0 ? 0 : weights.reduce((sum, weight) => sum + weight, 0) / weights.length;
  }

  /**
   * Steps 3–6 for ONE audience partition. Throws on a mixed partition: clustering across audiences is the
   * D4 leak this spec exists to prevent, and a caller that grouped wrongly must fail loudly, not suggest.
   */
  export function suggestForPartition(items: readonly PipelineItem[], options: PipelineOptions): Suggestion[] {
    const partition = items[0]?.partition;
    if (partition === undefined || items.length < options.minSize) return [];
    if (items.some((entry) => entry.partition !== partition)) throw new Error('suggestForPartition: mixed audiences');
    const edges = knnEdges(items.map((entry) => entry.vector), options.k, options.tau);
    const labels = communities(items.length, edges, options.seed);
    const groups = new Map<number, number[]>();
    labels.forEach((community, index) => groups.set(community, [...(groups.get(community) ?? []), index]));
    const classes = [...groups.values()];
    const terms = topTerms(classes.map((members) => members.map((index) => items[index]?.text ?? '')), 3);
    const out: Suggestion[] = [];
    classes.forEach((members, classIndex) => {
      if (members.length < options.minSize || members.length > options.maxSize) return;
      const keys = members.map((index) => items[index]?.key ?? '').sort();
      if (mostlyInOneConcept(keys, options.conceptsOf)) return;
      const hashes = keys.map(itemHash);
      if ((options.rejected ?? []).some((rejection) => !changedByMoreThanHalf(rejection.itemHashes, hashes))) return;
      const words = terms[classIndex] ?? [];
      out.push({ partition, itemKeys: keys, signature: signatureOf(keys), itemHashes: hashes, terms: words, label: words.join(' · '), score: internalScore(members, edges) });
    });
    return out.sort((x, y) => y.score - x.score || (x.signature < y.signature ? -1 : 1));
  }

  /** Every partition, in partition-key order, so a run is deterministic. */
  export function suggestAll(items: readonly PipelineItem[], options: PipelineOptions): Suggestion[] {
    const byPartition = new Map<string, PipelineItem[]>();
    for (const entry of items) byPartition.set(entry.partition, [...(byPartition.get(entry.partition) ?? []), entry]);
    return [...byPartition.keys()].sort().flatMap((key) => suggestForPartition(byPartition.get(key) ?? [], options));
  }
  ```
  `topTerms(…, 3)` uses `SUGGESTION_TERMS`'s value. Import the constant rather than repeating the 3 if the reviewer asks; both are fine.

  Run the Step 3 command. Expected: PASS 27.400–27.407.

  Commit.

- [ ] **Step 5: The labelled fixture and the quality bars (27.408–27.410)**

  `apps/server/test/fixtures/semantic-labelled.json`: copy it VERBATIM from the planner's scratch file `semantic-labelled.json`, which the controller attaches to the dispatch.
  - It has 60 items: six labels (`phone-sheet`, `board-drag`, `search`, `trash`, `notifications`, `sign-in`) × (7 tickets + 3 notes).
  - A ticket's `text` is its title, description and comments, folded as the pipeline folds them.
  - It was hand-written; never generate it.
  - Shape: `{ "about": string, "items": [{ "id", "kind": "ticket"|"note", "label", "text" }] }`.

  `apps/server/src/semantic/calibration.ts`:
  ```ts
  import { suggestForPartition, type PipelineItem, type PipelineOptions, type Suggestion } from './pipeline.js';

  /** τ from 0.30 to 0.80 in steps of 0.05, built from integers so 0.35 is 0.35. */
  export const TAU_GRID: readonly number[] = Array.from({ length: 11 }, (_unused, index) => (30 + index * 5) / 100);
  export type TauRow = { tau: number; suggestions: number; covered: number; purity: number };

  export function purityOf(suggestions: readonly Suggestion[], labelOf: (key: string) => string): { purity: number; covered: number } {
    let dominant = 0;
    let covered = 0;
    for (const suggestion of suggestions) {
      const counts = new Map<string, number>();
      for (const key of suggestion.itemKeys) counts.set(labelOf(key), (counts.get(labelOf(key)) ?? 0) + 1);
      dominant += Math.max(...counts.values());
      covered += suggestion.itemKeys.length;
    }
    return { purity: covered === 0 ? 0 : dominant / covered, covered };
  }

  export function sweepTau(items: readonly PipelineItem[], labelOf: (key: string) => string, base: Omit<PipelineOptions, 'tau'>): TauRow[] {
    return TAU_GRID.map((tau) => {
      const suggestions = suggestForPartition(items, { ...base, tau });
      return { tau, suggestions: suggestions.length, ...purityOf(suggestions, labelOf) };
    });
  }

  /** The selection rule `constants.ts` documents. `null` = no τ meets the bars: STOP AND REPORT. */
  export function selectTau(rows: readonly TauRow[], bars = { purity: 0.7, minSuggestions: 4 }): number | null {
    const passing = rows.filter((row) => row.purity >= bars.purity && row.suggestions >= bars.minSuggestions);
    return [...passing].sort((x, y) => y.covered - x.covered || y.tau - x.tau)[0]?.tau ?? null;
  }

  /** `similar()` top-5 precision: for each item, the share of its 5 nearest others with its label, averaged. */
  export function precisionAt5(vectors: readonly Float32Array[], labels: readonly string[]): number {
    let total = 0;
    vectors.forEach((vector, i) => {
      const nearest = vectors
        .map((other, j) => ({ j, score: j === i ? -Infinity : vector.reduce((sum, value, d) => sum + value * (other[d] ?? 0), 0) }))
        .sort((x, y) => y.score - x.score)
        .slice(0, 5);
      total += nearest.filter((entry) => labels[entry.j] === labels[i]).length / 5;
    });
    return total / vectors.length;
  }
  ```

  `apps/server/test/semantic/quality.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import { describe, expect, it } from 'vitest';
  import { embedTexts } from '../../src/search/embedding.js';
  import { precisionAt5, purityOf, selectTau, sweepTau } from '../../src/semantic/calibration.js';
  import { SUGGESTION_K, SUGGESTION_MAX_SIZE, SUGGESTION_MIN_SIZE, SUGGESTION_SEED, SUGGESTION_TAU } from '../../src/semantic/constants.js';
  import { suggestForPartition, type PipelineItem } from '../../src/semantic/pipeline.js';

  /**
   * Spec D §4.1 "Measured first" and §7 case 6, on the REAL model (not `fakeVector`): a fake embedder is
   * evidence about the loop, never about what a vector means (`embed-worker.test.ts:18-23`).
   */
  type Labelled = { items: Array<{ id: string; kind: 'ticket' | 'note'; label: string; text: string }> };
  const FIXTURE = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/semantic-labelled.json', import.meta.url)), 'utf8')) as Labelled;
  const BASE = { k: SUGGESTION_K, seed: SUGGESTION_SEED, minSize: SUGGESTION_MIN_SIZE, maxSize: SUGGESTION_MAX_SIZE };

  async function fixtureItems(): Promise<{ items: PipelineItem[]; labelOf: (key: string) => string }> {
    const vectors = await embedTexts(FIXTURE.items.map((entry) => entry.text));
    const labels = new Map(FIXTURE.items.map((entry) => [`${entry.kind}:${entry.id}`, entry.label]));
    const items = FIXTURE.items.map((entry, index) => ({ key: `${entry.kind}:${entry.id}`, partition: 'w', vector: vectors[index] as Float32Array, text: entry.text }));
    return { items, labelOf: (key) => labels.get(key) ?? '?' };
  }

  describe('27.408–27.410 the quality bars (spec D §4.1)', () => {
    it('27.408 similar() top-5 precision ≥ 0.6 on the labelled 60; control: shuffled labels fall far below it', async () => {
      expect(FIXTURE.items).toHaveLength(60);
      const vectors = await embedTexts(FIXTURE.items.map((entry) => entry.text));
      const labels = FIXTURE.items.map((entry) => entry.label);
      const precision = precisionAt5(vectors, labels);
      console.log(`semantic-quality: precision@5 = ${precision.toFixed(3)} (bar 0.6)`);
      expect(precision).toBeGreaterThanOrEqual(0.6);
      const shuffled = labels.map((_label, index) => labels[(index * 7 + 3) % labels.length] as string);
      expect(precisionAt5(vectors, shuffled)).toBeLessThan(0.4); // control
    }, 60_000);

    it('27.409 suggestion purity ≥ 0.7 at SUGGESTION_TAU with ≥ 4 suggestions; control: τ = 0.80 keeps none', async () => {
      const { items, labelOf } = await fixtureItems();
      const suggestions = suggestForPartition(items, { ...BASE, tau: SUGGESTION_TAU });
      const { purity, covered } = purityOf(suggestions, labelOf);
      console.log(`semantic-quality: τ=${String(SUGGESTION_TAU)} suggestions=${String(suggestions.length)} covered=${String(covered)} purity=${purity.toFixed(3)}`);
      expect(suggestions.length).toBeGreaterThanOrEqual(4);
      expect(purity).toBeGreaterThanOrEqual(0.7);
      expect(suggestForPartition(items, { ...BASE, tau: 0.8 })).toHaveLength(0); // control
    }, 60_000);

    it('27.410 SUGGESTION_TAU is the measured choice, not a guess; control: a bar no τ meets selects null', async () => {
      const { items, labelOf } = await fixtureItems();
      const rows = sweepTau(items, labelOf, BASE);
      console.table(rows);
      expect(selectTau(rows)).toBe(SUGGESTION_TAU);
      expect(selectTau(rows, { purity: 1.01, minSuggestions: 4 })).toBeNull(); // control
    }, 60_000);
  });
  ```
  These three cases load the real model in the DEFAULT suite, as 18.126–18.127 already do with no guard (`test/search/embedding.test.ts:33-34, 56-62`): the model files ship in the repo, so no skip is added.

  Run: `pnpm --filter @gisik-nokma/server exec vitest run test/semantic/quality.test.ts --maxWorkers=2 > /tmp/kgd-t1-quality.log 2>&1; tail -40 /tmp/kgd-t1-quality.log`.
  - Expected: PASS, with precision ≈ 0.85 and purity ≈ 0.97 (the planning probe).
  - If 27.410 fails only because `selectTau` printed another τ, replace `SUGGESTION_TAU` with the printed value, paste the table into `constants.ts`'s docblock, and re-run.
  - If 27.408 or 27.409 fails: STOP (this task's header).

  Mutations to run:

  | Case | Mutation | Expected |
  |---|---|---|
  | 27.408 | `precisionAt5` counts the item itself (drop `-Infinity`) | the control still passes; the reviewer sees precision jump. Record it. |
  | 27.409 | `minSize: 1` | purity changes and the suggestion count jumps |

  Commit.

- [ ] **Step 6: D4's primitive, `hiddenItems` (27.411–27.412)**

  `apps/server/src/read/item-visibility.ts`:
  ```ts
  import type { Queryable } from '../db/queryable.js';
  import type { EffectiveRole } from '../permissions/effective-role.js';
  import type { ItemKind } from '../semantic/signature.js';
  import { SqlParams } from './sql-params.js';
  import { LIVE_TICKET_WHERE, visibleNotesWhere, visibleTicketsWhere } from './visible-where.js';

  export type ItemRef = { kind: ItemKind; id: string };

  /**
   * Spec D D4's primitive: of `items`, the LIVE ones this viewer cannot see. A concept is visible to a
   * reader exactly when this answers `[]` for its items.
   *
   * - **POSITIVE form: hidden = live − visible.** The visible half is the exact shape `readSearch` uses
   *   (`routes/search.ts:216-228, 293-296`: inner join to `proj_visibility`, `visibleTicketsWhere`,
   *   `LIVE_TICKET_WHERE`), and the predicates are CONSUMED, never NOT-ed. A negated predicate fails OPEN:
   *   a ticket with no `proj_visibility` row drops out of an inner join and would count as seen, and a NULL
   *   from any arm makes `NOT (NULL)` drop the row too. Here both of those land in "hidden".
   * - **Trashed and absent items are ignored**, not hidden. A concept keeps a trashed ticket's tag (trash
   *   keeps rows), and a reader is not refused a concept because of an item nobody can see in any view.
   *   Restore brings it back into the check.
   */
  export async function hiddenItems(
    db: Queryable,
    eff: EffectiveRole,
    userId: string,
    workspaceId: string,
    items: readonly ItemRef[],
  ): Promise<ItemRef[]> {
    const hidden: ItemRef[] = [];
    const ticketIds = [...new Set(items.filter((item) => item.kind === 'ticket').map((item) => item.id))];
    const noteIds = [...new Set(items.filter((item) => item.kind === 'note').map((item) => item.id))];
    if (ticketIds.length > 0) {
      const live = await db.query<{ id: string }>(
        `SELECT t.ticket_id AS id FROM proj_tickets t
          WHERE t.workspace_id = $1 AND t.ticket_id = ANY ($2::text[]) AND ${LIVE_TICKET_WHERE}`,
        [workspaceId, ticketIds],
      );
      const params = new SqlParams();
      const workspace = params.add(workspaceId);
      const ids = params.add(ticketIds);
      const visible = visibleTicketsWhere(eff, userId, params);
      const seen = await db.query<{ id: string }>(
        `SELECT t.ticket_id AS id
           FROM proj_tickets t JOIN proj_visibility v ON v.ticket_id = t.ticket_id
          WHERE t.workspace_id = ${workspace} AND t.ticket_id = ANY (${ids}::text[]) AND ${LIVE_TICKET_WHERE}
            AND ${visible}`,
        params.toArray(),
      );
      const seenIds = new Set(seen.rows.map((row) => row.id));
      for (const row of live.rows) if (!seenIds.has(row.id)) hidden.push({ kind: 'ticket', id: row.id });
    }
    if (noteIds.length > 0) {
      const live = await db.query<{ id: string }>(
        'SELECT n.note_id AS id FROM proj_notes n WHERE n.workspace_id = $1 AND n.note_id = ANY ($2::text[]) AND n.deleted = FALSE',
        [workspaceId, noteIds],
      );
      const params = new SqlParams();
      const workspace = params.add(workspaceId);
      const ids = params.add(noteIds);
      const visible = visibleNotesWhere(eff, userId, params);
      const seen = await db.query<{ id: string }>(
        `SELECT n.note_id AS id FROM proj_notes n
          WHERE n.workspace_id = ${workspace} AND n.note_id = ANY (${ids}::text[]) AND n.deleted = FALSE AND ${visible}`,
        params.toArray(),
      );
      const seenIds = new Set(seen.rows.map((row) => row.id));
      for (const row of live.rows) if (!seenIds.has(row.id)) hidden.push({ kind: 'note', id: row.id });
    }
    return hidden;
  }
  ```
  `LIVE_TICKET_WHERE` names only `t.` and a sub-select on `proj_projects dp` (`visible-where.ts:231-232`), so the live query needs no visibility join: it aliases `proj_tickets t` and nothing else.

  `apps/server/test/read/item-visibility.test.ts`. Copy the world setup from `test/search/embed-worker.test.ts:42-50` (`createTestDatabase` + `seedNotesFixture`):
  - **27.411.** For `memberOut`, `hiddenItems` over `[ticket TP, note nProject, note nWorkspace]` answers `[TP, nProject]`, and for `memberIn` it answers `[]`.
    - (Planner ruling 2026-10-04, Q1: Rule A. `memberOut` does NOT lose TP or nProject. Every member and admin is on every founded project (`effective-role.ts:5-19`), so `memberOut` READS TP and nProject. The landed test (`apps/server/test/read/item-visibility.test.ts:16-19`, `:65-95`) uses `guestListed` as the reader who loses TP, nProject, nWorkspace and a workspace-mode ticket TW (keeping TE and nExplicit), and `memberOut` / `memberIn` / the owner as the controls that lose nothing. The landed test is the record; the legs here describe the pre-Rule-A plan.)
    - Same `it`: after a `ticket.deleted` on TP (`applyCommitted(db.pool, [makeCommitted({ workspaceId: WS, entity: { kind: 'ticket', id: TP }, type: 'ticket.deleted', payload: {}, actorId: ids.owner })])`), `memberOut`'s answer is `[nProject]`. The trashed ticket is ignored, not counted.
    - Same `it`, FIRST (before the trash), the fail-closed control. Save TP's visibility row (`CREATE TEMP TABLE kept_vis AS SELECT * FROM proj_visibility WHERE ticket_id = $1`), delete it, and assert `hiddenItems` as `memberIn` over `[TP]` answers `[TP]`: no visibility row means hidden, never seen. The control: `memberIn` over `[TP]` answered `[]` just before the delete. Put the row back (`INSERT INTO proj_visibility SELECT * FROM kept_vis`) before going on.
    - Control: the owner's answer over `[TP, nProject, nWorkspace]` is `[]` before and after the trash.
  - **27.412** is declared ABOVE 27.411 in the file (vitest runs a file's cases in order), because 27.411 trashes TP and `canSee` and `hiddenItems` deliberately differ on a trashed ticket.
  - **27.412.** It agrees with the single-item definitions, the way 18.021 pins `visibleNotesWhere` to `canReadNote`. For EVERY user in `NOTES_USERS`, and every item in `[TP, TE, …all five NOTES]`:

    `hidden.has(item) === !(await (item.kind === 'ticket' ? canSee(db.pool, uid, item.id) : canReadNoteById(db.pool, uid, item.id)))`

    Control in the same `it`: the table is not constant. At least one user has a non-empty hidden set, and at least one has an empty one.

  Run: `pnpm --filter @gisik-nokma/server exec vitest run test/read/item-visibility.test.ts --maxWorkers=2 > /tmp/kgd-t1-vis.log 2>&1; tail -20 /tmp/kgd-t1-vis.log`.
  Expected: PASS.

  Mutation: make the visible query a LEFT JOIN with `AND (${visible} OR v.ticket_id IS NULL)` → 27.411's fail-closed line reddens.
  Mutation: drop `AND ${LIVE_TICKET_WHERE}` → 27.411's after-trash line reddens.

  Commit.

- [ ] **Step 7: The measurement tool and the gated perf cases (27.413–27.414)**

  `apps/server/src/tools/measure-semantic.ts`. It prints, it does not assert. Sibling: `seed-search-corpus.ts`'s `pathToFileURL` entry-point idiom at its foot.
  ```ts
  import { readFileSync } from 'node:fs';
  import { pathToFileURL } from 'node:url';
  import { embedTexts } from '../search/embedding.js';
  import { precisionAt5, selectTau, sweepTau } from '../semantic/calibration.js';
  import { SUGGESTION_K, SUGGESTION_MAX_SIZE, SUGGESTION_MIN_SIZE, SUGGESTION_SEED, SUGGESTION_TAU } from '../semantic/constants.js';
  import { suggestForPartition } from '../semantic/pipeline.js';

  type Labelled = { items: Array<{ id: string; kind: string; label: string; text: string }> };

  /** Spec D §4.1 "Measured first": τ, the job's run time per size, the embedding rate. Prints; never asserts. */
  export async function measureSemantic(fixturePath: string, sizes: readonly number[]): Promise<void> {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Labelled;
    const started = performance.now();
    const vectors = await embedTexts(fixture.items.map((entry) => entry.text));
    console.log(`embed: ${String(fixture.items.length)} texts in ${(performance.now() - started).toFixed(0)} ms`);
    const labels = new Map(fixture.items.map((entry) => [`${entry.kind}:${entry.id}`, entry.label]));
    const items = fixture.items.map((entry, index) => ({ key: `${entry.kind}:${entry.id}`, partition: 'w', vector: vectors[index] as Float32Array, text: entry.text }));
    const base = { k: SUGGESTION_K, seed: SUGGESTION_SEED, minSize: SUGGESTION_MIN_SIZE, maxSize: SUGGESTION_MAX_SIZE };
    console.log(`precision@5 = ${precisionAt5(vectors, fixture.items.map((entry) => entry.label)).toFixed(3)}`);
    const rows = sweepTau(items, (key) => labels.get(key) ?? '?', base);
    console.table(rows);
    console.log(`selectTau = ${String(selectTau(rows))} (constants.ts has ${String(SUGGESTION_TAU)})`);
    for (const size of sizes) {
      // Three fixture texts per synthetic item: 216 000 distinct mixes, so 10 000 items are not duplicates.
      const texts = Array.from({ length: size }, (_unused, i) => [i % 60, (i * 7) % 60, (i * 13) % 60].map((j) => fixture.items[j]?.text ?? '').join(' '));
      const embedStarted = performance.now();
      const synthetic = await embedTexts(texts);
      const embedMs = performance.now() - embedStarted;
      const pipelineStarted = performance.now();
      const out = suggestForPartition(synthetic.map((vector, i) => ({ key: `ticket:S${String(i)}`, partition: 'w', vector, text: texts[i] ?? '' })), { ...base, tau: SUGGESTION_TAU });
      console.log(`size=${String(size)} embed=${embedMs.toFixed(0)} ms (${(size / (embedMs / 1000)).toFixed(0)} texts/s) pipeline=${(performance.now() - pipelineStarted).toFixed(0)} ms suggestions=${String(out.length)}`);
    }
  }

  if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) { // seed-search-corpus.ts:259's idiom
    const fixture = process.argv[2] ?? 'test/fixtures/semantic-labelled.json';
    await measureSemantic(fixture, [500, 2_000, 10_000]);
  }
  ```

  `apps/server/test/semantic/perf.test.ts`. Copy `test/search/perf.test.ts:37-61`'s shape: gated by `process.env['SEMANTIC_PERF'] === '1'`, a printed skip with a reason, and an `it.skip` naming the variable.
  - **27.413.** `suggestForPartition` over 10 000 synthetic items (built exactly as `measureSemantic` builds them) takes ≤ 60 000 ms. It prints 500 / 2 000 / 10 000.
    - Control: 500 items take less than 10 000 items. A timer that measured nothing would fail it.
  - **27.414.** D4's cost at 500 items. In a fresh database, `seedProject` + `seedMember(member, [project])`, then 500 × `seedTicket` (titles `Perf ${i}`), with every 50th ticket made explicit to the owner (`setVisibilityEnv(WS, id, 'explicit', [owner])` through `applyAll`).
    - Run `hiddenItems` 100 times as the member over all 500.
    - p95 ≤ 150 ms, using `percentile` copied from `perf.test.ts:47-51`.
    - The answer has exactly 10 hidden items. This is the control that the query did the work.

  Run:
  - `SEMANTIC_PERF=1 pnpm --filter @gisik-nokma/server exec vitest run test/semantic/perf.test.ts --maxWorkers=1 > /tmp/kgd-t1-perf.log 2>&1; tail -30 /tmp/kgd-t1-perf.log`
  - `pnpm --filter @gisik-nokma/server semantic:measure > /tmp/kgd-t1-measure.log 2>&1; tail -40 /tmp/kgd-t1-measure.log`

  Expected: PASS. Quote both logs, named LOCAL with the machine, in the DONE. If either bar misses: STOP (header).

  Also run the default suite without the variable, and confirm the printed skip.

- [ ] **Step 8: Catalogue, Features, sweep, DONE**
  - Flip 27.400–27.414 to ✅ (27.413/27.414 ✅ with the LOCAL numbers in the line).
  - Under `<!-- D T1 -->` in Features §24 D, add: `⚙️ Semantic core: kNN (k 10, τ measured), seeded Louvain, class-based TF-IDF labels, signatures, audience partitions, and D4's hiddenItems — apps/server/src/semantic/, apps/server/src/read/item-visibility.ts`.
  - Run `pnpm check:citations` and `pnpm check:tasks`.
  - Build, then the server suite WHOLE: `pnpm --filter @gisik-nokma/server build > /tmp/kgd-t1-build.log 2>&1; tail -5 /tmp/kgd-t1-build.log` then `pnpm --filter @gisik-nokma/server exec vitest run --maxWorkers=2 > /tmp/kgd-t1-server.log 2>&1; tail -15 /tmp/kgd-t1-server.log`.

  Push. DONE + REVIEW.

### Task 2: Embedding tickets and comments, meaning search over tickets, `similar` (cases 27.420–27.439)

**Spec:** §2, §5.1 (`similar`, `search` extended), §7 cases 4 and 7. **Runs from day one** beside Tasks 1 and 3 and plans A–C. It touches no file plan A, B or C names, except the shared catalogue and `register.test.ts`'s FINAL list.

**Decisions this task makes** (Self-review G2, G4, G7):
- **Staleness is a text hash, not a seq.**
  - `proj_tickets` has no `seq` column (`migrations/1787961800000_proj-tickets.sql:73-89`).
  - `proj_ticket_comments` has `workspace_seq`, but that is the workspace's counter, not the comment's.
  - So `source_hash` = `md5(title || '\n' || description jsonb::text)` for a ticket, and `md5(body::text)` for a comment, computed in SQL by the staleness query itself. An edit during a pass leaves the old hash on the written chunks, and the next pass re-embeds.
- **A ticket's chunks** are its title (chunk 0, `heading_path ''`) followed by `chunkDoc(description)`. So a ticket always has at least one chunk, the note worker's title-fallback reasoning (`embed-worker.test.ts:25-40`).
  - A comment with no text gets ONE chunk with `chunk_text ''`, so it is not re-picked forever.
  - Every read filters `chunk_text <> ''`.
- **`matchedIn` for meaning hits:**
  - ticket chunk 0 → `'title'`;
  - other ticket chunks → `'description'`;
  - comment chunks → `'comment'`.

  `SearchHit` has no `kind` (`packages/domain/src/read-models.ts:432-453`). Tickets keep answering in `hits` and notes in `notes`, which is "the same shape" the spec asks for.
- **Note comments are not embedded.** §2's `item_kind ('ticket'|'comment')` has room for ticket comments only, because a comment row is keyed to its ticket.
- **18.140 is NOT widened.** `nudgesEmbedding` stays exactly as it is (`nudge.ts:40-44`, and 18.140's control at `embed-worker.test.ts:279-290` asserts a ticket event does not nudge). A second predicate, `nudgesItemEmbedding`, sits beside it, and `app.ts:1161` ORs them.

**Files:**
- Create:
  - `apps/server/migrations/<P1>_item-chunks.sql`
  - `apps/server/src/read/item-search.ts`
  - `apps/server/src/routes/similar.ts`
  - `packages/mcp-server/src/tools/graph-tools.ts`
  - `apps/server/test/search/item-embed.test.ts` (27.420–27.426)
  - `apps/server/test/routes/search-meaning-tickets.test.ts` (27.427–27.429)
  - `apps/server/test/routes/similar.test.ts` (27.430)
  - `packages/mcp-server/test/graph-tools.test.ts` (27.431)
- Modify:
  - `apps/server/src/search/embed-worker.ts`: `itemsPass` beside `vectorLiteral` (`:100-102`), called at the end of `runOnce` (`:202`).
  - `apps/server/src/search/nudge.ts`: add `nudgesItemEmbedding` below `:44`.
  - `apps/server/src/app.ts:1161`: `nudgesEmbedding(event) || nudgesItemEmbedding(event)`. Register `registerSimilarRoutes` beside `registerGroupRoutes` (`:1015`).
  - `apps/server/src/routes/search.ts:186-207`: meaning answers tickets.
  - `apps/server/src/purge/table-rules.ts` (after `search_note_chunks`, `:163-167`), `purge/erasure.ts` (after `:90`), `purge/survivors.ts` (inside the ticket loop, `:76-80`).
  - `packages/domain/src/read-models.ts`: `SimilarHit`, `SimilarResponse`, after `SearchResponse`.
  - `packages/mcp-server/src/tools/read-tools.ts:65-71`: the `search` description.
  - `packages/mcp-server/src/tools/register.ts:40`: `...graphTools(session)` after `...trashTools(session)`.
  - `packages/mcp-server/test/fixtures/tool-names.ts`: a `graph` module block.
  - `packages/mcp-server/test/fixtures/tool-sweep.ts`: a `similar` entry.
  - `packages/mcp-server/test/register.test.ts:89-103`: `'similar'` appended to FINAL, and its length.
  - `apps/server/test/routes/search-notes.test.ts:131-132` and `test-cases/18-notes.md:170` (18.150, below).

**Interfaces:**
- **Produces:**
  - the table `search_item_chunks (item_kind, item_id, chunk_index, workspace_id, ticket_id, heading_path, chunk_text, model, source_hash, embedding)`;
  - `nudgesItemEmbedding(event: LedgerEvent): boolean`;
  - `meaningTicketHits(db, eff, viewerId, workspaceId, query, spec, options?: { embed? }): Promise<SearchHit[]>`;
  - `similarItems(db, eff, viewerId, workspaceId, item: ItemRef, k: number): Promise<SimilarHit[]>` (`[]` when the source has no chunks yet; the route checks the source's visibility first);
  - `GET /v1/workspaces/:workspaceId/similar?item=<kind>:<id>&k=<1..20>` → `SimilarResponse`;
  - the domain types `SimilarHit = { kind: 'ticket' | 'note'; id: string; title: string; score: number }` and `SimilarResponse = { workspaceId: string; item: { kind: 'ticket' | 'note'; id: string }; hits: SimilarHit[] }`;
  - `graphTools(session): ToolDefinition[]`, holding `similar` (Task 6 appends three).
- **Consumes:**
  - Task 1's `ItemRef`, `itemKey`, `parseItemKey`;
  - `chunkDoc` (`packages/domain/src/doc-chunks.ts:73`), `purgedResolverFor` (`purge/purged-lookup.ts`, as `embed-worker.ts:4,144`);
  - `embedQuery` (`embedding.ts:262`), `foldSearchText` (`search-fold.ts:50`);
  - `assembleTicketCards`, `PROJ_TICKET_COLUMNS`, `ProjTicketRow` (`read/ticket-cards.ts:18,75`), `compileFilterSpec`, `BLOCKED_STATES_CTE` (`read/compile-filter.ts`);
  - `requireMember`, `READ_NOT_FOUND_BODY` (`read/membership.ts:60,15`), `canSee`, `canReadNoteById`.

- [ ] **Step 1: Catalogue lines**

  Under `<!-- D T2 -->`, add 27.420–27.432 ❌, one line each, with the property and the control named in Steps 2–6. 27.433–27.439 are reserved.

  Commit.

- [ ] **Step 2: The cache table**

  `apps/server/migrations/<P1>_item-chunks.sql`:
  ```sql
  -- Up Migration

  -- Knowledge Graph spec D §2: ticket and ticket-comment chunks, beside search_note_chunks
  -- (1790300000000_note-chunks.sql). A CACHE, not a projection, for that file's reason: a rebuild
  -- depends on the model binary, not on the ledger.

  CREATE TABLE search_item_chunks (
    item_kind     text NOT NULL CHECK (item_kind IN ('ticket', 'comment')),
    item_id       text NOT NULL,          -- ticket_id, or comment_id
    chunk_index   integer NOT NULL,
    workspace_id  text NOT NULL,
    ticket_id     text NOT NULL,          -- the item's ticket (itself, for a ticket): visibility and purge key
    heading_path  text NOT NULL,
    chunk_text    text NOT NULL,
    model         text NOT NULL,
    source_hash   text NOT NULL,          -- md5 of the text the chunks were built from (see COMMENT)
    embedding     vector(512) NOT NULL,
    PRIMARY KEY (item_kind, item_id, chunk_index)
  );
  CREATE INDEX search_item_chunks_ws_idx ON search_item_chunks (workspace_id);
  CREATE INDEX search_item_chunks_ticket_idx ON search_item_chunks (ticket_id);

  COMMENT ON TABLE search_item_chunks IS 'CACHE, not a projection: one row per chunk of a ticket (title, then description) or a ticket comment, with its embedding. Written only by the embedding worker (src/search/embed-worker.ts itemsPass). Stale when source_hash differs from the hash of the current text or model is not CURRENT_MODEL. Never in the projection registry, never verified by verify:projections.';
  COMMENT ON COLUMN search_item_chunks.source_hash IS 'md5(title || E''\n'' || description jsonb text) for a ticket; md5(body jsonb text) for a comment. A hash, not a seq: proj_tickets has no per-entity seq column.';

  -- Down Migration

  DROP TABLE search_item_chunks;
  ```
  Run `pnpm check:migrations` (the prefix rule in Global Constraints).

  Commit.

- [ ] **Step 3: The worker's items pass, the nudge, purge (27.420–27.426): tests first**

  `apps/server/test/search/item-embed.test.ts`:
  - Setup: copy `embed-worker.test.ts:42-50` and its `fakeVector`, which starts at `:52`.
  - Seed: `seedNotesFixture` gives TP and TE. Add a comment on TP through `applyCommitted` (`comment.added` on `{ kind: 'ticket', id: TP }`; take the payload shape from `ticket-events.ts`'s `commentAddedPayload`) and a description through `ticket.field_set` (`fieldId: 'description'`, value a doc built with `docFromText` or the shape `ticket-state.ts:190-209` reads; re-read both before writing).
  - Every case injects `embedTexts: async (texts) => texts.map(fakeVector)`, as 18.136–18.140 do, and records each call's texts (`embedCalls`, as `embed-worker.test.ts`'s `fakeEmbedder` does).
  - **Every worker is built with `log: (msg) => logged.push(msg)`, and every `it` ends with `expect(logged).toEqual([])`.** `runOnce` IS `runGuarded` (`embed-worker.ts:245`), which catches any throw and returns 0 (`:207-221`). Without this line every "returns 0" leg below is also green when `itemsPass` throws.
  - The seeded description has TWO chunks: `docOf`-style content `[heading 'Licence', paragraph 'Renewal needs the stamped form', heading 'Fees', paragraph 'Pay the fee at the counter']`. `chunkDoc` flushes on every heading (`doc-chunks.ts`, the `node.type === HEADING` arm) and otherwise packs up to 150 words into ONE chunk, so a one-paragraph description could never show a tail row.
  - The comment body is a single paragraph whose text appears in neither TP's title nor its description (Step 5's 27.428 control needs that too).

  The cases:
  - **27.420** `runOnce` writes TP's chunks:
    - TP's `item_kind 'ticket'` rows, ordered by `chunk_index`, are EXACTLY `[{0, '', 'Renew the trade licence'}, {1, 'Licence', 'Licence\nRenewal needs the stamped form'}, {2, 'Fees', 'Fees\nPay the fee at the counter'}]` as `(chunk_index, heading_path, chunk_text)`;
    - the comment has exactly one row: `item_kind 'comment'`, `item_id` = the `comment.added` event's id (that IS `comment_id`, `1790000000000_proj-ticket-comments.sql:82`), `ticket_id = TP`, `chunk_text` = the comment's text;
    - every row's `source_hash` equals the hash recomputed in the test with the plan's SQL expression over the current `proj_tickets` / `proj_ticket_comments` row (one `SELECT md5(…)` per item).

    Control in the same `it`: a second `runOnce` returns 0, every row's `(chunk_text, source_hash)` is unchanged, and `embedCalls` gained nothing.

    Kills: (a) drop the title piece (`[{ headingPath: '', text: item.title }, ...bodyChunks]` → `bodyChunks`) (b) write `item.item_id` into `ticket_id` for comments (c) `c.h <> ${TICKET_TEXT_HASH}` → `TRUE` (always stale; the control reds).
  - **27.421** Changes:
    - A `ticket.field_set` on the description (from the two-chunk body to ONE paragraph `'Renewal is due'`) moves the hash. The next pass returns ≥ 1, and TP's ticket rows are now EXACTLY `[{0, '', title}, {1, '', 'Renewal is due'}]`: two rows, `max(chunk_index) = 1`, no row at index 2. The REPLACE is whole-set.
    - Control: a `ticket.field_set` on `priority` returns 0 from the next pass, and TP's rows are byte-equal before and after.

    Kills: (a) `c.h <> ${TICKET_TEXT_HASH}` → `FALSE` (b) replace the per-item `DELETE FROM search_item_chunks WHERE item_kind = $1 AND item_id = $2` with `INSERT … ON CONFLICT (item_kind, item_id, chunk_index) DO UPDATE` (the index-2 row survives) (c) add `t.fields::text` to `TICKET_TEXT_HASH` (the priority control reds).
  - **27.422** Removal and recovery:
    - A `comment.edited` re-embeds that comment: its single row's `chunk_text` is the NEW text and `source_hash` moved.
    - A `comment.deleted` removes its rows (count 0 for that `item_id`) while TP's ticket rows remain (the same count as before the delete, > 0).
    - A `ticket.deleted` on TP removes every row with `ticket_id = TP`.
    - A `ticket.restored` brings them back on the next pass (count ≥ 1, chunk 0 is the title).

    Control: TE's rows are byte-equal throughout, AND `embedCalls` after the first pass never contains TE's title (a pass that deleted and re-wrote TE's rows would leave them byte-equal, so the equality alone cannot see it).

    Kills: (a) `COMMENT_TEXT_HASH` → `md5('')` (the edit is never re-picked) (b) drop the `OR (c.item_kind = 'comment' AND NOT EXISTS …)` disjunct of the cleanup DELETE (c) drop the cleanup's first disjunct (`NOT EXISTS … proj_tickets … deleted_at IS NULL`) (d) drop `c.item_id IS NULL OR` from the ticket arm of the staleness query (the restore is never re-picked).
  - **27.423** A model change re-embeds every item: `startEmbedWorker(pool, { model: 'other@x', … })` returns ≥ the number of items, and afterwards EVERY `search_item_chunks` row has `model = 'other@x'`. 27.422 deleted TP's comment, so add a new `comment.added` on TP and run one pass with the old model first. Assert that at least one `item_kind 'ticket'` row and one `item_kind 'comment'` row exist, then the model per kind. Control: the same model (`'other@x'` again) returns 0.

    Kills: (a) drop `OR c.model <> $1` from the ticket arm (b) drop it from the comment arm (c) write the literal `'test-model@1'` instead of `model` in the INSERT.
  - **27.424** The race:
    - Fresh ticket TR, created in this `it` (so it has no rows: assert `count = 0` first). An `embedTexts` stub that, when `texts` contains TR's title, applies `ticket.deleted` on TR before answering. After the pass: the stub DID fire (a flag), `proj_tickets.deleted_at` for TR is set, and `search_item_chunks` has no row with `ticket_id = TR`. That is the `FOR SHARE` recheck.
    - Same `it`: fresh ticket TQ with an embedded description (one clean pass first). Capture `h0` = TQ's `source_hash`. Edit the description (`ticket.field_set`), then a stub that, when `texts` contains TQ's title, applies a SECOND description edit before answering. After that pass, TQ's rows carry the FIRST edit's text and `source_hash` = the md5 of the first edit's text, computed in the test (exactly, not "≠ the new one"). The next pass returns ≥ 1, and the rows carry the second edit's text.

    Control: the plain stub writes TR's twin TR2 (created alike in the same pass, no deletion): its chunk 0 is its title.

    Kills: (a) drop the `if (still.rowCount === 0) { ROLLBACK; continue; }` block (b) re-read the hash inside the transaction (`SELECT ${TICKET_TEXT_HASH} … FOR SHARE`) and write it instead of `item.source_hash` (c) drop the `t.deleted_at IS NULL` from the ticket recheck's WHERE.
  - **27.425** `nudgesItemEmbedding`:
    - true for `ticket.created`, `ticket.field_set`, `ticket.deleted`, `ticket.restored`, and `comment.added` / `comment.edited` / `comment.deleted` on a TICKET entity;
    - false for `comment.added` on a NOTE entity, for `note.created`, and for `ticket.transitioned`.

    Same `it`, the control: `nudgesEmbedding` still answers exactly as 18.140 pins.

    Same `it`, the wiring (`app.ts:1164`, the OR): `buildApp` with an `onNoteBodyCommitted` spy (copy 18.140's app setup in `embed-worker.test.ts`); a committed `ticket.field_set` on TP calls the spy once with TP's id, and a committed `ticket.transitioned` does not call it.

    Kills: (a) drop `event.entity.kind === 'ticket' &&` (the note-comment leg reds) (b) replace the set test with `event.type.startsWith('ticket.') || event.type.startsWith('comment.')` (`ticket.transitioned` reds) (c) leave `app.ts:1164` as `if (nudgesEmbedding(event))` (the wiring leg reds).
  - **27.426** Purge:
    - Seed a survivor first: ticket TS2 whose description holds a `ticketRef` chip `{ ticketId: TP, key, title: TP's title }` (`collectSurvivors` finds it by `payload::text LIKE '%<TP>%'`, `survivors.ts:25-30`; `docToPlainText` renders the chip as `KEY title`, `doc-text.ts:123-132`). One pass; assert TS2 has ≥ 1 row and its description chunk contains TP's title.
    - After a ticket purge of TP (drive it the way `test/purge/` drives one; copy the nearest ticket-purge test's setup and cite it), and BEFORE any pass, `search_item_chunks` has no row with `ticket_id = TP` (the next pass's cleanup DELETE would remove them anyway, so this leg is only about `erasure.ts` if it is read before that pass).
    - Also before any pass, TS2 has 0 rows (`rederiveSurvivors`). The next pass rebuilds them: the description chunk contains `PURGED_ITEM_LABEL` and no longer contains TP's title.
    - `test/purge/table-rules.test.ts` is green with the new table.

    Control: TE's rows survive TP's purge, byte-equal.

    Kills: (a) drop the `erasure.ts` statement (TP's rows survive the purge) (b) drop the `survivors.ts` DELETE (TS2's rows are still there before the pass) (c) `table-rules.ts`'s `search_item_chunks` row removed (`table-rules.test.ts` reds).

  Run: `pnpm --filter @gisik-nokma/server exec vitest run test/search/item-embed.test.ts --maxWorkers=2 > /tmp/kgd-t2-embed.log 2>&1; tail -30 /tmp/kgd-t2-embed.log`. Expected: FAIL.

- [ ] **Step 4: Implement the items pass, the nudge and the purge rules**

  `apps/server/src/search/embed-worker.ts`. Add below `vectorLiteral` (`:100-102`):
  ```ts
  /**
   * Knowledge Graph spec D §2: tickets (title, then description) and ticket comments, into
   * `search_item_chunks`. The note pass's shape, kept deliberately the same:
   * - removals first, by their own statement;
   * - a staleness query;
   * - embed outside any transaction;
   * - a `FOR SHARE` recheck, then REPLACE.
   * The staleness key is a hash because `proj_tickets` has no per-entity seq.
   */
  const TICKET_TEXT_HASH = `md5(coalesce(t.fields->'title'->>'value', '') || E'\\n' || coalesce((t.fields->'description'->'value')::text, ''))`;
  const COMMENT_TEXT_HASH = `md5(coalesce(k.body::text, ''))`;
  type StaleItemRow = {
    item_kind: 'ticket' | 'comment';
    item_id: string;
    ticket_id: string;
    workspace_id: string;
    title: string;
    body: unknown;
    source_hash: string;
  };

  async function itemsPass(pool: Pool, embedTexts: (texts: string[]) => Promise<Float32Array[]>, model: string): Promise<number> {
    let processed = 0;
    const cleaned = await pool.query(
      `DELETE FROM search_item_chunks c
        WHERE NOT EXISTS (SELECT 1 FROM proj_tickets t WHERE t.ticket_id = c.ticket_id AND t.deleted_at IS NULL)
           OR (c.item_kind = 'comment'
               AND NOT EXISTS (SELECT 1 FROM proj_ticket_comments k WHERE k.comment_id = c.item_id AND k.deleted_at IS NULL))`,
    );
    processed += cleaned.rowCount ?? 0;

    const { rows } = await pool.query<StaleItemRow>(
      `SELECT * FROM (
         SELECT 'ticket'::text AS item_kind, t.ticket_id AS item_id, t.ticket_id, t.workspace_id,
                coalesce(t.fields->'title'->>'value', '') AS title, t.fields->'description'->'value' AS body,
                ${TICKET_TEXT_HASH} AS source_hash
           FROM proj_tickets t
           LEFT JOIN (SELECT item_id, min(source_hash) AS h, min(model) AS model
                        FROM search_item_chunks WHERE item_kind = 'ticket' GROUP BY item_id) c ON c.item_id = t.ticket_id
          WHERE t.deleted_at IS NULL AND (c.item_id IS NULL OR c.h <> ${TICKET_TEXT_HASH} OR c.model <> $1)
         UNION ALL
         SELECT 'comment'::text, k.comment_id, k.ticket_id, k.workspace_id, '', k.body, ${COMMENT_TEXT_HASH}
           FROM proj_ticket_comments k
           JOIN proj_tickets t ON t.ticket_id = k.ticket_id
           LEFT JOIN (SELECT item_id, min(source_hash) AS h, min(model) AS model
                        FROM search_item_chunks WHERE item_kind = 'comment' GROUP BY item_id) c ON c.item_id = k.comment_id
          WHERE k.deleted_at IS NULL AND t.deleted_at IS NULL
            AND (c.item_id IS NULL OR c.h <> ${COMMENT_TEXT_HASH} OR c.model <> $1)
       ) s
       ORDER BY s.item_id DESC
       LIMIT $2`,
      [model, BATCH],
    );

    for (const item of rows) {
      const isPurged = await purgedResolverFor(pool, [item.body]);
      const bodyChunks = item.body === null || item.body === undefined ? [] : chunkDoc(item.body, { isPurged });
      const pieces =
        item.item_kind === 'ticket'
          ? [{ headingPath: '', text: item.title }, ...bodyChunks]
          : bodyChunks.length > 0
            ? bodyChunks
            : [{ headingPath: '', text: '' }]; // an empty comment: one blank chunk, so it is not re-picked forever; reads skip ''
      const vectors = await embedTexts(pieces.map((piece) => piece.text));

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const still =
          item.item_kind === 'ticket'
            ? await client.query('SELECT 1 FROM proj_tickets WHERE ticket_id = $1 AND deleted_at IS NULL FOR SHARE', [item.item_id])
            : await client.query(
                `SELECT 1 FROM proj_ticket_comments k JOIN proj_tickets t ON t.ticket_id = k.ticket_id
                  WHERE k.comment_id = $1 AND k.deleted_at IS NULL AND t.deleted_at IS NULL FOR SHARE OF k, t`,
                [item.item_id],
              );
        if (still.rowCount === 0) {
          await client.query('ROLLBACK');
          continue;
        }
        await client.query('DELETE FROM search_item_chunks WHERE item_kind = $1 AND item_id = $2', [item.item_kind, item.item_id]);
        for (let index = 0; index < pieces.length; index += 1) {
          const piece = pieces[index]!;
          const vector = vectors[index];
          if (vector === undefined) throw new Error(`no embedding for chunk ${String(index)} of ${item.item_kind} ${item.item_id}`);
          if (vector.length !== EMBEDDING_DIM) throw new Error(`embedding of ${String(vector.length)} dims, expected ${String(EMBEDDING_DIM)}`);
          await client.query(
            `INSERT INTO search_item_chunks
               (item_kind, item_id, chunk_index, workspace_id, ticket_id, heading_path, chunk_text, model, source_hash, embedding)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [item.item_kind, item.item_id, index, item.workspace_id, item.ticket_id, piece.headingPath, piece.text, model, item.source_hash, vectorLiteral(vector)],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      processed += 1;
    }
    return processed;
  }
  ```
  - In `runOnce`, add `processed += await itemsPass(pool, embedTexts, model);` directly before `return processed;` (`:202`).
  - Re-read `chunkDoc`'s parameter type (`doc-chunks.ts:73`). If it is not `unknown`, narrow `item.body` the way `StaleNoteRow.body` reaches it (`:93`, `:144`).

  `apps/server/src/search/nudge.ts`. Add below `:44`:
  ```ts
  /**
   * Knowledge Graph spec D §2: the events that change a ticket's or a ticket comment's embedded text, or whether
   * it exists. A SEPARATE predicate, so `nudgesEmbedding` and 18.140 stay exactly as pinned. `ticket.field_set`
   * is taken whole: the worker's hash, not this list, decides whether the text moved, and a nudge that finds
   * nothing stale costs one query.
   */
  const ITEM_NUDGE_TICKET_TYPES = new Set([
    'ticket.created', 'ticket.field_set', 'ticket.deleted', 'ticket.restored',
    'comment.added', 'comment.edited', 'comment.deleted',
  ]);

  export function nudgesItemEmbedding(event: LedgerEvent): boolean {
    return event.entity.kind === 'ticket' && ITEM_NUDGE_TICKET_TYPES.has(event.type);
  }
  ```
  - `apps/server/src/app.ts:1164`: `if (nudgesEmbedding(event) || nudgesItemEmbedding(event)) onNoteBodyCommitted(event.entity.id);`. (Cite corrected from `:1161`, which on the ref is the `if (deps.onNoteBodyCommitted !== undefined)` guard; the call is `:1164`.)
  - Add one docblock sentence at `:1150`: the callback is now "a text that is embedded changed", and the name is kept to avoid churn in `index.ts:330-335` (cite corrected from `:329-334`; `:329` is the worker's `: null;`).
  - Import `nudgesItemEmbedding` from `./search/nudge.js`, beside `nudgesEmbedding`'s import.

  Purge:
  - `purge/table-rules.ts`, after `search_note_chunks` (`:172-176`; cite corrected from `:163-167`, which on the ref is `projection_backfills` and `proj_note_lexemes`):
    ```ts
    search_item_chunks: {
      rule: 'rederive',
      by: ['workspace_id', 'ticket_id'],
      why: 'Erased for the set by ticket_id (a comment row carries its ticket); a surviving ticket’s rows are deleted and the embed worker re-chunks it (KG-D Task 2).',
    },
    ```
  - `purge/erasure.ts`, after `:90`: `['DELETE FROM search_item_chunks WHERE ticket_id = ANY($1::text[])', [T]],`.
  - `purge/survivors.ts`, inside `rederiveSurvivors`' ticket loop (`:97-102`), after the inner `for` closes (`:101`): `await db.query('DELETE FROM search_item_chunks WHERE ticket_id = $1', [ticketId]);`. This mirrors `:115` for notes. (Cites corrected: the plan said "the ticket loop, `:76-80`", "after `:79`" and "mirrors `:94`". On the ref, `:76-80` is `lockSurvivors`, whose `:79` is the NOTE lock loop, and the note-chunk DELETE is `:115`.)

  Run the Step 3 command. Expected: PASS. Then run `test/search/embed-worker.test.ts` and `test/purge/` (18.136–18.140 and the purge guard): PASS.

  Mutations:

  | Mutation | Expected |
  |---|---|
  | drop the `FOR SHARE` recheck | 27.424 reds |
  | `c.h <> …` → `FALSE` | 27.421 reds |
  | drop the survivors line | 27.426's survivor line reds |

  **Prose to sweep:** (all of Task 2; each line names the step whose commit makes it false, and that commit fixes it)
  - [Step 4] `apps/server/src/search/embed-worker.ts:109-113` — "The pass. Returns how many notes it processed — embedded notes plus notes whose chunks were dropped". It now counts tickets, comments and removed item rows too.
  - [Step 4] `apps/server/src/app.ts:188-190` — `onNoteBodyCommitted` is "Called once per committed note event whose TEXT changed — `note.created` and `note.body_set`, filtered by `nudgesEmbedding`". It is now also called for the ticket and comment types of `nudgesItemEmbedding`.
  - [Step 4] `apps/server/src/search/nudge.ts:3-4` and `:25-28` — the module is "Which committed events wake the embedding worker", and "`note.created` and `note.body_set` are the plan's two". A second predicate now wakes it too.
  - [Step 5] `apps/server/src/routes/search.ts:188-192` — "Tickets have no chunks in v1, so `mode=meaning` is a NOTE mode and the ticket half answers `[]`". Step 5 replaces it.
  - [Step 5] `packages/app-core/src/online/online-data-source.ts:523-526` — "leaving it out would ask the server to search tickets too, and `mode=meaning` would then return `hits: []` anyway". The `kinds: 'note'` choice still stands, but the reason given is false after Step 5.
  - [Step 6] `packages/mcp-server/src/tools/read-tools.ts:68-69` — "`mode: "meaning"` … answers notes only". Step 6 replaces it.
  - [Step 5, fixed in Step 7's Features edit] `Features.md:1189-1190` — "**`mode=meaning` returns `hits: []`**: tickets have no chunks in v1". Step 7's grep for `answers notes only` does not find this line; grep `hits: \[\]` as well.
  - [Step 5] `test-cases/18-notes.md:170` (18.150) and `apps/server/test/routes/search-notes.test.ts:132` ("tickets have no chunks in v1"). Step 5 amends both.
  - [Step 6] `apps/server/src/config.ts:171` — "Search keeps answering lexically; only `mode=meaning` goes stale" — and `apps/server/src/index.ts:316-319` — "a box short on memory serves the whole product except `mode=meaning` search". With the worker disabled, `similar` (new here) goes stale too.
  - [Step 6] `Features.md:3454` — "`search` (tickets and/or notes, by words or, for notes, by meaning …)" and "Sixty-three tools in both doors". Both false after Step 6 (tickets by meaning; one more tool).
  - [Step 6] `Features.md:3407` — "nine registered tools (sixteen since MCP CRUD Task 6, sixty-three since MCP-everything)": one more tool.
  - [Step 6] `test-cases/14-mcp-server.md:938` and `packages/mcp-server/test/register.test.ts:87` — 14.555 "the final registry is the 63 tools". Step 6 already says to update both; listed so the count in the Features bullet above moves with them.
  - Searched with no other hit: `docs/manual.md` (`meaning`, `notes only`; `:1939` and `:2018` speak of English only and stay true; §16's "What your assistant can do", `:2043-2069`, lists no search mode) and `packages/app-core/src/help/content.generated.ts` (the same two sentences).

  Commit.

- [ ] **Step 5: Meaning search answers tickets (27.427–27.429)**

  The existing pin moves in this commit. `apps/server/test/routes/search-notes.test.ts:131-132` asserts meaning-mode `hits` is `[]` "tickets have no chunks in v1", and its catalogue line is `test-cases/18-notes.md:170` (18.150, ✅).
  - The assertion stays true in that file's world: it seeds no item chunks. So change only the message, to `'no item chunks are seeded in this file (KG-D 27.429)'`.
  - Amend 18.150's line by appending: `Since KG-D T2, meaning answers tickets from search_item_chunks; this file seeds none, so hits is still [] here — 27.427 covers the ticket half.`
  - Never renumber.

  `apps/server/test/routes/search-meaning-tickets.test.ts`:
  - Setup: `seedNotesFixture` and `buildTestApp`.
  - The fixture's tickets have a title and nothing else (`notes-fixture.ts`'s `ticket(TP, 'Renew the trade licence')`). Before the pass, give TP a description (`ticket.field_set`, one paragraph, e.g. `'The municipal office wants the stamped renewal form before the end of March'`) and a comment (`comment.added`, e.g. `'Call the accountant about the late fee waiver'`), through `applyCommitted`. The three texts share no word, so lexical precedence (`title` → `description` → `comment`, `read-models.ts:446-450`) cannot pick a different column from the one meaning picks.
  - Run the REAL worker pass once with the real model (`startEmbedWorker(db.pool, { intervalMs: 3_600_000, log: (msg) => logged.push(msg) }).runOnce()`, then `stop()`), and assert `logged` is `[]` and that `search_item_chunks` holds TP's three rows (title, description, comment) before any case runs. A swallowed failure (`runGuarded`, `embed-worker.ts:207-221`) would otherwise leave every "absent" leg below green.
  - Query with `signInWithPhone` and the route, as `search-notes.test.ts` does. Re-read its helper `search(user, qs)` and copy it.

  The cases:
  - **27.427** `GET /v1/search?workspaceId=…&q=<TP's description text>&mode=meaning`:
    - as `memberIn` it returns TP in `hits` with `matchedIn: 'description'`;
    - Rule A, accepted by planner ruling 2026-10-04 (report Q1). The plan's leg was "as `memberOut` it does not return TP". On the ref every member is on every founded project (`effective-role.ts:5-19`, `RULE_A_ROLES`), so `memberOut` READS TP (project mode), and the leg is red on correct code. Rebound as T1 did (`test/read/item-visibility.test.ts:16-19`): `memberOut` is now the Rule A control, and it DOES get TP; the reader who cannot see TP is a guest;
    - as `guestListed` (on no project; explicit lists only, `visible-where.ts:114-115`), the description query answers `hits` that contain TE (the guest's one visible ticket, so the list is not empty for an unrelated reason) and no TP; and TE's text (`'Share the July invoices'`) returns TE and never TP.

    Control: the owner gets TP.

    Kills: (a) drop `visibleTicketsWhere(eff, viewerId, params)` from `where` in `meaningTicketHits` (`guestListed` sees TP) (b) `row.chunk_index === 0 ? 'title' : 'description'` → `'title'` always. (Dropping the meaning branch is NOT killed here: the exact description text is also a lexical hit with `matchedIn 'description'`. 27.429 kills it.)
  - **27.428** `matchedIn`:
    - a query equal to TP's title → `'title'`;
    - a query equal to TP's comment text → `'comment'`.

    Control: lexical mode for the comment text also says `'comment'`, so both modes agree on the column vocabulary.

    Kills: (a) `row.chunk_index === 0` → `row.chunk_index === 1` (b) drop the `row.item_kind === 'comment' ? 'comment' :` arm (the comment's chunk 0 then answers `'title'`).
  - **27.429** A ticket that matches LEXICALLY but has no chunks (created after the pass) is absent from meaning `hits` and present in lexical `hits`. These are two paths, not one path twice. Same `it`: after a `comment.deleted` on TP's comment (no pass in between, so its chunk row is still there), the comment-text query in meaning mode no longer answers `matchedIn: 'comment'` for TP.

    Kills: (a) drop the inserted `if (wantTickets && mode === 'meaning')` block (the new ticket appears in meaning `hits` through the lexical path) (b) drop the `(c.item_kind = 'ticket' OR EXISTS (… k.deleted_at IS NULL))` conjunct (the deleted comment's stale chunk still answers).

  `apps/server/src/read/item-search.ts`:
  ```ts
  import type { FilterSpec, SearchHit } from '@gisik-nokma/domain';
  import { foldSearchText } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import type { EffectiveRole } from '../permissions/effective-role.js';
  import { embedQuery } from '../search/embedding.js';
  import { BLOCKED_STATES_CTE, compileFilterSpec } from './compile-filter.js';
  import { SqlParams } from './sql-params.js';
  import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from './ticket-cards.js';
  import { LIVE_TICKET_WHERE, visibleTicketsWhere } from './visible-where.js';

  const MEANING_CANDIDATES = 200;
  const MEANING_LIMIT = 20;
  const SNIPPET_CHARS = 160;

  function snippetOf(chunkText: string): string {
    const newline = chunkText.indexOf('\n');
    return (newline === -1 ? chunkText : chunkText.slice(newline + 1)).slice(0, SNIPPET_CHARS);
  }

  /**
   * Spec D §2 + §5.1: meaning search over tickets, from `search_item_chunks`. The nearest chunk PER TICKET
   * (`DISTINCT ON`, then sorted in code: `meaningNoteSearch`'s two-step, `note-search.ts:284-299`).
   * Visibility at QUERY time through the same WHERE as lexical tickets (`routes/search.ts:216-228`); a comment
   * follows its ticket because its row carries `ticket_id`. Deleted comments are excluded by the join, never
   * by trusting the worker to have caught up.
   */
  export async function meaningTicketHits(
    db: Queryable,
    eff: EffectiveRole,
    viewerId: string,
    workspaceId: string,
    q: string,
    spec: FilterSpec,
    options: { embed?: (text: string) => Promise<Float32Array> } = {},
  ): Promise<SearchHit[]> {
    const folded = foldSearchText(q);
    if (folded === '') return [];
    const vector = await (options.embed ?? embedQuery)(folded);
    const params = new SqlParams();
    const query = params.add(`[${Array.from(vector).join(',')}]`);
    const where = [
      `c.workspace_id = ${params.add(workspaceId)}`,
      `c.chunk_text <> ''`,
      visibleTicketsWhere(eff, viewerId, params),
      LIVE_TICKET_WHERE,
      `(c.item_kind = 'ticket' OR EXISTS (SELECT 1 FROM proj_ticket_comments k WHERE k.comment_id = c.item_id AND k.deleted_at IS NULL))`,
    ];
    const compiled = compileFilterSpec(spec, params);
    where.push(...compiled.clauses);
    const cte = compiled.needsBlockedCte ? `WITH ${BLOCKED_STATES_CTE} ` : '';
    const { rows } = await db.query<ProjTicketRow & { chunk_text: string; item_kind: 'ticket' | 'comment'; chunk_index: number; distance: number }>(
      `${cte}SELECT DISTINCT ON (t.ticket_id) ${PROJ_TICKET_COLUMNS},
              c.chunk_text, c.item_kind, c.chunk_index, (c.embedding <=> ${query}::vector) AS distance
         FROM search_item_chunks c
         JOIN proj_tickets t ON t.ticket_id = c.ticket_id
         JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE ${where.join(' AND ')}
        ORDER BY t.ticket_id, distance
        LIMIT ${params.add(MEANING_CANDIDATES)}`,
      params.toArray(),
    );
    const ordered = [...rows].sort((a, b) => Number(a.distance) - Number(b.distance)).slice(0, MEANING_LIMIT);
    const cards = await assembleTicketCards(db, viewerId, ordered);
    const cardById = new Map(cards.map((card) => [card.ticketId, card]));
    return ordered.map((row) => {
      const card = cardById.get(row.ticket_id);
      if (card === undefined) throw new Error(`meaningTicketHits: no card assembled for ticket ${row.ticket_id}`);
      const matchedIn: SearchHit['matchedIn'] = row.item_kind === 'comment' ? 'comment' : row.chunk_index === 0 ? 'title' : 'description';
      return { card, snippet: snippetOf(row.chunk_text), matchedIn };
    });
  }
  ```
  - Before writing, re-read three things and adjust the imports to what is really exported:
    - whether `FilterSpec` and `foldSearchText` are exported from `@gisik-nokma/domain`;
    - `PROJ_TICKET_COLUMNS`'s alias (`ticket-cards.ts:75`);
    - `compileFilterSpec`'s return fields (`routes/search.ts:237-240` uses `.clauses` and `.needsBlockedCte`).
  - `snippetOf` is copied, not imported: `note-search.ts:372` does not export it. Export it from there instead if the reviewer prefers one copy. Either is fine; say which in the commit.

  `apps/server/src/routes/search.ts:186-207`:
  - Replace `:188-193` with `const wantTickets = kinds.includes('ticket');`, plus a comment that cites spec D §2 and KG-D 27.427 and says the v1 ruling it replaces.
  - After `:203`, add:
    ```ts
    if (wantTickets && mode === 'meaning') {
      const hits = await meaningTicketHits(db, eff, viewerId, workspaceId, query, spec);
      return { workspaceId, query, hits, notes, ...(corrected === undefined ? {} : { corrected }) };
    }
    ```

  Run:
  - `pnpm --filter @gisik-nokma/server exec vitest run test/routes/search-meaning-tickets.test.ts test/routes/search-notes.test.ts test/routes/search*.test.ts --maxWorkers=2 > /tmp/kgd-t2-search.log 2>&1; tail -30 /tmp/kgd-t2-search.log`

  Expected: PASS.

  Mutation: drop `visibleTicketsWhere` from `where` → 27.427's `guestListed` line reds. (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan said "`memberOut` line"; `memberOut` reads TP on the ref.)

  Commit.

- [ ] **Step 6: `similar`, the route and the MCP tool (27.430–27.432)**

  `apps/server/src/read/item-search.ts`, appended:
  ```ts
  export const SIMILAR_MAX_K = 20;

  /**
   * Spec D §5.1 `similar`: the nearest visible items by meaning. An item's vector is the mean of its chunk vectors
   * (§4.1 step 1); a ticket's includes its comments'. pgvector's `avg(vector)` is the mean, and `<=>` normalises,
   * so the mean need not be re-normalised. The SOURCE's visibility is the route's question (404), not this one's.
   */
  export async function similarItems(
    db: Queryable,
    eff: EffectiveRole,
    viewerId: string,
    workspaceId: string,
    item: { kind: 'ticket' | 'note'; id: string },
    k: number,
  ): Promise<Array<{ kind: 'ticket' | 'note'; id: string; title: string; score: number }>> {
    const sourceSql =
      item.kind === 'ticket'
        ? `SELECT avg(c.embedding)::text AS v FROM search_item_chunks c WHERE c.ticket_id = $1 AND c.workspace_id = $2 AND c.chunk_text <> ''`
        : `SELECT avg(c.embedding)::text AS v FROM search_note_chunks c WHERE c.note_id = $1 AND c.workspace_id = $2`;
    const source = await db.query<{ v: string | null }>(sourceSql, [item.id, workspaceId]);
    const vector = source.rows[0]?.v ?? null;
    if (vector === null) return [];
    const params = new SqlParams();
    const ws = params.add(workspaceId);
    const src = params.add(vector);
    const ticketVisible = visibleTicketsWhere(eff, viewerId, params);
    const noteVisible = visibleNotesWhere(eff, viewerId, params);
    const kindParam = params.add(item.kind);
    const idParam = params.add(item.id);
    const { rows } = await db.query<{ kind: 'ticket' | 'note'; id: string; title: string; score: number }>(
      `WITH items AS (
         SELECT 'ticket'::text AS kind, t.ticket_id AS id, coalesce(t.fields->'title'->>'value', '') AS title, avg(c.embedding) AS v
           FROM search_item_chunks c
           JOIN proj_tickets t ON t.ticket_id = c.ticket_id
           JOIN proj_visibility v ON v.ticket_id = t.ticket_id
          WHERE c.workspace_id = ${ws} AND c.chunk_text <> '' AND ${LIVE_TICKET_WHERE} AND ${ticketVisible}
            AND (c.item_kind = 'ticket' OR EXISTS (SELECT 1 FROM proj_ticket_comments k WHERE k.comment_id = c.item_id AND k.deleted_at IS NULL))
          GROUP BY t.ticket_id, t.fields
         UNION ALL
         SELECT 'note'::text, n.note_id, n.title, avg(c.embedding)
           FROM search_note_chunks c JOIN proj_notes n ON n.note_id = c.note_id
          WHERE c.workspace_id = ${ws} AND n.deleted = FALSE AND ${noteVisible}
          GROUP BY n.note_id, n.title
       )
       SELECT kind, id, title, 1 - (v <=> ${src}::vector) AS score
         FROM items
        WHERE NOT (kind = ${kindParam} AND id = ${idParam})
        ORDER BY v <=> ${src}::vector, kind, id
        LIMIT ${params.add(Math.min(Math.max(k, 1), SIMILAR_MAX_K))}`,
      params.toArray(),
    );
    return rows.map((row) => ({ ...row, score: Number(row.score) }));
  }
  ```
  - Add `visibleNotesWhere` to the import.
  - Visibility of the SOURCE is checked by the route (below), not here, so that `[]` (no chunks yet) and `null` (not yours to see) stay different answers.

  `apps/server/src/routes/similar.ts`. The sibling is `routes/groups.ts`: the same signature and the `requireMember` → 404 shape.
  ```ts
  import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
  import type { SimilarResponse } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
  import { SIMILAR_MAX_K, similarItems } from '../read/item-search.js';
  import { canReadNoteById } from '../visibility/can-read-note.js';
  import { canSee } from '../visibility/can-see.js';

  export function registerSimilarRoutes(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
    app.get<{ Params: { workspaceId: string }; Querystring: { item?: string; k?: string } }>(
      '/v1/workspaces/:workspaceId/similar',
      { preHandler: requireSession },
      async (request, reply) => {
        const { workspaceId } = request.params;
        const match = /^(ticket|note):(.+)$/.exec(request.query.item ?? '');
        const k = request.query.k === undefined ? 10 : Number(request.query.k);
        if (match === null || !Number.isInteger(k) || k < 1 || k > SIMILAR_MAX_K) {
          return reply.code(400).send({ error: `item must be ticket:<id> or note:<id>, and k an integer 1–${String(SIMILAR_MAX_K)}` });
        }
        const eff = await requireMember(deps.pool, request.currentUserId, workspaceId);
        if (eff === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
        const kind = match[1] as 'ticket' | 'note';
        const id = match[2] as string;
        const visible = kind === 'ticket' ? await canSee(deps.pool, request.currentUserId, id) : await canReadNoteById(deps.pool, request.currentUserId, id);
        if (!visible) return reply.code(404).send(READ_NOT_FOUND_BODY);
        const hits = await similarItems(deps.pool, eff, request.currentUserId, workspaceId, { kind, id }, k);
        const body: SimilarResponse = { workspaceId, item: { kind, id }, hits };
        return body;
      },
    );
  }
  ```
  - Re-read how a sibling route answers a 400 (the error body shape), and match it.
  - Register it in `app.ts` beside `:1015`.

  `packages/domain/src/read-models.ts`, after `SearchResponse`:
  ```ts
  /** Knowledge Graph spec D §5.1 `similar`: one nearest item, by meaning. `score` is cosine similarity (1 = same direction). */
  export type SimilarHit = { kind: 'ticket' | 'note'; id: string; title: string; score: number };
  export type SimilarResponse = { workspaceId: string; item: { kind: 'ticket' | 'note'; id: string }; hits: SimilarHit[] };
  ```

  `packages/mcp-server/src/tools/graph-tools.ts`:
  ```ts
  import { z } from 'zod';
  import type { Session } from '../session.js';
  import type { ToolDefinition } from './read-tools.js';
  import { readOrNotFound } from './reads.js';

  /**
   * Knowledge Graph spec D §5.1: the graph and meaning READS. Every one calls the HTTP API, so the server's
   * visibility answers for it (`reads.ts:6`). D6's switch has no effect on any of them (§5.2 "Switch").
   */
  const id = z.string().min(1);
  const enc = encodeURIComponent;
  const itemRef = z.object({ kind: z.enum(['ticket', 'note']), id });
  const similarShape = { workspaceId: id, item: itemRef, k: z.number().int().min(1).max(20).optional() };

  export function graphTools(session: Session): ToolDefinition[] {
    return [
      {
        name: 'similar',
        description:
          'The tickets and notes nearest to one item by MEANING (what they say, not the words they share), with a ' +
          'similarity score from 0 to 1. Up to k (default 10, at most 20), only items you can see. A ticket counts ' +
          'its comments. Items written in the last few seconds may not be indexed yet.',
        inputSchema: similarShape,
        handler: async (args) => {
          const a = z.object(similarShape).parse(args);
          const qs = `item=${enc(`${a.item.kind}:${a.item.id}`)}${a.k === undefined ? '' : `&k=${String(a.k)}`}`;
          return readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/similar?${qs}`, 'item');
        },
      },
    ];
  }
  ```
  - `register.ts:40`: add `...graphTools(session),` after `...trashTools(session),`, and import it.
  - `tool-names.ts`: a new module block after `trash`:
    ```ts
    graph: [
      // graph begin (KG-D T2, T6)
      'similar',
      // graph end
    ],
    ```
  - `tool-sweep.ts`: `similar: { args: { workspaceId: 'w', item: { kind: 'ticket', id: 't' } }, session: { get: async () => ({ workspaceId: 'w', item: { kind: 'ticket', id: 't' }, hits: [] }) } },`.
  - `register.test.ts:89-103`: append `'similar',` on its own line after `'list_deleted',` and set the length to the new count.
    - The count is 64 after this step: 63 on `origin/release/knowledge-graph` before it (2026-10-04: `register.test.ts:103` `toHaveLength(63)`, and 14.555's title says "63 tools"), plus `similar`. Plan A's `link_tickets` makes it 65 if A lands first. (The original line said "64 on today's tip"; the ref has 63, so 64 is the count AFTER `similar`.)
    - Re-derive it from the release tip at PR time. Never copy a number from this plan.
    - Update 14.555's title in that test and in `test-cases/` (grep `14.555`) to the new count.
  - `read-tools.ts:65-71`. Replace `'what they say rather than the words they use and answers notes only. '` with `'what they say rather than the words they use, for tickets (their title, description and comments) and notes alike. '`.

  Tests:
  - `apps/server/test/routes/similar.test.ts`, with the real worker pass and the real model as in Step 5:
    - Seed before the pass (as Step 5 does for TP): TP's description and comment, and a note `nNear` (workspace scope) whose body paraphrases TP's description.
    - **27.430** `GET …/similar?item=ticket:TP&k=5`:
      - as `memberIn` it answers `hits.length >= 2` (asserted FIRST: "descending" over 0 or 1 hit cannot fail), hits that never include TP itself, with scores in [−1, 1], and `scores` equal to `[...scores].sort((a, b) => b - a)` with `scores[0] > scores.at(-1)` (strictly, so a constant score cannot pass);
      - as `guestUnlisted` → 404 (TP is not theirs), with a body byte-equal to `READ_NOT_FOUND_BODY`. (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan's subject was `memberOut`, who reads TP on the ref; a guest on no project does not.) Same `it`: `memberOut` → 200 (the Rule A control, so the 404 is about the reader);
      - `k=21` → 400;
      - `item=widget:x` → 400.

      Control: as the owner, `nNear` ranks first (`hits[0]` is `{ kind: 'note', id: nNear }`). `nNear` is the NEWEST note, so every fixture note the owner sees sorts before it by id: only a distance order puts it first.

      Same `it`: `guestListed`'s hits for `item=ticket:TE` are non-empty and include `nExplicit` (asserted first: guestListed is in its explicit list, `notes-fixture.ts:208-212`), and never include TP or `nProject`.

      Kills: (a) drop `WHERE NOT (kind = ${kindParam} AND id = ${idParam})` (TP itself ranks first at score 1) (b) `ORDER BY v <=> ${src}::vector, kind, id` → `ORDER BY kind, id` (the descending leg reds, and the older-id fixture notes sort before `nNear`) (c) drop `${ticketVisible}` (guestListed sees TP) (d) drop `${noteVisible}` (guestListed sees nProject) (e) drop the route's `if (!visible) return reply.code(404)…` (guestUnlisted gets 200).
  - `packages/mcp-server/test/graph-tools.test.ts`. Copy `member-admin-tools.test.ts`'s fake Session (re-read its top; `get`, `post`, `postEvents`, `...NO_TRANSFER`):
    - **27.431** `similar` GETs `/v1/workspaces/w/similar?item=ticket%3At&k=3` (asserted on the recorded path, exactly) and returns the body the session answered (`toEqual` that object). A 404 from the session becomes `item not found or not visible to you`. Control: without `k`, the path is exactly `/v1/workspaces/w/similar?item=ticket%3At`.

      Kills: (a) build `item=` without `enc` (the path holds `ticket:t`) (b) `'item'` → `'ticket'` in `readOrNotFound`'s noun (c) `a.k === undefined ? '' : …` → always append `&k=${String(a.k)}` (the control's path ends `&k=undefined`).
    - **27.432** `allTools` includes `similar` directly after `list_deleted` (by index, not `toContain`), and the `search` description no longer contains `answers notes only` AND does contain `for tickets (their title, description and comments) and notes alike` (a deleted sentence would otherwise pass the negative leg). Control: it still contains `"CCSO-12"`.

      Kills: (a) leave `read-tools.ts:69` unchanged (b) delete the sentence instead of replacing it (the positive leg reds) (c) register `graphTools` before `trashTools` in `register.ts`.

  Run:
  - `pnpm --filter @gisik-nokma/mcp-server build > /tmp/kgd-t2-mcpb.log 2>&1; tail -5 /tmp/kgd-t2-mcpb.log`
  - `pnpm --filter @gisik-nokma/mcp-server exec vitest run --maxWorkers=2 > /tmp/kgd-t2-mcp.log 2>&1; tail -15 /tmp/kgd-t2-mcp.log`
  - `pnpm --filter @gisik-nokma/server exec vitest run test/routes/similar.test.ts test/mcp/mcp-http.test.ts --maxWorkers=2 > /tmp/kgd-t2-sim.log 2>&1; tail -15 /tmp/kgd-t2-sim.log`

  The hosted check 14.262 (`mcp-http.test.ts:164`) compares to `allTools`, so it follows by itself. Expected: PASS.

  Commit.

- [ ] **Step 7: Features, flips, the whole battery**
  - Flip 27.420–27.432 ✅.
  - Features §24 D, under `<!-- D T2 -->`:
    - `✅ Meaning search covers tickets and their comments (title, description, comment matches), visibility-checked at query time — apps/server/src/read/item-search.ts`
    - `✅ similar: nearest visible tickets and notes by meaning, in the API and MCP — apps/server/src/routes/similar.ts, packages/mcp-server/src/tools/graph-tools.ts`
    - `⚙️ search_item_chunks cache, filled by the embed worker with a text-hash staleness key; purged with its ticket — apps/server/src/search/embed-worker.ts`
  - Amend Features' existing meaning-search bullet (grep `answers notes only` / `meaning` in Features.md §18) so it no longer says notes only.
  - Build all → server WHOLE + mcp-server + domain suites (`--maxWorkers=2`, logs to `/tmp/kgd-t2-*.log`).
  - `pnpm check:citations`, `pnpm check:migrations`, `pnpm check:tasks`.
  - Push; DONE + REVIEW, naming every run LOCAL.

### Task 3: The `concept` entity — kind, nine events, projections, the door, the census (cases 27.440–27.464)

**Spec:** §3.1, §3.3, §7 cases 1 and 3. Needs Task 1's `hiddenItems` (the door's D4 check), so **Task 1 merged first, or Task 3 stacked on Task 1's branch**. Otherwise it runs from day one.
- It shares `packages/domain/src/vocabulary.ts`, `apps/server/src/permissions/check-permission.ts`, `purge/check-purged.ts` and `projections/index.ts` with plan A.
- The hunks differ (new blocks at the ends of lists). Prove the merge with `git merge-tree` against plan A's tip before landing.

**Decisions this task makes** (the spec is silent; Self-review G6, G11):
- **One D4 rule for every write: the actor must SEE the concept** (every live item in it), plus every item or concept the event adds.
  - §3.3's two rows agree on that ("can see every item involved" / "can see the concept"). G6's double listing of "untag" collapses to it.
  - D2 is honoured because ANY member who sees the concept may untag or delete, not only its creator (27.451).
- **A hidden concept and an absent one get the SAME refusal**, `concept.unknown`: "That concept does not exist or you cannot see it." The same goes for an item: `concept.item-unknown`. A different rule for "exists but hidden" would tell a member that a concept they may not see exists. `permission.concept` is the guest refusal only.
- **Relations.**
  - `related` is symmetric and stored with `a < b`.
  - `broader` is directed: `a` is the event's concept, `b = otherId`, read as "b is broader than a".
  - No cycle detection (the spec names none).
- **Merge** moves the tags (skipping duplicates), drops the merged concept's links, and marks it `deleted` with `merged_into`.
- **Delete** keeps the item rows (history reads them). Every read filters `deleted = FALSE`.
- **`fromSuggestion`** is accepted as a ULID string here. Task 5 adds the door check that it names a real suggestion (`suggestion.unknown`), because `sem_suggestions` is Task 5's table.

**Files:**
- Create:
  - `packages/domain/src/events/concept-events.ts`
  - `packages/domain/test/concept-events.test.ts` (27.440–27.442)
  - `apps/server/migrations/<P2>_concepts.sql`
  - `apps/server/src/projections/proj-concepts.ts`. The name copies the sibling `proj-groups.ts`; spec §8 says `projections/concepts.ts`, and the sibling's naming wins.
  - `apps/server/src/permissions/check-concept.ts`
  - `apps/server/test/concepts/projection.test.ts` (27.443–27.446, 27.452, 27.455)
  - `apps/server/test/concepts/door.test.ts` (27.447–27.451, 27.453)
  - `apps/server/test/concepts/census.test.ts` (27.454, 27.457)
  - `packages/app-core/test/concept-history-copy.test.ts` (27.456)
- Modify:
  - `packages/domain/src/envelope.ts:35`: `'concept',` after `'group',`, with a comment.
  - `packages/domain/test/envelope.test.ts:309-320`: "lists exactly the ten kinds", with `'concept'` last.
  - `packages/domain/src/vocabulary.ts`: a concept block after the group block (`:484-512`; cite corrected from `:463-491`, the block moved when plan A's `ticket.link_*` types landed), and an import line beside `:6`.
  - `packages/domain/src/index.ts`: `export * from './events/concept-events.js';` beside `:32`.
  - `packages/domain/src/registry.ts:36-60`: `types(): string[]`, ONLY if the release tip has no listing method yet. Plan A's census (spec A §5.2 case 7) needs the same one; if plan A landed it first, use theirs. **On `origin/release/knowledge-graph` (2026-10-04) it has: `registrations(): readonly EventTypeRegistration[]` (`registry.ts:40-41`, factory `:62-64`). So add nothing; the tests below use `domainRegistry.registrations().map((r) => r.type)`.**
  - `apps/server/src/projections/index.ts`: import, and `registry.register(projConcepts)` after `:204` (cite corrected from `:198`: the last registration on the ref is `registry.register(referencesProjection)` at `:204`).
  - `apps/server/test/projection-order.test.ts:75-77` (the names list runs to `:163`, last entry `'proj_references'` at `:162`) and its `[name, tables]` mirror (`:230`, cite corrected from `:149`): `'proj_concepts'` last.
  - `apps/server/src/permissions/check-permission.ts:1947-1950`: call `checkConceptPermission` directly after `checkNotePermission`.
  - `apps/server/src/visibility/visible-events-for.ts:276-283`: `case 'concept':`.
  - `apps/server/src/purge/check-purged.ts:34-69`: concept arms.
  - `apps/server/src/purge/table-rules.ts`: three rows.
  - `apps/server/src/purge/erasure.ts:77-94`: one statement.
  - `packages/app-core/src/views/history-copy.ts:126-250` (the switch; cite corrected from `:125-239`): concept arms, and `HistoryCopyContext` (`:48-65`, corrected from `:40-64`) gains `conceptName?` and `itemLabel?`.

**Interfaces:**
- **Produces:**
  - In domain:
    - `CONCEPT_EVENT_TYPES` (the nine, in §3.1's order), `CONCEPT_ITEM_KINDS = ['ticket', 'note']`, `CONCEPT_RELATIONS = ['broader', 'related']`, `CONCEPT_SUMMARY_MAX = 2000`;
    - the nine `concept…Payload` zod schemas and their types;
    - `EntityKind` includes `'concept'`.
  - The tables:
    - `proj_concepts (concept_id, workspace_id, name, summary, created_by, created_at, origin, from_suggestion, merged_into, deleted)`;
    - `proj_concept_items (concept_id, workspace_id, item_kind, item_id, tagged_by, tagged_at, origin)`;
    - `proj_concept_links (workspace_id, a, b, relation, linked_by, linked_at, origin)`.
  - On the server:
    - `checkConceptPermission(env, ctx: VisibilityContext): Promise<Refusal | null>`;
    - `CONCEPT_RULES`, the rule-name object;
    - `liveConceptItems(db, workspaceId, conceptId): Promise<ItemRef[]>`, which Task 4 reuses.
  - In app-core (planner ruling 2026-10-04, Q2): `HistoryCopyContext` gains `conceptName?: (conceptId: string) => string` and `itemLabel?: (kind: 'ticket' | 'note', id: string) => string | undefined`; Task 9's `HistoryList` resolver is the caller. A redacted item (`itemId: ''`) reads "a ticket" / "a note", never the raw type.
- **Consumes:**
  - `hiddenItems`, `ItemRef` (Task 1);
  - `displayName` (`packages/domain/src/display-name.ts:49`);
  - `refuseWith`'s shape (`check-permission.ts:361`), `VisibilityContext` (`:908`);
  - `purged_entities (entity_kind, entity_id, workspace_id, purged_at)` (`migrations/1790600000000_purge-engine.sql:7-13`);
  - `verifyProjections({ pool, projections })` (`tools/verify-projections.ts:34`).

- [ ] **Step 1: Catalogue**

  Under `<!-- D T3 -->`, add 27.440–27.457 ❌. 27.458–27.464 are reserved.

  Commit.

- [ ] **Step 2: The domain (27.440–27.442), test first**

  `packages/domain/test/concept-events.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    CONCEPT_EVENT_TYPES, CONCEPT_PAYLOADS, ENTITY_KINDS, conceptCreatedPayload, conceptItemTaggedPayload, conceptLinkedPayload,
    conceptMergedPayload, conceptDeletedPayload, conceptDescribedPayload, domainRegistry,
  } from '../src/index.js';

  describe('27.440–27.442 the concept vocabulary', () => {
    it('27.440 concept is an entity kind, last; control: notebook still is not', () => {
      expect(ENTITY_KINDS.at(-1)).toBe('concept');
      // Ten, and `group` still directly before it: 'concept' REPLACING 'group' (or added twice) passes `.at(-1)` alone.
      expect(ENTITY_KINDS).toHaveLength(10);
      expect(ENTITY_KINDS.at(-2)).toBe('group');
      expect([...ENTITY_KINDS]).not.toContain('notebook'); // sanity only: no code in this task can add it (18.001 owns it)
    });

    it('27.441 each payload takes its shape and refuses an extra member, an unknown kind or relation; control: the valid shape parses', () => {
      expect(conceptCreatedPayload.safeParse({ name: 'Scroll position on phone sheets' }).success).toBe(true);
      expect(conceptCreatedPayload.safeParse({ name: 'X', summary: 's', fromSuggestion: '01J9ZQ8Y6N4V2K7M3H5T1R0W8C' }).success).toBe(true);
      expect(conceptCreatedPayload.safeParse({ name: '' }).success).toBe(false);
      expect(conceptCreatedPayload.safeParse({ name: 'X', extra: 1 }).success).toBe(false);
      expect(conceptItemTaggedPayload.safeParse({ itemKind: 'ticket', itemId: 'T' }).success).toBe(true);
      expect(conceptItemTaggedPayload.safeParse({ itemKind: 'comment', itemId: 'T' }).success).toBe(false);
      expect(conceptLinkedPayload.safeParse({ otherId: 'C', relation: 'broader' }).success).toBe(true);
      expect(conceptLinkedPayload.safeParse({ otherId: 'C', relation: 'narrower' }).success).toBe(false);
      expect(conceptMergedPayload.safeParse({ intoId: 'C' }).success).toBe(true);
      expect(conceptDeletedPayload.safeParse({}).success).toBe(true);
      expect(conceptDeletedPayload.safeParse({ why: 'x' }).success).toBe(false);
      expect(conceptDescribedPayload.safeParse({ summary: 'x'.repeat(2001) }).success).toBe(false);
      expect(conceptDescribedPayload.safeParse({ summary: 'x'.repeat(2000) }).success).toBe(true); // the bar itself: `max(1999)` reds here
      expect(conceptDescribedPayload.safeParse({ summary: '' }).success).toBe(true); // control: '' clears
      expect(conceptCreatedPayload.safeParse({ name: '   ' }).success).toBe(false); // displayName, not z.string().min(1)
    });

    it('27.442 the nine are registered at version 1 against concept, and nothing else is a concept.* type; control: each carries its own schema', () => {
      expect(CONCEPT_EVENT_TYPES).toHaveLength(9);
      for (const type of CONCEPT_EVENT_TYPES) {
        expect(domainRegistry.get(type, 1)?.entityKind, type).toBe('concept');
        // The control. `hasType('concept.bogus')` could not fail: nothing in this task registers a bogus type.
        // A loop that registered every type with ONE schema can: identity per type (planner ruling 2026-10-04, Q7: accepted).
        expect(domainRegistry.get(type, 1)?.payloadSchema, type).toBe(CONCEPT_PAYLOADS[type]);
      }
      // `registrations()` is the ref's listing (registry.ts:40-41); `types()` if plan A's tip renamed it.
      const conceptTypes = domainRegistry.registrations().map((r) => r.type).filter((type) => type.startsWith('concept.'));
      expect(conceptTypes.sort()).toEqual([...CONCEPT_EVENT_TYPES].sort());
    });
  });
  ```
  If the listing method on the tip is named differently (plan A), use that name.

  Kills:
  - 27.440: (a) leave `envelope.ts` without `'concept'` (b) put `'concept'` in place of `'group'` (length 9 reds) (c) insert it before `'group'` (`.at(-1)` reds).
  - 27.441: (a) drop `.strict()` from `conceptCreatedPayload` (b) `CONCEPT_SUMMARY_MAX = 2000` → `2001` (c) `z.enum(CONCEPT_ITEM_KINDS)` → `z.string()`.
  - 27.442: (a) register with `version: 2` (b) register every type with `payloadSchema: conceptCreatedPayload` (c) a tenth `'concept.restored'` added to the loop's list but not to `CONCEPT_EVENT_TYPES`.

  `packages/domain/src/events/concept-events.ts`:
  ```ts
  import { z } from 'zod';
  import { displayName } from '../display-name.js';

  /**
   * Knowledge Graph spec D §3.1: the semantic layer's data. A concept is a named group of tickets and notes,
   * curated by members and (through MCP) by an assistant acting for one. Its visibility is D4's, computed at
   * read time from its items — never stored here.
   */
  export const CONCEPT_EVENT_TYPES = [
    'concept.created', 'concept.renamed', 'concept.described', 'concept.item_tagged', 'concept.item_untagged',
    'concept.linked', 'concept.unlinked', 'concept.merged', 'concept.deleted',
  ] as const;
  export type ConceptEventType = (typeof CONCEPT_EVENT_TYPES)[number];

  export const CONCEPT_ITEM_KINDS = ['ticket', 'note'] as const;
  export type ConceptItemKind = (typeof CONCEPT_ITEM_KINDS)[number];
  /** `broader`: the OTHER concept is broader than this one. `related`: symmetric. */
  export const CONCEPT_RELATIONS = ['broader', 'related'] as const;
  export type ConceptRelation = (typeof CONCEPT_RELATIONS)[number];
  export const CONCEPT_SUMMARY_MAX = 2000;

  const entityId = z.string().min(1);
  const summary = z.string().max(CONCEPT_SUMMARY_MAX);

  export const conceptCreatedPayload = z
    .object({ name: displayName, summary: summary.optional(), fromSuggestion: entityId.optional() })
    .strict();
  export type ConceptCreatedPayload = z.infer<typeof conceptCreatedPayload>;
  export const conceptRenamedPayload = z.object({ name: displayName }).strict();
  export type ConceptRenamedPayload = z.infer<typeof conceptRenamedPayload>;
  /** `''` clears the summary. */
  export const conceptDescribedPayload = z.object({ summary }).strict();
  export type ConceptDescribedPayload = z.infer<typeof conceptDescribedPayload>;
  export const conceptItemTaggedPayload = z.object({ itemKind: z.enum(CONCEPT_ITEM_KINDS), itemId: entityId }).strict();
  export type ConceptItemTaggedPayload = z.infer<typeof conceptItemTaggedPayload>;
  export const conceptItemUntaggedPayload = conceptItemTaggedPayload;
  export type ConceptItemUntaggedPayload = ConceptItemTaggedPayload;
  export const conceptLinkedPayload = z.object({ otherId: entityId, relation: z.enum(CONCEPT_RELATIONS) }).strict();
  export type ConceptLinkedPayload = z.infer<typeof conceptLinkedPayload>;
  export const conceptUnlinkedPayload = conceptLinkedPayload;
  export type ConceptUnlinkedPayload = ConceptLinkedPayload;
  /** Its tags move to `intoId`; this concept is deleted (§3.1). */
  export const conceptMergedPayload = z.object({ intoId: entityId }).strict();
  export type ConceptMergedPayload = z.infer<typeof conceptMergedPayload>;
  export const conceptDeletedPayload = z.object({}).strict();
  export type ConceptDeletedPayload = z.infer<typeof conceptDeletedPayload>;

  /** The schema per type, so the vocabulary, the projection and the door read one table. */
  export const CONCEPT_PAYLOADS: Record<ConceptEventType, z.ZodTypeAny> = {
    'concept.created': conceptCreatedPayload,
    'concept.renamed': conceptRenamedPayload,
    'concept.described': conceptDescribedPayload,
    'concept.item_tagged': conceptItemTaggedPayload,
    'concept.item_untagged': conceptItemUntaggedPayload,
    'concept.linked': conceptLinkedPayload,
    'concept.unlinked': conceptUnlinkedPayload,
    'concept.merged': conceptMergedPayload,
    'concept.deleted': conceptDeletedPayload,
  };
  ```

  `packages/domain/src/vocabulary.ts`. After the group block (`:512`; corrected from `:491`):
  ```ts
  /**
   * The concept vocabulary (Knowledge Graph spec D §3.1). Nine types against a `concept` entity. Who may write is
   * the door's `checkConceptPermission` (D4: the actor must see the concept and everything the event adds).
   */
  for (const type of CONCEPT_EVENT_TYPES) {
    domainRegistry.register({ type, version: 1, entityKind: 'concept', payloadSchema: CONCEPT_PAYLOADS[type] });
  }
  ```
  - Import `CONCEPT_EVENT_TYPES` and `CONCEPT_PAYLOADS` from `./events/concept-events.js`.
  - `envelope.ts:35`: append `'concept',` with the comment `// Knowledge Graph spec D §3.1: nine concept.* types in vocabulary.ts. Visibility is D4's, at read time.`
  - `envelope.test.ts:309-320`: retitle the case "lists exactly the ten kinds" and add `'concept'`.
  - `registry.ts`: if needed, add `types(): string[]` to `EventTypeRegistry` and `types: () => [...types].sort()` to the factory. (Not needed on the ref: `registrations()` exists.)

  Run `pnpm --filter @gisik-nokma/domain build` and then its suite (`--maxWorkers=2`, log to `/tmp/kgd-t3-domain.log`). Expected: PASS.

  Then typecheck the WORKSPACE: `pnpm -r typecheck > /tmp/kgd-t3-tc.log 2>&1; tail -20 /tmp/kgd-t3-tc.log`. Expected: exactly ONE error, TS2366 at `visible-events-for.ts:246` (`audienceClassOf`). That is the compile-time census, and Step 4 answers it. Any other error is a switch or `Record<EntityKind, …>` this plan did not find. A planning grep for `case 'group':` and `Record<EntityKind` found only that one. Answer each in this task.

  Commit.

- [ ] **Step 3: The tables and the projection (27.443–27.446, 27.452, 27.455)**

  `apps/server/migrations/<P2>_concepts.sql`:
  ```sql
  -- Up Migration

  -- Knowledge Graph spec D §3.1: the concept projections. workspace_id is on every table (the spec's
  -- proj_concept_items list omits it): purge's workspaceScopedTables() deletes by it, and every read filters by it.

  CREATE TABLE proj_concepts (
    concept_id      text PRIMARY KEY,
    workspace_id    text NOT NULL,
    name            text NOT NULL,
    summary         text NOT NULL DEFAULT '',
    created_by      text NOT NULL,
    created_at      timestamptz NOT NULL,
    origin          text NOT NULL,
    from_suggestion text,
    merged_into     text,
    deleted         boolean NOT NULL DEFAULT FALSE
  );
  CREATE INDEX proj_concepts_ws_idx ON proj_concepts (workspace_id) WHERE deleted = FALSE;

  CREATE TABLE proj_concept_items (
    concept_id   text NOT NULL,
    workspace_id text NOT NULL,
    item_kind    text NOT NULL CHECK (item_kind IN ('ticket', 'note')),
    item_id      text NOT NULL,
    tagged_by    text NOT NULL,
    tagged_at    timestamptz NOT NULL,
    origin       text NOT NULL,
    PRIMARY KEY (concept_id, item_kind, item_id)
  );
  CREATE INDEX proj_concept_items_item_idx ON proj_concept_items (item_kind, item_id);

  CREATE TABLE proj_concept_links (
    workspace_id text NOT NULL,
    a            text NOT NULL,
    b            text NOT NULL,
    relation     text NOT NULL CHECK (relation IN ('broader', 'related')),
    linked_by    text NOT NULL,
    linked_at    timestamptz NOT NULL,
    origin       text NOT NULL,
    PRIMARY KEY (a, b, relation),
    CHECK (relation <> 'related' OR a < b)
  );
  CREATE INDEX proj_concept_links_b_idx ON proj_concept_links (b);

  -- Down Migration

  DROP TABLE proj_concept_links;
  DROP TABLE proj_concept_items;
  DROP TABLE proj_concepts;
  ```

  `apps/server/src/projections/proj-concepts.ts`. The sibling is `proj-groups.ts`: the same `apply` switch and `reset`.
  ```ts
  import {
    conceptCreatedPayload, conceptDeletedPayload, conceptDescribedPayload, conceptItemTaggedPayload,
    conceptItemUntaggedPayload, conceptLinkedPayload, conceptMergedPayload, conceptRenamedPayload, conceptUnlinkedPayload,
  } from '@gisik-nokma/domain';
  import type { Projection } from './registry.js';

  /** `related` is symmetric and stored once, a < b (the table's CHECK); `broader` is stored as written. */
  function linkKey(self: string, other: string, relation: 'broader' | 'related'): [string, string] {
    return relation === 'related' && other < self ? [other, self] : [self, other];
  }

  /**
   * Knowledge Graph spec D §3.1. A tag naming a PURGED item is skipped (the `purged_entities` read, as
   * `notes.ts:233-235` reads it), so a rebuild after a purge equals the live table, which the purge erased.
   */
  export const projConcepts: Projection = {
    name: 'proj_concepts',
    tables: ['proj_concepts', 'proj_concept_items', 'proj_concept_links'],

    async apply(event, tx) {
      const concept = event.entity.id;
      switch (event.type) {
        case 'concept.created': {
          const p = conceptCreatedPayload.parse(event.payload);
          await tx.query(
            `INSERT INTO proj_concepts (concept_id, workspace_id, name, summary, created_by, created_at, origin, from_suggestion)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (concept_id) DO NOTHING`,
            [concept, event.workspaceId, p.name, p.summary ?? '', event.actorId, event.serverTime, event.origin, p.fromSuggestion ?? null],
          );
          return;
        }
        case 'concept.renamed': {
          const p = conceptRenamedPayload.parse(event.payload);
          await tx.query('UPDATE proj_concepts SET name = $2 WHERE concept_id = $1', [concept, p.name]);
          return;
        }
        case 'concept.described': {
          const p = conceptDescribedPayload.parse(event.payload);
          await tx.query('UPDATE proj_concepts SET summary = $2 WHERE concept_id = $1', [concept, p.summary]);
          return;
        }
        case 'concept.item_tagged': {
          const p = conceptItemTaggedPayload.parse(event.payload);
          await tx.query(
            `INSERT INTO proj_concept_items (concept_id, workspace_id, item_kind, item_id, tagged_by, tagged_at, origin)
             SELECT $1, $2, $3, $4, $5, $6, $7
              WHERE NOT EXISTS (SELECT 1 FROM purged_entities WHERE entity_kind = $3 AND entity_id = $4)
             ON CONFLICT DO NOTHING`,
            [concept, event.workspaceId, p.itemKind, p.itemId, event.actorId, event.serverTime, event.origin],
          );
          return;
        }
        case 'concept.item_untagged': {
          const p = conceptItemUntaggedPayload.parse(event.payload);
          await tx.query('DELETE FROM proj_concept_items WHERE concept_id = $1 AND item_kind = $2 AND item_id = $3', [concept, p.itemKind, p.itemId]);
          return;
        }
        case 'concept.linked': {
          const p = conceptLinkedPayload.parse(event.payload);
          const [a, b] = linkKey(concept, p.otherId, p.relation);
          await tx.query(
            `INSERT INTO proj_concept_links (workspace_id, a, b, relation, linked_by, linked_at, origin)
             VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
            [event.workspaceId, a, b, p.relation, event.actorId, event.serverTime, event.origin],
          );
          return;
        }
        case 'concept.unlinked': {
          const p = conceptUnlinkedPayload.parse(event.payload);
          const [a, b] = linkKey(concept, p.otherId, p.relation);
          await tx.query('DELETE FROM proj_concept_links WHERE a = $1 AND b = $2 AND relation = $3', [a, b, p.relation]);
          return;
        }
        case 'concept.merged': {
          const p = conceptMergedPayload.parse(event.payload);
          await tx.query(
            `INSERT INTO proj_concept_items (concept_id, workspace_id, item_kind, item_id, tagged_by, tagged_at, origin)
             SELECT $2, workspace_id, item_kind, item_id, tagged_by, tagged_at, origin FROM proj_concept_items WHERE concept_id = $1
             ON CONFLICT DO NOTHING`,
            [concept, p.intoId],
          );
          await tx.query('DELETE FROM proj_concept_items WHERE concept_id = $1', [concept]);
          await tx.query('DELETE FROM proj_concept_links WHERE a = $1 OR b = $1', [concept]);
          await tx.query('UPDATE proj_concepts SET deleted = TRUE, merged_into = $2 WHERE concept_id = $1', [concept, p.intoId]);
          return;
        }
        case 'concept.deleted': {
          conceptDeletedPayload.parse(event.payload);
          await tx.query('DELETE FROM proj_concept_links WHERE a = $1 OR b = $1', [concept]);
          await tx.query('UPDATE proj_concepts SET deleted = TRUE WHERE concept_id = $1', [concept]);
          return;
        }
        default:
          return;
      }
    },

    async reset(tx) {
      await tx.query('DELETE FROM proj_concept_links');
      await tx.query('DELETE FROM proj_concept_items');
      await tx.query('DELETE FROM proj_concepts');
    },
  };
  ```
  - Re-read `LedgerEvent` for `origin` and `serverTime` (`proj-groups.ts` uses `event.serverTime` and `event.actorId`; `origin` is on every envelope, `envelope.ts:39-…`).
  - `projections/index.ts`: append `registry.register(projConcepts);` after `:204` (corrected from `:198`), with a comment in that file's style: the downward and upward dependency reads. It reads `purged_entities` only, which is never reset.
  - `projection-order.test.ts:75-77`: append `'proj_concepts'` after `'proj_references'` (`:162`), extend the title, and mirror it after `:230` (corrected from `:149`).

  Purge:
  - `table-rules.ts`:
    ```ts
    proj_concepts: { rule: 'erase', by: ['workspace_id'], why: 'A workspace’s concepts; erased with it. A concept is never purged on its own (spec D has no concept trash).' },
    proj_concept_items: {
      rule: 'erase',
      by: ['workspace_id'],
      why: 'Rows naming an erased ticket or note are deleted by eraseRows on (item_kind, item_id); the projection skips a purged item on replay (KG-D Task 3).',
    },
    proj_concept_links: { rule: 'erase', by: ['workspace_id'], why: 'Concept-to-concept only; erased with the workspace.' },
    ```
  - `erasure.ts`, after `:90`: `["DELETE FROM proj_concept_items WHERE (item_kind = 'ticket' AND item_id = ANY($1::text[])) OR (item_kind = 'note' AND item_id = ANY($2::text[]))", [T, N]],`.

  `apps/server/test/concepts/projection.test.ts`:
  - Setup: `createTestDatabase` + `seedNotesFixture`.
  - Concept events are applied with `applyCommitted` / `makeCommitted` (`test/helpers/apply.ts`), `entity: { kind: 'concept', id: C }`.
  - Concept ids that a case ORDERS are minted as a sorted pair, `const [lo, hi] = [newUlid(), newUlid()].sort()`, and the case asserts `lo < hi` first. Two `newUlid()` calls in the same millisecond are not guaranteed to be ascending, and a "C2 < C1" case whose ids came out the other way round tests the no-swap path twice.
  - The cases:
    - **27.443** `created {name: 'Scroll', summary: 'first'}` → `renamed 'Scroll jumps'` → `described ''` → `deleted`, with the row at each step: after rename, `name = 'Scroll jumps'` AND `summary = 'first'` (still); after `described ''`, `summary = ''` (from `'first'`: a summary that started `''` cannot show a no-op `described` arm); after delete, the row still EXISTS with `deleted = TRUE`. Control: a second `concept.created` with the same id and `name: 'Other'` changes nothing: `name` is still `'Scroll jumps'` and `created_by` is the first event's actor.

      Kills: (a) the `described` arm `UPDATE … SET summary = $2` → `SET name = $2` (b) the `deleted` arm `UPDATE … SET deleted = TRUE` → `DELETE FROM proj_concepts WHERE concept_id = $1` (c) `ON CONFLICT (concept_id) DO NOTHING` → `DO UPDATE SET name = EXCLUDED.name`.
    - **27.444** Tag TP (as `memberIn`, `origin: 'mcp'`) and nProject (as `author`, `origin: 'web'`), untag nProject, and only TP's row remains, with `tagged_by = memberIn` and `origin = 'mcp'` (an `origin: 'mcp'` event stores `'mcp'`; the two tags differ in both fields so neither can be a constant). Control: a `ticket.deleted` on TP keeps its row.

      Kills: (a) the untag `DELETE` loses `AND item_kind = $2 AND item_id = $3` (TP's row goes too) (b) store `'web'` instead of `event.origin` (c) add a `case 'ticket.deleted':` arm to `projConcepts.apply` that deletes the item's rows (the control reds).
    - **27.445** With `[C2, C1] = sorted pair` (so `C2 < C1`, asserted):
      - `concept.linked {otherId: C2, relation: 'related'}` on C1 stores `(a = C2, b = C1)`.
      - `broader` from C1 to C2 stores `(C1, C2)` as written, although `C2 < C1`.
      - `unlinked` from either side of a `related` link removes it: link from C2 and unlink from C1, then link from C1 and unlink from C2. The FIRST order is the one that needs `linkKey` in the `unlinked` arm (from C1 the raw key `(C1, C2)` is not the stored `(C2, C1)`).

      Control: `concept.unlinked {otherId: C1, relation: 'broader'}` on C2 does not remove C1's `broader (C1, C2)` row.

      Kills: (a) `linkKey` → `return [self, other]` (the `related` insert breaks the table's CHECK and throws) (b) `linkKey` swaps for `broader` too (drop `relation === 'related' &&`) (c) the `unlinked` arm uses `[concept, p.otherId]` instead of `linkKey(…)` (d) the `unlinked` DELETE matches both orders (`(a = $1 AND b = $2) OR (a = $2 AND b = $1)`; the control reds).
    - **27.446** Merge C1 into C2, where both tag TP and C1 also tags TE, and C1 has a `related` link to a third concept C3 (applied before the merge, so "no links" has something to remove):
      - C2 has TP once and TE;
      - C1 is `deleted` with `merged_into = C2` and has no items and no `proj_concept_links` row naming it (C3's link is gone; C3 itself is untouched).

      Kills: (a) drop the merge INSERT's `ON CONFLICT DO NOTHING` (the shared TP throws on the primary key) (b) drop `DELETE FROM proj_concept_links WHERE a = $1 OR b = $1` from the merged arm (c) drop the merged arm's `DELETE FROM proj_concept_items WHERE concept_id = $1`.
    - **27.452**
      - Tag TP into C. A `ticket.deleted` keeps the row; `ticket.restored` keeps it.
      - Purge TP (copy the nearest ticket-purge test's driver from `test/purge/`, and cite it). The row is gone.
      - `verifyProjections({ pool, projections: buildProjectionRegistry() })` reports no difference: the rebuild skipped the purged item. Assert first that the concept stream still holds the `concept.item_tagged` naming TP after the purge (`SELECT … FROM events WHERE entity_kind = 'concept'`): the guard is only exercised if replay meets that event.

      Control: a row tagging nProject INTO THE SAME concept C survives the purge (a statement that erased whole concepts, or every row of a concept that names a purged item, would take it too).

      Kills: (a) drop the `purged_entities` guard in the `item_tagged` arm (verify reds) (b) drop the `erasure.ts` statement (the row survives the purge) (c) the erasure statement → `DELETE FROM proj_concept_items WHERE concept_id IN (SELECT concept_id FROM proj_concept_items WHERE item_id = ANY($1::text[]))` (the control reds).
    - **27.455** All three tables hold ≥ 1 row (asserted first), then `reset` empties all three.

      Kills: drop any one of the three `DELETE`s in `reset` (one mutant per table; each reds its own count).

  Run the file (`--maxWorkers=2`, logged). Expected: PASS after Step 4's door exists, if the purge driver goes through ingest. Otherwise PASS now.

  Mutation: drop the `purged_entities` guard → 27.452's verify line reds.

  Commit.

- [ ] **Step 4: The door, the audience class, purge refusals (27.447–27.451, 27.453–27.454)**

  `apps/server/src/permissions/check-concept.ts`:
  ```ts
  import {
    CONCEPT_PAYLOADS, type ConceptEventType, type EventEnvelope, conceptItemTaggedPayload, conceptLinkedPayload, conceptMergedPayload,
  } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { hiddenItems, type ItemRef } from '../read/item-visibility.js';
  import { LIVE_TICKET_WHERE } from '../read/visible-where.js';
  import type { Refusal } from '@gisik-nokma/rule-engine'; // as check-permission.ts:19 and check-purged.ts:2
  import type { VisibilityContext } from './check-permission.js'; // type-only: erased, so no runtime cycle

  export const CONCEPT_RULES = {
    permission: 'permission.concept',
    unknown: 'concept.unknown',
    itemUnknown: 'concept.item-unknown',
    alreadyTagged: 'concept.already-tagged',
    notTagged: 'concept.not-tagged',
    linkExists: 'concept.link-exists',
    linkUnknown: 'concept.link-unknown',
    self: 'concept.self',
  } as const;
  export const CONCEPT_GUEST_REASON = 'Guests can read concepts but cannot change them.';
  export const CONCEPT_UNKNOWN_REASON = 'That concept does not exist or you cannot see it.';
  export const CONCEPT_ITEM_UNKNOWN_REASON = 'That ticket or note does not exist or you cannot see it.';

  const refuse = (rule: string, reason: string): Refusal => ({ refused: true, rule, reason });

  /** The concept's tagged items that are LIVE (D4 counts live items only; `hiddenItems` ignores the rest anyway). */
  export async function liveConceptItems(db: Queryable, workspaceId: string, conceptId: string): Promise<ItemRef[]> {
    const { rows } = await db.query<{ item_kind: 'ticket' | 'note'; item_id: string }>(
      'SELECT item_kind, item_id FROM proj_concept_items WHERE workspace_id = $1 AND concept_id = $2',
      [workspaceId, conceptId],
    );
    return rows.map((row) => ({ kind: row.item_kind, id: row.item_id }));
  }

  /** A live concept this actor can see (every live item), or false. ONE answer for absent, deleted and hidden. */
  async function seesConcept(db: Queryable, ctx: VisibilityContext, workspaceId: string, conceptId: string): Promise<boolean> {
    const { rows } = await db.query('SELECT 1 FROM proj_concepts WHERE workspace_id = $1 AND concept_id = $2 AND deleted = FALSE', [workspaceId, conceptId]);
    if (rows.length === 0) return false;
    const items = await liveConceptItems(db, workspaceId, conceptId);
    return (await hiddenItems(db, ctx.eff, ctx.sessionUserId, workspaceId, items)).length === 0;
  }

  async function seesItem(db: Queryable, ctx: VisibilityContext, workspaceId: string, item: ItemRef): Promise<boolean> {
    // LIVE means what hiddenItems means by it, or an item in a deleted project would pass as "seen" (hiddenItems ignores it).
    const sql =
      item.kind === 'ticket'
        ? `SELECT 1 FROM proj_tickets t WHERE t.workspace_id = $1 AND t.ticket_id = $2 AND ${LIVE_TICKET_WHERE}`
        : 'SELECT 1 FROM proj_notes n WHERE n.workspace_id = $1 AND n.note_id = $2 AND n.deleted = FALSE';
    const { rows } = await db.query(sql, [workspaceId, item.id]);
    if (rows.length === 0) return false;
    return (await hiddenItems(db, ctx.eff, ctx.sessionUserId, workspaceId, [item])).length === 0;
  }

  /**
   * Knowledge Graph spec D §3.3, one pass for the whole `concept` kind, placed after `checkNotePermission`
   * for the reason that one gives (`check-permission.ts:1937-1946`): `checkVisibilityPermission` returns early on a
   * non-ticket kind, so nothing else would ask.
   * - guests: read only;
   * - every write: the actor sees the concept (D4), plus every item or concept the event adds;
   * - the state rules (already tagged, self-link, …) after the audience questions, so a refusal never describes a
   *   concept the actor may not see.
   */
  export async function checkConceptPermission(env: EventEnvelope, ctx: VisibilityContext): Promise<Refusal | null> {
    if (env.entity.kind !== 'concept') return null;
    if (ctx.eff.workspaceRole === 'guest') return refuse(CONCEPT_RULES.permission, CONCEPT_GUEST_REASON);
    const type = env.type as ConceptEventType;
    if (CONCEPT_PAYLOADS[type] === undefined) return null; // an unregistered type never reaches here (schema first)
    const ws = env.workspaceId;
    const self = env.entity.id;
    if (type === 'concept.created') return null;
    if (!(await seesConcept(ctx.db, ctx, ws, self))) return refuse(CONCEPT_RULES.unknown, CONCEPT_UNKNOWN_REASON);

    if (type === 'concept.item_tagged' || type === 'concept.item_untagged') {
      const p = conceptItemTaggedPayload.parse(env.payload);
      const item = { kind: p.itemKind, id: p.itemId };
      const tagged = (await ctx.db.query('SELECT 1 FROM proj_concept_items WHERE concept_id = $1 AND item_kind = $2 AND item_id = $3', [self, p.itemKind, p.itemId])).rows.length > 0;
      if (type === 'concept.item_tagged') {
        if (!(await seesItem(ctx.db, ctx, ws, item))) return refuse(CONCEPT_RULES.itemUnknown, CONCEPT_ITEM_UNKNOWN_REASON);
        if (tagged) return refuse(CONCEPT_RULES.alreadyTagged, 'That item is already in this concept.');
        return null;
      }
      return tagged ? null : refuse(CONCEPT_RULES.notTagged, 'That item is not in this concept.');
    }

    if (type === 'concept.linked' || type === 'concept.unlinked') {
      const p = conceptLinkedPayload.parse(env.payload);
      if (p.otherId === self) return refuse(CONCEPT_RULES.self, 'A concept cannot be linked to itself.');
      if (!(await seesConcept(ctx.db, ctx, ws, p.otherId))) return refuse(CONCEPT_RULES.unknown, CONCEPT_UNKNOWN_REASON);
      const [a, b] = p.relation === 'related' && p.otherId < self ? [p.otherId, self] : [self, p.otherId];
      const exists = (await ctx.db.query('SELECT 1 FROM proj_concept_links WHERE a = $1 AND b = $2 AND relation = $3', [a, b, p.relation])).rows.length > 0;
      if (type === 'concept.linked' && exists) return refuse(CONCEPT_RULES.linkExists, 'These concepts are already linked that way.');
      if (type === 'concept.unlinked' && !exists) return refuse(CONCEPT_RULES.linkUnknown, 'These concepts are not linked that way.');
      return null;
    }

    if (type === 'concept.merged') {
      const p = conceptMergedPayload.parse(env.payload);
      if (p.intoId === self) return refuse(CONCEPT_RULES.self, 'A concept cannot be merged into itself.');
      if (!(await seesConcept(ctx.db, ctx, ws, p.intoId))) return refuse(CONCEPT_RULES.unknown, CONCEPT_UNKNOWN_REASON);
      return null;
    }
    return null; // renamed, described, deleted: seeing the concept is the whole rule (D2: any member who sees it)
  }
  ```
  - `Refusal` is `@gisik-nokma/rule-engine`'s `{ refused: true; rule; reason }` (`packages/rule-engine/src/engine.ts:9`).
  - `VisibilityContext` is `PermissionContext & { db }` (`check-permission.ts:908-910`), whose `eff: EffectiveRole` is not nullable (`:305`). A non-member never reaches this pass: the role gate refuses them first (`:667-670`).

  `check-permission.ts`, after `:1950`:
  ```ts
  // Knowledge Graph spec D §3.3: the concept kind's own pass, here for the note pass's reason (above).
  const conceptRefusal = await checkConceptPermission(env, permissionContext);
  if (conceptRefusal !== null) {
    return conceptRefusal;
  }
  ```

  `visible-events-for.ts:276-283`. Add before `case 'note':`:
  ```ts
  case 'concept':
    // Knowledge Graph spec D §3.2: a concept's audience is D4's, computed at READ time from its items, and an
    // event like concept.item_tagged names an item id. No replica folds concepts; the app reads them online
    // through D4-checked routes. Fail-closed, the group arm's reasoning.
    return 'withheld';
  ```

  `check-purged.ts:34-69`. Add before `default:`:
  ```ts
  case 'concept.item_tagged':
  case 'concept.item_untagged':
    if (payload['itemKind'] === 'ticket' || payload['itemKind'] === 'note') add(payload['itemKind'], payload['itemId']);
    break;
  case 'concept.linked':
  case 'concept.unlinked':
    add('concept', payload['otherId']);
    break;
  case 'concept.merged':
    add('concept', payload['intoId']);
    break;
  ```

  `apps/server/test/concepts/door.test.ts`:
  - Copy `check-note-permission.test.ts:1-56`'s setup and its `permits` helper, with `entity: { kind: 'concept', id }`.
  - Before the cases, seed with `applyCommitted`:
    - concept CP tagging TP (project P);
    - concept CW tagging nWorkspace;
    - concept CE tagging TE (explicit [guestListed]).
  - Mint CP and CW as a sorted pair (`[CP, CW] = [newUlid(), newUlid()].sort()`, asserted `CP < CW`). 27.450's "other side" leg needs the second link attempt to come from the HIGHER id (see its Kills).
  - The cases:
    - **27.447** For EVERY type in `CONCEPT_EVENT_TYPES` (iterate the constant, with a valid payload per type from a table in the test, every one addressed to CE, which `guestListed` CAN see: TE is explicit `[guestListed]`, `notes-fixture.ts:202`), `guestListed` is refused with `permission.concept`. Assert `table` has exactly the keys of `CONCEPT_EVENT_TYPES` first. Same `it`, the control: `memberIn` is admitted for `concept.created`.

      Kills: (a) drop the `ctx.eff.workspaceRole === 'guest'` line (on CE the guest then passes `seesConcept` and is ADMITTED for `renamed`; on a concept the guest cannot see, `concept.unknown` would still red, but less sharply) (b) move the guest line below `if (type === 'concept.created') return null;` (c) return the guest refusal under `CONCEPT_RULES.unknown`.
    - **27.448** `memberOut` (who sees CW: nWorkspace is workspace-scoped) tags TE into CW → `concept.item-unknown`. Control: the owner (who reads every ticket, `visible-where.ts:138`) tags TE into CW → admitted. (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan's item was TP, and its control `memberIn`; on the ref `memberOut` reads TP, so the refusal leg was red on correct code. TE is explicit `[guestListed]`, hidden from every member.)

      Kills: (a) drop the `seesItem` check in the `item_tagged` arm (b) `seesItem` returns `rows.length > 0` without asking `hiddenItems` (c) `seesItem`'s ticket arm loses `AND ${LIVE_TICKET_WHERE}` — not killed here (TP is live); 27.457's census does not cover it either, so it is recorded as a survivor for the lane to pin with a trashed-ticket tag if it chooses.
    - **27.449** Hidden, absent and deleted concepts:
      - `memberOut` renames CE (TE hidden from them) → `concept.unknown`, with the SAME reason as renaming a never-created id and as renaming a deleted concept. (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan's concept was CP; `memberOut` reads TP on the ref.)
      - `memberIn` (sees TP) renames CP → admitted; the owner (sees TE) renames CE → admitted, so CE itself is renamable and the refusal is about the reader.
      - The admin renames CE → `concept.unknown`. The admin is not in TE's explicit list, the `false` cell `notes-fixture.ts:28-35` keeps.

      Kills: (a) `seesConcept` ignores `hiddenItems` (returns `true` once the row exists) (b) drop `AND deleted = FALSE` from `seesConcept`'s query (the deleted-concept leg is admitted) (c) give the deleted case its own reason string.
    - **27.450** The state rules, each with its control in the same `it`:
      - tagging TP into CP again → `concept.already-tagged`, while TP into CW is admitted;
      - untagging nProject from CP → `concept.not-tagged`, while untagging TP is admitted;
      - linking CP to CP → `concept.self`, while CP to CW is admitted;
      - with `related` CP↔CW applied (from CP), linking from CW, the HIGHER id (the other side) → `concept.link-exists`, while `broader` CW→CP is admitted;
      - unlinking `broader` CP→CW when only `related` exists → `concept.link-unknown`.

      Kills: (a) drop `if (tagged) return refuse(CONCEPT_RULES.alreadyTagged, …)` (b) `return tagged ? null : refuse(…notTagged…)` → `return null` (c) the door's `[a, b]` without the `related` swap (`[self, p.otherId]`): from CW the raw key `(CW, CP)` is not the stored `(CP, CW)`, so it is admitted — the reason the attempt must come from the higher id (d) the `exists` query drops `AND relation = $3` (the `link-unknown` leg finds the `related` row).
    - **27.451** `author` (not CP's creator; CP was created by the owner) untags TP from CP and deletes CW → both admitted (D2: removable by a member). Assert first that `proj_concepts.created_by` for CP is the owner. Control: `memberOut` deleting CE → `concept.unknown` (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan said CP, which `memberOut` sees on the ref).

      Kills: (a) add a creator check to the `deleted` / `item_untagged` path (`SELECT created_by …` ≠ `ctx.sessionUserId` → refuse) (b) make `concept.deleted` admin-only (`ctx.eff.workspaceRole` not owner/admin → refuse).
    - **27.453** After TP is purged (or with a hand-inserted `purged_entities` row for TP, if the driver is heavy; say which), `checkPurged` refuses `concept.item_tagged {ticket, TP}` with `PURGE_RULE`. Control: `{note, nProject}` is admitted.

      Kills: (a) drop the `concept.item_tagged` / `item_untagged` arms from `payloadIds` (b) `add(payload['itemKind'], …)` → `add('note', …)` (the ticket leg is admitted).
  - `apps/server/test/concepts/census.test.ts`, **27.454**:
    - First, the RAW stream (`SELECT … FROM events WHERE workspace_id = WS AND entity_kind = 'concept'`) holds the seeded concept events (≥ 3: CP, CW, CE created and tagged). A "yields none" over a stream that has none cannot fail.
    - For each of `memberIn`, `owner` and `guestListed`, `visibleEventsFor` over the workspace stream after the seeding above yields NO event with `entity.kind === 'concept'`.
    - Re-read `visible-events-for.ts:442`'s signature and copy the nearest caller in `test/visibility/`, citing it.
    - Control: a `ticket.*` event on TP in the same stream is yielded to `memberIn`.

    Kills: (a) `case 'concept': return 'withheld'` → `return 'workspace'` (b) → `return 'roster'`.

  Run the two files and `test/permissions/` WHOLE (the door changed), `--maxWorkers=2`, logged. Expected: PASS.

  Mutations:

  | Mutation | Expected |
  |---|---|
  | `seesConcept` ignores `hiddenItems` | 27.449 reds |
  | the `item_untagged` arm requires `seesItem` | 27.451 is unaffected (seen); record it, then revert |
  | drop the `check-purged` arms | 27.453 reds |

  Commit.

- [ ] **Step 5: History sentences and the census (27.456–27.457)**

  `packages/app-core/src/views/history-copy.ts`.
  - `HistoryCopyContext` (`:48-65`; corrected from `:40-64`) gains:
    ```ts
    /** Knowledge Graph spec D: a concept's name for `concept.linked`/`merged` sentences; the id when unknown. */
    conceptName?: (conceptId: string) => string;
    /** A tagged item's label (a ticket key + title, a note title); `undefined` when unknown or hidden, so the sentence reads "a ticket" / "a note". */
    itemLabel?: (kind: 'ticket' | 'note', id: string) => string | undefined;
    ```
    (planner ruling 2026-10-04, Q2: the return type is `string | undefined`, so Task 9's resolver can answer `undefined` for an unknown or redacted id and the `??` below falls through to "a ticket" / "a note".)
  - Before `default:` (`:248`; corrected from `:237`):
    ```ts
    case 'concept.created': {
      const name = str(payload, 'name');
      if (name === null) return event.type;
      return str(payload, 'fromSuggestion') === null ? `Created the concept ${name}` : `Created the concept ${name} from a suggestion`;
    }
    case 'concept.renamed': {
      const name = str(payload, 'name');
      return name === null ? event.type : `Renamed the concept to ${name}`;
    }
    case 'concept.described':
      return str(payload, 'summary') === null ? 'Cleared the summary' : 'Changed the summary';
    case 'concept.item_tagged':
    case 'concept.item_untagged': {
      const kind = str(payload, 'itemKind');
      const id = str(payload, 'itemId');
      if (kind !== 'ticket' && kind !== 'note') return event.type;
      // A redacted item (`itemId: ''`, Task 4's history redaction; `str` reads '' as null) reads "a ticket" / "a note".
      const label = (id === null ? undefined : ctx.itemLabel?.(kind, id)) ?? (kind === 'ticket' ? 'a ticket' : 'a note');
      return event.type === 'concept.item_tagged' ? `Added ${label}` : `Removed ${label} from the concept`;
    }
    case 'concept.linked':
    case 'concept.unlinked': {
      const other = str(payload, 'otherId');
      const relation = str(payload, 'relation');
      if (other === null || (relation !== 'broader' && relation !== 'related')) return event.type;
      const name = ctx.conceptName?.(other) ?? other;
      if (event.type === 'concept.unlinked') return `Removed the link to ${name}`;
      return relation === 'broader' ? `Set ${name} as a broader concept` : `Linked the related concept ${name}`;
    }
    case 'concept.merged': {
      const into = str(payload, 'intoId');
      return into === null ? event.type : `Merged into ${ctx.conceptName?.(into) ?? into}`;
    }
    case 'concept.deleted':
      return 'Deleted the concept';
    ```
    (planner ruling 2026-10-04, Q2: Task 4's decision wins. The arm no longer returns `event.type` on `id === null`; it falls through to "a ticket" / "a note". The plan's line was `if ((kind !== 'ticket' && kind !== 'note') || id === null) return event.type;`.)

  `packages/app-core/test/concept-history-copy.test.ts`. **27.456**: for EVERY type in `CONCEPT_EVENT_TYPES`, with a valid payload from a per-type table, `describeEvent` returns the EXACT sentence in that table (assert the table's keys equal `CONCEPT_EVENT_TYPES` first). "Not `event.type`" alone passes for a sentence with the wrong verb or the two link relations swapped. The table, with `ctx = { conceptName: () => 'Phones' }` unless a row says otherwise:
  - `created {name: 'Scroll'}` → `Created the concept Scroll`; `created {name: 'Scroll', fromSuggestion: <ULID>}` → `Created the concept Scroll from a suggestion`;
  - `renamed {name: 'Scroll jumps'}` → `Renamed the concept to Scroll jumps`;
  - `described {summary: 'x'}` → `Changed the summary`; `described {summary: ''}` → `Cleared the summary` (`str` reads `''` as absent, `history-copy.ts:68-71`);
  - `item_tagged {ticket, T}` with `itemLabel: () => 'GN-12 Scroll jumps'` → `Added GN-12 Scroll jumps`; without `itemLabel` → `Added a ticket`; `{note, N}` without → `Added a note`;
  - `item_untagged {ticket, T}` without `itemLabel` → `Removed a ticket from the concept`;
  - (planner ruling 2026-10-04, Q2) redacted: `item_tagged {ticket, itemId: ''}` WITH `itemLabel: () => 'GN-12 Scroll jumps'` → `Added a ticket`, and `item_untagged {note, itemId: ''}` → `Removed a note from the concept`. Same `it`, the kind guard's control: `item_tagged {itemKind: 'person', itemId: T}` → `concept.item_tagged` (the raw type);
  - `linked {C, broader}` → `Set Phones as a broader concept`; `linked {C, related}` → `Linked the related concept Phones`; `linked {C, related}` with NO `conceptName` → `Linked the related concept <C>`;
  - `unlinked {C, related}` → `Removed the link to Phones`;
  - `merged {intoId: C}` → `Merged into Phones`;
  - `deleted {}` → `Deleted the concept`.

  Control: a payload with no `name` on `concept.created` falls back to the raw type. Import `describeEvent` by relative path (`../src/views/history-copy.js`), as the existing history-copy tests do; grep for one and cite it.

  Kills: (a) swap the `broader` / `related` sentences in the `linked` arm (b) drop the `fromSuggestion` branch of `created` (c) the `described` arm always answers `Changed the summary` (d) (planner ruling 2026-10-04, Q2) restore `|| id === null) return event.type` → the redacted legs read `concept.item_tagged` / `concept.item_untagged` (e) call `ctx.itemLabel?.(kind, id ?? '')` on a redacted id → the redacted `item_tagged` leg reads `Added GN-12 Scroll jumps`.

  `apps/server/test/concepts/census.test.ts`, **27.457**. The registry census, iterating `domainRegistry.registrations()` (the ref's listing; `types()` if plan A renamed it) filtered to `concept.`, with the list asserted to have length 9 first:
  1. Each is in `CONCEPT_EVENT_TYPES`.
  2. Each is refused to a guest by the door (`permission.concept`), so the door has an arm.
  3. For the five that name another entity, `checkPurged` refuses when that entity is in `purged_entities`: `item_tagged` and `item_untagged` once with a purged TICKET and once with a purged NOTE (the kind comes from the payload), and `linked`, `unlinked`, `merged` with a purged CONCEPT id.
  4. The projection's `apply` is total over them AND each arm does something: apply, in order, `created C1`, `created C2`, `renamed C1`, `described C1 'x'`, `item_tagged C1 TP`, `item_untagged C1 TP`, `linked C1→C2 related`, `unlinked C1→C2 related`, `merged C1 into C2`, `deleted C2`, and after EACH one the three tables' contents (`SELECT … ORDER BY` every column, serialised) differ from before it. "Throws nothing" alone is green with any arm deleted: the `default:` returns.

  Control in the same `it`: a guest's NON-concept event (`comment.added` on TP) is not refused by `checkConceptPermission` (it returns `null`), so leg 2 is the concept arm answering and not a blanket refusal. (The plan's control, "`concept.bogus` is absent from the registry", could not fail: nothing in this task registers it. The replacement is accepted: planner ruling 2026-10-04, Q7.) The history half is 27.456 (app-core), and the audience half is the compile-time switch (TS2366) plus 27.454.

  Kills: (a) delete the `concept.described` arm from `projConcepts.apply` (leg 4) (b) drop the `concept.merged` arm from `payloadIds` (leg 3) (c) drop `if (env.entity.kind !== 'concept') return null;` from `checkConceptPermission` (the control reds: the guest's comment is refused `permission.concept`).

  Run: build domain → app-core → server; then app-core's suite, the server's `test/concepts/`, `test/purge/`, `test/permissions/`, `test/projection-order.test.ts`, `test/visibility/` (all `--maxWorkers=2`, logged).

  **Prose to sweep:** (all of Task 3; fix each in the commit of the step named)
  - [Step 2] `packages/domain/test/envelope.test.ts:309` — "lists exactly the nine kinds". Step 2 retitles it to ten.
  - [Step 4] `apps/server/src/permissions/check-permission.ts:1899-1910` — "Four passes, one context, and the ORDER is load-bearing at every seam", then a numbered list of four. Already stale on the ref (the note, group, prefix, lifecycle and comment-authority passes are not in it); the concept pass is one more pass the list omits. Rewrite it, or at least add the concept pass after the note pass.
  - [Step 4] `apps/server/src/permissions/check-permission.ts:1951` — "SECOND, and after the role gate on purpose" (of `checkMembershipOwnerAuthority`). It is already third on the ref (after the note pass), and the concept pass makes it fourth.
  - [Step 4] `apps/server/src/purge/check-purged.ts:18-23` — "Field names are the schemas' own (`events/ticket-events.ts` …; `events/note-events.ts` …)". The concept arms read `events/concept-events.ts` fields; add it to the list.
  - [Step 3] `apps/server/test/projection-order.test.ts:75` — the title lists the pinned order and ends at `search`; Step 3 extends it.
  - Searched with no other hit: `Features.md` and `test-cases/` for `nine kinds`, `ENTITY_KINDS`, `entity kinds` (`Features.md:538` and `test-cases/06-auth-visibility.md:128` describe the TS2366 switch, which stays true: `concept` gets an arm); `visible-events-for.ts:228-242` (stays true).

  Commit.

- [ ] **Step 6: Features, flips, battery**
  - Flip 27.440–27.457 ✅.
  - Features §24 D, under `<!-- D T3 -->`:
    - `⚙️ concept entity: nine concept.* events, three projections (purged items skipped on replay) — packages/domain/src/events/concept-events.ts, apps/server/src/projections/proj-concepts.ts`
    - `⚙️ Concept door: guests read only; every write needs the actor to see the concept (D4) and what it adds; hidden = absent — apps/server/src/permissions/check-concept.ts`
  - Run the server suite WHOLE (the door and the projection registry changed) and every package that typechecks against `EntityKind`. Then `pnpm check:citations`, `check:migrations`, `check:tasks`. LOCAL. Push, then DONE.

### Task 4: Concept reads (D4 at read time), the audience preview, MCP concept tools (cases 27.465–27.484)

**Spec:** §3.2, §5.1 (`list_concepts` / `get_concept`), §5.2 (`manage_concept`, `tag_items`, `link_concepts`), §7 cases 2 and 7, §10 (`get_concept` p95 at 500). **Needs Task 3 merged.**

**Decisions this task makes:**
- **An empty concept** is visible to workspace members and above, never to guests. §3.2 says "workspace members only", read as non-guests (G11).
- **History redaction.** A concept's history redacts `itemId` to `''` in any `item_tagged` or `item_untagged` event naming an item the reader cannot see NOW. An untagged item may since have narrowed. The sentence then reads "a ticket" (Task 3's `item_tagged`/`item_untagged` arm falls through on the redacted id: planner ruling 2026-10-04, Q2). This is spec A §2.6's redaction rule for MCP, applied at the route, so the app and MCP share it.
- **Links.** A link to a concept the reader cannot see is dropped from `get`, not redacted. The link names a concept, and a concept's name is content.
- **Confirmations.**
  - `manage_concept` needs `confirm_name` (the concept's exact name) for `delete` and `merge` only. Those destroy a grouping; `create`, `rename` and `describe` do not.
  - `tag_items` needs it only when the add NARROWS the audience (§3.2). The house shape is `confirmOrPreview` (`packages/mcp-server/src/tools/preview.ts:17`).
- **Audience counting.** "Members" in the preview sentence counts the workspace's people at `scope_kind = 'workspace'`, guests included (`builder-reads.ts:263` filters the roster that way). A member "sees" the concept iff `hiddenItems` answers `[]` for them, with the empty-concept rule applied.

**Files:**
- Create:
  - `apps/server/src/read/concepts.ts`
  - `apps/server/src/routes/concepts.ts`
  - `packages/domain/src/concepts.ts` (wire types)
  - `packages/mcp-server/src/tools/concept-tools.ts`
  - `apps/server/test/concepts/reads.test.ts` (27.465–27.472)
  - `apps/server/test/concepts/perf.test.ts` (27.473, `CONCEPT_PERF=1`)
  - `packages/mcp-server/test/concept-tools.test.ts` (27.474–27.479)
  - `apps/server/test/mcp/concept-tools-e2e.test.ts` (27.480)
- Modify:
  - `apps/server/src/app.ts` beside `:1015`: `registerConceptRoutes`.
  - `apps/server/src/routes/ticket-history.ts:176`: `export` `toHistoryEvent` (one word), so the concept history maps rows the same way.
  - `packages/domain/src/index.ts`: export `./concepts.js`.
  - `packages/mcp-server/src/tools/register.ts`: `...conceptTools(session)` after `...graphTools(session)`.
  - `tool-names.ts`: a `concept` block.
  - `tool-sweep.ts`: five entries.
  - `register.test.ts` FINAL: the five names, in order.

**Interfaces:**
- **Produces** (domain types):
  ```ts
  export type ConceptItemView = { kind: 'ticket' | 'note'; id: string; label: string; taggedBy: string; taggedAt: string; origin: string };
  export type ConceptLinkView = { otherId: string; otherName: string; relation: 'broader' | 'related'; direction: 'broader' | 'narrower' | 'related' };
  export type ConceptSummary = { id: string; name: string; summary: string; itemCount: number; createdBy: string; origin: string };
  export type ConceptView = ConceptSummary & { workspaceId: string; createdAt: string; fromSuggestion: string | null; items: ConceptItemView[]; links: ConceptLinkView[] };
  export type ConceptListResponse = { workspaceId: string; concepts: ConceptSummary[] };
  export type ConceptAudienceResponse = { conceptId: string | null; members: number; before: number; after: number };
  export type ConceptHistoryResponse = { conceptId: string; events: TicketHistoryEvent[] }; // the ticket history event shape, reused
  ```
  - Re-read where `TicketHistoryEvent` is declared for the wire: the server has its own (`routes/ticket-history.ts:29`), and app-core has `view-types.ts:757`. Type `events` with the domain-visible one, or as `unknown[]` mapped client-side, as the ticket history is.
- **Produces** (server):
  - `visibleConceptIds(db, eff, userId, workspaceId, conceptIds?: readonly string[]): Promise<Set<string>>`;
  - `readConceptView(db, eff, userId, conceptId): Promise<ConceptView | null>`;
  - `conceptAudience(db, workspaceId, conceptId | null, add: ItemRef[]): Promise<ConceptAudienceResponse>`.
- **Produces** (routes):
  - `GET /v1/workspaces/:workspaceId/concepts[?item=kind:id]`
  - `GET /v1/concepts/:conceptId`
  - `GET /v1/concepts/:conceptId/history[?afterSeq&limit]`
  - `GET /v1/workspaces/:workspaceId/concepts/audience?add=kind:id[&add=…][&conceptId=]`
- **Produces** (MCP): `conceptTools(session)` with `list_concepts`, `get_concept`, `manage_concept`, `tag_items`, `link_concepts`. Task 5 appends `review_suggestions` and `resolve_suggestion`.
- **Consumes:**
  - `hiddenItems` (T1), `liveConceptItems` and `CONCEPT_RULES` (T3);
  - `requireMember`, `READ_NOT_FOUND_BODY`, `resolveEffectiveRole` (`effective-role.ts:119`);
  - `parsePaging` and `BAD_PAGING_BODY` (`ticket-history.ts:145,93`);
  - `readActorNames` (`builder-reads.ts:319`) for item labels' authors, if needed;
  - `confirmOrPreview`, `submitOne`, `submitBatch`, `envelopeFor`, `readOrNotFound`, `page`, `pageArgs`.

- [ ] **Step 1: Catalogue**

  Under `<!-- D T4 -->`, add 27.465–27.480 ❌. 27.481–27.484 are reserved.

- [ ] **Step 2: The read layer (27.465–27.472), tests first**

  `apps/server/test/concepts/reads.test.ts`:
  - Setup: `seedNotesFixture` and `buildTestApp(db)`; each user signs in with `signInWithPhone` (copy `search-notes.test.ts`'s helper).
  - Seed with `applyCommitted`:
    - CP tagging TP (CP's `concept.created` with `origin: 'mcp'`, so 27.467's origin leg is not `makeCommitted`'s default `'web'`, `test/helpers/apply.ts:97`);
    - CW tagging nWorkspace;
    - CE tagging TE;
    - C0 tagging nothing;
    - CM tagging nWorkspace AND TE (a MIXED concept: `memberIn` sees only nWorkspace, `guestListed` only TE; without it every concept has one item and `every` cannot be told from `some`);
    - `related` CP↔CW, and `related` CP↔CE (27.467's link filter needs a linked concept that a reader of CP cannot see).
  - **Who sees what on the ref** (Rule A, accepted by planner ruling 2026-10-04 (report Q1)): every member and admin is on every founded project (`effective-role.ts:5-19`), so `memberOut` READS TP and nProject. The owner reads everything (`visible-where.ts:138`, `:305`). Guests read explicit lists only (`:114-115`, `:319-322`): they lose TP, nProject and nWorkspace. Every non-owner except `guestListed` loses TE, nExplicit and nInherit. The plan's legs that used `memberOut` as "the reader who cannot see TP" are rebound below, as T1's lane did (`test/read/item-visibility.test.ts:16-19`).
  - The cases:
    - **27.465** `GET /v1/workspaces/WS/concepts`. For EVERY user in `NOTES_USERS`, the returned ids equal the concepts whose live items `hiddenItems` answers `[]` for that user, with C0 for non-guests only. This is an agreement test, the 18.021 pattern. Control in the same `it`: the answer differs between at least two users, so it is not constant; and CM is absent for both `memberIn` and `guestListed` (each sees one of its two items).

      Kills: (a) `liveItems.every((item) => !hidden.has(key(item)))` → `.some(…)` (CM is listed for both) (b) the empty-concept arm → `true` (C0 listed for guests) (c) the list handler skips `visibleConceptIds` and returns every live concept.
    - **27.466** C0 is listed for `memberOut`, and absent for `guestListed` and `guestUnlisted`. Control: tag TE into C0 and it follows TE's audience instead: now listed for `guestListed` and absent for `memberOut`. (The plan's control tagged nWorkspace, whose audience is exactly the empty rule's on this fixture — every non-guest — so it could not tell the two apart.)

      Kills: (a) the empty-concept arm → `true` (C0 listed for guests) (b) → `false` (C0 absent for `memberOut`) (c) `liveItems.length === 0` → `liveItems.length <= 1` (a one-item concept takes the empty rule: the control's `guestListed` leg reds).
    - **27.467** `GET /v1/concepts/CP`:
      - `memberIn` gets 200 with `items = [TP]` (`label` is TP's key + title, exactly), `createdBy` = the owner, and `origin: 'mcp'`;
      - its `links` show CW only when the reader sees CW: `memberIn`'s `links` are EXACTLY `[{ otherId: CW, relation: 'related', direction: 'related', otherName: <CW's name> }]` (CE is linked too and `memberIn` cannot see TE), while the owner's `links` hold both CW and CE;
      - `guestUnlisted` gets 404 with `READ_NOT_FOUND_BODY`, byte-equal to the 404 for a random ULID. (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan's subject was `memberOut`, who reads TP on the ref. Same `it`: `memberOut` → 200.)

      Kills: (a) `readConceptView` skips step 2 (`visibleConceptIds(…, [id])`) (b) drop the link filter (CE reaches `memberIn`) (c) a ticket's `label` = its title alone.
    - **27.468** (Review Focus 1)
      - First, `memberIn` gets 200 on CP and the list includes CP (the precondition: a 404 after proves nothing if it was 404 before).
      - Apply `visibility.set` making TP explicit `[owner]`. Copy the payload from `test/helpers/seed.ts`'s `setVisibilityEnv` (`:531`).
      - `memberIn` now gets 404 on CP, and the list omits it, with NO other write in between (nothing cached).
      - Same `it`, the door: `memberIn` renaming CP is refused with `concept.unknown`.
      - Control: the owner still gets 200.

      Kills: (a) memoise `visibleConceptIds` per `(userId, conceptId)` in a module-level `Map` (b) the door's `seesConcept` answers from a cache filled at tag time. (No Rule A change: an explicit `[owner]` audience hides TP from every member.)
    - **27.469** (Review Focus 2)
      - A ticket TX, explicit `[owner]`, assigned to `memberOut` (`ticket.assigned`; take the payload from `ticket-events.ts`). TX is tagged into CX.
      - `memberOut` sees CX (the assignee arm, `assigneeReachWhere`, `visibility/assignee-arm.ts:63`): 200, asserted before the reassignment.
      - After reassignment to the owner, `memberOut` gets 404.
      - Control: `memberIn`, never assigned, gets 404 throughout.

      Kills: (a) `visibleConceptIds` decides a ticket item from `proj_visibility` alone (`resolved_mode` / `resolved_user_ids`) instead of `hiddenItems` (the assignee arm is lost: the 200 leg reds) (b) `readConceptView` caches the step-2 answer per concept (the post-reassignment 404 reds).
    - **27.470**
      - `?item=ticket:TP` lists exactly `[CP]`, for `memberIn`.
      - The same query from `guestListed` → 404, because the reader cannot see the item. (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan's subject was `memberOut`, who reads TP on the ref; same `it`: `memberOut` → 200 with `[CP]`.)
      - `?item=widget:x` → 400.

      Kills: (a) drop the `proj_concept_items` filter by the item (every visible concept is listed) (b) skip the item's `hiddenItems` check (the guest gets 200 with `[]`) (c) the item regex accepts any kind (`^(\w+):(.+)$`).
    - **27.471** `GET /v1/concepts/CW/history`:
      - Tag TE into CW as the owner, then untag it. TE is explicit [guestListed], so `memberIn` cannot see it.
      - `memberIn` gets 200 (CW is `{nWorkspace}` again), and its history holds EXACTLY two events naming an item of kind `ticket` (the tag and the untag), both with `payload.itemId === ''`; the `concept.created` and the nWorkspace tag are unredacted.
      - Control: the owner's shows TE's id on both.

      Kills: (a) drop the redaction (b) redact by the concept's CURRENT items (`liveConceptItems`) instead of the items the events name (TE is no longer tagged, so nothing is redacted) (c) blank `itemKind` instead of `itemId`.
    - **27.472** `GET /v1/workspaces/WS/concepts/audience?conceptId=CW&add=ticket:TE`:
      - answers EXACTLY `{ conceptId: CW, members: 7, before: 5, after: 1 }`. `members` is `NOTES_USERS.length` (seven workspace-scope grants); `before` is everyone who reads nWorkspace (owner, admin, memberIn, memberOut, author; guests do not, `visible-where.ts:319`); `after` is the owner alone (TE is explicit `[guestListed]`, and `guestListed` does not read nWorkspace).
      - `after < before`.

      Control: `add=note:nWorkspace` (already tagged) gives `after === before === 5`.

      (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan added TP, "TP drops `memberOut` and the guests". On the ref `memberOut` reads TP and the guests never read CW, so TP gives `after === before` and the case could not show narrowing. TE does.)

      Kills: (a) the roster query loses `AND scope_kind = 'workspace'` (`members` counts project rows too: 10) (b) `liveAfter = liveOf(db, workspaceId, add)` without `...current` (`after` = owner + `guestListed` = 2) (c) `sees` counts a member when ANY item is visible (`.length < items.length`) instead of none hidden.

  `apps/server/src/read/concepts.ts`:
  ```ts
  import type { ConceptAudienceResponse, ConceptView } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { resolveEffectiveRole, type EffectiveRole } from '../permissions/effective-role.js';
  import { hiddenItems, type ItemRef } from './item-visibility.js';
  import { LIVE_TICKET_WHERE } from './visible-where.js';

  const key = (item: ItemRef): string => `${item.kind}:${item.id}`;

  /**
   * Spec D §3.2 (D4), at READ time: of the workspace's live concepts (or of `conceptIds`), the ones this viewer
   * sees, meaning every live item is visible to them. An empty concept is visible to non-guests only (§3.2,
   * "workspace members only"). ONE `hiddenItems` call over the union of every concept's items, so a list costs
   * two queries per item kind, not two per concept.
   */
  export async function visibleConceptIds(
    db: Queryable,
    eff: EffectiveRole,
    userId: string,
    workspaceId: string,
    conceptIds?: readonly string[],
  ): Promise<Set<string>> {
    const { rows } = await db.query<{ concept_id: string; item_kind: 'ticket' | 'note' | null; item_id: string | null }>(
      `SELECT c.concept_id, i.item_kind, i.item_id
         FROM proj_concepts c LEFT JOIN proj_concept_items i ON i.concept_id = c.concept_id
        WHERE c.workspace_id = $1 AND c.deleted = FALSE AND ($2::text[] IS NULL OR c.concept_id = ANY ($2::text[]))`,
      [workspaceId, conceptIds === undefined ? null : [...conceptIds]],
    );
    const itemsOf = new Map<string, ItemRef[]>();
    for (const row of rows) {
      const list = itemsOf.get(row.concept_id) ?? [];
      if (row.item_kind !== null && row.item_id !== null) list.push({ kind: row.item_kind, id: row.item_id });
      itemsOf.set(row.concept_id, list);
    }
    const all = [...itemsOf.values()].flat();
    const hidden = new Set((await hiddenItems(db, eff, userId, workspaceId, all)).map(key));
    const live = new Set((await liveOf(db, workspaceId, all)).map(key));
    const out = new Set<string>();
    for (const [conceptId, items] of itemsOf) {
      const liveItems = items.filter((item) => live.has(key(item)));
      if (liveItems.length === 0 ? eff.workspaceRole !== 'guest' : liveItems.every((item) => !hidden.has(key(item)))) out.add(conceptId);
    }
    return out;
  }

  /** The live subset of `items` (trashed and absent items do not count toward D4 or toward "empty"). */
  async function liveOf(db: Queryable, workspaceId: string, items: readonly ItemRef[]): Promise<ItemRef[]> {
    const tickets = items.filter((item) => item.kind === 'ticket').map((item) => item.id);
    const notes = items.filter((item) => item.kind === 'note').map((item) => item.id);
    const out: ItemRef[] = [];
    if (tickets.length > 0) {
      const { rows } = await db.query<{ id: string }>(
        `SELECT t.ticket_id AS id FROM proj_tickets t
          WHERE t.workspace_id = $1 AND t.ticket_id = ANY ($2::text[]) AND ${LIVE_TICKET_WHERE}`,
        [workspaceId, tickets],
      );
      out.push(...rows.map((row) => ({ kind: 'ticket' as const, id: row.id })));
    }
    if (notes.length > 0) {
      const { rows } = await db.query<{ id: string }>(
        'SELECT note_id AS id FROM proj_notes WHERE workspace_id = $1 AND note_id = ANY ($2::text[]) AND deleted = FALSE',
        [workspaceId, notes],
      );
      out.push(...rows.map((row) => ({ kind: 'note' as const, id: row.id })));
    }
    return out;
  }

  /** "Fewer people will see this concept: <after> of <members> members" (§3.2): who sees it now, and with `add`. */
  export async function conceptAudience(
    db: Queryable,
    workspaceId: string,
    conceptId: string | null,
    add: readonly ItemRef[],
  ): Promise<ConceptAudienceResponse> {
    const roster = await db.query<{ user_id: string }>(
      `SELECT user_id FROM proj_memberships WHERE workspace_id = $1 AND scope_kind = 'workspace' ORDER BY user_id`,
      [workspaceId],
    );
    const current = conceptId === null ? [] : (await db.query<{ item_kind: 'ticket' | 'note'; item_id: string }>(
      'SELECT item_kind, item_id FROM proj_concept_items WHERE concept_id = $1', [conceptId])).rows.map((row) => ({ kind: row.item_kind, id: row.item_id }));
    const liveBefore = await liveOf(db, workspaceId, current);
    const liveAfter = await liveOf(db, workspaceId, [...current, ...add]);
    let before = 0;
    let after = 0;
    for (const { user_id: userId } of roster.rows) {
      const eff = await resolveEffectiveRole(db, userId, workspaceId);
      const sees = async (items: ItemRef[]) =>
        items.length === 0 ? eff.workspaceRole !== null && eff.workspaceRole !== 'guest' : (await hiddenItems(db, eff, userId, workspaceId, items)).length === 0;
      if (await sees(liveBefore)) before += 1;
      if (await sees(liveAfter)) after += 1;
    }
    return { conceptId, members: roster.rows.length, before, after };
  }
  ```
  - `readConceptView` composes the pieces:
    1. the concept row (live; `null` if absent);
    2. `visibleConceptIds(…, [id])` (`null` if not visible);
    3. its items with labels:
       - a ticket's label = its key + title. Reuse `cardKeysFor` if plan C exported it (plan C Task 1 does, `read/ticket-cards.ts`). Otherwise use `assembleTicketCards`.
       - a note's label = its title.
    4. its links, keeping those whose other concept is in `visibleConceptIds(…, others)`, with `direction` from `(a, b, relation)` relative to this concept.

    Write it in that order.
  - The perf bar (27.473) is on this function's route.

  `apps/server/src/routes/concepts.ts`. The sibling is `routes/groups.ts` (the `requireMember` → 404 shape). Four handlers:
  - the list (with `?item=`: parse `^(ticket|note):(.+)$` → 400; the item must pass `hiddenItems` → 404; filter `proj_concept_items` by it);
  - `GET /v1/concepts/:conceptId` (look up `workspace_id` from `proj_concepts`; absent → 404; `requireMember` → 404; `readConceptView` → 404 on `null`);
  - `/history`: the same 404s. Then `parsePaging`, select from `events` where `entity_kind = 'concept'` (the `ticket-history.ts:300-307` statement with `'concept'`), map with `toHistoryEvent`, and redact (below);
  - `/concepts/audience`: `add` is required (one or more) → 400; `conceptId` optional, and when given it must be visible to the CALLER → 404.

  The redaction, in the history handler:
  ```ts
  const named = events.flatMap((event) =>
    (event.type === 'concept.item_tagged' || event.type === 'concept.item_untagged') && typeof (event.payload as { itemId?: unknown }).itemId === 'string'
      ? [{ kind: (event.payload as { itemKind: 'ticket' | 'note' }).itemKind, id: (event.payload as { itemId: string }).itemId }]
      : [],
  );
  const hidden = new Set((await hiddenItems(deps.pool, eff, viewerId, workspaceId, named)).map((item) => `${item.kind}:${item.id}`));
  const shown = events.map((event) => {
    const p = event.payload as { itemKind?: string; itemId?: string };
    return p.itemId !== undefined && hidden.has(`${String(p.itemKind)}:${p.itemId}`) ? { ...event, payload: { ...p, itemId: '' } } : event;
  });
  ```
  `hiddenItems` reports LIVE hidden items only. A since-TRASHED item's id stays visible to a reader who could see the concept when it was tagged. That is the trash rule (rows kept; ids are not content). Say so in the handler's docblock.

  Run the file. Expected: PASS.

  Mutations:

  | Mutation | Expected |
  |---|---|
  | `visibleConceptIds` treats an empty concept as visible to guests | 27.466 reds |
  | drop the redaction | 27.471 reds |

  Commit.

- [ ] **Step 3: The `get_concept` p95 bar (27.473)**

  `apps/server/test/concepts/perf.test.ts`. Copy `test/search/perf.test.ts:37-61`'s gate (`CONCEPT_PERF=1`, a printed skip, `it.skip` naming the variable) and its `percentile` (`:47-51`).
  - Seed exactly as 27.414 (Task 1): 500 tickets, every 50th explicit to the owner.
  - Tag ALL 500 into concept C500, plus 490 of them into C490 (the visible ones).
  - Then 100 × `GET /v1/concepts/C490` as the member, through `app.inject`, and record p95.
  - The bar: **≤ 150 ms**.
  - Control in the same `it`: `GET /v1/concepts/C500` answers 404 for the member (the 10 hidden), so the measured route did the D4 work.
  - Same `it`: EVERY one of the 100 measured responses is 200 with `items.length === 490`. A route that answered 404 fast would otherwise meet the bar.
  - Print the p95 for the DONE.

  Kills: (a) `visibleConceptIds` skips `hiddenItems` (C500 answers 200: the control reds) (b) `readConceptView` answers `null` above some item count (the 200 leg reds). The bar itself is a measurement, not a mutant target.

  If the bar misses: STOP (Global Constraints) and report the number.

  Commit.

- [ ] **Step 4: MCP concept tools (27.474–27.480), tests first**

  `packages/mcp-server/test/concept-tools.test.ts`. The fake Session is copied from `member-admin-tools.test.ts`'s top: `get` answers by path from a map, and `postEvents` records the batch and answers `accepted`. The cases:
  - **27.474**
    - `list_concepts {workspaceId}` GETs exactly `/v1/workspaces/w/concepts` and pages it: with three concepts in the fake body and `limit: 2`, the answer holds the first two and a non-null `nextCursor`, and that cursor returns the third with `nextCursor: null`.
    - `get_concept {conceptId}` GETs exactly `/v1/concepts/c` and returns the fake body (`toEqual`).
    - A 404 from either → `concept not found or not visible to you`.

    Control: `list_concepts` with `item` puts `?item=ticket%3At` on the path.

    Kills: (a) return `body.concepts` without `page(…)` (b) `readOrNotFound(…, 'concept')` → `'item'` (c) build `?item=` without `enc` (the path holds `ticket:t`).
  - **27.475** `manage_concept`:
    - `create {name}` posts ONE `concept.created` with `entity.kind 'concept'`, a fresh ULID (`/^[0-9A-HJKMNP-TV-Z]{26}$/`, and two creates give two different ids) and `origin 'mcp'`, payload exactly `{ name }`.
    - `rename` and `describe` post directly, on `entity.id === 'c'`, with payloads exactly `{ name }` and `{ summary }`; `describe {summary: ''}` posts `{ summary: '' }` (an empty summary clears, so it must not be read as "missing").
    - `delete` without `confirm_name` answers the preview `{ preview: true, wouldChange: 'Deletes the concept "Scroll".', counts: { items: 3 }, nothingChanged: true, confirm: 'confirm_name must be "Scroll"' }` and posts NOTHING (the fake's `postEvents` call log is empty). The fake concept has exactly 3 items.
    - With `confirm_name: 'scroll'` (wrong case) it answers the same preview; with `'Scroll'` it posts `concept.deleted` on `c`.
    - `merge {intoId: 'd'}` (the fake answers `d` as `"Phones"`) without `confirm_name` answers `wouldChange: 'Merges "Scroll" into "Phones"; its items move and "Scroll" is deleted.'` and posts nothing; with the name it posts `concept.merged {intoId: 'd'}` on `c`.

    Kills: (a) skip `confirmOrPreview` for delete (b) `if (a.summary === undefined)` → `if (!a.summary)` (`describe ''` throws) (c) post `concept.merged` on `into.id` with `{ intoId: concept.id }` (the direction swaps).
  - **27.476** (Review Focus 5) `tag_items {conceptId, action: 'add', items: [ticket t2, note n3]}`, with the audience GET answering `{ members: 9, before: 6, after: 3 }`:
    - no `confirm_name` → the preview `wouldChange: 'Fewer people will see this concept: 3 of 9 members'`, `counts: { members: 9, before: 6, after: 3 }`, nothing posted;
    - a WRONG `confirm_name` → the same preview;
    - the right one → ONE `postEvents` call carrying both `concept.item_tagged` events, in order (`{ticket, t2}`, `{note, n3}`). TWO items, because with one item a loop of `submitOne` calls also makes exactly one call.

    Same `it`, the control: the GET path is exactly `…/concepts/audience?conceptId=c&add=ticket%3At2&add=note%3An3`.

    Kills: (a) replace `submitBatch(session, a.items.map(…))` with a `for` loop of `submitOne` (two `postEvents` calls) (b) the sentence uses `audience.before` for `after` (`6 of 9`) (c) join the `add=` parameters with `,` instead of `&`.
  - **27.477**
    - `add` with `{ before: 6, after: 6 }` posts at once, with no preview.
    - `remove` never GETs the audience (the fake's GET log holds only `/v1/concepts/c`) and posts `concept.item_untagged` for each item.
    - A refusal in the batch comes back as `event 0 refused by concept.already-tagged: …` (`submitBatch`'s sentence, `submit.ts:49`).

    Kills: (a) `audience.after < audience.before` → `<=` (the plan's own mutation row) (b) drop the `if (a.action === 'add')` guard around the audience GET (c) `type` → always `'concept.item_tagged'`. The refusal leg guards existing behaviour (`submitBatch`, `submit.ts:46-56`): no mutant of this task's code reaches it unless the tool catches the error, which it does not.
  - **27.478** `link_concepts {conceptId, otherId, relation: 'related', action: 'add'}` posts `concept.linked` on `conceptId` with payload exactly `{ otherId, relation: 'related' }`, and `remove` with `relation: 'broader'` posts `concept.unlinked` with `{ otherId, relation: 'broader' }`. A refusal passes through as `refused by concept.self: A concept cannot be linked to itself.`

    Kills: (a) post on `{ kind: 'concept', id: a.otherId }` with `otherId: a.conceptId` (b) the `add`/`remove` ternary inverted (c) a hard-coded `relation: 'related'`.
  - **27.479**
    - `allTools` ends `…, 'list_deleted', 'similar', 'list_concepts', 'get_concept', 'manage_concept', 'tag_items', 'link_concepts'` (plus whatever the release tip added; re-derive).
    - `TOOL_NAMES` agrees.
    - Every new tool has a description that names its confirm rule where it has one: `manage_concept`'s contains `confirm_name` and `merge and delete`; `tag_items`'s contains `confirm_name` and `Fewer people will see this concept`; `link_concepts`'s does NOT contain `confirm_name` (it has no confirm rule).

    Kills: (a) register `conceptTools` before `graphTools` in `register.ts` (b) drop the `confirm_name` sentence from `tag_items`' description (c) add `link_concepts` to `tool-names.ts` but not to `register.ts`.

  `packages/mcp-server/src/tools/concept-tools.ts`:
  ```ts
  import { z } from 'zod';
  import { newUlid, type ConceptAudienceResponse, type ConceptListResponse, type ConceptView } from '@gisik-nokma/domain';
  import type { Session } from '../session.js';
  import { confirmOrPreview } from './preview.js';
  import type { ToolDefinition } from './read-tools.js';
  import { page, pageArgs, readOrNotFound } from './reads.js';
  import { envelopeFor, submitBatch, submitOne } from './submit.js';

  /**
   * Knowledge Graph spec D §5: concepts. Reads call the API (D4 is the server's), and writes go through the
   * ingest door as the session's user with `origin: 'mcp'` (`envelopeFor`), so the door's D4 rules, not this file,
   * decide. D6's switch has no effect here.
   */
  const id = z.string().min(1);
  const enc = encodeURIComponent;
  const itemRef = z.object({ kind: z.enum(['ticket', 'note']), id });
  const conceptOf = async (session: Session, conceptId: string): Promise<ConceptView> =>
    (await readOrNotFound(session, `/v1/concepts/${enc(conceptId)}`, 'concept')) as ConceptView;

  const listShape = { workspaceId: id, item: itemRef.optional(), ...pageArgs };
  const getShape = { conceptId: id };
  const manageShape = {
    action: z.enum(['create', 'rename', 'describe', 'merge', 'delete']),
    workspaceId: id.optional(), conceptId: id.optional(), name: z.string().min(1).optional(),
    summary: z.string().max(2000).optional(), intoId: id.optional(), confirm_name: z.string().optional(),
  };
  const tagShape = { conceptId: id, action: z.enum(['add', 'remove']), items: z.array(itemRef).min(1).max(50), confirm_name: z.string().optional() };
  const linkShape = { conceptId: id, otherId: id, relation: z.enum(['broader', 'related']), action: z.enum(['add', 'remove']) };

  export function conceptTools(session: Session): ToolDefinition[] {
    const ev = (workspaceId: string, conceptId: string, type: string, payload: unknown) =>
      envelopeFor(session, workspaceId, { kind: 'concept', id: conceptId }, type, payload);
    return [
      {
        name: 'list_concepts',
        description:
          'The concepts (named groups of tickets and notes) you can see in a workspace: you see a concept only when you can ' +
          'see every item in it. Give `item` to list only the concepts that contain that ticket or note.',
        inputSchema: listShape,
        handler: async (args) => {
          const a = z.object(listShape).parse(args);
          const qs = a.item === undefined ? '' : `?item=${enc(`${a.item.kind}:${a.item.id}`)}`;
          const body = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/concepts${qs}`, 'concept')) as ConceptListResponse;
          const { items, nextCursor } = page(body.concepts, a.cursor, a.limit);
          return { workspaceId: body.workspaceId, concepts: items, nextCursor };
        },
      },
      {
        name: 'get_concept',
        description: 'One concept: its summary, its items (tickets and notes, each with who tagged it and how), its links to broader and related concepts, and who created it.',
        inputSchema: getShape,
        handler: async (args) => conceptOf(session, z.object(getShape).parse(args).conceptId),
      },
      {
        name: 'manage_concept',
        description:
          'Create (workspaceId, name, summary?), rename (conceptId, name), describe (conceptId, summary; empty clears), ' +
          "merge (conceptId into intoId: its items move, it is deleted) or delete (conceptId) a concept. merge and delete need confirm_name — the concept's exact name; without it you get a preview and nothing happens.",
        inputSchema: manageShape,
        handler: async (args) => {
          const a = z.object(manageShape).parse(args);
          if (a.action === 'create') {
            if (a.workspaceId === undefined || a.name === undefined) throw new Error('create needs workspaceId and name');
            return submitOne(session, ev(a.workspaceId, newUlid(), 'concept.created', { name: a.name, ...(a.summary === undefined ? {} : { summary: a.summary }) }));
          }
          if (a.conceptId === undefined) throw new Error(`${a.action} needs conceptId`);
          const concept = await conceptOf(session, a.conceptId);
          if (a.action === 'rename') {
            if (a.name === undefined) throw new Error('rename needs name');
            return submitOne(session, ev(concept.workspaceId, concept.id, 'concept.renamed', { name: a.name }));
          }
          if (a.action === 'describe') {
            if (a.summary === undefined) throw new Error('describe needs summary');
            return submitOne(session, ev(concept.workspaceId, concept.id, 'concept.described', { summary: a.summary }));
          }
          if (a.action === 'merge') {
            if (a.intoId === undefined) throw new Error('merge needs intoId');
            const into = await conceptOf(session, a.intoId);
            const preview = await confirmOrPreview(concept.name, a.confirm_name, async () => ({
              sentence: `Merges "${concept.name}" into "${into.name}"; its items move and "${concept.name}" is deleted.`,
              counts: { items: concept.items.length },
            }));
            if (preview !== null) return preview;
            return submitOne(session, ev(concept.workspaceId, concept.id, 'concept.merged', { intoId: into.id }));
          }
          const preview = await confirmOrPreview(concept.name, a.confirm_name, async () => ({
            sentence: `Deletes the concept "${concept.name}".`,
            counts: { items: concept.items.length },
          }));
          if (preview !== null) return preview;
          return submitOne(session, ev(concept.workspaceId, concept.id, 'concept.deleted', {}));
        },
      },
      {
        name: 'tag_items',
        description:
          'Add tickets and notes to a concept, or remove them. An add that would NARROW who can see the concept (you see a ' +
          "concept only if you see every item) answers a preview — \"Fewer people will see this concept: 3 of 9 members\" — until confirm_name is the concept's exact name. Removing never needs it.",
        inputSchema: tagShape,
        handler: async (args) => {
          const a = z.object(tagShape).parse(args);
          const concept = await conceptOf(session, a.conceptId);
          const type = a.action === 'add' ? 'concept.item_tagged' : 'concept.item_untagged';
          if (a.action === 'add') {
            const adds = a.items.map((item) => `add=${enc(`${item.kind}:${item.id}`)}`).join('&');
            const audience = (await readOrNotFound(
              session,
              `/v1/workspaces/${enc(concept.workspaceId)}/concepts/audience?conceptId=${enc(concept.id)}&${adds}`,
              'concept',
            )) as ConceptAudienceResponse;
            if (audience.after < audience.before) {
              const preview = await confirmOrPreview(concept.name, a.confirm_name, async () => ({
                sentence: `Fewer people will see this concept: ${String(audience.after)} of ${String(audience.members)} members`,
                counts: { members: audience.members, before: audience.before, after: audience.after },
              }));
              if (preview !== null) return preview;
            }
          }
          return submitBatch(session, a.items.map((item) => ev(concept.workspaceId, concept.id, type, { itemKind: item.kind, itemId: item.id })));
        },
      },
      {
        name: 'link_concepts',
        description: 'Link two concepts (relation broader: otherId is the broader one; related: either way round), or remove that link.',
        inputSchema: linkShape,
        handler: async (args) => {
          const a = z.object(linkShape).parse(args);
          const concept = await conceptOf(session, a.conceptId);
          return submitOne(session, ev(concept.workspaceId, concept.id, a.action === 'add' ? 'concept.linked' : 'concept.unlinked', { otherId: a.otherId, relation: a.relation }));
        },
      },
    ];
  }
  ```
  - Register it after `graphTools`.
  - `tool-names.ts`: add `concept: [ // concept begin (KG-D T4, T5)\n 'list_concepts', 'get_concept', 'manage_concept', 'tag_items', 'link_concepts',\n // concept end ]`.
  - `tool-sweep.ts`: one entry per tool, each with a `session.get` answering a minimal `ConceptView` / list / audience body.
  - `register.test.ts` FINAL: append the five, and re-derive the count.

  `apps/server/test/mcp/concept-tools-e2e.test.ts`, **27.480**. The real server, the real tool, and an in-process Session.
  - Copy how `apps/server/test/mcp/` drives a tool against `buildTestApp`; grep for the nearest e2e that calls a write tool and cite it.
  - Rule A, accepted by planner ruling 2026-10-04 (report Q1). The plan added TP to CW. On the ref everyone who reads CW (owner, admin, memberIn, memberOut, author) also reads TP, so `after === before` and NO preview is ever answered: the case's first leg is red on correct code. `memberIn` cannot add TE either (the door refuses an item it cannot see). Rebound: a test-local ticket TL, explicit `[owner, memberIn]`; adding TL to CW narrows 5 → 2.
  - `memberIn` calls `tag_items` adding TL to CW: the first call answers the preview with numbers equal to the route's `GET …/audience` AND equal to `{ members: 7, before: 5, after: 2 }` (`wouldChange: 'Fewer people will see this concept: 2 of 7 members'`), and the database is unchanged (`proj_concept_items` for CW has the same rows before and after).
  - The second call with `confirm_name` writes. `proj_concept_items` has the row with `origin = 'mcp'` and `tagged_by = memberIn`.

  Control: `memberOut` calling `get_concept CE` → `concept not found or not visible to you` (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan said CP, which `memberOut` reads on the ref).

  Kills: (a) `if (audience.after < audience.before)` → `if (false)` (the first call writes) (b) `confirmOrPreview(concept.name, …)` → `confirmOrPreview(concept.id, …)` (the confirmed call previews again; no row) (c) `envelopeFor(…)` replaced by a `newSubmittedEvent` with `origin: 'web'` in `ev` (the row's `origin` reds).

  Run:
  - build domain → mcp-server → server;
  - the mcp-server suite;
  - the server `test/concepts/`, `test/mcp/` (14.262 and 14.555 follow), and the default suite skip line for 27.473.

  All `--maxWorkers=2`, logged.

  Mutation: `tag_items` compares `after <= before` → 27.477's no-preview line reds.

  **Prose to sweep:** (all of Task 4)
  - [Step 4] `packages/mcp-server/test/register.test.ts:87` (14.555's title, "the 63 tools") and `:103` (`toHaveLength`), and `test-cases/14-mcp-server.md:938` (14.555, "the final registry is the 63 tools"): five more tools.
  - [Step 4] `Features.md:3454` — "Sixty-three tools in both doors" (Task 2 moves it by one; this task by five more).
  - [Step 4] `Features.md:3407` — "sixty-three since MCP-everything": the same count, five more.
  - Searched with no other hit: `docs/manual.md` §16 (`:2043-2069`, "What your assistant can do": a list of what it CAN do, which an omission does not falsify; Task 9 writes the concepts section); `apps/server/src/routes/ticket-history.ts:145-176` (exporting `toHistoryEvent` falsifies no comment); `Features.md` and `test-cases/` for `concept` (none outside §24 D / §27.D on the ref).

  Commit.

- [ ] **Step 5: Features, flips, battery**
  - Flip 27.465–27.480 ✅, with 27.473's number.
  - Features §24 D, under `<!-- D T4 -->`:
    - `✅ Concepts API: list (with ?item), get, history (hidden items redacted), audience preview; D4 at read time — apps/server/src/routes/concepts.ts, apps/server/src/read/concepts.ts`
    - `✅ MCP concept tools: list_concepts, get_concept, manage_concept, tag_items (narrowing preview), link_concepts — packages/mcp-server/src/tools/concept-tools.ts`
  - Server WHOLE, mcp-server, domain; `check:citations`, `check:tasks`. LOCAL. Push, then DONE.

### Task 5: Suggestions — the job, its triggers, rejections, the read, MCP review/resolve (cases 27.485–27.504)

**Spec:** §4.1 (output, "when it runs"), §4.3, §3.1 (the workspace-stream rejection), §7 case 5 at the database level. **Needs: Task 1's bars PASSED (the stop gate), Task 2 (item vectors), Task 4 (concept reads and tools).**

**Decisions this task makes** (Self-review G5, G9):
- **The rejection payload is `{ signature, itemHashes }`, not `{ signature }`.**
  - "Unless the set changed by more than half" needs the rejected SET. The signature is a hash of the whole set and cannot measure overlap.
  - Hashes, not ids: the event is on the WORKSPACE stream, which every non-guest's replica receives (`audienceClassOf` → `'workspace'`, `visible-events-for.ts:257-258`). An id list would tell a member that a ticket they cannot see exists, and what it is grouped with.
- **The partition is a clustering boundary; D4 is checked again at READ time** for every suggestion, per reader. The partition key cannot model the assignee arm or a project note's author arm (`partition.ts`'s docblock, Task 1). So a suggestion is served to a reader only when `hiddenItems` answers `[]` for its items (27.494).
- **Suggestion ids are stable across runs:** an upsert on `(workspace_id, signature)`. A suggestion the reader is looking at does not change id because the job ran again. Rows whose signature is no longer produced are deleted.
- **Triggers:**
  - nightly at 02:00 IST (once per IST date per workspace);
  - after 200 item changes in a workspace, 10 minutes after the latest change (each change re-arms the 10 minutes).

  "Item change" = an event `nudgesEmbedding` or `nudgesItemEmbedding` accepts. The counter is in memory: a restart loses at most 199 counts, and the nightly run covers that. The job runs only where the embed worker runs (`config.embedWorkerEnabled`, `index.ts:322`; cite corrected from `:321`, a comment line), because its input is the worker's output.
- **Who may see and resolve suggestions:** members and above (a guest gets 404, as `routes/groups.ts` answers a guest). Resolving needs the §3.3 rule: see every item.

**Files:**
- Create:
  - `apps/server/migrations/<P3>_suggestions.sql`
  - `apps/server/src/semantic/suggestion-job.ts`
  - `apps/server/src/semantic/scheduler.ts`
  - `apps/server/src/projections/proj-concept-rejections.ts`
  - `apps/server/src/routes/suggestions.ts`
  - `packages/domain/src/events/suggestion-events.ts`
  - `apps/server/test/semantic/job.test.ts` (27.485, 27.487–27.490)
  - `apps/server/test/semantic/scheduler.test.ts` (27.491)
  - `apps/server/test/semantic/suggestions-route.test.ts` (27.492–27.497)
  - `packages/domain/test/suggestion-events.test.ts` (27.486)
  - `packages/mcp-server/test/suggestion-tools.test.ts` (27.498, 27.500)
  - `apps/server/test/mcp/suggestion-e2e.test.ts` (27.499)
- Modify:
  - `vocabulary.ts`: register `workspace.concept_suggestion_rejected` (entity `workspace`).
  - `projections/index.ts`: register after `projConcepts`; the projection-order pin.
  - `check-concept.ts`: the rejection door, plus the `fromSuggestion` check on `concept.created`.
  - `check-permission.ts`: route the rejection type to it, beside the T3 call.
  - `purge/table-rules.ts` and `erasure.ts`: three tables.
  - `history-copy.ts`: one arm.
  - `index.ts` beside `:322-338` (cite corrected from `:321-337`): start the scheduler.
  - `app.ts:1161-1169` (the subscription block; cite corrected from `:1158-1166`, which starts mid-comment): `deps.onSemanticChange?.(event.workspaceId)` on the same subscription.
  - `concept-tools.ts`: two tools.
  - `tool-names.ts` / `tool-sweep.ts` / `register.test.ts`.

**Interfaces:**
- **Produces:**
  - the tables `sem_suggestions (id, workspace_id, signature, partition_key, item_kind[], item_id[], item_hashes[], terms[], label, score, computed_at)` (the spec's columns plus `partition_key`, `item_hashes` and `label`), `proj_concept_rejections (workspace_id, signature, item_hashes, rejected_by, rejected_at, origin)`, and `sem_job_state (workspace_id, last_nightly_ist_date)`;
  - `runSuggestionJob(pool, workspaceId, options?: { now?: Date }): Promise<{ suggestions: number; items: number; ms: number }>`;
  - `startSuggestionScheduler(pool, options: { log?; now?: () => Date; runJob?: typeof runSuggestionJob }): { change(workspaceId: string): void; stop(): void; tick(): Promise<void> }`;
  - `SuggestionView = { id: string; label: string; terms: string[]; score: number; computedAt: string; signature: string; itemHashes: string[]; items: Array<{ kind: 'ticket' | 'note'; id: string; label: string }> }` and `SuggestionListResponse = { workspaceId: string; suggestions: SuggestionView[] }` (domain);
  - `GET /v1/workspaces/:workspaceId/suggestions`;
  - the MCP tools `review_suggestions` and `resolve_suggestion`.
- **Consumes:**
  - Task 1's `suggestAll`, `meanUnit`, `ticketAudienceKey`, `noteAudienceKey`, `itemKey`, `parseItemKey`, the constants and `hiddenItems`;
  - Task 2's `search_item_chunks`;
  - Task 3's `proj_concept_items`;
  - Task 4's `readConceptView` / labels;
  - `proj_visibility (resolved_mode, project_id, resolved_user_ids)` (`migrations/1787961300000_proj-visibility.sql:18-30`);
  - `proj_note_attachments (note_id, ticket_id)` (`1790100000000_proj-notes.sql:68-75`).

- [ ] **Step 1: Catalogue**

  Under `<!-- D T5 -->`, add 27.485–27.500 ❌. 27.501–27.504 are reserved.

- [ ] **Step 2: The event and the tables (27.485–27.486)**

  `packages/domain/src/events/suggestion-events.ts`:
  ```ts
  import { z } from 'zod';

  /**
   * Knowledge Graph spec D §3.1/§4.3: a member rejected a model suggestion. On the WORKSPACE stream, so it carries
   * hashes, never item ids (KG-D plan, decision G5): `itemHashes` lets the job measure "changed by more than half"
   * (§4.1 step 6) without telling every replica which items were grouped.
   */
  export const suggestionRejectedPayload = z
    .object({
      signature: z.string().regex(/^[0-9a-f]{64}$/),
      itemHashes: z.array(z.string().regex(/^[0-9a-f]{32}$/)).min(3).max(12),
    })
    .strict();
  export type SuggestionRejectedPayload = z.infer<typeof suggestionRejectedPayload>;
  ```
  - `vocabulary.ts`: `domainRegistry.register({ type: 'workspace.concept_suggestion_rejected', version: 1, entityKind: 'workspace', payloadSchema: suggestionRejectedPayload });`. Export the file from `index.ts`.
  - **27.486** (domain test): the valid shape parses. Each of these is refused:
    - a 63-hex signature;
    - two hashes;
    - 13 hashes;
    - an extra `itemIds` member.

    Control: exactly 3 and exactly 12 hashes parse. Every hash in the case is `itemHash(…)`-shaped (32 lowercase hex, `semantic/signature.ts`'s `itemHash`), so the valid shape is the one the job writes.

    Kills: (a) `.min(3)` → `.min(2)` (b) `.max(12)` → `.max(13)` (c) drop `.strict()` (d) `{64}` → `{63,64}`. One mutant per refused input; the 3 / 12 controls kill `.min(4)` / `.max(11)`.

  `apps/server/migrations/<P3>_suggestions.sql`:
  ```sql
  -- Up Migration

  -- Knowledge Graph spec D §4.1: the suggestion CACHE (written only by src/semantic/suggestion-job.ts, never a
  -- projection), the rejection projection, and the job's nightly bookkeeping.

  CREATE TABLE sem_suggestions (
    id            text PRIMARY KEY,
    workspace_id  text NOT NULL,
    signature     text NOT NULL,
    partition_key text NOT NULL,
    item_kind     text[] NOT NULL,
    item_id       text[] NOT NULL,
    item_hashes   text[] NOT NULL,
    terms         text[] NOT NULL,
    label         text NOT NULL,
    score         real NOT NULL,
    computed_at   timestamptz NOT NULL,
    UNIQUE (workspace_id, signature)
  );
  CREATE INDEX sem_suggestions_items_idx ON sem_suggestions USING gin (item_id);

  CREATE TABLE proj_concept_rejections (
    workspace_id text NOT NULL,
    signature    text NOT NULL,
    item_hashes  text[] NOT NULL,
    rejected_by  text NOT NULL,
    rejected_at  timestamptz NOT NULL,
    origin       text NOT NULL,
    PRIMARY KEY (workspace_id, signature)
  );

  CREATE TABLE sem_job_state (
    workspace_id          text PRIMARY KEY,
    last_nightly_ist_date date
  );

  COMMENT ON TABLE sem_suggestions IS 'CACHE, not a projection (spec D §4.1): the latest suggestion job''s output per workspace, upserted by (workspace_id, signature) so ids are stable across runs. D4 is NOT stored: every read re-checks hiddenItems per reader.';

  -- Down Migration

  DROP TABLE sem_job_state;
  DROP TABLE proj_concept_rejections;
  DROP TABLE sem_suggestions;
  ```
  Purge:
  - `table-rules.ts`:
    - `sem_suggestions: { rule: 'rederive', by: ['workspace_id'], why: 'Rows naming an erased item are deleted by eraseRows; the next job run recomputes (KG-D T5).' }`;
    - `proj_concept_rejections: { rule: 'erase', by: ['workspace_id'], why: 'Hashes only; erased with the workspace.' }`;
    - `sem_job_state: { rule: 'erase', by: ['workspace_id'], why: 'Job bookkeeping; erased with the workspace.' }`.
  - `erasure.ts`: `['DELETE FROM sem_suggestions WHERE item_id && $1::text[] OR item_id && $2::text[]', [T, N]],`.

  `projections/proj-concept-rejections.ts` (shape of `proj-groups.ts`):
  ```ts
  import { suggestionRejectedPayload } from '@gisik-nokma/domain';
  import type { Projection } from './registry.js';

  export const projConceptRejections: Projection = {
    name: 'proj_concept_rejections',
    tables: ['proj_concept_rejections'],
    async apply(event, tx) {
      if (event.type !== 'workspace.concept_suggestion_rejected') return;
      const p = suggestionRejectedPayload.parse(event.payload);
      await tx.query(
        `INSERT INTO proj_concept_rejections (workspace_id, signature, item_hashes, rejected_by, rejected_at, origin)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (workspace_id, signature) DO UPDATE SET item_hashes = EXCLUDED.item_hashes, rejected_by = EXCLUDED.rejected_by,
           rejected_at = EXCLUDED.rejected_at, origin = EXCLUDED.origin`,
        [event.workspaceId, p.signature, p.itemHashes, event.actorId, event.serverTime, event.origin],
      );
    },
    async reset(tx) {
      await tx.query('DELETE FROM proj_concept_rejections');
    },
  };
  ```
  Register it after `projConcepts`, and extend the `projection-order.test.ts` pins.

  **27.485** (`job.test.ts`, its first case): `test/purge/table-rules.test.ts` is green with the three tables, and a rejection applied through `applyCommitted` lands in `proj_concept_rejections` with `rejected_by` = the event's actor, `item_hashes` = the payload's, and `origin` = the event's. Control: `verifyProjections` agrees (`proj_concept_rejections` is in its registry, so a replay that wrote another `rejected_at` would differ).

  Kills: (a) drop `registry.register(projConceptRejections)` (no row) (b) `rejected_at = event.serverTime` → `new Date()` (verify reds) (c) drop the `sem_job_state` row from `table-rules.ts` (`table-rules.test.ts` reds).

  Commit.

- [ ] **Step 3: The job (27.487–27.490), tests first**

  `apps/server/test/semantic/job.test.ts`:
  - Setup: `createTestDatabase`, `seedProject` (P), `seedMember`.
  - Seed tickets with `seedTicket`.
  - Item vectors are written STRAIGHT into `search_item_chunks` with `fakeVector`-style unit vectors (copy `embed-worker.test.ts:52-…`). These cases test the job's database plumbing; Task 1 tests what vectors mean.
  - Use the `twoClusters()` geometry of Task 1's 27.400 at 512 dims, so the clusters are certain.

  - Every "workspace-audience" ticket gets `setVisibilityEnv(WS, id, 'workspace')` after `seedTicket`. `seedTicket` alone writes no `visibility.set`, so the ticket resolves to its project's audience and its key is `p:<P>` (`semantic/partition.ts`, `ticketAudienceKey`), not `'w'`: 27.487's `'w'` leg would be red on correct code (T1's `item-visibility.test.ts` sets `'workspace'` the same way for `TW`).
  - Every case asserts its expected row count EXACTLY (`toHaveLength`), never "no row for X" alone: a job that wrote nothing at all passes every "no row" leg.

  The cases:
  - **27.487** (§7 case 5, at the database level)
    - Four workspace-audience tickets and four tickets explicit `[owner]` (`setVisibilityEnv`) get IDENTICAL vectors and text.
    - `runSuggestionJob` writes exactly two rows: their `partition_key`s, sorted, are `['e:<owner>', 'w']`, each row's `item_id` is exactly its four tickets, and no row mixes ids from both.
    - Control in the same `it`: make all eight workspace-audience and re-run → one row of eight.

    Kills: (a) `partition: ticketKey.get(row.id) ?? 'w'` → `partition: 'w'` (the plan's mutation: one row of eight) (b) the INSERT writes `'w'` for `partition_key` (the key leg reds while the grouping is right).
  - **27.488** Run twice:
    - exactly one row both times, with the same `id` and `signature`;
    - after one ticket's vector moves out of the cluster (three remain, `SUGGESTION_MIN_SIZE`) and the job re-runs, exactly one row: the old signature's row is gone and the new one's `item_id` is the three.

    Kills: (a) `ON CONFLICT … DO UPDATE SET …` gains `id = EXCLUDED.id` (the id moves) (b) drop the `DELETE FROM sem_suggestions WHERE … NOT (signature = ANY …)` (two rows after the move) (c) replace the upsert with DELETE-all + INSERT (a fresh `newUlid()` every run).
  - **27.489** Rejections:
    - Two clusters R and Q (four items each, far apart). After a rejection of row R (`workspace.concept_suggestion_rejected` with R's signature and hashes, through `applyCommitted`), the re-run writes exactly one row, Q (so the job still produces; the R leg is not "the job wrote nothing").
    - Same `it`: a rejection of Q's signature and hashes filed in a SECOND workspace does not suppress Q here.
    - Control in the same `it`: replace 3 of R's 4 items with 3 new items, so the overlap is 1/7. The re-run writes it again (two rows).

    Kills: (a) pass no `rejected` to `suggestAll` (R is written) (b) the rejections query loses `WHERE workspace_id = $1` (Q is suppressed). The control guards Task 1's `changedByMoreThanHalf` at the database level; no mutant of this task's code reaches it.
  - **27.490** A concept tagging 2 of a community's 4 items (`proj_concept_items` via `applyCommitted` of `concept.created` + tags) suppresses the suggestion (0 rows). Control: 1 of 4 does not (1 row). Same `it`: a DELETED concept tagging 2 of 4 does not suppress it (1 row).

    Kills: (a) `conceptsOf: (key) => conceptsByItem.get(key) ?? []` → `() => []` (b) the tags query drops `AND c.deleted = FALSE` (the deleted-concept leg reds) (c) the tags query drops `WHERE i.workspace_id = $1` — not killed here (one workspace); recorded.

  `apps/server/src/semantic/suggestion-job.ts`:
  ```ts
  import type { Pool } from 'pg';
  import { newUlid } from '@gisik-nokma/domain';
  import { SUGGESTION_K, SUGGESTION_MAX_SIZE, SUGGESTION_MIN_SIZE, SUGGESTION_SEED, SUGGESTION_TAU } from './constants.js';
  import { noteAudienceKey, ticketAudienceKey } from './partition.js';
  import { suggestAll, type PipelineItem } from './pipeline.js';
  import { itemKey, parseItemKey } from './signature.js';
  import { meanUnit } from './vectors.js';
  import { LIVE_TICKET_WHERE } from '../read/visible-where.js';

  /** pgvector's text form `[1,2,3]` → a Float32Array. */
  function parseVector(text: string): Float32Array {
    return Float32Array.from(text.slice(1, -1).split(',').map(Number));
  }

  /**
   * Spec D §4.1, for one workspace. Reads the item vectors the embed worker wrote (mean of chunks), partitions by
   * audience, runs the pure pipeline, and REPLACES the workspace's `sem_suggestions` rows in one transaction,
   * upserting by signature so a surviving suggestion keeps its id.
   */
  export async function runSuggestionJob(pool: Pool, workspaceId: string, options: { now?: Date } = {}): Promise<{ suggestions: number; items: number; ms: number }> {
    const started = performance.now();
    const tickets = await pool.query<{ id: string; v: string; text: string; resolved_mode: 'workspace' | 'project' | 'explicit'; project_id: string; resolved_user_ids: string[] }>(
      `SELECT t.ticket_id AS id, avg(c.embedding)::text AS v, string_agg(c.chunk_text, ' ' ORDER BY c.item_kind DESC, c.chunk_index) AS text,
              v.resolved_mode, v.project_id, v.resolved_user_ids
         FROM search_item_chunks c
         JOIN proj_tickets t ON t.ticket_id = c.ticket_id
         JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE c.workspace_id = $1 AND c.chunk_text <> '' AND ${LIVE_TICKET_WHERE}
        GROUP BY t.ticket_id, v.resolved_mode, v.project_id, v.resolved_user_ids`,
      [workspaceId],
    );
    const ticketKey = new Map(tickets.rows.map((row) => [row.id, ticketAudienceKey({ resolvedMode: row.resolved_mode, projectId: row.project_id, resolvedUserIds: row.resolved_user_ids })]));
    const notes = await pool.query<{ id: string; v: string; text: string; scope_mode: string; author_id: string; home_project_id: string; scope_user_ids: string[]; attached: string[] }>(
      `SELECT n.note_id AS id, avg(c.embedding)::text AS v, string_agg(c.chunk_text, ' ' ORDER BY c.chunk_index) AS text,
              n.scope_mode, n.author_id, n.home_project_id, n.scope_user_ids,
              coalesce((SELECT array_agg(a.ticket_id) FROM proj_note_attachments a WHERE a.note_id = n.note_id), '{}') AS attached
         FROM search_note_chunks c JOIN proj_notes n ON n.note_id = c.note_id
        WHERE c.workspace_id = $1 AND n.deleted = FALSE
        GROUP BY n.note_id`,
      [workspaceId],
    );
    const items: PipelineItem[] = [
      ...tickets.rows.map((row) => ({ key: itemKey('ticket', row.id), partition: ticketKey.get(row.id) ?? 'w', vector: meanUnit([parseVector(row.v)]), text: row.text })),
      ...notes.rows.map((row) => ({
        key: itemKey('note', row.id),
        partition: noteAudienceKey({
          scopeMode: row.scope_mode as Parameters<typeof noteAudienceKey>[0]['scopeMode'],
          authorId: row.author_id,
          homeProjectId: row.home_project_id,
          scopeUserIds: row.scope_user_ids,
          inheritedKeys: row.attached.flatMap((ticketId) => { const k = ticketKey.get(ticketId); return k === undefined ? [] : [k]; }),
        }),
        vector: meanUnit([parseVector(row.v)]),
        text: row.text,
      })),
    ];
    const tags = await pool.query<{ item_kind: 'ticket' | 'note'; item_id: string; concept_id: string }>(
      `SELECT i.item_kind, i.item_id, i.concept_id FROM proj_concept_items i JOIN proj_concepts c ON c.concept_id = i.concept_id
        WHERE i.workspace_id = $1 AND c.deleted = FALSE`,
      [workspaceId],
    );
    const conceptsByItem = new Map<string, string[]>();
    for (const row of tags.rows) conceptsByItem.set(itemKey(row.item_kind, row.item_id), [...(conceptsByItem.get(itemKey(row.item_kind, row.item_id)) ?? []), row.concept_id]);
    const rejected = (await pool.query<{ item_hashes: string[] }>('SELECT item_hashes FROM proj_concept_rejections WHERE workspace_id = $1', [workspaceId]))
      .rows.map((row) => ({ itemHashes: row.item_hashes }));

    const suggestions = suggestAll(items, {
      k: SUGGESTION_K, tau: SUGGESTION_TAU, seed: SUGGESTION_SEED, minSize: SUGGESTION_MIN_SIZE, maxSize: SUGGESTION_MAX_SIZE,
      conceptsOf: (key) => conceptsByItem.get(key) ?? [], rejected,
    });

    const now = options.now ?? new Date();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM sem_suggestions WHERE workspace_id = $1 AND NOT (signature = ANY ($2::text[]))', [workspaceId, suggestions.map((s) => s.signature)]);
      for (const s of suggestions) {
        const refs = s.itemKeys.map(parseItemKey);
        await client.query(
          `INSERT INTO sem_suggestions (id, workspace_id, signature, partition_key, item_kind, item_id, item_hashes, terms, label, score, computed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (workspace_id, signature) DO UPDATE SET terms = EXCLUDED.terms, label = EXCLUDED.label, score = EXCLUDED.score, computed_at = EXCLUDED.computed_at`,
          [newUlid(), workspaceId, s.signature, s.partition, refs.map((r) => r.kind), refs.map((r) => r.id), s.itemHashes, s.terms, s.label, s.score, now],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return { suggestions: suggestions.length, items: items.length, ms: performance.now() - started };
  }
  ```
  `pipeline.ts` uses `rejected` and `conceptsOf` exactly as Task 1 wrote them. The rejection hashes are `itemHash(itemKey)` (Task 1's `signature.ts`) on both sides, so they compare.

  Run the file. Expected: PASS.

  Mutation: drop `partition:` (use `'w'` for everything) → 27.487 reds.

  Commit.

- [ ] **Step 4: The scheduler (27.491)**

  `apps/server/src/semantic/scheduler.ts`:
  ```ts
  import type { Pool } from 'pg';
  import { runSuggestionJob } from './suggestion-job.js';

  export const CHANGES_BEFORE_RUN = 200;
  export const CHANGE_DEBOUNCE_MS = 10 * 60 * 1000;
  export const NIGHTLY_IST_HOUR = 2;
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

  /** The IST calendar date (YYYY-MM-DD) and hour of an instant. */
  export function istClock(at: Date): { date: string; hour: number } {
    const shifted = new Date(at.getTime() + IST_OFFSET_MS);
    return { date: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
  }

  /**
   * Spec D §4.1 "When it runs": nightly, and after 200 item changes in a workspace, debounced 10 minutes. `tick`
   * is the hourly check for the nightly run (once per IST date per workspace, recorded in `sem_job_state`).
   * Failures are logged and swallowed, as the embed worker's are (`embed-worker.ts:209-216`).
   */
  export function startSuggestionScheduler(
    pool: Pool,
    options: { log?: (msg: string) => void; now?: () => Date; runJob?: typeof runSuggestionJob } = {},
  ): { change(workspaceId: string): void; stop(): void; tick(): Promise<void> } {
    const log = options.log ?? ((): undefined => undefined);
    const now = options.now ?? (() => new Date());
    const runJob = options.runJob ?? runSuggestionJob;
    const counts = new Map<string, number>();
    const timers = new Map<string, NodeJS.Timeout>();
    const run = async (workspaceId: string): Promise<void> => {
      try {
        await runJob(pool, workspaceId, { now: now() });
      } catch (error) {
        log(`suggestion job failed for ${workspaceId}: ${String(error)}`);
      }
    };
    async function tick(): Promise<void> {
      const { date, hour } = istClock(now());
      if (hour !== NIGHTLY_IST_HOUR) return;
      const due = await pool.query<{ workspace_id: string }>(
        `SELECT w.workspace_id FROM proj_workspaces w
           LEFT JOIN sem_job_state s ON s.workspace_id = w.workspace_id
          WHERE w.deleted_at IS NULL AND NOT w.archived
            AND (s.last_nightly_ist_date IS NULL OR s.last_nightly_ist_date < $1::date)`,
        [date],
      );
      for (const { workspace_id: workspaceId } of due.rows) {
        await run(workspaceId);
        await pool.query(
          `INSERT INTO sem_job_state (workspace_id, last_nightly_ist_date) VALUES ($1, $2::date)
           ON CONFLICT (workspace_id) DO UPDATE SET last_nightly_ist_date = EXCLUDED.last_nightly_ist_date`,
          [workspaceId, date],
        );
      }
    }
    const hourly = setInterval(() => { void tick(); }, 60 * 60 * 1000);
    hourly.unref();
    return {
      change(workspaceId) {
        const count = (counts.get(workspaceId) ?? 0) + 1;
        counts.set(workspaceId, count);
        if (count < CHANGES_BEFORE_RUN) return;
        const existing = timers.get(workspaceId);
        if (existing !== undefined) clearTimeout(existing);
        const timer = setTimeout(() => {
          timers.delete(workspaceId);
          counts.set(workspaceId, 0);
          void run(workspaceId);
        }, CHANGE_DEBOUNCE_MS);
        timer.unref();
        timers.set(workspaceId, timer);
      },
      stop() {
        clearInterval(hourly);
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
      },
      tick,
    };
  }
  ```
  - `proj_workspaces (workspace_id, archived, deleted_at, …)` (`migrations/1790500000000_lifecycle.sql:6-13`). The nightly run skips deleted and archived workspaces: nobody curates them.

  Wiring:
  - `index.ts`, after `:335` (the end of the `nudgeEmbedWorker = …` assignment; cite corrected from `:328`, which is inside `startEmbedWorker(…)`'s argument list): `const suggestionScheduler = embedWorker === null ? null : startSuggestionScheduler(pool, { log: (msg) => { app.log.warn(msg); } });`. Add its `stop()` beside `embedWorker?.stop()` (`:336-338`, corrected from `:335-337`).
  - Pass `onSemanticChange: (workspaceId) => suggestionScheduler?.change(workspaceId)` into `buildApp`'s deps, the way `nudgeEmbedWorker` reaches `onNoteBodyCommitted`. Re-read that hand-off and copy it.
  - `app.ts:1161-1169` (corrected from `:1158-1166`): in the same subscription, `if ((nudgesEmbedding(event) || nudgesItemEmbedding(event)) && deps.onSemanticChange !== undefined) deps.onSemanticChange(event.workspaceId);`. Register the subscription when EITHER callback is supplied.

  `apps/server/test/semantic/scheduler.test.ts`, **27.491**:
  - Fake timers. A `runJob` spy, and `now` pinned.
  - 199 `change('W')` calls → no run after 11 minutes.
  - The 200th → no run at 9 minutes, one run at 10.
  - Another change at 5 minutes re-arms (no run at 10, one at 15).
  - After that run, 199 more `change('W')` calls → no run after 11 more minutes (the counter was reset).
  - `tick()`:
    - at 01:59 IST → no run;
    - at 02:10 IST → one run per workspace: the `runJob` spy's workspace ids, sorted, equal the two live workspaces exactly;
    - again at 02:40 the same date → none (the `sem_job_state` row);
    - at 02:10 IST the NEXT date → one run per workspace again;
    - a third workspace, ARCHIVED, and a fourth, DELETED, are never in the spy's ids.

  Control: `change('V')` 200 times does not run `'W'`. The `tick` half needs a database; put it in its own `it` with `createTestDatabase` and two seeded workspaces (plus the archived and the deleted one).

  Kills: (a) `if (count < CHANGES_BEFORE_RUN) return;` → `<=` (the 200th does not arm) (b) drop `clearTimeout(existing)` (the re-arm leg runs at 10) (c) drop `counts.set(workspaceId, 0)` in the timer (the 199-more leg runs) (d) `IST_OFFSET_MS` → `5 * 60 * 60 * 1000` (02:10 IST reads as hour 1: no run) (e) `last_nightly_ist_date < $1::date` dropped from the OR (the next-date leg does not run) (f) drop `AND NOT w.archived`. The control kills a single shared counter (`counts` keyed by nothing).

  Commit.

- [ ] **Step 5: The read, the door, the census (27.492–27.497)**

  `apps/server/src/routes/suggestions.ts`. The sibling is `routes/groups.ts` (the guest → 404 shape, `:16-18` of its body).
  ```ts
  app.get<{ Params: { workspaceId: string } }>('/v1/workspaces/:workspaceId/suggestions', { preHandler: requireSession }, async (request, reply) => {
    const { workspaceId } = request.params;
    const eff = await requireMember(deps.pool, request.currentUserId, workspaceId);
    if (eff === null || eff.workspaceRole === 'guest') return reply.code(404).send(READ_NOT_FOUND_BODY);
    const { rows } = await deps.pool.query<{ id: string; signature: string; label: string; terms: string[]; score: number; computed_at: Date; item_kind: ('ticket' | 'note')[]; item_id: string[]; item_hashes: string[] }>(
      `SELECT id, signature, label, terms, score, computed_at, item_kind, item_id, item_hashes
         FROM sem_suggestions WHERE workspace_id = $1 ORDER BY score DESC, id`,
      [workspaceId],
    );
    const all = rows.flatMap((row) => row.item_id.map((id, index) => ({ kind: row.item_kind[index] as 'ticket' | 'note', id })));
    const hidden = new Set((await hiddenItems(deps.pool, eff, request.currentUserId, workspaceId, all)).map((item) => `${item.kind}:${item.id}`));
    const labels = await itemLabels(deps.pool, workspaceId, all); // the label helper Task 4's readConceptView uses: export it from read/concepts.ts
    const suggestions: SuggestionView[] = rows
      .filter((row) => row.item_id.every((id, index) => !hidden.has(`${String(row.item_kind[index])}:${id}`)))
      .map((row) => ({
        id: row.id, signature: row.signature, label: row.label, terms: row.terms, score: Number(row.score), itemHashes: row.item_hashes,
        computedAt: row.computed_at.toISOString(),
        items: row.item_id.map((id, index) => ({ kind: row.item_kind[index] as 'ticket' | 'note', id, label: labels.get(`${String(row.item_kind[index])}:${id}`) ?? '' })),
      }));
    const body: SuggestionListResponse = { workspaceId, suggestions };
    return body;
  });
  ```
  - Export Task 4's item-label helper as `itemLabels(db, workspaceId, items): Promise<Map<string, string>>` from `read/concepts.ts`, if Task 4 wrote it inline.
  - A trashed item is not in `hiddenItems`' answer and still has a row. The job's next run drops it, because the job reads live items only.

  The door, in `check-concept.ts`:
  ```ts
  export const SUGGESTION_UNKNOWN_REASON = 'That suggestion does not exist or you cannot see it.';

  /** The suggestion with this signature (or id) in the cache, if every one of its live items is visible to the actor. */
  async function seesSuggestion(db: Queryable, ctx: VisibilityContext, workspaceId: string, where: { signature?: string; id?: string }): Promise<boolean> {
    const { rows } = await db.query<{ item_kind: ('ticket' | 'note')[]; item_id: string[] }>(
      'SELECT item_kind, item_id FROM sem_suggestions WHERE workspace_id = $1 AND (signature = $2 OR id = $3)',
      [workspaceId, where.signature ?? null, where.id ?? null],
    );
    const row = rows[0];
    if (row === undefined) return false;
    const items = row.item_id.map((id, index) => ({ kind: row.item_kind[index] as 'ticket' | 'note', id }));
    return (await hiddenItems(db, ctx.eff, ctx.sessionUserId, workspaceId, items)).length === 0;
  }

  /** `workspace.concept_suggestion_rejected` (spec D §4.2/§4.3): members who see every item of the suggestion. */
  export async function checkSuggestionRejection(env: EventEnvelope, ctx: VisibilityContext): Promise<Refusal | null> {
    if (env.type !== 'workspace.concept_suggestion_rejected') return null;
    if (ctx.eff.workspaceRole === 'guest') return refuse(CONCEPT_RULES.permission, CONCEPT_GUEST_REASON);
    const p = suggestionRejectedPayload.parse(env.payload);
    return (await seesSuggestion(ctx.db, ctx, env.workspaceId, { signature: p.signature })) ? null : refuse('suggestion.unknown', SUGGESTION_UNKNOWN_REASON);
  }
  ```
  - In `checkConceptPermission`, change the `concept.created` arm to:
    ```ts
    if (type === 'concept.created') {
      const p = conceptCreatedPayload.parse(env.payload);
      if (p.fromSuggestion !== undefined && !(await seesSuggestion(ctx.db, ctx, ws, { id: p.fromSuggestion }))) return refuse('suggestion.unknown', SUGGESTION_UNKNOWN_REASON);
      return null;
    }
    ```
  - `check-permission.ts`: call `checkSuggestionRejection` directly after `checkConceptPermission`.
  - `history-copy.ts`, before `default:`: `case 'workspace.concept_suggestion_rejected': return 'Rejected a suggested concept';`.

  `apps/server/test/semantic/suggestions-route.test.ts`:
  - Setup: `seedNotesFixture`, then rows inserted straight into `sem_suggestions`:
    - S1 = {TP, nProject, nWorkspace};
    - S2 = {nWorkspace, nExplicit, TE}.
  - **Who sees S1 and S2 on the ref** (Rule A, accepted by planner ruling 2026-10-04 (report Q1)): S1 = {TP, nProject, nWorkspace} is read by every non-guest (every member is on every founded project, `effective-role.ts:5-19`), so `memberOut` SEES S1. S2 = {nWorkspace, nExplicit, TE} is read by the owner alone (TE and nExplicit are explicit `[guestListed]`, nExplicit's author arm admits `author`, and `guestListed` does not read nWorkspace). The plan's legs that used `memberOut` as the reader who cannot see S1 are rebound to S2 below, as T1's lane did (`test/read/item-visibility.test.ts:16-19`).
  - The cases:
    - **27.492** As `memberIn`, the list includes S1 and NOT S2. As `memberOut` it includes S1 too (the Rule A control; the plan's leg "as `memberOut` it does not (TP hidden)" was red on correct code). As `guestListed` → 404.
      - Control: the owner's list includes S1 AND S2 (so S2's absence for `memberIn` is about the reader, not the row).
      - Same `it`: the list for EVERY non-guest user equals the agreement with `hiddenItems`.

      Kills: (a) drop the `.filter((row) => row.item_id.every(…))` (S2 reaches `memberIn`) (b) `.every` → `.some` (S2 reaches `memberIn`: it reads nWorkspace) (c) drop `|| eff.workspaceRole === 'guest'` from the 404 line.
    - **27.493**
      - `memberIn` rejecting S1 (through `checkPermission`, `makeEnvelope` on `{ kind: 'workspace', id: WS }`) is admitted.
      - `memberIn` rejecting S2 → `suggestion.unknown`, with the SAME reason as a made-up signature; the owner rejecting S2 is admitted. (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan's refused subject was `memberOut` on S1, which `memberOut` sees on the ref.)
      - `guestListed` → `permission.concept`.

      Kills: (a) `seesSuggestion` skips `hiddenItems` (returns `true` once the row exists: S2 is admitted) (b) drop the guest line from `checkSuggestionRejection` (the guest gets `suggestion.unknown` instead) (c) not wiring `checkSuggestionRejection` into `check-permission.ts` (every leg is admitted).
    - **27.494** (Review Focus 2) TX is explicit `[owner]` and assigned to `memberOut`; S3 = {TX, nWorkspace, nProject…}, a set `memberOut` sees (Rule A gives `memberOut` nProject; TX comes through the assignee arm).
      - `memberOut`'s list includes S3, although S3's `partition_key` names only the owner.
      - After TX is reassigned, it does not.
      - Control: `memberIn` (never assigned) never sees S3.

      Kills: (a) the route keeps a row only when the reader is in its `partition_key` (the first leg reds) (b) the route memoises `hiddenItems` per suggestion id (the reassignment leg reds).
    - **27.495**
      - `concept.created {fromSuggestion: <random ULID>}` → `suggestion.unknown`.
      - `{fromSuggestion: S1.id}` as `memberIn` → admitted.
      - `{fromSuggestion: S2.id}` as `memberIn` → `suggestion.unknown`; as the owner → admitted. (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan's refused subject was `memberOut` on S1.)

      Kills: (a) drop the `fromSuggestion` check from the `concept.created` arm (b) `seesSuggestion` skips `hiddenItems` (c) `{ id: p.fromSuggestion }` → `{ signature: p.fromSuggestion }` (S1.id is then unknown: the admitted leg reds).
    - **27.496**
      - Before the rejection, apply a `concept.created` and a tag (any concept) so the raw stream holds `concept.*` events: assert `SELECT count(*) FROM events WHERE entity_kind = 'concept'` ≥ 2 first. Without it the control below has nothing to withhold.
      - The rejection applied through ingest (`buildTestApp` + the events route) lands in `proj_concept_rejections`.
      - `visibleEventsFor` yields it to `memberIn` with a payload of exactly `{ signature, itemHashes }`, and no key holds an item id.
      - Control: no `concept.*` event is yielded (27.454 still holds).

      Kills: (a) drop `registry.register(projConceptRejections)` (b) register the type with `entityKind: 'concept'` (ingest refuses the workspace-entity envelope as a misfiled kind; the landing leg reds). The payload and stream legs guard existing behaviour: the strict schema (27.486) and `audienceClassOf`'s `'workspace'` arm.
    - **27.497**
      - `describeEvent` renders `'Rejected a suggested concept'`.
      - The census: the registered types starting `workspace.concept_` are exactly `['workspace.concept_suggestion_rejected']` (asserted first, so the loop is not over an empty list), and for each the door has an arm (a guest is refused with `permission.concept`).

      Control: `workspace.renamed` by a guest is still refused by its own rule (`permission.role`).

      Kills: (a) drop the `history-copy.ts` arm (b) drop the guest line from `checkSuggestionRejection` (c) a second `workspace.concept_*` type registered without a door arm (the census list reds).

  Run the files, `test/permissions/` and `test/concepts/` (`--maxWorkers=2`, logged). Expected: PASS.

  Commit.

- [ ] **Step 6: MCP `review_suggestions` and `resolve_suggestion` (27.498–27.500)**

  In `concept-tools.ts`, append to the array:
  ```ts
  {
    name: 'review_suggestions',
    description:
      'Concepts the model SUGGESTS for a workspace: groups of tickets and notes that read alike, each with a provisional ' +
      'label from its most distinctive words. Only suggestions whose items you can all see. Accept or reject one with resolve_suggestion.',
    inputSchema: { workspaceId: id, ...pageArgs },
    handler: async (args) => {
      const a = z.object({ workspaceId: id, ...pageArgs }).parse(args);
      const body = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/suggestions`, 'workspace')) as SuggestionListResponse;
      const { items, nextCursor } = page(body.suggestions, a.cursor, a.limit);
      return { workspaceId: body.workspaceId, suggestions: items, nextCursor };
    },
  },
  {
    name: 'resolve_suggestion',
    description:
      'accept (name, summary?) makes the suggestion a concept with its items tagged; if an item cannot be tagged, the ' +
      'concept is still made and the error names that item\'s index; reject records that this group is ' +
      'not a concept, and it will not be suggested again unless more than half of it changes.',
    inputSchema: resolveShape,
    handler: async (args) => {
      const a = z.object(resolveShape).parse(args);
      const body = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/suggestions`, 'workspace')) as SuggestionListResponse;
      const s = body.suggestions.find((x) => x.id === a.suggestionId);
      if (s === undefined) throw new Error('suggestion not found or not visible to you');
      if (a.action === 'reject') {
        return submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'workspace', id: a.workspaceId }, 'workspace.concept_suggestion_rejected', { signature: s.signature, itemHashes: s.itemHashes }));
      }
      if (a.name === undefined) throw new Error('accept needs name');
      const conceptId = newUlid();
      return submitBatch(session, [
        ev(a.workspaceId, conceptId, 'concept.created', { name: a.name, fromSuggestion: s.id, ...(a.summary === undefined ? {} : { summary: a.summary }) }),
        ...s.items.map((item) => ev(a.workspaceId, conceptId, 'concept.item_tagged', { itemKind: item.kind, itemId: item.id })),
      ]);
    },
  },
  ```
  - Add `const resolveShape = { workspaceId: id, suggestionId: id, action: z.enum(['accept', 'reject']), name: z.string().min(1).optional(), summary: z.string().max(2000).optional() };` beside the other shapes, and import `SuggestionListResponse`.
  - Update `tool-names.ts` (`concept` block), `tool-sweep.ts` and `register.test.ts` FINAL.

  Tests:
  - **27.498** (`suggestion-tools.test.ts`, fake Session; the fake suggestion has THREE items):
    - `review_suggestions` GETs exactly `/v1/workspaces/w/suggestions` and pages (three suggestions, `limit: 2` → two and a non-null `nextCursor`).
    - `resolve_suggestion accept {name}` posts ONE batch (one `postEvents` call): `concept.created {name, fromSuggestion}` followed by one `concept.item_tagged` per item (three, in the suggestion's order, payloads `{ itemKind, itemId }` exactly), all on the same concept id, all `origin: 'mcp'`.
    - `reject` posts `workspace.concept_suggestion_rejected` on `{ kind: 'workspace', id: w }` with payload exactly `{ signature, itemHashes }` from the fake suggestion.
    - An unknown `suggestionId` → `suggestion not found or not visible to you`.
    - Control: `accept` without `name` → `accept needs name`, and nothing is posted.
    - A batch is not atomic (`apps/server/src/ingest/ingest-service.ts:56-64`). A refused tag at index 2 throws `event 2 refused by …` (`submitBatch`, `submit.ts:49`) while the concept and the first tag stay committed: visible, attributed and removable, so D2 holds. The tool description says so (the literal above): assert it contains `the concept is still made`.

    Kills: (a) `ev(a.workspaceId, conceptId, …)` → `ev(a.workspaceId, newUlid(), …)` for the tags (three different ids) (b) the reject payload drops `itemHashes` (c) `submitBatch([...])` → `submitOne` for the create, then `submitBatch` for the tags (two `postEvents` calls).
  - **27.499** (`suggestion-e2e.test.ts`, the real server, as 27.480):
    - The suggestion must come from the JOB, or the re-run leg cannot fail: a row inserted straight into `sem_suggestions` (as Step 5's S1 is) has no item vectors behind it, so `runSuggestionJob` writes no such signature with or without the concept. So: write IDENTICAL vectors straight into `search_item_chunks` / `search_note_chunks` (as 27.487 does) for three items of ONE partition that `memberIn` reads — TP, a second project ticket TP2 and nProject, all `p:<P>` (`ticketAudienceKey` / `noteAudienceKey`) — run the job, and assert it wrote exactly that one row, with `signature === signatureOf(['note:<nProject>', 'ticket:<TP>', 'ticket:<TP2>'])`. (S1 itself, {TP, nProject, nWorkspace}, spans `p:<P>` and `'w'`: the job can never produce it.)
    - `memberIn` accepts that suggestion. The concept exists with its three items, `from_suggestion` = its id, and every item row has `origin 'mcp'`. That proves the batch's second event sees the first's projection at the door.
    - A re-run of `runSuggestionJob` no longer writes that signature (≥ 50% tagged): zero rows for the workspace.

    Kills: (a) the job's tags query returns nothing (`conceptsOf: () => []`; the re-run writes the row again) (b) `resolve_suggestion` tags the items onto `s.id` instead of the new `conceptId` (the door answers `concept.unknown`; no item rows) (c) `resolve_suggestion` omits `fromSuggestion` (the column is NULL).
  - **27.500** FINAL and `TOOL_NAMES` include the two names after `link_concepts`. Control: in `allTools(…)`, `review_suggestions` sits at `indexOf('link_concepts') + 1` and `resolve_suggestion` at `+ 2` (the plan's control, "the length equals the literal's count", compared the literal with itself).

    Kills: (a) append the two tools to `concept-tools.ts`'s array BEFORE `link_concepts` (b) add them to `register.test.ts`'s FINAL and `tool-names.ts` but not to `concept-tools.ts`.

  Run the mcp-server suite, the server `test/mcp/` and `test/semantic/` (logged). Expected: PASS.

  **Prose to sweep:** (all of Task 5; fix each in the commit of the step named)
  - [Step 4] `apps/server/src/app.ts:1157-1160` — "Registered ONLY when the caller supplied the callback". After Step 4 it is registered when EITHER callback is supplied; say so.
  - [Step 4] `apps/server/src/app.ts:188-190` — `onNoteBodyCommitted` is the listener's one callback (Task 2 already widens its list); `onSemanticChange` joins it on the same subscription. Its new docblock and this one must agree on which events reach which.
  - [Step 4] `apps/server/src/config.ts:171` — "Search keeps answering lexically; only `mode=meaning` goes stale" — and `apps/server/src/index.ts:316-319` — "serves the whole product except `mode=meaning` search". With `EMBED_WORKER_ENABLED=false` the suggestion job never starts (`suggestionScheduler` is `null`), so suggestions stop too.
  - [Step 2] `apps/server/test/projection-order.test.ts:75` — the pinned-order title; `proj_concept_rejections` follows `proj_concepts`.
  - [Step 5] `apps/server/src/permissions/check-permission.ts:1899-1910` — the pass list (Task 3's sweep); `checkSuggestionRejection` is one more pass.
  - [Step 6] `packages/mcp-server/test/register.test.ts:87`, `:103`; `test-cases/14-mcp-server.md:938`; `Features.md:3454` ("Sixty-three tools in both doors") and `Features.md:3407` ("sixty-three since MCP-everything") — the tool count, two more.
  - Searched with no other hit: `docs/manual.md` (`suggest`), `Features.md` and `test-cases/` (`suggestion`, outside §24 D / §27.D).

  Commit.

- [ ] **Step 7: Features, flips, battery**
  - Flip 27.485–27.500 ✅.
  - Features §24 D, under `<!-- D T5 -->`:
    - `⚙️ Suggestion job: per-audience kNN + Louvain + TF-IDF labels into sem_suggestions; nightly 02:00 IST and after 200 changes (10 min debounce) — apps/server/src/semantic/suggestion-job.ts, scheduler.ts`
    - `✅ Suggestions API and MCP review_suggestions / resolve_suggestion; D4 per reader; rejection by hashes on the workspace stream — apps/server/src/routes/suggestions.ts`
  - Server WHOLE (the door, the projection registry and app wiring changed). Then mcp-server, domain, app-core (history-copy); `check:*`. LOCAL. Push, then DONE.

### Task 6: Graph query tools — the concept arm in the ring read, `graph/path`, `graph/trace`, MCP `graph_neighbours` / `graph_path` / `graph_trace` (cases 27.505–27.514)

**Spec:** §5.1 (`graph_neighbours`, `graph_path`, `graph_trace`), §5.2 "Switch", §7 cases 7 and 9 (MCP half).

**Needs merged first:**
- Tasks 2 and 4 (and Task 5 for the suggestion arm; without Task 5, ship the concept arm and leave 27.507 ❌ until 5 lands);
- **plan C Task 1** (`apps/server/src/read/graph-neighbours.ts`: `readGraphRing`, `createGraphVisibility`, `GraphRingRequest`), **plan C Task 2** (`packages/knowledge-graph/src/engine/sentences.ts`: `edgeSentence`, `relation`) and **plan C Task 6** (`apps/server/src/routes/graph.ts`, `GET /v1/graph/neighbours?center&hops&ws&proj&groups&cursor`);
- **plan A**'s `proj_ticket_links (workspace_id, source_id, target_id, kind, created_by, created_at, origin, seq)` (spec A §2.5);
- **plan B**'s `proj_references (…, source_parent_kind, source_parent_id, target_kind, target_id, snippet, …)` (plan B's migration). Plan C's read selects a `source_ticket` column from it. Re-read the table as LANDED before writing the `ref` trace and use the landed names.

**Decisions this task makes:**
- **G10: move the sentences into domain.** The server and `@gisik-nokma/mcp-server` must write the same sentences the app draws (§5.1 "items + edges + sentences"). Plan C puts them in `packages/knowledge-graph/src/engine/sentences.ts`, whose package index also exports React and Sigma code: the wrong dependency for a server.
  - The file imports only domain types and `Intl`. This task MOVES it to `packages/domain/src/graph-sentences.ts`.
  - `packages/knowledge-graph/src/engine/sentences.ts` becomes `export * from '@gisik-nokma/domain/…'` (or the named re-exports), so plan C's 27.232–27.235 run unchanged against the moved code.
- **The path read** BFS-es over plan C's `expand` and `resolve`. `readGraphRing` recomputes rings 1..h on every call and returns only the last, which cannot give a path's middle.
  - `expand` is module-private in plan C's file. This task exports it as-is, one word.
  - Up to 3 shortest paths; a hidden item ends that branch (`resolve` drops it, so no edge reaches it).
- **The trace read:**
  - `parent` with `out` walks UP (subtask → parent → …), and `in` walks DOWN;
  - `blocks` / `duplicates` with `out` follow `source → target`;
  - `ref` with `out` follows "this item's text links to".

  A hidden or out-of-workspace node ends the chain there and is not returned. A cycle ends at the first repeat.
- **Workspaces.** `graph_neighbours` with no `scope` uses every workspace the session can see (`readDirectory`, as `member-admin-tools.ts:21-25` does), because plan C's endpoint requires `ws`.

**Files:**
- Create:
  - `packages/domain/src/graph-sentences.ts` (moved)
  - `apps/server/src/read/graph-trace.ts`
  - `apps/server/src/read/graph-path.ts`
  - `apps/server/src/routes/graph-query.ts`
  - `apps/server/test/graph/concept-arm.test.ts` (27.506–27.507)
  - `apps/server/test/graph/path-trace.test.ts` (27.508–27.510)
  - `packages/mcp-server/test/graph-tools.test.ts` (extend; 27.511–27.514)
- Modify:
  - `packages/knowledge-graph/src/engine/sentences.ts` (now a re-export), `packages/domain/src/index.ts`;
  - `apps/server/src/read/graph-neighbours.ts`: export `expand` as `expandGraph`; a concept and suggestion resolver at the end of `resolve` (plan C left the line `return out; // concepts: spec D adds a resolver; until then none resolve`); a `tag` arm in `expand` when `groups.has('concepts')`;
  - `apps/server/src/app.ts`: `registerGraphQueryRoutes`;
  - `packages/mcp-server/src/tools/graph-tools.ts`: three tools before `similar`;
  - the tool-name and sweep fixtures and FINAL.

**Interfaces:**
- **Produces:**
  - `GET /v1/graph/path?from=<ref>&to=<ref>&maxHops=<1..6>[&groups=g,…]` → `GraphPathResponse = { from: string; to: string; paths: Array<{ refs: string[]; edges: GraphEdgeView[]; sentences: string[] }>; items: GraphItemView[] }`;
  - `GET /v1/graph/trace?from=<ref>&kind=blocks|parent|duplicates|ref&direction=out|in&maxDepth=<1..10>` → `GraphTraceResponse = { from: string; kind; direction; chain: Array<{ ref: string; depth: number; via: string }>; items: GraphItemView[]; sentences: string[] }`. Both are domain types in `graph-sentences.ts`'s sibling `graph-query.ts`.
  - The MCP tools `graph_neighbours`, `graph_path`, `graph_trace`.
- **Consumes:**
  - plan C: `createGraphVisibility(db, viewerId).resolve(refs)`, `expand(db, frontier, groups)`, `GraphItemView`, `GraphEdgeView`, `graphRef`, `parseGraphRef`, `GRAPH_GROUPS`, `edgeSentence(edge, labelOf)`;
  - Task 4: `visibleConceptIds`;
  - Task 5: `sem_suggestions` and `hiddenItems`.

- [ ] **Step 1: Catalogue**

  Under `<!-- D T6 -->`, add 27.505–27.514 ❌.

- [ ] **Step 2: Move the sentences (27.505)**
  - `git mv packages/knowledge-graph/src/engine/sentences.ts packages/domain/src/graph-sentences.ts`. Fix its import to `./graph.js` (plan C's `packages/domain/src/graph.ts` holds `GraphEdgeView`).
  - Add `export * from './graph-sentences.js';` to `packages/domain/src/index.ts`.
  - Recreate `packages/knowledge-graph/src/engine/sentences.ts`:
    ```ts
    /**
     * MOVED to `@gisik-nokma/domain` (KG-D Task 6, decision G10): the server and the MCP package write the same
     * sentences the view draws, and neither may depend on a package whose index exports React and Sigma.
     */
    export { edgeSentence, formatGraphDate, howText, provenanceLine, relation } from '@gisik-nokma/domain';
    ```
  - **27.505:** plan C's `packages/knowledge-graph/test/engine/sentences.test.ts` (27.232–27.235) is UNCHANGED and green (`git diff --exit-code origin/release/knowledge-graph -- packages/knowledge-graph/test/engine/sentences.test.ts` prints nothing), and `edgeSentence` imported from `@gisik-nokma/domain` is the same function object as the engine's (`expect(engineEdgeSentence).toBe(domainEdgeSentence)`, `toBe`, not `toEqual`: two copies of the code are two objects). Control: domain's own build has no `react` or `sigma` import: `grep -rlE "from '(react|sigma|graphology)" packages/domain/dist` prints NOTHING. (`grep -c` over a directory is not a count: without `-r` it errors "Is a directory" and prints no `0`, so "= 0" could never be read off it.)

    Kills: (a) recreate `engine/sentences.ts` as a COPY of the moved code instead of the re-export (the `toBe` identity reds); (b) leave an `import … from 'react'` (or the plan C file's `sigma` type import, if it has one) in the moved `graph-sentences.ts` (the dist grep reds). Plan C Task 2's `sentences.ts` is NOT on `origin/release/knowledge-graph` yet (`git cat-file -e` fails), so re-read it as landed before naming its imports.

  Run: build domain → knowledge-graph; run knowledge-graph's suite. Expected: PASS.

  **Prose to sweep (Step 2's commit):** none found on the ref (searched: `engine/sentences`, `sentences.ts`, `edgeSentence` in `packages/`, `apps/`, `Features.md`, `docs/`). Plan C Task 2 creates the file and its Features bullet; Step 6's "Amend plan C's Features bullet on sentences" is the sweep once it lands.

  Commit.

- [ ] **Step 3: The concept arm (27.506–27.507), tests first**

  `apps/server/test/graph/concept-arm.test.ts`:
  - Setup: `seedNotesFixture` + `buildTestApp`; concepts CP {TP}, CW {nWorkspace}, **CWE {TE, nWorkspace}** and **CE {TE}**, plus suggestion rows S1 {TP, nProject, nWorkspace}, **S2 {TE, nProject, nWorkspace}** and **SG {TE, nExplicit}** (TE and nExplicit are explicit [guestListed]: `notes-fixture.ts` seeds TE's `visibility.set` and nExplicit's `scope: { mode: 'explicit', userIds: [guestListed] }`).
    - Tag TP into CP with an `origin: 'mcp'` event (`makeCommitted`'s origin), so the edge's `origin` cannot come from a default `'web'`.
    - Who sees what on the ref (`visible-where.ts:105-123` the ticket audience switch, `:136-140` `visibleTicketsWhere`, `:303-325` `visibleNotesWhere`; Rule A, `effective-role.ts:5-19,166-187`): the owner sees everything; every member and admin is on every founded project, so `memberIn` AND `memberOut` see TP, nProject and nWorkspace; no non-owner except `guestListed` sees TE or nExplicit; a guest sees explicit lists only (not TP, nProject or nWorkspace). So the non-guest "reader who cannot see" an item must be denied by TE, never by TP or nProject (T1 recorded the same drift: `apps/server/test/read/item-visibility.test.ts:16-19`).
    - Why CWE, S2 and SG: `memberOut` centred on `note:nWorkspace` never REACHES CP (CP tags only TP), so the plan's "nothing names CP" held with the `visibleConceptIds` filter deleted. CWE is reached through nWorkspace and holds TE, which `memberOut` cannot see, so only D4 can drop it. S2 is the same for the suggestion arm. S1 cannot do that job, because under Rule A `memberOut` sees all three of its items. SG's items are all visible to `guestListed`, so only the guest arm (`eff.workspaceRole === 'guest'`) drops it.
  - Request through the route: `GET /v1/graph/neighbours?center=ticket:TP&hops=1&ws=WS&groups=concepts`.
  - The cases:
    - **27.506**
      - As `memberIn`, the ring holds `concept:CP` with `kind 'concept'`, `label` = CP's name and `suggested: false`, and a `tag` edge from `concept:CP` to `ticket:TP` whose `addedBy` is the tagger's display name and whose `origin` is `'mcp'` (the event's).
      - As `memberOut` (centred on `note:nWorkspace`): `concept:CW` is present (precondition: the ring is non-empty, so the next leg is not read off an empty answer); `concept:CWE` is ABSENT from `items`, and no edge has `from` or `to` equal to `concept:CWE`. (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan's subject was "nothing names CP", read as CP being hidden from `memberOut` through TP. On the ref `memberOut` reads TP, and CP is never reached from nWorkspace anyway. The hidden concept is now CWE, hidden through TE.)
      - Rule A control, same `it`: `memberOut` centred on `ticket:TP` DOES get `concept:CP`.

      Control: with `groups=blocks`, there is no concept item at all.

      Kills: (a) drop the `visibleConceptIds` filter in the new `resolve` arm (select every `conceptIds` row) → `concept:CWE` appears for `memberOut`; (b) delete the `if (groups.has('concepts'))` guard in `expand` → the `groups=blocks` control shows a concept; (c) pass `{ addedById: row.tagged_by, addedAt: row.tagged_at }` without `origin` in the `add('tag', …)` call → the edge's `origin` is `null`, not `'mcp'`.
    - **27.507**
      - As `memberIn`, the ring centred on `ticket:TP` also holds `concept:<S1.id>` with `suggested: true` and a `tag` edge with `suggested: true` (and `concept:CP`'s edge still `suggested: false`, so one hard-coded value cannot satisfy both).
      - As `memberOut` (centred on `note:nWorkspace`), S2 is absent, because TE is hidden from them. (Rule A, accepted by planner ruling 2026-10-04 (report Q1): the plan's subject was "S1 is absent, because TP is hidden from them". On the ref `memberOut` reads TP, nProject and nWorkspace, so S1 is PRESENT for them. The hidden suggestion is now S2, hidden through TE.)
      - Rule A control, same `it`: `memberOut`'s ring centred on `note:nWorkspace` DOES hold `concept:<S1.id>`. That is also the precondition that the suggestion arm runs for this reader at all.
      - As `guestListed` centred on `ticket:TE` (`groups=concepts`): `concept:CE` is present (precondition: the guest's ring is not empty for some other reason), and `concept:<SG.id>` is ABSENT although `hiddenItems` answers `[]` for SG's items for this guest (assert that too, in the same `it`).

      Kills: (a) delete `if ((await hiddenItems(…)).length > 0) continue;` in the suggestion arm → S2 appears for `memberOut`; (b) change `eff === null || eff.workspaceRole === 'guest'` to `eff === null` → SG appears for `guestListed`; (c) leave plan C's literal `suggested: false` in `readGraphRing`'s edge mapping (`graph-neighbours.ts:311` on the ref) instead of carrying `RawEdge.suggested` → S1's tag edge reads `false`.

  `apps/server/src/read/graph-neighbours.ts`. At the end of `resolve`, replacing plan C's `return out; // concepts: …` line:
  ```ts
  // Knowledge Graph spec D §6: concepts (D4: visible only when every live item is) and model suggestions (members
  // only, and only when every item is visible). A suggestion is drawn as a concept with `suggested: true`; its id
  // is its sem_suggestions id (a ULID, disjoint from concept ids).
  for (const [workspaceId, conceptIds] of await groupByWorkspace('proj_concepts', 'concept_id', ids.concept)) {
    const eff = await roleIn(workspaceId);
    if (eff === null) continue;
    const visible = await visibleConceptIds(db, eff, viewerId, workspaceId, conceptIds);
    const { rows } = await db.query<{ concept_id: string; name: string; summary: string }>(
      'SELECT concept_id, name, summary FROM proj_concepts WHERE concept_id = ANY ($1::text[]) AND deleted = FALSE',
      [[...visible]],
    );
    for (const row of rows) {
      const ref = graphRef('concept', row.concept_id);
      out.set(ref, { ref, kind: 'concept', id: row.concept_id, workspaceId, projectId: null, label: row.name, title: row.summary === '' ? null : row.summary, category: null, suggested: false });
    }
  }
  const leftover = ids.concept.filter((id) => !out.has(graphRef('concept', id)));
  for (const [workspaceId, suggestionIds] of await groupByWorkspace('sem_suggestions', 'id', leftover)) {
    const eff = await roleIn(workspaceId);
    if (eff === null || eff.workspaceRole === 'guest') continue;
    const { rows } = await db.query<{ id: string; label: string; item_kind: ('ticket' | 'note')[]; item_id: string[] }>(
      'SELECT id, label, item_kind, item_id FROM sem_suggestions WHERE id = ANY ($1::text[])',
      [suggestionIds],
    );
    for (const row of rows) {
      const items = row.item_id.map((id, index) => ({ kind: row.item_kind[index] as 'ticket' | 'note', id }));
      if ((await hiddenItems(db, eff, viewerId, workspaceId, items)).length > 0) continue;
      const ref = graphRef('concept', row.id);
      out.set(ref, { ref, kind: 'concept', id: row.id, workspaceId, projectId: null, label: row.label, title: null, category: null, suggested: true });
    }
  }
  return out;
  ```
  In `expand`, beside plan C's other group arms (it reads `groups.has(…)` per group; copy that shape):
  ```ts
  if (groups.has('concepts')) {
    const items = [...t.map((id) => ['ticket', id] as const), ...n.map((id) => ['note', id] as const)];
    if (items.length > 0 || ids.concept.length > 0) {
      const tagRows = await db.query<{ concept_id: string; item_kind: string; item_id: string; tagged_by: string; tagged_at: Date; origin: string }>(
        `SELECT i.concept_id, i.item_kind, i.item_id, i.tagged_by, i.tagged_at, i.origin
           FROM proj_concept_items i JOIN proj_concepts c ON c.concept_id = i.concept_id AND c.deleted = FALSE
          WHERE (i.item_kind = 'ticket' AND i.item_id = ANY ($1::text[])) OR (i.item_kind = 'note' AND i.item_id = ANY ($2::text[]))
             OR i.concept_id = ANY ($3::text[])`,
        [t, n, ids.concept],
      );
      for (const row of tagRows.rows) {
        add('tag', graphRef('concept', row.concept_id), `${row.item_kind}:${row.item_id}`, { addedById: row.tagged_by, addedAt: row.tagged_at, origin: row.origin });
      }
      const suggestionRows = await db.query<{ id: string; item_kind: string[]; item_id: string[] }>(
        `SELECT id, item_kind, item_id FROM sem_suggestions
          WHERE item_id && $1::text[] OR item_id && $2::text[] OR id = ANY ($3::text[])`,
        [t, n, ids.concept],
      );
      for (const row of suggestionRows.rows) {
        row.item_id.forEach((itemId, index) => add('tag', graphRef('concept', row.id), `${String(row.item_kind[index])}:${itemId}`, { suggested: true }));
      }
    }
  }
  ```
  - Re-read plan C's `RawEdge` as landed. If it has no `suggested` field (its `GraphEdgeView` does, `graph.ts`), add `suggested?: boolean` to `RawEdge` and carry it where plan C builds the view edge, defaulting to `false`.
  - The `item_id &&` filter is coarse (an id of the other kind could match). The `item_kind` pairing in the loop makes the refs exact, and `resolve` then drops any wrong-kind ref, so this is safe. Say so in a comment.

  Run the file and plan C's `test/graph/` WHOLE (logged). Expected: PASS, and plan C's cases unchanged.

  Mutation: drop the `visibleConceptIds` filter → 27.506's `memberOut` line reds.

  **Prose to sweep (Step 3's commit):**
  - `packages/domain/src/graph.ts:73` — `/** A concept suggestion (spec D); always false until D. */`: false once suggestion rows resolve with `suggested: true`.
  - `apps/server/src/read/graph-neighbours.ts:153` — `return out; // concepts: spec D adds a resolver; until then none resolve`: the step replaces this line; make sure the comment goes with it.
  - `apps/server/src/read/graph-neighbours.ts:311` — the view edge's literal `suggested: false`: the step must carry `RawEdge.suggested` here (27.507 (c)); `:50`'s `RawEdge` type gains the field.

  Commit.

- [ ] **Step 4: `graph/path` and `graph/trace` (27.508–27.510), tests first**

  `apps/server/test/graph/path-trace.test.ts`:
  - Seed plan A's `proj_ticket_links` and plan B's `proj_references` through their EVENTS (`ticket.link_added`, a description with a ticket chip). Copy plan C's `test/graph/` seeding helper as landed and cite it. Never insert rows by hand: the projection is under test too.
  - Chain: T1 blocks T2 blocks T3 blocks T4, with T3 explicit `[owner]`. Also T1 relates T5, T5 relates T6, and T6 relates T4.
    - (The plan first said "T1 relates T5, and T5 relates T4". That makes T1–T5–T4 a path of length 2, and `shortestPaths` stops at the first hop that reaches `to` (`!dist.has(to)` in its loop), so the owner could never get "two paths of length 3". T6 makes the relates path length 3, as the case intends. Planner ruling 2026-10-04, Q3: confirmed. `graph_path` answers only the shortest paths, all of the same minimal length; the fixture stays.)
    - Mint the ids so the sort below is observable (planner ruling 2026-10-04, Q4): take four fresh ULIDs `[a, b, c, d] = [newUlid(), newUlid(), newUlid(), newUlid()].sort()` and set T2 = a, T5 = b, T6 = c, T3 = d (assert `T2 < T5` and `T6 < T3`). The sorted answer then puts `[T1, T2, T3, T4]` first, while the walk back from T4 over sorted parents (T6 before T3) FINDS `[T1, T5, T6, T4]` first, so the unsorted order is the reverse.
  - The cases:
    - **27.508** `GET /v1/graph/path?from=ticket:T1&to=ticket:T4&maxHops=6`:
      - as the owner: exactly two paths, each with `refs.length === 4` (3 hops), IN THIS ORDER: `paths.map((p) => p.refs)` `toEqual` `[[T1, T2, T3, T4], [T1, T5, T6, T4]]` (as `ticket:` refs). (Planner ruling 2026-10-04, Q4: `shortestPaths` sorts its answer lexicographically by the node-id sequence, so the test pins the exact order; this replaces the set comparison.)
      - as `memberIn`: exactly one path, `[T1, T5, T6, T4]` (T3 is hidden);
      - `maxHops=7` → 400;
      - `to` unreachable within `maxHops=1` → `paths: []` (and with `maxHops=3` the same pair answers two paths, in the same `it`, so the `[]` is the hop limit and not an empty graph).

      Control: each path's `sentences.length === edges.length`, `sentences[0]` is `edgeSentence(paths[i].edges[0], labelOf)` with `labelOf` built from the response's `items`, AND `sentences[0]` contains T1's label (so a route that passed `() => ''` as the label resolver reds).

      Kills: (a) delete `if (!known.has(edge.from) || !known.has(edge.to)) continue;` in `shortestPaths` → `memberIn` gets the T2–T3 path; (b) replace `Math.min(maxHops, PATH_MAX_HOPS)` with `PATH_MAX_HOPS` → the `maxHops=1` leg finds a path; (c) `if (paths.length >= PATH_MAX_PATHS) return;` → `>= 1` → the owner gets one path; (d) (planner ruling 2026-10-04, Q4) delete `paths.sort((x, y) => bySequence(x.refs, y.refs))` → the owner's pair comes back as `[[T1, T5, T6, T4], [T1, T2, T3, T4]]`. Recorded survivor: deleting the `parents` sort is equivalent here (two shortest paths, under the cap of 3); it decides only WHICH three are kept when more than three tie.
    - **27.509** `GET /v1/graph/trace?from=ticket:T1&kind=blocks&direction=out&maxDepth=10`:
      - the owner gets exactly `[{T2, depth 1, via T1}, {T3, 2, via T2}, {T4, 3, via T3}]` (`ref`, `depth` and `via` each asserted);
      - `memberIn` gets T2 only. The chain STOPS at the hidden T3 and does not reach T4 through it.
      - A cycle, seeded on its OWN pair so the T1–T4 path above stays three hops: T7 blocks T8, T8 blocks T7. The owner's trace from T7 is exactly `[{T8, depth 1}]`: no entry for T7.
      - `maxDepth=11` → 400.

      Kills: (a) in `traceChain`, keep a hidden node in `next` (walk past it) → `memberIn` reaches T4 (the plan's mutation); (b) `const seen = new Set([from])` → `new Set<string>()` → the cycle leg returns T7 at depth 2; (c) swap `near`/`far` for `direction === 'out'` in `step`'s `blocks` arm → the owner's chain from T1 is empty.
    - **27.510**
      - `kind=parent&direction=out` from a sub-subtask returns exactly `[parent (depth 1), grandparent (depth 2)]`;
      - `direction=in` from the grandparent returns both in depth order;
      - `kind=ref&direction=out` follows a description's ticket chip: the description of TA holds a ticket chip to TB AND a mention of `memberIn`, and the chain is exactly `[ticket:TB]`.

      Control: `kind=ref` skips `person` targets: `person:<memberIn>` is NOT in the chain, although `memberIn` is a member whose name the graph resolves (the same mention reaches `person:` in a `groups=people` ring, asserted in the same `it`, so the skip is the filter and not an unresolvable person).

      Kills: (a) swap the two `parent` SQL strings (`out` ↔ `in`) → the sub-subtask's `out` trace is empty; (b) drop `AND target_kind IN ('ticket', 'note')` from the `ref`/`out` select → `person:<memberIn>` joins the chain.

  `apps/server/src/read/graph-trace.ts`:
  ```ts
  import { graphRef, parseGraphRef, type GraphItemView } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { createGraphVisibility } from './graph-neighbours.js';

  export type TraceKind = 'blocks' | 'parent' | 'duplicates' | 'ref';
  export const TRACE_MAX_DEPTH = 10;

  /** One step of the chain from `frontier` (refs), unfiltered: the caller keeps only what `resolve` returns. */
  async function step(db: Queryable, frontier: readonly string[], kind: TraceKind, direction: 'out' | 'in'): Promise<Array<{ from: string; to: string }>> {
    const ticketIds = frontier.map(parseGraphRef).filter((r) => r?.kind === 'ticket').map((r) => r!.id);
    if (kind === 'blocks' || kind === 'duplicates') {
      const [near, far] = direction === 'out' ? ['source_id', 'target_id'] : ['target_id', 'source_id'];
      const { rows } = await db.query<{ a: string; b: string }>(`SELECT ${near} AS a, ${far} AS b FROM proj_ticket_links WHERE kind = $1 AND ${near} = ANY ($2::text[])`, [kind, ticketIds]);
      return rows.map((row) => ({ from: graphRef('ticket', row.a), to: graphRef('ticket', row.b) }));
    }
    if (kind === 'parent') {
      const sql = direction === 'out'
        ? 'SELECT ticket_id AS a, parent_id AS b FROM proj_tickets WHERE ticket_id = ANY ($1::text[]) AND parent_id IS NOT NULL'
        : 'SELECT parent_id AS a, ticket_id AS b FROM proj_tickets WHERE parent_id = ANY ($1::text[])';
      const { rows } = await db.query<{ a: string; b: string }>(sql, [ticketIds]);
      return rows.map((row) => ({ from: graphRef('ticket', row.a), to: graphRef('ticket', row.b) }));
    }
    // ref: plan B's proj_references, parent item → target (ticket or note); people are not items of a chain.
    const sql = direction === 'out'
      ? `SELECT source_parent_kind || ':' || source_parent_id AS a, target_kind || ':' || target_id AS b FROM proj_references
          WHERE source_parent_kind || ':' || source_parent_id = ANY ($1::text[]) AND target_kind IN ('ticket', 'note')`
      : `SELECT target_kind || ':' || target_id AS a, source_parent_kind || ':' || source_parent_id AS b FROM proj_references
          WHERE target_kind || ':' || target_id = ANY ($1::text[])`;
    const { rows } = await db.query<{ a: string; b: string }>(sql, [[...frontier]]);
    return rows.map((row) => ({ from: row.a, to: row.b }));
  }

  /** Spec D §5.1 `graph_trace`: the transitive chain, breadth-first, ending at a hidden node or a repeat. */
  export async function traceChain(db: Queryable, viewerId: string, from: string, kind: TraceKind, direction: 'out' | 'in', maxDepth: number) {
    const vis = createGraphVisibility(db, viewerId);
    const start = await vis.resolve([from]);
    if (!start.has(from)) return null;
    const seen = new Set([from]);
    const items = new Map<string, Omit<GraphItemView, 'hop' | 'out'>>(start);
    const chain: Array<{ ref: string; depth: number; via: string }> = [];
    let frontier = [from];
    for (let depth = 1; depth <= Math.min(maxDepth, TRACE_MAX_DEPTH) && frontier.length > 0; depth += 1) {
      const steps = (await step(db, frontier, kind, direction)).filter((s) => !seen.has(s.to));
      const resolved = await vis.resolve(steps.map((s) => s.to));
      const next: string[] = [];
      for (const s of steps) {
        const item = resolved.get(s.to);
        if (item === undefined || seen.has(s.to)) continue; // hidden: the chain ends here, and nothing past it is reached
        seen.add(s.to);
        items.set(s.to, item);
        chain.push({ ref: s.to, depth, via: s.from });
        next.push(s.to);
      }
      frontier = next;
    }
    return { chain, items: [...items.values()] };
  }
  ```
  - The route adds `sentences`: one per chain entry, `edgeSentence` over a synthetic `GraphEdgeView` with `kind` mapped as follows, and `from`/`to` per direction:
    - `blocks`→`blocks`;
    - `duplicates`→`duplicates`;
    - `parent`→`parent`, with plan C's `parent` edge reading child → parent; re-read `relation`'s arm;
    - `ref`→`ref`.

  `apps/server/src/read/graph-path.ts`:
  ```ts
  import { GRAPH_GROUPS, type GraphGroup } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import { createGraphVisibility, expandGraph } from './graph-neighbours.js';

  export const PATH_MAX_HOPS = 6;
  export const PATH_MAX_PATHS = 3;
  type Raw = Awaited<ReturnType<typeof expandGraph>>[number];

  /**
   * Spec D §5.1 `graph_path`: up to 3 shortest paths. A BFS layer by layer over plan C's `expand` (every edge kind
   * in `groups`), keeping only refs `resolve` returns, so no path passes through anything the viewer cannot see.
   * Every shortest predecessor of a node is kept; paths are enumerated back from `to` over predecessors sorted by
   * ref, and the answer is sorted lexicographically by its node-id sequence, so the same graph always answers the
   * same paths in the same order (planner ruling 2026-10-04, Q4).
   */
  export async function shortestPaths(
    db: Queryable,
    viewerId: string,
    from: string,
    to: string,
    maxHops: number,
    groups: ReadonlySet<GraphGroup> = new Set(GRAPH_GROUPS),
  ) {
    const vis = createGraphVisibility(db, viewerId);
    const known = await vis.resolve([from, to]);
    if (!known.has(from) || !known.has(to)) return null;
    const dist = new Map([[from, 0]]);
    const parents = new Map<string, Array<{ ref: string; edge: Raw }>>();
    let frontier = [from];
    for (let hop = 1; hop <= Math.min(maxHops, PATH_MAX_HOPS) && frontier.length > 0 && !dist.has(to); hop += 1) {
      const raw = await expandGraph(db, frontier, groups);
      for (const [ref, item] of await vis.resolve(raw.flatMap((e) => [e.from, e.to]).filter((r) => !known.has(r)))) known.set(ref, item);
      const inFrontier = new Set(frontier);
      const next: string[] = [];
      for (const edge of raw) {
        if (!known.has(edge.from) || !known.has(edge.to)) continue;
        if (inFrontier.has(edge.from) === inFrontier.has(edge.to)) continue;
        const near = inFrontier.has(edge.from) ? edge.from : edge.to;
        const far = near === edge.from ? edge.to : edge.from;
        if (dist.has(far) && dist.get(far) !== hop) continue;
        if (!dist.has(far)) {
          dist.set(far, hop);
          next.push(far);
        }
        parents.set(far, [...(parents.get(far) ?? []), { ref: near, edge }]);
      }
      frontier = next;
    }
    for (const list of parents.values()) list.sort((x, y) => (x.ref < y.ref ? -1 : x.ref > y.ref ? 1 : 0));
    const paths: Array<{ refs: string[]; edges: Raw[] }> = [];
    const walk = (ref: string, refs: string[], edges: Raw[]): void => {
      if (paths.length >= PATH_MAX_PATHS) return;
      if (ref === from) {
        paths.push({ refs: [from, ...refs], edges });
        return;
      }
      for (const p of parents.get(ref) ?? []) walk(p.ref, [ref, ...refs], [p.edge, ...edges]);
    };
    if (dist.has(to)) walk(to, [], []);
    paths.sort((x, y) => bySequence(x.refs, y.refs));
    return { paths, known };
  }

  /** Lexicographic order over node-id sequences (planner ruling 2026-10-04, Q4). */
  function bySequence(a: readonly string[], b: readonly string[]): number {
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
    return a.length - b.length;
  }
  ```
  - The route turns `RawEdge` into `GraphEdgeView` exactly as plan C's `readGraphRing` does. Re-read that mapping and import its helper, or export it beside `expandGraph`.

  `apps/server/src/routes/graph-query.ts`: two GETs, `requireSession`.
  - Validate the input and answer 400 `{ error: 'invalid_query' }`, plan C's body (`routes/graph.ts`):
    - refs parse with `parseGraphRef`;
    - `maxHops` 1..6;
    - `maxDepth` 1..10;
    - `kind` and `direction` enums;
    - `groups` ⊂ `GRAPH_GROUPS`.
  - A `null` read → 404 `READ_NOT_FOUND_BODY`.
  - Bodies: `GraphPathResponse` (with `sentences` per path from `edgeSentence(edge, (ref) => known.get(ref)?.label ?? '')`) and `GraphTraceResponse`.
  - Register in `app.ts` beside plan C's `registerGraphRoutes`.

  Run the file. Expected: PASS.

  Mutation: in `traceChain`, keep a hidden node in `next` (walk past it) → 27.509's `memberIn` line reds.

  **Prose to sweep (Step 4's commit):**
  - `apps/server/src/read/graph-neighbours.ts:29` and `:169` name the walker `expand` (header docblock; its own one-line doc). True if the export is an alias (`export { expand as expandGraph }`); if the function itself is RENAMED, both lines and the `readGraphRing` docblock's "`expand` reads the link tables raw" go false. Say which in the commit.
  - Otherwise none found (searched: `graph/path`, `graph/trace`, `graph_path`, `graph_trace`, `shortest` in `apps/server/src`, `docs/`, `Features.md`, `test-cases/27-knowledge-graph.md`).

  Commit.

- [ ] **Step 5: MCP graph tools (27.511–27.514)**

  In `graph-tools.ts`, before `similar`:
  ```ts
  const ref = z.object({ kind: z.enum(['ticket', 'note', 'person', 'project', 'workspace', 'concept']), id });
  const neighboursShape = {
    center: ref, hops: z.number().int().min(1).max(4).optional(), groups: z.array(z.enum(GRAPH_GROUPS)).optional(),
    scope: z.object({ workspaces: z.array(id).min(1), projects: z.array(id).optional() }).optional(),
  };
  const pathShape = { from: ref, to: ref, maxHops: z.number().int().min(1).max(6).optional(), groups: z.array(z.enum(GRAPH_GROUPS)).optional() };
  const traceShape = { from: ref, kind: z.enum(['blocks', 'parent', 'duplicates', 'ref']), direction: z.enum(['out', 'in']), maxDepth: z.number().int().min(1).max(10).optional() };
  ```
  - **`graph_neighbours`:**
    - For `hop = 1..(hops ?? 2)`, GET `/v1/graph/neighbours?center=<kind:id>&hops=<hop>&ws=<…>&groups=<…>` (and `&proj=` when given), following `cursor` until `null`.
    - Merge `items` (by ref) and `edges` (by id), and add `sentences: edges.map((e) => edgeSentence(e, labelOf))`.
    - `ws` defaults to every workspace id in `readDirectory(session)`.
    - Description: `'Items linked to one ticket, note, person, project or workspace, ring by ring up to 4 hops, with each link as a sentence ("GN-133 blocks GN-142"). Same visibility and scope rules as the Knowledge Graph: you never see an item you cannot open, nor a link into one.'`
  - **`graph_path`:** GET `/v1/graph/path?from=…&to=…&maxHops=…`. Description: `'Up to 3 shortest chains of links between two items (at most 6 hops), each as a list of sentences. Only through items you can see.'`
  - **`graph_trace`:** GET `/v1/graph/trace?…`. Description: `'Follow one kind of link transitively from an item: everything that blocks it (kind blocks, direction in), everything it blocks (out), its parents (parent, out) or subtasks (parent, in), duplicates, or text links (ref). Stops at anything you cannot see.'`
  - Every GET goes through `readOrNotFound(…, 'item')`.
  - Update `tool-names.ts`'s `graph` block to `'graph_neighbours', 'graph_path', 'graph_trace', 'similar'`, plus the sweep entries and FINAL.

  Tests (extend `graph-tools.test.ts`, fake Session):
  - **27.511** `graph_neighbours {center: ticket t, hops: 2}`:
    - The recorded GETs are exactly, in order: `hops=1` (no cursor), `hops=1&cursor=2000`, `hops=2`, when the first answers `cursor: '2000'` and the others `cursor: null`. Without `scope`, each carries `ws=` with EVERY workspace id the fake directory answers (two: `w`, `w2`), not just the first.
    - Items are merged without duplicates: the fake puts `note:n` on BOTH the hop-1 second page and the hop-2 page, and the result holds `note:n` exactly once (`filter(ref === 'note:n').length === 1`), while the total item count equals the number of distinct refs the fake served (so a merge that drops everything after the first page also reds).
    - Edges merge by id the same way (one edge id served twice → once).
    - `sentences[i] === edgeSentence(edges[i], labelOf)` with `labelOf` built from the merged items, AND `sentences[0]` contains both of `edges[0]`'s end labels (a `() => ''` resolver reds).
    - `hops: 5` is refused by the schema.

    Control: with `scope.workspaces: ['w9']` it never reads the directory, and every GET carries `ws=w9`.

    Kills: (a) stop after the first page (ignore `cursor`) → the `cursor=2000` GET is missing and `note:n`'s hop-1 copy is lost; (b) merge items by pushing, not by ref → `note:n` twice; (c) default `ws` to `readDirectory(session)[0].workspaceId` only → `w2` missing from the query.
  - **27.512** `graph_path` and `graph_trace` GET exactly `/v1/graph/path?from=ticket%3At&to=note%3An&maxHops=3` and `/v1/graph/trace?from=ticket%3At&kind=blocks&direction=in&maxDepth=4` (each ref `encodeURIComponent`-ed, as `similar` does in 27.431), and return the fake's body `toEqual` it with a marker field the fake added (`{ marker: 'p' }` / `{ marker: 't' }`), so a tool that rebuilds the body reds. Without `maxHops` / `maxDepth` the path has no `&maxHops=` / `&maxDepth=`. A 404 → `item not found or not visible to you`.

    Kills: (a) `graph_trace` drops `direction` from its query string → the exact path differs; (b) `graph_path` always appends `&maxHops=${String(a.maxHops)}` → `maxHops=undefined` in the bare call; (c) a GET outside `readOrNotFound` → the 404 throws the transport error, not the sentence.
  - **27.513** (spec D §7 case 9, the MCP half; D6 changes no MCP output):
    - For EVERY tool in `allTools(fakeSession())`, no `inputSchema` key matches `/semantic|layer|switch/i`.
    - Server half, in `apps/server/test/graph/concept-arm.test.ts`: `GET /v1/graph/neighbours?…&semantic=off` answers a body byte-equal to the same request without it, and that body holds at least one `kind: 'concept'` item (precondition, so two empty rings cannot be "equal"). The server has no switch to hear.

    Control: the key scan finds `groups` on `graph_neighbours`, so the scan reads real schemas.

    Kills: (a) add `semantic: z.boolean().optional()` (or `layer`) to `neighboursShape` → the MCP scan reds; (b) a server mutant that drops concept items when `request.query.semantic === 'off'` → the byte-equal leg reds. Plan C's route (`apps/server/src/routes/graph.ts`) is not on the ref yet; (b) is a mutant of the route this task extends, not of code in this task.
  - **27.514** FINAL lists `'graph_neighbours', 'graph_path', 'graph_trace', 'similar'` where the `graph` block sits; `TOOL_NAMES` agrees.

    Kills: (a) register `similar` before the three new tools in `graphTools` → `allTools` order differs from FINAL; (b) leave `'graph_trace'` out of `tool-names.ts`'s `graph` block → `TOOL_NAMES` differs.

  Run: build domain → knowledge-graph → mcp-server → server; then the mcp-server suite, the server `test/graph/` and `test/mcp/`, and the knowledge-graph suite (logged). Expected: PASS.

  **Prose to sweep (Step 5's commit):** each count below is re-derived from the tip at PR time (Tasks 2, 4, 5 and plan A move it too):
  - `packages/mcp-server/test/register.test.ts:87` — 14.555's title "the final registry is the 63 tools of the plan";
  - `test-cases/14-mcp-server.md:938` — 14.555's line "the final registry is the 63 tools in the plan's order";
  - `Features.md:3407` — "nine registered tools (sixteen since MCP CRUD Task 6, sixty-three since MCP-everything)";
  - `Features.md:3454` — "Sixty-three tools in both doors" (the MCP-everything bullet);
  - `docs/manual.md:2043-2069` (§16 "What your assistant can do") lists every capability family; it names no graph or concept reading. Not false, but Task 9's manual section is where the three tools are named; do not add them here twice.

  Commit.

- [ ] **Step 6: Features, flips, battery**
  - Flip 27.505–27.514 ✅.
  - Features §24 D, under `<!-- D T6 -->`:
    - `✅ MCP graph tools: graph_neighbours (rings + sentences), graph_path (≤3 shortest, ≤6 hops), graph_trace (blocks/parent/duplicates/ref, ≤10) — packages/mcp-server/src/tools/graph-tools.ts, apps/server/src/routes/graph-query.ts`
    - `⚙️ Concepts and suggestions in the graph ring read (D4 per reader) — apps/server/src/read/graph-neighbours.ts`
  - Amend plan C's Features bullet on sentences: they now live in domain.
  - Server WHOLE, mcp-server, domain, knowledge-graph; `check:*`. LOCAL. Push, then DONE.

### Task 7: The D2 audit — every MCP write tool is visible, attributed and removable (cases 27.515–27.519)

**Spec:** §6 (D2), §7 case 8 ("for every MCP write tool, the event it emits is rendered by history and appears on an app surface with a remove path; a new write tool without these fails"), §5.2 (attribution).

**Needs merged first:** Tasks 4, 5 and 6 (every D tool exists), and **plan A's `link_tickets`**, so the manifest is complete when the classification test starts failing on unknown tools. A plan landing a write tool after this one must add its manifest row in the same PR. That rule goes in the test's failure message.

**Decisions this task makes** (Self-review G1, G3):
- **G1: today's write tools do not all meet D2.** `describeEvent` renders TICKET history only (`history-copy.ts:125-239`). No app surface renders workspace, project, membership, definition or group events as history. The note history panel shows body versions only (`apps/web/src/notes/history-panel.tsx`). A test demanding D2 of every tool would be red on day one for reasons this plan does not own.
  - So the audit carries a **frozen ratchet**, `KNOWN_D2_GAPS`: tool → the missing legs and why. The test asserts the computed failures EQUAL the ratchet.
  - A new failing tool reds the test.
  - A fixed gap still listed reds it too ("remove it from KNOWN_D2_GAPS"). The list only shrinks.
  - The concept tools enter it for `surface` until Tasks 8 and 9 remove them.
- **G3: attribution.** The ledger records `origin: 'mcp'` and `actorId`, never which assistant (`packages/mcp-server/src/tools/submit.ts:62-83`). So "Claude, for Ama Rangsa" is `MCP_ASSISTANT_LABEL = 'Claude'` + `', for '` + the actor's name, one constant in domain.
  - **The specs disagree.** Spec A §4 and plan C's `provenanceLine` say "…, via Claude"; spec D §5.2 says "Claude, for Ama Rangsa".
  - This plan uses D's form for the HISTORY actor line (the D2 rule's own surface) and leaves plan C's edge provenance line as C wrote it, both reading the one label constant.
  - Owner to confirm (Self-review, contradictions).

**Files:**
- Create:
  - `packages/mcp-server/src/tools/write-audit.ts`
  - `packages/mcp-server/test/d2-audit.test.ts` (27.515–27.516)
  - `apps/server/test/mcp/d2-audit.test.ts` (27.517–27.518)
  - `packages/app-core/test/history-rendered.test.ts` (27.517's app half)
  - `packages/app-core/test/attribution.test.tsx` (27.519)
- Modify:
  - `packages/mcp-server/src/index.ts:7`: export the audit.
  - `packages/domain/src/graph-sentences.ts` (or `index.ts`): `MCP_ASSISTANT_LABEL`. Plan C's `provenanceLine` literal `'via Claude'` becomes `` `via ${MCP_ASSISTANT_LABEL}` ``: the same output, one source.
  - `packages/app-core/src/views/history-copy.ts`: export `HISTORY_RENDERED_TYPES`, the types with an arm.
  - `packages/app-core/src/provenance.ts:58`: `attributionLabel` beside `actorLabel`.
  - `packages/app-core/src/views/history-list.tsx:74-76`: the actor span uses it.
  - `packages/app-core/src/index.ts:12`: export `attributionLabel`, `describeEvent`, `HISTORY_RENDERED_TYPES`.

**Interfaces:**
- **Produces:**
  ```ts
  // packages/mcp-server/src/tools/write-audit.ts
  export type D2Leg = 'history' | 'surface' | 'remove';
  export type WriteAudit = {
    /** Every event type the tool can submit (read from its module: each envelopeFor/ev call). */
    events: readonly string[];
    /** Where a member sees the result in the app: a repo-relative file and a literal that file must contain. */
    surface: { file: string; marker: string } | null;
    /** The event type a MEMBER submits to undo it, or null. */
    remove: string | null;
  };
  export const MCP_WRITE_AUDIT: Readonly<Record<string, WriteAudit>>;
  export const MCP_READ_ONLY_TOOLS: readonly string[];
  export const KNOWN_D2_GAPS: Readonly<Record<string, { missing: readonly D2Leg[]; why: string }>>;
  ```
  - `attributionLabel(actorName: string, origin: string): string`;
  - `HISTORY_RENDERED_TYPES: readonly string[]`;
  - `MCP_ASSISTANT_LABEL = 'Claude'`.
- **Consumes:** `allTools` (`register.ts:27`), `SWEEP` (`packages/mcp-server/test/fixtures/tool-sweep.ts:32`), `domainRegistry`, `describeEvent`.

- [ ] **Step 1: Catalogue**

  Under `<!-- D T7 -->`, add 27.515–27.519 ❌.

- [ ] **Step 2: The manifest**

  `packages/mcp-server/src/tools/write-audit.ts`. Build the D rows from this plan, and every other row by READING each tool module:
  ```bash
  cd /path/to/worktree
  grep -n "name: '\|envelopeFor(\|'[a-z_-]*\.[a-z_]*'" packages/mcp-server/src/tools/*-tools.ts > /tmp/kgd-t7-tools.txt; wc -l /tmp/kgd-t7-tools.txt
  ```
  - Each `name:` begins a tool. Each event-type literal passed to `envelopeFor` / `ev` after it, before the next `name:`, is one of its `events`.
  - A tool that posts to a route instead of the ledger (`postJson`, e.g. `mark_notifications_read`, `respond_to_invitation`, `add_attachment`) has `events: []` and is judged on `surface` and `remove` only.
  - The D rows, verbatim:
  ```ts
  const KG = 'packages/app-core/src/views/concept-inspector.tsx'; // Task 8 creates it; the KG view mounts it through renderConceptPanel
  const ROW = 'packages/app-core/src/views/concepts-row.tsx';
  export const MCP_WRITE_AUDIT: Readonly<Record<string, WriteAudit>> = {
    // … every pre-existing write tool, read from its module (above) …
    manage_concept: { events: ['concept.created', 'concept.renamed', 'concept.described', 'concept.merged', 'concept.deleted'], surface: { file: KG, marker: 'gn-kg-concept-inspector' }, remove: 'concept.deleted' },
    tag_items: { events: ['concept.item_tagged', 'concept.item_untagged'], surface: { file: ROW, marker: 'Remove from concept' }, remove: 'concept.item_untagged' },
    link_concepts: { events: ['concept.linked', 'concept.unlinked'], surface: { file: KG, marker: 'gn-kg-concept-links' }, remove: 'concept.unlinked' },
    resolve_suggestion: { events: ['concept.created', 'concept.item_tagged', 'workspace.concept_suggestion_rejected'], surface: { file: KG, marker: 'gn-kg-concept-inspector' }, remove: 'concept.deleted' },
  };
  ```
  - `MCP_READ_ONLY_TOOLS`: every other tool, by name, in `allTools` order. These are the reads, `similar`, `list_concepts`, `get_concept`, `review_suggestions` and the three graph tools.
  - `manage_groups` and `manage_members` are WRITE tools even though they have a `list` action.
  - `KNOWN_D2_GAPS`: start EMPTY and let Step 4's first run print the computed failures. Paste them in with one `why` each, from the reasons this task's header gives (no history renderer, route-only write, no surface). The concept tools' `surface` leg appears there until Tasks 8 and 9 create those files.

  Export all three from `src/index.ts`.

- [ ] **Step 3: The mcp-server half (27.515–27.516), tests first**

  `packages/mcp-server/test/d2-audit.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { allTools } from '../src/tools/register.js';
  import { MCP_READ_ONLY_TOOLS, MCP_WRITE_AUDIT } from '../src/tools/write-audit.js';
  import { SWEEP } from './fixtures/tool-sweep.js';
  import type { Session } from '../src/session.js';
  // fakeSession: copied from register.test.ts:24-44 (it is local there), with its NO_TRANSFER import.

  const NEW_TOOL_HINT = 'A new MCP tool must be classified in packages/mcp-server/src/tools/write-audit.ts (spec D §7 case 8, D2).';

  describe('27.515–27.516 the D2 audit, MCP side', () => {
    it('27.515 every tool is classified exactly once; control: an unclassified name is reported', () => {
      const names = allTools(fakeSession()).map((tool) => tool.name);
      const classified = (name: string) => Number(name in MCP_WRITE_AUDIT) + Number(MCP_READ_ONLY_TOOLS.includes(name));
      for (const name of names) expect(classified(name), `${name}: ${NEW_TOOL_HINT}`).toBe(1);
      expect([...Object.keys(MCP_WRITE_AUDIT), ...MCP_READ_ONLY_TOOLS].sort()).toEqual([...names].sort());
      expect(classified('a_tool_nobody_wrote')).toBe(0); // control
    });

    it('27.516 under the sweep, a read-only tool never writes and a write tool posts only the events it declares', async () => {
      const postedBy = new Map<string, string[]>();
      for (const tool of allTools(fakeSession())) {
        const entry = SWEEP[tool.name];
        if (entry === undefined) throw new Error(`${tool.name} has no SWEEP entry`);
        const posted: string[] = [];
        let routePosts = 0;
        const base: Session = { ...fakeSession(), ...entry.session };
        const session: Session = {
          ...base,
          postEvents: async (events) => {
            posted.push(...(events as Array<{ type: string }>).map((event) => event.type));
            return base.postEvents(events);
          },
          post: async (path, body) => {
            routePosts += 1;
            return base.post(path, body);
          },
          // add_attachment writes through postMultipart (attachment-tools.ts:39), not post: without this arm,
          // misfiling it as read-only would pass both read-only legs.
          postMultipart: async (path, fields, file) => {
            routePosts += 1;
            return base.postMultipart(path, fields, file);
          },
        };
        const handler = allTools(session).find((t) => t.name === tool.name)!.handler;
        await handler(entry.args); // 14.88 runs every sweep entry to completion the same way (register.test.ts:270-278)
        postedBy.set(tool.name, posted);
        if (MCP_READ_ONLY_TOOLS.includes(tool.name)) {
          expect(posted, `${tool.name} is read-only`).toEqual([]);
          expect(routePosts, `${tool.name} is read-only`).toBe(0);
        } else {
          for (const type of posted) expect(MCP_WRITE_AUDIT[tool.name]!.events, `${tool.name} posted ${type}`).toContain(type);
        }
      }
      // Control: the recorder sees posts, and the D tools' sweep entries DO post, so the "declares" loop above is not
      // a loop over [] for them. A sweep entry that answers a preview (no confirm_name, or a narrowing audience)
      // posts nothing; give these four entries a non-preview call (manage_concept create, tag_items add with
      // before === after, link_concepts add, resolve_suggestion accept) if Tasks 4–5 wrote them otherwise.
      for (const name of ['create_ticket', 'manage_concept', 'tag_items', 'link_concepts', 'resolve_suggestion']) {
        expect(postedBy.get(name)?.length ?? 0, `${name}'s sweep entry posted nothing`).toBeGreaterThan(0);
      }
    });
  });
  ```
  - The overlay is the sweep's own: `{ ...fakeSession(), ...entry.session }` (`register.test.ts:273`). Re-read `Session`'s `post` and `postEvents` signatures (`src/session.ts`) and match the wrapper's parameter lists to them.
  - Control for 27.516, in the same `it` (in the block above): `create_ticket` and the four D write tools each DID post under the sweep. "At least one tool posted" was satisfied by `create_ticket` alone and left the declared-events loop running over `[]` for every D tool. Re-read `SWEEP`'s `create_ticket` entry (`tool-sweep.ts`) and confirm it posts.
  - `Session.postMultipart` is `(path, fields, file)` (`session.ts:17`); `post` is `(path, body)` (`:12`), `postEvents` is `(events: unknown[])` (`:13`), hence the cast in the recorder.

  Kills (27.515): (a) leave `similar` out of `MCP_READ_ONLY_TOOLS` → its `classified` is 0; (b) list `manage_groups` in BOTH `MCP_WRITE_AUDIT` and `MCP_READ_ONLY_TOOLS` → its `classified` is 2; (c) keep a manifest row for a tool `allTools` no longer registers → the sorted-equality leg reds.

  Kills (27.516): (a) move `add_attachment` from `MCP_WRITE_AUDIT` to `MCP_READ_ONLY_TOOLS` → `routePosts` is 1 (through the `postMultipart` arm) for a read-only tool; (b) drop `'concept.item_tagged'` from `tag_items`' `events` → `tag_items posted concept.item_tagged` reds; (c) drop `'concept.linked'` from `link_concepts`' `events` → the same leg reds for it.

  Run: build mcp-server, then this file (logged). Expected: PASS once Step 2's manifest is complete. Every failure message names the tool to fix.

  **Prose to sweep (Steps 2–3's commit):** none found (searched: `write-audit`, `read-only tool`, `MCP_READ_ONLY`, `D2` in `packages/mcp-server/README.md`, `packages/mcp-server/src`, `Features.md` §14 MCP bullets). `src/index.ts:1-8`'s export list only grows.

  Commit.

- [ ] **Step 4: The server half: history, surface, remove, the ratchet (27.517–27.518)**

  `packages/app-core/src/views/history-copy.ts`: export the list of types the switch renders, beside `describeEvent`:
  ```ts
  /** Every type `describeEvent` has an arm for (KG-D T7: the D2 audit reads it; 27.517's app half proves each renders). */
  export const HISTORY_RENDERED_TYPES: readonly string[] = [
    // describeEvent's arms on origin/release/knowledge-graph (history-copy.ts:126-248), in switch order:
    'ticket.created', 'ticket.field_set', 'ticket.transitioned', 'visibility.set', 'ticket.assigned',
    'ticket.collaborator_added', 'ticket.collaborator_removed', 'ticket.workflow_rebound', 'ticket.reparented',
    'ticket.ranked', 'ticket.closed', 'ticket.reopened', 'ticket.deleted', 'ticket.restored',
    'comment.added', 'comment.edited', 'comment.deleted', 'attachment.added',
    // plan A's arms, LANDED on the ref (history-copy.ts:226-227):
    'ticket.link_added', 'ticket.link_removed',
    'claim.contested', 'claim.contested_resolved',
    // KG-D Tasks 3 and 5:
    ...CONCEPT_EVENT_TYPES, 'workspace.concept_suggestion_rejected',
  ];
  ```
  The list is DATA copied from the switch. Before committing, re-grep `case '` in the file, because the release tip may hold arms this plan did not see (plan A's). Every arm must be listed.
  - `packages/app-core/test/history-rendered.test.ts`: a `SAMPLES: Record<string, unknown>` payload per type.
    - Its keys must EQUAL `HISTORY_RENDERED_TYPES`. That catches a type in the list with no sample.
    - For each type, `describeEvent({ …base, type, payload: SAMPLES[type] })` is not the raw type. That catches a type in the list with NO ARM (it falls back to the raw type).
    - The reverse direction, an arm added to the switch but not to the list, is caught by neither of the two legs above (the list is data; nothing derives it from the switch). So, same `it`: read `../src/views/history-copy.ts` as text (`readFileSync(new URL('../src/views/history-copy.ts', import.meta.url), 'utf8')`), collect every `/case '([a-z_.]+)':/g` label, and expect the sorted label set to EQUAL the sorted `HISTORY_RENDERED_TYPES` (the spread `CONCEPT_EVENT_TYPES` are themselves case labels after Task 3). Precondition: the scan found more than 20 labels, so a regex that matches nothing cannot pass.
    - Take each sample from the arm's own `str(payload, …)` reads.

    Kills (27.517's app half): (a) delete the `case 'concept.merged':` arm from `describeEvent` → its sample renders the raw type; (b) delete `'ticket.link_added'` from `HISTORY_RENDERED_TYPES` → the source-scan equality reds (and the SAMPLES-keys equality, if its sample stays); (c) add a new `case 'x.y':` arm without listing it → the source-scan equality reds.

  `apps/server/test/mcp/d2-audit.test.ts`:
  ```ts
  import { existsSync, readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import { describe, expect, it } from 'vitest';
  import { domainRegistry } from '@gisik-nokma/domain';
  import { HISTORY_RENDERED_TYPES } from '@gisik-nokma/app-core';
  import { KNOWN_D2_GAPS, MCP_WRITE_AUDIT, type D2Leg, type WriteAudit } from '@gisik-nokma/mcp-server';

  const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

  function failuresOf(tool: string): D2Leg[] {
    return legsOf(MCP_WRITE_AUDIT[tool]!);
  }

  /** The missing legs of ONE audit row; split out so 27.518's control can hand it a row with one field changed. */
  function legsOf(audit: WriteAudit): D2Leg[] {
    const missing: D2Leg[] = [];
    if (audit.events.some((type) => !HISTORY_RENDERED_TYPES.includes(type))) missing.push('history');
    const file = audit.surface === null ? null : `${ROOT}${audit.surface.file}`;
    if (audit.surface === null || file === null || !existsSync(file) || !readFileSync(file, 'utf8').includes(audit.surface.marker)) missing.push('surface');
    if (audit.remove === null || !domainRegistry.hasType(audit.remove)) missing.push('remove');
    return missing;
  }

  describe('27.517–27.518 the D2 audit: rendered by history, on an app surface, with a remove path', () => {
    it('27.517 the computed failures EQUAL the frozen ratchet (it may only shrink); control: the concept tools pass history', () => {
      // Control: ROOT is the repo root. A wrong ROOT fails EVERY surface leg, and the first run's paste would freeze that.
      expect(existsSync(`${ROOT}packages/app-core/src/views/history-copy.ts`)).toBe(true);
      const actual = Object.fromEntries(Object.keys(MCP_WRITE_AUDIT).map((tool) => [tool, failuresOf(tool)]).filter(([, legs]) => (legs as D2Leg[]).length > 0));
      const frozen = Object.fromEntries(Object.entries(KNOWN_D2_GAPS).map(([tool, gap]) => [tool, [...gap.missing]]));
      expect(actual, 'A tool newly failing D2 must be fixed; a fixed one must be REMOVED from KNOWN_D2_GAPS').toEqual(frozen);
      for (const tool of ['manage_concept', 'tag_items', 'link_concepts', 'resolve_suggestion']) expect(failuresOf(tool)).not.toContain('history');
    });

    it('27.518 every declared event and remove type is registered; control: a made-up remove type fails the remove leg', () => {
      let declared = 0;
      for (const [tool, audit] of Object.entries(MCP_WRITE_AUDIT)) {
        for (const type of audit.events) {
          declared += 1;
          expect(domainRegistry.hasType(type), `${tool}: ${type}`).toBe(true);
        }
        if (audit.remove !== null) expect(domainRegistry.hasType(audit.remove), `${tool} remove: ${audit.remove}`).toBe(true);
      }
      expect(declared).toBeGreaterThan(0);
      // Control, on the SUBJECT: the same audit row with only `remove` changed gains the 'remove' leg, and without the change does not.
      const row = MCP_WRITE_AUDIT['manage_concept']!;
      expect(legsOf(row)).not.toContain('remove');
      expect(legsOf({ ...row, remove: 'concept.unmade' })).toContain('remove');
    });
  });
  ```
  - `@gisik-nokma/app-core` is already a server dependency (`apps/server/package.json:53`; the plan said `:49`, which is wrong on the ref).
  - `@gisik-nokma/mcp-server` is one too (`apps/server/package.json:36`). Cite both in the test's docblock. Export `WriteAudit` from `src/index.ts` with the other three.
  - Paste the first run's `actual` into `KNOWN_D2_GAPS`, with a `why` per tool. Expected after the paste: PASS.
  - Mutation: drop `'concept.merged'` from `HISTORY_RENDERED_TYPES` (`...CONCEPT_EVENT_TYPES.filter((t) => t !== 'concept.merged')`) → 27.517 reds, and the `history` leg appears for `manage_concept`. (The plan said "delete one concept arm from `describeEvent`". That leaves the LIST unchanged, and this file reads only the list, so 27.517 stays green; that mutant is killed by the app half's sample leg above.)

  Kills (27.517): (a) drop `'concept.merged'` from `HISTORY_RENDERED_TYPES` (`...CONCEPT_EVENT_TYPES.filter((t) => t !== 'concept.merged')`) → `manage_concept` gains `history` and the ratchet equality reds; (b) change `KG`'s marker for `link_concepts` to a string the file lacks → `surface` appears for it (once Task 8 has removed that leg); (c) `ROOT = fileURLToPath(new URL('../../../', import.meta.url))` → the `existsSync` control reds.

  Kills (27.518): (a) set `tag_items`' `remove` to `'concept.item_removed'` (unregistered) → the remove-registered leg reds; (b) `legsOf` checks `audit.remove === null` only (drops `!domainRegistry.hasType(audit.remove)`) → the control's `'concept.unmade'` row has no `remove` leg.

  **Prose to sweep (Step 4's commit):** none found (searched: `describeEvent`, `HISTORY_RENDERED`, `history renders`, `D2` in `packages/app-core/src/views/history-copy.ts` docblocks `:5-40` and `:194-213`, `Features.md`, `docs/manual.md`). The census docblock at `history-copy.ts:202-205` describes `history-copy.test.ts`'s domain-list census and stays true beside the new list.

  Commit.

- [ ] **Step 5: Attribution (27.519)**

  `packages/domain`: `export const MCP_ASSISTANT_LABEL = 'Claude';` in `graph-sentences.ts` (Task 6's moved file, beside `provenanceLine`). Change `provenanceLine`'s `', via Claude'` to `` `, via ${MCP_ASSISTANT_LABEL}` ``. Plan C's 27.232–27.235 stay green: the same string.

  `packages/app-core/src/provenance.ts`, beside `actorLabel` (`:58`):
  ```ts
  /**
   * Knowledge Graph spec D §5.2 (D2): an MCP write reads "Claude, for Ama Rangsa". The ledger records origin 'mcp'
   * and the session's user, never which assistant, so the assistant is one label (`MCP_ASSISTANT_LABEL`).
   */
  export function attributionLabel(actorName: string, origin: string): string {
    return origin === 'mcp' ? `${MCP_ASSISTANT_LABEL}, for ${actorName}` : actorName;
  }
  ```
  `history-list.tsx:74-76`: `{attributionLabel(actorLabel(event.actorId, nameOf(event.actorId)), event.origin)}`.

  `packages/app-core/test/attribution.test.tsx`, **27.519**:
  - `attributionLabel('Ama Rangsa', 'mcp') === 'Claude, for Ama Rangsa'`.
  - `attributionLabel('Ama Rangsa', 'mobile') === 'Ama Rangsa'` and `attributionLabel('Ama Rangsa', 'server') === 'Ama Rangsa'`: `'web'` alone cannot tell `origin === 'mcp'` from `origin !== 'web'` (`ORIGINS` is `['web', 'mobile', 'desktop', 'server', 'mcp']`, `envelope.ts:54`).
  - `HistoryList` renders an `origin: 'mcp'` event's actor span as `Claude, for Ama Rangsa`, and a `'web'` one as `Ama Rangsa` (control).
  - Same `it`: an `origin: 'mcp'` event whose actor the roster does not name renders `Claude, for Unknown person` (the inner `actorLabel` floor still applies; `provenance.ts:58-63`).
  - Grep app-core and web tests for assertions on `gn-history__actor` text with an `mcp` origin. Any that exist change in this commit; name them in DONE. (On the ref the only `gn-history__actor` assertions are `packages/app-core/test/views/history-list.test.tsx:102-103`, an unnamed actor, origin not `mcp`.)

  Kills: (a) `origin === 'mcp'` → `origin !== 'web'` in `attributionLabel` → the `'mobile'` leg reads `Claude, for Ama Rangsa`; (b) leave `history-list.tsx:75` as `actorLabel(…)` (no `attributionLabel` wrap) → the `HistoryList` `mcp` leg reads `Ama Rangsa`; (c) wrap the other way, `actorLabel(event.actorId, attributionLabel(nameOf(…), event.origin))` → the unknown-actor leg reads `Claude, for` (or `Claude, for <id>`, as the test's `nameOf` answers) instead of `Claude, for Unknown person`.

  Run: build domain → app-core → mcp-server → server. Then the app-core suite, the web suite (it renders `HistoryList`), the mcp-server suite and the server `test/mcp/` (logged). Expected: PASS.

  **Prose to sweep (Step 5's commit):**
  - `docs/manual.md:2041` — "**Every change it makes is recorded under your name**, like any other change in the ticket's history.": an MCP change now reads "Claude, for <your name>", not like any other change. Amend, and regenerate the help content `check:help` compares (`scripts/help-content.mjs` → `packages/app-core/src/help/content.generated.ts`).
  - `packages/app-core/src/views/history-copy.ts:105-107` — "Routing through `actorLabel` is the same floor the actor line one span to the right uses … so a sentence and the actor beside it cannot disagree about who somebody is": for an `mcp` event the actor line now reads "Claude, for X" while a sentence naming the same person reads "X". Still the same floor, but the "cannot disagree" sentence needs the MCP prefix named.
  - `packages/app-core/src/views/history-list.tsx:28-31` — "the label goes through `actorLabel`": now through `attributionLabel(actorLabel(…), origin)`; name the wrapper.
  - Plan C's `provenanceLine` literal `', via Claude'` (Task 6's moved `graph-sentences.ts`) is not on the ref; its docblock, if it names the literal, changes with it.

  Commit.

- [ ] **Step 6: Features, flips, battery**
  - Flip 27.515–27.519 ✅.
  - Features §24 D, under `<!-- D T7 -->`:
    - `⚙️ D2 audit: every MCP tool classified; write tools checked for history, app surface and remove path against a shrinking ratchet — packages/mcp-server/src/tools/write-audit.ts`
    - `✅ History shows MCP writes as "Claude, for <person>" — packages/app-core/src/provenance.ts`
  - Run every touched package's suite plus the server WHOLE, then `check:*`. LOCAL. Push, then DONE.

### Task 8: Concepts in the Knowledge Graph — the concept inspector, Confirm / Reject, the D6 proof (cases 27.520–27.539)

**Spec:** §4.2 (D3), §6 first bullet, §7 case 9 (the data half); spec C §6.4 (the switch, view-only). **UI work: the lane invokes `frontend-design` with its workflow skill** (workspace rule, owner 2026-10-02).

**Needs merged first:**
- Tasks 4, 5 and 6;
- **plan C Tasks 7 and 8**: `packages/knowledge-graph/src/react/knowledge-graph.tsx` (`KnowledgeGraph`, `KnowledgeGraphProps`), `react/inspector.tsx`, `react/semantic-pref.ts` (`readSemantic`, `writeSemantic`, `SEMANTIC_KEY = 'gn-kg-semantic'`), and the `/* KG: … */` blocks in `packages/ui/src/ui.css`;
- **plan C Task 9** (the hosts: the ticket sheet's tab, the note panel, the gateway);
- plan C's `packages/knowledge-graph-browser` (27.530 lives there; plan C counts the package in the gate).

**At dispatch, re-read plan C's LANDED `KnowledgeGraphProps` and inspector.** This plan saw them while plan C was still being written: `centre`, `config`, `source`, `scope`, `defaultWorkspaceIds`, `groups`, `hops`, `onOpen`, `canOpen`, `onAddLink`, `onRemoveLink`, and `canOpen` refusing `concept` in the web host. Bind to the landed names; never invent a second prop for something plan C already passes.

**What plan C already does, and this task does not redo:**
- draws a concept as a pill (`backdropColor` `conceptFill` / `conceptSoft` when `sug`) with `tag` edges;
- hides concepts and the Concepts chip when the switch is Off, and moves the selection off a concept;
- the switch itself (`localStorage['gn-kg-semantic']`, never an event or a setting).

**This task adds** the inspector body for a selected concept: one new optional prop on `KnowledgeGraph`, rendered by plan C's inspector when the selected item's `kind === 'concept'`.

**Files:**
- Create:
  - `packages/app-core/src/views/concept-inspector.tsx`
  - `packages/app-core/src/views/use-concept.ts`
  - `packages/app-core/test/concept-inspector.test.tsx` (27.521–27.527)
  - `packages/app-core/test/semantic-switch-writes-nothing.test.tsx` (27.528)
  - `packages/knowledge-graph-browser/tests/concepts.spec.ts` (27.530)
- Modify:
  - `packages/knowledge-graph/src/react/knowledge-graph.tsx`: `renderConceptPanel?` in `KnowledgeGraphProps`, passed to the inspector.
  - `packages/knowledge-graph/src/react/inspector.tsx`: render it for a concept.
  - `packages/app-core/src/data-source.ts` (beside `getGroups`, `:254`), `online/online-data-source.ts` (beside `:193-201`), `replica/replica-data-source.ts` (beside `:663` and `:1214`), `apps/web/test/helpers/stub-services.ts:132`, `packages/app-core/test/helpers/fake-data-source.ts:34`: four reads.
  - The hosts plan C Task 9 wired: pass `renderConceptPanel`.
  - `packages/ui/src/ui.css`: a `/* KG: D concept */` block directly above `/* KG: end */`.
  - `packages/mcp-server/src/tools/write-audit.ts` `KNOWN_D2_GAPS`: drop the `surface` legs that now pass (27.532).

**Interfaces:**
- **Produces:**
  - the `DataSourceQuery` reads:
    - `getConcept(conceptId): Promise<ConceptView>`;
    - `getConceptHistory(conceptId): Promise<TicketHistoryEvent[]>`;
    - `getSuggestions(workspaceId): Promise<SuggestionView[]>`;
    - `getConceptAudience(workspaceId, conceptId: string | null, add: readonly { kind: 'ticket' | 'note'; id: string }[]): Promise<ConceptAudienceResponse>`;
  - `ConceptInspector` props: `{ item: GraphItemView; workspaceId: string; dataSource: DataSource; make: MakeSubmitted; nameOf: (userId: string) => string; onChanged: () => void; onRefusal: (r: { rule: string; reason: string }) => void }`;
  - `KnowledgeGraphProps.renderConceptPanel?: (item: GraphItemView, ctx: { refresh: () => void }) => ReactNode`.
- **Consumes:**
  - Task 4/5 routes and domain types;
  - `attributionLabel` (T7);
  - `MakeSubmitted` (`packages/app-core/src/submit.ts:7`);
  - `dataSource.ingest` (`data-source.ts:457`);
  - the refusal shape `ticket-notes-section.tsx:59-71` uses.

- [ ] **Step 1: Catalogue**

  Under `<!-- D T8 -->`, add 27.520–27.532 ❌. 27.533–27.539 are reserved.

- [ ] **Step 2: The DataSource reads (27.520)**

  `data-source.ts`, beside `getGroups` (`:254`):
  ```ts
  /** Knowledge Graph spec D: one concept (D4 at the server; a 404 is re-raised, never an empty concept). */
  getConcept(conceptId: string): Promise<ConceptView>;
  getConceptHistory(conceptId: string): Promise<TicketHistoryEvent[]>;
  /** Members only (a guest's 404 is re-raised). */
  getSuggestions(workspaceId: string): Promise<SuggestionView[]>;
  getConceptAudience(workspaceId: string, conceptId: string | null, add: readonly { kind: 'ticket' | 'note'; id: string }[]): Promise<ConceptAudienceResponse>;
  ```
  `online-data-source.ts`, beside `getGroups` (`:193-201`). Its "a null is re-raised as the 404 it was" shape:
  ```ts
  getConcept: async (conceptId) => {
    const path = `/v1/concepts/${encodeURIComponent(conceptId)}`;
    const raw = await http.get(path);
    if (raw === null) throw new HttpError(404, path);
    return raw as ConceptView;
  },
  getConceptHistory: async (conceptId) => {
    const path = `/v1/concepts/${encodeURIComponent(conceptId)}/history`;
    const raw = await http.get(path);
    if (raw === null) throw new HttpError(404, path);
    return (raw as ConceptHistoryResponse).events;
  },
  getSuggestions: async (workspaceId) => {
    const path = `/v1/workspaces/${encodeURIComponent(workspaceId)}/suggestions`;
    const raw = await http.get(path);
    if (raw === null) throw new HttpError(404, path);
    return (raw as SuggestionListResponse).suggestions;
  },
  getConceptAudience: async (workspaceId, conceptId, add) => {
    const qs = [conceptId === null ? null : `conceptId=${encodeURIComponent(conceptId)}`, ...add.map((i) => `add=${encodeURIComponent(`${i.kind}:${i.id}`)}`)].filter((x) => x !== null).join('&');
    const path = `/v1/workspaces/${encodeURIComponent(workspaceId)}/concepts/audience?${qs}`;
    const raw = await http.get(path);
    if (raw === null) throw new HttpError(404, path);
    return raw as ConceptAudienceResponse;
  },
  ```
  - `replica-data-source.ts`: four `ReplicaGapError` entries, the `getGroups` shape (`:663` absences, `:1214` the reject). Concepts are online-only (`audienceClassOf` → `'withheld'`, Task 3).
  - Stubs: `stub-services.ts:132` gets `unstubbed('…')` ×4, and `fake-data-source.ts:34` gets defaults that reject with a 404 `HttpError`. Never an empty concept.
  - **27.520** (extend the online data source's existing test file; grep `getGroups` in `packages/app-core/test/online/` and add beside it):
    - each read GETs its EXACT path: `/v1/concepts/c`, `/v1/concepts/c/history`, `/v1/workspaces/w/suggestions`, and `getConceptAudience('w', 'c', [ticket t, note n])` → `/v1/workspaces/w/concepts/audience?conceptId=c&add=ticket%3At&add=note%3An` (both adds, in order);
    - each read returns the UNWRAPPED value: `getConceptHistory` → the body's `events` array (`toBe(body.events)`), `getSuggestions` → `body.suggestions`, `getConcept` / `getConceptAudience` → the body;
    - a `null` transport answer throws `HttpError` with `status === 404`, for EACH of the four (a loop over the four methods, not one);
    - the replica rejects each of the four with `ReplicaGapError`, and `REPLICA_GAPS` has the four keys (12.185 compares those keys against the methods that reject, `replica-data-source.ts:635-640`).

    Control: `getConceptAudience(ws, null, [t])` has no `conceptId=` (path `…/concepts/audience?add=ticket%3At`).

    Kills: (a) `getConceptHistory` returns `raw as ConceptHistoryResponse` (no `.events`) → the unwrap leg reds; (b) drop `if (raw === null) throw new HttpError(404, path);` from `getSuggestions` → its `null` leg resolves `undefined`; (c) join the adds with `,` instead of `&add=` → the exact audience path reds.

  **Prose to sweep (Step 2's commit):**
  - `apps/web/test/helpers/stub-services.ts:51` — "every read below is `unstubbed`": stays true only if the four new reads go in as `unstubbed('…')` (the plan says they do).
  - `packages/app-core/test/helpers/fake-data-source.ts:12-24` (the header docblock) makes no claim about the defaults' values, so the four rejecting defaults falsify nothing there; the neighbours answer empty (`:34` `getGroups: async () => []`), so give the four a one-line comment saying why they reject.
  - Otherwise none found (searched: `getGroups`, `REPLICA_GAPS`, `ReplicaGapError` docblocks in `replica-data-source.ts:633-661`, `data-source.ts:244-254`).

  Commit.

- [ ] **Step 3: The concept inspector (27.521–27.527), tests first**

  `packages/app-core/test/concept-inspector.test.tsx` (jsdom; the fake data source; a recording `make` and `ingest`):
  - **27.521** A confirmed concept (`item.suggested === false`) renders, from a fixture `ConceptView` with TWO items and TWO links (one `direction: 'broader'`, one `'related'`):
    - its name as the heading and its summary;
    - "Created by Ama Rangsa" (`origin: 'web'`), or "Created by Claude, for Ama Rangsa" (`origin: 'mcp'`, through `attributionLabel`);
    - one row per item (label + "Remove from concept" button): exactly two rows, each with its own label;
    - a Links list (`gn-kg-concept-links`) with a Remove per link, reading exactly `Broader: <name>` and `Related: <name>`;
    - Rename and Delete.

    Control: a concept with no items says `No items yet`.

    Kills: (a) `Created by {props.nameOf(c.createdBy)}` (drop `attributionLabel`) → the `mcp` leg reads `Created by Ama Rangsa`; (b) swap the `'Broader: '` / `'Narrower: '` arms of the direction ternary → the broader link reads `Narrower: …`; (c) render `items.slice(0, 1)` → the exactly-two-rows leg reads one row.
  - **27.522** "Remove from concept" on TP ingests ONE `concept.item_untagged {itemKind:'ticket', itemId:TP}` on `{kind:'concept', id}`.
    - The row disappears at once (optimistic): the fake `ingest` returns a DEFERRED promise, and the row is absent BEFORE the test resolves it. (With an instantly-resolving fake, "at once" and "after the commit" render the same, so the optimistic leg could not fail.)
    - A refused result (resolve the deferred with `{status:'refused', rule:'concept.not-tagged', reason:'That item is not in this concept.'}`) puts the row back, calls `onRefusal` with exactly `{ rule: 'concept.not-tagged', reason: 'That item is not in this concept.' }`, and does NOT call `onChanged`.

    Control: a committed result calls `onChanged` once, and the row stays gone.

    Kills: (a) move `setRemoved(… add(key))` after `await send(…)` → the row is still there while the deferred is pending; (b) in `send`, `if (results.some((r) => r.status === 'committed'))` → `if (results.length > 0)` → `onChanged` is called on the refusal; (c) drop the `setRemoved((s) => { … n.delete(key) … })` rollback → the row does not come back.
  - **27.523**
    - Rename opens an inline field (prefilled with the current name); after the user types `Scroll on phones`, Save ingests `concept.renamed {name: 'Scroll on phones'}` (the TYPED name, not `c.name`); Save is disabled while the field is blank.
    - Delete asks "Delete the concept <name>? Its items stay; only the grouping goes." and ingests `concept.deleted {}` on Confirm, and nothing on Cancel (precondition for the Cancel leg: the `alertdialog` was on screen before Cancel was pressed, and is gone after).
    - A link's Remove ingests `concept.unlinked {otherId, relation}` with the link's own `otherId` and `relation` (the fixture's two links differ in both, and the test presses the SECOND link's Remove).

    Kills: (a) the rename form sends `{ name: c.name }` → the typed-name leg reds; (b) the Cancel button calls `send(…concept.deleted…)` → the Cancel leg sees one ingest; (c) the link Remove sends `c.links[0]`'s ids → the second link's press posts the first link's `otherId`.
  - **27.524** A suggestion (`item.suggested === true`):
    - renders "Suggested", its terms and items, and NO Rename / Delete / Remove (by role and name: no button named `Rename`, `Delete`, `Remove`, `Remove from concept`);
    - (planner ruling 2026-10-04, Q5) the terms are a secondary line under the label: with the fixture `terms: ['drag', 'column', 'board']`, `label: 'drag · column · board'`, the heading reads `drag · column · board` and its NEXT element sibling reads exactly `drag, column, board`;
    - "Confirm" shows a name field prefilled with the suggestion's label (`terms.join(' · ')`, e.g. `drag · column · board`), disabled while empty;
    - submitting ingests ONE batch: `concept.created {name, fromSuggestion: <id>}` then one `concept.item_tagged` per item, all on one fresh concept id (`newUlid`): the batch's length is `1 + items.length` with a 2-item fixture, every `entity.id` is equal, and that id is NOT the suggestion's id.
    - A batch is not atomic (`apps/server/src/ingest/ingest-service.ts:56-64`: "Each event commits or fails independently"). Same `it`: with the fake `ingest` answering committed, committed, refused (`concept.item-unknown`), `onChanged` IS called once (the concept exists, with two items) and `onRefusal` gets `concept.item-unknown`. Control: all-committed calls `onChanged` once and `onRefusal` never.

    Kills: (a) `conceptEv(s.id, …)` for every event (reuse the suggestion id) → the not-the-suggestion-id leg reds; (b) in `send`, `if (bad !== undefined) { …refuse…; return false; }` BEFORE the `onChanged` line → the partial batch never calls `onChanged`; (c) render `ConfirmedPanel` for every item (drop the `props.item.suggested ?` branch) → "Suggested" is missing and Rename appears; (d) (planner ruling 2026-10-04, Q5) drop the `gn-kg-concept__terms` line → the heading's next sibling is the item list; (e) render `s.label` in the terms line → it reads `drag · column · board`.
  - **27.525** "Reject" ingests `workspace.concept_suggestion_rejected` on `{kind:'workspace', id: ws}` whose payload `toEqual`s EXACTLY `{ signature: <fixture signature>, itemHashes: <fixture hashes> }` (the fixture's signature and hashes are distinct strings, neither equal to the suggestion id). That exact equality is the control: no `itemIds` (or any other) key. (The plan's "the payload has no `itemIds` key" alone could not fail: nothing in the code ever adds one.)

    Kills: (a) send `{ signature: s.id, itemHashes: s.itemHashes }` → the signature leg reds; (b) `entity: { kind: 'workspace', id: s.id }` → the entity leg reds; (c) add `itemIds: s.items.map((i) => i.id)` to the payload → the exact-equality leg reds.
  - **27.526** The narrowing preview (§3.2):
    - Before Confirm, the inspector asks `getConceptAudience(ws, null, items)` (assert the call's three arguments exactly: `conceptId` is `null` for a concept that does not exist yet). With `{ members: 9, before: 6, after: 3 }` it shows `Fewer people will see this concept: 3 of 9 members` above the Confirm button (DOM order: the sentence precedes the button).

    Control: when `after === before` (`{ members: 9, before: 6, after: 6 }`), no sentence is shown. The user's Confirm click is the confirmation; the sentence is shown before it, never after.

    Kills: (a) the sentence uses `before` (the plan's mutation) → `6 of 9`; (b) `a.after <= a.before` → the control shows a sentence; (c) ask `getConceptAudience(ws, s.id, s.items)` → the argument leg reds.
  - **27.527** Through `KnowledgeGraph` (plan C's own test harness for the view, with a stub `source`; re-read plan C's 27.31x harness and reuse it):
    - selecting a concept item renders `renderConceptPanel`'s node inside the inspector, and the prop received the selected item (its `ref` equals the concept's);
    - selecting a ticket does not.

    Control: with no `renderConceptPanel`, the inspector shows plan C's default for a concept, unchanged.

    Kills: (a) drop the `kind === 'concept'` condition in the inspector (render the prop for any selection) → the ticket leg shows the node; (b) call `renderConceptPanel(centreItem, …)` instead of the selected item → the `ref` leg reds. Plan C's `inspector.tsx` is not on the ref; bind the mutants to the landed condition.

  `packages/app-core/src/views/use-concept.ts`: a small loader hook, `useConcept(dataSource, conceptId | null)` → `{ data, error, reload }`. Copy the shape of the loader `TicketNotesSection` receives as `notes` (`notes.data`, `notes.error`, `notes.reload()`, `ticket-notes-section.tsx:66,85-86`). Re-read its source hook and mirror it.

  `packages/app-core/src/views/concept-inspector.tsx` (the essential body; styles in `ui.css`):
  ```tsx
  import { newUlid, type GraphItemView, type SuggestionView } from '@gisik-nokma/domain';
  import { useEffect, useState } from 'react';
  import type { DataSource } from '../data-source.js';
  import { attributionLabel } from '../provenance.js';
  import type { MakeSubmitted } from '../submit.js';
  import { useConcept } from './use-concept.js';

  type Props = {
    item: GraphItemView;
    workspaceId: string;
    dataSource: DataSource;
    make: MakeSubmitted;
    nameOf: (userId: string) => string;
    onChanged: () => void;
    onRefusal: (r: { rule: string; reason: string }) => void;
  };

  /** Knowledge Graph spec D §6 + §4.2: a concept's inspector (confirmed) or a suggestion's (dashed, "Suggested"). */
  export function ConceptInspector(props: Props) {
    return props.item.suggested ? <SuggestionPanel {...props} /> : <ConfirmedPanel {...props} />;
  }

  async function send(props: Props, events: ReturnType<MakeSubmitted>[]): Promise<boolean> {
    const results = await props.dataSource.ingest(events);
    const bad = results.find((r) => r.status !== 'committed');
    if (results.length === 0) { props.onRefusal({ rule: 'transport', reason: 'The server did not answer this change.' }); return false; }
    // A batch is NOT atomic (`apps/server/src/ingest/ingest-service.ts:56-64`): committed neighbours of a refused
    // event stay committed. So any commit refreshes the graph (a half-tagged concept is drawn, attributed and
    // removable, D2) and the first refusal is still shown.
    if (results.some((r) => r.status === 'committed')) props.onChanged();
    if (bad === undefined) return true;
    if (bad.status === 'refused') props.onRefusal({ rule: bad.rule, reason: bad.reason });
    else if (bad.status === 'invalid') props.onRefusal({ rule: bad.code, reason: bad.message });
    return false;
  }

  function ConfirmedPanel(props: Props) {
    const concept = useConcept(props.dataSource, props.item.id);
    const [removed, setRemoved] = useState<Set<string>>(new Set());
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [renaming, setRenaming] = useState<string | null>(null);
    if (concept.error !== null) return <p className="gn-kg-concept__error">This concept could not be loaded.</p>;
    if (concept.data === null) return <p className="gn-kg-concept__loading">Loading…</p>;
    const c = concept.data;
    const ev = (type: string, payload: unknown) => props.make({ workspaceId: c.workspaceId, entity: { kind: 'concept', id: c.id }, type, payload });
    const items = c.items.filter((i) => !removed.has(`${i.kind}:${i.id}`));
    return (
      <section className="gn-kg-concept-inspector" aria-label={`Concept ${c.name}`}>
        {renaming === null ? <h3 className="gn-kg-concept__name">{c.name}</h3> : (
          <form onSubmit={async (e) => { e.preventDefault(); if (await send(props, [ev('concept.renamed', { name: renaming })])) setRenaming(null); }}>
            <input className="gn-input" aria-label="Concept name" value={renaming} onChange={(e) => setRenaming(e.target.value)} />
            <button className="gn-btn" type="submit" disabled={renaming.trim() === ''}>Save</button>
          </form>
        )}
        {c.summary === '' ? null : <p className="gn-kg-concept__summary">{c.summary}</p>}
        <p className="gn-kg-concept__by">Created by {attributionLabel(props.nameOf(c.createdBy), c.origin)}</p>
        {items.length === 0 ? <p className="gn-kg-concept__empty">No items yet</p> : (
          <ul className="gn-kg-concept__items">
            {items.map((i) => (
              <li key={`${i.kind}:${i.id}`}>
                <span>{i.label}</span>
                <button className="gn-btn gn-btn--quiet" type="button" onClick={async () => {
                  const key = `${i.kind}:${i.id}`;
                  setRemoved((s) => new Set(s).add(key));
                  if (!(await send(props, [ev('concept.item_untagged', { itemKind: i.kind, itemId: i.id })]))) setRemoved((s) => { const n = new Set(s); n.delete(key); return n; });
                }}>Remove from concept</button>
              </li>
            ))}
          </ul>
        )}
        <ul className="gn-kg-concept-links">
          {c.links.map((l) => (
            <li key={`${l.relation}:${l.otherId}`}>
              <span>{l.direction === 'broader' ? 'Broader: ' : l.direction === 'narrower' ? 'Narrower: ' : 'Related: '}{l.otherName}</span>
              <button className="gn-btn gn-btn--quiet" type="button" onClick={() => void send(props, [ev('concept.unlinked', { otherId: l.otherId, relation: l.relation })])}>Remove</button>
            </li>
          ))}
        </ul>
        <div className="gn-kg-concept__actions">
          <button className="gn-btn" type="button" onClick={() => setRenaming(c.name)}>Rename</button>
          <button className="gn-btn gn-btn--danger" type="button" onClick={() => setConfirmDelete(true)}>Delete</button>
        </div>
        {confirmDelete ? (
          <div role="alertdialog" aria-label="Delete concept" className="gn-kg-concept__confirm">
            <p>Delete the concept {c.name}? Its items stay; only the grouping goes.</p>
            <button className="gn-btn gn-btn--danger" type="button" onClick={() => void send(props, [ev('concept.deleted', {})])}>Delete</button>
            <button className="gn-btn" type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        ) : null}
      </section>
    );
  }

  function SuggestionPanel(props: Props) {
    const [suggestion, setSuggestion] = useState<SuggestionView | null>(null);
    const [name, setName] = useState('');
    const [narrowing, setNarrowing] = useState<string | null>(null);
    useEffect(() => {
      void props.dataSource.query.getSuggestions(props.workspaceId).then(async (all) => {
        const s = all.find((x) => x.id === props.item.id) ?? null;
        setSuggestion(s);
        setName(s?.label ?? '');
        if (s === null) return;
        const a = await props.dataSource.query.getConceptAudience(props.workspaceId, null, s.items);
        setNarrowing(a.after < a.before ? `Fewer people will see this concept: ${String(a.after)} of ${String(a.members)} members` : null);
      });
    }, [props.dataSource, props.workspaceId, props.item.id]);
    if (suggestion === null) return <p className="gn-kg-concept__loading">Loading…</p>;
    const s = suggestion;
    const conceptEv = (id: string, type: string, payload: unknown) => props.make({ workspaceId: props.workspaceId, entity: { kind: 'concept', id }, type, payload });
    return (
      <section className="gn-kg-concept-inspector gn-kg-concept-inspector--suggested" aria-label={`Suggested concept ${s.label}`}>
        <p className="gn-kg-concept__badge">Suggested</p>
        {/* planner ruling 2026-10-04, Q5: the label, then the terms as a secondary line under it (27.524). */}
        <h3 className="gn-kg-concept__name">{s.label}</h3>
        <p className="gn-kg-concept__terms">{s.terms.join(', ')}</p>
        <ul className="gn-kg-concept__items">{s.items.map((i) => <li key={`${i.kind}:${i.id}`}>{i.label}</li>)}</ul>
        <form onSubmit={(e) => {
          e.preventDefault();
          const id = newUlid();
          void send(props, [conceptEv(id, 'concept.created', { name: name.trim(), fromSuggestion: s.id }), ...s.items.map((i) => conceptEv(id, 'concept.item_tagged', { itemKind: i.kind, itemId: i.id }))]);
        }}>
          <label className="gn-field"><span>Name</span><input className="gn-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          {narrowing === null ? null : <p className="gn-kg-concept__narrowing">{narrowing}</p>}
          <button className="gn-btn gn-btn--primary" type="submit" disabled={name.trim() === ''}>Confirm</button>
          <button className="gn-btn" type="button" onClick={() => void send(props, [props.make({ workspaceId: props.workspaceId, entity: { kind: 'workspace', id: props.workspaceId }, type: 'workspace.concept_suggestion_rejected', payload: { signature: s.signature, itemHashes: s.itemHashes } })])}>Reject</button>
        </form>
      </section>
    );
  }
  ```
  - Button classes: follow the 2026-09-29 button rules (memory: styling-system-refresh). Re-read `packages/ui/src/ui.css`'s `gn-btn` variants as LANDED and use those names. The names above are placeholders for the class family, and the lane swaps in the real ones (`frontend-design` applies).
  - `IngestResult` has exactly three arms, `committed` / `invalid {code, message}` / `refused {rule, reason}` (`packages/domain/src/ingest-result.ts:22-25`), so `send`'s narrowing is exhaustive. `newUlid` is `packages/domain/src/ids.ts:31`, re-exported by the domain index (`index.ts:1`).

  `knowledge-graph.tsx` / `inspector.tsx`:
  - Add `renderConceptPanel?: (item: GraphItemView, ctx: { refresh: () => void }) => ReactNode;` to `KnowledgeGraphProps`, with a docblock (spec D §6).
  - In the inspector, when the selected item's `kind === 'concept'` and the prop is present, render it in place of plan C's concept body.
  - `ctx.refresh` re-fetches the rings. Use plan C's `useGraphRings` reload if it exposes one; otherwise re-key the hook on a counter, and say which in the commit.
  - Hosts: in each host plan C Task 9 wired, pass `renderConceptPanel={(item, ctx) => <ConceptInspector item={item} workspaceId={item.workspaceId ?? ws} dataSource={dataSource} make={make} nameOf={nameOf} onChanged={ctx.refresh} onRefusal={setServerRefusal} />}`, using that host's existing `dataSource`, `make`, `nameOf` and refusal setter.

  `ui.css` `/* KG: D concept */` block:
  - the inspector's spacing on the house layout rules;
  - the suggested panel's dashed rim in `var(--gn-…)` tokens plan C defined for concepts (`conceptSoft`, `edgeConcept` roles);
  - no raw colour (the colour scan, `packages/ui/test/helpers/colour-scan.ts`, covers `packages/knowledge-graph/src` per plan C).

  Run: build domain → knowledge-graph → app-core → web; then the app-core and knowledge-graph suites, and the web suite (stubs changed) (logged). Expected: PASS.

  Mutations:

  | Mutation | Expected |
  |---|---|
  | `send` treats a refusal as committed | 27.522 reds |
  | the narrowing sentence uses `before` | 27.526 reds |

  **Prose to sweep (Step 3's commit):**
  - `packages/ui/src/ui.css:9582-9584` — "Four per-task regions, seeded empty by T1": a fifth block, `/* KG: D concept */`, makes "Four" false. Amend the count (or say "one region per task, plan C's four plus spec D's").
  - Plan C's `react/inspector.tsx` / `knowledge-graph.tsx` docblocks (NOT on the ref; re-read as landed): any sentence that says the inspector's concept body is plan C's own, or that `KnowledgeGraphProps` lists every host hook, goes false with `renderConceptPanel`.

  Commit.

- [ ] **Step 4: D6 — the switch changes no data (27.528–27.529)**

  `packages/app-core/test/semantic-switch-writes-nothing.test.tsx`. Mount the host component plan C Task 9 wired, with:
  - a recording `DataSource` whose `ingest` and every non-GET transport call are spies;
  - a recording `localStorage`.

  The cases:
  - **27.528** Toggle Semantic layer Off, On, Off:
    - `ingest` is never called;
    - no non-GET request is made;
    - `getPreferences` / `putPreferences` and every workspace-settings call are never called;
    - the recorded `setItem` calls are EXACTLY three, every one on key `SEMANTIC_KEY` (`'gn-kg-semantic'`), the last one writing the Off value plan C's `writeSemantic` writes. ("The ONLY storage write is the key" was also true of a switch that wrote nothing at all.)

    Control in the same `it`: with the switch back On, clicking "Remove from concept" in a concept panel DOES call `ingest`, so the spies are live.

    Kills: none of this task's code implements the switch; it guards plan C's view-only switch (spec C §6.4) and this task's host wiring. Concrete mutants it must turn red: (a) `ConceptInspector` (or the host's `renderConceptPanel`) ingesting anything on mount or unmount (a "seen" write); (b) the host persisting the switch through `putPreferences` as well as `localStorage`.
  - **27.529** The concept data is unchanged by the switch:
    - over the ONLINE data source with a recording `http` (not the fake data source, which would hand back the object the test gave it), `getConcept(CP)` issues the same GET path before and after an Off→On cycle, and the path carries no `semantic` parameter;
    - the ring source's requests differ only by the `concepts` group (plan C's `fetchGroups`): Off's `groups=` lacks `concepts`, On's has it, and every other query parameter is identical.

    The MCP half is 27.513 (Task 6).

    Kills: (a) `getConcept`'s path gains `?semantic=${readSemantic() ? 'on' : 'off'}` → the same-path leg reds; (b) the host drops `concepts` AND another group when Off → the "only by `concepts`" leg reds. ("`getConcept(CP)` answers byte-equal" against a fake data source could not fail: the fake answers the fixture whatever the switch does.)

  **Prose to sweep (Step 4's commit):** none: the step adds a test file only (searched: `semantic`, `gn-kg-semantic` in `packages/app-core/src`, `Features.md`).

  Run, then commit.

- [ ] **Step 5: The browser case (27.530) and the ratchet (27.531–27.532)**
  - **27.530** `packages/knowledge-graph-browser/tests/concepts.spec.ts`. Plan C's harness (`http://localhost:3191/…`) with a fixture holding one confirmed concept and one suggestion, using plan C's `waitStill` helper:
    - the confirmed pill and the suggested pill are both drawn (sample their canvas pixels the way plan C's 27.26x cases do: re-read and cite);
    - clicking the suggested pill opens a panel with "Suggested" and "Confirm";
    - Semantic Off removes both pills.

    Control: On draws them again.

    Kills: (a) drop the `props.item.suggested ?` branch in `ConceptInspector` (always `ConfirmedPanel`) → the suggested pill's panel has no "Suggested" / "Confirm"; (b) the host passes `renderConceptPanel` only for `suggested === false` items → clicking the suggested pill shows plan C's default body.
  - **27.531** The colour scan and `ui.css` block checks (plan C's `colour-scan` case and the CSS structure test, re-run) pass with the new block. Precondition: the scan's input includes the `/* KG: D concept */` block (assert the block's first selector is among the scanned rules), so a block outside the scanned region cannot pass by not being read.

    Kills: (a) a raw `#hex` or `rgb(…)` in the `/* KG: D concept */` block → the colour scan reds; (b) the block placed below `/* KG: end */` → the structure check reds (plan C's check; re-read what it asserts as landed).
  - **27.532** `KNOWN_D2_GAPS`:
    - remove the `surface` leg for `manage_concept`, `link_concepts` and `resolve_suggestion`. Their markers `gn-kg-concept-inspector` and `gn-kg-concept-links` now exist in `packages/app-core/src/views/concept-inspector.tsx`, the file T7's `KG` constant already names;
    - 27.517 is green with the smaller ratchet.

    Control: re-adding one removed leg to the ratchet reds 27.517.

    Kills: (a) rename the links list's class `gn-kg-concept-links` → `gn-kg-concept__links` in `concept-inspector.tsx` → `link_concepts`' surface fails and 27.517 reds; (b) leave `resolve_suggestion`'s `surface` leg in `KNOWN_D2_GAPS` → 27.517 reds (fixed but still listed).

  Run: the browser package (`pnpm --filter @gisik-nokma/knowledge-graph-browser test`, per plan C), the server `test/mcp/d2-audit.test.ts`, and the ui suite (logged).

  **Prose to sweep (Step 5's commit):** `packages/mcp-server/src/tools/write-audit.ts` — the `why` strings of the three removed `KNOWN_D2_GAPS` legs go with them, and the `KG` constant's comment ("Task 8 creates it") becomes past tense. Otherwise none found (searched: `KNOWN_D2_GAPS`, `surface` in `Features.md` §24 D's T7 bullet, `test-cases/27-knowledge-graph.md` 27.517).

  Commit.

- [ ] **Step 6: Features, flips, battery**
  - Flip 27.520–27.532 ✅.
  - Features §24 D, under `<!-- D T8 -->`: `✅ Concept inspector in the Knowledge Graph: items with Remove from concept, links, Rename, Delete, "Claude, for …" attribution; suggestions with Confirm (name prefilled, narrowing sentence) and Reject — packages/app-core/src/views/concept-inspector.tsx`.
  - Run the full battery: build → typecheck → app-core, knowledge-graph, web, ui, server `test/mcp`, and the browser package. Then `check:*`. LOCAL. Push, then DONE.

### Task 9: The Concepts row on ticket and note Details, concept history, the manual (cases 27.540–27.549)

**Spec:** §6 second and third bullets. **UI work: `frontend-design` applies.** **Needs Task 8 merged** (the reads, `attributionLabel`, `ConceptInspector`'s history slot) and **plan C Task 9** (the semantic preference is importable by app-core).

**Files:**
- Create:
  - `packages/app-core/src/views/concepts-row.tsx`
  - `packages/app-core/test/concepts-row.test.tsx` (27.540–27.544)
  - `packages/app-core/test/concept-history.test.tsx` (27.545)
- Modify:
  - `packages/app-core/src/data-source.ts` (+ online, replica and stubs): `getItemConcepts(workspaceId, item)`;
  - `packages/app-core/src/views/ticket-sheet.tsx:4417-4435`: mount `ConceptsRow` directly ABOVE `TicketNotesSection`;
  - `apps/web/src/notes/note-document.tsx:734` (beside `NoteByline`; the plan said `:710`, which is wrong on the ref): mount it;
  - the phone ticket sheet's Details (grep where `TicketNotesSection` mounts on phone, if separately) and the phone note panel (`apps/web/src/notes/notes-phone-panel.tsx`);
  - `concept-inspector.tsx`: a "History" disclosure;
  - `docs/manual.md`: a "Concepts and suggestions" section;
  - the help content `check:help` reads (re-read the script and the `./help` export of app-core; add an entry if it requires one per feature);
  - `write-audit.ts` `KNOWN_D2_GAPS`: drop `tag_items`' `surface` leg.

**Interfaces:**
- **Produces:**
  - `getItemConcepts(workspaceId: string, item: { kind: 'ticket' | 'note'; id: string }): Promise<ConceptSummary[]>` → `GET /v1/workspaces/:ws/concepts?item=kind:id`;
  - `ConceptsRow` props: `{ workspaceId; item: { kind: 'ticket' | 'note'; id: string }; dataSource; make; onRefusal; onOpenConcept?: (conceptId: string) => void }`.
- **Consumes:** plan C's `readSemantic()` (`packages/knowledge-graph/src/react/semantic-pref.ts`). If app-core may not import `@gisik-nokma/knowledge-graph` at that point, read the key directly with the same try/catch. The key `'gn-kg-semantic'` is plan C's `SEMANTIC_KEY`: import the constant, never retype it.

- [ ] **Step 1: Catalogue**

  Under `<!-- D T9 -->`, add 27.540–27.547 ❌. 27.548–27.549 are reserved.

- [ ] **Step 2: The row (27.540–27.544), tests first**

  `packages/app-core/test/concepts-row.test.tsx` (jsdom, the fake data source):
  - **27.540** With `getItemConcepts` answering [CP, CW], the row reads `Concepts` followed by two pills, each with a remove button labelled `Remove from concept <name>` (CP's and CW's names, each on its own pill). `getItemConcepts` was called with exactly `(ws, { kind: 'ticket', id: T })`.
    - D4 is the server's. The control: an answer of `[]` renders nothing at all (no empty heading), and a 404 renders nothing.

    Kills: (a) the remove button's `aria-label` drops the name (`'Remove from concept'`) → the per-pill label leg reds; (b) `if (shown.length === 0 && toast === null) return null;` deleted → the `[]` control renders an empty `Concepts` heading; (c) call `getItemConcepts(props.workspaceId, { kind: 'ticket', id: props.workspaceId })` (wrong item) → the argument leg reds.
  - **27.541** Removing CP's pill:
    - ingests `concept.item_untagged {itemKind, itemId}` on `{kind:'concept', id: CP}` (the row's item, and CP's id, not CW's);
    - hides the pill at once: the fake `ingest` returns a DEFERRED promise, and CP's pill is absent BEFORE the test resolves it (an instant fake cannot tell "at once" from "after the commit");
    - after the commit, shows a toast with Undo; Undo ingests `concept.item_tagged` with the SAME `{itemKind, itemId}` on CP, and on its commit CP's pill is back.

    Control: a refusal (resolve the deferred with `refused`) restores the pill and calls `onRefusal` with the server's exact `{ rule, reason }`, and shows no toast.

    Kills: (a) move `setHidden((s) => new Set(s).add(c.id))` after the `await` → the pill is still there while the deferred is pending; (b) `undo` ingests `ev(c.id, 'concept.item_untagged')` → the Undo leg sees the wrong type; (c) drop the `setHidden(… n.delete(c.id) …)` after a refusal → the pill does not come back.
  - **27.542** With `localStorage['gn-kg-semantic'] = 'off'` the row renders nothing, and `getItemConcepts` is NOT called. With `'on'` (or unset) it renders. With a throwing `localStorage` it renders (plan C's rule: default On). Same `it`: a row rendered with `'on'` (pills loaded), then the key set to `'off'` and the component re-rendered (`rerender`), renders nothing. (Mounted with `'off'` from the start, `concepts` stays `null`, so the render guard's `!on` is never the deciding term; only an already-loaded row tests it.)

    Kills: (a) drop `if (!on) return;` in the `useEffect` → `getItemConcepts` IS called with `'off'`; (b) drop `!on ||` from the render guard → the re-rendered row keeps its pills; (c) `catch { return false; }` in `semanticOn` → the throwing-storage leg renders nothing. Each leg has its own mutant: the plan's one "drop the `!on` early return" names two different lines.
  - **27.543** `NoteDocument` (web) renders the row for its note (`getItemConcepts` called with `{ kind: 'note', id: <noteId> }`), and the ticket sheet renders it above the Notes section.
    - The ticket-sheet half is DOM order: `ticket-notes` follows the row (`row.compareDocumentPosition(notesSection) & Node.DOCUMENT_POSITION_FOLLOWING`), and both are present (precondition).
    - Control: a ticket with no concepts shows no row.

    Kills: (a) mount `<ConceptsRow` BELOW `<TicketNotesSection` in `ticket-sheet.tsx` → the order leg reds; (b) `note-document.tsx` passes `item={{ kind: 'ticket', id: note.noteId }}` → the note's argument leg reds.
  - **27.544** Phone: the same row in the phone ticket sheet and the phone note panel, at full width. Copy the nearest phone-sheet test's harness and cite it.
    - jsdom has no layout, so "at full width" cannot be MEASURED here: assert the row is a direct child of the Details column the phone sheet already lays out full width (the same parent `TicketNotesSection` has), and do not add a browser case (planner ruling 2026-10-04, Q6: the structural leg is accepted).

    Kills: (a) the phone ticket sheet does not mount `ConceptsRow` → the presence leg reds; (b) mount it inside a narrower wrapper than `TicketNotesSection`'s parent → the same-parent leg reds.

  `packages/app-core/src/views/concepts-row.tsx`:
  ```tsx
  import { SEMANTIC_KEY } from '@gisik-nokma/knowledge-graph';
  import type { ConceptSummary } from '@gisik-nokma/domain';
  import { useEffect, useState } from 'react';
  import type { DataSource } from '../data-source.js';
  import type { MakeSubmitted } from '../submit.js';

  function semanticOn(): boolean {
    try {
      return globalThis.localStorage?.getItem(SEMANTIC_KEY) !== 'off';
    } catch {
      return true; // spec C §6.4 / plan C 27.324: storage that throws means the default, On
    }
  }

  /**
   * Knowledge Graph spec D §6: the item's concepts as removable pills (D2: removable by a member), shown only while the
   * semantic layer is on (D6, a VIEW switch: hiding the row changes no data). D4 is the server's.
   */
  export function ConceptsRow(props: {
    workspaceId: string;
    item: { kind: 'ticket' | 'note'; id: string };
    dataSource: DataSource;
    make: MakeSubmitted;
    onRefusal: (r: { rule: string; reason: string }) => void;
    onOpenConcept?: (conceptId: string) => void;
  }) {
    const on = semanticOn();
    const [concepts, setConcepts] = useState<ConceptSummary[] | null>(null);
    const [hidden, setHidden] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<ConceptSummary | null>(null);
    useEffect(() => {
      if (!on) return;
      props.dataSource.query.getItemConcepts(props.workspaceId, props.item).then(setConcepts, () => setConcepts([]));
    }, [on, props.dataSource, props.workspaceId, props.item.kind, props.item.id]);
    if (!on || concepts === null) return null;
    const shown = concepts.filter((c) => !hidden.has(c.id));
    if (shown.length === 0 && toast === null) return null;
    const ev = (conceptId: string, type: string) =>
      props.make({ workspaceId: props.workspaceId, entity: { kind: 'concept', id: conceptId }, type, payload: { itemKind: props.item.kind, itemId: props.item.id } });
    async function remove(c: ConceptSummary): Promise<void> {
      setHidden((s) => new Set(s).add(c.id));
      const [result] = await props.dataSource.ingest([ev(c.id, 'concept.item_untagged')]);
      if (result?.status === 'committed') { setToast(c); return; }
      setHidden((s) => { const n = new Set(s); n.delete(c.id); return n; });
      if (result === undefined) props.onRefusal({ rule: 'transport', reason: 'The server did not answer this change.' });
      else if (result.status === 'refused') props.onRefusal({ rule: result.rule, reason: result.reason });
      else if (result.status === 'invalid') props.onRefusal({ rule: result.code, reason: result.message });
    }
    async function undo(c: ConceptSummary): Promise<void> {
      setToast(null);
      const [result] = await props.dataSource.ingest([ev(c.id, 'concept.item_tagged')]);
      if (result?.status === 'committed') setHidden((s) => { const n = new Set(s); n.delete(c.id); return n; });
    }
    return (
      <section className="gn-concepts-row" aria-label="Concepts">
        <h4 className="gn-concepts-row__label">Concepts</h4>
        <ul className="gn-concepts-row__pills">
          {shown.map((c) => (
            <li key={c.id} className="gn-concept-pill">
              <button type="button" className="gn-concept-pill__name" onClick={() => props.onOpenConcept?.(c.id)}>{c.name}</button>
              <button type="button" className="gn-concept-pill__remove" aria-label={`Remove from concept ${c.name}`} onClick={() => void remove(c)}>×</button>
            </li>
          ))}
        </ul>
        {toast === null ? null : (
          <div role="status" className="gn-toast">Removed from {toast.name}. <button type="button" className="gn-btn gn-btn--quiet" onClick={() => void undo(toast)}>Undo</button></div>
        )}
      </section>
    );
  }
  ```
  - The D2 audit's `tag_items` marker is `'Remove from concept'`. It appears in this file's `aria-label` template, so 27.517 can find it.
  - If plan C's package exports `SEMANTIC_KEY` from a subpath only, import from there. If app-core cannot depend on `@gisik-nokma/knowledge-graph` (re-read app-core's `package.json` after plan C Task 9; plan C's ticket-sheet tab makes it a dependency), export the key from domain instead and have plan C's `semantic-pref.ts` import it. Choose one and say which.
  - `onOpenConcept` in the ticket-sheet host opens the Knowledge Graph tab centred on `concept:<id>`. Use plan C Task 9's tab-switch handle; re-read it.
  - Mounting:
    - `ticket-sheet.tsx`: directly above `:4424`'s `<TicketNotesSection`, `<ConceptsRow workspaceId={workspaceId} item={{ kind: 'ticket', id: ticketId }} dataSource={dataSource} make={make} onRefusal={(r) => setServerRefusal(r)} />`, using the same props `TicketNotesSection` receives.
    - `ticket-sheet.tsx`'s props above are the ones `<TicketNotesSection` receives at `:4424-4434` (read: `dataSource`, `workspaceId`, `ticketId`, `make`, `onRefusal={(r) => setServerRefusal(r)}`).
    - `note-document.tsx` has no `make` in scope: its `write` builds one per call with `makeSubmittedFactory({ actorId: user.id, origin: 'web' })` (`:542-557`, the factory call at `:544`; the plan said `:522-537`), and its only server-refusal line is the Restore banner's `restoreRefusal` (`:769-773`, class `gn-refusal gn-refusal--server`; the plan said `:744-748`). So, directly after `<NoteByline … />` (`:734`; the plan said `:710`), mount `{user === null ? null : <ConceptsRow workspaceId={note.workspaceId} item={{ kind: 'note', id: note.noteId }} dataSource={dataSource} make={makeSubmittedFactory({ actorId: user.id, origin: 'web' })} onRefusal={(r) => setConceptRefusal(r.reason)} />}`, add `const [conceptRefusal, setConceptRefusal] = useState<string | null>(null);`, and render it under the row in the same `<p role="alert" className="gn-refusal gn-refusal--server">` shape.
  - `ui.css`: a `/* D: concepts row */` block in the ticket-sheet Details region, on the 2026-09-29 layout rules, with pills in plan C's concept tokens.

  Run: build → the app-core and web suites (logged). Expected: PASS.

  Mutation: drop the `!on` early return → 27.542 reds.

  **Prose to sweep (Step 2's commit):**
  - `packages/app-core/src/views/ticket-sheet.tsx:4417-4422` — "THE NOTES SECTION — Subtasks → Notes → Comments, the prototype's own order (spec §10.1)": with the row mounted directly above `<TicketNotesSection` (`:4424`), the Details order is Subtasks → Concepts → Notes → Comments. Amend the comment (and say the Concepts row is spec D §6's, not the prototype's).
  - `docs/manual.md` §15 (Notes, `:1809`…) describes the note's byline (`:1955`: "an attached ticket appears as a badge in the note's own byline"); the row sits under the byline and is described by Step 4's new section, so nothing here goes false. Re-read `:1940-1960` when mounting, in case the byline paragraph lists what sits under it.
  - Plan C's `react/semantic-pref.ts` docblock (NOT on the ref): if it says the key is read only by the Knowledge Graph, app-core's `ConceptsRow` makes that false.

  Commit.

- [ ] **Step 3: Concept history (27.545)**

  In `ConfirmedPanel` (Task 8), add a `<details className="gn-kg-concept__history"><summary>History</summary>…</details>`. When opened, it loads `getConceptHistory(c.id)` and renders `<HistoryList events={events} nameOf={props.nameOf} />`. Extend `HistoryList` with optional `conceptName` and `itemLabel` resolvers passed into `HistoryCopyContext` (`history-list.tsx:61`).
  - The `itemLabel` resolver (`(kind, id) => string | undefined`, Task 3's type per planner ruling 2026-10-04, Q2) answers from the loaded concept's items. Any id NOT among them answers `undefined`, so the sentence reads "a ticket" / "a note". A redacted `''` never reaches the resolver: Task 3's arm reads it as absent and falls through to "a ticket" / "a note" itself.

  `packages/app-core/test/concept-history.test.tsx`, **27.545**:
  - an MCP-made tag reads `Added GN-12 Scroll jumps` with the actor `Claude, for Ama Rangsa`;
  - a redacted untag (`itemId: ''`) reads `Removed a ticket from the concept`;
  - an untag naming an id that is NOT among the loaded concept's items (a real-looking ULID, not `''`) also reads `Removed a ticket from the concept`, while the same event naming a loaded item's id reads `Removed GN-12 Scroll jumps from the concept`.
  - `getConceptHistory` is not called until the `<details>` is opened (precondition: zero calls before, one after).

  Control: a `web` event's actor is the bare name.

  Kills: (a) the `itemLabel` resolver falls back to the id (`?? id`) → the unknown-id leg reads `Removed 01J… from the concept` (the `''` leg is Task 3's arm, killed by 27.456 (d)/(e); planner ruling 2026-10-04, Q2); (b) `HistoryList` does not pass `itemLabel` into `HistoryCopyContext` (`history-list.tsx:61`) → the loaded-item leg reads `Removed a ticket …`; (c) load the history on mount, not on open → the precondition leg sees one call before opening.

  **Prose to sweep (Step 3's commit):**
  - `packages/app-core/src/views/history-list.tsx:6-10` — "The history view IS the ledger, filtered (spec §3). Every entry shows the actor, the origin device, and BOTH CLOCKS": still true, but the docblock's examples are ticket-only; `HistoryList` now also renders a concept's history. Add one line, or nothing if the reviewer judges it still true.
  - `history-list.tsx:61` — `const ctx: HistoryCopyContext = { nameOf, stateName, typeName };`: the code line itself changes; the props docblock above it (`:57`, "Optional resolvers for the sentences — see `HistoryCopyContext`") stays true.
  - Task 3's `HistoryCopyContext.itemLabel` docblock and type (`=> string | undefined`) match this resolver (planner ruling 2026-10-04, Q2); nothing to sweep.

  Commit.

- [ ] **Step 4: The manual, the ratchet (27.546–27.547)**
  - `docs/manual.md`: a "Concepts and suggestions" section covering:
    - what a concept is;
    - who sees one (everyone who can see all its items);
    - the Concepts row and its Remove;
    - suggestions (Suggested, Confirm, Reject; nothing is tagged without a Confirm);
    - the semantic layer switch ("changes what you see, never the data");
    - the MCP tools by name, with "Claude, for <you>" in history.
  - Run `pnpm check:help`. If it requires a help entry per manual section (re-read `scripts/` for it), add the entry.
  - **27.546** `check:help` is green, and the manual's NEW section (the text from its `Concepts and suggestions` heading to the next heading of the same level) contains each of `Concepts`, `Suggested`, `Confirm`, `Reject`, `Semantic layer`, and the five MCP tool names `list_concepts`, `get_concept`, `manage_concept`, `tag_items`, `review_suggestions` (a grep test beside the existing manual checks; cite it). Scope the grep to that section: `docs/manual.md` on the ref already contains `Confirm` once (and `Concepts`, `Suggested`, `Reject`, `Semantic layer` zero times), so a whole-file grep for `Confirm` could not fail. Precondition: the section is found and non-empty, and does NOT contain `Connected assistants` (a §16 phrase), so the bound really stops at the next heading.

    Kills: (a) write the section without the semantic-layer paragraph → `Semantic layer` is missing from the section; (b) name the MCP tools in §16's "What your assistant can do" list instead of the new section → the tool-name leg reds; (c) edit `docs/manual.md` without regenerating `packages/app-core/src/help/content.generated.ts` → `check:help` (`scripts/help-content.mjs --check`, `package.json:24`) reds.
  - **27.547** `KNOWN_D2_GAPS` holds NO concept tool (`tag_items`' surface leg is dropped now), and 27.517 is green. Control: `failuresOf('tag_items')` is `[]`.

    Kills: (a) the remove button's `aria-label` loses the literal `Remove from concept` (e.g. `Untag ${c.name}`) → `tag_items`' surface fails and the control reds; (b) leave `tag_items` in `KNOWN_D2_GAPS` → 27.517 reds (fixed but listed).

  **Prose to sweep (Step 4's commit):**
  - `packages/mcp-server/src/tools/write-audit.ts` — `tag_items`' `KNOWN_D2_GAPS` `why` goes with the row, and the `ROW` constant's comment, if it says the file does not exist yet, goes past tense.
  - `docs/manual.md:3-8` (the introduction: "Where the product cannot do something yet, this manual says so plainly") makes no section count claim; no section index exists to update (searched: `§16`, `sections`, a contents list). Number the new section §17 after §16 (`:2021`), or say why not.
  - Otherwise none found (searched: `concept`, `semantic` in `docs/manual.md`, `packages/app-core/src/help/`).

  Commit.

- [ ] **Step 5: Features, flips, the release battery**
  - Flip 27.540–27.547 ✅.
  - Features §24 D, under `<!-- D T9 -->`: `✅ Concepts row on ticket and note Details (desktop and phone): removable pills with Undo, hidden when the semantic layer is off; concept history with attribution — packages/app-core/src/views/concepts-row.tsx`.
  - Re-read the whole `### D` sub-section of Features §24 and `## 27.D` of file 27: every line is true of the code, there is no `?`, and every ❌ in 27.400–27.547 has either flipped or carries a 🚫 reason.
  - The battery, as the release-PR gate will run it (memory: run `check:env` + `check:tasks` + every `check:*` BEFORE the release PR): build all → typecheck all → every package suite, the server WHOLE, the browser packages → `pnpm check:env`, `check:tasks`, `check:citations`, `check:migrations`, `check:help`. LOCAL. Push, then DONE.

---

## Self-review

**1. Spec coverage**

| Spec | Where |
|---|---|
| §2 Embedding beyond notes (cache table, worker, nudges, deletes, query-time visibility) | Task 2 (27.420–27.429) |
| §3.1 the `concept` kind, nine events, census | Task 3 (27.440–27.455, census 27.447) |
| §3.2 D4 visibility, the narrowing preview | Task 1 `hiddenItems` (27.411–27.412); Task 4 (27.465–27.472, 27.476); Task 8 (27.526) |
| §3.3 who may write | Task 3 door (27.448–27.451) |
| §4.1 pipeline steps 1–6 | Task 1 (pure modules, 27.400–27.407); Task 5 job (27.487–27.490) |
| §4.1 triggers (nightly, 200 changes, 10 min) | Task 5 scheduler (27.491) |
| §4.2 suggestions in the app (D3) | Task 8 (27.524–27.525, 27.530) |
| §4.3 the same through MCP | Task 5 (27.498–27.499) |
| §5.1 read tools (`graph_neighbours`, `graph_path`, `graph_trace`, `similar`, `list_concepts`, `get_concept`, `review_suggestions`, `search` extended) | Tasks 2, 4, 5, 6 |
| §5.2 write tools (`manage_concept`, `tag_items`, `link_concepts`, `resolve_suggestion`) | Tasks 4, 5 |
| §6 app surfaces (KG pills + inspector, Details row, history) | Tasks 8, 9 (pills themselves: plan C) |
| §7 cases 1–9 | 1 → 27.440–27.441; 2 → 27.465–27.472; 3 → 27.448–27.451; 4 → 27.420–27.429; 5 → 27.405–27.407, 27.487–27.490; 6 → 27.408–27.410; 7 → 27.431, 27.474–27.479, 27.498–27.499, 27.511–27.512; 8 → 27.515–27.519, 27.532, 27.547; 9 → 27.513 (MCP half), 27.528–27.529 (data half) |
| §10 measure first, `get_concept` p95 at 500 | Task 1 (bars 27.408–27.410, runtime 27.413, D4 cost 27.414), Task 4 (27.473) |

**2. Placeholder scan.** Every code step carries code. Three places name a re-read instead of pasting a symbol, because the symbol belongs to a plan still being written:
- plan C's LANDED `KnowledgeGraphProps`, inspector and ring hook (Task 8);
- plan C's browser harness (27.530);
- plan A's history arms in `HISTORY_RENDERED_TYPES` (Task 7).

Each names the file to read and what to bind. The `gn-btn` variant names in Tasks 8–9 stand for the class family: the lane takes the landed names from `packages/ui/src/ui.css` under `frontend-design`.

**3. Type consistency.** These were checked across tasks:
- `ConceptSummary`, `ConceptView`, `ConceptAudienceResponse`, `ConceptHistoryResponse` (Task 4) are consumed by name in Tasks 8–9.
- `SuggestionView` (Task 5) carries `signature` and `itemHashes`, which Task 8's Reject sends as `SuggestionRejectedPayload` (Task 5).
- `D2Leg`, `WriteAudit`, `KNOWN_D2_GAPS` (Task 7) are shrunk by Tasks 8–9. T7's `KG` constant names `concept-inspector.tsx`, the file Task 8 creates.
- `attributionLabel(actorName, origin)` (Task 7) is used in Tasks 8–9.
- `hiddenItems` (Task 1) is used in Tasks 4–5.
- `itemKey` / `parseItemKey` (Task 1) are used in Tasks 4–6.

**4. Review Focus.** Each line is pinned:
1. narrowing after tag → 27.468;
2. assignee arm → 27.469, 27.494;
3. trash / restore / purge → 27.452 (with `verify:projections`);
4. embed race → 27.424;
5. narrowing `tag_items` without confirm → 27.476.

**Gaps and contradictions found in the code** (each is handled where cited):
- **G1** `describeEvent` renders ticket history only (`packages/app-core/src/views/history-copy.ts:125-239`). Most existing write tools fail D2 on day one, so Task 7 freezes a ratchet that may only shrink.
- **G2** `SearchHit` has no `kind` (`packages/domain/src/read-models.ts:432-453`); spec §5.1 says "with `kind` per hit". Tickets answer in `hits` and notes in `notes`.
- **G3** The ledger records `origin:'mcp'`, never which client (`packages/mcp-server/src/tools/submit.ts:62-83`). So "Claude" is one constant.
- **G4** `proj_tickets` has no seq (`apps/server/migrations/1787961800000_proj-tickets.sql:73-89`), so staleness is a text hash.
- **G5** A `{signature}` rejection cannot measure "changed by more than half" (§4.1 step 6), so the payload gains `itemHashes`.
- **G6** "untag" is in both §3.3 rows; they collapse to "can see the concept".
- **G7** §2's `item_kind ('ticket'|'comment')` has no room for note comments; they are not embedded.
- **G8** §3.2 is silent on trashed items. D4 ignores them, which keeps the tag (`LIVE_TICKET_WHERE`, `read/visible-where.ts:231`).
- **G9** The partition key cannot model the assignee arm (`apps/server/src/read/assignee-arm.ts:63`), so D4 is re-checked per reader at read time.
- **G10** The edge sentences live in a React/Sigma package (plan C), so they move to domain for the server and MCP.
- **G11** An empty concept is visible to non-guests ("workspace members only", §3.2).
- **G12** Specs A (`typed-links-design.md:161`) and C (`knowledge-graph-view-design.md:130`) say "via Claude"; spec D (`:81`, `:152`) says "Claude, for Ama Rangsa". This plan uses D's form for D's surfaces; the owner should pick one line for A and C.
- **18.140** pins that `ticket.created` does not nudge (`apps/server/test/search/embed-worker.test.ts:279-290`), so a second predicate is added instead of widening `nudgesEmbedding`.
- **18.150** pins meaning search answering tickets with `[]` (`apps/server/src/routes/search.ts:188-193`, `search-notes.test.ts:131-132`). Task 2 amends the case and its catalogue line.
- The registry has no listing (`packages/domain/src/registry.ts:36-40`). Task 3 adds `types()` unless plan A did.
- Plan C's `expand` is private; Task 6 exports it as `expandGraph`.
- Plan B's `proj_references` columns (`source_parent_kind/id`, `target_kind/id`) differ from what plan C's draft selects (`source_ticket`). The planner reconciles B and C before Task 6.
- The spec's `proj_concept_items` lacks `workspace_id`; Task 3 adds it.
- The FINAL tool count in `register.test.ts:87-110` moves with plan A; each task re-counts.
- There are no prod counts in the repo, so Task 1 measures on a seeded synthetic corpus.

**Decisions the spec did not make** (owner to confirm):
- τ = 0.35, measured in Task 1;
- `get_concept` p95 ≤ 150 ms, pipeline ≤ 60 s for 10 000 items, ≥ 4 fixture suggestions;
- hidden and absent concepts get the same refusal (`concept.unknown`);
- merge drops links; no cycle detection;
- confirm only for delete and merge, and for a narrowing tag;
- nightly at 02:00 IST; an in-memory change counter;
- stable suggestion ids (upsert by signature);
- concept history redacts items the reader cannot see now.

---

## Execution handoff

**Order:** T1 ∥ T2 ∥ T3 (day one, beside plans A–C) → T4 → T5 → T6 → T7 → T8 → T9. See the parallelism table above for each task's cross-plan needs.

**Stop gate:**
- Task 1 ends with a report of τ, the runtime, precision, purity, the suggestion count and the p95.
- If any bar misses, Tasks 5, 8 and 9 do not start until the owner rules.
- Tasks 2–4, 6 and 7 still ship.

**Recommended execution:** subagent-driven, one lane per task. The tasks hand each other exact types across nine PRs and two sibling plans, and a shipped mistake here leaks a hidden ticket's existence (D4). A fresh reviewer per task, running the LOCAL battery itself, is the house bar for merges into `release/knowledge-graph`.

## Ledger rows

```
2026-10-03-mcp-graph-semantic-layer	1	todo	-	-	not started (measure first; needs plan A T1 catalogue)
2026-10-03-mcp-graph-semantic-layer	2	todo	-	-	not started (beside T1, T3)
2026-10-03-mcp-graph-semantic-layer	3	todo	-	-	not started (beside T1, T2)
2026-10-03-mcp-graph-semantic-layer	4	todo	-	-	not started (waits for T3)
2026-10-03-mcp-graph-semantic-layer	5	todo	-	-	not started (waits for T1 bars PASSED, T2, T4)
2026-10-03-mcp-graph-semantic-layer	6	todo	-	-	not started (waits for T2, T4, plan C graph-neighbours, plan A links, plan B references)
2026-10-03-mcp-graph-semantic-layer	7	todo	-	-	not started (waits for T4, T5, T6, plan A link_tickets)
2026-10-03-mcp-graph-semantic-layer	8	todo	-	-	not started (waits for T4-T6, plan C T7-T9)
2026-10-03-mcp-graph-semantic-layer	9	todo	-	-	not started (waits for T8)
```

## Planner rulings (2026-10-03)

- **Ledger id:** the bare stem `mcp-graph-semantic-layer`, matching the other plans' rows; `check:tasks` derives ids that way.
- **`proj_references` columns:** plan B's, `source_parent_kind` + `source_parent_id` (see plan C's rulings).
- **D2 known-gap freeze list (Task 7):** accepted. The list may only shrink, and closing the existing gaps is a separate task, not this release.
- **The writer's open decisions stand as written:** τ = 0.35 (re-measured in Task 1), `get_concept` p95 ≤ 150 ms, job ≤ 60 s for 10,000 items, ≥ 4 suggestions on the fixture, the 02:00 IST nightly run, the refusal wording and history redaction in its Self-review, and the amendments to cases 18.140 and 18.150, each with its reason in the catalogue line.
