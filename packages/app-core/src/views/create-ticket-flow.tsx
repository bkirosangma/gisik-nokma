import { useState } from 'react';
import { newUlid, type SubmittedEvent, type WorkflowDef } from '@gisik-nokma/domain';
import { Button, PlusIcon } from '@gisik-nokma/ui';
import type { ClientStateCache } from '../cache.js';
import type { DataSource } from '../data-source.js';
import {
  parentNoLongerClosed,
  reopenAndProceed,
  reopenOfferFor,
  submitChildEvent,
  type Refusal,
} from '../flows/guarded-child-event.js';
import { PARENT_TERMINAL_RULE, precheckEvent } from '../precheck.js';
import { makeSubmittedFactory } from '../submit.js';
import { OfflineAcceptError } from '../replica/replica-data-source.js';
import { addPendingDraft, removePendingDraft } from './draft-optimism.js';
import { DRAFT_NO_OUTSIDERS } from './drafts-copy.js';
import { outsiderIngest } from '../people/outsider-ingest.js';
import type { AssignOutsider, LookupPerson } from '../people/types.js';
import type { TicketRead } from '../view-types.js';
import type { EditorSlotComponent } from './editor-slot.js';
import { NewTicketDialog, type NewTicketDraft, type TypeOption } from './new-ticket-dialog.js';
import type { PendingCreate } from './board-move-state.js';
import { ReopenDialog, type RefusalOrigin } from './reopen-dialog.js';

