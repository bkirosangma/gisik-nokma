import type {
  IngestResult,
  LedgerEvent,
  ServerStreamFrame,
  SubmittedEvent,
  TicketTypeDef,
  WorkflowDef,
} from '@gisik-nokma/domain';
// Type-only, and it is the ONE place this file reaches into `views/`. The union
// is declared there because the list that renders it is declared there (and
// twinned in `packages/editor`); re-declaring it here would be the second
// spelling of one contract that `attachment-list.tsx`'s own docblock forbids.
import type { AttachmentListEntry } from './views/attachment-list.js';
import type { TicketComment } from './views/comments-thread.js';
// The note read models come straight from the DOMAIN, not from a view type
// here: `NoteSummary` and its siblings describe the wire body the routes send
// (spec §2), no component reshapes them, and a client-side copy would be a
// second definition of a body only the server can produce. `TicketComment` is
// the opposite case and lives in `views/comments-thread.js` because the union
// IS the component's — a note's read models have no such component in Plan 1.
import type {
  NoteComment,
  NoteDetail,
  NoteScopeMode,
  NoteSummary,
  NoteVersion,
} from '@gisik-nokma/domain';
import type {
  AttentionItem,
  BoardView,
  FilterSpec,
  Grouping,
  MyWorkView,
  RosterMember,
  SearchHit,
  TicketHistoryEvent,
  TicketListView,
  TicketRead,
  UserPreferences,
  WorkspaceRef,
  WorkspaceSettings,
} from './view-types.js';

/**
 * One streamed frame, mirroring coordination amendments 13 + 19's server frames.
 * `workspaceId` on purge/caught-up/error is amendment 19: a socket may carry more
 * than one subscription, and a cursor from one workspace is meaningless in another.
 *
 * ## Two members were WIDENED here (Plan 6 Task 8), and neither is a contract change
 *
 * This union was written before any server emitted a frame, and both widenings are
 * the client catching up to a server that shipped first — `ServerStreamFrame`
 * (`packages/domain/src/stream-frames.ts`) has declared both since Plan 5, and the
 * hub emits both today.
 *
 * 1. **`scope-revoked` was missing.** A revocation therefore arrived as an
 *    unrecognised `type` and was silently DROPPED, leaving stale authorization in
 *    any cache fed by the stream. `projectId?: never` is copied deliberately from
 *    the server declaration rather than softened to an optional `string`: both of
 *    `visibleEventsFor`'s emitters yield `{kind:'scope-revoked', workspaceId}` and
 *    the hub REFUSES an instruction carrying a project scope, so a client field
 *    that could be filled in would be a field describing a frame nobody sends.
 * 2. **The event frame carried `EventEnvelope`, which has no `workspaceSeq`.**
 *    `afterSeq` — the value `subscribe` sends and `caught-up` reports — is the
 *    workspace stream position, and `EventEnvelope.seq` is the PER-ENTITY counter
 *    that restarts at 1 for every entity. A client holding only an `EventEnvelope`
 *    cannot name the cursor it must send back. `LedgerEvent` is `EventEnvelope`
 *    plus exactly that field, so this is a widening and not a move:
 *    `EventEnvelope` itself is untouched, because it is the coordination-pinned
 *    wire type the server, the domain and Plan 10 all share.
 *
 * Widening rather than narrowing is what makes both safe. `ServerStreamFrame` has two
 * implementers — the online source (`src/online/stream.ts`) and Plan 10's replica —
 * and the coordination doc records `replica.revokeScope` as already **Done**, i.e.
 * Plan 10 already consumes `ScopeRevokedInstruction`. Adding the member ALIGNS the
 * two implementers; leaving it out stranded the one that had already shipped.
 *
 * ONE divergence from `ServerStreamFrame` deliberately remains, named so the next
 * reader does not have to rediscover it: `code` is a bare `string` rather than
 * `StreamErrorCode`, so a misspelled code is a runtime surprise instead of a
 * compile error. Separately — a judgement about the end state rather than a
 * divergence — `stream-frames.ts`'s own docblock argues `ServerStreamFrame` should be
 * REPLACED by `ServerStreamFrame` rather than re-synchronised with it, owner
 * Plan 10. This task performs the two measured widenings only.
 */


// RE-EXPORTED, not redeclared. `StreamItem` used to be a second spelling of
// this union living here, and `stream-frames.ts`'s docblock argued it should be
// REPLACED by `ServerStreamFrame` rather than kept in sync — which had already
// cost one silent divergence (`code` was a bare `string` here, so a misspelled
// stream error code was a runtime surprise instead of a compile error). One
// type, one seam. The re-export keeps `@gisik-nokma/app-core` a complete import
// surface for a client that never depends on the domain package directly.
export type { ServerStreamFrame };

