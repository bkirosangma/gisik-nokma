import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import {
  PRIORITIES,
  newUlid,
  prioritySchema,
  statesWithBacklog,
  type Priority,
  type SubmittedEvent,
  type TicketTypeDef,
} from '@gisik-nokma/domain';
import { Button, Chip, SegmentedControl, Select, Sheet, Toast } from '@gisik-nokma/ui';
import type { ClientStateCache } from '../cache.js';
import type { DataSource } from '../data-source.js';
import { precheckEvent, type PrecheckResult } from '../precheck.js';
import {
  UnansweredClaimError,
  parentNoLongerClosed,
  reopenAndProceed,
  reopenOfferFor,
  submitChildEvent,
  type ReopenOffer,
  type Refusal,
} from '../flows/guarded-child-event.js';
import { writeFailureCopy, writeFailureRefusalClass } from '../session-expired.js';
import { actorLabel, formatDate, formatStateProvenance } from '../provenance.js';
import { actorLabelFrom, memberLabel } from '../member-label.js';
import { useActorNames } from './use-actor-names.js';
import { mentionCandidatesOf } from '../mention-candidates.js';
import { makeSubmittedFactory } from '../submit.js';
import { dateClaimOf } from '../claims/ticket-dates.js';
import type { ParentRef, TicketHistoryEvent, TicketRead } from '../view-types.js';
import { attachmentsImpliedBy, noteReferencesIn } from '../flows/attachments-implied-by.js';
import { AttachmentList, type AttachmentListEntry } from './attachment-list.js';
import { CommentsThread, type CommentActions, type TicketComment } from './comments-thread.js';
import { commentDeletedSeed, commentEditedSeed } from '../flows/comment-edits.js';
import { ASSIGNEE_OUTSIDE_ROSTER, ASSIGN_OUTSIDER_OPTION } from '../people/copy.js';
import { outsiderIngest } from '../people/outsider-ingest.js';
import type { AssignOutsider, LookupPerson } from '../people/types.js';
import { OutsiderFinder } from './outsider-finder.js';
import { DeleteDialog } from './delete-dialog.js';
import {
  PlainTextEditorSlot,
  type EditorSlotComponent,
  type EditorSlotSubmission,
  type EditorSlotUpload,
} from './editor-slot.js';
import { HistoryList } from './history-list.js';
import { formatRollup } from './rollup-text.js';
import { TicketNotesSection } from './ticket-notes-section.js';
import { ReopenDialog } from './reopen-dialog.js';
import { TransitionDialog, type TransitionSubmission } from './transition-dialog.js';
import { VisibilityEditor, type VisibilityClaim } from './visibility-editor.js';
import { useOptimisticTicket, type OverlayField, type TicketOverlay } from './optimistic-ticket.js';
import { useLiveQuery, type LiveQueryResult } from './use-live-query.js';
import { usePhoneBoard } from './use-phone-board.js';
import { usePurgedPredicate } from './use-purged-predicate.js';

/**
 * The Attachments tab's "Attach a file" button `accept` hint (Unit 5(b)) —
 * the SAME eleven types `apps/server/src/attachments/sniff.ts`'s
 * `ALLOWED_ATTACHMENT_MIME` accepts, transcribed rather than imported (this
 * package cannot depend on `apps/server`, and `packages/editor`'s own copy —
 * `TicketEditorSlot.tsx`'s `ATTACHMENT_ACCEPT` — is unreachable too: `app-
 * core` must never depend on `@gisik-nokma/editor`, the same direction
 * `editor-slot.tsx`'s docblock states for the reverse edge). A UX hint
 * only — the server decides by magic bytes, never by this string.
 */
const ATTACHMENT_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
].join(',');

/**
 * How many ledger entries this sheet asks for, and the reason it names a number
 * at all instead of taking whatever arrives.
 *
 * **The shipped route PAGES.** `apps/server/src/routes/ticket-history.ts:78`
 * declares `DEFAULT_LIMIT = 200`, applied at `:155` and reaching the query as
 * `LIMIT $3` at `:305`; `MAX_LIMIT` (`:75`) caps it at 1000. Before this fix the
 * sheet passed neither `afterSeq` nor `limit`, so a long-lived ticket's history
 * was silently cut at whatever the server's default happened to be, with nothing
 * on screen saying so — the same absence-rendered-as-fact defect as the empty
 * `<ol>` below, one layer up: a reader would take the oldest line shown as the
 * beginning of the ticket.
 *
 * Two consequences of naming it here, both deliberate:
 *
 * 1. **The page size is this client's, not a server default it does not
 *    control.** The route may change `DEFAULT_LIMIT` tomorrow; the sentence this
 *    sheet prints about how much it is showing would then be about a number it
 *    never chose. It is a matching value, not an imported one — `app-core` may
 *    not import from `apps/server` (amendment 10 keeps this package free of the
 *    transport, let alone of the server), so the route's file:line is cited
 *    above and a drift shows up as the two numbers disagreeing in prose rather
 *    than as a compile error. **A `MAX_LIMIT` below this number silently
 *    disables the partiality signal**, and that is the second reason the two
 *    must be kept in step: `parsePaging` clamps with
 *    `Math.min(parsed, MAX_LIMIT)` (`ticket-history.ts:170`), so a cap of 100
 *    against this 200 returns a full-but-short page, `length >= 200` is false,
 *    and a genuinely truncated history shows no notice — FIX 1's
 *    absence-as-fact, back again. Nothing client-side can detect it: the body
 *    carries no cap and no cursor, so a short page is indistinguishable from
 *    the end of the ledger.
 * 2. **`events.length === HISTORY_PAGE_LIMIT` is the ONLY partiality signal
 *    available.** The route answers `{ticketId, events}` with no cursor and no
 *    `hasMore`, so a full page is all a client can observe. That over-reports:
 *    a ticket with exactly 200 entries is complete and will still be described
 *    as possibly having more. That trade is taken on purpose — an occasional
 *    "there may be more" is a weaker claim than the truth, while a silent
 *    truncation is a *stronger* one, and this file's whole subject is not making
 *    claims the record did not make. Closing the gap properly means a cursor on
 *    the wire; it is NOT built here (no Load-more, no `afterSeq` walk).
 */
export const HISTORY_PAGE_LIMIT = 200;

/**
 * The type a NEW SUBTASK takes under a ticket whose type sits at `parentRank`,
 * or `null` when this workspace's ladder offers no legal child at all.
 *
 * **This is the rank rule asked in the one direction the client can answer.**
 * `checks/hierarchy.ts:133` refuses `type.rank <= parentType.rank`, so a legal
 * child is a type whose rank is STRICTLY GREATER than the parent's, and that is
 * the whole of the predicate.
 *
 * ⚠ **`DEEPEST_RANK` is NOT a bound on this, and reading it as one is the
 * natural mistake.** The constant (= 4, `packages/domain/src/ticket-types.ts:136`)
 * governs ROOT creation alone — a type at that rank or below may not sit at
 * project root (`hierarchy.ts:133`) — while a child's rank is unbounded above,
 * which is that file's own reason for writing `>=` there: *"a type DEEPER than
 * sub-task is smaller still and cannot coherently be exempt — `===` would leave
 * an escape hatch where defining rank 5 floats your tickets free."* A workspace
 * that defines rank 7 gets it here for nothing; nothing below knows a maximum.
 *
 * **The ladder is the WORKSPACE's, never the built-ins.** `errand` is a
 * workspace-defined type sharing rank 3 with the built-in `task`, so a fix that
 * consulted `BUILTIN_TICKET_TYPE_SEEDS` would agree with a default workspace and
 * disagree with an ordinary one.
 *
 * **Which legal child, when several qualify — the prototype first, then the
 * ladder:**
 *
 * 1. **the built-in `task`, whenever `task` is itself legal.** The design
 *    authority births a subtask as `type: "Task"` (`desktop.dc.html:3654`), and
 *    this section is otherwise a transcription of it, so departing where the
 *    prototype IS expressible would be a drift rather than a decision.
 * 2. **otherwise the SHALLOWEST legal type** — the nearest kind of work below
 *    the parent that the rank rule admits.
 *
 * ⚠ **Rule 2 is the one judgement in this change that is not forced, and it is
 * flagged for a ruling rather than settled here.** The prototype's `Task` is
 * impossible under a `task`/`errand` parent (equal rank) and under a `sub-task`
 * parent, so it cannot be an answer on its own; whether the fallback should be
 * the shallowest legal type or the deepest is a product question. Under the
 * owner's ladder this makes an `errand` (rank 3) take a `sub-task` (rank 4),
 * which is the case the predicate was written for. It is a pure function with
 * its own cases so the answer changes in one line.
 *
 * Ties are broken by `id`, so the answer does not depend on the order the server
 * happened to return the ladder in.
 */
export function subtaskTypeFor(
  ladder: readonly TicketTypeDef[],
  parentRank: number,
): TicketTypeDef | null {
  const legal = ladder.filter((def) => def.rank > parentRank);
  if (legal.length === 0) return null;
  const task = legal.find((def) => def.id === 'task');
  if (task !== undefined) return task;
  return legal.reduce((best, def) =>
    def.rank < best.rank || (def.rank === best.rank && def.id < best.id) ? def : best,
  );
}

/**
 * The prototype's two `sheetFullIcon` paths (`desktop.dc.html@6d7b67c0a52c:3402`),
 * carried verbatim: a set of corner arrows pointing OUT while the sheet is a
 * panel, and IN once it fills the screen. Transcribed rather than redrawn —
 * an icon is the one thing on this sheet nobody can check by reading.
 */
const SHEET_ENTER_PATH =
  'M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4';
const SHEET_EXIT_PATH =
  'M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4';

export type TicketSheetProps = {
  dataSource: DataSource;
  cache?: ClientStateCache;
  workspaceId: string;
  ticketId: string;
  /**
   * The workflow the opener already knows the ticket is on (the board card's group), so the workflow read starts
   * with the sheet instead of waiting for the ticket read (smoothness T7 F3, plan Task 7 Step 3). A HINT, never
   * the truth: once the ticket's own read lands its `workflowId@version` is what the sheet follows.
   */
  hint?: { workflowId: string; workflowVersion: number };
  currentUserId: string;
  /**
   * The viewer is a workspace owner or admin (MCP-everything T5): they may DELETE anyone's comment, never edit
   * it. Absent = false, so a host that cannot resolve the viewer's role still shows the writer their own
   * controls — the permission gate decides what commits.
   */
  canModerateComments?: boolean;
  onClose: () => void;
  editorSlot?: EditorSlotComponent;
  uploadEvidence?: (file: File) => Promise<{ attachmentId: string }>;
  /**
   * The ticket's files — what `DataSourceQuery.getTicketAttachments` reads.
   *
   * **⚠ CORRECTED 2026-09-20.** This read *"Uploads and Drive references, from
   * the ticket's `attachment.added` history"*, and that sentence described the
   * read that was never built. The read now feeding it is a ROUTE over the
   * `attachments` table (`apps/server/src/routes/tickets.ts`), which serves
   * **uploads only**: a Drive reference recorded as a ledger event is not a row
   * in that table, so it does not appear here. The union is kept whole — the
   * `drive-reference` arm is still rendered below — because the day a producer
   * emits that arm is the day the route grows a `kind`, and narrowing this prop
   * to the arm served today would make that a change to every caller.
   */
  attachments?: AttachmentListEntry[];
  /**
   * Why the files could not be read — drawn where the list would be.
   *
   * `undefined` on every mount that has an answer, an empty one included. The
   * two states must NOT render alike: `attachments` is `[]` for a ticket with
   * no files, `getTicketAttachments` THROWS rather than answering `[]` on a
   * refusal (see its docblock), and `AttachmentList` returns `null` for an
   * empty list by design — *"must not promise there are none"*. That silence is
   * honest for an empty list and is the drawn absence the component refuses for
   * a failed read, so a failed read gets a sentence of its own.
   *
   * The shape mirrors `NewTicketDialogProps.parentCandidatesUnavailable`, which
   * draws "…parent cannot be shown. {reason}" for the same reason.
   */
  attachmentsUnavailable?: string;
  /**
   * The comment thread is read INSIDE this component, not passed in — see the
   * `comments` live query in the body, which states why it differs from
   * `attachments`. There is deliberately no `comments` prop: two sources for
   * one read is how a sheet ends up showing a thread that disagrees with the
   * one its own composer just wrote to.
   */
  /**
   * The uploader a COMMENT's Attach and image-paste go through — the same
   * `uploadAttachmentHttp(file, ticketId)` the board's evidence capability
   * uses, and the same narrow prop the description editor deliberately does NOT
   * get (it is mounted without an uploader and says so when a file is dropped).
   *
   * **Why the comment composer gets one and the description editor does not:**
   * a comment's files ARE its document's embeds (see
   * `apps/server/src/read/ticket-comments.ts`), so an upload here is not a
   * side effect — it is the only way a file can become part of a comment at
   * all. Without it the Attach arm is unreachable and the chip row can only
   * ever be empty, which is the drawn absence this whole section is written to
   * refuse.
   */
  uploadAttachment?: (file: File) => Promise<EditorSlotUpload>;
  /**
   * Ticket-reference capabilities (Plan 7 Task 4, spec §14). Both optional and
   * additive, the same shape `EditorSlotProps.queryTickets`/`resolveTicketHref`
   * carry — this sheet cannot build them itself the way `queryUsers` is built
   * from the roster it already reads: `resolveTicketHref` needs the app's own
   * URL scheme (`ticketSheetPath`, in `apps/web`, which this package must never
   * import), so the whole pair travels in from the page as a prop, wired to
   * BOTH `<EditorSlot>` mounts below and to `<CommentsThread>`'s `ticketHref`.
   */
  queryTickets?: (query: string) => Promise<Array<{ ticketId: string; projectId: string; key: string; title: string }>>;
  resolveTicketHref?: (ref: { ticketId: string; projectId: string }) => string | null;
  /**
   * The ticket's standing audience, for the "Who can see this" section — **an
   * OVERRIDE, not the source.**
   *
   * **⚠ CORRECTED 2026-09-20.** This docblock read: *"Defaults to `undefined`,
   * which the section renders as the ABSENCE it is — and `undefined` is what
   * every caller passes today, because nothing serves it: `TicketRead` has no
   * visibility field and the shipped ticket route's wrapper carries no
   * provenance block."* **Both clauses were wrong, in opposite directions.**
   * The section does not render an absence by default any more: it defaults to
   * the sheet's OWN read — `ticketRead.visibility`, which now carries the
   * audience MODE off a wire that has served it since the endpoint existed. And
   * the prop is not "what every caller passes"; it is what NO caller passes,
   * which is why the sheet had to start reading it for itself.
   *
   * Supplying it still wins, and it is the only way to drive the section with a
   * roster and a provenance — a caller that HAS a fuller read passes one. The
   * read the sheet takes carries neither (see `TicketVisibility`), so the
   * default fills both with `null`.
   */
  visibility?: VisibilityClaim | null;
  /**
   * Whether this viewer may change who sees the ticket. **Defaults to `true`,
   * and the default is the honest one rather than the permissive one.**
   *
   * Spec §6 gives the power to project admins and the ticket's creator. Neither
   * fact is readable from this client: `Actor` is `{id, name}` with no role, and
   * `TicketRead` does not name a creator. The authority that DOES know is the
   * ingest door — `checkVisibilityPermission`
   * (`apps/server/src/permissions/check-permission.ts:743`) refuses a
   * `visibility.set` from anyone lacking project-admin rights or creatorship,
   * reporting `permission.role`, and the editor renders that refusal verbatim.
   *
   * Defaulting to `false` would hide the controls from exactly the people
   * entitled to use them, on a guess, with no way for them to discover the
   * power exists. Defaulting to `true` shows the control and lets the one place
   * that knows answer — which is the same argument `routes/invites.ts` makes
   * for gating `invite.sent` at the ingest door rather than in the handler: a
   * second answer to one question is free to drift from the first. A caller
   * that acquires a real read passes `false` and the controls go.
   */
  canSetVisibility?: boolean;
  /**
   * Opens ANOTHER ticket's sheet — the parent, from the subtasks section's
   * `Subtask of {parent}` chip (the prototype's `openParent`,
   * `desktop.dc.html@6d7b67c0a52c:3611`, which swaps the open sheet in place).
   *
   * ## Why this prop exists rather than the sheet opening it itself
   *
   * A ticket's sheet URL needs its PROJECT — `ticketSheetPath` is the shell's
   * one spelling of that URL — and the read this chip is built from does not
   * carry one: `ParentRef` is `{kind, id, title}` for a parent the viewer may
   * see (`view-types.ts`), the id and the name and nothing else. That is the
   * whole reason `TicketLocator` exists — *"Where a ticket lives, so the inbox
   * can open it"* — and it answers `null` rather than guessing when the server
   * will not place a ticket for this viewer.
   *
   * A parent may also sit in ANOTHER PROJECT (case 6.57 — nothing refuses it),
   * so this cannot reuse the calling page's own `openTicket`, which pushes the
   * CURRENT project's path and is correct only for rows in that project's list.
   *
   * ## Absent means the chip is NOT a control, and that is the honest arm
   *
   * Optional, like `canSetVisibility` and `uploadEvidence`: making it required
   * would force every existing mount to pass one. With no callback the chip
   * renders as the plain pill — the element that already carries the restricted
   * arm — so a caller that cannot open anything still gets the parent's name
   * rather than a button that does nothing. **A control that cannot be honoured
   * is the failure this repo refuses by name** (`canSetVisibility` above argues
   * the same fork from the other side).
   */
  onOpenTicket?: (ticketId: string) => void;
  /**
   * The footer's `Delete` committed — the ticket is now SOFT-deleted and the
   * host is told what it was, so it can say so.
   *
   * ## Why the HOST owns the message and the undo
   *
   * The prototype's `deleteTicket` (`desktop.dc.html:3795`) closes the sheet,
   * toasts *"<id> deleted · its history is retained"* and offers an Undo. **Two
   * of those three cannot happen here**: a sheet that closed cannot draw a toast
   * (`ticket-sheet.tsx` unmounts with it), and the Undo must outlive it. So this
   * component emits the event — it owns `dataSource`, and the refusal and
   * transport-error surfaces a REJECTED delete needs — and hands the committed
   * fact to its host, which owns closing, the toast, and `ticket.restored`.
   *
   * That split is the same one the inbox's bulk action records: *"the toast is
   * `position: fixed`, so its place in the tree is … an undo offered inside a
   * component whose own empty/loading/refused arms change underneath it"*.
   * Here it is stronger than a preference — the component is GONE by then.
   *
   * **Called ONLY on `committed`.** A refused or unanswered delete leaves the
   * sheet open with its own notice, and the host is told nothing: there is no
   * deletion to narrate.
   *
   * ## The KEY when there is one, the title when there is not
   *
   * The prototype toast says `"GN-1183 deleted · …"` — a ticket KEY. ⚠ **This
   * paragraph used to say "This product has no ticket key", and that stopped
   * being true thirteen minutes before it was written:** `ac18f2bc` landed
   * ticket keys at 13:04:40 IST on 2026-09-20, and this paragraph's own commit
   * `18d7e391` is at 13:17:51. It was briefly defensible in a narrower form —
   * the key was not ON THE WIRE until `277b5d22` at 23:07:56 that night — but
   * the sentence as written was about the product, and the product had them.
   * The detail door serves `key` and this very component reads it for its own
   * breadcrumb (`ticketRead.key ?? ticketRead.title`), so the second argument is
   * that same expression: the key when the workspace has a prefix, the title
   * when it does not. The toast therefore says what the prototype says wherever
   * a key exists, and still names the ticket where one does not.
   *
   * ## `{ permanent }` (trash Plan 4, D11)
   *
   * True when the delete dialog's **Delete permanently** switch was on AND the
   * mark committed. The host's Undo then sends `purge.unmarked` before
   * `ticket.restored`, in one batch — the server refuses a restore while the
   * ticket is marked (`UNMARK_FIRST_REASON`). Additive: a host that takes two
   * arguments is unaffected.
   */
  onDeleted?: (ticketId: string, name: string, outcome: { permanent: boolean }) => void;
  /**
   * The two names the breadcrumb above the title shows — the workspace's and
   * the project's — supplied by the host, which already holds both.
   *
   * ## Why they are PROPS and not a read, measured at `e9c1a04f`
   *
   * **`TicketRead` carries neither.** It is exactly seven fields
   * (`view-types.ts:404-458`): `ticket`, `title`, `stateProvenance`,
   * `assignedProvenance`, `visibility`, `parent`, `rollup`. **The count moved
   * from six to seven on 2026-09-20** when `visibility` was added, and the
   * citation was re-resolved by content in the same change set — the old
   * `:356-381` now names the `ResolvedVisibilityMode` / `TicketVisibility` block
   * that this change introduced. The claim the count carries is unchanged:
   * neither the workspace's name nor the project's is among them.
   * `BoardView` is
   * `{projectId, groups}` with no name, and `DataSourceQuery` has no
   * `getProjects` and no `getWorkspace` — its one name-carrying method,
   * `getMyWorkspaces()`, returns **every workspace and every project in them**,
   * which is a large read to answer a question about one project, and it would
   * arrive with its own loading and failure arms inside a component that
   * already draws three ways.
   *
   * The host has both already: `apps/web`'s project page computes
   * `useWorkspaceName(workspaceId)` and `useProjectName(workspaceId, projectId)`
   * at `:174-175` and has rendered them since the page existed (`:1611-1614`).
   * Passing them is also this sheet's own grain for host-supplied inputs —
   * `editorSlot`, `uploadEvidence`, `attachments`, `visibility` are all the
   * same shape.
   *
   * ## `undefined` and `null` both mean "no name", and ONE missing name drops the
   * ## WHOLE breadcrumb
   *
   * Deliberately not told apart, because the host cannot tell them apart: the
   * hooks return `null` while pending AND when the name is withheld
   * (`page.tsx:172`), and a crumb is drawn only for a real string. See the
   * derivation in the body for why printing the id — `my-work.tsx`'s rule for a
   * SERVED withheld name — would be asserting something this component does not
   * know here.
   *
   * And the nav is drawn WHOLE or not at all, because a crumb list missing its
   * middle level states a hierarchy the product does not have. That is not a
   * stylistic call: the failing version rendered `Workspace › State` for a
   * caller that passed one name, and every crumb in it was individually correct.
   */
  workspaceName?: string | null;
  projectName?: string | null;
  /**
   * WHERE THE WORKSPACE AND THE PROJECT CRUMBS GO (owner request, 2026-09-22:
   * *"the workspace and the project should also be clickable from the
   * breadcrumb"*).
   *
   * ## They are LINKS, and that is why the host supplies an href rather than a callback
   *
   * The ancestor crumbs above take `onOpenTicket` — a callback, because opening
   * one needs a SERVER LOOKUP first (`page.tsx`'s `openParentTicket` asks
   * `ticketLocation.locate`, since a parent may sit in another project). The
   * workspace and the project are LOCATIONS the host already knows, and a
   * location is an `<a href>`: middle-click, open-in-new-tab and
   * copy-link-address are the browser's, which no callback can give.
   *
   * **`app-core` cannot import Next's `Link`** — this package is
   * framework-neutral and already renders bare `<a href>` for an attachment
   * (`attachment-list.tsx:93`) — so the anchor is rendered here and the HOST
   * decides whether a click becomes an in-app navigation, through `onNavigate`.
   *
   * ## Absent means the crumb stays PLAIN TEXT, which is today's markup
   *
   * The same rule the callback-less ancestor crumb follows, recorded at
   * `ancestorCrumb`: *"a control that cannot be honoured is the failure this
   * repo refuses by name."* A host that has no route to push (a test harness, a
   * read-only embed) passes nothing and still gets the two names — it does not
   * get an anchor pointing nowhere.
   */
  workspaceHref?: string;
  /** See `workspaceHref`; the project crumb's destination. */
  projectHref?: string;
  /**
   * The host's client-side router, if it has one. Called with the href of the
   * crumb clicked, AFTER `event.preventDefault()` — so a plain left click
   * routes in-app while a modified click (`metaKey`/`ctrlKey`/`shiftKey`/
   * `altKey`) and a non-primary button are left to the browser, which is the
   * whole reason these crumbs are anchors.
   *
   * **Absent means the anchor navigates NATIVELY**, and the default is not
   * consumed. That is the right arm for a host that renders the sheet inside a
   * plain document rather than an app shell, and it is asserted rather than
   * assumed.
   */
  onNavigate?: (href: string) => void;
  /** See `NewTicketDialogProps.lookupPerson`: present → the Assignee picker offers the outsider arm. */
  lookupPerson?: LookupPerson;
  /** See `CreateTicketFlowProps.assignOutsider`: an outsider pick's `ticket.assigned` goes through it. */
  assignOutsider?: AssignOutsider;
};

/**
 * The whole ticket: state with its provenance, every field wearing the claim
 * that set it, the parent as the read model saw it, and the ledger behind a
 * tab with BOTH clocks on every line.
 *
 * ## Per-field attribution is the point, not decoration
 *
 * A field row is a VALUE plus WHO claimed it and WHEN — the server-recorded
 * when, because that is the one the system can vouch for; the claimed clock
 * sits beside it in the history tab where the two can be compared. A value with
 * no claim beside it reads as a property the ticket has, which is precisely the
 * laundering invariant 4 forbids: nothing here is a standing fact, everything
 * is somebody's claim.
 *
 * A nameless actor renders by ID through `actorLabel` — never blank, never
 * "system". `nameOf` below is the only join, and it is total by construction.
 *
 * ## THREE ADAPTATIONS from the plan's snippet, each measured
 *
 * 1. **`useLiveQuery` takes a query KEY third** (ruling P17). The plan's four
 *    calls pass three arguments. Without a key the hook keys its refetch on
 *    nothing, and the previous ticket's answer stays on screen under the new
 *    ticket's heading.
 * 2. **The workflow is derived from the read this sheet already has, at the
 *    ticket's PINNED version.** The plan's snippet calls `getTicket` a second
 *    time inside the workflow loader and then asks for the latest definition.
 *    That is two round trips for one fact and two refusal paths for one
 *    failure — and asking for `latest` is wrong besides: a ticket pins the
 *    version it was created under (owner decision 2026-08-26), so the latest
 *    definition may not contain the ticket's own `stateId`, and
 *    `transitionOptions` would then quietly offer only the wildcard edges. The
 *    key carries the workflow id AND version, so a rebind or a publish
 *    refetches.
 * 3. **The ledger payload is the SHIPPED spelling.** See `submitTransition`.
 *
 * ## What this sheet does when the read FAILS
 *
 * `useLiveQuery` surfaces a failed read as `error` with `data` left null, and
 * this renders its own text, under its own class, and not a sheet. Deliberately
 * a different branch from "loading": a failure drawn under the word "Loading…"
 * is a wait that never ends dressed as a wait that will.
 *
 * **This section used to say `getTicket` REFUSES PERMANENTLY** — a
 * `proj_visibility` row with no `title`, no provenance and no `TicketState`.
 * **Ruling P25 deleted that absence from `SERVING_GAPS`** — which has since gone
 * EMPTY, `search` having been its last key and served 2026-09-19 (this read
 * "which now carries ONE key, `search`", corrected 2026-09-20);
 * `getTicket` maps through `mapTicketRead`
 * (`mappers.ts:1672`). So it answers, a failure is ordinary and a retry can
 * clear it. **Why the branch exists did NOT change:** `data` is null on a
 * failure AND on a real absence, and an error must never render as an absence.
 *
 * ## And what it does when the read ANSWERS `null` (E4-23, 2026-09-21)
 *
 * A fourth arm, between the failure and the wait, and it exists because `data`
 * being null was doing THREE jobs rather than two. `getTicket` returns the
 * transport's 404 affordance — `createHttpClient` answers `null` for a 404 on a
 * GET, deliberately, because every `/v1` read door sends ONE frozen body for "no
 * such thing" and for "not yours" (`READ_NOT_FOUND_BODY`,
 * `apps/server/src/routes/tickets.ts`) and a client that told them apart would be
 * inventing the existence oracle the server refused to provide. So a mistyped id,
 * a soft-deleted ticket and a ticket this viewer may not see are ONE answer, and
 * that answer was drawn as `Loading…` — a server refusal rendered as a wait that
 * never ends, measured on a live page at 2.5 s, 8.5 s, 18.5 s and 61 s.
 *
 * `useLiveQuery` now reports `settled`, so the three states are told apart:
 * `data === null && !settled` is the wait, `data === null && settled` is that one
 * refusal, and each renders its own words. **The sentence names both readings** —
 * *"This ticket is not here — it may have been deleted, or you may not be able to
 * see it."* — because naming only one of them would be this screen making the
 * distinction the server declined to make.
 *
 * `HistoryTab` (below) applies the SAME three-way distinction to the ledger tab.
 */

