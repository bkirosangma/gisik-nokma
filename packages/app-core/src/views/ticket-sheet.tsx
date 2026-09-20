import { useRef, useState, type ReactNode } from 'react';
import {
  newUlid,
  statesWithBacklog,
  type SubmittedEvent,
  type TicketTypeDef,
} from '@gisik-nokma/domain';
import { Button, Chip, SegmentedControl, Select, Sheet } from '@gisik-nokma/ui';
import type { ClientStateCache } from '../cache.js';
import type { DataSource } from '../data-source.js';
import { precheckEvent, type PrecheckResult } from '../precheck.js';
import { actorLabel, formatDate, formatStateProvenance } from '../provenance.js';
import { makeSubmittedFactory } from '../submit.js';
import { dateClaimOf } from '../claims/ticket-dates.js';
import type { TicketHistoryEvent, TicketRead } from '../view-types.js';
import { AttachmentList, type AttachmentListEntry } from './attachment-list.js';
import {
  PlainTextEditorSlot,
  type EditorSlotComponent,
  type EditorSlotSubmission,
} from './editor-slot.js';
import { HistoryList } from './history-list.js';
import { formatRollup } from './rollup-text.js';
import { TransitionDialog, type TransitionSubmission } from './transition-dialog.js';
import { VisibilityEditor, type VisibilityClaim } from './visibility-editor.js';
import { useLiveQuery, type LiveQueryResult } from './use-live-query.js';

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
 * project root (`hierarchy.ts:108`) — while a child's rank is unbounded above,
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
  currentUserId: string;
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
   * ## `title`, not an id, and that is a departure from the prototype
   *
   * The prototype toast says `"GN-1183 deleted · …"` — a ticket KEY. **This
   * product has no ticket key**; its ids are ULIDs (`01J9GEVT…`), which are not
   * something a person reads back. The title is the only human name a ticket has
   * here, so it is what the sentence carries. **Recorded rather than silent: a
   * key is a migration, and the parity list already names the breadcrumb as its
   * owner.** Reversing this is one string in the host.
   */
  onDeleted?: (ticketId: string, title: string) => void;
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
 * `HistoryTab` (below) applies the SAME three-way distinction to the ledger tab.
 */
