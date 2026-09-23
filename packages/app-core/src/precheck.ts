import { REFUSAL_RULES, evaluateEvent, workflowStateNotCreatableRefusal, type EngineContext } from '@gisik-nokma/rule-engine';
import {
  BACKLOG_STATE_ID,
  isCreatableState,
  label,
  statesWithBacklog,
  ticketClosedPayload,
  ticketCreatedPayload,
  ticketRankedPayload,
  ticketReopenedPayload,
  ticketReparentedPayload,
  ticketTransitionedPayloadSchema,
  transitionsWithBacklog,
  type EventEnvelope,
  type FieldClaim,
  type SubmittedEvent,
  type TicketState,
  type TicketTransitionedPayload,
  type WorkflowDef,
} from '@gisik-nokma/domain';
import type { ClientStateCache } from './cache.js';

/** The owner decision's rule id for live children offered under terminal parents (coordination doc). */
export const PARENT_TERMINAL_RULE = 'hierarchy.parent-terminal';

/**
 * The provisional position a pre-check envelope carries. The ledger's first
 * `seq` is 1 and `eventEnvelopeSchema` requires a positive integer, so 0 is a
 * position no committed event can ever hold: the completed envelope is refused
 * by the very door it would have to pass to become a fact, which is what stops
 * a stand-in built for a local evaluation from being laundered into one.
 */
const PROVISIONAL_SEQ = 0;

export type PrecheckResult =
  | { kind: 'refused'; rule: string; reason: string }
  | { kind: 'passed' }
  | { kind: 'not-evaluated'; why: 'missing-local-state' };

export type PrecheckDeps = {
  evaluate?: typeof evaluateEvent;
  now?: () => Date;
  /**
   * Field claims the caller has COLLECTED BUT NOT YET SUBMITTED — the dialog's
   * own typed inputs. Not a dependency in the injected-function sense; it lives
   * here because this type is already the caller's channel into the evaluation,
   * and it is deliberately not a fourth positional argument that every
   * `precheckEvent(candidate, cache)` call site would have to spell `undefined`
   * through.
   *
   * WHY IT IS NEEDED AT ALL. `evaluateRequireField`
   * (`rule-engine/src/rules/require-field.ts:9`) reads
   * `input.ticket.fields[rule.field]?.value` — the value comes out of the
   * TICKET STATE, not out of the candidate's payload. The real path makes that
   * work by sending the field claims FIRST and the transition last, in one
   * ordered batch (`views/ticket-sheet.tsx` `submitTransition`, and the
   * docblock there says why). A pre-check evaluates ONE candidate against
   * cached state and has no such batch, so for a field the ticket does not
   * already carry the engine sees the value as unset no matter what the dialog
   * collected — and the preview refuses a move the person has just satisfied,
   * permanently, beside an enabled primary control.
   *
   * The same argument the evidence fix made one line below: the candidate must
   * carry WHAT THE SUBMISSION WILL CARRY. Blank values are passed through
   * rather than filtered here — the engine's own `isSet` treats a
   * whitespace-only string as unset, which is the same answer the submission's
   * `(fieldValues[field] ?? '') !== ''` filter gives, so no value that can
   * change the verdict differs between the two paths.
   */
  pendingFields?: Record<string, string>;
  /**
   * The workflow a `ticket.created` candidate would be born on (starting-
   * status design, 2026-09-23) — the caller's channel for the one fact
   * `precheckCreatableState` needs that this cache cannot derive on its own.
   *
   * `ticketCreatedPayload` names the ticket's TYPE, not its workflow, and
   * `ClientStateCache` holds no ticket-type store to resolve one from the
   * other (see `getTicketTypeDef` below, and gate 4's docblock on
   * `precheckParentTerminal`) — the caller building the draft already
   * resolved the type the New-ticket form picked, and with it the workflow,
   * so it is handed here rather than re-derived. Absent (or a workflow this
   * cache has not cached) defers rather than guessing: `precheckCreatableState`
   * answers `null` — no verdict from THIS check — and `precheckEvent` falls
   * through to `precheckParentTerminal` for the rest of `ticket.created`'s
   * preview, exactly as an uncached fact defers everywhere else in this
   * module.
   */
  workflowId?: string;
};

/** A fresh object each time: a shared literal would let one caller's mutation reach the next. */
function notEvaluated(): PrecheckResult {
  return { kind: 'not-evaluated', why: 'missing-local-state' };
}

