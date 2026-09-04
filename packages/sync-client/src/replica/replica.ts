import {
  applyTicketEvent,
  claimContestedPayloadSchema,
  claimContestedResolvedPayloadSchema,
  CONTEST_EVENT_TYPES,
  docToPlainText,
  foldTicketToWorkflowVersion,
  TICKET_EVENT_TYPES,
  ticketTypeDefSchema,
  workflowDefinedPayloadSchema,
  type EventEnvelope,
  type LedgerEvent,
  type PublishedWorkflowDef,
  type SubmittedEvent,
  type TicketState,
  type TicketStateDeps,
  type WorkspaceRole,
} from '@gisik-nokma/domain';
import { migrateLocal } from '../storage/schema.js';
import type { SqlRow, SyncStorage } from '../storage/storage.js';
import { buildLocalDeps, workflowVersionsOf } from './local-deps.js';
import { isSyncInstruction, type ScopeRevokedInstruction, type SyncInstruction, type SyncItem } from './sync-item.js';

/**
 * The bootstrap wire shape (`GET /v1/sync/bootstrap`, Plan 10 Task 6),
 * re-declared client-side for the same reason `sync-item.ts` mirrors
 * `SyncItem`: this package may not depend on `apps/server`. The server's
 * `BootstrapResponse` in `apps/server/src/sync/sync-routes.ts` is the
 * authority; these are structural copies with no compile-time link, and the
 * same move-to-domain note applies.
 */
export type Me = { userId: string; workspaceRole: WorkspaceRole; projectIds: string[] };
export type BootstrapTicket = {
  ticketId: string;
  /** `null` means `events` is the ticket's full history — no snapshot exists yet. */
  snapshot: { seq: number; state: TicketState } | null;
  events: LedgerEvent[];
};
export type BootstrapResponse = {
  workspaceId: string;
  me: Me;
  streamSeq: number;
  /** Every `workflow.defined` / `ticket-type.defined`, ascending `workspaceSeq`. */
  definitions: LedgerEvent[];
  tickets: BootstrapTicket[];
};

export type LocalContest = {
  contestedEventId: string;
  originalEventId: string;
  workspaceId: string;
  ticketId: string;
  claimantId: string;
  rule: string;
  reason: string;
  originalEvent: SubmittedEvent;
  contestedAt: string;
  resolved: boolean;
  resolution: string | null;
};

export type ReplicaTicket = { ticketId: string; confirmed: TicketState | null; contests: LocalContest[] };

export type Replica = {
  loadBootstrap(data: BootstrapResponse): Promise<void>;
  /** `{ applied: false }` means a duplicate event id was ignored — delivery is at-least-once. */
  applyServerItem(item: SyncItem): Promise<{ applied: boolean }>;
  purgeEntity(entityId: string): Promise<void>;
  revokeScope(instruction: ScopeRevokedInstruction): Promise<void>;
  getTicket(ticketId: string): Promise<ReplicaTicket | null>;
  listTickets(workspaceId: string): Promise<ReplicaTicket[]>;
  listContests(
    workspaceId: string,
    filter?: { ticketId?: string; claimantId?: string; open?: boolean },
  ): Promise<LocalContest[]>;
  /** Local history view, per-entity `seq` order. */
  listEntityEvents(ticketId: string): Promise<LedgerEvent[]>;
  searchLocal(workspaceId: string, text: string): Promise<Array<{ ticketId: string; title: string }>>;
  getCursor(workspaceId: string): Promise<number>;
  setCursor(workspaceId: string, seq: number): Promise<void>;
  getMe(): Promise<Me | null>;
  /** Local definitions — the same object the outbox pre-check (Task 10) folds against. */
  buildDeps(): Promise<TicketStateDeps>;
  /** View invalidation; returns the unsubscribe. */
  onChange(cb: () => void): () => void;
};

