# MCP graph query and semantic layer (Knowledge Graph spec D) — design

**Date:** 2026-10-03.

**Base:** `release/smoothness` @ `dce9ca61`.

**Target branch:** the next release branch (not cut yet).

**Status:** the owner approved the design in conversation on 2026-10-03 (rulings D1–D4 and D6 below). This file is the written spec for review. The series table is in spec A.

**Owner's words:**
- The graph should be "queryable via MCP for LLM search/query", with "a semantic graph layer built through the MCP".
- This "may break the rule that MCP tools need an app control" (restated as D2).
- **D6:** "The semantic/embedded layer shoudld have a switch. on or off." Then: "the on off switch is only for app viewing. view it with or without the semantic layer. but changes nothing about the actual data".

**Rulings:**

| # | Ruling |
|---|---|
| D1 | Concepts AND tags: a concept is a named node; tagging an item puts it in the concept. |
| D2 | **The MCP rule, restated.** Every MCP write is visible in the app, attributed, and removable by a member. This replaces "every MCP tool has an app control". |
| D3 | Model suggestions show faint and dashed in the app, with Confirm and Reject. |
| D4 | A concept is visible only to readers who can see ALL its items. The model clusters within one visibility scope. |
| D5 | *(superseded by D6)* A per-workspace, admin-only three-way Concepts setting. |
| D6 | The on/off switch is a VIEWING switch in the app (spec C §6.4). It changes no data, writes no setting, and does not affect MCP or embedding. No workspace setting is added, and `workspace.settings_set` is unchanged. |

**Hybrid model:**
- The server's own model, `minishlab/potion-base-32M` (already in prod for notes), embeds the items.
- kNN plus Louvain produce SUGGESTIONS.
- The LLM (through MCP) names, merges and curates them.
- **The server never calls an LLM.**

**Assumptions** (correct them at review):
- A guest can read concepts under D4, but cannot create, tag or resolve.
- A suggestion that is rejected is not offered again unless its item set changes by more than half.

## 1. What exists today

- **Model.** `CURRENT_MODEL = 'minishlab/potion-base-32M@static'`, with 512 dimensions (`apps/server/src/search/embedding.ts:106,109`).
- **What is embedded.** Note bodies only, chunked (`packages/domain/src/doc-chunks.ts:73`), into `search_note_chunks … embedding vector(512)`. That table is documented as a cache, not a projection (`1790300000000_note-chunks.sql:44-57`).
- **Worker.** `startEmbedWorker` (`embed-worker.ts:104`) runs on an interval and on nudges (`nudge.ts:42`). It re-embeds when `source_seq` or the model changes.
- **Meaning search.** `meaningNoteSearch` (`read/note-search.ts:300`) uses `<=>` with `visibleNotesWhere`. MCP `search` with `mode:"meaning"` answers notes only (`packages/mcp-server/src/tools/read-tools.ts:64-71`).
- **MCP tools.** `ToolDefinition { name; description; inputSchema; handler }` is collected in `tools/register.ts`. Names are pinned in `test/fixtures/tool-names.ts`. Writes go through `envelopeFor` (`submit.ts:43`), which sets `actorId` and `origin:'mcp'`. Reads call the HTTP API, so they inherit its checks (`tools/reads.ts:6`).
- **The old rule** "every MCP tool has an app control" has no test. The nearest are M-E1 and M-E9 in the mcp-everything spec.

## 2. Embedding beyond notes

- **Cache table.** `search_item_chunks`, with the same shape as `search_note_chunks` plus `item_kind ('ticket'|'comment')` and `item_id`. It is a cache, not a projection.
- **What is embedded:**
  - a ticket: its title + description;
  - a comment: its body.
- **Worker.** The same worker and the same model. Nudges come from `ticket.created`, `ticket.field_set` (title or description) and comment added or edited. Deletes remove the chunks.
- **Visibility** comes at QUERY time (`visibleTicketsWhere`), never stored. A comment follows its ticket.
- **D6 doesn't stop embedding.** Embedding always runs, because the switch is view-only.

## 3. Concepts (the semantic layer's data)

### 3.1 A new entity kind

