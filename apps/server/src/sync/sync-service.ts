import type { Pool } from 'pg';
import {
  parseEvent,
  type IngestErrorCode,
  type LedgerEvent,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { PERMISSION_VISIBILITY_RULE } from '../permissions/check-permission.js';
import type { ClientIngest } from '../ingest/ingest-service.js';
import { isUniqueViolation, rowToEnvelope, type EventRow } from '../ledger/event-store.js';
import type { ServerAppend } from '../routes/invites.js';
import { buildContestedClaim } from './contest-coherence.js';

/**
 * The rule id a refusal about audience carries, re-exported under the name the
 * plan's wire contract published to `packages/sync-client` (Plan 10 Tasks
 * 10/11). It is DEFINED as `PERMISSION_VISIBILITY_RULE` rather than spelled
 * again, for the same reason `SERVER_ORIGIN_RULE` is defined as
 * `PERMISSION_ROLE_RULE` in `check-permission.ts`: two literals that must match
 * character for character are two things that can drift, and the replica
 * compares this string to decide what a person is shown.
 *
 * Nothing in this module produces the refusal. `checkVisibilityPermission`
 * does, at the client door, for every ticket-entity event — see `processOne`'s
 * note on the plan's step 6.
 */
export const VISIBILITY_REFUSAL_RULE = PERMISSION_VISIBILITY_RULE;

export type SyncInvalidCode = IngestErrorCode | 'actor-mismatch' | 'reserved-type';

export type SyncEventResult =
  | { status: 'committed'; eventId: string; seq: number; workspaceSeq: number; serverTime: string }
  | { status: 'contested'; eventId: string; rule: string; reason: string; contestEventId: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string }
  | { status: 'invalid'; eventId: string | null; code: SyncInvalidCode; message: string };

export type SyncService = {
  processBatch(userId: string, rawEvents: unknown[]): Promise<SyncEventResult[]>;
};

/**
 * # WHICH DOOR EACH CALL USES, AND WHY
 *
 * This is the note the whole task turns on, so it is stated before anything
 * else in the file: **this module submits through BOTH ingest doors, and which
 * one each call takes is a security decision, not a convenience.**
 *
 * - **The client's own offline claim goes through `deps.ingest.ingestClientBatch`
 *   — the GATED door.** It is a stranger's claim that happens to have been made
 *   while the device was offline; being late is not being trusted. Routing it
 *   through the internal door would skip `checkPermission` entirely, which is
 *   every membership, role, envelope-origin and visibility question the server
 *   asks. `ingest-service.ts`'s own docblock names this exact route as the case
 *   it feared: *"the DANGEROUS door has the shorter, more obvious name …
 *   reaching for it silently ungates every event that route accepts — for
 *   `POST /v1/sync` (Plan 10), every offline-originated event in the product."*
 * - **The server's own `claim.contested` append goes through `deps.serverAppend`
 *   — the INTERNAL door.** It is FORCED, not chosen: a contest carries
 *   envelope-origin `'server'` because `contest.server-only` requires it, and
 *   the client door refuses exactly that value (`SERVER_ORIGIN_REASON`). This is
 *   the same class of legitimate internal-door use as the workspace bootstrap
 *   and invite acceptance, which `ingest-service.ts` names as the others.
 *
 * ## The deps type is what makes that a guarantee rather than a comment
 *
 * The plan's own snippet takes the full `IngestService` and calls
 * `deps.ingest.ingestBatch([event])` for the CLIENT's claim — the ungated door,
 * for the one event on this path that most needs the gate. Taking the full
 * service is what makes that mistake compile.
 *
 * So this module does not take it. It takes the narrowed `ClientIngest` (which
 * has no `ingestBatch` at all) plus `ServerAppend` as a separately-named
 * capability, exactly as `routes/invites.ts` does for the same reason: the
 * dangerous door has to be asked for by name, at one call site, where it shows
 * up in a diff. A reflex `deps.ingest.ingestBatch(...)` here is now a COMPILE
 * error rather than a documented mistake, and the comment above is the reason
 * rather than the whole defence.
 *
 * ## Envelope-origin, not HTTP-Origin
 *
 * Every mention of "origin" in this module is `EventEnvelope.origin`, the
 * provenance enum `'web' | 'mobile' | 'desktop' | 'server'`. Nothing here
 * concerns the browser `Origin` header, CSRF or cross-site requests. The two
 * are routinely conflated in this area of the repo, and the conflation is how
 * someone writes a header check and believes the forgery window is closed.
 *
 * ## What this path answers (amendment 16)
 *
 * Retries are EXPECTED here, so duplicates answer idempotently from the ledger
 * and from `proj_contested`; refusals on a ticket become `claim.contested`
 * ledger events — a contested claim is history, never a silent drop (honesty
 * invariant 5). The interactive door keeps refusing WITHOUT recording, and the
 * two are proven side by side.
 */
export type SyncServiceDeps = {
  pool: Pool;
  /** The GATED door — the client's own offline claims. Never `IngestService`. */
  ingest: ClientIngest;
  /** The INTERNAL door — server-authored contests only. See the docblock above. */
  serverAppend: ServerAppend;
};

export function createSyncService(deps: SyncServiceDeps): SyncService {
  /**
   * `rowToEnvelope` answers a `LedgerEvent` (§18) — the frozen envelope PLUS
   * its workspace stream position, which the replica needs in order to store
   * what arrived instead of inventing an order for it.
   */
  async function storedEnvelope(eventId: string): Promise<LedgerEvent | null> {
    const { rows } = await deps.pool.query<EventRow>('SELECT * FROM events WHERE id = $1', [eventId]);
    const row = rows[0];
    return row === undefined ? null : rowToEnvelope(row);
  }

  /**
   * The lookup the `proj_contested_original_idx` UNIQUE index was built for and
   * which nothing performed until now (case 12.83). Without it a re-submitted
   * refused claim mints a SECOND contest, the index rejects the INSERT inside
   * `commitOne`, and `isUniqueViolation` — which matches only `events_pkey` —
   * rethrows: the whole `processBatch` call dies, so the answers already
   * decided for that batch's committed neighbours never reach the client, and a
   * retry cannot recover because a re-minted contest carries a fresh event id
   * and never meets the `events_pkey` duplicate path.
   */
  async function storedContest(
    originalEventId: string,
  ): Promise<{ contestEventId: string; rule: string; reason: string } | null> {
    const { rows } = await deps.pool.query<{
      contested_event_id: string;
      rule: string;
      reason: string;
    }>(
      'SELECT contested_event_id, rule, reason FROM proj_contested WHERE original_event_id = $1',
      [originalEventId],
    );
    const row = rows[0];
    return row === undefined
      ? null
      : { contestEventId: row.contested_event_id, rule: row.rule, reason: row.reason };
  }

  /**
   * Records a refusal as history.
   *
   * The envelope is built by `buildContestedClaim` and NOT by a local
   * `newSubmittedEvent` call as the plan's snippet does. That is the difference
   * between coherence being structural and coherence being checked: the
   * constructor reads the contest's `workspaceId` and `entity` OFF the refused
   * claim, so it has no parameter through which they could disagree, and
   * `checkContestCoherence` — which runs on both doors — becomes the net for
   * contests built any other way rather than the only thing standing between
   * this path and an incoherent row.
   *
   * **`actorId` is the CLAIMANT, and the repo's own prose expects the server.**
   * `contest-coherence.ts`, the `proj_contested.claimant_id` migration comment
   * and `notifications/fanout.ts` all describe `env.actorId` here as "the SERVER
   * identity that filed the contest". There is no such identity in this
   * product: `actorId` is `ulidString`, every ULID in the actor position today
   * is a real person, and `bootstrapWorkspace` — the other server-authored
   * sequence — attributes its own appends to the human whose action caused them
   * (`founding.actorId`) with envelope-origin `'server'` carrying the "the
   * server wrote this" fact. Minting a synthetic system user is a product
   * decision no plan in this series has taken, so this follows the precedent
   * that exists rather than inventing one. The consequence, stated because it
   * is invisible otherwise: on THIS path `proj_contested.claimant_id` equals the
   * contest event's own `actorId`, so fan-out's mis-routing bug (addressing
   * `env.actorId` instead of `originalEvent.actorId`) would be undetectable
   * against production data — it stays detectable only because that module's own
   * fixture uses two different users, which its docblock says in as many words.
   */
  async function contest(event: SubmittedEvent, rule: string, reason: string): Promise<SyncEventResult> {
    const contestEvent = buildContestedClaim({
      originalEvent: event,
      rule,
      reason,
      actorId: event.actorId,
    });
    let appended;
    try {
      [appended] = await deps.serverAppend([contestEvent]);
    } catch (error) {
      // The concurrent-retry residual of case 12.83: two `POST /v1/sync` calls
      // carrying the same refused claim can both pass the `storedContest`
      // lookup above before either commits, and the loser meets the UNIQUE
      // index inside `commitOne`. Answering from the winner's row is the same
      // answer the sequential retry gets; rethrowing would take the whole batch
      // down, which is precisely the failure the lookup exists to prevent.
      //
      // Matching the constraint BY NAME is what keeps this from swallowing an
      // unrelated fault, and which faults it could have swallowed is measured
      // rather than assumed. Every unique constraint in the schema
      // (`grep -rn UNIQUE apps/server/migrations/*.sql`) belongs to one of:
      // `events` (three, all differently named, so they rethrow), the auth,
      // invite and attachment tables (no projection a `claim.contested` append
      // writes touches them), `notifications_user_dedupe_unique` (the fan-out
      // runs on `onEventCommitted`, AFTER the transaction commits, on a
      // listener whose throws ingest swallows by design), and this one. So the
      // only 23505 this `catch` can reach with THIS constraint name is a second
      // contest on this event's own refused claim — which is why the lookup
      // below can be keyed on `event.id` at all. The `raced === null` arm is
      // the belt: if the row is somehow not there, the original error is the
      // honest answer.
      if (!isUniqueViolation(error, 'proj_contested_original_idx')) {
        throw error;
      }
      const raced = await storedContest(event.id);
      if (raced === null) {
        throw error;
      }
      return { status: 'contested', eventId: event.id, ...raced };
    }
    if (appended?.status !== 'committed') {
      // The server failing to record its own refusal is an integrity failure,
      // not a client error: answering the claimant "refused" while the ledger
      // holds no account of it is the silent drop honesty invariant 5 forbids.
      throw new Error(
        `failed to append claim.contested for ${event.id}: ${JSON.stringify(appended)}`,
      );
    }
    return { status: 'contested', eventId: event.id, rule, reason, contestEventId: contestEvent.id };
  }

  /** The idempotent-accept answer, read back off the ledger row itself. */
  function acceptStored(stored: LedgerEvent): SyncEventResult {
    return {
      status: 'committed',
      eventId: stored.id,
      seq: stored.seq,
      workspaceSeq: stored.workspaceSeq,
      serverTime: stored.serverTime,
    };
  }

  async function processOne(userId: string, raw: unknown): Promise<SyncEventResult> {
    // 1. Envelope errors cannot contest — they are not well-formed claims, so
    //    there is nothing coherent to embed in a contest's payload.
    const parsed = parseEvent(raw);
    if (!parsed.ok) {
      return { status: 'invalid', eventId: parsed.eventId, code: parsed.code, message: parsed.message };
    }
    const event = parsed.event;

    // 2. A synced claim is still the signed-in user's claim. This ALSO closes,
    //    for this door, the half of case 12.82 that the coherence check leaves
    //    open: `proj_contested.claimant_id` is `originalEvent.actorId` verbatim,
    //    so a path that relayed other people's claims would let anyone file a
    //    fabricated contested claim against any person. Here the embedded claim
    //    is provably the submitter's own.
    if (event.actorId !== userId) {
      return {
        status: 'invalid',
        eventId: event.id,
        code: 'actor-mismatch',
        message: 'A synced claim must belong to the signed-in user.',
      };
    }

    // 3. Only the server records contests. `contest.server-only` backs this
    //    everywhere else; this is defence at the door, and it answers BEFORE
    //    `checkContestCoherence` could, so the coherence check's three
    //    comparisons are unreachable through this route by construction.
    if (event.type === 'claim.contested') {
      return {
        status: 'invalid',
        eventId: event.id,
        code: 'reserved-type',
        message: 'Only the server records contested claims.',
      };
    }

    // 4. Already in the ledger → idempotent-accept with the STORED facts. The
    //    guarantee a retry gets is the same INSTANT the first attempt was
    //    answered with, not the same characters: both sides Z-normalise today,
    //    and the tests assert parsed instants so a change in how either spells
    //    an instant is caught as a formatting change rather than mistaken for a
    //    broken idempotency contract.
    const stored = await storedEnvelope(event.id);
    if (stored !== null) {
      return acceptStored(stored);
    }

    // 5. Already contested → the ONE recorded contest, never a second.
    const priorContest = await storedContest(event.id);
    if (priorContest !== null) {
      return { status: 'contested', eventId: event.id, ...priorContest };
    }

    // The plan's step 6 — an explicit `getResolvedVisibility` + `canSee` pass
    // before ingest — is deliberately ABSENT. `checkVisibilityPermission`
    // (Plan 4 Task 9) already refuses every ticket-entity event whose ticket the
    // caller cannot see, with this module's own `VISIBILITY_REFUSAL_RULE`, and
    // it runs INSIDE the ingest transaction against the client the workspace
    // lock has settled — a pre-check on `deps.pool` would answer from outside
    // that lock. Two checks answering one question is how the pair drifts and
    // how one of them stops being exercised; the observable answer is
    // unchanged, and the case that pins it is a door test precisely because
    // there is no longer a local check standing in for the gate.
    const [result] = await deps.ingest.ingestClientBatch([event], userId);
    if (result === undefined) {
      throw new Error('ingestClientBatch answered nothing for one event');
    }
    switch (result.status) {
      case 'committed': {
        // `IngestResult` carries the per-entity seq only; the replica needs the
        // WORKSPACE stream position too, so the row ingest just wrote is read
        // back by primary key. Inventing a workspaceSeq here would be a lie
        // about order.
        const written = await storedEnvelope(result.eventId);
        if (written === null) {
          throw new Error(`ingest reported committed but ${result.eventId} is not in the ledger`);
        }
        return {
          status: 'committed',
          eventId: result.eventId,
          seq: result.seq,
          workspaceSeq: written.workspaceSeq,
          serverTime: result.serverTime,
        };
      }
      case 'invalid': {
        if (result.code === 'duplicate-event-id') {
          // Amendment 16: on THIS path a duplicate is an idempotent accept, not
          // an error. Step 4 catches the ordinary retry; this catches the one
          // that raced another request between that read and the insert.
          // Passing it through as `invalid`, which the plan's own switch does,
          // would contradict the amendment for exactly the case retries are
          // most likely to produce.
          const written = await storedEnvelope(result.eventId ?? event.id);
          if (written !== null) {
            return acceptStored(written);
          }
        }
        return { status: 'invalid', eventId: result.eventId, code: result.code, message: result.message };
      }
      case 'refused':
        // A ticket can carry the contest; anything else has nothing to attach
        // one to, so the client surfaces it as a failed outbox item instead.
        if (event.entity.kind === 'ticket') {
          return contest(event, result.rule, result.reason);
        }
        return { status: 'refused', eventId: event.id, rule: result.rule, reason: result.reason };
    }
  }

  return {
    async processBatch(userId, rawEvents) {
      const results: SyncEventResult[] = [];
      // Strictly in batch order, one committed transaction at a time. Both
      // halves are load-bearing: an ordered pair (parent reopen, then child
      // create) whose first member contests must see the second contest too,
      // coherently; and the same refused claim appearing TWICE in one batch is
      // answered from the contest the earlier iteration committed, which only
      // works because each iteration's transaction is closed before the next
      // reads.
      for (const raw of rawEvents) {
        results.push(await processOne(userId, raw));
      }
      return results;
    },
  };
}
