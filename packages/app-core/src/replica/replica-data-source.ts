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
import { BACKLOG_STATE_ID, IST_DAY_REGEX, statesWithBacklog } from '@gisik-nokma/domain';
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
  type SnapshotProvenanceBlock,
} from '@gisik-nokma/sync-client';
import type { DataSource, DataSourceQuery, ServerStreamFrame, Unsubscribe } from '../data-source.js';
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
 * departure from it — though **the count this sentence used to carry is now
 * ZERO**. It read *"six of thirteen ONLINE query methods throw `ServingGapError`
 * on their normal path (`online/mappers.ts`), and three views cite that refusal
 * by name."* **⚠ CORRECTED 2026-09-20:** the number fell 6 → 4 (P25 clause 1
 * served `getTickets`/`getTicket`) → 3 (P32/P38) → 1 (P39/P40) → **0** when
 * `search` was served on 2026-09-19, and `SERVING_GAPS` is now empty. This class
 * is therefore the LAST holder of that pattern, not one instance of it. `results` is index-aligned with the submitted
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
  /**
   * Present so a project-scoped surface can filter these without a second read.
   * It was ABSENT while every consumer was workspace-scoped, and `summarise`
   * always had it — the value comes off `TicketState.projectId`, which the
   * overlay fills for an offline-born ticket from the creating claim itself.
   * An omission rather than a fact, which is why adding it invents nothing.
   */
  projectId: string;
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
 * ONE PROJECT LIST WITH BOTH KINDS IN IT, and the two kinds stay DISTINGUISHABLE
 * rather than being flattened into one row shape.
 *
 * A settled ticket is a `ListRow`. An offline-born one CANNOT be: `ListRow`
 * requires a `stateProvenance` and `ClaimProvenance` requires a `serverTime`,
 * and a ticket that exists only as a queued claim has none — `SubmittedEvent`
 * omits `serverTime` and `seq` by construction, because they are the server's to
 * assign and nothing has assigned them.
 *
 * **THIS IS THE OPPOSITE ANSWER TO RULING P36, on the same surface, and the
 * distinction is the whole reason both can be right.** P36 widens the snapshot
 * to carry a state claim's `serverTime` because *the instant exists* — the
 * ledger row at that seq recorded one and the writer merely dropped it, so
 * copying it is recovery and not invention. Here NO row anywhere recorded an
 * instant: the claim has not reached a server. So the offline-born ticket is
 * rendered AS A CLAIM rather than as a row missing a field, and the device clock
 * `buildPendingOverlay` substitutes inside its own fold is not laundered into a
 * `stateProvenance` that every consumer reads as the server's answer. Reading
 * P36 as licence to fill this one in would reintroduce precisely the fabrication
 * P36 refused in writing.
 */
export type OfflineListEntry =
  | { kind: 'settled'; row: ListRow }
  | { kind: 'offline-born'; summary: TicketSummary };

/**
 * The replica-only half of the query surface — the facts an offline device has
 * and `DataSourceQuery` has no method for.
 *
 * Every member here is ADDITIVE. `ReplicaDataSource` is a structural SUPERSET
 * of `DataSource`, so a view's READ path runs unchanged against this one; these
 * are what a view written FOR the offline shells can ask on top.
 *
 * THE WRITE DOOR IS NOT UNCHANGED, and this sentence used to say it was.
 * `Features.md` §12 carried the qualification and this docblock did not — the
 * correction itself landed on one door of a pair, which is this codebase's
 * signature defect. `ingest` THROWS `OfflineAcceptError` where the online
 * source returns an `IngestResult[]`, so the call sites `Features.md` §12
 * enumerates see a rejection where they saw an array. Assignability is a
 * compile-time fact (12.172); "runs unchanged" is a claim about behaviour and
 * it is true of reads alone.
 *
 * **THE COUNT IS DELIBERATELY NOT REPEATED HERE, and that is the second half of
 * the same correction.** It read "the six call sites" until 2026-09-20 — a
 * fossil of an enumeration §12 has since re-measured from the grep it
 * publishes, and §12's own text records that number as one it had already
 * disowned. The figure then moved twice more inside a single day as two call
 * sites landed. **A number one hop from its own authority is a reading that
 * expires**, so §12 and `test-cases/12-offline-sync-apps.md` carry it WITH the
 * command that produces it and this sentence names the authority and stops.
 */
