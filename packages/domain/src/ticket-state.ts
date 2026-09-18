import type { EventEnvelope } from './envelope.js';
// FieldClaim and TicketState are defined by Plan 2's Task 2 in entity-state.ts
// (coordination doc §4): this reducer PRODUCES the type, it does not redefine
// it. Deliberately NOT re-exported from this module — the package index already
// star-exports entity-state, and a second export of the same names collides.
import type { FieldClaim, TicketState } from './entity-state.js';
import {
  ticketAssignedPayload,
  ticketClosedPayload,
  ticketCollaboratorPayload,
  ticketCreatedPayload,
  ticketFieldSetPayload,
  ticketRankedPayload,
  ticketReopenedPayload,
  ticketReparentedPayload,
  ticketWorkflowReboundPayload,
} from './events/ticket-events.js';
import type { TicketTypeDef } from './ticket-types.js';
// `ticket.transitioned`'s schema lives in workflow.ts, not with the rest of the
// ticket vocabulary: Plan 2 shipped it there because the engine parses it, and
// events/ticket-events.ts says so in its own header. Its destination field is
// `to`. The transition LOG ENTRY separately and correctly spells `toStateId`.
// Both spellings are real; they are not unified (coordination doc,
// O-transitioned-payload).
//
// `foldStateIdForward` is THE ONE VERSION WALK for the monorepo, and it is
// imported RELATIVELY. `@gisik-nokma/domain` resolves to this package's own
// `dist/`, so a source file here importing its own package root is a build-order
// cycle, not an import.
import {
  BACKLOG_STATE_ID,
  foldStateIdForward,
  ticketTransitionedPayloadSchema,
  type WorkflowDef,
} from './workflow.js';
import { stateCategoryOf } from './workflow-helpers.js';

/**
 * What the reducer needs looked up, and nothing more.
 *
 * `getWorkflow(workflowId)` is a PURE BY-ID LOOKUP: the caller does not
 * pre-select which workflow the reducer is about to want. That is a contract,
 * not an implementation detail. A `ticket.workflow_rebound` asks for the
 * payload's `toWorkflowId` — a workflow the ticket is not on yet and which no
 * caller inspecting only the ticket's current row would think to fetch — so a
 * loader that serves "the ticket's workflow" and nothing else resolves null and
 * this reducer throws on the very event the migration exists for. Every loader
 * (the proj_tickets projection, the fixture context, Plan 10's replica) must
 * serve ANY id asked for. The reducer stays the only place that knows which id
 * an event needs, because the event is the only thing that knows.
 */
export type TicketStateDeps = {
  getTicketType(typeId: string): TicketTypeDef | undefined;
  getWorkflow(workflowId: string): WorkflowDef | undefined;
};

/**
 * The event types this reducer folds — THIRTEEN of the SIXTEEN registered against
 * `entityKind: 'ticket'`, not all of them. **This is not the ticket-entity
 * set**, and reading it as one has already cost a defect: `visibility.set`,
 * `claim.contested` and `claim.contested_resolved` are filed against a ticket
 * and are absent here on purpose, because none of them moves head state.
 * Anything that iterates a ticket's stream and needs completeness — the replica
 * bootstrap's backfill list is the live example (`sync-routes.ts`) — must
 * account for those three separately; a reader who believed this list was
 * exhaustive dropped `visibility.set` from a replica's payload and the omission
 * was invisible for a whole task.
 *
 * `ticket-type.defined` is deliberately absent for a different reason: it is
 * about a ticket TYPE, has its own entity kind and its own stream, and changing
 * a type's workflow binding does not move any existing ticket (owner decision
 * 2026-08-26: a ticket pins the workflow it was created under).
 */
export const TICKET_EVENT_TYPES = [
  'ticket.created',
  'ticket.transitioned',
  'ticket.assigned',
  'ticket.collaborator_added',
  'ticket.collaborator_removed',
  'ticket.field_set',
  'ticket.reparented',
  'ticket.workflow_rebound',
  'ticket.closed',
  'ticket.reopened',
  'ticket.ranked',
  'comment.added',
  'attachment.added',
] as const;

function claim(value: unknown, env: EventEnvelope): FieldClaim {
  return { value, actorId: env.actorId, clientTime: env.clientTime, serverTime: env.serverTime };
}

/**
 * Pure fold of one ACCEPTED ticket event into head state. Both the proj_tickets
 * projection and the fixture suite's in-memory context use this one function, so
 * client and server cannot quietly disagree about what a ticket is.
 *
 * It folds only events the engine has already accepted (projections consume the
 * ledger; fixtures fold `priorEvents`), so it THROWS on the states the engine is
 * contracted to refuse at the door — an event for a never-created ticket, an
 * unknown type, an unresolvable workflow. Reaching one of those in replay means
 * ledger integrity is broken; degrading silently would put a ticket in a status
 * nobody claimed, which is what invariant 4 forbids.
 */
