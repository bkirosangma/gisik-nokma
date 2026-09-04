import type {
  IngestResult,
  LedgerEvent,
  PublishedWorkflowDef,
  StateCategory,
  SubmittedEvent,
  TicketState,
  TicketTypeDef,
  WorkflowDef,
} from '@gisik-nokma/domain';
import { IST_DAY_REGEX } from '@gisik-nokma/domain';
import {
  isSyncInstruction,
  workflowVersionsOf,
  type LocalContest,
  type Outbox,
  type PendingTicket,
  type Replica,
  type ReplicaTicket,
  type SyncEngine,
  type SyncStatus,
  type SyncStorage,
} from '@gisik-nokma/sync-client';
import type { DataSource, DataSourceQuery, StreamItem, Unsubscribe } from '../data-source.js';
import { EPIC_RANK, epicAncestorOf } from '../hierarchy/epic-ancestor.js';
import { matchesFilter } from '../filter/matches-filter.js';
import type {
  Actor,
  BoardColumn,
  BoardGroup,
  BoardView,
  ClaimProvenance,
  FilterSpec,
  Grouping,
  ListRow,
  ParentRef,
  TicketHistoryEvent,
  TicketListView,
  TicketRead,
  TransitionCause,
} from '../view-types.js';

/* ------------------------------------------------------------------ *
 * The extra vocabulary. Nothing here widens `DataSource`.
 * ------------------------------------------------------------------ */

/**
 * One fact a view type needs and THIS DEVICE does not hold.
 *
 * Deliberately a SEPARATE type from `online/mappers.ts`'s `Absence`, and the
 * separation is the whole point rather than duplication. That one is read by
 * `apps/server/test/integration/client-contract.test.ts`, which measures each
 * named `wireKey` against a real `/v1` body so a route that starts serving the
 * fact turns the refusal red. **A replica absence has no route to measure.**
 * `WorkItem.projectName` is missing from `packages/sync-client`'s local schema —
 * there is no `projects` table — and `/v1/me/work` serving it tomorrow would
 * change nothing here. Feeding these into `SERVING_GAPS` would either break that
 * suite or, worse, pass vacuously through a `wireRoute: null`, which is a check
 * that cannot fail wearing the costume of one that can.
 *
 * So `owner` names what would have to change LOCALLY — a table, a `Replica`
 * accessor, a bootstrap payload — never a route.
 */
export type ReplicaAbsence = {
  /** The client path this device cannot fill. */
  field: string;
  because: string;
  /** What would have to change in the CLIENT for this to close. Never a `/v1` route. */
  owner: string;
};

/** The local store is fine. The view type still cannot be filled honestly. */
export class ReplicaGapError extends Error {
  readonly absences: readonly ReplicaAbsence[];
  constructor(method: string, absences: readonly ReplicaAbsence[]) {
    super(
      `the offline copy cannot answer ${method}: ${absences
        .map((absence) => `${absence.field} (${absence.because}; owner: ${absence.owner})`)
        .join('; ')}`,
    );
    this.name = 'ReplicaGapError';
    this.absences = absences;
  }
}

/**
 * `IngestResult` plus the ONE word an offline device needs and the shipped
 * union does not have.
 *
 * It is NOT the return type of `ingest` and must never become one: `DataSource.
 * ingest` promises `IngestResult[]`, and return-type covariance means a fourth
 * status makes `ReplicaDataSource` unassignable to `DataSource` — which would
 * cost exactly the interchangeability amendment 10 exists for (ruling P30).
 * It travels on `OfflineAcceptError` instead.
 */
export type LocalIngestResult = IngestResult | { status: 'pending'; eventId: string };

/**
 * What `ingest` throws when a claim was accepted for now.
 *
 * ## Why a throw rather than a fourth status, and why not a lie
 *
 * Every arm of `IngestResult` is FALSE of a queued claim. `committed` is the
 * one the plan's honesty pin forbids by name — it would launder a claim in
 * transit into settled fact. `invalid` is false: the envelope parsed. `refused`
 * is false: no rule refused it, and spelling a `rule: 'offline'` would put a
 * refusal reason on screen that no workflow authored. There is no honest
 * `IngestResult` for "queued", so this method returns none.
 *
 * Refusing loudly on an ordinary path is this package's shipped pattern, not a
 * departure from it: six of thirteen ONLINE query methods throw
 * `ServingGapError` on their normal path (`online/mappers.ts`), and three views
 * cite that refusal by name. `results` is index-aligned with the submitted
 * batch, so a caller that catches this learns per-claim what happened — the
 * refusals keep their rule and reason, and the accepted ones name the ids now
 * queued.
 */