export type ReplicaOnlyQuery = {
  /** Confirmed tickets plus offline-born ones, every one badged. */
  listTicketSummaries(workspaceId: string): Promise<TicketSummary[]>;
  /**
   * The settled list PLUS the tickets born on this device, in one answer, each
   * tagged with which kind it is. `getTickets` alone omits the second kind
   * SILENTLY (`OFFLINE_BORN_ABSENCE`), which on a plane is the ticket you just
   * made vanishing from the only list you can see.
   */
  listProjectWithOfflineBorn(
    projectId: string,
    filter: FilterSpec,
    grouping: Grouping,
  ): Promise<{ projectId: string; entries: OfflineListEntry[] }>;
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
   *
   * OFFLINE-BORN TICKETS ARE IN THESE HITS, unlike `getTickets` and `getBoard`.
   * A hit is `{ticketId, title}` and carries no `stateProvenance`, so the type
   * argument that keeps a queued claim out of a `ListRow` does not reach here —
   * and the door exists precisely so a device with no network can answer. A
   * ticket created on a plane that cannot be found by its own title is the
   * failure this method exists to prevent. Case 12.188.
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
 * The refusals — enumerated in `REPLICA_GAPS` below, and the count is
 * deliberately NOT restated here.
 *
 * **⚠ CORRECTED 2026-09-20, and this is the THIRD copy of one false sentence.**
 * It read *"Seven of the thirteen, and NOT the online source's seven"*, and both
 * numbers were stale: this registry has carried **nine** members since the
 * attachments read joined it, and the online source refuses **none** — its
 * register emptied on 2026-09-19, which `Features.md`'s own correction records.
 * The other two copies live in `Features.md` and `test-cases/12-offline-sync-apps.md`
 * and were corrected first; this one sits 84 lines above the entry this change
 * added, in a file this change edits, and was missed — which is the lesson
 * 12.185 is written around: **the count is a reading, the enumerable list is the
 * artifact.** Do not restore a number here.
 * ------------------------------------------------------------------ */

const NO_WORKSPACE_TABLE: ReplicaAbsence = {
  field: 'WorkspaceRef.name / .memberCount / .projects — each project carrying a name, archived, and two counts',
  because:
    'the local schema (packages/sync-client/src/storage/schema.ts) has no workspaces table and no projects table — bootstrap ships definitions, tickets and `me`, and `Me` carries bare project IDS with no names. A nav rendering an id where a name goes is a nav naming something nobody authored. Task 16 widened the shape rather than this absence: `memberCount` needs a roster this device does not hold, and `archived` plus the two per-project counts need the projects table named above. The counts could NOT be honestly computed from the local ticket set even so — they are VISIBILITY-SCOPED server-side, and a replica holds only what was already visible, so counting locally would answer a different question in the same field',
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

/**
 * Second wave, Task 6. The local store DOES mirror the ledger the settings live
 * in, so unlike the attention strip this is a real "could be built" rather than
 * a "cannot be known" — which is exactly why the absence is spelled out rather
 * than left to a default, and why the owner is named.
 *
 * The blocker is the fold, not the data: `workspace.settings_set` is a
 * workspace-entity event, and this replica's local projections are ticket-shaped
 * — nothing here reduces workspace events into a settings row, and
 * `proj_workspace_settings`'s reader applies the domain's defaults where a value
 * was never claimed. Reproducing that here means reproducing the defaults AND
 * the present-versus-null distinction the column's CASE carries, which is a
 * second implementation of the rule rather than a second reader of it. Answering
 * `autoCloseAfterDays: null` for a workspace that claimed 30 would be a settings
 * screen showing "off" for something that is on.
 */
const WORKSPACE_SETTINGS_ABSENCES: readonly ReplicaAbsence[] = [
  {
    field: 'WorkspaceSettings (all three knobs and the provenance)',
    because:
      'the local replica has no workspace-settings fold — `workspace.settings_set` is a workspace-entity event and every local projection here is ticket-shaped, so there is no row to read. Serving the defaults instead would be indistinguishable from a workspace that really claimed them, and `autoCloseAfterDays: null` is a CLAIM ("off") as well as the default, so a replica answering null would show "off" for a workspace that turned auto-close ON',
    owner: 'Plan 10 — a local workspace-settings fold, deliberately not invented here',
  },
];

/**
 * The attachments read — the refusal here whose tempting alternative is
 * DERIVABLE FROM DATA THIS DEVICE ALREADY HOLDS, which is why it is spelled out
 * rather than left to a default.
 *
 * **⚠ CORRECTED 2026-09-20: this read "the one refusal here that had a tempting
 * alternative", and it is not the only one** — `WORKSPACE_SETTINGS_ABSENCES`
 * above says of itself that it is *"a real 'could be built' rather than a
 * 'cannot be known'"*, and `ATTENTION_ABSENCES` names a tempting partial. What
 * is particular here is the KIND of temptation: not a missing fold or a missing
 * table, but a list that could be computed on the spot from the local ledger
 * and would be wrong in both directions.
 *
 * The local store DOES mirror the ledger, and `attachment.added` is one of the
 * two ticket event types the replica's own reducer folds
 * (`sync-client/src/replica/replica.ts:439`), so a list of this ticket's
 * attachments looks derivable on the spot. It is not the same list. The route
 * this method stands beside reads the `attachments` TABLE: a row is written by
 * the upload door when the bytes land, while the event naming it is the
 * CLIENT's claim about those bytes — a different fact with a different writer
 * (`apps/server/src/routes/attachments.ts`: "This endpoint appends NOTHING to
 * the ledger"). So a ledger-derived list would omit an upload whose event never
 * arrived and include one whose upload failed — a second, weaker answer to
 * "what files does this ticket have", which is the failure this codebase
 * refuses by name. A refusal with an owner beats a plausible list.
 */
/**
 * The comment thread — the SECOND refusal whose tempting alternative is
 * DERIVABLE FROM DATA THIS DEVICE ALREADY HOLDS, and the temptation here is
 * stronger than the attachments one, which is why it is spelled out.
 *
 * `comment.added` IS one of the ticket event types the replica's own reducer
 * folds, and unlike an attachment — where the ROW and the EVENT are two facts
 * with two writers — a comment IS its event. So the thread's text is genuinely
 * derivable here, and refusing the whole read costs an offline user something
 * real. That is not the question this refusal answers. The question is whether
 * a comment can be served WITHOUT ITS FILES, because:
 *
 *  - a comment's files are the attachments its own document embeds, resolved
 *    against the `attachments` table (`apps/server/src/read/ticket-comments.ts`);
 *  - the replica holds no such table — the same fact `ATTACHMENTS_ABSENCES`
 *    below records, for the same reason;
 *  - and the thread renderer draws the body through `docToPlainText`, which
 *    renders an `image` node as NOTHING (`packages/domain/src/doc-text.ts`).
 *
 * Composed, those three mean a ledger-derived thread would draw a comment with
 * an image in it as a comment with no file at all — the exact absence-drawn-as-
 * a-fact this codebase refuses by name, and the reason the server carries an
 * id-only fallback rather than dropping an unresolvable attachment.
 *
 * ## What is NOT the reason, said plainly
 *
 * Not "the bodies might be stale": the replica's thread would be as current as
 * its log, which is the ordinary offline promise. Not "a fold is missing":
 * there is nothing here to fold. It is the files, and only the files.
 *
 * ## The named owner, and the shape that would unblock it
 *
 * A `comments` read is unblocked by the SAME work `ATTACHMENTS_ABSENCES` names —
 * an attachments table in the local schema, shipped in the bootstrap payload and
 * kept by sync. This refusal and that one have one fix between them, which is
 * worth knowing before either is attempted alone.
 */
const COMMENTS_ABSENCES: readonly ReplicaAbsence[] = [
  {
    field: 'TicketComment (the whole thread, including the body)',
    because:
      'a comment’s FILES are resolved against the server’s `attachments` table, which does not exist locally, and the renderer draws an image node as nothing — so a thread derived from the local ledger would draw a comment that embeds a file as a comment with no file, indistinguishably from one that embeds none. The bodies alone are derivable; the attribution is not, and serving the derivable half would state the underivable half as absent',
    owner: 'Plan 10 — an attachments table in the local schema (bootstrap payload + sync), the same fix `getTicketAttachments` names',
  },
];

const ATTACHMENTS_ABSENCES: readonly ReplicaAbsence[] = [
  {
    field: 'AttachmentListEntry (the whole list, both arms)',
    because:
      'no attachments table exists locally — the rows live in a server table the upload door writes and the bootstrap payload does not ship. The `attachment.added` event is a DIFFERENT fact with a different writer: the row exists the moment bytes land, while the event is the client\'s claim about them, `routes/attachments.ts` says it expects that claim afterwards and `Features.md` §9 records the web client does not post it today. Deriving the list from the local ledger would omit an upload whose event never arrived and include an event whose upload failed, in the same field, indistinguishably',
    owner: 'Plan 10 — an attachments table in the local schema (bootstrap payload + sync), not a /v1 route',
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

/**
 * WHY A TICKET BORN OFFLINE IS IN SOME DOORS AND NOT OTHERS.
 *
 * **THIS DOCBLOCK SAID "ALL THREE DOORS" AND THERE ARE NINE READINGS.** The
 * three it named were the three the author had looked at; a probe over every
 * read door found `searchOfflineCopy` omitting an offline-born ticket with no
 * absence anywhere naming it — a user creating a ticket on a plane and unable
 * to find it by title, on the door that exists so an offline device can answer.
 * That omission is now FIXED (`searchOfflineCopy` unions the outbox; case
 * 12.188) rather than documented. Do not restore a count here: case 12.188's
 * sibling 12.187 enumerates every door by name and asserts what each answers,
 * and `OFFLINE_BORN_OMISSIONS` below is the enumerable half of the same list.
 *
 * This is a whole-row absence rather than a whole-method refusal, so it is
 * stated here loudly rather than thrown: *"a card silently missing from a board
 * is a lie with a longer fuse"* (`routes/board.ts`), and the way it stops being
 * silent is that 12.187 asserts every door together.
 *
 * `ListRow` and `BoardCard` both require a `stateProvenance`, and
 * `ClaimProvenance` requires a `serverTime`. A ticket that exists only as a
 * queued claim has none: `SubmittedEvent` omits `serverTime` and `seq` by
 * construction because they are the server's to assign, and nothing has
 * assigned them. `buildPendingOverlay` DOES fold such a ticket, and it fills
 * `serverTime: submitted.clientTime` — a substitution it documents at the point
 * it makes it ("the device clock is what this claim honestly has"). Repeating
 * that substitution HERE would launder a device clock into a row whose
 * `stateProvenance` reads, to every consumer, as the server's answer — the same
 * shape as the `committed` this source refuses to say about the same claim.
 *
 * `TicketSummary` is the door that exists for these tickets, and it carries no
 * provenance field at all — which is the plan's design rather than an omission.
 * `outbox.ts` states the invariant these two methods are keeping: tickets that
 * exist only as queued claims are "never in any settled listing".
 *
 * RECORDED, NOT FIXED: an offline shell that wants one project list containing
 * both must union `getTickets` with `listTicketSummaries` and render the second
 * kind as claims. OWNER: **Lane A, closure 2b** (Ruling P34, 2026-09-06).
 *
 * This read "Plan 10 Task 13" until P34. Task 13 shipped the contested-claim
 * banner, the reopen-pair builder, the skew badge and the sync strip — no
 * ticket list among them — so the old owner named the next task touching
 * app-core UX by NUMBER rather than by content, and Task 13 could not have
 * discharged it without inventing a surface no plan specifies.
 */
export const OFFLINE_BORN_ABSENCE: ReplicaAbsence = {
  // THE THIRD NAME WAS MISSING AND IS THE SAME ARGUMENT: `getTicket` returns
  // `null` for exactly these tickets, because `TicketRead.stateProvenance` is
  // as unfillable as the two view-row fields. An absence value whose whole
  // purpose is to be the enumerable name of a gap was itself under-enumerated.
  field:
    'ListRow.stateProvenance / BoardCard.stateProvenance / TicketRead.stateProvenance (for a ticket that exists only as a queued claim)',
  because:
    'ClaimProvenance requires a serverTime and a SubmittedEvent has none by construction; the pending overlay substitutes the device clock and says so, and repeating that substitution in a view row would read as the server\'s answer',
  // The docblock above was moved to Lane A / closure 2b by ruling P34 and THIS
  // FIELD was not, so the entry contradicted itself: prose naming one owner, the
  // enumerable datum naming the task P34 had just established could not
  // discharge it. The field is the half a tool reads.
  owner:
    'Lane A, closure 2b (ruling P34) — an offline list that unions getTickets with listTicketSummaries and renders the second kind as claims',
};

/**
 * The doors that OMIT an offline-born ticket, keyed by method, so a caller can
 * enumerate them without calling — the same purpose `REPLICA_GAPS` serves for
 * the methods that REFUSE, and deliberately a second export rather than an
 * entry in that one: `REPLICA_GAPS`'s members all throw `ReplicaGapError`, and
 * 12.185 compares its keys against the methods that actually reject. A door
 * that answers with the ticket left out is a different thing from a door that
 * refuses, and merging the two would make each key mean whichever the reader
 * assumed.
 *
 * `getTicketHistory` IS NOT HERE, and its emptiness is not an absence. There
 * are no ledger events for a ticket no server has seen, so `[]` is the true
 * answer rather than an unfillable field — `outbox.ts` writes nothing to
 * `events` by design. Minting an absence for a true answer would turn this
 * registry from "the fields this source cannot fill" into "anything that came
 * back empty", which is worth less than nothing to enumerate. 12.187 asserts
 * the empty history anyway, beside the doors that do omit.
 *
 * `searchOfflineCopy` is not here either, and used to belong here: it omitted
 * these tickets and nothing named the omission. It now carries them (12.188).
 */
export const OFFLINE_BORN_OMISSIONS: Readonly<Record<string, ReplicaAbsence>> = {
  getTickets: OFFLINE_BORN_ABSENCE,
  getBoard: OFFLINE_BORN_ABSENCE,
  getTicket: OFFLINE_BORN_ABSENCE,
};

/** Every refusal this source makes, so a caller can enumerate them without calling. */
export const REPLICA_GAPS: Readonly<Record<string, readonly ReplicaAbsence[]>> = {
  getMyWorkspaces: MY_WORKSPACES_ABSENCES,
  getMembers: MEMBERS_ABSENCES,
  getTicketAttachments: ATTACHMENTS_ABSENCES,
  getTicketComments: COMMENTS_ABSENCES,
  search: SEARCH_ABSENCES,
  getMyWork: MY_WORK_ABSENCES,
  getAttention: ATTENTION_ABSENCES,
  getWorkspaceSettings: WORKSPACE_SETTINGS_ABSENCES,
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
/**
 * The state and assignment claims for one ticket: from its own events when it
 * has them, and OTHERWISE from the snapshot block the bootstrap delivered.
 *
 * The fallback is not a second-best. A snapshot-bounded device ships no events
 * below the snapshot's seq, so on a fresh device the creating and transitioning
 * events are absent for nearly every ticket — that is the design of the
 * bootstrap, not a gap in it, and reading the events first would refuse almost
 * everything (the defect ruling P36 exists to close).
 *
 * Neither branch invents anything. The events branch reads the row that made the
 * claim; the snapshot branch reads a value the SERVER copied off that same row
 * before dropping the events. `null` from both means the device genuinely cannot
 * name the claim — a store with neither events nor a delivered block — and the
 * caller still refuses, which is the answer it gave before this fallback existed.
 */
async function claimsFor(
  ticketId: string,
  events: readonly LedgerEvent[],
  assigneeId: string | null,
  // Passed in rather than closed over, so this stays a module-scope function
  // that a test can drive without standing up a whole data source.
  getBlock: (id: string) => Promise<SnapshotProvenanceBlock | null>,
): Promise<{ state: ClaimProvenance; assigned: ClaimProvenance | null } | null> {
  const stateEvent = stateClaimOf(events);
  const assignedEvent = assignedClaimOf(events);

  // THE TWO CLAIMS ARE RESOLVED INDEPENDENTLY, and the first draft did not do
  // this. It branched once on the STATE event and took the block for BOTH
  // claims when there was none — so on the ordinary fresh-device path (a
  // snapshot-bounded bootstrap ships neither `ticket.created`/`.transitioned`
  // NOR `ticket.assigned` below the line, then one streamed `ticket.assigned`
  // arrives) the door served the snapshot's OLD assignment claim beside the
  // NEW assignee. A stale actor and a stale instant, rendered as the claim that
  // produced the current assignment, and used as the My Work sort key.
  //
  // The old code re-checked only NULLNESS — `assigneeId === null ||
  // block.assigned === null` — and its comment claimed to catch drift "if a
  // local fold has moved the assignment on". Move-to-null it caught;
  // move-to-a-different-assignee, the drift it named, it did not. **A guard
  // that checks whether a value exists is not checking whether it is the right
  // value**, and a comment saying otherwise made the gap read as covered.
  //
  // Each claim now prefers its OWN local event and falls back to the block
  // independently, so a newer local claim always wins over an older shipped one
  // — which is the only ordering that cannot serve a stale attribution.
  let block: SnapshotProvenanceBlock | null | undefined;
  const fromBlock = (c: { actorId: string; clientTime: string; serverTime: string }): ClaimProvenance => ({
    actorId: c.actorId,
    // `null` for the same reason `provenanceOf` gives: this client resolves
    // display names from the roster, never from a stored copy that can go stale.
    actorName: null,
    clientTime: c.clientTime,
    serverTime: c.serverTime,
  });
  const loadBlock = async (): Promise<SnapshotProvenanceBlock | null> => {
    // Read at most once even though both claims may want it.
    if (block === undefined) block = await getBlock(ticketId);
    return block;
  };

  let state: ClaimProvenance;
  if (stateEvent !== null) {
    state = provenanceOf(stateEvent);
  } else {
    const carried = (await loadBlock())?.state ?? null;
    // Neither the events nor a delivered block: the device genuinely cannot
    // name who put this ticket in its state. The caller refuses, which is the
    // answer it gave before this fallback existed.
    if (carried === null) return null;
    state = fromBlock(carried);
  }

  let assigned: ClaimProvenance | null = null;
  if (assigneeId !== null) {
    if (assignedEvent !== null) {
      assigned = provenanceOf(assignedEvent);
    } else {
      const carried = (await loadBlock())?.assigned ?? null;
      assigned = carried === null ? null : fromBlock(carried);
    }
  }
  // `assigneeId === null` short-circuits to `null` above: nobody is assigned, so
  // there is no claim to name, and that is a FACT rather than a lost value.
  return { state, assigned };
}

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
      projectId: state.projectId,
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
      if (ticket.confirmed === null) continue;
      // The soft delete, the same READ predicate `getTickets` applies and for
      // the same reason it is applied here rather than inside
      // `replica.listTickets`: that enumeration also feeds `confirmedById` and
      // the parent walk, where a deleted parent must still resolve. This is the
      // list the phone's board screen and the desktop shell render, and
      // `myWork` is a filter over it — so this one conjunct is what makes
      // "the ticket stops appearing in views" true on both shells (E6-24).
      if ((ticket.confirmed.deleted ?? null) !== null) continue;
      out.push(await summarise(ticket.confirmed, ticket.contests));
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
    // Events first, then the snapshot block the bootstrap delivered. On a
    // fresh device the second branch is the ORDINARY one: a snapshot-bounded
    // bootstrap ships no events below the snapshot's seq, so reading only the
    // events refused nearly every ticket (ruling P36).
    const claims = await claimsFor(state.id, events, state.assigneeId, (id) =>
      replica.getSnapshotProvenance(id),
    );
    if (claims === null) {
      // Neither the events nor a delivered block. A local ticket with no
      // creating or transitioning event in its own log AND no provenance from
      // the server is a store that cannot name the claim at all, and a
      // synthesized provenance would put a claim on screen that nobody made.
      throw new ReplicaGapError('getTickets', [
        {
          field: 'ListRow.stateProvenance',
          because: `no ticket.created or ticket.transitioned event is stored for ${state.id}, and no snapshot provenance was delivered for it either, so no actor or clock can be named for the state it is in`,
          owner: 'Plan 10 — the local events table, or a snapshot written before ruling P36 added the provenance column',
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
      stateProvenance: claims.state,
      assignee: actorOf(state.assigneeId),
      assignedProvenance: claims.assigned,
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
      // `state.closed ?? null`: `TicketState.closed?` is optional (441
      // fixtures predate the flag) and `ListRow.closed` is REQUIRED
      // (backlog/closed spec §1.2, 2026-09-17) — the boundary read every
      // other producer of a `closed` field takes.
      closed: state.closed ?? null,
      // `state.rank ?? null` — the same boundary read, for the same reason:
      // `TicketState.rank?` is optional on the domain type (legacy literals)
      // while `ListRow.rank` is REQUIRED (spec §8.1, second wave 2026-09-18).
      // The reducer DOES write the null at creation (Task 3's decision, so the
      // fold and `rowToTicketState` stay `toEqual`-equal across the dual-client
      // rig), so this fallback is aimed at hand-built states in fixtures rather
      // than at a second meaning for the field.
      rank: state.rank ?? null,
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
      // `statesWithBacklog(def)`, not `def.states` (backlog/closed spec §1.4,
      // 2026-09-17): a ticket sitting in the universal Backlog state has no
      // row in the published definition's own `states`, and reading that
      // array alone would name it by its bare id instead of "Backlog", the
      // same fix `apps/server/src/read/list-cards.ts` made for the server's
      // own list row (case 13.575).
      const named = def === undefined ? undefined : statesWithBacklog(def).find((s) => s.id === state.stateId);
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
    getTicketAttachments: () =>
      Promise.reject(new ReplicaGapError('getTicketAttachments', ATTACHMENTS_ABSENCES)),
    getTicketComments: () =>
      Promise.reject(new ReplicaGapError('getTicketComments', COMMENTS_ABSENCES)),
    getMyWork: () => Promise.reject(new ReplicaGapError('getMyWork', MY_WORK_ABSENCES)),
    getAttention: () => Promise.reject(new ReplicaGapError('getAttention', ATTENTION_ABSENCES)),
    getWorkspaceSettings: () =>
      Promise.reject(new ReplicaGapError('getWorkspaceSettings', WORKSPACE_SETTINGS_ABSENCES)),
    getPreferences: () => Promise.reject(new ReplicaGapError('getPreferences', PREFERENCES_ABSENCES)),
    putPreferences: () => Promise.reject(new ReplicaGapError('putPreferences', PREFERENCES_ABSENCES)),
    search: () => Promise.reject(new ReplicaGapError('search', SEARCH_ABSENCES)),

    /**
     * `grouping` is READ AND NOT USED, and that is the shipped view type rather
     * than an omission: `TicketListView` is `{projectId, rows}` — a flat row set
     * — and `views/list-model.ts`'s `groupRows` partitions it client-side. The
     * online source passes `groupBy` to the route only because the route insists
     * on one. Nothing local needs it.
     *
     * SETTLED ROWS ONLY. A ticket that exists only as a queued claim is not
     * here and not on the board either — `OFFLINE_BORN_ABSENCE` carries the
     * argument, and case 12.187 pins all three doors together so the omission
     * cannot go quiet.
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
        // The soft delete, and it is a READ predicate applied here rather than a
        // removal from `byId` — `confirmedById` also feeds the parent walk, and
        // a parent pulled out of that map would turn every deleted epic into a
        // `hasRestrictedParent` on its live children, which is a different
        // statement ("you may not see this") than the true one.
        //
        // Mirrored from the server's own list read, which ANDs
        // `LIVE_TICKET_WHERE` (`apps/server/src/read/visible-where.ts`) into the
        // same query — this is the offline half of that one decision, and
        // `(state.deleted ?? null) === null` is the same boundary read
        // `state.closed ?? null` above takes, for the same reason: `deleted?` is
        // optional on the domain type (every fixture predating the flag) while
        // the predicate needs one answer for `undefined` and `null` alike.
        if ((state.deleted ?? null) !== null) continue;
        if (!matchesFilter(state, filter)) continue;
        const pending = await outbox.pendingFor(state.id);
        rows.push(await rowOf(state, byId, types, isEpicType, stateNameOf, pending !== null));
      }
      // OFFLINE-BORN TICKETS ARE NOT HERE, and the reason is a type rather than
      // an oversight — see `OFFLINE_BORN_ABSENCE` and case 12.187.
      return { projectId, rows };
    },

    /**
     * Settled cards only — offline-born tickets are absent; see
     * `OFFLINE_BORN_ABSENCE`. Also excludes a BACKLOG ticket, a CLOSED one
     * (backlog/closed spec §3.2, 2026-09-17) and a SOFT-DELETED one, the bound
     * conjuncts the server's `readBoard` applies (`apps/server/src/routes/board.ts`,
     * case 13.574) — independently load-bearing there and mirrored the same
     * way here: without the first two, a backlog ticket has no row in any
     * published definition's `states` and falls into the straggler path as a
     * stray column literally named `backlog`, which is the exact column the
     * spec says a board must never show. The soft-delete conjunct is the third
     * for the same reason and is `deleted`, not `closed`: a deleted ticket's
     * `state_category` is whatever it was when it was deleted, so it would
     * otherwise render as an ordinary card in whatever column it left off in.
     */
    async getBoard(projectId: string): Promise<BoardView> {
      const byId = await confirmedById(ownWorkspaceId);
      const inProject = [...byId.values()].filter(
        (state) =>
          state.projectId === projectId &&
          state.stateId !== BACKLOG_STATE_ID &&
          (state.closed ?? null) === null &&
          // `state.deleted ?? null`, the same boundary read as `closed` one
          // line up — `deleted?` is optional on the domain type.
          (state.deleted ?? null) === null,
      );
      const defs = await defsFor(inProject);
      const pendingIds = new Set<string>();
      for (const state of inProject) {
        if ((await outbox.pendingFor(state.id)) !== null) pendingIds.add(state.id);
      }

      async function cardOf(state: TicketState) {
        const events = await replica.listEntityEvents(state.id);
        const claim = stateClaimOf(events);
        const claims = await claimsFor(state.id, events, state.assigneeId, (id) =>
          replica.getSnapshotProvenance(id),
        );
        if (claims === null) {
          throw new ReplicaGapError('getBoard', [
            {
              field: 'BoardCard.stateProvenance',
              because: `no ticket.created or ticket.transitioned event is stored for ${state.id}, and no snapshot provenance was delivered for it either`,
              owner: 'Plan 10 — the local events table, or a snapshot written before ruling P36 added the provenance column',
            },
          ]);
        }
        return {
          ticketId: state.id,
          title: titleOf(state),
          typeId: state.typeId,
          assignee: actorOf(state.assigneeId),
          stateProvenance: claims.state,
          // `cause` comes off the EVENT's payload and the snapshot block does
          // not carry it, so on the snapshot-bounded path this is `null` — the
          // "reopened — live work added" badge simply does not appear for a
          // ticket whose reopening is below the snapshot line.
          //
          // NARROWER THAN THE TRUTH, never wrong about it: the failure mode is a
          // missing badge, not a badge that says something false, which is the
          // direction `restrictedParent` argues for a few lines up and for the
          // same reason. Serving a cause here would mean inventing one.
          // *Recorded as a ❌ case with ruling P36 as owner, per its own clause
          // for fields it does not carry: the block would have to grow the
          // cause, which couples sync-client to a domain type it does not
          // otherwise know.*
          cause: claim === null ? null : causeOf(claim),
          rollup: null,
          // The same reader the offline LIST row uses, off the same state —
          // ruling E5-2: a board card and a list row for one ticket must not
          // disagree about whether a date is claimed.
          dueDate: dueDateOf(state),
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
      const claims = await claimsFor(ticketId, events, state.assigneeId, (id) =>
        replica.getSnapshotProvenance(id),
      );
      if (claims === null) {
        throw new ReplicaGapError('getTicket', [
          {
            field: 'TicketRead.stateProvenance',
            because: `no ticket.created or ticket.transitioned event is stored for ${ticketId}, and no snapshot provenance was delivered for it either`,
            owner: 'Plan 10 — the local events table, or a snapshot written before ruling P36 added the provenance column',
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
      // `claims.assigned` is the SAME field the local list already serves on every
      // card (`:763`), so the two reads cannot disagree about who assigned a
      // ticket — which is the property the online pair gets from calling one
      // reader twice.
      return {
        ticket: state,
        title: titleOf(state),
        stateProvenance: claims.state,
        assignedProvenance: claims.assigned,
        // `null` — the honest answer, and NOT a stand-in for a mode. The local
        // read models are folded from the event stream by the domain reducer,
        // and `visibility.set` is deliberately one of the three ticket-entity
        // types that reducer does not fold (`ticket-state.ts`: it moves no head
        // state). So a device knows the mode only if something else delivers it,
        // and nothing does: the bootstrap backfill carries the event
        // (`sync-routes.ts`'s `BOOTSTRAP_BACKFILL_TYPES`) but no folded column
        // holds its result. Answering a mode here would mean the replica
        // re-deriving visibility resolution — the inherit chain — locally, which
        // is a second implementation of `proj_visibility` and the drift this
        // client's one-decision-function rule exists to prevent.
        //
        // The consequence is visible and bounded: offline, the sheet's "Who can
        // see this" section renders its absence sentence, exactly as it did
        // before the online read carried the mode. Owner for delivering it
        // offline, if that is wanted: whoever owns the replica's snapshot
        // payload — the same door ruling P36 opened for state provenance.
        visibility: null,
        parent,
        rollup: null,
        // `null` — the honest answer for the same class of reason `visibility`
        // above is, and NOT a stand-in for a key. The number in a key is a fact
        // about the LEDGER'S ORDER (`read/ticket-numbers.ts`: a ticket's
        // position among its project's creations by `workspace_seq`), and the
        // two prefixes ride `workspace.created`/`project.created` payloads this
        // device may hold. Locally re-deriving the number would be a SECOND
        // implementation of that read — the drift `visibility`'s neighbour
        // refuses in as many words — and a key that named a different ticket
        // from the server's would be worse than no key.
        //
        // The consequence is bounded and visible: offline, the sheet's LAST
        // crumb falls back to the ticket's TITLE rather than a key — **its
        // absence, not a blank and not the id** (`ticket-sheet.tsx`'s `lastCrumb`
        // records the fallback and why `state.id` is not it). Owner for
        // delivering the key offline, if that is wanted: whoever owns the
        // replica's snapshot payload — the same door ruling P36 opened for state
        // provenance.
        key: null,
        // `null` for the same reason, and NOT "this ticket has no epic": the
        // walk needs each ancestor's TYPE RANK, which is a workspace-level read
        // (`proj_ticket_types`) this fold does not hold. Answering by climbing
        // the local parent chain would resolve the chain by the LOCAL partial
        // graph, which is the shape `parent` below already answers — and would
        // silently disagree with the server wherever an ancestor is undelivered.
        epic: null,
      };
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

    async listProjectWithOfflineBorn(projectId, filter, grouping) {
      const settled = await query.getTickets(projectId, filter, grouping);
      const entries: OfflineListEntry[] = settled.rows.map((row) => ({ kind: 'settled', row }));

      // THE BORN HALF READS `pendingCreatedTickets`, NOT `listTicketSummaries`,
      // and the first draft of this door got that wrong in a way its own tests
      // could not see. `listTicketSummaries` answers EVERY confirmed ticket as
      // well as the offline-born ones — it is the my-work door's shape, not this
      // one's. Deduping it against the SETTLED rows then looked correct and was
      // not: `getTickets` applies the filter, so every confirmed ticket the
      // filter excluded was missing from the dedup set, passed the project
      // check, and was re-emitted as `offline-born` with `pending: false`.
      // Typing in a search box turned settled tickets into "claims".
      //
      // Every case passed `{}`, where `matchesFilter` matches everything and the
      // dedup hid the whole summary side. **A door that takes a filter needs a
      // case with a filter**; an empty spec is not a neutral default, it is the
      // one input under which the two halves cannot disagree.
      //
      // `pendingCreatedTickets` is the outbox's own word for "tickets that exist
      // only as queued claims", so there is nothing confirmed in it to dedup
      // against and no filtered-versus-unfiltered gap to get wrong.
      for (const born of await outbox.pendingCreatedTickets(ownWorkspaceId)) {
        // `ownWorkspaceId`, not an argument: this door is project-scoped and a
        // replica holds exactly one workspace, so the project id IS the scope.
        if (born.pending.projectId !== projectId) continue;
        // FILTERED like the settled half. A door that filtered one side and not
        // the other would answer a narrowed list with un-narrowed rows in it,
        // which is a wrong answer wearing the right shape.
        if (!matchesFilter(born.pending, filter)) continue;
        const summary = await summarise(born.pending, []);
        entries.push({
          kind: 'offline-born',
          summary: { ...summary, pending: true, pendingEventIds: born.pendingEventIds },
        });
      }
      return { projectId, entries };
    },

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

    /**
     * THE SETTLED SCAN PLUS THE OFFLINE-BORN TITLES, and the union is made HERE
     * rather than inside `Replica.searchLocal` on purpose: `outbox.ts`'s own
     * invariant names `searchLocal` among the settled surfaces that "keep
     * answering from confirmed state alone", and folding a queued claim into
     * that function would break it. `listTicketSummaries` draws the same seam in
     * the same place — sync-client stays settled-only, and the app-core door
     * that has no provenance field to fill does the union.
     *
     * `workspaceId` IS THE ARGUMENT AND NOT `ownWorkspaceId`: `searchLocal`
     * filters on the caller's workspace (`WHERE workspace_id = ?`), so reading
     * the outbox at this replica's own id instead would answer a foreign-
     * workspace query with this workspace's queued claims — a leak on the door
     * being fixed.
     *
     * The matcher is `searchLocal`'s own — lowercased `includes` over the title
     * — because two different matchers on two halves of one result set is the
     * one-door class inside the fix for a one-door defect.
     *
     * NO DEDUPE, because the two halves cannot overlap and a guard that cannot
     * fire is a check that cannot fail: `pendingCreatedTickets` skips every
     * ticket in `overlay.confirmed`, and `searchLocal` reads the `tickets` table
     * — i.e. the confirmed ones — so a ticket in the second list is by
     * construction absent from the first.
     *
     * THE SOFT DELETE IS APPLIED HERE, on the same seam and for the same reason
     * as the union above: `searchLocal` is a settled-only scan over the store,
     * and the store keeps a deleted ticket (its parent walk and its undo need
     * it), so the view predicate belongs to the door that serves the view —
     * exactly where `getTickets` and `listTicketSummaries` carry theirs. One
     * predicate over the hits covers BOTH of `searchLocal`'s arms, the title
     * scan and the comment-owner lookup, which is what makes a comment on a
     * deleted ticket unable to resurface that ticket's title (E6-24). The
     * offline-born half needs no such check: a queued claim has no confirmed
     * state and therefore no `deleted` flag to carry.
     */
    async searchOfflineCopy(workspaceId, text) {
      const hits: Array<{ ticketId: string; title: string }> = [];
      for (const hit of await replica.searchLocal(workspaceId, text)) {
        const owning = await replica.getTicket(hit.ticketId);
        if ((owning?.confirmed?.deleted ?? null) !== null) continue;
        hits.push(hit);
      }
      const needle = text.toLowerCase();
      for (const born of await outbox.pendingCreatedTickets(workspaceId)) {
        const title = titleOf(born.pending);
        if (!title.toLowerCase().includes(needle)) continue;
        hits.push({ ticketId: born.pending.id, title });
      }
      return { offlineCopy: true, hits };
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
     * `DataSource.subscribe` carries the 5-kind `ServerStreamFrame`, and
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
     * - a PROJECT-scoped `scope-revoked`: `ServerStreamFrame` declares
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
    subscribe(workspaceId: string, _afterSeq: number, cb: (item: ServerStreamFrame) => void): Unsubscribe {
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
        if (item.kind === 'reach-granted') {
          // Ruling P37.1, closure 5b(d). Re-emitted rather than swallowed: a
          // view subscribed here is entitled to know that tickets are on their
          // way, and a DataSource that quietly dropped a frame the engine acted
          // on would be a second, disagreeing account of the stream.
          //
          // **WHEN this fires, corrected — the first version of this comment
          // got both halves wrong and the branch review caught it.** Item
          // listeners run AFTER the engine's drain, so by the time a subscriber
          // sees this frame the successful pulls have already landed and those
          // tickets ARE readable. And no `event` frame follows a pull:
          // `loadTicketBootstrap` calls `notify()` only, and nothing routes a
          // pulled ticket through `onItem`. What refreshes a view is the
          // ordinary TRIGGER envelope arriving behind this frame — the right
          // outcome by a different mechanism, and a consumer waiting for a
          // per-pull frame would wait for one that never comes.
          if (item.workspaceId === workspaceId) {
            cb({ type: 'reach-granted', workspaceId, tickets: item.tickets });
          }
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
