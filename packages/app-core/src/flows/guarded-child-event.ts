import type { IngestResult, SubmittedEvent, WorkflowDef } from '@gisik-nokma/domain';
import type { DataSource } from '../data-source.js';
import { PARENT_TERMINAL_RULE } from '../precheck.js';
import type { MakeSubmitted } from '../submit.js';
import { transitionOptions } from '../views/transition-dialog.js';

export type Refusal = { rule: string; reason: string };

/**
 * The door's answer, narrowed to the arm that carries `code` and `message`.
 *
 * The plan's union said `result: IngestResult`, which leaves a caller wanting
 * to render an invalid answer with no way to reach either field without a
 * re-narrow — and the plan's own view code took the exit that offers, printing
 * a hardcoded "The claim was malformed." over the door's actual message. That
 * is the verbatim rule broken by a type that was too wide, so the type is
 * narrowed instead of the sentence being reinvented downstream.
 */
export type InvalidResult = Extract<IngestResult, { status: 'invalid' }>;

export type GuardedOutcome =
  | { kind: 'committed'; result: IngestResult }
  | { kind: 'needs-reopen'; refusal: Refusal }
  | { kind: 'refused'; refusal: Refusal }
  | { kind: 'invalid'; result: InvalidResult };

/**
 * A one-event batch came back with no answer in it.
 *
 * `DataSource.ingest` is typed `SubmittedEvent[] -> IngestResult[]` with no
 * length relation between the two, and `noUncheckedIndexedAccess` makes that
 * gap a compile error rather than a runtime surprise. There is no honest
 * default available: `committed` would invent an acceptance, `refused` would
 * invent a rule, and `invalid` would need a `code` and a `message` this client
 * was not given. So the claim's fate is UNKNOWN, and that is what is said —
 * out loud, to the caller, rather than folded into one of the three answers a
 * server actually gives.
 */
export class UnansweredClaimError extends Error {
  readonly sent: SubmittedEvent;

  constructor(sent: SubmittedEvent) {
    super(
      `The server returned no result for ${sent.type} ${sent.id}. Whether the claim landed is ` +
        'unknown; nothing here may assume either way.',
    );
    this.name = 'UnansweredClaimError';
    this.sent = sent;
  }
}

/** The one place a single-claim batch is unwrapped, so the absent answer has one treatment. */
async function ingestOne(source: DataSource, event: SubmittedEvent): Promise<IngestResult> {
  const results = await source.ingest([event]);
  const result = results[0];
  if (result === undefined) throw new UnansweredClaimError(event);
  return result;
}

/**
 * Submit a child-placing claim (`ticket.created` carrying a parent, or
 * `ticket.reparented`). A `hierarchy.parent-terminal` refusal is not an error —
 * it is the moment the owner decision fires: the caller offers the reopen.
 *
 * Every OTHER refusal stays an ordinary refusal, and it is the shared rule id
 * that sorts them, not a substring of the reason: `PARENT_TERMINAL_RULE`
 * (`../precheck.ts`) is the same constant the local pre-check refuses under and
 * the same string `packages/rule-engine/src/checks/hierarchy.ts` refuses under
 * at both its call sites, so the client's branch and the server's verdict
 * cannot drift into disagreeing about which refusal is the reopenable one.
 */
export async function submitChildEvent(
  source: DataSource,
  event: SubmittedEvent,
): Promise<GuardedOutcome> {
  const result = await ingestOne(source, event);
  if (result.status === 'committed') return { kind: 'committed', result };
  if (result.status === 'invalid') return { kind: 'invalid', result };
  if (result.rule === PARENT_TERMINAL_RULE) {
    return { kind: 'needs-reopen', refusal: { rule: result.rule, reason: result.reason } };
  }
  return { kind: 'refused', refusal: { rule: result.rule, reason: result.reason } };
}