export class OfflineAcceptError extends Error {
  /** Index-aligned with the submitted batch. */
  readonly results: readonly LocalIngestResult[];
  /** The ids now standing in the outbox — the same ids `TicketSummary.pendingEventIds` reports. */
  readonly queuedEventIds: readonly string[];
  constructor(results: readonly LocalIngestResult[]) {
    const queued = results.flatMap((r) => (r.status === 'pending' ? [r.eventId] : []));
    super(
      `${String(queued.length)} claim(s) accepted for now and queued on this device; the server has not answered. ` +
        'Read query.syncStatus for the queue depth and the per-ticket pending flag for what is in transit.',
    );
    this.name = 'OfflineAcceptError';
    this.results = results;
    this.queuedEventIds = queued;
  }
}

/**
 * A ticket as an offline badge needs it: settled columns, plus whether ANY
 * claim for it is still in transit. `pending` is never folded into the settled
 * fields — that separation is `outbox.ts`'s own invariant, restated at the
 * surface that renders it.
 */
export type TicketSummary = {
  ticketId: string;
  title: string;
  stateId: string;
  stateCategory: StateCategory;
  assigneeId: string | null;
  parentId: string | null;
  /** ANY queued claim → the badge. */
  pending: boolean;
  pendingEventIds: string[];
  openContests: number;
};

/**
 * The replica-only half of the query surface — the facts an offline device has
 * and `DataSourceQuery` has no method for.
 *
 * Every member here is ADDITIVE. `ReplicaDataSource` is a structural SUPERSET
 * of `DataSource`, so a view written against the online source runs unchanged
 * against this one; these are what a view written FOR the offline shells can
 * ask on top.
 */
export type ReplicaOnlyQuery = {
  /** Confirmed tickets plus offline-born ones, every one badged. */
  listTicketSummaries(workspaceId: string): Promise<TicketSummary[]>;
  /** Settled state and the outbox overlay side by side — never merged. */
  getTicketWithPending(
    ticketId: string,
  ): Promise<(ReplicaTicket & { pending: PendingTicket | null }) | null>;
  listContests(
    workspaceId: string,
    filter?: { ticketId?: string; claimantId?: string; open?: boolean },
  ): Promise<LocalContest[]>;
  myWork(
    workspaceId: string,
    userId: string,
  ): Promise<{ assigned: TicketSummary[]; claimsInTransit: TicketSummary[]; contested: LocalContest[] }>;
  /**
   * `offlineCopy: true` is the plan's honesty pin surviving the type change:
   * the UI must say "searching the offline copy". The base `search` REFUSES
   * (see `SEARCH_ABSENCES`), so this is the only search this source serves and
   * the flag cannot be dropped on the way through.
   */
  searchOfflineCopy(
    workspaceId: string,
    text: string,
  ): Promise<{ offlineCopy: true; hits: Array<{ ticketId: string; title: string }> }>;
  syncStatus(workspaceId: string): Promise<{ status: SyncStatus; queued: number; failed: number }>;
};

/**
 * Ruling P30's shape, written as the ruling writes it: a structural SUPERSET of
 * the shipped `DataSource`, not a sibling of it.
 *
 * `const _assignable: DataSource = createReplicaDataSource(deps)` compiling is
 * the whole claim, and `test/replica/replica-data-source.test.ts` holds that
 * line so the claim is a compile-time fact rather than this sentence.
 */
export type ReplicaDataSource = DataSource & { query: DataSourceQuery & ReplicaOnlyQuery };

export type ReplicaDataSourceDeps = {
  /**
   * The ONE workspace this replica holds.
   *
   * DEVIATION from the plan's `deps`, forced by the repo: `getBoard` and
   * `getTickets` are keyed by PROJECT and every local table is keyed by
   * workspace, and `Replica` exposes no accessor for the id it bootstrapped
   * with (`meta` holds `me` and `cursor:<workspaceId>`; `Me` carries
   * `projectIds` and no workspace id). The shell that called `loadBootstrap`
   * knows it, so it passes it rather than this module guessing.
   */
  workspaceId: string;
  replica: Replica;
  outbox: Outbox;
  engine: SyncEngine;
  /**
   * The same store the replica was built on — read ONLY through
   * `workflowVersionsOf`, sync-client's own exported version-accurate lookup.
   *
   * Needed because a board column must name the definition its `name`,
   * `category` and `blocked` were read out of, and a ticket's
   * `workflowVersion` is frequently BELOW the latest. `Replica.buildDeps`
   * answers the reducer's question — "what does workflow W mean now" — and
   * `local-deps.ts` says in its own words that collapsing the two lookups is
   * "the quiet way to lose the version chain".
   */
  storage: SyncStorage;
};

/* ------------------------------------------------------------------ *
 * The refusals. Seven of the thirteen, and NOT the online source's seven.
 * ------------------------------------------------------------------ */

