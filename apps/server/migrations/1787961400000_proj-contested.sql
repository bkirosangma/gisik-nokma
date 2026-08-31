-- Up Migration

-- Projection: every contested claim the server has recorded, open or resolved
-- (Plan 10 Task 4). A contest is the system's own record of a refusal: the
-- refused claim travels WHOLE inside `claim.contested`'s payload, so the ticket
-- banner, My Work and the attention strip can say what was claimed, by whom,
-- when, and which rule refused it.
--
-- Rebuildable from `claim.contested` / `claim.contested_resolved` and nothing
-- else. Both event types are filed against the TICKET entity
-- (packages/domain/src/vocabulary.ts), so every key in this table has exactly
-- one totally-ordered writer — the ticket's own stream — which is what makes
-- the INSERT-then-UPDATE pair safe under canonical replay order
-- (entity_kind, entity_id, seq) as well as under live arrival order.
--
-- `original_event jsonb`, not `json`, and the difference is load-bearing rather
-- than stylistic: src/projections/registry.ts forbids `json` because it has no
-- equality operator and tools/verify-projections.ts diffs with EXCEPT, which
-- needs one for every column it compares. `jsonb` HAS `=`, so it is legal under
-- that contract as worded and for the reason the contract gives. proj_visibility
-- avoided jsonb too, but for a different reason (it wanted arrays); the refused
-- claim is an arbitrary event envelope and has no array shape to flatten into.

CREATE TABLE proj_contested (
  contested_event_id text PRIMARY KEY,
  original_event_id  text NOT NULL,
  workspace_id       text NOT NULL,
  ticket_id          text NOT NULL,
  claimant_id        text NOT NULL,
  rule               text NOT NULL,
  reason             text NOT NULL,
  original_event     jsonb NOT NULL,
  contested_at       timestamptz NOT NULL,
  resolved           boolean NOT NULL DEFAULT false,
  resolution         text,
  resolved_by        text,
  resolved_event_id  text,
  resolved_at        timestamptz
);

COMMENT ON TABLE proj_contested IS 'Projection: open and resolved contested claims, one row per claim.contested event. Rebuildable from claim.contested / claim.contested_resolved; never authored. Both writers are the ticket entity''s own stream, so each key has exactly one totally-ordered writer.';

COMMENT ON COLUMN proj_contested.original_event_id IS 'The id of the REFUSED claim carried inside the contest payload. It is NOT a foreign key into events and never can be: a refused claim is never appended — that is what refusal means — so the row it would point at does not exist. UNIQUE so a sync retry that re-submits the same refused claim finds the prior contest instead of filing a second one (the idempotency lookup Plan 10 Task 7 reuses).';
COMMENT ON COLUMN proj_contested.claimant_id IS 'The actor of the REFUSED claim (payload.originalEvent.actorId), which is deliberately not the contest event''s own actor: the server files the contest, the claimant made the claim. My Work reads this column.';
COMMENT ON COLUMN proj_contested.contested_at IS 'The contest event''s server_time — a stored field of the event, not a clock read at apply time, so a rebuild derives the same value.';
COMMENT ON COLUMN proj_contested.resolved_by IS 'The actor of the claim.contested_resolved event. There is no role gate on resolving (packages/rule-engine/src/contests.ts), so this is whoever settled it, recorded and attributed.';

CREATE UNIQUE INDEX proj_contested_original_idx ON proj_contested (original_event_id);
-- The ticket banner's access path: every contest on one ticket.
CREATE INDEX proj_contested_ticket_idx ON proj_contested (workspace_id, ticket_id);
-- My Work / attention strip: every contest against one claimant.
CREATE INDEX proj_contested_claimant_idx ON proj_contested (workspace_id, claimant_id);

-- Down Migration

DROP TABLE proj_contested;
