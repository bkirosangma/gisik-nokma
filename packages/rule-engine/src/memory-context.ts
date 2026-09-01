import type {
  EventEnvelope,
  PublishedWorkflowDef,
  TicketState,
  TicketStateDeps,
  TicketTypeDef,
} from '@gisik-nokma/domain';
import {
  TICKET_EVENT_TYPES,
  applyTicketEvent,
  foldTicketToWorkflowVersion,
  ticketTypeDefSchema,
  workflowDefinedPayloadSchema,
} from '@gisik-nokma/domain';
import type { EngineContext } from './engine.js';

/**
 * A SECOND in-memory EngineContext. It does NOT replace `buildInMemoryContext`
 * in `./fixtures/harness.js`, and merging the two would break the suite three
 * ways: 61 fixtures and 30 harness tests bind to that one, its prior-event
 * dialect is deliberately not the domain schemas (`{ field }` not `{ fieldId }`,
 * non-ULID ids, harness-only `stateId`/`stateCategory` overrides for planting
 * states the ledger could not produce), and it carries `fx.memberships`, which a
 * `(seedWorkflows, events)` signature cannot receive. Both contexts stay
 * (pre-flight A15 / BA-6 / C-14).
 *
 * What this one adds is the SHARED REDUCER. Every ticket event here goes through
 * `applyTicketEvent`, the same function `proj_tickets` and Plan 10's offline
 * replica fold with, so a rule cannot answer one way in a unit test and another
 * on the server. The harness hand-writes its fold; this one cannot drift from
 * production because it is production's.
 *
 * Where the two must agree, they agree BY CONSTRUCTION and the agreement is
 * copied deliberately: `getChildrenStates` returns DIRECT children only, and
 * `getWorkflowDef` answers an exact version when given one and the latest
 * otherwise — both mirrored from `harness.ts:191-197`. If these two contexts
 * disagreed about what the same rule sees, the promise the shared fixture suite
 * exists to keep would already be void.
 */
export type MemoryContext = EngineContext & {
  tickets: Map<string, TicketState>;
  ticketTypes: Map<string, TicketTypeDef>;
  /** Latest version per workflow id — highest `version`, not last published. */
  workflows: Map<string, PublishedWorkflowDef>;
  /** Every version seen, ascending — what the refresh-on-publish fold walks. */
  workflowVersions: Map<string, PublishedWorkflowDef[]>;
};

/**
 * Folds already-accepted events into an in-memory EngineContext.
 *
 * NO EVALUATION HAPPENS HERE. These events are the past — the ledger as it
 * already stands. Only a CANDIDATE event goes through `evaluateEvent`, by the
 * caller, against the context this returns. That is why the reducer is allowed
 * to throw on what the engine is contracted to refuse at the door: reaching one
 * of those states in a replay means the history it was handed is broken.
 *
 * Seeds are the workflows that already exist before the first event. They go
 * through the same accumulation as a `workflow.defined`, so a seeded version is
 * findable by exact number and two seeds of one workflow do not lose the older
 * one.
 */
