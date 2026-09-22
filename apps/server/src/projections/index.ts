import { projContested } from './contested.js';
import { entityHeadsProjection } from './entity-heads.js';
import { projInvites } from './proj-invites.js';
import { notesProjection } from './notes.js';
import { membershipsProjection } from './proj-memberships.js';
import { projProjects } from './proj-projects.js';
import { projVisibility } from './proj-visibility.js';
import { createProjectionRegistry, type ProjectionRegistry } from './registry.js';
import { rollupsProjection } from './rollups.js';
import { searchProjection } from './search.js';
import { ticketCommentsProjection } from './ticket-comments.js';
import { ticketsProjection } from './tickets.js';
import { ticketTypesProjection } from './ticket-types.js';
import { workflowsProjection } from './workflows.js';
import { workspaceSettingsProjection } from './workspace-settings.js';

/**
 * The single wiring point for projections. Server boot, the verify CLI, and
 * tests all call this, so they can never disagree about what is registered.
 * Later plans add their projections here.
 *
 * Registration order IS application order (coordination doc §8), and later
 * plans depend on it, so the pinned order is
 *
 *   proj_entity_heads, proj_workflows, proj_ticket_types, proj_projects,
 *   proj_tickets, proj_rollups, proj_memberships, proj_invites,
 *   proj_visibility, proj_contested, proj_workspace_settings, proj_search,
 *   proj_ticket_comments
 *
 * `proj_projects` is in that list by the owner decision of 2026-08-26 and was
 * MISSING from this comment until Plan 4 Task 9 registered it — coordination
 * doc, "the phrase is this document's own error": what omitted it was the doc
 * comment, not the assertion. §8 is the single source; the comment and the
 * array move together.
 *
 * proj_contested (Plan 10 Task 4) is the one tail entry: §8's order gains it at
 * the END, so appending IS its §8 position. That is a coincidence of where it
 * falls, not an exception to the rule below.
 *
 * A NEW REGISTRANT INSERTS AT ITS §8 POSITION — it does not append. This
 * comment used to say "every new registrant appends", which is only true while
 * the registrants happen to arrive in §8 order and stops being true at the
 * first one that does not. Plan 3 Chain B is that one: proj_ticket_types,
 * proj_tickets and proj_rollups all belong ABOVE proj_memberships, which is
 * already registered below. Appending them would have put proj_rollups before
 * proj_tickets in application order, and proj_rollups reads proj_tickets inside
 * the same ingest transaction. Plan 3 Chain B Task 9 is the first of the three
 * to arrive, and it inserted at position 3 — above proj_projects, which had
 * been sitting at position 2 in the array only because position 3 was empty.
 * All three have now landed; the sentence above is history, not a pending item.
 *
 * proj_workspace_settings (Plan 5 Task 4) is the first registrant §8 names NO
 * position for: §8's list stops at proj_visibility and proj_contested is
 * already past its end, so "after proj_visibility" — the plan's wording — no
 * longer picks a unique slot. It is placed by DEPENDENCY instead, which is the
 * question §8 exists to answer; see the comment on its registration below.
 * proj_search (Plan 5 Task 6) is the second such registrant and is decided the
 * same way.
 *
 * Whatever the position, extend the order assertion in
 * test/projection-order.test.ts in the same commit.
 */