/**
 * Instant, named-reason refusal preview (spec honesty contract 2), advisory
 * only: the server remains the authority, and when the two disagree the
 * server's refusal renders verbatim.
 *
 * WHAT THE THREE ANSWERS MEAN.
 *
 * `refused` — a rule the shared engine could evaluate here says no, and the
 * facts it read were server-served state this client holds. The server may
 * still refuse for a different reason first; it will not accept what this
 * refusal describes.
 *
 * `passed` — no rule the shared engine can evaluate refuses this claim, AND
 * every fact the verdict rested on came from state this client actually holds.
 * It is NOT a promise of acceptance: the door, the entity↔workspace binding,
 * visibility, and every rule later plans add all live beyond this engine's
 * reach.
 *
 * `not-evaluated` — a fact the verdict would need is one only the server holds.
 * The caller defers, which is what it should do.
 *
 * The line the whole module is built to hold is between the last two: a
 * pre-check may never manufacture a `passed` out of ABSENCE. Five gates keep
 * it for `ticket.transitioned`'s accept path, and each names the absence it
 * closes — the `closed-ticket` refusal ahead of them (fired on a
 * `ticket.transitioned` whose ticket is closed, backlog/closed spec §2,
 * 2026-09-17) is a REFUSAL, decided from the flag alone, and is not one of
 * the four for that reason: it never manufactures the `passed` the gates
 * exist to guard:
 *
 *  1. the moving ticket and its workflow definition must be cached at all;
 *  2. every workflow version the forward fold could consult must be cached, at
 *     BOTH ends of the chain — a missing intermediate invents `stranded-state`
 *     refusals and silently disarms four-eyes, which skips entries it cannot
 *     resolve, while a cached definition OLDER than the version the ticket
 *     itself names makes the fold a no-op and evaluates the wrong vocabulary's
 *     rules entirely;
 *  3. an ACCEPT into a terminal state must rest on a vouched-complete child set
 *     — the parent-terminal invariant reads an unseen child as no child, and
 *     that is the one way an accept can be conjured from nothing;
 *  4. a hierarchy claim — `ticket.created`, `ticket.reparented` — defers
 *     ENTIRELY through `precheckParentTerminal`. Plan 3 landed both as engine
 *     cases (`evaluate.js`), and every engine ACCEPT for either is decided
 *     behind the ticket's own type definition (`checks/hierarchy.ts:97` for
 *     creation, `:251` for a reparent), which is read BEFORE even the
 *     no-parent branch. This cache holds no ticket-type definitions at all,
 *     so there is no accept for those two types left to derive from what it
 *     holds. What survives FROM THAT FUNCTION is the `hierarchy.parent-terminal`
 *     REFUSAL below, which reads only the cached, server-served `stateCategory`
 *     and nothing else. **`ticket.created` alone has a SECOND, independent
 *     refusal since the starting-status design (2026-09-23):**
 *     `precheckCreatableState` answers `workflow.state-not-creatable` off the
 *     cached `WorkflowDef` and the payload's own `stateId` — a question this
 *     cache's ticket-type gap has nothing to do with, so it is not gated by
 *     this numbered list;
 *  5. an ACCEPT that moves a ticket OUT of a terminal state must rest on its
 *     parent being cached — the child's side of the parent-terminal invariant
 *     (`transition.ts`, E3-19) reads the parent's category and refuses nothing
 *     when the parent cannot be resolved, so an uncached parent reads as no
 *     parent, and that is the same accept-from-absence gate 3 closes on the
 *     other side of the relation.
 *
 * One refusal is downgraded rather than shown: a roles-bearing `restrict-to`
 * resolves against memberships only the server holds, and refusing there would
 * be a guess wearing a uniform.
 */
