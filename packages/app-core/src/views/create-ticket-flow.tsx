import { useState } from 'react';
import { newUlid, statesWithBacklog, type SubmittedEvent, type WorkflowDef } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from '@gisik-nokma/rule-engine';
import { Button } from '@gisik-nokma/ui';
import type { ClientStateCache } from '../cache.js';
import type { DataSource } from '../data-source.js';
import {
  reopenAndProceed,
  reopenStateOptions,
  submitChildEvent,
  type Refusal,
} from '../flows/guarded-child-event.js';
import { PARENT_TERMINAL_RULE, precheckEvent } from '../precheck.js';
import { makeSubmittedFactory } from '../submit.js';
import type { TicketRead } from '../view-types.js';
import { NewTicketDialog, type NewTicketDraft } from './new-ticket-dialog.js';
import { ReopenDialog, type RefusalOrigin } from './reopen-dialog.js';

export type CreateTicketFlowProps = {
  dataSource: DataSource;
  /** Fuels the instant pre-check only. Absent is normal: the flow then asks the server. */
  cache?: ClientStateCache;
  workspaceId: string;
  projectId: string;
  currentUserId: string;
  typeOptions: Array<{ id: string; name: string }>;
  /** See `NewTicketDialogProps.parentCandidates` — this flow only passes it through. */
  parentCandidates: Array<{ id: string; title: string; inFocus: boolean }>;
  /** See `NewTicketDialogProps.parentCandidatesUnavailable`. */
  parentCandidatesUnavailable?: string;
  /** See `NewTicketDialogProps.parentCandidatesNarrowing`. */
  parentCandidatesNarrowing?: string;
  onCreated: (ticketId: string) => void;
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
   * flag (dispatch-context's binding ruling) — so this reads it through the
   * SAME `?? null` normalisation every other reader of the flag uses, rather
   * than `!== null` alone, which would treat an undefined (pre-flag) ticket
   * as closed.
   */
  parentClosed: boolean;
};

type Failure = { headline: string | null; refusal: Refusal; origin: RefusalOrigin };

/**
 * "New ticket", wired through the guarded flow: an instant pre-check preview
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
 *    'instant'`, which `ReopenDialog` renders as "instant check — " under the
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
 * `DataSource.query.getTicket`, and against the shipped server that method
 * REFUSES today (`ServingGapError`, six of thirteen query methods — the route
 * answers a `proj_visibility` row with no `TicketState`, no title and no
 * provenance). So online, this flow reaches the refusal and then cannot build
 * the offer.
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
  onCreated,
}: CreateTicketFlowProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reopenPrompt, setReopenPrompt] = useState<ReopenPrompt | null>(null);
  const [parentRefusal, setParentRefusal] = useState<Refusal | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const make = makeSubmittedFactory({ actorId: currentUserId, origin: 'web' });

  const clearAnswers = () => {
    setFailure(null);
    setTrouble(null);
    setParentRefusal(null);
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
          (gap === null ? '.' : ` — ${gap}`),
        refusal,
        origin: refusalOrigin,
      });
      return;
    }
    // `statesWithBacklog`, not `def.states` (backlog/closed spec §1.4,
    // 2026-09-17): a parent parked in the universal Backlog state has no row
    // in its own published definition, and the reopen prompt must still name
    // it "Backlog" rather than the bare id.
    const parentStateName =
      statesWithBacklog(def).find((state) => state.id === parentRead.ticket.stateId)?.name ??
      parentRead.ticket.stateId;
    setReopenPrompt({
      childEvent,
      childTicketId: childEvent.entity.id,
      parentId,
      parentTitle: parentRead.title,
      parentStateName,
      reopenStates: reopenStateOptions(def, parentRead.ticket.stateId),
      refusal,
      refusalOrigin,
      parentClosed: (parentRead.ticket.closed ?? null) !== null,
    });
  };

  const create = async (draft: NewTicketDraft): Promise<void> => {
    clearAnswers();
    const childEvent = make({
      workspaceId,
      entity: { kind: 'ticket', id: newUlid() },
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
        start: draft.start,
      },
    });

    if (cache !== undefined && draft.parentId !== null) {
      const preview = await precheckEvent(childEvent, cache);
      if (preview.kind === 'refused' && preview.rule === PARENT_TERMINAL_RULE) {
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

    const outcome = await submitChildEvent(dataSource, childEvent);
    if (outcome.kind === 'committed') {
      setDialogOpen(false);
      onCreated(childEvent.entity.id);
      return;
    }
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
      if (outcome.parentReopened || outcome.refusal.rule === REFUSAL_RULES.notClosed) {
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
        headline: `${reopenPrompt.parentTitle} was reopened — that is now recorded history.`,
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
   * Every rejection out of the two async paths lands here. `getTicket` refuses
   * with a `ServingGapError` today and `ingestOne` throws when a one-claim batch
   * comes back with no answer in it; either way the honest report is the thrown
   * message, not a swallowed promise and not an invented outcome.
   */
  const report = (error: unknown): void => {
    setReopenPrompt(null);
    setFailure(null);
    setTrouble(error instanceof Error ? error.message : String(error));
  };

  return (
    <>
      <Button variant="primary" onClick={() => setDialogOpen(true)}>
        New ticket
      </Button>
      <NewTicketDialog
        open={dialogOpen}
        typeOptions={typeOptions}
        parentCandidates={parentCandidates}
        parentCandidatesUnavailable={parentCandidatesUnavailable}
        parentCandidatesNarrowing={parentCandidatesNarrowing}
        onCreate={(draft) => {
          void create(draft).catch(report);
        }}
        onClose={() => setDialogOpen(false)}
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
          {failure.origin === 'server' ? 'Refused by the server — ' : 'instant check — '}
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
