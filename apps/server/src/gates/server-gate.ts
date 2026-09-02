import type { SubmittedEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

export type GateRefusal = { rule: string; reason: string };

/**
 * A server-side refusal that needs server-owned state (the `attachments`
 * table) and therefore cannot live in the pure shared rule engine. Gates run
 * INSIDE the ingest transaction — after the rule engine accepts, before the
 * append — reading through the transaction client, so they judge the same
 * consistent world the append is about to join. They live in `commitOne`
 * rather than in a route, so every ingest path passes through them: `POST
 * /v1/events` today (proven at the client door in
 * `test/gates/gate-seam.test.ts`), and Plan 10's `POST /v1/sync` when it is
 * built — inherited rather than guaranteed, on the same condition
 * `ingest-service.ts` already states, that sync calls `ingestClientBatch` and
 * does not append behind it. That route does not exist on this branch.
 *
 * Gates are CONSTRUCTION-TIME and UNCONDITIONAL: unlike the permission gate,
 * they do not distinguish the client door from the internal one. There is no
 * legitimate append, from any door, of a document embedding an attachment that
 * is not this ticket's image, or of a transition naming evidence that does not
 * exist here — so nothing about which door the event arrived through changes
 * the answer.
 *
 * `check` receives the SUBMITTED event, not the ledger envelope, on purpose: a
 * gate judges the CLAIM, and must not be able to read `seq`, `workspaceSeq` or
 * `serverTime`. Those are assigned by the transaction the gate might yet cause
 * to roll back, and a refusal that varied with them would not be reproducible
 * from the claim alone.
 */
export type ServerGate = {
  /** Exact event type this gate inspects; other types skip it. */
  eventType: string;
  check(event: SubmittedEvent, db: Queryable): Promise<GateRefusal | null>;
};
