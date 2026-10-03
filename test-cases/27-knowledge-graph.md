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
- ✅ **27.007 — a committed link event notifies nobody;** control: in the same `it`, a `ticket.assigned` to another member who can see the ticket notifies them. Mutation: route link events into `handleAssigned` → a row appears. (`apps/server/test/notifications/fanout.test.ts`)
<!-- A T2 -->
<!-- A T3 -->
<!-- A T4 -->
<!-- A T5 -->