export async function precheckEvent(
  submitted: SubmittedEvent,
  cache: ClientStateCache,
  deps: PrecheckDeps = {},
): Promise<PrecheckResult> {
  if (submitted.entity.kind !== 'ticket') return notEvaluated();

  if (submitted.type === 'ticket.created') {
    // Starting-status design (2026-09-23): the state check runs FIRST,
    // mirroring the engine's own order (`checks/hierarchy.ts`, right after
    // the workflow resolves and before every parent branch) — a fact about
    // the workflow and the payload alone, decided before parent-terminal
    // even asks whether there is a parent.
    const stateRefusal = precheckCreatableState(submitted, cache, deps.workflowId);
    if (stateRefusal !== null) return stateRefusal;
    return precheckParentTerminal(submitted, cache);
  }
  if (submitted.type === 'ticket.reparented') {
    return precheckParentTerminal(submitted, cache);
  }

  if (submitted.type === 'ticket.closed') return precheckTicketClosed(submitted, cache);
  if (submitted.type === 'ticket.reopened') return precheckTicketReopened(submitted, cache);
  if (submitted.type === 'ticket.ranked') return precheckTicketRanked(submitted, cache);

  // Every other type: the shared engine has no case for it, so an accept from
  // it would mean only "this engine had nothing to say", which is not a
  // pre-check result — it is the absence of one.
  if (submitted.type !== 'ticket.transitioned') return notEvaluated();

  const ticket = cache.getTicket(submitted.entity.id);
  if (ticket === undefined) return notEvaluated();

  // The explicit reopen (backlog/closed spec §2), mirrored from the engine's
  // OWN order: `transition.ts:72` decides this before it even fetches the
  // workflow def at `:76`, because a closed ticket has no legal move at all
  // and the flag is a fact this cache already holds — no def, no version
  // chain, nothing further is needed to answer confidently. Deciding it here,
  // ahead of the gates below, is what makes this branch predict the engine on
  // a ticket whose def or version chain is NOT fully cached, where the gates
  // would otherwise defer on a claim the engine can refuse outright.
  if ((ticket.closed ?? null) !== null) {
    return { kind: 'refused', rule: REFUSAL_RULES.closedTicket, reason: 'This ticket is closed — reopen it first.' };
  }

  const def = cache.getWorkflowDef(ticket.workflowId);
  if (def === undefined) return notEvaluated();
  if (!versionChainIsCached(cache, ticket, def)) return notEvaluated();

  const evaluate = deps.evaluate ?? evaluateEvent;
  const envelope = completeForPrecheck(submitted, deps.now);
  const verdict = await evaluate(
    envelope,
    contextFromCache(cache, pendingFieldClaims(envelope, deps.pendingFields)),
  );
  // The engine's own door for this payload, asked again for the two questions
  // the verdict alone cannot answer: which state is being entered, and which
  // edge carries the rule that refused.
  const payload = ticketTransitionedPayloadSchema.safeParse(submitted.payload);

  if (!verdict.refused) {
    if (!payload.success) return notEvaluated();
    if (acceptRestsOnUnseenChildren(ticket, def, payload.data, cache)) return notEvaluated();
    if (acceptRestsOnUnseenParent(ticket, def, payload.data, cache)) return notEvaluated();
    return { kind: 'passed' };
  }

  if (verdict.rule === REFUSAL_RULES.restrictTo && (!payload.success || needsMembership(ticket, def, payload.data))) {
    return notEvaluated();
  }

  return { kind: 'refused', rule: verdict.rule, reason: verdict.reason };
}

/** Provisional completion: serverTime/seq are the server's; these stand in only inside the local evaluation. */
export function completeForPrecheck(submitted: SubmittedEvent, now: () => Date = () => new Date()): EventEnvelope {
  return { ...submitted, serverTime: now().toISOString(), seq: PROVISIONAL_SEQ };
}

/**
 * The field claims a caller has collected but not submitted, as claims the
 * engine can read — built from the CANDIDATE'S OWN envelope, so the provenance
 * is the provenance the `ticket.field_set` would really carry if the dialog
 * sent it (`rule-engine/src/fixtures/harness.ts:534-539` folds exactly this
 * four-field shape), never a fabricated one. `serverTime` and `seq` are the
 * provisional pair `completeForPrecheck` already stands in for; nothing on the
 * transitioned path reads either off a field claim.
 */
export type PendingOverlay = {
  ticketId: string;
  fields: Record<string, FieldClaim>;
};

function pendingFieldClaims(
  envelope: EventEnvelope,
  pending: Record<string, string> | undefined,
): PendingOverlay | undefined {
  if (pending === undefined) return undefined;
  const entries = Object.entries(pending);
  if (entries.length === 0) return undefined;
  return {
    ticketId: envelope.entity.id,
    fields: Object.fromEntries(
      entries.map(([field, value]) => [
        field,
        {
          value,
          actorId: envelope.actorId,
          clientTime: envelope.clientTime,
          serverTime: envelope.serverTime,
        },
      ]),
    ),
  };
}

/**
 * The cache seen as the engine sees any store. It answers only what it holds
 * and never invents: an uncached entity is `null`, and the gates in
 * `precheckEvent` — not this adapter — decide when that absence makes the whole
 * verdict untrustworthy. `getChildrenStates` is the one method whose honest
 * answer ("the children I have seen") is not the one the caller wants ("all of
 * them"), which is why gate 3 exists above it.
 *
 * That division of labour has a PRECONDITION, and naming it here matters
 * because the sentence above otherwise reads as blanket licence for `null`: a
 * store to be absent FROM, and a matching gate in `precheckEvent` able to read
 * the absence. `getTicketTypeDef` has neither — this cache has no ticket-type
 * store, so there is nothing for a gate to interrogate — which is why that one
 * method throws instead of participating in it.
 */