export function applyTicketEvent(
  state: TicketState | undefined,
  env: EventEnvelope,
  deps: TicketStateDeps,
): TicketState {
  if (env.type === 'ticket.created') {
    const p = ticketCreatedPayload.parse(env.payload);
    const type = deps.getTicketType(p.typeId);
    if (!type) {
      throw new Error(
        `applyTicketEvent: unknown ticket type "${p.typeId}" — the engine must refuse ticket.created before it reaches a projection`,
      );
    }
    const wf = deps.getWorkflow(type.workflowId);
    if (!wf) {
      throw new Error(
        `applyTicketEvent: workflow "${type.workflowId}" is not defined — the engine must refuse ticket.created before it reaches a projection`,
      );
    }
    // Spec §1.3: `start === 'backlog'` → the universal state; anything else —
    // `'focus'`, or the field absent on an event older than it — the
    // workflow's initial state, which is what every v1 event meant.
    const bornIn = p.start === 'backlog' ? BACKLOG_STATE_ID : wf.initialStateId;
    const category = stateCategoryOf(wf, bornIn);
    if (!category) {
      throw new Error(`applyTicketEvent: workflow "${wf.id}" has no state "${bornIn}"`);
    }
    return {
      kind: 'ticket',
      id: env.entity.id,
      workspaceId: env.workspaceId,
      projectId: p.projectId,
      typeId: p.typeId,
      parentId: p.parentId,
      // The ticket pins the workflow it was created under, by id AND by the
      // version in force at creation — a later re-point of the TYPE's binding
      // moves nothing that already exists.
      workflowId: type.workflowId,
      workflowVersion: wf.version,
      stateId: bornIn,
      stateCategory: category,
      assigneeId: null,
      collaboratorIds: [],
      fields: { title: claim(p.title, env) },
      transitions: [],
      closed: null,
      // `rank: null` — creation writes it, and this is the decision Task 1
      // deliberately deferred (its note here said so, because
      // `rowToTicketState` builds a `TicketState` from COLUMNS and there was no
      // `rank` column yet). Task 3 adds the column
      // (`migrations/1789200000000_proj-tickets-rank.sql`) and both sides move
      // together, which is what makes the write safe now and made it a red rig
      // before.
      //
      // The other option — leaving the key ABSENT until `ticket.ranked` — was
      // measured, not merely weighed, and it is unavailable: the dual-client
      // rig compares whole `TicketState`s with `toEqual`
      // (`apps/server/test/dual-client/scenarios.test.ts:203`,
      // `rig.test.ts:92`/`:315`), so a reducer that omits forces
      // `rowToTicketState` to omit too; an omitting `rowToTicketState` then puts
      // an ABSENT key on the ticket-detail wire for every unranked ticket, and
      // `mapRank` would have to tolerate that — which is precisely the shape
      // case 13.603's second `it` exists to forbid, and how the `closed` flag
      // stayed dead in production for a whole task.
      //
      // Spec §8.1 states the same thing in the domain's own words ("`null` =
      // never ranked"), and the plan's Global Constraints spell out the rule:
      // `TicketState.rank?` is optional on the DOMAIN type only, because
      // hundreds of test literals predate it, while "every producer sets them".
      // This is that producer.
      rank: null,
    };
  }

  if (!state) {
    throw new Error(
      `applyTicketEvent: ${env.type} for ticket ${env.entity.id} that was never created`,
    );
  }

  switch (env.type) {
    case 'ticket.transitioned': {
      const p = ticketTransitionedPayloadSchema.parse(env.payload);
      const wf = deps.getWorkflow(state.workflowId);
      if (!wf) {
        throw new Error(
          `applyTicketEvent: workflow "${state.workflowId}" vanished — replay integrity is broken`,
        );
      }
      const category = stateCategoryOf(wf, p.to);
      if (!category) {
        throw new Error(`applyTicketEvent: workflow "${wf.id}" has no state "${p.to}"`);
      }
      return {
        ...state,
        stateId: p.to,
        stateCategory: category,
        workflowVersion: wf.version,
        // The entry's `workflowId`/`workflowVersion` name the vocabulary its
        // `toStateId` is written in — the ticket's own pair at the moment the
        // event applied, AFTER the forward fold performed on the line above. So
        // the version is `wf.version` (the def `p.to` was just resolved
        // against), never the pre-spread `state.workflowVersion`, which is where
        // the ticket sat BEFORE this fold. require-different-user skips entries
        // from a different workflow and walks the rest forward from this version
        // through `stateMapping` before comparing, so neither a remapped state
        // nor a migration can disarm four-eyes.
        //
        // `seq` is the envelope's, and it is load-bearing: RDU sorts a copy of
        // the entries by ascending `seq` at the point of use rather than
        // trusting array order (Plan 2 consequences §4). A wrong `seq` here
        // silently mis-sorts the log instead of being ignored.
        transitions: [
          ...state.transitions,
          {
            toStateId: p.to,
            actorId: env.actorId,
            seq: env.seq,
            workflowId: state.workflowId,
            workflowVersion: wf.version,
          },
        ],
      };
    }
    case 'ticket.assigned': {
      const p = ticketAssignedPayload.parse(env.payload);
      return { ...state, assigneeId: p.assigneeId };
    }
    case 'ticket.collaborator_added': {
      const p = ticketCollaboratorPayload.parse(env.payload);
      return state.collaboratorIds.includes(p.userId)
        ? state
        : { ...state, collaboratorIds: [...state.collaboratorIds, p.userId] };
    }
    case 'ticket.collaborator_removed': {
      const p = ticketCollaboratorPayload.parse(env.payload);
      return { ...state, collaboratorIds: state.collaboratorIds.filter((id) => id !== p.userId) };
    }
    case 'ticket.field_set': {
      const p = ticketFieldSetPayload.parse(env.payload);
      // A clearing claim is a claim: `value: null` keeps the clearer's id and
      // both clocks, so "who emptied this, and when" survives.
      //
      // `claim(p.value, env)`, with no `?? null`. The coalesce this line used to
      // carry was how an ABSENT value became a clearing claim nobody made:
      // `z.unknown()` did not require the key, so `{ fieldId: 'title' }` parsed
      // clean and `undefined ?? null` wrote a null. The schema now refuses an
      // absent or `undefined` value outright (`events/ticket-events.ts`), so the
      // `parse` above throws before this line and the only `null` that reaches
      // it is one somebody claimed — `null ?? null` is identity. Keeping the
      // coalesce would state the defect as the design, and `claim` takes
      // `unknown`, so it was never load-bearing for typing either.
      return { ...state, fields: { ...state.fields, [p.fieldId]: claim(p.value, env) } };
    }
    case 'ticket.reparented': {
      const p = ticketReparentedPayload.parse(env.payload);
      return { ...state, parentId: p.newParentId };
    }
    case 'ticket.workflow_rebound': {
      // The one payload in this vocabulary whose destination field genuinely IS
      // `toStateId` — the outgoing and incoming workflows are unrelated graphs,
      // so the claim names where the ticket lands rather than leaving it to be
      // guessed (events/ticket-events.ts:151-156).
      const p = ticketWorkflowReboundPayload.parse(env.payload);
      const wf = deps.getWorkflow(p.toWorkflowId);
      if (!wf) {
        throw new Error(
          `applyTicketEvent: workflow "${p.toWorkflowId}" is not defined — the engine must refuse ticket.workflow_rebound before it reaches a projection`,
        );
      }
      const category = stateCategoryOf(wf, p.toStateId);
      if (!category) {
        throw new Error(`applyTicketEvent: workflow "${wf.id}" has no state "${p.toStateId}"`);
      }
      // The transition log is NOT appended to, and existing entries are NOT
      // rewritten. A migration is an attributed claim of its own, not a move
      // anybody performed, so four-eyes has nobody to differ from on the first
      // guarded move in the new workflow — and the entries left behind keep the
      // workflowId they were recorded under, so require-different-user filters
      // them out instead of walking them through a chain they were never
      // written in. Rewriting them would destroy the very fact that filter
      // reads.
      return {
        ...state,
        workflowId: p.toWorkflowId,
        workflowVersion: wf.version,
        stateId: p.toStateId,
        stateCategory: category,
      };
    }
    case 'ticket.closed': {
      // Terminal-only is the engine's door to police (Plan 3's refusal layer),
      // not the reducer's: this fold only replays what the engine already
      // accepted, per this function's own header. `stateId` is untouched — the
      // flag and the state are orthogonal, on purpose (spec §1.2).
      ticketClosedPayload.parse(env.payload);
      return { ...state, closed: { actorId: env.actorId, at: env.serverTime } };
    }
    case 'ticket.reopened': {
      // The explicit reopen (spec §1.2): clears the flag, moves nothing else.
      ticketReopenedPayload.parse(env.payload);
      return { ...state, closed: null };
    }
    case 'ticket.ranked': {
      // Backlog-only is the engine's door (checkTicketRanked); this fold only
      // replays what the engine accepted, per this function's header. `stateId`
      // is untouched, for the same reason it is on the closed pair: a reorder
      // is not a status change, and letting it look like one would put a move
      // nobody made into the transition log four-eyes reads.
      const p = ticketRankedPayload.parse(env.payload);
      return { ...state, rank: p.rank };
    }
    case 'comment.added':
    case 'attachment.added':
      // Neither adds to head state: comments and attachments are ledger entries
      // the history endpoint renders, not fields anything folds. This is
      // precisely why "a Drive reference cannot be evidence" is NOT a
      // rule-engine rule — `TicketState` never carries attachments, so no pure
      // rule has anywhere to read an attachment's kind from. That gate is Plan
      // 7's unconditionally (pre-flight ruling 5, 2026-08-28, settling the
      // "whichever lands second" clause Plan 2 left open): it lives inside the
      // ingest transaction, where the attachments table and the ledger are both
      // in reach.
      return state;
    default:
      throw new Error(`applyTicketEvent: not a ticket event: ${env.type}`);
  }
}

