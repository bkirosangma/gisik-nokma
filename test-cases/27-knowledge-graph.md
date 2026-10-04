# §27 — Knowledge Graph

**Opened 2026-10-03 by the typed-links plan Task 1** (`docs/superpowers/plans/2026-10-03-typed-links.md`; spec `docs/superpowers/specs/2026-10-03-typed-links-design.md`, Knowledge Graph spec A). Mirrors `Features.md` §24. Ships on `release/knowledge-graph`.
3-DIGIT PADDED `27.001`–`27.999`, blocks per SPEC (each plan splits its block per task in its own sub-section):

| Block | Spec | Plan |
|---|---|---|
| 27.001–27.079 | A, typed links | `2026-10-03-typed-links.md`: T1 27.001–27.019 · T2 27.020–27.034 · T3 27.035–27.049 · T4 27.050–27.064 · T5 27.065–27.079 |
| 27.100–27.179 | B, reference index and backlinks | `2026-10-03-reference-index.md` |
| 27.200–27.349 | C, Knowledge Graph view | `2026-10-03-knowledge-graph-view.md` |
| 27.400–27.549 | D, MCP graph query and semantic layer | `2026-10-03-mcp-graph-semantic-layer.md` |
| 27.600–27.659 | E, Home | `2026-10-03-home.md` |

Unused ids in a block stay free for that plan's follow-ups. Plans B–E each add their own `## 27.N` sub-section; merges are unions.

Legend: ✅ covered by a test · ❌ not yet · 🟡 partial · 🧪 manual · 🚫 out of scope, with a reason.

## 27.1 Typed links (spec A)