/**
 * What a `DataSource.subscribe` callback actually receives: every frame the
 * SERVER can send, plus one the server never will (notes series, Plan 2 of 6).
 *
 * ## `refresh` is CLIENT-ONLY, and that is why this is a union rather than a
 * ## widened `ServerStreamFrame`
 *
 * `ServerStreamFrame` is the published wire protocol — `serverStreamFrameSchema`
 * and the hub build it, and the compiler asserts this package handles every
 * member. Adding a member to it for a frame no server sends would make that
 * assertion say something false about the wire and would put a field in the
 * protocol that a later server author could innocently try to emit.
 *
 * `refresh` means ONE thing: a PULL landed. A note reaches a device after its
 * `reach-granted` notice and after the stream has gone quiet, so no `event`
 * frame announces it and no `caught-up` follows — a view showing that note
 * would keep a stale answer until something unrelated moved. The engine is the
 * only component that knows a pull completed, so it is the only component that
 * can say so.
 *
 * `ClientStreamFrame` EXTENDS the server union rather than being redeclared
 * beside it: the file above states at length why a second spelling of the
 * server's union was deleted once, and a union that is a superset of the real
 * one cannot drift from it.
 */
export type ClientStreamFrame = ServerStreamFrame | { type: 'refresh'; workspaceId: string };

export type Unsubscribe = () => void;

/**
 * The note list's filters — a NAMED type rather than an inline object literal,
 * which is this file's existing style (`FilterSpec`, `Grouping`) and also a
 * HARD REQUIREMENT of a gate rather than a preference.
 *
 * `apps/server/test/integration/client-contract.test.ts`'s `clientMethodParameters`
 * reads this file with a pattern anchored on `DataSourceQuery`'s own declaration
 * whose body class EXCLUDES braces. So an inline object literal in a method
 * signature makes the block unmatchable and the scanner throws rather than
 * skipping. That was measured, not assumed: the first version of `getNotes` used
 * an inline filter type and case 7.201 failed.
 *
 * ⚠ **This docblock must not spell that pattern out, and the first draft did.**
 * The scanner's regex is unanchored, so a brace-bearing LITERAL anywhere in the
 * file matches FIRST if it appears before the real declaration — and an earlier
 * version of this paragraph quoted the pattern and the scanner's own error
 * message, both of which contain braces, and the regex duly captured the prose
 * and reported `DataSourceQuery declares no getMyWork`. Measured at case 7.201,
 * twice. Prose that describes a scanner is inside the scanner's haystack.
 *
 * It is a better signature either way — a caller can name the filter, and the
 * replica's local implementation can take the same type rather than restating
 * three optional strings.
 */
export type NoteListFilter = {
  homeProjectId?: string;
  authorId?: string;
  scopeMode?: NoteScopeMode;
};

/**
 * Typed read functions mirroring the server read surface (Plan 5 + earlier).
 * Implemented twice: online (this plan — HTTP) and replica (Plan 10 — local
 * store + outbox). Views call these and never speak HTTP (amendment 10).
 *
 * ## THREE signatures grew a `workspaceId` (Plan 6 Task 7, ruling P25 clause 2)
 *
 * `getMyWork`, `getPreferences` and `putPreferences` took no argument at all
 * when this file was written, and no server existed to contradict them. Three
 * shipped routes now do: `GET /v1/me/work`, `GET /v1/me/preferences` and
 * `PUT /v1/me/preferences` each read `?workspaceId=` BEFORE the door and answer
 * **400 `invalid_query`** without one — so the request the old signatures could
 * build was refused whole, before membership was even resolved. That is a fact
 * about the method signature rather than about the view model, which is why it
 * could not be adapted inside `online/mappers.ts` the way a renamed field can.
 *
 * It extends ruling **P24** — already taken, that the shipped `.strict()`
 * preferences document wins over Plan 6's — from the document's shape to the
 * method's signature: the same argument one layer out.
 * `apps/server/test/integration/client-contract.test.ts` pins both halves, the
 * client's declared parameters read out of THIS file's source and the routes'
 * 400/200 pair measured through the real door.
 *
 * `getAttention` and `getMembers` already carried one and are untouched.
 *
 * ## A THIRTEENTH method: `getTicketTypes` (Plan 6 Task 14 fix round)
 *
 * The web shell's New-ticket dialog HARDCODED `epic`/`story`/`task`/`sub-task`
 * and presented them as the workspace's own types. A workspace whose types
 * differ — `readTicketTypes` orders by rank then id and the server's own fixture
 * answers `epic`, `chore`, `task` — got a picker offering four it does not have,
 * and `ticketTypeExists` (`apps/server/src/routes/builder-reads.ts:363`) then
 * refused the create. The failure surfaced as a rejected WRITE rather than as
 * "this build cannot read your ticket types", which is the wrong sentence about
 * the wrong thing.
 *
 * The server serves them — `GET /v1/workspaces/:workspaceId/ticket-types`,
 * registered at `builder-reads.ts:531`. What was missing was the SEAM: amendment
 * 10 says views never speak HTTP, so with no method here the shell could not
 * reach a route that had shipped. Plan 6's own Open question 7 settles the
 * intent — "the `typeOptions` prop is fed from it; the built-in ladder remains
 * only the LOADING FALLBACK" — and this is that method.
 *
 * It returns the DOMAIN's `TicketTypeDef`, not a client view model, exactly as
 * `getWorkflowDef` returns `WorkflowDef`: the wire body is
 * `TicketTypeListResponse` (`packages/domain/src/read-models.ts:301`), whose
 * `ticketTypes` are `TicketTypeDef` already. There is no rename to adapt and
 * therefore no view model to invent. It is NOT one of the refusals — and there are
 * none left to be one of. **⚠ CORRECTED 2026-09-20:** this read *"(six of them until
 * ruling P25 clause 1, four since)"*; the count reached **ZERO** on 2026-09-19 when
 * `search`, the last key, was served, so `SERVING_GAPS` is empty. Every
 * field the client needs is on the wire, pinned by case 7.38
 * (`apps/server/test/routes/builder-reads.test.ts:250`).
 */