`concept` joins `ENTITY_KINDS` (`packages/domain/src/envelope.ts:15`). `packages/domain/test/envelope.test.ts:310` pins the exact list, so it is updated in the same change.

| Event (concept entity, version 1) | Payload |
|---|---|
| `concept.created` | `{ name, summary?, fromSuggestion?: suggestionId }` |
| `concept.renamed` | `{ name }` |
| `concept.described` | `{ summary }` |
| `concept.item_tagged` | `{ itemKind: 'ticket'\|'note', itemId }` |
| `concept.item_untagged` | `{ itemKind, itemId }` |
| `concept.linked` | `{ otherId, relation: 'broader'\|'related' }` |
| `concept.unlinked` | `{ otherId, relation }` |
| `concept.merged` | `{ intoId }` (its tags move; this concept is deleted) |
| `concept.deleted` | `{}` |

On the workspace stream, `workspace.concept_suggestion_rejected { signature }` records a rejection (§4.3).

**Projections:**
- `proj_concepts (id, workspace_id, name, summary, created_by, created_at, origin, deleted)`;
- `proj_concept_items (concept_id, item_kind, item_id, tagged_by, tagged_at, origin)`;
- `proj_concept_links (a, b, relation, …)`.

**Census.** Every place listed in spec A §2.6 gains the new types. History text, for example: "Claude, for Ama Rangsa, created the concept Scroll position on phone sheets".

### 3.2 Visibility (D4)

A reader sees a concept only if they can see EVERY tagged item. This is computed at read time from the items' resolved visibility. A concept with no items is visible to workspace members only.

**Tagging into a narrower audience.** Tagging an item whose audience is narrower than the concept's current one shrinks who can see the concept. Both the app and the MCP return a preview first: "Fewer people will see this concept: 3 of 9 members". The write needs confirmation (the house preview shape, `preview.ts:17`).

### 3.3 Who may write

**Create, tag, untag, link, merge and resolve:** a workspace member or above who can see every item involved.

**Delete and untag (D2, "removable by a member"):** any member who can see the concept.

**Guests:** read only.

## 4. Suggestions (model, never an LLM)

### 4.1 Pipeline (server job, per workspace)

1. **Item vectors.** Each item's vector is the mean of its chunk vectors (tickets, notes, comments folded into their ticket).
2. **Partition** items by resolved visibility key (D4: mode + project + explicit set). Clustering never crosses a partition.
3. **kNN graph** within each partition: k = 10, cosine ≥ τ.
4. **Louvain communities** (`graphology-communities-louvain`, pinned) on that graph. Keep communities of 3–12 items that are not already ≥ 50% tagged into one concept.
5. **Provisional label.** The top three distinctive terms by class-based TF-IDF, joined with " · " (for example "drag · column · board").
6. **Signature** = a hash of the sorted item ids. A signature that was rejected is skipped unless the set changed by more than half.

**Output.** Results go to the cache table `sem_suggestions (workspace_id, id, signature, item_kind[], item_id[], terms, score, computed_at)`, which is not a projection.

**When it runs.** Nightly, and after 200 item changes in a workspace (debounced 10 min).