const NO_WORKSPACE_TABLE: ReplicaAbsence = {
  field: 'WorkspaceRef.name / WorkspaceRef.projects',
  because:
    'the local schema (packages/sync-client/src/storage/schema.ts) has no workspaces table and no projects table — bootstrap ships definitions, tickets and `me`, and `Me` carries bare project IDS with no names. A nav rendering an id where a name goes is a nav naming something nobody authored',
  owner: 'Plan 10 — the bootstrap payload and the local schema, not a /v1 route',
};

const MY_WORKSPACES_ABSENCES: readonly ReplicaAbsence[] = [NO_WORKSPACE_TABLE];

const MEMBERS_ABSENCES: readonly ReplicaAbsence[] = [
  {
    field: 'Actor.name',
    because:
      'no roster is replicated. `membership.*` events are not in the bootstrap payload and there is no members table, so every actor this device knows is an id off an envelope. `mapAssignee` may substitute the id for a name on ONE actor it was handed; enumerating a workspace roster out of the ids that happen to appear in the local ledger would invent the membership list itself',
    owner: 'Plan 10 — a replicated roster (bootstrap payload + local schema)',
  },
];

const SEARCH_ABSENCES: readonly ReplicaAbsence[] = [
  {
    field: 'SearchHit.matchedIn',
    because:
      'Replica.searchLocal scans ticket titles and comment bodies and returns one flat {ticketId,title} list; which of the two matched is discarded inside that function, exactly as routes/search.ts destroys it in its query. Reporting `title` for every hit would name the wrong column for every comment match',
    owner: 'Plan 10 — Replica.searchLocal (packages/sync-client), not /v1/search',
  },
  {
    field: 'SearchHit.snippet',
    because:
      'there is no local highlighter; the offline scan is a LIKE over lowercased text and keeps no match offsets. A snippet cut at an arbitrary offset reads as the server\'s ts_headline and is not one',
    owner: 'Plan 10 — Replica.searchLocal',
  },
];

const MY_WORK_ABSENCES: readonly ReplicaAbsence[] = [
  {
    field: 'WorkItem.projectName',
    because: 'no projects table locally — a WorkItem carries the project NAME and this device holds only ids',
    owner: 'Plan 10 — the local schema',
  },
  {
    field: 'ContestedClaim.title',
    because:
      'the contests table stores contestedEventId, ticketId, claimant, rule, reason and the original envelope — no title. It is joinable to `tickets` only when the contested ticket is still in local scope, and a contest survives a purge of its ticket, so the join is not total',
    owner: 'Plan 10 — the contests table / a Replica accessor',
  },
];

const ATTENTION_ABSENCES: readonly ReplicaAbsence[] = [
  {
    field: 'AttentionItem (every kind)',
    because:
      'the attention strip is a COMPUTED read (spec §7, "computed, never authored") whose four buckets are defined by the server sweep — `stale` needs a last-touched horizon nothing local records, `due-soon` needs the server\'s IST day boundary rather than the device\'s clock, and `blocked`/`contested` are the only two this store could answer. Serving two of four under one method name would be an attention strip that silently never warns about the other two',
    owner: 'Plan 10 — a local attention rule set, deliberately not invented here',
  },
];

const PREFERENCES_ABSENCES: readonly ReplicaAbsence[] = [
  {
    field: 'UserPreferences (the whole document)',
    because:
      'amendment 14: preferences are SERVER-OWNED per-user rows and not ledger events, so they are not in the event stream this replica mirrors and there is no preferences table locally. `getPreferences` answering DEFAULT_VIEW_PREFS would be ruling P24\'s exact failure — a default wearing a user\'s authority — and `putPreferences` accepting a write it can never send would lose the choice silently',
    owner: 'Plan 10 — replicating amendment 14 rows (a decision no task owns yet)',
  },
];

/** Every refusal this source makes, so a caller can enumerate them without calling. */
export const REPLICA_GAPS: Readonly<Record<string, readonly ReplicaAbsence[]>> = {
  getMyWorkspaces: MY_WORKSPACES_ABSENCES,
  getMembers: MEMBERS_ABSENCES,
  search: SEARCH_ABSENCES,
  getMyWork: MY_WORK_ABSENCES,
  getAttention: ATTENTION_ABSENCES,
  getPreferences: PREFERENCES_ABSENCES,
  putPreferences: PREFERENCES_ABSENCES,
};

/* ------------------------------------------------------------------ *
 * Reading the local ledger into view models.
 * ------------------------------------------------------------------ */

function titleOf(state: TicketState): string {
  const value = state.fields['title']?.value;
  return typeof value === 'string' ? value : '';
}