export function contextFromCache(cache: ClientStateCache, overlay?: PendingOverlay): EngineContext {
  return {
    async getEntityState(kind, id) {
      if (kind !== 'ticket') return null;
      const ticket = cache.getTicket(id) ?? null;
      // The overlay is keyed by the ticket it belongs to and applies to that
      // one only: the engine resolves OTHER entities too (a parent, a child),
      // and a pending claim is about the candidate's own subject. This is the
      // one place the pre-check's answer differs from "what the cache holds",
      // and it is the whole of `pendingFields`.
      if (ticket === null || overlay === undefined || overlay.ticketId !== id) return ticket;
      return { ...ticket, fields: { ...ticket.fields, ...overlay.fields } };
    },
    async getChildrenStates(ticketId) {
      return cache.childrenOf(ticketId);
    },
    // `scope` is UNREAD: a client cache holds the one workspace this device is
    // signed into, so there is no second tenancy to keep apart. The parameter is
    // the server's (controller ruling P14) and is carried here because one
    // signature across every implementation is what keeps them from drifting.
    // Note that `ClientStateCache.getWorkflowDef` (`./cache.ts`) and
    // `DataSource.getWorkflowDef` (`./data-source.ts`) are DIFFERENT methods on
    // different types; only the `EngineContext` one takes a scope.
    async getWorkflowDef(_scope, workflowId, version) {
      return cache.getWorkflowDef(workflowId, version) ?? null;
    },
    // The required fourth method (ruling P3), and this cache cannot answer it.
    // `null` is available and is the WRONG answer here. On the fixture harness,
    // the memory context and the server, `null` means "this workspace has no
    // such type" — a fact each of those stores actually speaks for. Here it
    // would mean "I do not hold it", which this cache spells `undefined`
    // everywhere else and which the gates above turn into `not-evaluated`.
    // Answering `null` would let the engine convert that absence into
    // `ticket.unknown-type` (`checks/hierarchy.ts:97-98`, `:251-252`,
    // `checks/fields.ts:159-160`) — a REFUSAL manufactured out of absence, the
    // exact mirror of the `passed` this module's whole invariant forbids, and
    // one that fails this module's own definition of `refused`: "the facts it
    // read were server-served state this client holds".
    //
    // A throw rather than `null`, and the server's counter-example does not
    // transfer: `apps/server/src/engine-context.ts` answers `null` because it
    // is LIVE and a throw would turn an ingest into a 500. No live path here
    // can reach this. `precheckEvent` routes only `ticket.transitioned` to this
    // context, and `getTicketTypeDef` is reached only from the hierarchy and
    // field checks — `ticket.created`, `ticket.reparented`, `ticket.field_set`
    // — none of which is on the transitioned path.
    //
    // THE ABSENCES, enumerated rather than called partial. None is this plan's:
    //  1. `ClientStateCache` has no ticket-type store, and nothing feeds it
    //     `ticket-type.defined` (owner: Plan 6a for the surface, Plan 6 Task 7
    //     for the producer, over Plan 5's ticket-types read);
    //  2. `precheckEvent` therefore has no gate that could downgrade a missing
    //     definition to `not-evaluated` — there is no store to gate on;
    //  3. `precheckParentTerminal` still answers the two hierarchy types
    //     without the engine, so nothing yet REQUIRES this method to answer.
    // Closing 1 and 2 is what unblocks routing 3 through the engine.
    async getTicketTypeDef(_scope, typeId) {
      void typeId;
      throw new Error(
        'contextFromCache: this client cache holds no ticket-type definitions, so it can neither ' +
          'confirm nor deny one. Absent: (1) a ticket-type store on ClientStateCache and a ' +
          'ticket-type.defined feed; (2) a precheckEvent gate mapping a missing definition to ' +
          'not-evaluated; (3) precheckParentTerminal routing ticket.created / ticket.reparented ' +
          'through the engine. Owners: Plan 6a (cache surface), Plan 6 Task 7 (producer).',
      );
    },
  };
}

/**
 * `ticket.created`'s STARTING STATUS, previewed client-side (starting-status
 * design, 2026-09-23): the same `isCreatableState` test
 * `checks/hierarchy.ts` runs, so the New-ticket form can show "Tickets cannot
 * start in …" before submit rather than only after the server refuses it.
 *
 * Hand-rolled, like `precheckTicketClosed`/`precheckTicketRanked` below, and
 * deliberately NOT routed through `evaluateEvent`/`contextFromCache`: the
 * CANARY test in `precheck.test.ts` pins that `checkTicketCreated` rejects
 * (throws) the moment it reaches `getTicketTypeDef`, which this cache cannot
 * answer — so driving `ticket.created` through the shared engine here would
 * throw on every call rather than preview anything.
 *
 * Returns `null` — no verdict from THIS check, not `not-evaluated` — when
 * there is nothing to say: the payload names no `stateId` (absent means the
 * workflow's initial state — this check has nothing to say about it either
 * way), `workflowId` was not supplied,
 * or this cache has not cached that definition. `null` lets `precheckEvent`
 * fall through to `precheckParentTerminal` for the rest of `ticket.created`'s
 * preview instead of manufacturing an answer this function does not have.
 */
