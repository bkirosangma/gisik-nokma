import type { Pool } from 'pg';
import {
  domainRegistry,
  parseEvent,
  ENTITY_WORKSPACE_MISMATCH_RULE,
  type EventTypeRegistry,
  type IngestErrorCode,
  type IngestResult,
  type LedgerEvent,
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
} from '../ledger/event-store.js';
import { checkPermission, type SubmissionGate } from '../permissions/check-permission.js';
import { readEntityHead } from '../projections/entity-heads.js';
import type { ProjectionRegistry } from '../projections/registry.js';

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
   *
   * This is the INTERNAL, trusted door. It applies no permission gate, so the
   * server's own appends — Task 5's workspace bootstrap, Task 14's invite
   * acceptance — may legitimately carry envelope-origin `'server'`. **An HTTP
   * route must never call this; it calls `ingestClientBatch`.**
   */
  ingestBatch(rawEvents: unknown[]): Promise<IngestResult[]>;
  /**
   * The CLIENT door: identical to `ingestBatch` except that every event is put
   * through `checkPermission` first, so a client cannot forge the envelope's
   * `origin` field — the provenance enum, not the browser `Origin` header — and
   * wear the server's own provenance.
   *
   * Two entry points rather than a flag because the distinguishing fact is
   * which door an event arrived through, not what it says about itself.
   * `POST /v1/events` calls this; **Plan 10's `POST /v1/sync` must call it too**,
   * or offline-originated events bypass the gate entirely. Task 5 widens the
   * signature to carry the session the door authenticated.
   */
  ingestClientBatch(rawEvents: unknown[]): Promise<IngestResult[]>;
  /** Broadcast hook: fires AFTER an event's transaction commits, never for
   * refused or invalid events. Returns an unsubscribe function. Plan 5 wires
   * WebSocket fan-out onto this. */
  onEventCommitted(listener: CommittedEventListener): () => void;
};

/**
 * What an HTTP route is allowed to do with ingest: submit through the GATED
 * client door, and subscribe to commits. Deliberately NOT the whole
 * `IngestService`.
 *
 * This exists because the naming asymmetry is adverse: the DANGEROUS door has
 * the shorter, more obvious name. `ingestBatch` is what a route author reaches
 * for by reflex, and reaching for it silently ungates every event that route
 * accepts — for `POST /v1/sync` (Plan 10), every offline-originated event in the
 * product. Prose across three plans and a wave boundary is not a defence a
 * compiler can check, so the internal door is simply not in scope for a route:
 * `ingest.ingestBatch(...)` inside a route handler is now a COMPILE error, not a
 * documented mistake.
 *
 * `ingestBatch` stays exported on `IngestService` for the internal callers that
 * legitimately use it — the workspace bootstrap (Task 5), invite acceptance
 * (Task 14), Plan 11's seed CLIs, and tests.
 */
export type ClientIngest = Pick<IngestService, 'ingestClientBatch' | 'onEventCommitted'>;

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

  async function commitOne(submitted: SubmittedEvent, gate: SubmissionGate | null): Promise<IngestResult> {
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

      // An entity belongs to one workspace. Nothing before this point says so:
      // the envelope carries workspaceId per event, so a second event on the
      // same entity naming a different workspace parses cleanly and commits,
      // and the head row's workspace_id — the tenant boundary every scoped read
      // trusts — flips with it. The ledger is append-only, so a mis-filed event
      // can never be taken back, only superseded (coordination doc §11).
      //
      // Placed after lockWorkspace + lockEntity and before deps.evaluate: the
      // entity lock is what makes the read race-safe under READ COMMITTED (any
      // concurrent ingest for this entity has already committed or is still
      // waiting), and refusing before the engine keeps the rules judging only
      // events that are honestly about this entity.
      //
      // This is a SERVER-SIDE refusal, deliberately not an engine rule, and it
      // is not in the shared fixture suite. Client replicas are workspace-
      // scoped: a replica holds one workspace's events and cannot see that an
      // entity id is already bound elsewhere, so an engine check would make
      // client and server disagree by construction — the same argument that
      // settled the state-mapping occupancy question. Plan 10's offline replica
      // therefore mirrors this KNOWINGLY, as a server-only door, rather than
      // finding it in the fixtures.
      const head = await readEntityHead(client, envelope.entity.kind, envelope.entity.id);
      if (head !== null && head.workspaceId !== envelope.workspaceId) {
        await client.query('ROLLBACK');
        return {
          status: 'refused',
          eventId: envelope.id,
          rule: ENTITY_WORKSPACE_MISMATCH_RULE,
          reason: `This ${envelope.entity.kind} belongs to workspace ${head.workspaceId}; this event files it under workspace ${envelope.workspaceId}. An entity cannot move between workspaces.`,
        };
      }

      // The permission gate, and `gate` is null for every internal append.
      //
      // Position is a recorded ruling, not a preference (coordination doc, "A
      // forgeable `origin`…" and "The gate's placement was contradicted by a
      // brief"): the gate lives INSIDE the ingest path — here, after the
      // entity↔workspace guard and before the engine — rather than at the HTTP
      // route. Decision 15 is what makes that load-bearing: Plan 10's
      // `POST /v1/sync` wraps this same ingest, so a permission refusal on the
      // sync path can become a `claim.contested` with no extra wiring. A gate
      // that lived in the route would be bypassed by sync entirely.
      //
      // It runs before deps.evaluate because permissions are the system's
      // rules, not a workflow's: a permission refusal should never reach the
      // rule engine. It runs after the entity↔workspace guard, so an event that
      // is not honestly about its entity is told that first — the refusal that
      // names the actual fault.
      //
      // Per-call rather than baked into the service, because the distinguishing
      // fact is which door the event arrived through. See
      // ../permissions/check-permission.ts for which doors this closes and,
      // more importantly, which it does not.
      const refusal = gate === null ? null : gate(envelope);
      if (refusal !== null) {
        await client.query('ROLLBACK');
        return { status: 'refused', eventId: envelope.id, rule: refusal.rule, reason: refusal.reason };
      }

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

  /**
   * Both entry points are this loop; they differ only in the gate they carry.
   * Parsing stays ahead of the gate so a submission that is not a well-formed
   * claim at all is answered as `invalid` rather than as a permission refusal —
   * and so a refused event always has a real ULID `eventId` to report.
   */
  async function ingestAll(rawEvents: unknown[], gate: SubmissionGate | null): Promise<IngestResult[]> {
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
      results.push(await commitOne(parsed.event, gate));
    }
    return results;
  }

  return {
    async ingestBatch(rawEvents) {
      return ingestAll(rawEvents, null);
    },
    async ingestClientBatch(rawEvents) {
      return ingestAll(rawEvents, checkPermission);
    },
    onEventCommitted(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