/**
 * Fold ONE ticket's head state forward onto a newly published workflow version
 * (design decision 10, owner decision 2026-08-26). The ONE implementation of
 * refresh-on-publish: the proj_tickets projection, the fixture suite's
 * in-memory context, and Plan 10's offline replica all call this. Two of the
 * three would otherwise drift, and the replica — which never sees the server's
 * pg projections — would keep stale categories forever.
 *
 * `getVersion` resolves an exact intermediate version of the SAME workflow and
 * returns `null` for one it cannot supply, matching `foldStateIdForward`'s
 * contract. It is consulted only for versions strictly between the ticket's and
 * the target's.
 *
 * The `>=` early return is NOT dead code on the live path's account. Plan 1's
 * canonical replay order is (entity_kind, entity_id, seq), so on a rebuild every
 * `ticket` event replays before every `workflow` event and rows arrive here
 * already at their as-of version; the older publishes then land last and would
 * drag them backwards. Skipping makes the fold monotone, so the last
 * `workflow.defined` puts every row at the same place whatever order the ledger
 * was replayed in. Do not remove it.
 */
export function foldTicketToWorkflowVersion(
  state: TicketState,
  target: WorkflowDef,
  getVersion: (version: number) => WorkflowDef | null,
): TicketState {
  if (state.workflowVersion >= target.version) return state;

  // Pre-check the chain so that a hole reports as a hole. `foldStateIdForward`
  // folds a missing definition into the same `ok: false` as an unmapped drop,
  // and those are different faults: one is a gap in the ledger, the other a
  // publish that should have been refused. Naming the wrong one sends whoever
  // reads the error hunting in the wrong place.
  for (let version = state.workflowVersion + 1; version < target.version; version += 1) {
    if (!getVersion(version)) {
      throw new Error(
        `foldTicketToWorkflowVersion: workflow "${state.workflowId}" version ${version} is missing — the version chain has a hole and ticket ${state.id} cannot be walked forward`,
      );
    }
  }

  const resolved = foldStateIdForward(state.stateId, state.workflowVersion, target, getVersion);
  if (!resolved.ok) {
    // Publishing refuses unmapped drops (Plan 2), so this is only reachable on a
    // corrupted or hand-planted store. The honest answer is a loud failure,
    // never a guessed state — a ticket whose status we invented is exactly what
    // invariant 4 forbids.
    //
    // The message names the id at the point the chain BROKE and no version
    // beside it, because `foldStateIdForward` reports the break-point id, not
    // the one it started from (workflow.ts:99-101): on a chain longer than two
    // that id can belong to a version the ticket never sat in, and naming a
    // state and a version that never coexisted is worse than naming neither.
    // Same reasoning, same wording discipline as the engine's stranded-state
    // refusal (coordination doc, Plan 2 consequences §1).
    throw new Error(
      `foldTicketToWorkflowVersion: ticket ${state.id} cannot be folded forward to workflow "${target.id}" version ${target.version} — state "${resolved.unmappedStateId}" is dropped with no stateMapping entry`,
    );
  }

  const category = stateCategoryOf(target, resolved.stateId);
  if (!category) {
    throw new Error(
      `foldTicketToWorkflowVersion: workflow "${target.id}" version ${target.version} has no state "${resolved.stateId}"`,
    );
  }

  return {
    ...state,
    stateId: resolved.stateId,
    stateCategory: category,
    workflowVersion: target.version,
    // `transitions` is deliberately untouched. Each entry's workflowId and
    // workflowVersion name the vocabulary its `toStateId` is written in;
    // rewriting them would destroy the evidence require-different-user walks
    // forward to find an earlier performer (Plan 2 Task 11, coordination doc
    // 2026-08-26). A fold moves the ticket's current state, never the history
    // that got it there.
  };
}