function precheckCreatableState(
  submitted: SubmittedEvent,
  cache: ClientStateCache,
  workflowId: string | undefined,
): PrecheckResult | null {
  const parsed = ticketCreatedPayload.safeParse(submitted.payload);
  if (!parsed.success || parsed.data.stateId === undefined) return null;
  if (workflowId === undefined) return null;
  const def = cache.getWorkflowDef(workflowId);
  if (def === undefined) return null;
  if (isCreatableState(def, parsed.data.stateId)) return null;
  return {
    kind: 'refused',
    rule: 'workflow.state-not-creatable',
    // `label`, not a hand-rolled quote: the SAME function `checks/hierarchy.ts`
    // feeds `workflowStateNotCreatableRefusal`, so a known state's name and an
    // unknown id's own quoting cannot drift between the engine and this preview.
    reason: workflowStateNotCreatableRefusal(label(def, parsed.data.stateId)),
  };
}

/**
 * The reopen moment (owner decision, coordination doc): live work arriving
 * under a finished parent refuses toward a reopen rather than landing quietly.
 *
 * `ticket.created` always carries live work — a new ticket starts in its
 * workflow's initial state. A `ticket.reparented` carries it only when the
 * ticket being moved is itself non-terminal; a finished child under a finished
 * parent contradicts nothing, so the move stands.
 *
 * THIS FUNCTION NO LONGER ANSWERS `passed`, and that is gate 4 above. Plan 3
 * Chain A landed `ticket.created` and `ticket.reparented` as engine cases, and
 * every ACCEPT path through `checkTicketCreated` / `checkTicketReparented`
 * consults the ticket's own type definition before any branch — so with this
 * cache holding no ticket-type store, no accept for either type is derivable
 * from facts this client holds. Answering `passed` from the hand-written check
 * would claim more than the engine ever agreed to, which coordination §12
 * claim 2 named IN ADVANCE as the moment such a `passed` violates this module's
 * scope sentence. The three former `passed` exits are now `not-evaluated`.
 *
 * The `hierarchy.parent-terminal` refusal below STAYS. It reads only the
 * cached, server-served `stateCategory` — state this client genuinely holds —
 * so it satisfies the `refused` clause, and its failure direction is
 * over-refusal on an advisory surface, which this module already tolerates and
 * names elsewhere (the `restrict-to` downgrade). Routing this function through
 * the engine is the eventual answer and is blocked on the cache growing a
 * ticket-type store: owner Plan 6 Task 7.
 */
function precheckParentTerminal(submitted: SubmittedEvent, cache: ClientStateCache): PrecheckResult {
  const parentId = claimedParentId(submitted);
  // The payload is not the shape the door admits, so nothing can be read off it
  // — including whether a parent is named at all.
  if (parentId === undefined) return notEvaluated();
  // NOT `passed`, and the no-parent case is not the exception it looks like:
  // `checks/hierarchy.ts:97` resolves the ticket's own type BEFORE the
  // no-parent branch at `:114`, and `:133` then refuses
  // `hierarchy.deepest-rank-parent-required` off `type.rank`. An unconditional
  // `passed` here was false for every type at or below the deepest rank.
  if (parentId === null) return notEvaluated();

  const parent = cache.getTicket(parentId);
  if (parent === undefined) return notEvaluated();
  if (parent.stateCategory !== 'terminal') return notEvaluated();

  if (submitted.type === 'ticket.reparented') {
    const moving = cache.getTicket(submitted.entity.id);
    if (moving === undefined) return notEvaluated();
    // Not refusing is not the same as passing: the engine's accept for a
    // reparent reads a definition this cache cannot serve.
    if (moving.stateCategory === 'terminal') return notEvaluated();
  }

  return {
    kind: 'refused',
    rule: PARENT_TERMINAL_RULE,
    reason: `${titleOf(parent)} is in a terminal state; it must reopen because it is acquiring live work.`,
  };
}

/**
 * `ticket.closed`/`ticket.reopened`, hand-rolled from `checks/close.ts`'s own
 * conditions and rule ids (backlog/closed spec §2, 2026-09-17) — the same
 * shape `precheckParentTerminal` takes, and NOT routed through the shared
 * engine for the same reason that function gives (`evaluate.ts` is a flat
 * switch, one check per event type, so there is nothing else to call through).
 *
 * UNLIKE `precheckParentTerminal`, these two CAN answer `passed`. Gate 4
 * exists because `checkTicketCreated`/`checkTicketReparented` read a
 * ticket-type definition this cache has no store for; `checkTicketClosed` and
 * `checkTicketReopened` read neither — `checkTicketClosed` reads only
 * `ticket.closed` and `ticket.stateCategory`, both cached facts, and consults
 * a workflow def ONLY to spell the state's NAME inside a refusal reason it has
 * already decided to give. So once every fact a verdict rests on is genuinely
 * held, a `passed` here is not an accept manufactured from absence — it is the
 * one this module's own invariant permits.
 */