**Measured first** (the plan's first task, on a prod-sized copy):
- τ;
- the job's run time per workspace size;
- a quality bar: on a labelled fixture of 60 items, `similar()` top-5 precision ≥ 0.6 and suggestion purity ≥ 0.7.

If the bars miss, the plan stops and reports before building the UI.

### 4.2 Suggestions in the app (D3)

A suggestion shows in the Knowledge Graph as a faint, dashed concept pill with dashed edges to its items, labelled "Suggested". Its inspector offers:
- **Confirm:** a name field, prefilled from the terms. It writes `concept.created {fromSuggestion}` plus the tags.
- **Reject:** writes `workspace.concept_suggestion_rejected`.

### 4.3 The same through MCP

- `review_suggestions` lists them.
- `resolve_suggestion` accepts (with a name and summary) or rejects.

## 5. MCP tools

### 5.1 Read

| Tool | Input | Returns |
|---|---|---|
| `graph_neighbours` | `{ center:{kind,id}, hops≤4, groups?, scope?:{workspaces,projects} }` | items + edges + sentences, same visibility and scope rules as spec C §2.2 |
| `graph_path` | `{ from, to, maxHops≤6, groups? }` | up to 3 shortest paths, each as a list of sentences |
| `graph_trace` | `{ from, kind:'blocks'\|'parent'\|'duplicates'\|'ref', direction:'out'\|'in', maxDepth≤10 }` | the transitive chain (for example everything that blocks X) |
| `similar` | `{ item:{kind,id}, k≤20 }` | nearest visible items by meaning, with scores |
| `search` (extended) | `mode:"meaning"` now answers tickets and comments as well as notes | the same shape, with `kind` per hit |
| `list_concepts` / `get_concept` | workspace / id | visible concepts, with items (D4) |

### 5.2 Write

| Tool | Does | Events |
|---|---|---|
| `manage_concept` | create, rename, describe, merge, delete | `concept.*` |
| `tag_items` | add or remove items (with the §3.2 preview) | `concept.item_tagged/untagged` |
| `link_concepts` | broader / related, add or remove | `concept.linked/unlinked` |
| `review_suggestions` / `resolve_suggestion` | §4.3 | `concept.created` + tags, or the rejection |

Every write is attributed (`actorId` = the MCP session's user, `origin:'mcp'`). The app shows it as "Claude, for Ama Rangsa" in history and provenance (D2).

**Names.** All the names join `tool-names.ts`.

**Switch.** D6's switch has no effect on any tool.

## 6. App surfaces for D2 (visible, attributed, removable)

- **Knowledge Graph (spec C):** concept pills (confirmed: a solid teal pill; suggested: dashed). The concept inspector shows the summary, its items, who created it and how, Rename, Delete, and untag per item.
- **Ticket and note Details:** a "Concepts" row of pills, each removable (untag), visible when the semantic layer is on.
- **History** for every `concept.*` event.

## 7. Testing and proof

**Case block:** 27.400–27.549.

1. **Domain.** Each payload, and `concept` in `ENTITY_KINDS` (the `envelope.test.ts:310` list).
2. **D4 visibility.** A concept tagged with one hidden item is invisible to that reader, and the control reader who sees all its items sees it. The narrowing preview, and the write after confirmation.
3. **Permissions per §3.3,** each with its control.
4. **Embedding.** Tickets and comments are chunked, re-embedded on change and removed on delete. A meaning search never returns a hidden ticket (the control viewer gets it).
5. **Suggestions.** Partitions never mix audiences (a fixture with two audiences of near-identical text gives two suggestions, not one). Signatures. The rejected skip, and the "changed by more than half" control.
6. **The quality bars on the labelled fixture** (§4.1).
7. **Each MCP tool:** happy path, refusal text, and visibility.
8. **D2 audit test.** For every MCP write tool, the event it emits is rendered by history and appears on an app surface with a remove path. A new write tool without these fails.
9. **D6.** Toggling the switch writes no event and no setting, and the MCP output is unchanged.

## 8. Files (expected)

- `packages/domain/src/envelope.ts`, `events/concept-events.ts` (new), `vocabulary.ts`.
- `apps/server/src/search/*` (item chunks), `apps/server/src/semantic/` (new: the suggestion job, Louvain, terms), migrations for `search_item_chunks`, `sem_suggestions`, `proj_concepts*`.
- `apps/server/src/projections/concepts.ts`, routes for the graph and concept reads.
- `packages/mcp-server/src/tools/graph-tools.ts` (new), `concept-tools.ts` (new), `read-tools.ts` (search), `test/fixtures/tool-names.ts`.
- `packages/knowledge-graph` (concept drawing), `packages/app-core` (Concepts row, inspector, history).
- `Features.md` §24, `test-cases/27-knowledge-graph.md`.

## 9. Out of scope

- The server calling an LLM.
- Concepts across workspaces.
- Automatic tagging without a confirmation.
- Embedding attachments' file contents.

## 10. Risks

- **Suggestion quality** from a static model. This is measured before any UI (§4.1), with a stop-and-report bar.
- **D4's read-time check** on large concepts. The plan measures `get_concept` p95 at 500 items.
- **Census breadth** for a new entity kind. Case 8 and spec A's census test cover it.
