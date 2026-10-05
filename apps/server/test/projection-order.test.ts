import { describe, expect, it } from 'vitest';
import { buildProjectionRegistry } from '../src/projections/index.js';

/**
 * Registration order IS application order (coordination doc §8): the registry
 * applies projections in insertion order inside each ingest transaction, and
 * later plans depend on the pinned order
 *
 *   proj_entity_heads, proj_workflows, proj_ticket_types, proj_projects,
 *   proj_tickets, proj_rollups, proj_memberships, proj_invites,
 *   proj_visibility, proj_contested, proj_workspace_settings, proj_search
 *
 * because a projection may read a table an earlier one wrote in the same
 * transaction (proj_rollups reads proj_tickets, and since Task 11 that is a
 * shipped dependency rather than a forecast one). A guarantee nothing
 * asserts is a guarantee that drifts on the first re-ordering, so the array
 * below is the pin: EVERY later registrant extends it in the same commit that
 * registers its projection.
 *
 * "Extends" means INSERTS AT ITS §8 POSITION, not appends. Plan 4 Task 9's
 * proj_projects was the first registrant to prove that rule rather than state
 * it: §8 puts it fourth, and it went in BETWEEN proj_workflows and
 * proj_memberships, both assertions below moving with it. Plan 3 Chain B Task
 * 9's proj_ticket_types is the second, and the first to insert ABOVE an entry
 * that inserted before it — §8 position 3, so proj_projects moved down one.
 * Chain B Task 10's proj_tickets is the third, and the first to insert into
 * the MIDDLE of the array — §8 position 5, between proj_projects and
 * proj_memberships. Chain B Task 11's proj_rollups is the fourth: §8 position
 * 6, directly after proj_tickets and BEFORE proj_memberships, not after it.
 * Getting that one wrong would not have been a cosmetic ordering slip — it puts
 * proj_rollups ahead of the proj_tickets rows it reads, in the ingest
 * transaction AND in the verifier's shadow rebuild, which replays projections
 * in this same order into `verify_shadow`.
 *
 * Plan 5 Task 4's proj_workspace_settings is the first registrant for which §8
 * NAMES NO POSITION, and it is extended here on different grounds from every
 * entry above it. §8's canonical order (coordination doc line 51) stops at
 * proj_visibility; proj_contested was appended past its end already. So "after
 * proj_visibility" — the phrase Plan 5 Task 4 uses — no longer picks a unique
 * slot, and the deciding question is dependency instead. Both directions were
 * read before this line was written: the projection's `apply` touches its own
 * table and nothing else, and no registered projection reads
 * proj_workspace_settings inside an ingest transaction (`getWorkspaceSettings`
 * is a READ-TIME function for the attention strip, called by routes, never by a
 * handler). Neither adjacency is load-bearing, so appending is correct — and
 * that is the justification, NOT a §8 position this projection does not have.
 *
 * Plan 5 Task 6's proj_search is the SECOND, and it is appended on the same
 * grounds with one difference worth stating rather than smoothing over: this
 * projection already HAS a reader. `src/read/compile-filter.ts`'s text clause
 * selects from proj_search, and the search route (Task 12) will too. Neither is
 * an adjacency, because both are READ-TIME callers on a request path rather
 * than handlers inside an ingest transaction — and "no projection reads it"
 * would have been the sentence that quietly stopped being true. Downward the
 * answer is simpler: `searchProjection.apply` reads no table at all.
 *
 * The rule above is unchanged for anyone §8 does name: insert at your position.
 *
 * Deliberately DB-free — no createTestDatabase, no pool, nothing that could
 * make this ordering contract skippable when Postgres is not running.
 */