function precheckTicketClosed(submitted: SubmittedEvent, cache: ClientStateCache): PrecheckResult {
  const parsed = ticketClosedPayload.safeParse(submitted.payload);
  if (!parsed.success) return notEvaluated();
  const ticket = cache.getTicket(submitted.entity.id);
  if (ticket === undefined) return notEvaluated();
  if ((ticket.closed ?? null) !== null) {
    return { kind: 'refused', rule: REFUSAL_RULES.alreadyClosed, reason: 'This ticket is already closed.' };
  }
  if (ticket.stateCategory !== 'terminal') {
    // The def is read ONLY for the name in the reason below, never for the
    // verdict — `ticket.stateCategory` is already the cached fact the refusal
    // rests on — so an uncached definition degrades the name to the bare
    // state id rather than turning a confident refusal into `not-evaluated`,
    // exactly as `checks/close.ts`'s own `def === null` branch does.
    const def = cache.getWorkflowDef(ticket.workflowId);
    const stateName =
      def === undefined ? ticket.stateId : statesWithBacklog(def).find((state) => state.id === ticket.stateId)?.name ?? ticket.stateId;
    return {
      kind: 'refused',
      rule: REFUSAL_RULES.closeRequiresTerminal,
      reason: `A ticket can only be closed from a terminal state; "${stateName}" is not one.`,
    };
  }
  // E6-8 (2026-09-21): `checks/close.ts` refuses a close over open children
  // — the parent-terminal invariant at its last door. Mirrored here with the
  // same discipline gate 3 gives the transition path: `childrenOf` answers
  // with the children this client has SEEN, so only a vouched-complete set
  // may decide, and an unvouched one defers rather than announcing a close
  // the server refuses. A refusal from a vouched open child reads only
  // server-served `stateCategory`, which is this module's definition of one.
  if (!cache.hasCompleteChildren(ticket.id)) return notEvaluated();
  const openCount = cache.childrenOf(ticket.id).filter((child) => child.stateCategory !== 'terminal').length;
  if (openCount > 0) {
    return {
      kind: 'refused',
      rule: REFUSAL_RULES.parentTerminal,
      reason: `This ticket cannot be closed while ${openCount} of its child tickets ${openCount === 1 ? 'is' : 'are'} still open.`,
    };
  }
  return { kind: 'passed' };
}

/** `ticket.reopened`'s only condition is the flag itself, which this cache already holds. */
function precheckTicketReopened(submitted: SubmittedEvent, cache: ClientStateCache): PrecheckResult {
  const parsed = ticketReopenedPayload.safeParse(submitted.payload);
  if (!parsed.success) return notEvaluated();
  const ticket = cache.getTicket(submitted.entity.id);
  if (ticket === undefined) return notEvaluated();
  if ((ticket.closed ?? null) === null) {
    return { kind: 'refused', rule: REFUSAL_RULES.notClosed, reason: 'This ticket is not closed.' };
  }
  return { kind: 'passed' };
}

/**
 * `ticket.ranked`, hand-rolled from `checks/rank.ts`'s order for the same
 * reason the closed pair above is: `evaluate.ts` is a flat switch with one
 * check per event type, so there is nothing to route through.
 *
 * It CAN answer `passed`, and the reason is the one `precheckTicketClosed`
 * gives: `checkTicketRanked` reads `stateId` — a cached fact — and consults a
 * workflow def only to spell a NAME inside a refusal it has already decided to
 * give. So once the ticket is cached, every fact the verdict rests on is one
 * this client actually holds, and a `passed` here is not an accept
 * manufactured from absence.
 *
 * An UNCACHED ticket stays `not-evaluated` rather than refusing: "I have never
 * heard of this ticket" is not "this ticket is not in the backlog", and a
 * refusal preview built on the client's incomplete view would be wrong on
 * exactly the tickets a sync has not yet delivered.
 */