export function TicketSheet({
  dataSource,
  cache,
  workspaceId,
  ticketId,
  currentUserId,
  onClose,
  editorSlot,
  uploadEvidence,
  attachments,
  attachmentsUnavailable,
  visibility,
  canSetVisibility = true,
  onOpenTicket,
  onDeleted,
  workspaceName,
  projectName,
}: TicketSheetProps) {
  const EditorSlot = editorSlot ?? PlainTextEditorSlot;
  const [tab, setTab] = useState<'details' | 'history'>('details');
  /**
   * Full screen (sheet prototype parity, 2026-09-20). Local state, like `tab`:
   * it is a way of LOOKING at this sheet rather than anything the server holds,
   * and nothing outside `Sheet` needs to know.
   */
  const [sheetFull, setSheetFull] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [serverRefusal, setServerRefusal] = useState<{ rule: string; reason: string } | null>(null);
  /**
   * Ruling 33 (fix round 2, 2026-09-17) — Close/Reopen's OWN transport-error
   * slot, separate from `serverRefusal`. Ruling 27 (board-prototype-port,
   * cited on `board.tsx`'s identical pair) is the reason the two must stay
   * apart: `serverRefusal` carries only what the engine actually adjudicated
   * — a real `{rule, reason}` pair the door or the rule engine wrote — and a
   * silence or a dropped connection is not that, however much it might read
   * the same wrapped in the "Refused by the server — …" sentence. Filed here
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

  const read = useLiveQuery(dataSource, workspaceId, ticketId, () =>
    dataSource.query.getTicket(workspaceId, ticketId),
  );
  const ticketState = read.data?.ticket ?? null;
  const workflowKey =
    ticketState === null ? '' : `${ticketState.workflowId}@${ticketState.workflowVersion}`;
  const workflow = useLiveQuery(dataSource, workspaceId, workflowKey, async () => {
    const current = read.data?.ticket ?? null;
    return current === null
      ? null
      : dataSource.query.getWorkflowDef(workspaceId, current.workflowId, current.workflowVersion);
  });
  const members = useLiveQuery(dataSource, workspaceId, workspaceId, () =>
    dataSource.query.getMembers(workspaceId),
  );
  const history = useLiveQuery(dataSource, workspaceId, `${ticketId}:history`, () =>
    dataSource.query.getTicketHistory(ticketId, undefined, HISTORY_PAGE_LIMIT),
  );
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

  if (read.error !== null) {
    return (
      <Sheet open title="Ticket" onClose={onClose}>
        <p className="gn-ticket-sheet__refusal">{read.error}</p>
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

  const ticketRead: TicketRead = read.data;
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
  const nameOf = (userId: string): string =>
    actorLabel(userId, members.data?.find((member) => member.id === userId)?.name ?? null);
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
   */
  const precheck = async (
    toStateId: string,
    evidenceAttachmentId?: string | null,
  ): Promise<PrecheckResult> => {
    if (cache === undefined) return { kind: 'not-evaluated', why: 'missing-local-state' };
    // The candidate must carry WHAT THE SUBMISSION WILL CARRY, or the engine
    // evaluates a claim nobody is about to make — and `require-evidence` is
    // exactly that case: an absent id reads as "none was provided" and the
    // preview refused a move the user had just satisfied.
    const payload: Record<string, unknown> = { to: toStateId };
    if (evidenceAttachmentId !== undefined && evidenceAttachmentId !== null) {
      payload['evidenceAttachmentId'] = evidenceAttachmentId;
    }
    const candidate: SubmittedEvent = make({
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.transitioned',
      payload,
    });
    return precheckEvent(candidate, cache);
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
  const submitTransition = async (submission: TransitionSubmission): Promise<void> => {
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
    const results = await dataSource.ingest([...fieldEvents, transition]);
    const failed = results.find((result) => result.status !== 'committed');
    if (failed === undefined) {
      setServerRefusal(null);
      setMoveOpen(false);
      read.reload();
      history.reload();
      return;
    }
    // The authority's own words, carried without paraphrase. A refusal is a
    // named rule and a reason the engine wrote; an `invalid` is the door's code
    // and message. Both reach the user as they were said.
    if (failed.status === 'refused') setServerRefusal({ rule: failed.rule, reason: failed.reason });
    else setServerRefusal({ rule: failed.code, reason: failed.message });
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
  const submitAssignee = async (assigneeId: string | null): Promise<void> => {
    const event = make({
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.assigned',
      payload: { assigneeId },
    });
    const results = await dataSource.ingest([event]);
    const failed = results.find((result) => result.status !== 'committed');
    if (failed === undefined) {
      setServerRefusal(null);
      read.reload();
      history.reload();
      return;
    }
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
  const submitDescription = async (submission: EditorSlotSubmission): Promise<void> => {
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
      return;
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
      return;
    }
    if (result.status === 'refused') setServerRefusal({ rule: result.rule, reason: result.reason });
    else setServerRefusal({ rule: result.code, reason: result.message });
  };

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
  const queryUsers = async (query: string): Promise<Array<{ userId: string; name: string }>> => {
    const people = members.data ?? [];
    const needle = query.trim().toLowerCase();
    return people
      .filter((member) => needle === '' || member.name.toLowerCase().includes(needle))
      .map((member) => ({ userId: member.id, name: member.name }));
  };

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
   * which resetting only on the happy path would do. The early `if
   * (submitting) return` guards against a second click landing on the same
   * render pass as the first, before React has re-rendered the `disabled`
   * attribute onto the DOM (`userEvent`'s own await notwithstanding, this is
   * belt-and-braces for a synchronous double-invoke, not the primary defence
   * — the `disabled` attribute is).
   */
  const submitTicketEvent = async (
    type: 'ticket.closed' | 'ticket.reopened' | 'ticket.deleted',
    onCommitted: () => void,
  ): Promise<void> => {
    if (submitting) return;
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
        // a hand-built `{rule, reason}` pair standing in for one. `serverRefusal`
        // is cleared here too, the same pairing the `catch` branch below
        // already does: without it, a REFUSED answer followed by a SILENT one
        // (two separate clicks, two separate ingests) would leave the old
        // "Refused by the server — …" notice on screen alongside the new
        // transport one — two notices for one click's outcome, the earlier one
        // describing an answer that is no longer what happened.
        setServerRefusal(null);
        setTransportError('The server did not answer this change.');
        return;
      }
      if (result.status === 'committed') {
        setServerRefusal(null);
        setTransportError(null);
        // What a COMMITTED event does next is the caller's — Close/Reopen
        // re-read (the ticket's own state moved), Delete closes and narrates
        // (the ticket is gone from every view). Everything before this line is
        // shared on purpose: the refusal and transport-error slots, the
        // `submitting` latch, and the three-outcome split are one decision, and
        // a delete that grew its own private copy of them is how the two drift.
        onCommitted();
        return;
      }
      setTransportError(null);
      if (result.status === 'refused') setServerRefusal({ rule: result.rule, reason: result.reason });
      else setServerRefusal({ rule: result.code, reason: result.message });
    } catch (error) {
      // Ruling 27/33: a transport failure is not a refusal either — same
      // `transportError` channel `board.tsx`'s `submitDirect` (`:1082-1088`)
      // uses, own sentence, never `serverRefusal`.
      setServerRefusal(null);
      const message = error instanceof Error ? error.message : String(error);
      setTransportError(`We could not reach the server for this change — ${message}`);
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
   * *"must not be blank — a title of only spaces names nothing"* — so a second
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
      const results = await dataSource.ingest([event]);
      const result = results[0];
      if (result === undefined) {
        setServerRefusal(null);
        setTransportError('The server did not answer this change.');
        return;
      }
      if (result.status === 'committed') {
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
      if (result.status === 'refused') setServerRefusal({ rule: result.rule, reason: result.reason });
      else setServerRefusal({ rule: result.code, reason: result.message });
    } finally {
      titleSubmittingRef.current = false;
      setTitleSaving(false);
    }
  };

  /** Close/Reopen: the ticket's own state moved, so both reads are re-asked. */
  const closeOrReopen = (type: 'ticket.closed' | 'ticket.reopened'): Promise<void> =>
    submitTicketEvent(type, () => {
      read.reload();
      history.reload();
    });

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
   */
  const deleteTicket = (): Promise<void> =>
    submitTicketEvent('ticket.deleted', () => {
      onClose();
      onDeleted?.(ticketId, ticketRead.title);
    });

  const state = ticketRead.ticket;
  /**
   * Door G, 2026-09-19 — PRIORITY, DUE and TYPE as rows that are always drawn.
   *
   * ## What each one actually IS, measured rather than inferred
   *
   * The three are NOT the same kind of thing, and rendering them as though they
   * were would be the defect:
   *
   * - **Type** is a DOMAIN CONCEPT — `state.typeId` (`entity-state.ts:29`). The
   *   human name is not on the ticket at all, so it comes from the workspace's
   *   type ladder (`ticketTypes` above), falling back to the ID — the same
   *   fallback `readMyWork`'s project names use, and for the same reason: an id
   *   is a worse label than a name and a far better one than nothing.
   * - **Due** is a DOMAIN CONCEPT and a BUILT-IN field — `ticket-events.ts:66`
   *   names it among *"built-ins title/description/dueDate/startDate"*. It is
   *   read through `dateClaimOf`, the ONE place that resolves a date claim
   *   (`claims/ticket-dates.ts`, whose own docblock: *"There is NO other source
   *   of dates — absence is absence"*) rather than by reinterpreting
   *   `state.fields['dueDate'].value` here.
   * - **Priority** is NEITHER: it has **no domain concept at all** (measured —
   *   `priority` appears in zero files of `packages/domain`, against 9 for
   *   `assignee` and 6 for `dueDate` in the same run). It is a CUSTOM-FIELD
   *   CONVENTION: it exists when a ticket's type declares such a field, and the
   *   row says so plainly when it does not rather than implying the ticket
   *   carries a priority of zero.
   *
   * ## ⚠ Two of the prototype's three rows are EDITORS there, and that is a
   * ## separate door — this row builds the READ
   *
   * `desktop.dc.html:1192-1205` draws Priority as a segmented control whose
   * options carry `on-click` handlers, and Due as an `<input type="date">`. Only
   * **Type** is read-only there (`<span>{{ sheetType }}</span>`). The dispatch's
   * scope is *the three ROWS … not editing them*, so this is the read half, and
   * the editors are named as an unbuilt door in the PR body and the catalogue.
   *
   * ## The absent-value copy is the prototype's own
   *
   * `No date claimed` is transcribed (`:2362`/`:2853`/`:3587` — the prototype
   * uses that exact sentence for the same absence). `No priority claimed` is the
   * same construction for the field the prototype always has and we often do
   * not, and it is worded to be TRUE of a ticket whose type declares no such
   * field — not "none", which would be a claim about a field that does not
   * exist in the type at all.
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
  const priorityClaim = state.fields['priority'];
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
   */
  const subtaskRows = subtasks.data ?? [];
  const subtaskExpected =
    ticketRead.rollup === null
      ? 0
      : ticketRead.rollup.totalChildren - ticketRead.rollup.restrictedCount;
  const subtasksIncomplete = ticketRead.rollup !== null && subtaskRows.length !== subtaskExpected;

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
          ? `This is a ${parentTypeDef.name} — nothing smaller can sit under it.`
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
      const results = await dataSource.ingest([event]);
      const answer = results[0];
      if (answer === undefined || answer.status !== 'committed') {
        // A PRESENTATION of the refusal the server sent, never a paraphrase of
        // one it did not — this file's own rule for the same slot elsewhere.
        // **And BOTH non-committed arms are named, because they are different
        // sentences**: a blank title is `invalid` (`IngestResult` carries
        // `message` there, from the payload schema) while the rule engine's
        // answer is `refused` (which carries `reason`). Reading `.reason` off
        // an `invalid` answer would present `undefined` as the server's words.
        const said =
          answer === undefined
            ? 'The server did not answer, so what happened is not known.'
            : answer.status === 'invalid'
              ? answer.message
              : answer.reason;
        setSubtaskRefusal(`That subtask was not created: ${said}`);
        return;
      }
      // Cleared only on a committed answer: a refusal keeps the title so it can
      // be fixed rather than retyped.
      setNewSubtaskTitle('');
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
   * The three crumbs above the title — `Workspace › Project › State`, which is
   * the prototype's own shape stopped one short of its end.
   *
   * ## What was MEASURED, because the dispatch's arithmetic was not right here
   *
   * The prototype builds `sheetCrumbs` from workspace → project → epic →
   * parent → **the ticket key** — FIVE elements (`desktop.dc.html:3404-3420`) —
   * and draws them as a `<nav>` immediately above the title input
   * (`:1100-1116`). The dispatch says to build `Workspace › Project › State` and
   * STOP: **the key is the FOURTH CRUMB OF OURS** (it would sit after these
   * three), and it is another round's work. **So three, and the state is the
   * third.**
   *
   * ⚠ **AND THE KEY SHIPPED WHILE THIS BRANCH WAS OPEN** (PR #595, merged
   * `6f08452c`). The sentence here used to call it "another lane's in-flight
   * branch"; that was true when written and is not now. **The fourth crumb is
   * still not built, and the reason has changed rather than lapsed:**
   * `TicketRead` does not carry the key either — it is the SAME seven fields — so
   * a fourth crumb would need a third host prop or a read, which is the round
   * the dispatch scoped away. Nothing here is a placeholder for it.
   *
   * ⚠ "the fourth" is counted against OUR three, and an earlier version of this
   * sentence said "the fourth thing THERE" directly after enumerating the
   * prototype's five, which reads as a claim about `:3404-3420` and is false
   * of it. An independent reviewer caught the ambiguity; `Features.md` had the
   * same wording and is corrected with it.
   *
   * The state is the one crumb whose source is IN this component: it is
   * `currentStateName` above, already derived for the state chip from the
   * workflow this sheet has loaded. The two names are the props documented on
   * `TicketSheetProps` — **they are NOT on `TicketRead`**, which is seven fields
   * and carries no name of any kind.
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
   * : null}` (`page.tsx:1614`) — and the state crumb always renders, because it
   * is derived here rather than fetched.
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
  // OPTIONAL on `TicketState` (441 fixtures predate it, spec §1.2,
  // 2026-09-17); every reader spells the same `?? null`.
  const closed = state.closed ?? null;

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
  const assigneeRow = ((): { control: ReactNode; claim: string } => {
    const claim =
      ticketRead.assignedProvenance === null
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
    if (state.assigneeId !== null && !people.some((member) => member.id === state.assigneeId)) {
      // Assigned to somebody this viewer's roster does not list — a guest, to a
      // non-admin caller. The row says the name it can and offers no control,
      // rather than offering one that cannot state the value.
      return { control: readOnly, claim: `${claim} — not in the roster you can see` };
    }
    return {
      control: (
        <Select
          aria-label="Assignee"
          options={[
            // The unassigned arm is an OPTION and not the absence of one:
            // `ticket.assigned` with `null` is a legal state the control must be
            // able to express, and a picker with no way back to it cannot.
            { value: UNASSIGNED, label: 'Unassigned' },
            ...people.map((member) => ({ value: member.id, label: member.name })),
          ]}
          value={state.assigneeId ?? UNASSIGNED}
          onChange={(next) => {
            void submitAssignee(next === UNASSIGNED ? null : next);
          }}
        />
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
        22px/600), and they are one `titleSlot` rather than two props because
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
          */}
          {workspaceCrumb !== null && projectCrumb !== null ? (
            <nav className="gn-ticket-sheet__crumbs" aria-label="Ticket location">
              <span className="gn-ticket-sheet__crumb">{workspaceCrumb}</span>
              <span className="gn-ticket-sheet__crumb-sep" aria-hidden="true">
                ›
              </span>
              <span className="gn-ticket-sheet__crumb">{projectCrumb}</span>
              <span className="gn-ticket-sheet__crumb-sep" aria-hidden="true">
                ›
              </span>
              {/* The third crumb is the CURRENT position, so it is the one the
                  prototype draws plain-and-bold rather than as a link
                  (`:1108-1110`) — there is nowhere further to go from here. */}
              <span className="gn-ticket-sheet__crumb gn-ticket-sheet__crumb--current">
                {currentStateName}
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
            heading sat, and the visible text is the title itself.
          */}
          <input
            className="gn-ticket-sheet__title-input"
            type="text"
            aria-label="Ticket title"
            value={titleDraft ?? ticketRead.title}
            disabled={titleSaving}
            onChange={(event) => setTitleDraft(event.target.value)}
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
      }
    >
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

          ⚠ The authority's THIRD tab is not drawn. `Attachments` (`:3589`) is a
          READ behind that tab, not a surface, and the dispatch's rule for this
          task is to say which and not to assume it — the question is with the
          controller. Two tabs, one control, no invented tab. */}
      <SegmentedControl
        options={[
          { value: 'details', label: 'Details' },
          { value: 'history', label: 'History' },
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
          {`Refused by the server — ${serverRefusal.rule}: ${serverRefusal.reason}`}
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
        <p role="alert" className="gn-refusal gn-refusal--transport">
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
          <div className="gn-ticket-sheet__state">
            <Chip tone={state.stateCategory}>{currentStateName}</Chip>
            <span className="gn-ticket-sheet__provenance">
              {formatStateProvenance(currentStateName, ticketRead.stateProvenance)}
            </span>
            {closed !== null ? (
              <span className="gn-sheet__closed-badge">
                <Chip tone="terminal">{`Closed by ${nameOf(closed.actorId)} on ${formatDate(closed.at)}`}</Chip>
              </span>
            ) : null}
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
            <Button
              onClick={() => {
                setServerRefusal(null);
                setTransportError(null);
                setMoveOpen(true);
              }}
              disabled={closed !== null}
            >
              Move…
            </Button>
            {closed !== null ? (
              <span className="gn-sheet__closed-note">Closed — reopen it first</span>
            ) : null}
          </div>

          {/*
            Three different facts, three different sentences. A RESTRICTED
            parent is existence-without-title — the ticket has a parent and this
            viewer may not see which; rendering it as "At project root" would
            turn a restriction into a vanish (invariant 5). A NULL parent really
            is at the root. A visible parent shows its title.
          */}
          <div className="gn-ticket-sheet__parent">
            {ticketRead.parent === null ? (
              <span>At project root</span>
            ) : ticketRead.parent.kind === 'restricted' ? (
              <span className="gn-ticket-sheet__restricted">
                Restricted parent — exists, but you can&apos;t see it
              </span>
            ) : (
              <span>{ticketRead.parent.title}</span>
            )}
          </div>

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
            {/* The CHIP, and the prototype draws it BESIDE the heading in one
                flex row (`align-items:baseline;gap:10px;flex-wrap:wrap`,
                `:1237-1241`) rather than as a row of its own — so the wrapper
                is the prototype's, not an invention.

                THREE ARMS, and the third is the one that took a ruling:

                - **no parent** — nothing is drawn, which is the prototype's own
                  `sheetIsSub` test (`:3605`).
                - **a parent this viewer may see** — the prototype's chip: a
                  control naming the parent, `Subtask of {title}`, that opens it
                  through `onOpenTicket`. ONE HOP, as the prototype's `openParent`
                  does (`:3611`): the chip names the IMMEDIATE parent and never a
                  chain, and the parent's own sheet draws its own chip in turn,
                  so a nesting or a cycle is walked sheet by sheet and no
                  traversal lives here to loop.
                  With no `onOpenTicket` it is a PILL and not a control — see
                  that prop's docblock.
                - **a parent this viewer may NOT see** — a PILL, never a
                  control, and it names the restriction instead of the ticket:
                  `Subtask of a restricted parent`. The controller ruled this on
                  2026-09-20 after the alternative was priced: the read is a
                  discriminated union whose restricted arm *structurally cannot*
                  carry a title (`routes/tickets.ts:144-168`), the parent's title is
                  read INSIDE the `canSee` branch the restricted arm never reaches
                  (`routes/tickets.ts:353-372`, the code's own words at `:354-356`),
                  and cases `7.212` and `6.14` pin the existence-versus-title
                  contrast in both directions. **⚠ THE REASON FIRST RECORDED HERE WAS
                  WRONG, and it is corrected rather than deleted:** it cited 6.66's
                  "no table stores a ticket title", which was true when 6.66 was
                  written and is stale now — `proj_tickets` exists
                  (`migrations/1787961800000_proj-tickets.sql`) and the visible arm
                  serves `title: titleOf(parentState)` out of it. The conclusion
                  never rested on it. And the
                  prototype's own label fallback — `p ? p.title : sheet.parentId`
                  (`:3609`) — would have put an ID where a name belongs and made
                  the chip a control pointing at a ticket this viewer's own read
                  404s (case 6.14). The pill re-words a disclosure the sheet
                  already makes eight lines above it; it does not widen one.
                  **It must not read as "no parent"** — a root is a different
                  fact — which is why the arm exists rather than being omitted. */}
            <div className="gn-ticket-sheet__subtasks-head">
              <p className="gn-ticket-sheet__subtasks-heading">
                Subtasks
                {ticketRead.rollup === null ? '' : ` · ${formatRollup(ticketRead.rollup)}`}
              </p>
              {parent === null ? null : parent.kind === 'restricted' ? (
                <span
                  className="gn-chip gn-ticket-sheet__parent-chip"
                  data-testid="sheet-parent-chip-restricted"
                >
                  Subtask of a restricted parent
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
            {subtasksIncomplete ? (
              // THE RECONCILIATION, rendered rather than swallowed. A short list
              // here is the one failure this section could hide, so it is said
              // in the server's own numbers instead of drawn.
              <p
                className="gn-ticket-sheet__refusal"
                role="alert"
                data-testid="sheet-subtasks-incomplete"
              >
                {`The server counts ${subtaskExpected} subtask${subtaskExpected === 1 ? '' : 's'} you can see, and ${subtaskRows.length} could be read — so this list is not shown rather than shown short.`}
              </p>
            ) : subtaskRows.length === 0 ? (
              <p className="gn-ticket-sheet__subtasks-empty" data-testid="sheet-subtasks-empty">
                No subtasks. A subtask is a ticket of its own — it gets a state, an assignee, a date
                and a history.
              </p>
            ) : (
              <ul className="gn-ticket-sheet__subtasks-list">
                {subtaskRows.map((row) => (
                  <li key={row.ticketId} data-testid={`subtask-${row.ticketId}`}>
                    <span className="gn-ticket-sheet__subtask-title">{row.title}</span>
                    {/* THE SEPARATOR IS TEXT, NOT A GAP, and that is a decision
                        rather than a preference.

                        Two adjacent inline spans are ONE RUN OF GLYPHS — there is
                        no text between them — so the row rendered
                        `Order the brochuresTo do` on screen AND in the accessible
                        name. The controller's browser pass caught it on
                        2026-09-20 in this section, and the unit cases could not:
                        `16.15` queries each span's own text, which passes while
                        the row itself reads as one word.

                        A CSS `gap` would have fixed the screen and left the name
                        joined, and it would have been UNMEASURABLE here — this
                        section declares no stylesheet rule at all and jsdom has
                        no layout engine, so no case could tell the fix from its
                        absence. That is the same shape as the defect: a check
                        passing for a reason unrelated to what a person reads.
                        Text is the one treatment both surfaces, and the case,
                        can see. */}
                    <span className="gn-ticket-sheet__subtask-sep">{' · '}</span>
                    {/* The child's OWN state, spelled from the served row — the
                        empty state's sentence claims a subtask gets a state, so
                        the list has to show one or the claim is decoration. */}
                    <span className="gn-ticket-sheet__subtask-state">{row.stateName}</span>
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
                <label className="gn-field" htmlFor="gn-new-subtask-title">
                  <span className="gn-field__label">New subtask title</span>
                  <input
                    id="gn-new-subtask-title"
                    className="gn-field__input"
                    data-testid="sheet-subtask-title"
                    value={newSubtaskTitle}
                    onChange={(event) => setNewSubtaskTitle(event.target.value)}
                    disabled={addingSubtask}
                  />
                </label>
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

          <dl className="gn-ticket-sheet__fields">
            <div className="gn-ticket-sheet__field" data-testid="field-assignee">
              <dt>Assignee</dt>
              <dd>
                {assigneeRow.control}
                {/* The SAME `gn-ticket-sheet__claim` span every field row below
                    carries — an edited field that does not say who set it is the
                    one row on this sheet that cannot be trusted. */}
                <span className="gn-ticket-sheet__claim">{assigneeRow.claim}</span>
              </dd>
            </div>
            {/* Door G — PRIORITY, DUE and TYPE, drawn ALWAYS and in the
                prototype's own order (Assignee, Priority, Due, Type, Visibility
                — `desktop.dc.html:1183-1205`). Read-only here; the prototype's
                two editors are a separate door, argued in the derivations
                above. */}
            <div className="gn-ticket-sheet__field" data-testid="field-priority">
              <dt>Priority</dt>
              <dd>
                {/* A CONVENTION, not a built-in: absent whenever the ticket's
                    type declares no such field. The sentence says exactly that
                    rather than "none", which would be a claim about a field the
                    type does not have. */}
                {priorityClaim === undefined ? (
                  <span className="gn-ticket-sheet__absent">No priority claimed</span>
                ) : (
                  <>
                    <span>{renderFieldValue(priorityClaim.value)}</span>
                    <span className="gn-ticket-sheet__claim">{`set by ${nameOf(priorityClaim.actorId)} on ${formatDate(priorityClaim.serverTime)}`}</span>
                  </>
                )}
              </dd>
            </div>
            <div className="gn-ticket-sheet__field" data-testid="field-due">
              <dt>Due</dt>
              <dd>
                {/* The prototype's own sentence for this absence
                    (`desktop.dc.html:2853`), transcribed rather than re-worded:
                    an unclaimed date is not an empty one. */}
                {dueDate === null ? (
                  <span className="gn-ticket-sheet__absent">No date claimed</span>
                ) : (
                  <>
                    <span>{formatDate(dueDate.date)}</span>
                    {/* The SAME wording every other field row on this sheet uses
                        (`set by … on …`), because one surface with two
                        provenance phrasings is the drift this file's claim-line
                        comment exists to prevent. The ABSENT copy stays the
                        prototype's ("No date claimed") — that sentence is about
                        the DATE, and the claim line is about the ACTOR. */}
                    <span className="gn-ticket-sheet__claim">{`set by ${nameOf(dueDate.actorId)} on ${formatDate(dueDate.serverTime)}`}</span>
                  </>
                )}
              </dd>
            </div>
            <div className="gn-ticket-sheet__field" data-testid="field-type">
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
            <div className="gn-ticket-sheet__field" data-testid="field-description">
              <dt>description</dt>
              <dd>
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
                <EditorSlot
                  mode="description"
                  doc={descriptionClaim?.value}
                  readOnly={!canEditDescription}
                  workspaceId={workspaceId}
                  ticketId={ticketId}
                  placeholder="No description yet"
                  submit={submitDescription}
                  queryUsers={queryUsers}
                  onError={reportEditorError}
                />
                <span className="gn-ticket-sheet__claim">{descriptionClaimLine}</span>
              </dd>
            </div>
            {Object.entries(state.fields).map(([fieldId, fieldClaim]) => {
              // Drawn above, unconditionally. A second pass here would mount a
              // SECOND editor over one claim and make `field-description`
              // ambiguous to `getByTestId` — two controls for one field.
              //
              // `dueDate` and `priority` join it for door G, and the reason is
              // the same one rung less severe: both are drawn as their OWN rows
              // above, so a second pass would render **two rows for one claim**.
              // Without this the sheet shows a `field-dueDate` beside the
              // `field-due` this task adds, which is exactly the ambiguity the
              // description line exists to prevent — and it would be INVISIBLE
              // on any fixture whose ticket carries no such field.
              if (fieldId === 'description' || fieldId === 'dueDate' || fieldId === 'priority') {
                return null;
              }
              return (
                <div key={fieldId} className="gn-ticket-sheet__field" data-testid={`field-${fieldId}`}>
                  <dt>{fieldId}</dt>
                  <dd>
                    <span>{renderFieldValue(fieldClaim.value)}</span>
                    <span className="gn-ticket-sheet__claim">
                      {`set by ${nameOf(fieldClaim.actorId)} on ${formatDate(fieldClaim.serverTime)}`}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>

          {attachmentsUnavailable === undefined ? (
            <AttachmentList entries={attachments ?? []} />
          ) : (
            /*
              The three-way distinction this sheet already draws for the ticket
              read and for the ledger tab, applied to the files: an ANSWER (drawn
              above, empty or not), a WAIT (nothing yet — `AttachmentList`'s own
              silence), and a FAILURE, which is this sentence. It is deliberately
              not a `Loading…` line: a read that failed under the word "Loading…"
              is a wait that will never end, wearing the clothes of one that will.
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
              {`This ticket's attachments could not be read — ${attachmentsUnavailable}. That is a failure of this read, not a statement about the ticket: it may answer on a retry.`}
            </p>
          )}

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
            current={standingVisibility}
            canEdit={canSetVisibility}
            onChanged={() => {
              read.reload();
              history.reload();
            }}
          />
        </div>
      ) : (
        <HistoryTab result={history} nameOf={nameOf} />
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
          sheet. See `deleteTicket`'s docblock.

          The strip's fill and its full-bleed inset remain the recorded departure
          `ui.css` carries beside `.gn-ticket-sheet__footer` — the reason is a
          `Sheet` API change, measured there rather than asserted here. */}
      <footer className="gn-ticket-sheet__footer">
        <button
          type="button"
          className="gn-ticket-sheet__delete"
          disabled={submitting}
          onClick={() => void deleteTicket()}
        >
          Delete
        </button>
      </footer>

      {workflow.data != null ? (
        <TransitionDialog
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
          // `submitTransition` above stays unguarded (see its own docblock
          // precedent, cited by `board.tsx`'s `submitDirect`/`submitFromDialog`)
          // — a rejected `ingest` here is an unhandled promise rejection, not a
          // state this component tracks, so there is nothing to pass but `null`.
          // Not Ruling 27's scope: that ruling is about a fabricated `{rule,
          // reason}` pair standing in for a real refusal, which this file never
          // did — it just never caught the rejection at all.
          transportError={null}
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
}: {
  result: LiveQueryResult<TicketHistoryEvent[]>;
  nameOf: (userId: string) => string;
}) {
  if (result.error !== null) {
    return (
      <p className="gn-ticket-sheet__history-error">
        {`This ticket's history could not be read — ${result.error}. That is a failure of this read, not a statement about the ticket: it may answer on a retry.`}
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
      <HistoryList events={result.data} nameOf={nameOf} />
      {result.data.length >= HISTORY_PAGE_LIMIT ? (
        <p className="gn-ticket-sheet__history-partial">
          {`Showing the first ${HISTORY_PAGE_LIMIT} entries — this ticket's history may go on past them.`}
        </p>
      ) : null}
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
