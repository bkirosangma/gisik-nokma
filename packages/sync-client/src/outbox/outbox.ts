import { evaluateEvent } from '@gisik-nokma/rule-engine';
import type { EventEnvelope, LedgerEvent, SubmittedEvent, TicketState } from '@gisik-nokma/domain';
import type { SqlRow, SyncStorage } from '../storage/storage.js';
import type { Replica } from '../replica/replica.js';
import { buildLocalEngineContext, buildPendingOverlay, type LocalContextDeps } from '../precheck/local-context.js';

/**
 * The wire shape of `POST /v1/sync`'s per-event answer — the CLIENT-SIDE MIRROR
 * of `apps/server/src/sync/sync-service.ts:53`, mirrored rather than imported
 * for the reason `replica/sync-item.ts` gives at length: this package may not
 * depend on `apps/server`, because Expo and Tauri import it. Same standing
 * RECORD, same owner: these belong in `@gisik-nokma/domain`, where both sides
 * could share one declaration. *Owner: Plan 10 Task 11 (the sync engine), which
 * consumes this same shape over HTTP.*
 *
 * TWO DELIBERATE DIFFERENCES FROM THE SERVER'S DECLARATION, both widenings:
 *
 * - `code` is `string`, where the server narrows it to `SyncInvalidCode`
 *   (`IngestErrorCode | 'actor-mismatch' | 'reserved-type'`). A client that
 *   pinned the union would fail to represent a code added server-side — and the
 *   client's job with an invalid answer is to SHOW it, not to classify it. Same
 *   lenient-parsing doctrine `app-core/src/online/stream.ts` records for frames.
 * - `refused` does NOT mean "not a ticket". The plan annotated it
 *   `// non-ticket entity: no contest recordable`; the shipped server docblock
 *   corrects that in its own words — the property is *a refusal no coherent
 *   contest can record*, and a ticket-entity claim can satisfy it. So
 *   `applyResult` must not branch on entity kind, and it does not.
 */
export type SyncEventResult =
  | { status: 'committed'; eventId: string; seq: number; workspaceSeq: number; serverTime: string }
  | { status: 'contested'; eventId: string; rule: string; reason: string; contestEventId: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string }
  | { status: 'invalid'; eventId: string | null; code: string; message: string };

/**
 * A ticket as it stands WITH this device's queued claims folded in, and the ids
 * of the claims that made it so.
 *
 * The pairing is the honesty contract, not decoration: a caller that renders
 * `pending` must be able to say which claims are still in the air, and a caller
 * that has only `pending` cannot. `pendingEventIds` is never empty for a value
 * this module returns — `pendingFor` answers `null` when nothing is queued,
 * rather than handing back confirmed state wearing a pending label.
 */
export type PendingTicket = { pending: TicketState; pendingEventIds: string[] };

export type EnqueueResult = { queued: true; eventId: string } | { queued: false; rule: string; reason: string };

export type OutboxItem = {
  position: number;
  eventId: string;
  workspaceId: string;
  envelope: SubmittedEvent;
  attempts: number;
  status: 'queued' | 'failed';
};

/**
 * Outbox flush retry. **A DIFFERENT FUNCTION FROM `backoffDelayMs` in
 * `packages/app-core/src/online/stream.ts`, and they must not be deduped.**
 * That one is the websocket RECONNECT backoff — 500 ms initial, 30 s cap, ±20%
 * jitter; this one is the claim-flush curve `min(1000·2^attempts, 60_000)`,
 * 60 s cap, no jitter. Two retry surfaces, two independently chosen constants:
 * a stream that reconnects slowly leaves the UI stale, while an outbox that
 * retries a rejected batch too eagerly hammers a door that has already said no.
 * Merging them would quietly re-tune whichever caller lost the argument.
 *
 * THE TWO "INITIAL" DELAYS ARE NOT COMPARABLE, and this paragraph used to
 * compare them anyway — it read *"1 s initial"* against app-core's *"500 ms
 * initial"*, which is true of the two FUNCTIONS and false of the two CALLERS.
 * The delays a caller actually produces depend on which side of the call it
 * increments:
 *
 * - `stream.ts` starts at `let attempt = 0` and does
 *   `setTimeout(connect, backoffDelayMs(attempt, random)); attempt += 1;` — it
 *   increments AFTER, so its first reconnect delay really is the 500 ms one.
 * - `recordFailure` below reads the stored `attempts`, adds one, and calls
 *   `backoffMs(attempts)` — it increments BEFORE, so the first flush retry
 *   waits `backoffMs(1)` = **2 s** and `backoffMs(0)` = 1 s is unreachable from
 *   the only production caller this function has.
 *
 * 12.148 pins the increment-before behaviour through the function rather than a
 * literal — its first retry falls due at `backoffMs(1)` and its second at
 * `backoffMs(2)` — and 12.152 is the case that asserts the literal instant
 * (`next_attempt_at` lands on `…00:00:02.000Z` after one failure). Only the
 * prose here was wrong. The enumeration in 12.153 is about the function and
 * stays as it is.
 *
 * No jitter here on purpose, and it is a real difference rather than an
 * oversight: reconnect storms are a THUNDERING-HERD problem (every client's
 * socket drops on the same deploy), while an outbox flush is driven by one
 * device's own queue.
 */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, 60_000);
}

