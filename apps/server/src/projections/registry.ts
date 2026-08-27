import type { PoolClient } from 'pg';
import type { LedgerEvent } from '../ledger/event-store.js';

/**
 * A projection is a deterministic read model over the ledger.
 * Contract for every implementor, now and in later plans:
 * - apply(event, tx) is deterministic: same event + same prior table state =>
 *   same rows. No clocks, no randomness, nothing outside the event and the
 *   projection's own tables.
 * - Table contents must be a pure function of the ledger's rows — never of
 *   cross-entity arrival interleaving. Replay (rebuild, verify) delivers
 *   canonical order (entity_kind, entity_id, seq): per-entity causality only.
 * - tables lists every table the projection writes (all prefixed proj_);
 *   reset(tx) empties them so a rebuild starts from scratch.
 * - Every table name in a projection's SQL is UNQUALIFIED — `proj_entity_heads`,
 *   never `public.proj_entity_heads`. The verifier confines its rebuild to a
 *   shadow schema with `search_path` ALONE (tools/verify-projections.ts), so a
 *   schema-qualified name escapes the fence and writes LIVE during a verify.
 *   Table naming stays lowercase and unquoted for the same reason, and no
 *   projection column may be `json` (it has no equality operator, and the
 *   verifier's diff needs one).
 * - The registry applies projections in REGISTRATION order within each
 *   event's ingest transaction (all() preserves insertion order), and later
 *   plans depend on the order proj_entity_heads, proj_workflows,
 *   proj_ticket_types, proj_tickets, proj_rollups, proj_memberships,
 *   proj_visibility (coordination doc §8).
 *
 * apply receives a LedgerEvent — the stored envelope plus its workspaceSeq,
 * the workspace stream position — because a projection may need to know WHERE
 * IN THE LEDGER the event it is applying sits: proj_workflows records the
 * position each version was published at, and proj_tickets uses that to ask
 * for the workflow definition in force at this event rather than the newest
 * one. Both call sites already have a LedgerEvent in hand; ingest assigns
 * workspaceSeq in the same transaction, and every ledger reader returns it.
 *
 * DO NOT "fix" this back to EventEnvelope on determinism grounds. workspaceSeq
 * is a stored property of the event, written once under
 * UNIQUE(workspace_id, workspace_seq) — not an arrival-order artefact. Replay
 * hands back exactly what the ledger holds, so apply stays a pure function of
 * the event and its own tables, and interleaving stays invisible to it:
 * workspaceSeq says where the event sits in the workspace's stream, never in
 * what order this projection was called.
 */
export type Projection = {
  name: string;
  tables: readonly string[];
  apply(event: LedgerEvent, tx: PoolClient): Promise<void>;
  reset(tx: PoolClient): Promise<void>;
};

export type ProjectionRegistry = {
  register(projection: Projection): void;
  get(name: string): Projection | undefined;
  all(): readonly Projection[];
};

export function createProjectionRegistry(): ProjectionRegistry {
  const byName = new Map<string, Projection>();
  return {
    register(projection) {
      if (byName.has(projection.name)) {
        throw new Error(`projection already registered: ${projection.name}`);
      }
      byName.set(projection.name, projection);
    },
    get(name) {
      return byName.get(name);
    },
    all() {
      return [...byName.values()];
    },
  };
}
