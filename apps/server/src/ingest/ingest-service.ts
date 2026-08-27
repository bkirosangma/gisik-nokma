import type { Pool } from 'pg';
import {
  domainRegistry,
  parseEvent,
  type EnvelopeErrorCode,
  type EventTypeRegistry,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import type { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createEngineContext } from '../engine-context.js';
import {
  insertEvent,
  isUniqueViolation,
  lockEntity,
  lockWorkspace,
  nextSeq,
  nextWorkspaceSeq,
  type LedgerEvent,
} from '../ledger/event-store.js';
import type { ProjectionRegistry } from '../projections/registry.js';

export type IngestErrorCode = EnvelopeErrorCode | 'duplicate-event-id';

export type IngestResult =
  | { status: 'committed'; eventId: string; seq: number; serverTime: string }
  | { status: 'invalid'; eventId: string | null; code: IngestErrorCode; message: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string };

export type IngestDeps = {
  pool: Pool;
  evaluate: typeof evaluateEvent;
  projections: ProjectionRegistry;
  registry?: EventTypeRegistry; // defaults to domainRegistry
  now?: () => Date;             // injectable clock for tests
};

export type CommittedEventListener = (event: LedgerEvent) => void;

export type IngestService = {
  /** Processes a batch in order; result[i] answers rawEvents[i]. Each event
   * commits or fails independently — one bad event never rolls back its
   * neighbours. */
  ingestBatch(rawEvents: unknown[]): Promise<IngestResult[]>;
  /** Broadcast hook: fires AFTER an event's transaction commits, never for
   * refused or invalid events. Returns an unsubscribe function. Plan 5 wires
   * WebSocket fan-out onto this. */
  onEventCommitted(listener: CommittedEventListener): () => void;
};

export function createIngestService(deps: IngestDeps): IngestService {
  const registry = deps.registry ?? domainRegistry;
  const now = deps.now ?? (() => new Date());
  const listeners = new Set<CommittedEventListener>();

  function notifyCommitted(event: LedgerEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // A broken listener must never break ingest or starve other
        // listeners; Plan 5 adds logging when the broadcast layer arrives.
      }
    }
  }

  async function commitOne(submitted: SubmittedEvent): Promise<IngestResult> {
    const client = await deps.pool.connect();
    try {
      await client.query('BEGIN');
      // Lock order is always workspace first, then entity — one global order
      // across the whole server, so two ingests can never deadlock by taking
      // the pair in opposite orders.
      await lockWorkspace(client, submitted.workspaceId);
      await lockEntity(client, submitted.entity.kind, submitted.entity.id);
      const workspaceSeq = await nextWorkspaceSeq(client, submitted.workspaceId);
      const seq = await nextSeq(client, submitted.entity.kind, submitted.entity.id);
      const serverTime = now().toISOString();
      const envelope: LedgerEvent = { ...submitted, serverTime, seq, workspaceSeq };

      const verdict = await deps.evaluate(envelope, createEngineContext(client));
      if (verdict.refused) {
        await client.query('ROLLBACK');
        return { status: 'refused', eventId: envelope.id, rule: verdict.rule, reason: verdict.reason };
      }

      await insertEvent(client, envelope);
      for (const projection of deps.projections.all()) {
        await projection.apply(envelope, client);
      }
      await client.query('COMMIT');
      notifyCommitted(envelope);
      return { status: 'committed', eventId: envelope.id, seq, serverTime };
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error, 'events_pkey')) {
        return {
          status: 'invalid',
          eventId: submitted.id,
          code: 'duplicate-event-id',
          message: `an event with id ${submitted.id} is already in the ledger`,
        };
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async ingestBatch(rawEvents) {
      const results: IngestResult[] = [];
      for (const raw of rawEvents) {
        const parsed = parseEvent(raw, registry);
        if (!parsed.ok) {
          results.push({
            status: 'invalid',
            eventId: parsed.eventId,
            code: parsed.code,
            message: parsed.message,
          });
          continue;
        }
        results.push(await commitOne(parsed.event));
      }
      return results;
    },
    onEventCommitted(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