describe('projection registration order (coordination §8)', () => {
  /**
   * 5.55 — the registry’s own pins admit `proj_ticket_types` at coordination §8 position 3, an INSERT above `proj_projects`.
   * 5.57 — and `proj_tickets` at position 5, an INSERT into the MIDDLE of the array between `proj_projects` and `proj_memberships`.
   * 5.63 — and `proj_rollups` at position 6, directly after `proj_tickets` and still ABOVE `proj_memberships`. One assertion of the whole pinned order carries all three rows.
   * 6.79 — `proj_projects` INSERTS at its coordination §8 position (fourth) rather than being appended: it is the first registrant to EXERCISE the insert-at-your-position rule instead of stating it. This is the DB-free pin of record the row names; `entity-heads.test.ts` is the second pin, which goes silent when Postgres is down.
   */
  /**
   * 4.42 — the registration order is pinned DB-FREE: `proj_entity_heads` before `proj_workflows`, so a later projection reading an earlier one always finds it applied.
   */
  /**
   * 12.67 — proj_contested is registered directly after proj_visibility, last in the pinned order, in both the DB-free names pin (projection-order.test.ts) and its [name, tables] mirror (also this file, line 149) and the second, DB-required pin in entity-heads.test.ts (line 95-122).
   */
  it('buildProjectionRegistry registers the pinned order: heads, workflows, ticket types, projects, tickets, rollups, memberships, invites, visibility, notes, contested, workspace settings, search, references, concepts, concept rejections', () => {
    const registry = buildProjectionRegistry();
    expect(registry.all().map((projection) => projection.name)).toEqual([
      'proj_entity_heads',
      'proj_workflows',
      // Plan 3 Chain B Task 9. §8 position 3, INSERTED ABOVE proj_projects,
      // which had been sitting directly under proj_workflows only because this
      // position was empty.
      'proj_ticket_types',
      // Plan 4 Task 9 Step 3b. §8 position 4, itself INSERTED rather than
      // appended when it landed: the ticket-creation precondition reads it.
      'proj_projects',
      // Prefixes and groups Task 6: the group tree, directly after the projects it files.
      'proj_groups',
      // Plan 3 Chain B Task 10. §8 position 5 — INSERTED between proj_projects
      // and proj_memberships, which is neither end of this array. It must sit
      // BELOW proj_workflows and proj_ticket_types (it resolves a ticket's type
      // and its workflow definition in the same ingest transaction) and ABOVE
      // proj_rollups, which Task 11 inserted directly after it because that
      // projection reads these rows for the same event.
      'proj_tickets',
      // Plan 3 Chain B Task 11. §8 position 6. The adjacency directly under
      // proj_tickets is the only one this entry cannot survive losing, and it
      // is depended on in three places: the ingest transaction, the live
      // projection-outer rebuild, and the verifier's shadow rebuild, which
      // replays projections in THIS order into `verify_shadow` — so the ticket
      // table proj_rollups reads there is complete only because proj_tickets
      // was replayed before it.
      'proj_rollups',
      // Typed links T2 (27.020). Beside the proj_tickets/proj_rollups pair (`proj_tickets.links` is the source's folded
      // copy of these links) but BELOW proj_rollups, so the adjacency above stays intact. No adjacency is load-bearing
      // for it: `apply` reads only its own rows and `purged_entities`, and no projection reads proj_ticket_links in a
      // transaction.
      'proj_ticket_links',
      'proj_memberships',
      // Plan 4 Task 14. §8 amended to slot it directly after proj_memberships,
      // so this INSERTS above proj_visibility rather than appending.
      'proj_invites',
      'proj_visibility',
      // The notes series, Plan 1 of 6. INSERTED rather than appended, because
      // here the spec HAS a position and names it: notes design doc §6.2 says
      // "after `proj_visibility` and `proj_tickets`". No adjacency is
      // load-bearing in either direction at this commit — `notesProjection.apply`
      // reads only its own two tables, and no registered projection reads them
      // inside an ingest transaction — so this row is the spec's order being
      // followed, not a dependency being discharged. It is placed before
      // `proj_contested` because `proj_contested` was the last entry and
      // "after proj_visibility" admits either side of it; Plan 3's search
      // projection is the first candidate to make this position load-bearing,
      // since `proj_note_search` will read notes.
      'proj_notes',
      // Trash series, Plan 1. INSERTED directly below `proj_notes`: every row a
      // mark can name (workspace, project, ticket, note) already exists by this
      // position, since `proj_projects`, `proj_tickets` and `proj_notes` are all
      // populated by projections registered above it. `proj_workspaces` has no
      // such dependency — its own rows are created BY this projection.
      'proj_lifecycle',
      // Plan 3 of 6 (the notes series' search plan). INSERTED directly below
      // `proj_notes`, and this is the entry that turns the note above it from a
      // forecast into a fact: `proj_note_search`'s `apply` reads `proj_notes`,
      // `proj_note_attachments`, `proj_tickets` and `proj_projects`, so its
      // position is load-bearing in the ingest transaction, in
      // `rebuildProjection`, and in the verifier's shadow rebuild — where
      // `search_path = verify_shadow, public` resolves each of those names to a
      // shadow copy that exists only because those projections replayed first.
      'proj_note_search',
      // Plan 10 Task 4. §8's order gains one TAIL entry, so appending is its §8
      // position here — a coincidence of where it falls, not an exception to
      // the insert-at-your-position rule above.
      'proj_contested',
      // Plan 5 Task 4. APPENDED, and deliberately not described as a §8
      // position: §8's order ends at proj_visibility and proj_contested already
      // sits past it, so there is no slot to insert into. The append is decided
      // by dependency instead — this projection reads no other projection's
      // table, and none reads its table inside an ingest transaction — which is
      // the same question §8 exists to answer, asked directly.
      'proj_workspace_settings',
      // Plan 5 Task 6. APPENDED, for the same reason and by the same question:
      // §8 names no position for it either. `searchProjection.apply` reads no
      // table, and no projection reads proj_search inside an ingest
      // transaction — its readers (compile-filter's text clause, the search
      // route) are read-time callers on a request path.
      'proj_search',
      // Executor 2's comment-thread dispatch. APPENDED, for the third time and
      // by the same question: §8 names no position for it either, so the slot
      // is decided by dependency — `ticketCommentsProjection.apply` reads no
      // table at all, and no projection reads proj_ticket_comments inside an
      // ingest transaction. Its one reader is the ticket-comments route, a
      // read-time caller on a request path.
      'proj_ticket_comments',
      // Knowledge Graph B (27.112). APPENDED: `apply` reads only its own rows and
      // `purged_entities`, and no projection reads proj_references in a transaction.
      'proj_references',
      // Knowledge Graph D (27.443): APPENDED by the same question: `apply` reads only its own rows and
      // `purged_entities`, and no projection reads the concept tables in a transaction.
      'proj_concepts',
      // KG-D T5: APPENDED after proj_concepts by the same question (27.485).
      'proj_concept_rejections',
    ]);
  });

  /**
   * A projection whose `tables` is empty gets no shadow copy in
   * tools/verify-projections.ts, and under that CLI's `search_path =
   * verify_shadow, public` its unqualified SQL then resolves to the LIVE
   * tables: the reset TRUNCATEs live and the replay writes live. So an omitted
   * `tables` is destructive, not merely unverified — pinned here, in the one
   * projection test that runs without Postgres, so it cannot be lost with the
   * database.
   */
  it('every registered projection declares the tables it writes', () => {
    const registry = buildProjectionRegistry();
    expect(
      registry.all().map((projection) => [projection.name, [...projection.tables]]),
    ).toEqual([
      ['proj_entity_heads', ['proj_entity_heads']],
      ['proj_workflows', ['proj_workflows']],
      ['proj_ticket_types', ['proj_ticket_types']],
      // TWO tables (prefixes and groups plan Task 2). `proj_project_prefixes` — the
      // former prefixes — is written in the same `apply` as the row; undeclared,
      // the verifier's shadow replay would resolve it to the LIVE table, empty it and
      // rebuild it in place, and diff nothing (22.025).
      ['proj_projects', ['proj_projects', 'proj_project_prefixes']],
      ['proj_groups', ['proj_groups']],
      ['proj_tickets', ['proj_tickets']],
      ['proj_rollups', ['proj_rollups']],
      ['proj_ticket_links', ['proj_ticket_links']],
      ['proj_memberships', ['proj_memberships']],
      // ONE table, and `invite_tokens` — created by the same migration — is
      // deliberately not it. See the second assertion in this file.
      ['proj_invites', ['proj_invites']],
      ['proj_visibility', ['proj_visibility']],
      // TWO tables, and both are this projection's. `proj_note_attachments` is
      // not a second projection's: the note→ticket links are part of the note's
      // own head-state fold (the reducer owns `attachedTicketIds`), so declaring
      // them here is what keeps `verify-projections` from replaying a note's
      // links into whichever live table the search_path happens to resolve.
      ['proj_notes', ['proj_notes', 'proj_note_attachments']],
      // ONE table — the only one this projection RESETS. It also writes
      // lifecycle columns onto `proj_projects`, `proj_tickets` and `proj_notes`,
      // but does not own those tables: they are each already declared by their
      // owning projection above, so the verifier's shadow copy of them exists
      // and gets diffed regardless (test-cases/19-trash.md 19.015).
      ['proj_lifecycle', ['proj_workspaces']],
      // TWO tables, and BOTH must be declared or the verifier truncates the
      // LIVE one. `proj_note_lexemes` is not a projection of its own: it is
      // derived from the same notes in the same `apply`, and a projection whose
      // unqualified `TRUNCATE` reached it with no shadow copy would empty the
      // workspace vocabulary on every verify run.
      ['proj_note_search', ['proj_note_search', 'proj_note_lexemes']],
      ['proj_contested', ['proj_contested']],
      ['proj_workspace_settings', ['proj_workspace_settings']],
      // ONE table. `tsv` is a GENERATED column of proj_search, not a table of
      // its own, so there is nothing else here to declare.
      ['proj_search', ['proj_search']],
      // ONE table for the ticket half. The comment's embedded attachment ids
      // are NOT a table: they are derived from `body` by
      // `collectImageAttachmentIds`, so there is no second spelling of them to
      // declare — or to keep in step.
      //
      // TWO as of the notes series (Plan 1 of 6): one projection owns both the
      // ticket and the note comment tables because `comment.added` is ONE event
      // type with two kinds (`entityKind: ['ticket', 'note']`). Splitting it
      // would put the same event in front of two `apply` functions, each
      // re-stating which kind it takes.
      ['proj_ticket_comments', ['proj_ticket_comments', 'proj_note_comments']],
      ['proj_references', ['proj_references']],
      // THREE tables, one stream: a concept's tags and links are events on the concept itself.
      ['proj_concepts', ['proj_concepts', 'proj_concept_items', 'proj_concept_links']],
      ['proj_concept_rejections', ['proj_concept_rejections']],
    ]);
  });

  /**
   * The MIRROR of the assertion above, and it guards the opposite failure.
   *
   * `1787961600000_proj-invites.sql` creates two tables: `proj_invites`, which
   * is a projection, and `invite_tokens`, which is the server-owned credential
   * store and is NOT rebuildable from the ledger — the invitation token is
   * deliberately absent from the ledger, which is the whole design.
   *
   * An omitted `tables` entry is destructive (the assertion above). A SURPLUS
   * entry is destructive in a different direction: `reset()` empties what
   * `tables` names, so listing `invite_tokens` would make every
   * `rebuildProjection` and every `verify-projections` run delete every live
   * invitation link in the product — and unlike a projection, nothing could put
   * them back, because the ledger does not hold them.
   *
   * Asserted against EVERY registered projection rather than against
   * proj_invites alone: the hazard is that some later projection reaches for
   * the credential store, not that this one does.
   */
  it('no projection claims invite_tokens — the credential store is not rebuildable and reset() must never reach it', () => {
    const registry = buildProjectionRegistry();
    const claimed = registry.all().flatMap((projection) => [...projection.tables]);
    expect(claimed).not.toContain('invite_tokens');
    // The positive control: without it this assertion would also pass on a
    // registry that had stopped declaring any tables at all.
    expect(claimed).toContain('proj_invites');
  });
});