function precheckTicketRanked(submitted: SubmittedEvent, cache: ClientStateCache): PrecheckResult {
  const parsed = ticketRankedPayload.safeParse(submitted.payload);
  if (!parsed.success) return notEvaluated();
  const ticket = cache.getTicket(submitted.entity.id);
  if (ticket === undefined) return notEvaluated();
  if (ticket.stateId !== BACKLOG_STATE_ID) {
    // Read ONLY for the name below, never for the verdict — an uncached def
    // degrades the name to the bare state id rather than turning a confident
    // refusal into `not-evaluated`, exactly as `checks/rank.ts`'s own
    // `def === null` branch does.
    const def = cache.getWorkflowDef(ticket.workflowId);
    const stateName =
      def === undefined ? ticket.stateId : statesWithBacklog(def).find((state) => state.id === ticket.stateId)?.name ?? ticket.stateId;
    return {
      kind: 'refused',
      rule: REFUSAL_RULES.rankRequiresBacklog,
      // The literal is typed twice — here and in `checks/rank.ts` — exactly as
      // the four reasons above are, and 13.604's extension is what holds the
      // two copies together. Do not "fix" one by importing the other: a shared
      // constant would make the agreement test vacuous.
      reason: `Only a backlog ticket can be ranked; this one is in "${stateName}".`,
    };
  }
  return { kind: 'passed' };
}

/**
 * The parent named by a hierarchy claim: `null` for "no parent", `undefined`
 * for "this payload does not say". Read through the SAME registered schemas the
 * server's door uses rather than a cast — `EventEnvelope.payload` is `unknown`,
 * and a cast asserting a field is there is exactly the thing that compiles
 * clean and lies at runtime.
 */
function claimedParentId(submitted: SubmittedEvent): string | null | undefined {
  if (submitted.type === 'ticket.created') {
    const parsed = ticketCreatedPayload.safeParse(submitted.payload);
    return parsed.success ? parsed.data.parentId : undefined;
  }
  const parsed = ticketReparentedPayload.safeParse(submitted.payload);
  return parsed.success ? parsed.data.newParentId : undefined;
}

/**
 * GATE 2, and it guards BOTH ends. `resolveStateIdForward` fetches every version
 * strictly between the one a state id is written in and the latest, then folds
 * through their stateMappings. A version this cache does not hold breaks the
 * fold, and that shows up three ways, in opposite directions: the ticket's own state
 * resolution refuses `stranded-state` for a ticket that is not stranded at all,
 * and four-eyes SKIPS every transition-log entry it cannot resolve, so a
 * missing version quietly lets one person make both halves of a move the server
 * would refuse. Both are cured by not evaluating.
 *
 * Log entries are never rewritten when a ticket migrates, so an entry may be
 * written in an older version than the ticket now sits in; the walk starts from
 * the earliest version anything the engine will read is written in. Entries
 * belonging to another workflow are skipped by the rule itself and need no
 * chain here.
 */
function versionChainIsCached(cache: ClientStateCache, ticket: TicketState, latest: WorkflowDef): boolean {
  // THE TOP OF THE CHAIN, and the cache holds the proof it is missing. A ticket
  // read after a republish names a version NEWER than the newest definition
  // here. `foldStateIdForward` runs zero iterations when `fromVersion` exceeds
  // `latest.version` and then merely containment-checks the id, so a state id
  // both versions happen to spell alike resolves CLEANLY against the wrong
  // vocabulary — and the engine evaluates the older definition's rules where
  // the server evaluates the newer one's. That is a `passed` for a move the
  // server refuses, built out of an absence the ticket itself announced. Not a
  // race curiosity: Plan 3 folds ticket rows forward on publish, and Plan 10
  // reuses this pre-check over a replica that may hold an old definition store
  // for the length of an offline period.
  if (ticket.workflowVersion > latest.version) return false;
  let earliest = ticket.workflowVersion;
  for (const entry of ticket.transitions) {
    if (entry.workflowId !== ticket.workflowId) continue;
    // The same gap on the log side, and it fails the other way: four-eyes SKIPS
    // an entry it cannot resolve forward, so an entry above the cached latest
    // disarms the rule silently instead of refusing. Load-bearing, and proven
    // so rather than argued: with this line removed, a v1-only cache answers
    // `passed` for a claim a server holding v1+v2 refuses `require-different-user`.
    if (entry.workflowVersion > latest.version) return false;
    if (entry.workflowVersion < earliest) earliest = entry.workflowVersion;
  }
  for (let version = earliest + 1; version < latest.version; version += 1) {
    if (cache.getWorkflowDef(ticket.workflowId, version) === undefined) return false;
  }
  return true;
}

/**
 * GATE 3. The parent-terminal invariant is the only rule that reads a set this
 * cache cannot bound: it counts the ticket's open children, and `childrenOf`
 * answers with the children this client happens to have seen. An unseen open
 * child therefore reads as no open child, the invariant passes, and the
 * pre-check would announce a move the server refuses. The engine consults the
 * child set ONLY when the destination is terminal, so the gate is scoped to
 * exactly that — every other accept is decided from state the cache holds
 * whole, except the one gate 5 below covers. A destination this definition
 * does not declare is unknown territory and gets the same treatment.
 */
