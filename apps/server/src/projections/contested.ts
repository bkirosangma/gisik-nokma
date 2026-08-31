import type { PoolClient } from 'pg';
import {
  claimContestedPayloadSchema,
  claimContestedResolvedPayloadSchema,
  type LedgerEvent,
} from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * Every contested claim the server has recorded, open or resolved.
 *
 * ## Determinism
 *
 * Every column derives from the event alone. `contested_at` and `resolved_at`
 * are `event.serverTime` — a STORED field of the envelope, written once at
 * ingest and handed back verbatim by every ledger reader — not a clock read
 * here, so the registry contract's "no clocks" clause is satisfied and a
 * rebuild produces the same bytes as live application.
 *
 * ## The ordering rule this handler has to satisfy
 *
 * *A projection handler may only write keys its own entity totally orders*
 * (coordination doc, 2026-08-31). This table's key is the `claim.contested`
 * event id, and it has two writers: the INSERT from `claim.contested` and the
 * UPDATE from `claim.contested_resolved`. Both event types are registered
 * against entity kind `'ticket'` (`packages/domain/src/vocabulary.ts`), and
 * `evaluateClaimContestedResolved` refuses with `contest.wrong-ticket` any
 * resolution whose contest belongs to a different ticket — on BOTH doors, since
 * `deps.evaluate` runs for the internal append path too. So the two writers are
 * always the same ticket's stream, `readLedger`'s canonical
 * `(entity_kind, entity_id, seq)` order puts the contest before its resolution,
 * and per-entity causality — the only causality replay guarantees — is enough.
 *
 * The `rowCount !== 1` throw is the ASSERTION of that premise rather than
 * defensiveness against a case the code expects. If a resolution ever reaches
 * this handler with no contest row, either the evaluator was bypassed or the
 * ledger is inconsistent; both are things a rebuild must shout about, not paper
 * over. It is deliberately not a silent `return`: a silent return would leave a
 * resolved contest showing as open forever and no instrument would ever say so.
 *
 * The COST of that choice, stated because "fails loudly" and the sentence below
 * are the same event and only the first is obvious: `rebuildProjection` replays
 * the whole ledger in ONE transaction, so a single inconsistent pair anywhere in
 * a workspace's history makes a rebuild of this projection throw and roll back —
 * an operator can no longer rebuild `proj_contested` at all until the ledger is
 * superseded into consistency. That is the right trade (a projection that
 * rebuilds into a quiet lie is worse than one that refuses to rebuild), but it
 * is a trade, not a free assertion.
 *
 * ## Unqualified table names
 *
 * `proj_contested`, never `public.proj_contested`: tools/verify-projections.ts
 * fences its rebuild inside a shadow schema with `search_path` ALONE, so a
 * schema-qualified name escapes the fence and writes LIVE during a verify.
 */
export const projContested: Projection = {
  name: 'proj_contested',
  tables: ['proj_contested'],

  async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
    if (event.type === 'claim.contested') {
      const payload = claimContestedPayloadSchema.parse(event.payload);
      await tx.query(
        `INSERT INTO proj_contested
           (contested_event_id, original_event_id, workspace_id, ticket_id, claimant_id,
            rule, reason, original_event, contested_at, resolved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)`,
        [
          event.id,
          payload.originalEvent.id,
          event.workspaceId,
          event.entity.id,
          // The CLAIMANT is the actor of the refused claim, not the actor of the
          // contest: the server files contests, so `event.actorId` would make
          // every row in this table name the same person and My Work would be
          // empty for everyone.
          payload.originalEvent.actorId,
          payload.rule,
          payload.reason,
          JSON.stringify(payload.originalEvent),
          event.serverTime,
        ],
      );
      return;
    }

    if (event.type === 'claim.contested_resolved') {
      const payload = claimContestedResolvedPayloadSchema.parse(event.payload);
      const result = await tx.query(
        `UPDATE proj_contested
            SET resolved = true, resolution = $2, resolved_by = $3, resolved_event_id = $4, resolved_at = $5
          WHERE contested_event_id = $1`,
        [payload.contestedEventId, payload.resolution, event.actorId, event.id, event.serverTime],
      );
      if (result.rowCount !== 1) {
        throw new Error(
          `claim.contested_resolved ${event.id} resolves unknown contest ${payload.contestedEventId}`,
        );
      }
      return;
    }
  },

  async reset(tx: PoolClient): Promise<void> {
    await tx.query('DELETE FROM proj_contested');
  },
};
