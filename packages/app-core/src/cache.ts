import type { EventEnvelope, TicketState, WorkflowDef } from '@gisik-nokma/domain';

/**
 * A best-effort snapshot of what this client has SEEN. It exists only to fuel
 * the local rule-engine pre-check (instant, named-reason refusal previews).
 * It is never rendered as truth and never substitutes for the server's
 * verdict: missing coverage downgrades the pre-check to "not evaluated" — it
 * never fakes state, and any stream event touching an entity drops the
 * snapshot rather than patching it optimistically.
 *
 * Nothing reads this cache but `precheckEvent`. `withCacheFeed` keeps it fed
 * from ordinary reads and never serves from it, so a view asking the
 * `DataSource` a question always gets the source's answer.
 */
export type ClientStateCache = {
  upsertTicket(state: TicketState): void;
  upsertWorkflowDef(def: WorkflowDef): void;
  getTicket(ticketId: string): TicketState | undefined;
  getWorkflowDef(workflowId: string, version?: number): WorkflowDef | undefined;
  /** DIRECT children among cached tickets of one parent — never necessarily all of them. */
  childrenOf(parentId: string): TicketState[];
  /**
   * Record a parent's COMPLETE direct-child set: these children and no others.
   * The children are upserted and any cached ticket still claiming this parent
   * that the vouch does not name is evicted, so `childrenOf(parentId)` is
   * afterwards exactly the vouched set.
   *
   * This exists because `childrenOf` alone cannot tell "no children" from "no
   * children I have seen", and the parent-terminal invariant reads the
   * difference as a verdict: a partial child set looks to the rule engine like
   * a parent with nothing open under it, and the pre-check would then pass a
   * move the server refuses. A vouch is the only thing that distinguishes them,
   * and nothing vouches by accident.
   */
  markChildrenComplete(parentId: string, children: TicketState[]): void;
  /** Whether a caller has vouched for this parent's whole direct-child set since the last ticket event. */
  hasCompleteChildren(parentId: string): boolean;
  noteEvent(envelope: EventEnvelope): void;
};

export function createClientStateCache(): ClientStateCache {
  const tickets = new Map<string, TicketState>();
  const workflows = new Map<string, Map<number, WorkflowDef>>();
  const completeChildren = new Set<string>();
  return {
    upsertTicket(state) {
      tickets.set(state.id, state);
    },
    upsertWorkflowDef(def) {
      const versions = workflows.get(def.id) ?? new Map<number, WorkflowDef>();
      versions.set(def.version, def);
      workflows.set(def.id, versions);
    },
    getTicket: (ticketId) => tickets.get(ticketId),
    getWorkflowDef(workflowId, version) {
      const versions = workflows.get(workflowId);
      if (versions === undefined) return undefined;
      if (version !== undefined) return versions.get(version);
      let latest: WorkflowDef | undefined;
      for (const def of versions.values()) {
        if (latest === undefined || def.version > latest.version) latest = def;
      }
      return latest;
    },
    childrenOf(parentId) {
      return [...tickets.values()].filter((ticket) => ticket.parentId === parentId);
    },
    markChildrenComplete(parentId, children) {
      const named = new Set(children.map((child) => child.id));
      for (const ticket of [...tickets.values()]) {
        if (ticket.parentId === parentId && !named.has(ticket.id)) tickets.delete(ticket.id);
      }
      for (const child of children) tickets.set(child.id, child);
      completeChildren.add(parentId);
    },
    hasCompleteChildren: (parentId) => completeChildren.has(parentId),
    noteEvent(envelope) {
      if (envelope.entity.kind === 'ticket') {
        tickets.delete(envelope.entity.id);
        // EVERY vouch dies here, not just this ticket's parent's. Dropping only
        // the touched ticket while keeping the vouch that described it would
        // shrink a vouched child set to one that no longer contains the open
        // child — a VOUCHED empty set for a parent the server still refuses to
        // finish. And the client cannot narrow it: a ticket event may create a
        // child, move one under a new parent, or close one, and the envelope
        // does not say whose child set changed. A vouch that outlives the child
        // set it described is the pre-check's one route to a false pass.
        completeChildren.clear();
      }
      // A workflow entity's id IS its definition's id: `workflow.defined`
      // refuses `malformed-payload` when `payload.id !== entity.id`, so these
      // two maps are keyed the same way.
      if (envelope.entity.kind === 'workflow') workflows.delete(envelope.entity.id);
    },
  };
}
