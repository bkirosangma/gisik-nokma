import { newSubmittedEvent, type Origin, type SubmittedEvent, type WorkflowDef } from '@gisik-nokma/domain';

/**
 * The raw non-terminal set of a workflow definition.
 *
 * ## WHAT THIS DOES NOT DO, enumerated rather than called "partial"
 *
 * It does NOT filter by structural reachability. A state it returns may be one
 * the parent's current state has no declared edge to, in which case the
 * transition built from it is refused by the engine on arrival. It does not
 * take the parent's current state at all, so it *cannot* filter by
 * reachability — the information is absent from its signature.
 *
 * ## The reopen picker must NOT use this. It has an owner, and this is not it.
 *
 * "Which states may this parent be reopened into" already has exactly one
 * answer in this package: `reopenStateOptions(def, currentStateId)`
 * (`../flows/guarded-child-event.ts`), which composes `transitionOptions`
 * (declared edges only, `from: '*'` counts, an edge back into the current
 * state is not a move, first declaring edge wins, a target with no state is
 * dropped) and then removes terminal targets. That is the function the ONLINE
 * reopen dialog is fed from, via `create-ticket-flow.tsx`, and the offline
 * dialog must be fed from the same one — a device that offers reopen targets
 * the online client does not is a client disagreeing with itself about a
 * workflow both are reading.
 *
 * The name is the trap: `nonTerminalStates` reads like the picker's source and
 * the plan text that specified it says "the dialog's choices". It is published
 * cross-plan API (Plan 10 Task 13's Produces block), so it is exported as
 * declared rather than renamed — and `test/reopen-pair.test.ts` pins the
 * divergence with a definition where the two answers differ, so the difference
 * is visible in the suite instead of waiting to be rediscovered at a picker.
 *
 * Recorded for the owner of Plan 10 Task 13's published surface: if nothing
 * outside this package consumes `nonTerminalStates` by the time the app shells
 * (Tasks 16/17) mount a reopen dialog, the honest end state is to delete it and
 * let `reopenStateOptions` be the one answer.
 */
export function nonTerminalStates(def: WorkflowDef): Array<{ id: string; name: string }> {
  return def.states.filter((s) => s.category !== 'terminal').map((s) => ({ id: s.id, name: s.name }));
}

/**
 * The owner reopen decision, offline: "Parent X is <terminal>. Reopen it and
 * proceed?" On acceptance the parent's transition (with its named cause) goes
 * FIRST, then the child event — the pre-check overlay makes the pair pass
 * locally, and the server sees the same order at sync. If the world changed,
 * the pair contests coherently (harness S5).
 *
 * ## The wire spelling is `to`, and the plan text said `toStateId`
 *
 * `ticketTransitionedPayloadSchema` (`packages/domain/src/workflow.ts:137`)
 * names the destination `to`, with `cause` as its optional sibling declared
 * exactly `{ kind: 'reopened-for-child', childTicketId }`. The schema is not
 * `.strict()`, so a payload spelled `toStateId` is not REFUSED for carrying an
 * unknown key — the key is silently stripped and the parse then fails on the
 * missing required `to`. Either way the claim never lands, and the failure
 * arrives at the server rather than here.
 *
 * Plan 10 Task 13's published signature block spelled it `toStateId`, and its
 * prescribed test asserted that spelling with `toMatchObject` against a
 * freshly built envelope — an assertion that cannot fail, because nothing in
 * it passes the payload through a schema. `test/reopen-pair.test.ts` parses
 * the built payload through `domainRegistry`, the same registration the real
 * door consults, and carries a negative control proving the plan's spelling
 * fails that parse.
 *
 * This function keeps `reopenToStateId` as its INPUT name deliberately: that
 * is the view's vocabulary (`TransitionSubmission.toStateId`,
 * `ReopenPlan.toStateId`), and the translation to the ledger's `to` happens
 * where the envelope is built — the same boundary, for the same reason, as
 * `reopenAndProceed` (`../flows/guarded-child-event.ts:184`) and
 * `TicketSheet.submitTransition`.
 *
 * ## Why a PAIR here, when `reopenAndProceed` makes two sequential calls
 *
 * Online, the parent's answer must be known before the child is sent, because
 * a refused reopen must not be followed by a child claim the reopen existed to
 * clear — so `reopenAndProceed` awaits the first ingest before issuing the
 * second. Offline there is no answer to await: both claims enter the outbox and
 * the ORDER is the whole contract. Returning a tuple rather than submitting is
 * what lets the caller enqueue them adjacently, and what lets the harness
 * (Task 15) hand the same two envelopes to a second replica.
 *
 * `actor` is the same `{ userId, origin }` pair `makeSubmittedFactory`
 * (`../submit.ts`) closes over; this function takes it explicitly because it is
 * pure and is called from paths that hold no session factory.
 *
 * `origin` here is the ENVELOPE-ORIGIN provenance enum ('web' | 'desktop' |
 * 'mobile' | 'server'), never the HTTP `Origin` header. The two are routinely
 * conflated in this area of the repo and nothing in this file concerns CSRF.
 */
export function buildReopenPair(input: {
  workspaceId: string;
  parentTicketId: string;
  reopenToStateId: string;
  childEvent: SubmittedEvent;
  actor: { userId: string; origin: Origin };
}): [SubmittedEvent, SubmittedEvent] {
  const reopen = newSubmittedEvent({
    workspaceId: input.workspaceId,
    entity: { kind: 'ticket', id: input.parentTicketId },
    type: 'ticket.transitioned',
    payload: {
      to: input.reopenToStateId,
      cause: { kind: 'reopened-for-child', childTicketId: input.childEvent.entity.id },
    },
    actorId: input.actor.userId,
    origin: input.actor.origin,
  });
  return [reopen, input.childEvent];
}