export type DataSourceQuery = {
  getMyWorkspaces(): Promise<WorkspaceRef[]>;
  /**
   * The workspace roster. `RosterMember[]` and not `Actor[]`: the route sends a
   * `role` per person (`routes/builder-reads.ts:247`) and the members screen
   * DRAWS it, so a signature that did not carry it would be the client asking
   * the mapper for less than the server says. `RosterMember` is an `Actor`, so
   * every caller that only wants names is unaffected.
   */
  getMembers(workspaceId: string): Promise<RosterMember[]>;
  getBoard(projectId: string): Promise<BoardView>;
  getTickets(projectId: string, filter: FilterSpec, grouping: Grouping): Promise<TicketListView>;
  getTicket(workspaceId: string, ticketId: string): Promise<TicketRead | null>;
  getTicketHistory(ticketId: string, afterSeq?: number, limit?: number): Promise<TicketHistoryEvent[]>;
  /**
   * The ticket's files — the read `TicketSheetProps.attachments` has been
   * waiting for since Plan 6.
   *
   * **A 404 THROWS. IT DOES NOT ANSWER `[]`, and that is the whole point of the
   * method's shape.** `AttachmentList` renders `null` for an empty list —
   * *"must not promise there are none"* — so an empty answer and a failed read
   * are two states the caller has to be able to tell apart, and `[]` has only
   * one meaning here: this ticket has no attachments. The route refuses a ticket
   * the caller may not see exactly as it refuses one that never existed, so the
   * transport answers `null` and this method re-raises it as the STATUS it was
   * — the same decision `getBoard` and `getTickets` make for the same reason,
   * rather than the `[]`-on-404 that `getMembers` and `getTicketHistory` take
   * for theirs (there, emptiness is a true answer with a stated cost).
   *
   * **Only the `kind: 'upload'` arm is served**, and the route's own docblock
   * names what that costs: an `attachment.added` whose arm is a Drive reference
   * is a ledger fact, not a row in the table this reads, so it is not in the
   * list. The union is kept whole as the return type rather than narrowed,
   * because narrowing it would make the day a reference arm is served a change
   * to this contract instead of a change to one mapper.
   */
  getTicketAttachments(workspaceId: string, ticketId: string): Promise<AttachmentListEntry[]>;
  /**
   * The ticket's comment thread — oldest first.
   *
   * **A 404 THROWS, for the same reason `getTicketAttachments` re-raises and
   * with the same consequence.** `TicketComment[]` has an absence value, `[]`,
   * and the comments block draws it as *"No comments yet."* — a sentence about
   * the ticket. The route answers 404 for a ticket that is invisible, deleted or
   * nonexistent (indistinguishably, by design), so folding that into `[]` would
   * tell the reader the ticket has no comments when the truth is that this
   * client could not read them. The sheet draws the two states differently, and
   * this signature is what keeps them apart.
   *
   * `TicketComment` lives with the component that renders it
   * (`views/comments-thread.tsx`) for the reason `AttachmentListEntry` does:
   * the union is the component's, and only the component's props describe it.
   */
  getTicketComments(workspaceId: string, ticketId: string): Promise<TicketComment[]>;
  /**
   * The note reads (notes series, Plan 1 of 6, spec §6.4) — seven methods, the
   * same seven the server's note routes serve.
   *
   * ## `null` on 404, `[]` on an empty list, and the difference is the product's
   *
   * `getNote` answers `null` rather than throwing, matching `getTicket` and
   * NOT `getTicketComments`: the note routes answer 404 for an invisible note
   * and a nonexistent one INDISTINGUISHABLY (spec §6.4's existence-oracle rule),
   * so a caller that folded the 404 into `null` anyway would be inventing a
   * distinction the server deliberately does not draw. The two list reads answer
   * `[]` for a 404 on the same argument `getMembers` and `getTicketHistory` take
   * for theirs — emptiness is a true answer here with a stated cost, and the
   * notes list is a screen where "nothing here" and "we could not read it" are
   * drawn by the same empty state.
   *
   * ## `getDeletedNotes` is its own method although the route is the same one
   *
   * `?deleted=1` is a query parameter on the list route, so this could have been
   * a flag on `getNotes`. It is separate because the two reads are gated
   * DIFFERENTLY (spec §4.1: only the author, an admin or the owner may go
   * looking for deleted notes) and a flag would put two authorisation rules
   * behind one name — a caller passing a deleted flag would have no hint that it
   * can answer `[]` for a reason the plain call cannot.
   *
   * (That sentence is written WITHOUT braces deliberately: no brace may appear
   * anywhere inside this block, comments included, because
   * `client-contract.test.ts`'s scanner matches up to the first one. An earlier
   * draft wrote the call as a literal and the scanner read a truncated block —
   * measured, at case 7.201.)
   *
   * ## `searchNotes` is NOT here
   *
   * Notes search is Plan 3 of the series (spec §7.7) and lands with its own
   * route, projection and worker. Declaring it now would oblige both sources to
   * implement a method nothing can serve — the same trap `online/founding.ts`
   * records for the founding reads.
   */
  getNotes(workspaceId: string, filter?: NoteListFilter): Promise<NoteSummary[]>;
  getDeletedNotes(workspaceId: string): Promise<NoteSummary[]>;
  getNote(workspaceId: string, noteId: string): Promise<NoteDetail | null>;
  getNotesForTicket(workspaceId: string, ticketId: string): Promise<NoteSummary[]>;
  getNoteComments(workspaceId: string, noteId: string): Promise<NoteComment[]>;
  getNoteHistory(workspaceId: string, noteId: string): Promise<NoteVersion[]>;
  getNoteVersion(workspaceId: string, noteId: string, eventId: string): Promise<unknown | null>;
  getWorkflowDef(workspaceId: string, workflowId: string, version?: number): Promise<WorkflowDef | null>;
  getTicketTypes(workspaceId: string): Promise<TicketTypeDef[]>;
  search(workspaceId: string, text: string, filter?: FilterSpec): Promise<SearchHit[]>;
  getMyWork(workspaceId: string): Promise<MyWorkView>;
  getAttention(workspaceId: string): Promise<AttentionItem[]>;
  /**
   * The workspace's thresholds and auto-close window, as `/settings`'s Workspace
   * tab shows them (second wave, Task 6).
   *
   * **Why this is a separate method rather than a wider `getAttention`.** The
   * server has sent `settings` as a sibling of `items` on
   * `/v1/workspaces/:ws/attention` since Plan 5, and the client dropped it —
   * `mapAttention` reads `items` and returns `AttentionItem[]`. Widening
   * `getAttention`'s RETURN would change a shipped signature for every strip
   * caller that does not want settings; this method reads the SAME route and
   * returns only the sibling mapped, so nothing that works today moves.
   *
   * The cost, named rather than hidden: this fetches the attention body to read
   * one key of it. The server has no dedicated settings route, and adding one is
   * a larger change than this task (`EXEC-2026-09-18-t6-settings-read.md`). If a
   * `GET /v1/workspaces/:ws/settings` ever lands, this method is a one-line
   * re-point and its cases do not move.
   *
   * **This shape is DELIBERATE AND OWNER-APPROVED, not the residue of an
   * unanswered question.** The task plan named a `mapWorkspaceSettings` that did
   * not exist and a settings read the attention strip supposedly already
   * performed; the executor measured both claims false, took the additive
   * ruling, and flagged it as a scope change rather than quietly widening
   * `getAttention`. The controller confirmed the default and the OWNER confirmed
   * it in turn (2026-09-18), so a future reader should read this as a decided
   * design and not as a workaround awaiting review.
   *
   * It takes a `workspaceId` like every other read here — the caller supplies
   * it, never a stored "current workspace".
   */
  getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings>;
  getPreferences(workspaceId: string): Promise<UserPreferences>;
  putPreferences(workspaceId: string, preferences: UserPreferences): Promise<void>;
};

/** Coordination amendment 10 — the one seam between views and the world. */
export type DataSource = {
  ingest(events: SubmittedEvent[]): Promise<IngestResult[]>;
  query: DataSourceQuery;
  subscribe(workspaceId: string, afterSeq: number, cb: (item: ClientStreamFrame) => void): Unsubscribe;
};