/**
 * The position a pre-check envelope carries while it is being judged.
 *
 * The ledger's first `seq` is 1 and `eventEnvelopeSchema` requires a positive
 * integer, so 0 is a position no committed event can hold: the completed
 * envelope is refused by the very door it would have to pass to become a fact,
 * which is what stops a stand-in built for a local evaluation from being
 * laundered into one. Same constant, same reasoning, as
 * `packages/app-core/src/precheck.ts`'s `PROVISIONAL_SEQ`.
 */
const PROVISIONAL_SEQ = 0;

export type Outbox = {
  /** Pre-check FIRST: a refusal queues nothing at all. */
  enqueue(event: SubmittedEvent): Promise<EnqueueResult>;
  nextBatch(limit?: number, now?: () => Date): Promise<OutboxItem[]>;
  applyResult(eventId: string, result: SyncEventResult): Promise<void>;
  recordFailure(eventIds: string[], error: string, now?: () => Date): Promise<void>;
  queuedCount(workspaceId: string): Promise<number>;
  failedItems(workspaceId: string): Promise<OutboxItem[]>;
  /** The outbox overlay over confirmed state, or `null` when nothing is queued for this ticket. */
  pendingFor(ticketId: string): Promise<PendingTicket | null>;
  /** Tickets that exist ONLY as queued claims — never in any settled listing. */
  pendingCreatedTickets(workspaceId: string): Promise<PendingTicket[]>;
};

function rowToItem(row: SqlRow): OutboxItem {
  return {
    position: Number(row.position),
    eventId: row.event_id as string,
    workspaceId: row.workspace_id as string,
    envelope: JSON.parse(row.envelope as string) as SubmittedEvent,
    attempts: Number(row.attempts),
    status: row.status as 'queued' | 'failed',
  };
}

/**
 * Ordered, persisted claims in transit — and the local pre-check that decides
 * whether a claim becomes one.
 *
 * ## Pending is never fact
 *
 * Nothing here writes to `tickets`, `snapshots` or `events`. A queued claim
 * changes what `pendingFor` and `pendingCreatedTickets` say and NOTHING else, so
 * every settled surface the replica offers — `getTicket`, `listTickets`,
 * `listEntityEvents`, `searchLocal` — keeps answering from confirmed state
 * alone. That separation is the plan's honesty pin: a claim in transit rendered
 * as settled fact is the one lie an offline client is most tempted to tell,
 * because it is the one that makes the UI feel fastest.
 *
 * ## Two failure words, and they are not synonyms
 *
 * - `recordFailure` is TRANSIENT — the flush did not reach the server, or the
 *   server did not answer. It bumps `attempts`, pushes `next_attempt_at` out by
 *   `backoffMs`, and **leaves `status = 'queued'`**, so `nextBatch` offers the
 *   claim again once it is due.
 * - `status = 'failed'` is TERMINAL — the server answered, and the answer was
 *   `refused` or `invalid`. Such a claim will never be accepted by a retry, so
 *   it stops being offered and starts being VISIBLE, through `failedItems`.
 *
 * A reader who "fixes" `recordFailure` to set `'failed'` strands every
 * retryable claim on the device forever, silently. Hence this paragraph.
 */
