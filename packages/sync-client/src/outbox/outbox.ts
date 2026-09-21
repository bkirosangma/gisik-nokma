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
 * ## TASK 11 CONSUMED IT AND DID NOT MOVE IT — with the cost of the move
 * ## enumerated, so the next reader is not deciding blind
 *
 * `createHttpTransport` casts `POST /v1/sync`'s body to `SyncEventResult[]` and
 * the engine's flush loop switches on it, so the mirror now has a second
 * consumer and still no compile-time link. What a move would actually touch,
 * counted rather than guessed (`grep -rln 'SyncEventResult\|SyncInvalidCode'
 * --include='*.ts' packages apps`, `dist/` and `node_modules` excluded):
 *
 * - **`apps/server`: 3 files** — `sync/sync-service.ts` (the declaration and
 *   its docblock), `sync/sync-routes.ts`, and `test/dual-client/rig.ts` (`:36` a
 *   type import, `:229` a return-type annotation — both CODE uses). **This
 *   bullet said 2, and was re-signed at 2 by the change set that repriced the
 *   fixture below** — the exact defect the next bullet congratulates itself for
 *   catching, committed inside the paragraph that celebrates it. Re-run the
 *   stated command before trusting either number.
 * - **`packages/sync-client`: 6 files** — this one, `engine/sync-engine.ts`,
 *   `net/http-transport.ts`, `index.ts`, `test/sync-engine.test.ts`, and
 *   `replica/sync-item.ts`. **This bullet said 5 and enumerated 5, and the
 *   enumeration was what made it checkable**: the stated command returns six,
 *   because `sync-item.ts` gained a docblock line naming this very record in
 *   the same commit that wrote the count. FIVE of the six are code uses; the
 *   sixth is prose. So the move's cost by the stated measure is **8 files**,
 *   not the seven the closing line used to claim — and five-plus-two if only
 *   code is counted.
 * - **`packages/domain`: nothing missing.** `IngestErrorCode` — the base of
 *   `SyncInvalidCode` — is already there (`ingest-result.ts:3`), and
 *   `ingest-result.ts` already declares an `{status:'invalid'; eventId: string
 *   | null; code; message}` member of the same shape. The type has a home
 *   waiting for it.
 * - **ONE sync-client test constructs an `invalid` result, and the narrowing
 *   NO LONGER costs it anything — the fixture edit this bullet used to price
 *   has been PAID (case 12.327).** The history stays because this bullet has
 *   been wrong twice, both times in the direction of understating the cost. It
 *   first read *"No sync-client test constructs an `invalid` result at all —
 *   measured, `grep -rn "'invalid'" packages/sync-client/test` returns
 *   nothing"*, and **the commit that wrote that sentence falsified it in the
 *   same change set**: 12.169's shifted-array half constructs one, in
 *   `test/sync-engine.test.ts` (the FILE is the durable half of that reference;
 *   the line number moved twice while that correction was being written and
 *   twice more since — it is deliberately not repeated here). It then priced
 *   the narrowing at **one fixture edit**, because the fixture carried the
 *   literal `'bad-envelope'` — a code NO SERVER EMITS, which is exactly why it
 *   was not a member of `IngestErrorCode` (`'malformed-envelope' |
 *   'unknown-event-type' | 'unknown-event-version' | 'entity-kind-mismatch' |
 *   'invalid-payload' | 'duplicate-event-id'`).
 *   **That literal is gone.** The fixture takes its code from `parseEvent` —
 *   `@gisik-nokma/domain`'s, the same function the server's ingest door calls —
 *   so the value is whatever the real parser answers and the INFERRED type is
 *   `EnvelopeErrorCode`, a member of `IngestErrorCode`. The narrowing therefore
 *   compiles. **Measured, with its own positive control, not reasoned:**
 *   replacing `code: string` below with
 *   `code: import('@gisik-nokma/domain').IngestErrorCode` and running
 *   `pnpm --filter @gisik-nokma/sync-client exec tsc -p tsconfig.typecheck.json`
 *   exits **0**; the SAME narrowing with the old `'bad-envelope'` literal put
 *   back exits **1** with `test/sync-engine.test.ts: error TS2322: Type
 *   '"bad-envelope"' is not assignable to type 'IngestErrorCode'`. Without that
 *   second run the exit 0 would have been indistinguishable from a typecheck
 *   that never looked at the file. *(The old bullet said exit 2; measured here
 *   it is exit 1. A carried exit code is a carried number like any other.)*
 *   The lesson the bullet's own history teaches: **a cost quoted for a fixture
 *   is a fact about that fixture's spelling, and it expires the moment someone
 *   spells it better.**
 *
 * The blocker that remains is scope, not difficulty: the move edits a shipped
 * server module and a shipped server route from inside a client task, on a
 * branch carrying two more tasks behind it. *Owner: still open — with a NINE-
 * file cost by the stated command and, since 12.327, no fixture cost at all.*
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
   * MEASURED, AS THE IDS RATHER THAN AS A NUMBER: holding the context on this
   * closure reddens 12.139 (the reopen pair), 12.141 (a revoked scope the stale
   * context still knows), 12.144 (an ordered create-then-edit pair, where the
   * second claim is judged against a world without the first), 12.151 (a queued
   * transition whose pending reading never appears), 12.159 (the engine's
   * ordered flush, whose two claims are enqueued after the replica was
   * bootstrapped), 12.160 (the flush that must survive a transport failure,
   * same reason), 12.169 (the misaligned-results guard, whose two claims are
   * enqueued the same way) and 12.170 (the flush door's fold failure, whose
   * claim is enqueued after a streamed `ticket.created`) — eight ids, and
   * `Tests 8 failed | 55 passed (63)` at this tree.
   *
   * THE COUNT IN THIS PARAGRAPH HAS NOW GONE STALE FOUR TIMES, and every
   * time inside the change set that moved it. It said THREE for a whole task
   * (the missing id was 12.151); it then said FOUR with
   * `Tests 4 failed | 43 passed (47)` — true of a 47-execution package — until
   * Task 11 added `test/sync-engine.test.ts`; it then said SIX, correctly, for
   * exactly as long as it took that same task to add ONE MORE case that also
   * enqueues here (12.169); and it said SEVEN until Task 11's own FIX ROUND
   * added 12.170, which enqueues here too. Not one of the four was caught by
   * reading; all four were caught by re-running the mutation. **Re-run it; do
   * not recompute it** — and the list is now written as ids first, because an
   * enumeration that goes stale is visibly wrong where a bare number is not.
   *
   * The missing id in the THREE-vs-FOUR round was a measurement of WHEN the
   * held context is built. Built EAGERLY here in the
   * `createOutbox` body — which is what "one built at `createOutbox` time"
   * means, and what the plan's snippet does — the eight ids above go red.
   * Memoised LAZILY on
   * the first `enqueue` (`??=`), 12.151 was measured green, because its first
   * `enqueue` is its only one and its held context is therefore built after
   * the `applyServerItem` that confirms the ticket. Both runs are real; the
   * eager one is the mutation this prose describes, so eight is the number —
   * and the lazy variant was measured at THREE against a 47-execution package
   * and has NOT been re-measured since. That sentence used to end "since Task
   * 11 grew it to 60": Task 11 grew the package to **61**, and this fix round's
   * two cases grew it to **63**, which is the denominator the eager run above
   * is quoted at.
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
      // INVARIANT (E6-5): a queued claim is offered only when every queued
      // claim enqueued before it is due too — the batch is the longest DUE
      // PREFIX of the queue in position order, never the set of due rows.
      //
      // The filter used to be `WHERE … AND next_attempt_at <= ?`, which reads
      // as "only rows that are due" and is: after `recordFailure` pushed a
      // batch out by `backoffMs`, a claim enqueued AFTER the failure carried
      // the schema's epoch default and was due at once, so the next flush —
      // and the product flushes on every enqueue — offered it ALONE, ahead of
      // the older claims on the same ticket it depends on. Measured
      // 2026-09-21: batch1 = [CREATE, RENAME-1] fails transiently; RENAME-2 is
      // enqueued; 500 ms later nextBatch = [RENAME-2]. The sync door then
      // refused the rename as a claim on a ticket it had never seen, filed a
      // `claim.contested` against the user's own ticket two seconds before it
      // existed, and the outbox recorded that contest and dropped the edit. A
      // queue that preserves order across a backoff boundary is what 12.144's
      // sentence ("a batch that lost the order would send a `field_set` for a
      // ticket the server has not been told about") already claimed.
      //
      // Liveness is unchanged: nothing retries a backing-off head on a timer —
      // `flush()` runs on enqueue and on catch-up — so the head was already
      // waiting for the next trigger, and now its tail waits with it. Rows in
      // `failed` (refused/invalid, terminal) are not in the queue and block
      // nothing, as before; a claim behind a terminally refused one is a
      // different question and is not decided here.
      //
      // `next_attempt_at` compares as TEXT, which IS instant comparison because
      // every value in the column is a Z-normalised ISO string — `toISOString()`
      // here, the schema's epoch default otherwise. A device-offset render on
      // either side of this comparison would make claims due at the wrong moment
      // on every non-UTC machine; `schema.ts` stakes the same property on the
      // ledger's two clock columns.
      const rows = await storage.all(
        "SELECT * FROM outbox WHERE status = 'queued' ORDER BY position LIMIT ?",
        [limit],
      );
      const nowIso = now().toISOString();
      const duePrefix: typeof rows = [];
      for (const row of rows) {
        if ((row.next_attempt_at as string) > nowIso) break;
        duePrefix.push(row);
      }
      return duePrefix.map(rowToItem);
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