export function buildMemoryContext(
  seedWorkflows: readonly PublishedWorkflowDef[],
  events: readonly EventEnvelope[],
): MemoryContext {
  const workflows = new Map<string, PublishedWorkflowDef>();
  const workflowVersions = new Map<string, PublishedWorkflowDef[]>();
  const ticketTypes = new Map<string, TicketTypeDef>();
  const tickets = new Map<string, TicketState>();

  /**
   * `getWorkflow` is a PURE BY-ID LOOKUP, per the contract on `TicketStateDeps`
   * (Ruling P1): a `ticket.workflow_rebound` asks for the workflow named in its
   * own payload, which is not the one the ticket is on. Serving "the ticket's
   * workflow" and nothing else would resolve null and throw on the very event
   * the migration exists for.
   */
  const deps: TicketStateDeps = {
    getTicketType: (typeId) => ticketTypes.get(typeId),
    getWorkflow: (workflowId) => workflows.get(workflowId),
  };

  /** An exact version of one workflow, or null — `foldStateIdForward`'s contract. */
  function versionOf(workflowId: string, version: number): PublishedWorkflowDef | null {
    return workflowVersions.get(workflowId)?.find((def) => def.version === version) ?? null;
  }

  function recordWorkflow(def: PublishedWorkflowDef): void {
    const seen = workflowVersions.get(def.id) ?? [];
    workflowVersions.set(
      def.id,
      [...seen.filter((other) => other.version !== def.version), def].sort((a, b) => a.version - b.version),
    );
    // Latest is the HIGHEST version, mirroring the harness's `latestOf`
    // (`harness.ts:161-167`), not "whatever arrived last" — a re-publish of an
    // older version must not become the answer to "the latest". `>=` so that a
    // second definition of the SAME version replaces the first, which is what
    // the version list above does too: the exact-version answer and the latest
    // answer must not disagree with each other.
    const latest = workflows.get(def.id);
    if (latest === undefined || def.version >= latest.version) workflows.set(def.id, def);
  }

  for (const seed of seedWorkflows) recordWorkflow(seed);

  for (const env of events) {
    if (env.type === 'workflow.defined') {
      // Parsed with the PUBLISHED payload schema, never `workflowDefSchema`, and
      // never an `as` cast. Zod strips undeclared keys, so the plain definition
      // schema would silently delete `stateMapping` — and the refresh below
      // would then throw "dropped with no stateMapping entry" for every ticket
      // standing in a state the new version drops, which is exactly the case the
      // mapping exists to cover.
      const def = workflowDefinedPayloadSchema.parse(env.payload);
      recordWorkflow(def);
      // Refresh on publish (design decision 10). The server's proj_tickets folds
      // its rows here, so this context must too, through the SAME domain
      // function — otherwise the shared fixture suite and the server disagree
      // about a ticket's category the moment a version re-categorises a state,
      // and `getChildrenStates` hands the parent-terminal invariant stale
      // categories on one side and folded ones on the other. That single
      // disagreement is what this suite exists to make impossible.
      //
      // Only the tickets on THIS workflow: another workflow's version says
      // nothing about them, and folding them against it would walk their state
      // ids through a vocabulary they were never written in.
      for (const [id, ticket] of tickets) {
        if (ticket.workflowId !== def.id) continue;
        tickets.set(id, foldTicketToWorkflowVersion(ticket, def, (version) => versionOf(def.id, version)));
      }
    } else if (env.type === 'ticket-type.defined') {
      // Last definition wins — types are events, and a later definition replaces
      // the earlier one. That is what makes rank RE-definition, and therefore
      // the hierarchy cycle a rank change can create, reachable at all.
      const def = ticketTypeDefSchema.parse(env.payload);
      ticketTypes.set(def.id, def);
    } else if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) {
      tickets.set(env.entity.id, applyTicketEvent(tickets.get(env.entity.id), env, deps));
    }
    // Other event kinds (membership, visibility, …) belong to other plans and
    // shape no ticket state. They pass through rather than throwing, so a
    // fixture may carry them without this context claiming to understand them.
  }

  return {
    tickets,
    ticketTypes,
    workflows,
    workflowVersions,
    getEntityState: async (kind, id) => {
      if (kind === 'ticket') return tickets.get(id) ?? null;
      // Identity ONLY, exactly as the server answers: `'ticket-type'` is an
      // `OtherEntityState` in the domain union — `{ kind, id }` — and controller
      // ruling P3 keeps it that way. A rank arrives through `getTicketTypeDef`
      // below. Serving a definition through this door would make a rule pass
      // here and find `rank` undefined on the server.
      if (kind === 'ticket-type') return ticketTypes.has(id) ? { kind, id } : null;
      return null;
    },
    // DIRECT children only, mirroring `harness.ts:191-193`. The parent-terminal
    // invariant counts the children a parent owns, not its descendants.
    getChildrenStates: async (ticketId) => [...tickets.values()].filter((ticket) => ticket.parentId === ticketId),
    // An explicit version is answered with THAT version; without one, the
    // latest. Mirrors `harness.ts:194-197`. The engine's forward walk fetches
    // intermediates by exact version, and answering "latest" to that question is
    // a wrong answer that looks like an answer.
    // `scope` is UNREAD here, and that is honest rather than lazy: this context
    // is built from ONE workspace's events by its caller, so it has no second
    // tenancy to keep apart and no predicate to apply. It takes the parameter
    // because the SERVER needs it (ruling P14) and one signature across the four
    // implementations is what stops them drifting — which is also why no unit
    // test in this package can pin P14's fix, and why its test home is
    // `apps/server/test/engine-context.test.ts`.
    getWorkflowDef: async (_scope, workflowId, version) =>
      (version === undefined ? (workflows.get(workflowId) ?? null) : versionOf(workflowId, version)),
    /** `scope` UNREAD for the same reason as `getWorkflowDef` directly above. */
    getTicketTypeDef: async (_scope, typeId) => ticketTypes.get(typeId) ?? null,
  };
}