/**
 * `actorName` is ALWAYS null here, and `view-types.ts` says what that means:
 * "a null name NEVER means anonymous — rendering falls back to the raw
 * actorId". No roster is replicated (see `MEMBERS_ABSENCES`), so null is the
 * true statement and a substituted id would be a name nobody chose.
 */
function provenanceOf(event: LedgerEvent): ClaimProvenance {
  return {
    actorId: event.actorId,
    actorName: null,
    clientTime: event.clientTime,
    serverTime: event.serverTime,
  };
}

function causeOf(event: LedgerEvent): TransitionCause | null {
  const payload = event.payload;
  if (typeof payload !== 'object' || payload === null) return null;
  const cause = (payload as { cause?: unknown }).cause;
  if (typeof cause !== 'object' || cause === null) return null;
  const record = cause as { kind?: unknown; childTicketId?: unknown };
  if (record.kind !== 'reopened-for-child' || typeof record.childTicketId !== 'string') return null;
  return { kind: 'reopened-for-child', childTicketId: record.childTicketId };
}

/** The claim that put this ticket in the state it is in. */
function stateClaimOf(events: readonly LedgerEvent[]): LedgerEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event === undefined) continue;
    if (event.type === 'ticket.transitioned' || event.type === 'ticket.created') return event;
  }
  return null;
}

function assignedClaimOf(events: readonly LedgerEvent[]): LedgerEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event === undefined) continue;
    if (event.type === 'ticket.assigned') return event;
  }
  return null;
}

/**
 * `{date, claim}` or null. The claim SHAPE is `{date, note?}` — the same object
 * `claims/ticket-dates.ts` reads, and the same `IST_DAY_REGEX` guard, because a
 * half-parsed day rendered as a due date is an invented one.
 */
function dueDateOf(state: TicketState): { date: string; claim: ClaimProvenance } | null {
  const claim = state.fields['dueDate'];
  if (claim === undefined || claim.value === null || claim.value === undefined) return null;
  if (typeof claim.value !== 'object' || Array.isArray(claim.value)) return null;
  const date = (claim.value as { date?: unknown }).date;
  if (typeof date !== 'string' || !IST_DAY_REGEX.test(date)) return null;
  return {
    date,
    claim: { actorId: claim.actorId, actorName: null, clientTime: claim.clientTime, serverTime: claim.serverTime },
  };
}

/**
 * `{id, name: id}` when nothing better is known — the substitution
 * `online/mappers.ts`'s `mapAssignee` already makes, for the reason it gives:
 * "the id is a fact the server sent, and `actorLabel(id, null)` renders it that
 * way everywhere else in this client". It is a DEGRADE on one actor the caller
 * already holds, which is why it is fine here and enumerating a roster is not.
 */
function actorOf(assigneeId: string | null): Actor | null {
  return assigneeId === null ? null : { id: assigneeId, name: assigneeId };
}