/**
 * Local row → envelope.
 *
 * Both clocks come back as the ISO 'Z' strings the server's own `rowToEnvelope`
 * emitted and this replica stored verbatim — no parse, no re-format, no
 * local-offset step. The replica's job is to hold what it was handed;
 * re-rendering an instant on the way out would give the offline copy its own
 * opinion about when things happened, and `2026-08-21T00:00:00+05:30` and
 * `2026-08-20T18:30:00.000Z` are one moment written two ways, only the second
 * of which the server will ever send.
 *
 * That is not decoration: `schema.ts` stakes "string comparison IS instant
 * comparison and lexicographic order IS chronological order" on these columns,
 * and every day question this product asks — which calendar cell, due today,
 * overdue — is `istDayOf` applied to one of these strings by a LATER layer.
 * A device-offset render here would move a claim across midnight on every
 * client whose clock is not IST. Pinned under a non-IST `TZ` by
 * `test/replica.test.ts` (case 12.132).
 */
function rowToEnvelope(row: SqlRow): LedgerEvent {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    entity: { kind: row.entity_kind as EventEnvelope['entity']['kind'], id: row.entity_id as string },
    type: row.type as string,
    version: Number(row.version),
    payload: JSON.parse(row.payload as string),
    actorId: row.actor_id as string,
    origin: row.origin as EventEnvelope['origin'],
    clientTime: row.client_time as string,
    serverTime: row.server_time as string,
    seq: Number(row.seq),
    workspaceSeq: Number(row.workspace_seq),
  };
}

function rowToContest(row: SqlRow): LocalContest {
  return {
    contestedEventId: row.contested_event_id as string,
    originalEventId: row.original_event_id as string,
    workspaceId: row.workspace_id as string,
    ticketId: row.ticket_id as string,
    claimantId: row.claimant_id as string,
    rule: row.rule as string,
    reason: row.reason as string,
    originalEvent: JSON.parse(row.original_event as string) as SubmittedEvent,
    contestedAt: row.contested_at as string,
    resolved: Number(row.resolved) === 1,
    resolution: (row.resolution as string | null) ?? null,
  };
}

const CONTEST_TYPES: readonly string[] = CONTEST_EVENT_TYPES;
const FOLDING_TICKET_TYPES: readonly string[] = TICKET_EVENT_TYPES;