/**
 * How many field rows the sheet draws BEFORE the generic custom-field loop — the
 * fixed rows `State · Assignee · Priority · Due · Start · Type · Visibility`, in
 * that order (spec 2026-09-22, decision 12). It exists so the loop's tint index
 * continues the fixed rows' alternation instead of restarting at zero, which
 * would put two tinted rows side by side at the seam.
 *
 * ⚠ **THIS DOCBLOCK CLAIMED `16.116` WAS THE WITNESS, AND IT IS NOT — the claim
 * was measured false and is corrected rather than deleted.** `16.116` renders the
 * DEFAULT fixture, whose `state.fields` is `{title, dueDate}` and whose two
 * entries are BOTH in `OWN_ROW_FIELD_IDS` below — so the loop draws nothing and
 * this constant is never read. Mutating it to `6`, which ships a doubled band on
 * any ticket with a custom field, left **160 of 160 cases passing**.
 *
 * **The witness is `16.129`**, which carries a custom field so the loop really
 * runs, and it pins the seam from both sides. It earned that role on its first
 * run by failing: the loop's index was counting EXCLUDED entries, so the seam was
 * misaligned for every real ticket — see the filter's own comment at the loop.
 * The lesson is in the constant's history: a count with no fixture that exercises
 * it is a number, not a guarantee.
 */
const FIXED_FIELD_ROWS = 7;

/**
 * The field ids that have their OWN row on this sheet, so the generic loop must
 * skip them — `title`, `description`, `dueDate`, `startDate` and `priority`.
 *
 * A `Set` rather than the chain of `||` comparisons it replaces, and the reason is
 * the tint index rather than taste: the loop now FILTERS on these ids before
 * mapping, so the index it passes to `fieldRowClass` counts RENDERED rows only.
 * As an early `return null` the same list consumed a position for every skipped
 * field, and since `title` is on every ticket the shift was the normal case, not
 * an edge one. Keeping the ids in one declared place is also what makes the list
 * checkable against the rows drawn above it.
 */
const OWN_ROW_FIELD_IDS: ReadonlySet<string> = new Set([
  'title',
  'description',
  'dueDate',
  'startDate',
  'priority',
]);

/**
 * The class the alternating field grid puts on row `index` — tinted on every
 * SECOND row, from the prototype's `rowLabelB`/`rowValueB` pair
 * (`desktop.dc.html:3755-3756`).
 *
 * A function over an index rather than a `:nth-child` rule, and the reason is
 * measured rather than stylistic: the grid is a `<dl>` of `<div>` wrappers, so
 * `:nth-child` would count the WRAPPERS — which happens to agree today and would
 * silently stop agreeing the moment a row renders a conditional sibling. The
 * index is passed in by the site that knows the order, and `16.116` reads the
 * result rather than the rule.
 */
function fieldRowClass(index: number): string {
  return index % 2 === 1
    ? 'gn-ticket-sheet__field gn-ticket-sheet__field--tinted'
    : 'gn-ticket-sheet__field';
}

/**
 * The title control: a `<textarea>` that starts one row tall and GROWS with its
 * content, styled as a heading (`.gn-ticket-sheet__title-input`).
 *
 * WHY NOT AN `<input>` (visual-fixes V2, 2026-09-30). The title is 26px/700 and
 * the header's free width is about 400px beside the Full screen pill and the
 * close button — a 60-character title needs roughly 870px. An `<input>` never
 * wraps, so no flex arrangement can show every character of it; only a wrapping
 * control can.
 *
 * WHAT A TEXTAREA CHANGES, AND IS HELD BACK HERE: a text input strips line breaks
 * from what is pasted into it and a textarea keeps them, so `onChange` folds
 * every run of `\r`/`\n` into one space; Enter is the caller's commit key and
 * its `preventDefault` means it never inserts a newline. The height is set from
 * `scrollHeight` (rather than `field-sizing: content`) so it works in every
 * browser the web and desktop shells run in, and it is re-fitted when the width
 * changes (full screen, a resized window), which re-wraps the text.
 */
function TitleField({
  value,
  disabled,
  onChange,
  onBlur,
  onKeyDown,
}: {
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}): ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = (): void => {
    const el = ref.current;
    if (el === null) return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(fit, [value]);
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return undefined;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <textarea
      ref={ref}
      className="gn-ticket-sheet__title-input"
      rows={1}
      aria-label="Ticket title"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value.replace(/[\r\n]+/g, ' '))}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * What a claim line says while its field's write is open or its read has not landed (smoothness T7): the overlay
 * carries no actor and no time, so no "set by … on …" is printed for a value nobody has stamped yet.
 */
const SAVING_CLAIM = 'Saving…';