export function createOutbox(deps: { storage: SyncStorage; replica: Replica }): Outbox {
  const { storage, replica } = deps;
  const contextDeps: LocalContextDeps = { storage, replica };

  /**
   * NO CONTEXT IS HELD ON THIS CLOSURE, deliberately — the plan's snippet builds
   * one here and it is a bug. The pre-check context is a SNAPSHOT of the replica
   * plus the outbox; one built at `createOutbox` time cannot see anything queued
   * afterwards, so the ordered pair — queue the parent's reopen, then create the
   * child under it — would refuse the child against a parent that is still
   * terminal in a world an hour old.
   *
   * MEASURED: holding the context on this closure fails FOUR cases — 12.139
   * (the reopen pair), 12.141 (a revoked scope the stale context still knows),
   * 12.144 (an ordered create-then-edit pair, where the second claim is judged
   * against a world without the first) and 12.151 (a queued transition whose
   * pending reading never appears). `Tests 4 failed | 41 passed (45)`.
   *
   * This paragraph said THREE for a whole task, and the missing id is a
   * measurement of WHEN the held context is built. Built EAGERLY here in the
   * `createOutbox` body — which is what "one built at `createOutbox` time"
   * means, and what the plan's snippet does — four go red. Memoised LAZILY on
   * the first `enqueue` (`??=`), only three do, because 12.151's first
   * `enqueue` is its only one and its held context is therefore built after
   * the `applyServerItem` that confirms the ticket. Both runs are real; the
   * eager one is the mutation this prose describes, so four is the number.
   *
   * 12.151 is also the OTHER HALF of the staleness, and the half the paragraph
   * above does not describe. 12.139 and 12.144 fail because a frozen context
   * cannot see what was QUEUED after it — the outbox half. 12.151 fails
   * because it cannot see what the replica CONFIRMED after it: its ticket is
   * created by `applyServerItem` after the outbox exists, so the frozen
   * context refuses the transition outright, nothing is queued, and
   * `pendingFor` answers `null`. A context held here is stale in BOTH
   * directions, and only one of them was written down.
   */
  async function overlayFor(ticketId: string): Promise<PendingTicket | null> {
    const overlay = await buildPendingOverlay(contextDeps);
    const pendingEventIds = overlay.queuedEventIds.get(ticketId);
    if (pendingEventIds === undefined || pendingEventIds.length === 0) return null;
    const pending = overlay.states.get(ticketId);
    // Queued but not foldable into a state — the claim is on a ticket this
    // device does not hold, or the reducer could not apply it (see
    // `buildPendingOverlay`'s note on revoked definitions). `null` says "no
    // pending READING", which is true, while `queuedCount` still counts the
    // claim and `nextBatch` still offers it: the claim is not lost, it is
    // unrenderable. Presenting the last good state as `pending` here would be
    // the overlay claiming to have applied something it did not.
    if (pending === undefined || overlay.unfoldable.has(ticketId)) return null;
    return { pending, pendingEventIds };
  }

  return {
    async enqueue(event) {
      // The same `evaluateEvent` the server runs, against the replica plus this
      // device's own queue: instant, named, and identical to the answer the
      // server will give on the same facts. A fresh context per call — see
      // `overlayFor` above for why that is load-bearing rather than tidy.
      const ctx = await buildLocalEngineContext(contextDeps);
      const probe: EventEnvelope = { ...event, serverTime: event.clientTime, seq: PROVISIONAL_SEQ };
      const verdict = await evaluateEvent(probe, ctx);
      if (verdict.refused) return { queued: false, rule: verdict.rule, reason: verdict.reason };

      await storage.run(
        'INSERT INTO outbox (event_id, workspace_id, entity_kind, entity_id, envelope) VALUES (?, ?, ?, ?, ?)',
        [event.id, event.workspaceId, event.entity.kind, event.entity.id, JSON.stringify(event)],
      );
      return { queued: true, eventId: event.id };
    },

    async nextBatch(limit = 50, now = () => new Date()) {
      // `next_attempt_at` compares as TEXT, which IS instant comparison because
      // every value in the column is a Z-normalised ISO string — `toISOString()`
      // here, the schema's epoch default otherwise. A device-offset render on
      // either side of this comparison would make claims due at the wrong moment
      // on every non-UTC machine; `schema.ts` stakes the same property on the
      // ledger's two clock columns.
      const rows = await storage.all(
        "SELECT * FROM outbox WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY position LIMIT ?",
        [now().toISOString(), limit],
      );
      return rows.map(rowToItem);
    },

    async applyResult(eventId, result) {
      if (result.status === 'committed') {
        const rows = await storage.all('SELECT envelope FROM outbox WHERE event_id = ?', [eventId]);
        if (rows.length > 0) {
          const submitted = JSON.parse(rows[0]!.envelope as string) as SubmittedEvent;
          const env: LedgerEvent = {
            ...submitted,
            serverTime: result.serverTime,
            seq: result.seq,
            workspaceSeq: result.workspaceSeq,
          };
          // The claim becomes fact through the SAME door every server item takes
          // — `applyServerItem` — so a committed claim and its later stream echo
          // fold identically and the second is ignored as the duplicate it is.
          await replica.applyServerItem(env);
        }
        // NOT redundant with `applyServerItem`'s own `DELETE FROM outbox`, and
        // the reachable path is worth naming precisely, because the obvious
        // guess is wrong. A stream ECHO that beats the HTTP answer home is
        // `{applied: true}` — it reaches that delete and clears the row itself,
        // so this line is a no-op there. The path where this line is the ONLY
        // thing that clears the row is a RE-BOOTSTRAP: `loadBootstrap` inserts
        // the device's own already-committed claim into `events` and does not
        // touch the outbox, so the row survives; `applyServerItem` then returns
        // `{applied: false}` on the duplicate id and RETURNS BEFORE its delete.
        // Without this line that claim is flushed again, forever. Case 12.149
        // walks exactly that sequence.
        await storage.run('DELETE FROM outbox WHERE event_id = ?', [eventId]);
        return;
      }

      if (result.status === 'contested') {
        const rows = await storage.all('SELECT envelope, workspace_id, entity_id FROM outbox WHERE event_id = ?', [
          eventId,
        ]);
        if (rows.length > 0) {
          const submitted = JSON.parse(rows[0]!.envelope as string) as SubmittedEvent;
          // Recorded LOCALLY, now, from the response. The real `claim.contested`
          // envelope also arrives on the stream and corrects this stub through
          // `applyContest`'s upsert — or never arrives, if visibility was lost
          // with the refusal, and then this stub is the claimant's only record
          // that their claim existed at all. Nothing silently vanishes.
          //
          // `contested_at` is this device's clock and the server's envelope
          // overwrites it; `claimant_id` is the actor of the REFUSED CLAIM,
          // matching `proj_contested` and the replica's own rule.
          await storage.run(
            `INSERT INTO contests (contested_event_id, original_event_id, workspace_id, ticket_id, claimant_id, rule, reason, original_event, contested_at, resolved, resolution)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
             ON CONFLICT(contested_event_id) DO NOTHING`,
            [
              result.contestEventId,
              eventId,
              rows[0]!.workspace_id as string,
              rows[0]!.entity_id as string,
              submitted.actorId,
              result.rule,
              result.reason,
              JSON.stringify(submitted),
              new Date().toISOString(),
            ],
          );
        }
        await storage.run('DELETE FROM outbox WHERE event_id = ?', [eventId]);
        return;
      }

      // `refused` or `invalid`: TERMINAL. The row stays, visibly failed, and
      // stops being offered to the flush — never silently dropped, because the
      // person who made the claim is owed the fact that it was refused and the
      // words it was refused in.
      const message =
        result.status === 'refused' ? `${result.rule}: ${result.reason}` : `${result.code}: ${result.message}`;
      await storage.run("UPDATE outbox SET status = 'failed', last_error = ? WHERE event_id = ?", [message, eventId]);
    },

    async recordFailure(eventIds, error, now = () => new Date()) {
      for (const eventId of eventIds) {
        const rows = await storage.all('SELECT attempts FROM outbox WHERE event_id = ?', [eventId]);
        if (rows.length === 0) continue;
        const attempts = Number(rows[0]!.attempts) + 1;
        // `toISOString()` — a Z instant, never a local render. See `nextBatch`.
        const nextAt = new Date(now().getTime() + backoffMs(attempts)).toISOString();
        await storage.run('UPDATE outbox SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE event_id = ?', [
          attempts,
          nextAt,
          error,
          eventId,
        ]);
      }
    },

    async queuedCount(workspaceId) {
      const rows = await storage.all("SELECT count(*) AS n FROM outbox WHERE workspace_id = ? AND status = 'queued'", [
        workspaceId,
      ]);
      return Number(rows[0]!.n);
    },

    async failedItems(workspaceId) {
      const rows = await storage.all(
        "SELECT * FROM outbox WHERE workspace_id = ? AND status = 'failed' ORDER BY position",
        [workspaceId],
      );
      return rows.map(rowToItem);
    },

    pendingFor: overlayFor,

    async pendingCreatedTickets(workspaceId) {
      const overlay = await buildPendingOverlay(contextDeps);
      const out: PendingTicket[] = [];
      // Ordered by ticket id so the answer is stable across calls; position
      // order would be a different, equally defensible order, but an UNSTABLE
      // one is what makes a list flicker.
      for (const ticketId of [...overlay.queuedEventIds.keys()].sort()) {
        // Confirmed already: the board lists it in its settled place, with a
        // badge for the claims still in the air. This method is only for
        // tickets that exist NOWHERE else.
        if (overlay.confirmed.has(ticketId)) continue;
        if (overlay.unfoldable.has(ticketId)) continue;
        const pending = overlay.states.get(ticketId);
        if (pending === undefined || pending.workspaceId !== workspaceId) continue;
        out.push({ pending, pendingEventIds: overlay.queuedEventIds.get(ticketId) ?? [] });
      }
      return out;
    },
  };
}