/**
 * Non-terminal states the parent can STRUCTURALLY reach from its current
 * terminal state. Rule-based refusals (`restrict-to` and kin) are deliberately
 * NOT pre-filtered: the owner decision says the parent workflow's own
 * transition rules still apply to the reopen and are honoured ON ATTEMPT, so a
 * move this client cannot pre-clear is still offered and the server's refusal
 * is what settles it. Filtering here would turn "the server may say no" into
 * "this client already said no on the server's behalf".
 *
 * "Structurally reachable" has exactly ONE definition in this package and it is
 * `transitionOptions` (`../views/transition-dialog.ts`, Task 12): declared
 * edges only, `from: '*'` counts, an edge back into the current state is not a
 * move, the first declaring edge wins for a target reachable twice, and a
 * target the definition has no state for is dropped rather than rendered as a
 * bare id. Re-deriving that here would be a second answer to one question, free
 * to drift the first time either is corrected.
 *
 * This function adds ONE thing to it — terminal targets are removed — because a
 * reopen into a terminal state reopens nothing. That single difference is what
 * `test/flows/guarded-child-event.test.ts` pins.
 */
export function reopenStateOptions(
  def: WorkflowDef,
  currentStateId: string,
): Array<{ id: string; name: string }> {
  const terminal = new Set(
    def.states.filter((state) => state.category === 'terminal').map((state) => state.id),
  );
  return transitionOptions(def, currentStateId)
    .filter((option) => !terminal.has(option.toStateId))
    .map((option) => ({ id: option.toStateId, name: option.name }));
}

export type ReopenPlan = {
  parent: { ticketId: string; workspaceId: string };
  /**
   * The VIEW's spelling of the destination, matching `TransitionSubmission`.
   * The ledger's is `to` — see `reopenAndProceed`.
   */
  toStateId: string;
  /** The child's ENTITY id (for `ticket.created`: the new ticket's ULID), never the event id. */
  childTicketId: string;
  childEvent: SubmittedEvent;
  /**
   * Ruling 37 (backlog/closed spec §2, coordinator, 2026-09-17): whether the
   * PARENT is closed, not merely terminal. A closed ticket has no legal
   * transition at all (`closed-ticket` refuses before edge resolution even
   * runs) — the reopen must clear the closed flag before the SAME parent can
   * be moved, and the owner decision says the person is asked once, so both
   * events go out in one batch rather than as two round trips the actor never
   * agreed to separately.
   */
  parentClosed: boolean;
};

export type ReopenOutcome =
  | { kind: 'committed'; parentResult: IngestResult; childResult: IngestResult }
  | { kind: 'parent-refused'; refusal: Refusal }
  | { kind: 'child-refused-after-reopen'; parentResult: IngestResult; refusal: Refusal }
  | { kind: 'invalid'; result: InvalidResult };