export type CreateTicketFlowProps = {
  dataSource: DataSource;
  /** Fuels the instant pre-check only. Absent is normal: the flow then asks the server. */
  cache?: ClientStateCache;
  workspaceId: string;
  projectId: string;
  currentUserId: string;
  /** See `NewTicketDialogProps.typeOptions` — this flow only passes it through. */
  typeOptions: readonly TypeOption[];
  /** See `NewTicketDialogProps.parentCandidates` — this flow only passes it through. */
  parentCandidates: Array<{ id: string; title: string }>;
  /** See `NewTicketDialogProps.parentCandidatesUnavailable`. */
  parentCandidatesUnavailable?: string;
  /** See `NewTicketDialogProps.parentCandidatesNarrowing`. */
  parentCandidatesNarrowing?: string;
  /** See `NewTicketDialogProps.editorSlot` — this flow only passes it through. */
  editorSlot?: EditorSlotComponent;
  /** See `NewTicketDialogProps.assigneeCandidates` — this flow only passes it through. */
  assigneeCandidates: ReadonlyArray<{ id: string; name: string }>;
  /** See `NewTicketDialogProps.assigneeCandidatesUnavailable`. */
  assigneeCandidatesUnavailable?: string;
  /** See `NewTicketDialogProps.lookupPerson` — passed through. */
  lookupPerson?: LookupPerson;
  /**
   * The outsider door (access plan W6). Present with `lookupPerson`: an outsider
   * draft's `ticket.created` is sent through it instead of `dataSource.ingest`.
   */
  assignOutsider?: AssignOutsider;
  /** See `NewTicketDialogProps.workflowStates` — this flow only passes it through. */
  workflowStates: (workflowId: string) => { initialStateId: string; states: Array<{ id: string; name: string; category: string; creatable: boolean }> } | null;
  /**
   * A board column's own identity, when this flow was opened FROM one
   * (starting-status design, 2026-09-23) — `Board`'s `onCreateTicket`
   * selection, passed straight through to `NewTicketDialogProps.
   * initialSelection`. See that prop's own docblock.
   */
  initialSelection?: { workflowId: string; stateId: string };
  onCreated: (ticketId: string) => void;
  /**
   * Smoothness T7 (spec S5, audit SM-03) — the create is shown BEFORE the server answers. When given, the flow
   * calls this with the ticket it is about to file the moment both instant pre-checks have passed, closes the
   * dialog at once, and the shell draws a ghost card from it (`applyPendingCreates`). Only a ticket born IN FOCUS
   * has a column to be drawn in; a backlog birth, or a type whose workflow cannot be resolved here, keeps the
   * old shape (the dialog stays until the answer). ABSENT is normal: nothing changes.
   */
  onPending?: (create: PendingCreate) => void;
  /**
   * Called for every answer that is not a commit — a refusal, an invalid claim, a needs-reopen offer, a thrown
   * transport failure — with the id the ghost was drawn for, so the shell removes it. The dialog reopens with the
   * draft the person typed (and the SAME ticket id, so a retry after an unclear failure is refused
   * `ticket.already-exists` rather than filing a second ticket).
   */
  onRefused?: (ticketId: string) => void;
  /**
   * Drafts T8: a draft was saved (committed, or queued on this device). Called INSTEAD of `onCreated`, because nothing
   * was added to a board; the shell narrates it with `DraftSavedToast`. ABSENT is normal: a saved draft then closes the
   * dialog and says nothing.
   */
  onDraftSaved?: (ticketId: string) => void;
  /**
   * V1 (round-2 ruling, 2026-09-21) — the flow's open state, LIFTABLE.
   *
   * The board's empty state has a "Create ticket" button that renders only
   * when `onCreateTicket` is passed down, and the shell had nothing to pass: this
   * flow owns its dialog's open state and renders its own "Create ticket" trigger,
   * so no caller could open it from anywhere else. A shell that wants the empty
   * board to open this dialog passes `open`/`onOpenChange` and drives it.
   *
   * OPTIONAL, the same precedent `BoardProps`' own optional props set: absent
   * means the flow owns the state exactly as it did before these existed, so
   * every existing mount reads unchanged.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type ReopenPrompt = {
  childEvent: SubmittedEvent;
  childTicketId: string;
  parentId: string;
  parentTitle: string;
  parentStateName: string;
  reopenStates: Array<{ id: string; name: string }>;
  refusal: Refusal;
  refusalOrigin: RefusalOrigin;
  /**
   * Whether the parent is CLOSED (backlog/closed spec §2, ruling 37) — never
   * merely terminal. A closed ticket needs `ticket.reopened` ahead of the
   * transition, in the SAME batch, so the person is asked once and the two
   * events land or refuse together; a terminal-but-open parent (the v1 shape
   * every case before this task exercised) needs only the transition, as
   * before.
   *
   * `parentRead.ticket.closed` is `{actorId; at} | null | undefined` —
   * optional on the domain `TicketState` because 441 fixtures predate the
   * flag (dispatch-context's binding ruling) — so `reopenOfferFor`
   * (`flows/guarded-child-event.ts`) reads it through the SAME `?? null`
   * normalisation every other reader of the flag uses, rather than `!== null`
   * alone, which would treat an undefined (pre-flag) ticket as closed.
   */
  parentClosed: boolean;
};

type Failure = { headline: string | null; refusal: Refusal; origin: RefusalOrigin };

