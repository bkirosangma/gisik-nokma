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
- ✅ **27.200 — the graph wire vocabulary:** every edge kind has a group, `graphRef`/`parseGraphRef` round-trip (an id may contain `:`), `assignee` and `mention` are the `people` group, and the ring order is typed links (blocks < relates < dup) → structure → references → people, newest first within a group; control: an unknown kind, an empty id and a `:`-led ref are refused. Mutations: assignee → `ref`, `dup`/`structure` swapped, newest-first flipped, rank order flipped → RED. (`packages/domain/test/graph.test.ts`)
- ✅ **27.201 — C-scope (`inGraphScope`):** a ticket in a chosen project, a workspace-level note, a person anywhere and the workspace itself are in scope; control: the same ticket in another project, and any item of another workspace, are out. Mutations: workspace test un-negated, empty-project-scope rule, workspace-level-note rule, person rule, project-kind rule → RED. (`packages/domain/test/graph.test.ts`)
- ✅ **27.202 — the renderer seam:** no file outside `packages/knowledge-graph/src/render/sigma/` imports `sigma`, `@sigma/*` or `graphology*` (a resolved-import walk over the TypeScript program); control: the detector does see `program.ts`'s imports. Mutation: `import 'sigma'` in `palette.ts` → RED naming `src/render/palette.ts → sigma`. (`packages/knowledge-graph/test/seam.test.ts`)
- ✅ **27.203 — the seam detector's blind spots:** a side-effect import and a dynamic `import()` are caught; control: a relative import is not flagged. (`packages/knowledge-graph/test/seam.test.ts`)
- ✅ **27.204 — the stress scene** (500 clear cards + 2,000 fog dots + 3,000 edges) draws through the shipped Sigma program and reports its frame rate and worst frame. Headless Chromium is SwiftShader, so the number is recorded, not a GPU number (one run: ~5 fps). (`packages/knowledge-graph-browser/tests/stress.spec.ts`)
- ✅ **27.205 — desktop bar (spec §7), `KG_GPU=1` only:** on a real GPU the FIRST (cold) camera sweep holds ≥ 60 fps with the worst frame ≤ 16.7 ms. LOCAL, Apple M2 Pro (ANGLE Metal), 2026-10-03, six runs after the icon-atlas fix (`ICON_ATLAS_DEBOUNCE_MS = 20` + a render-quiet wait before the first camera move): cold 120.5 fps, worst 9.3 ms; before the fix the cold sweep had 2 frames of 33–58 ms. Mutation: debounce back to 500 ms → RED (worst 58.4 ms). (`packages/knowledge-graph-browser/tests/stress.spec.ts`)
- ✅ **27.206 — phone proxy:** Pixel 7 emulation with a 4× CPU throttle on SwiftShader, measured and printed (5–6.5 fps, worst 200–350 ms), recorded and NOT asserted: it is a floor, not a phone. (`packages/knowledge-graph-browser/tests/stress.spec.ts`)
- 🟡 **27.207 — a real phone:** owner's Samsung Xclipse 950, Android Chrome 154, `stress.html` at 4c6ee0ba (after the icon-atlas fix): 60.5 fps, worst 33.2 ms (before the fix: 43 fps, worst 125 ms) — manual, recorded 2026-10-03; no automated test can hold a real phone. Bar: ≥ 30 fps and worst ≤ 50 ms, cold included.
- ✅ **27.208 — the ring read:** ring 1 of a parent holds its child and the `parent` edge; control: ring 2 holds the grandchild and not the child. Mutation: the `within` AND/OR swapped in the parent query → RED. (`apps/server/test/graph/perf.test.ts`)
- ✅ **27.209 — the ring read respects the viewer:** a centre the viewer cannot see answers `null` (the route turns it into 404); controls: the owner reads it, a stranger gets `null`, and a chosen workspace the viewer is not in answers `null` even with a visible centre. Mutations: ticket visibility dropped, the workspace check dropped → RED. Survivors handed to the endpoint task (the smoke world cannot reach them): walking past an out-of-scope item, keeping an edge back to an earlier ring, note visibility dropped. (`apps/server/test/graph/perf.test.ts`)
- ✅ **27.210 — p95 per ring (spec §2.2, §7), `KG_PERF=1` only:** p95 ≤ 150 ms for ring 1 and for a ring of ~500 items (520), as a MEMBER, over a 10,000-ticket / 2,500-note corpus; the 2,000-item page-cap rings are RECORDED, not asserted. LOCAL, Apple M2 Pro under other lanes' load, median of three rounds' p95: hub500 ring 1 19.2 ms, hub500 ring 2 (520 items) 71.5 ms, hub ring 1 26.6 ms; page-cap ring 2 230–370 ms, ring 3 810–1,250 ms across runs. Per-remedy medians (hub500 ring 2): baseline 90.2 → card keys once for the page 81.6 → `among` limited to within-ring edges 73.7 → notes join 78.7 (dropped: no gain). (`apps/server/test/graph/perf.test.ts`)
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
