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
<!-- KG-B T2 -->
<!-- KG-B T3 -->
<!-- KG-B T4 -->

## 27.3 Knowledge Graph view (spec C, 27.200–27.349)

Plan `docs/superpowers/plans/2026-10-03-knowledge-graph-view.md`; spec `docs/superpowers/specs/2026-10-03-knowledge-graph-view-design.md`. Each task writes its cases directly below its own anchor.

<!-- KG-C T1 -->
<!-- KG-C T2 -->
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

<!-- KG-E T2 -->

<!-- KG-E T3 -->

<!-- KG-E T4 -->

<!-- KG-E end -->