/**
 * "Create ticket", wired through the guarded flow: an instant pre-check preview
 * when the parent is cached, the server's refusal otherwise, and — on
 * `hierarchy.parent-terminal` either way — the reopen offer at the moment it
 * happens (owner decision). Nothing is retried silently; every refusal is
 * either remedied through the dialog with the actor's consent, or rendered
 * verbatim under the name of whoever refused it.
 *
 * ## The pre-check is a preview, never an authority
 *
 * Spec §5: the web client is online-only and every action round-trips, so the
 * server is the authority and its refusals render verbatim. Two directions,
 * both held here:
 *
 *  - A local check that does NOT refuse settles nothing. The claim still goes
 *    to the server, and if the server refuses, the SERVER's rule and reason are
 *    what appear — never the optimistic outcome, and never this client's
 *    paraphrase of the authority.
 *  - A local refusal is not dressed as the server's word. On the instant path
 *    NOTHING is submitted, and the reopen offer carries `refusalOrigin:
 *    'instant'`, which `ReopenDialog` renders as "instant check: " under the
 *    preview class. Only an answer that came back through `DataSource.ingest`
 *    is ever labelled "Refused by the server".
 *
 * On the `ticket.created` path the pre-check cannot manufacture a pass at all —
 * `precheckParentTerminal` (`../precheck.ts`) answers `refused` or
 * `not-evaluated` and has no `passed` exit, gate 4 — so the optimistic branch
 * this component must not take does not exist to be taken. That is a property
 * of the pre-check, not of this file, which is why the server-answer path below
 * is written to be correct whatever the preview said.
 *
 * ## THE SERVING GAP, named rather than papered over
 *
 * Building the offer needs two facts about the PARENT that no prop carries: the
 * state it is sitting in, and the workflow whose non-terminal states are the
 * options. `parentCandidates` supplies the title; the rest comes from
 * `DataSource.query.getTicket`. **⚠ CORRECTED 2026-09-20 — this read *"against the
 * shipped server that method REFUSES today (`ServingGapError`, six of thirteen
 * query methods — the route answers a `proj_visibility` row with no `TicketState`,
 * no title and no provenance). So online, this flow reaches the refusal and then
 * cannot build the offer."* Ruling P25 clause 1 (`c86c4b5c`, 2026-09-06) served
 * `getTicket`'s three absences, and the register has been EMPTY since 2026-09-19,
 * so online the offer BUILDS.** The refusal branch below is kept and is still
 * correct: a read can fail for ordinary reasons, and the property it guards is the
 * flow's behaviour when a read it needs does not answer, whatever the cause.
 *
 * What it does then is what Task 12's `TicketSheet` does with the same gap:
 * renders the refusal it actually has, says plainly that the offer could not be
 * built, and invents nothing. It does NOT fall back to the cache — a
 * `ClientStateCache` is explicitly never rendered as truth (`../cache.ts`) —
 * and it does not guess the parent's state from the reason string. The gap is
 * reported, not routed around; closing it is the read route's job, not this
 * component's.
 *
 * The workflow is fetched at the parent's PINNED version, not `latest`. A
 * ticket keeps the version it was created under (owner decision 2026-08-26), so
 * a later definition may not contain the parent's own `stateId` at all, and
 * `reopenStateOptions` would then quietly offer only the wildcard edges — a
 * shorter list of moves, with nothing on screen to say the list had been
 * silently narrowed. This is the same adaptation `TicketSheet` records for the
 * same reason.
 */