export function createReplicaDataSource(deps: ReplicaDataSourceDeps): ReplicaDataSource {
  const { workspaceId: ownWorkspaceId, replica, outbox, engine, storage } = deps;

  async function ticketTypesById(): Promise<Map<string, TicketTypeDef>> {
    const rows = await storage.all('SELECT type_id, def FROM ticket_types');
    return new Map(
      rows.map((row) => [row['type_id'] as string, JSON.parse(row['def'] as string) as TicketTypeDef]),
    );
  }

  /** The workspace's confirmed tickets, keyed by id. Offline-born tickets are NOT here — they are not settled. */
  async function confirmedById(workspaceId: string): Promise<Map<string, TicketState>> {
    const byId = new Map<string, TicketState>();
    for (const ticket of await replica.listTickets(workspaceId)) {
      if (ticket.confirmed !== null) byId.set(ticket.ticketId, ticket.confirmed);
    }
    return byId;
  }

  async function summarise(state: TicketState, contests: readonly LocalContest[]): Promise<TicketSummary> {
    const pending = await outbox.pendingFor(state.id);
    return {
      ticketId: state.id,
      title: titleOf(state),
      stateId: state.stateId,
      stateCategory: state.stateCategory,
      assigneeId: state.assigneeId,
      parentId: state.parentId,
      pending: pending !== null,
      pendingEventIds: pending?.pendingEventIds ?? [],
      openContests: contests.filter((contest) => !contest.resolved).length,
    };
  }

  async function listTicketSummaries(workspaceId: string): Promise<TicketSummary[]> {
    const out: TicketSummary[] = [];
    for (const ticket of await replica.listTickets(workspaceId)) {
      if (ticket.confirmed !== null) out.push(await summarise(ticket.confirmed, ticket.contests));
    }
    // Offline-born tickets exist ONLY as queued claims. They are summarised
    // from the overlay and are ALWAYS badged — `pendingCreatedTickets` is the
    // outbox's own word for "never in any settled listing".
    for (const born of await outbox.pendingCreatedTickets(workspaceId)) {
      const summary = await summarise(born.pending, []);
      out.push({ ...summary, pending: true, pendingEventIds: born.pendingEventIds });
    }
    return out;
  }

  /**
   * `true` only when the parent is genuinely outside this device's scope —
   * never merely undelivered.
   *
   * THE CONFLATION THIS GUARD EXISTS FOR: locally, "the server never sent me
   * this parent because you may not see it" and "the server has not sent it
   * YET" are the same observation. The field names only the first. So the true
   * arm is gated on the engine being caught up, and a device that is still
   * catching up answers `false` — narrower than the truth, following
   * `hierarchy/epic-ancestor.ts`'s own rule: "narrower than the truth is a lane
   * that shows less; wrong about the truth would be a lane that shows the wrong
   * work."
   */
  function restrictedParent(state: TicketState, byId: ReadonlyMap<string, TicketState>): boolean {
    if (state.parentId === null) return false;
    if (engine.status() !== 'live') return false;
    return !byId.has(state.parentId);
  }

  async function rowOf(
    state: TicketState,
    byId: ReadonlyMap<string, TicketState>,
    types: ReadonlyMap<string, TicketTypeDef>,
    isEpicType: (typeId: string) => boolean,
    stateNameOf: (state: TicketState) => string,
    pending: boolean,
  ): Promise<ListRow> {
    const events = await replica.listEntityEvents(state.id);
    const stateClaim = stateClaimOf(events);
    const assigned = assignedClaimOf(events);
    if (stateClaim === null) {
      // Every state a ticket can be in was claimed by exactly one event
      // (`read-models.ts`). A local ticket with no creating or transitioning
      // event in its own log is a corrupt store, and a synthesized provenance
      // would put a claim on screen that nobody made.
      throw new ReplicaGapError('getTickets', [
        {
          field: 'ListRow.stateProvenance',
          because: `no ticket.created or ticket.transitioned event is stored for ${state.id}, so no actor or clock can be named for the state it is in`,
          owner: 'Plan 10 — the local events table',
        },
      ]);
    }
    return {
      ticketId: state.id,
      title: titleOf(state),
      typeId: state.typeId,
      typeRank: types.get(state.typeId)?.rank ?? 0,
      parentId: state.parentId,
      epicId: epicAncestorOf(byId as Map<string, TicketState>, state.id, isEpicType),
      stateId: state.stateId,
      stateName: stateNameOf(state),
      stateCategory: state.stateCategory,
      stateProvenance: provenanceOf(stateClaim),
      assignee: actorOf(state.assigneeId),
      assignedProvenance: assigned === null ? null : provenanceOf(assigned),
      dueDate: dueDateOf(state),
      fields: state.fields,
      // `restrictedCount` is the count of children this viewer may NOT see, and
      // a replica cannot know how many it was not sent. `null` is the type's own
      // word for "no rollup", which under-claims rather than inventing a number
      // — `mapRollup`'s rule, "refuse what cannot happen in production, degrade
      // what can", and an invisible child can happen every time.
      rollup: null,
      hasRestrictedParent: restrictedParent(state, byId),
      pending,
    };
  }

  /**
   * The definition a ticket's state id is written in — its OWN version, not the
   * latest. Reading the name off the latest definition is the `workflowVersion`
   * lie `read-models.ts` names: a column filed under a definition its state was
   * never folded into.
   */
  async function defsFor(states: Iterable<TicketState>): Promise<Map<string, PublishedWorkflowDef>> {
    const wanted = new Map<string, Set<number>>();
    for (const state of states) {
      const versions = wanted.get(state.workflowId) ?? new Set<number>();
      versions.add(state.workflowVersion);
      wanted.set(state.workflowId, versions);
    }
    const defs = new Map<string, PublishedWorkflowDef>();
    for (const [workflowId, versions] of wanted) {
      const lookup = await workflowVersionsOf(storage, workflowId);
      for (const version of versions) {
        const def = lookup(version);
        if (def !== null) defs.set(`${workflowId}@${String(version)}`, def);
      }
    }
    return defs;
  }

  function stateNameFrom(defs: ReadonlyMap<string, PublishedWorkflowDef>): (state: TicketState) => string {
    return (state) => {
      const def = defs.get(`${state.workflowId}@${String(state.workflowVersion)}`);
      const named = def?.states.find((s) => s.id === state.stateId);
      // A state its own published definition does not name is the straggler
      // case (`routes/board.ts`): the bare id, because there is no definition
      // to read a human name from and inventing one prints a label nobody
      // authored.
      return named?.name ?? state.stateId;
    };
  }

  const query: DataSourceQuery & ReplicaOnlyQuery = {
    getMyWorkspaces: () => Promise.reject(new ReplicaGapError('getMyWorkspaces', MY_WORKSPACES_ABSENCES)),
    getMembers: () => Promise.reject(new ReplicaGapError('getMembers', MEMBERS_ABSENCES)),
    getMyWork: () => Promise.reject(new ReplicaGapError('getMyWork', MY_WORK_ABSENCES)),
    getAttention: () => Promise.reject(new ReplicaGapError('getAttention', ATTENTION_ABSENCES)),
    getPreferences: () => Promise.reject(new ReplicaGapError('getPreferences', PREFERENCES_ABSENCES)),
    putPreferences: () => Promise.reject(new ReplicaGapError('putPreferences', PREFERENCES_ABSENCES)),
    search: () => Promise.reject(new ReplicaGapError('search', SEARCH_ABSENCES)),

    /**
     * `grouping` is READ AND NOT USED, and that is the shipped view type rather
     * than an omission: `TicketListView` is `{projectId, rows}` — a flat row set
     * — and `views/list-model.ts`'s `groupRows` partitions it client-side. The
     * online source passes `groupBy` to the route only because the route insists
     * on one. Nothing local needs it.
     */
    async getTickets(projectId: string, filter: FilterSpec, _grouping: Grouping): Promise<TicketListView> {
      const byId = await confirmedById(ownWorkspaceId);
      const types = await ticketTypesById();
      const epicTypeIds = new Set(
        [...types.values()].filter((type) => type.rank === EPIC_RANK).map((type) => type.id),
      );
      // The workspace's OWN rank-1 types, which is the server's rule
      // (`routes/list.ts` groups by `rank = EPIC_RANK`) rather than
      // `isBuiltinEpicType`'s narrower built-in-id test. The roster is local,
      // so this client can agree with the server exactly.
      const isEpicType = (typeId: string): boolean => epicTypeIds.has(typeId);
      const inProject = [...byId.values()].filter((state) => state.projectId === projectId);
      const defs = await defsFor(inProject);
      const stateNameOf = stateNameFrom(defs);
      const rows: ListRow[] = [];
      for (const state of inProject) {
        if (!matchesFilter(state, filter)) continue;
        const pending = await outbox.pendingFor(state.id);
        rows.push(await rowOf(state, byId, types, isEpicType, stateNameOf, pending !== null));
      }
      // Offline-born tickets: they are the claim, so they are always badged.
      for (const born of await outbox.pendingCreatedTickets(ownWorkspaceId)) {
        if (born.pending.projectId !== projectId) continue;
        if (!matchesFilter(born.pending, filter)) continue;
        const bornDefs = await defsFor([born.pending]);
        rows.push(
          await rowOf(born.pending, byId, types, isEpicType, stateNameFrom(bornDefs), true),
        );
      }
      return { projectId, rows };
    },

    async getBoard(projectId: string): Promise<BoardView> {
      const byId = await confirmedById(ownWorkspaceId);
      const inProject = [...byId.values()].filter((state) => state.projectId === projectId);
      const defs = await defsFor(inProject);
      const pendingIds = new Set<string>();
      for (const state of inProject) {
        if ((await outbox.pendingFor(state.id)) !== null) pendingIds.add(state.id);
      }

      async function cardOf(state: TicketState) {
        const events = await replica.listEntityEvents(state.id);
        const claim = stateClaimOf(events);
        if (claim === null) {
          throw new ReplicaGapError('getBoard', [
            {
              field: 'BoardCard.stateProvenance',
              because: `no ticket.created or ticket.transitioned event is stored for ${state.id}`,
              owner: 'Plan 10 — the local events table',
            },
          ]);
        }
        return {
          ticketId: state.id,
          title: titleOf(state),
          typeId: state.typeId,
          assignee: actorOf(state.assigneeId),
          stateProvenance: provenanceOf(claim),
          cause: causeOf(claim),
          rollup: null,
          pending: pendingIds.has(state.id),
        };
      }

      // Group by (workflowId, workflowVersion) — `views/board.tsx` keys each
      // group `${workflowId}@${workflowVersion}`, so two columns sharing a group
      // ASSERT they came from one published definition.
      const groups = new Map<string, BoardGroup>();
      const stragglers = new Map<string, BoardColumn>();
      for (const state of inProject) {
        const key = `${state.workflowId}@${String(state.workflowVersion)}`;
        const def = defs.get(key);
        const card = await cardOf(state);
        const column = def?.states.find((s) => s.id === state.stateId);
        if (def === undefined || column === undefined) {
          // The straggler convention, copied from `routes/board.ts` rather than
          // re-decided: `workflowVersion: 0` (which `workflowDefSchema`'s
          // `min(1)` means no publisher can mint), the bare state id as the
          // name, and `blocked: false` — the flag lives on a definition and
          // there is none.
          const strayKey = `${state.workflowId}:${state.stateId}`;
          const existing = stragglers.get(strayKey);
          if (existing === undefined) {
            stragglers.set(strayKey, {
              stateId: state.stateId,
              name: state.stateId,
              category: state.stateCategory,
              blocked: false,
              cards: [card],
            });
          } else {
            existing.cards.push(card);
          }
          continue;
        }
        let group = groups.get(key);
        if (group === undefined) {
          group = {
            workflowId: def.id,
            workflowVersion: def.version,
            workflowName: def.name,
            // Columns are exactly the attached workflow's states, never
            // invented, and in the definition's own order.
            columns: def.states.map((s) => ({
              stateId: s.id,
              name: s.name,
              category: s.category,
              blocked: s.blocked === true,
              cards: [],
            })),
          };
          groups.set(key, group);
        }
        group.columns.find((c) => c.stateId === state.stateId)?.cards.push(card);
      }

      const out = [...groups.values()];
      if (stragglers.size > 0) {
        const latest = await replica.buildDeps();
        for (const [strayKey, column] of [...stragglers.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
          const workflowId = strayKey.slice(0, strayKey.lastIndexOf(':'));
          out.push({
            workflowId,
            workflowVersion: 0,
            workflowName: latest.getWorkflow(workflowId)?.name ?? workflowId,
            columns: [column],
          });
        }
      }
      return { projectId, groups: out };
    },

    async getTicket(workspaceId: string, ticketId: string): Promise<TicketRead | null> {
      const ticket = await replica.getTicket(ticketId);
      if (ticket === null || ticket.confirmed === null) return null;
      const state = ticket.confirmed;
      if (state.workspaceId !== workspaceId) return null;
      const events = await replica.listEntityEvents(ticketId);
      const claim = stateClaimOf(events);
      if (claim === null) {
        throw new ReplicaGapError('getTicket', [
          {
            field: 'TicketRead.stateProvenance',
            because: `no ticket.created or ticket.transitioned event is stored for ${ticketId}`,
            owner: 'Plan 10 — the local events table',
          },
        ]);
      }
      let parent: ParentRef = null;
      if (state.parentId !== null) {
        const found = await replica.getTicket(state.parentId);
        parent =
          found?.confirmed != null
            ? { kind: 'ticket', id: state.parentId, title: titleOf(found.confirmed) }
            : // Existence without a title — the shape Plan 4's read uses for a
              // parent this viewer may not have. Locally it also covers "not
              // delivered yet", which `restrictedParent` gates for the list; the
              // union has no third arm and inventing one is a type change, so
              // the conservative arm is the one that claims LESS about the
              // ticket itself.
              { kind: 'restricted', id: state.parentId };
      }
      return { ticket: state, title: titleOf(state), stateProvenance: provenanceOf(claim), parent, rollup: null };
    },

    async getTicketHistory(ticketId: string, afterSeq?: number, limit?: number): Promise<TicketHistoryEvent[]> {
      const events = await replica.listEntityEvents(ticketId);
      const after = afterSeq ?? 0;
      const kept = events
        .filter((event) => event.seq > after)
        .map((event) => ({
          id: event.id,
          type: event.type,
          version: event.version,
          payload: event.payload,
          actorId: event.actorId,
          origin: event.origin,
          clientTime: event.clientTime,
          serverTime: event.serverTime,
          seq: event.seq,
        }));
      return limit === undefined ? kept : kept.slice(0, limit);
    },

    async getWorkflowDef(workspaceId: string, workflowId: string, version?: number): Promise<WorkflowDef | null> {
      if (workspaceId !== ownWorkspaceId) return null;
      if (version === undefined) return (await replica.buildDeps()).getWorkflow(workflowId) ?? null;
      return (await workflowVersionsOf(storage, workflowId))(version);
    },

    async getTicketTypes(workspaceId: string): Promise<TicketTypeDef[]> {
      if (workspaceId !== ownWorkspaceId) return [];
      // `readTicketTypes` orders by rank then id; the local roster answers the
      // same order so a picker fed from either source lists the same ladder.
      return [...(await ticketTypesById()).values()].sort(
        (a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    },

    listTicketSummaries,

    async getTicketWithPending(ticketId) {
      const confirmed = await replica.getTicket(ticketId);
      const pending = await outbox.pendingFor(ticketId);
      if (confirmed === null && pending === null) return null;
      return {
        ticketId,
        confirmed: confirmed?.confirmed ?? null,
        contests: confirmed?.contests ?? [],
        pending,
      };
    },

    listContests: (workspaceId, filter) => replica.listContests(workspaceId, filter),

    async myWork(workspaceId, userId) {
      const all = await listTicketSummaries(workspaceId);
      return {
        assigned: all.filter((summary) => summary.assigneeId === userId),
        claimsInTransit: all.filter((summary) => summary.pending),
        contested: await replica.listContests(workspaceId, { claimantId: userId, open: true }),
      };
    },

    async searchOfflineCopy(workspaceId, text) {
      return { offlineCopy: true, hits: await replica.searchLocal(workspaceId, text) };
    },

    async syncStatus(workspaceId) {
      return {
        status: engine.status(),
        queued: await outbox.queuedCount(workspaceId),
        failed: (await outbox.failedItems(workspaceId)).length,
      };
    },
  };

  return {
    /**
     * Pre-check, then queue — and answer only what is true.
     *
     * A refusal is a real `IngestResult`: the local pre-check runs the SAME rule
     * engine the server runs, so `{status:'refused', rule, reason}` is the
     * server's own answer arriving early, and nothing is queued. Anything
     * accepted is queued and UNANSWERED, which no arm of `IngestResult` can
     * say — so this throws `OfflineAcceptError` rather than picking an arm.
     *
     * It follows that **this method can never return `committed`**, under any
     * input, which is the plan's honesty pin turned into a property a test can
     * pin rather than a promise a reviewer has to check.
     */
    async ingest(events: SubmittedEvent[]): Promise<IngestResult[]> {
      const results: LocalIngestResult[] = [];
      for (const event of events) {
        const outcome = await outbox.enqueue(event);
        results.push(
          outcome.queued
            ? { status: 'pending', eventId: outcome.eventId }
            : { status: 'refused', eventId: event.id, rule: outcome.rule, reason: outcome.reason },
        );
      }
      // Opportunistic: sends now when the engine is live. Deliberately not
      // awaited — an `ingest` that waited on a socket would answer at network
      // speed on the one path an offline client exists to make instant, and the
      // outbox already owns ordering and retry.
      void engine.flush().catch(() => undefined);
      if (results.some((result) => result.status === 'pending')) throw new OfflineAcceptError(results);
      return results as IngestResult[];
    },

    query,

    /**
     * Real frames, filtered to this subscription's workspace.
     *
     * ## Why this is not a bare change signal
     *
     * The plan's snippet is `cb: () => void` and the executor ruling forbids it:
     * `DataSource.subscribe` carries the 5-kind `StreamItem`, and
     * `views/use-live-query.ts` **re-queries only on `event` and `purge`**. A
     * replica whose `subscribe` emitted anything else — or a synthesized
     * `caught-up` in place of the item — would leave every app-core view frozen
     * against the offline source while looking wired up. That is the failure the
     * interchangeability clause exists to prevent, and it would surface as
     * "the offline app does not refresh", not as a type error.
     *
     * So the items come from the ENGINE, which is the component that actually
     * receives frames, and each is the one the replica just applied.
     *
     * ## Two kinds are not emitted, and neither is invented
     *
     * - `error`: the engine keeps the server's amendment-19 error frame in
     *   `lastError()` and does not re-broadcast it. Emitting one here would
     *   require choosing a moment the engine never named.
     * - a PROJECT-scoped `scope-revoked`: `StreamItem` declares
     *   `projectId?: never` where `ScopeRevokedInstruction` admits a string, so
     *   the narrower client type cannot express it. The wire cannot carry one
     *   today (`ServerStreamFrame` says `projectId?: never` too), and the
     *   instruction still reaches the REPLICA through the engine — only this
     *   view of it is silent.
     *
     * `afterSeq` is accepted and unused: the engine owns the cursor and resumes
     * from `replica.getCursor`. A second cursor here would be a second opinion
     * about where this device is.
     */
    subscribe(workspaceId: string, _afterSeq: number, cb: (item: StreamItem) => void): Unsubscribe {
      const offItem = engine.onItem((item) => {
        if (!isSyncInstruction(item)) {
          if (item.workspaceId === workspaceId) cb({ type: 'event', envelope: item });
          return;
        }
        if (item.kind === 'purge') {
          // `PurgeInstruction` carries no workspaceId — it arrived on THIS
          // subscription's stream, which is where the id comes from.
          cb({ type: 'purge', workspaceId, entityId: item.entityId });
          return;
        }
        if (item.workspaceId === workspaceId && item.projectId === undefined) {
          cb({ type: 'scope-revoked', workspaceId });
        }
      });
      const offStatus = engine.onStatus((status) => {
        // `live` is set immediately after the cursor is written, so the value
        // read back IS the seq the server's caught-up frame named. Not
        // synthesized: the engine reached caught-up, and this reports it.
        if (status !== 'live') return;
        void replica
          .getCursor(workspaceId)
          .then((seq) => {
            cb({ type: 'caught-up', workspaceId, seq });
          })
          .catch(() => undefined);
      });
      return () => {
        offItem();
        offStatus();
      };
    },
  };
}
