-- Up Migration

ALTER TABLE snapshots ADD COLUMN provenance jsonb;

COMMENT ON COLUMN snapshots.provenance IS
  'The RECORDED provenance of the claims a snapshot cannot otherwise carry: the state claim, and the assignment claim when there is one. Ruling P36. A snapshot-bounded replica ships no events below its seq, so a client that bootstraps from one has no ticket.created/ticket.transitioned to read an actor and an instant from — and TicketState.transitions carries actorId and seq but NO clock. The instant EXISTS: the ledger row at that seq recorded it and this writer folded that very row and dropped the field, so copying it here is recovery, not invention. That is the whole distinction from ContestedClaim.claim.serverTime, which stays unserved because no row anywhere recorded one. NULL means a snapshot written before this column existed; it is shown as unknown, never as unattributed, and the read door keeps refusing for such a row until the next pass rewrites it.';

-- Down Migration

ALTER TABLE snapshots DROP COLUMN provenance;