export function CreateTicketFlow({
  dataSource,
  cache,
  workspaceId,
  projectId,
  currentUserId,
  typeOptions,
  parentCandidates,
  parentCandidatesUnavailable,
  parentCandidatesNarrowing,
  editorSlot,
  assigneeCandidates,
  assigneeCandidatesUnavailable,
  lookupPerson,
  assignOutsider,
  workflowStates,
  initialSelection,
  onCreated,
  onPending,
  onRefused,
  onDraftSaved,
  open,
  onOpenChange,
}: CreateTicketFlowProps) {
  // Controlled when the shell passes `open`, self-owned otherwise — and the
  // internal state is ALWAYS written too, so a shell that starts controlling
  // mid-session (or stops) cannot leave the two disagreeing about a dialog that
  // is plainly on screen.
  const [selfOpen, setSelfOpen] = useState(false);
  const dialogOpen = open ?? selfOpen;
  const setDialogOpen = (next: boolean): void => {
    setSelfOpen(next);
    onOpenChange?.(next);
  };
  /** The draft to hand back to the dialog on its NEXT open — one shot: a Cancel, or the Create button, clears it (E2-37). */
  const [restoreDraft, setRestoreDraft] = useState<NewTicketDraft | undefined>(undefined);
  const [reopenPrompt, setReopenPrompt] = useState<ReopenPrompt | null>(null);
  const [parentRefusal, setParentRefusal] = useState<Refusal | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  /**
   * The Starting-status select's own inline refusal (starting-status design,
   * 2026-09-23) — `undefined` (never shown) unless a submit reached the
   * state-creatable check and it refused. This is deliberately a SEPARATE
   * piece of state from `failure`: `failure` renders OUTSIDE the dialog
   * (below it, in this component's own JSX), and the design asks for this
   * one to render UNDER THE SELECT, inside `NewTicketDialog` — a caller
   * mistake the select's own options being pre-filtered to `creatable`
   * makes RARE rather than impossible (the cache this flow previews against
   * can disagree with whatever `workflowStates` most recently offered).
   */
  const [stateRefusal, setStateRefusal] = useState<string | undefined>(undefined);
  const make = makeSubmittedFactory({ actorId: currentUserId, origin: 'web' });

  const clearAnswers = () => {
    setFailure(null);
    setTrouble(null);
    setParentRefusal(null);
    setStateRefusal(undefined);
  };

  const openReopenPrompt = async (
    childEvent: SubmittedEvent,
    parentId: string,
    refusal: Refusal,
    refusalOrigin: RefusalOrigin,
  ): Promise<void> => {
    let parentRead: TicketRead | null = null;
    let def: WorkflowDef | null = null;
    let gap: string | null = null;
    try {
      parentRead = await dataSource.query.getTicket(workspaceId, parentId);
      if (parentRead !== null) {
        def = await dataSource.query.getWorkflowDef(
          workspaceId,
          parentRead.ticket.workflowId,
          parentRead.ticket.workflowVersion,
        );
      }
    } catch (error) {
      // A refusing read is caught HERE rather than at the outer boundary so the
      // refusal that opened this offer is still rendered verbatim beside the
      // reason the offer could not be built. Losing the server's words to a
      // transport-shaped error message would answer a question nobody asked and
      // drop the one the actor is waiting on.
      gap = error instanceof Error ? error.message : String(error);
    }
    if (parentRead === null || def === null) {
      setFailure({
        headline:
          'The reopen offer needs the parent’s current state and its workflow, and this build could not read them' +
          (gap === null ? '.' : `: ${gap}`),
        refusal,
        origin: refusalOrigin,
      });
      return;
    }
    const offer = reopenOfferFor(def, parentRead.ticket);
    setReopenPrompt({
      childEvent,
      childTicketId: childEvent.entity.id,
      parentId,
      parentTitle: parentRead.title,
      ...offer,
      refusal,
      refusalOrigin,
    });
  };

  const create = async (draft: NewTicketDraft): Promise<void> => {
    clearAnswers();
    // Drafts T8 (decision 6): the forcing happens HERE, the one place that builds the event, whatever the dialog sent.
    const isDraft = draft.draft === true;
    // R8 in the flow, before anything is sent: the outsider door would grant a membership as a side effect of a
    // private act.
    if (isDraft && draft.assigneeIsOutsider === true) {
      setFailure({ headline: null, refusal: { rule: 'draft.no-outsiders', reason: DRAFT_NO_OUTSIDERS }, origin: 'instant' });
      return;
    }
    const childEvent = make({
      workspaceId,
      /**
       * ⚠ THE ID COMES FROM THE DRAFT, and this line used to be
       * `id: newUlid()` (owner request 2026-09-23).
       *
       * The description composer needs a `ticketId` BEFORE anything is created —
       * it is mounted inside the dialog, and the ticket it describes does not
       * exist until this call — so the DIALOG mints it on open and the draft
       * carries it here. `NewTicketDraft.ticketId` has the full argument,
       * including what the move buys: a duplicate create that somehow escapes the
       * dialog's `submittingRef` is now refused `ticket.already-exists`
       * (`packages/rule-engine/src/checks/hierarchy.ts:95`) instead of filing a
       * second ticket, because the second claim names an id that already
       * resolves.
       *
       * **What this line must NOT become is a second, independent mint.** The
       * whole point is that one id is chosen per draft and every consumer of it
       * — the composer, the payload, and `onCreated` below — names the same one.
       */
      entity: { kind: 'ticket', id: draft.ticketId },
      type: 'ticket.created',
      payload: {
        typeId: draft.typeId,
        projectId,
        parentId: draft.parentId,
        title: draft.title,
        // Backlog/closed spec §1.3: ALWAYS sent, never left to the wire's own
        // absence-means-focus fallback. That fallback exists for events
        // written before this field did; this client was not, and a v2
        // client leaving an additive field out is a choice, not a compatible
        // silence. `NewTicketDraft.start` is itself required (never
        // optional) for the identical reason, one layer up.
        start: isDraft ? 'backlog' : draft.start,
        ...(isDraft ? { draft: true as const } : {}),
        // Spec 2026-09-22, and the same reasoning the line above records: the
        // birth priority is ALWAYS sent, never left to the wire's
        // absence-means-P2 fallback. `NewTicketDraft.priority` is itself
        // required, so an omission upstream is a compile error.
        priority: draft.priority,
        // The birth description (owner request 2026-09-23), OMITTED when the
        // draft has none — which is the one member here that is spread rather
        // than named, and for the opposite reason to `start` and `priority`
        // directly above. Those two are always SENT because a ticket always has
        // a value; a ticket may genuinely have no description, so
        // `ticketCreatedPayload.description` is optional with absent meaning
        // exactly that, and the DIALOG has already made the emptiness decision
        // (`docToPlainText(...).length === 0`). Spreading is what keeps this a
        // KEY decision at one place: `description: undefined` would satisfy a
        // `toEqual` and put a key on the payload that says nothing.
        ...(draft.description === undefined ? {} : { description: draft.description }),
        // The birth assignee, or `null` for nobody — ALWAYS sent, like `start`
        // and `priority` and for their reason: `NewTicketDraft.assigneeId` is
        // required, "Unassigned" is a real position of the picker, and `null` is
        // the one spelling of nobody the chain agrees on. The permission door
        // holds a named person to the same membership rule `ticket.assigned` is
        // held to, so this member is not a way around it.
        assigneeId: draft.assigneeId,
        // The STARTING STATUS (starting-status design, 2026-09-23) — the
        // dialog has already made the omission decision (backlog ON, or
        // equal to the workflow's initial state); this door just carries it
        // through, the identical "spread, don't name" treatment `description`
        // gets above, for the identical reason.
        ...(isDraft || draft.stateId === undefined ? {} : { stateId: draft.stateId }),
        // The birth START and DUE date (addendum, 2026-09-23) — the dialog's
        // bare `YYYY-MM-DD` string wrapped as the `{date}` object the wire
        // expects (`dueDateValueSchema`'s own shape), omitted when the
        // dialog omitted it.
        ...(draft.startDate === undefined ? {} : { startDate: { date: draft.startDate } }),
        ...(draft.dueDate === undefined ? {} : { dueDate: { date: draft.dueDate } }),
        // The birth estimate (wtg2 T4): a bare whole number on the wire, omitted when the dialog omitted it.
        ...(draft.estimate === undefined ? {} : { estimate: draft.estimate }),
      },
    });

    if (cache !== undefined) {
      // The STATE-CREATABLE check runs FIRST, with or without a parent —
      // mirroring `precheckEvent`'s own order (state, then parent-terminal),
      // and the engine's (`checks/hierarchy.ts`: the state check reads the
      // workflow before any parent branch runs at all). Rare in practice,
      // since the dialog's own `workflowStates` prop already filters the
      // select to `creatable` states — this only fires when this flow's
      // cached definition disagrees with whatever the select most recently
      // offered (design's own "cannot happen from the board but the form
      // must not trust it").
      const workflowId = typeOptions.find((option) => option.id === draft.typeId)?.workflowId;
      const preview = await precheckEvent(childEvent, cache, { workflowId });
      if (preview.kind === 'refused' && preview.rule === 'workflow.state-not-creatable') {
        // NOTHING submitted, and the dialog STAYS OPEN — `setStateRefusal`
        // renders the reason under the Starting-status select, and the
        // person may pick a different one without losing the rest of the
        // draft (the dialog's own state is untouched by a refused create()).
        setStateRefusal(preview.reason);
        return;
      }
      if (preview.kind === 'refused' && preview.rule === PARENT_TERMINAL_RULE && draft.parentId !== null) {
        // The instant offer: no round trip, and NOTHING submitted — so nothing
        // here can be mistaken for the server having spoken.
        await openReopenPrompt(
          childEvent,
          draft.parentId,
          { rule: preview.rule, reason: preview.reason },
          'instant',
        );
        return;
      }
    }

    // An outsider birth assignee (access plan W6) goes through the outsider door;
    // every outcome branch below is unchanged because the answer still arrives as
    // an ingest result. The reopen path stays on `dataSource` — residual D11.
    const via =
      draft.assigneeIsOutsider === true && assignOutsider !== undefined && draft.assigneeId !== null
        ? { ...dataSource, ingest: outsiderIngest(assignOutsider, draft.assigneeId) }
        : dataSource;
    // THE GHOST (T7): from here the claim is on the wire, so the dialog closes and the board shows the card.
    const ghostWorkflowId = typeOptions.find((option) => option.id === draft.typeId)?.workflowId;
    const ghostStateId =
      draft.start === 'backlog' || ghostWorkflowId === undefined
        ? undefined
        : (draft.stateId ?? workflowStates(ghostWorkflowId)?.initialStateId);
    const ghost =
      !isDraft && onPending !== undefined && ghostWorkflowId !== undefined && ghostStateId !== undefined
        ? { ticketId: draft.ticketId, workflowId: ghostWorkflowId, stateId: ghostStateId, title: draft.title, typeId: draft.typeId, priority: draft.priority }
        : undefined;
    if (ghost !== undefined) {
      setRestoreDraft(undefined);
      setDialogOpen(false);
      onPending?.(ghost);
    }
    // Every answer that is not a commit takes the ghost back and hands the draft back to the dialog.
    // A draft has no ghost, so its dialog was never closed; the re-assertion below is harmless and keeps the typed
    // draft (and its SAME ticket id) for the retry.
    const takeBack = (): void => {
      if (ghost === undefined && !isDraft) return;
      onRefused?.(draft.ticketId);
      setRestoreDraft(draft);
      setDialogOpen(true);
    };
    // Drafts T8 (decision 5): the saved draft's row is in the pending store BEFORE the server answers.
    const draftRow = isDraft
      ? {
          ticketId: draft.ticketId, projectId, projectName: null, typeId: draft.typeId, title: draft.title, parentId: draft.parentId,
          updatedAt: childEvent.clientTime, attachmentCount: 0, pending: true,
        }
      : null;
    if (draftRow !== null) addPendingDraft(workspaceId, draftRow);
    const unwind = (): void => {
      if (draftRow !== null) removePendingDraft(workspaceId, draftRow.ticketId);
    };
    const saved = (): void => {
      setDialogOpen(false);
      onDraftSaved?.(childEvent.entity.id);
    };
    let outcome: Awaited<ReturnType<typeof submitChildEvent>>;
    try {
      outcome = await submitChildEvent(via, childEvent);
    } catch (error) {
      // Decision 4: an offline accept is not an error. The draft is queued; the replica lists it `pending`.
      if (isDraft && error instanceof OfflineAcceptError) {
        saved();
        return;
      }
      unwind();
      takeBack();
      throw error;
    }
    if (outcome.kind === 'committed') {
      if (isDraft) {
        saved();
        return;
      }
      setDialogOpen(false);
      onCreated(childEvent.entity.id);
      return;
    }
    unwind();
    takeBack();
    if (outcome.kind === 'needs-reopen' && draft.parentId !== null) {
      await openReopenPrompt(childEvent, draft.parentId, outcome.refusal, 'server');
      return;
    }
    if (outcome.kind === 'invalid') {
      setFailure({
        headline: null,
        refusal: { rule: outcome.result.code, reason: outcome.result.message },
        origin: 'server',
      });
      return;
    }
    // `refused`, and the one contradictory case: a parent-terminal refusal of a
    // claim that named no parent. There is no parent to offer a reopen on, so
    // the server's words stand as they are rather than being re-sorted into a
    // remedy this claim has no subject for.
    setFailure({ headline: null, refusal: outcome.refusal, origin: 'server' });
  };

  const acceptReopen = async (toStateId: string): Promise<void> => {
    if (reopenPrompt === null) return;
    setParentRefusal(null);
    const outcome = await reopenAndProceed(
      dataSource,
      {
        parent: { ticketId: reopenPrompt.parentId, workspaceId },
        toStateId,
        childTicketId: reopenPrompt.childTicketId,
        childEvent: reopenPrompt.childEvent,
        parentClosed: reopenPrompt.parentClosed,
      },
      make,
    );
    if (outcome.kind === 'committed') {
      const createdId = reopenPrompt.childTicketId;
      setReopenPrompt(null);
      setDialogOpen(false);
      onCreated(createdId);
      return;
    }
    if (outcome.kind === 'parent-refused') {
      // Stays open, in the dialog, verbatim: the parent's own rules refused the
      // reopen, and another target on the same list may still be allowed.
      if (parentNoLongerClosed(outcome)) {
        // Ruling 39 (fix round 1, 2026-09-17): the batch's `ticket.reopened`
        // half already COMMITTED before its transition half was refused — the
        // server processes a batch per-event, never atomically
        // (`guarded-child-event.ts`'s own docblock cites the real
        // `IngestService`), so this is reachable, not hypothetical. The
        // parent is no longer closed, permanently, and a retry that resent
        // `ticket.reopened` would itself be refused `not-closed` — masking
        // whatever the next target's own transition would have answered.
        // Flipping `parentClosed` to `false` here is what makes the retry
        // build `[transition]` alone, the same batch `openReopenPrompt` would
        // have built had it re-read the ticket after this commit.
        //
        // Ruling 50 (final whole-branch review fix wave A, 2026-09-17,
        // Finding 3): `outcome.parentReopened` is `false` for EVERY index-0
        // refusal (13.593b), including the one this OR-arm now catches — the
        // reopen half ITSELF refused `not-closed`, because someone else
        // reopened the parent a second before this confirm. That refusal is
        // the identical fact `parentReopened` reports, learned from a
        // different sentence: the server is saying "this parent is not
        // closed" either way, and a retry that still believes `parentClosed`
        // would resend `ticket.reopened` into the SAME refusal again,
        // masking the next target's transition — Ruling 39's masking,
        // reached from the other side. Case 13.593f.
        setReopenPrompt((prev) => (prev === null ? prev : { ...prev, parentClosed: false }));
      }
      setParentRefusal(outcome.refusal);
      return;
    }
    if (outcome.kind === 'child-refused-after-reopen') {
      setReopenPrompt(null);
      setFailure({
        headline: `${reopenPrompt.parentTitle} was reopened. That is now recorded history.`,
        refusal: outcome.refusal,
        origin: 'server',
      });
      return;
    }
    setReopenPrompt(null);
    setFailure({
      headline: null,
      refusal: { rule: outcome.result.code, reason: outcome.result.message },
      origin: 'server',
    });
  };

  /**
   * Every rejection out of the two async paths lands here. `getTicket` can reject
   * — it no longer refuses permanently, and this read "refuses with a
   * `ServingGapError` today" until 2026-09-20, when ruling P25 clause 1
   * (`c86c4b5c`, 2026-09-06) was found to have served its absences — and
   * `ingestOne` throws when a one-claim batch comes back with no answer in it;
   * either way the honest report is the thrown message, not a swallowed promise
   * and not an invented outcome.
   */
  const report = (error: unknown): void => {
    setReopenPrompt(null);
    setFailure(null);
    setTrouble(error instanceof Error ? error.message : String(error));
  };

  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          setRestoreDraft(undefined);
          setDialogOpen(true);
        }}
      >
        <PlusIcon />
        Create ticket
      </Button>
      <NewTicketDialog
        /**
         * ⚠ ONE MODAL AT A TIME (E2-34, 2026-09-21).
         *
         * The `needs-reopen` arm opens the offer and returns WITHOUT clearing
         * `dialogOpen` — which is right, because the draft must survive the
         * detour — but `open` here used to be `dialogOpen` alone, so BOTH
         * surfaces rendered: two `role="dialog"` elements, both `aria-modal="true"`,
         * telling assistive technology that the top one was the only modal on the
         * page. That is a lie about the page, not a layout preference.
         *
         * The offer REPLACES this dialog while it is up and hands it back when it
         * closes, so `dialogOpen` keeps meaning "the person is composing a ticket"
         * (the draft survives) while exactly one modal is ever rendered. E5-20
         * (case 3.189) fixed the other half of the same stack — one Escape no
         * longer closes both surfaces — and neither half implies the other.
         */
        open={dialogOpen && reopenPrompt === null}
        // The remembered birth-state answer is keyed by user (owner ruling
        // 2026-09-23), and this flow is the layer that already holds the
        // session's own id — `currentUserId`, the same value `makeSubmittedFactory`
        // stamps on every claim below. Passed straight through: the dialog reads
        // and writes the record itself, because it is the thing that knows WHEN
        // the person answered.
        userId={currentUserId}
        workspaceId={workspaceId}
        typeOptions={typeOptions}
        parentCandidates={parentCandidates}
        parentCandidatesUnavailable={parentCandidatesUnavailable}
        parentCandidatesNarrowing={parentCandidatesNarrowing}
        editorSlot={editorSlot}
        assigneeCandidates={assigneeCandidates}
        assigneeCandidatesUnavailable={assigneeCandidatesUnavailable}
        {...(lookupPerson === undefined ? {} : { lookupPerson })}
        workflowStates={workflowStates}
        initialSelection={initialSelection}
        stateRefusal={stateRefusal}
        restoreDraft={restoreDraft}
        onCreate={(draft) => {
          void create(draft).catch(report);
        }}
        onClose={() => {
          setRestoreDraft(undefined);
          setDialogOpen(false);
        }}
      />
      {reopenPrompt !== null ? (
        <ReopenDialog
          open
          parentTitle={reopenPrompt.parentTitle}
          parentStateName={reopenPrompt.parentStateName}
          refusal={reopenPrompt.refusal}
          refusalOrigin={reopenPrompt.refusalOrigin}
          reopenStates={reopenPrompt.reopenStates}
          parentRefusal={parentRefusal}
          onAccept={(toStateId) => {
            void acceptReopen(toStateId).catch(report);
          }}
          onCancel={() => {
            setReopenPrompt(null);
            setParentRefusal(null);
          }}
        />
      ) : null}
      {failure !== null ? (
        <p
          role="alert"
          className={
            failure.origin === 'server'
              ? 'gn-refusal gn-refusal--server'
              : 'gn-refusal gn-refusal--preview'
          }
        >
          {failure.headline !== null ? `${failure.headline} ` : ''}
          {failure.origin === 'server' ? 'Refused by the server: ' : 'instant check: '}
          {failure.refusal.rule}: {failure.refusal.reason}
        </p>
      ) : null}
      {trouble !== null ? (
        <p role="alert" className="gn-create-flow__trouble">
          {`This build could not carry the claim through: ${trouble}`}
        </p>
      ) : null}
    </>
  );
}
