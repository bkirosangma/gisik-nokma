import {
  applyNoteEvent,
  applyTicketEvent,
  claimContestedPayloadSchema,
  claimContestedResolvedPayloadSchema,
  CONTEST_EVENT_TYPES,
  collectDocReferences,
  docToPlainText,
  foldTicketToWorkflowVersion,
  NOTE_EVENT_TYPES,
  TICKET_EVENT_TYPES,
  ticketTypeDefSchema,
  workflowDefinedPayloadSchema,
  type EventEnvelope,
  type LedgerEvent,
  type NoteState,
  type PurgedRef,
  type PublishedWorkflowDef,
  type ReachGrantedTicket,
  type SubmittedEvent,
  type TicketState,
  type TicketStateDeps,
  type WorkspaceRole,
} from '@gisik-nokma/domain';
import { dropOutboxRowsAsNotices } from '../outbox/notices.js';
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
/**
 * One recorded claim: who, and BOTH clocks. Declared here rather than imported
 * from the server, which shares no type with this package by design.
 *
 * `serverTime` is the point of the whole block. A snapshot-bounded replica has
 * no `ticket.created` / `ticket.transitioned` below its seq to read one from,
 * and `TicketState.transitions` carries `actorId` and `seq` and no clock at all.
 */
export type SnapshotClaim = { actorId: string; clientTime: string; serverTime: string };

/**
 * The two claims a `TicketState` cannot carry: the state claim and, when there
 * is one, the assignment claim. Every FIELD claim already travels inside the
 * state as a `FieldClaim` with its own clocks, which is why due dates need
 * nothing here — the control that shows this is a real distinction rather than
 * an arbitrary pair.
 *
 * `assigned: null` is a fact (nobody is assigned), not an absence.
 */
export type SnapshotProvenanceBlock = { state: SnapshotClaim; assigned: SnapshotClaim | null };

export type BootstrapTicket = {
  ticketId: string;
  /** `null` means `events` is the ticket's full history — no snapshot exists yet. */
  snapshot: { seq: number; state: TicketState; provenance?: SnapshotProvenanceBlock | null } | null;
  events: LedgerEvent[];
};
export type BootstrapResponse = {
  workspaceId: string;
  me: Me;
  streamSeq: number;
  /** Every `workflow.defined` / `ticket-type.defined`, ascending `workspaceSeq`. */
  definitions: LedgerEvent[];
  tickets: BootstrapTicket[];
  /**
   * Every readable note's whole ledger (Plan 2 of 6, spec §5.1). OPTIONAL
   * because the server's own type declares it optional — a required field
   * forces every constructor to change — and the server always sends it.
   *
   * `LedgerEventView`, the ROW dialect, because that is what the note pull
   * route serves too: a device folds a note the same way whether it arrived in
   * the bootstrap or from a `reach-granted` pull, and one conversion
   * (`viewToEnvelope`) covers both.
   */
  notes?: { events: LedgerEventView[] };
};

/**
 * ONE ticket's replica-build payload — the per-ticket bootstrap door's request
 * body, and the thing `Replica.loadTicketBootstrap` applies.
 *
 * It is `BootstrapResponse` with everything workspace-wide removed except the
 * definitions, and the removals are the design:
 *
 * - **No `streamSeq`, and no cursor is written.** That is the whole reason this
 *   type exists separately. See `loadTicketBootstrap`.
 * - **No `me`.** A device pulling one ticket learns nothing new about its own
 *   role, and re-writing `me` from a per-ticket response would let a stale
 *   answer overwrite a fresher one for no benefit.
 * - **`definitions` STAYS, and it is not optional.** A ticket arriving through
 *   this door can sit on a workflow version this device has never seen — the
 *   push path is safe only because definitions are class `'definition'` and
 *   stream unconditionally in `workspaceSeq` order ahead of anything that
 *   depends on them, and a separate HTTP pull has no such ordering. Handed an
 *   empty list, `foldSnapshotForward` SILENTLY no-ops and the failure surfaces
 *   one step later as `applyTicketEvent: workflow "…" vanished — replay
 *   integrity is broken`. The server sends the full VERSION CHAIN of every
 *   workflow the ticket references, not merely the latest, because
 *   `foldTicketToWorkflowVersion` walks versions one at a time and a gap throws
 *   *version chain has a hole*.
 */
export type TicketBootstrap = {
  workspaceId: string;
  /**
   * Every version of every workflow / ticket-type the ticket below references,
   * ascending `workspaceSeq` — the same order `buildLedgerDeps` folds them in.
   */
  definitions: LedgerEvent[];
  ticket: BootstrapTicket;
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

/**
 * One comment filed against a note, as the replica holds it.
 *
 * `workspaceSeq` rides beside the server's public `NoteComment` (which omits
 * it) because the ORDER lives in this column and a local read that dropped it
 * would have to re-sort by something else — `recordedAt` is a string column
 * whose comparison happens to work, and depending on that here would be a
 * second spelling of "when this happened".
 */
/**
 * Which pending set a workspace's owed ids live in (Plan 2 of 6).
 *
 * **TWO KEYS, not one key with a discriminated entry, and the reason is a
 * migration rather than a taste.** `parsePendingPulls` filters on SHAPE — an
 * entry missing `id` or `headSeq` is dropped — so a stored ticket entry whose
 * shape changed (gaining a required `kind`) would fail that filter on an
 * existing device, and every in-flight pending ticket pull would be discarded
 * SILENTLY on the first run after an upgrade. Two keys leave the ticket entries
 * byte-identical to what they always were, and a note set simply starts empty.
 *
 * The ticket key is unchanged, deliberately; do not "tidy" the two spellings
 * into one.
 */
export type PendingPullKind = 'ticket' | 'note';

/**
 * One ledger row as the READ routes serve it — the shape
 * `GET /v1/notes/:noteId/events` and the bootstrap's `notes` section both send
 * (the server's `LedgerEventView`). Declared here rather than in
 * `net/http-transport.ts` because it is not a transport detail: the bootstrap
 * payload carries these too, so `loadBootstrap` converts them as well.
 *
 * `viewToEnvelope` is the conversion, and it is TOTAL: both clocks already
 * arrive as the server's own ISO 'Z' strings, so they are carried through
 * untouched. `rowToEnvelope` above is the same function over local columns.
 */
export type LedgerEventView = {
  id: string;
  workspace_id: string;
  entity_kind: string;
  entity_id: string;
  type: string;
  version: number;
  payload: unknown;
  actor_id: string;
  origin: string;
  client_time: string;
  server_time: string;
  seq: number;
  workspace_seq: number;
};

export function viewToEnvelope(row: LedgerEventView): LedgerEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    entity: { kind: row.entity_kind as EventEnvelope['entity']['kind'], id: row.entity_id },
    type: row.type,
    version: row.version,
    payload: row.payload,
    actorId: row.actor_id,
    origin: row.origin as EventEnvelope['origin'],
    clientTime: row.client_time,
    serverTime: row.server_time,
    seq: row.seq,
    workspaceSeq: row.workspace_seq,
  };
}

export type LocalNoteComment = {
  commentId: string;
  authorId: string;
  body: unknown;
  recordedAt: string;
  workspaceSeq: number;
};