<!-- A T1 -->
- ✅ **27.001 — `ticket.link_added` / `ticket.link_removed` accept `{kind, targetId}` for each of the three kinds, and refuse an unknown kind, an extra member and a non-ULID target;** control: the valid payload parses as an event on a ticket (`parseEvent(...).ok`, which returns a refusal rather than throwing). Mutation: drop `.strict()` → the extra-member case passes the parse. (`packages/domain/test/ticket-link-events.test.ts`)
- ✅ **27.002 — both types are registered at version 1 against entity kind `ticket` only, and `registrations()` lists every registration exactly once;** control: `parseEvent` refuses a link event filed against a `note` with `entity-kind-mismatch`. (`packages/domain/test/ticket-link-events.test.ts`)
- ✅ **27.003 — the reducer folds links:** `link_added` appends `{kind, targetId}` (a second identical add is a no-op), `link_removed` drops exactly that pair, and removing the last link leaves NO `links` key; control: `ticket.created` writes no `links` key, and a different kind to the same target is a second link. Mutation: write `links: []` on the last removal → the absent-key assertion fails. (`packages/domain/test/ticket-link-events.test.ts`)
- ✅ **27.004 — THE CENSUS (server): every registration whose entity kind includes `ticket` is in `TICKET_EVENT_TYPES` or `BOOTSTRAP_BACKFILL_TYPES`, every `ticket.*` registration is in `TICKET_EVENT_TYPES`, and `payloadIds` names the target of both link types;** the three `purge.*` types (registered against four kinds, the purge pass's own) are the one named exemption. Control: the same census over the registry plus a planted `ticket.planted_for_census` registration reports exactly that type, and a planted non-purge multi-kind type is reported too. Mutation: remove `'ticket.link_removed'` from `TICKET_EVENT_TYPES` → red naming it. (`apps/server/test/census/ticket-vocabulary-census.test.ts`)
- ✅ **27.005 — History narrates both link events from the source's side:** `Linked: blocks GN-142`, `Linked: relates to GN-120`, `Linked: duplicates GN-142`, `Removed link: blocks GN-142`; a withheld target reads `Linked: blocks a ticket you can't see`; an unlabelled payload reads `Linked: blocks another ticket`; an unknown kind falls back to the wire name; 3.183's census covers 20 types (17 + 2 + 1). Control: an unknown type still falls back to the wire name. Mutation: return `event.type` for `ticket.link_removed` → 3.183 red. (`packages/app-core/test/views/history-copy.test.ts`)
- ✅ **27.006 — MCP `redactedPayload` keeps a link's kind and target, and turns a target the server withheld (`targetId: null`) into `target: "a ticket you can't see"`;** control: a `ticket.transitioned` comment is still stripped. Census: every registered type passes through `redactedPayload` without throwing. Mutation: return the payload unchanged for link types → the withheld case shows `targetId: null`. (`packages/mcp-server/test/redacted-payload.test.ts`)
- ✅ **27.007 — a committed link event notifies nobody;** control: in the same `it`, a `ticket.assigned` to another member who can see the ticket notifies them. Mutation: make the link arm call `handleAssigned({ ...env, payload: { assigneeId: <a visible member> } })` → a row appears (routing link events into `handleAssigned` as they are is an equivalent mutation: a link payload has no `assigneeId`, so it addresses nobody). (`apps/server/test/notifications/fanout.test.ts`)
- ✅ **27.008 — a link reads as the table says from either end, and `isTicketLinkEvent` names exactly the two link events;** all six `linkReading(kind, dir)` readings are asserted (blocks / is blocked by; relates to / relates to; duplicates / is duplicated by); control: in the same `it`, `isTicketLinkEvent('ticket.assigned')` is false. Mutations: `blocks.in` → `blocks`; `isTicketLinkEvent` returns false. (`packages/domain/test/ticket-link-events.test.ts`)
<!-- A T2 -->
<!-- A T3 -->
<!-- A T4 -->
<!-- A T5 -->

## 27.2 Reference index and "Linked from" (spec B, 27.100–27.179)

Plan `docs/superpowers/plans/2026-10-03-reference-index.md`; spec `docs/superpowers/specs/2026-10-03-reference-index-design.md`. Blocks: T1 27.100–27.124, T2 27.125–27.139, T3 27.140–27.164, T4 27.165–27.179.

<!-- KG-B T1 -->
- ✅ **27.100 — each reference node (ticketRef, wikiLink, mention) gives its kind, id, ordinal and a marked snippet; a bare key in text is not a reference;** control: the same words with no node give `[]`. (`packages/domain/test/doc-references.test.ts`)
- ✅ **27.101 — nesting: the snippet is the innermost block (list item, table cell), ordinals run in document order, two references in one block mark only their own; an outer block holding a nested paragraph AND a chip of its own marks the right one:** `listItem [para(chip A), chip B]` gives B `GN-1 One [[GN-2 Two]]`, control A `[[GN-1 One]]`. Mutations: `SNIPPET_BLOCK_TYPES.has` → `false`; `counting && !nested` → `counting` (FIX 1, D5). (`packages/domain/test/doc-references.test.ts`)
- ✅ **27.102 — a snippet is at most 160 characters centred on the reference with ellipses; a reference longer than the window is cut inside its marker and keeps both brackets;** control: short text untouched. (`packages/domain/test/doc-references.test.ts`)
- ✅ **27.103 — literal `[[` / `]]` typed by a person are spaced apart, exactly one marker pair remains; a bracket TOUCHING the marker (a title ending or starting with `[` / `]`, a `[` typed before the chip) is spaced too, so Task 2's `splitSnippet` (first `[[`, then the first `]]` after it) recovers exactly the reference's own text and `before` / `after` hold no `[[` or `]]` (FIX 1, F1);** control: a plain chip. Mutations: drop the `[ ` replace; drop the marker-adjacent spacing step. (`packages/domain/test/doc-references.test.ts`)
- ✅ **27.104 — a purged chip reads Deleted item inside another reference's snippet; ids and mentions agree with `collectDocReferences` and `extractMentionedUserIds`.** (`packages/domain/test/doc-references.test.ts`)
- ✅ **27.105 — extraction is total: null, a string, an empty id and a cycle never throw.** (`packages/domain/test/doc-references.test.ts`)
- ✅ **27.106 — a description is indexed at birth and REPLACED by every description claim (same body twice = same rows; null clears).** Mutation: drop the DELETE in `replaceReferences`. (`apps/server/test/projections/proj-references.test.ts`)
- ✅ **27.107 — a note body is indexed at birth and by `note.body_set`.** (`apps/server/test/projections/proj-references.test.ts`)
- ✅ **27.108 — comments on a ticket and on a note: the comment is the source, its parent the ticket/note; edit replaces, delete removes.** Mutation: `comment(event.id)` → `comment(newUlid())`. (`apps/server/test/projections/proj-references.test.ts`)
- ✅ **27.109 — a creation with no description, a redacted creation and a non-body event write nothing.** (`apps/server/test/projections/proj-references.test.ts`)
- ✅ **27.110 — trash keeps the rows; restore changes nothing.** (`apps/server/test/projections/proj-references.test.ts`)
- ✅ **27.111 — the projection's census: every ticket/note/comment event type is a body or says why not.** (`apps/server/test/projections/references-census.test.ts`)
- ✅ **27.112 — the rebuild equals the live table (a ledger-less ghost row is removed); `verifyProjections` is clean; `proj_references` is last in the pinned order.** (`apps/server/test/projections/proj-references.test.ts`, `apps/server/test/projection-order.test.ts`)
- ✅ **27.113 — a purged target leaves no row and no quote (survivors re-derived, including a comment on a note).** Mutation: drop the `!isPurged` filter. (`apps/server/test/purge/purge-references.test.ts`)
- ✅ **27.114 — a purged source takes its own rows and its comments' rows;** control (FIX 1, F5): a source OUTSIDE the purged ticket (a note chipping the same X) keeps its row to X, unchanged. Mutations: drop the `source_parent_*` arms of the erasure DELETE; widen it with `WHERE true OR (…)`. (`apps/server/test/purge/purge-references.test.ts`)
- ✅ **27.115 — a body written after the purge that still chips the purged id writes no row for it and keeps the next ordinal; a rebuild agrees.** Mutation: renumber ordinals after the purged filter. (`apps/server/test/purge/purge-references.test.ts`)
- ✅ **27.116 — a workspace purge empties the workspace's rows; another workspace's stay.** (`apps/server/test/purge/purge-references.test.ts`)
- ✅ **27.117 — `rebuild:projection` reaches a managed database (`DATABASE_CA_CERT` turns TLS on).** (`apps/server/test/tools/rebuild-projection.test.ts`)
- ✅ **27.118 — the rebuild and the boot backfill at the size floor (`REFS_PERF=1`): prod size not supplied; floor used (P=100 000, Q=400 000), on a lane Apple M2 Pro, not the prod instance. Bar (planner ruling A 2026-10-03 13:24): rebuild ≤ 3 × the `proj_search` baseline of the same run, +512 MB both ways, backfill longest entity transaction ≤ 100 ms.** Lines of the passing floor run:
  `refs-perf: 100000 body + 400000 other events on Apple M2 Pro; proj_search 40059 ms (+498 MB); proj_references 86401 ms (+9 MB), 193332 rows`
  `refs-perf: backfill entity replay+commit p50 5.2 ms, p99 9.4 ms, p99.9 19.5 ms, 0 of 15000 over 100 ms, first entity 10.6 ms`
  `refs-perf: backfill 15000 entities in 87013 ms (+7 MB), longest entity transaction 40 ms, 193332 rows`
  `refs-perf: bar — rebuild 86401 ms = 2.16 x the proj_search baseline 40059 ms (limit 3x)`
  Two earlier runs under heavier load: longest entity transaction 110 ms and 159 ms (a single spike each; rebuild 2.60x and 2.21x). 10x headroom (`REFS_PERF_BACKFILL_ONLY=1`, 1M body + 4M other): backfill 150 000 entities in 1 005 938 ms (+0 MB), longest entity transaction 211 ms, p50 5.7 / p99 15.2 / p99.9 48.2 ms, 10 of 150 000 over 100 ms. The 10x whole-ledger rebuild dies on node's default heap (`readLedger` of 5M events, the `proj_search` baseline included): pre-existing for every projection. A gated measurement, not mutated. (`apps/server/test/projections/references-rebuild-perf.test.ts`)
- ✅ **27.119 — first boot: the backfill fills the table from the ledger, records the marker, `verifyProjections` clean.** (`apps/server/test/projections/references-backfill.test.ts`)
- ✅ **27.120 — second boot: with the marker the backfill does nothing;** control: without the marker the same call fills the table. Mutation: drop the `projection_backfills` check. (`apps/server/test/projections/references-backfill.test.ts`)
- ✅ **27.121 — a crash mid-run leaves no marker and the next boot re-runs to completion; an error thrown INSIDE an entity's transaction (FIX 1) rolls that entity back: the run rejects, its deleted rows are back, no marker;** control: the same run with no throw completes. Mutations: write the marker before the entity loop; replace the in-transaction `catch` with `return skipped` (B5). (`apps/server/test/projections/references-backfill.test.ts`)
- ✅ **27.122 — an ingest on the entity being replayed waits for its lock, then lands;** control: the same run, no concurrent event. Mutation: drop `lockEntity` from the backfill's entity transaction. (`apps/server/test/projections/references-backfill.test.ts`)
- ✅ **27.123 — a purge starts while the boot backfill holds a survivor's entity lock and the survivor already has a row to the purged item: both complete, the backfill's rows equal a rebuild, no 40P01 escapes (FIX 1, F2: the purge takes every survivor's lock BEFORE it erases rows, so it never waits for a lock while holding rows the backfill's DELETE needs; the test drives the real `purgeItem`);** control: the same backfill run with no purge. Mutation: `lockSurvivors` after `eraseRows` (deadlock detected). (`apps/server/test/purge/purge-references.test.ts`)
- 27.124 reserved, unused (T1).
<!-- KG-B T2 -->
<!-- KG-B T3 -->
<!-- KG-B T4 -->

## 27.3 Knowledge Graph view (spec C, 27.200–27.349)

Plan `docs/superpowers/plans/2026-10-03-knowledge-graph-view.md`; spec `docs/superpowers/specs/2026-10-03-knowledge-graph-view-design.md`. Each task writes its cases directly below its own anchor.

<!-- KG-C T1 -->
- ✅ **27.200 — the graph wire vocabulary:** every edge kind has a group, `graphRef`/`parseGraphRef` round-trip (an id may contain `:`), `assignee` and `mention` are the `people` group, and the ring order is typed links (blocks < relates < dup) → structure → references → people, newest first within a group; control: an unknown kind, an empty id and a `:`-led ref are refused. Mutations: assignee → `ref`, `dup`/`structure` swapped, newest-first flipped, rank order flipped → RED. (`packages/domain/test/graph.test.ts`)
- ✅ **27.201 — C-scope (`inGraphScope`):** a ticket in a chosen project, a workspace-level note, a person anywhere and the workspace itself are in scope; control: the same ticket in another project, and any item of another workspace, are out. Mutations: workspace test un-negated, empty-project-scope rule, workspace-level-note rule, person rule, project-kind rule → RED. (`packages/domain/test/graph.test.ts`)
- ✅ **27.202 — the renderer seam:** no file outside `packages/knowledge-graph/src/render/sigma/` imports `sigma`, `@sigma/*` or `graphology*` (a resolved-import walk over the TypeScript program); control: the detector does see `program.ts`'s imports. Mutation: `import 'sigma'` in `palette.ts` → RED naming `src/render/palette.ts → sigma`. (`packages/knowledge-graph/test/seam.test.ts`)
- ✅ **27.203 — the seam detector's blind spots:** a side-effect import and a dynamic `import()` are caught; control: a relative import is not flagged. (`packages/knowledge-graph/test/seam.test.ts`)
- ✅ **27.204 — the stress scene** (500 clear cards + 2,000 fog dots + 3,000 edges) draws through the shipped Sigma program and reports its frame rate and worst frame. Headless Chromium is SwiftShader, so the number is recorded, not a GPU number (one run: ~5 fps). (`packages/knowledge-graph-browser/tests/stress.spec.ts`)
- ✅ **27.205 — desktop bar (spec §7), `KG_GPU=1` only:** on a real GPU the FIRST (cold) camera sweep holds ≥ 60 fps with the worst frame ≤ 16.7 ms. LOCAL, Apple M2 Pro (ANGLE Metal), 2026-10-03, six runs after the icon-atlas fix (`ICON_ATLAS_DEBOUNCE_MS = 20` + a render-quiet wait before the first camera move): cold 120.5 fps, worst 9.3 ms; before the fix the cold sweep had 2 frames of 33–58 ms. Mutation: debounce back to 500 ms → RED (worst 58.4 ms). (`packages/knowledge-graph-browser/tests/stress.spec.ts`)
- ✅ **27.206 — phone proxy:** Pixel 7 emulation with a 4× CPU throttle on SwiftShader, measured and printed (5–6.5 fps, worst 200–350 ms), recorded and NOT asserted: it is a floor, not a phone. (`packages/knowledge-graph-browser/tests/stress.spec.ts`)
- 🟡 **27.207 — a real phone:** owner's Samsung Xclipse 950, Android Chrome 154, `stress.html` at 4c6ee0ba (after the icon-atlas fix): 60.5 fps, worst 33.2 ms (before the fix: 43 fps, worst 125 ms) — manual, recorded 2026-10-03; no automated test can hold a real phone. Bar: ≥ 30 fps and worst ≤ 50 ms, cold included.
- ✅ **27.208 — the ring read:** ring 1 of a parent holds its child and the `parent` edge; control: ring 2 holds the grandchild and not the child. Mutation: the walk's `expand(…, frontier, groups, true)` (the `within` AND/OR swapped) → RED (27.208 and 27.211); the `among` arm's AND/OR is an EQUIVALENT mutant (every `among` edge is post-filtered by `upTo` on both ends), so no case claims it. (`apps/server/test/graph/perf.test.ts`)
- ✅ **27.209 — the ring read respects the viewer:** a centre the viewer cannot see answers `null` (the route turns it into 404); controls: the owner reads it, a stranger gets `null`, and a chosen workspace the viewer is not in answers `null` even with a visible centre. Mutations: ticket visibility dropped, the workspace check dropped → RED. Survivors handed to the endpoint task (the smoke world cannot reach them): walking past an out-of-scope item, keeping an edge back to an earlier ring, note visibility dropped. (`apps/server/test/graph/perf.test.ts`)
- ✅ **27.210 — p95 per ring (spec §2.2, §7), `KG_PERF=1` only:** p95 ≤ 150 ms for ring 1 and for a ring of ~500 items (520), as a MEMBER, over a 10,000-ticket / 2,500-note corpus; the 2,000-item page-cap rings are RECORDED, not asserted. LOCAL, Apple M2 Pro under other lanes' load, median of three rounds' p95: hub500 ring 1 19.2 ms, hub500 ring 2 (520 items) 71.5 ms, hub ring 1 26.6 ms; page-cap ring 2 230–370 ms, ring 3 810–1,250 ms across runs. Per-remedy medians (hub500 ring 2): baseline 90.2 → card keys once for the page 81.6 → `among` limited to within-ring edges 73.7 → notes join 78.7 (dropped: no gain). (`apps/server/test/graph/perf.test.ts`)
- ✅ **27.211 — the ring read: a link between two ring items, and the page's card keys:** ring 1 of a parent with two children and a `relates` link BETWEEN the children (a `proj_ticket_links` shim insert) holds the `relates|…` edge (the `among` read) next to the two `parent` edges; control, same `it`: with `relates` off the ring has only the two `parent` edges. The page labels a ticket with its card key from the ENTERED prefixes (`GK` + `PL` + the ledger number), while `title` stays the title. Mutations: `among` emptied → RED; `label: item.label` (the page keys dropped) → RED. (`apps/server/test/graph/perf.test.ts`)
<!-- KG-C T2 -->
- ✅ **27.212 — the ring store:** merging rings unions items and edges and indexes both ends of every edge; an empty last ring with no cursor marks the store exhausted; control: the same edge in a second ring is not added twice, a duplicate item keeps its first copy, and a ring with a cursor does not exhaust (`packages/knowledge-graph/test/engine/model.test.ts`)
- ✅ **27.213 — the walk:** distances and parents by breadth, a link that closes a cycle is one step, ring order puts a typed link before structure; control: no item is visited twice, and nothing past `reach` is walked (`packages/knowledge-graph/test/engine/walk.test.ts`)
- ✅ **27.214 — the walk:** a hidden filter group is not walked; control: switched on, the same item is reached at hop 2 (`packages/knowledge-graph/test/engine/walk.test.ts`)
- ✅ **27.215 — the walk:** an out-of-scope item is reached, marked `out` and never walked past; control: an in-scope item at the same place is walked past (`packages/knowledge-graph/test/engine/walk.test.ts`)
- ✅ **27.216 — the walk:** an edge to an item the store does not hold (the server withheld it) is not followed; control: once the item arrives it is (`packages/knowledge-graph/test/engine/walk.test.ts`)
- ✅ **27.217 — the walk:** ring order is spec §2.2 (typed links, structure, references, people; newest first within a group), not the mockup's label order; control: two `parent` children come newest (larger ULID) first (`packages/knowledge-graph/test/engine/walk.test.ts`)
- ✅ **27.218 — the walk:** a rejected concept (the `gone` set) is skipped; control: without it, it is reached (`packages/knowledge-graph/test/engine/walk.test.ts`)
- ❌ **27.219 — zones:** clear = within the hops, fog = the next ring; control: one hop more moves the fog ring into the clear (`packages/knowledge-graph/test/engine/zones.test.ts`)
- ❌ **27.220 — zones:** the cap of 500 clear items, the rest go to fog, `beyond` counts what is past both (exact counts); a cap reached inside hop 1 at reach 2 reports clear hop 1; control: 499 and exactly 500 candidates are not capped (`packages/knowledge-graph/test/engine/zones.test.ts`)
- ❌ **27.221 — zones:** the fog budget of 2,000 items; control: exactly 2,000 candidates are all kept (`packages/knowledge-graph/test/engine/zones.test.ts`)
- ❌ **27.222 — zones:** an out-of-scope item is fog only beside a clear parent and is counted as outside; control: an in-scope item at the same place is clear (`packages/knowledge-graph/test/engine/zones.test.ts`)
- ❌ **27.223 — zones:** Everything (reach Infinity) reports the farthest clear item as the clear hop; control: a fixed reach reports itself (`packages/knowledge-graph/test/engine/zones.test.ts`)
- ❌ **27.224 — zones:** semantic layer Off: concepts are neither drawn nor walked; control: On, they are (`packages/knowledge-graph/test/engine/zones.test.ts`)
- ❌ **27.225 — labels:** long names truncate with an ellipsis by code point, never splitting an emoji (Review Focus 4); control: a short name is untouched (`packages/knowledge-graph/test/engine/levels.test.ts`)
- ❌ **27.226 — levels by hop:** desktop card → chip → compact → dot, phone cardS → tap, fog past the clear hop; control: Home uses the desktop levels (`packages/knowledge-graph/test/engine/levels.test.ts`)
- ❌ **27.227 — labels:** a ticket shows its key; a note shows "Note" on a card or desktop chip, else its title; a person their first name on a phone or at compact; control: dot and fog have no label (`packages/knowledge-graph/test/engine/levels.test.ts`)
- ❌ **27.228 — the second line:** the title on a card (34), a desktop chip (24) or the phone card (22); none on a phone tap or at compact; control: a person has none (`packages/knowledge-graph/test/engine/levels.test.ts`)
- ❌ **27.229 — layout:** the centre sits at 0,0 and hop 1 spreads evenly from 12 o'clock on the first ellipse; control: the radii are the mockup's `CFG` (`packages/knowledge-graph/test/engine/layout.test.ts`)
- ❌ **27.230 — layout:** children sit under their parent's angle, at least the ring's minimum step apart; control: a single child sits exactly on its parent's angle (`packages/knowledge-graph/test/engine/layout.test.ts`)
- ❌ **27.231 — layout:** a radius past the table grows by 60 and 40 per hop; control: inside the table it is the table (`packages/knowledge-graph/test/engine/layout.test.ts`)
- ❌ **27.232 — edge sentences:** every edge kind reads both ways, and a suggested tag reads "may include" / "may belong to"; control: `relates` is symmetric and no kind falls through (`packages/knowledge-graph/test/engine/sentences.test.ts`)
- ❌ **27.233 — edge sentences:** the spec's three example sentences verbatim (§2.1), assignee reading person → ticket; control: the sentence always reads from the source (`packages/knowledge-graph/test/engine/sentences.test.ts`)
- ❌ **27.234 — provenance:** who, when (IST, en-GB) and ", via Claude" for an MCP origin; control: a web origin has no "via", no author gives the date alone, and no author or date gives no line (`packages/knowledge-graph/test/engine/sentences.test.ts`)
- ❌ **27.235 — how each edge kind came to be (the mockup's `how`), and a suggested tag's model sentence; control:** every kind has one, and a confirmed tag has the plain one (`packages/knowledge-graph/test/engine/sentences.test.ts`)
<!-- KG-C T3 -->
<!-- KG-C T4 -->
<!-- KG-C T5 -->
<!-- KG-C T6 -->
<!-- KG-C T7 -->
<!-- KG-C T8 -->
<!-- KG-C T9 -->

## 27.4 MCP graph query and semantic layer (spec D, 27.400–27.549)

Plan `docs/superpowers/plans/2026-10-03-mcp-graph-semantic-layer.md`; spec `docs/superpowers/specs/2026-10-03-mcp-graph-semantic-layer-design.md`. Each task writes its cases directly below its own anchor.

- ✅ **27.400 — kNN keeps at most k neighbours at cosine ≥ τ, symmetric (an edge kept by either end), each pair once;** control: τ raised past the pair drops it. Mutations: drop `offer(j, i)` → red; drop the τ filter → red; no k cap → red; offer comparator flipped → red. (`apps/server/test/semantic/pipeline.test.ts`)
- ✅ **27.401 — `communities` splits two cliques; the same seed gives the same result, also on a 60-ring (many tied partitions);** control: one uniform 8-clique is one community, and the ring is seed-sensitive. Mutations: each node its own community → red; `Math.random` as the rng → red. (`pipeline.test.ts`)
- ✅ **27.402 — `topTerms` (class-based TF-IDF) ranks distinguishing words first and drops stop words;** control: a word shared by every class ranks below a distinctive one. Mutations: no stop words → red; no idf → red; term comparator flipped → red. (`pipeline.test.ts`)
- ✅ **27.403 — signatures are order-free; "changed by more than half" is Jaccard distance > 0.5;** control: exactly half is not more. Mutations: `>= 0.5` → red; unsorted signature → red. (`pipeline.test.ts`)
- ✅ **27.404 — audience keys: tickets by resolved audience, notes by scope, an explicit note counts its author;** control: another project gives another key. Mutations: drop the author → red; project key ignores the project → red; inherit never collapses → red. (`pipeline.test.ts`)
- ✅ **27.405 — partitions never mix audiences:** two audiences of near-identical text give two suggestions, mixed input to one partition throws, and `suggestAll` returns partitions in key order (`['e:u1', 'w']` for the input and for its reverse, so a run is deterministic); control: the same items in one audience give one suggestion. Mutations: no throw → red; `suggestAll` merges partitions → red; partition order reversed (`.sort().reverse()`) → red. (`pipeline.test.ts`)
- ✅ **27.406 — a rejected suggestion is skipped unless its set changed by more than half;** control: an unrelated rejection does not skip. Mutation: inverted check → red. (`pipeline.test.ts`)
- ✅ **27.407 — sizes 3–12 are kept, and a community already ≥ 50% in one concept is skipped;** control: one tagged item of four does not skip, and a pair beside a four is dropped by the size filter. Mutations: half strict → red; no max size → red; no in-community min size → red. EQUIVALENT: dropping the early `items.length < minSize` return (the in-community filter covers it). (`pipeline.test.ts`)
- ✅ **27.408 — `similar()` top-5 precision ≥ 0.6 on the labelled 60:** MEASURED 0.847 (LOCAL, real model); control: shuffled labels fall below 0.4; `precisionAt5` also excludes the item itself (groups of five → 0.8, six → 1.0). Mutations: label always matches → red; counts self → red; comparator flipped → red. (`apps/server/test/semantic/quality.test.ts`)
- ✅ **27.409 — suggestion purity ≥ 0.7 with ≥ 4 suggestions at `SUGGESTION_TAU`:** MEASURED τ 0.35, 6 suggestions, 59 of 60 covered, purity 0.966 (LOCAL); control: τ 0.80 keeps none. Mutations: purity min not max → red; `SUGGESTION_MIN_SIZE` 1 → red. (`quality.test.ts`)
- ✅ **27.410 — `SUGGESTION_TAU` is the measured choice (`selectTau` = 0.35; the sweep table is in `constants.ts`);** control: an impossible bar selects null, and the same purity bar (0.99) with `minSuggestions` 4 selects null while `minSuggestions` 1 selects 0.60. Mutations: τ 0.40 → red; τ 0.30 → red; tie to the lower τ → red; ignore the purity bar → red; ignore the min-suggestions bar → red. (`quality.test.ts`)
- ✅ **27.411 — `hiddenItems` is live minus visible:** a listed guest loses the project-mode ticket, the project-scoped note, the workspace-scoped note and the workspace-mode ticket TW, and keeps the explicit-mode ticket and the explicit note; a missing `proj_visibility` row hides (fail-closed); a trashed ticket and a deleted note are ignored; control: a listed member, a member outside the project (Rule A: members read every project) and the owner lose nothing, TW included. Mutations: LEFT JOIN + OR IS NULL → red; live tickets ignore trash → red; live notes ignore deleted → red; tickets visible := TRUE → red; notes visible := TRUE → red; a guest treated as a member for tickets (M411g) → red (only TW kills it). (`apps/server/test/read/item-visibility.test.ts`)
- ✅ **27.412 — `hiddenItems` agrees with `canSee` / `canReadNoteById` for every user × item** (7 users × TP, TE, TW and the 5 notes); control: the table is not constant. Mutations: tickets visible := TRUE → red; notes visible := TRUE → red; a guest treated as a member for tickets (M411g) → red. (`item-visibility.test.ts`)
- ✅ **27.413 — (gated `SEMANTIC_PERF=1`) the pipeline on a 10 000-item partition takes ≤ 60 s:** MEASURED 20 374 ms (LOCAL, Apple M2 Pro ×10, 16 GB, Node 22.22.2, other lanes sharing the machine; `semantic:measure` 27 961 ms); 500 = 72 ms, 2 000 = 847 ms; control: 500 items take less than 10 000, and 10 000 take over 1 s. Mutation: kNN off → red. (`apps/server/test/semantic/perf.test.ts`)
- ✅ **27.414 — (gated) `hiddenItems` over 500 items, 100 runs, p95 ≤ 150 ms:** MEASURED p50 2.6 ms, p95 3.1 ms (LOCAL, same machine); control: it found exactly the 10 hidden. Mutation: ticket arm off → red. (`perf.test.ts`)
- ✅ **27.415 — `meanUnit` averages unit vectors then renormalises to unit length;** control: opposite vectors (zero norm), no vectors and a wrong width all throw. Mutation: no renormalise → red. (`pipeline.test.ts`)
<!-- D T1 -->
<!-- D T2 -->
<!-- D T3 -->
<!-- D T4 -->
<!-- D T5 -->
<!-- D T6 -->
<!-- D T7 -->
<!-- D T8 -->
<!-- D T9 -->

## 27.5 Home (spec E, 27.600–27.659)

Plan `docs/superpowers/plans/2026-10-03-home.md`; spec `docs/superpowers/specs/2026-10-03-home-design.md`.

<!-- KG-E T1 -->
- ✅ **27.600 — the home read meets p95 ≤ 120 ms on a prod-sized copy, for the owner (TRUE predicate) and a member (audience + assignee arms), BEFORE the route is registered:** LOCAL 2026-10-04, Node 22.22.2, darwin/arm64, 10 000 tickets / 2 000 notes (prod counts not supplied; floor used), 15 429 events seeded: **owner p95 59.8 ms, member p95 47.5 ms** over 100 reads each. Gated like 18.162 (`HOME_PERF=1`; skipped runs print what they would measure). (`apps/server/test/routes/home-perf.test.ts`)
- ✅ **27.601 — Tickets is every visible live ticket, newest first (`ticket_id DESC`):** a done, a closed and a cleared-date ticket are in; the trashed one is not; `counts.tickets` is the length of `ids.tickets` below the cap; control: the trashed row still exists in `proj_tickets`. Mutations: drop `LIVE_TICKET_WHERE`; `ORDER BY … ASC` → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.602 — Open excludes a terminal ticket and a closed one (D-E1);** control: a cleared-date and a due-today ticket are open. Mutation: drop `|| row.closed` → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.603 — the IST boundary:** yesterday is Past due, today is Due soon, and today turns Past due at 18:30:00.000Z exactly (the 21.243 pair, called straight on `readHome`); Past due lists by due day ascending then id ascending, and Due soon by due day, each read as the exact order of the fixture ids (a fixture with the older day AND the smallest id, and a same-day pair created high id first, break id DESC, id ASC and a flat tiebreak at once). Mutations: `classifyDue` given yesterday as today; the day sort flipped; `pastDue.sort` deleted → red; `dueSoon.sort` deleted → red; the id tiebreak → `0` → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.604 — the window edge follows the workspace's `dueSoonDays`:** N = 3 admits the 23rd and not the 24th, N = 0 is today only (and `dueSoonDays === 0` on the response); control: N = 4 admits the 24th. Mutation: horizon from a constant 7 → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.605 — a cleared due date and a done or closed ticket's past date are in neither Past due nor Due soon;** control: the live overdue ticket is. Mutations: classify terminal/closed tickets; weaken the claimed-only guard → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.606 — the trash:** a trashed ticket is in no list, and deleting a project takes its tickets out of all four ticket lists and its notes out of Notes; control: before the delete they were counted. Mutations: inline `t.deleted_at IS NULL` for `LIVE_TICKET_WHERE`; `NOTE_PROJECT_LIVE_WHERE` → `TRUE` → red. Declared last in its file. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.607 — Notes counts the live ones, newest first (`updated_at DESC`):** a deleted note is out; `counts.notes` is the length of `ids.notes`. Mutations: drop `n.deleted = FALSE`; `ASC` → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.608 — Members is the roster rule in one expression:** for owner, admin and member `counts.members` = `visibleMemberCount` = `readMembers(...).length`, and `ids.members` is the roster's ids in order; control: the owner's count includes the guest and the member's does not. Mutation: `visibleMemberIds` passes `true` for `includeGuests` → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.609 — visibility:** the member never sees the hidden ticket in Tickets or Open, every id the member gets the owner gets too, and the member's count is smaller; control: the owner's ids hold it. Notes follow the same rule: a note naming only the owner is in the owner's Notes and not the member's, the member holds the workspace-scoped note, and `counts.notes` is the member's own list length. Mutations: `visibleTicketsWhere` → `TRUE` → red; `visibleNotesWhere` → `TRUE` → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.610 — a count is never capped:** `capIds` gives 2,000 of 2,001 in order, 2,000 of 2,000, none of none; and `counts.tickets` equals an independent `COUNT(*)` over the live tickets. Mutation: `counts.tickets` from the capped ids, with `HOME_ID_CAP` patched to 2 in a scratch run (domain rebuilt before and after) → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.611 — Past due and Due soon equal the attention strip's overdue and due-soon buckets** for the owner and the member (D-E2, the same clock); control: both buckets are non-empty for the owner. Mutation: terminal tickets reach the due classification → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.612 — doors:** no session or a forged bearer is 401; a stranger and an unknown workspace id get one identical 404 (body and `content-length`); control: a member is 200. Mutation: 404 → 403 → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.613 — tenancy:** the owner never sees the neighbour workspace's overdue ticket; control: the neighbour's owner does, on their own workspace. The same holds for Notes: the neighbour's workspace-scoped note is not in this owner's `ids.notes` and is in the neighbour's own. Mutations: drop `t.workspace_id = $1` → red; the note filter `n.workspace_id` → `TRUE` → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.614 — `generatedAt` is the route's clock and `workspaceId` is echoed;** control: a second app with another clock answers its own instant. Mutation: `new Date()` for `now` → red. (`apps/server/test/routes/home.test.ts`)
- ✅ **27.615 — MCP `get_workspace` carries `home: { counts, dueSoonDays }`** (D-E9): one GET per live call, no `ids` in the answer, a guest's `members: null` passed through as null, and a deleted workspace makes no home GET; 14.305's exact shape widened in the same commit. Mutation: omit `home` → red. (`packages/mcp-server/test/workspace-tools.test.ts`; the real GET is driven by `apps/server/test/mcp/in-process-fetch.test.ts`)
- ✅ **27.616 — a guest (D-E3):** `counts.members` is `null` (not 0) and `ids.members` is `[]`; their tickets are their own slice (the shared one in, the hidden one out); control: a member's Members is a number. Notes: a guest is not told the id of a workspace-scoped note or of an owner-only one, `counts.notes` is the length of their own `ids.notes`, and a note that names the guest IS in their list (the member holds the workspace-scoped note and not the guest's). Mutations: the guest's members answered `0` → red; `visibleNotesWhere` → `TRUE` → red. (`apps/server/test/routes/home.test.ts`)
- 27.617–27.619 are reserved and unused.

<!-- KG-E T2 -->

<!-- KG-E T3 -->

<!-- KG-E T4 -->

<!-- KG-E end -->
