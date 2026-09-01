-- Up Migration

-- Projection: the workspace's ticket-type ladder as readable server state
-- (Plan 3 Chain B Task 9, §8 position 3). One row per (workspace, type key),
-- holding the NEWEST definition of that type — `ticket-type.defined` is
-- last-definition-wins by design (Plan 8 design decision 6), which is what makes
-- a rank re-definition, and the loop-closing reparent it enables, reachable at
-- all.
--
-- ## `type_id` is the payload's key, and it is NOT the entity id
--
-- `foundingSequence` files every `ticket-type.defined` at a FRESH entity ULID
-- (`bootstrap-workspace.ts`) and the envelope schema forces that: a non-
-- membership `entity.id` must match `ULID_REGEX`, so the stable type key —
-- `epic`, `story`, `task`, `sub-task`, `invoice` — can never be the entity id.
-- The consequence is the reason for `defined_workspace_seq` below: this table's
-- primary key is written by MANY entity streams, not one.
--
-- ## Why `defined_workspace_seq` exists
--
-- The registry contract (`src/projections/registry.ts`) requires table contents
-- to be a pure function of the ledger's rows and never of cross-entity arrival
-- interleaving. Live application sees events in arrival order; a rebuild or a
-- verify replays them in canonical order, `ORDER BY entity_kind, entity_id, seq`
-- (`readLedger`). For a key written by one entity stream those two agree. For
-- THIS key they need not: two definitions of `task` sit on two different entity
-- ULIDs, so canonical replay orders them by a random-suffixed identifier while
-- live ordered them by when they arrived. A plain last-writer-wins upsert would
-- therefore leave a different row after a rebuild than the one live holds — a
-- drift `tools/verify-projections.ts` reports and nothing else would.
--
-- So "last definition wins" is resolved on the workspace stream position, not on
-- application order: the row is the definition with the greatest
-- `defined_workspace_seq`, which is a STORED property of the event (written once
-- under `UNIQUE (workspace_id, workspace_seq)`) and identical under both orders.
--
-- ## Column types
--
-- `fields` is jsonb, not json: `verify-projections.ts` diffs with EXCEPT and
-- needs an equality operator for every column it compares (the registry contract
-- forbids `json` for exactly this). `rank` is integer rather than bigint so it
-- reads back as a JS number — a bigint arrives as a string and would fail
-- `ticketTypeDefSchema.parse` on the read path.

CREATE TABLE proj_ticket_types (
  workspace_id          text NOT NULL,
  type_id               text NOT NULL,
  name                  text NOT NULL,
  icon                  text NOT NULL,
  rank                  integer NOT NULL,
  workflow_id           text NOT NULL,
  fields                jsonb NOT NULL,
  defined_by            text NOT NULL,
  defined_at            timestamptz NOT NULL,
  defined_workspace_seq bigint NOT NULL,
  PRIMARY KEY (workspace_id, type_id)
);

-- No separate workspace index: the primary key LEADS with workspace_id, so the
-- per-workspace scan the type list needs already has one.

COMMENT ON TABLE proj_ticket_types IS 'Projection: one row per ticket type per workspace, holding that type''s newest definition. Rebuildable from the ledger; never authored. Read by getTicketTypeFromDb, which is what Plan 3 Task 12 backs the engine context''s getTicketTypeDef with.';

COMMENT ON COLUMN proj_ticket_types.type_id IS 'The payload''s stable type key (epic, story, task, sub-task, or a custom slug) — NOT the event''s entity id, which is a fresh ULID per definition (bootstrap-workspace.ts) because the envelope schema requires entity ids to be ULIDs.';
COMMENT ON COLUMN proj_ticket_types.fields IS 'The type''s custom field definitions, verbatim from the definition payload. jsonb rather than json: the projection verifier diffs with EXCEPT, which needs an equality operator.';
COMMENT ON COLUMN proj_ticket_types.defined_by IS 'The actor of the ticket-type.defined claim that this row holds. For the four built-ins in a founded workspace that is the founder, because the founding sequence appends them under the founder''s id through the internal door.';
COMMENT ON COLUMN proj_ticket_types.defined_at IS 'The RECEIVED instant (events.server_time) of that claim, never a clock read at apply time — a projection that read a clock would not be a pure function of the ledger and every rebuild would disagree with live.';
COMMENT ON COLUMN proj_ticket_types.defined_workspace_seq IS 'The workspace stream position (coordination §18) of the definition this row holds, and the tiebreak that makes last-definition-wins deterministic. Because one type key is written by MANY entity streams, canonical replay order (entity_kind, entity_id, seq) can invert live arrival order; resolving the winner on this stored position makes the row identical under both.';

-- Down Migration

DROP TABLE proj_ticket_types;