export async function createReplica(deps: { storage: SyncStorage }): Promise<Replica> {
  const { storage } = deps;
  await migrateLocal(storage);
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const cb of listeners) cb();
  };

  /**
   * Column order matches Plan 1's `insertEventSql`, `workspace_seq` included: a
   * replica stores exactly what arrived. Inventing a stream position for a row
   * that was handed one would be the quietest possible lie about ordering.
   */
  async function insertEnvelope(tx: SyncStorage, env: LedgerEvent): Promise<void> {
    await tx.run(
      `INSERT INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq, workspace_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        env.id,
        env.workspaceId,
        env.entity.kind,
        env.entity.id,
        env.type,
        env.version,
        JSON.stringify(env.payload),
        env.actorId,
        env.origin,
        env.clientTime,
        env.serverTime,
        env.seq,
        env.workspaceSeq,
      ],
    );
  }

  /**
   * Store a definition. Returns the parsed workflow definition when this event
   * was a `workflow.defined`, so the caller folds against the same value that
   * was stored rather than a second reading of the payload.
   *
   * Parsed, not cast: `workflowDefinedPayloadSchema` is what keeps
   * `stateMapping` (it is DECLARED in the extend, which is what `hasStateMapping`
   * rests on) while stripping fields this client does not know. A cast would
   * put an unvalidated object where the version walk reads its destinations.
   */
  async function applyDefinition(tx: SyncStorage, env: EventEnvelope): Promise<PublishedWorkflowDef | null> {
    if (env.type === 'workflow.defined') {
      const def = workflowDefinedPayloadSchema.parse(env.payload);
      await tx.run(
        `INSERT INTO workflows (workflow_id, version, def) VALUES (?, ?, ?)
         ON CONFLICT(workflow_id, version) DO UPDATE SET def = excluded.def`,
        [def.id, def.version, JSON.stringify(def)],
      );
      return def;
    }
    if (env.type === 'ticket-type.defined') {
      const def = ticketTypeDefSchema.parse(env.payload);
      await tx.run(
        `INSERT INTO ticket_types (type_id, def) VALUES (?, ?)
         ON CONFLICT(type_id) DO UPDATE SET def = excluded.def`,
        [def.id, JSON.stringify(def)],
      );
    }
    return null;
  }

  /** The ticket's current replay baseline seq, or 0 when it has no snapshot. */
  async function snapshotSeqOf(tx: SyncStorage, ticketId: string): Promise<number> {
    const rows = await tx.all("SELECT seq FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]);
    return rows.length === 0 ? 0 : Number(rows[0]!.seq);
  }

  async function writeSnapshot(tx: SyncStorage, ticketId: string, seq: number, state: TicketState): Promise<void> {
    await tx.run(
      `INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ('ticket', ?, ?, ?)
       ON CONFLICT(entity_kind, entity_id) DO UPDATE SET seq = excluded.seq, state = excluded.state`,
      [ticketId, seq, JSON.stringify(state)],
    );
  }

  async function upsertTicket(tx: SyncStorage, state: TicketState): Promise<void> {
    await tx.run(
      `INSERT INTO tickets (ticket_id, workspace_id, parent_id, state) VALUES (?, ?, ?, ?)
       ON CONFLICT(ticket_id) DO UPDATE SET workspace_id = excluded.workspace_id, parent_id = excluded.parent_id, state = excluded.state`,
      [state.id, state.workspaceId, state.parentId, JSON.stringify(state)],
    );
  }

  /**
   * An arriving `workflow.defined` folds every local ticket on that workflow
   * forward — the replica's half of refresh-on-publish (owner decision
   * 2026-08-26). Without it an offline client keeps the old category forever,
   * and category is what drives its board columns, its rollups, the open-children
   * check behind the parent-terminal invariant and the attention strip. A
   * desktop running all afternoon would quietly disagree with the web tab beside
   * it about which tickets are still open, and nothing would say so.
   *
   * The walk is domain's `foldTicketToWorkflowVersion`, never a local
   * re-implementation. That function's own docblock names this caller: *"the
   * proj_tickets projection, the fixture suite's in-memory context, and Plan 10's
   * offline replica all call this"*, and `projections/tickets.ts` says the
   * monotone guard is duplicated inside it *"because Plan 10's replica has no SQL
   * to hold it in"*. The plan text told this task to hand-roll the walk out of
   * `foldStateIdForward` + `stateCategoryOf`; the repo had already put that
   * composition behind one function and pre-declared this caller, so the repo
   * wins. What it buys, beyond one implementation: a HOLE in the version chain
   * throws its own message instead of being flattened into "dropped with no
   * stateMapping", which sends a reader to the right file.
   *
   * The replica can supply the whole chain because bootstrap ships EVERY
   * `workflow.defined`, not only the latest, and `workflows` is keyed
   * `(workflow_id, version)`.
   */
  async function foldTicketsOntoVersion(tx: SyncStorage, latest: PublishedWorkflowDef): Promise<void> {
    const getVersion = await workflowVersionsOf(tx, latest.id);
    const rows = await tx.all('SELECT state FROM tickets', []);

    for (const row of rows) {
      const state = JSON.parse(row.state as string) as TicketState;
      if (state.workflowId !== latest.id) continue;
      // `foldTicketToWorkflowVersion` holds this same guard and would return
      // `state` untouched. It is repeated here so an untouched ticket costs no
      // writes at all — in particular no snapshot rewrite — rather than to
      // decide correctness, which is the domain's job.
      if (state.workflowVersion >= latest.version) continue;

      // The transition log is carried across UNCHANGED by the domain function:
      // each entry keeps the workflowId and workflowVersion whose vocabulary its
      // toStateId is written in, which is the only reason require-different-user
      // can still walk it forward afterwards.
      const next = foldTicketToWorkflowVersion(state, latest, getVersion);
      await upsertTicket(tx, next);

      // THE LOAD-BEARING HALF. If the fold updated only the `tickets` row, the
      // next event for this ticket would send `refoldTicket` back over its
      // pre-fold history and replay a `toStateId` this version may have dropped
      // — undoing the fold, or throwing inside `applyTicketEvent`. Persisting
      // the folded state as the new replay baseline means history written in the
      // old vocabulary is never replayed against the new one.
      //
      // `Math.max` against the existing baseline, not the event maximum alone:
      // bootstrap backfills ticket-entity events BELOW the snapshot's seq
      // (`BOOTSTRAP_BACKFILL_TYPES`), so `MAX(events.seq)` can be smaller than
      // the baseline already in place, and lowering a baseline is exactly how
      // pre-fold history gets replayed against the new vocabulary. The baseline
      // only ever moves forward.
      const seqRows = await tx.all(
        "SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE entity_kind = 'ticket' AND entity_id = ?",
        [next.id],
      );
      const baseline = Math.max(Number(seqRows[0]?.seq ?? 0), await snapshotSeqOf(tx, next.id));
      await writeSnapshot(tx, next.id, baseline, next);
    }
  }

  async function applyContest(tx: SyncStorage, env: LedgerEvent): Promise<void> {
    if (env.type === 'claim.contested') {
      const p = claimContestedPayloadSchema.parse(env.payload);
      // Upsert: the outbox may have written a local stub from the sync response
      // (client-side timestamp) before the real event streams in — the server's
      // envelope is the truth and corrects the stub, so replicas converge exactly.
      //
      // `claimant_id` is the actor of the REFUSED claim, not of the contest: the
      // server files contests, so reading the contest's own actor would name the
      // same person on every row and empty My Work for everyone. Same rule as
      // the server's `proj_contested`.
      await tx.run(
        `INSERT INTO contests (contested_event_id, original_event_id, workspace_id, ticket_id, claimant_id, rule, reason, original_event, contested_at, resolved, resolution)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
         ON CONFLICT(contested_event_id) DO UPDATE SET contested_at = excluded.contested_at, rule = excluded.rule, reason = excluded.reason, original_event = excluded.original_event`,
        [
          env.id,
          p.originalEvent.id,
          env.workspaceId,
          env.entity.id,
          p.originalEvent.actorId,
          p.rule,
          p.reason,
          JSON.stringify(p.originalEvent),
          env.serverTime,
        ],
      );
      return;
    }
    const p = claimContestedResolvedPayloadSchema.parse(env.payload);
    await tx.run('UPDATE contests SET resolved = 1, resolution = ? WHERE contested_event_id = ?', [
      p.resolution,
      p.contestedEventId,
    ]);
  }

  /**
   * Refold one ticket's confirmed state: snapshot baseline plus the local events
   * past it, reducer only. There is no code path here that could assemble a
   * ticket from a server projection — the replica only ever receives envelopes
   * and snapshots.
   *
   * FILTER BEFORE FOLDING, and it is the common path rather than an edge case.
   * THIRTEEN event types bind to `entityKind: 'ticket'`; `applyTicketEvent`
   * folds TEN and THROWS on anything else. `visibility.set`, `claim.contested`
   * and `claim.contested_resolved` are the other three, and bootstrap backfills
   * all three (`claim.contested` unconditionally), so an unfiltered replay would
   * throw on an ordinary first sync.
   */
  async function refoldTicket(tx: SyncStorage, ticketId: string, localDeps: TicketStateDeps): Promise<void> {
    const snapRows = await tx.all("SELECT seq, state FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = ?", [
      ticketId,
    ]);
    let state: TicketState | undefined =
      snapRows.length > 0 ? (JSON.parse(snapRows[0]!.state as string) as TicketState) : undefined;
    const snapSeq = snapRows.length > 0 ? Number(snapRows[0]!.seq) : 0;
    const eventRows = await tx.all(
      "SELECT * FROM events WHERE entity_kind = 'ticket' AND entity_id = ? AND seq > ? ORDER BY seq",
      [ticketId, snapSeq],
    );
    for (const row of eventRows) {
      const env = rowToEnvelope(row);
      if (FOLDING_TICKET_TYPES.includes(env.type)) state = applyTicketEvent(state, env, localDeps);
    }
    if (state === undefined) return;
    await upsertTicket(tx, state);
  }

  async function contestsFor(tx: SyncStorage, ticketId: string): Promise<LocalContest[]> {
    const rows = await tx.all('SELECT * FROM contests WHERE ticket_id = ? ORDER BY contested_at, contested_event_id', [
      ticketId,
    ]);
    return rows.map(rowToContest);
  }

  const replica: Replica = {
    async loadBootstrap(data) {
      await storage.transaction(async (tx) => {
        await tx.run("INSERT INTO meta (key, value) VALUES ('me', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
          JSON.stringify(data.me),
        ]);
        for (const def of data.definitions) {
          const dupe = await tx.all('SELECT 1 FROM events WHERE id = ?', [def.id]);
          if (dupe.length === 0) await insertEnvelope(tx, def);
          await applyDefinition(tx, def);
        }
        // Definitions first, then one deps read for the whole batch: the
        // reducer must be able to resolve ANY workflow id an event asks for
        // (`ticket.workflow_rebound` names one the ticket is not on yet), so a
        // deps object built before the definitions landed would throw on the
        // very event the migration exists for.
        const localDeps = await buildLocalDeps(tx);
        for (const ticket of data.tickets) {
          if (ticket.snapshot !== null) {
            await writeSnapshot(tx, ticket.ticketId, ticket.snapshot.seq, ticket.snapshot.state);
          }
          for (const env of ticket.events) {
            const dupe = await tx.all('SELECT 1 FROM events WHERE id = ?', [env.id]);
            if (dupe.length === 0) await insertEnvelope(tx, env);
            if (CONTEST_TYPES.includes(env.type)) await applyContest(tx, env);
          }
          await refoldTicket(tx, ticket.ticketId, localDeps);
        }
        await tx.run(
          'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [`cursor:${data.workspaceId}`, String(data.streamSeq)],
        );
      });
      notify();
    },

    async applyServerItem(item) {
      if (isSyncInstruction(item)) return applyInstruction(item);

      const env = item;
      const applied = await storage.transaction(async (tx) => {
        const dupe = await tx.all('SELECT 1 FROM events WHERE id = ?', [env.id]);
        if (dupe.length > 0) return false;
        await insertEnvelope(tx, env);

        if (env.entity.kind === 'workflow' || env.entity.kind === 'ticket-type') {
          const published = await applyDefinition(tx, env);
          // Storing the definition is not enough: the tickets standing in it
          // have to move, or this replica keeps categories the workflow has
          // stopped meaning.
          if (published !== null) await foldTicketsOntoVersion(tx, published);
        } else if (CONTEST_TYPES.includes(env.type)) {
          // Contests fold into their own table. They are history ABOUT a
          // ticket, never part of its state: a refused claim did not happen.
          await applyContest(tx, env);
        } else if (env.entity.kind === 'ticket' && FOLDING_TICKET_TYPES.includes(env.type)) {
          await refoldTicket(tx, env.entity.id, await buildLocalDeps(tx));
        }
        // A ticket-entity event the reducer does not fold (`visibility.set`)
        // reaches none of the branches above and is simply stored. That is the
        // point of the two membership tests rather than one `entity.kind`
        // test — see `refoldTicket`'s note on the ten-of-thirteen split.

        // An echo of our own claim confirms it: the outbox row is done.
        // NOTE: the outbox is Task 10's surface; this line exists so an echo
        // does not leave a queued row behind forever, and its semantics are
        // not exercised by Task 9's tests.
        await tx.run('DELETE FROM outbox WHERE event_id = ?', [env.id]);
        return true;
      });
      if (applied) notify();
      return { applied };
    },

    async purgeEntity(entityId) {
      const me = await replica.getMe();
      await storage.transaction(async (tx) => {
        await tx.run('DELETE FROM events WHERE entity_id = ?', [entityId]);
        await tx.run('DELETE FROM tickets WHERE ticket_id = ?', [entityId]);
        await tx.run('DELETE FROM snapshots WHERE entity_id = ?', [entityId]);
        // Contests OTHERS raised vanish with the ticket. The local user's OWN
        // contested claims survive as content-light stubs: their `originalEvent`
        // is what this user typed on this device, purging it would silently
        // vanish their claim (honesty invariant 5), and it leaks nothing they
        // did not author themselves.
        if (me === null) await tx.run('DELETE FROM contests WHERE ticket_id = ?', [entityId]);
        else await tx.run('DELETE FROM contests WHERE ticket_id = ? AND claimant_id <> ?', [entityId, me.userId]);
        // Outbox rows for the purged ticket STAY: they are the user's claims in
        // transit and must go up, contest, and surface — nothing silently vanishes.
      });
      notify();
    },

    async revokeScope(instruction) {
      // One instruction, one local delete by scope. Idempotent like a purge:
      // every statement is a delete, so a re-delivered instruction is a no-op.
      // The purge rules carry over unchanged — own contest stubs survive,
      // outbox rows stay.
      const me = await replica.getMe();
      await storage.transaction(async (tx) => {
        const rows = await tx.all('SELECT ticket_id, state FROM tickets WHERE workspace_id = ?', [
          instruction.workspaceId,
        ]);
        const goneIds = rows
          .filter(
            (row) =>
              instruction.projectId === undefined ||
              (JSON.parse(row.state as string) as TicketState).projectId === instruction.projectId,
          )
          .map((row) => row.ticket_id as string);
        for (const ticketId of goneIds) {
          await tx.run('DELETE FROM events WHERE entity_id = ?', [ticketId]);
          await tx.run('DELETE FROM tickets WHERE ticket_id = ?', [ticketId]);
          await tx.run('DELETE FROM snapshots WHERE entity_id = ?', [ticketId]);
          if (me === null) await tx.run('DELETE FROM contests WHERE ticket_id = ?', [ticketId]);
          else await tx.run('DELETE FROM contests WHERE ticket_id = ? AND claimant_id <> ?', [ticketId, me.userId]);
        }
        if (instruction.projectId === undefined) {
          // Losing the workspace loses its definitions and cursor too — a replica
          // for a workspace you are not in should hold nothing of it beyond your
          // own authored stubs.
          //
          // RECORDED, NOT FIXED: `workflows` and `ticket_types` carry no
          // `workspace_id` column, so these two deletes cannot be scoped and the
          // local store is implicitly SINGLE-WORKSPACE. Every other statement
          // here is workspace-scoped, which makes the asymmetry easy to miss.
          // *Owner: whoever widens `packages/sync-client/src/storage/schema.ts`
          // to hold more than one workspace (Task 8's surface).*
          await tx.run('DELETE FROM workflows', []);
          await tx.run('DELETE FROM ticket_types', []);
          await tx.run('DELETE FROM meta WHERE key = ?', [`cursor:${instruction.workspaceId}`]);
        }
      });
      notify();
    },

    async getTicket(ticketId) {
      const rows = await storage.all('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId]);
      if (rows.length === 0) return null;
      return {
        ticketId,
        confirmed: JSON.parse(rows[0]!.state as string) as TicketState,
        contests: await contestsFor(storage, ticketId),
      };
    },

    async listTickets(workspaceId) {
      const rows = await storage.all('SELECT ticket_id FROM tickets WHERE workspace_id = ? ORDER BY ticket_id', [
        workspaceId,
      ]);
      const out: ReplicaTicket[] = [];
      for (const row of rows) {
        const ticket = await replica.getTicket(row.ticket_id as string);
        if (ticket !== null) out.push(ticket);
      }
      return out;
    },

    async listContests(workspaceId, filter = {}) {
      const clauses = ['workspace_id = ?'];
      const params: Array<string | number> = [workspaceId];
      if (filter.ticketId !== undefined) {
        clauses.push('ticket_id = ?');
        params.push(filter.ticketId);
      }
      if (filter.claimantId !== undefined) {
        clauses.push('claimant_id = ?');
        params.push(filter.claimantId);
      }
      if (filter.open === true) clauses.push('resolved = 0');
      // Ordered by `contested_at` as TEXT. That is chronological order and not
      // merely alphabetical order because every value in the column is a
      // Z-normalised ISO instant the server wrote — see `rowToEnvelope`.
      const rows = await storage.all(
        `SELECT * FROM contests WHERE ${clauses.join(' AND ')} ORDER BY contested_at, contested_event_id`,
        params,
      );
      return rows.map(rowToContest);
    },

    async listEntityEvents(ticketId) {
      const rows = await storage.all("SELECT * FROM events WHERE entity_kind = 'ticket' AND entity_id = ? ORDER BY seq", [
        ticketId,
      ]);
      return rows.map(rowToEnvelope);
    },

    async searchLocal(workspaceId, text) {
      // Honest local search: titles and comment text, LIKE-matched. The UI labels
      // it "searching the offline copy" — it never pretends to be the server index.
      const needle = `%${text.toLowerCase()}%`;
      const hits = new Map<string, string>();
      const tickets = await storage.all('SELECT ticket_id, state FROM tickets WHERE workspace_id = ?', [workspaceId]);
      for (const row of tickets) {
        const title = titleOf(JSON.parse(row.state as string) as TicketState);
        if (title.toLowerCase().includes(text.toLowerCase())) hits.set(row.ticket_id as string, title);
      }
      const comments = await storage.all(
        "SELECT entity_id, payload FROM events WHERE workspace_id = ? AND type = 'comment.added' AND LOWER(payload) LIKE ?",
        [workspaceId, needle],
      );
      for (const row of comments) {
        const body = (JSON.parse(row.payload as string) as { body: unknown }).body;
        if (!docToPlainText(body).toLowerCase().includes(text.toLowerCase())) continue;
        if (hits.has(row.entity_id as string)) continue;
        const owning = await storage.all('SELECT state FROM tickets WHERE ticket_id = ?', [row.entity_id as string]);
        if (owning.length === 0) continue; // a comment on a ticket we no longer hold
        hits.set(row.entity_id as string, titleOf(JSON.parse(owning[0]!.state as string) as TicketState));
      }
      return [...hits.entries()].map(([ticketId, title]) => ({ ticketId, title }));
    },

    async getCursor(workspaceId) {
      const rows = await storage.all('SELECT value FROM meta WHERE key = ?', [`cursor:${workspaceId}`]);
      return rows.length === 0 ? 0 : Number(rows[0]!.value);
    },

    async setCursor(workspaceId, seq) {
      await storage.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
        `cursor:${workspaceId}`,
        String(seq),
      ]);
    },

    async getMe() {
      const rows = await storage.all("SELECT value FROM meta WHERE key = 'me'");
      return rows.length === 0 ? null : (JSON.parse(rows[0]!.value as string) as Me);
    },

    buildDeps: () => buildLocalDeps(storage),

    onChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };

  /**
   * The instruction half of `applyServerItem`, split out so the switch can be
   * the fail-closed guard the repo uses elsewhere (`audienceOf`,
   * `canSeeResolved`).
   *
   * NO `default` and NO trailing return. A fourth `SyncItem` instruction member
   * falls out of this switch, the function ends without returning, and tsc
   * refuses it with TS2366 — so growing the wire union is a COMPILE error here
   * rather than an instruction this replica silently ignores. A `default` arm,
   * or the plan's `item as EventEnvelope` cast, would have swallowed exactly
   * that, which is how `scope-revoked` went missing from the plan's own
   * interface list in the first place.
   */
  async function applyInstruction(instruction: SyncInstruction): Promise<{ applied: boolean }> {
    switch (instruction.kind) {
      case 'purge':
        await replica.purgeEntity(instruction.entityId);
        return { applied: true };
      case 'scope-revoked':
        await replica.revokeScope(instruction);
        return { applied: true };
    }
  }

  return replica;
}

/**
 * A ticket's title as the reducer stores it: a FIELD CLAIM under
 * `fields.title`, not a top-level property (`applyTicketEvent`'s
 * `ticket.created` arm writes `fields: { title: claim(p.title, env) }`).
 * Read, not guessed — the plan told this task to check.
 */
function titleOf(state: TicketState): string {
  return String(state.fields['title']?.value ?? '');
}
