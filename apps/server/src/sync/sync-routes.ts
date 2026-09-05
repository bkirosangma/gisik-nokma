import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { LedgerEvent, TicketState, WorkspaceRole } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { listVisibleTickets } from '../visibility/visible-tickets.js';
import { readEntityEvents, rowToEnvelope, type EventRow } from '../ledger/event-store.js';
import { readLatestSnapshot, type SnapshotProvenance } from '../ledger/snapshot-store.js';
import { readStreamSeq } from './stream-seq.js';
import type { ClientIngest } from '../ingest/ingest-service.js';
import type { ServerAppend } from '../routes/invites.js';
import { MAX_BATCH_SIZE } from '../routes/events.js';
import { createSyncService } from './sync-service.js';
import { registerReconcileRoute } from './reconcile-route.js';

/**
 * The ticket-entity event types a snapshot does NOT carry, so bootstrap must
 * hand them over in full regardless of where they sit relative to a ticket's
 * snapshot seq. See `bootstrapTicket` below.
 *
 * The membership rule is mechanical, not a taste judgement: the snapshot writer
 * folds exactly `TICKET_EVENT_TYPES` and skips everything else while still
 * advancing `seq` past it (`snapshot-writer.ts`, "seq counts events, not
 * folds"), so an event filed against `entityKind: 'ticket'` that the reducer
 * does not fold is invisible in the snapshot AND below its seq — dropped from
 * the replica entirely unless it is named here.
 *
 * **This list plus `TICKET_EVENT_TYPES` must equal the registry's whole
 * `entityKind: 'ticket'` set**, or "snapshot + tail ≡ full replay" is false for
 * any ticket whose stream carries the missing type below its snapshot seq. The
 * registry binds THIRTEEN types to that kind (`vocabulary.ts`);
 * `TICKET_EVENT_TYPES` is ten of them, and the three it omits —
 * `visibility.set`, `claim.contested`, `claim.contested_resolved` — are exactly
 * the three below that are not also folded. `comment.added` and
 * `attachment.added` appear in both lists on purpose: they fold into state AND
 * are content a replica needs verbatim.
 *
 * `visibility.set` was the one that got missed, and the miss was silent and
 * ASYMMETRIC: filed above a ticket's snapshot seq it travelled, filed at or
 * below it, it vanished — so what a replica received depended on when a
 * background maintenance pass last ran. It is here for the reason
 * `vocabulary.ts` already gives: it "is filed against the TICKET whose audience
 * it changes — a claim on that ticket's own history, exactly as `comment.added`
 * is". Case 12.115 pins it with a REAL ledger event below a snapshot; the
 * projection-only `setVisibilityEnv` seed the rest of the fixture uses cannot
 * produce one.
 *
 * *Absence, named rather than implied: the membership rule above is held by
 * this comment and by arithmetic done once, NOT by a check. Nothing fails when
 * a fourteenth type is registered against `entityKind: 'ticket'` and added to
 * neither list — it reappears as exactly the defect 12.115 was written for, and
 * silently. Deriving this list from the registry instead would close it, but it
 * would also mean 12.94's hardcoded literals and this constant shrink together,
 * which is the property that check exists to deny. Owner: whoever registers the
 * next ticket-entity event type.*
 */
export const BOOTSTRAP_BACKFILL_TYPES = [
  'comment.added',
  'attachment.added',
  'visibility.set',
  'claim.contested',
  'claim.contested_resolved',
] as const;

export type BootstrapTicket = {
  ticketId: string;
  /**
   * `null` means `events` is the ticket's full history — no snapshot exists yet.
   *
   * `provenance` is ADDITIVE (ruling P36 constraint (b)): a client that does not
   * read it is unaffected, and every bootstrap case written before it stays
   * green unchanged. It carries the two claims `TicketState` cannot —
   * the state claim and the assignment claim — because `transitions[]` has
   * `actorId` and `seq` and no clock, while every FIELD claim already travels
   * inside the state with its own. Its own `null` means a snapshot row written
   * before the column existed: unknown, never unattributed.
   */
  snapshot: { seq: number; state: TicketState; provenance: SnapshotProvenance | null } | null;
  events: LedgerEvent[];
};

export type BootstrapMe = { userId: string; workspaceRole: WorkspaceRole; projectIds: string[] };

