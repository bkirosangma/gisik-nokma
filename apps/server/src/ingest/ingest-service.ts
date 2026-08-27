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
  /**
   * Processes a batch in order; result[i] answers rawEvents[i]. Each event
   * commits or fails independently — one bad event never rolls back its
   * neighbours.
   *
   * One path breaks the index alignment, and the promise above would be a lie
   * without saying so: an UNEXPECTED infrastructure error (a dead connection, a
   * projection that throws) rejects the whole call, so no results array reaches
   * the caller at all — including the answers already decided for events that
   * COMMITTED. Those neighbours stay committed; the client retries the batch
   * and they answer `duplicate-event-id`, which is a safe ack precisely because
   * the id was client-generated. Envelope errors and rule refusals are NOT this
   * path — they ride inside results as ordinary per-event answers.
   */
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
    let rollbackFailure: Error | undefined;
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
      // A ROLLBACK on a dead connection throws, and an unguarded one would
      // replace the root-cause error with its own AND skip the duplicate check
      // below — turning a truthful duplicate-event-id answer into an opaque
      // rejection of the whole batch. The duplicate answer stays truthful even
      // here: a unique violation proves a prior transaction committed that id.
      await client.query('ROLLBACK').catch((failure: unknown) => {
        rollbackFailure = failure instanceof Error ? failure : new Error(String(failure));
      });
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
      // Releasing with the error destroys the connection instead of returning
      // it to the pool: a client whose ROLLBACK failed is still inside an
      // aborted transaction, and the next borrower would inherit it.
      client.release(rollbackFailure);
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