export function buildProjectionRegistry(): ProjectionRegistry {
  const registry = createProjectionRegistry();
  registry.register(entityHeadsProjection);
  registry.register(workflowsProjection);
  // §8 position 3 (Plan 3 Chain B Task 9). It INSERTS above proj_projects,
  // which had been immediately after proj_workflows only because this position
  // was empty. Nothing registered BELOW reads proj_ticket_types — the engine
  // context reads it (Task 12 wired `getTicketTypeDef` onto it) and that runs
  // before any projection — but proj_tickets (position 5) resolves a ticket's
  // type inside the same ingest transaction, so the ladder is applied before
  // anything that could ask about it.
  registry.register(ticketTypesProjection);
  // §8 position 4.
  registry.register(projProjects);
  // §8 position 5 (Plan 3 Chain B Task 10). It INSERTS above proj_memberships,
  // which has been registered since Plan 4 and sits at position 7. Two
  // adjacencies are load-bearing and neither is with proj_memberships: it must
  // apply AFTER proj_workflows and proj_ticket_types, because it resolves a
  // ticket's type and the workflow definition in force inside the same ingest
  // transaction; and it must apply BEFORE proj_rollups (position 6, Task 11),
  // which reads the rows this projection has just written for the same event.
  registry.register(ticketsProjection);
  // §8 position 6 (Plan 3 Chain B Task 11). The adjacency with proj_tickets
  // directly above is the one this projection cannot survive without, and it is
  // load-bearing in THREE places rather than one: the ingest transaction, where
  // this reads the ticket rows the same event just wrote; `rebuildProjection`,
  // which replays this projection alone against the live ticket table; and
  // `tools/verify-projections.ts`, which rebuilds every projection into a
  // shadow schema IN THIS ORDER — under `search_path = verify_shadow, public`
  // the ticket table this reads is the shadow copy, and it is complete only
  // because proj_tickets was replayed first.
  registry.register(rollupsProjection);
  registry.register(membershipsProjection);
  // §8 position amended by Plan 4 Task 14: proj_invites slots directly AFTER
  // proj_memberships. Nothing in this task's own path depends on that
  // adjacency — the invite projection reads no other projection's table — but
  // acceptance appends `membership.granted` and `project.member_added` in the
  // same ingest run, and putting the invitation's own status ahead of the
  // roster rows it causes keeps application order matching causal order for
  // anyone reading the two tables inside one transaction.
  registry.register(projInvites);
  registry.register(projVisibility);
  // The notes series (Plan 1 of 6). Its position is the SPEC's (§6.2: "after
  // `proj_visibility` and `proj_tickets`"), and it is worth saying plainly that
  // no adjacency is load-bearing here in either direction: `apply` reads ONLY
  // its own two tables — `getNoteStateFromDb` selects `proj_notes` and
  // `proj_note_attachments`, both of which this projection owns — and no
  // registered projection reads either table inside an ingest transaction,
  // because Plan 1 ships no reader that runs in one. The reads that DO exist
  // (`read/notes.ts`, `visibility/can-read-note.ts`) are request-path callers,
  // never handlers.
  //
  // Placed at the position the spec names rather than appended, because here the
  // spec HAS a position and appending would be a silent contradiction of it for
  // no benefit. Should a later projection ever read these tables inside a
  // transaction, that is the moment this position becomes load-bearing and must
  // be justified AS an adjacency — and Plan 3's search projection is the first
  // candidate, since `proj_note_search` will read notes.
  registry.register(notesProjection);
  registry.register(projContested);
  // APPENDED because no adjacency is load-bearing here — and appended is NOT a
  // §8 position, because §8 does not name one for this projection (see above).
  // The dependency was read in both directions before this line was written:
  // this projection's `apply` writes its own table and READS nothing, not even
  // its own; and no registered projection reads proj_workspace_settings inside
  // an ingest transaction — `getWorkspaceSettings` is a read-time function the
  // attention and My Work routes call, never a handler. So nothing above it
  // must run first and nothing below it must run after. Should a later
  // projection ever read this table inside a transaction, THAT is the moment
  // this position becomes load-bearing and must be justified as an adjacency.
  registry.register(workspaceSettingsProjection);
  // APPENDED because no adjacency is load-bearing — and appended is NOT a §8
  // position, for the same reason as the entry above: §8's order ends at
  // proj_visibility and names none for this projection either.
  //
  // The dependency was read in BOTH directions before this line was written.
  // Downward: this projection's `apply` writes proj_search and reads NO table
  // at all — not another projection's, not its own — so nothing above it must
  // run first. Upward: no registered projection reads proj_search inside an
  // ingest transaction. It does already have a reader, and naming it is the
  // more useful sentence than "nothing reads it": `compile-filter.ts`'s text
  // clause selects from proj_search, and the `/v1/search` route (Task 12) will
  // too — but both are READ-TIME callers on a request path, never handlers
  // inside an ingest transaction, so neither creates an adjacency here.
  //
  // Should a later projection ever read this table inside a transaction, THAT
  // is the moment this position becomes load-bearing and must be justified as
  // an adjacency.
  registry.register(searchProjection);
  // APPENDED because no adjacency is load-bearing — and appended is NOT a §8
  // position, for the third time and the same reason: §8's order ends at
  // proj_visibility and names none for this projection either.
  //
  // The dependency was read in BOTH directions before this line was written.
  // Downward: `apply` writes proj_ticket_comments and reads NO table at all —
  // not another projection's, not its own — so nothing above it must run first.
  // Upward: no registered projection reads proj_ticket_comments inside an
  // ingest transaction. It does have a reader, and naming it is the more useful
  // sentence than "nothing reads it": the ticket-comments route
  // (`routes/tickets.ts`) selects from it, and that is a READ-TIME caller on a
  // request path, never a handler inside an ingest transaction, so it creates
  // no adjacency here.
  //
  // Should a later projection ever read this table inside a transaction, THAT is
  // the moment this position becomes load-bearing and must be justified as an
  // adjacency.
  registry.register(ticketCommentsProjection);
  return registry;
}