export type BootstrapResponse = {
  workspaceId: string;
  me: BootstrapMe;
  streamSeq: number;
  /**
   * Every `workflow.defined` / `ticket-type.defined` in the workspace, in
   * ASCENDING `workspace_seq` order — the same order `buildLedgerDeps` folds
   * them in, so a replica that applies them in the order it received them
   * resolves the same current definition the server does. The order is part of
   * the contract, not an accident of the query: see the query's own comment.
   */
  definitions: LedgerEvent[];
  tickets: BootstrapTicket[];
};

/**
 * One ticket's replica-build payload: the latest snapshot (if any) plus every
 * event a replica still needs on top of it — everything after the snapshot's
 * seq, PLUS every `BOOTSTRAP_BACKFILL_TYPES` event regardless of position,
 * because those are the ticket-entity types the reducer never folds and a
 * snapshot therefore never carries.
 */
async function bootstrapTicket(client: PoolClient, ticketId: string): Promise<BootstrapTicket> {
  const snapshot = await readLatestSnapshot(client, 'ticket', ticketId);
  const all = await readEntityEvents(client, 'ticket', ticketId);
  const snapSeq = snapshot?.seq ?? 0;
  const backfill: readonly string[] = BOOTSTRAP_BACKFILL_TYPES;
  const events = all.filter((e) => e.seq > snapSeq || backfill.includes(e.type));
  return {
    ticketId,
    snapshot:
      snapshot === null
        ? null
        : // No `ticketStateSchema` exists in the domain package to parse this
          // jsonb column against (see `snapshot-writer.ts`'s own note on the
          // same cast), so this is the only option available, not a shortcut
          // past one. A corrupted snapshot row surfaces as a reducer throw or
          // a wrong state downstream, never here.
          {
            seq: snapshot.seq,
            state: snapshot.state as unknown as TicketState,
            // Passed through as read. The server does not recompute it here and
            // could not: the events it was read from are, by definition, below
            // this snapshot's seq and are exactly what this payload omits.
            provenance: snapshot.provenance,
          },
    events,
  };
}

/**
 * `GET /v1/sync/bootstrap?workspaceId=<id>` — first-run replica build without
 * replaying full history: reducer-folded snapshots plus per-entity tails, full
 * backfill of every ticket-entity type the reducer does not fold
 * (`BOOTSTRAP_BACKFILL_TYPES`), definitions in `workspace_seq` order for
 * everyone including guests (a guest cannot render status without the workflow
 * definition, Plan 4 §5), and a stream cursor read FIRST inside one
 * `REPEATABLE READ` transaction so the whole response is a consistent cut —
 * subscribing at `streamSeq` can only re-deliver an event the client already
 * has, never skip one.
 *
 * "Read FIRST" is a claim about ORDER, and order is what a membership check
 * cannot see: 12.98 asserts the `BEGIN ISOLATION LEVEL REPEATABLE READ` literal
 * was issued, which constrains the isolation level and nothing about where the
 * cursor read sits. Case 12.118 pins the placement directly — the
 * `readStreamSeq` query must be issued before the first per-ticket tail read.
 *
 * 401 without a session (`requireSession`, threaded in by `app.ts` exactly as
 * every other route here takes it — house pattern, not this route's own
 * construction). 403 `{error:'not_a_member'}` when `resolveEffectiveRole`
 * answers `workspaceRole: null`.
 *
 * `deps.pool` must be a real `pg.Pool` (`.connect()` is required for the
 * transaction) — see the cast at this route's registration site in `app.ts`
 * for the consequence: this route is not compatible with a `BuildTestAppOverrides.pool`
 * wrapper that lacks `.connect()`.
 */
export type SyncRouteDeps = {
  pool: Pool;
  /**
   * The GATED door, for the client's own offline claims. Narrowed to
   * `ClientIngest` on purpose — see `sync-service.ts`'s door note. The full
   * `IngestService` the plan's snippet asks for is what makes an ungated
   * `ingestBatch([event])` for a client claim compile.
   */
  ingest: ClientIngest;
  /** The INTERNAL door, named rather than reached for: server-authored contests only. */
  serverAppend: ServerAppend;
};

