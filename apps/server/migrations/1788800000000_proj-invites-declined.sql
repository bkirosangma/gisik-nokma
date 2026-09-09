-- Up Migration

-- Task 17 (HIG per-screen plan, owner brief 2026-09-09): an invited person can
-- say no, and the ledger records it as their claim.
--
-- ONE constraint is widened and NO column is added, which is the whole
-- migration. Both halves of that are decisions:
--
-- `'declined'` joins the status CHECK because `status` is this projection's
-- entire state — `openableInvite`, the admin listing and the token sweeper all
-- read it and nothing else to decide whether an invitation is still live. A
-- decline that left the row `pending` would be a terminal claim in the ledger
-- that no reader could see, and the invitation would keep opening.
--
-- There is deliberately NO `declined_at`, and the asymmetry with `accepted_at`
-- two columns up is the thing to explain rather than copy. `accepted_at` is
-- written by the projection and read by NOTHING in the product — swept for at
-- the time of writing: the only readers of `accepted_user_id` are tests, and
-- `accepted_at` has no reader at all. Adding its mirror would be a second
-- source for a fact the ledger already answers ("when did they decline" is a
-- question about an event, and the event is on the invitation's own stream),
-- which is exactly the argument Task 16 made when it refused a stored
-- `archived_at` beside `proj_projects.archived`. Task 16's ruling is the newer
-- one on precisely this question and it governs here.
--
-- The constraint is DROPPED and re-created rather than altered in place:
-- Postgres has no `ALTER … ALTER CONSTRAINT` for a CHECK's expression. The
-- name is the one the catalogue actually holds — read from
-- `pg_constraint` against the dev database rather than guessed from the
-- `<table>_<column>_check` convention, because a guessed name fails loudly here
-- and silently in the down migration.
--
-- `verify-projections` builds its shadow tables with `LIKE public.<table>
-- INCLUDING ALL`, so the widened CHECK travels to the shadow copy and a rebuild
-- can write the same statuses live does. A migration that widened only the live
-- table would make every rebuild of a declined invitation fail — checked rather
-- than assumed (`src/tools/verify-projections.ts`, the CREATE TABLE line).

ALTER TABLE proj_invites DROP CONSTRAINT proj_invites_status_check;
ALTER TABLE proj_invites
  ADD CONSTRAINT proj_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'revoked', 'declined'));

COMMENT ON COLUMN proj_invites.status IS 'pending|accepted|revoked|declined. What says the link still opens ANYTHING: the token row proves only that somebody holds it. It is NOT what makes a link single-use — a read cannot stop two people presenting the same token at once, and until 2026-09-01 three concurrent acceptances all passed this check and all committed. Single-use is the conditional DELETE on invite_tokens (see src/routes/invites.ts), and Task 17''s decline spends that same row through the same statement so that a decline and an acceptance of one invitation race in the database rather than in a projection. A transition out of pending is terminal — the projection refuses to move an accepted, revoked or declined invite, so the first terminal claim in ledger order is the one that stands.';

-- Down Migration

-- Narrowing back is only safe once no row holds the value being removed. A
-- `DELETE` would destroy history, so the rows are moved to `revoked`, which is
-- the nearest true statement the narrower vocabulary can make: the invitation
-- is terminal and it was not accepted. Stated rather than silent, because a
-- down migration that quietly rewrote claims would be the ledger's projection
-- disagreeing with the ledger.
UPDATE proj_invites SET status = 'revoked' WHERE status = 'declined';
ALTER TABLE proj_invites DROP CONSTRAINT proj_invites_status_check;
ALTER TABLE proj_invites
  ADD CONSTRAINT proj_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'revoked'));