export function TicketSheet({
  dataSource,
  cache,
  workspaceId,
  ticketId,
  hint,
  currentUserId,
  canModerateComments,
  onClose,
  editorSlot,
  uploadEvidence,
  attachments,
  attachmentsUnavailable,
  uploadAttachment,
  queryTickets,
  resolveTicketHref,
  visibility,
  canSetVisibility = true,
  onOpenTicket,
  onDeleted,
  workspaceName,
  projectName,
  workspaceHref,
  projectHref,
  onNavigate,
  lookupPerson,
  assignOutsider,
}: TicketSheetProps) {
  const EditorSlot = editorSlot ?? PlainTextEditorSlot;
  const [tab, setTab] = useState<'details' | 'history' | 'attachments'>('details');
  // Unit 5(b), owner: "I thought we already made the attachment feature but
  // i dont see where we can attach files in our build" — the Attachments
  // tab's own "Attach a file" (prototype `addFile`, `desktop.dc.html:1363-
  //1366`). `attachTabInputRef` is the hidden file input the button clicks;
  // `attachTabRefusal` is a LOCAL failure sentence, not `attachRefusals`
  // (that Toast is specifically for notes a COMMENT implied and does not fit
  // a plain upload failure).
  const attachTabInputRef = useRef<HTMLInputElement | null>(null);
  const [attachingTab, setAttachingTab] = useState(false);
  const [attachTabRefusal, setAttachTabRefusal] = useState<string | null>(null);
  /**
   * Full screen (sheet prototype parity, 2026-09-20). Local state, like `tab`:
   * it is a way of LOOKING at this sheet rather than anything the server holds,
   * and nothing outside `Sheet` needs to know.
   */
  const [sheetFull, setSheetFull] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  // The sheet's phone arm is the same 40rem as the board's (`use-phone-board.ts`), so the one query serves both.
  const phone = usePhoneBoard();
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  // The outsider arm of the Assignee row (access plan W6) — state lives up here, not in the row's IIFE.
  const [findingOutsider, setFindingOutsider] = useState(false);
  // Who was just pulled in through the finder, so the picker can NAME them while
  // the roster (which hides guests from non-admins) cannot.
  const [pickedOutsider, setPickedOutsider] = useState<{ userId: string; name: string } | null>(null);
  /**
   * How many moves have COMMITTED. Bumped beside `setMoveOpen(false)` on the
   * success path and used as `TransitionDialog`'s `key`, so a committed move is a
   * fresh dialog the next time it opens (E2-32, 2026-09-21) while a Cancel —
   * which does not bump it — still preserves what was typed. The reason is at the
   * bump site; the short version is that the dialog's own `!open` effect serves
   * Cancel and Commit alike and can only honour one of them.
   */
  const [movesCommitted, setMovesCommitted] = useState(0);
  const [serverRefusal, setServerRefusal] = useState<{ rule: string; reason: string } | null>(null);
  /**
   * Ruling 33 (fix round 2, 2026-09-17) — Close/Reopen's OWN transport-error
   * slot, separate from `serverRefusal`. Ruling 27 (board-prototype-port,
   * cited on `board.tsx`'s identical pair) is the reason the two must stay
   * apart: `serverRefusal` carries only what the engine actually adjudicated
   * — a real `{rule, reason}` pair the door or the rule engine wrote — and a
   * silence or a dropped connection is not that, however much it might read
   * the same wrapped in the "Refused by the server: …" sentence. Filed here
   * (fix round 1) as `serverRefusal` under a synthetic `ingest-rejected` rule
   * name until this ruling gave it a proper slot.
   */
  const [transportError, setTransportError] = useState<string | null>(null);
  /**
   * A THIRD slot, and the third distinct fact: something the editor itself
   * could not do, where the server was never asked.
   *
   * The two slots above both describe an answer, or the absence of one, to a
   * claim this sheet sent. This one describes a claim that was never sent. The
   * editor slot states its own capability gaps rather than pretending — with no
   * `uploadAttachment` wired a pasted file is REFUSED, not silently dropped
   * (`TicketEditorSlot.uploadOrRefuse`) — and it reports that through `onError`,
   * which reaches a user through THIS slot or through nothing at all. Folding it
   * into `transportError` would say a connection failed; folding it into
   * `serverRefusal` would claim the server adjudicated. Neither happened.
   *
   * Named for the same reason Ruling 27 keeps the other two apart: one sentence
   * for one fact. Its tone is `--gn-warning` rather than `--gn-danger`, sharing
   * `.gn-refusal--preview`'s rule, because a capability this build does not have
   * is not a refusal of anything the person did.
   */
  const [editorError, setEditorError] = useState<string | null>(null);
  /**
   * Refusals from the attachments a posted comment IMPLIED (Plan 7 Task 5,
   * spec §14.3, D28) — one line per note `attachmentsImpliedBy` tried and
   * failed to attach, shown together in this sheet's own `Toast`. A comment's
   * own posting refusal stays on `serverRefusal`, the same slot every other
   * ticket-write refusal uses; this is a SEPARATE slot because the comment
   * that implies these attachments has already committed by the time any of
   * them can fail — D28's own rule, "the comment stays posted" — so the two
   * facts must be drawable at once rather than one overwriting the other.
   */
  const [attachRefusals, setAttachRefusals] = useState<string[]>([]);
  /**
   * The title control's draft — `null` MEANS "not editing", and that is the
   * whole mechanism rather than a flag beside one.
   *
   * The input's value is `titleDraft ?? ticketRead.title`, so the server's title
   * is what shows until somebody types, and a commit or an Escape returns to it
   * by setting this back to `null`. **Nothing syncs the two with an effect, and
   * that is deliberate:** an effect keyed on `ticketRead.title` would clobber an
   * in-flight draft on every reload, and this sheet reloads after every commit
   * and on every socket frame.
   */
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [titleSaving, setTitleSaving] = useState(false);
  /**
   * The title edit's re-entrancy guard, and it must be a REF rather than the
   * `titleSaving` state above — see `submitTitle`'s docblock for the measurement
   * (a browser blurs the field when `disabled` lands, so one Enter can fire a
   * second commit out of the first one's own `onBlur`).
   */
  const titleSubmittingRef = useRef(false);
  /**
   * RULING E5-6 (2026-09-21) — the Due row's EDITOR, which until this ruling
   * was the product's clearest example of a fact it acts on and cannot accept.
   *
   * The state is the title control's, one row down and for the same reasons:
   * `dueDraft === null` MEANS "not editing" rather than travelling beside a
   * flag, `dueSaving` drives `disabled`, and `dueSubmittingRef` is the
   * synchronous re-entrancy guard `submitDueDate`'s docblock explains — a REF,
   * because `disabled` is what makes a browser blur the field and fire a second
   * commit out of the first one's own `onBlur`.
   *
   * The draft holds the input's own value, an IST day (`YYYY-MM-DD`) or the
   * empty string a cleared `type="date"` reports — never the formatted label.
   */
  const [dueDraft, setDueDraft] = useState<string | null>(null);
  const [dueSaving, setDueSaving] = useState(false);
  const dueSubmittingRef = useRef(false);
  /**
   * The Priority row's segmenting, and the Start row's date editor (spec
   * 2026-09-22). Two pairs of guards with the Due row's reasons verbatim —
   * `prioritySubmittingRef`/`startSubmittingRef` are synchronous re-entrancy
   * guards and are REFS rather than read off `…Saving`, which is render state
   * and useless for the job: two commits inside one React batch both read the
   * pre-commit `false`.
   *
   * Priority has NO draft, and that is the difference from Due rather than an
   * omission: a segmented control has no half-typed state — a click IS the
   * value — so there is nothing to hold between the press and the answer.
   */
  const [prioritySaving, setPrioritySaving] = useState(false);
  const prioritySubmittingRef = useRef(false);
  /**
   * START'S OWN DRAFT, and a second copy of Due's state is the price of two
   * rows rather than an oversight: the two are TWINS by design (the same
   * `<input type="date">`, the same commit-on-blur-and-Enter, the same
   * Escape-abandons-draft, the same absent copy), and each needs its own draft
   * or editing one would visibly type into the other. A shared hook would be
   * the right shape for a third row and is not worth the indirection for two.
   */
  const [startDraft, setStartDraft] = useState<string | null>(null);
  const [startSaving, setStartSaving] = useState(false);
  const startSubmittingRef = useRef(false);
  /**
   * Ruling 32 (fix round 1, 2026-09-17) — the double-submit latch for
   * Close/Reopen, mirroring `board.tsx`'s `MoveArrows.submitting`
   * (`:956`/`:1029-1035`'s own docblock on why `finally`). Without it a
   * rapid double-click fires a second `ticket.closed`/`ticket.reopened`
   * ingest before the first one's answer returns — this sheet has no arrow
   * pair to double-click through, but the same click-then-await window
   * exists on ONE button. Scoped to Close/Reopen only: `Move…` opens a
   * dialog with its own submit and its own concerns, untouched here.
   */
  const [submitting, setSubmitting] = useState(false);
  /**
   * RULING E2-35 (2026-09-21) — WHETHER THE DELETE'S CONFIRMATION IS OPEN.
   *
   * Declared HERE, with the sheet's other state, and that placement is
   * load-bearing rather than tidy: the sheet returns EARLY while its read is
   * erroring or loading (`:635`, `:643`), so a `useState` declared beside the
   * footer it opens would be a hook called after a conditional return. Measured
   * — putting it there took **112 of 116 cases** red with *"React has detected a
   * change in the order of Hooks called by TicketSheet"*.
   *
   * ## What the confirmation is for
   *
   * The footer's `Delete` performed the delete on ONE press. Its own docblock
   * argues the control is offered to everyone and the SERVER decides — an
   * argument about PERMISSION that says nothing about confirmation. Meanwhile
   * the product reaches **the same soft delete** on many tickets through a whole
   * confirmation surface (`bulk-close-dialog.tsx`: a dialog, per-row outcomes,
   * its own failure copy, "confirm" five times). So a multi-ticket close needed
   * a decision point and a single-ticket delete did not — although the single
   * one is the harder to notice and easier to trigger by accident, and it is
   * gated on project-admin rights, which is the product's own signal that the
   * act is consequential. Two measured facts make the press costly: it removes
   * the ticket from every view (`LIVE_TICKET_WHERE`), and its inverse used to
   * expire with the toast alone (this batch's E2-30 added the page-level route).
   *
   * ## What this does NOT do, and why each omission is deliberate
   *
   * **The control is NOT hidden** — the docblock beside `onDeleteCommitted` is right
   * that a hidden control cannot explain itself, and the finding says so in as
   * many words. This asks; it does not conceal.
   *
   * **The accept is NOT gated on a local `precheck`, though the finding offers
   * that.** `precheck` runs the shared engine, and the deletion door's own
   * docblock (`packages/rule-engine/src/checks/deletion.ts`) states what that
   * engine cannot see: *"AUTHORIZATION is not here. 'Only a project admin can
   * delete a ticket' is `checkVisibilityPermission`'s sixth check … because
   * authority is resolved from membership and **is not a pure function of the
   * envelope — this engine's context carries no membership at all**."* A local
   * gate would therefore answer every question about this delete EXCEPT the one
   * that makes it consequential, and would add a second refusal site whose
   * wording could differ from the server's. The server stays the authority, and
   * its refusal still renders verbatim in this sheet's own slot.
   *
   * **The dialog's own sentence names what a person can actually DO.** Two
   * routes back, because that is what the product now has: the toast's Undo for
   * the ruled 15 seconds (the host owns it) and the page strip this batch added.
   * Saying "its history is retained" alone would be the same misleading half
   * E2-30 corrected in the toast's own sentence.
   *
   * ## Amended by trash Plan 4 (spec §6.1, D6)
   *
   * The confirmation is now `DeleteDialog`, the one every delete door opens. Its
   * note replaces the sentence above about "two routes back": Deleted items on
   * the Account page is the durable route that now exists, and the note names it.
   */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /**
   * The new-subtask field (door F, 2026-09-19), and its own double-submit
   * latch and refusal slot — the same pair `submitting`/`editorError` keep for
   * Close/Reopen, for the same reason: a rapid double-click would otherwise
   * create the same child twice, and this sheet has ONE button to click.
   *
   * `''` is the input UNTOUCHED and it is not special-cased here: the field is
   * submitted as typed, and `ticketCreatedPayload`'s own title rule refuses a
   * blank with its own sentence — the prototype's refusal, *"Give the subtask a
   * title — it is a ticket of its own"*, is the presentation of that answer.
   */
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskRefusal, setSubtaskRefusal] = useState<string | null>(null);
  /**
   * The reopen offer for Add subtask under a TERMINAL parent (2026-09-30) — set
   * when the server answers the child's `ticket.created` with
   * `hierarchy.parent-terminal`, cleared on Cancel or a settled attempt. The
   * refused claim rides along so an accepted reopen resubmits the SAME envelope
   * (an interactive refusal records nothing, so its event id is still unused),
   * exactly as the create flow does.
   */
  const [subtaskReopen, setSubtaskReopen] = useState<
    (ReopenOffer & { childEvent: SubmittedEvent; refusal: Refusal }) | null
  >(null);
  const [subtaskParentRefusal, setSubtaskParentRefusal] = useState<Refusal | null>(null);

  // `cacheKey`s (T7 F3): reopening a ticket this session shows its last answer at once while the fresh read lands.
  const read = useLiveQuery(dataSource, workspaceId, ticketId, () => dataSource.query.getTicket(workspaceId, ticketId), {
    cacheKey: `ticket:${ticketId}`,
  });
  // Every edit is shown at once and rolled back honestly (smoothness T7, spec S5; `optimistic-ticket.ts`).
  // `read` stays the DATA (the workflow, the subtasks and the reloads below ask it); what is DRAWN is `optimistic.ticket`.
  const optimistic = useOptimisticTicket(read, ticketId);
  const ticketState = read.data?.ticket ?? null;
  // The ticket's own answer wins; until it lands, the opener's hint starts the workflow read (F3).
  const workflowRef =
    ticketState !== null
      ? { id: ticketState.workflowId, version: ticketState.workflowVersion }
      : hint === undefined
        ? null
        : { id: hint.workflowId, version: hint.workflowVersion };
  const workflowKey = workflowRef === null ? '' : `${workflowRef.id}@${workflowRef.version}`;
  const workflow = useLiveQuery(
    dataSource,
    workspaceId,
    workflowKey,
    async () => (workflowRef === null ? null : dataSource.query.getWorkflowDef(workspaceId, workflowRef.id, workflowRef.version)),
    workflowRef === null ? undefined : { cacheKey: `wf:${workflowKey}` },
  );
  const members = useLiveQuery(dataSource, workspaceId, workspaceId, () =>
    dataSource.query.getMembers(workspaceId),
  );
  /**
   * The names-only read, for the people the roster omits — a guest, for a plain
   * member's roster. It feeds `nameOf` (labels) and NOTHING ELSE: `members`
   * above is what the pickers and the visibility editor offer, and a guest must
   * not be offered there. One-time, not live — see `useActorNames`.
   */
  const actorNames = useActorNames(dataSource, workspaceId);
  const history = useLiveQuery(dataSource, workspaceId, `${ticketId}:history`, () =>
    dataSource.query.getTicketHistory(ticketId, undefined, HISTORY_PAGE_LIMIT),
  );
  /**
   * The comment thread.
   *
   * **Read HERE rather than passed in as a prop, and the difference from
   * `attachments` is deliberate.** `attachments` arrives from the page because
   * the page already held that query; this one is owned by the sheet for the
   * same reason `read` and `history` are: the sheet is what WRITES a comment,
   * and a write that cannot reload the read it just changed would show the
   * author a thread without their own comment in it until something else
   * happened to refetch. The key carries the ticket id for the P17 reason the
   * attachments query states — opening another ticket must not show the
   * previous ticket's thread under the new one's heading.
   */
  const comments = useLiveQuery(dataSource, workspaceId, `${ticketId}:comments`, () =>
    dataSource.query.getTicketComments(workspaceId, ticketId),
  );
  /**
   * The ticket's attached notes (Plan 7 Task 5, spec §14.3) — LIFTED here from
   * `TicketNotesSection`, which used to own this query itself (Plan 6). The
   * sheet's own `submitComment` needs the SAME `data` to compute
   * `alreadyAttached` and to `reload()` after an implied attachment commits,
   * so both it and the section now read the one instance rather than each
   * keeping a query that could answer differently for a moment.
   */
  const notes = useLiveQuery(dataSource, workspaceId, `${ticketId}:notes`, () =>
    dataSource.query.getNotesForTicket(workspaceId, ticketId),
  );
  /**
   * `queryNotes` for the shared editor's `:note`/`[[` picker (spec §14, D26),
   * on BOTH `<EditorSlot>` mounts below — caught by a final review (case
   * 18.285): `queryTickets`/`resolveTicketHref` reached both mounts, but
   * nothing built or forwarded a `queryNotes`, so a REAL ticket description
   * or comment could not insert a note reference at all, leaving D27's own
   * headline ("tag a note in a ticket comment") reachable only through a
   * stub editor in tests. Unlike `queryTickets`, this needs no page-supplied
   * prop: `dataSource` and `workspaceId` are already in scope, so it is built
   * the same way `note-document.tsx`'s own `queryNotes` is — a client-side
   * substring filter over a list fetched ONCE.
   *
   * A second final-review pass (case 18.288) caught that the first version
   * fetched this list through `useLiveQuery`, which refetches on EVERY
   * workspace stream frame for as long as the sheet stays open — a real
   * cost paid on every unrelated ticket edit in a busy workspace, for a
   * picker that may never open. `note-document.tsx`'s own `queryNotes` was
   * already a one-time `useEffect` fetch, not a live query — this now
   * matches it, and is therefore NOT one of `ticket-sheet.test.tsx`'s "live
   * reads" (that ratchet counts `useLiveQuery`/stream subscriptions only).
   */
  const [workspaceNotesForPicker, setWorkspaceNotesForPicker] = useState<Array<{ noteId: string; title: string }>>(
    [],
  );
  useEffect(() => {
    let cancelled = false;
    dataSource.query.getNotes(workspaceId).then(
      (rows) => {
        if (!cancelled) setWorkspaceNotesForPicker(rows);
      },
      () => {
        if (!cancelled) setWorkspaceNotesForPicker([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, workspaceId]);
  const queryNotes = async (query: string): Promise<Array<{ noteId: string; title: string }>> => {
    const needle = query.trim().toLowerCase();
    const hits: Array<{ noteId: string; title: string }> = [];
    for (const candidate of workspaceNotesForPicker) {
      if (needle !== '' && !candidate.title.toLowerCase().includes(needle)) continue;
      hits.push({ noteId: candidate.noteId, title: candidate.title });
      if (hits.length === 8) break;
    }
    return hits;
  };
  /**
   * The ticket's CHILDREN (door F, 2026-09-19) — derived from the list read the
   * client already makes, NOT from a new route.
   *
   * ## Why the list read is the honest source, measured rather than assumed
   *
   * A child is a ticket whose `parentId` is this one (`entity-state.ts:30`), and
   * every `ListRow` carries `parentId` (`view-types.ts:266`). Three things had
   * to hold before deriving them here rather than adding a route, and all three
   * were measured:
   *
   * 1. **The read is NOT single-page.** `getTickets` walks the server's cursor
   *    to exhaustion (`online-data-source.ts`), so no child is lost to a page
   *    boundary.
   * 2. **The filter is EMPTY, so it cannot exclude a child.** `FilterSpec` with
   *    every axis absent means "all" — including closed ones. A filtered call
   *    would silently omit a closed child, which is the exact failure this
   *    section would otherwise introduce.
   * 3. **It REFUSES rather than truncating.** Past `LIST_ROW_CAP` (2000 rows)
   *    the walk throws `ServingGapError` — *"never 'we happened to stop'"* in
   *    its own words — so a project too large to read completely produces a
   *    refusal the sheet can present, never a short list that looks right.
   *
   * ## And a SECOND guard, independent of all three
   *
   * The server already sends the number of children: `rollup.totalChildren`
   * counts them all and `restrictedCount` names the ones this viewer may not
   * see (`formatRollup` renders both together for exactly that reason). So the
   * derived list is RECONCILED against it below, and a disagreement is reported
   * rather than rendered — see `subtasksIncomplete`. Two independent checks on
   * the same claim, because the failure they guard is a silently short list.
   */
  /**
   * **The key CARRIES the project id, and that is not a detail.** A key of
   * `${ticketId}:subtasks` alone is registered on the first render — when
   * `read.data` is still null — runs once, answers `[]`, and NEVER re-runs,
   * because nothing in the key changed when the ticket arrived. The workflow
   * query one screen up dodges the identical trap by keying on
   * `workflowId@version`, a value that only exists once the ticket has landed;
   * this does the same with `projectId`. Found by the cases below failing: four
   * of them passed children in and the section listed none.
   */
  const subtasksKey = `${ticketId}:subtasks:${read.data?.ticket.projectId ?? ''}`;
  const subtasks = useLiveQuery(dataSource, workspaceId, subtasksKey, async () => {
    const current = read.data?.ticket ?? null;
    if (current === null) return [];
    const page = await dataSource.query.getTickets(current.projectId, {}, 'flat');
    return page.rows.filter((row) => row.parentId === ticketId);
  });
  /**
   * The workspace's ticket type ladder (door G, 2026-09-19) — read ONLY to put a
   * NAME on the `Type` row.
   *
   * **`state.typeId` is a domain concept; the word "Defect" is not in the ticket
   * at all.** The id is what the state carries (`entity-state.ts:29`), and the
   * ladder is the one place a person-readable name lives —
   * `getTicketTypes(workspaceId)` (`data-source.ts:147`, the thirteenth method),
   * which the sheet did not previously read.
   *
   * **The key is the WORKSPACE and nothing narrower, which is correct here and
   * would not be for the subtasks read above.** A ticket's type is fixed at
   * creation and the ladder changes rarely, so this read does not depend on the
   * ticket having arrived — there is no `read.data` in its body and so none of
   * the "runs once and never again" trap that the subtasks key had to dodge.
   */
  const ticketTypes = useLiveQuery(dataSource, workspaceId, `${workspaceId}:ticket-types`, () =>
    dataSource.query.getTicketTypes(workspaceId),
  );

  /**
   * Trash Plan 3 — which chips in this ticket's STORED documents point at
   * permanently erased items. Hooks run before the early returns below, so the
   * documents are read off `read.data` rather than off `descriptionClaim`.
   */
  // Two predicates, one session cache: the description's editor waits only for
  // the description's own chips (Task 8), never for the thread's.
  const purgedDescription = usePurgedPredicate(
    dataSource.query,
    [read.data?.ticket.fields['description']?.value],
    read.data !== null,
  );
  const purgedComments = usePurgedPredicate(
    dataSource.query,
    (comments.data ?? []).map((comment) => comment.body),
  );

  if (read.error !== null) {
    return (
      <Sheet open title="Ticket" onClose={onClose}>
        <p className="gn-ticket-sheet__refusal">{read.error}</p>
      </Sheet>
    );
  }

  // **The read ANSWERED `null` — a distinct state from "not answered yet" (E4-23,
  // 2026-09-21).** `null` is the transport's deliberate 404 affordance: every `/v1`
  // read door answers ONE frozen body for "no such thing" and for "not yours"
  // (`apps/server/src/routes/tickets.ts`, `READ_NOT_FOUND_BODY`), so a mistyped id,
  // a soft-deleted ticket and a ticket this viewer may not see all arrive here as
  // `null` and are deliberately indistinguishable. Gating on `data === null` alone
  // drew all three as `Loading…` — a server refusal rendered as a wait that never
  // ends, measured at 61 s on a live page. The sentence names BOTH readings because
  // the one-body refusal is exactly the reason the server will not say which.
  if (read.data === null && read.settled) {
    return (
      <Sheet open title="Ticket" onClose={onClose}>
        <p className="gn-ticket-sheet__absent" data-testid="sheet-ticket-absent">
          This ticket is not here. It may have been deleted, or you may not be able to see it.
        </p>
      </Sheet>
    );
  }

  if (read.data === null) {
    return (
      <Sheet open title="Ticket" onClose={onClose}>
        <p className="gn-ticket-sheet__loading">Loading…</p>
      </Sheet>
    );
  }

  const ticketRead: TicketRead = optimistic.ticket ?? read.data;
  /**
   * What the "Who can see this" section draws, from the ONE read this sheet
   * already made — with the caller's `visibility` prop winning when one is
   * passed, because a caller holding a fuller read is a better source than this
   * one.
   *
   * The two `null`s are the point rather than a placeholder. `TicketRead.
   * visibility` carries the audience MODE and only the mode: the roster is cut
   * from the wire by a standing disclosure ruling and the provenance is on the
   * ledger, not in the projection. Annotating this `VisibilityClaim` — which is
   * required precisely so that the two absences are VISIBLE here rather than
   * inferred — forces the widening to be written out. Filling either with
   * something else would be this sheet inventing an audience or an actor.
   */
  const standingVisibility: VisibilityClaim | null =
    visibility ??
    (ticketRead.visibility === null
      ? null
      : { ...ticketRead.visibility, userIds: null, claim: null });
  // `actorLabel` STAYS the outer renderer and that is not a leftover: this
  // function names CLAIMS as well as people — "Closed by Auto-close on …" comes
  // through here — and the system-actor step is what keeps a roster row from
  // renaming a decision no person made. What changed (2026-09-22) is the LABEL
  // it is handed: `memberLabel` (name → email → id) rather than the raw
  // display name, so the magic-link population reads as their address here
  // instead of as an empty string. A member neither source covers is still `null`,
  // and `actorLabel`'s own floor (`Unknown person`, R3 N4) answers for it.
  const nameOf = (userId: string): string =>
    actorLabel(userId, actorLabelFrom(userId, members.data, actorNames));
  const make = makeSubmittedFactory({ actorId: currentUserId, origin: 'web' });

  /**
   * The instant preview, advisory only. With no cache there is no local state
   * to evaluate against, and `not-evaluated` is the honest answer — a `passed`
   * manufactured out of absence is the one thing `precheckEvent` exists to
   * refuse.
   *
   * The candidate carries the SHIPPED payload spelling. It has to:
   * `precheckEvent` runs the shared engine, and `evaluateTicketTransitioned`
   * parses the payload with `ticketTransitionedPayloadSchema` before it does
   * anything else — a `{ toStateId }` payload does not merely fail to preview,
   * it comes back as a REFUSAL naming the client's own payload as malformed,
   * which is a refusal about this code shown to a user as if it were about
   * their move.
   *
   * `fieldValues` is the OTHER half of "what the submission will carry", and it
   * travels by a different road for a reason worth stating: `require-comment`
   * and `require-evidence` are read from the CANDIDATE, so their values go into
   * the payload above; `require-field` is read from the TICKET STATE
   * (`rule-engine/src/rules/require-field.ts:9`), so a payload key could not
   * reach it at all. The dialog's collected field values therefore ride
   * `pendingFields`, which applies them to the ticket the engine sees — the
   * preview's stand-in for the ordered batch the real path sends.
   */
  const precheck = async (
    toStateId: string,
    evidenceAttachmentId?: string | null,
    fieldValues?: Record<string, string>,
    comment?: string,
  ): Promise<PrecheckResult> => {
    if (cache === undefined) return { kind: 'not-evaluated', why: 'missing-local-state' };
    // The candidate must carry WHAT THE SUBMISSION WILL CARRY, or the engine
    // evaluates a claim nobody is about to make — and `require-evidence` is
    // exactly that case: an absent id reads as "none was provided" and the
    // preview refused a move the user had just satisfied. `require-comment` is
    // the second case of the same omission, read off the payload by
    // `evaluateRequireComment`, so it rides the payload too — with the SAME
    // trim the submission applies, so a whitespace-only comment is unset on
    // both paths rather than on one.
    const payload: Record<string, unknown> = { to: toStateId };
    if (evidenceAttachmentId !== undefined && evidenceAttachmentId !== null) {
      payload['evidenceAttachmentId'] = evidenceAttachmentId;
    }
    const text = comment?.trim() ?? '';
    if (text !== '') payload['comment'] = { text };
    const candidate: SubmittedEvent = make({
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.transitioned',
      payload,
    });
    return precheckEvent(candidate, cache, { pendingFields: fieldValues });
  };

  /**
   * ADAPTATION 3, and it is the one with a wire consequence.
   *
   * The plan's snippet emits `{ toStateId, comment: 'text' }`. The SHIPPED
   * payload — `ticketTransitionedPayloadSchema`, packages/domain/src/workflow.ts,
   * landed by Plan 2 and parsed by both the rule engine and the ingest door —
   * is `{ to, comment?: { text }, evidenceAttachmentId?, cause? }`. A claim in
   * the plan's spelling is refused whole at the door as a malformed payload,
   * and refused identically by the local pre-check before it ever leaves.
   * Same argument as rulings P24 and P25: where the shipped surface and the
   * plan text disagree about a shape that has already been built, the built
   * one wins, and the adaptation lives at the client edge rather than being
   * pushed into the domain.
   *
   * Field claims go FIRST and the transition last, in one ordered batch, so a
   * `require-field` rule sees the value the dialog just collected.
   */
  /**
   * The overlay a move lays over the sheet: the target state (with its category, so the chip's tone and the Close
   * button follow) and every collected field value whose id is an overlay field, in the overlay's own shape — the
   * level for a priority, the day for a date. A value that is not in that shape is left to the reload.
   */
  const overlayOf = (submission: TransitionSubmission): TicketOverlay => {
    const overlay: TicketOverlay = { stateId: submission.toStateId };
    const category = workflow.data === null ? undefined : statesWithBacklog(workflow.data).find((candidate) => candidate.id === submission.toStateId)?.category;
    if (category !== undefined) overlay.stateCategory = category;
    for (const [fieldId, value] of Object.entries(submission.fieldValues)) {
      if (fieldId === 'priority' && prioritySchema.safeParse(value).success) overlay.priority = value as Priority;
      if (fieldId === 'startDate' || fieldId === 'dueDate') {
        if (value === null) overlay[fieldId] = null;
        else if (typeof value === 'object' && typeof (value as { date?: unknown }).date === 'string') overlay[fieldId] = (value as { date: string }).date;
      }
    }
    return overlay;
  };

  const submitTransition = async (submission: TransitionSubmission): Promise<void> => {
    // E5-27 — the latch, the same one and the same shape `submitTicketEvent`
    // above uses. The early return is the belt; the `disabled` the dialog
    // renders off this same flag is the braces, and it is the primary defence:
    // React re-renders `disabled` onto the DOM before a second click can land,
    // and this line covers a synchronous double-invoke that lands in the same
    // render pass.
    //
    // ONE LATCH FOR THE SHEET, deliberately, not a second one for the Move
    // path: a sheet with two writes in flight at once has no single answer to
    // "what is happening", and the Move dialog is modal, so the footer it
    // would be racing is behind it anyway. The visible consequence — Close,
    // Reopen and Delete are disabled for the lifetime of a Move's ingest — is
    // the correct one rather than a cost.
    if (submitting) return;
    setSubmitting(true);
    const fieldEvents = Object.entries(submission.fieldValues).map(([fieldId, value]) =>
      make({
        workspaceId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.field_set',
        payload: { fieldId, value },
      }),
    );
    const transitionPayload: Record<string, unknown> = { to: submission.toStateId };
    if (submission.comment !== undefined) transitionPayload['comment'] = { text: submission.comment };
    if (submission.evidenceAttachmentId !== undefined) {
      transitionPayload['evidenceAttachmentId'] = submission.evidenceAttachmentId;
    }
    const transition = make({
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.transitioned',
      payload: transitionPayload,
    });
    // The move is shown NOW (smoothness T7, spec S5) — the State row, and every collected value that names an
    // overlay field. A custom field has no overlay: the reload below is what shows it.
    const shownFields = overlayOf(submission);
    const shown = Object.keys(shownFields) as OverlayField[];
    optimistic.begin(shownFields);
    try {
      const results = await dataSource.ingest([...fieldEvents, transition]);
      const failed = results.find((result) => result.status !== 'committed');
      // INDEPENDENT per field: a field claim that committed stays shown (and waits for its read) even when the
      // transition after it is refused — the E2-36 batch already holds it on the server — while the state goes back.
      const stateFields = shown.filter((field) => field === 'stateId' || field === 'stateCategory');
      const claimFields = shown.filter((field) => field !== 'stateId' && field !== 'stateCategory');
      const entries = Object.keys(submission.fieldValues);
      const claimCommitted = (field: OverlayField): boolean =>
        results[entries.indexOf(field)]?.status === 'committed';
      optimistic.settle(...claimFields.filter(claimCommitted));
      optimistic.drop(...claimFields.filter((field) => !claimCommitted(field)));
      if (failed === undefined) optimistic.settle(...stateFields);
      else optimistic.drop(...stateFields);
      /*
        BOTH READS ARE RE-ASKED ON EVERY ANSWER, not only the happy one (E2-36).
        The batch above is ordered `[...fieldEvents, transition]` so a
        `require-field` rule sees what the dialog just collected (:708-710) — which
        means a batch that is refused AT THE TRANSITION has usually already
        committed its field claims. The refusal arms below set `serverRefusal` and
        used to RETURN with no reload, so the sheet sat behind the refusal still
        painted with the pre-move values while the server already held the new
        ones.

        ⚠ The staleness window is stated for what it is, because the finding's
        first draft overstated it ("nothing re-read"). A committed
        `ticket.field_set` moves the workspace stream, so with `/v1/stream` live
        the sheet DOES re-read itself and the window is a beat. What does not
        repair is the socket-absent or socket-slow case — the same case
        `page.tsx`'s delete handler was fixed for on 2026-09-20 (see `onDeleted`'s
        docblock: "with the `/v1/stream` socket absent the list still showed a row
        the toast had just said was deleted"). One reload site for both answers
        removes the question rather than narrowing the window.
      */
      read.reload();
      history.reload();
      if (failed === undefined) {
        setServerRefusal(null);
        setTransportError(null);
        setMoveOpen(false);
        // **A COMMITTED move is a fresh dialog next time (E2-32, 2026-09-21).**
        // The dialog's own `!open` effect deliberately keeps `comment` and
        // `fieldValues` across a close — *"typing into a dialog and losing it to a
        // stray Cancel is a real cost"* — and that argument is about CANCEL, while
        // the effect serves Commit alike. The dialog is mounted for the sheet's
        // whole life, so without this the next Move carried the previous move's
        // words onto the wire: a comment written about move A recorded as move B's.
        // Bumping this KEY remounts the dialog, which discards the whole abandoned
        // attempt and nothing else — Cancel does not bump it, so the cost the
        // docblock defends is untouched.
        setMovesCommitted((count) => count + 1);
        return;
      }
      // The authority's own words, carried without paraphrase. A refusal is a
      // named rule and a reason the engine wrote; an `invalid` is the door's code
      // and message. Both reach the user as they were said.
      setTransportError(null);
      if (failed.status === 'refused') setServerRefusal({ rule: failed.rule, reason: failed.reason });
      else setServerRefusal({ rule: failed.code, reason: failed.message });
    } catch (cause) {
      // E2-29 — a dropped connection during a Move, which used to produce
      // nothing at all. The await above had no `catch` and the call site is
      // `void submitTransition(submission)`, so a rejected `ingest` was an
      // unhandled promise rejection: the sheet's own transport sentence renders
      // only when `!moveOpen`, and the dialog replacing it was handed the
      // literal `null`, so no surface could speak. Same channel and same
      // sentence the sibling writes here use (`submitTicketEvent`), and the
      // same one `board.tsx`'s `submitFromDialog` reaches for a dialog Move —
      // Ruling 27's split: a silence is not an adjudication, so this is
      // `transportError`/`gn-refusal--transport`, never a `{rule, reason}` pair
      // standing in for one. The dialog stays open, and it is the dialog that
      // carries the sentence: it is the surface in view, and the retry lives
      // there.
      const message = cause instanceof Error ? cause.message : String(cause);
      optimistic.drop(...shown);
      setServerRefusal(null);
      setTransportError(`We could not reach the server for this move: ${message}`);
    } finally {
      // In a `finally`, not after the await, for the reason `submitTicketEvent`'s
      // own docblock records: a REJECTED ingest must not leave Move disabled for
      // ever, which resetting only on the happy path would do.
      setSubmitting(false);
    }
  };

  /**
   * THE ASSIGNEE — the owner's ruling (*"assignee should not be read only"*), on
   * the door that already exists.
   *
   * **`ticket.assigned` carries `{ assigneeId: string | null }`, and an
   * UNASSIGNMENT is the SAME EVENT carrying `null`** — there is no separate
   * `ticket.unassigned` type, and `read/assigned-provenance.ts` establishes that
   * by enumerating the event set from the reducer rather than guessing a second
   * one. So clearing the assignee is this same submission with `null` and not a
   * second path through the door.
   *
   * The same `make`/`ingest`/result idiom `submitTransition` uses above,
   * **including the refusal**: a `refused` carries the rule and reason the engine
   * wrote and an `invalid` the door's own code and message, both rendered
   * verbatim. This control is deliberately NOT gated client-side — the sheet's
   * standing position is that the authority which knows is the ingest door, and
   * a control that hid itself would leave a refusal unreachable and therefore
   * unrendered.
   */
  const submitAssignee = async (assigneeId: string | null, viaOutsider = false): Promise<void> => {
    const event = make({
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.assigned',
      payload: { assigneeId },
    });
    // The outsider door (access plan W6) for someone found by email who is not
    // in the workspace; the ordinary door for everyone else. Same answer shape,
    // same refusal rendering below (case 3.990).
    // The assignee is shown NOW (smoothness T7, spec S5); the answer settles it or takes it back.
    optimistic.begin({ assigneeId });
    let results: Awaited<ReturnType<typeof dataSource.ingest>>;
    try {
      results =
        viaOutsider && assignOutsider !== undefined && assigneeId !== null
          ? await outsiderIngest(assignOutsider, assigneeId)([event])
          : await dataSource.ingest([event]);
    } catch (cause) {
      optimistic.drop('assigneeId');
      throw cause;
    }
    const failed = results.find((result) => result.status !== 'committed');
    if (failed === undefined) {
      optimistic.settle('assigneeId');
      setServerRefusal(null);
      read.reload();
      history.reload();
      return;
    }
    optimistic.drop('assigneeId');
    if (failed.status === 'refused') setServerRefusal({ rule: failed.rule, reason: failed.reason });
    else setServerRefusal({ rule: failed.code, reason: failed.message });
  };

  /**
   * THE DESCRIPTION — the owner's ruling (*"description should be editable"*),
   * on the door that already exists.
   *
   * **The event is the editor's own composition, handed straight to the
   * envelope.** `composeEditorSubmission('description', doc)` returns
   * `{ type: 'ticket.field_set', payload: { fieldId: 'description', value } }`
   * (`packages/editor/src/attachments/compose-editor-submission.ts:14,29`) and
   * that is exactly what arrives here: a description edit is not a mutation of
   * a field, it is ONE MORE CLAIM, so the history of a description is the
   * history of the claims that wrote it. This function therefore does not
   * restate the payload — a second spelling of `{ fieldId: 'description' }`
   * beside the composer that guarantees it is the duplication `submitTransition`
   * already warns about at `:262-278`.
   *
   * Three outcomes, told apart by SLOT and never by wording, exactly as
   * `closeOrReopen` does below — `results[0]` rather than `results.find(...)`,
   * because exactly one event is ingested here and searching would imply a
   * batch this call never sends. A silence goes to `transportError`; a real
   * `refused`/`invalid` answer goes to `serverRefusal`. **A refusal costs the
   * user nothing**: `TicketEditorSlot` clears the composer only in `comment`
   * mode, so a refused description save leaves their words on screen.
   */
  const submitDescription = async (submission: EditorSlotSubmission): Promise<boolean> => {
    const event = make({
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: submission.type,
      payload: submission.payload,
    });
    const results = await dataSource.ingest([event]);
    const result = results[0];
    if (result === undefined) {
      setServerRefusal(null);
      setTransportError('The server did not answer this change.');
      return false;
    }
    if (result.status === 'committed') {
      setServerRefusal(null);
      setTransportError(null);
      // AND THE THIRD SLOT, which the first draft of this handler left set.
      // `editorError` reports the outcome of the editor's last action, so a
      // SUCCESSFUL action supersedes it; without this line a pasted-file
      // refusal stayed on screen for the life of the sheet, and the three slots
      // disagreed about which of them was still current after a save that
      // cleared the other two. Caught by independent review, not by this file.
      setEditorError(null);
      read.reload();
      history.reload();
      return true;
    }
    if (result.status === 'refused') setServerRefusal({ rule: result.rule, reason: result.reason });
    else setServerRefusal({ rule: result.code, reason: result.message });
    // V7 — NOT ACCEPTED, and the composer must keep the words. Reached by a
    // `refused`, by an `invalid`, and by any status this build does not name.
    return false;
  };

  /**
   * A COMMENT, through the same three slots as a description change.
   *
   * **`read` is deliberately NOT reloaded here.** A comment changes no head
   * state — `ticket-state.ts` returns the state unchanged for `comment.added`
   * (and `proj_tickets` skips the event for the same reason) — so reloading the
   * ticket read would be a request that cannot have a different answer. What a
   * comment DOES join is the thread and the ledger tab, and both are reloaded.
   *
   * The composer clears itself on success without help from here, and **V7 is
   * why "success" is now a SIGNAL rather than the absence of a throw**:
   * `TicketEditorSlot.handleSubmit` clears in `comment` mode only, and it clears
   * on this function's own `true`. It used to clear on the promise RESOLVING,
   * and a refusal resolves — this function records the server's answer in
   * `serverRefusal` and returns normally — so a refused comment wiped the
   * composer and cost the author the words they had just written, which is the
   * outcome the slot's own docblock promises cannot happen.
   */
  const submitComment = async (submission: EditorSlotSubmission): Promise<boolean> => {
    const event = make({
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: submission.type,
      payload: submission.payload,
    });
    const results = await dataSource.ingest([event]);
    const result = results[0];
    if (result === undefined) {
      setServerRefusal(null);
      setTransportError('The server did not answer this change.');
      return false;
    }
    if (result.status === 'committed') {
      setServerRefusal(null);
      setTransportError(null);
      setEditorError(null);
      comments.reload();
      history.reload();
      // TAGGING A NOTE ATTACHES IT (spec §14.3, D27–D28) — AFTER the comment's
      // own commit, never before: 18.276 pins the order, because an implied
      // attachment is a CONSEQUENCE of the comment landing, not a
      // precondition of it. `attachedNoteIds` reads the lifted `<ticketId>:notes`
      // query's CURRENT answer, so a note already attached (by this comment's
      // own author moments ago, or by anyone else) is never re-claimed.
      //
      // Only a `comment.added` submission carries a `body` to walk — the other
      // two `EditorSlotSubmission` arms (`note.body_set`, `ticket.field_set`)
      // do not, and `submitComment` is this sheet's TICKET-comment door only
      // (D28: note comments never call this at all — `note-comments.tsx`
      // does not import `attachmentsImpliedBy`).
      if (submission.type === 'comment.added') {
        const alreadyAttached = (notes.data ?? []).map((n) => n.noteId);
        const implied = attachmentsImpliedBy(submission.payload.body, workspaceId, ticketId, alreadyAttached, make);
        if (implied.length > 0) {
          // THE COMMENT MUST STAND EVEN IF THIS FAILS TO ANSWER AT ALL —
          // D28's "the comment stays posted" covers a silent transport
          // failure here exactly as it covers a real refusal below. Without
          // this catch, a rejected `ingest` would throw OUT of an already-
          // `true`-bound function, which `TicketEditorSlot.handleSubmit`
          // reads as the SUBMIT itself failing — its own `catch` fires
          // `onError` and leaves the words in the composer, so the author
          // would re-post a comment the ledger already has.
          try {
            const titleOf = new Map(noteReferencesIn(submission.payload.body).map((ref) => [ref.noteId, ref.title]));
            const impliedResults = await dataSource.ingest(implied);
            const refusals: string[] = [];
            implied.forEach((impliedEvent, index) => {
              const impliedResult = impliedResults[index];
              const title = titleOf.get(impliedEvent.entity.id) ?? impliedEvent.entity.id;
              if (impliedResult === undefined) {
                refusals.push(`Couldn't attach "${title}": The server did not answer this change.`);
              } else if (impliedResult.status === 'refused') {
                refusals.push(`Couldn't attach "${title}": ${impliedResult.reason}`);
              } else if (impliedResult.status !== 'committed') {
                refusals.push(`Couldn't attach "${title}": ${impliedResult.message}`);
              }
            });
            if (refusals.length > 0) setAttachRefusals(refusals);
            notes.reload();
          } catch {
            setAttachRefusals(['Couldn\'t attach the tagged notes: the server did not answer.']);
          }
        }
      }
      return true;
    }
    if (result.status === 'refused') setServerRefusal({ rule: result.rule, reason: result.reason });
    else setServerRefusal({ rule: result.code, reason: result.message });
    // V7 — NOT ACCEPTED, and the composer must keep the words. Reached by a
    // `refused`, by an `invalid`, and by any status this build does not name.
    return false;
  };

  /**
   * Edit and delete on the ticket's own comments (MCP-everything T5). Both leave through `dataSource.ingest` — the
   * one write door the offline outbox sits behind — so offline they queue like any change. The thread draws the
   * controls from these facts; the permission gate (T2) decides what commits, and a refusal is shown in its words.
   * Absent with no editor mounted: the read-only fallback cannot compose, so it cannot edit either.
   */
  const commentActions: CommentActions | undefined =
    editorSlot === undefined
      ? undefined
      : {
          currentUserId,
          canModerate: canModerateComments === true,
          renderEditor: (comment, done) => (
            <EditorSlot
              mode="comment"
              doc={comment.body}
              readOnly={false}
              workspaceId={workspaceId}
              ticketId={ticketId}
              submitLabel="Save"
              footerNote="Saving records an edit citing you."
              {...commentEditorCapabilities}
              submit={async (submission) => {
                if (submission.type !== 'comment.added') return false;
                const [result] = await dataSource.ingest([
                  make(commentEditedSeed(workspaceId, { kind: 'ticket', id: ticketId }, comment.commentId, submission.payload.body)),
                ]);
                if (result?.status === 'committed') {
                  setServerRefusal(null);
                  setTransportError(null);
                  comments.reload();
                  history.reload();
                  done();
                  return true;
                }
                if (result === undefined) {
                  setServerRefusal(null);
                  setTransportError('The server did not answer this change.');
                } else if (result.status === 'refused') setServerRefusal({ rule: result.rule, reason: result.reason });
                else setServerRefusal({ rule: result.code, reason: result.message });
                return false;
              }}
            />
          ),
          deleteComment: async (comment) => {
            const [result] = await dataSource.ingest([make(commentDeletedSeed(workspaceId, { kind: 'ticket', id: ticketId }, comment.commentId))]);
            if (result?.status === 'committed') {
              comments.reload();
              history.reload();
              return null;
            }
            if (result === undefined) return 'The server did not answer this change.';
            return result.status === 'refused' ? result.reason : result.message;
          },
        };

  /**
   * The `attachment.added` claim that follows an upload and PRECEDES the image
   * the composer inserts.
   *
   * **It THROWS on a failure, and that is the contract rather than an oversight.**
   * `createAttachmentPasteExtension` awaits this before it inserts the node
   * (*"the claim precedes the picture"*, `attachment-paste.ts:49`), and catches
   * a rejection into `onUploadError` — so a comment never ends up with a picture
   * in it whose claim the server refused. Resolving quietly would put a node
   * naming an attachment that no event ever recorded into the document, and the
   * next Post would carry it.
   *
   * **This is the first MOUNTED producer of `attachment.added` — MEASURED, and
   * the wording is exact because the looser claim is false.** The claim is
   * COMPOSED elsewhere already: `packages/editor/src/drive/attachment-claims.ts`
   * exports `composeUploadAttachmentAdded` and `composeDriveReferenceAdded`,
   * both tested. **Neither has a production caller** — the symbol sweep returns
   * their tests, their export and one docblock citation, and nothing else — and
   * neither does `EvidencePicker`, the other path that would emit one. Mobile
   * has no wiring for the event at all. So the code to make a claim existed and
   * was never reachable from a screen; this mount is where it becomes reachable.
   *
   * ⚠ **THE SWEEP NAMED THREE AND MISSED A FOURTH — E2-47, corrected here.** This
   * paragraph is the record of what is wired and what is not, so an omission from
   * it is the one kind of error it cannot afford: a reader who counted three
   * unwired exports and stopped had no way to learn that
   * `transitionRequiresEvidence` (`packages/editor/src/attachments/require-evidence.ts:61`,
   * exported at `packages/editor/src/index.ts:66`) was a fourth. Re-measured
   * 2026-09-21 over `apps/` and `packages/`, excluding `dist/` and tests: its
   * mentions are its own declaration, the barrel line and one test file — **zero
   * production callers**, where the control symbol `assembleTicketCards` returns
   * 52. So the count is FOUR, and the fourth is named rather than deleted: its
   * four cases (9.107–9.110) pin the real exact-versus-from-any precedence of
   * `require-evidence` matching, and deleting the symbol would strike them and
   * take that knowledge with it. The finding offered "export it or delete it";
   * keeping it is the branch that loses nothing, and its docblock now carries the
   * structural reason no caller can exist (see there) instead of the invitation
   * the finding objected to.
   *
   * ⚠ **AND THE PAYLOAD IS COMPOSED A SECOND TIME HERE, which is a divergence
   * worth naming rather than hiding.** `composeUploadAttachmentAdded` does
   * exactly this job, and app-core **cannot import it**: the dependency runs
   * `apps/web → editor`, and app-core sits below it (`views/editor-slot.tsx`
   * re-declares the submission union for that same reason). The honest home for
   * one composer both packages can reach is `packages/domain`, beside
   * `attachmentUploadedPayload` — which is the schema this payload must satisfy
   * anyway. **Named owner: whoever next touches `attachment-claims.ts`.**
   *
   * The values are the SERVER-SNIFFED truth the upload answered with (`kind:
   * 'upload'`, a ULID `attachmentId`, a mime, a size, a lowercase-hex
   * `sha256`) — nothing here is inferred from the file the user chose.
   */
  const emitAttachmentAdded = async (uploaded: EditorSlotUpload): Promise<void> => {
    const event = make({
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'attachment.added',
      payload: {
        kind: 'upload',
        attachmentId: uploaded.attachmentId,
        filename: uploaded.filename,
        mime: uploaded.mime,
        size: uploaded.size,
        sha256: uploaded.sha256,
      },
    });
    const results = await dataSource.ingest([event]);
    const result = results[0];
    if (result === undefined) throw new Error('The server did not answer this upload’s claim.');
    if (result.status !== 'committed') {
      throw new Error(
        result.status === 'refused'
          ? `The server refused this upload: ${result.reason}`
          : `This upload’s claim was rejected: ${result.message}`,
      );
    }
  };

  /**
   * Unit 5(b) — the Attachments tab's own upload, through the SAME two-step
   * path the composer's Attach button and paste/drop all use:
   * `uploadAttachment` then `emitAttachmentAdded`. No node to insert here
   * (this tab holds no document) and no local list to update — `attachments`
   * is the page's own live query, prop-fed, and reads the newly-added file
   * the same way it already reads one a paste implied, once the ledger
   * write above lands and the page's stream re-fetches.
   */
  async function handleAttachmentTabUpload(file: File): Promise<void> {
    if (!uploadAttachment) return;
    setAttachingTab(true);
    setAttachTabRefusal(null);
    try {
      const uploaded = await uploadAttachment(file);
      await emitAttachmentAdded(uploaded);
    } catch (err) {
      setAttachTabRefusal(err instanceof Error ? err.message : String(err));
    } finally {
      setAttachingTab(false);
    }
  }

  /**
   * Mentions, resolved off the roster this sheet ALREADY reads for `nameOf`
   * and for the assignee picker — nothing new is read and nothing is passed in,
   * the same argument the assignee row's own case makes.
   *
   * ## ⚠ The residual, stated rather than implied
   *
   * This interface cannot express "the roster could not be loaded". It returns
   * `Promise<MentionCandidate[]>`, and the popup renders a count from whatever
   * comes back (`mention-popup.ts:100` → `mentionResultAnnouncement(0)` is the
   * string **"No people match"**). So over a REFUSED roster, typing `@` states
   * that nobody in this workspace matches — which is the same collapse the
   * assignee row was built to refuse (`members={members.data ?? []}`, fixed in
   * `#530`), one control over.
   *
   * **The collapse is kept here, deliberately, because the alternative is
   * worse rather than because it is right:** leaving `queryUsers` unwired
   * reaches the identical `[]` through `TicketEditorSlot`'s own `NO_MENTIONS`
   * default, so `@` would claim "No people match" on EVERY keystroke in every
   * session, refusal or not. Wiring it is correct whenever the roster loaded,
   * which is the ordinary case, and no worse in the window where it did not.
   * **Named owner: whoever next widens `EditorSlotProps.queryUsers`** — an
   * absent-roster signal has to exist before this can tell the truth.
   */
  const queryUsers = async (query: string): Promise<Array<{ userId: string; name: string }>> =>
    // The list itself is `mentionCandidatesOf` — shared with the note editors
    // (`apps/web/src/notes`), which is where RULING E5-4's label-before-match
    // note now lives.
    mentionCandidatesOf(members.data ?? [], query);

  /**
   * Close / Reopen — the same `make`/`ingest`/result idiom `submitTransition`
   * uses above, collapsed to the one-event case: `ticket.closed` and
   * `ticket.reopened` both carry `payload: {}` (spec §1.2, 2026-09-17), the
   * envelope alone naming the actor and the server time the badge later
   * reads. A `committed` answer clears any standing refusal and reloads both
   * the ticket and its ledger — the same pair `submitTransition` refreshes,
   * because a close/reopen writes a ledger line too. A `refused` or `invalid`
   * answer is carried without paraphrase into `serverRefusal`, exactly as
   * `submitTransition` carries a move's.
   *
   * UNGUARDED against unmount mid-flight, on purpose and for the same reason
   * `submitTransition` is left unguarded (see that function's docblock,
   * cited by `board.tsx`): this file tracks no mounted-ness anywhere else, and
   * adding one guard for this call alone would be a second convention beside
   * the existing unguarded one rather than a fix to it. **This is a DIFFERENT
   * concern from the `submitting` latch below** — unmount-safety is about a
   * setState landing after this component is gone; the latch is about a
   * second click landing while THIS component is still very much mounted and
   * still waiting on the first click's answer. `board.tsx`'s `MoveArrows`
   * needs both guards because it can unmount mid-flight (a sibling card's
   * move can reload the board out from under it); nothing here reloads this
   * sheet out from under itself, so only the latch applies.
   *
   * Ruling 33 (fix round 2, 2026-09-17) — SUPERSEDES fix round 1's own
   * rationale here, which read: "this sheet has no transport-error slot to
   * hand [a rejection] to," and so folded a rejected `ingest` into
   * `serverRefusal` under a synthetic `ingest-rejected` rule name. That was
   * caught in review as the exact defect Ruling 27 removed from `board.tsx`
   * (case 13.504): a rejection or a silent non-answer is NOT the server's own
   * verdict, however it is worded, and dressing it in the "Refused by the
   * server — …" sentence claims an adjudication that never happened. This
   * sheet now HAS a transport slot (`transportError`, declared beside
   * `serverRefusal` above), and the three outcomes below are told apart by
   * which slot they fill, never by wording alone: `results[0] === undefined`
   * (the door answered nothing for the one event submitted — a typed case,
   * not an expected one) and a REJECTED promise both go to `transportError`;
   * only a real `refused`/`invalid` answer goes to `serverRefusal`. `results[0]`,
   * not `results.find(...)`, because exactly one event is ingested here — the
   * result at index 0 IS the result, and searching implies a batch this call
   * never sends.
   *
   * Ruling 32 (fix round 1) — `submitting` is set BEFORE the `ingest` call and
   * reset in a `finally`, mirroring `board.tsx`'s `submitDirect`
   * (`:1029-1035`'s own docblock on why `finally` rather than after the
   * `await`): a REJECTED ingest must not leave Close/Reopen disabled forever,
   * which resetting only on the happy path would do.
   *
   * ⚠ **THE `if (submitting) return` THAT STOOD AT THE TOP OF THIS FUNCTION IS
   * GONE (ruling E2-31, 2026-09-21), and this paragraph is what the finding
   * asked to put in its place.** It claimed to guard *"a second click landing on
   * the same render pass as the first, before React has re-rendered the
   * `disabled` attribute onto the DOM"* — and it **cannot** do that, because
   * `submitting` is RENDER STATE: two calls in one render pass both close over
   * the same pre-commit `false` and both get through. That is precisely the case
   * render state is blind to. A guard whose stated purpose is unreachable is
   * indistinguishable from a working one to every future reader, so it is
   * removed rather than kept as belt-and-braces.
   *
   * **What actually holds is `disabled={submitting}`**, on both buttons
   * (`:2154`, `:2159`): a second click in a real browser lands on a control
   * React has already re-rendered, so this handler is never called at all. Case
   * `13.1182` pins exactly that — two clicks with the first ingest held pending
   * post ONE event — and deleting the `disabled` term reddens it.
   *
   * **And this is NOT the composer's defect wearing a different hat.** The
   * measured precedent (`packages/editor/src/components/TicketEditorSlot.tsx`:
   * *"MEASURED, two `comment.added` events for one comment"*) reached its
   * handler from TWO sources — a Save button AND a blur/Enter commit — and the
   * `disabled` landing on the field is what fired the second one. Close/Reopen
   * has one source and no blur-commit, so copying that fix here would install a
   * second guard that also cannot fire. The finding offers both remedies and
   * names this one first; the reasoning above is why it is the one taken.
   */
  const submitTicketEvent = async (
    type: 'ticket.closed' | 'ticket.reopened',
    onCommitted: () => void,
  ): Promise<void> => {
    // The head-slot writers. Until trash Plan 4 a Delete answered through a
    // FOOTER pair chosen by a `sink` parameter (E5-9); Delete now answers inside
    // `DeleteDialog` (D7), so Close/Reopen are the only callers and one pair of
    // writers is left.
    const putRefusal = setServerRefusal;
    const putTransport = setTransportError;
    // Both slots are cleared by every submission: two sentences about one
    // click's outcome — one stale, one current — is the defect the shared slot's
    // own comment below already refuses.
    const clearBoth = (): void => {
      setServerRefusal(null);
      setTransportError(null);
    };
    setSubmitting(true);
    try {
      const event = make({
        workspaceId,
        entity: { kind: 'ticket', id: ticketId },
        type,
        payload: {},
      });
      const results = await dataSource.ingest([event]);
      const result = results[0];
      if (result === undefined) {
        // Ruling 27/33/34: silence is not a refusal — `transportError`, never
        // a hand-built `{rule, reason}` pair standing in for one. The other
        // slot is cleared here too, the same pairing the `catch` branch below
        // already does: without it, a REFUSED answer followed by a SILENT one
        // (two separate clicks, two separate ingests) would leave the old
        // "Refused by the server: …" notice on screen alongside the new
        // transport one — two notices for one click's outcome, the earlier one
        // describing an answer that is no longer what happened.
        clearBoth();
        putTransport('The server did not answer this change.');
        return;
      }
      if (result.status === 'committed') {
        clearBoth();
        // What a COMMITTED event does next is the caller's — Close/Reopen
        // re-read (the ticket's own state moved). Everything before this line is
        // shared on purpose: the refusal and transport-error slots, the
        // `submitting` latch, and the three-outcome split are one decision.
        onCommitted();
        return;
      }
      clearBoth();
      if (result.status === 'refused') putRefusal({ rule: result.rule, reason: result.reason });
      else putRefusal({ rule: result.code, reason: result.message });
    } catch (cause) {
      // Ruling 27/33: a transport failure is not a refusal either — same
      // `transportError` channel `board.tsx`'s `submitDirect` (`:1082-1088`)
      // uses, own sentence, never `serverRefusal`. E5-25: a 401 is neither,
      // and it decides through the same author as the other eight.
      clearBoth();
      putTransport(
        writeFailureCopy(cause, (message) => `We could not reach the server for this change: ${message}`),
      );
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * The title, committed through the door that ALREADY exists.
   *
   * `ticket.field_set` is the only writer of a built-in field, and the title has
   * lived in `state.fields['title']` since `ticket.created` wrote it
   * (`packages/domain/src/ticket-state.ts:160`). So an editable title is a
   * SURFACE over an existing door — there is no new event, no new route and no
   * migration in this function, and that is a measurement rather than a hope:
   * the reducer's own comment shows `{ fieldId: 'title' }` parsing.
   *
   * ## No client-side blank rule, and that is the REUSE rather than an omission
   *
   * A title of only spaces is refused by the SERVER, and the branch is old:
   * `checks/fields.ts:118-123` answers `field.title-required` for `null` and
   * `field.type-mismatch` for anything whose `value.trim().length` is 0. That
   * is the same rule the New-ticket form leans on — `ticketCreatedPayload`'s
   * *"must not be blank: a title of only spaces names nothing"* — so a second
   * rule here would be a second, weaker door to one field, which is exactly
   * what this sheet refuses elsewhere. The value travels AS TYPED and the
   * engine's answer is what the reader sees.
   *
   * ## The first early return, and it is about not sending a claim nobody made
   *
   * An UNCHANGED value is not a claim, and `ticket.field_set` is append-only:
   * a no-op commit would put a ledger line in the ticket's history saying
   * somebody changed the title to what it already said. (The second early return
   * below is a DIFFERENT fact — a claim that WAS sent to a server that did not
   * answer — and an earlier version of this heading called both of them "about
   * not sending a claim nobody made", which is true of one.)
   *
   * ## ⚠ THE IN-FLIGHT LATCH, WHICH THE FIRST CUT DID NOT HAVE
   *
   * `titleSaving` is render state and drives `disabled`; **it is useless as a
   * re-entrancy guard, and here it is worse than useless.** Two commits in one
   * React batch both read the same pre-commit `false` and both get through — the
   * exact measurement Ruling 32 records for Close/Reopen (`submittingRef`'s own
   * docblock, above). And `disabled` is itself what makes a browser blur the
   * focused control: one Enter on a browser that blurs on disable fires
   * `onBlur` into a SECOND `submitTitle` while the first is still awaiting, and
   * a `ticket.field_set` carrying the title the ledger already has is exactly
   * what the guard above exists to prevent. **jsdom does not blur on disable**,
   * so this suite cannot see it: an independent reviewer measured `ingestCalls:
   * 2` with `ingest` held pending and a `focusout` fired, where the branch's own
   * Enter probe — unobstructed — reported 1.
   *
   * `titleSubmittingRef` is set SYNCHRONOUSLY before the first `await`, which is
   * the only place a second call in the same tick can be seen, and reset in a
   * `finally` so a rejected ingest cannot leave the field permanently dead.
   */
  const submitTitle = async (next: string): Promise<void> => {
    if (next === ticketRead.title) {
      setTitleDraft(null);
      return;
    }
    if (titleSubmittingRef.current) return;
    titleSubmittingRef.current = true;
    setTitleSaving(true);
    try {
      const event = make({
        workspaceId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.field_set',
        payload: { fieldId: 'title', value: next },
      });
      // The value is shown NOW (smoothness T7, spec S5); the answer settles it or takes it back.
      optimistic.begin({ title: next });
      let results: Awaited<ReturnType<typeof dataSource.ingest>>;
      try {
        results = await dataSource.ingest([event]);
      } catch (cause) {
        optimistic.drop('title');
        throw cause;
      }
      const result = results[0];
      if (result === undefined) {
        optimistic.drop('title');
        setServerRefusal(null);
        setTransportError('The server did not answer this change.');
        return;
      }
      if (result.status === 'committed') {
        optimistic.settle('title');
        setServerRefusal(null);
        setTransportError(null);
        setTitleDraft(null);
        read.reload();
        history.reload();
        return;
      }
      // Refused: the draft STAYS on screen beside the answer. Clearing it would
      // hand the reader back the old title next to a sentence refusing the new
      // one, with their words gone — the same rule `TicketEditorSlot` states for
      // a refused description.
      optimistic.drop('title');
      if (result.status === 'refused') setServerRefusal({ rule: result.rule, reason: result.reason });
      else setServerRefusal({ rule: result.code, reason: result.message });
    } finally {
      titleSubmittingRef.current = false;
      setTitleSaving(false);
    }
  };

  /**
   * RULING E5-6 — the due date's WRITE, and the door the product already had.
   *
   * ## What was wrong, and why this is the remedy rather than a second record
   *
   * Every surface in this product READS a due date — My Work's overdue count,
   * the List's due column, the Calendar, the Timeline, the due-soon
   * notification — and until this ruling no surface could SET one. The door was
   * recorded as unbuilt (`test-cases/16-remaining-doors.md`, Door G) with a
   * named owner, so the deferral was known; what the ruling holds is that a
   * RECORD is not a RULING, and the person in the product was never told, since
   * only `docs/manual.md` said it. The write path was never the missing half:
   * `ticket.field_set` has carried `dueDate` since the built-ins were
   * registered (`ticket-events.ts`'s payload docblock names
   * `title/description/dueDate/startDate`, and a due date value "is always
   * `{ date, note? }` — a claim").
   *
   * ## The shape is the export's, transcribed rather than invented
   *
   * `desktop.dc.html:3599` is the whole of the behaviour: *"const v =
   * e.target.value; … patch(sheet.id, { due: v || null }, v ? 'Due date
   * claimed' : 'Due date cleared', true)"* — an EMPTIED input CLEARS the claim,
   * which is `value: null` on this event. So the payload is `null` for the
   * empty string and `{ date: next }` otherwise, and there is no third state to
   * invent.
   *
   * ## The two guards `submitTitle` has, and for the same measured reasons
   *
   * An UNCHANGED value is not a claim, and this event is append-only: a no-op
   * commit would put a ledger line in the ticket's history saying somebody
   * claimed the date it already carried. And `dueSubmittingRef` is set
   * SYNCHRONOUSLY before the first `await` — a REF and not the `dueSaving`
   * state, which is render state and useless as a re-entrancy guard: two
   * commits in one React batch both read the pre-commit `false`, and the
   * `disabled` that lands on the field makes a real browser blur it, firing
   * `onBlur` into a second commit while the first is still awaiting.
   *
   * A REFUSED answer keeps the draft on screen beside the refusal, exactly as
   * `submitTitle` does — clearing it would hand the reader back the old date
   * next to a sentence refusing the new one, with their entry gone.
   */
  const submitDueDate = async (next: string): Promise<void> => {
    if (next === (dueDate?.date ?? '')) {
      setDueDraft(null);
      return;
    }
    if (dueSubmittingRef.current) return;
    dueSubmittingRef.current = true;
    setDueSaving(true);
    try {
      const event = make({
        workspaceId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.field_set',
        // `''` is the clearing claim, never an empty-string date: the export's
        // own `v || null`, and the shape this event's door docblock names.
        payload: { fieldId: 'dueDate', value: next === '' ? null : { date: next } },
      });
      // The value is shown NOW (smoothness T7, spec S5); the answer settles it or takes it back.
      optimistic.begin({ dueDate: next === '' ? null : next });
      let results: Awaited<ReturnType<typeof dataSource.ingest>>;
      try {
        results = await dataSource.ingest([event]);
      } catch (cause) {
        optimistic.drop('dueDate');
        throw cause;
      }
      const result = results[0];
      if (result === undefined) {
        optimistic.drop('dueDate');
        setServerRefusal(null);
        setTransportError('The server did not answer this change.');
        return;
      }
      if (result.status === 'committed') {
        optimistic.settle('dueDate');
        setServerRefusal(null);
        setTransportError(null);
        setDueDraft(null);
        read.reload();
        history.reload();
        return;
      }
      optimistic.drop('dueDate');
      if (result.status === 'refused') setServerRefusal({ rule: result.rule, reason: result.reason });
      else setServerRefusal({ rule: result.code, reason: result.message });
    } finally {
      dueSubmittingRef.current = false;
      setDueSaving(false);
    }
  };

  /**
   * The Priority row's WRITE (spec 2026-09-22). It is deliberately NOT
   * `submitDueDate` with a different `fieldId`; the differences are the point:
   *
   * - **There is no clearing claim.** A ticket always has a priority, so the
   *   payload is always `{ fieldId: 'priority', value: next }` and never `null`.
   *   The engine refuses `null` for this field (`field.priority-required`), so a
   *   row able to send one would be offering a gesture that can only be refused.
   * - **There is no draft.** The no-op guard is the only guard, and it matters
   *   for the reason every other row's does: the ledger is append-only, so a
   *   commit that changed nothing would record a claim nobody made.
   * - **The rest is `submitDueDate`'s, verbatim** — a synchronous REF before the
   *   first `await` (`disabled` is render state and is what makes a browser blur
   *   the control into a second commit), and a REFUSED answer that leaves the
   *   previous segment selected rather than adopting a level the server did not
   *   record.
   */
  const submitPriority = async (next: Priority): Promise<void> => {
    if (next === priorityValue) return;
    if (prioritySubmittingRef.current) return;
    prioritySubmittingRef.current = true;
    setPrioritySaving(true);
    try {
      const event = make({
        workspaceId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.field_set',
        payload: { fieldId: 'priority', value: next },
      });
      // The value is shown NOW (smoothness T7, spec S5); the answer settles it or takes it back.
      optimistic.begin({ priority: next });
      let results: Awaited<ReturnType<typeof dataSource.ingest>>;
      try {
        results = await dataSource.ingest([event]);
      } catch (cause) {
        optimistic.drop('priority');
        throw cause;
      }
      const result = results[0];
      if (result === undefined) {
        optimistic.drop('priority');
        setServerRefusal(null);
        setTransportError('The server did not answer this change.');
        return;
      }
      if (result.status === 'committed') {
        optimistic.settle('priority');
        setServerRefusal(null);
        setTransportError(null);
        read.reload();
        history.reload();
        return;
      }
      optimistic.drop('priority');
      if (result.status === 'refused') setServerRefusal({ rule: result.rule, reason: result.reason });
      else setServerRefusal({ rule: result.code, reason: result.message });
    } finally {
      prioritySubmittingRef.current = false;
      setPrioritySaving(false);
    }
  };

  /**
   * The Start row's WRITE — `submitDueDate`'s twin, copied rather than shared.
   *
   * The two rows are identical in every respect the spec names (the same
   * `<input type="date">`, the same commit on blur and on Enter, the same
   * Escape that abandons the draft without closing the sheet, the same
   * `null`-for-empty payload) and their state is what would have to be shared:
   * a hook taking `(fieldId, draft, setDraft, …)` would thread six values to
   * save fourteen lines, and the two rows would then be unable to diverge the
   * day one of them genuinely needs to — which is the bet this file declines to
   * make on two instances. **If a THIRD date row ever lands, this is the pair to
   * extract, and the extraction is the review's, not the third row's.**
   */
  const submitStartDate = async (next: string): Promise<void> => {
    if (next === (startDate?.date ?? '')) {
      setStartDraft(null);
      return;
    }
    if (startSubmittingRef.current) return;
    startSubmittingRef.current = true;
    setStartSaving(true);
    try {
      const event = make({
        workspaceId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.field_set',
        // `''` is the clearing claim, never an empty-string date — the same
        // `v || null` shape `submitDueDate` gives for the same reason.
        payload: { fieldId: 'startDate', value: next === '' ? null : { date: next } },
      });
      // The value is shown NOW (smoothness T7, spec S5); the answer settles it or takes it back.
      optimistic.begin({ startDate: next === '' ? null : next });
      let results: Awaited<ReturnType<typeof dataSource.ingest>>;
      try {
        results = await dataSource.ingest([event]);
      } catch (cause) {
        optimistic.drop('startDate');
        throw cause;
      }
      const result = results[0];
      if (result === undefined) {
        optimistic.drop('startDate');
        setServerRefusal(null);
        setTransportError('The server did not answer this change.');
        return;
      }
      if (result.status === 'committed') {
        optimistic.settle('startDate');
        setServerRefusal(null);
        setTransportError(null);
        setStartDraft(null);
        read.reload();
        history.reload();
        return;
      }
      optimistic.drop('startDate');
      if (result.status === 'refused') setServerRefusal({ rule: result.rule, reason: result.reason });
      else setServerRefusal({ rule: result.code, reason: result.message });
    } finally {
      startSubmittingRef.current = false;
      setStartSaving(false);
    }
  };

  /** Close/Reopen: the ticket's own state moved, so both reads are re-asked. */
  const closeOrReopen = (type: 'ticket.closed' | 'ticket.reopened'): Promise<void> =>
    submitTicketEvent(
      type,
      () => {
        read.reload();
        history.reload();
      },
    );

  /**
   * `Delete` — the SOFT delete, and the sheet's only removal.
   *
   * ## It CLOSES the sheet itself, and that is the fail-safe half
   *
   * The prototype's handler closes the sheet and toasts (`desktop.dc.html:3795`),
   * and this product splits those: `onClose()` here, the toast in the host. **The
   * close is called by the SHEET rather than left to the host**, even though the
   * host owns `onDeleted`, because the two failures are not symmetric: a host
   * that narrates without closing leaves a reader looking at a sheet for a
   * ticket they just removed from every view, while a host that ignores
   * `onDeleted` entirely still gets the sheet closed here. Optional callbacks
   * must not be load-bearing.
   *
   * ## It is offered on every ticket, and the SERVER decides who may
   *
   * `ticket.deleted` is gated on project-admin rights (`check-permission.ts`'s
   * check 6) — but this control is NOT hidden for anyone, deliberately. The
   * repo's rule is that the ingest door is the only party that knows
   * (`editorSlot`'s comment above says so at length), so a non-admin who presses
   * Delete gets the engine's own refusal in `gn-refusal--server` rather than a
   * button that silently is not there. **A hidden control cannot explain
   * itself.**
   *
   * ## ITS REFUSAL ANSWERS INSIDE THE DIALOG (trash Plan 4, D7, case 19.231)
   *
   * Spec §7: the dialog that asked shows the answer and stays open, which is
   * where the person is when they press.
   */
  const onDeleteCommitted = ({ permanent }: { permanent: boolean }): void => {
    setConfirmingDelete(false);
    onClose();
    onDeleted?.(ticketId, ticketRead.key ?? ticketRead.title, { permanent });
  };

  const state = ticketRead.ticket;
  /**
   * Door G, 2026-09-19 — PRIORITY, DUE, START and TYPE as rows that are always
   * drawn.
   *
   * ## What each one actually IS, measured rather than inferred
   *
   * They are NOT all the same kind of thing, and rendering them as though they
   * were would be the defect:
   *
   * - **Type** is a DOMAIN CONCEPT — `state.typeId` (`entity-state.ts:29`). The
   *   human name is not on the ticket at all, so it comes from the workspace's
   *   type ladder (`ticketTypes` above), falling back to the ID — the same
   *   fallback `readMyWork`'s project names use, and for the same reason: an id
   *   is a worse label than a name and a far better one than nothing. **It is
   *   the ONE row on this sheet with no editor**, which is exactly what the
   *   prototype draws (`<span>{{ sheetType }}</span>`) and what makes it worth
   *   saying rather than assuming.
   * - **Due and Start** are DOMAIN CONCEPTS and BUILT-IN fields —
   *   `ticket-events.ts` names them among the built-ins, and since spec
   *   2026-09-22 that list is *title/description/dueDate/startDate/priority*.
   *   Both are read through `dateClaimOf`, the ONE place that resolves a date
   *   claim (`claims/ticket-dates.ts`, whose own docblock: *"There is NO other
   *   source of dates — absence is absence"*) rather than by reinterpreting
   *   `state.fields['dueDate'].value` here.
   * - **Priority** WAS a CUSTOM-FIELD CONVENTION and IS a BUILT-IN since spec
   *   2026-09-22. This bullet is kept rather than deleted because it is the
   *   record of what the row used to be, and because the superseded reading is
   *   the reason the row is drawn the way it is: the old text measured
   *   *"`priority` appears in zero files of `packages/domain`"* and concluded
   *   the row must say *No priority claimed* whenever a type declared no such
   *   field. That state is GONE — every ticket carries a claim from birth, the
   *   engine refuses to clear one, and the value set is closed — so the row is
   *   the prototype's segmented editor and its absence arm now names the only
   *   condition that can still produce one: a read whose projection predates the
   *   field.
   *
   * ## ⚠ The prototype's three rows were EDITORS there — and now ALL THREE
   * ## that can be are editors here
   *
   * `desktop.dc.html:1192-1205` draws Priority as a segmented control whose
   * options carry `on-click` handlers, and Due as an `<input type="date">`. Only
   * **Type** is read-only there (`<span>{{ sheetType }}</span>`).
   *
   * **DUE BECAME AN EDITOR UNDER RULING E5-6 (2026-09-21)**, which is the
   * ruling that named the defect here: this paragraph used to say the
   * dispatch's scope was *"the three ROWS … not editing them"*, and the
   * deferral that followed was recorded rather than ruled — a due date every
   * other surface READS, computes lateness from and notifies about could not be
   * SET anywhere. **PRIORITY AND START CLOSE THE REMAINDER (spec 2026-09-22)**:
   * priority is the prototype's segmented control, and Start is a built-in the
   * sheet never drew at all until this change — which is why it is a new row
   * rather than a second editor on an existing one. The paragraph above is kept
   * because it is the record of why the read half shipped alone in the first
   * place, and because the words *"Priority is still that unbuilt door"* stood
   * here until this change and are now false.
   *
   * ## The absent-value copy, and what each absence now MEANS
   *
   * `No date claimed` is transcribed (`:2362`/`:2853`/`:3587` — the prototype
   * uses that exact sentence for the same absence) and is drawn by BOTH date
   * rows, which is the prototype's own behaviour for the pair. **`No priority
   * claimed` is GONE** (spec 2026-09-22): it was the custom-field convention's
   * absence, worded to be true of a ticket whose TYPE declares no such field,
   * and there is no longer such a ticket. The only absence this row can now
   * show is a read whose projection predates the field, and that sentence says
   * so and names the repair — see the row.
   */
  const ticketTypeName =
    (ticketTypes.data ?? []).find((def) => def.id === state.typeId)?.name ?? state.typeId;
  /**
   * `pendingFieldIds: []` — the sheet renders a date, and nothing here badges an
   * in-transit claim. `ClientStateCache` exposes no pending surface (measured),
   * and the sheet's other field rows do not badge one either, so this is not a
   * regression; it is stated because an empty list is a value and not a
   * placeholder.
   */
  const dueDate = dateClaimOf({ state, pendingFieldIds: [] }, 'dueDate');
  const startDate = dateClaimOf({ state, pendingFieldIds: [] }, 'startDate');
  const priorityClaim = state.fields['priority'];
  /**
   * The level the SELECTED segment shows, or `null` when this read carries no
   * claim (a stale projection — see the row). **Never `?? DEFAULT_PRIORITY`:**
   * the sheet is a READER, and the default belongs to the reducer that applied
   * it to the creation event, attributed to that event's actor. Substituting it
   * here would print a level with no claim line beside it, which is the thing
   * invariant 4 forbids — and it would hide the one condition this product has
   * to be able to see, that a projection predates the field.
   *
   * The ladder is re-checked through `prioritySchema` rather than trusted: an
   * off-ladder value in the projection is a defect the segment control could
   * only misdraw (no segment selected, no sentence saying why), and nulling it
   * routes the row down the same "no claim" arm the absence does.
   */
  const priorityValue: Priority | null =
    priorityClaim !== undefined && prioritySchema.safeParse(priorityClaim.value).success
      ? (priorityClaim.value as Priority)
      : null;
  /**
   * The children, RECONCILED against the count the server sent (door F).
   *
   * **This is the second guard, and it is deliberately independent of the
   * first.** The read that produced `subtaskRows` was measured to be complete
   * (see the `subtasks` live query), but a render that TRUSTS that measurement
   * is one refactor away from rendering a short list. The server already sends
   * the number — `totalChildren` counts them all and `restrictedCount` names
   * the ones this viewer may not see — so the derivation is checked against it
   * every render, and a disagreement is SAID rather than drawn.
   *
   * `rollup === null` is a real fact (no children at all, `ticket-cards.ts`'s
   * own reading), so it is not treated as an unknown to be excused.
   *
   * ⚠ **AND "UNREAD" IS NOT "EMPTY" — V8, 2026-09-21.** `subtaskRows` used to be
   * `subtasks.data ?? []`, which reads an in-flight or failed read as a list of
   * zero — and `useLiveQuery` resets `data` to `null` on every KEY change, which
   * this one does the moment the ticket read lands (the key carries the project
   * id; see its own comment). So on EVERY ordinary parent-ticket load, for the
   * whole second round trip, `subtaskRows.length` was 0 while `subtaskExpected`
   * was the server's real child count — and the section rendered a
   * `role="alert"` telling the person the list was *"not shown rather than shown
   * short"* about a list nobody had read yet. The reconciliation is now gated on
   * the read having ANSWERED, which is strictly narrower and keeps the property
   * this section exists for: a short list is still never drawn silently.
   *
   * ⚠ **A FAILED read is lumped in with a pending one here, and that is named
   * rather than hidden:** `subtasks.error` is not consulted below, so a child
   * read that REJECTS (past `LIST_ROW_CAP`, or a dropped connection) renders
   * neither the alert, nor the empty sentence, nor a failure sentence — the
   * section draws nothing at all. The empty sentence it used to draw in that
   * case was a false claim about the ticket, so this is smaller, but it is still
   * an absence: **owner — whoever next touches this section**, and the three-arm
   * treatment `HistoryTab` already uses (error tested BEFORE `data === null`) is
   * the model.
   */
  const subtasksUnread = subtasks.data === null;
  const subtaskRows = subtasks.data ?? [];
  const subtaskExpected =
    ticketRead.rollup === null
      ? 0
      : ticketRead.rollup.totalChildren - ticketRead.rollup.restrictedCount;
  const subtasksIncomplete =
    !subtasksUnread && ticketRead.rollup !== null && subtaskRows.length !== subtaskExpected;

  /**
   * The chip's two inputs, bound ONCE and outside the JSX.
   *
   * `parent` is bound so the discriminated union narrows: `ticketRead.parent`
   * read twice inside a ternary does not carry `kind === 'ticket'` into the
   * click closure below, where the compiler cannot see that the arm it was
   * narrowed in is the arm the closure runs in. `openParentSheet` is bound for
   * the same reason one step further on — the `undefined` test that decides
   * between a button and a pill must survive into the `onClick` that only the
   * button branch creates.
   */
  const parent = ticketRead.parent;
  const openParentSheet = onOpenTicket;

  /**
   * WHETHER this ticket can take a subtask at all, and WHICH type the child
   * takes — the single answer the form below is offered on (`16.91`–`16.95`).
   *
   * **Why this exists.** Until 2026-09-20 the form was drawn on every ticket
   * and `addSubtask` sent `typeId: state.typeId` — the PARENT'S OWN type. The
   * engine refuses `type.rank <= parentType.rank` and equal ranks satisfy that,
   * so EVERY press was refused; the owner met it as `"Errand" cannot go under
   * "Errand"` and the server was right about a payload this client built wrong.
   * The affordance and the payload now read ONE answer, so a form cannot be
   * drawn over a submission that cannot succeed — which is the whole of
   * `Features.md:88`'s rule for the New-ticket control, *"asks before it
   * offers"*.
   *
   * **Three ladder states, but FIVE render outcomes, and the extra ones are
   * the point.** "No type is deeper" and "the ladder has not been read" are
   * different facts, and rendering the first for the second asserts an absence
   * this client has not measured — the same rule, one notch quieter: the dialog
   * *"is TOLD the parent list is unavailable rather than handed an empty one"*.
   * So an UNREAD ladder renders NOTHING and claims nothing; a ladder read but
   * unusable — the read FAILED, this ticket's type is ABSENT from it, or no
   * type is deeper — renders its own sentence for each; a READ ladder with a
   * legal child draws the form. A disabled control is never one of the answers.
   *
   * ⚠ **The ladder is read OVER THE WIRE (`getTicketTypes`), not off
   * `ClientStateCache` — and that is the difference between this and
   * `precheck.ts`.** That module's own docblock records that it may not answer
   * `passed` for `ticket.created` or `ticket.reparented` because this client's
   * cache holds *"no ticket-type store"* (`precheck.ts:251-267`), so no accept
   * is derivable there. Here the definitions ARE held, the empty-vs-unread
   * distinction above is what keeps that honest, and the answer decides only
   * what to OFFER — never whether the event will be accepted, which stays the
   * server's.
   */
  const parentTypeDef = ticketTypes.data?.find((def) => def.id === state.typeId) ?? null;
  const subtaskType =
    parentTypeDef === null ? null : subtaskTypeFor(ticketTypes.data ?? [], parentTypeDef.rank);
  const subtaskWithheld =
    ticketTypes.data === null
      ? ticketTypes.error === null
        ? null
        : `The workspace's ticket types could not be read, so a subtask cannot be added here. ${ticketTypes.error}`
      : parentTypeDef === null
        ? `This ticket's type is not in the workspace's list of ticket types, so a subtask cannot be added here.`
        : subtaskType === null
          ? `This is a ${parentTypeDef.name}. Nothing smaller can sit under it.`
          : null;

  /**
   * Add a subtask (door F, 2026-09-19) — the ordinary `ticket.created` with a
   * parent, through the ingest the sheet already uses. **No route, no
   * migration**: `ticketCreatedPayload` has carried `parentId` since it was
   * written (`packages/domain/src/events/ticket-events.ts:44`).
   *
   * **`start: 'focus'`, transcribed rather than chosen.** The prototype births
   * a subtask in the workflow's FIRST state (`col: states[0].key`,
   * `desktop.dc.html:3652`) — the same thing this model's `'focus'` means. It
   * is sent ALWAYS and never left to the wire's absence-means-focus fallback,
   * for `create-ticket-flow.tsx`'s recorded reason: that fallback exists for
   * events written before the field did, and a v2 client omitting an additive
   * field is making a choice, not keeping a compatible silence.
   *
   * The title goes AS TYPED. The prototype trims before testing blank because
   * it has no schema; `ticketCreatedPayload`'s own title rule refuses a blank
   * AND a spaces-only title, so the same input draws the same refusal through
   * our mechanism, and nobody's words are quietly rewritten on the way.
   *
   * ⚠ **`typeId` is `subtaskType`, NOT `state.typeId`, since 2026-09-20 — and
   * that single word was the whole defect.** The parent's own type is refused
   * by `hierarchy.rank` for every ticket that can exist (equal ranks satisfy
   * `rank <= parentType.rank`), so the form was offering a submission no server
   * would ever accept. The prototype names this operand too and got it right:
   * `type: "Task"` (`desktop.dc.html:3654`), a FIXED type, never the sheet's.
   */
  const addSubtask = async (): Promise<void> => {
    // Unreachable by construction — the form below is drawn only when
    // `subtaskType` is non-null — and written out rather than asserted with a
    // `!`, because a payload built from a type this function cannot name is
    // exactly the defect being closed. An early return sends NOTHING, which is
    // the only honest answer available.
    if (subtaskType === null) return;
    setSubtaskRefusal(null);
    setAddingSubtask(true);
    try {
      const event = make({
        workspaceId,
        entity: { kind: 'ticket', id: newUlid() },
        type: 'ticket.created',
        payload: {
          typeId: subtaskType.id,
          projectId: state.projectId,
          parentId: ticketId,
          title: newSubtaskTitle,
          start: 'focus',
        },
      });
      // The create flow's guarded door (`submitChildEvent`), not a bare
      // `ingest`: a `hierarchy.parent-terminal` refusal is not an error but the
      // moment the reopen is offered (2026-09-30 — the sentence promised a
      // chooser this sheet never drew).
      let outcome;
      try {
        outcome = await submitChildEvent(dataSource, event);
      } catch (error) {
        if (!(error instanceof UnansweredClaimError)) throw error;
        setSubtaskRefusal('That subtask was not created: The server did not answer, so what happened is not known.');
        return;
      }
      if (outcome.kind === 'committed') {
        // Cleared only on a committed answer: a refusal keeps the title so it can
        // be fixed rather than retyped.
        setNewSubtaskTitle('');
        return;
      }
      // The sheet already holds the parent's definition and state (it IS the
      // parent), so the offer is derived from them; without the definition the
      // refusal stands as it is rather than opening a chooser with nothing in it.
      if (outcome.kind === 'needs-reopen' && workflow.data != null) {
        setSubtaskParentRefusal(null);
        setSubtaskReopen({ childEvent: event, refusal: outcome.refusal, ...reopenOfferFor(workflow.data, state) });
        return;
      }
      // A PRESENTATION of the refusal the server sent, never a paraphrase of
      // one it did not — this file's own rule for the same slot elsewhere.
      // **And BOTH non-committed arms are named, because they are different
      // sentences**: a blank title is `invalid` (`message`, from the payload
      // schema) while the rule engine's answer is a refusal (`reason`).
      const said = outcome.kind === 'invalid' ? outcome.result.message : outcome.refusal.reason;
      setSubtaskRefusal(`That subtask was not created: ${said}`);
    } finally {
      setAddingSubtask(false);
    }
  };
  /**
   * The person chose a state to reopen the parent to: reopen it, then add the
   * SAME child claim (`reopenAndProceed` — the parent's remedy first, the child
   * only once the parent is live, sequentially). Every outcome is the create
   * flow's, spoken on this sheet's own slots.
   */
  const acceptSubtaskReopen = async (toStateId: string): Promise<void> => {
    if (subtaskReopen === null) return;
    setSubtaskParentRefusal(null);
    setAddingSubtask(true);
    try {
      const outcome = await reopenAndProceed(
        dataSource,
        {
          parent: { ticketId, workspaceId },
          toStateId,
          childTicketId: subtaskReopen.childEvent.entity.id,
          childEvent: subtaskReopen.childEvent,
          parentClosed: subtaskReopen.parentClosed,
        },
        make,
      );
      if (outcome.kind === 'committed') {
        setSubtaskReopen(null);
        setNewSubtaskTitle('');
        return;
      }
      if (outcome.kind === 'parent-refused') {
        // Stays open, in the dialog, verbatim: the parent's own rules refused the
        // reopen and another target on the list may still be allowed.
        if (parentNoLongerClosed(outcome)) {
          setSubtaskReopen((prev) => (prev === null ? prev : { ...prev, parentClosed: false }));
        }
        setSubtaskParentRefusal(outcome.refusal);
        return;
      }
      setSubtaskReopen(null);
      setSubtaskRefusal(
        outcome.kind === 'child-refused-after-reopen'
          ? `${ticketRead.title} was reopened. That is now recorded history. That subtask was not created: ${outcome.refusal.reason}`
          : `That subtask was not created: ${outcome.result.message}`,
      );
    } finally {
      setAddingSubtask(false);
    }
  };
  // `statesWithBacklog`, not `workflow.data?.states` (backlog/closed spec
  // §1.4, 2026-09-17): a ticket in the universal Backlog state has no row in
  // the published definition's own `states`, and the sheet must still say
  // "Backlog" rather than the bare id.
  const currentStateName =
    workflow.data == null
      ? state.stateId
      : statesWithBacklog(workflow.data).find((candidate) => candidate.id === state.stateId)?.name ?? state.stateId;

  /**
   * THE TWO NAMES the chain's first two crumbs are drawn from — the workspace's
   * and the project's — and the rule that decides whether a crumb is drawn at
   * all.
   *
   * ## ⚠ THIS DOCBLOCK DESCRIBED A THREE-CRUMB BAR THAT NO LONGER EXISTS
   *
   * It read *"The three crumbs above the title — `Workspace › Project › State`"*
   * and **"So three, and the state is the third."**, and it recorded that the
   * ticket KEY *"is the FOURTH CRUMB OF OURS"* and *"is still not built"*
   * because *"`TicketRead` does not carry the key either — it is the SAME seven
   * fields"*. **Every one of those sentences was true when written and all of
   * them are false now**, and an independent reviewer found them still standing
   * beside the code that contradicts them. Corrected rather than deleted, since
   * the reasoning about *what the crumb list owes a reader* is what the new
   * derivation was built on.
   *
   * The chain is the AUTHORITY's now — `workspace › project › [epic] › [parent] ›
   * key`, `sheetCrumbs` at `desktop.dc.html:3404-3425` — **there is no state
   * crumb in it**, and the key crumb is built: `TicketRead` gained `key` and
   * `epic`. The chain's own derivation, its link arms and the last crumb's
   * fallback are documented at `ancestorCrumb` and `lastCrumb` below, beside the
   * code that draws them.
   *
   * What survives HERE is the part that is about these two NAMES:
   *
   * ## A crumb is drawn only for a KNOWN name, and that is a correction
   *
   * My first cut printed the ID for `null`, on `my-work.tsx:226-234`'s rule
   * ("id-only rather than blank") for a withdrawn name. **That rule does not
   * transfer, and the difference is the data, not the taste.** There,
   * `WorkItem.projectName === null` is a SERVED answer: the server sends the
   * project with no name *because* the viewer may not be told it. Here the name
   * arrives from `useProjectName`, whose own caller documents that it returns
   * null "while pending or refused" (`page.tsx:172`) — **two different facts,
   * one value — and the hook cannot tell them apart.** Printing an id would
   * assert "you may not be told this project's name" during a load that is
   * about to answer, which is a claim this component has no basis for.
   *
   * So the behaviour is the sibling surface's, not a new one: the project page
   * renders its own title exactly this way — `{projectName !== null ? <h1>…</h1>
   * : null}` (`page.tsx:1614`).
   *
   * ⚠ **"the state crumb always renders, because it is derived here rather than
   * fetched" stood here and is GONE with the crumb.** The state is still on the
   * sheet — its own chip, from the same `currentStateName` — but it is no longer
   * a crumb, so nothing in this list is derived from the workflow any more.
   *
   * The two names are the props documented on `TicketSheetProps` — **they are
   * NOT on `TicketRead`**, which carries no name of any kind.
   *
   * ## An EMPTY string is not a name either, and the first cut let one through
   *
   * That version was `workspaceName ?? null`, and the gate below reads
   * `!== null` — so a served `name: ''` would have rendered a blank crumb and a
   * dangling separator. **Whether the server can send one is NOT established:**
   * `asString` (`online/mappers.ts`) checks only `typeof`, so nothing between
   * the wire and here refuses it, but an independent reviewer flagged that as a
   * code reading rather than a demonstrated defect and I did not chase it. The
   * `!== ''` costs nothing and makes this docblock's phrase "a real string" true
   * of the code rather than of the intent.
   */
  const workspaceCrumb = workspaceName === undefined || workspaceName === null || workspaceName === ''
    ? null
    : workspaceName;
  const projectCrumb = projectName === undefined || projectName === null || projectName === ''
    ? null
    : projectName;

  /**
   * THE ANCESTOR CRUMBS — the ticket's grandparent and parent, in that order,
   * between the project and the ticket.
   *
   * ## Why these two and not "every layer"
   *
   * The owner asked for *"workspace -> project -> grandparent -> parent (or
   * however many layers here) -> ticket"*, and the AUTHORITY draws exactly two
   * conditional ancestors — `[epic.title] if sheet.epicId` and
   * `[parent.id + " " + parent.title] if sheet.parentId`
   * (`desktop.dc.html:3404-3425`). Two is the authority's answer and it is the
   * one transcribed; the deeper chain the owner's parenthesis allows would need
   * a read per layer, and `TicketRead.epic`'s docblock records why the server
   * resolves the top one rather than the client climbing.
   *
   * ## An ancestor this viewer may not see is NAMED, never dropped
   *
   * A `restricted` ancestor is existence-without-title — the same shape
   * `ParentRef` already carries for the parent indicator eight hundred lines
   * above — and it renders as a sentence rather than as an absence. Dropping it
   * would make a restricted chain look like a SHORTER one, which is the vanish
   * `invariant 5` forbids and the exact reason the parent indicator has a
   * restricted arm at all. It is never a link: the viewer cannot open what they
   * cannot see.
   *
   * ## A link only where a callback can honour it
   *
   * The authority's ancestors each open that ticket's sheet, and `onOpenTicket`
   * is the prop that does it — present on the mount, absent for a caller that
   * cannot open anything (`page.tsx` passes it). With no callback the crumb
   * degrades to a plain span, which is that prop's own recorded rule: *"a
   * control that cannot be honoured"* is not drawn. One hop per crumb, exactly
   * as the `Subtask of` chip does it, and no traversal lives here to loop.
   *
   * ⚠ **P4 — "THE SAME PLAIN SPAN THE RESTRICTED ARM USES" WAS FALSE, AND THIS
   * PARAGRAPH SAID IT.** The two arms share a SHAPE (a plain `<span>` with the
   * base class and no testid behaviour of its own) and **not an ink**:
   * `.gn-ticket-sheet__crumb--restricted` carries `var(--gn-restricted)`
   * (`ui.css`), while this arm carries the bare class and inherits
   * `var(--gn-text-muted)` from `.gn-ticket-sheet__crumbs`. So a crumb that is
   * merely NOT OPENABLE and a crumb whose ticket the viewer may not SEE were
   * painted the same way by a sentence that claimed they were the same span —
   * and the sentence was the only thing making them look alike.
   *
   * The wrong half is the word SAME, not the design: **the inks stay
   * different**, because "you cannot open this here" and "you may not see this"
   * are different facts and this surface already keeps them apart everywhere
   * else. What was missing was an honest description, and the identical
   * sentence in `Features.md` is corrected in the same change.
   */
  /**
   * P3 — THE PARENT CRUMB READS `KEY Title`, AND THE EPIC CRUMB DOES NOT.
   *
   * That asymmetry is the prototype's, not an invention here: its parent crumb
   * is `p.id + " " + p.title` (`Gisik Nokma - Desktop.dc.html:3417`) and its
   * epic crumb is `e.title` alone (`:3410-3413`). The product matched the epic
   * and not the parent, because
   * the wire carried no key for an ancestor — and the cost was not cosmetic:
   * **the key is what disambiguates**, so a ticket whose epic and parent share a
   * title drew two IDENTICAL crumbs and a reader could not tell one ancestor
   * from two of them.
   *
   * `key` is `string | null | undefined` on `ParentRef` and the three states are
   * three facts — see that type's docblock. Only ONE of them renders a key: a
   * string. `null` (this read could not compose one) and absent (this ref
   * carries none — every epic) both fall back to the title alone, which is the
   * only behaviour they share.
   */
  // ⚠ WHICH CRUMB IT IS — THE `noun` — DECIDES, NOT WHETHER A KEY IS PRESENT.
  // The first version of this helper showed the key whenever the ref had one,
  // and it drew `CCSO-7 Open Questions` for the EPIC as readily as for the
  // parent: the asymmetry lives in the PROTOTYPE'S TWO CRUMBS, so a renderer
  // that keys off the data cannot express it. Deriving it from `noun` is sound
  // and deriving it from `testId` would not be — the same distinction the
  // parameter above already records: the noun is which crumb this is, the test
  // selector is how a test finds it.
  //
  // The parameter is the TICKET arm alone, and that is the narrowing rather than
  // a convenience: `ancestorCrumb` answers the restricted case before it reaches
  // either call site, so a restricted ref can never be labelled here — and a
  // signature that admitted one would invite a `Restricted …` string built in
  // two places instead of the one that already exists.
  const crumbLabel = (
    ancestor: Extract<NonNullable<ParentRef>, { kind: 'ticket' }>,
    noun: 'epic' | 'parent',
  ): string => {
    const key = ancestor.key;
    const withKey = noun === 'parent' && typeof key === 'string' && key !== '';
    return withKey ? `${key} ${ancestor.title}` : ancestor.title;
  };

  const epicCrumb = ticketRead.epic;
  /**
   * E4-1 / E5-3 — THE EPIC CRUMB IS OMITTED WHEN IT IS THE PARENT, because a
   * crumb list is a PATH or it is nothing.
   *
   * The server's ancestry walk (`apps/server/src/routes/tickets.ts`) starts at
   * `state.parentId` and returns the first ancestor whose type is an epic — so
   * when the ticket's DIRECT PARENT is an epic, `epic.id === parent.id`. The
   * bar then rendered the same ancestor twice under two independent null
   * checks, and nothing compared their ids:
   *
   *     Convenience Corner › Shop operations › Open questions › Open questions › CCSO-6
   *
   * Two link crumbs, one ticket, and a depth the hierarchy does not have. That
   * is the argument this file already makes three lines up in the other
   * direction — *"a breadcrumb that skips a level states a hierarchy the
   * product does not have"* — and the owner's own ruling quoted above is a
   * chain of DISTINCT layers. It is not cosmetic for a screen-reader user, who
   * hears two identical links and cannot tell one ancestor from two.
   *
   * **Blast radius, measured by the reviewer:** `23 of 26` tickets in the
   * seeded project have an epic as their direct parent, so this is the ordinary
   * shape rather than an edge. The prototype never shows the doubled form (its
   * fixtures' `parentId` and `epicId` sets are disjoint), so it gives no
   * authority for it.
   *
   * The comparison is on `id` ACROSS both `ParentRef` arms — a `restricted`
   * ancestor carries an id and no title, and two restricted refs to one ticket
   * are the same node for the same reason. **The EPIC crumb is the one dropped
   * and the PARENT crumb is kept**: the parent is the nearer, and it is the one
   * whose testid a reader of this file would look for.
   */
  const epicCrumbIsTheParent = epicCrumb !== null && parent !== null && epicCrumb.id === parent.id;
  const ancestorCrumb = (
    // `NonNullable`, because BOTH call sites have already answered the null
    // case — a missing ancestor is an omitted crumb, not a rendered one — and
    // the two arms left are exactly the two this decides between.
    ancestor: NonNullable<ParentRef>,
    testId: string,
    onOpen: ((ticketId: string) => void) | undefined,
    // ⚠ THE NOUN IS A PARAMETER AND NOT DERIVED FROM `testId`, which is what an
    // earlier version of this helper did — it read
    // ``testId === 'sheet-crumb-epic' ? 'epic' : 'parent'`` and so keyed
    // USER-VISIBLE COPY on a test selector. A third caller, or a renamed
    // testid, would have silently changed what a reader is told. An independent
    // reviewer flagged it; no current call site was wrong, which is exactly why
    // it would have survived until one was.
    noun: 'epic' | 'parent',
  ): ReactElement =>
    ancestor.kind === 'restricted' ? (
      <span className="gn-ticket-sheet__crumb gn-ticket-sheet__crumb--restricted" data-testid={testId}>
        {`Restricted ${noun}`}
      </span>
    ) : onOpen === undefined ? (
      <span className="gn-ticket-sheet__crumb" data-testid={testId}>
        {crumbLabel(ancestor, noun)}
      </span>
    ) : (
      <button
        type="button"
        className="gn-ticket-sheet__crumb gn-ticket-sheet__crumb--link"
        data-testid={testId}
        onClick={() => onOpen(ancestor.id)}
      >
        {crumbLabel(ancestor, noun)}
      </button>
    );

  /**
   * THE WORKSPACE AND THE PROJECT CRUMBS — a LOCATION each, so a LINK each
   * (owner request, 2026-09-22).
   *
   * `ancestorCrumb` above draws a `<button>` when it can be honoured, because
   * opening an ancestor needs a server lookup first. These two need none: the
   * host already knows `/w/<workspaceId>` and `/w/<workspaceId>/p/<projectId>`,
   * and a known address is an `<a href>` — which is what buys middle-click, new
   * tab and copy-link-address. With no `href` the crumb is today's plain span,
   * the same degradation `ancestorCrumb` makes with no callback.
   *
   * ## The click is the host's, and only a PLAIN LEFT click is intercepted
   *
   * `onNavigate` absent → the anchor navigates natively and nothing is
   * consumed. Present → a plain left click is prevented and routed in-app, and
   * everything else is left alone deliberately:
   *
   *   - the four modifier keys are the reader asking for a new tab, a new
   *     window or a download — routing in-app would silently replace that with
   *     the navigation they did not ask for;
   *   - `event.button !== 0` is the middle click, the other standard way to open
   *     a background tab. It is a SEPARATE guard from the modifier list because
   *     a middle click carries no modifier at all;
   *   - `event.defaultPrevented` is a control higher up the tree having already
   *     decided this click, and `Sheet` registers document-level handlers —
   *     consuming the event a second time would be this crumb overriding an
   *     answer it does not own.
   */
  const locationCrumb = (
    label: string,
    href: string | undefined,
    testId: string,
  ): ReactElement =>
    href === undefined ? (
      <span className="gn-ticket-sheet__crumb" data-testid={testId}>
        {label}
      </span>
    ) : (
      <a
        className="gn-ticket-sheet__crumb gn-ticket-sheet__crumb--link"
        href={href}
        data-testid={testId}
        onClick={(event) => {
          if (onNavigate === undefined) return;
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          onNavigate(href);
        }}
      >
        {label}
      </a>
    );

  /**
   * THE LAST CRUMB — the ticket's own identifier, PLAIN and bold.
   *
   * The owner: *"should show the ticket key"*. `ticketRead.key` is that key, or
   * `null` when this read could not compose one (see its docblock — the number
   * is derived from the ledger's order, so offline answers `null`).
   *
   * ⚠ **The fallback is the TITLE, and it is a deliberate substitution rather
   * than a stand-in for the key.** A crumb list is a path to the thing the
   * reader is looking at, so the last crumb has to NAME that thing; ending the
   * chain at the parent would be a path that stops one step short of its own
   * subject. The title is the ticket's other true name and is always on this
   * read. **What is NOT substituted is `state.id`** — a ULID is not a key, and
   * printing one where a key goes answers the crumb's question with a different
   * kind of thing. `my-work.tsx`'s *"id-only rather than blank"* rule does not
   * license it: that rule is for a SERVED withheld name, and this absence is a
   * derivation this read could not complete.
   */
  const lastCrumb = ticketRead.key ?? ticketRead.title;
  // OPTIONAL on `TicketState` (441 fixtures predate it, spec §1.2,
  // 2026-09-17); every reader spells the same `?? null`.
  const closed = state.closed ?? null;
  /*
    ONE handler for BOTH Move doors (the state row's `Move…` and the header's phone shortcut), so
    exactly one `TransitionDialog` can open and both clear the same stale refusal first (case 21.071).
  */
  const openMove = () => {
    setServerRefusal(null);
    setTransportError(null);
    setMoveOpen(true);
  };

  /**
   * THE ASSIGNEE ROW — a control, a claim line, and FOUR arms for the candidate
   * list. The owner's ruling is *"assignee should not be read only"*.
   *
   * ## The candidate list was already here, and the dispatch did not know it
   *
   * The dispatch priced this task as *"a picker needs a roster, which is a
   * SEVENTH thing to pass"*, measured from a six-prop mount. **The sheet already
   * reads the roster itself**, twelve lines above the ticket it reads the same
   * way — `useLiveQuery(dataSource, workspaceId, workspaceId, () =>
   * dataSource.query.getMembers(workspaceId))` — and already uses it for
   * `nameOf` and for `VisibilityEditor`. Nothing is passed and nothing new is
   * read; the picker's candidates were in the component before this task.
   *
   * ## The arms, and why there are four rather than one
   *
   * The page this sheet is opened from already distinguishes `members === null`
   * from `membersError !== null` from an empty roster, and its own docblock names
   * the defect of not doing so: *"`null` while the roster has not been read —
   * never `[]`, which would claim this workspace has no members."* **This sheet
   * was doing exactly that** — `members={members.data ?? []}` at the
   * `VisibilityEditor` below, with `members.error` read nowhere in the file. An
   * assignee picker that rendered a REFUSED roster as an empty list would assert
   * that nobody can be assigned, which is a worse lie than a filter's.
   *
   * The fourth arm is the one the members page's role control established: **a
   * control must be able to STATE its current value.** `Select` renders its
   * placeholder when its `value` matches no option (`select.tsx:255`), and the
   * roster this sheet reads HIDES GUESTS FROM A NON-ADMIN CALLER — so a ticket
   * assigned to a guest would give a member a picker reading `Select…` beside a
   * ticket that has an assignee. So the picker is drawn only when the current
   * assignee is among the options, and the row falls back to saying what it is.
   */
  const UNASSIGNED = '__unassigned__';
  const OUTSIDER_OPTION = '__outsider__';
  const assigneeRow = ((): { control: ReactNode; claim: string } => {
    const claim = optimistic.overlaidFields.has('assigneeId')
      ? SAVING_CLAIM
      : ticketRead.assignedProvenance === null
        ? // `null` is the whole truth for BOTH "never assigned" and "assigned,
          // then cleared" — the server's own reader says why they cannot be told
          // apart (there is no claim without an actor), so this sentence claims
          // only what it can: whether anybody is assigned now.
          state.assigneeId === null
            ? 'nobody is assigned'
            : 'assigned'
        : `set by ${nameOf(ticketRead.assignedProvenance.actorId)} on ${formatDate(ticketRead.assignedProvenance.serverTime)}`;
    const readOnly = <span>{state.assigneeId === null ? '—' : nameOf(state.assigneeId)}</span>;

    if (members.error !== null) {
      return {
        control: (
          <span className="gn-ticket-sheet__assignee-refusal">
            This workspace’s roster could not be loaded, so the assignee cannot be changed here.
          </span>
        ),
        claim,
      };
    }
    if (members.data === null) {
      return {
        control: <span className="gn-ticket-sheet__assignee-refusal">The workspace roster has not loaded yet.</span>,
        claim,
      };
    }
    const people = members.data;
    const outsideRoster = state.assigneeId !== null && !people.some((member) => member.id === state.assigneeId);
    if (outsideRoster && lookupPerson === undefined) {
      // Assigned to somebody this viewer's roster does not list — a guest, to a
      // non-admin caller. The row says the name it can and offers no control,
      // rather than offering one that cannot state the value.
      return { control: readOnly, claim: `${claim}, not in the roster you can see` };
    }
    // With the outsider arm on (final review, 2026-09-29): a member who pulls an
    // outsider in must be able to change or clear that assignment, so the picker
    // stays and carries the current assignee as ONE labelled option.
    const outsideOption =
      outsideRoster && state.assigneeId !== null
        ? [
            {
              value: state.assigneeId,
              label: pickedOutsider?.userId === state.assigneeId ? pickedOutsider.name : ASSIGNEE_OUTSIDE_ROSTER,
            },
          ]
        : [];
    return {
      control: (
        <>
        <Select
          aria-label="Assignee"
          options={[
            // The unassigned arm is an OPTION and not the absence of one:
            // `ticket.assigned` with `null` is a legal state the control must be
            // able to express, and a picker with no way back to it cannot.
            { value: UNASSIGNED, label: 'Unassigned' },
            // RULING E4-18: `member.name` verbatim rendered a BLANK option
            // for a member with no display name — an empty string on screen,
            // which is a hole rather than a degradation. The id floor was the
            // first fix; since 2026-09-22 the ADDRESS is the second step
            // (`memberLabel`, owner request: *"if name is empty/blank, show the
            // email"*), so a nameless member with a real address is offered by
            // their address and only a member with neither is offered by their
            // id. `actorLabel` is deliberately NOT used: a picker option is a
            // person, and the system-actor override belongs to claims — the
            // same reason `visibility-editor.tsx`'s picker has its own label.
            ...outsideOption,
            ...people.map((member) => ({
              value: member.id,
              label: memberLabel(member),
            })),
            ...(lookupPerson === undefined ? [] : [{ value: OUTSIDER_OPTION, label: ASSIGN_OUTSIDER_OPTION }]),
          ]}
          value={state.assigneeId ?? UNASSIGNED}
          onChange={(next) => {
            if (next === OUTSIDER_OPTION) {
              setFindingOutsider(true);
              return;
            }
            void submitAssignee(next === UNASSIGNED ? null : next);
          }}
        />
        {findingOutsider && lookupPerson !== undefined ? (
          <OutsiderFinder
            lookup={lookupPerson}
            onCancel={() => setFindingOutsider(false)}
            onPick={(person) => {
              setFindingOutsider(false);
              setPickedOutsider({ userId: person.userId, name: person.name });
              void submitAssignee(person.userId, !person.inWorkspace);
            }}
          />
        ) : null}
        </>
      ),
      claim,
    };
  })();

  /**
   * The description, derived once for the row below — and the CLAIM is what
   * makes this a two-arm question rather than the assignee row's three.
   *
   * `FieldClaim` always carries its actor: the reducer writes
   * `claim(p.value, env)` and there is no claim without one. So the arms here
   * are the whole truth and are told apart cleanly — **absent means nobody has
   * ever written one**, and present means somebody did and the line can name
   * them. The assignee row cannot say that, because `assignedProvenance`
   * collapses "never assigned" into the same `null` as "assigned, then
   * cleared"; this one has no such collision and does not pretend to.
   */
  const descriptionClaim = state.fields['description'];
  const descriptionClaimLine =
    descriptionClaim === undefined
      ? 'no description yet'
      : `set by ${nameOf(descriptionClaim.actorId)} on ${formatDate(descriptionClaim.serverTime)}`;

  /**
   * Whether the mounted editor may be TYPED INTO. This answers one question —
   * *is a real composer here at all* — and deliberately answers no other.
   *
   * It is NOT an authority check, and must not become one. The sheet's standing
   * position, spelled out at length on `canSetVisibility` above, is that the
   * only party that knows who may write is the ingest door: a control hidden on
   * a client-side guess is unreachable and therefore leaves the door's own
   * refusal unrendered, and it hides the power from exactly the people entitled
   * to use it. `checkTicketFieldSet` answers this on the server, and its answer
   * arrives here as `serverRefusal`.
   *
   * `editorSlot === undefined` is a different fact of a different kind: no
   * composer was mounted, so the read-only fallback is rendering. Its own note
   * says it "composes nothing … by having no control to type into rather than
   * by offering one that silently discards what is typed" — and passing it
   * `readOnly={false}` would be this sheet asserting an editability that
   * component does not have.
   */
  const canEditDescription = editorSlot !== undefined;

  /** The editor's own failures, carried into their own slot — never swallowed. */
  const reportEditorError = (err: unknown): void => {
    setEditorError(err instanceof Error ? err.message : String(err));
  };

  /**
   * What a COMMENT editor can do here, built once for both mounts of it: the composer and the in-place edit
   * (MCP-everything T5, FIX 1). One object so the two cannot drift — an edit that lacked `queryUsers` found nobody
   * on `@` while the manual promises that mentions added in an edit notify the new people. `renderEditor` (far above)
   * reads it when it RENDERS, long after this line has run.
   */
  const commentEditorCapabilities = {
    queryUsers,
    queryNotes,
    ...(queryTickets === undefined ? {} : { queryTickets }),
    ...(resolveTicketHref === undefined ? {} : { resolveTicketHref }),
    isPurged: purgedComments.isPurged,
    uploadAttachment,
    emitAttachmentAdded,
    onError: reportEditorError,
  };

  // UX fixes T7 (BRD-12, case 23.125): on a phone the sheet opens on its FIELDS (State, Assignee, Priority) and the
  // description editor waits behind "Add a description" / "Edit description". A description that exists stays on
  // the page, read-only, until the button is tapped; a sheet with no editor wired has nothing to collapse. The
  // description is rendered after the fields list there (DOM order, so Tab and the screen reader agree with the eye).
  const descriptionCollapsed = phone && canEditDescription && !descriptionOpen;
  const descriptionSection = (
          <section
            className="gn-ticket-sheet__description"
            aria-labelledby="gn-ticket-sheet-description-label"
            data-testid="field-description"
          >
            {/* The field id was leaking into the UI: `:2454` renders
                `{fieldId}` for custom fields, and this row copied that shape
                instead of writing a caption, so the sheet read "description"
                beside "Assignee", "Priority", "Due" and "Type" (exec4 E4-4).
                Title case, matching those siblings. */}
            {/* The caption, and the `id` the composer below is NAMED BY
                (exec1 P21). The `id` is load-bearing, not decorative: it is
                what `EditorSlot`'s `labelledBy` points at, so the words a
                sighted reader sees here and the name a screen reader
                announces are the SAME NODE and cannot drift. An `id` that
                nothing references would be a leftover — if this mount ever
                stops passing `labelledBy`, delete it in the same change. */}
          <h3 id="gn-ticket-sheet-description-label" className="gn-ticket-sheet__caption">Description</h3>
              {/*
                ⚠ BOTH BRANCHES ARE LIVE AND NEITHER IS DEAD CODE — do not
                collapse them. `editorSlot` is the app's real Tiptap composer;
                `PlainTextEditorSlot` is this package's read-only default,
                which renders the document and offers no control to type into.
                A build that has not wired an editor is not a broken build, and
                the fallback is the correct behaviour for it — what was wrong
                was that the editor was never available. THIS CHANGE IS THE ONE
                THAT MAKES THE FIRST BRANCH REACHABLE FROM `apps/web`.

                `submit` is what makes a mounted editor usable at all:
                `TicketEditorSlot` disables its control and NAMES the gap when
                it is absent ("there is nowhere to send the words"). It is
                passed unconditionally because the read-only fallback ignores
                every capability prop on purpose.
              */}
              {purgedDescription.ready && !(descriptionCollapsed && descriptionClaim === undefined) ? (
              <EditorSlot
                key={descriptionCollapsed ? 'view' : 'edit'}
                mode="description"
                // The composer is NAMED BY the `<dt>` above rather than given
                // its own copy of the words (exec1 P21) — the same mechanism
                // the ticket sheet's tablist fix used, and the reason this row
                // does not also pass a `label` to contradict it.
                labelledBy="gn-ticket-sheet-description-label"
                doc={descriptionClaim?.value}
                readOnly={!canEditDescription || descriptionCollapsed}
                workspaceId={workspaceId}
                ticketId={ticketId}
                placeholder="No description yet"
                submit={submitDescription}
                queryUsers={queryUsers}
                queryNotes={queryNotes}
                {...(queryTickets === undefined ? {} : { queryTickets })}
                {...(resolveTicketHref === undefined ? {} : { resolveTicketHref })}
                isPurged={purgedDescription.isPurged}
                onError={reportEditorError}
              />
              ) : null}
              {descriptionCollapsed ? (
                <Button onClick={() => setDescriptionOpen(true)}>
                  {descriptionClaim === undefined ? 'Add a description' : 'Edit description'}
                </Button>
              ) : null}
              <span className="gn-ticket-sheet__claim">{descriptionClaimLine}</span>
          </section>
  );

  return (
    <Sheet
      open
      title={ticketRead.title}
      onClose={onClose}
      full={sheetFull}
      /*
        THE HEADER'S OWN COLUMN: the location breadcrumb, then the title as a
        CONTROL. Both are the prototype's (`desktop.dc.html:1101-1116` — a
        `<nav>` of crumbs, then a borderless `<input>` carrying the title in
        22px/600; ours is `TitleField`, a wrapping one-row `<textarea>`), and they are one `titleSlot` rather than two props because
        the prototype draws them as one flex column with a 6px gap, and two
        independent slots could not express that.

        ⚠ `Sheet` still receives `title={ticketRead.title}` and that is NOT
        redundant: it is the dialog's `aria-label`. The slot is what the reader
        sees and edits; the string is what names the sheet to a screen reader,
        and it stays the SERVER's title even while a draft is on screen — a
        control mid-edit is not a name.
      */
      titleSlot={
        <div className="gn-sheet__heading">
          {/*
            ⚠ THE WHOLE NAV IS GATED ON BOTH NAMES, and my first cut was wrong
            in a way worth recording. It drew whatever crumbs it had — so a
            caller that supplied a workspace but no project got
            `Workspace › Doing`, which is not a path: the project is missing
            from the MIDDLE, and a breadcrumb that skips a level states a
            hierarchy the product does not have. A crumb list is a PATH or it is
            nothing, so it is drawn whole or not at all.

            ⚠ AND THE TWO CRUMBS THIS NAV OPENS WITH ARE NO LONGER PLAIN TEXT
            (owner request, 2026-09-22: *"the workspace and the project should
            also be clickable from the breadcrumb"*). They were
            `<span className="gn-ticket-sheet__crumb">`, and this sentence is the
            correction rather than a footnote: `locationCrumb` above draws each
            as an `<a>` when its host passed an href, and as exactly the plain
            span it has always been when it did not. **The gate on the two NAMES
            is unchanged** — an href does not make a name, and a caller that
            passed hrefs with no names still gets no nav at all.
          */}
          {workspaceCrumb !== null && projectCrumb !== null ? (
            <nav className="gn-ticket-sheet__crumbs" aria-label="Ticket location">
              {locationCrumb(workspaceCrumb, workspaceHref, 'sheet-crumb-workspace')}
              <span className="gn-ticket-sheet__crumb-sep" aria-hidden="true">
                ›
              </span>
              {locationCrumb(projectCrumb, projectHref, 'sheet-crumb-project')}
              {/* THE ANCESTORS, in the authority's order and under its own
                  conditionals (`desktop.dc.html:3410-3419`): the grandparent
                  only when there is one, the parent only when there is one.
                  Each is preceded by its own separator, so a chain with no
                  ancestors at all renders exactly the two crumbs the project
                  and the ticket need.

                  ⚠ AND THE GRANDPARENT ONLY WHEN IT IS NOT THE PARENT
                  (E4-1/E5-3): the authority's own conditionals do not cover
                  that case because ITS fixtures never produce it, but the
                  server's ancestry walk does — see `epicCrumbIsTheParent` above
                  for the mechanism, the 23-of-26 blast radius, and why the EPIC
                  is the crumb dropped rather than the parent. With the
                  comparison removed the bar reads
                  `… › Open questions › Open questions › CCSO-6`: one ancestor,
                  named twice, stating a depth the hierarchy does not have. */}
              {epicCrumb === null || epicCrumbIsTheParent ? null : (
                <>
                  <span className="gn-ticket-sheet__crumb-sep" aria-hidden="true">
                    ›
                  </span>
                  {ancestorCrumb(epicCrumb, 'sheet-crumb-epic', openParentSheet, 'epic')}
                </>
              )}
              {parent === null ? null : (
                <>
                  <span className="gn-ticket-sheet__crumb-sep" aria-hidden="true">
                    ›
                  </span>
                  {ancestorCrumb(parent, 'sheet-crumb-parent', openParentSheet, 'parent')}
                </>
              )}
              <span className="gn-ticket-sheet__crumb-sep" aria-hidden="true">
                ›
              </span>
              {/* The last crumb is the CURRENT position, drawn plain-and-bold
                  rather than as a link — there is nowhere further to go from
                  here. It is the ticket's KEY (the owner's *"should show the
                  ticket key"*, and `#595` shipped the composition); `lastCrumb`
                  above records why the title stands in when this read could not
                  compose one. */}
              <span
                className="gn-ticket-sheet__crumb gn-ticket-sheet__crumb--current"
                data-testid="sheet-crumb-ticket"
              >
                {lastCrumb}
              </span>
            </nav>
          ) : null}
          {/*
            `value` is the draft OR the server's title, never a second piece of
            state — see `titleDraft`'s docblock. `onBlur` commits, `Enter`
            commits, `Escape` abandons; there is no Save button because the
            prototype has none, and a field that shows a Save control next to
            text a reader may not have touched invents a step.

            `aria-label` rather than a visible label: the field sits where a
            heading sat, and the visible text is the title itself. `TitleField`
            is a one-row textarea that grows with its content, so a long title
            wraps instead of being clipped beside the header's actions.
          */}
          <TitleField
            value={titleDraft ?? ticketRead.title}
            disabled={titleSaving}
            onChange={setTitleDraft}
            onBlur={() => {
              if (titleDraft !== null) void submitTitle(titleDraft);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (titleDraft !== null) void submitTitle(titleDraft);
                return;
              }
              if (event.key === 'Escape') {
                // ⚠ `preventDefault` IS LOAD-BEARING, and without it this branch
                // did not do what its sentence said. `Sheet` registers a
                // DOCUMENT-level Escape that calls `onClose`; the field's Escape
                // runs first but did not consume the event, so the sheet closed
                // and "abandon the draft" was true of an input being unmounted.
                // An independent reviewer measured `onClose` called once.
                //
                // **The reviewer also said this branch ALREADY called
                // `preventDefault`, and it did not** — I repeated that claim into
                // `Sheet`'s docblock before checking it, and the case that
                // caught the difference is the one asserting `onClose` was never
                // called. A peer's finding is a claim; this is the half of it
                // that was wrong.
                //
                // Nothing reaches the ledger either way.
                event.preventDefault();
                setTitleDraft(null);
              }
            }}
          />
        </div>
      }
      /*
        THE AUTHORITY'S `Full screen` CONTROL (`desktop.dc.html:1119-1120`): a
        pill in the header, 32px minimum height, fully round, the control-surface
        fill and shadow, accent ink at 13px/600, an icon and a LABEL that both
        change with the state.

        The label goes on the visible text AND on `aria-label`, which is what the
        prototype does; the accessible name is therefore the visible words, so a
        screen reader and a sighted reader are told the same thing — including
        the half that matters, that pressing it again EXITS rather than entering.

        `full` is passed rather than handled here because the scrim, the panel
        and the body all move together, and all three belong to `Sheet`.
      */
      headerActions={
        <>
        {/*
          The phone-only Move shortcut (plan FD10, case 21.071): the Move… button lives in the State
          row, a long scroll down in the full-screen sheet, so the sticky header carries a second door
          to the SAME handler. `.gn-sheet__move` is `display: none` above 40rem. Its accessible name is
          "Move this ticket" — distinct from the state row's "Move…" and the dialog's "Move" confirm, so
          no exact-name query on either is made ambiguous by the shortcut being in the tree.
        */}
        <Button
          className="gn-sheet__move"
          aria-label="Move this ticket"
          onClick={openMove}
          disabled={closed !== null}
        >
          Move
        </Button>
        <button
          type="button"
          className="gn-sheet__full"
          aria-label={sheetFull ? 'Exit full screen' : 'Full screen'}
          onClick={() => setSheetFull((was) => !was)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* The prototype's own two paths (`:3402`): arrows pointing OUT while
                the sheet is a panel, and IN once it fills the screen. */}
            <path d={sheetFull ? SHEET_EXIT_PATH : SHEET_ENTER_PATH} />
          </svg>
          {sheetFull ? 'Exit full screen' : 'Full screen'}
        </button>
        </>
      }
    >
      {/*
        THE CHIPS LINE (`desktop.dc.html:1128-1133`), under the title and above
        the tabs: the state chip, then the `Restricted` chip when the standing
        audience is explicit, then the `Closed by … on …` chip when the ticket is
        closed.

        ⚠ THE PROTOTYPE'S *Recorded in this browser · 12:04:18* IS NOT DRAWN, and
        its absence is a decision rather than an omission: nothing in our data is
        that clock, and a fabricated timestamp on a sheet whose whole subject is
        per-field attribution is the one lie this file exists to refuse.

        ⚠ AND THE CLOSED CHIP MOVED UP HERE, from the state line below. The badge
        span in the row was removed in the same change rather than left beside
        it — two copies of `Closed by … on …` on one screen leaves a reader no
        way to tell which is the record. It is NOT a new claim: it is the same
        sentence the badge carried, drawn where the prototype draws it. */}
      <div className="gn-ticket-sheet__chips" data-testid="sheet-chips">
        <Chip tone={state.stateCategory}>{currentStateName}</Chip>
        {standingVisibility?.resolvedMode === 'explicit' ? (
          <Chip tone="restricted">Restricted</Chip>
        ) : null}
        {closed !== null ? (
          <Chip tone="terminal">{`Closed by ${nameOf(closed.actorId)} on ${formatDate(closed.at)}`}</Chip>
        ) : null}
      </div>

      {/*
        ONE ELEMENT, THREE FACTS — and it used to be TWO elements.

        ## The duplication the owner ruled away (2026-09-20)

        Until this change the same question was answered twice on one
        screen: this line drew the parent's TITLE as plain text, and the
        subtasks head drew a `Subtask of {title}` chip for the same parent —
        with the restricted case worded differently in each place
        (`Restricted parent — exists, but you can't see it` here,
        `Subtask of a restricted parent` there), and "At project root"
        appearing here and NOTHING appearing there. Two elements, one
        question, two sets of words, in two places *"and only one of them is
        where a person looks for the hierarchy"*.

        The owner ruled the merge, verbatim: *"you can keep the badge. but
        the placement is confusing. there is already a
        `gn-ticket-sheet__parent` section above. put the badge in that
        position instead. you can remove that `gn-ticket-sheet__parent`."*
        So the chip came UP into this position and the subtasks head lost
        its copy. The wrapper keeps the old class so the rule at
        `ui.css`'s `.gn-ticket-sheet__parent` is still the thing that draws
        this line — the alternative was renaming it and leaving an orphaned
        rule behind, which the same ruling forbids.

        ## The three arms, and WHY the root arm is not the badge

        A RESTRICTED parent is existence-without-title — the ticket has a
        parent and this viewer may not see which; rendering it as "At
        project root" would turn a restriction into a vanish (invariant 5).
        A NULL parent really is at the root, and **a root is not a subtask**,
        so it does not get a "Subtask of" badge: the sentence stays, because
        a crumb chain that ends at the project is a different reading of the
        same silence. A visible parent shows the badge, as a control that
        opens it when a caller passed `onOpenTicket` and as the pill
        otherwise — `onOpenTicket`'s own recorded rule.

        ⚠ **READING TAKEN, AND IT IS ONE ARM TO CHANGE:** the badge is the
        VISIBLE arm's; the root and restricted arms keep their sentences. If
        the owner meant the chip's own behaviour — nothing at root — that is
        this one arm.

        ## And the PROTOTYPE'S row is not what this is

        The chip's CSS comment cites `desktop.dc.html:1237`, the authority's
        subtasks header row, as its origin. **The owner is ruling the
        placement AWAY from the authority deliberately**, so that citation
        is not an argument against this and must not be quoted back as one.
        The divergence is recorded here the way the ticket-key spec recorded
        its own. What the authority DOES still own is the chip's CONTENT and
        its one-hop behaviour, both unchanged.

        ## The chip's own reasoning, carried up with it

        - **One hop, never a chain.** The chip names the IMMEDIATE parent, as
          the prototype's `openParent` does (`:3611`); the parent's own sheet
          draws its own indicator in turn, so a nesting or a cycle is walked
          sheet by sheet and no traversal lives here to loop.
        - **With no `onOpenTicket` it is a PILL and not a control** — that
          prop's own docblock: *"a control that cannot be honoured"* is not
          drawn.
        - **The restricted arm is a PILL, never a control, and it names the
          restriction rather than the ticket.** The controller ruled it on
          2026-09-20 after the alternative was priced: the read is a
          discriminated union whose restricted arm *structurally cannot*
          carry a title (`routes/tickets.ts:144-168`), the parent's title is
          read INSIDE the `canSee` branch the restricted arm never reaches
          (`routes/tickets.ts:353-372`, the code's own words at `:354-356`),
          and cases `7.212` and `6.14` pin the existence-versus-title
          contrast in both directions.
          ⚠ **THE REASON FIRST RECORDED WAS WRONG, and it is corrected rather
          than deleted:** it cited 6.66's *"no table stores a ticket
          title"*, which was true when 6.66 was written and is stale now —
          `proj_tickets` exists
          (`migrations/1787961800000_proj-tickets.sql`) and the visible arm
          serves `title: titleOf(parentState)` out of it. **The conclusion
          never rested on it.**
          And the prototype's own label fallback — `p ? p.title :
          sheet.parentId` (`:3609`) — would have put an ID where a name
          belongs and made the chip a control pointing at a ticket this
          viewer's own read 404s (case 6.14). The pill re-words a disclosure
          the sheet already makes; it does not widen one.
        - **It must not read as "no parent"** — a root is a different fact —
          which is why the restricted arm exists rather than being omitted.
      */}
      <div className="gn-ticket-sheet__parent" data-testid="sheet-parent-indicator">
        {parent === null ? (
          <span>At project root</span>
        ) : parent.kind === 'restricted' ? (
          <span className="gn-ticket-sheet__restricted" data-testid="sheet-parent-restricted">
            Restricted parent: it exists, but you can&apos;t see it
          </span>
        ) : openParentSheet === undefined ? (
          <span className="gn-chip gn-ticket-sheet__parent-chip" data-testid="sheet-parent-chip">
            {`Subtask of ${parent.title}`}
          </span>
        ) : (
          <button
            type="button"
            className="gn-chip gn-ticket-sheet__parent-chip"
            data-testid="sheet-parent-chip"
            onClick={() => openParentSheet(parent.id)}
          >
            {`Subtask of ${parent.title}`}
          </button>
        )}
      </div>

      {/* ONE SEGMENTED CONTROL, the way the authority draws them
          (`desktop.dc.html@6d7b67c0a52c:1134-1140`): a `var(--segBg)` track at
          `border-radius:9px`, 2px padding and 2px gap, the selected tab on
          `--segOnBg` + `--segOnShadow` at weight 600. This build drew two
          bordered buttons instead.

          The shared `SegmentedControl` IS that port — its own docblock says it
          replaced the bordered `.gn-view-tabs` buttons for exactly this reason —
          and it carries the `tablist` / `tab` / `aria-selected` roles this markup
          already had, so the accessible-name ratchet (13.285/13.287) sees no
          loss. **It also ADDS something: this `role="tablist"` had no name at
          all, and the component REQUIRES an `aria-label`.**

          ⚠ AND THE RATCHET CANNOT SEE IT, which an earlier version of this sentence got wrong by calling it "a ratchet RISE".
          Measured by an independent reviewer: NO suite renders the sheet — the accessible-name sweeps navigate `/p/:projectId` WITHOUT `?ticket=`, and the sheet mounts only when that parameter is present — so the number cannot move in EITHER direction today.
          The witness is the unit assertion (`toHaveAccessibleName('Ticket sections')`), and the rise would be exactly one `ariaLabel` the day something renders it.

          ⚠ The authority's THIRD tab WAS not drawn, and it is now. `Attachments`
          (`:3589`) is a READ behind that tab; it was left out while the question
          of drawing a third surface was open, and **the owner ruled it IN on
          2026-09-22** (spec decision 5 — *"add the Attachments tab"*). So the
          tab is BUILT rather than assumed, and `16.81`'s count moved 2 → 3 in
          the same change. */}
      <SegmentedControl
        options={[
          { value: 'details', label: 'Details' },
          { value: 'history', label: 'History' },
          { value: 'attachments', label: 'Attachments' },
        ]}
        value={tab}
        onChange={setTab}
        aria-label="Ticket sections"
      />

      {/*
        THE THREE ANSWER SLOTS, and they render HERE rather than inside the
        details tab — one site each, visible whichever tab is open.

        ⚠ THIS MOVED with the editable title, and the reason is not tidiness.
        The title control lives in the sheet HEADER (`titleSlot` above), which is
        outside both tabs, and its refusals go to `serverRefusal`. While these
        rendered inside `tab === 'details'`, a reader who committed a title from
        the History tab was shown nothing at all — the server had answered, and
        the answer was in the other tab's subtree. **An answer that is invisible
        depending on which tab happens to be open is the failure the three-slot
        split exists to prevent**, so the slots moved out rather than a second
        copy being drawn for the header.

        The gating on each is unchanged, including `!moveOpen` on the first two
        and the mutual exclusivity argued on `serverRefusal` below.
      */}
      {/*
        Close/Reopen's own refusal, shown OUTSIDE `TransitionDialog`.
        `serverRefusal` is the same state `submitTransition` fills, and
        `TransitionDialog` renders it too (`gn-refusal--server`, spec
        citation on that prop) — but `Dialog` returns `null` whenever
        `open` is false (`packages/ui/src/components/dialog.tsx:15`), so
        that copy is invisible while `moveOpen` is false, which is exactly
        when Close/Reopen fire. Gating this copy on `!moveOpen` keeps the
        two from ever both being on screen: the Move dialog's `onClose`
        already clears `serverRefusal` when it closes, and `submitTransition`
        never sets it while `moveOpen` is false (the dialog does not close
        itself on a refusal), so the two conditions are mutually exclusive
        rather than a duplicate render of the same fact.

        **The title's refusals land in this same slot, and that is deliberate:**
        the slot is "the server adjudicated this claim", which is what
        `checkTicketFieldSet` does to a blank or spaces-only title
        (`checks/fields.ts:118-123`). No second sentence and no second rule.
      */}
      {serverRefusal !== null && !moveOpen ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {`Refused by the server: ${serverRefusal.rule}: ${serverRefusal.reason}`}
        </p>
      ) : null}
      {/*
        Ruling 33 (fix round 2) — Close/Reopen's OWN transport slot,
        never the same sentence or class as `serverRefusal` above (Ruling
        27's own rule, repeated at the site that dropped it): a silence or
        a dropped connection is not an adjudication. Gated identically to
        `serverRefusal`'s copy, and for the identical reason — invisible
        while the Move dialog is open, since that is not where this state
        is set.
      */}
      {transportError !== null && !moveOpen ? (
        <p role="alert" className={writeFailureRefusalClass(transportError)}>
          {transportError}
        </p>
      ) : null}
      {/*
        The editor's own failures — a distinct fact with its own slot and
        its own tone, for the reason Ruling 27 gives the two above. Nothing
        here reached the server, so neither of those sentences is true of
        it. Its commonest cause today is a capability this build has not
        wired: a pasted image with no `uploadAttachment` is REFUSED rather
        than silently dropped, and this is where that refusal is read.
      */}
      {editorError !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--editor">
          {editorError}
        </p>
      ) : null}

      {tab === 'details' ? (
        <div className="gn-ticket-sheet__details">
          {phone ? null : descriptionSection}
          <dl className="gn-ticket-sheet__fields">
            <div className={fieldRowClass(0)} data-testid="field-state">
              <dt>State</dt>
              <dd>
                <div className="gn-ticket-sheet__state">
                  <Chip tone={state.stateCategory}>{currentStateName}</Chip>
                  <span className="gn-ticket-sheet__provenance">
                    {optimistic.overlaidFields.has('stateId') ? SAVING_CLAIM : formatStateProvenance(currentStateName, ticketRead.stateProvenance)}
                  </span>
                  {/* ⚠ THE `Closed by … on …` BADGE WAS HERE AND IS NOT ANY MORE. It
                      moved UP into the chips line (`sheet-chips`, above the tabs) on
                      2026-09-22, which is where the prototype draws it
                      (`desktop.dc.html:1130`). It was MOVED rather than copied: the
                      span that drew it here was deleted in the same change, so the
                      sentence is on the page exactly once and the case that reads it
                      (`16.110`) asserts that count. */}
                  {/*
                    Spec §5.3: Close only from a terminal, not-yet-closed state;
                    Reopen only once closed. The two buttons never both show, but
                    NOT because "closed implies terminal forever" — that claim is
                    false (final whole-branch review Finding 5, 2026-09-17: a
                    rebind or a republish fold can move a closed ticket's `stateId`
                    into a non-terminal state while `closed` rides along, since
                    `foldTicketToWorkflowVersion` spreads `...state` and neither
                    event touches `stateId`). What actually holds is smaller and
                    true today: Close's own condition
                    (`stateCategory === 'terminal' && closed === null`) and
                    Reopen's (`closed !== null`) are mutually exclusive on `closed`
                    alone, so exactly one — or neither, on a still-open,
                    non-terminal ticket — can ever be true at once. The closed ⇒
                    terminal invariant this comment used to (wrongly) lean on is
                    the RULE ENGINE's to hold, not this component's: fix wave B,
                    Ruling 53, adds it at the rebind check and the republish
                    validator.
                  */}
                  {state.stateCategory === 'terminal' && closed === null ? (
                    <Button onClick={() => void closeOrReopen('ticket.closed')} disabled={submitting}>
                      Close
                    </Button>
                  ) : null}
                  {closed !== null ? (
                    <Button onClick={() => void closeOrReopen('ticket.reopened')} disabled={submitting}>
                      Reopen
                    </Button>
                  ) : null}
                  {/*
                    Opening Move… clears any standing Close/Reopen refusal AND
                    transport error first (Ruling 33 adds the second clear): a
                    `close-requires-terminal` reason, or a "could not reach the
                    server" notice, left over from a prior Close/Reopen click would
                    otherwise carry into — or reappear behind — the Move dialog,
                    naming a fact that has nothing to do with the move being
                    attempted.
                  */}
                  <Button onClick={openMove} disabled={closed !== null}>
                    Move…
                  </Button>
                  {closed !== null ? (
                    <span className="gn-sheet__closed-note">Closed. Reopen it first</span>
                  ) : null}
                </div>
              </dd>
            </div>
            <div className={fieldRowClass(1)} data-testid="field-assignee">
              <dt>Assignee</dt>
              <dd>
                {assigneeRow.control}
                {/* The SAME `gn-ticket-sheet__claim` span every field row below
                    carries — an edited field that does not say who set it is the
                    one row on this sheet that cannot be trusted. */}
                <span className="gn-ticket-sheet__claim">{assigneeRow.claim}</span>
              </dd>
            </div>
            {/* Door G — PRIORITY, DUE, START and TYPE, drawn ALWAYS and in the
                prototype's own order (Assignee, Priority, Due, Type, Visibility
                — `desktop.dc.html:1183-1205`), with Start beside Due since the
                two are the same kind of fact (spec 2026-09-22). Every one that
                the prototype makes an editor is an editor here; Type is the one
                row that is read-only on both, argued in the derivations above. */}
            <div className={fieldRowClass(2)} data-testid="field-priority">
              <dt>Priority</dt>
              <dd>
                {/* The prototype's segmented control (`desktop.dc.html:1192-1198`)
                    on the SHARED `SegmentedControl`. Priority is a built-in that
                    is ALWAYS present (spec 2026-09-22), so there is no clear
                    affordance: clicking the selected segment does nothing,
                    because there is nothing to clear to.

                    `value` is the claim, or the empty string when this read
                    carries none — a value matching NO option, which is the
                    component's documented fallback (nothing selected, first tab
                    still focusable). It is NOT `DEFAULT_PRIORITY`: preselecting
                    P2 here would print a level with no claim line beside it,
                    which is the reader-side default the spec rejected. The
                    sentence below says why nothing is selected in that case. */}
                <SegmentedControl
                  options={PRIORITIES.map((level) => ({ value: level, label: level }))}
                  value={priorityValue ?? ('' as Priority)}
                  onChange={(next) => {
                    if (!prioritySaving && next !== priorityValue) void submitPriority(next);
                  }}
                  aria-label="Priority"
                  // Its own class rather than a descendant selector from the row:
                  // `.gn-ticket-sheet__field .gn-segmented { … }` would contain
                  // the bare `.gn-segmented` substring and, sitting above the
                  // real rule, would become the body `rule('.gn-segmented')`
                  // returns in `packages/ui/test/components.test.tsx` — measured,
                  // 2026-09-22. See `SegmentedControlProps.className`.
                  className="gn-ticket-sheet__priority"
                />
                {priorityClaim === undefined ? (
                  <span className="gn-ticket-sheet__refusal">
                    This ticket carries no priority claim. The server’s projection has not been
                    rebuilt since priority became built-in.
                  </span>
                ) : (
                  <span className="gn-ticket-sheet__claim">{optimistic.overlaidFields.has('priority') ? SAVING_CLAIM : `set by ${nameOf(priorityClaim.actorId)} on ${formatDate(priorityClaim.serverTime)}`}</span>
                )}
              </dd>
            </div>
            <div className={fieldRowClass(3)} data-testid="field-due">
              <dt>Due</dt>
              <dd>
                {/*
                  THE EDITOR (ruling E5-6, 2026-09-21), transcribed from the
                  export's own row (`desktop.dc.html:1200-1203`): an
                  `<input type="date">` followed by a note line. `value` is the
                  draft OR the claimed day, never a second piece of state — the
                  same `titleDraft` shape one row up — and it is the ISO day
                  (`2026-08-30`), never `formatDate`'s label, because that is
                  what a `type="date"` input holds and what the event carries.
                  `onBlur` commits, `Enter` commits, `Escape` abandons the
                  draft without closing the sheet; there is no Save button
                  because the export has none.

                  ⚠ **WHAT THIS REPLACED, AND WHY THE OLD ASSERTION MOVED.** The
                  row used to render `formatDate(due.date)` — *"30 Aug 2026"* —
                  as read-only text. Case 16.24 pinned that spelling as one of
                  its "both halves"; the export's row has no such span, so the
                  case was amended rather than left asserting a rendering this
                  door replaces. The CLAIM line below is unchanged and still
                  carries the attribution the old sentence carried.
                */}
                <input
                  className="gn-field__input gn-ticket-sheet__due-input"
                  type="date"
                  aria-label="Due date"
                  value={dueDraft ?? dueDate?.date ?? ''}
                  disabled={dueSaving}
                  onChange={(event) => setDueDraft(event.target.value)}
                  onBlur={() => {
                    if (dueDraft !== null) void submitDueDate(dueDraft);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      if (dueDraft !== null) void submitDueDate(dueDraft);
                      return;
                    }
                    if (event.key === 'Escape') {
                      // `preventDefault` is LOAD-BEARING here for the reason
                      // the title field's own Escape branch records: `Sheet`
                      // registers a DOCUMENT-level Escape that closes it, so an
                      // unconsumed Escape would close the sheet and make
                      // "abandon the draft" true of an input being unmounted.
                      event.preventDefault();
                      setDueDraft(null);
                    }
                  }}
                />
                {/* The prototype's own sentence for this absence
                    (`desktop.dc.html:1203`, via `sheetDueNote`'s
                    `: "No date claimed"` arm), transcribed rather than
                    re-worded: an unclaimed date is not an empty one. It is the
                    NOTE LINE the export puts under the same input. */}
                {dueDate === null ? (
                  <span className="gn-ticket-sheet__absent">No date claimed</span>
                ) : (
                  /* The SAME wording every other field row on this sheet uses
                     (`set by … on …`), because one surface with two
                     provenance phrasings is the drift this file's claim-line
                     comment exists to prevent. The ABSENT copy stays the
                     prototype's ("No date claimed") — that sentence is about
                     the DATE, and the claim line is about the ACTOR. */
                  <span className="gn-ticket-sheet__claim">{optimistic.overlaidFields.has('dueDate') ? SAVING_CLAIM : `set by ${nameOf(dueDate.actorId)} on ${formatDate(dueDate.serverTime)}`}</span>
                )}
              </dd>
            </div>
            {/* START — a built-in that has been on every ticket since Plan 3 and
                that this sheet never drew (spec 2026-09-22). It sits between Due
                and Type, and it is Due's TWIN in every respect the spec names:
                the same `<input type="date">`, the same commit on blur and on
                Enter, the same Escape that abandons the draft without closing
                the sheet, the same `null`-for-empty payload, and the same
                absent copy — `No date claimed`, which is the PROTOTYPE's own
                sentence for either date and not a second wording invented for
                this row. `submitStartDate` says why the two are copies rather
                than one shared hook. */}
            <div className={fieldRowClass(4)} data-testid="field-start">
              <dt>Start</dt>
              <dd>
                <input
                  className="gn-field__input gn-ticket-sheet__start-input"
                  type="date"
                  aria-label="Start date"
                  value={startDraft ?? startDate?.date ?? ''}
                  disabled={startSaving}
                  onChange={(event) => setStartDraft(event.target.value)}
                  onBlur={() => {
                    if (startDraft !== null) void submitStartDate(startDraft);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      if (startDraft !== null) void submitStartDate(startDraft);
                      return;
                    }
                    if (event.key === 'Escape') {
                      // Load-bearing for the reason the Due row's own branch
                      // records: `Sheet` registers a DOCUMENT-level Escape, so
                      // an unconsumed one would close the sheet and make
                      // "abandon the draft" true of an input being unmounted.
                      event.preventDefault();
                      setStartDraft(null);
                    }
                  }}
                />
                {startDate === null ? (
                  <span className="gn-ticket-sheet__absent">No date claimed</span>
                ) : (
                  <span className="gn-ticket-sheet__claim">{optimistic.overlaidFields.has('startDate') ? SAVING_CLAIM : `set by ${nameOf(startDate.actorId)} on ${formatDate(startDate.serverTime)}`}</span>
                )}
              </dd>
            </div>
            <div className={fieldRowClass(5)} data-testid="field-type">
              <dt>Type</dt>
              <dd>
                {/* The NAME from the workspace ladder, or the id when the
                    ladder does not hold it — never an invented label. No claim
                    line: a type is not a claim, it is fixed at creation. */}
                <span>{ticketTypeName}</span>
              </dd>
            </div>
            {/*
              THE DESCRIPTION IS A ROW WHETHER OR NOT ANYBODY HAS EVER CLAIMED
              ONE — and that is the half the dispatch did not name, found by
              measuring the reducer rather than the sheet.

              `ticket.created` writes `fields: { title: claim(p.title, env) }`
              and NOTHING else (`packages/domain/src/ticket-state.ts:160`), and
              no other path writes a description except an explicit
              `ticket.field_set` (`create-ticket-flow.tsx:209` submits
              `ticket.created` alone). So on a ticket nobody has described there
              is no `description` key at all — and this row used to live INSIDE
              the `Object.entries(state.fields)` loop below. The editor it mounts
              had nowhere to mount, and the owner saw no description and no way
              to add one. **Flipping `readOnly` alone would have changed almost
              nothing**: it would have enabled editing for the few tickets that
              already carry a claim, which is precisely the shape of a fix that
              passes its own test and does not do the thing.

              Lifted out on the ASSIGNEE row's precedent, eleven lines up: a row
              the sheet draws unconditionally, whose claim line states what is
              actually known. The loop below now skips `description`, so the row
              is drawn once.
            */}
            <div className={fieldRowClass(6)} data-testid="field-visibility">
              <dt>Visibility</dt>
              <dd>
                {/*
                  Spec §6's audience section. **⚠ CORRECTED 2026-09-20.** This read: "It
                  is mounted here and it is DARK against the shipped server: this
                  component returns its refusal branch above whenever `getTicket`
                  rejects, and `getTicket` refuses today (`mapTicketRead`, one of the six
                  serving gaps). So nobody reaches this line in production until that
                  read is served — which is why the editor's own behaviour is proven in
                  `test/views/visibility-editor.test.tsx`, driving the component
                  directly, rather than through a fabricated successful read here."
                  Ruling P25 clause 1 (`c86c4b5c`, 2026-09-06) served that read, so a
                  person DOES reach this line and the section is not dark. Whether this
                  mount should now be proven HERE rather than only in the editor's own
                  suite is a test-design decision this correction does not take: *owner,
                  whoever next touches either file.*
                */}
                <VisibilityEditor
                  dataSource={dataSource}
                  workspaceId={workspaceId}
                  ticketId={ticketId}
                  currentUserId={currentUserId}
                  members={members.data ?? []}
                  names={actorNames}
                  current={standingVisibility}
                  canEdit={canSetVisibility}
                  onChanged={() => {
                    read.reload();
                    history.reload();
                  }}
                />
              </dd>
            </div>
            {Object.entries(state.fields)
              /*
                ⚠ THE EXCLUSIONS ARE A FILTER, AND THEY USED TO BE AN EARLY
                `return null` INSIDE THE `map` — which was a real defect and not a
                tidy-up. `Array.prototype.map` passes the index of the ORIGINAL
                array, so an excluded entry still consumed a position: with
                `fields` of `{title, counterparty}` the loop's first RENDERED row
                carried `rowIndex === 1`, not 0, and `fieldRowClass(FIXED_FIELD_ROWS
                + rowIndex)` therefore returned an EVEN index's class — an untinted
                row where the alternation requires a tinted one.

                **And `title` is the field EVERY ticket has**, so this was not an
                edge case: any ticket carrying a custom field drew its first
                custom row on the wrong side of the alternation, and every
                subsequent one shifted with it. Measured on a live fixture: the
                grid read `… type=tinted, visibility=plain, counterparty=plain`,
                two plain rows in a row at the seam.

                ⚠ **160 GREEN CASES COULD NOT SEE IT**, because the only tint case
                rendered the default fixture whose two fields are both excluded —
                so the loop drew nothing and this expression never ran. Case
                `16.129` was written for the seam and caught it on its first run;
                the mutation that had looked harmless (`FIXED_FIELD_ROWS = 6`)
                was actually compensating for this bug one index over, which is
                why the property needed a case with a loop row in it rather than
                a different constant.

                Drawn above, unconditionally. A second pass here would mount a
                SECOND editor over one claim and make `field-description`
                ambiguous to `getByTestId` — two controls for one field.

                `dueDate`, `startDate` and `priority` join it for door G, and the
                reason is the same one rung less severe: all three are drawn as
                their OWN rows above, so a second pass would render **two rows for
                one claim**. Without this the sheet shows a `field-dueDate` beside
                the `field-due` this task adds, which is exactly the ambiguity the
                description line exists to prevent — and it would be INVISIBLE on
                any fixture whose ticket carries no such field. `startDate` is the
                third (spec 2026-09-22) and the newest: the rows above are
                `field-due`, `field-start` and `field-priority`.
              */
              .filter(([fieldId]) => !OWN_ROW_FIELD_IDS.has(fieldId))
              .map(([fieldId, fieldClaim], rowIndex) => (
                <div
                  key={fieldId}
                  className={fieldRowClass(FIXED_FIELD_ROWS + rowIndex)}
                  data-testid={`field-${fieldId}`}
                >
                  <dt>{fieldId}</dt>
                  <dd>
                    <span>{renderFieldValue(fieldClaim.value)}</span>
                    <span className="gn-ticket-sheet__claim">
                      {`set by ${nameOf(fieldClaim.actorId)} on ${formatDate(fieldClaim.serverTime)}`}
                    </span>
                  </dd>
                </div>
              ))}
          </dl>
          {phone ? descriptionSection : null}

          {ticketRead.rollup !== null ? (
            <p className="gn-ticket-sheet__progress">{formatRollup(ticketRead.rollup)}</p>
          ) : null}

          {/* Door F, 2026-09-19 — THE SUBTASKS SECTION. The prototype draws it
              as its own block between the progress line and the fields
              (`desktop.dc.html:1238-1265`): a heading carrying the count, the
              children, an empty state that names what a subtask IS, and the add
              row. Ours drew only the count, which is why this section exists.

              ⚠ The prototype's SECOND direction — the `Subtask of {parent}`
              chip (`:1240`) — was deliberately NOT built with this section, so
              that adding it later would be a DECISION rather than a drift. That
              decision came on 2026-09-20 (owner ruling, via the controller) and
              the chip is below; case 16.22 asserted its absence and now asserts
              what it does instead, updated rather than deleted. */}
          <section className="gn-ticket-sheet__subtasks" data-testid="sheet-subtasks">
            {/* ⚠ THE CHIP WAS HERE UNTIL 2026-09-20 AND IS NOT ANY MORE. It is
                a `<p>` alone now because the owner ruled the chip UP into the
                parent indicator above (*"there is already a
                `gn-ticket-sheet__parent` section above. put the badge in that
                position instead"*) — one element, three facts, in the position
                a person looks for the hierarchy.

                **The reasoning that governed the chip did not die with its
                position**, and it is kept rather than dropped: the three arms,
                the restricted pill and why it must not read as "no parent", the
                one-hop rule, and the `7.212`/`6.14` contrast all now live in the
                indicator's own docblock above, at the site that renders them.
                What is recorded HERE is the one fact that belongs to this
                heading: **the row now seats ONE child.** The prototype's flex
                row (`align-items:baseline;gap:10px;flex-wrap:wrap`,
                `:1237-1241`) existed to seat a chip BESIDE this heading, and
                the rule at `.gn-ticket-sheet__subtasks-head` is left in place
                rather than deleted: the element still renders, so the rule is
                not orphaned, it simply has nothing left to space apart. `gap`
                on a single child is inert, not wrong, and removing it here
                would be a layout change this change cannot witness.

                ⚠ And the prototype's `:1237` citation is NOT an argument that
                the chip belongs here: the owner ruled the placement away from
                the authority deliberately, which the indicator's docblock
                records. */}
            <div className="gn-ticket-sheet__subtasks-head">
              {/* ⚠ TWO CLASSES, AND THE SECOND IS THE SHEET'S SHARED CAPTION (spec
                  decision 11): the prototype draws `SUBTASKS · …` and `Comments · N`
                  in the SAME eyebrow style (`desktop.dc.html:1236`, `:1250`), so
                  `.gn-ticket-sheet__caption` is the name for that style and
                  `.gn-ticket-sheet__subtasks-heading` stays this block's own hook.
                  The words are NOT retyped into caps — `text-transform` is paint,
                  and `16.123` asserts exactly that, so a later edit that wrote
                  `SUBTASKS` into the source reddens there instead of quietly
                  breaking every `getByText` on this heading. */}
              <p className="gn-ticket-sheet__subtasks-heading gn-ticket-sheet__caption">
                Subtasks
                {ticketRead.rollup === null ? '' : ` (${formatRollup(ticketRead.rollup)})`}
              </p>
            </div>
            {/*
              Nothing at all while the child read is in flight — not the alert,
              and not the empty sentence either. Both are claims about a list
              nobody has read yet; the alert is the louder one and the one V8
              measured, and the empty arm was the same false claim one notch
              quieter. What renders is decided by the ANSWER, never by `null`.
            */}
            {subtasksUnread ? null : subtasksIncomplete ? (
              // THE RECONCILIATION, rendered rather than swallowed. A short list
              // here is the one failure this section could hide, so it is said
              // in the server's own numbers instead of drawn.
              <p
                className="gn-ticket-sheet__refusal"
                role="alert"
                data-testid="sheet-subtasks-incomplete"
              >
                {`The server counts ${subtaskExpected} subtask${subtaskExpected === 1 ? '' : 's'} you can see, and ${subtaskRows.length} could be read, so this list is not shown rather than shown short.`}
              </p>
            ) : subtaskRows.length === 0 ? (
              <p className="gn-ticket-sheet__subtasks-empty" data-testid="sheet-subtasks-empty">
                No subtasks. A subtask is a ticket of its own: it gets a state, an assignee, a date
                and a history.
              </p>
            ) : (
              <ul className="gn-ticket-sheet__subtasks-list">
                {subtaskRows.map((row) => (
                  <li
                    key={row.ticketId}
                    data-testid={`subtask-${row.ticketId}`}
                    className="gn-ticket-sheet__subtask-card"
                  >
                    {/* THE TITLE IS THE CARD'S OWN LINE, and the meta row sits
                        beneath it as a BLOCK rather than as a run of inline spans
                        — which is the 2026-09-20 defect's own shape changed on
                        purpose. The row used to be three adjacent inline spans
                        with a text `, ` between them, because two adjacent spans
                        are ONE RUN OF GLYPHS: the row rendered
                        `Order the brochuresTo do` on screen AND in the accessible
                        name. **A card separates the title from the meta row by
                        BLOCK, so no separator text is needed there** — assistive
                        tech pauses at the element boundary, and jsdom cannot see
                        layout either way. */}
                    <span className="gn-ticket-sheet__subtask-title">{row.title}</span>
                    <span className="gn-ticket-sheet__subtask-meta">
                      {/* The child's OWN state, spelled from the served row — the
                          empty state's sentence claims a subtask gets a state, so
                          the list has to show one or the claim is decoration.
                          Drawn as a CHIP (prototype `:1241`), and the chip is the
                          same component the sheet's header line uses. */}
                      <Chip tone={row.stateCategory}>{row.stateName}</Chip>
                      {/*
                        ⚠ THE SEPARATOR IS STILL TEXT, AND IT IS STILL LOAD-BEARING
                        — this is the SAME property the 2026-09-20 defect was
                        about, one element to the right. The chip and this detail
                        line are two flex items on ONE line with a CSS `gap`
                        between them, and a gap is not a glyph: without the
                        leading `, ` inside this string the meta row reads
                        `To dotask`, on screen and in the accessible name alike,
                        and jsdom has no layout engine to tell the two treatments
                        apart. So the separator lives INSIDE the detail string and
                        the case reads `textContent`, which is the one surface
                        both a person and a unit case can see.

                        The type is the CHILD's, read off the served row; the due
                        day goes through the ONE date renderer, never an ISO
                        slice. An absent date draws the type alone — no dangling
                        separator, which `16.124`'s control asserts.
                      */}
                      <span className="gn-ticket-sheet__subtask-detail">
                        {row.dueDate === null
                          ? `, ${row.typeId}`
                          : `, ${row.typeId}, Due ${formatDate(row.dueDate.date)}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {/* THE FORM IS OFFERED ON ONE ANSWER, and the alternative is a
                SENTENCE rather than a disabled control (`16.91`, `16.93`). A
                disabled control still asserts that the action exists, and this
                one could not be performed; `Features.md:88`'s rule for the
                New-ticket control is the precedent this follows.

                There is a THIRD arm — `subtaskWithheld === null` with no
                `subtaskType` — which draws NOTHING. It is the ladder's unread
                state, and it is the one that must not be collapsed into the
                sentence above it: "nothing is deeper" is a claim about the
                workspace and this client has not read the workspace yet. */}
            {subtaskType === null ? (
              subtaskWithheld === null ? null : (
                <p
                  className="gn-ticket-sheet__subtask-withheld"
                  role="status"
                  data-testid="sheet-subtask-withheld"
                >
                  {subtaskWithheld}
                </p>
              )
            ) : (
              <form
                className="gn-ticket-sheet__subtask-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addSubtask();
                }}
              >
                {/*
                  E5-22 — WHAT the button will file. The child's type is chosen
                  by `subtaskTypeFor` and was in hand and unsaid: rule 1 takes the
                  built-in `task` whenever it is legal, so under an Epic (rank 1)
                  the child is a Task and the Story rank between them is SKIPPED —
                  and nothing on screen named it. `subtaskType.name` was read
                  nowhere in the render before this line.

                  ⚠ IT STAYS THE ROW'S NOTE, and the row is now ONE line (spec
                  decision 10, `desktop.dc.html:1258-1261`): input and button side
                  by side, with this sentence above them both. `flex-wrap` on the
                  rule means it shares their line when the sheet is wide and takes
                  its own when it is not, which is the prototype's own behaviour
                  rather than a second layout.
                */}
                <p className="gn-ticket-sheet__subtask-target" data-testid="sheet-subtask-target">
                  {`Adds a ${subtaskType.name}.`}
                </p>
                {/*
                  ⚠ THE VISIBLE `<label>` IS GONE, AND ITS WORDS ARE STILL HERE —
                  twice, in the input's `placeholder` and its `aria-label`. The
                  label was the only visible text on the row besides the button,
                  and an inline row has no room for it; but a placeholder alone is
                  NOT an accessible name (it vanishes the moment anything is typed
                  and several assistive technologies ignore it), so the `aria-label`
                  carries the words the label used to. **Every pre-existing
                  add-subtask case queries `getByLabelText('New subtask title')`
                  and keeps resolving through it** — which is the half of this
                  change that could have silently broken a dozen cases, and the
                  reason the two are asserted to agree in `16.125`.
                */}
                <input
                  id="gn-new-subtask-title"
                  className="gn-field__input gn-ticket-sheet__subtask-input"
                  data-testid="sheet-subtask-title"
                  placeholder="New subtask title"
                  aria-label="New subtask title"
                  value={newSubtaskTitle}
                  onChange={(event) => setNewSubtaskTitle(event.target.value)}
                  disabled={addingSubtask}
                />
                <Button data-testid="sheet-subtask-add" type="submit" disabled={addingSubtask}>
                  {addingSubtask ? 'Adding…' : 'Add subtask'}
                </Button>
              </form>
            )}
            {subtaskRefusal === null ? null : (
              <p className="gn-ticket-sheet__refusal" role="alert" data-testid="sheet-subtask-refusal">
                {subtaskRefusal}
              </p>
            )}
          </section>

          {/*
            THE NOTES SECTION — Subtasks → Notes → Comments, the prototype's
            own order (spec §10.1). `canEdit` is `editorSlot !== undefined`,
            the same expression `canEditDescription` below uses for the same
            reason: no client-side edit flag exists, and the ingest door is
            the one place that actually knows.
          */}
          <TicketNotesSection
            dataSource={dataSource}
            workspaceId={workspaceId}
            ticketId={ticketId}
            projectId={ticketRead.ticket.projectId}
            currentUserId={currentUserId}
            canEdit={editorSlot !== undefined}
            make={make}
            onNavigate={onNavigate}
            onRefusal={(r) => setServerRefusal(r)}
            notes={notes}
          />

          {/*
            THE COMMENT THREAD AND ITS BOX — the block at
            `design-system/interactive/desktop.dc.html:1268-1330`, mounted LAST
            in the details tab, which is where the prototype draws it (its
            details arm ends at the composer, `:1336`).

            ⚠ NO COMPOSER WITHOUT A REAL EDITOR, and that is a refusal rather
            than an omission. `EditorSlot` resolves to `PlainTextEditorSlot`
            when the app mounts none, and that component renders a document and
            offers NO control — over a comment draft there is no document to
            render, so the fallback would draw the placeholder as static text
            under a thread: a composer-shaped thing that cannot compose. The
            description row can tolerate that (it renders a real document); this
            one cannot. So the box appears exactly when something can write to
            it, and a build with no editor shows the thread and no box — the
            absence named by the shape of the screen rather than by a lie.

            ⚠ **AND THE BOX STAYS WHEN THE THREAD READ FAILED — a deliberate
            choice, raised by an independent reviewer and stated here rather than
            left to look accidental.** The two are different questions: the read
            asks *what has been said*, the composer asks *can I say something*,
            and a failed read does not answer the second. A comment is a WRITE
            through `POST /v1/events`, a door that does not consult this read at
            all — so hiding the box would withhold a working affordance because
            an unrelated one is broken. If the write is refused, the refusal
            lands in the sheet's own refusal slot, in the server's words.

            **What that costs, named:** on a 404 — an invisible or deleted
            ticket — the box is offered and the post will be refused. The
            alternative was measured and rejected the other way: gating the box
            on `comments.error` would hide a working control every time a
            transient read failed, which is the more common case and the more
            expensive mistake.
          */}
          <CommentsThread
            // V4 — `comments.data` VERBATIM, never `?? []`. The collapse was
            // here, at the boundary, and it is what turned a read still in
            // flight into "Comments · 0" and "No comments yet." — a claim about
            // the ticket made before anyone had asked it. `CommentsThread` now
            // takes `null` and has an arm for it; the History tab three arms up
            // has always done it this way, with `result.data === null` drawn as
            // its own state rather than as an empty ledger.
            comments={comments.data}
            commentsUnavailable={comments.error ?? undefined}
            nameOf={nameOf}
            {...(resolveTicketHref === undefined ? {} : { ticketHref: resolveTicketHref })}
            isPurged={purgedComments.isPurged}
            {...(commentActions === undefined ? {} : { actions: commentActions })}
            composer={
              editorSlot === undefined ? undefined : (
                <EditorSlot
                  mode="comment"
                  // A comment is written, not edited: there is no stored draft
                  // to open with, and `null` is `TicketEditorSlot`'s empty
                  // composer.
                  doc={null}
                  readOnly={false}
                  workspaceId={workspaceId}
                  ticketId={ticketId}
                  placeholder="Add a comment, or type @ to mention someone"
                  submit={submitComment}
                  {...commentEditorCapabilities}
                  /*
                    THE POSTING SENTENCE, IN THE FOOTER ROW (spec decision 8; the
                    prototype's `cmtHint` slot at `desktop.dc.html:1329`). It is
                    handed over rather than drawn by `CommentsThread`, which used
                    to render its own copy as a line under the composer and whose
                    own paragraph recorded the move as OWED — the move needed a
                    one-line change HERE, in the file that lane was barred from
                    touching, so the two landed in one change.

                    ⚠ IT IS PASSED AS DATA AND NOT AS A CHILD OR A `cloneElement`.
                    The alternative considered and refused was having
                    `CommentsThread` clone the composer element it is given and
                    inject the sentence: that works, and it creates a SILENT
                    DOUBLE SOURCE — a later caller passing its own `footerNote`
                    here would be overwritten by the thread's copy, and nothing
                    would fail. One field, one direction, and the composer's own
                    contract (`EditorSlotProps.footerNote`) is the only place the
                    words live.
                  */
                  footerNote="Posting records an event citing you."
                />
              )
            }
          />
          {/*
            Refusals from notes a posted comment TRIED to attach (spec §14.3,
            D27–D28) — the comment itself always stands; this only reports what
            could not follow it. `tone="danger"` rather than the plan's own
            "error", because `ToastTone` (`packages/ui`) names no such tone —
            the nearest real one, and `undo` stays absent: an attach retry is
            not an undo of anything.
          */}
          <Toast
            open={attachRefusals.length > 0}
            message={attachRefusals.join(' ')}
            tone="danger"
            onDismiss={() => setAttachRefusals([])}
          />
        </div>
      ) : tab === 'attachments' ? (
        <div className="gn-ticket-sheet__attachments">
          {attachmentsUnavailable === undefined ? (
            <>
              <AttachmentList entries={attachments ?? []} />
              {/*
                Unit 5(b) — the prototype's own footer control inside this
                same "answered" arm (`desktop.dc.html:1363-1366`: the list
                rows, the empty state, THEN this button, in that order) —
                never drawn over a FAILED read, the same "not a dead button"
                rule the composer's own Attach button follows: there is no
                known list here to add a file to honestly.
              */}
              {uploadAttachment === undefined ? null : (
                <>
                  <button
                    type="button"
                    className="gn-ticket-sheet__attach-file"
                    disabled={attachingTab}
                    onClick={() => attachTabInputRef.current?.click()}
                  >
                    {attachingTab ? 'Attaching…' : 'Attach a file'}
                  </button>
                  <input
                    ref={attachTabInputRef}
                    type="file"
                    className="gn-ticket-sheet__attach-file-input"
                    accept={ATTACHMENT_ACCEPT}
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleAttachmentTabUpload(file);
                      event.target.value = '';
                    }}
                  />
                </>
              )}
              {attachTabRefusal === null ? null : (
                <p role="alert" className="gn-ticket-sheet__refusal" data-testid="sheet-attach-tab-refusal">
                  {attachTabRefusal}
                </p>
              )}
            </>
          ) : (
            /*
              The three-way distinction this sheet draws for the ledger tab,
              applied to the files: an ANSWER (drawn above, empty or not), a WAIT
              (nothing yet — `AttachmentList`'s own silence), and a FAILURE, which
              is this sentence. It is deliberately not a `Loading…` line: a read
              that failed under the word "Loading…" is a wait that will never end,
              wearing the clothes of one that will. **(The ticket read draws a
              FOURTH arm the files do not need — an answered `null` — since E4-23;
              `attachments` has no 404 affordance to answer with, so there is no
              third null here.)**
            */
            <p
              // `alert`, matching this sheet's five other failure sentences
              // (`:1542`, `:1556`, `:1569`, `:1749`, `:1815`). The CSS twin it
              // borrows its rule from carries NO role at all, and copying that
              // omission would have been the quieter choice — but a read that
              // failed is exactly what a reader must be told about.
              role="alert"
              className="gn-ticket-sheet__attachments-error"
              data-testid="sheet-attachments-unavailable"
            >
              {`This ticket's attachments could not be read: ${attachmentsUnavailable}. That is a failure of this read, not a statement about the ticket: it may answer on a retry.`}
            </p>
          )}
        </div>
      ) : (
        <HistoryTab
          result={history}
          nameOf={nameOf}
          // E4-19 / E5-8 — the two resolvers `describeEvent` needs so a history
          // line can name a state and a ticket type rather than printing the raw
          // id the ledger carries. Both fall back to the id, the same `?? id`
          // idiom `workflow-builder/summaries.ts:20` uses, so a state this
          // ticket's workflow no longer declares — or a ladder that failed to
          // read, leaving `ticketTypes.data` null — still names something.
          stateName={(stateId) =>
            workflow.data?.states.find((candidate) => candidate.id === stateId)?.name ?? stateId
          }
          typeName={(typeId) => ticketTypes.data?.find((def) => def.id === typeId)?.name ?? typeId}
        />
      )}

      {/* The prototype's footer (`desktop.dc.html:1371-1373`), and it is now the
          COMPLETE footer rather than half of one: `Delete` is built and the
          navigation is gone.

          ## ⛔ THE NAVIGATION IS REMOVED BY RULING, NOT MISSING
          The owner ruled it out on 2026-09-20 — *"remove the navigation"*. It had
          never rendered anywhere: `TicketSheetProps.navigation` had zero call
          sites repo-wide, so this footer drew `null` on every mount in the
          product. **The prototype still draws `‹ Previous / Next ›`; the product
          does not, and that is the decision rather than a gap or a TODO.** The
          prop, its two neighbour ids, its `onNavigate`, the `setTab('details')`
          reset each step performed, the `.gn-ticket-sheet__nav` rules and case
          `16.43`'s five tests all went with it — a control that cannot be
          honoured is not carried "in case".

          ## Why the row is drawn UNCONDITIONALLY now
          It used to be `navigation !== undefined ? … : null`, on `onOpenTicket`'s
          precedent that a caller who cannot say what its list is gets no control
          that guesses. **That precedent does not reach `Delete`**: deleting does
          not need to know anything the sheet lacks — it names the ticket this
          sheet is already open on. So the footer draws on every mount, and
          `onDeleted` (the host's half) is optional and NOT load-bearing: the
          close happens here, and a host that narrates nothing still gets a closed
          sheet. See `onDeleteCommitted`'s docblock.

          The strip's fill and its full-bleed inset remain the recorded departure
          `ui.css` carries beside `.gn-ticket-sheet__footer` — the reason is a
          `Sheet` API change, measured there rather than asserted here. */}
      <footer className="gn-ticket-sheet__footer">
        <button
          type="button"
          className="gn-ticket-sheet__delete"
          disabled={submitting}
          onClick={() => setConfirmingDelete(true)}
        >
          Delete
        </button>
      </footer>

      {/*
        RULING E2-35, NOW THE SHARED CONFIRMATION (trash Plan 4, spec §6.1). The
        sheet's own `Dialog` became `DeleteDialog` — the component every delete
        door opens — so its title is `Delete ticket “<title>”?`, its note names
        Deleted items (the durable way back), its refusal answers inside it
        (§7), and its **Delete permanently** switch marks the ticket too. The
        confirm's accessible name is still `Delete ticket` (D8), so the footer's
        `Delete` stays the only button of that name. It unmounts on commit via
        `onDeleteCommitted`, and on Cancel/Escape via `setConfirmingDelete`.
      */}
      {subtaskReopen !== null ? (
        <ReopenDialog
          open
          parentTitle={ticketRead.title}
          parentStateName={subtaskReopen.parentStateName}
          refusal={subtaskReopen.refusal}
          refusalOrigin="server"
          reopenStates={subtaskReopen.reopenStates}
          parentRefusal={subtaskParentRefusal}
          onAccept={(toStateId) => {
            void acceptSubtaskReopen(toStateId);
          }}
          onCancel={() => {
            setSubtaskReopen(null);
            setSubtaskParentRefusal(null);
          }}
        />
      ) : null}
      <DeleteDialog
        open={confirmingDelete}
        kind="ticket"
        name={ticketRead.title}
        workspaceId={workspaceId}
        entityId={ticketId}
        dataSource={dataSource}
        make={make}
        onCancel={() => setConfirmingDelete(false)}
        onDeleted={onDeleteCommitted}
      />

      {workflow.data != null ? (
        <TransitionDialog
          /*
            ⚠ THE KEY IS LOAD-BEARING (E2-32, 2026-09-21). A committed move
            remounts this dialog, which is what discards the finished move's
            `comment` and `fieldValues`; the dialog cannot do it itself, because
            its only close-time effect must also preserve them for a Cancel.
            Cancel does not change the key, so nothing typed is lost to one.
          */
          key={movesCommitted}
          open={moveOpen}
          workflow={workflow.data}
          fromStateId={state.stateId}
          ticketFields={state.fields}
          onClose={() => {
            setMoveOpen(false);
            setServerRefusal(null);
            setTransportError(null);
          }}
          onSubmit={(submission) => void submitTransition(submission)}
          precheck={precheck}
          serverRefusal={serverRefusal}
          // E2-29 — this slot now carries the sheet's own `transportError`,
          // the same value the paragraph above renders when the dialog is
          // closed. It was the literal `null` while `submitTransition` was
          // unguarded (it awaited `ingest` with no `catch`), and the slot is
          // therefore the one that had to change when that `catch` landed: the
          // dialog is the surface in view during a Move, so it — not the
          // paragraph it is covering — is the one that speaks. Same sentence,
          // same class, same Ruling 27 split: a dropped connection is not an
          // adjudication and never wears the refusal's words.
          transportError={transportError}
          // E5-27 — the sheet's own latch, the one `submitTicketEvent` already
          // wears for Close/Reopen/Delete and `submitTransition` now wears too.
          // The dialog disables Move while it is true, so "still sending",
          // "already failed" and "already succeeded" stop looking identical to
          // the person deciding whether to press again.
          submitting={submitting}
          uploadEvidence={uploadEvidence}
        />
      ) : null}
    </Sheet>
  );
}

/**
 * The History tab, and the three-way distinction the sheet body already makes
 * one branch up.
 *
 * ## The defect this closes
 *
 * `useLiveQuery` leaves `data` at `null` BOTH while the load is in flight and
 * after it rejects (`use-live-query.ts:41`, `:66-69` — the rejection handler
 * sets `error` and never touches `data`, and the key-change effect at `:77`
 * cleared it to null before asking). The previous line here was
 * `events={history.data ?? []}`, which collapsed all three of those into one
 * rendering: an empty `<ol>` with no loading and no error indicator. For a
 * ledger-backed product that is the strongest possible false statement about a
 * ticket — the History tab IS the ledger (spec §3), so "nothing here" reads as
 * "nothing was ever claimed about this ticket".
 *
 * ## Branch ORDER is the fix, not just the branch count
 *
 * `error` is tested BEFORE `data === null`, because on a rejection both hold.
 * Reversed, an error renders "Loading…" — the same defect this closes, moved.
 *
 * The consequence of error-first is worth naming: `LiveQueryResult` carries no
 * staleness flag, so a reload that FAILS after a successful load leaves the old
 * rows in `data` with `error` set, and this branch hides them behind the failure
 * line. That is recorded as F6 against `use-live-query.ts:53-58` and owned
 * there; the trade is taken deliberately — rows the client cannot vouch for
 * being current are worse under a ledger heading than a named failure.
 *
 * ## The error branch is an ERROR, and says so
 *
 * **This section used to draw an ASYMMETRY between the two reads, and it has
 * expired.** It said `getTicket` REFUSES against the shipped server *"for
 * good"*, making that branch a permanent refusal with nothing to retry. **Both
 * reads answer now** — **ruling P25 deleted `getTicket`'s absence from
 * `SERVING_GAPS`, and the register has since gone EMPTY** (`search` was its last
 * key, served 2026-09-19; this read "which carries one key, `search`", corrected
 * 2026-09-20) — so a rejection here is the
 * ordinary failure of one read and MAY succeed on a retry. **⚠ The distinct
 * word and class were chosen to state a difference in KIND that no longer
 * exists: they may still be right, but that is a different reason and nobody
 * has ruled it. Owner: the controller.**
 *
 * ## What the empty branch is allowed to say
 *
 * It says the READ came back with no entries — not that the ticket has no
 * history. The distinction is not pedantry: `online-data-source.ts:151-158`
 * answers `[]` on a 404, and a 404 there means "no such ticket, or not yours"
 * (the frozen `NOT_FOUND_BODY` both routes share). That `[]`-on-404 is
 * plan-sanctioned and stays; what must not follow it is a surface turning it
 * into an assertion about the ticket. A live ticket always carries at least its
 * own `ticket.created`, so a genuinely empty page in production means a 404 or
 * an `afterSeq` past the end — never "this ticket has no history".
 */
function HistoryTab({
  result,
  nameOf,
  stateName,
  typeName,
}: {
  result: LiveQueryResult<TicketHistoryEvent[]>;
  nameOf: (userId: string) => string;
  stateName?: (stateId: string) => string;
  typeName?: (typeId: string) => string;
}) {
  if (result.error !== null) {
    return (
      <p className="gn-ticket-sheet__history-error">
        {`This ticket's history could not be read: ${result.error}. That is a failure of this read, not a statement about the ticket: it may answer on a retry.`}
      </p>
    );
  }
  if (result.data === null) {
    return <p className="gn-ticket-sheet__history-loading">Loading…</p>;
  }
  if (result.data.length === 0) {
    return <p className="gn-ticket-sheet__history-empty">No entries came back for this ticket.</p>;
  }
  return (
    <>
      {/*
        THE NOTICE COMES BEFORE THE LIST (E2-55). It used to follow it, and both
        help documents describe it by its location — "It stops at 200 entries,
        saying so at the top" (`docs/manual.md`) — so the sentence sent a reader
        looking for a disclosure that sat below the 200 rows it is a disclosure
        about. The `>=`-over-`==` trade argued at `HISTORY_PAGE_LIMIT` above is
        about the CLAIM's strength and stands; where the claim is placed is a
        separate decision, and a notice a reader must scroll past every row to
        meet does not do the job the trade was made for. One JSX move, and the
        help is true as written. `.gn-ticket-sheet__history-partial`'s margin
        moved to the bottom edge with it.
      */}
      {result.data.length >= HISTORY_PAGE_LIMIT ? (
        <p className="gn-ticket-sheet__history-partial">
          {`Showing the first ${HISTORY_PAGE_LIMIT} entries. This ticket's history may go on past them.`}
        </p>
      ) : null}
      <HistoryList events={result.data} nameOf={nameOf} stateName={stateName} typeName={typeName} />
    </>
  );
}

/**
 * A field value as text. A due date arrives as the claim `{ date }` and goes
 * through the one renderer, never an ISO slice; absence renders as an em dash
 * rather than as empty space, so "nobody has set this" is visible instead of
 * being indistinguishable from a layout gap.
 */
function renderFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object' && 'date' in (value as Record<string, unknown>)) {
    return formatDate(String((value as Record<string, unknown>)['date']));
  }
  return String(value);
}