export type Replica = {
  loadBootstrap(data: BootstrapResponse): Promise<void>;
  /**
   * Apply ONE ticket pulled through the per-ticket bootstrap door, WITHOUT
   * touching the workspace cursor. Ruling P37.1 / closure 5b(d).
   */
  loadTicketBootstrap(data: TicketBootstrap): Promise<void>;
  /**
   * Entities this device has been told it may now read but has not pulled yet.
   *
   * `kind` selects WHICH pending set — `'ticket'` by default, `'note'` for the
   * notes a `reach-granted` notice named (Plan 2 of 6). The two sets are
   * separate durable keys rather than one discriminated list, and
   * `pendingPullsKey` carries the reason: a stored ticket entry whose SHAPE
   * changed would be dropped by `parsePendingPulls`'s filter on an existing
   * device, silently discarding every in-flight pull on the first run after an
   * upgrade.
   */
  listPendingPulls(workspaceId: string, kind?: PendingPullKind): Promise<ReachGrantedTicket[]>;
  /**
   * Record entities as owed. Idempotent; a re-record for the same id UPDATES its
   * `headSeq`, because a later notice supersedes an earlier one — which is what
   * makes `dropPendingPullIfUnchanged` able to tell a stale 404 from a fresh
   * grant (ruling P37.3).
   */
  addPendingPulls(
    workspaceId: string,
    entities: readonly ReachGrantedTicket[],
    kind?: PendingPullKind,
  ): Promise<void>;
  /** Forget one owed entity — called only after its pull has actually landed. */
  clearPendingPull(workspaceId: string, entityId: string, kind?: PendingPullKind): Promise<void>;
  /**
   * Forget one owed ticket ONLY IF no newer notice has re-named it since —
   * ruling P37.3, and the whole of what makes dropping on a 404 safe.
   *
   * The device cannot tell "may not see" from "never existed": the route answers
   * both with 404, deliberately, so that presence-versus-absence is not an
   * oracle. So the drop is keyed to the NOTICE rather than to the status code.
   * Every re-widening emits a fresh notice naming the id with a higher
   * `headSeq`, so a notice arriving between a pull's issue and its 404 has
   * already replaced the recorded value — the entry stays and the next catch-up
   * fetches it. A 404 is never the last word; the next notice is.
   */
  dropPendingPullIfUnchanged(
    workspaceId: string,
    entityId: string,
    headSeq: number,
    kind?: PendingPullKind,
  ): Promise<void>;
  /** `{ applied: false }` means a duplicate event id was ignored — delivery is at-least-once. */
  applyServerItem(item: SyncItem): Promise<{ applied: boolean }>;
  purgeEntity(entityId: string): Promise<void>;
  revokeScope(instruction: ScopeRevokedInstruction): Promise<void>;
  /**
   * PERMANENT ERASURE (trash series Plan 3, D2) — NOT `purgeEntity`. Deletes
   * everything this device holds of the named items and their LOCAL subtree
   * (a ticket's children by `parent_id`; a project's tickets and homed notes; a
   * workspace's every row), the device's own contest stubs included; turns
   * each queued claim about them into a `sync_notices` row; records every
   * erased id in `purged_ids`; strips them from the Deleted-items cache.
   * Answers what was recorded, subtree included.
   */
  eraseEntities(refs: readonly PurgedRef[]): Promise<{ erased: PurgedRef[] }>;
  /** Of `ids`, those `eraseEntities` recorded — the chips' predicate on a replica. */
  purgedAmong(ids: readonly string[]): Promise<PurgedRef[]>;
  /**
   * Every id this device could hold something of in `workspaceId`, for the
   * purged-id lookup (D5): the workspace, held tickets and notes, contest and
   * outbox targets (a `purgeEntity`d ticket's own stub and queued claims
   * survive it), and every chip id inside a held body. Ids already recorded
   * are left out.
   */
  purgeLookupCandidates(workspaceId: string): Promise<string[]>;
  /** The last online `GET /v1/me/deleted-items` body (D9), as served. */
  cacheDeletedItems(body: unknown, fetchedAt: string): Promise<void>;
  readDeletedItemsCache(): Promise<{ body: unknown; fetchedAt: string } | null>;
  /**
   * The note reads (notes series, Plan 2 of 6, spec §5.3). Seven of them, and
   * `searchNotes` is NOT among them — local note search is Plan 3's, and
   * `ReplicaGapError` is how its absence is spelled rather than an empty array.
   */
  getNote(noteId: string): Promise<NoteState | null>;
  /** Non-deleted notes in the workspace, most recently updated first. */
  listNotes(workspaceId: string): Promise<NoteState[]>;
  /** The deleted ones — the local half of the undo list. */
  listDeletedNotes(workspaceId: string): Promise<NoteState[]>;
  /**
   * Every note id this replica holds, deleted ones included — what the next
   * `reconcile` presents as `heldNoteIds`. NOT `listNotes`, and the difference
   * is the whole point: a device must offer up the ids it holds, and it still
   * holds the deleted ones.
   */
  listNoteIds(workspaceId: string): Promise<string[]>;
  listNotesForTicket(workspaceId: string, ticketId: string): Promise<NoteState[]>;
  listNoteComments(noteId: string): Promise<LocalNoteComment[]>;
  /**
   * Store a note's history and fold it. The pull-shaped half of spec §5.1: a
   * `reach-granted` notice named a note, `GET /v1/notes/:id/events` answered,
   * and this is where the answer lands.
   *
   * IDEMPOTENT, because delivery is at-least-once: the same events loaded twice
   * leave one row per event and the same note row. A device cut off mid-pull
   * re-fetches the whole history, and that must not be an error.
   */
  loadNoteEvents(events: readonly LedgerEvent[]): Promise<void>;
  getTicket(ticketId: string): Promise<ReplicaTicket | null>;
  listTickets(workspaceId: string): Promise<ReplicaTicket[]>;
  listContests(
    workspaceId: string,
    filter?: { ticketId?: string; claimantId?: string; open?: boolean },
  ): Promise<LocalContest[]>;
  /**
   * Local history view, per-entity `seq` order. `kind` defaults to `'ticket'`,
   * which is what every caller before the notes series meant.
   */
  listEntityEvents(entityId: string, kind?: 'ticket' | 'note'): Promise<LedgerEvent[]>;
  /**
   * The provenance a BOOTSTRAP delivered for this ticket, or `null` when none
   * has — a device that has never bootstrapped it, or a server snapshot written
   * before ruling P36 added the column.
   *
   * This exists because `listEntityEvents` cannot answer the question on a
   * snapshot-bounded device: the creating and transitioning events are below the
   * snapshot's seq and were never shipped. It is the ONLY way to name who put a
   * ticket in its state, and when, without them.
   */
  getSnapshotProvenance(ticketId: string): Promise<SnapshotProvenanceBlock | null>;
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
   * The same row as `insertEnvelope`, but tolerant of one already being there.
   *
   * **`insertEnvelope` is NOT changed to `OR IGNORE` and the two must not be
   * merged.** The stream arm's dedupe is a deliberate pre-read plus a
   * `{ applied: false }` return, because a caller has to be told whether the
   * frame it just handed over was new — that is what makes delivery
   * at-least-once safe to reason about. A pull has no such answer to give: it
   * re-fetches a whole history by design and every event in it may already be
   * held, so "ignore if present" is the whole contract and there is nothing to
   * report.
   */
  async function insertEnvelopeIfAbsent(tx: SyncStorage, env: LedgerEvent): Promise<void> {
    await tx.run(
      `INSERT OR IGNORE INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq, workspace_seq)
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

  async function writeSnapshot(
    tx: SyncStorage,
    ticketId: string,
    seq: number,
    state: TicketState,
    provenance: SnapshotProvenanceBlock | null = null,
  ): Promise<void> {
    await tx.run(
      `INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ('ticket', ?, ?, ?)
       ON CONFLICT(entity_kind, entity_id) DO UPDATE SET seq = excluded.seq, state = excluded.state`,
      [ticketId, seq, JSON.stringify(state)],
    );
    // NOT deleted when the block is absent. A local re-snapshot with no
    // provenance to write — a server row predating ruling P36's column, or a
    // fold this client performed itself — must not erase a block an earlier
    // bootstrap DID deliver: absent means "nothing new to say", not "forget
    // what you knew". This mirrors the server writer's carry-forward, where the
    // same omission would have nulled a good block on every workflow publish.
    if (provenance === null) return;
    await tx.run(
      `INSERT INTO snapshot_provenance (entity_kind, entity_id, state_claim, assigned_claim)
         VALUES ('ticket', ?, ?, ?)
       ON CONFLICT(entity_kind, entity_id)
         DO UPDATE SET state_claim = excluded.state_claim, assigned_claim = excluded.assigned_claim`,
      [
        ticketId,
        JSON.stringify(provenance.state),
        provenance.assigned === null ? null : JSON.stringify(provenance.assigned),
      ],
    );
  }

  /** The block a bootstrap delivered for this ticket, or `null` if none has. */
  async function readSnapshotProvenance(
    tx: SyncStorage,
    ticketId: string,
  ): Promise<SnapshotProvenanceBlock | null> {
    const rows = await tx.all(
      `SELECT state_claim, assigned_claim FROM snapshot_provenance
       WHERE entity_kind = 'ticket' AND entity_id = ?`,
      [ticketId],
    );
    const row = rows[0];
    if (row === undefined) return null;
    const stateClaim = row['state_claim'];
    if (typeof stateClaim !== 'string') return null;
    const assignedClaim = row['assigned_claim'];
    return {
      state: JSON.parse(stateClaim) as SnapshotClaim,
      // `null` here is the RECORDED fact that nobody is assigned, which the
      // server derived from `state.assigneeId` rather than from a missing
      // event. A non-string that is not null would be a corrupt row; it reads
      // as no assignment rather than throwing, matching how this file treats
      // every other unreadable local value — the ticket is still usable and the
      // claim is simply not shown.
      assigned: typeof assignedClaim === 'string' ? (JSON.parse(assignedClaim) as SnapshotClaim) : null,
    };
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
      //
      // WHEN THIS GUARD STOPS BEING INERT, stated so the next reader does not
      // have to re-derive it. Today the intersection of `BOOTSTRAP_BACKFILL_TYPES`
      // and `TICKET_EVENT_TYPES` is exactly {`comment.added`, `attachment.added`},
      // and both of those `return state` unchanged — so a lowered baseline replays
      // only no-ops and the damage is not observable through this module's public
      // surface. It becomes observable the moment a backfilled type MUTATES state.
      // 12.131 therefore asserts the stored `seq` directly rather than a folded
      // value: a behavioural assertion here would be a check that cannot fail.
      const seqRows = await tx.all(
        "SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE entity_kind = 'ticket' AND entity_id = ?",
        [next.id],
      );
      const baseline = Math.max(Number(seqRows[0]?.seq ?? 0), await snapshotSeqOf(tx, next.id));
      await writeSnapshot(tx, next.id, baseline, next);
    }
  }

  /**
   * The bootstrap door's half of refresh-on-publish, and it is a SEPARATE
   * function from `foldTicketsOntoVersion` for one reason: that one walks the
   * `tickets` TABLE, and a bootstrapped ticket has no row in it yet. Its state
   * arrives as a snapshot, is folded here, and only then is replayed forward by
   * `refoldTicket`.
   *
   * WHY THIS EXISTS AT ALL. It was missing, and the absence was invisible from
   * the stream door's tests: `loadBootstrap` stored every `workflow.defined` in
   * `definitions` through `applyDefinition` and never folded, so a bootstrap
   * carrying v1 AND v2 alongside a snapshot still recorded at
   * `workflowVersion: 1` left the ticket at v1's category forever. Measured
   * before the fix: the bootstrap door answered `{v:1, cat:'active'}` where the
   * identical publish through `applyServerItem` answers `{v:2, cat:'open'}` —
   * and worse, a v2 that DROPPED the snapshot's state left the ticket standing
   * in a state the workflow no longer has. Nothing heals it: the two backfilled
   * types the reducer folds (`comment.added`, `attachment.added`) both return
   * state unchanged.
   *
   * ORDER MATTERS: fold the snapshot BEFORE replaying the tail, never after.
   * The tail is replayed against `localDeps`, which answers at the LATEST
   * version, so a tail folded onto a stale baseline would be reducing new
   * vocabulary onto old state. Same rule the stream door states as "the
   * snapshot is the load-bearing half".
   *
   * The baseline `seq` is carried across UNCHANGED — `writeSnapshot` is called
   * with `snapshot.seq`, not with a recomputed maximum. `foldTicketsOntoVersion`
   * raises the baseline because it folds a ticket whose whole local history is
   * already behind it; here the tail above `snapshot.seq` has NOT been applied
   * yet and raising the baseline would skip it.
   *
   * "Unchanged" means UNCHANGED RELATIVE TO THE RESPONSE, not relative to the
   * baseline already standing locally, and the difference is worth naming
   * because the sentence above invites the question. RECORDED, NOT FIXED, AND
   * LIVE: `writeSnapshot`'s `ON CONFLICT … DO UPDATE SET seq = excluded.seq` is
   * unconditional and this door applies no `Math.max` against the standing
   * baseline, so a replica whose stream-door fold had raised its baseline to
   * `MAX(events.seq) = 6`, re-bootstrapping against a server snapshot at seq 5,
   * LOWERS it to 5 and replays event 6 — pre-fold history against new
   * vocabulary, exactly what 12.131 exists to prevent on the other door.
   * **Case 12.154 (`test/recorded-hazards.test.ts`) walks that sequence and
   * ends in `applyTicketEvent: workflow "…" has no state "doing"`, thrown out
   * of `loadBootstrap` with the whole response rolled back. So the failure is
   * not "one ticket is wrong": every re-bootstrap throws identically for as
   * long as the server keeps serving that snapshot and the offending event
   * stays stored locally, and nothing on either side clears either.**
   *
   * THIS PARAGRAPH USED TO END *"and is unreachable today, because nothing
   * calls `loadBootstrap` a second time"*, and that was FALSE IN THE COMMIT
   * THAT WROTE IT. Case 12.149 (`test/outbox.test.ts`) calls `loadBootstrap` a
   * second time on an already-bootstrapped replica, and its own docblock calls
   * the sequence "a live sequence, not a contrivance". The sentence is gone
   * rather than softened: a hazard defended by a claim about the whole tree is
   * re-derived by nothing, which is why the record now points at a case.
   *
   * IT IS ALSO NOT THE HAZARD THE PARAGRAPH BELOW RECORDS. That one needs the
   * throwing `ticket.transitioned` in the RESPONSE's tail (`ticket.events`) and
   * is Task 6's, because only a server-written snapshot above the event repairs
   * it. Here both bootstraps carry `events: []`; the throwing row is a LOCALLY
   * STORED event the stream-door fold had already moved past, and only the
   * baseline drop puts it back in front of the reducer.
   *
   * AND THE OBVIOUS GUARD IS WORSE THAN THE THROW — measured, not reasoned.
   * Wrapping the `seq` above in `Math.max(ticket.snapshot.seq,
   * await snapshotSeqOf(tx, ticket.ticketId))` — the guard
   * `foldTicketsOntoVersion` applies on the stream door — removes the throw and
   * leaves all nineteen cases in `test/replica.test.ts` green — twenty
   * executions, because 12.132 runs twice — because it writes
   * the SERVER's seq-5 state under the LOCAL seq-6 baseline: `refoldTicket`
   * then replays nothing above 6, and the seq-6 transition vanishes from the
   * log while its row still stands in `events`. Under the guard `transitions`
   * came back with the seq-5 entry alone where the stream fold had left both.
   * That trades a loud throw for a quiet divergence in the log
   * `require-different-user` sorts on. The consistent repair is the other
   * shape — keep the higher local baseline, write no older snapshot at all, and
   * fold the LOCAL state forward — which is a decision about what a
   * re-bootstrap MEANS. *Owner: Plan 10 Task 11 (the sync engine), the first
   * PRODUCTION caller that will re-bootstrap a live replica; 12.149 already
   * re-bootstraps one in a test.*
   *
   * **ANSWERED BY TASK 11, AND NOT BY CHANGING THIS LINE.** The engine's
   * `needsBootstrap` (`engine/sync-engine.ts`) refuses to call this door at all
   * on a replica that holds a local baseline, so the only production path to
   * the drop is closed — pinned by case 12.165, with the mutation that reopens
   * it. THE HAZARD ITSELF STANDS: the `ON CONFLICT` below is still
   * unconditional, and any future caller that re-bootstraps by another route
   * still meets it. The rejected `Math.max` guard was deliberately NOT
   * re-applied.
   *
   * A HOLE IN THE VERSION CHAIN NOW FAILS THE WHOLE BOOTSTRAP, and that is a
   * decision rather than a discovery. `foldTicketToWorkflowVersion` refuses a
   * chain it cannot walk, this call is inside `loadBootstrap`'s transaction, so
   * the entire response rolls back instead of one arrival (which is what the
   * stream door does, case 12.125). It is the right shape here: bootstrap is
   * specified to ship EVERY `workflow.defined`, so a hole means the response
   * itself was incomplete, and half-loading a replica out of an incomplete
   * response is the failure that would be discovered days later on a board that
   * disagrees with the server.
   *
   * THE PRE-EXISTING HAZARD THIS FOLD DOES NOT REMOVE — now CLOSED on the
   * server, and the paragraph is kept rather than deleted because it is the
   * argument for where the fix had to live.
   *
   * A bootstrap tail can contain a `ticket.transitioned` INTO a state the new
   * version dropped. That event is history, written in the old vocabulary,
   * above the snapshot, and `applyTicketEvent` throws on it
   * (`workflow "…" has no state "doing"`) whether or not the snapshot was
   * folded first — measured on this branch before and after this change. No
   * client-side fold can repair it, because the fix is a snapshot ABOVE the
   * offending event: the server has to re-snapshot the tickets it folds when a
   * workflow is published. It now does — `apps/server/src/sync/snapshot-refresh.ts`,
   * wired into the ingest transaction, server test cases 12.189–12.191. What it
   * does not reach is a tail that already spanned an older state-dropping
   * publish before that shipped; such a ticket is skipped there and still
   * arrives here able to throw.
   *
   * THIS FOLD STAYS REGARDLESS. It is the only fold on the BOOTSTRAP door, the
   * server's repair is a different door, and a snapshot can still arrive at an
   * older version than the definitions beside it — a skipped ticket, or any
   * server that has not deployed the refresh.
   */
  async function foldSnapshotForward(
    tx: SyncStorage,
    state: TicketState,
    latest: PublishedWorkflowDef | undefined,
  ): Promise<TicketState> {
    if (latest === undefined || state.workflowVersion >= latest.version) return state;
    return foldTicketToWorkflowVersion(state, latest, await workflowVersionsOf(tx, latest.id));
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
   *
   * ## A TYPE THIS DOES FOLD CAN STILL THROW, AND HERE THAT IS DELIBERATE
   *
   * Stated because the OTHER door that folds this reducer wraps it and this one
   * does not, and an unstated difference between two doors reads as an
   * oversight. `buildPendingOverlay` (`precheck/local-context.ts`) wraps its
   * `applyTicketEvent` in `try`/`catch`, for a reason that applies here word for
   * word: `revokeScope` empties `workflows` and `ticket_types` while outbox
   * rows deliberately stay, so a replica reaches "unknown ticket type" honestly
   * rather than through broken integrity. Same reducer, same `buildLocalDeps`
   * object, no catch on this side — and case 12.155
   * (`test/recorded-hazards.test.ts`) measures both halves of the throw: a
   * project-scoped revocation followed by an in-flight `ticket.transitioned`
   * gives `… for ticket … that was never created`, and a workspace-wide one
   * followed by an in-flight `ticket.created` gives `unknown ticket type "…"`.
   *
   * THE DIFFERENCE IS INTENDED, and the two doors answer different questions.
   * `enqueue` is a USER's offline action and must not brick the device, so an
   * unfoldable claim is named `unfoldable` and stays queued and flushable.
   * `applyServerItem` is machine-driven and its stated contract is per-arrival
   * rollback (12.125): an arrival this replica cannot fold is refused whole
   * rather than half-applied — and the rollback takes the envelope insert with
   * it, so the item is absent from the local ledger too. Catching here would
   * mean inventing what an unfoldable CONFIRMED ticket is and where it
   * surfaces. *RECORDED, NOT FIXED HERE. Owner: Plan 10 Task 11 (the sync
   * engine), the first caller of `applyServerItem` with a cursor to advance — a
   * cursor left unadvanced on a throw is handed the same item again, which is a
   * wedged stream, offline, after a revocation.*
   *
   * *ANSWERED AT THE ENGINE, NOT HERE: `createSyncEngine` STALLS on a throw
   * from this door — stream closed, no reconnect, cursor frozen, the reducer's
   * own message kept in `lastApplyFailure()`. The asymmetry with
   * `buildPendingOverlay` therefore stands on purpose and both sides now say
   * so. Cases 12.163 and 12.164.*
   */
  /**
 * The `meta` key one workspace's owed ticket ids live under.
 *
 * Namespaced by workspace exactly as `cursor:` is: one storage file can hold
 * more than one workspace, and a device removed from one of them must not have
 * the other's owed ids deleted with it. `revokeScope` clears this key for the
 * workspace it names, for that reason.
 */
/**
 * This device's highest `workspaceSeq` for one ticket, or 0 when it holds none.
 *
 * ZERO for an unheld ticket is what makes the notice's comparison degrade to
 * the old holdings test in the case where the old test was right: a ticket the
 * device has never seen has local head 0, which is below any real `headSeq`,
 * so it is pulled. The new rule is a strict widening of the old one.
 *
 * Reads `events` rather than the `tickets` row, because a ticket held only as
 * unfolded events still has a real position — and because the snapshot row's
 * `seq` is a per-entity counter, not the workspace one the notice speaks in.
 */
async function localHeadSeq(
  tx: SyncStorage,
  entityId: string,
  entityKind: 'ticket' | 'note' = 'ticket',
): Promise<number> {
  const rows = await tx.all(
    'SELECT MAX(workspace_seq) AS head FROM events WHERE entity_kind = ? AND entity_id = ?',
    [entityKind, entityId],
  );
  const head = rows[0]?.['head'];
  return typeof head === 'number' ? head : Number(head ?? 0);
}

function pendingPullsKey(workspaceId: string, kind: PendingPullKind = 'ticket'): string {
  return kind === 'note' ? `pending-note-pulls:${workspaceId}` : `pending-pulls:${workspaceId}`;
}

/**
 * A stored pending-pull value → the ids.
 *
 * Fail-SOFT rather than fail-closed, and the asymmetry is deliberate: a
 * corrupt or absent value yields the empty set, so a device that cannot read
 * what it was owed is a device that has not been told, which is the state it
 * was in before any notice arrived. Throwing here would reach `applyOne`, and
 * `applyOne`'s rejection is the terminal stall this whole set exists to avoid —
 * a parse failure would then brick a client over a value nothing but this file
 * writes.
 */
function parsePendingPulls(value: unknown): ReachGrantedTicket[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is ReachGrantedTicket =>
        typeof t === 'object' &&
        t !== null &&
        typeof (t as { id?: unknown }).id === 'string' &&
        Number.isInteger((t as { headSeq?: unknown }).headSeq),
    );
  } catch {
    return [];
  }
}

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

  /**
   * Write one note head row from the reducer's state, whole-row.
   *
   * `ON CONFLICT ... DO UPDATE` on every column rather than a partial write:
   * the reducer's state IS the row, and a partial update is how a column
   * survives a transition that should have cleared it — `scope_before_inherit`
   * is the one that visibly does (a `note.scope_set` off `inherit` nulls it).
   */
  async function upsertNote(tx: SyncStorage, state: NoteState): Promise<void> {
    await tx.run(
      `INSERT INTO notes (note_id, workspace_id, home_project_id, author_id, title, body,
                          scope, scope_before_inherit, attached_ticket_ids, deleted,
                          created_at, updated_at, last_body_event_id, seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(note_id) DO UPDATE SET
         workspace_id = excluded.workspace_id, home_project_id = excluded.home_project_id,
         author_id = excluded.author_id, title = excluded.title, body = excluded.body,
         scope = excluded.scope, scope_before_inherit = excluded.scope_before_inherit,
         attached_ticket_ids = excluded.attached_ticket_ids, deleted = excluded.deleted,
         created_at = excluded.created_at, updated_at = excluded.updated_at,
         last_body_event_id = excluded.last_body_event_id, seq = excluded.seq`,
      [
        state.noteId,
        state.workspaceId,
        state.homeProjectId,
        state.authorId,
        state.title,
        JSON.stringify(state.body),
        JSON.stringify(state.scope),
        state.scopeBeforeInherit === null ? null : JSON.stringify(state.scopeBeforeInherit),
        JSON.stringify(state.attachedTicketIds),
        state.deleted ? 1 : 0,
        state.createdAt,
        state.updatedAt,
        state.lastBodyEventId,
        state.seq,
      ],
    );
  }

  /**
   * Replay a note's whole local history through the SHARED reducer and write
   * the result. Server and device fold with one function, which is the same
   * arrangement `refoldTicket` has and for the same reason.
   *
   * ## Why it replays from the ledger rather than folding forward
   *
   * `refoldTicket` reads a snapshot and folds the tail, because tickets HAVE
   * snapshots. Notes have none (spec §5.3 — a note's history is short and the
   * ledger already holds it), so there is nothing to start from and the whole
   * stream is cheap. That also makes the fold IDEMPOTENT for free: replaying
   * everything yields the same row however many times it runs, which is what
   * makes `loadNoteEvents` safe to call on a device that was cut off mid-pull.
   *
   * ## `comment.added` is skipped on the way IN, not on the way OUT
   *
   * The caller dispatches a comment to `applyNoteComment` and never reaches
   * this function for one — but a comment already stored IS replayed here when
   * a later note event refolds, and `applyNoteEvent` folds it to no change
   * except `seq`/`updatedAt`. That is why the head row's `seq` can advance past
   * a comment without the comment having moved any state: the reducer says so,
   * and `proj_notes` on the server behaves identically because it runs the same
   * function over the same stream.
   */
  async function refoldNote(tx: SyncStorage, noteId: string): Promise<void> {
    const eventRows = await tx.all(
      "SELECT * FROM events WHERE entity_kind = 'note' AND entity_id = ? ORDER BY seq",
      [noteId],
    );
    let state: NoteState | null = null;
    for (const row of eventRows) {
      const env = rowToEnvelope(row);
      if ((NOTE_EVENT_TYPES as readonly string[]).includes(env.type)) state = applyNoteEvent(state, env);
    }
    if (state === null) return;
    await upsertNote(tx, state);
  }

  /** One `comment.added` filed against a note. `comment_id` IS the event id. */
  async function applyNoteComment(tx: SyncStorage, env: LedgerEvent): Promise<void> {
    await tx.run(
      `INSERT INTO note_comments (comment_id, workspace_id, note_id, author_id, body, recorded_at, workspace_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(comment_id) DO UPDATE SET
         body = excluded.body, recorded_at = excluded.recorded_at, workspace_seq = excluded.workspace_seq`,
      [
        env.id,
        env.workspaceId,
        env.entity.id,
        env.actorId,
        JSON.stringify((env.payload as { body?: unknown }).body ?? null),
        env.serverTime,
        env.workspaceSeq,
      ],
    );
  }

  /**
   * `loadNoteEvents`'s body, split out so `loadBootstrap` can run it INSIDE the
   * transaction that also writes the cursor — a bootstrap whose cursor landed
   * and whose notes did not would be a device that believes it holds a
   * workspace it has no notes from.
   *
   * IDEMPOTENT by construction: `INSERT OR IGNORE` on the events (keyed by
   * event id) and a full replay per touched note. Delivery is at-least-once,
   * and a device cut off mid-pull re-fetches the whole history.
   */
  async function loadNoteEventsIn(tx: SyncStorage, events: readonly LedgerEvent[]): Promise<void> {
    const touched = new Set<string>();
    for (const env of events) {
      await insertEnvelopeIfAbsent(tx, env);
      if (env.entity.kind !== 'note') continue;
      if (env.type === 'comment.added') await applyNoteComment(tx, env);
      else touched.add(env.entity.id);
    }
    // One refold per note, AFTER the whole batch is stored — not one per event.
    // A refold replays that note's entire history, so doing it inside the loop
    // would replay it once per event, which for a three-save note is nine
    // passes over the same rows for one answer.
    for (const noteId of touched) await refoldNote(tx, noteId);
  }

  function rowToNote(row: SqlRow): NoteState {
    const pre = row.scope_before_inherit;
    return {
      noteId: row.note_id as string,
      workspaceId: row.workspace_id as string,
      homeProjectId: row.home_project_id as string,
      authorId: row.author_id as string,
      title: row.title as string,
      body: JSON.parse(row.body as string) as unknown,
      scope: JSON.parse(row.scope as string) as NoteState['scope'],
      scopeBeforeInherit:
        pre === null || pre === undefined ? null : (JSON.parse(pre as string) as NoteState['scope']),
      attachedTicketIds: JSON.parse(row.attached_ticket_ids as string) as string[],
      deleted: Number(row.deleted) === 1,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastBodyEventId: row.last_body_event_id as string,
      seq: Number(row.seq),
    };
  }

  async function contestsFor(tx: SyncStorage, ticketId: string): Promise<LocalContest[]> {
    const rows = await tx.all('SELECT * FROM contests WHERE ticket_id = ? ORDER BY contested_at, contested_event_id', [
      ticketId,
    ]);
    return rows.map(rowToContest);
  }


  /**
   * The LOCAL erasure set (trash Plan 3, D3): the named items plus what this
   * device holds under them. The server's registry already lists every member
   * of its own set, so this is the belt for a lookup that named only the top.
   */
  async function localErasureSet(
    tx: SyncStorage,
    refs: readonly PurgedRef[],
  ): Promise<{ workspaces: Set<string>; projects: Set<string>; tickets: Set<string>; notes: Set<string> }> {
    const workspaces = new Set<string>();
    const projects = new Set<string>();
    const tickets = new Set<string>();
    const notes = new Set<string>();
    for (const ref of refs) {
      if (ref.kind === 'workspace') workspaces.add(ref.id);
      else if (ref.kind === 'project') projects.add(ref.id);
      else if (ref.kind === 'ticket') tickets.add(ref.id);
      else notes.add(ref.id);
    }
    if (projects.size > 0) {
      for (const row of await tx.all('SELECT ticket_id, state FROM tickets', [])) {
        const state = JSON.parse(row['state'] as string) as TicketState;
        if (projects.has(state.projectId)) tickets.add(row['ticket_id'] as string);
      }
      for (const row of await tx.all('SELECT note_id, home_project_id FROM notes', [])) {
        if (projects.has(row['home_project_id'] as string)) notes.add(row['note_id'] as string);
      }
    }
    let frontier = [...tickets];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const parentId of frontier) {
        for (const row of await tx.all('SELECT ticket_id FROM tickets WHERE parent_id = ?', [parentId])) {
          const childId = row['ticket_id'] as string;
          if (!tickets.has(childId)) {
            tickets.add(childId);
            next.push(childId);
          }
        }
      }
      frontier = next;
    }
    return { workspaces, projects, tickets, notes };
  }

  async function eraseTicketIn(tx: SyncStorage, ticketId: string, at: string): Promise<void> {
    await dropOutboxRowsAsNotices(
      tx,
      await tx.all("SELECT * FROM outbox WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]),
      at,
    );
    await tx.run("DELETE FROM events WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]);
    await tx.run('DELETE FROM tickets WHERE ticket_id = ?', [ticketId]);
    await tx.run("DELETE FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]);
    await tx.run("DELETE FROM snapshot_provenance WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]);
    // EVERY contest, the device's own stub included — the one line on which this
    // differs from `purgeEntity` (D2). A stub embeds the refused claim whole, and
    // a purge is an erasure, not a loss of access.
    await tx.run('DELETE FROM contests WHERE ticket_id = ?', [ticketId]);
  }

  async function eraseNoteIn(tx: SyncStorage, noteId: string, at: string): Promise<void> {
    await dropOutboxRowsAsNotices(
      tx,
      await tx.all("SELECT * FROM outbox WHERE entity_kind = 'note' AND entity_id = ?", [noteId]),
      at,
    );
    await tx.run("DELETE FROM events WHERE entity_kind = 'note' AND entity_id = ?", [noteId]);
    await tx.run('DELETE FROM notes WHERE note_id = ?', [noteId]);
    await tx.run('DELETE FROM note_comments WHERE note_id = ?', [noteId]);
  }

  /** Everything the workspace owns on this device; answers the ticket and note ids it held. */
  async function eraseWorkspaceIn(
    tx: SyncStorage,
    workspaceId: string,
    at: string,
  ): Promise<{ tickets: string[]; notes: string[] }> {
    await dropOutboxRowsAsNotices(tx, await tx.all('SELECT * FROM outbox WHERE workspace_id = ?', [workspaceId]), at);
    const tickets = (await tx.all('SELECT ticket_id FROM tickets WHERE workspace_id = ?', [workspaceId])).map(
      (row) => row['ticket_id'] as string,
    );
    const notes = (await tx.all('SELECT note_id FROM notes WHERE workspace_id = ?', [workspaceId])).map(
      (row) => row['note_id'] as string,
    );
    // `snapshots`/`snapshot_provenance` carry no workspace id: by ticket.
    for (const ticketId of tickets) {
      await tx.run("DELETE FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]);
      await tx.run("DELETE FROM snapshot_provenance WHERE entity_kind = 'ticket' AND entity_id = ?", [ticketId]);
    }
    for (const table of ['events', 'tickets', 'notes', 'note_comments', 'contests']) {
      await tx.run(`DELETE FROM ${table} WHERE workspace_id = ?`, [workspaceId]);
    }
    // One workspace per replica — the assumption `revokeScope`'s whole-workspace
    // arm already makes for these two tables.
    await tx.run('DELETE FROM workflows', []);
    await tx.run('DELETE FROM ticket_types', []);
    // BOTH pending-pull keys (revokeScope forgets the note one).
    for (const key of [`cursor:${workspaceId}`, pendingPullsKey(workspaceId), pendingPullsKey(workspaceId, 'note')]) {
      await tx.run('DELETE FROM meta WHERE key = ?', [key]);
    }
    return { tickets, notes };
  }

  async function stripPendingPulls(tx: SyncStorage, ids: ReadonlySet<string>): Promise<void> {
    const rows = await tx.all(
      "SELECT key, value FROM meta WHERE key LIKE 'pending-pulls:%' OR key LIKE 'pending-note-pulls:%'",
      [],
    );
    for (const row of rows) {
      const held = parsePendingPulls(row['value']).filter((entry) => !ids.has(entry.id));
      await tx.run('UPDATE meta SET value = ? WHERE key = ?', [JSON.stringify(held), row['key'] as string]);
    }
  }

  async function stripDeletedItemsCache(
    tx: SyncStorage,
    ids: ReadonlySet<string>,
    workspaces: ReadonlySet<string>,
  ): Promise<void> {
    for (const row of await tx.all('SELECT cache_key, payload FROM deleted_items_cache', [])) {
      const body = JSON.parse(row['payload'] as string) as { items?: unknown };
      if (!Array.isArray(body.items)) continue;
      const kept = body.items.filter((item: unknown) => {
        const entry = (typeof item === 'object' && item !== null ? item : {}) as { id?: unknown; workspaceId?: unknown };
        if (typeof entry.id === 'string' && ids.has(entry.id)) return false;
        return !(typeof entry.workspaceId === 'string' && workspaces.has(entry.workspaceId));
      });
      await tx.run('UPDATE deleted_items_cache SET payload = ? WHERE cache_key = ?', [
        JSON.stringify({ ...body, items: kept }),
        row['cache_key'] as string,
      ]);
    }
  }

  const replica: Replica = {
    async loadBootstrap(data) {
      await storage.transaction(async (tx) => {
        await tx.run("INSERT INTO meta (key, value) VALUES ('me', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
          JSON.stringify(data.me),
        ]);
        // The highest `workflow.defined` per workflow, kept as `applyDefinition`
        // PARSED it rather than re-read from the payload — the same value the
        // `workflows` row holds.
        //
        // COMPLETENESS IS THE LOAD-BEARING ASSUMPTION HERE, and it is read off
        // the server rather than off this file's own type comment:
        // `apps/server/src/sync/sync-routes.ts` builds `definitions` as
        // `SELECT * FROM events WHERE workspace_id = $1 AND entity_kind IN
        // ('workflow', 'ticket-type') ORDER BY workspace_seq` — every
        // definition event in the workspace, no version filter and no delta. So
        // this map holds the true latest version of every workflow the response
        // covers, and a workflow it does not cover is one this response gives
        // no reason to fold onto. If that query ever becomes incremental, this
        // fold silently folds onto a stale "latest".
        const latestByWorkflow = new Map<string, PublishedWorkflowDef>();
        for (const def of data.definitions) {
          const dupe = await tx.all('SELECT 1 FROM events WHERE id = ?', [def.id]);
          if (dupe.length === 0) await insertEnvelope(tx, def);
          const published = await applyDefinition(tx, def);
          if (published === null) continue;
          const held = latestByWorkflow.get(published.id);
          if (held === undefined || published.version > held.version) latestByWorkflow.set(published.id, published);
        }
        // Definitions first, then one deps read for the whole batch: the
        // reducer must be able to resolve ANY workflow id an event asks for
        // (`ticket.workflow_rebound` names one the ticket is not on yet), so a
        // deps object built before the definitions landed would throw on the
        // very event the migration exists for.
        const localDeps = await buildLocalDeps(tx);
        for (const ticket of data.tickets) {
          if (ticket.snapshot !== null) {
            // REFRESH ON PUBLISH, BOOTSTRAP DOOR. The server serves the snapshot
            // it last wrote, at whatever version the ticket was on then, and
            // nothing on the server invalidates it when a workflow is published
            // — so the fold has to happen here or not at all.
            const folded = await foldSnapshotForward(
              tx,
              ticket.snapshot.state,
              latestByWorkflow.get(ticket.snapshot.state.workflowId),
            );
            // The provenance block travels with the snapshot and is NOT folded:
            // folding rewrites state onto a newer vocabulary, and who claimed a
            // state and when is not part of any vocabulary. `?? null` covers a
            // server that has not shipped the field — an older build, or a row
            // written before ruling P36's column — and `writeSnapshot` treats
            // null as "nothing new to say" rather than "forget what you knew".
            await writeSnapshot(
              tx,
              ticket.ticketId,
              ticket.snapshot.seq,
              folded,
              ticket.snapshot.provenance ?? null,
            );
          }
          // A ticket with NO snapshot needs no fold: `events` is then its full
          // history and `ticket.created` resolves the workflow through
          // `localDeps`, which answers at the latest version — so the replay
          // lands on the current vocabulary by construction.
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
        // THE NOTES, inside the same transaction as the cursor that covers
        // them (Plan 2 of 6). A device that has never synced has no cursor gap
        // for a notice to repair, so without this a fresh device — and a new
        // MEMBER, which is the case `readerReachNoticeFor` deliberately does
        // not cover — would be handed a workspace whose notes are simply
        // missing until something happened to widen one.
        //
        // Through `loadNoteEvents` rather than a second insert loop, so the
        // id-idempotence and the fold are the same code the pull path uses.
        // `viewToEnvelope` because the payload is the ROW dialect: this is the
        // same conversion the note pull route needs, and having one of it is
        // the whole reason it is exported.
        if (data.notes !== undefined && data.notes.events.length > 0) {
          await loadNoteEventsIn(tx, data.notes.events.map(viewToEnvelope));
        }
      });
      notify();
    },

    /**
     * ONE ticket, applied without moving the workspace cursor — closure 5b(d),
     * ruling P37.1.
     *
     * ## Why this is not `loadBootstrap` with a shorter list
     *
     * `loadBootstrap` ends by writing `cursor:<workspaceId>` to the server's
     * head, unconditionally. That is right for what it is: a whole-workspace
     * consistent cut, where the head is exactly the position the response
     * covers. It is CATASTROPHIC for one ticket. A device at cursor 40 pulling
     * one ticket from a server at 900 would have its cursor set to 900, and
     * every event between 41 and 899 for every OTHER ticket would be skipped —
     * silently, permanently, and looking exactly like convergence in any
     * fixture quiet enough not to have those events. The pull would fix one
     * ticket by losing the workspace.
     *
     * So this door writes no cursor at all, and the pulled ticket's own
     * position is not tracked anywhere: the events it just persisted are
     * duplicate-guarded by id, so when the stream later re-delivers them from
     * below the cursor, `applyServerItem` ignores them and nothing is folded
     * twice. Case 12.293 asserts the cursor is unmoved and reddens alone
     * against a door that writes one.
     *
     * ## The rollback is per TICKET, not per session
     *
     * `loadBootstrap` wraps every ticket in ONE transaction, so one unfoldable
     * ticket rolls back the whole response. That is correct there — a partial
     * cut is not a cut. Here the opposite is correct: this is one ticket's
     * worth of work, and wedging a pull the way the burst wedged the stream is
     * the failure closure 5b exists to remove. One transaction, one ticket; if
     * it throws, this ticket is untouched and the caller leaves the id pending
     * for the next drain.
     *
     * Definitions land INSIDE that same transaction deliberately. They are
     * workspace-global and idempotent, so rolling them back with a failed
     * ticket costs nothing and re-applying them next time is free — whereas
     * committing them separately would leave a device holding definitions it
     * has no ticket for, which is harmless but is a state no other door can
     * produce and therefore one no reader expects.
     */
    async loadTicketBootstrap(data) {
      await storage.transaction(async (tx) => {
        // Definitions first, for `loadBootstrap`'s own reason: the reducer must
        // be able to resolve ANY workflow id an event names, and a deps object
        // built before they landed throws on the very event they exist for.
        const latestByWorkflow = new Map<string, PublishedWorkflowDef>();
        for (const def of data.definitions) {
          const dupe = await tx.all('SELECT 1 FROM events WHERE id = ?', [def.id]);
          if (dupe.length === 0) await insertEnvelope(tx, def);
          const published = await applyDefinition(tx, def);
          if (published === null) continue;
          const held = latestByWorkflow.get(published.id);
          if (held === undefined || published.version > held.version) latestByWorkflow.set(published.id, published);
          // MOVE THE TICKETS THIS DEVICE ALREADY HOLDS, exactly as
          // `applyServerItem` does. Storing the definition is not enough, and
          // the omission was silent AND self-sealing: `applyServerItem` returns
          // early on a duplicate event id, so once this door had inserted the
          // envelope, the SAME `workflow.defined` arriving later over the stream
          // became a no-op and `foldTicketsOntoVersion` never ran for it at all.
          // A client that pulled a ticket across a workflow publish would keep
          // the old categories until the NEXT publish — the precise divergence
          // `refresh on publish` exists to prevent. Found by the branch review;
          // case 12.311.
          await foldTicketsOntoVersion(tx, published);
        }
        const localDeps = await buildLocalDeps(tx);
        const ticket = data.ticket;
        if (ticket.snapshot !== null) {
          const folded = await foldSnapshotForward(
            tx,
            ticket.snapshot.state,
            latestByWorkflow.get(ticket.snapshot.state.workflowId),
          );
          // The provenance block travels with the snapshot, exactly as it does
          // through `loadBootstrap` — passed through, never constructed, and
          // never an explicit null of this door's own making (`writeSnapshot`
          // treats absent as "nothing new to say", not as "forget what you
          // knew"). Dropping it here would be silent and would matter most:
          // `replica-data-source.ts` refuses a snapshot-bounded read with no
          // provenance, so a ticket arriving through THIS door — a ticket the
          // device has by definition never held — would be the one case
          // ruling P36 fixed and closure 5b(d) quietly reopened. Case 12.302.
          await writeSnapshot(tx, ticket.ticketId, ticket.snapshot.seq, folded, ticket.snapshot.provenance ?? null);
        }
        for (const env of ticket.events) {
          const dupe = await tx.all('SELECT 1 FROM events WHERE id = ?', [env.id]);
          if (dupe.length === 0) await insertEnvelope(tx, env);
          if (CONTEST_TYPES.includes(env.type)) await applyContest(tx, env);
        }
        await refoldTicket(tx, ticket.ticketId, localDeps);
      });
      notify();
    },

    /**
     * ## The pending-pull set: durable, because the alternatives are a brick or a bet
     *
     * When a notice names a ticket this device may now read, and the pull for
     * it fails or times out, exactly one of three things can happen and two of
     * them are wrong:
     *
     * 1. **Throw.** `applyOne`'s rejection reaches `stall()`, whose flag is
     *    cleared by `start()` and by nothing else — mobile never calls it
     *    again, and the UI renders the state as plain "Offline". A flaky
     *    network would brick the device until the process restarts, where
     *    before closure 5b it merely lost a backfill. Refused.
     * 2. **Swallow and forget.** The cursor advances past the trigger, the
     *    notice is never regenerated for that drain, and the ids are lost with
     *    no recovery short of a full bootstrap — which `needsBootstrap`
     *    refuses over a local baseline. Refused.
     * 3. **Swallow and REMEMBER.** The cursor is free to advance, nothing
     *    stalls, and the next catch-up drains what is owed.
     *
     * It is stored rather than held in memory because a process restart is the
     * one recovery a user actually performs, and an in-memory set makes the
     * restart the thing that loses the ids. It lives in `meta` beside
     * `cursor:` and `me` — key/value, so no schema change — as a JSON array.
     *
     * **This is also what makes convergence independent of the notice arriving
     * twice**, which matters because `net/http-transport.ts`'s frame dispatch
     * is an if/return ladder with no trailing branch: a frame a client build
     * does not recognise is dropped in silence while the event behind it is
     * accepted. Not reachable for this change set — client and server ship
     * together — but a design that leaned on re-delivery would be leaning on
     * that ladder staying exhaustive forever.
     */
    async listPendingPulls(workspaceId, kind = 'ticket') {
      const rows = await storage.all('SELECT value FROM meta WHERE key = ?', [
        pendingPullsKey(workspaceId, kind),
      ]);
      return parsePendingPulls(rows[0]?.['value']);
    },

    async addPendingPulls(workspaceId, tickets, kind = 'ticket') {
      if (tickets.length === 0) return;
      await storage.transaction(async (tx) => {
        // Read-modify-write INSIDE the transaction. Two notices in one drain are
        // applied one after another on the engine's serial chain, but the set is
        // public API and a shell may add to it too; a read outside the
        // transaction would lose one writer's entries to the other's write.
        const key = pendingPullsKey(workspaceId, kind);
        const rows = await tx.all('SELECT value FROM meta WHERE key = ?', [key]);
        const held = new Map(parsePendingPulls(rows[0]?.['value']).map((t) => [t.id, t.headSeq]));
        // A later notice SUPERSEDES an earlier one for the same id, and that
        // overwrite is load-bearing: it is what a 404's drop compares against.
        for (const t of tickets) held.set(t.id, t.headSeq);
        await tx.run(
          'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key, JSON.stringify([...held].map(([id, headSeq]) => ({ id, headSeq })))],
        );
      });
    },

    async clearPendingPull(workspaceId, entityId, kind = 'ticket') {
      await storage.transaction(async (tx) => {
        const key = pendingPullsKey(workspaceId, kind);
        const rows = await tx.all('SELECT value FROM meta WHERE key = ?', [key]);
        const held = parsePendingPulls(rows[0]?.['value']).filter((t) => t.id !== entityId);
        await tx.run(
          'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key, JSON.stringify(held)],
        );
      });
    },

    async dropPendingPullIfUnchanged(workspaceId, entityId, headSeq, kind = 'ticket') {
      await storage.transaction(async (tx) => {
        const key = pendingPullsKey(workspaceId, kind);
        const rows = await tx.all('SELECT value FROM meta WHERE key = ?', [key]);
        const held = parsePendingPulls(rows[0]?.['value']);
        const current = held.find((t) => t.id === entityId);
        // A NEWER notice has re-named it since the pull was issued, so the 404
        // answered a question that is no longer the one being asked. Keep it.
        if (current === undefined || current.headSeq !== headSeq) return;
        await tx.run(
          'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key, JSON.stringify(held.filter((t) => t.id !== entityId))],
        );
      });
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
        } else if (env.entity.kind === 'note') {
          // NOTE the absence of a `FOLDING_NOTE_TYPES` guard beside the kind
          // test, which the ticket arm above has. It is not an oversight and
          // must not be added: `FOLDING_TICKET_TYPES` exists because tickets
          // carry event types the reducer does NOT fold (`visibility.set`, the
          // contests, and the content types a snapshot must still ship), and a
          // note has none of those — `applyNoteEvent` covers the whole note
          // vocabulary and THROWS on anything else. So an unrecognised note
          // event is a loud failure here, which is the direction that matters:
          // a note's head row is folded from its history, and a silently
          // skipped event would be a note that quietly disagrees with the
          // server.
          //
          // A COMMENT goes to its own table and does NOT refold the head row.
          // The reducer folds it to no state change, so a refold would rewrite
          // that row for nothing AND advance `notes.seq` past an event that
          // moved no note state (case 18.078).
          if (env.type === 'comment.added') await applyNoteComment(tx, env);
          else await refoldNote(tx, env.entity.id);
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
      // The provenance block goes with the snapshot it belongs to. It was
      // MISSED when the table was added, and the omission is the shape this
      // file's own invariant warns about — "a replica for a workspace you are
      // not in should hold nothing of it beyond your own authored stubs". A
      // block left behind is an actorId and two instants for a ticket the
      // server told this device to forget. Nothing serves an orphaned row
      // today, but `writeSnapshot` deliberately does not overwrite with an
      // absent block, so a future re-delivery would resurface it rather than
      // replace it — retention now, a wrong answer later.
      await tx.run('DELETE FROM snapshot_provenance WHERE entity_id = ?', [entityId]);
        // Contests OTHERS raised vanish with the ticket. The local user's OWN
        // contested claims survive as content-light stubs: their `originalEvent`
        // is what this user typed on this device, purging it would silently
        // vanish their claim (honesty invariant 5), and it leaks nothing they
        // did not author themselves.
        if (me === null) await tx.run('DELETE FROM contests WHERE ticket_id = ?', [entityId]);
        else await tx.run('DELETE FROM contests WHERE ticket_id = ? AND claimant_id <> ?', [entityId, me.userId]);
        // A note's row and its comments go with its events. `entityId` is an id
        // from ONE namespace, so these two statements cannot collide with the
        // ticket ones above — a note id is not a ticket id, and a purge naming
        // either must clear whichever it names.
        await tx.run('DELETE FROM notes WHERE note_id = ?', [entityId]);
        await tx.run('DELETE FROM note_comments WHERE note_id = ?', [entityId]);
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
        // Same reason as `purgeEntity`: the block follows the snapshot.
        await tx.run('DELETE FROM snapshot_provenance WHERE entity_id = ?', [ticketId]);
          if (me === null) await tx.run('DELETE FROM contests WHERE ticket_id = ?', [ticketId]);
          else await tx.run('DELETE FROM contests WHERE ticket_id = ? AND claimant_id <> ?', [ticketId, me.userId]);
        }
        // NOTES, and this one is SCOPED BY WORKSPACE — the statement above
        // reaches a note by ITS OWN id, which is right for a purge and wrong
        // here. `revokeScope` is handed a workspace (optionally a project) and
        // the tickets it removes are found BY workspace; a note would be
        // reached only through `notes.workspace_id`, and a `DELETE` without that
        // clause takes every workspace's notes (case 18.080).
        //
        // The project branch is not implemented and does not need to be: a
        // `scope-revoked` with a `projectId` is refused at the door
        // (`visible-events-for.ts` emits none, and the hub throws on one), and
        // this function's own `projectId === undefined` branch below is where
        // the workspace-wide case is finished off.
        await tx.run('DELETE FROM notes WHERE workspace_id = ?', [instruction.workspaceId]);
        await tx.run('DELETE FROM note_comments WHERE workspace_id = ?', [instruction.workspaceId]);
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
          // And what this device was OWED but never pulled (closure 5b(d)).
          // Left behind, the pending set would have a removed device asking
          // `/v1/sync/bootstrap/ticket` for ids in a workspace it is no longer
          // in, on every catch-up, forever — answered 403 each time. It is also
          // the only per-workspace key besides the cursor, so it belongs in the
          // same statement group rather than in a later one somebody has to
          // remember to add.
          await tx.run('DELETE FROM meta WHERE key = ?', [pendingPullsKey(instruction.workspaceId)]);
        }
      });
      notify();
    },

    async eraseEntities(refs) {
      if (refs.length === 0) return { erased: [] };
      const at = new Date().toISOString();
      const erased = await storage.transaction(async (tx) => {
        const set = await localErasureSet(tx, refs);
        const recorded: PurgedRef[] = [];
        for (const workspaceId of set.workspaces) {
          const held = await eraseWorkspaceIn(tx, workspaceId, at);
          recorded.push({ kind: 'workspace', id: workspaceId });
          for (const id of held.tickets) set.tickets.add(id);
          for (const id of held.notes) set.notes.add(id);
        }
        for (const id of set.projects) recorded.push({ kind: 'project', id });
        for (const id of set.tickets) {
          await eraseTicketIn(tx, id, at);
          recorded.push({ kind: 'ticket', id });
        }
        for (const id of set.notes) {
          await eraseNoteIn(tx, id, at);
          recorded.push({ kind: 'note', id });
        }
        for (const ref of recorded) {
          await tx.run(
            `INSERT INTO purged_ids (entity_kind, entity_id, recorded_at) VALUES (?, ?, ?)
             ON CONFLICT(entity_kind, entity_id) DO NOTHING`,
            [ref.kind, ref.id, at],
          );
        }
        const ids = new Set(recorded.map((ref) => ref.id));
        await stripPendingPulls(tx, ids);
        await stripDeletedItemsCache(tx, ids, set.workspaces);
        return recorded;
      });
      notify();
      return { erased };
    },

    async purgedAmong(ids) {
      if (ids.length === 0) return [];
      const rows = await storage.all(
        `SELECT entity_kind, entity_id FROM purged_ids
          WHERE entity_id IN (SELECT value FROM json_each(?))
          ORDER BY entity_kind, entity_id`,
        [JSON.stringify(ids)],
      );
      return rows.map((row) => ({ kind: row['entity_kind'] as PurgedRef['kind'], id: row['entity_id'] as string }));
    },

    async purgeLookupCandidates(workspaceId) {
      const ids = new Set<string>([workspaceId]);
      const take = (rows: SqlRow[], column: string): void => {
        for (const row of rows) {
          const value = row[column];
          if (typeof value === 'string' && value !== '') ids.add(value);
        }
      };
      take(await storage.all('SELECT ticket_id FROM tickets WHERE workspace_id = ?', [workspaceId]), 'ticket_id');
      take(await storage.all('SELECT note_id FROM notes WHERE workspace_id = ?', [workspaceId]), 'note_id');
      take(await storage.all('SELECT ticket_id FROM contests WHERE workspace_id = ?', [workspaceId]), 'ticket_id');
      take(
        await storage.all(
          "SELECT entity_id FROM outbox WHERE workspace_id = ? AND entity_kind IN ('ticket', 'note')",
          [workspaceId],
        ),
        'entity_id',
      );
      const bodies: unknown[] = [];
      for (const row of await storage.all('SELECT body FROM notes WHERE workspace_id = ?', [workspaceId])) {
        bodies.push(JSON.parse(row['body'] as string));
      }
      for (const row of await storage.all('SELECT body FROM note_comments WHERE workspace_id = ?', [workspaceId])) {
        bodies.push(JSON.parse(row['body'] as string));
      }
      for (const row of await storage.all(
        "SELECT payload FROM events WHERE workspace_id = ? AND type IN ('comment.added', 'ticket.field_set')",
        [workspaceId],
      )) {
        const payload = JSON.parse(row['payload'] as string) as { body?: unknown; value?: unknown };
        bodies.push(payload.body ?? payload.value);
      }
      for (const body of bodies) {
        const refs = collectDocReferences(body);
        for (const id of [...refs.ticketIds, ...refs.noteIds]) ids.add(id);
      }
      const known = new Set(
        (await storage.all('SELECT entity_id FROM purged_ids', [])).map((row) => row['entity_id'] as string),
      );
      return [...ids].filter((id) => !known.has(id)).sort();
    },

    async cacheDeletedItems(body, fetchedAt) {
      await storage.run(
        `INSERT INTO deleted_items_cache (cache_key, payload, fetched_at) VALUES ('me', ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
        [JSON.stringify(body), fetchedAt],
      );
    },

    async readDeletedItemsCache() {
      const rows = await storage.all("SELECT payload, fetched_at FROM deleted_items_cache WHERE cache_key = 'me'", []);
      const row = rows[0];
      return row === undefined
        ? null
        : { body: JSON.parse(row['payload'] as string) as unknown, fetchedAt: row['fetched_at'] as string };
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

    async getNote(noteId) {
      const rows = await storage.all('SELECT * FROM notes WHERE note_id = ?', [noteId]);
      const row = rows[0];
      return row === undefined ? null : rowToNote(row);
    },

    async listNotes(workspaceId) {
      // `seq DESC` as the tiebreak rather than `note_id`: two notes saved in the
      // same millisecond are ordered by how far their own histories got, which
      // is the closest thing to "which one changed last" the row holds.
      const rows = await storage.all(
        'SELECT * FROM notes WHERE workspace_id = ? AND deleted = 0 ORDER BY updated_at DESC, seq DESC',
        [workspaceId],
      );
      return rows.map(rowToNote);
    },

    async listDeletedNotes(workspaceId) {
      const rows = await storage.all(
        'SELECT * FROM notes WHERE workspace_id = ? AND deleted = 1 ORDER BY updated_at DESC, seq DESC',
        [workspaceId],
      );
      return rows.map(rowToNote);
    },

    async listNoteIds(workspaceId) {
      const rows = await storage.all('SELECT note_id FROM notes WHERE workspace_id = ? ORDER BY note_id', [
        workspaceId,
      ]);
      return rows.map((r) => r.note_id as string);
    },

    async listNotesForTicket(workspaceId, ticketId) {
      // `json_each` over the stored array, which is why `attached_ticket_ids` is
      // a JSON column rather than a join table: the replica never needs to read
      // an attachment by ticket except here, and here the column itself can
      // answer. NOT a `LIKE '%id%'` — a substring match against a JSON array
      // finds `01ABC` inside `01ABCD`, which is a wrong answer with no failing
      // signal.
      const rows = await storage.all(
        `SELECT n.* FROM notes n
          WHERE n.workspace_id = ? AND n.deleted = 0
            AND EXISTS (SELECT 1 FROM json_each(n.attached_ticket_ids) WHERE json_each.value = ?)
          ORDER BY n.updated_at DESC, n.seq DESC`,
        [workspaceId, ticketId],
      );
      return rows.map(rowToNote);
    },

    async listNoteComments(noteId) {
      const rows = await storage.all(
        'SELECT * FROM note_comments WHERE note_id = ? ORDER BY workspace_seq',
        [noteId],
      );
      return rows.map((row) => ({
        commentId: row.comment_id as string,
        authorId: row.author_id as string,
        body: JSON.parse(row.body as string) as unknown,
        recordedAt: row.recorded_at as string,
        workspaceSeq: Number(row.workspace_seq),
      }));
    },

    async loadNoteEvents(events) {
      await storage.transaction((tx) => loadNoteEventsIn(tx, events));
      notify();
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

    async getSnapshotProvenance(ticketId) {
    return storage.transaction((tx) => readSnapshotProvenance(tx, ticketId));
  },

  async listEntityEvents(entityId, kind = 'ticket') {
      // `kind` is a parameter for the same reason `listPendingPulls`'s is: a
      // note's history is read from the SAME table by the same row mapper, and
      // a second near-identical query is what comes to disagree with this one.
      // The default keeps every existing caller's meaning exactly.
      const rows = await storage.all('SELECT * FROM events WHERE entity_kind = ? AND entity_id = ? ORDER BY seq', [
        kind,
        entityId,
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
      case 'reach-granted': {
        // Record what this device does not already hold, and STOP. The replica
        // has no transport and must not grow one — fetching is the engine's
        // job, and keeping the split is what stops this store becoming a second
        // client.
        //
        // The holdings filter lives HERE rather than on the server because the
        // server does not model a device's holdings and must not start; the
        // client is the only party that knows. It is also what makes a repeated
        // no-op `visibility.set` — which `check-permission.ts` does not refuse
        // — cost a client that already holds the subtree nothing at all.
        //
        // A ticket held only as unfolded events has no `tickets` row and is
        // therefore treated as NOT held, so it is pulled again. That is
        // over-delivery, and over-delivery is the side this door is allowed to
        // err on: `loadTicketBootstrap` is idempotent by event id.
        const missing: ReachGrantedTicket[] = [];
        for (const { id, headSeq } of instruction.tickets) {
          // THE COMPARISON RULING P37.2 ADDED, and the reason the obvious test
          // is not enough. "Do I hold this ticket" cannot distinguish a
          // COMPLETE local copy from a stale partial one, and a device that
          // was narrowed and re-widened holds exactly the latter — so an
          // id-only notice skipped precisely the tickets it existed to repair
          // (measured, case 12.316). What settles it is one integer: the
          // server's head for that ticket against this device's own highest
          // local position for it.
          //
          // `>=` rather than `===` on purpose: a local head ABOVE the server's
          // means this device holds something the notice's snapshot of the
          // ledger did not, which is an ordinary race with a concurrent commit
          // and not a reason to re-fetch. Pulling on `<` alone is also what
          // keeps the amplifier bound — a client already current on the subtree
          // fetches nothing, which is case 12.276.
          if ((await localHeadSeq(storage, id)) < headSeq) missing.push({ id, headSeq });
        }
        await replica.addPendingPulls(instruction.workspaceId, missing);

        // THE NOTE ARM (Plan 2 of 6). The same ruling, the same comparison, a
        // different door on the other side: `bootstrapNote` fetches
        // `GET /v1/notes/:id/events`, and the head compared is the note's own
        // `MAX(workspace_seq)`.
        //
        // A note held only as events folds to a row the moment the events
        // arrive, so unlike the ticket arm there is no "held but unfolded"
        // case to over-deliver for — the head IS the row's basis, and a note
        // whose row is missing but whose events are present still compares
        // equal and is not pulled. That is correct: it needs no history, only
        // a refold, and `listNotes` reads the row (a note with no row and a
        // complete event history is a state only a crash between two writes
        // produces — the fold is in the same transaction as the insert).
        const missingNotes: ReachGrantedTicket[] = [];
        for (const { id, headSeq } of instruction.notes ?? []) {
          if ((await localHeadSeq(storage, id, 'note')) < headSeq) missingNotes.push({ id, headSeq });
        }
        await replica.addPendingPulls(instruction.workspaceId, missingNotes, 'note');
        return { applied: true };
      }
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
