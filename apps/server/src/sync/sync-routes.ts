import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { LedgerEvent, TicketState, WorkspaceRole } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { listVisibleTickets } from '../visibility/visible-tickets.js';
import { readEntityEvents, rowToEnvelope, type EventRow } from '../ledger/event-store.js';
import { readLatestSnapshot } from '../ledger/snapshot-store.js';
import { readStreamSeq } from './stream-seq.js';

/**
 * Content and contests are not ticket *state*, so a snapshot does not carry
 * them — they backfill in full regardless of where they sit relative to a
 * ticket's snapshot seq. See `bootstrapTicket` below.
 */
export const BOOTSTRAP_BACKFILL_TYPES = [
  'comment.added',
  'attachment.added',
  'claim.contested',
  'claim.contested_resolved',
] as const;

export type BootstrapTicket = {
  ticketId: string;
  /** `null` means `events` is the ticket's full history — no snapshot exists yet. */
  snapshot: { seq: number; state: TicketState } | null;
  events: LedgerEvent[];
};

export type BootstrapMe = { userId: string; workspaceRole: WorkspaceRole; projectIds: string[] };

export type BootstrapResponse = {
  workspaceId: string;
  me: BootstrapMe;
  streamSeq: number;
  definitions: LedgerEvent[];
  tickets: BootstrapTicket[];
};

/**
 * One ticket's replica-build payload: the latest snapshot (if any) plus every
 * event a replica still needs on top of it — everything after the snapshot's
 * seq, PLUS every backfill-type event regardless of position, because content
 * and contests never fold into the reducer's state.
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
          { seq: snapshot.seq, state: snapshot.state as unknown as TicketState },
    events,
  };
}

/**
 * `GET /v1/sync/bootstrap?workspaceId=<id>` — first-run replica build without
 * replaying full history: reducer-folded snapshots plus per-entity tails, full
 * comment/contest backfill, definitions for everyone including guests (a guest
 * cannot render status without the workflow definition, Plan 4 §5), and a
 * stream cursor read FIRST inside one `REPEATABLE READ` transaction so the
 * whole response is a consistent cut — subscribing at `streamSeq` can only
 * re-deliver an event the client already has, never skip one.
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
export function registerSyncRoutes(
  app: FastifyInstance,
  deps: { pool: Pool },
  requireSession: preHandlerHookHandler,
): void {
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
        const { rows: defRows } = await client.query<EventRow>(
          `SELECT * FROM events
            WHERE workspace_id = $1 AND entity_kind IN ('workflow', 'ticket-type')
            ORDER BY entity_kind, entity_id, seq`,
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
}