function acceptRestsOnUnseenChildren(
  ticket: TicketState,
  def: WorkflowDef,
  payload: TicketTransitionedPayload,
  cache: ClientStateCache,
): boolean {
  // `statesWithBacklog(def)`, not `def.states` (backlog/closed spec §1.4,
  // 2026-09-17): backlog is a legal destination (Send to backlog) and is
  // never terminal, but `def.states` alone does not declare it — a miss here
  // used to fall through to the conservative `!hasCompleteChildren` branch
  // below for a destination that can never need a vouched child set at all.
  const toState = statesWithBacklog(def).find((state) => state.id === payload.to);
  if (toState !== undefined && toState.category !== 'terminal') return false;
  return !cache.hasCompleteChildren(ticket.id);
}

/**
 * GATE 5. The child's side of the same invariant (`transition.ts`, E3-19): a
 * ticket leaving a terminal state for a non-terminal one is refused while its
 * PARENT is terminal, and the engine resolves that parent through
 * `getEntityState`, which `contextFromCache` answers `null` for anything this
 * client has not seen. The engine treats an unresolved parent as no parent —
 * an absence is not a fact — so an uncached parent lets the move pass, and the
 * pre-check would announce a move the server refuses. Scoped to exactly the
 * move the engine asks the question on: a terminal origin, a non-terminal
 * destination, and a `parentId` to resolve. `statesWithBacklog`, as in gate 3,
 * because backlog is a legal, never-terminal destination that `def.states`
 * alone does not declare. An origin or destination this definition does not
 * declare is unknown territory and fails toward the gate, as in gate 3 —
 * `ticket.stateId` is read where the engine reads the forward-folded id
 * (`needsMembership` names the same drift), and a miss must not land on the
 * `passed` side.
 */
function acceptRestsOnUnseenParent(
  ticket: TicketState,
  def: WorkflowDef,
  payload: TicketTransitionedPayload,
  cache: ClientStateCache,
): boolean {
  if (ticket.parentId === null) return false;
  const states = statesWithBacklog(def);
  const fromState = states.find((state) => state.id === ticket.stateId);
  const toState = states.find((state) => state.id === payload.to);
  if (fromState !== undefined && fromState.category !== 'terminal') return false;
  if (toState !== undefined && toState.category === 'terminal') return false;
  return cache.getTicket(ticket.parentId) === undefined;
}

/**
 * Whether the `restrict-to` that refused could only have been decided by a
 * membership. Role criteria resolve against memberships that live server-side;
 * `assignee` and `userIds` are decidable from the snapshot and the claim, and
 * downgrading those would throw away the preview the feature exists for.
 *
 * The edge is selected the way the engine selects it — exact `from` first, the
 * from-any edge only as a fallback. It reads `ticket.stateId` where the engine
 * reads the forward-FOLDED one, and the two can differ. Usually the drift costs
 * a MISS, which returns true and defers. It can also HIT THE WRONG EDGE: a state
 * id dropped at one version and reintroduced at a later one is spelled the same
 * in two vocabularies, and if the edge found here carries an assignee-only
 * restrict-to while the edge the engine actually took carried roles, a
 * membership-dependent refusal is SHOWN rather than downgraded. That failure
 * lands on the refusing side — an over-eager preview on an advisory surface, and
 * never a `passed`, which is the line this module holds. It is left open and
 * named rather than papered over: closing it means folding the state id here
 * too, which is gate 2's business and belongs with it.
 */
function needsMembership(ticket: TicketState, def: WorkflowDef, payload: TicketTransitionedPayload): boolean {
  // `transitionsWithBacklog(def)`, with the same backlog-only Start rule the
  // engine applies (backlog/closed spec §1.1/§4, 2026-09-17): a wildcard edge
  // never resolves FROM backlog, so a ticket sitting there only ever matches
  // the universal Start edge — which, like every universal edge, carries no
  // rules at all, so this can never manufacture a membership requirement out
  // of a wildcard that was never backlog's to take.
  const edges = transitionsWithBacklog(def);
  const transition =
    ticket.stateId === BACKLOG_STATE_ID
      ? edges.find((edge) => edge.from === BACKLOG_STATE_ID && edge.to === payload.to)
      : edges.find((edge) => edge.from === ticket.stateId && edge.to === payload.to) ??
        edges.find((edge) => edge.from === '*' && edge.to === payload.to);
  if (transition === undefined) return true;
  return transition.rules.some((rule) => rule.kind === 'restrict-to' && (rule.roles?.length ?? 0) > 0);
}

function titleOf(ticket: TicketState): string {
  const value = ticket.fields.title?.value;
  return typeof value === 'string' && value.length > 0 ? `"${value}"` : `Ticket ${ticket.id}`;
}