/**
 * The accepted reopen: the parent's remedy FIRST, carrying the cause that
 * boards render, THEN the child claim — the same envelope that was refused,
 * resubmitted as-is (an interactive refusal records nothing, coordination
 * amendment 16, so its event id is still unused).
 *
 * ## The parent's remedy is ONE OR TWO events, never two round trips
 *
 * Ruling 37 (backlog/closed spec §2, 2026-09-17): a CLOSED parent has no
 * legal transition at all — `closed-ticket` refuses before edge resolution
 * even runs — so reopening it needs `ticket.reopened` (empty payload) ahead
 * of the transition. The owner decision says the person is asked once, so
 * both events are built and submitted as ONE `source.ingest(batch)` call
 * rather than as `ticket.reopened` awaited, then the transition awaited
 * separately: two round trips would let a person's connection drop between
 * them, closed-cleared but not yet moved, with no claim recorded for the
 * second half and nothing here to retry it from. A merely TERMINAL (not
 * closed) parent — the only shape every case before this task exercised —
 * needs just the transition, and the batch is the one-element array it
 * always was.
 *
 * Results are read back in the SAME order the batch was sent: the first
 * non-committed result decides the outcome (`parent-refused` for a refusal,
 * `invalid` for a malformed claim), and `parentResult` in a committed outcome
 * is always the TRANSITION's own result — the LAST element of the batch,
 * whether or not a reopen preceded it — because that is the event whose
 * `seq`/`serverTime` a caller building on this outcome actually wants: the
 * ticket's new state, not the intermediate reopen. An array shorter than the
 * batch (the door answering fewer results than claims sent) is the same
 * UNKNOWN `ingestOne` already refuses to paper over, so it throws the same
 * `UnansweredClaimError`, naming whichever of the batch's own events went
 * unanswered.
 *
 * ## Sequential against the CHILD is still the contract, and `await` still enforces it
 *
 * The parent batch is `await`ed in full before the child is ever built or
 * sent — never a `Promise.all` covering all three events. The parent must be
 * non-terminal (and, when it was closed, reopened) by the time the child claim
 * is EVALUATED, and issuing everything at once leaves that ordering to
 * whichever request the server happens to reach first — the child would then
 * be refused by the very rule this whole offer exists to clear, intermittently.
 * A test that only reads back the order of `source.ingested` cannot tell the
 * two shapes apart, because a `Promise.all` pushes its batches in argument
 * order too; the sequencing test in `test/flows/guarded-child-event.test.ts`
 * holds the parent's answer open and asserts the child has NOT been sent while
 * it is pending, which is the difference.
 *
 * A parent refusal — of EITHER event in its batch — stops the child from ever
 * being submitted: the owner decision says the parent workflow's own rules
 * still apply to the reopen, so sending the child anyway would be the
 * permission escalation the decision was written to forbid — a `restrict-to`
 * the actor cannot satisfy, worked around by a convenience.
 *
 * If the child is refused for some OTHER reason after the reopen committed, the
 * reopen STANDS as recorded, attributed history. Nothing is rolled back and
 * nothing is hidden: the ledger is append-only, and a compensating transition
 * invented by this client would be a claim nobody made.
 *
 * ## The wire spelling is `to`
 *
 * `ticketTransitionedPayloadSchema` (`packages/domain/src/workflow.ts`) names
 * the destination `to`; `cause` is the optional sibling the owner decision
 * added there, `{ kind: 'reopened-for-child', childTicketId }`. Task 12's
 * `TicketSheet.submitTransition` translates at the same boundary and for the
 * same reason — the view vocabulary says `toStateId`, the ledger says `to`, and
 * the translation happens where the envelope is built. `ticket.reopened`
 * carries no payload at all (`ticketReopenedPayload = z.object({}).strict()`),
 * the same empty shape `ticket.closed` uses.
 */
export async function reopenAndProceed(
  source: DataSource,
  plan: ReopenPlan,
  make: MakeSubmitted,
): Promise<ReopenOutcome> {
  const parentTransition = make({
    workspaceId: plan.parent.workspaceId,
    entity: { kind: 'ticket', id: plan.parent.ticketId },
    type: 'ticket.transitioned',
    payload: {
      to: plan.toStateId,
      cause: { kind: 'reopened-for-child', childTicketId: plan.childTicketId },
    },
  });

  const batch: SubmittedEvent[] = plan.parentClosed
    ? [
        make({
          workspaceId: plan.parent.workspaceId,
          entity: { kind: 'ticket', id: plan.parent.ticketId },
          type: 'ticket.reopened',
          payload: {},
        }),
        parentTransition,
      ]
    : [parentTransition];

  const results = await source.ingest(batch);
  // Assigned on every iteration that does not return early, so by the time
  // the loop falls through, `parentResult` holds the LAST element's result —
  // the transition's own, per this function's docblock — never the reopen's.
  // `batch` is never empty (it always carries at least `parentTransition`),
  // so at least one assignment always happens before this is read.
  let parentResult!: IngestResult;
  for (const [index, sent] of batch.entries()) {
    const result = results[index];
    if (result === undefined) throw new UnansweredClaimError(sent);
    if (result.status === 'refused') {
      return { kind: 'parent-refused', refusal: { rule: result.rule, reason: result.reason } };
    }
    if (result.status === 'invalid') return { kind: 'invalid', result };
    parentResult = result;
  }

  const childResult = await ingestOne(source, plan.childEvent);
  if (childResult.status === 'committed') return { kind: 'committed', parentResult, childResult };
  if (childResult.status === 'invalid') return { kind: 'invalid', result: childResult };
  return {
    kind: 'child-refused-after-reopen',
    parentResult,
    refusal: { rule: childResult.rule, reason: childResult.reason },
  };
}
