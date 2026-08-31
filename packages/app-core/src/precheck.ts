import { REFUSAL_RULES, evaluateEvent, type EngineContext } from '@gisik-nokma/rule-engine';
import {
  ticketCreatedPayload,
  ticketReparentedPayload,
  ticketTransitionedPayloadSchema,
  type EventEnvelope,
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
 * pre-check may never manufacture a `passed` out of ABSENCE. Three gates keep
 * it, and each names the absence it closes:
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
 *     that is the one way an accept can be conjured from nothing.
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

  if (submitted.type === 'ticket.created' || submitted.type === 'ticket.reparented') {
    return precheckParentTerminal(submitted, cache);
  }

  // Every other type: the shared engine has no case for it, so an accept from
  // it would mean only "this engine had nothing to say", which is not a
  // pre-check result — it is the absence of one.
  if (submitted.type !== 'ticket.transitioned') return notEvaluated();

  const ticket = cache.getTicket(submitted.entity.id);
  if (ticket === undefined) return notEvaluated();
  const def = cache.getWorkflowDef(ticket.workflowId);
  if (def === undefined) return notEvaluated();
  if (!versionChainIsCached(cache, ticket, def)) return notEvaluated();

  const evaluate = deps.evaluate ?? evaluateEvent;
  const verdict = await evaluate(completeForPrecheck(submitted, deps.now), contextFromCache(cache));
  // The engine's own door for this payload, asked again for the two questions
  // the verdict alone cannot answer: which state is being entered, and which
  // edge carries the rule that refused.
  const payload = ticketTransitionedPayloadSchema.safeParse(submitted.payload);

  if (!verdict.refused) {
    if (!payload.success) return notEvaluated();
    if (acceptRestsOnUnseenChildren(ticket, def, payload.data, cache)) return notEvaluated();
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
 * The cache seen as the engine sees any store. It answers only what it holds
 * and never invents: an uncached entity is `null`, and the gates in
 * `precheckEvent` — not this adapter — decide when that absence makes the whole
 * verdict untrustworthy. `getChildrenStates` is the one method whose honest
 * answer ("the children I have seen") is not the one the caller wants ("all of
 * them"), which is why gate 3 exists above it.
 */
export function contextFromCache(cache: ClientStateCache): EngineContext {
  return {
    async getEntityState(kind, id) {
      if (kind !== 'ticket') return null;
      return cache.getTicket(id) ?? null;
    },
    async getChildrenStates(ticketId) {
      return cache.childrenOf(ticketId);
    },
    async getWorkflowDef(workflowId, version) {
      return cache.getWorkflowDef(workflowId, version) ?? null;
    },
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
 */
function precheckParentTerminal(submitted: SubmittedEvent, cache: ClientStateCache): PrecheckResult {
  const parentId = claimedParentId(submitted);
  // The payload is not the shape the door admits, so nothing can be read off it
  // — including whether a parent is named at all.
  if (parentId === undefined) return notEvaluated();
  if (parentId === null) return { kind: 'passed' };

  const parent = cache.getTicket(parentId);
  if (parent === undefined) return notEvaluated();
  if (parent.stateCategory !== 'terminal') return { kind: 'passed' };

  if (submitted.type === 'ticket.reparented') {
    const moving = cache.getTicket(submitted.entity.id);
    if (moving === undefined) return notEvaluated();
    if (moving.stateCategory === 'terminal') return { kind: 'passed' };
  }

  return {
    kind: 'refused',
    rule: PARENT_TERMINAL_RULE,
    reason: `${titleOf(parent)} is in a terminal state; it must reopen because it is acquiring live work.`,
  };
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
 * whole. A destination this definition does not declare is unknown territory
 * and gets the same treatment.
 */
function acceptRestsOnUnseenChildren(
  ticket: TicketState,
  def: WorkflowDef,
  payload: TicketTransitionedPayload,
  cache: ClientStateCache,
): boolean {
  const toState = def.states.find((state) => state.id === payload.to);
  if (toState !== undefined && toState.category !== 'terminal') return false;
  return !cache.hasCompleteChildren(ticket.id);
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
  const transition =
    def.transitions.find((edge) => edge.from === ticket.stateId && edge.to === payload.to) ??
    def.transitions.find((edge) => edge.from === '*' && edge.to === payload.to);
  if (transition === undefined) return true;
  return transition.rules.some((rule) => rule.kind === 'restrict-to' && (rule.roles?.length ?? 0) > 0);
}

function titleOf(ticket: TicketState): string {
  const value = ticket.fields.title?.value;
  return typeof value === 'string' && value.length > 0 ? `"${value}"` : `Ticket ${ticket.id}`;
}
