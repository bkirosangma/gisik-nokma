-- Up Migration

-- Projection: each ticket's AUTHORED visibility mode and its RESOLVED audience
-- (Plan 4 Task 6). own_* is what visibility.set last claimed for this ticket;
-- resolved_* is the audience that actually applies once inherit chains have been
-- walked, and is never 'inherit'. resolved_from names the ticket whose authored
-- mode won ('' = the project default a root with no authored mode falls back to).
--
-- The audience is stored as a MODE plus an optional user list, not as a
-- flattened per-user table: a membership change then never forces
-- re-materialisation of this table, and canSee (Task 7) joins the mode against
-- proj_memberships at read time instead.
--
-- No json/jsonb column here, deliberately: `json` has no equality operator and
-- tools/verify-projections.ts diffs with EXCEPT, which needs one for every
-- column it compares. text[] has one, which is why the user lists are arrays.

CREATE TABLE proj_visibility (
  ticket_id         text PRIMARY KEY,
  workspace_id      text NOT NULL,
  project_id        text NOT NULL,
  parent_id         text,
  own_mode          text NOT NULL DEFAULT 'inherit'
                    CHECK (own_mode IN ('workspace', 'project', 'explicit', 'inherit')),
  own_user_ids      text[] NOT NULL DEFAULT '{}',
  resolved_mode     text NOT NULL
                    CHECK (resolved_mode IN ('workspace', 'project', 'explicit')),
  resolved_user_ids text[] NOT NULL DEFAULT '{}',
  resolved_from     text NOT NULL DEFAULT '',
  seq               bigint NOT NULL
);

COMMENT ON TABLE proj_visibility IS 'Projection: one row per ticket, carrying what that ticket''s own visibility.set claimed (own_*) and the audience that actually applies after inherit chains are walked (resolved_*). Rebuildable from the ledger; never authored. Every row is keyed by the ticket it is about, and the AUTHORED columns of a row are written only by that ticket''s own event stream — ticket.created, ticket.reparented and visibility.set are all filed against entity kind ''ticket'' (packages/domain/src/vocabulary.ts), so each key has exactly one totally-ordered writer. The RESOLVED columns are the exception and the reason this table is delicate: an ancestor''s event re-resolves its inheriting descendants, which are OTHER tickets'' rows. That is safe only because every handler restores the same table-wide invariant rather than applying a delta — see the module docblock in src/projections/proj-visibility.ts.';

COMMENT ON COLUMN proj_visibility.own_mode IS 'What this ticket''s last visibility.set claimed, or ''inherit'' if it never made one. ''inherit'' is the mode a ticket is born with: it sees whatever its parent decided.';
COMMENT ON COLUMN proj_visibility.own_user_ids IS 'The explicit audience this ticket authored. Non-empty only when own_mode = ''explicit'' — the domain schema refuses userIds on any other mode (packages/domain/src/events/visibility.ts).';
COMMENT ON COLUMN proj_visibility.resolved_mode IS 'The audience that applies, never ''inherit''. Equals own_mode when this ticket authored one; otherwise the nearest authored ancestor''s; otherwise ''project'', the default a root falls back to.';
COMMENT ON COLUMN proj_visibility.resolved_from IS 'The ticket whose authored mode produced resolved_*. It is the AUTHORING ancestor, not the immediate parent: a grandchild inheriting through an unauthored parent names the grandparent. '''' (empty string) means no ancestor authored anything and the project default applies.';
COMMENT ON COLUMN proj_visibility.project_id IS 'The project named by the ticket.created claim. NOT updated by ticket.reparented — ticketReparentedPayload carries only newParentId (packages/domain/src/events/ticket-events.ts), so if Plan 3 ever admits a cross-project reparent this column goes stale and Task 7''s listVisibleTickets would filter ''project''-mode tickets against the wrong project. Recorded as a gap, owner Plan 3 / Plan 4 Task 7.';
COMMENT ON COLUMN proj_visibility.seq IS 'The PER-ENTITY sequence of the last event from this ticket''s own stream that wrote the AUTHORED columns. Deliberately the per-entity seq and not workspace_seq, unlike proj_memberships: this row has exactly one authoring stream, so the ticket''s own counter is meaningful and no cross-stream comparison is ever needed. It is NOT a watermark for resolved_* — an ancestor''s event can change this row''s resolved audience without touching seq, because that event belongs to a different ticket''s stream.';

-- The re-resolution walk: every child of a ticket whose audience just changed.
CREATE INDEX proj_visibility_children ON proj_visibility (parent_id);
CREATE INDEX proj_visibility_by_workspace ON proj_visibility (workspace_id);
-- Task 7's listVisibleTickets access path: one project's tickets in one workspace.
CREATE INDEX proj_visibility_by_project ON proj_visibility (workspace_id, project_id);

-- Down Migration

DROP TABLE proj_visibility;
