-- Up Migration

-- Projection: one row per ticket, holding its HEAD STATE — the fold of every
-- accepted ticket event, produced by the SAME reducer (`applyTicketEvent`,
-- `@gisik-nokma/domain`) that the fixture suite and Plan 10's offline replica
-- run. Plan 3 Chain B Task 10; coordination §8 position 5, which is why
-- registering it INSERTS into `src/projections/index.ts` between proj_projects
-- and proj_memberships rather than appending.
--
-- ## The columns are a `TicketState`, and two of its fields are NOT columns
--
-- `TicketState` (packages/domain/src/entity-state.ts) carries `kind: 'ticket'`
-- and `workspaceId`. `kind` has no column here and never will — a table named
-- proj_tickets holds tickets, and a column repeating that for every row would
-- be a constant stored a million times. `workspaceId` DOES have a column, but
-- it is not part of the primary key, so a reader that selects by ticket id
-- alone still has to carry it out of the row.
--
-- Both facts converge on `rowToTicketState` in `src/projections/tickets.ts`,
-- which must repopulate them. Dropping `workspaceId` there is a TOTAL OUTAGE
-- rather than a missing field: `checkTicketCreated`'s parent guard (controller
-- ruling P12) is `parent.workspaceId !== env.workspaceId`, and
-- `undefined !== <anything>` is always true, so every parented `ticket.created`
-- in the product would be refused `hierarchy.unknown-parent` — a sentence about
-- tenancy, on a pair of tickets sitting in the same workspace. Dropping `kind`
-- lands in the same place by a different road: `getTicketState` NARROWS on
-- `state.kind === 'ticket'` (`checks/context-helpers.ts`) and answers null for
-- anything else. `test/proj-tickets.test.ts` pins both through the real check.
--
-- ## Column types
--
-- `collaborator_ids`, `fields` and `transitions` are jsonb, not json: the
-- registry contract forbids `json` because `tools/verify-projections.ts` diffs
-- with EXCEPT and every compared column needs an equality operator. jsonb has
-- one; proj_contested and proj_ticket_types already earn that claim through the
-- verifier's own suite.
--
-- `workflow_version` is integer rather than bigint for the reason
-- proj_ticket_types' `rank` is: `createPool` installs an int8 parser, so a
-- bigint would still read back as a JS number here, but a version is a small
-- counter and `TicketState.workflowVersion` is a `number` — integer says that
-- and costs nothing.
--
-- `state_category` is a text column with a CHECK rather than an enum type: the
-- verifier copies projection tables into a shadow schema with
-- `CREATE TABLE … LIKE … INCLUDING ALL`, which carries constraints but shares
-- the type; a text-plus-CHECK column needs nothing from `pg_type` and diffs as
-- text. The three values are `StateCategory` (packages/domain/src/workflow.ts),
-- and `stateCategoryOf` is the one derivation that produces them.
--
-- ## Keys and indexes
--
-- The primary key is `ticket_id` ALONE, not `(workspace_id, ticket_id)`. A
-- ticket id is an entity ULID, unique across the whole ledger, and the upsert
-- has to conflict on the whole key — a composite key would let one ticket id
-- hold two rows in two workspaces, which is not a shape the ledger can produce
-- and would silently double-count a rebuild. It is also what makes the
-- WORKSPACE-BLIND lookup possible that ruling P12's guard exists to compensate
-- for: `EngineContext.getEntityState(kind, id)` has no workspace parameter, so
-- a foreign parent RESOLVES and the guard — not the reader — is what refuses
-- it.
--
-- Both indexes lead with `workspace_id` because both reads are workspace-scoped:
-- `(workspace_id, parent_id)` serves `getChildrenStatesFromDb` and Task 11's
-- rollup recomputation; `(workspace_id, project_id)` serves the board and
-- project reads Plans 4 and 6 own. There is deliberately NO index on
-- `(workspace_id, workflow_id)`, which refresh-on-publish scans: a workspace's
-- ticket table is the working set that scan already has to touch, and an index
-- maintained on every ticket write to serve an occasional publish is the wrong
-- trade. Task 11 or a real workspace's numbers may say otherwise; nothing here
-- depends on its absence.

CREATE TABLE proj_tickets (
  ticket_id        text NOT NULL PRIMARY KEY,
  workspace_id     text NOT NULL,
  project_id       text NOT NULL,
  type_id          text NOT NULL,
  parent_id        text,
  workflow_id      text NOT NULL,
  workflow_version integer NOT NULL,
  state_id         text NOT NULL,
  state_category   text NOT NULL,
  assignee_id      text,
  collaborator_ids jsonb NOT NULL,
  fields           jsonb NOT NULL,
  transitions      jsonb NOT NULL,
  CONSTRAINT proj_tickets_state_category_check
    CHECK (state_category IN ('open', 'active', 'terminal'))
);

CREATE INDEX proj_tickets_parent_idx ON proj_tickets (workspace_id, parent_id);
CREATE INDEX proj_tickets_project_idx ON proj_tickets (workspace_id, project_id);

COMMENT ON TABLE proj_tickets IS 'Projection: one row per ticket, holding the head state produced by the shared reducer applyTicketEvent. Rebuildable from the ledger; never authored. Read by getTicketStateFromDb and getChildrenStatesFromDb, which is what Plan 3 Task 12 backs the engine context''s getEntityState(''ticket'') and getChildrenStates with.';

COMMENT ON COLUMN proj_tickets.workspace_id IS 'The workspace this ticket belongs to. Not part of the primary key — a ticket id is a globally unique entity ULID — so rowToTicketState must carry this column back into TicketState.workspaceId. It is the field checkTicketCreated''s parent guard compares (controller ruling P12), and a mapper that drops it refuses every parented creation in the product.';
COMMENT ON COLUMN proj_tickets.workflow_id IS 'The workflow this ticket is ON, which is the one it was CREATED under (owner decision 2026-08-26) until a ticket.workflow_rebound deliberately moves it. Re-pointing a ticket TYPE at a different workflow changes only what new tickets get.';
COMMENT ON COLUMN proj_tickets.workflow_version IS 'The version of that workflow the ticket''s state_id and state_category are written in. Advanced by a transition (to the version in force as of that event) and by refresh-on-publish, which folds every row on a republished workflow forward through foldTicketToWorkflowVersion. Never the newest version by default: a row at an older version than the workflow''s latest is a row that has not been folded yet, not a stale one.';
COMMENT ON COLUMN proj_tickets.state_category IS 'Denormalized from the ticket''s workflow so the parent-terminal invariant needs no per-child workflow lookup. Denormalized means DERIVED: every writer asks stateCategoryOf(def, stateId), which is why a republish that re-categorises a state must fold every ticket standing in it — a stored category the workflow no longer assigns is a lie that rollups, boards and the overdue sweep all repeat.';
COMMENT ON COLUMN proj_tickets.transitions IS 'The append-only log of every ticket.transitioned applied to this ticket, oldest first — what require-different-user reads. Each entry names the workflowId and workflowVersion its toStateId is written in. A fold NEVER rewrites it: a fold moves the ticket''s current state, never the history that got it there.';
COMMENT ON COLUMN proj_tickets.fields IS 'Every field claim on this ticket, each carrying its claimant and both clocks. title arrives with creation. jsonb rather than json: the projection verifier diffs with EXCEPT, which needs an equality operator.';

-- Down Migration

DROP TABLE proj_tickets;