export function registerSyncRoutes(
  app: FastifyInstance,
  deps: SyncRouteDeps,
  requireSession: preHandlerHookHandler,
): void {
  const syncService = createSyncService({
    pool: deps.pool,
    ingest: deps.ingest,
    serverAppend: deps.serverAppend,
  });

  // Closure 5's NARROW half (ruling P37): `POST /v1/sync/reconcile`. Registered
  // from here because it is a sync door and this is where sync doors are
  // registered, but it lives in its own file — it shares no dependency with the
  // two above (no ingest, no serverAppend, only the pool) and its whole argument
  // is about disclosure rather than about ingest.
  registerReconcileRoute(app, { pool: deps.pool }, requireSession);

  app.get<{ Querystring: { workspaceId: string } }>(
    '/v1/sync/bootstrap',
    {
      preHandler: requireSession,
      schema: {
        querystring: {
          type: 'object',
          required: ['workspaceId'],
          properties: { workspaceId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.query;
      const userId = request.currentUserId;
      const client = await deps.pool.connect();
      try {
        // One consistent cut: the cursor is read FIRST inside REPEATABLE READ,
        // so subscribing at streamSeq re-delivers at worst, never skips.
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        const eff = await resolveEffectiveRole(client, userId, workspaceId);
        if (eff.workspaceRole === null) {
          await client.query('ROLLBACK');
          return await reply.code(403).send({ error: 'not_a_member' });
        }
        const workspaceRole = eff.workspaceRole;
        const streamSeq = await readStreamSeq(client, workspaceId);
        // `ORDER BY workspace_seq`, and NOT the plan text's `(entity_kind,
        // entity_id, seq)`, for the reason `ledger-deps.ts`'s docblock spells
        // out and case 12.92 proves: a ticket type's key lives in its PAYLOAD
        // and successive definitions of one key arrive on DIFFERENT entity
        // streams, each with a fresh ULID entity id, so per-entity `seq` is 1
        // for both and cannot order them against each other at all — the id
        // ordering resolves the winner by ULID collation, which is only
        // accidentally chronological. Serving that order would hand the replica
        // the LOSER under naive last-write-wins, disagreeing with the server's
        // own fold. This is the order `buildLedgerDeps` reads in, so a client
        // that folds these in the order it received them lands where the server
        // did. Case 12.117.
        const { rows: defRows } = await client.query<EventRow>(
          `SELECT * FROM events
            WHERE workspace_id = $1 AND entity_kind IN ('workflow', 'ticket-type')
            ORDER BY workspace_seq`,
          [workspaceId],
        );
        const definitions = defRows.map(rowToEnvelope);
        const visible = await listVisibleTickets(client, userId, workspaceId);
        const tickets: BootstrapTicket[] = [];
        for (const row of visible) {
          tickets.push(await bootstrapTicket(client, row.ticket_id as string));
        }
        await client.query('COMMIT');
        const me: BootstrapMe = {
          userId,
          workspaceRole,
          // `eff.projects` is a `Map<string, {projectAdmin: boolean}>` — spreading
          // the map itself (`[...eff.projects]`) yields `[key, value]` TUPLES, not
          // ids. `.keys()` is the fix (Plan 10 adaptation map, Task 6).
          projectIds: [...eff.projects.keys()],
        };
        const body: BootstrapResponse = { workspaceId, me, streamSeq, definitions, tickets };
        return body;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // The original error is the one worth throwing; a failed ROLLBACK
          // (e.g. the connection already died) must not mask it.
        }
        throw err;
      } finally {
        client.release();
      }
    },
  );

  /**
   * `POST /v1/sync` — the sync ingress (amendment 16). Body
   * `{events: [raw SubmittedEvent, …]}`, 1-`MAX_BATCH_SIZE` of them (the same
   * bound `POST /v1/events` uses, imported rather than restated), answered 200
   * `{results: SyncEventResult[]}` index-aligned with the request array.
   *
   * HTTP status means "was this a batch"; every per-event answer — envelope
   * error, refusal, contest — rides inside `results`, exactly as the
   * interactive door does.
   *
   * The two doors this handler's service submits through, and why each one, are
   * `sync-service.ts`'s opening docblock. The short version, because it is the
   * thing a reader of THIS file needs: the client's offline claim goes through
   * `ingestClientBatch` (gated), the server's `claim.contested` append goes
   * through `serverAppend` (internal, and forced — a contest is server-origin
   * and the client door refuses that value).
   *
   * `additionalProperties: false` matches `/v1/events`: a body carrying a
   * second key is not a batch this door recognises.
   */
  app.post(
    '/v1/sync',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['events'],
          additionalProperties: false,
          properties: {
            events: { type: 'array', minItems: 1, maxItems: MAX_BATCH_SIZE },
          },
        },
      },
    },
    async (request) => {
      const { events } = request.body as { events: unknown[] };
      return { results: await syncService.processBatch(request.currentUserId, events) };
    },
  );
}
